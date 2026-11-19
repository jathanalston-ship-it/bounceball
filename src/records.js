// ===================== RECORDS: the record book, chases, milestones, legendary seasons =====================
// League v0.7. The league keeps its own record book as it goes (career, season and single-game leaders), so it
// knows before every game who is chasing what: a round-number milestone, the man just above him on the
// all-time list, the all-time record itself, or (late in a season) the single-season record. The chases are
// stored with each game for the broadcast, and the moments are logged when they happen.
// Legendary seasons: now and then a player has the year of his life (a hidden boost for one season only).
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const { clamp } = E;

const RSTATS = ["pts", "reb", "ast", "stl", "blk", "tkl", "btk", "dnk", "fpm", "tpm"];
const RNAME = { pts: "points", reb: "rebounds", ast: "assists", stl: "steals", blk: "blocks", tkl: "tackles", btk: "broken tackles", dnk: "dunks", fpm: "fours", tpm: "threes" };
const STEP = { pts: [10000, 5000], reb: [5000, 2500], ast: [4000, 2000], stl: [1000, 500], blk: [1000, 500], tkl: [1500, 500], btk: [1000, 500], dnk: [1000, 500], fpm: [500, 250], tpm: [1000, 500] };
const REACH = { pts: 36, reb: 16, ast: 13, stl: 4, blk: 4, tkl: 6, btk: 5, dnk: 7, fpm: 5, tpm: 5 }; // a big night
const N = 25, MAJOR = new Set(["pts", "reb", "ast", "tkl", "fpm", "dnk"]);
const val = (s, k) => !s ? 0 : k === "reb" ? (s.oreb || 0) + (s.dreb || 0) : (s[k] || 0);

