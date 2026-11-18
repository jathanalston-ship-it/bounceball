// Plays a batch of games and checks the box score always matches the scoreboard and
// a replay of the same seed is identical. Half the games are played in other eras with a v0.6 context
// (hot tempers, grudges, a rivalry, tired legs, a strict or lenient crew; v0.7: a feud, unhappy stars, a full or
// empty building) so fights, ejections and the rest of the head game get exercised too. Plus/minus must net to zero.
const E = require("../src/engine.js"), P = require("../src/players.js");
const mk = (seed, q, hot) => { const r = E.makeRng(seed); return ["PG","WING","SNIPER","BRUISER","BIG","PG","WING","WING","SNIPER","BRUISER","BRUISER","BIG","BIG"].map((role, i) => Object.assign(P.genPlayer(r, role, q, seed * 100 + i, 2026), { num: i }, hot ? { temper: 0.6 + (i % 4) * 0.12, aggr: 0.7, tough: (i % 5) / 4, streak: 0.8, clutch: (i % 3 - 1) * 0.6 } : {})); };
const ERAS = [undefined, 1960, 1975, 1999, 2015];
let bad = 0, pts = 0, n = 16, fights = 0, ej = 0;
for (let g = 0; g < n; g++) {
  const hot = g % 2 === 1, R = [mk(10 + g, 0, hot), mk(50 + g, 0, hot)];
  const opts = hot ? { season: ERAS[g % ERAS.length], ctx: { crew: [1, 2, 3], ref: { s: g % 4 === 1 ? 0.15 : 0.8, w: g % 4 === 1 ? 0.86 : 1.1, h: 0.01 }, fat: [0.06, 0.02], riv: 0.6,
    gr: [[0, 13, 1], [13, 0, 0.8], [3, 16, 0.7]], rev: [1], chem: { 2: 0.6, 15: 0.7 }, conc: { 0: 3 },
    fd: [[0, 2]], md: { 1: -0.25, 14: -0.12 }, att: g % 4 === 1 ? [3100, 9000] : [18000, 18000] } } : {}; // v0.7: a feud, unhappy stars, the crowd
  const a = E.simulateGame({ id: "H" }, { id: "A" }, R, 777 + g, Object.assign({ frames: false }, opts));
  const b = E.simulateGame({ id: "H" }, { id: "A" }, R, 777 + g, Object.assign({ frames: g % 3 === 0 }, opts)); // recording frames must not change the game
  const box = E.boxScore(a, 1e12), s = [0, 0]; box.forEach(x => s[x.t] += x.pts);
  if (s[0] !== a.score[0] || s[1] !== a.score[1]) { bad++; console.log("box mismatch", g); }
  const pm = [0, 0]; box.forEach(x => pm[x.t] += x.pm); if (pm[0] !== (a.score[0] - a.score[1]) * 5 || pm[1] !== (a.score[1] - a.score[0]) * 5) { bad++; console.log("plus/minus doesn't add up", g, pm, a.score); }
  if (a.score.join() !== b.score.join() || a.events.length !== b.events.length) { bad++; console.log("replay mismatch", g); }
  // nobody ejected or hurt comes back on the floor
  const gone = new Map(); for (const e of a.events) { if (e.type === "ejected" || e.type === "injury") gone.set(e.pid, e.tk); }
  for (const e of a.events) if ((e.type === "fga" || e.type === "ast") && gone.has(e.pid) && e.tk > gone.get(e.pid) + 200) { bad++; console.log("ejected/injured player back in", g, e.pid); break; }
  fights += a.events.filter(e => e.type === "fight").length; ej += a.events.filter(e => e.type === "ejected").length;
  pts += a.score[0] + a.score[1];
}
console.log(`${n} games, avg ${(pts / n / 2).toFixed(1)} pts/team, ${fights} fights, ${ej} ejections, ${bad} problems`);
process.exit(bad ? 1 : 0);
