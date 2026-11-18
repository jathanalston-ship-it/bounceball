// ===================== BOUNCEBALL GAME ENGINE =====================
// Pure, seeded, deterministic. No DOM. Same seed + same rosters + same coaches + same season + same
// ENGINE_VERSION = same game. A stored game only needs {seed, lineups, coaches, season, ctx}; frames are re-derived.
//
// v0.6: the rules change with the era (the flagrant rule in 1969, the fighting crackdown in 1977, helmets and pads
// in 1986, the two-man gang limit in 1998, the targeting rule in 2011). Referee crews have tendencies and lean
// (slightly) toward the home team. Cheap shots bring enforcers and fights. Players have a temperament: clutch or
// not, streaky (a subtle hot hand), tough or easily rattled, hot-tempered or calm; grudges, rivalries and revenge
// games carry from game to game, and new teammates take time to click. Tired legs (back-to-backs, travel) and
// concussion history come in from the league. Everything per-game arrives in opts.ctx, so replays still match.
// v0.5: coaches run real sets from a playbook (Horns, Spain, Floppy, Elevator, Hammer, handoffs, post splits,
// after-timeout and baseline-inbound plays), pick a pick-and-roll coverage (drop, hedge, switch, ice, hit trap),
// hunt mismatches and scram-switch out of them, and scout the opponent. The tackle game goes deeper: a hit on
// a dribbler pops the ball loose, ball handlers juke, spin, stiff-arm and hurdle, tacklers wrap up, dive or
// lay a big hit, dirty hits draw flagrants (and ejections), and hard hits injure players.
// v0.4: coaches build a gameplan before every game (offensive system, defensive scheme, tackle policy,
// matchups, doubles), pick a starting five and rotation that fit it, and adjust at timeouts and halftime.
// Every player gets an archetype from his ratings; the plan hands out jobs and each player does his job his
// own way (and low-IQ hotheads freelance). Rules added: fumbles are live balls, gang tackles are legal,
// and hitting an airborne player is roughing. The four-point line arrives with the 1979 merger.
"use strict";
const ENGINE_VERSION = "0.6.0";
const C = {
  L: 94, W: 50, HX: [5.25, 88.75], HY: 25, RIM: 10,
  R3: 23.75, C3: 22, C3X: 14.2, R4: 30, FTD: 15,
  DT: 0.05, G: 32.2, QLEN: 720, OTLEN: 300, SC: 24,
  FLOOR_E: 0.8,          // floor restitution: the Akron-spec rubber floor bounces livelier than hardwood
  FLOOR_VERT_IN: 12,     // average vertical boost from the floor (inches)
  FS: 92,                // floats per recorded frame: 10 players x 8, ball x 5, game state x 7
  FOUR_YEAR: 1979        // the WBA merger brought the four-point line
};
const DT = C.DT, GRAV = C.G;
// What each player is doing, recorded in every frame so the broadcast can animate it.
const ACT = { NONE: 0, DRIBBLE: 1, SHOOT: 2, LAYUP: 3, DUNK: 4, PASS: 5, CATCH: 6, TACKLE: 7, DOWN: 8, GETUP: 9, CONTEST: 10, REBOUND: 11, SWAT: 12,
  CELEBRATE: 13, STANCE: 14, BOXOUT: 15, SCREEN: 16, FT: 17, INBOUND: 18, STUMBLE: 19, REACH: 20, POST: 21, HUDDLE: 22, CALL: 23, WALL: 24,
  SPIN: 25, HURDLE: 26, STIFFARM: 27, JUKE: 28, HURT: 29, DIVE: 30, BIGHIT: 31, FIGHT: 32, HOLD: 33 };
const BALL_MODE = { held: 0, pass: 1, shot: 2, loose: 3, dead: 4, ftshot: 5 };

// ---------- strategy vocabulary ----------
// w = shot appetite multipliers for [at the rim, mid-range two, three, four]
const SYSTEMS = {
  motion: { name: "Motion", blurb: "the ball never sticks: cuts, screens away, swing passes", pace: 0.1, hold: 1.5, pnr: 0.75, iso: 0.3, post: 0.6, cut: 1.9, offscr: 1.4, lob: 0.8, crash: 1, swing: 0.05, w: [1.0, 0.97, 1.03, 0.98] },
  helio:  { name: "Heliocentric", blurb: "everything runs through the star: pick-and-roll and isolation", pace: -0.2, hold: 3.0, pnr: 1.6, iso: 1.5, post: 0.4, cut: 0.6, offscr: 0.6, lob: 1.0, crash: 1, swing: -0.05, w: [1.0, 1.06, 1.0, 0.96] },
  power:  { name: "Power", blurb: "bruisers carry it into contact, post-ups, three men on the glass", pace: -0.35, hold: 2.6, pnr: 0.6, iso: 0.5, post: 2.4, cut: 1.0, offscr: 0.5, lob: 0.8, crash: 3, swing: 0, w: [1.1, 0.98, 0.9, 0.76] },
  four:   { name: "Four Ball", blurb: "spread to 30 feet and run snipers off screens", pace: 0.05, hold: 1.8, pnr: 0.9, iso: 0.4, post: 0.3, cut: 0.7, offscr: 2.6, lob: 0.6, crash: 1, swing: 0.04, w: [0.97, 0.88, 0.95, 1.11] },
  bounce: { name: "Bounce", blurb: "push the pace, lobs and rim runs off the rubber floor", pace: 0.45, hold: 1.8, pnr: 1.0, iso: 0.6, post: 0.4, cut: 1.4, offscr: 0.6, lob: 2.6, crash: 2, swing: 0.02, w: [1.12, 0.88, 0.95, 0.86], leak: true }
};
// what a coach calls on a half-court trip (weights); "flow" = no set, just the system's rules
const PLAYS = {
  motion: { flow: 55, pnr: 16, post: 10, offscr: 14, iso: 5 },
  helio:  { pnr: 44, iso: 30, flow: 16, offscr: 5, post: 5 },
  power:  { post: 45, flow: 25, pnr: 15, iso: 10, offscr: 5 },
  four:   { offscr: 34, flow: 31, pnr: 25, iso: 5, post: 5 },
  bounce: { flow: 35, pnr: 30, iso: 15, offscr: 10, post: 10 }
};
const PLAY_NAME = { pnr: "pick-and-roll", iso: "isolation", post: "post-up", offscr: "screens for a shooter", flow: "flow" };
// The playbook. fam = which family it counts under; w = how often each system calls it; dia = the chalkboard
// diagram in hoop frame ([out, lateral]): o = where each role starts, a = arrows [role, from, to, kind]
// (kind: c = cut, s = screen, p = pass, d = dribble). Lateral sides flip when the set is run to the other side.
const SETS = {
  high: { name: "High pick-and-roll", fam: "pnr", w: { motion: 10, helio: 25, power: 10, four: 14, bounce: 18 },
    dia: { o: { h: [27, 0], x: [18, 3], a: [1, -21], b: [1, 21], c: [8, -14] }, a: [["x", [18, 3], [25, 2], "s"], ["h", [27, 0], [18, -6], "d"], ["x", [25, 2], [4, 3], "c"]] } },
  horns: { name: "Horns", fam: "pnr", w: { motion: 8, helio: 14, power: 6, four: 10, bounce: 6 },
    dia: { o: { h: [27, 0], x: [14, -6], y: [14, 6], a: [1, -21], b: [1, 21] }, a: [["x", [14, -6], [24, -3], "s"], ["h", [27, 0], [16, -11], "d"], ["x", [24, -3], [3, -3], "c"], ["y", [14, 6], [3, 3], "c"]] } },
  spain: { name: "Spain pick-and-roll", fam: "pnr", w: { motion: 4, helio: 10, power: 2, four: 8, bounce: 8 },
    dia: { o: { h: [27, 0], x: [18, 2], y: [16, -4], a: [1, -21], b: [1, 21] }, a: [["x", [18, 2], [25, 1], "s"], ["h", [27, 0], [17, 9], "d"], ["y", [16, -4], [19, 1], "s"], ["x", [25, 1], [2, 0], "c"], ["y", [19, 1], [27, -10], "c"]] } },
  iso: { name: "Clear-out isolation", fam: "iso", w: { motion: 4, helio: 22, power: 10, four: 4, bounce: 10 },
    dia: { o: { h: [24, -10], x: [3, 9], a: [1, -21], b: [1, 21], c: [24, 14] }, a: [["h", [24, -10], [6, -4], "d"]] } },
  post: { name: "Post-up", fam: "post", w: { motion: 8, helio: 4, power: 30, four: 3, bounce: 6 },
    dia: { o: { h: [22, -14], x: [5, -7], a: [1, 21], b: [24, 12], c: [8, 14] }, a: [["h", [22, -14], [5, -7], "p"], ["x", [5, -7], [2, -2], "d"]] } },
  split: { name: "Post split", fam: "post", w: { motion: 6, helio: 1, power: 15, four: 2, bounce: 3 },
    dia: { o: { h: [22, -12], x: [6, -7], a: [24, 0], b: [1, 21], c: [8, 14] }, a: [["h", [22, -12], [6, -7], "p"], ["h", [22, -12], [22, -4], "s"], ["a", [24, 0], [24, -16], "c"], ["h", [22, -4], [3, -2], "c"]] } },
  floppy: { name: "Floppy", fam: "offscr", w: { motion: 8, helio: 3, power: 2, four: 18, bounce: 3 },
    dia: { o: { h: [27, 0], s: [2, 0], x: [7, -9], y: [7, 9], a: [1, 21] }, a: [["s", [2, 0], [7, -7], "c"], ["x", [7, -9], [8, -8], "s"], ["s", [7, -7], [20, -17], "c"], ["h", [27, 0], [20, -17], "p"]] } },
  elevator: { name: "Elevator doors", fam: "offscr", w: { motion: 4, helio: 2, power: 1, four: 12, bounce: 2 },
    dia: { o: { h: [24, -16], s: [8, -2], x: [22, -2.5], y: [22, 2.5], a: [1, 21] }, a: [["s", [8, -2], [22, 0], "c"], ["x", [22, -2.5], [22, -0.5], "s"], ["y", [22, 2.5], [22, 0.5], "s"], ["s", [22, 0], [30, 0], "c"], ["h", [24, -16], [30, 0], "p"]] } },
  dho: { name: "Dribble handoff", fam: "offscr", w: { motion: 10, helio: 2, power: 4, four: 8, bounce: 3 },
    dia: { o: { k: [24, -4], s: [10, -16], a: [1, 21], b: [1, -21], c: [6, 10] }, a: [["s", [10, -16], [24, -6], "c"], ["k", [24, -4], [24, -6], "p"], ["s", [24, -6], [12, 2], "d"]] } },
  hammer: { name: "Hammer", fam: "offscr", w: { motion: 5, helio: 6, power: 2, four: 6, bounce: 5 },
    dia: { o: { h: [24, -14], c: [1, 21], x: [4, 10], a: [1, -21], b: [24, 12] }, a: [["h", [24, -14], [4, -9], "d"], ["x", [4, 10], [3, 17], "s"], ["c", [1, 21], [8, 22], "c"], ["h", [4, -9], [8, 22], "p"]] } },
  flow: { name: "Flow", fam: "flow", w: { motion: 40, helio: 20, power: 18, four: 22, bounce: 52 } }
};
// pick-and-roll coverages: what the screener's defender (and the ball's defender) do when the screen comes
const COVERS = {
  drop: { name: "Drop", blurb: "the big sags to protect the rim; gives up the pull-up" },
  hedge: { name: "Hedge", blurb: "the big jumps out to stall the ball, then recovers" },
  switch: { name: "Switch", blurb: "trade assignments on every screen" },
  ice: { name: "Ice", blurb: "keep it out of the middle, push it to the sideline" },
  trap: { name: "Hit trap", blurb: "both defenders go at the ball handler and bury him" }
};
// in-game injuries: [name, severity (0 = out for the night, 3 = long term), games out lo, hi]
const INJURIES = [["stinger", 0, 0, 0], ["bruised ribs", 1, 1, 4], ["sprained ankle", 1, 3, 10], ["concussion", 2, 3, 12], ["hamstring strain", 1, 4, 14], ["separated shoulder", 2, 10, 30], ["broken wrist", 3, 20, 45], ["torn ACL", 3, 82, 82]];
const MOVES = { juke: "Juke", spin: "Spin move", stiff: "Stiff-arm", hurdle: "Hurdle" };
const TECH_Q = { wrap: 0.06, hit: -0.04, dive: 0.03 }; // how well each technique brings him down
const FLAG_RATE = 0.021, INJ_RATE = 0.012;         // flagrant and injury calibration
const FIGHT_RATE = 0.04;                            // fights (before the 1977 crackdown; about a quarter of that after)
const TECHS = { wrap: "Wrap-up", hit: "Big hit", dive: "Dive at the legs" };
const SCHEMES = {
  man: { name: "Man-to-Man", blurb: "everybody takes a man, help on drives" },
  switch: { name: "Switch Everything", blurb: "switch every screen" },
  goalie: { name: "Goalie", blurb: "the rim protector stays home: 2s can be swatted on the way down" },
  extend: { name: "Extend", blurb: "guard the shooters out to the four-point line" },
  zone: { name: "Zone", blurb: "2-3 zone; whoever owns the area makes the hit" }
};
const HITS = {
  blitz: { name: "Blitz", blurb: "hit the ball handler early and often, gang tackles welcome" },
  contain: { name: "Contain", blurb: "hit drivers and anyone in the paint, stay home on the perimeter" },
  disciplined: { name: "Disciplined", blurb: "rarely tackle; no cheap fouls, no 4-on-5" }
};
const ARCH = {
  GEN: { name: "Floor General", w: [1, 1, 1, 0.95], pass: 1.12 },
  CRE: { name: "Shot Creator", w: [1, 1.1, 1.02, 0.94], pass: 0.92 },
  SLA: { name: "Slasher", w: [1.12, 0.92, 0.94, 0.82], pass: 0.96 },
  DOZ: { name: "Bulldozer", w: [1.15, 0.9, 0.85, 0.72], pass: 0.92 },
  FSN: { name: "Four Sniper", w: [0.95, 0.9, 1.0, 1.14], pass: 0.96 },
  MRK: { name: "Marksman", w: [0.96, 1.0, 1.14, 1.0], pass: 0.96 },
  SPT: { name: "Spot-Up Shooter", w: [0.96, 0.95, 1.1, 1.0], pass: 1 },
  STR: { name: "Stretch Big", w: [0.98, 0.95, 1.05, 1.08], pass: 1 },
  RUN: { name: "Rim Runner", w: [1.15, 0.85, 0.82, 0.7], pass: 1 },
  PST: { name: "Post Hub", w: [1.08, 1.03, 0.88, 0.78], pass: 1.04 }
};
const DARCH = { GOA: "Goalie", HIT: "Enforcer", LCK: "Lockdown", HWK: "Ballhawk", SIV: "Liability" };
const JOBS = { c1: "Primary creator", c2: "Second creator", post: "Post hub", run: "Rim runner", snipe: "Sniper", space: "Spacer" };
const PT_LABEL = { trans: "Transition", lob: "Alley-oops", putback: "Putbacks", post: "Post-ups", pnr: "Pick-and-roll", roll: "Roll man", iso: "Isolation",
  offscr: "Off screens", cut: "Cuts", drive: "Drives", spot: "Catch-and-shoot", pullup: "Pull-ups", hand: "Handoffs", ft: "Free throws" };
// how much each archetype adds to a lineup in each system
const SYSB = {
  motion: { GEN: 5, SPT: 3, MRK: 3, PST: 3, STR: 3, CRE: 1 },
  helio: { CRE: 5, GEN: 3, SPT: 4, MRK: 4, RUN: 3, FSN: 2 },
  power: { DOZ: 7, PST: 7, GEN: 2, RUN: 2 },
  four: { FSN: 8, STR: 6, SPT: 3, GEN: 2 },
  bounce: { RUN: 7, SLA: 6, GEN: 2, CRE: 2 }
};
const DEF_TAC = { pace: 0, tackle: 1, four: 1, sw: 0.5, depth: 9, d: 0, o: 0, sys: "motion", scheme: "man", hit: "contain", cov: "", adapt: 0.5, disc: 0.5, late: 0.5, star: 0.5 };
const LEAGUE_W = [1.0, 1.0, 0.92, 0.94]; // league-wide shot appetite (calibration)
const ROLE_BIT = { PG: 1, WING: 2, SNIPER: 4, BRUISER: 8, BIG: 16 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hyp(x, y) { return Math.sqrt(x * x + y * y); }
function dist(a, b) { return hyp(a.x - b.x, a.y - b.y); }
// side index (0 = left hoop, 1 = right hoop) that team t attacks in a period
function attSide(t, per) { return ((t === 0) !== (per >= 3)) ? 1 : 0; }
function dirOf(side) { return side === 1 ? -1 : 1; } // unit x from that hoop toward midcourt
// The rulebook by season (no season = today's rules)
const RULE_YEARS = { four: 1979, flag: 1969, fightBan: 1977, gear: 1986, gang: 1998, target: 2011 };
const RULE_NOTES = {
  flag: "Flagrant rule: dirty hits draw two shots and the ball; the worst ones mean an ejection",
  fightBan: "Fighting crackdown: fighting means an automatic ejection and a multi-game suspension",
  four: "The four-point line arrives (30 ft)",
  gear: "Soft-shell helmets and shoulder pads become mandatory",
  gang: "Two-man limit: a third tackler piling on is a foul",
  target: "Targeting rule: a hit to the head is an automatic flagrant 2"
};
function rulesFor(season) {
  const s = season > 0 ? season : 1e9, R = {};
  for (const k in RULE_YEARS) R[k] = s >= RULE_YEARS[k];
  return R;
}
function shotValue(x, y, side, four) {
  const hx = C.HX[side], d = hyp(x - hx, y - C.HY);
  if (four !== false && d >= C.R4) return 4;
  const fromBase = side === 1 ? C.L - x : x;
  if (Math.abs(y - C.HY) >= C.C3 && fromBase <= C.C3X) return 3;
  if (d >= C.R3) return 3;
  return 2;
}
function shotCls(val, d) { return val === 4 ? 3 : val === 3 ? 2 : d < 10 ? 0 : 1; }

// ---------- DETERMINISTIC MATH ----------
// Math.sin/cos/log/atan2 are NOT guaranteed bit-identical across JS engines (V8 vs JavaScriptCore).
// These use only + - * / and sqrt, which IEEE-754 makes exact everywhere, so a seed replays identically
// in Node (where history is simmed) and in any browser (where it's replayed).
const PI = 3.141592653589793, TWO_PI = 6.283185307179586, HALF_PI = 1.5707963267948966;
function dsin(x) {
  x = x - TWO_PI * Math.round(x / TWO_PI);
  if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156 * (1 - x2 / 210 * (1 - x2 / 272 * (1 - x2 / 342)))))))));
}
function dcos(x) { return dsin(x + HALF_PI); }
function dlog(x) {
  let e = 0;
  while (x >= 2) { x *= 0.5; e++; }
  while (x < 1) { x *= 2; e--; }
  if (x > 1.4142135623730951) { x *= 0.5; e++; }
  const t = (x - 1) / (x + 1), t2 = t * t; let s = 0, term = t;
  for (let k = 1; k <= 31; k += 2) { s += term / k; term *= t2; }
  return 2 * s + e * 0.6931471805599453;
}
function datan(z) {
  const neg = z < 0; if (neg) z = -z;
  let inv = false; if (z > 1) { z = 1 / z; inv = true; }
  z = z / (1 + Math.sqrt(1 + z * z)); z = z / (1 + Math.sqrt(1 + z * z));
  const z2 = z * z; let s = 0, term = z, sg = 1;
  for (let k = 1; k <= 33; k += 2) { s += sg * term / k; term *= z2; sg = -sg; }
  let r = 4 * s; if (inv) r = HALF_PI - r; return neg ? -r : r;
}
// 0.5^x for half-life decay (Math.pow isn't bit-identical across engines either)
function dhalf(x) {
  if (x <= 0) return 1; if (x > 60) return 0;
  const n = Math.floor(x), y = -(x - n) * 0.6931471805599453; let r = 1;
  for (let i = 0; i < n; i++) r *= 0.5;
  let s = 1, term = 1; for (let k = 1; k <= 18; k++) { term *= y / k; s += term; }
  return r * s;
}
function datan2(y, x) {
  if (x > 0) return datan(y / x);
  if (x < 0) return y >= 0 ? datan(y / x) + PI : datan(y / x) - PI;
  return y > 0 ? HALF_PI : y < 0 ? -HALF_PI : 0;
}

