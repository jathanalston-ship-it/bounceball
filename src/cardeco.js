// ===================== CARD ECONOMY: coins, packs, dailies, sets, exchanges, save codes =====================
// Rules only (no DOM), so they can be tested in Node. The collection game in the viewer
// (site/cardgame.js) keeps one save in the browser and changes it only through these functions.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const C = NODE ? require("./cards.js") : window.BB.CARDS;
const TIERS = C.TIERS, TK = TIERS.map(t => t.key), TMIN = Object.fromEntries(TIERS.map(t => [t.key, t.min]));
const tierAt = k => TK.indexOf(k);

// ---------- odds and values ----------
// Each pack slot rolls a tier first, then a card from that tier, so the odds don't depend on how
// many cards a tier holds. Opal ~0.36% and Vulcanized ~0.12% per card: a real chase.
const TIER_W = { rubber: 30, bronze: 26, silver: 22, gold: 18, emerald: 12, sapphire: 8, ruby: 4.5, amethyst: 2.5, diamond: 1.2, opal: 0.45, vulcan: 0.15 };
// quick-sell value of a spare copy; a Standard card is worth ~73 on average, so packs sell back at ~73%
const SELL = { rubber: 10, bronze: 15, silver: 25, gold: 40, emerald: 70, sapphire: 120, ruby: 250, amethyst: 450, diamond: 900, opal: 2500, vulcan: 6000 };
const PRICE = { standard: 500, oddballs: 600, era: 600, leaders: 650, feats: 750, holiday: 750, premium: 1600, legends: 2800 };
const priceOf = key => PRICE[key] != null ? PRICE[key] : /^era\d+$/.test(key) ? PRICE.era : null;
function cardValue(tier) { return SELL[tier] || 0; }
// expected quick-sell value of one card from a slot with these tiers available
function slotValue(tiers) { const ts = tiers || TK, w = ts.reduce((s, t) => s + TIER_W[t], 0); return ts.reduce((s, t) => s + TIER_W[t] * SELL[t], 0) / w; }

// ---------- exchanges: spare copies for a better pack ----------
// Exchange packs are never sold. Each trade beats quick-selling the same cards.
const XPACKS = {
  xgold: { key: "xgold", name: "Gold Exchange", sub: "3 cards · last Emerald or better", c1: "#c9a227", c2: "#2e2300", icon: "base", n: 3, guarantee: TMIN.emerald },
  xruby: { key: "xruby", name: "Ruby Exchange", sub: "3 cards · last Ruby or better", c1: "#c2183a", c2: "#2b0610", icon: "mvp", n: 3, guarantee: TMIN.ruby },
  xdiamond: { key: "xdiamond", name: "Diamond Exchange", sub: "3 cards · last Diamond or better", c1: "#7fd8ff", c2: "#0b2638", icon: "hof", n: 3, guarantee: TMIN.diamond },
  xopal: { key: "xopal", name: "Opal Exchange", sub: "2 cards · last Opal or better", c1: "#e15bff", c2: "#14062a", icon: "immortals", n: 2, guarantee: TMIN.opal }
};
const EXCHANGES = [
  { key: "e1", from: ["rubber", "bronze"], n: 8, gives: "standard" },
  { key: "e2", from: ["silver", "gold"], n: 5, gives: "xgold" },
  { key: "e3", from: ["emerald", "sapphire"], n: 5, gives: "xruby" },
  { key: "e4", from: ["ruby", "amethyst"], n: 4, gives: "xdiamond" },
  { key: "e5", from: ["diamond"], n: 3, gives: "xopal" }
];

// ---------- the save ----------
function newSave(now) {
  return { v: 1, coins: 1500, tokens: { standard: 3, premium: 1 }, owned: {}, packs: 0, cards: 0, sold: 0, exch: 0, best: null,
    daily: { last: "", streak: 0, best: 0 }, week: null, sets: {}, opts: { quick: false, sound: true, walkouts: true }, born: now || 0 };
}
// the free-play collection (ubl-cards-v1) carries over whole
function migrate(old, now) {
  const s = newSave(now);
  if (old && old.owned && typeof old.owned === "object") {
    for (const [k, n] of Object.entries(old.owned)) if (KEY_RE.test(k) && n > 0) s.owned[k] = Math.min(999, Math.floor(n));
    s.packs = Math.max(0, Math.floor(old.packs || 0)); s.cards = Math.max(0, Math.floor(old.cards || 0));
  }
  return s;
}
function addTokens(s, t) { for (const [k, n] of Object.entries(t || {})) s.tokens[k] = (s.tokens[k] || 0) + n; }
function spareOf(s, key) { return Math.max(0, (s.owned[key] || 0) - 1); }

