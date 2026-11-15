-- Orbit · stories, 24-hour media, Orbit+, ads, mission-control dashboard.
-- STATUS: applied 2026-09-24 as four migrations, in order: `stories_plus_ads_2026_09_24`,
--         `media_visibility_row_based`, `staff_sweep_now`, `stories_plus_tighten_grants`
--         (the last three are appended at the bottom of this file, as they ran).
--
-- The one rule everything here follows: a photo or video lives for 24 hours
-- at most and then it is GONE — the row, the file, the thumbnail. Nothing is
-- archived. That is both the product ("doesn't get saved") and the budget
-- (Supabase free tier = 1 GB of storage; a rolling 24h window never fills it).
--
--   1. storage bucket `ephemeral`  private, 30 MB/file, images + short video
--   2. media                       one row per story or chat photo/video
--   3. media_views                 who saw a story, and their reaction
--   4. close_friends               a story audience smaller than "friends"
--   5. subscriptions / redeem      Orbit+ (no payment processor — codes)
--   6. scheduled_messages          "send later", an Orbit+ perk, cron-delivered
--   7. ads / ad_events             house ad slots, managed from mission control
--   8. app_config                  broadcast banner + kill switches
--   9. staff_overview()            the dashboard's numbers in one round trip
--  10. dm_streaks()                consecutive days both of you sent something
--
-- Deletion cannot happen in SQL: Supabase blocks DELETE on storage.objects
-- (the protect_objects_delete trigger), because a row delete would orphan the
-- file in S3. So an edge function (`ephemeral-sweep`, service role) removes the
-- files through the Storage API every 15 minutes, driven by pg_cron + pg_net.
-- Until it runs, RLS already hides anything past expires_at from everyone —
-- the sweep reclaims space, it is not what makes content disappear.

create extension if not exists pg_net;   -- moved to `extensions` in follow-up 3

