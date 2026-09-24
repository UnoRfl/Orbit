# vendor/

Third-party ES modules, served from this repo instead of a CDN so the
Content-Security-Policy does not have to trust `esm.sh` — a host that will
serve *any* npm package to anyone who asks. `index.html`'s import map points
here; `lib.js` imports the bare names (`preact`, `htm`, …) exactly as before.

| file | package | from |
|---|---|---|
| `preact.mjs` | preact 10.23.2 | `https://esm.sh/preact@10.23.2/es2022/preact.mjs` |
| `hooks.mjs` | preact/hooks 10.23.2 | `https://esm.sh/preact@10.23.2/es2022/hooks.mjs` (imports `./preact.mjs`) |
| `htm.mjs` | htm 3.1.1 | `https://esm.sh/htm@3.1.1/es2022/htm.mjs` |
| `supabase.mjs` | @supabase/supabase-js 2.45.4 | `https://esm.sh/@supabase/supabase-js@2.45.4/es2022/supabase-js.bundle.mjs` |
| `buffer.mjs` | Node `buffer` polyfill | `https://esm.sh/node/buffer.mjs` (imported by `supabase.mjs`) |

Fetched 2026-09-24. The only edit to any file is the header comment, plus one
import path in `supabase.mjs` (`/node/buffer.mjs` → `./buffer.mjs`).

MapLibre is **not** here: it is ~800 KB and stays on cdnjs, pinned with
Subresource Integrity in `geomap.js`, so it cannot change underneath us either.

## Upgrading

1. Fetch the new `es2022` builds from the same URLs with the new version.
2. Make sure none of them import anything absolute (`from "/…"`) you haven't
   vendored: `grep -oE 'from ?"[^"]+"' vendor/*.mjs`.
3. Bump the versions in this table, then run the tests and load the app.
