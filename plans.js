/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { Fragment, h, html, useEffect, useMemo, useRef, useState } from './lib.js';
import { CATHEX, CATNAME, DAYS, EVENT_EMOJIS, Glyph, GlyphTile, Sym, glyphLabel, toGlyph, IcCheck, IcClock, IcPlus, IcSend, IcUpload, IcWarn, IcX, KINDS, PING_PRESETS, ZONES, DAYS7, ago, dayIdx, durLabel, evSort, evSpan, evUpcoming, fmt, fname, nowInfo, relDay, ui, whenLabel, zoneName } from './core.js';
import { Avatar, You, conflictsFor } from './components.js';

// plan tiles take their colour from the plan type
const KIND_HUE = { coffee:35, study:175, lunch:150, hangout:285, sleepover:235 };
const kindHue = k => KIND_HUE[k] ?? 265;

export function Plans({ uid, events, myInvites, classesBy, nameOf, profiles, me, onRespond, onNew, onOpen }) {
  const nd = nowInfo();
  const going = e => e.host===uid || (e.event_invitees||[]).some(i=>i.invitee===uid && i.status==='accepted');
  const confirmed = events.filter(e=>going(e) && evUpcoming(e)).sort(evSort);
  const waiting = events.filter(e=>e.host===uid && evUpcoming(e) && (e.event_invitees||[]).some(i=>i.status==='pending')).sort(evSort);

  return html`<div>
    <div style="display:flex;align-items:center;justify-content:flex-end">
      <button class="btn btn-grad" style="border-radius:999px;padding:8px 14px" onClick=${onNew}><${IcPlus} size=${15}/> New plan</button>
    </div>

    ${myInvites.length>0 && html`<div style="margin-top:18px">
      <div class="flabel" style="color:var(--now);margin-top:0">Invites · ${myInvites.length}</div>
      <div class="stack">
        ${myInvites.map(e=>{
          const K = KINDS[e.kind]||KINDS.hangout;
          const conf = conflictsFor(uid, evSpan(e), classesBy, events.filter(x=>x.id!==e.id));
          return html`<div key=${e.id} class="card" style="padding:14px">
            <div style="display:flex;align-items:center;gap:11px">
              <${GlyphTile} k=${e.emoji||K.emoji} hue=${kindHue(e.kind)} size=${36}/>
              <div style="min-width:0;flex:1">
                <div class="rowname" style="font-size:13.5px">${e.title}</div>
                <div class="rowsub">from ${nameOf(e.host)} · ${whenLabel(e)} · ${zoneName(e.place)||e.place||'—'}</div>
              </div>
            </div>
            ${conf.length>0 && html`<div class="warnbox" style="margin-top:10px;display:flex;gap:8px;align-items:flex-start">
              <span style="color:var(--now);display:flex;flex:none;margin-top:1px"><${IcWarn} size=${14}/></span>
              <div style="font-size:11.5px;color:#ffc6d8">Heads up — you have <b>${conf.join(', ')}</b> then.</div>
            </div>`}
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn btn-soft-green" style="flex:1" onClick=${()=>onRespond(e.id,'accepted')}><${IcCheck} size=${15}/> Accept</button>
              <button class="btn" style="flex:1" onClick=${()=>onRespond(e.id,'declined')}>Decline</button>
            </div>
          </div>`;})}
      </div>
    </div>`}

    ${waiting.length>0 && html`<div style="margin-top:20px">
      <div class="flabel" style="margin-top:0">Waiting on replies</div>
      <div class="stack">
        ${waiting.map(e=>{
          const pend = (e.event_invitees||[]).filter(i=>i.status==='pending').map(i=>nameOf(i.invitee)).join(', ');
          return html`<button key=${e.id} class="cardrow" style="border-style:dashed;opacity:.9" onClick=${()=>onOpen(e)}>
            <${GlyphTile} k=${e.emoji||KINDS[e.kind]?.emoji} hue=${kindHue(e.kind)} size=${30}/>
            <div style="min-width:0;flex:1">
              <div class="rowname" style="font-size:12.5px">${e.title}</div>
              <div class="rowsub">${whenLabel(e)} · waiting on ${pend}</div>
            </div>
            <span style="color:var(--faint);display:flex;flex:none"><${IcClock} size=${14}/></span>
          </button>`;})}
      </div>
    </div>`}

    <div style="margin-top:20px">
      <div class="flabel" style="color:var(--ge);margin-top:0">Confirmed</div>
      <div class="stack">
        ${!confirmed.length && html`<div class="small">Nothing booked yet. Tap New plan to set something up.</div>`}
        ${confirmed.map(e=>{
          const K = KINDS[e.kind]||KINDS.hangout;
          const ppl = [e.host, ...(e.event_invitees||[]).filter(i=>i.status==='accepted').map(i=>i.invitee)];
          return html`<button key=${e.id} class="cardrow" style="background:linear-gradient(135deg,rgba(176,107,255,.10),rgba(45,212,191,.07));border-color:var(--line-strong);align-items:flex-start;flex-direction:column;gap:10px" onClick=${()=>onOpen(e)}>
            <div style="display:flex;align-items:center;gap:11px;width:100%">
              <${GlyphTile} k=${e.emoji||K.emoji} hue=${kindHue(e.kind)} size=${36}/>
              <div style="min-width:0;flex:1">
                <div class="rowname" style="font-size:13.5px">${e.title}</div>
                <div class="rowsub">${whenLabel(e)} · ${zoneName(e.place)||e.place||'—'}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center">
              ${ppl.slice(0,5).map((id,i)=>html`<div key=${id} style=${`margin-left:${i?-8:0}px`}><${Avatar} p=${id===uid?me:profiles[id]} size=${24}/></div>`)}
              <span class="small" style="margin-left:10px">${ppl.length} going</span>
            </div>
          </button>`;})}
      </div>
    </div>
  </div>`;
}

