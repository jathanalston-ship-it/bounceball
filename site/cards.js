// ===================== PLAYER SCREEN, CARD VIEWER, CARD COLLECTIONS =====================
// Reads index/cards.json and index/players/<n>.json (built by scripts/build-index.js).
// With older data that lacks those files, the player screen still works from players.json and
// the season stat lines, with a single card built from current ratings.
"use strict";
const CC = BB.CARDS;
const PC = { idxP: null, idx: null, shards: {}, list: [], lists: {}, at: 0, ps: null };

async function pcIndex() {
  if (!PC.idxP) PC.idxP = J("index/cards.json").then(x => {
    // collector numbers: each collection's cards in order of season, then finish
    const by = {}; for (const r of x.cards) (by[r[0]] = by[r[0]] || []).push(r);
    PC.serials = {};
    for (const rows of Object.values(by)) { rows.sort((a, b) => a[1] - b[1] || (a[6] || 99) - (b[6] || 99) || a[2] - b[2]); rows.forEach((r, i) => { PC.serials[r[0] + ":" + r[1] + ":" + r[2]] = `${i + 1}/${rows.length}`; }); }
    return (PC.idx = x);
  }).catch(() => null);
  return PC.idxP;
}
async function pcDetail(id) {
  const ix = await pcIndex(); if (!ix) return null;
  const sh = id % ix.shards;
  if (!PC.shards[sh]) PC.shards[sh] = J("index/players/" + sh + ".json").catch(() => ({}));
  return (await PC.shards[sh])[id] || null;
}
const pcR = row => Object.fromEntries(BB.RKEYS.map((k, i) => [k, row[5 + i]])); // detail.s row -> ratings
const pcFt = h => `${Math.floor(h / 12)}'${h % 12}"`;
const pcPct = (a, b, d) => b ? (a / b * 100).toFixed(d === undefined ? 1 : d) : "–";
const pcAvg = (a, b, d) => b ? (a / b).toFixed(d === undefined ? 1 : d) : "–";

