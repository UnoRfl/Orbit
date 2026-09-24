/* Orbit — glyphs: the app's own symbol set.
   See GUIDE.md for the full map of what lives where.

   Every symbol that isn't somebody's own words — system and place markers,
   plan types, badges, activities, notifications, buttons — is drawn from
   this one set: 24-unit grid, 1.8 stroke, round joins, currentColor. Emoji
   are kept for exactly one job, people talking to each other in chat.

   Symbols are stored by KEY (≤ 8 chars, a-z only) — `planets.icon = 'coffee'`,
   not '☕'. Rows written before this set existed hold emoji; toGlyph() maps
   those onto the nearest key, so nothing needs migrating and nothing breaks.

   The bodies below are constants authored here, never user data, which is
   the only reason dangerouslySetInnerHTML / innerHTML is acceptable for them.
   glyphKey() is the gate: anything that is not a key in this table renders
   the fallback. */
import { html } from './lib.js';

// [label, default hue (for tiles), svg body]   `.f` = filled detail
export const GLYPHS = {
  // ---- space ----
  planet:  ['Planet', 265, '<circle cx="12" cy="12" r="5.5"/><path d="M4.4 15.2c-1.7 2-2.2 3.6-1.4 4.3 1.4 1.4 6.4-1.3 11.1-6s7.4-9.7 6-11.1c-.7-.8-2.3-.3-4.3 1.4"/>'],
  galaxy:  ['Galaxy', 285, '<path d="M12 12c0-1.2 1-2.2 2.2-2.2 1.9 0 3.3 1.5 3.3 3.3 0 3-2.5 5.4-5.5 5.4-4.2 0-7.5-3.4-7.5-7.5C4.5 5.6 8.4 2.5 13 2.5"/><path d="M12 12c0 1.2-1 2.2-2.2 2.2-1.9 0-3.3-1.5-3.3-3.3 0-3 2.5-5.4 5.5-5.4 4.2 0 7.5 3.4 7.5 7.5 0 5.4-3.9 8.5-8.5 8.5"/>'],
  comet:   ['Comet', 195, '<circle cx="15.5" cy="8.5" r="3.6"/><path d="M12.8 11.2 3.5 20.5M10.4 8.1 5.5 13M15.9 13.6 11 18.5"/>'],
  star:    ['Star', 45, '<path d="m12 3.2 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.6l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'],
  spark:   ['Sparkle', 300, '<path d="M11 3.5c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7z"/><path d="M18.5 15.5c.2 1.5.9 2.3 2.5 2.5-1.6.2-2.3 1-2.5 2.5-.2-1.5-.9-2.3-2.5-2.5 1.6-.2 2.3-1 2.5-2.5z"/>'],
  rocket:  ['Rocket', 15, '<path d="M12 2.8c3.4 2.2 4.9 5.8 4.5 10.2L14.4 16H9.6l-2.1-3C7.1 8.6 8.6 5 12 2.8z"/><circle cx="12" cy="9" r="1.7"/><path d="M9.6 16 7 19.2l.4-4.7M14.4 16l2.6 3.2-.4-4.7M12 17.6v3.6"/>'],
  ufo:     ['UFO', 165, '<ellipse cx="12" cy="13.2" rx="9" ry="3.2"/><path d="M7.6 11.3C8 8.5 9.8 6.6 12 6.6s4 1.9 4.4 4.7M7.8 18.6l-1 2M16.2 18.6l1 2M12 16.4v4.1"/>'],
  moon:    ['Moon', 230, '<path d="M19.8 14.6A8 8 0 0 1 9.4 4.2a8 8 0 1 0 10.4 10.4z"/>'],
  orbit:   ['Orbit', 250, '<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9.3" ry="4" transform="rotate(-28 12 12)"/><circle class="f" cx="19.4" cy="7.6" r="1.4"/>'],
  scope:   ['Telescope', 210, '<path d="m4 11.6 11.9-6 1.9 3.8-11.9 6zM15.9 5.6l2.8-1.4 1.9 3.8-2.8 1.4M10.4 13.7 13 21M9.6 13.8 6.6 21"/>'],
  satlite: ['Satellite', 200, '<path d="M4.5 6.5a12.2 12.2 0 0 0 13 13z"/><path d="m10.8 13.2 4-4"/><circle cx="15.8" cy="8.2" r="1.5"/><path d="M16 3.5a4.5 4.5 0 0 1 4.5 4.5"/>'],
  // ---- places ----
  home:    ['Home', 30, '<path d="M3.5 10.8 12 3.8l8.5 7"/><path d="M5.6 9.2v10.9h12.8V9.2"/><path d="M10 20.1v-5.6h4v5.6"/>'],
  school:  ['School', 265, '<path d="M2.5 9.2 12 4.6l9.5 4.6-9.5 4.6z"/><path d="M6.2 11v4.9c1.6 1.5 3.6 2.3 5.8 2.3s4.2-.8 5.8-2.3V11M21.5 9.2v5.5"/>'],
  hall:    ['Hall', 250, '<path d="M3 9.5 12 4l9 5.5zM4.5 20h15M3.5 22h17M6.5 11.5v6.5M10 11.5v6.5M14 11.5v6.5M17.5 11.5v6.5"/>'],
  book:    ['Books', 175, '<path d="M4.5 5.6c0-1.1.9-2 2-2h13v14h-13c-1.1 0-2 .9-2 2z"/><path d="M4.5 19.6c0 1.1.9 2 2 2h13v-4M8.5 7.5h7"/>'],
  coffee:  ['Coffee', 35, '<path d="M4.6 9.6h12v4.9a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.6 11.1h1.2a2.5 2.5 0 0 1 0 5h-1.5M8.3 3.4c-.6.8-.6 1.7 0 2.6M11.8 3.4c-.6.8-.6 1.7 0 2.6"/>'],
  food:    ['Food', 150, '<path d="M3.5 11.6h17a8.5 8.5 0 0 1-17 0z"/><path d="M8.5 20.6h7M14 11.6l5.6-8.4M10.6 11.6l5.4-7"/>'],
  burger:  ['Burger', 25, '<path d="M4.5 10.6a7.5 5.6 0 0 1 15 0z"/><path d="M3.5 13.6h17M5 16.6h14l-1.2 2.9H6.2z"/>'],
  pizza:   ['Pizza', 20, '<path d="M3.6 6.6c5.5-2.7 11.3-2.7 16.8 0L12 21.4z"/><path d="M5.1 9.3c4.6-2 9.2-2 13.8 0"/><circle class="f" cx="10" cy="12.2" r="1.1"/><circle class="f" cx="14.1" cy="13.6" r="1.1"/><circle class="f" cx="11.9" cy="16.6" r="1.1"/>'],
  boba:    ['Milk tea', 30, '<path d="M6.2 8.2h11.6l-1.6 12.2a1.6 1.6 0 0 1-1.6 1.4H9.4a1.6 1.6 0 0 1-1.6-1.4z"/><path d="M5 8.2h14M13 8.2l2.2-5.6"/><circle class="f" cx="10" cy="17.6" r="1"/><circle class="f" cx="13.2" cy="18.4" r="1"/><circle class="f" cx="12" cy="15.4" r="1"/>'],
  icecrm:  ['Dessert', 330, '<path d="M8.2 11.2 12 21l3.8-9.8"/><path d="M7 11.2a5 5 0 0 1 10 0z"/>'],
  cake:    ['Cake', 340, '<path d="M4.6 20.5v-7a2 2 0 0 1 2-2h10.8a2 2 0 0 1 2 2v7M3 20.5h18M4.6 15.6c1.2 1 2.5 1 3.7 0s2.5-1 3.7 0 2.5 1 3.7 0 2.5-1 3.7 0M12 11.5V8.6"/><path d="M12 3.6c.9 1 1.2 1.9.9 2.6a1 1 0 0 1-1.8 0c-.3-.7 0-1.6.9-2.6z"/>'],
  shop:    ['Shopping', 320, '<path d="M5.6 8.1h12.8l-1 12.4H6.6z"/><path d="M9 10.1V7a3 3 0 0 1 6 0v3.1"/>'],
  mall:    ['Mall', 280, '<rect x="4.6" y="3.6" width="14.8" height="16.9" rx="1.6"/><path d="M8.5 7.6h2M13.5 7.6h2M8.5 11.6h2M13.5 11.6h2M10 20.5V16h4v4.5"/>'],
  ball:    ['Basketball', 22, '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4v17.2M6 6c2.8 2.8 2.8 9.2 0 12M18 6c-2.8 2.8-2.8 9.2 0 12"/>'],
  volley:  ['Volleyball', 48, '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4c1.3 3.4.7 6.3-.1 8.6M12 12c3.3.3 6 1.6 7.9 3.6M12 12c-2 2.7-4.6 4.2-7.6 4.6"/>'],
  gym:     ['Gym', 0, '<path d="M6.6 6.6v10.8M4 9.1v5.8M17.4 6.6v10.8M20 9.1v5.8M6.6 12h10.8"/>'],
  game:    ['Games', 260, '<path d="M7.2 7.6h9.6a4.5 4.5 0 0 1 4.4 5.3l-.8 3.8a2.6 2.6 0 0 1-4.4 1.3L14 16.1h-4L8 18a2.6 2.6 0 0 1-4.4-1.3l-.8-3.8a4.5 4.5 0 0 1 4.4-5.3z"/><path d="M8.2 10.4v3.2M6.6 12h3.2"/><circle class="f" cx="15.4" cy="11" r="1"/><circle class="f" cx="17.2" cy="13.1" r="1"/>'],
  film:    ['Movies', 350, '<rect x="3.6" y="5" width="16.8" height="14" rx="2.2"/><path d="M7.6 5v14M16.4 5v14M3.6 9.6h4M3.6 14.4h4M16.4 9.6h4M16.4 14.4h4"/>'],
  music:   ['Music', 300, '<path d="M9 17.8V5.6l11-2.1V15.6"/><circle cx="6.5" cy="17.8" r="2.5"/><circle cx="17.5" cy="15.6" r="2.5"/>'],
  mic:     ['Karaoke', 320, '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.6 11a6.4 6.4 0 0 0 12.8 0M12 17.4V21M8.6 21h6.8"/>'],
  palette: ['Art', 290, '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.8-1 1.3-2.1-.6-1.2.2-2.4 1.5-2.4h1.9a3.8 3.8 0 0 0 3.8-3.8c0-4.8-3.8-8.7-8.5-8.7z"/><circle class="f" cx="7.8" cy="11" r="1.2"/><circle class="f" cx="10.6" cy="7.3" r="1.2"/><circle class="f" cx="15.1" cy="7.8" r="1.2"/>'],
  laptop:  ['Laptop', 210, '<rect x="5" y="5" width="14" height="10" rx="1.6"/><path d="M2.6 19h18.8l-1.4-4H4z"/>'],
  code:    ['Code', 205, '<path d="m8 8-4.5 4L8 16M16 8l4.5 4L16 16M13.6 5l-3.2 14"/>'],
  train:   ['Station', 215, '<rect x="5.6" y="3.6" width="12.8" height="13.4" rx="3"/><path d="M5.6 10.6h12.8M8.6 20.6 10 17M15.4 20.6 14 17"/><circle class="f" cx="9" cy="13.8" r="1"/><circle class="f" cx="15" cy="13.8" r="1"/>'],
  car:     ['Car', 210, '<path d="M4.6 16.4v-3.3l1.8-4.8a2 2 0 0 1 1.9-1.3h7.4a2 2 0 0 1 1.9 1.3l1.8 4.8v3.3z"/><path d="M4.6 13.1h14.8M6.8 16.4v2.2M17.2 16.4v2.2"/>'],
  plane:   ['Travel', 200, '<path d="M20.6 3.4c-.8-.8-2.1-.7-2.9.1l-3.2 3.2-9-2.4-1.7 1.7 7.4 4.3-3.2 3.2-2.7-.4-1.3 1.3 3.2 1.8 1.8 3.2 1.3-1.3-.4-2.7 3.2-3.2 4.3 7.4 1.7-1.7-2.4-9 3.2-3.2c.8-.8.9-2.1.1-2.9z"/>'],
  tree:    ['Park', 130, '<path d="M12 21v-5"/><path d="M12 3a5.9 5.9 0 0 1 5.8 7.4A4 4 0 0 1 16 18H8a4 4 0 0 1-1.8-7.6A5.9 5.9 0 0 1 12 3z"/>'],
  beach:   ['Beach', 185, '<path d="M3.5 11a8.5 8.5 0 0 1 17 0z"/><path d="M12 11v8.4a1.8 1.8 0 0 1-3.6 0M12 2.5V5"/>'],
  church:  ['Church', 40, '<path d="M12 2.5v5M9.8 4.6h4.4M6 21v-8.4l6-5 6 5V21zM3.5 21h17"/><path d="M10.5 21v-3.8a1.5 1.5 0 0 1 3 0V21"/>'],
  clinic:  ['Clinic', 355, '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4"/><path d="M12 8v8M8 12h8"/>'],
  pin:     ['Place', 265, '<path d="M12 21.4s6.5-5.8 6.5-11.4a6.5 6.5 0 0 0-13 0c0 5.6 6.5 11.4 6.5 11.4z"/><circle cx="12" cy="10" r="2.4"/>'],
  walk:    ['Walk', 160, '<circle cx="13.4" cy="4.4" r="1.8"/><path d="M10 21l2-5.6 2.8 2.6V21M8.4 12.4l2.4-4.4 3.4 1 1.9 3.4 2.3.9M11.9 15.4l1-6"/>'],
  party:   ['Party', 320, '<path d="M4 20.5 8.6 8l7.4 7.4z"/><path d="M13.4 5.6c.3-1.3 1.1-2 2.5-2.1M17.1 9.4c1.4-.4 2.5 0 3.4 1M15.2 3l.1.1M20.6 5.6l.1.1M19.2 14.4l.1.1"/>'],
  // ---- interface ----
  mail:    ['Invite', 265, '<rect x="3" y="5.6" width="18" height="12.8" rx="2.2"/><path d="m3.6 7.2 8.4 6 8.4-6"/>'],
  wave:    ['Wave', 40, '<path d="M8 13.4V6.6a1.5 1.5 0 0 1 3 0v4.9M11 11V4.6a1.5 1.5 0 0 1 3 0V11M14 11V6.1a1.5 1.5 0 0 1 3 0v7.3a7.1 7.1 0 0 1-7.1 7.1h-.5a6 6 0 0 1-4.4-2l-1.8-2.4a1.6 1.6 0 0 1 2.3-2.2L8 16"/>'],
  chat:    ['Chat', 230, '<path d="M20.5 11.6a8 8 0 0 1-11.8 7L3.6 20l1.5-4.6a8 8 0 1 1 15.4-3.8z"/>'],
  bell:    ['Alert', 45, '<path d="M6 16.4V11a6 6 0 0 1 12 0v5.4l1.5 2.1h-15z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>'],
  belloff: ['Muted', 0, '<path d="M8.4 5.6A6 6 0 0 1 18 11v4M6 11v5.4l-1.5 2.1H17M10 21a2.2 2.2 0 0 0 4 0M3.5 3.5l17 17"/>'],
  user:    ['Profile', 265, '<circle cx="12" cy="8" r="4"/><path d="M4.6 20.8a7.4 7.4 0 0 1 14.8 0"/>'],
  users:   ['People', 175, '<circle cx="9" cy="8" r="3.6"/><path d="M3 20a6 6 0 0 1 12 0M16 4.8a3.6 3.6 0 0 1 0 6.4M18.6 14.4A6 6 0 0 1 21 20"/>'],
  cal:     ['Plan', 265, '<rect x="3.6" y="5" width="16.8" height="15.4" rx="2.6"/><path d="M3.6 10h16.8M8 3v4M16 3v4"/>'],
  radio:   ['Broadcast', 45, '<circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/>'],
  news:    ['News', 45, '<path d="M3.6 10v4a1 1 0 0 0 1 1H7l8 4.4V4.6L7 9H4.6a1 1 0 0 0-1 1zM18 9a4 4 0 0 1 0 6M7.6 15l1.2 5h2.3l-.9-4"/>'],
  bug:     ['Fix', 150, '<rect x="7.6" y="7.6" width="8.8" height="12.8" rx="4.4"/><path d="M9.6 7.8a2.4 2.4 0 0 1 4.8 0M12 11v9.4M3.6 13.6h4M16.4 13.6h4M4.6 8.6l3 2M19.4 8.6l-3 2M4.6 19l3-2M19.4 19l-3-2"/>'],
  flask:   ['Beta', 190, '<path d="M9.6 3.6h4.8M10.6 3.6v6L4.9 18.6a1.5 1.5 0 0 0 1.3 2.4h11.6a1.5 1.5 0 0 0 1.3-2.4l-5.7-9V3.6M7.6 15h8.8"/>'],
  compass: ['Explore', 200, '<circle cx="12" cy="12" r="8.6"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z"/>'],
  bolt:    ['Fast', 50, '<path d="M13 2.6 5 13.4h6l-1 8 8-10.8h-6z"/>'],
  heart:   ['Heart', 345, '<path d="M12 20s-7.6-4.6-7.6-10A4.3 4.3 0 0 1 12 7.2 4.3 4.3 0 0 1 19.6 10c0 5.4-7.6 10-7.6 10z"/>'],
  flame:   ['Hot', 15, '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.3-5.2 3.5-7.8.6 1.9 1.6 2.9 2.8 3.3C12 7.4 13 4.9 15.2 3c.3 3.4 3.3 5.9 3.3 11 0 4-2.7 7-6.5 7z"/>'],
  leaf:    ['Nature', 120, '<path d="M5 19C5 10.5 10.5 5 20 5c0 9.5-5.5 15-14 15"/><path d="M5 19c3-3 5.5-5.5 9-9"/>'],
  crown:   ['Leader', 45, '<path d="m3.6 8 4 4L12 5l4.4 7 4-4-1.8 10H5.4z"/><path d="M5.6 21h12.8"/>'],
  shield:  ['Staff', 265, '<path d="M12 21s7.4-3.4 7.4-9.4V5.4L12 2.6 4.6 5.4v6.2C4.6 17.6 12 21 12 21z"/>'],
  headset: ['Support', 175, '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.6" y="13.6" width="4" height="6.4" rx="1.5"/><rect x="16.4" y="13.6" width="4" height="6.4" rx="1.5"/><path d="M20 19.6a3 3 0 0 1-3 2.4h-3"/>'],
  star4:   ['Founder', 45, '<path class="f" d="M12 2.6c.8 5.3 4.1 8.6 9.4 9.4-5.3.8-8.6 4.1-9.4 9.4-.8-5.3-4.1-8.6-9.4-9.4 5.3-.8 8.6-4.1 9.4-9.4z"/>'],
  medal:   ['Badge', 45, '<circle cx="12" cy="15" r="5.4"/><path d="M8.6 10.8 5.6 3h4l2.4 5.4M15.4 10.8 18.4 3h-4L12 8.4"/>'],
  ghost:   ['Ghost', 265, '<path d="M5.6 20.4V10a6.4 6.4 0 0 1 12.8 0v10.4l-2.1-1.6-2.1 1.6-2.2-1.6-2.2 1.6-2.1-1.6z"/><circle class="f" cx="9.7" cy="10.6" r="1.2"/><circle class="f" cx="14.3" cy="10.6" r="1.2"/>'],
  map:     ['Map', 175, '<path d="M3.6 6.6 9 4.1l6 2.5 5.4-2.5v13.3L15 19.9l-6-2.5-5.4 2.5z"/><path d="M9 4.1v13.3M15 6.6v13.3"/>'],
  lock:    ['Locked', 0, '<rect x="5" y="10.6" width="14" height="9.8" rx="2.2"/><path d="M8 10.6V7.6a4 4 0 0 1 8 0v3"/>'],
  unlock:  ['Lifted', 150, '<rect x="5" y="10.6" width="14" height="9.8" rx="2.2"/><path d="M8 10.6V7.6a4 4 0 0 1 7.6-1.8"/>'],
  check:   ['Done', 150, '<path d="m5 12.6 4.4 4.4L19 7.4"/>'],
  eye:     ['View', 200, '<path d="M2.6 12S6 5.6 12 5.6 21.4 12 21.4 12 18 18.4 12 18.4 2.6 12 2.6 12z"/><circle cx="12" cy="12" r="3"/>'],
  flag:    ['Report', 350, '<path d="M5.6 21V4M5.6 4.6c4-2 6.4 2 10.4 0l2-1v8.8l-2 1c-4 2-6.4-2-10.4 0"/>'],
  gavel:   ['Moderate', 5, '<path d="m13.4 6.6 4 4M11 9l4-4 4 4-4 4zM12.6 11.4 4 20M13 21h7"/>'],
  block:   ['Blocked', 355, '<circle cx="12" cy="12" r="8.6"/><path d="m6 6 12 12"/>'],
  image:   ['Image', 200, '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2.6"/><circle cx="9" cy="10" r="1.8"/><path d="m20.4 16-4.4-4.4-9.8 7.8"/>'],
  import:  ['Import', 175, '<path d="M12 3.6v10.8M7.6 10l4.4 4.4 4.4-4.4M4 15.6v2.8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.8"/>'],
  gear:    ['Tools', 220, '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4 7 7M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6"/>'],
  log:     ['Log', 220, '<rect x="4.6" y="3.6" width="14.8" height="16.8" rx="2.2"/><path d="M8.6 8h6.8M8.6 12h6.8M8.6 16h4"/>'],
  // ---- activities ----
  pickaxe: ['Mining', 110, '<path d="m5 19.5 8.4-8.4"/><path d="M8.2 6a10.6 10.6 0 0 1 11.6 0M18 15.8a10.6 10.6 0 0 0 0-11.6M12.4 9.6l2 2"/>'],
  target:  ['Aim', 355, '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.6"/><circle class="f" cx="12" cy="12" r="1.2"/>'],
  swords:  ['Battle', 220, '<path d="M4 4h3.2l10.4 10.4M20 4h-3.2L6.4 14.4M14.6 17.6l3-3M9.4 17.6l-3-3M17.2 17.2l3.3 3.3M6.8 17.2l-3.3 3.3"/>'],
  xhair:   ['Shooter', 210, '<circle cx="12" cy="12" r="7.6"/><path d="M12 2.6v5M12 16.4v5M2.6 12h5M16.4 12h5"/>'],
  helmet:  ['Battle royale', 40, '<path d="M3.6 15.4a8.4 8.4 0 0 1 16.8 0v1.2H3.6z"/><path d="M12 7v4.4M3.6 18.8h16.8"/>'],
  trophy:  ['Ranked', 45, '<path d="M7.6 4h8.8v5a4.4 4.4 0 0 1-8.8 0z"/><path d="M7.6 6H4.6a3 3 0 0 0 3 4M16.4 6h3a3 3 0 0 1-3 4M12 13.4v3.6M8.6 20.6h6.8l-.5-3.6H9.1z"/>'],
  burst:   ['Tactical', 30, '<path d="m12 2.6 1.9 5 5-2-2.1 5 4.6 1.4-4.6 1.4 2.1 5-5-2-1.9 5-1.9-5-5 2 2.1-5L2.6 12l4.6-1.4-2.1-5 5 2z"/>'],
  wind:    ['Storm', 260, '<path d="M3.6 8.6h10a2.5 2.5 0 1 0-2.5-2.5M3.6 12.6h14.8a2.5 2.5 0 1 1-2.5 2.5M3.6 16.6h7"/>'],
  robot:   ['Robot', 0, '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.6V8M3 12.4v3.2M21 12.4v3.2"/><circle class="f" cx="9.5" cy="13.2" r="1.3"/><circle class="f" cx="14.5" cy="13.2" r="1.3"/><circle cx="12" cy="3.8" r="1"/>'],
  glove:   ['Fighting', 265, '<path d="M7 9.6a5 5 0 0 1 5-5h1.4a5 5 0 0 1 5 5v2.8a5 5 0 0 1-5 5H9a2 2 0 0 1-2-2zM7 11.6H5.6a2 2 0 0 0 0 4H7M8.6 17.4v3.2h8v-3.2"/>'],
  pawn:    ['Chess', 95, '<circle cx="12" cy="6" r="2.8"/><path d="M9.6 10h4.8l-1 5.6h-2.8zM7.6 20.6h8.8l-1-3.6H8.6z"/>'],
  headph:  ['Listening', 300, '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M4 15a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2zM20 15a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z"/>'],
  cloud:   ['Cloud', 20, '<path d="M7 18.6a4.6 4.6 0 0 1-.4-9.1 6 6 0 0 1 11.6 1.5 3.8 3.8 0 0 1-.6 7.6z"/>'],
  popcorn: ['Watching', 355, '<path d="M6.2 11h11.6l-1.7 9.6H7.9z"/><path d="M10.1 11l.6 9.6M13.9 11l-.6 9.6"/><path d="M6.6 11a2.3 2.3 0 0 1 .9-4.2 2.6 2.6 0 0 1 4.5-2 2.6 2.6 0 0 1 4.5 2 2.3 2.3 0 0 1 .9 4.2"/>'],
  wrench:  ['Building', 205, '<path d="M15.2 3.6a4.6 4.6 0 0 0-3.9 6.2L4.3 16.8a2.1 2.1 0 0 0 3 3l7-7a4.6 4.6 0 0 0 6.2-3.9l-2.8 2.8-2.6-.7-.7-2.6z"/>'],
  puzzle:  ['Design', 280, '<path d="M9 4.6h3.4a1.8 1.8 0 1 1 3.6 0h2.4v4a1.8 1.8 0 1 1 0 3.6v4.2h-4.2a1.8 1.8 0 1 0-3.6 0H5.6v-4.4a1.8 1.8 0 1 0 0-3.6V4.6z"/>'],
  brush:   ['Editing', 205, '<path d="m18.4 3.6-9 9 2 2 9-9a1.4 1.4 0 0 0-2-2z"/><path d="M9.4 12.6c-2.4 0-4 1.6-4 4 0 1.4-.9 2.4-2 3 3 1 7 .5 7.6-3.6z"/>'],
  note:    ['Notes', 220, '<path d="M5.6 3.6h9l4 4v12.8H5.6z"/><path d="M14.6 3.6v4h4M8.6 12h6.8M8.6 16h4.6"/>'],
  dot:     ['Other', 265, '<circle cx="12" cy="12" r="3.6"/>'],
};

