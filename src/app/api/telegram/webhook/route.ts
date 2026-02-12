// src/app/api/telegram/webhook/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchFairScaleScore } from "@/lib/fairscale";
import crypto from "crypto";
import {
  tgSendMessage,
  tgGetChatId,
  tgGetFrom,
  tgGetFromId,
  tgGetText,
  tierMeets,
  tgFormatTier,
  tgAnswerCallbackQuery,
  tgEditMessageText,
  tgSendChatAction,
} from "@/lib/telegram";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const ADMIN_INVITE_CODE = process.env.VEYRA_ADMIN_CODE || "veyra_admin_2026";

// Prefer Telegram file_id (works even when your PUBLIC_BASE_URL is a temporary tunnel)
const WELCOME_BANNER_FILE_ID = process.env.TELEGRAM_WELCOME_BANNER_FILE_ID || "";
// Optional fallback (https URL to hosted image)
const WELCOME_BANNER_URL = process.env.TELEGRAM_WELCOME_BANNER_URL || "";

/**
 * Optional: fallback signing for Mini App links.
 * Purpose: when Telegram WebApp initData isn't available/working, you can still
 * pass uid (+ optional wallet) to prefill UI and/or let your API verify a signature.
 *
 * If TELEGRAM_WEBAPP_FALLBACK_SECRET is not set, links behave exactly like before.
 */
const WEBAPP_FALLBACK_SECRET =
  process.env.TELEGRAM_WEBAPP_FALLBACK_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || "";

function escapeHtml(s: string) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function parseCommand(text: string) {
  const t = (text || "").trim();
  const [rawCmd, ...rest] = t.split(/\s+/);

  // Handle /cmd@BotName (important in groups)
  const cmd = rawCmd?.includes("@") ? rawCmd.split("@")[0] : rawCmd;

  return { cmd: (cmd || "").toLowerCase(), args: rest.join(" ").trim() };
}

function normalizeWallet(input: string) {
  return (input || "").trim();
}

function detectWalletKind(input: string): "evm" | "sol" | null {
  const w = (input || "").trim();
  if (!w || w.includes(" ")) return null;

  const isEvm = /^0x[a-fA-F0-9]{40}$/.test(w);
  if (isEvm) return "evm";

  const isSol = /^[1-9A-HJ-NP-Za-km-z]+$/.test(w) && w.length >= 32 && w.length <= 44;
  if (isSol) return "sol";

  return null;
}

function walletHintText() {
  return [
    "Paste a wallet address to check eligibility:",
    "",
    "🟣 <b>Solana</b>: base58 address (32–44 chars)",
    "🟦 <b>EVM</b>: <code>0x</code> + 40 hex chars",
  ].join("\n");
}

function tierEmoji(tier: string) {
  const t = (tier || "").toLowerCase();
  if (t === "gold") return "🟡";
  if (t === "silver") return "⚪️";
  if (t === "bronze") return "🟤";
  return "🔹";
}

function priorityEmoji(p: string) {
  const v = (p || "").toLowerCase();
  if (v === "high") return "🔥";
  if (v === "medium") return "✨";
  return "➕";
}

function badgesToLines(badges: any[]) {
  return (badges || [])
    .slice(0, 5)
    .map((b) => {
      const tier = (b?.tier || "").toLowerCase();
      const em = tierEmoji(tier);
      const label = escapeHtml(b?.label || "Badge");
      const desc = escapeHtml(b?.description || "");
      return `${em} <b>${label}</b>${desc ? `\n<i>${desc}</i>` : ""}`;
    })
    .join("\n\n");
}

function actionsToLines(actions: any[]) {
  return (actions || [])
    .slice(0, 5)
    .map((a) => {
      const em = priorityEmoji(a?.priority);
      const label = escapeHtml(a?.label || "Action");
      const desc = escapeHtml(a?.description || "");
      const cta = a?.cta ? `\n<i>${escapeHtml(a.cta)}</i>` : "";
      return `${em} <b>${label}</b>\n${desc}${cta}`;
    })
    .join("\n\n");
}

function compactFeatures(features: any) {
  const f = features || {};
  const parts: string[] = [];

  if (typeof f.tx_count === "number") parts.push(`• Tx count: <b>${f.tx_count}</b>`);
  if (typeof f.active_days === "number") parts.push(`• Active days: <b>${f.active_days}</b>`);
  if (typeof f.median_hold_days === "number") parts.push(`• Median hold: <b>${f.median_hold_days}</b>d`);
  if (typeof f.platform_diversity === "number") parts.push(`• Platform diversity: <b>${f.platform_diversity}</b>`);
  if (typeof f.wallet_age_score === "number") parts.push(`• Wallet age score: <b>${f.wallet_age_score}</b>`);
  if (typeof f.no_instant_dumps === "number")
    parts.push(`• No instant dumps: <b>${f.no_instant_dumps ? "Yes" : "No"}</b>`);

  return parts.length ? parts.join("\n") : "";
}

function getPublicBaseUrl() {
  const raw = process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "";
  let u = raw.trim();
  if (!u) return "";
  if (!u.startsWith("http")) u = `https://${u}`;
  u = u.replace(/\/+$/, "");
  return u;
}

