/* Orbit — Orbit+, the paid tier. See GUIDE.md for the full map.

   There is no payment processor (Orbit has to stay free to run), so Orbit+ is
   sold the low-tech way: the founder takes payment however they like (GCash,
   cash at the org booth) and hands over a redeem code made in Mission Control
   → Orbit+. Codes stack, and the founder can also grant days to anyone. When a
   real processor is wired in later, its webhook only has to call the same
   thing staff_grant_plus() does — nothing on this page changes.

   What Plus buys is deliberately cosmetic or convenience, never safety or
   reach: nobody pays to see more of someone than a free friend can. */
import { html, useState } from './lib.js';
import { AURAS, Glyph, IcX, THEMES, CHAT_THEMES, fname, flairOf, isPlus, sb } from './core.js';
import { Avatar } from './components.js';

export const PERKS = [
  { g: 'orbit',  t: 'Aura',              d: 'An animated ring around your avatar — a circling moon, a halo, a comet. Everyone sees it, everywhere.' },
  { g: 'plus',   t: 'Orbit+ badge',      d: 'A badge on your profile and next to your name.' },
  { g: 'clock',  t: 'Send later',        d: 'Write a message now, have Orbit deliver it at 7:00 tomorrow. Made for group-project reminders.' },
  { g: 'camera', t: 'HD stories & snaps',d: 'Photos up to 2160px and 1080p video, instead of the standard 1440px / 720p.' },
  { g: 'palette',t: 'Exclusive themes',  d: 'Supernova and Eclipse app themes, plus Holo, Galaxy and 24K chat bubbles.' },
  { g: 'megaph', t: 'No ads',            d: 'The sponsored cards on Home, in Chats and between stories disappear.' },
];
export const plusThemes = () => Object.entries(THEMES).filter(([, t]) => t.plus).map(([id]) => id);
export const plusChatThemes = () => Object.entries(CHAT_THEMES).filter(([, t]) => t.plus).map(([id]) => id);

export const PlusBadge = ({ p, size = 11 }) => isPlus(p)
  ? html`<span class="plustag" title="Orbit+ member"><${Glyph} k="plus" size=${size}/> Orbit+</span>` : null;

export function PlusPage({ me, saveProfile, onRedeemed, onClose }) {
  const plus = isPlus(me);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fl = flairOf(me);
  const aura = fl.aura || '';
  const until = plus ? new Date(me.plus_until) : null;

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
  const pickAura = a => saveProfile({ flair: { ...fl, aura: a || undefined } }, true);

  return html`<div class="plus">
    <div class="sheethead">
      <div class="plushero-t"><span class="plusmark"><${Glyph} k="plus" size=${18}/></span> Orbit<b>+</b></div>
      <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button>
    </div>
    <div class="plushero">
      <div class="plushero-av"><${Avatar} p=${{ ...me, plus_until: me?.plus_until || new Date(Date.now() + 864e5).toISOString(), flair: { ...fl, aura: aura || 'orbit' } }} size=${66}/></div>
      <div style="min-width:0">
        <div class="plushero-h">${plus ? `You're Plus, ${fname(me) || 'friend'}` : 'Make your orbit glow'}</div>
        <div class="plushero-s">${plus
          ? `Active until ${until.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
          : 'Cosmetics and conveniences. Nothing that makes Orbit worse for anyone who doesn’t pay.'}</div>
      </div>
    </div>

    <div class="perkgrid">${PERKS.map(p => html`<div key=${p.t} class="perk">
      <span class="perkico"><${Glyph} k=${p.g} size=${18}/></span>
      <div><div class="perk-t">${p.t}</div><div class="perk-d">${p.d}</div></div>
    </div>`)}</div>

    ${plus && html`<div class="flabel">Your aura</div>
      <div class="aurapick">
        <button class=${'aurabtn' + (!aura ? ' on' : '')} onClick=${() => pickAura('')}>
          <${Avatar} p=${{ ...me, flair: { ...fl, aura: null } }} size=${42}/><span>None</span></button>
        ${Object.entries(AURAS).map(([id, a]) => html`<button key=${id} class=${'aurabtn' + (aura === id ? ' on' : '')} title=${a.blurb} onClick=${() => pickAura(id)}>
          <${Avatar} p=${{ ...me, flair: { ...fl, aura: id } }} size=${42}/><span>${a.name}</span></button>`)}
      </div>
      <div class="small" style="margin-top:6px">Themes are in Settings → Color theme; chat bubbles in any chat → Personalize.</div>`}

    <div class="flabel">${plus ? 'Add more time' : 'Have a code?'}</div>
    <div style="display:flex;gap:8px">
      <input class="input" value=${code} maxlength="16" placeholder="ABCD-EFGH-JKLM" autocapitalize="characters" spellcheck="false"
        style="font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:.08em"
        onInput=${e => { setCode(e.target.value); setErr(''); }} onKeyDown=${e => { if (e.key === 'Enter') redeem(); }}/>
      <button class="btn btn-grad" style="flex:none" disabled=${busy || code.trim().length < 12} onClick=${redeem}>${busy ? '…' : 'Redeem'}</button>
    </div>
    ${err && html`<div class="hint" style="color:#ff9db8">${err}</div>`}
    <div class="hint">Get a code from the Orbit team — ask at the booth or message a founder. Codes stack: redeeming adds days on top of what you have.</div>
  </div>`;
}
