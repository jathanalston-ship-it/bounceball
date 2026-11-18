// ===================== FRONT OFFICE: GMs, scouting, star power, feuds =====================
// League v0.7.
//   * GMs are people. Each has a style (win-now, rebuilder, gambler, loyalist, old-school, and from the
//     1990s analytics), a scouting eye and a deal-making knack. Owners hire and fire them; ex-players and
//     ex-coaches move upstairs. Executive of the Year goes to the best rebuild.
//   * Scouting fog: no front office sees a player's true rating. Each GM sees it with an error (smaller for
//     his own players, larger for prospects), bent by his style. Good scouts find steals; bad ones draft busts.
//   * Star power: stars demand trades from losers and from feuds, hold out for raises, and pick their next team
//     on money, winning, stars, market and loyalty (superteams). Owners losing money dump salary.
//   * Feuds: stars clash with coaches and with teammates who want the same shots. A feud costs chemistry (and
//     passes), and a locker room with two of them splits. They cool, blow up, or end in a trade or a firing.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const P = NODE ? require("./players.js") : window.BB;
const { clamp, makeRng, hashStr } = E;
const r2 = x => Math.round(x * 100) / 100;
const age = (p, S) => S.season - p.born;

// ---------- temperament for the front-office era: ego and loyalty (each player's own stream) ----------
function giveEgo(S, p) {
  if (p.ego !== undefined) return;
  const r = makeRng(hashStr(S.masterSeed + ":ego:" + p.id) || 1);
  p.ego = r2(clamp(r.normal(0.45, 0.22) + (p.trouble || 0.25) * 0.2, 0, 1));   // wants the ball, the money and the spotlight
  p.loyal = r2(clamp(r.normal(0.5, 0.22), 0, 1));                              // would rather stay home
  p.show = r2(clamp(r.normal(0.4, 0.25) + (p.r.vert - 60) / 200, 0, 1));         // a showman (fans love him; he enters dunk contests)
}