function tgAppUrl() {
  const base = getPublicBaseUrl();
  if (!base) return "";
  return `${base}/tg`;
}

function isHttpsUrl(u: string) {
  return typeof u === "string" && u.startsWith("https://");
}

/**
 * Build Mini App URLs with optional uid/wallet prefill + optional signature.
 * This helps in cases where the Mini App isn't reading the saved_wallet correctly
 * (e.g. initData validation issues). Your Mini App can choose to use these params.
 */
function buildMiniAppUrl(baseUrl: string, opts?: { uid?: number; wallet?: string; extra?: Record<string, string> }) {
  const base = (baseUrl || "").trim();
  if (!base) return "";

  const url = new URL(base);
  const uid = opts?.uid;
  const wallet = opts?.wallet ? normalizeWallet(opts.wallet) : "";

  if (uid) url.searchParams.set("uid", String(uid));
  if (wallet) url.searchParams.set("w", wallet);

  if (opts?.extra) {
    for (const [k, v] of Object.entries(opts.extra)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  // Optional HMAC signature over uid:ts (and wallet if present)
  // sig = hex(hmac_sha256(secret, `${uid}:${ts}:${wallet||""}`))
  if (WEBAPP_FALLBACK_SECRET && uid) {
    const ts = String(Date.now());
    const payload = `${uid}:${ts}:${wallet || ""}`;
    const sig = crypto.createHmac("sha256", WEBAPP_FALLBACK_SECRET).update(payload).digest("hex");
    url.searchParams.set("ts", ts);
    url.searchParams.set("sig", sig);
  }

  return url.toString();
}

/**
 * sendPhoto helper:
 * - photo can be a Telegram file_id OR an https URL
 * - file_id is recommended for dev/tunnels
 */
async function tgSendPhoto(chatId: number, photo: string, caption: string, reply_markup?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo, // file_id or URL
      caption,
      parse_mode: "HTML",
      reply_markup,
    }),
  }).catch(() => {});
}

/**
 * ✅ FIX: Some callback queries come from a PHOTO message (welcome banner).
 * That message has NO text, only caption.
 * Calling editMessageText on it causes:
 * "Bad Request: there is no text in the message to edit"
 *
 * So we "smart edit":
 * - If original message has text -> editMessageText
 * - Else -> editMessageCaption
 */
