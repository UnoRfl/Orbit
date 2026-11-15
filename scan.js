/* Orbit — schedule-from-a-photo. See GUIDE.md for the full map of what lives where.

   A photo or screenshot of a registration form / COR / timetable becomes rows
   for ImportSheet to review. Everything runs on the device and costs nothing:
   Tesseract (vendored in /vendor) reads the picture, then the pure parsers
   below turn its words into classes.

   CSP note: the OCR worker is loaded from /vendor as a same-origin file, NOT a
   blob: URL. A worker fetched from a URL runs under its own response's policy
   (GitHub Pages sends none), so it can pull Tesseract's wasm core and the
   English model from jsdelivr without index.html's connect-src or script-src
   having to trust jsdelivr. Don't switch it to workerBlobURL: a blob worker
   inherits the page's CSP and the download would be blocked.

   Two layouts are understood:
   · LIST  — one class per line, as on a COR / registration form:
             "IT 101  Intro to Computing  MWF  8:00-9:00AM  CL3"
   · GRID  — a weekly timetable: a header row of day names, classes in the
             columns, times either written in the cell or read off the
             time labels down the left edge.
   Whatever comes out is shown as editable rows, so OCR slips are fixed by hand
   instead of silently imported. */
import { catOf } from './plans.js';

/* ---------------- time + day tokens ---------------- */

// OCR habitually reads 0 as O/o and : as . or ; — repair those only inside
// things that already look like times.
export function normalizeOcr(s) {
  return String(s || '')
    .replace(/[|]/g, ' ')
    .replace(/(\d)[oO](?=\d|\b)/g, '$10').replace(/\b[oO](\d)/g, '0$1')
    .replace(/(\d)\s*[;.,]\s*(\d{2})(?!\d)/g, '$1:$2')
    .replace(/(\d)\s*:\s*(\d)/g, '$1:$2')
    .replace(/[–—~]/g, '-')
    .replace(/\s+/g, ' ')
    // a blurry photo loses the colon: "8 00-9 00AM", "100-230PM"
    .replace(/\b(\d{1,2}) ([0-5]\d)(?=\s*(?:-|to\b|[ap]\.?m))/gi, '$1:$2')
    .replace(/((?:-|\bto)\s*)(\d{1,2}) ([0-5]\d)\b/gi, '$1$2:$3')
    .replace(/\b(\d|1\d|2[0-3])([0-5]\d)(?=\s*-\s*\d)/g, '$1:$2')
    .replace(/(-\s*)(\d|1\d|2[0-3])([0-5]\d)(?=\s*[ap]\.?m|\b)/gi, '$1$2:$3')
    .trim();
}

const T = String.raw`(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?\s*m?\.?)?`;
const RANGE_RE = new RegExp(String.raw`(?<![\d:])${T}\s*(?:-+|to)\s*${T}(?![\d:])`, 'gi');
const SINGLE_RE = new RegExp(String.raw`^${T}$`, 'i');

function to24(h, mm, ap) {
  if (h > 23 || mm > 59) return null;
  if (ap) { if (h < 1 || h > 12) return null; if (ap === 'p' && h < 12) h += 12; if (ap === 'a' && h === 12) h = 0; }
  return h * 60 + mm;
}
// a class schedule with no am/pm: 7–11 is morning, 12 is noon, 1–6 is afternoon
const bare = h => (h >= 1 && h <= 6 ? h + 12 : h);

