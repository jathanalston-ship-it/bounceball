// ===================== BUSINESS: markets, arenas, the gate, owners' books, relocation, TV and labor =====================
// Engine v0.7 / league v0.7. Money is kept in "cap units" (multiples of that season's salary cap), so a
// franchise's books mean the same thing in 1958 and 2018; the viewer turns them into dollars.
//   * Markets: each city's metro population moves through history (the Rust Belt shrinks, the Sun Belt booms).
//   * The gate: every home game draws a crowd from winning, stars, the market, hype and the opponent.
//     The crowd is part of the game's context (a full building leans on the officials).
//   * Owners' books: gate + local media + the national TV share + playoffs, against payroll and operations.
//     Revenue sharing (from labor deals) evens it out a little. Rich owners ride out losses; poor ones sell.
//   * Relocation: a franchise that can't draw, in a small market or an old barn, gets moved to a bigger city
//     unless its city builds a new arena. The name, colors and records move with the team.
//   * League business: national TV deals every few years move the cap; a players' union, then collective
//     bargaining (free agency, revenue sharing, the max contract). Labor fights never cost games.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const E = NODE ? require("./engine.js") : window.BB;
const P = NODE ? require("./players.js") : window.BB;
const { clamp, makeRng, hashStr } = E;
const r3 = x => Math.round(x * 1000) / 1000;