// ---------- RNG ----------
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeRng(seed) {
  const r = mulberry32(seed >>> 0);
  return {
    next: r,
    range: (a, b) => a + (b - a) * r(),
    int: (a, b) => Math.floor(a + (b - a + 1) * r()),
    chance: p => r() < p,
    pick: arr => arr[Math.floor(r() * arr.length)],
    normal: (m, s) => { let u = 0; while (!u) u = r(); const v = r(); return m + s * Math.sqrt(-2 * dlog(u)) * dcos(2 * Math.PI * v); }
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ---------- PLAYER PROFILES ----------
// Archetypes are judged against position peers ([mean, sd] of each raw score, from 20,000 generated
// players) plus a prior, so a player is labeled by what makes him stand out at his position.
const ARCH_BASE = {"PG":{"GEN":[68.4,6.5],"CRE":[58.2,5.5],"SLA":[51.4,6.2],"DOZ":[35.6,6.6],"FSN":[47.1,8.9],"MRK":[52,9],"SPT":[50.6,9],"RUN":[33.1,5.9],"PST":[33.5,6.1]},
  "WING":{"GEN":[36.2,6.6],"CRE":[54.6,5.4],"SLA":[47.6,6.5],"DOZ":[38.1,7.2],"FSN":[46,9],"MRK":[55,9],"SPT":[52.9,8.6],"RUN":[45.9,6.3],"PST":[37.9,6.4],"STR":[59.7,8.1]},
  "SNIPER":{"GEN":[38.2,6.4],"CRE":[44,5.7],"SLA":[43.3,6.3],"DOZ":[29.3,6.7],"FSN":[74.8,9.4],"MRK":[67,9],"SPT":[59.4,8.7],"RUN":[40.9,6],"PST":[30.5,6.2],"STR":[78.5,10.1]},
  "BRUISER":{"GEN":[33.7,6.5],"CRE":[38.2,5.4],"SLA":[39,6.3],"DOZ":[67.4,8.1],"FSN":[28.4,7.5],"MRK":[34,8],"SPT":[34.1,7.8],"STR":[40.7,7.6],"RUN":[44.1,6.1],"PST":[55.6,6.4]},
  "BIG":{"GEN":[27.1,6.6],"CRE":[35.1,5.3],"SLA":[35.8,6.4],"DOZ":[52.5,8.2],"FSN":[22.6,6.3],"MRK":[28,8],"SPT":[29.3,7],"STR":[35.2,6.9],"RUN":[52.1,6.3],"PST":[60.3,6.5]}};
const ARCH_PRIOR = {
  PG: { GEN: 0.55, CRE: 0.25, SLA: 0.3, SPT: 0.15, FSN: -0.2, MRK: -0.2 },
  WING: { CRE: 0.25, SLA: 0.3, SPT: 0.15, RUN: 0.05, FSN: 0, MRK: 0, DOZ: -0.25 },
  SNIPER: { FSN: 0.55, MRK: 0.55, SPT: 0.15, CRE: -0.15 },
  BRUISER: { DOZ: 0.25, PST: 0.15, RUN: 0.1, SPT: -0.3 },
  BIG: { PST: 0.3, RUN: 0.25, STR: 0, DOZ: -0.4 }
};
// Skill indexes and an offensive/defensive archetype, from ratings and body. Pure; the viewer uses it too.
function profile(p, four) {
  if (four === undefined) four = true;
  const r = p.r, role = p.role;
  const big = clamp((p.ht - 76) / 9, 0, 1), heavy = clamp((p.wt - 205) / 50, 0, 1.2);
  const reachIn = p.ht * 1.33 + ((p.wing || p.ht + 3) - p.ht) * 0.6;
  const aggr = p.aggr === undefined ? 0.5 : p.aggr;
  const f = {
    hand: r.sec * 0.4 + r.pas * 0.35 + r.iq * 0.25,
    cre: r.mid * 0.3 + r.thr * 0.15 + r.sec * 0.2 + r.spd * 0.12 + r.acc * 0.13 + r.ins * 0.1,
    fin: r.ins * 0.55 + r.vert * 0.2 + r.str * 0.1 + r.bnc * 0.15,
    shoot: Math.max(r.thr, four ? r.fr + 4 : 0),
    carry: r.brk * 0.45 + r.str * 0.3 + r.sec * 0.25 + heavy * 12 - 6,
    lob: r.vert * 0.35 + r.bnc * 0.25 + r.ins * 0.25 + r.spd * 0.15 + (reachIn - 105) * 0.5,
    post: r.str * 0.35 + r.ins * 0.4 + r.iq * 0.1 + r.pas * 0.15 + big * 6,
    scr: r.str * 0.6 + heavy * 30 + big * 10,
    rimD: r.rim * 0.65 + r.vert * 0.15 + (reachIn - 105) * 0.9 + r.iq * 0.15,
    perD: r.perD * 0.6 + r.spd * 0.2 + r.iq * 0.2,
    hit: r.tck * 0.65 + r.str * 0.2 + aggr * 30,
    hawk: r.perD * 0.35 + r.hands * 0.4 + r.iq * 0.25,
    reb: r.reb * 0.7 + r.str * 0.15 + big * 15
  };
  f.off = Math.max(f.cre, f.fin * 0.92, f.shoot * 0.95, f.post * 0.9) * 0.7 + (f.cre + f.shoot + f.fin) / 3 * 0.3;
  f.def = Math.max(f.perD, f.rimD, f.hit * 0.9);
  const guard = role === "PG" || role === "WING" || role === "SNIPER";
  const o = {
    GEN: f.hand + (role === "PG" ? 6 : -8) - big * 10,
    CRE: f.cre + (role === "WING" || role === "PG" ? 3 : -6),
    SLA: (r.spd + r.acc) * 0.25 + r.ins * 0.3 + r.vert * 0.2 - big * 8 + (guard ? 0 : -4),
    DOZ: f.carry + (role === "BRUISER" ? 6 : 0) - (guard ? 6 : 0),
    FSN: four ? r.fr + 2 + (role === "SNIPER" ? 4 : 0) - big * 6 : -99,
    MRK: four ? -99 : r.thr + (role === "SNIPER" ? 4 : 0) - big * 6,
    SPT: r.thr * 0.85 + r.mid * 0.15 - 3,
    STR: big > 0.45 ? f.shoot + 2 : -99,
    RUN: f.lob - 4 + big * 4 - (role === "PG" ? 8 : 0),
    PST: f.post - 4 + (role === "BIG" || role === "BRUISER" ? 4 : -10)
  };
  const base = ARCH_BASE[role] || ARCH_BASE.WING, prior = ARCH_PRIOR[role] || ARCH_PRIOR.WING;
  const floor = { RUN: f.lob >= 55 && p.ht * 1.33 / 12 + (20 + r.vert * 0.2 + 12) / 12 >= 10.4, FSN: r.fr >= 55, MRK: r.thr >= 55, SPT: r.thr >= 52, STR: f.shoot >= 55, SLA: r.ins >= 45, PST: r.str >= 50 };
  f.raw = o;
  let arch = null, av = -1e9;
  for (const k in prior) { if (o[k] < -50 || !base[k]) continue; const z = (o[k] - base[k][0]) / base[k][1] + prior[k] - (floor[k] === false ? 1.5 : 0); if (z > av) { av = z; arch = k; } }
  if (!arch) { av = -1e9; for (const k in o) if (o[k] > av) { av = o[k]; arch = k; } }
  const dd = { GOA: f.rimD + (role === "BIG" ? 2 : -6), HIT: f.hit * 0.92, LCK: f.perD + 2 - big * 4, HWK: f.hawk };
  let darch = "LCK", dv = -1e9; for (const k in dd) if (dd[k] > dv) { dv = dd[k]; darch = k; }
  if (dv < 47) darch = "SIV";
  f.arch = arch; f.darch = darch;
  return f;
}
// how closely a player sticks to the gameplan (smart, calm players do; low-IQ hotheads freelance)
function compliance(p, tac) {
  const aggr = p.aggr === undefined ? 0.5 : p.aggr;
  return clamp(0.55 + (p.r.iq - 55) * 0.006 + ((tac ? tac.disc : 0.5) - 0.5) * 0.5 - (aggr - 0.5) * 0.45, 0.15, 0.95);
}
function archetype(p, season) { const f = profile(p, rulesFor(season).four); return { off: f.arch, def: f.darch, offName: ARCH[f.arch].name, defName: DARCH[f.darch] }; }
function ftProb(r, energy) { return clamp((0.42 + r.ft * 0.0062) * (0.95 + 0.05 * (energy === undefined ? 1 : energy)), 0.3, 0.95); }

// offensive spots in hoop frame: [distance out from hoop toward midcourt, lateral offset]
const SPOTS = {
  TOP:[26,0], WING_L:[19,-17], WING_R:[19,17], CORNER_L:[1,-22.6], CORNER_R:[1,22.6],
  FOUR_TOP:[32,0], FOUR_L:[24,-19.6], FOUR_R:[24,19.6],
  DUNK_L:[1.5,-7], DUNK_R:[1.5,7], ELBOW_L:[14,-6], ELBOW_R:[14,6], POST_L:[5,-6.5], POST_R:[5,6.5]
};
const SPOT_ALL = Object.keys(SPOTS);
const ZONE = [[16.5, -7.5], [16.5, 7.5], [7, -12.5], [7, 12.5], [3, 0]]; // 2-3 zone
const JOB_ORDER = { c1: 0, post: 1, run: 2, c2: 3, snipe: 4, space: 5 };
function mirrorSpot(s) { return s.endsWith("_L") ? s.replace("_L", "_R") : s.endsWith("_R") ? s.replace("_R", "_L") : s; }
const PERMS5 = (() => { const out = [], a = [0, 1, 2, 3, 4]; const rec = k => { if (k === 5) { out.push(a.slice()); return; } for (let i = k; i < 5; i++) { let x = a[k]; a[k] = a[i]; a[i] = x; rec(k + 1); x = a[k]; a[k] = a[i]; a[i] = x; } }; rec(0); return out; })();

// ===================== GAME SIMULATION =====================
function simulateGame(home, away, rosters, seed, opts) {
  opts = opts || {}; const REC = opts.frames !== false;
  const RULES = rulesFor(opts.season), FOUR = RULES.four;
  // per-game context from the league: the referee crew, tired legs, rivalry, grudges, revenge, chemistry, concussions
  const CTX = opts.ctx || {}, REF = Object.assign({ s: 0.5, w: 1, h: 0 }, CTX.ref || {}), FAT = CTX.fat || [0, 0];
  const rng = makeRng(seed);
  const DBG = opts.debug || null; // calibration counters only; never read by the simulation
  const dbg = (k, v) => { if (DBG) DBG[k] = (DBG[k] || 0) + (v === undefined ? 1 : v); };
  const TAC = [0, 1].map(t => Object.assign({}, DEF_TAC, (opts.tactics || [])[t] || {}));
  const all = [], team = [[], []];
  for (let t = 0; t < 2; t++) for (const p of rosters[t]) {
    const r = p.r, pf = profile(p, FOUR);
    const P = {
      p, t, idx: all.length, on: false, slot: -1, homeSlot: -1, starter: false,
      x: 47, y: 25, z: 0, vx: 0, vy: 0, vz: 0, air: false,
      tx: 47, ty: 25, urg: 0.5, st: "ok", stT: 0, lunge: null,
      energy: 1, fouls: 0, secs: 0,
      vmax: 15.5 + r.spd * 0.075 - Math.max(0, p.wt - 240) * 0.02,
      acc: 14 + r.acc * 0.16,
      reach: (p.ht * 1.33 + (p.wing - p.ht) * 0.6) / 12,
      vertFt: (20 + r.vert * 0.2 + C.FLOOR_VERT_IN * (0.6 + 0.8 * r.bnc / 99)) / 12,
      gather: false, gatherT: 0, action: null, target: null, decT: 0, driving: false, probe: null,
      cutT: 0, spot: "TOP", jit: { x: 0, y: 0 }, jitT: 0, swat: null, contestAt: -1,
      face: t === 0 ? 0 : PI, act: 0, actT: 0, airAct: null, celebT: 0, catchT: 0, reachT: 0, boxT: 0, crashT: 0,
      screen: null, pnr: null, post: null, screenedT: 0, curl: null, waitScreen: false, finishType: null,
      pf, arch: pf.arch, darch: pf.darch, comp: compliance(p, TAC[t]), job: "space", crash: false, use: 1,
      ctx: null, ctxT: -1e9, iso: null, leakT: 0, backT: 0, callT: 0, lob: null, alley: false, passLob: false, zone: 0,
      holdT: 0, fga: 0, fpa: 0, pnrT: -1e9, isoT: -1e9,
      setT: null, out: false, hurt: null, moveT: 0, move: null, techT: 0,
      // temperament (hidden ratings) and how he's feeling tonight
      clutch: p.clutch || 0, streak: p.streak !== undefined ? p.streak : 0.3, tough: p.tough !== undefined ? p.tough : 0.5, temper: p.temper !== undefined ? p.temper : (p.aggr || 0.5),
      heat: 0, heatTk: 0, mood: 0, moodTk: 0, fightRole: null, fightOut: false,
      chem: 1, conc: 0, rev: false
    };
    const gi = all.length;
    if (CTX.chem && CTX.chem[gi] !== undefined) P.chem = CTX.chem[gi];
    if (CTX.conc && CTX.conc[gi]) P.conc = CTX.conc[gi];
    if (CTX.rev && CTX.rev.includes(gi)) { P.rev = true; P.mood = 0.3; } // revenge game: he's up for this one
    P.energy = 1 - (FAT[t] || 0) * (1.25 - r.sta / 99 * 0.6);
    P.comp *= 0.8 + 0.2 * P.chem; // still learning the system
    all.push(P); team[t].push(P);
  }
  const G = {
    tick: 0, per: 1, clock: C.QLEN, shotClock: C.SC, shotRun: false, clockRun: false,
    score: [0, 0], off: 0, phase: "tip", phaseT: 0, lineup: [[], []], match: new Map(),
    events: [], tf: [0, 0], lastPass: null, lastShotTeam: -1, reboundable: false, periodEnding: false,
    tipWinner: 0, dead: null, ftS: null, rimProt: [null, null], lastHandler: null, inbound: false,
    looseT: 0, deflector: null, tipDone: false, possStart: 0, possLive: false,
    run: { team: -1, pts: 0 }, to: [3, 3], screenCD: [0, 0], offScreenCD: [0, 0], help: null,
    trans: [-1, -1], calls: { pnr: 0, iso: 0, post: 0 }, play: null, dbl: null, dblPoss: -1, fouler: null, desp: [false, false], hackOn: [null, null], putback: null, fumble: null,
    cov: null, lastCov: null, injWhistle: -1, ato: [false, false], hunt: -1, lastMM: [new Map(), new Map()],
    riv: CTX.riv || 0, grudge: new Map(), mark: [null, null], fight: null, fights: 0,
    adj: [{ at: {}, tried: new Set(), pts: 0, poss: 0 }, { at: {}, tried: new Set(), pts: 0, poss: 0 }], ts: [newTS(), newTS()], pp: new Array(all.length).fill(0), closers: [null, null], closeAt: [-1e9, -1e9], possN: 0, sitO: ""
  };
  for (const [a, b, w] of CTX.gr || []) if (all[a] && all[b]) G.grudge.set(a * 64 + b, w); // a holds it against b
  const PL = [null, null], DP = [null, null];
  const B = { x: 47, y: 25, z: 0, vx: 0, vy: 0, vz: 0, mode: "dead", holder: null, shot: null, pass: null, t: 0, lastTouch: -1 };
  function newTS() { return { pts: 0, poss: 0, a2: 0, m2: 0, a3: 0, m3: 0, a4: 0, m4: 0, forced: 0, broken: 0, hitFouls: 0, tackled: 0, tov: 0, covA: 0, covP: 0 }; }

  function ev(type, d) {
    const e = Object.assign({ tk: G.tick, per: G.per, clk: Math.round(G.clock * 10) / 10, s0: G.score[0], s1: G.score[1], type }, d || {});
    G.events.push(e); track(e); return e;
  }
  // running team numbers the coaches look at during the game
  function track(e) {
    switch (e.type) {
      case "fga": {
        const s = G.ts[e.team], k = e.val >= 4 ? 4 : e.val === 3 ? 3 : 2; s["a" + k]++; if (e.made) { s["m" + k]++; G.pp[e.pid] += e.val; }
        if (e.cov) { const d = G.ts[1 - e.team]; d.covA++; if (e.made) d.covP += e.val; }
        break;
      }
      case "ft": if (e.made) G.pp[e.pid]++; break;
      case "tackle": {
        const d = G.ts[e.team], o = G.ts[1 - e.team];
        if (e.result === "down" || e.result === "fumble") { d.forced++; o.tackled++; } else if (e.result === "broken") d.broken++; else if (e.result === "late" || e.result === "rough") d.hitFouls++;
        break;
      }
      case "to": G.ts[e.team].tov++; break;
    }
  }
  // ---- frames ----
  const FS = C.FS; let cap = 32000, F = new Float32Array(cap * FS), nf = 0;
  function rec() {
    if (nf >= cap) { cap *= 2; const N = new Float32Array(cap * FS); N.set(F); F = N; }
    let o = nf * FS;
    for (let t = 0; t < 2; t++) for (let s = 0; s < 5; s++) {
      const P = G.lineup[t][s];
      F[o++] = P.x; F[o++] = P.y; F[o++] = P.z; F[o++] = P.idx;
      let fl = 0; if (P.st === "down") fl |= 1; if (B.mode === "held" && B.holder === P) fl |= 2; if (P.st === "lunge") fl |= 4; if (P.gather) fl |= 8;
      F[o++] = fl; F[o++] = P.face; F[o++] = P.act; F[o++] = P.actT;
    }
    F[o++] = B.x; F[o++] = B.y; F[o++] = B.z; F[o++] = (B.mode === "held" && B.holder) ? B.holder.idx : -1; F[o++] = BALL_MODE[B.mode];
    F[o++] = G.clock; F[o++] = G.shotClock; F[o++] = G.per; F[o++] = G.score[0]; F[o++] = G.score[1]; F[o++] = G.off;
    F[o++] = G.phase === "live" ? 0 : G.phase === "dead" ? (G.dead && G.dead.to > 0 ? 4 : 1) : G.phase === "ft" ? 2 : G.phase === "tip" ? 3 : 5;
    nf++;
  }

  // ---- helpers ----
  const onC = () => G.lineup[0].concat(G.lineup[1]);
  function hoopOf(t) { const s = attSide(t, G.per); return { side: s, x: C.HX[s], y: C.HY, dir: dirOf(s) }; }
  function nearestOpp(P) {
    let best = null, bd = 1e9;
    for (const D of G.lineup[1 - P.t]) { if (D.st === "down") continue; const d = dist(P, D); if (d < bd) { bd = d; best = D; } }
    return [best, bd];
  }
  function canDunk(P) { return P.reach + P.vertFt >= 10.6; }
  function doJump(P, frac, kind) {
    if (P.air || P.st === "down") return;
    P.vz = Math.sqrt(2 * GRAV * P.vertFt * frac); P.air = true; P.z = 0.001; P.airAct = kind || "rebound";
  }
  function score(t, v) {
    G.score[t] += v; G.ts[t].pts += v;
    if (G.run.team === t) G.run.pts += v; else G.run = { team: t, pts: v };
  }
  function defenderOf(P) { for (const [D, M] of G.match) if (M === P) return D; return null; }
  function mean(a, f) { let s = 0; for (const x of a) s += f(x); return a.length ? s / a.length : 0; }
  function cnt(a, f) { let n = 0; for (const x of a) if (f(x)) n++; return n; }
  function best(a, f) { let b = null, bv = -1e18; for (const x of a) { const v = f(x); if (v > bv) { bv = v; b = x; } } return b; }
  // ---- the head game ----
  // the hot hand: makes warm a streaky shooter up, misses cool him, and it fades (half-life about four minutes)
  function heatNow(P) { return P.heat ? P.heat * dhalf((G.tick - P.heatTk) / 4800) : 0; }
  // rattled (below zero) or fired up (above): from big hits, cheap shots and revenge; fades over about five minutes
  function moodNow(P) { return P.mood ? P.mood * dhalf((G.tick - P.moodTk) / 6000) : 0; }
  function setMood(P, m) {
    const m0 = moodNow(P); P.mood = clamp(m, -1, 1); P.moodTk = G.tick;
    const ev1 = P.evTk || (P.evTk = [-1e9, -1e9, -1e9, -1e9]); // (news once in a while, not every time it flickers)
    if (m0 > -0.45 && P.mood <= -0.45 && G.tick - ev1[0] > 7200) { ev1[0] = G.tick; ev("mood", { pid: P.idx, team: P.t, lvl: -1 }); }
    else if (m0 < 0.45 && P.mood >= 0.45 && G.tick - ev1[1] > 7200) { ev1[1] = G.tick; ev("mood", { pid: P.idx, team: P.t, lvl: 1 }); }
  }
  // a big hit: the tough get angry, the soft get rattled
  function jolt(P, size) { if (P.out) return; const m = moodNow(P), t = P.tough; setMood(P, m + (t < 0.5 ? -size * (1 - t) * 1.15 : size * (t - 0.5) * 1.9)); }
  // crunch time: the last five minutes (or overtime) of a one- or two-possession game
  function clutchTime(t) { return G.per >= 4 && (G.per > 4 || G.clock <= 300) && Math.abs(G.score[t] - G.score[1 - t]) <= 6; }
  function grudgeW(A, Bp) { return G.grudge.size ? G.grudge.get(A.idx * 64 + Bp.idx) || 0 : 0; }
  // how his head is affecting his shot (all small: the hot hand is real, but subtle)
  function psyMult(P) {
    if (P.psyTk === G.tick) return P.psyV; // (asked many times a tick while players weigh their options)
    const m = moodNow(P);
    P.psyTk = G.tick; P.psyV = 1 + P.streak * 0.012 * heatNow(P) + (clutchTime(P.t) ? P.clutch * 0.035 : 0) + (m < 0 ? m * 0.03 : m * 0.006);
    return P.psyV;
  }
  function makeProb(P, val, d, cd, D) {
    const r = P.p.r; let p;
    if (d < 5) p = canDunk(P) ? 0.80 + r.ins * 0.0016 : 0.46 + r.ins * 0.0042;
    else if (val === 2 && d < 14) p = 0.37 + r.mid * 0.003 - (d - 5) * 0.007;
    else if (val === 2) p = 0.31 + r.mid * 0.0031 - (d - 14) * 0.004;
    else if (val === 3) p = 0.21 + r.thr * 0.0031 - Math.max(0, d - 24.5) * 0.012;
    else p = 0.125 + r.fr * 0.0028 - Math.max(0, d - 30.5) * 0.016;
    if (cd < 6) {
      const dr = D ? clamp((D.reach + D.vertFt * 0.7 - 9.5) / 3, 0.4, 1.3) : 1;
      p *= 1 - 0.42 * (1 - cd / 6) * dr * (d < 5 ? 0.8 : 1);
    } else if (cd > 9) p *= 1.05;
    p *= (0.86 + 0.14 * P.energy) * psyMult(P);
    return clamp(p, 0.02, 0.97);
  }
  function evalAt(P, x, y) {
    const h = hoopOf(P.t); const d = hyp(x - h.x, y - h.y); const val = shotValue(x, y, h.side, FOUR);
    let cd = 99, cD = null;
    for (const D of G.lineup[1 - P.t]) { if (D.st === "down") continue; const dd = hyp(D.x - x, D.y - y); if (dd < cd) { cd = dd; cD = D; } }
    const p = makeProb(P, val, d, cd, cD);
    return { p, val, ev: p * val, d, cd };
  }
  // a shot-blocker parked at the rim (legal swats on 2s) scares off finishes
  function rimGuard(P) {
    const h = hoopOf(P.t); let g = 0;
    for (const D of G.lineup[1 - P.t]) { if (D.st !== "ok") continue; const dh = hyp(D.x - h.x, D.y - h.y); if (dh < 8) g = Math.max(g, (1 - dh / 8) * (D.p.r.rim / 99) * (D.reach + D.vertFt > 11.5 ? 1.15 : 1)); }
    return g;
  }
  function laneBlock(H, h, excl) {
    const ax = h.x - H.x, ay = h.y - H.y, L2 = ax * ax + ay * ay || 1; let s = 0;
    for (const D of G.lineup[1 - H.t]) {
      if (D === excl || D.st === "down") continue;
      const tt = ((D.x - H.x) * ax + (D.y - H.y) * ay) / L2; if (tt < 0.1 || tt > 1.05) continue;
      const px = H.x + ax * tt, py = H.y + ay * tt, perp = hyp(D.x - px, D.y - py);
      if (perp < 3.5) s += 1 - perp / 3.5;
    }
    return s;
  }
  function laneRisk(H, M) {
    const ax = M.x - H.x, ay = M.y - H.y, L2 = ax * ax + ay * ay || 1; let s = 0;
    for (const D of G.lineup[1 - H.t]) {
      if (D.st === "down") continue;
      const tt = ((D.x - H.x) * ax + (D.y - H.y) * ay) / L2; if (tt < 0.05 || tt > 1.0) continue;
      const px = H.x + ax * tt, py = H.y + ay * tt, perp = hyp(D.x - px, D.y - py);
      if (perp < 3.8) s += (1 - perp / 3.8) * (0.6 + D.p.r.perD / 250);
    }
    return (s + Math.sqrt(L2) * 0.004) * (1 + (1 - Math.min(H.chem, M.chem)) * 0.5); // new teammates don't read each other yet
  }
  function spotXY(P, t) {
    const h = hoopOf(t); const s = SPOTS[P.spot] || SPOTS.TOP;
    return { x: h.x + h.dir * s[0], y: h.y + s[1] };
  }
  // shot appetite for a class of shot: the plan's, blended with the player's own taste by how coachable he is
  function shotW(P, cls) {
    const pl = PL[P.t]; let pw = SYSTEMS[pl.sys].w[cls];
    if (cls === 3) pw *= 1 + (TAC[P.t].four - 1) * 0.5;
    return (pw * P.comp + ARCH[P.arch].w[cls] * (1 - P.comp)) * LEAGUE_W[cls];
  }
  function call(kind, P, M) { P.callT = 0.7; ev("call", { team: P.t, kind, pid: P.idx, w: M ? M.idx : -1 }); }

  // ===================== GAMEPLANS =====================
  const byOvr = (a, b) => b.p.ovr - a.p.ovr || a.idx - b.idx;
  function rot(t) { return team[t].slice().sort(byOvr).slice(0, clamp(TAC[t].depth, 8, 10)); }
  function offenseFits(t) {
    const R = rot(t), O = rot(1 - t), ot = TAC[1 - t];
    const byCre = R.slice().sort((a, b) => (b.pf.cre + b.pf.hand * 0.3) - (a.pf.cre + a.pf.hand * 0.3) || a.idx - b.idx);
    const star = byCre[0], second = byCre[1];
    const sh3 = cnt(R, P => P.p.r.thr >= 60), sh4 = FOUR ? cnt(R, P => P.p.r.fr >= 62) : 0;
    const oppTck = mean(O, P => P.p.r.tck), oppRim = best(O.slice(0, 6), P => P.pf.rimD).pf.rimD;
    return {
      motion: (mean(R, P => P.p.r.pas) + mean(R, P => P.p.r.iq)) / 200 * 0.8 + sh3 / R.length * 0.35 + (ot.tackle - 1) * 0.5 + (ot.hit === "blitz" ? 0.1 : 0) + 0.06,
      helio: (star.pf.cre + star.pf.hand * 0.3) / 100 * 0.95 - (second.pf.cre + second.pf.hand * 0.3) / 100 * 0.6 + (star.p.r.sec + star.p.r.brk) / 200 * 0.25 + 0.2,
      power: cnt(R, P => P.arch === "DOZ" || P.arch === "PST") / R.length * 0.9 + mean(R, P => P.pf.carry) / 100 * 0.45 - (oppTck - 50) / 100 * 0.5 + (oppRim < 62 ? 0.1 : 0) + 0.18,
      four: FOUR ? sh4 / R.length * 1.6 + (oppRim >= 70 ? 0.12 : 0) + 0.12 : -9,
      bounce: mean(R, P => P.p.r.vert + P.p.r.bnc) / 200 * 0.55 + cnt(R, P => P.arch === "RUN" || P.arch === "SLA") / R.length * 0.7 + (mean(R, P => P.p.r.spd) - mean(O, P => P.p.r.spd)) / 100 * 0.8 + 0.1
    };
  }
  function defenseFits(t, os) {
    const R = rot(t), O = rot(1 - t).slice(0, 8);
    const g = best(R, P => P.pf.rimD);
    const nonSh = cnt(O, P => P.p.r.thr < 48 && (!FOUR || P.p.r.fr < 45));
    const opp4 = FOUR ? cnt(O, P => P.p.r.fr >= 62) : 0, opp3 = cnt(O, P => P.p.r.thr >= 60);
    const R8 = R.slice(0, 8), mh = mean(R8, P => P.p.ht), htSd = Math.sqrt(mean(R8, P => (P.p.ht - mh) * (P.p.ht - mh)));
    const perD = mean(R, P => P.pf.perD);
    return {
      fit: {
        man: 0.5 + (perD - 50) / 100 * 0.4,
        switch: 0.5 - htSd / 10 * 0.5 + (perD - 50) / 100 * 0.5 + (os === "helio" ? 0.15 : os === "motion" ? -0.05 : 0),
        goalie: (g.pf.rimD - 64) / 28 + (nonSh >= 2 ? 0.25 : nonSh === 1 ? 0.08 : -0.4) + (os === "power" || os === "bounce" ? 0.15 : os === "four" ? -0.3 : 0) + 0.22,
        extend: FOUR ? opp4 / 8 * 1.3 + (mean(R, P => P.p.r.spd) - 50) / 100 * 0.4 + (os === "four" ? 0.22 : 0) + 0.08 : opp3 / 8 * 0.5 - 0.1,
        zone: 0.4 - (perD - 50) / 100 * 0.6 + nonSh / 8 * 0.35 - (opp3 + opp4) / 8 * 0.3 + (os === "motion" ? -0.1 : os === "power" ? 0.1 : 0)
      }, goalie: g
    };
  }
  function hitFits(t, os) {
    const R = rot(t), O = rot(1 - t);
    const oppSec = mean(O.slice(0, 6), P => (P.p.r.sec + P.p.r.brk) / 2), tck = mean(R, P => P.p.r.tck);
    return {
      blitz: (tck - 50) / 100 * 1.3 + cnt(R, P => P.darch === "HIT") / R.length * 0.6 - (oppSec - 50) / 100 * 0.8 + (os === "motion" ? -0.15 : os === "power" ? -0.1 : os === "helio" ? 0.08 : 0) + 0.42,
      contain: 0.5,
      disciplined: -(tck - 50) / 100 * 1.1 + (oppSec - 50) / 100 * 0.6 + (os === "power" ? 0.12 : 0) + cnt(O, P => P.arch === "DOZ") / O.length * 0.4 + 0.36
    };
  }
  function covFits(t, os) {
    const R = rot(t), O = rot(1 - t), dp = DP[t];
    const bigs = R.filter(P => P.p.role === "BIG" || P.p.role === "BRUISER"), B5 = bigs.length ? bigs : R;
    const bigSpd = mean(B5, P => P.p.r.spd), bigRim = best(B5, P => P.pf.rimD).pf.rimD, tck = mean(R, P => P.p.r.tck), perD = mean(R, P => P.pf.perD);
    const H3 = O.slice().sort((a, b) => b.pf.hand - a.pf.hand || a.idx - b.idx).slice(0, 3);
    const oSec = mean(H3, P => (P.p.r.sec + P.p.r.brk) / 2), oMid = mean(H3, P => P.p.r.mid), oPas = mean(H3, P => P.p.r.pas);
    const oPop = cnt(O.slice(0, 8), P => (P.p.role === "BIG" || P.p.role === "BRUISER") && P.pf.shoot >= 60);
    const R8 = R.slice(0, 8), mh = mean(R8, P => P.p.ht), htSd = Math.sqrt(mean(R8, P => (P.p.ht - mh) * (P.p.ht - mh)));
    return {
      drop: (bigRim - 60) / 40 + (55 - bigSpd) / 80 + (55 - oMid) / 80 - oPop * 0.1 + (dp.scheme === "goalie" ? 0.2 : 0) - 0.26,
      hedge: (bigSpd - 50) / 60 + (oPas < 55 ? 0.05 : -0.05) + 0.58,
      switch: (dp.scheme === "switch" ? 0.6 : 0) + 0.32 - htSd / 10 * 0.4 + (perD - 50) / 100 * 0.4 + (os === "helio" ? 0.1 : 0) + 0.12,
      ice: 0.36 + (perD - 50) / 100 * 0.5,
      trap: (tck - 50) / 60 + (52 - oSec) / 40 + (dp.hit === "blitz" ? 0.2 : dp.hit === "disciplined" ? -0.3 : 0) - (oPas - 55) / 100 * 0.6 + 0.38
    };
  }
  // what happens on a ball screen against this defense
  function coverage(dt) { const dp = DP[dt]; return dp.scheme === "zone" ? null : dp.scheme === "switch" ? "switch" : dp.cov; }
  // stubborn coaches run their system; adaptable ones fit it to the roster and the opponent
  function pickBest(fit, pref, adapt) {
    let bk = null, bs = -1e9;
    for (const k in fit) { if (fit[k] < -5) continue; const s = fit[k] * (0.35 + 0.9 * adapt) + (k === pref ? 0.22 + 0.3 * (1 - adapt) : 0) + rng.normal(0, 0.035); if (s > bs) { bs = s; bk = k; } }
    return bk;
  }
  function sysBonus(P, sys) { return SYSB[sys][P.arch] || 0; }
  function lineupValue(t, five) {
    const pl = PL[t], dp = DP[t]; let v = 0, hand = 0, rim = 0, sh = 0, reb1 = 0, reb2 = 0, roles = 0, mask = 0;
    for (const P of five) {
      v += P.p.ovr + sysBonus(P, pl.sys) + (P.fouls >= 5 ? -6 : 0);
      if (P.pf.hand > hand) hand = P.pf.hand;
      if (P.pf.rimD > rim) rim = P.pf.rimD;
      if (P.pf.shoot >= 60) sh++;
      const rb = P.pf.reb; if (rb > reb1) { reb2 = reb1; reb1 = rb; } else if (rb > reb2) reb2 = rb;
      const bit = ROLE_BIT[P.p.role]; if (!(mask & bit)) { mask |= bit; roles++; }
      if (dp.scheme === "goalie" && P === dp.goalieP) v += 5;
    }
    v += Math.min(0, hand - 60) * 0.9;
    v += (rim - 58) * (dp.scheme === "goalie" ? 0.35 : 0.2);
    v += (reb1 + reb2 - 120) * 0.08;
    v += sh * (pl.sys === "four" ? 3 : pl.sys === "helio" ? 2.2 : pl.sys === "power" ? 0.8 : 1.6) - (sh <= 1 ? 4 : 0);
    v += roles * 2.5 * (1 - TAC[t].adapt);
    return v;
  }
  function bestFive(t, pool) {
    pool = pool.filter(P => !P.out);
    const n = pool.length; if (n <= 5) return pool.slice();
    let bv = -1e18, bf = null; const f = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      f[0] = pool[a]; f[1] = pool[b]; f[2] = pool[c]; f[3] = pool[d]; f[4] = pool[e];
      const v = lineupValue(t, f); if (v > bv + 1e-9) { bv = v; bf = f.slice(); }
    }
    return bf;
  }
  function buildPlans() {
    const fits = [offenseFits(0), offenseFits(1)];
    for (let t = 0; t < 2; t++) {
      const tac = TAC[t], sys = tac.forceSys || pickBest(fits[t], tac.sys, tac.adapt), S = SYSTEMS[sys];
      PL[t] = { sys, fit: fits[t], pace: clamp(tac.pace + S.pace, -1, 1), crash: 1, leak: !!S.leak || tac.pace > 0.6, star: null, rot: null, order: null };
    }
    for (let t = 0; t < 2; t++) {
      const tac = TAC[t], os = PL[1 - t].sys, df = defenseFits(t, os), hf = hitFits(t, os);
      const scheme = tac.forceScheme || pickBest(df.fit, tac.scheme, tac.adapt), hit = tac.forceHit || pickBest(hf, tac.hit, tac.adapt);
      DP[t] = { scheme, hit, goalieP: scheme === "goalie" ? df.goalie : null, dblTarget: -1, dblRate: 0, hitman: null, stopper: null, cov: "hedge", cfit: null, scout: null };
      const cf = covFits(t, os), cpref = tac.cov || (scheme === "switch" ? "switch" : scheme === "goalie" || scheme === "zone" ? "drop" : hit === "blitz" ? "trap" : "hedge");
      DP[t].cfit = cf; DP[t].cov = tac.forceCov || pickBest(cf, cpref, tac.adapt);
    }
    for (let t = 0; t < 2; t++) {
      const pl = PL[t], tac = TAC[t], R = rot(t), avg = mean(R, P => P.pf.off);
      const k = 1 + tac.star * 2 + (pl.sys === "helio" ? 1.6 : 0);
      for (const P of team[t]) P.use = clamp((1 + (P.pf.off / avg - 1) * k) * (P.rev ? 1.15 : 1), 0.35, 2.6); // a revenge game: he wants it
      pl.crash = clamp(Math.round(SYSTEMS[pl.sys].crash - pl.pace * 1.2 + (mean(R, P => P.pf.reb) > 58 ? 0.5 : 0)), 0, 3);
      pl.order = team[t].slice().sort((a, b) => (b.p.ovr + sysBonus(b, pl.sys)) - (a.p.ovr + sysBonus(a, pl.sys)) || a.idx - b.idx);
      pl.rot = new Set(pl.order.slice(0, tac.depth));
      pl.star = best(pl.order.slice(0, 8), P => P.pf.off * P.use);
    }
    for (let t = 0; t < 2; t++) {
      const dp = DP[t], o = 1 - t, tac = TAC[t], opp = PL[o].order.slice(0, 8);
      const s1 = PL[o].star, s2 = best(opp.filter(P => P !== s1), P => P.pf.off * P.use);
      const gap = s1.pf.off - s2.pf.off;
      if (gap > 9 * (1.25 - tac.adapt * 0.5) || (PL[o].sys === "helio" && gap > 6 && s1.pf.off > 66)) { dp.dblTarget = s1.idx; dp.dblRate = clamp(0.08 + gap * 0.012 + tac.adapt * 0.06, 0.08, 0.32); }
      dp.hitman = best(PL[t].order.slice(0, 9), P => P.pf.hit);
      dp.stopper = best(PL[t].order.slice(0, 8), P => P.pf.perD);
      // the scouting report: who to hit, who to go under on, who never gets an open look
      const q = 0.25 + 0.75 * tac.adapt, ro = PL[o].order.slice(0, 9), sc = { hit: new Set(), under: new Set(), lock: new Set() };
      const careless = ro.filter(P => P.pf.hand > 52 && (P.p.r.sec + P.p.r.brk) / 2 < 50).sort((a, b) => (a.p.r.sec + a.p.r.brk) - (b.p.r.sec + b.p.r.brk) || a.idx - b.idx);
      for (const P of careless.slice(0, 2)) if (rng.chance(q)) sc.hit.add(P.idx);
      for (const P of ro) if (Math.max(P.p.r.thr, FOUR ? P.p.r.fr : 0) < 48 && P.pf.cre > 48 && rng.chance(q)) sc.under.add(P.idx);
      for (const P of ro.filter(P => P.pf.shoot >= 66).sort((a, b) => b.pf.shoot - a.pf.shoot || a.idx - b.idx).slice(0, 2)) if (rng.chance(q)) sc.lock.add(P.idx);
      dp.scout = sc;
    }
    // the coach's starting five for this plan; best jumper in slot 4 for the tip
    for (let t = 0; t < 2; t++) {
      const five = bestFive(t, PL[t].order.slice(0, 9));
      five.sort((a, b) => (a.reach + a.vertFt) - (b.reach + b.vertFt) || a.idx - b.idx);
      for (let s = 0; s < 5; s++) { const P = five[s]; P.on = true; P.slot = s; P.homeSlot = s; P.starter = true; G.lineup[t][s] = P; }
      assignJobs(t); setZones(t);
    }
    for (let t = 0; t < 2; t++) {
      const pl = PL[t], dp = DP[t];
      ev("plan", { team: t, off: pl.sys, def: dp.scheme, hit: dp.hit, pace: Math.round(pl.pace * 100) / 100, star: pl.star.idx, dbl: dp.dblTarget,
        goalie: dp.goalieP ? dp.goalieP.idx : -1, hitman: dp.hitman ? dp.hitman.idx : -1, stopper: dp.stopper ? dp.stopper.idx : -1,
        crash: pl.crash, leak: pl.leak, rot: pl.order.slice(0, TAC[t].depth).map(P => P.idx), jobs: G.lineup[t].map(P => [P.idx, P.job]),
        cov: dp.cov, cfit: Object.fromEntries(Object.entries(dp.cfit).map(([k, v]) => [k, Math.round(v * 100) / 100])), scout: { hit: [...dp.scout.hit], under: [...dp.scout.under], lock: [...dp.scout.lock] } });
    }
  }
  // jobs for whoever is on the floor (redone after every substitution or change of plan)
  function assignJobs(t) {
    const L = G.lineup[t], pl = PL[t], sys = pl.sys;
    for (const P of L) { P.job = "space"; P.crash = false; }
    const c1 = best(L, P => (P.pf.cre * 0.7 + P.pf.hand * 0.5) * P.use); c1.job = "c1";
    const rest = L.filter(P => P !== c1), free = () => rest.filter(P => P.job === "space");
    if (sys === "power" || sys === "motion") { const pp = best(free(), P => P.pf.post + P.pf.carry * 0.3); if (pp && (sys === "power" || pp.pf.post > 62)) pp.job = "post"; }
    { const rr = best(free(), P => P.pf.lob); if (rr && rr.pf.lob > (sys === "bounce" ? 52 : 60) && canDunk(rr)) rr.job = "run"; }
    { const c2 = best(free(), P => P.pf.cre * P.use); if (c2 && c2.pf.cre > 58 && sys !== "power") c2.job = "c2"; }
    if (FOUR) for (const P of free()) if (P.p.r.fr >= 60) P.job = "snipe";
    const reb = rest.slice().sort((a, b) => b.pf.reb - a.pf.reb || a.idx - b.idx);
    for (let i = 0; i < Math.min(pl.crash, reb.length); i++) reb[i].crash = true;
  }
  function spotPrefs(P, sys) {
    const j = P.job, a = P.arch, four4 = FOUR && P.p.r.fr >= 60;
    if (j === "c1") return sys === "four" && four4 ? ["FOUR_TOP", "TOP"] : ["TOP", "WING_L", "WING_R"];
    if (j === "post") return ["POST_L", "POST_R", "ELBOW_L", "ELBOW_R"];
    if (j === "run") return ["DUNK_L", "DUNK_R", "POST_L"];
    if (FOUR && P.p.r.fr >= (sys === "four" ? 62 : 66) && (sys === "four" || j === "snipe" || a === "FSN" || a === "STR")) return ["FOUR_L", "FOUR_R", "FOUR_TOP", "WING_L", "WING_R"];
    if (P.p.role === "BIG" || a === "PST" || (a === "DOZ" && P.p.role !== "PG")) return sys === "power" ? ["ELBOW_L", "ELBOW_R", "POST_R"] : ["ELBOW_R", "ELBOW_L", "DUNK_R", "DUNK_L"];
    if (a === "SPT" || a === "MRK" || P.p.r.thr >= 58) return sys === "helio" ? ["CORNER_L", "CORNER_R", "WING_L", "WING_R"] : ["WING_L", "WING_R", "CORNER_L", "CORNER_R"];
    if (a === "SLA" || a === "RUN") return ["CORNER_L", "CORNER_R", "WING_L", "DUNK_L"];
    return ["WING_L", "WING_R", "CORNER_L", "CORNER_R"];
  }
  function assignSpots(t) {
    const used = new Set(), mirror = rng.chance(0.5);
    const L = G.lineup[t].slice().sort((a, b) => JOB_ORDER[a.job] - JOB_ORDER[b.job] || a.slot - b.slot);
    for (const P of L) {
      let prefs = spotPrefs(P, PL[t].sys); if (mirror) prefs = prefs.map(mirrorSpot);
      P.spot = prefs.find(s => !used.has(s)) || SPOT_ALL.find(s => !used.has(s)); used.add(P.spot); P.cutT = 0;
    }
  }
  // zone spots: biggest in the middle, next two on the low blocks, the smallest two up top
  function setZones(t) {
    const L = G.lineup[t].slice().sort((a, b) => (b.p.ht + b.p.r.rim * 0.1) - (a.p.ht + a.p.r.rim * 0.1) || a.idx - b.idx);
    const z = [4, 2, 3, 0, 1]; L.forEach((P, i) => P.zone = z[i]);
  }
  // matchups: who guards whom, from what the coach knows (threats, size, speed, his stopper, the goalie's hiding spot)
  function matchCost(D, O, dp, adapt, dt) {
    const thr = O.pf.off * O.use;
    const perim = (O.pf.shoot >= 58 || O.pf.cre >= 60) ? 1 : 0.35;
    const skill = perim * D.pf.perD + (1 - perim) * (D.pf.rimD * 0.5 + D.p.r.str * 0.5);
    let c = thr * (110 - skill + Math.abs(D.p.ht - O.p.ht) * 1.2 + Math.max(0, O.p.r.spd - D.p.r.spd) * 0.2 * perim) / 100;
    if (D.p.role !== O.p.role) c += (1 - adapt) * 6;
    if (dp.scheme === "goalie" && D === dp.goalieP) c += Math.max(0, O.pf.shoot - 42) * 0.6 + thr * 0.1;
    if (dp.stopper === D && O === PL[1 - dt].star) c -= 2 + 4 * adapt;
    return c;
  }
  function assignMatches() {
    const off = G.off, def = 1 - off, D5 = G.lineup[def], O5 = G.lineup[off], dp = DP[def], adapt = TAC[def].adapt;
    G.match.clear();
    if (dp.scheme === "zone") { zoneMatch(); }
    else {
      const cm = new Array(25);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) cm[i * 5 + j] = matchCost(D5[i], O5[j], dp, adapt, def);
      let bk = 0, bv = 1e18;
      for (let k = 0; k < 120; k++) { const pm = PERMS5[k]; const s = cm[pm[0]] + cm[5 + pm[1]] + cm[10 + pm[2]] + cm[15 + pm[3]] + cm[20 + pm[4]]; if (s < bv - 1e-9) { bv = s; bk = k; } }
      const pm = PERMS5[bk]; for (let i = 0; i < 5; i++) G.match.set(D5[i], O5[pm[i]]);
    }
    G.rimProt[def] = dp.scheme === "goalie" && dp.goalieP && dp.goalieP.on ? dp.goalieP : best(D5, D => D.pf.rimD);
  }
  // zone: each defender takes whoever is in his area (greedy on distance to his zone spot)
  function zoneMatch() {
    const def = 1 - G.off, D5 = G.lineup[def], O5 = G.lineup[G.off], h = hoopOf(G.off), pairs = [];
    for (const D of D5) { const z = ZONE[D.zone], zx = h.x + h.dir * z[0], zy = h.y + z[1]; for (const O of O5) pairs.push([hyp(O.x - zx, O.y - zy), D, O]); }
    pairs.sort((a, b) => a[0] - b[0] || a[1].idx - b[1].idx || a[2].idx - b[2].idx);
    G.match.clear(); const usedD = new Set(), usedO = new Set();
    for (const [, D, O] of pairs) { if (usedD.has(D) || usedO.has(O)) continue; G.match.set(D, O); usedD.add(D); usedO.add(O); }
  }

  // ===================== SITUATIONS (clock and score) =====================
  function situation(t) {
    const m = G.score[t] - G.score[1 - t], q4 = G.per >= 4, clk = G.clock, late = TAC[t].late;
    if (q4 && clk < 24 && FOUR && (m === -4 || (m === -3 && late > 0.45 && clk < 10) || (m <= -5 && m >= -8 && clk < 30))) return "need4";
    if (q4 && clk < 24 && (m === -3 || (!FOUR && m <= -3 && m >= -6))) return "need3";
    if (clk > 0 && clk <= G.shotClock + 0.5 && G.clockRun) { if (!q4 && late > 0.3) return "hold"; if (q4 && m >= 0) return "hold"; }
    if (!q4 && clk > 28 && clk < 40 && late > 0.4) return "twofor1";
    if (q4 && clk < 150 && m > 0) return "milk";
    if (q4 && clk < 150 && m <= -7) return "hurry";
    return "";
  }
  function sitShot(sit, val) {
    if (sit === "need4") return val === 4 ? 1.0 : G.clock < 1.5 ? 0 : -0.7;
    if (sit === "need3") return val >= 3 ? 0.7 : G.clock < 1.5 ? 0 : -0.5;
    if (sit === "twofor1" || sit === "hurry") return 0.06;
    return 0;
  }
  // how the defense wants to play the next few seconds: desperation hits, intentional fouls, hack-a-big
  function defenseIntent() {
    const dt = 1 - G.off, ot = G.off, m = G.score[ot] - G.score[dt];
    G.desp[dt] = G.per >= 4 && G.clock < 45 && G.clock > 0 && m > 0 && m <= (FOUR ? 14 : 10) && TAC[dt].late > 0.15;
    G.desp[ot] = false;
    const H = B.mode === "held" ? B.holder : null;
    if (G.fouler || !H || G.inbound || G.phase !== "live" || H.t !== ot) return;
    // trailing late and the offense controls the clock: foul to stop it
    if (G.desp[dt] && m >= 2 && G.clock < 14 + TAC[dt].late * 12 && G.clock < G.shotClock + 1) {
      const D = best(G.lineup[dt].filter(Q => Q.st === "ok" && Q.fouls < 5), Q => -dist(Q, H));
      if (D) { G.fouler = { D, on: H, kind: "intentional" }; call("foul", D, H); }
      return;
    }
    // hack-a-big: send a terrible free throw shooter to the line when we're already in the bonus
    if (G.tf[dt] >= 5 && TAC[dt].late >= 0.5 && G.per >= 2 && Math.abs(m) <= 12 && !(G.per >= 4 && G.clock < 120 && m < 0) && (G.tick % 20) === 0) {
      const T = best(G.lineup[ot].filter(Q => Q !== H && ftProb(Q.p.r) < 0.56), Q => -ftProb(Q.p.r));
      if (T && rng.chance(0.12)) {
        const D = best(G.lineup[dt].filter(Q => Q.st === "ok" && Q.fouls < 4), Q => -dist(Q, T));
        if (D) { G.fouler = { D, on: T, kind: "hack" }; G.hackOn[ot] = T; call("hack", D, T); }
      }
    }
  }

  function newPossession(t) {
    if (DBG) { dbg("poss"); dbg("possTicks", G.tick - G.possStart); }
    G.off = t; G.shotClock = C.SC; G.shotRun = true; G.lastPass = null; G.possStart = G.tick; G.possN++;
    G.ts[t].poss++; G.dbl = null; G.fouler = null; G.sitO = ""; G.calls.pnr = 0; G.calls.iso = 0; G.calls.post = 0; G.play = null;
    for (const P of G.lineup[t]) { P.iso = null; P.ctx = null; }
    for (const P of onC()) { P.crashT = 0; P.backT = 0; P.leakT = 0; P.boxT = 0; }
    assignSpots(t); assignMatches();
  }
  function gain(P) {
    B.mode = "held"; B.holder = P; B.lastTouch = P.t; B.pass = null; B.shot = null; G.looseT = 0;
    if (P.t !== G.off) { newPossession(P.t); G.possLive = true; }
    P.decT = 0.25; P.gather = false; P.driving = false; P.probe = null; G.lastHandler = P; P.holdT = 0;
  }
  // push in transition after a live-ball change of possession?
  function maybePush(t, bonus) {
    const pl = PL[t], ahead = cnt(G.lineup[t], P => P.leakT > 0);
    if (rng.chance(clamp(0.15 + pl.pace * 0.35 + (bonus || 0) + ahead * 0.25, 0.03, 0.9))) G.trans[t] = G.tick + 90; else G.trans[t] = -1;
  }

  // ---- substitutions ----
  function foulLimit() { if (G.per >= 5) return 6; if (G.per === 4) return G.clock < 360 ? 6 : 5; return G.per + 1; }
  function important(P) { return P.use >= 1.1 || P.starter; }
  function closers(t) {
    if (G.tick - G.closeAt[t] > 600 || !G.closers[t] || [...G.closers[t]].some(Q => Q.fouls >= 6 || Q.out)) {
      const pool = PL[t].order.filter(Q => Q.fouls < 6 && !Q.out && G.hackOn[t] !== Q).slice(0, 9);
      G.closers[t] = new Set(bestFive(t, pool)); G.closeAt[t] = G.tick;
    }
    return G.closers[t];
  }
  function doSubs(t, except, onlyForced) {
    const L = G.lineup[t], pl = PL[t], tac = TAC[t]; let swapped = false;
    const close = G.per >= 4 && G.clock < 300 && Math.abs(G.score[0] - G.score[1]) < 10;
    const outAt = close ? 0.4 : 0.58 + (tac.depth - 9) * 0.025;
    const fl = foulLimit() + (tac.late < 0.3 ? 1 : 0), want = close ? closers(t) : null;
    const benchOK = Q => !Q.on && Q.fouls < 6 && !Q.out && G.hackOn[t] !== Q && !(Q.fouls >= fl && important(Q) && !close);
    for (let s = 0; s < 5; s++) {
      const P = L[s]; if (P === except) continue;
      const forced = P.fouls >= 6 || (P.out && !(P.hurt && P.st === "down")); // an injured man lies there until the trainers get to him
      if (onlyForced && !forced) continue;
      const hacked = G.hackOn[t] === P && TAC[t].late > 0.25;
      const trouble = !close && P.fouls >= fl && important(P);
      const tired = P.energy < outAt;
      const notCloser = want && !want.has(P);
      let bench = team[t].filter(Q => benchOK(Q) && (pl.rot.has(Q) || forced || hacked || (want && want.has(Q))));
      if (!bench.length) { if (forced) bench = team[t].filter(Q => !Q.on && Q.fouls < 6 && !Q.out); if (!bench.length) continue; }
      let cand = null;
      if (forced || hacked || trouble || tired || notCloser) {
        let bs = -1e9;
        for (const Q of bench) {
          if (!forced && !hacked && !notCloser && Q.energy < 0.8) continue;
          if (notCloser && !forced && !tired && !(want.has(Q) && Q.energy > 0.5)) continue;
          const sc = Q.p.ovr + sysBonus(Q, pl.sys) + (Q.job === P.job ? 6 : 0) + (Q.p.role === P.p.role ? 6 : 0) + Q.energy * 10 + (want && want.has(Q) ? 30 : 0);
          if (sc > bs) { bs = sc; cand = Q; }
        }
      } else if (!P.starter && !close) {
        cand = bench.find(Q => Q.starter && Q.homeSlot === s && Q.energy > 0.88 && Q.fouls < fl) || null;
      }
      if (cand) {
        cand.on = true; cand.slot = s; cand.x = P.x; cand.y = P.y; cand.vx = cand.vy = 0; cand.z = 0; cand.air = false;
        cand.st = "ok"; cand.gather = false; cand.driving = false; cand.spot = P.spot; cand.swat = null; cand.contestAt = -1;
        cand.face = P.face; cand.screen = null; cand.pnr = null; cand.post = null; cand.curl = null; cand.waitScreen = false; cand.iso = null; P.screen = null;
        cand.leakT = 0; cand.backT = 0; cand.lob = null; P.leakT = 0; P.backT = 0;
        P.on = false; P.slot = -1; P.gather = false; L[s] = cand; swapped = true;
        cand.setT = null; P.setT = null;
        ev("sub", { team: t, inn: cand.idx, out: P.idx, why: P.out ? (P.hurt ? "injury" : "ejected") : forced ? "fouled out" : hacked ? "hack" : trouble ? "fouls" : notCloser ? "closer" : tired ? "rest" : "" });
      }
    }
    if (swapped) { assignJobs(t); setZones(t); assignMatches(); }
  }

  // ---- dead balls / inbounds ----
  function sidelineSpot(x, y) { return { x: clamp(x, 8, 86), y: y < 25 ? -1.2 : C.W + 1.2 }; }
  function baselineSpot(t) { // team t inbounds from the baseline under the hoop it defends
    const s = 1 - attSide(t, G.per); return { x: s === 0 ? -1.2 : C.L + 1.2, y: 21 };
  }
  function deadInbound(t, spot, o) {
    o = o || {};
    G.phase = "dead"; G.clockRun = !!o.keepClock; G.shotRun = false; G.inbound = false; G.fouler = null; G.dbl = null; G.trans = [-1, -1]; G.injWhistle = -1; G.cov = null;
    B.holder = null; if (B.mode !== "dead") { B.mode = "dead"; }
    const change = t !== G.off;
    // timeouts: stop a run, or set up a late possession
    let toT = 0;
    if (o.kind === "make" || o.kind === "foul" || o.kind === "oob" || o.kind === "tackle") {
      const opp = 1 - t;
      if (G.run.team === opp && G.run.pts >= 8 && G.to[t] > 0 && rng.chance(0.55 + TAC[t].late * 0.3)) toT = 7;
      else if (G.per >= 4 && G.clock > 0 && G.clock < 40 && G.to[t] > 0 && G.score[opp] > G.score[t] && G.score[opp] - G.score[t] <= (FOUR ? 8 : 6) && rng.chance(0.3 + TAC[t].late * 0.5)) toT = 6;
      if (toT) {
        G.to[t]--; G.run.pts = 0; G.clockRun = false; ev("timeout", { team: t }); G.ato[t] = true; // he'll draw one up
        for (const P of onC()) P.energy = Math.min(1, P.energy + 0.05);
        coachAdjust(t, "timeout");
      }
    }
    for (const P of onC()) { P.screen = null; P.pnr = null; P.post = null; P.curl = null; P.waitScreen = false; P.boxT = 0; P.crashT = 0; P.iso = null; P.leakT = 0; P.backT = 0; P.lob = null; P.setT = null; }
    if (G.play && !G.play.done) endSet();
    if (!o.noSubs) { doSubs(0); doSubs(1); }
    if (change) newPossession(t); else { G.off = t; assignMatches(); if (o.keepShot) G.shotClock = Math.max(G.shotClock, o.keepShot); else G.shotClock = C.SC; }
    if (o.resetShot) G.shotClock = C.SC;
    const cands = G.lineup[t].filter(P => P.st !== "down" && !P.out);
    // late with the lead: get it to the best free-throw shooter who can handle it
    const protect = G.per >= 4 && G.clock < 60 && G.score[t] > G.score[1 - t] && TAC[t].late > 0.3;
    const recv = G.lineup[t].filter(P => !P.out).sort((a, b) => protect ? (b.p.r.ft * 0.6 + b.p.r.sec * 0.4) - (a.p.r.ft * 0.6 + a.p.r.sec * 0.4) : (b.p.r.pas + b.p.r.sec) - (a.p.r.pas + a.p.r.sec))[0] || G.lineup[t][0];
    let inb = null, bd = 1e9;
    for (const P of (cands.some(P => P !== recv) ? cands : G.lineup[t])) { if (P === recv) continue; const d = hyp(P.x - spot.x, P.y - spot.y); if (d < bd) { bd = d; inb = P; } }
    if (!inb) inb = recv; // (a broken gang tackle can leave everyone else on the floor: he waits for them)
    // under the basket he attacks: run a baseline out-of-bounds play
    const as = attSide(t, G.per), blob = (spot.x < 0 && as === 0) || (spot.x > C.L && as === 1);
    G.dead = { t, spot, timer: (o.wait || 1.4) + toT, inb, recv: blob ? null : recv, kind: o.kind || "", to: toT, blob: blob ? blobRoles(t, inb, spot) : null };
  }
  function blobRoles(t, inb, spot) {
    const L = G.lineup[t].filter(P => P !== inb && P.st !== "down" && !P.out);
    const s = best(L, P => P.pf.shoot), x = best(L.filter(P => P !== s), P => P.pf.scr + P.pf.lob * 0.5), c = best(L.filter(P => P !== s && P !== x), P => P.pf.hand);
    return { s, x, c, sd: spot.y > 25 ? 1 : -1, hit: false };
  }
  function deadStep() {
    const D = G.dead; D.timer -= DT;
    const t = D.t;
    if (D.to > 0) { // huddles at the benches
      D.to -= DT;
      for (const P of onC()) {
        if (P.st === "down") continue;
        const a = P.slot * 1.2566, cx = 47 + (P.t === 0 ? -9 : 9);
        P.tx = cx + dcos(a) * 2.3; P.ty = -1.2 + dsin(a) * 1.4; P.urg = 0.55;
      }
      return;
    }
    if (D.timer < 0.45 && !D.subbed) { D.subbed = true; for (const tt of [0, 1]) if (G.lineup[tt].some(P => P.out)) { for (const P of G.lineup[tt]) if (P.out && P.hurt) P.st = "ok"; doSubs(tt, D.inb, true); } } // the trainers help him off
    const bl = D.blob;
    if (bl) { // box set: the shooter pops to the corner off a screen, the screener rolls, the guard is the safety
      const h = hoopOf(t), at = (o2, l) => ({ x: h.x + h.dir * o2, y: clamp(h.y + l * bl.sd, 1.5, C.W - 1.5) }), go = D.timer < 0.9;
      const tg = [[bl.s, go ? at(1, 21) : at(4, -5)], [bl.x, go ? at(2, -3) : at(5, 2)], [bl.c, at(24, 0)]];
      for (const [P, q] of tg) if (P && P.st !== "down") { P.tx = q.x; P.ty = q.y; P.urg = 0.9; }
      const Ds = bl.s ? defenderOf(bl.s) : null;
      if (go && Ds && bl.x && !bl.hit && dist(bl.x, Ds) < 2.6) { Ds.screenedT = 1.0; bl.hit = true; }
    }
    for (const P of G.lineup[t]) {
      if (P.st === "down") continue;
      if (bl && (P === bl.s || P === bl.x || P === bl.c)) continue;
      if (P === D.inb) { P.tx = D.spot.x; P.ty = D.spot.y; P.urg = 1; continue; }
      if (P === D.recv) {
        const ix = clamp(D.spot.x, 2, C.L - 2) + (D.spot.x < 0 ? 6 : D.spot.x > C.L ? -6 : 0);
        const iy = clamp(D.spot.y, 2, C.W - 2) + (D.spot.y < 0 ? 6 : D.spot.y > C.W ? -6 : 0);
        P.tx = ix; P.ty = iy; P.urg = 0.9; continue;
      }
      const s = spotXY(P, t); P.tx = s.x; P.ty = s.y; P.urg = 0.7;
    }
    for (const Dd of G.lineup[1 - t]) defAI(Dd, null);
    const inb = D.inb;
    if (D.timer <= 0 && (hyp(inb.x - D.spot.x, inb.y - D.spot.y) < 2.5 || D.timer < -4) && inb.st !== "down") {
      inb.x = D.spot.x; inb.y = D.spot.y; inb.vx = inb.vy = 0;
      if (bl) { // take the best look the play gave him
        let bm = null, bv = -1e9;
        for (const M of [bl.s, bl.x, bl.c]) { if (!M || !M.on || M.st === "down") continue; const e = evalAt(M, M.x, M.y), v = e.ev + (e.cd > 4 ? 0.2 : 0) - laneRisk(inb, M) * 0.8 + (M === bl.c ? 0.15 : 0); if (v > bv) { bv = v; bm = M; } }
        D.recv = bm || G.lineup[t].find(Q => Q !== inb);
        ev("call", { team: t, kind: "blob", set: "blob", pid: D.recv.idx, w: inb.idx });
      }
      G.phase = "live"; G.inbound = true; G.dead = null; G.possLive = false;
      B.mode = "held"; B.holder = inb; B.lastTouch = t; G.lastHandler = inb;
      inb.gather = true; inb.action = "pass"; inb.target = D.recv; inb.gatherT = 0.3; inb.driving = false; inb.passLob = false;
    }
  }
  function startFT(P, n, kind, keep) {
    G.phase = "ft"; G.clockRun = false; G.shotRun = false; G.inbound = false; G.fouler = null; G.dbl = null; G.trans = [-1, -1]; G.injWhistle = -1; G.cov = null;
    B.mode = "dead"; B.holder = null;
    doSubs(0, P); doSubs(1, P);
    if (G.off !== P.t) { G.off = P.t; assignMatches(); }
    G.ftS = { P, n, i: 0, wait: 1.8, kind, keep: !!keep };
  }
  function ftStep() {
    const S = G.ftS, P = S.P, h = hoopOf(P.t);
    const lx = h.x + h.dir * C.FTD;
    P.tx = lx; P.ty = h.y; P.urg = 0.8;
    const laneD = [[7, -6], [7, 6], [11, -6], [11, 6]];
    let di = 0, oi = 0;
    for (const Q of onC()) {
      if (Q === P) continue;
      if (Q.t !== P.t && di < 2) { const l = laneD[di++]; Q.tx = h.x + h.dir * l[0]; Q.ty = h.y + l[1]; }
      else if (Q.t === P.t && oi < 2) { const l = laneD[2 + oi++]; Q.tx = h.x + h.dir * l[0]; Q.ty = h.y + l[1]; }
      else { Q.tx = h.x + h.dir * 26; Q.ty = h.y + (Q.t === P.t ? -10 : 10) + Q.slot; }
      Q.urg = 0.6;
    }
    if (B.mode !== "ftshot") {
      B.x = P.x + 0.6; B.y = P.y; B.z = 3.5; B.vx = B.vy = B.vz = 0;
      S.wait -= DT;
      if (S.wait <= 0 && (hyp(P.x - lx, P.y - h.y) < 1.5 || S.wait < -3)) {
        P.x = lx; P.y = h.y;
        const made = rng.next() < Math.min(0.98, ftProb(P.p.r, P.energy) * (clutchTime(P.t) ? 1 + P.clutch * 0.04 : 1) * (1 + Math.min(0, moodNow(P)) * 0.04));
        let tx = h.x, ty = h.y;
        if (!made) { const a = rng.range(0, 6.283); tx += dcos(a) * 0.8; ty += dsin(a) * 0.8; }
        const Tf = 0.95, z0 = 7.6;
        B.x = lx; B.y = h.y; B.z = z0; B.vx = (tx - lx) / Tf; B.vy = (ty - h.y) / Tf; B.vz = (10.15 - z0 + 0.5 * GRAV * Tf * Tf) / Tf;
        B.mode = "ftshot"; B.t = 0; B.shot = { P, made, T: Tf, hoop: h };
      }
    }
  }
  function ftArrive() {
    const S = G.ftS, P = S.P, made = B.shot.made, h = B.shot.hoop;
    if (made) score(P.t, 1);
    ev("ft", { pid: P.idx, team: P.t, made, n: S.i + 1, of: S.n, kind: S.kind });
    S.i++;
    if (S.i < S.n) { S.wait = 1.3; B.mode = "dead"; B.shot = null; return; }
    G.ftS = null;
    if (S.keep) { B.mode = "dead"; B.shot = null; deadInbound(P.t, sidelineSpot(h.x + h.dir * 28, 50), { wait: 1.3, kind: "foul", resetShot: true }); return; } // flagrant: shots and the ball
    if (made) { B.mode = "dead"; B.vx = 0; B.vy = 0; B.vz = -4; deadInbound(1 - P.t, baselineSpot(1 - P.t), { wait: 1.3, kind: "make", resetShot: true }); }
    else { rimBounce(h, P.x, P.y); G.phase = "live"; G.reboundable = true; G.lastShotTeam = P.t; G.clockRun = true; G.shotRun = false; }
  }

  // ---- handler ----
  function newProbe(H, h) {
    const sit = G.sitO;
    const pref = (sit === "need4" && H.p.r.fr > 50) || (FOUR && H.p.r.fr > 70) ? 31.5 : H.p.r.thr > 60 ? 25.5 : 21;
    const ang = rng.range(-1.05, 1.05);
    H.probe = { x: clamp(h.x + h.dir * dcos(ang) * pref, 2, C.L - 2), y: clamp(h.y + dsin(ang) * pref, 3, C.W - 3) };
  }
  function beginAction(H, kind, M) {
    const r = H.p.r;
    H.gather = true; H.action = kind; H.target = M || null;
    if (kind === "pass") H.gatherT = 0.3 - r.pas * 0.0016;
    else if (kind === "finish") { H.gatherT = 0.36; H.finishType = canDunk(H) && rng.chance(0.72 + (r.ins - 50) * 0.004) ? "dunk" : "layup"; }
    else {
      const h = hoopOf(H.t); const val = shotValue(H.x, H.y, h.side, FOUR);
      H.gatherT = 0.47 - (val === 4 ? r.fr : val === 3 ? r.thr : r.mid) * 0.0014 + (val === 4 ? 0.06 : 0);
    }
    if (kind !== "finish") H.driving = false;
  }
  function handlerAI(H) {
    const h = hoopOf(H.t); const d = hyp(H.x - h.x, H.y - h.y); const r = H.p.r;
    if (H.st === "down") return;
    if (H.gather) {
      H.gatherT -= DT;
      if (H.action === "finish") { H.tx = h.x + h.dir * 0.8; H.ty = h.y; H.urg = 0.85; }
      else { H.tx = H.x; H.ty = H.y; H.urg = 0; }
      if (H.gatherT <= 0) release(H);
      return;
    }
    const inBack = h.side === 1 ? H.x < 47 : H.x > 47;
    H.decT -= DT; H.holdT += DT;
    if (H.post) { // backing his man down toward the block, back to the basket
      H.post.t += DT;
      const dd = Math.max(d, 0.1), want = Math.max(4.5, d - 3);
      H.tx = h.x + (H.x - h.x) / dd * want; H.ty = h.y + (H.y - h.y) / dd * want; H.urg = 0.22 + (H.arch === "DOZ" ? 0.1 : 0);
      if (H.post.t > 4.5) H.post = null;
    } else if (H.pnr) {
      const Sc = H.pnr.S, sc = Sc.screen;
      if (!sc || sc.for !== H || !Sc.on) H.pnr = null;
      else if (sc.phase === "go") { H.tx = H.x; H.ty = H.y; H.urg = 0.15; } // wait for the screen
      else { // come off it toward the middle and the rim
        if (!H.pnr.dest) { let m = Math.sign(25 - Sc.y) || (Sc.idx % 2 ? 1 : -1); if (H.pnr.ice) m = -m; H.pnr.dest = { x: clamp(Sc.x + h.dir * (H.pnr.ice ? 2.5 : 4.5), 2, C.L - 2), y: clamp(Sc.y + m * (H.pnr.ice ? 5 : 4), 3, C.W - 3) }; }
        H.tx = H.pnr.dest.x; H.ty = H.pnr.dest.y; H.urg = 1; H.pnr.t = (H.pnr.t || 0) + DT;
        if (H.pnr.t > 1.3 || hyp(H.x - H.tx, H.y - H.ty) < 1.5) { H.pnr = null; H.probe = null; }
      }
    } else if (H.driving) {
      H.tx = h.x + h.dir * 1.2; H.ty = h.y + (H.y - h.y) * 0.25; H.urg = 1;
      if (d < 5.5) { beginAction(H, "finish"); return; }
    } else if (d > 33) {
      H.tx = h.x + h.dir * 27; H.ty = h.y + (H.y - h.y) * 0.5; H.urg = 0.85 + (G.trans[H.t] > G.tick ? 0.15 : 0);
    } else if (H.iso) { // isolation: size him up from the top or the wing, then go
      H.iso.t += DT;
      if (!H.probe || hyp(H.x - H.probe.x, H.y - H.probe.y) < 1.5) newProbe(H, h);
      H.tx = H.probe.x; H.ty = H.probe.y; H.urg = 0.35;
      if (H.iso.t > 5) H.iso = null;
    } else if (G.sitO === "hold" && G.clock > 6) { // milk it at the top
      H.tx = h.x + h.dir * 29; H.ty = h.y + (H.y - h.y) * 0.3; H.urg = 0.3;
    } else if (H.setT) { // walking the set into place
      H.tx = H.setT.x; H.ty = H.setT.y; H.urg = 0.55;
    } else {
      if (!H.probe || hyp(H.x - H.probe.x, H.y - H.probe.y) < 1.5) newProbe(H, h);
      H.tx = H.probe.x; H.ty = H.probe.y; H.urg = 0.5;
    }
    H.tx = clamp(H.tx, 1.5, C.L - 1.5); H.ty = clamp(H.ty, 1.5, C.W - 1.5);
    if (H.decT <= 0) { H.decT = 0.28 + rng.range(0, 0.25) + (1 - r.iq / 99) * 0.2; decide(H, h, d, inBack); }
  }
  // how likely this defense is to put me on the rubber in the next second
  function hitMul(dt) { const p = DP[dt].hit; return (G.desp[dt] ? 2 : 1) * (p === "blitz" ? 1.4 : p === "contain" ? 1 : 0.5) * TAC[dt].tackle; }
  function tackleDanger(H) {
    let s = 0;
    for (const D of G.lineup[1 - H.t]) { if (D.st !== "ok") continue; const dd = dist(D, H); if (dd < 6) s += (1 - dd / 6) * D.p.r.tck / 99; }
    return clamp(s * 0.8 * hitMul(1 - H.t), 0, 1.2);
  }
  function pickScreener(H) {
    let Sc = null, bv = -1e9;
    for (const M of G.lineup[H.t]) {
      if (M === H || M.st !== "ok" || M.screen || M.cutT > 0 || M.waitScreen || M.crashT > 0) continue;
      const v = M.pf.scr * 0.35 + (M.job === "run" ? 10 : 0) + (M.p.role === "BIG" || M.p.role === "BRUISER" ? 12 : 0) + (M.arch === "STR" && FOUR ? 6 : 0) - hyp(M.x - H.x, M.y - H.y) * 0.5;
      if (v > bv) { bv = v; Sc = M; }
    }
    return Sc && hyp(Sc.x - H.x, Sc.y - H.y) < 32 ? Sc : null;
  }
  // ===================== THE PLAYBOOK =====================
  // who could run each set with the five on the floor
  function setOptions(t) {
    const L = G.lineup[t], c1 = L.find(P => P.job === "c1") || best(L, P => P.pf.hand), others = L.filter(P => P !== c1);
    const bigish = P => P.p.role === "BIG" || P.p.role === "BRUISER" || P.pf.scr >= 55;
    const scrs = others.slice().sort((a, b) => (b.pf.scr + (bigish(b) ? 15 : 0)) - (a.pf.scr + (bigish(a) ? 15 : 0)) || a.idx - b.idx);
    const shootV = P => FOUR ? Math.max(P.p.r.fr + 3, P.p.r.thr) : P.p.r.thr;
    const sh = others.slice().sort((a, b) => shootV(b) * b.use - shootV(a) * a.use || a.idx - b.idx);
    const post = best(others, P => P.pf.post), run = best(others.filter(P => canDunk(P)), P => P.pf.lob);
    const o = { high: { h: c1, x: scrs[0] } }, big2 = scrs.filter(bigish);
    if (big2.length >= 2) o.horns = { h: c1, x: big2[0], y: big2[1] };
    if (run && run.pf.lob > 55) { const y = sh.find(P => P !== run && P.pf.shoot >= 55); if (y) o.spain = { h: c1, x: run, y }; }
    if (c1.use >= 1 && c1.pf.cre > 52) o.iso = { h: c1 };
    if (post && post.pf.post > 58) { o.post = { x: post }; const per = others.filter(P => P !== post && P.pf.shoot >= 50); if (per.length >= 2) o.split = { x: post, a: per[0], b: per[1] }; }
    const s0 = sh.find(P => P.pf.shoot >= 58);
    if (s0) {
      const sc = scrs.filter(P => P !== s0);
      if (sc.length >= 2) { o.floppy = { h: c1, s: s0, x: sc[0], y: sc[1] }; o.elevator = { h: c1, s: s0, x: sc[0], y: sc[1] }; }
      const k = best(others.filter(P => P !== s0 && bigish(P) && P.p.r.pas >= 40), P => P.p.r.pas + P.pf.scr * 0.3);
      if (k) o.dho = { k, s: s0 };
      const c = sh.find(P => P.pf.shoot >= 58), x = scrs.find(P => P !== c);
      if (c1.pf.cre > 50 && c && x && c !== c1) o.hammer = { h: c1, c, x };
    }
    return o;
  }
  // how good a look the set should produce for these players (the after-timeout pick)
  function setValue(k, R) {
    if (!R) return 50;
    switch (k) {
      case "high": return R.h.pf.cre * 0.65 + R.x.pf.lob * 0.2 + R.x.pf.shoot * 0.15;
      case "horns": return R.h.pf.cre * 0.55 + (R.x.pf.lob + R.y.pf.lob) * 0.15 + Math.max(R.x.pf.shoot, R.y.pf.shoot) * 0.15;
      case "spain": return R.h.pf.cre * 0.4 + R.x.pf.lob * 0.35 + R.y.pf.shoot * 0.25;
      case "iso": return R.h.pf.cre * (0.8 + R.h.use * 0.15);
      case "post": case "split": return R.x.pf.post * 0.9 + (k === "split" ? 4 : 0);
      case "floppy": case "elevator": return R.s.pf.shoot * 0.95 + (k === "elevator" ? 2 : 0);
      case "dho": return R.s.pf.shoot * 0.6 + R.s.pf.cre * 0.3 + R.k.p.r.pas * 0.1;
      case "hammer": return R.c.pf.shoot * 0.6 + R.h.pf.cre * 0.4;
    }
    return 50;
  }
  // the best mismatch on the floor: a big man posting a small one, or a creator isolating a slow defender
  function findMismatch(t) {
    if (DP[1 - t].scheme === "zone") return null; // nobody to hunt in a zone
    let bm = null;
    for (const O of G.lineup[t]) {
      const D = defenderOf(O); if (!D || O.st !== "ok") continue;
      const ht = O.p.ht - D.p.ht, str = O.p.r.str - D.p.r.str;
      const post = (O.pf.post > 55 || O.p.role === "BIG" || O.p.role === "BRUISER") && ht >= 4 ? ht * 1.6 + str * 0.15 + (O.pf.post - 55) * 0.2 : 0;
      const iso = O.pf.cre > 56 ? (O.pf.cre - D.pf.perD) * 0.35 + Math.max(0, O.p.r.spd - D.p.r.spd) * 0.25 + (D.p.ht - O.p.ht >= 4 ? 3 : 0) : 0;
      const v = Math.max(post, iso);
      if (v > 0 && (!bm || v > bm.v)) bm = { O, D, v, kind: post >= iso ? "post" : "iso" };
    }
    return bm;
  }
  // go at the mismatch (the broadcast hears about a new one; after that it's just the call)
  function huntIt(t, mm) {
    const key = mm.O.idx * 64 + mm.D.idx, seen = G.lastMM[t], at = seen.get(key);
    if ((at === undefined || G.tick - at > 7200) && mm.v >= 9) { ev("mismatch", { team: t, pid: mm.O.idx, d: mm.D.idx, kind: mm.kind, v: Math.round(mm.v) }); seen.set(key, G.tick); }
    startPlay(t, mm.kind, mm.kind === "post" ? { x: mm.O } : { h: mm.O }, { hunt: true });
  }
  const CUSTOM = new Set(["horns", "spain", "split", "floppy", "elevator", "dho", "hammer"]);
  // the coach's call for this half-court trip
  function callPlay(t) {
    const pl = PL[t], tac = TAC[t], sys = pl.sys, opts = setOptions(t);
    const mm = findMismatch(t);
    if (mm && mm.v > 8 + (1 - tac.adapt) * 8 && rng.chance(0.2 + tac.adapt * 0.4)) { huntIt(t, mm); return; }
    const ato = G.ato[t]; G.ato[t] = false;
    const w = {};
    for (const k in SETS) if (k === "flow" || opts[k]) w[k] = SETS[k].w[sys];
    if (w.iso) w.iso *= 0.7 + tac.star * 0.6; if (w.high) w.high *= 0.8 + tac.star * 0.4;
    if (G.sitO === "need4" || G.sitO === "need3") { for (const k of ["floppy", "elevator", "hammer"]) if (w[k]) w[k] *= 4; w.post = 0; w.split = 0; }
    if (G.sitO === "hold") { if (w.iso) w.iso *= 3; if (w.high) w.high *= 1.5; }
    let key = "flow";
    if (ato) { // after a timeout he draws up his best look (a good late-game coach picks it every time)
      let bv = -1e9;
      for (const k in w) { if (k === "flow" || !w[k]) continue; const v = setValue(k, opts[k]) * (0.75 + w[k] / 80) + rng.normal(0, 7 * (1 - tac.late)); if (v > bv) { bv = v; key = k; } }
    } else {
      let tot = 0; for (const k in w) tot += w[k];
      let x = rng.next() * tot; for (const k in w) { x -= w[k]; if (x <= 0) { key = k; break; } }
    }
    startPlay(t, key, opts[key] || {}, { ato });
  }
  function startPlay(t, key, roles, o) {
    const S = SETS[key], fam = S.fam;
    const P = roles.s || (fam === "post" ? roles.x : roles.h) || roles.k || null;
    G.play = { kind: fam, set: key, P, roles, step: 0, t: 0, done: false, custom: CUSTOM.has(key), side: rng.chance(0.5) ? 1 : -1, reads: [], tk0: G.tick, hunt: !!(o && o.hunt), ato: !!(o && o.ato) };
    if (key === "flow") return;
    if (P) P.callT = 0.7; const H = B.mode === "held" ? B.holder : null; if (H && H !== P) H.callT = 0.7;
    const rl = {}; for (const k in roles) if (roles[k]) rl[k] = roles[k].idx;
    ev("call", { team: t, kind: fam, set: key, pid: P ? P.idx : -1, w: -1, roles: rl, side: G.play.side, ato: G.play.ato || undefined, hunt: G.play.hunt || undefined });
  }
  function endSet() { if (G.play) G.play.done = true; for (const P of G.lineup[G.off]) P.setT = null; }
  // run the called set one tick: move the pieces, trigger the screens, and tell the ball handler his reads
  function runSet() {
    const pl = G.play;
    if (!pl || pl.done || !pl.custom || G.phase !== "live" || G.inbound || G.trans[G.off] > G.tick) return;
    const t = G.off, R = pl.roles, h = hoopOf(t), sd = pl.side;
    for (const k in R) { const P = R[k]; if (!P || !P.on || P.t !== t) { endSet(); return; } }
    pl.t += DT;
    if (pl.t > 10) { endSet(); return; }
    const at = (o, l) => ({ x: h.x + h.dir * o, y: clamp(h.y + l * sd, 1.5, C.W - 1.5) });
    const near = (P, q, r) => hyp(P.x - q.x, P.y - q.y) < r;
    const spotAt = sp => { const A = SPOTS[sp]; return { x: h.x + h.dir * A[0], y: h.y + A[1], spot: sp }; };
    const side = (l, L, Rr) => (l * sd < 0 ? L : Rr);
    const H = B.mode === "held" ? B.holder : null;
    pl.reads.length = 0;
    const pnrWith = (Hh, Sc) => { if (startScreen(Sc, Hh, "pnr")) { Hh.pnr = { S: Sc, t: 0 }; Hh.pnrT = G.tick; G.screenCD[t] = G.tick + 140; G.calls.pnr++; } };
    switch (pl.set) {
      case "horns": {
        if (pl.step === 0) {
          const ex = at(14, -6), ey = at(14, 6), hp = at(27, 0);
          R.x.setT = ex; R.y.setT = ey; R.h.setT = hp;
          if (H === R.h && ((near(R.x, ex, 3.5) && near(R.y, ey, 3.5) && near(R.h, hp, 6)) || pl.t > 4)) {
            const e = rng.chance(0.5) ? R.x : R.y, o = e === R.x ? R.y : R.x;
            R.x.setT = null; R.y.setT = null; R.h.setT = null;
            pnrWith(R.h, e);
            if (o.pf.shoot >= 62) o.setT = at(FOUR && o.p.r.fr >= 62 ? 30 : 24, 0); else o.cutT = 1.4;
            pl.step = 1; pl.t1 = pl.t; pl.e = e; pl.o = o;
          } else if (H && H !== R.h) pl.reads.push([R.h, 0.18]);
        } else { pl.reads.push([pl.e, 0.14], [pl.o, 0.1]); if (pl.t - pl.t1 > 2.5) endSet(); }
        break;
      }
      case "spain": {
        const SD = defenderOf(R.x);
        if (pl.step === 0) {
          R.y.setT = at(16, -4);
          if (H === R.h && hyp(R.h.x - h.x, R.h.y - h.y) < 34) { pnrWith(R.h, R.x); pl.step = 1; }
          else if (H && H !== R.h) pl.reads.push([R.h, 0.18]);
          if (pl.t > 5) endSet();
        } else if (pl.step === 1) {
          pl.reads.push([R.x, 0.12]);
          if (!R.x.screen || R.x.screen.phase === "roll") { // the roller turns: the back screen hits his man
            if (SD && SD.st === "ok") {
              const dd = hyp(SD.x - h.x, SD.y - h.y) || 1; R.y.setT = { x: SD.x + (h.x - SD.x) / dd * 1.2, y: SD.y + (h.y - SD.y) / dd * 1.2 };
              if (near(R.y, SD, 2.6) || pl.t > 7) {
                if (near(R.y, SD, 2.6)) SD.screenedT = Math.max(SD.screenedT, 0.9);
                const sp = FOUR && R.y.p.r.fr >= 60 ? "FOUR_TOP" : "TOP", d0 = spotAt(sp);
                R.y.setT = null; R.y.curl = { x: d0.x, y: d0.y, t: 0, spot: sp }; pl.step = 2; pl.t2 = pl.t;
              }
            } else { R.y.setT = null; pl.step = 2; pl.t2 = pl.t; }
          }
        } else { pl.reads.push([R.x, 0.22], [R.y, 0.14]); if (pl.t - pl.t2 > 2.2) endSet(); }
        break;
      }
      case "split": {
        if (pl.step === 0) {
          R.x.setT = H !== R.x ? at(5, -7) : null; // the post seals on the block
          if (H === R.x && hyp(R.x.x - h.x, R.x.y - h.y) < 14) { // entry made: the split
            const scr = G.lastPass && G.lastPass.to === R.x && G.lastPass.from.on && G.lastPass.from !== R.b && G.lastPass.from.t === t ? G.lastPass.from : R.a;
            const tgt = scr === R.b ? R.a : R.b;
            if (tgt !== scr && startScreen(scr, tgt, "off", { x: h.x + h.dir * 25, y: h.y + 6 * sd, spot: "TOP" })) tgt.waitScreen = true;
            pl.step = 1; pl.t1 = pl.t; pl.scr = scr; pl.tgt = tgt;
          } else if (H && H !== R.x) pl.reads.push([R.x, hyp(R.x.x - h.x, R.x.y - h.y) < 12 ? 0.22 : 0.02]);
          if (pl.t > 6) endSet();
        } else { pl.reads.push([pl.tgt, 0.18], [pl.scr, 0.14]); if (pl.t - pl.t1 > 3) endSet(); }
        break;
      }
      case "floppy": {
        if (pl.step === 0) {
          const under = at(2.5, 0); R.s.setT = under; R.x.setT = at(7, -9); R.y.setT = at(7, 9); if (R.h !== R.s) R.h.setT = at(27, 0);
          if (H && H !== R.h && H !== R.s) pl.reads.push([R.h, 0.12]);
          if ((near(R.s, under, 3) && pl.t > 1.2 && H) || pl.t > 4) {
            const Ds = defenderOf(R.s), goL = Ds ? (Ds.y - h.y) * sd > 0 : rng.chance(0.5); // come off away from his man
            const e = goL ? R.x : R.y, sp = FOUR && R.s.p.r.fr >= 60 ? side(goL ? -1 : 1, "FOUR_L", "FOUR_R") : side(goL ? -1 : 1, "WING_L", "WING_R");
            R.s.setT = null; R.x.setT = null; R.y.setT = null; R.h.setT = null;
            if (startScreen(e, R.s, "off", spotAt(sp))) R.s.waitScreen = true;
            pl.step = 1; pl.t1 = pl.t;
          }
        } else { pl.reads.push([R.s, R.s.curl ? 0.26 : 0.08]); if (pl.t - pl.t1 > 3) endSet(); }
        break;
      }
      case "elevator": {
        const gate = at(22, 0);
        if (pl.step === 0) {
          R.x.setT = at(22, -2.6); R.y.setT = at(22, 2.6); R.s.setT = at(9, -3);
          if (H && H !== R.h && H !== R.s) pl.reads.push([R.h, 0.12]);
          if ((near(R.x, R.x.setT, 2.5) && near(R.y, R.y.setT, 2.5) && pl.t > 1.2) || pl.t > 4) {
            const sp = FOUR && R.s.p.r.fr >= 60 ? "FOUR_TOP" : "TOP", d0 = spotAt(sp);
            R.s.setT = null; R.s.curl = { x: d0.x, y: d0.y, t: 0, spot: sp }; pl.step = 1; pl.t1 = pl.t;
          }
        } else {
          const Ds = defenderOf(R.s); // the doors close on his man
          if (!pl.closed && Ds && near(Ds, gate, 3.2) && hyp(R.s.x - h.x, R.s.y - h.y) > hyp(gate.x - h.x, gate.y - h.y)) { Ds.screenedT = Math.max(Ds.screenedT, 1.1); pl.closed = true; }
          if (pl.t - pl.t1 > 1.4) { R.x.setT = null; R.y.setT = null; }
          pl.reads.push([R.s, 0.26]);
          if (pl.t - pl.t1 > 3) endSet();
        }
        break;
      }
      case "dho": {
        if (pl.step === 0) {
          const top = at(24, -4); R.k.setT = top;
          if (H === R.k) { R.k.setT = null; pl.step = 1; pl.t1 = pl.t; }
          else if (H && near(R.k, top, 4.5)) pl.reads.push([R.k, 0.2]);
          if (pl.t > 6) endSet();
        } else {
          if (H !== R.k) { endSet(); break; }
          R.s.setT = { x: R.k.x + h.dir * 0.5, y: clamp(R.k.y - 2.2 * sd, 1.5, C.W - 1.5) };
          const Ds = defenderOf(R.s); if (Ds && !pl.hit && near(Ds, R.k, 3)) { Ds.screenedT = Math.max(Ds.screenedT, 0.8); pl.hit = true; }
          if (near(R.s, R.k, 5)) pl.reads.push([R.s, 0.5]);
          if (pl.t - pl.t1 > 4) endSet();
        }
        break;
      }
      case "hammer": {
        if (pl.step === 0) {
          R.h.setT = at(24, -14); R.c.setT = at(1, 21); R.x.setT = at(4, 10);
          if (H === R.h && (near(R.h, R.h.setT, 4.5) && pl.t > 1 || pl.t > 4)) { R.h.setT = null; R.h.driving = true; R.h.decT = 0.3; pl.step = 1; pl.t1 = pl.t; }
          else if (H && H !== R.h) pl.reads.push([R.h, 0.16]);
          if (pl.t > 6) endSet();
        } else {
          const Dc = defenderOf(R.c);
          if (!pl.hit && Dc) { R.x.setT = { x: Dc.x, y: Dc.y }; if (near(R.x, Dc, 2.6)) { Dc.screenedT = Math.max(Dc.screenedT, 1.0); pl.hit = true; } } else R.x.setT = null;
          R.c.setT = at(10, 22);
          pl.reads.push([R.c, 0.3]);
          if (pl.t - pl.t1 > 2.5) endSet();
        }
        break;
      }
    }
  }
  // the defense trades men back when a switch left a big on a small away from the ball
  function scram() {
    const dt = 1 - G.off, dp = DP[dt]; if (dp.scheme === "zone" || TAC[dt].adapt < 0.25 || G.inbound) return;
    const D5 = G.lineup[dt], ball = B.mode === "held" ? B.holder : null;
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const A = D5[i], Bd = D5[j], OA = G.match.get(A), OB = G.match.get(Bd);
      if (!OA || !OB || OA === ball || OB === ball || A.st !== "ok" || Bd.st !== "ok") continue;
      if (dist(A, B) < 12 || dist(Bd, B) < 12 || dist(A, Bd) > 16) continue;
      const now = matchCost(A, OA, dp, 1, dt) + matchCost(Bd, OB, dp, 1, dt), sw = matchCost(A, OB, dp, 1, dt) + matchCost(Bd, OA, dp, 1, dt);
      if (now - sw > 5 && rng.chance(0.25 + TAC[dt].adapt * 0.4 + (dp.cov === "switch" || dp.scheme === "switch" ? 0.25 : 0))) { /* switching teams drill it */ G.match.set(A, OB); G.match.set(Bd, OA); ev("scram", { team: dt, pid: A.idx, w: Bd.idx }); return; }
    }
  }
  function decide(H, h, d, inBack) {
    const r = H.p.r, sc = G.shotClock, pl = PL[H.t], S = SYSTEMS[pl.sys], tac = TAC[H.t];
    const sit = situation(H.t); G.sitO = sit;
    if (!inBack && !G.play && G.shotRun && !(G.trans[H.t] > G.tick) && !G.inbound) callPlay(H.t);
    // a switch handed them a mismatch: go get it
    if (G.hunt >= 0 && G.tick >= G.hunt && !inBack) {
      G.hunt = -1;
      if (!G.play || G.play.done || G.play.set === "flow") { const mm = findMismatch(H.t); if (mm && mm.v > 7 + (1 - tac.adapt) * 8 && rng.chance(0.25 + tac.adapt * 0.45)) huntIt(H.t, mm); }
    }
    const play = G.play && !G.play.done ? G.play : null, basic = play && !play.custom ? play : null;
    const cov = G.cov && G.cov.H === H && G.tick < G.cov.until ? G.cov : null;
    const callB = v => v * (0.35 + 0.65 * H.comp); // freelancers ignore the call
    const late = (G.shotRun && sc < 4) ? 1 : (G.shotRun && sc < 8) ? 0.5 : 0;
    const buzzer = G.clockRun && G.clock < 2.6 && G.clock < sc + 0.5;
    const [oD, od] = nearestOpp(H);
    let pressure = od < 3 ? (3 - od) / 3 : 0;
    if (G.dbl && G.dbl.H === H) pressure = Math.min(1, pressure + 0.35);
    const danger = tackleDanger(H), carry = clamp(H.pf.carry / 100, 0.2, 0.95);
    const elapsed = (G.tick - G.possStart) * DT;
    let settle = G.shotRun ? Math.max(0, 15.5 - 3.5 * pl.pace - elapsed) * 0.055 : 0;
    if (sit === "milk") settle += sc > 9 ? 0.35 : 0;
    if (sit === "twofor1" || sit === "hurry" || G.trans[H.t] > G.tick) settle = 0;
    const holding = sit === "hold" && G.clock > 4 + (H.idx % 3) * 0.6;
    if (buzzer && d < 60) { beginAction(H, d < 5.5 ? "finish" : "shot"); return; }
    const opts = [];
    const base = !G.shotRun ? 1.0 : sc > 15 ? 1.13 : sc > 9 ? 1.04 : sc > 5 ? 0.92 : 0.55;
    const holdLim = S.hold * (H.job === "c1" ? 1.4 : 1) * (H.arch === "GEN" ? 1.15 : 1);
    let holdS = base - pressure * 0.22 + (H.pnr && !H.pnr.dest ? 0.25 : 0) + (H.post ? 0.05 : 0) + (H.iso ? 0.12 : 0)
      - Math.max(0, H.holdT - holdLim - 0.5) * 0.06 - danger * (1 - carry) * 0.3;
    if (holding) holdS += 0.8;
    opts.push({ k: "hold", s: holdS });
    if (inBack) {
      // fast break?
      let back = 0; for (const D of G.lineup[1 - H.t]) if (hyp(D.x - h.x, D.y - h.y) < d - 2) back++;
      const pushing = G.trans[H.t] > G.tick;
      if (G.possLive && !H.driving && G.tick - G.possStart < 100 && (back <= 1 || (pushing && back <= 2))) opts.push({ k: "drive", s: 1.25 + pl.pace * 0.25 - back * 0.15 });
    } else if (d < 40) {
      const e = evalAt(H, H.x, H.y), cls = shotCls(e.val, e.d);
      let s = e.ev * shotW(H, cls) - 0.05 + late * 0.2 - settle - H.fga * 0.016 * clamp(2 - H.use, 0.4, 1.6) - (e.val === 4 ? H.fpa * 0.012 : 0) + (H.use - 1) * 0.07;
      if (e.val === 4 && r.fr < 55) s -= 0.25;
      if (H.post && d < 10) s += 0.08;
      if (H.iso) s += 0.04;
      if (d > 33) s -= 0.3;
      if (cls === 0) s -= rimGuard(H) * 0.22;
      if (cov && cov.kind === "drop" && e.d > 12 && e.d < 27) s += 0.06 * (0.6 + r.mid / 150); // the big dropped: pull up
      if (cov && cov.kind === "ice" && e.d < 12) s -= 0.06; // iced to the baseline: the big is waiting
      s += sitShot(sit, e.val);
      s += H.streak * heatNow(H) * 0.015 + (clutchTime(H.t) ? H.clutch * 0.06 : 0) - (moodNow(H) < -0.3 ? 0.04 : 0); // feeling it, wanting it, or not
      if (holding) s -= 2;
      opts.push({ k: "shoot", s });
      // call a pick-and-roll
      if (!H.pnr && !H.post && !H.driving && !H.iso && G.shotRun && sc > 7 && d > 17 && d < 34 && G.tick > G.screenCD[H.t] && !holding && !(play && play.custom) && G.calls.pnr < (pl.sys === "helio" && H.job === "c1" ? 2 : 1)) {
        const Sc = pickScreener(H);
        if (Sc) opts.push({ k: "pnr", s: base - 0.14 + S.pnr * 0.03 + (H.job === "c1" ? 0.03 : 0) + (H.arch === "GEN" || H.arch === "CRE" ? 0.03 : 0) + tac.o * 0.03 + callB(basic && basic.kind === "pnr" ? 0.26 : -0.05), M: Sc });
      }
      // isolation for the go-to guy
      if (!H.iso && !H.pnr && !H.post && !H.driving && G.shotRun && sc > 8 && d > 16 && d < 33 && (H.job === "c1" || H.arch === "CRE") && H.use > 1.05 && !holding && G.calls.iso < 1)
        opts.push({ k: "iso", s: base - 0.2 + S.iso * 0.03 + (H.use - 1) * 0.1 + (H.pf.cre - 60) * 0.004 + callB(basic && basic.kind === "iso" && basic.P === H ? 0.3 : -0.06) });
      // post up
      if (!H.post && !H.driving && !H.pnr && !H.iso && (H.job === "post" || H.arch === "PST" || H.arch === "DOZ" || H.p.role === "BIG" || H.p.role === "BRUISER") && d > 5.5 && d < 17 && !holding && G.calls.post < (pl.sys === "power" ? 2 : 1)) {
        opts.push({ k: "post", s: base - 0.16 + S.post * 0.02 + (H.job === "post" ? 0.04 : 0) + (r.str - (oD ? oD.p.r.str : 50)) * 0.003 + (r.ins - 50) * 0.004 + (H.p.ht - (oD ? oD.p.ht : 78)) * 0.008 + callB(basic && basic.kind === "post" && basic.P === H ? 0.3 : -0.05) });
      }
      const lane = laneBlock(H, h, oD);
      if (!H.driving && d > 6 && d < 32 && !holding) {
        const beat = (r.spd + r.acc) / 2 - (oD ? oD.p.r.perD + (DP[oD.t].hit === "disciplined" ? 6 : DP[oD.t].hit === "blitz" ? -5 : 0) : 40);
        const finP = makeProb(H, 2, 3, 3.5, null);
        let threat = 0; for (const D of G.lineup[1 - H.t]) if (D.st !== "down" && hyp(D.x - h.x, D.y - h.y) < d) threat += D.p.r.tck / 99 * 0.06;
        threat *= hitMul(1 - H.t) * (1.25 - carry);   // bulldozers want the contact; everyone else fears it
        opts.push({ k: "drive", s: finP * 2 * shotW(H, 0) / (1 + lane * 1.6) + beat * 0.004 + r.brk * 0.0015 - pressure * 0.12 - threat - 0.12 - settle - rimGuard(H) * 0.15 + (H.iso ? 0.12 : 0) + sitShot(sit, 2) * 0.5 - (cov && cov.kind === "ice" ? 0.14 : 0) + moodNow(H) * (moodNow(H) < 0 ? 0.12 : 0.05) });
      }
      if (H.driving) opts[0].s = 1.05 - lane * 0.45 - pressure * 0.15 + (H.arch === "DOZ" ? 0.1 : 0);
    }
    for (const M of G.lineup[H.t]) {
      if (M === H || M.st === "down") continue;
      const risk = laneRisk(H, M); const far = hyp(M.x - H.x, M.y - H.y);
      let s, lob = false;
      if (inBack) s = 0.5 + pressure * 0.5 - risk + (hyp(M.x - h.x, M.y - h.y) < d - 10 ? 0.25 + pl.pace * 0.1 : 0) + (M.job === "c1" && H.job !== "c1" ? 0.12 : 0) + danger * 0.2;
      else {
        const e = evalAt(M, M.x, M.y), cls = shotCls(e.val, e.d);
        const want = shotW(M, cls) * (1 + (M.use - 1) * 0.35) * (1 + Math.max(0, heatNow(M)) * M.streak * 0.05) * (clutchTime(M.t) ? 1 + M.clutch * 0.08 : 1); // feed the hot hand; get it to the closer
        const swing = base - 0.16 + S.swing + Math.min(H.holdT, 4) * 0.045 - (H.job === "c1" ? 0.03 : 0) + danger * (1 - carry) * 0.3 + (ARCH[H.arch].pass - 1) * 0.3;
        const shotV = e.ev * 0.93 * want - settle * 0.5 - M.fga * 0.01 + sitShot(sit, e.val) * 0.8 - (cls === 0 ? rimGuard(M) * 0.18 : 0);
        s = Math.max(shotV, swing) - risk * (shotV < swing ? 1.4 : 0.9) - (far > 45 ? 0.3 : 0) + pressure * 0.2
          + ((M.cutT > 0 || (M.screen && M.screen.phase === "roll") || M.curl) && e.cd > 3 ? 0.25 : 0);
        if (e.val === 4 && M.p.r.fr < 55) s -= 0.25;
        if (M.job === "post" && hyp(M.x - h.x, M.y - h.y) < 14 && !H.post) s += 0.06 * S.post;
        // lob: a rim runner by the rim with a step on his man
        if (M.pf.lob > 55 && canDunk(M) && hyp(M.x - h.x, M.y - h.y) < 8 && r.pas > 52 && !M.air && M.st === "ok") {
          const dM = defenderOf(M), open = dM ? hyp(dM.x - M.x, dM.y - M.y) : 9;
          if (open > 4 || (G.help && G.help.D === dM)) { s += 0.07 * S.lob + (M.pf.lob - 58) * 0.003; lob = true; }
        }
        if (basic && basic.P === M && basic.kind !== "pnr") s += callB(basic.kind === "offscr" ? (M.curl ? 0.28 : 0.04) : basic.kind === "post" ? (hyp(M.x - h.x, M.y - h.y) < 15 ? 0.2 : 0.02) : 0.16);
        if (basic && basic.kind === "pnr" && basic.P === M && H !== M && H.job !== "c1") s += callB(0.14);
        if (play && play.custom) for (const rd of play.reads) if (rd[0] === M) s += callB(rd[1]);
        if (cov && M === cov.Sc) s += cov.kind === "ice" ? -0.06 : callB(cov.kind === "trap" ? 0.26 : cov.kind === "hedge" ? 0.16 : 0.03); // short roll out of the trap
        if (cov && cov.kind === "ice" && Math.abs(M.y - H.y) > 22) s += 0.05; // the skip pass beats ice
        if (G.help && defenderOf(M) === G.help.D) s += 0.22;   // kick it to the man the helper left
        if (G.dbl && G.dbl.H === H && defenderOf(M) === G.dbl.D) s += 0.3;
        if (holding) s -= 0.15;
      }
      opts.push({ k: "pass", s, M, lob });
    }
    const noise = (0.05 + 0.12 * (1 - r.iq / 99)) * (1 - 0.25 * tac.o);
    let bo = null;
    for (const o of opts) { o.s += rng.normal(0, noise); if (!bo || o.s > bo.s) bo = o; }
    if (DBG) { dbg("dec"); dbg("dec:" + bo.k + (bo.lob ? "-lob" : "") + (inBack ? "-back" : "")); }
    if (bo.k === "shoot") beginAction(H, d < 5.5 ? "finish" : "shot");
    else if (bo.k === "drive") { H.driving = true; H.decT = 0.25; }
    else if (bo.k === "pass") { beginAction(H, "pass", bo.M); H.passLob = bo.lob; }
    else if (bo.k === "pnr") { if (startScreen(bo.M, H, "pnr")) { H.pnr = { S: bo.M, t: 0 }; H.pnrT = G.tick; G.screenCD[H.t] = G.tick + 140; G.calls.pnr++; if (play && play.kind === "pnr") play.done = true; dbg("run:pnr"); } }
    else if (bo.k === "iso") { H.iso = { t: 0 }; H.isoT = G.tick; H.probe = null; G.calls.iso++; if (play && play.kind === "iso") play.done = true; dbg("run:iso"); }
    else if (bo.k === "post") { H.post = { t: 0 }; G.calls.post++; if (play && play.kind === "post") play.done = true; dbg("run:post"); }
    else if (!H.driving && !H.pnr && !H.post && !H.iso && rng.chance(0.3)) newProbe(H, h);
  }
  function release(H) {
    if (H.post) H.postEnd = G.tick;
    H.gather = false; H.post = null; H.pnr = null; H.iso = null;
    if (B.mode !== "held" || B.holder !== H) { H.action = null; return; }
    const kind = H.action; H.action = null;
    if (kind === "pass") {
      const M = H.target && H.target.on ? H.target : G.lineup[H.t].find(Q => Q !== H);
      launchPass(H, M, H.x, H.y, 4.6, H.passLob && !G.inbound);
      // motion: give-and-go or screen away after the pass
      const pl = PL[H.t];
      if (!G.inbound && G.phase === "live") {
        const mv = SYSTEMS[pl.sys].cut * (0.5 + H.p.r.iq / 99) * 0.12 * H.comp;
        if (rng.chance(mv)) {
          const away = best(G.lineup[H.t].filter(Q => Q !== H && Q !== M && Q.st === "ok" && !Q.screen && !Q.waitScreen && Q.pf.shoot >= 55), Q => -hyp(Q.x - H.x, Q.y - H.y));
          const hh = hoopOf(H.t);
          if (away && rng.chance(0.5) && hyp(away.x - H.x, away.y - H.y) < 26) {
            const sp = SPOTS[away.spot] || SPOTS.TOP, dest = { x: hh.x + hh.dir * sp[0], y: hh.y + sp[1], spot: away.spot };
            if (startScreen(H, away, "off", dest)) away.waitScreen = true;
          } else H.cutT = 1.3;
        }
      }
    } else shoot(H, kind);
  }
  function launchPass(H, M, x0, y0, z0, alley) {
    const sp = 34 + H.p.r.pas * 0.13;
    const hh = hoopOf(H.t);
    let tx = M.x, ty = M.y;
    if (alley) { const dm = hyp(M.x - hh.x, M.y - hh.y) || 1, k = Math.max(0, dm - 2.2) / dm; tx = hh.x + (M.x - hh.x) * k; ty = hh.y + (M.y - hh.y) * k; }
    else for (let k = 0; k < 2; k++) { const tt = hyp(tx - x0, ty - y0) / sp; tx = M.x + M.vx * tt; ty = M.y + M.vy * tt; }
    const err = (1 - H.p.r.pas / 99) * (alley ? 0.9 : 1.3) * (PL[H.t].sys === "motion" ? 0.8 : 1);
    tx += rng.normal(0, err); ty += rng.normal(0, err);
    tx = clamp(tx, 0.5, C.L - 0.5); ty = clamp(ty, 0.5, C.W - 0.5);
    const lob = alley || (laneRisk(H, M) > 0.55 && H.p.r.pas > 55);
    const spd = lob ? sp * 0.62 : sp;
    const Tf = clamp(hyp(tx - x0, ty - y0) / spd, alley ? 0.6 : 0.12, 2.2), zt = alley ? M.reach + M.vertFt * 0.85 : lob ? 6.8 : 4.4;
    B.mode = "pass"; B.holder = null; B.x = x0; B.y = y0; B.z = z0; B.t = 0;
    B.vx = (tx - x0) / Tf; B.vy = (ty - y0) / Tf; B.vz = (zt - z0 + 0.5 * GRAV * Tf * Tf) / Tf;
    B.pass = { from: H, to: M, T: Tf, tx, ty, tried: new Set(), alley: !!alley }; B.lastTouch = H.t; G.lastRel = G.tick;
    G.lastHandler = H;
    dbg(alley ? "pass:alley" : lob ? "pass:lob" : "pass"); if (G.inbound) dbg("pass:inb");
    if (alley) { const tApex = Math.sqrt(2 * M.vertFt / GRAV); M.lob = { at: G.tick + Math.max(0, Math.round((Tf - tApex * 0.8) / DT)) }; }
  }
  // what kind of play produced this shot (for the play-by-play and the strategy report)
  function playType(H, kind, d) {
    if (H.alley) return "lob";
    if (G.putback && G.putback.P === H && G.tick - G.putback.tk < 45 && d < 9) return "putback";
    if (G.trans[H.t] > G.tick - 40 && G.tick - G.possStart < 160) return "trans";
    if (G.tick - (H.postEnd || -1e9) < 30) return "post";
    if (H.ctx && G.tick - H.ctxT < 50 && H.holdT < 1.6) return H.ctx;
    if (G.tick - H.pnrT < 70) return "pnr";
    if (G.tick - H.isoT < 120) return "iso";
    if (kind === "finish") return "drive";
    if (G.lastPass && G.lastPass.to === H && H.holdT < 1.2) return "spot";
    return "pullup";
  }
  function shoot(H, kind) {
    const h = hoopOf(H.t); const d = hyp(H.x - h.x, H.y - h.y); const val = shotValue(H.x, H.y, h.side, FOUR);
    let cd = 99, cD = null;
    for (const D of G.lineup[1 - H.t]) { if (D.st === "down") continue; const dd = dist(D, H); if (dd < cd) { cd = dd; cD = D; } }
    const p = makeProb(H, val, d, cd, cD) * (H.alley ? 1.04 : 1);
    H.fga++; if (val === 4) H.fpa++;
    const made = rng.next() < p;
    const dunk = (d < 5.5 || H.alley) && kind === "finish" && canDunk(H) && H.finishType !== "layup";
    const layup = d < 5.5 && !dunk;
    const hook = !dunk && !layup && G.tick - (H.postEnd || -1e9) < 3 && d < 12;
    const pt = playType(H, kind, d);
    doJump(H, dunk ? 1 : layup ? 0.8 : 0.4, dunk ? "dunk" : layup ? "layup" : "shoot");
    let x0 = H.x, y0 = H.y, z0 = H.reach * 0.97 + H.vertFt * (layup ? 0.45 : 0.25);
    if (dunk) { const dd = Math.max(d, 0.1); x0 = h.x + (H.x - h.x) / dd * 1.8; y0 = h.y + (H.y - h.y) / dd * 1.8; z0 = 10.8; }
    let tx = h.x, ty = h.y;
    if (!made) { const a = rng.range(0, 6.283), off = rng.range(0.55, 1.1); tx += dcos(a) * off; ty += dsin(a) * off; }
    const Tf = dunk ? 0.2 : layup ? 0.5 : 0.55 + d * 0.026;
    B.mode = "shot"; B.holder = null; B.x = x0; B.y = y0; B.z = z0; B.t = 0;
    B.vx = (tx - x0) / Tf; B.vy = (ty - y0) / Tf; B.vz = (10.15 - z0 + 0.5 * GRAV * Tf * Tf) / Tf;
    const ast = (G.lastPass && G.lastPass.to === H && G.tick - G.lastPass.tick < 80) ? G.lastPass.from : null;
    const set = G.play && G.play.set !== "flow" && G.tick - G.play.tk0 < 220 ? G.play.set : undefined;
    const covK = G.lastCov && G.lastCov.poss === G.possN && G.tick - G.lastCov.tk < 80 ? G.lastCov.kind : undefined;
    B.shot = { P: H, team: H.t, val, made, d, dunk, layup, hook, T: Tf, ast, touched: new Set(), foul: null, flag: 0, hoop: h, rel: G.tick, sx: H.x, sy: H.y, pt, set, cov: covK }; G.lastRel = G.tick;
    H.post = null; H.pnr = null; H.iso = null; H.alley = false;
    B.lastTouch = H.t; G.shotRun = false; G.lastPass = null; G.lastHandler = H; G.putback = null;
    // contact foul on the shot (hitting a shooter is a foul; this is not a tackle)
    if (cD && cd < 3 && !B.shot.foul) {
      const fp = (d < 6 ? 0.2 : 0.08) * (1.25 - cD.p.r.iq / 99 * 0.5);
      if (rng.chance(fp)) {
        cD.fouls++; G.tf[cD.t]++;
        ev("foul", { pid: cD.idx, team: cD.t, on: H.idx, kind: "shooting", pf: cD.fouls });
        if (cD.fouls >= 6) ev("fouledout", { pid: cD.idx, team: cD.t });
        B.shot.foul = { by: cD, on: H };
        if (rng.chance(0.5)) { B.shot.made = rng.chance(0.25); }
      }
    }
    // defensive reactions: contests, swats (legal on 2s, even on the way down), and the goalie
    const dp = DP[1 - H.t];
    for (const D of G.lineup[1 - H.t]) {
      if (D.st !== "ok" || D.air) continue;
      const dd = dist(D, H), dh = hyp(D.x - h.x, D.y - h.y);
      const area = dp.hit === "disciplined" || dp.scheme === "zone";
      if (dd < (area ? 6.5 : 5.5) && rng.chance(area ? 0.75 : 0.6)) { D.contestAt = G.tick + rng.int(0, 2); continue; }
      let want = false;
      if (val === 2 && !dunk && dh < 10) want = rng.chance((0.3 + D.p.r.rim / 99 * 0.6) * (dp.goalieP === D ? 1.25 : 1));
      else if (val >= 3 && dh < 6) want = rng.chance(0.06 * (1 - D.p.r.iq / 99)); // the mistake: goaltend risk
      if (want) {
        const tApex = Math.sqrt(2 * D.vertFt / GRAV);
        const dd2 = Math.max(d, 0.1);
        D.swat = { at: G.tick + Math.max(0, Math.round((Tf - tApex - 0.03) / DT)), x: h.x + (H.x - h.x) / dd2 * 1.5, y: h.y + (H.y - h.y) / dd2 * 1.5 };
      }
    }
    // the shooting team: crashers hit the glass, the rest get back; the defense boxes out (or leaks out)
    for (const M of G.lineup[H.t]) {
      if (M === H || M.st !== "ok") continue;
      if (M.crash) M.crashT = Tf + 0.4; else if (hyp(M.x - h.x, M.y - h.y) > 13) M.backT = Tf + 0.9;
    }
    const dpl = PL[1 - H.t];
    if (dpl.leak && G.per <= 4 && !(G.per === 4 && G.clock < 60)) {
      const Lk = best(G.lineup[1 - H.t].filter(D => D.st === "ok" && D.contestAt < 0 && !D.swat && hyp(D.x - h.x, D.y - h.y) > 12 && D !== G.rimProt[D.t]), D => D.pf.lob + D.p.r.spd);
      if (Lk && rng.chance(clamp(0.45 + dpl.pace * 0.35, 0.1, 0.9))) Lk.leakT = Tf + 1.6;
    }
    for (const D of G.lineup[1 - H.t]) if (D.st === "ok" && D.contestAt < 0 && !D.swat && D.leakT <= 0) D.boxT = Tf + 0.35;
    for (const M of G.lineup[H.t]) { M.screen = null; M.curl = null; M.waitScreen = false; M.cutT = 0; }
  }
  function rimBounce(h, sx, sy) {
    const base = datan2(sy - h.y, sx - h.x);
    const a = base + rng.normal(0, 0.9), sp = rng.range(4, 12);
    B.mode = "loose"; B.x = h.x + dcos(a) * 0.8; B.y = h.y + dsin(a) * 0.8; B.z = 10.2;
    B.vx = dcos(a) * sp; B.vy = dsin(a) * sp; B.vz = rng.range(5, 11); G.looseT = 0;
  }
  // the shot is in the book: log it, then let it warm (or cool) the shooter
  function shotDone(S, extra) {
    const e = fgaEv(S, extra), P = S.P; ev("fga", e);
    const h0 = heatNow(P); P.heat = clamp(h0 + (e.made ? (e.val >= 3 ? 1.15 : 0.8) : -0.6), -3, 4); P.heatTk = G.tick;
    if (P.streak > 0.35) {
      const ev1 = P.evTk || (P.evTk = [-1e9, -1e9, -1e9, -1e9]);
      if (h0 < 2.8 && P.heat >= 2.8 && G.tick - ev1[2] > 9600) { ev1[2] = G.tick; ev("heat", { pid: P.idx, team: P.t, lvl: 1 }); }
      else if (h0 > -2.2 && P.heat <= -2.2 && G.tick - ev1[3] > 9600) { ev1[3] = G.tick; ev("heat", { pid: P.idx, team: P.t, lvl: -1 }); }
    }
  }
  function fgaEv(S, extra) {
    return Object.assign({ pid: S.P.idx, team: S.team, val: S.val, made: S.made, d: Math.round(S.d), dunk: S.dunk, layup: S.layup, hook: S.hook || undefined, ast: S.made && S.ast ? S.ast.idx : -1, pt: S.pt, set: S.set, cov: S.cov }, extra || {});
  }
  function shotArrive() {
    const S = B.shot, P = S.P;
    if (S.made) {
      score(S.team, S.val);
      shotDone(S);
      if (S.dunk || S.val >= 3 || S.foul) P.celebT = 1.4;
      B.mode = "dead"; B.x = S.hoop.x; B.y = S.hoop.y; B.z = 9.6; B.vx = 0; B.vy = 0; B.vz = -6;
      afterScore(S, true);
    } else {
      shotDone(S);
      if (S.flag) { B.shot = null; startFT(shooterFor(P), 2, "flagrant", true); return; }
      if (S.foul) { const n = S.val; B.shot = null; startFT(shooterFor(S.foul.on), n, "shooting"); return; }
      rimBounce(S.hoop, S.sx, S.sy); G.reboundable = true; G.lastShotTeam = S.team; B.shot = null;
    }
  }
  function afterScore(S, made) {
    const last2 = G.per >= 4 && G.clock <= 120;
    if (S.flag) { B.shot = null; startFT(shooterFor(S.P), 2, "flagrant", true); return; }
    if (S.foul) { B.shot = null; startFT(shooterFor(S.foul.on), 1, "and1"); return; }
    B.shot = null;
    deadInbound(1 - S.team, baselineSpot(1 - S.team), { wait: 1.1, kind: "make", keepClock: !last2, resetShot: true });
  }

  // ---- defense ----
  // the dribble: the ball is only in his hand at the top of each bounce (a hit while it's on the floor pops it loose)
  function dribbling(H) { return B.mode === "held" && B.holder === H && !H.gather && !H.air && !G.inbound && H.holdT > 0.35; }
  function dribTop(H) { return Math.abs(dsin(G.tick * 0.42 + H.idx)) > 0.55; }
  // how the tackler goes in: a sure wrap-up, a big shoulder hit (strips it, but gets broken and hurts people), or a dive at the legs
  function pickTech(D, H) {
    const mk = G.mark[D.t]; if (mk && mk.E === D && mk.on === H) return "hit"; // the enforcer isn't wrapping anybody up
    const aggr = D.p.aggr, disc = TAC[D.t].disc;
    const w = 1 + disc * 0.8 + (D.darch === "LCK" || D.darch === "HWK" ? 0.4 : 0) - aggr * 0.4;
    const x = (0.3 + aggr * 1.1 + (D.darch === "HIT" ? 0.7 : 0) + (G.desp[D.t] ? 0.6 : 0) + (DP[D.t].hit === "blitz" ? 0.3 : 0) - disc * 0.3
      + Math.max(0, moodNow(D)) * 0.8 + grudgeW(D, H) * 1.2 + G.riv * 0.3) * (RULES.target ? 0.6 : 1); // the targeting rule tamed the big hit
    const v = 0.35 + (H.p.r.spd > D.p.r.spd + 6 ? 0.5 : 0) + (H.driving ? 0.2 : 0);
    const q = rng.next() * (w + x + v);
    return q < w ? "wrap" : q < w + x ? "hit" : "dive";
  }
  // the ball handler's answer: a juke (early read), a spin, a stiff-arm (free hand), or a hurdle over a diving tackler
  function moveChance(m, H, D, tech) {
    const r = H.p.r, d = D.p.r;
    if (m === "juke") return clamp(0.11 + ((r.iq * 0.3 + r.acc * 0.4 + r.spd * 0.3) - (d.iq * 0.5 + d.acc * 0.5)) * 0.005 - (tech === "dive" ? 0.03 : 0), 0.02, 0.35);
    if (m === "spin") return clamp(0.07 + ((r.acc * 0.4 + r.brk * 0.4 + r.sec * 0.2) - d.tck * 0.8) * 0.005 + (tech === "hit" ? 0.04 : 0), 0.02, 0.32);
    if (m === "stiff") return clamp(0.09 + (r.str - d.str) * 0.006 + (H.p.wt - D.p.wt) * 0.002 + r.brk * 0.0015 - (tech === "dive" ? 0.06 : 0), 0.01, 0.4);
    if (m === "hurdle") return tech === "dive" ? clamp(0.24 + ((r.vert + r.bnc) / 2 - 55) * 0.008 + (r.spd - 55) * 0.002, 0.06, 0.6) : 0.02;
    return 0;
  }
  const MOVE_TASTE = { DOZ: { stiff: 3, spin: 1 }, SLA: { hurdle: 4, spin: 2, juke: 1 }, RUN: { hurdle: 4, spin: 1, stiff: 1 }, GEN: { juke: 3, spin: 1, hurdle: 1 }, CRE: { juke: 2, spin: 2, hurdle: 1 }, PST: { stiff: 2, spin: 1 } };
  function pickMove(H, D, tech) {
    if (!rng.chance((tech === "dive" ? 0.45 : 0.32) + H.p.r.iq * 0.004)) return null; // some see it coming; most just absorb it
    const taste = MOVE_TASTE[H.arch] || { spin: 1, juke: 1, stiff: 0.5 };
    let bm = null, bv = 0;
    for (const m in MOVES) { const v = (taste[m] || (m === "hurdle" ? 1.2 : 0.3)) * moveChance(m, H, D, tech) * (0.8 + rng.next() * 0.4); if (v > bv) { bv = v; bm = m; } }
    return bm;
  }
  function tackleCheck(D, H, trap) {
    if (G.inbound || H.st === "down" || D.st !== "ok" || D.air || G.phase !== "live") return;
    if ((G.tick + D.idx) % 4) return;
    const dp = DP[D.t], d = dist(D, H); if (d > (dp.hit === "blitz" || G.desp[D.t] ? 5 : 4.2)) return;
    const r = D.p.r, h = hoopOf(H.t), dh = hyp(H.x - h.x, H.y - h.y), back = dh > 47;
    // where this defense hits: the gameplan's tackle policy (hotheads freelance)
    let zone;
    if (G.desp[D.t]) zone = back ? 1.6 : 2.2;
    else if (dp.hit === "blitz") zone = back ? (TAC[D.t].tackle >= 1.15 ? 0.8 : 0.15) : 1.8;
    else if (dp.hit === "contain") zone = back ? 0.05 : (H.driving || dh < 14) ? 1.75 : 0.8;
    else zone = back ? 0 : (H.driving && dh < 12) ? 1.05 : 0.3;
    const free = (1 - D.comp) * D.p.aggr;
    zone = zone * (1 - free) + 1.3 * free;
    if (trap) zone = Math.max(zone, 1.7);
    let p = (0.0019 + r.tck * 0.000034 + D.p.aggr * 0.002) * TAC[D.t].tackle * zone * (dp.hitman === D ? 1.35 : 1);
    if (H.driving) p *= 1.8;
    if (dp.scout && dp.scout.hit.has(H.idx)) p *= 1.35; // scouted: careless with the ball
    const read = r.iq / 99; // time it: hit him on the catch, or when the dribble is in his hand
    if (!H.gather && !H.air) { if (H.holdT < 0.35) p *= 1 + read * 0.7; else if (!dribTop(H)) p *= 1 - read * 0.35; }
    if (H.gather) { const read = r.iq / 99; if (H.action !== "pass" && H.gatherT < 0.3) p *= (1 - read) * 0.55 + 0.04; else p *= 1.4; } // don't hit a man about to leave the floor
    if (H.air) p *= (1 - r.iq / 99) * 0.25; // airborne players are protected: only a fool hits one
    if (D.fouls >= 4) p *= 0.35; if (D.fouls >= 5) p *= 0.4;
    if (G.tf[D.t] >= 5) p *= 1 - 0.35 * TAC[D.t].disc; // late hits are free throws now
    if (G.per >= 4 && G.clock < 120 && G.score[D.t] > G.score[H.t]) p *= 0.6; // protecting a lead: don't gamble
    p *= 1 + G.riv * 0.15 + grudgeW(D, H) * 0.6 + Math.max(0, moodNow(D)) * 0.3 + (heatNow(H) >= 2.5 && H.streak > 0.3 ? 0.15 : 0); // bad blood, a fired-up hitter, a shooter who's heating up
    const mk = G.mark[D.t]; if (mk && mk.E === D && mk.on === H && G.tick < mk.until) p *= 2.2; // the enforcer is hunting him
    let piling = 0; for (const O of G.lineup[D.t]) if (O !== D && O.st === "lunge" && O.lunge && O.lunge.H === H) piling++;
    if (piling) p = Math.max(p * 3, 0.15); // pile on
    if (piling >= 2 && RULES.gang && rng.chance(0.75 + 0.25 * D.comp)) return; // two's the limit now
    if (rng.chance(p)) {
      const tech = pickTech(D, H);
      D.st = "lunge"; D.stT = 0.32; D.lunge = { H, ck: false, tech, move: null }; D.energy = Math.max(0.05, D.energy - 0.014); // hitting people is exhausting
      // handler sees it coming: quick-release pass (if it gets away first, the hit becomes a late-hit foul), or a move
      if (!H.gather && B.holder === H) {
        const react = Math.max(0, -moodNow(H)) * 0.15 + 0.1 + H.p.r.iq * 0.0022 + H.p.r.pas * 0.0014 - (H.arch === "DOZ" ? 0.08 : 0) + (PL[H.t].sys === "motion" ? 0.18 * H.comp : 0) + (!H.driving && dh > 16 ? 0.08 : 0);
        if (rng.chance(react)) {
          let bm = null, br = 1e9;
          for (const M of G.lineup[H.t]) { if (M === H || M.st === "down") continue; const rr = laneRisk(H, M); if (rr < br) { br = rr; bm = M; } }
          if (bm) { beginAction(H, "pass", bm); H.gatherT = 0.12; H.passLob = false; }
        } else { const mv = pickMove(H, D, tech); if (mv) { D.lunge.move = mv; H.move = mv; H.moveT = 0.55; } }
      }
    }
  }
  // dirty hit? from behind, a hothead's big hit, a late or airborne hit, bad blood
  function flagrantCheck(D, H, tech, air, late) {
    const sp = hyp(H.vx, H.vy), dd = dist(D, H) || 1, mk = G.mark[D.t];
    const behind = sp > 4 && ((D.x - H.x) * H.vx + (D.y - H.y) * H.vy) / (sp * dd) < -0.55;
    const dirty = (D.p.aggr - 0.45) * 1.4 + (1 - D.comp) * 0.6 + (tech === "hit" ? 0.5 : 0) + (behind ? 0.7 : 0) + (air ? 0.9 : 0) + (late ? 0.4 : 0)
      + (mk && mk.E === D && mk.on === H ? 0.8 : 0) + G.riv * 0.2 + grudgeW(D, H) * 0.4 + Math.max(0, moodNow(D)) * 0.4;
    if (!RULES.flag) return { lvl: 0, dirty }; // before 1969 there's no such thing: a cheap shot is just a hit (or a foul, if it's late)
    const home = D.t === 0 ? 1 - REF.h * 4 : 1 + REF.h * 4; // the crew leans (a little) toward the home team
    if (dirty <= 0.3 || !rng.chance(clamp((dirty - 0.3) * FLAG_RATE * (0.55 + 0.9 * REF.s) * home, 0, 0.14))) return { lvl: 0, dirty };
    return { lvl: rng.chance((0.04 + Math.max(0, dirty - 1.4) * 0.15) * (0.7 + 0.6 * REF.s)) ? 2 : 1, dirty };
  }
  // a hit to the head: legal (and the main cause of concussions) until the 2011 targeting rule
  function highHit(D, H) { return rng.chance((0.07 + D.p.aggr * 0.1 + Math.max(0, D.p.ht - H.p.ht) * 0.004 + (1 - D.comp) * 0.05) * (RULES.target ? 0.012 : 1) * (RULES.gear ? 0.8 : 1)); }
  // hard hits hurt people: out for the night at least (the league decides how many games after that)
  function injuryCheck(P, tech, n, hard, mult, high, by) {
    const p = INJ_RATE * (tech === "hit" ? 2.6 : tech === "dive" ? 1.2 : 0.7) * (1 + (n - 1) * 0.5) * (hard ? 2.5 : 1) * (mult || 1) * (1.15 - P.p.r.str / 200)
      * (RULES.gear ? 0.62 : 1) * (1 + (1 - P.energy) * 0.8) * (high ? 1.6 : 1); // helmets and pads; tired legs
    if (P.out || !rng.chance(p)) return false;
    const w = (tech === "hit" ? [36, 18, 12, 16, 8, 4.5, 2.5, 0.6] : tech === "dive" ? [36, 12, 24, 4, 14, 2.5, 3, 1.2] : [40, 18, 18, 5, 12, 2.5, 2, 0.4]).slice();
    w[3] *= (1 + 0.45 * P.conc) * (RULES.gear ? 0.4 : 1) * (high ? 4 : 1); // every concussion makes the next one likelier
    let tot = 0; for (const x of w) tot += x;
    let x = rng.next() * tot, k = 0; for (; k < w.length - 1; k++) { x -= w[k]; if (x <= 0) break; }
    P.hurt = { k }; P.out = true; P.st = "down"; P.stT = 3.5;
    ev("injury", { pid: P.idx, team: P.t, kind: INJURIES[k][0], sev: INJURIES[k][1], k, by: by ? by.idx : undefined, high: high || undefined });
    if (G.injWhistle < 0) G.injWhistle = G.tick + 30;
    return true;
  }
  // what a hit leaves behind: a rattled (or angry) ball handler, an enforcer with a score to settle, sometimes a fight
  function aftermath(D, H, kind, dirty) {
    const size = kind === "flagrant" || kind === "targeting" ? 0.7 : kind === "big" ? 0.5 : kind === "rough" || kind === "late" || kind === "pileon" ? 0.35 : 0.2;
    jolt(H, size);
    // a hit a hair late is usually an accident; it's a cheap shot when it was dirty
    const cheap = kind === "flagrant" || kind === "targeting" || kind === "rough" || dirty >= 1.2 || ((kind === "late" || kind === "pileon") && dirty >= 1.0);
    if (cheap) for (const Q of G.lineup[H.t]) if (Q !== H) setMood(Q, moodNow(Q) + 0.2 * Q.temper); // you don't do that to our guy
    const mk = G.mark[D.t];
    if (mk && mk.E === D && mk.on === H) { G.mark[D.t] = null; return fightCheck(H, D, "retaliation", 1.3) ? true : false; } // the message is delivered; does he answer?
    const star = H.use >= 1.4 || H.p.ovr >= 76, grudge = grudgeW(H, D) + grudgeW(D, H);
    if (!cheap && !(kind === "big" && star) && grudge < 0.3) return false;
    const E = enforcerFor(H.t, D), A = !H.out && H.st !== "down" ? H : null;
    const k = (kind === "flagrant" || kind === "targeting" ? 1 : dirty >= 1.2 ? 0.8 : kind === "rough" ? 0.5 : kind === "big" ? 0.2 : 0.15) * (star ? 1.4 : 1) + grudge * 0.6;
    const who = E && (!A || E.temper > A.temper) ? E : A || E;
    if (who && fightCheck(who, D, kind, k)) return true;
    if (E && !G.mark[H.t] && cheap && E.temper >= 0.45 && rng.chance(0.04 + E.temper * 0.14 + (star ? 0.1 : 0))) { G.mark[H.t] = { E, on: D, until: G.tick + 14400 }; ev("enforcer", { pid: E.idx, team: E.t, on: D.idx, for: H.idx }); }
    return false;
  }
  // the man who answers cheap shots: mean, strong, and not afraid of a suspension
  function enforcerFor(t, D) {
    let bE = null, bv = 0.78;
    for (const Q of G.lineup[t]) { if (Q.out || Q.st === "down") continue; const v = Q.temper * 0.5 + Q.p.aggr * 0.3 + Q.p.r.tck / 99 * 0.3 + Q.p.r.str / 99 * 0.3 + (Q.darch === "HIT" ? 0.3 : 0); if (v > bv) { bv = v; bE = Q; } }
    return bE;
  }
  // will it come to blows? (only at a dead ball)
  function fightCheck(A, Bp, why, k) {
    if (G.fight || A.out || Bp.out || !A.on || !Bp.on || A.t === Bp.t || (G.phase !== "dead" && G.phase !== "ft")) return false;
    const heat = (A.temper * 0.65 + Bp.temper * 0.35 - 0.3) * 2.2 + Math.max(0, moodNow(A)) * 0.8;
    const p = (RULES.fightBan ? FIGHT_RATE * 0.3 : FIGHT_RATE) * k * clamp(heat, 0.05, 2.2) * (1 + G.riv * 0.5) * (1 + (grudgeW(A, Bp) + grudgeW(Bp, A)) * 0.8) * (1.25 - REF.s * 0.5);
    if (!rng.chance(clamp(p, 0, 0.7))) return false;
    startFight(A, Bp, why); return true;
  }
  function startFight(A, Bp, why) {
    const brawl = rng.chance((RULES.fightBan ? 0.07 : 0.18) * (1 + G.riv * 0.5) * (1.25 - REF.s * 0.5)), join = [];
    if (brawl) { for (const P of onC()) if (P !== A && P !== Bp && !P.out) join.push(P); } // everybody's in it
    else for (const t of [A.t, Bp.t]) { // a teammate or two come to pull them apart (or get a shot in)
      const near = G.lineup[t].filter(P => P !== A && P !== Bp && !P.out && P.st !== "down").sort((p, q) => dist(p, A) - dist(q, A)).slice(0, rng.chance(0.4) ? 2 : 1);
      for (const P of near) join.push(P);
    }
    const sep = 3.2 + (1 - REF.s) * 1.8 + (brawl ? 2.5 : 0); // seconds until the refs get them apart (strict crews are quicker)
    G.fight = { A, B: Bp, x: (A.x + Bp.x) / 2, y: (A.y + Bp.y) / 2, t0: G.tick, sepT: Math.round(sep / DT), endT: Math.round((sep + 1.6) / DT), brawl, join, clock: G.clockRun };
    G.clockRun = false; A.fightRole = "fight"; Bp.fightRole = "fight"; for (const P of join) P.fightRole = "hold";
    G.fights++;
    ev("fight", { pid: A.idx, team: A.t, on: Bp.idx, why, brawl, join: join.map(P => P.idx) });
  }
  // the fight plays out (the dead ball or free throws wait), then the fighters are tossed
  function fightStep() {
    const F = G.fight, t = G.tick - F.t0, apart = t >= F.sepT;
    for (const P of [F.A, F.B]) {
      const dx = P.x - F.x, dy = P.y - F.y, L = hyp(dx, dy) || 1;
      if (P.st === "down" && P.stT < 0.3) P.st = "ok";
      P.tx = F.x + dx / L * (apart ? 7 : 1.1); P.ty = F.y + dy / L * (apart ? 7 : 1.1); P.urg = apart ? 0.5 : 1;
    }
    for (const P of F.join) { const dx = P.x - F.x, dy = P.y - F.y, L = hyp(dx, dy) || 1, rr = apart ? 6.5 : 2.8 + (P.idx % 3) * 1.5; P.tx = F.x + dx / L * rr; P.ty = F.y + dy / L * rr; P.urg = 0.9; } // a ring of shoving, not one pile
    if (t < F.endT) return;
    G.fight = null; G.clockRun = F.clock;
    for (const P of F.join) P.fightRole = null;
    for (const P of [F.A, F.B]) { P.fightRole = null; P.out = true; P.fightOut = true; P.st = "ok"; ev("ejected", { pid: P.idx, team: P.t, why: "fight" }); }
    for (const tt of [0, 1]) if (G.lineup[tt].some(P => P.out && !(P.hurt && P.st === "down"))) doSubs(tt, null, true);
    // whoever was set to inbound or shoot may be gone now
    if (G.phase === "dead" && G.dead) {
      const D0 = G.dead, L = G.lineup[D0.t];
      if (!D0.inb.on || D0.inb.out) D0.inb = L.find(Q => Q !== D0.recv && !Q.out && Q.st !== "down") || L[0];
      if (D0.recv && (!D0.recv.on || D0.recv.out)) D0.recv = L.find(Q => Q !== D0.inb && !Q.out) || L[1];
      D0.timer = Math.max(D0.timer, 1.2);
    }
    if (G.phase === "ft" && G.ftS && (!G.ftS.P.on || G.ftS.P.out)) G.ftS.P = best(G.lineup[G.ftS.P.t].filter(Q => !Q.out), Q => Q.p.r.ft) || G.lineup[G.ftS.P.t][0];
  }
  // who shoots when the fouled man is hurt: the coach sends his best free-throw shooter
  function shooterFor(P) { return P.out ? best(G.lineup[P.t].filter(Q => Q !== P && !Q.out), Q => Q.p.r.ft) || P : P; }
  function flagrant(D, H, lvl, gIdx, tech, targeting, dirty) {
    D.fouls++; G.tf[D.t]++;
    H.st = "down"; H.stT = 1.6; H.gather = false; H.driving = false; D.st = "down"; D.stT = 0.8;
    ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "flagrant", lvl, tech, gang: gIdx, targeting: targeting || undefined });
    ev("foul", { pid: D.idx, team: D.t, on: H.idx, kind: "flagrant", lvl, pf: D.fouls, targeting: targeting || undefined });
    injuryCheck(H, tech, 1, false, 3, targeting, D);
    if (lvl === 2) { D.out = true; ev("ejected", { pid: D.idx, team: D.t, why: targeting ? "targeting" : "flagrant" }); }
    else if (D.fouls >= 6) ev("fouledout", { pid: D.idx, team: D.t });
    if (B.mode === "shot" && B.shot.P === H) { B.shot.flag = lvl; aftermath(D, H, targeting ? "targeting" : "flagrant", dirty || 1.5); return; } // the shot plays out, then two shots and the ball
    B.mode = "dead"; B.holder = null; B.pass = null; B.vx *= 0.2; B.vy *= 0.2;
    startFT(shooterFor(H), 2, "flagrant", true);
    aftermath(D, H, targeting ? "targeting" : "flagrant", dirty || 1.5);
  }
  function popLoose(H, D, gIdx, extra) { // the ball comes out and it's live
    ev("tackle", Object.assign({ pid: D.idx, team: D.t, on: H.idx, result: "fumble", gang: gIdx }, extra));
    const a = rng.range(0, 6.283), sp = rng.range(5, 12);
    B.mode = "loose"; B.holder = null; B.x = H.x; B.y = H.y; B.z = extra && extra.drib ? 1.2 : 2.5; B.vx = dcos(a) * sp; B.vy = dsin(a) * sp; B.vz = rng.range(3, 7);
    B.lastTouch = H.t; G.reboundable = false; G.looseT = 0; G.fumble = { t: H.t, P: H, by: D }; G.lastHandler = H; G.deflector = null;
  }
  function resolveTackle(D, H) {
    const L0 = D.lunge || {}, tech = L0.tech || "wrap", move = L0.move;
    // everyone already flying at him piles on (gang tackles are legal; from 1998, only two of them)
    const gang = [D];
    for (const O of G.lineup[D.t]) if (O !== D && O.st === "lunge" && O.lunge && O.lunge.H === H && dist(O, H) < 3.2) gang.push(O);
    for (const O of gang) { O.lunge = null; O.st = "ok"; }
    const gIdx = gang.length > 1 ? gang.slice(1).map(O => O.idx) : undefined;
    const hasBall = B.mode === "held" && B.holder === H;
    const fc = flagrantCheck(D, H, tech, H.air, !hasBall && !H.air), dirty = fc.dirty;
    if (fc.lvl) { flagrant(D, H, fc.lvl, gIdx, tech, false, dirty); return; }
    if (H.air) { // roughing: airborne players are protected
      D.fouls++; G.tf[D.t]++;
      H.st = "down"; H.stT = 1.0; H.gather = false; for (const O of gang) { O.st = "down"; O.stT = 0.8; }
      ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "rough", tech, gang: gIdx });
      ev("foul", { pid: D.idx, team: D.t, on: H.idx, kind: "roughing", pf: D.fouls });
      if (D.fouls >= 6) ev("fouledout", { pid: D.idx, team: D.t });
      injuryCheck(H, tech, gang.length, true, 1 + Math.max(0, dirty - 0.8) * 0.5, false, D);
      if (B.mode === "shot" && B.shot.P === H) { if (!B.shot.foul) B.shot.foul = { by: D, on: H }; aftermath(D, H, "rough", dirty); return; }
      B.mode = "dead"; B.holder = null; B.pass = null; B.vx *= 0.2; B.vy *= 0.2;
      startFT(shooterFor(H), 2, "roughing");
      aftermath(D, H, "rough", dirty);
      return;
    }
    if (!hasBall) {
      // a hair late: some crews let it go (and they lean toward the home team)
      const since = G.tick - (G.lastRel === undefined ? -1e9 : G.lastRel);
      const noCall = since <= 8 ? clamp((1.04 - REF.w) * 2.0 + (D.t === 0 ? REF.h * 6 : -REF.h * 6), 0, 0.4) : 0;
      if (noCall > 0 && rng.chance(noCall)) {
        H.st = "down"; H.stT = 1.1; H.gather = false; for (const O of gang) { O.st = "down"; O.stT = 0.8; }
        ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "nocall", tech, gang: gIdx });
        injuryCheck(H, tech, gang.length, false, 0.8, false, D); jolt(H, 0.3);
        return;
      }
      const shotFoul = B.mode === "shot" && B.shot.P === H && G.tick - B.shot.rel < 16;
      D.fouls++; G.tf[D.t]++;
      H.st = "down"; H.stT = 1.1; H.gather = false; for (const O of gang) { O.st = "down"; O.stT = 0.8; }
      ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "late", tech, gang: gIdx });
      ev("foul", { pid: D.idx, team: D.t, on: H.idx, kind: shotFoul ? "shooting" : "late", pf: D.fouls });
      if (D.fouls >= 6) ev("fouledout", { pid: D.idx, team: D.t });
      injuryCheck(H, tech, gang.length, false, 0.8 * (1 + Math.max(0, dirty - 0.8) * 0.5), false, D);
      if (shotFoul) { if (!B.shot.foul) B.shot.foul = { by: D, on: H }; aftermath(D, H, "late", dirty); return; }
      B.mode = "dead"; B.pass = null; B.vx *= 0.2; B.vy *= 0.2;
      if (G.tf[D.t] >= 5) startFT(shooterFor(H), 2, "bonus");
      else deadInbound(H.t, sidelineSpot(H.x, H.y), { wait: 1.6, kind: "foul", keepShot: 14 });
      aftermath(D, H, "late", dirty);
      return;
    }
    // a third man piling on (from 1998): the hit stands, but it's a foul and they keep the ball
    if (RULES.gang && gang.length > 2) {
      const X = gang[2]; X.fouls++; G.tf[X.t]++;
      H.st = "down"; H.stT = 1.3; H.gather = false; H.driving = false; H.action = null; for (const O of gang) { O.st = "down"; O.stT = 0.8; }
      ev("tackle", { pid: X.idx, team: X.t, on: H.idx, result: "pileon", tech, gang: gIdx });
      ev("foul", { pid: X.idx, team: X.t, on: H.idx, kind: "pileon", pf: X.fouls });
      if (X.fouls >= 6) ev("fouledout", { pid: X.idx, team: X.t });
      injuryCheck(H, tech, gang.length, false, 1, false, D);
      B.mode = "dead"; B.holder = null; B.pass = null; B.vx *= 0.2; B.vy *= 0.2;
      if (G.tf[X.t] >= 5) startFT(shooterFor(H), 2, "bonus"); else deadInbound(H.t, sidelineSpot(H.x, H.y), { wait: 1.6, kind: "foul", keepShot: 14 });
      aftermath(X, H, "pileon", dirty);
      return;
    }
    // a hit to the head: from 2011, that's targeting
    const high = tech === "hit" && highHit(D, H);
    if (high && RULES.target) { flagrant(D, H, 2, gIdx, tech, true, dirty); return; }
    // his move
    let failedHurdle = false;
    if (move) {
      if (rng.chance(moveChance(move, H, D, tech) * (gang.length > 1 ? 0.6 : 1))) {
        if (move === "hurdle") doJump(H, 0.5, "hurdle"); // up and over: and now he's airborne, so he's protected
        for (const O of gang) { O.st = "down"; O.stT = move === "stiff" ? 1.5 : 1.2; }
        H.move = move; H.moveT = 0.6;
        if (!H.gather) { H.driving = true; H.decT = 0.35; H.iso = null; H.post = null; }
        ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: move === "juke" || move === "hurdle" ? "whiff" : "broken", move, tech, gang: gIdx });
        if (move === "stiff") jolt(D, 0.3); // getting stiff-armed into the floor gets to you
        return;
      }
      if (move === "hurdle") failedHurdle = true; // jumped into him, or mistimed it: he goes down hard
    }
    const inHand = !dribbling(H) || dribTop(H) || rng.chance(0.3 + D.p.r.iq / 99 * 0.3);
    const rH = H.p.r, hh = hoopOf(H.t); let p = 0;
    const openField = !H.driving && hyp(H.x - hh.x, H.y - hh.y) > 16; // he's facing up with room: harder to bring down
    for (let i = 0; i < gang.length; i++) {
      const T = gang[i], rD = T.p.r;
      const q = clamp(0.56 + (rD.tck - rH.brk) * 0.0055 + (T.p.wt - H.p.wt) * 0.0018 + (rD.str - rH.str) * 0.002 - (openField ? 0.12 : 0) + TECH_Q[tech], 0.15, 0.9);
      p = i === 0 ? q : p + (1 - p) * q * 0.65;
    }
    if (failedHurdle) p = Math.max(p, 0.85);
    if (rng.chance(clamp(p, 0.18, 0.96))) {
      H.st = "down"; H.stT = 1.5; H.gather = false; H.driving = false; H.action = null; H.iso = null; H.post = null; H.pnr = null;
      for (const O of gang) { O.st = "down"; O.stT = 0.7; } D.celebT = 2.0;
      const dm = 1 + Math.max(0, dirty - 0.8) * 0.5; // (a cheap shot nobody called still hurts)
      const hurt = () => { injuryCheck(H, tech, gang.length, failedHurdle, dm, high, D); if (tech === "hit") injuryCheck(D, "hit", 1, false, 0.25); }; // (after the tackle, so the broadcast hears it in order)
      const kind = tech === "hit" ? "big" : "down";
      if (!inHand) { popLoose(H, D, gIdx, { drib: true, tech, high: high || undefined }); hurt(); jolt(H, kind === "big" ? 0.5 : 0.2); return; } // hit on the dribble: the ball pops loose
      const strip = clamp((0.1 + (D.p.r.hands - rH.sec) * 0.004 + (gang.length - 1) * 0.07 + (H.driving ? 0.03 : 0)) * (tech === "hit" ? 1.8 : tech === "wrap" ? 0.6 : 0.8) * (1 - Math.min(0, moodNow(H)) * 0.5) * (clutchTime(H.t) ? 1 - H.clutch * 0.15 : 1), 0.03, 0.55);
      if (rng.chance(strip)) { popLoose(H, D, gIdx, { tech, high: high || undefined }); hurt(); jolt(H, kind === "big" ? 0.5 : 0.2); return; } // FUMBLE: jarred loose before he's down
      ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "down", tech, gang: gIdx, high: high || undefined });
      ev("to", { pid: H.idx, team: H.t, kind: "tackle", by: D.idx });
      hurt();
      B.mode = "dead"; B.holder = null; B.vx = rng.normal(0, 3); B.vy = rng.normal(0, 3); B.vz = 4;
      deadInbound(D.t, sidelineSpot(H.x, H.y), { wait: H.out ? 3.4 : 1.8, kind: "tackle" });
      aftermath(D, H, kind, dirty);
    } else {
      for (const O of gang) { O.st = "down"; O.stT = 1.6; } H.st = "stun"; H.stT = 0.35;
      if (!inHand && rng.chance(0.25 * (1.1 - rH.sec / 99))) { popLoose(H, D, gIdx, { drib: true, tech, broke: true }); return; } // stayed up, but lost the dribble
      if (!H.gather && B.holder === H) { H.driving = true; H.decT = 0.4; H.iso = null; H.post = null; } // broke it: now he's going to the rim
      ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "broken", move: move || undefined, moveFail: move ? true : undefined, tech, gang: gIdx });
      const mk = G.mark[D.t]; if (mk && mk.E === D && mk.on === H) G.mark[D.t] = null; // he had his shot
    }
  }
  function commitFoul(D, T, kind) {
    G.fouler = null; D.fouls++; G.tf[D.t]++;
    ev("foul", { pid: D.idx, team: D.t, on: T.idx, kind, pf: D.fouls });
    if (D.fouls >= 6) ev("fouledout", { pid: D.idx, team: D.t });
    if (B.mode === "held" && B.holder) { B.holder.gather = false; B.holder.driving = false; }
    B.mode = "dead"; B.holder = null; B.pass = null;
    if (G.tf[D.t] >= 5) startFT(T, 2, kind);
    else deadInbound(T.t, sidelineSpot(T.x, T.y), { wait: 1.4, kind: "foul", keepShot: 14 });
  }
  // the defense sends a second man at the star once he has it in scoring range
  function doubleCheck(H) {
    const dt = 1 - H.t, dp = DP[dt];
    if (G.dbl && (G.dbl.H !== H || G.dbl.D.st !== "ok")) G.dbl = null;
    if (G.dbl || dp.dblTarget !== H.idx || G.inbound || G.dblPoss === G.possN) return;
    const h = hoopOf(H.t), dH = hyp(H.x - h.x, H.y - h.y);
    if (dH > 30 || G.trans[H.t] > G.tick) return;
    G.dblPoss = G.possN;
    if (!rng.chance(dp.dblRate)) return;
    const cand = G.lineup[dt].filter(D => D.st === "ok" && G.match.get(D) !== H && D !== dp.goalieP && dist(D, H) < 20);
    const D = best(cand, D => -(G.match.get(D) ? G.match.get(D).pf.off * G.match.get(D).use : 0) - dist(D, H) * 0.8);
    if (D) { G.dbl = { D, H }; call("double", D, H); }
  }
  function defAI(D, H) {
    if (D.st === "down" || D.st === "lunge") return;
    if (D.leakT > 0 && G.phase === "live") { // leak out for the outlet
      D.leakT -= DT; const hh = hoopOf(D.t); D.tx = hh.x + hh.dir * 24; D.ty = D.y > 25 ? 38 : 12; D.urg = 1; return;
    }
    const man = G.match.get(D); if (!man) { D.tx = D.x; D.ty = D.y; D.urg = 0; return; }
    const h = hoopOf(G.off), dp = DP[D.t]; // the hoop this defense protects
    if (D.swat) {
      D.tx = D.swat.x; D.ty = D.swat.y; D.urg = 1;
      if (G.tick >= D.swat.at) { doJump(D, 1, "swat"); D.swat = null; }
      return;
    }
    if (D.contestAt >= 0 && G.tick >= D.contestAt) { doJump(D, 0.95, "contest"); D.contestAt = -1; }
    const mx = man.x, my = man.y; const md = hyp(mx - h.x, my - h.y) || 1;
    const ux = (h.x - mx) / md, uy = (h.y - my) / md;
    const td = TAC[D.t].d;
    if (D.boxT > 0) { // put a body on your man (in a zone: on whoever is in your area, or hold the paint)
      D.boxT -= DT;
      if (dp.scheme === "zone") {
        let O = null, od = 9; for (const Q of G.lineup[G.off]) { const q = dist(Q, D); if (q < od) { od = q; O = Q; } }
        if (O) { const oh = hyp(O.x - h.x, O.y - h.y) || 1; D.tx = O.x + (h.x - O.x) / oh * 1.4; D.ty = O.y + (h.y - O.y) / oh * 1.4; }
        else { const z = ZONE[D.zone]; D.tx = h.x + h.dir * Math.min(z[0], 6); D.ty = h.y + z[1] * 0.45; }
        D.urg = 0.9; return;
      }
      D.tx = mx + ux * 1.4; D.ty = my + uy * 1.4; D.urg = 0.9; return;
    }
    if (G.fouler && G.fouler.D === D && G.phase === "live") { // go foul him
      const T = G.fouler.kind === "intentional" && B.mode === "held" && B.holder && B.holder.t !== D.t ? B.holder : G.fouler.on;
      D.tx = T.x; D.ty = T.y; D.urg = 1;
      if (dist(D, T) < 2.3 && T.on && T.st !== "down" && (B.mode === "held" || B.mode === "pass")) commitFoul(D, T, G.fouler.kind);
      return;
    }
    if (G.help && G.help.D === D) { // rotate over to stop the drive
      D.tx = G.help.x; D.ty = G.help.y; D.urg = 1;
      if (H && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
      return;
    }
    const cv = G.cov && G.tick < G.cov.until && H && G.cov.H === H ? G.cov : null;
    if (cv && (D === cv.SD || (D === cv.D && cv.kind === "trap"))) {
      const hd = hyp(H.x - h.x, H.y - h.y) || 1, k = cv.kind;
      if (k === "trap") { // both go at him: hit him before he can get it out
        const sd = D === cv.SD ? 1 : -1; D.tx = H.x + (h.x - H.x) / hd * 1.4 + sd * 1.2; D.ty = H.y + (h.y - H.y) / hd * 1.4 - sd * 0.8; D.urg = 1;
        if (G.phase === "live") tackleCheck(D, H, true);
      } else if (k === "hedge" && G.tick < cv.until - 10) { // jump out in his path, then get back
        D.tx = H.x + (h.x - H.x) / hd * 2.2 + H.vx * 0.3; D.ty = H.y + (h.y - H.y) / hd * 2.2 + H.vy * 0.3; D.urg = 1;
      } else if (k === "hedge") { D.tx = cv.Sc.x + (h.x - cv.Sc.x) * 0.15; D.ty = cv.Sc.y + (h.y - cv.Sc.y) * 0.15; D.urg = 1; }
      else { // drop / ice: sag into the paint between the ball and the rim (ice: shaded to the baseline side)
        const dd = Math.min(10, hd * 0.55), lat = k === "ice" ? (H.y > 25 ? 3 : -3) : 0;
        D.tx = h.x + (H.x - h.x) / hd * dd; D.ty = h.y + (H.y - h.y) / hd * dd + lat; D.urg = 1;
      }
      if (k !== "trap" && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
      return;
    }
    if (H && G.dbl && G.dbl.D === D && G.dbl.H === H) { // trap the star
      const hd = hyp(H.x - h.x, H.y - h.y) || 1, sd = H.y > 25 ? -1 : 1;
      D.tx = H.x + (h.x - H.x) / hd * 1.6 + sd * 1.4; D.ty = H.y + (h.y - H.y) / hd * 1.6 + sd * 0.6; D.urg = 1;
      if (G.phase === "live") tackleCheck(D, H);
      return;
    }
    // in transition the rim protector sprints back to the rim first
    if (G.trans[G.off] > G.tick && D === G.rimProt[D.t] && hyp(D.x - h.x, D.y - h.y) > 9) { D.tx = h.x + h.dir * 4; D.ty = h.y; D.urg = 1; return; }
    const scheme = dp.scheme === "goalie" && !(dp.goalieP && dp.goalieP.on) ? "man" : dp.scheme;
    const zoneOK = scheme !== "zone" || hyp(man.x - (h.x + h.dir * ZONE[D.zone][0]), man.y - (h.y + ZONE[D.zone][1])) < 20;
    if (B.mode === "pass" && B.pass.to === man && md < 34 && zoneOK) { // close out on the catch
      const cx = B.pass.tx, cy = B.pass.ty, cd = hyp(cx - h.x, cy - h.y) || 1;
      const ext = scheme === "extend" && FOUR && man.p.r.fr >= 55 && cd > 27 ? 2.3 : 3;
      if (!(scheme === "goalie" && D === dp.goalieP && cd > 14 && man.pf.shoot < 50)) { D.tx = cx + (h.x - cx) / cd * ext; D.ty = cy + (h.y - cy) / cd * ext; D.urg = 1; return; }
    }
    if (scheme === "goalie" && D === dp.goalieP && !(man === H && md < 20) && md > 11) {
      // stays home in front of the rim, shading toward the ball; 2s on the way down are fair game
      const bx = H ? H.x : B.x, by = H ? H.y : B.y, bd = hyp(bx - h.x, by - h.y) || 1;
      D.tx = h.x + (bx - h.x) / bd * 3.2; D.ty = h.y + (by - h.y) / bd * 3.2; D.urg = 0.9;
      if (H && H.driving && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
      return;
    }
    if (scheme === "zone") { zoneAI(D, H, man, h); return; }
    const ext = scheme === "extend";
    const thr = P => { const d0 = hyp(P.x - h.x, P.y - h.y); return d0 > 28.5 ? (FOUR ? P.p.r.fr / 99 * (ext ? 1.35 : 1) : 0.15) : d0 > 22 ? P.p.r.thr / 99 * (ext ? 1.1 : 1) : 0.6; };
    if (man === H) {
      const threat = thr(man);
      const press = (dp.hit === "blitz" && TAC[D.t].tackle >= 1.15) || G.desp[D.t];
      let gap = md > 36 ? (press ? 3 : 7) : Math.max(1.8, 2.6 + (1 - threat) * 2.2 - td * 0.4 - (dp.hit === "blitz" ? 0.4 : dp.hit === "disciplined" ? 0.35 : 0));
      if (md <= 36 && dp.scout && dp.scout.under.has(man.idx)) gap += 1.0; // scouted: he can't shoot, give him room
      D.tx = mx + ux * Math.min(gap, md - 0.5); D.ty = my + uy * Math.min(gap, md - 0.5); D.urg = 1;
      if (G.phase === "live") tackleCheck(D, H);
    } else {
      const threat = Math.max(thr(man), md <= 22 ? 0.75 : 0, dp.scout && dp.scout.lock.has(man.idx) ? 0.9 : 0, heatNow(man) >= 2.5 && man.streak > 0.3 && TAC[1 - man.t].adapt > 0.35 ? 0.85 : 0); // scouted shooters (and hot ones) get no air
      const gap = Math.max(ext && threat > 0.6 && md > 26 ? 1.8 : 2, 3 + (1 - threat) * 6 - td * 0.6);
      let tx = mx + ux * Math.min(gap, md - 1), ty = my + uy * Math.min(gap, md - 1);
      if (H && B.mode === "held") { const sag = ext ? 0.06 : 0.12 + (1 - threat) * 0.08; tx += (H.x - tx) * sag; ty += (H.y - ty) * sag; }
      if (D === G.rimProt[D.t] && md > 14 && threat < 0.75 && !ext) { tx = h.x + (mx - h.x) / md * 7; ty = h.y + (my - h.y) / md * 7; }
      D.tx = tx; D.ty = ty; D.urg = hyp(tx - D.x, ty - D.y) > 6 ? 1 : 0.85;
      if (H && H.driving && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
    }
  }
  function zoneAI(D, H, man, h) {
    const z = ZONE[D.zone], zx = h.x + h.dir * z[0], zy = h.y + z[1];
    let tx = zx + (B.x - zx) * 0.36, ty = zy + (B.y - zy) * 0.36;
    if (H && H.driving && (hyp(H.x - zx, H.y - zy) < 14 || dist(D, H) < 10)) { // a drive into my area: step in front of it and make the hit
      const hd = hyp(H.x - h.x, H.y - h.y) || 1; D.tx = H.x + (h.x - H.x) / hd * 2.2; D.ty = H.y + (h.y - H.y) / hd * 2.2; D.urg = 1;
      if (G.phase === "live") tackleCheck(D, H);
      return;
    }
    // a cutter or a post man in my area gets bodied, whoever "owns" him on paper
    if (z[0] < 10) { let O = null, od = 8; for (const Q of G.lineup[G.off]) { if (Q === H) continue; const q = hyp(Q.x - zx, Q.y - zy); if (q < od) { od = q; O = Q; } } if (O) man = O; }
    const hz = H ? hyp(H.x - zx, H.y - zy) : 99, hh = H ? hyp(H.x - h.x, H.y - h.y) : 99;
    if (H && man !== H && hz < 11 && hh < 27 && z[0] > 5 && G.phase === "live") { // the ball came into my area too: trap him
      const sd = (D.zone % 2 ? 1 : -1); D.tx = H.x + (h.x - H.x) / (hh || 1) * 1.5 + sd * 1.3; D.ty = H.y + (h.y - H.y) / (hh || 1) * 1.5 + sd * 0.8; D.urg = 1;
      tackleCheck(D, H); return;
    }
    if (man === H && H && hz < 18) { // the ball is in my area: pressure it
      const hd = hyp(H.x - h.x, H.y - h.y) || 1; tx = H.x + (h.x - H.x) / hd * 2.6; ty = H.y + (h.y - H.y) / hd * 2.6;
      if (G.phase === "live") tackleCheck(D, H);
    } else {
      const mz = hyp(man.x - zx, man.y - zy), mh = hyp(man.x - h.x, man.y - h.y) || 1;
      const shooter = (mh > 28 && FOUR && man.p.r.fr >= 58) || (mh > 22 && mh <= 28.5 && man.p.r.thr >= 58);
      if (mz < 9 || (shooter && mz < 16)) { const g = shooter ? 3.4 : 3; tx = man.x + (h.x - man.x) / mh * g; ty = man.y + (h.y - man.y) / mh * g; } // a man in my area: get on him
    }
    if (H && H.driving && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
    D.tx = tx; D.ty = ty; D.urg = hyp(tx - D.x, ty - D.y) > 5 ? 1 : 0.8;
  }
  function startScreen(Sc, F, kind, dest) {
    const D = defenderOf(F); if (!D) return false;
    // a smart screener slips it against a defense that loves to jump the ball
    const cv = kind === "pnr" ? coverage(1 - Sc.t) : null, slip = (cv === "trap" || cv === "hedge") && rng.chance(0.22 * Sc.p.r.iq / 99 * Sc.comp);
    Sc.screen = { kind, for: F, phase: "go", t: 0, checked: false, dest: dest || null, sx: 0, sy: 0, pop: false, mv: false, slip };
    Sc.cutT = 0; Sc.curl = null; Sc.waitScreen = false;
    return true;
  }
  function screenAI(P) {
    const S = P.screen, F = S.for, h = hoopOf(P.t); S.t += DT;
    if (!F.on || F.st === "down" || G.off !== P.t) { P.screen = null; return; }
    const D = defenderOf(F);
    if (S.phase === "go") {
      if (!D || (S.kind === "pnr" && (B.mode !== "held" || B.holder !== F))) { P.screen = null; return; }
      let sx, sy;
      if (S.kind === "pnr") { const m = Math.sign(25 - D.y) || (P.idx % 2 ? 1 : -1); sx = D.x; sy = D.y + m * 1.8; }
      else { const ux = S.dest.x - D.x, uy = S.dest.y - D.y, L = hyp(ux, uy) || 1; sx = D.x + ux / L * 1.9; sy = D.y + uy / L * 1.9; }
      P.tx = clamp(sx, 1, C.L - 1); P.ty = clamp(sy, 1, C.W - 1); P.urg = 1;
      // moving screen: he's still sliding when the defender arrives
      if (!S.mv && hyp(D.x - P.x, D.y - P.y) < 2.2) {
        S.mv = true; const spd = hyp(P.vx, P.vy);
        if (spd > 5 && G.phase === "live" && rng.chance(0.02 * (1.2 - P.p.r.iq / 99) * (1.2 - TAC[P.t].disc * 0.6) * REF.w * (P.t === 0 ? 1 - REF.h * 4 : 1 + REF.h * 4))) { movingScreen(P, D); return; }
      }
      if (S.slip && hyp(P.x - P.tx, P.y - P.ty) < 3.2) { S.phase = "roll"; S.t = 0; S.pop = false; ev("call", { team: P.t, kind: "slip", pid: P.idx, w: F.idx }); return; }
      if (hyp(P.x - P.tx, P.y - P.ty) < 1.3 || S.t > 3) { S.phase = "set"; S.t = 0; S.sx = P.x; S.sy = P.y; }
    } else if (S.phase === "set") {
      P.tx = S.sx; P.ty = S.sy; P.urg = 0.3;
      if (D && !S.checked && hyp(D.x - P.x, D.y - P.y) < 2.6) { // the defender runs into it
        S.checked = true;
        const SD = defenderOf(P), dp = DP[D.t], scr = clamp(0.7 + (P.p.r.str - D.p.r.str) * 0.005, 0.35, 1.1);
        const cv = S.kind === "pnr" && B.mode === "held" && B.holder === F ? coverage(D.t) : null;
        if (cv) { // the pick-and-roll coverage
          ev("cover", { team: D.t, kind: cv, pid: SD ? SD.idx : -1, on: F.idx, sc: P.idx });
          G.lastCov = { kind: cv, poss: G.possN, tk: G.tick };
          const under = dp.scout && dp.scout.under.has(F.idx); // scouted non-shooter: go under the screen
          if (cv === "switch" && SD && SD.st === "ok" && rng.chance(0.9)) { G.match.set(D, P); G.match.set(SD, F); G.hunt = G.tick + 12; }
          else {
            D.screenedT = scr * (cv === "drop" ? 0.85 : cv === "hedge" ? 0.55 : cv === "ice" ? 0.35 : cv === "trap" ? 0.3 : 1) * (under ? 0.35 : 1);
            if (SD && SD.st === "ok" && cv !== "switch") G.cov = { kind: cv, H: F, Sc: P, D, SD, until: G.tick + (cv === "hedge" ? 22 : 36) };
            if (cv === "ice" && F.pnr) F.pnr.ice = true;
          }
        } else {
          const swp = dp.scheme === "switch" ? 0.9 : dp.scheme === "zone" ? 0 : TAC[D.t].sw * 0.85;
          if (SD && SD.st === "ok" && rng.chance(swp)) { G.match.set(D, P); G.match.set(SD, F); G.hunt = G.tick + 12; }
          else D.screenedT = scr;
        }
      }
      if (S.t > 1.3) { S.phase = "roll"; S.t = 0; S.pop = S.kind === "pnr" && ((FOUR && P.p.r.fr > 62) || P.p.r.thr > 66) && P.job !== "run"; }
    } else {
      if (S.pop) { const sp = SPOTS[FOUR && P.p.r.fr > 62 ? (P.y > 25 ? "FOUR_R" : "FOUR_L") : (P.y > 25 ? "WING_R" : "WING_L")]; P.tx = h.x + h.dir * sp[0]; P.ty = h.y + sp[1]; }
      else { P.tx = h.x + h.dir * 2.5; P.ty = h.y + (P.y > 25 ? 3 : -3); }
      P.urg = 1;
      if (S.t > 1.8) P.screen = null;
    }
  }
  function movingScreen(P, D) {
    P.fouls++; P.screen = null;
    ev("foul", { pid: P.idx, team: P.t, on: D.idx, kind: "moving", pf: P.fouls });
    if (P.fouls >= 6) ev("fouledout", { pid: P.idx, team: P.t });
    ev("to", { pid: P.idx, team: P.t, kind: "moving", by: -1 });
    const H = B.mode === "held" ? B.holder : null; if (H) { H.gather = false; H.driving = false; }
    B.mode = "dead"; B.holder = null; B.pass = null;
    deadInbound(1 - P.t, sidelineSpot(P.x, P.y), { wait: 1.4, kind: "oob" });
  }
  function fourSpot(P, h) {
    const a = SPOTS[P.y > 25 + h.dir * 0 ? "FOUR_R" : "FOUR_L"];
    return { x: h.x + h.dir * a[0], y: h.y + a[1] };
  }
  function laneSpot(P, h) {
    if (P.job === "run" || P.arch === "SLA" || P.arch === "RUN") return { x: h.x + h.dir * 3, y: h.y + (P.y > 25 ? 3 : -3) };
    if (P.job === "c1" || P.job === "c2") return { x: h.x + h.dir * 27, y: 25 };
    if (P.pf.shoot >= 58) return { x: h.x + h.dir * (FOUR && P.p.r.fr >= 62 ? 25 : 19), y: P.y > 25 ? 42 : 8 };
    if (P.p.role === "BIG" || P.p.role === "BRUISER") return { x: h.x + h.dir * 34, y: 25 + (P.y > 25 ? 6 : -6) };
    return { x: h.x + h.dir * 18, y: P.y > 25 ? 42 : 8 };
  }
  function offAI(P) {
    if (P.st === "down") return;
    const h = hoopOf(P.t), pl = PL[P.t], S = SYSTEMS[pl.sys];
    if (B.mode === "pass" && B.pass.to === P) {
      P.tx = B.pass.tx; P.ty = B.pass.ty; P.urg = 1;
      if (P.lob && G.tick >= P.lob.at) { doJump(P, 1, "dunk"); P.lob = null; }
      return;
    }
    if (P.crashT > 0) { P.crashT -= DT; P.tx = h.x + h.dir * 3.5; P.ty = h.y + (P.y > 25 ? 3.5 : -3.5); P.urg = 1; return; }
    if (P.backT > 0) { P.backT -= DT; const dh = hoopOf(1 - P.t); P.tx = dh.x + dh.dir * 30; P.ty = 25 + (P.slot - 2) * 5; P.urg = 0.9; return; }
    if (P.screen) { screenAI(P); return; }
    if (P.curl) { // running off a screen to a shooting spot
      P.curl.t += DT; P.tx = P.curl.x; P.ty = P.curl.y; P.urg = 1;
      if (P.curl.t > 2.4 || hyp(P.x - P.tx, P.y - P.ty) < 1.2) { P.spot = P.curl.spot; P.curl = null; P.ctx = "offscr"; P.ctxT = G.tick; }
      return;
    }
    if (P.cutT > 0) { P.cutT -= DT; P.tx = h.x + h.dir * 2; P.ty = h.y + (P.y > 25 ? 4 : -4); P.urg = 1; return; }
    if (P.setT) { P.tx = P.setT.x; P.ty = P.setT.y; P.urg = hyp(P.tx - P.x, P.ty - P.y) > 4 ? 1 : 0.6; return; } // running the called set
    const H = B.mode === "held" ? B.holder : null;
    // transition: fill the lanes
    if (G.trans[P.t] > G.tick && H && H !== P && hyp(P.x - h.x, P.y - h.y) > 12) { const l = laneSpot(P, h); P.tx = l.x; P.ty = l.y; P.urg = 1; return; }
    let s = spotXY(P, P.t);
    if (G.sitO === "need4" && FOUR && P.p.r.fr >= 55) s = fourSpot(P, h);
    if (H && H.iso && P.job !== "run") s = { x: s.x + (s.x - h.x) * 0.12, y: clamp(s.y + (s.y - h.y) * 0.12, 1, C.W - 1) };
    // the rim runner rises when the handler attacks
    if (H && H !== P && P.job === "run" && (H.driving || H.pnr) && hyp(H.x - h.x, H.y - h.y) < 24) s = { x: h.x + h.dir * 2.5, y: h.y + (P.y > 25 ? 4 : -4) };
    P.jitT -= DT; if (P.jitT <= 0) { P.jitT = rng.range(1.5, 3.5); P.jit = { x: rng.normal(0, 1.5), y: rng.normal(0, 1.5) }; }
    if (P.waitScreen) {
      const Sc = G.lineup[P.t].find(Q => Q.screen && Q.screen.for === P && Q.screen.kind === "off" && Q.screen.dest);
      if (!Sc) P.waitScreen = false;
      else if (Sc.screen.phase !== "go") { P.waitScreen = false; const dd = Sc.screen.dest; P.curl = { x: dd.x, y: dd.y, t: 0, spot: dd.spot }; return; }
      else { P.tx = s.x + (h.x - s.x) * 0.12; P.ty = s.y; P.urg = 0.5; return; } // set his man up
    }
    // a shooter asks for an off-ball screen to free himself
    const shooter = P.job === "snipe" || P.p.role === "SNIPER" || P.p.role === "WING" || P.arch === "FSN" || P.arch === "SPT" || P.arch === "MRK";
    const featured = G.play && G.play.kind === "offscr" && !G.play.custom && G.play.P === P && !G.play.done;
    if (H && H !== P && (shooter || featured) && (G.tick > G.offScreenCD[P.t] || featured) && hyp(H.x - h.x, H.y - h.y) < 34 && !H.iso && rng.chance(featured ? 0.08 : 0.0025 * S.offscr * (P.job === "snipe" ? 1.3 : 1))) {
      const want = FOUR && P.p.r.fr > 62 ? ["FOUR_L", "FOUR_R", "FOUR_TOP"] : ["WING_L", "WING_R", "TOP"];
      const taken = new Set(G.lineup[P.t].filter(Q => Q !== P).map(Q => Q.spot));
      const spot = want.filter(x => !taken.has(x) && x !== P.spot).sort((a, b) => { const A = SPOTS[a], Bq = SPOTS[b]; return hyp(h.x + h.dir * Bq[0] - P.x, h.y + Bq[1] - P.y) - hyp(h.x + h.dir * A[0] - P.x, h.y + A[1] - P.y); })[0];
      let Sc = null, bv = -1e9;
      for (const M of G.lineup[P.t]) { if (M === P || M === H || M.st !== "ok" || M.screen || M.crashT > 0 || M.waitScreen) continue; const v = M.pf.scr * 0.25 - hyp(M.x - P.x, M.y - P.y); if (v > bv) { bv = v; Sc = M; } }
      if (spot && Sc && hyp(Sc.x - P.x, Sc.y - P.y) < 26) {
        const sp = SPOTS[spot], dest = { x: h.x + h.dir * sp[0], y: h.y + sp[1], spot };
        if (startScreen(Sc, P, "off", dest)) { P.waitScreen = true; G.offScreenCD[P.t] = G.tick + Math.round(120 / Math.max(0.6, S.offscr * 0.7)); if (featured) G.play.done = true; dbg("run:offscr"); }
      }
    }
    // cuts (more when his man is ball-watching or overplaying)
    if (H && H !== P && P.job !== "run" && P.job !== "post" && hyp(H.x - h.x, H.y - h.y) < 33 && !H.iso) {
      const D = defenderOf(P);
      const deny = D && hyp(D.x - h.x, D.y - h.y) > hyp(P.x - h.x, P.y - h.y) - 0.5 ? 2.5 : 1;
      if (rng.chance(0.0035 * (0.5 + P.p.r.iq / 99) * S.cut * deny * (P.job === "c1" ? 0.4 : 1))) P.cutT = 1.4;
    }
    P.tx = clamp(s.x + P.jit.x * (P.job === "post" ? 0.4 : 1), 1, C.L - 1); P.ty = clamp(s.y + P.jit.y, 1, C.W - 1);
    const dd = hyp(P.tx - P.x, P.ty - P.y); P.urg = dd > 10 ? 1 : dd > 3 ? 0.7 : 0.35;
  }
  function reboundAI() {
    // predicted landing point
    let tl = 0;
    if (B.z > 8 || B.vz > 0) { const disc = B.vz * B.vz + 2 * GRAV * Math.max(0, B.z - 8); tl = (B.vz + Math.sqrt(disc)) / GRAV; }
    const px = B.x + B.vx * tl, py = B.y + B.vy * tl;
    for (let t = 0; t < 2; t++) {
      const L = G.lineup[t].filter(P => P.st !== "down" && P.leakT <= 0 && !(P.backT > 0 && hyp(P.x - px, P.y - py) > 7)).sort((a, b) => hyp(a.x - px, a.y - py) - hyp(b.x - px, b.y - py));
      L.slice(0, 3).forEach(P => {
        P.tx = px; P.ty = py; P.urg = 1;
        const hd = hyp(P.x - B.x, P.y - B.y);
        if (hd < 3 && B.vz < 0 && B.z > P.reach + 0.3 && B.z < P.reach + P.vertFt + 0.8) doJump(P, 1, "rebound");
      });
    }
  }
  function tryGrab() {
    const cands = [];
    for (const P of onC()) {
      if (P.st === "down" || P.st === "lunge") continue;
      const hd = hyp(P.x - B.x, P.y - B.y);
      if (hd < 2.1 && B.z <= P.reach + P.z + 0.25) cands.push(P);
    }
    if (!cands.length) return;
    let tot = 0; const ws = cands.map(P => { const w = 1 + P.p.r.reb / 40 + P.p.r.str / 120 + (P.air ? 0.8 : 0) + (P.t !== G.lastShotTeam ? 0.6 : 0) + (G.fumble ? P.p.r.hands / 80 : 0); tot += w; return w; });
    let x = rng.next() * tot, P = cands[0];
    for (let i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) { P = cands[i]; break; } }
    if (P.t !== G.off) maybePush(P.t, G.reboundable ? 0 : G.fumble ? 0.25 : 0.2);
    if (G.reboundable) {
      const off = P.t === G.lastShotTeam;
      ev("reb", { pid: P.idx, team: P.t, off });
      G.reboundable = false;
      gain(P);
      if (off) { G.shotClock = 14; G.shotRun = true; G.putback = { P, tk: G.tick }; }
      else { G.shotClock = C.SC; G.shotRun = true; }
    } else if (G.fumble) {
      const F0 = G.fumble; G.fumble = null;
      ev("recover", { pid: P.idx, team: P.t, own: P.t === F0.t, from: F0.P.idx });
      if (P.t !== F0.t) ev("to", { pid: F0.P.idx, team: F0.t, kind: "fumble", by: P.idx });
      const was = G.off;
      gain(P);
      if (P.t === was) G.shotRun = true;
    } else {
      if (P.t !== G.off && G.lastHandler) ev("to", { pid: G.lastHandler.idx, team: G.lastHandler.t, kind: "loose", by: (G.deflector && G.deflector.t === P.t) ? G.deflector.idx : P.idx });
      G.deflector = null;
      const was = G.off;
      gain(P);
      if (P.t === was) G.shotRun = true;
    }
    G.inbound = false;
  }
  function outOfBounds() {
    const t = 1 - B.lastTouch;
    if (!G.reboundable && B.lastTouch === G.off && G.lastHandler) ev("to", { pid: G.lastHandler.idx, team: G.lastHandler.t, kind: G.fumble ? "fumble" : "oob", by: -1 });
    G.reboundable = false; G.fumble = null;
    const spot = (B.x < 0 || B.x > C.L) ? { x: B.x < 0 ? -1.2 : C.L + 1.2, y: clamp(B.y, 3, 47) } : sidelineSpot(B.x, B.y);
    B.mode = "dead"; B.vx *= 0.3; B.vy *= 0.3;
    deadInbound(t, spot, { wait: 1.5, kind: "oob", keepShot: t === G.off ? 5 : 0 });
  }

  // ---- ball ----
  function ballStep() {
    if (B.mode === "held") {
      const H = B.holder; const h = hoopOf(H.t);
      const dx = h.x - H.x, dy = h.y - H.y, dd = hyp(dx, dy) || 1;
      if (H.gather || H.air) { B.x = H.x + dx / dd * 0.7; B.y = H.y + dy / dd * 0.7; B.z = H.z + H.reach * (H.gather ? 0.75 : 0.55); }
      else { B.x = H.x + dx / dd * 0.9; B.y = H.y + dy / dd * 0.9; B.z = 0.3 + 2.3 * Math.abs(dsin(G.tick * 0.42 + H.idx)); }
      return;
    }
    B.vz -= GRAV * DT; B.x += B.vx * DT; B.y += B.vy * DT; B.z += B.vz * DT; B.t += DT;
    if (B.mode === "shot") {
      const S = B.shot;
      for (const D of G.lineup[1 - S.team]) {
        if (!D.air || S.touched.has(D)) continue;
        const hd = hyp(D.x - B.x, D.y - B.y), top = D.reach + D.z + 0.4;
        if (hd < 1.7 + (D.p.wing - D.p.ht) / 24 && B.z <= top && B.z >= top - 2.4) {
          S.touched.add(D);
          if (!rng.chance(0.05 + D.p.r.rim * 0.0024 + D.p.r.vert * 0.0006)) continue;
          const h = S.hoop, nearRim = hyp(B.x - h.x, B.y - h.y) < 0.85 && B.z >= 9.9 && B.z < 11.3;
          if (S.val >= 3 && B.vz < 0) { // goaltending: counts
            S.made = true; score(S.team, S.val);
            shotDone(S, { made: true, gt: D.idx, ast: S.ast ? S.ast.idx : -1 });
            ev("violation", { kind: "goaltend", pid: D.idx, team: D.t });
            B.mode = "dead"; B.vx = 0; B.vy = 0; afterScore(S, true); return;
          }
          if (S.val === 2 && nearRim && rng.chance(0.12 * (1 - D.p.r.bnc / 140))) { // hand went through the cylinder
            S.made = true; score(S.team, 2);
            shotDone(S, { made: true, val: 2, ci: D.idx, ast: S.ast ? S.ast.idx : -1 });
            ev("violation", { kind: "cylinder", pid: D.idx, team: D.t });
            B.mode = "dead"; B.vx = 0; B.vy = 0; afterScore(S, true); return;
          }
          // legal block / swat
          shotDone(S, { made: false, blk: D.idx, swat: B.vz < 0, ast: -1 });
          const a = datan2(B.y - D.y, B.x - D.x) + rng.normal(0, 0.8), sp = rng.range(8, 20);
          B.mode = "loose"; B.vx = dcos(a) * sp; B.vy = dsin(a) * sp; B.vz = rng.range(-4, 6); B.lastTouch = D.t;
          G.reboundable = true; G.lastShotTeam = S.team; G.looseT = 0;
          if (S.flag) { B.shot = null; B.mode = "dead"; startFT(shooterFor(S.P), 2, "flagrant", true); return; }
          if (S.foul) { const n = S.val; B.shot = null; B.mode = "dead"; startFT(shooterFor(S.foul.on), n, "shooting"); return; }
          B.shot = null; return;
        }
      }
      if (B.t >= S.T) shotArrive();
      return;
    }
    if (B.mode === "ftshot") { if (B.t >= B.shot.T) ftArrive(); return; }
    if (B.mode === "pass") {
      const Pp = B.pass;
      for (const D of G.lineup[1 - Pp.from.t]) {
        if (D.st === "down" || Pp.tried.has(D)) continue;
        const hd = hyp(D.x - B.x, D.y - B.y), top = D.reach + D.z + 0.3;
        if (B.t > 0.06 && hd < 1.6 + (D.p.wing - D.p.ht) / 24 && B.z < top) {
          Pp.tried.add(D); D.reachT = 0.3;
          if (rng.chance((0.07 + D.p.r.perD * 0.0016 + D.p.r.hands * 0.0009) * (PL[Pp.from.t].sys === "motion" ? 0.72 : 1))) {
            if (rng.chance(0.62)) {
              ev("to", { pid: Pp.from.idx, team: Pp.from.t, kind: "steal", by: D.idx });
              G.inbound = false; Pp.to.lob = null; maybePush(D.t, 0.3); gain(D); return;
            }
            const a = rng.range(0, 6.283); B.vx = dcos(a) * 9; B.vy = dsin(a) * 9; B.vz = 3;
            B.mode = "loose"; B.lastTouch = D.t; G.deflector = D; G.reboundable = false; G.looseT = 0; G.inbound = false; Pp.to.lob = null; return;
          }
        }
      }
      for (const M of G.lineup[Pp.from.t]) {
        if (M === Pp.from || M.st === "down") continue;
        const hd = hyp(M.x - B.x, M.y - B.y);
        if (hd < 1.9 && B.z < M.reach + M.z + 0.5 && B.z > 0.3) {
          if (rng.chance(0.975 - (1 - M.p.r.hands / 99) * 0.07 * (PL[M.t].sys === "motion" ? 0.6 : 1) - (Pp.alley ? 0.04 : 0))) {
            const wasInb = G.inbound;
            gain(M); G.lastPass = { from: Pp.from, to: M, tick: G.tick }; M.catchT = 0.3; M.lob = null;
            M.ctx = G.play && !G.play.done && G.play.set === "dho" && G.play.roles.k === Pp.from && G.play.roles.s === M ? "hand" : M.screen && M.screen.phase === "roll" ? "roll" : M.cutT > 0 ? "cut" : M.curl ? "offscr" : (M.ctx === "offscr" && G.tick - M.ctxT < 30) ? "offscr" : null; M.ctxT = G.tick;
            if (wasInb) { G.inbound = false; if (!G.periodEnding && G.clock > 0) G.clockRun = true; G.shotRun = true; }
            if (G.phase === "live" && !G.clockRun && G.clock > 0 && !G.periodEnding) G.clockRun = true;
            // alley-oop: caught in the air by the rim, finish it before landing
            if (Pp.alley) dbg(M.air ? "alley:caughtAir" : "alley:caughtGround");
            if (Pp.alley && M.air && hyp(M.x - hoopOf(M.t).x, M.y - hoopOf(M.t).y) < 7) { M.alley = true; M.finishType = "dunk"; shoot(M, "finish"); }
          } else {
            dbg(Pp.alley ? "alley:dropped" : "pass:dropped");
            B.mode = "loose"; B.vx *= 0.3; B.vy *= 0.3; B.vz = 3; B.lastTouch = M.t; G.reboundable = false; G.looseT = 0; M.lob = null;
            if (G.inbound) { G.inbound = false; G.clockRun = G.clock > 0; G.shotRun = true; }
          }
          return;
        }
      }
      if (B.z <= 0) { B.z = 0; B.vz = -B.vz * C.FLOOR_E; }
      if (B.t > Pp.T + 0.35) { dbg(Pp.alley ? "alley:missed" : "pass:missed"); B.mode = "loose"; G.reboundable = false; G.looseT = 0; Pp.to.lob = null; if (G.inbound) { G.inbound = false; G.clockRun = G.clock > 0; G.shotRun = true; } }
      if (B.x < 0 || B.x > C.L || B.y < 0 || B.y > C.W) { dbg(Pp.alley ? "alley:oob" : "pass:oob"); if (G.inbound) G.inbound = false; outOfBounds(); }
      return;
    }
    // loose & dead: bounce on the rubber floor
    if (B.z <= 0) {
      B.z = 0;
      if (B.vz < -1.5) { B.vz = -B.vz * C.FLOOR_E; B.vx *= 0.88; B.vy *= 0.88; } else { B.vz = 0; B.vx *= 0.96; B.vy *= 0.96; }
    }
    if (B.mode === "loose") {
      if (B.x < 0 || B.x > C.L || B.y < 0 || B.y > C.W) { outOfBounds(); return; }
      G.looseT += DT;
      tryGrab();
      if (B.mode === "loose" && G.looseT > 6) { // failsafe
        let bp = null, bd = 1e9; for (const P of onC()) { const d = hyp(P.x - B.x, P.y - B.y); if (d < bd) { bd = d; bp = P; } }
        if (G.reboundable) { ev("reb", { pid: bp.idx, team: bp.t, off: bp.t === G.lastShotTeam }); G.reboundable = false; }
        if (G.fumble) { const F0 = G.fumble; G.fumble = null; ev("recover", { pid: bp.idx, team: bp.t, own: bp.t === F0.t, from: F0.P.idx }); if (bp.t !== F0.t) ev("to", { pid: F0.P.idx, team: F0.t, kind: "fumble", by: bp.idx }); }
        gain(bp); G.shotRun = true;
      }
    }
  }

  // ---- players ----
  function steer(P, tx, ty, vmax, acc) {
    const dx = tx - P.x, dy = ty - P.y, d = hyp(dx, dy); let wx = 0, wy = 0;
    if (d > 0.2) { const s = Math.min(vmax, d * 2.5); wx = dx / d * s; wy = dy / d * s; }
    let ax = wx - P.vx, ay = wy - P.vy; const m = hyp(ax, ay), lim = acc * DT;
    if (m > lim) { ax *= lim / m; ay *= lim / m; }
    P.vx += ax; P.vy += ay;
  }
  function physics() {
    const L = onC();
    for (const P of L) {
      if (P.st === "down") { P.stT -= DT; P.vx *= 0.85; P.vy *= 0.85; if (P.stT <= 0) P.st = "ok"; }
      else if (P.st === "lunge") {
        const H = P.lunge.H;
        steer(P, H.x + H.vx * 0.15, H.y + H.vy * 0.15, P.vmax * 1.3, P.acc * 3);
      } else if (!P.air) {
        let u = P.urg; if (P.st === "stun") { u *= 0.5; P.stT -= DT; if (P.stT <= 0) P.st = "ok"; }
        if (P.screenedT > 0) { u *= 0.3; P.screenedT -= DT; }
        steer(P, P.tx, P.ty, P.vmax * u * (0.8 + 0.2 * P.energy), P.acc);
      }
      P.x += P.vx * DT; P.y += P.vy * DT;
      if (P.air) { P.z += P.vz * DT; P.vz -= GRAV * DT; if (P.z <= 0) { P.z = 0; P.vz = 0; P.air = false; P.airAct = null; } }
      const handler = B.mode === "held" && B.holder === P && !G.inbound;
      if (handler) { P.x = clamp(P.x, 0.6, C.L - 0.6); P.y = clamp(P.y, 0.6, C.W - 0.6); }
      else { P.x = clamp(P.x, -4, C.L + 4); P.y = clamp(P.y, -4, C.W + 4); }
      const sp = hyp(P.vx, P.vy);
      P.energy -= (0.00003 + 0.00007 * sp / P.vmax) * (1.4 - P.p.r.sta / 99 * 0.8) * (1 + (FAT[P.t] || 0) * 2);
      if (P.energy < 0.05) P.energy = 0.05;
      if (G.clockRun) P.secs += DT;
    }
    // tackle contact
    for (const P of L) {
      if (P.st !== "lunge") continue;
      const H = P.lunge.H;
      if (!H.on || H.st === "down") { P.st = "ok"; P.lunge = null; continue; }
      // he left the floor: a smart tackler pulls up instead of roughing him
      if (H.air && !P.lunge.ck) { P.lunge.ck = true; if (rng.chance(P.p.r.iq / 99 * 0.75)) { P.st = "stun"; P.stT = 0.3; P.lunge = null; continue; } }
      if (dist(P, H) < 1.9) { resolveTackle(P, H); if (G.phase !== "live") return; continue; }
      P.stT -= DT;
      if (P.stT <= 0) {
        P.st = "down"; P.stT = 1.2; P.lunge = null; ev("tackle", { pid: P.idx, team: P.t, on: H.idx, result: "whiff" });
        if (B.mode === "held" && B.holder === H && !H.gather && H.st === "ok" && G.match.get(P) === H) { H.driving = true; H.decT = 0.4; H.iso = null; H.post = null; } // blew by the diving tackler
      }
    }
    // separation
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
      if (d < 1.9 && d > 0.001) { const push = (1.9 - d) * 0.25; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
    }
    for (let t = 0; t < 2; t++) for (const P of team[t]) if (!P.on) P.energy = Math.min(1, P.energy + 0.00011);
  }

  // ===================== IN-GAME COACHING =====================
  // At halftime, early in the fourth and in his own timeouts, a coach looks at what's working and changes
  // one thing (two at the half). Adaptable coaches do this a lot; stubborn ones ride it out.
  function coachAdjust(t, when) {
    const tac = TAC[t], o = 1 - t, my = G.ts[t], op = G.ts[o], pl = PL[t], dp = DP[t];
    if (tac.lock) return;
    if (!rng.chance(clamp((when === "timeout" ? 0.15 : 0.3) + 0.7 * tac.adapt, 0, 0.95))) return;
    const pct = (m, a) => a ? m / a : 0, ideas = [];
    if (FOUR && op.a4 >= 6 && pct(op.m4, op.a4) >= 0.36 && dp.scheme !== "extend") ideas.push({ key: "scheme", to: "extend", why: "fours", v: (pct(op.m4, op.a4) - 0.28) * op.a4 * 0.8 });
    if (op.a2 >= 22 && pct(op.m2, op.a2) > 0.6) {
      const g = best(team[t].filter(P => P.on || pl.rot.has(P)), P => P.pf.rimD);
      if (g && g.pf.rimD >= 64 && dp.scheme !== "goalie") ideas.push({ key: "scheme", to: "goalie", why: "paint", v: (pct(op.m2, op.a2) - 0.5) * op.a2 * 0.5, g });
      else if (dp.scheme !== "zone") ideas.push({ key: "scheme", to: "zone", why: "paint", v: (pct(op.m2, op.a2) - 0.5) * op.a2 * 0.4 });
    }
    if (my.hitFouls >= 4 && dp.hit !== "disciplined") ideas.push({ key: "hit", to: dp.hit === "blitz" ? "contain" : "disciplined", why: "fouls", v: my.hitFouls * 0.6 });
    if (my.forced >= 4 && my.broken <= my.forced * 0.6 && dp.hit !== "blitz" && my.hitFouls < 3) ideas.push({ key: "hit", to: dp.hit === "disciplined" ? "contain" : "blitz", why: "working", v: my.forced * 0.5 });
    if (my.broken >= 5 && my.broken > my.forced && dp.hit !== "disciplined") ideas.push({ key: "hit", to: dp.hit === "blitz" ? "contain" : "disciplined", why: "broken", v: my.broken * 0.5 });
    if (my.tackled >= (when === "half" ? 5 : 7) && pl.sys !== "motion") ideas.push({ key: "sys", to: "motion", why: "tackled", v: my.tackled * 0.6 });
    const star = best(G.lineup[o].concat(team[o].filter(P => !P.on && P.secs > 300)), P => G.pp[P.idx]);
    const need = when === "half" ? 18 : when === "q4" ? 26 : 22;
    if (star && G.pp[star.idx] >= need && dp.dblTarget !== star.idx) ideas.push({ key: "double", to: star.idx, why: "star", v: (G.pp[star.idx] - need + 4) * 0.4 });
    if (my.covA >= 7 && my.covP / my.covA > 1.3 && dp.scheme !== "switch" && dp.scheme !== "zone") { // the pick-and-roll is killing them
      let alt = null, av = -1e9; for (const k in dp.cfit) if (k !== dp.cov && k !== "switch" && dp.cfit[k] > av) { av = dp.cfit[k]; alt = k; }
      if (alt) ideas.push({ key: "cov", to: alt, why: "pnr", v: (my.covP / my.covA - 1.1) * my.covA * 0.5 });
    }
    const A = G.adj[t], sp = my.poss - A.poss, sppp = sp > 0 ? (my.pts - A.pts) / sp : 1.1; // judge this system on its own trips
    if (sp >= 14 && sppp < 0.98) {
      let alt = null, av = -1e9; for (const k in pl.fit) if (k !== pl.sys && !A.tried.has(k) && pl.fit[k] > av) { av = pl.fit[k]; alt = k; }
      if (alt && av > -5) ideas.push({ key: "sys", to: alt, why: "stuck", v: (1.02 - sppp) * 12 });
    }
    // no flip-flopping: one change per kind of decision every few minutes, and never back to a system he gave up on
    for (let i = ideas.length - 1; i >= 0; i--) { const x = ideas[i]; if (G.tick - (A.at[x.key] || -1e9) < 9000 || (x.key === "sys" && A.tried.has(x.to))) ideas.splice(i, 1); }
    ideas.sort((a, b) => b.v - a.v);
    const n = when === "half" ? 2 : 1, used = new Set();
    for (const idea of ideas) {
      if (used.size >= n) break;
      if (idea.v <= 0.4 || used.has(idea.key)) continue;
      used.add(idea.key); applyAdjust(t, idea);
    }
  }
  function applyAdjust(t, idea) {
    const pl = PL[t], dp = DP[t], A = G.adj[t]; let from;
    A.at[idea.key] = G.tick;
    if (idea.key === "sys") { A.tried.add(pl.sys); A.tried.add(idea.to); A.pts = G.ts[t].pts; A.poss = G.ts[t].poss; }
    if (idea.key === "sys") {
      from = pl.sys; pl.sys = idea.to; pl.pace = clamp(TAC[t].pace + SYSTEMS[idea.to].pace, -1, 1);
      pl.crash = clamp(Math.round(SYSTEMS[idea.to].crash - pl.pace * 1.2), 0, 3); pl.leak = !!SYSTEMS[idea.to].leak || TAC[t].pace > 0.6;
      assignJobs(t);
    } else if (idea.key === "scheme") {
      from = dp.scheme; dp.scheme = idea.to;
      if (idea.to === "goalie") dp.goalieP = idea.g || best(team[t], P => P.pf.rimD);
      setZones(t);
    } else if (idea.key === "hit") { from = dp.hit; dp.hit = idea.to; }
    else if (idea.key === "cov") { from = dp.cov; dp.cov = idea.to; G.ts[t].covA = 0; G.ts[t].covP = 0; }
    else if (idea.key === "double") { from = dp.dblTarget; dp.dblTarget = idea.to; dp.dblRate = clamp(dp.dblRate + 0.2, 0.2, 0.4); }
    ev("adjust", { team: t, key: idea.key, from, to: idea.to, why: idea.why, pid: idea.key === "double" ? idea.to : idea.key === "scheme" && idea.to === "goalie" ? dp.goalieP.idx : undefined,
      pace: idea.key === "sys" ? Math.round(pl.pace * 100) / 100 : undefined, crash: idea.key === "sys" ? pl.crash : undefined, leak: idea.key === "sys" ? pl.leak : undefined });
    if (G.phase === "live") assignMatches();
  }

  // ---- tip-off ----
  function setupTip() {
    G.phase = "tip"; G.phaseT = 0; G.tipDone = false; G.clockRun = false; G.shotRun = false;
    B.mode = "dead"; B.holder = null; B.x = 47; B.y = 25; B.z = 4; B.vx = B.vy = B.vz = 0;
    for (let t = 0; t < 2; t++) {
      const s = attSide(t, G.per), dx = s === 1 ? -1 : 1; // own defensive half direction
      G.lineup[t].forEach((P, i) => {
        const spots = [[1.4, 0], [10, -12], [10, 12], [16, -4], [16, 4]];
        const sp = i === 4 ? spots[0] : spots[i + 1 > 4 ? 4 : i + 1];
        P.tx = 47 + dx * sp[0]; P.ty = 25 + sp[1]; P.urg = 0.6;
        if (G.tick === 0) { P.x = P.tx; P.y = P.ty; }
      });
    }
    ev("period_start", { l0: G.lineup[0].map(P => P.idx), l1: G.lineup[1].map(P => P.idx) });
  }
  function tipStep() {
    G.phaseT += DT;
    const j0 = G.lineup[0][4], j1 = G.lineup[1][4];
    if (G.phaseT >= 1.0 && G.phaseT < 1.0 + DT * 0.99) { B.mode = "dead"; B.x = 47; B.y = 25; B.z = 6.5; B.vz = 17; B.vx = B.vy = 0; }
    for (const J of [j0, j1]) { const tA = Math.sqrt(2 * J.vertFt / GRAV); if (!J.air && G.phaseT >= 1.0 + 0.53 - tA && G.phaseT < 1.6) doJump(J, 1, "rebound"); }
    if (G.phaseT >= 1.53 && !G.tipDone) {
      G.tipDone = true;
      const s0 = j0.reach + j0.vertFt + rng.range(0, 0.7), s1 = j1.reach + j1.vertFt + rng.range(0, 0.7);
      const w = s0 >= s1 ? 0 : 1, J = w === 0 ? j0 : j1;
      if (G.per === 1) G.tipWinner = w;
      ev("tip", { team: w, pid: J.idx });
      newPossession(w);
      const M = G.lineup[w].find(Q => Q.job === "c1" && Q !== J) || G.lineup[w][0];
      launchPass(J, M, B.x, B.y, B.z, false);
      G.phase = "live"; G.clockRun = true; G.shotRun = true;
    }
  }
  function endPeriod() {
    G.periodEnding = false; G.clockRun = false; G.shotRun = false;
    ev("period_end", {});
    if (G.per >= 4 && G.score[0] !== G.score[1]) { G.phase = "final"; ev("final", {}); return; }
    G.per++; G.clock = G.per <= 4 ? C.QLEN : C.OTLEN; G.tf = [0, 0];
    if (G.per === 3) G.to = [3, 3]; else if (G.per >= 5) G.to = [1, 1];
    for (const P of all) { P.energy = Math.min(1, P.energy + (G.per === 3 ? 0.35 : 0.15)); P.st = "ok"; P.air = false; P.z = 0; P.gather = false; P.swat = null; P.lunge = null; P.contestAt = -1; P.leakT = 0; P.backT = 0; P.lob = null; P.iso = null; }
    B.mode = "dead"; B.holder = null; B.shot = null; B.pass = null; G.reboundable = false; G.inbound = false; G.fumble = null; G.fouler = null; G.dbl = null; G.trans = [-1, -1];
    if (G.per === 3) { coachAdjust(0, "half"); coachAdjust(1, "half"); }
    else if (G.per === 4) { coachAdjust(0, "q4"); coachAdjust(1, "q4"); }
    doSubs(0); doSubs(1);
    if (G.per >= 5) { setupTip(); return; }
    const t = G.per === 4 ? G.tipWinner : 1 - G.tipWinner;
    ev("period_start", { l0: G.lineup[0].map(P => P.idx), l1: G.lineup[1].map(P => P.idx) });
    deadInbound(t, baselineSpot(t), { wait: 3, kind: "period", noSubs: true, resetShot: true });
    G.off = t; newPossession(t); G.shotRun = false;
  }

  // ---- animation state (does not affect the simulation) ----
  const AIR = { shoot: ACT.SHOOT, layup: ACT.LAYUP, dunk: ACT.DUNK, contest: ACT.CONTEST, rebound: ACT.REBOUND, swat: ACT.SWAT, hurdle: ACT.HURDLE };
  function animUpdate() {
    const H = B.mode === "held" ? B.holder : null;
    const huddle = G.phase === "dead" && G.dead && G.dead.to > 0;
    for (const P of onC()) {
      if (P.catchT > 0) P.catchT -= DT; if (P.reachT > 0) P.reachT -= DT; if (P.celebT > 0) P.celebT -= DT; if (P.callT > 0) P.callT -= DT; if (P.moveT > 0) P.moveT -= DT;
      const hp = hoopOf(P.t);
      let a = ACT.NONE, fx = 0, fy = 0, look = null;
      if (P.fightRole && G.fight) { a = P.fightRole === "fight" && G.tick - G.fight.t0 < G.fight.sepT ? ACT.FIGHT : ACT.HOLD; look = P === G.fight.A ? G.fight.B : P === G.fight.B ? G.fight.A : G.fight.A; }
      else if (P.st === "down") a = P.hurt ? ACT.HURT : P.stT < 0.45 ? ACT.GETUP : ACT.DOWN;
      else if (P.st === "lunge") { a = P.lunge.tech === "dive" ? ACT.DIVE : P.lunge.tech === "hit" ? ACT.BIGHIT : ACT.TACKLE; look = P.lunge.H; }
      else if (P.moveT > 0 && P.move && P.move !== "hurdle" && !P.air) a = P.move === "spin" ? ACT.SPIN : P.move === "stiff" ? ACT.STIFFARM : ACT.JUKE;
      else if (P.st === "stun") a = ACT.STUMBLE;
      else if (huddle) a = ACT.HUDDLE;
      else if (P === H) {
        if (P.gather) a = P.action === "pass" ? ACT.PASS : P.action === "finish" ? (P.finishType === "dunk" ? ACT.DUNK : ACT.LAYUP) : ACT.SHOOT;
        else if (G.inbound) a = ACT.INBOUND;
        else if (P.post) a = ACT.POST;
        else if (P.callT > 0) a = ACT.CALL;
        else a = ACT.DRIBBLE;
      }
      else if (P.air && P.airAct) a = AIR[P.airAct] || ACT.REBOUND;
      else if (G.phase === "ft" && G.ftS && G.ftS.P === P) a = ACT.FT;
      else if (P.celebT > 0 && P.celebT < 1.5) a = ACT.CELEBRATE;
      else if (P.catchT > 0) a = ACT.CATCH;
      else if (P.reachT > 0) a = ACT.REACH;
      else if (P.screen && P.screen.phase === "set") a = ACT.SCREEN;
      else if (P.boxT > 0) a = ACT.BOXOUT;
      else if (G.phase === "live" && P.t !== G.off && DP[P.t].scheme === "goalie" && DP[P.t].goalieP === P && hyp(P.x - hoopOf(G.off).x, P.y - hoopOf(G.off).y) < 6) a = ACT.WALL;
      else if (H && P.t !== H.t && (G.match.get(P) === H || (G.dbl && G.dbl.D === P)) && dist(P, H) < 8) a = ACT.STANCE;
      if (a !== P.act) { P.act = a; P.actT = 0; } else P.actT += DT;
      // which way he's facing
      if (look) { fx = look.x - P.x; fy = look.y - P.y; }
      else if (a === ACT.POST) { fx = P.x - hp.x; fy = P.y - hp.y; }
      else if (a === ACT.HUDDLE) { fx = 47 + (P.t === 0 ? -9 : 9) - P.x; fy = -1.2 - P.y; }
      else if (a === ACT.WALL) { fx = B.x - P.x; fy = B.y - P.y; }
      else if (P === H || a === ACT.SHOOT || a === ACT.LAYUP || a === ACT.DUNK || a === ACT.FT) {
        if (P.gather && P.action === "pass" && P.target) { fx = P.target.x - P.x; fy = P.target.y - P.y; }
        else if (a === ACT.INBOUND) { fx = 47 - P.x; fy = 25 - P.y; }
        else { fx = hp.x - P.x; fy = hp.y - P.y; }
      } else {
        const sp = hyp(P.vx, P.vy), man = G.match.get(P);
        if (G.phase === "ft" && G.ftS) { const fh = hoopOf(G.ftS.P.t); fx = fh.x - P.x; fy = fh.y - P.y; }
        else if (P.t !== G.off && man && sp < 11) { const tg = a === ACT.BOXOUT ? man : (H || man); fx = tg.x - P.x; fy = tg.y - P.y; }
        else if (sp > 5) { fx = P.vx; fy = P.vy; }
        else { fx = B.x - P.x; fy = B.y - P.y; }
      }
      if (fx * fx + fy * fy > 0.01) {
        let dA = datan2(fy, fx) - P.face; dA -= TWO_PI * Math.round(dA / TWO_PI);
        P.face += dA * Math.min(1, (a === ACT.TACKLE || a === ACT.DIVE || a === ACT.BIGHIT ? 14 : a === ACT.SPIN ? 20 : 8) * DT);
      }
    }
  }

  // ---- main loop ----
  function step() {
    if (G.fight) fightStep(); // the dead ball (or the free throws) wait for the fight
    else if (G.phase === "tip") tipStep();
    else if (G.phase === "dead") deadStep();
    else if (G.phase === "ft") ftStep();
    if (G.phase === "live") {
      if (G.tick % 10 === 0) defenseIntent();
      if (DP[1 - G.off].scheme === "zone" && G.tick % 5 === 0) zoneMatch();
      const H = B.mode === "held" ? B.holder : null;
      G.help = null;
      if (H && !G.inbound && H.t === G.off) doubleCheck(H); else if (!H) G.dbl = null;
      if (G.cov && (G.tick >= G.cov.until || !H || H !== G.cov.H)) G.cov = null;
      runSet();
      if (G.tick % 20 === 7 && !(G.trans[G.off] > G.tick)) scram();

      if (H && H.driving && !G.inbound) { // has the driver beaten his man? then someone has to help
        const h = hoopOf(G.off), Dh = defenderOf(H), dH = hyp(H.x - h.x, H.y - h.y);
        const beaten = !Dh || Dh.st !== "ok" || hyp(Dh.x - h.x, Dh.y - h.y) > dH + 0.5 || Dh.screenedT > 0;
        const reach = DP[1 - G.off].scheme === "extend" ? 16 : 24;
        if (beaten && dH < reach) {
          const px = h.x + (H.x - h.x) / Math.max(dH, 0.1) * Math.min(5.5, dH * 0.5), py = h.y + (H.y - h.y) / Math.max(dH, 0.1) * Math.min(5.5, dH * 0.5);
          let hp = G.rimProt[1 - G.off];
          if (!hp || hp === Dh || hp.st !== "ok" || !hp.on) { hp = null; let bd = 1e9; for (const D of G.lineup[1 - G.off]) { if (D === Dh || D.st !== "ok") continue; const dd = hyp(D.x - px, D.y - py); if (dd < bd) { bd = dd; hp = D; } } }
          if (hp) G.help = { D: hp, x: px, y: py };
        }
      }
      if (H && H.t === G.off) handlerAI(H);
      for (const P of G.lineup[G.off]) if (P !== H) offAI(P);
      for (const D of G.lineup[1 - G.off]) defAI(D, H && H.t === G.off ? H : null);
      if (B.mode === "loose") reboundAI();
    }
    physics();
    if (G.phase !== "final") ballStep();
    if (REC) animUpdate(); // presentation only: never feeds back into the simulation
    // clocks
    if (G.clockRun) {
      G.clock -= DT;
      if (G.clock <= 0) { G.clock = 0; G.clockRun = false; G.periodEnding = true; }
    }
    if (G.shotRun && G.phase === "live") {
      G.shotClock -= DT;
      if (G.shotClock <= 0) {
        G.shotClock = 0;
        if (B.mode === "held" || B.mode === "pass" || (B.mode === "loose" && !G.reboundable)) {
          const H = B.mode === "held" ? B.holder : G.lastHandler;
          ev("violation", { kind: "shotclock", team: G.off });
          if (H) ev("to", { pid: H.idx, team: H.t, kind: "shotclock", by: -1 });
          if (H) { H.gather = false; H.driving = false; }
          B.mode = "dead"; B.holder = null; G.fumble = null;
          deadInbound(1 - G.off, sidelineSpot(B.x, B.y), { wait: 1.4, kind: "shotclock" });
        }
      }
    }
    if (G.injWhistle >= 0 && G.tick >= G.injWhistle && G.phase === "live" && B.mode === "held" && !B.holder.gather && !B.holder.air && !G.inbound) { // the refs stop it for the injured man
      const H = B.holder; G.injWhistle = -1; H.driving = false; ev("whistle", { kind: "injury" });
      B.mode = "dead"; B.holder = null; deadInbound(H.t, sidelineSpot(H.x, H.y), { wait: 3.2, kind: "injury", keepShot: 1 });
    }
    if (G.periodEnding && B.mode !== "shot" && G.phase !== "ft" && G.phase !== "final") endPeriod();
  }

  buildPlans();
  setupTip();
  const MAXT = 220000;
  while (G.phase !== "final" && G.tick < MAXT) {
    if (REC && G.tick % 2 === 0) rec();
    step();
    G.tick++;
  }
  if (REC) rec();
  const roster = all.map(P => ({ idx: P.idx, id: P.p.id, t: P.t, name: P.p.first + " " + P.p.last, short: P.p.first[0] + ". " + P.p.last, num: P.p.num, role: P.p.role, starter: P.starter, secs: P.secs, ht: P.p.ht, wt: P.p.wt, arch: P.arch, darch: P.darch, hurt: P.hurt ? P.hurt.k : undefined }));
  return {
    engineVersion: ENGINE_VERSION, seed, home: home.id, away: away.id, rules: RULES,
    score: G.score.slice(), periods: G.per, ticks: G.tick, poss: [G.ts[0].poss, G.ts[1].poss],
    frames: F.subarray(0, nf * FS), nFrames: nf, events: G.events, roster
  };
}

// ===================== BOX SCORE (derived only from the event log) =====================
function gameSec(per, clk) { return per <= 4 ? (per - 1) * C.QLEN + (C.QLEN - clk) : 4 * C.QLEN + (per - 5) * C.OTLEN + (C.OTLEN - clk); }
function boxScore(game, uptoTick, nowPer, nowClk) {
  const S = game.roster.map(r => ({ idx: r.idx, t: r.t, secs: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fpm: 0, fpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, tkl: 0, btk: 0, pf: 0, dnk: 0, played: false }));
  const onSince = new Map();
  for (const e of game.events) {
    if (e.tk > uptoTick) break;
    const g = gameSec(e.per, e.clk);
    switch (e.type) {
      case "period_start": for (const i of e.l0.concat(e.l1)) { onSince.set(i, g); S[i].played = true; } break;
      case "period_end": for (const [i, s] of onSince) S[i].secs += g - s; onSince.clear(); break;
      case "sub": if (onSince.has(e.out)) { S[e.out].secs += g - onSince.get(e.out); onSince.delete(e.out); } onSince.set(e.inn, g); S[e.inn].played = true; break;
      case "fga": {
        const s = S[e.pid]; s.fga++; if (e.val === 3) s.tpa++; if (e.val === 4) s.fpa++;
        if (e.made) { s.fgm++; s.pts += e.val; if (e.val === 3) s.tpm++; if (e.val === 4) s.fpm++; if (e.dunk) s.dnk++; if (e.ast >= 0) S[e.ast].ast++; }
        if (e.blk >= 0 && e.blk !== undefined) S[e.blk].blk++;
        break;
      }
      case "ft": { const s = S[e.pid]; s.fta++; if (e.made) { s.ftm++; s.pts++; } break; }
      case "reb": if (e.off) S[e.pid].oreb++; else S[e.pid].dreb++; break;
      case "to": S[e.pid].to++; if (e.kind === "steal" || e.kind === "loose") { if (e.by >= 0) S[e.by].stl++; } break;
      case "tackle": if (e.result === "down" || e.result === "fumble") S[e.pid].tkl++; if (e.result === "broken" || (e.result === "whiff" && e.move)) S[e.on].btk++; break;
      case "foul": S[e.pid].pf++; break;
    }
  }
  if (nowPer !== undefined) { const g = gameSec(nowPer, nowClk); for (const [i, s] of onSince) S[i].secs += Math.max(0, g - s); }
  return S;
}
// Each team's plan, adjustments, points by play type and by set, coverages, tackling and play calls, from the event log.
function strategyReport(game, uptoTick) {
  const T = [0, 1].map(() => ({ plan: null, adjust: [], pts: {}, att: {}, calls: {}, sets: {}, tk: { down: 0, fumble: 0, broken: 0, whiff: 0, late: 0, rough: 0, gang: 0, flagrant: 0, pop: 0 },
    moves: {}, movesTried: {}, tech: {}, fouls: {}, recov: 0, cover: {}, covPts: {}, covAtt: {}, mismatch: 0, mmAlert: 0,
    fights: [], marks: [], heat: [], mood: [], nocall: 0, pileon: 0, targeting: 0, scram: 0, inj: [], ejected: [], ato: 0, blob: 0 }));
  if (uptoTick === undefined) uptoTick = 1e12;
  const S = (X, k) => X.sets[k] || (X.sets[k] = { n: 0, pts: 0, att: 0 });
  for (const e of game.events) {
    if (e.tk > uptoTick) break;
    const X = T[e.team];
    switch (e.type) {
      case "plan": X.plan = e; break;
      case "adjust": X.adjust.push(e); break;
      case "fga": {
        const k = e.pt || "pullup"; X.att[k] = (X.att[k] || 0) + 1; if (e.made) X.pts[k] = (X.pts[k] || 0) + e.val;
        if (e.set) { const st = S(X, e.set); st.att++; if (e.made) st.pts += e.val; }
        if (e.cov) { const D = T[1 - e.team]; D.covAtt[e.cov] = (D.covAtt[e.cov] || 0) + 1; if (e.made) D.covPts[e.cov] = (D.covPts[e.cov] || 0) + e.val; }
        break;
      }
      case "ft": if (e.made) X.pts.ft = (X.pts.ft || 0) + 1; X.att.ft = (X.att.ft || 0) + (e.n === 1 ? 1 : 0); break;
      case "call":
        X.calls[e.kind] = (X.calls[e.kind] || 0) + 1;
        if (e.set) { S(X, e.set).n++; if (e.ato) X.ato++; if (e.hunt) X.mismatch++; if (e.set === "blob") X.blob++; }
        break;
      case "cover": X.cover[e.kind] = (X.cover[e.kind] || 0) + 1; break;
      case "mismatch": X.mmAlert++; break;
      case "scram": X.scram++; break;
      case "tackle":
        X.tk[e.result] = (X.tk[e.result] || 0) + 1; if (e.gang) X.tk.gang++;
        if (e.result === "nocall") X.nocall++; if (e.result === "pileon") X.pileon++; if (e.targeting) X.targeting++;
        if (e.result === "fumble" && e.drib) X.tk.pop++;
        if (e.tech) X.tech[e.tech] = (X.tech[e.tech] || 0) + 1;
        if (e.move) { const O = T[1 - e.team]; O.movesTried[e.move] = (O.movesTried[e.move] || 0) + 1; if (!e.moveFail) O.moves[e.move] = (O.moves[e.move] || 0) + 1; }
        break;
      case "foul": X.fouls[e.kind || "personal"] = (X.fouls[e.kind || "personal"] || 0) + 1; break;
      case "recover": if (!e.own) X.recov++; break;
      case "injury": X.inj.push(e); break;
      case "ejected": X.ejected.push(e); break;
      case "fight": X.fights.push(e); break;
      case "enforcer": X.marks.push(e); break;
      case "heat": X.heat.push(e); break;
      case "mood": X.mood.push(e); break;
    }
  }
  return T;
}

const ENGINE_API = { ACT, BALL_MODE, simulateGame, boxScore, strategyReport, C, shotValue, makeRng, hashStr, ENGINE_VERSION, gameSec, clamp, attSide, dsin, dcos, dlog, datan2,
  SYSTEMS, SCHEMES, HITS, ARCH, DARCH, JOBS, PT_LABEL, SETS, COVERS, INJURIES, MOVES, TECHS, RULE_YEARS, RULE_NOTES, profile, archetype, rulesFor, ftProb };
if (typeof module !== "undefined" && module.exports) module.exports = ENGINE_API;
else if (typeof window !== "undefined") window.BB = Object.assign(window.BB || {}, ENGINE_API);
