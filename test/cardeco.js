// Card economy rules: prices, quick-sell, exchanges, dailies, weekly challenges, sets, save codes.
"use strict";
const zlib = require("zlib");
const E = require("../src/cardeco.js"), C = require("../src/cards.js");
let bad = 0;
const ok = (c, msg) => { if (!c) { bad++; console.log("FAIL:", msg); } };
const card = (col, season, pid, tier, ovr) => ({ key: `${col}:${season}:${pid}`, col, season, tier, ovr: ovr || 70 });

// odds: the chase tiers stay rare, and packs sell back for less than they cost
{
  const tot = Object.values(E.TIER_W).reduce((a, b) => a + b, 0);
  ok(Object.keys(E.TIER_W).length === C.TIERS.length && C.TIERS.every(t => E.TIER_W[t.key] > 0 && E.SELL[t.key] > 0), "every tier has a weight and a value");
  ok(E.TIER_W.opal / tot < 0.005 && E.TIER_W.vulcan / tot < 0.002, "Opal and Vulcanized are under 0.5% and 0.2% per card");
  ok(5 * E.slotValue() < E.PRICE.standard, "a Standard pack sells back for less than it costs");
  ok(E.priceOf("era1980") === E.PRICE.era && E.priceOf("xgold") === null, "decade packs are priced, exchange packs are not for sale");
  // every exchange beats quick-selling its own cards
  for (const ex of E.EXCHANGES) {
    const cost = ex.n * Math.max(...ex.from.map(t => E.SELL[t])), P = E.XPACKS[ex.gives];
    const gets = P ? (P.n - 1) * E.slotValue() + E.slotValue(C.TIERS.filter(t => t.min >= P.guarantee).map(t => t.key)) : 5 * E.slotValue();
    ok(gets >= cost * 0.9, `${ex.key}: the exchange pack is worth about what the cards would sell for or more (${Math.round(gets)} vs ${cost})`);
  }
}
// buying, selling, exchanging
{
  const s = E.newSave(1);
  ok(s.coins === 1500 && s.tokens.standard === 3 && s.tokens.premium === 1, "new saves start with coins and packs");
  ok(E.payFor(s, "standard") === "token" && s.tokens.standard === 2, "a token is used before coins");
  ok(E.payFor(s, "legends") === null && s.coins === 1500, "can't buy what you can't afford");
  s.coins = 5000; ok(E.payFor(s, "legends") === "coins" && s.coins === 5000 - E.PRICE.legends, "buying with coins");
  const a = card("posterized", 1980, 7, "gold"), b = card("posterized", 1981, 8, "silver");
  s.owned[a.key] = 3; s.owned[b.key] = 1;
  const r = E.sell(s, [a, a, a, b]);
  ok(r.n === 2 && s.owned[a.key] === 1 && s.owned[b.key] === 1 && r.coins >= 2 * E.SELL.gold * 0.6 && r.coins <= 2 * E.SELL.gold * 1.05, "quick-sell takes spare copies only, never the last one");
  const cards = [card("swat", 1960, 1, "silver", 66), card("swat", 1961, 2, "gold", 72), card("swat", 1962, 3, "gold", 74)];
  s.owned[cards[0].key] = 3; s.owned[cards[1].key] = 2; s.owned[cards[2].key] = 2;
  const ex = E.EXCHANGES.find(x => x.gives === "xgold");
  const take = E.exchangeTake(s, ex, cards);
  ok(take === null, "exchange needs 5 spare copies (only 4 here)");
  s.owned[cards[2].key] = 3;
  const got = E.exchange(s, ex, cards);
  ok(got && got.length === 5 && s.tokens.xgold === 1 && Object.values(s.owned).every(n => n >= 1), "exchange takes 5 spares, keeps one of each, gives the pack");
  ok(got && got[0].ovr <= got[got.length - 1].ovr, "exchanges use the lowest overalls first");
}
// daily reward and streak
{
  const s = E.newSave(1);
  const d1 = E.claimDaily(s, "2026-11-01", "2026-10-31");
  ok(d1 && d1.streak === 1 && d1.coins === E.STREAK[0] && s.tokens.standard === 4, "first daily claim");
  ok(E.claimDaily(s, "2026-11-01", "2026-10-31") === null, "only once a day");
  let last;
  for (let d = 2; d <= 7; d++) last = E.claimDaily(s, `2026-11-0${d}`, `2026-11-0${d - 1}`);
  ok(last.streak === 7 && last.tokens.premium === 1, "day 7 of a streak adds a Premium pack");
  const miss = E.claimDaily(s, "2026-11-09", "2026-11-08");
  ok(miss.streak === 1 && s.daily.best === 7, "a missed day restarts the streak, the best is kept");
  ok(E.dayKey(new Date(2026, 10, 18)) === "2026-11-18" && E.weekKey(new Date(2026, 10, 18)) === "2026-W47" && E.weekKey(new Date(2027, 0, 1)) === "2026-W53", "day and ISO week keys");
}
// weekly challenges
{
  const names = C.GROUP_NAMES, groups = Object.keys(names), decs = [1950, 1960, 1970, 1980];
  const w1 = E.weekly("2026-W47", decs, groups, names), w2 = E.weekly("2026-W47", decs, groups, names), w3 = E.weekly("2026-W48", decs, groups, names);
  ok(w1.length === 3 && new Set(w1.map(c => c.id)).size === 3, "three different challenges a week");
  ok(JSON.stringify(w1) === JSON.stringify(w2), "the same challenges for everyone in a week");
  let differ = false; for (let k = 1; k < 20 && !differ; k++) differ = JSON.stringify(E.weekly(`2027-W${String(k).padStart(2, "0")}`, decs, groups, names)) !== JSON.stringify(w1);
  ok(differ && w3.length === 3, "challenges change between weeks");
  const s = E.newSave(1); s.week = { id: "t", list: [{ id: "open", n: 2, coins: 800 }, { id: "rare", n: 1, coins: 1000 }, { id: "dec", n: 1, coins: 500, param: 1970 }], prog: {}, done: {} };
  s.xp = 1e6; s.lvl = E.LVL_MAX; const bon = E.coinBonus(s); // at the top level, so XP doesn't pay level rewards here
  E.track(s, { type: "open" }); const fin = E.track(s, { type: "open" });
  ok(fin.length === 1 && s.coins === 1500 + Math.round(800 * bon), "finishing a challenge pays once (with the level's coin bonus)");
  const c1 = s.coins; E.track(s, { type: "open" }); ok(s.coins === c1, "a done challenge doesn't pay again");
  E.track(s, { type: "pull", tier: "gold", season: 1975 }); E.track(s, { type: "pull", tier: "amethyst", season: 1960 });
  ok(s.week.done.rare && s.week.done.dec && s.coins === c1 + Math.round(1000 * bon) + Math.round(500 * bon), "rare and decade pulls count");
}
// sets
{
  const cards = [];
  for (let i = 0; i < 6; i++) cards.push(card("christmas", 1980 + i, 100 + i, i === 5 ? "diamond" : "silver"));
  cards.push(card("christmas", 1991, 200, "gold"), card("leapday", 1956, 300, "bronze"));
  const sets = E.setsOf(cards), x80 = sets.find(s => s.key === "christmas@1980"), xall = sets.find(s => s.key === "christmas@all");
  ok(x80 && x80.keys.length === 6 && xall && xall.keys.length === 7 && !sets.find(s => s.key === "leapday@all"), "sets by decade, plus the whole collection when it spans decades");
  ok(E.setReward(x80).tokens.legends === 1 && E.setReward(sets.find(s => s.key === "leapday@1950")).tokens.premium === undefined, "Legends pack for a set with a Diamond, no pack for tiny sets");
  const s = E.newSave(1); for (const c of cards.slice(0, 5)) s.owned[c.key] = 1;
  ok(E.paySets(s, sets).length === 0, "an incomplete set pays nothing");
  s.owned[cards[5].key] = 1; const paid = E.paySets(s, sets);
  ok(paid.length === 1 && paid[0].key === "christmas@1980" && s.sets["christmas@1980"] && E.paySets(s, sets).length === 0, "a set pays once when it's complete");
  s.owned[cards[6].key] = 1; ok(E.paySets(s, sets).map(p => p.key).sort().join() === "christmas@1990,christmas@all", "finishing the last decade completes the collection too");
}
// holiday window
{
  const today = Date.UTC(2026, 11, 23), h = E.holidayNow(today, C.holidaysOf);
  ok(h.active === "christmas", "the Holiday pack is on sale two days before Christmas");
  const h2 = E.holidayNow(Date.UTC(2026, 11, 10), C.holidaysOf); ok(!h2.active && h2.next && h2.next[1] === "christmas", "and not two weeks before");
}
// save codes round-trip, in both forms, and reject damage
{
  const s = E.newSave(1700000000000); s.coins = 12345; s.tokens = { standard: 2, xopal: 1 }; s.packs = 40; s.cards = 190; s.sets["christmas@1980"] = 1;
  for (let i = 0; i < 400; i++) s.owned[`posterized:${1954 + (i % 37)}:${1000 + i}`] = 1 + (i % 3);
  s.daily = { last: "2026-11-18", streak: 4, best: 9 }; s.opts.quick = true;
  const json = E.packSave(s), jb = E.utf8(json);
  const back = E.unpackSave(E.unutf8(jb));
  const sorted = o => JSON.stringify(Object.entries(o).sort());
  ok(sorted(back.owned) === sorted(s.owned) && back.coins === 12345 && back.tokens.xopal === 1 && back.sets["christmas@1980"] && back.daily.best === 9 && back.opts.quick, "save survives packing");
  const z = zlib.deflateRawSync(Buffer.from(jb)), code = E.wrapCode("z", Uint8Array.from(z), jb);
  const rd = E.readCode(code.replace(/(.{60})/g, "$1\n ")), raw = zlib.inflateRawSync(Buffer.from(rd.bytes));
  E.checkCode(rd.crc, Uint8Array.from(raw)); ok(E.unutf8(raw) === json, "compressed code round-trips, line breaks and spaces ignored");
  ok(code.length < json.length / 2, `compressed code is compact (${code.length} chars for ${Object.keys(s.owned).length} cards)`);
  const plain = E.wrapCode("j", jb, jb), rp = E.readCode(plain); E.checkCode(rp.crc, rp.bytes); ok(E.unutf8(rp.bytes) === json, "plain code round-trips");
  let caught = 0;
  try { const t = plain.slice(0, -6) + (plain.slice(-6, -5) === "A" ? "B" : "A") + plain.slice(-5); const r = E.readCode(t); E.checkCode(r.crc, r.bytes); } catch (e) { caught++; }
  try { E.readCode("hello"); } catch (e) { caught++; }
  try { E.unpackSave(JSON.stringify({ v: 1, o: "bad entry;x.y" })); } catch (e) { caught++; }
  ok(caught === 3, "damaged codes, junk and bad card lists are rejected");
  const hack = E.unpackSave(JSON.stringify({ v: 1, c: -50, t: { "<b>": 3, standard: 2.7 }, o: "", p: "x" }));
  ok(hack.coins === 0 && !hack.tokens["<b>"] && hack.tokens.standard === 2 && hack.packs === 0, "imported values are cleaned");
}
// migration from the free-play collection
{
  const m = E.migrate({ owned: { "swat:1960:5": 2, "junk": 4, "fifty:1970:9": 0 }, packs: 7, cards: 35 }, 1);
  ok(m.owned["swat:1960:5"] === 2 && !m.owned.junk && !m.owned["fifty:1970:9"] && m.packs === 7 && m.coins === 1500, "the old collection carries over");
}
// ---------- save v2: variants, pity, base and team sets, levels, achievements, shelf, limited packs ----------
const seeded = seed => { let h = seed >>> 0; return () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; }; };
// variant rolls: grades mostly 7-9, parallels rare, 1/1s about 1 in 2,000
{
  const R = seeded(7), N = 200000, g = {}, par = {}; let auto = 0, patch = 0;
  for (let i = 0; i < N; i++) { const o = E.parseCopy(E.rollCopy(R)); g[o.g] = (g[o.g] || 0) + 1; if (o.par) { par[o.par.code] = (par[o.par.code] || 0) + 1; ok(o.n >= 1 && o.n <= o.par.run, "serials fit the print run"); } if (o.auto) auto++; if (o.patch != null) patch++; }
  const f = k => (g[k] || 0) / N;
  ok(f(7) + f(8) + f(9) > 0.74 && f(10) > 0.02 && f(10) < 0.04, `most grades are 7-9 (${((f(7) + f(8) + f(9)) * 100).toFixed(1)}%), Gem Mint 10 about 3% (${(f(10) * 100).toFixed(2)}%)`);
  ok(Math.abs(par.B / N - 0.03) < 0.003 && par.S / N > 0.0003 && par.S / N < 0.0008, `Blue about 3% (${(par.B / N * 100).toFixed(2)}%), Superfractor about 1 in 2,000 (1 in ${Math.round(N / par.S)})`);
  ok(auto / N > 0.004 && auto / N < 0.008 && patch / N > 0.0025 && patch / N < 0.0055, "autographs about 0.6%, patches about 0.4%");
  for (const cp of ["9", "10G23", "8K4a", "7p12", "10S1ap999", "6B199"]) ok(E.copyStr(E.parseCopy(cp)) === cp, `copy ${cp} round-trips`);
  ok(E.special("10") && E.special("8B4") && E.special("7a") && E.special("7p3") && !E.special("9"), "Gem Mint 10s, parallels, autos and patches are special");
  // packs still sell back for well under their price, variants and base slots included
  let ev = 0; const R2 = seeded(11); for (let i = 0; i < 50000; i++) ev += E.copyMult(E.rollCopy(R2)); ev /= 50000;
  const std = (5 * E.slotValue() + 2 * E.slotValue() * E.BASE_X) * ev;
  ok(std < 0.8 * E.PRICE.standard, `a Standard pack (5 cards + 2 base) sells back for under 80% of its price (${Math.round(std)})`);
}
// copies: best kept, plain spares sold first, specials only one at a time
{
  const s = E.newSave(1), k = "swat:1970:5";
  E.addCopy(s, k, "7"); E.addCopy(s, k, "10"); E.addCopy(s, k, "8G5"); E.addCopy(s, k, "6");
  ok(s.owned[k] === 4 && s.cp[k].join() === "10,8G5,7,6" && E.spareOf(s, k) === 2, "copies sort best first; Gem Mint and parallel copies aren't plain spares");
  const r = E.sell(s, [{ key: k, tier: "gold" }, { key: k, tier: "gold" }, { key: k, tier: "gold" }]);
  ok(r.n === 2 && s.owned[k] === 2 && s.cp[k].join() === "10,8G5", "bulk selling takes the plain copies, worst first");
  const one = E.sellCopy(s, k, "gold", 0); ok(one && one.cp === "10" && one.coins === Math.round(40 * 2.5) && s.owned[k] === 1, "a Gem Mint copy sells by itself for 2.5x");
  ok(E.sellCopy(s, k, "gold", 0) === null && s.owned[k] === 1, "never the last copy");
  ok(E.copyValue("gold", "8", true) === 4 && E.copyValue("gold", "8", false) === 38, "base cards sell for a tenth");
  // an upgraded v1 save gets fixed, plain grades for the copies it had
  const old = { v: 1, coins: 50, owned: { "fifty:1970:9": 3, "mvp:1980:2": 1 }, tokens: {}, daily: {}, sets: {}, opts: {} };
  const up = E.upgrade(JSON.parse(JSON.stringify(old))), up2 = E.upgrade(JSON.parse(JSON.stringify(old)));
  ok(up.v === 2 && up.cp["fifty:1970:9"].length === 3 && up.cp["fifty:1970:9"].every(c => !E.special(c)) && JSON.stringify(up.cp) === JSON.stringify(up2.cp), "v1 saves upgrade with fixed plain grades");
}
// the Diamond meter
{
  const s = E.newSave(1);
  ok(E.pityW("standard") === 1 && E.pityW("premium") === 3.2 && E.pityW("legends") === 5.6, "pricier packs count for more");
  for (let i = 0; i < 39; i++) E.pityAfter(s, "standard", false);
  ok(s.pity === 39 && E.pityReady(s, "standard") && !E.pityReady({ pity: 38 }, "standard"), "the 40th Standard pack is guaranteed");
  E.pityAfter(s, "standard", true); ok(s.pity === 0, "a Diamond resets the meter");
}
// collector level
{
  const s = E.newSave(1); s.coins = 0; s.tokens = {};
  ok(E.levelOf(0) === 1 && E.levelOf(99) === 1 && E.levelOf(100) === 2 && E.levelOf(240) === 3, "level curve");
  const ups = E.gainXP(s, 240); ok(ups.length === 2 && s.coins === 100 + 150 && s.tokens.standard === 1 && s.tokens.pick === 1, "every level pays coins and a pack (level 3: a Pick-One pack)");
  ok(E.gainXP(s, 0).length === 0 && E.unlocked(s, "pick") && !E.unlocked(s, "team"), "Pick-One unlocks at level 3, Team packs later");
  const t = E.newSave(1); t.coins = 0; const n = E.notePull(t, "vulcan", "10S1a", true);
  ok(t.st.top === C.TIERS.length - 1 && t.st.gem === 1 && t.st.par.S === 1 && t.st.auto === 1 && t.xp === 400 + 500 + 100 + 30 && n.length > 0, "a pull records its stats and XP");
}
// base and team sets, the collection score, achievements
{
  const base = [];
  for (let i = 0; i < 4; i++) base.push(Object.assign(card("base", 1987, 500 + i, i ? "gold" : "diamond"), { team: "ERI" }));
  for (let i = 0; i < 3; i++) base.push(Object.assign(card("base", 1987, 600 + i, "silver"), { team: "GRY" }));
  const bs = E.baseSetsOf(base), te = bs.find(x => x.key === "team@1987@ERI"), se = bs.find(x => x.key === "base@1987");
  ok(te && te.keys.length === 4 && se && se.keys.length === 7 && E.setsOf(base).length === 0, "team sets and the season's base set; base cards make no decade sets");
  const s = E.newSave(1); s.week = { id: "t", list: [{ id: "team", n: 1, coins: 900, token: "pick" }], prog: {}, done: {} };
  for (const c of base.slice(0, 4)) E.addCopy(s, c.key, "8");
  const paid = E.paySets(s, bs); ok(paid.length === 1 && paid[0].kind === "team" && E.setReward(te).tokens.premium === 1 && s.st.teamSets === 1, "a finished team set pays (Premium with a Diamond in it)");
  ok(E.track(s, { type: "teamset" }).length === 1 && s.tokens.pick === 1, "the team-set challenge");
  const tierOf = k => (base.find(c => c.key === k) || {}).tier;
  const sc = E.scoreOf(s, tierOf); ok(sc === Math.round((50 + 3 * 5) * 0.5 * E.GRADE_X[8] + 15), `collection score (${sc})`);
  const got = E.checkAch(s, { uniq: 4, score: sc, colDone: () => false });
  ok(got.some(a => a.id === "team1") && !got.some(a => a.id === "mvp") && E.checkAch(s, { uniq: 4, score: sc, colDone: () => false }).length === 0, "achievements pay once");
  ok(E.checkAch(s, { uniq: 4, score: sc, colDone: k => k === "mvp" }).map(a => a.id).join() === "mvp", "the MVP row");
  ok(E.shelfToggle(s, base[0].key, "8") === true && s.shelf.length === 1 && E.shelfToggle(s, base[0].key, "9") === null && E.shelfToggle(s, base[0].key, "8") === false, "the showcase shelf");
}
// featured collection, event packs, team of the day
{
  const cols = ["swat", "mvp", "rookie", "fifty"], a = E.featuredOf("2026-W47", cols);
  ok(cols.includes(a) && a === E.featuredOf("2026-W47", cols.slice().reverse()), "the featured collection is the same for everyone that week");
  const oct = E.eventNow(new Date(2026, 9, 12)); ok(oct.ev.key === "dunktober" && oct.ends === new Date(2026, 10, 1).getTime(), "Dunktober runs through October");
  const nov = E.eventNow(new Date(2026, 10, 18)); ok(!nov.ev.from && nov.ends === new Date(2026, 10, 23).getTime(), "otherwise a weekly theme until Monday");
  ok(E.inEvent(E.EBY.bigs, { col: "swat", role: "BIG", season: 1980 }) && !E.inEvent(E.EBY.bigs, { col: "base", role: "BIG", season: 1980 }) && E.inEvent(E.EBY.oldschool, { col: "fifty", season: 1960 }) && !E.inEvent(E.EBY.oldschool, { col: "fifty", season: 1975 }), "event pools");
  ok(E.priceOf("evbigs") === E.PRICE.event && E.priceOf("featured") === 800 && E.teamOfDay("2026-11-18", ["ERI", "AKR"]) === E.teamOfDay("2026-11-18", ["AKR", "ERI"]), "event prices, team of the day");
}
// v2 save codes keep every copy and the progress
{
  const s = E.newSave(5); s.xp = 1234; s.lvl = E.levelOf(1234); s.pity = 12.4; s.ach = { rip1: 1, gem: 1 }; s.st = { gem: 2, par: { B: 3 }, top: 7, teamSets: 1 };
  E.addCopy(s, "swat:1970:5", "10G23a"); E.addCopy(s, "swat:1970:5", "7"); E.addCopy(s, "base:1987:500", "9p44"); s.sets["team@1987@ERI"] = 1; s.sets["swat@1970"] = 1;
  s.shelf = ["swat:1970:5|10G23a"]; s.frame = "glass";
  const back = E.unpackSave(E.packSave(s));
  const srt = o => JSON.stringify(Object.entries(o).sort());
  ok(srt(back.cp) === srt(s.cp) && back.owned["swat:1970:5"] === 2 && back.xp === 1234 && back.pity === 12.4 && back.ach.gem && back.st.par.B === 3 && back.sets["team@1987@ERI"] && back.sets["swat@1970"] && back.shelf[0] === "swat:1970:5|10G23a" && back.frame === "glass", "v2 codes keep copies, progress, sets and the shelf");
  const v1 = E.unpackSave(JSON.stringify({ v: 1, c: 10, o: "swat.1970.5.3;fifty.1980.2", st: { "swat@1970": 1 } }));
  ok(v1.owned["swat:1970:5"] === 3 && v1.cp["swat:1970:5"].length === 3 && v1.sets["swat@1970"], "v1 codes still load");
}
console.log(`card economy: ${bad} problems`);
process.exit(bad ? 1 : 0);
