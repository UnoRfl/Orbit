/* Orbit — auto-split module. Part of the Orbit single-page app.
   See ARCHITECTURE.md for how the pieces fit together. */
import { createClient, h, html, render } from './lib.js';


/* ============================================================
   CONFIG — your Supabase project. (Publishable key is safe to
   ship publicly; never put a service_role key here.)
   ============================================================ */
export const SUPABASE_URL = 'https://zdlevrezefagfqhflusj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_OB4qTnJFKnjO59R5BvkFTQ_AtKbtx2N';

/* EDIT ME — campus zones for the map. id stays short, name is shown. */
export const ZONES = [
  { id:'main',      name:'Main Building', x:.24, y:.28, icon:'🏛️' },
  { id:'ccs',       name:'Academic Hall', x:.72, y:.24, icon:'🏫' },
  { id:'library',   name:'Library',       x:.50, y:.50, icon:'📚' },
  { id:'cafeteria', name:'Cafeteria',     x:.22, y:.70, icon:'🍜' },
  { id:'gym',       name:'Gymnasium',     x:.76, y:.66, icon:'🏀' },
  { id:'quad',      name:'The Quad',      x:.50, y:.84, icon:'🌳' },
];

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
// wake the free-tier database the moment the script runs — its cold start
// then overlaps the boot screen instead of stacking after it
/* Reads go through this view, never the table: it redacts display_name for
   anyone who hid it, and ban_reason / suspended_until for everyone but you and
   staff. `authenticated` has no SELECT on public.profiles at all. */
export const PROFILE_VIEW = 'profiles_view';
try{ sb.from(PROFILE_VIEW).select('id', { head:true, count:'exact' }).limit(1).then(()=>{}, ()=>{}); }catch{}

/* imperative UI bridge — any component can fire a branded confirm or a
   toast without prop-drilling. Shell wires the real handlers on mount;
   the defaults degrade gracefully so an action is never silently lost. */
export const ui = {
  toast: (t)=>{ try{ console.log('[toast]', t); }catch{} },
  confirm: (o)=> Promise.resolve(window.confirm((o&&(o.body||o.title))||'Are you sure?')),
};

/* ---------- constants ---------- */
export const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat'];
/* The grid used to run 07:00-19:00, which quietly decided that nothing worth
   scheduling happens at night. Night classes, shifts, and anyone revising at
   1am simply had nowhere to be drawn — a block outside the window was clamped
   by pxFor() onto the edge and looked like it started at 7am. The day is now
   the whole day. HOUR comes down so 24 rows stay scrollable rather than
   becoming a 1250px column. */
/* HOUR went back to 52 after 40 read as squished — the grid scrolls, so height
   costs nothing, and the day wraps around now rather than dead-ending. */
export const HOUR = 52, START = 0, END = 24*60;
export const CAT = { major:'var(--major)', ge:'var(--ge)', pe:'var(--pe)', nstp:'var(--nstp)' };
export const CATHEX = { major:'#b06bff', ge:'#2dd4bf', pe:'#34d399', nstp:'#f5b544' };
export const CATNAME = { major:'Major', ge:'Gen Ed', pe:'PE', nstp:'NSTP' };
export const KINDS = {
  coffee:{ label:'Coffee', emoji:'☕', accent:'#f5b544' },
  study:{ label:'Study group', emoji:'📚', accent:'#2dd4bf' },
  lunch:{ label:'Lunch', emoji:'🍜', accent:'#34d399' },
  hangout:{ label:'Hangout', emoji:'✨', accent:'#b06bff' },
};
export const PING_PRESETS = [
  { t:'Study?', e:'📖' }, { t:'Coffee?', e:'☕' }, { t:'Lunch?', e:'🍜' },
  { t:'Where u at?', e:'📍' }, { t:'Free rn?', e:'👋' }, { t:'Walk to class?', e:'🚶' },
];
export const ACCENTS = [
  ['#b06bff','#2dd4bf'], ['#f5b544','#ff5d8f'], ['#2dd4bf','#34d399'],
  ['#ff5d8f','#b06bff'], ['#34d399','#2dd4bf'], ['#b06bff','#f5b544'],
  ['#ffd43b','#ff6b5d'], ['#4dabf7','#22d3ee'], ['#f4f4f5','#8f8f98'], ['#1f1728','#b06bff'],
];
// name-flair gradient presets — stored on the profile so friends see them too
export const NAME_FX = [
  { id:'nebula', name:'Nebula', c:['#b06bff','#2dd4bf'] },
  { id:'nova',   name:'Nova',   c:['#ff5d8f','#b06bff'] },
  { id:'solar',  name:'Solar',  c:['#f5b544','#ff5d8f'] },
  { id:'aurora', name:'Aurora', c:['#2dd4bf','#34d399'] },
  { id:'ion',    name:'Ion',    c:['#4dabf7','#22d3ee'] },
  { id:'ember',  name:'Ember',  c:['#ff6b5d','#f5b544'] },
  { id:'gold',   name:'24K',    c:['#ffd43b','#fff3bf'] },
  { id:'chrome', name:'Chrome', c:['#f4f4f5','#8f8f98'] },
];
/* Anything another user controls that ends up inside a style STRING must go
   through one of these. Preact applies a string style as cssText, so a ';'
   smuggled into an accent colour or a position adds declarations of its own —
   a full-screen overlay on every avatar of that user, for everyone who sees it. */