export function resolveRange(h1, m1, a1, h2, m2, a2) {
  h1 = +h1; m1 = +(m1 || 0); h2 = +h2; m2 = +(m2 || 0);
  a1 = (a1 || '').toLowerCase(); a2 = (a2 || '').toLowerCase();
  if (h1 > 12 || h2 > 12) { a1 = ''; a2 = ''; }          // 24h clock
  // "10:30-12:00PM", "11-1PM": the start keeps its own half of the day
  if (!a1 && a2) a1 = a2 === 'a' ? 'a' : (h1 === 12 || (h1 <= h2 && h2 !== 12)) ? 'p' : 'a';
  if (a1 && !a2) a2 = a1 === 'a' && (h2 < h1 || h2 === 12) ? 'p' : a1;
  let s = a1 ? to24(h1, m1, a1) : to24(bare(h1), m1, '');
  let e = a2 ? to24(h2, m2, a2) : to24(bare(h2), m2, '');
  if (s == null || e == null) return null;
  if (e <= s && e + 720 <= 1440 && !a2) e += 720;
  if (!(e > s && e - s <= 6 * 60 && e - s >= 15)) return null;   // a class is 15 min – 6 h
  return { start_min: s, end_min: e };
}

export function findRanges(text) {
  const out = [];
  for (const m of text.matchAll(RANGE_RE)) {
    // a bare "3 - 4" is as likely units or a section as a time: need a colon or am/pm
    if (!m[2] && !m[3] && !m[5] && !m[6]) continue;
    const r = resolveRange(m[1], m[2], m[3], m[4], m[5], m[6]);
    if (r) out.push({ ...r, i: m.index, j: m.index + m[0].length });
  }
  return out;
}

export function parseSingleTime(w) {
  const m = normalizeOcr(w).replace(/\s+/g, '').match(SINGLE_RE);
  if (!m || (!m[2] && !m[3])) return null;
  const h = +m[1], mm = +(m[2] || 0), ap = (m[3] || '').toLowerCase();
  return ap ? to24(h, mm, ap) : to24(h > 12 ? h : bare(h), mm, '');
}

const FULL_DAYS = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5,
  mon: 0, tue: 1, tues: 1, wed: 2, weds: 2, thu: 3, thur: 3, thurs: 3, fri: 4, sat: 5 };

// "MWF", "TTh", "T/TH", "M-W", "TF", "Sat", "MTWThF" → [0,2,4] etc.
export function parseDayCode(tok) {
  const raw = String(tok || '').replace(/[.,]/g, '');
  const low = raw.toLowerCase();
  if (Object.hasOwn(FULL_DAYS, low)) return [FULL_DAYS[low]];
  const t = raw.replace(/[\/\-&]/g, '');
  if (!t || t.length > 9 || !/^[MTWHFSmtwhfsAaUu]+$/.test(t)) return null;
  const days = []; let i = 0;
  while (i < t.length) {
    const two = t.slice(i, i + 2), c = t[i];
    if (/^th$/i.test(two)) { days.push(3); i += 2; continue; }
    if (/^sa$/i.test(two)) { days.push(5); i += 2; continue; }
    if (/^tu$/i.test(two)) { days.push(1); i += 2; continue; }
    if (c === 'M' || c === 'm') days.push(0);
    else if (c === 'T') days.push(1);
    else if (c === 'W' || c === 'w') days.push(2);
    else if (c === 'H' || c === 'R') days.push(3);
    else if (c === 'F' || c === 'f') days.push(4);
    else if (c === 'S') days.push(5);
    else return null;                 // a lowercase t/h/s on its own is a word, not a code
    i++;
  }
  const uniq = [...new Set(days)];
  return uniq.length === days.length ? uniq.sort((a, b) => a - b) : null;
}

const ROOM_RE = /^(?:(?:rm|room|lab|bldg)\.?\s*[\w-]+|[A-Z]{1,5}-?\d{1,4}[A-Z]?|TBA|ONLINE|ONLINE\b.*)$/i;
// "Rm 204", "CL3", "GYM", "Room B-12" — the first room-looking thing in a few words
function pickRoom(ws) {
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (/^(rm|room|lab|bldg)\.?$/i.test(w) && ws[i + 1]) return `${w} ${ws[i + 1]}`;
    if ((ROOM_RE.test(w) || /^[A-Z]{2,6}$/.test(w)) && !parseDayCode(w)) return w;
  }
  return '';
}
const CODE_RE = /^[A-Z]{2,6}$/;
const NUM_RE = /^[\d.]+$/;

