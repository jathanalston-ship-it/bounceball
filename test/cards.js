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
  ok(Object.values(C.cardBuild(c.key, r97, { role: "BIG", ovr: 95, rank: 1, season: 1990, pid: 1, k: "pts" }).r).every(v => v <= 99), c.key + " ratings cap at 99");
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
// single-game highs: player 11 scores 54 with a triple-double, player 12 has the season's tackle game
S.highKeys = L.HIGH_KEYS || ["pts","reb","ast","stl","blk","tkl","btk","dnk","tpm","fpm"]; S.featKeys = ["dd","td","g30","g40","g50"];
S.games = [[100, 40, "ERI", "TOL", 1, 0, 0, 4, 0, [], []], [101, 41, "TOL", "GRY", 1, 0, 0, 4, 0, [], []]];
const hl = (v, g) => { const a = []; for (const k of S.highKeys) a.push(v[k] || 0, v[k] ? g : -1); return a.concat([0, 0, 0, 0, 0]); };
S.highs = { 11: hl({ pts: 54, reb: 12, ast: 11 }, 100), 12: hl({ tkl: 9 }, 101) }; S.highs[11][S.highKeys.length * 2 + 1] = 2; S.highs[11][S.highKeys.length * 2 + 4] = 1;
const ctx = { players: { 21: { born: 1940, ht: 88, draft: { round: 1, pick: 1, season: 1959 } } }, firstSeason: { 3: 1960, 21: 1960 }, peak: { 7: 1960 }, hof: { 7: 1975 }, leagueFirst: 1954, mergerSeason: 1979, mergerTeams: new Set(),
  ovrBy: { 30: { 1959: S.players[30].ovr - 9 } }, peakAll: { 21: 1960 }, immortal: { 21: 4 }, dynasty: { "1:1960": 3 } };
