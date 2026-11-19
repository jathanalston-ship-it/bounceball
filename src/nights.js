// ===================== CLASSIC NIGHTS: a daily slate of exhibitions between historic teams =====================
// Rules only (no DOM), so they can be tested in Node. Each real day has three games between team-seasons
// from the league's history, seeded by the date, tipping off at fixed local times. The viewer
// (site/nights.js) simulates each game with the real engine when it airs, so nobody knows the result
// before then. Around the games: pick'em (winners with a streak, player props, one bold call a day),
// coins for watching (big plays, more for players you own, and a bonus for watching to the end),
// witness drops (a one-off card for a big night you watched), and a free season pass.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const ECO = NODE ? require("./cardeco.js") : window.BB.ECO;
const hashStr = ECO.hashStr;
const rngOf = str => { let h = hashStr(str); return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }; };

// ---------- the slate ----------
const TIPS = [[12, 0], [17, 0], [20, 0]];           // local tip-off times; the last game is the marquee
const FINAL_MS = 2.5 * 36e5;                         // a game is final (and graded) this long after tip-off
const compact = dk => dk.replace(/-/g, "");
const dkOf = id => `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}`;
// every team-season in the record, weighted toward good teams (champions most of all)
function candidates(lg) {
  const have = new Set(lg.seasons), out = [];
  for (const t of Object.values(lg.teams || {})) for (const h of t.hist || []) {
    if (!have.has(h.season) || !(h.w + h.l)) continue;
    const pct = h.w / (h.w + h.l), res = h.res || "-";
    const wt = (res === "Champion" ? 5 : res === "Finals" ? 3 : res === "-" ? 0.7 : 1.5) * (0.35 + pct);
    out.push({ team: t.id, season: h.season, w: h.w, l: h.l, pct, res, coach: h.coach, wt });
  }
  return out;
}
// three games for a day: different franchises, at least three seasons apart, similar strength
function slateFor(dk, cands) {
  const R = rngOf("nights:" + dk), used = new Set(), out = [];
  const draw = f => {
    const pool = cands.filter(c => !used.has(c.team + c.season) && f(c)); if (!pool.length) return null;
    let r = R() * pool.reduce((s, c) => s + c.wt, 0); for (const c of pool) { r -= c.wt; if (r <= 0) return c; } return pool[pool.length - 1];
  };
  for (let i = 0; i < TIPS.length; i++) {
    const marquee = i === TIPS.length - 1;
    let a = draw(c => !marquee || c.res === "Champion" || c.res === "Finals") || draw(() => true); if (!a) break; used.add(a.team + a.season);
    const near = c => c.team !== a.team && Math.abs(c.season - a.season) >= 3;
    let b = draw(c => near(c) && Math.abs(c.pct - a.pct) <= 0.1 && (!marquee || c.res === "Champion" || c.res === "Finals")) || draw(c => near(c) && Math.abs(c.pct - a.pct) <= 0.15) || draw(near) || draw(c => c.team !== a.team);
    if (!b) break; used.add(b.team + b.season);
    if (R() < 0.5) [a, b] = [b, a];
    out.push({ i, id: compact(dk) + "_" + (i + 1), dk, home: a, away: b, tip: TIPS[i], seed: hashStr("cn:" + dk + ":" + i), marquee });
  }
  return out;
}
function tipTime(dk, i) { const [y, m, d] = dk.split("-").map(Number); return new Date(y, m - 1, d, TIPS[i][0], TIPS[i][1]).getTime(); }
// "open" (picks allowed), "air" (on now: watch it), "final" (graded even if nobody watched)
function status(dk, i, now) { const t = tipTime(dk, i); return now < t ? "open" : now < t + FINAL_MS ? "air" : "final"; }

