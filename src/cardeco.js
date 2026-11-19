// ===================== CARD ECONOMY: coins, packs, dailies, sets, exchanges, save codes =====================
// Rules only (no DOM), so they can be tested in Node. The collection game in the viewer
// (site/cardgame.js) keeps one save in the browser and changes it only through these functions.
// Save v2 adds the deeper collecting layer: every pulled copy has a grade and maybe a parallel, an
// autograph or a game-worn patch; a pity meter; base and team sets; collector level, achievements, a
// showcase shelf and a collection score; a weekly featured collection and expiring event packs.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const C = NODE ? require("./cards.js") : window.BB.CARDS;
const TIERS = C.TIERS, TK = TIERS.map(t => t.key), TMIN = Object.fromEntries(TIERS.map(t => [t.key, t.min]));
const tierAt = k => TK.indexOf(k);
const isBaseKey = k => k.startsWith("base:");

// ---------- odds and values ----------
// Each pack slot rolls a tier first, then a card from that tier, so the odds don't depend on how
// many cards a tier holds. Opal ~0.36% and Vulcanized ~0.12% per card: a real chase.
const TIER_W = { rubber: 30, bronze: 26, silver: 22, gold: 18, emerald: 12, sapphire: 8, ruby: 4.5, amethyst: 2.5, diamond: 1.2, opal: 0.45, vulcan: 0.15 };
// quick-sell value of a spare copy; a Standard card is worth ~73 on average, so packs sell back at ~73%
const SELL = { rubber: 10, bronze: 15, silver: 25, gold: 40, emerald: 70, sapphire: 120, ruby: 250, amethyst: 450, diamond: 900, opal: 2500, vulcan: 6000 };
const BASE_X = 0.1; // base cards are the common ones: they sell for a tenth of a collection card of the same tier
const PRICE = { standard: 500, oddballs: 600, era: 600, leaders: 650, feats: 750, holiday: 750, premium: 1600, legends: 2800, pick: 900, team: 650, featured: 800, event: 700 };
const priceOf = key => PRICE[key] != null ? PRICE[key] : /^era\d+$/.test(key) ? PRICE.era : /^ev[a-z0-9]+$/.test(key) ? PRICE.event : null;
function cardValue(tier) { return SELL[tier] || 0; }
// expected quick-sell value of one card from a slot with these tiers available
function slotValue(tiers) { const ts = tiers || TK, w = ts.reduce((s, t) => s + TIER_W[t], 0); return ts.reduce((s, t) => s + TIER_W[t] * SELL[t], 0) / w; }

// ---------- variants: every copy gets a grade; a few get a parallel, an autograph or a patch ----------
// Rolled after the card is drawn, so the tier odds never change. A copy is stored as a short string:
// grade, then a parallel letter and serial, then "a" for an autograph, then "p<n>" for a game-worn patch
// (n picks which of that season's games it was worn in). "9", "10G23", "8K4a", "7p12".
const GRADES = [[10, "Gem Mint", 3], [9, "Mint", 20], [8, "NM-MT", 34], [7, "Near Mint", 24], [6, "EX-MT", 10], [5, "Excellent", 4.5], [4, "VG-EX", 2.2], [3, "Very Good", 1.2], [2, "Good", 0.7], [1, "Poor", 0.4]];
const GRADE_NAME = Object.fromEntries(GRADES.map(g => [g[0], g[1]]));
const GRADE_X = { 10: 2.5, 9: 1.05, 8: 0.95, 7: 0.85, 6: 0.75, 5: 0.6, 4: 0.6, 3: 0.6, 2: 0.6, 1: 0.6 };
const PARALLELS = [
  { code: "B", key: "blue", name: "Blue", run: 199, p: 0.03, x: 1.5 },
  { code: "G", key: "gold", name: "Gold", run: 99, p: 0.012, x: 2.5 },
  { code: "R", key: "red", name: "Red", run: 25, p: 0.004, x: 5 },
  { code: "K", key: "black", name: "Black", run: 10, p: 0.0012, x: 12 },
  { code: "S", key: "super", name: "Superfractor", run: 1, p: 0.0005, x: 40 }
];
const PBY = Object.fromEntries(PARALLELS.map(p => [p.code, p]));
const AUTO_P = 0.006, PATCH_P = 0.004, AUTO_X = 3, PATCH_X = 2.5;
const COPY_RE = /^(10|[1-9])(?:([BGRKS])(\d{1,3}))?(a)?(?:p(\d{1,3}))?$/;
function parseCopy(str) {
  const m = COPY_RE.exec(String(str)); if (!m) return { g: 8, par: null, n: 0, auto: false, patch: null };
  return { g: +m[1], par: m[2] ? PBY[m[2]] : null, n: m[3] ? +m[3] : 0, auto: !!m[4], patch: m[5] != null ? +m[5] : null };
}
function copyStr(o) { return `${o.g}${o.par ? o.par.code + (o.n || 1) : ""}${o.auto ? "a" : ""}${o.patch != null ? "p" + o.patch : ""}`; }
function rollCopy(rnd) {
  const R = rnd || Math.random;
  let r = R() * 100, g = 8; for (const [v, , w] of GRADES) { r -= w; if (r <= 0) { g = v; break; } }
  let par = null, q = R(); for (const p of PARALLELS.slice().reverse()) { if (q < p.p) { par = p; break; } q -= p.p; }
  const n = par ? 1 + Math.floor(R() * par.run) : 0, auto = R() < AUTO_P, patch = R() < PATCH_P ? Math.floor(R() * 1000) : null;
  return copyStr({ g, par, n, auto, patch });
}
const copyMult = cp => { const o = typeof cp === "string" ? parseCopy(cp) : cp; return GRADE_X[o.g] * (o.par ? o.par.x : 1) * (o.auto ? AUTO_X : 1) * (o.patch != null ? PATCH_X : 1); };
const special = cp => { const o = typeof cp === "string" ? parseCopy(cp) : cp; return !!(o.par || o.auto || o.patch != null || o.g === 10); };
function copyValue(tier, cp, base) { return Math.max(1, Math.round((SELL[tier] || 0) * (base ? BASE_X : 1) * copyMult(cp))); }
function copyName(cp) { // "Gold /99 · Autograph · Gem Mint 10"
  const o = typeof cp === "string" ? parseCopy(cp) : cp, out = [];
  if (o.par) out.push(o.par.run === 1 ? "Superfractor 1/1" : `${o.par.name} ${o.n}/${o.par.run}`);
  if (o.auto) out.push("Autograph"); if (o.patch != null) out.push("Game-worn patch");
  out.push(`${GRADE_NAME[o.g]} ${o.g}`); return out.join(" · ");
}
// copies made before grading existed get a fair, fixed grade from the card's key (6 to 9, never special)
function legacyCopy(key, i) { return String([8, 7, 8, 9, 8, 6, 9, 7][hashStr(key + "#" + i) % 8]); }
const byBest = (a, b) => copyMult(b) - copyMult(a);
// a key's copies, best first; kept the same length as the owned count
function copiesOf(s, key) {
  if (!s.cp) s.cp = {};
  const n = s.owned[key] || 0; let L = s.cp[key];
  if (!n) { if (L) delete s.cp[key]; return []; }
  if (!L || L.length !== n) { L = (L || []).filter(x => COPY_RE.test(x)).slice(0, n); for (let i = L.length; i < n; i++) L.push(legacyCopy(key, i)); L.sort(byBest); s.cp[key] = L; }
  return L;
}
function addCopy(s, key, cp) {
  const L = copiesOf(s, key), isNew = !L.length; L.push(cp); L.sort(byBest); s.owned[key] = L.length; s.cp[key] = L; return isNew;
}
function dropCopy(s, key, idx) {
  const L = copiesOf(s, key); if (idx < 0 || idx >= L.length) return null;
  const [cp] = L.splice(idx, 1); s.owned[key] = L.length; if (!L.length) { delete s.owned[key]; delete s.cp[key]; }
  if (s.shelf) { const i = s.shelf.indexOf(key + "|" + cp); if (i >= 0 && !L.includes(cp)) s.shelf.splice(i, 1); }
  return cp;
}
// the plain spares: every copy after the best one that isn't special (specials are sold one at a time)
function plainSpares(s, key) { const L = copiesOf(s, key), out = []; for (let i = L.length - 1; i >= 1; i--) if (!special(L[i])) out.push(i); return out; }

