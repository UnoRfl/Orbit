/* Orbit — Orbit+, the paid tier. See GUIDE.md for the full map.

   There is no payment processor (Orbit has to stay free to run), so Orbit+ is
   sold the low-tech way: the founder takes payment however they like (GCash,
   cash at the org booth) and hands over a redeem code made in Mission Control
   → Orbit+. Codes stack, and the founder can also grant days to anyone. When a
   real processor is wired in later, its webhook only has to do what
   staff_grant_plus() does — nothing on this page changes.

   The page is a studio: anyone can TRY every aura, name effect, profile effect,
   entrance and message effect on their own avatar; saving needs Plus. Seeing
   it on yourself sells it better than a list of perks ever could.

   What Plus buys is cosmetic, convenience, and SENDING photos/videos in chat
   (everyone can still receive them, and stories stay free) - never safety or
   reach: nobody pays to see more of someone than a free friend can. */
import { html, useState } from './lib.js';
import { AURAS, COVER_FX, ENTRANCES, Glyph, IcX, MSG_FX, NAME_PLUS, PLUS_TIERS, THEMES, CHAT_THEMES, fname, flairOf, isPlus, plusTier, sb, shownName } from './core.js';
import { Avatar, BadgeChips, CoverImg, NameFx } from './components.js';
import { playFx } from './fx.js';

export const PERKS = [
  { g: 'camera', t: 'Send photos & videos', d: 'Share pictures and clips in any chat — gone in 24 hours, with optional view once. Everyone can receive them.' },
  { g: 'orbit',  t: 'Auras',            d: 'Nine animated auras — Ringworld, Eclipse, Singularity, Nebula… on your avatar everywhere.' },
  { g: 'image',  t: 'Profile effects',  d: 'Starfield, aurora, meteor showers or nebula moving across your cover.' },
  { g: 'rocket', t: 'Entrances',        d: 'Friends opening your profile get a warp jump, meteor rain or a supernova.' },
  { g: 'brush',  t: 'Name effects',     d: 'Neon, holo foil, glitch or a flowing prism on your name.' },
  { g: 'spark',  t: 'Message effects',  d: 'Send with confetti, stardust, hearts or a warp that fills their screen.' },
  { g: 'star',   t: 'Evolving badge',   d: 'Moon → Comet → Planet → Star → Supernova, the longer you stay.' },
  { g: 'clock',  t: 'Send later',       d: 'Write it now, Orbit delivers it at 7:00 tomorrow — even if your phone is off.' },
  { g: 'video', t: 'HD stories & snaps', d: '2160px photos and 1080p video instead of 1440px / 720p.' },
  { g: 'palette',t: 'Exclusive themes', d: 'Supernova and Eclipse app themes; Holo, Galaxy and 24K chat bubbles.' },
  { g: 'megaph', t: 'No ads',           d: 'Every sponsored card disappears.' },
];
export const plusThemes = () => Object.entries(THEMES).filter(([, t]) => t.plus).map(([id]) => id);
export const plusChatThemes = () => Object.entries(CHAT_THEMES).filter(([, t]) => t.plus).map(([id]) => id);

export const PlusBadge = ({ p, size = 11 }) => isPlus(p)
  ? html`<span class="plustag" title="Orbit+ member"><${Glyph} k="plus" size=${size}/> Orbit+</span>` : null;

const TABS = [['aura', 'orbit', 'Aura'], ['name', 'brush', 'Name'], ['cover', 'image', 'Profile'], ['entrance', 'rocket', 'Entrance'], ['msg', 'spark', 'Messages']];

