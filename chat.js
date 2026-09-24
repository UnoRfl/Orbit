/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { html, useEffect, useRef, useState } from './lib.js';
import { CHAT_BGS, CHAT_FONTS, CHAT_THEMES, EMOJI_CATS, Glyph, Sym, IcBack, IcChat, IcFlag, IcImage, IcMore, IcPlus, IcSend, IcSmile, IcX, TENOR_KEY, ago, chatKeyOf, dayLabel, fname, hueCss, isMediaUrl, pauseBg, posVars, resumeBg, sb, ui } from './core.js';
import { Avatar, Bubble, ImageAdjust, You, statusOf } from './components.js';
import { MediaComposer, SnapBubble } from './media.js';
import { AdCard } from './ads.js';
import { isPlus } from './core.js';

export function ChatsScreen({ kit }) {
  const { uid, me, threads, reads, ov, sel, setSel, systems, profiles, nameOf, blocks, openDm, ensureProfiles, friends, db, isFounder, streaks={}, ads, onPlus } = kit;
  const [pick, setPick] = useState(false);
  const peerOf = t => t.a===uid ? t.b : t.a;
  useEffect(()=>{ ensureProfiles(threads.map(peerOf)); }, [threads.length]);
  const visible = threads.filter(t=>!blocks.includes(peerOf(t)));
  const kSel = chatKeyOf(sel);
  const pv = k => { const o = ov[k]; if (!o || !o.last_at) return null;
    const who = o.last_sender===uid ? 'You: ' : '';
    return who + (o.last_deleted ? 'unsent a message' : o.last_kind==='text' ? (o.last_body||'') : o.last_kind==='gif' ? 'sent a GIF' : o.last_kind==='media' ? 'sent a snap' : 'sent a photo'); };

  return html`<div class="chatsplit" style="animation:pop .2s ease">
    <div class="chatlist">
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
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
            <div class="convglyph" style=${`--sh:${hueCss(s.hue)}`}><${Sym} v=${s.glyph} size=${18} fallback="planet"/></div>
            <div style="min-width:0;flex:1">
              <div class="rowname" style=${un&&!mut?'color:#fff':''}>${s.name}${mut?html`<span style="opacity:.5;font-weight:400"> · <${Glyph} k="belloff" size=${12}/></span>`:''}</div>
              <div class="rowsub">${pv(k) || `${(s.members||[]).filter(m=>m.status==='accepted').length} members · say hi`}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none">
              ${o?.last_at && html`<span class="convtime">${ago(o.last_at)}</span>`}
              ${un>0 && !mut && html`<span class="convun">${un>99?'99+':un}</span>`}
            </div>
          </button>`;})}
      </div>`}

      <${AdCard} ads=${ads} placement="chats" me=${me} onPlus=${onPlus}/>
      <div class="flabel" style="margin-top:14px">Direct messages</div>
      ${db!==false && !visible.length && html`<div class="small" style="padding:8px 2px;line-height:1.5">No DMs yet — hit <b>New</b>, or <b>Message</b> on a friend's profile.</div>`}
      <div class="stack" style="margin-top:8px">
        ${visible.map(t=>{ const pid=peerOf(t), p=profiles[pid], k='dm:'+t.id, o=ov[k], un=o?.n||0, mut=reads[k]?.muted;
          return html`<button key=${t.id} class=${'convrow'+(kSel===k?' on':'')} onClick=${()=>setSel({ scope:'dm', ref:t.id })}>
            <${Avatar} p=${p||{ id:pid }} size=${40}/>
            <div style="min-width:0;flex:1">
              <div class="rowname" style=${un&&!mut?'color:#fff':''}>${p?fname(p):'…'}${mut?html`<span style="opacity:.5;font-weight:400"> · <${Glyph} k="belloff" size=${12}/></span>`:''}
                ${streaks[t.id] && html`<span class=${'streak'+(streaks[t.id].today?'':' risk')} title=${streaks[t.id].today ? `${streaks[t.id].streak}-day streak` : 'Streak ends at midnight — send something today'}><${Glyph} k="flame" size=${11}/>${streaks[t.id].streak}</span>`}</div>
              <div class="rowsub">${pv(k) || 'Say hi'}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none">
              ${o?.last_at && html`<span class="convtime">${ago(o.last_at)}</span>`}
              ${un>0 && !mut && html`<span class="convun">${un>99?'99+':un}</span>`}
            </div>
          </button>`;})}
      </div>
      <div class="small" style="margin-top:16px;line-height:1.6">Friends-only DMs · photos and videos disappear after 24 hours · chats auto-clear after 3 months. Reported chats can be reviewed by Orbit founders.</div>
    </div>

    ${sel ? html`<${ChatView} key=${kSel} kit=${kit} sel=${sel} onClose=${()=>setSel(null)}/>`
          : html`<div class="chatempty"><div style="color:var(--muted)"><${Glyph} k="chat" size=${34}/></div>
              <div style="font-weight:600;margin-top:8px;color:var(--ink)">Pick a conversation</div></div>`}

    ${pick && html`<${FriendPickPop} friends=${friends} onClose=${()=>setPick(false)}
      onPick=${async id=>{ setPick(false); await openDm(id); }}/>`}
  </div>`;
}

/* report a member — lands in the staff reports queue */

export function ChatView({ kit, sel, onClose, dock=false }) {
  const { uid, me, profiles, ensureProfiles, threads, systems, reads, msgs, loadMsgs, sendMsg, unsendMsg,
          markRead, muteChat, setDmLook, setSysLook, reportMsg, blockUser, isFounder, statusOf, onOpenFriend, loadModThread,
          mediaRows={}, ensureMedia, sendSnap, openOnce, scheduled=[], scheduleMsg, cancelScheduled, onPlus, flags={}, streaks={} } = kit;
  const plus = isPlus(me);
  const key = chatKeyOf(sel);
  const isDm = sel.scope==='dm';
  const [modThread, setModThread] = useState(null);
  const thread = isDm ? (threads.find(t=>t.id===sel.ref) || modThread) : null;
  const sys = !isDm ? systems.find(s=>s.key===sel.ref) : null;
  const mod = !!sel.mod && (isDm ? !(thread && (thread.a===uid || thread.b===uid)) : !sys);
  useEffect(()=>{ if (sel.mod && isDm && !threads.some(t=>t.id===sel.ref)) loadModThread(sel.ref).then(setModThread); }, [sel.ref]);

  /* Below 900px a chat pane is position:fixed/inset:0 and opaque, so the
     ambient canvas behind it is drawing frames nobody can see — and chat is
     where people spend the most time. Stop it while such a pane is up.
     The test is the layout breakpoint, NOT the `dock` prop: `dock` only
     controls the header's back button, and both call sites go fullscreen on a
     phone while both show the background around them on a desktop. Tracked
     live so rotating across the breakpoint resolves correctly either way. */
  useEffect(()=>{
    const mq = matchMedia('(max-width: 899px)');
    let held = false;
    const sync = ()=>{ if (mq.matches === held) return; held = mq.matches; held ? pauseBg() : resumeBg(); };
    sync();
    mq.addEventListener('change', sync);
    return ()=>{ mq.removeEventListener('change', sync); if (held) resumeBg(); };
  }, []);

  const peerId = isDm && thread ? (thread.a===uid ? thread.b : thread.a) : null;
  const peer = peerId ? profiles[peerId] : null;
  useEffect(()=>{ if (peerId) ensureProfiles([peerId]); }, [peerId]);

  const bucket = msgs[key] || { rows:[], hasMore:false, loaded:false, peerRead:null };
  const rows = bucket.rows;
  useEffect(()=>{ loadMsgs(sel); }, [key]);
  useEffect(()=>{ const ids = rows.filter(m=>m.kind==='media' && !m.deleted).map(m=>m.body); if (ids.length && ensureMedia) ensureMedia(ids); }, [rows.length, key]);
  const myQueue = scheduled.filter(q => (isDm ? q.thread_id===sel.ref : q.system_id===sel.ref));

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
    const ok = await sendMsg(sel, { kind, body:payload }, peerId);
    // a failed send used to eat the draft; put it back so it can be retried
    if (!ok && kind==='text') setText(t => t || payload);
    taRef.current?.focus();
  };

  // lightweight typing indicator over realtime broadcast
  const [peerTyping, setPeerTyping] = useState(null);
  const typRef = useRef({ ch:null, last:0, t:0 });
  useEffect(()=>{
    if (mod) return;
    // private: Realtime checks public.can_typing(topic) — members of this DM or system only
    const ch = sb.channel('typing:'+key, { config:{ private:true, broadcast:{ self:false } } });
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

  const title = isDm ? (peer ? fname(peer) : '…') : (sys ? sys.name : 'System chat');
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

  return html`<div class=${'chatpane chat3d'+(dock?' dock':'')} style=${`--mybub:${th.my};--chacc:${th.accent};--chfont:${ff}`}>
    <div class="chathead glass">
      <button class="xbtn" style="width:32px;height:32px" onClick=${onClose} aria-label="Back"><${IcBack} size=${15}/></button>
      ${isDm
        ? html`<${Avatar} p=${peer||{ id:peerId||'x' }} size=${34}/>`
        : html`<div class="convglyph" style=${`width:34px;height:34px;font-size:16px;${sys?`--sh:${hueCss(sys.hue)}`:''}`}><${Sym} v=${sys?.glyph} size=${17} fallback="satlite"/></div>`}
      <div style=${`min-width:0;flex:1;${isDm&&peerId&&!mod?'cursor:pointer':''}`} onClick=${()=>{ if (isDm && peerId && !mod) onOpenFriend(peerId); }}>
        <div class="rowname" style="font-size:14px">${title}${isDm && thread && streaks[thread.id] && html` <span class=${'streak'+(streaks[thread.id].today?'':' risk')}><${Glyph} k="flame" size=${11}/>${streaks[thread.id].streak}</span>`}</div>
        <div class="rowsub" style=${peerTyping ? 'color:var(--ge)' : ''}>${subtitle}</div>
      </div>
      ${!mod && html`<button class="xbtn" style="width:32px;height:32px" onClick=${()=>setPane(pane==='menu'?null:'menu')} aria-label="Chat options"><${IcMore} size=${15}/></button>`}
    </div>
    ${mod && html`<div class="modbar"><${Glyph} k="eye" size=${14}/> Founder moderation view — visible because this chat was reported</div>`}

    <div class="chatbody">
      ${bg && html`<div class="chatbg shade" style=${posVars(bgPos)}>
        <img src=${bg} alt="" referrerpolicy="no-referrer" draggable=${false} onError=${e=>{ e.target.style.display='none'; }}/></div>`}
      ${bgGrad && html`<div class="chatbg" style=${`background:${bgGrad}`}></div>`}
      <div class="msgs" ref=${boxRef} onScroll=${onScroll}
        onClick=${()=>setPane(p=>(p==='emoji'||p==='media'||p==='menu')?null:p)}>
      ${bucket.hasMore && html`<button class="pill" style="align-self:center;margin-bottom:10px;flex:none" onClick=${()=>loadMsgs(sel, rows[0]?.created_at)}>↑ Load earlier</button>`}
      ${!bucket.loaded && html`<div class="small" style="align-self:center;padding:24px 0">Loading…</div>`}
      ${bucket.loaded && !rows.length && html`<div class="chatzero">
        <div style="color:var(--muted)"><${Glyph} k=${isDm?'wave':'satlite'} size=${30}/></div>
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
            renderMedia=${m=>html`<${SnapBubble} m=${m} mine=${m.sender===uid} row=${mediaRows[m.body]} onLoad=${onMedia} onOpenOnce=${openOnce}/>`}
            onOpenSender=${()=>{ if(!mod) onOpenFriend(it.m.sender); }} />`)}
      ${seen && html`<div class="seen">Seen</div>`}
      </div>
    </div>

    ${!mod && myQueue.length>0 && html`<button class="queuechip" onClick=${()=>setPane(pane==='queue'?null:'queue')}><${Glyph} k="clock" size=${13}/> ${myQueue.length} scheduled</button>`}
    ${pane==='queue' && html`<div class="chatover" onClick=${e=>{ if(e.target===e.currentTarget) setPane(null); }}><div class="chatovercard">
      <div class="sheethead" style="margin-bottom:8px"><div class="sheettitle" style="font-size:16px">Scheduled here</div>
        <button aria-label="Close" class="xbtn" onClick=${()=>setPane(null)}><${IcX} size=${15}/></button></div>
      <div class="stack">${myQueue.map(q=>html`<div key=${q.id} class="cardrow" style="cursor:default">
        <span style="color:var(--ge);display:flex"><${Glyph} k="clock" size=${16}/></span>
        <div style="min-width:0;flex:1"><div class="rowname" style="white-space:normal">${q.body.slice(0,120)}</div>
          <div class="rowsub">${new Date(q.send_at).toLocaleString(undefined,{ weekday:'short', hour:'numeric', minute:'2-digit' })}</div></div>
        <button class="pill" onClick=${()=>cancelScheduled(q.id)}>Cancel</button></div>`)}</div>
      <div class="small" style="margin-top:10px">Orbit sends these for you, even if your phone is off.</div>
    </div></div>`}
    ${pane==='later' && html`<${LaterPane} onClose=${()=>setPane(null)} onPick=${async at=>{ const body=text.trim(); if(!body) return;
      if (await scheduleMsg(sel, body, at)) { setText(''); requestAnimationFrame(grow); setPane(null); } }}/>`}
    ${pane==='snap' && html`<div class="mcomp-wrap"><${MediaComposer} uid=${uid} me=${me} purpose="chat" allowViewOnce=${isDm}
      onPlus=${onPlus} onClose=${()=>setPane(null)}
      onPosted=${async (enc, extra)=>{ const ok = await sendSnap(sel, enc, extra, peerId); if (ok) { stick.current = true; setPane(null); } }}/></div>`}
    ${!mod && html`<div class="composer glass">
      <button class="cbtn" aria-label="Emoji" onClick=${()=>setPane(pane==='emoji'?null:'emoji')}><${IcSmile} size=${19}/></button>
      ${flags.snaps!==false && html`<button class="cbtn" aria-label="Send a photo or video (gone in 24h)" onClick=${()=>setPane('snap')}><${Glyph} k="camera" size=${19}/></button>`}
      <button class="cbtn" aria-label="GIF or image link" onClick=${()=>setPane(pane==='media'?null:'media')}><${IcImage} size=${19}/></button>
      <div class="cfield">
        ${text.length>1800 && html`<span class="ccount">${2000-text.length}</span>`}
        <textarea ref=${taRef} rows="1" value=${text} maxlength="2000" placeholder="Message…"
          onInput=${e=>{ setText(e.target.value); grow(); pingTyping(); }}
          onKeyDown=${e=>{ if (e.key==='Enter' && !e.shiftKey && window.innerWidth>=900) { e.preventDefault(); if (canSend) doSend(); } }}></textarea>
      </div>
      ${canSend && flags.scheduled!==false && html`<button class="cbtn" aria-label="Send later" title=${plus ? 'Send later' : 'Send later · Orbit+'} onClick=${()=> plus ? setPane('later') : onPlus && onPlus()}><${Glyph} k="clock" size=${18}/></button>`}
      <button class="csend" disabled=${!canSend} onClick=${()=>doSend()} aria-label="Send"><${IcSend} size=${16}/></button>
      ${pane==='emoji' && html`<${EmojiPop} onPick=${em=>{ setText(t=>t+em); requestAnimationFrame(grow); }} onClose=${()=>{ setPane(null); taRef.current?.focus(); }}/>`}
      ${pane==='media' && html`<${MediaPop} onSend=${(kind,u)=>doSend(kind,u)} onClose=${()=>setPane(null)}/>`}
    </div>`}

    ${pane==='menu' && html`<div class="chatmenu glass">
      ${canStyle && html`<button onClick=${()=>setPane('look')}><${Glyph} k="palette" size=${15}/> Personalize</button>`}
      <button onClick=${()=>{ muteChat(sel, !(reads[key]?.muted)); setPane(null); }}>${reads[key]?.muted ? html`<${Glyph} k="bell" size=${15}/> Unmute` : html`<${Glyph} k="belloff" size=${15}/> Mute`}</button>
      ${isDm && peerId && html`<button onClick=${()=>{ setPane(null); onOpenFriend(peerId); }}><${Glyph} k="user" size=${15}/> View profile</button>`}
      ${isDm && peerId && html`<button style="color:#ff9db8" onClick=${async()=>{ setPane(null);
        if (await ui.confirm({ title:`Block ${title}?`, body:"They won't be able to message you, and you won't see their messages.", confirmLabel:'Block', danger:true })) { blockUser(peerId); onClose(); } }}><${Glyph} k="block" size=${15}/> Block</button>`}
    </div>`}
    ${pane==='look' && html`<${LookPane} isDm=${isDm} look=${look} plus=${plus} onPlus=${onPlus}
      onSave=${async l=>{ if (isDm) await setDmLook(thread.id, l); else await setSysLook(sel.ref, l); setPane(null); }}
      onClose=${()=>setPane(null)}/>`}
    ${String(pane).startsWith('report:') && (()=>{ const m = rows.find(x=>x.id===String(pane).slice(7));
      return m && html`<${ReportMsgPane} m=${m}
        onSend=${async reason=>{ const ok = await reportMsg(m, sel, reason); if (ok) setPane(null); }}
        onClose=${()=>setPane(null)}/>`; })()}
    ${lightbox && html`<div class="lightbox" onClick=${()=>setLightbox(null)}><img src=${lightbox} referrerpolicy="no-referrer" alt="full size"/></div>`}
  </div>`;
}

export function EmojiPop({ onPick, onClose }) {
  const [cat, setCat] = useState(0);
  return html`<div class="chatpop glass">
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
  return html`<div class="chatpop glass">
    <div class="poptabs">
      <button class=${tab==='img'?'on':''} onClick=${()=>setTab('img')}><${Glyph} k="image" size=${14}/> Image link</button>
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

export function LookPane({ isDm, look, onSave, onClose, plus=false, onPlus }) {
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
        <div class="sheettitle" style="font-size:16px">Personalize this chat</div>
        <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${15}/></button>
      </div>
      <div class="flabel">Theme · ${th.name}</div>
      <div class="chiprow">${Object.entries(CHAT_THEMES).map(([id,t])=>html`<button key=${id}
        class=${'lookswatch'+(l.theme===id?' on':'')+(t.plus?' plusw':'')+(t.plus&&!plus?' plock':'')} style=${`background:${t.my}`} aria-label=${t.name+(t.plus?' (Orbit+)':'')}
        title=${t.plus && !plus ? t.name+' · Orbit+' : t.name}
        onClick=${()=>{ if (t.plus && !plus) { onPlus && onPlus(); return; } setL(v=>({ ...v, theme:id })); }}></button>`)}</div>
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
      ${isImg && html`<button class="btn" style="margin-top:8px;width:100%" onClick=${()=>setFraming(true)}><${Glyph} k="image" size=${15}/> Frame background · drag & zoom</button>`}
      <div class="lookdemo" style=${`font-family:${ff};${preset?`background:${preset}`:''}`}>
        ${isImg && html`<div class="chatbg shade" style=${posVars(l.bgPos)}>
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
        <div class="sheettitle" style="font-size:16px">Report message</div>
        <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${15}/></button>
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
        <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${15}/></button>
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

