// Maps the import-map specifiers index.html gives the browser onto local stubs,
// so the real app modules can be imported by `node --test` with no network.
const map = {
  'preact': './stubs/preact.mjs',
  'preact/hooks': './stubs/hooks.mjs',
  'htm': './stubs/htm.mjs',
  '@supabase/supabase-js': './stubs/supabase.mjs',
};
export async function resolve(spec, ctx, next) {
  if (map[spec]) return { url: new URL(map[spec], import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