/* Emoji already in the database (and in chat-free UI text) → nearest key.
   Anything missing here renders as the caller's fallback. */
const EMOJI = {
  '🪐':'planet','🌌':'galaxy','🌠':'comet','☄️':'comet','⭐':'star','🌟':'star','✨':'spark','🔭':'scope','🚀':'rocket','🛸':'ufo',
  '🛰️':'satlite','🛰':'satlite','🌙':'moon','🏠':'home','🏡':'home','🏫':'school','🏛️':'hall','🏛':'hall','📚':'book','📖':'book',
  '☕':'coffee','🍜':'food','🍔':'burger','🍕':'pizza','🧋':'boba','🍦':'icecrm','🎂':'cake','🛍️':'shop','🛍':'shop','🏬':'mall',
  '🏀':'ball','🏐':'volley','⚽':'ball','🏋️':'gym','🏋':'gym','🎮':'game','🎬':'film','🎵':'music','🎤':'mic','🎨':'palette',
  '💻':'laptop','🚉':'train','🚗':'car','✈️':'plane','🌳':'tree','🏖️':'beach','⛪':'church','🏥':'clinic','📍':'pin','🚶':'walk',
  '🎉':'party','🎳':'target','📨':'mail','👋':'wave','💬':'chat','🔔':'bell','🔕':'belloff','👤':'user','👥':'users','🗓️':'cal',
  '📡':'radio','📢':'news','🐛':'bug','🧪':'flask','🧭':'compass','⚡':'bolt','🛠️':'wrench','🗺️':'map','💾':'note','👑':'crown',
  '🛡️':'shield','🎧':'headph','✦':'star4','🎖️':'medal','🎖':'medal','👻':'ghost','🔒':'lock','🕊️':'unlock','✓':'check','✅':'check',
  '👁':'eye','🚩':'flag','🔨':'gavel','🚫':'block','🖼️':'image','🖼':'image','📥':'import','📜':'log','⛏️':'pickaxe','🎯':'target',
  '⚔️':'swords','🔫':'xhair','🪖':'helmet','🏆':'trophy','💣':'burst','🌪️':'wind','🦾':'robot','🥊':'glove','♟️':'pawn','☁️':'cloud',
  '🍿':'popcorn','🍥':'film','🧩':'puzzle','🖌️':'brush','📝':'note','🌾':'leaf','🌱':'leaf','📷':'image','🍳':'food','🚴':'walk',
  '📺':'film','✍️':'note','💃':'music','🐾':'heart','🛹':'bolt','🧵':'palette','🎙️':'mic','🎗️':'medal','❤️':'heart','🔥':'flame','★':'star','🙈':'eye','🎓':'school','🏟️':'ball','🍰':'cake','🎲':'game',
};
export const glyphKey = v => (typeof v === 'string' && Object.hasOwn(GLYPHS, v)) ? v : null;
export const toGlyph = (v, fallback = 'dot') => glyphKey(v) || (typeof v === 'string' && EMOJI[v.trim()]) || fallback;
export const glyphLabel = k => GLYPHS[toGlyph(k)][0];
export const glyphHue = k => GLYPHS[toGlyph(k)][1];