const cards = C.seasonCards(S, ctx), n = k => cards.filter(c => c[0] === k).length;
for (const c of C.COLLECTIONS.filter(c => c.kind === "leader" && !c.custom)) ok(n(c.key) === 3, c.key + ": three leaders in a six-team league (got " + n(c.key) + ")");
ok(n("mvp") === 1 && n("dpoy") === 1 && n("roy") === 1 && n("fmvp") === 1, "one card per award");
ok(n("champ") === 10, "every champion gets a ring card");
ok(n("rookie") === 2 && n("hof") === 1 && n("rapsheet") === 1 && n("prime") === 0, "rookie, HOF and rap sheet cards");
ok(cards.every(c => c[4] >= c[5] && c[4] <= 99), "card overall = base + boost, capped");
const mo = cards.filter(c => c[0] === "moments");
ok(mo.some(c => c[2] === 11 && c[7] === "54 PTS" && c[9].o === "TOL" && c[9].g === 100) && mo.some(c => c[2] === 12 && c[7] === "9 TKL"), "moments: best single games with opponent and game id");
ok(n("fifty") === 1 && n("tripledouble") === 1, "fifty club and triple threat from the highs");
ok(cards.some(c => c[0] === "breakout" && c[2] === 30 && c[7] === "+9"), "breakout from last season's overall");
ok(n("numberone") === 1 && n("skyscrapers") === 1 && n("immortals") === 1 && n("dynasty") === 1, "number one, skyscrapers, immortals, dynasty");
ok(n("postseason") >= 3, "postseason scorers");
ok(C.COLLECTIONS.every(c => c.group && C.GROUP_NAMES[c.group] || c.key === "base" || c.kind === "witness"), "every collection sits in a group (base cards and Classic Nights witness cards stand apart)");
const lead = cards.find(c => c[0] === "posterized" && c[6] === 1);
ok(lead && lead[4] >= Math.min(99, lead[5] + 4), "leader card lifts the overall");
// every card has its own build: same player and season, different collections, different ratings
const r60 = Object.fromEntries(P.RKEYS.map(k => [k, 60])), o = { role: "BIG", ovr: 62, rank: 1, season: 1990, pid: 9 };
const dunk = C.cardBuild("posterized", r60, o), swat = C.cardBuild("swat", r60, o), mvp = C.cardBuild("mvp", r60, o);
ok(dunk.r.vert > 70 && dunk.r.ins > 70 && dunk.r.rim === 60, "Posterized pushes vertical and finishing, not rim protection");
ok(swat.r.rim > 70 && swat.r.ins === 60, "Swat Team pushes rim protection, not finishing");
ok(P.RKEYS.every(k => mvp.r[k] > 60), "MVP lifts every rating");
ok(C.cardBuild("posterized", r60, Object.assign({}, o, { rank: 1 })).r.vert > C.cardBuild("posterized", r60, Object.assign({}, o, { rank: 9 })).r.vert, "the leader's card is stronger than the 9th-best");
ok(JSON.stringify(C.cardBuild("posterized", r60, o)) === JSON.stringify(dunk), "builds are deterministic");
ok(C.cardBuild("rookie", r60, o).ovr === 62 && C.cardBuild("base", r60, o).r.vert === 60, "rookie and base cards keep the season's ratings");
ok(C.seasonCards(Object.assign({}, S, { season: 1954 }), ctx).filter(c => c[0] === "founders").length === 60, "founders in the first season");
// league calendar: game days in order, Opening Night on day 0, every holiday on a game day
for (const [yr, n] of [[1955, 83], [1987, 83], [2015, 83], [1999, 60]]) {
  const cal = C.seasonCalendar(yr, n), dates = Array.from({ length: n }, (_, d) => cal.date(d)), hol = {};
  for (let d = 0; d < n; d++) for (const k of cal.holiday(d)) hol[k] = dates[d];
  ok(dates.every((x, i) => !i || x > dates[i - 1]), yr + ": game dates strictly increase");
  ok(hol.opening === dates[0] && hol.christmas === yr + "-12-25" && hol.halloween === yr + "-10-31" && hol.valentine === (yr + 1) + "-02-14", yr + ": holidays land on game days");
  ok(!!hol.leapday === (new Date(Date.UTC(yr + 1, 1, 29)).getUTCMonth() === 1), yr + ": leap day only in leap years");
  ok(Object.entries(hol).filter(([k]) => k === "friday13").every(([, d]) => new Date(d + "T12:00:00Z").getUTCDay() === 5), yr + ": Friday the 13th is a Friday");
}
// holiday cards come from the star of the best game played on that day
{
  const cal = C.seasonCalendar(1960, 42), xd = Array.from({ length: 42 }, (_, d) => d).find(d => cal.holiday(d).includes("christmas"));
  const S2 = Object.assign({}, S, { games: [[500, xd, "AKR", "TOL", 1, 90, 80, 4, 0, [6, 12], [7, 13]], [501, 41, "TOL", "GRY", 1, 0, 0, 4, 0, [], []]],
    pogKeys: ["gid", "pid", "gsc10", "pts", "reb", "ast", "stl", "blk", "tkl", "dnk", "fpm", "tpm", "dpid", "ddnk", "wpid", "wgsc10"], pog: [[500, 12, 412, 41, 12, 3, 1, 0, 0, 2, 0, 1, 12, 2, 12, 412], [501, 13, 200, 20, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0, 13, 200]] });
  const xm = C.seasonCards(S2, ctx).filter(c => c[0] === "christmas");
  ok(xm.length === 1 && xm[0][2] === 12 && xm[0][3] === "AKR" && xm[0][7] === "41 PTS · 12 REB" && xm[0][9].o === "TOL" && xm[0][9].date === "1960-12-25", "Christmas card for the day's best game");
}
// every drawn card pose has a pose in the photo booth (the 3D model posed for the card)
{
  const fs = require("fs"), path = require("path"), keys = (file, name) => { const src = fs.readFileSync(path.join(__dirname, "..", "site", file), "utf8"), i = src.indexOf(`const ${name} = {`), j = src.indexOf("\n};", i); return [...src.slice(i, j).matchAll(/^\s+([a-z0-9]+):\s+\{/gm)].map(m => m[1]); };
  const drawn = keys("cardart.js", "POSES"), shot = new Set(keys("broadcast3d.js", "CPOSE"));
  ok(drawn.length > 15 && drawn.every(k => shot.has(k)), "photo poses for every card pose: missing " + drawn.filter(k => !shot.has(k)).join(", "));
}
console.log(`${cards.length} cards from a fake season, ${bad} problems`);
process.exit(bad ? 1 : 0);
