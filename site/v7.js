// ===================== VIEWER (league v0.7): headlines, the record book, league events, front offices, the books =====================
// Loaded before hub.js; uses hub.js helpers (esc, plink, tlink, clink, money, season, J, D...) at call time.
"use strict";
const V7 = {};
// ---------- headlines: {p:id} {t:team} {c:coach} {g:gm} {o:owner} tokens become links ----------
function nx(text) {
  return esc(text || "").replace(/\{([ptcgo]):([A-Za-z0-9]+)\}/g, (m, k, v) => k === "p" ? plink(+v) : k === "t" ? (TB[v] ? tlink(v, true) : esc(v)) : k === "c" ? clink(+v) : k === "g" ? gmlink(+v) : esc(oname(+v)));
}
const gname = id => D.staff.gms && D.staff.gms[id] ? D.staff.gms[id].name : "GM #" + id;
const gmlink = id => `<a href="#gm-${id}">${esc(gname(id))}</a>`;
const GMSTYLE = { "win-now": ["Win-now", "trades the future for this season"], rebuilder: ["Rebuilder", "sells veterans for youth and picks"], gambler: ["Gambler", "swings big and often"], loyalist: ["Loyalist", "keeps his own, rarely trades"], "old-school": ["Old-school", "size, toughness and hitters"], analytics: ["Analytics", "shooting, efficiency and a sharp scouting eye"] };
const NEWS_ICON = { trade: "🔁", demand: "📣", holdout: "✋", feud: "💢", superteam: "⭐", signing: "✍️", record: "📈", milestone: "🎯", pace: "🔥", champion: "🏆", award: "🏅", dunk: "🛫", allstar: "🌟", union: "✊", cba: "📜", tv: "📺", sale: "💼", move: "🚚", arena: "🏟️", threat: "⚠️", expansion: "🆕", gm: "🗂️", coach: "📋", hof: "🏛️", retire: "👋", cliff: "📉", draft: "🎓", injury: "🩹" };
// ---------- franchises move: show the city, abbreviation and arena they had in a given season ----------
const ORIG = {};
function identity(S) {
  if (!D.lg) return;
  for (const t of BB.TEAMS) if (!ORIG[t.id]) ORIG[t.id] = { city: t.city, arena: t.arena, abbr: t.id };
  for (const id in ORIG) {
    if (!TB[id]) continue;
    const ti = S && S.teamInfo && S.teamInfo[id], L = D.lg.teams && D.lg.teams[id];
    Object.assign(TB[id], ti ? { city: ti.city, abbr: ti.abbr, arena: ti.arena } : L && L.city ? { city: L.city, abbr: L.abbr || id, arena: L.arena } : ORIG[id]);
  }
  for (const t of BB.ALLSTAR || []) if (!TB[t.id]) TB[t.id] = Object.assign({}, t);
  if (S && S.allstar && S.allstar.host && TB[S.allstar.host]) for (const t of BB.ALLSTAR || []) TB[t.id].arena = TB[S.allstar.host].arena;
}
const abbr = id => TB[id] ? TB[id].abbr || id : id;
// money: the books are kept in multiples of each season's cap
function capOf(y) { return BB.capFor ? BB.capFor(y) : 0; }
function installCaps() { if (BB.setCapAdj && D.lg && D.lg.biz && D.lg.biz.capMult) { const cm = D.lg.biz.capMult, ys = Object.keys(cm).map(Number).sort((a, b) => a - b); BB.setCapAdj(y => cm[y] !== undefined ? cm[y] : ys.length ? cm[ys[ys.length - 1]] : 1); } }
const dollars = (u, y) => { const n = u * capOf(y); return Math.abs(n) >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : money(n); };

