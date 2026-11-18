// ===================== LEAGUE: seasons, playoffs, offseason, front offices =====================
// All state is plain JSON (S). Every random choice comes from a seeded RNG keyed by
// (masterSeed, season, tag), so a full history run is reproducible.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const P = NODE ? require("./players.js") : window.BB;
const T = NODE ? require("./teams.js") : window.BB;
const ST = NODE ? require("./staff.js") : window.BB;
const TR = NODE ? require("./trouble.js") : window.BB;
const CD = NODE ? require("./cards.js") : window.BB; // the league calendar (real dates for back-to-backs and travel)
const B = NODE ? require("./business.js") : window.BB;     // v0.7: markets, the gate, owners' books, relocation, TV and labor
const FO = NODE ? require("./frontoffice.js") : window.BB; // v0.7: GMs, scouting, star power, feuds
const EV = NODE ? require("./events.js") : window.BB;      // v0.7: All-Star weekend, the dunk contest, awards night
const R = NODE ? require("./records.js") : window.BB;      // v0.7: the record book and chases
const { clamp, makeRng, hashStr } = E;
const LEAGUE_VERSION = "0.7.0";
const GAMES = 82, ROSTER_MIN = 13, ROSTER_MAX = 15, ACTIVE = 13;
const ROSTER_ROLES = ["PG","WING","SNIPER","BRUISER","BIG","PG","WING","WING","SNIPER","BRUISER","BRUISER","BIG","BIG"];
const STAT_KEYS = ["gp","gs","min","pts","fgm","fga","tpm","tpa","fpm","fpa","ftm","fta","oreb","dreb","ast","stl","blk","to","tkl","btk","pf","dnk","pm"];

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
// headlines: {p:id} {t:team} {c:coach} {g:gm} {o:owner} tokens become links in the viewer
function news(S, k, text, d) { const e = { k, text, season: S.season, day: S.cur ? S.cur.day : -1 }; if (d && d.team) e.team = d.team; if (d && d.pid) e.pid = d.pid; (S.cur ? (S.cur.news = S.cur.news || []) : (S.offNews = S.offNews || [])).push(e); return e; }
function setNumber(S, p, tid, rng) {
  const used = new Set(S.teams[tid].roster.filter(id => id !== p.id).map(id => S.players[id].num));
  if (!used.has(p.num) && p.num) return;
  let n, k = 0; do { n = rng.int(0, 55); k++; } while (used.has(n) && k < 200); p.num = n;
}
function addToTeam(S, p, tid, rng) { p.team = tid; S.teams[tid].roster.push(p.id); setNumber(S, p, tid, rng); }
function removeFromTeam(S, p, how) {
  if (!p.team) return; const r = S.teams[p.team].roster; r.splice(r.indexOf(p.id), 1);
  if (how) p.left = (p.left || []).filter(x => S.season - x.season <= 1).concat([{ team: p.team, season: S.season, how }]); // traded or cut: he'll want this one (revenge games)
  p.team = null;
}
function newPlayer(S, rng, role, q, age) {
  const p = P.genPlayer(rng, role, q, S.nextPid++, S.season, age);
  p.career = null; p.awards = []; p.teams = [];
  S.players[p.id] = p; giveTraits(S, p); FO.giveEgo(S, p); return p;
}
// temperament, from the player's own random stream (so it never shifts anything else in the league)
const r2 = x => Math.round(x * 100) / 100;
function giveTraits(S, p) {
  if (p.temper !== undefined) return;
  const r = makeRng(hashStr(S.masterSeed + ":traits:" + p.id) || 1);
  p.clutch = r2(clamp(r.normal(0, 0.4), -1, 1));                 // rises late in close games, or shrinks
  p.streak = r2(clamp(r.normal(0.32, 0.2), 0, 1));               // how much a few makes (or misses) get to him
  p.tough = r2(clamp(r.normal(0.55, 0.2) + (p.role === "BRUISER" || p.role === "BIG" ? 0.08 : 0), 0, 1)); // big hits: angry (high) or rattled (low)
  p.temper = r2(clamp(p.aggr * 0.55 + (p.trouble || 0.25) * 0.5 + r.normal(0.1, 0.15), 0, 1)); // how easily he fights
}
function contractYears(age, rng) { return age < 25 ? rng.int(3, 4) : age < 30 ? rng.int(2, 4) : age < 33 ? rng.int(1, 2) : 1; }
function sign(S, p, tid, salary, years, rng, how) {
  p.contract = { salary, thru: S.season + years - 1, signed: S.season };
  if (p.team !== tid) { removeFromTeam(S, p); addToTeam(S, p, tid, rng); p.demand = null; }
  if (!p.teams.length || p.teams[p.teams.length - 1] !== tid) p.teams.push(tid);
  if (how) log(S, "sign", { pid: p.id, team: tid, salary, years, how });
}

// ---------- league creation & new teams ----------
function generateRoster(S, tid, rng, q) {
  for (const role of ROSTER_ROLES) {
    const p = newPlayer(S, rng, role, q + rng.normal(0, 2));
    addToTeam(S, p, tid, rng); p.chemTeam = tid; p.chemG = 30; // a team that has been together a while
    const yrs = contractYears(P.age(p, S.season), rng);
    p.contract = { salary: P.askingSalary(p, S.season), thru: S.season + yrs - 1, signed: S.season }; p.teams.push(tid);
  }
  // fit under the cap
  const cap = P.capFor(S.season) * 0.96, pay = payroll(S, tid);
  if (pay > cap) for (const id of S.teams[tid].roster) { const c = S.players[id].contract; c.salary = Math.max(P.minSalary(S.season), Math.round(c.salary * cap / pay / 1000) * 1000); }
}
function addTeam(S, info) {
  S.teams[info.id] = { id: info.id, roster: [], dead: [], hist: [], titles: 0, joined: S.season, coach: null, owner: null, coachHist: [], ownerHist: [], gm: null, gmHist: [] };
  S.active.push(info.id);
  B.initTeam(S, info);
}
function staffTeam(S, info, rng) {
  ST.genOwner(S, rng, info.id, info.how);
  ST.hireCoach(S, info.id, rng, "founding", (type, d) => log(S, type, d));
  FO.hireGM(S, info.id, rng, "founding", (type, d) => log(S, type, d));
}
function newLeague(masterSeed, startSeason) {
  const S = { masterSeed: String(masterSeed), season: startSeason || 1954, firstSeason: startSeason || 1954, nextPid: 1, nextCid: 1, nextOid: 1, players: {}, teams: {}, coaches: {}, owners: {}, active: [], picks: [], offTx: [], champions: [], hofClasses: [], cur: null, leagueVersion: LEAGUE_VERSION, engineVersion: E.ENGINE_VERSION };
  const rng = rngFor(S, "init");
  B.initLeague(S); FO.initLeague(S); R.init(S); S.offNews = [];
  for (const info of T.TEAMS.filter(t => t.joined <= S.season)) { addTeam(S, info); generateRoster(S, info.id, rng, -1); staffTeam(S, info, rng); }
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
  // (ratings are on the absolute scale, which rises with the generations: the era-relative overall is what's held steady)
  const top = P.rmax(S.season);
  for (const p of Object.values(S.players)) if (!p.retired) { for (const k of P.RKEYS) p.r[k] = Math.round(clamp(p.r[k], 20, top)); P.rate(p, S.season); }
  const mid = ovrStats(S);
  const shift = (tg.m - mid.m) * 0.7 / 1.4; // ovr points -> raw rating points
  for (const p of Object.values(S.players)) if (!p.retired) { for (const k of P.RKEYS) p.r[k] = Math.round(clamp(p.r[k] + shift, 20, top)); P.rate(p, S.season); }
  return { f, shift };
}

