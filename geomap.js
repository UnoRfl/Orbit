/* Orbit — real geographic map for the Map tab.
   See ARCHITECTURE.md for how the pieces fit together.

   ============================================================
   WHY THIS STACK
   ------------------------------------------------------------
   Tiles come from OpenFreeMap: no API key, no usage cap, no
   account. That matters because the alternatives are not free
   any more — CARTO's dark basemap now renders a bold
   "API KEY REQUIRED" watermark straight onto the tiles, Esri's
   dark canvas serves light grey, and raw OSM only ships a light
   style that has to be CSS-inverted into something that looks
   wrong. OpenFreeMap serves vector tiles, which is the whole
   trick here: the style is restyled at runtime from Orbit's own
   CSS variables, so the map recolours with all six themes (and
   the drifting Auto theme) without a second tile server and
   without downloading anything extra.

   MapLibre is ~230KB and needs WebGL, so it is imported lazily
   the first time someone actually opens map view, and never on
   the tiers that can't afford it — shell falls back to the
   orrery. Nothing here is loaded by the other four tabs.

   PRIVACY
   ------------------------------------------------------------
   This renders PLACES, not people's coordinates. A friend shows
   up at the pin they checked into, exactly as in the orrery —
   presence.zone still carries a place reference and never a
   latitude. Nothing here reads the device's location unless the
   viewer presses "Locate me", and that result is only used to
   move the camera; it is never uploaded.
   ============================================================ */
import { html, useEffect, useRef, useState } from './lib.js';
import { bootTier, hueCss, initialsOf, pauseBg, resumeBg, shownName, ui } from './core.js';
import { COARSE_M, LIVE_DURATIONS, ageLabel, untilLabel } from './live.js';

const MAPLIBRE_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js';
const MAPLIBRE_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css';
const STYLE_URL    = 'https://tiles.openfreemap.org/styles/dark';

/* Manila, so a brand-new system opens somewhere sane instead of null island. */
export const FALLBACK_CENTRE = [120.9842, 14.5995];

export function webglOk(){
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
/* Tier 2 devices get the orrery instead: MapLibre's memory footprint is the
   problem there, not the framerate, and there is no quality knob for that. */
/* Deliberately bootTier() and NOT perfTier(): main.js lowers the live tier
   whenever the ambient canvas drops frames, and opening a map is exactly the
   moment that happens — so keying off the live tier made the Map switch vanish
   mid-session and reappear on a reload. Whether MapLibre can run is a property
   of the device, not of how the background canvas is coping. */
export const canUseGeoMap = () => bootTier() < 2 && webglOk();

let _libPromise = null;
function loadMapLibre(){
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (_libPromise) return _libPromise;
  _libPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = MAPLIBRE_CSS;
      document.head.appendChild(l);
    }
    const s = document.createElement('script');
    s.src = MAPLIBRE_JS; s.async = true;
    s.onload  = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error('maplibre missing'));
    s.onerror = () => { _libPromise = null; reject(new Error('maplibre failed to load')); };
    document.head.appendChild(s);
  });
  return _libPromise;
}

const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

/* OpenFreeMap's `dark` style is a fork of CARTO Dark Matter, which is built to
   sit UNDER bright data overlays rather than to be read as a map: its
   background is rgb(12,12,12), its buildings are rgb(10,10,10) — darker than
   the ground they stand on — minor roads are #181818, and place labels are a
   dim grey. Straight out of the box it reads as a black rectangle.

   So the style's layer hierarchy is kept (it is good) and every structural
   layer is re-anchored onto a deliberate brightness ladder built from Orbit's
   own --canvas. Each step is a mix toward white, so the whole thing stays in
   whatever colourway is active and simply gets legible. Nudge LIFT to taste:
   it scales the entire ladder at once. */
const LIFT = 1;                       // 0.75 = moodier · 1 = default · 1.4 = brighter

/* ground → buildings → roads, in increasing order of how much they should
   stand out. Values are "percent of the way from --canvas toward white". */
const LADDER = [
  [/^background$/,                          0.05],
  [/^landcover_ice_shelf|^landcover_glacier/,0.10],
  [/^landuse_residential/,                  0.12],
  [/^landcover_wood|^landuse_park/,         0.18],
  [/^road_area_pier|^road_pier/,            0.20],
  [/^building/,                             0.26],   // must sit above the ground
  [/^aeroway-area|^aeroway-runway$/,        0.24],
  [/^railway.*dashline$/,                   0.12],
  [/^railway/,                              0.32],
  [/^highway_path/,                         0.28],
  [/^highway_minor|^aeroway-taxiway/,       0.40],
  [/_casing$/,                              0.26],   // casings stay under their inner
  [/^highway_major_subtle|^highway_motorway_subtle/, 0.42],
  [/^highway_major_inner/,                  0.56],
  [/^highway_motorway_inner|^aeroway-runway-casing/, 0.70],
  [/^boundary/,                             0.44],
];

