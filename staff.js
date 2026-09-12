/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { html, useEffect, useState } from './lib.js';
import { BADGE_DEFS, IcFlag, IcTrash, IcUser, IcX, ago, badgesOf, fname, roleOf, sb, shownName, ui } from './core.js';
import { Avatar, BadgeChips, Eyebrow, You } from './components.js';

export function StaffPanel({ uid, me, myRole, data, profiles, nameOf, reload, actions, onOpenProfile, openMod }) {
  const [sec, setSec] = useState('reports');
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [badgeFor, setBadgeFor] = useState(null);   // member row with the role editor open
  const [bBusy, setBBusy] = useState(false);
  const [nb, setNb] = useState({ label:'', emoji:'✨', color:'#b06bff', blurb:'' });
  useEffect(()=>{ reload(); }, []);
  const canAct = myRole==='founder' || myRole==='staff';
  const isFounder = myRole==='founder';
  const badgeList = () => Object.entries(BADGE_DEFS).sort((a,b)=>(a[1].sort??99)-(b[1].sort??99));
  const chipStyle = d => d?.color ? `color:${d.color};border-color:color-mix(in srgb, ${d.color} 45%, transparent)` : '';
  const canTouch = p => { if (!canAct || !p || p.id===uid) return false;
    const r = roleOf(p); if (r==='founder') return false;
    if (r && !isFounder) return false; return true; };
  const restrictedTxt = p => { const s = p?.suspended_until; if (!s) return null;
    if (s==='infinity') return 'banned';
    return new Date(s) > new Date() ? 'suspended · '+new Date(s).toLocaleDateString() : null; };
  const patchRes = (id, out) => { if (out && typeof out==='object')
    setRes(rs=>(rs||[]).map(x=>x.id!==id ? x : Array.isArray(out) ? { ...x, badges:out } : { ...x, ...out })); };
  async function search() {
    const t = q.trim().replace(/[%,()]/g,''); if (t.length<2) { setRes([]); return; }
    setBusy(true);
    try{ const { data:d } = await sb.from('profiles').select('*').or(`handle.ilike.%${t}%,display_name.ilike.%${t}%`).limit(8);
      setRes(d||[]); }catch{ setRes([]); }
    setBusy(false);
  }
  const askSuspend = (p, hours, label) => {
    const n = prompt(`Suspend ${shownName(p)} for ${label}? Add a reason — they'll see it:`, '');
    if (n===null) return;
    actions.suspendUser(p.id, hours, n).then(out=>patchRes(p.id, out));
  };
  const openR = (data.reports||[]).filter(r=>r.status==='open');
  const doneR = (data.reports||[]).filter(r=>r.status!=='open').slice(0,10);
  const who = id => id===uid ? 'you' : nameOf(id);

  /* tap-to-toggle role editor — every grant/revoke is one RPC, and the DB
     re-checks the hierarchy, so this UI can only ever mirror real permissions */
  const roleEditor = p => html`<div class="chiprow" style="margin-top:8px">
    ${badgeList().map(([slug,d])=>{
      const has = badgesOf(p).includes(slug);
      const locked = slug==='founder' || (d.tier==='power' && !isFounder);
      if (locked && !has) return null;
      return html`<button key=${slug} class=${'badgechip bchip-tog'+(has?'':' bchip-off')} disabled=${locked||bBusy}
        style=${chipStyle(d)} title=${d.blurb||''}
        onClick=${async()=>{ setBBusy(true);
          const out = has ? await actions.revokeBadge(p.id, slug) : await actions.grantBadge(p.id, slug);
          patchRes(p.id, out); setBBusy(false); }}>
        <span style="font-size:10px;opacity:.8">${d.icon}</span>${d.label}${has?' ✓':''}</button>`;
    })}
    <div class="set-hint" style="flex-basis:100%">${isFounder
      ? 'Tap to grant or remove. Staff and Support carry real abilities; everything else is recognition only.'
      : 'Tap to grant or remove recognition badges — they carry no permissions.'}</div>
  </div>`;

  const memberRow = p => html`<div key=${p.id} class="staffrow">
    <${Avatar} p=${p} size=${34}/>
    <div style="min-width:0;flex:1">
      <div class="rowname" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${shownName(p)||('@'+p.handle)}
        <${BadgeChips} p=${p}/>
        ${restrictedTxt(p) && html`<span class="stafftag" style="color:#ff9db8;border-color:rgba(255,93,143,.5);background:rgba(255,93,143,.1)">${restrictedTxt(p)}</span>`}
      </div>
      <div class="rowsub">@${p.handle}</div>
      ${canTouch(p) && html`<div class="pillrow" style="margin-top:7px">
        <button class="pill" onClick=${()=>askSuspend(p, 24, '24 hours')}>1 day</button>
        <button class="pill" onClick=${()=>askSuspend(p, 168, '7 days')}>7 days</button>
        <button class="pill" style="color:#ff9db8;border-color:rgba(255,93,143,.4)"
          onClick=${()=>{ const n = prompt(`Ban ${shownName(p)} permanently? Type a reason — they'll see it:`); if (n!==null) actions.suspendUser(p.id, 0, n||'').then(out=>patchRes(p.id, out)); }}>Ban</button>
        ${restrictedTxt(p) && html`<button class="pill on-teal" onClick=${()=>actions.liftUser(p.id).then(out=>patchRes(p.id, out))}>Lift</button>`}
        <button class=${'pill'+(badgeFor===p.id?' on':'')} onClick=${()=>setBadgeFor(badgeFor===p.id?null:p.id)}>🎖 Roles</button>
      </div>`}
      ${canTouch(p) && badgeFor===p.id && roleEditor(p)}
    </div>
    <button class="btn" style="padding:7px 10px;flex:none" onClick=${()=>onOpenProfile(p.id)} aria-label="View profile"><${IcUser} size=${13}/></button>
  </div>`;

  const slugOf = s => s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24);
  async function createBadge() {
    const slug = slugOf(nb.label);
    if (slug.length<2) { actions.notify('Give the badge a name first'); return; }
    if (BADGE_DEFS[slug]) { actions.notify('A badge with that name already exists'); return; }
    const ok = await actions.saveBadgeDef({ slug, label:nb.label.trim().slice(0,40), emoji:(nb.emoji.trim()||'★').slice(0,4),
      color:nb.color, tier:'cosmetic', blurb:nb.blurb.trim().slice(0,120)||null });
    if (ok) setNb({ label:'', emoji:'✨', color:'#b06bff', blurb:'' });
  }

  return html`<div style="animation:pop .2s ease">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
      <div>
        <${Eyebrow} color="var(--major)">Mission control<//>
        <div class="small" style="margin-top:5px">signed in as <b style="color:var(--ink)">${fname(me)}</b>
          <span class="badgechip" style=${'margin-left:6px;vertical-align:1px;'+chipStyle(BADGE_DEFS[myRole])}><span style="font-size:10px;opacity:.8">${BADGE_DEFS[myRole]?.icon}</span>${BADGE_DEFS[myRole]?.label}</span></div>
      </div>
      <button class="btn" style="padding:8px 12px;flex:none" onClick=${reload}>↻ Refresh</button>
    </div>
    ${myRole==='support' && html`<div class="hint" style="margin-top:10px">Support is read-only — you see everything here, actions are for staff.</div>`}

    <div class="pillrow" style="margin-top:14px">
      ${[['reports','🚩 Reports'+(openR.length?` · ${openR.length}`:'')],['members','👥 Members'],
         ...(isFounder?[['badges','🎖 Badges']]:[]),['log','📜 Log']].map(([k,l])=>html`
        <button key=${k} class=${'pill'+(sec===k?' on':'')} style="font-weight:600" onClick=${()=>setSec(k)}>${l}</button>`)}
    </div>

    ${sec==='reports' && html`<div style="margin-top:10px">
      ${data.reports===null && html`<div class="card"><div class="hint" style="margin:0">Mission control isn’t reachable right now — try ↻ Refresh in a moment.</div></div>`}
      ${data.reports!==null && !openR.length && html`<div class="small" style="padding:8px 2px">No open reports — space is quiet ✨</div>`}
      ${openR.map(r=>html`<div key=${r.id} class="staffrow">
        <span style="font-size:16px;flex:none;margin-top:2px">🚩</span>
        <div style="min-width:0;flex:1">
          <div class="rowname" style="white-space:normal">${who(r.reporter)} reported <b style="cursor:pointer;color:var(--major)" onClick=${()=>onOpenProfile(r.target)}>${who(r.target)}</b>${r.kind==='message' ? '’s message' : ''}</div>
          <div class="rowsub" style="white-space:normal;margin-top:2px;line-height:1.45">${r.reason}</div>
          ${r.ref?.snippet!==undefined && html`<div class="modsnip">${r.ref.msg_kind && r.ref.msg_kind!=='text' ? `[${r.ref.msg_kind} link] ` : ''}${r.ref.snippet ? `“${r.ref.snippet}”` : '(no text)'}</div>`}
          <div class="small" style="margin-top:3px">${ago(r.created_at)}</div>
          ${canAct && html`<div class="pillrow" style="margin-top:7px">
            <button class="pill on-teal" onClick=${()=>actions.resolveReport(r,'resolved')}>✓ Resolve</button>
            <button class="pill" onClick=${()=>actions.resolveReport(r,'dismissed')}>Dismiss</button>
            <button class="pill" onClick=${()=>onOpenProfile(r.target)}>Profile</button>
            ${myRole==='founder' && r.ref?.ref && html`<button class="pill" onClick=${()=>openMod(r.ref)}>👁 Open chat</button>`}
          </div>`}
        </div>
      </div>`)}
      ${doneR.length>0 && html`<div class="flabel" style="margin-top:16px">Recently handled</div>`}
      ${doneR.map(r=>html`<div key=${r.id} class="staffrow" style="opacity:.55">
        <span style="font-size:14px;flex:none">${r.status==='resolved'?'✅':'🫥'}</span>
        <div style="min-width:0;flex:1">
          <div class="rowsub" style="white-space:normal">${who(r.reporter)} → ${who(r.target)} · ${r.reason.slice(0,60)}</div>
          <div class="small">${r.status}${r.handled_by?` by ${who(r.handled_by)}`:''} · ${ago(r.created_at)}</div>
        </div>
      </div>`)}
    </div>`}

    ${sec==='members' && html`<div style="margin-top:10px">
      <div style="display:flex;gap:8px">
        <input class="input" value=${q} onInput=${e=>setQ(e.target.value)} placeholder="search handle or name" autocapitalize="none"
          onKeyDown=${e=>{ if(e.key==='Enter') search(); }}/>
        <button class="btn" style="flex:none;padding:11px 14px" disabled=${busy||q.trim().length<2} onClick=${search}>${busy?'…':'Search'}</button>
      </div>
      <div class="hint" style="margin-top:8px">${isFounder
        ? 'You can act on anyone — nobody can touch you. 🎖 Roles hands out staff roles and recognition badges.'
        : 'You can act on members; the founder handles staff. 🎖 Roles hands out recognition badges.'}</div>
      ${res && !res.length && html`<div class="small" style="margin-top:8px">No matches.</div>`}
      ${(res||[]).map(memberRow)}
    </div>`}

    ${sec==='badges' && isFounder && html`<div style="margin-top:10px">
      ${badgeList().map(([slug,d])=>html`<div key=${slug} class="staffrow" style="align-items:center">
        <span class="badgechip" style=${chipStyle(d)}><span style="font-size:10px;opacity:.8">${d.icon}</span>${d.label}</span>
        <div style="flex:1;min-width:0"><div class="rowsub" style="white-space:normal">${d.tier==='power' ? 'Role — carries staff abilities' : 'Recognition — zero permissions'}${d.blurb?` · ${d.blurb}`:''}</div></div>
        ${d.tier!=='power' && html`<button class="btn" style="padding:7px 10px;flex:none" aria-label="Delete badge"
          onClick=${async()=>{ if(await ui.confirm({ title:`Delete the ${d.label} badge?`, body:'It disappears from every profile that has it.', confirmLabel:'Delete', danger:true })) actions.deleteBadgeDef(slug); }}><${IcTrash} size=${13}/></button>`}
      </div>`)}
      <div class="flabel" style="margin-top:18px">New recognition badge</div>
      <input class="input" style="margin-top:8px" placeholder="Name — e.g. Influencer, Beta Tester" value=${nb.label} onInput=${e=>setNb({ ...nb, label:e.target.value })}/>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input class="input" style="width:76px;flex:none;text-align:center" maxlength="4" aria-label="Badge emoji" value=${nb.emoji} onInput=${e=>setNb({ ...nb, emoji:e.target.value })}/>
        <input class="input" placeholder="One-liner (optional)" value=${nb.blurb} onInput=${e=>setNb({ ...nb, blurb:e.target.value })}/>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        ${['#b06bff','#2dd4bf','#34d399','#f5b544','#ff5d8f','#4dabf7','#ff6b5d','#ffd43b','#f4f4f5'].map(c=>html`
          <button key=${c} class=${'bswatch'+(nb.color===c?' on':'')} style=${`background:${c}`} aria-label=${'colour '+c} onClick=${()=>setNb({ ...nb, color:c })}/>`)}
      </div>
      <div style="margin-top:10px"><span class="badgechip" style=${chipStyle({ color:nb.color })}><span style="font-size:10px;opacity:.8">${nb.emoji.trim()||'★'}</span>${nb.label.trim()||'Preview'}</span></div>
      <button class="btn btn-block" style="margin-top:12px" onClick=${createBadge}>Create badge</button>
      <div class="hint" style="margin-top:10px">Recognition badges are pure cosmetics — hand them out freely, they unlock nothing. The three power roles are fixed: Support reads reports, Staff moderates members, Founder is you. Grant any badge from 👥 Members → 🎖 Roles.</div>
    </div>`}

    ${sec==='log' && html`<div style="margin-top:10px">
      ${!data.log.length && html`<div class="small" style="padding:8px 2px">${myRole==='founder'?'No staff actions yet.':'Your actions will show here.'}</div>`}
      ${data.log.map(a=>html`<div key=${a.id} class="staffrow">
        <span style="font-size:14px;flex:none">🛠️</span>
        <div style="min-width:0;flex:1">
          <div class="rowname" style="font-size:12.5px">${who(a.actor)} · ${a.action}${a.target?` → ${who(a.target)}`:''}</div>
          ${a.note && html`<div class="rowsub" style="white-space:normal">${a.note}</div>`}
          <div class="small" style="margin-top:2px">${ago(a.created_at)}</div>
        </div>
      </div>`)}
      <div class="small" style="margin-top:12px;opacity:.7">Every action lands here and can't be edited — ${myRole==='founder'?'you see everything; staff see their own.':'the founder sees the full log.'}</div>
    </div>`}
  </div>`;
}