function release(S, p, tid, why) {
  const c = p.contract, rem = c ? c.thru - S.season + 1 : 0;
  if (c && rem > 0 && c.salary > P.minSalary(S.season)) S.teams[tid].dead.push({ amt: c.salary, thru: c.thru, pid: p.id });
  log(S, "waive", { pid: p.id, team: tid, dead: c ? c.salary * rem : 0, why });
  removeFromTeam(S, p, "cut"); p.contract = null; p.fa = true;
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
function healthy(p) { return (!p.injury || p.injury.out <= 0) && !(p.susp > 0); }
const available = p => healthy(p) && !(p.holdout > 0); // (a holdout is healthy, and tradeable, but not in uniform)
function depthChart(S, tid, rng, rest) {
  let avail = teamPlayers(S, tid).filter(p => available(p) && !(rest && rest.includes(p.id)));
  if (avail.length < 10) { hardship(S, tid, 10 - avail.length, rng); avail = teamPlayers(S, tid).filter(p => available(p) && !(rest && rest.includes(p.id))); }
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

// ---------- v0.6: the people and the road around the game ----------
// Referees: hired, aging, retiring; three to a game. Each has tendencies the engine feels.
function newRef(S, rng) {
  const id = S.nextRid++, born = S.season - rng.int(28, 46);
  S.refs[id] = { id, first: P.pickFirst(rng, born), last: rng.pick(P.LAST), born, hired: S.season, retired: null,
    strict: r2(clamp(rng.normal(0.5, 0.18), 0.08, 0.95)),   // how readily he calls a flagrant
    whistle: r2(clamp(rng.normal(1, 0.07), 0.82, 1.18)),    // tight crew or let-them-play
    home: r2(clamp(Math.abs(rng.normal(0, 0.45)), 0, 1)) };  // how much the building gets to him
  return S.refs[id];
}
function staffRefs(S) {
  if (!S.refs) { S.refs = {}; S.nextRid = 1; }
  const rng = rngFor(S, "refs");
  for (const r of Object.values(S.refs)) if (!r.retired && (S.season - r.born > 62 || S.season - r.hired > 30 || (S.season - r.born > 54 && rng.chance(0.18)))) r.retired = S.season;
  const need = Math.ceil(S.active.length / 2) * 3 + 3;
  while (Object.values(S.refs).filter(r => !r.retired).length < need) newRef(S, rng);
}
// the day's crews: shuffle the active officials, three to a game, the senior man as crew chief
function dealCrews(S, n, tag) {
  const rng = rngFor(S, "crews" + tag), pool = Object.values(S.refs).filter(r => !r.retired).map(r => r.id);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = [];
  for (let g = 0; g < n; g++) { const c = [0, 1, 2].map(k => pool[(g * 3 + k) % pool.length]); c.sort((a, b) => S.refs[a].hired - S.refs[b].hired || a - b); out.push(c); }
  return out;
}
function crewTend(S, crew) {
  const rs = crew.map(id => S.refs[id]), m = k => rs.reduce((a, r) => a + r[k], 0) / rs.length;
  return { s: r2(m("strict")), w: r2(m("whistle")), h: Math.round(m("home") * 0.025 * 1000) / 1000 };
}
// the map: miles between arenas (franchises can move, so it's by the city they play in)
function miles(a, b) { return B.milesBetween(a, b); }
const cityOf = (S, tid) => B.cityOf(S, tid);
// buses and trains, then planes, then charters
function travelFactor(season) { return season < 1960 ? 1.5 : season < 1980 ? 1.2 : season < 2000 ? 1 : 0.75; }
// how often a coach sits a healthy star on the second night of a back-to-back
function restRate(season) { return season < 1985 ? 0 : season < 2000 ? 0.05 : season < 2010 ? 0.12 : season < 2015 ? 0.25 : 0.38; }
// rivalries: geography, plus what happened (playoff series, fights, cheap shots); grudges between players
const pairKey = (a, b) => a < b ? a + "|" + b : b + "|" + a;
function rivalry(S, a, b) { return clamp(Math.max(0, 0.25 - miles(cityOf(S, a), cityOf(S, b)) / 1600) + ((S.riv || {})[pairKey(a, b)] || 0), 0, 1); }
function addRivalry(S, a, b, x) { S.riv = S.riv || {}; const k = pairKey(a, b); S.riv[k] = Math.round(clamp((S.riv[k] || 0) + x * (1 - (S.riv[k] || 0) / 0.4), 0, 0.4) * 1000) / 1000; } // (diminishing: a rivalry can only get so hot)
function addGrudge(S, a, b, w) { S.grudges = S.grudges || {}; const k = a + ">" + b, g = S.grudges[k]; S.grudges[k] = r2(clamp(Math.max(g || 0, w) + (g ? 0.08 : 0), 0, 1)); }
// how well a player knows his teammates: games played for this team
function chemOf(p, tid) { return p.chemTeam === tid ? clamp(0.55 + 0.45 * (p.chemG || 0) / 30, 0.55, 1) : 0.55; }
// the context the engine needs for one game (stored with the game, so replays see the same thing)
function gameCtx(S, sp, crew) {
  const cur = S.cur, ids = sp.h.concat(sp.a), ctx = { crew, ref: crewTend(S, crew) };
  ctx.fat = [sp.fat[0], sp.fat[1]]; if (sp.b2b[0] || sp.b2b[1]) ctx.b2b = sp.b2b.slice(); ctx.mi = sp.mi.slice();
  if (sp.rest[0].length || sp.rest[1].length) ctx.rest = [sp.rest[0].slice(), sp.rest[1].slice()];
  const rv = rivalry(S, sp.home, sp.away); if (rv >= 0.02) ctx.riv = r2(rv);
  const gr = [], at = {}; ids.forEach((id, i) => { at[id] = i; });
  for (const k in S.grudges || {}) { const [a, b] = k.split(">").map(Number); if (at[a] !== undefined && at[b] !== undefined && (at[a] < sp.h.length) !== (at[b] < sp.h.length)) gr.push([at[a], at[b], S.grudges[k]]); }
  if (gr.length) ctx.gr = gr;
  const rev = [], chem = {}, conc = {};
  ids.forEach((id, i) => {
    const p = S.players[id], mine = i < sp.h.length ? sp.home : sp.away, opp = i < sp.h.length ? sp.away : sp.home;
    if ((p.left || []).some(x => x.team === opp && S.season - x.season <= 1)) rev.push(i);
    const c = chemOf(p, mine); if (c < 0.97) chem[i] = r2(c);
    if (p.health && p.health.conc) conc[i] = p.health.conc;
  });
  // v0.7: feuds (chemistry, passes not thrown, a bad mood), and the crowd
  const fc = FO.feudCtx(S, sp, ids);
  for (const i in fc.chemMul) chem[i] = r2((chem[i] !== undefined ? chem[i] : 1) * fc.chemMul[i]);
  if (fc.fd.length) ctx.fd = fc.fd; if (Object.keys(fc.md).length) ctx.md = fc.md;
  if (sp.att) ctx.att = sp.att;
  if (rev.length) ctx.rev = rev; if (Object.keys(chem).length) ctx.chem = chem; if (Object.keys(conc).length) ctx.conc = conc;
  return ctx;
}
// the road: back-to-backs, travel and three-in-four nights tire a team; tired teams rest their old stars
function roadFor(S, tid, day, city, type) {
  const cur = S.cur, L = (cur.road = cur.road || {})[tid] || [], t = cur.cal ? cur.cal.time(day) : day * 2 * 864e5;
  const prev = L[L.length - 1], gap = prev ? (t - prev.t) / 864e5 : 9, mi = prev ? miles(prev.city, city) : 0;
  const b2b = type === 0 && gap <= 1, three = L.length >= 2 && (t - L[L.length - 2].t) / 864e5 <= 3;
  const fat = Math.round(((b2b ? 0.05 : gap <= 2 ? 0.015 : 0) + mi / 2000 * 0.025 * travelFactor(S.season) + (three ? 0.02 : 0)) * 1000) / 1000;
  return { b2b, mi, fat: type === 0 ? fat : Math.min(fat, 0.02), t };
}
function noteRoad(S, tid, t, city) { const cur = S.cur, L = (cur.road = cur.road || {})[tid] = ((cur.road || {})[tid] || []).concat([{ t, city }]); if (L.length > 3) L.shift(); }
function restList(S, tid, rng) {
  const rate = restRate(S.season); if (!rate) return [];
  const ps = teamPlayers(S, tid).filter(healthy).sort((a, b) => b.ovr - a.ovr).slice(0, 3), out = [];
  for (const p of ps) {
    const age = P.age(p, S.season), worn = p.health && p.health.chronic && p.health.chronic.length;
    if (age < 29 && !worn) continue;
    if (rng.chance(rate * (age >= 33 ? 1.3 : 1) * (worn ? 1.4 : 1)) && out.length < (S.season >= 2015 ? 2 : 1)) out.push(p.id);
  }
  return out;
}

// ---------- season ----------
function startSeason(S) {
  const rng = rngFor(S, "schedule");
  B.initLeague(S); FO.initLeague(S); R.init(S); // (leagues saved before v0.7)
  for (const tid of S.active) { B.initTeam(S, T.TEAMS.find(t => t.id === tid)); if (!S.teams[tid].gm) FO.hireGM(S, tid, rngFor(S, "gm-init"), "founding", (type, d) => log(S, type, d)); }
  for (const p of Object.values(S.players)) if (!p.retired) { giveTraits(S, p); FO.giveEgo(S, p); } // (leagues saved before v0.6 / v0.7)
  staffRefs(S);
  S.cur = { season: S.season, day: 0, phase: "regular", schedule: makeSchedule(S.active, rng), games: [], tx: S.offTx, injuries: [], stats: {}, pstats: {}, standings: {}, deadlineDone: false, gameSeq: 0, playoffs: null, snapshot: snapshotPlayers(S), coachSnap: {}, coachStart: {}, blotter: [], fights: [], refsUsed: {},
    news: S.offNews || [], att: {}, chase: {}, astats: {}, allstar: null, dunk: null, asDone: false };
  S.cur.cal = CD.seasonCalendar(S.season, S.cur.schedule.length);
  S.offTx = []; S.offNews = [];
  for (const tid of S.active) S.cur.standings[tid] = [0, 0, 0, 0];
  // the year of his life (hidden), star power at the gate, and holdouts in camp
  S.cur.legend = R.legend(S, rngFor(S, "legend"), S.cur.snapshot, P);
  S.cur.starPower = {}; for (const tid of S.active) S.cur.starPower[tid] = teamPlayers(S, tid).filter(p => p.ovr >= 74).length + teamPlayers(S, tid).filter(p => p.ovr >= 80).length;
  FO.holdouts(S, rngFor(S, "holdouts"), H(S));
  S.cur.asDay = Math.floor(S.cur.schedule.length * 0.55);
}
// helpers the v0.7 modules call back into
function H(S) {
  return { log: (type, d) => log(S, type, d), news: (k, text, d) => news(S, k, text, d), roster: tid => teamPlayers(S, tid), available, eraGain: P.eraGain,
    blot: (p, text, games) => { if (games > 0) p.susp = (p.susp || 0) + games; (S.cur ? S.cur.blotter : []).push({ who: "player", id: p.id, team: p.team, text, kind: games > 0 ? "susp" : "fine", games, fine: 0, day: S.cur ? S.cur.day : -1, season: S.season, phase: S.cur ? S.cur.phase : "off" }); },
    sellTeam: (tid, how) => { const o = S.owners[S.teams[tid].owner]; o.retired = S.season; o.to = S.season; const n = ST.genOwner(S, rngFor(S, "sale" + tid), tid, "purchase"); log(S, "owner-change", { team: tid, from: o.id, to: n.id, how }); return n; } };
}
function snapshotPlayers(S) {
  const snap = {};
  for (const tid of S.active) for (const p of teamPlayers(S, tid)) snap[p.id] = engineView(p);
  return snap;
}
// minimal, replay-complete view of a player for the engine
function engineView(p) { return { id: p.id, role: p.role, first: p.first, last: p.last, ht: p.ht, wt: p.wt, wing: p.wing, r: Object.assign({}, p.r), aggr: p.aggr, ovr: p.ovr, num: p.num, clutch: p.clutch, streak: p.streak, tough: p.tough, temper: p.temper, ego: p.ego, loyal: p.loyal, show: p.show }; }
function gameSeed(S, tag) { return hashStr(S.masterSeed + ":" + S.season + ":g:" + tag) || 1; }
// Returns the specs for the next batch of games (one day), or null when the phase is over.
function nextGames(S) {
  const cur = S.cur, rng = rngFor(S, "day" + cur.phase + cur.day);
  if (cur.phase === "regular") {
    if (cur.day >= cur.schedule.length) return null;
    if (cur.allstar && !cur.asDone) return [allStarSpec(S)]; // All-Star Sunday (no schedule day of its own)
    const day = cur.schedule[cur.day], crews = dealCrews(S, day.length, "r" + cur.day);
    cur.dayL = R.dayLists(S); cur.left = cur.schedule.length - cur.day;
    return day.map(([h, a], i) => spec(S, h, a, 0, rng, crews[i]));
  }
  if (cur.phase === "playoffs") {
    const live = cur.playoffs.series.filter(s => s.round === cur.playoffs.round && !s.winner);
    if (!live.length) return null;
    const crews = dealCrews(S, live.length, "p" + cur.day);
    cur.dayL = R.dayLists(S); cur.left = 99;
    return live.map((s, i) => {
      const g = s.wins[0] + s.wins[1]; const hiHome = [0, 1, 4, 6].includes(g);
      const h = hiHome ? s.hi : s.lo, a = hiHome ? s.lo : s.hi;
      const sp = spec(S, h, a, 1, rng, crews[i]); sp.series = s.id; return sp;
    });
  }
  return null;
}
function spec(S, h, a, type, rng, crew) {
  const gid = S.cur.gameSeq++, cday = S.cur.day; // (the day count runs on into the playoffs)
  // the road: who's tired, and who sits
  const city = cityOf(S, h), rh = roadFor(S, h, cday, city, type), ra = roadFor(S, a, cday, city, type);
  const rrng = rngFor(S, "rest" + gid), restH = rh.b2b ? restList(S, h, rrng) : [], restA = ra.b2b ? restList(S, a, rrng) : [];
  const hr = depthChart(S, h, rng, restH), ar = depthChart(S, a, rng, restA);
  noteRoad(S, h, rh.t, city); noteRoad(S, a, ra.t, city);
  for (const p of hr.concat(ar)) if (!S.cur.snapshot[p.id]) S.cur.snapshot[p.id] = engineView(p);
  const hc = S.teams[h].coach, ac = S.teams[a].coach;
  for (const cid of [hc, ac]) if (!S.cur.coachSnap[cid]) { const c = S.coaches[cid]; S.cur.coachSnap[cid] = { id: cid, name: c.first + " " + c.last, tac: ST.tactics(c) }; }
  const sp = { gid, season: S.season, day: S.cur.day, type, home: h, away: a, seed: gameSeed(S, gid), h: hr.map(p => p.id), a: ar.map(p => p.id), hc, ac,
    fat: [rh.fat, ra.fat], b2b: [rh.b2b ? 1 : 0, ra.b2b ? 1 : 0], mi: [rh.mi, ra.mi], rest: [restH, restA] };
  crew = crew || dealCrews(S, 1, "x" + gid)[0];
  for (const id of crew) S.cur.refsUsed[id] = 1;
  sp.att = B.attendance(S, h, a, type, rngFor(S, "gate" + gid));
  sp.ctx = gameCtx(S, sp, crew);
  if (S.cur.dayL) { const ch = R.chasesFor(S, sp.h.concat(sp.a), S.cur.dayL, S.cur.left); if (ch.length) sp.chase = ch; }
  return sp;
}
// All-Star Sunday: East vs. West, full rules, in the host's building
function allStarSpec(S) {
  const cur = S.cur, as = cur.allstar, gid = cur.gameSeq++, host = as.host, hostEast = EV.sides(S, B).east.has(host);
  const ids = side => as.sides[side].starters.concat(as.sides[side].reserves);
  const h = hostEast ? "ASE" : "ASW", a = hostEast ? "ASW" : "ASE", hs = hostEast ? "east" : "west", aw = hostEast ? "west" : "east";
  for (const id of ids(hs).concat(ids(aw))) if (!cur.snapshot[id]) cur.snapshot[id] = engineView(S.players[id]);
  const hc = as.coaches[hs], ac = as.coaches[aw];
  for (const cid of [hc, ac]) if (!cur.coachSnap[cid]) { const c = S.coaches[cid]; cur.coachSnap[cid] = { id: cid, name: c.first + " " + c.last, tac: ST.tactics(c) }; }
  const sp = { gid, season: S.season, day: cur.day, type: 2, home: h, away: a, seed: gameSeed(S, "allstar"), h: ids(hs), a: ids(aw), hc, ac, fat: [0, 0], b2b: [0, 0], mi: [0, 0], rest: [[], []], host };
  const crew = dealCrews(S, 1, "as")[0]; for (const id of crew) cur.refsUsed[id] = 1;
  const ctx = { crew, ref: Object.assign(crewTend(S, crew), { h: 0 }) }, n = sp.h.length + sp.a.length, chem = {};
  for (let i = 0; i < n; i++) chem[i] = 0.75; // they've never played together (but they know each other's games)
  ctx.chem = chem;
  const all = sp.h.concat(sp.a), at = {}; all.forEach((id, i) => at[id] = i);
  const gr = []; for (const k in S.grudges || {}) { const [x, y] = k.split(">").map(Number); if (at[x] !== undefined && at[y] !== undefined && (at[x] < sp.h.length) !== (at[y] < sp.h.length)) gr.push([at[x], at[y], S.grudges[k]]); }
  if (gr.length) ctx.gr = gr;
  const cap = S.teams[host].arena.cap; sp.att = [cap, cap]; ctx.att = [cap, cap];
  sp.ctx = ctx;
  return sp;
}
// What a worker needs: player views from the season snapshot (ratings are frozen in-season)
function rostersFor(S, sp) { return [sp.h.map(id => S.cur.snapshot[id]), sp.a.map(id => S.cur.snapshot[id])]; }
function tacticsFor(S, sp) { return [S.cur.coachSnap[sp.hc].tac, S.cur.coachSnap[sp.ac].tac]; }
// Run one game (used by workers and single-thread mode). Returns a compact result.
function runGame(sp, rosters, tactics) {
  const g = E.simulateGame({ id: sp.home }, { id: sp.away }, rosters, sp.seed, { frames: false, tactics, season: sp.season, ctx: sp.ctx });
  const box = E.boxScore(g, 1e12);
  const ids = rosters[0].concat(rosters[1]).map(p => p.id);
  const lines = box.map((b, i) => [ids[i], b.played ? 1 : 0, g.roster[i].starter ? 1 : 0, Math.round(b.secs), b.pts, b.fgm, b.fga, b.tpm, b.tpa, b.fpm, b.fpa, b.ftm, b.fta, b.oreb, b.dreb, b.ast, b.stl, b.blk, b.to, b.tkl, b.btk, b.pf, b.dnk, b.pm]);
  const downs = g.events.filter(e => e.type === "tackle" && e.result === "down").map(e => ids[e.on]);
  // hurt in the game (the engine decides who and what; the league decides how long), and ejections
  const inj = g.events.filter(e => e.type === "injury").map(e => [ids[e.pid], e.k]);
  const ej = g.events.filter(e => e.type === "ejected").map(e => [ids[e.pid], e.why || "flagrant"]);
  // what the league remembers: fights, cheap shots, who hurt whom
  const fights = g.events.filter(e => e.type === "fight").map(e => ({ a: ids[e.pid], b: ids[e.on], brawl: !!e.brawl, join: (e.join || []).map(i => ids[i]), why: e.why }));
  const flags = g.events.filter(e => e.type === "tackle" && e.result === "flagrant").map(e => [ids[e.pid], ids[e.on]]);
  const hurtBy = g.events.filter(e => e.type === "injury" && e.by !== undefined).map(e => [ids[e.by], ids[e.pid]]);
  // how each team played (identity) and how each player scored (play types)
  const rep = E.strategyReport(g), style = [0, 1].map(t => styleOf(g, rep, box, t));
  const ppt = {};
  for (const e of g.events) if (e.type === "fga" && e.pt) { const id = ids[e.pid], o = ppt[id] || (ppt[id] = {}), a = o[e.pt] || (o[e.pt] = [0, 0]); a[0]++; if (e.made) a[1] += e.val; }
  return { gid: sp.gid, hs: g.score[0], as: g.score[1], per: g.periods, lines, downs, inj, ej, style, ppt, fights, flags, hurtBy };
}
// One game's team identity numbers (summed over a season, then divided by games)
const STYLE_KEYS = ["g", "poss", "fga", "fpa", "tpa", "pnr", "iso", "post", "offscr", "sets", "ato", "hunt", "tkA", "tkDown", "tkFum", "tkBroke", "hitBig", "moves", "flag", "pAll", "cov_drop", "cov_hedge", "cov_switch", "cov_ice", "cov_trap"];
function styleOf(g, rep, box, t) {
  const R = rep[t], o = {}; for (const k of STYLE_KEYS) o[k] = 0;
  o.g = 1; o.pAll = g.score[t]; o.poss = g.poss ? g.poss[t] : 0;
  for (const b of box) if (b.t === t) { o.fga += b.fga; o.fpa += b.fpa; o.tpa += b.tpa; }
  for (const e of g.events) {
    if (e.type === "call" && e.team === t) { if (o[e.kind] !== undefined && e.kind !== "pnr") o[e.kind]++; if (e.kind === "pnr") o.pnr++; if (e.set && SETS_CUSTOM.has(e.set)) o.sets++; if (e.ato) o.ato++; if (e.hunt) o.hunt++; }
    else if (e.type === "cover" && e.team === t && o["cov_" + e.kind] !== undefined) o["cov_" + e.kind]++;
  }
  const tk = R.tk; o.tkA = tk.down + tk.fumble + tk.broken + tk.whiff + tk.late + tk.rough + tk.flagrant; o.tkDown = tk.down; o.tkFum = tk.fumble; o.tkBroke = tk.broken + tk.whiff; o.hitBig = R.tech.hit || 0; o.flag = tk.flagrant;
  for (const k in rep[1 - t].moves) o.moves += rep[1 - t].moves[k];
  return o;
}
const SETS_CUSTOM = new Set(["horns", "spain", "split", "floppy", "elevator", "dho", "hammer", "blob"]);
// Single-game highs and feat counts per player (bookkeeping only: never touches an RNG)
const HIGH_KEYS = ["pts","reb","ast","stl","blk","tkl","btk","dnk","tpm","fpm"];
const FEAT_KEYS = ["dd","td","g30","g40","g50"];
const SI = Object.fromEntries(STAT_KEYS.map((k, i) => [k, i + 1]));
function addHighs(store, line, gid) {
  if (!line[1]) return;
  const id = line[0], v = k => k === "reb" ? line[SI.oreb] + line[SI.dreb] : line[SI[k]];
  let h = store[id];
  if (!h) { h = store[id] = []; for (let i = 0; i < HIGH_KEYS.length; i++) h.push(0, -1); for (let i = 0; i < FEAT_KEYS.length; i++) h.push(0); }
  HIGH_KEYS.forEach((k, i) => { const x = v(k); if (x > h[2 * i]) { h[2 * i] = x; h[2 * i + 1] = gid; } });
  const tens = ["pts","reb","ast","stl","blk","tkl"].filter(k => v(k) >= 10).length, o = HIGH_KEYS.length * 2, pts = v("pts");
  if (tens >= 2) h[o]++; if (tens >= 3) h[o + 1]++; if (pts >= 30) h[o + 2]++; if (pts >= 40) h[o + 3]++; if (pts >= 50) h[o + 4]++;
}
// Each game's star (best Game Score) and its top dunker, for the holiday, Dunktober and Game 7 cards.
// Row: [gid, pid, gameScore x10, pts, reb, ast, stl, blk, tkl, dnk, fpm, tpm, dunkerPid, dunks, winnersStarPid, winnersStarGameScore x10]
const POG_KEYS = ["gid", "pid", "gsc10", "pts", "reb", "ast", "stl", "blk", "tkl", "dnk", "fpm", "tpm", "dpid", "ddnk", "wpid", "wgsc10"];
function gameScoreOf(ln) { const v = k => ln[SI[k]]; return v("pts") + 0.8 * (v("oreb") + v("dreb")) + 1.2 * v("ast") + 2 * v("stl") + 2 * v("blk") + 3 * v("tkl") + v("btk") - 1.2 * v("to") - 0.6 * (v("fga") - v("fgm")) - 0.4 * (v("fta") - v("ftm")); }
function gameStars(lines, gid, nHome, homeWon) {
  let best = null, bs = -1e9, dk = null, dn = 0, wb = null, ws = -1e9;
  lines.forEach((ln, j) => {
    if (!ln[1]) return;
    const gs = gameScoreOf(ln), dunks = ln[SI.dnk];
    if (gs > bs) { bs = gs; best = ln; }
    if ((j < nHome) === homeWon && gs > ws) { ws = gs; wb = ln; }
    if (dunks > dn) { dn = dunks; dk = ln; }
  });
  if (!best) return [gid, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, -1, 0];
  const v = k => best[SI[k]];
  return [gid, best[0], Math.round(bs * 10), v("pts"), v("oreb") + v("dreb"), v("ast"), v("stl"), v("blk"), v("tkl"), v("dnk"), v("fpm"), v("tpm"), dk ? dk[0] : -1, dn, wb ? wb[0] : -1, wb ? Math.round(ws * 10) : 0];
}
function addLine(store, line, tid) {
  const id = line[0]; let s = store[id];
  if (!s) { s = store[id] = { team: tid }; for (const k of STAT_KEYS) s[k] = 0; }
  if (!line[1]) return;
  s.team = tid;
  for (let i = 0; i < STAT_KEYS.length; i++) s[STAT_KEYS[i]] += line[i + 1];
}
const INJ = [["jammed finger", 1, 3], ["bruised ribs", 2, 5], ["sprained ankle", 3, 10], ["hamstring strain", 4, 14], ["concussion", 3, 12], ["separated shoulder", 10, 30], ["broken wrist", 20, 45], ["torn ACL", 82, 82]];
// injuries that never fully heal: a permanent hit to the ratings, and flare-ups
const CHRONIC = {
  knee: { name: "bad knee", r: { spd: -4, vert: -5, acc: -3 } }, shoulder: { name: "bad shoulder", r: { str: -3, tck: -3, hands: -2 } },
  wrist: { name: "bad wrist", r: { thr: -2, fr: -2, mid: -2, ft: -2 } }, hamstring: { name: "bad hamstring", r: { spd: -2, acc: -3 } },
  ankles: { name: "bad ankles", r: { acc: -2, brk: -2, spd: -1 } }, back: { name: "bad back", r: { str: -2, sta: -3, vert: -1 } }
};
function chronicCheck(S, p, name, rng) {
  const h = p.health; h.n = h.n || {}; h.n[name] = (h.n[name] || 0) + 1;
  const c = name === "torn ACL" ? (rng.chance(0.55) ? "knee" : null) : name === "separated shoulder" ? (rng.chance(0.3) ? "shoulder" : null) : name === "broken wrist" ? (rng.chance(0.2) ? "wrist" : null)
    : name === "hamstring strain" && h.n[name] >= 2 ? (rng.chance(0.25) ? "hamstring" : null) : name === "sprained ankle" && h.n[name] >= 3 ? (rng.chance(0.3) ? "ankles" : null)
    : name === "bruised ribs" && h.n[name] >= 3 ? (rng.chance(0.12) ? "back" : null) : null;
  if (!c || h.chronic.includes(c)) return;
  h.chronic.push(c);
  for (const k in CHRONIC[c].r) p.r[k] = Math.max(20, p.r[k] + CHRONIC[c].r[k]);
  p.ovr = P.overall(p);
  (S.cur.chronic = S.cur.chronic || []).push([p.id, c]);
}
function applyResults(S, specs, results) {
  const cur = S.cur, rng = rngFor(S, "apply" + cur.phase + cur.day);
  if (specs.length === 1 && specs[0].type === 2) return applyAllStar(S, specs[0], results[0], rng);
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i], r = results[i];
    // the gate
    const ga = cur.att[sp.home] || (cur.att[sp.home] = { n: 0, sum: 0, cap: 0, po: 0 });
    if (sp.att) { ga.n++; ga.sum += sp.att[0]; ga.cap += sp.att[1]; if (sp.type === 1) ga.po++; }
    if (sp.chase) { cur.chase[sp.gid] = sp.chase; R.moments(S, sp, r.lines, SI, (k, t, d) => news(S, k, t, d), (t, d) => log(S, t, d)); }
    const store = sp.type === 0 ? cur.stats : cur.pstats;
    r.lines.forEach((ln, j) => addLine(store, ln, j < sp.h.length ? sp.home : sp.away));
    const hstore = sp.type === 0 ? (cur.highs = cur.highs || {}) : (cur.phighs = cur.phighs || {});
    for (const ln of r.lines) addHighs(hstore, ln, sp.gid);
    (cur.pog = cur.pog || []).push(gameStars(r.lines, sp.gid, sp.h.length, r.hs > r.as));
    cur.games.push([sp.gid, sp.day, sp.home, sp.away, sp.seed, r.hs, r.as, r.per, sp.type, sp.h, sp.a, sp.hc, sp.ac, sp.ctx]);
    // chemistry: games played together
    r.lines.forEach((ln, j) => { if (!ln[1]) return; const p = S.players[ln[0]], tid = j < sp.h.length ? sp.home : sp.away; if (!p) return; if (p.chemTeam !== tid) { p.chemTeam = tid; p.chemG = 0; } p.chemG = Math.min(60, (p.chemG || 0) + 1); });
    if (sp.type === 0) {
      const H = cur.standings[sp.home], A = cur.standings[sp.away];
      if (r.hs > r.as) { H[0]++; A[1]++; } else { A[0]++; H[1]++; }
      H[2] += r.hs; H[3] += r.as; A[2] += r.as; A[3] += r.hs;
    } else {
      const s = cur.playoffs.series.find(x => x.id === sp.series);
      const hiWon = (r.hs > r.as) === (sp.home === s.hi);
      s.wins[hiWon ? 0 : 1]++; s.games.push(sp.gid);
      if (s.wins[0] === 4 || s.wins[1] === 4) {
        s.winner = s.wins[0] === 4 ? s.hi : s.lo;
        const last = cur.playoffs.series.filter(x => x.round === s.round).length === 1;
        addRivalry(S, s.hi, s.lo, 0.18 + (s.wins[0] + s.wins[1] === 7 ? 0.1 : 0) + (last ? 0.12 : 0)); // a playoff series makes enemies
      }
    }
    // injuries: hurt in the game (from the engine, so the replay shows it), plus wear and tear
    const played = new Set(r.lines.filter(l => l[1] && l[3] > 300).map(l => l[0]));
    const hurt = new Set();
    const hurtIn = (id, name, out) => { const p = S.players[id]; if (!p || !p.team || (p.injury && p.injury.out > 0)) return; hurt.add(id); p.injury = { name, out }; cur.injuries.push([sp.gid, id, p.team, name, out]); };
    if (r.inj) for (const [id, k] of r.inj) {
      const I = E.INJURIES[k], p = S.players[id]; if (!p) continue;
      const h = p.health || (p.health = { conc: 0, chronic: [] });
      let out = rng.int(I[2], I[3]);
      if (I[0] === "concussion") { h.conc++; out = Math.round(out * (1 + 0.35 * (h.conc - 1))); } // each one takes longer to clear
      hurtIn(id, I[0], out); chronicCheck(S, p, I[0], rng);
    }
    for (const id of played) {
      const p = S.players[id], worn = p.health && p.health.chronic ? p.health.chronic.length : 0;
      if (hurt.has(id) || !rng.chance((0.0022 + Math.max(0, P.age(p, S.season) - 30) * 0.0006) * (1 + 1.2 * worn))) continue;
      if (worn && rng.chance(0.6)) { const c = rng.pick(p.health.chronic); hurtIn(id, CHRONIC[c].name + " flare-up", rng.int(2, 8)); continue; } // the old injury again
      const k = Math.min(INJ.length - 1, Math.floor(Math.abs(rng.normal(0, 2.2)))), [name, lo, hi] = INJ[k]; hurtIn(id, name, rng.int(lo, hi));
    }
    // ejections: a flagrant 2 or targeting means a one-game suspension (fights are below)
    const sus = (id, games, text, kind) => { const p = S.players[id]; if (!p || !p.team) return; if (games > 0) p.susp = (p.susp || 0) + games; cur.blotter.push({ who: "player", id, team: p.team, text, kind: kind || (games > 0 ? "susp" : "fine"), games, fine: games > 0 ? 0 : Math.round(P.capFor(S.season) * 0.002 / 100) * 100, day: cur.day, season: S.season, phase: cur.phase }); };
    if (r.ej) for (const e of r.ej) { const [id, why] = Array.isArray(e) ? e : [e, "flagrant"]; if (why === "flagrant") sus(id, 1, "was ejected for a flagrant 2 and suspended a game"); else if (why === "targeting") sus(id, 1, "was ejected for targeting and suspended a game"); }
    // fights: before the 1977 crackdown, a fine and maybe a game; after it, an automatic suspension (and a game for everyone who left his spot in a brawl)
    const ban = S.season >= E.RULE_YEARS.fightBan;
    for (const f of r.fights || []) {
      (cur.fights = cur.fights || []).push([sp.gid, f.a, f.b, f.brawl ? 1 : 0, f.join, f.why]);
      if (ban) { sus(f.a, rng.int(3, 6) + (f.brawl ? 2 : 0), `was suspended for starting a fight${f.brawl ? " that emptied the benches" : ""}`); sus(f.b, rng.int(2, 4), "was suspended for fighting"); for (const id of f.brawl ? f.join : []) sus(id, 1, "was suspended a game for joining a brawl"); }
      else if (rng.chance(0.3)) sus(f.a, 1, "was suspended a game for fighting"); // (otherwise a fine: the fight itself is on the record)
      addGrudge(S, f.a, f.b, 0.8); addGrudge(S, f.b, f.a, 0.8); addRivalry(S, sp.home, sp.away, f.brawl ? 0.1 : 0.05);
    }
    // grudges: cheap shots and injuries are remembered
    for (const [by, on] of r.flags || []) { addGrudge(S, on, by, 0.5); addRivalry(S, sp.home, sp.away, 0.02); }
    for (const [by, on] of r.hurtBy || []) { addGrudge(S, on, by, 0.6); addRivalry(S, sp.home, sp.away, 0.02); }
    // team identity and how each player scores
    if (r.style && sp.type === 0) {
      cur.style = cur.style || {};
      [sp.home, sp.away].forEach((tid, t) => { const o = cur.style[tid] || (cur.style[tid] = {}); for (const k of STYLE_KEYS) o[k] = (o[k] || 0) + (r.style[t][k] || 0); });
    }
    if (r.ppt) {
      const pt = sp.type === 0 ? (cur.ppt = cur.ppt || {}) : (cur.pppt = cur.pppt || {});
      for (const id in r.ppt) { const o = pt[id] || (pt[id] = {}); for (const k in r.ppt[id]) { const a = o[k] || (o[k] = [0, 0]); a[0] += r.ppt[id][k][0]; a[1] += r.ppt[id][k][1]; } }
    }
    // games missed (injury or suspension) tick down for both teams
    for (const tid of [sp.home, sp.away]) for (const p of teamPlayers(S, tid)) {
      if (p.injury && p.injury.out > 0 && !hurt.has(p.id)) { p.injury.out--; if (p.injury.out <= 0) p.injury = null; }
      if (p.susp > 0 && !sp.h.includes(p.id) && !sp.a.includes(p.id)) p.susp--;
      if (p.holdout > 0 && sp.type === 0) { p.holdout--; if (p.holdout <= 0) FO.holdoutEnds(S, p, rng, H(S)); }
    }
  }
  // bad blood cools a little every day (and a lot over the summer)
  for (const k in S.riv || {}) { S.riv[k] = Math.round(S.riv[k] * 0.992 * 1000) / 1000; if (S.riv[k] < 0.02) delete S.riv[k]; }
  for (const k in S.grudges || {}) { S.grudges[k] = Math.round(S.grudges[k] * 0.985 * 1000) / 1000; if (S.grudges[k] < 0.1) delete S.grudges[k]; }
  // off the court
  const trng = rngFor(S, "trouble" + cur.phase + cur.day);
  for (const e of TR.rollTrouble(S, trng, { release: (p, tid) => release(S, p, tid, "released after his third incident of the season") })) { e.season = S.season; e.phase = cur.phase; cur.blotter.push(e); }
  cur.day++;
  if (cur.phase === "regular") {
    if (cur.day % 5 === 0) FO.feudTick(S, rngFor(S, "feud" + cur.day), H(S));
    if (cur.day === Math.floor(cur.schedule.length * 0.4) || cur.day === Math.floor(cur.schedule.length * 0.75)) R.paceWatch(S, (k, t, d) => news(S, k, t, d));
    if (!cur.allstar && cur.day >= cur.asDay) allStarWeekend(S);
    if (!cur.deadlineDone && cur.day >= Math.floor(cur.schedule.length * 0.6)) { cur.deadlineDone = true; FO.demands(S, rngFor(S, "demands-dl"), H(S), "deadline"); tradeWindow(S, "deadline"); ST.midseasonFirings(S, rngFor(S, "firings"), (type, d) => log(S, type, d)); }
    if (cur.day >= cur.schedule.length) startPlayoffs(S);
  } else if (cur.phase === "playoffs") {
    const pf = cur.playoffs;
    if (pf.series.filter(s => s.round === pf.round).every(s => s.winner)) advancePlayoffs(S);
  }
}
// ---------- All-Star weekend ----------
function allStarWeekend(S) {
  const cur = S.cur, rng = rngFor(S, "allstar"), h = H(S);
  const as = EV.selectAllStars(S, rng, B, h), sd = EV.sides(S, B), st = cur.standings;
  const best = side => S.active.filter(t => sd[side].has(t)).sort((a, b) => st[b][0] - st[a][0] || st[a][1] - st[b][1] || (a < b ? -1 : 1))[0];
  const coachOf = side => { for (const t of S.active.filter(t => sd[side].has(t)).sort((a, b) => st[b][0] - st[a][0] || (a < b ? -1 : 1))) if (S.teams[t].coach) return S.teams[t].coach; return null; };
  as.coaches = { east: S.teams[best("east")].coach || coachOf("east"), west: S.teams[best("west")].coach || coachOf("west") };
  as.teams = { east: [...sd.east], west: [...sd.west] };
  cur.allstar = as;
  for (const side of ["east", "west"]) for (const id of as.sides[side].starters.concat(as.sides[side].reserves)) S.players[id].awards.push([S.season, "as"]);
  cur.dunk = EV.dunkContest(S, rngFor(S, "dunk"), h);
  if (cur.dunk) news(S, "dunk", `{p:${cur.dunk.winner}} wins the dunk contest in ${B.cityName(B.cityOf(S, as.host))}`, { pid: cur.dunk.winner });
  // the union: players threaten to sit out the All-Star game until the owners recognize them
  if (S.biz && !S.biz.union && S.season >= S.biz.unionYear) { S.biz.union = S.season; news(S, "union", "The players threaten to boycott the All-Star game; the owners recognize the UBL Players Association an hour before tipoff", {}); }
}
function applyAllStar(S, sp, r, rng) {
  const cur = S.cur;
  r.lines.forEach(ln => addLine(cur.astats, ln, null));
  (cur.pog = cur.pog || []).push(gameStars(r.lines, sp.gid, sp.h.length, r.hs > r.as));
  cur.games.push([sp.gid, sp.day, sp.home, sp.away, sp.seed, r.hs, r.as, r.per, sp.type, sp.h, sp.a, sp.hc, sp.ac, sp.ctx]);
  cur.asDone = true;
  // MVP: the best line on the winning side
  const homeWon = r.hs > r.as; let mvp = null, mv = -1e9;
  r.lines.forEach((ln, j) => { if (!ln[1] || (j < sp.h.length) !== homeWon) return; const v = gameScoreOf(ln); if (v > mv) { mv = v; mvp = ln[0]; } });
  cur.allstar.game = { gid: sp.gid, hs: r.hs, as: r.as, home: sp.home, mvp };
  if (mvp) { S.players[mvp].awards.push([S.season, "asmvp"]); news(S, "allstar", `The ${homeWon === (sp.home === "ASE") ? "East" : "West"} win the All-Star game ${Math.max(r.hs, r.as)}-${Math.min(r.hs, r.as)}; {p:${mvp}} is the MVP`, { pid: mvp }); }
  // full rules: the injuries are real, and so are the grudges
  for (const [id, k] of r.inj || []) {
    const I = E.INJURIES[k], p = S.players[id]; if (!p || !p.team) continue;
    const hh = p.health || (p.health = { conc: 0, chronic: [] }); let out = rng.int(I[2], I[3]);
    if (I[0] === "concussion") { hh.conc++; out = Math.round(out * (1 + 0.35 * (hh.conc - 1))); }
    if (out > 0 && !(p.injury && p.injury.out > 0)) { p.injury = { name: I[0], out }; cur.injuries.push([sp.gid, id, p.team, I[0], out]); news(S, "injury", `{p:${id}} is hurt in the All-Star game (${I[0]}, out ${out} game${out === 1 ? "" : "s"})`, { pid: id }); }
    chronicCheck(S, p, I[0], rng);
  }
  for (const f of r.fights || []) { (cur.fights = cur.fights || []).push([sp.gid, f.a, f.b, f.brawl ? 1 : 0, f.join, f.why]); addGrudge(S, f.a, f.b, 0.8); addGrudge(S, f.b, f.a, 0.8); }
  for (const [by, on] of r.flags || []) addGrudge(S, on, by, 0.5);
  for (const [by, on] of r.hurtBy || []) addGrudge(S, on, by, 0.6);
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
  // awards night: a voting panel (v0.7), plus the sniper award (most fours) by the numbers
  const awards = EV.awardsNight(S, rngFor(S, "awards"), { elig, winPct, gameScore, prevGs: S.prevGs || {}, roles: P.ROLE_LIST });
  awards.sniper = best(s => s.fpa >= 100 ? s.fpm : -1e9);
  if (awards.roy !== null && S.players[awards.roy] && S.players[awards.roy].rookie !== S.season) awards.roy = null;
  if (awards.sniper !== null && cur.stats[awards.sniper].fpa < 100) awards.sniper = null;
  // Finals MVP: best playoff game score on the champion in the final series
  const fin = cur.playoffs.series.find(s => s.round === cur.playoffs.round);
  let fmvp = null, fv = -1e9;
  for (const [id, s] of Object.entries(cur.pstats)) if (s.team === champ && s.gp) { const v = gameScore(s); if (v > fv) { fv = v; fmvp = +id; } }
  awards.fmvp = fmvp; awards.champion = champ; awards.runnerUp = fin.winner === fin.hi ? fin.lo : fin.hi;
  for (const k of ["mvp","dpoy","roy","sniper","fmvp","smoy","mip"]) if (awards[k] !== null && awards[k] !== undefined) S.players[awards[k]].awards.push([S.season, k]);
  awards.allLeague.forEach((tm, i) => { for (const id of tm) if (id) S.players[id].awards.push([S.season, "all" + (i + 1)]); });
  awards.allDef.forEach((tm, i) => { for (const id of tm) if (id) S.players[id].awards.push([S.season, "def" + (i + 1)]); });
  for (const id of Object.keys(cur.pstats)) if (cur.pstats[id].team === champ && cur.pstats[id].gp) S.players[id].awards.push([S.season, "champ"]);
  awards.eoy = FO.eoyPick(S, st);
  if (cur.allstar && cur.allstar.game) awards.asmvp = cur.allstar.game.mvp;
  // the record book (before this season is folded into careers), and every team's books
  R.seasonEnd(S, cur); R.gameEnd(S, cur.highs || {}, HIGH_KEYS);
  cur.books = B.seasonBooks(S, payroll);
  S.prevGs = {}; for (const [id, s] of elig) S.prevGs[id] = Math.round(gameScore(s) / s.gp * 10) / 10;
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
    S.teams[tid].hist.push({ season: S.season, w: st[tid][0], l: st[tid][1], rank: order.indexOf(tid) + 1, res, coach: S.teams[tid].coach, owner: S.teams[tid].owner });
  }
  S.teams[champ].titles++;
  // coaches: credit the season and playoffs, titles, Coach of the Year (biggest turnaround)
  let coy = null, cv = -1e9;
  for (const tid of S.active) {
    ST.recordCoachSeason(S, tid);
    const c = S.coaches[S.teams[tid].coach]; if (!c) continue;
    for (const s of cur.playoffs.series) if (s.hi === tid || s.lo === tid) { c.pw += s.hi === tid ? s.wins[0] : s.wins[1]; c.pl += s.hi === tid ? s.wins[1] : s.wins[0]; }
    if (tid === champ) { c.titles++; c.awards.push([S.season, "title"]); }
    const h = S.teams[tid].hist, prev = h.length >= 2 ? h[h.length - 2].w : 41;
    const v = (st[tid][0] - prev) + st[tid][0] * 0.15;
    if (!cur.coachStart[tid] && v > cv) { cv = v; coy = c.id; }
  }
  if (coy) { S.coaches[coy].awards.push([S.season, "coy"]); awards.coy = coy; }
  S.champions.push({ season: S.season, champ, runnerUp: awards.runnerUp, fmvp: awards.fmvp, mvp: awards.mvp });
  cur.awards = awards;
  // the headlines: champions (and dynasties), the MVP
  const recent = S.champions.slice(-5).filter(c => c.champ === champ).length, run = (() => { let n = 0; for (let i = S.champions.length - 1; i >= 0 && S.champions[i].champ === champ; i--) n++; return n; })();
  news(S, "champion", run >= 3 ? `Dynasty: the {t:${champ}} win their ${run === 3 ? "third straight" : run + "th straight"} title` : run === 2 ? `Back-to-back: the {t:${champ}} repeat as champions` : recent >= 3 ? `The {t:${champ}} win their ${recent === 3 ? "third" : recent + "th"} title in five years` : `The {t:${champ}} are UBL champions`, { team: champ });
  if (awards.mvp) news(S, "award", `{p:${awards.mvp}} is the MVP${awards.votes.mvp[0] && awards.votes.mvp[0][2] === 100 ? ", unanimously" : ""}`, { pid: awards.mvp });
  return awards;
}
function hofScore(p) {
  if (!p.career) return 0;
  let s = p.career.value / 100 + p.career.best * 1.5;
  for (const [, a] of p.awards) s += { mvp: 30, fmvp: 12, dpoy: 12, roy: 3, champ: 4, sniper: 3, all1: 5, all2: 2.5, all3: 1, def1: 2, as: 1, smoy: 2, mip: 1 }[a] || 0;
  return s;
}
const HOF_LINE = 272; // roughly the top ~2% of careers (calibrated on simmed stats; raised in v0.7 for All-League and All-Star credit)
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
  let m;
  if (pct >= 0.56) m = "contend";
  else if (pct <= 0.42 || (avgAge > 29.5 && pct < 0.5)) m = "rebuild";
  else m = top[0] >= 72 ? "contend" : "middle";
  return FO.teamMode(S, tid, m, pct); // the GM's style leans on it
}
function pickValue(S, k, mode) {
  const yrs = k.draft - S.season, base = k.round === 1 ? P.tradeValue({ ovr: 60, born: S.season - 20 }, S.season, "rebuild") : 35;
  const m = mode === "rebuild" ? 1.25 : mode === "contend" ? 0.6 : 0.9;
  return base * m * Math.pow(0.9, Math.max(0, yrs));
}
// v0.7: every front office values players through its own eyes (scouting fog and style); stars who demand
// a trade get moved at a discount; owners losing money dump salary on teams with room.
function tradeWindow(S, tag) {
  const rng = rngFor(S, "trade" + tag);
  const modes = {}; for (const t of S.active) modes[t] = teamMode(S, t);
  const sellers = S.active.filter(t => modes[t] === "rebuild" || teamPlayers(S, t).some(p => p.demand)), buyers = S.active.filter(t => modes[t] === "contend");
  let made = 0; const maxTrades = Math.ceil(S.active.length / 4 * (0.6 + 0.4 * S.active.reduce((a, t) => a + FO.appetite(S, t), 0) / S.active.length));
  const V = (tid, p, mode) => FO.value(S, tid, p, mode);
  for (let attempt = 0; attempt < 48 && made < maxTrades; attempt++) {
    if (!sellers.length || !buyers.length) break;
    const s = rng.pick(sellers), b = rng.pick(buyers); if (s === b) continue;
    if (!rng.chance(Math.min(1, FO.appetite(S, s) * FO.appetite(S, b)))) continue;
    // seller shops a veteran (a star who wants out goes first) the buyer values more than they do
    const wants = teamPlayers(S, s).filter(p => p.demand && p.contract && healthy(p));
    const vets = wants.length ? wants : teamPlayers(S, s).filter(p => P.age(p, S.season) >= 27 && p.ovr >= 62 && healthy(p) && p.contract && (tag !== "offseason" || p.contract.thru > S.season));
    if (!vets.length) continue;
    const X = rng.pick(vets), forced = !!X.demand;
    const sellerLoses = V(s, X, "rebuild") * (forced ? 0.72 : 1), buyerGains = V(b, X, "contend");
    const bRoster = teamPlayers(S, b).sort((p, q) => q.ovr - p.ovr);
    const core = new Set(bRoster.slice(0, 5).map(p => p.id));
    const chips = bRoster.filter(p => !core.has(p.id) && healthy(p) && p.contract && (tag !== "offseason" || p.contract.thru > S.season));
    const picks = S.picks.filter(k => k.owner === b && k.draft >= S.season && k.draft <= S.season + 2);
    let best = null;
    const tryPkg = (players, pks) => {
      const give = players.reduce((a, p) => a + V(s, p, "rebuild"), 0) + pks.reduce((a, k) => a + pickValue(S, k, "rebuild"), 0);
      const cost = players.reduce((a, p) => a + V(b, p, "contend"), 0) + pks.reduce((a, k) => a + pickValue(S, k, "contend"), 0);
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
    doTrade(S, s, b, [X], best.players, best.pks, tag, rng, forced ? "demand" : null);
    made++;
  }
  // salary dumps: an owner bleeding money sends a big contract (and a sweetener) to a team with room
  if (tag === "offseason") for (const s of S.active) {
    const t = S.teams[s], o = S.owners[t.owner], fh = t.fin && t.fin.hist[t.fin.hist.length - 1];
    if (!o || !fh || fh.profit >= 0 || payroll(S, s, S.season + 1) <= B.payrollTarget(S, s) * 1.02 || !rng.chance(0.5)) continue;
    const yr = S.season + 1, capY = P.capFor(yr);
    const bad = teamPlayers(S, s).filter(p => p.contract && p.contract.thru > S.season && p.contract.salary > capY * 0.08)
      .sort((a, b) => b.contract.salary / Math.max(1, P.tradeValue(b, S.season, "middle")) - a.contract.salary / Math.max(1, P.tradeValue(a, S.season, "middle")))[0];
    if (!bad) continue;
    const taker = S.active.filter(x => x !== s && payroll(S, x, yr) + bad.contract.salary <= capY * 0.97 && S.teams[x].roster.length < ROSTER_MAX && modes[x] !== "contend")
      .sort((a, b) => payroll(S, a, yr) - payroll(S, b, yr))[0];
    if (!taker) continue;
    const pk = S.picks.filter(k => k.owner === s && k.draft > S.season).sort((a, b) => b.round - a.round || a.draft - b.draft)[0];
    doTrade(S, s, taker, [bad], [], pk ? [pk] : [], tag, rng, "dump", true);
  }
}
// X goes from s to b; players (and picks) from b to s. dumpPicks: the picks go with X instead.
function doTrade(S, s, b, Xs, players, pks, tag, rng, why, dumpPicks) {
  for (const X of Xs) { removeFromTeam(S, X, "trade"); addToTeam(S, X, b, rng); X.teams.push(b); if (X.demand) { X.demand = null; } }
  for (const p of players) { removeFromTeam(S, p, "trade"); addToTeam(S, p, s, rng); p.teams.push(s); }
  for (const k of pks) k.owner = dumpPicks ? b : s;
  const e = { teams: [s, b], toB: Xs.map(p => p.id), toS: players.map(p => p.id), picks: pks.map(k => [k.draft, k.round, k.orig]), when: tag };
  if (why) e.why = why; if (dumpPicks) e.picksTo = b;
  log(S, "trade", e);
  const g = FO.gmOf(S, b); if (g) g.trades++;
  const star = Xs.find(p => p.ovr >= 74);
  if (why === "demand") news(S, "trade", `{t:${s}} grant {p:${Xs[0].id}}'s wish and trade him to {t:${b}}`, { pid: Xs[0].id, team: b });
  else if (why === "dump") news(S, "trade", `Cost-cutting {t:${s}} dump {p:${Xs[0].id}}'s contract on {t:${b}}`, { pid: Xs[0].id, team: s });
  else if (star) news(S, "trade", `Blockbuster: {t:${b}} get {p:${star.id}} from {t:${s}}`, { pid: star.id, team: b });
}

// ---------- offseason ----------
function offseason(S) {
  const season = S.season, rng = rngFor(S, "offseason"), h = H(S), lg = (type, d) => log(S, type, d), nw = (k, t, d) => news(S, k, t, d);
  const order = standingsOrder(S), playoffTeams = new Set(S.cur.playoffs.seeds), last = S.cur;
  S.cur = null; S.offTx = []; S.offNews = S.offNews || [];
  const inducted = hallOfFame(S);
  if (inducted.length) nw("hof", `The Hall of Fame inducts ${inducted.map(id => `{p:${id}}`).join(", ")}`, {});
  // 0. league business for next season: the national TV deal, collective bargaining (the cap for next season)
  if (S.biz.tv.thru <= season) { const fills = S.active.map(t => { const f = S.teams[t].fin.hist; return f.length ? f[f.length - 1].fill : 0.7; }); B.tvDeal(S, rngFor(S, "tv"), clamp((fills.reduce((a, b) => a + b, 0) / fills.length - 0.55) / 0.4, 0, 1), nw); }
  B.laborYear(S, rngFor(S, "labor"), nw);
  S.biz.capHist[season + 1] = S.biz.capMult;
  // 1. feuds get settled upstairs; stars on losing teams ask out
  const fireCoach = FO.feudOffseason(S, rngFor(S, "feud-off"), h);
  FO.demands(S, rngFor(S, "demands-off"), h, "offseason");
  // 2. draft night (held after season `season`)
  S.lastDraft = runDraft(S, order, playoffTeams, rng);
  // 3. offseason trade window
  tradeWindow(S, "offseason");
  // 4. expiring contracts: re-sign or let him walk (under the reserve clause, he can't)
  const reserve = S.biz.fa === "reserve", champs = new Set(S.champions.slice(-2).map(c => c.champ));
  for (const tid of S.active) {
    const g = FO.gmOf(S, tid), ps = teamPlayers(S, tid).sort((a, b) => FO.value(S, tid, b, "middle") - FO.value(S, tid, a, "middle") || a.id - b.id);
    const keepN = (g && g.style === "loyalist") || champs.has(tid) ? 12 : g && g.style === "analytics" ? 10 : 11;
    const keep = new Set(ps.slice(0, keepN).map(p => p.id)), pct = last.standings[tid][0] / Math.max(1, last.standings[tid][0] + last.standings[tid][1]);
    for (const p of ps) {
      if (!p.contract || p.contract.thru > season) continue;
      let ask = Math.round(P.askingSalary(p, season + 1) * rng.range(1.0, 1.12) / 1000) * 1000;
      // a ring (or home) discount keeps winners together; a reserve-clause player takes what he's offered
      const disc = reserve ? 0.9 : (champs.has(tid) ? 0.88 + 0.08 * (1 - p.loyal) : 1) * (1 - 0.06 * p.loyal);
      ask = Math.round(ask * disc / 1000) * 1000;
      const own = S.owners[S.teams[tid].owner], spend = own ? own.spend : 0.5;
      const stays = reserve || rng.chance(clamp(0.62 + 0.35 * p.loyal - (pct < 0.45 ? 0.3 * p.ego : 0) + (champs.has(tid) ? 0.15 : 0) - (p.demand ? 0.7 : 0), 0.05, 0.98));
      if (keep.has(p.id) && stays && P.age(p, season + 1) < 36 && payroll(S, tid, season + 1) + ask <= P.capFor(season + 1) * (0.9 + 0.08 * spend)) {
        const yrs = contractYears(P.age(p, season + 1), rng);
        p.contract = { salary: ask, thru: season + yrs, signed: season + 1 };
        log(S, "resign", { pid: p.id, team: tid, salary: ask, years: yrs, disc: disc < 0.97 ? Math.round(disc * 100) : undefined });
      } else { if (keep.has(p.id) && !stays && p.ovr >= 70) log(S, "walk", { pid: p.id, team: tid }); removeFromTeam(S, p); p.contract = null; p.fa = true; p.demand = null; }
    }
  }
  // 5. new season begins: aging & development, summer work, mentors, injuries heal
  S.season++;
  const drng = rngFor(S, "develop"), srng = rngFor(S, "skills"), G = P.eraGain(S.season);
  const grp = r => r === "BIG" || r === "BRUISER" ? "F" : "B", mentorOf = {};
  for (const tid of S.active) {
    const ros = teamPlayers(S, tid), feuding = new Set(S.feuds.filter(f => !f.end).flatMap(f => [f.a, f.b]));
    const vets = ros.filter(p => P.age(p, S.season) >= 30 && p.r.iq - G >= 62 && p.drive >= 52 && !feuding.has(p.id)).sort((a, b) => b.ovr - a.ovr || a.id - b.id);
    const kids = ros.filter(p => P.age(p, S.season) <= 24).sort((a, b) => a.id - b.id);
    for (const v of vets.slice(0, 2)) { let n = 0; for (const k of kids) { if (n >= 2 || mentorOf[k.id]) continue; if (grp(v.role) !== grp(k.role) && v.r.iq - G < 78) continue; mentorOf[k.id] = v; n++; } }
  }
  for (const p of Object.values(S.players)) if (!p.retired) {
    const c = p.team && S.teams[p.team].coach ? S.coaches[S.teams[p.team].coach] : null, cdev = c ? (c.dev - 50) / 50 : 0;
    const d = P.develop(p, drng, S.season, cdev);
    if (d.cliff && p.team && p.ovr >= 64) { log(S, "cliff", { pid: p.id, team: p.team }); if (p.ovr >= 72) nw("cliff", `{p:${p.id}} reports to camp a step slower: the legs are going`, { pid: p.id }); }
    if (p.health && p.health.chronic.length) { for (const k of p.health.chronic) for (const r in CHRONIC[k].r) p.r[r] = Math.max(20, Math.round(p.r[r] + CHRONIC[k].r[r] * 0.12)); P.rate(p, S.season); } // bad joints keep wearing down
    if (p.injury && p.injury.out < 82) p.injury = null; else if (p.injury) p.injury.out = Math.max(0, p.injury.out - 30);
    if (S.season - p.born > 27) p.trouble = Math.max(0.02, Math.round(((p.trouble || 0.25) - 0.01) * 100) / 100); // most guys calm down
    if (!p.team) continue;
    // a mentor's habits rub off; a mentor's best skill gets passed down
    const m = mentorOf[p.id]; let mk = null;
    if (m) {
      p.drive = Math.min(99, p.drive + srng.int(1, 4));
      if (m.temper < 0.4 && p.temper > 0.2) p.temper = r2(p.temper - 0.03);
      if (m.tough > 0.65) p.tough = r2(Math.min(1, p.tough + 0.02));
      if (m.clutch > 0.3) p.clutch = r2(p.clutch + 0.15 * (m.clutch - p.clutch));
      const menu = ["thr", "fr", "mid", "pas", "ins", "perD", "tck", "rim", "reb", "sec"].filter(k => m.r[k] - G >= 80 && m.r[k] > p.r[k] + 8).sort((a, b) => m.r[b] - m.r[a]);
      if (menu.length) mk = { k: menu[0] };
      (p.mentors = p.mentors || []).push([S.season, m.id]);
    }
    for (const gn of P.growSkills(p, srng, S.season, cdev, mk)) {
      const taught = mk && mk.k === gn.k;
      if (gn.gain >= 6 || gn.reinvent || taught) log(S, "skill", { pid: p.id, team: p.team, k: gn.k, gain: gn.gain, reinvent: gn.reinvent || undefined, from: taught ? m.id : undefined });
    }
    const nr = P.bestRole(p, S.season);
    if (nr !== p.role && P.age(p, S.season) <= 32 && srng.chance(0.5)) { log(S, "role", { pid: p.id, team: p.team, from: p.role, to: nr }); p.role = nr; P.rate(p, S.season); }
  }
  // 6. retirements
  for (const p of Object.values(S.players)) {
    if (p.retired) continue;
    const a = P.age(p, S.season);
    let pr = a < 30 ? 0.004 : a < 33 ? 0.04 + Math.max(0, 62 - p.ovr) * 0.01 : a < 36 ? 0.22 + Math.max(0, 66 - p.ovr) * 0.02 : a < 39 ? 0.55 : 0.9;
    if (p.ageStyle === "ageless" && a >= 33) pr *= 0.6;
    if (!p.team) pr += a > 28 ? 0.25 : 0.05;
    if (p.injury && p.injury.out >= 82) pr += 0.1;
    const hh = p.health, conc = hh ? hh.conc : 0;
    if (hh && hh.chronic.length && a >= 30) pr += 0.04 * hh.chronic.length;
    // concussions: three is a warning, five is usually the end, whatever his age
    const cpr = conc >= 3 ? clamp(0.12 * (conc - 2) + (conc >= 5 ? 0.35 : 0), 0, 0.95) : 0;
    const byConc = cpr > 0 && drng.chance(cpr);
    if (byConc || drng.chance(clamp(pr, 0, 1))) {
      p.retired = S.season - 1; p.fa = false; if (byConc) p.retireWhy = "concussions";
      if (p.team) { log(S, "retire", { pid: p.id, team: p.team, why: byConc ? "concussions" : undefined }); if (p.ovr >= 76 || p.hof) nw("retire", `{p:${p.id}} retires${byConc ? " after too many concussions" : ""}`, { pid: p.id }); removeFromTeam(S, p); }
      p.contract = null;
      if (p.career && p.career.seasons >= 4) { ST.maybeCoachingCareer(S, p, drng); FO.maybeFrontOffice(S, p, drng); }
    }
  }
  eraAdjust(S);
  // old wounds heal: rivalries cool, grudges fade
  for (const k in S.riv || {}) { S.riv[k] = r2(S.riv[k] * 0.8); if (S.riv[k] < 0.03) delete S.riv[k]; }
  for (const k in S.grudges || {}) { const [a, b] = k.split(">"); S.grudges[k] = r2(S.grudges[k] * 0.55); if (S.grudges[k] < 0.12 || S.players[a].retired || S.players[b].retired) delete S.grudges[k]; }
  // 7. the business: owners sell, cities build arenas, franchises move
  B.offseasonBiz(S, rngFor(S, "biz"), T, h);
  // 8. coaches (a star who won his feud gets his coach fired) and front offices
  for (const tid of fireCoach) if (S.teams[tid].coach) { const cid = S.teams[tid].coach; ST.releaseCoach(S, tid, "fired", lg); nw("coach", `The {t:${tid}} side with their star and fire coach {c:${cid}}`, { team: tid }); }
  ST.staffOffseason(S, rng, lg);
  FO.gmOffseason(S, rngFor(S, "gm"), lg, nw);
  // 9. expansion / merger (new owners pay a fee that the old ones split)
  for (const info of T.TEAMS.filter(t => t.joined === S.season)) { addTeam(S, info); staffTeam(S, info, rng); }
  const newcomers = T.TEAMS.filter(t => t.joined === S.season);
  if (newcomers.length) {
    for (const info of newcomers.filter(t => t.how === "merger")) { generateRoster(S, info.id, rng, -1.5); log(S, "merger", { team: info.id }); }
    const exp = newcomers.filter(t => t.how === "expansion").map(t => t.id);
    if (exp.length) {
      expansionDraft(S, exp, rng);
      const fee = 0.6 * B.valueMultiple(S.season) / 1.6, old = S.active.filter(t => !exp.includes(t));
      for (const t of old) { const o = S.owners[S.teams[t].owner]; if (o) o.cash = Math.round(((o.cash || 0) + fee * exp.length / old.length) * 1000) / 1000; }
      nw("expansion", `Expansion: ${exp.map(t => `{t:${t}}`).join(" and ")} join the UBL, paying ${Math.round(fee * 100) / 100} times the salary cap apiece`, { fee });
    }
  }
  addPicks(S, S.season); addPicks(S, S.season + 1); addPicks(S, S.season + 2);
  S.picks = S.picks.filter(k => k.draft >= S.season);
  // 10. free agency
  freeAgency(S, rng);
  // 11. trim (over max, or over the cap while above the minimum), then fill to the minimum
  for (const tid of S.active) {
    while (S.teams[tid].roster.length > ROSTER_MAX || (payroll(S, tid) > P.capFor(S.season) && S.teams[tid].roster.length > ROSTER_MIN)) {
      const ps = teamPlayers(S, tid);
      const cut = S.teams[tid].roster.length > ROSTER_MAX ? ps.sort((a, b) => a.ovr - b.ovr || a.id - b.id)[0]
        : ps.sort((a, b) => P.tradeValue(a, S.season, "middle") / Math.max(1, a.contract.salary) - P.tradeValue(b, S.season, "middle") / Math.max(1, b.contract.salary))[0];
      const remaining = cut.contract.thru - S.season + 1;
      if (remaining > 0 && cut.contract.salary > P.minSalary(S.season)) S.teams[tid].dead.push({ amt: cut.contract.salary, thru: cut.contract.thru, pid: cut.id });
      log(S, "waive", { pid: cut.id, team: tid, dead: cut.contract.salary * remaining });
      removeFromTeam(S, cut, "cut"); cut.contract = null; cut.fa = true;
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
  return { inducted, draft: S.lastDraft };
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
    p.born = draftYear + 1 - age; P.rate(p, draftYear);
    pool.push(p);
  }
  // draft night: every team picks off its own board (v0.7), with trades on the night
  const h = H(S);
  const { rec, undrafted } = FO.draftNight(S, pool, r1, rng, Object.assign({}, h, { pick: (p, owner, round, pickNo) => {
    p.draft = { season: draftYear, round, pick: pickNo, team: owner }; p.rookie = draftYear + 1;
    const sal = round === 1 ? Math.max(P.minSalary(draftYear + 1), Math.round(P.capFor(draftYear + 1) * (0.07 - 0.0018 * (pickNo - 1)) / 1000) * 1000) : P.minSalary(draftYear + 1);
    p.contract = { salary: sal, thru: draftYear + (round === 1 ? 3 : 2), signed: draftYear + 1 };
    addToTeam(S, p, owner, rng); p.teams.push(owner);
    log(S, "draft", { pid: p.id, team: owner, round, pick: pickNo });
  } }));
  rec.classQ = Math.round(classQ * 10) / 10;
  for (const p of undrafted) { p.fa = true; p.rookie = draftYear + 1; } // undrafted
  S.picks = S.picks.filter(k => k.draft !== draftYear);
  if (rec.picks[0]) news(S, "draft", `{t:${rec.picks[0].team}} take {p:${rec.picks[0].pid}} first overall`, { pid: rec.picks[0].pid, team: rec.picks[0].team });
  return rec;
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
    removeFromTeam(S, best, "expansion"); addToTeam(S, best, nt, rng); best.teams.push(nt);
    log(S, "expansion", { pid: best.id, team: nt, from });
  }
}
// v0.7: a free agent weighs money, winning, the stars already there, the market and home (superteams happen);
// teams bid through their own eyes and their owner's wallet
function freeAgency(S, rng) {
  const fas = Object.values(S.players).filter(p => p.fa && !p.retired).sort((a, b) => P.tradeValue(b, S.season, "middle") - P.tradeValue(a, S.season, "middle") || a.id - b.id);
  const strength = {}, stars = {}, big = {};
  const rate = t => { const o = teamPlayers(S, t).map(p => p.ovr).sort((a, b) => b - a); strength[t] = o.slice(0, 8).reduce((a, b) => a + b, 0) / 8; stars[t] = o.filter(x => x >= 74).length; big[t] = o.filter(x => x >= 77).length; };
  for (const t of S.active) rate(t);
  for (const p of fas) {
    const ask = P.askingSalary(p, S.season);
    const offers = [];
    for (const tid of S.active) {
      const ros = teamPlayers(S, tid); if (ros.length >= ROSTER_MAX) continue;
      const room = B.payrollTarget(S, tid) - payroll(S, tid); if (room < P.minSalary(S.season)) continue;
      const tenth = ros.map(q => q.ovr).sort((a, b) => b - a)[9] || 0, seen = FO.seenOvr(S, tid, p), g = FO.gmOf(S, tid);
      if (ros.length >= ROSTER_MIN && seen <= tenth) continue;
      const bid = ask * (g && g.style === "win-now" ? 1.08 : g && g.style === "analytics" && P.age(p, S.season) >= 31 ? 0.85 : 1) * (1 + (seen - p.ovr) * 0.02);
      const offer = Math.min(bid, room);
      if (offer < ask * 0.7) continue;
      offers.push({ tid, offer });
    }
    if (!offers.length) continue;
    for (const o of offers) o.u = FO.faUtility(S, p, o, ask, strength, stars, B) + rng.normal(0, 0.04);
    offers.sort((a, b) => b.u - a.u);
    const o = offers[0], from = p.teams && p.teams[p.teams.length - 1]; p.fa = false;
    sign(S, p, o.tid, Math.round(o.offer / 1000) * 1000, contractYears(P.age(p, S.season), rng), rng, "free agent");
    if (p.ovr >= 74) {
      if (big[o.tid] >= 2 && p.ovr >= 78) news(S, "superteam", `Superteam: {p:${p.id}} joins {t:${o.tid}}${o.offer < ask * 0.95 ? " for less money" : ""}, their ${big[o.tid] + 1 === 3 ? "third" : (big[o.tid] + 1) + "th"} star`, { pid: p.id, team: o.tid });
      else if (from && from !== o.tid) news(S, "signing", `{p:${p.id}} leaves {t:${from}} for {t:${o.tid}}`, { pid: p.id, team: o.tid });
    }
    rate(o.tid);
  }
}
// ---------- season export (compact, replay-complete) ----------
function exportSeason(S) {
  const cur = S.cur;
  const statArr = st => { const o = {}; for (const [id, s] of Object.entries(st)) o[id] = [s.team].concat(STAT_KEYS.map(k => s[k])); return o; };
  return {
    season: cur.season, leagueVersion: LEAGUE_VERSION, engineVersion: E.ENGINE_VERSION, masterSeed: S.masterSeed,
    teams: S.active.slice(), cap: P.capFor(cur.season), statKeys: STAT_KEYS,
    gameKeys: ["gid","day","home","away","seed","hs","as","periods","type","homeLineup","awayLineup","homeCoach","awayCoach"],
    games: cur.games, standings: cur.standings,
    playoffs: cur.playoffs, awards: cur.awards,
    stats: statArr(cur.stats), pstats: statArr(cur.pstats),
    highKeys: HIGH_KEYS, featKeys: FEAT_KEYS, highs: cur.highs || {}, phighs: cur.phighs || {}, pogKeys: POG_KEYS, pog: cur.pog || [],
    players: cur.snapshot, injuries: cur.injuries, tx: cur.tx, blotter: cur.blotter,
    styleKeys: STYLE_KEYS, style: cur.style || {}, ppt: cur.ppt || {}, pppt: cur.pppt || {},
    gameKeys2: ["ctx"], ctxKeys: { crew: "referee ids (crew chief first)", ref: "crew tendencies s/w/h", fat: "fatigue home/away", b2b: "back-to-back", mi: "miles traveled", rest: "rested players", riv: "rivalry", gr: "grudges [i,j,w]", rev: "revenge players", chem: "chemistry by roster slot", conc: "concussion history by roster slot" },
    rules: E.rulesFor(cur.season), refs: Object.fromEntries(Object.keys(cur.refsUsed || {}).map(id => { const r = S.refs[id]; return [id, { name: r.first + " " + r.last, born: r.born, hired: r.hired, strict: r.strict, whistle: r.whistle, home: r.home }]; })),
    fights: cur.fights || [], chronic: cur.chronic || [],
    health: Object.fromEntries(Object.values(S.players).filter(p => p.health && (p.health.conc || p.health.chronic.length) && (p.team || p.retired === cur.season)).map(p => [p.id, { conc: p.health.conc, chronic: p.health.chronic.map(k => CHRONIC[k].name) }])),
    rivals: Object.entries(S.riv || {}).filter(([k, v]) => v >= 0.1).map(([k, v]) => k.split("|").concat([v])),
    coaches: cur.coachSnap, owners: Object.fromEntries(S.active.map(t => { const o = S.owners[S.teams[t].owner]; return [t, { id: o.id, name: o.first + " " + o.last }]; })),
    // v0.7
    era: { gain: Math.round(P.eraGain(cur.season) * 100) / 100, ht: Math.round(P.eraHt(cur.season) * 100) / 100 },
    teamInfo: Object.fromEntries(S.active.map(t => { const T0 = S.teams[t], g = FO.gmOf(S, t), key = B.cityOf(S, t); return [t, { key, city: B.cityName(key), abbr: B.abbrOf(S, t), arena: T0.arena.name, cap: T0.arena.cap, gm: g ? { id: g.id, name: g.first + " " + g.last, style: g.style } : null }]; })),
    books: cur.books || {}, biz: S.biz ? { tv: S.biz.tv, capMult: S.biz.capMult, union: S.biz.union, fa: S.biz.fa, revShare: S.biz.revShare, share: S.biz.share, max: S.biz.max } : null,
    allstar: cur.allstar, astats: statArr(cur.astats || {}), dunk: cur.dunk, legend: cur.legend, chase: cur.chase || {}, miles: cur.miles || [], news: cur.news || [],
    feuds: (S.feuds || []).filter(f => f.season === cur.season || !f.end || f.end.season === cur.season).map(f => ({ id: f.id, kind: f.kind, a: f.a, b: f.b || null, c: f.c || null, team: f.team, season: f.season, day: f.day, heat: f.heat, end: f.end })),
    attKeys: "ctx.att = [attendance, capacity]"
  };
}

const API = { LEAGUE_VERSION, STAT_KEYS, newLeague, startSeason, nextGames, rostersFor, tacticsFor, runGame, applyResults, finishSeason, offseason, exportSeason, payroll, standingsOrder, hofScore, makeSchedule };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
