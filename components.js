/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { Fragment, h, html, render, useEffect, useMemo, useRef, useState } from './lib.js';
import { ACCENTS, ACTIVITY_CATALOG, ACT_KINDS, B, BADGE_DEFS, CAT, CATHEX, CATNAME, DAYS, HOBBY_PRESETS, HOUR, I, IcEye, IcEyeOff, IcOut, IcPin, IcPlus, IcTrash, IcUpload, IcX, KINDS, PRONOUN_PRESETS, SOCIALS, actOf, badgesOf, cleanHandle, cleanSocial, clockOf, decodePlace, flairOf, fmt, fname, hashStr, initialsOf, nowInfo, pxFor, sb, shownName, systemPhrase, ui } from './core.js';

export function Avatar({ p, size=44, badge=null, ring=null }) {
  const a1 = p?.accent1 || '#b06bff', a2 = p?.accent2 || '#2dd4bf';
  const ap = (p?.avatar_pos && typeof p.avatar_pos==='object') ? p.avatar_pos : {};
  const core = html`<div class="avatar" style=${`width:${size}px;height:${size}px;font-size:${Math.round(size*.36)}px;background:linear-gradient(140deg,${a1},${a2})`}>${initialsOf(shownName(p))}${p?.avatar_url && html`<img class="avimg" src=${p.avatar_url} alt="" loading="lazy" referrerpolicy="no-referrer" draggable=${false} style=${`--cx:${ap.x||0}%;--cy:${ap.y||0}%;--cz:${ap.z||1}`} onError=${e=>{e.target.style.display='none'}}/>`}</div>`;
  if (ring) return html`<div class="avwrap">
    <div class=${'ring'+(ring==='live'?' live':'')} style=${ring==='live' ? `background:conic-gradient(from 0deg, ${a1}, ${a2}, ${a1})` : 'background:rgba(255,255,255,.12)'}><div>${core}</div></div>
    ${badge}</div>`;
  return html`<div class="avwrap">${core}${badge}</div>`;
}
// deterministic mini-constellation drawn from a user id — same five stars forever
export function StarSig({ id, size=15 }) {
  const pts = useMemo(()=>{
    let h = hashStr(String(id||'orbit')) || 7;
    const rnd = () => ((h = (h*1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    return Array.from({ length:5 }, ()=>[3+rnd()*18, 3+rnd()*12]);
  }, [id]);
  const path = pts.map(p=>p.join(',')).join(' ');
  return html`<svg width=${Math.round(size*24/18)} height=${size} viewBox="0 0 24 18" fill="none" aria-hidden="true">
    <polyline points=${path} stroke="currentColor" stroke-width=".8" opacity=".45"/>
    ${pts.map((p,i)=>html`<circle key=${i} cx=${p[0]} cy=${p[1]} r=${i===4?1.8:1.1} fill="currentColor" opacity=${i===4?1:.8}/>`)}
  </svg>`;
}

// a display name with the owner's flair applied (gradient / shimmer / star signature)
export function NameFx({ p, text, style='' }) {
  const fl = flairOf(p);
  const label = text ?? shownName(p);
  const grad = Array.isArray(fl.ng) && fl.ng.length===2 ? fl.ng : null;
  const nameEl = grad
    ? html`<span class=${'ngrad'+(fl.anim?' shine':'')} style=${`background-image:linear-gradient(90deg,${grad[0]},${grad[1]},${grad[0]});${style}`}>${label}</span>`
    : html`<span style=${style}>${label}</span>`;
  if (!fl.sig) return nameEl;
  return html`<span class="namefx">${nameEl}<span class="sig" style=${`color:${grad?grad[0]:'var(--major)'}`}><${StarSig} id=${p?.id}/></span></span>`;
}

// badge chips next to a name — defined in badge_defs, granted server-side only
export function BadgeChips({ p }) {
  const b = badgesOf(p).map(k=>BADGE_DEFS[k]).filter(Boolean);
  if (!b.length) return null;
  return html`<${Fragment}>${b.map(d=>html`<span key=${d.label} class="badgechip" title=${d.blurb||''} style=${d.color?`color:${d.color};border-color:color-mix(in srgb, ${d.color} 45%, transparent)`:''}><span style="font-size:10px;opacity:.8">${d.icon}</span>${d.label}</span>`)}<//>`;
}

export function TileGlyph({ e, size=40 }) {
  return html`<span class="acttile" style=${`width:${size}px;height:${size}px;border-radius:${Math.round(size*.3)}px;background:linear-gradient(135deg,${e.c[0]},${e.c[1]})`}>
    ${e.ic ? html`<${e.ic} size=${Math.round(size*.52)}/>` : html`<span style=${`font-size:${Math.round(size*.48)}px;line-height:1`}>${e.g}</span>`}
  </span>`;
}

/* Discord-style "now" card — brand tile, live dot, caption, time left */
export function ActivityCard({ act, mine=false, onClear, onEdit }) {
  const e = act.c, K = ACT_KINDS[e.k] || ACT_KINDS.playing;
  const ac = e.tc || e.c[0];
  const left = act.until ? Math.max(0, new Date(act.until) - Date.now()) : null;
  const leftTxt = left==null ? null : left>3600e3 ? Math.round(left/3600e3)+'h left' : Math.max(1,Math.round(left/60e3))+'m left';
  const body = html`<${Fragment}>
    <${TileGlyph} e=${e} size=${44}/>
    <div style="min-width:0;flex:1">
      <div class="acteyebrow" style=${`color:${ac}`}><span class="actdot" style=${`background:${ac};box-shadow:0 0 8px ${ac}`}></span>${K.eb}</div>
      <div class="actname">${e.name}</div>
      ${(act.d||leftTxt) && html`<div class="actdetail">${act.d||''}${act.d&&leftTxt?' · ':''}${leftTxt||''}</div>`}
    </div>
    ${mine && html`<button class="xbtn" style="width:28px;height:28px;flex:none" onClick=${ev=>{ev.stopPropagation(); onClear&&onClear();}} aria-label="Clear status"><${IcX} size=${13}/></button>`}
  <//>`;
  return mine
    ? html`<button class="actcard" style=${`--ac:${ac}`} onClick=${onEdit}>${body}</button>`
    : html`<div class="actcard" style=${`--ac:${ac}`}>${body}</div>`;
}

/* connection chips — URL is always built from the allowlist template */
export function LinkChips({ links }) {
  const [copied, setCopied] = useState('');
  const rows = (links||[]).map(l=>{ const s = SOCIALS[l?.k]; const u = cleanSocial(l?.u);
    return (s && u) ? { l, s, u } : null; }).filter(Boolean).slice(0,5);
  if (!rows.length) return null;
  return html`<div class="linkrow">
    ${rows.map(({l,s,u})=>{ const url = s.url ? s.url(u) : null;
      const inner = html`<${Fragment}>
        <span class="ltile" style=${`background:linear-gradient(135deg,${s.c[0]},${s.c[1]})`}><${s.Ic} size=${14}/></span>
        <span class="lmeta"><span class="lname" style=${`color:${s.tc||s.c[0]}`}>${s.name}</span>
          <span class="lhandle">${copied===l.k ? 'Copied ✓' : '@'+u}</span></span>
      <//>`;
      return url
        ? html`<a key=${l.k} class="linkchip" href=${url} target="_blank" rel="noopener noreferrer">${inner}</a>`
        : html`<button key=${l.k} class="linkchip" onClick=${()=>{ try{ navigator.clipboard.writeText(u); }catch{}
            setCopied(l.k); setTimeout(()=>setCopied(''), 1500); }}>${inner}</button>`; })}
  </div>`;
}

/* status picker — catalog only, optional caption, auto-clear timer */
export function SetStatusSheet({ current, onSet, onClose }) {
  const [k, setK] = useState(current?.c?.k || 'playing');
  const [pick, setPick] = useState(current?.id || null);
  const [d, setD] = useState(current?.d || '');
  const [dur, setDur] = useState(180);
  const opts = ACTIVITY_CATALOG.filter(e=>e.k===k);
  const sel = ACTIVITY_CATALOG.find(e=>e.id===pick);
  return html`<div>
    <div class="sheethead"><div class="sheettitle">What are you on? ✨</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="pillrow">
      ${Object.entries(ACT_KINDS).map(([id,v])=>html`<button key=${id} class=${'pill'+(k===id?' on':'')} style="font-weight:600"
        onClick=${()=>{ setK(id); setPick(null); }}>${v.label}</button>`)}
    </div>
    <div class="actgrid">
      ${opts.map(e=>html`<button key=${e.id} class=${'actopt'+(pick===e.id?' on':'')} onClick=${()=>setPick(pick===e.id?null:e.id)}>
        <${TileGlyph} e=${e} size=${36}/><span class="nm">${e.name}</span></button>`)}
    </div>
    <div class="flabel">Caption · optional</div>
    <input class="input" maxlength="40" value=${d} onInput=${e=>setD(e.target.value)}
      placeholder=${sel ? (k==='listening' ? 'song / artist' : k==='watching' ? 'what exactly?' : 'e.g. ranked grind, review sesh') : 'pick something first'}/>
    <div class="flabel">Clears after</div>
    <div class="pillrow">${[[60,'1 hr'],[180,'3 hrs'],[480,'8 hrs'],[0,'when I clear it']].map(([m,l])=>html`
      <button key=${m} class=${'pill'+(dur===m?' on-teal':'')} onClick=${()=>setDur(m)}>${l}</button>`)}</div>
    <button class="btn btn-grad btn-block" style="margin-top:16px" disabled=${!sel}
      onClick=${()=>onSet({ id:sel.id, d:d.trim()||null, until: dur ? new Date(Date.now()+dur*60e3).toISOString() : null })}>
      Set status</button>
    <div class="small" style="margin-top:10px">Statuses come from a fixed catalog — no links, no custom apps — so profiles stay clean.</div>
  </div>`;
}

export const StatusDot = ({color}) => html`<span class="statusdot" style=${`background:${color};--pc:${color}`}></span>`;
export const PinBadge = () => html`<span class="pinbadge"><${IcPin} size=${8}/></span>`;
export const Eyebrow = ({color='var(--major)', children}) => html`<div class="eyebrow" style=${`color:${color}`}>${children}</div>`;

export function Sheet({ open, onClose, accent='var(--major)', children }) {
  if (!open) return null;
  return html`<div class="sheetback" onClick=${onClose}>
    <div class="sheet" onClick=${e=>e.stopPropagation()}>
      <div class="sheetbar" style=${`background:linear-gradient(90deg,${accent},transparent 72%)`}></div>
      ${children}
    </div></div>`;
}

/* ============================================================
   SOLAR SYSTEM BOOT LOADER
   Top-view orrery on <canvas>. Planets orbit at speeds relative
   to the real solar system (Mercury fast → Neptune slow), scaled
   way down. On mount it spools up — the whole system eases from a
   standstill to full speed, so every load feels like it's igniting.
   Plain white, as asked.
   ============================================================ */
export const LOAD_LINES = [
  'aligning the planets','charging thrusters','plotting your orbit','syncing schedules',
  'waking the satellites','calibrating gravity','finding your friends','warming the reactor',
  'checking the star charts','spinning up',
];
// [orbit radius, planet radius, relative angular speed, has ring, faint]
export const PLANETS = [
  [26, 1.4, 4.15, false, false],
  [42, 2.2, 1.62, false, false],
  [60, 2.4, 1.00, false, false],
  [80, 1.9, 0.53, false, true ],
  [106,5.6, 0.084,false, false],
  [128,4.8, 0.034,true,  false],
  [146,3.4, 0.012,false, true ],
  [156,3.2, 0.006,false, true ],
];
export function SolarLoader({ note, steps=null, onRetry }) {
  const cvRef = useRef(null);
  const [line, setLine] = useState(0);
  const [fade, setFade] = useState(true);
  const [slow, setSlow] = useState(false);
  useEffect(()=>{ const t = setTimeout(()=>setSlow(true), 6000); return ()=>clearTimeout(t); },[]);
  useEffect(()=>{
    let i = 0;
    const iv = setInterval(()=>{
      setFade(false);
      setTimeout(()=>{ i=(i+1)%LOAD_LINES.length; setLine(i); setFade(true); }, 320);
    }, 2000);
    return ()=>clearInterval(iv);
  },[]);
  useEffect(()=>{
    const cv = cvRef.current; if(!cv) return;
    const ctx = cv.getContext('2d');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf=0, W=0, H=0, cx=0, cy=0, t0=performance.now(), last=t0, angle=0;
    function size(){
      const dpr=Math.min(window.devicePixelRatio||1,2);
      const r=cv.getBoundingClientRect(); W=r.width; H=r.height;
      cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0); cx=W/2; cy=H/2;
    }
    size();
    const scale = () => Math.min(W,H)/2/170;   // fit the 156-radius system
    function frame(now){
      const dt=Math.min(50,now-last); last=now;
      const el=(now-t0)/1000;
      // ease from a standstill up to full speed, with a touch of overshoot
      const spin = reduced ? 0.25 : (1.6*(1-Math.exp(-el/0.85)) - 0.6*Math.exp(-el/0.4));
      angle += dt*0.001*spin;
      const s=scale();
      ctx.clearRect(0,0,W,H);
      ctx.save(); ctx.translate(cx,cy); ctx.scale(s,s);
      // orbit rings
      for(const p of PLANETS){
        ctx.beginPath(); ctx.arc(0,0,p[0],0,Math.PI*2);
        ctx.strokeStyle = p[0]===60 ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.05)';
        ctx.lineWidth=0.6/s; ctx.stroke();
      }
      // sun
      const glow=ctx.createRadialGradient(0,0,0,0,0,12);
      glow.addColorStop(0,'rgba(255,255,255,.9)'); glow.addColorStop(.4,'rgba(255,255,255,.22)'); glow.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(0,0,4.4,0,Math.PI*2); ctx.fill();
      // planets
      PLANETS.forEach((p,i)=>{
        const a = angle*p[2] + i*1.7;
        const x=Math.cos(a)*p[0], y=Math.sin(a)*p[0];
        ctx.globalAlpha = p[4] ? 0.7 : 1;
        ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(x,y,p[1],0,Math.PI*2); ctx.fill();
        if(p[3]){ // ring
          ctx.globalAlpha=0.6; ctx.strokeStyle='#fff'; ctx.lineWidth=0.6/s;
          ctx.save(); ctx.translate(x,y); ctx.rotate(-0.4); ctx.scale(1,0.42);
          ctx.beginPath(); ctx.arc(0,0,p[1]+2.6,0,Math.PI*2); ctx.stroke(); ctx.restore();
        }
        ctx.globalAlpha=1;
      });
      ctx.restore();
      raf=requestAnimationFrame(frame);
    }
    raf=requestAnimationFrame(frame);
    const onR=()=>size(); addEventListener('resize',onR,{passive:true});
    return ()=>{ cancelAnimationFrame(raf); removeEventListener('resize',onR); };
  },[]);
  return html`<div class="solar-boot">
    <div class="solar-wrap"><canvas ref=${cvRef} class="solar-svg" aria-hidden="true"></canvas></div>
    <div class="solar-brand">Orbit</div>
    <div class="solar-text" style=${`opacity:${fade?1:0}`}>${note || LOAD_LINES[line]}</div>
    <div class="solar-meter"></div>
    ${steps && html`<div class="bootsteps">
      ${steps.map(st=>html`<div key=${st.k} class=${'bootstep '+st.s}>
        <span class="bglyph">${st.s==='ok'?'✓':st.s==='fail'?'✕':st.s==='run'?'◌':'·'}</span>${st.label}</div>`)}
      ${slow && !steps.some(s=>s.s==='fail') && html`<div class="bootnote">free server waking up — the first load can take ~20s</div>`}
      ${steps.some(s=>s.s==='fail') && onRetry && html`<button class="btn" style="margin-top:8px;align-self:stretch" onClick=${onRetry}>Retry</button>`}
    </div>`}
  </div>`;
}

/* ============================================================
   schedule grid
   ============================================================ */
export function Grid({ ownerId, classesByOwner, events, onPick, compact=false }) {
  const scRef = useRef(null);
  const nd = nowInfo();
  const rows = (END-START)/60;
  const myClasses = classesByOwner[ownerId] || [];
  const myEvents = events.filter(e => {
    const going = e.host===ownerId || (e.event_invitees||[]).some(i=>i.invitee===ownerId && i.status==='accepted');
    return going;
  });
  const counts = [0,0,0,0,0,0];
  myClasses.forEach(c=>counts[c.day]++);
  myEvents.forEach(e=>{ if(e.day>=0 && e.day<=5) counts[e.day]++; });

  // jump the viewport to "today, around now" on mount
  useEffect(() => {
    const el = scRef.current; if (!el) return;
    const t = nowInfo();
    el.scrollTop = Math.max(0, pxFor(t.min) - Math.min(el.clientHeight||420, 420)*0.35);
    const hd = el.querySelector('.hcell.today');
    if (hd) el.scrollLeft = Math.max(0, hd.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft - 48);
  }, [ownerId]);

  return html`<div class="board"><div class="gridscroll" ref=${scRef}><div class="sgrid">
    <div class="htime"></div>
    ${DAYS.map((d,i)=>html`<div key=${d} class=${'hcell'+(i===nd.day?' today':'')}>
      <div class="dow" style=${i===nd.day?'color:var(--now)':''}>${d}</div>
      <div class="cnt">${counts[i]||'—'}</div></div>`)}
    <div class="taxis" style=${`height:${rows*HOUR}px`}>
      ${Array.from({length:rows+1}).map((_,hh)=>html`<div key=${hh} class="hr" style=${`top:${hh*HOUR}px`}>${fmt((7+hh)*60)}</div>`)}
    </div>
    ${DAYS.map((_,di)=>html`<div key=${di} class=${'track'+(di===5?' wknd':'')+(di===nd.day?' today':'')} style=${`height:${rows*HOUR}px`}>
      ${myClasses.filter(c=>c.day===di).map(c=>html`<div key=${c.id} class="cls" style=${`--c:${CAT[c.cat]||CAT.major};top:${pxFor(c.start_min)}px;height:${pxFor(c.end_min)-pxFor(c.start_min)-3}px`}
          onClick=${()=>onPick && onPick({type:'class', row:c})}>
        <span class="cname">${c.name}</span>
        ${!compact && html`<span class="cmeta">${c.meta}</span>`}
        <span class="ctime">${fmt(c.start_min)}–${fmt(c.end_min)}</span>
      </div>`)}
      ${myEvents.filter(e=>e.day===di).map(e=>html`<div key=${e.id} class="evt" style=${`top:${pxFor(e.start_min)}px;height:${pxFor(e.end_min)-pxFor(e.start_min)-3}px`}
          onClick=${()=>onPick && onPick({type:'event', row:e})}>
        <span class="cname">${e.emoji||KINDS[e.kind]?.emoji||'✨'} ${e.title}</span>
        <span class="ctime">${fmt(e.start_min)}–${fmt(e.end_min)}</span>
      </div>`)}
      ${di===nd.day && nd.min>=START && nd.min<=END && html`<div class="nowline" style=${`top:${pxFor(nd.min)}px`}></div>`}
    </div>`)}
  </div></div></div>`;
}

/* ============================================================
   status + conflicts
   ============================================================ */
export function statusOf(pid, classesByOwner, events) {
  const nd = nowInfo();
  const cls = classesByOwner[pid] || [];
  for (const c of cls) if (c.day===nd.day && c.start_min<=nd.min && c.end_min>nd.min)
    return { kind:'class', text:`In ${c.name} · until ${fmt(c.end_min)}`, color:CATHEX[c.cat]||CATHEX.major };
  for (const e of events) {
    const going = e.host===pid || (e.event_invitees||[]).some(i=>i.invitee===pid && i.status==='accepted');
    if (going && e.day===nd.day && e.start_min<=nd.min && e.end_min>nd.min)
      return { kind:'event', text:`${KINDS[e.kind]?.label||'Plan'} · until ${fmt(e.end_min)}`, color:KINDS[e.kind]?.accent||'#b06bff' };
  }
  const rest = cls.filter(c=>c.day===nd.day && c.start_min>nd.min).sort((a,b)=>a.start_min-b.start_min);
  if (rest.length) return { kind:'free', text:`Free · next class ${fmt(rest[0].start_min)}`, color:'#9a8fa8' };
  return { kind:'free', text:'Free · no more classes today', color:'#9a8fa8' };
}
export function conflictsFor(pid, day, s, e, classesByOwner, events) {
  const out = [];
  for (const c of (classesByOwner[pid]||[]))
    if (c.day===day && c.start_min<e && c.end_min>s) out.push(`${c.name} (${fmt(c.start_min)}–${fmt(c.end_min)})`);
  for (const ev of events) {
    const going = ev.host===pid || (ev.event_invitees||[]).some(i=>i.invitee===pid && i.status==='accepted');
    if (going && ev.day===day && ev.start_min<e && ev.end_min>s) out.push(`${ev.title} (${fmt(ev.start_min)}–${fmt(ev.end_min)})`);
  }
  return out;
}

/* ============================================================
   free-window engine — powers "free now" + shared study gaps.
   Runs entirely off data already loaded (classes + accepted /
   hosted events), so it costs no extra queries. Someone is busy
   during those blocks; "free" is simply the complement.
   ============================================================ */
// merged, sorted busy intervals for one person on one weekday (0=Mon..5=Sat)
export function busyOn(pid, day, classesByOwner, events) {
  const iv = [];
  for (const c of (classesByOwner[pid]||[])) if (c.day===day) iv.push([c.start_min, c.end_min]);
  for (const e of (events||[])) {
    const going = e.host===pid || (e.event_invitees||[]).some(i=>i.invitee===pid && i.status==='accepted');
    if (going && e.day===day) iv.push([e.start_min, e.end_min]);
  }
  iv.sort((a,b)=>a[0]-b[0]);
  const out = [];
  for (const [s,e] of iv) { const last = out[out.length-1];
    if (last && s<=last[1]) last[1] = Math.max(last[1], e); else out.push([s,e]); }
  return out;
}
// free gaps for one person within [from,to], each ≥ minLen minutes
export function freeOn(pid, day, from, to, classesByOwner, events, minLen=0) {
  const busy = busyOn(pid, day, classesByOwner, events);
  const gaps = []; let cur = from;
  for (const [s,e] of busy) {
    if (e<=from || s>=to) continue;
    if (s>cur) gaps.push([cur, Math.min(s,to)]);
    cur = Math.max(cur, e);
    if (cur>=to) break;
  }
  if (cur<to) gaps.push([cur,to]);
  return gaps.filter(g=>g[1]-g[0]>=minLen);
}
// overlap of two sorted gap lists → shared free windows
export function intersectGaps(a, b, minLen=0) {
  const out = []; let i=0, j=0;
  while (i<a.length && j<b.length) {
    const s = Math.max(a[i][0], b[j][0]), e = Math.min(a[i][1], b[j][1]);
    if (e-s>=minLen) out.push([s,e]);
    if (a[i][1]<b[j][1]) i++; else j++;
  }
  return out;
}
// is this person free right now? → { free, until } (until = next block start, else END)
export function freeNow(pid, classesByOwner, events) {
  const nd = nowInfo();
  if (nd.day>5) return { free:false, until:null };
  const busy = busyOn(pid, nd.day, classesByOwner, events);
  for (const [s,e] of busy) if (s<=nd.min && e>nd.min) return { free:false, until:e };
  let until = END; for (const [s] of busy) if (s>nd.min) { until = s; break; }
  return { free:true, until };
}
// shared free windows today between two people, from now (or `from`) to END, ≥ minLen
export function sharedToday(myId, otherId, classesByOwner, events, from=null, minLen=30) {
  const nd = nowInfo();
  if (nd.day>5) return [];
  const start = from==null ? Math.max(nd.min, START) : from;
  if (start>=END) return [];
  const mine = freeOn(myId, nd.day, start, END, classesByOwner, events, minLen);
  const theirs = freeOn(otherId, nd.day, start, END, classesByOwner, events, minLen);
  return intersectGaps(mine, theirs, minLen);
}
export const winLabel = w => `${fmt(w[0])}–${fmt(w[1])}`;
export const winMins = w => w[1]-w[0];
// snap a shared window to a sensible plan length (largest preset that fits, ≥30)
export const fitDur = w => { const len = w[1]-w[0]; let d = 30; for (const p of [30,60,90,120,180]) if (p<=len) d = p; return d; };
// pretty duration, e.g. 90 → "1h 30m"
export const durLabel = m => { const h=Math.floor(m/60), mm=m%60; return (h?`${h}h`:'')+(h&&mm?' ':'')+(mm?`${mm}m`:(h?'':'0m')); };

/* ============================================================
   AUTH SCREEN
   ============================================================ */
export function PwInput({ value, onInput, placeholder, autocomplete, show, setShow, onEnter }) {
  return html`<div class="pwwrap">
    <input class="input" type=${show?'text':'password'} value=${value} onInput=${onInput}
      placeholder=${placeholder} autocomplete=${autocomplete}
      onKeyDown=${e=>{ if(e.key==='Enter'&&onEnter) onEnter(); }}/>
    <button type="button" class="pweye" aria-label=${show?'Hide password':'Show password'} onClick=${()=>setShow(!show)}>
      ${show ? html`<${IcEyeOff} size=${16}/>` : html`<${IcEye} size=${16}/>`}
    </button>
  </div>`;
}

export function AuthScreen() {
  const [mode, setMode] = useState('in');
  const [f, setF] = useState({ name:'', handle:'', course:'', school:'', email:'', password:'', confirm:'' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [show, setShow] = useState(false);
  const set = k => e => setF(v=>({ ...v, [k]: k==='handle' ? cleanHandle(e.target.value) : e.target.value }));

  const friendly = m => {
    if (!m) return 'Something went wrong. Try again.';
    if (/already registered/i.test(m)) return 'That email already has an account — switch to Sign in.';
    if (/invalid login/i.test(m)) return 'Wrong email or password.';
    if (/at least 6/i.test(m)) return 'Password needs at least 6 characters.';
    if (/relation .* does not exist|42P01/i.test(m)) return 'Orbit is having database trouble — try again in a bit.';
    if (/provider is not enabled|unsupported provider/i.test(m)) return 'Google sign-in isn\u2019t available right now \u2014 use email instead.';
    if (/rate limit/i.test(m)) return 'Too many tries — wait a minute and try again.';
    return m;
  };

  async function go() {
    setErr(''); setOk(''); setBusy(true);
    try {
      if (mode==='up') {
        if (!f.name.trim()) throw new Error('Add your name.');
        if (f.handle.length<3) throw new Error('Handle needs 3–20 letters/numbers/underscores.');
        if (f.password.length<6) throw new Error('Password needs at least 6 characters.');
        if (f.password!==f.confirm) throw new Error("Passwords don't match — check the confirm field.");
        const { data, error } = await sb.auth.signUp({
          email:f.email.trim(), password:f.password,
          options:{ data:{ display_name:f.name.trim(), handle:f.handle, course:f.course.trim(), school:f.school.trim() } }
        });
        if (error) throw error;
        if (data.session && f.school.trim()) {
          // best effort — needs the school column; ignored if it's not there yet
          await sb.from('profiles').update({ school:f.school.trim() }).eq('id', data.session.user.id);
        }
        if (!data.session) setOk('Account created — but email confirmation is still ON in Supabase, so check your inbox for a confirm link. (To make sign-ups instant: Supabase → Authentication → Providers → Email → turn off "Confirm email".)');
      } else {
        const { error } = await sb.auth.signInWithPassword({ email:f.email.trim(), password:f.password });
        if (error) throw error;
      }
    } catch(e) { setErr(friendly(e.message||String(e))); }
    setBusy(false);
  }

  async function google() {
    setErr(''); setOk(''); setBusy(true);
    try {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
      });
      if (error) throw error;
      // success: the browser is navigating to Google — keep the busy state on
    } catch(e) { setErr(friendly(e.message||String(e))); setBusy(false); }
  }

  return html`<div class="authcol"><div class="authwrap">
    <div class="brand-eyebrow">for students · by students</div>
    <div class="brand" style="font-size:38px;margin-top:6px">Orbit</div>
    <div class="hint">See when your friends are free. Plan coffee, study groups, and lunch around real class schedules — any school, any course.</div>
    <div class="authcard">
      <div class="authtabs">
        <button class=${'authtab'+(mode==='in'?' on':'')} onClick=${()=>{setMode('in');setErr('');setOk('')}}>Sign in</button>
        <button class=${'authtab'+(mode==='up'?' on':'')} onClick=${()=>{setMode('up');setErr('');setOk('')}}>Create account</button>
      </div>
      ${mode==='up' && html`<${Fragment}>
        <div class="flabel">Your name</div>
        <input class="input" value=${f.name} onInput=${set('name')} placeholder="Your full name" autocomplete="name"/>
        <div class="flabel">Handle · how friends find you</div>
        <input class="input" value=${f.handle} onInput=${set('handle')} placeholder="yourhandle" autocapitalize="none" autocomplete="username"/>
        <div class="formrow">
          <div>
            <div class="flabel">Course · optional</div>
            <input class="input" value=${f.course} onInput=${set('course')} placeholder="BSIT · 1st Yr"/>
          </div>
          <div>
            <div class="flabel">School · optional</div>
            <input class="input" value=${f.school} onInput=${set('school')} placeholder="Your school"/>
          </div>
        </div>
      <//>`}
      <div class="flabel">Email</div>
      <input class="input" type="email" value=${f.email} onInput=${set('email')} placeholder="you@email.com" autocomplete="email" inputmode="email"/>
      <div class="flabel">Password</div>
      <${PwInput} value=${f.password} onInput=${set('password')} placeholder="at least 6 characters"
        autocomplete=${mode==='up'?'new-password':'current-password'} show=${show} setShow=${setShow} onEnter=${mode==='in'?go:null}/>
      ${mode==='up' && html`<${Fragment}>
        <div class="flabel">Confirm password</div>
        <${PwInput} value=${f.confirm} onInput=${set('confirm')} placeholder="type it again"
          autocomplete="new-password" show=${show} setShow=${setShow} onEnter=${go}/>
      <//>`}
      ${err && html`<div class="errbox">${err}</div>`}
      ${ok && html`<div class="okbox">${ok}</div>`}
      <button class="btn btn-grad btn-block" style="margin-top:16px;padding:13px" disabled=${busy} onClick=${go}>
        ${busy ? 'One sec…' : (mode==='up' ? 'Create my account' : 'Sign in')}
      </button>
      <div class="authdiv">or</div>
      <button class="btn btn-block btn-google" disabled=${busy} onClick=${google}>
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Continue with Google
      </button>
      <div class="small" style="margin-top:12px;text-align:center">By continuing, you agree to Orbit’s <a href="tos.html" target="_blank" rel="noopener">Terms & Privacy Policy</a>.</div>
    </div>
    <div class="small" style="margin-top:14px;text-align:center">Your schedule is visible to friends only</div>
  </div></div>`;
}

/* ============================================================
   MAIN SHELL — data layer + realtime + screens
   ============================================================ */

export function You({ me, uid, classesBy, events, saveProfile, myPres, setPres, addClass, delClass, onPick, onImport }) {
  const [editing, setEditing] = useState(false);
  const [p, setP] = useState(()=>seedForm(me));
  const [adjust, setAdjust] = useState(null);            // 'avatar' | 'cover'
  const [hobbyIn, setHobbyIn] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [linkPick, setLinkPick] = useState(null);
  const [linkIn, setLinkIn] = useState('');
  const [nc, setNc] = useState({ name:'', meta:'', cat:'major', day:0, start:7*60, end:8*60+30 });
  const mine = classesBy[uid]||[];
  const times = []; for(let m=7*60; m<=19*60; m+=30) times.push(m);
  useEffect(()=>{ if(!editing) setP(seedForm(me)); }, [me]);

  const togHobby = h => setP(v=>{ const has=v.hobbies.includes(h);
    if(!has && v.hobbies.length>=10) return v;
    return { ...v, hobbies: has ? v.hobbies.filter(x=>x!==h) : [...v.hobbies, h] }; });
  const addHobby = () => { const t=hobbyIn.trim().slice(0,24); if(t) togHobby(t); setHobbyIn(''); };
  const addLink = () => { const u = cleanSocial(linkIn); if (!linkPick || !u) return;
    setP(v=>{ const rest = v.links.filter(x=>x.k!==linkPick);
      if (rest.length>=5) return v;
      return { ...v, links:[...rest, { k:linkPick, u }] }; });
    setLinkIn(''); setLinkPick(null); };
  const badUrl = u => u && !/^https:\/\/.+/i.test(u);

  async function submitClass() {
    if (!nc.name.trim()) return;
    if (nc.end<=nc.start) { ui.toast('End time must be after start time.'); return; }
    const ok = await addClass({ name:nc.name.trim(), meta:nc.meta.trim(), cat:nc.cat, day:nc.day, start_min:nc.start, end_min:nc.end });
    if (ok) setNc(v=>({ ...v, name:'', meta:'' }));
  }

  async function save() {
    if (p.handle.length<3){ ui.toast('Handle needs at least 3 characters.'); return; }
    if (badUrl(p.avatarUrl.trim()) || badUrl(p.coverUrl.trim())){ ui.toast('Image links must start with https://'); return; }
    setSaving(true);
    const ok = await saveProfile({
      display_name:p.name.trim()||me?.display_name, handle:p.handle, course:p.course.trim(), school:p.school.trim(),
      accent1:p.acc[0], accent2:p.acc[1],
      avatar_url:p.avatarUrl.trim()||null, avatar_pos:p.avatarPos,
      cover_url:p.coverUrl.trim()||null, cover_pos:p.coverPos,
      bio:p.bio.trim()||null, pronouns:p.pronouns.trim()||null,
      hobbies:p.hobbies, links:p.links, show_full_name:p.showFull,
    });
    setSaving(false);
    if (ok) setEditing(false);
  }

  // while editing, the header is a live preview of the form
  const pv = editing ? { ...me, display_name:p.name.trim()||me?.display_name, handle:p.handle||me?.handle,
      accent1:p.acc[0], accent2:p.acc[1], avatar_url:p.avatarUrl.trim()||null, avatar_pos:p.avatarPos,
      cover_url:p.coverUrl.trim()||null, cover_pos:p.coverPos, bio:p.bio, pronouns:p.pronouns,
      hobbies:p.hobbies, links:p.links, show_full_name:p.showFull } : me;
  const d0 = myPres?.sharing && !myPres?.ghost ? decodePlace(myPres?.zone) : null;

  return html`<div>
    <${CoverImg} p=${pv}/>
    <div class="profhead">
      <div class="profav"><${Avatar} p=${pv} size=${76}/></div>
      <div style="flex:1"></div>
      <button class="btn" style="padding:9px 13px;flex:none;margin-bottom:10px"
        onClick=${()=>{ if(editing) setEditing(false); else { setP(seedForm(me)); setEditing(true); } }}>${editing?'Close':'Edit profile'}</button>
    </div>
    <div class="profbody">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:#fff;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <${NameFx} p=${pv}/><${BadgeChips} p=${pv}/>
      </div>
      <div class="rowsub" style="margin-top:2px">@${pv?.handle}${pv?.course?` · ${pv.course}`:''}${pv?.school?` · ${pv.school}`:''}</div>
      ${pv?.pronouns && html`<div class="chiprow" style="margin-top:8px"><span class="idchip">💫 <b>${pv.pronouns}</b></span></div>`}
      ${pv?.bio && html`<div class="biotext">${pv.bio}</div>`}
      ${Array.isArray(pv?.hobbies) && pv.hobbies.length>0 && html`<div class="chiprow">${pv.hobbies.map(hb=>html`<span key=${hb} class="idchip">${hb}</span>`)}</div>`}
    </div>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      ${(()=>{ const a = actOf(myPres); return a
        ? html`<${ActivityCard} act=${a} mine onClear=${()=>setPres({ activity:null })} onEdit=${()=>setStatusOpen(true)}/>`
        : html`<button class="setactbtn" onClick=${()=>setStatusOpen(true)}><span style="font-size:14px">✨</span> Set a status — what are you on right now?</button>`; })()}
      ${Array.isArray(pv?.links) && pv.links.length>0 && html`<${LinkChips} links=${pv.links}/>`}
    </div>

    ${d0 && d0.place && html`<div class="card" style="margin-top:16px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px;flex:none">${d0.emoji}</span>
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:600">Checked in · ${d0.place}</div>
        <div class="rowsub">${systemPhrase(d0.system,'me')} — friends can see this</div>
      </div>
      <button class="btn" style="flex:none;padding:8px 12px" onClick=${()=>setPres({ zone:null })}>Leave</button>
    </div>`}

    ${editing && html`<div class="card" style="margin-top:16px">
      <div class="set-eyebrow" style="margin-bottom:2px">Photos</div>
      <div class="flabel">Profile photo · paste a link</div>
      <div style="display:flex;gap:8px">
        <input class="input" value=${p.avatarUrl} onInput=${e=>setP(v=>({...v,avatarUrl:e.target.value}))} placeholder="https://…" autocapitalize="none"/>
        <button class="btn" style="flex:none;padding:11px 13px" disabled=${!p.avatarUrl.trim()} onClick=${()=>setAdjust('avatar')}>Frame</button>
      </div>
      <div class="flabel">Cover · link (GIFs work)</div>
      <div style="display:flex;gap:8px">
        <input class="input" value=${p.coverUrl} onInput=${e=>setP(v=>({...v,coverUrl:e.target.value}))} placeholder="https://… still image or GIF" autocapitalize="none"/>
        <button class="btn" style="flex:none;padding:11px 13px" disabled=${!p.coverUrl.trim()} onClick=${()=>setAdjust('cover')}>Frame</button>
      </div>
      <div class="small" style="margin-top:8px">Any https image link works — Imgur, GIPHY, Tenor… Orbit keeps only the link, never the file, so it costs zero storage. If a picture won't load, that site blocks embedding — re-upload it to imgur.com and link that instead.</div>

      <div class="set-eyebrow" style="margin:18px 0 2px">Identity</div>
      <div class="profgrid">
        <div><div class="flabel">Name</div>
          <input class="input" value=${p.name} onInput=${e=>setP(v=>({...v,name:e.target.value}))}/></div>
        <div><div class="flabel">Handle</div>
          <input class="input" value=${p.handle} onInput=${e=>setP(v=>({...v,handle:cleanHandle(e.target.value)}))} autocapitalize="none"/></div>
        <div><div class="flabel">Course</div>
          <input class="input" value=${p.course} onInput=${e=>setP(v=>({...v,course:e.target.value}))} placeholder="BSIT · 1st Yr"/></div>
        <div><div class="flabel">School</div>
          <input class="input" value=${p.school} onInput=${e=>setP(v=>({...v,school:e.target.value}))} placeholder="Your school / university"/></div>
      </div>
      <${Toggle} label="Show my full name" accent="var(--ge)"
        hint=${p.showFull ? 'Friends see your name everywhere.' : 'Friends see only @'+(p.handle||'handle')+' — your name stays private.'}
        on=${p.showFull} onClick=${()=>setP(v=>({...v,showFull:!v.showFull}))}/>

      <div class="flabel">Pronouns · optional</div>
      <div class="pillrow">
        ${PRONOUN_PRESETS.map(pr=>html`<button key=${pr} class=${'pill'+(p.pronouns===pr?' on':'')} onClick=${()=>setP(v=>({...v,pronouns:v.pronouns===pr?'':pr}))}>${pr}</button>`)}
      </div>
      <input class="input" style="margin-top:8px" maxlength="40" value=${p.pronouns} onInput=${e=>setP(v=>({...v,pronouns:e.target.value}))} placeholder="or type your own — anything goes"/>

      <div class="flabel">About you · ${200-p.bio.length} left</div>
      <textarea class="input" rows="3" maxlength="200" value=${p.bio} onInput=${e=>setP(v=>({...v,bio:e.target.value}))} placeholder="A short bio — what you're about, what you're grinding on…"></textarea>

      <div class="flabel">Hobbies · ${p.hobbies.length}/10</div>
      <div class="pillrow">
        ${[...new Set([...HOBBY_PRESETS, ...p.hobbies])].map(h=>html`<button key=${h} class=${'pill'+(p.hobbies.includes(h)?' on':'')} onClick=${()=>togHobby(h)}>${h}</button>`)}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input class="input" maxlength="24" value=${hobbyIn} onInput=${e=>setHobbyIn(e.target.value)} onKeyDown=${e=>{if(e.key==='Enter')addHobby()}} placeholder="add your own — 🎣 Fishing"/>
        <button class="btn" style="flex:none;padding:11px 13px" disabled=${!hobbyIn.trim()||p.hobbies.length>=10} onClick=${addHobby}><${IcPlus} size=${14}/></button>
      </div>

      <div class="set-eyebrow" style="margin:18px 0 2px">Connections · ${p.links.length}/5</div>
      <div class="hint" style="margin:0 0 8px">Pick a platform, drop your handle — Orbit builds the link itself, so only real profiles on known apps can show up. Discord copies to clipboard instead of linking.</div>
      ${p.links.length>0 && html`<div class="linkrow" style="margin-bottom:10px">
        ${p.links.map(l=>{ const s = SOCIALS[l.k]; if (!s) return null;
          return html`<button key=${l.k} class="linkchip" title="Remove" onClick=${()=>setP(v=>({ ...v, links:v.links.filter(x=>x.k!==l.k) }))}>
            <span class="ltile" style=${`background:linear-gradient(135deg,${s.c[0]},${s.c[1]})`}><${s.Ic} size=${13}/></span>
            <span class="lmeta"><span class="lname" style=${`color:${s.tc||s.c[0]}`}>${s.name}</span><span class="lhandle">@${l.u} ✕</span></span>
          </button>`; })}
      </div>`}
      <div class="pillrow">
        ${Object.entries(SOCIALS).map(([k,s])=>html`<button key=${k} class=${'pill'+(linkPick===k?' on':'')} style="padding:6px 10px;display:inline-flex;align-items:center;gap:6px"
          onClick=${()=>setLinkPick(linkPick===k?null:k)}>
          <span class="ltile" style=${`width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,${s.c[0]},${s.c[1]})`}><${s.Ic} size=${11}/></span>${s.name}</button>`)}
      </div>
      ${linkPick && html`<div style="display:flex;gap:8px;margin-top:8px">
        <input class="input" maxlength="30" value=${linkIn} onInput=${e=>setLinkIn(e.target.value)} autocapitalize="none"
          placeholder=${'your '+(SOCIALS[linkPick]?.name||'')+' handle'} onKeyDown=${e=>{ if(e.key==='Enter') addLink(); }}/>
        <button class="btn" style="flex:none;padding:11px 13px" disabled=${!cleanSocial(linkIn)} onClick=${addLink}><${IcPlus} size=${14}/></button>
      </div>`}

      <div class="flabel">Bubble colors</div>
      <div class="pillrow">
        ${ACCENTS.map((a,i)=>html`<button key=${i} class="pill" style=${`padding:4px;${p.acc[0]===a[0]&&p.acc[1]===a[1]?'border-color:var(--major)':''}`}
          onClick=${()=>setP(v=>({...v,acc:a}))} aria-label="Color option">
          <span style=${`width:26px;height:26px;border-radius:50%;background:linear-gradient(140deg,${a[0]},${a[1]});display:block`}></span>
        </button>`)}
        <span class="pill" style="padding:4px 8px;display:inline-flex;gap:6px;align-items:center">
          <input class="cinput" type="color" value=${p.acc[0]} onInput=${e=>setP(v=>({...v,acc:[e.target.value,v.acc[1]]}))} aria-label="Custom color A"/>
          <input class="cinput" type="color" value=${p.acc[1]} onInput=${e=>setP(v=>({...v,acc:[v.acc[0],e.target.value]}))} aria-label="Custom color B"/>
        </span>
      </div>

      <button class="btn btn-grad btn-block" style="margin-top:16px" disabled=${saving} onClick=${save}>${saving?'Saving…':'Save profile'}</button>
    </div>`}

    <div style="margin-top:20px"><${Eyebrow}>Your week<//></div>
    <div style="margin-top:12px">
      <${Grid} ownerId=${uid} classesByOwner=${classesBy} events=${events} onPick=${onPick}/>
    </div>
    <div class="small" style="margin-top:10px">Solid blocks are classes · dashed blocks are plans</div>

    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:22px;gap:8px;flex-wrap:wrap">
      <${Eyebrow} color="var(--ge)">Classes · ${mine.length}<//>
      <div style="display:flex;gap:8px">
        <button class="btn" style="border-radius:999px;padding:8px 13px" onClick=${onImport}>
          <${IcUpload} size=${14}/> Import file</button>
        <button class="btn" style="border-radius:999px;padding:8px 13px" onClick=${()=>setAdding(!adding)}>
          ${adding ? 'Close' : html`<${Fragment}><${IcPlus} size=${14}/> Add class<//>`}</button>
      </div>
    </div>

    ${adding && html`<div class="card" style="margin-top:12px">
      <div class="addgrid">
        <div class="f-wide"><div class="flabel">Class name</div>
          <input class="input" value=${nc.name} onInput=${e=>setNc(v=>({...v,name:e.target.value}))} placeholder="Fundamentals of Programming"/></div>
        <div class="f-wide"><div class="flabel">Room / note · optional</div>
          <input class="input" value=${nc.meta} onInput=${e=>setNc(v=>({...v,meta:e.target.value}))} placeholder="Lab · Rm 201"/></div>
        <div><div class="flabel">Type</div>
          <select class="input" value=${nc.cat} onChange=${e=>setNc(v=>({...v,cat:e.target.value}))}>
            ${Object.entries(CATNAME).map(([k,n])=>html`<option key=${k} value=${k}>${n}</option>`)}
          </select></div>
        <div><div class="flabel">Day</div>
          <select class="input" value=${nc.day} onChange=${e=>setNc(v=>({...v,day:+e.target.value}))}>
            ${DAYS.map((d,i)=>html`<option key=${d} value=${i}>${d}</option>`)}
          </select></div>
        <div><div class="flabel">Starts</div>
          <select class="input" value=${nc.start} onChange=${e=>setNc(v=>({...v,start:+e.target.value}))}>
            ${times.slice(0,-1).map(m=>html`<option key=${m} value=${m}>${fmt(m)}</option>`)}
          </select></div>
        <div><div class="flabel">Ends</div>
          <select class="input" value=${nc.end} onChange=${e=>setNc(v=>({...v,end:+e.target.value}))}>
            ${times.slice(1).map(m=>html`<option key=${m} value=${m}>${fmt(m)}</option>`)}
          </select></div>
      </div>
      <button class="btn btn-grad btn-block" style="margin-top:14px" onClick=${submitClass} disabled=${!nc.name.trim()}>Add to schedule</button>
      <div class="small" style="margin-top:10px">Repeats weekly. If a class meets twice a week, add it once per day — or just import a schedule file.</div>
    </div>`}

    <div class="classlist" style="margin-top:12px">
      ${!mine.length && html`<div class="small">No classes yet — add them by hand or import a schedule file so friends can see when you're free.</div>`}
      ${[...mine].sort((a,b)=>a.day-b.day||a.start_min-b.start_min).map(c=>html`
        <div key=${c.id} class="cardrow" style="cursor:default">
          <span style=${`width:9px;height:9px;border-radius:3px;background:${CATHEX[c.cat]};box-shadow:0 0 0 3px ${CATHEX[c.cat]}33;flex:none`}></span>
          <div style="min-width:0;flex:1">
            <div class="rowname" style="font-size:12.5px">${c.name}</div>
            <div class="rowsub">${DAYS[c.day]} · ${fmt(c.start_min)}–${fmt(c.end_min)}${c.meta?` · ${c.meta}`:''}</div>
          </div>
          <button class="btn" style="padding:8px 11px;flex:none" onClick=${()=>delClass(c.id)} aria-label="Delete class"><${IcTrash} size=${14}/></button>
        </div>`)}
    </div>

    <button class="btn btn-block" style="margin-top:26px;color:var(--muted)" onClick=${()=>sb.auth.signOut()}>
      <${IcOut} size=${15}/> Sign out</button>
    <div class="small" style="text-align:center;margin-top:14px;opacity:.7">Orbit · built by Uno</div>

    <${Sheet} open=${statusOpen} onClose=${()=>setStatusOpen(false)} accent="var(--major)">
      ${statusOpen && html`<${SetStatusSheet} current=${actOf(myPres)} onClose=${()=>setStatusOpen(false)}
        onSet=${a=>{ setPres({ activity:a }); setStatusOpen(false); }} />`}
    <//>
    <${Sheet} open=${!!adjust} onClose=${()=>setAdjust(null)} accent="var(--ge)">
      ${adjust && html`<${ImageAdjust}
        url=${adjust==='avatar' ? p.avatarUrl.trim() : p.coverUrl.trim()}
        round=${adjust==='avatar'} aspect=${adjust==='avatar' ? '1 / 1' : '5 / 2'}
        pos=${adjust==='avatar' ? p.avatarPos : p.coverPos}
        onChange=${np=>setP(v=> adjust==='avatar' ? { ...v, avatarPos:np } : { ...v, coverPos:np })}
        onDone=${()=>setAdjust(null)} />`}
    <//>
  </div>`;
}

/* ============================================================
   CHAT — DMs + system group chats
   Link-only media (no file storage), 90-day retention, founder
   moderation view, per-chat looks (theme / font / background).
   ============================================================ */

export function Bubble({ m, mine, cont, group, p, bad, onBad, selOn, onSel, onUnsend, onReport, canModRemove, onImg, onImgLoad, onOpenSender }) {
  const cls = 'bub ' + (mine?'me':'them') + (cont?' cont':'');
  return html`<div class=${'msgrow'+(mine?' me':'')+(cont?'':' gap')}>
    ${!mine && group && html`<div class="msgav">${!cont && html`<button style="background:none;border:none;padding:0;cursor:pointer" onClick=${onOpenSender}><${Avatar} p=${p||{}} size=${24}/></button>`}</div>`}
    <div style=${`min-width:0;display:flex;flex-direction:column;align-items:${mine?'flex-end':'flex-start'};max-width:min(340px,78%)`}>
      ${!mine && group && !cont && html`<div class="msgname">${p?fname(p):'…'}</div>`}
      ${m.deleted
        ? html`<div class=${cls+' gone'}>message unsent</div>`
        : m.kind==='text'
        ? html`<div class=${cls} onClick=${onSel}><${RichText} text=${m.body}/></div>`
        : html`<div class=${cls+' pic'} onClick=${onSel}>
            ${bad
              ? html`<div class="imgfail">🖼️ link didn't load</div>`
              : html`<img class="bubimg" src=${m.body} loading="lazy" referrerpolicy="no-referrer" alt="shared media"
                  onError=${onBad} onLoad=${()=>onImgLoad&&onImgLoad()} onClick=${e=>{ e.stopPropagation(); onImg(m.body); }}/>`}
          </div>`}
      ${selOn && html`<div class="msgacts">
        <span>${clockOf(m.created_at)}</span>
        ${!m.deleted && m.kind==='text' && html`<button onClick=${()=>{ try{ navigator.clipboard.writeText(m.body); }catch{} onSel(); }}>Copy</button>`}
        ${!m.deleted && (mine || canModRemove) && html`<button style="color:#ff9db8" onClick=${onUnsend}>${mine?'Unsend':'Remove'}</button>`}
        ${!mine && !m.deleted && html`<button onClick=${onReport}>Report</button>`}
      </div>`}
    </div>
  </div>`;
}