export const safeColor = (c, d) => /^#[0-9a-f]{3,8}$/i.test(String(c ?? '')) ? c : d;
export const safeNum = (n, d = 0, lo = -400, hi = 400) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};
// `--cx:…%;--cy:…%;--cz:…` for the pan/zoom framing of an image
export const posVars = pos => {
  const q = (pos && typeof pos === 'object') ? pos : {};
  return `--cx:${safeNum(q.x)}%;--cy:${safeNum(q.y)}%;--cz:${safeNum(q.z, 1, 0.2, 6)}`;
};
export const flairOf = p => (p && p.flair && typeof p.flair === 'object' && !Array.isArray(p.flair)) ? p.flair : {};

/* profile identity — pronouns, hobbies, developer badges + event emojis */
export const PRONOUN_PRESETS = ['he/him','she/her','they/them','he/they','she/they','it/its','any pronouns','ask me'];
export const HOBBY_PRESETS = ['🎮 Gaming','📚 Reading','🎨 Art','🎵 Music','💻 Coding','📷 Photos','🍳 Cooking','☕ Coffee','🧋 Milk tea','⚽ Football','🏀 Basketball','🏐 Volleyball','🏋️ Gym','🚴 Biking','✈️ Travel','🎬 Movies','📺 Anime','✍️ Writing','🎤 Singing','💃 Dance','🌱 Plants','🐾 Animals','🛹 Skating','♟️ Chess','🎧 Podcasts','🧵 Crafts'];
export const EVENT_EMOJIS = ['🎮','🎬','🎂','🎉','🛍️','🧋','🍕','🎳','🏖️','🏀','🏐','💻','🎤','📖','⛪','🚶'];
export const LOG_TAGS = { new:{ l:'New', c:'#b06bff' }, improved:{ l:'Improved', c:'#2dd4bf' }, fixed:{ l:'Fixed', c:'#34d399' }, news:{ l:'News', c:'#f5b544' } };
/* badge catalog — the three power roles are built in as a fallback; the full
   catalog (incl. recognition badges) streams in from the badge_defs table, so
   badges created in mission control need zero code changes to render. */
export const BADGE_DEFS = {
  founder:{ label:'Orbit Founder', icon:'✦', color:'#f5b544', tier:'power', sort:0 },
  staff:{ label:'Orbit Staff', icon:'🛡️', color:'#b06bff', tier:'power', sort:1 },
  support:{ label:'Orbit Support', icon:'🎧', color:'#2dd4bf', tier:'power', sort:2 },
};
export const badgesOf = p => Array.isArray(p?.badges) ? p.badges : [];
export const roleOf = p => badgesOf(p).includes('founder') ? 'founder'
                  : badgesOf(p).includes('staff') ? 'staff'
                  : badgesOf(p).includes('support') ? 'support' : null;

/* ---------- curated connections ----------
   Fixed allowlist. Users store a handle only; Orbit builds the URL,
   so nothing outside these domains can ever be linked or rendered. */
export const cleanSocial = s => (s||'').replace(/^@/,'').replace(/[^a-zA-Z0-9._-]/g,'').slice(0,30);
export const B = inner => ({ size=14 }) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: inner }}/>`;
export const SOCIALS = {
  discord:   { name:'Discord',   c:['#5865f2','#3b46c4'], url:null,   // no profile URLs by handle — copy instead
    Ic:B('<path d="M19.6 5.6A16 16 0 0 0 15.9 4l-.4.8a13 13 0 0 0-7 0L8 4a16 16 0 0 0-3.7 1.6C2 9.4 1.4 13 1.7 16.6A16 16 0 0 0 6.6 19l1-1.5a10 10 0 0 1-1.6-.8l.4-.3a11.4 11.4 0 0 0 11.2 0l.4.3c-.5.3-1 .6-1.6.8l1 1.5a16 16 0 0 0 4.9-2.4c.4-4.1-.6-7.6-2.7-11zM9 14.5c-.9 0-1.6-.8-1.6-1.8S8.1 11 9 11s1.6.8 1.6 1.8-.7 1.7-1.6 1.7zm6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.7 1.6-1.7 1.6.8 1.6 1.8-.7 1.7-1.6 1.7z" fill="currentColor"/>') },
  instagram: { name:'Instagram', c:['#e1306c','#833ab4'], url:u=>`https://instagram.com/${u}`,
    Ic:B('<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.3" fill="currentColor"/>') },
  tiktok:    { name:'TikTok',    c:['#161616','#010101'], tc:'#7fe7dd', url:u=>`https://tiktok.com/@${u}`,
    Ic:B('<path d="M14 3c.4 2.6 2 4.2 4.6 4.4v3c-1.7 0-3.2-.5-4.6-1.5v6.3a5.6 5.6 0 1 1-5.6-5.6c.3 0 .7 0 1 .1v3.1a2.6 2.6 0 1 0 1.6 2.4V3h3z" fill="currentColor"/>') },
  x:         { name:'X',         c:['#26262e','#101015'], tc:'#c9c9d2', url:u=>`https://x.com/${u}`,
    Ic:B('<path d="M3 3l7.4 9.7L3.6 21h2.5l5.5-6.6L16.6 21H21l-7.8-10.2L20.2 3h-2.5l-5 6L8.4 3H3z" fill="currentColor"/>') },
  facebook:  { name:'Facebook',  c:['#1877f2','#0c5fce'], url:u=>`https://facebook.com/${u}`,
    Ic:B('<path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9C16 4.8 15 4.7 14 4.7c-2.4 0-4 1.4-4 4V11H7.6v3H10v7h3.5z" fill="currentColor"/>') },
  messenger: { name:'Messenger', c:['#0695ff','#a334fa'], url:u=>`https://m.me/${u}`,
    Ic:B('<path d="M12 2.5C6.7 2.5 2.5 6.4 2.5 11.3c0 2.8 1.4 5.3 3.6 6.9v3.3l3.3-1.8c.8.2 1.7.3 2.6.3 5.3 0 9.5-3.9 9.5-8.8S17.3 2.5 12 2.5zm1 11.8l-2.4-2.6-4.7 2.6 5.2-5.5 2.5 2.6 4.6-2.6-5.2 5.5z" fill="currentColor" fill-rule="evenodd"/>') },
  youtube:   { name:'YouTube',   c:['#ff0033','#c60026'], url:u=>`https://youtube.com/@${u}`,
    Ic:B('<path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8zM9.8 15.3V8.7L15.9 12z" fill="currentColor" fill-rule="evenodd"/>') },
  github:    { name:'GitHub',    c:['#30363d','#171a1f'], tc:'#c9d1d9', url:u=>`https://github.com/${u}`,
    Ic:B('<path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.9 10.9c.6.1.8-.2.8-.5v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.2-1.3-5.2-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.7.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.1v3.2c0 .3.2.6.8.5A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5z" fill="currentColor"/>') },
  twitch:    { name:'Twitch',    c:['#9146ff','#6a2fd6'], url:u=>`https://twitch.tv/${u}`,
    Ic:B('<path d="M4 3L3 6v13h4v3h3l3-3h4l4-4V3H4zm15 11l-2.5 2.5H12l-3 3v-3H5.5V5H19v9zM10 8h2v5h-2V8zm5 0h2v5h-2V8z" fill="currentColor" fill-rule="evenodd"/>') },
  spotify:   { name:'Spotify',   c:['#1db954','#12833c'], url:u=>`https://open.spotify.com/user/${u}`,
    Ic:B('<circle cx="12" cy="12" r="10.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7 9.6c3.4-1 7.3-.7 10.1 1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M7.4 12.6c2.8-.8 6-.5 8.4.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7.8 15.4c2.2-.6 4.6-.4 6.5.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>') },
  steam:     { name:'Steam',     c:['#1b2838','#0f1a26'], tc:'#66c0f4', url:u=>`https://steamcommunity.com/id/${u}`,
    Ic:B('<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="15.8" cy="8.6" r="2.7" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="8.2" cy="15.6" r="2.1" fill="currentColor"/><path d="M10 14.2l3.6-3.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>') },
  roblox:    { name:'Roblox',    c:['#393b3d','#1f2123'], tc:'#d3d6d9', url:u=>`https://www.roblox.com/users/profile?username=${u}`,
    Ic:B('<path d="M6.7 2.6L2.6 17.3l14.7 4.1 4.1-14.7L6.7 2.6zm7.9 11.5l-4.5-1.2 1.2-4.5 4.5 1.2-1.2 4.5z" fill="currentColor" fill-rule="evenodd"/>') },
};

