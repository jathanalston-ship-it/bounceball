// ===================== LEAGUE: seasons, playoffs, offseason, front offices =====================
// All state is plain JSON (S). Every random choice comes from a seeded RNG keyed by
// (masterSeed, season, tag), so a full history run is reproducible.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const P = NODE ? require("./players.js") : window.BB;
const T = NODE ? require("./teams.js") : window.BB;
const { clamp, makeRng, hashStr } = E;
const LEAGUE_VERSION = "0.2.0";
const GAMES = 82, ROSTER_MIN = 13, ROSTER_MAX = 15, ACTIVE = 13;
const ROSTER_ROLES = ["PG","WING","SNIPER","BRUISER","BIG","PG","WING","WING","SNIPER","BRUISER","BRUISER","BIG","BIG"];
const STAT_KEYS = ["gp","gs","min","pts","fgm","fga","tpm","tpa","fpm","fpa","ftm","fta","oreb","dreb","ast","stl","blk","to","tkl","btk","pf"];

function rngFor(S, tag) { return makeRng(hashStr(S.masterSeed + ":" + S.season + ":" + tag)); }
const pl = (S, id) => S.players[id];
const teamPlayers = (S, tid) => S.teams[tid].roster.map(id => S.players[id]);
function payroll(S, tid, season) {
  season = season || S.season;
  const t = S.teams[tid]; let s = 0;
  for (const id of t.roster) { const c = S.players[id].contract; if (c && c.thru >= season) s += c.salary; }
  for (const d of t.dead) if (d.thru >= season) s += d.amt;
  return s;
}
function log(S, type, data) { const e = Object.assign({ type, season: S.season, day: S.cur ? S.cur.day : -1 }, data); (S.cur ? S.cur.tx : S.offTx).push(e); return e; }
function setNumber(S, p, tid, rng) {
  const used = new Set(S.teams[tid].roster.filter(id => id !== p.id).map(id => S.players[id].num));
  if (!used.has(p.num) && p.num) return;
  let n, k = 0; do { n = rng.int(0, 55); k++; } while (used.has(n) && k < 200); p.num = n;
}
function addToTeam(S, p, tid, rng) { p.team = tid; S.teams[tid].roster.push(p.id); setNumber(S, p, tid, rng); }
function removeFromTeam(S, p) { if (!p.team) return; const r = S.teams[p.team].roster; r.splice(r.indexOf(p.id), 1); p.team = null; }
function newPlayer(S, rng, role, q, age) {
  const p = P.genPlayer(rng, role, q, S.nextPid++, S.season, age);
  p.career = null; p.awards = []; p.teams = [];
  S.players[p.id] = p; return p;
}
function contractYears(age, rng) { return age < 25 ? rng.int(3, 4) : age < 30 ? rng.int(2, 4) : age < 33 ? rng.int(1, 2) : 1; }
function sign(S, p, tid, salary, years, rng, how) {
  p.contract = { salary, thru: S.season + years - 1, signed: S.season };
  if (p.team !== tid) { removeFromTeam(S, p); addToTeam(S, p, tid, rng); }
  if (!p.teams.length || p.teams[p.teams.length - 1] !== tid) p.teams.push(tid);
  if (how) log(S, "sign", { pid: p.id, team: tid, salary, years, how });
}

// ---------- league creation & new teams ----------
function generateRoster(S, tid, rng, q) {
  for (const role of ROSTER_ROLES) {
    const p = newPlayer(S, rng, role, q + rng.normal(0, 2));
    addToTeam(S, p, tid, rng);
    const yrs = contractYears(P.age(p, S.season), rng);
    p.contract = { salary: P.askingSalary(p, S.season), thru: S.season + yrs - 1, signed: S.season }; p.teams.push(tid);
  }
  // fit under the cap
  const cap = P.capFor(S.season) * 0.96, pay = payroll(S, tid);
  if (pay > cap) for (const id of S.teams[tid].roster) { const c = S.players[id].contract; c.salary = Math.max(P.minSalary(S.season), Math.round(c.salary * cap / pay / 1000) * 1000); }
}
function addTeam(S, info) {
  S.teams[info.id] = { id: info.id, roster: [], dead: [], hist: [], titles: 0, joined: S.season };
  S.active.push(info.id);
}
function newLeague(masterSeed, startSeason) {
  const S = { masterSeed: String(masterSeed), season: startSeason || 1954, nextPid: 1, players: {}, teams: {}, active: [], picks: [], offTx: [], champions: [], hofClasses: [], cur: null, leagueVersion: LEAGUE_VERSION, engineVersion: E.ENGINE_VERSION };
  const rng = rngFor(S, "init");
  for (const info of T.TEAMS.filter(t => t.joined <= S.season)) { addTeam(S, info); generateRoster(S, info.id, rng, -1); }
  for (let y = S.season; y < S.season + 3; y++) addPicks(S, y);
  S.targets = ratingMeans(S);
  return S;
}
function addPicks(S, draftYear) {
  for (const tid of S.active) for (const round of [1, 2])
    if (!S.picks.find(k => k.draft === draftYear && k.round === round && k.orig === tid)) S.picks.push({ draft: draftYear, round, orig: tid, owner: tid });
}