// ---------- exchanges: spare copies for a better pack ----------
// Exchange packs are never sold. Each trade beats quick-selling the same cards.
const XPACKS = {
  xgold: { key: "xgold", name: "Gold Exchange", sub: "3 cards · last Emerald or better", c1: "#c9a227", c2: "#2e2300", icon: "base", n: 3, guarantee: TMIN.emerald },
  xruby: { key: "xruby", name: "Ruby Exchange", sub: "3 cards · last Ruby or better", c1: "#c2183a", c2: "#2b0610", icon: "mvp", n: 3, guarantee: TMIN.ruby },
  xdiamond: { key: "xdiamond", name: "Diamond Exchange", sub: "3 cards · last Diamond or better", c1: "#7fd8ff", c2: "#0b2638", icon: "hof", n: 3, guarantee: TMIN.diamond },
  xopal: { key: "xopal", name: "Opal Exchange", sub: "2 cards · last Opal or better", c1: "#e15bff", c2: "#14062a", icon: "immortals", n: 2, guarantee: TMIN.opal }
};
// the season pass's exclusive pack: one Diamond-or-better card, always a Red parallel or better, always signed
XPACKS.passx = { key: "passx", name: "Pass Exclusive", sub: "1 card · Diamond+ · Red /25 or rarer · signed", c1: "#ff3fa4", c2: "#1a0420", icon: "immortals", n: 1, guarantee: TMIN.diamond, force: { par: "R", auto: true } };
const XWORTH = { xgold: 600, xruby: 1000, xdiamond: 2000, xopal: 0, passx: 0 };
// a copy with at least these variants (keeps the rolled grade and anything rarer)
function forceCopy(cp, f, rnd) {
  const o = parseCopy(cp), R = rnd || Math.random;
  if (f.par) { const min = "BGRKS".indexOf(f.par); if (!o.par || "BGRKS".indexOf(o.par.code) < min) { const k = R() < 0.06 ? "S" : R() < 0.25 ? "K" : f.par; o.par = PBY[k]; o.n = 1 + Math.floor(R() * o.par.run); } }
  if (f.auto) o.auto = true;
  return copyStr(o);
}
const EXCHANGES = [
  { key: "e1", from: ["rubber", "bronze"], n: 8, gives: "standard" },
  { key: "e2", from: ["silver", "gold"], n: 5, gives: "xgold" },
  { key: "e3", from: ["emerald", "sapphire"], n: 5, gives: "xruby" },
  { key: "e4", from: ["ruby", "amethyst"], n: 4, gives: "xdiamond" },
  { key: "e5", from: ["diamond"], n: 3, gives: "xopal" }
];

// ---------- the save ----------
function newSave(now) {
  return { v: 2, coins: 1500, tokens: { standard: 3, premium: 1 }, owned: {}, cp: {}, packs: 0, cards: 0, sold: 0, exch: 0, best: null,
    daily: { last: "", streak: 0, best: 0 }, week: null, sets: {}, opts: { quick: false, sound: true, walkouts: true }, born: now || 0,
    pity: 0, xp: 0, lvl: 1, ach: {}, st: {}, shelf: [], frame: "wood" };
}
// a v1 save (before grades) gains the new fields; its copies get fixed grades the first time they're looked at
function upgrade(d) {
  const b = newSave(d.born || 0);
  const s = Object.assign(b, d, { v: 2, opts: Object.assign(b.opts, d.opts || {}), daily: Object.assign(b.daily, d.daily || {}), tokens: Object.assign({}, d.tokens || {}), sets: Object.assign({}, d.sets || {}),
    cp: Object.assign({}, d.cp || {}), ach: Object.assign({}, d.ach || {}), st: Object.assign({}, d.st || {}), shelf: Array.isArray(d.shelf) ? d.shelf.slice(0, SHELF_N) : [] });
  if (!Number.isFinite(s.pity)) s.pity = 0; if (!Number.isFinite(s.xp)) s.xp = 0; if (!Number.isFinite(s.lvl)) s.lvl = levelOf(s.xp);
  for (const k of Object.keys(s.owned)) copiesOf(s, k);
  return s;
}
// the free-play collection (ubl-cards-v1) carries over whole
function migrate(old, now) {
  const s = newSave(now);
  if (old && old.owned && typeof old.owned === "object") {
    for (const [k, n] of Object.entries(old.owned)) if (KEY_RE.test(k) && n > 0) s.owned[k] = Math.min(999, Math.floor(n));
    s.packs = Math.max(0, Math.floor(old.packs || 0)); s.cards = Math.max(0, Math.floor(old.cards || 0));
  }
  for (const k of Object.keys(s.owned)) copiesOf(s, k);
  return s;
}
function addTokens(s, t) { for (const [k, n] of Object.entries(t || {})) s.tokens[k] = (s.tokens[k] || 0) + n; }
function spareOf(s, key) { return plainSpares(s, key).length; }

