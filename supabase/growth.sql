-- CanaFlight lead capture + funnel measurement — one-time Supabase setup.
-- Run in the Supabase dashboard: SQL Editor → New query → Run.
-- Safe to re-run. Requires supabase/setup.sql to have run first.

-- ---------------------------------------------------------------------------
-- 1. Soft lead capture
-- ---------------------------------------------------------------------------
-- The full intake form asks for a passport, a selfie and a medical history.
-- That is the right bar for someone ready to buy and far too high for someone
-- three paragraphs into a guide, so those readers currently leave no trace at
-- all. This table backs a two-field form for them.
--
-- DESIGN CONSTRAINT — do not add a symptom or condition field here.
-- Collecting health data carries obligations (database registration, the
-- security regime in the privacy policy) that the main intake form is already
-- built to meet and this one deliberately is not. Email plus a rough travel
-- date is enough to follow up, and keeps this table free of medical data.

create table if not exists public.light_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  travel_month text,              -- free text: "ספטמבר", "2026-09", "עוד חודשיים"
  lang text,                      -- 'he' | 'en'
  source_page text,               -- which guide or city page it came from
  handled boolean not null default false
);

alter table public.light_leads enable row level security;
revoke all on public.light_leads from anon, authenticated;

create index if not exists light_leads_pending_idx
  on public.light_leads (created_at desc) where handled = false;

-- Same 12-month retention as submissions, for the same reason.
create or replace function public.purge_expired_light_leads()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.light_leads
  where created_at < now() - interval '12 months';
end;
$$;

select cron.unschedule('purge-expired-light-leads')
where exists (select 1 from cron.job where jobname = 'purge-expired-light-leads');

select cron.schedule(
  'purge-expired-light-leads',
  '15 3 * * *',
  $$select public.purge_expired_light_leads()$$
);

-- ---------------------------------------------------------------------------
-- 2. Funnel counters
-- ---------------------------------------------------------------------------
-- Google Analytics sits behind the cookie banner, so everyone who declines is
-- invisible — and "how many people started the form and gave up?" is exactly
-- the question you cannot answer from a sample biased toward people who say
-- yes to tracking.
--
-- DESIGN CONSTRAINT — no identifier of any kind belongs in this table.
-- No cookie, no session id, no IP, no user agent. Rows are counted, never
-- joined, so a row cannot be traced to a person and the table needs no
-- consent to populate. Comparing daily counts of intake_started against
-- intake_completed gives the drop-off rate, which is the whole point; per
-- person journeys are not worth the privacy cost on a health site.

create table if not exists public.funnel_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null,
  lang text
);

alter table public.funnel_events enable row level security;
revoke all on public.funnel_events from anon, authenticated;

create index if not exists funnel_events_day_idx
  on public.funnel_events (created_at desc, event);

create or replace function public.purge_funnel_events()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.funnel_events
  where created_at < now() - interval '13 months';
end;
$$;

select cron.unschedule('purge-funnel-events')
where exists (select 1 from cron.job where jobname = 'purge-funnel-events');

select cron.schedule(
  'purge-funnel-events',
  '45 3 * * *',
  $$select public.purge_funnel_events()$$
);

-- ---------------------------------------------------------------------------
-- 3. The funnel view
-- ---------------------------------------------------------------------------
-- One row per day: how many opened the form, how many started filling it, how
-- many finished, and how many left an email on a guide page instead.

create or replace view public.funnel_daily as
select
  d::date as day,
  count(*) filter (where e.event = 'intake_viewed')    as viewed,
  count(*) filter (where e.event = 'intake_started')   as started,
  count(*) filter (where e.event = 'intake_completed') as completed,
  count(*) filter (where e.event = 'light_lead')       as light_leads,
  case
    when count(*) filter (where e.event = 'intake_started') = 0 then null
    else round(
      100.0 * count(*) filter (where e.event = 'intake_completed')
            / count(*) filter (where e.event = 'intake_started'), 1)
  end as completion_pct
from generate_series(now() - interval '60 days', now(), interval '1 day') d
left join public.funnel_events e on e.created_at::date = d::date
group by d::date
order by day desc;

revoke all on public.funnel_daily from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Useful queries
-- ---------------------------------------------------------------------------
-- The funnel, last 60 days (skip empty days):
--   select * from public.funnel_daily where viewed > 0;
--
-- Soft leads still to follow up:
--   select created_at, email, travel_month, source_page
--   from public.light_leads where not handled order by created_at;
--
-- Which pages actually produce soft leads:
--   select source_page, count(*) from public.light_leads
--   group by source_page order by count desc;