/* ---------- activity catalog ----------
   Statuses come only from here — mainstream apps and games, no free-form
   entries and no links, so profiles can't be decorated with junk. */
export const ACT_KINDS = {
  playing:   { label:'Playing',   eb:'PLAYING' },
  listening: { label:'Listening', eb:'LISTENING TO' },
  watching:  { label:'Watching',  eb:'WATCHING' },
  study:     { label:'Locked in', eb:'LOCKED IN' },
};
export const ACTIVITY_CATALOG = [
  { id:'roblox',    k:'playing', name:'Roblox',            ic:SOCIALS.roblox.Ic, c:['#393b3d','#17191b'], tc:'#d3d6d9' },
  { id:'minecraft', k:'playing', name:'Minecraft',         g:'⛏️', c:['#5f9c3f','#3e6b2a'] },
  { id:'valorant',  k:'playing', name:'Valorant',          g:'🎯', c:['#ff4655','#b3202e'] },
  { id:'mlbb',      k:'playing', name:'Mobile Legends',    g:'⚔️', c:['#2b6cff','#12318f'] },
  { id:'codm',      k:'playing', name:'CoD Mobile',        g:'🔫', c:['#3a3f47','#1e2126'], tc:'#aab2bd' },
  { id:'pubgm',     k:'playing', name:'PUBG Mobile',       g:'🪖', c:['#f2a900','#a86f00'] },
  { id:'genshin',   k:'playing', name:'Genshin Impact',    g:'✨', c:['#7cc7e8','#3f7fae'] },
  { id:'lol',       k:'playing', name:'League of Legends', g:'🏆', c:['#c8aa6e','#8a6d3b'] },
  { id:'dota',      k:'playing', name:'Dota 2',            g:'🛡️', c:['#b23c2e','#7a241b'] },
  { id:'cs2',       k:'playing', name:'CS2',               g:'💣', c:['#e9a13b','#9c651c'] },
  { id:'fortnite',  k:'playing', name:'Fortnite',          g:'🌪️', c:['#8e6fff','#5b3fd0'] },
  { id:'gta',       k:'playing', name:'GTA V',             g:'🚗', c:['#66bb6a','#2e7d32'] },
  { id:'apex',      k:'playing', name:'Apex Legends',      g:'🦾', c:['#d13438','#8f1d20'] },
  { id:'ow2',       k:'playing', name:'Overwatch 2',       g:'🛰️', c:['#f79c27','#c56f10'] },
  { id:'amongus',   k:'playing', name:'Among Us',          g:'🛸', c:['#c51111','#7a0a0a'] },
  { id:'stardew',   k:'playing', name:'Stardew Valley',    g:'🌾', c:['#f2b04c','#b57b23'] },
  { id:'tekken',    k:'playing', name:'Tekken 8',          g:'🥊', c:['#7c4dff','#4527a0'] },
  { id:'chess',     k:'playing', name:'Chess.com',         g:'♟️', c:['#7fa650','#4d6e2f'] },
  { id:'spotify',   k:'listening', name:'Spotify',         ic:SOCIALS.spotify.Ic, c:['#1db954','#12833c'] },
  { id:'ytmusic',   k:'listening', name:'YT Music',        g:'🎵', c:['#ff0033','#b30024'] },
  { id:'applemusic',k:'listening', name:'Apple Music',     g:'🎧', c:['#fa2d48','#c01f36'] },
  { id:'soundcloud',k:'listening', name:'SoundCloud',      g:'☁️', c:['#ff5500','#c24100'] },
  { id:'youtube',   k:'watching', name:'YouTube',          ic:SOCIALS.youtube.Ic, c:['#ff0033','#c60026'] },
  { id:'netflix',   k:'watching', name:'Netflix',          g:'🍿', c:['#e50914','#8f050c'] },
  { id:'twitch',    k:'watching', name:'Twitch',           ic:SOCIALS.twitch.Ic, c:['#9146ff','#6a2fd6'] },
  { id:'crunchy',   k:'watching', name:'Crunchyroll',      g:'🍥', c:['#f47521','#bd5514'] },
  { id:'study',     k:'study', name:'Studying',            g:'📚', c:['#2dd4bf','#178f80'] },
  { id:'vscode',    k:'study', name:'VS Code',             g:'💻', c:['#3b9df2','#1f6ec2'] },
  { id:'rbxstudio', k:'study', name:'Roblox Studio',       g:'🛠️', c:['#00a2ff','#0069a8'] },
  { id:'canva',     k:'study', name:'Canva',               g:'🎨', c:['#7d2ae8','#00c4cc'] },
  { id:'figma',     k:'study', name:'Figma',               g:'🧩', c:['#a259ff','#f24e1e'] },
  { id:'photoshop', k:'study', name:'Photoshop',           g:'🖌️', c:['#31a8ff','#1471b8'] },
  { id:'notion',    k:'study', name:'Notion',              g:'📝', c:['#3a3a3a','#1c1c1c'], tc:'#cfcfcf' },
];
// resolve a stored status against the catalog — unknown ids and expired
// statuses render as nothing, so tampered rows can't show anything odd
export const actOf = pr => {
  const a = pr?.activity;
  if (!a || typeof a !== 'object') return null;
  const c = ACTIVITY_CATALOG.find(x=>x.id===a.id);
  if (!c) return null;
  if (a.until && new Date(a.until) < new Date()) return null;
  return { ...a, c };
};

