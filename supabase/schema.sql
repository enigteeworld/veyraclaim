-- VeyraBot (Telegram) schema

create table if not exists public.telegram_users (
  telegram_user_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  saved_wallet text,
  last_known_tier text,
  last_known_fairscore numeric,
  updated_at timestamptz default now()
);

create table if not exists public.bot_states (
  telegram_user_id bigint primary key references public.telegram_users(telegram_user_id) on delete cascade,
  state_key text not null,
  state_json jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null, -- drop | allowlist | ambassador | gated_group
  title text not null,
  description text,
  min_tier text not null, -- bronze | silver | gold
  max_slots int,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by_telegram_user_id bigint not null,
  created_at timestamptz default now()
);

create table if not exists public.campaign_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  telegram_user_id bigint not null references public.telegram_users(telegram_user_id) on delete cascade,
  wallet text not null,
  tier text not null,
  fairscore numeric not null,
  badges jsonb,
  proof_links jsonb,
  answers jsonb,
  created_at timestamptz default now(),
  unique (campaign_id, wallet)
);

create table if not exists public.gated_groups (
  id uuid primary key default gen_random_uuid(),
  group_chat_id bigint unique not null,
  title text,
  min_tier text not null,
  created_by_telegram_user_id bigint not null,
  created_at timestamptz default now()
);

create table if not exists public.bot_events (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint,
  kind text not null, -- check | verify | apply | join | admin | export
  meta jsonb,
  created_at timestamptz default now()
);

-- Needed for gen_random_uuid()
-- In Supabase, pgcrypto is usually available; if not:
create extension if not exists pgcrypto;
