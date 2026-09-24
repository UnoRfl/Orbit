/* Orbit — the galaxy: the Map tab's overview of your systems.
   See GUIDE.md for the full map of what lives where.

   You sit at the core. Every system you belong to orbits you on a tilted,
   depth-sorted ring — it passes behind your avatar and comes back round in
   front — and friends who are checked in somewhere circle that system as
   satellites, with a signal line running from you to it. Drag sideways to
   spin it (it coasts), drag up/down to tilt it, tap a system to bring it to
   the front and see who's there. Pending invites arrive as comets on the rim.

   HOW IT MOVES
   Positions are written straight onto the nodes' style.transform from one
   requestAnimationFrame loop — Preact only re-renders when the *content*
   changes (who's where, what's focused), never per frame. For the same reason
   nothing whose transform the loop writes may carry a CSS transition: the
   rewrite would get animated and the nodes would lag behind the orbit.

   COST
   The loop stops when the galaxy is off-screen or the tab is hidden, and never
   starts on perf tier 2 or under reduced motion — those get the same layout,
   drawn once, still draggable, just not drifting. */
import { html, useEffect, useMemo, useRef, useState } from './lib.js';
import { DAYS, IcCheck, IcPlus, IcTrash, IcX, KINDS, fmt, fname, hueCss, perfTier, planetsOf } from './core.js';
import { Avatar } from './components.js';

const TAU = Math.PI * 2;
const TILT_MIN = 0.2, TILT_MAX = 0.62, TILT0 = 0.36;
const SPIN = [0.075, 0.05, 0.032];          // rad/s per ring, inner fastest — loosely Keplerian
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ring assignment: small galaxies get one ring, busier ones spread out;
   invites always ride the outermost rim */
function layoutOf(systems, invites) {
  const n = systems.length;
  const rings = n <= 3 ? 1 : 2;
  const out = systems.map((s, i) => ({ kind: 'sys', key: s.key, ring: rings === 1 ? 0 : i % 2, s }));
  const perRing = [0, 0];
  out.forEach(o => perRing[o.ring]++);
  const seen = [0, 0];
  out.forEach(o => { o.phase = (seen[o.ring]++ / Math.max(1, perRing[o.ring])) * TAU + o.ring * 0.9; });
  invites.forEach(({ sys }, i) =>
    out.push({ kind: 'invite', key: 'inv:' + sys.id, ring: 2, phase: 0.6 + (i / Math.max(1, invites.length)) * TAU, s: sys }));
  return out;
}