// metro population (millions) at 1950, 1970, 1990, 2010, 2025; lat/lon
const CITY = {
  AKR: ["Akron", 41.08, -81.52, [0.41, 0.68, 0.66, 0.70, 0.70]], TOL: ["Toledo", 41.66, -83.56, [0.40, 0.69, 0.61, 0.65, 0.64]],
  GRY: ["Gary", 41.59, -87.35, [0.35, 0.63, 0.60, 0.55, 0.50]], FLN: ["Flint", 43.01, -83.69, [0.27, 0.50, 0.43, 0.42, 0.40]],
  YNG: ["Youngstown", 41.1, -80.65, [0.53, 0.54, 0.49, 0.42, 0.40]], ERI: ["Erie", 42.13, -80.09, [0.22, 0.26, 0.28, 0.28, 0.27]],
  PIT: ["Pittsburgh", 40.44, -80, [2.2, 2.4, 2.1, 2.36, 2.3]], CLE: ["Cleveland", 41.5, -81.69, [1.5, 2.1, 2.2, 2.08, 2.05]],
  DET: ["Detroit", 42.33, -83.05, [3.0, 4.4, 4.3, 4.3, 4.35]], BUF: ["Buffalo", 42.89, -78.88, [1.1, 1.35, 1.19, 1.14, 1.15]],
  LV: ["Las Vegas", 36.17, -115.14, [0.05, 0.27, 0.74, 1.95, 2.35]], PHX: ["Phoenix", 33.45, -112.07, [0.33, 0.97, 2.24, 4.19, 5.1]],
  SD: ["San Diego", 32.72, -117.16, [0.56, 1.36, 2.5, 3.1, 3.3]], HOU: ["Houston", 29.76, -95.37, [0.81, 1.99, 3.77, 5.95, 7.5]],
  DEN: ["Denver", 39.74, -104.99, [0.61, 1.24, 1.85, 2.55, 3.0]], MIA: ["Miami", 25.76, -80.19, [0.5, 1.9, 3.2, 5.5, 6.2]],
  MEM: ["Memphis", 35.15, -90.05, [0.48, 0.77, 1.0, 1.32, 1.34]], POR: ["Portland", 45.52, -122.68, [0.7, 1.0, 1.5, 2.2, 2.5]],
  NSH: ["Nashville", 36.16, -86.78, [0.4, 0.7, 1.0, 1.6, 2.1]], ABQ: ["Albuquerque", 35.08, -106.65, [0.15, 0.32, 0.6, 0.89, 0.92]],
  OMA: ["Omaha", 41.26, -95.93, [0.37, 0.54, 0.69, 0.87, 0.98]], KC: ["Kansas City", 39.1, -94.58, [0.81, 1.27, 1.6, 2.0, 2.2]],
  BOI: ["Boise", 43.62, -116.2, [0.07, 0.15, 0.32, 0.62, 0.8]], TUL: ["Tulsa", 36.15, -95.99, [0.35, 0.55, 0.71, 0.94, 1.03]],
  // cities without a team (yet): where franchises move
  CHI: ["Chicago", 41.88, -87.63, [5.2, 7.0, 7.4, 9.5, 9.4]], NY: ["New York", 40.71, -74.0, [12.9, 16.2, 16.8, 18.9, 19.5]],
  LA: ["Los Angeles", 34.05, -118.24, [4.4, 7.0, 8.9, 12.8, 13.0]], PHI: ["Philadelphia", 39.95, -75.17, [3.7, 4.8, 5.4, 6.0, 6.2]],
  STL: ["St. Louis", 38.63, -90.2, [1.7, 2.4, 2.5, 2.8, 2.8]], CIN: ["Cincinnati", 39.1, -84.51, [1.0, 1.4, 1.5, 2.1, 2.3]],
  BAL: ["Baltimore", 39.29, -76.61, [1.4, 2.1, 2.4, 2.7, 2.8]], MIL: ["Milwaukee", 43.04, -87.91, [0.96, 1.4, 1.4, 1.56, 1.57]],
  MIN: ["Minneapolis", 44.98, -93.27, [1.2, 1.9, 2.5, 3.3, 3.7]], IND: ["Indianapolis", 39.77, -86.16, [0.73, 1.1, 1.3, 1.9, 2.1]],
  LOU: ["Louisville", 38.25, -85.76, [0.58, 0.87, 0.95, 1.2, 1.3]], CBS: ["Columbus", 39.96, -83.0, [0.5, 0.92, 1.4, 1.84, 2.2]],
  ATL: ["Atlanta", 33.75, -84.39, [0.73, 1.6, 3.1, 5.3, 6.3]], DAL: ["Dallas", 32.78, -96.8, [0.6, 1.6, 3.9, 6.4, 8.1]],
  SA: ["San Antonio", 29.42, -98.49, [0.5, 0.9, 1.4, 2.1, 2.7]], SEA: ["Seattle", 47.61, -122.33, [0.85, 1.8, 2.6, 3.4, 4.1]],
  OAK: ["Oakland", 37.8, -122.27, [2.2, 3.1, 3.7, 4.3, 4.7]], SAC: ["Sacramento", 38.58, -121.49, [0.3, 0.8, 1.5, 2.1, 2.4]],
  SLC: ["Salt Lake City", 40.76, -111.89, [0.4, 0.7, 1.0, 1.1, 1.3]], CHA: ["Charlotte", 35.23, -80.84, [0.2, 0.55, 1.0, 2.2, 2.8]],
  ORL: ["Orlando", 28.54, -81.38, [0.11, 0.45, 1.2, 2.1, 2.8]], NO: ["New Orleans", 29.95, -90.07, [0.68, 1.1, 1.24, 1.17, 1.27]],
  OKC: ["Oklahoma City", 35.47, -97.52, [0.4, 0.69, 0.97, 1.25, 1.45]], HFD: ["Hartford", 41.76, -72.68, [0.6, 0.9, 1.1, 1.2, 1.2]],
  ROC: ["Rochester", 43.16, -77.61, [0.6, 0.96, 1.0, 1.05, 1.08]], SYR: ["Syracuse", 43.05, -76.15, [0.34, 0.64, 0.66, 0.66, 0.65]],
  TB: ["Tampa", 27.95, -82.46, [0.4, 1.1, 2.1, 2.8, 3.3]], AUS: ["Austin", 30.27, -97.74, [0.25, 0.4, 0.85, 1.7, 2.5]],
  RAL: ["Raleigh", 35.78, -78.64, [0.1, 0.4, 0.75, 1.1, 1.5]], VAN: ["Vancouver", 49.28, -123.12, [0.56, 1.1, 1.6, 2.3, 2.7]]
};
const ANCHOR = [1950, 1970, 1990, 2010, 2025];
function pop(key, season) {
  const c = CITY[key]; if (!c) return 0.5; const v = c[3];
  if (season <= ANCHOR[0]) return v[0]; if (season >= ANCHOR[4]) return v[4];
  let i = 0; while (season > ANCHOR[i + 1]) i++;
  return v[i] + (v[i + 1] - v[i]) * (season - ANCHOR[i]) / (ANCHOR[i + 1] - ANCHOR[i]);
}
// 0 (a small town) .. 1 (a huge metro)
function market(key, season) { return clamp(Math.log(pop(key, season) / 0.3) / Math.log(60), 0, 1); }
function geo(key) { const c = CITY[key]; return c ? [c[1], c[2]] : null; }
function cityName(key) { return CITY[key] ? CITY[key][0] : key; }
function milesBetween(a, b) {
  const A = geo(a), B = geo(b); if (!A || !B || a === b) return 0;
  const dy = (A[0] - B[0]) * 69, dx = (A[1] - B[1]) * 69 * Math.cos((A[0] + B[0]) / 2 * Math.PI / 180);
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}
// a franchise's home today (the league's teams start where teams.js puts them; relocation moves them)
function cityOf(S, tid) { const t = S.teams[tid]; return (t && t.city) || tid; }