// ---------- GMs ----------
const STYLES = ["win-now", "rebuilder", "gambler", "loyalist", "old-school", "analytics"];
const STYLE_NAME = { "win-now": "Win-now", rebuilder: "Rebuilder", gambler: "Gambler", loyalist: "Loyalist", "old-school": "Old-school", analytics: "Analytics" };
function styleWeights(season) { const a = season < 1990 ? 0 : clamp((season - 1990) / 24, 0, 1) * 34; return { "win-now": 22, rebuilder: 18, gambler: 12, loyalist: 18, "old-school": Math.max(3, 28 - a), analytics: a }; }
function wpick(rng, w) { let t = 0; for (const k in w) t += w[k]; let x = rng.next() * t; for (const k in w) { x -= w[k]; if (x <= 0) return k; } return Object.keys(w)[0]; }
function initLeague(S) {
  if (S.gms) return;
  S.gms = {}; S.nextGmid = 1; S.feuds = S.feuds || []; S.nextFid = 1;
}
function genGM(S, rng, o) {
  o = o || {};
  const style = o.style || wpick(rng, styleWeights(S.season)), born = o.born || S.season - rng.int(34, 58);
  const g = { id: S.nextGmid++, first: o.first || P.pickFirst(rng, born), last: o.last || rng.pick(P.LAST), born, style, ex: o.ex || null, exCoach: o.exCoach || null,
    scout: r2(clamp(rng.normal(0.5, 0.17) + (style === "analytics" ? 0.12 : 0) + (o.scout || 0), 0.05, 0.95)),
    deal: r2(clamp(rng.normal(0.5, 0.16), 0.05, 0.95)),
    team: null, from: null, available: o.available || S.season, retired: null, hist: [], awards: [], trades: 0 };
  S.gms[g.id] = g; return g;
}
function gmOf(S, tid) { const t = S.teams[tid]; return t && t.gm ? S.gms[t.gm] : null; }
function hireGM(S, tid, rng, why, log) {
  const o = S.owners[S.teams[tid].owner];
  let pool = Object.values(S.gms).filter(g => !g.team && !g.retired && g.available <= S.season && S.season - g.born < 70);
  while (pool.length < 4) pool.push(genGM(S, rng));
  const score = g => g.scout * 20 + g.deal * 15 + (g.hist.length ? g.hist.reduce((a, h) => a + (h.w - h.l), 0) / Math.max(1, g.hist.length) * 0.15 : 0) + rng.normal(0, 5 + (o ? o.meddle * 6 : 3))
    + (g.ex && S.players[g.ex] && (S.players[g.ex].teams || []).includes(tid) ? 4 : 0);
  pool.sort((a, b) => score(b) - score(a));
  const g = pool[0];
  g.team = tid; g.from = S.season; S.teams[tid].gm = g.id;
  (S.teams[tid].gmHist = S.teams[tid].gmHist || []).push({ gid: g.id, from: S.season, to: null });
  if (log) log("gm-hire", { gid: g.id, team: tid, why: why || "" });
  return g;
}
function releaseGM(S, tid, why, log) {
  const t = S.teams[tid], g = S.gms[t.gm]; if (!g) return;
  g.team = null; g.available = S.season + 1;
  const w = (t.hist || []).filter(h => h.season >= g.from), W = w.reduce((a, h) => a + h.w, 0), L = w.reduce((a, h) => a + h.l, 0);
  g.hist.push({ team: tid, from: g.from, to: S.season, why, w: W, l: L, titles: w.filter(h => h.res === "Champion").length });
  const h = (t.gmHist || [])[t.gmHist.length - 1]; if (h) { h.to = S.season; h.why = why; }
  t.gm = null;
  if (log) log("gm-" + why, { gid: g.id, team: tid });
}
// a retiring player or a fired coach may move upstairs
function maybeFrontOffice(S, p, rng) {
  const a = age(p, S);
  if (a < 30 || p.r.iq < 60 || p.coach || !rng.chance(0.04 + (p.r.iq - 60) * 0.004)) return null;
  const style = rng.pick(["win-now", "loyalist", "old-school", "gambler", S.season >= 1995 ? "analytics" : "rebuilder"]);
  const g = genGM(S, rng, { first: p.first, last: p.last, born: p.born, ex: p.id, style, available: S.season + rng.int(3, 8), scout: (p.r.iq - 60) / 200 });
  p.gm = g.id; return g;
}
// owners fire GMs who lose; new owners bring their own man; old GMs retire
function gmOffseason(S, rng, log, news) {
  for (const tid of S.active) {
    const t = S.teams[tid], g = gmOf(S, tid), o = S.owners[t.owner];
    if (g) {
      const ten = S.season - g.from, h = t.hist.slice(-3), pct = h.length ? h.reduce((a, x) => a + x.w, 0) / Math.max(1, h.reduce((a, x) => a + x.w + x.l, 0)) : 0.5;
      const last = t.hist[t.hist.length - 1], dry = t.hist.slice(-5).filter(x => x.res === "-").length;
      const newBoss = o && o.from >= S.season - 1 && o.how !== "heir" && g.from < o.from;
      let fire = 0;
      if (last && last.res !== "Champion") {
        if (ten >= 3 && pct < 0.42) fire = 0.3 + 0.4 * (1 - (o ? o.patience : 0.5)) + (0.42 - pct) * 2;
        else if (ten >= 5 && dry >= 5) fire = 0.3;
      }
      if (newBoss) fire = Math.max(fire, 0.45);
      if (S.season - g.born >= 68 && rng.chance(0.4)) { releaseGM(S, tid, "retired", log); g.retired = S.season; }
      else if (rng.chance(clamp(fire, 0, 0.9))) { releaseGM(S, tid, "fired", log); news("gm", `The {t:${tid}} fire GM {g:${g.id}}`, { team: tid, gid: g.id }); }
    }
    if (!t.gm) hireGM(S, tid, rng, "offseason", log);
  }
  for (const g of Object.values(S.gms)) if (!g.team && !g.retired && S.season - g.born >= 70) g.retired = S.season;
}
// Executive of the Year: the GM whose team improved the most (he has to have been there a year)
function eoyPick(S, st) {
  let eoy = null, ev = -1e9;
  for (const tid of S.active) {
    const g = gmOf(S, tid), h = S.teams[tid].hist; if (!g || S.season - g.from < 1 || !h.length) continue;
    const v = (st[tid][0] - h[h.length - 1].w) + st[tid][0] * 0.1;
    if (v > ev) { ev = v; eoy = g.id; }
  }
  if (eoy) S.gms[eoy].awards.push([S.season, "eoy"]);
  return eoy;
}

