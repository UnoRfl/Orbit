# Orbit — Maintainer's Guide

A map of what lives where, how data flows, and **where to look when someone reports a bug**.
Orbit is a no-build Preact + htm + Supabase app served as static files. Everything loads
natively through the import map in `index.html`, so you edit a file, commit, and it's live.

---

## 1. The one thing to understand first

Orbit has a **data hub**: `shell.js`.

`shell.js` is the only file that loads from Supabase and runs the live subscriptions. It
holds the app's state (who your friends are, their presence, your messages, events, etc.)
and passes that data **down into each tab as props**. The tab files (`home.js`, `map.js`,
`chat.js`…) mostly just *render what they're handed*.

That gives you a fast rule for triage:

> **"The data is wrong / stale / not updating"** → look in **`shell.js`** (loading + realtime).
> **"It looks wrong / the button does nothing"** → look in the **tab's own file**.

Keep that split in mind and most bug reports point themselves at a file.

---

## 2. File map — what each part owns

| File | Owns | Main pieces |
|------|------|-------------|
| `index.html` | The shell: `<head>`, import map, boot screen, entry `<script>` | — |
| `styles.css` | **Every** visual style (colors, spacing, layout, animations) | design tokens (`:root`) |
| `lib.js` | Vendor bindings (Preact, hooks, `html`, Supabase client `sb`) | one place to bump versions |
| `core.js` | Non-visual foundation: config, themes, catalogs, `store`, date/time & color helpers, icons | `ZONES`, `THEMES`, `fmt`, `ago`, `applyTheme`, `Ic*` |
| `components.js` | **Shared** UI reused across tabs | `Avatar`, `Sheet`, `Grid`, `AuthScreen`, `You` (profile view), `Bubble`, `Toggle` |
| `shell.js` | **Data hub** + navigation/layout. Loads Supabase, runs realtime, routes tabs | `Shell`, `ConfirmHost` |
| `home.js` | Home tab — who's free, friend dashboard, friends sheet | `Home`, `FriendDash`, `FriendsSheet` |
| `glyphs.js` | Orbit's symbol set. Symbols are stored by key (`'coffee'`); legacy emoji map via `toGlyph` | `Glyph`, `GlyphTile`, `Sym`, `*_SET` |
| `connect.js` | Live linked accounts — Discord presence via Lanyard (Spotify, games, status), GitHub | `LiveConnections`, `LiveLine`, `lanyard`, `github` |
| `map.js` | Map tab — overview (galaxy) and a system's real map, add system & place, sharing | `MapScreen`, `SystemPeople`, `NewSystemForm` |
| `galaxy.js` | The interactive galaxy on the Map tab (rAF-driven; no CSS transitions on nodes) | `Galaxy` |
| `updates.js` | Updates panel behind the top-bar button, unread per device | `UpdatesPanel`, `PublishUpdate` |
| `plans.js` | Plans tab — events, invites, pings, **schedule import** | `Plans`, `Creator`, `ImportSheet`, `parseScheduleFile` |
| `chat.js` | Chat tab — threads, messages, media/emoji, typing, streaks, send later | `ChatsScreen`, `ChatView`, `MediaPop`, `LaterPane` |
| `media.js` | 24-hour photos/videos: camera, on-device re-encode + trim, upload to the `ephemeral` bucket, viewing | `MediaComposer`, `Camera`, `SnapBubble`, `publishMedia`, `transcodeVideo` |
| `stories.js` | Stories: rail rings, full-screen viewer, reactions/replies, seen-by | `StoryViewer`, `StoryRing`, `groupStories` |
| `plus.js` | Orbit+ page — perks, redeem a code, aura picker | `PlusPage`, `PERKS` |
| `ads.js` | Ad slots and the staff Ads manager | `AdCard`, `AdsManager`, `pickAd` |
| `settings.js` | Settings tab — theme, background, account email/password | `Settings` |
| `staff.js` | Mission Control — live dashboard, reports (with story evidence), members, content, Orbit+ codes, ads, banner + kill switches, badges, log | `StaffPanel`, `ReportSheet` |
| `main.js` | App root, session boot, mount, and the ambient background canvas | `App` |

