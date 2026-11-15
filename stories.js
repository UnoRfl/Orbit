/* Orbit — stories: the 24-hour rail, the full-screen viewer, "seen by".
   See GUIDE.md for the full map of what lives where.

   A story is a `media` row with purpose = 'story' (see media.js for how the
   file gets there and how it disappears). This file only ever renders what RLS
   already let us read, so "friends only", "close friends only", blocks and
   expiry are all decided by the database — nothing here filters for privacy.

   What Orbit's stories do that other apps' don't: every story carries the
   poster's live schedule status ("free till 3PM", "in Calculus") and the place
   they checked into, so a story is also an invitation — and the reply goes
   straight into your DM with them. */
import { html, useEffect, useMemo, useRef, useState } from './lib.js';
import { Glyph, IcX, IcSend, IcMore, MEDIA, ago, fname, isPlus, leftLabel, safeColor, ui } from './core.js';
import { Avatar, NameFx } from './components.js';
import { mediaBlobUrl, useMediaUrl } from './media.js';

export const REACTIONS = ['🔥', '😂', '😍', '😮', '👏', '💯'];

/* ---------- pure: stories → one group per person (unit-tested) ---------- */
export function groupStories(stories, uid, seen, now = Date.now()) {
  const by = new Map();
  for (const s of stories || []) {
    if (!s || Date.parse(s.expires_at) <= now) continue;
    if (!by.has(s.owner)) by.set(s.owner, []);
    by.get(s.owner).push(s);
  }
  const groups = [...by.entries()].map(([owner, items]) => {
    items.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const firstUnseen = items.findIndex(i => !seen?.has(i.id));
    return { owner, items, mine: owner === uid, unseen: owner !== uid && firstUnseen >= 0,
      start: firstUnseen >= 0 ? firstUnseen : 0, close: items.some(i => i.audience === 'close'),
      latest: Date.parse(items[items.length - 1].created_at) };
  });
  // yours first, then anything unwatched (newest first), then the rest
  return groups.sort((a, b) => (b.mine - a.mine) || (b.unseen - a.unseen) || (b.latest - a.latest));
}
// slot a sponsored card in after every `every` people (never for Orbit+)
export function withAds(groups, ads, every = 3) {
  if (!ads?.length) return groups;
  const out = []; let n = 0, k = 0;
  for (const g of groups) {
    out.push(g);
    if (!g.mine && ++n % every === 0) out.push({ ad: ads[k++ % ads.length], owner: 'ad' + k, items: [{ id: 'ad' + k }] });
  }
  return out;
}

/* ---------- the ring on the rail ---------- */
export function StoryRing({ p, g, size = 48, children }) {
  const a1 = safeColor(p?.accent1, '#b06bff'), a2 = safeColor(p?.accent2, '#2dd4bf');
  const cls = 'sring' + (g?.unseen ? ' new' : '') + (g?.close ? ' close' : '') + (g?.mine ? ' mine' : '');
  return html`<div class=${cls} style=${`--sa:${a1};--sb:${a2};--ss:${size}px`}>
    <div class="sring-in">${children || html`<${Avatar} p=${p} size=${size}/>`}</div>
    ${g?.unseen && html`<span class="sring-moon" aria-hidden="true"></span>`}
  </div>`;
}

