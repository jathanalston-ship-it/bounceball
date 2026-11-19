#!/usr/bin/env node
// Builds derived lookup files for the viewer from the season files (never edited by hand).
//   index/player-seasons.json   every player's season stat lines (regular season + playoffs)
//   index/players/<n>.json      player detail, sharded by id % SHARDS: ratings by season, league
//                               ranks, single-game highs, career timeline, earned cards
//   index/cards.json            every collection card ever earned (base cards excluded)
//   index/base.json             every base card (one per player-season, rated as the season began), for packs and team sets
//   index/records.json          v0.7 record book: all-time career, season and single-game lists (overall and by
//                               decade), advanced-stat leaders, franchise records, all-time ability rankings
//   index/drafts.json           v0.7 every draft in hindsight: what each pick became, steals and busts, a re-draft
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
const D = id => det[id] || (det[id] = { s: [], rk: {}, hi: {}, ph: {}, tl: [], cards: [], adv: [] });
// v0.7 record book accumulators
const REC_STATS = ["pts", "reb", "ast", "stl", "blk", "tkl", "btk", "dnk", "fpm", "tpm"];
const seasonMarks = {}, gameMarks = {}, advTop = {}, fr = {}, absPeak = {}, eraPeak = {};
const top = (arr, row, n, vi) => { arr.push(row); if (arr.length > n * 3) { arr.sort((a, b) => b[vi] - a[vi]); arr.length = n; } };
const decade = y => Math.floor(y / 10) * 10;
const firstSeason = {}, peak = {}, peakOvr = {}, nSeasons = {};
const ovrBy = {}, teamYears = {}, teamPeak = {}, lastSeason = {}, gmsc = {}, titles = {};
let statKeys = null, highKeys = null, featKeys = null;

