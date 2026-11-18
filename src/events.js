// ===================== EVENTS: All-Star weekend, the dunk contest, awards night =====================
// League v0.7.
//   * All-Star weekend (just before the trade deadline): fans vote in the starters, coaches pick the reserves,
//     East plays West in a host city under full Bounceball rules (real hits, real injuries). The game is a real
//     engine game, stored with the season and replayable like any other.
//   * The dunk contest: four dunkers, two rounds, five judges scoring 6-10. Rubber-floor specialties included.
//   * Awards night: a panel of 100 voters with their own leanings votes MVP, DPOY, Rookie, Sixth Man, Most Improved
//     and Coach of the Year, plus All-UBL (one per position) and All-Defense teams. Tallies are kept.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const { clamp, makeRng, hashStr } = E;
const r1 = x => Math.round(x * 10) / 10;

// ---------- All-Star weekend ----------
// East vs. West by where the teams play this season (a longitude split of the league)
function sides(S, B) {
  const lon = tid => (B.geo(B.cityOf(S, tid)) || [0, -85])[1], ids = S.active.slice().sort((a, b) => lon(b) - lon(a) || (a < b ? -1 : 1));
  const half = ids.length / 2; return { east: new Set(ids.slice(0, Math.ceil(half))), west: new Set(ids.slice(Math.ceil(half))) };
}
function popularity(S, p, s, B, winPct) {
  const g = Math.max(1, s.gp), m = B.market(B.cityOf(S, p.team), S.season);
  return s.pts / g * 1.0 + s.dnk / g * 3 + (s.oreb + s.dreb) / g * 0.3 + s.tkl / g * 1.2 + (p.ovr - 60) * 0.35 + (p.show || 0.4) * 6 + m * 5 + winPct(p.team) * 10;
}
function merit(s, winPct, team) { const g = Math.max(1, s.gp); return (s.pts + 0.8 * (s.oreb + s.dreb) + 1.2 * s.ast + 2 * s.stl + 2 * s.blk + 3 * s.tkl + s.btk - 1.2 * s.to - 0.6 * (s.fga - s.fgm) - 0.4 * (s.fta - s.ftm)) / g + winPct(team) * 6; }
const BACK = new Set(["PG", "SNIPER", "WING"]), FRONT = new Set(["BIG", "BRUISER", "WING"]);
function selectAllStars(S, rng, B, H) {
  const cur = S.cur, sd = sides(S, B), st = cur.standings, winPct = t => st[t][0] / Math.max(1, st[t][0] + st[t][1]);
  const pool = Object.entries(cur.stats).map(([id, s]) => ({ p: S.players[id], s })).filter(x => x.p && x.p.team && x.s.gp >= 10);
  const out = { sides: {}, votes: {}, host: null };
  // the host: a city that hasn't had it in a while (new arenas first)
  const hosted = S.asHosts || (S.asHosts = {});
  const hosts = S.active.slice().sort((a, b) => ((hosted[a] || 0) - (hosted[b] || 0)) || (S.teams[b].arena.built - S.teams[a].arena.built) || (a < b ? -1 : 1));
  out.host = hosts[Math.floor(rng.next() * Math.min(4, hosts.length))]; hosted[out.host] = S.season;
  for (const side of ["east", "west"]) {
    const mine = pool.filter(x => sd[side].has(x.p.team));
    const can = x => H.available(x.p);
    // fans: ballots (the numbers grow with the league)
    const scale = S.season < 1970 ? 900 : S.season < 1990 ? 6000 : S.season < 2005 ? 22000 : 60000;
    const fan = mine.map(x => ({ x, v: Math.round(Math.max(0, popularity(S, x.p, x.s, B, winPct) + rng.normal(0, 3)) ** 2 * scale / 100) })).sort((a, b) => b.v - a.v);
    const starters = [];
    const take = (list, ok) => { const c = list.find(y => can(y.x) && !starters.includes(y.x.p.id) && ok(y.x.p)); if (c) starters.push(c.x.p.id); };
    take(fan, p => BACK.has(p.role)); take(fan, p => FRONT.has(p.role) && p.role !== "WING");
    while (starters.length < 5) { const c = fan.find(y => can(y.x) && !starters.includes(y.x.p.id)); if (!c) break; starters.push(c.x.p.id); }
    // coaches: the reserves
    const coach = mine.map(x => ({ x, v: merit(x.s, winPct, x.p.team) + rng.normal(0, 1.2) })).sort((a, b) => b.v - a.v);
    const res = [];
    for (const c of coach) { if (res.length >= 7) break; if (!starters.includes(c.x.p.id) && can(c.x)) res.push(c.x.p.id); }
    out.sides[side] = { starters, reserves: res };
    out.votes[side] = fan.slice(0, 10).map(y => [y.x.p.id, y.v]);
  }
  return out;
}

