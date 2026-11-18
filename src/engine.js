// ===================== BOUNCEBALL GAME ENGINE =====================
// Pure, seeded, deterministic. No DOM. Same seed + same rosters + same ENGINE_VERSION = same game.
// That means a stored game only needs {seed, engineVersion, rosters}; frames can be re-derived.
"use strict";
const ENGINE_VERSION = "0.2.0";
const C = {
  L: 94, W: 50, HX: [5.25, 88.75], HY: 25, RIM: 10,
  R3: 23.75, C3: 22, C3X: 14.2, R4: 30, FTD: 15,
  DT: 0.05, G: 32.2, QLEN: 720, OTLEN: 300, SC: 24,
  FLOOR_E: 0.8,          // floor restitution: the Akron-spec rubber floor bounces livelier than hardwood
  FLOOR_VERT_IN: 12,     // average vertical boost from the floor (inches)
  FS: 59                 // floats per recorded frame
};
const DT = C.DT, GRAV = C.G;

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
      cutT: 0, spot: "TOP", jit: { x: 0, y: 0 }, jitT: 0, swat: null, contestAt: -1
    };
    all.push(P); team[t].push(P);
  }
  const G = {
    tick: 0, per: 1, clock: C.QLEN, shotClock: C.SC, shotRun: false, clockRun: false,
    score: [0, 0], off: 0, phase: "tip", phaseT: 0, lineup: [[], []], match: new Map(),
    events: [], tf: [0, 0], lastPass: null, lastShotTeam: -1, reboundable: false, periodEnding: false,
    tipWinner: 0, dead: null, ftS: null, rimProt: [null, null], lastHandler: null, inbound: false,
    looseT: 0, deflector: null, tipDone: false
  };
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
      F[o++] = fl;
    }
    F[o++] = B.x; F[o++] = B.y; F[o++] = B.z; F[o++] = (B.mode === "held" && B.holder) ? B.holder.idx : -1;
    F[o++] = G.clock; F[o++] = G.shotClock; F[o++] = G.per; F[o++] = G.score[0]; F[o++] = G.score[1];
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
  function doJump(P, frac) {
    if (P.air || P.st === "down") return;
    P.vz = Math.sqrt(2 * GRAV * P.vertFt * frac); P.air = true; P.z = 0.001;
  }
  function makeProb(P, val, d, cd, D) {
    const r = P.p.r; let p;
    if (d < 5) p = canDunk(P) ? 0.80 + r.ins * 0.0016 : 0.46 + r.ins * 0.0042;
    else if (val === 2 && d < 14) p = 0.37 + r.mid * 0.003 - (d - 5) * 0.007;
    else if (val === 2) p = 0.31 + r.mid * 0.0031 - (d - 14) * 0.004;
    else if (val === 3) p = 0.21 + r.thr * 0.0031 - Math.max(0, d - 24.5) * 0.012;
    else p = 0.11 + r.fr * 0.0026 - Math.max(0, d - 30.5) * 0.016;
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
    for (let s = 0; s < 5; s++) {
      const P = L[s]; if (P === except) continue;
      const bench = team[t].filter(Q => !Q.on && Q.fouls < 6);
      if (!bench.length) break;
      const forced = P.fouls >= 6;
      let cand = null;
      if (forced || P.energy < (close ? 0.4 : 0.58)) {
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
    if (!o.noSubs) { doSubs(0); doSubs(1); }
    if (change) newPossession(t); else { G.off = t; assignMatches(); if (o.keepShot) G.shotClock = Math.max(G.shotClock, o.keepShot); else G.shotClock = C.SC; }
    if (o.resetShot) G.shotClock = C.SC;
    const cands = G.lineup[t].filter(P => P.st !== "down");
    const recv = G.lineup[t].slice().sort((a, b) => (b.p.r.pas + b.p.r.sec) - (a.p.r.pas + a.p.r.sec))[0];
    let inb = null, bd = 1e9;
    for (const P of (cands.length ? cands : G.lineup[t])) { if (P === recv) continue; const d = hyp(P.x - spot.x, P.y - spot.y); if (d < bd) { bd = d; inb = P; } }
    G.dead = { t, spot, timer: o.wait || 1.4, inb, recv, kind: o.kind || "" };
  }
  function deadStep() {
    const D = G.dead; D.timer -= DT;
    const t = D.t;
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
    if (D.timer <= 0 && (hyp(inb.x - D.spot.x, inb.y - D.spot.y) < 2.5 || D.timer < -3) && inb.st !== "down") {
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
    if (made) G.score[P.t] += 1;
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
    else if (kind === "finish") H.gatherT = 0.36;
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
    if (H.driving) {
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
    const settle = G.shotRun ? Math.max(0, 14 - (G.tick - G.possStart) * DT) * 0.055 : 0;
    if (buzzer && d < 60) { beginAction(H, d < 5.5 ? "finish" : "shot"); return; }
    const opts = [];
    var base = !G.shotRun ? 1.0 : sc > 15 ? 1.13 : sc > 9 ? 1.04 : sc > 5 ? 0.92 : 0.55;
    opts.push({ k: "hold", s: base - pressure * 0.22 });
    if (inBack) {
      // fast break?
      let back = 0; for (const D of G.lineup[1 - H.t]) if (hyp(D.x - h.x, D.y - h.y) < d - 2) back++;
      if (G.possLive && back <= 1 && !H.driving && G.tick - G.possStart < 100) opts.push({ k: "drive", s: 1.4 });
    } else if (d < 40) {
      const e = evalAt(H, H.x, H.y);
      let s = e.ev - 0.05 + late * 0.2 - settle - (H.fga || 0) * 0.016 - (e.val === 4 ? (H.fpa || 0) * 0.03 : 0);
      if (e.val === 4 && r.fr < 55) s -= 0.25;
      if (d > 33) s -= 0.3;
      opts.push({ k: "shoot", s });
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
        s = Math.max(e.ev * 0.93 - settle * 0.5 - (M.fga || 0) * 0.01 - (e.val === 4 ? (M.fpa || 0) * 0.02 : 0), swing) - risk * 0.9 - (far > 45 ? 0.3 : 0) + pressure * 0.2 + (M.cutT > 0 && e.cd > 3 ? 0.25 : 0);
        if (e.val === 4 && M.p.r.fr < 55) s -= 0.25;
      }
      opts.push({ k: "pass", s, M });
    }
    const noise = 0.05 + 0.12 * (1 - r.iq / 99);
    let best = null;
    for (const o of opts) { o.s += rng.normal(0, noise); if (!best || o.s > best.s) best = o; }
    if (best.k === "shoot") beginAction(H, d < 5.5 ? "finish" : "shot");
    else if (best.k === "drive") { H.driving = true; H.decT = 0.25; }
    else if (best.k === "pass") beginAction(H, "pass", best.M);
    else if (!H.driving && rng.chance(0.3)) newProbe(H, h);
  }
  function release(H) {
    H.gather = false;
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
    const dunk = d < 5.5 && kind === "finish" && canDunk(H);
    const layup = d < 5.5 && !dunk;
    doJump(H, dunk ? 1 : layup ? 0.8 : 0.4);
    let x0 = H.x, y0 = H.y, z0 = H.reach * 0.97 + H.vertFt * (layup ? 0.45 : 0.25);
    if (dunk) { const dd = Math.max(d, 0.1); x0 = h.x + (H.x - h.x) / dd * 1.8; y0 = h.y + (H.y - h.y) / dd * 1.8; z0 = 10.8; }
    let tx = h.x, ty = h.y;
    if (!made) { const a = rng.range(0, 6.283), off = rng.range(0.55, 1.1); tx += dcos(a) * off; ty += dsin(a) * off; }
    const Tf = dunk ? 0.2 : layup ? 0.5 : 0.55 + d * 0.026;
    B.mode = "shot"; B.holder = null; B.x = x0; B.y = y0; B.z = z0; B.t = 0;
    B.vx = (tx - x0) / Tf; B.vy = (ty - y0) / Tf; B.vz = (10.15 - z0 + 0.5 * GRAV * Tf * Tf) / Tf;
    const ast = (G.lastPass && G.lastPass.to === H && G.tick - G.lastPass.tick < 80) ? G.lastPass.from : null;
    B.shot = { P: H, team: H.t, val, made, d, dunk, layup, T: Tf, ast, touched: new Set(), foul: null, hoop: h, rel: G.tick, sx: H.x, sy: H.y };
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
      G.score[S.team] += S.val;
      ev("fga", { pid: P.idx, team: S.team, val: S.val, made: true, d: Math.round(S.d), dunk: S.dunk, layup: S.layup, ast: S.ast ? S.ast.idx : -1 });
      B.mode = "dead"; B.x = S.hoop.x; B.y = S.hoop.y; B.z = 9.6; B.vx = 0; B.vy = 0; B.vz = -6;
      afterScore(S, true);
    } else {
      ev("fga", { pid: P.idx, team: S.team, val: S.val, made: false, d: Math.round(S.d), dunk: S.dunk, layup: S.layup, ast: -1 });
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
    let p = 0.0022 + r.tck * 0.00004 + D.p.aggr * 0.0025;
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
      D.st = "down"; D.stT = 0.7;
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
      if (G.tick >= D.swat.at) { doJump(D, 1); D.swat = null; }
      return;
    }
    if (D.contestAt >= 0 && G.tick >= D.contestAt) { doJump(D, 0.95); D.contestAt = -1; }
    const mx = man.x, my = man.y; const md = hyp(mx - h.x, my - h.y) || 1;
    const ux = (h.x - mx) / md, uy = (h.y - my) / md;
    if (man === H) {
      const r = man.p.r; const threat = md > 28 ? r.fr / 99 : md > 22 ? r.thr / 99 : 0.6;
      const gap = md > 36 ? 7 : 2.6 + (1 - threat) * 2.2;
      D.tx = mx + ux * Math.min(gap, md - 0.5); D.ty = my + uy * Math.min(gap, md - 0.5); D.urg = 1;
      if (G.phase === "live") tackleCheck(D, H);
    } else {
      const threat = md > 29 ? man.p.r.fr / 99 : md > 22 ? man.p.r.thr / 99 : 0.75;
      const gap = 3 + (1 - threat) * 6;
      let tx = mx + ux * Math.min(gap, md - 1), ty = my + uy * Math.min(gap, md - 1);
      if (H && B.mode === "held") { tx += (H.x - tx) * 0.12; ty += (H.y - ty) * 0.12; }
      if (D === G.rimProt[D.t] && md > 14 && threat < 0.75) { tx = h.x + (mx - h.x) / md * 7; ty = h.y + (my - h.y) / md * 7; }
      D.tx = tx; D.ty = ty; D.urg = hyp(tx - D.x, ty - D.y) > 6 ? 1 : 0.85;
      if (H && H.driving && G.phase === "live" && dist(D, H) < 3.5) tackleCheck(D, H);
    }
  }
  function offAI(P) {
    if (P.st === "down") return;
    const h = hoopOf(P.t);
    if (B.mode === "pass" && B.pass.to === P) { P.tx = B.pass.tx; P.ty = B.pass.ty; P.urg = 1; return; }
    if (P.cutT > 0) { P.cutT -= DT; P.tx = h.x + h.dir * 2; P.ty = h.y + (P.y > 25 ? 4 : -4); P.urg = 1; return; }
    const s = spotXY(P, P.t);
    P.jitT -= DT; if (P.jitT <= 0) { P.jitT = rng.range(1.5, 3.5); P.jit = { x: rng.normal(0, 1.5), y: rng.normal(0, 1.5) }; }
    const H = B.mode === "held" ? B.holder : null;
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
        if (hd < 3 && B.vz < 0 && B.z > P.reach + 0.3 && B.z < P.reach + P.vertFt + 0.8) doJump(P, 1);
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
            S.made = true; G.score[S.team] += S.val;
            ev("fga", { pid: S.P.idx, team: S.team, val: S.val, made: true, d: Math.round(S.d), gt: D.idx, ast: S.ast ? S.ast.idx : -1 });
            ev("violation", { kind: "goaltend", pid: D.idx, team: D.t });
            B.mode = "dead"; B.vx = 0; B.vy = 0; afterScore(S, true); return;
          }
          if (S.val === 2 && nearRim && rng.chance(0.12 * (1 - D.p.r.bnc / 140))) { // hand went through the cylinder
            S.made = true; G.score[S.team] += 2;
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
          Pp.tried.add(D);
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
            gain(M); G.lastPass = { from: Pp.from, to: M, tick: G.tick };
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
        steer(P, P.tx, P.ty, P.vmax * u * (0.8 + 0.2 * P.energy), P.acc);
      }
      P.x += P.vx * DT; P.y += P.vy * DT;
      if (P.air) { P.z += P.vz * DT; P.vz -= GRAV * DT; if (P.z <= 0) { P.z = 0; P.vz = 0; P.air = false; } }
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
    for (const J of [j0, j1]) { const tA = Math.sqrt(2 * J.vertFt / GRAV); if (!J.air && G.phaseT >= 1.0 + 0.53 - tA && G.phaseT < 1.6) doJump(J, 1); }
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
    for (const P of all) { P.energy = Math.min(1, P.energy + (G.per === 3 ? 0.35 : 0.15)); P.st = "ok"; P.air = false; P.z = 0; P.gather = false; P.swat = null; P.lunge = null; P.contestAt = -1; }
    B.mode = "dead"; B.holder = null; B.shot = null; B.pass = null; G.reboundable = false; G.inbound = false;
    doSubs(0); doSubs(1);
    if (G.per >= 5) { setupTip(); return; }
    const t = G.per === 4 ? G.tipWinner : 1 - G.tipWinner;
    ev("period_start", { l0: G.lineup[0].map(P => P.idx), l1: G.lineup[1].map(P => P.idx) });
    deadInbound(t, baselineSpot(t), { wait: 3, kind: "period", noSubs: true, resetShot: true });
    G.off = t; newPossession(t); G.shotRun = false;
  }

  // ---- main loop ----
  function step() {
    if (G.phase === "tip") tipStep();
    else if (G.phase === "dead") deadStep();
    else if (G.phase === "ft") ftStep();
    if (G.phase === "live") {
      const H = B.mode === "held" ? B.holder : null;
      if (H) handlerAI(H);
      for (const P of G.lineup[G.off]) if (P !== H) offAI(P);
      for (const D of G.lineup[1 - G.off]) defAI(D, H);
      if (B.mode === "loose") reboundAI();
    }
    physics();
    if (G.phase !== "final") ballStep();
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
  const roster = all.map(P => ({ idx: P.idx, id: P.p.id, t: P.t, name: P.p.first + " " + P.p.last, short: P.p.first[0] + ". " + P.p.last, num: P.p.num, role: P.p.role, starter: P.starter, secs: P.secs }));
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

const ENGINE_API = { simulateGame, boxScore, C, shotValue, makeRng, hashStr, ENGINE_VERSION, gameSec, clamp, attSide, dsin, dcos, dlog, datan2 };
if (typeof module !== "undefined" && module.exports) module.exports = ENGINE_API;
else if (typeof window !== "undefined") window.BB = Object.assign(window.BB || {}, ENGINE_API);
