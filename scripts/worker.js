"use strict";
const { parentPort } = require("worker_threads");
const L = require("../src/league.js");
parentPort.on("message", ({ sp, rosters }) => parentPort.postMessage(L.runGame(sp, rosters)));
