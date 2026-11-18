// League-wide box score averages from realistic rosters and coach tactics. Used to calibrate the engine.
const L = require("../src/league.js"), E = require("../src/engine.js");
const N = +process.argv[2] || 16;
const S = L.newLeague("stats-" + (process.argv[3] || 1), 1954);
L.startSeason(S);
const tot = {}, ev = {}; let games = 0, pts = [], ticks = 0, actCount = {};
let specs, t0 = Date.now();
outer: while ((specs = L.nextGames(S))) {
  for (const sp of specs) {
    const g = E.simulateGame({ id: sp.home }, { id: sp.away }, L.rostersFor(S, sp), sp.seed, { frames: games < 2, tactics: L.tacticsFor(S, sp) });
    if (g.frames.length) for (let f = 0; f < g.nFrames; f++) for (let k = 0; k < 10; k++) { const a = g.frames[f * E.C.FS + k * 8 + 6]; actCount[a] = (actCount[a] || 0) + 1; }
    const box = E.boxScore(g, 1e12);
    for (const b of box) for (const k in b) if (typeof b[k] === "number" && k !== "idx" && k !== "t") tot[k] = (tot[k] || 0) + b[k];
    for (const e of g.events) { const k = e.type + (e.result ? ":" + e.result : "") + (e.kind ? ":" + e.kind : ""); ev[k] = (ev[k] || 0) + 1; }
    pts.push(g.score[0], g.score[1]); ticks += g.ticks; games++;
    if (games >= N) break outer;
  }
  L.applyResults(S, specs, specs.map(sp => ({ gid: sp.gid, hs: 100, as: 99, per: 4, lines: [], downs: [] })));
}
const per = k => (tot[k] / games / 2).toFixed(1), pc = (a, b) => (tot[a] / tot[b] * 100).toFixed(1);
console.log(`${games} games, ${((Date.now() - t0) / games).toFixed(0)} ms/game`);
console.log(`PTS ${(pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1)} (min ${Math.min(...pts)} max ${Math.max(...pts)}) FGA ${per("fga")} FG% ${pc("fgm", "fga")} 3PA ${per("tpa")} 3P% ${pc("tpm", "tpa")} 4PA ${per("fpa")} 4P% ${pc("fpm", "fpa")} FTA ${per("fta")} FT% ${pc("ftm", "fta")}`);
console.log(`AST ${per("ast")} REB ${(tot.oreb / games / 2 + tot.dreb / games / 2).toFixed(1)} OREB ${per("oreb")} TO ${per("to")} STL ${per("stl")} BLK ${per("blk")} TKL ${per("tkl")} PF ${per("pf")}`);
const pg = k => ((ev[k] || 0) / games).toFixed(2);
console.log(`per game: timeouts ${pg("timeout")} tackles down ${pg("tackle:down")} broken ${pg("tackle:broken")} whiff ${pg("tackle:whiff")} late ${pg("tackle:late")} goaltend ${pg("violation:goaltend")} cylinder ${pg("violation:cylinder")} shotclock ${pg("violation:shotclock")}`);
const ACTN = Object.fromEntries(Object.entries(E.ACT).map(([k, v]) => [v, k]));
const totA = Object.values(actCount).reduce((a, b) => a + b, 0);
console.log("action mix:", Object.entries(actCount).sort((a, b) => b[1] - a[1]).map(([a, c]) => ACTN[a] + " " + (c / totA * 100).toFixed(1) + "%").join(", "));
