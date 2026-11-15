/* Orbit — house ads: the slots people see, and the manager staff use.
   See GUIDE.md for the full map of what lives where.

   Three placements: a card on Home, a card in the Chats list, and a full-screen
   card between stories. Ads are rows in `ads`, written from Mission Control →
   Ads; nobody but staff can create one, and RLS only serves an ad while it is
   active, inside its dates, and the "ads" kill switch is on. Orbit+ members
   never get one rendered.

   Counting is reach, not refreshes: `ad_track()` keeps one row per person per
   ad per day per kind, so a view is "a person saw it today" and a click is "a
   person tapped through today". No third-party ad network, no tracking pixel,
   nothing about the viewer leaves Orbit. */
import { html, useEffect, useState } from './lib.js';
import { Glyph, IcTrash, IcX, ago, isPlus, sb, ui } from './core.js';

export const PLACEMENTS = { home: 'Home feed', chats: 'Chats list', stories: 'Between stories' };

// weighted pick among the ads eligible for a slot; `seed` keeps it stable per render cycle
export function pickAd(ads, placement, seed = Math.random()) {
  const pool = (ads || []).filter(a => a && (a.placements || []).includes(placement));
  const total = pool.reduce((s, a) => s + (a.weight || 1), 0);
  if (!total) return null;
  let r = seed * total;
  for (const a of pool) { r -= (a.weight || 1); if (r < 0) return a; }
  return pool[pool.length - 1];
}
const tracked = new Set();
export function trackAd(ad, kind) {
  const k = ad.id + ':' + kind;
  if (tracked.has(k) && kind === 'view') return;
  tracked.add(k);
  sb.rpc('ad_track', { p_ad: ad.id, p_kind: kind }).then(() => {}, () => {});
}
export const isSafeLink = u => /^https:\/\/[^\s]+$/i.test(String(u || '').trim());

export function AdCard({ ads, placement, me, onPlus }) {
  const [seed] = useState(Math.random);
  const [hidden, setHidden] = useState(false);
  const ad = !isPlus(me) && !hidden ? pickAd(ads, placement, seed) : null;
  useEffect(() => { if (ad) trackAd(ad, 'view'); }, [ad?.id]);
  if (!ad) return null;
  return html`<div class="adcard">
    <div class="adcard-top">
      <span class="adtag"><${Glyph} k="megaph" size=${11}/> Sponsored${ad.advertiser ? ` · ${ad.advertiser}` : ''}</span>
      <button class="adx" aria-label="Hide this ad" onClick=${() => setHidden(true)}><${IcX} size=${12}/></button>
    </div>
    <a class="adcard-body" href=${isSafeLink(ad.link_url) ? ad.link_url : '#'} target="_blank" rel="noopener noreferrer sponsored" onClick=${() => trackAd(ad, 'click')}>
      ${ad.image_url && html`<img class="adimg" src=${ad.image_url} alt="" loading="lazy" referrerpolicy="no-referrer" onError=${e => { e.target.style.display = 'none'; }}/>`}
      <div style="min-width:0;flex:1">
        <div class="adtitle">${ad.title}</div>
        ${ad.body && html`<div class="adtext">${ad.body}</div>`}
      </div>
      <span class="adcta">${ad.cta || 'Learn more'}</span>
    </a>
    ${onPlus && html`<button class="linkbtn adplus" onClick=${onPlus}>Go ad-free with Orbit+</button>`}
  </div>`;
}

/* ---------------- Mission Control → Ads ---------------- */
const blank = () => ({ title: '', body: '', advertiser: '', image_url: '', cta: 'Learn more', link_url: '',
  placements: ['home'], weight: 1, active: true, starts_at: '', ends_at: '' });