function applyTheme(map){
  let layers; try { layers = map.getStyle().layers || []; } catch { return; }
  const ink   = cssVar('--canvas') || '#17121f';
  const ge    = cssVar('--ge')     || '#2dd4bf';
  const muted = cssVar('--muted')  || '#9a8fa8';
  const text  = cssVar('--ink')    || '#f4eef7';
  const step  = t => mix(ink, '#ffffff', Math.min(0.92, t * LIFT));

  for (const layer of layers) {
    const id = layer.id, type = layer.type;
    try {
      // water is the one thing that is not grey — it carries the theme accent
      if (/water|waterway|ocean|sea|river|lake/i.test(id) && type !== 'symbol') {
        const c = mix(ink, ge, 0.42 * LIFT);
        if (type === 'fill') map.setPaintProperty(id, 'fill-color', c);
        else if (type === 'line') map.setPaintProperty(id, 'line-color', c);
        continue;
      }
      if (type === 'symbol') {
        // Dark Matter's labels are rgb(101,101,101) — too dim to read on a phone
        const isPlace = /^place_/.test(id);
        map.setPaintProperty(id, 'text-color', isPlace ? text : muted);
        map.setPaintProperty(id, 'text-halo-color', ink);
        map.setPaintProperty(id, 'text-halo-width', 1.5);
        map.setPaintProperty(id, 'text-halo-blur', 0.5);
        continue;
      }
      const hit = LADDER.find(([re]) => re.test(id));
      if (!hit) continue;
      const c = step(hit[1]);
      if (type === 'background')  map.setPaintProperty(id, 'background-color', c);
      else if (type === 'fill')   map.setPaintProperty(id, 'fill-color', c);
      else if (type === 'line')   map.setPaintProperty(id, 'line-color', c);
    } catch {}
  }
}

/* tiny hex/rgb/hsl blend so every step tracks whatever the theme vars hold,
   including the hsl() values the drifting Auto theme writes each frame */
