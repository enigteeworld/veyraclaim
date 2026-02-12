# Veyra — Credibility-Gated Campaigns (Web + Telegram Mini App + Bot)

Veyra is a campaign and rewards layer built to survive the real world: bots, wallet farms, duplicate submissions, messy spreadsheets, and “who actually qualified?” drama.

The core idea is simple:

- **Telegram is the “source of truth” for identity + access**
- **The web app is the premium UX layer for campaigns and credibility**
- **FairScore (wallet reputation) helps decide eligibility and weighting**
- **Ops is first-class**: review flows, duplicate protection, clean exports, receipts later

If you’re a project running an allowlist, bounty, drop, or ambassador program, Veyra is meant to be the cleaner replacement for:
- Google Forms
- random Discord DMs
- spreadsheets with duplicates
- fake engagement
- “we’ll manually filter it later” (which never scales)

---

## What Veyra is used for

Veyra is designed to support multiple campaign types without changing the mental model:

### 1) Bounties
Run tasks with criteria, limit submissions per wallet, and export a clean report for payouts.

### 2) Wait-list gating
Projects can gate early access using credibility tiers (e.g., Silver+) and reduce fake signups.

### 3) Drop lists / allowlists
Same as waitlists, but with stricter windows, caps, and optional “receipt” logging.

### 4) Ambassador programs
Applications + lightweight verification + credibility weighting for more reliable contributors.

### 5) Partner / community programs
Shared flows, consistent reporting, and less spam.

---

## Why Telegram is the core source of truth

Telegram gives Veyra something the open web doesn’t: **a strong, stable identity anchor**.

Telegram identity is:
- hard to mass-fake at scale compared to basic web forms
- consistent across devices
- excellent for “invite code” based access
- perfect for operational workflows (admins + users in the same system)

So Veyra uses Telegram for:
- who the user is (Telegram user identity)
- access to the mini app (invite / campaign codes)
- admin actions (creation, unlocking, control flows)
- future notifications and follow-ups

The web experience stays premium (fast UI, dashboards, credibility views), but Telegram remains the identity backbone.

---

## High level architecture

Veyra has three main parts:

1) **Web App (Next.js)**
   - Landing page, credibility UI, campaign browsing
   - “How it works” page
   - Admin surfaces (review/export)
   - API routes used by both web + Telegram flows

2) **Telegram Bot**
   - User flows: start, verify wallet, join campaigns, status
   - Admin flows: unlock admin, create campaign, manage ops
   - Becomes the “trusted entry” for access and identity

3) **Telegram Mini App**
   - Premium UX for campaign application and profile interaction
   - Users enter with invite codes / campaign codes
   - Admins enter with a separate admin invite code (higher privileges)
   - Reads identity from Telegram + loads the correct experience

---

## The “human” product story (what problem we’re really solving)

Campaigns fail for the same reasons over and over:

- “We got 12,000 signups, but 9,000 were bots”
- “People submitted multiple times with different wallets”
- “We don’t know who to trust”
- “The spreadsheet is unusable”
- “We can’t prove how we made decisions”
- “We don’t want to build an ops tool, we just want results”

Veyra is built to make campaigns:
- **cleaner** (less garbage data)
- **fairer** (credibility-aware access and weighting)
- **easier to run** (ops workflows baked in)
- **exportable** (professional output every time)

---

## Core concepts (so the project makes sense)

### FairScore
FairScore is a reputation signal for a wallet. Think of it as:  
> “How likely is this wallet to be a real, non-farm participant?”

We use it to:
- assign **tiers** (Bronze / Silver / Gold…)
- gate campaigns (e.g., “Silver+ only”)
- weight reward allocation (e.g., Gold gets 1.6× weight)

FairScore matters because it turns a campaign from “first come first served (and farmed)” into:
- access control + trust weighting
- less spam
- better outcomes

### Codes (invite codes, campaign codes, admin codes)
Codes make onboarding simple and scalable:
- Admins get an **admin invite code**
- Users apply to campaigns via a **campaign code**
- Projects can post the campaign code publicly (X/Twitter, Discord, Telegram) and the system does the filtering

This makes Veyra “shareable” and viral in the right way:
- **Project posts a code**
- Eligible people apply
- Ops stays clean

### Duplicate prevention
At the product level: “one submission per wallet per campaign”.

The goal isn’t to punish people — it’s to keep campaigns sane.  
Duplicate blocking is foundational if you ever plan to export payouts.

---

## User flows

### A) User: verify wallet (Telegram -> Web/Mini App)
1. User opens the bot
2. Bot asks user to verify/connect a wallet
3. Bot stores the verified wallet for that Telegram user
4. Mini App / Web reads the verified wallet and loads:
   - FairScore
   - tier
   - badges
   - eligible campaigns

**Why this matters:** users don’t have to re-enter wallet addresses every time.  
The bot acts as the trusted wallet binding step.

### B) User: join a campaign via invite code (Telegram Mini App)
1. Project posts a campaign code (e.g. on X)
2. User opens the Mini App and enters the campaign code
3. Mini App checks:
   - has verified wallet?
   - is user eligible (tier requirements)?
   - has user already submitted?
   - is campaign live?
4. If eligible, user submits application
5. Submission becomes available in admin review + export

### C) User: view credibility and “boost actions”
On the web side, users can see:
- FairScore
- tier and multiplier
- badges (reputation signals)
- recommended actions (ways to improve score over time)

This helps make the system feel transparent instead of arbitrary.

---

## Admin flows

### A) Admin: access Mini App via invite code
Admins don’t just “appear” — access is controlled.

1. Admin receives an **admin invite code**
2. Admin opens the Mini App and enters the admin invite code
3. Mini App unlocks admin views:
   - create campaign
   - view campaigns
   - view applicants
   - export CSV

### B) Admin: create a campaign (Bot + Mini App)
The admin flow is designed to be simple enough to run from Telegram:
- create campaign name
- set window
- set tier requirements
- caps / eligibility rules
- generate campaign code

Then the project can post the campaign code publicly.

### C) Admin: review and export
Admins can:
- view applications
- review answers
- export a clean CSV (even if it’s only 1 applicant — it should still look professional)

---

## Monetization (what we plan after the pilot)

Veyra is designed to be a paid product.

A few pricing models that fit the “campaign ops” category:

### Option 1: Per campaign fee (simple)
- Projects pay a fee per campaign created
- Includes review + export features
- Add-ons: receipts, advanced gating, custom branding

### Option 2: Subscription tiers
- Starter: limited campaigns/month + basic export
- Growth: more campaigns + better analytics + receipts
- Pro: team access, better controls, integrations

### Option 3: Pay per eligible applicant (usage based)
- Cheaper upfront for projects
- Scales with real campaign value
- Encourages Veyra to filter spam effectively

### Option 4: Hybrid
- Small platform fee + per campaign + add-ons

Longer term, Veyra can evolve into:
- a full “trust rails” layer for community programs
- reusable reputation scoring across multiple campaigns
- verification + receipts for audits
- reputation portability between ecosystems

---

## Project setup (local development)

### Requirements
- Node.js (LTS recommended)
- npm / pnpm / yarn (whatever the repo uses)
- Telegram bot token
- Any DB / storage keys you’re using (e.g. Supabase)

### Install
```bash
npm install