/* ============================================================
   THEMES + PREFERENCES
   Cosmetic prefs live on the device (localStorage). They retheme
   the app instantly with no round-trip. Account data stays in
   Supabase. Swapping a theme sets CSS variables on :root — most
   of the UI reads those, so the whole app recolors at once.
   ============================================================ */
export const THEMES = {
  nebula:{ name:'Nebula', desc:'Purple · teal', sw:['#b06bff','#2dd4bf','#ff5d8f'],
    v:{ '--canvas':'#17121f','--panel':'#1e1826','--panel2':'#241d2e',
        '--major':'#b06bff','--ge':'#2dd4bf','--pe':'#34d399','--nstp':'#f5b544','--now':'#ff5d8f' } },
  ember:{ name:'Ember', desc:'Fire · amber', sw:['#ff6b5d','#f5b544','#ff5d8f'],
    v:{ '--canvas':'#1a0f11','--panel':'#241618','--panel2':'#2c1a1c',
        '--major':'#ff6b5d','--ge':'#f5b544','--pe':'#ffa94d','--nstp':'#ffd43b','--now':'#ff5d8f' } },
  abyss:{ name:'Abyss', desc:'Deep ocean', sw:['#4dabf7','#22d3ee','#f472b6'],
    v:{ '--canvas':'#0b1020','--panel':'#14192b','--panel2':'#1a2033',
        '--major':'#4dabf7','--ge':'#22d3ee','--pe':'#38bdf8','--nstp':'#818cf8','--now':'#f472b6' } },
  verdant:{ name:'Verdant', desc:'Forest glow', sw:['#34d399','#a3e635','#f5b544'],
    v:{ '--canvas':'#0e1712','--panel':'#161f19','--panel2':'#1c261f',
        '--major':'#34d399','--ge':'#a3e635','--pe':'#4ade80','--nstp':'#fbbf24','--now':'#f97362' } },
  rose:{ name:'Rosé', desc:'Pink · gold', sw:['#ff8fab','#ffd6a5','#c084fc'],
    v:{ '--canvas':'#1b1015','--panel':'#25171d','--panel2':'#2d1c23',
        '--major':'#ff8fab','--ge':'#ffc9a0','--pe':'#fbcfe8','--nstp':'#ffd6a5','--now':'#f43f5e' } },
  mono:{ name:'Monochrome', desc:'Quiet greys', sw:['#d4d4d8','#a1a1aa','#f4f4f5'],
    v:{ '--canvas':'#0f0f12','--panel':'#18181c','--panel2':'#1f1f24',
        '--major':'#d4d4d8','--ge':'#a1a1aa','--pe':'#e4e4e7','--nstp':'#fafafa','--now':'#f4f4f5' } },
};
export const THEME_IDS = Object.keys(THEMES);

/* ============================================================
   DEVICE TIER
   index.html stamps data-perf on <html> before first paint
   (0 = full, 1 = lite phones/mid, 2 = min low-end). main.js can
   step it down at runtime. Read it through perfTier() so every
   module agrees on one number instead of each re-sniffing UA.
   ============================================================ */
