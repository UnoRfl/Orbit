/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { html, useState } from './lib.js';
import { DAYS, IcBack, IcChat, IcCheck, IcFlag, IcPin, IcPlus, IcSearch, IcTrash, IcX, KINDS, actOf, ago, decodePlace, fmt, fname, nowInfo, presencePlace, sb, shownName, systemPhrase, ui, zoneName } from './core.js';
import { ActivityCard, Avatar, BadgeChips, Bubble, CoverImg, Eyebrow, Grid, LinkChips, NameFx, PinBadge, StatusDot, You, durLabel, fitDur, freeNow, sharedToday, statusOf, winLabel, winMins } from './components.js';

export function Home({ uid, me, friends, classesBy, events, presence, myPres, myInvites=[], onRespond, sysInvites=[], onSysInvite, nameOf, systems=[], onOpenFriend, onYou, onAdd, onMessage, onStudy }) {
  const nd = nowInfo();
  const withStatus = friends.map(f=>({ f, st: statusOf(f.id, classesBy, events) }));
  const inClass = withStatus.filter(x=>x.st.kind!=='free');
  const free = withStatus.filter(x=>x.st.kind==='free');
  const upcoming = events
    .filter(e => e.host===uid || (e.event_invitees||[]).some(i=>i.invitee===uid && i.status==='accepted'))
    .filter(e => e.day>nd.day || (e.day===nd.day && e.end_min>nd.min))
    .sort((a,b)=>a.day-b.day||a.start_min-b.start_min).slice(0,3);
  const noClasses = !(classesBy[uid]||[]).length;
  const sysById = Object.fromEntries((systems||[]).map(s=>[s.key,s]));

  // ---- study loop: shared free windows today (uses only already-loaded data) ----
  const iHaveSched = (classesBy[uid]||[]).length>0;
  const myFree = freeNow(uid, classesBy, events);
  const coStudy = (iHaveSched ? friends.map(f=>{
    const wins = sharedToday(uid, f.id, classesBy, events, null, 30);
    return wins.length ? { f, win:wins[0] } : null;
  }).filter(Boolean).sort((a,b)=> a.win[0]-b.win[0]) : []);
  const liveCo = coStudy.filter(x=> myFree.free && x.win[0]<=nd.min && x.win[1]>nd.min);

  // "in the <system> galaxy" bubble that floats over an avatar when they're sharing a spot
  const myHere = myPres?.sharing && !myPres?.ghost ? decodePlace(myPres?.zone) : null;
  const Bubble = ({ d, salt, color }) => d && d.system ? html`<div class="storybubble" style=${`color:${color}`}>
    <span class="bdot" style=${`background:${color}`}></span>${systemPhrase(d.system, salt)}</div>` : null;

  return html`<div>
    <${Eyebrow}>Your orbit<//>
    <div class="stories">
      <button class="story" onClick=${onYou}>
        <${Bubble} d=${myHere} salt=${'me'} color="var(--ge)"/>
        <div class="ring" style=${`background:linear-gradient(140deg,${me?.accent1||'#b06bff'},${me?.accent2||'#2dd4bf'})`}><div><${Avatar} p=${me} size=${48}/></div></div>
        <div class="story-label">You</div>
      </button>
      <button class="story" onClick=${onAdd}>
        <div class="addbubble"><${IcPlus} size=${20}/></div>
        <div class="story-label">Add</div>
      </button>
      ${withStatus.map(({f,st})=>{
        const here = presencePlace(presence[f.id]);
        return html`<button key=${f.id} class="story" onClick=${()=>onOpenFriend(f.id)}>
        <${Bubble} d=${here} salt=${f.id} color="var(--major)"/>
        <${Avatar} p=${f} size=${48} ring=${st.kind!=='free'?'live':'seen'}
          badge=${st.kind!=='free' ? html`<${StatusDot} color=${st.color}/>` : (here ? html`<${PinBadge}/>` : null)} />
        <div class="story-label">${fname(f)||'—'}</div>
      </button>`;})}
    </div>

    ${(sysInvites.length>0 || myInvites.length>0) && html`<div class="card" style="margin-top:10px;border-color:rgba(245,181,68,.45)">
      <div style="display:flex;align-items:center;gap:7px">
        <span style="font-size:14px">☄️</span>
        <span class="eyebrow" style="color:var(--nstp);letter-spacing:.22em;font-size:10px">Waiting on you</span>
      </div>
      <div class="stack" style="margin-top:10px">
        ${sysInvites.map(({sys,mem})=>html`<div key=${'s'+sys.id} class="cardrow" style="cursor:default">
          <span style="font-size:18px;flex:none">${sys.glyph}</span>
          <div style="min-width:0;flex:1">
            <div class="rowname">${sys.name}</div>
            <div class="rowsub">${nameOf(mem.invited_by)} invited you to this system</div>
          </div>
          <div style="display:flex;gap:6px;flex:none">
            <button class="btn btn-soft-green" style="padding:7px 10px" onClick=${()=>onSysInvite(sys,true)}><${IcCheck} size=${13}/></button>
            <button class="btn" style="padding:7px 10px" onClick=${()=>onSysInvite(sys,false)}><${IcX} size=${13}/></button>
          </div>
        </div>`)}
        ${myInvites.map(e=>{ const K=KINDS[e.kind]||KINDS.hangout; return html`<div key=${e.id} class="cardrow" style="cursor:default">
          <span style="font-size:18px;flex:none">${e.emoji||K.emoji}</span>
          <div style="min-width:0;flex:1">
            <div class="rowname">${e.title}</div>
            <div class="rowsub">${DAYS[e.day]} · ${fmt(e.start_min)}–${fmt(e.end_min)}${e.place?` · ${e.place}`:''}</div>
          </div>
          <div style="display:flex;gap:6px;flex:none">
            <button class="btn btn-soft-green" style="padding:7px 10px" onClick=${()=>onRespond(e.id,'accepted')}><${IcCheck} size=${13}/></button>
            <button class="btn" style="padding:7px 10px" onClick=${()=>onRespond(e.id,'declined')}><${IcX} size=${13}/></button>
          </div>
        </div>`;})}
      </div>
    </div>`}

    ${noClasses && html`<div class="card" style="margin-top:10px;border-color:rgba(176,107,255,.4)">
      <div style="font-weight:600;font-size:13.5px">Add your class schedule</div>
      <div class="hint" style="margin-top:4px">Friends can only see when you're free once your classes are in. Add them by hand — or import a schedule file in two taps.</div>
      <button class="btn btn-grad" style="margin-top:12px" onClick=${onYou}>Open the You tab</button>
    </div>`}

    ${!friends.length && !noClasses && html`<div class="card" style="margin-top:10px">
      <div style="font-weight:600;font-size:13.5px">It's quiet in here</div>
      <div class="hint" style="margin-top:4px">Add friends by their handle and their schedules, pings, and plans light this screen up.</div>
      <button class="btn btn-grad" style="margin-top:12px" onClick=${onAdd}>Find friends</button>
    </div>`}

    <div class="homegrid">
      ${coStudy.length>0 && html`<div style="margin-top:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <${Eyebrow} color="var(--ge)">Free together<//>
          ${myFree.free && html`<span class="livepill"><span class="lpdot"></span>you're free now</span>`}
        </div>
        <div class="stack" style="margin-top:12px">
          ${coStudy.slice(0,4).map(({f,win})=>{
            const live = myFree.free && win[0]<=nd.min && win[1]>nd.min;
            const dur = fitDur(win);
            return html`<div key=${f.id} class=${'costudy'+(live?' live':'')}>
              <button class="costudy-who" onClick=${()=>onOpenFriend(f.id)}>
                <${Avatar} p=${f} size=${38}/>
                <div style="min-width:0;flex:1">
                  <div class="rowname"><${NameFx} p=${f} text=${fname(f)}/></div>
                  <div class="rowsub" style=${live?'color:var(--ge)':''}>${live
                    ? `both free now · until ${fmt(win[1])}`
                    : `free ${winLabel(win)} · ${durLabel(winMins(win))}`}</div>
                </div>
              </button>
              <div class="costudy-act">
                ${onMessage && html`<button class="ghosticon" aria-label=${'Message '+(fname(f)||'')} onClick=${()=>onMessage(f.id)}><${IcChat} size=${15}/></button>`}
                <button class=${'btn'+(live?' btn-grad':'')} style="padding:8px 12px;flex:none;white-space:nowrap"
                  onClick=${()=>onStudy && onStudy(f.id, { day:nd.day, start:win[0], dur })}>${live?'Study now':'Plan'}</button>
              </div>
            </div>`;
          })}
          ${coStudy.length>4 && html`<div class="small" style="padding:1px 2px 0;color:var(--faint)">+${coStudy.length-4} more open window${coStudy.length-4>1?'s':''} with friends today</div>`}
        </div>
      </div>`}
      ${withStatus.length>0 && html`<div style="margin-top:20px">
        <${Eyebrow} color="var(--ge)">Right now<//>
        <div class="stack" style="margin-top:12px">
          ${[...inClass, ...free.slice(0, inClass.length?2:4)].map(({f,st})=>html`
            <button key=${f.id} class="cardrow" onClick=${()=>onOpenFriend(f.id)}>
              <${Avatar} p=${f} size=${38}/>
              <div style="min-width:0;flex:1">
                <div class="rowname"><${NameFx} p=${f} text=${fname(f)}/></div>
                <div class="rowsub" style=${`color:${st.color}`}>${st.text}</div>
              </div>
              ${(()=>{ const d=presencePlace(presence[f.id]); return d && html`<div class="small" style="display:flex;align-items:center;gap:4px;color:var(--faint)">
                <span style="color:var(--ge);display:flex"><${IcPin} size=${11}/></span>${d.emoji} ${d.place}</div>`; })()}
            </button>`)}
        </div>
      </div>`}

      ${upcoming.length>0 && html`<div class="upframe">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <${Eyebrow} color="var(--nstp)">Coming up<//>
          <span class="small">${upcoming.length} on deck</span>
        </div>
        <div style="margin-top:6px">
          ${upcoming.map(e=>{
            const K = KINDS[e.kind]||KINDS.hangout;
            const s = e.system_id ? sysById[e.system_id] : null;
            return html`<div key=${e.id} class="uprow">
              <div style=${`width:40px;height:40px;border-radius:13px;background:${K.accent}22;border:1px solid ${K.accent}55;display:flex;align-items:center;justify-content:center;flex:none;font-size:19px`}>${e.emoji||K.emoji}</div>
              <div style="min-width:0;flex:1">
                <div class="rowname" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${e.title}</div>
                <div class="rowsub">${DAYS[e.day]} · ${fmt(e.start_min)} · ${zoneName(e.place)||e.place||'—'}</div>
                <div class="uporigin">
                  ${s && html`<span style="color:var(--major)">${s.glyph} ${s.name}</span><span>·</span>`}
                  <span>set up by ${e.host===uid ? 'you' : nameOf(e.host)}</span>
                </div>
              </div>
            </div>`;})}
        </div>
      </div>`}
    </div>
  </div>`;
}