// Era adjustment. Development noise compounds over careers and would slowly inflate the league
// (and the top tail). Each offseason, ratings are nudged back toward the founding era's distribution:
// the mean overall of rostered players, and its spread. Individual differences are preserved.
function ovrStats(S) {
  const xs = Object.values(S.players).filter(p => p.team && !p.retired).map(p => p.ovr);
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
  return { m, sd };
}
function ratingMeans(S) { return ovrStats(S); }
function eraAdjust(S) {
  const now = ovrStats(S), tg = S.targets;
  // spread: shrink deviations from each role's mean rating, at most 4% a year
  const f = clamp(tg.sd / now.sd, 0.96, 1);
  if (f < 1) {
    const roleMean = {};
    for (const role of P.ROLE_LIST) {
      const ps = Object.values(S.players).filter(p => p.team && !p.retired && p.role === role), m = {};
      for (const k of P.RKEYS) m[k] = ps.reduce((a, p) => a + p.r[k], 0) / Math.max(1, ps.length);
      roleMean[role] = m;
    }
    for (const p of Object.values(S.players)) if (!p.retired) for (const k of P.RKEYS) p.r[k] = roleMean[p.role][k] + (p.r[k] - roleMean[p.role][k]) * f;
  }
  for (const p of Object.values(S.players)) if (!p.retired) { for (const k of P.RKEYS) p.r[k] = Math.round(clamp(p.r[k], 20, 99)); p.ovr = P.overall(p); }
  const mid = ovrStats(S);
  const shift = (tg.m - mid.m) * 0.7 / 1.4; // ovr points -> raw rating points
  for (const p of Object.values(S.players)) if (!p.retired) { for (const k of P.RKEYS) p.r[k] = Math.round(clamp(p.r[k] + shift, 20, 99)); p.ovr = P.overall(p); }
  return { f, shift };
}

// ---------- schedule ----------
function circleRounds(n) {
  const ids = [...Array(n).keys()], rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const rd = [];
    for (let i = 0; i < n / 2; i++) rd.push([ids[i], ids[n - 1 - i]]);
    rounds.push(rd);
    ids.splice(1, 0, ids.pop());
  }
  return rounds;
}
function makeSchedule(teamIds, rng) {
  const N = teamIds.length; if (N % 2) throw new Error("odd team count");
  const k = Math.floor(GAMES / (N - 1)), r = GAMES - k * (N - 1);
  const rounds = circleRounds(N), pairs = [];
  for (let rep = 0; rep < k; rep++) for (const rd of rounds) for (const [i, j] of rd) pairs.push(rep % 2 ? [j, i] : [i, j]);
  for (let x = 0; x < r; x++) for (const [i, j] of rounds[x]) pairs.push(x % 2 ? [j, i] : [i, j]);
  // balance home games
  const home = new Array(N).fill(0); for (const [h] of pairs) home[h]++;
  for (let pass = 0; pass < 6; pass++) for (const pr of pairs) { const [h, a] = pr; if (home[h] - home[a] >= 2) { pr[0] = a; pr[1] = h; home[h]--; home[a]++; } }
  for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
  // pack into days: each team at most once per day; teams with the most games left go first
  const left = new Array(N).fill(GAMES); let rem = pairs.slice(); const days = [];
  while (rem.length) {
    rem.sort((p, q) => (left[q[0]] + left[q[1]]) - (left[p[0]] + left[p[1]]));
    const used = new Set(), day = [], keep = [];
    for (const pr of rem) {
      if (!used.has(pr[0]) && !used.has(pr[1])) { day.push([teamIds[pr[0]], teamIds[pr[1]]]); used.add(pr[0]); used.add(pr[1]); left[pr[0]]--; left[pr[1]]--; }
      else keep.push(pr);
    }
    days.push(day); rem = keep;
  }
  return days;
}

// ---------- depth chart ----------
function healthy(p) { return !p.injury || p.injury.out <= 0; }
function depthChart(S, tid, rng) {
  let avail = teamPlayers(S, tid).filter(healthy);
  if (avail.length < 10) { hardship(S, tid, 10 - avail.length, rng); avail = teamPlayers(S, tid).filter(healthy); }
  avail.sort((a, b) => b.ovr - a.ovr || a.id - b.id);
  const starters = [];
  for (const role of P.ROLE_LIST) {
    const best = avail.find(p => p.role === role && !starters.includes(p)) || avail.find(p => !starters.includes(p));
    starters.push(best);
  }
  const bench = avail.filter(p => !starters.includes(p)).slice(0, ACTIVE - 5);
  return starters.concat(bench);
}
function hardship(S, tid, n, rng) {
  const fas = Object.values(S.players).filter(p => !p.team && !p.retired && healthy(p) && p.fa).sort((a, b) => b.ovr - a.ovr);
  for (let i = 0; i < n; i++) {
    let p = fas[i];
    if (!p) { p = newPlayer(S, rng, rng.pick(P.ROLE_LIST), -12); p.fa = true; }
    p.fa = false; sign(S, p, tid, P.minSalary(S.season), 1, rng, "hardship");
  }
}