// ---------- scouting fog ----------
const SEEN = new Map(); let seenSeason = -1;
function noise(S, gid, pid, salt) { return makeRng(hashStr(S.masterSeed + ":seen:" + S.season + ":" + gid + ":" + pid + salt) || 1).normal(0, 1); }
// the (era-relative) rating tid's front office believes a player has
function seenOvr(S, tid, p) {
  if (seenSeason !== S.season) { SEEN.clear(); seenSeason = S.season; }
  const g = gmOf(S, tid); if (!g) return p.ovr;
  const key = g.id * 1e7 + p.id + (p.team === tid ? 0.5 : 0); if (SEEN.has(key)) return SEEN.get(key);
  const G = P.eraGain(S.season), r = k => p.r[k] - G;
  const sd = p.team === tid ? 0.8 + 2.4 * (1 - g.scout) : 1.6 + 4.8 * (1 - g.scout);
  let v = p.ovr + noise(S, g.id, p.id, "") * sd;
  if (g.style === "analytics") v += ((r("thr") + r("fr")) / 2 - 55) / 12 + ((p.ovr - 60) > 0 && age(p, S) >= 31 ? -1.5 : 0); // shooters; sells old players
  else if (g.style === "old-school") v += ((r("tck") + r("str")) / 2 - 55) / 12 - ((r("fr") - 50) / 25);
  else if (g.style === "gambler" && age(p, S) <= 24) v += 1.5;
  SEEN.set(key, v); return v;
}
// trade value through tid's eyes
function value(S, tid, p, mode) {
  const g = gmOf(S, tid), a = age(p, S);
  let v = P.tradeValue({ ovr: seenOvr(S, tid, p), born: p.born }, S.season, mode);
  if (!g) return v;
  if (g.style === "rebuilder") v *= a <= 25 ? 1.15 : a >= 30 ? 0.8 : 1;
  else if (g.style === "win-now") v *= a >= 27 ? 1.1 : 0.95;
  else if (g.style === "loyalist" && p.team === tid) v *= 1.25;
  else if (g.style === "gambler") v *= a <= 24 ? 1.2 : 1;
  return v;
}
function teamMode(S, tid, base, pct) {
  const g = gmOf(S, tid); if (!g) return base;
  if (g.style === "win-now" && base === "middle") return "contend";
  if (g.style === "rebuilder" && base === "middle" && pct < 0.5) return "rebuild";
  if (g.style === "loyalist" && base === "rebuild" && pct > 0.38) return "middle";
  return base;
}
function appetite(S, tid) { const g = gmOf(S, tid); return !g ? 1 : { "win-now": 1.3, rebuilder: 1.1, gambler: 1.6, loyalist: 0.45, "old-school": 0.85, analytics: 1.1 }[g.style]; }

