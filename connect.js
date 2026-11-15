/* Orbit — live connections: what a linked account is doing right now.
   See GUIDE.md for the full map of what lives where.

   Everything here is free and keyless:
   · Discord via Lanyard (api.lanyard.rest). Lanyard mirrors a Discord user's
     presence — Spotify, the game they're in and for how long, custom status —
     for anyone who has joined its Discord server. The user opts in twice:
     by joining that server, and by putting their Discord user ID on Orbit.
   · GitHub via its public REST API (60 requests/hour per viewer, so results
     are cached for ten minutes per browser).
   Spotify on its own would need an OAuth app capped at 25 users in Spotify's
   development mode, so it comes through Discord instead.

   TRUST: every string that arrives here was written by whoever owns that
   account. It is rendered as text only (Preact escapes it), and images are
   only ever built from fixed CDN templates with validated ids — a value from
   the API is never used as a URL on its own.

   COST: polling is 30s for Lanyard, only while a card that needs it is mounted
   and the tab is visible; concurrent cards share one request per user. */
import { html, useEffect, useState } from './lib.js';
import { Glyph } from './glyphs.js';

export const DISCORD_ID = /^\d{17,20}$/;
const SAFE = /^[\w.-]{1,120}$/;
const SAFE_PATH = /^[\w./%-]{1,300}$/;

/* ---------------- shared fetch cache ---------------- */
const cache = new Map();      // key -> { at, data, err, p }
async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.p || hit.data);
  const p = fn().then(data => { cache.set(key, { at: Date.now(), data }); return data; },
                      err  => { cache.set(key, { at: Date.now(), data: null, err: String(err?.message || err) }); return null; });
  cache.set(key, { at: Date.now(), data: hit?.data ?? null, p });
  return p;
}
export const lastError = key => cache.get(key)?.err || null;

