// ===================== CARDS: rarity tiers, collections, badges =====================
// Rules only (no DOM). The indexer (scripts/build-index.js) uses these to decide which cards
// every player earned; the viewer (site/cards.js) uses them to draw the cards.
"use strict";
(function () {
const NODE = typeof module !== "undefined" && module.exports;
const P = NODE ? require("./players.js") : window.BB;

// Rarity comes from the card's overall. Base cards top out around 85-90; collection boosts
// are what push a season into Diamond, Opal or Vulcanized.
const TIERS = [
  { key: "rubber",   name: "Rubber",     min: 0 },
  { key: "bronze",   name: "Bronze",     min: 60 },
  { key: "silver",   name: "Silver",     min: 65 },
  { key: "gold",     name: "Gold",       min: 70 },
  { key: "emerald",  name: "Emerald",    min: 75 },
  { key: "sapphire", name: "Sapphire",   min: 78 },
  { key: "ruby",     name: "Ruby",       min: 81 },
  { key: "amethyst", name: "Amethyst",   min: 84 },
  { key: "diamond",  name: "Diamond",    min: 87 },
  { key: "opal",     name: "Opal",       min: 90 },
  { key: "vulcan",   name: "Vulcanized", min: 94 }
];
function tierFor(ovr) { let t = TIERS[0]; for (const x of TIERS) if (ovr >= x.min) t = x; return t; }

const POS = { PG: "PG", WING: "WNG", SNIPER: "SNP", BRUISER: "BRU", BIG: "BIG" };

// Attribute groups (every rating appears once). Group score = average of its ratings.
const GROUPS = [
  { key: "shoot",   name: "Shooting",    keys: ["mid", "thr", "fr", "ft"] },
  { key: "inside",  name: "Interior",    keys: ["ins", "reb", "hands"] },
  { key: "play",    name: "Playmaking",  keys: ["pas", "sec", "iq"] },
  { key: "ath",     name: "Athleticism", keys: ["spd", "acc", "vert", "bnc", "sta"] },
  { key: "contact", name: "Contact",     keys: ["str", "tck", "brk"] },
  { key: "def",     name: "Defense",     keys: ["perD", "rim"] }
];
function groupScores(r) { const o = {}; for (const g of GROUPS) o[g.key] = Math.round(g.keys.reduce((s, k) => s + r[k], 0) / g.keys.length); return o; }

// Badges: a weighted blend of ratings, graded Bronze / Silver / Gold / Hall of Fame.
const BADGES = [
  { key: "deep",    name: "Deep Range",       d: "Lives behind the 30-foot line", w: { fr: 1 } },
  { key: "splash",  name: "Catch & Splash",   d: "Threes in rhythm", w: { thr: 1 } },
  { key: "mid",     name: "Midrange Maestro", d: "Pull-ups from the elbow", w: { mid: 1 } },
  { key: "ice",     name: "Ice Water",        d: "Free throws", w: { ft: 1 } },
  { key: "poster",  name: "Posterizer",       d: "Finishes through contact, above the rim", w: { ins: 1, vert: 1 } },
  { key: "pogo",    name: "Pogo Stick",       d: "Gets everything out of the rubber", w: { vert: 1, bnc: 1 } },
  { key: "jets",    name: "Afterburners",     d: "End-to-end speed", w: { spd: 1, acc: 1 } },
  { key: "wall",    name: "Brick Wall",       d: "Doesn't move when you hit him", w: { str: 1 } },
  { key: "wreck",   name: "Wrecking Ball",    d: "Puts ball handlers on the floor", w: { tck: 2, str: 1 } },
  { key: "grease",  name: "Greased",          d: "Slips out of tackles", w: { brk: 2, sec: 1 } },
  { key: "vise",    name: "Vise Grip",        d: "Never coughs it up", w: { sec: 1, hands: 1 } },
  { key: "dimes",   name: "Dime Dropper",     d: "Threads passes", w: { pas: 1 } },
  { key: "general", name: "Floor General",    d: "Runs the offense", w: { iq: 1, pas: 1 } },
  { key: "clamps",  name: "Clamps",           d: "Perimeter lockdown", w: { perD: 1 } },
  { key: "eraser",  name: "Eraser",           d: "Protects the rim", w: { rim: 1 } },
  { key: "glass",   name: "Glass Cleaner",    d: "Owns the boards", w: { reb: 1 } },
  { key: "lungs",   name: "Iron Lungs",       d: "Never tires", w: { sta: 1 } },
  { key: "pick",    name: "Pickpocket",       d: "Quick hands on defense", w: { perD: 1, hands: 1 } }
];
const BADGE_TIERS = [{ key: "hof", name: "Hall of Fame", min: 93 }, { key: "gold", name: "Gold", min: 87 }, { key: "silver", name: "Silver", min: 81 }, { key: "bronze", name: "Bronze", min: 75 }];
function badges(r) {
  const out = [];
  for (const b of BADGES) {
    let s = 0, ws = 0; for (const k in b.w) { s += r[k] * b.w[k]; ws += b.w[k]; }
    const v = s / ws, t = BADGE_TIERS.find(x => v >= x.min);
    if (t) out.push({ key: b.key, name: b.name, d: b.d, tier: t.key, tierName: t.name, v: Math.round(v) });
  }
  const rank = { hof: 0, gold: 1, silver: 2, bronze: 3 };
  return out.sort((a, b) => rank[a.tier] - rank[b.tier] || b.v - a.v);
}

// ---------- league calendar ----------
// Game days are numbered; the calendar spreads them from the third week of October to mid-April
// and always puts a game day on the holidays below. Playoff games follow every other day.
const DAY = 86400000;
const iso = t => new Date(t).toISOString().slice(0, 10);
function nthWeekday(y, m, wd, n) { const d = new Date(Date.UTC(y, m, 1)); const off = (wd - d.getUTCDay() + 7) % 7; return Date.UTC(y, m, 1 + off + 7 * (n - 1)); }
function holidaysOf(season) {
  const y = season, y2 = season + 1, H = [];
  const add = (t, k) => H.push([t, k]);
  add(Date.UTC(y, 9, 31), "halloween"); add(nthWeekday(y, 10, 4, 4), "thanksgiving"); add(Date.UTC(y, 11, 25), "christmas"); add(Date.UTC(y, 11, 31), "newyear");
  add(Date.UTC(y2, 1, 14), "valentine"); if (new Date(Date.UTC(y2, 1, 29)).getUTCMonth() === 1) add(Date.UTC(y2, 1, 29), "leapday");
  add(Date.UTC(y2, 2, 14), "piday"); add(Date.UTC(y2, 2, 17), "stpatricks"); add(Date.UTC(y2, 3, 1), "aprilfools");
  for (const [yy, m] of [[y, 9], [y, 10], [y, 11], [y2, 0], [y2, 1], [y2, 2], [y2, 3]]) { const t = Date.UTC(yy, m, 13); if (new Date(t).getUTCDay() === 5) add(t, "friday13"); }
  return H;
}
const calCache = {};
// returns { date(day) -> "YYYY-MM-DD", holiday(day) -> [keys], start, end }
function seasonCalendar(season, regDays) {
  const ck = season + ":" + regDays; if (calCache[ck]) return calCache[ck];
  let start = Date.UTC(season, 9, 20); while (new Date(start).getUTCDay() !== 2) start += DAY; // a Tuesday in late October
  const end = Date.UTC(season + 1, 3, 12), span = Math.round((end - start) / DAY), N = Math.max(2, regDays);
  // game nights cluster like a real schedule: some back-to-backs, some three-day breaks, the same average spacing
  let sd = (season * 2654435761) >>> 0; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
  const gaps = Array.from({ length: N - 1 }, () => { const x = rnd(); return x < 0.18 ? 1 : x < 0.36 ? 3 : 2; });
  let tot = gaps.reduce((a, b) => a + b, 0);
  for (let guard = 0; tot !== span && guard < 200000; guard++) { const j = Math.floor(rnd() * gaps.length); if (tot < span && gaps[j] < 4) { gaps[j]++; tot++; } else if (tot > span && gaps[j] > 1) { gaps[j]--; tot--; } }
  const slots = [0]; for (const g of gaps) slots.push(slots[slots.length - 1] + g);
  const fixed = new Set([0, slots[slots.length - 1]]);
  const hol = holidaysOf(season).map(([t, k]) => [Math.round((t - start) / DAY), k]).filter(([o]) => o > 0 && o < span);
  for (const [o] of hol) {
    if (slots.includes(o)) { fixed.add(o); continue; }
    let bi = -1, bd = 1e9; slots.forEach((x, i) => { if (fixed.has(x)) return; const d = Math.abs(x - o); if (d < bd) { bd = d; bi = i; } });
    if (bi >= 0) { slots[bi] = o; fixed.add(o); }
  }
  slots.sort((a, b) => a - b);
  const byOff = {}; for (const [o, k] of hol) (byOff[o] = byOff[o] || []).push(k);
  const cal = {
    start, end, regDays: N,
    time: day => day < N ? start + slots[day] * DAY : end + (4 + 2 * (day - N)) * DAY,
    date: day => iso(cal.time(day)),
    holiday: day => day === 0 ? ["opening"] : day < N ? byOff[slots[day]] || [] : []
  };
  return (calCache[ck] = cal);
}
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function shortDate(isoDate) { const [y, m, d] = isoDate.split("-").map(Number); return `${MON[m - 1]} ${d}`; }

// ---------- collections ----------
// kind: base (every season) | leader (top of a stat that season) | award | special
// boost: ratings raised on the card (each by 2x the card's bump), or "all" (each by the bump)
const COLLECTIONS = [
  { key: "base",        name: "Base",               kind: "base",    group: "base",    pose: "stand",     blurb: "Every player, every season, rated as the season tipped off." },
  // season leaders
  { key: "posterized",  name: "Posterized",         kind: "leader",  group: "leaders", stat: "dnk", unit: "dunks",          pose: "dunk",      poses: ["dunk", "dunk", "hangrim"], boost: ["vert", "ins", "str"],  blurb: "The season's top dunkers. On a floor that adds a foot to your vertical, somebody has to lead the league in it." },
  { key: "swat",        name: "Swat Team",          kind: "leader",  group: "leaders", stat: "blk", unit: "blocks",         pose: "block",     boost: ["rim", "vert", "perD"], blurb: "Blocks and swats, including the legal ones off the rim on twos." },
  { key: "wrecking",    name: "Wrecking Crew",      kind: "leader",  group: "leaders", stat: "tkl", unit: "tackles",        pose: "tackle",    boost: ["tck", "str", "acc"],   blurb: "Ball handlers put on the rubber. Every one is a turnover." },
  { key: "escape",      name: "Escape Artists",     kind: "leader",  group: "leaders", stat: "btk", unit: "broken tackles", short: "BTK", pose: "stiffarm", boost: ["brk", "sec", "str"], blurb: "Hit, wrapped up, and still standing with the ball." },
  { key: "fouralarm",   name: "Four Alarm",         kind: "leader",  group: "leaders", stat: "fpm", unit: "fours",          pose: "shoot",     poses: ["shoot", "fadeaway"], boost: ["fr", "thr", "ft"], blurb: "Most fours made from 30 feet and beyond." },
  { key: "splash",      name: "Splash Zone",        kind: "leader",  group: "leaders", stat: "tpm", unit: "threes",         pose: "shoot",     poses: ["shoot", "fadeaway"], boost: ["thr", "mid", "ft"], blurb: "Most threes made." },
  { key: "dimes",       name: "Dime Store",         kind: "leader",  group: "leaders", stat: "ast", unit: "assists",        pose: "pass",      boost: ["pas", "iq", "hands"],  blurb: "The season's assist leaders." },
  { key: "boards",      name: "Board Room",         kind: "leader",  group: "leaders", stat: "reb", unit: "rebounds",       pose: "rebound",   boost: ["reb", "vert", "str"],  blurb: "The season's rebounding leaders." },
  { key: "pickpockets", name: "Pickpockets",        kind: "leader",  group: "leaders", stat: "stl", unit: "steals",         pose: "steal",     boost: ["perD", "hands", "spd"], blurb: "Steals leaders." },
  { key: "buckets",     name: "Bucket Brigade",     kind: "leader",  group: "leaders", stat: "ppg", unit: "points per game", short: "PPG", pose: "dribble", poses: ["dribble", "fadeaway", "crossover"], boost: ["ins", "mid", "thr"], blurb: "The league's top scorers by points per game (60% of games played)." },
  // moments & feats
  { key: "moments",     name: "Moments",            kind: "moment",  group: "feats",   bump: 3, pose: "fadeaway", boost: "all", frame: "film", blurb: "The best single game of the season in points, rebounds, assists, tackles, dunks and fours. Every card links to the replay." },
  { key: "fifty",       name: "Fifty Club",         kind: "special", group: "feats",   bump: 4, pose: "fadeaway", poses: ["fadeaway", "point"], boost: ["ins", "mid", "thr", "fr"], blurb: "Scored 50 or more in a game that season." },
  { key: "tripledouble", name: "Triple Threat",     kind: "leader",  group: "feats",   custom: true, unit: "triple-doubles", short: "TRIPLE-DBL", pose: "point", boost: ["pas", "reb", "iq"], blurb: "The season's leaders in triple-doubles (any three of points, rebounds, assists, steals, blocks and tackles in double figures)." },
  { key: "postseason",  name: "Postseason Heat",    kind: "leader",  group: "feats",   custom: true, unit: "playoff PPG", short: "PLAYOFF PPG", pose: "fadeaway", poses: ["fadeaway", "celebrate"], boost: ["ins", "mid", "iq"], blurb: "The top scorers of each postseason (four or more playoff games)." },
  // holidays & events (from each game's star, on the league calendar)
  { key: "opening",     name: "Opening Night",      kind: "holiday", group: "holidays", hol: "opening", pose: "point", poses: ["point", "celebrate", "fadeaway"], blurb: "The best performance on the first night of the season." },
  { key: "halloween",   name: "Halloween Haunt",    kind: "holiday", group: "holidays", hol: "halloween", pose: "fadeaway", poses: ["fadeaway", "dunk", "crossover"], frame: "spooky", blurb: "The scariest game played on Halloween." },
  { key: "thanksgiving", name: "Thanksgiving Feast", kind: "holiday", group: "holidays", hol: "thanksgiving", pose: "celebrate", poses: ["celebrate", "dribble", "fadeaway"], frame: "autumn", blurb: "Who ate on Thanksgiving." },
  { key: "christmas",   name: "Christmas Day",      kind: "holiday", group: "holidays", hol: "christmas", pose: "celebrate", poses: ["celebrate", "dunk", "point"], frame: "candycane", blurb: "The league's marquee day: the best game played on Christmas." },
  { key: "newyear",     name: "New Year's Eve",     kind: "holiday", group: "holidays", hol: "newyear", pose: "celebrate", poses: ["celebrate", "fadeaway", "point"], frame: "glitter", blurb: "Rang in the new year with the best game of December 31." },
  { key: "valentine",   name: "Heartbreakers",      kind: "holiday", group: "holidays", hol: "valentine", pose: "crossover", poses: ["crossover", "fadeaway", "dunk"], frame: "hearts", blurb: "Broke somebody's heart on Valentine's Day." },
  { key: "leapday",     name: "Leap Day",           kind: "holiday", group: "holidays", hol: "leapday", pose: "dunk", poses: ["dunk", "block", "hangrim"], blurb: "Only in leap years: the best game on February 29." },
  { key: "piday",       name: "Pi Day",             kind: "holiday", group: "holidays", hol: "piday", pose: "shoot", poses: ["shoot", "fadeaway"], frame: "chalk", blurb: "March 14 (3.14). Math says this was the best game of the day." },
  { key: "stpatricks",  name: "Luck of the Irish",  kind: "holiday", group: "holidays", hol: "stpatricks", pose: "fadeaway", poses: ["fadeaway", "dribble", "celebrate"], frame: "clover", blurb: "The best game on St. Patrick's Day." },
  { key: "aprilfools",  name: "April Fools",        kind: "holiday", group: "holidays", hol: "aprilfools", pose: "crossover", poses: ["crossover", "stiffarm", "pass"], frame: "jester", blurb: "No joke: the best game on April 1." },
  { key: "friday13",    name: "Friday the 13th",    kind: "holiday", group: "holidays", hol: "friday13", pose: "tackle", poses: ["tackle", "block", "guard"], frame: "cracked", blurb: "The unluckiest date on the calendar. One card for the season's best game on any Friday the 13th." },
  { key: "dunktober",   name: "Dunktober",          kind: "leader",  group: "holidays", custom: true, unit: "dunks in a game", short: "DNK", pose: "dunk", poses: ["dunk", "hangrim"], blurb: "October's three biggest single-game dunk shows each season." },
  { key: "game7",       name: "Game 7",             kind: "holiday", group: "holidays", pose: "celebrate", poses: ["celebrate", "fadeaway", "point"], frame: "game7", blurb: "The best player on the winning side of every Game 7." },
  { key: "witness",     name: "Classic Nights",     kind: "witness", group: "classic", bump: 4, pose: "celebrate", poses: ["celebrate", "point", "fadeaway"], boost: "all", frame: "film", blurb: "A big night you watched on Classic Nights. One-off cards: they only drop for whoever saw the game." },
  // awards
  { key: "mvp",         name: "Most Valuable",      kind: "award",   group: "awards",  award: "mvp",  bump: 6, pose: "trophy",    boost: "all", blurb: "League MVP." },
  { key: "fmvp",        name: "Finals MVP",         kind: "award",   group: "awards",  award: "fmvp", bump: 5, pose: "trophy",    boost: "all", blurb: "Best player on the champion in the Finals." },
  { key: "dpoy",        name: "Lockdown",           kind: "award",   group: "awards",  award: "dpoy", bump: 5, pose: "guard",     boost: ["perD", "rim", "tck"], blurb: "Defensive Player of the Year." },
  { key: "roy",         name: "Rookie of the Year", kind: "award",   group: "awards",  award: "roy",  bump: 4, pose: "dribble",   poses: ["dribble", "crossover"], boost: "all", blurb: "The best first-year player." },
  { key: "champ",       name: "Ring Bearers",       kind: "award",   group: "awards",  award: "champ", bump: 2, pose: "celebrate", poses: ["celebrate", "point"], boost: "all", blurb: "Everyone who played for the champion." },
  { key: "dynasty",     name: "Dynasty",            kind: "special", group: "awards",  bump: 4, pose: "celebrate", boost: "all", blurb: "Won three or more titles in a row. A card for the third title and every one after." },
  // rising & veterans
  { key: "rookie",      name: "Rookie Card",        kind: "special", group: "rising",  pose: "stand",    blurb: "A player's first season in the league. Everybody who came up through the league gets exactly one." },
  { key: "numberone",   name: "Number One",         kind: "special", group: "rising",  bump: 3, pose: "point", boost: "all", blurb: "The first overall pick, in his rookie season." },
  { key: "younggun",    name: "Young Guns",         kind: "special", group: "rising",  bump: 2, pose: "crossover", poses: ["crossover", "dribble"], boost: ["spd", "acc", "vert"], blurb: "21 or younger and already playing 24+ minutes a night." },
  { key: "breakout",    name: "Breakout",           kind: "leader",  group: "rising",  custom: true, unit: "OVR jump", short: "OVR", pose: "flex", boost: "all", blurb: "The biggest jumps in overall from one season to the next (+5 or more)." },
  { key: "bench",       name: "Bench Mob",          kind: "leader",  group: "rising",  custom: true, unit: "PPG off the bench", short: "BENCH PPG", pose: "crossover", poses: ["crossover", "fadeaway"], boost: ["ins", "mid", "spd"], blurb: "The best scorers who mostly came off the bench (started under 30% of their games)." },
  { key: "ageless",     name: "Ageless",            kind: "special", group: "rising",  bump: 2, pose: "point", poses: ["point", "akimbo"], boost: ["iq", "pas", "ft"], blurb: "35 or older and still playing 18+ minutes a night." },
  // legacies
  { key: "prime",       name: "Prime",              kind: "special", group: "legacy",  bump: 2, pose: "dribble", boost: "all", blurb: "A long career's best season (4+ seasons, peaked at 78 or better)." },
  { key: "franchise",   name: "Franchise Icons",    kind: "special", group: "legacy",  bump: 4, pose: "point", poses: ["point", "akimbo"], boost: "all", blurb: "Ten or more seasons with one team, at his best season there." },
  { key: "journeyman",  name: "Journeymen",         kind: "special", group: "legacy",  bump: 1, pose: "stand", boost: ["iq", "sta"], blurb: "Played for six or more teams. The card is his last season." },
  { key: "hof",         name: "Hall of Fame",       kind: "special", group: "legacy",  bump: 5, pose: "trophy",  boost: "all", frame: "marble", blurb: "Hall of Famers, at the peak of their careers." },
  { key: "immortals",   name: "Immortals",          kind: "special", group: "legacy",  bump: 8, pose: "point",   boost: "all", frame: "cosmic", blurb: "The 12 greatest careers in league history by total Game Score, at their peak. The rarest set there is." },
  // eras
  { key: "founders",    name: "Founders",           kind: "special", group: "eras",    bump: 1, pose: "stand", boost: "all", frame: "vintage", blurb: "Played in the league's first season, 1954, for the six Rust Belt company teams." },
  { key: "wba",         name: "WBA Originals",      kind: "special", group: "eras",    bump: 1, pose: "dribble", boost: "all", blurb: "Came over with the Western Bounceball Association teams in the 1979 merger." },
  { key: "expansion",   name: "Expansion Class",    kind: "special", group: "eras",    bump: 1, pose: "dribble", poses: ["dribble", "akimbo"], boost: "all", blurb: "Played for an expansion team in its first season." },
  // built different
  { key: "skyscrapers", name: "Skyscrapers",        kind: "special", group: "odd",     bump: 2, pose: "block", poses: ["block", "rebound"], boost: ["rim", "reb", "ins"], blurb: "7'3\" and up, at their best season." },
  { key: "pocket",      name: "Pocket Rockets",     kind: "special", group: "odd",     bump: 2, pose: "crossover", boost: ["spd", "acc", "sec"], blurb: "Six feet or shorter, at their best season." },
  { key: "ironworkers", name: "Ironworkers",        kind: "special", group: "odd",     bump: 1, pose: "stand", boost: ["sta", "str"], blurb: "Played every game of the season and averaged 30+ minutes." },
  { key: "rapsheet",    name: "Rap Sheet",          kind: "special", group: "odd",     bump: 0, pose: "mugshot", frame: "tape", blurb: "Suspended that season. The league office keeps a file." }
];
const GROUP_NAMES = { leaders: "Season leaders", feats: "Moments & feats", holidays: "Holidays & events", awards: "Awards", rising: "Rising & veterans", legacy: "Legacies", eras: "Eras", odd: "Built different" };
const CBY = Object.fromEntries(COLLECTIONS.map(c => [c.key, c]));
function leaderBump(rank) { return rank === 1 ? 5 : rank <= 3 ? 4 : rank <= 6 ? 3 : 2; }

// ---------- card builds (like 2K: every card has its own attributes) ----------
// A card starts from the player's ratings as that season began. Its collection reshapes them:
// each collection has a profile (how much each rating is pushed) and each card a power (how
// big the push is: the season's leader gets more than the 8th-best). Pushes shrink near 99, and
// every card gets its own seeded wobble, so no two cards of a player read the same. The card's
// overall is then recomputed from its ratings with the player's role weights, and never lands
// below the base overall plus the collection's minimum lift.
const PROFILES = {
  posterized: { vert: 1, ins: 1, str: .6, bnc: .6, hands: .3 },
  swat: { rim: 1, vert: .8, perD: .45, reb: .45 },
  wrecking: { tck: 1, str: .8, acc: .6, spd: .4 },
  escape: { brk: 1, sec: .8, str: .6, spd: .45 },
  fouralarm: { fr: 1, thr: .7, ft: .45, iq: .3 },
  splash: { thr: 1, mid: .6, ft: .5, fr: .3 },
  dimes: { pas: 1, iq: .8, hands: .6, sec: .45 },
  boards: { reb: 1, str: .6, vert: .5, hands: .45 },
  pickpockets: { perD: 1, hands: .7, spd: .5, acc: .5 },
  buckets: { ins: .8, mid: .8, thr: .6, ft: .5, iq: .3 },
  fifty: { ins: .8, mid: .8, thr: .8, fr: .5, ft: .5 },
  tripledouble: { pas: .8, reb: .8, iq: .6, hands: .45 },
  postseason: { iq: .7, mid: .7, ins: .6, sta: .5 },
  mvp: { all: .5, iq: .3 },
  fmvp: { all: .45, iq: .35, ins: .2 },
  dpoy: { perD: 1, rim: .8, tck: .7, iq: .4 },
  roy: { all: .3, spd: .3, acc: .3, vert: .3 },
  champ: { all: .25, iq: .3 },
  dynasty: { all: .45, iq: .2 },
  numberone: { all: .3, vert: .3, spd: .3 },
  younggun: { spd: .8, acc: .8, vert: .7, bnc: .45 },
  breakout: { all: .5 },
  bench: { ins: .6, mid: .6, spd: .5, sta: .45 },
  ageless: { iq: 1, pas: .6, ft: .6, mid: .5 },
  prime: { all: .35 },
  franchise: { all: .4 },
  journeyman: { iq: .6, sta: .5, all: .1 },
  hof: { all: .45, sig: .6 },
  immortals: { all: .7, sig: .6 },
  founders: { all: .2 },
  wba: { spd: .45, vert: .45, thr: .45 },
  expansion: { sta: .5, str: .4, all: .1 },
  skyscrapers: { rim: .8, reb: .8, ins: .6 },
  pocket: { spd: 1, acc: .8, sec: .7, hands: .5 },
  ironworkers: { sta: 1, str: .6, all: .05 }
};
const MOMENT_PROFILES = { pts: { ins: .8, mid: .8, thr: .7, ft: .4 }, reb: { reb: 1, vert: .5, str: .5 }, ast: { pas: 1, iq: .7, hands: .5 }, tkl: { tck: 1, str: .7, acc: .5 }, dnk: { vert: 1, ins: 1, bnc: .6 }, fpm: { fr: 1, thr: .6, ft: .4 } };
const POWER = { opening: 12, halloween: 13, thanksgiving: 13, christmas: 15, newyear: 13, valentine: 13, leapday: 16, piday: 13, stpatricks: 13, aprilfools: 12, friday13: 13, game7: 16,
  moments: 14, fifty: 16, mvp: 14, fmvp: 13, dpoy: 16, roy: 12, champ: 8, dynasty: 12, numberone: 10, younggun: 12, ageless: 12,
  prime: 10, franchise: 12, journeyman: 8, hof: 16, immortals: 20, founders: 6, wba: 10, expansion: 8, skyscrapers: 12, pocket: 12, ironworkers: 10 };
function cardPower(col, rank) { const c = CBY[col]; if (!c) return 0; if (c.kind === "leader") return rank === 1 ? 18 : rank <= 3 ? 14 : rank <= 6 ? 11 : 8; return POWER[col] || 0; }
function minLift(col, rank) { const c = CBY[col]; if (!c) return 0; if (c.kind === "holiday") return 2; return c.kind === "leader" ? Math.max(1, leaderBump(rank) - 1) : Math.max(0, (c.bump || 0) - 1); }
function seeded(seed) { let h = 2166136261; for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; }; }
// o: { role, ovr (base overall), rank, season, pid, k (moment stat) }
function cardBuild(col, r, o) {
  const out = Object.assign({}, r), boosts = {};
  const gameCard = col === "moments" || col === "dunktober" || (CBY[col] && CBY[col].kind === "holiday");
  const prof = gameCard ? MOMENT_PROFILES[o.k] || MOMENT_PROFILES.pts : PROFILES[col], pw = cardPower(col, o.rank);
  if (!prof || !pw) return { r: out, ovr: o.ovr, boosts };
  const R = seeded(col + ":" + o.season + ":" + o.pid);
  const sig = prof.sig ? P.RKEYS.slice().sort((a, b) => r[b] - r[a]).slice(0, 3) : [];
  for (const k of P.RKEYS) {
    const w = (prof[k] || 0) + (prof.all || 0) + (sig.includes(k) ? prof.sig : 0), wob = R();
    if (!w) continue;
    const add = pw * w * (0.85 + wob * 0.3);
    const v = Math.min(99, Math.round(r[k] + add * Math.max(0.15, (99 - r[k]) / 55)));
    if (v > r[k]) { out[k] = v; boosts[k] = v - r[k]; }
  }
  const ovr = Math.min(99, Math.max(P.overall({ role: o.role, r: out }), o.ovr + minLift(col, o.rank)));
  return { r: out, ovr, boosts };
}
// older call: ratings shown on a card (kept for callers that only need the ratings)
function cardRatings(col, r, rank, o) { return cardBuild(col, r, Object.assign({ role: "WING", ovr: 0, rank, season: 0, pid: 0 }, o || {})).r; }

// ---------- which cards a season hands out ----------
// S: a season file. ctx: { players: players.json map, firstSeason: {pid: season}, peak: {pid: season}, hof: {pid: year},
//   leagueFirst: first season, mergerSeason, mergerTeams: Set of team ids that arrived by merger }
// Card row: [collection, season, pid, team, cardOvr, baseOvr, rank, value, num, extra?]
// ctx also takes (all optional): ovrBy {pid: {season: ovr}}, peakAll {pid: season}, franchise {pid: {team, season, n}},
//   journey {pid: {season, n}}, expansion Set("TEAM:season"), immortal {pid: rank}, dynasty {"pid:season": titles in a row}
function seasonCards(S, ctx) {
  const K = S.statKeys, ix = Object.fromEntries(K.map((k, i) => [k, i + 1]));
  const rows = Object.entries(S.stats).map(([id, a]) => {
    const o = { id: +id, team: a[0] }; for (const k of K) o[k] = a[ix[k]];
    o.reb = o.oreb + o.dreb; o.ppg = o.gp ? o.pts / o.gp : 0; return o;
  }).filter(x => x.gp > 0);
  const maxgp = Math.max(1, ...rows.map(x => x.gp));
  const N = Math.max(3, Math.ceil(S.teams.length * 0.4));
  const snap = id => S.players[id] || S.players[String(id)];
  const out = [];
  const add = (col, id, team, bump, rank, value, extra) => {
    const sp = snap(id); if (!sp) return;
    const b = cardBuild(col, sp.r, { role: sp.role, ovr: sp.ovr, rank, season: S.season, pid: id, k: extra && extra.k });
    const row = [col, S.season, id, team, b.ovr, sp.ovr, rank, value, sp.num];
    if (extra) row.push(extra);
    out.push(row);
  };
  for (const c of COLLECTIONS.filter(c => c.kind === "leader" && !c.custom)) {
    if (c.stat !== "ppg" && c.stat !== "reb" && !(c.stat in ix)) continue; // older data without this stat
    const pool = c.stat === "ppg" ? rows.filter(x => x.gp >= maxgp * 0.6) : rows;
    const top = pool.filter(x => x[c.stat] > 0).sort((a, b) => b[c.stat] - a[c.stat] || b.gp - a.gp).slice(0, N);
    top.forEach((x, i) => add(c.key, x.id, x.team, leaderBump(i + 1), i + 1, c.stat === "ppg" ? Math.round(x.ppg * 10) / 10 : x[c.stat]));
  }
  const aw = S.awards || {};
  for (const k of ["mvp", "fmvp", "dpoy", "roy"]) if (aw[k] !== null && aw[k] !== undefined) {
    const st = S.stats[aw[k]] || S.pstats[aw[k]];
    add(k, aw[k], st ? st[0] : null, CBY[k].bump, 1, null);
  }
  if (aw.champion) for (const [id, a] of Object.entries(S.pstats)) if (a[0] === aw.champion && a[ix.gp]) add("champ", +id, a[0], CBY.champ.bump, 0, null);
  for (const x of rows) {
    if (x.gp >= maxgp && x.min / x.gp >= 30 * 60) add("ironworkers", x.id, x.team, CBY.ironworkers.bump, 0, x.gp);
    if (S.season === ctx.leagueFirst) add("founders", x.id, x.team, CBY.founders.bump, 0, null);
    else if (ctx.firstSeason[x.id] === S.season) {
      const pl = ctx.players[x.id];
      if (S.season === ctx.mergerSeason && ctx.mergerTeams.has(x.team) && !(pl && pl.draft)) add("wba", x.id, x.team, CBY.wba.bump, 0, null);
      else add("rookie", x.id, x.team, 0, 0, null);
    }
    if (ctx.peak[x.id] === S.season) {
      if (ctx.hof[x.id]) add("hof", x.id, x.team, CBY.hof.bump, 0, ctx.hof[x.id]);
      else add("prime", x.id, x.team, CBY.prime.bump, 0, null);
    }
  }
  // ---- feats from single-game highs ----
  const HK = S.highKeys || [], FK = S.featKeys || [], hi = S.highs || {}, hio = HK.length * 2;
  const gameOf = {}; for (const g of S.games || []) gameOf[g[0]] = g;
  const opp = (gid, team) => { const g = gameOf[gid]; return g ? (g[2] === team ? g[3] : g[2]) : null; };
  const teamOf = id => (S.stats[id] || S.pstats[id] || [null])[0];
  const MOMENT = { pts: "PTS", reb: "REB", ast: "AST", tkl: "TKL", dnk: "DNK", fpm: "4PM" };
  for (const k of Object.keys(MOMENT)) {
    const i = HK.indexOf(k); if (i < 0) continue;
    let best = null;
    for (const [id, a] of Object.entries(hi)) if (a[2 * i] > 0 && (!best || a[2 * i] > best.v || (a[2 * i] === best.v && a[2 * i + 1] < best.g))) best = { id: +id, v: a[2 * i], g: a[2 * i + 1] };
    if (best) { const t = teamOf(best.id), g = gameOf[best.g]; add("moments", best.id, t, CBY.moments.bump, 0, `${best.v} ${MOMENT[k]}`, { k, g: best.g, o: opp(best.g, t), d: g ? g[1] : null }); }
  }
  const pi = HK.indexOf("pts"), g50 = FK.indexOf("g50"), tdI = FK.indexOf("td");
  if (pi >= 0 && g50 >= 0) for (const [id, a] of Object.entries(hi)) if (a[hio + g50] > 0) { const t = teamOf(+id); add("fifty", +id, t, CBY.fifty.bump, 0, `${a[2 * pi]} PTS`, { k: "pts", g: a[2 * pi + 1], o: opp(a[2 * pi + 1], t), d: gameOf[a[2 * pi + 1]] ? gameOf[a[2 * pi + 1]][1] : null }); }
  if (tdI >= 0) Object.entries(hi).filter(([, a]) => a[hio + tdI] > 0).sort((a, b) => b[1][hio + tdI] - a[1][hio + tdI]).slice(0, N)
    .forEach(([id, a], j) => add("tripledouble", +id, teamOf(+id), leaderBump(j + 1), j + 1, a[hio + tdI]));
  // postseason scorers
  Object.entries(S.pstats).map(([id, a]) => ({ id: +id, team: a[0], gp: a[ix.gp], pts: a[ix.pts] })).filter(x => x.gp >= 4)
    .sort((a, b) => b.pts / b.gp - a.pts / a.gp).slice(0, Math.max(3, Math.ceil(N / 2)))
    .forEach((x, j) => add("postseason", x.id, x.team, leaderBump(j + 1), j + 1, Math.round(x.pts / x.gp * 10) / 10));
  // bench scorers
  rows.filter(x => x.gp >= maxgp * 0.5 && x.gs / x.gp < 0.3).sort((a, b) => b.ppg - a.ppg).slice(0, 3)
    .forEach((x, j) => add("bench", x.id, x.team, leaderBump(j + 1), j + 1, Math.round(x.ppg * 10) / 10));
  // breakouts: biggest overall jumps from last season
  if (ctx.ovrBy) rows.map(x => { const sp = snap(x.id), prev = ctx.ovrBy[x.id] && ctx.ovrBy[x.id][S.season - 1]; return { x, d: sp && prev !== undefined ? sp.ovr - prev : -99 }; })
    .filter(o => o.d >= 5).sort((a, b) => b.d - a.d).slice(0, N).forEach((o, j) => add("breakout", o.x.id, o.x.team, leaderBump(j + 1), j + 1, "+" + o.d));
  // ages, draft, careers, bodies
  for (const x of rows) {
    const pl = ctx.players[x.id] || {}, age = pl.born ? S.season - pl.born : null, mpg = x.min / x.gp / 60;
    if (age !== null && age <= 21 && mpg >= 24) add("younggun", x.id, x.team, CBY.younggun.bump, 0, age);
    if (age !== null && age >= 35 && mpg >= 18) add("ageless", x.id, x.team, CBY.ageless.bump, 0, age);
    if (pl.draft && pl.draft.round === 1 && pl.draft.pick === 1 && ctx.firstSeason[x.id] === S.season) add("numberone", x.id, x.team, CBY.numberone.bump, 0, pl.draft.season);
    if (ctx.franchise && ctx.franchise[x.id] && ctx.franchise[x.id].season === S.season && ctx.franchise[x.id].team === x.team) add("franchise", x.id, x.team, CBY.franchise.bump, 0, ctx.franchise[x.id].n);
    if (ctx.journey && ctx.journey[x.id] && ctx.journey[x.id].season === S.season) add("journeyman", x.id, x.team, CBY.journeyman.bump, 0, ctx.journey[x.id].n);
    if (ctx.expansion && ctx.expansion.has(x.team + ":" + S.season)) add("expansion", x.id, x.team, CBY.expansion.bump, 0, null);
    if (ctx.peakAll && ctx.peakAll[x.id] === S.season) {
      if (pl.ht >= 87) add("skyscrapers", x.id, x.team, CBY.skyscrapers.bump, 0, pl.ht);
      if (pl.ht && pl.ht <= 72) add("pocket", x.id, x.team, CBY.pocket.bump, 0, pl.ht);
      if (ctx.immortal && ctx.immortal[x.id]) add("immortals", x.id, x.team, CBY.immortals.bump, ctx.immortal[x.id], null);
    }
    if (ctx.dynasty && ctx.dynasty[x.id + ":" + S.season]) add("dynasty", x.id, x.team, CBY.dynasty.bump, 0, ctx.dynasty[x.id + ":" + S.season]);
  }
  // ---- holidays, Dunktober and Game 7 from each game's star ----
  if (S.pog && S.pog.length) {
    const PK = S.pogKeys || ["gid", "pid", "gsc10", "pts", "reb", "ast", "stl", "blk", "tkl", "dnk", "fpm", "tpm", "dpid", "ddnk", "wpid", "wgsc10"], pi2 = Object.fromEntries(PK.map((k, i) => [k, i]));
    const regDays = Math.max(...(S.games || []).filter(g => !g[8]).map(g => g[1])) + 1, cal = seasonCalendar(S.season, regDays);
    const sideOf = (g, pid) => g[9] && g[9].includes(pid) ? 0 : g[10] && g[10].includes(pid) ? 1 : -1;
    const teamIn = (g, pid) => { const sd = sideOf(g, pid); return sd < 0 ? teamOf(pid) : g[2 + sd]; };
    const oppIn = (g, pid) => { const sd = sideOf(g, pid); return sd < 0 ? null : g[3 - sd]; };
    const lineOf = r => { const p = [`${r[pi2.pts]} PTS`]; const o = [["reb", "REB", 10], ["ast", "AST", 10], ["tkl", "TKL", 5], ["dnk", "DNK", 5], ["blk", "BLK", 5], ["stl", "STL", 5]].map(([k, l, th]) => [r[pi2[k]], l, r[pi2[k]] / th]).filter(x => x[2] >= 1).sort((a, b) => b[2] - a[2])[0]; if (o) p.push(`${o[0]} ${o[1]}`); return p.join(" · "); };
    const kOf = r => r[pi2.dnk] >= 8 ? "dnk" : r[pi2.tkl] >= 6 ? "tkl" : r[pi2.ast] >= 12 ? "ast" : r[pi2.reb] >= 15 ? "reb" : r[pi2.fpm] >= 5 ? "fpm" : "pts";
    const best = {};
    for (const r of S.pog) {
      const g = gameOf[r[0]]; if (!g || g[8] || r[pi2.pid] < 0) continue;
      for (const h of cal.holiday(g[1])) if (!best[h] || r[pi2.gsc10] > best[h][pi2.gsc10]) best[h] = r;
    }
    for (const c of COLLECTIONS.filter(c => c.kind === "holiday" && c.hol)) {
      const r = best[c.hol]; if (!r) continue;
      const g = gameOf[r[0]], pid = r[pi2.pid];
      add(c.key, pid, teamIn(g, pid), 2, 0, lineOf(r), { k: kOf(r), g: r[0], o: oppIn(g, pid), d: g[1], date: cal.date(g[1]) });
    }
    // Dunktober: October's biggest single-game dunk shows
    const oct = S.pog.filter(r => { const g = gameOf[r[0]]; return g && !g[8] && r[pi2.ddnk] > 0 && new Date(cal.time(g[1])).getUTCMonth() === 9; })
      .sort((a, b) => b[pi2.ddnk] - a[pi2.ddnk] || a[0] - b[0]);
    const seenD = new Set(); let dr = 0;
    for (const r of oct) { const pid = r[pi2.dpid]; if (seenD.has(pid)) continue; seenD.add(pid); dr++; const g = gameOf[r[0]]; add("dunktober", pid, teamIn(g, pid), leaderBump(dr), dr, r[pi2.ddnk], { k: "dnk", g: r[0], o: oppIn(g, pid), d: g[1], date: cal.date(g[1]) }); if (dr === 3) break; }
    // Game 7: the winning side's best player in every seventh game
    const rounds = S.playoffs && S.playoffs.series ? Math.max(...S.playoffs.series.map(x => x.round)) : 0;
    for (const sr of (S.playoffs && S.playoffs.series) || []) {
      if (!sr.games || sr.games.length !== 7) continue;
      const gid = sr.games[6], r = S.pog.find(x => x[0] === gid), g = gameOf[gid]; if (!r || !g || r[pi2.wpid] < 0) continue;
      const pid = r[pi2.wpid], line = pid === r[pi2.pid] ? lineOf(r) : null;
      add("game7", pid, teamIn(g, pid), 2, 0, sr.round === rounds ? "FINALS" : `ROUND ${sr.round}`, { k: line ? kOf(r) : "pts", g: gid, o: oppIn(g, pid), d: g[1], date: cal.date(g[1]), line, round: sr.round, finals: sr.round === rounds });
    }
  }
  const rap = {};
  for (const e of S.blotter || []) if (e.who === "player" && (e.kind === "susp" || e.kind === "arrest") && e.games > 0 && !rap[e.id]) { rap[e.id] = 1; add("rapsheet", e.id, e.team, 0, 0, e.text); }
  return out;
}

const API = { seasonCalendar, holidaysOf, shortDate, TIERS, tierFor, POS, GROUPS, groupScores, BADGES, BADGE_TIERS, badges, COLLECTIONS, GROUP_NAMES, CBY, leaderBump, PROFILES, cardPower, cardBuild, cardRatings, seasonCards };
if (NODE) module.exports = Object.assign({}, API);
else window.BB = Object.assign(window.BB || {}, { CARDS: API });
})();