// ---------- pass 1: stat lines, ratings, ranks, highs, timeline ----------
for (const y of lg.seasons) {
  const S = readSeason(y);
  statKeys = statKeys || S.statKeys; highKeys = highKeys || S.highKeys; featKeys = featKeys || S.featKeys;
  const ix = Object.fromEntries(S.statKeys.map((k, i) => [k, i + 1]));
  for (const [id, a] of Object.entries(S.stats)) (lines[id] = lines[id] || []).push([y].concat(a));
  for (const [id, a] of Object.entries(S.pstats)) if (a[ix.gp]) (plines[id] = plines[id] || []).push([y].concat(a));

  // ratings as the season began (anyone who played has a snapshot): shown relative to his era, plus where he'd rank all-time
  for (const [id, a] of Object.entries(S.stats)) {
    if (!a[ix.gp]) continue;
    const sp = S.players[id]; if (!sp) continue;
    const er = P.eraRel(sp.r, y), abs = P.allTimeOvr(sp.r, sp.role);
    D(id).s.push([y, a[0], sp.num, sp.ovr, sp.wt].concat(P.RKEYS.map(k => er[k]), [abs]));
    if (!absPeak[id] || abs > absPeak[id][1]) absPeak[id] = [y, abs, sp.role];
    if (!eraPeak[id] || sp.ovr > eraPeak[id][1]) eraPeak[id] = [y, sp.ovr, sp.role];
    if (sp.wing) D(id).w = sp.wing;
    if (firstSeason[id] === undefined) firstSeason[id] = y;
    nSeasons[id] = (nSeasons[id] || 0) + 1;
    if (peakOvr[id] === undefined || sp.ovr > peakOvr[id]) { peakOvr[id] = sp.ovr; peak[id] = y; }
    (ovrBy[id] = ovrBy[id] || {})[y] = sp.ovr; lastSeason[id] = y;
    const ty = (teamYears[id] = teamYears[id] || {}); ty[a[0]] = (ty[a[0]] || 0) + 1;
    const tp = (teamPeak[id] = teamPeak[id] || {}); if (!tp[a[0]] || sp.ovr > tp[a[0]][1]) tp[a[0]] = [y, sp.ovr];
    const st = {}; S.statKeys.forEach((k, i) => st[k] = a[i + 1]);
    gmsc[id] = (gmsc[id] || 0) + st.pts + 0.8 * (st.oreb + st.dreb) + 1.2 * st.ast + 2 * st.stl + 2 * st.blk + 3 * st.tkl + st.btk - 1.2 * st.to - 0.6 * (st.fga - st.fgm) - 0.4 * (st.fta - st.ftm);
  }
  if (S.awards && S.awards.champion) for (const [id, a] of Object.entries(S.pstats)) if (a[0] === S.awards.champion && a[ix.gp]) (titles[id] = titles[id] || []).push(y);

  // league ranks among qualified players (60% of games)
  const rows = Object.entries(S.stats).map(([id, a]) => { const o = { id, team: a[0] }; for (const k of S.statKeys) o[k] = a[ix[k]]; return o; }).filter(o => o.gp > 0);
  const gsc = o => o.pts + 0.8 * (o.oreb + o.dreb) + 1.2 * o.ast + 2 * o.stl + 2 * o.blk + 3 * o.tkl + o.btk - 1.2 * o.to - 0.6 * (o.fga - o.fgm) - 0.4 * (o.fta - o.ftm);
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
  // v0.7 advanced stats: true shooting, effective FG, usage, the UBL Rating (game score per 36, league average 15),
  // Win Value (his share of his team's game score, times its wins) and plus/minus per game
  const tm = {}; for (const o of rows) { const t = tm[o.team] || (tm[o.team] = { fga: 0, fta: 0, to: 0, min: 0, gs: 0 }); t.fga += o.fga; t.fta += o.fta; t.to += o.to; t.min += o.min; t.gs += Math.max(0, gsc(o)); }
  let lgGs = 0, lgMin = 0; for (const o of rows) { lgGs += gsc(o); lgMin += o.min; }
  const per36 = lgMin ? lgGs / lgMin * 36 * 60 : 1;
  for (const o of rows) {
    if (o.gp < 10 || !o.min) continue;
    const T0 = tm[o.team], st = S.standings[o.team] || [0, 0], mins = o.min / 60;
    const ts = o.fga + o.fta ? o.pts / (2 * (o.fga + 0.44 * o.fta)) : 0, efg = o.fga ? (o.fgm + 0.5 * o.tpm + 1 * o.fpm) / o.fga : 0;
    const usg = T0.min ? (o.fga + 0.44 * o.fta + o.to) * (T0.min / 5) / (o.min * (T0.fga + 0.44 * T0.fta + T0.to)) : 0;
    const rat = gsc(o) / Math.max(1, mins) * 36 / Math.max(0.1, per36) * 15, wv = T0.gs ? Math.max(0, gsc(o)) / T0.gs * st[0] : 0, pm = o.pm !== undefined ? o.pm / o.gp : null;
    const row = [y, o.team, +(ts * 100).toFixed(1), +(efg * 100).toFixed(1), +(usg * 100).toFixed(1), +rat.toFixed(1), +wv.toFixed(1), pm === null ? null : +pm.toFixed(1)];
    D(o.id).adv.push(row);
    if (o.gp >= maxgp * 0.6) [["ts", 2], ["rat", 5], ["wv", 6], ["pm", 7], ["usg", 4]].forEach(([k, i]) => { if (row[i] !== null && (k !== "ts" || o.fga >= o.gp * 5)) top(advTop[k] = advTop[k] || [], [+o.id, y, o.team, row[i]], 50, 3); });
  }
  // season marks (totals and, for the qualified, per game)
  for (const o of rows) for (const k of REC_STATS) {
    const v = k === "reb" ? o.oreb + o.dreb : o[k]; if (v === undefined || v <= 0) continue;
    top(seasonMarks[k] = seasonMarks[k] || [], [+o.id, y, o.team, v], 50, 3);
    top(seasonMarks[k + "@" + decade(y)] = seasonMarks[k + "@" + decade(y)] || [], [+o.id, y, o.team, v], 10, 3);
    if (o.gp >= maxgp * 0.6) top(seasonMarks[k + "/g"] = seasonMarks[k + "/g"] || [], [+o.id, y, o.team, +(v / o.gp).toFixed(2)], 50, 3);
    // franchise: career totals with this team, and the team's single-season bests
    const F = fr[o.team] || (fr[o.team] = { tot: {}, best: {}, streak: { w: [0, 0, 0], l: [0, 0, 0] } });
    const tt = F.tot[k] || (F.tot[k] = {}); tt[o.id] = (tt[o.id] || 0) + v;
    top(F.best[k] = F.best[k] || [], [+o.id, y, v], 5, 2);
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
  // v0.7: storylines on the timeline
  for (const t of S.tx) {
    const d = t.day;
    switch (t.type) {
      case "demand": ev(t.pid, [y, d, "demand", t.team, t.why]); break;
      case "holdout": ev(t.pid, [y, d, "holdout", t.team, t.salary, t.ask]); break;
      case "extend": ev(t.pid, [y, d, "extend", t.team, t.salary, t.years, t.why || ""]); break;
      case "walk": ev(t.pid, [y, d, "walk", t.team]); break;
      case "feud": ev(t.a, [y, d, "feud", t.team, t.kind, t.kind === "coach" ? t.c : t.b]); if (t.b) ev(t.b, [y, d, "feud", t.team, t.kind, t.a]); break;
      case "skill": ev(t.pid, [y, d, "skill", t.team, t.k, t.gain, t.reinvent ? 1 : 0, t.from || 0]); break;
      case "role": ev(t.pid, [y, d, "role", t.team, t.from, t.to]); break;
      case "cliff": ev(t.pid, [y, d, "cliff", t.team]); break;
    }
  }
  for (const m of S.miles || []) { const [gid, id, k, , kind, target, rank] = m; ev(id, [y, gday[gid] !== undefined ? gday[gid] : 0, "mile", null, k, kind, target, rank || 0]); }
  if (S.dunk && S.dunk.winner) ev(S.dunk.winner, [y, Math.floor(S.games.length ? S.games.filter(g => g[8] === 0).length / Math.max(1, S.teams.length / 2) * 0.55 : 50), "dunk", null]);
  // single-game marks (regular season highs carry the game id)
  highKeys.forEach((k, i) => { for (const [id, h] of Object.entries(S.highs || {})) if (h[2 * i] > 0) { top(gameMarks[k] = gameMarks[k] || [], [+id, y, h[2 * i + 1], h[2 * i]], 50, 3); top(gameMarks[k + "@" + decade(y)] = gameMarks[k + "@" + decade(y)] || [], [+id, y, h[2 * i + 1], h[2 * i]], 10, 3); } });
  // streaks: every team's results in order
  const res = {}; for (const g of S.games) if (g[8] === 0) { (res[g[2]] = res[g[2]] || []).push([g[1], g[5] > g[6]]); (res[g[3]] = res[g[3]] || []).push([g[1], g[6] > g[5]]); }
  for (const [t, list] of Object.entries(res)) {
    const F = fr[t] || (fr[t] = { tot: {}, best: {}, streak: { w: [0, 0, 0], l: [0, 0, 0] } }); list.sort((a, b) => a[0] - b[0]);
    let w = 0, l = 0; for (const [, won] of list) { if (won) { w++; l = 0; } else { l++; w = 0; } if (w > F.streak.w[0]) F.streak.w = [w, y, 0]; if (l > F.streak.l[0]) F.streak.l = [l, y, 0]; }
  }
  for (const e of S.blotter || []) if (e.who === "player") ev(e.id, [y, e.phase === "playoffs" ? 200 + e.day : e.day, "blot", e.team, e.text, e.kind, e.games || 0, e.fine || 0]);
}

// ---------- pass 2: cards ----------
const hof = {}; for (const p of Object.values(players)) if (p.hof) hof[p.id] = p.hof;
const peakQ = {}; for (const id in peak) if (hof[id] || (nSeasons[id] >= 4 && peakOvr[id] >= 78)) peakQ[id] = peak[id];
const mergerTeams = new Set(Object.values(lg.teams).filter(t => t.how === "merger").map(t => t.id));
const mergerSeason = Math.min(...Object.values(lg.teams).filter(t => t.how === "merger").map(t => t.joined));
// careers: franchise icons, journeymen, the Immortals, dynasties, expansion rosters
const franchise = {}, journey = {}, immortal = {}, dynasty = {};
for (const [id, ty] of Object.entries(teamYears)) {
  const best = Object.entries(ty).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 10) franchise[id] = { team: best[0], season: teamPeak[id][best[0]][0], n: best[1] };
  const nt = (players[id] && players[id].teams ? players[id].teams.length : Object.keys(ty).length);
  if (nt >= 6) journey[id] = { season: lastSeason[id], n: nt };
}
Object.entries(gmsc).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([id], i) => immortal[id] = i + 1);
for (const [id, ys] of Object.entries(titles)) { let run = 1; for (let i = 1; i < ys.length; i++) { run = ys[i] === ys[i - 1] + 1 ? run + 1 : 1; if (run >= 3) dynasty[id + ":" + ys[i]] = run; } }
const expansion = new Set(Object.values(lg.teams).filter(t => t.how === "expansion").map(t => t.id + ":" + t.joined));
const allCards = [];
for (const y of lg.seasons) {
  const S = readSeason(y);
  for (const id in S.players) S.players[id] = Object.assign({}, S.players[id], { r: P.eraRel(S.players[id].r, y) }); // cards rate a player against his era
  for (const c of C.seasonCards(S, { players, firstSeason, peak: peakQ, hof, leagueFirst: lg.seasons[0], mergerSeason, mergerTeams, ovrBy, peakAll: peak, franchise, journey, expansion, immortal, dynasty })) { allCards.push(c); D(c[2]).cards.push(c); }
}

