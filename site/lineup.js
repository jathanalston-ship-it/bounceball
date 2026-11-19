// ===================== THE LINEUP GAME: the viewer =====================
// Build a lineup from cards you own (three slots), then take it up a ladder of 30 historic team-seasons and
// into three weekly challenges. Each card plays on its own ratings (era-relative plus its collection boost);
// chemistry and collection sets come from src/lineup.js. Games are simulated by the real engine on the
// opponent's floor under its season's rules: watch them in the 3D broadcast, or skip to the result.
"use strict";
const LG = BB.LINEUP;
const LUV = { cur: null, pick: { f: "", q: "", n: 48 } };
const luLadder = () => LUV.ladder || (LUV.ladder = LG.ladderOf(cnCands()));
const luWeek = () => { const wk = ECO.weekKey(new Date()); if (!LUV.week || LUV.week.wk !== wk) LUV.week = { wk, list: LG.weeklyOf(wk, luLadder()) }; return LUV.week; };
const luPid = k => +k.split(":")[2];
const luCard = k => CG.byKey && CG.byKey.get(k);
// what the rules need from a card
const luRule = c => ({ key: pcKey(c), pid: c.pid, role: c.role, team: c.teamId, season: c.season, col: c.col, ovr: c.ovr, name: c.name });
function luTeamSync(s) { const T = LG.luOf(s).team; TB.MY = Object.assign(TB.MY || {}, { id: "MY", abbr: "YOU", city: T.city, name: T.name, c1: T.c1, c2: T.c2, arena: "" }); }
function luCards(s, slot) { const L = LG.cleanSlots(s); return L.sl[slot === undefined ? L.a : slot].k.map(luCard).filter(Boolean); }
async function luPrep() { const ix = await pcIndex(); if (!ix) return false; const all = pcAll(ix); await pcBaseLoad(); cgPrep(all); PC.packs = PC.packs || cgPackList(all); return true; }

