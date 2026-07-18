/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { Fragment, h, html, useEffect, useRef, useState } from './lib.js';
import { B, DAYS, EMOJI_SUGGESTIONS, I, IcBack, IcChat, IcCheck, IcPlus, IcRadio, IcSend, IcTrash, IcUsers, IcX, KINDS, LOG_TAGS, SYSTEM_GLYPHS, SYSTEM_HUES, ago, decodePlace, encodePlace, fmt, fname, genId, hueCss, loadSystems, normName, nowInfo, planetsOf, presencePlace, saveSystems, seedSystems, systemPhrase, ui } from './core.js';
import { Avatar, Eyebrow, Sheet, Toggle, You, statusOf } from './components.js';
import { Home } from './home.js';
import { ChatView } from './chat.js';

export function MapScreen({ uid, me, friends, profiles, nameOf, presence, myPres, setPres, classesBy, events, respondInvite,
                     shared, actions, onNewCosmic, onOpenEvent, onOpenFriend,
                     updates=null, isFounder=false, publishUpdate, deleteUpdate, chat }) {
  const [localSys, setLocalSys] = useState(loadSystems);          // campus extras live on-device
  const [activeKey, setActiveKey] = useState(null);
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState(null);   // {t:'newsys'} | {t:'addplanet'} | {t:'people'} | {t:'publog'}
  const [logTab, setLogTab] = useState('log');
  const areaRef = useRef(null);
  const [dim, setDim] = useState({ w:0, h:0 });

  const campusLocal = localSys.find(s=>s.kind==='campus') || seedSystems()[0];
  const allSystems = [
    { ...campusLocal, key:'campus', kind:'campus' },
    ...shared.accepted,
  ];
  const active = activeKey ? allSystems.find(s=>s.key===activeKey) : null;
  const isLeader = active && active.kind==='shared' && active.owner===uid;
  const canAdd = active && (active.kind==='campus' || isLeader || active.members_can_add);

  const sharingOn = !!myPres?.sharing && !myPres?.ghost;
  const myD = sharingOn ? decodePlace(myPres?.zone) : null;
  const friendPlaces = friends.map(f=>({ f, d: presencePlace(presence[f.id]) })).filter(x=>x.d);
  const matchSys = (d, sys) => d && (d.key===sys.key || normName(d.system)===normName(sys.name));
  const friendsInSys = sys => friendPlaces.filter(x=>matchSys(x.d, sys));
  const friendsOnPlanet = (sys, planet) => friendPlaces.filter(x=>
    (x.d.pi && planet.id && x.d.pi===planet.id) || (matchSys(x.d, sys) && normName(x.d.place)===normName(planet.name)));

  useEffect(()=>{
    const el = areaRef.current; if(!el) return;
    const measure = ()=>{ const r=el.getBoundingClientRect(); setDim({ w:r.width, h:r.height }); };
    measure();
    let ro; if(window.ResizeObserver){ ro=new ResizeObserver(measure); ro.observe(el); }
    else addEventListener('resize', measure, { passive:true });
    return ()=>{ if(ro) ro.disconnect(); else removeEventListener('resize', measure); };
  },[activeKey]);
  // if the system I'm inside gets deleted / I get removed, fall back to the grid
  useEffect(()=>{ if(activeKey && !allSystems.find(s=>s.key===activeKey)) { setActiveKey(null); setSel(null); } },[allSystems.length]);

  const commitLocal = next => { setLocalSys(next); saveSystems(next); };
  const addSystem = async spec => { const row = await actions.createSystem(spec); setForm(null); if(row){ setSel(null); setEdit(false); setActiveKey(row.id); } };
  const addPlanet = async ({ name, icon }) => {
    if (!active) return;
    if (active.kind==='campus') {
      commitLocal(localSys.map(s=> s.kind==='campus' ? { ...s, planets:[...(s.planets||[]), { id:genId('p_'), name, icon }] } : s));
    } else {
      await actions.addSharedPlanet(active.key, { name, icon });
    }
    setForm(null);
  };
  const removePlanet = async planet => {
    if (!active) return;
    if (active.kind==='campus') {
      commitLocal(localSys.map(s=> s.kind==='campus' ? { ...s, planets:(s.planets||[]).filter(p=>p.id!==planet.id) } : s));
      if (myD?.pi===planet.id) setPres({ zone:null });
    } else {
      await actions.delSharedPlanet(planet);
    }
    setSel(null);
  };
  const canDeletePlanet = p => active && !p.preset && (active.kind==='campus' || isLeader || p.created_by===uid);
  const checkIn = (sys, planet) => setPres({ zone: encodePlace({ placeLabel:planet.name, emoji:planet.icon, systemLabel:sys.name, systemKey:sys.key, planetId:planet.id }), sharing:true, ghost:false });
  const leave = () => setPres({ zone:null });

  const shareCard = html`<div class="card" style="margin-top:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
      <div style="display:flex;align-items:center;gap:10px;min-width:0">
        <span style=${`display:flex;color:${sharingOn?'var(--ge)':'var(--faint)'}`}><${IcRadio} size=${16}/></span>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:600">Share my location</div>
          <div class="rowsub">${myD ? `On ${myD.emoji} ${myD.place} · ${myD.system}` : (sharingOn ? 'Open a system and tap a planet to check in' : 'Hidden from everyone')}</div>
        </div>
      </div>
      <button class=${'tgl'+(sharingOn?' on':'')} aria-label="Toggle sharing" onClick=${()=>setPres({ sharing:!sharingOn, ghost:false })}><span></span></button>
    </div>
    <button class=${'btn btn-block'} style=${`margin-top:14px;${myPres?.ghost?'border-color:var(--major);background:rgba(176,107,255,.14)':''}`}
      onClick=${()=>setPres({ ghost:!myPres?.ghost })}>
      👻 ${myPres?.ghost ? "Ghost mode on — you're invisible" : 'Ghost mode'}
    </button>
  </div>`;

  const sheets = html`<${Fragment}>
    <${Sheet} open=${form?.t==='newsys'} onClose=${()=>setForm(null)} accent="var(--major)">
      ${form?.t==='newsys' && html`<${NewSystemForm} onSave=${addSystem} onClose=${()=>setForm(null)} />`}
    <//>
    <${Sheet} open=${form?.t==='addplanet'} onClose=${()=>setForm(null)} accent="var(--ge)">
      ${form?.t==='addplanet' && active && html`<${AddPlanetForm} system=${active} onSave=${addPlanet} onClose=${()=>setForm(null)} />`}
    <//>
    <${Sheet} open=${form?.t==='people'} onClose=${()=>setForm(null)} accent="var(--major)">
      ${form?.t==='people' && active && active.kind==='shared' && html`<${SystemPeople} sys=${active} uid=${uid} me=${me}
        friends=${friends} profiles=${profiles} nameOf=${nameOf} actions=${actions} onClose=${()=>setForm(null)} />`}
    <//>
    <${Sheet} open=${form?.t==='publog'} onClose=${()=>setForm(null)} accent="var(--nstp)">
      ${form?.t==='publog' && html`<${PublishUpdate} onClose=${()=>setForm(null)}
        onPublish=${async row=>{ if(await publishUpdate(row)) setForm(null); }} />`}
    <//>
  <//>`;

  /* ============ GRID: pick a solar system ============ */
  const ndG = nowInfo();
  const sysByKey = Object.fromEntries(shared.accepted.map(s=>[s.key,s]));
  const cosmicAll = events.filter(e=>e.system_id && sysByKey[e.system_id] && (e.day>ndG.day || (e.day===ndG.day && e.end_min>ndG.min)))
    .sort((a,b)=>a.day-b.day||a.start_min-b.start_min).slice(0,6);
  if (!active) {
    return html`<div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <${Eyebrow} color="var(--ge)">Your systems<//>
        <button class=${'sysedit'+(edit?' on':'')} style="padding:6px 11px" onClick=${()=>setEdit(!edit)}>${edit?'Done':'Edit'}</button>
      </div>
      <div class="hint" style="margin-bottom:2px">Each system is a circle — a shared group with its own planets. Tap in to see who's where and check in.</div>

      ${shared.invited.map(({sys,mem})=>html`<div key=${sys.id} class="card sysinvite">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">${sys.glyph}</span>
          <div style="min-width:0;flex:1">
            <div class="rowname">${sys.name}</div>
            <div class="rowsub">${nameOf(mem.invited_by)} invited you to this system</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;margin-top:11px">
          <button class="btn btn-soft-green" style="flex:1" onClick=${()=>actions.respondSystemInvite(sys, true)}><${IcCheck} size=${14}/> Join</button>
          <button class="btn" style="flex:1" onClick=${()=>actions.respondSystemInvite(sys, false)}>Decline</button>
        </div>
      </div>`)}

      <div class="sysgrid">
        ${allSystems.map(sys=>{
          const pls = planetsOf(sys), sample = pls.slice(0,3);
          const fHere = friendsInSys(sys);
          const iHere = matchSys(myD, sys);
          const liveN = fHere.length + (iHere?1:0);
          const memberN = sys.kind==='shared' ? (sys.members||[]).filter(m=>m.status==='accepted').length : 0;
          const mine = sys.kind==='shared' && sys.owner===uid;
          return html`<button key=${sys.key} class="systile" style=${`--sh:${hueCss(sys.hue)}`}
              onClick=${()=>{ setActiveKey(sys.key); setSel(null); setEdit(false); }}>
            ${edit && sys.kind==='shared' && html`<span class="del" role="button"
              onClick=${async e=>{ e.stopPropagation();
                if (mine) { if(await ui.confirm({ title:`Delete ${sys.name}?`, body:'Removes the system for everyone.', confirmLabel:'Delete', danger:true })) actions.deleteSystem(sys.key); }
                else { if(await ui.confirm({ title:`Leave ${sys.name}?`, confirmLabel:'Leave', danger:true })) actions.leaveSystem(sys.key); }
              }}>${mine ? html`<${IcTrash} size=${13}/>` : html`<${IcX} size=${13}/>`}</span>`}
            ${liveN>0 && !edit && html`<div class="sfaces">
              ${iHere && html`<${Avatar} p=${me} size=${20}/>`}
              ${fHere.slice(0,3).map((x,idx)=>html`<div key=${x.f.id} style=${`margin-left:${(idx===0&&!iHere)?0:-8}px`}><${Avatar} p=${x.f} size=${20}/></div>`)}
            </div>`}
            <div class="sysmini" style=${`--sh:${hueCss(sys.hue)}`}>
              <div class="ring" style="width:34px;height:34px"></div>
              <div class="ring" style="width:56px;height:56px"></div>
              <div class="ring" style="width:76px;height:76px"></div>
              <div class="sun"></div>
              ${sample.map((p,i)=>html`<div key=${i} class="orbiter" style=${`--d:${9+i*6}s;animation-delay:${-i*4}s`}>
                <div class="pdot" style=${`left:${[17,28,38][i]}px;top:0`}>${p.icon}</div></div>`)}
            </div>
            <div class="sname">${sys.glyph} ${sys.name} ${mine?html`<span style="font-size:11px">👑</span>`:''}</div>
            <div class="smeta">
              <span>${pls.length} ${pls.length===1?'place':'places'}${memberN?` · ${memberN} ${memberN===1?'member':'members'}`:''}</span>
              ${liveN>0 && html`<span class="slive"><span style="width:5px;height:5px;border-radius:50%;background:var(--pe);display:inline-block;box-shadow:0 0 6px var(--pe)"></span> ${liveN} here</span>`}
            </div>
          </button>`;
        })}
        <button class="systile addsys" onClick=${()=>setForm({t:'newsys'})}>
          <div class="plusdisc"><${IcPlus} size=${22}/></div>
          <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:inherit">New system</div>
          <div class="small">Start a circle</div>
        </button>
      </div>

      <div class="logframe">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div class="pillrow">
            <button class=${'pill'+(logTab==='log'?' on':'')} style="font-weight:600" onClick=${()=>setLogTab('log')}>📡 Updates</button>
            <button class=${'pill'+(logTab==='cosmic'?' on-teal':'')} style="font-weight:600" onClick=${()=>setLogTab('cosmic')}>☄️ Cosmic</button>
          </div>
          ${logTab==='log' && isFounder && html`<button class="sysedit" style="padding:6px 11px;flex:none" onClick=${()=>setForm({t:'publog'})}><${IcPlus} size=${12}/> Publish</button>`}
        </div>

        ${logTab==='log' && html`<div style="margin-top:8px">
          ${updates===null && html`<div class="small" style="padding:6px 2px">The mission log opens soon.</div>`}
          ${updates && !updates.length && html`<div class="small" style="padding:6px 2px">No updates published yet${isFounder?' — write the first one':''}.</div>`}
          ${(updates||[]).map(u=>{ const T = LOG_TAGS[u.tag]||LOG_TAGS.new;
            return html`<div key=${u.id} class="logrow">
              <span style="font-size:18px;flex:none;margin-top:1px">${u.emoji}</span>
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
                  <span class="rowname">${u.title}</span>
                  <span class="logtag" style=${`color:${T.c};border-color:${T.c}55;background:${T.c}14`}>${T.l}</span>
                </div>
                ${u.body && html`<div class="rowsub" style="white-space:normal;margin-top:2px;line-height:1.5">${u.body}</div>`}
                <div class="small" style="margin-top:4px">${ago(u.created_at)} · by ${u.author===uid?'you':nameOf(u.author)} ✦</div>
              </div>
              ${u.author===uid && isFounder && html`<button class="btn" style="padding:6px 9px;flex:none" onClick=${()=>deleteUpdate(u.id)} aria-label="Delete update"><${IcTrash} size=${13}/></button>`}
            </div>`;})}
        </div>`}

        ${logTab==='cosmic' && html`<div style="margin-top:8px">
          ${!cosmicAll.length && html`<div class="small" style="padding:6px 2px">No cosmic events coming up — open a system and hit ☄️ New.</div>`}
          ${cosmicAll.map(e=>{ const K = KINDS[e.kind]||KINDS.hangout; const s = sysByKey[e.system_id];
            return html`<button key=${e.id} class="logrow" onClick=${()=>onOpenEvent(e)}>
              <span style="font-size:18px;flex:none;margin-top:1px">${e.emoji||K.emoji}</span>
              <div style="min-width:0;flex:1">
                <div class="rowname">${e.title}</div>
                <div class="rowsub">${DAYS[e.day]} · ${fmt(e.start_min)}–${fmt(e.end_min)}${e.place?` · ${e.place}`:''}</div>
                <div class="uporigin"><span style=${`color:${hueCss(s.hue)}`}>${s.glyph} ${s.name}</span><span>·</span><span>set up by ${e.host===uid?'you':nameOf(e.host)}</span></div>
              </div>
            </button>`;})}
        </div>`}
      </div>

      ${friendPlaces.length>0 && html`<div style="margin-top:22px">
        <${Eyebrow}>Orbiting right now<//>
        <div class="stack" style="margin-top:10px">
          ${friendPlaces.map(({f,d})=>html`<button key=${f.id} class="cardrow" onClick=${()=>onOpenFriend(f.id)}>
            <${Avatar} p=${f} size=${36}/>
            <div style="min-width:0;flex:1">
              <div class="rowname">${fname(f)} · <span style="color:var(--major)">${d.emoji} ${d.place}</span></div>
              <div class="rowsub">${systemPhrase(d.system, f.id)}</div>
            </div>
            <div class="small">${ago(presence[f.id].updated_at)}</div>
          </button>`)}
        </div>
      </div>`}

      ${shareCard}
      ${sheets}
    </div>`;
  }

  /* ============ DETAIL: one system's top-down orrery ============ */
  const items = planetsOf(active).concat(canAdd ? [{ add:true }] : []);
  const N = Math.max(1, items.length);
  const P = items.filter(it=>!it.add).length;
  const w = dim.w, h = dim.h;
  const cx = w/2, cy = h/2;
  const ranks = N>1 ? N-1 : 1;
  const pBase = Math.round(Math.max(26, Math.min(40, 40 - Math.max(0, P-3)*2.2)));
  const RMin = 44;
  const RMax = Math.max(RMin+28, Math.min(w, h)/2 - Math.round(pBase*0.6) - 10);

  const layout = items.map((it,i)=>{
    const R = RMin + (RMax-RMin)*(ranks?i/ranks:0);
    const a = -Math.PI/2 + i*GOLDEN_ANGLE;
    const isAdd = !!it.add;
    const size = isAdd ? Math.max(22, Math.round(pBase*0.85)) : Math.max(24, Math.min(42, Math.round(pBase * SIZE_VAR[i % SIZE_VAR.length])));
    const planet = isAdd ? null : it;
    const meHere = !isAdd && sharingOn && myD && ((myD.pi && myD.pi===planet.id) || (matchSys(myD, active) && normName(myD.place)===normName(planet.name)));
    const faces = isAdd ? [] : friendsOnPlanet(active, planet);
    const cnt = faces.length + (meHere?1:0);
    const skin = PLANET_SKIN[i%PLANET_SKIN.length];
    return { i, id: isAdd?'__add__':planet.id, isAdd, planet, name: isAdd?'Add place':planet.name,
      R, px: cx+Math.cos(a)*R, py: cy+Math.sin(a)*R, size,
      zi: sel===(isAdd?'__add__':planet.id) ? 2600 : 2000,
      skin, colors: isAdd ? ['#9a8fa8','#6f6480','#4a4358'] : SKIN_COLORS[skin], meHere, faces, cnt };
  });

  /* place labels so text never lands on a planet, the sun, or another label */
  const labels = [];
  if (w>0) {
    const ovl = (a,b)=>{ const ox=Math.max(0,Math.min(a.x+a.hw,b.x+b.hw)-Math.max(a.x-a.hw,b.x-b.hw));
      const oy=Math.max(0,Math.min(a.y+a.hh,b.y+b.hh)-Math.max(a.y-a.hh,b.y-b.hh)); return ox*oy; };
    const gap=8, lh=15;
    const cw = Math.min(Math.max(active.name.length*6.4+8,40),150);
    const centerBox = { x:cx, y:cy+18, hw:cw/2, hh:9 };
    const meta = layout.map(L=>{ const txt=L.name+(L.cnt>0?` · ${L.cnt}`:'');
      return { lw:Math.min(Math.max(txt.length*6.2+6,34),140), pr:L.size/2+5 }; });
    const place = new Array(layout.length).fill(null);
    const candsFor = i => { const L=layout[i], m=meta[i], dB=m.pr+gap+lh/2, off=[
        [0,dB],[0,-dB],[0,dB+lh+5],[0,-(dB+lh+5)],
        [m.lw*0.5,dB],[-m.lw*0.5,dB],[m.lw*0.5,-dB],[-m.lw*0.5,-dB],
        [m.lw*0.62,0],[-m.lw*0.62,0],[0,dB+2*(lh+5)],[0,-(dB+2*(lh+5))] ];
      return off.map(([dx,dy])=>({ x:L.px+dx, y:L.py+dy })); };
    const score = (i, box) => { let s = Math.abs(box.x-layout[i].px)*0.15;
      if (box.y-box.hh<4) s+=1e4; if (box.y+box.hh>h-4) s+=1e4;
      if (box.x-box.hw<2) s+=(2-(box.x-box.hw))*8; if (box.x+box.hw>w-2) s+=((box.x+box.hw)-(w-2))*8;
      for (const Pt of layout) s += 3*ovl(box,{ x:Pt.px, y:Pt.py, hw:Pt.size/2+2, hh:Pt.size/2+2 });
      s += 5*ovl(box, centerBox);
      for (let j=0;j<place.length;j++){ if (j===i||!place[j]) continue; s += 6*ovl(box, place[j]); }
      return s; };
    const assign = i => { const hw=meta[i].lw/2; let best=null, bs=Infinity;
      for (const c of candsFor(i)){ const box={ x:c.x, y:c.y, hw, hh:lh/2 }; const s=score(i,box); if (s<bs){ bs=s; best=box; } }
      place[i]=best; };
    const order = layout.map((_,i)=>i).sort((A,B)=>layout[A].py-layout[B].py);
    for (const i of order) assign(i);
    for (let sweep=0; sweep<3; sweep++) for (const i of order) assign(i);
    layout.forEach((L,i)=>{ labels[i] = place[i] ? { x:place[i].x, y:place[i].y } : { x:L.px, y:L.py }; });
  }

  const orbits = layout.map(L=>({ i:L.i, id:L.id, R:L.R, colors:L.colors }));
  const emptySys = P===0;
  const nd0 = nowInfo();
  const cosmic = active.kind==='shared'
    ? events.filter(e=>e.system_id===active.key && (e.day>nd0.day || (e.day===nd0.day && e.end_min>nd0.min)))
        .sort((a,b)=>a.day-b.day||a.start_min-b.start_min).slice(0,4)
    : [];

  return html`<div>
    <div class="syshead">
      <button class="sysback" onClick=${()=>{ setActiveKey(null); setSel(null); }}><${IcBack} size=${15}/> Systems</button>
      <div class="systitle">${active.glyph} ${active.name}</div>
      ${active.kind==='shared' && html`<button class="sysedit" style="padding:8px 10px;position:relative" aria-label="System chat"
        onClick=${()=>chat.setSel(chat.sel?.scope==='sys'&&chat.sel.ref===active.key ? null : { scope:'sys', ref:active.key })}>
        <${IcChat} size=${15}/>${(chat.ov['sys:'+active.key]?.n||0)>0 && !chat.reads['sys:'+active.key]?.muted && html`<span class="nbadge">${chat.ov['sys:'+active.key].n}</span>`}</button>`}
      ${active.kind==='shared' && html`<button class="sysedit" style="padding:8px 10px" onClick=${()=>setForm({t:'people'})} aria-label="Members"><${IcUsers} size=${15}/></button>`}
      ${canAdd && html`<button class="sysedit" style="padding:8px 10px" onClick=${()=>setForm({t:'addplanet'})} aria-label="Add a place"><${IcPlus} size=${15}/></button>`}
    </div>
    <div class="hint" style="margin-top:-6px;margin-bottom:12px">${active.kind==='campus'
      ? 'Your campus, as planets. Tap one to see who’s there and check in.'
      : `A shared system${isLeader?' you lead':''} — everyone here sees the same planets. Tap one to check in.`}</div>

    <div class="maparea space" ref=${areaRef}>
      <div class="mapstars"></div>
      ${w>0 && html`<svg class="map-svg" viewBox=${`0 0 ${w} ${h}`} width=${w} height=${h}>
        <defs>
          ${orbits.map(o=>html`<linearGradient key=${'g'+o.i} id=${'orb'+o.i} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color=${o.colors[0]}/>
            <stop offset="50%" stop-color=${o.colors[1]}/>
            <stop offset="100%" stop-color=${o.colors[2]}/>
          </linearGradient>`)}
        </defs>
        ${orbits.map(o=>html`<g key=${'orb'+o.i}>
          ${sel===o.id && html`<circle cx=${cx} cy=${cy} r=${o.R} fill="none" stroke=${o.colors[1]} stroke-width="5" opacity="0.15"/>`}
          <circle cx=${cx} cy=${cy} r=${o.R} fill="none" stroke=${`url(#orb${o.i})`}
            stroke-width=${sel===o.id?1.9:1.1} opacity=${sel===o.id?1:0.9} style="transition:stroke-width .2s ease"/>
        </g>`)}
      </svg>`}
      <div class="map-center" style=${`left:${cx}px;top:${cy}px;z-index:3000`}>
        <div class="map-center-star" style=${`background:radial-gradient(circle at 38% 34%, #fff, ${hueCss(active.hue,72,86)} 45%, ${hueCss(active.hue,26,86)} 100%);box-shadow:0 0 26px ${hueCss(active.hue,60,74,.6)}`}></div>
        <div class="map-center-label">${active.name.toUpperCase()}</div>
      </div>
      ${w>0 && layout.map(L=> L.isAdd
        ? html`<button key="add" class="planet-zone add" style=${`left:${L.px}px;top:${L.py}px;z-index:${L.zi}`}
            onClick=${()=>setForm({t:'addplanet'})} aria-label="Add a place">
            <div class="planet-body" style=${`width:${L.size}px;height:${L.size}px`}><${IcPlus} size=${Math.round(L.size*0.4)}/></div>
          </button>`
        : html`<button key=${L.id} class=${'planet-zone'+(sel===L.id?' on':'')}
            style=${`left:${L.px}px;top:${L.py}px;z-index:${L.zi}`} onClick=${()=>setSel(sel===L.id?null:L.id)}>
            ${edit && canDeletePlanet(L.planet) && html`<span class="pdel" role="button"
              onClick=${e=>{ e.stopPropagation(); removePlanet(L.planet); }}><${IcX} size=${11}/></span>`}
            <div class=${`planet-body ${L.skin}`} style=${`width:${L.size}px;height:${L.size}px`}>
              <span class="planet-emoji" style=${`font-size:${Math.round(L.size*0.4)}px`}>${L.planet.icon}</span>
              ${L.cnt>0 && html`<div class="zav">
                ${L.meHere && html`<${Avatar} p=${me} size=${18}/>`}
                ${L.faces.slice(0,2).map((x,idx)=>html`<div key=${x.f.id} style=${`margin-left:${(idx===0&&!L.meHere)?0:-7}px`}><${Avatar} p=${x.f} size=${18}/></div>`)}
              </div>`}
            </div>
          </button>`)}
      ${w>0 && layout.map(L=> labels[L.i] && html`<div key=${'lbl'+L.id} class=${'planet-label'+(sel===L.id?' on':'')}
          style=${`left:${labels[L.i].x}px;top:${labels[L.i].y}px`}>${L.name}${L.cnt>0?html`<span class="cnt"> · ${L.cnt}</span>`:''}</div>`)}
    </div>

    ${active.kind==='shared' && html`<div style="margin-top:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <${Eyebrow} color="var(--nstp)">Cosmic events<//>
        <button class="sysedit" style="padding:6px 11px" onClick=${()=>onNewCosmic(active)}>☄️ New</button>
      </div>
      ${!cosmic.length && html`<div class="small" style="margin-top:8px">Nothing on the calendar — set up a study sesh or a hangout.</div>`}
      <div class="stack" style="margin-top:10px">
        ${cosmic.map(e=>{
          const K = KINDS[e.kind]||KINDS.hangout;
          const going = [e.host, ...(e.event_invitees||[]).filter(i=>i.status==='accepted').map(i=>i.invitee)];
          const myInv = (e.event_invitees||[]).find(i=>i.invitee===uid);
          const mineHost = e.host===uid;
          return html`<div key=${e.id} class="cardrow" style="cursor:default;align-items:flex-start">
            <span style="font-size:18px;flex:none;margin-top:2px">${e.emoji||K.emoji}</span>
            <div style="min-width:0;flex:1" onClick=${()=>onOpenEvent(e)}>
              <div class="rowname">${e.title}</div>
              <div class="rowsub">${DAYS[e.day]} · ${fmt(e.start_min)}–${fmt(e.end_min)}${e.place?` · ${e.place}`:''}</div>
              <div class="small" style="margin-top:3px;color:var(--pe)">${going.length} going${mineHost?' · your event':myInv?.status==='accepted'?' · you’re in':''}</div>
            </div>
            ${myInv?.status==='pending' && html`<div style="display:flex;gap:6px;flex:none">
              <button class="btn btn-soft-green" style="padding:7px 10px" onClick=${()=>respondInvite(e.id,'accepted')}><${IcCheck} size=${13}/></button>
              <button class="btn" style="padding:7px 10px" onClick=${()=>respondInvite(e.id,'declined')}><${IcX} size=${13}/></button>
            </div>`}
          </div>`;})}
      </div>
    </div>`}

    ${emptySys && html`<div class="card" style="margin-top:14px;text-align:center">
      <div style="font-weight:600;font-size:13.5px">No planets yet</div>
      <div class="hint" style="margin-top:4px">${canAdd ? 'Add the places this circle goes — home, a café, the mall.' : 'The leader hasn’t added places yet.'}</div>
      ${canAdd && html`<button class="btn btn-grad" style="margin-top:12px" onClick=${()=>setForm({t:'addplanet'})}><${IcPlus} size=${15}/> Add your first place</button>`}
    </div>`}

    ${sel && (()=>{ const L=layout.find(x=>x.id===sel); if(!L||L.isAdd) return null; const p=L.planet; const iAmHere=L.meHere;
      return html`<div style="margin-top:14px">
        <${Eyebrow}>${p.icon} ${p.name}<//>
        <div class="stack" style="margin-top:10px">
          ${!L.faces.length && !iAmHere && html`<div class="small">No one's on this planet right now.</div>`}
          ${iAmHere && html`<div class="cardrow" style="cursor:default;border-color:var(--ge)">
            <${Avatar} p=${me} size=${34}/>
            <div style="min-width:0;flex:1"><div class="rowname">You're here</div>
            <div class="rowsub" style="color:var(--ge)">Friends can see this</div></div></div>`}
          ${L.faces.map(x=>{ const s2=statusOf(x.f.id, classesBy, events);
            return html`<button key=${x.f.id} class="cardrow" onClick=${()=>onOpenFriend(x.f.id)}>
              <${Avatar} p=${x.f} size=${34}/>
              <div style="min-width:0;flex:1"><div class="rowname">${fname(x.f)}</div>
              <div class="rowsub" style=${`color:${s2.color}`}>${s2.text}</div></div>
              <div class="small">${ago(presence[x.f.id].updated_at)}</div></button>`; })}
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          ${iAmHere
            ? html`<button class="btn btn-block" onClick=${leave}>Leave ${p.name}</button>`
            : html`<button class="btn btn-grad btn-block" onClick=${()=>checkIn(active, p)}>📍 Check in here</button>`}
          ${canDeletePlanet(p) && html`<button class="btn btn-soft-red" style="flex:none"
            onClick=${async()=>{ if(await ui.confirm({ title:`Remove ${p.name}?`, body:`Removed from ${active.name} for everyone.`, confirmLabel:'Remove', danger:true })) removePlanet(p); }}><${IcTrash} size=${14}/></button>`}
        </div>
      </div>`; })()}

    ${chat.sel?.scope==='sys' && chat.sel.ref===active.key && html`<div class="syschat">
      <${ChatView} key=${'sys:'+active.key} kit=${chat} sel=${chat.sel} dock=${true} onClose=${()=>chat.setSel(null)}/>
    </div>`}

    ${shareCard}
    ${sheets}
  </div>`;
}

/* ============================================================
   PLANS
   ============================================================ */

export function NewSystemForm({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [glyph, setGlyph] = useState(SYSTEM_GLYPHS[0]);
  const [hue, setHue] = useState(SYSTEM_HUES[1]);
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0;
  return html`<div>
    <div class="sheethead"><div class="sheettitle">New system</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px;margin-bottom:4px">A shared circle — a barkada, a class block, a home crew. You'll be the leader: invite friends, and everyone sees the same planets.</div>
    <div class="flabel">Name</div>
    <input class="input" placeholder="e.g. Barkada, Block 3B, Home crew" value=${name} maxLength=${24} onInput=${e=>setName(e.target.value)} />
    <div class="flabel">Icon</div>
    <div class="emojigrid">${SYSTEM_GLYPHS.map(g=>html`<button key=${g} class=${'emojibtn'+(glyph===g?' on':'')} onClick=${()=>setGlyph(g)}>${g}</button>`)}</div>
    <div class="flabel">Colour</div>
    <div class="huerow">${SYSTEM_HUES.map(h=>html`<button key=${h} class=${'hueswatch'+(hue===h?' on':'')} style=${`background:${hueCss(h)}`} onClick=${()=>setHue(h)} aria-label="colour"></button>`)}</div>
    <button class="btn btn-grad btn-block" style="margin-top:18px" disabled=${!ok||busy}
      onClick=${async()=>{ setBusy(true); await onSave({ name:name.trim(), glyph, hue }); setBusy(false); }}>${busy?'Creating…':'Create system'}</button>
  </div>`;
}

export function AddPlanetForm({ system, onSave, onClose }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📍');
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0;
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Add a place</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px;margin-bottom:4px">A spot you actually go — home, a café, the mall. It becomes a planet in ${system?.name}${system?.kind==='shared'?' that the whole circle can see':''}.</div>
    <div class="flabel">Name</div>
    <input class="input" placeholder="e.g. Home, SM Molino, Kuya's café" value=${name} maxLength=${28} onInput=${e=>setName(e.target.value)} />
    <div class="flabel">Icon</div>
    <div class="emojigrid">${EMOJI_SUGGESTIONS.map(g=>html`<button key=${g} class=${'emojibtn'+(icon===g?' on':'')} onClick=${()=>setIcon(g)}>${g}</button>`)}</div>
    <button class="btn btn-grad btn-block" style="margin-top:18px" disabled=${!ok||busy}
      onClick=${async()=>{ setBusy(true); await onSave({ name:name.trim(), icon }); setBusy(false); }}>${busy?'Adding…':'Add planet'}</button>
  </div>`;
}

/* founder-only composer for the mission log */

export function PublishUpdate({ onPublish, onClose }) {
  const [emoji, setEmoji] = useState('🚀');
  const [tag, setTag] = useState('new');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Publish an update 📡</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px;margin-bottom:4px">Lands in everyone's mission log on the Map tab, live.</div>
    <div class="flabel">Emoji</div>
    <div class="emojigrid">${['🚀','✨','🛠️','🐛','📡','🪐','☄️','🎉','📢','🧪','🗺️','🔔','🎨','⚡','🧭','💾'].map(em=>html`
      <button key=${em} class=${'emojibtn'+(emoji===em?' on':'')} onClick=${()=>setEmoji(em)}>${em}</button>`)}</div>
    <div class="flabel">Tag</div>
    <div class="pillrow">${Object.entries(LOG_TAGS).map(([k,T])=>html`<button key=${k}
      class=${'pill'+(tag===k?' on':'')} style=${tag===k?`border-color:${T.c};background:${T.c}18;color:var(--ink);font-weight:600`:'font-weight:600'}
      onClick=${()=>setTag(k)}>${T.l}</button>`)}</div>
    <div class="flabel">Title</div>
    <input class="input" maxlength="80" value=${title} onInput=${e=>setTitle(e.target.value)} placeholder="Galaxy picker is live"/>
    <div class="flabel">Details · optional</div>
    <textarea class="input" rows="3" maxlength="600" value=${body} onInput=${e=>setBody(e.target.value)} placeholder="What changed, what to try…"></textarea>
    <button class="btn btn-grad btn-block" style="margin-top:14px" disabled=${busy||!title.trim()}
      onClick=${async()=>{ setBusy(true); await onPublish({ emoji, tag, title:title.trim(), body:body.trim()||null }); setBusy(false); }}>
      <${IcSend} size=${15}/> ${busy?'Publishing…':'Publish'}</button>
  </div>`;
}

/* leader → full manage · member → roster, style (if allowed), leave */

export function SystemPeople({ sys, uid, me, friends, profiles, nameOf, actions, onClose }) {
  const isLeader = sys.owner===uid;
  const [name, setName] = useState(sys.name);
  const members = (sys.members||[]).filter(m=>m.status==='accepted');
  const invited = (sys.members||[]).filter(m=>m.status==='invited');
  const inIds = new Set((sys.members||[]).map(m=>m.user_id));
  const invitable = friends.filter(f=>!inIds.has(f.id));
  const canStyle = isLeader || sys.members_can_style;
  const profOf = id => id===uid ? me : (profiles[id]||{display_name:'??'});

  return html`<div>
    <div class="sheethead"><div class="sheettitle">${isLeader?'Manage system':sys.name}</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>

    ${isLeader && html`<${Fragment}>
      <div class="flabel">Name</div>
      <div style="display:flex;gap:8px">
        <input class="input" style="flex:1" value=${name} maxLength=${24} onInput=${e=>setName(e.target.value)}/>
        <button class="btn" style="flex:none" disabled=${!name.trim()||name.trim()===sys.name}
          onClick=${()=>actions.updateSystem(sys.key,{ name:name.trim() })}>Save</button>
      </div>
    <//>`}

    ${canStyle && html`<${Fragment}>
      <div class="flabel">Icon</div>
      <div class="emojigrid">${SYSTEM_GLYPHS.map(g=>html`<button key=${g} class=${'emojibtn'+(sys.glyph===g?' on':'')}
        onClick=${()=>actions.updateSystem(sys.key,{ glyph:g })}>${g}</button>`)}</div>
      <div class="flabel">Colour</div>
      <div class="huerow">${SYSTEM_HUES.map(h=>html`<button key=${h} class=${'hueswatch'+(sys.hue===h?' on':'')}
        style=${`background:${hueCss(h)}`} onClick=${()=>actions.updateSystem(sys.key,{ hue:h })} aria-label="colour"></button>`)}</div>
    <//>`}

    ${isLeader && html`<div class="set-card" style="margin-top:16px">
      <${Toggle} label="Members can add planets" accent="var(--ge)"
        hint="Let everyone drop their own places into this system."
        on=${!!sys.members_can_add} onClick=${()=>actions.updateSystem(sys.key,{ members_can_add:!sys.members_can_add })}/>
      <${Toggle} label="Members can restyle" accent="var(--major)"
        hint="Let members change the system's icon and colour."
        on=${!!sys.members_can_style} onClick=${()=>actions.updateSystem(sys.key,{ members_can_style:!sys.members_can_style })}/>
    </div>`}

    <div class="flabel">Members · ${members.length}</div>
    <div class="stack">
      ${members.map(m=>html`<div key=${m.user_id} class="cardrow" style="cursor:default">
        <${Avatar} p=${profOf(m.user_id)} size=${34}/>
        <div style="min-width:0;flex:1">
          <div class="rowname">${m.user_id===uid?'You':(fname(profOf(m.user_id))||'??')}</div>
          <div class="rowsub">${m.role==='leader'?'👑 Leader':'Member'}</div>
        </div>
        ${isLeader && m.user_id!==uid && html`<button class="btn btn-soft-red" style="padding:7px 10px;flex:none"
          onClick=${async()=>{ if(await ui.confirm({ title:`Remove ${nameOf(m.user_id)} from ${sys.name}?`, confirmLabel:'Remove', danger:true })) actions.kickMember(sys.key, m.user_id); }}><${IcX} size=${13}/></button>`}
      </div>`)}
      ${invited.map(m=>html`<div key=${m.user_id} class="cardrow" style="cursor:default;opacity:.65">
        <${Avatar} p=${profOf(m.user_id)} size=${34}/>
        <div style="min-width:0;flex:1"><div class="rowname">${fname(profOf(m.user_id))||'??'}</div>
        <div class="rowsub">Invited — waiting</div></div>
        ${isLeader && html`<button class="btn" style="padding:7px 10px;flex:none"
          onClick=${()=>actions.kickMember(sys.key, m.user_id)}><${IcX} size=${13}/></button>`}
      </div>`)}
    </div>

    ${isLeader && html`<${Fragment}>
      <div class="flabel">Invite friends</div>
      ${!invitable.length && html`<div class="small">Everyone you know is already here.</div>`}
      <div class="pillrow">
        ${invitable.map(f=>html`<button key=${f.id} class="pill" style="padding:5px 11px 5px 5px"
          onClick=${()=>actions.inviteToSystem(sys.key, f.id, sys.name)}>
          <${Avatar} p=${f} size=${24}/> ${fname(f)} <${IcPlus} size=${12}/>
        </button>`)}
      </div>
      <button class="btn btn-soft-red btn-block" style="margin-top:18px"
        onClick=${async()=>{ if(await ui.confirm({ title:`Delete ${sys.name}?`, body:'Removes the system for everyone — planets go with it, and anyone checked in gets checked out.', confirmLabel:'Delete', danger:true })){ actions.deleteSystem(sys.key); onClose(); } }}>
        <${IcTrash} size=${14}/> Delete system</button>
    <//>`}
    ${!isLeader && html`<button class="btn btn-soft-red btn-block" style="margin-top:18px"
      onClick=${async()=>{ if(await ui.confirm({ title:`Leave ${sys.name}?`, confirmLabel:'Leave', danger:true })){ actions.leaveSystem(sys.key); onClose(); } }}>Leave system</button>`}
  </div>`;
}

export const PLANET_SKIN = ['p-purple','p-blue','p-gold','p-green','p-red','p-olive'];
// [light, mid, deep] per skin — orbit lines use these so a ring matches its planet's colourway

export const SKIN_COLORS = {
  'p-purple': ['#d9bbff','#b06bff','#6a2fb0'],
  'p-blue':   ['#a9d3ff','#4dabf7','#245f9e'],
  'p-gold':   ['#ffe4a1','#f5b544','#a86f1c'],
  'p-green':  ['#93ffcb','#34d399','#1a7a55'],
  'p-red':    ['#ffb0a1','#ff6b5d','#a8362c'],
  'p-olive':  ['#cdf59d','#82c34a','#4a7527'],
};

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));   // ~137.5° — spaces planets evenly at any count

export const SIZE_VAR = [1.0, 0.86, 0.98, 0.82, 1.06, 0.9, 0.94, 0.84];  // gentle natural size variety
