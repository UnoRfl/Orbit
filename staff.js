/* Orbit — Mission Control, the staff panel. See GUIDE.md for the full map.

   founder → everything · staff → act on members, content and ads · support → read-only.
   Every rule is enforced in the database (RLS, triggers, SECURITY DEFINER RPCs
   that re-check the role); this UI only mirrors what each role can really do,
   so a tampered client gains nothing.

   Sections: Overview (live numbers, trends, system health) · Reports · Members ·
   Content (stories + 24h media) · Orbit+ (codes, grants) · Ads · Controls
   (broadcast banner, kill switches) · Badges · Log. The numbers come from one
   RPC, staff_overview(), so the dashboard is a single round trip. */
import { html, useEffect, useState } from './lib.js';
import { ago, BADGE_DEFS, badgesOf, fmtBytes, fname, Glyph, glyphLabel, isPlus, Sym, toGlyph, IcFlag, IcTrash, IcUser, IcX, PROFILE_VIEW, roleOf, sb, shownName, ui } from './core.js';
import { Avatar, BadgeChips, Eyebrow } from './components.js';
import { useMediaUrl } from './media.js';
import { AdsManager } from './ads.js';

// what a recognition badge can wear — the power roles keep their own fixed glyphs
const BADGE_GLYPHS = ['medal','star','spark','heart','bolt','flame','trophy','rocket','flask','bug','code','palette','music','game','book','leaf','comet','planet'];
// Supabase free tier ceilings, for the meters
const LIMITS = { storage: 1024 ** 3, db: 500 * 1024 ** 2 };

/* ---------------- small pieces ---------------- */
function Kpi({ label, value, sub, delta, glyph, tone, onClick }) {
  return html`<button class=${'mc-tile' + (onClick ? ' click' : '') + (tone ? ' ' + tone : '')} onClick=${onClick} disabled=${!onClick}>
    <div class="mc-tile-h"><span class="mc-tile-ico"><${Glyph} k=${glyph} size=${15}/></span>${label}</div>
    <div class="mc-tile-v">${value ?? '—'}</div>
    ${(sub || delta != null) && html`<div class="mc-tile-s">
      ${delta != null && html`<span class=${'mc-delta ' + (delta > 0 ? 'up' : delta < 0 ? 'down' : '')}>${delta > 0 ? '+' : ''}${delta}</span>`}
      ${sub}</div>`}
  </button>`;
}

/* 14 bars, one series: no legend (the title names it), thin marks with a
   2px gap and rounded tops, recessive axis, hover for the exact value, and a
   table view behind a disclosure for screen readers and exact numbers. */
function Bars({ rows, label, unit }) {
  const [hi, setHi] = useState(null);
  const data = rows || [];
  const max = Math.max(1, ...data.map(r => r.n));
  const W = 280, H = 96, gap = 2, bw = data.length ? (W - gap * (data.length - 1)) / data.length : 0;
  const top = n => H - Math.max(n ? 3 : 0, (n / max) * (H - 14));
  const barPath = (x, y) => { const r = Math.min(4, bw / 2, H - y); return y >= H ? '' :
    `M${x},${H}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${H}Z`; };
  const fmtD = d => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const total = data.reduce((s, r) => s + r.n, 0);
  const cur = hi != null ? data[hi] : null;
  return html`<div class="mc-card mc-chart">
    <div class="mc-cardh"><b>${label}</b><span class="small">${cur ? `${fmtD(cur.d)} · ${cur.n} ${unit}` : `${total} in 14 days`}</span></div>
    <svg viewBox=${`0 0 ${W} ${H + 16}`} role="img" aria-label=${`${label}, last 14 days`} onMouseLeave=${() => setHi(null)}>
      <line x1="0" x2=${W} y1="10.5" y2="10.5" class="mc-grid"/>
      <text x=${W} y="8" class="mc-ax" text-anchor="end">${max}</text>
      <line x1="0" x2=${W} y1=${H + .5} y2=${H + .5} class="mc-axis"/>
      ${data.map((r, i) => { const x = i * (bw + gap), y = top(r.n); return html`<g key=${r.d}>
        <path d=${barPath(x, y)} class=${'mc-bar' + (hi === i ? ' on' : '')}/>
        <rect x=${x - gap / 2} y="0" width=${bw + gap} height=${H} fill="transparent"
          onMouseEnter=${() => setHi(i)} onClick=${() => setHi(i)}><title>${fmtD(r.d)}: ${r.n} ${unit}</title></rect>
      </g>`; })}
      ${data.length > 0 && html`<text x="0" y=${H + 13} class="mc-ax">${fmtD(data[0].d)}</text>
        <text x=${W} y=${H + 13} class="mc-ax" text-anchor="end">today</text>`}
    </svg>
    <details class="mc-table"><summary>Table</summary>
      <table><tbody>${data.map(r => html`<tr key=${r.d}><td>${fmtD(r.d)}</td><td>${r.n}</td></tr>`)}</tbody></table></details>
  </div>`;
}

function Meter({ label, used, limit, glyph }) {
  const p = Math.min(1, (used || 0) / limit);
  const state = p >= .9 ? ['crit', 'critical'] : p >= .7 ? ['warn', 'watch'] : ['ok', 'healthy'];
  return html`<div class="mc-meter">
    <div class="mc-meter-h"><span><${Glyph} k=${glyph} size=${13}/> ${label}</span>
      <span class=${'mc-state ' + state[0]}><span class=${'mc-dot ' + state[0]}></span>${state[1]}</span></div>
    <div class="mc-meter-bar"><i class=${state[0]} style=${`width:${Math.max(1.5, p * 100)}%`}></i></div>
    <div class="small">${fmtBytes(used)} of ${fmtBytes(limit)} free tier · ${(p * 100).toFixed(p < .1 ? 1 : 0)}%</div>
  </div>`;
}

