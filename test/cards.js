// Card rules: tiers, boosts and which cards a season hands out.
"use strict";
const C = require("../src/cards.js");
const P = require("../src/players.js");
const L = require("../src/league.js");
const { makeRng } = require("../src/engine.js");
let bad = 0;
const ok = (c, m) => { if (!c) { bad++; console.log("FAIL", m); } };

C.TIERS.forEach((t, i) => i && ok(t.min > C.TIERS[i - 1].min, "tiers ascend"));
ok(C.tierFor(0).key === "rubber" && C.tierFor(99).key === "vulcan" && C.tierFor(87).key === "diamond", "tier lookup");
const r97 = Object.fromEntries(P.RKEYS.map(k => [k, 97]));
for (const c of C.COLLECTIONS) {
  ok(c.pose && c.name && c.blurb, c.key + " has a pose, name and blurb");
  ok(Object.values(C.cardRatings(c.key, r97, 6)).every(v => v <= 99), c.key + " boosts cap at 99");
}
ok(C.GROUPS.flatMap(g => g.keys).sort().join() === P.RKEYS.slice().sort().join(), "every rating is in exactly one group");

// a fake six-team season
const rng = makeRng(7), K = L.STAT_KEYS, teams = ["AKR", "TOL", "GRY", "FLN", "YNG", "ERI"];
const S = { season: 1960, teams, statKeys: K, stats: {}, pstats: {}, players: {}, awards: { mvp: 1, dpoy: 2, roy: 3, fmvp: 4, champion: "AKR" }, blotter: [{ who: "player", id: 5, team: "TOL", kind: "arrest", games: 8, text: "did a thing" }] };
for (let id = 1; id <= 60; id++) {
  const team = teams[id % 6], p = P.genPlayer(rng, P.ROLE_LIST[id % 5], 0, id, 1960);
  p.num = id; S.players[id] = { id, role: p.role, ovr: p.ovr, num: id, r: p.r, ht: p.ht, wt: p.wt, wing: p.wing };
  const line = K.map(k => k === "gp" ? 82 : k === "min" ? 82 * 60 * (20 + id % 15) : rng.int(0, 400));
  S.stats[id] = [team].concat(line); if (team === "AKR") S.pstats[id] = [team].concat(line);
}
const ctx = { players: {}, firstSeason: { 3: 1960 }, peak: { 7: 1960 }, hof: { 7: 1975 }, leagueFirst: 1954, mergerSeason: 1979, mergerTeams: new Set() };
const cards = C.seasonCards(S, ctx), n = k => cards.filter(c => c[0] === k).length;
for (const c of C.COLLECTIONS.filter(c => c.kind === "leader")) ok(n(c.key) === 3, c.key + ": three leaders in a six-team league (got " + n(c.key) + ")");
ok(n("mvp") === 1 && n("dpoy") === 1 && n("roy") === 1 && n("fmvp") === 1, "one card per award");
ok(n("champ") === 10, "every champion gets a ring card");
ok(n("rookie") === 1 && n("hof") === 1 && n("rapsheet") === 1 && n("prime") === 0, "rookie, HOF and rap sheet cards");
ok(cards.every(c => c[4] >= c[5] && c[4] <= 99), "card overall = base + boost, capped");
const lead = cards.find(c => c[0] === "posterized" && c[6] === 1);
ok(lead && lead[4] === Math.min(99, lead[5] + 5), "leader gets +5");
ok(C.seasonCards(Object.assign({}, S, { season: 1954 }), ctx).filter(c => c[0] === "founders").length === 60, "founders in the first season");
console.log(`${cards.length} cards from a fake season, ${bad} problems`);
process.exit(bad ? 1 : 0);