// ---------- draft night ----------
// what a prospect will become (roughly): his rating now, plus youth and work ethic
function potential(p, S) { return p.ovr + (22 - age(p, S)) * 2.2 + (p.drive - 50) / 50 * 4; }
function boardView(S, tid, p) {
  const g = gmOf(S, tid), sc = g ? g.scout : 0.5, G = P.eraGain(S.season), r = k => p.r[k] - G;
  let v = p.ovr + (22 - age(p, S)) * 2.2 + (p.drive - 50) / 50 * 4 * sc + noise(S, g ? g.id : 0, p.id, "draft") * (2 + 6.5 * (1 - sc));
  if (g && g.style === "analytics") v += ((r("thr") + r("fr")) / 2 - 50) / 10;
  if (g && g.style === "old-school") v += (p.ht - 78 - P.eraHt(S.season)) / 3 + (r("tck") - 50) / 15;
  if (g && g.style === "gambler") v += (22 - age(p, S)) * 0.8 + Math.abs(noise(S, g.id, p.id, "boom")) * 1.5;
  return v;
}
function scoutingTags(p, S) {
  const G = P.eraGain(S.season), r = k => p.r[k] - G, t = [];
  if (age(p, S) <= 19) t.push("raw"); else if (age(p, S) >= 22) t.push("polished");
  if (r("vert") >= 70 || r("spd") >= 72) t.push("explosive");
  if (r("fr") >= 66) t.push("four-point range"); else if (r("thr") >= 68) t.push("shooter");
  if (r("tck") >= 68) t.push("hitter"); if (r("pas") >= 68) t.push("vision");
  if (p.drive >= 72) t.push("high motor"); else if (p.drive <= 30 && makeRng(hashStr("tag" + p.id)).chance(0.5)) t.push("questions about his motor");
  if (p.trouble >= 0.5) t.push("character concerns");
  return t.slice(0, 3);
}
// order: first-round order (team ids). Returns the draft-night record; picks are applied with H.pick(p, team, round, no).
function draftNight(S, pool, order, rng, H) {
  const N = order.length, slots = [];
  for (const round of [1, 2]) for (const orig of order) { const k = S.picks.find(x => x.draft === S.season && x.round === round && x.orig === orig); slots.push({ round, orig, team: k ? k.owner : orig, via: k && k.owner !== orig ? orig : null }); }
  // the media's big board: the consensus
  for (const p of pool) p.scout = Math.round((potential(p, S) + noise(S, 0, p.id, "media") * 3.5) * 10) / 10;
  const board = pool.slice().sort((a, b) => b.scout - a.scout), bRank = new Map(board.map((p, i) => [p.id, i + 1]));
  const rec = { year: S.season, board: board.slice(0, 30).map(p => ({ pid: p.id, name: p.first + " " + p.last, role: p.role, age: age(p, S) + 1, tags: scoutingTags(p, S) })), picks: [], trades: [] };
  const avail = pool.slice();
  for (let i = 0; i < slots.length && avail.length; i++) {
    const sl = slots[i], no = i + 1;
    // draft-night trades: a team further down falls in love with someone and moves up
    if (sl.round === 1 && i < N - 1 && rng.chance(S.season >= 1985 ? 0.11 : 0.06)) {
      const later = slots.slice(i + 1, Math.min(slots.length, i + 9)).filter(x => x.round === 1 && x.team !== sl.team);
      if (later.length) {
        const up = later[Math.floor(rng.next() * later.length)], ug = gmOf(S, up.team), keen = ug && (ug.style === "gambler" || ug.style === "win-now") ? 1 : 0.5;
        const top = avail.slice().sort((a, b) => boardView(S, up.team, b) - boardView(S, up.team, a))[0];
        if (top && rng.chance(keen)) {
          const jump = slots.indexOf(up) - i, fut = S.picks.find(k => k.owner === up.team && k.draft === S.season + 1 && k.round === (jump >= 6 ? 1 : 2));
          const down = sl.team; sl.team = up.team; up.team = down;
          if (fut) fut.owner = down;
          rec.trades.push({ no, up: sl.team, down, swap: slots.indexOf(up) + 1, fut: fut ? [fut.draft, fut.round] : null });
          H.log("draft-trade", { up: sl.team, down, no, swap: slots.indexOf(up) + 1, fut: fut ? [fut.draft, fut.round] : null });
        }
      }
    }
    // his board, plus what his roster needs
    const ros = H.roster(sl.team), have = r => ros.filter(q => q.role === r).length;
    let best = null, bv = -1e9;
    for (const p of avail) { const v = boardView(S, sl.team, p) + (have(p.role) <= 1 ? 1.5 : have(p.role) >= 4 ? -1.5 : 0); if (v > bv) { bv = v; best = p; } }
    avail.splice(avail.indexOf(best), 1);
    const br = bRank.get(best.id), grade = sl.round === 1 ? (br - no >= 6 ? "reach" : no - br >= 6 ? "steal" : "") : (br <= N ? "steal" : "");
    rec.picks.push({ no, round: sl.round, team: sl.team, pid: best.id, name: best.first + " " + best.last, role: best.role, board: br, grade, via: sl.via });
    H.pick(best, sl.team, sl.round, no);
  }
  return { rec, undrafted: avail };
}