// ---------- the ticker ----------
function tickerHTML(items) {
  if (!items.length) return "";
  const row = items.map(n => `<span><i>${NEWS_ICON[n.k] || "•"}</i>${nx(n.text)}</span>`).join("");
  return `<div class="tk"><b>UBL WIRE</b><div class="tkm"><div class="tkr">${row}${row}</div></div></div>`;
}
async function fillTicker() {
  const el = document.getElementById("ticker"); if (!el) return;
  try {
    const y = lastSeason(), S = await season(y), pick = ["champion", "award", "superteam", "move", "tv", "cba", "record", "demand", "feud", "holdout", "trade", "sale", "dunk", "allstar", "hof", "draft", "union", "expansion", "arena"];
    const items = (D.lg.offNews || []).concat((S.news || []).slice().reverse()).filter(n => pick.includes(n.k)).slice(0, 18);
    el.innerHTML = tickerHTML(items); el.hidden = !items.length;
  } catch (e) { el.hidden = true; }
}
function seasonNav(y, on) {
  const v = [["standings", "Standings"], ["news", "Headlines"], ["awards", "Awards night"], ["allstar", "All-Star"], ["draft", "Draft"], ["moves", "Moves"], ["blotter", "Blotter"], ["games", "Games"]];
  return `<nav class="snav">${v.map(([k, n]) => `<a href="#${k}-${y}" class="${k === on ? "on" : ""}">${n}</a>`).join("")}</nav>`;
}

// ---------- headlines ----------
async function vNews(y) {
  const S = await season(y); identity(S);
  const list = (S.news || []).slice(), kinds = [...new Set(list.map(n => n.k))];
  let h = `<div class="vh"><h2>${y} headlines</h2>${seasonPicker(y, "news")}</div>${seasonNav(y, "news")}`;
  if (!list.length) return h + `<p class="m">No headlines kept for this season (older data).</p>`;
  h += `<p class="chips">${kinds.map(k => `<button class="chipb" onclick="V7.filt(this,'${k}')">${NEWS_ICON[k] || "•"} ${esc(k)}</button>`).join("")}</p><ul class="news">`;
  let lastD = null;
  for (const n of list) {
    const d = n.day < 0 ? "Offseason" : `Day ${n.day + 1}`;
    if (d !== lastD) { lastD = d; h += `<li class="dayh"><span>${d}</span></li>`; }
    h += `<li data-k="${n.k}"><i>${NEWS_ICON[n.k] || "•"}</i>${nx(n.text)}</li>`;
  }
  return h + `</ul>`;
}
V7.filt = (b, k) => { b.classList.toggle("on"); const on = [...document.querySelectorAll(".chipb.on")].map(x => x.textContent.split(" ").pop()); document.querySelectorAll("ul.news li[data-k]").forEach(li => li.hidden = on.length && !on.includes(li.dataset.k)); };

