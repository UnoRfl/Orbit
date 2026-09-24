# Orbit — Architecture

Orbit is a no-build **Preact + htm + Supabase** single-page app, served as static files.
Everything loads natively in the browser through the import map in `index.html` (which points at `vendor/`), so the repo
deploys to GitHub Pages as-is — commit and push.

## Layout

```
Orbit/
├── index.html        Shell: <head>, import map, boot markup, entry <script>
├── styles.css        All global styles
├── lib.js            Vendor bindings: Preact, hooks, htm (html), Supabase client
├── vendor/           Self-hosted preact, htm, supabase-js (see vendor/README.md)
├── glyphs.js         Orbit's own symbol set (Glyph, GlyphTile, Sym) — no emoji as symbols
├── core.js           Config, themes, catalogs, store, helpers, icons, plan time (evSpan…)
├── connect.js        Live linked accounts: Discord via Lanyard, GitHub
├── components.js     Shared UI (Avatar, Sheet, Grid, AuthScreen, You, Bubble, Toggle…)
├── shell.js          Data hub + navigation (loads Supabase, runs realtime, routes tabs)
├── home.js           Home tab
├── map.js            Map tab (overview + a system's real map)
├── galaxy.js         The Map tab's interactive galaxy overview
├── geomap.js · live.js  Real map (MapLibre) · live location
├── updates.js        Updates panel (top-bar button)
├── plans.js          Plans + schedule import
├── chat.js           Chat (snaps, streaks, send later)
├── media.js          24h photos/videos: camera, on-device re-encode, upload, SnapBubble
├── stories.js        Stories rail rings, full-screen viewer, seen-by
├── plus.js           Orbit+ page, perks, redeem codes, aura picker
├── ads.js            Ad slots (home / chats / stories) + the staff Ads manager
├── settings.js       Settings
├── staff.js          Mission Control: dashboard, reports, members, content, Orbit+, ads, controls
├── main.js           App root, session boot, background canvas
├── manifest.webmanifest · sw.js · icon.png · tos.html
├── avatars/          17 premade profile pictures (SVG)
├── tests/            node:test unit tests (run in CI — .github/workflows/tests.yml)
└── sql/             Migrations, applied and pending (see sql/README.md)
```

Dependencies point downward only (no cycles):
`lib → glyphs → core → connect → components → media → (stories, plus, ads) → (home, map+galaxy+geomap+live, plans, chat, settings, staff, updates) → shell → main`

## Full maintainer's guide

**See [`GUIDE.md`](./GUIDE.md)** for the complete blueprint: what each file owns, a
**bug-triage map** (symptom → file to check), the Supabase data flow, and the safe
change workflow.
