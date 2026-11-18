// ===================== LEAGUE HUB: reads data/ and renders the league's record =====================
"use strict";
const BASE = window.DATA_BASE || "../data/";
const D = { lg: null, pl: null, idx: null, staff: { coaches: {}, owners: {} }, seasons: {} };
async function J(p) { if (window.INLINE && p in window.INLINE) return window.INLINE[p]; const r = await fetch(BASE + p); if (!r.ok) throw new Error("missing " + p); return r.json(); }
async function season(y) { return D.seasons[y] || (D.seasons[y] = await J("seasons/" + y + ".json")); }
const AW = { mvp: "MVP", dpoy: "Defensive Player of the Year", roy: "Rookie of the Year", sniper: "Sniper Award (most fours)", fmvp: "Finals MVP", coy: "Coach of the Year" };
const AWS = { mvp: "MVP", dpoy: "DPOY", roy: "ROY", sniper: "Sniper", fmvp: "Finals MVP", champ: "Champion" };
const tname = id => TB[id] ? TB[id].city + " " + TB[id].name : id;
const chip = id => `<span class="chip" style="--c:${TB[id] ? TB[id].c1 : "#888"};--c2:${TB[id] ? TB[id].c2 : "#333"}"></span>`;
const tlink = (id, short) => `<a href="#team-${id}">${chip(id)}${esc(short ? TB[id].name : tname(id))}</a>`;
const pname = id => D.pl[id] ? D.pl[id].name : "#" + id;
const plink = id => `<a href="#player-${id}">${esc(pname(id))}</a>`;
const cname = id => D.staff.coaches[id] ? D.staff.coaches[id].name : "Coach #" + id;
const clink = id => `<a href="#coach-${id}">${esc(cname(id))}</a>`;
const oname = id => D.staff.owners[id] ? D.staff.owners[id].name : "Owner #" + id;
const money = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M" : n >= 10000 ? "$" + Math.round(n / 1000) + "k" : "$" + Math.round(n).toLocaleString();
const pct = (a, b) => b ? (a / b * 100).toFixed(1) : "–";
const lastSeason = () => D.lg.seasons[D.lg.seasons.length - 1];
function statObj(S, arr) { const o = { team: arr[0] }; S.statKeys.forEach((k, i) => o[k] = arr[i + 1]); return o; }

function seasonPicker(cur, view) {
  return `<select class="sp" onchange="location.hash='${view}-'+this.value">${D.lg.seasons.slice().reverse().map(y => `<option ${y == cur ? "selected" : ""}>${y}</option>`).join("")}</select>`;
}
function roundName(r, total) { const k = total - r; return k === 0 ? "Finals" : k === 1 ? "Semifinals" : "Quarterfinals"; }