/* "Send later" — an Orbit+ perk. The message waits in scheduled_messages and a
   pg_cron job delivers it within a minute of the time, through the same
   trigger as a normal send, so blocks and unfriending still stop it. */
export function LaterPane({ onPick, onClose }) {
  const at = (d, h, m=0) => { const x = new Date(); x.setDate(x.getDate()+d); x.setHours(h, m, 0, 0); return x; };
  const now = new Date();
  const opts = [
    ['In 1 hour', new Date(Date.now()+3600e3)],
    ...(now.getHours() < 19 ? [['Tonight · 8PM', at(0,20)]] : []),
    ['Tomorrow · 7AM', at(1,7)],
    ['Tomorrow · 12PM', at(1,12)],
  ];
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async d => { if (!(d > new Date(Date.now()+60e3))) { ui.toast('Pick a time at least a minute from now'); return; } setBusy(true); await onPick(d); setBusy(false); };
  const minLocal = (()=>{ const d=new Date(Date.now()+2*60e3); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,16); })();
  return html`<div class="chatover" onClick=${e=>{ if(e.target===e.currentTarget) onClose(); }}>
    <div class="chatovercard">
      <div class="sheethead" style="margin-bottom:8px">
        <div class="sheettitle" style="font-size:16px;display:flex;align-items:center;gap:7px"><${Glyph} k="clock" size=${16}/> Send later</div>
        <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${15}/></button>
      </div>
      <div class="stack">${opts.map(([l,d])=>html`<button key=${l} class="cardrow" disabled=${busy} onClick=${()=>go(d)}>
        <span class="rowname" style="flex:1">${l}</span><span class="rowsub">${d.toLocaleString(undefined,{ weekday:'short', hour:'numeric', minute:'2-digit' })}</span></button>`)}</div>
      <div class="flabel">Pick a time</div>
      <div style="display:flex;gap:8px">
        <input class="input" type="datetime-local" min=${minLocal} value=${custom} onInput=${e=>setCustom(e.target.value)}/>
        <button class="btn btn-grad" style="flex:none" disabled=${!custom||busy} onClick=${()=>go(new Date(custom))}>Schedule</button>
      </div>
      <div class="small" style="margin-top:10px">Up to 30 days ahead. Cancel any time from the “scheduled” chip above the message box.</div>
    </div>
  </div>`;
}
