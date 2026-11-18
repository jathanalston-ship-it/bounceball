// ===================== BOUNCEBALL GAME ENGINE =====================
// Pure, seeded, deterministic. No DOM. Same seed + same rosters + same ENGINE_VERSION = same game.
// That means a stored game only needs {seed, engineVersion, rosters}; frames can be re-derived.
"use strict";
const ENGINE_VERSION = "0.3.0";
const C = {
  L: 94, W: 50, HX: [5.25, 88.75], HY: 25, RIM: 10,
  R3: 23.75, C3: 22, C3X: 14.2, R4: 30, FTD: 15,
  DT: 0.05, G: 32.2, QLEN: 720, OTLEN: 300, SC: 24,
  FLOOR_E: 0.8,          // floor restitution: the Akron-spec rubber floor bounces livelier than hardwood
  FLOOR_VERT_IN: 12,     // average vertical boost from the floor (inches)
  FS: 92                 // floats per recorded frame: 10 players x 8, ball x 5, game state x 7
};
const DT = C.DT, GRAV = C.G;
// What each player is doing, recorded in every frame so the broadcast can animate it.
const ACT = { NONE: 0, DRIBBLE: 1, SHOOT: 2, LAYUP: 3, DUNK: 4, PASS: 5, CATCH: 6, TACKLE: 7, DOWN: 8, GETUP: 9, CONTEST: 10, REBOUND: 11, SWAT: 12,
  CELEBRATE: 13, STANCE: 14, BOXOUT: 15, SCREEN: 16, FT: 17, INBOUND: 18, STUMBLE: 19, REACH: 20, POST: 21, HUDDLE: 22 };
const BALL_MODE = { held: 0, pass: 1, shot: 2, loose: 3, dead: 4, ftshot: 5 };
const DEF_TAC = { pace: 0, tackle: 1, four: 1, sw: 0.5, depth: 9, d: 0, o: 0 };

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function hyp(x, y) { return Math.sqrt(x * x + y * y); }
function dist(a, b) { return hyp(a.x - b.x, a.y - b.y); }
// side index (0 = left hoop, 1 = right hoop) that team t attacks in a period
function attSide(t, per) { return ((t === 0) !== (per >= 3)) ? 1 : 0; }
function dirOf(side) { return side === 1 ? -1 : 1; } // unit x from that hoop toward midcourt
function shotValue(x, y, side) {
  const hx = C.HX[side], d = hyp(x - hx, y - C.HY);
  if (d >= C.R4) return 4;
  const fromBase = side === 1 ? C.L - x : x;
  if (Math.abs(y - C.HY) >= C.C3 && fromBase <= C.C3X) return 3;
  if (d >= C.R3) return 3;
  return 2;
}


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

// offensive spots in hoop frame: [distance out from hoop toward midcourt, lateral offset]
const SPOTS = {
  TOP:[26,0], WING_L:[19,-17], WING_R:[19,17], CORNER_L:[1,-22.6], CORNER_R:[1,22.6],
  FOUR_TOP:[32,0], FOUR_L:[24,-19.6], FOUR_R:[24,19.6],
  DUNK_L:[1.5,-7], DUNK_R:[1.5,7], ELBOW_L:[14,-6], ELBOW_R:[14,6], POST_L:[5,-6.5], POST_R:[5,6.5]
};
const SPOT_PREFS = {
  PG:["TOP","WING_L","WING_R"], WING:["WING_L","WING_R","CORNER_L","CORNER_R"],
  SNIPER:["FOUR_L","FOUR_R","FOUR_TOP","WING_L"], BRUISER:["ELBOW_L","ELBOW_R","DUNK_L","CORNER_R"],
  BIG:["DUNK_R","DUNK_L","POST_L","POST_R"]
};