// ---------- season ----------
function startSeason(S) {
  const rng = rngFor(S, "schedule");
  S.cur = { season: S.season, day: 0, phase: "regular", schedule: makeSchedule(S.active, rng), games: [], tx: S.offTx, injuries: [], stats: {}, pstats: {}, standings: {}, deadlineDone: false, gameSeq: 0, playoffs: null, snapshot: snapshotPlayers(S) };
  S.offTx = [];
  for (const tid of S.active) S.cur.standings[tid] = [0, 0, 0, 0];
}
function snapshotPlayers(S) {
  const snap = {};
  for (const tid of S.active) for (const p of teamPlayers(S, tid)) snap[p.id] = engineView(p);
  return snap;
}
// minimal, replay-complete view of a player for the engine
function engineView(p) { return { id: p.id, role: p.role, first: p.first, last: p.last, ht: p.ht, wt: p.wt, wing: p.wing, r: Object.assign({}, p.r), aggr: p.aggr, ovr: p.ovr, num: p.num }; }
function gameSeed(S, tag) { return hashStr(S.masterSeed + ":" + S.season + ":g:" + tag) || 1; }
// Returns the specs for the next batch of games (one day), or null when the phase is over.
function nextGames(S) {
  const cur = S.cur, rng = rngFor(S, "day" + cur.phase + cur.day);
  if (cur.phase === "regular") {
    if (cur.day >= cur.schedule.length) return null;
    return cur.schedule[cur.day].map(([h, a]) => spec(S, h, a, 0, rng));
  }
  if (cur.phase === "playoffs") {
    const live = cur.playoffs.series.filter(s => s.round === cur.playoffs.round && !s.winner);
    if (!live.length) return null;
    return live.map(s => {
      const g = s.wins[0] + s.wins[1]; const hiHome = [0, 1, 4, 6].includes(g);
      const h = hiHome ? s.hi : s.lo, a = hiHome ? s.lo : s.hi;
      const sp = spec(S, h, a, 1, rng); sp.series = s.id; return sp;
    });
  }
  return null;
}
function spec(S, h, a, type, rng) {
  const gid = S.cur.gameSeq++;
  const hr = depthChart(S, h, rng), ar = depthChart(S, a, rng);
  for (const p of hr.concat(ar)) if (!S.cur.snapshot[p.id]) S.cur.snapshot[p.id] = engineView(p);
  return { gid, season: S.season, day: S.cur.day, type, home: h, away: a, seed: gameSeed(S, gid), h: hr.map(p => p.id), a: ar.map(p => p.id) };
}
// What a worker needs: player views from the season snapshot (ratings are frozen in-season)
function rostersFor(S, sp) { return [sp.h.map(id => S.cur.snapshot[id]), sp.a.map(id => S.cur.snapshot[id])]; }
// Run one game (used by workers and single-thread mode). Returns a compact result.
function runGame(sp, rosters) {
  const g = E.simulateGame({ id: sp.home }, { id: sp.away }, rosters, sp.seed, { frames: false });
  const box = E.boxScore(g, 1e12);
  const ids = rosters[0].concat(rosters[1]).map(p => p.id);
  const lines = box.map((b, i) => [ids[i], b.played ? 1 : 0, i % 13 < 5 ? 1 : 0, Math.round(b.secs), b.pts, b.fgm, b.fga, b.tpm, b.tpa, b.fpm, b.fpa, b.ftm, b.fta, b.oreb, b.dreb, b.ast, b.stl, b.blk, b.to, b.tkl, b.btk, b.pf]);
  const downs = g.events.filter(e => e.type === "tackle" && e.result === "down").map(e => ids[e.on]);
  return { gid: sp.gid, hs: g.score[0], as: g.score[1], per: g.periods, lines, downs };
}
function addLine(store, line, tid) {
  const id = line[0]; let s = store[id];
  if (!s) { s = store[id] = { team: tid }; for (const k of STAT_KEYS) s[k] = 0; }
  if (!line[1]) return;
  s.team = tid;
  for (let i = 0; i < STAT_KEYS.length; i++) s[STAT_KEYS[i]] += line[i + 1];
}
const INJ = [["jammed finger", 1, 3], ["bruised ribs", 2, 5], ["sprained ankle", 3, 10], ["hamstring strain", 4, 14], ["concussion", 3, 12], ["separated shoulder", 10, 30], ["broken wrist", 20, 45], ["torn ACL", 82, 82]];
function applyResults(S, specs, results) {
  const cur = S.cur, rng = rngFor(S, "apply" + cur.phase + cur.day);
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i], r = results[i];
    const store = sp.type === 0 ? cur.stats : cur.pstats;
    r.lines.forEach((ln, j) => addLine(store, ln, j < 13 ? sp.home : sp.away));
    cur.games.push([sp.gid, sp.day, sp.home, sp.away, sp.seed, r.hs, r.as, r.per, sp.type, sp.h, sp.a]);
    if (sp.type === 0) {
      const H = cur.standings[sp.home], A = cur.standings[sp.away];
      if (r.hs > r.as) { H[0]++; A[1]++; } else { A[0]++; H[1]++; }
      H[2] += r.hs; H[3] += r.as; A[2] += r.as; A[3] += r.hs;
    } else {
      const s = cur.playoffs.series.find(x => x.id === sp.series);
      const hiWon = (r.hs > r.as) === (sp.home === s.hi);
      s.wins[hiWon ? 0 : 1]++; s.games.push(sp.gid);
      if (s.wins[0] === 4 || s.wins[1] === 4) s.winner = s.wins[0] === 4 ? s.hi : s.lo;
    }
    // injuries: tackles are the main cause, plus wear and tear
    const played = new Set(r.lines.filter(l => l[1] && l[3] > 300).map(l => l[0]));
    const hurt = new Set();
    for (const id of r.downs) if (rng.chance(0.03)) hurt.add(id);
    for (const id of played) if (rng.chance(0.0025 + Math.max(0, P.age(S.players[id], S.season) - 30) * 0.0006)) hurt.add(id);
    for (const id of hurt) {
      const p = S.players[id]; if (!p.team || (p.injury && p.injury.out > 0)) continue;
      let k = Math.min(INJ.length - 1, Math.floor(Math.abs(rng.normal(0, 2.2))));
      if (r.downs.includes(id) && rng.chance(0.3)) k = 4;
      const [name, lo, hi] = INJ[k]; const out = rng.int(lo, hi);
      p.injury = { name, out }; cur.injuries.push([sp.gid, id, p.team, name, out]);
    }
    // games missed tick down for both teams
    for (const tid of [sp.home, sp.away]) for (const p of teamPlayers(S, tid)) if (p.injury && p.injury.out > 0 && !hurt.has(p.id)) { p.injury.out--; if (p.injury.out <= 0) p.injury = null; }
  }
  cur.day++;
  if (cur.phase === "regular") {
    if (!cur.deadlineDone && cur.day >= Math.floor(cur.schedule.length * 0.6)) { cur.deadlineDone = true; tradeWindow(S, "deadline"); }
    if (cur.day >= cur.schedule.length) startPlayoffs(S);
  } else if (cur.phase === "playoffs") {
    const pf = cur.playoffs;
    if (pf.series.filter(s => s.round === pf.round).every(s => s.winner)) advancePlayoffs(S);
  }
}
function standingsOrder(S) {
  const st = S.cur.standings, rng = rngFor(S, "tiebreak");
  const tb = {}; for (const t of S.active) tb[t] = rng.next();
  return S.active.slice().sort((a, b) => {
    const pa = st[a][0] / (st[a][0] + st[a][1] || 1), pb = st[b][0] / (st[b][0] + st[b][1] || 1);
    return pb - pa || (st[b][2] - st[b][3]) - (st[a][2] - st[a][3]) || tb[a] - tb[b];
  });
}
function playoffCount(n) { return n <= 10 ? 4 : 8; }
function startPlayoffs(S) {
  const order = standingsOrder(S), n = playoffCount(S.active.length);
  const seeds = order.slice(0, n);
  S.cur.phase = "playoffs";
  S.cur.playoffs = { seeds, round: 1, series: [], champion: null };
  const pairs = n === 4 ? [[0, 3], [1, 2]] : [[0, 7], [3, 4], [1, 6], [2, 5]];
  pairs.forEach(([i, j], k) => S.cur.playoffs.series.push({ id: "R1-" + k, round: 1, slot: k, hi: seeds[i], lo: seeds[j], wins: [0, 0], winner: null, games: [] }));
}
function advancePlayoffs(S) {
  const pf = S.cur.playoffs;
  const done = pf.series.filter(s => s.round === pf.round).sort((a, b) => a.slot - b.slot);
  if (done.length === 1) { pf.champion = done[0].winner; S.cur.phase = "done"; return; }
  pf.round++;
  for (let k = 0; k < done.length / 2; k++) {
    const a = done[2 * k].winner, b = done[2 * k + 1].winner;
    const [hi, lo] = pf.seeds.indexOf(a) < pf.seeds.indexOf(b) ? [a, b] : [b, a];
    pf.series.push({ id: "R" + pf.round + "-" + k, round: pf.round, slot: k, hi, lo, wins: [0, 0], winner: null, games: [] });
  }
}

