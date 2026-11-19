// ===================== THE LINEUP GAME: your cards against the league's history =====================
// Rules only (no DOM), so they can be tested in Node. You build a lineup of 8 to 10 cards you own (real
// roles: a ball handler, two wings, two bigs), and it plays on the cards' own ratings (era-relative, with
// each card's collection boost). Chemistry comes from shared teams, seasons and eras; three or more cards
// from one collection add that collection's boost to everyone. Opponents: a ladder of 30 historic
// team-seasons, weakest to greatest, and three weekly challenges with rules. Games are simulated by the
// real engine on the opponent's floor under its season's rules, and can be watched in the 3D broadcast.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const ECO = NODE ? require("./cardeco.js") : window.BB.ECO;
const CC = NODE ? require("./cards.js") : window.BB.CARDS;
const hashStr = ECO.hashStr;
const rngOf = str => { let h = hashStr(str); return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }; };

// ---------- the lineup: 8 to 10 players, real roles ----------
const MIN_N = 8, MAX_N = 10;
const GROUP = { PG: "g", WING: "w", SNIPER: "w", BRUISER: "b", BIG: "b" };
const GROUP_NAME = { g: "ball handler", w: "wing", b: "big" };
const NEED = { g: 1, w: 2, b: 2 };
// cards: [{ key, pid, role, team, season, col, ovr }]
function check(cards) {
  const out = [], n = cards.length, have = { g: 0, w: 0, b: 0 }, pids = new Set();
  for (const c of cards) { have[GROUP[c.role] || "w"]++; if (pids.has(c.pid)) out.push(`${c.name || "A player"} is in twice`); pids.add(c.pid); }
  if (n < MIN_N) out.push(`${MIN_N - n} more player${MIN_N - n === 1 ? "" : "s"} (a lineup needs ${MIN_N} to ${MAX_N})`);
  if (n > MAX_N) out.push(`${n - MAX_N} too many (at most ${MAX_N})`);
  for (const g of ["g", "w", "b"]) if (have[g] < NEED[g]) out.push(`at least ${NEED[g]} ${GROUP_NAME[g]}${NEED[g] > 1 ? "s" : ""} (have ${have[g]})`);
  return { ok: !out.length, problems: out, have };
}
// the lineup's strength: the average of its best eight cards
function strength(cards) { const o = cards.map(c => c.ovr).sort((a, b) => b - a).slice(0, 8); return o.length ? Math.round(o.reduce((a, b) => a + b, 0) / o.length * 10) / 10 : 0; }

// ---------- chemistry: 0.6 for strangers, up to 1 for teammates ----------
// per teammate: same team and season +0.12 (up to +0.36), same franchise +0.05 (up to +0.15), same decade +0.03 (up to +0.12)
function chemistry(cards) {
  const per = cards.map(a => {
    let ts = 0, fr = 0, dec = 0;
    for (const b of cards) { if (a === b || a.pid === b.pid) continue; if (a.team === b.team && a.season === b.season) ts++; else if (a.team === b.team) fr++; if (Math.floor(a.season / 10) === Math.floor(b.season / 10)) dec++; }
    return Math.round(Math.min(1, 0.6 + Math.min(0.36, 0.12 * ts) + Math.min(0.15, 0.05 * fr) + Math.min(0.12, 0.03 * dec)) * 100) / 100;
  });
  const links = [], by = {};
  for (const c of cards) { const k = c.team + "@" + c.season; (by[k] = by[k] || []).push(c); }
  for (const [k, list] of Object.entries(by)) if (list.length >= 2) links.push({ kind: "team", team: k.split("@")[0], season: +k.split("@")[1], n: list.length });
  const fr = {}; for (const c of cards) fr[c.team] = (fr[c.team] || 0) + 1;
  for (const [t, n] of Object.entries(fr)) if (n >= 2 && !links.some(l => l.team === t && l.n === n)) links.push({ kind: "franchise", team: t, n });
  return { per, team: per.length ? Math.round(per.reduce((a, b) => a + b, 0) / per.length * 100) / 100 : 0, links };
}
// three or more cards from one collection: +2 to its boost ratings for everyone (+3 with five); "all" collections +1 (+2)
function setBoosts(cards) {
  const n = {}; for (const c of cards) if (c.col !== "base") n[c.col] = (n[c.col] || 0) + 1;
  const boosts = {}, lines = [];
  for (const [col, k] of Object.entries(n)) {
    const C = CC.CBY[col]; if (k < 3 || !C || !C.boost) continue;
    const keys = C.boost === "all" ? CC.GROUPS.flatMap(g => g.keys) : C.boost, plus = C.boost === "all" ? (k >= 5 ? 2 : 1) : (k >= 5 ? 3 : 2);
    for (const r of keys) boosts[r] = (boosts[r] || 0) + plus;
    lines.push({ col, n: k, plus, all: C.boost === "all", keys });
  }
  return { boosts, lines };
}
function applyBoosts(r, boosts) { const o = Object.assign({}, r); for (const [k, v] of Object.entries(boosts)) if (o[k] !== undefined) o[k] = Math.min(99, o[k] + v); return o; }

