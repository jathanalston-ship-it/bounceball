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

// ---------- collections ----------
// kind: base (every season) | leader (top of a stat that season) | award | special
// boost: ratings raised on the card (each by 2x the card's bump), or "all" (each by the bump)
const COLLECTIONS = [
  { key: "base",        name: "Base",               kind: "base",   pose: "stand",     blurb: "Every player, every season, rated as the season tipped off." },
  { key: "rookie",      name: "Rookie Card",        kind: "special", pose: "stand",    blurb: "A player's first season in the league. Everybody who came up through the league gets exactly one." },
  { key: "founders",    name: "Founders",           kind: "special", bump: 1, pose: "stand", boost: "all", blurb: "Played in the league's first season, 1954, for the six Rust Belt company teams." },
  { key: "wba",         name: "WBA Originals",      kind: "special", bump: 1, pose: "dribble", boost: "all", blurb: "Came over with the Western Bounceball Association teams in the 1979 merger." },
  { key: "posterized",  name: "Posterized",         kind: "leader", stat: "dnk", unit: "dunks",          pose: "dunk",      boost: ["vert", "ins", "str"],  blurb: "The season's top dunkers. On a floor that adds a foot to your vertical, somebody has to lead the league in it." },
  { key: "swat",        name: "Swat Team",          kind: "leader", stat: "blk", unit: "blocks",         pose: "block",     boost: ["rim", "vert", "perD"], blurb: "Blocks and swats, including the legal ones off the rim on twos." },
  { key: "wrecking",    name: "Wrecking Crew",      kind: "leader", stat: "tkl", unit: "tackles",        pose: "tackle",    boost: ["tck", "str", "acc"],   blurb: "Ball handlers put on the rubber. Every one is a turnover." },
  { key: "escape",      name: "Escape Artists",     kind: "leader", stat: "btk", unit: "broken tackles", short: "BTK", pose: "stiffarm",  boost: ["brk", "sec", "str"],   blurb: "Hit, wrapped up, and still standing with the ball." },
  { key: "fouralarm",   name: "Four Alarm",         kind: "leader", stat: "fpm", unit: "fours",          pose: "shoot",     boost: ["fr", "thr", "ft"],     blurb: "Most fours made from 30 feet and beyond." },
  { key: "splash",      name: "Splash Zone",        kind: "leader", stat: "tpm", unit: "threes",         pose: "shoot",     boost: ["thr", "mid", "ft"],    blurb: "Most threes made." },
  { key: "dimes",       name: "Dime Store",         kind: "leader", stat: "ast", unit: "assists",        pose: "pass",      boost: ["pas", "iq", "hands"],  blurb: "The season's assist leaders." },
  { key: "boards",      name: "Board Room",         kind: "leader", stat: "reb", unit: "rebounds",       pose: "rebound",   boost: ["reb", "vert", "str"],  blurb: "The season's rebounding leaders." },
  { key: "pickpockets", name: "Pickpockets",        kind: "leader", stat: "stl", unit: "steals",         pose: "steal",     boost: ["perD", "hands", "spd"], blurb: "Steals leaders." },
  { key: "buckets",     name: "Bucket Brigade",     kind: "leader", stat: "ppg", unit: "points per game", short: "PPG", pose: "dribble",  boost: ["ins", "mid", "thr"],   blurb: "The league's top scorers by points per game (60% of games played)." },
  { key: "mvp",         name: "Most Valuable",      kind: "award",  award: "mvp",  bump: 6, pose: "trophy",    boost: "all", blurb: "League MVP." },
  { key: "fmvp",        name: "Finals MVP",         kind: "award",  award: "fmvp", bump: 5, pose: "trophy",    boost: "all", blurb: "Best player on the champion in the Finals." },
  { key: "dpoy",        name: "Lockdown",           kind: "award",  award: "dpoy", bump: 5, pose: "guard",     boost: ["perD", "rim", "tck"], blurb: "Defensive Player of the Year." },
  { key: "roy",         name: "Rookie of the Year", kind: "award",  award: "roy",  bump: 4, pose: "dribble",   boost: "all", blurb: "The best first-year player." },
  { key: "champ",       name: "Ring Bearers",       kind: "award",  award: "champ", bump: 2, pose: "celebrate", boost: "all", blurb: "Everyone who played for the champion." },
  { key: "ironworkers", name: "Ironworkers",        kind: "special", bump: 1, pose: "stand",   boost: ["sta", "str"], blurb: "Played every game of the season and averaged 30+ minutes." },
  { key: "prime",       name: "Prime",              kind: "special", bump: 2, pose: "dribble", boost: "all", blurb: "A long career's best season (4+ seasons, peaked at 78 or better)." },
  { key: "hof",         name: "Hall of Fame",       kind: "special", bump: 5, pose: "trophy",  boost: "all", blurb: "Hall of Famers, at the peak of their careers." },
  { key: "rapsheet",    name: "Rap Sheet",          kind: "special", bump: 0, pose: "mugshot", blurb: "Suspended that season. The league office keeps a file." }
];
const CBY = Object.fromEntries(COLLECTIONS.map(c => [c.key, c]));
function leaderBump(rank) { return rank === 1 ? 5 : rank <= 3 ? 4 : rank <= 6 ? 3 : 2; }

// Ratings shown on a card: the season's ratings plus the collection's boost.
function cardRatings(col, r, bump) {
  const c = CBY[col], o = Object.assign({}, r);
  if (!c || !bump || !c.boost) return o;
  const keys = c.boost === "all" ? P.RKEYS : c.boost, add = c.boost === "all" ? bump : bump * 2;
  for (const k of keys) o[k] = Math.min(99, o[k] + add);
  return o;
}

// ---------- which cards a season hands out ----------
// S: a season file. ctx: { players: players.json map, firstSeason: {pid: season}, peak: {pid: season}, hof: {pid: year},
//   leagueFirst: first season, mergerSeason, mergerTeams: Set of team ids that arrived by merger }
// Card row: [collection, season, pid, team, cardOvr, baseOvr, rank, value, num]
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
  const add = (col, id, team, bump, rank, value) => {
    const sp = snap(id); if (!sp) return;
    out.push([col, S.season, id, team, Math.min(99, sp.ovr + bump), sp.ovr, rank, value, sp.num]);
  };
  for (const c of COLLECTIONS.filter(c => c.kind === "leader")) {
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
  const rap = {};
  for (const e of S.blotter || []) if (e.who === "player" && (e.kind === "susp" || e.kind === "arrest") && e.games > 0 && !rap[e.id]) { rap[e.id] = 1; add("rapsheet", e.id, e.team, 0, 0, e.text); }
  return out;
}

const API = { TIERS, tierFor, POS, GROUPS, groupScores, BADGES, BADGE_TIERS, badges, COLLECTIONS, CBY, leaderBump, cardRatings, seasonCards };
if (NODE) module.exports = Object.assign({}, API);
else window.BB = Object.assign(window.BB || {}, { CARDS: API });
})();
