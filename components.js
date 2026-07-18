/* Orbit — auto-split module. Part of the Orbit single-page app.
   See ARCHITECTURE.md for how the pieces fit together. */
import { Fragment, h, html, useEffect, useMemo, useRef, useState } from './lib.js';
import { ACTIVITY_CATALOG, ACT_KINDS, BADGE_DEFS, CAT, CATHEX, DAYS, HOUR, I, IcEye, IcEyeOff, IcPin, IcX, KINDS, SOCIALS, badgesOf, cleanHandle, cleanSocial, flairOf, fmt, hashStr, initialsOf, nowInfo, pxFor, sb, shownName } from './core.js';

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
