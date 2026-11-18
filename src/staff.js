// ===================== STAFF: coaches and owners =====================
// Coaches shape how a team plays (pace, tackling, fours, switching, rotation depth) and how fast
// young players develop. Owners decide how much to spend and how long to put up with losing.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const P = NODE ? require("./players.js") : window.BB;
const { clamp } = E;

const FOUNDING_COMPANIES = {
  AKR: "Summit Tire & Rubber", TOL: "Maumee Glass Works", GRY: "Lakeshore Steel", FLN: "Flint Motor Parts Co.",
  YNG: "Mahoning Sheet & Tube", ERI: "Presque Isle Shipping"
};
const BUSINESSES = ["a regional grocery chain", "a trucking company", "a chain of car dealerships", "a casino", "an oil field services firm", "a frozen pizza empire",
  "a mattress company", "a lumber yard empire", "a billboard company", "a chain of waterparks", "a software company", "a cattle ranch", "a hot sauce brand",
  "a regional airline", "a radio network", "a cement company", "a pickle cannery", "a bowling alley chain", "a cable company", "a real estate developer"];

// ---------- coaches ----------
// Philosophy: the offense he believes in, the defense he teaches, when his players are allowed to hit,
// and how he coaches: how much he bends his system to fit his roster and the opponent (adapt), how well
// his players stick to the plan (disc), late-game smarts (late) and how much he feeds his star (star).
// A former player coaches the way he played.
const SYS_W = { motion: 24, helio: 20, power: 20, four: 16, bounce: 20 };
const SCHEME_W = { man: 38, switch: 17, goalie: 18, extend: 15, zone: 12 };
const EX_SYS = { PG: { motion: 50, helio: 40, bounce: 10 }, WING: { helio: 35, bounce: 40, motion: 25 }, SNIPER: { four: 70, motion: 30 }, BRUISER: { power: 75, motion: 25 }, BIG: { power: 55, bounce: 25, motion: 20 } };
const EX_SCHEME = { PG: { man: 50, switch: 30, extend: 20 }, WING: { switch: 40, man: 40, extend: 20 }, SNIPER: { extend: 50, man: 30, zone: 20 }, BRUISER: { man: 50, zone: 30, goalie: 20 }, BIG: { goalie: 60, zone: 25, man: 15 } };
function wpick(rng, w) { let tot = 0; for (const k in w) tot += w[k]; let x = rng.next() * tot; for (const k in w) { x -= w[k]; if (x <= 0) return k; } return Object.keys(w)[0]; }
function genPhil(S, rng, c, role) {
  const fours = S.season >= 1979;
  const sw = Object.assign({}, role ? EX_SYS[role] : SYS_W); if (!fours) delete sw.four;
  const dw = Object.assign({}, role ? EX_SCHEME[role] : SCHEME_W); if (!fours) delete dw.extend;
  let sys = wpick(rng, sw); if (!sw[sys]) sys = "motion";
  let scheme = wpick(rng, dw); if (!dw[scheme]) scheme = "man";
  const t = c.style.tackle, hit = t > 1.12 ? "blitz" : t < 0.88 ? "disciplined" : "contain";
  const q = (c.off + c.def - 100) / 200;
  return {
    sys, scheme, hit,
    adapt: Math.round(clamp(rng.normal(0.5 + q * 0.6, 0.2), 0.05, 0.95) * 100) / 100,
    disc: Math.round(clamp(rng.normal(0.5 + (c.def - 50) / 200, 0.2), 0.05, 0.95) * 100) / 100,
    late: Math.round(clamp(rng.normal(0.5 + (c.off - 50) / 160, 0.2), 0.05, 0.95) * 100) / 100,
    star: Math.round(clamp(rng.normal(sys === "helio" ? 0.65 : 0.45, 0.2), 0.05, 0.95) * 100) / 100
  };
}
function genCoach(S, rng, o) {
  o = o || {};
  const c = {
    id: S.nextCid++, last: o.last || rng.pick(P.LAST),
    born: o.born || S.season - rng.int(36, 58), ex: o.ex || null,
    off: Math.round(clamp(o.off !== undefined ? o.off : rng.normal(50, 12), 20, 95)),
    def: Math.round(clamp(o.def !== undefined ? o.def : rng.normal(50, 12), 20, 95)),
    dev: Math.round(clamp(o.dev !== undefined ? o.dev : rng.normal(50, 12), 20, 95)),
    style: {
      pace: Math.round(clamp(rng.normal(0, 0.45), -1, 1) * 100) / 100,     // -1 grind it out .. +1 run and gun
      tackle: Math.round(clamp(rng.normal(1, 0.22), 0.6, 1.5) * 100) / 100, // how often his defenders go for the hit
      four: Math.round(clamp(rng.normal(1, 0.22), 0.6, 1.5) * 100) / 100,   // appetite for 30-footers
      sw: Math.round(rng.next() * 100) / 100,                                // switch screens vs. fight over
      depth: rng.int(8, 11)                                                  // rotation size
    },
    team: null, from: null, available: S.season, retired: null,
    w: 0, l: 0, pw: 0, pl: 0, titles: 0, awards: [], hist: [], trouble: Math.round(clamp(rng.normal(0.12, 0.1), 0, 0.6) * 100) / 100
  };
  if (o.role === "BRUISER") c.style.tackle = Math.round(clamp(c.style.tackle + 0.15, 0.6, 1.5) * 100) / 100;
  if (o.role === "SNIPER") c.style.four = Math.round(clamp(c.style.four + 0.2, 0.6, 1.5) * 100) / 100;
  c.phil = genPhil(S, rng, c, o.role);
  c.first = o.first || P.pickFirst(rng, c.born);
  // don't hand a coach the exact name of a player in the league
  if (!o.ex) for (let k = 0; k < 5 && Object.values(S.players).some(p => p.first === c.first && p.last === c.last); k++) c.last = rng.pick(P.LAST);
  S.coaches[c.id] = c;
  return c;
}
function tactics(c) {
  if (!c) return null;
  const ph = c.phil || {};
  return { pace: c.style.pace, tackle: c.style.tackle, four: c.style.four, sw: c.style.sw, depth: c.style.depth, d: (c.def - 50) / 50, o: (c.off - 50) / 50,
    sys: ph.sys || "motion", scheme: ph.scheme || "man", hit: ph.hit || "contain", adapt: ph.adapt !== undefined ? ph.adapt : 0.5, disc: ph.disc !== undefined ? ph.disc : 0.5,
    late: ph.late !== undefined ? ph.late : 0.5, star: ph.star !== undefined ? ph.star : 0.5 };
}
// A retiring player with a high IQ may start an assistant career and become a head coach later.
function maybeCoachingCareer(S, p, rng) {
  const age = S.season - p.born;
  if (age < 29 || p.r.iq < 58 || !rng.chance(0.08 + (p.r.iq - 58) * 0.006)) return null;
  const c = genCoach(S, rng, {
    first: p.first, last: p.last, born: p.born, ex: p.id, role: p.role,
    off: p.r.iq * 0.55 + p.r.pas * 0.2 + rng.normal(10, 9), def: p.r.iq * 0.4 + (p.r.perD + p.r.tck + p.r.rim) / 3 * 0.35 + rng.normal(12, 9)
  });
  c.available = S.season + rng.int(2, 6); // years as an assistant first
  p.coach = c.id;
  return c;
}
function hireCoach(S, tid, rng, why, log) {
  const o = S.owners[S.teams[tid].owner];
  let pool = Object.values(S.coaches).filter(c => !c.team && !c.retired && c.available <= S.season && S.season - c.born < 70);
  while (pool.length < 4) pool.push(genCoach(S, rng));
  const score = c => (c.off + c.def + c.dev) / 3 + (o ? o.wealth * 2 : 0) + rng.normal(0, o ? 4 + o.meddle * 8 : 6)
    + (c.ex && S.players[c.ex] && S.players[c.ex].teams.includes(tid) ? 5 : 0) + (c.w + c.l > 0 ? (c.w / (c.w + c.l) - 0.5) * 20 : 0);
  pool.sort((a, b) => score(b) - score(a));
  const c = pool[0];
  c.team = tid; c.from = S.season; S.teams[tid].coach = c.id;
  S.teams[tid].coachHist.push({ cid: c.id, from: S.season, to: null });
  if (log) log("coach-hire", { cid: c.id, team: tid, why: why || "" });
  return c;
}
function releaseCoach(S, tid, why, log) {
  const t = S.teams[tid], c = S.coaches[t.coach]; if (!c) return;
  c.team = null; c.available = S.season + 1;
  c.hist.push({ team: tid, from: c.from, to: S.season, why });
  const h = t.coachHist[t.coachHist.length - 1]; if (h) { h.to = S.season; h.why = why; }
  t.coach = null;
  if (log) log("coach-" + why, { cid: c.id, team: tid });
}

