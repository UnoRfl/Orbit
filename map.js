/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { Fragment, h, html, useEffect, useRef, useState } from './lib.js';
import { B, DAYS, EMOJI_SUGGESTIONS, Glyph, GlyphTile, Sym, glyphLabel, toGlyph, I, IcBack, IcChat, IcCheck, IcPlus, IcRadio, IcSend, IcTrash, IcUsers, IcX, KINDS, LOG_TAGS, evSort, evUpcoming, whenLabel, SYSTEM_GLYPHS, SYSTEM_HUES, ago, decodePlace, encodePlace, fmt, fname, genId, hueCss, loadSystems, normName, nowInfo, planetsOf, presencePlace, saveSystems, seedSystems, store, systemPhrase, ui } from './core.js';
import { Avatar, Eyebrow, Sheet, Toggle, You, statusOf } from './components.js';
import { GeoMap, canUseGeoMap } from './geomap.js';
import { Galaxy } from './galaxy.js';
import { LIVE_DURATIONS, liveOf, untilLabel } from './live.js';
import { Home } from './home.js';
import { ChatView } from './chat.js';

export function MapScreen({ uid, me, friends, profiles, nameOf, presence, myPres, setPres, live, classesBy, events, respondInvite,
                     shared, actions, onNewCosmic, onOpenEvent, onOpenFriend, chat }) {
  const [localSys, setLocalSys] = useState(loadSystems);          // campus extras live on-device
  const [activeKey, setActiveKey] = useState(null);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);   // {t:'newsys'} | {t:'addplanet'} | {t:'people'}
  /* Orbit view (the orrery) vs Map view (real coordinates). Remembered per
     device, and forced back to the orrery on hardware that can't take
     MapLibre so the tab always renders something. */
  const geoOk = canUseGeoMap();

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
  /* Friends broadcasting live coordinates right now. liveOf() re-checks ghost,
     sharing and expiry client-side, so an expired row can never draw even if
     realtime delivered it a moment before it lapsed. */
  const liveFriends = friends
    .map(f => ({ profile: profiles[f.id] || f, live: liveOf(presence[f.id]) }))
    .filter(x => x.live);
  /* `live` is a prop now — the watch belongs to the shell so it survives tab
     switches. See the comment on useLiveShare's call site in shell.js. */
  // my own broadcast, read back through the same rules friends' rows go through
  const meLive = (() => { const l = liveOf(myPres); return l ? { profile: me || { id: uid }, live: l } : null; })();
  const friendsOnPlanet = (sys, planet) => friendPlaces.filter(x=>
    (x.d.pi && planet.id && x.d.pi===planet.id) || (matchSys(x.d, sys) && normName(x.d.place)===normName(planet.name)));

  // if the system I'm inside gets deleted / I get removed, fall back to the grid
  useEffect(()=>{ if(activeKey && !allSystems.find(s=>s.key===activeKey)) { setActiveKey(null); setSel(null); } },[allSystems.length]);

  const commitLocal = next => { setLocalSys(next); saveSystems(next); };
  const addSystem = async spec => { const row = await actions.createSystem(spec); setForm(null); if(row){ setSel(null); setActiveKey(row.id); } };
  const addPlanet = async ({ name, icon, lat=null, lng=null }) => {
    if (!active) return;
    if (active.kind==='campus') {
      commitLocal(localSys.map(s=> s.kind==='campus' ? { ...s, planets:[...(s.planets||[]), { id:genId('p_'), name, icon, lat, lng }] } : s));
    } else {
      await actions.addSharedPlanet(active.key, { name, icon, lat, lng });
    }
    setForm(null);
  };
  /* Give an existing place its coordinates — used by the map's "not on the map
     yet" tray, and by dragging a pin. Same two storage paths as addPlanet. */
  const placeAt = async (planet, lat, lng) => {
    if (!active) return;
    if (active.kind==='campus') {
      commitLocal(localSys.map(s=> s.kind==='campus'
        ? { ...s, planets:(s.planets||[]).map(p=> p.id===planet.id ? { ...p, lat, lng } : p) } : s));
    } else {
      await actions.moveSharedPlanet(planet, lat, lng);
    }
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
          <div class="rowsub">${myD ? `On ${myD.place} · ${myD.system}` : (sharingOn ? 'Open a system and tap a planet to check in' : 'Hidden from everyone')}</div>
        </div>
      </div>
      <button class=${'tgl'+(sharingOn?' on':'')} aria-label="Toggle sharing" onClick=${()=>setPres({ sharing:!sharingOn, ghost:false })}><span></span></button>
    </div>
    <button class=${'btn btn-block'} style=${`margin-top:14px;${myPres?.ghost?'border-color:var(--major);background:rgba(176,107,255,.14)':''}`}
      onClick=${()=>setPres({ ghost:!myPres?.ghost })}>
      <${Glyph} k="ghost" size=${15}/> ${myPres?.ghost ? "Ghost mode on — you're invisible" : 'Ghost mode'}
    </button>

    ${/* Live location lives in the same card as the other location controls,
          so everything that reveals where you are is in one place. */''}
    <div class="livebox">
      ${live.active ? html`<${Fragment}>
        <div class="liverow">
          <span class="livepulse"></span>
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:600">Live location on</div>
            <div class="rowsub">${untilLabel(live.until)}${live.accuracy ? ` · accurate to about ${Math.round(live.accuracy)}m` : ''}</div>
          </div>
          <button class="btn btn-soft-red" style="flex:none;padding:8px 12px" onClick=${()=>live.stop('Live location off')}>Stop</button>
        </div>
        <div class="set-hint" style="margin-top:8px">Only your accepted friends can see it, and it ends on its own. It pauses when Orbit is closed or your screen locks — a website can't track in the background.</div>
      <//>` : html`<${Fragment}>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="display:flex;color:var(--faint)"><${IcRadio} size=${16}/></span>
          <div style="min-width:0;flex:1">
            <div style="font-size:13px;font-weight:600">Live location</div>
            <div class="rowsub">Show friends where you are, moving, for a set time</div>
          </div>
        </div>
        <div class="pillrow" style="margin-top:10px">
          ${LIVE_DURATIONS.map(d=>html`<button key=${d.min} class="pill" disabled=${!!myPres?.ghost}
            onClick=${()=>live.start(d.min)}>${d.label}</button>`)}
        </div>
        ${myPres?.ghost && html`<div class="set-hint" style="margin-top:8px">Turn ghost mode off first — it hides you from everyone.</div>`}
        ${live.err && html`<div class="errbox" style="margin-top:10px">${live.err}</div>`}
      <//>`}
    </div>
  </div>`;

  const sheets = html`<${Fragment}>
    <${Sheet} open=${form?.t==='newsys'} onClose=${()=>setForm(null)} accent="var(--major)">
      ${form?.t==='newsys' && html`<${NewSystemForm} onSave=${addSystem} onClose=${()=>setForm(null)} />`}
    <//>
    <${Sheet} open=${form?.t==='addplanet'} onClose=${()=>setForm(null)} accent="var(--ge)">
      ${form?.t==='addplanet' && active && html`<${AddPlanetForm} system=${active}
        at=${Number.isFinite(form.lat) ? { lat:form.lat, lng:form.lng } : null}
        onSave=${spec=>addPlanet({ ...spec, lat:form.lat ?? null, lng:form.lng ?? null })}
        onClose=${()=>setForm(null)} />`}
    <//>
    <${Sheet} open=${form?.t==='people'} onClose=${()=>setForm(null)} accent="var(--major)">
      ${form?.t==='people' && active && active.kind==='shared' && html`<${SystemPeople} sys=${active} uid=${uid} me=${me}
        friends=${friends} profiles=${profiles} nameOf=${nameOf} actions=${actions} onClose=${()=>setForm(null)} />`}
    <//>
  <//>`;

  /* ============ GRID: pick a solar system ============ */
  const ndG = nowInfo();
  const sysByKey = Object.fromEntries(shared.accepted.map(s=>[s.key,s]));
  const cosmicAll = events.filter(e=>e.system_id && sysByKey[e.system_id] && evUpcoming(e)).sort(evSort).slice(0,6);
  if (!active) {
    return html`<div>
      <${Eyebrow} color="var(--ge)">Your galaxy<//>
      <${Galaxy} uid=${uid} me=${me} systems=${allSystems} invites=${shared.invited} myD=${myD}
        matchSys=${matchSys} friendsInSys=${friendsInSys} events=${cosmicAll} nameOf=${nameOf}
        onOpen=${key=>{ setActiveKey(key); setSel(null); }}
        onNew=${()=>setForm({t:'newsys'})}
        onRespondInvite=${actions.respondSystemInvite}
        onDelete=${async sys=>{ if(await ui.confirm({ title:`Delete ${sys.name}?`, body:'Removes the system for everyone.', confirmLabel:'Delete', danger:true })) actions.deleteSystem(sys.key); }}
        onLeave=${async sys=>{ if(await ui.confirm({ title:`Leave ${sys.name}?`, confirmLabel:'Leave', danger:true })) actions.leaveSystem(sys.key); }}
        onOpenFriend=${onOpenFriend} onOpenEvent=${onOpenEvent}/>

      ${cosmicAll.length>0 && html`<div style="margin-top:22px">
        <${Eyebrow} color="var(--nstp)">Coming up in your systems<//>
        <div class="stack" style="margin-top:10px">
          ${cosmicAll.map(e=>{ const K = KINDS[e.kind]||KINDS.hangout; const s = sysByKey[e.system_id];
            return html`<button key=${e.id} class="cardrow" onClick=${()=>onOpenEvent(e)}>
              <${GlyphTile} k=${e.emoji||K.emoji} hue=${s.hue} size=${34}/>
              <div style="min-width:0;flex:1">
                <div class="rowname">${e.title}</div>
                <div class="rowsub">${whenLabel(e)}${e.place?` · ${e.place}`:''}</div>
                <div class="uporigin"><span class="gi" style=${`color:${hueCss(s.hue)}`}><${Sym} v=${s.glyph} size=${12} fallback="planet"/> ${s.name}</span><span>·</span><span>set up by ${e.host===uid?'you':nameOf(e.host)}</span></div>
              </div>
            </button>`;})}
        </div>
      </div>`}

      ${friendPlaces.length>0 && html`<div style="margin-top:22px">
        <${Eyebrow}>Orbiting right now<//>
        <div class="stack" style="margin-top:10px">
          ${friendPlaces.map(({f,d})=>html`<button key=${f.id} class="cardrow" onClick=${()=>onOpenFriend(f.id)}>
            <${Avatar} p=${f} size=${36}/>
            <div style="min-width:0;flex:1">
              <div class="rowname">${fname(f)} · <span class="gi" style="color:var(--major)"><${Sym} v=${d.emoji} size=${13}/> ${d.place}</span></div>
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

  /* ============ DETAIL: one system's places ============ */
  /* The orrery is gone — a system opens straight onto the real map. Everything
     that used to fall out of its layout pass (who is standing where, whether
     that includes you) is all the detail panel below ever needed. */
  const placeInfo = p => ({
    planet: p,
    meHere: !!(sharingOn && myD &&
      ((myD.pi && myD.pi === p.id) || (matchSys(myD, active) && normName(myD.place) === normName(p.name)))),
    faces: friendsOnPlanet(active, p),
  });
  const P = planetsOf(active).length;
  const emptySys = P===0;
  const nd0 = nowInfo();
  const cosmic = active.kind==='shared'
    ? events.filter(e=>e.system_id===active.key && evUpcoming(e)).sort(evSort).slice(0,4)
    : [];

  return html`<div>
    <div class="syshead">
      <button class="sysback" onClick=${()=>{ setActiveKey(null); setSel(null); }}><${IcBack} size=${15}/> Systems</button>
      <div class="systitle gi"><${GlyphTile} k=${active.glyph} hue=${active.hue} size=${30}/> ${active.name}</div>
      ${active.kind==='shared' && html`<button class="sysedit" style="padding:8px 10px;position:relative" aria-label="System chat"
        onClick=${()=>chat.setSel(chat.sel?.scope==='sys'&&chat.sel.ref===active.key ? null : { scope:'sys', ref:active.key })}>
        <${IcChat} size=${15}/>${(chat.ov['sys:'+active.key]?.n||0)>0 && !chat.reads['sys:'+active.key]?.muted && html`<span class="nbadge">${chat.ov['sys:'+active.key].n}</span>`}</button>`}
      ${active.kind==='shared' && html`<button class="sysedit" style="padding:8px 10px" onClick=${()=>setForm({t:'people'})} aria-label="Members"><${IcUsers} size=${15}/></button>`}
      ${canAdd && html`<button class="sysedit" style="padding:8px 10px" onClick=${()=>setForm({t:'addplanet'})} aria-label="Add a place"><${IcPlus} size=${15}/></button>`}
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-top:-6px;margin-bottom:12px;flex-wrap:wrap">
      <div class="hint" style="margin:0;flex:1;min-width:160px">${canAdd
        ? 'Tap the map to pin a place. Tap a pin to see who’s there and check in.'
        : 'Tap a pin to see who’s there and check in.'}</div>
    </div>

    ${geoOk ? html`<${GeoMap} key=${'geo:'+active.key} system=${active}
        places=${planetsOf(active)} canAdd=${!!canAdd} myPlanetId=${myD?.pi||null}
        liveFriends=${liveFriends} onOpenFriend=${onOpenFriend} live=${live} meLive=${meLive}
        friendsOnPlanet=${p=>friendsOnPlanet(active, p)}
        onOpenPlace=${p=>setSel(p)}
        onPlaceAt=${(p,lat,lng)=>placeAt(p,lat,lng)}
        onAddAt=${(lat,lng)=>setForm({ t:'addplanet', lat, lng })} />`
    : html`<div class="geofail">
        <${Glyph} k="map" size=${28}/>
        <div style="font-weight:600;margin-top:6px">This device can't draw the map</div>
        <div class="hint">Orbit's map needs WebGL, which this browser has switched off or can't do. Your places and check-ins are all still here — the list below works.</div>
      </div>`}

    ${active.kind==='shared' && html`<div style="margin-top:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <${Eyebrow} color="var(--nstp)">Cosmic events<//>
        <button class="sysedit" style="padding:6px 11px" onClick=${()=>onNewCosmic(active)}><span class="gi"><${Glyph} k="comet" size=${13}/> New</span></button>
      </div>
      ${!cosmic.length && html`<div class="small" style="margin-top:8px">Nothing on the calendar — set up a study sesh or a hangout.</div>`}
      <div class="stack" style="margin-top:10px">
        ${cosmic.map(e=>{
          const K = KINDS[e.kind]||KINDS.hangout;
          const going = [e.host, ...(e.event_invitees||[]).filter(i=>i.status==='accepted').map(i=>i.invitee)];
          const myInv = (e.event_invitees||[]).find(i=>i.invitee===uid);
          const mineHost = e.host===uid;
          return html`<div key=${e.id} class="cardrow" style="cursor:default;align-items:flex-start">
            <${GlyphTile} k=${e.emoji||K.emoji} hue=${active.hue} size=${34}/>
            <div style="min-width:0;flex:1" onClick=${()=>onOpenEvent(e)}>
              <div class="rowname">${e.title}</div>
              <div class="rowsub">${whenLabel(e)}${e.place?` · ${e.place}`:''}</div>
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

    ${sel && (()=>{ const found=planetsOf(active).find(x=>x.id===(sel&&sel.id?sel.id:sel)); if(!found) return null;
      const L=placeInfo(found); const p=L.planet; const iAmHere=L.meHere;
      return html`<div style="margin-top:14px">
        <div class="gi" style="gap:10px"><${GlyphTile} k=${p.icon} hue=${active.hue} size=${30}/><${Eyebrow}>${p.name}<//></div>
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
            : html`<button class="btn btn-grad btn-block" onClick=${()=>checkIn(active, p)}><${Glyph} k="pin" size=${15}/> Check in here</button>`}
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
    <div class="glyphgrid">${SYSTEM_GLYPHS.map(g=>html`<button key=${g} class=${'glyphbtn'+(glyph===g?' on':'')} style=${`--th:${hue}`} aria-label=${glyphLabel(g)} title=${glyphLabel(g)} onClick=${()=>setGlyph(g)}><${Glyph} k=${g} size=${20}/></button>`)}</div>
    <div class="flabel">Colour</div>
    <div class="huerow">${SYSTEM_HUES.map(h=>html`<button key=${h} class=${'hueswatch'+(hue===h?' on':'')} style=${`background:${hueCss(h)}`} onClick=${()=>setHue(h)} aria-label="colour"></button>`)}</div>
    <button class="btn btn-grad btn-block" style="margin-top:18px" disabled=${!ok||busy}
      onClick=${async()=>{ setBusy(true); await onSave({ name:name.trim(), glyph, hue }); setBusy(false); }}>${busy?'Creating…':'Create system'}</button>
  </div>`;
}

export function AddPlanetForm({ system, onSave, onClose, at=null }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('pin');
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length > 0;
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Add a place</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px;margin-bottom:4px">A spot you actually go — home, a café, the mall. It becomes a place in ${system?.name}${system?.kind==='shared'?' that the whole circle can see':''}.</div>
    ${at && html`<div class="okbox gi" style="margin-top:10px"><${Glyph} k="pin" size=${14}/> Pinned where you tapped — ${at.lat.toFixed(5)}, ${at.lng.toFixed(5)}</div>`}
    <div class="flabel">Name</div>
    <input class="input" placeholder="e.g. Home, SM Molino, Kuya's café" value=${name} maxLength=${28} onInput=${e=>setName(e.target.value)} />
    <div class="flabel">Icon</div>
    <div class="glyphgrid">${EMOJI_SUGGESTIONS.map(g=>html`<button key=${g} class=${'glyphbtn'+(icon===g?' on':'')} style=${`--th:${system?.hue ?? 265}`} aria-label=${glyphLabel(g)} title=${glyphLabel(g)} onClick=${()=>setIcon(g)}><${Glyph} k=${g} size=${20}/></button>`)}</div>
    <button class="btn btn-grad btn-block" style="margin-top:18px" disabled=${!ok||busy}
      onClick=${async()=>{ setBusy(true); await onSave({ name:name.trim(), icon }); setBusy(false); }}>${busy?'Adding…':'Add planet'}</button>
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
      <div class="glyphgrid">${SYSTEM_GLYPHS.map(g=>html`<button key=${g} class=${'glyphbtn'+(toGlyph(sys.glyph)===g?' on':'')} style=${`--th:${sys.hue}`}
        aria-label=${glyphLabel(g)} title=${glyphLabel(g)} onClick=${()=>actions.updateSystem(sys.key,{ glyph:g })}><${Glyph} k=${g} size=${20}/></button>`)}</div>
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
          <div class="rowsub gi">${m.role==='leader'?html`<${Glyph} k="crown" size=${12}/> Leader`:'Member'}</div>
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

