/* Orbit — auto-split module. Part of the Orbit single-page app.
   See ARCHITECTURE.md for how the pieces fit together. */
import { Fragment, h, html, render, useEffect, useMemo, useRef, useState } from './lib.js';
import { ACCENTS, B, BADGE_DEFS, BG_IDS, BG_STYLES, CAT, CATHEX, CATNAME, CHAT_BGS, CHAT_FONTS, CHAT_THEMES, DAYS, DEFAULT_PREFS, EMOJI_CATS, EMOJI_SUGGESTIONS, EVENT_EMOJIS, HOBBY_PRESETS, I, IcBack, IcBan, IcBell, IcCal, IcChat, IcCheck, IcClock, IcFlag, IcGear, IcHome, IcImage, IcLock, IcMail, IcMore, IcOut, IcPalette, IcPin, IcPlus, IcRadio, IcSearch, IcSend, IcShield, IcSmile, IcSpark, IcTrash, IcUpload, IcUser, IcUsers, IcWarn, IcX, KINDS, LOG_TAGS, NAME_FX, PING_PRESETS, PRONOUN_PRESETS, PUSH_PUBLIC_KEY, SOCIALS, SYSTEM_GLYPHS, SYSTEM_HUES, TENOR_KEY, THEMES, THEME_IDS, ZONES, actOf, ago, applyTheme, badgesOf, chatKeyOf, cleanHandle, cleanSocial, clockOf, dayLabel, decodePlace, encodePlace, flairOf, fmt, fname, genId, groupBy, hueCss, isMediaUrl, loadSystems, msgPreview, normName, nowInfo, pingChime, planetsOf, presencePlace, roleOf, saveSystems, sb, seedSystems, shownName, store, systemPhrase, ui, uidTail, urlB64ToUint8Array, zoneName } from './core.js';
import { ActivityCard, Avatar, BadgeChips, Eyebrow, Grid, LinkChips, NameFx, PinBadge, PwInput, SetStatusSheet, Sheet, SolarLoader, StatusDot, conflictsFor, durLabel, fitDur, freeNow, sharedToday, statusOf, winLabel, winMins } from './components.js';

