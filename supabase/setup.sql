-- CanaFlight secure intake — one-time Supabase setup
-- Run this whole file in the Supabase dashboard: SQL Editor → New query → Run.

-- 1. Submissions table
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  plan text,
  services jsonb default '[]',
  full_name text,
  passport_number text,
  citizenship text,
  age text,
  gender text,
  email text,
  phone text,
  stay_city text,
  arrival_date text,
  condition_text text,
  has_existing_rx text,
  product_pref text,
  thc_pref text,
  referral_source text,
  consents jsonb default '[]',
  files jsonb default '[]',
  handled boolean not null default false
);

-- 2. Lock the table down: no anonymous/authenticated access at all.
--    Only the service-role key (used by the Vercel functions) bypasses RLS.
alter table public.submissions enable row level security;
revoke all on public.submissions from anon, authenticated;

-- 3. Private storage bucket for passport/selfie/prescription files.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'intake-files', 'intake-files', false, 15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do nothing;

-- 4. Retention: auto-delete submissions and their files after 12 months,
--    matching the privacy policy. Runs daily at 03:00 UTC.
create extension if not exists pg_cron;

create or replace function public.purge_expired_submissions()
returns void
language plpgsql
security definer
as $$
begin
  -- delete stored files of expired submissions
  delete from storage.objects
  where bucket_id = 'intake-files'
    and (string_to_array(name, '/'))[1] in (
      select id::text from public.submissions
      where created_at < now() - interval '12 months'
    );
  -- delete the rows themselves
  delete from public.submissions
  where created_at < now() - interval '12 months';
end;
$$;

select cron.schedule(
  'purge-expired-submissions',
  '0 3 * * *',
  $$select public.purge_expired_submissions()$$
);