// ---------- the dunk contest ----------
const DUNKS = [ // [name, difficulty, 3D style]
  ["two-handed tomahawk", 1, 0], ["double clutch", 2, 0], ["reverse jam", 2, 4], ["windmill", 2, 1], ["elbow hang", 2, 0],
  ["360", 3, 3], ["off the backboard", 3, 1], ["over the tackling dummy", 3, 2], ["over a teammate", 3, 2], ["from the free-throw line", 3, 0],
  ["between the legs", 4, 2], ["360 windmill", 4, 3], ["behind the back", 4, 1], ["off the rubber floor", 4, 4],
  ["from the four-point line", 5, 0], ["between the legs off the floor bounce", 5, 2]];
function dunkContest(S, rng, H) {
  const cur = S.cur, host = cur.allstar ? cur.allstar.host : null;
  const pool = Object.entries(cur.stats).map(([id, s]) => ({ p: S.players[id], s })).filter(x => x.p && x.p.team && x.s.gp >= 10 && H.available(x.p));
  const G = H.eraGain(S.season), lift = p => (p.r.vert - G) + (p.r.bnc - G) * 0.4;
  const want = x => x.s.dnk / x.s.gp * 6 + (lift(x.p) - 80) / 4 + (x.p.show || 0.4) * 6 - (x.p.ovr >= 80 ? 3 : 0) + rng.normal(0, 1.5);
  const field = pool.sort((a, b) => want(b) - want(a)).slice(0, 4).map(x => x.p);
  if (field.length < 4) return null;
  const judges = 5;
  const dunk = (p, final) => {
    const L = lift(p), ambition = (p.show || 0.4) + (final ? 0.3 : 0) + (L - 85) / 40;
    const d = clamp(Math.round(1 + ambition * 2.4 + rng.normal(0, 0.8)), 1, 5), opts = DUNKS.filter(x => x[1] === d);
    const [move, , style] = rng.pick(opts);
    const make = clamp(0.95 - 0.13 * d + (L - 80) / 90 + ((p.r.hands - G) - 60) / 300, 0.2, 0.97);
    let tries = 0, made = false; while (tries < 3 && !made) { tries++; made = rng.chance(make); }
    const scores = [];
    for (let j = 0; j < judges; j++) scores.push(made ? clamp(Math.round(6.2 + 0.62 * d + (p.show || 0.4) * 0.9 + (p.team === host ? 0.3 : 0) - (tries - 1) * 0.9 + rng.normal(0, 0.65)), 6, 10) : rng.int(5, 6));
    return { move, d, style, tries, made, scores, total: scores.reduce((a, b) => a + b, 0) };
  };
  const round = (ps, n, final) => ps.map(p => { const ds = []; for (let i = 0; i < n; i++) ds.push(dunk(p, final)); return { pid: p.id, dunks: ds, total: ds.reduce((a, x) => a + x.total, 0) }; });
  const r1 = round(field, 2, false), top = r1.slice().sort((a, b) => b.total - a.total || a.pid - b.pid).slice(0, 2).map(x => S.players[x.pid]);
  const r2 = round(top, 2, true);
  let winner = r2[0].total === r2[1].total ? null : (r2[0].total > r2[1].total ? r2[0].pid : r2[1].pid);
  const rounds = [r1, r2];
  if (!winner) { const off = round(top, 1, true); rounds.push(off); winner = off[0].total >= off[1].total ? off[0].pid : off[1].pid; }
  return { host, field: field.map(p => p.id), rounds, winner };
}

