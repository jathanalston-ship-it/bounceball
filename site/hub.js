// ===================== LEAGUE HUB: reads data/ and renders the league's record =====================
"use strict";
const BASE = window.DATA_BASE || "../data/";
const D = { lg: null, pl: null, idx: null, seasons: {} };
async function J(p) { if (window.INLINE && p in window.INLINE) return window.INLINE[p]; const r = await fetch(BASE + p); if (!r.ok) throw new Error("missing " + p); return r.json(); }
async function season(y) { return D.seasons[y] || (D.seasons[y] = await J("seasons/" + y + ".json")); }
const AW = { mvp: "MVP", dpoy: "Defensive Player of the Year", roy: "Rookie of the Year", sniper: "Sniper Award (most fours)", fmvp: "Finals MVP" };
const AWS = { mvp: "MVP", dpoy: "DPOY", roy: "ROY", sniper: "Sniper", fmvp: "Finals MVP", champ: "Champion" };
const tname = id => TB[id] ? TB[id].city + " " + TB[id].name : id;
const chip = id => `<span class="chip" style="--c:${TB[id] ? TB[id].c1 : "#888"};--c2:${TB[id] ? TB[id].c2 : "#333"}"></span>`;
const tlink = (id, short) => `<a href="#team-${id}">${chip(id)}${esc(short ? TB[id].name : tname(id))}</a>`;
const pname = id => D.pl[id] ? D.pl[id].name : "#" + id;
const plink = id => `<a href="#player-${id}">${esc(pname(id))}</a>`;
const money = n => n >= 1e6 ? "$" + (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + "M" : "$" + Math.round(n / 1000) + "k";
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
  for (const k of ["mvp", "fmvp", "dpoy", "roy", "sniper"]) if (S.awards[k] !== null && S.awards[k] !== undefined) h += `<div><span class="m">${AW[k]}</span>${plink(S.awards[k])}</div>`;
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
  const roster = Object.values(D.pl).filter(p => p.team === id).sort((a, b) => b.ovr - a.ovr);
  h += `<h3>Current roster (${D.lg.nextSeason})</h3><div class="tw"><table class="box"><thead><tr><th class="pn">Player</th><th>Pos</th><th>Age</th><th>OVR</th><th>Contract</th></tr></thead><tbody>`;
  for (const p of roster) h += `<tr><td class="pn"><span class="num">${p.num}</span>${plink(p.id)}${p.injury ? ` <span class="inj">${esc(p.injury.name)}</span>` : ""}</td><td>${BB.ROLES[p.role].name}</td><td>${D.lg.nextSeason - p.born}</td><td class="b">${p.ovr}</td><td>${p.contract ? money(p.contract.salary) + " thru " + p.contract.thru : "–"}</td></tr>`;
  h += `</tbody></table></div><h3>Season by season</h3><div class="tw"><table class="box"><thead><tr><th>Season</th><th>W-L</th><th>Finish</th><th>Playoffs</th></tr></thead><tbody>`;
  for (const s of tm.hist.slice().reverse()) h += `<tr class="${s.res === "Champion" ? "po" : ""}"><td><a href="#standings-${s.season}">${s.season}</a></td><td>${s.w}-${s.l}</td><td>${s.rank}</td><td>${s.res === "-" ? "missed" : s.res.startsWith("R") ? "round " + s.res.slice(1) : s.res}</td></tr>`;
  return h + `</tbody></table></div>`;
}
async function vPlayer(id) {
  const p = D.pl[id]; if (!p) return `<p>Unknown player.</p>`;
  const reg = (D.idx.regular[id] || []), keys = D.idx.keys;
  const L = r => Object.fromEntries(keys.map((k, i) => [k, r[i]]));
  let h = `<h2>${esc(p.name)} ${p.hof ? `<span class="tag gen">Hall of Fame ${p.hof}</span>` : ""}</h2>`;
  h += `<p class="m">${BB.ROLES[p.role].name} · ${Math.floor(p.ht / 12)}'${p.ht % 12}" ${p.wt} lb · born ${p.born}${p.draft ? ` · drafted ${p.draft.season} round ${p.draft.round}, pick ${p.draft.pick} by ${tname(p.draft.team)}` : " · original league player"}${p.retired ? ` · retired ${p.retired}` : p.team ? ` · ${tname(p.team)}` : " · free agent"}</p>`;
  if (p.awards.length) {
    const c = {}; for (const [y, a] of p.awards) (c[a] = c[a] || []).push(y);
    h += `<div class="aw">` + Object.entries(c).map(([a, ys]) => `<div><span class="m">${AWS[a]}${ys.length > 1 ? " ×" + ys.length : ""}</span>${ys.join(", ")}</div>`).join("") + `</div>`;
  }
  if (p.r) h += `<details class="rat"><summary>Ratings (OVR ${p.ovr})</summary><div class="bars">${BB.RKEYS.map(k => `<div class="rb"><span>${BB.RLABEL[k]}</span><b style="--v:${p.r[k]}%">${p.r[k]}</b></div>`).join("")}</div></details>`;
  h += `<h3>Regular season</h3><div class="tw"><table class="box"><thead><tr><th>Year</th><th>Team</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG%</th><th>3P</th><th>4P</th><th>TKL</th><th>BLK</th><th>STL</th></tr></thead><tbody>`;
  const tot = {};
  for (const r of reg) {
    const s = L(r); if (!s.gp) continue; for (const k of keys.slice(2)) tot[k] = (tot[k] || 0) + s[k];
    h += `<tr><td><a href="#leaders-${s.season}">${s.season}</a></td><td>${s.team}</td><td>${s.gp}</td><td>${(s.min / 60 / s.gp).toFixed(1)}</td><td class="b">${(s.pts / s.gp).toFixed(1)}</td><td>${((s.oreb + s.dreb) / s.gp).toFixed(1)}</td><td>${(s.ast / s.gp).toFixed(1)}</td><td>${pct(s.fgm, s.fga)}</td><td>${s.tpm}-${s.tpa}</td><td>${s.fpm}-${s.fpa}</td><td>${s.tkl}</td><td>${s.blk}</td><td>${s.stl}</td></tr>`;
  }
  if (tot.gp) h += `<tr class="tot"><td>Career</td><td></td><td>${tot.gp}</td><td>${(tot.min / 60 / tot.gp).toFixed(1)}</td><td>${(tot.pts / tot.gp).toFixed(1)}</td><td>${((tot.oreb + tot.dreb) / tot.gp).toFixed(1)}</td><td>${(tot.ast / tot.gp).toFixed(1)}</td><td>${pct(tot.fgm, tot.fga)}</td><td>${tot.tpm}-${tot.tpa}</td><td>${tot.fpm}-${tot.fpa}</td><td>${tot.tkl}</td><td>${tot.blk}</td><td>${tot.stl}</td></tr>`;
  h += `</tbody></table></div><p class="m small">Career totals: ${tot.pts || 0} points, ${tot.tkl || 0} tackles, ${tot.fpm || 0} fours.</p>`;
  return h;
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
    }
    return t.type;
  };
  const pre = S.tx.filter(t => t.day < 0), mid = S.tx.filter(t => t.day >= 0);
  const filt = new URLSearchParams("").get("x");
  let h = `<div class="vh"><h2>${y} transactions</h2>${seasonPicker(y, "moves")}</div>`;
  const grp = (title, list, types) => { const l = list.filter(t => types.includes(t.type)); return l.length ? `<h4>${title} (${l.length})</h4><ul class="tx">${l.map(t => `<li>${fmt(t)}</li>`).join("")}</ul>` : ""; };
  h += `<h3>Offseason before ${y}</h3>` + grp("Expansion & merger", pre, ["expansion", "merger"]) + grp("Draft", pre, ["draft"]) + grp("Trades", pre, ["trade"]) + grp("Free agency", pre, ["sign", "resign"]) + grp("Retirements", pre, ["retire"]) + grp("Waived", pre, ["waive"]);
  h += `<h3>During the season</h3>` + (grp("Trade deadline", mid, ["trade"]) + grp("Signings", mid, ["sign"]) || `<p class="m">Quiet year.</p>`);
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
  for (const g of rows.slice(0, 400)) {
    const [gid, day, hm, aw, , hs, as, per, type] = g;
    h += `<li><a href="#watch-${y}-${gid}"><span class="m">${type ? "Playoffs" : "Day " + (day + 1)}</span><span>${chip(aw)}${TB[aw].name} <b class="${as > hs ? "w" : ""}">${as}</b></span><span>@ ${chip(hm)}${TB[hm].name} <b class="${hs > as ? "w" : ""}">${hs}</b>${per > 4 ? ` <span class="m">${per === 5 ? "OT" : (per - 4) + "OT"}</span>` : ""}</span></a></li>`;
  }
  return h + `</ul>`;
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
  if (v !== "watch") { $("broadcast").hidden = true; V.playing = false; }
  const y = a && /^\d{4}$/.test(a) ? +a : lastSeason();
  let html;
  try {
    html = v === "standings" ? await vStandings(y) : v === "leaders" ? await vLeaders(y) : v === "history" ? await vHistory()
      : v === "hof" ? await vHof() : v === "teams" ? await vTeams() : v === "team" ? await vTeam(a) : v === "player" ? await vPlayer(a)
      : v === "moves" ? await vMoves(y) : v === "games" ? await vGames(y, b) : v === "watch" ? await vWatch(y, b) : await vStandings(lastSeason());
  } catch (e) { html = `<p class="bad">Couldn't load that: ${esc(e.message)}</p>`; }
  $("view").innerHTML = html;
  if (v !== "watch") window.scrollTo(0, 0);
}
async function boot() {
  try {
    [D.lg, D.pl, D.idx] = await Promise.all([J("league.json"), J("players.json"), J("index/player-seasons.json")]);
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
