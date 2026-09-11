/* Orbit Service - Property Of Unosys
   ------------------------------------------------------------------
   Two jobs: web push (unchanged), and caching so the app opens
   instantly on a phone instead of re-downloading every module over
   campus wifi on every single launch.

   Caching strategy, and why:
   · Orbit has no build step, so filenames never carry a content hash
     and a precache MANIFEST would have to be hand-bumped on every
     deploy. Instead everything is cached as it is first fetched.
   · Code (js/css) is NETWORK-FIRST, falling back to cache. It used
     to be stale-while-revalidate, which is faster but means the first
     load after a deploy mixes new modules with last deploy's
     stylesheet. That is not a theoretical risk: it silently broke the
     map view, because the JS shipped a component whose CSS the cached
     stylesheet did not have yet. Silent version skew is far worse
     than a few hundred ms, and offline still works via the fallback.
   · Passive assets (images, fonts) stay stale-while-revalidate: they
     are the big ones, and they do not version-skew against code.
   · Navigations are network-first so a fresh deploy shows up right
     away when there is signal, falling back to the cached shell when
     there isn't — that is what makes the app work offline at all.
   · Only same-origin GETs are touched. Supabase (auth, data, realtime)
     and any other cross-origin call always goes straight to the
     network, so nothing stale or private ever lands in the cache.

   Bump VERSION to evict everything at once.
   ------------------------------------------------------------------ */
const VERSION = 'orbit-v2';
const SHELL   = './index.html';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.add(new Request(SHELL, { cache: 'reload' })))
      .catch(() => {})            // a failed precache must never block activation
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const CODE    = /\.(?:js|mjs|css)$/i;                                   // must never version-skew
const PASSIVE = /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|json|webmanifest)$/i;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Supabase & friends: untouched

  // Navigations: network first, cached shell as the offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(SHELL, copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match(SHELL).then(hit => hit || Response.error()))
    );
    return;
  }

  const isCode = CODE.test(url.pathname);
  if (!isCode && !PASSIVE.test(url.pathname)) return;

  const save = res => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  };

  if (isCode) {
    // Network first: a deploy is live immediately, and the cache only answers
    // when the network genuinely cannot.
    e.respondWith(fetch(req).then(save).catch(() =>
      caches.match(req).then(hit => hit || Response.error())));
    return;
  }

  // Passive: serve the cached copy at once, refresh it behind the scenes.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(save).catch(() => hit);
      return hit || net;
    })
  );
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Orbit', {
    body: d.body || '',
    icon: 'icon.png',
    badge: 'icon.png',
    tag: d.tag || undefined,
    data: d.data || {},
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow('./');
  }));
});
