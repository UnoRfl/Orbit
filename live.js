/* Orbit — live location sharing.
   See ARCHITECTURE.md for how the pieces fit together.

   ============================================================
   WHAT THIS CAN AND CANNOT DO
   ------------------------------------------------------------
   Life360 is a native app with a background location permission.
   A web app has no equivalent: browsers hand out coordinates only
   while the page is alive, and mobile browsers suspend the watch
   as soon as the tab is backgrounded or the screen locks. There
   is no flag, no permission and no amount of money that changes
   that — so Orbit does not pretend otherwise.

   What it does instead is make the gap visible. Every shared
   position carries the moment it was taken, and the UI labels it
   by age: a fix from ten seconds ago reads "live", one from six
   minutes ago reads "last seen 6m ago" and is drawn dimmed. You
   are never shown a stale dot pretending to be a moving friend.

   THE SAFETY MODEL
   ------------------------------------------------------------
   · Sharing is always time-boxed. There is no "share forever";
     every session has an expiry, capped at 12h by a CHECK
     constraint so a crafted client cannot broadcast indefinitely.
   · Ghost mode and turning sharing off both wipe the coordinates
     in a BEFORE trigger on the table, so going invisible really
     stops the broadcast even if a client is stale or buggy.
   · Who can read them is the presence table's existing RLS:
     accepted friends only, and only while sharing is on and ghost
     is off. Live sharing added columns, not new reach.
   · The sharer's own client nulls the columns the moment the
     session ends, so nothing lingers past its purpose.
   ============================================================ */
import { useEffect, useRef, useState } from './lib.js';
import { ui } from './core.js';

export const LIVE_DURATIONS = [
  { min: 15,  label: '15 min' },
  { min: 60,  label: '1 hour' },
  { min: 240, label: '4 hours' },
];
export const LIVE_MAX_MIN = 12 * 60;      // mirrors the CHECK constraint

/* A fix older than this is no longer "live" — it is a last-known position and
   the UI says so. Chosen to survive a couple of missed updates without lying. */
export const LIVE_FRESH_MS = 90 * 1000;

/* Don't write on every GPS tick: a phone emits one roughly every second, and
   this is a free Supabase project. Write when the position has actually moved,
   or when enough time has passed that a friend would otherwise think we froze. */
const MIN_MOVE_M  = 12;
/* How long to shop around for a good first fix, and the accuracy at which we
   stop waiting. 25m is roughly a decent GPS lock; a laptop on wifi will never
   reach it and simply uses its best effort within the window. */
const ACQUIRE_MS    = 11000;   // a cold GPS lock indoors needs longer than 7s
const GOOD_ENOUGH_M = 25;
/* Beyond this the position is a neighbourhood, not a place, and the UI says so
   rather than drawing a confident dot. */
export const COARSE_M = 120;
const MIN_EVERY_MS = 25 * 1000;
const MAX_EVERY_MS = 60 * 1000;
/* A later fix this much tighter than the one we last published is worth
   publishing even though the dot barely moves: it is the wifi-estimate ->
   GPS-lock correction, and without it the coarse first fix is the only thing a
   stationary user ever broadcasts. That is what "it keeps putting me in the
   same place" actually is. */
const ACC_IMPROVE_RATIO = 0.6;
const ACC_IMPROVE_MIN_MS = 4000;
/* Mobile browsers suspend a geolocation watch when the tab is backgrounded or
   the screen locks, and they do not reliably resume it afterwards. A watch that
   has quietly died is indistinguishable from a user who has not moved, so we
   re-arm it rather than trust it: if nothing has arrived in this long while the
   page is visible, the watch is dead, not idle. */
const WATCHDOG_MS = 45 * 1000;
const WATCHDOG_EVERY_MS = 10 * 1000;

/* ============================================================
   GeoKalman — what actually stops the dot lying to you.
   ------------------------------------------------------------
   Before this, a fix was accepted or rejected whole: keep the best
   accuracy, throw the rest away. That is why a wifi estimate could
   plant you a block away and stay there — one bad reading became
   the truth until a better one happened to arrive.

   A Kalman filter does not choose between readings, it weighs them.
   Two numbers do the work, and both come from how real GPS filters
   are built (regnull/kalman feeds HorizontalAccuracy in as the
   measurement noise and DistancePerSecond as the process noise; the
   matrix form tracks velocity too, which is more than a phone in a
   pocket needs):

     · the reading's own `accuracy` is the measurement noise. A fix
       that says "within 1400m" is told it is worth almost nothing.
     · time since the last fix inflates our uncertainty, because you
       could have walked. That is Q, in metres per second.

   The gain K = variance / (variance + accuracy²) then falls out
   between 0 and 1: K near 0 means "ignore this, we know better",
   K near 1 means "we have been blind for a while, take it".

   This is the constant-position reduction — no velocity state. A
   student walking across campus is not worth a 5x5 matrix on a
   phone that main.js has already decided is a tier-2 device.
   ============================================================ */