// ---------- awards night ----------
const AWN = { mvp: "Most Valuable Player", dpoy: "Defensive Player of the Year", roy: "Rookie of the Year", smoy: "Sixth Man of the Year", mip: "Most Improved Player" };
async function vAwards(y) {
  const S = await season(y), A = S.awards || {}; identity(S);
  let h = `<div class="vh"><h2>${y} awards night</h2>${seasonPicker(y, "awards")}</div>${seasonNav(y, "awards")}`;
  h += `<div class="aw">${[["fmvp", "Finals MVP", plink], ["sniper", "Sniper Award (most fours)", plink], ["coy", "Coach of the Year", clink], ["eoy", "Executive of the Year", gmlink], ["asmvp", "All-Star MVP", plink]].filter(([k]) => A[k] !== null && A[k] !== undefined).map(([k, n, f]) => `<div><span class="m">${n}</span>${f(A[k])}</div>`).join("")}</div>`;
  if (!A.votes) return h + awardsBlock(S);
  h += `<p class="m small">A panel of 100 writers and broadcasters votes. Ballots run five deep (10-7-5-3-1 points); voters weigh the numbers, winning and a good story differently.</p><div class="votes">`;
  for (const k of ["mvp", "dpoy", "roy", "smoy", "mip"]) {
    const v = A.votes[k] || []; if (!v.length) continue;
    h += `<div class="vote"><h4>${AWN[k]}</h4><table class="box"><thead><tr><th class="pn">Player</th><th>Pts</th><th>1st</th></tr></thead><tbody>${v.slice(0, 6).map(([id, pts, f], i) => `<tr class="${i === 0 ? "po" : ""}"><td class="pn">${plink(id)} <span class="m">${S.players[id] ? abbr((S.stats[id] || [])[0]) : ""}</span></td><td>${pts}</td><td>${f || ""}</td></tr>`).join("")}</tbody></table></div>`;
  }
  h += `</div>`;
  if (A.allLeague) {
    h += `<h3>All-UBL teams</h3><div class="tw"><table class="box"><thead><tr><th></th>${BB.ROLE_LIST.map(r => `<th class="pn">${BB.ROLES[r].name}</th>`).join("")}</tr></thead><tbody>`;
    A.allLeague.forEach((tm, i) => { h += `<tr><td>${["1st", "2nd", "3rd"][i]}</td>${tm.map(id => `<td class="pn">${id ? plink(id) : "–"}</td>`).join("")}</tr>`; });
    h += `</tbody></table></div>`;
  }
  if (A.allDef) h += `<h3>All-Defense</h3>${A.allDef.map((tm, i) => `<p><b>${i ? "2nd" : "1st"} team:</b> ${tm.map(plink).join(" · ")}</p>`).join("")}`;
  return h;
}

// ---------- All-Star weekend ----------
async function vAllStar(y) {
  const S = await season(y); identity(S);
  const A = S.allstar;
  let h = `<div class="vh"><h2>${y} All-Star weekend</h2>${seasonPicker(y, "allstar")}</div>${seasonNav(y, "allstar")}`;
  if (!A) return h + `<p class="m">No All-Star weekend on record for ${y} (older data).</p>`;
  h += `<p class="m">Hosted by ${tlink(A.host)} at ${esc(TB[A.host].arena || "")}. East plays West under full Bounceball rules: the hits are real, and so are the injuries.</p>`;
  if (A.game) {
    const G = A.game, eh = G.home === "ASE", es = eh ? G.hs : G.as, ws = eh ? G.as : G.hs;
    h += `<div class="asg"><div class="sc"><span>East</span><b class="${es > ws ? "w" : ""}">${es}</b><span>West</span><b class="${ws > es ? "w" : ""}">${ws}</b></div><a class="btn" href="#watch-${y}-${G.gid}">▶ Watch the All-Star game</a>${G.mvp ? `<span>MVP ${plink(G.mvp)}</span>` : ""}</div>`;
  }
  const votes = {}; for (const side of ["east", "west"]) for (const [id, v] of A.votes[side] || []) votes[id] = v;
  h += `<div class="asr">`;
  for (const side of ["east", "west"]) {
    const sd = A.sides[side], co = A.coaches && A.coaches[side];
    h += `<div><h3>${side === "east" ? "East" : "West"}</h3>${co ? `<p class="m small">Coach ${clink(co)}</p>` : ""}<h4>Starters (fan vote)</h4><ul class="tx">${sd.starters.map(id => `<li>${plink(id)} <span class="m">${abbr((S.stats[id] || [])[0])}${votes[id] ? " · " + votes[id].toLocaleString() + " votes" : ""}</span></li>`).join("")}</ul><h4>Reserves (coaches)</h4><ul class="tx">${sd.reserves.map(id => `<li>${plink(id)} <span class="m">${abbr((S.stats[id] || [])[0])}</span></li>`).join("")}</ul></div>`;
  }
  h += `</div>`;
  const K = S.dunk;
  if (K) {
    h += `<h3>The dunk contest</h3><p class="m">Five judges, 6 to 10 each; three tries per dunk. ${K.winner ? `Winner: ${plink(K.winner)}.` : ""} ${window.Broadcast3D && window.vDunk ? `<a class="btn" href="#dunk-${y}">▶ Watch it in 3D</a>` : ""}</p>`;
    K.rounds.forEach((rd, i) => {
      h += `<h4>${i === 0 ? "First round" : i === 1 ? "Final" : "Dunk-off"}</h4><div class="tw"><table class="box dunks"><thead><tr><th class="pn">Dunker</th><th class="pn">Dunks (tries · judges)</th><th>Total</th></tr></thead><tbody>`;
      for (const r of rd.slice().sort((a, b) => b.total - a.total)) h += `<tr class="${r.pid === K.winner && i === K.rounds.length - 1 ? "po" : ""}"><td class="pn">${plink(r.pid)}</td><td class="pn">${r.dunks.map(d => `${esc(d.move)} <span class="m">(${d.tries > 1 ? d.tries + " tries · " : ""}${d.made ? d.scores.join("-") : "missed"})</span> <b>${d.total}</b>`).join("<br>")}</td><td class="b">${r.total}</td></tr>`;
      h += `</tbody></table></div>`;
    });
  }
  return h;
}

