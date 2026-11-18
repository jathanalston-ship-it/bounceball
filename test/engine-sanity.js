// Plays a batch of games and checks the box score always matches the scoreboard and
// a replay of the same seed is identical.
const E = require("../src/engine.js"), P = require("../src/players.js");
const mk = (seed, q) => { const r = E.makeRng(seed); return ["PG","WING","SNIPER","BRUISER","BIG","PG","WING","WING","SNIPER","BRUISER","BRUISER","BIG","BIG"].map((role, i) => Object.assign(P.genPlayer(r, role, q, seed * 100 + i, 2026), { num: i })); };
let bad = 0, pts = 0, n = 12;
for (let g = 0; g < n; g++) {
  const R = [mk(10 + g, 0), mk(50 + g, 0)];
  const a = E.simulateGame({ id: "H" }, { id: "A" }, R, 777 + g, { frames: false });
  const b = E.simulateGame({ id: "H" }, { id: "A" }, R, 777 + g, { frames: g % 3 === 0 }); // recording frames must not change the game
  const box = E.boxScore(a, 1e12), s = [0, 0]; box.forEach(x => s[x.t] += x.pts);
  if (s[0] !== a.score[0] || s[1] !== a.score[1]) { bad++; console.log("box mismatch", g); }
  if (a.score.join() !== b.score.join() || a.events.length !== b.events.length) { bad++; console.log("replay mismatch", g); }
  pts += a.score[0] + a.score[1];
}
console.log(`${n} games, avg ${(pts / n / 2).toFixed(1)} pts/team, ${bad} problems`);
process.exit(bad ? 1 : 0);