export function perfTier(){
  const v = +(document.documentElement.getAttribute('data-perf') || 0);
  return Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0;
}
export const isCoarse = () => document.documentElement.hasAttribute('data-coarse');
/* The tier as measured at boot. Use this to decide whether a FEATURE is
   available; use perfTier() only to decide how pretty to draw it. They differ
   because main.js lowers data-perf when the background canvas struggles, and a
   struggling background says nothing about whether MapLibre can run. */
export function bootTier(){
  const d = document.documentElement;
  const v = +(d.getAttribute('data-perf0') ?? d.getAttribute('data-perf') ?? 0);
  return Number.isFinite(v) ? Math.max(0, Math.min(2, v)) : 0;
}

/* Background canvas is fully hidden whenever a fullscreen surface
   (a chat on mobile) sits on top of it. Every such surface pushes a
   pause on mount and pops it on unmount; main.js skips its whole
   frame while the count is above zero. Counted rather than boolean
   so two overlapping surfaces can't un-pause each other. */
let __bgPaused = 0;
const __syncBgPause = () => {
  const d = document.documentElement;
  if (__bgPaused > 0) d.setAttribute('data-bgpause','1'); else d.removeAttribute('data-bgpause');
};
export function pauseBg(){ __bgPaused++; __syncBgPause(); }
export function resumeBg(){ __bgPaused = Math.max(0, __bgPaused - 1); __syncBgPause(); }

// Interactive background variants. Each is themed (reads --major/--ge live),
// so it recolours on every colourway and greys out on Monochrome.
//
// `cost` is what the variant costs per frame, and it is what decides which
// phones may pick it:
//   1 = cheap   (a few hundred line segments)      — every device
//   2 = medium  (per-frame gradients / O(n²) links) — tier 0 + 1
//   3 = heavy   (per-pixel noise, additive blending) — tier 0 (desktop) only
// Topographic re-evaluates fractal noise across the whole grid every frame and
// Aurora composites with 'lighter' over full-width gradients; both are what made
// weaker phones drop to single-digit framerates, so they stay off there.
export const BG_STYLES = {
  waves:{         name:'Ambient Waves',  desc:'Flowing wave field',    g:'〰', cost:1 },
  topo:{          name:'Topographic',    desc:'Contour terrain lines', g:'◎', cost:3 },
  starfield:{     name:'Starfield',      desc:'Parallax drifting stars',g:'✦', cost:1 },
  orbits:{        name:'Orbits',         desc:'Planets circling',      g:'☉', cost:2 },
  constellation:{ name:'Constellation',  desc:'Connected star web',    g:'✧', cost:2 },
  aurora:{        name:'Aurora',         desc:'Soft light ribbons',    g:'≈', cost:3 },
};
export const BG_IDS = Object.keys(BG_STYLES);

// Highest background cost this device is allowed to run: desktop everything,
// phones up to medium, low-end phones cheap only.
export const bgBudget = (tier = perfTier()) => (tier >= 2 ? 1 : tier >= 1 ? 2 : 3);
export const bgAllowed = (id, tier = perfTier()) => (BG_STYLES[id]?.cost || 1) <= bgBudget(tier);
// What to actually render: the pick if this device can afford it, else the
// cheapest variant. The stored preference is never rewritten, so the same
// account still gets its real choice back on a desktop.
export function bgFor(id, tier = perfTier()){
  const pick = BG_STYLES[id] ? id : 'waves';
  return bgAllowed(pick, tier) ? pick : 'waves';
}
export const DEFAULT_PREFS = { asteroids:true, bgStyle:'waves', sounds:false, autoSpeed:60 };

/* Sign-out on a shared device (a school lab PC) used to leave the last user
   behind: their push subscription kept delivering DM previews to this
   browser, their block list and device-pinned places seeded whoever signed
   in next, and a live share kept advertising their last fix until it expired.
   Every sign-out goes through here. The theme is kept — it is cosmetic. */
export async function signOutClean() {
  try {
    const { data } = await sb.auth.getSession();
    const id = data?.session?.user?.id;
    if (id) await sb.from('presence')
      .update({ live_lat:null, live_lng:null, live_acc:null, live_until:null }).eq('user_id', id);
  } catch {}
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
  } catch {}
  try { ['orbit.blocks','orbit.prefs','orbit.systems.v2','orbit.systems.migrated']
          .forEach(k => localStorage.removeItem(k)); } catch {}
  await sb.auth.signOut();
}

export const store = {
  getTheme(){ try{ return localStorage.getItem('orbit.theme') || 'nebula'; }catch{ return 'nebula'; } },
  setTheme(id){ try{ localStorage.setItem('orbit.theme', id); }catch{} },
  getPrefs(){ try{ return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem('orbit.prefs')||'{}')) }; }catch{ return { ...DEFAULT_PREFS }; } },
  setPrefs(p){ try{ localStorage.setItem('orbit.prefs', JSON.stringify(p)); }catch{} },
  getBlocks(){ try{ return JSON.parse(localStorage.getItem('orbit.blocks')||'[]'); }catch{ return []; } },
  setBlocks(a){ try{ localStorage.setItem('orbit.blocks', JSON.stringify(a)); }catch{} },
};

/* ============================================================
   SYSTEMS ("solar systems") + PLACES ("planets")
   Campus is seeded per-device; every other system is SHARED —
   stored in Supabase with a leader, members, and permissions.
   When you check in, the place + system labels ride along inside
   presence.zone (as JSON) so friends can see where you are without
   ever needing a copy of your layout. Friends "cluster" into the
   same system when you both name it the same thing.
   ============================================================ */