function cleanName(words) {
  let w = words.filter(x => x && !/^[^\w]+$/.test(x));
  // a units column sits right before the days: "Calculus 1 3 MWF" → drop the 3
  if (w.length > 1 && NUM_RE.test(w[w.length - 1])) w = w.slice(0, -1);
  // numbers survive only as part of a title ("Calculus 1", "Programming 2")
  w = w.filter((x, i) => !NUM_RE.test(x) || (i > 0 && /[a-z]/.test(w[i - 1]) && /^\d{1,2}$/.test(x)));
  // "IT 101 Intro to Computing" → keep the description, drop the course code
  const alpha = w.filter(x => /^[A-Za-z][a-z]{2,}/.test(x));
  if (alpha.length >= 1) {
    let k = 0;
    while (k < w.length && (CODE_RE.test(w[k]) || /^[A-Z]*\d+[A-Z]?$/.test(w[k]) || /^[A-Z]{2,6}-?\d+[A-Z]?$/.test(w[k]))) k++;
    if (w.length - k >= 1 && w.slice(k).some(x => /[a-z]{2}/.test(x))) w = w.slice(k);
  }
  return w.join(' ').replace(/\s+/g, ' ').replace(/^[^\w(]+|[^\w)]+$/g, '').slice(0, 80);
}

/* ---------------- LIST layout ---------------- */

export function parseListLines(lines) {
  const rows = []; let pendingName = '';
  for (const raw of lines) {
    const text = normalizeOcr(typeof raw === 'string' ? raw : raw.text);
    if (!text) continue;
    const ranges = findRanges(text);
    if (!ranges.length) {
      // a description line with no time: remember it for a time-only line below it
      const words = text.split(' ');
      const nm = cleanName(words);
      pendingName = /[A-Za-z]{3}/.test(nm) && !words.some(w => parseDayCode(w) && w.length > 1) ? nm : '';
      continue;
    }
    let cursor = 0; const used = new Set();
    const lineRows = [];
    ranges.forEach((r, ri) => {
      const before = text.slice(cursor, r.i).trim().split(' ').filter(Boolean);
      const after = text.slice(r.j, ranges[ri + 1]?.i ?? text.length).trim().split(' ').filter(Boolean);
      let days = null, dayAt = -1;
      for (let k = before.length - 1; k >= Math.max(0, before.length - 3); k--) {
        const d = parseDayCode(before[k]);
        if (d) { days = d; dayAt = k; break; }
      }
      let afterUsed = 0;
      if (!days && after.length) { const d = parseDayCode(after[0]); if (d) { days = d; afterUsed = 1; } }
      if (!days) return;
      let nameWords = dayAt >= 0 ? before.slice(0, dayAt) : before;
      let room = '';
      room = pickRoom(after.slice(afterUsed, afterUsed + 4));
      // "MWF 8:00-9:00 CL3 Intro to Computing": the name came after the time
      if (!cleanName(nameWords) && ri === ranges.length - 1) nameWords = after.slice(afterUsed).join(' ').replace(room, '').split(' ');
      if (dayAt >= 0) used.add(ri);
      lineRows.push({ days, start_min: r.start_min, end_min: r.end_min, nameWords, room });
      cursor = r.j;
    });
    // a second "TTh 1:00-2:30" on the same line belongs to the first class's name
    let name = '';
    for (const lr of lineRows) {
      const nm = cleanName(lr.nameWords.filter(w => !ROOM_RE.test(w) || /[a-z]{3}/.test(w)));
      if (nm && /[A-Za-z]{2}/.test(nm)) name = nm;
      const finalName = name || pendingName || 'Class';
      for (const d of lr.days) rows.push({ name: finalName, meta: lr.room, cat: catOf(finalName), day: d, start_min: lr.start_min, end_min: lr.end_min });
    }
    if (lineRows.length) pendingName = '';
  }
  return dedupe(rows);
}