export function RichText({ text }) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
  return html`${parts.map((p,i)=> i%2
    ? html`<a key=${i} href=${p} target="_blank" rel="noopener noreferrer">${p}</a>`
    : p)}`;
}

export function CoverImg({ p }) {
  const cp = (p?.cover_pos && typeof p.cover_pos==='object') ? p.cover_pos : {};
  return html`<div class="profcover" style=${`--pa:${p?.accent1||'#b06bff'};--pb:${p?.accent2||'#2dd4bf'}`}>
    ${!p?.cover_url && html`<div class="mapstars"></div>`}
    ${p?.cover_url && html`<img class="cimg" src=${p.cover_url} alt="" referrerpolicy="no-referrer"
      style=${`--cx:${cp.x||0}%;--cy:${cp.y||0}%;--cz:${cp.z||1}`} onError=${e=>{e.target.style.display='none'}}/>`}
  </div>`;
}

// drag to pan, slide to zoom — WYSIWYG with how Avatar/CoverImg render

export function ImageAdjust({ url, round=false, aspect='1 / 1', pos, onChange, onDone }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const lim = z => (Math.max(1,z)-1)*50 + 14;
  const clampP = (v,z) => Math.max(-lim(z), Math.min(lim(z), v));
  const down = e => { const el=ref.current; if(!el) return; e.preventDefault();
    try{ el.setPointerCapture(e.pointerId); }catch{}
    const r = el.getBoundingClientRect();
    drag.current = { x:e.clientX, y:e.clientY, px:pos.x||0, py:pos.y||0, w:r.width||1, h:r.height||1 }; };
  const move = e => { const d=drag.current; if(!d) return; const z=pos.z||1;
    onChange({ z, x:clampP(d.px + (e.clientX-d.x)/d.w*100, z), y:clampP(d.py + (e.clientY-d.y)/d.h*100, z) }); };
  const up = () => { drag.current=null; };
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Frame your ${round?'photo':'cover'}</div>
      <button class="xbtn" onClick=${onDone}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px;margin-bottom:12px">Drag to move · slide to zoom. ${round?'The circle is exactly what friends see.':'The whole frame is exactly what friends see.'}</div>
    <div class="adjframe" ref=${ref} style=${`aspect-ratio:${aspect};${round?'max-width:320px;margin:0 auto':''}`}
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
      <img src=${url} alt="" referrerpolicy="no-referrer" draggable=${false}
        style=${`--cx:${pos.x||0}%;--cy:${pos.y||0}%;--cz:${pos.z||1}`}/>
      <div class=${'adjmask'+(round?' round':'')}></div>
    </div>
    <div class="flabel">Zoom</div>
    <input class="slider" type="range" min="100" max="300" value=${Math.round((pos.z||1)*100)}
      onInput=${e=>{ const z=+e.target.value/100; onChange({ z, x:clampP(pos.x||0,z), y:clampP(pos.y||0,z) }); }}/>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn" style="flex:1" onClick=${()=>onChange({ x:0, y:0, z:1 })}>Reset</button>
      <button class="btn btn-grad" style="flex:1" onClick=${onDone}>Done</button>
    </div>
    <div class="small" style="margin-top:10px">Framing is saved as three numbers on your profile — the image itself is never copied or edited.</div>
  </div>`;
}

export function Toggle({ on, onClick, label, hint, accent }) {
  return html`<div class="set-row">
    <div class="set-row-l">
      <div class="set-label">${label}</div>
      ${hint && html`<div class="set-hint">${hint}</div>`}
    </div>
    <button class=${'tgl'+(on?' on':'')} aria-label=${label} aria-pressed=${on}
      style=${on&&accent?`background:${accent}`:''} onClick=${onClick}><span></span></button>
  </div>`;
}

export const seedForm = me => ({
  name: me?.display_name||'', handle: me?.handle||'', course: me?.course||'', school: me?.school||'',
  acc: [me?.accent1||'#b06bff', me?.accent2||'#2dd4bf'],
  bio: me?.bio||'', pronouns: me?.pronouns||'',
  hobbies: Array.isArray(me?.hobbies) ? me.hobbies.slice(0,10) : [],
  links: Array.isArray(me?.links) ? me.links.slice(0,5) : [],
  showFull: me?.show_full_name!==false,
  avatarUrl: me?.avatar_url||'', avatarPos: (me?.avatar_pos&&typeof me.avatar_pos==='object')?me.avatar_pos:{x:0,y:0,z:1},
  coverUrl: me?.cover_url||'', coverPos: (me?.cover_pos&&typeof me.cover_pos==='object')?me.cover_pos:{x:0,y:0,z:1},
});