/* ---------- viewer ---------- */
export function StoryViewer({ groups, startGroup = 0, uid, me, profiles, seen, statusOf, onSeen, onClose,
                              onReply, onReact, onDelete, onReport, loadViews, onAdView, onAdClick }) {
  const [gi, setGi] = useState(startGroup);
  const [ii, setIi] = useState(() => groups[startGroup]?.start || 0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [prog, setProg] = useState(0);
  const [muted, setMuted] = useState(false);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [views, setViews] = useState(null);           // null = closed · [] = open
  const vidRef = useRef(null), t0 = useRef(0), acc = useRef(0), press = useRef(null);

  const g = groups[gi];
  const item = g?.items[ii];
  const isAd = !!g?.ad;
  const owner = !isAd ? (g?.mine ? me : profiles[g?.owner]) : null;
  const { url, failed } = useMediaUrl(!isAd && item ? item.path : null);
  const stopped = paused || held || menu || views !== null || !!text;
  const dur = isAd ? 5000 : item?.kind === 'video' ? Math.max(1, (item.duration || MEDIA.storyMaxSec)) * 1000 : MEDIA.photoSec * 1000;

  const next = () => {
    setProg(0); acc.current = 0;
    if (g && ii < g.items.length - 1) return setIi(ii + 1);
    if (gi < groups.length - 1) { setGi(gi + 1); setIi(groups[gi + 1].start || 0); return; }
    onClose();
  };
  const prev = () => {
    setProg(0); acc.current = 0;
    if (ii > 0) return setIi(ii - 1);
    if (gi > 0) { setGi(gi - 1); setIi(0); return; }
    if (vidRef.current) vidRef.current.currentTime = 0;
  };

  // mark seen once it's actually on screen; preload the next file
  useEffect(() => {
    if (isAd) { onAdView?.(g.ad); return; }
    if (!item || !url) return;
    if (!g.mine && !seen.has(item.id)) onSeen(item);
    const nx = g.items[ii + 1] || groups[gi + 1]?.items[groups[gi + 1]?.start || 0];
    if (nx?.path) mediaBlobUrl(nx.path);
  }, [item?.id, url]);
  useEffect(() => { if (failed) next(); }, [failed]);

  // the clock: photos and ads run on a timer, videos report their own time
  useEffect(() => {
    if (!item) return;
    acc.current = 0; t0.current = performance.now(); setProg(0);
  }, [gi, ii]);
  useEffect(() => {
    if (!item || (!url && !isAd)) return;
    if (item.kind === 'video' && !isAd) {
      const v = vidRef.current; if (!v) return;
      if (stopped) v.pause(); else v.play().catch(() => { v.muted = true; setMuted(true); v.play().catch(() => {}); });
      return;
    }
    if (stopped) { acc.current += performance.now() - t0.current; return; }
    t0.current = performance.now();
    const id = setInterval(() => {
      const p = (acc.current + performance.now() - t0.current) / dur;
      if (p >= 1) { clearInterval(id); next(); } else setProg(p);
    }, 80);
    return () => { clearInterval(id); };
  }, [gi, ii, url, stopped]);

  useEffect(() => {
    const f = e => {
      if (e.target?.tagName === 'INPUT') { if (e.key === 'Escape') setText(''); return; }
      if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight') next(); else if (e.key === 'ArrowLeft') prev();
      else if (e.key === ' ') { e.preventDefault(); setPaused(v => !v); }
    };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, [gi, ii, groups.length]);

  // tap left/right, hold to pause, swipe down to leave
  const pd = e => { if (e.target.closest('button,input,a,.sv-foot,.sv-menu,.sv-views')) return;
    press.current = { x: e.clientX, y: e.clientY, t: Date.now(), hold: setTimeout(() => setHeld(true), 180) }; };
  const pu = e => {
    const p = press.current; press.current = null; if (!p) return;
    clearTimeout(p.hold);
    const dy = e.clientY - p.y, wasHold = Date.now() - p.t > 180;
    setHeld(false);
    if (dy > 90) return onClose();
    if (wasHold) return;
    const r = e.currentTarget.getBoundingClientRect();
    (e.clientX - r.left) < r.width * .32 ? prev() : next();
  };

  if (!g || !item) return null;
  const st = !isAd && !g.mine && statusOf ? statusOf(g.owner) : null;

  return html`<div class="sv" role="dialog" aria-modal="true" aria-label="Story">
    <div class="sv-stage" onPointerDown=${pd} onPointerUp=${pu} onPointerCancel=${() => { press.current = null; setHeld(false); }}>
      ${isAd ? html`<div class="sv-ad">
          ${g.ad.image_url && html`<img src=${g.ad.image_url} alt="" referrerpolicy="no-referrer" onError=${e => { e.target.style.display = 'none'; }}/>`}
          <div class="sv-adbody">
            <span class="adtag"><${Glyph} k="megaph" size=${12}/> Sponsored${g.ad.advertiser ? ` · ${g.ad.advertiser}` : ''}</span>
            <div class="sv-adtitle">${g.ad.title}</div>
            ${g.ad.body && html`<div class="sv-adtext">${g.ad.body}</div>`}
            <a class="btn btn-grad" href=${g.ad.link_url} target="_blank" rel="noopener noreferrer sponsored"
              onClick=${() => onAdClick?.(g.ad)}>${g.ad.cta || 'Learn more'}</a>
          </div>
        </div>`
      : !url ? html`<div class="sv-load"><span class="spin"></span></div>`
      : item.kind === 'video'
        ? html`<video ref=${vidRef} key=${item.id} class="sv-media" src=${url} playsinline autoplay muted=${muted}
            controlsList="nodownload" disablepictureinpicture onContextMenu=${e => e.preventDefault()}
            onTimeUpdate=${e => { const v = e.target; if (v.duration) setProg(v.currentTime / Math.min(v.duration, MEDIA.storyMaxSec + .5)); if (v.currentTime >= MEDIA.storyMaxSec + .5) next(); }}
            onEnded=${next}></video>`
        : html`<img key=${item.id} class="sv-media" src=${url} alt="" draggable=${false} onContextMenu=${e => e.preventDefault()}/>`}

      ${!isAd && (item.caption || item.place) && html`<div class="story-cap sv-cap">
        ${item.place && html`<span class="story-place"><${Glyph} k="pin" size=${12}/> ${item.place}</span>`}
        ${item.caption && html`<span>${item.caption}</span>`}
      </div>`}

      <div class="sv-top">
        <div class="sv-bars">${g.items.map((it, k) => html`<span key=${it.id}><i style=${`transform:scaleX(${k < ii ? 1 : k === ii ? prog : 0})`}></i></span>`)}</div>
        <div class="sv-head">
          ${isAd ? html`<span class="sv-adico"><${Glyph} k="megaph" size=${16}/></span>
              <div class="sv-who"><div class="sv-name">${g.ad.advertiser || 'Sponsored'}</div><div class="sv-sub">Sponsored · Orbit+ members never see this</div></div>`
            : html`<${Avatar} p=${owner || { id: g.owner }} size=${34}/>
              <div class="sv-who">
                <div class="sv-name"><${NameFx} p=${owner} text=${g.mine ? 'Your story' : (fname(owner) || '…')}/>
                  <span class="sv-ago">${ago(item.created_at)}</span>
                  ${item.audience === 'close' && html`<span class="sv-close"><${Glyph} k="close" size=${11}/> close</span>`}</div>
                <div class="sv-sub">${st ? html`<span style=${`color:${st.color}`}>${st.text}</span> · ` : ''}${leftLabel(item.expires_at)}</div>
              </div>`}
          ${item.kind === 'video' && !isAd && html`<button class="camico" aria-label=${muted ? 'Unmute' : 'Mute'} onClick=${() => setMuted(m => !m)}>
            <${Glyph} k=${muted ? 'belloff' : 'bell'} size=${16}/></button>`}
          ${!isAd && html`<button class="camico" aria-label="Story options" onClick=${() => setMenu(m => !m)}><${IcMore} size=${16}/></button>`}
          <button class="camico" aria-label="Close story" onClick=${onClose}><${IcX} size=${18}/></button>
        </div>
      </div>
      ${held && html`<div class="sv-paused">paused</div>`}
    </div>

    ${menu && html`<div class="sv-menu glass">
      ${g.mine
        ? html`<button style="color:#ff9db8" onClick=${async () => { setMenu(false);
            if (await ui.confirm({ title: 'Delete this story?', body: 'It disappears for everyone right away.', confirmLabel: 'Delete', danger: true })) { onDelete(item); next(); } }}>
            <${Glyph} k="block" size=${15}/> Delete story</button>`
        : html`<button onClick=${() => { setMenu(false); onReport(item); }}><${Glyph} k="flag" size=${15}/> Report story</button>`}
      <button onClick=${() => setMenu(false)}>Cancel</button>
    </div>`}

    ${!isAd && html`<div class="sv-foot">
      ${g.mine
        ? html`<button class="sv-seen" onClick=${async () => { setViews([]); setViews(await loadViews(item.id)); }}>
            <${Glyph} k="eye" size=${15}/> Seen by${views && views.length ? ` ${views.length}` : ''}</button>`
        : html`<div class="sv-react">${REACTIONS.map(r => html`<button key=${r} aria-label=${'React ' + r}
              onClick=${() => { onReact(g.owner, item, r); ui.toast('Sent to ' + (fname(owner) || 'them')); }}>${r}</button>`)}</div>
          <form class="sv-reply" onSubmit=${e => { e.preventDefault(); const t = text.trim(); if (!t) return; onReply(g.owner, item, t); setText(''); }}>
            <input value=${text} maxlength="500" placeholder=${`Reply to ${fname(owner) || 'them'}…`} onInput=${e => setText(e.target.value)}/>
            <button class="csend" disabled=${!text.trim()} aria-label="Send reply"><${IcSend} size=${15}/></button>
          </form>`}
    </div>`}

    ${views !== null && html`<div class="sv-views glass" onPointerDown=${e => e.stopPropagation()}>
      <div class="sheethead" style="margin-bottom:6px"><div class="sheettitle" style="font-size:15px">Seen by ${views.length}</div>
        <button class="xbtn" aria-label="Close" onClick=${() => setViews(null)}><${IcX} size=${15}/></button></div>
      ${!views.length && html`<div class="small" style="padding:6px 2px 10px">Nobody yet — they'll show up here.</div>`}
      <div class="stack" style="max-height:44vh;overflow-y:auto">
        ${views.map(v => html`<div key=${v.viewer} class="cardrow" style="cursor:default">
          <${Avatar} p=${profiles[v.viewer] || { id: v.viewer }} size=${34}/>
          <div style="min-width:0;flex:1"><div class="rowname">${fname(profiles[v.viewer]) || 'Someone'}</div>
            <div class="rowsub">${ago(v.viewed_at)}</div></div>
          ${v.reaction && html`<span style="font-size:20px">${v.reaction}</span>`}
        </div>`)}
      </div>
      <div class="small" style="margin-top:8px">Only you see this list. It vanishes with the story.</div>
    </div>`}
  </div>`;
}