------------------------------------------------------------------------------
-- 8 (first, the media trigger reads it). app_config — founder-controlled knobs
------------------------------------------------------------------------------
create table if not exists public.app_config (
  key        text primary key check (key in ('banner','flags')),
  value      jsonb not null default '{}'::jsonb check (octet_length(value::text) <= 2000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.app_config (key, value) values
  ('banner', '{}'::jsonb),
  ('flags',  '{"stories":true,"snaps":true,"ads":true,"scheduled":true}'::jsonb)
on conflict (key) do nothing;
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to authenticated;
grant update (value, updated_by, updated_at) on public.app_config to authenticated;
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to authenticated using (true);
drop policy if exists app_config_write on public.app_config;
create policy app_config_write on public.app_config for update to authenticated
  using (internal.is_founder()) with check (internal.is_founder() and updated_by = (select auth.uid()));

create or replace function internal.flag(p text) returns boolean
language sql stable security definer set search_path = internal, public as $$
  select coalesce((select (value->>p)::boolean from public.app_config where key = 'flags'), true);
$$;

------------------------------------------------------------------------------
-- 5. Orbit+ — entitlement, codes, grants
------------------------------------------------------------------------------
create table if not exists public.subscriptions (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  plus_until timestamptz,
  source     text check (source in ('code','grant','gift')),
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;
drop policy if exists subs_read on public.subscriptions;
-- Plus status is public on purpose (the badge and aura are the point), like Nitro.
create policy subs_read on public.subscriptions for select to authenticated using (true);

create or replace function internal.is_plus(u uuid) returns boolean
language sql stable security definer set search_path = internal, public as $$
  select coalesce((select plus_until > now() from public.subscriptions where user_id = u), false);
$$;

create table if not exists public.redeem_codes (
  code       text primary key check (code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$'),
  days       int  not null check (days between 1 and 366),
  max_uses   int  not null default 1 check (max_uses between 1 and 500),
  uses       int  not null default 0,
  note       text check (char_length(note) <= 80),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create table if not exists public.redemptions (
  code    text not null references public.redeem_codes(code) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (code, user_id)
);
create index if not exists redemptions_user_idx on public.redemptions(user_id);
create table if not exists public.redeem_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists redeem_attempts_user_at on public.redeem_attempts(user_id, at);
alter table public.redeem_codes enable row level security;
alter table public.redemptions enable row level security;
alter table public.redeem_attempts enable row level security;
revoke all on public.redeem_codes, public.redemptions, public.redeem_attempts from anon, authenticated;
grant select on public.redeem_codes, public.redemptions to authenticated;
drop policy if exists codes_founder on public.redeem_codes;
create policy codes_founder on public.redeem_codes for select to authenticated using (internal.is_founder());
drop policy if exists redemptions_read on public.redemptions;
create policy redemptions_read on public.redemptions for select to authenticated
  using (user_id = (select auth.uid()) or internal.is_founder());

-- 60 bits of randomness per code, so guessing is hopeless even before the
-- 8-failures-an-hour limit in redeem_code().
create or replace function internal.new_code() returns text
language plpgsql volatile set search_path = internal, public, extensions as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(12); s text := ''; i int;
begin
  for i in 0..11 loop
    s := s || substr(a, (get_byte(b, i) % 32) + 1, 1);
    if i in (3, 7) then s := s || '-'; end if;
  end loop;
  return s;
end $$;

create or replace function public.staff_make_codes(p_days int, p_count int, p_uses int default 1, p_note text default null)
returns setof text language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare c text; i int;
begin
  if not internal.is_founder() then raise exception 'Founder only'; end if;
  if p_count not between 1 and 50 then raise exception 'Make 1 to 50 codes at a time'; end if;
  for i in 1..p_count loop
    loop
      c := internal.new_code();
      begin
        insert into public.redeem_codes (code, days, max_uses, note, created_by)
        values (c, p_days, coalesce(p_uses,1), nullif(left(btrim(coalesce(p_note,'')),80),''), auth.uid());
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    return next c;
  end loop;
  insert into public.mod_actions (actor, action, note)
  values (auth.uid(), 'plus codes ×'||p_count, p_days||' days'||coalesce(' · '||p_note,''));
end $$;

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
  insert into public.subscriptions (user_id, plus_until, source, updated_at)
  values (u, now() + make_interval(days => r.days), 'code', now())
  on conflict (user_id) do update
    set plus_until = greatest(coalesce(public.subscriptions.plus_until, now()), now()) + make_interval(days => r.days),
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
  insert into public.subscriptions (user_id, plus_until, source, updated_at)
  values (p_target, case when p_days = 0 then now() else now() + make_interval(days => p_days) end, 'grant', now())
  on conflict (user_id) do update
    set plus_until = case when p_days = 0 then now()
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

-- Plus rides along on the profile view so every avatar can draw its aura
-- without a second query. Columns are appended; the view stays definer-rights.
create or replace view public.profiles_view with (security_invoker = false) as
 select p.id, p.handle,
   case when p.id = (select auth.uid()) or internal.is_staff() then p.display_name
        when p.show_full_name = false then null::text else p.display_name end as display_name,
   p.course, p.accent1, p.accent2, p.created_at, p.school, p.flair, p.avatar_url, p.avatar_pos,
   p.cover_url, p.cover_pos, p.bio, p.pronouns, p.hobbies, p.show_full_name, p.badges, p.links,
   case when p.id = (select auth.uid()) or internal.is_staff() then p.suspended_until else null::timestamptz end as suspended_until,
   case when p.id = (select auth.uid()) or internal.is_staff() then p.ban_reason else null::text end as ban_reason,
   (select s.plus_until from public.subscriptions s where s.user_id = p.id and s.plus_until > now()) as plus_until
 from public.profiles p;

------------------------------------------------------------------------------
-- 4. close_friends
------------------------------------------------------------------------------
create table if not exists public.close_friends (
  owner      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  friend     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner, friend)
);
create index if not exists close_friends_friend_idx on public.close_friends(friend);
alter table public.close_friends enable row level security;
revoke all on public.close_friends from anon, authenticated;
grant select, delete on public.close_friends to authenticated;
grant insert (owner, friend) on public.close_friends to authenticated;
drop policy if exists cf_read on public.close_friends;
create policy cf_read on public.close_friends for select to authenticated using (owner = (select auth.uid()));
drop policy if exists cf_add on public.close_friends;
create policy cf_add on public.close_friends for insert to authenticated
  with check (owner = (select auth.uid()) and internal.are_friends((select auth.uid()), friend));
drop policy if exists cf_del on public.close_friends;
create policy cf_del on public.close_friends for delete to authenticated using (owner = (select auth.uid()));

create or replace function internal.is_close(o uuid, f uuid) returns boolean
language sql stable security definer set search_path = internal, public as $$
  select exists (select 1 from public.close_friends where owner = o and friend = f);
$$;

------------------------------------------------------------------------------
-- 2. media
------------------------------------------------------------------------------
create table if not exists public.media (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  purpose    text not null check (purpose in ('story','chat')),
  kind       text not null check (kind in ('image','video')),
  path       text not null unique
             check (path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{6,64}\.(jpg|webp|png|gif|mp4|webm|mov)$'),
  thread_id  uuid references public.dm_threads(id) on delete cascade,
  system_id  uuid references public.systems(id) on delete cascade,
  audience   text not null default 'friends' check (audience in ('friends','close')),
  caption    text check (char_length(caption) <= 140),
  place      text check (char_length(place) <= 60),
  duration   real check (duration is null or duration >= 0),
  width      int  check (width  is null or width  between 1 and 8192),
  height     int  check (height is null or height between 1 and 8192),
  bytes      int  check (bytes  is null or bytes  between 1 and 31457280),
  view_once  boolean not null default false,
  opened_at  timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  constraint media_home check (
    (purpose = 'story' and thread_id is null and system_id is null)
    or (purpose = 'chat' and ((thread_id is null) <> (system_id is null)))),
  constraint media_ttl check (expires_at <= created_at + interval '24 hours'),
  constraint media_path_owner check (split_part(path, '/', 1) = owner::text),
  constraint media_vo check (not view_once or thread_id is not null),
  -- stories are 10 seconds, the whole point of them; chat clips get a minute
  constraint media_len check (duration is null
    or (purpose = 'story' and duration <= 10.5) or (purpose = 'chat' and duration <= 60.5))
);
create index if not exists media_owner_idx   on public.media(owner, created_at desc);
create index if not exists media_expires_idx on public.media(expires_at);
create index if not exists media_thread_idx  on public.media(thread_id) where thread_id is not null;
create index if not exists media_system_idx  on public.media(system_id) where system_id is not null;

-- one definition of "may this caller see this item", used by RLS on media,
-- by the storage policy (through media's RLS) and by every RPC below
create or replace function public.media_visible(p_id uuid) returns boolean
language sql stable security definer set search_path = public, internal, pg_temp as $$
  select exists (
    select 1 from public.media m
     where m.id = p_id and m.expires_at > now() and auth.uid() is not null
       and (
         m.owner = auth.uid()
         -- staff see an item only once somebody reported it, not everyone's stories
         or (internal.is_support() and exists (
               select 1 from public.reports r where r.ref->>'media_id' = m.id::text))
         or (not public.chat_blocked_between(m.owner, auth.uid()) and (
               (m.purpose = 'story' and internal.are_friends(auth.uid(), m.owner)
                  and (m.audience = 'friends' or internal.is_close(m.owner, auth.uid())))
            or (m.purpose = 'chat' and m.thread_id is not null and public.chat_dm_member(m.thread_id)
                  and (not m.view_once or m.opened_at is null))
            or (m.purpose = 'chat' and m.system_id is not null and public.chat_sys_member(m.system_id))))
       ));
$$;

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
drop trigger if exists media_before_insert on public.media;
create trigger media_before_insert before insert on public.media for each row execute function public.media_before_insert();

alter table public.media enable row level security;
revoke all on public.media from anon, authenticated;
grant select on public.media to authenticated;
grant insert (purpose, kind, path, thread_id, system_id, audience, caption, place, duration, width, height, bytes, view_once)
  on public.media to authenticated;
drop policy if exists media_read on public.media;
create policy media_read on public.media for select to authenticated using (public.media_visible(id));
drop policy if exists media_add on public.media;
create policy media_add on public.media for insert to authenticated
  with check (owner = (select auth.uid()) and (
       purpose = 'story'
    or (thread_id is not null and public.chat_dm_member(thread_id))
    or (system_id is not null and public.chat_sys_member(system_id))));

------------------------------------------------------------------------------
-- 3. media_views
------------------------------------------------------------------------------
create table if not exists public.media_views (
  media_id  uuid not null references public.media(id) on delete cascade,
  viewer    uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  reaction  text check (reaction is null or char_length(reaction) <= 16),
  primary key (media_id, viewer)
);
create index if not exists media_views_viewer_idx on public.media_views(viewer);
alter table public.media_views enable row level security;
revoke all on public.media_views from anon, authenticated;
grant select on public.media_views to authenticated;
drop policy if exists mv_read on public.media_views;
create policy mv_read on public.media_views for select to authenticated using (
  viewer = (select auth.uid())
  or exists (select 1 from public.media m where m.id = media_id and m.owner = (select auth.uid())));

create or replace function public.media_seen(p_id uuid, p_reaction text default null) returns void
language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare o uuid;
begin
  if not public.media_visible(p_id) then raise exception 'gone'; end if;
  select owner into o from public.media where id = p_id;
  if o = auth.uid() then return; end if;                  -- your own views don't count
  if p_reaction is not null and char_length(p_reaction) > 16 then raise exception 'bad reaction'; end if;
  insert into public.media_views (media_id, viewer, reaction) values (p_id, auth.uid(), p_reaction)
  on conflict (media_id, viewer) do update
    set reaction = coalesce(excluded.reaction, public.media_views.reaction);
end $$;

-- view-once: the recipient's first open burns it for them (sender still sees it)
create or replace function public.media_open(p_id uuid) returns void
language plpgsql security definer set search_path = public, internal, pg_temp as $$
begin
  if not public.media_visible(p_id) then raise exception 'gone'; end if;
  update public.media set opened_at = now()
   where id = p_id and view_once and opened_at is null and owner <> auth.uid();
end $$;

-- owner deletes early: expire now, the sweep reclaims the file
create or replace function public.media_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public, internal, pg_temp as $$
begin
  update public.media set expires_at = now() where id = p_id and owner = auth.uid() and expires_at > now();
end $$;

create or replace function public.staff_remove_media(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare m public.media;
begin
  if not internal.is_staff() then raise exception 'Staff only'; end if;
  update public.media set expires_at = now() where id = p_id and expires_at > now() returning * into m;
  if m.id is null then raise exception 'Already gone'; end if;
  insert into public.mod_actions (actor, action, target, note)
  values (auth.uid(), 'removed '||case when m.purpose = 'story' then 'story' else 'chat '||m.kind end, m.owner, left(p_note, 300));
end $$;

------------------------------------------------------------------------------
-- messages: a new kind, 'media', whose body is a media id
------------------------------------------------------------------------------
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind = any (array['text','image','gif','media']));

create or replace function public.messages_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare susp timestamptz; other uuid; recent int; mm public.media;
begin
  select p.suspended_until into susp from public.profiles p where p.id = new.sender;
  if susp is not null and susp > now() then raise exception 'suspended'; end if;

  if new.kind = 'text' then
    if length(btrim(new.body)) = 0 then raise exception 'empty message'; end if;
  elsif new.kind = 'media' then
    begin select * into mm from public.media where id = new.body::uuid;
    exception when others then raise exception 'bad media'; end;
    if mm.id is null or mm.owner <> new.sender or mm.purpose <> 'chat' or mm.expires_at <= now()
       or mm.thread_id is distinct from new.thread_id or mm.system_id is distinct from new.system_id then
      raise exception 'bad media';
    end if;
  else
    if new.body !~ '^https://[^[:space:]]+$' or char_length(new.body) > 600 then
      raise exception 'bad media link';
    end if;
  end if;

  if new.thread_id is not null then
    select case when d.a = new.sender then d.b else d.a end into other
      from public.dm_threads d where d.id = new.thread_id;
    if other is null then raise exception 'no thread'; end if;
    if public.chat_blocked_between(new.sender, other) then raise exception 'blocked'; end if;
    if not exists (
      select 1 from public.friendships f where f.status = 'accepted'
        and ((f.requester = new.sender and f.addressee = other)
          or (f.requester = other and f.addressee = new.sender))
    ) then raise exception 'not friends'; end if;
  end if;

  select count(*) into recent from public.messages m
   where m.sender = new.sender and m.created_at > now() - interval '10 seconds';
  if recent >= 8 then raise exception 'rate limit'; end if;

  new.deleted := false;
  return new;
end $$;

-- unsending a photo/video message expires the file with it
create or replace function public.messages_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id <> old.id or new.thread_id is distinct from old.thread_id
     or new.system_id is distinct from old.system_id or new.sender <> old.sender
     or new.created_at <> old.created_at or new.kind <> old.kind then
    raise exception 'immutable';
  end if;
  if old.deleted then raise exception 'already removed'; end if;
  if new.deleted is distinct from true then raise exception 'only unsend allowed'; end if;
  if old.kind = 'media' then
    begin
      update public.media set expires_at = now() where id = old.body::uuid and expires_at > now();
    exception when others then null;
    end;
  end if;
  new.body := '';
  return new;
end $$;

------------------------------------------------------------------------------
-- reports: stories can be reported; media messages carry their media id
------------------------------------------------------------------------------
alter table public.reports drop constraint if exists reports_kind_chk;
alter table public.reports add constraint reports_kind_chk check (kind = any (array['user','message','story']));
create index if not exists reports_media_idx on public.reports ((ref->>'media_id'));

create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare m public.messages; mid uuid; md public.media;
begin
  new.status := 'open'; new.handled_by := null;
  if new.kind = 'message' then
    begin mid := (new.ref->>'message_id')::uuid;
    exception when others then raise exception 'bad message reference'; end;
    select * into m from public.messages where id = mid;
    if m.id is null or m.sender <> new.target then raise exception 'bad message reference'; end if;
    if not ((m.thread_id is not null and public.chat_dm_member(m.thread_id))
         or (m.system_id is not null and public.chat_sys_member(m.system_id))) then
      raise exception 'bad message reference';
    end if;
    new.ref_id := m.id;
    new.ref := jsonb_build_object(
      'message_id', m.id,
      'scope', case when m.thread_id is not null then 'dm' else 'sys' end,
      'ref', coalesce(m.thread_id, m.system_id),
      'msg_kind', m.kind,
      'snippet', case when m.deleted or m.kind = 'media' then '' else left(m.body, 140) end)
      || case when m.kind = 'media' and not m.deleted then jsonb_build_object('media_id', m.body) else '{}'::jsonb end;
  elsif new.kind = 'story' then
    begin mid := (new.ref->>'media_id')::uuid;
    exception when others then raise exception 'bad story reference'; end;
    if not public.media_visible(mid) then raise exception 'bad story reference'; end if;
    select * into md from public.media where id = mid;
    if md.owner <> new.target or md.purpose <> 'story' then raise exception 'bad story reference'; end if;
    new.ref_id := md.id;
    new.ref := jsonb_build_object('media_id', md.id, 'msg_kind', md.kind, 'snippet', coalesce(md.caption, ''));
  elsif new.ref is not null and octet_length(new.ref::text) > 1000 then
    raise exception 'report too large';
  end if;
  return new;
end $$;

------------------------------------------------------------------------------
-- 1. the bucket + its policies
------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ephemeral', 'ephemeral', false, 31457280,
        array['image/jpeg','image/webp','image/png','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ephemeral upload own folder" on storage.objects;
create policy "ephemeral upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'ephemeral'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not internal.is_suspended((select auth.uid())));
-- reading a file = being able to see its media row (media's own RLS decides)
drop policy if exists "ephemeral read visible" on storage.objects;
create policy "ephemeral read visible" on storage.objects for select to authenticated
  using (bucket_id = 'ephemeral' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.media m where m.path = storage.objects.name)));
drop policy if exists "ephemeral delete own" on storage.objects;
create policy "ephemeral delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'ephemeral' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- deliberately no UPDATE policy: a file cannot be swapped after it was posted

------------------------------------------------------------------------------
-- the sweep (service role only; the edge function calls these two)
------------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'orbit_sweep_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'orbit_sweep_token',
      'shared secret between pg_cron and the ephemeral-sweep edge function');
  end if;
end $$;

create or replace function internal.sweep_token_ok(p text) returns boolean
language sql stable security definer set search_path = internal, public as $$
  select coalesce(p = (select decrypted_secret from vault.decrypted_secrets where name = 'orbit_sweep_token'), false);
$$;

create or replace function public.ephemeral_sweep_list(p_token text, p_limit int default 500)
returns table(path text) language plpgsql security definer set search_path = public, internal, storage, pg_temp as $$
begin
  if not internal.sweep_token_ok(p_token) then raise exception 'no'; end if;
  return query
    select x.path from (
      select m.path from public.media m where m.expires_at <= now()
      union
      -- uploads that never got a live row: failed posts, or rows already swept
      select o.name from storage.objects o
       where o.bucket_id = 'ephemeral' and o.created_at < now() - interval '1 hour'
         and not exists (select 1 from public.media m where m.path = o.name and m.expires_at > now())
    ) x limit greatest(1, least(p_limit, 1000));
end $$;

create or replace function public.ephemeral_sweep_done(p_token text, p_paths text[]) returns int
language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare n int;
begin
  if not internal.sweep_token_ok(p_token) then raise exception 'no'; end if;
  delete from public.media where path = any(p_paths) and expires_at <= now();
  get diagnostics n = row_count;
  delete from public.redeem_attempts where at < now() - interval '1 day';
  delete from public.ad_events where day < current_date - 120;
  return n;
end $$;

------------------------------------------------------------------------------
-- 6. scheduled messages (Orbit+)
------------------------------------------------------------------------------
create table if not exists public.scheduled_messages (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  thread_id  uuid references public.dm_threads(id) on delete cascade,
  system_id  uuid references public.systems(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  send_at    timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  failed     text,
  constraint sched_home check ((thread_id is null) <> (system_id is null))
);
create index if not exists sched_due_idx on public.scheduled_messages(send_at) where sent_at is null and failed is null;
create index if not exists sched_sender_idx on public.scheduled_messages(sender);
alter table public.scheduled_messages enable row level security;
revoke all on public.scheduled_messages from anon, authenticated;
grant select, delete on public.scheduled_messages to authenticated;
grant insert (sender, thread_id, system_id, body, send_at) on public.scheduled_messages to authenticated;
drop policy if exists sched_read on public.scheduled_messages;
create policy sched_read on public.scheduled_messages for select to authenticated using (sender = (select auth.uid()));
drop policy if exists sched_del on public.scheduled_messages;
create policy sched_del on public.scheduled_messages for delete to authenticated
  using (sender = (select auth.uid()) and sent_at is null);
drop policy if exists sched_add on public.scheduled_messages;
create policy sched_add on public.scheduled_messages for insert to authenticated
  with check (sender = (select auth.uid()) and internal.is_plus((select auth.uid())) and internal.flag('scheduled')
    and send_at > now() + interval '30 seconds' and send_at < now() + interval '30 days'
    and ((thread_id is not null and public.chat_dm_member(thread_id))
      or (system_id is not null and public.chat_sys_member(system_id))));

create or replace function public.sched_before_insert() returns trigger
language plpgsql security definer set search_path = public, internal, pg_temp as $$
begin
  new.created_at := now(); new.sent_at := null; new.failed := null;
  if (select count(*) from public.scheduled_messages where sender = new.sender and sent_at is null and failed is null) >= 50 then
    raise exception 'You have 50 messages queued — that''s the limit';
  end if;
  return new;
end $$;
drop trigger if exists sched_before_insert on public.scheduled_messages;
create trigger sched_before_insert before insert on public.scheduled_messages for each row execute function public.sched_before_insert();

-- runs every minute from pg_cron; each message goes through the normal
-- messages trigger, so blocks, friendships and suspensions still apply
create or replace function public.deliver_scheduled_messages() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n int := 0;
begin
  if auth.uid() is not null then raise exception 'cron only'; end if;
  for r in select * from public.scheduled_messages
            where sent_at is null and failed is null and send_at <= now()
            order by send_at limit 200 for update skip locked loop
    begin
      insert into public.messages (sender, kind, body, thread_id, system_id)
      values (r.sender, 'text', r.body, r.thread_id, r.system_id);
      update public.scheduled_messages set sent_at = now() where id = r.id;
      n := n + 1;
    exception when others then
      update public.scheduled_messages set failed = left(sqlerrm, 120) where id = r.id;
    end;
  end loop;
  delete from public.scheduled_messages where coalesce(sent_at, send_at) < now() - interval '7 days';
  return n;
end $$;

------------------------------------------------------------------------------
-- 7. ads
------------------------------------------------------------------------------
create table if not exists public.ads (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 60),
  body       text check (char_length(body) <= 160),
  image_url  text check (image_url is null or (image_url ~* '^https://[^[:space:]]+$' and char_length(image_url) <= 600)),
  cta        text not null default 'Learn more' check (char_length(cta) between 1 and 20),
  link_url   text not null check (link_url ~* '^https://[^[:space:]]+$' and char_length(link_url) <= 600),
  advertiser text check (char_length(advertiser) <= 40),
  placements text[] not null default array['home'] check (placements <@ array['home','chats','stories'] and cardinality(placements) >= 1),
  weight     int not null default 1 check (weight between 1 and 10),
  active     boolean not null default true,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.ads enable row level security;
revoke all on public.ads from anon, authenticated;
grant select, delete on public.ads to authenticated;
grant insert (title, body, image_url, cta, link_url, advertiser, placements, weight, active, starts_at, ends_at, created_by)
  on public.ads to authenticated;
grant update (title, body, image_url, cta, link_url, advertiser, placements, weight, active, starts_at, ends_at)
  on public.ads to authenticated;
drop policy if exists ads_read on public.ads;
create policy ads_read on public.ads for select to authenticated using (
  internal.is_support()
  or (active and internal.flag('ads') and coalesce(starts_at, '-infinity') <= now() and coalesce(ends_at, 'infinity') > now()));
drop policy if exists ads_write on public.ads;
create policy ads_write on public.ads for insert to authenticated with check (internal.is_staff() and created_by = (select auth.uid()));
drop policy if exists ads_edit on public.ads;
create policy ads_edit on public.ads for update to authenticated using (internal.is_staff()) with check (internal.is_staff());
drop policy if exists ads_del on public.ads;
create policy ads_del on public.ads for delete to authenticated using (internal.is_staff());

-- one row per (ad, person, day, kind): counts are reach, not refreshes
create table if not exists public.ad_events (
  ad_id   uuid not null references public.ads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null default current_date,
  kind    text not null check (kind in ('view','click')),
  primary key (ad_id, day, kind, user_id)
);
create index if not exists ad_events_user_idx on public.ad_events(user_id);
alter table public.ad_events enable row level security;
revoke all on public.ad_events from anon, authenticated;

create or replace function public.ad_track(p_ad uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, internal, pg_temp as $$
begin
  if auth.uid() is null or p_kind not in ('view','click') then return; end if;
  insert into public.ad_events (ad_id, user_id, kind) values (p_ad, auth.uid(), p_kind) on conflict do nothing;
exception when foreign_key_violation then null;
end $$;

create or replace function public.staff_ad_stats() returns table(ad_id uuid, views bigint, clicks bigint, views_7d bigint, clicks_7d bigint)
language plpgsql stable security definer set search_path = public, internal, pg_temp as $$
begin
  if not internal.is_support() then raise exception 'Staff only'; end if;
  return query select e.ad_id,
    count(*) filter (where e.kind = 'view'), count(*) filter (where e.kind = 'click'),
    count(*) filter (where e.kind = 'view'  and e.day > current_date - 7),
    count(*) filter (where e.kind = 'click' and e.day > current_date - 7)
  from public.ad_events e group by e.ad_id;
end $$;

------------------------------------------------------------------------------
-- 10. streaks
------------------------------------------------------------------------------
-- A day counts when BOTH people in the DM sent something, in Manila time
-- (Orbit's campus). The streak is the run of such days ending today or
-- yesterday; ending yesterday means it dies at midnight unless you talk.
create or replace function public.dm_streaks()
returns table(thread_id uuid, streak int, today boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with mine as (select d.id from public.dm_threads d where d.a = auth.uid() or d.b = auth.uid()),
  days as (
    select m.thread_id, (m.created_at at time zone 'Asia/Manila')::date as d
      from public.messages m join mine on mine.id = m.thread_id
     where m.created_at > now() - interval '90 days' and not m.deleted
     group by m.thread_id, (m.created_at at time zone 'Asia/Manila')::date
    having count(distinct m.sender) = 2),
  g as (select days.thread_id, days.d, days.d - (row_number() over (partition by days.thread_id order by days.d))::int as grp from days),
  isl as (select g.thread_id, max(g.d) as last_d, count(*)::int as n from g group by g.thread_id, g.grp),
  t as (select (now() at time zone 'Asia/Manila')::date as today)
  select isl.thread_id, isl.n, isl.last_d = t.today
    from isl, t where isl.last_d >= t.today - 1 and isl.n >= 2;
$$;

------------------------------------------------------------------------------
-- 9. the dashboard
------------------------------------------------------------------------------
create or replace function public.staff_overview() returns jsonb
language plpgsql stable security definer set search_path = public, internal, storage, cron, pg_temp as $$
declare j jsonb; t timestamptz := now();
begin
  if not internal.is_support() then raise exception 'Staff only'; end if;
  select jsonb_build_object(
    'at', t,
    'users',        (select count(*) from public.profiles),
    'new_7d',       (select count(*) from public.profiles where created_at > t - interval '7 days'),
    'new_prev_7d',  (select count(*) from public.profiles where created_at between t - interval '14 days' and t - interval '7 days'),
    'active_24h',   (select count(distinct u) from (
                       select user_id u from public.presence where updated_at > t - interval '24 hours'
                       union select sender from public.messages where created_at > t - interval '24 hours'
                       union select owner from public.media where created_at > t - interval '24 hours'
                       union select id from auth.users where last_sign_in_at > t - interval '24 hours') a),
    'active_7d',    (select count(distinct u) from (
                       select user_id u from public.presence where updated_at > t - interval '7 days'
                       union select sender from public.messages where created_at > t - interval '7 days'
                       union select id from auth.users where last_sign_in_at > t - interval '7 days') a),
    'signups_14',   (select jsonb_agg(jsonb_build_object('d', d::date, 'n',
                       (select count(*) from public.profiles p where p.created_at >= d and p.created_at < d + interval '1 day')) order by d)
                     from generate_series(date_trunc('day', t) - interval '13 days', date_trunc('day', t), interval '1 day') d),
    'msgs_14',      (select jsonb_agg(jsonb_build_object('d', d::date, 'n',
                       (select count(*) from public.messages m where m.created_at >= d and m.created_at < d + interval '1 day')) order by d)
                     from generate_series(date_trunc('day', t) - interval '13 days', date_trunc('day', t), interval '1 day') d),
    'msgs_24h',     (select count(*) from public.messages where created_at > t - interval '24 hours'),
    'dms',          (select count(*) from public.dm_threads),
    'systems',      (select count(*) from public.systems),
    'friendships',  (select count(*) from public.friendships where status = 'accepted'),
    'plans_ahead',  (select count(*) from public.events where coalesce(ends_at, created_at) > t),
    'stories_live', (select count(*) from public.media where purpose = 'story' and expires_at > t),
    'posters_24h',  (select count(distinct owner) from public.media where purpose = 'story' and created_at > t - interval '24 hours'),
    'snaps_live',   (select count(*) from public.media where purpose = 'chat' and expires_at > t),
    'story_views_24h', (select count(*) from public.media_views where viewed_at > t - interval '24 hours'),
    'media_bytes',  (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'ephemeral'),
    'media_files',  (select count(*) from storage.objects where bucket_id = 'ephemeral'),
    'db_bytes',     pg_database_size(current_database()),
    'reports_open', (select count(*) from public.reports where status = 'open'),
    'reports_7d',   (select count(*) from public.reports where created_at > t - interval '7 days'),
    'restricted',   (select count(*) from public.profiles where suspended_until > t),
    'plus_active',  (select count(*) from public.subscriptions where plus_until > t),
    'codes_open',   (select count(*) from public.redeem_codes where uses < max_uses and (expires_at is null or expires_at > t)),
    'ads_live',     (select count(*) from public.ads where active and coalesce(starts_at,'-infinity') <= t and coalesce(ends_at,'infinity') > t),
    'ad_views_7d',  (select count(*) from public.ad_events where kind = 'view'  and day > current_date - 7),
    'ad_clicks_7d', (select count(*) from public.ad_events where kind = 'click' and day > current_date - 7),
    'scheduled',    (select count(*) from public.scheduled_messages where sent_at is null and failed is null),
    'push_devices', (select count(*) from public.push_subscriptions),
    'cron',         (select coalesce(jsonb_agg(jsonb_build_object('job', jb.jobname, 'schedule', jb.schedule,
                       'last', (select jsonb_build_object('status', d.status, 'at', d.end_time, 'msg', left(d.return_message, 120))
                                  from cron.job_run_details d where d.jobid = jb.jobid order by d.runid desc limit 1),
                       'fails_24h', (select count(*) from cron.job_run_details d
                                      where d.jobid = jb.jobid and d.status = 'failed' and d.start_time > t - interval '24 hours'))
                       order by jb.jobname), '[]'::jsonb) from cron.job jb)
  ) into j;
  return j;
end $$;

------------------------------------------------------------------------------
-- execute grants: nothing new is callable by anon; sweep = service role only
------------------------------------------------------------------------------
revoke all on function public.media_visible(uuid), public.media_seen(uuid,text), public.media_open(uuid),
  public.media_remove(uuid), public.staff_remove_media(uuid,text), public.redeem_code(text),
  public.staff_make_codes(int,int,int,text), public.staff_grant_plus(uuid,int,text), public.ad_track(uuid,text),
  public.staff_ad_stats(), public.dm_streaks(), public.staff_overview(), public.deliver_scheduled_messages(),
  public.ephemeral_sweep_list(text,int), public.ephemeral_sweep_done(text,text[]),
  public.media_before_insert(), public.sched_before_insert(),
  internal.flag(text), internal.is_plus(uuid), internal.is_close(uuid,uuid), internal.new_code(), internal.sweep_token_ok(text)
  from public;
-- media_visible is called from RLS, which runs with the caller's privileges
grant execute on function public.media_visible(uuid), public.media_seen(uuid,text), public.media_open(uuid),
  public.media_remove(uuid), public.staff_remove_media(uuid,text), public.redeem_code(text),
  public.staff_make_codes(int,int,int,text), public.staff_grant_plus(uuid,int,text), public.ad_track(uuid,text),
  public.staff_ad_stats(), public.dm_streaks(), public.staff_overview(),
  internal.flag(text), internal.is_plus(uuid), internal.is_close(uuid,uuid)
  to authenticated;
grant execute on function public.ephemeral_sweep_list(text,int), public.ephemeral_sweep_done(text,text[]) to service_role;

------------------------------------------------------------------------------
-- realtime + cron
------------------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.media;      exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.app_config; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.subscriptions; exception when duplicate_object then null; end;
end $$;

select cron.unschedule(jobid) from cron.job where jobname in ('orbit-ephemeral-sweep','orbit-scheduled-msgs');
select cron.schedule('orbit-ephemeral-sweep', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://zdlevrezefagfqhflusj.supabase.co/functions/v1/ephemeral-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sweep-token', (select decrypted_secret from vault.decrypted_secrets where name = 'orbit_sweep_token')),
    body := '{}'::jsonb, timeout_milliseconds := 25000)
$cron$);
select cron.schedule('orbit-scheduled-msgs', '* * * * *', 'select public.deliver_scheduled_messages()');


------------------------------------------------------------------------------
-- follow-up 1 (`media_visibility_row_based`): the SELECT policy looked the row
-- up by id through a STABLE function, which reads the statement's snapshot —
-- so INSERT ... RETURNING (which must pass SELECT too) could never see the row
-- it had just inserted and every post failed with an RLS error. The policy now
-- judges the row's own columns.
------------------------------------------------------------------------------
create or replace function public.media_can_see(m_id uuid, m_owner uuid, m_purpose text, m_audience text,
  m_thread uuid, m_system uuid, m_vo boolean, m_opened timestamptz, m_expires timestamptz) returns boolean
language sql stable security definer set search_path = public, internal, pg_temp as $$
  select m_expires > now() and auth.uid() is not null and (
       m_owner = auth.uid()
    or (internal.is_support() and exists (select 1 from public.reports r where r.ref->>'media_id' = m_id::text))
    or (not public.chat_blocked_between(m_owner, auth.uid()) and (
          (m_purpose = 'story' and internal.are_friends(auth.uid(), m_owner)
             and (m_audience = 'friends' or internal.is_close(m_owner, auth.uid())))
       or (m_purpose = 'chat' and m_thread is not null and public.chat_dm_member(m_thread) and (not m_vo or m_opened is null))
       or (m_purpose = 'chat' and m_system is not null and public.chat_sys_member(m_system)))));
$$;
create or replace function public.media_visible(p_id uuid) returns boolean
language sql stable security definer set search_path = public, internal, pg_temp as $$
  select coalesce((select public.media_can_see(m.id, m.owner, m.purpose, m.audience, m.thread_id, m.system_id,
                                              m.view_once, m.opened_at, m.expires_at)
                     from public.media m where m.id = p_id), false);
$$;
drop policy if exists media_read on public.media;
create policy media_read on public.media for select to authenticated
  using (public.media_can_see(id, owner, purpose, audience, thread_id, system_id, view_once, opened_at, expires_at));
revoke all on function public.media_can_see(uuid,uuid,text,text,uuid,uuid,boolean,timestamptz,timestamptz) from public;
grant execute on function public.media_can_see(uuid,uuid,text,text,uuid,uuid,boolean,timestamptz,timestamptz) to authenticated;

------------------------------------------------------------------------------
-- follow-up 2 (`staff_sweep_now`): Mission Control → Content → "Run sweep now"
------------------------------------------------------------------------------
create or replace function public.staff_sweep_now() returns bigint
language plpgsql security definer set search_path = public, internal, pg_temp as $$
declare r bigint;
begin
  if not internal.is_founder() then raise exception 'Founder only'; end if;
  select net.http_post(
    url := 'https://zdlevrezefagfqhflusj.supabase.co/functions/v1/ephemeral-sweep',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sweep-token', (select decrypted_secret from vault.decrypted_secrets where name = 'orbit_sweep_token')),
    body := '{}'::jsonb, timeout_milliseconds := 25000) into r;
  insert into public.mod_actions (actor, action, note) values (auth.uid(), 'ran media sweep', null);
  return r;
end $$;
revoke all on function public.staff_sweep_now() from public;
grant execute on function public.staff_sweep_now() to authenticated;

------------------------------------------------------------------------------
-- follow-up 3 (`stories_plus_tighten_grants`), found by the security advisor:
-- Supabase's default privileges grant EXECUTE on every new public function to
-- anon AND authenticated DIRECTLY, so "revoke ... from public" above removed
-- nothing. Every function also checks its caller itself, but the grants are
-- now the first wall. Same family as the 2026-09-16 note: revoke from the role
-- that actually holds the grant.
------------------------------------------------------------------------------
revoke execute on function
  public.media_visible(uuid), public.media_can_see(uuid,uuid,text,text,uuid,uuid,boolean,timestamptz,timestamptz),
  public.media_seen(uuid,text), public.media_open(uuid), public.media_remove(uuid), public.staff_remove_media(uuid,text),
  public.redeem_code(text), public.staff_make_codes(int,int,int,text), public.staff_grant_plus(uuid,int,text),
  public.ad_track(uuid,text), public.staff_ad_stats(), public.dm_streaks(), public.staff_overview(), public.staff_sweep_now(),
  public.deliver_scheduled_messages(), public.ephemeral_sweep_list(text,int), public.ephemeral_sweep_done(text,text[]),
  public.media_before_insert(), public.sched_before_insert()
  from anon;
revoke execute on function
  public.deliver_scheduled_messages(), public.ephemeral_sweep_list(text,int), public.ephemeral_sweep_done(text,text[]),
  public.media_before_insert(), public.sched_before_insert()
  from authenticated;
-- pg_net can't SET SCHEMA; recreate it out of public (its functions live in `net` either way)
drop extension if exists pg_net;
create extension pg_net with schema extensions;