export function Galaxy({ uid, me, systems, invites, myD, matchSys, friendsInSys, events, nameOf,
                         onOpen, onNew, onRespondInvite, onDelete, onLeave, onOpenFriend, onOpenEvent }) {
  const wrap = useRef(null);
  const svg = useRef(null);
  const els = useRef(new Map());          // key -> node element
  const lines = useRef(new Map());        // key -> svg line
  const rings = useRef([]);               // svg ellipses
  const stars = useRef(null);
  const [focus, setFocus] = useState(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const nodes = useMemo(() => layoutOf(systems, invites),
    [systems.map(s => s.key).join(), invites.map(i => i.sys.id).join()]);

  // who is where, per system — drives the satellites, the counts and the signal lines
  const here = {};
  for (const s of systems) {
    const f = friendsInSys(s);
    here[s.key] = { friends: f, me: !!matchSys(myD, s) };
  }

  /* mutable animation state lives in a ref so the loop never waits on a render */
  const st = useRef({ base: 0, vel: 0, tilt: TILT0, t: 0, focus: null, drag: null, moved: false, dirty: true });
  st.current.focus = focus;

  const still = perfTier() >= 2 || document.documentElement.hasAttribute('data-rm');

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); st.current.dirty = true; };
    measure();
    const ro = window.ResizeObserver ? new ResizeObserver(measure) : null;
    ro && ro.observe(el);
    return () => ro && ro.disconnect();
  }, []);

  const angleOf = n => st.current.base + n.phase +
    (still ? 0 : st.current.t * SPIN[n.ring]) * (n.kind === 'invite' ? -1 : 1);

  /* ---- the frame: place every node, ring, line and the starfield ---- */
  function frame(dt) {
    const S = st.current, W = size.w, H = size.h;
    if (!W || !H) return;
    const cx = W / 2, cy = H * 0.47;
    /* A phone is taller than it is wide, so the same tilt that reads as a
       disc on a laptop squashes every system into one crowded band there.
       Open the ellipse up and shrink the nodes a touch instead. */
    const narrow = W < 520;
    const tilt = Math.min(0.92, S.tilt * (narrow ? 1.95 : 1));
    const k = narrow ? 0.8 : 1;
    const R0 = Math.min(W * (narrow ? 0.25 : 0.3), H * 0.62), R1 = Math.min(W * (narrow ? 0.41 : 0.43), H * 0.9), R2 = Math.min(W * (narrow ? 0.4 : 0.47), H * 1.02);
    const RX = [R0, R1, R2, R1 * 1.18];               // [3] is the soft disc under the rings

    if (!S.drag) {
      S.base += S.vel * dt;
      S.vel *= Math.pow(0.12, dt);                       // coast to a stop in about a second
      if (Math.abs(S.vel) < 0.002) S.vel = 0;
    }
    S.t += dt;

    // a focused system glides round to the front and the galaxy holds still
    const fn = S.focus && nodes.find(n => n.key === S.focus);
    S.gliding = false;
    if (fn && !S.drag) {
      S.t -= dt;                                          // freeze the drift while focused
      let d = (Math.PI / 2 - angleOf(fn)) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
      S.base += d * Math.min(1, dt * 5);
      S.gliding = Math.abs(d) > 0.003;
    }

    rings.current.forEach((e, i) => {
      if (!e) return;
      e.setAttribute('cx', cx); e.setAttribute('cy', cy);
      e.setAttribute('rx', RX[i]); e.setAttribute('ry', RX[i] * tilt);
    });

    for (const n of nodes) {
      const el = els.current.get(n.key); if (!el) continue;
      const a = angleOf(n);
      const x = cx + Math.cos(a) * RX[n.ring];
      const y = cy + Math.sin(a) * RX[n.ring] * tilt;
      const depth = Math.sin(a);                          // -1 behind the core … 1 in front
      const focused = S.focus === n.key, dim = S.focus && !focused;
      const sc = (0.74 + 0.26 * (depth + 1) / 2) * (focused ? 1.32 : 1) * k;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%) scale(${sc.toFixed(3)})`;
      el.style.zIndex = String(Math.round(50 + depth * 40) + (focused ? 100 : 0));
      el.style.opacity = String(dim ? 0.28 : (0.5 + 0.5 * (depth + 1) / 2).toFixed(3));
      // a comet's tail trails along its direction of travel
      if (n.kind === 'invite') el.style.setProperty('--tail', `${(Math.atan2(Math.cos(a) * tilt, -Math.sin(a)) * 180 / Math.PI).toFixed(1)}deg`);
      const ln = lines.current.get(n.key);
      if (ln) {
        ln.setAttribute('x1', cx); ln.setAttribute('y1', cy);
        ln.setAttribute('x2', x.toFixed(1)); ln.setAttribute('y2', y.toFixed(1));
        ln.style.opacity = dim ? '0.12' : String((0.35 + 0.45 * (depth + 1) / 2).toFixed(2));
      }
    }
    if (stars.current) {
      // the star tile is 240px, so wrapping the offset there is seamless
      const px = ((S.base * 34) % 240 + 240) % 240, py = (S.tilt - TILT0) * 90;
      stars.current.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
    }
  }

  /* ---- the loop: runs only while visible, only where motion is allowed ---- */
  useEffect(() => {
    if (!size.w) return;
    let raf = 0, last = performance.now(), onScreen = true;
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const S = st.current;
      if (!still || S.drag || S.vel || S.gliding || S.dirty) { frame(dt); S.dirty = false; }
      // a still galaxy only animates while you're touching it or it's settling a focus
      const busy = S.drag || S.vel || S.gliding;
      if (!still || busy) raf = requestAnimationFrame(tick); else raf = 0;
    };
    const kick = () => { if (!raf && onScreen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    st.current.kick = kick;
    const io = window.IntersectionObserver ? new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (!onScreen && raf) { cancelAnimationFrame(raf); raf = 0; } else kick();
    }) : null;
    io && wrap.current && io.observe(wrap.current);
    const vis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else kick(); };
    document.addEventListener('visibilitychange', vis);
    st.current.dirty = true; frame(0); kick();
    return () => { cancelAnimationFrame(raf); io && io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [size.w, size.h, nodes, still]);

  // content changed (focus, satellites): redraw at least once even when still
  useEffect(() => { const S = st.current; S.dirty = true; S.gliding = !!focus; S.kick && S.kick(); });

  /* ---- drag to spin / tilt ---- */
  const onDown = e => {
    if (e.button != null && e.button !== 0) return;
    const S = st.current;
    S.drag = { x: e.clientX, y: e.clientY, lx: e.clientX, lt: performance.now(), id: e.pointerId };
    S.moved = false; S.vel = 0;
    S.kick && S.kick();
  };
  const onMove = e => {
    const S = st.current, d = S.drag; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.lx, now = performance.now();
    if (!S.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      S.moved = true;
      try { wrap.current.setPointerCapture(e.pointerId); } catch {}
    }
    if (!S.moved) return;
    const k = Math.PI / Math.max(260, size.w);
    S.base += dx * k;
    S.vel = (dx * k) / Math.max(0.008, (now - d.lt) / 1000);
    S.tilt = clamp(S.tilt - (e.movementY || 0) * 0.0025, TILT_MIN, TILT_MAX);
    d.lx = e.clientX; d.lt = now;
    frame(0);
  };
  const onUp = e => {
    const S = st.current; if (!S.drag || S.drag.id !== e.pointerId) return;
    S.drag = null;
    S.vel = clamp(S.vel, -4, 4);
    // the click that follows this pointerup still needs to know it was a drag;
    // after that, a keyboard Enter must not be mistaken for one
    setTimeout(() => { S.moved = false; }, 0);
    if (!S.moved && e.target === e.currentTarget) setFocus(null);   // tap on empty space
    S.kick && S.kick();
  };
  const tapNode = (n, ev) => {
    ev.stopPropagation();
    if (st.current.moved) return;            // that was the end of a drag, not a tap
    if (focus === n.key && n.kind === 'sys') { onOpen(n.s.key); return; }
    setFocus(n.key);
  };

  const fNode = focus && nodes.find(n => n.key === focus);
  const liveTotal = systems.reduce((t, s) => t + here[s.key].friends.length, 0);
  const liveSys = systems.filter(s => here[s.key].friends.length).length;

  return html`<div class="galaxy-wrap">
    <div class=${'galaxy' + (still ? ' still' : '') + (focus ? ' focused' : '')} ref=${wrap}
      style=${`--gfocus:${hueCss(fNode ? fNode.s.hue ?? 265 : 265)}`}
      onPointerDown=${onDown} onPointerMove=${onMove} onPointerUp=${onUp} onPointerCancel=${onUp}>
      <div class="gstars" ref=${stars} aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="gnebula" aria-hidden="true">
        ${systems.slice(0, 4).map((s, i) => html`<span key=${s.key} style=${`--nh:${hueCss(s.hue, 55, 70)};--ni:${i}`}></span>`)}
      </div>

      <svg class="gsvg" ref=${svg} width=${size.w} height=${size.h} aria-hidden="true">
        <defs><radialGradient id="gdiscg"><stop offset="0" stop-color="#fff" stop-opacity=".07"/><stop offset=".55" stop-color="#fff" stop-opacity=".025"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
        <ellipse class="gdisc" ref=${e => rings.current[3] = e} fill="url(#gdiscg)"/>
        ${[0, 1, 2].map(i => html`<ellipse key=${i} class=${'gring r' + i} ref=${e => rings.current[i] = e} fill="none"/>`)}
        ${systems.filter(s => here[s.key].friends.length || here[s.key].me).map(s => html`
          <line key=${s.key} class=${'gsignal' + (here[s.key].friends.length ? '' : ' mine')} ref=${e => e ? lines.current.set(s.key, e) : lines.current.delete(s.key)}
            style=${`stroke:${hueCss(s.hue, 68)}`}/>`)}
      </svg>

      <div class="gcore" style="z-index:50">
        <div class="gcore-halo"></div>
        <${Avatar} p=${me} size=${52}/>
        <div class="gcore-l">${myD ? html`${myD.emoji} ${myD.place}` : 'You'}</div>
      </div>

      ${nodes.map(n => {
        if (n.kind === 'invite') return html`<button key=${n.key} class="gnode invite" ref=${e => e ? els.current.set(n.key, e) : els.current.delete(n.key)}
            style=${`--gh:${hueCss(n.s.hue ?? 265)};--gs:34px`} onPointerDown=${e => { e.stopPropagation(); onDown(e); }} onClick=${ev => tapNode(n, ev)}
            aria-label=${`Invitation to ${n.s.name}`}>
          <span class="gtail"></span>
          <span class="gstar"><span class="gglyph">${n.s.glyph}</span></span>
          <span class="gname">Invite · ${n.s.name}</span>
        </button>`;
        const s = n.s, h = here[s.key], pls = planetsOf(s);
        const members = s.kind === 'shared' ? (s.members || []).filter(m => m.status === 'accepted').length : 0;
        const mass = clamp(pls.length + members, 0, 10);
        const px = Math.round(46 + mass * 2.4);
        const liveN = h.friends.length + (h.me ? 1 : 0);
        return html`<button key=${n.key} class=${'gnode' + (h.me ? ' mine' : '') + (liveN ? ' busy' : '')}
            ref=${e => e ? els.current.set(n.key, e) : els.current.delete(n.key)}
            style=${`--gh:${hueCss(s.hue)};--gs:${px}px`}
            onPointerDown=${e => { e.stopPropagation(); onDown(e); }}
            onClick=${ev => tapNode(n, ev)} onDblClick=${() => onOpen(s.key)}
            aria-label=${`${s.name}: ${pls.length} places${liveN ? `, ${liveN} here now` : ''}`}>
          <span class="gstar">
            <span class="gglyph">${s.glyph}</span>
            ${pls.slice(0, 4).map((p, i) => html`<span key=${p.id || i} class="gmoon" style=${`--mr:${px / 2 + 7 + i * 5}px;--md:${7 + i * 3.5}s;--mo:${-i * 2.3}s;--ma:${i * 97}deg`}><i></i></span>`)}
            ${h.friends.slice(0, 4).map((x, i) => html`<span key=${x.f.id} class="gsat" style=${`--sr:${px / 2 + 14}px;--sd:16s;--so:${-(i * 16) / Math.min(4, h.friends.length)}s;--sa:${(i * 360) / Math.min(4, h.friends.length) - 90}deg`}>
              <span class="gsat-in"><${Avatar} p=${x.f} size=${20}/></span></span>`)}
            ${liveN > 0 && html`<span class="gcount">${liveN}</span>`}
          </span>
          <span class="gname">${s.glyph} ${s.name}${s.kind === 'shared' && s.owner === uid ? ' 👑' : ''}</span>
        </button>`;
      })}

      <button class="gnew" onPointerDown=${e => e.stopPropagation()} onClick=${onNew} aria-label="New system"><${IcPlus} size=${16}/> New</button>
      ${!focus && html`<div class="ghint">${still ? 'Tap a system' : 'Drag to spin · tap a system'}</div>`}
    </div>

    <${FocusCard} n=${fNode} here=${fNode && here[fNode.key]} uid=${uid} me=${me} events=${events} nameOf=${nameOf}
      onClose=${() => setFocus(null)} onOpen=${onOpen} onRespondInvite=${onRespondInvite}
      onDelete=${onDelete} onLeave=${onLeave} onOpenFriend=${onOpenFriend} onOpenEvent=${onOpenEvent}
      summary=${liveTotal ? `${liveTotal} ${liveTotal === 1 ? 'friend is' : 'friends are'} out in ${liveSys} ${liveSys === 1 ? 'system' : 'systems'}` : 'Nobody’s checked in anywhere right now'}
      count=${systems.length}/>
  </div>`;
}

function FocusCard({ n, here, uid, me, events, nameOf, summary, count, onClose, onOpen, onRespondInvite, onDelete, onLeave, onOpenFriend, onOpenEvent }) {
  if (!n) return html`<div class="gcard idle">
    <div class="gcard-t">${count} ${count === 1 ? 'system' : 'systems'} in your orbit</div>
    <div class="small">${summary}</div>
  </div>`;

  if (n.kind === 'invite') return html`<div class="gcard" style=${`--gh:${hueCss(n.s.hue ?? 265)}`}>
    <div class="gcard-h">
      <span class="gcard-g">${n.s.glyph}</span>
      <div style="min-width:0;flex:1"><div class="gcard-t">${n.s.name}</div>
        <div class="small">An invitation is heading your way</div></div>
      <button class="xbtn" onClick=${onClose} aria-label="Close"><${IcX} size=${15}/></button>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-soft-green" style="flex:1" onClick=${() => { onRespondInvite(n.s, true); onClose(); }}><${IcCheck} size=${14}/> Join</button>
      <button class="btn" style="flex:1" onClick=${() => { onRespondInvite(n.s, false); onClose(); }}>Decline</button>
    </div>
  </div>`;

  const s = n.s, pls = planetsOf(s);
  const members = s.kind === 'shared' ? (s.members || []).filter(m => m.status === 'accepted').length : 0;
  const mine = s.kind === 'shared' && s.owner === uid;
  const next = s.kind === 'shared' ? events.find(e => e.system_id === s.key) : null;
  const K = next && (KINDS[next.kind] || KINDS.hangout);
  return html`<div class="gcard" style=${`--gh:${hueCss(s.hue)}`}>
    <div class="gcard-h">
      <span class="gcard-g">${s.glyph}</span>
      <div style="min-width:0;flex:1">
        <div class="gcard-t">${s.name}${mine ? ' 👑' : ''}</div>
        <div class="small">${pls.length} ${pls.length === 1 ? 'place' : 'places'}${members ? ` · ${members} ${members === 1 ? 'member' : 'members'}` : ''}</div>
      </div>
      <button class="xbtn" onClick=${onClose} aria-label="Close"><${IcX} size=${15}/></button>
    </div>

    ${(here.me || here.friends.length > 0) ? html`<div class="gcard-who">
      ${here.me && html`<span class="gwho me"><${Avatar} p=${me} size=${24}/> You</span>`}
      ${here.friends.map(x => html`<button key=${x.f.id} class="gwho" onClick=${() => onOpenFriend(x.f.id)}>
        <${Avatar} p=${x.f} size=${24}/> ${fname(x.f)} <span class="gwho-at">${x.d.emoji} ${x.d.place}</span></button>`)}
    </div>` : html`<div class="small" style="margin-top:10px">No one’s here right now.</div>`}

    ${next && html`<button class="gcard-ev" onClick=${() => onOpenEvent(next)}>
      <span>${next.emoji || K.emoji}</span>
      <span style="min-width:0;flex:1"><b>${next.title}</b> · ${DAYS[next.day]} ${fmt(next.start_min)}</span>
      <span class="small">by ${next.host === uid ? 'you' : nameOf(next.host)}</span>
    </button>`}

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-grad" style="flex:1" onClick=${() => onOpen(s.key)}>Open map</button>
      ${s.kind === 'shared' && html`<button class="btn btn-soft-red" style="flex:none" aria-label=${mine ? 'Delete system' : 'Leave system'}
        onClick=${() => (mine ? onDelete : onLeave)(s)}>${mine ? html`<${IcTrash} size=${14}/>` : 'Leave'}</button>`}
    </div>
  </div>`;
}