// ---------- views ----------
async function vStandings(y) {
  const S = await season(y), st = S.standings;
  const order = S.teams.slice().sort((a, b) => (st[b][0] / (st[b][0] + st[b][1])) - (st[a][0] / (st[a][0] + st[a][1])) || (st[b][2] - st[b][3]) - (st[a][2] - st[a][3]));
  const lead = st[order[0]], seeds = S.playoffs.seeds;
  let h = `<div class="vh"><h2>${y} standings</h2>${seasonPicker(y, "standings")}</div>`;
  h += `<p class="m">${S.teams.length} teams · 82 games · cap ${money(S.cap)} · champion ${tlink(S.awards.champion)}</p>`;
  h += `<div class="tw"><table class="box"><thead><tr><th>#</th><th class="pn">Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>PF</th><th>PA</th><th>DIFF</th></tr></thead><tbody>`;
  order.forEach((t, i) => {
    const s = st[t], gp = s[0] + s[1], gb = ((lead[0] - s[0]) + (s[1] - lead[1])) / 2;
    h += `<tr class="${seeds.includes(t) ? "po" : ""}"><td>${i + 1}</td><td class="pn">${tlink(t)}</td><td class="b">${s[0]}</td><td>${s[1]}</td><td>${(s[0] / gp).toFixed(3).replace(/^0/, "")}</td><td>${gb ? gb.toFixed(1) : "–"}</td><td>${(s[2] / gp).toFixed(1)}</td><td>${(s[3] / gp).toFixed(1)}</td><td>${s[2] - s[3] > 0 ? "+" : ""}${((s[2] - s[3]) / gp).toFixed(1)}</td></tr>`;
  });
  h += `</tbody></table></div><p class="m small">Highlighted teams made the playoffs.</p><h3>Playoffs</h3>`;
  const rounds = Math.max(...S.playoffs.series.map(s => s.round));
  for (let r = 1; r <= rounds; r++) {
    h += `<h4>${roundName(r, rounds)}</h4><div class="series">`;
    for (const s of S.playoffs.series.filter(x => x.round === r)) {
      const w = s.winner, l = w === s.hi ? s.lo : s.hi, ws = Math.max(...s.wins), ls = Math.min(...s.wins);
      h += `<div class="sr">${tlink(w)} <b>${ws}–${ls}</b> <span class="m">over</span> ${tlink(l, true)}</div>`;
    }
    h += `</div>`;
  }
  h += awardsBlock(S);
  return h;
}
function awardsBlock(S) {
  let h = `<h3>Awards</h3><div class="aw">`;
  for (const k of ["mvp", "fmvp", "dpoy", "roy", "sniper", "coy"]) if (S.awards[k] !== null && S.awards[k] !== undefined) h += `<div><span class="m">${AW[k]}</span>${k === "coy" ? clink(S.awards[k]) : plink(S.awards[k])}</div>`;
  return h + `</div>`;
}
async function vLeaders(y) {
  const S = await season(y);
  const rows = Object.entries(S.stats).map(([id, a]) => Object.assign({ id: +id }, statObj(S, a)));
  const maxgp = Math.max(...rows.map(r => r.gp)), q = rows.filter(r => r.gp >= maxgp * 0.6);
  const cats = [
    ["Points", r => r.pts / r.gp, 1], ["Rebounds", r => (r.oreb + r.dreb) / r.gp, 1], ["Assists", r => r.ast / r.gp, 1],
    ["Fours made", r => r.fpm, 0], ["Threes made", r => r.tpm, 0], ["Tackles (turnovers forced)", r => r.tkl / r.gp, 2],
    ["Blocks & swats", r => r.blk / r.gp, 2], ["Steals", r => r.stl / r.gp, 2], ["Broken tackles", r => r.btk / r.gp, 2],
    ...(S.statKeys.includes("dnk") ? [["Dunks", r => r.dnk, 0]] : []),
    ["FG% (300+ att)", r => r.fga >= 300 ? r.fgm / r.fga * 100 : -1, 1], ["Four % (100+ att)", r => r.fpa >= 100 ? r.fpm / r.fpa * 100 : -1, 1], ["Minutes", r => r.min / 60 / r.gp, 1]
  ];
  let h = `<div class="vh"><h2>${y} leaders</h2>${seasonPicker(y, "leaders")}</div><p class="m small">Per game unless noted. Minimum 60% of games played.</p><div class="lgrid">`;
  for (const [name, f, d] of cats) {
    const top = q.map(r => [r, f(r)]).filter(x => x[1] >= 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    h += `<div class="lcard"><h4>${name}</h4><ol>${top.map(([r, v]) => `<li>${plink(r.id)} <span class="m">${TB[r.team] ? TB[r.team].id : ""}</span><b>${v.toFixed(d)}</b></li>`).join("")}</ol></div>`;
  }
  return h + `</div>`;
}
async function vHistory() {
  const ch = D.lg.champions.slice().reverse();
  const titles = {}; for (const c of D.lg.champions) titles[c.champ] = (titles[c.champ] || 0) + 1;
  const tmax = Math.max(...Object.values(titles));
  let h = `<h2>League history</h2><p class="m">${D.lg.seasons.length} seasons on the record (${D.lg.seasons[0]}–${lastSeason()}), seed <code>${esc(D.lg.seed)}</code>, engine ${esc(D.lg.engineVersion)}.</p>`;
  h += `<h3>Championships</h3><div class="bars2">` + Object.entries(titles).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<div>${tlink(t, true)}<i style="--w:${n / tmax * 100}%;--c:${TB[t].c1}"></i><b>${n}</b></div>`).join("") + `</div>`;
  h += `<h3>Every final</h3><div class="tw"><table class="box"><thead><tr><th>Season</th><th class="pn">Champion</th><th class="pn">Runner-up</th><th class="pn">Finals MVP</th><th class="pn">MVP</th></tr></thead><tbody>`;
  for (const c of ch) h += `<tr><td><a href="#standings-${c.season}">${c.season}</a></td><td class="pn">${tlink(c.champ)}</td><td class="pn">${tlink(c.runnerUp, true)}</td><td class="pn">${c.fmvp ? plink(c.fmvp) : "–"}</td><td class="pn">${c.mvp ? plink(c.mvp) : "–"}</td></tr>`;
  return h + `</tbody></table></div>`;
}
async function vHof() {
  let h = `<h2>Hall of Fame</h2><p class="m">Players become eligible three years after retiring. Induction goes by career production, peak and hardware: roughly the top 2% of careers.</p>`;
  const cls = D.lg.hof.slice().reverse();
  if (!cls.length) h += `<p>No one has been inducted yet.</p>`;
  for (const c of cls) h += `<div class="hofc"><b>${c.season}</b>${c.inductees.map(x => plink(x.id)).join(" · ")}</div>`;
  return h;
}
async function vTeams() {
  let h = `<h2>Teams</h2><div class="tgrid">`;
  for (const t of BB.TEAMS) {
    const tm = D.lg.teams[t.id]; if (!tm) continue;
    const last = tm.hist[tm.hist.length - 1];
    h += `<a class="tcard" href="#team-${t.id}" style="--c:${t.c1};--c2:${t.c2}"><span class="sw"></span><div><b>${esc(t.city)} ${esc(t.name)}</b><small>since ${tm.joined || t.joined} · ${tm.titles} title${tm.titles === 1 ? "" : "s"}${last ? ` · ${last.w}-${last.l} in ${last.season}` : ""}</small></div></a>`;
  }
  return h + `</div>`;
}
async function vTeam(id) {
  const t = TB[id], tm = D.lg.teams[id];
  let h = `<div class="thead" style="--c:${t.c1};--c2:${t.c2}"><span class="sw big"></span><div><h2>${esc(t.city)} ${esc(t.name)}</h2><p class="m">${esc(t.arena)} · joined ${t.joined} (${t.how}) · ${tm.titles} championship${tm.titles === 1 ? "" : "s"} · payroll ${money(tm.payroll)}</p></div></div>`;
  if (tm.coach || tm.owner) {
    const c = D.staff.coaches[tm.coach], o = D.staff.owners[tm.owner];
    h += `<div class="aw">${c ? `<div><span class="m">Head coach${c.ex ? " (former player)" : ""}</span>${clink(c.id)} <span class="m">${c.w}-${c.l} career${c.phil ? " · " + philLine(c) : ""}</span></div>` : ""}${o ? `<div><span class="m">Owner${o.how === "heir" ? " (inherited)" : o.how === "purchase" ? " (bought the team)" : ""}</span>${esc(o.name)} <span class="m">${esc(o.biz || "")}</span></div>` : ""}</div>`;
    if (tm.coachHist && tm.coachHist.length > 1) h += `<p class="m small">Coaching history: ${tm.coachHist.slice().reverse().map(x => `${clink(x.cid)} (${x.from}–${x.to || "now"}${x.why ? ", " + x.why : ""})`).join(" · ")}</p>`;
    if (tm.ownerHist && tm.ownerHist.length > 1) h += `<p class="m small">Ownership: ${tm.ownerHist.map(x => `${esc(oname(x.oid))} (${x.from}, ${x.how})`).join(" → ")}</p>`;
  }
  const last = tm.hist[tm.hist.length - 1];
  if (last) { try { h += identityHTML(id, await season(last.season)); } catch (e) { /* older data has no identity numbers */ } }
  const roster = Object.values(D.pl).filter(p => p.team === id).sort((a, b) => b.ovr - a.ovr);
  h += `<h3>Current roster (${D.lg.nextSeason})</h3><div class="tw"><table class="box"><thead><tr><th class="pn">Player</th><th>Pos</th><th>Type</th><th>Age</th><th>OVR</th><th>Contract</th></tr></thead><tbody>`;
  for (const p of roster) { const ar = p.r && BB.archetype ? BB.archetype(p, D.lg.nextSeason) : null; h += `<tr><td class="pn"><span class="num">${p.num}</span>${plink(p.id)}${p.injury ? ` <span class="inj">${esc(p.injury.name)}</span>` : ""}</td><td>${BB.ROLES[p.role].name}</td><td class="m small">${ar ? ar.offName + " / " + ar.defName : ""}</td><td>${D.lg.nextSeason - p.born}</td><td><span class="ovrc t-${BB.CARDS.tierFor(p.ovr).key}">${p.ovr}</span></td><td>${p.contract ? money(p.contract.salary) + " thru " + p.contract.thru : "–"}</td></tr>`; }
  h += `</tbody></table></div><h3>Season by season</h3><div class="tw"><table class="box"><thead><tr><th>Season</th><th>W-L</th><th>Finish</th><th>Playoffs</th></tr></thead><tbody>`;
  for (const s of tm.hist.slice().reverse()) h += `<tr class="${s.res === "Champion" ? "po" : ""}"><td><a href="#standings-${s.season}">${s.season}</a></td><td>${s.w}-${s.l}</td><td>${s.rank}</td><td>${s.res === "-" ? "missed" : s.res.startsWith("R") ? "round " + s.res.slice(1) : s.res}</td></tr>`;
  return h + `</tbody></table></div>`;
}
async function vPlayer(id, tab) { return vPlayerScreen(id, tab); }
// ---- team identity: how a team played over a season, ranked against the league ----
const ID_STATS = [
  ["pace", "Possessions", s => s.poss / s.g, "fast", "slow"],
  ["pnr", "Pick-and-rolls", s => s.pnr / s.g, "pick-and-roll heavy", ""],
  ["post", "Post-ups", s => s.post / s.g, "lives in the post", "never posts up"],
  ["iso", "Isolations", s => s.iso / s.g, "isolation-heavy", ""],
  ["offscr", "Off-screen actions", s => s.offscr / s.g, "runs shooters off screens", ""],
  ["sets", "Set plays called", s => s.sets / s.g, "a deep playbook", "freelances"],
  ["hunt", "Mismatches hunted", s => s.hunt / s.g, "hunts mismatches", ""],
  ["fpa", "Four-point attempts", s => s.fpa / s.g, "fires from four", "stays inside the four line"],
  ["tkA", "Tackle attempts", s => s.tkA / s.g, "hits everything that moves", "rarely tackles"],
  ["take", "Takeaways by tackle", s => (s.tkDown + s.tkFum) / s.g, "turns hits into turnovers", ""],
  ["big", "Big-hit share", s => s.hitBig / Math.max(1, s.tkA) * 100, "goes for the knockout shot", "wraps up"],
  ["miss", "Broken and missed tackles", s => s.tkBroke / s.g, "", "sure tacklers"],
  ["flag", "Flagrants (season)", s => s.flag, "plays dirty", ""]];
function identityHTML(id, sd) {
  if (!sd || !sd.style || !sd.style[id] || !sd.style[id].g) return "";
  const teams = Object.keys(sd.style).filter(t => sd.style[t].g), n = teams.length;
  const rank = (f, t) => 1 + teams.filter(u => f(sd.style[u]) > f(sd.style[t])).length;
  const me = sd.style[id], tags = [];
  const cells = ID_STATS.map(([k, label, f, hi, lo]) => {
    const r = rank(f, id), v = f(me);
    if (hi && r <= 3) tags.push(hi); else if (lo && r > n - 3) tags.push(lo);
    return `<div><b>${k === "big" ? v.toFixed(0) + "%" : k === "flag" ? v : v.toFixed(1)}</b><span>${label}</span><small>${r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : r + "th"} of ${n}</small></div>`;
  });
  const cov = Object.keys(BB.COVERS).map(k => [k, me["cov_" + k] || 0]).sort((a, b) => b[1] - a[1]), ct = cov.reduce((a, x) => a + x[1], 0);
  const covS = ct ? cov.filter(x => x[1] / ct >= 0.08).map(([k, v]) => `${BB.COVERS[k].name} ${Math.round(v / ct * 100)}%`).join(" · ") : "";
  return `<h3>Identity (${sd.season})</h3>${tags.length ? `<p class="idtags">${tags.slice(0, 5).map(t => `<span>${esc(t)}</span>`).join("")}</p>` : ""}<div class="kv idkv">${cells.join("")}</div>${covS ? `<p class="m small">Pick-and-roll coverage: ${covS}</p>` : ""}`;
}
async function vMoves(y) {
  const S = await season(y);
  const fmt = t => {
    switch (t.type) {
      case "trade": return `${tlink(t.teams[1], true)} get ${t.toB.map(plink).join(", ")} from ${tlink(t.teams[0], true)} for ${t.toS.map(plink).concat(t.picks.map(k => `${k[0]} ${k[1] === 1 ? "1st" : "2nd"}-round pick`)).join(", ") || "nothing"}`;
      case "draft": return `${tlink(t.team, true)} draft ${plink(t.pid)} (round ${t.round}, pick ${t.pick})`;
      case "sign": return `${tlink(t.team, true)} sign ${plink(t.pid)}${t.how === "free agent" ? ` · ${money(t.salary)}/yr for ${t.years}` : t.how === "hardship" ? " (injury hardship)" : " (minimum deal)"}`;
      case "resign": return `${tlink(t.team, true)} re-sign ${plink(t.pid)} · ${money(t.salary)}/yr`;
      case "retire": return `${plink(t.pid)} retires (${TB[t.team].name})`;
      case "waive": return `${tlink(t.team, true)} waive ${plink(t.pid)}${t.dead ? ` · ${money(t.dead)} dead money` : ""}`;
      case "expansion": return `${tlink(t.team, true)} take ${plink(t.pid)} from ${TB[t.from].name} in the expansion draft`;
      case "merger": return `${tlink(t.team)} join from the WBA with their roster`;
      case "coach-hire": return `${tlink(t.team, true)} hire ${clink(t.cid)}${t.why === "interim" ? " as interim coach" : ""}`;
      case "coach-fired": return `${tlink(t.team, true)} fire coach ${clink(t.cid)}`;
      case "coach-retired": return `${tlink(t.team, true)} coach ${clink(t.cid)} retires`;
      case "owner-change": return `${tlink(t.team, true)}: ${esc(oname(t.from))} ${t.how === "heir" ? "hands the team to " + esc(oname(t.to)) : t.how === "forced sale" ? "is forced to sell to " + esc(oname(t.to)) : "sells the team to " + esc(oname(t.to))}`;
    }
    return t.type;
  };
  const pre = S.tx.filter(t => t.day < 0), mid = S.tx.filter(t => t.day >= 0);
  const filt = new URLSearchParams("").get("x");
  let h = `<div class="vh"><h2>${y} transactions</h2>${seasonPicker(y, "moves")}</div>`;
  const grp = (title, list, types) => { const l = list.filter(t => types.includes(t.type)); return l.length ? `<h4>${title} (${l.length})</h4><ul class="tx">${l.map(t => `<li>${fmt(t)}</li>`).join("")}</ul>` : ""; };
  h += `<h3>Offseason before ${y}</h3>` + grp("Front offices", pre, ["coach-hire", "coach-fired", "coach-retired", "owner-change"]) + grp("Expansion & merger", pre, ["expansion", "merger"]) + grp("Draft", pre, ["draft"]) + grp("Trades", pre, ["trade"]) + grp("Free agency", pre, ["sign", "resign"]) + grp("Retirements", pre, ["retire"]) + grp("Waived", pre, ["waive"]);
  h += `<h3>During the season</h3>` + (grp("Trade deadline", mid, ["trade"]) + grp("Coaching changes", mid, ["coach-hire", "coach-fired"]) + grp("Signings & releases", mid, ["sign", "waive"]) || `<p class="m">Quiet year.</p>`);
  h += `<h4>Injuries (${S.injuries.length})</h4><ul class="tx">${S.injuries.filter(i => i[4] >= 10).map(i => `<li>${plink(i[1])} (${TB[i[2]].name}): ${esc(i[3])}, out ${i[4] >= 82 ? "for the season" : i[4] + " games"}</li>`).join("")}</ul><p class="m small">Showing injuries of 10+ games. Tackles cause most of them.</p>`;
  return h;
}
async function vGames(y, team) {
  const S = await season(y);
  team = team || "";
  let h = `<div class="vh"><h2>${y} games</h2>${seasonPicker(y, "games")}</div>`;
  h += `<select class="sp" onchange="location.hash='games-${y}'+(this.value?'-'+this.value:'')"><option value="">All teams</option>${S.teams.map(t => `<option value="${t}" ${t === team ? "selected" : ""}>${tname(t)}</option>`).join("")}</select>`;
  h += `<p class="m small">Every game is stored as a seed plus the two lineups. Tap one to replay it through the engine exactly as it happened.</p><ul class="games">`;
  const rows = S.games.filter(g => !team || g[2] === team || g[3] === team).slice().reverse();
  let lastDay = null;
  for (const g of rows.slice(0, 400)) {
    const [gid, day, hm, aw, , hs, as, per, type] = g;
    const dk = type + ":" + day;
    if (dk !== lastDay) { lastDay = dk; const n = S.games.filter(x => x[1] === day && x[8] === type).length; h += `<li class="dayh"><span>${type ? "Playoffs, day " + (day + 1) : "Day " + (day + 1)}</span>${n > 1 && !team ? `<a href="#tv-${y}-${type}-${day}">📺 Watch ${Math.min(3, n)} at once</a>` : ""}</li>`; }
    h += `<li><a href="#watch-${y}-${gid}"><span class="m">${type ? "Playoffs" : "Day " + (day + 1)}</span><span>${chip(aw)}${TB[aw].name} <b class="${as > hs ? "w" : ""}">${as}</b></span><span>@ ${chip(hm)}${TB[hm].name} <b class="${hs > as ? "w" : ""}">${hs}</b>${per > 4 ? ` <span class="m">${per === 5 ? "OT" : (per - 4) + "OT"}</span>` : ""}</span></a></li>`;
  }
  return h + `</ul>`;
}
async function vTv(y, type, day) {
  const S = await season(y);
  // the three best matchups of the day air together
  const st = S.standings, q = t => st[t][0] / Math.max(1, st[t][0] + st[t][1]);
  const rows = S.games.filter(g => g[1] === +day && g[8] === +type).sort((a, b) => (q(b[2]) + q(b[3])) - (q(a[2]) + q(a[3]))).slice(0, 3);
  $("broadcast").hidden = false;
  loadChannels(rows, S);
  return `<p><a href="#games-${y}">← ${y} games</a> · <span class="m">Three games on one clock. Tap a channel, or swipe the court, to flip between them.</span></p>`;
}
async function vBlotter(y) {
  const S = await season(y);
  const who = e => e.who === "player" ? plink(e.id) : e.who === "coach" ? "Coach " + clink(e.id) : "Owner " + esc(oname(e.id));
  const list = (S.blotter || []).slice().reverse();
  let h = `<div class="vh"><h2>${y} police blotter</h2>${seasonPicker(y, "blotter")}</div><p class="m small">Fines, suspensions and bad luck. Suspended players can't play until they've served their games.</p><ul class="tx blot">`;
  for (const e of list) h += `<li>${chip(e.team)}${who(e)} ${esc(e.text)}${e.kind === "luck" ? ` <span class="k luck">out ${e.games} games</span>` : e.games ? ` <span class="k ${e.kind}">${e.games}-game suspension</span>` : ""}${e.fine ? ` <span class="k">${money(e.fine)} fine</span>` : ""}${e.released ? ` <span class="k arrest">released</span>` : ""}</li>`;
  return h + (list.length ? "" : "<li>A quiet year. Suspiciously quiet.</li>") + `</ul>`;
}
// a coach's philosophy: what he runs, and how he coaches
function philLine(c) {
  const ph = c && c.phil; if (!ph) return "";
  return `${BB.SYSTEMS[ph.sys].name} · ${BB.SCHEMES[ph.scheme].name} · ${BB.HITS[ph.hit].name}${ph.cov && BB.COVERS[ph.cov] ? " · " + BB.COVERS[ph.cov].name : ""}`;
}
function philHTML(c) {
  const ph = c.phil; if (!ph) return "";
  const S = BB.SYSTEMS[ph.sys], Dd = BB.SCHEMES[ph.scheme], H = BB.HITS[ph.hit];
  const m = (label, v, lo, hi) => `<span>${label}: <b>${v < 0.35 ? lo : v > 0.65 ? hi : "in between"}</b><i class="meter"><i style="--v:${Math.round(v * 100)}%"></i></i></span>`;
  const Cv = ph.cov && BB.COVERS[ph.cov];
  return `<h3>Philosophy</h3><div class="phil"><span>Offense <b>${S.name}</b></span><span>Defense <b>${Dd.name}</b></span><span>Tackling <b>${H.name}</b></span>${Cv ? `<span>Ball screens <b>${Cv.name}</b></span>` : ""}</div>
    <p class="m small">${S.blurb[0].toUpperCase() + S.blurb.slice(1)}. ${Dd.blurb[0].toUpperCase() + Dd.blurb.slice(1)}. ${H.blurb[0].toUpperCase() + H.blurb.slice(1)}.${Cv ? ` On the pick-and-roll: ${Cv.blurb}.` : ""} This is what he believes in; on game night he builds a plan from it, his roster and the opponent.</p>
    <div class="phil">${m("Adaptability", ph.adapt, "runs his system no matter what", "game-plans every opponent")}${m("Discipline", ph.disc, "lets players freelance", "players stick to the plan")}${m("Late game", ph.late, "shaky with the clock", "clock-and-score master")}${m("Star usage", ph.star, "spreads it around", "feeds his star")}</div>`;
}
async function vCoaches() {
  const cs = Object.values(D.staff.coaches).filter(c => c.w + c.l > 0).sort((a, b) => b.w - a.w);
  let h = `<h2>Coaches</h2><p class="m">Every coach has a philosophy: the offense he believes in, the defense he teaches and when his players are allowed to hit. Before each game he builds a gameplan from it, his roster and the opponent, picks the starting five and rotation that fit, and adjusts at timeouts and halftime. Adaptable coaches bend their system to fit; stubborn ones don't. Coaches also decide how fast young players develop, and owners hire and fire them.</p>`;
  h += `<div class="tw"><table class="box"><thead><tr><th class="pn">Coach</th><th>Team</th><th class="pn">Plays</th><th>W-L</th><th>PCT</th><th>Titles</th><th>COY</th><th>Playoffs</th></tr></thead><tbody>`;
  for (const c of cs.slice(0, 150)) h += `<tr><td class="pn">${clink(c.id)}${c.ex ? ' <span class="m">ex-player</span>' : ""}</td><td>${c.team ? TB[c.team].id : c.retired ? "retired" : "–"}</td><td class="pn m small">${philLine(c)}</td><td>${c.w}-${c.l}</td><td>${(c.w / (c.w + c.l)).toFixed(3).replace(/^0/, "")}</td><td class="b">${c.titles || ""}</td><td>${c.awards.filter(a => a[1] === "coy").length || ""}</td><td>${c.pw}-${c.pl}</td></tr>`;
  return h + `</tbody></table></div>`;
}
async function vCoach(id) {
  const c = D.staff.coaches[id]; if (!c) return `<p>Unknown coach.</p>`;
  const st = c.style, styl = [st.pace > 0.3 ? "runs" : st.pace < -0.3 ? "grinds it out" : "balanced pace", st.tackle > 1.15 ? "loves the big hit" : st.tackle < 0.85 ? "rarely sends tacklers" : "picks his tackles", st.four > 1.15 ? "fires away from four" : st.four < 0.85 ? "distrusts the four" : "takes fours in rhythm", st.sw > 0.6 ? "switches screens" : "fights over screens", st.depth + "-man rotation"];
  let h = `<h2>${esc(c.name)}</h2><p class="m">Born ${c.born}${c.ex ? ` · played as ${plink(c.ex)}` : ""}${c.team ? ` · coaching ${tname(c.team)}` : c.retired ? ` · retired ${c.retired}` : ""}</p>`;
  h += `<div class="aw"><div><span class="m">Record</span>${c.w}-${c.l} (${c.pw}-${c.pl} playoffs)</div><div><span class="m">Titles</span>${c.titles}</div><div><span class="m">Style</span>${styl.join(", ")}</div><div><span class="m">Offense / defense / development</span>${c.off} / ${c.def} / ${c.dev}</div></div>`;
  h += philHTML(c);
  h += `<h3>Seasons</h3><div class="tw"><table class="box"><thead><tr><th>Season</th><th>Team</th><th>W-L</th></tr></thead><tbody>${(c.seasons || []).slice().reverse().map(s => `<tr><td><a href="#standings-${s.season}">${s.season}</a></td><td>${s.team}</td><td>${s.w}-${s.l}${s.partial ? " (fired mid-season)" : ""}</td></tr>`).join("")}</tbody></table></div>`;
  return h;
}
async function vWatch(y, gid) {
  const S = await season(y);
  const row = S.games.find(g => g[0] === +gid);
  $("broadcast").hidden = false;
  loadGame(row, S);
  return `<p><a href="#games-${y}">← ${y} games</a></p>`;
}

// ---------- router ----------
async function route() {
  const hsh = (location.hash || "").slice(1) || "standings-" + lastSeason();
  const [v, a, b] = hsh.split("-");
  document.querySelectorAll("nav.main a").forEach(x => x.classList.toggle("on", x.dataset.v === v));
  if (v !== "watch" && v !== "tv") { $("broadcast").hidden = true; stopBroadcast(); }
  const y = a && /^\d{4}$/.test(a) ? +a : lastSeason();
  let html;
  try {
    html = v === "standings" ? await vStandings(y) : v === "leaders" ? await vLeaders(y) : v === "history" ? await vHistory()
      : v === "hof" ? await vHof() : v === "teams" ? await vTeams() : v === "team" ? await vTeam(a) : v === "player" ? await vPlayer(a, b) : v === "cards" ? await vCards(a, b)
      : v === "moves" ? await vMoves(y) : v === "games" ? await vGames(y, b) : v === "watch" ? await vWatch(y, b) : v === "tv" ? await vTv(y, b, hsh.split("-")[3])
      : v === "blotter" ? await vBlotter(y) : v === "coaches" ? await vCoaches() : v === "coach" ? await vCoach(a) : await vStandings(lastSeason());
  } catch (e) { html = `<p class="bad">Couldn't load that: ${esc(e.message)}</p>`; }
  $("view").innerHTML = html;
  window.scrollTo(0, 0);
}
async function boot() {
  try {
    [D.lg, D.pl, D.idx] = await Promise.all([J("league.json"), J("players.json"), J("index/player-seasons.json")]);
    try { D.staff = await J("staff.json"); } catch (e) { /* older data without staff */ }
  } catch (e) {
    $("view").innerHTML = `<h2>No history yet</h2><p>Run the <b>Simulate league history</b> workflow from the repo's Actions tab, then reload.</p>`;
    return;
  }
  $("sub").textContent = `${D.lg.seasons.length} seasons on the record · ${D.lg.seasons[0]}–${lastSeason()}`;
  initBroadcast();
  window.addEventListener("hashchange", route);
  route();
}
boot();