// ---------- end of season: awards, careers, Hall of Fame ----------
function gameScore(s) { return s.pts + 0.8 * (s.oreb + s.dreb) + 1.2 * s.ast + 2 * s.stl + 2 * s.blk + 3 * s.tkl + s.btk - 1.2 * s.to - 0.6 * (s.fga - s.fgm) - 0.4 * (s.fta - s.ftm); }
function finishSeason(S) {
  const cur = S.cur, st = cur.standings, champ = cur.playoffs.champion;
  const winPct = t => st[t][0] / Math.max(1, st[t][0] + st[t][1]);
  const elig = Object.entries(cur.stats).filter(([, s]) => s.gp >= Math.min(50, cur.schedule.length * 0.6));
  const best = f => { let b = null, bv = -1e9; for (const [id, s] of elig) { const v = f(s, S.players[id]); if (v > bv) { bv = v; b = +id; } } return b; };
  const awards = {
    mvp: best(s => gameScore(s) / s.gp * (0.55 + winPct(s.team))),
    dpoy: best(s => (2 * s.stl + 2 * s.blk + 3 * s.tkl + 0.5 * s.dreb) / s.gp),
    roy: best((s, p) => p.rookie === S.season ? gameScore(s) / s.gp : -1e9),
    sniper: best(s => s.fpa >= 100 ? s.fpm : -1e9)
  };
  if (awards.roy !== null && S.players[awards.roy].rookie !== S.season) awards.roy = null;
  if (awards.sniper !== null && cur.stats[awards.sniper].fpa < 100) awards.sniper = null;
  // Finals MVP: best playoff game score on the champion in the final series
  const fin = cur.playoffs.series.find(s => s.round === cur.playoffs.round);
  let fmvp = null, fv = -1e9;
  for (const [id, s] of Object.entries(cur.pstats)) if (s.team === champ && s.gp) { const v = gameScore(s); if (v > fv) { fv = v; fmvp = +id; } }
  awards.fmvp = fmvp; awards.champion = champ; awards.runnerUp = fin.winner === fin.hi ? fin.lo : fin.hi;
  for (const k of ["mvp","dpoy","roy","sniper","fmvp"]) if (awards[k] !== null && awards[k] !== undefined) S.players[awards[k]].awards.push([S.season, k]);
  for (const id of Object.keys(cur.pstats)) if (cur.pstats[id].team === champ && cur.pstats[id].gp) S.players[id].awards.push([S.season, "champ"]);
  // careers
  for (const [id, s] of Object.entries(cur.stats)) {
    const p = S.players[id]; if (!s.gp) continue;
    const c = p.career || (p.career = { seasons: 0, value: 0, best: 0 }); c.seasons++;
    for (const k of STAT_KEYS) c[k] = (c[k] || 0) + s[k];
    const v = gameScore(s); c.value += v; c.best = Math.max(c.best, v / s.gp);
  }
  // team history
  const order = standingsOrder(S);
  for (const tid of S.active) {
    const pfS = cur.playoffs.series.filter(s => s.hi === tid || s.lo === tid);
    let res = pfS.length ? "R" + Math.max(...pfS.map(s => s.round)) : "-";
    if (tid === champ) res = "Champion"; else if (tid === awards.runnerUp) res = "Finals";
    S.teams[tid].hist.push({ season: S.season, w: st[tid][0], l: st[tid][1], rank: order.indexOf(tid) + 1, res });
  }
  S.teams[champ].titles++;
  S.champions.push({ season: S.season, champ, runnerUp: awards.runnerUp, fmvp: awards.fmvp, mvp: awards.mvp });
  cur.awards = awards;
  return awards;
}
function hofScore(p) {
  if (!p.career) return 0;
  let s = p.career.value / 100 + p.career.best * 1.5;
  for (const [, a] of p.awards) s += { mvp: 30, fmvp: 12, dpoy: 12, roy: 3, champ: 4, sniper: 3 }[a] || 0;
  return s;
}
const HOF_LINE = 255; // roughly the top ~2% of careers (calibrated on simmed stats)
function hallOfFame(S) {
  const cls = [];
  for (const p of Object.values(S.players)) if (p.retired && !p.hof && S.season - p.retired === 3 && hofScore(p) >= HOF_LINE) { p.hof = S.season; cls.push(p.id); }
  if (cls.length) S.hofClasses.push({ season: S.season, inductees: cls });
  return cls;
}

