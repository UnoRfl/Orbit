# sql/

Migrations that have been **reviewed but not applied**. Everything else already
ran against the live project through the Supabase MCP.

| file | status |
|---|---|
| `rls-initplan.sql` | **applied 2026-09-24** (lookbehind-guarded regex — see the file) |
| `redesign-2026-09-24.sql` | **applied 2026-09-24** — dated/overnight plans, account/report/schedule RPCs, private typing channels |
| `stories-plus-2026-09-24.sql` | **applied 2026-09-24** (4 migrations) — `ephemeral` bucket, `media` / `media_views` / `close_friends`, Orbit+ (`subscriptions`, redeem codes), `scheduled_messages`, `ads` / `ad_events`, `app_config`, `staff_overview()`, `dm_streaks()`, sweep + send-later cron jobs |
| `plus-v2-2026-09-24.sql` | **applied 2026-09-24** — `subscriptions.since` (evolving badge), `messages.fx` (message effects, Plus-only via trigger) |
| `audit-2026-09-24.sql` | **applied 2026-09-24** — column grants matching what the client writes, tighter notification/report/membership policies, server-side expiry of live coordinates |

## Already applied (2026-09-11)

- `planets.lat` / `planets.lng` (nullable, range-checked) for real map coordinates.
- Covering indexes for the 14 foreign keys that had none.
- `REVOKE EXECUTE` on the four trigger functions, which were exposed as callable
  RPCs but can never usefully be called that way.
- `REVOKE EXECUTE ... FROM anon` on `chat_retention_sweep`, `sys_set_chat_look`,
  `dm_open`, `chat_overview`. `chat_retention_sweep` guards with
  `if auth.uid() is not null and not chat_is_founder() then raise`, so a
  *signed-out* caller fell straight through the guard and ran the delete.
- All 18 rows of `planets` deleted, so places get re-pinned on real coordinates.
  `systems`, `system_members` and every message were deliberately left intact.

`chat_is_founder` / `chat_dm_member` / `chat_sys_member` / `chat_blocked_between`
are deliberately still granted despite the advisor flagging them: they are called
from inside RLS policy expressions, which are evaluated with the caller's
privileges, so revoking EXECUTE would break row access rather than tighten it.