export function Shell({ session }) {
  const uid = session.user.id;
  const [fatal, setFatal] = useState('');
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState(null);
  const [myPres, setMyPres] = useState(null);
  const [graph, setGraph] = useState({ friends:[], incoming:[], outgoing:[] });
  const [profiles, setProfiles] = useState({});
  const [classesBy, setClassesBy] = useState({});
  const [events, setEvents] = useState([]);
  const [pings, setPings] = useState([]);
  const [presence, setPresence] = useState({});
  const [tab, setTab] = useState('home');
  const [openFriend, setOpenFriend] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [, setTick] = useState(0);
  const [theme, setThemeState] = useState(store.getTheme());
  const [prefs, setPrefsState] = useState(store.getPrefs());
  const [blocks, setBlocks] = useState(store.getBlocks());
  const [shared, setShared] = useState({ mems:[], systems:[], members:{}, planets:{} });
  const [notifs, setNotifs] = useState([]);
  const [pushOn, setPushOn] = useState(false);
  const [updates, setUpdates] = useState(null);          // null = updates table not migrated yet
  const [staff, setStaff] = useState({ reports: [], log: [] });
  /* ---------- chat state ---------- */
  const [dmThreads, setDmThreads] = useState([]);
  const [chatReads, setChatReads] = useState({});      // key -> my chat_reads row (read state + mute)
  const [chatOv, setChatOv] = useState({});            // key -> { n, last_at, last_sender, last_kind, last_body, last_deleted }
  const [chatMsgs, setChatMsgs] = useState({});        // key -> { rows, hasMore, loaded, peerRead }
  const [chatSel, setChatSel] = useState(null);        // { scope:'dm'|'sys', ref, mod? }
  const [chatDb, setChatDb] = useState(null);          // null = unknown · false = migration not run yet
  const dmRef = useRef(dmThreads); dmRef.current = dmThreads;
  const chatSelRef = useRef(chatSel); chatSelRef.current = chatSel;
  const chatReadsRef = useRef(chatReads); chatReadsRef.current = chatReads;
  const sharedRef = useRef(shared); sharedRef.current = shared;

  const [, setBadgeV] = useState(0);                            // bumped when the badge catalog changes   // reports:null = v5 not migrated
  const [bootSteps, setBootSteps] = useState([
    { k:'you',   label:'your profile',      s:'wait' },
    { k:'orbit', label:'your orbit',        s:'wait' },
    { k:'sched', label:'schedules',         s:'wait' },
    { k:'bg',    label:'the rest of space', s:'wait' },
  ]);
  const blockRef = useRef(blocks); blockRef.current = blocks;
  const profRef = useRef(profiles); profRef.current = profiles;
  const graphRef = useRef(graph); graphRef.current = graph;
  const evRef = useRef(events); evRef.current = events;

  // apply + persist theme
  useEffect(()=>{ applyTheme(theme); store.setTheme(theme); if(booted.current && !applyingRemote.current) syncSettings(); }, [theme]);
  const setTheme = id => setThemeState(id);
  // persist prefs + expose live to the background canvas / auto-theme loop
  useEffect(()=>{ store.setPrefs(prefs); window.__orbit = { ...prefs }; if(booted.current && !applyingRemote.current) syncSettings(); }, [prefs]);
  const setPrefs = p => setPrefsState(p);
  const prefsRef = useRef(prefs); prefsRef.current = prefs;

  /* ---------- cross-device settings sync ---------- */
  const booted = useRef(false);
  const applyingRemote = useRef(false);
  const syncT = useRef(0);
  const syncSettings = () => { clearTimeout(syncT.current); syncT.current = setTimeout(async()=>{
    try{ await sb.from('user_settings').upsert({ user_id:uid, prefs:prefsRef.current, blocks:blockRef.current,
      theme:store.getTheme(), updated_at:new Date().toISOString() }); }catch{}
  }, 700); };
  useEffect(()=>{ if(booted.current && !applyingRemote.current) syncSettings(); }, [blocks]);
  const applyRemoteSettings = row => {
    if (!row) return;
    applyingRemote.current = true;
    if (row.prefs && typeof row.prefs==='object'){ const p={ ...DEFAULT_PREFS, ...row.prefs }; store.setPrefs(p); setPrefsState(p); window.__orbit={ ...p }; }
    if (Array.isArray(row.blocks)){ store.setBlocks(row.blocks); setBlocks(row.blocks); }
    if (row.theme && row.theme!==store.getTheme()){ store.setTheme(row.theme); setThemeState(row.theme); }
    setTimeout(()=>{ applyingRemote.current=false; }, 60);
  };

  // blocking: hide a user everywhere + drop any friendship
  const blockUser = async id => {
    setBlocks(b => { const n = b.includes(id)?b:[...b,id]; store.setBlocks(n); return n; });
    const rel = graphRef.current.friends.find(r=>r.requester===id||r.addressee===id)
             || graphRef.current.incoming.find(r=>r.requester===id)
             || graphRef.current.outgoing.find(r=>r.addressee===id);
    if (rel){ await sb.from('friendships').delete().eq('id', rel.id); const f=await loadGraph(); loadClasses(f); loadPresence(f); }
    toast('Blocked', '🚫');
  };
  const unblockUser = id => setBlocks(b => { const n=b.filter(x=>x!==id); store.setBlocks(n); return n; });

  const toast = (text, em='') => {
    const id = uidTail();
    setToasts(t=>[...t,{id,text,em}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)), 3600);
  };
  useEffect(()=>{ ui.toast = (t,e='')=>toast(t,e); return ()=>{ ui.toast=(t)=>{ try{console.log('[toast]',t);}catch{} }; }; }, []);
  const nameOf = id => id===uid ? 'You' : (profRef.current[id] ? (fname(profRef.current[id])||'Someone') : 'Someone');
  const ensureProfiles = async ids => {
    const need = [...new Set(ids)].filter(i=>i && i!==uid && !profRef.current[i]);
    if (!need.length) return;
    const { data } = await sb.from('profiles').select('*').in('id', need);
    if (data?.length) setProfiles(m=>({ ...m, ...Object.fromEntries(data.map(p=>[p.id,p])) }));
  };
  const refreshProfiles = async ids => {          // force-refetch: badges / suspension just changed
    const want = [...new Set(ids)].filter(Boolean);
    if (!want.length) return;
    const { data } = await sb.from('profiles').select('*').in('id', want);
    if (data?.length) setProfiles(m=>({ ...m, ...Object.fromEntries(data.map(p=>[p.id,p])) }));
  };

  /* ---------- loaders ---------- */
  const friendIdsOf = g => g.friends.map(r=>r.requester===uid?r.addressee:r.requester);

  async function loadMe() {
    const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (error) { if ((error.code==='42P01')||/does not exist/i.test(error.message)) setFatal('db'); return null; }
    if (data) { setMe(data); return data; }
    const fallback = { id:uid, handle:'user_'+uidTail()+uidTail().slice(0,4), display_name:'New Student' };
    const { data:ins } = await sb.from('profiles').insert(fallback).select().maybeSingle();
    setMe(ins||fallback); return ins||fallback;
  }
  async function loadMyPresence() {
    const { data } = await sb.from('presence').select('*').eq('user_id', uid).maybeSingle();
    if (data) { setMyPres(data); return; }
    const { data:ins } = await sb.from('presence').insert({ user_id:uid }).select().maybeSingle();
    setMyPres(ins || { user_id:uid, sharing:false, ghost:false, zone:null });
  }
  async function loadGraph() {
    const { data, error } = await sb.from('friendships').select('*').or(`requester.eq.${uid},addressee.eq.${uid}`);
    if (error) return [];
    const g = {
      friends: data.filter(r=>r.status==='accepted'),
      incoming: data.filter(r=>r.status==='pending' && r.addressee===uid),
      outgoing: data.filter(r=>r.status==='pending' && r.requester===uid),
    };
    setGraph(g);
    await ensureProfiles(data.flatMap(r=>[r.requester,r.addressee]));
    return friendIdsOf(g);
  }
  async function loadClasses(fids) {
    const owners = [uid, ...fids];
    const { data } = await sb.from('classes').select('*').in('owner', owners).order('start_min');
    const by = {}; (data||[]).forEach(c=>{ (by[c.owner]=by[c.owner]||[]).push(c); });
    setClassesBy(by);
  }
  async function loadEvents() {
    const { data } = await sb.from('events').select('*, event_invitees(*)').order('day').order('start_min');
    setEvents(data||[]);
    await ensureProfiles((data||[]).flatMap(e=>[e.host, ...(e.event_invitees||[]).map(i=>i.invitee)]));
  }
  async function loadPings() {
    const { data } = await sb.from('pings').select('*').or(`sender.eq.${uid},recipient.eq.${uid}`)
      .order('created_at',{ascending:false}).limit(60);
    setPings(data||[]);
  }
  async function loadPresence(fids) {
    if (!fids.length) { setPresence({}); return; }
    const { data } = await sb.from('presence').select('*').in('user_id', fids);
    setPresence(Object.fromEntries((data||[]).map(r=>[r.user_id,r])));
  }
  async function loadShared() {
    const { data:mems, error } = await sb.from('system_members').select('*').eq('user_id', uid);
    if (error) return;                                   // migration not run yet — map falls back to campus only
    const ids = [...new Set((mems||[]).map(m=>m.system_id))];
    let systems=[], allMems=[], pls=[];
    if (ids.length) {
      const [r1,r2,r3] = await Promise.all([
        sb.from('systems').select('*').in('id', ids),
        sb.from('system_members').select('*').in('system_id', ids),
        sb.from('planets').select('*').in('system_id', ids),
      ]);
      systems=r1.data||[]; allMems=r2.data||[]; pls=r3.data||[];
    }
    setShared({ mems:mems||[], systems, members:groupBy(allMems,'system_id'), planets:groupBy(pls,'system_id') });
    ensureProfiles(allMems.map(m=>m.user_id).concat(systems.map(s=>s.owner)));
  }
  async function loadNotifs() {
    try{
      await sb.from('notifications').delete().eq('user_id', uid)
        .lt('created_at', new Date(Date.now()-7*864e5).toISOString());   // 7-day sweep
      const { data } = await sb.from('notifications').select('*').eq('user_id', uid)
        .order('created_at',{ascending:false}).limit(100);
      setNotifs(data||[]);
      ensureProfiles((data||[]).map(n=>n.actor));
    }catch{}
  }
  async function loadSettings() {
    try{
      const { data } = await sb.from('user_settings').select('*').eq('user_id', uid).maybeSingle();
      if (data) applyRemoteSettings(data);
    }catch{}
  }
  async function loadUpdates() {
    try{
      const { data, error } = await sb.from('updates').select('*').order('created_at',{ascending:false}).limit(25);
      if (error) { setUpdates(null); return; }            // table missing — mission log stays closed
      setUpdates(data||[]);
      ensureProfiles((data||[]).map(u=>u.author));
    }catch{ setUpdates(null); }
  }
  async function loadChats() {
    try{
      const [t, r, o] = await Promise.all([
        sb.from('dm_threads').select('*').or(`a.eq.${uid},b.eq.${uid}`).order('last_msg_at',{ascending:false}),
        sb.from('chat_reads').select('*').eq('user_id', uid),
        sb.rpc('chat_overview'),
      ]);
      if (t.error) { setChatDb(false); return; }         // chat migration not run yet — tab shows the setup note
      setChatDb(true);
      setDmThreads(t.data||[]);
      setChatReads(Object.fromEntries((r.data||[]).map(x=>[`${x.scope}:${x.ref}`, x])));
      setChatOv(Object.fromEntries((o.data||[]).map(x=>[`${x.scope}:${x.ref}`, x])));
      ensureProfiles((t.data||[]).flatMap(x=>[x.a,x.b]).concat((o.data||[]).map(x=>x.last_sender)));
    }catch{}
  }
  async function loadMsgs(sel, before=null) {
    const key = chatKeyOf(sel);
    let q = sb.from('messages').select('*').order('created_at',{ascending:false}).limit(50);
    q = sel.scope==='dm' ? q.eq('thread_id', sel.ref) : q.eq('system_id', sel.ref);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) return;
    const chunk = (data||[]).slice().reverse();
    let peerRead = null;
    if (sel.scope==='dm' && !before) {
      try{
        const { data:pr } = await sb.from('chat_reads').select('last_read_at').eq('scope','dm').eq('ref', sel.ref).neq('user_id', uid).maybeSingle();
        peerRead = pr?.last_read_at || null;
      }catch{}
    }
    ensureProfiles(chunk.map(m=>m.sender));
    setChatMsgs(m=>{
      const cur = m[key] || { rows:[], hasMore:false, loaded:false, peerRead:null };
      const merged = before ? [...chunk, ...cur.rows] : [...chunk, ...cur.rows.filter(x=>!chunk.some(c=>c.id===x.id) && new Date(x.created_at)>new Date(chunk[chunk.length-1]?.created_at||0))];
      const seen = new Set();
      const rows = merged.filter(x=> seen.has(x.id) ? false : (seen.add(x.id), true));
      return { ...m, [key]: { rows, hasMore: chunk.length===50, loaded:true, peerRead: before ? cur.peerRead : (peerRead ?? cur.peerRead) } };
    });
  }
  // one-time: move any custom systems this device made pre-v3 into Supabase as shared systems
  async function migrateLocalSystems() {
    try{
      if (localStorage.getItem('orbit.systems.migrated')) return;
      const customs = loadSystems().filter(s=>s.kind!=='campus');
      for (const c of customs) {
        const { data:row, error } = await sb.from('systems')
          .insert({ name:c.name, glyph:c.glyph||'🪐', hue:c.hue??265, owner:uid }).select().single();
        if (error) return;                               // migration SQL not run yet — try again next load
        if (row && (c.planets||[]).length)
          await sb.from('planets').insert(c.planets.map(p=>({ system_id:row.id, name:p.name, icon:p.icon||'📍', created_by:uid })));
      }
      saveSystems(loadSystems().filter(s=>s.kind==='campus'));
      localStorage.setItem('orbit.systems.migrated','1');
      if (customs.length) loadShared();
    }catch{}
  }
  /* ---------- boot: critical first, everything else streams in behind the UI ----------
     Every step has a hard timeout + one retry, so a single slow query can
     never hang the loader. Failed non-fatal steps mark ✕ and the app still boots. */
  const withTimeout = (p, ms=8000) => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error('slow')), ms))]);
  const attempt = async (fn, ms) => { try{ return await withTimeout(fn(), ms); }catch{ return await withTimeout(fn(), ms); } };
  const stepSet = (k,s) => setBootSteps(a=>a.map(x=>x.k===k?{...x,s}:x));
  async function loadAll() {
    setBootSteps(a=>a.map(x=>({ ...x, s:'wait' })));
    stepSet('you','run');
    let meRow = null;
    try{ meRow = await attempt(loadMe, 9000); }catch{}
    if (!meRow) { stepSet('you','fail'); return; }     // fatal screen or the Retry button takes it from here
    stepSet('you','ok'); stepSet('orbit','run');
    attempt(loadMyPresence, 7000).catch(()=>{});
    let fids = [];
    try{ fids = (await attempt(loadGraph, 8000)) || []; stepSet('orbit','ok'); }
    catch{ stepSet('orbit','fail'); }
    stepSet('sched','run');
    try{ await attempt(()=>loadClasses(fids), 8000); stepSet('sched','ok'); }
    catch{ stepSet('sched','fail'); }
    // the app is usable now — everything below fills in behind it
    stepSet('bg','run');
    setReady(true);
    booted.current = true;
    Promise.allSettled([loadEvents(), loadPings(), loadPresence(fids), loadShared(), loadNotifs(), loadSettings(), loadUpdates(), loadBadgeDefs(), loadChats()]
      .map(p=>withTimeout(p, 12000)))
      .then(()=>{ stepSet('bg','ok'); migrateLocalSystems(); initPush(); if (roleOf(meRow)) loadStaffData();
        if (badgesOf(meRow).includes('founder')) sb.rpc('chat_retention_sweep').then(()=>{},()=>{});   // 3-month chat sweep
      });
  }

  /* ---------- boot + realtime ---------- */
  useEffect(() => {
    loadAll();
    const timers = {};
    const later = (k, fn, ms=350) => { clearTimeout(timers[k]); timers[k]=setTimeout(fn, ms); };
    const reloadGraphChain = async () => { const f = await loadGraph(); loadClasses(f); loadPresence(f); };

    const ch = sb.channel('orbit-live')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'pings' }, ({ new:p }) => {
        if (blockRef.current.includes(p.sender)) return;
        setPings(x => x.some(q=>q.id===p.id) ? x : [p, ...x]);
        if (p.recipient===uid) {
          if (prefsRef.current.sounds) pingChime();
          ensureProfiles([p.sender]).then(()=> toast(p.kind==='poke' ? `${nameOf(p.sender)} waved at you` : `${nameOf(p.sender)}: ${p.text}`, p.emoji||'👋'));
        }
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'friendships' }, payload => {
        const n = payload.new || {};
        if (payload.eventType==='INSERT' && n.addressee===uid)
          ensureProfiles([n.requester]).then(()=>toast(`Friend request from ${nameOf(n.requester)}`, '👥'));
        if (payload.eventType==='UPDATE' && n.status==='accepted' && n.requester===uid)
          toast(`${nameOf(n.addressee)} accepted your request`, '🎉');
        later('graph', reloadGraphChain);
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'events' }, () => later('events', loadEvents))
      .on('postgres_changes', { event:'*', schema:'public', table:'event_invitees' }, payload => {
        const n = payload.new || {};
        if (payload.eventType==='INSERT' && n.invitee===uid) toast('New plan invite', '📨');
        if (payload.eventType==='UPDATE' && n.status==='accepted' && n.invitee!==uid) {
          const ev = evRef.current.find(e=>e.id===n.event_id);
          if (ev && ev.host===uid) toast(`${nameOf(n.invitee)} is in`, '🎉');
        }
        later('events', loadEvents);
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'presence' }, ({ new:n }) => {
        if (!n || !n.user_id) return;
        if (n.user_id===uid) setMyPres(n);               // reflects auto-checkout when a planet gets deleted
        else setPresence(m=>({ ...m, [n.user_id]:n }));
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'systems' }, () => later('shared', loadShared))
      .on('postgres_changes', { event:'*', schema:'public', table:'system_members' }, () => later('shared', loadShared))
      .on('postgres_changes', { event:'*', schema:'public', table:'planets' }, () => later('shared', loadShared))
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:`user_id=eq.${uid}` }, ({ new:n }) => {
        if (!n) return;
        setNotifs(x => x.some(q=>q.id===n.id) ? x : [n, ...x]);
        if (prefsRef.current.sounds) pingChime();
        ensureProfiles([n.actor]).then(()=> toast(n.title, '🔔'));
        if (document.hidden && typeof Notification!=='undefined' && Notification.permission==='granted' && navigator.serviceWorker)
          navigator.serviceWorker.ready.then(r=>r.showNotification(n.title, { body:n.body||'', icon:'icon.png', badge:'icon.png' })).catch(()=>{});
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'user_settings', filter:`user_id=eq.${uid}` }, ({ new:n }) => {
        if (n) applyRemoteSettings(n);
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'classes' }, () =>
        later('classes', ()=>loadClasses(friendIdsOf(graphRef.current))))
      .subscribe();

    // mission log rides its own channel so a not-yet-migrated table can't take down the live feed
    const ch2 = sb.channel('orbit-log')
      .on('postgres_changes', { event:'*', schema:'public', table:'updates' }, () => later('updates', loadUpdates))
      .subscribe();

    // chat rides its own channel so an un-migrated table can't take down the live feed
    const ch3 = sb.channel('orbit-chat')
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages' }, ({ new:n }) => {
        if (!n) return;
        const key = n.thread_id ? `dm:${n.thread_id}` : `sys:${n.system_id}`;
        const mineConvo = n.thread_id
          ? dmRef.current.some(t=>t.id===n.thread_id)
          : sharedRef.current.mems.some(m=>m.system_id===n.system_id && m.status==='accepted');
        if (!mineConvo) {
          // a brand-new DM someone just opened with me — pull it in
          // (founders also receive other people's chats here; the debounced reload only returns their own)
          if (n.thread_id && n.sender!==uid) later('chats', loadChats, 600);
          return;
        }
        if (blockRef.current.includes(n.sender)) return;
        applyIncoming(n);
        if (n.sender===uid) return;
        const openNow = chatSelRef.current && chatKeyOf(chatSelRef.current)===key && !document.hidden;
        if (openNow || chatReadsRef.current[key]?.muted) return;
        if (prefsRef.current.sounds) pingChime();
        ensureProfiles([n.sender]).then(()=> toast(`${nameOf(n.sender)}: ${n.kind==='text' ? n.body.slice(0,60) : msgPreview(n)}`, '💬'));
      })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'messages' }, ({ new:n }) => {
        if (!n) return;
        const key = n.thread_id ? `dm:${n.thread_id}` : `sys:${n.system_id}`;
        setChatMsgs(m=>{ const b=m[key]; if(!b) return m;
          return { ...m, [key]: { ...b, rows:b.rows.map(x=>x.id===n.id?n:x) } }; });
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'dm_threads' }, ({ new:n }) => {
        if (!n || !n.id || (n.a!==uid && n.b!==uid)) return;
        setDmThreads(t=>{ const i=t.findIndex(x=>x.id===n.id); if(i<0) return [n,...t];
          const c=[...t]; c[i]={ ...c[i], ...n }; return c; });
        ensureProfiles([n.a, n.b]);
      })
      .on('postgres_changes', { event:'*', schema:'public', table:'chat_reads' }, ({ new:n }) => {
        if (!n || n.user_id===uid || n.scope!=='dm') return;     // a DM partner read the chat → "Seen"
        const key = 'dm:'+n.ref;
        setChatMsgs(m=>{ const b=m[key]; if(!b) return m; return { ...m, [key]: { ...b, peerRead:n.last_read_at } }; });
      })
      .subscribe();


    const tick = setInterval(() => {
      setTick(t=>t+1);
      // refresh friend presence periodically (covers friends turning sharing off)
      loadPresence(friendIdsOf(graphRef.current));
    }, 45000);
    const vis = () => { if(!document.hidden){ setTick(t=>t+1); loadPresence(friendIdsOf(graphRef.current)); } };
    document.addEventListener('visibilitychange', vis);
    return () => { sb.removeChannel(ch); sb.removeChannel(ch2); sb.removeChannel(ch3); clearInterval(tick); document.removeEventListener('visibilitychange', vis); };
  }, [uid]);

  /* ---------- mutations ---------- */
  async function sendRequest(otherId) {
    const { error } = await sb.from('friendships').insert({ requester:uid, addressee:otherId });
    if (error) { toast(/duplicate|unique/i.test(error.message) ? 'A request already exists between you two' : 'Could not send request'); }
    else toast('Request sent', '📨');
    const f = await loadGraph(); loadClasses(f); loadPresence(f);
  }
  async function acceptRequest(row) {
    const { error } = await sb.from('friendships').update({ status:'accepted' }).eq('id', row.id);
    if (!error) toast(`You and ${nameOf(row.requester)} are now friends`, '🎉');
    const f = await loadGraph(); loadClasses(f); loadPresence(f);
  }
  async function removeFriendship(id) {
    await sb.from('friendships').delete().eq('id', id);
    const f = await loadGraph(); loadClasses(f); loadPresence(f);
  }
  const pushTo = (target, title, body='') => { try{ sb.functions.invoke('push', { body:{ user_id:target, title, body } }); }catch{} };
  async function notify(target, kind, title, body, data={}) {
    if (!target || target===uid) return;
    try{ await sb.from('notifications').insert({ user_id:target, actor:uid, kind, title, body, data }); }catch{}
    pushTo(target, title, body);
  }
  async function sendPing(otherId, kind, text, emoji) {
    const { error } = await sb.from('pings').insert({ sender:uid, recipient:otherId, kind, text, emoji });
    if (error) toast('Could not send — are you two friends?');
    else {
      toast(kind==='poke' ? `Waved at ${nameOf(otherId)}` : `Sent "${text}"`, emoji);
      const nm = fname(me)||'Someone';
      pushTo(otherId, kind==='poke' ? `${nm} waved at you 👋` : `${nm}: ${text}`);
    }
  }
  async function markSeen() {
    setPings(x=>x.map(p=>p.recipient===uid?{...p,seen:true}:p));
    setNotifs(x=>x.map(n=>n.read?n:{ ...n, read:true }));
    await sb.from('pings').update({ seen:true }).eq('recipient', uid).eq('seen', false);
    try{ await sb.from('notifications').update({ read:true }).eq('user_id', uid).eq('read', false); }catch{}
  }
  async function clearNotifs() {
    setNotifs([]); setPings(x=>x.filter(p=>p.recipient!==uid));
    try{ await sb.from('notifications').delete().eq('user_id', uid); }catch{}
    await sb.from('pings').delete().eq('recipient', uid);
    toast('Signals cleared');
  }
  /* ---------- web push ---------- */
  async function initPush() {
    if (!('serviceWorker' in navigator)) return;
    try{
      const reg = await navigator.serviceWorker.register('sw.js');
      const sub = await reg.pushManager.getSubscription();
      setPushOn(!!sub);
    }catch{}
  }
  async function enablePush() {
    try{
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification==='undefined') {
        toast('Push needs Chrome/Android — or “Add to Home Screen” first on iPhone'); return;
      }
      const perm = await Notification.requestPermission();
      if (perm!=='granted') { toast('Notifications are blocked for Orbit'); return; }
      const reg = await navigator.serviceWorker.register('sw.js');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlB64ToUint8Array(PUSH_PUBLIC_KEY) });
      const j = sub.toJSON();
      const { error } = await sb.from('push_subscriptions').upsert({ user_id:uid, endpoint:sub.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth });
      if (error) { toast('Could not enable push on this device'); return; }
      setPushOn(true); toast('Phone notifications on', '🔔');
    }catch(e){ toast('Could not enable push on this device'); }
  }
  async function disablePush() {
    try{
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    }catch{}
    setPushOn(false); toast('Phone notifications off');
  }
  async function setPres(patch) {
    const row = { user_id:uid, sharing:!!myPres?.sharing, ghost:!!myPres?.ghost, zone:myPres?.zone||null,
                  activity: myPres?.activity ?? null, ...patch, updated_at:new Date().toISOString() };
    setMyPres(row);
    let { data, error } = await sb.from('presence').upsert(row).select().maybeSingle();
    if (error && /activity/i.test(error.message||'')) {
      // activity column not migrated yet — sync the rest, nudge once if a status was being set
      const { activity, ...rest } = row;
      ({ data, error } = await sb.from('presence').upsert(rest).select().maybeSingle());
      if (!error && 'activity' in patch) toast('Could not save your status this time');
    }
    if (error) { toast("Couldn't sync that — try again"); }
    else if (data) setMyPres(data);
  }
  async function createEvent({ kind, title, day, start_min, end_min, place, invitees, system_id=null, emoji=null }) {
    const row = { host:uid, kind, title, day, start_min, end_min, place };
    if (system_id) row.system_id = system_id;
    if (emoji) row.emoji = emoji;
    let { data:ev, error } = await sb.from('events').insert(row).select().single();
    if (error && emoji && /emoji/i.test(error.message||'')) {
      // emoji column not added yet — send the event without it, point at the migration once
      delete row.emoji;
      ({ data:ev, error } = await sb.from('events').insert(row).select().single());
      if (!error) toast('Could not keep the custom emoji');
    }
    if (error && system_id && /system_id/i.test(error.message||'')) { toast('Could not create the plan'); return false; }
    if (error || !ev) { toast('Could not create the plan'); return false; }
    if (invitees.length) {
      const { error:e2 } = await sb.from('event_invitees').insert(invitees.map(i=>({ event_id:ev.id, invitee:i })));
      if (e2) toast('Plan made, but some invites failed');
    }
    toast(system_id ? 'Cosmic event created ☄️' : `Invite sent to ${invitees.map(nameOf).join(' & ')}`, system_id?'':'📨');
    const nm = fname(me)||'Someone';
    invitees.forEach(i=> notify(i, system_id?'cosmic_invite':'event_invite',
      system_id ? `${nm} set up a cosmic event ☄️` : `${nm} invited you to a plan`,
      `${title} · ${DAYS[day]} ${fmt(start_min)}`, { event_id:ev.id, system_id }));
    loadEvents(); return true;
  }
  async function respondInvite(eventId, status) {
    await sb.from('event_invitees').update({ status }).eq('event_id', eventId).eq('invitee', uid);
    toast(status==='accepted' ? "It's on your schedule" : 'Declined', status==='accepted'?'✓':'');
    if (status==='accepted') {
      const ev = evRef.current.find(e=>e.id===eventId);
      if (ev && ev.host!==uid) notify(ev.host, 'event_going', `${fname(me)||'Someone'} is going 🎉`, ev.title, { event_id:eventId });
    }
    loadEvents();
  }
  async function cancelEvent(id) {
    await sb.from('events').delete().eq('id', id);
    toast('Plan cancelled'); setSheet(null); loadEvents();
  }
  /* ---------- mission log (founder only — RLS enforces it) ---------- */
  async function publishUpdate(row) {
    const { error } = await sb.from('updates').insert({ ...row, author:uid });
    if (error) { toast('Could not publish'); return false; }
    toast('Published to everyone', '📡'); loadUpdates(); return true;
  }
  async function deleteUpdate(id) {
    await sb.from('updates').delete().eq('id', id);
    setUpdates(u=>u ? u.filter(x=>x.id!==id) : u);
  }
  /* ---------- mission control (roles enforced by RLS + DB triggers) ---------- */
  async function loadStaffData() {
    try{
      const [r1, r2] = await Promise.all([
        sb.from('reports').select('*').order('created_at', { ascending:false }).limit(50),
        sb.from('mod_actions').select('*').order('created_at', { ascending:false }).limit(40),
      ]);
      if (r1.error) { setStaff({ reports:null, log:[] }); return; }   // v5 not migrated yet
      const reps = r1.data||[], log = r2.data||[];
      setStaff({ reports:reps, log });
      ensureProfiles([...reps.flatMap(r=>[r.reporter, r.target, r.handled_by]),
                      ...log.flatMap(a=>[a.actor, a.target])].filter(Boolean));
    }catch{ setStaff({ reports:null, log:[] }); }
  }
  async function loadBadgeDefs() {
    try{
      const { data } = await sb.from('badge_defs').select('*').order('sort');
      if (!data || !data.length) return;
      for (const d of data) BADGE_DEFS[d.slug] = { label:d.label, icon:d.emoji, color:d.color, tier:d.tier, blurb:d.blurb||'', sort:d.sort };
      for (const k of Object.keys(BADGE_DEFS))
        if (BADGE_DEFS[k].tier!=='power' && !data.some(d=>d.slug===k)) delete BADGE_DEFS[k];
      setBadgeV(v=>v+1);
    }catch{}
  }
  async function modLog(action, target, note='') {
    try{ await sb.from('mod_actions').insert({ actor:uid, action, target, note: note||null }); }catch{}
  }
  async function sendReport(target, reason) {
    const { error } = await sb.from('reports').insert({ reporter:uid, target, kind:'user', reason });
    if (error) {
      toast(/duplicate|unique/i.test(error.message||'') ? 'You already reported them today'
        : 'Could not send the report');
      return false;
    }
    toast('Reported — staff will take a look', '🚩'); return true;
  }
  async function resolveReport(r, status) {
    const { error } = await sb.from('reports').update({ status, handled_by:uid }).eq('id', r.id);
    if (error) { toast('Could not update that report'); return; }
    await modLog('report_'+status, r.target, (r.reason||'').slice(0,80));
    loadStaffData();
  }
  /* suspension + roles go through security-definer RPCs — one call updates the
     profile, writes the immutable mod log, and notifies the member, atomically.
     The DB re-checks every rule, so a tampered client changes nothing. */
  async function suspendUser(target, hours, note='') {
    const ban = !hours;
    const reason = (note||'').trim() || 'Breaking the Orbit rules';
    const { data, error } = await sb.rpc('admin_suspend', { p_target:target, p_hours:ban?0:hours, p_reason:reason });
    if (error) { toast(/founder|staff|yourself|Only/i.test(error.message||'') ? "Your role can't touch that account" : 'Could not apply that'); return false; }
    toast(ban ? 'Banned' : 'Suspended '+hours+'h', '🔨');
    loadStaffData(); refreshProfiles([target]);
    return data || true;
  }
  async function liftUser(target) {
    const { error } = await sb.rpc('admin_unsuspend', { p_target:target });
    if (error) { toast(/founder|staff|Only/i.test(error.message||'') ? "Your role can't touch that account" : 'Could not lift that'); return false; }
    toast('Restrictions lifted', '🕊️'); loadStaffData(); refreshProfiles([target]);
    return { suspended_until:null, ban_reason:null };
  }
  async function grantBadge(target, slug) {
    const { data, error } = await sb.rpc('admin_grant_badge', { p_target:target, p_badge:slug });
    if (error) { toast(/founder|Only/i.test(error.message||'') ? "Your role can't grant that one" : 'Could not grant the badge'); return false; }
    toast('Badge granted', '🎖️'); loadStaffData(); refreshProfiles([target]);
    return data;
  }
  async function revokeBadge(target, slug) {
    const { data, error } = await sb.rpc('admin_revoke_badge', { p_target:target, p_badge:slug });
    if (error) { toast(/founder|Only/i.test(error.message||'') ? "Your role can't remove that one" : 'Could not remove the badge'); return false; }
    toast('Badge removed'); loadStaffData(); refreshProfiles([target]);
    return data;
  }
  async function saveBadgeDef(row) {
    const { error } = await sb.from('badge_defs').insert(row);
    if (error) { toast(/duplicate|unique/i.test(error.message||'') ? 'A badge with that name already exists' : 'Could not create the badge'); return false; }
    toast(`${row.emoji} ${row.label} created`, '🎖️'); loadBadgeDefs();
    return true;
  }
  async function deleteBadgeDef(slug) {
    const { error } = await sb.from('badge_defs').delete().eq('slug', slug);
    if (error) { toast(/power/i.test(error.message||'') ? 'Power roles are fixed' : 'Could not delete that badge'); return; }
    toast('Badge deleted'); loadBadgeDefs();
  }
  /* ---------- shared systems ---------- */
  async function createSystem({ name, glyph, hue }) {
    const { data, error } = await sb.from('systems').insert({ name, glyph, hue, owner:uid }).select().single();
    if (error) { toast('Could not create the system'); return null; }
    toast(`${glyph} ${name} created — you're the leader`, '👑');
    await loadShared(); return data;
  }
  async function deleteSystem(id) {
    const { error } = await sb.from('systems').delete().eq('id', id);
    if (error) toast('Only the leader can delete a system');
    else { toast('System deleted'); loadShared(); }
  }
  async function leaveSystem(id) {
    await sb.from('system_members').delete().eq('system_id', id).eq('user_id', uid);
    const d = decodePlace(myPres?.zone);
    if (d && d.key===id) setPres({ zone:null });
    toast('You left the system'); loadShared();
  }
  async function respondSystemInvite(sys, accept) {
    if (accept) {
      const { error } = await sb.from('system_members').update({ status:'accepted' }).eq('system_id', sys.id).eq('user_id', uid);
      if (!error) { toast(`Welcome to ${sys.name}`, sys.glyph||'🪐');
        notify(sys.owner, 'system_joined', `${fname(me)||'Someone'} joined ${sys.name} 👋`, '', { system_id:sys.id }); }
    } else {
      await sb.from('system_members').delete().eq('system_id', sys.id).eq('user_id', uid);
    }
    loadShared();
  }
  async function inviteToSystem(sysId, friendId, sysName) {
    const { error } = await sb.from('system_members').insert({ system_id:sysId, user_id:friendId, role:'member', status:'invited', invited_by:uid });
    if (error) { toast(/duplicate|unique/i.test(error.message||'') ? 'Already invited' : 'Could not invite'); return; }
    toast(`Invited ${nameOf(friendId)}`, '📨');
    notify(friendId, 'system_invite', `${fname(me)||'Someone'} invited you to a system`, sysName, { system_id:sysId });
    loadShared();
  }
  async function kickMember(sysId, userId) {
    await sb.from('system_members').delete().eq('system_id', sysId).eq('user_id', userId);
    loadShared();
  }
  async function updateSystem(id, patch) {
    const { error } = await sb.from('systems').update(patch).eq('id', id);
    if (error) toast(/leader/i.test(error.message||'') ? 'Only the leader can change that' : 'Could not save');
    loadShared();
  }
  async function addSharedPlanet(sysId, { name, icon }) {
    const { error } = await sb.from('planets').insert({ system_id:sysId, name, icon, created_by:uid });
    if (error) toast('Could not add — the leader may have locked planet-adding');
    loadShared();
  }
  async function delSharedPlanet(p) {
    const { error } = await sb.from('planets').delete().eq('id', p.id);
    if (error) { toast('You can only remove planets you added'); return; }
    const d = decodePlace(myPres?.zone);
    if (d && d.pi===p.id) setPres({ zone:null });
    loadShared();
  }
  const sysActions = { createSystem, deleteSystem, leaveSystem, respondSystemInvite, inviteToSystem, kickMember, updateSystem, addSharedPlanet, delSharedPlanet };

  /* ---------- chat mutations ---------- */
  const applyIncoming = n => {
    const key = n.thread_id ? `dm:${n.thread_id}` : `sys:${n.system_id}`;
    setChatMsgs(m=>{ const b=m[key]; if(!b || !b.loaded) return m;
      if (b.rows.some(x=>x.id===n.id)) return m;
      return { ...m, [key]: { ...b, rows:[...b.rows, n] } }; });
    setChatOv(o=>{
      const cur = o[key] || { n:0 };
      const openNow = chatSelRef.current && chatKeyOf(chatSelRef.current)===key && !document.hidden;
      return { ...o, [key]: { ...cur, scope:n.thread_id?'dm':'sys', ref:n.thread_id||n.system_id,
        n: (n.sender===uid || openNow) ? 0 : (cur.n||0)+1,
        last_at:n.created_at, last_sender:n.sender, last_kind:n.kind,
        last_body:(n.body||'').slice(0,90), last_deleted:n.deleted } };
    });
    if (n.thread_id) setDmThreads(t=>{
      const i = t.findIndex(x=>x.id===n.thread_id); if (i<0) return t;
      const upd = { ...t[i], last_msg_at:n.created_at };
      return [upd, ...t.filter(x=>x.id!==n.thread_id)];
    });
  };
  async function openDm(otherId) {
    try{
      const { data, error } = await sb.rpc('dm_open', { p_other: otherId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row || !row.id) throw new Error('no thread');
      setDmThreads(t=> t.some(x=>x.id===row.id) ? t : [row, ...t]);
      setChatSel({ scope:'dm', ref: row.id });
      setOpenFriend(null); setTab('chats');
    }catch(e){
      const m = e.message||'';
      toast(/not friends/i.test(m) ? 'You can only DM friends'
        : /blocked/i.test(m) ? "One of you has the other blocked"
        : /does not exist|42P01|404/i.test(m) ? 'Chat isn\u2019t set up yet — run the chat migration'
        : 'Could not open the chat');
    }
  }
  async function sendMsg(sel, { kind, body }, peerId=null) {
    const row = { sender:uid, kind, body, [sel.scope==='dm' ? 'thread_id' : 'system_id']: sel.ref };
    const { data, error } = await sb.from('messages').insert(row).select().single();
    if (error) {
      const m = error.message||'';
      toast(/rate limit/i.test(m) ? 'Whoa — slow down a sec'
        : /blocked/i.test(m) ? "You can't message this person"
        : /not friends/i.test(m) ? "You two aren't friends anymore"
        : /suspended/i.test(m) ? 'Your account is restricted right now'
        : /media/i.test(m) ? "That link doesn't look right — https images only"
        : "Message didn't send");
      return false;
    }
    applyIncoming(data);
    if (sel.scope==='dm' && peerId) pushTo(peerId, `${fname(me)||'Someone'} 💬`, data.kind==='text' ? data.body.slice(0,90) : msgPreview(data));
    return true;
  }
  async function unsendMsg(m) {
    const { error } = await sb.from('messages').update({ deleted:true, body:'' }).eq('id', m.id);
    if (error) toast('Could not remove that message');
  }
  async function markChatRead(sel) {
    const key = chatKeyOf(sel);
    const now = new Date().toISOString();
    setChatOv(o=> (o[key]?.n) ? { ...o, [key]: { ...o[key], n:0 } } : o);
    setChatReads(r=>({ ...r, [key]: { ...(r[key]||{ user_id:uid, scope:sel.scope, ref:sel.ref, muted:false }), last_read_at: now } }));
    try{ await sb.from('chat_reads').upsert({ user_id:uid, scope:sel.scope, ref:sel.ref, last_read_at: now }); }catch{}
  }
  async function muteChat(sel, on) {
    const key = chatKeyOf(sel);
    setChatReads(r=>({ ...r, [key]: { ...(r[key]||{ user_id:uid, scope:sel.scope, ref:sel.ref, last_read_at:new Date(0).toISOString() }), muted:on } }));
    try{ await sb.from('chat_reads').upsert({ user_id:uid, scope:sel.scope, ref:sel.ref, muted:on }); }catch{}
    toast(on ? 'Chat muted' : 'Chat unmuted', on ? '🔕' : '🔔');
  }
  async function setDmLook(threadId, look) {
    setDmThreads(t=>t.map(x=>x.id===threadId ? { ...x, look } : x));
    const { error } = await sb.from('dm_threads').update({ look }).eq('id', threadId);
    if (error) toast('Could not save the look'); else toast('Chat look updated', '✨');
  }
  async function setSysLook(sysId, look) {
    const { error } = await sb.rpc('sys_set_chat_look', { p_sys:sysId, p_look:look });
    if (error) { toast(/leader/i.test(error.message||'') ? 'Only the leader can change that' : 'Could not save the look'); return; }
    toast('System chat look updated', '✨'); loadShared();
  }
  async function reportMessage(m, sel, reason) {
    const ref = { message_id:m.id, scope:sel.scope, ref:sel.ref, msg_kind:m.kind, snippet:(m.body||'').slice(0,140) };
    const { error } = await sb.from('reports').insert({ reporter:uid, target:m.sender, kind:'message', reason, ref });
    if (error) { toast(/duplicate|unique/i.test(error.message||'') ? 'You already reported them today' : 'Could not send the report'); return false; }
    toast('Reported — staff will take a look', '🚩'); return true;
  }
  async function loadModThread(threadId) {          // founder-only: pull a thread they're not in (RLS enforces)
    try{
      const { data } = await sb.from('dm_threads').select('*').eq('id', threadId).maybeSingle();
      if (data) ensureProfiles([data.a, data.b]);
      return data || null;
    }catch{ return null; }
  }


  async function addClass(row) {
    const { data, error } = await sb.from('classes').insert({ ...row, owner:uid }).select().single();
    if (error) { toast('Could not add that class'); return false; }
    setClassesBy(m=>({ ...m, [uid]:[...(m[uid]||[]), data].sort((a,b)=>a.start_min-b.start_min) }));
    return true;
  }
  async function delClass(id) {
    setClassesBy(m=>({ ...m, [uid]:(m[uid]||[]).filter(c=>c.id!==id) }));
    await sb.from('classes').delete().eq('id', id);
  }
  async function saveProfile(patch, silent=false) {
    let { data, error } = await sb.from('profiles').update(patch).eq('id', uid).select().maybeSingle();
    if (error && ('school' in patch) && /school/i.test(error.message||'')) {
      // school column not added yet — save the rest, tell them once
      const { school, ...rest } = patch;
      if (Object.keys(rest).length) {
        ({ data, error } = await sb.from('profiles').update(rest).eq('id', uid).select().maybeSingle());
      } else { data=null; error=null; }
      if (!error) toast('Saved — run the school-column SQL in Supabase to store schools');
    }
    if (error && ('flair' in patch) && /flair/i.test(error.message||'')) {
      // flair column not added yet — save the rest, point at the migration once
      const { flair, ...rest } = patch;
      if (Object.keys(rest).length) {
        ({ data, error } = await sb.from('profiles').update(rest).eq('id', uid).select().maybeSingle());
      } else { data=null; error=null; }
      if (!error) toast('Your flair didn’t sync — try again later');
    }
    const V4 = ['avatar_url','avatar_pos','cover_url','cover_pos','bio','pronouns','hobbies','show_full_name','links'];
    if (error && V4.some(k=>k in patch) && /column|schema cache|does not exist/i.test(error.message||'')) {
      // v4 profile columns not added yet — save what the DB knows, point at the migration once
      const rest = { ...patch }; V4.forEach(k=>delete rest[k]);
      if (Object.keys(rest).length) {
        ({ data, error } = await sb.from('profiles').update(rest).eq('id', uid).select().maybeSingle());
      } else { data=null; error=null; }
      if (!error) toast('Run the newest orbit migration to unlock the new profile');
    }
    if (error) { toast(/duplicate|unique/i.test(error.message) ? 'That handle is taken' : 'Could not save'); return false; }
    if (data) { setMe(data); if (!silent) toast('Saved', '✓'); }
    return true;
  }
  async function importClasses(rows, { replace, profilePatch }) {
    if (replace) {
      const { error:de } = await sb.from('classes').delete().eq('owner', uid);
      if (de) { toast('Could not clear your old schedule'); return false; }
    }
    const { error } = await sb.from('classes').insert(rows.map(r=>({ ...r, owner:uid })));
    if (error) { toast('Import failed — the file has values the database rejected'); return false; }
    if (profilePatch) await saveProfile(profilePatch, true);
    await loadClasses(friendIdsOf(graphRef.current));
    toast(`Imported ${rows.length} class${rows.length>1?'es':''}`, '📥');
    return true;
  }
  async function deleteAccount() {
    try {
      await sb.from('classes').delete().eq('owner', uid);
      await sb.from('events').delete().eq('host', uid);
      await sb.from('event_invitees').delete().eq('invitee', uid);
      await sb.from('pings').delete().or(`sender.eq.${uid},recipient.eq.${uid}`);
      await sb.from('friendships').delete().or(`requester.eq.${uid},addressee.eq.${uid}`);
      await sb.from('presence').delete().eq('user_id', uid);
      await sb.from('notifications').delete().eq('user_id', uid);
      await sb.from('push_subscriptions').delete().eq('user_id', uid);
      await sb.from('user_settings').delete().eq('user_id', uid);
      await sb.from('system_members').delete().eq('user_id', uid);
      await sb.from('systems').delete().eq('owner', uid);
      await sb.from('profiles').delete().eq('id', uid);
    } catch(e) { /* best effort — RLS limits deletes to your own rows */ }
    await sb.auth.signOut();
  }

  /* ---------- derived ---------- */
  const friendIds = friendIdsOf(graph).filter(id=>!blocks.includes(id));
  const friends = friendIds.map(id=>profiles[id]).filter(Boolean);
  const unseen = pings.filter(p=>p.recipient===uid && !p.seen && !blocks.includes(p.sender)).length;
  const myInvites = events.filter(e=>(e.event_invitees||[]).some(i=>i.invitee===uid && i.status==='pending'));
  const reqBadge = graph.incoming.filter(r=>!blocks.includes(r.requester)).length;
  const sysById = Object.fromEntries(shared.systems.map(s=>[s.id, s]));
  const sharedAccepted = shared.mems.filter(m=>m.status==='accepted').map(m=>sysById[m.system_id]).filter(Boolean)
    .map(s=>({ key:s.id, kind:'shared', name:s.name, glyph:s.glyph, hue:s.hue, owner:s.owner,
               members_can_add:!!s.members_can_add, members_can_style:!!s.members_can_style, chat_look:s.chat_look||{},
               planets:shared.planets[s.id]||[], members:shared.members[s.id]||[] }));
  const sharedInvited = shared.mems.filter(m=>m.status==='invited').map(m=>({ mem:m, sys:sysById[m.system_id] })).filter(x=>x.sys);
  const unreadN = notifs.filter(n=>!n.read).length;
  const inboxBadge = unseen + unreadN + sharedInvited.length;
  const isFounder = badgesOf(me).includes('founder');
  const myRole = roleOf(me);
  const staffOpenN = myRole && Array.isArray(staff.reports) ? staff.reports.filter(r=>r.status==='open').length : 0;
  const chatsBadge = Object.entries(chatOv).reduce((s,[k,v])=> s + ((chatReads[k]?.muted) ? 0 : (v.n||0)), 0);
  const chatKit = { uid, me, profiles, nameOf, ensureProfiles, blocks, friends, toast, isFounder, db:chatDb,
    threads:dmThreads, reads:chatReads, ov:chatOv, msgs:chatMsgs, sel:chatSel, setSel:setChatSel,
    systems:sharedAccepted, loadMsgs, openDm, sendMsg, unsendMsg, markRead:markChatRead, muteChat,
    setDmLook, setSysLook, reportMsg:reportMessage, blockUser, loadModThread,
    statusOf: id => statusOf(id, classesBy, events),
    onOpenFriend: id => { ensureProfiles([id]); setChatSel(null); setOpenFriend(id); } };


  if (fatal==='db') return html`<div class="authcol"><div class="authwrap">
    <div class="brand">Orbit</div>
    <div class="card" style="margin-top:18px">
      <div style="font-weight:600;font-size:14px">Orbit can’t reach its database</div>
      <div class="hint">Something’s wrong on our side. Wait a moment and reload — if it keeps happening, tell the Orbit team.</div>
    </div></div></div>`;
  if (!ready) return html`<${SolarLoader} note="entering your orbit" steps=${bootSteps} onRetry=${loadAll}/>`;

  // suspended / banned accounts can look, not touch — the DB blocks their
  // writes anyway (v5 triggers); this screen just says so politely
  const suspRaw = me?.suspended_until;
  const isBanned = suspRaw === 'infinity';
  const suspUntil = suspRaw && !isBanned ? new Date(suspRaw) : null;
  if (isBanned || (suspUntil && suspUntil > new Date())) return html`<div class="authcol"><div style="width:min(420px,92vw)">
    <div class="brand-eyebrow">student network</div><div class="brand">Orbit</div>
    <div class="card" style="margin-top:18px;border-color:rgba(255,93,143,.4)">
      <div style="font-weight:700;font-size:15px;font-family:'Space Grotesk',sans-serif">🔒 Account restricted</div>
      <div class="hint" style="margin-top:8px">${isBanned ? 'This account has been banned.' : `Suspended until ${suspUntil.toLocaleString()}.`}${me?.ban_reason ? ` Reason: ${me.ban_reason}` : ''}</div>
      <div class="hint">You can still sign in, but pinging, planning and posting are switched off. If this looks like a mistake, contact the Orbit team.</div>
      <button class="btn btn-block" style="margin-top:12px" onClick=${()=>sb.auth.signOut()}><${IcOut} size=${15}/> Sign out</button>
    </div>
  </div></div>`;

  const friendOpen = openFriend ? profiles[openFriend] : null;

  return html`<div class="appcol">
    <div class="topbar">
      <div><div class="brand-eyebrow">student network</div><div class="brand">Orbit</div></div>
      <div style="display:flex;gap:8px">
        <button class="iconbtn" aria-label="Friends" onClick=${()=>setSheet({t:'friends'})}>
          <${IcUsers} size=${18}/>${reqBadge>0 && html`<span class="nbadge">${reqBadge}</span>`}
        </button>
        <button class=${'iconbtn orb'+(inboxBadge>0?' hot':'')} aria-label="Signals" onClick=${()=>{setSheet({t:'inbox'});}}>
          <${IcBell} size=${18}/>${inboxBadge>0 && html`<span class="nbadge">${inboxBadge}</span>`}
        </button>
        <button class="iconbtn" aria-label="Settings" onClick=${()=>setSheet({t:'settings'})}>
          <${IcGear} size=${18}/>
        </button>
      </div>
    </div>

    <div class="content">
      ${friendOpen ? html`<${FriendDash} f=${friendOpen} uid=${uid} classesBy=${classesBy} events=${events} presence=${presence}
          onBack=${()=>setOpenFriend(null)}
          onPoke=${()=>sendPing(friendOpen.id,'poke','waved at you','👋')}
          onPing=${()=>setSheet({t:'ping', id:friendOpen.id})}
          onPlan=${slot=>setSheet({t:'creator', pre:friendOpen.id, slot:(slot && typeof slot==='object' && 'start' in slot)?slot:undefined})}
          onReport=${()=>setSheet({t:'report', id:friendOpen.id})}
          onMessage=${()=>openDm(friendOpen.id)}
          onPick=${d=>setSheet({t:'detail', d})} />`
      : tab==='home' ? html`<${Home} uid=${uid} me=${me} friends=${friends} classesBy=${classesBy} events=${events} presence=${presence} myPres=${myPres}
          myInvites=${myInvites} onRespond=${respondInvite} sysInvites=${sharedInvited} onSysInvite=${respondSystemInvite} nameOf=${nameOf} systems=${sharedAccepted}
          onOpenFriend=${id=>setOpenFriend(id)} onYou=${()=>setTab('you')} onAdd=${()=>setSheet({t:'friends'})}
          onMessage=${id=>openDm(id)} onStudy=${(fid,slot)=>setSheet({t:'creator', pre:fid, slot})} />`
      : tab==='map' ? html`<${MapScreen} uid=${uid} me=${me} friends=${friends} profiles=${profiles} nameOf=${nameOf}
          presence=${presence} myPres=${myPres} setPres=${setPres} classesBy=${classesBy} events=${events}
          respondInvite=${respondInvite} shared=${{ accepted:sharedAccepted, invited:sharedInvited }} actions=${sysActions}
          onNewCosmic=${s=>setSheet({t:'creator', sys:s})} onOpenEvent=${e=>setSheet({t:'detail', d:{type:'event',row:e}})}
          onOpenFriend=${id=>setOpenFriend(id)}
          updates=${updates} isFounder=${isFounder} publishUpdate=${publishUpdate} deleteUpdate=${deleteUpdate} chat=${chatKit} />`
      : tab==='chats' ? html`<${ChatsScreen} kit=${chatKit} />`
      : tab==='plans' ? html`<${Plans} uid=${uid} events=${events} myInvites=${myInvites} classesBy=${classesBy}
          nameOf=${nameOf} profiles=${profiles} me=${me}
          onRespond=${respondInvite} onNew=${()=>setSheet({t:'creator'})} onOpen=${e=>setSheet({t:'detail', d:{type:'event',row:e}})} />`
      : tab==='staff' && myRole ? html`<${StaffPanel} uid=${uid} me=${me} myRole=${myRole} data=${staff} profiles=${profiles} nameOf=${nameOf}
          reload=${loadStaffData} actions=${{ resolveReport, suspendUser, liftUser, grantBadge, revokeBadge, saveBadgeDef, deleteBadgeDef, notify:toast }}
          openMod=${ref=>{ setChatSel({ scope:ref.scope, ref:ref.ref, mod:true }); setOpenFriend(null); setTab('chats'); }}
          onOpenProfile=${id=>{ ensureProfiles([id]); setOpenFriend(id); }} />`
      : html`<${You} me=${me} uid=${uid} classesBy=${classesBy} events=${events} saveProfile=${saveProfile} myPres=${myPres} setPres=${setPres}
          addClass=${addClass} delClass=${delClass} onPick=${d=>setSheet({t:'detail', d})} onImport=${()=>setSheet({t:'import'})} />`}
    </div>

    <div class="nav"><div class="navin">
      ${[['home','Orbit',IcHome],['map','Map',IcPin],['chats','Chats',IcChat],['plans','Plans',IcCal],['you','You',IcUser],
         ...(myRole ? [['staff','Staff',IcShield]] : [])].map(([id,lbl,Ic])=>{
        const on = tab===id && !friendOpen;
        return html`<button key=${id} class=${'navbtn'+(on?' on':'')} onClick=${()=>{setOpenFriend(null);setTab(id)}}>
          <${Ic} size=${21}/><span>${lbl}</span>
          ${id==='plans' && myInvites.length>0 && html`<span class="navbadge">${myInvites.length}</span>`}
          ${id==='chats' && chatsBadge>0 && html`<span class="navbadge">${chatsBadge>99?'99+':chatsBadge}</span>`}
          ${id==='staff' && staffOpenN>0 && html`<span class="navbadge">${staffOpenN}</span>`}
        </button>`;})}
    </div></div>

    <${Sheet} open=${sheet?.t==='friends'} onClose=${()=>setSheet(null)} accent="var(--ge)">
      <${FriendsSheet} uid=${uid} graph=${graph} profiles=${profiles} blocks=${blocks}
        sendRequest=${sendRequest} acceptRequest=${acceptRequest} removeFriendship=${removeFriendship}
        onOpen=${id=>{setSheet(null);setOpenFriend(id)}} onClose=${()=>setSheet(null)} />
    <//>
    <${Sheet} open=${sheet?.t==='inbox'} onClose=${()=>{setSheet(null);markSeen()}} accent="var(--now)">
      <${Inbox} uid=${uid} pings=${pings.filter(p=>!blocks.includes(p.sender))} notifs=${notifs} events=${events} sysInvites=${sharedInvited}
        profiles=${profiles} nameOf=${nameOf} onClose=${()=>{setSheet(null);markSeen()}} markSeen=${markSeen}
        onRespond=${respondInvite} onSysInvite=${respondSystemInvite} onClear=${clearNotifs}/>
    <//>
    <${Sheet} open=${sheet?.t==='ping'} onClose=${()=>setSheet(null)} accent="var(--ge)">
      ${sheet?.t==='ping' && html`<${PingSheet} f=${profiles[sheet.id]} onSend=${(t,e)=>{sendPing(sheet.id,'ping',t,e);setSheet(null)}} />`}
    <//>
    <${Sheet} open=${sheet?.t==='report'} onClose=${()=>setSheet(null)} accent="var(--now)">
      ${sheet?.t==='report' && html`<${ReportSheet} f=${profiles[sheet.id]} onSend=${r=>sendReport(sheet.id, r)} onClose=${()=>setSheet(null)} />`}
    <//>
    <${Sheet} open=${sheet?.t==='creator'} onClose=${()=>setSheet(null)} accent="var(--major)">
      ${sheet?.t==='creator' && html`<${Creator} uid=${uid} pre=${sheet.pre} sys=${sheet.sys} slot=${sheet.slot} friends=${friends} profiles=${profiles} nameOf=${nameOf}
        classesBy=${classesBy} events=${events}
        onClose=${()=>setSheet(null)} onCreate=${async spec=>{ if(await createEvent(spec)){ setSheet(null); setOpenFriend(null); if(!spec.system_id) setTab('plans'); } }} />`}
    <//>
    <${Sheet} open=${sheet?.t==='detail'} onClose=${()=>setSheet(null)}
      accent=${sheet?.d?.type==='event' ? 'var(--major)' : (sheet?.d ? (CAT[sheet.d.row.cat]||'var(--major)') : 'var(--major)')}>
      ${sheet?.t==='detail' && html`<${Detail} d=${sheet.d} uid=${uid} profiles=${profiles} nameOf=${nameOf} onCancel=${cancelEvent} />`}
    <//>
    <${Sheet} open=${sheet?.t==='import'} onClose=${()=>setSheet(null)} accent="var(--ge)">
      ${sheet?.t==='import' && html`<${ImportSheet} onClose=${()=>setSheet(null)}
        onImport=${async(rows,opts)=>{ const ok=await importClasses(rows,opts); if(ok) setSheet(null); }} />`}
    <//>
    <${Sheet} open=${sheet?.t==='settings'} onClose=${()=>setSheet(null)} accent="var(--major)">
      ${sheet?.t==='settings' && html`<${Settings} me=${me} uid=${uid} saveProfile=${saveProfile}
        myPres=${myPres} setPres=${setPres} theme=${theme} setTheme=${setTheme} prefs=${prefs} setPrefs=${setPrefs}
        blocks=${blocks} profiles=${profiles} friends=${friends} unblock=${unblockUser} block=${blockUser}
        pushOn=${pushOn} enablePush=${enablePush} disablePush=${disablePush}
        onClose=${()=>setSheet(null)} onSignOut=${()=>sb.auth.signOut()}
        onDeleteAccount=${deleteAccount} />`}
    <//>

    <div class="toasts">${toasts.map(t=>html`<div key=${t.id} class="toast">${t.em && html`<span class="em">${t.em}</span>`}${t.text}</div>`)}</div>
  </div>`;
}

