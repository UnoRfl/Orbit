-- Orbit redesign, 2026-09-24. All three migrations below are APPLIED
-- (events_real_dates_overnight, atomic_account_report_schedule_rpcs,
-- private_typing_channels). Kept here as the record of what the DB contains.

-- ---- events_real_dates_overnight ------------------------------------------
alter table public.events add column if not exists starts_at timestamptz;
alter table public.events add column if not exists ends_at   timestamptz;
alter table public.events drop constraint if exists events_day_check;
alter table public.events add constraint events_day_check check (day between 0 and 6);
alter table public.events drop constraint if exists events_check;
alter table public.events add constraint events_check
  check (start_min between 0 and 1439 and end_min > start_min and end_min <= start_min + 2880);
alter table public.events drop constraint if exists events_span_check;
alter table public.events add constraint events_span_check check (
  (starts_at is null and ends_at is null) or
  (starts_at is not null and ends_at is not null and ends_at > starts_at and ends_at <= starts_at + interval '48 hours'));
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind = any (array['coffee','study','lunch','hangout','sleepover']));
alter table public.events drop constraint if exists events_text_sizes;
alter table public.events add constraint events_text_sizes
  check (char_length(title) between 1 and 80 and (place is null or char_length(place) <= 80));
create index if not exists events_starts_at_idx on public.events (starts_at);

-- ---- atomic_account_report_schedule_rpcs ----------------------------------
-- delete_my_account(): every public table cascades from profiles, which
-- cascades from auth.users, so deleting the auth user removes everything.
-- admin_resolve_report(uuid, text): resolve + mod log in one transaction.
-- replace_classes(jsonb): schedule import as one transaction (<= 200 rows).
-- (bodies as applied — see the Supabase migration history for exact text)

-- ---- private_typing_channels ----------------------------------------------
-- public.can_typing(topic) + two policies on realtime.messages admitting only
-- members of the DM ('typing:dm:<uuid>') or system ('typing:sys:<uuid>').
