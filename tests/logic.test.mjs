// Unit tests for Orbit's pure logic. Run: node --import ./tests/setup.mjs --test tests/logic.test.mjs
// Each block pins a bug that actually shipped once, or a rule that security depends on.
import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../core.js');
const glyphs = await import('../glyphs.js');
const plans = await import('../plans.js');
const connect = await import('../connect.js');

test('style sanitisers stop CSS declaration injection', () => {
  assert.equal(core.safeColor('#ff00aa', 'D'), '#ff00aa');
  assert.equal(core.safeColor('red);position:fixed;inset:0;x:(', 'D'), 'D');
  assert.equal(core.safeColor(undefined, 'D'), 'D');
  const v = core.posVars({ x: '0%;position:fixed', y: 12, z: 99 });
  assert.ok(!/position/.test(v), v);
  assert.equal(v, '--cx:0%;--cy:12%;--cz:6');
});

test('schedule import rejects impossible times and oversize files', () => {
  const p = plans.parseScheduleFile(JSON.stringify({ classes: [
    { name: 'Calc', day: 'mon', time: '9:00-10:30' },
    { name: 'Bad minutes', day: 'tue', time: '9:75-10:00' },
    { name: 'Past midnight', day: 'wed', start: 1500, end: 1560 },
    { name: 'Proto day', day: 'constructor', time: '9-10' },
    { name: 'Night', day: 'thu', time: '8pm-9:30pm' },
  ] }));
  assert.deepEqual(p.rows.map(r => r.name), ['Calc', 'Night']);
  assert.deepEqual(p.skipped, [2, 3, 4]);
  assert.throws(() => plans.parseScheduleFile(JSON.stringify({ classes: Array.from({ length: 201 }, () => ({ name: 'x', day: 0, time: '9-10' })) })), /200/);
});

test('an overnight plan spans midnight and splits into two pieces', () => {
  const mon = core.weekStart(new Date());
  const s = new Date(mon); s.setDate(mon.getDate() + 4); s.setHours(21, 0, 0, 0);      // Friday 9PM
  const e = new Date(s.getTime() + 10 * 3600e3);                                        // Saturday 7AM
  const ev = { starts_at: s.toISOString(), ends_at: e.toISOString() };
  assert.deepEqual(core.evPieces(ev, mon), [{ day: 4, s: 1260, e: 1440 }, { day: 5, s: 0, e: 420 }]);
  assert.match(core.whenLabel(ev), /9PM → .* 7AM$/);
  assert.equal(core.durLabel(600), '10h');
});

test('plans without dates fall back to this week', () => {
  const sp = core.evSpan({ day: 2, start_min: 600, end_min: 660 });
  assert.equal(core.dayIdx(sp.s), 2);
  assert.equal(sp.e - sp.s, 3600e3);
});

test('legacy emoji map onto glyph keys; anything else falls back', () => {
  assert.equal(glyphs.toGlyph('☕'), 'coffee');
  assert.equal(glyphs.toGlyph('coffee'), 'coffee');
  assert.equal(glyphs.toGlyph('<img onerror=x>'), 'dot');
  assert.equal(glyphs.glyphKey('constructor'), null);             // prototype keys are not glyphs
  assert.equal(glyphs.glyphKey('__proto__'), null);
  for (const [k, [label, hue, body]] of Object.entries(glyphs.GLYPHS)) {
    assert.ok(k.length <= 8 && /^[a-z0-9]+$/.test(k), `key ${k} must fit the DB (<= 8, a-z0-9)`);
    assert.ok(!/<script|on\w+=|javascript:/i.test(body), `glyph ${k} body must be inert`);
  }
});

test('hobbies read the same in the old and new formats', () => {
  assert.deepEqual(core.hobbyOf('🎮 Gaming'), { text: 'Gaming', g: 'game' });
  assert.deepEqual(core.hobbyOf('Gaming'), { text: 'Gaming', g: 'game' });
  assert.deepEqual(core.hobbyOf('Fishing'), { text: 'Fishing', g: null });
});