// buying: coins for a pack, or a token you already have
function canOpen(s, key) { if ((s.tokens[key] || 0) > 0) return "token"; const p = priceOf(key); return p != null && s.coins >= p ? "coins" : null; }
function payFor(s, key) {
  const how = canOpen(s, key); if (!how) return null;
  if (how === "token") { s.tokens[key]--; if (!s.tokens[key]) delete s.tokens[key]; } else s.coins -= priceOf(key);
  return how;
}

// quick-sell spare copies (never the last one)
function sell(s, cards) {
  let coins = 0, n = 0;
  for (const c of cards) { const k = c.key; if (spareOf(s, k) < 1) continue; s.owned[k]--; coins += SELL[c.tier] || 0; n++; }
  s.coins += coins; s.sold += n; return { coins, n };
}
// which spare copies an exchange would take: the lowest overalls first
function exchangeTake(s, ex, cards) {
  const spare = [], used = {};
  for (const c of cards.filter(c => ex.from.includes(c.tier)).sort((a, b) => a.ovr - b.ovr)) {
    const left = spareOf(s, c.key) - (used[c.key] || 0);
    for (let i = 0; i < left && spare.length < ex.n; i++) { spare.push(c); used[c.key] = (used[c.key] || 0) + 1; }
    if (spare.length >= ex.n) break;
  }
  return spare.length >= ex.n ? spare : null;
}
function exchange(s, ex, cards) {
  const take = exchangeTake(s, ex, cards); if (!take) return null;
  for (const c of take) s.owned[c.key]--;
  addTokens(s, { [ex.gives]: 1 }); s.exch++; return take;
}

// ---------- daily reward and login streak ----------
const STREAK = [100, 150, 200, 300, 400, 500, 800];
// today/yesterday are local calendar days ("2026-11-18"); a missed day restarts the streak
function claimDaily(s, today, yesterday) {
  if (s.daily.last === today) return null;
  const streak = s.daily.last === yesterday ? s.daily.streak + 1 : 1, coins = STREAK[(streak - 1) % 7], tokens = { standard: 1 };
  if (streak % 7 === 0) tokens.premium = 1;
  s.daily = { last: today, streak, best: Math.max(s.daily.best || 0, streak) };
  s.coins += coins; addTokens(s, tokens);
  return { streak, coins, tokens };
}
function dayKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function weekKey(d) { // ISO week of the local date
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), wd = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}

// ---------- weekly challenges: three a week, the same for everyone that week ----------
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const CHALLENGES = [
  { k: "open", n: 8, coins: 800, text: () => "Open 8 packs" },
  { k: "rare", n: 3, coins: 1000, text: () => "Pull 3 Ruby-or-better cards" },
  { k: "new", n: 25, coins: 700, text: () => "Add 25 new cards to your collection" },
  { k: "dec", n: 5, coins: 500, text: p => `Pull 5 cards from the ${p}s` },
  { k: "grp", n: 4, coins: 500, text: (p, names) => `Pull 4 ${names[p] || p} cards` },
  { k: "days", n: 5, coins: 900, token: "premium", text: () => "Claim the daily reward on 5 days" }
];
function weekly(wk, decades, groups, names) {
  let h = hashStr(wk); const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const pool = CHALLENGES.slice(), out = [];
  while (out.length < 3 && pool.length) {
    const ch = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    const param = ch.k === "dec" ? decades[Math.floor(rnd() * decades.length)] : ch.k === "grp" ? groups[Math.floor(rnd() * groups.length)] : null;
    if ((ch.k === "dec" || ch.k === "grp") && param == null) continue;
    out.push({ id: ch.k, n: ch.n, coins: ch.coins, token: ch.token || null, param, text: ch.text(param, names || {}) });
  }
  return out;
}
function ensureWeek(s, wk, decades, groups, names) {
  if (!s.week || s.week.id !== wk) s.week = { id: wk, list: weekly(wk, decades, groups, names), prog: {}, done: {} };
  return s.week;
}
// ev: { type: "open" } | { type: "pull", tier, season, group, isNew } | { type: "daily" }; returns challenges finished now
function track(s, ev) {
  const W = s.week; if (!W) return [];
  const hit = ch => ev.type === "open" ? ch.id === "open" : ev.type === "daily" ? ch.id === "days"
    : ev.type === "pull" && ((ch.id === "rare" && tierAt(ev.tier) >= tierAt("ruby")) || (ch.id === "new" && ev.isNew) || (ch.id === "dec" && Math.floor(ev.season / 10) * 10 === ch.param) || (ch.id === "grp" && ev.group === ch.param));
  const fin = [];
  for (const ch of W.list) {
    if (W.done[ch.id] || !hit(ch)) continue;
    W.prog[ch.id] = (W.prog[ch.id] || 0) + 1;
    if (W.prog[ch.id] >= ch.n) { W.done[ch.id] = 1; s.coins += ch.coins; if (ch.token) addTokens(s, { [ch.token]: 1 }); fin.push(ch); }
  }
  return fin;
}

