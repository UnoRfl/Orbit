-- ---------------------------------------------------------------------------
-- Fix: "Auth RLS Initialization Plan" (88 policies)
--
-- Every policy that writes auth.uid() bare has it re-evaluated once PER ROW.
-- Wrapping it as (select auth.uid()) lets Postgres hoist it into an InitPlan
-- and evaluate it once per query instead. The predicate is otherwise identical,
-- so permissions do not change — only how often the function is called.
--
-- STATUS: reviewed, NOT applied.
-- Deliberately deferred: with ~16 users and ~120 messages the win is currently
-- nil, while rewriting every security policy at once carries real present-tense
-- risk. Run it when the tables get big enough for it to matter.
--
-- This is written as a loop over pg_policies rather than 88 hand-pasted
-- statements so it stays correct as policies are added or edited. It is
-- idempotent: policies already using (select auth.…) are skipped.
--
-- To preview without changing anything, set _dry_run to true.
-- ---------------------------------------------------------------------------

do $$
declare
  _dry_run  boolean := false;   -- true = RAISE NOTICE the statements, change nothing
  r         record;
  new_qual  text;
  new_check text;
  stmt      text;
  n         int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.(uid|role|jwt)\(\)' or with_check ~ 'auth\.(uid|role|jwt)\(\)')
    order by tablename, policyname
  loop
    -- \m anchors at a word boundary so an already-wrapped (select auth.uid())
    -- is matched too; the guard below is what actually skips those.
    new_qual  := regexp_replace(r.qual,       '\mauth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');
    new_check := regexp_replace(r.with_check, '\mauth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'g');

    -- already hoisted? nothing to do
    if coalesce(r.qual, '')       ~ '\(\s*[Ss][Ee][Ll][Ee][Cc][Tt]\s+auth\.'
       and coalesce(r.with_check, '') ~ '\(\s*[Ss][Ee][Ll][Ee][Cc][Tt]\s+auth\.' then
      continue;
    end if;

    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
         || coalesce(' using (' || new_qual || ')', '')
         || coalesce(' with check (' || new_check || ')', '');

    if _dry_run then
      raise notice '%', stmt;
    else
      execute stmt;
    end if;
    n := n + 1;
  end loop;

  raise notice 'rls-initplan: % policies %', n, case when _dry_run then 'previewed' else 'rewritten' end;
end $$;

-- Verify afterwards: this should come back empty, and the Supabase performance
-- advisor should no longer report auth_rls_initplan.
--
--   select tablename, policyname
--   from pg_policies
--   where schemaname = 'public'
--     and (qual ~ '(?<!select )auth\.(uid|role|jwt)\(\)'
--       or with_check ~ '(?<!select )auth\.(uid|role|jwt)\(\)');