function ReportMedia({ id, canAct, onRemoved }) {
  const [row, setRow] = useState(undefined);
  useEffect(() => { sb.from('media').select('*').eq('id', id).maybeSingle().then(({ data }) => setRow(data || null)); }, [id]);
  const { url } = useMediaUrl(row?.path || null);
  if (row === undefined) return html`<div class="small" style="margin-top:6px">loading the reported item…</div>`;
  if (!row) return html`<div class="modsnip">Already gone — expired or removed.</div>`;
  return html`<div class="mc-evidence">
    ${url ? (row.kind === 'video'
        ? html`<video src=${url} muted loop autoplay playsinline controls controlsList="nodownload"></video>`
        : html`<img src=${url} alt="reported media"/>`)
      : html`<div class="snap loading"><${Glyph} k="image" size=${16}/></div>`}
    <div class="small">${row.purpose === 'story' ? 'Story' : 'Chat ' + row.kind} · posted ${ago(row.created_at)} · ${row.caption ? `“${row.caption}”` : 'no caption'}</div>
    ${canAct && html`<button class="pill" style="color:#ff9db8;border-color:rgba(255,93,143,.4)" onClick=${async () => {
      const n = prompt('Remove this for everyone? Optional note for the log:', '');
      if (n === null) return;
      const { error } = await sb.rpc('staff_remove_media', { p_id: row.id, p_note: n || null });
      if (error) ui.toast(error.message || 'Could not remove it'); else { ui.toast('Removed', 'gavel'); setRow(null); onRemoved?.(); }
    }}><${IcTrash} size=${12}/> Remove it</button>`}
  </div>`;
}

/* ---------------- the panel ---------------- */
export function StaffPanel({ uid, me, myRole, data, profiles, nameOf, reload, actions, onOpenProfile, openMod, cfg, saveCfg }) {
  const [sec, setSec] = useState('overview');
  const [ov, setOv] = useState(null);
  const [ovErr, setOvErr] = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const [, tick] = useState(0);
  const canAct = myRole === 'founder' || myRole === 'staff';
  const isFounder = myRole === 'founder';

  const loadOv = async () => {
    const { data: d, error } = await sb.rpc('staff_overview');
    if (error) { setOvErr(true); return; }
    setOvErr(false); setOv(d); setLoadedAt(Date.now());
  };
  const refresh = () => { reload(); loadOv(); };
  useEffect(() => { refresh(); const t = setInterval(() => { if (!document.hidden) loadOv(); tick(x => x + 1); }, 60000); return () => clearInterval(t); }, []);

  const openR = (data.reports || []).filter(r => r.status === 'open');
  const who = id => id === uid ? 'you' : nameOf(id);
  const SECS = [
    ['overview', 'chart', 'Overview'],
    ['reports', 'flag', 'Reports', openR.length],
    ['members', 'users', 'Members'],
    ['content', 'camera', 'Content'],
    ['plus', 'plus', 'Orbit+'],
    ['ads', 'megaph', 'Ads'],
    ['controls', 'toggle', 'Controls'],
    ...(isFounder ? [['badges', 'medal', 'Badges']] : []),
    ['log', 'log', 'Log'],
  ];
  const hr = new Date().getHours();

  return html`<div class="mc" style="animation:pop .2s ease">
    <div class="mc-hero">
      <div class="mc-hero-l">
        <${Eyebrow} color="var(--major)">Mission control<//>
        <div class="mc-hero-t">${hr < 12 ? 'Morning' : hr < 18 ? 'Afternoon' : 'Evening'}, ${fname(me)}</div>
        <div class="small" style="margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="badgechip" style=${BADGE_DEFS[myRole]?.color ? `color:${BADGE_DEFS[myRole].color};border-color:color-mix(in srgb, ${BADGE_DEFS[myRole].color} 45%, transparent)` : ''}><${Sym} v=${BADGE_DEFS[myRole]?.icon} size=${11}/>${BADGE_DEFS[myRole]?.label}</span>
          <span class="mc-live"><span class="mc-dot ok pulse"></span>${loadedAt ? `live · updated ${ago(new Date(loadedAt).toISOString())}` : 'connecting…'}</span>
        </div>
      </div>
      <button class="btn" style="padding:8px 12px;flex:none" onClick=${refresh}>↻ Refresh</button>
    </div>
    ${myRole === 'support' && html`<div class="hint" style="margin-top:10px">Support is read-only — you see everything here, actions are for staff.</div>`}

    <div class="mc-tabs" role="tablist">
      ${SECS.map(([k, g, l, n]) => html`<button key=${k} role="tab" aria-selected=${sec === k} class=${'mc-tab' + (sec === k ? ' on' : '')} onClick=${() => setSec(k)}>
        <${Glyph} k=${g} size=${15}/><span>${l}</span>${n ? html`<em>${n}</em>` : ''}</button>`)}
    </div>

    ${sec === 'overview' && html`<${Overview} ov=${ov} err=${ovErr} go=${setSec} openR=${openR}/>`}
    ${sec === 'reports' && html`<${Reports} data=${data} canAct=${canAct} isFounder=${isFounder} who=${who} actions=${actions}
        onOpenProfile=${onOpenProfile} openMod=${openMod} reload=${refresh}/>`}
    ${sec === 'members' && html`<${Members} uid=${uid} canAct=${canAct} isFounder=${isFounder} actions=${actions} onOpenProfile=${onOpenProfile}/>`}
    ${sec === 'content' && html`<${Content} ov=${ov} isFounder=${isFounder} cfg=${cfg} reload=${loadOv}/>`}
    ${sec === 'plus' && html`<${PlusAdmin} ov=${ov} isFounder=${isFounder}/>`}
    ${sec === 'ads' && html`<${AdsManager} uid=${uid} canEdit=${canAct}/>`}
    ${sec === 'controls' && html`<${Controls} cfg=${cfg} saveCfg=${saveCfg} isFounder=${isFounder}/>`}
    ${sec === 'badges' && isFounder && html`<${Badges} actions=${actions}/>`}
    ${sec === 'log' && html`<${Log} data=${data} who=${who} myRole=${myRole}/>`}
  </div>`;
}