/* ============================================================
   PLAN CREATOR
   ============================================================ */

/* ============================================================
   WHEN PICKER — date chips, two scroll wheels, lengths, a 48h strip.
   A plan can start any minute of the day and run up to two days: the end
   wheel picks a clock time and the end-day chips say which day it lands on,
   so "Fri 9PM → Sat 7AM" is two flicks, not arithmetic.
   ============================================================ */
const WHEEL_H = 34;
function Wheel({ items, index, onPick, label }) {
  const ref = useRef(null), t = useRef(0), quiet = useRef(false);
  // keep the wheel on the value when it changes from outside (chips, the strip)
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (Math.round(el.scrollTop / WHEEL_H) !== index) {
      quiet.current = true; el.scrollTop = index * WHEEL_H;
      setTimeout(() => { quiet.current = false; }, 60);
    }
  }, [index]);
  const onScroll = () => {
    if (quiet.current) return;
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const el = ref.current; if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / WHEEL_H)));
      if (i !== index) onPick(i);
    }, 110);
  };
  return html`<div class="wheel" ref=${ref} onScroll=${onScroll} role="listbox" aria-label=${label}>
    <div class="wheel-pad"></div>
    ${items.map((it, i) => html`<button key=${i} type="button" class=${'wheel-i' + (i === index ? ' on' : '')} role="option" aria-selected=${i === index}
      onClick=${() => onPick(i)}>${it}</button>`)}
    <div class="wheel-pad"></div>
  </div>`;
}
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
function TimeWheel({ value, onChange, label }) {
  const h24 = Math.floor(value / 60), m = value % 60, pm = h24 >= 12, h12 = h24 % 12 || 12;
  const set = (h, mm, p) => onChange(((h % 12) + (p ? 12 : 0)) * 60 + mm);
  return html`<div class="twheel" aria-label=${label}>
    <div class="twheel-hl" aria-hidden="true"></div>
    <${Wheel} label="hour" items=${HOURS} index=${h12 - 1} onPick=${i => set(i + 1, m, pm)}/>
    <span class="twheel-c">:</span>
    <${Wheel} label="minute" items=${MINS} index=${Math.round(m / 5) % 12} onPick=${i => set(h12, i * 5, pm)}/>
    <${Wheel} label="am or pm" items=${['AM', 'PM']} index=${pm ? 1 : 0} onPick=${i => set(h12, m, i === 1)}/>
  </div>`;
}
const LENGTHS = [[30, '30m'], [60, '1h'], [90, '1.5h'], [120, '2h'], [180, '3h'], [240, '4h']];
export function WhenPicker({ date, setDate, start, setStart, dur, setDur, span }) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + i); return d; }), []);
  const endAbs = start + dur, endOff = Math.floor((endAbs - 1) / 1440), endClock = endAbs % 1440;
  const setEnd = (clock, off = endOff) => {
    let d = off * 1440 + clock - start;
    if (d <= 0) d += 1440;                          // an end before the start means the next day
    setDur(Math.max(15, Math.min(2880, d)));
  };
  const overnight = () => { const s = start >= 17 * 60 ? start : 21 * 60; setStart(s); setDur(24 * 60 - s + 7 * 60); };
  const crosses = endAbs > 1440;
  const pct = m => `${(Math.min(2880, m) / 2880) * 100}%`;
  const onStrip = e => {
    const r = e.currentTarget.getBoundingClientRect();
    const m = Math.round(((e.clientX - r.left) / r.width) * 2880 / 15) * 15;
    if (m < 1440) setStart(m);
  };
  const same = (a, b) => a.toDateString() === b.toDateString();
  return html`<div class="when">
    <div class="pillrow scroll when-days">
      ${days.map(d => html`<button key=${d.getTime()} type="button" class=${'pill when-day' + (same(d, date) ? ' on' : '')} onClick=${() => setDate(d)}>
        <b>${relDay(d).split(' ')[0]}</b><span>${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}</span></button>`)}
    </div>

    <div class="when-wheels">
      <div class="when-col">
        <div class="when-cap">Starts</div>
        <${TimeWheel} label="start time" value=${start} onChange=${v => setStart(v)}/>
      </div>
      <div class="when-col">
        <div class="when-cap">Ends</div>
        <${TimeWheel} label="end time" value=${endClock} onChange=${v => setEnd(v)}/>
        <div class="when-endday">
          ${['Same day', 'Next day', '+2 days'].map((l, off) => html`<button key=${off} type="button"
            class=${'pill' + (endOff === off ? ' on' : '')} disabled=${off === 0 && endClock <= start && endAbs % 1440 !== 0}
            onClick=${() => setEnd(endClock, off)}>${l}</button>`)}
        </div>
      </div>
    </div>

    <div class="pillrow" style="margin-top:10px">
      ${LENGTHS.map(([m, l]) => html`<button key=${m} type="button" class=${'pill' + (dur === m ? ' on' : '')} onClick=${() => setDur(m)}>${l}</button>`)}
      <button type="button" class=${'pill' + (crosses && start >= 17 * 60 && endClock <= 12 * 60 ? ' on' : '')} onClick=${overnight}>Overnight</button>
      <button type="button" class=${'pill' + (dur === 1440 ? ' on' : '')} onClick=${() => setDur(1440)}>24h</button>
    </div>

    <div class="when-strip" onClick=${onStrip} title="Tap to move the start">
      <div class="when-band" style=${`left:${pct(start)};width:calc(${pct(endAbs)} - ${pct(start)})`}></div>
      <div class="when-mid" aria-hidden="true"></div>
      ${[0, 6, 12, 18, 24, 30, 36, 42].map(h => html`<span key=${h} class="when-tick" style=${`left:${(h / 48) * 100}%`}>${h % 24 === 0 ? '12a' : h % 24 === 12 ? '12p' : (h % 12) + (h % 24 < 12 ? 'a' : 'p')}</span>`)}
    </div>
    <div class="when-sum">
      <b>${whenLabel({ starts_at: span.s.toISOString(), ends_at: span.e.toISOString() })}</b>
      <span>${durLabel(dur)}${crosses ? ' · runs past midnight' : ''}</span>
    </div>
  </div>`;
}