// ---------- pick'em ----------
// Winners: 150 coins, times the streak of correct winner picks in a row. Props: 100. One bold call a day.
const WIN_PAY = 150, PROP_PAY = 100;
const streakX = n => n >= 10 ? 3 : n >= 5 ? 2 : n >= 3 ? 1.5 : 1;
// props for a game: each team's leading scorer, on the stat he's best known for. avg: { pid: { pts, reb, tkl, dnk, gp } }
// side: { home: [pid...], away: [pid...] } (the dressed rosters)
const PROP_STATS = [["pts", "points", 0], ["reb", "rebounds", 7], ["tkl", "tackles", 2.5], ["dnk", "dunks", 1.2]];
function propsFor(game, side, avg) {
  const R = rngOf("props:" + game.id), out = [];
  for (const t of ["away", "home"]) {
    const ids = (side[t] || []).filter(id => avg[id] && avg[id].gp >= 10).sort((a, b) => avg[b].pts - avg[a].pts); if (!ids.length) continue;
    const pid = ids[0], A = avg[pid], opts = PROP_STATS.filter(([k, , min]) => k === "pts" || A[k] >= min), [k, name] = opts[Math.floor(R() * opts.length)];
    out.push({ pid, t, stat: k, name, line: Math.max(0.5, Math.floor(A[k]) + 0.5) });
  }
  return out;
}
// bold calls: things the engine can produce, paid by how rarely they happen on a three-game day
const BOLD = [
  { k: "flag", text: "A flagrant foul", pay: 350 },
  { k: "blowout", text: "A 30-point blowout", pay: 450 },
  { k: "eject", text: "Someone gets ejected", pay: 550 },
  { k: "fight", text: "A fight breaks out", pay: 600 },
  { k: "p40", text: "Someone scores 40", pay: 600 },
  { k: "td", text: "A triple-double", pay: 800 },
  { k: "lastfour", text: "A four-pointer in the last minute", pay: 950 },
  { k: "close", text: "A game decided by 2 or fewer", pay: 950 },
  { k: "p50", text: "Someone scores 50", pay: 2200 },
  { k: "tkl6", text: "One player makes 6 tackles", pay: 2200 },
  { k: "ot", text: "A game goes to overtime", pay: 3000 }
];
const BBY = Object.fromEntries(BOLD.map(b => [b.k, b]));
function boldFor(dk) { const R = rngOf("bold:" + dk), pool = BOLD.slice(), out = []; while (out.length < 3) out.push(pool.splice(Math.floor(R() * pool.length), 1)[0]); return out.sort((a, b) => a.pay - b.pay); }
// a finished game, boiled down for grading (built in the viewer from the engine's result)
// sum: { score: [h, a], periods, box: { pid: { pts, reb, ast, tkl, dnk, blk, stl } }, eject, fight, flag, lastfour }
function boldHit(k, sums) {
  return sums.some(s => {
    const B = Object.values(s.box), M = Math.abs(s.score[0] - s.score[1]);
    switch (k) {
      case "ot": return s.periods > 4; case "eject": return s.eject; case "fight": return s.fight; case "flag": return s.flag; case "lastfour": return s.lastfour;
      case "p40": return B.some(x => x.pts >= 40); case "p50": return B.some(x => x.pts >= 50); case "tkl6": return B.some(x => x.tkl >= 6);
      case "td": return B.some(x => [x.pts, x.reb, x.ast, x.tkl, x.blk, x.stl].filter(v => v >= 10).length >= 3);
      case "close": return M <= 2; case "blowout": return M >= 30;
    }
    return false;
  });
}