/* ============================================================
   HOME
   ============================================================ */
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
export function Plans({ uid, events, myInvites, classesBy, nameOf, profiles, me, onRespond, onNew, onOpen }) {
  const nd = nowInfo();
  const going = e => e.host===uid || (e.event_invitees||[]).some(i=>i.invitee===uid && i.status==='accepted');
  const future = e => e.day>nd.day || (e.day===nd.day && e.end_min>nd.min);
  const confirmed = events.filter(e=>going(e) && future(e)).sort((a,b)=>a.day-b.day||a.start_min-b.start_min);
  const waiting = events.filter(e=>e.host===uid && (e.event_invitees||[]).some(i=>i.status==='pending'));

  return html`<div>
    <div style="display:flex;align-items:center;justify-content:space-between">
      <${Eyebrow} color="var(--nstp)">Plans<//>
      <button class="btn btn-grad" style="border-radius:999px;padding:8px 14px" onClick=${onNew}><${IcPlus} size=${15}/> New plan</button>
    </div>

    ${myInvites.length>0 && html`<div style="margin-top:18px">
      <div class="flabel" style="color:var(--now);margin-top:0">Invites · ${myInvites.length}</div>
      <div class="stack">
        ${myInvites.map(e=>{
          const K = KINDS[e.kind]||KINDS.hangout;
          const conf = conflictsFor(uid, e.day, e.start_min, e.end_min, classesBy, events.filter(x=>x.id!==e.id));
          return html`<div key=${e.id} class="card" style="padding:14px">
            <div style="display:flex;align-items:center;gap:11px">
              <div style=${`width:36px;height:36px;border-radius:10px;background:${K.accent}20;border:1px solid ${K.accent}55;display:flex;align-items:center;justify-content:center;flex:none;font-size:17px`}>${e.emoji||K.emoji}</div>
              <div style="min-width:0;flex:1">
                <div class="rowname" style="font-size:13.5px">${e.title}</div>
                <div class="rowsub">from ${nameOf(e.host)} · ${DAYS[e.day]} ${fmt(e.start_min)}–${fmt(e.end_min)} · ${zoneName(e.place)||e.place||'—'}</div>
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
            <span style="font-size:16px;flex:none">${e.emoji||KINDS[e.kind]?.emoji||'✨'}</span>
            <div style="min-width:0;flex:1">
              <div class="rowname" style="font-size:12.5px">${e.title}</div>
              <div class="rowsub">${DAYS[e.day]} ${fmt(e.start_min)} · waiting on ${pend}</div>
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
              <div style=${`width:36px;height:36px;border-radius:10px;background:${K.accent}20;border:1px solid ${K.accent}55;display:flex;align-items:center;justify-content:center;flex:none;font-size:17px`}>${e.emoji||K.emoji}</div>
              <div style="min-width:0;flex:1">
                <div class="rowname" style="font-size:13.5px">${e.title}</div>
                <div class="rowsub">${DAYS[e.day]} · ${fmt(e.start_min)}–${fmt(e.end_min)} · ${zoneName(e.place)||e.place||'—'}</div>
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
export function Creator({ uid, pre, sys, slot, friends, profiles, nameOf, classesBy, events, onClose, onCreate }) {
  const nd = nowInfo();
  const snap30 = m => Math.min(18*60, Math.max(7*60, Math.round(m/30)*30));
  const [kind, setKind] = useState(sys ? 'study' : (slot ? 'study' : 'coffee'));
  const [emoji, setEmoji] = useState('');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(slot ? Math.min(slot.day,5) : Math.min(nd.day,5));
  const [start, setStart] = useState(slot ? snap30(slot.start) : 15*60);
  const [dur, setDur] = useState(slot ? slot.dur : 90);
  const [place, setPlace] = useState(sys ? '' : 'library');
  const [inv, setInv] = useState(()=> sys
    ? (sys.members||[]).filter(m=>m.status==='accepted' && m.user_id!==uid).map(m=>m.user_id)
    : (pre ? [pre] : []));
  const [busy, setBusy] = useState(false);
  const end = start + dur;
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
    const mine = conflictsFor(uid, day, start, end, classesBy, events);
    if (mine.length) w.push({ who:'You', items:mine });
    inv.forEach(id=>{ const c = conflictsFor(id, day, start, end, classesBy, events); if (c.length) w.push({ who:nmOf(id), items:c }); });
    return w;
  }, [day, start, end, inv, classesBy, events]);

  const times = []; for(let m=7*60; m<=18*60; m+=30) times.push(m);

  return html`<div>
    <div class="sheethead"><div class="sheettitle">${sys ? 'New cosmic event ☄️' : 'New plan'}</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    ${sys && html`<div class="hint" style="margin-top:-8px;margin-bottom:8px">For the ${sys.glyph} ${sys.name} system — members get the invite, and accepting drops it straight onto their schedule.</div>`}

    <div style="display:flex;gap:8px">
      ${Object.entries(KINDS).map(([k,K])=>html`<button key=${k}
        class="btn" style=${`flex:1;flex-direction:column;gap:5px;padding:11px 6px;${kind===k?`background:${K.accent}20;border-color:${K.accent}`:''}`}
        onClick=${()=>setKind(k)}>
        <span style="font-size:17px">${K.emoji}</span>
        <span style=${`font-size:10.5px;${kind===k?'color:var(--ink)':'color:var(--muted)'}`}>${K.label}</span>
      </button>`)}
    </div>

    <div class="flabel">Event emoji</div>
    <div class="pillrow scroll">
      <button class=${'pill'+(!emoji?' on':'')} style="font-weight:600" onClick=${()=>setEmoji('')}>${KINDS[kind].emoji} Auto</button>
      ${EVENT_EMOJIS.map(em=>html`<button key=${em} class=${'pill'+(emoji===em?' on':'')} style="font-size:15px;padding:6px 10px" onClick=${()=>setEmoji(emoji===em?'':em)}>${em}</button>`)}
    </div>

    <div class="flabel">Title · optional</div>
    <input class="input" value=${title} onInput=${e=>setTitle(e.target.value)} placeholder=${finalTitle}/>

    <div class="flabel">Day</div>
    <div class="pillrow scroll">
      ${DAYS.map((d,i)=>html`<button key=${d} class=${'pill'+(day===i?' on':'')} onClick=${()=>setDay(i)} style="font-weight:600">${d}</button>`)}
    </div>

    <div class="formrow">
      <div><div class="flabel">Start</div>
        <select class="input" value=${start} onChange=${e=>setStart(+e.target.value)}>
          ${times.map(m=>html`<option key=${m} value=${m}>${fmt(m)}</option>`)}
        </select></div>
      <div><div class="flabel">Length</div>
        <select class="input" value=${dur} onChange=${e=>setDur(+e.target.value)}>
          ${[30,60,90,120,180].map(d=>html`<option key=${d} value=${d}>${d<60?`${d} min`:`${d/60} hr${d>60?'s':''}`}</option>`)}
        </select></div>
    </div>

    ${(!sys || (sys.planets||[]).length>0) && html`<${Fragment}>
      <div class="flabel">Where${sys?' · optional':''}</div>
      <div class="pillrow">
        ${sys
          ? (sys.planets||[]).map(p=>{ const v=`${p.icon} ${p.name}`;
              return html`<button key=${p.id} class=${'pill'+(place===v?' on-teal':'')} onClick=${()=>setPlace(place===v?'':v)}>${v}</button>`; })
          : ZONES.map(z=>html`<button key=${z.id} class=${'pill'+(place===z.id?' on-teal':'')} onClick=${()=>setPlace(z.id)}>${z.icon} ${z.name}</button>`)}
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
      disabled=${busy || (!sys && !inv.length)}
      onClick=${async()=>{ setBusy(true); await onCreate({ kind, emoji:emoji||null, title:finalTitle, day, start_min:start, end_min:end, place, invitees:inv, system_id: sys?sys.key:null }); setBusy(false); }}>
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
        <span style="font-size:18px">${p.e}</span> ${p.t}</button>`)}
    </div>
  </div>`;
}

export function Inbox({ uid, pings, notifs=[], events=[], sysInvites=[], profiles, nameOf, onClose, markSeen, onRespond, onSysInvite, onClear }) {
  const rows = [
    ...notifs.map(n=>({ t:'n', id:'n'+n.id, at:n.created_at, n })),
    ...pings.filter(p=>p.recipient===uid).map(p=>({ t:'p', id:'p'+p.id, at:p.created_at, p })),
  ].sort((a,b)=> new Date(b.at)-new Date(a.at)).slice(0,80);
  const NICON = { system_invite:'🪐', cosmic_invite:'☄️', event_invite:'📨', event_going:'🎉', system_joined:'👋' };
  const anyUnread = notifs.some(n=>!n.read) || pings.some(p=>p.recipient===uid && !p.seen);
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Signals</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${rows.length>0 && html`<button class="btn" style="padding:7px 11px;font-size:11.5px" onClick=${onClear}>Clear all</button>`}
        <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button>
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
          ${p.emoji && html`<span style="font-size:18px;flex:none">${p.emoji}</span>`}
        </div>`; }
        const n = r.n;
        const sysInv = n.kind==='system_invite' ? sysInvites.find(x=>x.sys.id===(n.data||{}).system_id) : null;
        const ev = (n.kind==='cosmic_invite'||n.kind==='event_invite') ? events.find(e=>e.id===(n.data||{}).event_id) : null;
        const pend = ev && (ev.event_invitees||[]).some(i=>i.invitee===uid && i.status==='pending');
        return html`<div key=${r.id} class="cardrow" style=${'cursor:default;align-items:flex-start;'+(n.read?'':'background:rgba(176,107,255,.08);border-color:rgba(176,107,255,.3)')}>
          <span style="font-size:18px;flex:none;margin-top:2px">${NICON[n.kind]||'🔔'}</span>
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
        <span style="font-size:15px">${e.emoji||K.emoji}</span>
        <span class="eyebrow" style=${`color:${K.accent};letter-spacing:.22em;font-size:10px`}>${K.label}</span>
      </div>
      <div class="sheettitle" style="font-size:20px">${e.title}</div>
      <div style="margin-top:14px">
        <div class="detrow"><span class="detlab">When</span><span class="detval">${DAYS[e.day]} · ${fmt(e.start_min)}–${fmt(e.end_min)}</span></div>
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
export const DAY_IDX = { mon:0, monday:0, tue:1, tues:1, tuesday:1, wed:2, weds:2, wednesday:2,
  thu:3, thur:3, thurs:3, thursday:3, fri:4, friday:4, sat:5, saturday:5 };
export function parseTimeVal(v) {
  if (typeof v==='number' && isFinite(v)) return Math.round(v<24 ? v*60 : v);
  const m = String(v??'').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) throw new Error('bad time');
  let h=+m[1], mm=+(m[2]||0); const ap=(m[3]||'').toLowerCase();
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
  const rows = [], skipped = [];
  src.forEach((c, i) => {
    try {
      const name = String(c.name||c.subject||c.title||'').trim();
      if (!name) throw 0;
      let day = c.day;
      if (typeof day === 'string' && !/^\d+$/.test(day.trim())) {
        const k = day.trim().toLowerCase();
        day = k in DAY_IDX ? DAY_IDX[k] : DAY_IDX[k.slice(0,3)];
      } else day = Number(day);
      if (!(day>=0 && day<=5)) throw 0;
      let s, e;
      if (c.time) { const p = String(c.time).split(/[-–—]/); s = parseTimeVal(p[0]); e = parseTimeVal(p[1]); }
      else { s = parseTimeVal(c.start ?? c.start_min ?? c.from); e = parseTimeVal(c.end ?? c.end_min ?? c.to); }
      if (!(e>s)) throw 0;
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
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
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
export function RichText({ text }) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g);
  return html`${parts.map((p,i)=> i%2
    ? html`<a key=${i} href=${p} target="_blank" rel="noopener noreferrer">${p}</a>`
    : p)}`;
}

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

export function EmojiPop({ onPick, onClose }) {
  const [cat, setCat] = useState(0);
  return html`<div class="chatpop">
    <div class="poptabs">
      ${EMOJI_CATS.map((c,i)=>html`<button key=${i} class=${i===cat?'on':''} onClick=${()=>setCat(i)}>${c[0]}</button>`)}
      <button style="margin-left:auto" onClick=${onClose} aria-label="Close"><${IcX} size=${13}/></button>
    </div>
    <div class="emogrid">${EMOJI_CATS[cat][1].map(e=>html`<button key=${e} onClick=${()=>onPick(e)}>${e}</button>`)}</div>
  </div>`;
}

export function MediaPop({ onSend, onClose }) {
  const [tab, setTab] = useState('img');
  const [url, setUrl] = useState('');
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const ok = isMediaUrl(url);
  const tenor = async path => {
    setBusy(true);
    try{
      const r = await fetch(`https://tenor.googleapis.com/v2/${path}&key=${TENOR_KEY}&limit=24&media_filter=tinygif&contentfilter=medium`);
      const j = await r.json();
      setRes((j.results||[]).map(x=>x.media_formats?.tinygif?.url).filter(Boolean));
    }catch{ setRes([]); }
    setBusy(false);
  };
  useEffect(()=>{ if (tab==='gif' && TENOR_KEY && res===null) tenor('featured?'); }, [tab]);
  const linkPane = (kind, label) => html`<div style="padding:0 10px 10px">
    <input class="input" style="margin:0" placeholder=${'https:// paste ' + (kind==='gif'?'a GIF link':'an image link')}
      value=${url} onInput=${e=>setUrl(e.target.value)} inputmode="url" autocapitalize="none"/>
    ${ok && html`<img class="mediaprev" src=${url.trim()} referrerpolicy="no-referrer" onError=${e=>{ e.target.style.display='none'; }}/>`}
    <button class="btn btn-grad btn-block" style="margin-top:10px" disabled=${!ok}
      onClick=${()=>{ onSend(kind==='gif' || /\.gif($|\?)/i.test(url) ? 'gif' : 'image', url.trim()); setUrl(''); }}>${label}</button>
    <div class="small" style="margin-top:8px;line-height:1.5">${kind==='gif'
      ? 'On Tenor / GIPHY: share → copy GIF link. Built-in search switches on once a free Tenor key is set (TENOR_KEY in the code).'
      : 'Links only — Orbit never stores the file. https images (jpg / png / webp / gif).'}</div>
  </div>`;
  return html`<div class="chatpop">
    <div class="poptabs">
      <button class=${tab==='img'?'on':''} onClick=${()=>setTab('img')}>🖼 Image link</button>
      <button class=${tab==='gif'?'on':''} onClick=${()=>setTab('gif')}>GIF</button>
      <button style="margin-left:auto" onClick=${onClose} aria-label="Close"><${IcX} size=${13}/></button>
    </div>
    ${tab==='img' && linkPane('image','Send image')}
    ${tab==='gif' && (TENOR_KEY ? html`<div style="padding:0 10px 10px">
      <div style="display:flex;gap:8px">
        <input class="input" style="margin:0;flex:1" placeholder="Search Tenor GIFs" value=${q}
          onInput=${e=>setQ(e.target.value)} onKeyDown=${e=>{ if(e.key==='Enter'&&q.trim()) tenor('search?q='+encodeURIComponent(q)); }}/>
        <button class="btn" style="flex:none" disabled=${busy||!q.trim()} onClick=${()=>tenor('search?q='+encodeURIComponent(q))}>${busy?'…':'Go'}</button>
      </div>
      <div class="gifgrid">${(res||[]).map(u=>html`<button key=${u} onClick=${()=>onSend('gif', u)}><img src=${u} loading="lazy" alt="GIF"/></button>`)}</div>
      ${res && !res.length && !busy && html`<div class="small" style="padding:8px 2px">Nothing found.</div>`}
    </div>` : linkPane('gif','Send GIF'))}
  </div>`;
}

