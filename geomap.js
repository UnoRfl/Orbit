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
import { hueCss, perfTier, ui } from './core.js';

const MAPLIBRE_JS  = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js';
const MAPLIBRE_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css';
const STYLE_URL    = 'https://tiles.openfreemap.org/styles/positron';

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
export const canUseGeoMap = () => perfTier() < 2 && webglOk();

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

/* Repaint the off-the-shelf light style into the active Orbit theme. Only paint
   properties are touched, so the style's own layer order and zoom rules stay
   intact and this can be re-run whenever the theme changes. */
function applyTheme(map){
  let layers; try { layers = map.getStyle().layers || []; } catch { return; }
  const ink   = cssVar('--canvas') || '#17121f';
  const major = cssVar('--major')  || '#b06bff';
  const land  = 'rgba(255,255,255,.035)';
  const road  = 'rgba(255,255,255,.10)';
  const water = 'rgba(60,120,190,.16)';
  const label = cssVar('--muted')  || '#9a8fa8';

  for (const layer of layers) {
    const id = layer.id, isWater = /water|sea|ocean|river|lake/i.test(id);
    try {
      if (layer.type === 'background')   map.setPaintProperty(id, 'background-color', ink);
      else if (layer.type === 'fill')    map.setPaintProperty(id, 'fill-color', isWater ? water : land);
      else if (layer.type === 'line')    map.setPaintProperty(id, 'line-color', isWater ? water : road);
      else if (layer.type === 'symbol') {
        map.setPaintProperty(id, 'text-color', /road|highway|street/i.test(id) ? label : major);
        map.setPaintProperty(id, 'text-halo-color', ink);
        map.setPaintProperty(id, 'text-halo-width', 1.4);
      }
    } catch {}
  }
}

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

export function GeoMap({ system, places, friendsOnPlanet, canAdd, onAddAt, onPlaceAt, onOpenPlace, myPlanetId }) {
  const box       = useRef(null);
  const mapRef    = useRef(null);
  const markers   = useRef([]);
  const [status, setStatus]   = useState('loading');   // loading | ready | failed
  const [dropping, setDropping] = useState(null);      // a place awaiting its coordinates

  const placed   = places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const unplaced = places.filter(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng));

  /* --- build the map once per system --- */
  useEffect(() => {
    let dead = false, map = null;
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

    return () => { dead = true; try { map && map.remove(); } catch {} mapRef.current = null; };
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

  function locate(){
    if (!navigator.geolocation) { ui.toast('This browser has no location support'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const map = mapRef.current; if (!map) return;
        // camera only — this never leaves the device
        map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16.5 });
      },
      () => ui.toast('Location is blocked for Orbit'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
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
      <button class="geobtn" onClick=${locate} aria-label="Find my location">◎</button>
    </div>

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