/* Bumped to v2 when places moved from abstract orbital positions to real
   coordinates. Every stored place in Supabase was cleared at the same time,
   so a device carrying a v1 layout would be showing planets that no longer
   exist anywhere. Reading a new key re-seeds a clean Campus system and the
   old blob is dropped rather than left behind in localStorage. */
export const SYS_KEY = 'orbit.systems.v2';
try{ localStorage.removeItem('orbit.systems.v1'); }catch{}
export const SYSTEM_HUES = [265, 190, 150, 330, 40, 210, 300, 95];
export const EMOJI_SUGGESTIONS = ['🏠','🏫','🛍️','☕','🍜','🍔','🏀','🎮','🏋️','📚','🎬','🚉','🌳','🏖️','⛪','🏥','💻','🎤','🎨','🍦','🧋','🏬','🚗','✈️'];
export const SYSTEM_GLYPHS = ['🪐','🌌','🌠','⭐','☄️','🌟','🔭','🚀','🛸','✨'];

/* ---------- chat: themes, fonts, emoji, media ----------
   Everything link-based — Orbit never stores files. TENOR_KEY is optional:
   drop a free Tenor v2 key (Google Cloud) in and the GIF tab becomes a
   real search; left blank it falls back to paste-a-GIF-link. */
export const TENOR_KEY = '';
export const CHAT_THEMES = {
  nebula:{ name:'Nebula', my:'linear-gradient(135deg,#b06bff,#2dd4bf)', accent:'#b06bff' },
  sunset:{ name:'Sunset', my:'linear-gradient(135deg,#ff5d8f,#f5b544)', accent:'#ff5d8f' },
  ocean:{  name:'Ocean',  my:'linear-gradient(135deg,#38bdf8,#2dd4bf)', accent:'#38bdf8' },
  aurora:{ name:'Aurora', my:'linear-gradient(135deg,#34d399,#b06bff)', accent:'#34d399' },
  ember:{  name:'Ember',  my:'linear-gradient(135deg,#fb923c,#ff5d8f)', accent:'#fb923c' },
  mono:{   name:'Mono',   my:'linear-gradient(135deg,#8b93a7,#c3c9d6)', accent:'#aab2c5' },
};
export const CHAT_FONTS = {
  inter:{   name:'Clean', css:"'Inter',system-ui,sans-serif" },
  grotesk:{ name:'Space', css:"'Space Grotesk','Inter',sans-serif" },
  mono:{    name:'Mono',  css:"ui-monospace,'SF Mono',Menlo,Consolas,monospace" },
  serif:{   name:'Serif', css:"Georgia,'Times New Roman',serif" },
  round:{   name:'Round', css:"'Comic Sans MS','Trebuchet MS',cursive" },
};
// Built-in chat wallpapers — pure CSS, no external assets, tuned dark for white text
export const CHAT_BGS = {
  aurora:'radial-gradient(120% 80% at 18% 0%,rgba(52,211,153,.17),transparent 55%),radial-gradient(120% 90% at 92% 22%,rgba(176,107,255,.22),transparent 60%),#0d0916',
  dusk:'radial-gradient(130% 90% at 82% 0%,rgba(245,181,68,.15),transparent 55%),radial-gradient(120% 90% at 8% 32%,rgba(255,93,143,.20),transparent 60%),#100a17',
  deep:'radial-gradient(120% 100% at 50% -5%,rgba(56,189,248,.18),transparent 58%),#0a0e18',
  rose:'radial-gradient(120% 90% at 14% 8%,rgba(255,93,143,.22),transparent 55%),radial-gradient(120% 90% at 90% 92%,rgba(176,107,255,.18),transparent 60%),#120a14',
  mesh:'radial-gradient(90% 60% at 10% 8%,rgba(176,107,255,.20),transparent),radial-gradient(90% 60% at 92% 20%,rgba(45,212,191,.15),transparent),radial-gradient(95% 70% at 50% 102%,rgba(255,93,143,.13),transparent),#0b0714',
  ink:'repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 2px,transparent 2px 22px),radial-gradient(120% 90% at 50% 0%,rgba(176,107,255,.10),transparent 60%),#0a0712',
};
export const EMOJI_CATS = [
  ['😀',['😀','😁','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😜','🤪','😎','🤩','🥳','😏','😴','🤤','😐','🙃','🫠','😳','🥺','😢','😭','😤','😡','🤯','🤒','🤗','🤔','🫡','🤫','😬','💀','🤡','👻','😈']],
  ['👋',['👋','🤚','✋','👌','🤌','✌️','🤞','🤟','🤘','🤙','👍','👎','👊','🤛','🤜','👏','🙌','🤝','🙏','💪','🫶','👈','👉','👆','👇','✍️','🤳','💅','🫰','🤲']],
  ['❤️',['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💓','💗','💖','💘','💝','💟','❣️','💔','💯','💢','💬','💤','✨','⭐','🌟','💫','⚡','🔥','🎉']],
  ['🐶',['🐶','🐱','🐭','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐧','🦄','🐳','🦋','🐝','🍕','🍔','🍟','🌭','🍿','🍩','🍪','🎂','🍫','🍦','🧋','☕','🍎','🍓','🍉','🥑','🍜']],
  ['🎮',['⚽','🏀','🏈','⚾','🎾','🏐','🎱','🏓','🏸','🥊','🎮','🕹️','🎲','🎯','🎳','🎤','🎧','🎸','🎹','🎨','✈️','🚗','🚀','🛸','⛺','🎡','🎢','🛹','📚','💻','📱','📷','🎬','🏆','🥇','🎁']],
  ['🪐',['✅','❌','❓','❗','💡','🔒','🔑','📌','📎','🔔','🔕','♻️','⚠️','🚫','🆗','🆒','🎊','🪐','🌌','🌈','☀️','🌙','❄️','🌊','🍀','🌸','🌻','🌵','🗿','🫧']],
];
export const chatKeyOf = sel => sel ? `${sel.scope}:${sel.ref}` : '';
export const isMediaUrl = u => /^https:\/\/\S+$/i.test((u||'').trim());
export const msgPreview = m => m.deleted ? 'unsent a message' : m.kind==='text' ? m.body : m.kind==='gif' ? 'sent a GIF' : 'sent a photo';
export const clockOf = ts => new Date(ts).toLocaleTimeString(undefined,{ hour:'numeric', minute:'2-digit' });
export const dayLabel = ts => {
  const d = new Date(ts), t = new Date(), y = new Date(Date.now()-864e5);
  if (d.toDateString()===t.toDateString()) return 'Today';
  if (d.toDateString()===y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined,{ month:'short', day:'numeric', year: d.getFullYear()===t.getFullYear()?undefined:'numeric' });
};