// ===================== GAME SIMULATION =====================
function simulateGame(home, away, rosters, seed, opts) {
  opts = opts || {}; const REC = opts.frames !== false;
  const rng = makeRng(seed);
  const all = [], team = [[], []];
  for (let t = 0; t < 2; t++) for (const p of rosters[t]) {
    const r = p.r;
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
      screen: null, pnr: null, post: null, screenedT: 0, curl: null, waitScreen: false, finishType: null
    };
    all.push(P); team[t].push(P);
  }
  const G = {
    tick: 0, per: 1, clock: C.QLEN, shotClock: C.SC, shotRun: false, clockRun: false,
    score: [0, 0], off: 0, phase: "tip", phaseT: 0, lineup: [[], []], match: new Map(),
    events: [], tf: [0, 0], lastPass: null, lastShotTeam: -1, reboundable: false, periodEnding: false,
    tipWinner: 0, dead: null, ftS: null, rimProt: [null, null], lastHandler: null, inbound: false,
    looseT: 0, deflector: null, tipDone: false, possStart: 0, possLive: false,
    run: { team: -1, pts: 0 }, to: [3, 3], screenCD: [0, 0], offScreenCD: [0, 0], help: null
  };
  const TAC = [0, 1].map(t => Object.assign({}, DEF_TAC, (opts.tactics || [])[t] || {}));
  const B = { x: 47, y: 25, z: 0, vx: 0, vy: 0, vz: 0, mode: "dead", holder: null, shot: null, pass: null, t: 0, lastTouch: -1 };
  for (let t = 0; t < 2; t++) for (let s = 0; s < 5; s++) {
    const P = team[t][s]; P.on = true; P.slot = s; P.homeSlot = s; P.starter = true; G.lineup[t][s] = P;
  }

  function ev(type, d) {
    const e = Object.assign({ tk: G.tick, per: G.per, clk: Math.round(G.clock * 10) / 10, s0: G.score[0], s1: G.score[1], type }, d || {});
    G.events.push(e); return e;
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
    G.score[t] += v;
    if (G.run.team === t) G.run.pts += v; else G.run = { team: t, pts: v };
  }
  function defenderOf(P) { for (const [D, M] of G.match) if (M === P) return D; return null; }
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
    p *= 0.86 + 0.14 * P.energy;
    return clamp(p, 0.02, 0.97);
  }
  function evalAt(P, x, y) {
    const h = hoopOf(P.t); const d = hyp(x - h.x, y - h.y); const val = shotValue(x, y, h.side);
    let cd = 99, cD = null;
    for (const D of G.lineup[1 - P.t]) { if (D.st === "down") continue; const dd = hyp(D.x - x, D.y - y); if (dd < cd) { cd = dd; cD = D; } }
    const p = makeProb(P, val, d, cd, cD);
    return { p, val, ev: p * val, d, cd };
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
    return s + Math.sqrt(L2) * 0.004;
  }
  function spotXY(P, t) {
    const h = hoopOf(t); const s = SPOTS[P.spot] || SPOTS.TOP;
    return { x: h.x + h.dir * s[0], y: h.y + s[1] };
  }
  function assignSpots(t) {
    const used = new Set();
    const order = ["BIG","SNIPER","PG","WING","BRUISER"];
    const L = G.lineup[t].slice().sort((a, b) => order.indexOf(a.p.role) - order.indexOf(b.p.role));
    for (const P of L) {
      let prefs = SPOT_PREFS[P.p.role].slice(); if (rng.chance(0.5)) prefs = prefs.map(s => s.endsWith("_L") ? s.replace("_L","_R") : s.endsWith("_R") ? s.replace("_R","_L") : s);
      const all2 = prefs.concat(Object.keys(SPOTS));
      P.spot = all2.find(s => !used.has(s)); used.add(P.spot); P.cutT = 0;
    }
  }
  function assignMatches() {
    const off = G.off, def = 1 - off; G.match.clear();
    for (let s = 0; s < 5; s++) G.match.set(G.lineup[def][s], G.lineup[off][s]);
    let best = null; for (const D of G.lineup[def]) if (!best || D.p.r.rim > best.p.r.rim) best = D;
    G.rimProt[def] = best;
  }
  function newPossession(t) {
    G.off = t; G.shotClock = C.SC; G.shotRun = true; G.lastPass = null; G.possStart = G.tick;
    assignSpots(t); assignMatches();
  }
  function gain(P) {
    B.mode = "held"; B.holder = P; B.lastTouch = P.t; B.pass = null; B.shot = null; G.looseT = 0;
    if (P.t !== G.off) { newPossession(P.t); G.possLive = true; }
    P.decT = 0.25; P.gather = false; P.driving = false; P.probe = null; G.lastHandler = P; P.holdT = 0;
  }

  // ---- substitutions ----
  function doSubs(t, except) {
    const L = G.lineup[t]; let swapped = false;
    const close = G.per >= 4 && G.clock < 300 && Math.abs(G.score[0] - G.score[1]) < 10;
    const depth = TAC[t].depth, outAt = close ? 0.4 : 0.58 + (depth - 9) * 0.025;
    const rotation = new Set(team[t].slice().sort((a, b) => b.p.ovr - a.p.ovr).slice(0, depth));
    for (let s = 0; s < 5; s++) {
      const P = L[s]; if (P === except) continue;
      const bench = team[t].filter(Q => !Q.on && Q.fouls < 6 && (rotation.has(Q) || P.fouls >= 6));
      if (!bench.length) break;
      const forced = P.fouls >= 6;
      let cand = null;
      if (forced || P.energy < outAt) {
        let best = null, bs = -1e9;
        for (const Q of bench) {
          if (!forced && Q.energy < 0.8) continue;
          const sc = Q.p.ovr + (Q.p.role === P.p.role ? 12 : 0) + Q.energy * 10;
          if (sc > bs) { bs = sc; best = Q; }
        }
        cand = best;
      } else if (!P.starter) {
        cand = bench.find(Q => Q.starter && Q.homeSlot === s && Q.energy > 0.88) || null;
      }
      if (cand) {
        cand.on = true; cand.slot = s; cand.x = P.x; cand.y = P.y; cand.vx = cand.vy = 0; cand.z = 0; cand.air = false;
        cand.st = "ok"; cand.gather = false; cand.driving = false; cand.spot = P.spot; cand.swat = null; cand.contestAt = -1;
        cand.face = P.face; cand.screen = null; cand.pnr = null; cand.post = null; cand.curl = null; cand.waitScreen = false; P.screen = null;
        P.on = false; P.slot = -1; P.gather = false; L[s] = cand; swapped = true;
        ev("sub", { team: t, inn: cand.idx, out: P.idx });
      }
    }
    if (swapped) { assignMatches(); }
  }

  // ---- dead balls / inbounds ----
  function sidelineSpot(x, y) { return { x: clamp(x, 8, 86), y: y < 25 ? -1.2 : C.W + 1.2 }; }
  function baselineSpot(t) { // team t inbounds from the baseline under the hoop it defends
    const s = 1 - attSide(t, G.per); return { x: s === 0 ? -1.2 : C.L + 1.2, y: 21 };
  }
  function deadInbound(t, spot, o) {
    o = o || {};
    G.phase = "dead"; G.clockRun = !!o.keepClock; G.shotRun = false; G.inbound = false;
    B.holder = null; if (B.mode !== "dead") { B.mode = "dead"; }
    const change = t !== G.off;
    // timeouts: stop a run, or set up a late possession
    let toT = 0;
    if (o.kind === "make" || o.kind === "foul" || o.kind === "oob" || o.kind === "tackle") {
      const opp = 1 - t;
      if (G.run.team === opp && G.run.pts >= 8 && G.to[t] > 0 && rng.chance(0.7)) toT = 7;
      else if (G.per >= 4 && G.clock > 0 && G.clock < 40 && G.to[t] > 0 && G.score[opp] > G.score[t] && G.score[opp] - G.score[t] <= 4 && rng.chance(0.5)) toT = 6;
      if (toT) { G.to[t]--; G.run.pts = 0; G.clockRun = false; ev("timeout", { team: t }); for (const P of onC()) P.energy = Math.min(1, P.energy + 0.05); }
    }
    for (const P of onC()) { P.screen = null; P.pnr = null; P.post = null; P.curl = null; P.waitScreen = false; P.boxT = 0; P.crashT = 0; }
    if (!o.noSubs) { doSubs(0); doSubs(1); }
    if (change) newPossession(t); else { G.off = t; assignMatches(); if (o.keepShot) G.shotClock = Math.max(G.shotClock, o.keepShot); else G.shotClock = C.SC; }
    if (o.resetShot) G.shotClock = C.SC;
    const cands = G.lineup[t].filter(P => P.st !== "down");
    const recv = G.lineup[t].slice().sort((a, b) => (b.p.r.pas + b.p.r.sec) - (a.p.r.pas + a.p.r.sec))[0];
    let inb = null, bd = 1e9;
    for (const P of (cands.length ? cands : G.lineup[t])) { if (P === recv) continue; const d = hyp(P.x - spot.x, P.y - spot.y); if (d < bd) { bd = d; inb = P; } }
    G.dead = { t, spot, timer: (o.wait || 1.4) + toT, inb, recv, kind: o.kind || "", to: toT };
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
    for (const P of G.lineup[t]) {
      if (P.st === "down") continue;
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
      G.phase = "live"; G.inbound = true; G.dead = null; G.possLive = false;
      B.mode = "held"; B.holder = inb; B.lastTouch = t; G.lastHandler = inb;
      inb.gather = true; inb.action = "pass"; inb.target = D.recv; inb.gatherT = 0.3; inb.driving = false;
    }
  }
  function startFT(P, n, kind) {
    G.phase = "ft"; G.clockRun = false; G.shotRun = false; G.inbound = false;
    B.mode = "dead"; B.holder = null;
    doSubs(0, P); doSubs(1, P);
    if (G.off !== P.t) { G.off = P.t; assignMatches(); }
    G.ftS = { P, n, i: 0, wait: 1.8, kind };
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
        const made = rng.next() < clamp((0.5 + P.p.r.ft * 0.0045) * (0.95 + 0.05 * P.energy), 0.3, 0.95);
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
    ev("ft", { pid: P.idx, team: P.t, made, n: S.i + 1, of: S.n });
    S.i++;
    if (S.i < S.n) { S.wait = 1.3; B.mode = "dead"; B.shot = null; return; }
    G.ftS = null;
    if (made) { B.mode = "dead"; B.vx = 0; B.vy = 0; B.vz = -4; deadInbound(1 - P.t, baselineSpot(1 - P.t), { wait: 1.3, kind: "make", resetShot: true }); }
    else { rimBounce(h, P.x, P.y); G.phase = "live"; G.reboundable = true; G.lastShotTeam = P.t; G.clockRun = true; G.shotRun = false; }
  }

  // ---- handler ----
  function newProbe(H, h) {
    const pref = H.p.r.fr > 70 ? 31.5 : H.p.r.thr > 60 ? 25.5 : 21;
    const ang = rng.range(-1.05, 1.05);
    H.probe = { x: clamp(h.x + h.dir * dcos(ang) * pref, 2, C.L - 2), y: clamp(h.y + dsin(ang) * pref, 3, C.W - 3) };
  }
  function beginAction(H, kind, M) {
    const r = H.p.r;
    H.gather = true; H.action = kind; H.target = M || null;
    if (kind === "pass") H.gatherT = 0.3 - r.pas * 0.0016;
    else if (kind === "finish") { H.gatherT = 0.36; H.finishType = canDunk(H) && rng.chance(0.72 + (r.ins - 50) * 0.004) ? "dunk" : "layup"; }
    else {
      const h = hoopOf(H.t); const val = shotValue(H.x, H.y, h.side);
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
    H.decT -= DT; H.holdT = (H.holdT || 0) + DT;
    if (H.post) { // backing his man down toward the block, back to the basket
      H.post.t += DT;
      const dd = Math.max(d, 0.1), want = Math.max(4.5, d - 3);
      H.tx = h.x + (H.x - h.x) / dd * want; H.ty = h.y + (H.y - h.y) / dd * want; H.urg = 0.22;
      if (H.post.t > 4.5) H.post = null;
    } else if (H.pnr) {
      const Sc = H.pnr.S, sc = Sc.screen;
      if (!sc || sc.for !== H || !Sc.on) H.pnr = null;
      else if (sc.phase === "go") { H.tx = H.x; H.ty = H.y; H.urg = 0.15; } // wait for the screen
      else { // come off it toward the middle and the rim
        if (!H.pnr.dest) { const m = Math.sign(25 - Sc.y) || (Sc.idx % 2 ? 1 : -1); H.pnr.dest = { x: clamp(Sc.x + h.dir * 4.5, 2, C.L - 2), y: clamp(Sc.y + m * 4, 3, C.W - 3) }; }
        H.tx = H.pnr.dest.x; H.ty = H.pnr.dest.y; H.urg = 1; H.pnr.t = (H.pnr.t || 0) + DT;
        if (H.pnr.t > 1.3 || hyp(H.x - H.tx, H.y - H.ty) < 1.5) { H.pnr = null; H.probe = null; }
      }
    } else if (H.driving) {
      H.tx = h.x + h.dir * 1.2; H.ty = h.y + (H.y - h.y) * 0.25; H.urg = 1;
      if (d < 5.5) { beginAction(H, "finish"); return; }
    } else if (d > 33) {
      H.tx = h.x + h.dir * 27; H.ty = h.y + (H.y - h.y) * 0.5; H.urg = 0.85;
    } else {
      if (!H.probe || hyp(H.x - H.probe.x, H.y - H.probe.y) < 1.5) newProbe(H, h);
      H.tx = H.probe.x; H.ty = H.probe.y; H.urg = 0.5;
    }
    H.tx = clamp(H.tx, 1.5, C.L - 1.5); H.ty = clamp(H.ty, 1.5, C.W - 1.5);
    if (H.decT <= 0) { H.decT = 0.28 + rng.range(0, 0.25) + (1 - r.iq / 99) * 0.2; decide(H, h, d, inBack); }
  }
  function decide(H, h, d, inBack) {
    const r = H.p.r, sc = G.shotClock;
    const late = (G.shotRun && sc < 4) ? 1 : (G.shotRun && sc < 8) ? 0.5 : 0;
    const buzzer = G.clockRun && G.clock < 2.6 && G.clock < sc;
    const [oD, od] = nearestOpp(H);
    const pressure = od < 3 ? (3 - od) / 3 : 0;
    const tac = TAC[H.t];
    const settle = G.shotRun ? Math.max(0, 14 - 3.5 * tac.pace - (G.tick - G.possStart) * DT) * 0.055 : 0;
    if (buzzer && d < 60) { beginAction(H, d < 5.5 ? "finish" : "shot"); return; }
    const opts = [];
    var base = !G.shotRun ? 1.0 : sc > 15 ? 1.13 : sc > 9 ? 1.04 : sc > 5 ? 0.92 : 0.55;
    opts.push({ k: "hold", s: base - pressure * 0.22 + (H.pnr && !H.pnr.dest ? 0.25 : 0) + (H.post ? 0.05 : 0) });
    if (inBack) {
      // fast break?
      let back = 0; for (const D of G.lineup[1 - H.t]) if (hyp(D.x - h.x, D.y - h.y) < d - 2) back++;
      if (G.possLive && back <= 1 && !H.driving && G.tick - G.possStart < 100) opts.push({ k: "drive", s: 1.4 });
    } else if (d < 40) {
      const e = evalAt(H, H.x, H.y);
      let s = e.ev - 0.05 + late * 0.2 - settle - (H.fga || 0) * 0.016 - (e.val === 4 ? (H.fpa || 0) * 0.015 : 0);
      if (e.val === 4 && r.fr < 55) s -= 0.25;
      if (e.val === 4) s += (tac.four - 1) * 0.3;
      if (H.post && d < 10) s += 0.08;
      if (d > 33) s -= 0.3;
      opts.push({ k: "shoot", s });
      // call a pick-and-roll
      if (!H.pnr && !H.post && !H.driving && G.shotRun && sc > 8 && d > 17 && d < 34 && G.tick > G.screenCD[H.t]) {
        let Sc = null, bv = -1e9;
        for (const M of G.lineup[H.t]) {
          if (M === H || M.st !== "ok" || M.screen || M.cutT > 0 || M.waitScreen) continue;
          const v = (M.p.role === "BIG" || M.p.role === "BRUISER" ? 20 : 0) + M.p.r.str * 0.3 - hyp(M.x - H.x, M.y - H.y) * 0.5;
          if (v > bv) { bv = v; Sc = M; }
        }
        if (Sc && hyp(Sc.x - H.x, Sc.y - H.y) < 32) opts.push({ k: "pnr", s: base - 0.03 + (H.p.role === "PG" ? 0.05 : 0) + tac.o * 0.03, M: Sc });
      }
      // post up
      if (!H.post && !H.driving && !H.pnr && (H.p.role === "BIG" || H.p.role === "BRUISER") && d > 5.5 && d < 16) {
        opts.push({ k: "post", s: base - 0.08 + (r.str - (oD ? oD.p.r.str : 50)) * 0.003 + (r.ins - 50) * 0.004 });
      }
      const lane = laneBlock(H, h, oD);
      if (!H.driving && d > 6 && d < 32) {
        const beat = (r.spd + r.acc) / 2 - (oD ? oD.p.r.perD : 40);
        const finP = makeProb(H, 2, 3, 3.5, null);
        let threat = 0; for (const D of G.lineup[1 - H.t]) if (D.st !== "down" && hyp(D.x - h.x, D.y - h.y) < d) threat += D.p.r.tck / 99 * 0.06;
        opts.push({ k: "drive", s: finP * 2 / (1 + lane * 1.6) + beat * 0.004 + r.brk * 0.0015 - pressure * 0.12 - threat - 0.12 - settle });
      }
      if (H.driving) opts[0].s = 1.05 - lane * 0.45 - pressure * 0.15; // keep attacking
    }
    for (const M of G.lineup[H.t]) {
      if (M === H || M.st === "down") continue;
      const risk = laneRisk(H, M); const far = hyp(M.x - H.x, M.y - H.y);
      let s;
      if (inBack) s = 0.5 + pressure * 0.5 - risk + (hyp(M.x - h.x, M.y - h.y) < d - 10 ? 0.25 : 0);
      else {
        const e = evalAt(M, M.x, M.y);
        const swing = base - 0.16 + Math.min(H.holdT || 0, 4) * 0.045 - (H.p.role === "PG" ? 0.03 : 0);
        s = Math.max(e.ev * 0.93 - settle * 0.5 - (M.fga || 0) * 0.01 - (e.val === 4 ? (M.fpa || 0) * 0.01 : 0) + (e.val === 4 ? (tac.four - 1) * 0.2 : 0), swing) - risk * 0.9 - (far > 45 ? 0.3 : 0) + pressure * 0.2
          + ((M.cutT > 0 || (M.screen && M.screen.phase === "roll") || M.curl) && e.cd > 3 ? 0.25 : 0);
        if (e.val === 4 && M.p.r.fr < 55) s -= 0.25;
      }
      opts.push({ k: "pass", s, M });
    }
    const noise = (0.05 + 0.12 * (1 - r.iq / 99)) * (1 - 0.25 * tac.o);
    let best = null;
    for (const o of opts) { o.s += rng.normal(0, noise); if (!best || o.s > best.s) best = o; }
    if (best.k === "shoot") beginAction(H, d < 5.5 ? "finish" : "shot");
    else if (best.k === "drive") { H.driving = true; H.decT = 0.25; }
    else if (best.k === "pass") beginAction(H, "pass", best.M);
    else if (best.k === "pnr") { if (startScreen(best.M, H, "pnr")) { H.pnr = { S: best.M, t: 0 }; G.screenCD[H.t] = G.tick + 140; } }
    else if (best.k === "post") H.post = { t: 0 };
    else if (!H.driving && !H.pnr && !H.post && rng.chance(0.3)) newProbe(H, h);
  }
  function release(H) {
    H.gather = false; H.post = null; H.pnr = null;
    if (B.mode !== "held" || B.holder !== H) { H.action = null; return; }
    const kind = H.action; H.action = null;
    if (kind === "pass") {
      const M = H.target && H.target.on ? H.target : G.lineup[H.t].find(Q => Q !== H);
      launchPass(H, M, H.x, H.y, 4.6);
    } else shoot(H, kind);
  }
  function launchPass(H, M, x0, y0, z0) {
    const sp = 34 + H.p.r.pas * 0.13;
    let tx = M.x, ty = M.y;
    for (let k = 0; k < 2; k++) { const tt = hyp(tx - x0, ty - y0) / sp; tx = M.x + M.vx * tt; ty = M.y + M.vy * tt; }
    const err = (1 - H.p.r.pas / 99) * 1.3;
    tx += rng.normal(0, err); ty += rng.normal(0, err);
    tx = clamp(tx, 0.5, C.L - 0.5); ty = clamp(ty, 0.5, C.W - 0.5);
    const lob = laneRisk(H, M) > 0.55 && H.p.r.pas > 55;
    const spd = lob ? sp * 0.62 : sp;
    const Tf = clamp(hyp(tx - x0, ty - y0) / spd, 0.12, 2.2), zt = lob ? 6.8 : 4.4;
    B.mode = "pass"; B.holder = null; B.x = x0; B.y = y0; B.z = z0; B.t = 0;
    B.vx = (tx - x0) / Tf; B.vy = (ty - y0) / Tf; B.vz = (zt - z0 + 0.5 * GRAV * Tf * Tf) / Tf;
    B.pass = { from: H, to: M, T: Tf, tx, ty, tried: new Set() }; B.lastTouch = H.t;
    G.lastHandler = H;
  }
  function shoot(H, kind) {
    const h = hoopOf(H.t); const d = hyp(H.x - h.x, H.y - h.y); const val = shotValue(H.x, H.y, h.side);
    let cd = 99, cD = null;
    for (const D of G.lineup[1 - H.t]) { if (D.st === "down") continue; const dd = dist(D, H); if (dd < cd) { cd = dd; cD = D; } }
    const p = makeProb(H, val, d, cd, cD);
    H.fga = (H.fga || 0) + 1; if (shotValue(H.x, H.y, hoopOf(H.t).side) === 4) H.fpa = (H.fpa || 0) + 1;
    const made = rng.next() < p;
    const dunk = d < 5.5 && kind === "finish" && canDunk(H) && H.finishType !== "layup";
    const layup = d < 5.5 && !dunk;
    const hook = !dunk && !layup && !!H.post && d < 12;
    doJump(H, dunk ? 1 : layup ? 0.8 : 0.4, dunk ? "dunk" : layup ? "layup" : "shoot");
    let x0 = H.x, y0 = H.y, z0 = H.reach * 0.97 + H.vertFt * (layup ? 0.45 : 0.25);
    if (dunk) { const dd = Math.max(d, 0.1); x0 = h.x + (H.x - h.x) / dd * 1.8; y0 = h.y + (H.y - h.y) / dd * 1.8; z0 = 10.8; }
    let tx = h.x, ty = h.y;
    if (!made) { const a = rng.range(0, 6.283), off = rng.range(0.55, 1.1); tx += dcos(a) * off; ty += dsin(a) * off; }
    const Tf = dunk ? 0.2 : layup ? 0.5 : 0.55 + d * 0.026;
    B.mode = "shot"; B.holder = null; B.x = x0; B.y = y0; B.z = z0; B.t = 0;
    B.vx = (tx - x0) / Tf; B.vy = (ty - y0) / Tf; B.vz = (10.15 - z0 + 0.5 * GRAV * Tf * Tf) / Tf;
    const ast = (G.lastPass && G.lastPass.to === H && G.tick - G.lastPass.tick < 80) ? G.lastPass.from : null;
    B.shot = { P: H, team: H.t, val, made, d, dunk, layup, hook, T: Tf, ast, touched: new Set(), foul: null, hoop: h, rel: G.tick, sx: H.x, sy: H.y };
    H.post = null; H.pnr = null;
    B.lastTouch = H.t; G.shotRun = false; G.lastPass = null; G.lastHandler = H;
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
    // defensive reactions
    for (const D of G.lineup[1 - H.t]) {
      if (D.st !== "ok" || D.air) continue;
      const dd = dist(D, H), dh = hyp(D.x - h.x, D.y - h.y);
      if (dd < 5.5 && rng.chance(0.6)) { D.contestAt = G.tick + rng.int(0, 2); continue; }
      let want = false;
      if (val === 2 && !dunk && dh < 10) want = rng.chance(0.3 + D.p.r.rim / 99 * 0.6);
      else if (val >= 3 && dh < 6) want = rng.chance(0.06 * (1 - D.p.r.iq / 99)); // the mistake: goaltend risk
      if (want) {
        const tApex = Math.sqrt(2 * D.vertFt / GRAV);
        const dd2 = Math.max(d, 0.1);
        D.swat = { at: G.tick + Math.max(0, Math.round((Tf - tApex - 0.03) / DT)), x: h.x + (H.x - h.x) / dd2 * 1.5, y: h.y + (H.y - h.y) / dd2 * 1.5 };
      }
    }
    // everyone else: defenders box out, offensive bigs crash the glass
    for (const D of G.lineup[1 - H.t]) if (D.st === "ok" && D.contestAt < 0 && !D.swat) D.boxT = Tf + 0.35;
    for (const M of G.lineup[H.t]) if (M !== H && M.st === "ok" && (M.p.role === "BIG" || M.p.role === "BRUISER")) M.crashT = Tf + 0.4;
    for (const M of G.lineup[H.t]) { M.screen = null; M.curl = null; M.waitScreen = false; }
  }
  function rimBounce(h, sx, sy) {
    const base = datan2(sy - h.y, sx - h.x);
    const a = base + rng.normal(0, 0.9), sp = rng.range(4, 12);
    B.mode = "loose"; B.x = h.x + dcos(a) * 0.8; B.y = h.y + dsin(a) * 0.8; B.z = 10.2;
    B.vx = dcos(a) * sp; B.vy = dsin(a) * sp; B.vz = rng.range(5, 11); G.looseT = 0;
  }
  function shotArrive() {
    const S = B.shot, P = S.P;
    if (S.made) {
      score(S.team, S.val);
      ev("fga", { pid: P.idx, team: S.team, val: S.val, made: true, d: Math.round(S.d), dunk: S.dunk, layup: S.layup, hook: S.hook || undefined, ast: S.ast ? S.ast.idx : -1 });
      if (S.dunk || S.val >= 3 || S.foul) P.celebT = 1.4;
      B.mode = "dead"; B.x = S.hoop.x; B.y = S.hoop.y; B.z = 9.6; B.vx = 0; B.vy = 0; B.vz = -6;
      afterScore(S, true);
    } else {
      ev("fga", { pid: P.idx, team: S.team, val: S.val, made: false, d: Math.round(S.d), dunk: S.dunk, layup: S.layup, hook: S.hook || undefined, ast: -1 });
      if (S.foul) { const n = S.val; B.shot = null; startFT(S.foul.on, n, "shooting"); return; }
      rimBounce(S.hoop, S.sx, S.sy); G.reboundable = true; G.lastShotTeam = S.team; B.shot = null;
    }
  }
  function afterScore(S, made) {
    const last2 = G.per >= 4 && G.clock <= 120;
    if (S.foul) { B.shot = null; startFT(S.foul.on, 1, "and1"); return; }
    B.shot = null;
    deadInbound(1 - S.team, baselineSpot(1 - S.team), { wait: 1.1, kind: "make", keepClock: !last2, resetShot: true });
  }

  // ---- defense ----
  function tackleCheck(D, H) {
    if (G.inbound || H.st === "down" || D.st !== "ok" || D.air) return;
    if ((G.tick + D.idx) % 4) return;
    const d = dist(D, H); if (d > 4.2) return;
    const r = D.p.r;
    let p = (0.0017 + r.tck * 0.000032 + D.p.aggr * 0.002) * TAC[D.t].tackle;
    if (H.driving) p *= 1.8;
    if (H.gather) { const read = r.iq / 99; if (H.gatherT < 0.3) p *= (1 - read) * 0.6 + 0.05; else p *= 1.4; }
    if (D.fouls >= 4) p *= 0.35; if (D.fouls >= 5) p *= 0.4;
    if (H.air) p *= 1.2;
    if (rng.chance(p)) {
      D.st = "lunge"; D.stT = 0.32; D.lunge = { H };
      // handler sees it coming: quick-release pass (if it gets away first, the hit becomes a late-hit foul)
      if (!H.gather && B.holder === H) {
        const react = 0.1 + H.p.r.iq * 0.0022 + H.p.r.pas * 0.0014;
        if (rng.chance(react)) {
          let bm = null, br = 1e9;
          for (const M of G.lineup[H.t]) { if (M === H || M.st === "down") continue; const rr = laneRisk(H, M); if (rr < br) { br = rr; bm = M; } }
          if (bm) { beginAction(H, "pass", bm); H.gatherT = 0.12; }
        }
      }
    }
  }
  function resolveTackle(D, H) {
    D.lunge = null;
    const hasBall = B.mode === "held" && B.holder === H;
    if (!hasBall) {
      const shotFoul = B.mode === "shot" && B.shot.P === H && G.tick - B.shot.rel < 16;
      D.fouls++; G.tf[D.t]++;
      H.st = "down"; H.stT = 1.1; H.gather = false; D.st = "down"; D.stT = 0.8;
      ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "late" });
      ev("foul", { pid: D.idx, team: D.t, on: H.idx, kind: shotFoul ? "shooting" : "late", pf: D.fouls });
      if (D.fouls >= 6) ev("fouledout", { pid: D.idx, team: D.t });
      if (shotFoul) { B.shot.foul = { by: D, on: H }; return; }
      // whistle: play stops
      B.mode = "dead"; B.pass = null; B.vx *= 0.2; B.vy *= 0.2;
      if (G.tf[D.t] >= 5) startFT(H, 2, "bonus");
      else deadInbound(H.t, sidelineSpot(H.x, H.y), { wait: 1.6, kind: "foul", keepShot: 14 });
      return;
    }
    const rH = H.p.r, rD = D.p.r;
    let p = 0.56 + (rD.tck - rH.brk) * 0.0055 + (D.p.wt - H.p.wt) * 0.0018 + (rD.str - rH.str) * 0.002 + (H.air ? 0.08 : 0);
    p = clamp(p, 0.18, 0.9);
    if (rng.chance(p)) {
      H.st = "down"; H.stT = 1.5; H.gather = false; H.driving = false; H.action = null;
      D.st = "down"; D.stT = 0.7; D.celebT = 2.0;
      ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "down" });
      ev("to", { pid: H.idx, team: H.t, kind: "tackle", by: D.idx });
      B.mode = "dead"; B.holder = null; B.vx = rng.normal(0, 3); B.vy = rng.normal(0, 3); B.vz = 4;
      deadInbound(D.t, sidelineSpot(H.x, H.y), { wait: 1.8, kind: "tackle" });
    } else {
      D.st = "down"; D.stT = 1.3; H.st = "stun"; H.stT = 0.35;
      ev("tackle", { pid: D.idx, team: D.t, on: H.idx, result: "broken" });
    }
  }
  function defAI(D, H) {
    if (D.st === "down" || D.st === "lunge") return;
    const man = G.match.get(D); if (!man) { D.tx = D.x; D.ty = D.y; D.urg = 0; return; }
    const h = hoopOf(G.off); // the hoop this defense protects
    if (D.swat) {
      D.tx = D.swat.x; D.ty = D.swat.y; D.urg = 1;
      if (G.tick >= D.swat.at) { doJump(D, 1, "swat"); D.swat = null; }
      return;
    }
    if (D.contestAt >= 0 && G.tick >= D.contestAt) { doJump(D, 0.95, "contest"); D.contestAt = -1; }
    const mx = man.x, my = man.y; const md = hyp(mx - h.x, my - h.y) || 1;
    const ux = (h.x - mx) / md, uy = (h.y - my) / md;
    const td = TAC[D.t].d;
    if (D.boxT > 0) { // put a body on your man
      D.boxT -= DT; D.tx = mx + ux * 1.4; D.ty = my + uy * 1.4; D.urg = 0.9; return;
    }
    if (G.help && G.help.D === D) { // rotate over to stop the drive
      D.tx = G.help.x; D.ty = G.help.y; D.urg = 1;
      if (H && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
      return;
    }
    if (B.mode === "pass" && B.pass.to === man && md < 34) { // close out on the catch
      const cx = B.pass.tx, cy = B.pass.ty, cd = hyp(cx - h.x, cy - h.y) || 1;
      D.tx = cx + (h.x - cx) / cd * 3; D.ty = cy + (h.y - cy) / cd * 3; D.urg = 1; return;
    }
    if (man === H) {
      const r = man.p.r; const threat = md > 28 ? r.fr / 99 : md > 22 ? r.thr / 99 : 0.6;
      const gap = md > 36 ? 7 : Math.max(1.8, 2.6 + (1 - threat) * 2.2 - td * 0.4);
      D.tx = mx + ux * Math.min(gap, md - 0.5); D.ty = my + uy * Math.min(gap, md - 0.5); D.urg = 1;
      if (G.phase === "live") tackleCheck(D, H);
    } else {
      const threat = md > 29 ? man.p.r.fr / 99 : md > 22 ? man.p.r.thr / 99 : 0.75;
      const gap = Math.max(2, 3 + (1 - threat) * 6 - td * 0.6);
      let tx = mx + ux * Math.min(gap, md - 1), ty = my + uy * Math.min(gap, md - 1);
      if (H && B.mode === "held") { tx += (H.x - tx) * 0.12; ty += (H.y - ty) * 0.12; }
      if (D === G.rimProt[D.t] && md > 14 && threat < 0.75) { tx = h.x + (mx - h.x) / md * 7; ty = h.y + (my - h.y) / md * 7; }
      D.tx = tx; D.ty = ty; D.urg = hyp(tx - D.x, ty - D.y) > 6 ? 1 : 0.85;
      if (H && H.driving && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
    }
  }
  function startScreen(Sc, F, kind, dest) {
    const D = defenderOf(F); if (!D) return false;
    Sc.screen = { kind, for: F, phase: "go", t: 0, checked: false, dest: dest || null, sx: 0, sy: 0, pop: false };
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
      if (hyp(P.x - P.tx, P.y - P.ty) < 1.3 || S.t > 3) { S.phase = "set"; S.t = 0; S.sx = P.x; S.sy = P.y; }
    } else if (S.phase === "set") {
      P.tx = S.sx; P.ty = S.sy; P.urg = 0.3;
      if (D && !S.checked && hyp(D.x - P.x, D.y - P.y) < 2.6) { // the defender runs into it
        S.checked = true;
        const SD = defenderOf(P);
        if (SD && SD.st === "ok" && rng.chance(TAC[D.t].sw * 0.85)) { G.match.set(D, P); G.match.set(SD, F); }
        else D.screenedT = clamp(0.7 + (P.p.r.str - D.p.r.str) * 0.005, 0.35, 1.1);
      }
      if (S.t > 1.3) { S.phase = "roll"; S.t = 0; S.pop = S.kind === "pnr" && (P.p.r.fr > 62 || P.p.r.thr > 66); }
    } else {
      if (S.pop) { const sp = SPOTS[P.p.r.fr > 62 ? (P.y > 25 ? "FOUR_R" : "FOUR_L") : (P.y > 25 ? "WING_R" : "WING_L")]; P.tx = h.x + h.dir * sp[0]; P.ty = h.y + sp[1]; }
      else { P.tx = h.x + h.dir * 2.5; P.ty = h.y + (P.y > 25 ? 3 : -3); }
      P.urg = 1;
      if (S.t > 1.8) P.screen = null;
    }
  }
  function offAI(P) {
    if (P.st === "down") return;
    const h = hoopOf(P.t);
    if (B.mode === "pass" && B.pass.to === P) { P.tx = B.pass.tx; P.ty = B.pass.ty; P.urg = 1; return; }
    if (P.crashT > 0) { P.crashT -= DT; P.tx = h.x + h.dir * 3.5; P.ty = h.y + (P.y > 25 ? 3.5 : -3.5); P.urg = 1; return; }
    if (P.screen) { screenAI(P); return; }
    if (P.curl) { // running off a screen to a shooting spot
      P.curl.t += DT; P.tx = P.curl.x; P.ty = P.curl.y; P.urg = 1;
      if (P.curl.t > 2.4 || hyp(P.x - P.tx, P.y - P.ty) < 1.2) { P.spot = P.curl.spot; P.curl = null; }
      return;
    }
    if (P.cutT > 0) { P.cutT -= DT; P.tx = h.x + h.dir * 2; P.ty = h.y + (P.y > 25 ? 4 : -4); P.urg = 1; return; }
    const s = spotXY(P, P.t);
    P.jitT -= DT; if (P.jitT <= 0) { P.jitT = rng.range(1.5, 3.5); P.jit = { x: rng.normal(0, 1.5), y: rng.normal(0, 1.5) }; }
    const H = B.mode === "held" ? B.holder : null;
    if (P.waitScreen) {
      const Sc = G.lineup[P.t].find(Q => Q.screen && Q.screen.for === P && Q.screen.kind === "off" && Q.screen.dest);
      if (!Sc) P.waitScreen = false;
      else if (Sc.screen.phase !== "go") { P.waitScreen = false; const dd = Sc.screen.dest; P.curl = { x: dd.x, y: dd.y, t: 0, spot: dd.spot }; return; }
      else { P.tx = s.x + (h.x - s.x) * 0.12; P.ty = s.y; P.urg = 0.5; return; } // set his man up
    }
    // a shooter asks for an off-ball screen to free himself
    if (H && H !== P && (P.p.role === "SNIPER" || P.p.role === "WING") && G.tick > G.offScreenCD[P.t] && hyp(H.x - h.x, H.y - h.y) < 34 && rng.chance(0.005)) {
      const want = P.p.r.fr > 62 ? ["FOUR_L", "FOUR_R", "FOUR_TOP"] : ["WING_L", "WING_R", "TOP"];
      const taken = new Set(G.lineup[P.t].filter(Q => Q !== P).map(Q => Q.spot));
      const spot = want.filter(x => !taken.has(x) && x !== P.spot).sort((a, b) => { const A = SPOTS[a], Bq = SPOTS[b]; return hyp(h.x + h.dir * Bq[0] - P.x, h.y + Bq[1] - P.y) - hyp(h.x + h.dir * A[0] - P.x, h.y + A[1] - P.y); })[0];
      let Sc = null, bv = -1e9;
      for (const M of G.lineup[P.t]) { if (M === P || M === H || M.st !== "ok" || M.screen || M.crashT > 0 || M.waitScreen) continue; const v = (M.p.role === "BIG" || M.p.role === "BRUISER" ? 15 : 0) - hyp(M.x - P.x, M.y - P.y); if (v > bv) { bv = v; Sc = M; } }
      if (spot && Sc && hyp(Sc.x - P.x, Sc.y - P.y) < 26) {
        const sp = SPOTS[spot], dest = { x: h.x + h.dir * sp[0], y: h.y + sp[1], spot };
        if (startScreen(Sc, P, "off", dest)) { P.waitScreen = true; G.offScreenCD[P.t] = G.tick + 120; }
      }
    }
    if (H && H !== P && P.p.role !== "BIG" && hyp(H.x - h.x, H.y - h.y) < 33 && rng.chance(0.0035 * (0.5 + P.p.r.iq / 99))) P.cutT = 1.4;
    P.tx = clamp(s.x + P.jit.x, 1, C.L - 1); P.ty = clamp(s.y + P.jit.y, 1, C.W - 1);
    const dd = hyp(P.tx - P.x, P.ty - P.y); P.urg = dd > 10 ? 1 : dd > 3 ? 0.7 : 0.35;
  }
  function reboundAI() {
    // predicted landing point
    let tl = 0;
    if (B.z > 8 || B.vz > 0) { const disc = B.vz * B.vz + 2 * GRAV * Math.max(0, B.z - 8); tl = (B.vz + Math.sqrt(disc)) / GRAV; }
    const px = B.x + B.vx * tl, py = B.y + B.vy * tl;
    for (let t = 0; t < 2; t++) {
      const L = G.lineup[t].filter(P => P.st !== "down").sort((a, b) => hyp(a.x - px, a.y - py) - hyp(b.x - px, b.y - py));
      L.slice(0, 3).forEach((P, i) => {
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
    let tot = 0; const ws = cands.map(P => { const w = 1 + P.p.r.reb / 40 + P.p.r.str / 120 + (P.air ? 0.8 : 0) + (P.t !== G.lastShotTeam ? 0.6 : 0); tot += w; return w; });
    let x = rng.next() * tot, P = cands[0];
    for (let i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) { P = cands[i]; break; } }
    if (G.reboundable) {
      const off = P.t === G.lastShotTeam;
      ev("reb", { pid: P.idx, team: P.t, off });
      G.reboundable = false;
      gain(P);
      if (off) { G.shotClock = Math.max(14, 0); G.shotRun = true; }
      else { G.shotClock = C.SC; G.shotRun = true; }
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
    if (!G.reboundable && B.lastTouch === G.off && G.lastHandler) ev("to", { pid: G.lastHandler.idx, team: G.lastHandler.t, kind: "oob", by: -1 });
    G.reboundable = false;
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
            ev("fga", { pid: S.P.idx, team: S.team, val: S.val, made: true, d: Math.round(S.d), gt: D.idx, ast: S.ast ? S.ast.idx : -1 });
            ev("violation", { kind: "goaltend", pid: D.idx, team: D.t });
            B.mode = "dead"; B.vx = 0; B.vy = 0; afterScore(S, true); return;
          }
          if (S.val === 2 && nearRim && rng.chance(0.12 * (1 - D.p.r.bnc / 140))) { // hand went through the cylinder
            S.made = true; score(S.team, 2);
            ev("fga", { pid: S.P.idx, team: S.team, val: 2, made: true, d: Math.round(S.d), ci: D.idx, ast: S.ast ? S.ast.idx : -1 });
            ev("violation", { kind: "cylinder", pid: D.idx, team: D.t });
            B.mode = "dead"; B.vx = 0; B.vy = 0; afterScore(S, true); return;
          }
          // legal block / swat
          ev("fga", { pid: S.P.idx, team: S.team, val: S.val, made: false, d: Math.round(S.d), dunk: S.dunk, blk: D.idx, swat: B.vz < 0, ast: -1 });
          const a = datan2(B.y - D.y, B.x - D.x) + rng.normal(0, 0.8), sp = rng.range(8, 20);
          B.mode = "loose"; B.vx = dcos(a) * sp; B.vy = dsin(a) * sp; B.vz = rng.range(-4, 6); B.lastTouch = D.t;
          G.reboundable = true; G.lastShotTeam = S.team; G.looseT = 0;
          if (S.foul) { const n = S.val; B.shot = null; B.mode = "dead"; startFT(S.foul.on, n, "shooting"); return; }
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
          if (rng.chance(0.07 + D.p.r.perD * 0.0016 + D.p.r.hands * 0.0009)) {
            if (rng.chance(0.62)) {
              ev("to", { pid: Pp.from.idx, team: Pp.from.t, kind: "steal", by: D.idx });
              G.inbound = false; gain(D); return;
            }
            const a = rng.range(0, 6.283); B.vx = dcos(a) * 9; B.vy = dsin(a) * 9; B.vz = 3;
            B.mode = "loose"; B.lastTouch = D.t; G.deflector = D; G.reboundable = false; G.looseT = 0; G.inbound = false; return;
          }
        }
      }
      for (const M of G.lineup[Pp.from.t]) {
        if (M === Pp.from || M.st === "down") continue;
        const hd = hyp(M.x - B.x, M.y - B.y);
        if (hd < 1.9 && B.z < M.reach + M.z + 0.5 && B.z > 0.3) {
          if (rng.chance(0.975 - (1 - M.p.r.hands / 99) * 0.07)) {
            gain(M); G.lastPass = { from: Pp.from, to: M, tick: G.tick }; M.catchT = 0.3;
            if (G.inbound) { G.inbound = false; if (!G.periodEnding && G.clock > 0) G.clockRun = true; G.shotRun = true; }
            if (G.phase === "live" && !G.clockRun && G.clock > 0 && !G.periodEnding) G.clockRun = true;
          } else {
            B.mode = "loose"; B.vx *= 0.3; B.vy *= 0.3; B.vz = 3; B.lastTouch = M.t; G.reboundable = false; G.looseT = 0;
            if (G.inbound) { G.inbound = false; G.clockRun = G.clock > 0; G.shotRun = true; }
          }
          return;
        }
      }
      if (B.z <= 0) { B.z = 0; B.vz = -B.vz * C.FLOOR_E; }
      if (B.t > Pp.T + 0.35) { B.mode = "loose"; G.reboundable = false; G.looseT = 0; if (G.inbound) { G.inbound = false; G.clockRun = G.clock > 0; G.shotRun = true; } }
      if (B.x < 0 || B.x > C.L || B.y < 0 || B.y > C.W) { if (G.inbound) G.inbound = false; outOfBounds(); }
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
        let best = null, bd = 1e9; for (const P of onC()) { const d = hyp(P.x - B.x, P.y - B.y); if (d < bd) { bd = d; best = P; } }
        if (G.reboundable) { ev("reb", { pid: best.idx, team: best.t, off: best.t === G.lastShotTeam }); G.reboundable = false; }
        gain(best); G.shotRun = true;
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
      P.energy -= (0.00003 + 0.00007 * sp / P.vmax) * (1.4 - P.p.r.sta / 99 * 0.8);
      if (P.energy < 0.05) P.energy = 0.05;
      if (G.clockRun) P.secs += DT;
    }
    // tackle contact
    for (const P of L) {
      if (P.st !== "lunge") continue;
      const H = P.lunge.H;
      if (!H.on || H.st === "down") { P.st = "ok"; P.lunge = null; continue; }
      if (dist(P, H) < 1.9) { resolveTackle(P, H); if (G.phase !== "live") return; continue; }
      P.stT -= DT;
      if (P.stT <= 0) { P.st = "down"; P.stT = 0.9; P.lunge = null; ev("tackle", { pid: P.idx, team: P.t, on: H.idx, result: "whiff" }); }
    }
    // separation
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
      if (d < 1.9 && d > 0.001) { const push = (1.9 - d) * 0.25; a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push; }
    }
    for (let t = 0; t < 2; t++) for (const P of team[t]) if (!P.on) P.energy = Math.min(1, P.energy + 0.00011);
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
      const M = G.lineup[w][0];
      launchPass(J, M, B.x, B.y, B.z);
      G.phase = "live"; G.clockRun = true; G.shotRun = true;
    }
  }
  function endPeriod() {
    G.periodEnding = false; G.clockRun = false; G.shotRun = false;
    ev("period_end", {});
    if (G.per >= 4 && G.score[0] !== G.score[1]) { G.phase = "final"; ev("final", {}); return; }
    G.per++; G.clock = G.per <= 4 ? C.QLEN : C.OTLEN; G.tf = [0, 0];
    if (G.per === 3) G.to = [3, 3]; else if (G.per >= 5) G.to = [1, 1];
    for (const P of all) { P.energy = Math.min(1, P.energy + (G.per === 3 ? 0.35 : 0.15)); P.st = "ok"; P.air = false; P.z = 0; P.gather = false; P.swat = null; P.lunge = null; P.contestAt = -1; }
    B.mode = "dead"; B.holder = null; B.shot = null; B.pass = null; G.reboundable = false; G.inbound = false;
    doSubs(0); doSubs(1);
    if (G.per >= 5) { setupTip(); return; }
    const t = G.per === 4 ? G.tipWinner : 1 - G.tipWinner;
    ev("period_start", { l0: G.lineup[0].map(P => P.idx), l1: G.lineup[1].map(P => P.idx) });
    deadInbound(t, baselineSpot(t), { wait: 3, kind: "period", noSubs: true, resetShot: true });
    G.off = t; newPossession(t); G.shotRun = false;
  }

  // ---- animation state (does not affect the simulation) ----
  const AIR = { shoot: ACT.SHOOT, layup: ACT.LAYUP, dunk: ACT.DUNK, contest: ACT.CONTEST, rebound: ACT.REBOUND, swat: ACT.SWAT };
  function animUpdate() {
    const H = B.mode === "held" ? B.holder : null;
    const huddle = G.phase === "dead" && G.dead && G.dead.to > 0;
    for (const P of onC()) {
      if (P.catchT > 0) P.catchT -= DT; if (P.reachT > 0) P.reachT -= DT; if (P.celebT > 0) P.celebT -= DT;
      const hp = hoopOf(P.t);
      let a = ACT.NONE, fx = 0, fy = 0, look = null;
      if (P.st === "down") a = P.stT < 0.45 ? ACT.GETUP : ACT.DOWN;
      else if (P.st === "lunge") { a = ACT.TACKLE; look = P.lunge.H; }
      else if (P.st === "stun") a = ACT.STUMBLE;
      else if (huddle) a = ACT.HUDDLE;
      else if (P === H) {
        if (P.gather) a = P.action === "pass" ? ACT.PASS : P.action === "finish" ? (P.finishType === "dunk" ? ACT.DUNK : ACT.LAYUP) : ACT.SHOOT;
        else if (G.inbound) a = ACT.INBOUND;
        else if (P.post) a = ACT.POST;
        else a = ACT.DRIBBLE;
      }
      else if (P.air && P.airAct) a = AIR[P.airAct] || ACT.REBOUND;
      else if (G.phase === "ft" && G.ftS && G.ftS.P === P) a = ACT.FT;
      else if (P.celebT > 0 && P.celebT < 1.5) a = ACT.CELEBRATE;
      else if (P.catchT > 0) a = ACT.CATCH;
      else if (P.reachT > 0) a = ACT.REACH;
      else if (P.screen && P.screen.phase === "set") a = ACT.SCREEN;
      else if (P.boxT > 0) a = ACT.BOXOUT;
      else if (H && P.t !== H.t && G.match.get(P) === H && dist(P, H) < 8) a = ACT.STANCE;
      if (a !== P.act) { P.act = a; P.actT = 0; } else P.actT += DT;
      // which way he's facing
      if (look) { fx = look.x - P.x; fy = look.y - P.y; }
      else if (a === ACT.POST) { fx = P.x - hp.x; fy = P.y - hp.y; }
      else if (a === ACT.HUDDLE) { fx = 47 + (P.t === 0 ? -9 : 9) - P.x; fy = -1.2 - P.y; }
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
        P.face += dA * Math.min(1, (a === ACT.TACKLE ? 14 : 8) * DT);
      }
    }
  }

  // ---- main loop ----
  function step() {
    if (G.phase === "tip") tipStep();
    else if (G.phase === "dead") deadStep();
    else if (G.phase === "ft") ftStep();
    if (G.phase === "live") {
      const H = B.mode === "held" ? B.holder : null;
      G.help = null;
      if (H && H.driving && !G.inbound) { // has the driver beaten his man? then someone has to help
        const h = hoopOf(G.off), Dh = defenderOf(H), dH = hyp(H.x - h.x, H.y - h.y);
        const beaten = !Dh || Dh.st !== "ok" || hyp(Dh.x - h.x, Dh.y - h.y) > dH + 0.5 || Dh.screenedT > 0;
        if (beaten && dH < 24) {
          const px = h.x + (H.x - h.x) / Math.max(dH, 0.1) * Math.min(5.5, dH * 0.5), py = h.y + (H.y - h.y) / Math.max(dH, 0.1) * Math.min(5.5, dH * 0.5);
          let hp = G.rimProt[1 - G.off];
          if (!hp || hp === Dh || hp.st !== "ok" || !hp.on) { hp = null; let bd = 1e9; for (const D of G.lineup[1 - G.off]) { if (D === Dh || D.st !== "ok") continue; const dd = hyp(D.x - px, D.y - py); if (dd < bd) { bd = dd; hp = D; } } }
          if (hp) G.help = { D: hp, x: px, y: py };
        }
      }
      if (H) handlerAI(H);
      for (const P of G.lineup[G.off]) if (P !== H) offAI(P);
      for (const D of G.lineup[1 - G.off]) defAI(D, H);
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
          B.mode = "dead"; B.holder = null;
          deadInbound(1 - G.off, sidelineSpot(B.x, B.y), { wait: 1.4, kind: "shotclock" });
        }
      }
    }
    if (G.periodEnding && B.mode !== "shot" && G.phase !== "ft" && G.phase !== "final") endPeriod();
  }

  setupTip();
  const MAXT = 220000;
  while (G.phase !== "final" && G.tick < MAXT) {
    if (REC && G.tick % 2 === 0) rec();
    step();
    G.tick++;
  }
  if (REC) rec();
  const roster = all.map(P => ({ idx: P.idx, id: P.p.id, t: P.t, name: P.p.first + " " + P.p.last, short: P.p.first[0] + ". " + P.p.last, num: P.p.num, role: P.p.role, starter: P.starter, secs: P.secs, ht: P.p.ht, wt: P.p.wt }));
  return {
    engineVersion: ENGINE_VERSION, seed, home: home.id, away: away.id,
    score: G.score.slice(), periods: G.per, ticks: G.tick,
    frames: F.subarray(0, nf * FS), nFrames: nf, events: G.events, roster
  };
}

