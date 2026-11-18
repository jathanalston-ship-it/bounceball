// ===================== PLAYERS: generation, ratings, development, value =====================
"use strict";
(function () {
const E = (typeof module !== "undefined" && module.exports) ? require("./engine.js") : window.BB;
const { clamp, makeRng } = E;

const RKEYS = ["spd","acc","str","vert","bnc","hands","sec","brk","tck","ins","mid","thr","fr","ft","pas","iq","perD","rim","reb","sta"];
const RLABEL = { spd:"Speed", acc:"Acceleration", str:"Strength", vert:"Vertical", bnc:"Bounce Control", hands:"Hands", sec:"Ball Security", brk:"Break Tackle", tck:"Tackling", ins:"Finishing", mid:"Mid-Range", thr:"Three", fr:"Four", ft:"Free Throw", pas:"Passing", iq:"IQ", perD:"Perimeter D", rim:"Rim Protection", reb:"Rebounding", sta:"Stamina" };
const PHYS = new Set(["spd","acc","vert","sta","bnc","str"]);
const ROLES = {
  PG:      { name:"Point Guard", ht:[72,77], wt:[175,200], mods:{spd:14,acc:14,pas:20,sec:16,iq:10,thr:8,mid:6,perD:8,ft:10,hands:6,str:-8,reb:-10,rim:-15,tck:-6}, sig:["pas","spd","thr","sec"], w:{pas:3,sec:2,spd:2,thr:2,mid:1,iq:2,perD:1,ins:1} },
  WING:    { name:"Wing", ht:[76,80], wt:[195,220], mods:{thr:10,mid:10,ins:10,perD:12,spd:6,brk:6,hands:4,rim:-6}, sig:["ins","thr","perD","vert"], w:{ins:2,thr:2,mid:2,perD:2,spd:1,brk:1,vert:1} },
  SNIPER:  { name:"Sniper", ht:[75,79], wt:[185,210], mods:{fr:24,thr:18,ft:14,mid:6,iq:4,tck:-10,str:-8,rim:-10,brk:-6}, sig:["fr","thr","mid"], w:{fr:4,thr:2,mid:1,ft:1,iq:1} },
  BRUISER: { name:"Bruiser", ht:[77,81], wt:[225,255], mods:{tck:24,str:18,brk:16,reb:8,perD:6,ins:4,thr:-10,fr:-18,pas:-4}, sig:["tck","str","brk"], w:{tck:3,str:2,brk:2,reb:1,perD:1,ins:1} },
  BIG:     { name:"Big", ht:[81,86], wt:[235,275], mods:{rim:22,reb:22,ins:14,str:10,vert:4,thr:-16,fr:-22,spd:-8,sec:-8,acc:-6}, sig:["rim","reb","ins","vert"], w:{rim:3,reb:3,ins:2,str:1,vert:1} }
};
const ROLE_LIST = ["PG","WING","SNIPER","BRUISER","BIG"];
const FIRST = ["Marcus","Deshawn","Tyler","Andre","Cole","Jalen","Brock","Devin","Isaiah","Malik","Trey","Hunter","Darius","Wes","Reggie","Calvin","Otis","Lamar","Dante","Grant","Rashad","Kyle","Mason","Theo","Jerome","Nico","Elijah","Quentin","Boone","Cash","Rollie","Dwayne","Spencer","Terrell","Austin","Bryce","Cyrus","Desmond","Emmett","Felix","Garrett","Hollis","Ike","Jace","Kendrick","Luther","Monty","Nate","Orlando","Percy","Rufus","Sterling","Tobias","Vance","Wendell","Xavier","Yusuf","Zeke","Amos","Beau","Clint","Duke","Ezra","Lonnie","Hank","Moses","Walt","Earl","Chester","Virgil","Leroy","Floyd","Buck","Howard","Lyle","Gus","Dale","Ray","Roy","Curtis","Darnell","Jamal","Tavon","Kobe","Trevon","Zion","Ja","Luka","Bronson","Colt","Ryder","Maddox","Kai","Dmitri","Mateo","Santiago","Kenji","Obi","Tariq","Nasir","Femi","Lars","Arvid","Pavel","Goran","Bogdan","Rico","Hector"];
const LAST = ["Abernathy","Banks","Calloway","Dunlap","Ellison","Fairbanks","Gaines","Hargrove","Ingram","Jefferson","Kowalski","Lindqvist","McAllister","Nwosu","Okafor","Pruitt","Quarles","Rourke","Salazar","Thibodeaux","Underwood","Vasquez","Whitfield","Yancey","Zielinski","Brannigan","Castellanos","Delacroix","Esposito","Fontaine","Gallagher","Holloway","Jankowski","Kincaid","Lombardi","Mbeki","Novak","O'Shea","Petrakis","Ramsey","Sorensen","Tolliver","Upshaw","Vandermeer","Washburn","Adeyemi","Boudreaux","Crenshaw","Dombrowski","Etheridge","Fitzhugh","Grimsley","Haddad","Kozlov","Larkin","Mancuso","Ndiaye","Ostrowski","Pickett","Rasmussen","Stallworth","Tran","Valdez","Winslow","Coldwell","Dabney","Easley","Ferrante","Hightower","Jablonski","Kruger","Muldoon","Szabo","Achterberg","Barlow","Corcoran","Dupree","Eastwood","Flanagan","Greer","Hatcher","Ivey","Jessup","Keogh","Lattimore","Merriweather","Nash","Oduya","Prentiss","Quinlan","Rudd","Sheffield","Tatum","Umberger","Vance","Weatherspoon","Yost","Zamora","Bianchi","Cardenas","Dubois","Eriksen","Fujita","Gutierrez","Horvat","Iwu","Jovanovic","Kaminski","Lebedev","Moreau","Nakamura","Oyelaran","Popescu","Reyes","Schultz","Takahashi","Ulrich","Varga","Wojcik"];

// first names follow the era a player was born in
const FIRST_OLD = ["Walt","Earl","Chester","Virgil","Leroy","Floyd","Buck","Howard","Lyle","Gus","Dale","Ray","Roy","Hank","Moses","Otis","Rufus","Percy","Wendell","Luther","Monty","Amos","Clint","Duke","Lonnie","Hollis","Ike","Rollie","Calvin","Emmett","Sterling","Vance","Orlando","Grant","Harold","Bernard","Clarence","Melvin","Elmer","Herb","Stan","Ernie","Mack","Virgil","Cecil","Wilbur","Norm","Lloyd"];
const FIRST_MID = ["Marcus","Andre","Darius","Reggie","Lamar","Dante","Rashad","Kyle","Jerome","Quentin","Dwayne","Spencer","Terrell","Austin","Bryce","Desmond","Garrett","Kendrick","Nate","Tobias","Xavier","Yusuf","Zeke","Beau","Curtis","Darnell","Jamal","Tyler","Cole","Devin","Isaiah","Malik","Trey","Hunter","Wes","Mason","Theo","Nico","Elijah","Felix","Ezra","Cyrus","Boone","Cash","Derek","Shawn","Corey","Lance"];
const FIRST_NEW = ["Ja","Zion","Luka","Kobe","Trevon","Tavon","Bronson","Colt","Ryder","Maddox","Kai","Mateo","Santiago","Kenji","Obi","Tariq","Nasir","Femi","Jalen","Deshawn","Brock","Jace","Dmitri","Lars","Arvid","Pavel","Goran","Bogdan","Rico","Hector","Jaylen","Zaire","Cade","Brayden"];
function pickFirst(rng, born) {
  const w = born < 1945 ? [0.75, 1.0] : born < 1965 ? [0.4, 0.95] : born < 1985 ? [0.08, 0.72] : [0.02, 0.45];
  const x = rng.next();
  return rng.pick(x < w[0] ? FIRST_OLD : x < w[1] ? FIRST_MID : FIRST_NEW);
}
function overall(p) {
  const w = ROLES[p.role].w; let s = 0, ws = 0;
  for (const k in w) { s += p.r[k] * w[k]; ws += w[k]; }
  return Math.round(clamp(54 + (s / ws - 50) * 1.4, 35, 99));
}
// q shifts every rating; a rookie gets q around -10 (raw), veterans in an initial league around 0
function genPlayer(rng, role, q, id, season, age) {
  const R = ROLES[role];
  const htM = (R.ht[0] + R.ht[1]) / 2, wtM = (R.wt[0] + R.wt[1]) / 2;
  const ht = Math.round(rng.range(R.ht[0], R.ht[1]) + rng.normal(0, 1));
  const wt = Math.round(rng.range(R.wt[0], R.wt[1]) + (ht - htM) * 4 + rng.normal(0, 6));
  const wing = ht + Math.round(rng.normal(3, 2));
  if (age === undefined) age = Math.round(clamp(rng.normal(26.5, 3.6), 20, 37));
  const r = {};
  for (const k of RKEYS) r[k] = rng.normal(46 + q, 8);
  for (const k in R.mods) r[k] += R.mods[k];
  r.str += (wt - wtM) * 0.3; r.spd -= (wt - wtM) * 0.18; r.acc -= (wt - wtM) * 0.15; r.brk += (wt - wtM) * 0.2;
  r.reb += (ht - htM) * 1.6; r.rim += (ht - htM) * 1.4; r.spd -= (ht - htM) * 0.8; r.sec -= (ht - htM) * 0.5;
  // age curve for a generated (not developed) player
  const phys = age < 27 ? -(27 - age) * 0.6 : age > 30 ? -(age - 30) * 2.2 : 0;
  const skill = age < 25 ? -(25 - age) * 1.2 : age > 33 ? -(age - 33) * 1.0 : 0;
  for (const k of ["spd","acc","vert","sta"]) r[k] += phys;
  for (const k of ["pas","mid","thr","fr","ft"]) r[k] += skill;
  r.iq += (age - 25) * 0.9;
  let tier = 0;
  if (rng.chance(1 / 200)) {
    tier = 2; const a = rng.pick(R.sig); const b = rng.pick(R.sig.filter(k => k !== a));
    r[a] = Math.max(r[a], 90) + rng.range(2, 9); r[b] = Math.max(r[b], 88) + rng.range(0, 8);
  } else if (rng.chance(1 / 20)) {
    tier = 1; const a = rng.pick(R.sig); r[a] = Math.max(r[a] + 18, 86) + rng.range(0, 6);
  }
  for (const k of RKEYS) r[k] = Math.round(clamp(r[k], 20, 99));
  const p = {
    id, role, first: pickFirst(rng, season - age), last: rng.pick(LAST), ht, wt, wing, born: season - age, r, tier,
    drive: Math.round(clamp(rng.normal(50, 18), 1, 99)),   // hidden: who blooms, who wastes it
    aggr: Math.round(clamp(rng.normal(0.5, 0.2), 0, 1) * 100) / 100,
    trouble: Math.round(clamp(rng.normal(0.25, 0.18), 0, 1) * 100) / 100, // hidden: off-court risk (used in phase 4)
    num: 0, team: null, contract: null, injury: null, retired: null, draft: null, hof: null
  };
  p.ovr = overall(p);
  return p;
}

// Yearly development. age = age during the coming season.
function develop(p, rng, season, coachDev) {
  const age = season - p.born;
  const d = (p.drive - 50) / 50; // -1..1
  const cdev = age <= 27 ? (coachDev || 0) * 0.6 : 0; // a good development coach adds up to ~0.6/yr to young players
  let g;
  if (age <= 21) g = 2.3; else if (age <= 23) g = 1.6; else if (age <= 25) g = 0.8; else if (age <= 27) g = 0.15;
  else if (age <= 29) g = -0.6; else if (age <= 31) g = -1.5; else if (age <= 33) g = -2.5; else if (age <= 35) g = -3.6; else g = -5;
  g += age <= 28 ? d * 1.6 : d * 0.7;
  g += cdev;              // drive: late bloomers vs. wasted talent; also slows decline
  const shock = rng.normal(0, 1.1);               // breakout / bust year
  for (const k of RKEYS) {
    let gk = g;
    if (PHYS.has(k)) gk = g < 0 ? g * 1.5 : g * 0.8; else gk = g < 0 ? g * 0.55 : g * 1.05;
    if (k === "iq") gk = age <= 32 ? 1.2 + d * 0.4 : -0.6;
    if (k === "str" && age <= 29) gk += 0.6;
    p.r[k] = Math.round(clamp(p.r[k] + gk + shock * (PHYS.has(k) ? 0.6 : 1) + rng.normal(0, 0.9), 20, 99));
  }
  if (age > 28) p.wt += rng.int(0, 2);
  p.ovr = overall(p);
}

// Hard cap grows ~8.4%/yr: $120k in 1954 → ~$40M by 2026
function capFor(season) { return Math.round(120000 * Math.pow(1.084, season - 1954) / 1000) * 1000; }
function salaryShare(ovr) { return clamp(0.012 * Math.exp((ovr - 50) * 0.1), 0.015, 0.30); }
function askingSalary(p, season) {
  const age = season - p.born;
  let v = p.ovr + (age < 25 ? (25 - age) * 0.8 : 0) - (age > 31 ? (age - 31) * 1.5 : 0);
  return Math.round(capFor(season) * salaryShare(v) / 1000) * 1000;
}
function minSalary(season) { return Math.round(capFor(season) * 0.015 / 1000) * 1000; }
// What a front office thinks a player is worth (they can't see drive)
function tradeValue(p, season, mode) {
  const age = season - p.born;
  const fut = p.ovr + clamp(26 - age, -8, 6) * 1.6;
  const v = mode === "rebuild" ? fut * 0.75 + p.ovr * 0.25 : mode === "contend" ? p.ovr * 0.85 + fut * 0.15 : p.ovr * 0.55 + fut * 0.45;
  return Math.pow(Math.max(0, v - 40), 1.8);
}
function age(p, season) { return season - p.born; }
function displayName(p) { return p.first + " " + p.last; }

const API = { FIRST, LAST, pickFirst, RKEYS, RLABEL, ROLES, ROLE_LIST, overall, genPlayer, develop, capFor, salaryShare, askingSalary, minSalary, tradeValue, age, displayName };
if (typeof module !== "undefined" && module.exports) module.exports = API;
else window.BB = Object.assign(window.BB || {}, API);
})();