// buying: coins for a pack, or a token you already have
function canOpen(s, key) { if ((s.tokens[key] || 0) > 0) return "token"; const p = priceOf(key); return p != null && s.coins >= p ? "coins" : null; }
function payFor(s, key) {
  const how = canOpen(s, key); if (!how) return null;
  if (how === "token") { s.tokens[key]--; if (!s.tokens[key]) delete s.tokens[key]; } else s.coins -= priceOf(key);
  return how;
}

// quick-sell plain spare copies (never the last copy, never a special one): the worst copy goes first
function sell(s, cards) {
  let coins = 0, n = 0;
  for (const c of cards) {
    const k = c.key, sp = plainSpares(s, k); if (!sp.length) continue;
    const cp = dropCopy(s, k, sp[0]); coins += copyValue(c.tier, cp, isBaseKey(k)); n++;
  }
  s.coins += coins; s.sold += n; return { coins, n };
}
// sell one chosen copy from the card viewer (special ones too), never the last copy
function sellCopy(s, key, tier, idx) {
  const L = copiesOf(s, key); if (L.length < 2 || idx < 0 || idx >= L.length) return null;
  const cp = dropCopy(s, key, idx), coins = copyValue(tier, cp, isBaseKey(key)); s.coins += coins; s.sold++; return { cp, coins };
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
  for (const c of take) dropCopy(s, c.key, plainSpares(s, c.key)[0]);
  addTokens(s, { [ex.gives]: 1 }); s.exch++; gainXP(s, 25); return take;
}

// ---------- bad-luck protection: the Diamond meter ----------
// Counts packs (in Standard-pack equivalents: pricier packs count for more) since the last Diamond or
// better. When a pack would fill it, that pack's last card is a Diamond or better.
const PITY_N = 40;
function pityW(key) { const p = priceOf(key); return Math.round(((p != null ? p : XWORTH[key] != null ? XWORTH[key] : 500) / 500) * 10) / 10; }
function pityReady(s, key) { return (s.pity || 0) + pityW(key) >= PITY_N; }
function pityAfter(s, key, gotDiamond) { s.pity = gotDiamond ? 0 : Math.min(PITY_N, Math.round(((s.pity || 0) + pityW(key)) * 10) / 10); }

// ---------- collector level ----------
// XP from every pull (more for rarer cards, new cards and variants), sets, exchanges, dailies and achievements.
const XP_T = { rubber: 2, bronze: 3, silver: 4, gold: 6, emerald: 9, sapphire: 13, ruby: 20, amethyst: 30, diamond: 50, opal: 100, vulcan: 200 };
const LVL_MAX = 50;
const xpNeed = L => 100 + 40 * (L - 1); // XP to go from level L to L+1
function levelOf(xp) { let L = 1, x = xp || 0; while (L < LVL_MAX && x >= xpNeed(L)) { x -= xpNeed(L); L++; } return L; }
function levelProg(xp) { let L = 1, x = xp || 0; while (L < LVL_MAX && x >= xpNeed(L)) { x -= xpNeed(L); L++; } return { L, have: x, need: L < LVL_MAX ? xpNeed(L) : 0 }; }
function levelReward(L) {
  const tokens = L % 10 === 0 ? { legends: 1 } : L % 5 === 0 ? { premium: 1 } : L % 3 === 0 ? { pick: 1 } : { standard: 1 };
  return { coins: Math.min(1000, 50 * L), tokens };
}
const UNLOCKS = [
  { L: 3, pack: "pick", text: "Pick-One packs in the store" },
  { L: 4, frame: "glass", text: "Glass showcase shelf" },
  { L: 6, pack: "team", text: "Team packs in the store" },
  { L: 8, frame: "gold", text: "Gold showcase shelf" },
  { L: 12, frame: "neon", text: "Neon showcase shelf" },
  { L: 20, frame: "vault", text: "Vault showcase shelf" }
];
const FRAMES = [{ key: "wood", name: "Wood", L: 1 }].concat(UNLOCKS.filter(u => u.frame).map(u => ({ key: u.frame, name: u.text.split(" ")[0], L: u.L })));
const unlocked = (s, what) => { const u = UNLOCKS.find(x => x.pack === what || x.frame === what); return !u || levelOf(s.xp) >= u.L; };
// daily and challenge coins grow 2% a level
const coinBonus = s => 1 + 0.02 * (levelOf(s.xp) - 1);
// adds XP and pays every level reached; returns the level-ups
function gainXP(s, n) {
  const before = levelOf(s.xp); s.xp = (s.xp || 0) + Math.max(0, Math.round(n)); const after = levelOf(s.xp), ups = [];
  for (let L = Math.max(before, s.lvl || 1) + 1; L <= after; L++) { const r = levelReward(L); s.coins += r.coins; addTokens(s, r.tokens); ups.push({ L, reward: r, unlocks: UNLOCKS.filter(u => u.L === L) }); }
  s.lvl = Math.max(s.lvl || 1, after); return ups;
}
// one pulled copy: stats for achievements, and its XP
function notePull(s, tier, cp, isNew) {
  const o = parseCopy(cp), st = s.st || (s.st = {}), ti = tierAt(tier);
  st.top = Math.max(st.top == null ? -1 : st.top, ti);
  if (o.par) { st.par = st.par || {}; st.par[o.par.code] = (st.par[o.par.code] || 0) + 1; }
  if (o.auto) st.auto = (st.auto || 0) + 1; if (o.patch != null) st.patch = (st.patch || 0) + 1;
  if (o.g === 10) { st.gem = (st.gem || 0) + 1; st.gemTop = Math.max(st.gemTop == null ? -1 : st.gemTop, ti); }
  const xp = XP_T[tier] * (isNew ? 2 : 1) + (o.par ? [25, 50, 120, 250, 500]["BGRKS".indexOf(o.par.code)] : 0) + (o.auto ? 100 : 0) + (o.patch != null ? 100 : 0) + (o.g === 10 ? 30 : 0);
  return gainXP(s, xp);
}