// ---------- arenas ----------
function eraCapacity(season) { return season < 1960 ? 8000 : season < 1968 ? 10500 : season < 1978 ? 13500 : season < 1988 ? 16500 : season < 1998 ? 18800 : 18500; }
const CORP = ["Fizzco", "BrightLine Bank", "Allied Mutual", "Pinnacle Wireless", "Keystone Financial", "Nimbus Cloud", "Velocity Air", "Cascade Insurance", "OmniMart", "Ironside Trucks",
  "Quantum Credit Union", "Starlight Resorts", "Redwood Energy", "Halcyon Health", "Bluebird Logistics", "Meridian Motors", "Northstar Bank", "Golden Grain", "Summit Telecom", "Apex Payments"];
function arenaName(rng, season, city) {
  if (season < 1972) return rng.pick([`${city} Memorial Coliseum`, `${city} Civic Arena`, `${city} War Memorial`, `${city} Municipal Auditorium`, `${city} Fieldhouse`]);
  if (season < 1993) return rng.pick([`${city} Coliseum`, `The ${city} Center`, `${city} Sports Arena`, `Riverfront Arena`, `The Summit`, `The Palace of ${city}`]);
  return `${rng.pick(CORP)} ${rng.pick(["Center", "Arena", "Center", "Fieldhouse", "Pavilion"])}`;
}
function initTeam(S, info) {
  const t = S.teams[info.id];
  t.city = t.city || info.id;
  const capBase = info.how === "founder" ? 7000 : info.how === "merger" ? 13500 : eraCapacity(S.season);
  const rng = makeRng(hashStr(S.masterSeed + ":arena:" + info.id) || 1);
  t.arena = t.arena || { name: info.arena || cityName(t.city) + " Arena", cap: Math.round((capBase + rng.int(-800, 800)) / 100) * 100, built: S.season - (info.how === "founder" ? rng.int(5, 25) : info.how === "merger" ? rng.int(2, 12) : 0) };
  t.fin = t.fin || { hist: [], hype: info.how === "founder" ? 0 : 0.2 };
}