export function Creator({ uid, pre, sys, slot, friends, profiles, nameOf, classesBy, events, onClose, onCreate }) {
  // any start in the day, any length up to two days — sleepovers and all-nighters
  // included; "study now" from Home arrives as a slot on today
  const snap5 = m => Math.min(1435, Math.max(0, Math.round(m/5)*5));
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setHours(0,0,0,0);
    if (slot && Number.isFinite(slot.day)) d.setDate(d.getDate() + ((slot.day - dayIdx(d) + 7) % 7));
    return d;
  });
  const [start, setStart] = useState(() => {
    if (slot) return snap5(slot.start);
    const n = new Date(); return Math.min(1435, Math.ceil((n.getHours()*60 + n.getMinutes() + 1) / 30) * 30) % 1440 || 15*60;
  });
  const [kind, setKind] = useState(sys ? 'study' : (slot ? 'study' : 'coffee'));
  const [emoji, setEmoji] = useState('');
  const [title, setTitle] = useState('');
  const [dur, setDur] = useState(slot ? slot.dur : 90);
  const [place, setPlace] = useState(sys ? '' : 'library');
  const [inv, setInv] = useState(()=> sys
    ? (sys.members||[]).filter(m=>m.status==='accepted' && m.user_id!==uid).map(m=>m.user_id)
    : (pre ? [pre] : []));
  const [busy, setBusy] = useState(false);
  const span = useMemo(() => { const a = new Date(date); a.setMinutes(start); return { s:a, e:new Date(a.getTime() + dur*6e4) }; }, [date, start, dur]);
  const day = dayIdx(date);
  const over = span.e.getTime() <= Date.now();           // already finished — nothing to invite anyone to
  const toggle = id => setInv(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);
  const nmOf = id => { const f=(profiles&&profiles[id])||friends.find(x=>x.id===id);
    const n = f ? fname(f) : ''; return n || (nameOf ? nameOf(id) : 'Someone'); };
  const pool = sys
    ? (sys.members||[]).filter(m=>m.status==='accepted' && m.user_id!==uid)
        .map(m=> (profiles&&profiles[m.user_id]) || { id:m.user_id, display_name:'' })
    : friends;

  const finalTitle = title.trim() || `${KINDS[kind].label}${inv.length?` with ${inv.map(nmOf).join(' & ')}`:''}`;
  const warnings = useMemo(()=>{
    const w = [];
    const mine = conflictsFor(uid, span, classesBy, events);
    if (mine.length) w.push({ who:'You', items:mine });
    inv.forEach(id=>{ const c = conflictsFor(id, span, classesBy, events); if (c.length) w.push({ who:nmOf(id), items:c }); });
    return w;
  }, [span, inv, classesBy, events]);

  return html`<div>
    <div class="sheethead"><div class="sheettitle">${sys ? 'New cosmic event' : 'New plan'}</div>
      <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    ${sys && html`<div class="hint" style="margin-top:-8px;margin-bottom:8px">For the ${sys.name} system — members get the invite, and accepting drops it straight onto their schedule.</div>`}

    <div style="display:flex;gap:8px">
      ${Object.entries(KINDS).map(([k,K])=>html`<button key=${k}
        class="btn" style=${`flex:1;flex-direction:column;gap:5px;padding:11px 6px;${kind===k?`background:${K.accent}20;border-color:${K.accent}`:''}`}
        onClick=${()=>setKind(k)}>
        <${GlyphTile} k=${K.emoji} hue=${kindHue(k)} size=${30}/>
        <span style=${`font-size:10.5px;${kind===k?'color:var(--ink)':'color:var(--muted)'}`}>${K.label}</span>
      </button>`)}
    </div>

    <div class="flabel">Event emoji</div>
    <div class="pillrow scroll">
      <button class=${'pill'+(!emoji?' on':'')} style="font-weight:600" onClick=${()=>setEmoji('')}><${Glyph} k=${KINDS[kind].emoji} size=${15}/> Auto</button>
      ${EVENT_EMOJIS.map(em=>html`<button key=${em} class=${'pill'+(emoji===em?' on':'')} style="padding:7px 10px" aria-label=${glyphLabel(em)} title=${glyphLabel(em)} onClick=${()=>setEmoji(emoji===em?'':em)}><${Glyph} k=${em} size=${16}/></button>`)}
    </div>

    <div class="flabel">Title · optional</div>
    <input class="input" value=${title} onInput=${e=>setTitle(e.target.value)} placeholder=${finalTitle}/>

    <div class="flabel">When</div>
    <${WhenPicker} date=${date} setDate=${setDate} start=${start} setStart=${setStart} dur=${dur} setDur=${setDur} span=${span}/>
    ${over && html`<div class="errbox" style="margin-top:10px">That time has already passed — pick a later start.</div>`}

    ${(!sys || (sys.planets||[]).length>0) && html`<${Fragment}>
      <div class="flabel">Where${sys?' · optional':''}</div>
      <div class="pillrow">
        ${sys
          ? (sys.planets||[]).map(p=>{ const v=p.name;
              return html`<button key=${p.id} class=${'pill'+(place===v?' on-teal':'')} onClick=${()=>setPlace(place===v?'':v)}><${Sym} v=${p.icon} size=${13}/> ${v}</button>`; })
          : ZONES.map(z=>html`<button key=${z.id} class=${'pill'+(place===z.id?' on-teal':'')} onClick=${()=>setPlace(z.id)}><${Glyph} k=${z.icon} size=${13}/> ${z.name}</button>`)}
      </div>
    <//>`}

    <div class="flabel">${sys ? `Members going · ${inv.length}` : 'Invite'}</div>
    ${!pool.length && html`<div class="small">${sys ? 'No other members yet — invite friends from the members sheet.' : 'Add some friends first — plans need people.'}</div>`}
    <div class="pillrow">
      ${pool.map(f=>{
        const on = inv.includes(f.id);
        return html`<button key=${f.id} class=${'pill'+(on?' on':'')} style="padding:5px 11px 5px 5px" onClick=${()=>toggle(f.id)}>
          <${Avatar} p=${f} size=${24}/> ${fname(f)||nmOf(f.id)} ${on && html`<${IcCheck} size=${13}/>`}
        </button>`;})}
    </div>

    ${warnings.length>0 && html`<div class="warnbox" style="margin-top:14px">
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:7px">
        <span style="color:var(--now);display:flex"><${IcWarn} size=${15}/></span>
        <span style="font-size:12.5px;font-weight:600;color:#ffc6d8">Schedule clash</span>
      </div>
      ${warnings.map(w=>html`<div key=${w.who} style="font-size:11.5px;color:#ffd4e0;line-height:1.5"><b>${w.who}</b> has ${w.items.join(', ')} then.</div>`)}
      <div class="small" style="margin-top:7px;color:var(--muted)">You can still send it — just a heads up.</div>
    </div>`}

    <button class=${'btn btn-block '+((inv.length||sys)?'btn-grad':'')} style="margin-top:16px;padding:13px"
      disabled=${busy || over || (!sys && !inv.length)}
      onClick=${async()=>{ setBusy(true); await onCreate({ kind, emoji:emoji||null, title:finalTitle, day, start_min:start, end_min:start+dur,
        starts_at:span.s.toISOString(), ends_at:span.e.toISOString(), place, invitees:inv, system_id: sys?sys.key:null }); setBusy(false); }}>
      <${IcSend} size=${16}/> ${busy?'Sending…':(sys?'Create cosmic event':`Send invite${inv.length>1?'s':''}`)}
    </button>
  </div>`;
}

/* ============================================================
   PING SHEET / INBOX / DETAIL
   ============================================================ */

export function PingSheet({ f, onSend }) {
  return html`<div>
    <div style="display:flex;align-items:center;gap:11px;margin-bottom:16px">
      <${Avatar} p=${f} size=${40}/>
      <div>
        <div class="sheettitle" style="font-size:16px">Ping ${fname(f)||'—'}</div>
        <div class="rowsub">Send a quick signal — lands on their phone instantly.</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      ${PING_PRESETS.map(p=>html`<button key=${p.t} class="btn" style="padding:14px 10px;justify-content:flex-start" onClick=${()=>onSend(p.t,p.e)}>
        <${GlyphTile} k=${p.e} size=${28}/> ${p.t}</button>`)}
    </div>
  </div>`;
}

export function Inbox({ uid, pings, notifs=[], events=[], sysInvites=[], profiles, nameOf, onClose, markSeen, onRespond, onSysInvite, onClear }) {
  const rows = [
    ...notifs.map(n=>({ t:'n', id:'n'+n.id, at:n.created_at, n })),
    ...pings.filter(p=>p.recipient===uid).map(p=>({ t:'p', id:'p'+p.id, at:p.created_at, p })),
  ].sort((a,b)=> new Date(b.at)-new Date(a.at)).slice(0,80);
  const NICON = { system_invite:'planet', cosmic_invite:'comet', event_invite:'mail', event_going:'party', system_joined:'wave', moderation:'shield' };
  const anyUnread = notifs.some(n=>!n.read) || pings.some(p=>p.recipient===uid && !p.seen);
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Signals</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${rows.length>0 && html`<button class="btn" style="padding:7px 11px;font-size:11.5px" onClick=${onClear}>Clear all</button>`}
        <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button>
      </div></div>
    ${!rows.length && html`<div class="small" style="text-align:center;padding:18px 0">No signals yet. Pokes, invites, and cosmic events land here — and sweep themselves out after 7 days.</div>`}
    <div class="stack">
      ${rows.map(r=>{
        if (r.t==='p') { const p=r.p; return html`<div key=${r.id} class="cardrow" style=${'cursor:default;'+(p.seen?'':'background:rgba(176,107,255,.08);border-color:rgba(176,107,255,.3)')}>
          <${Avatar} p=${profiles[p.sender]||{display_name:'??'}} size=${36}/>
          <div style="min-width:0;flex:1">
            <div style="font-size:13px"><b>${nameOf(p.sender)}</b> ${p.kind==='poke'?'waved at you':`pinged: ${p.text}`}</div>
            <div class="small" style="margin-top:2px">${ago(p.created_at)}</div>
          </div>
          ${p.emoji && html`<${GlyphTile} k=${p.emoji} size=${32}/>`}
        </div>`; }
        const n = r.n;
        const sysInv = n.kind==='system_invite' ? sysInvites.find(x=>x.sys.id===(n.data||{}).system_id) : null;
        const ev = (n.kind==='cosmic_invite'||n.kind==='event_invite') ? events.find(e=>e.id===(n.data||{}).event_id) : null;
        const pend = ev && (ev.event_invitees||[]).some(i=>i.invitee===uid && i.status==='pending');
        return html`<div key=${r.id} class="cardrow" style=${'cursor:default;align-items:flex-start;'+(n.read?'':'background:rgba(176,107,255,.08);border-color:rgba(176,107,255,.3)')}>
          <${GlyphTile} k=${NICON[n.kind]||'bell'} size=${32}/>
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:600">${n.title}</div>
            ${n.body && html`<div class="rowsub" style="margin-top:1px">${n.body}</div>`}
            <div class="small" style="margin-top:2px">${ago(n.created_at)}</div>
            ${sysInv && html`<div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn btn-soft-green" style="flex:1;padding:8px" onClick=${()=>onSysInvite(sysInv.sys,true)}><${IcCheck} size=${13}/> Join</button>
              <button class="btn" style="flex:1;padding:8px" onClick=${()=>onSysInvite(sysInv.sys,false)}>Decline</button>
            </div>`}
            ${pend && html`<div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn btn-soft-green" style="flex:1;padding:8px" onClick=${()=>onRespond(ev.id,'accepted')}><${IcCheck} size=${13}/> Accept</button>
              <button class="btn" style="flex:1;padding:8px" onClick=${()=>onRespond(ev.id,'declined')}>Decline</button>
            </div>`}
          </div>
        </div>`;})}
    </div>
    ${anyUnread && html`<button class="btn btn-block" style="margin-top:14px" onClick=${markSeen}>Mark all read</button>`}
  </div>`;
}

