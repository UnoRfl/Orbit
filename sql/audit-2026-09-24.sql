-- Orbit security audit, 2026-09-24. Every hole below was reachable with
-- nothing but the public publishable key and a normal account.
-- STATUS: applied 2026-09-24 (migration `security_audit_2026_09_24`), without
-- the explicit begin/commit — apply_migration runs it as one transaction.
--
-- The pattern behind most of them: an UPDATE policy checks WHO owns the row
-- but the table grants UPDATE on EVERY column, so the owner can rewrite the
-- columns that decide what the row means (which system, which recipient, who
-- sent it). The fix is column grants that match what the client actually
-- writes, so the policy only ever has to judge the columns it was written for.
--
-- Postgres note: revoking a table-level privilege also revokes the matching
-- column-level ones, so each "revoke ... on table" below is followed by the
-- exact column grant the app needs.

begin;

------------------------------------------------------------------------------
-- 1. system_members — join ANY system (HIGH)
--    sysmem_update only pinned user_id = me and role = 'member'. Create a
--    system of your own, then UPDATE your leader row with a new system_id:
--    you are now an accepted member of the target, with its chat, members
--    and places. The client only ever writes `status` (accept an invite).
------------------------------------------------------------------------------
revoke update on public.system_members from anon, authenticated;
grant  update (status) on public.system_members to authenticated;

drop policy if exists sysmem_update on public.system_members;
create policy sysmem_update on public.system_members for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'accepted');

------------------------------------------------------------------------------
-- 2. systems — owner / chat_look / id reachable by non-owners (MEDIUM)
--    guard_system_update blocks owner/name/permission changes by members,
--    but chat_look could be written directly with no size or shape check
--    (sys_set_chat_look validates; a raw UPDATE skipped it).
------------------------------------------------------------------------------
revoke update on public.systems from anon, authenticated;
grant  update (name, glyph, hue, members_can_add, members_can_style)
  on public.systems to authenticated;

alter table public.systems drop constraint if exists systems_look_shape;
alter table public.systems add constraint systems_look_shape
  check (jsonb_typeof(chat_look) = 'object' and octet_length(chat_look::text) <= 4000);
alter table public.systems drop constraint if exists systems_glyph_len;
alter table public.systems add constraint systems_glyph_len
  check (char_length(glyph) <= 8);

------------------------------------------------------------------------------
-- 3. messages — backdated messages bypass the rate limit (MEDIUM)
--    created_at was client-writable. The 8-per-10s limit counts rows with
--    created_at > now() - 10s, so sending created_at = '2000-01-01' made
--    every message invisible to it. Also let a sender pin a message to the
--    top of a thread forever with a future date. The immutable-fields
--    trigger already protected UPDATE; INSERT is now column-limited too.
------------------------------------------------------------------------------
revoke insert, update on public.messages from anon, authenticated;
grant  insert (sender, kind, body, thread_id, system_id) on public.messages to authenticated;
grant  update (body, deleted) on public.messages to authenticated;

------------------------------------------------------------------------------
-- 4. notifications — forge a notification from anyone, to anyone (HIGH)
--    notifs_insert only required actor = me, and every column was updatable
--    with no WITH CHECK. So: insert a notification to yourself, then UPDATE
--    it to actor = <founder's id>, kind = 'moderation', title = 'Your
--    account has been banned', user_id = <victim>. It lands in the victim's
--    inbox as an official staff action. Blocks were not consulted either.
------------------------------------------------------------------------------
revoke update on public.notifications from anon, authenticated;
grant  update (read) on public.notifications to authenticated;

create or replace function internal.can_notify(target uuid)
returns boolean language sql stable security definer
set search_path = internal, public, pg_temp as $$
  select target is not null
     and target <> auth.uid()
     and not public.chat_blocked_between(auth.uid(), target)
     and (
          internal.are_friends(auth.uid(), target)
       or exists (select 1 from public.system_members a
                    join public.system_members b on b.system_id = a.system_id
                   where a.user_id = auth.uid() and b.user_id = target)
       or exists (select 1 from public.events e
                    join public.event_invitees i on i.event_id = e.id
                   where (e.host = target      and i.invitee = auth.uid())
                      or (e.host = auth.uid()  and i.invitee = target))
     );