/* ============================================================
   SETTINGS — appearance / account / privacy
   Appearance prefs are cosmetic and live on the device. Account
   data uses Supabase auth + profiles. Blocking hides a user from
   your Orbit and drops the friendship if there is one.
   ============================================================ */

export function ReportSheet({ f, onSend, onClose }) {
  const REASONS = ['Harassment or bullying','Inappropriate content','Spam or scam','Impersonation','Something else'];
  const [r, setR] = useState(null); const [d, setD] = useState(''); const [busy, setBusy] = useState(false);
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Report ${fname(f)||('@'+(f?.handle||''))}</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px">Goes straight to Orbit staff — one report per person per day.</div>
    <div class="flabel">Reason</div>
    <div class="stack">${REASONS.map(x=>html`<button key=${x} class="cardrow" style=${r===x?'border-color:var(--now);background:rgba(255,93,143,.08)':''}
      onClick=${()=>setR(x)}><span class="rowname" style="font-size:12.5px">${x}</span></button>`)}</div>
    <div class="flabel">Details · optional</div>
    <textarea class="input" rows="2" maxlength="300" value=${d} onInput=${e=>setD(e.target.value)} placeholder="Anything staff should know"></textarea>
    <button class="btn btn-block" style="margin-top:14px;border-color:rgba(255,93,143,.45);color:#ff9db8" disabled=${!r||busy}
      onClick=${async()=>{ setBusy(true); const ok = await onSend(r + (d.trim() ? ` — ${d.trim()}` : '')); setBusy(false); if (ok) onClose(); }}>
      <${IcFlag} size=${14}/> ${busy?'Sending…':'Send report'}</button>
  </div>`;
}

/* ============================================================
   MISSION CONTROL — staff-only moderation tab
   founder → everything · staff → act on members · support → read-only.
   RLS + DB triggers enforce every rule server-side; this UI just
   mirrors what each role is actually allowed to do.
   ============================================================ */