async function tgEditMessageCaption(chatId: number, messageId: number, caption: string, opts?: any) {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/editMessageCaption`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      caption,
      parse_mode: "HTML",
      ...(opts || {}),
    }),
  }).catch(() => {});
}

async function tgEditSmart(chatId: number, messageId: number, textOrCaption: string, opts: any, originalMessage: any) {
  const hasText = typeof originalMessage?.text === "string" && originalMessage.text.length > 0;

  if (hasText) {
    // normal text message
    await tgEditMessageText(chatId, messageId, textOrCaption, opts);
    return;
  }

  // photo/banner messages -> caption edit
  await tgEditMessageCaption(chatId, messageId, textOrCaption, opts);
}

async function upsertTelegramUser(from: any) {
  const telegram_user_id = from.id as number;
  const username = from.username || null;
  const first_name = from.first_name || null;
  const last_name = from.last_name || null;

  await supabaseAdmin.from("telegram_users").upsert(
    {
      telegram_user_id,
      username,
      first_name,
      last_name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );

  return telegram_user_id;
}

async function getUser(telegramUserId: number) {
  const { data } = await supabaseAdmin
    .from("telegram_users")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data || null;
}

async function setState(telegramUserId: number, state_key: string, state_json: any) {
  await supabaseAdmin.from("bot_states").upsert(
    {
      telegram_user_id: telegramUserId,
      state_key,
      state_json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "telegram_user_id" }
  );
}

async function clearState(telegramUserId: number) {
  await supabaseAdmin.from("bot_states").delete().eq("telegram_user_id", telegramUserId);
}

async function getState(telegramUserId: number) {
  const { data } = await supabaseAdmin
    .from("bot_states")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data || null;
}

async function logEvent(telegram_user_id: number | null, kind: string, meta: any = null) {
  await supabaseAdmin.from("bot_events").insert({
    telegram_user_id,
    kind,
    meta,
    created_at: new Date().toISOString(),
  });
}

/**
 * Create a non-shareable form session for the Mini App (matches YOUR schema: public.form_sessions).
 * Returns session id (uuid string) or null.
 */
async function createFormSession(args: { telegramUserId: number; campaignId: string }) {
  try {
    const sid = crypto.randomUUID(); // uuid string
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 mins

    const { error } = await supabaseAdmin.from("form_sessions").insert({
      id: sid,
      campaign_id: args.campaignId,
      telegram_user_id: args.telegramUserId,
      expires_at: expiresAt,
      used_at: null,
      created_at: new Date().toISOString(),
    });

    if (error) return null;
    return sid;
  } catch {
    return null;
  }
}

function mainMenuKeyboard(opts?: { telegramUserId?: number; wallet?: string }) {
  const app = tgAppUrl();
  const appIsHttps = isHttpsUrl(app);

  const appUrl = app ? buildMiniAppUrl(app, { uid: opts?.telegramUserId, wallet: opts?.wallet }) : "";
  const browserUrl = appUrl || app;

  return {
    inline_keyboard: [
      [
        { text: "✅ Check eligibility", callback_data: "menu:check" },
        { text: "🧾 My profile", callback_data: "menu:my" },
      ],
      [
        { text: "🔐 Verify wallet", callback_data: "menu:verify" },
        { text: "ℹ️ Help", callback_data: "menu:help" },
      ],
      ...(browserUrl
        ? [
            [
              ...(appIsHttps ? [{ text: "📲 Open Veyra App", web_app: { url: browserUrl } }] : []),
              { text: "🔗 Open in browser", url: browserUrl },
            ],
          ]
        : []),
    ],
  };
}

function resultKeyboard(wallet: string, opts?: { telegramUserId?: number; savedWallet?: string }) {
  const app = tgAppUrl();
  const appIsHttps = isHttpsUrl(app);

  const rows: any[] = [
    [
      { text: "🔎 More details", callback_data: `details:${wallet}` },
      { text: "🔁 Re-check", callback_data: `recheck:${wallet}` },
    ],
    [{ text: "🔐 Verify this wallet", callback_data: `verifywallet:${wallet}` }],
  ];

  if (app) {
    // If user has a saved wallet, pass it; otherwise pass the wallet being viewed.
    const w = opts?.savedWallet || wallet;
    const url = buildMiniAppUrl(app, { uid: opts?.telegramUserId, wallet: w });

    rows.push([
      ...(appIsHttps ? [{ text: "📲 Open Veyra App", web_app: { url } }] : []),
      { text: "🔗 Open in browser", url },
    ]);
  }

  return { inline_keyboard: rows };
}

function helpText() {
  return [
    "🤖 <b>VeyraBot commands</b>",
    "",
    "✅ <b>Eligibility</b>",
    "• /check &lt;wallet&gt; — check FairScore + tier",
    "• /check — prompts you to paste a wallet",
    "• /verify — save your wallet (DM recommended)",
    "• /my — show your saved wallet + last tier",
    "",
    "📲 <b>Mini App</b>",
    "• Tap <b>Open Veyra App</b> to use the premium UI inside Telegram.",
    "",
    "🎯 <b>Campaigns</b>",
    "• /join &lt;CODE&gt; — join allowlist/drop",
    "• /apply &lt;CODE&gt; — apply to ambassador campaign",
    "",
    "🛠 <b>Admins</b>",
    "• /admin &lt;INVITE_CODE&gt; — open admin mini app (create campaigns)",
  ].join("\n");
}

function buildScoreBody(wallet: string, kind: "evm" | "sol", score: any) {
  const badges = badgesToLines(score.badges || []);
  const actions = actionsToLines(score.actions || []);
  const features = compactFeatures(score.features || {});

  const header = `🧾 <b>Veyra Reputation Check</b>\n${kind === "sol" ? "🟣 Solana wallet" : "🟦 EVM wallet"}`;

  const core = [
    `Wallet: <code>${escapeHtml(wallet)}</code>`,
    `Tier: <b>${tierEmoji(score.tier)} ${escapeHtml(tgFormatTier(score.tier))}</b>`,
    `FairScore: <b>${Number(score.fairscore).toFixed(1)}</b>`,
    score.timestamp ? `Updated: <i>${escapeHtml(String(score.timestamp))}</i>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const sections = [
    header,
    core,
    `🏅 <b>Badges</b>\n${badges || "<i>No badges returned yet.</i>"}`,
    features ? `📦 <b>Feature breakdown</b>\n${features}` : "",
    `🚀 <b>Boost ideas</b>\n${actions || "<i>No recommendations returned yet.</i>"}`,
  ].filter(Boolean);

  return sections.join("\n\n");
}