// ---------- daily reward and login streak ----------
const STREAK = [100, 150, 200, 300, 400, 500, 800];
// today/yesterday are local calendar days ("2026-11-18"); a missed day restarts the streak
function claimDaily(s, today, yesterday) {
  if (s.daily.last === today) return null;
  const streak = s.daily.last === yesterday ? s.daily.streak + 1 : 1, coins = Math.round(STREAK[(streak - 1) % 7] * coinBonus(s)), tokens = { standard: 1 };
  if (streak % 7 === 0) tokens.premium = 1;
  s.daily = { last: today, streak, best: Math.max(s.daily.best || 0, streak) };
  s.coins += coins; addTokens(s, tokens);
  const ups = gainXP(s, 20);
  return { streak, coins, tokens, ups };
}
function dayKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function weekKey(d) { // ISO week of the local date
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), wd = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - wd);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 864e5 + 1) / 7)).padStart(2, "0")}`;
}
// next local Monday 00:00 after d (when the week's featured collection and event pack change)
function weekEnds(d) { const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()); t.setDate(t.getDate() + (8 - (t.getDay() || 7))); return t.getTime(); }

// ---------- weekly challenges: three a week, the same for everyone that week ----------
function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const CHALLENGES = [
  { k: "open", n: 8, coins: 800, text: () => "Open 8 packs" },
  { k: "rare", n: 3, coins: 1000, text: () => "Pull 3 Ruby-or-better cards" },
  { k: "new", n: 25, coins: 700, text: () => "Add 25 new cards to your collection" },
  { k: "dec", n: 5, coins: 500, text: p => `Pull 5 cards from the ${p}s` },
  { k: "grp", n: 4, coins: 500, text: (p, names) => `Pull 4 ${names[p] || p} cards` },
  { k: "days", n: 5, coins: 900, token: "premium", text: () => "Claim the daily reward on 5 days" },
  { k: "par", n: 2, coins: 800, text: () => "Pull 2 parallels" },
  { k: "gem", n: 2, coins: 700, text: () => "Pull 2 Gem Mint 10s" },
  { k: "team", n: 1, coins: 900, token: "pick", text: () => "Complete a team set" },
  // Classic Nights (watching and pick'em)
  { k: "watch", n: 3, coins: 900, text: () => "Watch 3 Classic Nights games to the final buzzer" },
  { k: "wpop", n: 50, coins: 600, text: () => "Catch 50 big plays while watching Classic Nights" },
  { k: "picks", n: 10, coins: 500, text: () => "Make 10 Classic Nights picks" },
  { k: "pickw", n: 5, coins: 800, token: "premium", text: () => "Win 5 Classic Nights picks" }
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
// ev: { type: "open" } | { type: "pull", tier, season, group, isNew, cp } | { type: "daily" } | { type: "teamset" }
//     | Classic Nights: { type: "watch" } | { type: "pop" } | { type: "pick" } | { type: "pickw" }
// returns challenges finished now
function track(s, ev) {
  const W = s.week; if (!W) return [];
  const o = ev.cp ? parseCopy(ev.cp) : null;
  const NK = { watch: "watch", pop: "wpop", pick: "picks", pickw: "pickw" };
  const hit = ch => NK[ev.type] ? ch.id === NK[ev.type] : ev.type === "open" ? ch.id === "open" : ev.type === "daily" ? ch.id === "days" : ev.type === "teamset" ? ch.id === "team"
    : ev.type === "pull" && ((ch.id === "rare" && tierAt(ev.tier) >= tierAt("ruby")) || (ch.id === "new" && ev.isNew) || (ch.id === "dec" && Math.floor(ev.season / 10) * 10 === ch.param) || (ch.id === "grp" && ev.group === ch.param)
      || (ch.id === "par" && o && o.par) || (ch.id === "gem" && o && o.g === 10));
  const fin = [];
  for (const ch of W.list) {
    if (W.done[ch.id] || !hit(ch)) continue;
    W.prog[ch.id] = (W.prog[ch.id] || 0) + 1;
    if (W.prog[ch.id] >= ch.n) { W.done[ch.id] = 1; s.coins += Math.round(ch.coins * coinBonus(s)); if (ch.token) addTokens(s, { [ch.token]: 1 }); gainXP(s, 60); fin.push(ch); }
  }
  return fin;
}

// ---------- sets ----------
// Collection cards: each collection by decade, plus the whole collection. A set pays 1.5x what its cards
// would sell for (3x for a whole collection), plus a pack for sets of 5 or more: Legends if it holds a
// Diamond or better. Base cards: a team set for every team's season roster, and the season's base set.
// cards: [{ key, col, season, tier, team }]. Any version of a card counts.
function setsOf(cards) {
  const by = {}, cols = {};
  for (const c of cards) {
    if (c.col === "base") continue;
    const d = Math.floor(c.season / 10) * 10, k = c.col + "@" + d;
    (by[k] = by[k] || { key: k, kind: "col", col: c.col, decade: d, keys: [], value: 0, top: 0 }); by[k].keys.push(c.key); by[k].value += SELL[c.tier] || 0; by[k].top = Math.max(by[k].top, tierAt(c.tier));
    (cols[c.col] = cols[c.col] || new Set()).add(d);
  }
  const out = Object.values(by);
  for (const [col, ds] of Object.entries(cols)) if (ds.size > 1) {
    const all = out.filter(x => x.col === col && x.decade !== "all");
    out.push({ key: col + "@all", kind: "col", col, decade: "all", keys: all.flatMap(x => x.keys), value: all.reduce((a, x) => a + x.value, 0), top: Math.max(...all.map(x => x.top)) });
  }
  return out;
}
function baseSetsOf(cards) {
  const team = {}, season = {};
  for (const c of cards) {
    if (c.col !== "base") continue; const v = Math.round((SELL[c.tier] || 0) * BASE_X), ti = tierAt(c.tier);
    const tk = `team@${c.season}@${c.team}`, sk = `base@${c.season}`;
    const T = team[tk] || (team[tk] = { key: tk, kind: "team", col: "base", season: c.season, team: c.team, keys: [], value: 0, top: 0 });
    const S = season[sk] || (season[sk] = { key: sk, kind: "season", col: "base", season: c.season, keys: [], value: 0, top: 0 });
    for (const X of [T, S]) { X.keys.push(c.key); X.value += v; X.top = Math.max(X.top, ti); }
  }
  return Object.values(team).concat(Object.values(season));
}
const SET_XP = set => set.kind === "season" ? 400 : set.kind === "team" ? 60 : set.decade === "all" ? 300 : 40 + 4 * set.keys.length;
function setReward(set) {
  const r50 = x => Math.max(300, Math.round(x / 50) * 50);
  if (set.kind === "team") return { coins: r50(2 * set.value), tokens: set.top >= tierAt("diamond") ? { premium: 1 } : { standard: 1 } };
  if (set.kind === "season") return { coins: Math.max(1000, Math.round(3 * set.value / 50) * 50), tokens: { legends: 1 } };
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
    const r = setReward(set); s.sets[set.key] = 1; s.coins += r.coins; addTokens(s, r.tokens);
    const st = s.st || (s.st = {}); if (set.kind === "team") st.teamSets = (st.teamSets || 0) + 1; else if (set.kind === "season") st.baseSets = (st.baseSets || 0) + 1; else if (set.decade === "all") st.colsDone = (st.colsDone || 0) + 1; else st.colSets = (st.colSets || 0) + 1;
    const ups = gainXP(s, SET_XP(set));
    paid.push(Object.assign({ reward: r, ups }, set));
  }
  return paid;
}

// ---------- collection score: one number for the whole collection ----------
// Each owned card scores by its tier, times its best copy (grade, parallel, autograph, patch; at most
// 10x), plus points for every finished set.
const SCORE_T = { rubber: 1, bronze: 2, silver: 3, gold: 5, emerald: 8, sapphire: 12, ruby: 20, amethyst: 30, diamond: 50, opal: 100, vulcan: 200 };
function scoreOf(s, tierOf) {
  let n = 0;
  for (const k of Object.keys(s.owned)) {
    const t = tierOf(k); if (!t) continue; const L = copiesOf(s, k); if (!L.length) continue;
    n += SCORE_T[t] * (isBaseKey(k) ? 0.5 : 1) * Math.min(10, copyMult(L[0]));
  }
  for (const k of Object.keys(s.sets)) n += k.startsWith("team@") ? 15 : k.startsWith("base@") ? 250 : k.endsWith("@all") ? 300 : 40;
  return Math.round(n);
}

// ---------- achievements: badges with rewards ----------
// X (from the viewer): { uniq, score, colDone(colKey) } — colDone says whether every card of a collection is owned.
const ACH = [
  { id: "rip1", name: "First rip", text: "Open your first pack", r: { coins: 100 }, t: s => s.packs >= 1 },
  { id: "rip50", name: "Pack rat", text: "Open 50 packs", r: { tokens: { premium: 1 } }, t: s => s.packs >= 50 },
  { id: "rip250", name: "Rip city", text: "Open 250 packs", r: { tokens: { legends: 1 } }, t: s => s.packs >= 250 },
  { id: "own100", name: "Collector", text: "Own 100 different cards", r: { coins: 500 }, t: (s, X) => X.uniq >= 100 },
  { id: "own500", name: "Archivist", text: "Own 500 different cards", r: { tokens: { premium: 1 } }, t: (s, X) => X.uniq >= 500 },
  { id: "own1500", name: "Curator", text: "Own 1,500 different cards", r: { tokens: { legends: 1 } }, t: (s, X) => X.uniq >= 1500 },
  { id: "own3000", name: "Keeper of the archive", text: "Own 3,000 different cards", r: { tokens: { legends: 2 } }, t: (s, X) => X.uniq >= 3000 },
  { id: "ruby", name: "Seeing red", text: "Pull a Ruby or better", r: { coins: 300 }, t: s => (s.st.top || -1) >= tierAt("ruby") },
  { id: "diamond", name: "Ice", text: "Pull a Diamond or better", r: { coins: 800 }, t: s => (s.st.top || -1) >= tierAt("diamond") },
  { id: "opal", name: "Opalescent", text: "Pull an Opal or better", r: { tokens: { premium: 1 } }, t: s => (s.st.top || -1) >= tierAt("opal") },
  { id: "vulcan", name: "Melted the rubber", text: "Pull a Vulcanized card", r: { tokens: { legends: 1 } }, t: s => (s.st.top || -1) >= tierAt("vulcan") },
  { id: "par", name: "Parallel universe", text: "Pull any parallel", r: { coins: 300 }, t: s => Object.keys(s.st.par || {}).length > 0 },
  { id: "par5", name: "Full spectrum", text: "Pull a Blue, a Gold and a Red parallel", r: { tokens: { premium: 1 } }, t: s => ["B", "G", "R"].every(k => (s.st.par || {})[k]) },
  { id: "black", name: "Blackout", text: "Pull a Black /10", r: { tokens: { premium: 1 } }, t: s => (s.st.par || {}).K > 0 },
  { id: "oneone", name: "One of one", text: "Pull a Superfractor 1/1", r: { tokens: { legends: 1 } }, t: s => (s.st.par || {}).S > 0 },
  { id: "auto", name: "Ink", text: "Pull an autograph", r: { coins: 600 }, t: s => s.st.auto > 0 },
  { id: "patch", name: "Game-worn", text: "Pull a game-worn patch", r: { coins: 600 }, t: s => s.st.patch > 0 },
  { id: "gem", name: "Gem Mint", text: "Pull a Gem Mint 10", r: { coins: 200 }, t: s => s.st.gem > 0 },
  { id: "gemd", name: "Perfect specimen", text: "Pull a Gem Mint 10 Diamond or better", r: { tokens: { legends: 1 } }, t: s => (s.st.gemTop == null ? -1 : s.st.gemTop) >= tierAt("diamond") },
  { id: "gemv", name: "Untouchable", text: "Pull a Gem Mint 10 Vulcanized", r: { tokens: { legends: 3 } }, t: s => (s.st.gemTop == null ? -1 : s.st.gemTop) >= tierAt("vulcan") },
  { id: "set1", name: "Set builder", text: "Finish a set", r: { coins: 300 }, t: s => (s.st.colSets || 0) + (s.st.colsDone || 0) >= 1 },
  { id: "set10", name: "Set machine", text: "Finish 10 collection sets", r: { tokens: { premium: 1 } }, t: s => (s.st.colSets || 0) + (s.st.colsDone || 0) >= 10 },
  { id: "colall", name: "Completionist", text: "Own every card in a collection", r: { tokens: { legends: 1 } }, t: s => (s.st.colsDone || 0) >= 1 },
  { id: "team1", name: "Team player", text: "Finish a team set", r: { coins: 400 }, t: s => s.st.teamSets >= 1 },
  { id: "team10", name: "Front office", text: "Finish 10 team sets", r: { tokens: { premium: 1 } }, t: s => s.st.teamSets >= 10 },
  { id: "season1", name: "Season ticket", text: "Finish a season's base set", r: { tokens: { legends: 1 } }, t: s => s.st.baseSets >= 1 },
  { id: "mvp", name: "MVP row", text: "Own every Most Valuable card", r: { tokens: { legends: 1 } }, t: (s, X) => X.colDone("mvp") },
  { id: "fmvp", name: "Finals row", text: "Own every Finals MVP card", r: { tokens: { legends: 1 } }, t: (s, X) => X.colDone("fmvp") },
  { id: "dpoy", name: "Lockdown row", text: "Own every Lockdown card", r: { tokens: { legends: 1 } }, t: (s, X) => X.colDone("dpoy") },
  { id: "roy", name: "Rookie row", text: "Own every Rookie of the Year card", r: { tokens: { legends: 1 } }, t: (s, X) => X.colDone("roy") },
  { id: "streak7", name: "Every day", text: "Reach a 7-day daily streak", r: { coins: 500 }, t: s => (s.daily.best || 0) >= 7 },
  { id: "streak30", name: "Iron streak", text: "Reach a 30-day daily streak", r: { tokens: { legends: 1 } }, t: s => (s.daily.best || 0) >= 30 },
  { id: "trade10", name: "Wheeler-dealer", text: "Make 10 exchanges", r: { tokens: { premium: 1 } }, t: s => s.exch >= 10 },
  { id: "pity", name: "Never say die", text: "Fill the Diamond meter", r: { coins: 500 }, t: s => s.st.pityHits > 0 },
  { id: "ladder10", name: "Contender", text: "Clear rung 10 of the lineup ladder", r: { tokens: { premium: 1 } }, t: s => (s.lu && s.lu.best || 0) >= 10 },
  { id: "ladder20", name: "Dynasty builder", text: "Clear rung 20 of the lineup ladder", r: { tokens: { legends: 1 } }, t: s => (s.lu && s.lu.best || 0) >= 20 },
  { id: "ladder30", name: "Greatest of all time", text: "Beat the top of the lineup ladder", r: { tokens: { legends: 2 } }, t: s => (s.lu && s.lu.best || 0) >= 30 },
  { id: "score10k", name: "Five figures", text: "Reach a collection score of 10,000", r: { tokens: { premium: 1 } }, t: (s, X) => X.score >= 10000 },
  { id: "score100k", name: "Six figures", text: "Reach a collection score of 100,000", r: { tokens: { legends: 2 } }, t: (s, X) => X.score >= 100000 }
];
const ACH_XP = a => a.r.tokens && a.r.tokens.legends ? 300 : a.r.tokens ? 150 : 75;
function checkAch(s, X) {
  const got = []; if (!s.ach) s.ach = {}; if (!s.st) s.st = {};
  for (const a of ACH) {
    if (s.ach[a.id]) continue; let done = false; try { done = !!a.t(s, X); } catch (e) { done = false; }
    if (!done) continue; s.ach[a.id] = 1; if (a.r.coins) s.coins += a.r.coins; addTokens(s, a.r.tokens);
    got.push(Object.assign({ ups: gainXP(s, ACH_XP(a)) }, a));
  }
  return got;
}

// ---------- the showcase shelf ----------
const SHELF_N = 8;
function shelfToggle(s, key, cp) {
  const id = key + "|" + cp, i = s.shelf.indexOf(id);
  if (i >= 0) { s.shelf.splice(i, 1); return false; }
  if (!copiesOf(s, key).includes(cp)) return null;
  if (s.shelf.length >= SHELF_N) s.shelf.shift(); s.shelf.push(id); return true;
}

// ---------- limited time: the featured collection and expiring event packs ----------
// The featured collection changes every Monday; its pack has better odds (Emerald and up 2.5x as likely).
function featuredOf(wk, cols) { const list = cols.slice().sort(); return list.length ? list[hashStr("featured:" + wk) % list.length] : null; }
const FEATURED_BOOST = 2.5;
// Event packs are on sale for a window and then leave the store (unopened ones still open).
// Dated events take their window; otherwise a weekly theme runs Monday to Sunday.
const EVENTS = [
  { key: "dunkweek", name: "Dunk Contest Week", sub: "Posterizers and Dunktober", from: [2, 9], to: [2, 22], cols: ["posterized", "dunktober"], c1: "#ff7a1a", c2: "#2a0e00", icon: "posterized" },
  { key: "playoffs", name: "Playoff Push", sub: "Postseason, Game 7s, rings", from: [4, 12], to: [5, 31], cols: ["postseason", "game7", "champ", "fmvp"], c1: "#1f6feb", c2: "#071a3a", icon: "postseason" },
  { key: "finals", name: "Finals Fortnight", sub: "Rings, Finals MVPs, dynasties", from: [6, 1], to: [6, 16], cols: ["champ", "fmvp", "dynasty", "game7"], c1: "#c9a227", c2: "#2b2000", icon: "champ" },
  { key: "draft", name: "Draft Night", sub: "Rookies, No. 1 picks, young guns", from: [6, 17], to: [7, 3], cols: ["rookie", "numberone", "roy", "younggun"], c1: "#0f8a57", c2: "#062a1b", icon: "rookie" },
  { key: "dunktober", name: "Dunktober Drop", sub: "All month: Dunktober and posterizers", from: [10, 1], to: [10, 31], cols: ["dunktober", "posterized"], c1: "#ff5a1f", c2: "#2a0a00", icon: "dunktober" },
  // weekly themes
  { key: "wreck", name: "Wrecking Week", sub: "Hitters and escape artists", cols: ["wrecking", "escape", "pickpockets"], c1: "#b91c1c", c2: "#2a0505", icon: "wrecking" },
  { key: "fours", name: "Four Alarm Week", sub: "Four-point and three-point bombers", cols: ["fouralarm", "splash", "buckets"], c1: "#ea580c", c2: "#2b0f02", icon: "fouralarm" },
  { key: "glass", name: "Glass Cleaners", sub: "Boards and blocks", cols: ["boards", "swat"], c1: "#0891b2", c2: "#03252e", icon: "swat" },
  { key: "bigs", name: "Big Men Week", sub: "Only bigs, any collection", roles: ["BIG"], c1: "#4338ca", c2: "#110a33", icon: "boards" },
  { key: "guards", name: "Floor Generals", sub: "Only point guards, any collection", roles: ["PG"], c1: "#0d9488", c2: "#03231f", icon: "dimes" },
  { key: "oldschool", name: "Old School Week", sub: "Seasons before 1970 only", before: 1970, c1: "#8a6a3e", c2: "#1d140a", icon: "founders" },
  { key: "outlaws", name: "Outlaws Week", sub: "Rap sheets, Friday the 13th, journeymen", cols: ["rapsheet", "friday13", "journeyman"], c1: "#3f3f46", c2: "#0b0b0d", icon: "rapsheet" },
  { key: "bench", name: "Bench Mob Week", sub: "Sixth men, iron men, breakouts", cols: ["bench", "ironworkers", "breakout"], c1: "#65a30d", c2: "#172503", icon: "bench" }
];
const EBY = Object.fromEntries(EVENTS.map(e => [e.key, e]));
// d: a local Date. Returns { ev, ends } for the event pack on sale now.
function eventNow(d) {
  const m = d.getMonth() + 1, day = d.getDate(), md = m * 100 + day;
  for (const e of EVENTS) if (e.from) {
    const a = e.from[0] * 100 + e.from[1], b = e.to[0] * 100 + e.to[1];
    if (md >= a && md <= b) return { ev: e, ends: new Date(d.getFullYear(), e.to[0] - 1, e.to[1] + 1).getTime() };
  }
  const weekly = EVENTS.filter(e => !e.from);
  return { ev: weekly[hashStr("event:" + weekKey(d)) % weekly.length], ends: weekEnds(d) };
}
// a card c = { col, season, role } is in an event's pool
function inEvent(e, c) { return (!e.cols || e.cols.includes(c.col)) && (!e.roles || e.roles.includes(c.role)) && (!e.before || c.season < e.before) && (e.cols || c.col !== "base"); }
// the Team pack's franchise changes every day
function teamOfDay(dk, teams) { const list = teams.slice().sort(); return list.length ? list[hashStr("team:" + dk) % list.length] : null; }

// ---------- holiday window: the Holiday pack is on sale 3 days either side of a holiday ----------
function holidayNow(todayUTC, holidaysOf) {
  const y = new Date(todayUTC).getUTCFullYear(), list = [y - 1, y, y + 1].flatMap(yy => holidaysOf(yy)).sort((a, b) => a[0] - b[0]);
  const active = list.find(([t]) => Math.abs(t - todayUTC) <= 3 * 864e5), next = list.find(([t]) => t - todayUTC > 3 * 864e5);
  return { active: active ? active[1] : null, until: active ? active[0] + 3 * 864e5 : null, next: next || null };
}

// ---------- save codes: move a save between devices ----------
const KEY_RE = /^[a-z0-9]+:\d{4}:\d+$/;
const SET_RE = /^([a-z0-9]+@(\d{4}|all)|team@\d{4}@[A-Z0-9]{2,5})$/;
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
// the owned map shrinks to "col.season.pid~copy,copy" entries; everything else is copied as is
function packSave(s) {
  const o = Object.entries(s.owned).filter(([, n]) => n > 0).sort().map(([k]) => k.replace(/:/g, ".") + "~" + copiesOf(s, k).join(",")).join(";");
  return JSON.stringify({ v: 2, c: s.coins, t: s.tokens, o, p: s.packs, n: s.cards, sd: s.sold, x: s.exch, b: s.best, d: s.daily, w: s.week, st: Object.keys(s.sets).join(","), op: s.opts, bn: s.born,
    pi: s.pity || 0, xp: s.xp || 0, lv: s.lvl || 1, a: Object.keys(s.ach || {}).join(","), ss: s.st || {}, sh: s.shelf || [], fr: s.frame || "wood", cn: s.cn || null, wi: s.wit || null, lu: s.lu || null });
}
function unpackSave(json) {
  const j = JSON.parse(json); if (!j || (j.v !== 1 && j.v !== 2)) throw new Error("not a UBL save");
  const s = newSave(j.bn || 0), int = (x, max) => Number.isFinite(x) && x >= 0 ? Math.min(max, Math.floor(x)) : 0;
  s.coins = int(j.c, 1e9); s.tokens = {};
  for (const [k, n] of Object.entries(j.t || {})) if (/^[a-z0-9]+$/.test(k) && int(n, 999)) s.tokens[k] = int(n, 999);
  for (const e of String(j.o || "").split(";")) {
    if (!e) continue; const [id, cps] = e.split("~"), [col, y, pid, n] = id.split("."), k = `${col}:${y}:${pid}`;
    if (!KEY_RE.test(k)) throw new Error("damaged card list");
    if (cps !== undefined) { const L = cps.split(",").filter(x => COPY_RE.test(x)).slice(0, 999); if (!L.length) throw new Error("damaged card list"); s.owned[k] = L.length; s.cp[k] = L.sort(byBest); }
    else { s.owned[k] = n === undefined ? 1 : int(+n, 999) || 1; copiesOf(s, k); }
  }
  s.packs = int(j.p, 1e7); s.cards = int(j.n, 1e8); s.sold = int(j.sd, 1e8); s.exch = int(j.x, 1e7); s.best = typeof j.b === "string" && KEY_RE.test(j.b) ? j.b : null;
  if (j.d && typeof j.d.last === "string") s.daily = { last: j.d.last.slice(0, 10), streak: int(j.d.streak, 1e5), best: int(j.d.best, 1e5) };
  if (j.w && typeof j.w.id === "string" && Array.isArray(j.w.list)) s.week = j.w;
  const setKeys = typeof j.st === "string" ? j.st.split(",") : j.st && typeof j.st === "object" ? Object.keys(j.st) : [];
  for (const k of setKeys) if (SET_RE.test(k)) s.sets[k] = 1;
  if (j.op && typeof j.op === "object") s.opts = Object.assign(s.opts, { quick: !!j.op.quick, sound: j.op.sound !== false, walkouts: j.op.walkouts !== false });
  s.pity = Math.min(PITY_N, Number.isFinite(j.pi) && j.pi >= 0 ? Math.round(j.pi * 10) / 10 : 0); s.xp = int(j.xp, 1e9); s.lvl = Math.max(levelOf(s.xp), Math.min(LVL_MAX, int(j.lv, LVL_MAX) || 1));
  for (const k of String(j.a || "").split(",")) if (ACH.some(a => a.id === k)) s.ach[k] = 1;
  if (j.ss && typeof j.ss === "object") {
    for (const k of ["top", "auto", "patch", "gem", "gemTop", "teamSets", "baseSets", "colSets", "colsDone", "pityHits"]) if (j.ss[k] != null) s.st[k] = k === "top" || k === "gemTop" ? Math.min(TK.length - 1, int(j.ss[k], 99)) : int(j.ss[k], 1e7);
    if (j.ss.par && typeof j.ss.par === "object") { s.st.par = {}; for (const c of "BGRKS") if (j.ss.par[c]) s.st.par[c] = int(j.ss.par[c], 1e6); }
  }
  if (Array.isArray(j.sh)) s.shelf = j.sh.filter(x => typeof x === "string").map(x => x.split("|")).filter(([k, cp]) => s.owned[k] && copiesOf(s, k).includes(cp)).map(x => x.join("|")).slice(0, SHELF_N);
  if (FRAMES.some(f => f.key === j.fr)) s.frame = j.fr;
  // Classic Nights: picks, results, watch records and the pass, copied with light checks
  if (j.cn && typeof j.cn === "object") {
    const c = j.cn, obj = x => x && typeof x === "object" && !Array.isArray(x) ? x : {}, idOk = k => /^\d{8}(_\d)?$/.test(k), pick = o => Object.fromEntries(Object.entries(obj(o)).filter(([k]) => idOk(k)));
    s.cn = { picks: pick(c.picks), bold: pick(c.bold), res: pick(c.res), bres: pick(c.bres), w: pick(c.w), streak: int(c.streak, 1e5), best: int(c.best, 1e5), pass: c.pass && typeof c.pass.id === "string" ? { id: c.pass.id.slice(0, 6), xp: int(c.pass.xp, 1e7), lvl: int(c.pass.lvl, 50) } : { id: "", xp: 0, lvl: 0 } };
  }
  // the lineup game: slots of card keys, the team's name and colors, ladder progress
  if (j.lu && typeof j.lu === "object") {
    const L = j.lu, col = x => /^#[0-9a-f]{6}$/i.test(x) ? x : null, str = (x, n) => String(x || "").replace(/[<>&"]/g, "").slice(0, n);
    s.lu = { team: { city: str(L.team && L.team.city, 18) || "Your", name: str(L.team && L.team.name, 18) || "All-Stars", c1: col(L.team && L.team.c1) || "#f2b134", c2: col(L.team && L.team.c2) || "#1b2a4a" },
      sl: [0, 1, 2].map(i => ({ n: "ABC"[i], k: (((L.sl || [])[i] || {}).k || []).filter(k => KEY_RE.test(k) && s.owned[k]).slice(0, 10) })),
      a: Math.min(2, int(L.a, 2)), best: Math.min(30, int(L.best, 30)), beat: {}, w: int(L.w, 1e6), l: int(L.l, 1e6), hist: [], ch: { wk: typeof (L.ch || {}).wk === "string" ? L.ch.wk.slice(0, 10) : "", done: {} } };
    for (const k of Object.keys(L.beat || {})) if (/^\d{1,2}$/.test(k)) s.lu.beat[k] = 1;
    for (const k of Object.keys((L.ch || {}).done || {})) if (/^\d{4}-W\d{2}:[a-z]+$/.test(k)) s.lu.ch.done[k] = 1;
  }
  if (j.wi && typeof j.wi === "object") { s.wit = {}; for (const [k, w] of Object.entries(j.wi)) if (KEY_RE.test(k) && k.startsWith("witness:") && w && typeof w === "object") s.wit[k] = { d: String(w.d || "").slice(0, 10), line: String(w.line || "").slice(0, 60), vs: String(w.vs || "").slice(0, 60), ovr: Math.min(99, int(w.ovr, 99)), team: String(w.team || "").slice(0, 5), gs: +w.gs || 0, num: int(w.num, 99), game: String(w.game || "").slice(0, 12) }; }
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

const API = { TIER_W, SELL, BASE_X, PRICE, priceOf, cardValue, slotValue, XPACKS, EXCHANGES, STREAK, CHALLENGES, newSave, upgrade, migrate, addTokens, spareOf, canOpen, payFor, sell, sellCopy,
  exchangeTake, exchange, claimDaily, dayKey, weekKey, weekEnds, weekly, ensureWeek, track, setsOf, baseSetsOf, setReward, setHave, paySets, holidayNow, crc32, b64u, unb64u, utf8, unutf8,
  packSave, unpackSave, wrapCode, readCode, checkCode, KEY_RE, hashStr,
  forceCopy, GRADES, GRADE_NAME, GRADE_X, PARALLELS, AUTO_P, PATCH_P, parseCopy, copyStr, rollCopy, copyMult, special, copyValue, copyName, copiesOf, addCopy, dropCopy, plainSpares, isBaseKey,
  PITY_N, pityW, pityReady, pityAfter, XP_T, LVL_MAX, xpNeed, levelOf, levelProg, levelReward, UNLOCKS, FRAMES, unlocked, coinBonus, gainXP, notePull,
  SCORE_T, scoreOf, ACH, checkAch, SHELF_N, shelfToggle, featuredOf, FEATURED_BOOST, EVENTS, EBY, eventNow, inEvent, teamOfDay };
if (NODE) module.exports = API;
else window.BB = Object.assign(window.BB || {}, { ECO: API });
})();
