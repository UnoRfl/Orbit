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
const ACQUIRE_MS    = 7000;
const GOOD_ENOUGH_M = 25;
/* Beyond this the position is a neighbourhood, not a place, and the UI says so
   rather than drawing a confident dot. */
export const COARSE_M = 120;
const MIN_EVERY_MS = 25 * 1000;
const MAX_EVERY_MS = 60 * 1000;

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
  const last    = useRef({ at: 0, lat: null, lng: null });
  const untilRef = useRef(0);

  const until  = myPres?.live_until ? Date.parse(myPres.live_until) : 0;
  const active = !!until && until > Date.now() && !myPres?.ghost && !!myPres?.sharing;
  untilRef.current = until;

  async function push(lat, lng, accuracy, untilIso) {
    await setPres({
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
    last.current = { at: 0, lat: null, lng: null };
    setAcc(null);
    // null the columns rather than just letting them expire — nothing should
    // outlive the session it belonged to
    await setPres({ live_lat: null, live_lng: null, live_acc: null, live_until: null });
    if (reason) ui.toast(reason);
  }

  async function start(minutes) {
    setErr(null);
    if (!navigator.geolocation) { setErr('This browser has no location support'); return; }
    const mins = Math.min(LIVE_MAX_MIN, Math.max(1, minutes | 0));
    const untilIso = new Date(Date.now() + mins * 60000).toISOString();

    /* Don't commit the FIRST fix. Devices answer immediately with whatever they
       already have — usually a cell-tower or wifi estimate good to hundreds of
       metres — and then sharpen to real GPS over the next few seconds. Taking
       fix #1 is why a share can open a suburb away from where you are.
       So sample briefly and keep the best, stopping early once it is good
       enough that waiting longer would not help. */
    const first = await new Promise(res => {
      let best = null, done = false, id = null;
      const finish = out => { if (done) return; done = true;
        try { if (id != null) navigator.geolocation.clearWatch(id); } catch {}
        clearTimeout(timer); res(out); };
      const timer = setTimeout(() => finish(best ? { ok:true, p:best } : { ok:false, e:{ code:3 } }), ACQUIRE_MS);
      id = navigator.geolocation.watchPosition(
        p => {
          if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
          if (best.coords.accuracy <= GOOD_ENOUGH_M) finish({ ok:true, p:best });
        },
        e => { if (!best) finish({ ok:false, e }); },
        { enableHighAccuracy: true, timeout: ACQUIRE_MS, maximumAge: 0 }
      );
    });
    if (!first.ok) {
      setErr(first.e && first.e.code === 1
        ? 'Location is blocked for Orbit — allow it in your browser settings'
        : "Couldn't get a location fix");
      return;
    }
    const { latitude, longitude, accuracy } = first.p.coords;
    setAcc(accuracy);
    last.current = { at: Date.now(), lat: latitude, lng: longitude };
    await push(latitude, longitude, accuracy, untilIso);
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
    if (watchId.current != null) return;

    watchId.current = navigator.geolocation.watchPosition(
      p => {
        const { latitude: lat, longitude: lng, accuracy } = p.coords;
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
        // standing still: a heartbeat anyway, so the dot stays "live" not "last seen"
        const onBeat = since >= MAX_EVERY_MS;
        if (!onMove && !onBeat) return;

        last.current = { at: now, lat, lng };
        push(lat, lng, accuracy, new Date(untilRef.current).toISOString()).catch(()=>{});
      },
      e => { if (e && e.code === 1) stop('Location permission was revoked'); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
    );

    return () => {
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
