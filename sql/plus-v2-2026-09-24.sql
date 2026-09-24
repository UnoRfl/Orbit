-- Orbit+ v2 — evolving badge ("member since") and message effects.
-- STATUS: applied 2026-09-24 (migration `plus_v2_tiers_and_message_fx`).
--
-- subscriptions.since drives the badge (Moon → Comet → Planet → Star →
-- Supernova). Redeeming or being granted days while still active keeps it;
-- after a lapse it starts over. profiles_view exposes it as plus_since, null
-- whenever Plus isn't live.
--
-- messages.fx is a Plus perk, so a BEFORE INSERT trigger silently drops the
-- effect for anyone who isn't Plus (the message itself still sends). The
-- CHECK keeps the value to the four effects the client knows how to draw.

alter table public.subscriptions add column if not exists since timestamptz;
update public.subscriptions set since = coalesce(since, updated_at) where since is null;

-- redeem_code() and staff_grant_plus() now set/keep `since` on upsert:
--   since = case when subscriptions.plus_until > now() then coalesce(subscriptions.since, now()) else now() end
-- (full bodies: see the migration; otherwise identical to stories-plus-2026-09-24.sql)

-- profiles_view gains a final column:
--   (select s.since from public.subscriptions s where s.user_id = p.id and s.plus_until > now()) as plus_since

alter table public.messages add column if not exists fx text;
alter table public.messages drop constraint if exists messages_fx_check;
alter table public.messages add constraint messages_fx_check check (fx is null or fx in ('confetti','stars','hearts','warp'));
grant insert (fx) on public.messages to authenticated;

create or replace function public.messages_fx_guard() returns trigger
language plpgsql security definer set search_path = public, internal, pg_temp as $$
begin
  if new.fx is not null and not internal.is_plus(new.sender) then new.fx := null; end if;
  return new;
end $$;
drop trigger if exists messages_fx_guard on public.messages;
create trigger messages_fx_guard before insert on public.messages for each row execute function public.messages_fx_guard();
revoke execute on function public.messages_fx_guard() from public, anon, authenticated;
revoke execute on function public.redeem_code(text), public.staff_grant_plus(uuid,int,text) from anon;
