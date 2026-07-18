# Orbit — Architecture

Orbit is a no-build **Preact + htm + Supabase** single-page app, served as static files.
Everything loads natively in the browser through the import map in `index.html`, so the repo
deploys to GitHub Pages as-is — commit and push.

## Layout

```
Orbit/
├── index.html        Shell: <head>, import map, boot markup, entry <script>
├── styles.css        All global styles
├── lib.js            Vendor bindings: Preact, hooks, htm (html), Supabase client
├── core.js           Config, themes, catalogs, store, helpers, icons
├── components.js     Shared UI (Avatar, Sheet, Grid, AuthScreen, You, Bubble, Toggle…)
├── shell.js          Data hub + navigation (loads Supabase, runs realtime, routes tabs)
├── home.js           Home tab
├── map.js            Map / galaxy tab
├── plans.js          Plans + schedule import
├── chat.js           Chat
├── settings.js       Settings
├── staff.js          Moderation panel
├── main.js           App root, session boot, background canvas
├── manifest.webmanifest · sw.js · icon.png · tos.html
```

Dependencies point downward only (no cycles):
`lib → core → components → (home, map, plans, chat, settings, staff) → shell → main`

## Full maintainer's guide

**See [`GUIDE.md`](./GUIDE.md)** for the complete blueprint: what each file owns, a
**bug-triage map** (symptom → file to check), the Supabase data flow, and the safe
change workflow.