function mix(a, b, t){
  const A = parseCol(a), B = parseCol(b);
  return 'rgb(' + A.map((v,i)=>Math.round(v + (B[i]-v)*t)).join(',') + ')';
}
function parseCol(c){
  c = (c||'').trim();
  if (c[0] === '#') { let h = c.slice(1); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    const n = parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  const m = c.match(/(-?[\d.]+)[ ,]+(-?[\d.]+)%?[ ,]+(-?[\d.]+)%?/);
  if (/^hsl/i.test(c) && m) return hsl(+m[1], +m[2], +m[3]);
  if (m) return [+m[1], +m[2], +m[3]];
  return [23,18,31];
}
function hsl(h, s, l){
  s/=100; l/=100; const a = s*Math.min(l,1-l);
  const f = n => { const k = (n + h/30) % 12; return Math.round((l - a*Math.max(-1, Math.min(k-3, Math.min(9-k, 1))))*255); };
  return [f(0), f(8), f(4)];
}

/* A GPS fix is a circle, not a point. Drawing only a dot implies a precision
   the reading does not have — which is exactly what "it's inaccurate" looks
   like. Built as a real polygon in lat/lng rather than a pixel radius, so it
   scales correctly with zoom without any per-frame maths. */
function circlePoly(lat, lng, metres, steps = 56) {
  const ring = [];
  const dLat = metres / 111320;
  const dLng = metres / (111320 * Math.max(0.15, Math.cos(lat * Math.PI / 180)));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}
const ACC_SRC = 'orbit-accuracy';

function pinEl(place, hue, count){
  const el = document.createElement('div');
  el.className = 'geopin';
  el.style.setProperty('--ph', hueCss(hue));
  el.innerHTML = `<span class="geopin-i">${place.icon || '📍'}</span>` +
                 (count > 0 ? `<span class="geopin-n">${count > 9 ? '9+' : count}</span>` : '') +
                 `<span class="geopin-l">${escapeHtml(place.name)}</span>`;
  return el;
}
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

export function GeoMap({ system, places, friendsOnPlanet, canAdd, onAddAt, onPlaceAt, onOpenPlace, myPlanetId,
                         liveFriends = [], onOpenFriend, live = null, meLive = null }) {
  const box       = useRef(null);
  const mapRef    = useRef(null);
  const markers   = useRef([]);
  const [status, setStatus]   = useState('loading');   // loading | ready | failed
  const [dropping, setDropping] = useState(null);      // a place awaiting its coordinates
  const [askLive, setAskLive] = useState(false);       // duration picker open

  const placed   = places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const unplaced = places.filter(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng));

  /* The ambient canvas is almost entirely hidden behind the map, and running two
     animated surfaces at once is what drove main.js's adaptive downgrade — which
     then removed the Map switch. Stop it while map view is open. */
  useEffect(() => { pauseBg(); return resumeBg; }, []);

  /* --- build the map once per system --- */
  useEffect(() => {
    let dead = false, map = null, ro = null;
    loadMapLibre().then(maplibregl => {
      if (dead || !box.current) return;
      const first = placed[0];
      map = new maplibregl.Map({
        container: box.current,
        style: STYLE_URL,
        center: first ? [first.lng, first.lat] : FALLBACK_CENTRE,
        zoom: first ? 16 : 12,
        attributionControl: { compact: true },
        // the canvas is the whole point of this screen; let it keep its pixels
        preserveDrawingBuffer: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      /* MapLibre measures its container once, at construction. Anything that
         changes the box afterwards — fonts landing, the tab becoming visible,
         a rotate, the desktop breakpoint — leaves the GL drawing buffer at the
         old size unless it is told. Cheap insurance against a silently blank
         or letterboxed map. */
      if (window.ResizeObserver && box.current) {
        ro = new ResizeObserver(() => { try { map.resize(); } catch {} });
        ro.observe(box.current);
      }
      /* Don't hang on a single 'load'. If the style was already cached the event
         can fire before this listener attaches, and a backgrounded/occluded tab
         may not composite for a long time — either way the spinner would stick
         forever. Settle on whichever of load/idle/styledata arrives first, and
         re-check map.loaded() in case we missed them all. */
      const ready = () => { if (dead || !mapRef.current) return; applyTheme(map); setStatus('ready'); };
      map.on('load', ready);
      map.once('idle', ready);
      map.on('styledata', () => { if (map.isStyleLoaded && map.isStyleLoaded()) ready(); });
      if (map.loaded && map.loaded()) ready();
      map.on('error', () => {});
    }).catch(() => { if (!dead) setStatus('failed'); });

    return () => { dead = true; try { ro && ro.disconnect(); } catch {} try { map && map.remove(); } catch {} mapRef.current = null; };
  }, [system.key]);

  /* --- the theme can change under us (including every frame on Auto) --- */
  useEffect(() => {
    const map = mapRef.current; if (status !== 'ready' || !map) return;
    const t = setInterval(() => { try { applyTheme(map); } catch {} }, 1500);
    return () => clearInterval(t);
  }, [status, system.key]);

  /* --- markers, rebuilt whenever the places or who-is-where changes --- */
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !window.maplibregl) return;
    markers.current.forEach(m => { try { m.remove(); } catch {} });
    markers.current = [];

    for (const p of placed) {
      const here = friendsOnPlanet ? friendsOnPlanet(p) : [];
      const el = pinEl(p, system.hue, here.length);
      if (p.id && p.id === myPlanetId) el.classList.add('me');
      el.addEventListener('click', ev => { ev.stopPropagation(); onOpenPlace && onOpenPlace(p); });
      const m = new window.maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([p.lng, p.lat]).addTo(map);
      markers.current.push(m);
    }
  }, [status, system.key, JSON.stringify(placed.map(p => [p.id, p.lat, p.lng, p.icon, p.name])), myPlanetId]);

  /* --- friends sharing live location --- */
  /* Kept apart from the place markers: these move every few seconds, and
     rebuilding the pins on every position update would be wasteful and would
     fight the click handlers. Markers are reused by id and only moved. */
  const liveMarkers = useRef(new Map());
  useEffect(() => {
    const map = mapRef.current;
    if (status !== 'ready' || !map || !window.maplibregl) return;
    const seen = new Set();

    /* Your own dot belongs here too. It was missing because liveFriends is built
       from the friends list and the presence map only ever holds other people's
       rows — so the one dot you most expect to see was the one never drawn. */
    const all = meLive && meLive.live
      ? [{ ...meLive, isMe: true }, ...liveFriends]
      : liveFriends;

    for (const { profile, live, isMe } of all) {
      if (!live) continue;
      const id = profile.id; seen.add(id);
      let m = liveMarkers.current.get(id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'livedot';
        el.addEventListener('click', ev => { ev.stopPropagation(); if (!isMe) onOpenFriend && onOpenFriend(id); });
        m = new window.maplibregl.Marker({ element: el, anchor: 'center' });
        m.setLngLat([live.lng, live.lat]).addTo(map);
        liveMarkers.current.set(id, m);
      } else {
        m.setLngLat([live.lng, live.lat]);
      }
      const el = m.getElement();
      // a fix older than LIVE_FRESH_MS is a last-known position, and says so
      el.classList.toggle('stale', !live.fresh);
      el.classList.toggle('me', !!isMe);
      el.style.setProperty('--pa', profile.accent1 || '#b06bff');
      el.style.setProperty('--pb', profile.accent2 || '#2dd4bf');
      el.innerHTML =
        `<span class="livedot-ring"></span>` +
        (profile.avatar_url
          ? `<img class="livedot-av" src="${escapeHtml(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">`
          : `<span class="livedot-av">${escapeHtml(initialsOf(shownName(profile)))}</span>`) +
        `<span class="livedot-l">${isMe ? 'You' : escapeHtml(shownName(profile))}` +
        (live.fresh ? '' : ` · ${escapeHtml(ageLabel(live.ageMs))}`) +
        (Number.isFinite(live.acc) && live.acc > COARSE_M ? ` · ~${Math.round(live.acc)}m` : '') +
        `</span>`;
      // a fix this coarse is a neighbourhood, not a spot
      el.classList.toggle('coarse', Number.isFinite(live.acc) && live.acc > COARSE_M);
    }

    for (const [id, m] of liveMarkers.current) {
      if (!seen.has(id)) { try { m.remove(); } catch {} liveMarkers.current.delete(id); }
    }

    /* accuracy halos, one polygon per fix that reported one */
    const feats = all
      .filter(x => x.live && Number.isFinite(x.live.acc) && x.live.acc > 0)
      .map(x => circlePoly(x.live.lat, x.live.lng, Math.min(x.live.acc, 2000)));
    const data = { type: 'FeatureCollection', features: feats };
    try {
      const src = map.getSource(ACC_SRC);
      if (src) src.setData(data);
      else {
        map.addSource(ACC_SRC, { type: 'geojson', data });
        const ge = cssVar('--ge') || '#2dd4bf';
        map.addLayer({ id: ACC_SRC + '-fill', type: 'fill', source: ACC_SRC,
          paint: { 'fill-color': ge, 'fill-opacity': 0.06 } });
        map.addLayer({ id: ACC_SRC + '-line', type: 'line', source: ACC_SRC,
          paint: { 'line-color': ge, 'line-opacity': 0.5, 'line-width': 1.2 } });
      }
    } catch {}
  }, [status, system.key,
      JSON.stringify(liveFriends.map(f => [f.profile.id, f.live?.lat, f.live?.lng, f.live?.fresh])),
      JSON.stringify(meLive?.live ? [meLive.live.lat, meLive.live.lng, meLive.live.fresh] : null)]);

  /* Jump to your own dot the moment sharing starts. Without this you turn live
     location on, nothing visibly happens because the camera is wherever you left
     it, and it reads as broken. Only on the off->on transition, so the map never
     yanks itself away while you are panning around during a session. */
  const wasLive = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    const on = !!(meLive && meLive.live);
    if (status === 'ready' && map && on && !wasLive.current) {
      try { map.flyTo({ center: [meLive.live.lng, meLive.live.lat], zoom: Math.max(map.getZoom(), 15.5) }); } catch {}
    }
    wasLive.current = on;
  }, [status, !!(meLive && meLive.live)]);

  // drop every live marker when the map itself goes away
  useEffect(() => () => {
    for (const [, m] of liveMarkers.current) { try { m.remove(); } catch {} }
    liveMarkers.current.clear();
  }, []);

  /* --- tapping the map either drops a new place or positions an existing one --- */
  useEffect(() => {
    const map = mapRef.current; if (status !== 'ready' || !map) return;
    const onClick = e => {
      const { lat, lng } = e.lngLat;
      if (dropping) { onPlaceAt && onPlaceAt(dropping, lat, lng); setDropping(null); }
      else if (canAdd) onAddAt && onAddAt(lat, lng);
    };
    map.on('click', onClick);
    const cv = map.getCanvas();
    if (cv) cv.style.cursor = (dropping || canAdd) ? 'crosshair' : '';
    return () => { try { map.off('click', onClick); } catch {} };
  }, [status, dropping, canAdd, onAddAt, onPlaceAt]);

  /* Locate me. getCurrentPosition with a generous maximumAge is the wrong tool
     here: the browser answers instantly with the wifi/ISP estimate it already
     had — possibly half an hour old — so the camera confidently flies to a spot
     that can be a suburb off, and does it again every time you press the
     button. Sample instead, move the camera each time the fix gets tighter, and
     stop as soon as it is genuinely good. Still camera-only; nothing is
     uploaded. */
  const locId = useRef(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => () => { try { locId.current != null && navigator.geolocation.clearWatch(locId.current); } catch {} }, []);

  function locate(){
    if (!navigator.geolocation) { ui.toast('This browser has no location support'); return; }
    if (locId.current != null) return;                    // a burst is already running
    let best = null, done = false;
    const stopBurst = () => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { if (locId.current != null) navigator.geolocation.clearWatch(locId.current); } catch {}
      locId.current = null; setLocating(false);
    };
    const timer = setTimeout(() => { if (!best) ui.toast("Couldn't get a location fix"); stopBurst(); }, 10000);
    setLocating(true);
    locId.current = navigator.geolocation.watchPosition(
      pos => {
        if (best && pos.coords.accuracy >= best.coords.accuracy) return;
        best = pos;
        const map = mapRef.current;
        if (map) map.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          // don't pretend a 900m estimate is a doorstep — frame it as the area it is
          zoom: pos.coords.accuracy > COARSE_M ? 13.5 : 16.5,
        });
        if (pos.coords.accuracy <= 25) stopBurst();
      },
      e => {
        if (best) return;
        ui.toast(e && e.code === 1 ? 'Location is blocked for Orbit' : "Couldn't get a location fix");
        stopBurst();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  if (status === 'failed') return html`<div class="geofail">
    <div style="font-size:26px">🛰️</div>
    <div style="font-weight:600;margin-top:6px">Couldn't load the map</div>
    <div class="hint">Check your connection, or switch back to Orbit view.</div>
  </div>`;

  return html`<div class="geowrap">
    <div class="geomap" ref=${box}></div>
    ${status === 'loading' && html`<div class="geoload"><div class="small">loading map…</div></div>`}

    <div class="geoctl">
      <button class=${'geobtn'+(locating?' busy':'')} onClick=${locate}
        aria-label="Find my location">${locating ? '◌' : '◎'}</button>
      ${live && (live.active
        ? html`<button class="geobtn live on" onClick=${()=>live.stop('Live location off')}
            aria-label="Stop sharing live location"><span class="geodot"></span>${untilLabel(live.until)} · Stop</button>`
        : html`<button class="geobtn live" onClick=${()=>setAskLive(v=>!v)}
            aria-label="Share live location">📡 Go live</button>`)}
    </div>

    ${live && askLive && !live.active && html`<div class="geolive">
      <div style="font-size:12.5px;font-weight:600">Share your live location</div>
      <div class="small" style="margin-top:3px;line-height:1.5">Friends see you move until it ends. It pauses when Orbit is closed or your screen locks — a website can't track in the background.</div>
      <div class="pillrow" style="margin-top:9px">
        ${LIVE_DURATIONS.map(d=>html`<button key=${d.min} class="pill"
          onClick=${async()=>{ setAskLive(false); await live.start(d.min); }}>${d.label}</button>`)}
        <button class="pill" onClick=${()=>setAskLive(false)}>Cancel</button>
      </div>
      ${live.err && html`<div class="errbox" style="margin-top:9px">${live.err}</div>`}
    </div>`}

    ${dropping && html`<div class="geohint">
      Tap the map to place <b>${dropping.icon || '📍'} ${dropping.name}</b>
      <button class="pill" style="margin-left:8px;padding:4px 9px" onClick=${()=>setDropping(null)}>Cancel</button>
    </div>`}
    ${!dropping && canAdd && status === 'ready' && !placed.length && !unplaced.length && html`<div class="geohint">
      Tap anywhere to pin your first place
    </div>`}

    ${unplaced.length > 0 && html`<div class="geotray">
      <div class="small" style="margin-bottom:6px">Not on the map yet — tap one, then tap where it is</div>
      <div class="pillrow scroll">
        ${unplaced.map(p => html`<button key=${p.id} class=${'pill'+(dropping?.id===p.id?' on':'')}
          onClick=${()=>setDropping(dropping?.id===p.id ? null : p)}>${p.icon||'📍'} ${p.name}</button>`)}
      </div>
    </div>`}
  </div>`;
}