// ---------- the gate ----------
// fraction of seats sold for one home game
function demand(S, home, away, type, rng) {
  const t = S.teams[home], cur = S.cur, st = cur.standings[home] || [0, 0], m = market(cityOf(S, home), S.season);
  const h = t.hist, last = h.length ? h[h.length - 1] : null, lastPct = last ? last.w / Math.max(1, last.w + last.l) : 0.5;
  const g = st[0] + st[1], nowPct = g ? st[0] / g : lastPct, form = g >= 8 ? 0.6 * (nowPct - 0.5) + 0.4 * (lastPct - 0.5) : lastPct - 0.5;
  const stars = S.cur.starPower ? (S.cur.starPower[home] || 0) : 0, ostars = S.cur.starPower ? (S.cur.starPower[away] || 0) : 0;
  const era = S.season < 1965 ? -0.1 : S.season < 1980 ? -0.04 : S.season < 1995 ? 0.03 : 0.06; // the sport grows up
  const arenaAge = S.season - t.arena.built, old = arenaAge > 30 ? -0.06 : 0;
  const titled = last && last.res === "Champion" ? 0.08 : 0;
  let f = 0.5 + 0.3 * m + 1.1 * form + 0.05 * stars + 0.03 * ostars + (t.fin.hype || 0) + era + old + titled + rng.normal(0, 0.05);
  if (type === 1) f += 0.35; // the playoffs sell out (almost) everywhere
  return clamp(f, 0.12, 1);
}
function attendance(S, home, away, type, rng) {
  const cap = S.teams[home].arena.cap, f = demand(S, home, away, type, rng);
  return [f >= 0.985 ? cap : Math.round(cap * f), cap];
}

// ---------- the books ----------
function playerShare(S) { return S.biz.share; }
function opsRate(season) { return season < 1970 ? 0.44 : season < 1990 ? 0.4 : 0.37; }
// a season's books for every team, in cap units; owners' cash moves with them
function seasonBooks(S, payroll) {
  const cur = S.cur, ids = S.active, att = cur.att || {}, raw = {};
  for (const tid of ids) {
    const a = att[tid] || { n: 0, sum: 0, cap: 0, po: 0 }, m = market(cityOf(S, tid), S.season);
    raw[tid] = { gate: a.sum * (0.75 + 0.5 * m), local: 0.1 + m, po: a.po, stars: cur.starPower ? cur.starPower[tid] || 0 : 0, m, a };
  }
  const mean = k => ids.reduce((s, t) => s + raw[t][k], 0) / ids.length, mg = mean("gate") || 1, ml = mean("local") || 1;
  const nat = S.biz.natFrac, rs = S.biz.revShare;
  const tf = {}; for (const tid of ids) { const r = raw[tid]; tf[tid] = (1 - nat) * (0.72 * r.gate / mg + 0.28 * r.local / ml) + nat + r.po * 0.012 + r.stars * 0.012; }
  const mt = ids.reduce((s, t) => s + tf[t], 0) / ids.length;
  const avgRev = 1 / playerShare(S); // league-average revenue in cap units: the cap is the players' share of it
  const books = {};
  for (const tid of ids) {
    const f = (1 - rs) * tf[tid] / mt + rs, rev = avgRev * f, pay = payroll(S, tid) / P.capFor(S.season), t = S.teams[tid];
    const debt = t.arena.debt && t.arena.debt.thru >= S.season ? t.arena.debt.amt : 0;
    const ops = avgRev * opsRate(S.season) + debt, profit = rev - pay - ops;
    const a = raw[tid].a, fill = a.cap ? a.sum / a.cap : 0;
    const row = { season: S.season, att: a.sum, games: a.n, fill: r3(fill), rev: r3(rev), pay: r3(pay), ops: r3(ops), profit: r3(profit), m: r3(raw[tid].m), cap: t.arena.cap, value: r3(rev * valueMultiple(S.season)) };
    t.fin.hist.push(row); if (t.fin.hist.length > 80) t.fin.hist.shift();
    t.fin.hype = r3(Math.max(0, (t.fin.hype || 0) * 0.6 - 0.01));
    const o = S.owners[t.owner]; if (o) { o.cash = r3((o.cash || 0) + profit); o.books = (o.books || 0) + 1; }
    books[tid] = row;
  }
  return books;
}
function valueMultiple(season) { return season < 1970 ? 1.6 : season < 1985 ? 2.2 : season < 2000 ? 3.2 : season < 2012 ? 4.2 : 6.5; }
// what the owner can afford to spend (fraction of the cap), from his wallet, his market and his books
function payrollTarget(S, tid) {
  const t = S.teams[tid], o = S.owners[t.owner], h = t.fin && t.fin.hist.length ? t.fin.hist[t.fin.hist.length - 1] : null;
  const spend = o ? o.spend : 0.5, cash = o ? (o.cash || 0) : 0, wealth = o ? o.wealth : 3;
  const rich = h ? clamp((h.rev * playerShare(S) - 1) * 0.35, -0.12, 0.1) : 0; // revenue above or below the league's
  const hurting = cash < -0.2 * wealth ? -0.07 : h && h.profit < 0 ? -0.025 : 0;
  return P.capFor(S.season) * clamp(0.85 + 0.13 * spend + rich + hurting, 0.74, 1);
}