function Overview({ ov, err, go, openR }) {
  if (err) return html`<div class="mc-card" style="margin-top:12px"><div class="hint" style="margin:0">The dashboard numbers aren’t reachable right now — try ↻ Refresh in a moment.</div></div>`;
  if (!ov) return html`<div class="mc-tiles" style="margin-top:12px">${[0, 1, 2, 3].map(i => html`<div key=${i} class="mc-tile skel"></div>`)}</div>`;
  const cronBad = (ov.cron || []).filter(c => c.last?.status === 'failed');
  const act = ov.users ? Math.round(ov.active_7d / ov.users * 100) : 0;
  return html`<div>
    ${(openR.length > 0 || cronBad.length > 0) && html`<div class="mc-alerts">
      ${openR.length > 0 && html`<button class="mc-alert" onClick=${() => go('reports')}><${Glyph} k="flag" size=${15}/>
        <b>${openR.length} open report${openR.length > 1 ? 's' : ''}</b><span>need a look</span></button>`}
      ${cronBad.length > 0 && html`<button class="mc-alert warn" onClick=${() => go('content')}><${Glyph} k="server" size=${15}/>
        <b>${cronBad.length} background job${cronBad.length > 1 ? 's' : ''} failing</b><span>${cronBad.map(c => c.job.replace('orbit-', '')).join(', ')}</span></button>`}
    </div>`}
    <div class="mc-tiles">
      <${Kpi} glyph="users" label="Members" value=${ov.users} delta=${ov.new_7d - ov.new_prev_7d} sub=${`${ov.new_7d} joined this week`} onClick=${() => go('members')}/>
      <${Kpi} glyph="bolt" label="Active · 24h" value=${ov.active_24h} sub=${`${ov.active_7d} this week · ${act}% of members`}/>
      <${Kpi} glyph="chat" label="Messages · 24h" value=${ov.msgs_24h} sub=${`${ov.dms} DMs · ${ov.systems} systems`}/>
      <${Kpi} glyph="camera" label="Stories live" value=${ov.stories_live} sub=${`${ov.posters_24h} posted · ${ov.story_views_24h} views`} onClick=${() => go('content')}/>
      <${Kpi} glyph="flag" label="Open reports" value=${ov.reports_open} sub=${`${ov.reports_7d} this week · ${ov.restricted} restricted`} tone=${ov.reports_open ? 'hot' : ''} onClick=${() => go('reports')}/>
      <${Kpi} glyph="plus" label="Orbit+" value=${ov.plus_active} sub=${`${ov.codes_open} unused codes`} onClick=${() => go('plus')}/>
      <${Kpi} glyph="megaph" label="Ads · 7d reach" value=${ov.ad_views_7d} sub=${`${ov.ads_live} live · ${ov.ad_clicks_7d} clicks`} onClick=${() => go('ads')}/>
      <${Kpi} glyph="cal" label="Plans ahead" value=${ov.plans_ahead} sub=${`${ov.friendships} friendships`}/>
    </div>
    <div class="mc-2col">
      <${Bars} rows=${ov.signups_14} label="Sign-ups" unit="sign-ups"/>
      <${Bars} rows=${ov.msgs_14} label="Messages" unit="messages"/>
    </div>
    <div class="mc-2col">
      <div class="mc-card">
        <div class="mc-cardh"><b>Capacity</b><span class="small">free tier</span></div>
        <${Meter} label="Media storage" glyph="image" used=${ov.media_bytes} limit=${LIMITS.storage}/>
        <${Meter} label="Database" glyph="server" used=${ov.db_bytes} limit=${LIMITS.db}/>
        <div class="small" style="margin-top:8px">${ov.media_files} files in the 24h bucket — every one of them is deleted within a day.</div>
      </div>
      <${Health} ov=${ov}/>
    </div>
  </div>`;
}

function Health({ ov }) {
  const names = { 'orbit-ephemeral-sweep': 'Media sweep · every 15 min', 'orbit-scheduled-msgs': 'Send-later delivery · every minute',
    'orbit-live-expiry': 'Live location expiry · every 10 min', 'orbit-chat-retention': 'Chat 90-day cleanup · daily' };
  return html`<div class="mc-card">
    <div class="mc-cardh"><b>Background jobs</b><span class="small">pg_cron</span></div>
    ${(ov.cron || []).map(c => { const bad = c.last?.status === 'failed'; const st = !c.last ? ['off', 'not run yet'] : bad ? ['crit', 'failed'] : ['ok', 'ok'];
      return html`<div key=${c.job} class="mc-job">
        <span class=${'mc-dot ' + st[0]}></span>
        <div style="min-width:0;flex:1"><div class="rowname" style="font-size:12.5px">${names[c.job] || c.job}</div>
          <div class="small">${st[1]}${c.last?.at ? ` · ${ago(c.last.at)}` : ''}${c.fails_24h ? ` · ${c.fails_24h} failures today` : ''}</div>
          ${bad && c.last?.msg && html`<div class="small" style="color:#ff9db8">${c.last.msg}</div>`}</div>
      </div>`; })}
    <div class="small" style="margin-top:8px">${ov.push_devices} phones with notifications · ${ov.scheduled} messages queued to send later</div>
  </div>`;
}

