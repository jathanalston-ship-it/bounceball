#!/usr/bin/env node
// Builds derived lookup files for the viewer from the season files (never edited by hand).
//   index/player-seasons.json   every player's season stat lines (regular season + playoffs)
//   index/players/<n>.json      player detail, sharded by id % SHARDS: ratings by season, league
//                               ranks, single-game highs, career timeline, earned cards
//   index/cards.json            every collection card ever earned (base cards excluded)
"use strict";
const fs = require("fs"), path = require("path");
const P = require("../src/players.js");
const C = require("../src/cards.js");
const OUT = path.resolve(process.argv[2] || "data");
const SHARDS = 32;
const lg = JSON.parse(fs.readFileSync(path.join(OUT, "league.json"), "utf8"));
const players = JSON.parse(fs.readFileSync(path.join(OUT, "players.json"), "utf8"));
const readSeason = y => JSON.parse(fs.readFileSync(path.join(OUT, "seasons", y + ".json"), "utf8"));

const lines = {}, plines = {}, det = {};
const D = id => det[id] || (det[id] = { s: [], rk: {}, hi: {}, ph: {}, tl: [], cards: [] });
const firstSeason = {}, peak = {}, peakOvr = {}, nSeasons = {};
let statKeys = null, highKeys = null, featKeys = null;