// ---------- trades ----------
function teamMode(S, tid) {
  let w = 0, l = 0;
  if (S.cur && S.cur.phase === "regular") [w, l] = S.cur.standings[tid];
  const h = S.teams[tid].hist; if (w + l < 20 && h.length) { w = h[h.length - 1].w; l = h[h.length - 1].l; }
  const pct = w / Math.max(1, w + l);
  const top = teamPlayers(S, tid).map(p => p.ovr).sort((a, b) => b - a).slice(0, 5);
  const avgAge = teamPlayers(S, tid).reduce((s, p) => s + P.age(p, S.season), 0) / Math.max(1, S.teams[tid].roster.length);
  if (pct >= 0.56) return "contend";
  if (pct <= 0.42 || (avgAge > 29.5 && pct < 0.5)) return "rebuild";
  return top[0] >= 72 ? "contend" : "middle";
}
function pickValue(S, k, mode) {
  const yrs = k.draft - S.season, base = k.round === 1 ? P.tradeValue({ ovr: 60, born: S.season - 20 }, S.season, "rebuild") : 35;
  const m = mode === "rebuild" ? 1.25 : mode === "contend" ? 0.6 : 0.9;
  return base * m * Math.pow(0.9, Math.max(0, yrs));
}
function tradeWindow(S, tag) {
  const rng = rngFor(S, "trade" + tag), cap = P.capFor(S.season);
  const modes = {}; for (const t of S.active) modes[t] = teamMode(S, t);
  const sellers = S.active.filter(t => modes[t] === "rebuild"), buyers = S.active.filter(t => modes[t] === "contend");
  let made = 0; const maxTrades = Math.ceil(S.active.length / 4);
  for (let attempt = 0; attempt < 40 && made < maxTrades; attempt++) {
    if (!sellers.length || !buyers.length) break;
    const s = rng.pick(sellers), b = rng.pick(buyers); if (s === b) continue;
    // seller shops a veteran the buyer would value more than they do
    const vets = teamPlayers(S, s).filter(p => P.age(p, S.season) >= 27 && p.ovr >= 62 && healthy(p) && p.contract && (tag !== "offseason" || p.contract.thru > S.season));
    if (!vets.length) continue;
    const X = rng.pick(vets);
    const sellerLoses = P.tradeValue(X, S.season, "rebuild"), buyerGains = P.tradeValue(X, S.season, "contend");
    const bRoster = teamPlayers(S, b).sort((p, q) => q.ovr - p.ovr);
    const core = new Set(bRoster.slice(0, 5).map(p => p.id));
    const chips = bRoster.filter(p => !core.has(p.id) && healthy(p) && p.contract && (tag !== "offseason" || p.contract.thru > S.season));
    const picks = S.picks.filter(k => k.owner === b && k.draft >= S.season && k.draft <= S.season + 2);
    let best = null;
    const tryPkg = (players, pks) => {
      const give = players.reduce((a, p) => a + P.tradeValue(p, S.season, "rebuild"), 0) + pks.reduce((a, k) => a + pickValue(S, k, "rebuild"), 0);
      const cost = players.reduce((a, p) => a + P.tradeValue(p, S.season, "contend"), 0) + pks.reduce((a, k) => a + pickValue(S, k, "contend"), 0);
      if (give < sellerLoses * 1.05 || cost > buyerGains * 0.95) return;
      const inSal = players.reduce((a, p) => a + p.contract.salary, 0), outSal = X.contract.salary;
      const yr = tag === "offseason" ? S.season + 1 : S.season, capY = P.capFor(yr);
      if (payroll(S, b, yr) - inSal + outSal > capY || payroll(S, s, yr) - outSal + inSal > capY) return;
      const nb = S.teams[b].roster.length - players.length + 1, ns = S.teams[s].roster.length + players.length - 1;
      if (nb > ROSTER_MAX || ns > ROSTER_MAX || nb < ROSTER_MIN - 1 || ns < ROSTER_MIN - 1) return;
      const surplus = (give - sellerLoses) + (buyerGains - cost);
      if (!best || surplus > best.surplus) best = { players, pks, surplus };
    };
    for (const a of chips) { tryPkg([a], []); for (const k of picks) tryPkg([a], [k]); }
    for (let i = 0; i < chips.length; i++) for (let j = i + 1; j < chips.length; j++) tryPkg([chips[i], chips[j]], []);
    for (const k of picks) tryPkg([], [k]);
    if (!best) continue;
    // execute
    removeFromTeam(S, X); addToTeam(S, X, b, rng); X.teams.push(b);
    for (const p of best.players) { removeFromTeam(S, p); addToTeam(S, p, s, rng); p.teams.push(s); }
    for (const k of best.pks) k.owner = s;
    log(S, "trade", { teams: [s, b], toB: [X.id], toS: best.players.map(p => p.id), picks: best.pks.map(k => [k.draft, k.round, k.orig]), when: tag });
    made++;
    if (tag === "offseason") { /* keep rosters legal after */ }
  }
}