export function LookPane({ isDm, look, onSave, onClose }) {
  const [l, setL] = useState({
    theme: look.theme||'nebula', font: look.font||'inter', bg: look.bg||'',
    bgPos: (look.bgPos && typeof look.bgPos==='object') ? look.bgPos : { x:0, y:0, z:1 },
  });
  const [framing, setFraming] = useState(false);
  const th = CHAT_THEMES[l.theme] || CHAT_THEMES.nebula;
  const isImg = isMediaUrl(l.bg);
  const preset = (!isImg && CHAT_BGS[l.bg]) ? CHAT_BGS[l.bg] : '';
  const ff = (CHAT_FONTS[l.font]||CHAT_FONTS.inter).css;
  return html`<div class="chatover" onClick=${e=>{ if(e.target===e.currentTarget) onClose(); }}>
    <div class="chatovercard">
      ${framing && isImg
        ? html`<${ImageAdjust} url=${l.bg.trim()} aspect="2 / 3" pos=${l.bgPos}
            onChange=${np=>setL(v=>({ ...v, bgPos:np }))} onDone=${()=>setFraming(false)}/>`
        : html`
      <div class="sheethead" style="margin-bottom:8px">
        <div class="sheettitle" style="font-size:16px">🎨 Personalize this chat</div>
        <button class="xbtn" onClick=${onClose}><${IcX} size=${15}/></button>
      </div>
      <div class="flabel">Theme · ${th.name}</div>
      <div class="chiprow">${Object.entries(CHAT_THEMES).map(([id,t])=>html`<button key=${id}
        class=${'lookswatch'+(l.theme===id?' on':'')} style=${`background:${t.my}`} aria-label=${t.name}
        onClick=${()=>setL(v=>({ ...v, theme:id }))}></button>`)}</div>
      <div class="flabel">Font</div>
      <div class="chiprow">${Object.entries(CHAT_FONTS).map(([id,f])=>html`<button key=${id}
        class=${'pill'+(l.font===id?' on':'')} style=${`font-family:${f.css}`} onClick=${()=>setL(v=>({ ...v, font:id }))}>${f.name}</button>`)}</div>
      <div class="flabel">Background</div>
      <div class="chiprow">
        <button class=${'lookswatch'+(!l.bg?' on':'')} style="background:var(--canvas)" aria-label="None"
          onClick=${()=>setL(v=>({ ...v, bg:'', bgPos:{ x:0, y:0, z:1 } }))}></button>
        ${Object.entries(CHAT_BGS).map(([id,g])=>html`<button key=${id}
          class=${'lookswatch'+(l.bg===id?' on':'')} style=${`background:${g}`} aria-label=${id}
          onClick=${()=>setL(v=>({ ...v, bg:id }))}></button>`)}
      </div>
      <div class="flabel">Or paste an image / GIF link</div>
      <input class="input" style="margin:0" placeholder="https:// — animated GIFs work too" value=${isImg?l.bg:''}
        onInput=${e=>setL(v=>({ ...v, bg:e.target.value, bgPos:{ x:0, y:0, z:1 } }))} inputmode="url" autocapitalize="none"/>
      ${isImg && html`<button class="btn" style="margin-top:8px;width:100%" onClick=${()=>setFraming(true)}>🖼️ Frame background · drag & zoom</button>`}
      <div class="lookdemo" style=${`font-family:${ff};${preset?`background:${preset}`:''}`}>
        ${isImg && html`<div class="chatbg shade" style=${`--cx:${l.bgPos.x||0}%;--cy:${l.bgPos.y||0}%;--cz:${l.bgPos.z||1}`}>
          <img src=${l.bg.trim()} alt="" referrerpolicy="no-referrer" draggable=${false} onError=${e=>{ e.target.style.display='none'; }}/></div>`}
        <div class="bub them" style="position:relative;z-index:1;align-self:flex-start;cursor:default">preview 👀</div>
        <div class="bub me" style=${`position:relative;z-index:1;align-self:flex-end;cursor:default;background:${th.my}`}>looks like this ✨</div>
      </div>
      <div class="small" style="margin-top:8px">${isDm ? 'Shared look — both of you see it.' : 'Applies for everyone in this system.'}</div>
      <button class="btn btn-grad btn-block" style="margin-top:12px"
        onClick=${()=>onSave({ theme:l.theme, font:l.font, bg:isImg?l.bg.trim():l.bg, bgPos:l.bgPos })}>Save look</button>`}
    </div>
  </div>`;
}