// ---------- the page ----------
async function vLineup(a, b) {
  if (!window.BB || !BB.LINEUP) return `<p>The lineup game needs the league data.</p>`;
  if (!(await luPrep())) return `<h2>Lineup</h2><p>The lineup game needs the card index (scripts/build-index.js).</p>`;
  if (a === "watch") return luWatchPage();
  const s = CGSAVE.load(), L = LG.cleanSlots(s), W = luWeek(); LG.ensureWeek(s, W.wk); luTeamSync(s); CGSAVE.save();
  const cards = luCards(s), rules = cards.map(luRule), chk = LG.check(rules), ch = LG.chemistry(rules), sb = LG.setBoosts(rules), lad = luLadder();
  pcSetList(cards, "lu");
  let h = `<div class="vh"><h2>Lineup</h2><a class="btn ghost" href="#cards-mine">My collection →</a></div>
    <p class="m">Build a team from cards you own and take it up a ladder of the league's great teams. Every card plays on its own ratings: the player as he was that season, plus his card's boost. Teammates from the same team, season or era have chemistry; three cards from one collection boost the whole lineup. You play on their floor, under their season's rules.</p>`;
  h += cgWallet(s, `<span class="m">${L.w}-${L.l} · ladder ${L.best}/${lad.length}</span>`);
  // the team
  h += `<div class="luteam" style="--c:${L.team.c1};--c2:${L.team.c2}"><div class="lt"><small>${esc(L.team.city)}</small><b>${esc(L.team.name)}</b></div><button class="sm ghost" onclick="luTeamEdit()">Name & colors</button></div><div id="luteamedit"></div>`;
  h += `<div class="seg lutabs">${L.sl.map((sl, i) => `<button class="${i === L.a ? "on" : ""}" onclick="luSlot(${i})">Lineup ${sl.n} · ${sl.k.length}</button>`).join("")}</div>`;
  // the roster
  h += `<div class="lusum"><div><small>Strength</small><b>${LG.strength(rules) || "–"}</b></div><div><small>Chemistry</small><b>${cards.length ? Math.round(ch.team * 100) + "%" : "–"}</b></div><div><small>Players</small><b>${cards.length}/${LG.MAX_N}</b></div><div class="${chk.ok ? "ok" : "no"}"><small>Status</small><b>${chk.ok ? "Ready" : "Not yet"}</b></div></div>`;
  if (!chk.ok) h += `<p class="m small luprob">Needs: ${chk.problems.map(esc).join(" · ")}.</p>`;
  const byG = { g: [], w: [], b: [] }; cards.forEach((c, i) => byG[LG.GROUP[c.role] || "w"].push([c, i]));
  h += `<div class="luros">`;
  for (const g of ["g", "w", "b"]) {
    h += `<div class="lug"><b>${LG.GROUP_NAME[g][0].toUpperCase() + LG.GROUP_NAME[g].slice(1)}s <small>${byG[g].length}/${LG.NEED[g]}+</small></b><div class="cgrid">${byG[g].map(([c, i]) => `<div class="lucard">${pcTile(c, i, `${c.season} · ${Math.round(ch.per[i] * 100)}% chem`, "lu")}<button class="rm" onclick="luToggle('${pcKey(c)}')" title="Take out">✕</button></div>`).join("")}<button class="slot luadd" onclick="luPicker('${g}')"><b>+</b><small>Add a ${LG.GROUP_NAME[g]}</small></button></div></div>`;
  }
  h += `</div>`;
  if (ch.links.length || sb.lines.length) h += `<div class="lulinks">${ch.links.map(l => `<span class="tchip">${l.kind === "team" ? `${l.season} ${esc(teamName(l.team))} ×${l.n}` : `${esc(teamName(l.team))} ×${l.n}`} <b>chemistry</b></span>`).join("")}${sb.lines.map(x => `<span class="tchip set">${esc((CC.CBY[x.col] || {}).name || x.col)} ×${x.n} <b>+${x.plus} ${x.all ? "to everything" : x.keys.map(k => BB.RLABEL[k] || k).join(", ")}</b></span>`).join("")}</div>`;
  // the ladder
  const nx = Math.min(lad.length, L.best + 1), nr = lad[nx - 1];
  h += `<h3>The ladder · ${L.best} of ${lad.length}</h3>`;
  if (nr) h += luOpp(nr, `Rung ${nr.rung}${L.beat[nr.rung] ? " · cleared" : ""}`, LG.rungReward(nr.rung), L.beat[nr.rung], `luPlay('ladder',${nr.rung},true)`, `luPlay('ladder',${nr.rung},false)`, chk.ok);
  h += `<details class="lulad"><summary>Every rung</summary><ol>${lad.map(r => `<li class="${L.beat[r.rung] ? "done" : r.rung <= L.best + 1 ? "open" : "lock"}"><span>${r.rung}.</span><b>${r.season} ${esc(teamName(r.team))}</b><small>${r.w}-${r.l} · ${cnRes(r.res)}</small>${L.beat[r.rung] || r.rung <= L.best + 1 ? `<button class="sm ghost" ${chk.ok ? "" : "disabled"} onclick="luPlay('ladder',${r.rung},false)">Play</button>` : `<em>${cgRewardText(LG.rungReward(r.rung))}</em>`}</li>`).join("")}</ol></details>`;
  // weekly challenges
  h += `<h3>This week's lineup challenges</h3><div class="luweek">`;
  for (const w of W.list) {
    const opp = lad[w.rung - 1], done = L.ch.done[w.id], rule = LG.RBY[w.k], fits = chk.ok && rule.test(rules);
    h += `<div class="luch${done ? " done" : ""}"><b>${esc(w.text)}</b><small>vs the ${opp.season} ${esc(teamName(opp.team))} (${opp.w}-${opp.l}) · ${done ? "Done ✓" : cgRewardText(w.reward)}</small>${chk.ok && !rule.test(rules) ? `<small class="no">Your current lineup doesn't fit this rule. Build one in another slot.</small>` : ""}<div class="row"><button class="sm" ${fits ? "" : "disabled"} onclick="luPlay('week','${w.id}',true)">▶ Watch</button><button class="sm ghost" ${fits ? "" : "disabled"} onclick="luPlay('week','${w.id}',false)">Result</button></div></div>`;
  }
  h += `</div><p class="m small">New challenges every Monday. Build a lineup for a challenge in one of your three slots.</p>`;
  // recent results
  if (L.hist.length) h += `<h3>Recent games</h3><ul class="luhist">${L.hist.map(x => `<li class="${x.win ? "w" : "l"}"><b>${x.win ? "W" : "L"} ${x.s ? x.s[0] + "-" + x.s[1] : ""}</b> <span>at the ${esc(x.opp || "")}</span> <small>${x.kind === "ladder" ? "rung " + x.ref : "challenge"} · ${coinH(x.coins)}</small></li>`).join("")}</ul>`;
  return h;
}
function luOpp(r, kick, reward, done, watch, quick, ready) {
  const T = TB[r.team] || {};
  return `<div class="luopp" style="--c:${T.c1 || "#555"};--c2:${T.c2 || "#222"}"><small>${kick}</small><b>${r.season} ${esc(T.city || "")} ${esc(T.name || r.team)}</b><span class="m">${r.w}-${r.l} · ${cnRes(r.res)} · at ${esc(T.arena || "their arena")}, ${r.season} rules</span><span>${done ? "Replays pay " + coinH(LG.REPLAY_WIN) + " a win" : "First win: " + cgRewardText(reward)}</span><div class="row"><button ${ready ? "" : "disabled"} onclick="${watch}">▶ Play and watch</button><button class="ghost" ${ready ? "" : "disabled"} onclick="${quick}">Skip to the result</button></div></div>`;
}
function luSlot(i) { const s = CGSAVE.load(); LG.luOf(s).a = i; CGSAVE.save(); route(); }
function luToggle(key) {
  const s = CGSAVE.load(), L = LG.luOf(s), r = LG.toggle(s, L.a, key, luPid);
  if (r === "full") cgToast(`A lineup holds at most ${LG.MAX_N} players.`); else if (r === "swap") cgToast("Swapped in his other card.");
  CGSAVE.save(); if ($("lupick")) luPickRender(); else route();
}
function luTeamEdit() {
  const s = CGSAVE.load(), T = LG.luOf(s).team, el = $("luteamedit"); if (!el) return;
  el.innerHTML = `<div class="lute"><label>City <input id="lu-city" maxlength="18" value="${esc(T.city)}"></label><label>Name <input id="lu-name" maxlength="18" value="${esc(T.name)}"></label><label>Colors <input type="color" id="lu-c1" value="${T.c1}"><input type="color" id="lu-c2" value="${T.c2}"></label><button class="sm" onclick="luTeamSave()">Save</button></div>`;
}
function luTeamSave() {
  const s = CGSAVE.load(), T = LG.luOf(s).team, clean = x => String(x || "").replace(/[<>&"]/g, "").trim().slice(0, 18);
  T.city = clean($("lu-city").value) || "Your"; T.name = clean($("lu-name").value) || "All-Stars"; T.c1 = $("lu-c1").value; T.c2 = $("lu-c2").value; CGSAVE.save(); luTeamSync(s); route();
}
// ---------- the card picker ----------
function luPicker(g) { LUV.pick = { f: g || "", q: "", n: 48 }; let m = $("lupick"); if (!m) { m = document.createElement("div"); m.id = "lupick"; m.className = "cmodal"; document.body.appendChild(m); } m.hidden = false; document.body.classList.add("noscroll"); luPickRender(); }
function luPickClose() { const m = $("lupick"); if (m) m.remove(); document.body.classList.remove("noscroll"); route(); }
function luPickRender() {
  const m = $("lupick"); if (!m) return; const s = CGSAVE.load(), L = LG.luOf(s), inK = new Set(L.sl[L.a].k), inP = new Set(L.sl[L.a].k.map(luPid)), P = LUV.pick;
  const q = P.q.toLowerCase(), list = Object.keys(s.owned).map(luCard).filter(c => c && (!P.f || LG.GROUP[c.role] === P.f) && (!q || c.name.toLowerCase().includes(q))).sort((a, b) => b.ovr - a.ovr || b.season - a.season);
  const shown = list.slice(0, P.n);
  m.innerHTML = `<div class="cm-box"><button class="cm-x" onclick="luPickClose()" aria-label="Done">✕</button><h3>Lineup ${L.sl[L.a].n} · ${L.sl[L.a].k.length}/${LG.MAX_N}</h3>
    <div class="row lupf"><div class="seg">${[["", "All"], ["g", "Ball handlers"], ["w", "Wings"], ["b", "Bigs"]].map(([k, n]) => `<button class="${P.f === k ? "on" : ""}" onclick="LUV.pick.f='${k}';LUV.pick.n=48;luPickRender()">${n}</button>`).join("")}</div><input id="luq" placeholder="Search your cards" value="${esc(P.q)}" oninput="LUV.pick.q=this.value;LUV.pick.n=48;clearTimeout(LUV.qt);LUV.qt=setTimeout(()=>{luPickRender();const e=$('luq');e.focus();e.setSelectionRange(e.value.length,e.value.length)},250)"></div>
    <p class="m small">${list.length} card${list.length === 1 ? "" : "s"} you own. Tap to add or take out; a player's other card swaps in for him.</p>
    <div class="cgrid">${shown.map(c => { const k = pcKey(c), on = inK.has(k), cp = MY.best(c); return `<button class="ctile pickt t-${c.tier.key}${on ? " own" : inP.has(c.pid) ? " other" : ""}" onclick="luToggle('${k}')">${CART.front(cp ? Object.assign({}, c, { cp }) : c)}<span class="ctl">${c.season} · ${esc(c.role)} · ${esc(c.col === "base" ? "Base" : (CC.CBY[c.col] || {}).name || "")}</span>${on ? `<span class="owned">In</span>` : ""}</button>`; }).join("")}</div>
    ${list.length > shown.length ? `<p class="more"><button onclick="LUV.pick.n+=48;luPickRender()">Show more (${list.length - shown.length} left)</button></p>` : ""}<p><button class="btn" onclick="luPickClose()">Done</button></p></div>`;
}

// ---------- playing a game ----------
// your side: each card's ratings that season, its card boost, the lineup's collection boosts; chemistry per player
async function luSide(cards) {
  const rules = cards.map(luRule), sb = LG.setBoosts(rules), ch = LG.chemistry(rules), players = [], chem = [];
  for (const [i, c] of cards.entries()) {
    const det = await pcDetail(c.pid), row = det && det.s.find(x => x[0] === c.season); if (!row) continue;
    const built = pcBuild(Object.assign({}, c, { r: pcR(row) })), r = LG.applyBoosts(built ? built.r : pcR(row), sb.boosts), p = D.pl[c.pid] || {}, nm = (p.name || c.name).split(" ");
    players.push({ id: c.pid, role: c.role, first: nm[0], last: nm.slice(1).join(" ") || nm[0], ht: p.ht || c.ht, wt: row[4] || p.wt || c.wt, wing: p.wing || (p.ht || c.ht) + 3, aggr: p.aggr !== undefined ? p.aggr : 0.5, r, ovr: c.ovr, num: c.num });
    chem.push(ch.per[i]);
  }
  return { players, chem };
}
async function luPlay(kind, ref, watch) {
  if (LUV.busy) return; LUV.busy = true;
  try {
    await luPrep(); const s = CGSAVE.load(), cards = luCards(s), rules = cards.map(luRule), chk = LG.check(rules);
    if (!chk.ok) { cgToast("Your lineup needs: " + esc(chk.problems.join(", "))); return; }
    const lad = luLadder(); let ts, ch = null;
    if (kind === "ladder") { if (ref > LG.luOf(s).best + 1) { cgToast("Clear the rung below first."); return; } ts = lad[ref - 1]; }
    else { ch = luWeek().list.find(w => w.id === ref); if (!ch) return; if (!LG.RBY[ch.k].test(rules)) { cgToast("This lineup doesn't fit the challenge's rule."); return; } ts = lad[ch.rung - 1]; }
    cgToast(`Tipping off at the ${ts.season} ${esc(teamName(ts.team))}…`);
    const opp = await cnSide(ts), mine = await luSide(cards);
    if (mine.players.length < LG.MIN_N) { cgToast("Some of your cards have no ratings in the record."); return; }
    await new Promise(r => setTimeout(r, 30));
    const seed = (Math.random() * 4294967296) >>> 0;
    const game = simulateGame({ id: ts.team }, { id: "MY" }, [opp.players, mine.players], seed, { season: ts.season, frames: !!watch, tactics: [opp.tac, undefined], ctx: { chem: opp.players.map(() => 1).concat(mine.chem) } });
    const box = boxScore(game, game.ticks), tot = t => box.filter(x => x.t === t).reduce((a, x) => ({ pts: a.pts + x.pts, tkl: a.tkl + x.tkl, reb: a.reb + x.oreb + x.dreb, fpm: a.fpm + x.fpm }), { pts: 0, tkl: 0, reb: 0, fpm: 0 });
    const my = tot(1), op = tot(0), win = game.score[1] > game.score[0], oppName = `${ts.season} ${teamName(ts.team)}`;
    const res = LG.record(s, kind, kind === "ladder" ? ref : ch, { win, score: [game.score[1], game.score[0]], my, opp: op }, { d: ECO.dayKey(new Date()), opp: oppName });
    const xp = ECO.gainXP(s, win ? 40 : 10), pass = BB.NIGHTS ? BB.NIGHTS.passGain(s, win ? 80 : 25, Date.now()) : [], ach = cgAch(s); CGSAVE.save();
    const top = box.slice().sort((a, b) => NT.gsc(b) - NT.gsc(a))[0], tr = game.roster[top.idx];
    const R = { kind, ref, ts, win, score: game.score, my, op, res, top: { name: tr.name, line: NT.lineOf(top), mine: tr.t === 1 }, xp, pass, ach, oppName };
    if (watch) {
      game.ctx = null; game.refs = {}; game.restNames = []; game.coachNames = [opp.coach, "You"]; game.season = ts.season; game.type = 0; game.day = 0; game.att = null; game.chase = []; game.feudLines = []; game.demandLines = [];
      game.note = `Lineup game · the ${esc(TB.MY.city)} ${esc(TB.MY.name)} at the ${esc(oppName)} · ${ts.season} rules`;
      LUV.cur = { game, R, ts, shown: false }; location.hash = "#lineup-watch";
    } else luResult(R);
  } finally { LUV.busy = false; }
}
function luWatchPage() {
  const C = LUV.cur; if (!C) return `<p><a href="#lineup">← Lineup</a></p><p>No game to show.</p>`;
  $("broadcast").hidden = false;
  setTimeout(() => { const t = C.ts; loadPrepared(C.game, { S: { season: t.season, games: [] }, classic: { classic: true, rec: { [t.team]: [t.w, t.l], MY: [LG.luOf(CGSAVE.load()).w, LG.luOf(CGSAVE.load()).l] }, series: null, coach: [C.game.coachNames[0], "You"], season: t.season, type: 0, day: 0, yr: [t.season, "Lineup"], label: C.R.kind === "ladder" ? "LADDER RUNG " + C.R.ref : "LINEUP CHALLENGE" } }); }, 40);
  return `<p><a href="#lineup">← Lineup</a> · <b>${esc(TB.MY.city)} ${esc(TB.MY.name)}</b> at the <b>${esc(C.R.oppName)}</b></p><div class="cnlive" id="lulive">The result is in your lineup page when you go back; watch it play out first.</div>`;
}
// the result card (after a skipped game, or when you leave the broadcast)
function luResult(R) {
  SFX[R.win ? "horn" : "clunk"]();
  const ov = document.createElement("div"); ov.className = "cnwit lures";
  ov.innerHTML = `<div class="cgcall t-${R.win ? "emerald" : "ruby"}"><b>${R.win ? "WIN" : "LOSS"}</b><small>${R.score[1]}-${R.score[0]} at the ${esc(R.oppName)}</small></div>
    <div class="lur"><p>Player of the game: <b>${esc(R.top.name)}</b> ${R.top.mine ? "(yours)" : ""} · ${esc(R.top.line)}</p><p>Tackles ${R.my.tkl}-${R.op.tkl} · rebounds ${R.my.reb}-${R.op.reb}${R.my.fpm || R.op.fpm ? ` · fours ${R.my.fpm}-${R.op.fpm}` : ""}</p>
    <p>${R.res.lines.map(esc).join(" · ")}${R.res.lines.length ? " · " : ""}${coinH(R.res.coins)}${Object.keys(R.res.tokens || {}).length ? " + " + cgTokText(R.res.tokens) : ""}</p>${R.ach.map(a => `<p class="gold">Achievement: ${esc(a.name)}</p>`).join("")}${R.pass.map(u => `<p class="gold">Season pass level ${u.L}: ${cgRewardText(u.reward)}</p>`).join("")}</div>
    <button class="btn">OK</button>`;
  document.body.appendChild(ov);
  const close = () => { ov.remove(); window.removeEventListener("hashchange", close); if (location.hash.startsWith("#lineup")) route(); };
  ov.querySelector("button").onclick = close; window.addEventListener("hashchange", close);
  cgLevelToasts(R.xp);
}
// the broadcast's final buzzer: show the result card for a watched lineup game
function luOnPlay(game, from, to) { const C = LUV.cur; if (!C || C.game !== game || C.shown) return; if (C.finalTk === undefined) C.finalTk = (game.events.find(e => e.type === "final") || { tk: game.ticks }).tk; if (to >= C.finalTk) { C.shown = true; setTimeout(() => luResult(C.R), 2500); } }

// ---------- styles ----------
(function () {
  const st = document.createElement("style");
  st.textContent = `.luteam{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;background:linear-gradient(120deg,var(--c),var(--c2));margin:6px 0;box-shadow:inset 0 0 0 1px #fff2}
.luteam .lt{display:flex;flex-direction:column;text-shadow:0 1px 4px #000}.luteam small{font-size:11px;letter-spacing:1px;text-transform:uppercase}.luteam b{font:700 22px Oswald,sans-serif}
.lute{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0;font-size:12.5px}.lute input{background:#0d1117;color:var(--ink);border:1px solid #2b3445;border-radius:6px;padding:4px 6px;max-width:130px}.lute input[type=color]{padding:0;width:34px;height:28px}
.lutabs{margin:6px 0}
.lusum{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0}.lusum div{padding:8px;border-radius:10px;background:#161b24;border:1px solid #262e3b;display:flex;flex-direction:column}
.lusum small{font-size:10.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.8px}.lusum b{font:700 20px Oswald,sans-serif}.lusum .ok b{color:#35eaa3}.lusum .no b{color:#ff9f43}
.luprob{color:#ffb86b}
.luros{display:flex;flex-direction:column;gap:10px}.lug>b{font:700 14px Oswald,sans-serif;letter-spacing:.5px}.lug>b small{color:var(--mut);font-weight:400}
.lucard{position:relative}.lucard .rm{position:absolute;right:2px;bottom:22px;z-index:3;width:24px;height:24px;border-radius:50%;padding:0;background:rgba(5,7,10,.8);color:#fff;border:1px solid #fff4;font-size:12px}
.luadd{min-height:120px}.luadd b{font-size:26px;color:#cfd6e0}
.lulinks{display:flex;flex-wrap:wrap;gap:5px;margin:8px 0}.lulinks .tchip b{color:#35eaa3;margin-left:3px}.lulinks .tchip.set b{color:#ffd34d}
.luopp{position:relative;display:flex;flex-direction:column;gap:3px;padding:12px 12px 12px 16px;border-radius:12px;background:#141922;border:1px solid #262e3b}
.luopp:before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;border-radius:12px 0 0 12px;background:linear-gradient(var(--c),var(--c2))}
.luopp small{color:#ffd34d;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:11px}.luopp b{font:700 22px Oswald,sans-serif}.luopp .m{font-size:12px}.luopp .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.lulad{margin:8px 0}.lulad summary{cursor:pointer;color:var(--mut);font-size:13px}.lulad ol{list-style:none;padding:0;margin:6px 0;display:flex;flex-direction:column;gap:3px}
.lulad li{display:grid;grid-template-columns:28px 1fr auto auto;gap:6px;align-items:center;font-size:12.5px;padding:4px 6px;border-radius:7px;background:#12161d}.lulad li small{color:var(--mut)}.lulad li em{font-style:normal;font-size:11px;color:var(--mut)}
.lulad li.done{background:#11241b}.lulad li.done b:after{content:" ✓";color:#35eaa3}.lulad li.lock{opacity:.55}
.luweek{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}.luch{padding:10px 12px;border-radius:12px;background:#161b24;border:1px solid #262e3b;display:flex;flex-direction:column;gap:4px}
.luch b{font-size:13.5px}.luch small{color:var(--mut);font-size:12px}.luch small.no{color:#ffb86b}.luch .row{display:flex;gap:6px;margin-top:4px}.luch.done{border-color:#2f7a55;background:#11241b}
.luhist{list-style:none;padding:0;margin:4px 0;display:flex;flex-direction:column;gap:3px;font-size:13px}.luhist li.w b{color:#35eaa3}.luhist li.l b{color:#ff5571}.luhist small{color:var(--mut)}
#lupick{z-index:61}.lupf{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.lupf input{flex:1;min-width:140px;background:#0d1117;color:var(--ink);border:1px solid #2b3445;border-radius:8px;padding:6px 8px}
.ctile.pickt.other{opacity:.55}.ctile.pickt .owned{background:#ffd34d;color:#2a1d00}
.lures .lur{max-width:420px;text-align:center;font-size:13.5px;color:#d6dbe3}.lures .lur p{margin:4px 0}.lures .gold{color:#ffe08a}`;
  document.head.appendChild(st);
})();