// ---------- sets: each collection by decade, plus the whole collection ----------
// cards: [{ key, col, season, tier }]. A set pays 1.5x what its cards would sell for (3x for a whole
// collection), plus a pack for sets of 5 or more: Legends if it holds a Diamond or better.
function setsOf(cards) {
  const by = {}, cols = {};
  for (const c of cards) {
    const d = Math.floor(c.season / 10) * 10, k = c.col + "@" + d;
    (by[k] = by[k] || { key: k, col: c.col, decade: d, keys: [], value: 0, top: 0 }); by[k].keys.push(c.key); by[k].value += SELL[c.tier] || 0; by[k].top = Math.max(by[k].top, tierAt(c.tier));
    (cols[c.col] = cols[c.col] || new Set()).add(d);
  }
  const out = Object.values(by);
  for (const [col, ds] of Object.entries(cols)) if (ds.size > 1) {
    const all = out.filter(x => x.col === col && x.decade !== "all");
    out.push({ key: col + "@all", col, decade: "all", keys: all.flatMap(x => x.keys), value: all.reduce((a, x) => a + x.value, 0), top: Math.max(...all.map(x => x.top)) });
  }
  return out;
}
function setReward(set) {
  const r50 = x => Math.max(300, Math.round(x / 50) * 50);
  if (set.decade === "all") return { coins: r50(3 * set.value), tokens: { legends: 2 } };
  const tokens = set.keys.length >= 5 ? (set.top >= tierAt("diamond") ? { legends: 1 } : { premium: 1 }) : {};
  return { coins: r50(1.5 * set.value), tokens };
}
function setHave(s, set) { let n = 0; for (const k of set.keys) if (s.owned[k] > 0) n++; return n; }
// pays every set that is complete and unpaid; returns the ones paid now
function paySets(s, sets) {
  const paid = [];
  for (const set of sets) {
    if (s.sets[set.key] || setHave(s, set) < set.keys.length) continue;
    const r = setReward(set); s.sets[set.key] = 1; s.coins += r.coins; addTokens(s, r.tokens); paid.push(Object.assign({ reward: r }, set));
  }
  return paid;
}

// ---------- holiday window: the Holiday pack is on sale 3 days either side of a holiday ----------
function holidayNow(todayUTC, holidaysOf) {
  const y = new Date(todayUTC).getUTCFullYear(), list = [y - 1, y, y + 1].flatMap(yy => holidaysOf(yy)).sort((a, b) => a[0] - b[0]);
  const active = list.find(([t]) => Math.abs(t - todayUTC) <= 3 * 864e5), next = list.find(([t]) => t - todayUTC > 3 * 864e5);
  return { active: active ? active[1] : null, until: active ? active[0] + 3 * 864e5 : null, next: next || null };
}