export function ReportMsgPane({ m, onSend, onClose }) {
  const REASONS = ['Harassment or bullying','Hate or violence','Inappropriate / NSFW','Spam or scam','Something else'];
  const [r, setR] = useState(null); const [busy, setBusy] = useState(false);
  return html`<div class="chatover" onClick=${e=>{ if(e.target===e.currentTarget) onClose(); }}>
    <div class="chatovercard">
      <div class="sheethead" style="margin-bottom:8px">
        <div class="sheettitle" style="font-size:16px">🚩 Report message</div>
        <button class="xbtn" onClick=${onClose}><${IcX} size=${15}/></button>
      </div>
      <div class="modsnip" style="margin-top:0">${m.kind==='text' ? `“${m.body.slice(0,140)}”` : `[${m.kind}] ${m.body.slice(0,120)}`}</div>
      <div class="stack" style="margin-top:10px">${REASONS.map(x=>html`<button key=${x} class="cardrow"
        style=${r===x?'border-color:var(--now);background:rgba(255,93,143,.08)':''} onClick=${()=>setR(x)}>
        <span class="rowname" style="font-size:12.5px">${x}</span></button>`)}</div>
      <div class="small" style="margin-top:10px;line-height:1.5">Goes straight to Orbit staff. A founder can open this chat to see the full context.</div>
      <button class="btn btn-block" style="margin-top:12px;border-color:rgba(255,93,143,.45);color:#ff9db8" disabled=${!r||busy}
        onClick=${async()=>{ setBusy(true); await onSend(r); setBusy(false); }}>
        <${IcFlag} size=${13}/> ${busy?'Sending…':'Send report'}</button>
    </div>
  </div>`;
}

