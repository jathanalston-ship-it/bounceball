// ===================== CLASSIC NIGHTS: the viewer =====================
// Three exhibitions a day between historic team-seasons (src/nights.js picks them from the date). Each game
// is simulated here by the real engine with both rosters on era-relative ratings, under the home team's
// rules, in its arena. Before tip-off: pick'em. On air: watch it in the 3D broadcast for coins on big plays
// (double for players you own) and a bonus at the final buzzer; a big night you watched drops a witness card.
// Games are graded when they go final (or when you finish watching), and every action feeds the season pass.
"use strict";
const NT = BB.NIGHTS;
const CN = { slates: {}, games: {}, sums: {}, cur: null, grading: false };
const cnCands = () => CN.cands || (CN.cands = NT.candidates(D.lg));
const cnSlate = dk => CN.slates[dk] || (CN.slates[dk] = NT.slateFor(dk, cnCands()));
function cnDays(n) { const out = [], d = new Date(); for (let k = 0; k < (n || 2); k++) { const x = new Date(d); x.setDate(d.getDate() - k); out.push(ECO.dayKey(x)); } return out; }
const cnTeam = ts => TB[ts.team] || { name: ts.team, city: "", c1: "#555", c2: "#222" };
const cnLabel = ts => `${ts.season} ${cnTeam(ts).name}`;
const cnTime = t => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const cnRes = r => r === "Champion" ? "Champions" : r === "Finals" ? "Finalists" : r === "R2" ? "Second round" : r === "R1" ? "Playoffs" : "Missed the playoffs";
const cnGameOf = id => { const g = cnSlate(NT.dkOf(id.slice(0, 8)))[+id.slice(9) - 1]; return g || null; };

// ---------- the two sides: roster, coach, per-game averages (from the season files) ----------
async function cnSide(ts) {
  const S = await season(ts.season); if (window.V7) V7.identity(null);
  const ix = Object.fromEntries(S.statKeys.map((k, i) => [k, i + 1]));
  const ids = Object.entries(S.stats).filter(([id, a]) => a[0] === ts.team && a[ix.gp] > 0 && S.players[id]).sort((x, y) => y[1][ix.min] - x[1][ix.min]).slice(0, 12).map(([id]) => +id);
  const avg = {}; for (const id of ids) { const a = S.stats[id], gp = a[ix.gp]; avg[id] = { gp, pts: a[ix.pts] / gp, reb: (a[ix.oreb] + a[ix.dreb]) / gp, tkl: a[ix.tkl] / gp, dnk: (ix.dnk ? a[ix.dnk] : 0) / gp }; }
  const co = (S.coaches || {})[ts.coach];
  const players = ids.map(id => Object.assign({}, S.players[id], { r: BB.eraRel(S.players[id].r, ts.season) }));
  const stars = ids.map(id => S.players[id]).sort((x, y) => y.ovr - x.ovr).slice(0, 2).map(p => ({ id: p.id, name: p.first + " " + p.last, ovr: p.ovr }));
  return { ids, avg, players, stars, snap: id => S.players[id], tac: co ? co.tac : undefined, coach: co ? co.name : "" };
}
async function cnGameData(g) {
  if (CN.games[g.id]) return CN.games[g.id];
  const h = await cnSide(g.home), a = await cnSide(g.away);
  return (CN.games[g.id] = { g, h, a, props: NT.propsFor(g, { home: h.ids, away: a.ids }, Object.assign({}, h.avg, a.avg)) });
}
const cnSim = (G, frames) => simulateGame({ id: G.g.home.team }, { id: G.g.away.team }, [G.h.players, G.a.players], G.g.seed, { season: G.g.home.season, frames, tactics: [G.h.tac, G.a.tac] });
// a finished game, boiled down for grading
function cnSummary(game) {
  const box = boxScore(game, game.ticks), byId = {};
  for (const x of box) { const r = game.roster[x.idx]; byId[r.id] = { pts: x.pts, reb: x.oreb + x.dreb, ast: x.ast, tkl: x.tkl, dnk: x.dnk, blk: x.blk, stl: x.stl }; }
  const E = game.events;
  return { score: game.score.slice(), periods: game.periods, box: byId,
    eject: E.some(e => e.type === "ejected"), fight: E.some(e => e.type === "fight"), flag: E.some(e => e.type === "foul" && e.kind === "flagrant"),
    lastfour: E.some(e => e.type === "fga" && e.made && e.val === 4 && e.per >= 4 && e.clk <= 60) };
}
async function cnSum(g) {
  if (CN.sums[g.id]) return CN.sums[g.id];
  const G = await cnGameData(g); await new Promise(r => setTimeout(r, 20));
  return (CN.sums[g.id] = cnSummary(cnSim(G, false)));
}