// ---------- the cap: a baseline that TV deals and labor deals bend ----------
function capMult(S, season) { const b = S.biz; if (!b) return 1; if (b.capHist[season] !== undefined) return b.capHist[season]; return b.capMult; }
function install(S) { P.setCapAdj(season => capMult(S, season)); }
function initLeague(S) {
  if (S.biz) { install(S); return; }
  const rng = makeRng(hashStr(S.masterSeed + ":biz") || 1);
  S.biz = { capMult: 1, capHist: {}, natFrac: 0.05, revShare: 0, share: 0.42,
    tv: { net: "Allied Television Network", from: S.season, thru: S.season + 3, frac: 0.05 }, tvHist: [],
    union: null, unionYear: 1962 + rng.int(0, 3), cba: { next: null, hist: [] }, fa: "reserve", max: false, rookieScale: false, lastMove: 0, moves: [] };
  S.biz.capHist[S.season] = 1;
  install(S);
}
// national TV: the share of revenue that comes from the network deal, by era (deals wobble around it)
function tvTarget(season) { return season < 1962 ? 0.05 : season < 1972 ? 0.1 : season < 1982 ? 0.15 : season < 1992 ? 0.24 : season < 2004 ? 0.31 : season < 2015 ? 0.36 : 0.44; }
const NETS = [[1954, ["Allied Television Network", "Continental Broadcasting"]], [1966, ["Continental Broadcasting", "United Broadcasting Company", "National Television Co."]],
  [1980, ["United Broadcasting Company", "Satellite Sports Network", "National Television Co."]], [1990, ["Satellite Sports Network", "Galaxy Sports", "UBC Sports"]],
  [2002, ["Galaxy Sports", "Titan Network", "SSN"]], [2016, ["Titan Network", "Galaxy Sports", "Streamline+"]]];
function tvDeal(S, rng, popularity, news) {
  const b = S.biz, old = b.tv, yrs = rng.int(3, 7), next = S.season + 1;
  const nets = NETS.filter(n => n[0] <= next).pop()[1];
  const frac = clamp(tvTarget(next) * (0.82 + 0.36 * popularity) * Math.exp(rng.normal(0, 0.08)), 0.03, 0.55);
  const jump = clamp(1 + (frac - b.natFrac) * 1.6, 0.95, 1.3); // a big new deal lifts the cap (players get their share)
  b.capMult = r3(clamp(b.capMult * jump, 0.75, 2.2));
  b.natFrac = r3(frac);
  const net = rng.chance(0.35) ? old.net : rng.pick(nets);
  b.tv = { net, from: next, thru: next + yrs - 1, frac: b.natFrac, jump: r3(jump) };
  b.tvHist.push(b.tv);
  const total = frac / playerShare(S) * S.active.length * yrs; // in cap units
  news("tv", `The UBL signs a ${yrs}-year national TV deal with ${net}${net === old.net ? " (renewed)" : ""}${jump >= 1.08 ? ": the salary cap is about to jump" : jump < 1 ? ": a flat deal, and a flat cap" : ""}`, { net, yrs, total: r3(total), jump: r3(jump) });
  return b.tv;
}
// collective bargaining. Every deal ends with games on schedule, but not without a fight.
function laborYear(S, rng, news) {
  const b = S.biz, next = S.season + 1, out = [];
  if (!b.union) return out;
  if (b.cba.next === null) b.cba.next = b.union + rng.int(2, 3);
  if (next < b.cba.next) return out;
  const terms = [];
  if (b.fa === "reserve" && next >= 1975) { b.fa = "free"; terms.push("free agency (the reserve clause is gone)"); }
  if (!b.revShare && next >= 1986) { b.revShare = 0.1; terms.push("revenue sharing between teams"); }
  else if (b.revShare < 0.2 && next >= 2010) { b.revShare = 0.2; terms.push("more revenue sharing"); }
  if (!b.rookieScale && next >= 1995) { b.rookieScale = true; terms.push("a rookie pay scale"); }
  if (!b.max && next >= 1998) { b.max = true; terms.push("a maximum contract"); }
  const dShare = clamp(rng.normal(next < 1990 ? 0.02 : 0.004, 0.012), -0.02, 0.04), share = clamp(b.share + dShare, 0.38, 0.53);
  b.capMult = r3(clamp(b.capMult * share / b.share, 0.75, 2.2)); b.share = r3(share);
  terms.push(`players' share of revenue ${dShare >= 0 ? "up" : "down"} to ${Math.round(share * 100)}%`);
  const fight = next < 1995 ? rng.pick(["strike", "strike", "lockout"]) : rng.pick(["lockout", "lockout", "strike"]);
  const how = rng.pick(["a deal is struck the night before opening day", "they settle after a three-week standoff in training camp", "a federal mediator gets it done with days to spare", "the owners blink first", "the players blink first"]);
  const e = { season: next, fight, terms, how };
  b.cba.hist.push(e); b.cba.next = next + rng.int(4, 7);
  news("cba", `Labor deal: after the threat of a ${fight}, ${how}. New terms: ${terms.join("; ")}. No games are lost.`, e);
  out.push(e);
  return out;
}

