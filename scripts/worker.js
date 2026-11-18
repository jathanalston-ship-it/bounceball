"use strict";
const { parentPort } = require("worker_threads");
const L = require("../src/league.js");
parentPort.on("message", ({ sp, rosters, tactics }) => parentPort.postMessage(L.runGame(sp, rosters, tactics)));
