/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { Fragment, html, useState } from './lib.js';
import { ACCENTS, B, BG_IDS, BG_STYLES, IcBan, IcLock, IcMail, IcOut, IcPalette, IcShield, IcSpark, IcUser, IcX, NAME_FX, THEMES, THEME_IDS, cleanHandle, decodePlace, flairOf, fname, pingChime, sb, shownName, ui } from './core.js';
import { Avatar, Bubble, NameFx, PwInput, Toggle, You } from './components.js';
import { Home } from './home.js';

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
