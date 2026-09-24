-- Orbit+ v2 — evolving badge ("member since") and message effects.
-- STATUS: applied 2026-09-24 as `plus_v2_tiers_and_message_fx`, then `chat_media_plus_only` (bottom).
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

create or replace function public.redeem_code(p_code text) returns timestamptz
language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare r public.redeem_codes; u uuid := auth.uid(); v timestamptz; k text := upper(btrim(coalesce(p_code,'')));
begin
  if u is null then raise exception 'Sign in first'; end if;
  if internal.is_suspended(u) then raise exception 'Your account is restricted right now'; end if;
  if (select count(*) from public.redeem_attempts where user_id = u and at > now() - interval '1 hour') >= 8 then
    raise exception 'Too many tries — wait an hour';
  end if;
  select * into r from public.redeem_codes where code = k for update;
  if r.code is null or r.uses >= r.max_uses or (r.expires_at is not null and r.expires_at < now()) then
    insert into public.redeem_attempts (user_id) values (u);
    raise exception 'That code isn''t valid';
  end if;
  begin
    insert into public.redemptions (code, user_id) values (k, u);
  exception when unique_violation then raise exception 'You already used that code';
  end;
  update public.redeem_codes set uses = uses + 1 where code = k;
  insert into public.subscriptions (user_id, plus_until, source, since, updated_at)
  values (u, now() + make_interval(days => r.days), 'code', now(), now())
  on conflict (user_id) do update
    set since = case when public.subscriptions.plus_until > now() then coalesce(public.subscriptions.since, now()) else now() end,
        plus_until = greatest(coalesce(public.subscriptions.plus_until, now()), now()) + make_interval(days => r.days),
        source = 'code', updated_at = now()
  returning plus_until into v;
  return v;
end $$;

create or replace function public.staff_grant_plus(p_target uuid, p_days int, p_note text default null)
returns timestamptz language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare v timestamptz;
begin
  if not internal.is_founder() then raise exception 'Founder only'; end if;
  if p_days not between 0 and 3660 then raise exception 'bad length'; end if;
  insert into public.subscriptions (user_id, plus_until, source, since, updated_at)
  values (p_target, case when p_days = 0 then now() else now() + make_interval(days => p_days) end, 'grant', now(), now())
  on conflict (user_id) do update
    set since = case when public.subscriptions.plus_until > now() then coalesce(public.subscriptions.since, now()) else now() end,
        plus_until = case when p_days = 0 then now()
                          else greatest(coalesce(public.subscriptions.plus_until, now()), now()) + make_interval(days => p_days) end,
        source = 'grant', updated_at = now()
  returning plus_until into v;
  insert into public.mod_actions (actor, action, target, note)
  values (auth.uid(), case when p_days = 0 then 'plus revoked' else 'plus +'||p_days||'d' end, p_target, left(p_note, 300));
  insert into public.notifications (user_id, actor, kind, title, body)
  select p_target, auth.uid(), 'plus', 'You have Orbit+', 'Enjoy it — '||p_days||' days are on your account.'
   where p_days > 0 and p_target <> auth.uid();
  return v;
end $$;

create or replace view public.profiles_view with (security_invoker = false) as
 select p.id, p.handle,
   case when p.id = (select auth.uid()) or internal.is_staff() then p.display_name
        when p.show_full_name = false then null::text else p.display_name end as display_name,
   p.course, p.accent1, p.accent2, p.created_at, p.school, p.flair, p.avatar_url, p.avatar_pos,
   p.cover_url, p.cover_pos, p.bio, p.pronouns, p.hobbies, p.show_full_name, p.badges, p.links,
   case when p.id = (select auth.uid()) or internal.is_staff() then p.suspended_until else null::timestamptz end as suspended_until,
   case when p.id = (select auth.uid()) or internal.is_staff() then p.ban_reason else null::text end as ban_reason,
   (select s.plus_until from public.subscriptions s where s.user_id = p.id and s.plus_until > now()) as plus_until,
   (select s.since from public.subscriptions s where s.user_id = p.id and s.plus_until > now()) as plus_since
 from public.profiles p;

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

------------------------------------------------------------------------------
-- follow-up (`chat_media_plus_only`): SENDING photos/videos in chat is an
-- Orbit+ perk; receiving stays free, and stories stay free. Enforced here so
-- a modified client can't upload anyway.
------------------------------------------------------------------------------
create or replace function public.media_before_insert() returns trigger
language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare other uuid;
begin
  if auth.uid() is not null then new.owner := auth.uid(); end if;
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.opened_at := null;
  if internal.is_suspended(new.owner) then raise exception 'Your account is restricted right now'; end if;
  if new.purpose = 'story' and not internal.flag('stories') then raise exception 'Stories are paused right now'; end if;
  if new.purpose = 'chat'  and not internal.flag('snaps')   then raise exception 'Photo sending is paused right now'; end if;
  if new.purpose = 'chat'  and not internal.is_plus(new.owner) then raise exception 'Sending photos and videos is an Orbit+ perk'; end if;
  if new.purpose = 'chat' then new.audience := 'friends'; new.caption := null; new.place := null; end if;
  if (select count(*) from public.media where owner = new.owner and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'rate limit';
  end if;
  if new.purpose = 'story' and (select count(*) from public.media
      where owner = new.owner and purpose = 'story' and expires_at > now()) >= 30 then
    raise exception 'You have 30 stories up — that''s the limit';
  end if;
  if new.thread_id is not null then
    select case when d.a = new.owner then d.b else d.a end into other from public.dm_threads d where d.id = new.thread_id;
    if other is null then raise exception 'no thread'; end if;
    if public.chat_blocked_between(new.owner, other) then raise exception 'blocked'; end if;
    if not internal.are_friends(new.owner, other) then raise exception 'not friends'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.media_before_insert() from public, anon, authenticated;