function Reports({ data, canAct, isFounder, who, actions, onOpenProfile, openMod, reload }) {
  const [filter, setFilter] = useState('open');
  const all = data.reports || [];
  const list = filter === 'open' ? all.filter(r => r.status === 'open') : all.filter(r => r.status !== 'open').slice(0, 30);
  return html`<div style="margin-top:12px">
    <div class="pillrow">
      <button class=${'pill' + (filter === 'open' ? ' on' : '')} onClick=${() => setFilter('open')}>Open · ${all.filter(r => r.status === 'open').length}</button>
      <button class=${'pill' + (filter === 'done' ? ' on' : '')} onClick=${() => setFilter('done')}>Handled</button>
    </div>
    ${data.reports === null && html`<div class="mc-card" style="margin-top:10px"><div class="hint" style="margin:0">Reports aren’t reachable right now — try ↻ Refresh.</div></div>`}
    ${data.reports !== null && !list.length && html`<div class="mc-empty"><${Glyph} k="check" size=${26}/><div>${filter === 'open' ? 'No open reports — space is quiet.' : 'Nothing handled yet.'}</div></div>`}
    <div class="stack" style="margin-top:10px">
    ${list.map(r => html`<div key=${r.id} class=${'mc-report' + (r.status !== 'open' ? ' done' : '')}>
      <div class="mc-report-h">
        <span class=${'mc-kind k-' + r.kind}><${Glyph} k=${r.kind === 'story' ? 'camera' : r.kind === 'message' ? 'chat' : 'user'} size=${12}/> ${r.kind}</span>
        <span class="small">${ago(r.created_at)}</span>
        ${r.status !== 'open' && html`<span class="small">· ${r.status}${r.handled_by ? ` by ${who(r.handled_by)}` : ''}</span>`}
      </div>
      <div class="rowname" style="white-space:normal;margin-top:6px">${who(r.reporter)} reported
        <b style="cursor:pointer;color:var(--major)" onClick=${() => onOpenProfile(r.target)}> ${who(r.target)}</b></div>
      <div class="rowsub" style="white-space:normal;margin-top:2px;line-height:1.45">${r.reason}</div>
      ${r.kind === 'message' && r.ref?.snippet !== undefined && !r.ref?.media_id && html`<div class="modsnip">${r.ref.msg_kind && r.ref.msg_kind !== 'text' ? `[${r.ref.msg_kind} link] ` : ''}${r.ref.snippet ? `“${r.ref.snippet}”` : '(no text)'}</div>`}
      ${r.ref?.media_id && r.status === 'open' && html`<${ReportMedia} id=${r.ref.media_id} canAct=${canAct} onRemoved=${reload}/>`}
      ${canAct && r.status === 'open' && html`<div class="pillrow" style="margin-top:9px">
        <button class="pill on-teal" onClick=${() => actions.resolveReport(r, 'resolved')}>✓ Resolve</button>
        <button class="pill" onClick=${() => actions.resolveReport(r, 'dismissed')}>Dismiss</button>
        <button class="pill" onClick=${() => onOpenProfile(r.target)}>Profile</button>
        ${isFounder && r.ref?.ref && html`<button class="pill" onClick=${() => openMod(r.ref)}><${Glyph} k="eye" size=${13}/> Open chat</button>`}
      </div>`}
    </div>`)}
    </div>
  </div>`;
}