export function FriendPickPop({ friends, onPick, onClose }) {
  const [q, setQ] = useState('');
  const list = friends.filter(f=>!q.trim() || ((fname(f)||'')+' '+(f.handle||'')).toLowerCase().includes(q.toLowerCase()));
  return html`<div class="chatover" style="position:fixed;z-index:95" onClick=${e=>{ if(e.target===e.currentTarget) onClose(); }}>
    <div class="chatovercard" style="max-width:440px">
      <div class="sheethead" style="margin-bottom:10px">
        <div class="sheettitle" style="font-size:16px">New message</div>
        <button class="xbtn" onClick=${onClose}><${IcX} size=${15}/></button>
      </div>
      <input class="input" style="margin:0 0 10px" placeholder="Search friends" value=${q} onInput=${e=>setQ(e.target.value)}/>
      <div class="stack" style="max-height:300px;overflow-y:auto">
        ${!list.length && html`<div class="small" style="padding:6px 2px">Only friends can DM each other — add some first.</div>`}
        ${list.map(f=>html`<button key=${f.id} class="cardrow" onClick=${()=>onPick(f.id)}>
          <${Avatar} p=${f} size=${36}/>
          <div style="min-width:0;flex:1"><div class="rowname">${fname(f)}</div><div class="rowsub">@${f.handle}</div></div>
          <${IcChat} size=${15}/></button>`)}
      </div>
    </div>
  </div>`;
}