// ---------- offseason ----------
function offseason(S) {
  const season = S.season, rng = rngFor(S, "offseason");
  const order = standingsOrder(S), playoffTeams = new Set(S.cur.playoffs.seeds);
  S.cur = null; S.offTx = [];
  const inducted = hallOfFame(S);
  // 1. draft (held after season `season`)
  runDraft(S, order, playoffTeams, rng);
  // 2. offseason trade window
  tradeWindow(S, "offseason");
  // 3. expiring contracts: re-sign or release to free agency
  for (const tid of S.active) {
    const ps = teamPlayers(S, tid).sort((a, b) => P.tradeValue(b, season + 1, "middle") - P.tradeValue(a, season + 1, "middle"));
    const keep = new Set(ps.slice(0, 11).map(p => p.id));
    for (const p of ps) {
      if (!p.contract || p.contract.thru > season) continue;
      const ask = Math.round(P.askingSalary(p, season + 1) * rng.range(1.0, 1.12) / 1000) * 1000;
      if (keep.has(p.id) && P.age(p, season + 1) < 36 && payroll(S, tid, season + 1) - p.contract.salary + ask <= P.capFor(season + 1) * 0.97) {
        p.contract = { salary: ask, thru: season + contractYears(P.age(p, season + 1), rng), signed: season + 1 };
        log(S, "resign", { pid: p.id, team: tid, salary: ask });
      } else { removeFromTeam(S, p); p.contract = null; p.fa = true; }
    }
  }
  // 4. new season begins: aging & development, injuries heal
  S.season++;
  const drng = rngFor(S, "develop");
  for (const p of Object.values(S.players)) if (!p.retired) { P.develop(p, drng, S.season); if (p.injury && p.injury.out < 82) p.injury = null; else if (p.injury) p.injury.out = Math.max(0, p.injury.out - 30); }
  // 5. retirements
  for (const p of Object.values(S.players)) {
    if (p.retired) continue;
    const a = P.age(p, S.season);
    let pr = a < 30 ? 0.004 : a < 33 ? 0.04 + Math.max(0, 62 - p.ovr) * 0.01 : a < 36 ? 0.22 + Math.max(0, 66 - p.ovr) * 0.02 : a < 39 ? 0.55 : 0.9;
    if (!p.team) pr += a > 28 ? 0.25 : 0.05;
    if (p.injury && p.injury.out >= 82) pr += 0.1;
    if (drng.chance(clamp(pr, 0, 1))) {
      p.retired = S.season - 1; p.fa = false;
      if (p.team) { log(S, "retire", { pid: p.id, team: p.team }); removeFromTeam(S, p); }
      p.contract = null;
    }
  }
  eraAdjust(S);
  // 6. expansion / merger
  for (const info of T.TEAMS.filter(t => t.joined === S.season)) addTeam(S, info);
  const newcomers = T.TEAMS.filter(t => t.joined === S.season);
  if (newcomers.length) {
    for (const info of newcomers.filter(t => t.how === "merger")) { generateRoster(S, info.id, rng, -1.5); log(S, "merger", { team: info.id }); }
    const exp = newcomers.filter(t => t.how === "expansion").map(t => t.id);
    if (exp.length) expansionDraft(S, exp, rng);
  }
  addPicks(S, S.season); addPicks(S, S.season + 1); addPicks(S, S.season + 2);
  S.picks = S.picks.filter(k => k.draft >= S.season);
  // 7. free agency
  freeAgency(S, rng);
  // 8. trim (over max, or over the cap while above the minimum), then fill to the minimum
  for (const tid of S.active) {
    while (S.teams[tid].roster.length > ROSTER_MAX || (payroll(S, tid) > P.capFor(S.season) && S.teams[tid].roster.length > ROSTER_MIN)) {
      const ps = teamPlayers(S, tid);
      const cut = S.teams[tid].roster.length > ROSTER_MAX ? ps.sort((a, b) => a.ovr - b.ovr)[0]
        : ps.sort((a, b) => P.tradeValue(a, S.season, "middle") / Math.max(1, a.contract.salary) - P.tradeValue(b, S.season, "middle") / Math.max(1, b.contract.salary))[0];
      const remaining = cut.contract.thru - S.season + 1;
      if (remaining > 0 && cut.contract.salary > P.minSalary(S.season)) S.teams[tid].dead.push({ amt: cut.contract.salary, thru: cut.contract.thru, pid: cut.id });
      log(S, "waive", { pid: cut.id, team: tid, dead: cut.contract.salary * remaining });
      removeFromTeam(S, cut); cut.contract = null; cut.fa = true;
    }
  }
  // fill in rounds, worst teams first, so no team gets first dibs on every leftover
  const fillOrder = S.active.slice().sort((x, y) => { const hx = S.teams[x].hist, hy = S.teams[y].hist; const wx = hx.length ? hx[hx.length - 1].w : 41, wy = hy.length ? hy[hy.length - 1].w : 41; return wx - wy; });
  for (let round = 0; round < 15; round++) for (const tid of fillOrder) {
    if (S.teams[tid].roster.length >= ROSTER_MIN) continue;
    const fas = Object.values(S.players).filter(p => p.fa && !p.retired).sort((a, b) => b.ovr - a.ovr);
    let p = fas[0];
    if (!p) p = newPlayer(S, rng, rng.pick(P.ROLE_LIST), -12, rng.int(22, 27));
    p.fa = false; sign(S, p, tid, P.minSalary(S.season), 1, rng, "minimum");
  }
  for (const t of Object.values(S.teams)) t.dead = t.dead.filter(d => d.thru >= S.season);
  // unsigned free agents mostly drift out of the league
  for (const p of Object.values(S.players)) if (p.fa && !p.retired && (P.age(p, S.season) > 31 || p.ovr < 48) && rng.chance(0.6)) { p.retired = S.season - 1; p.fa = false; }
  return { inducted };
}
function runDraft(S, order, playoffTeams, rng) {
  const draftYear = S.season, N = S.active.length;
  // lottery: worst non-playoff teams get weighted odds at the top 3 picks
  const non = order.filter(t => !playoffTeams.has(t)).reverse(), po = order.filter(t => playoffTeams.has(t)).reverse();
  const lotto = non.slice(), top = [];
  for (let i = 0; i < Math.min(3, lotto.length); i++) {
    const ws = lotto.map((t, k) => Math.max(1, lotto.length - k) ** 2); let x = rng.next() * ws.reduce((a, b) => a + b, 0);
    let k = 0; for (; k < ws.length; k++) { x -= ws[k]; if (x <= 0) break; }
    top.push(lotto.splice(Math.min(k, lotto.length - 1), 1)[0]);
  }
  const r1 = top.concat(lotto, po);
  // class: quality varies by year
  const classQ = rng.normal(0, 2.2), size = 2 * N + 8, pool = [];
  for (let i = 0; i < size; i++) {
    const age = rng.int(19, 22);
    const p = newPlayer(S, rng, rng.pick(P.ROLE_LIST), -9 + classQ - (22 - age) * 1.0, age);
    p.born = draftYear + 1 - age; p.ovr = P.overall(p);
    p.scout = p.ovr + (22 - age) * 2.2 + rng.normal(0, 4); // what front offices see
    pool.push(p);
  }
  pool.sort((a, b) => b.scout - a.scout);
  let pickNo = 0;
  for (const round of [1, 2]) for (const orig of r1) {
    const k = S.picks.find(x => x.draft === draftYear && x.round === round && x.orig === orig);
    const owner = k ? k.owner : orig; pickNo++;
    const p = pool.shift(); if (!p) break;
    p.draft = { season: draftYear, round, pick: pickNo, team: owner }; p.rookie = draftYear + 1;
    const sal = round === 1 ? Math.max(P.minSalary(draftYear + 1), Math.round(P.capFor(draftYear + 1) * (0.07 - 0.0018 * (pickNo - 1)) / 1000) * 1000) : P.minSalary(draftYear + 1);
    p.contract = { salary: sal, thru: draftYear + (round === 1 ? 3 : 2), signed: draftYear + 1 };
    addToTeam(S, p, owner, rng); p.teams.push(owner);
    log(S, "draft", { pid: p.id, team: owner, round, pick: pickNo });
  }
  for (const p of pool) { p.fa = true; p.rookie = draftYear + 1; } // undrafted
  S.picks = S.picks.filter(k => k.draft !== draftYear);
}
function expansionDraft(S, newTeams, rng) {
  const protect = {}, lost = {};
  for (const tid of S.active.filter(t => !newTeams.includes(t))) {
    protect[tid] = new Set(teamPlayers(S, tid).sort((a, b) => P.tradeValue(b, S.season, "middle") - P.tradeValue(a, S.season, "middle")).slice(0, 8).map(p => p.id));
    lost[tid] = 0;
  }
  for (let round = 0; round < 8; round++) for (const nt of (round % 2 ? newTeams.slice().reverse() : newTeams)) {
    let best = null, bv = -1;
    for (const tid of Object.keys(protect)) {
      if (lost[tid] >= Math.max(1, newTeams.length >= 4 ? 2 : 1)) continue;
      for (const p of teamPlayers(S, tid)) if (!protect[tid].has(p.id) && !(p.draft && p.draft.season === S.season - 1)) { const v = P.tradeValue(p, S.season, "rebuild"); if (v > bv) { bv = v; best = p; } }
    }
    if (!best) break;
    lost[best.team]++; const from = best.team;
    removeFromTeam(S, best); addToTeam(S, best, nt, rng); best.teams.push(nt);
    log(S, "expansion", { pid: best.id, team: nt, from });
  }
}
function freeAgency(S, rng) {
  const cap = P.capFor(S.season);
  const fas = Object.values(S.players).filter(p => p.fa && !p.retired).sort((a, b) => P.tradeValue(b, S.season, "middle") - P.tradeValue(a, S.season, "middle"));
  const strength = {}; for (const t of S.active) strength[t] = teamPlayers(S, t).map(p => p.ovr).sort((a, b) => b - a).slice(0, 8).reduce((a, b) => a + b, 0) / 8;
  for (const p of fas) {
    const ask = P.askingSalary(p, S.season);
    const offers = [];
    for (const tid of S.active) {
      const ros = teamPlayers(S, tid); if (ros.length >= ROSTER_MAX) continue;
      const room = cap - payroll(S, tid); if (room < P.minSalary(S.season)) continue;
      const tenth = ros.map(q => q.ovr).sort((a, b) => b - a)[9] || 0;
      if (ros.length >= ROSTER_MIN && p.ovr <= tenth) continue;
      const offer = Math.min(ask, room);
      if (offer < ask * 0.7) continue;
      offers.push({ tid, offer, score: offer * (1 + (strength[tid] - 60) * 0.01) * rng.range(0.9, 1.1) });
    }
    if (!offers.length) continue;
    offers.sort((a, b) => b.score - a.score);
    const o = offers[0]; p.fa = false;
    sign(S, p, o.tid, Math.round(o.offer / 1000) * 1000, contractYears(P.age(p, S.season), rng), rng, "free agent");
  }
}

// ---------- season export (compact, replay-complete) ----------
function exportSeason(S) {
  const cur = S.cur;
  const statArr = st => { const o = {}; for (const [id, s] of Object.entries(st)) o[id] = [s.team].concat(STAT_KEYS.map(k => s[k])); return o; };
  return {
    season: cur.season, leagueVersion: LEAGUE_VERSION, engineVersion: E.ENGINE_VERSION, masterSeed: S.masterSeed,
    teams: S.active.slice(), cap: P.capFor(cur.season), statKeys: STAT_KEYS,
    gameKeys: ["gid","day","home","away","seed","hs","as","periods","type","homeLineup","awayLineup"],
    games: cur.games, standings: cur.standings,
    playoffs: cur.playoffs, awards: cur.awards,
    stats: statArr(cur.stats), pstats: statArr(cur.pstats),
    players: cur.snapshot, injuries: cur.injuries, tx: cur.tx
  };
}

const API = { LEAGUE_VERSION, STAT_KEYS, newLeague, startSeason, nextGames, rostersFor, runGame, applyResults, finishSeason, offseason, exportSeason, payroll, standingsOrder, hofScore, makeSchedule };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