test('premade avatars round-trip and stay https', () => {
  for (const n of core.PRESET_AVATARS) {
    const u = core.presetUrl(n);
    assert.match(u, /^https:\/\//);
    assert.equal(core.presetOf(u), n);
  }
  assert.equal(core.presetOf('https://evil.example/avatars/../x.svg'), null);
  assert.equal(core.presetOf('https://evil.example/avatars/cat.svg'), null, 'a lookalike on another host is not a preset');
});

test('Lanyard presence parsing keeps only safe image URLs', () => {
  const now = Date.now();
  const p = connect.presenceOf({
    discord_status: 'online',
    listening_to_spotify: true,
    spotify: { song: 'Song', artist: 'A; B', album_art_url: 'javascript:alert(1)', track_id: 'abc', timestamps: { start: now - 1000, end: now + 1000 } },
    activities: [
      { type: 4, state: 'hi' },
      { type: 0, name: 'Game', application_id: '356875570916753438', assets: { large_image: 'mp:external/"onerror="x' }, timestamps: { start: now - 60e3 } },
    ],
  });
  assert.equal(p.status, 'online');
  assert.equal(p.custom, 'hi');
  assert.equal(p.items[0].kind, 'spotify');
  assert.equal(p.items[0].art, null, 'a non-Spotify-CDN album art URL is dropped');
  assert.equal(p.items[0].sub, 'A, B');
  assert.equal(p.items[1].art, null, 'an external asset with quotes is dropped');
  assert.equal(connect.liveLine(p), 'Listening to Song — A, B');
  assert.equal(connect.presenceOf({ discord_status: 'weird', activities: [] }).status, 'offline');
});

/* ---- 2026-09-24: stories, 24h media, Orbit+, ads, find-a-time ---- */
const media = await import('../media.js');
const stories = await import('../stories.js');
const ads = await import('../ads.js');
const comps = await import('../components.js');

test('Orbit+ is read from plus_until, and the aura only renders while it is live', () => {
  const soon = new Date(Date.now() + 864e5).toISOString(), past = new Date(Date.now() - 1000).toISOString();
  assert.equal(core.isPlus({ plus_until: soon }), true);
  assert.equal(core.isPlus({ plus_until: past }), false);
  assert.equal(core.isPlus(null), false);
  assert.equal(core.auraOf({ plus_until: soon, flair: { aura: 'halo' } }), 'halo');
  assert.equal(core.auraOf({ plus_until: past, flair: { aura: 'halo' } }), null, 'a lapsed member keeps the setting but loses the aura');
  assert.equal(core.auraOf({ plus_until: soon, flair: { aura: 'constructor' } }), null, 'only known aura keys');
});

test('media helpers: extensions, even sizes, when to re-encode', () => {
  assert.equal(media.extOf('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(media.extOf('video/quicktime'), 'mov');
  assert.equal(media.extOf('image/webp'), 'webp');
  assert.equal(media.extOf(''), 'jpg');
  assert.deepEqual(media.fitSize(4032, 3024, 1440), [1440, 1080]);
  assert.deepEqual(media.fitSize(1081, 721, 2000), [1082, 722], 'odd sizes round to even, never upscale');
  assert.deepEqual(media.fitShort(1280, 720, 720), [1280, 720], '720p landscape stays 720p');
  assert.deepEqual(media.fitShort(1080, 1920, 720), [720, 1280], 'portrait phone video keeps its 720 short side');
  assert.equal(media.needsTranscode({ duration: 9, bytes: 3e6, type: 'video/mp4' }, 10, false), false);
  assert.equal(media.needsTranscode({ duration: 14, bytes: 3e6, type: 'video/mp4' }, 10, false), true, 'too long for a story');
  assert.equal(media.needsTranscode({ duration: 5, bytes: 3e6, type: 'video/quicktime' }, 10, false), true, 'iPhone .mov gets normalised');
  assert.equal(media.needsTranscode({ duration: 5, bytes: 20 * 1024 * 1024, type: 'video/mp4' }, 10, true), false, 'Plus has a higher raw ceiling');
  const k = media.randomKey(); assert.match(k, /^[A-Za-z0-9_-]{16}$/, 'keys fit the DB path CHECK');
});

test('time-left labels and byte formatting', () => {
  const now = Date.parse('2026-09-24T10:00:00Z');
  assert.equal(core.leftLabel('2026-09-25T09:30:00Z', now), '23h left');
  assert.equal(core.leftLabel('2026-09-24T10:40:00Z', now), '40m left');
  assert.equal(core.leftLabel('2026-09-24T09:00:00Z', now), 'gone');
  assert.equal(core.fmtBytes(512), '512 B');
  assert.equal(core.fmtBytes(1536), '1.5 KB');
  assert.equal(core.fmtBytes(1024 ** 3), '1.0 GB');
  assert.equal(core.msgPreview({ kind: 'media', body: 'x' }), 'sent a snap');
});

test('stories group per person: yours first, unwatched next, expired dropped', () => {
  const t = Date.parse('2026-09-24T10:00:00Z'), iso = m => new Date(t + m * 6e4).toISOString(), exp = new Date(t + 864e5).toISOString();
  const rows = [
    { id: 'a1', owner: 'amy', created_at: iso(-50), expires_at: exp, audience: 'friends' },
    { id: 'a2', owner: 'amy', created_at: iso(-10), expires_at: exp, audience: 'close' },
    { id: 'b1', owner: 'bo', created_at: iso(-5), expires_at: exp, audience: 'friends' },
    { id: 'm1', owner: 'me', created_at: iso(-30), expires_at: exp, audience: 'friends' },
    { id: 'x1', owner: 'cy', created_at: iso(-2000), expires_at: iso(-1), audience: 'friends' },
  ];
  const g = stories.groupStories(rows, 'me', new Set(['b1', 'a1']), t);
  assert.deepEqual(g.map(x => x.owner), ['me', 'amy', 'bo'], 'expired cy is gone; amy has an unwatched story so she beats newer-but-watched bo');
  assert.equal(g[1].start, 1, 'opens on the first unwatched story');
  assert.equal(g[1].close, true);
  assert.equal(g[0].unseen, false, 'your own story never counts as unwatched');
  const withA = stories.withAds(g, [{ id: 'ad' }], 1);
  assert.deepEqual(withA.map(x => x.ad ? 'AD' : x.owner), ['me', 'amy', 'AD', 'bo', 'AD'], 'ads slot between friends, never after your own');
  assert.equal(stories.withAds(g, [], 1).length, 3);
});

test('ads: weighted pick respects placement; links must be https', () => {
  const list = [{ id: 'a', placements: ['home'], weight: 1 }, { id: 'b', placements: ['home', 'chats'], weight: 3 }];
  assert.equal(ads.pickAd(list, 'stories'), null);
  assert.equal(ads.pickAd(list, 'chats', .01).id, 'b');
  assert.equal(ads.pickAd(list, 'home', .1).id, 'a');
  assert.equal(ads.pickAd(list, 'home', .5).id, 'b');
  assert.equal(ads.isSafeLink('https://x.y/z'), true);
  assert.equal(ads.isSafeLink('javascript:alert(1)'), false);
  assert.equal(ads.isSafeLink('http://x.y'), false);
});

test('find a time intersects everyone, skips Sunday, starts from now today', () => {
  const classesBy = {
    me:  [{ day: 0, start_min: 540, end_min: 660 }],       // Mon 9-11
    amy: [{ day: 0, start_min: 720, end_min: 840 }],       // Mon 12-2
    bo:  [{ day: 0, start_min: 600, end_min: 780 }],       // Mon 10-1
  };
  const w = comps.groupWindows(['me', 'amy', 'bo'], classesBy, [], { minLen: 60, from: 480, to: 1080, days: 2, now: { day: 0, min: 400 } });
  // Monday: me free 8-9, 11-18 · amy 8-12, 14-18 · bo 8-10, 13-18 → shared 8-9 and 14-18
  assert.deepEqual(w.filter(x => x.day === 0).map(x => [x.s, x.e]), [[480, 540], [840, 1080]]);
  assert.deepEqual(w.filter(x => x.day === 1).map(x => [x.s, x.e]), [[480, 1080]], 'Tuesday is wide open');
  const sat = comps.groupWindows(['me'], classesBy, [], { days: 2, now: { day: 5, min: 1300 } });
  assert.equal(sat.length, 0, 'late Saturday then Sunday: nothing to offer');
  const mid = comps.groupWindows(['me'], classesBy, [], { minLen: 30, from: 480, to: 1080, days: 1, now: { day: 0, min: 700 } });
  assert.deepEqual(mid.map(x => [x.s, x.e]), [[705, 1080]], 'today starts at the next quarter hour, not at 8AM');
});