function init(S) { if (!S.records) S.records = { career: {}, season: {}, game: {} }; S.records.done = S.records.done || {}; for (const k of RSTATS) for (const b of ["career", "season", "game"]) S.records[b][k] = S.records[b][k] || []; }
function careerNow(S, p, k) { return val(p.career, k) + (S.cur && S.cur.stats[p.id] ? val(S.cur.stats[p.id], k) : 0); }
// the all-time list as it stands right now: the stored book plus every active player's running total
function liveList(S, k) {
  const m = new Map(S.records.career[k].map(([id, v]) => [id, v]));
  for (const tid of S.active) for (const id of S.teams[tid].roster) { const p = S.players[id], v = careerNow(S, p, k); if (v > (m.get(p.id) || 0)) m.set(p.id, v); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, N);
}
// before a day's games: what each player in them is chasing (computed once a day, cheap)
function dayLists(S) { const L = {}; for (const k of RSTATS) L[k] = liveList(S, k); return L; }
const key = c => c[0] + ":" + c[1] + ":" + c[3] + ":" + c[4];
function chasesFor(S, ids, L, gamesLeft) {
  const out = [], done = S.records.done, history = S.season - (S.firstSeason || 1954) >= 10; // the all-time list means something once the league has some
  const add = c => { if (!done[key(c)]) out.push(c); };
  for (const id of ids) {
    const p = S.players[id]; if (!p) continue;
    for (const k of RSTATS) {
      const c = careerNow(S, p, k), reach = REACH[k], [first, step] = STEP[k]; if (c <= 0) continue;
      const list = L[k], rank = list.findIndex(x => x[0] === id);
      // the legend just above him in the top five (or the record), once he has a career worth the name
      const above = rank > 0 ? list[rank - 1] : rank < 0 && list.length >= 5 ? list[4] : null, r = rank < 0 ? 5 : rank;
      if (history && above && above[0] !== id && r <= 5 && c >= first * 0.5 && above[1] - c + 1 <= reach && above[1] - c + 1 > 0 && S.players[above[0]].retired) { // (passing a legend; active stars leapfrogging each other isn't news)
        add([id, k, above[1] - c + 1, r === 1 ? "record" : "pass", above[0], r]);
        continue;
      }
      const next = c < first ? first : first + Math.ceil((c - first + 1) / step) * step;
      if (next - c <= reach && next - c > 0) add([id, k, next - c, "mile", next]);
    }
    // the single-season record, late in the year
    if (gamesLeft <= 12 && S.cur && S.cur.stats[id]) for (const k of ["pts", "tkl", "fpm", "dnk", "ast", "reb"]) {
      const rec = S.records.season[k][0]; if (!rec) continue;
      const s = val(S.cur.stats[id], k), need = rec[2] - s + 1;
      if (history && rec[2] > 0 && need > 0 && need <= REACH[k] * 1.1 && rec[0] !== id) add([id, k, need, "season", rec[0], rec[1]]);
    }
  }
  return out;
}
// after a game: who got there
function moments(S, sp, lines, statIdx, news, log) {
  if (!sp.chase || !sp.chase.length) return [];
  const got = [], ln = {}; for (const l of lines) ln[l[0]] = l;
  for (const c of sp.chase) {
    const [id, k, need, kind] = c, l = ln[id]; if (!l || !l[1]) continue;
    const v = k === "reb" ? l[statIdx.oreb] + l[statIdx.dreb] : l[statIdx[k]];
    if (v < need || S.records.done[key(c)]) continue;
    S.records.done[key(c)] = S.season; got.push(c);
    const pn = `{p:${id}}`, name = RNAME[k];
    const txt = kind === "mile" ? `${pn} reaches ${c[4].toLocaleString()} career ${name}`
      : kind === "record" ? `${pn} passes {p:${c[4]}} for the all-time ${name} record`
      : kind === "pass" ? `${pn} passes {p:${c[4]}} for No. ${c[5]} all-time in ${name}`
      : `${pn} breaks {p:${c[4]}}'s single-season ${name} record (${c[5]})`;
    (S.cur.miles = S.cur.miles || []).push([sp.gid].concat(c));
    if (kind === "record" || kind === "season" || (kind === "pass" && c[5] <= 3) || (kind === "mile" && MAJOR.has(k))) news(kind === "mile" ? "milestone" : "record", txt, { pid: id, k, kind, gid: sp.gid });
  }
  return got;
}
// end of season: fold the year into the book
function seasonEnd(S, cur) {
  init(S);
  for (const k of RSTATS) {
    S.records.career[k] = liveList(S, k).map(([id, v]) => [id, v]);
    const sl = S.records.season[k].concat(Object.entries(cur.stats).filter(([, s]) => s.gp && val(s, k) > 0).map(([id, s]) => [+id, S.season, val(s, k)]));
    S.records.season[k] = sl.sort((a, b) => b[2] - a[2] || a[1] - b[1]).slice(0, N);
  }
  return S.records;
}
// single games: from the season's highs (kept per player with the game id)
function gameEnd(S, highs, highKeys) {
  init(S);
  highKeys.forEach((k, i) => {
    if (!S.records.game[k]) return;
    const gl = S.records.game[k].concat(Object.entries(highs).filter(([, h]) => h[2 * i] > 0).map(([id, h]) => [+id, S.season, h[2 * i + 1], h[2 * i]]));
    S.records.game[k] = gl.sort((a, b) => b[3] - a[3] || a[1] - b[1]).slice(0, N);
  });
}
// a legendary season: once in a while, one player has the year of his life (hidden; ratings for this season only)
function legend(S, rng, snapshot, P) {
  if (!rng.chance(S.season < 1960 ? 0.15 : 0.28)) return null;
  const G = P.eraGain(S.season);
  const pool = Object.values(snapshot).map(v => S.players[v.id]).filter(p => p && p.team && p.ovr >= 70 && S.season - p.born >= 23 && S.season - p.born <= 31).sort((a, b) => b.ovr - a.ovr).slice(0, 25);
  if (!pool.length) return null;
  const w = pool.map(p => 1 + (p.drive - 50) / 40 + (p.ego || 0.4));
  let x = rng.next() * w.reduce((a, b) => a + b, 0), p = pool[0];
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { p = pool[i]; break; } }
  const keys = P.ROLES[p.role].sig.slice(0, 4).concat(["iq", "sta"]), v = snapshot[p.id];
  const boost = rng.int(7, 10);
  for (const k of keys) v.r[k] = Math.min(P.rmax(S.season) + 3, v.r[k] + boost);
  return { pid: p.id, keys, boost, top: G };
}
// mid-season: someone on a record pace makes the papers
function paceWatch(S, news) {
  const cur = S.cur; if (!S.records || S.season - (S.firstSeason || 1954) < 8) return;
  for (const k of ["pts", "tkl", "fpm", "dnk", "ast"]) {
    const rec = S.records.season[k][0]; if (!rec) continue;
    let best = null, bp = rec[2] * 1.02; // the one man most clearly on pace
    for (const [id, s] of Object.entries(cur.stats)) { if (!s.gp || s.gp < 25) continue; const pace = val(s, k) / s.gp * 82; if (pace > bp) { bp = pace; best = id; } }
    if (best && !(cur.paced = cur.paced || {})[best + k]) { cur.paced[best + k] = 1; news("pace", `{p:${best}} is on pace to break the single-season ${RNAME[k]} record (${rec[2]}, {p:${rec[0]}})`, { pid: +best, k }); }
  }
}

const API = { RSTATS, RNAME, init, dayLists, chasesFor, moments, seasonEnd, gameEnd, legend, paceWatch, careerNow };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
