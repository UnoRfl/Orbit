/* Orbit — the Updates panel: the mission log, on its own.
   See GUIDE.md for the full map of what lives where.

   It used to be a tab inside the Map screen, which meant nobody saw a new
   update unless they happened to open the Map. It now lives behind its own
   top-bar button with an unread count. "Read" is per device and per account
   (localStorage), which is all an announcement feed needs — nothing to sync,
   nothing to store server-side. */
import { html, useEffect, useState } from './lib.js';
import { Glyph, IcPlus, IcSend, IcTrash, IcX, LOG_TAGS, Sym, UPDATE_SET, ago, glyphLabel } from './core.js';

const seenKey = uid => 'orbit.updatesSeen.' + uid;
export const updatesSeenAt = uid => { try { return Number(localStorage.getItem(seenKey(uid))) || 0; } catch { return 0; } };
const markSeen = uid => { try { localStorage.setItem(seenKey(uid), String(Date.now())); } catch {} };
export const unseenUpdates = (uid, updates) => {
  const t = updatesSeenAt(uid);
  return (updates || []).filter(u => u.author !== uid && Date.parse(u.created_at) > t).length;
};

// "Today", "This week", "This month", then month names — a changelog reads by when
function bucketOf(iso) {
  const d = new Date(iso), now = new Date();
  const days = (now - d) / 864e5;
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return d.toLocaleDateString(undefined, { month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function UpdatesPanel({ uid, updates, isFounder, nameOf, onPublish, onDelete, onClose }) {
  // snapshot the last visit BEFORE marking seen, so this visit still shows what's new
  const [since] = useState(() => updatesSeenAt(uid));
  const [tag, setTag] = useState('all');
  const [composing, setComposing] = useState(false);
  useEffect(() => { markSeen(uid); return () => markSeen(uid); }, [uid]);

  const list = (updates || []).filter(u => tag === 'all' || u.tag === tag);
  const groups = [];
  for (const u of list) {
    const b = bucketOf(u.created_at);
    if (!groups.length || groups[groups.length - 1].b !== b) groups.push({ b, items: [] });
    groups[groups.length - 1].items.push(u);
  }

  return html`<div class="upanel">
    <div class="sheethead">
      <div class="sheettitle gi"><${Glyph} k="radio" size=${18}/> Updates</div>
      <div style="display:flex;gap:8px">
        ${isFounder && !composing && html`<button class="sysedit" style="padding:7px 11px" onClick=${() => setComposing(true)}><${IcPlus} size=${12}/> Publish</button>`}
        <button class="xbtn" onClick=${onClose} aria-label="Close"><${IcX} size=${16}/></button>
      </div>
    </div>

    ${composing ? html`<${PublishUpdate} onClose=${() => setComposing(false)}
        onPublish=${async row => { if (await onPublish(row)) setComposing(false); }}/>` : html`
      <div class="pillrow" style="margin:-4px 0 12px">
        <button class=${'pill' + (tag === 'all' ? ' on' : '')} onClick=${() => setTag('all')}>All</button>
        ${Object.entries(LOG_TAGS).map(([k, T]) => html`<button key=${k} class=${'pill' + (tag === k ? ' on' : '')}
          style=${tag === k ? `border-color:${T.c};background:${T.c}1f;color:var(--ink)` : ''} onClick=${() => setTag(k)}>${T.l}</button>`)}
      </div>

      ${updates === null && html`<div class="small" style="padding:8px 2px">The mission log opens soon.</div>`}
      ${updates && !list.length && html`<div class="small" style="padding:8px 2px">${tag === 'all'
        ? `Nothing published yet${isFounder ? ' — write the first one' : ''}.` : 'Nothing with that tag yet.'}</div>`}

      <div class="utimeline">
        ${groups.map(g => html`<div key=${g.b} class="ugroup">
          <div class="ugroup-h">${g.b}</div>
          ${g.items.map(u => {
            const T = LOG_TAGS[u.tag] || LOG_TAGS.new;
            const fresh = u.author !== uid && Date.parse(u.created_at) > since;
            return html`<article key=${u.id} class=${'uitem' + (fresh ? ' fresh' : '')} style=${`--ut:${T.c}`}>
              <div class="uitem-dot"><${Sym} v=${u.emoji} size=${18} fallback="radio"/></div>
              <div class="uitem-b">
                <div class="uitem-top">
                  <span class="uitem-t">${u.title}</span>
                  <span class="logtag" style=${`color:${T.c};border-color:${T.c}55;background:${T.c}14`}>${T.l}</span>
                  ${fresh && html`<span class="unew" title="New since your last visit" aria-label="unread"></span>`}
                </div>
                ${u.body && html`<div class="uitem-body">${u.body}</div>`}
                <div class="small" style="margin-top:6px">${ago(u.created_at)} · ${u.author === uid ? 'you' : nameOf(u.author)}</div>
              </div>
              ${u.author === uid && isFounder && html`<button class="btn" style="padding:6px 9px;flex:none;align-self:flex-start"
                onClick=${() => onDelete(u.id)} aria-label="Delete update"><${IcTrash} size=${13}/></button>`}
            </article>`;
          })}
        </div>`)}
      </div>`}
  </div>`;
}

export function PublishUpdate({ onPublish, onClose }) {
  const [emoji, setEmoji] = useState('rocket');
  const [tag, setTag] = useState('new');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  return html`<div>
    <div class="sheethead"><div class="sheettitle">Publish an update</div>
      <button aria-label="Close" class="xbtn" onClick=${onClose}><${IcX} size=${16}/></button></div>
    <div class="hint" style="margin-top:-8px;margin-bottom:4px">Lands in everyone's Updates panel, live.</div>
    <div class="flabel">Emoji</div>
    <div class="glyphgrid">${UPDATE_SET.map(g=>html`<button key=${g} class=${'glyphbtn'+(emoji===g?' on':'')}
      aria-label=${glyphLabel(g)} title=${glyphLabel(g)} onClick=${()=>setEmoji(g)}><${Glyph} k=${g} size=${19}/></button>`)}</div>
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