async function runEligibilityCheck(
  chatId: number,
  telegramUserId: number,
  walletRaw: string,
  mode: "send" | "edit" = "send",
  editMessageId?: number
) {
  const wallet = normalizeWallet(walletRaw);
  const kind = detectWalletKind(wallet);

  if (!kind) {
    const msg = "That doesn’t look like a valid wallet.\n\n" + walletHintText();
    if (mode === "edit" && editMessageId) {
      await tgEditMessageText(chatId, editMessageId, msg, { reply_markup: mainMenuKeyboard({ telegramUserId }) });
    } else {
      await tgSendMessage(chatId, msg, { reply_markup: mainMenuKeyboard({ telegramUserId }) });
    }
    return;
  }

  await tgSendChatAction(chatId, "typing");

  const score = await fetchFairScaleScore(wallet);

  await setState(telegramUserId, "last_check", {
    wallet,
    kind,
    data: score,
    checked_at: new Date().toISOString(),
  });

  const u = await getUser(telegramUserId);
  if (u?.saved_wallet && u.saved_wallet === wallet) {
    await supabaseAdmin
      .from("telegram_users")
      .update({
        last_known_tier: score.tier,
        last_known_fairscore: score.fairscore,
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_user_id", telegramUserId);
  }

  await logEvent(telegramUserId, "check", { wallet, kind, tier: score.tier, fairscore: score.fairscore });

  const body = buildScoreBody(wallet, kind, score);

  const savedWallet = u?.saved_wallet || "";
  const keyboard = resultKeyboard(wallet, { telegramUserId, savedWallet });

  if (mode === "edit" && editMessageId) {
    await tgEditMessageText(chatId, editMessageId, body, { reply_markup: keyboard });
  } else {
    await tgSendMessage(chatId, body, { reply_markup: keyboard });
  }
}

async function handleWizardMessage(chatId: number, telegramUserId: number, text: string, state: any) {
  const stateKey = state.state_key;

  if (stateKey === "await_wallet_check") {
    const wallet = normalizeWallet(text);
    await clearState(telegramUserId);

    await tgSendChatAction(chatId, "typing");
    await tgSendMessage(chatId, "⏳ Checking your wallet…");

    await runEligibilityCheck(chatId, telegramUserId, wallet);
    return;
  }

  if (stateKey === "await_wallet_verify") {
    const wallet = normalizeWallet(text);
    const kind = detectWalletKind(wallet);
    if (!kind) {
      await tgSendMessage(chatId, "That wallet looks invalid.\n\n" + walletHintText(), {
        reply_markup: mainMenuKeyboard({ telegramUserId }),
      });
      return;
    }

    await tgSendChatAction(chatId, "typing");
    await tgSendMessage(chatId, "⏳ Verifying wallet…");

    const score = await fetchFairScaleScore(wallet);

    await supabaseAdmin
      .from("telegram_users")
      .update({
        saved_wallet: wallet,
        last_known_tier: score.tier,
        last_known_fairscore: score.fairscore,
        updated_at: new Date().toISOString(),
      })
      .eq("telegram_user_id", telegramUserId);

    await clearState(telegramUserId);
    await logEvent(telegramUserId, "verify", { wallet, kind, tier: score.tier, fairscore: score.fairscore });

    const msg = [
      "✅ <b>Wallet saved</b>",
      "",
      buildScoreBody(wallet, kind, score),
      "",
      "Next:",
      "• /my — profile",
      "• /join CODE — allowlist/drop",
      "• /apply CODE — ambassador",
      "",
      tgAppUrl() ? "📲 Tip: Tap <b>Open Veyra App</b> for the premium UI." : "",
    ]
      .filter(Boolean)
      .join("\n");

    await tgSendMessage(chatId, msg, { reply_markup: mainMenuKeyboard({ telegramUserId, wallet }) });
    return;
  }

  await clearState(telegramUserId);
  await tgSendMessage(chatId, "State reset. Tap a button or type /help", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
}

/** Pull text in a more resilient way than tgGetText alone (helps when Telegram sends caption/odd payloads). */
function getTextFallback(update: any): string {
  const t = tgGetText(update);
  if (t) return t;

  // Fallbacks (some Telegram updates come as caption-only, or other formats)
  const t2 =
    update?.message?.text ||
    update?.message?.caption ||
    update?.edited_message?.text ||
    update?.edited_message?.caption ||
    "";
  return typeof t2 === "string" ? t2 : "";
}

export async function POST(req: Request) {
  try {
    if (WEBHOOK_SECRET) {
      const secret = req.headers.get("x-telegram-bot-api-secret-token") || "";
      if (secret !== WEBHOOK_SECRET) {
        return NextResponse.json({ ok: false, error: "bad secret" }, { status: 401 });
      }
    }

    const update = await req.json();

    /**
     * ==============================
     * TEMP DEBUG LOGGERS (REMOVE)
     * ==============================
     * 1) WebApp initData presence (your existing logger)
     * 2) Photo file_id logger (NEW) -> this is what you need for TELEGRAM_WELCOME_BANNER_FILE_ID
     *
     * Remove this whole block when done.
     */
    try {
      const maybeInit =
        update?.message?.web_app_data?.data ||
        update?.callback_query?.message?.web_app_data?.data ||
        null;

      const kind = update?.callback_query
        ? "callback_query"
        : update?.message
          ? "message"
          : update?.edited_message
            ? "edited_message"
            : "other";

      console.log("[VEYRABOT_DEBUG] kind=", kind);
      console.log("[VEYRABOT_DEBUG] has_web_app_data=", !!update?.message?.web_app_data);
      console.log("[VEYRABOT_DEBUG] web_app_data_length=", maybeInit ? String(maybeInit).length : 0);

      // ✅ NEW: log photo file_id (largest size) when user uploads a picture
      const photos = update?.message?.photo || update?.edited_message?.photo || null;
      if (Array.isArray(photos) && photos.length) {
        const best = photos[photos.length - 1];
        console.log("[VEYRABOT_DEBUG] photo_received=", true);
        console.log("[VEYRABOT_DEBUG] photo_file_id=", best?.file_id || "");
        console.log("[VEYRABOT_DEBUG] photo_unique_id=", best?.file_unique_id || "");
        console.log("[VEYRABOT_DEBUG] photo_size=", `${best?.width || "?"}x${best?.height || "?"}`);
      }
    } catch {}
    /**
     * ========= END LOGGERS =========
     */

    // Callback buttons
    if (update?.callback_query) {
      const cq = update.callback_query;
      const chatId = cq?.message?.chat?.id;
      const messageId = cq?.message?.message_id;
      const from = cq?.from;
      const telegramUserId = from?.id;
      const data = (cq?.data || "").toString();

      if (!chatId || !messageId || !telegramUserId) return NextResponse.json({ ok: true });

      await upsertTelegramUser(from);
      await tgAnswerCallbackQuery(cq.id);

      const origMsg = cq?.message;

      if (data === "menu:help") {
        await tgEditSmart(chatId, messageId, helpText(), { reply_markup: mainMenuKeyboard({ telegramUserId }) }, origMsg);
        return NextResponse.json({ ok: true });
      }

      if (data === "menu:verify") {
        await setState(telegramUserId, "await_wallet_verify", { startedAt: Date.now() });
        await tgEditSmart(
          chatId,
          messageId,
          "🔐 <b>Verify wallet</b>\n\n" + walletHintText(),
          { reply_markup: mainMenuKeyboard({ telegramUserId }) },
          origMsg
        );
        return NextResponse.json({ ok: true });
      }

      if (data === "menu:my") {
        const u = await getUser(telegramUserId);
        if (!u?.saved_wallet) {
          await tgEditSmart(
            chatId,
            messageId,
            "No wallet saved yet. Tap 🔐 Verify wallet.",
            { reply_markup: mainMenuKeyboard({ telegramUserId }) },
            origMsg
          );
          return NextResponse.json({ ok: true });
        }

        const msg = [
          "🧾 <b>Your profile</b>",
          `Wallet: <code>${escapeHtml(u.saved_wallet)}</code>`,
          u.last_known_tier
            ? `Tier: <b>${tierEmoji(u.last_known_tier)} ${escapeHtml(tgFormatTier(u.last_known_tier))}</b>`
            : "",
          u.last_known_fairscore ? `FairScore: <b>${Number(u.last_known_fairscore).toFixed(1)}</b>` : "",
        ]
          .filter(Boolean)
          .join("\n");

        await tgEditSmart(chatId, messageId, msg, { reply_markup: mainMenuKeyboard({ telegramUserId, wallet: u.saved_wallet }) }, origMsg);
        return NextResponse.json({ ok: true });
      }

      if (data === "menu:check") {
        await setState(telegramUserId, "await_wallet_check", { startedAt: Date.now() });
        await tgEditSmart(
          chatId,
          messageId,
          "✅ <b>Eligibility check</b>\n\n" + walletHintText(),
          { reply_markup: mainMenuKeyboard({ telegramUserId }) },
          origMsg
        );
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith("recheck:")) {
        const wallet = data.split("recheck:")[1] || "";
        await tgEditSmart(
          chatId,
          messageId,
          "⏳ <b>Re-checking…</b>\nHold on a sec.",
          { reply_markup: resultKeyboard(wallet, { telegramUserId }) },
          origMsg
        );
        await tgSendChatAction(chatId, "typing");
        await runEligibilityCheck(chatId, telegramUserId, wallet, "edit", messageId);
        return NextResponse.json({ ok: true });
      }

      if (data.startsWith("verifywallet:")) {
        const wallet = data.split("verifywallet:")[1] || "";
        const kind = detectWalletKind(wallet);
        if (!kind) {
          await tgEditSmart(
            chatId,
            messageId,
            "That wallet doesn’t look valid.\n\n" + walletHintText(),
            { reply_markup: mainMenuKeyboard({ telegramUserId }) },
            origMsg
          );
          return NextResponse.json({ ok: true });
        }

        await tgSendChatAction(chatId, "typing");
        await tgEditSmart(chatId, messageId, "⏳ <b>Saving wallet…</b>", { reply_markup: mainMenuKeyboard({ telegramUserId }) }, origMsg);

        const score = await fetchFairScaleScore(wallet);

        await supabaseAdmin
          .from("telegram_users")
          .update({
            saved_wallet: wallet,
            last_known_tier: score.tier,
            last_known_fairscore: score.fairscore,
            updated_at: new Date().toISOString(),
          })
          .eq("telegram_user_id", telegramUserId);

        await logEvent(telegramUserId, "verify", { wallet, kind, tier: score.tier, fairscore: score.fairscore });

        const msg = ["✅ <b>Wallet saved</b>", "", buildScoreBody(wallet, kind, score)].join("\n");
        await tgEditSmart(chatId, messageId, msg, { reply_markup: mainMenuKeyboard({ telegramUserId, wallet }) }, origMsg);

        return NextResponse.json({ ok: true });
      }

      if (data.startsWith("details:")) {
        const wallet = data.split("details:")[1] || "";

        const st = await getState(telegramUserId);
        const last = st?.state_key === "last_check" ? st.state_json : null;
        const payload = last?.wallet === wallet ? last.data : null;

        if (!payload) {
          await tgEditSmart(
            chatId,
            messageId,
            "No cached details found. Tap 🔁 Re-check.",
            { reply_markup: resultKeyboard(wallet, { telegramUserId }) },
            origMsg
          );
          return NextResponse.json({ ok: true });
        }

        const allFeatures = payload.features || {};
        const featureLines = Object.entries(allFeatures)
          .slice(0, 18)
          .map(([k, v]) => `• <b>${escapeHtml(k)}</b>: ${escapeHtml(String(v))}`)
          .join("\n");

        const msg = [
          "🔎 <b>More details</b>",
          `Wallet: <code>${escapeHtml(wallet)}</code>`,
          `Tier: <b>${tierEmoji(payload.tier)} ${escapeHtml(tgFormatTier(payload.tier))}</b>`,
          `FairScore: <b>${Number(payload.fairscore).toFixed(1)}</b>`,
          payload.timestamp ? `Updated: <i>${escapeHtml(String(payload.timestamp))}</i>` : "",
          "",
          `🏅 <b>Badges</b>\n${payload.badges?.length ? badgesToLines(payload.badges) : "<i>No badges returned yet.</i>"}`,
          "",
          `📦 <b>Feature breakdown</b>\n${featureLines || "No feature data available."}`,
          "",
          `🚀 <b>Boost ideas</b>\n${payload.actions?.length ? actionsToLines(payload.actions) : "<i>No recommendations returned yet.</i>"}`,
        ]
          .filter((x) => x !== "")
          .join("\n");

        await tgEditSmart(chatId, messageId, msg, { reply_markup: resultKeyboard(wallet, { telegramUserId }) }, origMsg);
        return NextResponse.json({ ok: true });
      }

      await tgEditSmart(chatId, messageId, "Tap a button or type /help", { reply_markup: mainMenuKeyboard({ telegramUserId }) }, origMsg);
      return NextResponse.json({ ok: true });
    }

    // Normal message updates
    const chatId = tgGetChatId(update);
    const from = tgGetFrom(update);
    const telegramUserId = tgGetFromId(update);

    // ✅ IMPORTANT: use resilient text fetch so /start doesn’t get ignored in odd payloads
    const text = getTextFallback(update);

    if (!chatId || !from || !telegramUserId) return NextResponse.json({ ok: true });

    await upsertTelegramUser(from);

    const existingState = await getState(telegramUserId);
    if (existingState && text) {
      await handleWizardMessage(chatId, telegramUserId, text, existingState);
      return NextResponse.json({ ok: true });
    }

    // If no text, still handle photo uploads gracefully (don’t just say “tap /help”)
    if (!text) {
      const photos = update?.message?.photo || update?.edited_message?.photo || null;
      if (Array.isArray(photos) && photos.length) {
        // We already logged the file_id in the TEMP DEBUG LOGGERS block.
        await tgSendMessage(
          chatId,
          [
            "📸 <b>Image received</b>",
            "",
            "If you’re trying to set the welcome banner:",
            "1) Check your server logs for <code>[VEYRABOT_DEBUG] photo_file_id</code>",
            "2) Put it in <code>.env.local</code> as <code>TELEGRAM_WELCOME_BANNER_FILE_ID=...</code>",
            "3) Restart <code>npm run dev</code>",
            "4) Run /start again",
          ].join("\n"),
          { reply_markup: mainMenuKeyboard({ telegramUserId }) }
        );
        return NextResponse.json({ ok: true });
      }

      await tgSendMessage(chatId, "Tap a button or type /help", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
      return NextResponse.json({ ok: true });
    }

    // Auto-detect: wallet pasted directly
    const maybeKind = detectWalletKind(text.trim());
    if (maybeKind) {
      await tgSendChatAction(chatId, "typing");
      await tgSendMessage(chatId, "⏳ Checking your wallet…");
      await runEligibilityCheck(chatId, telegramUserId, text.trim());
      return NextResponse.json({ ok: true });
    }

    const { cmd, args } = parseCommand(text);

    if (cmd === "/start") {
      const app = tgAppUrl();
      const u = await getUser(telegramUserId);
      const savedWallet = u?.saved_wallet || "";

      // ✅ Keep the exact welcome phrasing you requested
      const caption = [
        "👋 <b>Welcome to VeyraBot</b>",
        "Reputation-gated drops, allowlists, and ambassador intake.",
        "",
        "Try:",
        "• /check",
        "• /verify",
        "• /my",
        "• /help",
        "",
        app ? "📲 Tip: Tap <b>Open Veyra App</b> for the premium UI." : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Banner precedence: file_id > env URL > hosted /tg-banner.jpg
      const base = getPublicBaseUrl();
      const hostedFallback = base ? `${base}/tg-banner.jpg` : "";
      const banner = WELCOME_BANNER_FILE_ID || WELCOME_BANNER_URL || hostedFallback;

      const kb = mainMenuKeyboard({ telegramUserId, wallet: savedWallet });

      if (banner) {
        await tgSendPhoto(chatId, banner, caption, kb);
      } else {
        await tgSendMessage(chatId, caption, { reply_markup: kb });
      }

      return NextResponse.json({ ok: true });
    }

    if (cmd === "/help") {
      await tgSendMessage(chatId, helpText(), { reply_markup: mainMenuKeyboard({ telegramUserId }) });
      return NextResponse.json({ ok: true });
    }

    // ADMIN: /admin INVITE_CODE -> open mini app in admin mode
    if (cmd === "/admin") {
      const code = args.trim();
      if (!code) {
        await tgSendMessage(chatId, "Usage: <code>/admin INVITE_CODE</code>", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }
      if (code !== ADMIN_INVITE_CODE) {
        await tgSendMessage(chatId, "❌ Invalid admin code.", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      const app = tgAppUrl();
      if (!app) {
        await tgSendMessage(chatId, "Admin mode requires PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL to be set.", {
          reply_markup: mainMenuKeyboard({ telegramUserId }),
        });
        return NextResponse.json({ ok: true });
      }

      const u = await getUser(telegramUserId);
      const savedWallet = u?.saved_wallet || "";

      // Build an admin URL with uid/wallet prefill + admin=1
      const adminUrl = buildMiniAppUrl(app, {
        uid: telegramUserId,
        wallet: savedWallet,
        extra: { admin: "1" },
      });

      const appIsHttps = isHttpsUrl(app);

      const kb: any = {
        inline_keyboard: [
          [
            ...(appIsHttps ? [{ text: "🛠 Open Admin Panel", web_app: { url: adminUrl } }] : []),
            { text: "🔗 Open in browser", url: adminUrl },
          ],
        ],
      };

      await logEvent(telegramUserId, "admin_start", { mode: "miniapp", ok: true });

      await tgSendMessage(
        chatId,
        ["✅ <b>Admin unlocked</b>", "Tap below to open the admin mini app and create campaigns."].join("\n"),
        { reply_markup: kb }
      );
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/verify") {
      await setState(telegramUserId, "await_wallet_verify", { startedAt: Date.now() });
      await tgSendMessage(chatId, "🔐 <b>Verify wallet</b>\n\n" + walletHintText(), { reply_markup: mainMenuKeyboard({ telegramUserId }) });
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/my") {
      const u = await getUser(telegramUserId);
      if (!u?.saved_wallet) {
        await tgSendMessage(chatId, "No wallet saved yet. Use /verify (DM recommended).", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      await tgSendMessage(
        chatId,
        [
          "🧾 <b>Your profile</b>",
          `Wallet: <code>${escapeHtml(u.saved_wallet)}</code>`,
          u.last_known_tier ? `Tier: <b>${tierEmoji(u.last_known_tier)} ${escapeHtml(tgFormatTier(u.last_known_tier))}</b>` : "",
          u.last_known_fairscore ? `FairScore: <b>${Number(u.last_known_fairscore).toFixed(1)}</b>` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        { reply_markup: mainMenuKeyboard({ telegramUserId, wallet: u.saved_wallet }) }
      );
      return NextResponse.json({ ok: true });
    }

    if (cmd === "/check") {
      const wallet = normalizeWallet(args);

      if (!wallet) {
        await setState(telegramUserId, "await_wallet_check", { startedAt: Date.now() });
        await tgSendMessage(chatId, "✅ <b>Eligibility check</b>\n\n" + walletHintText(), {
          reply_markup: mainMenuKeyboard({ telegramUserId }),
        });
        return NextResponse.json({ ok: true });
      }

      await tgSendChatAction(chatId, "typing");
      await tgSendMessage(chatId, "⏳ Checking your wallet…");
      await runEligibilityCheck(chatId, telegramUserId, wallet);
      return NextResponse.json({ ok: true });
    }

    // USER: /join CODE
    if (cmd === "/join") {
      const code = args.trim();
      if (!code) {
        await tgSendMessage(chatId, "Usage: <code>/join CODE</code>", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      const { data: camp } = await supabaseAdmin.from("campaigns").select("*").eq("code", code).maybeSingle();
      if (!camp) {
        await tgSendMessage(chatId, `Campaign not found: <code>${escapeHtml(code)}</code>`, { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      if (camp.type === "ambassador") {
        await tgSendMessage(chatId, `That is an ambassador campaign. Use: <code>/apply ${escapeHtml(camp.code)}</code>`, {
          reply_markup: mainMenuKeyboard({ telegramUserId }),
        });
        return NextResponse.json({ ok: true });
      }

      const u = await getUser(telegramUserId);
      const wallet = u?.saved_wallet;
      if (!wallet) {
        await tgSendMessage(chatId, "Verify your wallet first: /verify", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      await tgSendChatAction(chatId, "typing");
      await tgSendMessage(chatId, "⏳ Checking eligibility…");

      const score = await fetchFairScaleScore(wallet);

      if (!tierMeets(camp.min_tier, score.tier)) {
        await tgSendMessage(
          chatId,
          [
            "🔒 <b>Not eligible</b>",
            `Campaign requires: <b>${escapeHtml(String(camp.min_tier))}</b>`,
            `Your tier: <b>${tierEmoji(score.tier)} ${escapeHtml(tgFormatTier(score.tier))}</b>`,
          ].join("\n"),
          { reply_markup: mainMenuKeyboard({ telegramUserId, wallet }) }
        );
        return NextResponse.json({ ok: true });
      }

      if (camp.max_slots) {
        const { count } = await supabaseAdmin
          .from("campaign_entries")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", camp.id);
        if ((count ?? 0) >= camp.max_slots) {
          await tgSendMessage(chatId, "⛔ This campaign is full (max slots reached).", { reply_markup: mainMenuKeyboard({ telegramUserId, wallet }) });
          return NextResponse.json({ ok: true });
        }
      }

      const { error } = await supabaseAdmin.from("campaign_entries").insert({
        campaign_id: camp.id,
        telegram_user_id: telegramUserId,
        wallet,
        tier: score.tier,
        fairscore: score.fairscore,
        badges: score.badges || null,
        proof_links: null,
        answers: null,
      });

      if (error) {
        await tgSendMessage(chatId, `Couldn’t join (maybe already joined): <code>${escapeHtml(error.message)}</code>`, {
          reply_markup: mainMenuKeyboard({ telegramUserId, wallet }),
        });
        return NextResponse.json({ ok: true });
      }

      await logEvent(telegramUserId, "join", { code, wallet, tier: score.tier, fairscore: score.fairscore });

      await tgSendMessage(
        chatId,
        [
          "✅ <b>Joined</b>",
          `Campaign: <code>${escapeHtml(camp.code)}</code>`,
          `Wallet: <code>${escapeHtml(wallet)}</code>`,
          `Tier: <b>${tierEmoji(score.tier)} ${escapeHtml(tgFormatTier(score.tier))}</b>`,
          `FairScore: <b>${Number(score.fairscore).toFixed(1)}</b>`,
        ].join("\n"),
        { reply_markup: mainMenuKeyboard({ telegramUserId, wallet }) }
      );

      return NextResponse.json({ ok: true });
    }

    // USER: /apply CODE (creates a form_sessions row + opens Mini App with sid)
    if (cmd === "/apply") {
      const code = args.trim();
      if (!code) {
        await tgSendMessage(chatId, "Usage: <code>/apply CODE</code>", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      const { data: camp } = await supabaseAdmin.from("campaigns").select("*").eq("code", code).maybeSingle();
      if (!camp) {
        await tgSendMessage(chatId, `Campaign not found: <code>${escapeHtml(code)}</code>`, { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      if (camp.type !== "ambassador") {
        await tgSendMessage(chatId, `That is not an ambassador campaign. Use: <code>/join ${escapeHtml(camp.code)}</code>`, {
          reply_markup: mainMenuKeyboard({ telegramUserId }),
        });
        return NextResponse.json({ ok: true });
      }

      const u = await getUser(telegramUserId);
      const wallet = u?.saved_wallet;
      if (!wallet) {
        await tgSendMessage(chatId, "Verify your wallet first: /verify", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
        return NextResponse.json({ ok: true });
      }

      await tgSendChatAction(chatId, "typing");
      await tgSendMessage(chatId, "⏳ Checking eligibility…");

      const score = await fetchFairScaleScore(wallet);

      if (!tierMeets(camp.min_tier, score.tier)) {
        await tgSendMessage(
          chatId,
          [
            "🔒 <b>Not eligible</b>",
            `This ambassador campaign requires: <b>${escapeHtml(String(camp.min_tier))}</b>`,
            `Your tier: <b>${tierEmoji(score.tier)} ${escapeHtml(tgFormatTier(score.tier))}</b>`,
          ].join("\n"),
          { reply_markup: mainMenuKeyboard({ telegramUserId, wallet }) }
        );
        return NextResponse.json({ ok: true });
      }

      const app = tgAppUrl();
      if (!app) {
        await tgSendMessage(chatId, "Mini App requires PUBLIC_BASE_URL / NEXT_PUBLIC_APP_URL.", { reply_markup: mainMenuKeyboard({ telegramUserId, wallet }) });
        return NextResponse.json({ ok: true });
      }

      const sid = await createFormSession({ telegramUserId, campaignId: camp.id });

      if (!sid) {
        await tgSendMessage(chatId, "Could not start application session. Check your <code>form_sessions</code> table.", {
          reply_markup: mainMenuKeyboard({ telegramUserId, wallet }),
        });
        return NextResponse.json({ ok: true });
      }

      await logEvent(telegramUserId, "apply_start", {
        code: camp.code,
        wallet,
        tier: score.tier,
        fairscore: score.fairscore,
        sid,
      });

      // Include sid + uid/wallet prefill (and optional signature)
      const urlWithSid = buildMiniAppUrl(app, {
        uid: telegramUserId,
        wallet,
        extra: { sid: encodeURIComponent(sid) },
      });

      const appIsHttps = isHttpsUrl(app);

      const kb: any = {
        inline_keyboard: [
          [
            ...(appIsHttps ? [{ text: "📝 Open Application", web_app: { url: urlWithSid } }] : []),
            { text: "🔗 Open in browser", url: urlWithSid },
          ],
        ],
      };

      await tgSendMessage(
        chatId,
        [
          "✅ <b>Eligible</b>",
          `Campaign: <code>${escapeHtml(camp.code)}</code>`,
          "",
          "Tap below to open your private application form.",
          "<i>(This link is tied to your Telegram account and won’t work for others.)</i>",
        ].join("\n"),
        { reply_markup: kb }
      );

      return NextResponse.json({ ok: true });
    }

    await tgSendMessage(chatId, "Unknown command. Tap a button or type /help", { reply_markup: mainMenuKeyboard({ telegramUserId }) });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("telegram webhook error:", e?.message || e);
    return NextResponse.json({ ok: true });
  }
}
