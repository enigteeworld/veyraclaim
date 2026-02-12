export type TgUpdate = any;

function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const BOT_TOKEN = required("TELEGRAM_BOT_TOKEN", process.env.TELEGRAM_BOT_TOKEN);

async function tgApi(method: string, payload: any) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Telegram ${method} failed ${res.status}: ${t}`);
  }

  return res.json();
}

export async function tgSendMessage(chatId: number | string, text: string, extra?: any) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  };

  return tgApi("sendMessage", payload);
}

/**
 * Show a "typing…" or "uploading…" indicator in chat.
 * Valid actions: typing, upload_photo, record_video, upload_video, record_voice, upload_voice,
 * record_document, upload_document, choose_sticker, find_location, record_video_note, upload_video_note
 */
export async function tgSendChatAction(
  chatId: number | string,
  action:
    | "typing"
    | "upload_photo"
    | "record_video"
    | "upload_video"
    | "record_voice"
    | "upload_voice"
    | "record_document"
    | "upload_document"
    | "choose_sticker"
    | "find_location"
    | "record_video_note"
    | "upload_video_note"
) {
  // Best-effort: if Telegram fails we don't want the whole webhook to crash.
  try {
    return await tgApi("sendChatAction", { chat_id: chatId, action });
  } catch {
    return null;
  }
}

/**
 * Acknowledge an inline button click (callback_query) so Telegram stops spinning.
 */
export async function tgAnswerCallbackQuery(callbackQueryId: string, text?: string) {
  const payload: any = { callback_query_id: callbackQueryId };
  if (text) payload.text = text;

  // Best-effort
  try {
    return await tgApi("answerCallbackQuery", payload);
  } catch {
    return null;
  }
}

/**
 * Edit an existing bot message (used for inline keyboard UI).
 */
export async function tgEditMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  extra?: any
) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  };

  return tgApi("editMessageText", payload);
}

export function tgGetMessage(update: TgUpdate) {
  return update?.message || update?.edited_message || update?.callback_query?.message || null;
}

export function tgGetText(update: TgUpdate): string | null {
  const msg = tgGetMessage(update);
  const t = msg?.text || msg?.caption || null;
  return typeof t === "string" ? t : null;
}

export function tgGetChatId(update: TgUpdate): number | null {
  const msg = tgGetMessage(update);
  const id = msg?.chat?.id;
  return typeof id === "number" ? id : null;
}

export function tgGetFrom(update: TgUpdate) {
  const msg = tgGetMessage(update);
  return msg?.from || update?.callback_query?.from || null;
}

export function tgGetFromId(update: TgUpdate): number | null {
  const from = tgGetFrom(update);
  const id = from?.id;
  return typeof id === "number" ? id : null;
}

export function tgFormatTier(tier: string) {
  const t = (tier || "").toLowerCase();
  if (t === "gold") return "🟨 Gold";
  if (t === "silver") return "⬜ Silver";
  return "🟫 Bronze";
}

export function tierMeets(minTier: string, userTier: string) {
  const order = { bronze: 1, silver: 2, gold: 3 } as const;
  const a = order[(minTier || "bronze").toLowerCase() as keyof typeof order] || 1;
  const b = order[(userTier || "bronze").toLowerCase() as keyof typeof order] || 1;
  return b >= a;
}

export function shortCode(prefix: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}
