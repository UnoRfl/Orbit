/* Orbit — 24-hour media: capture, re-encode, upload, view.
   See GUIDE.md for the full map of what lives where.

   Stories and chat snaps share this file. The life of a photo or video:

     camera / gallery ──► re-encode on the device ──► private bucket `ephemeral`
          ──► a `media` row (expires_at = now + 24h, set by the DB, not us)
          ──► friends read it through RLS ──► 24h later RLS hides it, and the
              ephemeral-sweep edge function deletes the file and the row.

   Why re-encode here: a phone photo is 3-6 MB and a phone video ~40 MB a
   minute; after this pass they are ~200 KB and ~1.6 Mbit/s. That is what keeps
   Orbit on Supabase's free 1 GB. It also drops EXIF (GPS included), because
   what we upload is pixels drawn onto a canvas, not the original file.

   Files are fetched with the user's own session (storage.download) and shown
   from blob: URLs, never from signed links — a signed URL is a bearer link that
   would work for anyone it got pasted to. Web pages cannot block screenshots;
   what we can do (no download button, no context menu, no drag) we do. */
import { html, useEffect, useRef, useState } from './lib.js';
import { Glyph, IcX, MEDIA, isPlus, leftLabel, sb, ui } from './core.js';
import { Portal } from './components.js';

export const BUCKET = 'ephemeral';

/* ---------------- pure helpers (unit-tested) ---------------- */
export const extOf = type => {
  const t = String(type || '').toLowerCase();
  return /mp4/.test(t) ? 'mp4' : /webm/.test(t) ? 'webm' : /quicktime/.test(t) ? 'mov'
    : /webp/.test(t) ? 'webp' : /png/.test(t) ? 'png' : /gif/.test(t) ? 'gif' : 'jpg';
};
export const mimeOfExt = e => ({ mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', webp:'image/webp',
  png:'image/png', gif:'image/gif', jpg:'image/jpeg' })[e] || 'application/octet-stream';
// scale to fit a long side, rounded to even numbers (H.264 refuses odd sizes)
export const fitSize = (w, h, max) => {
  const k = Math.min(1, max / Math.max(w || 1, h || 1));
  return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)];
};
// video "720p" means the SHORT side: a portrait phone clip stays 720×1280, not 406×720
export const fitShort = (w, h, side) => {
  const k = Math.min(1, side / Math.max(1, Math.min(w || 1, h || 1)));
  return [Math.max(2, Math.round((w * k) / 2) * 2), Math.max(2, Math.round((h * k) / 2) * 2)];
};
/* Does this video need a re-encode before upload? Too long, too big, or a
   container other browsers can't be trusted to play (iPhone .mov). */
export const needsTranscode = ({ duration, bytes, type }, maxSec, plus) =>
  duration > maxSec + 0.3 || bytes > (plus ? 24 : 12) * 1024 * 1024 || /quicktime/i.test(type || '');
export const randomKey = (n = 16) => {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = ''; for (const x of b) s += a[x & 63]; return s;
};

/* ---------------- encoding ---------------- */
export function recorderMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  // mp4 first: it plays everywhere, including iPhones that choke on webm
  for (const t of ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus',
                   'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return null;
}
export const canTranscode = () => !!recorderMime() && typeof HTMLCanvasElement !== 'undefined'
  && !!HTMLCanvasElement.prototype.captureStream;

const once = (el, ev) => new Promise((res, rej) => {
  const ok = () => { off(); res(); }, bad = () => { off(); rej(new Error('media error')); };
  const off = () => { el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
  el.addEventListener(ev, ok); el.addEventListener('error', bad);
});

async function loadBitmap(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch {
    const u = URL.createObjectURL(blob);
    try { const im = new Image(); im.src = u; await im.decode(); return im; }
    finally { setTimeout(() => URL.revokeObjectURL(u), 1000); }
  }
}
const canvasBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));

