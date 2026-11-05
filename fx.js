/* Orbit — full-screen particle effects (Orbit+ message effects, profile
   entrances). One short-lived canvas, ~2.4s, then it removes itself.

   Budget-aware: particle counts scale with the device tier from index.html
   (data-perf 0/1/2), and reduced-motion users get nothing at all — an effect
   is decoration, never information. Colours come from the live theme. */
import { perfTier } from './core.js';

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#b06bff';
const R = (a, b) => a + Math.random() * (b - a);
let live = 0;

export function playFx(kind, { ms = 2400 } = {}) {
  if (document.documentElement.hasAttribute('data-rm') || live >= 2) return;
  const tier = perfTier();
  const scale = tier >= 2 ? .35 : tier >= 1 ? .65 : 1;
  const cv = document.createElement('canvas');
  cv.className = 'fxlayer'; cv.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  document.body.appendChild(cv); live++;
  // rAF stops in a background tab — never leave a canvas stuck over the app
  const done = () => { if (cv.isConnected) { cv.remove(); live--; } };
  setTimeout(done, ms + 600);
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const pal = [css('--major'), css('--ge'), css('--now'), css('--nstp'), '#ffffff'];
  const cx = W / 2, cy = H / 2, D = Math.hypot(W, H);
  const P = [];
  const n = k => Math.round(k * scale);

  if (kind === 'confetti') for (let i = 0; i < n(170); i++) {
    const a = R(-Math.PI * .92, -Math.PI * .08), v = R(9, 19);
    P.push({ x: R(W * .15, W * .85), y: H + 10, vx: Math.cos(a) * v * .6, vy: Math.sin(a) * v, w: R(5, 10), h: R(8, 15),
      r: R(0, 6), vr: R(-.3, .3), c: pal[i % pal.length], t: R(0, 120) });
  }
  if (kind === 'stars' || kind === 'bloom') for (let i = 0; i < n(kind === 'bloom' ? 220 : 140); i++) {
    const a = R(0, Math.PI * 2), v = kind === 'bloom' ? R(3, 16) : R(1.2, 7);
    P.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: R(1, 3.4), c: pal[i % pal.length], tw: R(0, 6) });
  }
  if (kind === 'hearts') for (let i = 0; i < n(46); i++)
    P.push({ x: R(0, W), y: H + R(0, H * .5), vy: -R(2.4, 5.2), sw: R(.6, 2), ph: R(0, 6), s: R(9, 22), c: pal[i % 3] });
  if (kind === 'warp') for (let i = 0; i < n(260); i++) {
    const a = R(0, Math.PI * 2);
    P.push({ a, d: R(4, D * .25), v: R(.012, .03), c: i % 5 ? '#ffffff' : pal[i % 4], w: R(.6, 2) });
  }
  if (kind === 'meteor') for (let i = 0; i < n(36); i++)
    P.push({ x: R(-W * .2, W), y: R(-H * .8, 0), v: R(10, 20), l: R(60, 160), c: pal[i % pal.length], d: R(0, 900) });

  const heart = (x, y, s) => { g.beginPath(); g.moveTo(x, y + s * .3);
    g.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3); g.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .8, x, y + s);
    g.bezierCurveTo(x, y + s * .8, x + s * .5, y + s * .6, x + s * .5, y + s * .3); g.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3); g.fill(); };

  const t0 = performance.now();
  const step = now => {
    const t = now - t0, k = t / ms, fade = k > .7 ? 1 - (k - .7) / .3 : 1;
    g.clearRect(0, 0, W, H);
    if (kind === 'warp' || kind === 'bloom') { g.fillStyle = `rgba(5,3,12,${.35 * Math.sin(Math.min(1, k) * Math.PI)})`; g.fillRect(0, 0, W, H); }
    g.globalAlpha = Math.max(0, fade);
    for (const p of P) {
      if (kind === 'confetti') {
        if (t < p.t) continue;
        p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.r * 2)), p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); g.restore();
      } else if (kind === 'stars' || kind === 'bloom') {
        p.x += p.vx; p.y += p.vy; p.vx *= .985; p.vy *= .985;
        const a = .55 + .45 * Math.sin(t / 90 + p.tw);
        g.fillStyle = p.c; g.globalAlpha = Math.max(0, fade * a);
        g.beginPath(); g.arc(p.x, p.y, p.s, 0, Math.PI * 2); g.fill();
        g.globalAlpha = Math.max(0, fade * a * .25); g.beginPath(); g.arc(p.x, p.y, p.s * 3.2, 0, Math.PI * 2); g.fill();
        g.globalAlpha = Math.max(0, fade);
      } else if (kind === 'hearts') {
        p.y += p.vy; p.x += Math.sin(t / 300 + p.ph) * p.sw;
        g.fillStyle = p.c; heart(p.x, p.y, p.s);
      } else if (kind === 'warp') {
        const d0 = p.d; p.d *= 1 + p.v * (1 + k * 3);
        const x0 = cx + Math.cos(p.a) * d0, y0 = cy + Math.sin(p.a) * d0, x1 = cx + Math.cos(p.a) * p.d, y1 = cy + Math.sin(p.a) * p.d;
        g.strokeStyle = p.c; g.lineWidth = p.w * (1 + p.d / D * 3);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        if (p.d > D) p.d = R(4, 40);
      } else if (kind === 'meteor') {
        if (t < p.d) continue;
        p.x += p.v * .8; p.y += p.v;
        const gr = g.createLinearGradient(p.x, p.y, p.x - p.l * .8, p.y - p.l);
        gr.addColorStop(0, '#fff'); gr.addColorStop(.15, p.c); gr.addColorStop(1, 'transparent');
        g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.l * .8, p.y - p.l); g.stroke();
      }
    }
    if (kind === 'bloom' && k < .35) {
      const r = D * .6 * (k / .35), gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(.25, pal[0]); gr.addColorStop(1, 'transparent');
      g.globalAlpha = 1 - k / .35; g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    g.globalAlpha = 1;
    if (t < ms && cv.isConnected) requestAnimationFrame(step); else done();
  };
  requestAnimationFrame(step);
}
