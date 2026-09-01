-- ============================================================================
-- ONBOARDING MACHINE — one-shot database setup
-- ============================================================================
-- HOW TO USE (once, ~1 minute):
--   1. Supabase → SQL Editor → New query.
--   2. If you want the "rename anytime" poller, find-and-replace the two
--      placeholders in the HEARTBEAT section at the bottom:
--        YOUR-APP-URL     → your Vercel URL (e.g. my-machine.vercel.app)
--        YOUR-ACCESS-KEY  → the same value as your ACCESS_KEY env var
--      (If you're not using the poller yet, you can leave them and re-run later.)
--   3. Paste this whole file and press Run. Green check = done.
--
-- Everything is "if not exists" / idempotent, so re-running later is always safe
-- and never touches your data.
-- ============================================================================

-- pg_cron + pg_net drive the poller's 5-minute tick (optional feature).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- One row per sales call turned into a brief. external_id dedupes a retried
-- webhook / an overlapping poll (partial unique index below).
create table if not exists public.briefs (
  id uuid default gen_random_uuid() not null,
  source text default 'fathom'::text not null,
  external_id text,
  title text,
  client_name text,
  attendees jsonb default '[]'::jsonb not null,
  meeting_url text,
  recorded_at timestamp with time zone,
  transcript text,
  brief jsonb default '{}'::jsonb not null,
  doc_id text,
  doc_url text,
  created_at timestamp with time zone default now() not null,
  primary key (id)
);
create unique index if not exists briefs_source_external_uidx
  on public.briefs (source, external_id) where external_id is not null;
create index if not exists briefs_created_at_idx on public.briefs (created_at desc);

-- Tiny key/value store: the Google refresh token + the Drive folder id.
create table if not exists public.app_state (
  key text not null,
  value text,
  updated_at timestamp with time zone default now() not null,
  primary key (key)
);

-- ── HEARTBEAT (optional poller) ─────────────────────────────────────────────
-- Runs the "rename anytime" poller every 5 minutes. It idles until you set both
-- FATHOM_API_KEY and FATHOM_PAID_KEYWORDS, so scheduling it now is harmless.
-- Replace YOUR-APP-URL and YOUR-ACCESS-KEY first (see header). To remove it
-- later: select cron.unschedule('onboarding-poll');
select cron.schedule(
  'onboarding-poll',
  '*/5 * * * *',
  $$ select net.http_get(url := 'https://YOUR-APP-URL/api/cron/fathom?k=YOUR-ACCESS-KEY') $$
);