const svgOpen = size => `<svg class="glyph" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
// for the few places that build DOM by string (map markers) — keys only, never data
export const glyphSVG = (k, size = 18) => svgOpen(size) + GLYPHS[toGlyph(k)][2] + '</svg>';

export const Glyph = ({ k, size = 18, style = '' }) => html`<svg class="glyph" width=${size} height=${size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style=${style}
  dangerouslySetInnerHTML=${{ __html: GLYPHS[toGlyph(k)][2] }}/>`;

/* A symbol from a stored value: a key or a known legacy emoji becomes a glyph;
   anything else (a founder-made badge's own character) is shown as the text it
   is, escaped by Preact like any other text. */
export const Sym = ({ v, size = 16, fallback = 'dot' }) => {
  const k = toGlyph(v, null);
  if (k) return html`<${Glyph} k=${k} size=${size}/>`;
  if (typeof v === 'string' && v.trim()) return html`<span class="symtxt" style=${`font-size:${Math.round(size * 0.85)}px`}>${v.trim().slice(0, 4)}</span>`;
  return html`<${Glyph} k=${fallback} size=${size}/>`;
};

/* A glyph on a small lit tile — the look for anything that marks a THING
   (a system, a place, a plan, a notification). Sized off one number so every
   tile in the app keeps the same proportions: glyph = 54% of the tile. */
export const GlyphTile = ({ k, size = 36, hue = null, radius = null }) => {
  const key = toGlyph(k), h = hue ?? GLYPHS[key][1];
  return html`<span class="gtile" style=${`--th:${Number(h) || 0};width:${size}px;height:${size}px;border-radius:${radius ?? Math.round(size * 0.3)}px`}>
    <${Glyph} k=${key} size=${Math.round(size * 0.54)}/></span>`;
};

/* The pickers: which glyphs make sense where. */
export const SYSTEM_SET = ['planet','galaxy','comet','star','spark','rocket','ufo','moon','orbit','scope','heart','bolt','flame','leaf','game','music','book','home'];
export const PLACE_SET  = ['home','school','hall','book','coffee','food','burger','pizza','boba','icecrm','shop','mall','ball','volley','gym','game',
                           'film','music','mic','palette','laptop','train','car','plane','tree','beach','church','clinic','pin'];
export const EVENT_SET  = ['game','film','cake','party','shop','boba','pizza','target','beach','ball','volley','laptop','mic','book','church','walk','moon','music'];
export const UPDATE_SET = ['rocket','spark','wrench','bug','radio','planet','comet','party','news','flask','map','bell','palette','bolt','compass','note'];