// ===================== BOX SCORE (derived only from the event log) =====================
function gameSec(per, clk) { return per <= 4 ? (per - 1) * C.QLEN + (C.QLEN - clk) : 4 * C.QLEN + (per - 5) * C.OTLEN + (C.OTLEN - clk); }
function boxScore(game, uptoTick, nowPer, nowClk) {
  const S = game.roster.map(r => ({ idx: r.idx, t: r.t, secs: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, fpm: 0, fpa: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, tkl: 0, btk: 0, pf: 0, played: false }));
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
        if (e.made) { s.fgm++; s.pts += e.val; if (e.val === 3) s.tpm++; if (e.val === 4) s.fpm++; if (e.ast >= 0) S[e.ast].ast++; }
        if (e.blk >= 0 && e.blk !== undefined) S[e.blk].blk++;
        break;
      }
      case "ft": { const s = S[e.pid]; s.fta++; if (e.made) { s.ftm++; s.pts++; } break; }
      case "reb": if (e.off) S[e.pid].oreb++; else S[e.pid].dreb++; break;
      case "to": S[e.pid].to++; if (e.kind === "steal" || e.kind === "loose") { if (e.by >= 0) S[e.by].stl++; } break;
      case "tackle": if (e.result === "down") S[e.pid].tkl++; if (e.result === "broken") S[e.on].btk++; break;
      case "foul": S[e.pid].pf++; break;
    }
  }
  if (nowPer !== undefined) { const g = gameSec(nowPer, nowClk); for (const [i, s] of onSince) S[i].secs += Math.max(0, g - s); }
  return S;
}

const ENGINE_API = { ACT, BALL_MODE, simulateGame, boxScore, C, shotValue, makeRng, hashStr, ENGINE_VERSION, gameSec, clamp, attSide, dsin, dcos, dlog, datan2 };
if (typeof module !== "undefined" && module.exports) module.exports = ENGINE_API;
else if (typeof window !== "undefined") window.BB = Object.assign(window.BB || {}, ENGINE_API);
