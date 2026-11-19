// Writes the viewer's summary files (players, staff, league, records) from a league state.
// Shared by sim-history.js and test harnesses.
"use strict";
const fs = require("fs"), path = require("path");
const L = require("../src/league.js");
const P = require("../src/players.js");
const T = require("../src/teams.js");
const ST = require("../src/staff.js");
const B = require("../src/business.js");
function writeJSON(file, obj) { fs.writeFileSync(file + ".tmp", JSON.stringify(obj)); fs.renameSync(file + ".tmp", file); }
function name(S, id) { const p = S.players[id]; return p ? p.first + " " + p.last : null; }
function writeSummaries(S, OUT) {
  const players = {};
  for (const p of Object.values(S.players)) {
    if (!p.career && !p.team && !p.hof) continue; // never played: skip
    players[p.id] = { id: p.id, name: p.first + " " + p.last, role: p.role, ht: p.ht, wt: p.wt, wing: p.wing, aggr: p.aggr, born: p.born, num: p.num, team: p.team, teams: p.teams,
      ovr: p.ovr, r: p.retired ? undefined : P.eraRel(p.r, S.season), tier: p.tier, draft: p.draft, retired: p.retired, hof: p.hof, awards: p.awards, career: p.career,
      contract: p.contract, injury: p.injury, // (ratings relative to his era; the engine plays on the absolute scale in the season files)
      ego: p.ego, loyal: p.loyal, show: p.show, ageStyle: p.ageStyle, mentors: p.mentors, gm: p.gm, coach: p.coach };
  }
  writeJSON(path.join(OUT, "players.json"), players);
  const coaches = {}, owners = {};
  for (const c of Object.values(S.coaches)) if (c.team || c.w + c.l > 0) coaches[c.id] = { id: c.id, name: c.first + " " + c.last, born: c.born, ex: c.ex, team: c.team, off: c.off, def: c.def, dev: c.dev, style: c.style, phil: c.phil ? Object.assign({}, c.phil, { cov: ST.covPref(c) }) : c.phil, w: c.w, l: c.l, pw: c.pw, pl: c.pl, titles: c.titles, awards: c.awards, seasons: c.seasons || [], hist: c.hist, retired: c.retired };
  for (const o of Object.values(S.owners)) owners[o.id] = { id: o.id, name: o.first + " " + o.last, born: o.born, team: o.team, from: o.from, to: o.to, how: o.how, biz: o.biz, wealth: o.wealth, patience: o.patience, spend: o.spend, cash: o.cash };
  const gms = {};
  for (const g of Object.values(S.gms || {})) if (g.team || g.hist.length) gms[g.id] = { id: g.id, name: g.first + " " + g.last, born: g.born, style: g.style, scout: g.scout, deal: g.deal, ex: g.ex, team: g.team, from: g.from, hist: g.hist, awards: g.awards, trades: g.trades, retired: g.retired };
  writeJSON(path.join(OUT, "staff.json"), { coaches, owners, gms });
  const teams = {};
  for (const info of T.TEAMS) { const t = S.teams[info.id]; if (t) teams[info.id] = Object.assign({}, info, { roster: t.roster, hist: t.hist, titles: t.titles, payroll: L.payroll(S, info.id), coach: t.coach, owner: t.owner, coachHist: t.coachHist, ownerHist: t.ownerHist,
    city: B.cityName(B.cityOf(S, info.id)), key: B.cityOf(S, info.id), abbr: B.abbrOf(S, info.id), arena: t.arena.name, arenaCap: t.arena.cap, arenaBuilt: t.arena.built, arenas: t.arenas, cities: t.cities, gm: t.gm, gmHist: t.gmHist, fin: t.fin.hist }); }
  writeJSON(path.join(OUT, "league.json"), {
    seed: S.masterSeed, nextSeason: S.season, leagueVersion: L.LEAGUE_VERSION, engineVersion: S.engineVersion,
    seasons: S.champions.map(c => c.season), champions: S.champions.map(c => Object.assign({}, c, { fmvpName: name(S, c.fmvp), mvpName: name(S, c.mvp) })),
    hof: S.hofClasses.map(h => ({ season: h.season, inductees: h.inductees.map(id => ({ id, name: name(S, id) })) })), teams,
    biz: S.biz ? { tv: S.biz.tvHist, cba: S.biz.cba.hist, union: S.biz.union, moves: S.biz.moves, capMult: S.biz.capHist, fa: S.biz.fa, revShare: S.biz.revShare, share: S.biz.share } : null,
    allStarTeams: T.ALLSTAR, offNews: S.offNews || []
  });
  writeJSON(path.join(OUT, "records.json"), S.records ? { career: S.records.career, season: S.records.season, game: S.records.game } : {});
}

module.exports = { writeSummaries, writeJSON };