export function ChatView({ kit, sel, onClose, dock=false }) {
  const { uid, me, profiles, ensureProfiles, threads, systems, reads, msgs, loadMsgs, sendMsg, unsendMsg,
          markRead, muteChat, setDmLook, setSysLook, reportMsg, blockUser, isFounder, statusOf, onOpenFriend, loadModThread } = kit;
  const key = chatKeyOf(sel);
  const isDm = sel.scope==='dm';
  const [modThread, setModThread] = useState(null);
  const thread = isDm ? (threads.find(t=>t.id===sel.ref) || modThread) : null;
  const sys = !isDm ? systems.find(s=>s.key===sel.ref) : null;
  const mod = !!sel.mod && (isDm ? !(thread && (thread.a===uid || thread.b===uid)) : !sys);
  useEffect(()=>{ if (sel.mod && isDm && !threads.some(t=>t.id===sel.ref)) loadModThread(sel.ref).then(setModThread); }, [sel.ref]);

  const peerId = isDm && thread ? (thread.a===uid ? thread.b : thread.a) : null;
  const peer = peerId ? profiles[peerId] : null;
  useEffect(()=>{ if (peerId) ensureProfiles([peerId]); }, [peerId]);

  const bucket = msgs[key] || { rows:[], hasMore:false, loaded:false, peerRead:null };
  const rows = bucket.rows;
  useEffect(()=>{ loadMsgs(sel); }, [key]);

  // mark read on open / new messages / returning to the tab
  const seenLast = useRef(0);
  useEffect(()=>{
    if (mod || !rows.length) return;
    const ts = new Date(rows[rows.length-1].created_at).getTime();
    if (ts > seenLast.current && !document.hidden) { seenLast.current = ts; markRead(sel); }
  }, [rows.length, key]);
  useEffect(()=>{
    const f = ()=>{ if (!document.hidden && rows.length && !mod) markRead(sel); };
    document.addEventListener('visibilitychange', f);
    return ()=>document.removeEventListener('visibilitychange', f);
  }, [key, rows.length]);

  // stick to the bottom unless the reader scrolled up
  const boxRef = useRef(null); const stick = useRef(true);
  useEffect(()=>{ const el=boxRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [rows.length, key, bucket.loaded]);
  const onScroll = e => { const el=e.target; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };
  // media has no height until it loads — re-pin to bottom once it does, if the reader was already there
  const onMedia = () => { const el=boxRef.current; if (el && stick.current) el.scrollTop = el.scrollHeight; };

  const [text, setText] = useState('');
  const [pane, setPane] = useState(null);         // 'emoji' | 'media' | 'menu' | 'look' | 'report:<id>'
  const [selMsg, setSelMsg] = useState(null);
  const [bad, setBad] = useState(()=>new Set());
  const [lightbox, setLightbox] = useState(null);
  const taRef = useRef(null);
  const grow = () => { const el=taRef.current; if(!el) return; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,110)+'px'; };
  const canSend = text.trim().length>0 && text.length<=2000;
  const doSend = async (kind='text', body=null) => {
    const payload = kind==='text' ? text.trim() : body;
    if (!payload) return;
    if (kind==='text') { setText(''); requestAnimationFrame(grow); }
    setPane(null); stick.current = true;
    await sendMsg(sel, { kind, body:payload }, peerId);
    taRef.current?.focus();
  };

  // lightweight typing indicator over realtime broadcast
  const [peerTyping, setPeerTyping] = useState(null);
  const typRef = useRef({ ch:null, last:0, t:0 });
  useEffect(()=>{
    if (mod) return;
    const ch = sb.channel('typing:'+key, { config:{ broadcast:{ self:false } } });
    ch.on('broadcast', { event:'t' }, ({ payload })=>{
      if (!payload || payload.uid===uid) return;
      setPeerTyping(payload.name || 'Someone');
      clearTimeout(typRef.current.t);
      typRef.current.t = setTimeout(()=>setPeerTyping(null), 3500);
    }).subscribe();
    typRef.current.ch = ch;
    return ()=>{ clearTimeout(typRef.current.t); setPeerTyping(null); sb.removeChannel(ch); };
  }, [key]);
  const pingTyping = () => {
    const now = Date.now();
    if (now - typRef.current.last < 2200) return;
    typRef.current.last = now;
    try{ typRef.current.ch?.send({ type:'broadcast', event:'t', payload:{ uid, name:fname(me) } }); }catch{}
  };

  useEffect(()=>{
    const f = e => { if (e.key==='Escape') { if (pane) setPane(null); else onClose(); } };
    addEventListener('keydown', f);
    return ()=>removeEventListener('keydown', f);
  }, [pane]);

  const look = (isDm ? thread?.look : sys?.chat_look) || {};
  const th = CHAT_THEMES[look.theme] || CHAT_THEMES.nebula;
  const ff = (CHAT_FONTS[look.font] || CHAT_FONTS.inter).css;
  const bg = isMediaUrl(look.bg) ? look.bg.trim() : '';
  const bgGrad = (!bg && look.bg && CHAT_BGS[look.bg]) ? CHAT_BGS[look.bg] : '';
  const bgPos = (look.bgPos && typeof look.bgPos==='object') ? look.bgPos : { x:0, y:0, z:1 };
  const canStyle = !mod && (isDm ? !!thread : !!sys && (sys.owner===uid || !!sys.members_can_style));
  const memberN = sys ? (sys.members||[]).filter(m=>m.status==='accepted').length : 0;

  const title = isDm ? (peer ? fname(peer) : '…') : (sys ? `${sys.glyph} ${sys.name}` : 'System chat');
  const st = !mod && isDm && peerId ? statusOf(peerId) : null;
  const subtitle = mod ? 'read-only moderation view'
    : peerTyping ? (isDm ? 'typing…' : `${peerTyping} is typing…`)
    : isDm ? (st?.text || '') : `${memberN} member${memberN===1?'':'s'}`;

  // day separators + sender grouping
  const items = []; let prev = null;
  for (const m of rows) {
    const d = dayLabel(m.created_at);
    if (!prev || dayLabel(prev.created_at)!==d) items.push({ sep:d, id:'s'+m.id });
    const cont = !!prev && prev.sender===m.sender && dayLabel(prev.created_at)===d
      && (new Date(m.created_at)-new Date(prev.created_at)) < 5*60e3;
    items.push({ m, cont }); prev = m;
  }
  const lastMine = [...rows].reverse().find(m=>m.sender===uid && !m.deleted);
  const seen = isDm && !mod && lastMine && bucket.peerRead && rows[rows.length-1]?.sender===uid
    && new Date(bucket.peerRead) >= new Date(lastMine.created_at);

  return html`<div class=${'chatpane'+(dock?' dock':'')} style=${`--mybub:${th.my};--chacc:${th.accent};--chfont:${ff}`}>
    <div class="chathead">
      <button class="xbtn" style="width:32px;height:32px" onClick=${onClose} aria-label="Back"><${IcBack} size=${15}/></button>
      ${isDm
        ? html`<${Avatar} p=${peer||{ id:peerId||'x' }} size=${34}/>`
        : html`<div class="convglyph" style=${`width:34px;height:34px;font-size:16px;${sys?`--sh:${hueCss(sys.hue)}`:''}`}>${sys?.glyph||'🛰️'}</div>`}
      <div style=${`min-width:0;flex:1;${isDm&&peerId&&!mod?'cursor:pointer':''}`} onClick=${()=>{ if (isDm && peerId && !mod) onOpenFriend(peerId); }}>
        <div class="rowname" style="font-size:14px">${title}</div>
        <div class="rowsub" style=${peerTyping ? 'color:var(--ge)' : ''}>${subtitle}</div>
      </div>
      ${!mod && html`<button class="xbtn" style="width:32px;height:32px" onClick=${()=>setPane(pane==='menu'?null:'menu')} aria-label="Chat options"><${IcMore} size=${15}/></button>`}
    </div>
    ${mod && html`<div class="modbar">👁 Founder moderation view — visible because this chat was reported</div>`}

    <div class="chatbody">
      ${bg && html`<div class="chatbg shade" style=${`--cx:${bgPos.x||0}%;--cy:${bgPos.y||0}%;--cz:${bgPos.z||1}`}>
        <img src=${bg} alt="" referrerpolicy="no-referrer" draggable=${false} onError=${e=>{ e.target.style.display='none'; }}/></div>`}
      ${bgGrad && html`<div class="chatbg" style=${`background:${bgGrad}`}></div>`}
      <div class="msgs" ref=${boxRef} onScroll=${onScroll}
        onClick=${()=>setPane(p=>(p==='emoji'||p==='media'||p==='menu')?null:p)}>
      ${bucket.hasMore && html`<button class="pill" style="align-self:center;margin-bottom:10px;flex:none" onClick=${()=>loadMsgs(sel, rows[0]?.created_at)}>↑ Load earlier</button>`}
      ${!bucket.loaded && html`<div class="small" style="align-self:center;padding:24px 0">Loading…</div>`}
      ${bucket.loaded && !rows.length && html`<div class="chatzero">
        <div style="font-size:30px">${isDm?'👋':'🛰️'}</div>
        <div style="font-weight:600;margin-top:6px;font-size:14px">${isDm ? `Say hi to ${title}` : `Welcome to ${sys?.name||'the system'} chat`}</div>
        <div class="hint" style="max-width:270px;margin:6px auto 0">Be kind — Orbit's rules apply here. Chats clear after 3 months, and founders can review a conversation if someone reports it.</div>
      </div>`}
      ${items.map(it=> it.sep
        ? html`<div key=${it.id} class="daysep"><span>${it.sep}</span></div>`
        : html`<${Bubble} key=${it.m.id} m=${it.m} cont=${it.cont} mine=${it.m.sender===uid} group=${!isDm}
            p=${profiles[it.m.sender]} bad=${bad.has(it.m.id)} onBad=${()=>setBad(s=>{ const n=new Set(s); n.add(it.m.id); return n; })}
            selOn=${selMsg===it.m.id} onSel=${()=>setSelMsg(v=>v===it.m.id?null:it.m.id)}
            onUnsend=${()=>{ unsendMsg(it.m); setSelMsg(null); }}
            onReport=${()=>{ setSelMsg(null); setPane('report:'+it.m.id); }}
            canModRemove=${isFounder} onImg=${u=>setLightbox(u)} onImgLoad=${onMedia}
            onOpenSender=${()=>{ if(!mod) onOpenFriend(it.m.sender); }} />`)}
      ${seen && html`<div class="seen">Seen</div>`}
      </div>
    </div>

    ${!mod && html`<div class="composer">
      <button class="cbtn" aria-label="Emoji" onClick=${()=>setPane(pane==='emoji'?null:'emoji')}><${IcSmile} size=${19}/></button>
      <button class="cbtn" aria-label="Image or GIF" onClick=${()=>setPane(pane==='media'?null:'media')}><${IcImage} size=${19}/></button>
      <div class="cfield">
        ${text.length>1800 && html`<span class="ccount">${2000-text.length}</span>`}
        <textarea ref=${taRef} rows="1" value=${text} maxlength="2000" placeholder="Message…"
          onInput=${e=>{ setText(e.target.value); grow(); pingTyping(); }}
          onKeyDown=${e=>{ if (e.key==='Enter' && !e.shiftKey && window.innerWidth>=900) { e.preventDefault(); if (canSend) doSend(); } }}></textarea>
      </div>
      <button class="csend" disabled=${!canSend} onClick=${()=>doSend()} aria-label="Send"><${IcSend} size=${16}/></button>
      ${pane==='emoji' && html`<${EmojiPop} onPick=${em=>{ setText(t=>t+em); requestAnimationFrame(grow); }} onClose=${()=>{ setPane(null); taRef.current?.focus(); }}/>`}
      ${pane==='media' && html`<${MediaPop} onSend=${(kind,u)=>doSend(kind,u)} onClose=${()=>setPane(null)}/>`}
    </div>`}

    ${pane==='menu' && html`<div class="chatmenu">
      ${canStyle && html`<button onClick=${()=>setPane('look')}>🎨 Personalize</button>`}
      <button onClick=${()=>{ muteChat(sel, !(reads[key]?.muted)); setPane(null); }}>${reads[key]?.muted ? '🔔 Unmute' : '🔕 Mute'}</button>
      ${isDm && peerId && html`<button onClick=${()=>{ setPane(null); onOpenFriend(peerId); }}>👤 View profile</button>`}
      ${isDm && peerId && html`<button style="color:#ff9db8" onClick=${async()=>{ setPane(null);
        if (await ui.confirm({ title:`Block ${title}?`, body:"They won't be able to message you, and you won't see their messages.", confirmLabel:'Block', danger:true })) { blockUser(peerId); onClose(); } }}>🚫 Block</button>`}
    </div>`}
    ${pane==='look' && html`<${LookPane} isDm=${isDm} look=${look}
      onSave=${async l=>{ if (isDm) await setDmLook(thread.id, l); else await setSysLook(sel.ref, l); setPane(null); }}
      onClose=${()=>setPane(null)}/>`}
    ${String(pane).startsWith('report:') && (()=>{ const m = rows.find(x=>x.id===String(pane).slice(7));
      return m && html`<${ReportMsgPane} m=${m}
        onSend=${async reason=>{ const ok = await reportMsg(m, sel, reason); if (ok) setPane(null); }}
        onClose=${()=>setPane(null)}/>`; })()}
    ${lightbox && html`<div class="lightbox" onClick=${()=>setLightbox(null)}><img src=${lightbox} referrerpolicy="no-referrer" alt="full size"/></div>`}
  </div>`;
}

