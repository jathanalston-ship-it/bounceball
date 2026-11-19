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
  ok(r.n === 2 && s.owned[a.key] === 1 && s.owned[b.key] === 1 && r.coins === 2 * E.SELL.gold, "quick-sell takes spare copies only, never the last one");
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
  E.track(s, { type: "open" }); const fin = E.track(s, { type: "open" });
  ok(fin.length === 1 && s.coins === 1500 + 800, "finishing a challenge pays once");
  E.track(s, { type: "open" }); ok(s.coins === 2300, "a done challenge doesn't pay again");
  E.track(s, { type: "pull", tier: "gold", season: 1975 }); E.track(s, { type: "pull", tier: "amethyst", season: 1960 });
  ok(s.week.done.rare && s.week.done.dec && s.coins === 2300 + 1500, "rare and decade pulls count");
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
console.log(`card economy: ${bad} problems`);
process.exit(bad ? 1 : 0);