// ---------- card objects ----------
function pcAll(ix) { return PC.allCards || (PC.allCards = ix.cards.map(r => Object.assign(pcCard(r[0], r[1], r[2], r[3], r[4], r[6], r[7], r[8], undefined, r[5]), { extra: r[9] }))); }
function pcCard(col, season, pid, team, ovr, rank, value, num, wt, base) {
  const p = D.pl[pid] || {}, t = TB[team] || { c1: "#59606b", c2: "#23272e" };
  return { col, season, pid, team, teamId: team || "FA", ovr, base: base === undefined ? ovr : base, rank: rank || 0, value, serial: PC.serials ? PC.serials[col + ":" + season + ":" + pid] : undefined, num: num === undefined ? p.num : num, name: p.name || "#" + pid, role: p.role || "WING", ht: p.ht || 78, wt: wt || p.wt || 210, c1: t.c1, c2: t.c2, tier: CC.tierFor(ovr) };
}
function pcBump(c) { const C = CC.CBY[c.col]; if (!C) return 0; return C.kind === "leader" ? CC.leaderBump(c.rank) : (C.bump || 0); }
// this card's own attributes (same build the indexer used to rate it)
function pcBuild(c) { return c.r ? CC.cardBuild(c.col, c.r, { role: c.role, ovr: c.base, rank: c.rank, season: c.season, pid: c.pid, k: c.extra && c.extra.k }) : null; }
const COL_ORDER = Object.fromEntries(CC.COLLECTIONS.map((c, i) => [c.key, i]));
// every card a player owns: one base card per season, the upcoming season's card, and collection cards
function pcPlayerCards(p, det) {
  const out = [];
  if (det) {
    for (const s of det.s) out.push(Object.assign(pcCard("base", s[0], p.id, s[1], s[3], 0, null, s[2], s[4]), { r: pcR(s) }));
    for (const c of det.cards) { const s = det.s.find(x => x[0] === c[1]); out.push(Object.assign(pcCard(c[0], c[1], c[2], c[3], c[4], c[6], c[7], c[8], s ? s[4] : undefined, c[5]), { r: s ? pcR(s) : null, extra: c[9] })); }
  }
  if (p.r && !p.retired) out.push(Object.assign(pcCard("base", D.lg.nextSeason, p.id, p.team, p.ovr, 0, null, p.num), { r: p.r, upcoming: true }));
  return out.sort((a, b) => b.season - a.season || (a.col === "base") - (b.col === "base") || b.ovr - a.ovr || COL_ORDER[a.col] - COL_ORDER[b.col]);
}
function pcEarned(c) {
  const C = CC.CBY[c.col], y = c.season;
  if (!C) return "";
  if (c.col === "base") return c.upcoming ? `Ratings going into the ${y} season.` : `Ratings as the ${y} season tipped off.`;
  if (C.kind === "leader") return c.rank === 1 ? `Led the league with ${c.value} ${C.unit} in ${y}.` : `Finished #${c.rank} in the league with ${c.value} ${C.unit} in ${y}.`;
  if (c.col === "rapsheet") return `${y}: ${esc(c.value || "")}.`;
  if (c.col === "hof") return `Inducted into the Hall of Fame in ${c.value}. This card is his best season, ${y}.`;
  if (c.col === "prime") return `The best season of his career (${y}).`;
  if (c.col === "ironworkers") return `Played all ${c.value} games in ${y} and averaged 30+ minutes.`;
  if (c.col === "champ") return `Won the ${y} championship.`;
  if (c.col === "founders") return `Played in the league's first season, ${y}.`;
  if (c.col === "wba") return `Came over from the WBA in the ${y} merger.`;
  if (c.col === "rookie") return `His first season in the league, ${y}.`;
  const ex = c.extra || {}, vs = ex.o && TB[ex.o] ? ` against the ${TB[ex.o].name}` : "", day = ex.d !== null && ex.d !== undefined ? ` on day ${ex.d + 1}` : "";
  const watch = ex.g !== undefined && ex.g !== null && ex.g >= 0 ? ` <a href="#watch-${y}-${ex.g}">Watch the game ▶</a>` : "";
  const nm = TB[c.team] ? TB[c.team].name : c.team;
  const F = {
    moments: () => `${c.value}${vs}${day}, the best single game of ${y}.${watch}`,
    fifty: () => `Dropped ${c.value}${vs}${day}, ${y}.${watch}`,
    tripledouble: () => `${c.value} triple-doubles in ${y}, #${c.rank} in the league.`,
    postseason: () => `${c.value} points per game in the ${y} playoffs, #${c.rank}.`,
    bench: () => `${c.value} points per game off the bench in ${y}, #${c.rank}.`,
    breakout: () => `His overall jumped ${c.value} going into ${y}, #${c.rank} in the league.`,
    younggun: () => `Age ${c.value}, playing big minutes in ${y}.`, ageless: () => `Age ${c.value} and still in the rotation in ${y}.`,
    numberone: () => `The first overall pick in the ${c.value} draft, in his rookie season.`,
    franchise: () => `${c.value} seasons with the ${nm}. This was his best.`, journeyman: () => `Played for ${c.value} teams. ${y} was his last season.`,
    expansion: () => `On the first roster the ${nm} ever had, ${y}.`, dynasty: () => `${c.value} titles in a row, ${y}.`,
    skyscrapers: () => `Stands ${pcFt(c.value)}. His best season, ${y}.`, pocket: () => `Stands ${pcFt(c.value)}. His best season, ${y}.`,
    immortals: () => `#${c.rank} all-time in career Game Score. His best season, ${y}.`
  };
  const HOL = { opening: "on Opening Night", halloween: "on Halloween", thanksgiving: "on Thanksgiving", christmas: "on Christmas Day", newyear: "on New Year's Eve", valentine: "on Valentine's Day", leapday: "on Leap Day", piday: "on Pi Day", stpatricks: "on St. Patrick's Day", aprilfools: "on April Fools' Day", friday13: "on Friday the 13th" };
  const when = ex.date ? new Date(ex.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  if (HOL[c.col]) return `${c.value}${vs} ${HOL[c.col]}${when ? `, ${when}` : ""}. The best game of the day.${watch}`;
  if (c.col === "dunktober") return `${c.value} dunks${vs} on ${when}, #${c.rank} in October ${y}.${watch}`;
  if (c.col === "game7") return `Led the winners${vs} in Game 7 of the ${ex.finals ? "Finals" : "round " + ex.round + " series"}${when ? `, ${when}` : ""}${ex.line ? ` (${ex.line})` : ""}.${watch}`;
  return F[c.col] ? F[c.col]() : `${C.name}, ${y}.`;
}

// offensive / defensive archetype (engine v0.4+) from a season's ratings
function pcArch(r, p, season) { try { if (!BB.archetype || !r || !p) return null; return BB.archetype(Object.assign({}, p, { r }), season); } catch (e) { return null; } }

// ---------- flip card + viewer ----------
function pcFlip(c, cls) {
  const b = pcBuild(c), r = b ? b.r : null; if (b) c.boosts = b.boosts;
  if (r && c.arch === undefined) { const a = pcArch(c.r, D.pl[c.pid], c.season); c.arch = a ? a.offName + " / " + a.defName : ""; }
  if (c.line === undefined) c.line = pcLine(c);
  return `<div class="fcard tilt ${cls || ""}" onclick="this.classList.toggle('flip')" title="Tap to flip"><div class="fc-in"><div class="fc-f">${CART.front(c)}</div><div class="fc-b">${r ? CART.back(c, r) : CART.front(c)}</div></div><div class="glare"></div></div>`;
}
// the season's per-game line for the card back; the last number follows the collection
function pcLine(c) {
  const rows = D.idx && D.idx.regular && D.idx.regular[c.pid]; if (!rows || c.upcoming) return null;
  const k = D.idx.keys, row = rows.find(x => x[0] === c.season); if (!row) return null;
  const s = Object.fromEntries(k.map((x, i) => [x, row[i]])); if (!s.gp) return null;
  const pg = v => (v / s.gp).toFixed(1);
  const extra = { posterized: ["DNK", s.dnk], swat: ["BLK", s.blk], escape: ["BTK", s.btk], fouralarm: ["4PM", s.fpm], splash: ["3PM", s.tpm], pickpockets: ["STL", s.stl], dimes: ["STL", s.stl], boards: ["BLK", s.blk], wrecking: ["STL", s.stl] }[c.col] || ["BLK", s.blk];
  return [["PTS", pg(s.pts)], ["REB", pg(s.oreb + s.dreb)], ["AST", pg(s.ast)], ["TKL", pg(s.tkl)], [extra[0], extra[1] === undefined ? "–" : pg(extra[1])]];
}
function pcTile(c, i, label, key) {
  const own = c.col !== "base" && MY.load().owned[pcKey(c)];
  return `<button class="ctile t-${c.tier.key}${own ? " own" : ""}" onclick="pcOpen(${i},'${key || "main"}')" aria-label="${esc(c.name)} ${c.season} ${esc((CC.CBY[c.col] || {}).name || "")}">${CART.front(c)}${own ? `<span class="owned" title="In your collection">✓${own > 1 ? " ×" + own : ""}</span>` : ""}${label ? `<span class="ctl">${label}</span>` : ""}</button>`;
}
function pcSetList(list, key) { PC.lists[key || "main"] = list; PC.list = list; }
// open the card viewer on one player's cards from a season (used by the broadcast box score)
async function pcQuick(pid, season) {
  const p = D.pl[pid]; if (!p) return;
  const all = pcPlayerCards(p, await pcDetail(pid));
  const list = all.filter(c => c.season === season);
  pcSetList(list.length ? list : all, "quick"); pcOpen(0, "quick");
}
async function pcOpen(i, key) {
  if (key && PC.lists[key]) PC.list = PC.lists[key];
  PC.at = i; const c = PC.list[i]; if (!c) return;
  if (!c.r && c.col) { const det = await pcDetail(c.pid); const s = det && det.s.find(x => x[0] === c.season); if (s) { c.r = pcR(s); c.wt = s[4]; } }
  let m = $("cmodal");
  if (!m) { m = document.createElement("div"); m.id = "cmodal"; m.className = "cmodal"; document.body.appendChild(m); m.addEventListener("click", e => { if (e.target === m) pcClose(); }); }
  const C = CC.CBY[c.col] || CC.CBY.base, base = c.r, built = pcBuild(c), boosted = built ? built.r : null;
  let attrs = "";
  if (boosted) {
    const gs = CC.groupScores(boosted);
    attrs = CC.GROUPS.map(g => `<div class="ag"><div class="agh"><span>${g.name}</span><b style="color:${CART.valColor(gs[g.key])}">${gs[g.key]}</b></div>${g.keys.map(k => {
      const v = boosted[k], d = v - base[k];
      return `<div class="ar"><span>${BB.RLABEL[k]}</span><i><em style="width:${v}%;background:${CART.valColor(v)}"></em></i><b>${v}</b>${d ? `<small class="up">+${d}</small>` : `<small></small>`}</div>`;
    }).join("")}</div>`).join("");
    const bd = CC.badges(boosted);
    attrs += `<div class="ag wide"><div class="agh"><span>Badges</span><b>${bd.length}</b></div><div class="bdg">${bd.map(b => `<span class="bd ${b.tier}" title="${esc(b.d)}">${esc(b.name)}<small>${b.tierName}</small></span>`).join("") || `<span class="m small">None yet</span>`}</div></div>`;
  } else attrs = `<p class="m small">Ratings for this card aren't in the record.</p>`;
  const bump = pcBump(c);
  m.innerHTML = `<div class="cm-box" role="dialog" aria-label="Card viewer">
    <button class="cm-x" onclick="pcClose()" aria-label="Close">✕</button>
    <div class="cm-top"><button class="cm-nav" onclick="pcStep(-1)" ${i ? "" : "disabled"} aria-label="Previous card">‹</button>${pcFlip(c, "big")}<button class="cm-nav" onclick="pcStep(1)" ${i < PC.list.length - 1 ? "" : "disabled"} aria-label="Next card">›</button></div>
    <p class="cm-hint m small">Tap the card to flip it · ${i + 1} of ${PC.list.length}</p>
    <div class="cm-info"><div><b>${esc(c.name)}</b> <span class="m">· ${c.season} · ${esc(C.name)}</span></div>
      <div class="tierline"><span class="gem t-${c.tier.key}"></span>${c.tier.name} · ${c.ovr} OVR${c.ovr > c.base ? ` <span class="m">(${c.base} base <span class="up">+${c.ovr - c.base}</span> card boost)</span>` : ""}</div>
      <p>${pcEarned(c)} ${c.col === "base" ? "" : `<span class="m">${esc(C.blurb || "")}</span>`}</p>
      ${built && Object.keys(built.boosts).length ? `<p class="boostline">This card's build: ${Object.entries(built.boosts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `<b>${BB.RLABEL[k]}</b> <span class="up">+${v}</span>`).join(" · ")}${Object.keys(built.boosts).length > 5 ? ` <span class="m">and ${Object.keys(built.boosts).length - 5} more</span>` : ""}</p>` : c.col !== "base" ? `<p class="m small">This card keeps his ratings as they were that season.</p>` : ""}
      <p><a class="btn" href="#player-${c.pid}" onclick="pcClose()">Player page →</a> ${c.col !== "base" ? `<a class="btn ghost" href="#cards-${c.col}" onclick="pcClose()">${esc(C.name)} collection →</a>` : ""}</p></div>
    <h4>Attributes on this card</h4><div class="agrid">${attrs}</div></div>`;
  m.hidden = false; document.body.classList.add("noscroll");
}
function pcStep(d) { const n = PC.at + d; if (n >= 0 && n < PC.list.length) pcOpen(n); }
function pcClose() { const m = $("cmodal"); if (m) { m.hidden = true; m.innerHTML = ""; } document.body.classList.remove("noscroll"); }
// Box-score names open the player's cards. The box re-renders while a game plays, so taps are
// tracked on the container (press and release can land on different copies of the same name).
(function () {
  const bt = document.getElementById("box-tables"); if (!bt) return;
  let down = null;
  const open = a => pcQuick(+a.dataset.pid, +a.dataset.season);
  bt.addEventListener("pointerdown", e => { const a = e.target.closest(".plq"); down = a ? { a, x: e.clientX, y: e.clientY, t: Date.now() } : null; });
  bt.addEventListener("pointerup", e => { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && Date.now() - down.t < 900) open(down.a); down = null; });
  bt.addEventListener("keydown", e => { const a = e.target.closest(".plq"); if (a && e.key === "Enter") open(a); });
})();
document.addEventListener("keydown", e => { const m = $("cmodal"); if (!m || m.hidden) return; if (e.key === "Escape") pcClose(); if (e.key === "ArrowLeft") pcStep(-1); if (e.key === "ArrowRight") pcStep(1); });
window.addEventListener("hashchange", () => { pcClose(); const m = $("packmodal"); if (m && !m.hidden) { m.hidden = true; m.innerHTML = ""; document.body.classList.remove("noscroll"); } });

// ---------- player screen ----------
const PS_TABS = [["overview", "Overview"], ["stats", "Stats"], ["ratings", "Attributes"], ["cards", "Cards"], ["career", "Career"]];
async function vPlayerScreen(id, tab) {
  const p = D.pl[id]; if (!p) return `<p>Unknown player.</p>`;
  const det = await pcDetail(+id);
  const keys = D.idx.keys, L = r => Object.fromEntries(keys.map((k, i) => [k, r[i]]));
  const reg = (D.idx.regular[id] || []).map(L).filter(s => s.gp), post = ((D.idx.playoffs || {})[id] || []).map(L).filter(s => s.gp);
  const cards = pcPlayerCards(p, det);
  PC.ps = { id: +id, p, det, reg, post, cards, mode: "pg", which: "reg", rseason: null, ppt: null };
  // how he scored in his most recent season (play types, from the season file)
  const lastY = reg.length ? reg[reg.length - 1].season : null;
  if (lastY) { try {
    const sd = await season(lastY); if (sd.ppt && sd.ppt[id]) PC.ps.ppt = { y: lastY, d: sd.ppt[id] };
    PC.ps.make = sd.players && sd.players[id]; PC.ps.health = sd.health && sd.health[id];
  } catch (e) { /* older data */ } }
  tab = PS_TABS.some(t => t[0] === tab) ? tab : "overview";
  const team = p.team ? TB[p.team] : TB[(reg[reg.length - 1] || {}).team] || null;
  const c1 = team ? team.c1 : "#59606b", c2 = team ? team.c2 : "#23272e";
  // hero card: upcoming card for active players, else HOF card, else his last season
  const hero = cards.find(c => c.upcoming) || cards.find(c => c.col === "hof") || cards.find(c => c.col === "base") || pcCard("base", D.lg.nextSeason, p.id, p.team, p.ovr, 0, null, p.num);
  pcSetList(cards, "hero"); const heroI = Math.max(0, cards.indexOf(hero));
  // the strip: last season (with league ranks) for active players, career averages for retired ones
  const last = reg.length && p.retired ? Object.assign(psTotals(reg), { season: "Career", team: reg.length + " seasons" }) : reg[reg.length - 1];
  const lastRk = det && last && !p.retired ? det.rk[last.season] || {} : {};
  const age = p.retired ? null : D.lg.nextSeason - p.born;
  const exp = reg.length;
  const wing = det && det.w ? det.w : null;
  const lastS = det && det.s.length ? det.s[det.s.length - 1] : null;
  const arch = p.r && !p.retired ? pcArch(p.r, p, D.lg.nextSeason) : lastS ? pcArch(pcR(lastS), p, lastS[0]) : null;
  const status = p.hof ? `<span class="tag gen">Hall of Fame ${p.hof}</span>` : p.retired ? `<span class="tag">Retired ${p.retired}</span>` : p.injury ? `<span class="tag inj2">${esc(p.injury.name)} · out ${p.injury.out}</span>` : p.team ? `<span class="tag act">Active</span>` : `<span class="tag">Free agent</span>`;
  const rk = k => lastRk[k] && lastRk[k] <= 10 ? `<sup class="rk${lastRk[k] === 1 ? " one" : ""}">#${lastRk[k]}</sup>` : "";
  const strip = last ? [["PTS", last.pts / last.gp, "pts"], ["REB", (last.oreb + last.dreb) / last.gp, "reb"], ["AST", last.ast / last.gp, "ast"], ["TKL", last.tkl / last.gp, "tkl"], ["BLK", last.blk / last.gp, "blk"], ["STL", last.stl / last.gp, "stl"]]
    .concat(last.dnk !== undefined ? [["DNK", last.dnk / last.gp, "dnk"]] : []).concat([["4PM", last.fpm / last.gp, "fpm"], ["TS%", last.fga + last.fta ? last.pts / (2 * (last.fga + 0.44 * last.fta)) * 100 : 0, "tsp"]]) : [];
  let h = `<div class="ps" style="--c:${c1};--c2:${c2}">
  <div class="phero">
    <div class="phcard">${pcFlip(hero, "hero")}<button class="linkbtn" onclick="pcOpen(${heroI},'hero')">Expand card ⤢</button></div>
    <div class="pbio">
      <div class="pkick">${p.num !== undefined ? `#${p.num} · ` : ""}${BB.ROLES[p.role].name}${team ? ` · ${tlink(team.id)}` : ""}</div>
      <h2>${esc(p.name)}</h2>
      <div class="pst">${status}</div>
      <dl class="facts">
        ${arch ? `<div><dt>Archetype</dt><dd>${esc(arch.offName)} <small class="m">/ ${esc(arch.defName)}</small></dd></div>` : ""}
        <div><dt>Height</dt><dd>${pcFt(p.ht)}</dd></div><div><dt>Weight</dt><dd>${p.wt} lb</dd></div>
        ${wing ? `<div><dt>Wingspan</dt><dd>${pcFt(wing)} <small class="m">${wing - p.ht >= 0 ? "+" : ""}${wing - p.ht}"</small></dd></div>` : ""}
        <div><dt>${age !== null ? "Age" : "Born"}</dt><dd>${age !== null ? age : p.born}</dd></div>
        <div><dt>Drafted</dt><dd>${p.draft ? `${p.draft.season} · R${p.draft.round} #${p.draft.pick} <small class="m">${TB[p.draft.team] ? TB[p.draft.team].name : ""}</small>` : "Original league player"}</dd></div>
        <div><dt>Experience</dt><dd>${exp} season${exp === 1 ? "" : "s"}${post.length ? ` <small class="m">${post.length} in playoffs</small>` : ""}</dd></div>
        ${p.contract ? `<div><dt>Contract</dt><dd>${money(p.contract.salary)} <small class="m">thru ${p.contract.thru}</small></dd></div>` : ""}
        <div><dt>Teams</dt><dd>${(p.teams || []).map(t => TB[t] ? `<a href="#team-${t}">${chip(t)}</a>` : "").join("")}</dd></div>
      </dl>
    </div>
  </div>`;
  if (last) h += `<div class="pstrip"><div class="psy">${last.season}<small>${last.team}</small></div>${strip.map(([l, v, k]) => `<div><b>${v.toFixed(l === "TS%" ? 1 : 1)}${rk(k)}</b><span>${l}</span></div>`).join("")}</div>`;
  h += `<nav class="tabs ptabs">${PS_TABS.map(([k, n]) => `<button data-pt="${k}" class="${k === tab ? "on" : ""}" onclick="psTab('${k}')">${n}</button>`).join("")}</nav>`;
  h += PS_TABS.map(([k]) => `<section class="ptab" id="pt-${k}" ${k === tab ? "" : "hidden"}></section>`).join("") + `</div>`;
  setTimeout(() => psTab(tab, true), 0);
  return h;
}
function psTab(k, first) {
  document.querySelectorAll(".ptabs button").forEach(b => b.classList.toggle("on", b.dataset.pt === k));
  document.querySelectorAll(".ptab").forEach(s => s.hidden = s.id !== "pt-" + k);
  const el = $("pt-" + k); if (!el) return;
  if (!el.dataset.done) { el.innerHTML = ({ overview: psOverview, stats: psStats, ratings: psRatings, cards: psCards, career: psCareer })[k](); el.dataset.done = 1; }
  if (!first) history.replaceState(null, "", `#player-${PC.ps.id}${k === "overview" ? "" : "-" + k}`);
}

// ----- overview -----
function psOverview() {
  const { p, det, reg, post } = PC.ps;
  let h = "";
  // trophy case
  if (p.awards && p.awards.length) {
    const c = {}; for (const [y, a] of p.awards) (c[a] = c[a] || []).push(y);
    const order = ["mvp", "fmvp", "champ", "dpoy", "roy", "sniper"];
    h += `<h3>Trophy case</h3><div class="trophies">${order.filter(a => c[a]).map(a => `<div class="tro ${a}"><b>${c[a].length > 1 ? c[a].length + "×" : ""}</b><span>${AWS[a]}</span><small>${c[a].join(", ")}</small></div>`).join("")}${p.hof ? `<div class="tro hof"><b>HOF</b><span>Hall of Fame</span><small>Class of ${p.hof}</small></div>` : ""}</div>`;
  }
  // his makeup (scouts' read on the hidden ratings) and his health history
  const mk = PC.ps.make, tags = [];
  if (mk && mk.temper !== undefined) {
    if (mk.clutch >= 0.4) tags.push(["Clutch", "rises late in close games"]); else if (mk.clutch <= -0.4) tags.push(["Shrinks late", "tight in crunch time"]);
    if (mk.streak >= 0.55) tags.push(["Streaky", "gets hot (and cold)"]);
    if (mk.tough >= 0.75) tags.push(["Tough", "big hits make him angry"]); else if (mk.tough <= 0.3) tags.push(["Rattles easily", "big hits get to him"]);
    if (mk.temper >= 0.72) tags.push(["Hothead", "quick to fight"]); else if (mk.temper <= 0.22) tags.push(["Cool customer", "never takes the bait"]);
  }
  const hh = PC.ps.health;
  if (tags.length || hh) h += `<h3>Makeup and health</h3>${tags.length ? `<p class="idtags">${tags.map(([a, b]) => `<span title="${esc(b)}">${a}</span>`).join("")}</p>` : ""}${hh ? `<p class="m small">${hh.conc ? `${hh.conc} concussion${hh.conc > 1 ? "s" : ""} on record${hh.conc >= 3 ? " (at risk of retiring early)" : ""}` : ""}${hh.conc && hh.chronic.length ? " · " : ""}${hh.chronic.length ? "plays through a " + hh.chronic.map(esc).join(" and a ") : ""}</p>` : ""}`;
  // how he scores
  if (PC.ps.ppt) {
    const d = PC.ps.ppt.d, ks = Object.keys(d).filter(k => BB.PT_LABEL[k]).sort((a, b) => d[b][1] - d[a][1]), tot = ks.reduce((a, k) => a + d[k][1], 0);
    if (tot > 0) h += `<h3>How he scored in ${PC.ps.ppt.y}</h3><div class="tw"><table class="box strat"><thead><tr><th class="pn">Play type</th><th>Points</th><th>Share</th><th>Shots</th><th>Pts/shot</th></tr></thead><tbody>${ks.map(k => `<tr><td class="pn">${BB.PT_LABEL[k]}</td><td class="b">${d[k][1]}</td><td><i class="meter"><i style="--v:${Math.round(d[k][1] / tot * 100)}%"></i></i> ${Math.round(d[k][1] / tot * 100)}%</td><td>${d[k][0]}</td><td>${(d[k][1] / Math.max(1, d[k][0])).toFixed(2)}</td></tr>`).join("")}</tbody></table></div>`;
  }
  // overall progression
  if (det && det.s.length) h += `<h3>Overall by season</h3>` + psOvrChart(det.s, p);
  // career totals
  const tot = psTotals(reg);
  if (tot.gp) {
    const cells = [["Games", tot.gp], ["Points", tot.pts], ["Rebounds", tot.oreb + tot.dreb], ["Assists", tot.ast], ["Tackles", tot.tkl], ["Broken tackles", tot.btk], ["Blocks", tot.blk], ["Steals", tot.stl]]
      .concat(tot.dnk !== undefined ? [["Dunks", tot.dnk]] : []).concat([["Threes", tot.tpm], ["Fours", tot.fpm], ["Minutes", Math.round(tot.min / 60)]]);
    h += `<h3>Career totals</h3><div class="kv">${cells.map(([l, v]) => `<div><b>${Number(v).toLocaleString()}</b><span>${l}</span></div>`).join("")}</div>`;
    h += `<div class="kv avg">${[["PPG", tot.pts / tot.gp], ["RPG", (tot.oreb + tot.dreb) / tot.gp], ["APG", tot.ast / tot.gp], ["TKL", tot.tkl / tot.gp], ["FG%", tot.fga ? tot.fgm / tot.fga * 100 : 0], ["TS%", tot.fga + tot.fta ? tot.pts / (2 * (tot.fga + 0.44 * tot.fta)) * 100 : 0]].map(([l, v]) => `<div><b>${v.toFixed(1)}</b><span>Career ${l}</span></div>`).join("")}</div>`;
  }
  // single-game highs
  if (det && Object.keys(det.hi).length) h += psHighs(det.hi, "Career highs (regular season)") + (Object.keys(det.ph).length ? psHighs(det.ph, "Playoff highs") : "");
  // badges
  const cur = p.r || (det && det.s.length ? pcR(det.s[det.s.length - 1]) : null);
  if (cur) { const bd = CC.badges(cur); h += `<h3>Badges <span class="m small">${p.r ? "current ratings" : "final season"}</span></h3><div class="bdg">${bd.map(b => `<span class="bd ${b.tier}" title="${esc(b.d)}">${esc(b.name)}<small>${b.tierName} · ${esc(b.d)}</small></span>`).join("") || `<span class="m">No badges yet.</span>`}</div>`; }
  if (post.length) { const pt = psTotals(post); h += `<p class="m small">Playoffs: ${pt.gp} games, ${pcAvg(pt.pts, pt.gp)} PPG, ${pcAvg(pt.oreb + pt.dreb, pt.gp)} RPG, ${pcAvg(pt.ast, pt.gp)} APG, ${pt.tkl} tackles.</p>`; }
  return h || `<p class="m">No games on the record yet.</p>`;
}
function psTotals(rows) { const t = {}; for (const s of rows) for (const k of D.idx.keys.slice(2)) if (s[k] !== undefined) t[k] = (t[k] || 0) + s[k]; return t; }
function psOvrChart(rows, p) {
  const W = 420, H = 190, padL = 26, padR = 8, padT = 10, padB = 24;
  const pts = rows.map(r => [r[0], r[3]]); if (p.r && !p.retired) pts.push([D.lg.nextSeason, p.ovr]);
  const y0 = Math.max(35, Math.min(...pts.map(x => x[1])) - 6), y1 = Math.min(99, Math.max(...pts.map(x => x[1])) + 5);
  const xs = i => padL + (pts.length === 1 ? (W - padL - padR) / 2 : i / (pts.length - 1) * (W - padL - padR)), ys = v => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
  let s = `<svg class="ovrchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall rating by season">`;
  for (const t of CC.TIERS) { const lo = Math.max(t.min, y0), nx = CC.TIERS[CC.TIERS.indexOf(t) + 1], hi = Math.min(nx ? nx.min : 100, y1); if (hi <= lo) continue; s += `<rect x="${padL}" y="${ys(hi)}" width="${W - padL - padR}" height="${ys(lo) - ys(hi)}" fill="${CART.TP[t.key].acc}" opacity=".07"/><text x="${W - padR - 4}" y="${ys(hi) + 11}" font-size="9" fill="${CART.TP[t.key].acc}" text-anchor="end" opacity=".8">${t.name.toUpperCase()}</text>`; }
  for (let v = Math.ceil(y0 / 5) * 5; v <= y1; v += 5) s += `<line x1="${padL}" x2="${W - padR}" y1="${ys(v)}" y2="${ys(v)}" stroke="#232a35"/><text x="${padL - 5}" y="${ys(v) + 3}" font-size="9" fill="#8b95a5" text-anchor="end">${v}</text>`;
  s += `<polyline points="${pts.map((x, i) => xs(i) + "," + ys(x[1])).join(" ")}" fill="none" stroke="var(--c,#f2b134)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`;
  const peak = Math.max(...pts.map(x => x[1]));
  const every = Math.ceil(pts.length / 8);
  pts.forEach((x, i) => { const t = CC.tierFor(x[1]); s += `<circle cx="${xs(i)}" cy="${ys(x[1])}" r="4" fill="${CART.TP[t.key].acc}" stroke="#0b0d11" stroke-width="1.5"><title>${x[0]}: ${x[1]} (${t.name})</title></circle>`; if (i % every === 0 || i === pts.length - 1) s += `<text x="${xs(i)}" y="${H - 8}" font-size="10" fill="#8b95a5" text-anchor="middle">'${String(x[0]).slice(2)}</text>`; if (x[1] === peak && pts.findIndex(z => z[1] === peak) === i) s += `<text x="${xs(i)}" y="${ys(x[1]) - 8}" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">${x[1]}</text>`; });
  return s + `</svg>`;
}
function psHighs(hi, title) {
  const hk = (PC.idx && PC.idx.highKeys) || ["pts", "reb", "ast", "stl", "blk", "tkl", "btk", "dnk", "tpm", "fpm"];
  const lab = { pts: "Points", reb: "Rebounds", ast: "Assists", stl: "Steals", blk: "Blocks", tkl: "Tackles", btk: "Broken tackles", dnk: "Dunks", tpm: "Threes", fpm: "Fours" };
  const best = {}, feats = [0, 0, 0, 0, 0];
  for (const [y, a] of Object.entries(hi)) {
    hk.forEach((k, i) => { if (!best[k] || a[2 * i] > best[k][0]) best[k] = [a[2 * i], a[2 * i + 1], +y]; });
    for (let i = 0; i < 5; i++) feats[i] += a[hk.length * 2 + i] || 0;
  }
  let h = `<h3>${title}</h3><div class="highs">${hk.filter(k => best[k] && best[k][0] > 0).map(k => { const [v, g, y] = best[k]; return `<a href="#watch-${y}-${g}" title="Replay the game"><b>${v}</b><span>${lab[k]}</span><small>${y} ▶</small></a>`; }).join("")}</div>`;
  h += `<div class="feats">${[["Double-doubles", feats[0]], ["Triple-doubles", feats[1]], ["30-point games", feats[2]], ["40-point games", feats[3]], ["50-point games", feats[4]]].map(([l, v]) => `<span><b>${v}</b> ${l}</span>`).join("")}</div>`;
  return h;
}

// ----- stats -----
const PS_MODES = [["pg", "Per game"], ["tot", "Totals"], ["p36", "Per 36"], ["shoot", "Shooting"], ["adv", "Advanced"], ["bb", "Bounceball"], ["hi", "Season highs"]];
function psStats() {
  const ps = PC.ps;
  return `<div class="pmodes"><div class="seg">${[["reg", "Regular season"], ["post", "Playoffs"]].map(([k, n]) => `<button class="${ps.which === k ? "on" : ""}" onclick="psSet('which','${k}')">${n}</button>`).join("")}</div>
  <div class="seg scroll">${PS_MODES.map(([k, n]) => `<button class="${ps.mode === k ? "on" : ""}" onclick="psSet('mode','${k}')">${n}</button>`).join("")}</div></div>
  <div id="ps-table">${psTable()}</div><p class="m small">Highlighted numbers ranked in the league's top 10 that season (qualified players, 60% of games). eFG% counts a three as 1.5 twos and a four as 2. Game Score uses the league's MVP formula (tackles count triple).</p>`;
}
function psSet(k, v) { PC.ps[k] = v; const el = $("pt-stats"); el.innerHTML = psStats(); }
function psTable() {
  const ps = PC.ps, rows = ps.which === "post" ? ps.post : ps.reg, det = ps.det;
  if (!rows.length) return `<p class="m">${ps.which === "post" ? "Never played in the playoffs." : "No games on the record."}</p>`;
  if (ps.mode === "hi") return psHighTable(ps.which === "post" ? (det ? det.ph : {}) : (det ? det.hi : {}));
  const has = k => rows[0][k] !== undefined;
  const reb = s => s.oreb + s.dreb, two = s => [s.fgm - s.tpm - s.fpm, s.fga - s.tpa - s.fpa];
  const mn = s => s.min / 60, per = (v, s) => s.gp ? v / s.gp : 0, p36 = (v, s) => s.min ? v / s.min * 2160 : 0;
  const ts = s => s.fga + s.fta ? s.pts / (2 * (s.fga + 0.44 * s.fta)) * 100 : null, efg = s => s.fga ? (s.fgm + 0.5 * s.tpm + s.fpm) / s.fga * 100 : null;
  const gsc = s => s.pts + 0.8 * reb(s) + 1.2 * s.ast + 2 * s.stl + 2 * s.blk + 3 * s.tkl + s.btk - 1.2 * s.to - 0.6 * (s.fga - s.fgm) - 0.4 * (s.fta - s.ftm);
  const f = (v, d) => v === null || v === undefined || isNaN(v) ? "–" : v.toFixed(d === undefined ? 1 : d);
  let cols;
  if (ps.mode === "pg") cols = [["GP", s => s.gp, 0], ["GS", s => s.gs, 0], ["MIN", s => per(mn(s), s), 1, "min"], ["PTS", s => per(s.pts, s), 1, "pts"], ["REB", s => per(reb(s), s), 1, "reb"], ["OREB", s => per(s.oreb, s)], ["DREB", s => per(s.dreb, s)], ["AST", s => per(s.ast, s), 1, "ast"], ["STL", s => per(s.stl, s), 1, "stl"], ["BLK", s => per(s.blk, s), 1, "blk"], ["TKL", s => per(s.tkl, s), 1, "tkl"], ["BTK", s => per(s.btk, s), 1, "btk"]].concat(has("dnk") ? [["DNK", s => per(s.dnk, s)]] : []).concat([["TO", s => per(s.to, s)], ["PF", s => per(s.pf, s)], ["FG%", s => s.fga ? s.fgm / s.fga * 100 : null, 1, "fgp"]]);
  if (ps.mode === "tot") cols = [["GP", s => s.gp, 0], ["MIN", s => mn(s), 0], ["PTS", s => s.pts, 0], ["REB", s => reb(s), 0], ["AST", s => s.ast, 0], ["STL", s => s.stl, 0], ["BLK", s => s.blk, 0], ["TKL", s => s.tkl, 0], ["BTK", s => s.btk, 0]].concat(has("dnk") ? [["DNK", s => s.dnk, 0, "dnk"]] : []).concat([["3PM", s => s.tpm, 0, "tpm"], ["4PM", s => s.fpm, 0, "fpm"], ["FTM", s => s.ftm, 0], ["TO", s => s.to, 0], ["PF", s => s.pf, 0]]);
  if (ps.mode === "p36") cols = [["MIN", s => per(mn(s), s)], ["PTS", s => p36(s.pts, s)], ["REB", s => p36(reb(s), s)], ["AST", s => p36(s.ast, s)], ["STL", s => p36(s.stl, s)], ["BLK", s => p36(s.blk, s)], ["TKL", s => p36(s.tkl, s)], ["BTK", s => p36(s.btk, s)]].concat(has("dnk") ? [["DNK", s => p36(s.dnk, s)]] : []).concat([["3PA", s => p36(s.tpa, s)], ["4PA", s => p36(s.fpa, s)], ["FTA", s => p36(s.fta, s)], ["TO", s => p36(s.to, s)]]);
  if (ps.mode === "shoot") cols = [["FG", s => `${s.fgm}-${s.fga}`], ["FG%", s => s.fga ? s.fgm / s.fga * 100 : null, 1, "fgp"], ["2P", s => two(s).join("-")], ["2P%", s => two(s)[1] ? two(s)[0] / two(s)[1] * 100 : null], ["3P", s => `${s.tpm}-${s.tpa}`], ["3P%", s => s.tpa ? s.tpm / s.tpa * 100 : null], ["4P", s => `${s.fpm}-${s.fpa}`], ["4P%", s => s.fpa ? s.fpm / s.fpa * 100 : null], ["FT", s => `${s.ftm}-${s.fta}`], ["FT%", s => s.fta ? s.ftm / s.fta * 100 : null], ["eFG%", efg], ["TS%", ts, 1, "tsp"], ["3PAr", s => s.fga ? s.tpa / s.fga * 100 : null], ["4PAr", s => s.fga ? s.fpa / s.fga * 100 : null], ["FTr", s => s.fga ? s.fta / s.fga * 100 : null]];
  if (ps.mode === "adv") cols = [["GmSc", s => per(gsc(s), s)], ["TS%", ts, 1, "tsp"], ["eFG%", efg], ["USG/36", s => p36(s.fga + 0.44 * s.fta + s.to, s)], ["AST/TO", s => s.to ? s.ast / s.to : null, 2], ["TO/36", s => p36(s.to, s)], ["STOCKS/36", s => p36(s.stl + s.blk, s)], ["DEF/36", s => p36(s.stl + s.blk + s.tkl, s)], ["OREB%", s => reb(s) ? s.oreb / reb(s) * 100 : null], ["PF/36", s => p36(s.pf, s)], ["PTS/SHOT", s => s.fga ? (s.pts - s.ftm) / s.fga : null, 2]];
  if (ps.mode === "bb") cols = [["TKL", s => s.tkl, 0, "tkl"], ["TKL/G", s => per(s.tkl, s), 2], ["TKL/36", s => p36(s.tkl, s), 2], ["BTK", s => s.btk, 0, "btk"], ["BTK/G", s => per(s.btk, s), 2]].concat(has("dnk") ? [["DNK", s => s.dnk, 0, "dnk"], ["DNK/G", s => per(s.dnk, s), 2], ["DNK% of 2s", s => two(s)[0] ? s.dnk / two(s)[0] * 100 : null]] : []).concat([["4PM", s => s.fpm, 0, "fpm"], ["4PA", s => s.fpa, 0], ["4P%", s => s.fpa ? s.fpm / s.fpa * 100 : null], ["PTS from 4s", s => s.pts ? s.fpm * 4 / s.pts * 100 : null], ["BLK", s => s.blk, 0, "blk"]]);
  const rkOf = (y, k) => ps.which === "reg" && det && k && det.rk[y] ? det.rk[y][k] : 0;
  const cell = (s, c, career) => { const v = c[1](s), r = career ? 0 : rkOf(s.season, c[3]); const txt = typeof v === "string" ? v : f(v, c[2]); return `<td class="${r && r <= 10 ? "lead" + (r === 1 ? " one" : "") : ""}">${txt}${r && r <= 10 ? `<sup>#${r}</sup>` : ""}</td>`; };
  let h = `<div class="tw"><table class="box"><thead><tr><th class="pn">Season</th><th>Tm</th>${cols.map(c => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody>`;
  for (const s of rows.slice().reverse()) h += `<tr><td class="pn"><a href="#leaders-${s.season}">${s.season}</a></td><td>${TB[s.team] ? `<a href="#team-${s.team}">${s.team}</a>` : s.team}</td>${cols.map(c => cell(s, c)).join("")}</tr>`;
  const tot = Object.assign({ season: "Career", team: "" }, psTotals(rows));
  h += `<tr class="tot"><td class="pn">Career</td><td></td>${cols.map(c => cell(tot, c, true)).join("")}</tr>`;
  return h + `</tbody></table></div>`;
}
function psHighTable(hi) {
  const hk = (PC.idx && PC.idx.highKeys) || ["pts", "reb", "ast", "stl", "blk", "tkl", "btk", "dnk", "tpm", "fpm"];
  const lab = { pts: "PTS", reb: "REB", ast: "AST", stl: "STL", blk: "BLK", tkl: "TKL", btk: "BTK", dnk: "DNK", tpm: "3PM", fpm: "4PM" };
  const ys = Object.keys(hi).sort((a, b) => b - a);
  if (!ys.length) return `<p class="m">Single-game highs aren't in this record.</p>`;
  let h = `<div class="tw"><table class="box"><thead><tr><th class="pn">Season</th>${hk.map(k => `<th>${lab[k]}</th>`).join("")}<th>DD</th><th>TD</th><th>30+</th><th>40+</th></tr></thead><tbody>`;
  const best = hk.map((k, i) => Math.max(...ys.map(y => hi[y][2 * i])));
  for (const y of ys) { const a = hi[y]; h += `<tr><td class="pn">${y}</td>${hk.map((k, i) => `<td class="${a[2 * i] === best[i] && best[i] > 0 ? "lead" : ""}">${a[2 * i + 1] >= 0 ? `<a href="#watch-${y}-${a[2 * i + 1]}" title="Replay the game">${a[2 * i]}</a>` : a[2 * i]}</td>`).join("")}${[0, 1, 2, 3].map(i => `<td>${a[hk.length * 2 + i] || ""}</td>`).join("")}</tr>`; }
  return h + `</tbody></table></div><p class="m small">Tap a number to replay that game. Highlighted: career high.</p>`;
}

// ----- attributes -----
function psRatings() {
  const { p, det } = PC.ps;
  const seasons = det ? det.s.map(s => s[0]) : [];
  const opts = (p.r && !p.retired ? [D.lg.nextSeason] : []).concat(seasons.slice().reverse());
  if (!opts.length) return `<p class="m">No ratings on the record.</p>`;
  const y = PC.ps.rseason || opts[0];
  const rowOf = yy => yy === D.lg.nextSeason && p.r && !p.retired ? { r: p.r, ovr: p.ovr, wt: p.wt } : (() => { const s = det.s.find(x => x[0] === yy); return s ? { r: pcR(s), ovr: s[3], wt: s[4] } : null; })();
  const cur = rowOf(y), prevY = opts[opts.indexOf(y) + 1], prev = prevY ? rowOf(prevY) : null;
  const allR = opts.map(rowOf).filter(Boolean), peak = Object.fromEntries(BB.RKEYS.map(k => [k, Math.max(...allR.map(x => x.r[k]))]));
  const gs = CC.groupScores(cur.r), gp = CC.groupScores(peak);
  let h = `<div class="vh"><h3>Ratings ${y === D.lg.nextSeason && p.r && !p.retired ? `going into ${y}` : `as ${y} began`}</h3><select class="sp" onchange="PC.ps.rseason=+this.value;$('pt-ratings').innerHTML=psRatings()">${opts.map(o => `<option ${o === y ? "selected" : ""}>${o}</option>`).join("")}</select></div>`;
  const sar = pcArch(cur.r, p, y);
  if (sar) h += `<p class="m">Archetype ${y === D.lg.nextSeason && p.r && !p.retired ? "now" : "that season"}: <b style="color:var(--ink)">${esc(sar.offName)}</b> on offense, <b style="color:var(--ink)">${esc(sar.defName)}</b> on defense.</p>`;
  h += `<div class="rtop"><div class="rovr t-${CC.tierFor(cur.ovr).key}"><b>${cur.ovr}</b><span>${CC.tierFor(cur.ovr).name}</span>${prev ? `<small class="${cur.ovr - prev.ovr >= 0 ? "up" : "dn"}">${cur.ovr - prev.ovr >= 0 ? "+" : ""}${cur.ovr - prev.ovr} from ${prevY}</small>` : ""}</div>${psRadar(gs, gp)}</div>`;
  h += `<div class="agrid">${CC.GROUPS.map(g => `<div class="ag"><div class="agh"><span>${g.name}</span><b style="color:${CART.valColor(gs[g.key])}">${gs[g.key]}</b></div>${g.keys.map(k => {
    const v = cur.r[k], d = prev ? v - prev.r[k] : 0;
    return `<div class="ar"><span>${BB.RLABEL[k]}</span><i><em style="width:${v}%;background:${CART.valColor(v)}"></em><u style="left:${peak[k]}%" title="Career peak ${peak[k]}"></u></i><b>${v}</b><small class="${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "+" + d : d < 0 ? d : ""}</small></div>`;
  }).join("")}</div>`).join("")}</div><p class="m small">Bars show this season; the tick marks his career peak in each rating. Arrows compare with the season before.</p>`;
  const bd = CC.badges(cur.r);
  h += `<h3>Badges</h3><div class="bdg">${bd.map(b => `<span class="bd ${b.tier}" title="${esc(b.d)}">${esc(b.name)}<small>${b.tierName} · ${b.v}</small></span>`).join("") || `<span class="m">None.</span>`}</div>`;
  h += `<h3>Body</h3><div class="kv">${[["Height", pcFt(p.ht)], ["Weight", cur.wt + " lb"]].concat(det && det.w ? [["Wingspan", pcFt(det.w)], ["Reach vs height", (det.w - p.ht >= 0 ? "+" : "") + (det.w - p.ht) + '"']] : []).concat([["Role", BB.ROLES[p.role].name], ["Typical " + BB.ROLES[p.role].name, `${pcFt(BB.ROLES[p.role].ht[0])}–${pcFt(BB.ROLES[p.role].ht[1])}`]]).map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>`;
  if (allR.length > 1) {
    const ys = opts.slice().reverse(), rows = ys.map(rowOf);
    h += `<h3>Every rating, every season</h3><div class="tw"><table class="box heat"><thead><tr><th class="pn">Rating</th>${ys.map(x => `<th>'${String(x).slice(2)}</th>`).join("")}</tr></thead><tbody>`;
    h += `<tr><td class="pn"><b>Overall</b></td>${rows.map(r => `<td style="background:${CART.valColor(r.ovr)}33"><b>${r.ovr}</b></td>`).join("")}</tr>`;
    for (const g of CC.GROUPS) for (const k of g.keys) h += `<tr><td class="pn">${BB.RLABEL[k]}</td>${rows.map(r => `<td style="background:${CART.valColor(r.r[k])}${Math.round(18 + Math.max(0, r.r[k] - 40) * 0.9).toString(16).padStart(2, "0")}">${r.r[k]}</td>`).join("")}</tr>`;
    h += `</tbody></table></div>`;
  }
  return h;
}
function psRadar(gs, peak) {
  const n = CC.GROUPS.length, cx = 130, cy = 112, R = 84;
  const pt = (i, v) => { const a = -Math.PI / 2 + i / n * Math.PI * 2, r = R * Math.max(0, v - 20) / 79; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  let s = `<svg class="radar" viewBox="0 0 260 230" role="img" aria-label="Rating groups">`;
  for (const lv of [40, 60, 80, 99]) s += `<polygon points="${CC.GROUPS.map((g, i) => pt(i, lv).join(",")).join(" ")}" fill="none" stroke="#232a35"/>`;
  CC.GROUPS.forEach((g, i) => { const [x, y] = pt(i, 99); s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#232a35"/>`; const [lx, ly] = pt(i, 116); s += `<text x="${lx}" y="${ly + 4}" font-size="10.5" fill="#aab3bf" text-anchor="middle">${g.name}</text><text x="${lx}" y="${ly + 16}" font-size="11" font-weight="700" fill="${CART.valColor(gs[g.key])}" text-anchor="middle">${gs[g.key]}</text>`; });
  s += `<polygon points="${CC.GROUPS.map((g, i) => pt(i, peak[g.key]).join(",")).join(" ")}" fill="none" stroke="#8b95a5" stroke-dasharray="3 3"/>`;
  s += `<polygon points="${CC.GROUPS.map((g, i) => pt(i, gs[g.key]).join(",")).join(" ")}" fill="var(--c,#f2b134)" fill-opacity=".35" stroke="var(--c,#f2b134)" stroke-width="2"/>`;
  return s + `</svg>`;
}

// ----- cards -----
function psCards() {
  const { cards } = PC.ps;
  if (!cards.length) return `<p class="m">No cards yet.</p>`;
  const f = PC.ps.cf || "all", list = cards.filter(c => f === "all" || (f === "base" ? c.col === "base" : c.col !== "base"));
  pcSetList(list, "binder");
  const byCol = {}; for (const c of cards) byCol[c.col] = (byCol[c.col] || 0) + 1;
  const byTier = {}; for (const c of cards) byTier[c.tier.key] = (byTier[c.tier.key] || 0) + 1;
  const best = cards.reduce((a, b) => b.ovr > a.ovr ? b : a);
  let h = `<p class="m">${cards.length} card${cards.length === 1 ? "" : "s"} · best: ${esc((CC.CBY[best.col] || {}).name)} ${best.season} (${best.ovr}, ${best.tier.name}). Tap any card to look closer.</p>`;
  h += `<div class="chips">${CC.COLLECTIONS.filter(c => byCol[c.key]).map(c => `<a class="cchip" href="#cards-${c.key}">${esc(c.name)} <b>${byCol[c.key]}</b></a>`).join("")}</div>`;
  h += `<div class="chips">${CC.TIERS.slice().reverse().filter(t => byTier[t.key]).map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${byTier[t.key]}</b></span>`).join("")}</div>`;
  h += `<div class="seg">${[["all", "All cards"], ["special", "Collections"], ["base", "Base"]].map(([k, n]) => `<button class="${f === k ? "on" : ""}" onclick="PC.ps.cf='${k}';$('pt-cards').innerHTML=psCards()">${n}</button>`).join("")}</div>`;
  h += psCompare(cards);
  h += `<div class="cgrid binder">`; let lastY = null;
  list.forEach((c, i) => {
    if (c.season !== lastY) { lastY = c.season; const n = list.filter(x => x.season === c.season).length; h += `<div class="cdiv"><b>${c.season}</b> ${TB[c.team] ? chip(c.team) + TB[c.team].name : ""} <span class="m">· ${n} card${n === 1 ? "" : "s"}</span></div>`; }
    h += pcTile(c, i, c.col === "base" ? (c.upcoming ? "Upcoming" : "Base") : esc(CC.CBY[c.col].name), "binder");
  });
  return h + `</div>`;
}

// side-by-side attributes of every card he has from one season
function psCompare(cards) {
  const ys = [...new Set(cards.filter(c => c.r && c.col !== "base").map(c => c.season))].sort((a, b) => b - a);
  if (!ys.length) return "";
  const y = PC.ps.cy && ys.includes(PC.ps.cy) ? PC.ps.cy : ys[0];
  const set = cards.filter(c => c.season === y && c.r).sort((a, b) => (a.col === "base") - (b.col === "base") || b.ovr - a.ovr);
  const base = set.find(c => c.col === "base"), cols = (base ? [base] : []).concat(set.filter(c => c.col !== "base"));
  const built = cols.map(c => (pcBuild(c) || { r: c.r }).r);
  let h = `<h3>Compare his cards</h3><div class="vh"><p class="m small" style="margin:0">Every card has its own build. Same season, different card, different ratings.</p><select class="sp" onchange="PC.ps.cy=+this.value;$('pt-cards').innerHTML=psCards()">${ys.map(x => `<option ${x === y ? "selected" : ""}>${x}</option>`).join("")}</select></div>`;
  h += `<div class="tw"><table class="box cmp"><thead><tr><th class="pn"></th>${cols.map(c => `<th><span class="gem t-${c.tier.key}"></span>${esc(c.col === "base" ? "Base" : CC.CBY[c.col].name)}</th>`).join("")}</tr></thead><tbody>`;
  h += `<tr class="tot"><td class="pn">Overall</td>${cols.map(c => `<td><b>${c.ovr}</b></td>`).join("")}</tr>`;
  for (const g of CC.GROUPS) for (const k of g.keys) {
    const vals = built.map(r => r[k]), mx = Math.max(...vals), b0 = base ? base.r[k] : null;
    h += `<tr><td class="pn">${BB.RLABEL[k]}</td>${vals.map((v, i) => `<td class="${v === mx && mx > Math.min(...vals) ? "lead" : ""}">${v}${b0 !== null && i > 0 && v > b0 ? `<sup class="up">+${v - b0}</sup>` : ""}</td>`).join("")}</tr>`;
  }
  return h + `</tbody></table></div>`;
}

// ----- career timeline -----
function psCareer() {
  const { p, det } = PC.ps;
  const ev = (det ? det.tl.slice() : []);
  for (const [y, a] of p.awards || []) ev.push([y, 300, "award", a]);
  if (p.hof) ev.push([p.hof, 301, "hof"]);
  const T = t => TB[t] ? tlink(t, true) : esc(t || "");
  const when = d => d < 0 ? "Offseason" : d >= 300 ? "Season's end" : d >= 200 ? `Playoffs` : `Day ${d + 1}`;
  const fmt = e => {
    switch (e[2]) {
      case "draft": return ["🎓", `Drafted by ${T(e[3])}, round ${e[4]}, pick ${e[5]}`];
      case "sign": return ["✍️", e[4] === "free agent" ? `Signed with ${T(e[3])} as a free agent · ${money(e[5])}/yr for ${e[6]} yr${e[6] === 1 ? "" : "s"}` : e[4] === "hardship" ? `Signed by ${T(e[3])} on an injury hardship` : `Signed by ${T(e[3])}${e[5] ? " · " + money(e[5]) : ""}`];
      case "resign": return ["✍️", `Re-signed with ${T(e[3])} · ${money(e[4])}/yr`];
      case "trade": return ["🔁", `Traded from ${T(e[3])} to ${T(e[4])}`];
      case "waive": return ["✂️", `Waived by ${T(e[3])}${e[4] ? ` · ${money(e[4])} dead money` : ""}`];
      case "retire": return ["👋", `Retired (${T(e[3])})`];
      case "expansion": return ["🆕", `Taken by ${T(e[3])} from ${T(e[4])} in the expansion draft`];
      case "inj": return ["🩹", `${esc(e[4])} · out ${e[5] >= 82 ? "for the season" : e[5] + " games"}`];
      case "blot": return ["🚨", `${esc(p.name.split(" ")[0])} ${esc(e[4])}${e[6] ? ` <span class="k ${e[5]}">${e[6]}-game suspension</span>` : ""}${e[7] ? ` <span class="k">${money(e[7])} fine</span>` : ""}`];
      case "award": return ["🏆", e[3] === "champ" ? "Won the championship" : `Won ${AW[e[3]] || AWS[e[3]] || e[3]}`];
      case "hof": return ["🏛️", "Inducted into the Hall of Fame"];
    }
    return ["•", e[2]];
  };
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!ev.length) return `<p class="m">Nothing on the record yet.</p>`;
  let h = `<div class="tline">`, lastY = null;
  for (const e of ev) {
    if (e[0] !== lastY) { lastY = e[0]; h += `<div class="cty">${e[0]}</div>`; }
    const [ic, txt] = fmt(e);
    h += `<div class="cte ${e[2]}"><i>${ic}</i><div>${txt}<small>${when(e[1])}</small></div></div>`;
  }
  return h + `</div>`;
}

// ---------- the card collections ----------
async function vCards(col, season) {
  const ix = await pcIndex();
  if (!ix) return `<h2>Cards</h2><p>Card collections need the card index. Run <code>node scripts/build-index.js data</code> (the history workflow does this) and reload.</p>`;
  const all = pcAll(ix);
  if (!col) return pcHome(all);
  if (col === "packs") return pcPacks(all);
  if (col === "mine") return pcMine(all);
  const C = CC.CBY[col]; if (!C) return `<p>Unknown collection.</p>`;
  if (PC.lastCol !== col) { PC.lastCol = col; PC.tierF = null; }
  let list = all.filter(c => c.col === col);
  const seasons = [...new Set(list.map(c => c.season))].sort((a, b) => b - a);
  if (season) list = list.filter(c => c.season === +season);
  const sort = PC.sort || "ovr";
  list.sort(sort === "new" ? (a, b) => b.season - a.season || b.ovr - a.ovr : sort === "old" ? (a, b) => a.season - b.season || b.ovr - a.ovr : (a, b) => b.ovr - a.ovr || b.season - a.season);
  if (PC.tierF) list = list.filter(c => c.tier.key === PC.tierF);
  const my = MY.load(), ownedN = list.filter(c => my.owned[pcKey(c)]).length;
  if (PC.ownF === "own") list = list.filter(c => my.owned[pcKey(c)]); else if (PC.ownF === "miss") list = list.filter(c => !my.owned[pcKey(c)]);
  const byTier = {}; for (const c of all.filter(c => c.col === col && (!season || c.season === +season))) byTier[c.tier.key] = (byTier[c.tier.key] || 0) + 1;
  PC.colList = list; PC.shown = Math.min(list.length, 40); pcSetList(list, "col");
  let h = `<p><a href="#cards">← All collections</a></p><div class="vh"><h2>${esc(C.name)}</h2><div class="row"><select class="sp" onchange="location.hash='cards-${col}'+(this.value?'-'+this.value:'')"><option value="">All seasons</option>${seasons.map(y => `<option ${+season === y ? "selected" : ""}>${y}</option>`).join("")}</select><select class="sp" onchange="PC.sort=this.value;route()"><option value="ovr" ${sort === "ovr" ? "selected" : ""}>Best first</option><option value="new" ${sort === "new" ? "selected" : ""}>Newest</option><option value="old" ${sort === "old" ? "selected" : ""}>Oldest</option></select></div></div>`;
  h += `<p class="m">${esc(C.blurb)} ${C.kind === "leader" ? `Cards go to the top of the league each season (3 players when there were six teams, 10 with 24). Boost: +5 for the leader, +4 for 2nd–3rd, +3 for 4th–6th, +2 after that.` : C.bump ? `Card boost: +${C.bump}${C.boost === "all" ? " to every rating" : ""}.` : "No boost."}</p>`;
  h += `<div class="chips"><button class="tchip ${!PC.tierF ? "on" : ""}" onclick="PC.tierF=null;route()">All <b>${Object.values(byTier).reduce((a, b) => a + b, 0)}</b></button>${CC.TIERS.slice().reverse().filter(t => byTier[t.key]).map(t => `<button class="tchip ${PC.tierF === t.key ? "on" : ""}" onclick="PC.tierF='${t.key}';route()"><span class="gem t-${t.key}"></span>${t.name} <b>${byTier[t.key]}</b></button>`).join("")}</div>`;
  if (Object.keys(my.owned).length) h += `<div class="seg" style="margin-bottom:6px">${[["", "All"], ["own", `Owned (${ownedN})`], ["miss", "Missing"]].map(([k, n]) => `<button class="${(PC.ownF || "") === k ? "on" : ""}" onclick="PC.ownF='${k}';route()">${n}</button>`).join("")}</div>`;
  h += `<div class="cgrid" id="cgrid">${list.slice(0, PC.shown).map((c, i) => pcTile(c, i, `${c.season}${c.rank ? " · #" + c.rank : ""}`, "col")).join("")}</div>`;
  if (list.length > PC.shown) h += `<p class="more"><button onclick="pcMore()">Show more (${list.length - PC.shown} left)</button></p>`;
  if (!list.length) h += `<p class="m">No cards match.</p>`;
  return h;
}
function pcMore() {
  const from = PC.shown; PC.shown = Math.min(PC.colList.length, PC.shown + 40);
  $("cgrid").insertAdjacentHTML("beforeend", PC.colList.slice(from, PC.shown).map((c, i) => pcTile(c, from + i, `${c.season}${c.rank ? " · #" + c.rank : ""}`, "col")).join(""));
  const m = document.querySelector("p.more"); if (m) { if (PC.shown >= PC.colList.length) m.remove(); else m.querySelector("button").textContent = `Show more (${PC.colList.length - PC.shown} left)`; }
}
function pcHome(all) {
  PC.tierF = null;
  const byCol = {}; for (const c of all) (byCol[c.col] = byCol[c.col] || []).push(c);
  const seen = new Set(), featured = [];
  for (const c of all.slice().sort((a, b) => b.ovr - a.ovr || b.season - a.season)) { if (seen.has(c.pid)) continue; seen.add(c.pid); featured.push(c); if (featured.length === 4) break; }
  pcSetList(featured, "home");
  let h = `<h2>Cards</h2><p class="m">Every season hands out cards. Each one carries the player's ratings as that season began; collection cards add a boost, and the overall sets the rarity. Every player also has a base card for every season on his player page.</p>`;
  h += `<h3>Rarest cards ever</h3><div class="cgrid feat">${featured.map((c, i) => pcTile(c, i, `${c.season}`, "home")).join("")}</div>`;
  h += `<h3>Rarity</h3><div class="ladder">${CC.TIERS.map((t, i) => { const nx = CC.TIERS[i + 1]; const n = all.filter(c => c.tier.key === t.key).length; return `<div class="rung t-${t.key}"><span class="gem t-${t.key}"></span><b>${t.name}</b><small>${t.min}${nx ? "–" + (nx.min - 1) : "+"}</small><small class="m">${n} cards</small></div>`; }).join("")}</div>`;
  const my = MY.load(), owned = Object.keys(my.owned).length;
  // what's next on the real calendar
  const now = new Date(), yr = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1, today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const next = CC.holidaysOf(yr).concat(CC.holidaysOf(yr + 1)).filter(([t, k]) => t >= today && byCol[CC.COLLECTIONS.find(c => c.hol === k) ? CC.COLLECTIONS.find(c => c.hol === k).key : ""]).sort((a, b) => a[0] - b[0])[0];
  if (next) {
    const HC = CC.COLLECTIONS.find(c => c.hol === next[1]), list = byCol[HC.key] || [], top = list.slice().sort((a, b) => b.ovr - a.ovr)[0], days = Math.round((next[0] - today) / 864e5);
    h = h.replace(`<h3>Rarest cards ever</h3>`, `<a class="holi" href="#cards-${HC.key}"><span class="mini">${CART.front(top)}</span><div><small>${days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`} · ${new Date(next[0]).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })}</small><b>${esc(HC.name)}</b><p>${list.length} cards from every ${esc(HC.name.toLowerCase().includes("day") ? HC.name : HC.name + " game")} in league history. Best: ${esc(top.name)} ${top.season} (${top.ovr}).</p></div></a><h3>Rarest cards ever</h3>`);
  }
  h = h.replace(`<h3>Rarest cards ever</h3>`, `<div class="packcta"><a class="btn" href="#cards-packs">Open packs</a><a class="btn ghost" href="#cards-mine">My collection · ${owned}/${all.length}</a></div><h3>Rarest cards ever</h3>`);
  for (const [grp, title] of Object.entries(CC.GROUP_NAMES)) {
    h += `<h3>${title}</h3><div class="colgrid">`;
    for (const C of CC.COLLECTIONS.filter(c => c.group === grp)) {
      const list = byCol[C.key] || []; const best = list.slice().sort((a, b) => b.ovr - a.ovr)[0];
      const have = list.filter(c => my.owned[pcKey(c)]).length;
      h += `<a class="colt" href="#cards-${C.key}">${best ? `<span class="mini">${CART.front(best)}</span>` : `<span class="mini empty"></span>`}<div><b>${esc(C.name)}</b><small>${list.length} card${list.length === 1 ? "" : "s"}${best ? ` · best ${esc(best.name)} ${best.season} (${best.ovr})` : ""}</small><p>${esc(C.blurb)}</p>${have ? `<i class="prog"><em style="width:${(have / list.length * 100).toFixed(1)}%"></em></i><small>You own ${have} of ${list.length}</small>` : ""}</div></a>`;
    }
    h += `</div>`;
  }
  return h;
}

// ---------- my collection (kept in this browser only) ----------
const pcKey = c => c.col + ":" + c.season + ":" + c.pid;
const MY = {
  k: "ubl-cards-v1", d: null,
  load() { if (this.d) return this.d; try { this.d = JSON.parse(localStorage.getItem(this.k)); } catch (e) { this.d = null; } if (!this.d || !this.d.owned) this.d = { owned: {}, packs: 0, cards: 0 }; return this.d; },
  save() { try { localStorage.setItem(this.k, JSON.stringify(this.d)); } catch (e) { /* storage blocked: keep it for this visit */ } },
  add(c) { const d = this.load(), k = pcKey(c), isNew = !d.owned[k]; d.owned[k] = (d.owned[k] || 0) + 1; d.cards++; return isNew; },
  reset() { this.d = { owned: {}, packs: 0, cards: 0 }; this.save(); }
};

// ---------- packs ----------
// Each slot rolls a rarity tier first (weights below), then a card from that tier, so the odds
// stay the same no matter how many cards a tier holds.
const TIER_W = { rubber: 30, bronze: 26, silver: 22, gold: 18, emerald: 12, sapphire: 8, ruby: 4.5, amethyst: 2.5, diamond: 1.2, opal: 0.45, vulcan: 0.15 };
function pcPackList(all) {
  const seasons = [...new Set(all.map(c => c.season))].sort((a, b) => a - b), decades = [...new Set(seasons.map(y => Math.floor(y / 10) * 10))];
  const P = [
    { key: "standard", name: "Standard Pack", sub: "Any collection, any era", c1: "#2563c9", c2: "#13285a", icon: "base", n: 5 },
    { key: "premium", name: "Premium Pack", sub: "Last card Ruby or better", c1: "#b3122b", c2: "#3a0e4f", icon: "mvp", n: 5, guarantee: 81 },
    { key: "leaders", name: "Leaders Pack", sub: "Season leaders only", c1: "#0f8a57", c2: "#06341f", icon: "posterized", n: 5, groups: ["leaders"] },
    { key: "feats", name: "Moments Pack", sub: "Moments, feats, playoffs", c1: "#d9480f", c2: "#3b0d02", icon: "moments", n: 4, groups: ["feats"] },
    { key: "holiday", name: "Holiday Pack", sub: "Holidays, Dunktober, Game 7", c1: "#147a45", c2: "#7a0f1f", icon: "christmas", n: 4, groups: ["holidays"] },
    { key: "legends", name: "Legends Pack", sub: "Legacies & awards · Amethyst+ last", c1: "#7a2bff", c2: "#140632", icon: "immortals", n: 4, groups: ["legacy", "awards"], guarantee: 84 },
    { key: "oddballs", name: "Oddballs Pack", sub: "Built different & eras", c1: "#c99a06", c2: "#3a2a00", icon: "rapsheet", n: 4, groups: ["odd", "eras", "rising"] }
  ];
  for (const d of decades) P.push({ key: "era" + d, name: `${d}s Pack`, sub: `${Math.max(d, seasons[0])}–${Math.min(d + 9, seasons[seasons.length - 1])} only`, c1: ["#8a6a3e", "#2b8a8a", "#c2410c", "#be185d", "#4338ca", "#0f766e", "#334155", "#9333ea"][(d / 10) % 8], c2: "#120d08", icon: d < 1962 ? "founders" : "ageless", n: 5, from: d, to: d + 9 });
  return P;
}
function pcPool(all, pk) { return all.filter(c => (!pk.groups || pk.groups.includes((CC.CBY[c.col] || {}).group)) && (!pk.from || (c.season >= pk.from && c.season <= pk.to))); }
function pcDraw(pool, minOvr) {
  const byT = {}; for (const c of pool) if (!minOvr || c.ovr >= minOvr) (byT[c.tier.key] = byT[c.tier.key] || []).push(c);
  const tiers = Object.keys(byT); if (!tiers.length) return pool[Math.floor(Math.random() * pool.length)];
  let r = Math.random() * tiers.reduce((s, t) => s + TIER_W[t], 0), t = tiers[0];
  for (const x of tiers) { r -= TIER_W[x]; if (r <= 0) { t = x; break; } }
  return byT[t][Math.floor(Math.random() * byT[t].length)];
}
function pcPacks(all) {
  const my = MY.load(), P = pcPackList(all); PC.packs = P;
  const odds = (() => { const tot = Object.values(TIER_W).reduce((a, b) => a + b, 0); return CC.TIERS.slice().reverse().map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${(TIER_W[t.key] / tot * 100).toFixed(TIER_W[t.key] / tot < 0.01 ? 2 : 1)}%</b></span>`).join(""); })();
  let h = `<p><a href="#cards">← All collections</a></p><div class="vh"><h2>Packs</h2><a class="btn ghost" href="#cards-mine">My collection →</a></div>`;
  h += `<p class="m">Free packs, as many as you like. Every card you pull goes into your collection on this device. ${my.packs ? `You've opened ${my.packs} pack${my.packs === 1 ? "" : "s"} and own ${Object.keys(my.owned).length} of ${all.length} cards.` : ""}</p>`;
  h += `<div class="packs">${P.map((pk, i) => `<button class="packt" onclick="pcOpenPack(${i})"><span class="pk">${CART.packSVG(pk, pk.key)}</span><b>${esc(pk.name)}</b><small>${esc(pk.sub)} · ${pcPool(all, pk).length} cards</small></button>`).join("")}</div>`;
  h += `<h3>Odds per card</h3><div class="chips">${odds}</div><p class="m small">Packs with a guarantee roll the last card only from cards at or above that overall.</p>`;
  return h;
}
async function pcOpenPack(i) {
  const all = pcAll(await pcIndex()), pk = PC.packs[i], pool = pcPool(all, pk);
  const cards = []; for (let k = 0; k < pk.n; k++) cards.push(pcDraw(pool, k === pk.n - 1 && pk.guarantee ? pk.guarantee : 0));
  cards.sort((a, b) => a.ovr - b.ovr); // best card last, like a real pack
  const my = MY.load(); my.packs++;
  const news = cards.map(c => MY.add(c)); MY.save();
  PC.pull = cards; pcSetList(cards, "pull");
  let m = $("packmodal");
  if (!m) { m = document.createElement("div"); m.id = "packmodal"; m.className = "cmodal packm"; document.body.appendChild(m); }
  m.innerHTML = `<div class="cm-box"><button class="cm-x" onclick="pcClosePack()" aria-label="Close">✕</button>
    <div class="tearwrap" id="tearwrap" onclick="pcTear()"><div class="tear">${CART.packSVG(pk, pk.key)}</div><p class="m">Tap the pack to open it</p></div>
    <div class="pull" id="pull" hidden>${cards.map((c, k) => `<div class="pslot t-${c.tier.key}${c.ovr >= 81 ? " rare" : ""}${c.ovr >= 90 ? " ultra" : ""}" style="--d:${k * 0.12}s"><div class="fcard tilt pflip" onclick="pcReveal(this, ${k})"><div class="fc-in"><div class="fc-f">${CART.mystery()}</div><div class="fc-b">${CART.front(c)}</div></div><div class="glare"></div></div>${news[k] ? `<span class="newb">NEW</span>` : ""}<span class="ctl pl">${esc(c.tier.name)} · ${esc((CC.CBY[c.col] || {}).name || "")}</span></div>`).join("")}</div>
    <div class="pullbar" id="pullbar" hidden><button onclick="pcRevealAll()">Reveal all</button><button onclick="pcOpenPack(${i})">Open another</button><a class="btn ghost" href="#cards-mine" onclick="pcClosePack()">My collection</a></div></div>`;
  m.hidden = false; document.body.classList.add("noscroll");
}
function pcTear() { const w = $("tearwrap"); if (!w || w.classList.contains("go")) return; w.classList.add("go"); setTimeout(() => { w.hidden = true; $("pull").hidden = false; $("pullbar").hidden = false; }, 520); }
function pcReveal(el, k) {
  if (!el.classList.contains("flip")) { el.classList.add("flip"); el.closest(".pslot").classList.add("shown"); return; }
  pcOpen(k, "pull");
}
function pcRevealAll() { document.querySelectorAll("#pull .pflip").forEach((el, k) => setTimeout(() => { el.classList.add("flip"); el.closest(".pslot").classList.add("shown"); }, k * 260)); }
function pcClosePack() { const m = $("packmodal"); if (m) { m.hidden = true; m.innerHTML = ""; } document.body.classList.remove("noscroll"); if (location.hash.startsWith("#cards")) route(); }