// ---------- the save: s.cn ----------
function cnOf(s) {
  if (!s.cn || typeof s.cn !== "object") s.cn = {};
  const c = s.cn; c.picks = c.picks || {}; c.bold = c.bold || {}; c.res = c.res || {}; c.bres = c.bres || {}; c.w = c.w || {};
  c.streak = c.streak || 0; c.best = c.best || 0; c.pass = c.pass || { id: "", xp: 0, lvl: 0 };
  return c;
}
// keep a week of history
function prune(s, todayDk) {
  const c = cnOf(s), t = new Date(todayDk + "T12:00:00"), keep = id => (t - new Date(dkOf(id.slice(0, 8)) + "T12:00:00")) / 864e5 <= 7;
  for (const m of [c.picks, c.res, c.w, c.bold, c.bres]) for (const k of Object.keys(m)) if (!keep(k)) delete m[k];
}
function setPick(s, game, what, val, now) {
  if (status(game.dk, game.i, now) !== "open") return false;
  const c = cnOf(s), P = c.picks[game.id] || (c.picks[game.id] = {});
  if (what === "w") P.w = val === "h" || val === "a" ? val : undefined;
  else if (/^p[01]$/.test(what)) P[what] = val === "o" || val === "u" ? val : undefined;
  return true;
}
function setBold(s, dk, k, firstTip, now) { if (now >= firstTip || !BBY[k]) return false; cnOf(s).bold[compact(dk)] = k; return true; }
// grades one game's picks; props are the ones shown for that game. Returns what it paid.
function gradeGame(s, game, sum, props) {
  const c = cnOf(s); if (c.res[game.id]) return null;
  const P = c.picks[game.id] || {}, won = sum.score[0] > sum.score[1] ? "h" : "a", out = { id: game.id, won, coins: 0, right: 0, wrong: 0, lines: [] };
  if (P.w) {
    if (P.w === won) { c.streak++; c.best = Math.max(c.best, c.streak); const pay = Math.round(WIN_PAY * streakX(c.streak)); out.coins += pay; out.right++; out.lines.push({ k: "w", ok: true, pay, streak: c.streak }); }
    else { c.streak = 0; out.wrong++; out.lines.push({ k: "w", ok: false }); }
  }
  (props || []).forEach((p, j) => {
    const v = P["p" + j]; if (!v) return; const x = sum.box[p.pid], got = x ? x[p.stat] || 0 : 0, ok = v === "o" ? got > p.line : got < p.line;
    if (ok) { out.coins += PROP_PAY; out.right++; } else out.wrong++;
    out.lines.push({ k: "p" + j, ok, pay: ok ? PROP_PAY : 0, got, line: p.line, stat: p.stat, pid: p.pid });
  });
  s.coins += out.coins; c.res[game.id] = { coins: out.coins, right: out.right, wrong: out.wrong, won, score: sum.score, per: sum.periods };
  return out;
}
function gradeBold(s, dk, sums) {
  const c = cnOf(s), id = compact(dk); if (c.bres[id] || !c.bold[id]) return null;
  const k = c.bold[id], hit = boldHit(k, sums), pay = hit ? BBY[k].pay : 0; s.coins += pay; c.bres[id] = { k, hit, pay }; return c.bres[id];
}

// ---------- watching: coins for big plays, a bonus for watching to the end, witness drops ----------
// pops are keyed by the broadcast's highlight labels; owned players pay double; at most POP_CAP a game
// (a full game pays about 400 before the cap: with the finish bonus, a watched game is worth about a Standard pack)
const POP = { "SLAM": 3, "FOUR!": 6, "SWAT!": 5, "REJECTED": 3, "BIG HIT!": 5, "GANG TACKLE!": 2, "TACKLE!": 2, "DIVING TACKLE!": 4, "POPPED LOOSE!": 5, "FUMBLE!": 4, "ALLEY-OOP!": 5,
  "BUZZER-BEATER!": 25, "GO-AHEAD": 8, "LEAD CHANGE": 5, "JUKE!": 4, "SPIN MOVE!": 4, "STIFF-ARM!": 5, "HURDLE!": 8 };
const POP_CAP = 250, OWN_X = 2;
function popValue(label, owned) { const v = POP[label]; return v ? v * (owned ? OWN_X : 1) : 0; }
// w: c.w[id] = { pops, paid: [event indices], fin, frac }
function watchOf(s, id) { const c = cnOf(s); return c.w[id] || (c.w[id] = { pops: 0, paid: [], fin: 0 }); }
function addPop(s, id, ei, label, owned) {
  const w = watchOf(s, id); if (w.paid.includes(ei) || w.pops >= POP_CAP) return 0;
  const v = Math.min(POP_CAP - w.pops, popValue(label, owned)); if (!v) return 0;
  w.paid.push(ei); w.pops += v; s.coins += v; return v;
}
// the bonus for reaching the final buzzer: more for close games and overtime, less for skipping ahead
function finishBonus(sum, frac) {
  const M = Math.abs(sum.score[0] - sum.score[1]), base = 150 + (M <= 5 ? 100 : 0) + (sum.periods > 4 ? 100 : 0);
  return Math.round(base * Math.max(0.25, Math.min(1, frac)));
}
function finish(s, id, sum, frac) {
  const w = watchOf(s, id); if (w.fin) return null;
  const coins = finishBonus(sum, frac); w.fin = 1; w.frac = Math.round(frac * 100) / 100; s.coins += coins; return { coins };
}
// a witness drop: the night's best performance, if it was a big one and you watched most of it
const gsc = x => x.pts + 0.4 * x.fgm - 0.7 * x.fga - 0.4 * (x.fta - x.ftm) + 0.7 * x.oreb + 0.3 * x.dreb + x.stl + 0.7 * x.ast + 0.7 * x.blk + 1.2 * x.tkl - 0.4 * x.pf - x.to;
function witnessOf(box, frac) {
  if (frac < 0.6) return null;
  const top = box.slice().sort((a, b) => gsc(b) - gsc(a))[0]; if (!top) return null;
  const reb = top.oreb + top.dreb, td = [top.pts, reb, top.ast, top.tkl, top.blk, top.stl].filter(v => v >= 10).length >= 3;
  return gsc(top) >= 27 || top.pts >= 40 || td || top.tkl >= 6 ? top : null;
}
// the witness card: a one-off card of that night, kept in s.wit (the card index doesn't have it)
function addWitness(s, w) {
  const key = `witness:${w.season}:${w.pid}`, prev = (s.wit || {})[key];
  s.wit = s.wit || {};
  if (!prev || w.gs > prev.gs) s.wit[key] = { d: w.d, line: w.line, vs: w.vs, ovr: Math.min(99, w.ovr), team: w.team, gs: Math.round(w.gs * 10) / 10, num: w.num, game: w.game };
  const isNew = ECO.addCopy(s, key, w.cp || ECO.rollCopy()); s.cards++;
  return { key, isNew };
}
function lineOf(x) {
  const reb = x.oreb + x.dreb, parts = [`${x.pts} PTS`];
  if (reb >= 8) parts.push(`${reb} REB`); if (x.ast >= 7) parts.push(`${x.ast} AST`); if (x.tkl >= 3) parts.push(`${x.tkl} TKL`); if (x.dnk >= 4) parts.push(`${x.dnk} DNK`); if (x.blk >= 4) parts.push(`${x.blk} BLK`);
  return parts.slice(0, 3).join(" · ");
}

