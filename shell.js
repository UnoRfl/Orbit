/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { h, html, useEffect, useRef, useState } from './lib.js';
import { BADGE_DEFS, CAT, DAYS, DEFAULT_PREFS, IcBell, IcCal, IcChat, IcGear, IcHome, IcOut, IcPin, IcShield, IcUser, IcUsers, PUSH_PUBLIC_KEY, applyTheme, badgesOf, chatKeyOf, decodePlace, fmt, fname, groupBy, loadSystems, msgPreview, pingChime, roleOf, saveSystems, sb, store, ui, uidTail, urlB64ToUint8Array } from './core.js';
import { Sheet, SolarLoader, You, statusOf } from './components.js';
import { FriendDash, FriendsSheet, Home } from './home.js';
import { MapScreen } from './map.js';
import { Creator, Detail, ImportSheet, Inbox, PingSheet, Plans } from './plans.js';
import { ChatsScreen } from './chat.js';
import { Settings } from './settings.js';
import { ReportSheet, StaffPanel } from './staff.js';

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