export const genId = p => p + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-3);
export const normName = s => (s||'').trim().toLowerCase();
export const hueCss = (h, l=62, s=72, a=1) => `hsl(${h} ${s}% ${l}%${a<1?` / ${a}`:''})`;

export function seedSystems(){ return [{ key:'campus', name:'Campus', kind:'campus', hue:265, glyph:'🏫', planets:[] }]; }
export function loadSystems(){
  try{ const a = JSON.parse(localStorage.getItem(SYS_KEY)||'null'); if(Array.isArray(a) && a.length) return a; }catch{}
  return seedSystems();
}
export function saveSystems(a){ try{ localStorage.setItem(SYS_KEY, JSON.stringify(a)); }catch{} }

// full planet list for a system (campus seeds the real campus zones, then any you add)
export function planetsOf(sys){
  if(!sys) return [];
  if(sys.kind==='campus') return ZONES.map(z=>({ id:z.id, name:z.name, icon:z.icon, preset:true })).concat(sys.planets||[]);
  return (sys.planets||[]).slice();
}

// pack/unpack the rich location that rides inside presence.zone
export function encodePlace({ placeLabel, emoji, systemLabel, systemKey, planetId }){
  return JSON.stringify({ p:placeLabel||'', e:emoji||'📍', s:systemLabel||'', k:systemKey||'', pi:planetId||'' });
}
export function decodePlace(zone){
  if(!zone) return null;
  if(typeof zone==='string' && zone.charAt(0)==='{'){
    try{ const o=JSON.parse(zone); if(o && (o.p||o.s)) return { place:o.p||null, emoji:o.e||'📍', system:o.s||null, key:o.k||null, pi:o.pi||null }; }catch{}
  }
  const z = ZONES.find(x=>x.id===zone);            // legacy bare zone id → campus
  return { place: z?z.name:String(zone), emoji: z?z.icon:'📍', system:'Campus', key:'campus' };
}
// a friend's location, but only if they're actually sharing (respects the toggle + ghost)
export function presencePlace(pr){ return (pr && pr.sharing && !pr.ghost && pr.zone) ? decodePlace(pr.zone) : null; }

// space-y ways to say "in <system>" — stable per person, never flickers
export const SYSTEM_PHRASES = [
  s=>`in the ${s} system`, s=>`${s} galaxy`, s=>`orbiting ${s}`, s=>`out in ${s}`, s=>`the ${s} cluster`,
  s=>`roaming ${s}`, s=>`${s} nebula`, s=>`adrift in ${s}`, s=>`cruising ${s}`, s=>`somewhere in ${s}`,
];
export function hashStr(s){ let h=0; s=String(s); for(let i=0;i<s.length;i++) h=(h*31 + s.charCodeAt(i))|0; return Math.abs(h); }
export function systemPhrase(systemLabel, salt=''){
  if(!systemLabel) return null;
  return SYSTEM_PHRASES[hashStr(systemLabel+'|'+salt) % SYSTEM_PHRASES.length](systemLabel);
}

/* ---------- web push + misc ---------- */
export const PUSH_PUBLIC_KEY = 'BG68WxFODT0IPj4ggj47GeagfBKDdZczPkeYykAXWGNVUngeA1E3UVGd1Tx1uiABogaad49MqiOS7GTspw9PUAs';
export function urlB64ToUint8Array(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'));
  const out = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
  return out;
}
export const groupBy = (rows, k) => { const m={}; (rows||[]).forEach(r=>{ (m[r[k]]=m[r[k]]||[]).push(r); }); return m; };


// live prefs object the background canvas reads directly
window.__orbit = window.__orbit || { ...store.getPrefs() };