Dependencies only point **downward** — no cycles:
`lib → core → components → (home, map, plans, chat, settings, staff) → shell → main`

---

## 3. Bug triage — symptom → where to look

Find the row that matches the report. "Also check" is usually the backend/data side.

| A user reports… | Start in | Also check |
|-----------------|----------|-----------|
| Can't sign up / log in / Google login | `components.js` (`AuthScreen`) | Supabase → Auth settings; `main.js` (session) |
| "That password has shown up in … breaches" | `core.js` (`pwnedCount`) — intended; pick another password | api.pwnedpasswords.com reachable? (fails open) |
| Gets logged out randomly | `main.js` (session handling) | `shell.js` |
| Friend's status wrong / not updating live | `shell.js` (`orbit-live`, `presence`) | `home.js` (how it's shown) |
| Adding / accepting friends broken | `shell.js` (`friendships`) | `home.js` (`FriendsSheet`) |
| "Who's free" list wrong | `home.js` | `shell.js` (the data) |
| Planet in wrong spot / can't add planet or system | `map.js` | `core.js` (`decodePlace`, hue helpers) |
| System sharing / members / permissions | `map.js` (`SystemPeople`) | `shell.js` (`systems`, `system_members`) |
| Imported schedule has wrong times / classes | `plans.js` (`parseScheduleFile`) | `core.js` (`toMin`, `fmt`, `nowInfo`); `replace_classes` RPC |
| A plan shows on the wrong day / overnight plan wrong | `core.js` (`evSpan`, `evPieces`, `whenLabel`) | `plans.js` (`WhenPicker`); `events.starts_at/ends_at` |
| Spotify / game status missing on a profile | `connect.js` | the person joined discord.gg/lanyard? CSP `connect-src` in `tools/csp.py` |
| An icon shows as a word or a dot | `glyphs.js` (`GLYPHS`, the emoji map) | the stored value (`systems.glyph`, `planets.icon`, …) |
| Schedule grid looks off / blocks overlap | `components.js` (`Grid`) | `core.js` (`HOUR/START/END`), `styles.css` |
| Event / invite / ping not working | `plans.js` | `shell.js` (`events`, `pings`, `notifications`) |
| Messages won't send / receive | `chat.js` (`ChatView`) | `shell.js` (`orbit-chat`, `messages`, `dm_threads`) |
| Typing indicator stuck | `chat.js` (typing channel) | — |
| Images / GIFs / emoji in chat | `chat.js` (`MediaPop`, `EmojiPop`) | — |
| Profile edit / avatar / cover / badges wrong | `components.js` (`You`, `CoverImg`) | `core.js` (`badgesOf`, `flairOf`); `profiles` |
| Theme / background / sound won't save or sync | `settings.js` | `core.js` (`applyTheme`, `store`); `user_settings`; `window.__orbit` |
| Background animation laggy / glitchy | `main.js` (canvas section) | Settings "asteroids" toggle |
| Push notifications | `shell.js` (`push_subscriptions`) | `core.js` (`PUSH_PUBLIC_KEY`) |
| Moderation / reports | `staff.js` | `shell.js` (`reports`, `mod_actions`) |
| Story won't post / snap won't send | `media.js` (`mediaError` says why) | `media_before_insert` trigger; Controls → kill switches |
| A story or snap didn't disappear | nothing to fix in the app — RLS hides it at 24h | Mission Control → Background jobs → Media sweep; `ephemeral-sweep` function logs |
| Story rings / viewer wrong | `stories.js` | `shell.js` (`loadStories`, `orbit-media` channel) |
| Orbit+ didn't unlock after a code | `plus.js` | `redeem_code` RPC; `profiles_view.plus_until` |
| Send later never arrived | `chat.js` (`LaterPane`) | `scheduled_messages.failed` column; cron `orbit-scheduled-msgs` |
| Ads not showing | `ads.js` | the viewer is Orbit+? ad inactive / outside dates? Controls → Ads switch |
| Any color / font / spacing / size issue | `styles.css` | — |
| Wrong icon anywhere | `core.js` (`Ic*` set) | — |