// ---------- pass 1: stat lines, ratings, ranks, highs, timeline ----------
for (const y of lg.seasons) {
  const S = readSeason(y);
  statKeys = statKeys || S.statKeys; highKeys = highKeys || S.highKeys; featKeys = featKeys || S.featKeys;
  const ix = Object.fromEntries(S.statKeys.map((k, i) => [k, i + 1]));
  for (const [id, a] of Object.entries(S.stats)) (lines[id] = lines[id] || []).push([y].concat(a));
  for (const [id, a] of Object.entries(S.pstats)) if (a[ix.gp]) (plines[id] = plines[id] || []).push([y].concat(a));

  // ratings as the season began (anyone who played has a snapshot)
  for (const [id, a] of Object.entries(S.stats)) {
    if (!a[ix.gp]) continue;
    const sp = S.players[id]; if (!sp) continue;
    D(id).s.push([y, a[0], sp.num, sp.ovr, sp.wt].concat(P.RKEYS.map(k => sp.r[k])));
    if (sp.wing) D(id).w = sp.wing;
    if (firstSeason[id] === undefined) firstSeason[id] = y;
    nSeasons[id] = (nSeasons[id] || 0) + 1;
    if (peakOvr[id] === undefined || sp.ovr > peakOvr[id]) { peakOvr[id] = sp.ovr; peak[id] = y; }
  }

  // league ranks among qualified players (60% of games)
  const rows = Object.entries(S.stats).map(([id, a]) => { const o = { id }; for (const k of S.statKeys) o[k] = a[ix[k]]; return o; }).filter(o => o.gp > 0);
  const maxgp = Math.max(1, ...rows.map(o => o.gp)), q = rows.filter(o => o.gp >= maxgp * 0.6);
  const cats = {
    pts: o => o.pts / o.gp, reb: o => (o.oreb + o.dreb) / o.gp, ast: o => o.ast / o.gp, stl: o => o.stl / o.gp, blk: o => o.blk / o.gp,
    tkl: o => o.tkl / o.gp, btk: o => o.btk / o.gp, min: o => o.min / o.gp, fpm: o => o.fpm, tpm: o => o.tpm,
    fgp: o => o.fga >= o.gp * 5 ? o.fgm / o.fga : -1, tsp: o => o.fga + o.fta >= o.gp * 6 ? o.pts / (2 * (o.fga + 0.44 * o.fta)) : -1
  };
  if (ix.dnk) cats.dnk = o => o.dnk;
  for (const [k, f] of Object.entries(cats)) {
    q.map(o => [o.id, f(o)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 50)
      .forEach(([id], i) => { const r = D(id).rk[y] || (D(id).rk[y] = {}); r[k] = i + 1; });
  }
  for (const [id, h] of Object.entries(S.highs || {})) D(id).hi[y] = h;
  for (const [id, h] of Object.entries(S.phighs || {})) D(id).ph[y] = h;

  // career timeline
  const gday = {}; for (const g of S.games) gday[g[0]] = g[8] ? 200 + g[1] : g[1];
  const ev = (id, row) => { if (players[id]) D(id).tl.push(row); };
  for (const t of S.tx) {
    const d = t.day;
    switch (t.type) {
      case "draft": ev(t.pid, [y, d, "draft", t.team, t.round, t.pick]); break;
      case "sign": ev(t.pid, [y, d, "sign", t.team, t.how || "", t.salary || 0, t.years || 0]); break;
      case "resign": ev(t.pid, [y, d, "resign", t.team, t.salary || 0, t.years || 0]); break;
      case "waive": ev(t.pid, [y, d, "waive", t.team, t.dead || 0]); break;
      case "retire": ev(t.pid, [y, d, "retire", t.team]); break;
      case "expansion": ev(t.pid, [y, d, "expansion", t.team, t.from]); break;
      case "trade": for (const id of t.toB) ev(id, [y, d, "trade", t.teams[0], t.teams[1]]); for (const id of t.toS) ev(id, [y, d, "trade", t.teams[1], t.teams[0]]); break;
    }
  }
  for (const [gid, id, team, name, out] of S.injuries) if (out >= 3) ev(id, [y, gday[gid] !== undefined ? gday[gid] : 0, "inj", team, name, out]);
  for (const e of S.blotter || []) if (e.who === "player") ev(e.id, [y, e.phase === "playoffs" ? 200 + e.day : e.day, "blot", e.team, e.text, e.kind, e.games || 0, e.fine || 0]);
}

// ---------- pass 2: cards ----------
const hof = {}; for (const p of Object.values(players)) if (p.hof) hof[p.id] = p.hof;
const peakQ = {}; for (const id in peak) if (hof[id] || (nSeasons[id] >= 4 && peakOvr[id] >= 78)) peakQ[id] = peak[id];
const mergerTeams = new Set(Object.values(lg.teams).filter(t => t.how === "merger").map(t => t.id));
const mergerSeason = Math.min(...Object.values(lg.teams).filter(t => t.how === "merger").map(t => t.joined));
const allCards = [];
for (const y of lg.seasons) {
  const S = readSeason(y);
  for (const c of C.seasonCards(S, { players, firstSeason, peak: peakQ, hof, leagueFirst: lg.seasons[0], mergerSeason, mergerTeams })) { allCards.push(c); D(c[2]).cards.push(c); }
}

// ---------- write ----------
fs.mkdirSync(path.join(OUT, "index", "players"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index", "player-seasons.json"), JSON.stringify({ keys: ["season", "team"].concat(statKeys), regular: lines, playoffs: plines }));
const shards = Array.from({ length: SHARDS }, () => ({}));
for (const [id, d] of Object.entries(det)) { d.tl.sort((a, b) => a[0] - b[0] || a[1] - b[1]); shards[id % SHARDS][id] = d; }
shards.forEach((s, i) => fs.writeFileSync(path.join(OUT, "index", "players", i + ".json"), JSON.stringify(s)));
const cardKeys = ["col", "season", "pid", "team", "ovr", "base", "rank", "value", "num"];
fs.writeFileSync(path.join(OUT, "index", "cards.json"), JSON.stringify({
  shards: SHARDS, rkeys: P.RKEYS, ratingKeys: ["season", "team", "num", "ovr", "wt"].concat(P.RKEYS),
  highKeys, featKeys, cardKeys, cards: allCards
}));
const byCol = {}; for (const c of allCards) byCol[c[0]] = (byCol[c[0]] || 0) + 1;
console.log(`indexed ${Object.keys(lines).length} players across ${lg.seasons.length} seasons · ${allCards.length} collection cards ${JSON.stringify(byCol)}`);