export async function prepImage(file, plus) {
  const bmp = await loadBitmap(file);
  const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
  // an animated GIF would lose its animation on a canvas — send small ones as-is
  if (file.type === 'image/gif' && file.size <= 8 * 1024 * 1024) return { blob: file, ext: 'gif', kind: 'image', width: W, height: H };
  const [w, h] = fitSize(W, H, plus ? MEDIA.img.plus : MEDIA.img.free);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  let blob = await canvasBlob(c, 'image/webp', MEDIA.img.q);
  if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(c, 'image/jpeg', MEDIA.img.q);   // older Safari
  if (!blob) throw new Error("Couldn't read that photo");
  return { blob, ext: extOf(blob.type), kind: 'image', width: w, height: h };
}

export function probeVideo(blob) {
  return new Promise((res, rej) => {
    const v = document.createElement('video'), u = URL.createObjectURL(blob);
    const done = d => { const out = { duration: d, width: v.videoWidth, height: v.videoHeight }; URL.revokeObjectURL(u); res(out); };
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => {
      if (Number.isFinite(v.duration)) return done(v.duration);
      // MediaRecorder webm reports Infinity until you seek past the end
      v.ontimeupdate = () => { v.ontimeupdate = null; done(Number.isFinite(v.duration) ? v.duration : v.currentTime); };
      v.currentTime = 1e9;
    };
    v.onerror = () => { URL.revokeObjectURL(u); rej(new Error("That video can't be played in this browser")); };
    v.src = u;
  });
}

/* Replays the chosen window of a video into a canvas and records the canvas.
   Real-time (a 10s clip takes ~10s), silent while it runs (the audio is routed
   into the recording, not the speakers), and the only way a browser can trim
   and shrink a video without shipping a 25 MB ffmpeg build. */
export async function transcodeVideo(blob, { start = 0, dur, side, bps, onProgress }) {
  const mime = recorderMime();
  if (!mime || !canTranscode()) throw new Error("This browser can't trim video — pick a shorter clip");
  const v = document.createElement('video'), src = URL.createObjectURL(blob);
  v.playsInline = true; v.preload = 'auto'; v.src = src;
  let ac = null, stream = null, raf = 0, guard = 0;
  try {
    await once(v, 'loadedmetadata');
    const [w, h] = fitShort(v.videoWidth, v.videoHeight, side);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    stream = c.captureStream(30);
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dst = ac.createMediaStreamDestination();
      ac.createMediaElementSource(v).connect(dst);
      dst.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      if (ac.state === 'suspended') await ac.resume().catch(() => {});
    } catch { /* no audio track — still a valid clip */ }
    v.currentTime = Math.max(0, start);
    await once(v, 'seeked');
    g.drawImage(v, 0, 0, w, h);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 96_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    const end = start + dur;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; v.pause(); try { rec.stop(); } catch {} };
    const tick = () => {
      g.drawImage(v, 0, 0, w, h);
      onProgress?.(Math.min(1, Math.max(0, (v.currentTime - start) / dur)));
      if (v.currentTime >= end || v.ended) return finish();
      raf = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    v.addEventListener('ended', finish);
    rec.start(250);
    try { await v.play(); } catch { v.muted = true; await v.play(); }
    tick();
    guard = setTimeout(finish, (dur + 4) * 1000);
    await stopped;
    const out = new Blob(chunks, { type: mime.split(';')[0] });
    if (!out.size) throw new Error("Couldn't process that video");
    return { blob: out, ext: extOf(out.type), kind: 'video', duration: Math.min(dur, Math.max(0.1, v.currentTime - start)), width: w, height: h };
  } finally {
    clearTimeout(guard);
    if (raf && v.cancelVideoFrameCallback) try { v.cancelVideoFrameCallback(raf); } catch {}
    stream?.getTracks().forEach(t => t.stop());
    ac?.close?.().catch?.(() => {});
    v.removeAttribute('src'); v.load?.();
    URL.revokeObjectURL(src);
  }
}

/* ---------------- storage ---------------- */
export function mediaError(e) {
  const m = String(e?.message || e || '');
  return /rate limit/i.test(m) ? 'Slow down — try again in a bit'
    : /paused/i.test(m) ? m
    : /30 stories/i.test(m) ? m
    : /restricted|suspend/i.test(m) ? 'Your account is restricted right now'
    : /not friends/i.test(m) ? "You two aren't friends anymore"
    : /blocked/i.test(m) ? "You can't send to this person"
    : /exceeded|too large|size/i.test(m) ? 'That file is too big'
    : /mime|type/i.test(m) ? "That file type isn't supported"
    : /media_len/i.test(m) ? 'That clip is too long'
    : m.length < 90 && m ? m : "Couldn't send that — try again";
}