// ---------- draft night ----------
async function vDraft(y) {
  let d = null, hind = null;
  try { d = await J("drafts/" + y + ".json"); } catch (e) { /* none */ }
  try { hind = (V7.drafts = V7.drafts || await J("index/drafts.json")).drafts[y]; } catch (e) { /* not indexed */ }
  let h = `<div class="vh"><h2>${y} draft</h2>${seasonPicker(y, "draft")}</div>${seasonNav(y, "draft")}`;
  if (!d) return h + `<p class="m">No draft-night record for ${y}.</p>`;
  identity(null);
  const hp = {}; for (const r of hind || []) hp[r[1]] = r;
  if (y > lastSeason() - 4) hind = null; // too soon to judge
  const pl = (id, nm) => D.pl[id] ? plink(id) : esc(nm || "#" + id);
  h += `<p class="m">Held after the ${y} season. Every front office picks off its own board: scouts see prospects through a fog (good ones see through it), and styles pull boards apart. "Board" is the media's consensus rank${hind ? "; hindsight ranks each pick by what his career became" : ""}.</p>`;
  if (d.trades && d.trades.length) h += `<p class="m small">Trades on the night: ${d.trades.map(t => `${tlink(t.up, true)} move up to No. ${t.no} (from ${t.swap}) with ${tlink(t.down, true)}${t.fut ? ` (+ a ${t.fut[0]} ${t.fut[1] === 1 ? "1st" : "2nd"})` : ""}`).join(" · ")}</p>`;
  h += `<div class="tw"><table class="box"><thead><tr><th>Pick</th><th class="pn">Team</th><th class="pn">Player</th><th>Board</th><th>On the night</th>${hind ? "<th>Re-draft</th><th>Seasons</th><th>Peak</th><th></th>" : ""}</tr></thead><tbody>`;
  for (const k of d.picks) {
    const r = hp[k.pid];
    h += `<tr><td>${k.round === 2 ? "2-" : ""}${k.no}</td><td class="pn">${tlink(k.team, true)}${k.via ? ` <span class="m">via ${abbr(k.via)}</span>` : ""}</td><td class="pn">${pl(k.pid, k.name)} <span class="m">${BB.ROLES[(D.pl[k.pid] || k).role] ? BB.ROLES[(D.pl[k.pid] || k).role].name : ""}</span></td><td>${k.board}</td><td>${k.grade === "reach" ? '<span class="k susp">reach</span>' : k.grade === "steal" ? '<span class="k luck">steal</span>' : ""}</td>${hind ? `<td>${r ? r[3] : ""}</td><td>${r ? r[5] : ""}</td><td>${r && r[6] ? r[6] : ""}</td><td>${r && r[7] === "bust" ? '<span class="k susp">bust</span>' : r && r[7] === "steal" ? '<span class="k luck">steal</span>' : ""}</td>` : ""}</tr>`;
  }
  h += `</tbody></table></div><h3>The big board</h3><ol class="board">${d.board.map(b => `<li>${pl(b.pid, b.name)} <span class="m">${BB.ROLES[b.role].name}, ${b.age}${b.tags && b.tags.length ? " · " + b.tags.map(esc).join(", ") : ""}</span></li>`).join("")}</ol>`;
  return h;
}

