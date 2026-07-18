# Orbit — Architecture

Orbit is a single-page app built with **Preact + htm + Supabase**, served as static
files (no build step). Everything loads natively in the browser through an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap)
in `index.html`, so the repo deploys to GitHub Pages exactly as-is — just commit and push.

## File layout

```
Orbit/
├── index.html        Lean shell: <head>, import map, boot markup, entry <script>
├── styles.css        All global styles (design tokens + layout)
├── lib.js            Vendor bindings: Preact, hooks, htm (`html`), Supabase client
├── core.js           Config, constants, data catalogs, `store`, helpers, icons
├── components.js     Reusable UI atoms (Avatar, Sheet, Grid, AuthScreen, …)
├── screens.js        Feature screens + the Shell (Home, Map, Plans, Chat, You, Settings, Staff)
├── main.js           `App` root, mount, and the ambient background canvas
├── manifest.webmanifest
├── sw.js             Service worker (PWA)
├── icon.png
└── tos.html
```

## How the modules depend on each other

Dependencies only ever point **downward** — there are no cycles.

```
lib.js  ←  core.js  ←  components.js  ←  screens.js  ←  main.js  (entry)
```

* **lib.js** — imports Preact/htm/Supabase from the CDN and re-exports the bound
  `html` tag, hooks, and the `sb` Supabase client. The one place vendor versions live.
* **core.js** — everything with no UI: campus zones, themes, activity catalog, the
  `store` (localStorage), formatting/date/color helpers, and the SVG icon set.
* **components.js** — small presentational pieces used across screens.
* **screens.js** — one exported component per feature area, plus `Shell` (the nav +
  layout wrapper that routes between tabs).
* **main.js** — mounts `<App/>` into `#app` and starts the background animation.

## Where do I change X?

| I want to…                                   | Open…            |
|----------------------------------------------|------------------|
| Add/rename a campus zone or theme            | `core.js`        |
| Fix a date/time or formatting bug            | `core.js`        |
| Tweak a shared avatar / sheet / grid         | `components.js`  |
| Change the Map / Chat / Settings screen      | `screens.js`     |
| Change nav, routing, or the app root         | `screens.js` (`Shell`) / `main.js` |
| Restyle anything                             | `styles.css`     |
| Bump a library version                       | `lib.js` + import map in `index.html` |

## Splitting `screens.js` further (optional next step)

`screens.js` is the largest file. When a single screen gets heavy, lift it into its
own module — the pattern is mechanical and safe:

1. Make a folder `screens/`.
2. Cut the screen's `export function MapScreen(){…}` (and any helper it *alone* uses)
   into `screens/map.js`.
3. At the top of that new file, `import` what it references from the layers below it:
   ```js
   import { html, useState, useEffect } from './lib.js';
   import { ZONES, store, fmt, ago } from './core.js';
   import { Sheet, Avatar } from './components.js';
   ```
4. In `screens.js`, replace the removed block with a re-export so nothing else breaks:
   ```js
   export { MapScreen } from './map.js';
   ```
5. Test the live page. If the screen renders, commit. Repeat one screen at a time.

Because ES modules resolve by the import graph (not file order), you can move code
freely as long as each file imports the names it uses. Do it **one screen per commit**
so any mistake is a one-line `git revert`, not a hunt through 3,500 lines.