/* ---------------- Discord (Lanyard) ---------------- */
export function lanyard(id, ttl = 25e3) {
  if (!DISCORD_ID.test(String(id || ''))) return Promise.resolve(null);
  return cached('ly:' + id, ttl, async () => {
    const r = await fetch(`https://api.lanyard.rest/v1/users/${id}`, { cache: 'no-store' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.success) throw new Error(j?.error?.code === 'user_not_monitored' ? 'not_monitored' : 'unavailable');
    return j.data;
  });
}
const visible = () => typeof document === 'undefined' || !document.hidden;
/* Holds { d } rather than d: a failed fetch resolves to null, and null -> null
   is not a state change, so the component would never re-render to show why. */
function usePoll(key, fn, every) {
  const [v, setV] = useState({ d: null });
  useEffect(() => {
    if (!key) { setV({ d: null }); return; }
    let dead = false;
    const run = () => { if (visible()) fn().then(d => { if (!dead) setV({ d }); }); };
    run();
    const t = every ? setInterval(run, every) : 0;
    const vis = () => { if (visible()) run(); };
    document.addEventListener('visibilitychange', vis);
    return () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [key]);
  return v.d;
}
export const useLanyard = id => usePoll(DISCORD_ID.test(String(id || '')) ? id : null, () => lanyard(id), 30e3);

export const discordAvatar = d => {
  const u = d?.discord_user;
  return u && DISCORD_ID.test(u.id) && u.avatar && SAFE.test(u.avatar)
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256` : null;
};
// activity art: app assets, or Discord's media proxy for external images
function assetUrl(appId, key) {
  if (!key) return null;
  if (key.startsWith('mp:external/')) { const rest = key.slice(12); return SAFE_PATH.test(rest) ? `https://media.discordapp.net/external/${rest}` : null; }
  if (key.startsWith('spotify:')) { const id = key.slice(8); return SAFE.test(id) ? `https://i.scdn.co/image/${id}` : null; }
  return DISCORD_ID.test(String(appId || '')) && SAFE.test(key) ? `https://cdn.discordapp.com/app-assets/${appId}/${key}.png` : null;
}
const spotifyArt = u => (typeof u === 'string' && /^https:\/\/i\.scdn\.co\/image\/[\w]+$/.test(u)) ? u : null;
const txt = (v, n = 120) => (typeof v === 'string' ? v : '').slice(0, n);

// what the widget shows, pulled out of Lanyard's shape once
export function presenceOf(d) {
  if (!d) return null;
  const acts = Array.isArray(d.activities) ? d.activities : [];
  const custom = acts.find(a => a.type === 4);
  const sp = d.listening_to_spotify && d.spotify ? {
    kind: 'spotify', title: txt(d.spotify.song), sub: txt(d.spotify.artist).replace(/;/g, ','), album: txt(d.spotify.album),
    art: spotifyArt(d.spotify.album_art_url), start: +d.spotify.timestamps?.start || null, end: +d.spotify.timestamps?.end || null,
    track: SAFE.test(d.spotify.track_id || '') ? d.spotify.track_id : null,
  } : null;
  const others = acts.filter(a => a.type !== 4 && !(a.type === 2 && a.name === 'Spotify')).slice(0, 2).map(a => ({
    kind: ['playing', 'streaming', 'listening', 'watching', null, 'competing'][a.type] || 'playing',
    title: txt(a.name, 60), sub: txt(a.details), line: txt(a.state),
    art: assetUrl(a.application_id, a.assets?.large_image), start: +a.timestamps?.start || null, end: +a.timestamps?.end || null,
  }));
  return {
    status: ['online', 'idle', 'dnd'].includes(d.discord_status) ? d.discord_status : 'offline',
    custom: custom ? txt(custom.state, 80) : '',
    items: [...(sp ? [sp] : []), ...others],
    user: txt(d.discord_user?.global_name || d.discord_user?.username, 40),
  };
}
export const liveLine = p => {
  const it = p?.items?.[0]; if (!it) return p?.custom || '';
  return it.kind === 'spotify' ? `Listening to ${it.title} — ${it.sub}`
       : `${{ playing: 'Playing', streaming: 'Streaming', listening: 'Listening to', watching: 'Watching', competing: 'Competing in' }[it.kind]} ${it.title}`;
};

/* ---------------- GitHub ---------------- */
function lsGet(k) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v && Date.now() - v.at < 6e5 ? v.data : null; } catch { return null; } }
function lsSet(k, data) { try { localStorage.setItem(k, JSON.stringify({ at: Date.now(), data })); } catch {} }
export function github(user) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(String(user || ''))) return Promise.resolve(null);
  const key = 'orbit.gh.' + user.toLowerCase();
  const hit = lsGet(key); if (hit) return Promise.resolve(hit);
  return cached('gh:' + user, 6e5, async () => {
    const [u, ev] = await Promise.all([
      fetch(`https://api.github.com/users/${user}`).then(r => r.ok ? r.json() : Promise.reject(new Error('gh ' + r.status))),
      fetch(`https://api.github.com/users/${user}/events/public?per_page=10`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]);
    const last = Array.isArray(ev) ? ev.find(e => ['PushEvent', 'CreateEvent', 'PullRequestEvent', 'ReleaseEvent', 'WatchEvent'].includes(e.type)) : null;
    const data = {
      login: txt(u.login, 39), name: txt(u.name, 60), repos: +u.public_repos || 0, followers: +u.followers || 0,
      avatar: /^https:\/\/avatars\.githubusercontent\.com\//.test(u.avatar_url || '') ? u.avatar_url : null,
      last: last ? { type: last.type, repo: txt(last.repo?.name, 100), at: last.created_at } : null,
    };
    lsSet(key, data);
    return data;
  });
}
export const useGitHub = user => usePoll(user || null, () => github(user), 0);