// ---------- the record book ----------
const RNAME = { pts: "Points", reb: "Rebounds", ast: "Assists", stl: "Steals", blk: "Blocks", tkl: "Tackles", btk: "Broken tackles", dnk: "Dunks", fpm: "Fours", tpm: "Threes", gp: "Games" };
async function vRecords(tab, arg) {
  tab = tab || "career";
  let R; try { R = V7.rec = V7.rec || await J("index/records.json"); } catch (e) { return `<h2>Record book</h2><p class="m">The record book is built with the viewer index (scripts/build-index.js).</p>`; }
  identity(null);
  const tabs = [["career", "Career"], ["season", "Season"], ["game", "Single game"], ["adv", "Advanced"], ["ability", "All-time ability"], ["franchise", "Franchises"]];
  let h = `<h2>Record book</h2><nav class="snav">${tabs.map(([k, n]) => `<a href="#records-${k}" class="${k === tab ? "on" : ""}">${n}</a>`).join("")}</nav>`;
  const decs = [...new Set(Object.keys(R.season).filter(k => k.includes("@")).map(k => +k.split("@")[1]))].sort();
  const eraPick = view => `<select class="sp" onchange="location.hash='records-${view}'+(this.value?'-'+this.value:'')"><option value="">All time</option>${decs.map(d => `<option value="${d}" ${+arg === d ? "selected" : ""}>${d}s</option>`).join("")}</select>`;
  const card = (title, rows, f) => `<div class="lcard"><h4>${title}</h4><ol>${rows.slice(0, 10).map(f).join("")}</ol></div>`;
  if (tab === "career") {
    h += `<p class="m small">Regular season, all-time. <b>Bold</b> names are still playing.</p><div class="lgrid">`;
    for (const k of Object.keys(R.career)) h += card(k.endsWith("/g") ? RNAME[k.split("/")[0]] + " per game (300+ games)" : RNAME[k], R.career[k], ([id, v, ret]) => `<li>${ret ? plink(id) : `<b>${plink(id)}</b>`}<b>${Number.isInteger(v) ? v.toLocaleString() : v}</b></li>`);
    h += `</div>`;
  } else if (tab === "season" || tab === "game") {
    h += `<div class="vh"><p class="m small">${tab === "season" ? "Single-season totals (and per-game marks for qualified players)" : "Single-game highs, regular season"}.</p>${eraPick(tab)}</div><div class="lgrid">`;
    const src = tab === "season" ? R.season : R.game;
    for (const k of Object.keys(src).filter(k => arg ? k.endsWith("@" + arg) : !k.includes("@"))) {
      const base = k.split("@")[0], name = base.endsWith("/g") ? RNAME[base.split("/")[0]] + " per game" : RNAME[base] || base;
      h += card(name, src[k], r => tab === "season" ? `<li>${plink(r[0])} <span class="m">${r[1]}</span><b>${r[3]}</b></li>` : `<li>${plink(r[0])} <span class="m"><a href="#watch-${r[1]}-${r[2]}">${r[1]}</a></span><b>${r[3]}</b></li>`);
    }
    h += `</div>`;
  } else if (tab === "adv") {
    const AN = { ts: "True shooting %", rat: "UBL Rating (league average 15)", wv: "Win Value (wins created)", pm: "Plus/minus per game", usg: "Usage %" };
    h += `<p class="m small">Best single seasons by advanced measures (qualified players). True shooting counts every free throw and every three and four; the UBL Rating is game score per 36 minutes scaled to a league-average 15; Win Value is a player's share of his team's production, times its wins.</p><div class="lgrid">`;
    for (const k of Object.keys(R.adv)) h += card(AN[k] || k, R.adv[k], r => `<li>${plink(r[0])} <span class="m">${r[1]} ${abbr(r[2])}</span><b>${r[3]}</b></li>`);
    h += `</div>`;
  } else if (tab === "ability") {
    h += `<p class="m">Two ways to rank the greatest. <b>Against his era</b>: how far above his peers a player stood at his peak (what cards show). <b>All-time ability</b>: one scale for every era. The league gets bigger, faster and more skilled with every generation, so modern players rate higher here; old legends rate higher there.</p><div class="lgrid two">`;
    h += card("Against his era (peak overall)", R.ability.era.slice(0, 25), r => `<li>${plink(r[0])} <span class="m">${r[1]}</span><b>${r[2]}</b></li>`).replace("<ol>", '<ol class="long">');
    h += card("All-time ability (one scale)", R.ability.abs.slice(0, 25), r => `<li>${plink(r[0])} <span class="m">${r[1]}</span><b>${r[2]}</b></li>`).replace("<ol>", '<ol class="long">');
    h += `</div>`;
  } else if (tab === "franchise") {
    const ids = Object.keys(R.franchise).filter(t => TB[t] && !TB[t].allstar).sort((a, b) => tname(a) < tname(b) ? -1 : 1), t = arg && R.franchise[arg] ? arg : ids[0], F = R.franchise[t];
    h += `<select class="sp" onchange="location.hash='records-franchise-'+this.value">${ids.map(x => `<option value="${x}" ${x === t ? "selected" : ""}>${esc(tname(x))}</option>`).join("")}</select>`;
    h += `<div class="aw"><div><span class="m">Titles</span>${F.titles.length ? F.titles.join(", ") : "none"}</div><div><span class="m">Playoff years</span>${F.playoffs}</div>${F.bestSeason ? `<div><span class="m">Best season</span>${F.bestSeason[0]} (${F.bestSeason[1]}-${F.bestSeason[2]})</div>` : ""}${F.worstSeason ? `<div><span class="m">Worst season</span>${F.worstSeason[0]} (${F.worstSeason[1]}-${F.worstSeason[2]})</div>` : ""}<div><span class="m">Longest win streak</span>${F.streak.w[0]} (${F.streak.w[1]})</div><div><span class="m">Longest losing streak</span>${F.streak.l[0]} (${F.streak.l[1]})</div></div>`;
    h += `<h3>Franchise leaders</h3><div class="lgrid">`;
    for (const k of Object.keys(F.leaders)) h += card(RNAME[k], F.leaders[k], ([id, v]) => `<li>${plink(id)}<b>${v.toLocaleString()}</b></li>`);
    h += `</div><h3>Best single seasons</h3><div class="lgrid">`;
    for (const k of Object.keys(F.best)) h += card(RNAME[k], F.best[k], r => `<li>${plink(r[0])} <span class="m">${r[1]}</span><b>${r[2]}</b></li>`);
    h += `</div>`;
  }
  return h;
}