// ---------- star power ----------
const isStar = p => p.ovr >= 74;
function winPct(S, tid) {
  const st = S.cur && S.cur.standings ? S.cur.standings[tid] : null;
  if (st && st[0] + st[1] >= 15) return st[0] / (st[0] + st[1]);
  const h = S.teams[tid].hist, l = h[h.length - 1]; return l ? l.w / Math.max(1, l.w + l.l) : 0.5;
}
// stars on losing teams (or in a feud) ask out
function demands(S, rng, H, when) {
  const out = [];
  for (const tid of S.active) for (const p of H.roster(tid)) {
    if (!isStar(p) || p.demand || (p.contract && p.contract.signed === S.season && when === "deadline")) continue;
    const pct = winPct(S, tid), feud = S.feuds.some(f => !f.end && (f.a === p.id || f.b === p.id)), losing = pct < 0.45;
    if (!losing && !feud) continue;
    const pr = 0.05 * p.ego * (1.2 - p.loyal) * (losing ? 1 + (0.45 - pct) * 6 : 1) * (feud ? 2.2 : 1) * (age(p, S) >= 27 ? 1.3 : 0.7);
    if (!rng.chance(clamp(pr, 0, 0.5))) continue;
    p.demand = { season: S.season, why: feud ? "feud" : "losing", day: S.cur ? S.cur.day : -1 };
    H.log("demand", { pid: p.id, team: tid, why: p.demand.why });
    H.news("demand", `{p:${p.id}} wants out of {t:${tid}}${feud ? " after a falling-out" : ""}`, { pid: p.id, team: tid });
    out.push(p);
  }
  return out;
}
// a star with years left on a deal far below his worth holds out of camp
function holdouts(S, rng, H) {
  const reserve = S.biz && S.biz.fa === "reserve";
  for (const tid of S.active) for (const p of H.roster(tid)) {
    const c = p.contract; if (!isStar(p) || !c || c.thru <= S.season || c.signed === S.season) continue;
    const ask = P.askingSalary(p, S.season); if (c.salary > ask * 0.62 || p.ego < 0.45) continue;
    if (!rng.chance(clamp(0.22 * p.ego * (reserve ? 1.6 : 1) * (1.2 - p.loyal), 0, 0.5))) continue;
    const g = gmOf(S, tid), soft = g && (g.style === "loyalist" || g.style === "win-now");
    p.holdout = rng.int(soft ? 1 : 3, soft ? 8 : 22); p.holdAsk = ask;
    H.log("holdout", { pid: p.id, team: tid, salary: c.salary, ask });
    H.news("holdout", `{p:${p.id}} holds out of {t:${tid}} camp, wanting a new deal`, { pid: p.id, team: tid });
  }
}
// he reports: with his raise, or without
function holdoutEnds(S, p, rng, H) {
  const g = gmOf(S, p.team), give = g && (g.style === "loyalist" || g.style === "win-now") ? 0.75 : g && g.style === "analytics" ? 0.25 : 0.5;
  if (rng.chance(give) && p.contract) {
    p.contract = { salary: Math.round(p.holdAsk / 1000) * 1000, thru: p.contract.thru + 1, signed: S.season };
    H.log("extend", { pid: p.id, team: p.team, salary: p.contract.salary, years: p.contract.thru - S.season + 1, why: "holdout" });
    H.news("holdout", `{p:${p.id}} ends his holdout with a new deal from {t:${p.team}}`, { pid: p.id, team: p.team });
  } else H.news("holdout", `{p:${p.id}} reports to {t:${p.team}} without a new contract`, { pid: p.id, team: p.team });
  p.holdout = 0; delete p.holdAsk;
}
// free agency: how much a player likes an offer (money, winning, other stars, the market, home)
function faUtility(S, p, o, ask, strength, stars, B) {
  const a = age(p, S), star = isStar(p);
  const wWin = 0.25 + (a >= 29 ? 0.3 : 0) + (1 - p.ego) * 0.2 + (star ? 0.1 : 0);
  const others = stars[o.tid] || 0, starPull = p.ego < 0.5 ? 0.06 * Math.min(2, others) : -0.04 * others; // join the stars, or be the man
  const m = B ? B.market(B.cityOf(S, o.tid), S.season) : 0.5;
  const home = p.teams && p.teams[p.teams.length - 1] === o.tid ? 0.08 + p.loyal * 0.2 : 0;
  return o.offer / Math.max(1, ask) + wWin * (strength[o.tid] - 60) * 0.03 + starPull + 0.08 * p.ego * m + home;
}