const toLocal = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function AdsManager({ uid, canEdit }) {
  const [ads, setAds] = useState(null);
  const [stats, setStats] = useState({});
  const [edit, setEdit] = useState(null);            // null | { ...row } (id missing = new)
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const [a, s] = await Promise.all([
      sb.from('ads').select('*').order('created_at', { ascending: false }),
      sb.rpc('staff_ad_stats'),
    ]);
    setAds(a.data || []);
    setStats(Object.fromEntries((s.data || []).map(r => [r.ad_id, r])));
  };
  useEffect(() => { load(); }, []);

  const live = a => a.active && (!a.starts_at || Date.parse(a.starts_at) <= Date.now()) && (!a.ends_at || Date.parse(a.ends_at) > Date.now());
  const save = async () => {
    const e = edit;
    if (!e.title.trim()) return ui.toast('Give the ad a title');
    if (!isSafeLink(e.link_url)) return ui.toast('The link must start with https://');
    if (e.image_url && !isSafeLink(e.image_url)) return ui.toast('The image must be an https:// link');
    if (!e.placements.length) return ui.toast('Pick at least one placement');
    const row = { title: e.title.trim().slice(0, 60), body: e.body.trim().slice(0, 160) || null, advertiser: e.advertiser.trim().slice(0, 40) || null,
      image_url: e.image_url.trim() || null, cta: (e.cta.trim() || 'Learn more').slice(0, 20), link_url: e.link_url.trim(),
      placements: e.placements, weight: Math.min(10, Math.max(1, Number(e.weight) || 1)), active: !!e.active,
      starts_at: e.starts_at ? new Date(e.starts_at).toISOString() : null, ends_at: e.ends_at ? new Date(e.ends_at).toISOString() : null };
    setBusy(true);
    const { error } = e.id ? await sb.from('ads').update(row).eq('id', e.id) : await sb.from('ads').insert({ ...row, created_by: uid });
    setBusy(false);
    if (error) { ui.toast('Could not save the ad'); return; }
    ui.toast(e.id ? 'Ad updated' : 'Ad is live', 'megaph'); setEdit(null); load();
  };
  const toggle = async a => { await sb.from('ads').update({ active: !a.active }).eq('id', a.id); load(); };
  const del = async a => {
    if (!await ui.confirm({ title: `Delete “${a.title}”?`, body: 'Its stats go with it.', confirmLabel: 'Delete', danger: true })) return;
    await sb.from('ads').delete().eq('id', a.id); load();
  };

  if (edit) {
    const set = (k, v) => setEdit(x => ({ ...x, [k]: v }));
    return html`<div class="mc-card">
      <div class="mc-cardh"><b>${edit.id ? 'Edit ad' : 'New ad'}</b><button class="xbtn" aria-label="Close" onClick=${() => setEdit(null)}><${IcX} size=${14}/></button></div>
      <div class="mc-form">
        <label>Title<input class="input" maxlength="60" value=${edit.title} onInput=${e => set('title', e.target.value)} placeholder="Milk tea 2-for-1 at Cha Station"/></label>
        <label>Text<textarea class="input" rows="2" maxlength="160" value=${edit.body} onInput=${e => set('body', e.target.value)} placeholder="Show this in-store before 5PM"></textarea></label>
        <div class="mc-2">
          <label>Advertiser<input class="input" maxlength="40" value=${edit.advertiser} onInput=${e => set('advertiser', e.target.value)} placeholder="Cha Station"/></label>
          <label>Button<input class="input" maxlength="20" value=${edit.cta} onInput=${e => set('cta', e.target.value)}/></label>
        </div>
        <label>Link (https)<input class="input" inputmode="url" value=${edit.link_url} onInput=${e => set('link_url', e.target.value)} placeholder="https://"/></label>
        <label>Image link (optional, https)<input class="input" inputmode="url" value=${edit.image_url} onInput=${e => set('image_url', e.target.value)} placeholder="https://…/banner.jpg"/></label>
        <div class="flabel" style="margin:4px 0 6px">Where it shows</div>
        <div class="chiprow">${Object.entries(PLACEMENTS).map(([k, l]) => html`<button key=${k}
          class=${'pill' + (edit.placements.includes(k) ? ' on' : '')}
          onClick=${() => set('placements', edit.placements.includes(k) ? edit.placements.filter(x => x !== k) : [...edit.placements, k])}>${l}</button>`)}</div>
        <div class="mc-2" style="margin-top:8px">
          <label>Starts<input class="input" type="datetime-local" value=${toLocal(edit.starts_at)} onInput=${e => set('starts_at', e.target.value)}/></label>
          <label>Ends<input class="input" type="datetime-local" value=${toLocal(edit.ends_at)} onInput=${e => set('ends_at', e.target.value)}/></label>
        </div>
        <label>Weight · ${edit.weight} <span class="small">(higher shows more often next to other ads)</span>
          <input type="range" min="1" max="10" value=${edit.weight} onInput=${e => set('weight', Number(e.target.value))}/></label>
        ${edit.title && html`<div class="flabel" style="margin:6px 0">Preview</div>
          <${AdPreview} ad=${edit}/>`}
        <button class="btn btn-grad btn-block" style="margin-top:10px" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : edit.id ? 'Save changes' : 'Publish ad'}</button>
      </div>
    </div>`;
  }

  const tot = Object.values(stats).reduce((s, r) => ({ v: s.v + Number(r.views_7d || 0), c: s.c + Number(r.clicks_7d || 0) }), { v: 0, c: 0 });
  return html`<div>
    <div class="mc-kpis">
      <div class="mc-kpi"><span>Live ads</span><b>${(ads || []).filter(live).length}</b></div>
      <div class="mc-kpi"><span>Reach · 7d</span><b>${tot.v}</b></div>
      <div class="mc-kpi"><span>Clicks · 7d</span><b>${tot.c}</b></div>
      <div class="mc-kpi"><span>Click rate</span><b>${tot.v ? (tot.c / tot.v * 100).toFixed(1) + '%' : '—'}</b></div>
    </div>
    ${canEdit && html`<button class="btn btn-grad" style="margin-top:12px" onClick=${() => setEdit(blank())}><${Glyph} k="megaph" size=${14}/> New ad</button>`}
    ${ads === null && html`<div class="small" style="padding:12px 2px">Loading…</div>`}
    ${ads && !ads.length && html`<div class="mc-empty"><${Glyph} k="megaph" size=${26}/><div>No ads yet.</div>
      <div class="small">Sell a slot to a café near campus, or promote your own org’s events. Ads never show to Orbit+ members.</div></div>`}
    <div class="stack" style="margin-top:12px">
      ${(ads || []).map(a => { const s = stats[a.id] || {}; return html`<div key=${a.id} class="mc-row">
        <span class=${'mc-dot ' + (live(a) ? 'ok' : a.active ? 'warn' : 'off')} title=${live(a) ? 'Live' : a.active ? 'Scheduled / ended' : 'Paused'}></span>
        <div style="min-width:0;flex:1">
          <div class="rowname">${a.title}</div>
          <div class="rowsub">${(a.placements || []).map(p => PLACEMENTS[p]).join(' · ')} · weight ${a.weight}
            ${a.ends_at ? ` · ends ${new Date(a.ends_at).toLocaleDateString()}` : ''}</div>
          <div class="small" style="margin-top:3px">${Number(s.views || 0)} reached · ${Number(s.clicks || 0)} clicks · made ${ago(a.created_at)}</div>
        </div>
        ${canEdit && html`<div class="mc-acts">
          <button class=${'pill' + (a.active ? ' on-teal' : '')} onClick=${() => toggle(a)}>${a.active ? 'On' : 'Off'}</button>
          <button class="pill" onClick=${() => setEdit({ ...blank(), ...a, body: a.body || '', advertiser: a.advertiser || '', image_url: a.image_url || '' })}>Edit</button>
          <button class="pill" aria-label="Delete ad" onClick=${() => del(a)}><${IcTrash} size=${12}/></button>
        </div>`}
      </div>`; })}
    </div>
  </div>`;
}

function AdPreview({ ad }) {
  return html`<div class="adcard" style="margin:0">
    <div class="adcard-top"><span class="adtag"><${Glyph} k="megaph" size=${11}/> Sponsored${ad.advertiser ? ` · ${ad.advertiser}` : ''}</span></div>
    <div class="adcard-body">
      ${isSafeLink(ad.image_url) && html`<img class="adimg" src=${ad.image_url} alt="" referrerpolicy="no-referrer" onError=${e => { e.target.style.display = 'none'; }}/>`}
      <div style="min-width:0;flex:1"><div class="adtitle">${ad.title}</div>${ad.body && html`<div class="adtext">${ad.body}</div>`}</div>
      <span class="adcta">${ad.cta || 'Learn more'}</span>
    </div>
  </div>`;
}