$$;
revoke all on function internal.can_notify(uuid) from public;
grant execute on function internal.can_notify(uuid) to authenticated;

drop policy if exists notifs_insert on public.notifications;
create policy notifs_insert on public.notifications for insert to authenticated
  with check (
    actor = (select auth.uid())
    and kind in ('event_invite','cosmic_invite','event_going','system_invite','system_joined')
    and internal.can_notify(user_id)
  );

drop policy if exists notifs_update on public.notifications;
create policy notifs_update on public.notifications for update to authenticated
  using      (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.notifications drop constraint if exists notifications_sizes;
alter table public.notifications add constraint notifications_sizes check (
      char_length(coalesce(title, '')) <= 120
  and char_length(coalesce(body,  '')) <= 400
  and octet_length(coalesce(data, '{}'::jsonb)::text) <= 1000);

------------------------------------------------------------------------------
-- 5. reports — fabricated evidence and unlimited spam (MEDIUM)
--    `ref.snippet` came from the reporter's client, so a report could quote
--    a message the target never sent. `created_on` was writable, so the
--    one-report-per-day unique index was bypassed by picking a new date,
--    and `status`/`handled_by` could be pre-set to 'resolved'.
------------------------------------------------------------------------------
revoke insert, update on public.reports from anon, authenticated;
grant  insert (reporter, target, kind, reason, ref, ref_id) on public.reports to authenticated;
grant  update (status, handled_by) on public.reports to authenticated;

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports for update to authenticated
  using (internal.is_staff()) with check (internal.is_staff());

create or replace function public.reports_before_insert()
returns trigger language plpgsql security definer
set search_path = public, internal, pg_temp as $$
declare m public.messages; mid uuid;
begin
  new.status := 'open'; new.handled_by := null;
  if new.kind = 'message' then
    begin mid := (new.ref->>'message_id')::uuid;
    exception when others then raise exception 'bad message reference'; end;
    select * into m from public.messages where id = mid;
    if m.id is null or m.sender <> new.target then
      raise exception 'bad message reference';
    end if;
    -- the reporter must actually be able to see the message they report
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
      'snippet', case when m.deleted then '' else left(m.body, 140) end);
  elsif new.ref is not null and octet_length(new.ref::text) > 1000 then
    raise exception 'report too large';
  end if;
  return new;
end $$;
revoke all on function public.reports_before_insert() from public, anon, authenticated;

drop trigger if exists trg_reports_before_insert on public.reports;
create trigger trg_reports_before_insert before insert on public.reports
  for each row execute function public.reports_before_insert();

------------------------------------------------------------------------------
-- 6. planets — move a place into another system / re-attribute it (LOW)
--    planets_update had no WITH CHECK and every column was writable. The
--    client only moves a pin (lat/lng); name/icon stay editable.
------------------------------------------------------------------------------
revoke update on public.planets from anon, authenticated;
grant  update (name, icon, lat, lng) on public.planets to authenticated;

drop policy if exists planets_update on public.planets;
create policy planets_update on public.planets for update to authenticated
  using      (created_by = (select auth.uid()) or internal.is_sys_leader(system_id))
  with check (created_by = (select auth.uid()) or internal.is_sys_leader(system_id));

-- icon was rendered through innerHTML on every member's map (geomap.js pinEl).
-- The client now escapes it; this keeps markup out of the column regardless.
alter table public.planets drop constraint if exists planets_icon_len;
alter table public.planets add constraint planets_icon_len
  check (char_length(icon) <= 8 and icon !~ '[<>"''&]');