export function PlusPage({ me, saveProfile, onRedeemed, onClose }) {
  const plus = isPlus(me);
  const fl = flairOf(me);
  const [look, setLook] = useState({ aura: fl.aura || 'orbit', nfx: fl.nfx || '', cfx: fl.cfx || '', efx: fl.efx || '' });
  const [tab, setTab] = useState('aura');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const tier = plusTier(me);
  const until = plus ? new Date(me.plus_until) : null;
  const dirty = look.aura !== (fl.aura || '') || look.nfx !== (fl.nfx || '') || look.cfx !== (fl.cfx || '') || look.efx !== (fl.efx || '');
  // the preview always renders as Plus, so a free user sees exactly what they'd get
  const pv = { ...me, plus_until: new Date(Date.now() + 864e5).toISOString(), plus_since: me?.plus_since || new Date().toISOString(),
    flair: { ...fl, aura: look.aura || null, nfx: look.nfx || null, cfx: look.cfx || null, efx: look.efx || null } };
  const set = (k, v) => setLook(l => ({ ...l, [k]: v }));

  const redeem = async () => {
    const k = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (k.length !== 12) { setErr('Codes look like ABCD-EFGH-JKLM'); return; }
    setBusy(true); setErr('');
    const { data, error } = await sb.rpc('redeem_code', { p_code: `${k.slice(0, 4)}-${k.slice(4, 8)}-${k.slice(8)}` });
    setBusy(false);
    if (error) { setErr(error.message || 'That code isn\'t valid'); return; }
    setCode('');
    onRedeemed?.(data);
  };
  const save = async () => {
    setSaving(true);
    const next = { ...fl };
    for (const k of ['aura', 'nfx', 'cfx', 'efx']) { if (look[k]) next[k] = look[k]; else delete next[k]; }
    await saveProfile({ flair: next });
    setSaving(false);
  };
  const tile = (on, onClick, inner, label, sub) => html`<button class=${'stile' + (on ? ' on' : '')} onClick=${onClick} title=${sub || ''}>
    <span class="stile-art">${inner}</span><b>${label}</b></button>`;

  return html`<div class="plus">
    <div class="sheethead">
      <div class="plushero-t"><span class="plusmark"><${Glyph} k="plus" size=${18}/></span> Orbit<b>+</b>
        ${plus && html`<span class="plustag" style="margin-left:4px">active</span>`}</div>
      <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button>
    </div>

    <div class="studio">
      <div class="studio-stage">
        <${CoverImg} p=${pv}/>
        <div class="studio-nebula" aria-hidden="true"></div>
        <div class="studio-av"><${Avatar} p=${pv} size=${96}/></div>
        <div class="studio-name"><${NameFx} p=${pv} text=${shownName(me) || fname(me) || 'You'}/></div>
        <div class="studio-chips"><${BadgeChips} p=${pv}/></div>
        <div class="studio-note">${plus ? (until ? `Plus until ${until.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '') : 'Preview — this is you with Orbit+'}</div>
      </div>

      <div class="studio-tabs" role="tablist">${TABS.map(([k, g, l]) => html`<button key=${k} role="tab" aria-selected=${tab === k}
        class=${'studio-tab' + (tab === k ? ' on' : '')} onClick=${() => setTab(k)}><${Glyph} k=${g} size=${14}/> ${l}</button>`)}</div>

      ${tab === 'aura' && html`<div class="stiles">
        ${Object.entries(AURAS).map(([id, a]) => tile(look.aura === id, () => set('aura', id),
          html`<${Avatar} p=${{ ...pv, flair: { ...pv.flair, aura: id } }} size=${46}/>`, a.name, a.blurb))}
        ${tile(!look.aura, () => set('aura', ''), html`<${Avatar} p=${{ ...pv, flair: { ...pv.flair, aura: null } }} size=${46}/>`, 'None')}
      </div>`}
      ${tab === 'name' && html`<div class="stiles wide">
        ${Object.entries(NAME_PLUS).map(([id, n]) => tile(look.nfx === id, () => set('nfx', id),
          html`<${NameFx} p=${{ ...pv, flair: { ...pv.flair, nfx: id } }} text=${fname(me) || 'You'}/>`, n.name, n.blurb))}
        ${tile(!look.nfx, () => set('nfx', ''), html`<${NameFx} p=${{ ...pv, flair: { ...pv.flair, nfx: null } }} text=${fname(me) || 'You'}/>`, 'Your flair', 'keeps the gradient from Settings')}
      </div>`}
      ${tab === 'cover' && html`<div class="stiles wide">
        ${Object.entries(COVER_FX).map(([id, c]) => tile(look.cfx === id, () => set('cfx', id),
          html`<span class="stile-cover"><${CoverImg} p=${{ ...pv, flair: { ...pv.flair, cfx: id } }}/></span>`, c.name, c.blurb))}
        ${tile(!look.cfx, () => set('cfx', ''), html`<span class="stile-cover"><${CoverImg} p=${{ ...pv, flair: { ...pv.flair, cfx: null } }}/></span>`, 'None')}
      </div>`}
      ${tab === 'entrance' && html`<div class="stiles wide">
        ${Object.entries(ENTRANCES).map(([id, e]) => tile(look.efx === id, () => { set('efx', id); playFx(id === 'meteor' ? 'meteor' : id === 'bloom' ? 'bloom' : 'warp', { ms: 1800 }); },
          html`<span class=${'stile-fx fxi-' + id}><${Glyph} k=${id === 'warp' ? 'rocket' : id === 'meteor' ? 'comet' : 'burst'} size=${22}/></span>`, e.name, e.blurb))}
        ${tile(!look.efx, () => set('efx', ''), html`<span class="stile-fx"><${Glyph} k="user" size=${22}/></span>`, 'None')}
      </div>
      <div class="small" style="margin-top:6px">Tap one to watch it. It plays for friends each time they open your profile.</div>`}
      ${tab === 'msg' && html`<div class="stiles wide">
        ${Object.entries(MSG_FX).map(([id, f]) => tile(false, () => playFx(id),
          html`<span class=${'stile-fx fxm-' + id}><${Glyph} k=${f.g} size=${22}/></span>`, f.name, 'tap to preview'))}
      </div>
      <div class="small" style="margin-top:6px">In any chat, type a message and tap the <b>sparkle</b> next to send. It plays on their screen when it arrives.</div>`}

      ${tab !== 'msg' && (plus
        ? html`<button class="btn btn-grad btn-block" style="margin-top:12px" disabled=${!dirty || saving} onClick=${save}>${saving ? 'Saving…' : dirty ? 'Save my look' : 'Saved'}</button>`
        : html`<button class="btn btn-grad btn-block" style="margin-top:12px" onClick=${() => document.getElementById('plus-code')?.focus()}>Keep this look with Orbit+</button>`)}
    </div>

    <div class="tierbox">
      <div class="flabel" style="margin:0 0 8px">${tier ? `Your badge · ${tier.name}` : 'A badge that grows with you'}</div>
      <div class="tierline">${PLUS_TIERS.map((t, i) => { const got = tier && tier.months >= t.m;
        return html`<div key=${t.key} class=${'tierstep' + (got ? ' got' : '') + (tier?.key === t.key ? ' cur' : '')}>
          <span class=${'plustier t-' + t.key}><${Glyph} k=${t.g} size=${12}/></span><b>${t.name}</b><em>${t.m ? `${t.m} mo` : 'day 1'}</em></div>`; })}</div>
      ${tier?.next && html`<div class="small" style="margin-top:8px">${Math.ceil(tier.toNext * 30)} days to ${tier.next.name}. Letting Plus lapse starts the badge over.</div>`}
    </div>

    <div class="perkgrid">${PERKS.map(p => html`<div key=${p.t} class="perk">
      <span class="perkico"><${Glyph} k=${p.g} size=${18}/></span>
      <div><div class="perk-t">${p.t}</div><div class="perk-d">${p.d}</div></div>
    </div>`)}</div>

    <div class="flabel">${plus ? 'Add more time' : 'Have a code?'}</div>
    <div style="display:flex;gap:8px">
      <input id="plus-code" class="input" value=${code} maxlength="16" placeholder="ABCD-EFGH-JKLM" autocapitalize="characters" spellcheck="false"
        style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em"
        onInput=${e => { setCode(e.target.value); setErr(''); }} onKeyDown=${e => { if (e.key === 'Enter') redeem(); }}/>
      <button class="btn btn-grad" style="flex:none" disabled=${busy || code.trim().length < 12} onClick=${redeem}>${busy ? '…' : 'Redeem'}</button>
    </div>
    ${err && html`<div class="hint" style="color:#ff9db8">${err}</div>`}
    <div class="hint">Get a code from the Orbit team — ask at the booth or message a founder. Codes stack: redeeming adds days on top of what you have.</div>
  </div>`;
}