// ---------- owners ----------
function genOwner(S, rng, tid, how, parent) {
  const o = {
    id: S.nextOid++, last: parent ? parent.last : rng.pick(P.LAST),
    born: parent ? parent.born + rng.int(24, 36) : S.season - rng.int(40, 66),
    wealth: parent ? clamp(parent.wealth + rng.int(-1, 1), 1, 5) : rng.int(1, 5),
    patience: Math.round(clamp(parent ? parent.patience + rng.normal(0, 0.25) : rng.next(), 0, 1) * 100) / 100,
    spend: Math.round(clamp(parent ? parent.spend + rng.normal(0, 0.25) : rng.next(), 0, 1) * 100) / 100,
    meddle: Math.round(clamp(rng.next() * (parent ? 0.8 : 1), 0, 1) * 100) / 100,
    biz: how === "founder" ? FOUNDING_COMPANIES[tid] : parent ? parent.biz : rng.pick(BUSINESSES),
    team: tid, from: S.season, to: null, how, retired: null
  };
  o.first = P.pickFirst(rng, o.born);
  S.owners[o.id] = o; S.teams[tid].owner = o.id; S.teams[tid].ownerHist.push({ oid: o.id, from: S.season, how });
  return o;
}
function payrollTarget(S, tid) { const o = S.owners[S.teams[tid].owner]; return P.capFor(S.season) * (0.86 + 0.14 * (o ? o.spend : 0.5)); }

