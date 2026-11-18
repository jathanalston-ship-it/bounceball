// Paired A/B test of coaching choices. The same games are played over and over with one team's plan
// forced (and locked: no in-game adjustments), and its point margin is compared. Both sides take a turn.
// Use it to keep the offensive systems, defensive schemes and tackle policies balanced against each other.
//   node test/strategy-ab.js off|def|hit [games] [season] ['{"forceHit":"blitz"}' = force the opponent too]
const L = require("../src/league.js"), E = require("../src/engine.js");
const what = process.argv[2] || "def", N = +process.argv[3] || 30, SEASON = +process.argv[4] || 1990, OPP = JSON.parse(process.argv[5] || "{}");
const opts = { off: Object.keys(E.SYSTEMS), def: Object.keys(E.SCHEMES), hit: Object.keys(E.HITS) }[what];
const key = { off: "forceSys", def: "forceScheme", hit: "forceHit" }[what];
const S = L.newLeague("ab-1", SEASON); L.startSeason(S);
const games = []; let specs;
while (games.length < N && (specs = L.nextGames(S))) {
  for (const sp of specs) if (games.length < N) games.push({ sp, R: L.rostersFor(S, sp), T: L.tacticsFor(S, sp) });
  L.applyResults(S, specs, specs.map(sp => ({ gid: sp.gid, hs: 100, as: 99, per: 4, lines: [], downs: [] })));
}
for (const o of opts) {
  if (o === "four" && SEASON < E.C.FOUR_YEAR) continue;
  let m = 0, w = 0, n = 0; const st = {}, add = (k, v) => st[k] = (st[k] || 0) + v;
  for (const g of games) for (let side = 0; side < 2; side++) {
    const T = g.T.map((x, i) => Object.assign({}, x, { lock: true }, i === side ? { [key]: o } : OPP));
    const r = E.simulateGame({ id: g.sp.home }, { id: g.sp.away }, g.R, g.sp.seed, { frames: false, tactics: T, season: g.sp.season });
    const mg = r.score[side] - r.score[1 - side]; m += mg; w += mg > 0 ? 1 : 0; n++;
    for (const x of E.boxScore(r, 1e12)) { if (x.t === side) { add("pts", x.pts); add("fpa", x.fpa); add("tkl", x.tkl); add("to", x.to); } else { add("opp", x.pts); add("ofga", x.fga); add("ofgm", x.fgm); add("oto", x.to); } }
  }
  const a = k => (st[k] / n).toFixed(1);
  console.log(`${o.padEnd(12)} margin ${(m / n >= 0 ? "+" : "") + (m / n).toFixed(2)}  win ${(w / n * 100).toFixed(0)}%  pts ${a("pts")} opp ${a("opp")} | 4PA ${a("fpa")} TKL ${a("tkl")} TO ${a("to")} | opp FG% ${(st.ofgm / st.ofga * 100).toFixed(1)} opp TO ${a("oto")}`);
}