// ---------- relocation, sales and new arenas (each offseason) ----------
const reserved = (S, T) => new Set(T.TEAMS.filter(t => t.joined > S.season).map(t => t.id)); // a city promised an expansion team
function offseasonBiz(S, rng, T, H) {
  const out = [], news = H.news;
  for (const tid of S.active) {
    const t = S.teams[tid], o = S.owners[t.owner]; if (!o) continue;
    const fh = t.fin.hist.slice(-3), fill3 = fh.length ? fh.reduce((a, x) => a + x.fill, 0) / fh.length : 0.8;
    const loss3 = fh.filter(x => x.profit < 0).length, m = market(cityOf(S, tid), S.season), age = S.season - t.arena.built;
    // 1. an owner who can't cover the losses sells (or is forced to)
    const limit = 0.45 * o.wealth, cash = o.cash || 0;
    if (S.season - o.from >= 2 && (cash < -limit || (loss3 >= 3 && cash < -0.15 * o.wealth && rng.chance(0.25 + 0.4 * (1 - o.patience))))) {
      const broke = cash < -limit, n = H.sellTeam(tid, broke ? "forced sale" : "sale");
      n.cash = 0;
      // out-of-town money: a buyer who means to move the team
      if (m < 0.55 && fill3 < 0.72 && rng.chance(0.45 + (0.55 - m))) n.moveTo = pickCity(S, tid, rng, T);
      news("sale", `${broke ? "Broke, " : ""}{o:${o.id}} sells the {t:${tid}} to {o:${n.id}}${n.moveTo ? `, who has his eye on ${cityName(n.moveTo)}` : ""}`, { team: tid, from: o.id, to: n.id, broke });
    }
    // 2. an old barn, or a team that can't draw: build, or move
    const own = S.owners[t.owner];
    const distress = (fill3 < 0.62 ? (0.62 - fill3) * 3 : 0) + (loss3 >= 2 ? 0.3 : 0) + (age > 32 ? 0.25 : 0) + (m < 0.3 ? 0.2 : 0) + (own.moveTo ? 0.6 : 0);
    if (own.moveTo === cityOf(S, tid)) own.moveTo = null;
    if (S.season >= 1957 && distress >= 0.6 && S.season - (S.biz.lastMove || 0) >= 4 && S.season - (t.joinedCity || t.joined) >= 6) {
      if (rng.chance(clamp(0.055 * distress + (own.moveTo ? 0.28 : 0), 0, 0.6))) {
        // the city gets one chance to keep them: a new arena
        if (rng.chance(clamp(0.38 + 0.35 * m - (own.moveTo ? 0.12 : 0), 0.15, 0.75))) {
          newArena(S, tid, rng, true);
          own.moveTo = null;
          news("arena", `{t:${tid}} stay put: ${cityName(cityOf(S, tid))} builds them a new arena, the ${t.arena.name} (${t.arena.cap.toLocaleString()} seats)`, { team: tid });
        } else {
          const to = own.moveTo || pickCity(S, tid, rng, T);
          own.moveTo = null;
          if (to && to !== cityOf(S, tid)) { const from = cityOf(S, tid); relocate(S, tid, to, rng); out.push({ team: tid, from, to }); news("move", `The {t:${tid}} are moving: ${cityName(from)} loses its team to ${cityName(to)}`, { team: tid, from, to }); H.log("relocate", { team: tid, from, to }); }
        }
      } else if (rng.chance(0.25)) news("threat", `{o:${own.id}} says the {t:${tid}} can't survive in ${cityName(cityOf(S, tid))} without a new arena`, { team: tid });
    } else if (age > 35 && rng.chance(0.2 + 0.2 * m)) {
      newArena(S, tid, rng, false);
      news("arena", `The {t:${tid}} open the ${t.arena.name} (${t.arena.cap.toLocaleString()} seats)`, { team: tid });
    }
  }
  return out;
}
function newArena(S, tid, rng, cityPays) {
  const t = S.teams[tid], city = cityName(cityOf(S, tid));
  t.arena = { name: arenaName(rng, S.season, city), cap: Math.round((eraCapacity(S.season) + rng.int(-900, 900)) / 100) * 100, built: S.season, debt: cityPays ? null : { amt: 0.05, thru: S.season + 12 } };
  t.fin.hype = r3((t.fin.hype || 0) + 0.15);
  (t.arenas = t.arenas || []).push({ name: t.arena.name, from: S.season, cap: t.arena.cap });
}
function pickCity(S, tid, rng, T) {
  const taken = new Set(S.active.map(x => cityOf(S, x))), res = reserved(S, T), here = cityOf(S, tid), cand = [];
  for (const key in CITY) {
    if (taken.has(key) || res.has(key)) continue;
    let w = Math.pow(pop(key, S.season), 1.25);
    for (const x of S.active) if (x !== tid && milesBetween(key, cityOf(S, x)) < 110) w *= 0.25; // someone else's market
    if ((S.biz.moves || []).some(mv => mv.from === key && S.season - mv.season < 15)) w *= 0.2; // they just lost a team
    if (milesBetween(key, here) < 60) w *= 1.5; // a short move up the road to the big city
    cand.push([key, w]);
  }
  if (!cand.length) return null;
  const tot = cand.reduce((a, c) => a + c[1], 0); let x = rng.next() * tot;
  for (const [k, w] of cand) { x -= w; if (x <= 0) return k; }
  return cand[0][0];
}
function relocate(S, tid, to, rng) {
  const t = S.teams[tid], from = cityOf(S, tid);
  (t.cities = t.cities || [{ city: from, from: t.joined }]).push({ city: to, from: S.season });
  t.city = to; t.joinedCity = S.season;
  newArena(S, tid, rng, true);
  t.fin.hype = r3((t.fin.hype || 0) + 0.25);
  S.biz.lastMove = S.season; (S.biz.moves = S.biz.moves || []).push({ season: S.season, team: tid, from, to });
}
function abbrOf(S, tid) { return cityOf(S, tid) === tid ? tid : cityOf(S, tid); }

const API = { CITY, pop, market, geo, cityName, cityOf, milesBetween, initTeam, initLeague, install, attendance, seasonBooks, payrollTarget, capMult, tvDeal, laborYear, offseasonBiz, newArena, valueMultiple, abbrOf, eraCapacity };
if (NODE) module.exports = API; else window.BB = Object.assign(window.BB || {}, API);
})();