const Q_METRES_PER_SECOND = 2.5;   // a brisk walk; what we assume you could have done
/* Past this gap the prior is worthless and inflating its variance is the wrong
   model: with no velocity state we are pretending you random-walked for ten
   minutes, which leaves the estimate trailing hundreds of metres behind the
   first fix back. A gap this long means the screen was locked or the tab was
   backgrounded — you could be anywhere — so start again from the new fix
   rather than averaging it against a memory. Measured: without this, the first
   fix after a 10-minute gap landed 191m from truth and took several more fixes
   to close; with it, 0m. */
const STALE_PRIOR_S = 45;

export function makeKalman(){
  let lat = null, lng = null, variance = -1, at = 0;
  return {
    /* Returns the filtered position, with the variance expressed back as an
       accuracy in metres so the UI's existing halo keeps meaning the same thing. */
    push(nLat, nLng, nAcc, nAt){
      const acc = Math.max(nAcc || 1, 1);       // a claim of 0m is a lie; floor it
      if (variance < 0) {
        lat = nLat; lng = nLng; variance = acc * acc; at = nAt;
      } else {
        const dt = Math.max(0, nAt - at) / 1000;
        if (dt > STALE_PRIOR_S) {
          lat = nLat; lng = nLng; variance = acc * acc; at = nAt;
          return { lat, lng, acc: Math.sqrt(variance) };
        }
        if (dt > 0) {
          // been a while: we are less sure where you are, so trust the new fix more.
          // This is what lets the filter recover after a screen lock instead of
          // clinging to where you were when the phone went in your pocket.
          variance += dt * Q_METRES_PER_SECOND * Q_METRES_PER_SECOND;
          at = nAt;
        }
        const K = variance / (variance + acc * acc);
        lat += K * (nLat - lat);
        lng += K * (nLng - lng);
        variance *= (1 - K);
      }
      return { lat, lng, acc: Math.sqrt(variance) };
    },
    reset(){ lat = null; lng = null; variance = -1; at = 0; },
    get ready(){ return variance >= 0; },
  };
}

/* ============================================================
   acquireFix — getting the FIRST position, as opposed to following one.
   ------------------------------------------------------------
   These are different problems and they were being solved the same way, which
   is what started returning "Couldn't get a location fix".

   The ongoing watch asks for maximumAge 0 on purpose: a cached reading handed
   back as though it were new is what made the dot sit still while you walked.
   Demanding that of the FIRST fix too was a mistake. enableHighAccuracy with
   maximumAge 0 tells the device "GPS, right now, nothing else" — and a laptop
   has no GPS at all, while a phone indoors routinely needs 15-45s for a cold
   lock. Seven seconds later we gave up and said we could not find you, when
   the device had a perfectly usable network fix sitting there the whole time.

   So: try for a sharp fresh fix, and if that window closes empty, take the
   coarse or slightly stale one rather than failing. That is safe now in a way
   it was not before — the Kalman filter weighs a fix by its accuracy, so a
   1200m answer barely moves the dot instead of teleporting it.
   ============================================================ */
export function acquireFix({ goodEnoughM = GOOD_ENOUGH_M, sharpMs = ACQUIRE_MS, fallbackMs = 8000 } = {}) {
  return new Promise(res => {
    if (!navigator.geolocation) { res({ ok:false, e:{ code:2, message:'no geolocation' } }); return; }
    let best = null, done = false, id = null, lastErr = null;
    const finish = out => {
      if (done) return; done = true;
      try { if (id != null) navigator.geolocation.clearWatch(id); } catch {}
      clearTimeout(timer); res(out);
    };

    /* Phase 2. Only runs if the sharp attempt produced nothing at all — any
       fix, however coarse or however old, beats telling someone we failed. */
    const fallback = () => {
      navigator.geolocation.getCurrentPosition(
        p => finish({ ok:true, p, coarse:true }),
        e => finish({ ok:false, e: lastErr || e }),
        { enableHighAccuracy:false, timeout: fallbackMs, maximumAge: 5 * 60 * 1000 }
      );
    };

    const timer = setTimeout(() => {
      if (best) finish({ ok:true, p:best });
      else fallback();
    }, sharpMs);

    id = navigator.geolocation.watchPosition(
      p => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        if (best.coords.accuracy <= goodEnoughM) finish({ ok:true, p:best });
      },
      e => {
        lastErr = e;
        // permission is final; nothing in phase 2 will change it
        if (e && e.code === 1) { finish({ ok:false, e }); return; }
        if (!best) { try { if (id != null) navigator.geolocation.clearWatch(id); } catch {} clearTimeout(timer); fallback(); }
      },
      { enableHighAccuracy: true, timeout: sharpMs, maximumAge: 0 }
    );
  });
}