function Members({ uid, canAct, isFounder, actions, onOpenProfile }) {
  const [q, setQ] = useState('');
  const [view, setView] = useState('recent');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [badgeFor, setBadgeFor] = useState(null);
  const [bBusy, setBBusy] = useState(false);
  const run = async (v = view, term = q) => {
    setBusy(true);
    let qq = sb.from(PROFILE_VIEW).select('*');
    const t = term.trim().replace(/[%,()"]/g, '');
    if (t.length >= 2) qq = qq.or(`handle.ilike.%${t}%,display_name.ilike.%${t}%`);
    else if (v === 'restricted') qq = qq.gt('suspended_until', new Date().toISOString());
    else if (v === 'team') qq = qq.or('badges.cs.["founder"],badges.cs.["staff"],badges.cs.["support"]');
    else if (v === 'plus') qq = qq.not('plus_until', 'is', null);
    const { data } = await qq.order('created_at', { ascending: false }).limit(t.length >= 2 ? 12 : 25);
    setRes(data || []); setBusy(false);
  };
  useEffect(() => { run(); }, [view]);
  const patchRes = (id, out) => { if (out && typeof out === 'object')
    setRes(rs => (rs || []).map(x => x.id !== id ? x : Array.isArray(out) ? { ...x, badges: out } : { ...x, ...out })); };
  const canTouch = p => { if (!canAct || !p || p.id === uid) return false;
    const r = roleOf(p); if (r === 'founder') return false; if (r && !isFounder) return false; return true; };
  const restrictedTxt = p => { const s = p?.suspended_until; if (!s) return null;
    if (s === 'infinity') return 'banned';
    return new Date(s) > new Date() ? 'suspended · ' + new Date(s).toLocaleDateString() : null; };
  const askSuspend = (p, hours, label) => {
    const n = prompt(`Suspend ${shownName(p)} for ${label}? Add a reason — they'll see it:`, '');
    if (n === null) return;
    actions.suspendUser(p.id, hours, n).then(out => patchRes(p.id, out));
  };
  const plusGrant = async (p, days) => {
    const { data, error } = await sb.rpc('staff_grant_plus', { p_target: p.id, p_days: days, p_note: null });
    if (error) { ui.toast(error.message || 'Could not change Orbit+'); return; }
    ui.toast(days ? `Orbit+ until ${new Date(data).toLocaleDateString()}` : 'Orbit+ removed', 'plus');
    patchRes(p.id, { plus_until: days ? data : null });
  };
  const badgeList = () => Object.entries(BADGE_DEFS).sort((a, b) => (a[1].sort ?? 99) - (b[1].sort ?? 99));
  const chipStyle = d => d?.color ? `color:${d.color};border-color:color-mix(in srgb, ${d.color} 45%, transparent)` : '';

  return html`<div style="margin-top:12px">
    <div style="display:flex;gap:8px">
      <input class="input" value=${q} onInput=${e => setQ(e.target.value)} placeholder="search handle or name" autocapitalize="none"
        onKeyDown=${e => { if (e.key === 'Enter') run(view, q); }}/>
      <button class="btn" style="flex:none;padding:11px 14px" disabled=${busy} onClick=${() => run(view, q)}>${busy ? '…' : 'Search'}</button>
    </div>
    <div class="pillrow" style="margin-top:8px">
      ${[['recent', 'Newest'], ['restricted', 'Restricted'], ['team', 'Team'], ['plus', 'Orbit+']].map(([k, l]) => html`<button key=${k}
        class=${'pill' + (view === k && q.trim().length < 2 ? ' on' : '')} onClick=${() => { setQ(''); if (view === k) run(k, ''); else setView(k); }}>${l}</button>`)}
    </div>
    ${res && !res.length && html`<div class="small" style="margin-top:10px">No matches.</div>`}
    ${(res || []).map(p => html`<div key=${p.id} class="staffrow">
      <${Avatar} p=${p} size=${36}/>
      <div style="min-width:0;flex:1">
        <div class="rowname" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${shownName(p) || ('@' + p.handle)}
          <${BadgeChips} p=${p}/>
          ${isPlus(p) && html`<span class="plustag"><${Glyph} k="plus" size=${10}/> Plus</span>`}
          ${restrictedTxt(p) && html`<span class="stafftag" style="color:#ff9db8;border-color:rgba(255,93,143,.5);background:rgba(255,93,143,.1)">${restrictedTxt(p)}</span>`}
        </div>
        <div class="rowsub">@${p.handle} · joined ${ago(p.created_at)}</div>
        ${canTouch(p) && html`<div class="pillrow" style="margin-top:7px">
          <button class="pill" onClick=${() => askSuspend(p, 24, '24 hours')}>1 day</button>
          <button class="pill" onClick=${() => askSuspend(p, 168, '7 days')}>7 days</button>
          <button class="pill" style="color:#ff9db8;border-color:rgba(255,93,143,.4)"
            onClick=${() => { const n = prompt(`Ban ${shownName(p)} permanently? Type a reason — they'll see it:`); if (n !== null) actions.suspendUser(p.id, 0, n || '').then(out => patchRes(p.id, out)); }}>Ban</button>
          ${restrictedTxt(p) && html`<button class="pill on-teal" onClick=${() => actions.liftUser(p.id).then(out => patchRes(p.id, out))}>Lift</button>`}
          <button class=${'pill' + (badgeFor === p.id ? ' on' : '')} onClick=${() => setBadgeFor(badgeFor === p.id ? null : p.id)}><${Glyph} k="medal" size=${13}/> Roles</button>
        </div>`}
        ${isFounder && p.id !== uid && html`<div class="pillrow" style="margin-top:6px">
          <span class="small" style="align-self:center">Orbit+</span>
          <button class="pill" onClick=${() => plusGrant(p, 30)}>+30 days</button>
          <button class="pill" onClick=${() => plusGrant(p, 365)}>+1 year</button>
          ${isPlus(p) && html`<button class="pill" onClick=${() => plusGrant(p, 0)}>Remove</button>`}
        </div>`}
        ${canTouch(p) && badgeFor === p.id && html`<div class="chiprow" style="margin-top:8px">
          ${badgeList().map(([slug, d]) => {
            const has = badgesOf(p).includes(slug);
            const locked = slug === 'founder' || (d.tier === 'power' && !isFounder);
            if (locked && !has) return null;
            return html`<button key=${slug} class=${'badgechip bchip-tog' + (has ? '' : ' bchip-off')} disabled=${locked || bBusy}
              style=${chipStyle(d)} title=${d.blurb || ''}
              onClick=${async () => { setBBusy(true);
                const out = has ? await actions.revokeBadge(p.id, slug) : await actions.grantBadge(p.id, slug);
                patchRes(p.id, out); setBBusy(false); }}>
              <${Sym} v=${d.icon} size=${11}/>${d.label}${has ? ' ✓' : ''}</button>`;
          })}
          <div class="set-hint" style="flex-basis:100%">${isFounder
            ? 'Tap to grant or remove. Staff and Support carry real abilities; everything else is recognition only.'
            : 'Tap to grant or remove recognition badges — they carry no permissions.'}</div>
        </div>`}
      </div>
      <button class="btn" style="padding:7px 10px;flex:none" onClick=${() => onOpenProfile(p.id)} aria-label="View profile"><${IcUser} size=${13}/></button>
    </div>`)}
  </div>`;
}

function Content({ ov, isFounder, cfg, reload }) {
  const flags = cfg?.flags || {};
  const [busy, setBusy] = useState(false);
  const on = k => flags[k] !== false;
  return html`<div style="margin-top:12px">
    <div class="mc-tiles">
      <${Kpi} glyph="camera" label="Stories live" value=${ov?.stories_live} sub=${ov ? `${ov.posters_24h} people posted today` : ''}/>
      <${Kpi} glyph="image" label="Chat snaps live" value=${ov?.snaps_live}/>
      <${Kpi} glyph="eye" label="Story views · 24h" value=${ov?.story_views_24h}/>
      <${Kpi} glyph="hourgl" label="Files right now" value=${ov?.media_files} sub=${ov ? fmtBytes(ov.media_bytes) : ''}/>
    </div>
    <div class="mc-card" style="margin-top:12px">
      <div class="mc-cardh"><b>How 24-hour media works</b></div>
      <ol class="mc-steps">
        <li>The phone re-encodes every photo and video before upload (~200 KB photos, 720p video) — this also strips location data.</li>
        <li>It lands in the private <code>ephemeral</code> bucket. Only people the database allows can read it: friends for stories, the chat for snaps.</li>
        <li>At 24 hours the database hides it from everyone, instantly.</li>
        <li>Every 15 minutes the sweep deletes the files and rows for good. Nothing is archived.</li>
      </ol>
      <div class="small">Staff can only open a photo or video once someone has reported it — you won’t see private stories otherwise.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
        <span class=${'mc-state ' + (on('stories') ? 'ok' : 'crit')}><span class=${'mc-dot ' + (on('stories') ? 'ok' : 'crit')}></span>stories ${on('stories') ? 'on' : 'paused'}</span>
        <span class=${'mc-state ' + (on('snaps') ? 'ok' : 'crit')}><span class=${'mc-dot ' + (on('snaps') ? 'ok' : 'crit')}></span>snaps ${on('snaps') ? 'on' : 'paused'}</span>
        ${isFounder && html`<button class="pill" style="margin-left:auto" disabled=${busy} onClick=${async () => {
          setBusy(true); const { error } = await sb.rpc('staff_sweep_now'); setBusy(false);
          ui.toast(error ? 'Could not start the sweep' : 'Sweep started — expired files go in a few seconds', 'hourgl');
          setTimeout(reload, 6000);
        }}><${Glyph} k="hourgl" size=${13}/> Run sweep now</button>`}
      </div>
    </div>
  </div>`;
}

function PlusAdmin({ ov, isFounder }) {
  const [codes, setCodes] = useState(null);
  const [fresh, setFresh] = useState([]);
  const [f, setF] = useState({ days: 30, count: 5, uses: 1, note: '' });
  const [busy, setBusy] = useState(false);
  const load = async () => { if (!isFounder) return;
    const { data } = await sb.from('redeem_codes').select('*').order('created_at', { ascending: false }).limit(60); setCodes(data || []); };
  useEffect(() => { load(); }, []);
  const make = async () => {
    setBusy(true);
    const { data, error } = await sb.rpc('staff_make_codes', { p_days: Number(f.days), p_count: Number(f.count), p_uses: Number(f.uses), p_note: f.note || null });
    setBusy(false);
    if (error) { ui.toast(error.message || 'Could not make codes'); return; }
    setFresh(data || []); load();
  };
  const copy = t => { try { navigator.clipboard.writeText(t); ui.toast('Copied', 'check'); } catch {} };
  return html`<div style="margin-top:12px">
    <div class="mc-tiles">
      <${Kpi} glyph="plus" label="Active members" value=${ov?.plus_active}/>
      <${Kpi} glyph="ticket" label="Unused codes" value=${ov?.codes_open}/>
      <${Kpi} glyph="clock" label="Queued send-laters" value=${ov?.scheduled}/>
    </div>
    ${!isFounder && html`<div class="hint">Codes and grants are founder-only — Orbit+ is money, so one person holds the keys.</div>`}
    ${isFounder && html`<div class="mc-card" style="margin-top:12px">
      <div class="mc-cardh"><b>Make redeem codes</b><span class="small">sell for GCash / cash, hand over a code</span></div>
      <div class="mc-form">
        <div class="mc-2">
          <label>Days of Plus<select class="input" value=${f.days} onChange=${e => setF({ ...f, days: e.target.value })}>
            ${[7, 30, 90, 180, 365].map(d => html`<option key=${d} value=${d}>${d} days</option>`)}</select></label>
          <label>How many<input class="input" type="number" min="1" max="50" value=${f.count} onInput=${e => setF({ ...f, count: e.target.value })}/></label>
        </div>
        <div class="mc-2">
          <label>Uses per code<input class="input" type="number" min="1" max="500" value=${f.uses} onInput=${e => setF({ ...f, uses: e.target.value })}/></label>
          <label>Note (who / why)<input class="input" maxlength="80" value=${f.note} onInput=${e => setF({ ...f, note: e.target.value })} placeholder="Booth sale · Sep 24"/></label>
        </div>
        <button class="btn btn-grad" disabled=${busy} onClick=${make}>${busy ? 'Making…' : `Make ${f.count} code${Number(f.count) > 1 ? 's' : ''}`}</button>
      </div>
      ${fresh.length > 0 && html`<div class="mc-codes">
        <div class="mc-cardh" style="margin-top:12px"><b>New codes</b><button class="pill" onClick=${() => copy(fresh.join('\n'))}>Copy all</button></div>
        ${fresh.map(c => html`<button key=${c} class="mc-code" onClick=${() => copy(c)}>${c}</button>`)}
      </div>`}
    </div>
    <div class="mc-card" style="margin-top:12px">
      <div class="mc-cardh"><b>All codes</b><span class="small">${codes ? codes.length : ''}</span></div>
      ${codes && !codes.length && html`<div class="small">None yet.</div>`}
      ${(codes || []).map(c => html`<div key=${c.code} class="mc-job">
        <span class=${'mc-dot ' + (c.uses >= c.max_uses ? 'off' : 'ok')}></span>
        <div style="min-width:0;flex:1"><div class="rowname" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">${c.code}</div>
          <div class="small">${c.days} days · used ${c.uses}/${c.max_uses}${c.note ? ` · ${c.note}` : ''} · ${ago(c.created_at)}</div></div>
        <button class="pill" onClick=${() => copy(c.code)}>Copy</button>
      </div>`)}
    </div>`}
  </div>`;
}

function Controls({ cfg, saveCfg, isFounder }) {
  const flags = { stories: true, snaps: true, ads: true, scheduled: true, ...(cfg?.flags || {}) };
  const b = cfg?.banner || {};
  const [text, setText] = useState(b.text || '');
  const [tone, setTone] = useState(b.tone || 'info');
  const [hours, setHours] = useState(24);
  const live = b.text && (!b.until || Date.parse(b.until) > Date.now());
  const FL = [['stories', 'Stories', 'camera', 'Posting new stories'], ['snaps', 'Chat photos & videos', 'image', 'Sending 24h media in chat'],
              ['ads', 'Ads', 'megaph', 'Every sponsored slot'], ['scheduled', 'Send later', 'clock', 'Queuing new scheduled messages']];
  return html`<div style="margin-top:12px">
    <div class="mc-card">
      <div class="mc-cardh"><b>Broadcast banner</b>${live ? html`<span class="mc-state ok"><span class="mc-dot ok"></span>showing</span>` : html`<span class="small">off</span>`}</div>
      <div class="small" style="margin-bottom:8px">A strip across the top of Orbit for everyone — maintenance, an event, a warning. For release notes, use Updates (the radio button up top).</div>
      <textarea class="input" rows="2" maxlength="160" value=${text} disabled=${!isFounder} placeholder="Orbit will be down for 10 minutes at 9PM for maintenance." onInput=${e => setText(e.target.value)}></textarea>
      <div class="pillrow" style="margin-top:8px">
        ${[['info', 'Info'], ['party', 'Celebrate'], ['warn', 'Warning']].map(([k, l]) => html`<button key=${k} class=${'pill' + (tone === k ? ' on' : '')} disabled=${!isFounder} onClick=${() => setTone(k)}>${l}</button>`)}
        <select class="input" style="width:auto;padding:6px 10px" value=${hours} disabled=${!isFounder} onChange=${e => setHours(Number(e.target.value))}>
          ${[[2, 'for 2 hours'], [24, 'for a day'], [72, 'for 3 days'], [168, 'for a week'], [0, 'until I remove it']].map(([h, l]) => html`<option key=${h} value=${h}>${l}</option>`)}
        </select>
      </div>
      ${text.trim() && html`<div class=${'obanner ' + tone} style="position:static;margin-top:10px"><${Glyph} k=${tone === 'warn' ? 'bell' : tone === 'party' ? 'party' : 'radio'} size=${14}/><span>${text.trim()}</span></div>`}
      ${isFounder && html`<div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-grad" disabled=${!text.trim()} onClick=${() => saveCfg('banner', { text: text.trim().slice(0, 160), tone, until: hours ? new Date(Date.now() + hours * 3600e3).toISOString() : null, id: Date.now() })}>Show banner</button>
        ${live && html`<button class="btn" onClick=${() => { setText(''); saveCfg('banner', {}); }}>Take it down</button>`}
      </div>`}
    </div>
    <div class="mc-card" style="margin-top:12px">
      <div class="mc-cardh"><b>Kill switches</b><span class="small">instant, for everyone</span></div>
      <div class="small" style="margin-bottom:6px">Pausing a feature stops anything new being created; what already exists still expires on schedule. Use it if something is being abused faster than reports can keep up.</div>
      ${FL.map(([k, l, g, d]) => html`<div key=${k} class="mc-job">
        <span class="mc-tile-ico"><${Glyph} k=${g} size=${15}/></span>
        <div style="min-width:0;flex:1"><div class="rowname" style="font-size:13px">${l}</div><div class="small">${d}</div></div>
        <button class=${'mc-switch' + (flags[k] ? ' on' : '')} role="switch" aria-checked=${!!flags[k]} aria-label=${l} disabled=${!isFounder}
          onClick=${async () => { if (flags[k] && !await ui.confirm({ title: `Pause ${l.toLowerCase()}?`, body: 'Everyone is affected right away.', confirmLabel: 'Pause', danger: true })) return;
            saveCfg('flags', { ...flags, [k]: !flags[k] }); }}><i></i></button>
      </div>`)}
      ${!isFounder && html`<div class="small" style="margin-top:8px">Only the founder can flip these.</div>`}
    </div>
  </div>`;
}

function Badges({ actions }) {
  const [nb, setNb] = useState({ label: '', emoji: 'medal', color: '#b06bff', blurb: '' });
  const badgeList = () => Object.entries(BADGE_DEFS).sort((a, b) => (a[1].sort ?? 99) - (b[1].sort ?? 99));
  const chipStyle = d => d?.color ? `color:${d.color};border-color:color-mix(in srgb, ${d.color} 45%, transparent)` : '';
  const slugOf = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
  async function createBadge() {
    const slug = slugOf(nb.label);
    if (slug.length < 2) { actions.notify('Give the badge a name first'); return; }
    if (BADGE_DEFS[slug]) { actions.notify('A badge with that name already exists'); return; }
    const ok = await actions.saveBadgeDef({ slug, label: nb.label.trim().slice(0, 40), emoji: toGlyph(nb.emoji, 'medal'),
      color: nb.color, tier: 'cosmetic', blurb: nb.blurb.trim().slice(0, 120) || null });
    if (ok) setNb({ label: '', emoji: 'medal', color: '#b06bff', blurb: '' });
  }
  return html`<div style="margin-top:10px">
    ${badgeList().map(([slug, d]) => html`<div key=${slug} class="staffrow" style="align-items:center">
      <span class="badgechip" style=${chipStyle(d)}><${Sym} v=${d.icon} size=${11}/>${d.label}</span>
      <div style="flex:1;min-width:0"><div class="rowsub" style="white-space:normal">${d.tier === 'power' ? 'Role — carries staff abilities' : 'Recognition — zero permissions'}${d.blurb ? ` · ${d.blurb}` : ''}</div></div>
      ${d.tier !== 'power' && html`<button class="btn" style="padding:7px 10px;flex:none" aria-label="Delete badge"
        onClick=${async () => { if (await ui.confirm({ title: `Delete the ${d.label} badge?`, body: 'It disappears from every profile that has it.', confirmLabel: 'Delete', danger: true })) actions.deleteBadgeDef(slug); }}><${IcTrash} size=${13}/></button>`}
    </div>`)}
    <div class="flabel" style="margin-top:18px">New recognition badge</div>
    <input class="input" style="margin-top:8px" placeholder="Name — e.g. Influencer, Beta Tester" value=${nb.label} onInput=${e => setNb({ ...nb, label: e.target.value })}/>
    <input class="input" style="margin-top:8px" placeholder="One-liner (optional)" value=${nb.blurb} onInput=${e => setNb({ ...nb, blurb: e.target.value })}/>
    <div class="glyphgrid" style="margin-top:8px">${BADGE_GLYPHS.map(g => html`<button key=${g} class=${'glyphbtn' + (nb.emoji === g ? ' on' : '')}
      aria-label=${glyphLabel(g)} title=${glyphLabel(g)} onClick=${() => setNb({ ...nb, emoji: g })}><${Glyph} k=${g} size=${18}/></button>`)}</div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
      ${['#b06bff', '#2dd4bf', '#34d399', '#f5b544', '#ff5d8f', '#4dabf7', '#ff6b5d', '#ffd43b', '#f4f4f5'].map(c => html`
        <button key=${c} class=${'bswatch' + (nb.color === c ? ' on' : '')} style=${`background:${c}`} aria-label=${'colour ' + c} onClick=${() => setNb({ ...nb, color: c })}/>`)}
    </div>
    <div style="margin-top:10px"><span class="badgechip" style=${chipStyle({ color: nb.color })}><${Sym} v=${nb.emoji} size=${11}/>${nb.label.trim() || 'Preview'}</span></div>
    <button class="btn btn-block" style="margin-top:12px" onClick=${createBadge}>Create badge</button>
    <div class="hint" style="margin-top:10px">Recognition badges are pure cosmetics — hand them out freely, they unlock nothing. The three power roles are fixed: Support reads reports, Staff moderates members, Founder is you. Grant any badge from <b>Members</b> → <b>Roles</b>.</div>
  </div>`;
}

function Log({ data, who, myRole }) {
  const [q, setQ] = useState('');
  const list = (data.log || []).filter(a => !q.trim() || `${a.action} ${a.note || ''} ${who(a.actor)} ${a.target ? who(a.target) : ''}`.toLowerCase().includes(q.toLowerCase()));
  return html`<div style="margin-top:12px">
    <input class="input" value=${q} onInput=${e => setQ(e.target.value)} placeholder="filter — ban, plus, story, a name…"/>
    ${!list.length && html`<div class="small" style="padding:10px 2px">${q ? 'Nothing matches.' : myRole === 'founder' ? 'No staff actions yet.' : 'Your actions will show here.'}</div>`}
    ${list.map(a => html`<div key=${a.id} class="staffrow">
      <span style="flex:none;display:flex;color:var(--muted)"><${Glyph} k=${/plus/.test(a.action) ? 'plus' : /remov|sweep/.test(a.action) ? 'hourgl' : /report/.test(a.action) ? 'flag' : 'gavel'} size=${15}/></span>
      <div style="min-width:0;flex:1">
        <div class="rowname" style="font-size:12.5px">${who(a.actor)} · ${a.action}${a.target ? ` → ${who(a.target)}` : ''}</div>
        ${a.note && html`<div class="rowsub" style="white-space:normal">${a.note}</div>`}
        <div class="small" style="margin-top:2px">${ago(a.created_at)}</div>
      </div>
    </div>`)}
    <div class="small" style="margin-top:12px;opacity:.7">Every action lands here and can't be edited — ${myRole === 'founder' ? 'you see everything; staff see their own.' : 'the founder sees the full log.'}</div>
  </div>`;
}

/* ============================================================
   REPORT a member (or their story) — lands in the staff queue
   ============================================================ */
export function ReportSheet({ f, onSend, onClose, what = 'person' }) {
  const REASONS = ['Harassment or bullying', 'Inappropriate content', 'Spam or scam', 'Impersonation', 'Something else'];
  const [r, setR] = useState(null); const [d, setD] = useState(''); const [busy, setBusy] = useState(false);
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Report ${what === 'story' ? `${fname(f) || 'this'}’s story` : fname(f) || ('@' + (f?.handle || ''))}</div>
      <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px">Goes straight to Orbit staff — one report per person per day.${what === 'story' ? ' Staff can see the story once you report it.' : ''}</div>
    <div class="flabel">Reason</div>
    <div class="stack">${REASONS.map(x => html`<button key=${x} class="cardrow" style=${r === x ? 'border-color:var(--now);background:rgba(255,93,143,.08)' : ''}
      onClick=${() => setR(x)}><span class="rowname" style="font-size:12.5px">${x}</span></button>`)}</div>
    <div class="flabel">Details · optional</div>
    <textarea class="input" rows="2" maxlength="300" value=${d} onInput=${e => setD(e.target.value)} placeholder="Anything staff should know"></textarea>
    <button class="btn btn-block" style="margin-top:14px;border-color:rgba(255,93,143,.45);color:#ff9db8" disabled=${!r || busy}
      onClick=${async () => { setBusy(true); const ok = await onSend(r + (d.trim() ? ` — ${d.trim()}` : '')); setBusy(false); if (ok) onClose(); }}>
      <${IcFlag} size=${14}/> ${busy ? 'Sending…' : 'Send report'}</button>
  </div>`;
}