/* upload the file, then register the row; if the row is refused, take the
   file back out so a failed post never leaves anything behind */
export async function publishMedia({ uid, enc, purpose, extra = {} }) {
  const path = `${uid}/${randomKey()}.${enc.ext}`;
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, enc.blob,
    { contentType: enc.blob.type || mimeOfExt(enc.ext), upsert: false, cacheControl: '3600' });
  if (upErr) throw upErr;
  const row = { purpose, kind: enc.kind, path, width: enc.width || null, height: enc.height || null,
    bytes: enc.blob.size, duration: enc.kind === 'video' ? Math.round((enc.duration || 0) * 10) / 10 : null, ...extra };
  const { data, error } = await sb.from('media').insert(row).select().single();
  if (error) { sb.storage.from(BUCKET).remove([path]).catch(() => {}); throw error; }
  return data;
}

// session cache of blob: URLs, oldest evicted first
const blobs = new Map();
export async function mediaBlobUrl(path) {
  if (blobs.has(path)) { const u = blobs.get(path); blobs.delete(path); blobs.set(path, u); return u; }
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  const u = URL.createObjectURL(data);
  blobs.set(path, u);
  while (blobs.size > 48) { const [k, old] = blobs.entries().next().value; blobs.delete(k); URL.revokeObjectURL(old); }
  return u;
}
export function forgetMedia(path) { const u = blobs.get(path); if (u) { blobs.delete(path); URL.revokeObjectURL(u); } }

export function useMediaUrl(path) {
  const [url, setUrl] = useState(() => (path && blobs.get(path)) || null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; setFailed(false);
    if (!path) { setUrl(null); return; }
    mediaBlobUrl(path).then(u => { if (!live) return; if (u) setUrl(u); else setFailed(true); });
    return () => { live = false; };
  }, [path]);
  return { url, failed };
}

const noSave = { onContextMenu: e => e.preventDefault(), draggable: false };

/* ---------------- camera ---------------- */
/* Tap for a photo, hold for video — the ring fills over maxSec and the
   recording stops itself there, which is how a story is kept to 10 seconds. */