/* ---------------- GRID layout ---------------- */
// words: [{ text, x0, y0, x1, y1 }] in image pixels

const HEAD_DAY = w => { const k = String(w).toLowerCase().replace(/[^a-z]/g, ''); return Object.hasOwn(FULL_DAYS, k) ? FULL_DAYS[k] : null; };

// extent(x, yTop, yBottom) → { y0, y1 } of the coloured block behind a cell's
// text, or null when the cell isn't filled (supplied by scanSchedule from pixels)
export function parseGrid(words, extent = null) {
  if (!words?.length) return [];
  const cx = w => (w.x0 + w.x1) / 2, cy = w => (w.y0 + w.y1) / 2;
  // the header: the horizontal band holding the most distinct day names
  const dayWords = words.filter(w => HEAD_DAY(w.text) != null);
  let best = null;
  for (const w of dayWords) {
    const h = Math.max(8, w.y1 - w.y0);
    const band = dayWords.filter(o => Math.abs(cy(o) - cy(w)) < h * 0.8);
    const seen = new Map(); band.forEach(o => { const d = HEAD_DAY(o.text); if (!seen.has(d)) seen.set(d, o); });
    if (seen.size >= 3 && (!best || seen.size > best.size)) best = seen;
  }
  if (!best) return [];
  const cols = [...best.entries()].map(([day, w]) => ({ day, x: cx(w) })).sort((a, b) => a.x - b.x);
  const headY = Math.max(...[...best.values()].map(w => w.y1));
  const gap = cols.length > 1 ? (cols[cols.length - 1].x - cols[0].x) / (cols.length - 1) : 200;
  const left = cols[0].x - gap / 2, right = cols[cols.length - 1].x + gap / 2;

  // time labels down the left edge give a y → minutes scale
  // gridline fragments come back as '—', '_—', '|': they aren't text and they skew cell edges
  const body = words.filter(w => w.y0 > headY - 2 && (w.text.match(/[A-Za-z0-9]/g) || []).length >= w.text.length / 2);
  const labels = [];
  body.filter(w => cx(w) < left).forEach(w => { const t = parseSingleTime(w.text); if (t != null) labels.push({ y: cy(w), t }); });
  // "8:00 AM" is often split in two words — glue a time to a following am/pm
  body.filter(w => cx(w) < left).sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0).forEach((w, i, arr) => {
    const nx = arr[i + 1];
    if (nx && /^[ap]\.?m\.?$/i.test(nx.text) && Math.abs(cy(nx) - cy(w)) < 10) {
      const t = parseSingleTime(w.text + nx.text); if (t != null) labels.push({ y: cy(w), t });
    }
  });
  let scale = null;
  if (labels.length >= 2) {
    const n = labels.length, my = labels.reduce((a, l) => a + l.y, 0) / n, mt = labels.reduce((a, l) => a + l.t, 0) / n;
    const sxy = labels.reduce((a, l) => a + (l.y - my) * (l.t - mt), 0), sxx = labels.reduce((a, l) => a + (l.y - my) ** 2, 0);
    if (sxx > 0 && sxy > 0) { const k = sxy / sxx; scale = y => mt + k * (y - my); }
  }

  const rows = [];
  for (const col of cols) {
    const cw = body.filter(w => cx(w) >= left && cx(w) <= right && w.y0 > headY &&
      cols.reduce((b, c) => Math.abs(c.x - cx(w)) < Math.abs(b.x - cx(w)) ? c : b) === col)
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    // words → lines → cells
    const lines = [];
    for (const w of cw) {
      const ln = lines.find(l => Math.abs(l.cy - cy(w)) < (w.y1 - w.y0) * 0.6);
      if (ln) { ln.words.push(w); ln.y0 = Math.min(ln.y0, w.y0); ln.y1 = Math.max(ln.y1, w.y1); }
      else lines.push({ cy: cy(w), y0: w.y0, y1: w.y1, words: [w] });
    }
    lines.forEach(l => { l.words.sort((a, b) => a.x0 - b.x0); l.text = normalizeOcr(l.words.map(w => w.text).join(' ')); });
    lines.sort((a, b) => a.y0 - b.y0);
    const lh = lines.length ? lines.map(l => l.y1 - l.y0).sort((a, b) => a - b)[lines.length >> 1] : 12;
    const cells = [];
    for (const l of lines) {
      const c = cells[cells.length - 1];
      // a line the OCR missed leaves a two-line gap inside one cell; a filled
      // block behind the text, when there is one, settles where the cell ends
      const inBox = c && c.box ? l.y0 < c.box.y1 : null;
      const near = c && l.y0 - c.y1 <= lh * 2.2;
      if (!c || (inBox === null ? !near : !inBox)) {
        cells.push({ y0: l.y0, y1: l.y1, lines: [l], box: extent ? extent(l.words[0].x0, l.y0, l.y1) : null });
      }
      else { c.lines.push(l); c.y1 = l.y1; }
    }
    // back-to-back classes with no gap: each written time closes a class
    const split = [];
    for (const c of cells) {
      const isR = c.lines.map(l => findRanges(l.text).length > 0);
      if (isR.filter(Boolean).length < 2) { split.push(c); continue; }
      let cur = [];
      c.lines.forEach((l, i) => { cur.push(l); if (isR[i]) { split.push({ lines: cur }); cur = []; } });
      if (cur.length) split[split.length - 1].lines.push(...cur);
    }
    split.forEach(c => { c.y0 = c.lines[0].y0; c.y1 = c.lines[c.lines.length - 1].y1; });
    split.forEach((c, i) => {
      const text = c.lines.map(l => l.text).join(' ');
      const rg = findRanges(text)[0];
      let s, e;
      if (rg) { s = rg.start_min; e = rg.end_min; }
      else if (scale) {
        const box = extent && extent(Math.min(...c.lines.map(l => l.words[0].x0)), c.y0, c.y1);
        if (box) {
          // the coloured block behind the text is the class: read both ends off it
          s = Math.round(scale(box.y0) / 15) * 15; e = Math.round(scale(box.y1) / 15) * 15;
          if (e - s < 30) e = s + 30;
        } else {
        // the text only fills the top of its block, so assume an hour unless
        // the next class in this column starts sooner
        s = Math.floor(scale(c.y0) / 30) * 30;
        e = Math.max(Math.ceil(scale(c.y1) / 30) * 30, s + 60);
        }
        const nx = split[i + 1];
        if (nx) e = Math.min(e, Math.max(s + 30, Math.floor(scale(nx.y0) / 30) * 30));
      } else return;
      if (!(s >= 0 && e <= 1440 && e > s)) return;
      const words = (rg ? text.slice(0, rg.i) + ' ' + text.slice(rg.j) : text).split(' ').filter(Boolean);
      const room = words.find(w => ROOM_RE.test(w) && !/[a-z]{3}/.test(w)) || '';
      const name = cleanName(words.filter(w => w !== room && HEAD_DAY(w) == null));
      if (!/[A-Za-z]{2}/.test(name)) return;
      rows.push({ name, meta: room, cat: catOf(name), day: col.day, start_min: s, end_min: e });
    });
  }
  return dedupe(rows);
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter(r => { const k = `${r.day}|${r.start_min}|${r.end_min}|${r.name.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Tesseract reads a table column by column (each column is its own "block"), so
// its own lines scatter a COR row across the output. Rebuild rows from the word
// boxes instead: walk left→right, chaining each word onto the row whose last word
// sits at the same height — chaining, not a fixed y band, so a slightly tilted
// photo still keeps a row together.
export function rowsFromWords(words) {
  const ws = (words || []).filter(w => w.text).slice().sort((a, b) => a.x0 - b.x0);
  const hs = ws.map(w => w.y1 - w.y0).sort((a, b) => a - b), mh = hs[hs.length >> 1] || 12;
  const rows = [];
  for (const w of ws) {
    const cy = (w.y0 + w.y1) / 2;
    let best = null, bd = Infinity;
    for (const r of rows) {
      const d = Math.abs(r.cy - cy);
      if (d < mh * 0.6 && r.x1 <= w.x0 + mh && d < bd) { best = r; bd = d; }
    }
    if (best) { best.words.push(w); best.cy = cy; best.x1 = w.x1; best.ys += cy; }
    else rows.push({ cy, ys: cy, x1: w.x1, words: [w] });
  }
  return rows.map(r => ({ y: r.ys / r.words.length, text: r.words.map(w => w.text).join(' ') }))
    .sort((a, b) => a.y - b.y).map(r => r.text);
}

// OCR noise reads as short scraps ("mm Aro", "He a"); a real class name has a
// proper word in it and is mostly letters
export function nameLooksReal(n) {
  const s = String(n || '');
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  return /[A-Za-z]{4,}/.test(s) && letters / Math.max(1, s.replace(/\s/g, '').length) >= 0.7;
}
const quality = rows => rows.reduce((q, r) => q + (nameLooksReal(r.name) ? 1 : 0.2), 0);

// pick whichever reading found more believable classes; a detected grid wins ties
export function parseOcr({ lines, words }, extent = null) {
  const clean = rs => rs.filter(r => nameLooksReal(r.name) || /[A-Za-z]{2,}\s?\d/.test(r.name));
  const grid = clean(parseGrid(words, extent));
  const a = clean(parseListLines(lines)), b = clean(parseListLines(rowsFromWords(words)));
  const list = quality(b) >= quality(a) ? b : a;
  const rows = grid.length && quality(grid) >= quality(list) ? grid : list;
  return { rows: rows.slice(0, 200), layout: rows === grid && grid.length ? 'grid' : 'list', score: quality(rows) };
}

/* ---------------- the OCR itself (browser only) ---------------- */

// Downscale huge photos, upscale tiny screenshots, flip dark mode to dark-on-
// light, then binarise against the LOCAL mean (an integral image) so a photo's
// shadows, paper texture and sensor noise don't sink Tesseract's single global
// threshold. Returns the binarised canvas plus the greyscale used for probing
// cell colours.
export async function prepImage(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const long = Math.max(bmp.width, bmp.height);
  const k = long > 2600 ? 2600 / long : long < 1600 ? Math.min(2.5, 1600 / long) : 1;
  const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, W, H); bmp.close?.();
  const img = g.getImageData(0, 0, W, H), d = img.data, N = W * H;
  const gray = new Uint8ClampedArray(N); let sum = 0;
  for (let i = 0, p = 0; p < N; i += 4, p++) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; gray[p] = y; sum += y; }
  if (sum / N < 110) for (let p = 0; p < N; p++) gray[p] = 255 - gray[p];
  // 3×3 box blur takes the edge off sensor noise before thresholding
  const sm = new Uint8ClampedArray(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let t = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; t += gray[yy * W + xx]; n++; } }
    sm[y * W + x] = t / n;
  }
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += sm[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; } }
  const r = Math.max(8, Math.round(Math.min(W, H) / 60));
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const mean = (S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = sm[y * W + x] < mean - 12 ? 0 : 255, i = (y * W + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  let gc = null;
  const grayCanvas = () => {
    if (gc) return gc;
    gc = document.createElement('canvas'); gc.width = W; gc.height = H;
    const gg = gc.getContext('2d'), im = gg.createImageData(W, H);
    for (let p = 0; p < N; p++) { im.data[p * 4] = im.data[p * 4 + 1] = im.data[p * 4 + 2] = gray[p]; im.data[p * 4 + 3] = 255; }
    gg.putImageData(im, 0, 0); return gc;
  };
  return { canvas: cv, gray, W, H, grayCanvas };
}

// For a grid cell: if the pixels just left of its text differ from the page,
// the cell is a filled block — walk up and down while that fill continues.
function makeExtent({ gray, W, H }) {
  const hist = new Uint32Array(256); for (let p = 0; p < gray.length; p += 7) hist[gray[p]]++;
  const page = hist.indexOf(Math.max(...hist));
  const at = (x, y) => gray[Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))];
  return (x, yTop, yBot) => {
    const sx = x - 4, cy = (yTop + yBot) / 2, fill = at(sx, cy);
    if (Math.abs(fill - page) < 10) return null;
    const same = y => Math.abs(at(sx, y) - fill) < 10 && Math.abs(at(sx - 3, y) - fill) < 10;
    let a = cy, b = cy;
    while (a > 0 && same(a - 1)) a--;
    while (b < H - 1 && same(b + 1)) b++;
    return b - a > (yBot - yTop) ? { y0: a, y1: b } : null;
  };
}

let workerP = null;
async function getWorker(onProgress) {
  if (!workerP) workerP = (async () => {
    const { createWorker } = (await import('./vendor/tesseract.esm.min.js')).default;
    const base = new URL('./vendor/', import.meta.url).href;
    return createWorker('eng', 1, {
      workerPath: base + 'tesseract-worker.min.js',
      workerBlobURL: false,
      logger: m => scanLogger && scanLogger(m),
    });
  })().catch(e => { workerP = null; throw e; });
  scanLogger = onProgress;
  return workerP;
}
let scanLogger = null;

export async function scanSchedule(file, onProgress = () => {}) {
  onProgress({ stage: 'Preparing photo', p: 0.02 });
  const prep = await prepImage(file), canvas = prep.canvas, extent = makeExtent(prep);
  const worker = await getWorker(m => {
    if (m.status === 'recognizing text') onProgress({ stage: 'Reading text', p: 0.35 + 0.6 * (m.progress || 0) });
    else if (/load|initializ/.test(m.status || '')) onProgress({ stage: 'Loading reader (first time only)', p: 0.05 + 0.3 * (m.progress || 0) });
  });
  // Measured on generated CORs and timetables: PSM 6 ("one uniform block") reads
  // tables best, sparse mode (11) rescues timetables with empty cells, and the
  // plain greyscale beats the binarised copy on clean screenshots while the
  // binarised one wins on photos. Each pass is ~0.3–2 s, so try them in order
  // and stop once one looks complete.
  const passes = [[canvas, '6'], [prep.grayCanvas(), '6'], [prep.grayCanvas(), '11'], [canvas, '11']];
  const t0 = performance.now();
  let res = { rows: [], layout: 'list', score: 0 }, data = null, words = [];
  for (let i = 0; i < passes.length; i++) {
    const [img, psm] = passes[i];
    if (i) onProgress({ stage: 'Double-checking', p: 0.4 + 0.15 * i });
    await worker.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: psm });
    const out = (await worker.recognize(img, {}, { blocks: true, text: true })).data;
    const f = flatten(out), r = parseOcr(f, extent);
    if (r.score > (res.score || 0)) { res = r; data = out; words = f.words; }
    if (res.rows.length >= 4 && i >= 1) break;
    if (performance.now() - t0 > 12000) break;      // a hopeless photo shouldn't spin for a minute
  }
  onProgress({ stage: 'Done', p: 1 });
  return { ...res, text: data?.text || '', words };
}

function flatten(data) {
  const lines = [], words = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    lines.push({ text: l.text.trim(), ...l.bbox });
    for (const w of l.words || []) if (w.text.trim() && w.confidence > 20) words.push({ text: w.text.trim(), ...w.bbox });
  }
  return { lines, words };
}