// ---------- grading: every final game with picks, today's and yesterday's results, the bold call ----------
async function cnGradeDue(rerender) {
  if (CN.grading) return; CN.grading = true;
  const s = CGSAVE.load(), c = NT.cnOf(s), now = Date.now(), done = [], bolds = [], ups = [];
  try {
    for (const [k, dk] of cnDays(7).entries()) {
      const sl = cnSlate(dk), sums = [];
      for (const g of sl) {
        const fin = NT.status(dk, g.i, now) === "final" || (c.w[g.id] || {}).fin;
        if (!fin) continue;
        if (k > 1 && !c.picks[g.id] && !c.bold[NT.compact(dk)]) continue; // older days: only games you had a stake in
        if (c.res[g.id] && k > 1 && !c.bold[NT.compact(dk)]) continue;
        const sum = await cnSum(g); sums.push(sum);
        if (!c.res[g.id] && (c.picks[g.id] || NT.status(dk, g.i, now) === "final")) {
          const r = NT.gradeGame(s, g, sum, CN.games[g.id].props); if (r && (r.right || r.wrong)) { done.push(r); ups.push(...NT.passGain(s, NT.PASS_GAIN.right * r.right, now)); for (let i = 0; i < r.right; i++) cnTrack(s, "pickw"); }
        }
      }
      if (sums.length === sl.length && c.bold[NT.compact(dk)]) { const b = NT.gradeBold(s, dk, sums); if (b) { bolds.push(b); if (b.hit) ups.push(...NT.passGain(s, NT.PASS_GAIN.bold, now)); } }
    }
  } finally { CN.grading = false; }
  if (done.length || bolds.length) {
    CGSAVE.save(); SFX.coin();
    const coins = done.reduce((a, r) => a + r.coins, 0), right = done.reduce((a, r) => a + r.right, 0), tot = right + done.reduce((a, r) => a + r.wrong, 0);
    if (tot) cgToast(`Picks graded: <b>${right} of ${tot}</b> right · ${coinH(coins)}${c.streak >= 3 ? ` · streak ${c.streak}` : ""}`, coins ? "gold" : "");
    for (const b of bolds) cgToast(b.hit ? `<b>Bold call hit!</b> ${esc(NT.BBY[b.k].text)} · ${coinH(b.pay)}` : `Bold call missed: ${esc(NT.BBY[b.k].text)}`, b.hit ? "gold" : "");
    cnPassToasts(ups);
  }
  if (rerender && location.hash.startsWith("#nights") && !location.hash.startsWith("#nights-watch")) route();
}
function cnTrack(s, type) { const fin = ECO.track(s, { type }); for (const ch of fin) cgToast(`Challenge done: ${esc(ch.text)} · ${coinH(Math.round(ch.coins * ECO.coinBonus(s)))}`, "gold"); }
function cnPassToasts(ups) { for (const u of ups || []) { SFX.horn(); cgToast(`<b>Season pass level ${u.L}!</b> ${cgRewardText(u.reward)}`, "gold"); } }