// ---------- feuds ----------
// usage: who wants the shots (season field-goal attempts per game)
function feudTick(S, rng, H) {
  const cur = S.cur, live = S.feuds.filter(f => !f.end);
  for (const f of live) {
    const pct = winPct(S, f.team), A = S.players[f.a];
    if (!A || A.team !== f.team || (f.b && S.players[f.b].team !== f.team) || (f.c && S.teams[f.team].coach !== f.c)) { endFeud(S, f, "split up", H); continue; }
    f.heat = r2(clamp(f.heat * 0.95 + (pct < 0.45 ? 0.05 : -0.02) + rng.normal(0, 0.03), 0, 1));
    if (f.heat < 0.12) { endFeud(S, f, "patched it up", H); continue; }
    if (f.heat > 0.72 && !f.blew && rng.chance(0.25)) {
      f.blew = true;
      if (f.kind === "mate") { H.blot(A, "got into a fight with a teammate at practice and was suspended a game", 1); H.news("feud", `{p:${f.a}} and {p:${f.b}} come to blows at {t:${f.team}} practice`, { team: f.team }); }
      else H.news("feud", `{p:${f.a}} rips {c:${f.c}} to reporters: "He doesn't know what he's doing"`, { team: f.team });
    }
  }
  // new ones
  for (const tid of S.active) {
    if (S.feuds.filter(f => !f.end && f.team === tid).length >= 2) continue;
    const ros = H.roster(tid).filter(p => p.ego !== undefined), pct = winPct(S, tid), losing = pct < 0.45 ? 1.7 : pct < 0.5 ? 1.2 : 0.7;
    const st = cur ? cur.stats : {}, use = p => st[p.id] && st[p.id].gp ? st[p.id].fga / st[p.id].gp : p.ovr / 6;
    const c = S.coaches[S.teams[tid].coach];
    // star vs. coach: a big ego, a short fuse, a coach who won't bend (or won't feed him)
    for (const p of ros) {
      if (p.ovr < 70 || p.ego < 0.55 || S.feuds.some(f => !f.end && f.a === p.id)) continue;
      const strict = c && c.phil ? (c.phil.disc - 0.5) * 0.8 + (p.ego > 0.7 && c.phil.star < 0.4 ? 0.5 : 0) : 0;
      if (c && rng.chance(clamp(0.0036 * p.ego * (0.6 + p.temper) * losing * (1 + strict), 0, 0.03))) startFeud(S, { kind: "coach", a: p.id, c: c.id, team: tid }, H);
    }
    // teammates: two guys who both want the last shot
    const top = ros.filter(p => p.ego >= 0.5 && p.ovr >= 66).sort((a, b) => use(b) - use(a)).slice(0, 3);
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const A = top[i], B = top[j];
      if (S.feuds.some(f => !f.end && ((f.a === A.id && f.b === B.id) || (f.a === B.id && f.b === A.id)))) continue;
      if (rng.chance(clamp(0.003 * A.ego * B.ego * losing * (0.7 + (A.temper + B.temper) / 2), 0, 0.025))) startFeud(S, { kind: "mate", a: A.id, b: B.id, team: tid }, H);
    }
  }
}
function startFeud(S, o, H) {
  const f = Object.assign({ id: S.nextFid++, season: S.season, day: S.cur ? S.cur.day : -1, heat: 0.45, end: null }, o);
  S.feuds.push(f);
  H.log("feud", { team: f.team, a: f.a, b: f.b || null, c: f.c || null, kind: f.kind });
  H.news("feud", f.kind === "coach" ? `Trouble in {t:${f.team}}: {p:${f.a}} and coach {c:${f.c}} aren't speaking` : `{p:${f.a}} and {p:${f.b}} are feuding in the {t:${f.team}} locker room`, { team: f.team });
  return f;
}
function endFeud(S, f, how, H) { f.end = { season: S.season, how }; if (how === "patched it up") H.news("feud", f.kind === "coach" ? `{p:${f.a}} and {c:${f.c}} bury the hatchet` : `{p:${f.a}} and {p:${f.b}} patch things up`, { team: f.team }); }
// what a game feels from the feuds on each side: chemistry, passes not thrown, a bad mood
function feudCtx(S, sp, ids) {
  const at = {}; ids.forEach((id, i) => at[id] = i);
  const fd = [], md = {}, chemMul = {};
  for (const tid of [sp.home, sp.away]) {
    const fs = S.feuds.filter(f => !f.end && f.team === tid); if (!fs.length) continue;
    const split = fs.length >= 2 || fs.some(f => f.heat > 0.6);
    for (const f of fs) {
      if (f.kind === "mate" && at[f.a] !== undefined && at[f.b] !== undefined) fd.push([at[f.a], at[f.b]]);
      for (const id of [f.a, f.b]) if (id && at[id] !== undefined) { chemMul[at[id]] = Math.min(chemMul[at[id]] || 1, 0.85); if (f.kind === "coach") md[at[id]] = -0.25; }
    }
    if (split) for (const id of (tid === sp.home ? sp.h : sp.a)) if (at[id] !== undefined) chemMul[at[id]] = Math.min(chemMul[at[id]] || 1, 0.92);
  }
  for (const id of ids) { const p = S.players[id]; if (p && p.demand && at[id] !== undefined) md[at[id]] = (md[at[id]] || 0) - 0.12; }
  return { fd, md, chemMul };
}
// at season's end: coach feuds get settled upstairs (the star wins if he's good enough), the rest cool
function feudOffseason(S, rng, H) {
  const fire = new Set();
  for (const f of S.feuds.filter(f => !f.end)) {
    const A = S.players[f.a];
    if (f.kind === "coach" && A && A.team === f.team && S.teams[f.team].coach === f.c) {
      if (A.ovr >= 77 && rng.chance(0.55)) { fire.add(f.team); endFeud(S, f, "coach fired", H); continue; }
      if (rng.chance(0.4)) { A.demand = A.demand || { season: S.season, why: "feud" }; }
    }
    f.heat = r2(f.heat * 0.5);
    if (f.heat < 0.15) endFeud(S, f, "cooled off", H);
  }
  S.feuds = S.feuds.filter(f => !f.end || S.season - f.end.season <= 1);
  return fire;
}

const API = { giveEgo, STYLES, STYLE_NAME, initLeague, genGM, gmOf, hireGM, releaseGM, maybeFrontOffice, gmOffseason, eoyPick, seenOvr, value, teamMode, appetite, potential, draftNight, demands, holdouts, holdoutEnds, faUtility, feudTick, feudCtx, feudOffseason, isStar, endFeud };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
