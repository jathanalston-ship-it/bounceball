#!/usr/bin/env node
// Plays the league's history season by season through the real game engine.
// Resumable: state is checkpointed after every season, so a run can stop (time limit, crash)
// and pick up where it left off. Results are deterministic for a given --seed regardless
// of how many workers are used.
//
//   node scripts/sim-history.js --seed canon-1 --to 2025 --out data --workers 4 --max-minutes 330
"use strict";
const fs = require("fs"), path = require("path"), os = require("os");
const { Worker } = require("worker_threads");
const L = require("../src/league.js");
const P = require("../src/players.js");
const T = require("../src/teams.js");

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => { if (x.startsWith("--")) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]); return a; }, []));
const OUT = path.resolve(args.out || "data");
const TO = +(args.to || 2025);
const SEED = String(args.seed || "canon-1");
const WORKERS = +(args.workers || Math.max(1, os.cpus().length));
const MAX_MIN = +(args["max-minutes"] || 1e9);
const t0 = Date.now();

fs.mkdirSync(path.join(OUT, "seasons"), { recursive: true });
const statePath = path.join(OUT, "state.json");

class Pool {
  constructor(n) {
    this.workers = []; this.queue = []; this.idle = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(path.join(__dirname, "worker.js"));
      w.on("message", m => { const job = w.job; w.job = null; this.idle.push(w); job.resolve(m); this.pump(); });
      w.on("error", e => { console.error(e); process.exit(1); });
      this.workers.push(w); this.idle.push(w);
    }
  }
  run(msg) { return new Promise(resolve => { this.queue.push({ msg, resolve }); this.pump(); }); }
  pump() { while (this.idle.length && this.queue.length) { const w = this.idle.pop(), job = this.queue.shift(); w.job = job; w.postMessage(job.msg); } }
  close() { for (const w of this.workers) w.terminate(); }
}

function writeJSON(file, obj) { fs.writeFileSync(file + ".tmp", JSON.stringify(obj)); fs.renameSync(file + ".tmp", file); }
function name(S, id) { const p = S.players[id]; return p ? p.first + " " + p.last : null; }

function writeSummaries(S) {
  const players = {};
  for (const p of Object.values(S.players)) {
    if (!p.career && !p.team && !p.hof) continue; // never played: skip
    players[p.id] = { id: p.id, name: p.first + " " + p.last, role: p.role, ht: p.ht, wt: p.wt, born: p.born, num: p.num, team: p.team, teams: p.teams,
      ovr: p.ovr, r: p.retired ? undefined : p.r, tier: p.tier, draft: p.draft, retired: p.retired, hof: p.hof, awards: p.awards, career: p.career,
      contract: p.contract, injury: p.injury };
  }
  writeJSON(path.join(OUT, "players.json"), players);
  const teams = {};
  for (const info of T.TEAMS) { const t = S.teams[info.id]; if (t) teams[info.id] = Object.assign({}, info, { roster: t.roster, hist: t.hist, titles: t.titles, payroll: L.payroll(S, info.id) }); }
  writeJSON(path.join(OUT, "league.json"), {
    seed: S.masterSeed, nextSeason: S.season, leagueVersion: L.LEAGUE_VERSION, engineVersion: S.engineVersion,
    seasons: S.champions.map(c => c.season), champions: S.champions.map(c => Object.assign({}, c, { fmvpName: name(S, c.fmvp), mvpName: name(S, c.mvp) })),
    hof: S.hofClasses.map(h => ({ season: h.season, inductees: h.inductees.map(id => ({ id, name: name(S, id) })) })), teams
  });
}

async function main() {
  let S;
  if (fs.existsSync(statePath) && !args.fresh) { S = JSON.parse(fs.readFileSync(statePath, "utf8")); console.log(`resuming at ${S.season} (seed ${S.masterSeed})`); }
  else { S = L.newLeague(SEED, 1954); console.log(`new league, seed ${SEED}`); }
  const pool = new Pool(WORKERS);
  while (S.season <= TO) {
    if ((Date.now() - t0) / 60000 > MAX_MIN) { console.log(`time budget reached; paused before ${S.season}`); break; }
    const ts = Date.now();
    L.startSeason(S);
    let specs, ngames = 0;
    while ((specs = L.nextGames(S))) {
      const results = await Promise.all(specs.map(sp => pool.run({ sp, rosters: L.rostersFor(S, sp) })));
      L.applyResults(S, specs, results); ngames += specs.length;
    }
    const aw = L.finishSeason(S);
    writeJSON(path.join(OUT, "seasons", S.season + ".json"), L.exportSeason(S));
    const season = S.season;
    const off = L.offseason(S);
    writeJSON(statePath, S);
    writeSummaries(S);
    const ch = T.TEAMS.find(t => t.id === aw.champion);
    console.log(`${season}: ${ngames} games in ${((Date.now() - ts) / 1000).toFixed(0)}s · champion ${ch.city} ${ch.name} · MVP ${name(S, aw.mvp)}${off.inducted.length ? " · HOF: " + off.inducted.map(id => name(S, id)).join(", ") : ""}`);
  }
  pool.close();
}
main().catch(e => { console.error(e); process.exit(1); });