// ---------- yearly staff moves (called in the offseason, after standings are final) ----------
function staffOffseason(S, rng, log, lastSeason) {
  for (const tid of S.active) {
    const t = S.teams[tid], c = S.coaches[t.coach], o = S.owners[t.owner];
    // owner succession
    if (o) {
      const age = S.season - o.born;
      const scandal = rng.chance(0.004);
      if (scandal || (age >= 68 && rng.chance(0.06 + (age - 68) * 0.035))) {
        o.retired = S.season; o.to = S.season;
        const heir = !scandal && rng.chance(0.6);
        const n = genOwner(S, rng, tid, heir ? "heir" : "purchase", heir ? o : null);
        log("owner-change", { team: tid, from: o.id, to: n.id, how: scandal ? "forced sale" : heir ? "heir" : "sale" });
      }
    }
    // coach: retire or get fired
    if (c) {
      const age = S.season - c.born;
      const h = t.hist.slice(-2), pct = h.length ? h.reduce((a, x) => a + x.w, 0) / h.reduce((a, x) => a + x.w + x.l, 0) : 0.5;
      const tenure = S.season - c.from;
      const last = t.hist[t.hist.length - 1];
      const pat = o ? o.patience : 0.5;
      const lastPct = last ? last.w / (last.w + last.l) : 0.5;
      const dry = t.hist.slice(-4).filter(x => x.res === "-").length; // playoff droughts wear thin
      let fire = 0;
      if (last && last.res !== "Champion") {
        if (tenure >= 2 && pct < 0.45) fire = 0.3 + 0.45 * (1 - pat) + (0.45 - pct) * 2;
        else if (tenure >= 1 && lastPct < 0.35) fire = 0.35 + 0.4 * (o ? o.meddle : 0.5);
        else if (tenure >= 4 && dry >= 3) fire = 0.25 + 0.3 * (1 - pat);
        else if (tenure >= 6 && last.res === "-") fire = 0.12;
      }
      if (age >= 63 && rng.chance(age >= 70 ? 0.6 : 0.18)) { releaseCoach(S, tid, "retired", log); c.retired = S.season; }
      else if (rng.chance(clamp(fire, 0, 0.95))) releaseCoach(S, tid, "fired", log);
    }
    if (!t.coach) hireCoach(S, tid, rng, "offseason", log);
  }
  // old unemployed coaches drift into retirement
  for (const c of Object.values(S.coaches)) if (!c.team && !c.retired && S.season - c.born >= 68) c.retired = S.season;
}
// Mid-season: meddling owners fire coaches of collapsing teams at the deadline.
function midseasonFirings(S, rng, log) {
  for (const tid of S.active) {
    const [w, l] = S.cur.standings[tid], t = S.teams[tid], o = S.owners[t.owner], c = S.coaches[t.coach];
    if (!c || w + l < 30) continue;
    if (w / (w + l) < 0.3 && S.season - c.from >= 1 && rng.chance(0.15 + 0.5 * (o ? o.meddle : 0.5))) {
      recordCoachSeason(S, tid, true);
      releaseCoach(S, tid, "fired", log);
      const n = hireCoach(S, tid, rng, "interim", log); n.interim = S.season;
      S.cur.coachStart[tid] = { cid: n.id, w, l };
    }
  }
}
// Credit a coach for the games he coached this season (handles mid-season changes).
function recordCoachSeason(S, tid, partial) {
  const cur = S.cur, c = S.coaches[S.teams[tid].coach]; if (!c) return;
  const st = cur.standings[tid], s0 = cur.coachStart[tid] || { w: 0, l: 0 };
  const w = st[0] - s0.w, l = st[1] - s0.l;
  c.w += w; c.l += l;
  c.seasons = c.seasons || [];
  c.seasons.push({ season: S.season, team: tid, w, l, partial: !!partial });
}
const API = { genCoach, genOwner, tactics, hireCoach, releaseCoach, staffOffseason, midseasonFirings, recordCoachSeason, maybeCoachingCareer, payrollTarget, FOUNDING_COMPANIES };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