------------------------------------------------------------------------------
-- 7. mod_actions — staff could backdate / rewrite log entries (LOW)
------------------------------------------------------------------------------
revoke insert, update, delete on public.mod_actions from anon, authenticated;
grant  insert (actor, action, target, note) on public.mod_actions to authenticated;

------------------------------------------------------------------------------
-- 8. Unbounded free-text columns (LOW — storage abuse, UI breakage)
--    All current rows were measured and fit well inside these limits.
------------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_text_sizes;
alter table public.profiles add constraint profiles_text_sizes check (
      char_length(coalesce(display_name, '')) <= 60
  and char_length(coalesce(course, ''))       <= 100
  and char_length(coalesce(school, ''))       <= 100
  and octet_length(coalesce(flair, 'null'::jsonb)::text) <= 400);
alter table public.profiles drop constraint if exists profiles_accents_hex;
alter table public.profiles add constraint profiles_accents_hex check (
      (accent1 is null or accent1 ~ '^#[0-9a-fA-F]{6}$')
  and (accent2 is null or accent2 ~ '^#[0-9a-fA-F]{6}$'));

alter table public.user_settings drop constraint if exists user_settings_sizes;
alter table public.user_settings add constraint user_settings_sizes check (
      octet_length(coalesce(prefs,  'null'::jsonb)::text) <= 16000
  and octet_length(coalesce(blocks, 'null'::jsonb)::text) <= 40000
  and octet_length(coalesce(theme::text, '')) <= 64);

alter table public.presence drop constraint if exists presence_zone_len;
alter table public.presence add constraint presence_zone_len
  check (zone is null or char_length(zone) <= 600);

------------------------------------------------------------------------------
-- 9. can_push — the same reachability rule as in-app notifications (friends,
--    a shared system, or a shared event; never across a block), callable with
--    a user's JWT so server-side senders can ask it on the caller's behalf.
------------------------------------------------------------------------------
create or replace function public.can_push(p_target uuid)
returns boolean language sql stable security definer
set search_path = internal, public, pg_temp as $$
  select auth.uid() is not null and internal.can_notify(p_target);
$$;
revoke all on function public.can_push(uuid) from public, anon;
grant execute on function public.can_push(uuid) to authenticated;

------------------------------------------------------------------------------
-- 10. Live coordinates outliving their session (MEDIUM, privacy)
--     stop() nulls them, but only if the app is still open when the timer
--     fires. Close the tab mid-share and the last fix stayed in the row —
--     and readable by friends — indefinitely, since presence_read does not
--     look at live_until. Sweep every 10 minutes.
------------------------------------------------------------------------------
create or replace function public.presence_expire_live()
returns void language sql security definer
set search_path = public, pg_temp as $$
  update public.presence
     set live_lat = null, live_lng = null, live_acc = null, live_until = null
   where live_until is not null and live_until < now();
$$;
revoke all on function public.presence_expire_live() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'orbit-live-expiry';
select cron.schedule('orbit-live-expiry', '*/10 * * * *', 'select public.presence_expire_live()');

------------------------------------------------------------------------------
-- 11. Image framing positions reach style strings (LOW, defence in depth)
--     avatar_pos / cover_pos are rendered as --cx/--cy/--cz. The client now
--     clamps them to numbers; the column should only ever hold numbers too.
------------------------------------------------------------------------------
create or replace function internal.is_pos(j jsonb)
returns boolean language sql immutable
set search_path = pg_catalog as $$
  select j is null or j = 'null'::jsonb or (
    jsonb_typeof(j) = 'object'
    and octet_length(j::text) <= 120
    and not exists (select 1 from jsonb_each(j) e
                     where e.key not in ('x','y','z') or jsonb_typeof(e.value) <> 'number'));
$$;
alter table public.profiles drop constraint if exists profiles_pos_shape;
alter table public.profiles add constraint profiles_pos_shape
  check (internal.is_pos(avatar_pos) and internal.is_pos(cover_pos));

commit;