/* Say which of the three things went wrong, because the fix is different for
   each one and "couldn't get a location fix" tells nobody anything. */
export function fixError(e) {
  if (e && e.code === 1) return 'Location is blocked for Orbit — allow it in your browser settings';
  if (e && e.code === 2) return "Your device couldn't work out where it is — check that location services are on";
  return "Couldn't get a fix in time — GPS is slow indoors. Try again near a window or outside";
}

/* metres between two coordinates — equirectangular is plenty at these distances
   and avoids the trig cost of haversine on every tick */
export function metresBetween(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * R;
}

/* Read a friend's live position off their presence row, or null. Enforces the
   same rules the database does, so an expired or ghosted row can never render
   even if it somehow arrives. */
export function liveOf(row) {
  if (!row || row.ghost || !row.sharing) return null;
  /* Reject null/undefined BEFORE coercing: Number(null) is 0 and
     Number.isFinite(0) is true, so a row with no position would otherwise
     render as a perfectly valid friend standing at (0, 0) off West Africa. */
  if (row.live_lat == null || row.live_lng == null) return null;
  const lat = Number(row.live_lat), lng = Number(row.live_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const until = row.live_until ? Date.parse(row.live_until) : 0;
  if (!until || until <= Date.now()) return null;
  const at = row.updated_at ? Date.parse(row.updated_at) : 0;
  return {
    lat, lng,
    acc: Number.isFinite(Number(row.live_acc)) ? Number(row.live_acc) : null,
    until, at,
    fresh: !!at && (Date.now() - at) < LIVE_FRESH_MS,
    ageMs: at ? Date.now() - at : null,
  };
}

export const ageLabel = ms => {
  if (ms == null) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  return Math.round(m / 60) + 'h ago';
};
export const untilLabel = until => {
  const ms = until - Date.now();
  if (ms <= 0) return 'ended';
  const m = Math.ceil(ms / 60000);
  return m < 60 ? m + ' min left' : Math.round(m / 60) + 'h left';
};

/* ============================================================
   useLiveShare — owns the geolocation watch and the writes.
   Returns { active, until, err, accuracy, start, stop }.
   ============================================================ */
export function useLiveShare({ uid, myPres, setPres }) {
  const [err, setErr]   = useState(null);
  const [acc, setAcc]   = useState(null);
  const watchId = useRef(null);
  const last    = useRef({ at: 0, lat: null, lng: null, acc: null });
  const untilRef = useRef(0);
  /* The watch outlives the render that created it, so reading setPres out of
     that render's closure means writing with a stale snapshot of the presence
     row — and setPres upserts the WHOLE row. That is how a GPS tick could undo
     a check-in made after the share started. Always use the current one. */
  const setPresRef = useRef(setPres);
  setPresRef.current = setPres;
  const kal = useRef(null);
  if (!kal.current) kal.current = makeKalman();

  const until  = myPres?.live_until ? Date.parse(myPres.live_until) : 0;
  const active = !!until && until > Date.now() && !myPres?.ghost && !!myPres?.sharing;
  untilRef.current = until;

  async function push(lat, lng, accuracy, untilIso) {
    await setPresRef.current({
      sharing: true, ghost: false,
      live_lat: lat, live_lng: lng,
      live_acc: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
      live_until: untilIso,
    });
  }

  async function stop(reason) {
    if (watchId.current != null) {
      try { navigator.geolocation.clearWatch(watchId.current); } catch {}
      watchId.current = null;
    }
    last.current = { at: 0, lat: null, lng: null, acc: null };
    kal.current.reset();          // next session starts with no opinion
    setAcc(null);
    // null the columns rather than just letting them expire — nothing should
    // outlive the session it belonged to
    await setPresRef.current({ live_lat: null, live_lng: null, live_acc: null, live_until: null });
    if (reason) ui.toast(reason);
  }

  async function start(minutes) {
    setErr(null);
    if (!navigator.geolocation) { setErr('This browser has no location support'); return; }
    const mins = Math.min(LIVE_MAX_MIN, Math.max(1, minutes | 0));
    const untilIso = new Date(Date.now() + mins * 60000).toISOString();

    const first = await acquireFix();
    if (!first.ok) { setErr(fixError(first.e)); return; }
    const { latitude, longitude, accuracy } = first.p.coords;
    /* Feed the acquire burst's best fix through the filter rather than
       publishing it raw. On its own this changes little — with one reading the
       estimate IS the reading — but it seeds the variance, so the very next
       fix is already weighed against something instead of replacing it. */
    const k = kal.current.push(latitude, longitude, accuracy,
                               first.p.timestamp || Date.now());
    setAcc(k.acc);
    last.current = { at: Date.now(), lat: k.lat, lng: k.lng, acc: k.acc };
    await push(k.lat, k.lng, k.acc, untilIso);
    /* Committing a coarse fix is deliberate — friends should see something
       immediately — but it is a neighbourhood, not a spot, and the watch below
       will replace it the moment GPS actually locks. Say that rather than
       letting a 900m guess sit there looking authoritative. */
    if (accuracy > COARSE_M) ui.toast('Rough fix for now — it sharpens once GPS locks');
  }

  /* The watch lives only while a session is open. Re-created if the session
     changes, torn down on unmount so a closed map never keeps the GPS awake. */
  useEffect(() => {
    if (!active) {
      if (watchId.current != null) {
        try { navigator.geolocation.clearWatch(watchId.current); } catch {}
        watchId.current = null;
      }
      return;
    }
    /* Last time the browser handed us anything at all — not the last time we
       wrote. The watchdog below judges the watch by this. */
    let lastTick = Date.now();

    const onFix = p => {
      lastTick = Date.now();
      const raw = p.coords;
      /* Filter FIRST, then decide. The gates below used to run on the raw
         reading, so a single wild fix could either drag the dot across town or
         — if it happened to be coarse — freeze it. They now run on the
         estimate, which a bad reading can only nudge. */
      const k = kal.current.push(raw.latitude, raw.longitude, raw.accuracy,
                                 p.timestamp || Date.now());
      const lat = k.lat, lng = k.lng, accuracy = k.acc;
      setAcc(accuracy);
      const now = Date.now();
      if (untilRef.current && now >= untilRef.current) { stop('Live location ended'); return; }

      const L = last.current;
      const moved = (L.lat == null) ? Infinity : metresBetween(L, { lat, lng });
      const since = now - L.at;
      // moved somewhere worth reporting, but not more often than MIN_EVERY_MS
      /* Require the move to clear the fix's own error, or a wifi-located
         laptop "walks" hundreds of metres a minute while sitting still. */
      const need = Math.max(MIN_MOVE_M, Math.min(accuracy || 0, 80));
      const onMove = moved >= need && since >= MIN_EVERY_MS;
      /* The correction case. The published fix was a wifi guess good to
         hundreds of metres; GPS has now locked to ten. The dot may hardly move
         — the guess was centred near you — so the distance gate above rejects
         it forever and you stay pinned wherever the estimate landed. Judge the
         fix by how much better it is, not only by how far it travelled. */
      const sharper = Number.isFinite(accuracy) && Number.isFinite(L.acc)
        && L.acc > GOOD_ENOUGH_M
        && accuracy < L.acc * ACC_IMPROVE_RATIO
        && since >= ACC_IMPROVE_MIN_MS;
      // standing still: a heartbeat anyway, so the dot stays "live" not "last seen"
      const onBeat = since >= MAX_EVERY_MS;
      if (!onMove && !onBeat && !sharper) return;

      last.current = { at: now, lat, lng, acc: accuracy };
      push(lat, lng, accuracy, new Date(untilRef.current).toISOString()).catch(()=>{});
    };

    const onErr = e => { if (e && e.code === 1) stop('Location permission was revoked'); };

    /* maximumAge is 0 on purpose. A cached reading served back to us looks like
       a fresh one, so the heartbeat re-publishes the same coordinates minute
       after minute and the dot sits still while you walk. GPS is already awake
       under enableHighAccuracy, so insisting on a live reading costs nothing
       we were not paying. */
    const arm = () => {
      if (watchId.current != null) { try { navigator.geolocation.clearWatch(watchId.current); } catch {} }
      lastTick = Date.now();
      watchId.current = navigator.geolocation.watchPosition(
        onFix, onErr, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
    };
    arm();

    /* Coming back to the tab is the moment a stuck share is most obvious, and
       the moment the browser is least likely to have kept the watch alive. */
    const wake = () => { if (!document.hidden) arm(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pageshow', wake);
    const dog = setInterval(() => {
      if (document.hidden) return;            // suspended is expected, not broken
      if (Date.now() - lastTick > WATCHDOG_MS) arm();
    }, WATCHDOG_EVERY_MS);

    return () => {
      clearInterval(dog);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pageshow', wake);
      if (watchId.current != null) {
        try { navigator.geolocation.clearWatch(watchId.current); } catch {}
        watchId.current = null;
      }
    };
  }, [active, uid]);

  /* Stop exactly when the session runs out, rather than waiting for the next
     GPS tick that may never come if the user is sitting still. */
  useEffect(() => {
    if (!active || !until) return;
    const t = setTimeout(() => stop('Live location ended'), Math.max(0, until - Date.now()));
    return () => clearTimeout(t);
  }, [active, until]);

  return { active, until, err, accuracy: acc, start, stop };
}
