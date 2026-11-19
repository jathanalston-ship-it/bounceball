// League-wide box score averages from realistic rosters and coach gameplans. Used to calibrate the engine.
//   node test/stats.js [games] [seed] [season]
// Also breaks results down by offensive system, defensive scheme and tackle policy, to check that
// coaching choices actually change how games are played.
const L = require("../src/league.js"), E = require("../src/engine.js");
const N = +process.argv[2] || 16, SEASON = +process.argv[4] || 1990;
const S = L.newLeague("stats-" + (process.argv[3] || 1), SEASON);
L.startSeason(S);
const tot = {}, ev = {}; let games = 0, pts = [], ticks = 0, actCount = {};
const by = { off: {}, def: {}, hit: {} }, adj = {}, ptp = {};
const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
let specs, t0 = Date.now();
outer: while ((specs = L.nextGames(S))) {
  for (const sp of specs) {
    const g = E.simulateGame({ id: sp.home }, { id: sp.away }, L.rostersFor(S, sp), sp.seed, { frames: games < 2, tactics: L.tacticsFor(S, sp), season: sp.season, ctx: sp.ctx });
    if (g.frames.length) for (let f = 0; f < g.nFrames; f++) for (let k = 0; k < 10; k++) { const a = g.frames[f * E.C.FS + k * 8 + 6]; actCount[a] = (actCount[a] || 0) + 1; }
    const box = E.boxScore(g, 1e12), rep = E.strategyReport(g);
    for (const b of box) for (const k in b) if (typeof b[k] === "number" && k !== "idx" && k !== "t") tot[k] = (tot[k] || 0) + b[k];
    for (const e of g.events) { const k = e.type + (e.result ? ":" + e.result : "") + (e.kind ? ":" + e.kind : ""); ev[k] = (ev[k] || 0) + 1; if (e.type === "adjust") add(adj, e.key + "→" + e.to + " (" + e.why + ")", 1); }
    for (let t = 0; t < 2; t++) {
      const R = rep[t], O = rep[1 - t], pl = R.plan, tb = box.filter(b => b.t === t), ob = box.filter(b => b.t !== t);
      const sum = (a, k) => a.reduce((s, b) => s + b[k], 0);
      const row = { n: 1, pts: g.score[t], opp: g.score[1 - t], win: g.score[t] > g.score[1 - t] ? 1 : 0, fpa: sum(tb, "fpa"), tpa: sum(tb, "tpa"), fta: sum(tb, "fta"), ast: sum(tb, "ast"), oreb: sum(tb, "oreb"), to: sum(tb, "to"),
        oppFpa: sum(ob, "fpa"), oppFg: sum(ob, "fgm") / Math.max(1, sum(ob, "fga")), tkl: sum(tb, "tkl"), pf: sum(tb, "pf"), lob: R.pts.lob || 0, trans: R.pts.trans || 0, post: R.pts.post || 0,
        pnr: R.calls.pnr || 0, iso: R.calls.iso || 0, blk: sum(tb, "blk"), broken: R.tk.broken, hitF: R.tk.late + R.tk.rough, oppTk: O.tk.down + O.tk.fumble, gang: R.tk.gang, dbl: R.calls.double || 0 };
      for (const [grp, key] of [["off", pl.off], ["def", pl.def], ["hit", pl.hit]]) { const o = by[grp][key] || (by[grp][key] = {}); for (const k in row) add(o, k, row[k]); }
      for (const k in R.pts) add(ptp, k, R.pts[k]);
    }
    pts.push(g.score[0], g.score[1]); ticks += g.ticks; games++;
    if (games >= N) break outer;
  }
  L.applyResults(S, specs, specs.map(sp => ({ gid: sp.gid, hs: 100, as: 99, per: 4, lines: [], downs: [] })));
}
const per = k => (tot[k] / games / 2).toFixed(1), pc = (a, b) => (tot[a] / tot[b] * 100).toFixed(1);
console.log(`${SEASON}: ${games} games, ${((Date.now() - t0) / games).toFixed(0)} ms/game`);
console.log(`PTS ${(pts.reduce((a, b) => a + b, 0) / pts.length).toFixed(1)} (min ${Math.min(...pts)} max ${Math.max(...pts)}) FGA ${per("fga")} FG% ${pc("fgm", "fga")} 3PA ${per("tpa")} 3P% ${pc("tpm", "tpa")} 4PA ${per("fpa")} 4P% ${pc("fpm", "fpa")} FTA ${per("fta")} FT% ${pc("ftm", "fta")}`);
console.log(`AST ${per("ast")} REB ${(tot.oreb / games / 2 + tot.dreb / games / 2).toFixed(1)} OREB ${per("oreb")} TO ${per("to")} STL ${per("stl")} BLK ${per("blk")} TKL ${per("tkl")} PF ${per("pf")}`);
const pg = k => ((ev[k] || 0) / games).toFixed(2);
console.log(`per game: timeouts ${pg("timeout")} tackles down ${pg("tackle:down")} fumble ${pg("tackle:fumble")} broken ${pg("tackle:broken")} whiff ${pg("tackle:whiff")} late ${pg("tackle:late")} rough ${pg("tackle:rough")} goaltend ${pg("violation:goaltend")} cylinder ${pg("violation:cylinder")} shotclock ${pg("violation:shotclock")}`);
console.log(`calls per game: pnr ${pg("call:pnr")} iso ${pg("call:iso")} post ${pg("call:post")} double ${pg("call:double")} int.foul ${pg("foul:intentional")} hack ${pg("foul:hack")} moving ${pg("foul:moving")} adjustments ${pg("adjust")} subs ${pg("sub")}`);
const ptot = Object.values(ptp).reduce((a, b) => a + b, 0);
console.log("points by play type:", Object.entries(ptp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / ptot * 100).toFixed(1)}%`).join(", "));
for (const grp of ["off", "def", "hit"]) {
  console.log(`-- by ${grp}:`);
  for (const [k, o] of Object.entries(by[grp]).sort((a, b) => b[1].n - a[1].n)) {
    const a = x => (o[x] / o.n).toFixed(1);
    console.log(`  ${k.padEnd(12)} n=${String(o.n).padStart(3)} win ${(o.win / o.n * 100).toFixed(0)}% pts ${a("pts")} opp ${a("opp")} | 4PA ${a("fpa")} 3PA ${a("tpa")} FTA ${a("fta")} AST ${a("ast")} OREB ${a("oreb")} TO ${a("to")} | lob ${a("lob")} trans ${a("trans")} post ${a("post")} pnr ${a("pnr")} iso ${a("iso")} | oppFG ${(o.oppFg / o.n * 100).toFixed(1)} opp4PA ${a("oppFpa")} BLK ${a("blk")} TKL ${a("tkl")} brk ${a("broken")} hitF ${a("hitF")} gang ${a("gang")} dbl ${a("dbl")}`);
  }
}
console.log("adjustments:", Object.entries(adj).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(", "));
const ACTN = Object.fromEntries(Object.entries(E.ACT).map(([k, v]) => [v, k]));
const totA = Object.values(actCount).reduce((a, b) => a + b, 0);
console.log("action mix:", Object.entries(actCount).sort((a, b) => b[1] - a[1]).map(([a, c]) => ACTN[a] + " " + (c / totA * 100).toFixed(1) + "%").join(", "));