export function Camera({ maxSec, plus, onCapture, onClose }) {
  const vid = useRef(null), streamRef = useRef(null), recRef = useRef(null), holdT = useRef(0), startAt = useRef(0), stopT = useRef(0);
  const [facing, setFacing] = useState('user');
  const [err, setErr] = useState('');
  const [rec, setRec] = useState(false);
  const mime = recorderMime();

  useEffect(() => {
    let dead = false;
    (async () => {
      setErr('');
      streamRef.current?.getTracks().forEach(t => t.stop());
      const q = plus ? MEDIA.vid.plus.side : MEDIA.vid.free.side;
      const video = { facingMode: facing, width: { ideal: Math.round(q * 16 / 9) }, height: { ideal: q } };
      let s = null;
      try { s = await navigator.mediaDevices.getUserMedia({ video, audio: !!mime }); }
      catch { try { s = await navigator.mediaDevices.getUserMedia({ video, audio: false }); } catch (e) {
        if (!dead) setErr(/NotAllowed|Permission/i.test(e?.name || e?.message) ? 'Camera access is blocked for Orbit' : 'No camera found on this device'); return; } }
      if (dead) { s.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = s;
      if (vid.current) { vid.current.srcObject = s; vid.current.play().catch(() => {}); }
    })();
    return () => { dead = true; };
  }, [facing]);
  useEffect(() => () => { clearTimeout(holdT.current); clearTimeout(stopT.current); streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const photo = async () => {
    const v = vid.current; if (!v || !v.videoWidth) return;
    const [w, h] = fitSize(v.videoWidth, v.videoHeight, plus ? MEDIA.img.plus : MEDIA.img.free);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (facing === 'user') { g.translate(w, 0); g.scale(-1, 1); }          // keep the selfie the way you saw it
    g.drawImage(v, 0, 0, w, h);
    let blob = await canvasBlob(c, 'image/webp', MEDIA.img.q);
    if (!blob || blob.type !== 'image/webp') blob = await canvasBlob(c, 'image/jpeg', MEDIA.img.q);
    onCapture({ blob, ext: extOf(blob.type), kind: 'image', width: w, height: h, fresh: true });
  };
  const startRec = () => {
    if (!mime || !streamRef.current) return;
    const r = new MediaRecorder(streamRef.current, { mimeType: mime,
      videoBitsPerSecond: plus ? MEDIA.vid.plus.bps : MEDIA.vid.free.bps, audioBitsPerSecond: 96_000 });
    const chunks = [];
    r.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    r.onstop = () => {
      setRec(false);
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      const s = streamRef.current?.getVideoTracks()[0]?.getSettings?.() || {};
      if (blob.size) onCapture({ blob, ext: extOf(blob.type), kind: 'video', fresh: true,
        duration: Math.min(maxSec, (performance.now() - startAt.current) / 1000), width: s.width || null, height: s.height || null });
    };
    recRef.current = r; startAt.current = performance.now();
    r.start(250); setRec(true);
    stopT.current = setTimeout(stopRec, maxSec * 1000);
  };
  const stopRec = () => { clearTimeout(stopT.current); const r = recRef.current; recRef.current = null; if (r && r.state !== 'inactive') r.stop(); };
  const down = e => { e.preventDefault(); holdT.current = setTimeout(() => { holdT.current = 0; startRec(); }, 260); };
  const up = e => { e.preventDefault(); if (holdT.current) { clearTimeout(holdT.current); holdT.current = 0; photo(); } else stopRec(); };

  return html`<div class="cam">
    <video ref=${vid} class=${'camfeed' + (facing === 'user' ? ' mirror' : '')} autoplay playsinline muted></video>
    ${err && html`<div class="camerr"><${Glyph} k="camera" size=${28}/><div>${err}</div>
      <div class="small">You can still pick a photo or video from your gallery.</div></div>`}
    <div class="camtop">
      <button class="camico" aria-label="Close camera" onClick=${onClose}><${IcX} size=${18}/></button>
      <span class="campill">${rec ? html`<span class="recdot"></span>recording` : mime ? `tap photo · hold video ≤ ${maxSec}s` : 'photos only in this browser'}</span>
      <button class="camico" aria-label="Flip camera" onClick=${() => setFacing(f => f === 'user' ? 'environment' : 'user')}><${Glyph} k="flip" size=${18}/></button>
    </div>
    <div class="cambot">
      <button class=${'shutter' + (rec ? ' rec' : '')} style=${`--rs:${maxSec}s`} aria-label="Tap for a photo, hold to record"
        onPointerDown=${down} onPointerUp=${up} onPointerLeave=${e => { if (rec) up(e); }} onContextMenu=${e => e.preventDefault()}>
        <svg viewBox="0 0 80 80" aria-hidden="true"><circle class="shr-bg" cx="40" cy="40" r="36"/><circle class="shr-fg" cx="40" cy="40" r="36"/></svg>
        <span class="shcore"></span>
      </button>
    </div>
  </div>`;
}

/* ---------------- composer (stories + chat) ---------------- */
/* One flow for both: pick (camera / gallery) → edit (trim, caption, audience
   or view-once) → encode → upload. `purpose` decides the limits and options. */
export function MediaComposer({ uid, me, purpose, allowViewOnce = false, place = null, hasClose = false, onPosted, onClose, onPlus }) {
  const plus = isPlus(me);
  const maxSec = purpose === 'story' ? MEDIA.storyMaxSec : MEDIA.chatMaxSec;
  const [stage, setStage] = useState('pick');         // pick | camera | edit | busy
  const [src, setSrc] = useState(null);               // { blob|file, kind, duration, width, height, url, fresh, ext }
  const [trim, setTrim] = useState(0);
  const [caption, setCaption] = useState('');
  const [usePlace, setUsePlace] = useState(!!place);
  const [aud, setAud] = useState('friends');
  const [vo, setVo] = useState(false);
  const [prog, setProg] = useState({ label: '', p: 0 });
  const fileRef = useRef(null), prevRef = useRef(null);

  useEffect(() => () => { if (src?.url) URL.revokeObjectURL(src.url); }, [src]);
  // loop the preview inside the trim window
  useEffect(() => {
    const v = prevRef.current; if (!v || src?.kind !== 'video') return;
    const len = Math.min(maxSec, src.duration || maxSec);
    const f = () => { if (v.currentTime < trim || v.currentTime > trim + len) v.currentTime = trim; };
    v.currentTime = trim; v.addEventListener('timeupdate', f);
    return () => v.removeEventListener('timeupdate', f);
  }, [trim, src]);

  const take = async cap => {
    const url = URL.createObjectURL(cap.blob);
    let meta = {};
    if (cap.kind === 'video' && !cap.fresh) {
      try { meta = await probeVideo(cap.blob); }
      catch (e) { URL.revokeObjectURL(url); ui.toast(e.message); setStage('pick'); return; }
    }
    setTrim(0); setSrc({ ...cap, ...meta, duration: cap.duration ?? meta.duration, url }); setStage('edit');
  };
  const pickFile = async e => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const kind = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : null;
    if (!kind) { ui.toast('Pick a photo or a video'); return; }
    if (f.size > 400 * 1024 * 1024) { ui.toast('That file is too big'); return; }
    take({ blob: f, kind, ext: extOf(f.type), fresh: false });
  };

  const send = async () => {
    if (!src) return;
    setStage('busy');
    try {
      let enc;
      if (src.kind === 'image') {
        setProg({ label: 'Compressing', p: .3 });
        enc = src.fresh ? { ...src } : await prepImage(src.blob, plus);
      } else {
        const len = Math.min(maxSec, src.duration || maxSec);
        const q = plus ? MEDIA.vid.plus : MEDIA.vid.free;
        if (!src.fresh && needsTranscode({ duration: src.duration, bytes: src.blob.size, type: src.blob.type }, maxSec, plus)) {
          setProg({ label: 'Trimming & compressing', p: 0 });
          enc = await transcodeVideo(src.blob, { start: trim, dur: len, side: q.side, bps: q.bps,
            onProgress: p => setProg({ label: 'Trimming & compressing', p: p * .9 }) });
        } else {
          enc = { blob: src.blob, ext: src.ext || extOf(src.blob.type), kind: 'video', duration: src.duration, width: src.width, height: src.height };
        }
      }
      if (enc.blob.size > MEDIA.maxBytes) throw new Error('That file is too big');
      setProg({ label: 'Sending', p: .94 });
      const extra = purpose === 'story'
        ? { audience: hasClose ? aud : 'friends', caption: caption.trim().slice(0, 140) || null, place: usePlace && place ? place.slice(0, 60) : null }
        : { view_once: allowViewOnce && vo };
      const ok = await onPosted(enc, extra);
      if (ok === false) setStage('edit');
    } catch (e) {
      ui.toast(mediaError(e));
      setStage('edit');
    }
  };

  const len = src?.kind === 'video' ? Math.min(maxSec, src.duration || maxSec) : 0;
  const long = src?.kind === 'video' && !src.fresh && (src.duration || 0) > maxSec + 0.3;

  return html`<div class="mcomp" role="dialog" aria-modal="true" aria-label=${purpose === 'story' ? 'New story' : 'Send a photo or video'}>
    ${stage === 'camera' && html`<${Camera} maxSec=${maxSec} plus=${plus} onCapture=${take} onClose=${() => setStage('pick')}/>`}

    ${stage === 'pick' && html`<div class="mpick">
      <div class="mhead">
        <div>
          <div class="eyebrow" style="color:var(--ge)">${purpose === 'story' ? 'New story' : 'Photo or video'}</div>
          <div class="mtitle">${purpose === 'story' ? 'Up for 24 hours, then gone' : 'Visible for 24 hours'}</div>
        </div>
        <button class="xbtn" aria-label="Close" onClick=${onClose}><${IcX} size=${16}/></button>
      </div>
      <div class="mtiles">
        <button class="mtile" onClick=${() => setStage('camera')}><span class="mtico"><${Glyph} k="camera" size=${26}/></span>
          <b>Camera</b><span>tap · photo &nbsp; hold · video</span></button>
        <button class="mtile" onClick=${() => fileRef.current?.click()}><span class="mtico alt"><${Glyph} k="image" size=${26}/></span>
          <b>Gallery</b><span>photo or video ≤ ${maxSec}s${purpose === 'story' ? '' : ' (longer gets trimmed)'}</span></button>
      </div>
      <input ref=${fileRef} type="file" accept="image/*,video/*" hidden onChange=${pickFile}/>
      <div class="mfine"><${Glyph} k="hourgl" size=${13}/> Orbit never keeps these: after 24 hours the file is deleted from our servers.
        ${plus ? ' HD quality is on (Orbit+).' : ''}</div>
    </div>`}

    ${(stage === 'edit' || stage === 'busy') && src && html`<div class="medit">
      <div class="mstage">
        ${src.kind === 'image'
          ? html`<img src=${src.url} alt="" ...${noSave}/>`
          : html`<video ref=${prevRef} src=${src.url} autoplay loop muted playsinline ...${noSave}></video>`}
        ${purpose === 'story' && (caption.trim() || (usePlace && place)) && html`<div class="story-cap">
          ${usePlace && place && html`<span class="story-place"><${Glyph} k="pin" size=${12}/> ${place}</span>`}
          ${caption.trim() && html`<span>${caption.trim()}</span>`}</div>`}
        <button class="camico mclose" aria-label="Back" disabled=${stage === 'busy'} onClick=${() => { setSrc(null); setStage('pick'); }}><${IcX} size=${18}/></button>
        ${stage === 'busy' && html`<div class="mbusy"><div class="mbar"><i style=${`width:${Math.round(prog.p * 100)}%`}></i></div>
          <span>${prog.label}${prog.p > 0 && prog.p < .92 ? ` · ${Math.round(prog.p * 100)}%` : '…'}</span></div>`}
      </div>
      <div class="mopts">
        ${long && html`<div class="mtrim">
          <div class="flabel" style="margin:0 0 6px">Pick your ${maxSec} seconds · ${trim.toFixed(1)}s → ${(trim + len).toFixed(1)}s</div>
          <input type="range" min="0" max=${Math.max(0, (src.duration || 0) - len)} step="0.1" value=${trim}
            onInput=${e => setTrim(Number(e.target.value))} disabled=${stage === 'busy'} aria-label="Trim start"/>
          ${!canTranscode() && html`<div class="small" style="color:var(--now)">This browser can't trim — pick a clip ≤ ${maxSec}s.</div>`}
        </div>`}
        ${purpose === 'story' && html`
          <input class="input" maxlength="140" placeholder="Add a caption…" value=${caption} onInput=${e => setCaption(e.target.value)} disabled=${stage === 'busy'}/>
          <div class="chiprow" style="margin-top:8px">
            ${place && html`<button class=${'pill' + (usePlace ? ' on-teal' : '')} onClick=${() => setUsePlace(v => !v)}><${Glyph} k="pin" size=${13}/> ${place}</button>`}
            <button class=${'pill' + (aud === 'friends' ? ' on' : '')} onClick=${() => setAud('friends')}><${Glyph} k="users" size=${13}/> Friends</button>
            <button class=${'pill' + (aud === 'close' ? ' on-teal' : '')} disabled=${!hasClose}
              title=${hasClose ? '' : 'Add close friends in Settings first'} onClick=${() => setAud('close')}><${Glyph} k="close" size=${13}/> Close friends</button>
          </div>`}
        ${purpose === 'chat' && allowViewOnce && html`<button class=${'pill' + (vo ? ' on' : '')} style="align-self:flex-start" onClick=${() => setVo(v => !v)}>
          <${Glyph} k="once" size=${14}/> View once ${vo ? '· on' : ''}</button>`}
        <div style="display:flex;gap:8px;align-items:center;margin-top:10px">
          <div class="small" style="flex:1;line-height:1.4">${plus ? html`<span class="plustag"><${Glyph} k="plus" size=${11}/> HD</span> ` : html`Standard quality · <button class="linkbtn" onClick=${onPlus}>HD with Orbit+</button> `}
            · gone in 24h</div>
          <button class="btn btn-grad" style="flex:none;padding:11px 18px" disabled=${stage === 'busy' || (long && !canTranscode())} onClick=${send}>
            ${purpose === 'story' ? 'Share story' : 'Send'}</button>
        </div>
      </div>
    </div>`}
  </div>`;
}

/* ---------------- viewing ---------------- */
export function MediaFull({ url, kind, onClose, children }) {
  useEffect(() => {
    const f = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  }, []);
  return html`<${Portal}><div class="lightbox mfull" onClick=${onClose}>
    ${kind === 'video'
      ? html`<video src=${url} autoplay playsinline controls controlsList="nodownload noplaybackrate" disablepictureinpicture
          onClick=${e => e.stopPropagation()} ...${noSave}></video>`
      : html`<img src=${url} alt="" ...${noSave}/>`}
    ${children}
  </div><//>`;
}

/* A chat message whose body is a media id. The row is fetched through RLS, so
   "expired", "opened (view once)" and "removed" all look the same from here:
   the row simply isn't visible any more. */
/* A chat message whose body is a media id. The row is fetched through RLS, so
   "expired", "opened (view once)" and "removed" all look the same from here:
   the row simply isn't visible any more.

   View once burns for the RECEIVER only. The sender keeps an ordinary
   thumbnail they can reopen, with a chip saying whether it has been opened;
   the server agrees (media_open() ignores the owner, and the owner can always
   read their own row until it expires). */
export function SnapBubble({ m, mine, row, onLoad, onOpenOnce }) {
  const [burnt, setBurnt] = useState(false);          // receiver: viewed it once, it's gone
  const [full, setFull] = useState(null);
  const gone = row === false || (row && Date.parse(row.expires_at) <= Date.now());
  const once = !!row?.view_once && !mine;
  const { url, failed } = useMediaUrl(!gone && row && !once ? row.path : null);
  if (row === undefined) return html`<div class="snap loading"><${Glyph} k="image" size=${16}/> loading…</div>`;
  if (once && full) return html`<div class="snap once"><${Glyph} k="once" size=${16}/> Viewing…
    <${MediaFull} url=${full.url} kind=${full.kind} onClose=${() => { forgetMedia(row.path); setFull(null); setBurnt(true); }}/></div>`;
  if (burnt) return html`<div class="snap gone"><${Glyph} k="once" size=${15}/> Opened</div>`;
  if (gone || failed) return html`<div class="snap gone"><${Glyph} k="hourgl" size=${15}/>
    ${row ? (row.kind === 'video' ? 'Video' : 'Photo') + ' · expired' : 'Snap · opened or expired'}</div>`;
  if (once) return html`<button class="snap once" onClick=${async e => {
      e.stopPropagation();
      const u = await mediaBlobUrl(row.path);
      if (!u) { ui.toast('That snap is gone'); return; }
      setFull({ url: u, kind: row.kind });
      onOpenOnce?.(row);
    }}><${Glyph} k="once" size=${16}/> Tap to view · once <span class="snapleft">${leftLabel(row.expires_at)}</span></button>`;
  return html`<div class="snapwrap">
    ${url
      ? (row.kind === 'video'
          ? html`<video class="bubimg" src=${url} muted loop autoplay playsinline onLoadedData=${onLoad}
              onClick=${e => { e.stopPropagation(); setFull({ url, kind: 'video' }); }} ...${noSave}></video>`
          : html`<img class="bubimg" src=${url} alt="photo" onLoad=${onLoad}
              onClick=${e => { e.stopPropagation(); setFull({ url, kind: 'image' }); }} ...${noSave}/>`)
      : html`<div class="snap loading" style=${row.width && row.height ? `aspect-ratio:${row.width}/${row.height}` : ''}><${Glyph} k=${row.kind === 'video' ? 'video' : 'image'} size=${18}/></div>`}
    <span class="snapchip">${row.view_once ? html`<${Glyph} k="once" size=${11}/>${mine ? (row.opened_at ? ' opened · ' : ' not opened · ') : ''}` : ''}${row.kind === 'video' ? html`<${Glyph} k="video" size=${11}/>` : ''}${leftLabel(row.expires_at)}</span>
    ${full && html`<${MediaFull} url=${full.url} kind=${full.kind} onClose=${() => setFull(null)}/>`}
  </div>`;
}
