// ===================== BROADCAST CONTROLLER =====================
// Plays recorded games: 3D broadcast (default) or the 2D tactical view, TV graphics, sound,
// instant replays, and a three-channel mode where several games air on one shared clock.
"use strict";
const TB = {}; BB.TEAMS.forEach(t => TB[t.id] = t);
const $ = id => document.getElementById(id);
const FS = C.FS, PO = 8, BO = 80, MO = 85; // frame layout: players x8, ball at 80, game state at 85
let GAME = null, COLORS = ["#fff", "#000"], TXT = ["#000", "#fff"], NOTABLE = [];
const V = { tick: 0, playing: false, speed: 2, last: 0, visCount: -1, boxAt: -1, view3d: true, replay: null, autoReplay: true, lastFx: -1, channels: null, ch: 0, live: false, lastReplayTk: -1e9 };
let B3 = null, AUDIO = null;

function lum(hex) { const n = parseInt(hex.slice(1), 16); const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function cdist(a, b) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs((x >> 8 & 255) - (y >> 8 & 255)) + Math.abs((x & 255) - (y & 255)); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perName(p) { return p <= 4 ? "Q" + p : (p === 5 ? "OT" : (p - 4) + "OT"); }
function fmtClock(c) { c = Math.max(0, c); if (c < 60) return c.toFixed(1); const m = Math.floor(c / 60), s = Math.floor(c % 60); return m + ":" + String(s).padStart(2, "0"); }
function teamColors(h, a) { const c0 = TB[h].c1; let c1 = TB[a].c1; if (cdist(c0, c1) < 140) c1 = TB[a].c2; return [c0, c1]; }

// ---------- notable moments ----------
function buildNotable(game) {
  const out = [];
  for (const e of game.events) {
    let label = null, col = "#fff", big = 0;
    if (e.type === "tackle" && e.result === "down" && e.gang) { label = "GANG TACKLE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "down") { label = "TACKLE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "fumble") { label = "FUMBLE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "rough") { label = "ROUGHING"; col = "#ffb703"; big = 1; }
    else if (e.type === "fga" && e.made && e.pt === "lob") { label = "ALLEY-OOP!"; col = "#fff"; big = 3; }
    else if (e.type === "tackle" && e.result === "late") { label = "LATE HIT"; col = "#ffb703"; big = 1; }
    else if (e.type === "tackle" && e.result === "broken") { label = "BROKE THE TACKLE"; col = "#7cf"; big = 1; }
    else if (e.type === "fga" && e.gt !== undefined) { label = "GOALTENDING"; col = "#ffb703"; }
    else if (e.type === "fga" && e.ci !== undefined) { label = "CYLINDER!"; col = "#ffb703"; }
    else if (e.type === "fga" && e.blk !== undefined && e.blk >= 0) { label = e.swat ? "SWAT!" : "REJECTED"; col = "#9ef01a"; big = e.swat ? 3 : 2; }
    else if (e.type === "fga" && e.made && e.val === 4) { label = "FOUR!"; col = "#f2b134"; big = 3; }
    else if (e.type === "fga" && e.made && e.dunk) { label = "SLAM"; col = "#fff"; big = 2; }
    if (label) out.push({ tk: e.tk, label, col, big, e });
  }
  return out;
}

// ---------- 2D tactical view ----------
const cv = $("court"), ctx = cv.getContext("2d");
let bg = null, S = 4, DPR = 1, VERT = false;
function resize() {
  const w = cv.parentElement.clientWidth; DPR = Math.min(2, window.devicePixelRatio || 1);
  if (!w) return;
  VERT = w < 600;
  let cw, ch;
  if (VERT) { ch = Math.min(w * 100 / 56, window.innerHeight * 0.64); cw = ch * 56 / 100; }
  else { cw = w; ch = w * 56 / 100; }
  cv.style.width = cw + "px"; cv.style.height = ch + "px";
  cv.width = Math.round(cw * DPR); cv.height = Math.round(ch * DPR);
  S = (VERT ? cv.height : cv.width) / 100; drawCourtBg();
}
const X = x => (x + 3) * S, Y = y => (y + 3) * S;
const SX = (x, y) => VERT ? (53 - y) * S : (x + 3) * S;
const SY = (x, y) => VERT ? (x + 3) * S : (y + 3) * S;
function drawCourtBg() {
  bg = document.createElement("canvas"); bg.width = cv.width; bg.height = cv.height;
  if (!bg.width) return;
  const g = bg.getContext("2d");
  g.fillStyle = "#0d1015"; g.fillRect(0, 0, bg.width, bg.height);
  if (VERT) g.setTransform(0, 1, -1, 0, bg.width, 0);
  g.fillStyle = "#2a3039"; g.fillRect(X(0), Y(0), 94 * S, 50 * S);
  const home = GAME ? COLORS[0] : "#f2b134";
  g.lineWidth = Math.max(1, S * 0.18); g.strokeStyle = "rgba(238,232,218,0.85)";
  g.strokeRect(X(0), Y(0), 94 * S, 50 * S);
  g.beginPath(); g.moveTo(X(47), Y(0)); g.lineTo(X(47), Y(50)); g.stroke();
  g.beginPath(); g.arc(X(47), Y(25), 6 * S, 0, 7); g.stroke();
  for (const side of [0, 1]) {
    const hx = C.HX[side], dir = side === 0 ? 1 : -1, base = side === 0 ? 0 : 94;
    g.save(); g.globalAlpha = 0.28; g.fillStyle = home; g.fillRect(Math.min(X(base), X(base + dir * 19)), Y(17), 19 * S, 16 * S); g.restore();
    g.strokeRect(Math.min(X(base), X(base + dir * 19)), Y(17), 19 * S, 16 * S);
    const a3 = Math.asin(C.C3 / C.R3);
    g.beginPath(); g.moveTo(X(base), Y(3)); g.lineTo(X(base + dir * C.C3X), Y(3));
    if (side === 0) g.arc(X(hx), Y(25), C.R3 * S, -a3, a3); else g.arc(X(hx), Y(25), C.R3 * S, Math.PI + a3, Math.PI - a3, true);
    g.lineTo(X(base), Y(47)); g.stroke();
    if (!GAME || !GAME.rules || GAME.rules.four !== false) {
      g.save(); g.beginPath(); g.rect(X(0), Y(0), 94 * S, 50 * S); g.clip();
      g.strokeStyle = "#f2b134"; g.lineWidth = Math.max(1.5, S * 0.3); g.setLineDash([S * 1.2, S * 0.8]);
      g.beginPath(); if (side === 0) g.arc(X(hx), Y(25), C.R4 * S, -Math.PI / 2, Math.PI / 2); else g.arc(X(hx), Y(25), C.R4 * S, Math.PI / 2, Math.PI * 1.5);
      g.stroke(); g.restore();
    }
    g.strokeStyle = "#ff7a1a"; g.lineWidth = Math.max(1.5, S * 0.25); g.beginPath(); g.arc(X(hx), Y(25), 0.75 * S, 0, 7); g.stroke();
    g.strokeStyle = "rgba(238,232,218,0.85)"; g.lineWidth = Math.max(1, S * 0.18);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function draw2D(tick) {
  if (!bg || !bg.width || !cv.width) return;
  ctx.drawImage(bg, 0, 0);
  if (!GAME) return;
  const ff = tick / 2, f0 = Math.min(GAME.nFrames - 1, Math.floor(ff)), f1 = Math.min(GAME.nFrames - 1, f0 + 1), a = ff - f0;
  const F = GAME.frames, o0 = f0 * FS, o1 = f1 * FS;
  const ents = [];
  for (let k = 0; k < 10; k++) {
    const b0 = o0 + k * PO, b1 = o1 + k * PO, t = F[b0 + 3] === F[b1 + 3] ? a : 0;
    ents.push({ x: lerp(F[b0], F[b1], t), y: lerp(F[b0 + 1], F[b1 + 1], t), z: lerp(F[b0 + 2], F[b1 + 2], t), idx: F[b0 + 3], fl: F[b0 + 4], team: k < 5 ? 0 : 1 });
  }
  const ball = { x: lerp(F[o0 + BO], F[o1 + BO], a), y: lerp(F[o0 + BO + 1], F[o1 + BO + 1], a), z: lerp(F[o0 + BO + 2], F[o1 + BO + 2], a) };
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  for (const e of ents) { ctx.beginPath(); ctx.ellipse(SX(e.x, e.y), SY(e.x, e.y), 1.2 * S, 0.8 * S, 0, 0, 7); ctx.fill(); }
  ents.sort((p, q) => p.z - q.z);
  for (const e of ents) {
    const R = GAME.roster[e.idx], px = SX(e.x, e.y), py = SY(e.x, e.y) - e.z * 0.35 * S, r = (1.25 + e.z * 0.07) * S;
    ctx.save();
    if (e.fl & 1) { ctx.globalAlpha = 0.6; ctx.translate(px, py); ctx.scale(1.35, 0.6); ctx.translate(-px, -py); }
    ctx.fillStyle = COLORS[e.team]; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    ctx.lineWidth = (e.fl & 6) ? Math.max(2, S * 0.35) : Math.max(1, S * 0.18);
    ctx.strokeStyle = (e.fl & 4) ? "#ff4d4d" : (e.fl & 2) ? "#ffffff" : (e.fl & 8) ? "#ffd166" : "rgba(0,0,0,0.55)"; ctx.stroke();
    ctx.fillStyle = TXT[e.team]; ctx.font = `700 ${Math.max(8, Math.round(r * 1.05))}px Oswald, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(R.num, px, py + r * 0.05); ctx.restore();
  }
  const br = Math.max(3, (0.62 + ball.z * 0.045) * S), bx = SX(ball.x, ball.y), by = SY(ball.x, ball.y) - ball.z * 0.35 * S;
  ctx.fillStyle = "#e9761f"; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
}

// ---------- TV graphics ----------
function frameVals(tick) {
  const f = Math.min(GAME.nFrames - 1, Math.floor((tick === undefined ? V.tick : tick) / 2)), o = f * FS + MO, F = GAME.frames;
  return { clock: F[o], shot: F[o + 1], per: F[o + 2], s0: F[o + 3], s1: F[o + 4], off: F[o + 5], phase: F[o + 6] };
}
function updateBug() {
  if (!GAME) return;
  const v = frameVals(), H = TB[GAME.home], A = TB[GAME.away];
  const fin = V.tick >= GAME.ticks - 2;
  // away team listed first, like TV
  $("bug").innerHTML =
    `<div class="bt" style="--c:${COLORS[1]};--t:${TXT[1]}"><span class="ab">${A.id}</span><span class="sc">${v.s1}</span>${v.off === 1 && !fin ? '<i class="poss"></i>' : ""}</div>` +
    `<div class="bt" style="--c:${COLORS[0]};--t:${TXT[0]}"><span class="ab">${H.id}</span><span class="sc">${v.s0}</span>${v.off === 0 && !fin ? '<i class="poss"></i>' : ""}</div>` +
    `<div class="bclk">${fin ? "FINAL" + (v.per > 4 ? (v.per === 5 ? "/OT" : "/" + (v.per - 4) + "OT") : "") : perName(v.per) + " " + fmtClock(v.clock)}${!fin && v.shot <= v.clock && v.phase === 0 ? `<b>${Math.ceil(v.shot)}</b>` : ""}</div>` +
    (V.live ? `<div class="blive">LIVE</div>` : "");
}
let l3Timer = 0, coTimer = 0;
function lowerThird(color, title, sub) {
  const el = $("l3"); el.style.setProperty("--c", color);
  el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ""}`; el.classList.add("on");
  clearTimeout(l3Timer); l3Timer = setTimeout(() => el.classList.remove("on"), 3200);
}
function callout(label, col) {
  const el = $("callout"); el.textContent = label; el.style.color = col; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  clearTimeout(coTimer); coTimer = setTimeout(() => el.classList.remove("on"), 1500);
}
// fire graphics and sound for events we just played past
function playEvents(fromTick, toTick) {
  if (!GAME || toTick <= fromTick || toTick - fromTick > 160) return;
  const E = GAME.events, v = frameVals(toTick);
  let pts = null;
  for (const e of E) {
    if (e.tk <= fromTick) continue; if (e.tk > toTick) break;
    const r = e.pid !== undefined ? GAME.roster[e.pid] : null, col = e.team !== undefined ? COLORS[e.team] : "#f2b134";
    const homeTeam = e.team === 0;
    switch (e.type) {
      case "fga":
        if (e.made) {
          pts = pts || boxScore(GAME, e.tk);
          const side = attSideOf(e.team, e.per);
          if (B3) { B3.swish(side); B3.excite(homeTeam ? (e.dunk || e.val === 4 ? 1 : 0.55) : 0.25); }
          if (AUDIO) { AUDIO.swish(); AUDIO.excite(homeTeam ? (e.dunk || e.val === 4 ? 1 : 0.5) : 0.15); if (homeTeam && (e.dunk || e.val === 4)) setTimeout(() => AUDIO.organ(e.tk), 1200); }
          lowerThird(col, `#${r.num} ${esc(r.short)}`, `${pts[e.pid].pts} PTS${e.val === 4 ? " · FOUR!" : e.dunk ? " · DUNK" : ""}`);
        } else if (e.blk !== undefined && e.blk >= 0) { if (B3) B3.excite(0.7); if (AUDIO) AUDIO.excite(0.7); }
        else if (AUDIO && !e.dunk) AUDIO.clank();
        break;
      case "tackle":
        if (e.result === "down") { if (B3) B3.excite(0.9); if (AUDIO) { AUDIO.excite(0.9); AUDIO.whistle(); } lowerThird(col, (e.gang ? "GANG TACKLE · " : "TACKLE · ") + esc(r.short) + (e.gang ? " +" + e.gang.length : ""), "turnover"); }
        else if (e.result === "fumble") { if (B3) B3.excite(1); if (AUDIO) AUDIO.excite(1); lowerThird(col, "FUMBLE · " + esc(r.short), `jarred loose from ${esc(GAME.roster[e.on].short)} · live ball`); }
        else if (e.result === "rough") { if (AUDIO) AUDIO.whistle(); lowerThird(col, "ROUGHING · " + esc(r.short), "hit an airborne player · two shots"); }
        else if (e.result === "late" && AUDIO) AUDIO.whistle();
        break;
      case "recover": if (!e.own) lowerThird(col, "RECOVERED · " + esc(r.short), "turnover"); break;
      case "call": callTag(e, col); break;
      case "adjust": lowerThird(col, "ADJUSTMENT · " + TB[e.team === 0 ? GAME.home : GAME.away].id, adjustText(e)); break;
      case "plan": if (e.team === 1 && e.tk <= 0) showPlanCard(); break;
      case "foul":
        if (AUDIO) AUDIO.whistle();
        if (e.kind === "moving") lowerThird(col, "MOVING SCREEN · " + esc(r.short), "offensive foul · turnover");
        else if (e.kind === "hack") lowerThird(col, "HACK-A-" + esc(GAME.roster[e.on].short.split(" ").pop().toUpperCase()), "sending him to the line on purpose");
        break;
      case "violation": if (AUDIO) AUDIO.whistle(); break;
      case "timeout": if (AUDIO) { AUDIO.whistle(); setTimeout(() => AUDIO.organ(e.tk + 3), 900); } lowerThird(col, "TIMEOUT", esc(TB[e.team === 0 ? GAME.home : GAME.away].city + " " + TB[e.team === 0 ? GAME.home : GAME.away].name)); break;
      case "period_end": if (AUDIO) AUDIO.buzzer(); if (e.per === 2) setTimeout(() => showPlanCard(true), 2500); lowerThird("#f2b134", "END OF " + (e.per <= 4 ? ["1ST", "2ND", "3RD", "4TH"][e.per - 1] : "OT"), `${TB[GAME.away].id} ${e.s1} · ${TB[GAME.home].id} ${e.s0}`); break;
      case "period_start": if (AUDIO && e.tk > 0) AUDIO.organ(e.tk); break;
      case "ft": if (e.made && AUDIO) AUDIO.excite(homeTeam ? 0.2 : 0.05); break;
    }
  }
  for (const n of NOTABLE) if (n.tk > fromTick && n.tk <= toTick) callout(n.label, n.col);
}
function attSideOf(t, per) { return ((t === 0) !== (per >= 3)) ? 1 : 0; }

// ---------- play-by-play & box ----------
function visibleCount() { const E = GAME.events; let lo = 0, hi = E.length; while (lo < hi) { const m = (lo + hi) >> 1; if (E[m].tk <= V.tick) lo = m + 1; else hi = m; } return lo; }
function nm(i) { const r = GAME.roster[i]; return `<b>${esc(r.short)}</b>`; }
function tnm(t) { const tm = TB[t === 0 ? GAME.home : GAME.away]; return esc(tm.city); }
const PT_PHRASE = { trans: " in transition", putback: " on the putback", post: " out of the post", pnr: " off the pick-and-roll", roll: " on the roll", iso: " in isolation", offscr: " coming off a screen", cut: " on the cut", drive: " on the drive" };
const WHY = { fours: "they're getting killed from four", paint: "they can't keep them out of the paint", fouls: "too many late hits", working: "the hits are working", broken: "tackles keep getting broken",
  tackled: "their ball handlers keep getting buried", star: "he's taking over", stuck: "the offense has stalled" };
function adjustText(e) {
  const S = BB.SYSTEMS, SC = BB.SCHEMES, HI = BB.HITS;
  let what;
  if (e.key === "sys") what = `switch to ${S[e.to].name} on offense`;
  else if (e.key === "scheme") what = e.to === "goalie" ? `go to the Goalie: ${esc(GAME.roster[e.pid].short)} stays home` : e.to === "extend" ? "extend out to the four-point line" : e.to === "zone" ? "drop into a zone" : `switch to ${SC[e.to].name}`;
  else if (e.key === "hit") what = e.to === "blitz" ? "start blitzing the ball handler" : e.to === "contain" ? "pull back to Contain tackling" : "stop sending tacklers";
  else if (e.key === "double") what = `start doubling ${esc(GAME.roster[e.pid].short)}`;
  return what + (WHY[e.why] ? ` (${WHY[e.why]})` : "");
}
function callText(e) {
  const P = e.pid >= 0 ? nm(e.pid) : "", W = e.w >= 0 ? nm(e.w) : "";
  switch (e.kind) {
    case "pnr": return `${tnm(e.team)} runs a pick-and-roll for ${P}`;
    case "iso": return `${tnm(e.team)} clears out for ${P}`;
    case "post": return `${tnm(e.team)} goes to ${P} in the post`;
    case "offscr": return `${tnm(e.team)} runs ${P} off screens`;
    case "double": return `${P} comes to double ${W}`;
    case "foul": return `${tnm(e.team)} needs to foul`;
    case "hack": return `${tnm(e.team)} goes hack-a-${W}`;
  }
  return null;
}
function pbpLine(e) {
  switch (e.type) {
    case "tip": return [`${nm(e.pid)} wins the opening tip`, ""];
    case "plan": {
      const S = BB.SYSTEMS[e.off], D = BB.SCHEMES[e.def], H = BB.HITS[e.hit];
      return [`${tnm(e.team)} gameplan: <b>${S.name}</b> offense, <b>${D.name}</b> defense${e.goalie >= 0 && e.def === "goalie" ? ` (${nm(e.goalie)} stays home)` : ""}, <b>${H.name}</b> tackling${e.dbl >= 0 ? `, doubling ${nm(e.dbl)}` : ""}`, "plan"];
    }
    case "adjust": return [`ADJUSTMENT: ${tnm(e.team)} ${adjustText(e)}`, "plan"];
    case "call": { const t = callText(e); return t ? [t, "m call"] : null; }
    case "fga": {
      const kind = e.dunk ? "dunk" : e.layup ? "layup" : e.hook ? `${e.d}-ft hook shot` : e.val === 4 ? `${e.d}-ft four` : e.val === 3 ? `${e.d}-ft three` : `${e.d}-ft jumper`;
      const how = PT_PHRASE[e.pt] || "";
      if (e.gt !== undefined) return [`${nm(e.pid)}'s ${kind} counts. Goaltending on ${nm(e.gt)}`, "hot"];
      if (e.ci !== undefined) return [`${nm(e.pid)}'s ${kind} counts. ${nm(e.ci)}'s hand went through the cylinder`, "hot"];
      if (e.blk !== undefined && e.blk >= 0) return [e.swat ? `SWAT! ${nm(e.blk)} slaps ${nm(e.pid)}'s ${kind} off the rim` : `${nm(e.blk)} blocks ${nm(e.pid)}'s ${kind}${how}`, "hot"];
      if (e.made && e.pt === "lob") return [`ALLEY-OOP! ${e.ast >= 0 ? nm(e.ast) + " lobs it and " : ""}${nm(e.pid)} throws it down`, "score hot"];
      if (e.made) return [`${nm(e.pid)} ${e.dunk ? "throws it down" : e.layup ? "lays it in" : "hits the " + kind}${how}${e.ast >= 0 ? ` <span class="m">(${esc(GAME.roster[e.ast].short)} assist)</span>` : ""}`, e.val === 4 || e.dunk ? "score hot" : "score"];
      return [`${nm(e.pid)} misses the ${kind}${how}`, ""];
    }
    case "recover": return [e.own ? `${nm(e.pid)} falls on the loose ball` : `${nm(e.pid)} scoops up the fumble. Turnover`, e.own ? "" : "hot"];
    case "ft": return [`${nm(e.pid)} ${e.made ? "makes" : "misses"} free throw ${e.n} of ${e.of}`, e.made ? "score" : ""];
    case "reb": return [`${nm(e.pid)} ${e.off ? "offensive" : "defensive"} rebound`, "m"];
    case "to":
      if (e.kind === "steal") return [`${nm(e.by)} picks off ${nm(e.pid)}'s pass`, ""];
      if (e.kind === "loose") return [`${nm(e.by)} comes up with the loose ball`, ""];
      if (e.kind === "oob") return [`${nm(e.pid)} turns it over out of bounds`, ""];
      if (e.kind === "shotclock") return [`Shot clock violation`, ""];
      return null; // tackles, fumbles and moving screens have their own lines
    case "tackle":
      if (e.result === "down" && e.gang) return [`GANG TACKLE! ${nm(e.pid)} and ${e.gang.map(nm).join(" and ")} bury ${nm(e.on)}. Turnover`, "hot"];
      if (e.result === "down") return [`TACKLE! ${nm(e.pid)} puts ${nm(e.on)} on the rubber. Turnover`, "hot"];
      if (e.result === "fumble") return [`FUMBLE! ${nm(e.pid)}${e.gang ? " and " + e.gang.map(nm).join(" and ") : ""} jar it loose from ${nm(e.on)}. Live ball`, "hot"];
      if (e.result === "rough") return [`ROUGHING. ${nm(e.pid)} hits ${nm(e.on)} in the air. Two shots`, "hot"];
      if (e.result === "broken") return [`${nm(e.on)} shrugs off ${e.gang ? (e.gang.length + 1) + " tacklers" : nm(e.pid) + "'s tackle"}`, ""];
      if (e.result === "whiff") return [`${nm(e.pid)} whiffs on the tackle`, "m"];
      if (e.result === "late") return [`LATE HIT. ${nm(e.pid)} tackles ${nm(e.on)} after the ball is gone`, "hot"];
      return null;
    case "foul":
      if (e.kind === "moving") return [`Moving screen on ${nm(e.pid)}. Offensive foul, turnover <span class="m">(${e.pf} PF)</span>`, "m"];
      if (e.kind === "intentional") return [`${nm(e.pid)} fouls ${nm(e.on)} on purpose to stop the clock <span class="m">(${e.pf} PF)</span>`, "m"];
      if (e.kind === "hack") return [`${nm(e.pid)} grabs ${nm(e.on)} away from the ball. Hack-a-${esc(GAME.roster[e.on].short.split(" ").pop())} <span class="m">(${e.pf} PF)</span>`, "m"];
      if (e.kind === "roughing") return null;
      return [`Foul on ${nm(e.pid)} <span class="m">(${e.pf} PF${e.kind === "shooting" ? ", shooting" : ""})</span>`, "m"];
    case "fouledout": return [`${nm(e.pid)} has fouled out`, "hot"];
    case "timeout": return [`Timeout, ${esc(TB[e.team === 0 ? GAME.home : GAME.away].name)}`, "m"];
    case "sub": return [`${nm(e.inn)} checks in for ${nm(e.out)}${e.why === "fouls" ? " <span class=\"m\">(foul trouble)</span>" : e.why === "closer" ? " <span class=\"m\">(closing lineup)</span>" : e.why === "hack" ? " <span class=\"m\">(getting him away from the hack)</span>" : ""}`, "m sub"];
    case "period_end": return [`End of ${perName(e.per)}`, "sep"];
    case "final": return [`FINAL`, "sep"];
  }
  return null;
}
function renderPBP(n) {
  const E = GAME.events, out = [], showSubs = $("subs").checked, showCalls = !$("calls") || $("calls").checked;
  for (let i = n - 1; i >= 0 && out.length < 250; i--) {
    const e = E[i]; if (e.type === "sub" && !showSubs) continue; if (e.type === "call" && !showCalls) continue;
    const L = pbpLine(e); if (!L) continue;
    const t = e.team !== undefined ? e.team : -1;
    out.push(`<li class="${L[1]}"><span class="t">${perName(e.per)} ${fmtClock(e.clk)}</span><i style="background:${t >= 0 ? COLORS[t] : "transparent"}"></i><span class="x">${L[0]}</span><span class="s">${e.s1}-${e.s0}</span></li>`);
  }
  $("pbp-list").innerHTML = out.join("") || `<li class="m"><span class="x">Waiting for tip-off…</span></li>`;
}
function renderBox() {
  const v = frameVals();
  const S = boxScore(GAME, V.tick, v.per, v.clock);
  let html = "";
  for (const t of [1, 0]) {
    const tm = TB[t === 0 ? GAME.home : GAME.away];
    const rows = S.filter(s => s.t === t);
    const tot = rows.reduce((a, s) => { for (const k in s) if (typeof s[k] === "number") a[k] = (a[k] || 0) + s[k]; return a; }, {});
    const line = (name, s, cls) => `<tr class="${cls || ""}"><td class="pn">${name}</td><td>${s.played === false ? (V.tick >= GAME.ticks ? "DNP" : "–") : Math.floor(s.secs / 60)}</td><td class="b">${s.pts}</td><td>${s.oreb + s.dreb}</td><td>${s.ast}</td><td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.fpm}-${s.fpa}</td><td>${s.ftm}-${s.fta}</td><td>${s.tkl}</td><td>${s.btk}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.to}</td><td>${s.pf}</td></tr>`;
    html += `<h3 style="--c:${COLORS[t]}">${esc(tm.city)} ${esc(tm.name)}</h3><div class="tw"><table class="box"><thead><tr><th class="pn">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>3P</th><th>4P</th><th>FT</th><th title="Tackles (turnovers forced)">TKL</th><th title="Broken tackles">BTK</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>`;
    for (const s of rows) { const r = GAME.roster[s.idx]; html += line(`<span class="num">${r.num}</span>${typeof pcQuick === "function" && GAME.season ? `<a class="plq" tabindex="0" data-pid="${r.id}" data-season="${GAME.season}" title="Player card">${esc(r.short)}</a>` : esc(r.short)} <span class="m">${r.role === "SNIPER" ? "SN" : r.role === "BRUISER" ? "BR" : r.role}</span>`, s, r.starter ? "st" : ""); }
    tot.played = true;
    html += line("<b>Team</b>", tot, "tot") + `</tbody></table></div>`;
  }
  $("box-tables").innerHTML = html;
}

// ---------- strategy: gameplans, adjustments, how each team is scoring and hitting ----------
const TAG = { pnr: "PICK & ROLL", iso: "ISOLATION", post: "POST UP", offscr: "OFF SCREENS", double: "DOUBLE TEAM", foul: "FOULING", hack: "HACK" };
let ctTimer = 0;
function callTag(e, col) {
  const el = $("calltag"); if (!el || !TAG[e.kind] || ($("plancard") && $("plancard").classList.contains("on"))) return;
  const who = e.kind === "double" || e.kind === "hack" ? e.w : e.pid, r = who >= 0 ? GAME.roster[who] : null;
  el.style.setProperty("--c", col);
  el.innerHTML = `<b>${TAG[e.kind]}</b>${r ? `<span>#${r.num} ${esc(r.short.split(" ").pop().toUpperCase())}</span>` : ""}`;
  el.classList.add("on"); clearTimeout(ctTimer); ctTimer = setTimeout(() => el.classList.remove("on"), 2600);
}
function planOf(t, upto) { const R = strategyReport(GAME, upto === undefined ? 1e12 : upto); return R[t]; }
function curPlan(t, upto) {
  const R = planOf(t, upto), p = R.plan; if (!p) return null;
  const cur = { off: p.off, def: p.def, hit: p.hit, dbl: p.dbl, goalie: p.goalie, pace: p.pace, crash: p.crash, leak: p.leak };
  for (const a of R.adjust) { if (a.key === "sys") { cur.off = a.to; if (a.pace !== undefined) { cur.pace = a.pace; cur.crash = a.crash; cur.leak = a.leak; } } if (a.key === "scheme") { cur.def = a.to; if (a.to === "goalie") cur.goalie = a.pid; } if (a.key === "hit") cur.hit = a.to; if (a.key === "double") cur.dbl = a.pid; }
  return { p, cur, R };
}
let pcTimer = 0;
function showPlanCard(half) {
  const el = $("plancard"); if (!el || !GAME) return;
  const rows = [1, 0].map(t => {
    const x = curPlan(t, half ? V.tick : 0); if (!x) return "";
    const tm = TB[t === 0 ? GAME.home : GAME.away], c = x.cur;
    const coach = GAME.coachNames && GAME.coachNames[t] ? `<small>Coach ${esc(GAME.coachNames[t])}</small>` : "";
    const changes = half ? x.R.adjust.filter(a => a.tk <= V.tick).map(a => `<li>${adjustText(a)}</li>`).join("") : "";
    return `<div class="pc" style="--c:${COLORS[t]}"><div class="pch"><b>${esc(tm.city)} ${esc(tm.name)}</b>${coach}</div>
      <div class="pcg"><span>Offense</span><b>${BB.SYSTEMS[c.off].name}</b><span>Defense</span><b>${BB.SCHEMES[c.def].name}${c.def === "goalie" && c.goalie >= 0 ? ` <i>${esc(GAME.roster[c.goalie].short)} stays home</i>` : ""}</b>
      <span>Tackling</span><b>${BB.HITS[c.hit].name}</b><span>Go-to guy</span><b>${esc(GAME.roster[x.p.star].short)}</b>${c.dbl >= 0 ? `<span>Doubling</span><b>${esc(GAME.roster[c.dbl].short)}</b>` : ""}</div>
      ${half ? (changes ? `<ul class="pcx">${changes}</ul>` : `<p class="pcx">No changes at the half.</p>`) : ""}</div>`;
  }).join("");
  el.innerHTML = `<div class="pct">${half ? "HALFTIME ADJUSTMENTS" : "TONIGHT'S GAMEPLANS"}</div>${rows}`;
  el.classList.add("on"); clearTimeout(pcTimer); pcTimer = setTimeout(() => el.classList.remove("on"), half ? 9000 : 8000);
}
function renderStrategy() {
  const el = $("strat-body"); if (!el || !GAME) return;
  const R = strategyReport(GAME, V.tick), PT = BB.PT_LABEL;
  let h = "";
  // gameplans side by side
  h += `<div class="sgrid">` + [1, 0].map(t => {
    const x = curPlan(t, V.tick); if (!x) return "";
    const tm = TB[t === 0 ? GAME.home : GAME.away], p = x.p, c = x.cur, opp = curPlan(1 - t, V.tick);
    const S = BB.SYSTEMS[c.off], D = BB.SCHEMES[c.def], H = BB.HITS[c.hit];
    const pace = c.pace > 0.35 ? "pushes the pace" : c.pace < -0.25 ? "walks it up" : "balanced pace";
    const glass = ["nobody crashes the glass", "one man on the glass", "two on the glass", "three on the glass"][c.crash] || "";
    const stopOn = opp ? opp.p.star : -1;
    return `<div class="splan" style="--c:${COLORS[t]}"><h4>${esc(tm.city)} ${esc(tm.name)}${GAME.coachNames && GAME.coachNames[t] ? ` <small>Coach ${esc(GAME.coachNames[t])}</small>` : ""}</h4>
      <dl><dt>Offense</dt><dd><b>${S.name}</b> <span class="m">${S.blurb}; ${pace}; ${glass}${c.leak ? "; leaks out for the outlet" : ""}</span></dd>
      <dt>Defense</dt><dd><b>${D.name}</b> <span class="m">${D.blurb}</span>${c.def === "goalie" && c.goalie >= 0 ? ` · ${nm(c.goalie)} stays home` : ""}</dd>
      <dt>Tackling</dt><dd><b>${H.name}</b> <span class="m">${H.blurb}</span></dd>
      <dt>Assignments</dt><dd>Go-to guy ${nm(p.star)}${p.hitman >= 0 ? ` · hit man ${nm(p.hitman)}` : ""}${p.stopper >= 0 && stopOn >= 0 ? ` · ${nm(p.stopper)} on ${nm(stopOn)}` : ""}${c.dbl >= 0 ? ` · doubling ${nm(c.dbl)}` : ""}</dd></dl>
      ${x.R.adjust.length ? `<ul class="sadj">${x.R.adjust.map(a => `<li><span class="t">${perName(a.per)} ${fmtClock(a.clk)}</span> ${adjustText(a)}</li>`).join("")}</ul>` : ""}</div>`;
  }).join("") + `</div>`;
  // how they're scoring
  const keys = Object.keys(PT).filter(k => R[0].pts[k] || R[1].pts[k] || R[0].att[k] || R[1].att[k]);
  keys.sort((a, b) => ((R[0].pts[b] || 0) + (R[1].pts[b] || 0)) - ((R[0].pts[a] || 0) + (R[1].pts[a] || 0)));
  const A = TB[GAME.away].id, Hm = TB[GAME.home].id;
  h += `<h3>How they're scoring</h3><div class="tw"><table class="box strat"><thead><tr><th class="pn">Play type</th><th>${A} pts</th><th>${A} shots</th><th>${Hm} pts</th><th>${Hm} shots</th></tr></thead><tbody>`;
  for (const k of keys) h += `<tr><td class="pn">${PT[k]}</td><td class="b">${R[1].pts[k] || 0}</td><td>${R[1].att[k] || 0}</td><td class="b">${R[0].pts[k] || 0}</td><td>${R[0].att[k] || 0}</td></tr>`;
  h += `</tbody></table></div>`;
  // the hitting
  const tk = t => R[t].tk, f = (t, k) => R[t].fouls[k] || 0;
  h += `<h3>Tackling</h3><div class="tw"><table class="box strat"><thead><tr><th class="pn"></th><th>${A}</th><th>${Hm}</th></tr></thead><tbody>
    <tr><td class="pn">Tackles for a turnover</td><td class="b">${tk(1).down}</td><td class="b">${tk(0).down}</td></tr>
    <tr><td class="pn">Fumbles forced / recovered</td><td>${tk(1).fumble} / ${R[1].recov}</td><td>${tk(0).fumble} / ${R[0].recov}</td></tr>
    <tr><td class="pn">Gang tackles</td><td>${tk(1).gang}</td><td>${tk(0).gang}</td></tr>
    <tr><td class="pn">Broken tackles allowed</td><td>${tk(1).broken}</td><td>${tk(0).broken}</td></tr>
    <tr><td class="pn">Whiffs</td><td>${tk(1).whiff}</td><td>${tk(0).whiff}</td></tr>
    <tr><td class="pn">Late hits / roughing</td><td>${tk(1).late} / ${tk(1).rough}</td><td>${tk(0).late} / ${tk(0).rough}</td></tr>
    <tr><td class="pn">Play calls (P&amp;R / iso / post / screens)</td><td>${R[1].calls.pnr || 0} / ${R[1].calls.iso || 0} / ${R[1].calls.post || 0} / ${R[1].calls.offscr || 0}</td><td>${R[0].calls.pnr || 0} / ${R[0].calls.iso || 0} / ${R[0].calls.post || 0} / ${R[0].calls.offscr || 0}</td></tr>
    <tr><td class="pn">Doubles / intentional fouls / hacks</td><td>${R[1].calls.double || 0} / ${f(1, "intentional")} / ${f(1, "hack")}</td><td>${R[0].calls.double || 0} / ${f(0, "intentional")} / ${f(0, "hack")}</td></tr>
    </tbody></table></div>`;
  // personnel
  h += `<h3>Personnel</h3><div class="sgrid">` + [1, 0].map(t => {
    const x = curPlan(t, 0), rot = x ? x.p.rot : [], jobs = new Map(x ? x.p.jobs : []);
    return `<div class="splan" style="--c:${COLORS[t]}"><ul class="pers">${rot.map(i => { const r = GAME.roster[i]; return `<li><span class="num">${r.num}</span>${esc(r.short)} <span class="m">${r.role === "SNIPER" ? "SN" : r.role === "BRUISER" ? "BR" : r.role}</span> <b>${BB.ARCH[r.arch] ? BB.ARCH[r.arch].name : ""}</b> <span class="m">· ${BB.DARCH[r.darch] || ""}${jobs.has(i) && jobs.get(i) !== "space" ? " · " + BB.JOBS[jobs.get(i)] : ""}</span></li>`; }).join("")}</ul></div>`;
  }).join("") + `</div>`;
  el.innerHTML = h;
}

// ---------- channels: several games on one clock ----------
function renderChannels() {
  if (!V.channels) { $("channels").hidden = true; return; }
  $("channels").hidden = false;
  $("channels").innerHTML = V.channels.map((c, i) => {
    const g = c.game, f = Math.min(g.nFrames - 1, Math.floor(V.tick / 2)), o = f * FS + MO, F = g.frames;
    const fin = V.tick >= g.ticks - 2;
    return `<button class="chn ${i === V.ch ? "on" : ""}" data-ch="${i}"><span class="cn">CH ${i + 1}</span><span><i style="background:${c.colors[1]}"></i>${c.away} <b>${F[o + 4]}</b></span><span><i style="background:${c.colors[0]}"></i>${c.home} <b>${F[o + 3]}</b></span><span class="cs">${fin ? "FINAL" : perName(F[o + 2]) + " " + fmtClock(F[o])}</span></button>`;
  }).join("");
  document.querySelectorAll(".chn").forEach(b => b.onclick = () => flip(+b.dataset.ch));
}
function useGame(game, colors) {
  GAME = game; COLORS = colors; TXT = COLORS.map(c => lum(c) > 0.55 ? "#111" : "#fff");
  NOTABLE = buildNotable(GAME); V.visCount = -1; V.boxAt = -1; V.replay = null;
  if (B3) B3.setGame(GAME, TB[GAME.home], TB[GAME.away], COLORS);
  drawCourtBg();
}
function flip(i) {
  if (!V.channels) return;
  V.ch = (i + V.channels.length) % V.channels.length;
  const c = V.channels[V.ch]; useGame(c.game, c.colors);
  $("seed").innerHTML = c.note; updateAll(true); renderChannels();
}
function simulate(row, seasonData) {
  const [gid, day, h, a, seed, hs, as, per, type, hl, al, hc, ac] = row;
  const ps = seasonData.players, co = seasonData.coaches || {};
  const tactics = hc !== undefined && co[hc] ? [co[hc].tac, co[ac].tac] : undefined;
  const game = simulateGame({ id: h }, { id: a }, [hl.map(id => ps[id]), al.map(id => ps[id])], seed, { tactics, season: seasonData.season });
  game.coachNames = [co[hc] ? co[hc].name : "", co[ac] ? co[ac].name : ""];
  game.season = seasonData.season;
  const match = game.score[0] === hs && game.score[1] === as;
  game.note = `${seasonData.season} ${type ? "playoffs" : "day " + (day + 1)} · seed ${seed} · ${match ? '<span class="ok">✓ replay matches the record</span>' : `<span class="bad">replay differs from the record (engine ${ENGINE_VERSION} vs ${seasonData.engineVersion})</span>`}`;
  return game;
}
// Replay a stored game: same seed + same lineups + same coaches + same engine = the same game.
function loadGame(row, seasonData) {
  V.playing = false; V.channels = null; V.live = false; renderChannels(); resize();
  $("bc-overlay").textContent = "Replaying from the record…"; $("bc-overlay").hidden = false;
  setTimeout(() => {
    const game = simulate(row, seasonData);
    useGame(game, teamColors(row[2], row[3]));
    V.tick = 0; V.lastFx = 0; $("scrub").max = game.ticks; $("scrub").value = 0;
    $("seed").innerHTML = game.note;
    $("bc-overlay").hidden = true; updateAll(true);
    V.playing = true; setPlayBtn(); showPlanCard();
  }, 30);
}
// Load several games (one day's slate) to air together.
function loadChannels(rows, seasonData) {
  V.playing = false; resize();
  $("bc-overlay").textContent = `Tuning in ${rows.length} games…`; $("bc-overlay").hidden = false;
  const chans = []; let i = 0;
  const next = () => {
    if (i < rows.length) {
      const row = rows[i++], game = simulate(row, seasonData);
      chans.push({ game, colors: teamColors(row[2], row[3]), home: row[2], away: row[3], note: game.note });
      $("bc-overlay").textContent = `Tuning in game ${i} of ${rows.length}…`;
      setTimeout(next, 10); return;
    }
    V.channels = chans; V.ch = 0; V.live = true; V.speed = 1; document.querySelectorAll(".spd button").forEach(x => x.classList.toggle("on", x.dataset.s === "1"));
    V.tick = 0; V.lastFx = 0; $("scrub").max = Math.max(...chans.map(c => c.game.ticks)); $("scrub").value = 0;
    flip(0); $("bc-overlay").hidden = true; V.playing = true; setPlayBtn();
  };
  setTimeout(next, 30);
}

// ---------- main loop ----------
function updateAll(force) {
  if (!GAME) return;
  updateBug();
  const n = visibleCount();
  if (n !== V.visCount || force) { V.visCount = n; if (!$("bc-pbp").hidden) renderPBP(n); }
  if (!$("bc-box").hidden && (force || Math.abs(V.tick - V.boxAt) >= 20)) { V.boxAt = V.tick; renderBox(); }
  if ($("bc-strat") && !$("bc-strat").hidden && (force || Math.abs(V.tick - (V.stratAt || -1e9)) >= 40)) { V.stratAt = V.tick; renderStrategy(); }
  $("scrub").value = V.tick;
  if (V.channels) renderChannels();
  $("replayTag").hidden = !V.replay;
}
function maxTicks() { return V.channels ? Math.max(...V.channels.map(c => c.game.ticks)) : GAME.ticks; }
function maybeReplay() {
  if (!V.autoReplay || V.live || V.replay || !V.view3d || V.speed > 4) return;
  const ph = frameVals().phase;
  if (ph === 0) return; // only during a stoppage
  for (let i = NOTABLE.length - 1; i >= 0; i--) {
    const n = NOTABLE[i];
    if (n.tk > V.tick) continue;
    if (V.tick - n.tk > 80) break;
    if (n.big >= 2 && !n.replayed && n.tk - V.lastReplayTk > 600) { n.replayed = true; V.lastReplayTk = n.tk; V.replay = { t: Math.max(0, n.tk - 46), to: n.tk + 16 }; return; }
  }
}
function loop(ts) {
  const dt = Math.min(0.1, (ts - (V.last || ts)) / 1000); V.last = ts;
  if (GAME && V.playing) {
    if (V.replay) {
      V.replay.t += dt * 20 * 0.45;
      if (V.replay.t >= V.replay.to) { V.replay = null; }
    } else {
      const before = V.tick;
      V.tick += dt * 20 * V.speed;
      const mt = maxTicks();
      if (V.tick >= mt) { V.tick = mt; V.playing = false; setPlayBtn(); }
      playEvents(before, V.tick);
      maybeReplay();
    }
    updateAll(false);
  }
  if (GAME && V.view3d && B3) B3.render(V.replay ? V.replay.t : V.tick, { replay: !!V.replay });
  else draw2D(V.tick);
  requestAnimationFrame(loop);
}
function setPlayBtn() { $("play").textContent = V.playing ? "❚❚" : "▶"; }
function setView(mode) {
  V.view3d = mode !== "tactical" && !!B3;
  $("court3d").hidden = !V.view3d; $("court").hidden = V.view3d;
  if (B3 && V.view3d) B3.setCamera(mode);
  resize(); updateAll(true);
}
function initBroadcast() {
  try { if (window.Broadcast3D && Broadcast3D.supported()) { B3 = Broadcast3D.create($("court3d"), $("courtwrap")); AUDIO = Broadcast3D.makeAudio(); } } catch (e) { console.warn("3D unavailable", e); B3 = null; }
  if (!B3) { V.view3d = false; $("court3d").hidden = true; $("court").hidden = false; $("cam").value = "tactical"; $("cam").disabled = true; }
  resize(); window.addEventListener("resize", resize);
  $("play").onclick = () => { if (!GAME) return; if (V.tick >= maxTicks()) V.tick = 0; V.playing = !V.playing; setPlayBtn(); };
  $("rew").onclick = () => { if (!GAME) return; V.replay = null; V.tick = Math.max(0, V.tick - 200); V.live = false; V.visCount = -1; updateAll(true); };
  $("end").onclick = () => { if (!GAME) return; V.replay = null; V.tick = maxTicks(); V.playing = false; V.live = false; setPlayBtn(); V.visCount = -1; updateAll(true); };
  $("scrub").oninput = e => { if (!GAME) return; V.replay = null; V.tick = +e.target.value; V.live = false; updateAll(true); };
  $("subs").onchange = () => { V.visCount = -1; updateAll(true); };
  if ($("calls")) $("calls").onchange = () => { V.visCount = -1; updateAll(true); };
  if ($("plans")) $("plans").onclick = () => { const el = $("plancard"); if (el.classList.contains("on")) el.classList.remove("on"); else showPlanCard(frameVals().per >= 3); };
  $("cam").onchange = e => setView(e.target.value);
  $("snd").onclick = () => { if (!AUDIO) return; const on = AUDIO.toggle(); $("snd").textContent = on ? "🔊" : "🔈"; $("snd").classList.toggle("on", on); };
  $("rpl").onclick = () => { V.autoReplay = !V.autoReplay; $("rpl").classList.toggle("on", V.autoReplay); if (!V.autoReplay) V.replay = null; };
  $("fs").onclick = () => { const el = $("courtwrap"); try { if (document.fullscreenElement) document.exitFullscreen(); else (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (e) {} };
  document.addEventListener("fullscreenchange", () => setTimeout(resize, 50));
  document.querySelectorAll(".spd button").forEach(b => b.onclick = () => { V.speed = +b.dataset.s; V.live = V.channels ? V.speed === 1 : false; document.querySelectorAll(".spd button").forEach(x => x.classList.toggle("on", x === b)); });
  document.querySelectorAll(".bctabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".bctabs button").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll(".bctab").forEach(s => s.hidden = s.id !== "bc-" + b.dataset.t);
    V.visCount = -1; updateAll(true);
  });
  // swipe to change channel
  let sx = null;
  $("courtwrap").addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  $("courtwrap").addEventListener("touchend", e => { if (sx === null || !V.channels) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) flip(V.ch + (dx < 0 ? 1 : -1)); sx = null; });
  document.addEventListener("keydown", e => { if (!V.channels) return; if (e.key === "ArrowRight") flip(V.ch + 1); if (e.key === "ArrowLeft") flip(V.ch - 1); });
  requestAnimationFrame(loop);
}