export function Detail({ d, uid, profiles, nameOf, onCancel }) {
  if (d.type==='event') {
    const e = d.row, K = KINDS[e.kind]||KINDS.hangout;
    const ppl = [e.host, ...(e.event_invitees||[]).filter(i=>i.status==='accepted').map(i=>i.invitee)];
    const pend = (e.event_invitees||[]).filter(i=>i.status==='pending').map(i=>nameOf(i.invitee));
    return html`<div>
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
        <${Sym} v=${e.emoji||K.emoji} size=${15}/>
        <span class="eyebrow" style=${`color:${K.accent};letter-spacing:.22em;font-size:10px`}>${K.label}</span>
      </div>
      <div class="sheettitle" style="font-size:20px">${e.title}</div>
      <div style="margin-top:14px">
        <div class="detrow"><span class="detlab">When</span><span class="detval">${whenLabel(e)} · ${durLabel(Math.round((evSpan(e).e - evSpan(e).s) / 6e4))}</span></div>
        <div class="detrow"><span class="detlab">Where</span><span class="detval">${zoneName(e.place)||e.place||'—'}</span></div>
        <div class="detrow"><span class="detlab">Going</span><span class="detval">${ppl.map(nameOf).join(', ')}</span></div>
        ${pend.length>0 && html`<div class="detrow"><span class="detlab">Waiting</span><span class="detval" style="color:var(--muted)">${pend.join(', ')}</span></div>`}
      </div>
      ${e.host===uid && html`<button class="btn btn-soft-red btn-block" style="margin-top:16px"
        onClick=${async()=>{ if(await ui.confirm({ title:'Cancel this plan?', body:'It disappears for everyone invited.', confirmLabel:'Cancel plan', danger:true })) onCancel(e.id); }}>Cancel plan</button>`}
    </div>`;
  }
  const c = d.row, col = CATHEX[c.cat]||CATHEX.major;
  return html`<div>
    <div style="display:flex;align-items:center;gap:7px;margin-bottom:10px">
      <span style=${`width:8px;height:8px;border-radius:2.5px;background:${col};box-shadow:0 0 0 3px ${col}33`}></span>
      <span class="eyebrow" style=${`color:${col};letter-spacing:.22em;font-size:10px`}>${CATNAME[c.cat]||'Class'}</span>
    </div>
    <div class="sheettitle" style="font-size:20px;line-height:1.15">${c.name}</div>
    <div style="margin-top:14px">
      <div class="detrow"><span class="detlab">When</span><span class="detval">${DAYS[c.day]} · ${fmt(c.start_min)}–${fmt(c.end_min)}</span></div>
      <div class="detrow"><span class="detlab">Room</span><span class="detval">${c.meta||'—'}</span></div>
    </div>
  </div>`;
}