function pcMine(all) {
  const my = MY.load(), byCol = {}; for (const c of all) (byCol[c.col] = byCol[c.col] || []).push(c);
  const mine = all.filter(c => my.owned[pcKey(c)]).sort((a, b) => b.ovr - a.ovr);
  let h = `<p><a href="#cards">← All collections</a></p><div class="vh"><h2>My collection</h2><a class="btn" href="#cards-packs">Open packs</a></div>`;
  if (!mine.length) return h + `<p class="m">Nothing yet. Open a pack and your cards land here. Your collection is saved in this browser only.</p>`;
  const pct = mine.length / all.length * 100;
  h += `<div class="kv"><div><b>${mine.length}</b><span>Unique cards</span></div><div><b>${my.cards}</b><span>Cards pulled</span></div><div><b>${my.packs}</b><span>Packs opened</span></div><div><b>${pct.toFixed(1)}%</b><span>Of every card</span></div></div>`;
  const byTier = {}; for (const c of mine) byTier[c.tier.key] = (byTier[c.tier.key] || 0) + 1;
  h += `<div class="chips">${CC.TIERS.slice().reverse().filter(t => byTier[t.key]).map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${byTier[t.key]}</b></span>`).join("")}</div>`;
  const best = mine.slice(0, 8); pcSetList(best, "mine");
  h += `<h3>Best pulls</h3><div class="cgrid">${best.map((c, i) => pcTile(c, i, `${c.season}`, "mine")).join("")}</div>`;
  h += `<h3>Sets</h3><div class="sets">`;
  for (const [grp, title] of Object.entries(CC.GROUP_NAMES)) {
    h += `<div class="setg"><b>${title}</b>`;
    for (const C of CC.COLLECTIONS.filter(c => c.group === grp)) {
      const list = byCol[C.key] || [], have = list.filter(c => my.owned[pcKey(c)]).length; if (!list.length) continue;
      h += `<a class="setr${have === list.length ? " done" : ""}" href="#cards-${C.key}" onclick="PC.ownF='own'"><span>${esc(C.name)}</span><i class="prog"><em style="width:${(have / list.length * 100).toFixed(1)}%"></em></i><small>${have}/${list.length}</small></a>`;
    }
    h += `</div>`;
  }
  h += `</div><p class="m small">Saved in this browser only. <button class="linkbtn" onclick="if(this.dataset.sure){MY.reset();route()}else{this.dataset.sure=1;this.textContent='Tap again to erase your collection'}">Reset my collection</button></p>`;
  return h;
}

// ---------- 3D tilt + glare on the big cards ----------
(function () {
  const set = (el, x, y) => { el.style.setProperty("--ry", ((x - 0.5) * 18).toFixed(1) + "deg"); el.style.setProperty("--rx", ((0.5 - y) * 18).toFixed(1) + "deg"); el.style.setProperty("--px", ((x - 0.5) * 2).toFixed(2)); el.style.setProperty("--py", ((y - 0.5) * 2).toFixed(2)); el.style.setProperty("--gx", (x * 100).toFixed(0) + "%"); el.style.setProperty("--gy", (y * 100).toFixed(0) + "%"); };
  document.addEventListener("pointermove", e => {
    const el = e.target.closest && e.target.closest(".fcard.tilt"); if (!el) return;
    const r = el.getBoundingClientRect(); set(el, Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))); el.classList.add("tilting");
  }, { passive: true });
  const off = e => { const el = e.target.closest && e.target.closest(".fcard.tilt"); if (el && !(e.relatedTarget && el.contains(e.relatedTarget))) { el.classList.remove("tilting"); set(el, 0.5, 0.5); } };
  document.addEventListener("pointerout", off, { passive: true }); document.addEventListener("pointercancel", off, { passive: true });
  const st = document.createElement("style");
  st.textContent = `#cmodal{z-index:60}