// ---------- the ladder: 30 team-seasons, weakest to greatest ----------
const RES_BONUS = { Champion: 0.12, Finals: 0.07, R2: 0.04, R1: 0.02 };
const strengthOf = c => c.pct + (RES_BONUS[c.res] || 0);
const RUNGS = 30;
// cands: from BB.NIGHTS.candidates(league)
function ladderOf(cands) {
  const list = cands.slice().sort((a, b) => strengthOf(a) - strengthOf(b) || a.season - b.season || (a.team < b.team ? -1 : 1));
  if (!list.length) return [];
  const out = [], used = new Set(), n = Math.min(RUNGS, list.length);
  for (let k = 0; k < n; k++) {
    // evenly through the field from the 3rd percentile, the last rung the strongest team ever
    const i0 = k === n - 1 ? list.length - 1 : Math.floor(list.length * (0.03 + 0.95 * k / (n - 1)));
    const bad = j => used.has(list[j].team + list[j].season) || (out.length && out[out.length - 1].team === list[j].team);
    let i = i0; while (i < list.length - 1 && bad(i)) i++;
    if (bad(i)) { i = i0; while (i > 0 && bad(i)) i--; }
    used.add(list[i].team + list[i].season); out.push(Object.assign({ rung: k + 1, str: Math.round(strengthOf(list[i]) * 1000) / 1000 }, list[i]));
  }
  out.sort((a, b) => strengthOf(a) - strengthOf(b)); out.forEach((x, i) => x.rung = i + 1);
  return out;
}
function rungReward(k) {
  if (k === RUNGS) return { coins: 3000, tokens: { legends: 2 } };
  if (k % 10 === 0) return { coins: 1000, tokens: { legends: 1 } };
  if (k % 5 === 0) return { coins: 600, tokens: { premium: 1 } };
  return { coins: 150 + 40 * k, tokens: k % 2 === 0 ? { standard: 1 } : {} };
}
const REPLAY_WIN = 60, LOSS = 15;

// ---------- weekly challenges: a rule, an opponent, a reward ----------
const RULES = [
  { k: "rg", text: "Only Rubber, Bronze, Silver and Gold cards", test: cs => cs.every(c => c.ovr < 75) },
  { k: "dec", text: "No two players from the same decade", test: cs => new Set(cs.map(c => Math.floor(c.season / 10))).size === cs.length },
  { k: "fran", text: "One player per franchise", test: cs => new Set(cs.map(c => c.team)).size === cs.length },
  { k: "base", text: "Base cards only", test: cs => cs.every(c => c.col === "base") },
  { k: "star", text: "No card over 85", test: cs => cs.every(c => c.ovr <= 85) },
  { k: "bigs", text: "At least four bigs", test: cs => cs.filter(c => GROUP[c.role] === "b").length >= 4 },
  { k: "tkl", text: "Win, and make more tackles than they do", test: () => true, after: (m, o) => m.tkl > o.tkl },
  { k: "boards", text: "Win, and out-rebound them", test: () => true, after: (m, o) => m.reb > o.reb }
];
const RBY = Object.fromEntries(RULES.map(r => [r.k, r]));
function weeklyOf(wk, ladder) {
  const R = rngOf("lineup:" + wk), pool = RULES.slice(), out = [], n = ladder.length;
  if (!n) return out;
  for (let i = 0; i < 3; i++) {
    const rule = pool.splice(Math.floor(R() * pool.length), 1)[0], rung = Math.max(1, Math.min(n, Math.round(n * (0.25 + 0.2 * i) + R() * 4)));
    out.push({ id: wk + ":" + rule.k, k: rule.k, text: rule.text, rung, reward: { coins: 400 + 200 * i, tokens: i === 2 ? { legends: 1 } : { premium: 1 } } });
  }
  return out;
}