// ---------- the season pass: a free track that resets with the league calendar ----------
// The season runs October 20 to April 15; the rest of the year is the off-season pass.
function passIdOf(d) {
  const y = d.getFullYear(), md = (d.getMonth() + 1) * 100 + d.getDate();
  return md >= 1020 ? `S${y}` : md <= 415 ? `S${y - 1}` : `O${y}`;
}
function passName(id) { const y = +id.slice(1); return id[0] === "S" ? `${y}–${String(y + 1).slice(2)} Season Pass` : `${y} Off-season Pass`; }
const PASS_N = 50, PASS_XP = 300;
const PASS_GAIN = { finish: 120, close: 40, pick: 15, right: 35, pack: 10, witness: 60, daily: 20, bold: 150 };
function passReward(L) {
  if (L === PASS_N) return { coins: 3000, tokens: { passx: 2, legends: 1 } };
  if (L % 10 === 0) return { coins: 500, tokens: { passx: 1 } };
  if (L % 5 === 0) return { coins: 300, tokens: { premium: 1 } };
  if (L % 2 === 0) return { coins: 150 + 10 * L, tokens: {} };
  return { coins: 0, tokens: L % 3 === 0 ? { pick: 1 } : { standard: 1 } };
}
function passEnsure(s, now) { const c = cnOf(s), id = passIdOf(new Date(now)); if (c.pass.id !== id) c.pass = { id, xp: 0, lvl: 0 }; return c.pass; }
function passLevel(xp) { return Math.min(PASS_N, Math.floor((xp || 0) / PASS_XP)); }
// adds pass XP and pays every level reached; returns the levels
function passGain(s, n, now) {
  const p = passEnsure(s, now); p.xp += Math.max(0, Math.round(n)); const L = passLevel(p.xp), ups = [];
  for (let k = p.lvl + 1; k <= L; k++) { const r = passReward(k); s.coins += r.coins; ECO.addTokens(s, r.tokens); ups.push({ L: k, reward: r }); }
  p.lvl = Math.max(p.lvl, L); return ups;
}

const API = { TIPS, FINAL_MS, compact, dkOf, candidates, slateFor, tipTime, status, WIN_PAY, PROP_PAY, streakX, propsFor, BOLD, BBY, boldFor, boldHit,
  cnOf, prune, setPick, setBold, gradeGame, gradeBold, POP, POP_CAP, OWN_X, popValue, watchOf, addPop, finishBonus, finish, witnessOf, addWitness, lineOf, gsc,
  passIdOf, passName, PASS_N, PASS_XP, PASS_GAIN, passReward, passEnsure, passLevel, passGain };
if (NODE) module.exports = API;
else window.BB = Object.assign(window.BB || {}, { NIGHTS: API });
})();
