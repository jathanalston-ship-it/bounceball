// The lineup game: roster rules, chemistry, collection boosts, the ladder, weekly challenges, results.
"use strict";
const LU = require("../src/lineup.js"), E = require("../src/cardeco.js"), N = require("../src/nights.js");
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log("FAIL:", msg); } };
const card = (pid, role, team, season, col, ovr) => ({ key: `${col}:${season}:${pid}`, pid, role, team, season, col, ovr, name: "P" + pid });

// roster rules
{
  const five = [card(1, "PG", "ERI", 1987, "base", 80), card(2, "WING", "ERI", 1987, "mvp", 90), card(3, "SNIPER", "TOL", 1960, "splash", 77), card(4, "BIG", "ERI", 1987, "swat", 84), card(5, "BRUISER", "GRY", 1971, "wrecking", 79)];
  ok(!LU.check(five).ok && LU.check(five).problems.length === 1, "five players aren't enough");
  const eight = five.concat([card(6, "WING", "ERI", 1985, "splash", 70), card(7, "BIG", "AKR", 1987, "splash", 66), card(8, "PG", "ERI", 1987, "dimes", 72)]);
  ok(LU.check(eight).ok, "eight players with a ball handler, two wings and two bigs");
  ok(!LU.check(eight.filter(c => c.role !== "PG")).ok, "a lineup needs a ball handler");
  ok(LU.check(eight.concat([card(1, "PG", "ERI", 1988, "base", 81)])).problems.some(p => p.includes("twice")), "one card per player");
  ok(LU.strength(eight) === Math.round((80 + 90 + 77 + 84 + 79 + 70 + 66 + 72) / 8 * 10) / 10, "strength is the average of the best eight");
  // chemistry
  const ch = LU.chemistry(eight);
  ok(ch.per[1] > ch.per[2] && ch.per[2] >= 0.6 && ch.per.every(x => x <= 1), `teammates have more chemistry than strangers (${ch.per.join(" ")})`);
  ok(ch.links.some(l => l.kind === "team" && l.team === "ERI" && l.season === 1987 && l.n === 4), "the 1987 ERI link");
  // collection boosts
  const sb = LU.setBoosts(eight);
  ok(sb.lines.length === 1 && sb.lines[0].col === "splash" && sb.boosts.thr === 2 && sb.boosts.mid === 2, "three Splash Zone cards: +2 shooting for everyone");
  const r = LU.applyBoosts({ thr: 98, mid: 50, ins: 60 }, sb.boosts); ok(r.thr === 99 && r.mid === 52 && r.ins === 60, "boosts cap at 99");
}
// the ladder
{
  const teams = {}; for (const id of ["AKR", "TOL", "GRY", "FLN", "YNG", "ERI"]) teams[id] = { id, hist: [] };
  const seasons = []; for (let y = 1954; y < 1974; y++) seasons.push(y);
  seasons.forEach((y, k) => Object.values(teams).forEach((t, i) => { const w = 20 + ((i * 11 + k * 7) % 45); t.hist.push({ season: y, w, l: 82 - w, res: w > 60 ? "Champion" : w > 55 ? "Finals" : w > 45 ? "R1" : "-", coach: i }); }));
  const L = LU.ladderOf(N.candidates({ seasons, teams }));
  ok(L.length === 30 && L.every((x, i) => x.rung === i + 1), "thirty rungs");
  ok(L.every((x, i) => !i || LU.strengthOf(x) >= LU.strengthOf(L[i - 1]) - 1e-9), "weakest to strongest");
  ok(L.every((x, i) => !i || x.team !== L[i - 1].team) && new Set(L.map(x => x.team + x.season)).size === 30, "no franchise twice in a row, no team-season twice");
  ok(JSON.stringify(LU.ladderOf(N.candidates({ seasons, teams }))) === JSON.stringify(L), "the same ladder for everyone");
  ok(LU.rungReward(30).tokens.legends === 2 && LU.rungReward(10).tokens.legends === 1 && LU.rungReward(5).tokens.premium === 1, "rung rewards");
  const W = LU.weeklyOf("2026-W47", L);
  ok(W.length === 3 && new Set(W.map(w => w.k)).size === 3 && W.every(w => w.rung >= 1 && w.rung <= 30) && JSON.stringify(LU.weeklyOf("2026-W47", L)) === JSON.stringify(W), "three weekly challenges");
  // results
  const s = E.newSave(1); s.coins = 0; s.tokens = {};
  const r1 = LU.record(s, "ladder", 5, { win: true, score: [100, 98], my: {}, opp: {} });
  ok(r1.first && s.lu.best === 5 && s.coins === 600 && s.tokens.premium === 1, "a first win clears the rung and pays");
  const r2 = LU.record(s, "ladder", 5, { win: true, score: [100, 98], my: {}, opp: {} });
  ok(!r2.first && r2.coins === LU.REPLAY_WIN && s.lu.w === 2, "replays pay a little");
  LU.record(s, "ladder", 6, { win: false, score: [90, 98], my: {}, opp: {} }); ok(s.lu.best === 5 && s.lu.l === 1, "a loss doesn't clear the rung");
  const tk = W.find(w => w.k === "tkl") || Object.assign({}, W[0], { k: "tkl", id: "2026-W47:tkl" });
  const r3 = LU.record(s, "week", tk, { win: true, score: [100, 90], my: { tkl: 3 }, opp: { tkl: 5 } });
  ok(!r3.first && !s.lu.ch.done[tk.id], "a challenge with a condition needs it met");
  const r4 = LU.record(s, "week", tk, { win: true, score: [100, 90], my: { tkl: 7 }, opp: { tkl: 5 } });
  ok(r4.first && s.lu.ch.done[tk.id], "condition met: the challenge pays");
  ok(LU.RBY.rg.test([card(1, "PG", "ERI", 1987, "base", 74)]) && !LU.RBY.rg.test([card(1, "PG", "ERI", 1987, "base", 75)]) && LU.RBY.dec.test([card(1, "PG", "A", 1981, "base", 1), card(2, "PG", "A", 1975, "base", 1)]), "challenge rules");
  // toggling cards into a slot
  s.owned["base:1987:1"] = 1; s.owned["mvp:1988:1"] = 1; s.owned["base:1990:2"] = 1;
  const pid = k => +k.split(":")[2];
  ok(LU.toggle(s, 0, "base:1987:1", pid) === "in" && LU.toggle(s, 0, "mvp:1988:1", pid) === "swap" && s.lu.sl[0].k.join() === "mvp:1988:1", "one card per player: a second card swaps in");
  ok(LU.toggle(s, 0, "mvp:1988:1", pid) === "out" && LU.toggle(s, 0, "nope:1990:9", pid) === null, "remove; only owned cards");
  // the achievements and the save code
  s.lu.best = 10; const got = E.checkAch(s, { uniq: 0, score: 0, colDone: () => false }); ok(got.some(a => a.id === "ladder10"), "the ladder achievement");
  LU.toggle(s, 1, "base:1990:2", pid); s.lu.team.name = "Rubber <b>Barons"; const back = E.unpackSave(E.packSave(s));
  ok(back.lu.best === 10 && back.lu.beat["5"] && back.lu.sl[1].k[0] === "base:1990:2" && back.lu.team.name === "Rubber bBarons" && back.lu.ch.done[tk.id], "save codes keep the lineup game (and clean names)");
}
console.log(`lineup game: ${bad} problems`);
process.exit(bad ? 1 : 0);
