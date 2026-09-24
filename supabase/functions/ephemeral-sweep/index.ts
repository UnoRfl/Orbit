// Orbit · "ephemeral-sweep" edge function
// Deletes story / chat photo+video FILES whose 24 hours are up.
//
// Why a function at all: Supabase refuses DELETE on storage.objects from SQL
// (the protect_objects_delete trigger), because deleting the row would leave
// the file in S3 still taking space. Files have to go through the Storage API,
// and only the service role can remove other people's files.
//
// Who calls it: pg_cron, every 15 minutes, through pg_net (see
// sql/stories-plus-2026-09-24.sql). It sends x-sweep-token, a random secret
// that lives in Supabase Vault; the database checks it inside
// ephemeral_sweep_list(). No JWT is involved, so this is deployed with
// verify_jwt = false — the token is the gate, and the worst an outsider could
// do even without it is delete things that are already expired.
//
// Nothing here decides WHAT is expired. The database does, and RLS has already
// hidden every expired item from everyone before this ever runs; the sweep
// only gives the space back.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const reply = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  const token = req.headers.get('x-sweep-token') ?? '';
  if (token.length < 32) return reply(403, { error: 'no' });

  const { data, error } = await admin.rpc('ephemeral_sweep_list', { p_token: token, p_limit: 1000 });
  if (error) return reply(403, { error: 'no' });
  const paths: string[] = (data ?? []).map((r: { path: string }) => r.path).filter(Boolean);

  const done: string[] = [];
  const failed: string[] = [];
  // the Storage API takes up to 1000 keys, but smaller batches keep one bad
  // key from failing the whole sweep
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const { error: e } = await admin.storage.from('ephemeral').remove(chunk);
    // a key that was never uploaded is not an error to remove(); either way
    // the file is gone, so its row can go too
    if (e) failed.push(...chunk); else done.push(...chunk);
  }

  let rows = 0;
  if (done.length) {
    const { data: n, error: e2 } = await admin.rpc('ephemeral_sweep_done', { p_token: token, p_paths: done });
    if (e2) return reply(500, { error: 'files removed, rows not', files: done.length });
    rows = n ?? 0;
  }
  return reply(200, { files: done.length, rows, failed: failed.length });
});