// ---------- awards night: ballots ----------
// cands: [[id, score]]. Each voter sees the score with his own noise and ranks his top `pts.length`.
function ballot(rng, cands, sd, pts, voters) {
  voters = voters || 100;
  const tally = new Map(), firsts = new Map();
  if (!cands.length) return [];
  const top = cands.slice().sort((a, b) => b[1] - a[1]).slice(0, 14);
  for (let v = 0; v < voters; v++) {
    const lean = rng.normal(0, sd * 0.5); // some voters like a story more than numbers
    const seen = top.map(([id, s], i) => [id, s + rng.normal(0, sd) + lean * (i % 2 ? 1 : -1) * 0.3]).sort((a, b) => b[1] - a[1]);
    seen.slice(0, pts.length).forEach(([id], i) => { tally.set(id, (tally.get(id) || 0) + pts[i]); if (i === 0) firsts.set(id, (firsts.get(id) || 0) + 1); });
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 10).map(([id, v]) => [id, v, firsts.get(id) || 0]);
}
const PTS5 = [10, 7, 5, 3, 1];
function awardsNight(S, rng, ctx) {
  const { elig, winPct, gameScore, prevGs, roles } = ctx, out = { votes: {} };
  const G = s => gameScore(s) / Math.max(1, s.gp);
  const vote = (key, cands, sd) => { const b = ballot(rng, cands, sd, PTS5); out.votes[key] = b; out[key] = b.length ? b[0][0] : null; };
  vote("mvp", elig.map(([id, s]) => [+id, G(s) * (0.55 + winPct(s.team))]), 0.9);
  vote("dpoy", elig.map(([id, s]) => [+id, (2 * s.stl + 2 * s.blk + 3 * s.tkl + 0.5 * s.dreb) / s.gp * (0.85 + 0.3 * winPct(s.team))]), 0.35);
  vote("roy", elig.filter(([id]) => S.players[id].rookie === S.season).map(([id, s]) => [+id, G(s)]), 0.7);
  vote("smoy", elig.filter(([, s]) => s.gs < s.gp * 0.35).map(([id, s]) => [+id, G(s) + winPct(s.team) * 2]), 0.6);
  vote("mip", elig.filter(([id]) => prevGs[id] !== undefined && S.players[id].rookie !== S.season).map(([id, s]) => [+id, G(s) - prevGs[id]]), 0.8);
  // All-UBL: one per position, three teams deep (5-3-1 points)
  out.allLeague = [[], [], []];
  for (const role of roles) {
    const b = ballot(rng, elig.filter(([id]) => S.players[id].role === role).map(([id, s]) => [+id, G(s) + winPct(s.team) * 3]), 0.8, [5, 3, 1]);
    for (let k = 0; k < 3; k++) out.allLeague[k].push(b[k] ? b[k][0] : null);
  }
  // All-Defense: the ten best defenders, two teams
  const db = ballot(rng, elig.map(([id, s]) => [+id, (2 * s.stl + 2 * s.blk + 3 * s.tkl + 0.5 * s.dreb) / s.gp]), 0.3, [5, 4, 3, 2, 1, 1, 1, 1, 1, 1]);
  out.allDef = [db.slice(0, 5).map(x => x[0]), db.slice(5, 10).map(x => x[0])];
  return out;
}

const API = { sides, selectAllStars, dunkContest, DUNKS, ballot, awardsNight };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