/* ---------------- widgets ---------------- */
const mmss = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const since = ms => { const m = Math.max(1, Math.floor((Date.now() - ms) / 6e4)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const agoShort = iso => { const m = Math.floor((Date.now() - Date.parse(iso)) / 6e4); return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`; };

function useTick(on, every = 1000) {
  const [, set] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => { if (visible()) set(x => x + 1); }, every); return () => clearInterval(t); }, [on, every]);
}

const EYEBROW = { spotify: 'LISTENING ON SPOTIFY', playing: 'PLAYING', streaming: 'STREAMING', listening: 'LISTENING TO', watching: 'WATCHING', competing: 'COMPETING IN' };
const HUE = { spotify: '#1db954', playing: '#8b7bff', streaming: '#9146ff', listening: '#ff5da8', watching: '#ff4d6d', competing: '#f5b544' };

function LiveCard({ it }) {
  const timed = !!(it.start && it.end);
  useTick(timed || !!it.start, timed ? 1000 : 30e3);
  const c = HUE[it.kind] || '#8b7bff';
  // Lanyard can lag a track change by up to a poll, so never run past the song's own length
  const pct = timed ? Math.min(100, Math.max(0, (Date.now() - it.start) / (it.end - it.start) * 100)) : 0;
  const open = it.kind === 'spotify' && it.track ? `https://open.spotify.com/track/${it.track}` : null;
  const inner = html`
    <div class="lvart" style=${`--lc:${c}`}>${it.art ? html`<img src=${it.art} alt="" loading="lazy" referrerpolicy="no-referrer"/>`
      : html`<${Glyph} k=${it.kind === 'spotify' || it.kind === 'listening' ? 'music' : it.kind === 'watching' ? 'film' : 'game'} size=${22}/>`}</div>
    <div class="lvbody">
      <div class="lveb" style=${`color:${c}`}><span class="lvdot" style=${`background:${c}`}></span>${EYEBROW[it.kind] || 'NOW'}</div>
      <div class="lvtitle">${it.title}</div>
      ${it.sub && html`<div class="lvsub">${it.kind === 'spotify' ? `by ${it.sub}` : it.sub}</div>`}
      ${it.line && html`<div class="lvsub">${it.line}</div>`}
      ${timed ? html`<div class="lvbar"><i style=${`width:${pct}%;background:${c}`}></i></div>
        <div class="lvtime"><span>${mmss(Math.min(Date.now() - it.start, it.end - it.start) / 1000)}</span><span>${mmss((it.end - it.start) / 1000)}</span></div>`
        : it.start ? html`<div class="lvsub lvfor"><${Glyph} k="bolt" size=${11}/> for ${since(it.start)}</div>` : ''}
    </div>`;
  return open ? html`<a class="lvcard" href=${open} target="_blank" rel="noopener noreferrer">${inner}</a>` : html`<div class="lvcard">${inner}</div>`;
}

/* The Discord-style block on a profile: live Discord presence + GitHub card.
   Renders nothing at all when there's nothing live to show. */
export function LiveConnections({ links, own = false }) {
  const dc = (links || []).find(l => l?.k === 'discord' && DISCORD_ID.test(String(l.id || '')));
  const gh = (links || []).find(l => l?.k === 'github' && l.u);
  const d = useLanyard(dc?.id);
  const g = useGitHub(gh?.u);
  const p = presenceOf(d);
  const err = dc && lastError('ly:' + dc.id);
  // a linked, visible Discord always shows its status line — "Offline" is information too
  if (!p && !g && !(own && err)) return null;
  return html`<div class="lvwrap">
    ${p && html`<div class="lvhead">
      <span class=${'lvstatus ' + p.status}></span><span>Discord · ${{ online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline' }[p.status]}</span>
      ${p.custom && html`<span class="lvcustom">“${p.custom}”</span>`}
    </div>`}
    ${p && p.items.map((it, i) => html`<${LiveCard} key=${i} it=${it}/>`)}
    ${own && err === 'not_monitored' && html`<div class="small lvhint">Discord is linked, but Lanyard can't see you yet — join <b>discord.gg/lanyard</b> once and your status shows up here.</div>`}
    ${g && html`<a class="lvcard gh" href=${`https://github.com/${encodeURIComponent(g.login)}`} target="_blank" rel="noopener noreferrer">
      <div class="lvart" style="--lc:#8b949e">${g.avatar ? html`<img src=${g.avatar} alt="" loading="lazy" referrerpolicy="no-referrer"/>` : html`<${Glyph} k="code" size=${22}/>`}</div>
      <div class="lvbody">
        <div class="lveb" style="color:#c9d1d9"><span class="lvdot" style="background:#c9d1d9"></span>GITHUB</div>
        <div class="lvtitle">${g.name || g.login}</div>
        <div class="lvsub">${g.repos} repos · ${g.followers} followers</div>
        ${g.last && html`<div class="lvsub">${{ PushEvent: 'Pushed to', CreateEvent: 'Created', PullRequestEvent: 'Opened a PR in', ReleaseEvent: 'Released', WatchEvent: 'Starred' }[g.last.type]} ${g.last.repo} · ${agoShort(g.last.at)}</div>`}
      </div>
    </a>`}
  </div>`;
}

/* One line for lists: "Listening to X — Y". Empty when nothing is live. */
export function LiveLine({ links }) {
  const dc = (links || []).find(l => l?.k === 'discord' && DISCORD_ID.test(String(l.id || '')));
  const line = liveLine(presenceOf(useLanyard(dc?.id)));
  return line ? html`<span class="lvline"><${Glyph} k=${/^Listening/.test(line) ? 'music' : 'game'} size=${11}/> ${line}</span>` : null;
}