.fcard.tilt{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .25s ease-out;touch-action:pan-y;position:relative}
.fcard.tilt.tilting{transition:transform .06s linear}
.fcard .glare{position:absolute;inset:0;border-radius:7%;pointer-events:none;background:radial-gradient(circle at var(--gx,50%) var(--gy,30%),rgba(255,255,255,.42),rgba(255,255,255,0) 48%);mix-blend-mode:overlay;opacity:0;transition:opacity .25s}
.fcard.tilting .glare{opacity:1}
.packcta{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 2px}
.prog{display:block;height:5px;border-radius:3px;background:#232a35;margin-top:5px;overflow:hidden}.prog em{display:block;height:100%;background:linear-gradient(90deg,var(--gold),#35eaa3)}
.ctile.own:after{content:"";position:absolute;inset:0 0 18px;border-radius:9%;box-shadow:0 0 0 2px #35eaa3;pointer-events:none}
.ctile .owned{position:absolute;top:6px;right:6px;background:#35eaa3;color:#062b1b;font:700 10px Inter,sans-serif;border-radius:999px;padding:2px 6px;box-shadow:0 2px 6px rgba(0,0,0,.5)}
.packs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin:10px 0}
@media(max-width:420px){.packs{grid-template-columns:1fr 1fr}}
.packt{background:none;border:0;padding:0;display:flex;flex-direction:column;gap:3px;color:var(--ink);text-align:left;cursor:pointer}
.packt .pk{display:block;filter:drop-shadow(0 8px 14px rgba(0,0,0,.5));transition:transform .2s}.packt:hover .pk{transform:translateY(-4px) rotate(-1.5deg)}
.packt b{font:700 14px Oswald,sans-serif;letter-spacing:.4px}.packt small{color:var(--mut);font-size:11px}
.packm .cm-box{max-width:900px}
.tearwrap{display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:-20px;cursor:pointer}
.tear{width:min(62vw,280px);animation:pkwobble 1.6s ease-in-out infinite;filter:drop-shadow(0 16px 30px rgba(0,0,0,.6))}
@keyframes pkwobble{0%,100%{transform:rotate(-2deg) scale(1)}50%{transform:rotate(2deg) scale(1.03)}}
.tearwrap.go .tear{animation:pktear .5s ease-in forwards}
@keyframes pktear{0%{transform:scale(1)}40%{transform:scale(1.12) rotate(-4deg);filter:brightness(1.6) drop-shadow(0 0 40px #fff)}100%{transform:scale(.3) translateY(-60px);opacity:0}}
.pull[hidden],.pullbar[hidden],.tearwrap[hidden]{display:none!important}
.pull{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-top:6px}
@media(max-width:420px){.pull{grid-template-columns:1fr 1fr}}
.pslot{position:relative;display:flex;flex-direction:column;gap:4px;animation:pkdeal .45s ease-out both;animation-delay:var(--d)}
@keyframes pkdeal{from{transform:translateY(40px) scale(.8);opacity:0}to{transform:none;opacity:1}}
.pslot:before{content:"";position:absolute;inset:6% 4% 14%;border-radius:12%;background:var(--t2);filter:blur(16px);opacity:0;transition:opacity .4s}
.pslot.rare:before{opacity:.55;animation:pkglow 1.2s ease-in-out infinite alternate}.pslot.ultra:before{opacity:.8;filter:blur(22px)}
.pslot.shown:before{opacity:.35;animation:none}
@keyframes pkglow{from{transform:scale(.96)}to{transform:scale(1.06)}}
.pslot .fcard{width:100%}
.pslot .pl{opacity:0;transition:opacity .3s}.pslot.shown .pl{opacity:1}
.newb{position:absolute;top:-6px;left:-4px;z-index:3;background:#ff3fa4;color:#fff;font:700 10px Inter,sans-serif;padding:2px 7px;border-radius:999px;opacity:0;transition:opacity .3s;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.pslot.shown .newb{opacity:1}
.pullbar{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:16px 0}
.sets{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
.setg{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.setg>b{font:700 13px Oswald,sans-serif;letter-spacing:1px;text-transform:uppercase}
.setr{display:grid;grid-template-columns:1fr 80px 54px;gap:8px;align-items:center;font-size:12.5px;color:var(--ink)}
.setr .prog{margin:0}
.boostline{font-size:12.5px}
.holi{display:flex;gap:12px;align-items:center;margin:10px 0;padding:10px;border-radius:12px;background:linear-gradient(120deg,#3a0f1f,#0f3a24);border:1px solid #5a4a1a;color:var(--ink)}
.holi .mini{width:84px;flex:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.5))}.holi small{color:#ffd166;font-weight:700;font-size:11px;letter-spacing:.6px;text-transform:uppercase}
.holi b{display:block;font:700 20px Oswald,sans-serif}.holi p{margin:4px 0 0;font-size:12.5px;color:#d6dbe3}
.box.cmp th{white-space:nowrap;font-size:11px}.box.cmp td{font-size:12.5px}.box.cmp sup.up{font-size:8.5px}.setr small{color:var(--mut);text-align:right}.setr.done span{color:#35eaa3;font-weight:700}
@media (prefers-reduced-motion:reduce){.tear,.pslot,.pslot:before{animation:none!important}}`;
  document.head.appendChild(st);
})();
