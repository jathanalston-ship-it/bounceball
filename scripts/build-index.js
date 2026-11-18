#!/usr/bin/env node
// Builds derived lookup files for the viewer from the season files (never edited by hand).
"use strict";
const fs = require("fs"), path = require("path");
const OUT = path.resolve(process.argv[2] || "data");
const lg = JSON.parse(fs.readFileSync(path.join(OUT, "league.json"), "utf8"));
const lines = {}, plines = {};
for (const y of lg.seasons) {
  const S = JSON.parse(fs.readFileSync(path.join(OUT, "seasons", y + ".json"), "utf8"));
  for (const [id, a] of Object.entries(S.stats)) (lines[id] = lines[id] || []).push([y].concat(a));
  for (const [id, a] of Object.entries(S.pstats)) if (a[1]) (plines[id] = plines[id] || []).push([y].concat(a));
}
fs.mkdirSync(path.join(OUT, "index"), { recursive: true });
fs.writeFileSync(path.join(OUT, "index", "player-seasons.json"), JSON.stringify({ keys: ["season", "team"].concat(JSON.parse(fs.readFileSync(path.join(OUT, "seasons", lg.seasons[0] + ".json"), "utf8")).statKeys), regular: lines, playoffs: plines }));
console.log(`indexed ${Object.keys(lines).length} players across ${lg.seasons.length} seasons`);
