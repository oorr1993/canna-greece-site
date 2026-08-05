-- CanaFlight lead alerts — one-time Supabase setup.
-- Run this whole file in the Supabase dashboard: SQL Editor → New query → Run.
-- Safe to re-run: every statement is idempotent.
--
-- Prerequisite: supabase/setup.sql has already been run (this file builds on
-- the submissions table and the pg_cron extension it enables).

-- ---------------------------------------------------------------------------
-- 1. Delivery log
-- ---------------------------------------------------------------------------
-- Alerts used to be fired into an empty try/catch, which meant a broken
-- notification channel and a genuinely quiet week produced identical
-- evidence: nothing. Recording each attempt turns "am I actually being told
-- about new leads?" into a question with an answer.

create table if not exists public.notification_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  kind text not null,                       -- 'new_lead' | 'unhandled_digest'
  submission_id uuid,                       -- null for digests
  delivered boolean not null default false, -- true if ANY channel succeeded
  channels jsonb not null default '[]'      -- per-channel outcome + error text
);

alter table public.notification_log enable row level security;
revoke all on public.notification_log from anon, authenticated;

create index if not exists notification_log_created_idx
  on public.notification_log (created_at desc);

-- Undelivered alerts are the ones worth looking at, and they are rare, so a
-- partial index keeps that lookup cheap without indexing the whole table.
create index if not exists notification_log_failed_idx
  on public.notification_log (created_at desc) where delivered = false;

-- ---------------------------------------------------------------------------
-- 2. Health view — the one query worth bookmarking
-- ---------------------------------------------------------------------------
-- Answers, in one row per day: did every lead this week produce a delivered
-- alert? A zero in delivered_alerts next to a non-zero leads count means the
-- notification path is broken, regardless of how healthy the inbox looks.

create or replace view public.alert_health as
select
  d::date                                                as day,
  (select count(*) from public.submissions s
     where s.created_at::date = d::date)                 as leads,
  (select count(*) from public.notification_log n
     where n.created_at::date = d::date
       and n.kind = 'new_lead' and n.delivered)          as delivered_alerts,
  (select count(*) from public.notification_log n
     where n.created_at::date = d::date
       and not n.delivered)                              as failed_alerts
from generate_series(now() - interval '30 days', now(), interval '1 day') d
order by day desc;

revoke all on public.alert_health from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Retention for the log itself
-- ---------------------------------------------------------------------------
-- The log holds no personal data (a submission id is a random uuid), but it
-- is operational noise, so it does not need to outlive its usefulness.

create or replace function public.purge_notification_log()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.notification_log
  where created_at < now() - interval '90 days';
end;
$$;

select cron.unschedule('purge-notification-log')
where exists (select 1 from cron.job where jobname = 'purge-notification-log');

select cron.schedule(
  'purge-notification-log',
  '30 3 * * *',
  $$select public.purge_notification_log()$$
);

-- ---------------------------------------------------------------------------
-- 4. Hourly chase for unhandled leads
-- ---------------------------------------------------------------------------
-- pg_net lets Postgres make the outbound call to the Vercel endpoint, which
-- holds the Telegram and Gmail credentials. Those secrets deliberately do not
-- live in the database.

create extension if not exists pg_net;

-- ⚠️ BEFORE RUNNING: replace REPLACE_WITH_CRON_SECRET below with the same
-- value you set as CRON_SECRET in the Vercel environment variables. The two
-- must match exactly or every run returns 401.
--
-- Schedule is 06:00–16:00 UTC, hourly. pg_cron runs on UTC, so that lands at
-- roughly 09:00–19:00 Israel time year-round (the window drifts by an hour
-- between winter and summer clocks, which is harmless here). Alerts outside
-- working hours are deliberately skipped: the VIP promise is "within an hour
-- during working hours", so a 03:00 push would wake you for a clock that is
-- not running. Widen to '0 * * * *' if you want round-the-clock chasing.

select cron.unschedule('chase-unhandled-leads')
where exists (select 1 from cron.job where jobname = 'chase-unhandled-leads');

select cron.schedule(
  'chase-unhandled-leads',
  '0 6-16 * * *',
  $$
  select net.http_post(
    url     := 'https://www.canaflight.com/api/cron-unhandled',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', 'REPLACE_WITH_CRON_SECRET'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- ---------------------------------------------------------------------------
-- Useful queries once this is live
-- ---------------------------------------------------------------------------
-- Alert health, last 30 days:
--   select * from public.alert_health where leads > 0;
--
-- Anything that failed to deliver:
--   select created_at, kind, channels from public.notification_log
--   where not delivered order by created_at desc limit 20;
--
-- Leads still waiting:
--   select id, plan, arrival_date, created_at from public.submissions
--   where not handled order by created_at;
--
-- Scheduled jobs and their last run:
--   select jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