---

## 4. Backend (Supabase)

- **Project:** `zdlevrezefagfqhflusj` · region `ap-southeast-2`. The URL + publishable key
  live in `core.js`. The publishable key is safe to ship publicly — **your safety net is
  Row Level Security (RLS), not key secrecy.** Every table must have RLS policies so users
  can only read/write their own rows. If data ever leaks or a user edits someone else's
  record, that's an RLS gap, not a code bug.
- **Auth** lives in three spots: sign-up / sign-in / OAuth in `components.js` (`AuthScreen`),
  session boot in `main.js`, email/password change in `settings.js`, sign-out in `shell.js`.
- **Realtime channels** (all started in `shell.js`): `orbit-live` (presence/friends),
  `orbit-log` (activity), `orbit-chat` (messages); plus a per-thread `typing:` channel in `chat.js`.
- **Tables by feature** (all read/written through `shell.js` unless noted):
  `profiles` (identity — also touched directly by `You` and `staff.js`), `friendships`,
  `presence`, `systems` / `system_members` / `planets` (map), `classes` (schedule),
  `events` / `event_invitees` / `pings` / `notifications` (plans), `dm_threads` / `messages` /
  `chat_reads` (chat), `user_settings` (settings sync), `reports` / `mod_actions` (staff),
  `push_subscriptions`, `updates`, `badge_defs`, `media` / `media_views` / `close_friends` (stories + snaps),
  `subscriptions` / `redeem_codes` (Orbit+), `scheduled_messages`, `ads` / `ad_events`, `app_config`.
- **24-hour media** lives in the private Storage bucket `ephemeral`. The database hides anything past
  `expires_at`; the `ephemeral-sweep` edge function (pg_cron every 15 min, token in Vault) deletes the files.
  SQL cannot delete storage objects (Supabase blocks it), which is why that function exists.

---

## 5. Making a change safely

The loop for **every** change, one feature at a time:

1. **Branch** off `main`, named for the change: `fix/chat-typing`, `feature/map-labels`.
2. Edit only the file(s) that own that feature (use the map above).
3. **Commit** with a clear message (`fix: stop typing indicator sticking`).
4. **Pull request → merge** into `main`. GitHub Pages redeploys automatically (~1 min).
5. If it breaks, the PR's **Revert** button puts you back instantly.

**Don't edit:** `styles.css` for logic, `lib.js` unless bumping a library, or anything in
`vendor/` except to upgrade it (the steps are in `vendor/README.md`, then `python tools/csp.py --write`).

---

## 6. Invariants (things that must stay true)

- **No emoji as symbols.** Anything that isn't someone's own words uses `glyphs.js`; emoji are for chat.
- **Plans are dated.** Compare plans through `evSpan`/`evPieces`, never `e.day`.
- **New external host?** Add it to the right directive in `tools/csp.py` (style-src too, for stylesheets), then `python tools/csp.py --write`.
- **Tests:** `node --import ./tests/setup.mjs --test tests/logic.test.mjs` — CI runs it on every push.

- **No build step.** Files load natively as ES modules. Every file imports what it uses from
  the layer below; imports point downward only — never make `core.js` import a tab file.
- **One writer per concern.** Supabase loading/subscriptions live in `shell.js`. Prefs live in
  `store` + `window.__orbit`. Don't scatter duplicates.
- **`html` comes from `lib.js`.** Every file that renders UI imports `html` (and hooks) from `lib.js`.
- **Publishable key + RLS.** The key in `core.js` is meant to be public; correctness and privacy
  depend on RLS policies in Supabase.