// ---------- write ----------
fs.mkdirSync(path.join(OUT, "index", "players"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index", "player-seasons.json"), JSON.stringify({ keys: ["season", "team"].concat(statKeys), regular: lines, playoffs: plines }));
const shards = Array.from({ length: SHARDS }, () => ({}));
for (const [id, d] of Object.entries(det)) { d.tl.sort((a, b) => a[0] - b[0] || a[1] - b[1]); shards[id % SHARDS][id] = d; }
shards.forEach((s, i) => fs.writeFileSync(path.join(OUT, "index", "players", i + ".json"), JSON.stringify(s)));
const cardKeys = ["col", "season", "pid", "team", "ovr", "base", "rank", "value", "num", "extra"];
fs.writeFileSync(path.join(OUT, "index", "cards.json"), JSON.stringify({
  shards: SHARDS, rkeys: P.RKEYS, ratingKeys: ["season", "team", "num", "ovr", "wt"].concat(P.RKEYS, ["abs"]), advKeys: ["season", "team", "ts", "efg", "usg", "rat", "wv", "pm"],
  highKeys, featKeys, cardKeys, cards: allCards
}));
// base cards: [pid, team, ovr, num] by season (the card game puts them in packs and builds team sets from them)
const baseBy = {}; for (const [id, d] of Object.entries(det)) for (const r of d.s) (baseBy[r[0]] = baseBy[r[0]] || []).push([+id, r[1], r[3], r[2]]);
for (const rows of Object.values(baseBy)) rows.sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : b[2] - a[2]);
fs.writeFileSync(path.join(OUT, "index", "base.json"), JSON.stringify({ keys: ["pid", "team", "ovr", "num"], seasons: baseBy }));
// ---------- v0.7: the record book and the drafts ----------
const career = {}; for (const [id, ls] of Object.entries(lines)) { const t = {}; for (const l of ls) statKeys.forEach((k, i) => t[k] = (t[k] || 0) + (l[i + 2] || 0)); t.reb = (t.oreb || 0) + (t.dreb || 0); career[id] = t; }
const careerLists = {}; for (const k of REC_STATS.concat(["gp"])) careerLists[k] = Object.entries(career).filter(([, t]) => t[k] > 0).map(([id, t]) => [+id, t[k], (players[id] || {}).retired ? 1 : 0]).sort((a, b) => b[1] - a[1]).slice(0, 50);
for (const k of ["pts", "reb", "ast", "tkl", "fpm"]) careerLists[k + "/g"] = Object.entries(career).filter(([, t]) => t.gp >= 300).map(([id, t]) => [+id, +(t[k] / t.gp).toFixed(2), (players[id] || {}).retired ? 1 : 0]).sort((a, b) => b[1] - a[1]).slice(0, 50);
const fin = (arr, n, vi) => arr.sort((a, b) => b[vi] - a[vi]).slice(0, n);
const frRec = {};
for (const [t, F] of Object.entries(fr)) {
  const lead = {}; for (const k in F.tot) lead[k] = Object.entries(F.tot[k]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => [+id, v]);
  const best = {}; for (const k in F.best) best[k] = fin(F.best[k], 5, 2);
  const h = (lg.teams[t] || {}).hist || [];
  const bs = h.slice().sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l))[0], ws = h.slice().sort((a, b) => a.w / (a.w + a.l) - b.w / (b.w + b.l))[0];
  frRec[t] = { leaders: lead, best, streak: F.streak, bestSeason: bs ? [bs.season, bs.w, bs.l] : null, worstSeason: ws ? [ws.season, ws.w, ws.l] : null, titles: h.filter(x => x.res === "Champion").map(x => x.season), playoffs: h.filter(x => x.res !== "-").length };
}
const sm = {}; for (const k in seasonMarks) sm[k] = fin(seasonMarks[k], k.includes("@") ? 10 : 50, 3);
const gm = {}; for (const k in gameMarks) gm[k] = fin(gameMarks[k], k.includes("@") ? 10 : 50, 3);
const adv = {}; for (const k in advTop) adv[k] = fin(advTop[k], 50, 3);
const ability = { abs: Object.entries(absPeak).sort((a, b) => b[1][1] - a[1][1]).slice(0, 100).map(([id, v]) => [+id].concat(v)), era: Object.entries(eraPeak).sort((a, b) => b[1][1] - a[1][1]).slice(0, 100).map(([id, v]) => [+id].concat(v)) };
fs.writeFileSync(path.join(OUT, "index", "records.json"), JSON.stringify({ career: careerLists, season: sm, game: gm, adv, franchise: frRec, ability, advKeys: ["season", "team", "ts", "efg", "usg", "rat", "wv", "pm"] }));
// drafts in hindsight: what each pick became (career game score), and the re-draft
const drafts = {};
const draftDir = path.join(OUT, "drafts");
if (fs.existsSync(draftDir)) for (const f of fs.readdirSync(draftDir)) {
  const d = JSON.parse(fs.readFileSync(path.join(draftDir, f), "utf8")), val = id => Math.round(gmsc[id] || 0);
  const ranked = d.picks.map(k => k.pid).sort((a, b) => val(b) - val(a)), rr = new Map(ranked.map((id, i) => [id, i + 1]));
  drafts[d.year] = d.picks.map(k => { const r = rr.get(k.pid), v = val(k.pid); return [k.no, k.pid, k.team, r, v, nSeasons[k.pid] || 0, peakOvr[k.pid] || 0, k.round === 1 && k.no <= 5 && r > 15 ? "bust" : k.no > 15 && r <= 5 && v > 0 ? "steal" : ""]; });
}
fs.writeFileSync(path.join(OUT, "index", "drafts.json"), JSON.stringify({ keys: ["no", "pid", "team", "redraft", "value", "seasons", "peak", "verdict"], drafts }));
const byCol = {}; for (const c of allCards) byCol[c[0]] = (byCol[c[0]] || 0) + 1;
console.log(`indexed ${Object.keys(lines).length} players across ${lg.seasons.length} seasons · ${allCards.length} collection cards ${JSON.stringify(byCol)}`);
