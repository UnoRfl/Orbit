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
| `map.js` | Map tab — galaxy/systems/planets, add system & planet, sharing | `MapScreen`, `SystemPeople`, `NewSystemForm` |
| `plans.js` | Plans tab — events, invites, pings, **schedule import** | `Plans`, `Creator`, `ImportSheet`, `parseScheduleFile` |
| `chat.js` | Chat tab — threads, messages, media/emoji, typing | `ChatsScreen`, `ChatView`, `MediaPop` |
| `settings.js` | Settings tab — theme, background, account email/password | `Settings` |
| `staff.js` | Moderation panel + report handling | `StaffPanel`, `ReportSheet` |
| `main.js` | App root, session boot, mount, and the ambient background canvas | `App` |

Dependencies only point **downward** — no cycles:
`lib → core → components → (home, map, plans, chat, settings, staff) → shell → main`

---

## 3. Bug triage — symptom → where to look

Find the row that matches the report. "Also check" is usually the backend/data side.

| A user reports… | Start in | Also check |
|-----------------|----------|-----------|
| Can't sign up / log in / Google login | `components.js` (`AuthScreen`) | Supabase → Auth settings; `main.js` (session) |
| Gets logged out randomly | `main.js` (session handling) | `shell.js` |
| Friend's status wrong / not updating live | `shell.js` (`orbit-live`, `presence`) | `home.js` (how it's shown) |
| Adding / accepting friends broken | `shell.js` (`friendships`) | `home.js` (`FriendsSheet`) |
| "Who's free" list wrong | `home.js` | `shell.js` (the data) |
| Planet in wrong spot / can't add planet or system | `map.js` | `core.js` (`decodePlace`, hue helpers) |
| System sharing / members / permissions | `map.js` (`SystemPeople`) | `shell.js` (`systems`, `system_members`) |
| Imported schedule has wrong times / classes | `plans.js` (`parseScheduleFile`) | `core.js` (`toMin`, `fmt`, `nowInfo`) |
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
  `push_subscriptions`, `updates`, `badge_defs`.

---

## 5. Making a change safely

The loop for **every** change, one feature at a time:

1. **Branch** off `main`, named for the change: `fix/chat-typing`, `feature/map-labels`.
2. Edit only the file(s) that own that feature (use the map above).
3. **Commit** with a clear message (`fix: stop typing indicator sticking`).
4. **Pull request → merge** into `main`. GitHub Pages redeploys automatically (~1 min).
5. If it breaks, the PR's **Revert** button puts you back instantly.

**Don't edit:** `styles.css` for logic, `lib.js` unless bumping a library (also update the
import map in `index.html` if you do), or vendored library code (it's loaded from a CDN, not
in the repo).

---

## 6. Invariants (things that must stay true)

- **No build step.** Files load natively as ES modules. Every file imports what it uses from
  the layer below; imports point downward only — never make `core.js` import a tab file.
- **One writer per concern.** Supabase loading/subscriptions live in `shell.js`. Prefs live in
  `store` + `window.__orbit`. Don't scatter duplicates.
- **`html` comes from `lib.js`.** Every file that renders UI imports `html` (and hooks) from `lib.js`.
- **Publishable key + RLS.** The key in `core.js` is meant to be public; correctness and privacy
  depend on RLS policies in Supabase.