/* ============================================================
   SCHEDULE FILE IMPORT
   Orbit schedule file — JSON, made by Claude from any
   registration form / COR / screenshot:
   {
     "orbit_schedule": 1,
     "student": { "name": "…", "course": "…", "school": "…" },
     "classes": [
       { "name": "Subject name", "day": "Mon",
         "start": "8:00 AM", "end": "9:30 AM",
         "room": "CL3", "type": "major" }
     ]
   }
   day: Mon–Sat (or 0–5) · type: major | ge | pe | nstp
   The parser is forgiving: times accept "13:30", "1:30 PM",
   bare hours, or minutes; "time": "8:00-9:30" also works;
   unknown types fall back to "major"; bad rows are skipped.
   ============================================================ */

export function ImportSheet({ onClose, onImport }) {
  const [parsed, setParsed] = useState(null);
  const [err, setErr] = useState('');
  const [replace, setReplace] = useState(true);
  const [applyProfile, setApplyProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  function handleText(t) {
    try { setParsed(parseScheduleFile(t)); setErr(''); }
    catch(e) { setParsed(null); setErr(e.message); }
  }
  async function pickFile(e) {
    const fl = e.target.files && e.target.files[0]; if (!fl) return;
    try { handleText(await fl.text()); } catch { setErr('Could not read that file.'); }
    e.target.value = '';
  }
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Import schedule</div>
      <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin:0 0 14px">Send your registration form to Claude and ask for an <b>Orbit schedule file</b>. Upload the .json it gives you and your whole week fills itself in.</div>
    <input ref=${fileRef} type="file" accept=".json,.txt,application/json,text/plain" style="display:none" onChange=${pickFile}/>
    <button class="btn btn-grad btn-block" onClick=${()=>fileRef.current && fileRef.current.click()}>
      <${IcUpload} size=${15}/> Choose schedule file</button>
    <div class="flabel">…or paste the file contents</div>
    <textarea class="input" style="min-height:96px;resize:vertical;font-size:12px" placeholder='{"classes":[ … ]}'
      onInput=${e=>{ const t=e.target.value.trim(); if (t) handleText(t); else { setParsed(null); setErr(''); } }}></textarea>
    ${err && html`<div class="errbox">${err}</div>`}
    ${parsed && html`<div class="card" style="margin-top:14px;padding:14px">
      <div style="font-size:13px;font-weight:600;color:var(--pe)">✓ ${parsed.rows.length} class${parsed.rows.length>1?'es':''} found</div>
      <div class="stack" style="margin-top:10px">
        ${parsed.rows.slice(0,4).map((r,i)=>html`<div key=${i} class="small" style="color:var(--muted)">
          ${DAYS[r.day]} ${fmt(r.start_min)}–${fmt(r.end_min)} · ${r.name}</div>`)}
        ${parsed.rows.length>4 && html`<div class="small">+ ${parsed.rows.length-4} more</div>`}
        ${parsed.skipped.length>0 && html`<div class="small" style="color:var(--nstp)">Skipped ${parsed.skipped.length} unreadable line${parsed.skipped.length>1?'s':''}</div>`}
      </div>
      ${parsed.profilePatch && html`<div class="small" style="margin-top:10px;color:var(--muted)">
        Profile in file: ${[parsed.profilePatch.display_name, parsed.profilePatch.course, parsed.profilePatch.school].filter(Boolean).join(' · ')}</div>`}
      <label style="display:flex;align-items:center;gap:9px;margin-top:12px;font-size:12.5px;cursor:pointer">
        <input type="checkbox" checked=${replace} onChange=${e=>setReplace(e.target.checked)} style="accent-color:#b06bff;width:16px;height:16px"/>
        Replace my current schedule</label>
      ${parsed.profilePatch && html`<label style="display:flex;align-items:center;gap:9px;margin-top:8px;font-size:12.5px;cursor:pointer">
        <input type="checkbox" checked=${applyProfile} onChange=${e=>setApplyProfile(e.target.checked)} style="accent-color:#b06bff;width:16px;height:16px"/>
        Also update my name / course / school</label>`}
      <button class="btn btn-grad btn-block" style="margin-top:14px" disabled=${busy}
        onClick=${async()=>{ setBusy(true); await onImport(parsed.rows, { replace, profilePatch: applyProfile ? parsed.profilePatch : null }); setBusy(false); }}>
        ${busy ? 'Importing…' : 'Import to my schedule'}</button>
    </div>`}
  </div>`;
}

/* ============================================================
   YOU — Discord × IG style profile + schedule manager
   Avatar + cover are plain https links (GIFs fine for covers).
   "Framing" = pan/zoom stored as a tiny transform on the row —
   the image is never uploaded or edited, so it costs Orbit
   zero storage. Badges are DB-granted only (see migration v4).
   ============================================================ */
// shared cover renderer — falls back to an accent-tinted starfield

export const DAY_IDX = { mon:0, monday:0, tue:1, tues:1, tuesday:1, wed:2, weds:2, wednesday:2,
  thu:3, thur:3, thurs:3, thursday:3, fri:4, friday:4, sat:5, saturday:5 };

export function parseTimeVal(v) {
  if (typeof v==='number' && isFinite(v)) { const n = Math.round(v<24 ? v*60 : v);
    if (n<0 || n>1440) throw new Error('bad time'); return n; }
  const m = String(v??'').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) throw new Error('bad time');
  let h=+m[1], mm=+(m[2]||0); const ap=(m[3]||'').toLowerCase();
  if (mm>59 || h>24 || (ap && (h<1 || h>12))) throw new Error('bad time');
  if (ap.startsWith('p') && h<12) h+=12;
  if (ap.startsWith('a') && h===12) h=0;
  if (!ap && h<6) h+=12;               // bare "1:30" on a class schedule means PM
  return h*60+mm;
}

export const catOf = s => { s=String(s||'').toLowerCase();
  if (/nstp|rotc|cwts|lts/.test(s)) return 'nstp';
  if (/^(pe\b|pe$|phys|sport|path?fit)/.test(s)) return 'pe';
  if (/^(ge|gen|minor|elect)/.test(s)) return 'ge';
  return 'major'; };

export function parseScheduleFile(text) {
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("That doesn't look like an Orbit schedule file. Ask Claude to turn your registration form into one, then upload it unchanged."); }
  if (Array.isArray(data)) data = { classes: data };
  const src = data.classes || data.schedule || [];
  if (!Array.isArray(src) || !src.length) throw new Error('No classes found in this file.');
  if (src.length > 200) throw new Error('That file has more than 200 classes — is it the right one?');
  const rows = [], skipped = [];
  src.forEach((c, i) => {
    try {
      const name = String(c.name||c.subject||c.title||'').trim();
      if (!name) throw 0;
      let day = c.day;
      if (typeof day === 'string' && !/^\d+$/.test(day.trim())) {
        const k = day.trim().toLowerCase();
        day = Object.hasOwn(DAY_IDX, k) ? DAY_IDX[k] : Object.hasOwn(DAY_IDX, k.slice(0,3)) ? DAY_IDX[k.slice(0,3)] : -1;
      } else day = Number(day);
      if (!(day>=0 && day<=5)) throw 0;
      let s, e;
      if (c.time) { const p = String(c.time).split(/[-–—]/); s = parseTimeVal(p[0]); e = parseTimeVal(p[1]); }
      else { s = parseTimeVal(c.start ?? c.start_min ?? c.from); e = parseTimeVal(c.end ?? c.end_min ?? c.to); }
      if (!(e>s && s>=0 && e<=1440)) throw 0;
      rows.push({ name:name.slice(0,80), meta:String(c.room||c.meta||c.note||'').trim().slice(0,60),
        cat:catOf(c.type||c.cat||c.category), day, start_min:s, end_min:e });
    } catch { skipped.push(i+1); }
  });
  if (!rows.length) throw new Error('Could not read any classes from this file.');
  const st = data.student || data.profile || null;
  let profilePatch = null;
  if (st) {
    profilePatch = {};
    const nm = String(st.name||st.display_name||'').trim(); if (nm) profilePatch.display_name = nm.slice(0,60);
    const co = String(st.course||'').trim(); if (co) profilePatch.course = co.slice(0,60);
    const sc = String(st.school||'').trim(); if (sc) profilePatch.school = sc.slice(0,80);
    if (!Object.keys(profilePatch).length) profilePatch = null;
  }
  return { rows, skipped, profilePatch };
}