export function ChatsScreen({ kit }) {
  const { uid, threads, reads, ov, sel, setSel, systems, profiles, nameOf, blocks, openDm, ensureProfiles, friends, db, isFounder } = kit;
  const [pick, setPick] = useState(false);
  const peerOf = t => t.a===uid ? t.b : t.a;
  useEffect(()=>{ ensureProfiles(threads.map(peerOf)); }, [threads.length]);
  const visible = threads.filter(t=>!blocks.includes(peerOf(t)));
  const kSel = chatKeyOf(sel);
  const pv = k => { const o = ov[k]; if (!o || !o.last_at) return null;
    const who = o.last_sender===uid ? 'You: ' : '';
    return who + (o.last_deleted ? 'unsent a message' : o.last_kind==='text' ? (o.last_body||'') : o.last_kind==='gif' ? 'sent a GIF' : 'sent a photo'); };

  return html`<div class="chatsplit" style="animation:pop .2s ease">
    <div class="chatlist">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <${Eyebrow}>Chats<//>
        <button class="sysedit" style="padding:6px 11px;flex:none" onClick=${()=>setPick(true)}><${IcPlus} size=${12}/> New</button>
      </div>
      ${db===false && html`<div class="card" style="margin-top:12px">
        <div style="font-weight:600;font-size:13px">Chat isn't switched on yet</div>
        <div class="hint">${isFounder ? 'Run orbit_chat_v1.sql in Supabase → SQL editor, then reload.' : 'The Orbit team is setting this up — check back soon.'}</div>
      </div>`}

      ${systems.length>0 && html`<div class="flabel" style="margin-top:14px">System chats</div>`}
      ${systems.length>0 && html`<div class="stack" style="margin-top:8px">
        ${systems.map(s=>{ const k='sys:'+s.key, o=ov[k], un=o?.n||0, mut=reads[k]?.muted;
          return html`<button key=${s.key} class=${'convrow'+(kSel===k?' on':'')} onClick=${()=>setSel({ scope:'sys', ref:s.key })}>
            <div class="convglyph" style=${`--sh:${hueCss(s.hue)}`}>${s.glyph}</div>
            <div style="min-width:0;flex:1">
              <div class="rowname" style=${un&&!mut?'color:#fff':''}>${s.name}${mut?html`<span style="opacity:.5;font-weight:400"> · 🔕</span>`:''}</div>
              <div class="rowsub">${pv(k) || `${(s.members||[]).filter(m=>m.status==='accepted').length} members · say hi`}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none">
              ${o?.last_at && html`<span class="convtime">${ago(o.last_at)}</span>`}
              ${un>0 && !mut && html`<span class="convun">${un>99?'99+':un}</span>`}
            </div>
          </button>`;})}
      </div>`}

      <div class="flabel" style="margin-top:14px">Direct messages</div>
      ${db!==false && !visible.length && html`<div class="small" style="padding:8px 2px;line-height:1.5">No DMs yet — hit <b>New</b>, or 💬 Message on a friend's profile.</div>`}
      <div class="stack" style="margin-top:8px">
        ${visible.map(t=>{ const pid=peerOf(t), p=profiles[pid], k='dm:'+t.id, o=ov[k], un=o?.n||0, mut=reads[k]?.muted;
          return html`<button key=${t.id} class=${'convrow'+(kSel===k?' on':'')} onClick=${()=>setSel({ scope:'dm', ref:t.id })}>
            <${Avatar} p=${p||{ id:pid }} size=${40}/>
            <div style="min-width:0;flex:1">
              <div class="rowname" style=${un&&!mut?'color:#fff':''}>${p?fname(p):'…'}${mut?html`<span style="opacity:.5;font-weight:400"> · 🔕</span>`:''}</div>
              <div class="rowsub">${pv(k) || 'Say hi 👋'}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none">
              ${o?.last_at && html`<span class="convtime">${ago(o.last_at)}</span>`}
              ${un>0 && !mut && html`<span class="convun">${un>99?'99+':un}</span>`}
            </div>
          </button>`;})}
      </div>
      <div class="small" style="margin-top:16px;line-height:1.6">Friends-only DMs · links instead of uploads · chats auto-clear after 3 months. Reported chats can be reviewed by Orbit founders.</div>
    </div>

    ${sel ? html`<${ChatView} key=${kSel} kit=${kit} sel=${sel} onClose=${()=>setSel(null)}/>`
          : html`<div class="chatempty"><div style="font-size:34px">💬</div>
              <div style="font-weight:600;margin-top:8px;color:var(--ink)">Pick a conversation</div>
              <div class="hint">Your DMs and system chats live here.</div></div>`}

    ${pick && html`<${FriendPickPop} friends=${friends} onClose=${()=>setPick(false)}
      onPick=${async id=>{ setPick(false); await openDm(id); }}/>`}
  </div>`;
}

/* report a member — lands in the staff reports queue */
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

export function Settings({ me, uid, saveProfile, myPres, setPres, theme, setTheme, prefs, setPrefs, pushOn, enablePush, disablePush,
                    blocks, profiles, friends, unblock, block, onClose, onDeleteAccount, onSignOut }) {
  const [tab, setTab] = useState('look');
  const [name, setName] = useState(me?.display_name||'');
  const [handle, setHandle] = useState(me?.handle||'');
  const [course, setCourse] = useState(me?.course||'');
  const [school, setSchool] = useState(me?.school||'');
  const [acc, setAcc] = useState([me?.accent1||'#b06bff', me?.accent2||'#2dd4bf']);
  const [flair, setFlair] = useState(flairOf(me));
  const [flairBusy, setFlairBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [pw1, setPw1] = useState(''); const [pw2, setPw2] = useState(''); const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState('');
  const [pickBlock, setPickBlock] = useState(false);
  const [delText, setDelText] = useState('');
  const sharingOn = !!myPres?.sharing && !myPres?.ghost;
  const patch = p => setPrefs({ ...prefs, ...p });

  async function saveAcc(){
    if (handle.length<3){ ui.toast('Handle needs at least 3 characters.'); return; }
    setBusy('acc');
    await saveProfile({ display_name:name.trim()||me.display_name, handle, course:course.trim(), school:school.trim(), accent1:acc[0], accent2:acc[1] });
    setBusy('');
  }
  async function changeEmail(){
    if (!/.+@.+\..+/.test(email.trim())){ ui.toast('Enter a valid email.'); return; }
    setBusy('email');
    const { error } = await sb.auth.updateUser({ email:email.trim() });
    setBusy('');
    if (error) ui.toast(error.message); else { setEmail(''); ui.toast('Check both inboxes for a link to finish the change.'); }
  }
  async function changePw(){
    if (pw1.length<6){ ui.toast('Password needs at least 6 characters.'); return; }
    if (pw1!==pw2){ ui.toast("Passwords don't match."); return; }
    setBusy('pw');
    const { error } = await sb.auth.updateUser({ password:pw1 });
    setBusy('');
    if (error) ui.toast(error.message); else { setPw1(''); setPw2(''); ui.toast('Password updated ✓'); }
  }

  const blockedProfiles = blocks.map(id=>profiles[id]).filter(Boolean);
  const blockableFriends = friends.filter(f=>!blocks.includes(f.id));

  return html`<div>
    <div class="sheethead"><div class="sheettitle">Settings</div>
      <button class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>

    <div class="pillrow" style="margin-bottom:4px">
      ${[['look','Appearance',IcPalette],['account','Account',IcUser],['privacy','Privacy',IcShield]].map(([k,l,Ic])=>html`
        <button key=${k} class=${'pill'+(tab===k?' on':'')} style="font-weight:600" onClick=${()=>setTab(k)}>
          <${Ic} size=${14}/> ${l}</button>`)}
    </div>

    ${tab==='look' && html`<${Fragment}>
      <div class="set-section">
        <div class="set-eyebrow">Color theme</div>
        <div class="theme-grid">
          ${THEME_IDS.map(id=>{ const t=THEMES[id]; return html`<button key=${id} class=${'theme-tile'+(theme===id?' on':'')} onClick=${()=>setTheme(id)}>
            <div class="swatch">${t.sw.map((c,i)=>html`<span key=${i} style=${`background:${c}`}></span>`)}</div>
            <div class="tname">${t.name}</div><div class="tdesc">${t.desc}</div>
          </button>`; })}
          <button class=${'theme-tile auto'+(theme==='auto'?' on':'')} onClick=${()=>setTheme('auto')}>
            <div class="swatch"><span></span><span></span><span></span><span></span><span></span></div>
            <div class="tname">Auto <${IcSpark} size=${11} style="vertical-align:-1px"/></div>
            <div class="tdesc">Fades through every color</div>
          </button>
        </div>
        ${theme==='auto' && html`<div class="set-card" style="margin-top:12px">
          <div class="set-label">Cycle speed</div>
          <div class="set-hint">How fast the palette drifts through the spectrum.</div>
          <input class="slider" type="range" min="0" max="100"
            value=${Math.round((180-(prefs.autoSpeed||60))/165*100)}
            onInput=${e=>patch({ autoSpeed: Math.round(180-(+e.target.value/100)*165) })}/>
          <div style="display:flex;justify-content:space-between" class="small"><span>Calm</span><span>Fast</span></div>
        </div>`}
      </div>

      <div class="set-section">
        <div class="set-eyebrow">Name flair</div>
        <div class="set-card">
          <div style="text-align:center;padding:8px 0 14px;font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#fff;letter-spacing:-.01em">
            <${NameFx} p=${{ ...me, flair }}/>
          </div>
          <div class="flabel">Gradient</div>
          <div class="pillrow">
            <button class=${'pill'+(!flair.ng?' on':'')} style="font-weight:600" onClick=${()=>setFlair(f=>({ ...f, ng:null }))}>Plain</button>
            ${NAME_FX.map(g=>{ const on = flair.ng && flair.ng[0]===g.c[0] && flair.ng[1]===g.c[1];
              return html`<button key=${g.id} class=${'pill'+(on?' on':'')} onClick=${()=>setFlair(f=>({ ...f, ng:g.c }))}>
                <span class="ngrad" style=${`background-image:linear-gradient(90deg,${g.c[0]},${g.c[1]});font-weight:700`}>${g.name}</span>
              </button>`; })}
            ${(()=>{ const c = flair.ng||['#b06bff','#2dd4bf']; return html`<span class="pill" style="padding:4px 8px;display:inline-flex;gap:6px;align-items:center">
              <input class="cinput" type="color" value=${c[0]} onInput=${e=>setFlair(f=>({ ...f, ng:[e.target.value, c[1]] }))} aria-label="Custom flair color A"/>
              <input class="cinput" type="color" value=${c[1]} onInput=${e=>setFlair(f=>({ ...f, ng:[c[0], e.target.value] }))} aria-label="Custom flair color B"/>
            </span>`; })()}
          </div>
          <${Toggle} label="Shimmer" hint="The gradient drifts across your name." accent="var(--major)"
            on=${!!flair.anim} onClick=${()=>setFlair(f=>({ ...f, anim:!f.anim }))}/>
          <${Toggle} label="Star signature" hint="A tiny constellation drawn from your account — nobody else has your stars." accent="var(--ge)"
            on=${!!flair.sig} onClick=${()=>setFlair(f=>({ ...f, sig:!f.sig }))}/>
          <button class="btn btn-grad btn-block" style="margin-top:12px" disabled=${flairBusy}
            onClick=${async()=>{ setFlairBusy(true); await saveProfile({ flair }); setFlairBusy(false); }}>${flairBusy?'Saving…':'Save flair'}</button>
          <div class="set-hint" style="margin-top:8px">Friends see your flair everywhere your name shows up.</div>
        </div>
      </div>

      <div class="set-section">
        <div class="set-eyebrow">Background style</div>
        <div class="theme-grid">
          ${BG_IDS.map(id=>{ const b=BG_STYLES[id]; return html`<button key=${id}
            class=${'theme-tile bgtile'+((prefs.bgStyle||'waves')===id?' on':'')}
            onClick=${()=>patch({ bgStyle:id })}>
            <div class="bgglyph">${b.g}</div>
            <div class="tname">${b.name}</div>
            <div class="tdesc">${b.desc}</div>
          </button>`; })}
        </div>
        <div class="set-card" style="margin-top:12px">
          <${Toggle} label="Flying asteroids" hint="Rocks drifting past in the distance."
            on=${prefs.asteroids} onClick=${()=>patch({ asteroids:!prefs.asteroids })}/>
          <${Toggle} label="Ping sound" hint="A soft chime when a friend pings you."
            on=${prefs.sounds} onClick=${()=>{ const on=!prefs.sounds; patch({ sounds:on }); if(on) pingChime(); }}/>
        </div>
      </div>
    <//>`}

    ${tab==='account' && html`<${Fragment}>
      <div class="set-section">
        <div class="set-eyebrow">Profile</div>
        <div class="set-card">
          <div class="profgrid">
            <div><div class="flabel">Name</div><input class="input" value=${name} onInput=${e=>setName(e.target.value)}/></div>
            <div><div class="flabel">Handle · username</div><input class="input" value=${handle} onInput=${e=>setHandle(cleanHandle(e.target.value))} autocapitalize="none"/></div>
            <div><div class="flabel">Course</div><input class="input" value=${course} onInput=${e=>setCourse(e.target.value)} placeholder="BSIT · 1st Yr"/></div>
            <div><div class="flabel">School</div><input class="input" value=${school} onInput=${e=>setSchool(e.target.value)} placeholder="Your school"/></div>
          </div>
          <div class="flabel">Bubble colors</div>
          <div class="pillrow">
            ${ACCENTS.map((a,i)=>html`<button key=${i} class="pill" style=${`padding:4px;${acc[0]===a[0]&&acc[1]===a[1]?'border-color:var(--major)':''}`} onClick=${()=>setAcc(a)} aria-label="Color option">
              <span style=${`width:26px;height:26px;border-radius:50%;background:linear-gradient(140deg,${a[0]},${a[1]});display:block`}></span></button>`)}
            <span class="pill" style="padding:4px 8px;display:inline-flex;gap:6px;align-items:center">
          <input class="cinput" type="color" value=${acc[0]} onInput=${e=>setAcc([e.target.value, acc[1]])} aria-label="Custom color A"/>
          <input class="cinput" type="color" value=${acc[1]} onInput=${e=>setAcc([acc[0], e.target.value])} aria-label="Custom color B"/>
        </span>
          </div>
          <button class="btn btn-grad btn-block" style="margin-top:16px" disabled=${busy==='acc'} onClick=${saveAcc}>${busy==='acc'?'Saving…':'Save profile'}</button>
          <div class="set-hint" style="margin-top:10px">Avatar, cover photo, bio, pronouns and hobbies live in the <b>You</b> tab → Edit profile.</div>
        </div>
      </div>

      <div class="set-section">
        <div class="set-eyebrow">Sign-in</div>
        <div class="set-card">
          <div class="set-label"><${IcMail} size=${13} style="vertical-align:-2px"/> Change email</div>
          <div class="set-hint">You'll confirm the switch from a link sent to both addresses.</div>
          <input class="input pw-mini" type="email" value=${email} onInput=${e=>setEmail(e.target.value)} placeholder="new@email.com" autocapitalize="none"/>
          <button class="btn btn-block" style="margin-top:10px" disabled=${busy==='email'||!email.trim()} onClick=${changeEmail}>${busy==='email'?'Sending…':'Update email'}</button>

          <div class="set-label" style="margin-top:18px"><${IcLock} size=${13} style="vertical-align:-2px"/> Change password</div>
          <div class="pw-mini"><${PwInput} value=${pw1} onInput=${e=>setPw1(e.target.value)} placeholder="New password" autocomplete="new-password" show=${showPw} setShow=${setShowPw}/></div>
          <div style="margin-top:10px"><${PwInput} value=${pw2} onInput=${e=>setPw2(e.target.value)} placeholder="Confirm new password" autocomplete="new-password" show=${showPw} setShow=${setShowPw} onEnter=${changePw}/></div>
          <button class="btn btn-block" style="margin-top:10px" disabled=${busy==='pw'||!pw1||!pw2} onClick=${changePw}>${busy==='pw'?'Updating…':'Update password'}</button>
        </div>
      </div>
    <//>`}

    ${tab==='privacy' && html`<${Fragment}>
      <div class="set-section">
        <div class="set-eyebrow">Location</div>
        <div class="set-card">
          <${Toggle} label="Share my location" accent="var(--ge)"
            hint=${sharingOn ? (()=>{ const d=decodePlace(myPres?.zone); return d ? `Friends see you at ${d.place} · ${d.system}` : 'Pick a planet on the Map tab'; })() : 'Hidden from everyone'}
            on=${sharingOn} onClick=${()=>setPres({ sharing:!sharingOn, ghost:false })}/>
          <${Toggle} label="Ghost mode" accent="var(--major)"
            hint="Invisible on the map even while sharing is on."
            on=${!!myPres?.ghost} onClick=${()=>setPres({ ghost:!myPres?.ghost })}/>
        </div>
      </div>

      <div class="set-section">
        <div class="set-eyebrow">Notifications</div>
        <div class="set-card">
          <${Toggle} label="Phone notifications" accent="var(--nstp)"
            hint=${pushOn ? 'Pokes, pings, invites and cosmic events buzz this device even when Orbit is closed.' : 'Get pokes, invites and cosmic events on this phone. On iPhone: Add to Home Screen first, then flip this on.'}
            on=${!!pushOn} onClick=${()=>pushOn?disablePush():enablePush()}/>
          <div class="set-hint" style="margin-top:6px">Signals sweep themselves out 7 days after they're sent.</div>
        </div>
      </div>

      <div class="set-section">
        <div class="set-eyebrow">Blocked · ${blockedProfiles.length}</div>
        <div class="set-card">
          <div class="set-hint" style="margin-bottom:4px">Blocked people can't appear in your Orbit, and their pings won't reach you. Blocking also removes any friendship.</div>
          <div class="blocklist">
            ${!blockedProfiles.length && html`<div class="small">No one blocked.</div>`}
            ${blockedProfiles.map(p=>html`<div key=${p.id} class="blockrow">
              <${Avatar} p=${p} size=${30}/>
              <div style="min-width:0;flex:1"><div class="rowname" style="font-size:12.5px">${shownName(p)}</div><div class="rowsub">@${p.handle}</div></div>
              <button class="btn" style="padding:7px 11px;font-size:11.5px;flex:none" onClick=${()=>unblock(p.id)}>Unblock</button>
            </div>`)}
          </div>
          ${blockableFriends.length>0 && html`<${Fragment}>
            <button class="btn btn-block" style="margin-top:10px" onClick=${()=>setPickBlock(!pickBlock)}>
              <${IcBan} size=${14}/> ${pickBlock?'Cancel':'Block a friend'}</button>
            ${pickBlock && html`<div class="pillrow" style="margin-top:10px">
              ${blockableFriends.map(f=>html`<button key=${f.id} class="pill" style="padding:5px 11px 5px 5px"
                onClick=${async()=>{ if(await ui.confirm({ title:`Block ${shownName(f)}?`, body:'This also removes them as a friend.', confirmLabel:'Block', danger:true })){ block(f.id); setPickBlock(false); } }}>
                <${Avatar} p=${f} size=${22}/> ${fname(f)}</button>`)}
            </div>`}
          <//>`}
        </div>
      </div>

      <div class="set-section">
        <div class="set-eyebrow">Account</div>
        <button class="btn btn-block" onClick=${onSignOut}><${IcOut} size=${15}/> Sign out</button>
        <div class="dangerzone">
          <div class="set-label" style="color:#ffb1c8">Delete account</div>
          <div class="set-hint">Erases your profile, schedule, plans, and messages, then signs you out. This can't be undone.</div>
          <input class="input pw-mini" value=${delText} onInput=${e=>setDelText(e.target.value)} placeholder="Type DELETE to confirm" autocapitalize="characters"/>
          <button class="btn btn-soft-red btn-block" style="margin-top:10px" disabled=${delText.trim().toUpperCase()!=='DELETE'||busy==='del'}
            onClick=${async()=>{ setBusy('del'); await onDeleteAccount(); setBusy(''); }}>${busy==='del'?'Deleting…':'Delete my account'}</button>
        </div>
      </div>
    <//>`}

    <div class="small" style="text-align:center;margin-top:22px;opacity:.6">Orbit · appearance syncs with your account</div>
  </div>`;
}

/* ============================================================
   APP ROOT
   ============================================================ */
export function ConfirmHost() {
  // registers ui.confirm → returns a Promise<boolean>; renders a single branded dialog
  const [q, setQ] = useState(null);
  useEffect(()=>{
    ui.confirm = (opts)=> new Promise(res=> setQ({ ...(opts||{}), _res:res }));
    return ()=>{ ui.confirm = (o)=> Promise.resolve(window.confirm((o&&(o.body||o.title))||'Are you sure?')); };
  }, []);
  useEffect(()=>{
    if (!q) return;
    const f = e => { if (e.key==='Escape') done(false); if (e.key==='Enter') done(true); };
    addEventListener('keydown', f); return ()=>removeEventListener('keydown', f);
  }, [q]);
  if (!q) return null;
  const done = v => { const r=q._res; setQ(null); r&&r(v); };
  return html`<div class="confirmwrap" onClick=${e=>{ if(e.target===e.currentTarget) done(false); }}>
    <div class="confirmcard" role="alertdialog" aria-modal="true">
      <div class="confirmtitle">${q.title||'Are you sure?'}</div>
      ${q.body && html`<div class="confirmbody">${q.body}</div>`}
      <div class="confirmrow">
        <button class="btn" onClick=${()=>done(false)}>${q.cancelLabel||'Cancel'}</button>
        <button class=${'btn confirmgo'+(q.danger?' danger':'')} onClick=${()=>done(true)}>${q.confirmLabel||'Confirm'}</button>
      </div>
    </div>
  </div>`;
}

