// Classic Nights rules: the daily slate, pick'em, watching rewards, witness drops, the season pass.
"use strict";
const N = require("../src/nights.js"), E = require("../src/cardeco.js");
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log("FAIL:", msg); } };

// a small league: six franchises over twenty seasons
const teams = {};
for (const id of ["AKR", "TOL", "GRY", "FLN", "YNG", "ERI"]) teams[id] = { id, hist: [] };
const seasons = []; for (let y = 1954; y < 1974; y++) seasons.push(y);
seasons.forEach((y, k) => Object.values(teams).forEach((t, i) => { const w = 25 + ((i * 7 + k * 5) % 35); t.hist.push({ season: y, w, l: 82 - w, res: (i + k) % 6 === 0 ? "Champion" : (i + k) % 6 === 1 ? "Finals" : w > 45 ? "R1" : "-", coach: i }); }));
const lg = { seasons, teams };
const cands = N.candidates(lg);

// the slate
{
  ok(cands.length === 120 && cands.every(c => c.wt > 0), "every team-season is a candidate");
  const a = N.slateFor("2026-11-18", cands), b = N.slateFor("2026-11-18", cands.slice().reverse()), c = N.slateFor("2026-11-19", cands);
  ok(a.length === 3 && b.length === 3, "three games a day");
  ok(JSON.stringify(N.slateFor("2026-11-18", cands)) === JSON.stringify(a), "the same slate for everyone that day");
  ok(JSON.stringify(c) !== JSON.stringify(a), "a new slate each day");
  let fine = true, marq = true;
  for (let d = 1; d <= 28; d++) {
    const S = N.slateFor(`2026-12-${String(d).padStart(2, "0")}`, cands), seen = new Set();
    for (const g of S) {
      if (g.home.team === g.away.team || Math.abs(g.home.season - g.away.season) < 3) fine = false;
      for (const x of [g.home, g.away]) { if (seen.has(x.team + x.season)) fine = false; seen.add(x.team + x.season); }
    }
    const m = S[2]; if (!(m.marquee && ["Champion", "Finals"].includes(m.home.res) && ["Champion", "Finals"].includes(m.away.res))) marq = false;
  }
  ok(fine, "different franchises, three or more seasons apart, no team-season twice in a day");
  ok(marq, "the late game is the marquee: champions and finalists");
  ok(a[0].id === "20261118_1" && N.dkOf("20261118") === "2026-11-18", "game ids");
  const t = N.tipTime("2026-11-18", 1);
  ok(new Date(t).getHours() === N.TIPS[1][0] && N.status("2026-11-18", 1, t - 1) === "open" && N.status("2026-11-18", 1, t) === "air" && N.status("2026-11-18", 1, t + N.FINAL_MS) === "final", "picks lock at tip-off; final 2.5 hours later");
}
// pick'em
{
  const g = N.slateFor("2026-11-18", cands)[0], t = N.tipTime(g.dk, g.i), s = E.newSave(1); s.coins = 0;
  const avg = { 1: { pts: 27.3, reb: 4, tkl: 3.1, dnk: 0.4, gp: 70 }, 2: { pts: 12, reb: 9, tkl: 1, dnk: 2, gp: 60 }, 3: { pts: 19.9, reb: 11.2, tkl: 0.5, dnk: 2.5, gp: 75 }, 4: { pts: 30, reb: 2, tkl: 0, dnk: 0, gp: 5 } };
  const props = N.propsFor(g, { home: [1, 2], away: [3, 4] }, avg);
  ok(props.length === 2 && props[0].pid === 3 && props[1].pid === 1 && props.every(p => p.line % 1 === 0.5), "props: each side's leading scorer (10+ games), half-point lines");
  ok(JSON.stringify(N.propsFor(g, { home: [1, 2], away: [3, 4] }, avg)) === JSON.stringify(props), "props are the same for everyone");
  ok(N.setPick(s, g, "w", "h", t - 1000) && N.setPick(s, g, "p0", "o", t - 1000) && N.setPick(s, g, "p1", "u", t - 1000), "picks before tip-off");
  ok(!N.setPick(s, g, "w", "a", t) && s.cn.picks[g.id].w === "h", "locked at tip-off");
  const box = { [props[0].pid]: { [props[0].stat]: props[0].line + 0.5 }, [props[1].pid]: { [props[1].stat]: props[1].line + 3.5 } };
  const r = N.gradeGame(s, g, { score: [110, 100], periods: 4, box }, props);
  ok(r.right === 2 && r.wrong === 1 && r.coins === N.WIN_PAY + N.PROP_PAY && s.coins === r.coins && s.cn.streak === 1, "winner and one prop right, one prop wrong");
  ok(N.gradeGame(s, g, { score: [90, 100], periods: 4, box }, props) === null, "graded once");
  // the streak multiplies winner picks
  s.cn.streak = 4; const g2 = N.slateFor("2026-11-18", cands)[1]; N.setPick(s, g2, "w", "a", N.tipTime(g2.dk, g2.i) - 1);
  const r2 = N.gradeGame(s, g2, { score: [99, 101], periods: 5, box: {} }, []);
  ok(r2.coins === N.WIN_PAY * 2 && s.cn.streak === 5 && s.cn.best === 5, "five in a row pays double");
  const g3 = N.slateFor("2026-11-18", cands)[2]; N.setPick(s, g3, "w", "h", N.tipTime(g3.dk, g3.i) - 1); N.gradeGame(s, g3, { score: [80, 90], periods: 4, box: {} }, []);
  ok(s.cn.streak === 0 && s.cn.best === 5, "a miss resets the streak");
  // bold calls
  const B = N.boldFor("2026-11-18");
  ok(B.length === 3 && new Set(B.map(b => b.k)).size === 3 && JSON.stringify(N.boldFor("2026-11-18")) === JSON.stringify(B), "three bold calls a day");
  ok(N.setBold(s, "2026-11-18", B[2].k, N.tipTime("2026-11-18", 0), N.tipTime("2026-11-18", 0) - 1) && !N.setBold(s, "2026-11-18", B[0].k, N.tipTime("2026-11-18", 0), N.tipTime("2026-11-18", 0)), "one bold call, locked at the first tip-off");
  const sums = [{ score: [100, 98], periods: 4, box: { 1: { pts: 41, reb: 3, ast: 2, tkl: 1, blk: 0, stl: 0 } }, eject: false, fight: false, flag: true, lastfour: false }, { score: [120, 85], periods: 5, box: {}, eject: true }];
  ok(N.boldHit("p40", sums) && !N.boldHit("p50", sums) && N.boldHit("close", sums) && N.boldHit("blowout", sums) && N.boldHit("ot", sums) && N.boldHit("eject", sums) && N.boldHit("flag", sums) && !N.boldHit("fight", sums) && !N.boldHit("td", sums), "bold calls check the day's games");
  s.cn.bold["20261118"] = "ot"; const c0 = s.coins, br = N.gradeBold(s, "2026-11-18", sums);
  ok(br.hit && s.coins === c0 + N.BBY.ot.pay && N.gradeBold(s, "2026-11-18", sums) === null, "a hit bold call pays once");
}
// watching
{
  const s = E.newSave(1); s.coins = 0;
  ok(N.addPop(s, "20261118_1", 5, "FOUR!", false) === N.POP["FOUR!"] && N.addPop(s, "20261118_1", 5, "FOUR!", false) === 0 && N.addPop(s, "20261118_1", 6, "SLAM", true) === 2 * N.POP.SLAM, "pops pay once per play; owned players double");
  for (let i = 10; i < 200; i++) N.addPop(s, "20261118_1", i, "BUZZER-BEATER!", true);
  ok(s.cn.w["20261118_1"].pops === N.POP_CAP && s.coins === N.POP_CAP, "pops cap per game");
  const f = N.finish(s, "20261118_1", { score: [101, 99], periods: 5 }, 1);
  ok(f.coins === 350 && N.finish(s, "20261118_1", { score: [101, 99], periods: 5 }, 1) === null, "the finish bonus: more for a close overtime game, paid once");
  ok(N.finishBonus({ score: [120, 90], periods: 4 }, 0.1) === Math.round(150 * 0.25), "skipping ahead pays less");
  const box = [{ pts: 22, fgm: 9, fga: 18, fta: 4, ftm: 3, oreb: 1, dreb: 6, stl: 1, ast: 4, blk: 0, tkl: 1, pf: 2, to: 2 }, { pts: 41, fgm: 15, fga: 26, fta: 9, ftm: 8, oreb: 2, dreb: 5, stl: 2, ast: 3, blk: 1, tkl: 0, pf: 3, to: 3 }];
  ok(N.witnessOf(box, 0.9) === box[1] && N.witnessOf(box, 0.5) === null && N.witnessOf([box[0]], 1) === null, "witness drops: a big night you mostly watched");
  const w = N.addWitness(s, { season: 1987, pid: 42, d: "2026-11-18", line: "41 PTS", vs: "1962 Erie", ovr: 88, team: "TOL", gs: 33, num: 7, game: "20261118_3", cp: "9" });
  ok(w.isNew && s.owned["witness:1987:42"] === 1 && s.wit["witness:1987:42"].line === "41 PTS", "the witness card lands in the collection");
  const back = E.unpackSave(E.packSave(s));
  ok(back.wit["witness:1987:42"].vs === "1962 Erie" && back.owned["witness:1987:42"] === 1 && back.cn.w["20261118_1"].fin === 1 && back.cn.bold !== undefined, "save codes keep Classic Nights and witness cards");
}
// the season pass
{
  ok(N.passIdOf(new Date(2026, 10, 18)) === "S2026" && N.passIdOf(new Date(2027, 2, 1)) === "S2026" && N.passIdOf(new Date(2027, 5, 1)) === "O2027" && N.passIdOf(new Date(2027, 9, 20)) === "S2027", "season and off-season passes");
  ok(N.passName("S2026") === "2026–27 Season Pass", "pass names");
  const s = E.newSave(1); s.coins = 0; s.tokens = {}; const now = new Date(2026, 10, 18).getTime();
  const ups = N.passGain(s, N.PASS_XP * 10 + 5, now);
  ok(ups.length === 10 && s.cn.pass.lvl === 10 && s.tokens.passx === 1 && s.tokens.premium === 1, "levels pay out, with the exclusive pack at level 10");
  ok(N.passGain(s, 0, now).length === 0 && N.passGain(s, 1e9, now).length === N.PASS_N - 10 && s.tokens.passx === 1 + 3 + 2, "level 50 tops it off");
  N.passGain(s, 10, new Date(2027, 5, 1).getTime()); ok(s.cn.pass.id === "O2027" && s.cn.pass.lvl === 0, "a new pass starts over");
  const cp = E.forceCopy("8", { par: "R", auto: true }), o = E.parseCopy(cp);
  ok(o.auto && "RKS".includes(o.par.code) && o.g === 8 && E.forceCopy("9S1", { par: "R", auto: true }) === "9S1a", "Pass Exclusive copies: Red or rarer, signed, keeping a rarer roll");
}
// pruning keeps a week
{
  const s = E.newSave(1), c = N.cnOf(s); c.picks["20261101_1"] = { w: "h" }; c.picks["20261115_2"] = { w: "a" }; c.bold["20261101"] = "ot";
  N.prune(s, "2026-11-18"); ok(!c.picks["20261101_1"] && c.picks["20261115_2"] && !c.bold["20261101"], "a week of picks is kept");
}
console.log(`classic nights: ${bad} problems`);
process.exit(bad ? 1 : 0);