// ---------- save codes: move a save between devices ----------
const KEY_RE = /^[a-z0-9]+:\d{4}:\d+$/;
function crc32(bytes) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) { c = (crc ^ bytes[i]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function b64u(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0), left = bytes.length - i;
    out += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (left > 1 ? B64[n >> 6 & 63] : "") + (left > 2 ? B64[n & 63] : "");
  }
  return out;
}
function unb64u(str) {
  const out = []; let buf = 0, bits = 0;
  for (const ch of str) { const v = B64.indexOf(ch); if (v < 0) throw new Error("bad character in code"); buf = (buf << 6) | v; bits += 6; if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 0xff); } }
  return Uint8Array.from(out);
}
const utf8 = str => NODE ? Uint8Array.from(Buffer.from(str, "utf8")) : new TextEncoder().encode(str);
const unutf8 = b => NODE ? Buffer.from(b).toString("utf8") : new TextDecoder().decode(b);
// the owned map shrinks to "col.season.pid.count" entries; everything else is copied as is
function packSave(s) {
  const o = Object.entries(s.owned).filter(([, n]) => n > 0).sort().map(([k, n]) => k.replace(/:/g, ".") + (n > 1 ? "." + n : "")).join(";");
  return JSON.stringify({ v: 1, c: s.coins, t: s.tokens, o, p: s.packs, n: s.cards, sd: s.sold, x: s.exch, b: s.best, d: s.daily, w: s.week, st: s.sets, op: s.opts, bn: s.born });
}
function unpackSave(json) {
  const j = JSON.parse(json); if (!j || j.v !== 1) throw new Error("not a UBL save");
  const s = newSave(j.bn || 0), int = (x, max) => Number.isFinite(x) && x >= 0 ? Math.min(max, Math.floor(x)) : 0;
  s.coins = int(j.c, 1e9); s.tokens = {};
  for (const [k, n] of Object.entries(j.t || {})) if (/^[a-z0-9]+$/.test(k) && int(n, 999)) s.tokens[k] = int(n, 999);
  for (const e of String(j.o || "").split(";")) {
    if (!e) continue; const [col, y, pid, n] = e.split("."), k = `${col}:${y}:${pid}`;
    if (!KEY_RE.test(k)) throw new Error("damaged card list"); s.owned[k] = n === undefined ? 1 : int(+n, 999) || 1;
  }
  s.packs = int(j.p, 1e7); s.cards = int(j.n, 1e8); s.sold = int(j.sd, 1e8); s.exch = int(j.x, 1e7); s.best = typeof j.b === "string" && KEY_RE.test(j.b) ? j.b : null;
  if (j.d && typeof j.d.last === "string") s.daily = { last: j.d.last.slice(0, 10), streak: int(j.d.streak, 1e5), best: int(j.d.best, 1e5) };
  if (j.w && typeof j.w.id === "string" && Array.isArray(j.w.list)) s.week = j.w;
  if (j.st && typeof j.st === "object") for (const k of Object.keys(j.st)) if (/^[a-z0-9]+@(\d{4}|all)$/.test(k)) s.sets[k] = 1;
  if (j.op && typeof j.op === "object") s.opts = Object.assign(s.opts, { quick: !!j.op.quick, sound: j.op.sound !== false, walkouts: j.op.walkouts !== false });
  return s;
}
// a code is "UBL1-<z|j><crc>-<data>": z = deflate-raw (the viewer compresses), j = plain JSON bytes
function wrapCode(mode, bytes, jsonBytes) { return `UBL1-${mode}${crc32(jsonBytes).toString(16).padStart(8, "0")}-${b64u(bytes)}`; }
function readCode(code) {
  const m = String(code).replace(/\s+/g, "").match(/^UBL1-([zj])([0-9a-f]{8})-([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error("That isn't a UBL save code.");
  return { mode: m[1], crc: parseInt(m[2], 16), bytes: unb64u(m[3]) };
}
function checkCode(crc, jsonBytes) { if (crc32(jsonBytes) !== crc) throw new Error("The code is damaged or incomplete (checksum mismatch)."); }

const API = { TIER_W, SELL, PRICE, priceOf, cardValue, slotValue, XPACKS, EXCHANGES, STREAK, CHALLENGES, newSave, migrate, addTokens, spareOf, canOpen, payFor, sell,
  exchangeTake, exchange, claimDaily, dayKey, weekKey, weekly, ensureWeek, track, setsOf, setReward, setHave, paySets, holidayNow, crc32, b64u, unb64u, utf8, unutf8,
  packSave, unpackSave, wrapCode, readCode, checkCode, KEY_RE, hashStr };
if (NODE) module.exports = API;
else window.BB = Object.assign(window.BB || {}, { ECO: API });
})();