/* ============================================================
   FRIEND DASHBOARD
   ============================================================ */

export function FriendDash({ f, uid, classesBy, events, presence, onBack, onPoke, onPing, onPlan, onPick, onReport, onMessage }) {
  const st = statusOf(f.id, classesBy, events);
  const pres = presence[f.id];
  const hereD = presencePlace(pres);
  return html`<div style="animation:pop .2s ease">
    <button class="btn" style="border:none;background:none;padding:0;color:var(--muted);margin-bottom:14px" onClick=${onBack}>
      <${IcBack} size=${17}/> Orbit</button>
    <${CoverImg} p=${f}/>
    <div class="profhead">
      <div class="profav"><${Avatar} p=${f} size=${68}/></div>
      <div style="flex:1"></div>
    </div>
    <div class="profbody" style="margin-bottom:14px">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:#fff;letter-spacing:-.01em;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><${NameFx} p=${f}/><${BadgeChips} p=${f}/></div>
      <div class="rowsub" style="margin-top:2px">@${f.handle}${f.course?` · ${f.course}`:''}${f.school?` · ${f.school}`:''}</div>
      ${f.pronouns && html`<div class="chiprow" style="margin-top:8px"><span class="idchip">💫 <b>${f.pronouns}</b></span></div>`}
      ${f.bio && html`<div class="biotext">${f.bio}</div>`}
      ${Array.isArray(f.hobbies) && f.hobbies.length>0 && html`<div class="chiprow">${f.hobbies.map(hb=>html`<span key=${hb} class="idchip">${hb}</span>`)}</div>`}
    </div>
    ${(actOf(presence[f.id]) || (Array.isArray(f.links) && f.links.length>0)) && html`<div style="margin:-4px 0 16px;display:flex;flex-direction:column;gap:10px">
      ${(()=>{ const a = actOf(presence[f.id]); return a && html`<${ActivityCard} act=${a}/>`; })()}
      ${Array.isArray(f.links) && f.links.length>0 && html`<${LinkChips} links=${f.links}/>`}
    </div>`}
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <div class="card" style="flex:1;padding:11px 13px">
        <div class="flabel" style="margin:0 0 4px">Status</div>
        <div style=${`font-size:12.5px;font-weight:600;line-height:1.3;color:${st.color}`}>${st.text}</div>
      </div>
      <div class="card" style="flex:1;padding:11px 13px">
        <div class="flabel" style="margin:0 0 4px">Location</div>
        <div style=${`font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:5px;color:${hereD?'var(--ge)':'var(--faint)'}`}>
          ${hereD ? html`<${IcPin} size=${13}/>${hereD.emoji} ${hereD.place}` : 'Not sharing'}
        </div>
        ${hereD && hereD.system && html`<div class="small" style="margin-top:3px;color:var(--major)">${systemPhrase(hereD.system, f.id)}</div>`}
        ${hereD && html`<div class="small" style="margin-top:2px">${ago(pres.updated_at)}</div>`}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:18px">
      ${[['💬','Message',onMessage],['👋','Poke',onPoke],['📡','Ping',onPing],['🗓️','Plan',onPlan]].map(([em,lbl,fn])=>html`
        <button key=${lbl} class="btn" style="flex:1;flex-direction:column;gap:5px;padding:12px 8px" onClick=${fn}>
          <span style="font-size:17px">${em}</span><span style="font-size:12px">${lbl}</span></button>`)}
    </div>
    ${(()=>{ const _nd=nowInfo(); const wins=sharedToday(uid, f.id, classesBy, events, null, 30);
      if (!wins.length) return null;
      return html`<div class="card" style="margin-bottom:16px;border-color:rgba(45,212,191,.32);background:linear-gradient(180deg,rgba(45,212,191,.05),var(--panel))">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span class="eyebrow" style="color:var(--ge)">Both free today</span>
          <span class="small" style="color:var(--faint)">off ${fname(f)||'their'}'s schedule</span>
        </div>
        <div class="stack" style="margin-top:11px">
          ${wins.slice(0,3).map(win=>{ const live=_nd.day<=5 && win[0]<=_nd.min && win[1]>_nd.min;
            return html`<div key=${win[0]} style="display:flex;align-items:center;gap:10px">
              <div style="flex:1;min-width:0">
                <div class="rowname" style="font-size:13px">${live?`Right now · until ${fmt(win[1])}`:winLabel(win)}</div>
                <div class="rowsub" style=${live?'color:var(--ge)':''}>${durLabel(winMins(win))} free${live?' together':''}</div>
              </div>
              <button class=${'btn'+(live?' btn-grad':'')} style="padding:8px 12px;flex:none;white-space:nowrap"
                onClick=${()=>onPlan({ day:_nd.day, start:win[0], dur:fitDur(win) })}>${live?'Study now':'Plan'}</button>
            </div>`; })}
        </div>
        ${wins.length>3 && html`<div class="small" style="margin-top:9px;color:var(--faint)">+${wins.length-3} more window${wins.length-3>1?'s':''} today</div>`}
      </div>`;
    })()}
    <button class="btn" style="width:100%;margin:-8px 0 18px;padding:8px;font-size:11px;color:var(--faint);border-style:dashed;border-color:var(--line)"
      onClick=${onReport}><${IcFlag} size=${12}/> Report @${f.handle}</button>
    <${Eyebrow}>${fname(f)||'—'}'s week<//>
    <div style="margin-top:12px">
      ${(classesBy[f.id]||[]).length
        ? html`<${Grid} ownerId=${f.id} classesByOwner=${classesBy} events=${events} onPick=${onPick} compact/>`
        : html`<div class="card"><div class="hint" style="margin:0">${fname(f)||'—'} hasn't added a schedule yet.</div></div>`}
    </div>
  </div>`;
}

/* ============================================================
   FRIENDS SHEET (search, requests, list)
   ============================================================ */

export function FriendsSheet({ uid, graph, profiles, blocks=[], sendRequest, acceptRequest, removeFriendship, onOpen, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    const term = q.trim().replace(/[%,()]/g,'');
    if (term.length<2) { setResults([]); return; }
    setBusy(true);
    const { data } = await sb.from('profiles').select('*')
      .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`).neq('id', uid).limit(8);
    setResults(data||[]); setBusy(false);
  }
  const relOf = id => {
    if (graph.friends.some(r=>r.requester===id||r.addressee===id)) return 'friend';
    if (graph.outgoing.some(r=>r.addressee===id)) return 'sent';
    if (graph.incoming.some(r=>r.requester===id)) return 'incoming';
    return 'none';
  };
  const friendRows = graph.friends.map(r=>({ row:r, p:profiles[r.requester===uid?r.addressee:r.requester] })).filter(x=>x.p);

  return html`<div>
    <div class="sheethead"><div class="sheettitle">Friends</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>

    <div style="display:flex;gap:8px">
      <input class="input" placeholder="Search by handle or name…" value=${q}
        onInput=${e=>setQ(e.target.value)} onKeyDown=${e=>{if(e.key==='Enter')search()}} autocapitalize="none"/>
      <button class="btn" style="flex:none;padding:11px 13px" onClick=${search}><${IcSearch} size=${16}/></button>
    </div>
    ${busy && html`<div class="small" style="margin-top:10px">searching…</div>`}
    ${results && !busy && html`<div class="stack" style="margin-top:12px">
      ${!results.length && html`<div class="small">No one found — check the exact handle with your friend.</div>`}
      ${results.filter(p=>!blocks.includes(p.id)).map(p=>{
        const rel = relOf(p.id);
        return html`<div key=${p.id} class="cardrow" style="cursor:default">
          <${Avatar} p=${p} size=${38}/>
          <div style="min-width:0;flex:1">
            <div class="rowname">${shownName(p)}</div>
            <div class="rowsub">@${p.handle}${p.course?` · ${p.course}`:''}</div>
          </div>
          ${rel==='none' && html`<button class="btn btn-grad" style="padding:8px 13px;flex:none" onClick=${()=>sendRequest(p.id)}>Add</button>`}
          ${rel==='sent' && html`<span class="small" style="flex:none">Requested</span>`}
          ${rel==='incoming' && html`<span class="small" style="flex:none">Check requests ↓</span>`}
          ${rel==='friend' && html`<span class="small" style="color:var(--pe);flex:none">Friends ✓</span>`}
        </div>`;})}
    </div>`}

    ${graph.incoming.length>0 && html`<div>
      <div class="flabel" style="color:var(--now)">Requests · ${graph.incoming.length}</div>
      <div class="stack">
        ${graph.incoming.map(r=>{
          const p = profiles[r.requester];
          return html`<div key=${r.id} class="cardrow" style="cursor:default">
            <${Avatar} p=${p||{display_name:'??'}} size=${38}/>
            <div style="min-width:0;flex:1">
              <div class="rowname">${p?(shownName(p)||'Someone'):'Someone'}</div>
              <div class="rowsub">@${p?.handle||'…'}</div>
            </div>
            <button class="btn btn-soft-green" style="padding:8px 12px;flex:none" onClick=${()=>acceptRequest(r)}><${IcCheck} size=${14}/></button>
            <button class="btn" style="padding:8px 12px;flex:none" onClick=${()=>removeFriendship(r.id)}><${IcX} size=${14}/></button>
          </div>`;})}
      </div>
    </div>`}

    ${graph.outgoing.length>0 && html`<div>
      <div class="flabel">Sent · waiting</div>
      <div class="stack">
        ${graph.outgoing.map(r=>{
          const p = profiles[r.addressee];
          return html`<div key=${r.id} class="cardrow" style="cursor:default;opacity:.85">
            <${Avatar} p=${p||{display_name:'??'}} size=${34}/>
            <div style="min-width:0;flex:1"><div class="rowname" style="font-size:12.5px">${p?(shownName(p)||'Someone'):'Someone'}</div></div>
            <button class="btn" style="padding:7px 11px;font-size:11.5px;flex:none" onClick=${()=>removeFriendship(r.id)}>Cancel</button>
          </div>`;})}
      </div>
    </div>`}

    <div class="flabel">Your friends · ${friendRows.length}</div>
    <div class="stack">
      ${!friendRows.length && html`<div class="small">No friends yet — search a handle above. Tip: tell friends your handle so they can add you too.</div>`}
      ${friendRows.map(({row,p})=>html`<div key=${row.id} class="cardrow" style="cursor:default">
        <button style="display:flex;align-items:center;gap:11px;background:none;border:none;cursor:pointer;flex:1;min-width:0;padding:0;text-align:left" onClick=${()=>onOpen(p.id)}>
          <${Avatar} p=${p} size=${38}/>
          <div style="min-width:0">
            <div class="rowname">${shownName(p)}</div>
            <div class="rowsub">@${p.handle}</div>
          </div>
        </button>
        <button class="btn" style="padding:8px 11px;flex:none" title="Unfriend"
          onClick=${async()=>{ if(await ui.confirm({ title:`Remove ${shownName(p)}?`, body:'They drop off your orbit and you off theirs. You can add each other again anytime.', confirmLabel:'Remove', danger:true })) removeFriendship(row.id); }}><${IcTrash} size=${14}/></button>
      </div>`)}
    </div>
  </div>`;
}

/* ============================================================
   MAP
   ============================================================ */