export let __autoRAF = 0;
export function stopAutoTheme(){ if(__autoRAF){ cancelAnimationFrame(__autoRAF); __autoRAF = 0; } }
export function startAutoTheme(){
  stopAutoTheme();
  const root = document.documentElement.style;
  root.setProperty('--canvas','#100b18'); root.setProperty('--panel','#191221'); root.setProperty('--panel2','#1f1728');
  const set = (H)=>{
    const c = (h,s,l)=>`hsl(${((h%360)+360)%360} ${s}% ${l}%)`;
    root.setProperty('--major', c(H,72,70));
    root.setProperty('--ge',    c(H+155,62,58));
    root.setProperty('--pe',    c(H+120,60,60));
    root.setProperty('--nstp',  c(H+45,82,64));
    root.setProperty('--now',   c(H+300,80,72));
    document.querySelector('meta[name=theme-color]')?.setAttribute('content','#100b18');
  };
  /* Writing five custom properties on <html> invalidates style for the WHOLE
     document, so doing it every frame was recalculating the entire app 60x a
     second — on its own enough to make the Auto theme unusable on a phone.
     The drift is slow (a full spectrum over ~60s), so a step finer than ~0.4°
     is invisible: throttle to a hue quantum and skip the write when nothing
     visibly changed. Costs one extra rAF callback, saves every recalc. */
  const t0 = performance.now();
  const step = perfTier() >= 1 ? 1.2 : 0.4;   // degrees of hue per repaint
  let lastH = NaN;
  const loop = (t)=>{
    __autoRAF = requestAnimationFrame(loop);
    if (document.hidden) return;
    const secPer = Math.max(6, (window.__orbit?.autoSpeed)||60);
    const H = Math.round((((t - t0)/1000) * (360/secPer)) / step) * step;
    if (H === lastH) return;
    lastH = H; set(H);
  };
  __autoRAF = requestAnimationFrame(loop);
}
export function applyTheme(id){
  const root = document.documentElement.style;
  if(id==='auto'){ startAutoTheme(); return; }
  stopAutoTheme();
  const th = THEMES[id] || THEMES.nebula;
  Object.entries(th.v).forEach(([k,val])=>root.setProperty(k,val));
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', th.v['--canvas']);
}
// apply saved theme immediately so there's no flash of the wrong palette
applyTheme(store.getTheme());

// tiny ping chime (WebAudio) — used when the "sounds" pref is on
export let __ac = null;
export function pingChime(){
  try{
    __ac = __ac || new (window.AudioContext||window.webkitAudioContext)();
    if(__ac.state==='suspended') __ac.resume();
    const o=__ac.createOscillator(), g=__ac.createGain(), n=__ac.currentTime;
    o.type='sine'; o.frequency.setValueAtTime(880,n); o.frequency.exponentialRampToValueAtTime(1320,n+.12);
    g.gain.setValueAtTime(0.0001,n); g.gain.exponentialRampToValueAtTime(0.18,n+.02); g.gain.exponentialRampToValueAtTime(0.0001,n+.32);
    o.connect(g); g.connect(__ac.destination); o.start(n); o.stop(n+.34);
  }catch{}
}

/* ---------- utils ---------- */
export const toMin = s => { const [h,m]=s.split(':').map(Number); return h*60+m; };
export const pxFor = m => (Math.max(START, Math.min(END, m)) - START) * (HOUR/60);
export const fmt = min => { let h=Math.floor(min/60), m=min%60, ap=h>=12?'PM':'AM', hh=h%12||12; return hh+(m?':'+String(m).padStart(2,'0'):'')+ap; };
export const nowInfo = () => { const d=new Date(); return { day:(d.getDay()+6)%7, min:d.getHours()*60+d.getMinutes() }; };
export const zoneName = id => ZONES.find(z=>z.id===id)?.name || null;
export const initialsOf = n => { n=(n||'??').trim(); return (n[0]==='@' ? n.slice(1,3) : n.split(/\s+/).map(w=>w[0]).slice(0,2).join('')).toUpperCase(); };
export const firstName = n => (n||'').trim().split(/\s+/)[0] || '—';
// what a person chose to go by — full name, or just @handle if they keep their name private
export const shownName = p => (p && p.show_full_name===false && p.handle) ? '@'+p.handle : (p?.display_name||'');
export const fname = p => { const n = shownName(p); if(!n) return ''; return n[0]==='@' ? n : firstName(n); };
export const ago = ts => {
  if(!ts) return '';
  const s = Math.max(0,(Date.now()-new Date(ts).getTime())/1000);
  if(s<90) return 'just now';
  if(s<3600) return Math.round(s/60)+'m ago';
  if(s<86400) return Math.round(s/3600)+'h ago';
  return Math.round(s/86400)+'d ago';
};
export const cleanHandle = s => (s||'').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,20);
export const uidTail = () => Math.random().toString(36).slice(2,8);

/* ---------- inline icons (stroke, currentColor) ---------- */
export const I = paths => ({size=18, style=''}) => html`<svg width=${size} height=${size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style=${style}
  dangerouslySetInnerHTML=${{__html:paths}} />`;
export const IcBell = I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>');
export const IcHome = I('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>');
export const IcPin = I('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>');
export const IcCal = I('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>');
export const IcUser = I('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
export const IcUsers = I('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>');
export const IcPlus = I('<path d="M5 12h14M12 5v14"/>');
export const IcX = I('<path d="M18 6 6 18M6 6l12 12"/>');
export const IcCheck = I('<path d="M20 6 9 17l-5-5"/>');
export const IcBack = I('<path d="m15 18-6-6 6-6"/>');
export const IcSend = I('<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>');
export const IcSearch = I('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>');
export const IcTrash = I('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>');
export const IcOut = I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>');
export const IcWarn = I('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4M12 17h.01"/>');
export const IcClock = I('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>');
export const IcRadio = I('<circle cx="12" cy="12" r="2"/><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/>');
export const IcUpload = I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>');
export const IcEye = I('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');
export const IcEyeOff = I('<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>');
export const IcGear = I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>');
export const IcPalette = I('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2Z"/>');
export const IcLock = I('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
export const IcShield = I('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>');
export const IcFlag = I('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>');
export const IcMail = I('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/>');
export const IcBan = I('<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>');
export const IcSun = I('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>');
export const IcVolume = I('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>');
export const IcSpark = I('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/>');
export const IcChevron = I('<path d="m6 9 6 6 6-6"/>');
export const IcChat = I('<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/>');
export const IcSmile = I('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01M15 9h.01"/>');
export const IcImage = I('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>');
export const IcMore = I('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>');


/* ---------- shared bits ---------- */
