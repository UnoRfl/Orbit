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
