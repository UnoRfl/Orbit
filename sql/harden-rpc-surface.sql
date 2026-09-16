-- Shrink what an anonymous caller can invoke over /rest/v1/rpc/...
--
-- PART 1 IS ALREADY APPLIED to the live project (migration
-- harden_public_rpc_surface, 2026-09-16). It is kept here so the database can
-- be rebuilt from this folder.
--
-- PART 2 IS NOT APPLIED YET. Run it in the Supabase SQL editor.
--
-- Context: the Supabase security advisor flags every SECURITY DEFINER function
-- in `public` as callable from the REST API. Most of those flags are noise —
-- the functions do guard themselves (admin_* check internal.is_staff(),
-- dm_open and sys_set_chat_look require auth.uid(), chat_retention_sweep is
-- founder-or-cron). This is about reachability: a guard that is never reached
-- is a guard that cannot be got wrong later.


-- ============================================================
-- PART 1 — applied
-- ============================================================

-- Trigger functions were exposed as RPC endpoints purely by accident of living
-- in `public`. A trigger fires with the table owner's rights and Postgres does
-- not consult the calling role's EXECUTE privilege at fire time — it checks
-- once, at CREATE TRIGGER — so revoking here cannot affect the triggers.
revoke execute on function public.messages_before_insert()   from anon, authenticated, public;
revoke execute on function public.messages_after_insert()    from anon, authenticated, public;
revoke execute on function public.messages_before_update()   from anon, authenticated, public;
revoke execute on function public.dm_threads_before_update() from anon, authenticated, public;
revoke execute on function public.presence_clear_live()      from anon, authenticated, public;

-- presence_clear_live is the trigger that wipes live coordinates when you go
-- ghost or stop sharing, and it was the one function in `public` with no pinned
-- search_path. That is the standard escalation shape: whoever can influence
-- search_path chooses which `presence` the function writes to.
alter function public.presence_clear_live() set search_path = public, pg_temp;


-- ============================================================
-- PART 2 — still to run
-- ============================================================
--
-- The first attempt at this wrote `revoke execute ... from anon` and changed
-- nothing, silently. EXECUTE on a new function is granted to the PUBLIC
-- pseudo-role by default and anon inherits it from there — anon never held a
-- grant of its own, and revoking a grant a role does not hold is a no-op.
-- Revoke from PUBLIC, then hand EXECUTE back to the roles that need it.

revoke execute on function public.dm_open(uuid)                    from public, anon;
revoke execute on function public.sys_set_chat_look(uuid, jsonb)   from public, anon;
revoke execute on function public.chat_overview()                  from public, anon;
revoke execute on function public.chat_retention_sweep()           from public, anon;
revoke execute on function public.chat_blocked_between(uuid, uuid) from public, anon;

-- The app's own signed-in path.
grant execute on function public.dm_open(uuid)                  to authenticated;
grant execute on function public.sys_set_chat_look(uuid, jsonb) to authenticated;
grant execute on function public.chat_overview()                to authenticated;

-- chat_retention_sweep is the 90-day message purge: founder-or-cron only, and
-- the cron job runs as service_role. Signed-in users never call it directly.
grant execute on function public.chat_retention_sweep() to service_role;
grant execute on function public.presence_clear_live()  to service_role;

-- chat_blocked_between(x, y) answers "have these two blocked each other?" for
-- ANY pair of ids, as SECURITY DEFINER. The SECURITY DEFINER functions that
-- call it internally run as the owner and need no grant of their own, and no
-- RLS policy references it — so nothing needs it to be callable over HTTP.


-- ============================================================
-- Deliberately NOT touched
-- ============================================================
--
--   chat_dm_member(uuid)
--   chat_sys_member(uuid)
--   chat_is_founder()
--
-- The advisor flags these too, and they must stay as they are. All three are
-- referenced inside RLS policy expressions, and a policy is evaluated with the
-- querying role's own privileges. Revoking EXECUTE would not hide rows — it
-- would turn "this policy matches nothing" into a hard permission error on the
-- query. They already return false without an auth.uid().


-- ============================================================
-- Verify
-- ============================================================
--
-- select p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_exec,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
--        coalesce(array_to_string(p.proconfig, ','), '(none)')     as search_path
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and p.prosecdef
-- order by anon_exec desc, p.proname;
--
-- After part 2, the only functions left with anon_exec = true should be the
-- three RLS helpers above.


-- ============================================================
-- One thing this file cannot do
-- ============================================================
--
-- Leaked-password protection is off. Supabase Auth can check new passwords
-- against HaveIBeenPwned's breach corpus, and it is a dashboard toggle, not
-- SQL: Authentication -> Policies -> "Prevent use of leaked passwords".
-- Orbit is a school app, so a meaningful share of sign-ups will reuse a
-- password that is already in a dump. Worth switching on.