// ---------- front offices ----------
async function vGM(id) {
  const g = D.staff.gms && D.staff.gms[id]; if (!g) return `<p>Unknown GM.</p>`;
  identity(null);
  const st = GMSTYLE[g.style] || [g.style, ""];
  let h = `<h2>${esc(g.name)}</h2><p class="m">Born ${g.born}${g.ex ? ` · played as ${plink(g.ex)}` : ""}${g.team ? ` · general manager of ${tlink(g.team)}` : g.retired ? ` · retired ${g.retired}` : ""}</p>`;
  h += `<div class="aw"><div><span class="m">Style</span>${st[0]} <span class="m">${st[1]}</span></div><div><span class="m">Scouting eye</span>${g.scout >= 0.65 ? "sharp" : g.scout <= 0.35 ? "poor" : "average"}</div><div><span class="m">Trades made</span>${g.trades || 0}</div><div><span class="m">Executive of the Year</span>${(g.awards || []).filter(a => a[1] === "eoy").map(a => a[0]).join(", ") || "–"}</div></div>`;
  if (g.hist && g.hist.length) h += `<h3>Jobs</h3><div class="tw"><table class="box"><thead><tr><th class="pn">Team</th><th>Years</th><th>W-L</th><th>Titles</th><th>How it ended</th></tr></thead><tbody>${g.hist.map(x => `<tr><td class="pn">${tlink(x.team, true)}</td><td>${x.from}–${x.to}</td><td>${x.w}-${x.l}</td><td>${x.titles || ""}</td><td>${esc(x.why)}</td></tr>`).join("")}</tbody></table></div>`;
  return h;
}
// the team page: front office, the books, cities and arenas
function teamBizHTML(id, tm) {
  let h = "";
  const g = tm.gm && D.staff.gms ? D.staff.gms[tm.gm] : null;
  if (g) h += `<div class="aw"><div><span class="m">General manager</span>${gmlink(g.id)} <span class="m">${(GMSTYLE[g.style] || [g.style])[0]} · since ${g.from}</span></div></div>`;
  if (tm.gmHist && tm.gmHist.length > 1) h += `<p class="m small">Front office: ${tm.gmHist.slice().reverse().map(x => `${gmlink(x.gid)} (${x.from}–${x.to || "now"}${x.why ? ", " + x.why : ""})`).join(" · ")}</p>`;
  if (tm.cities && tm.cities.length > 1) h += `<p class="m">Franchise history: ${tm.cities.map((c, i) => `<b>${esc(BB.CITY && BB.CITY[c.city] ? BB.CITY[c.city][0] : c.city)}</b> ${c.from}${tm.cities[i + 1] ? "–" + (tm.cities[i + 1].from - 1) : "–present"}`).join(" → ")}</p>`;
  if (tm.arenas && tm.arenas.length) h += `<p class="m small">Arenas: ${tm.arenas.map(a => `${esc(a.name)} (${a.from}, ${a.cap.toLocaleString()} seats)`).join(" · ")}</p>`;
  const F = tm.fin || [];
  if (F.length) {
    const last = F[F.length - 1];
    h += `<h3>The books</h3><p class="m small">Revenue is the gate, local TV and radio, the team's share of the national TV deal and the playoffs; expenses are payroll and operations. Franchise value is a multiple of revenue. In ${last.season}: ${dollars(last.rev, last.season)} revenue, ${last.profit >= 0 ? "a profit of " + dollars(last.profit, last.season) : "a loss of " + dollars(-last.profit, last.season)}, worth about ${dollars(last.value, last.season)}.</p>`;
    h += `<div class="tw"><table class="box"><thead><tr><th>Season</th><th>Attendance</th><th>Full</th><th>Revenue</th><th>Payroll</th><th>Profit</th><th>Value</th></tr></thead><tbody>`;
    for (const r of F.slice().reverse().slice(0, 30)) h += `<tr><td>${r.season}</td><td>${Math.round(r.att / Math.max(1, r.games)).toLocaleString()}</td><td>${Math.round(r.fill * 100)}%</td><td>${dollars(r.rev, r.season)}</td><td>${dollars(r.pay, r.season)}</td><td class="${r.profit < 0 ? "bad" : ""}">${r.profit < 0 ? "−" : ""}${dollars(Math.abs(r.profit), r.season)}</td><td>${dollars(r.value, r.season)}</td></tr>`;
    h += `</tbody></table></div>`;
  }
  return h;
}
// history page: the business of the league
function leagueBizHTML() {
  const b = D.lg.biz; if (!b) return "";
  let h = `<h3>The business</h3>`;
  if (b.moves && b.moves.length) h += `<h4>Franchise moves</h4><ul class="tx">${b.moves.map(m => `<li><b>${m.season}</b> ${esc(BB.CITY && BB.CITY[m.from] ? BB.CITY[m.from][0] : m.from)} → ${esc(BB.CITY && BB.CITY[m.to] ? BB.CITY[m.to][0] : m.to)}: the ${esc(TB[m.team] ? TB[m.team].name : m.team)}</li>`).join("")}</ul>`;
  if (b.tv && b.tv.length) h += `<h4>National TV</h4><ul class="tx">${b.tv.map(t => `<li><b>${t.from}–${t.thru}</b> ${esc(t.net)} <span class="m">${Math.round(t.frac * 100)}% of league revenue${t.jump >= 1.08 ? " · the cap jumped" : t.jump < 1 ? " · a flat cap" : ""}</span></li>`).join("")}</ul>`;
  h += `<h4>Labor</h4><p class="m small">${b.union ? `The players' union was recognized in ${b.union}, an hour before an All-Star game they had threatened to boycott.` : "No union yet."} ${b.fa === "free" ? "Free agency arrived when the reserve clause fell." : "Players are still bound by the reserve clause."}</p>`;
  if (b.cba && b.cba.length) h += `<ul class="tx">${b.cba.map(c => `<li><b>${c.season}</b> threat of a ${esc(c.fight)}; ${esc(c.how)}. <span class="m">${c.terms.map(esc).join("; ")}</span></li>`).join("")}</ul>`;
  return h;
}

