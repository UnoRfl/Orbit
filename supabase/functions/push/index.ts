// Orbit · "push" edge function
// Sends a Web Push to every subscription a user has registered.
// Called from the app:  sb.functions.invoke('push', { body:{ user_id, title, body } })
//
// Who may push to whom is decided by the database, not by this function:
// `can_push(target)` runs with the CALLER's JWT and allows friends, people in a
// shared system, and a shared event — never across a block. Before 2026-09-24
// this function only needed a valid JWT, so any account could put any text on
// any user's lock screen.
//
// VAPID keys live in project secrets (Edge Functions → push → Secrets):
//   VAPID_PUBLIC_KEY   — must match PUSH_PUBLIC_KEY in core.js
//   VAPID_PRIVATE_KEY  — never commit it; this file is in a public repo
//   VAPID_SUBJECT      — optional, a mailto: or https: contact
// Deploy: supabase functions deploy push

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'https://unorfl.github.io/Orbit/';
const configured = !!(VAPID_PUBLIC && VAPID_PRIVATE);
if (configured) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const URL_  = Deno.env.get('SUPABASE_URL')!;
const ANON  = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': 'https://unorfl.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin',
};
const reply = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').slice(0, n);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  if (!configured) return reply(503, { error: 'push is not configured (VAPID secrets missing)' });

  try {
    const auth = req.headers.get('Authorization') ?? '';
    const asCaller = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await asCaller.auth.getUser();
    if (!user) return reply(401, { error: 'sign in first' });

    const { user_id, title, body } = await req.json();
    if (typeof user_id !== 'string' || !UUID.test(user_id) || !title) {
      return reply(400, { error: 'user_id and title are required' });
    }

    const { data: allowed, error: permErr } = await asCaller.rpc('can_push', { p_target: user_id });
    if (permErr) throw permErr;
    if (allowed !== true) return reply(403, { error: 'not allowed to notify that user' });

    const admin = createClient(URL_, ADMIN);
    const { data: subs, error } = await admin
      .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', user_id);
    if (error) throw error;

    // the payload is built here, not passed through: a caller cannot attach
    // data (URLs, actions) for the service worker to act on
    const payload = JSON.stringify({ title: clip(title, 80), body: clip(body, 160), data: {} });
    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          // subscription is dead — clean it up
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }
    return reply(200, { sent });
  } catch (e) {
    console.error(e);
    return reply(400, { error: 'push failed' });
  }
});