// ---------- the save: s.lu ----------
function luOf(s) {
  if (!s.lu || typeof s.lu !== "object") s.lu = {};
  const L = s.lu;
  L.team = L.team || { city: "Your", name: "All-Stars", c1: "#f2b134", c2: "#1b2a4a" };
  L.sl = Array.isArray(L.sl) && L.sl.length === 3 ? L.sl : [{ n: "A", k: [] }, { n: "B", k: [] }, { n: "C", k: [] }];
  L.a = L.a >= 0 && L.a < 3 ? L.a : 0; L.best = L.best || 0; L.beat = L.beat || {}; L.w = L.w || 0; L.l = L.l || 0; L.hist = L.hist || []; L.ch = L.ch || { wk: "", done: {} };
  return L;
}
// keys that are still owned (cards sold since are dropped)
function cleanSlots(s) { const L = luOf(s); for (const sl of L.sl) sl.k = sl.k.filter(k => s.owned[k] > 0).slice(0, MAX_N); return L; }
function toggle(s, slot, key, pidOf) {
  const L = luOf(s), K = L.sl[slot].k, i = K.indexOf(key);
  if (i >= 0) { K.splice(i, 1); return "out"; }
  if (!s.owned[key]) return null;
  const pid = pidOf(key), j = K.findIndex(k => pidOf(k) === pid);
  if (j >= 0) { K[j] = key; return "swap"; }
  if (K.length >= MAX_N) return "full";
  K.push(key); return "in";
}
// a finished game: res = { win, my: { pts, tkl, reb }, opp: {...} }; kind "ladder" (rung) or "week" (challenge)
function record(s, kind, ref, res, meta) {
  const L = luOf(s), out = { coins: 0, tokens: {}, first: false, lines: [] };
  if (res.win) L.w++; else L.l++;
  if (kind === "ladder") {
    const k = ref;
    if (res.win && !L.beat[k]) { L.beat[k] = 1; L.best = Math.max(L.best, k); const r = rungReward(k); out.coins += r.coins; ECO.addTokens(s, r.tokens); out.tokens = r.tokens; out.first = true; out.lines.push(`Rung ${k} cleared`); }
    else out.coins += res.win ? REPLAY_WIN : LOSS;
  } else {
    const ch = ref, rule = RBY[ch.k], ok = res.win && (!rule.after || rule.after(res.my, res.opp));
    if (ok && !L.ch.done[ch.id]) { L.ch.done[ch.id] = 1; out.coins += ch.reward.coins; ECO.addTokens(s, ch.reward.tokens); out.tokens = ch.reward.tokens; out.first = true; out.lines.push("Challenge complete"); }
    else { out.coins += res.win ? REPLAY_WIN : LOSS; if (res.win && !ok) out.lines.push("You won, but the challenge's condition wasn't met"); }
  }
  s.coins += out.coins;
  L.hist.unshift(Object.assign({ kind, ref: kind === "ladder" ? ref : ref.id, win: res.win, s: res.score, d: meta && meta.d, opp: meta && meta.opp, coins: out.coins }));
  L.hist = L.hist.slice(0, 12);
  return out;
}
function ensureWeek(s, wk) { const L = luOf(s); if (L.ch.wk !== wk) L.ch = { wk, done: {} }; return L.ch; }

const API = { MIN_N, MAX_N, GROUP, GROUP_NAME, NEED, check, strength, chemistry, setBoosts, applyBoosts, RUNGS, strengthOf, ladderOf, rungReward, REPLAY_WIN, LOSS,
  RULES, RBY, weeklyOf, luOf, cleanSlots, toggle, record, ensureWeek };
if (NODE) module.exports = API;
else window.BB = Object.assign(window.BB || {}, { LINEUP: API });
})();