// ---------- the page ----------
async function vNights(a, b) {
  if (!window.BB || !BB.NIGHTS) return `<p>Classic Nights needs the league data.</p>`;
  if (a === "watch") return cnWatch(b);
  const ix = await pcIndex(); if (ix) { const all = pcAll(ix); await pcBaseLoad(); cgPrep(all); PC.packs = PC.packs || cgPackList(all); }
  const s = CGSAVE.load(), now = Date.now(), [today, yest] = cnDays(); NT.prune(s, today); NT.passEnsure(s, now); CGSAVE.save();
  if (a === "pass") return cnPassPage(s);
  const T = cnSlate(today), Y = cnSlate(yest);
  await Promise.all(T.concat(Y).map(g => cnGameData(g).catch(() => null)));
  let h = `<div class="vh"><h2>Classic Nights</h2><a class="btn ghost" href="#cards-packs">Packs →</a></div>
    <p class="m">Three exhibitions a day between teams from the league's past, on the real engine: nobody knows how they go until they air. Each game is played under the home team's rules, in its building, with both teams rated against their own era. Make your picks before tip-off, then watch: big plays pay coins (double for players you own), the final buzzer pays a bonus, and a big night you watched drops a one-off card.</p>`;
  h += cgWallet(s, `<span class="m">Pick streak <b>${s.cn.streak}</b>${s.cn.best ? ` · best ${s.cn.best}` : ""}</span>`);
  h += cnPassCard(s);
  h += `<h3>Tonight · ${new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h3><div class="cngames">${T.map(g => cnCard(s, g, now)).join("")}</div>`;
  h += cnBoldCard(s, today, now);
  h += `<h3>Last night</h3><div class="cngames past">${Y.map(g => cnCard(s, g, now)).join("")}</div>`;
  const yb = s.cn.bres[NT.compact(yest)]; if (yb) h += `<p class="m small">Yesterday's bold call: ${esc(NT.BBY[yb.k].text)} · ${yb.hit ? `<b class="up">hit, ${coinH(yb.pay)}</b>` : "missed"}</p>`;
  const wit = Object.entries(s.wit || {}).sort((x, y) => y[1].d.localeCompare(x[1].d));
  if (wit.length) { const cards = wit.map(([k]) => CG.byKey && CG.byKey.get(k)).filter(Boolean).slice(0, 8); pcSetList(cards, "wit"); h += `<h3>Witnessed</h3><div class="cgrid">${cards.map((c, i) => pcTile(c, i, s.wit[pcKey(c)].d, "wit")).join("")}</div>`; }
  h += `<p class="m small">Games tip off at ${NT.TIPS.map((t, i) => cnTime(NT.tipTime(today, i))).join(", ")} your time and go final 2½ hours later; picks lock at tip-off. Watch any game from today or last night. Season futures wait for a live season.</p>`;
  setTimeout(() => cnGradeDue(true), 50);
  return h;
}
function cnCard(s, g, now) {
  const G = CN.games[g.id], st = NT.status(g.dk, g.i, now), tip = NT.tipTime(g.dk, g.i), P = s.cn.picks[g.id] || {}, R = s.cn.res[g.id], W = s.cn.w[g.id] || {}, sum = CN.sums[g.id];
  const side = (ts, t, X) => `<div class="cns" style="--c:${cnTeam(ts).c1};--c2:${cnTeam(ts).c2}"><small>${ts.season} · ${ts.w}-${ts.l} · ${cnRes(ts.res)}</small><b>${esc(cnTeam(ts).city)} ${esc(cnTeam(ts).name)}</b>${X ? `<span class="m">${X.stars.map(p => `${esc(p.name)} <em>${p.ovr}</em>`).join(" · ")}</span>` : ""}${sum ? `<strong>${sum.score[t === "h" ? 0 : 1]}</strong>` : ""}</div>`;
  const lock = st !== "open", pickB = (what, val, label) => `<button class="pk${P[what] === val ? " on" : ""}" ${lock ? "disabled" : ""} onclick="cnPick('${g.id}','${what}','${val}')">${label}</button>`;
  let h = `<div class="cng ${st}${g.marquee ? " mq" : ""}"><div class="cnh"><span>${st === "open" ? `Tips at ${cnTime(tip)} · picks open` : st === "air" ? `<b class="live">● ON AIR</b> since ${cnTime(tip)}` : sum ? `Final${sum.periods > 4 ? (sum.periods === 5 ? "/OT" : "/" + (sum.periods - 4) + "OT") : ""}` : "Final · scoring…"}</span>${g.marquee ? `<em>Marquee</em>` : ""}</div>`;
  h += `<div class="cnm">${side(g.away, "a", G && G.a)}<div class="at">at</div>${side(g.home, "h", G && G.h)}</div>`;
  h += `<p class="m small cnr">At ${esc(cnTeam(g.home).arena || cnTeam(g.home).city + " Arena")}, under ${g.home.season} rules${g.home.season < 1979 ? " (no four-point line)" : ""}.</p>`;
  // picks
  h += `<div class="cnp"><div class="row"><span class="lab">Winner</span>${pickB("w", "a", esc(cnTeam(g.away).name))}${pickB("w", "h", esc(cnTeam(g.home).name))}${R ? cnMark(R, "w", P) : ""}</div>`;
  (G ? G.props : []).forEach((p, j) => {
    const X = (p.t === "home" ? G.h : G.a).snap(p.pid), nm = X ? X.first + " " + X.last : "#" + p.pid, got = sum && sum.box[p.pid] ? sum.box[p.pid][p.stat] : null;
    h += `<div class="row"><span class="lab">${esc(nm)} · ${p.line} ${p.name}${got != null && st === "final" ? ` <b>(${got})</b>` : ""}</span>${pickB("p" + j, "o", "Over")}${pickB("p" + j, "u", "Under")}${R ? cnMark(R, "p" + j, P, p, got) : ""}</div>`;
  });
  h += `</div><div class="cnf">`;
  if (st !== "open") h += `<a class="btn${st === "air" ? "" : " ghost"}" href="#nights-watch-${g.id}">${st === "air" ? "▶ Watch" : "▶ Watch the replay"}</a>`;
  if (W.pops || W.fin) h += `<span class="m">Watched${W.fin ? " to the end" : ""} · ${coinH((W.pops || 0))} from big plays</span>`;
  if (R && (R.right || R.wrong)) h += `<span class="${R.coins ? "up" : "m"}">Picks: ${R.right} of ${R.right + R.wrong} · ${coinH(R.coins)}</span>`;
  return h + `</div></div>`;
}
function cnMark(R, what, P, p, got) {
  if (!P[what]) return "";
  const ok = what === "w" ? P.w === R.won : got != null && (P[what] === "o" ? got > p.line : got < p.line);
  return `<span class="mk ${ok ? "ok" : "no"}">${ok ? "✓" : "✗"}</span>`;
}
function cnBoldCard(s, dk, now) {
  const B = NT.boldFor(dk), first = NT.tipTime(dk, 0), lock = now >= first, mine = s.cn.bold[NT.compact(dk)], res = s.cn.bres[NT.compact(dk)];
  return `<div class="cnbold"><div><b>Bold call</b><small>${lock ? (mine ? "Locked in." : "Locked for today.") : `Pick one before the first tip-off (${cnTime(first)}). It pays if it happens in any of today's games.`}${res ? (res.hit ? ` <b class="up">It hit: ${coinH(res.pay)}</b>` : " It didn't happen.") : ""}</small></div>
    <div class="bolds">${B.map(b => `<button class="${mine === b.k ? "on" : ""}" ${lock ? "disabled" : ""} onclick="cnBold('${dk}','${b.k}')"><span>${esc(b.text)}</span>${coinH(b.pay)}</button>`).join("")}</div></div>`;
}
function cnPick(id, what, val) {
  const s = CGSAVE.load(), g = cnGameOf(id); if (!g) return; const c = NT.cnOf(s), was = (c.picks[id] || {})[what];
  if (!NT.setPick(s, g, what, was === val ? null : val, Date.now())) { cgToast("Picks are locked: the game has tipped off."); route(); return; }
  if (!was && val) { const ups = NT.passGain(s, NT.PASS_GAIN.pick, Date.now()); cnTrack(s, "pick"); cnPassToasts(ups); }
  CGSAVE.save(); SFX.flip(); route();
}
function cnBold(dk, k) {
  const s = CGSAVE.load(), c = NT.cnOf(s), id = NT.compact(dk);
  if (c.bold[id] === k) { delete c.bold[id]; CGSAVE.save(); route(); return; }
  if (!NT.setBold(s, dk, k, NT.tipTime(dk, 0), Date.now())) { cgToast("The bold call locked at the first tip-off."); return; }
  CGSAVE.save(); SFX.coin(); route();
}

// ---------- the season pass ----------
function cnPassCard(s) {
  const p = NT.passEnsure(s, Date.now()), L = p.lvl, into = p.xp - L * NT.PASS_XP, nx = L < NT.PASS_N ? NT.passReward(L + 1) : null;
  return `<a class="cnpass" href="#nights-pass"><div><small>${esc(NT.passName(p.id))} · free</small><b>Level ${L}<span class="m"> / ${NT.PASS_N}</span></b></div><i class="prog"><em style="width:${L < NT.PASS_N ? (into / NT.PASS_XP * 100).toFixed(1) : 100}%"></em></i><small class="m">${nx ? `${fmtN(into)} / ${NT.PASS_XP} XP · next: ${cgRewardText(nx) || "a pack"}` : "Pass complete"} ›</small></a>`;
}
function cnPassPage(s) {
  const p = NT.passEnsure(s, Date.now()), G = NT.PASS_GAIN;
  let h = `<p><a href="#nights">← Classic Nights</a></p><div class="vh"><h2>${esc(NT.passName(p.id))}</h2><span class="m">Level ${p.lvl} of ${NT.PASS_N}</span></div>`;
  h += `<p class="m">A free track. Earn pass XP by watching Classic Nights to the final buzzer (${G.finish}, +${G.close} if it was close), making picks (${G.pick} each, +${G.right} when right), hitting a bold call (${G.bold}), witnessing a big night (${G.witness}), opening packs (${G.pack}) and claiming the daily reward (${G.daily}). Every ${NT.PASS_XP} XP is a level. The pass starts over on October 20 (the season) and April 16 (the off-season). Every tenth level has a Pass Exclusive pack: a Diamond-or-better card, Red /25 or rarer, signed.</p>`;
  h += cnPassCard(s) + `<div class="passg">`;
  for (let L = 1; L <= NT.PASS_N; L++) { const r = NT.passReward(L); h += `<div class="pl${L <= p.lvl ? " got" : ""}${L % 10 === 0 ? " big" : ""}"><b>${L}</b><small>${cgRewardText(r)}</small></div>`; }
  return h + `</div>`;
}

// ---------- watching ----------
function cnWatch(id) {
  const g = cnGameOf(id || ""); if (!g) return `<p>No such game. <a href="#nights">Classic Nights</a></p>`;
  const st = NT.status(g.dk, g.i, Date.now());
  if (st === "open") return `<p><a href="#nights">← Classic Nights</a></p><p>This one tips off at ${cnTime(NT.tipTime(g.dk, g.i))}. Make your picks before then.</p>`;
  $("broadcast").hidden = false; $("bc-overlay").textContent = "Tipping off…"; $("bc-overlay").hidden = false;
  setTimeout(async () => {
    const G = await cnGameData(g), game = cnSim(G, true), s = CGSAVE.load();
    game.ctx = null; game.refs = {}; game.restNames = []; game.coachNames = [G.h.coach, G.a.coach]; game.season = g.home.season; game.type = 0; game.day = 0; game.att = null; game.chase = []; game.feudLines = []; game.demandLines = [];
    game.note = `Classic Nights · ${new Date(g.dk + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${esc(cnLabel(g.away))} at ${esc(cnLabel(g.home))} · ${g.home.season} rules`;
    const own = new Set(Object.keys(s.owned).map(k => +k.split(":")[2]));
    CN.cur = { g, G, game, watched: 0, own, done: false, dirty: 0, finalTk: (game.events.find(e => e.type === "final") || { tk: game.ticks }).tk };
    const rec = { [g.home.team]: [g.home.w, g.home.l], [g.away.team]: [g.away.w, g.away.l] };
    loadPrepared(game, { S: { season: g.home.season, games: [] }, classic: { classic: true, rec, series: null, coach: [G.h.coach, G.a.coach], season: g.home.season, type: 0, day: 0, yr: [g.home.season, g.away.season], label: g.marquee ? "MARQUEE" : "EXHIBITION" } });
    cnLiveBar();
  }, 40);
  const W = (CGSAVE.load().cn || { w: {} }).w[g.id] || {};
  return `<p><a href="#nights">← Classic Nights</a> · <b>${esc(cnLabel(g.away))}</b> at <b>${esc(cnLabel(g.home))}</b></p><div class="cnlive" id="cnlive">${W.fin ? "You've seen this one to the end: big plays you haven't been paid for still pay." : "Big plays pay coins (double for players you own); the final buzzer pays a bonus."}</div>`;
}
function cnLiveBar() {
  const el = $("cnlive"), C = CN.cur; if (!el || !C) return; const s = CGSAVE.load(), W = s.cn.w[C.g.id] || {};
  el.innerHTML = `${coinH(W.pops || 0)} <span class="m">from big plays${W.pops >= NT.POP_CAP ? " (the most a game pays)" : ""}</span>${W.fin ? ` · <span class="up">final buzzer bonus paid</span>` : ""}`;
}
// the broadcast calls this with every stretch of the game it plays (not seeks)
function cnOnPlay(game, from, to, notable) {
  const C = CN.cur; if (!C || C.game !== game) return;
  C.watched += to - from; const s = CGSAVE.load(); let got = 0;
  for (const n of notable) {
    if (n.tk <= from || n.tk > to) continue;
    const r = n.e.pid !== undefined ? game.roster[n.e.pid] : null, v = NT.addPop(s, C.g.id, n.i, n.label, r && C.own.has(r.id));
    if (v) { got += v; cnPopFx(v, r && C.own.has(r.id)); const fin = ECO.track(s, { type: "pop" }); for (const ch of fin) cgToast(`Challenge done: ${esc(ch.text)}`, "gold"); }
  }
  if (got) { C.dirty++; if (C.dirty >= 4) { CGSAVE.save(); C.dirty = 0; } cnLiveBar(); }
  if (!C.done && to >= C.finalTk) { C.done = true; setTimeout(cnFinal, 2200); }
}
// skipping to the end still reaches the final buzzer (the bonus shrinks with what you skipped)
function cnOnSeek(game, tk) { const C = CN.cur; if (C && C.game === game && !C.done && tk >= C.finalTk) { C.done = true; setTimeout(cnFinal, 1200); } }
function cnPopFx(v, own) {
  const host = $("courtwrap"); if (!host) return; SFX.coin();
  const el = document.createElement("div"); el.className = "cnpop" + (own ? " own" : ""); el.innerHTML = `<i class="coin"></i>+${v}${own ? "<small>yours ×2</small>" : ""}`;
  host.appendChild(el); setTimeout(() => el.remove(), 1600);
}
function cnFinal() {
  const C = CN.cur; if (!C) return; const s = CGSAVE.load(), game = C.game, frac = Math.min(1, C.watched / Math.max(1, game.ticks)), now = Date.now();
  const sum = cnSummary(game); CN.sums[C.g.id] = sum;
  const f = NT.finish(s, C.g.id, sum, frac), ups = [];
  if (f) { ups.push(...NT.passGain(s, NT.PASS_GAIN.finish + (Math.abs(sum.score[0] - sum.score[1]) <= 5 ? NT.PASS_GAIN.close : 0), now)); cnTrack(s, "watch"); cgToast(`Final buzzer bonus: ${coinH(f.coins)}${frac < 0.95 ? ` <span class="m">(you saw ${Math.round(frac * 100)}%)</span>` : ""}`, "gold"); }
  // a witness drop
  let drop = null;
  if (f) {
    const box = boxScore(game, game.ticks), top = NT.witnessOf(box, frac);
    if (top) {
      const r = game.roster[top.idx], home = r.t === 0, mine = home ? C.g.home : C.g.away, opp = home ? C.g.away : C.g.home, X = (home ? C.G.h : C.G.a).snap(r.id);
      const w = NT.addWitness(s, { season: mine.season, pid: r.id, d: C.g.dk, line: NT.lineOf(top), vs: cnLabel(opp), ovr: (X ? X.ovr : 75) + 4, team: mine.team, gs: NT.gsc(top), num: r.num, game: C.g.id, cp: ECO.rollCopy() });
      ups.push(...NT.passGain(s, NT.PASS_GAIN.witness, now)); drop = w.key;
    }
  }
  CGSAVE.save(); cnLiveBar(); cnPassToasts(ups);
  if (drop) { cgWitSync(); cnWitnessFx(drop); }
  setTimeout(() => cnGradeDue(false), 600);
}
function cnWitnessFx(key) {
  const c = CG.byKey && CG.byKey.get(key); if (!c) return; const s = CGSAVE.load(), cp = ECO.copiesOf(s, key)[0], v = Object.assign({}, c, { cp });
  const ov = document.createElement("div"); ov.className = "cnwit"; ov.innerHTML = `<div class="cgcall t-opal"><b>WITNESS DROP</b><small>You saw it live: ${esc(s.wit[key].line)}</small></div><div class="wc">${CART.front(v)}</div><p>${esc(c.name)} · Classic Nights card · in your collection</p><button class="btn">Nice</button>`;
  document.body.appendChild(ov); SFX.boom(0.6); SFX.sparkle(8);
  const close = () => { ov.remove(); window.removeEventListener("hashchange", close); };
  ov.querySelector("button").onclick = close; window.addEventListener("hashchange", close);
}

// ---------- styles ----------
(function () {
  const st = document.createElement("style");
  st.textContent = `.cnpass{display:flex;flex-direction:column;gap:5px;margin:8px 0;padding:11px 13px;border-radius:12px;background:linear-gradient(120deg,#3a0d2e,#14102a);border:1px solid #7a2b6a;color:var(--ink)}
.cnpass>div{display:flex;justify-content:space-between;align-items:baseline}.cnpass small{font-size:11.5px}.cnpass>div small{color:#ff9be0;font-weight:700;letter-spacing:.5px;text-transform:uppercase}
.cnpass b{font:700 20px Oswald,sans-serif}.cnpass .prog{height:8px;margin:0}.cnpass .prog em{background:linear-gradient(90deg,#ff3fa4,#ffd34d)}
.cngames{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px;margin:8px 0}
.cng{border-radius:14px;background:#141922;border:1px solid #262e3b;padding:10px 12px;display:flex;flex-direction:column;gap:7px}
.cng.mq{border-color:#c9a227;background:linear-gradient(160deg,#241c07,#141922 45%)}.cng.air{border-color:#ff3b5c;box-shadow:0 0 0 1px #ff3b5c55 inset}
.cnh{display:flex;justify-content:space-between;font-size:12px;color:var(--mut)}.cnh em{font-style:normal;color:#ffd34d;font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:11px}
.cnh .live{color:#ff3b5c;animation:cgpulse 1.2s infinite}
.cnm{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.cnm .at{color:var(--mut);font-size:12px}
.cns{position:relative;padding:7px 9px 7px 12px;border-radius:9px;background:#0f1319;display:flex;flex-direction:column;gap:1px;min-width:0}
.cns:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;border-radius:9px 0 0 9px;background:linear-gradient(var(--c),var(--c2))}
.cns small{font-size:10.5px;color:var(--mut)}.cns b{font:700 15px Oswald,sans-serif;line-height:1.15}.cns .m{font-size:10.5px}.cns .m em{font-style:normal;color:#ffd34d;font-weight:700}
.cns strong{position:absolute;right:8px;top:50%;transform:translateY(-50%);font:700 22px Oswald,sans-serif;text-shadow:0 2px 6px #000}.cns:has(strong){padding-right:44px}
.cnr{margin:0}
.cnp{display:flex;flex-direction:column;gap:4px}.cnp .row{display:flex;gap:5px;align-items:center;flex-wrap:wrap}.cnp .lab{flex:1 1 140px;font-size:12px;color:#c9d1dc}
.cnp button.pk{padding:5px 10px;border-radius:8px;background:#1d2533;color:var(--ink);border:1px solid #2f3a4d;font-size:12.5px;min-width:64px}
.cnp button.pk.on{background:#35eaa3;color:#062b1b;border-color:#35eaa3;font-weight:700}.cnp button.pk:disabled{opacity:.55}.cnp button.pk.on:disabled{opacity:.9}
.mk{font-weight:700;font-size:15px;width:18px;text-align:center}.mk.ok{color:#35eaa3}.mk.no{color:#ff5571}
.cnf{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px}.cnf .btn{margin:0}
.cngames.past .cng{opacity:.92}
.cnbold{display:flex;flex-direction:column;gap:8px;padding:11px 13px;border-radius:12px;background:#1d1408;border:1px solid #6b5313;margin:6px 0}
.cnbold b{font:700 16px Oswald,sans-serif}.cnbold small{display:block;color:var(--mut);font-size:12px}
.bolds{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:6px}.bolds button{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:8px 10px;border-radius:9px;background:#141922;border:1px solid #3a2e10;color:var(--ink);text-align:left;font-size:12.5px}
.bolds button.on{border-color:#ffd34d;background:#3a2b06;box-shadow:0 0 0 1px #ffd34d inset}.bolds button:disabled{opacity:.6}.bolds button.on:disabled{opacity:1}
.passg{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;margin:8px 0}
.passg .pl{padding:7px 9px;border-radius:9px;background:#141922;border:1px solid #262e3b;display:flex;flex-direction:column;gap:2px}.passg .pl b{font:700 16px Oswald,sans-serif}.passg .pl small{font-size:11px;color:var(--mut)}
.passg .pl.big{border-color:#ff3fa4;background:linear-gradient(140deg,#3a0d2e,#141922)}.passg .pl.got{opacity:.6}.passg .pl.got b:after{content:" ✓";color:#35eaa3}
.cnlive{margin:6px 0;padding:8px 12px;border-radius:10px;background:#161b24;border:1px solid #262e3b;font-size:13px}
.cnpop{position:absolute;right:12px;top:58px;z-index:8;pointer-events:none;font:700 22px Oswald,sans-serif;color:#ffe08a;text-shadow:0 2px 6px #000,0 0 12px rgba(255,200,60,.6);display:flex;align-items:center;gap:4px;animation:cnpop 1.6s ease-out forwards}
.cnpop small{font:700 10px Inter,sans-serif;color:#35eaa3;margin-left:4px}.cnpop.own{color:#7dffc9}
@keyframes cnpop{0%{transform:translateY(10px) scale(.6);opacity:0}15%{transform:none;opacity:1}75%{opacity:1}100%{transform:translateY(-34px);opacity:0}}
.cnwit{position:fixed;inset:0;z-index:97;background:rgba(3,4,8,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;animation:cgtin .3s ease-out}
.cnwit .cgcall{animation:cgpop .45s cubic-bezier(.2,1.6,.4,1) both}.cnwit .wc{width:min(64vw,280px);filter:drop-shadow(0 0 30px rgba(255,155,224,.5));animation:pkdeal .6s ease-out both}.cnwit p{margin:0;color:#d6dbe3;font-size:13.5px}
.cardsvg .livedot{animation:cgpulse 1.2s infinite}.ctile .cardsvg .livedot{animation:none}`;
  document.head.appendChild(st);
})();