// ---------- moves: v0.7 transaction types ----------
function moveFmt7(t) {
  switch (t.type) {
    case "demand": return `${plink(t.pid)} demands a trade from ${tlink(t.team, true)}${t.why === "feud" ? " after a falling-out" : ""}`;
    case "holdout": return `${plink(t.pid)} holds out of ${tlink(t.team, true)} camp (making ${money(t.salary)}, wants ${money(t.ask)})`;
    case "extend": return `${tlink(t.team, true)} extend ${plink(t.pid)} · ${money(t.salary)}/yr${t.why === "holdout" ? " (ending his holdout)" : ""}`;
    case "walk": return `${plink(t.pid)} turns down ${tlink(t.team, true)} and tests free agency`;
    case "feud": return t.kind === "coach" ? `${plink(t.a)} and coach ${clink(t.c)} feud in ${tlink(t.team, true)}` : `${plink(t.a)} and ${plink(t.b)} feud in ${tlink(t.team, true)}`;
    case "skill": return `${plink(t.pid)} ${t.reinvent ? "reinvents himself: " : ""}adds ${BB.RLABEL[t.k] ? BB.RLABEL[t.k].toLowerCase() : t.k} (+${t.gain})${t.from ? ` with help from ${plink(t.from)}` : ""}`;
    case "role": return `${plink(t.pid)} moves from ${BB.ROLES[t.from].name} to ${BB.ROLES[t.to].name}`;
    case "cliff": return `${plink(t.pid)} loses a step over the summer`;
    case "gm-hire": return `${tlink(t.team, true)} hire GM ${gmlink(t.gid)}`;
    case "gm-fired": return `${tlink(t.team, true)} fire GM ${gmlink(t.gid)}`;
    case "gm-retired": return `${tlink(t.team, true)} GM ${gmlink(t.gid)} retires`;
    case "relocate": return `The ${esc(TB[t.team] ? TB[t.team].name : t.team)} move from ${esc(BB.CITY && BB.CITY[t.from] ? BB.CITY[t.from][0] : t.from)} to ${esc(BB.CITY && BB.CITY[t.to] ? BB.CITY[t.to][0] : t.to)}`;
    case "draft-trade": return `${tlink(t.up, true)} trade up to No. ${t.no} with ${tlink(t.down, true)}`;
  }
  return null;
}
Object.assign(V7, { nx, identity, installCaps, fillTicker, seasonNav, vNews, vAwards, vAllStar, vDraft, vRecords, vGM, teamBizHTML, leagueBizHTML, moveFmt7, abbr, gmlink, dollars });
