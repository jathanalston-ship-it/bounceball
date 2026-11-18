// ===================== BROADCAST CONTROLLER =====================
// Plays recorded games like a TV broadcast: pregame intro, 3D game (or the 2D tactical view),
// scorebug, lower thirds, slow motion, multi-angle instant replays, top-plays reel, quarter-break
// and final cards, an optional announcer, and a three-channel mode on one shared clock.
"use strict";
const TB = {}; BB.TEAMS.forEach(t => TB[t.id] = t);
const $ = id => document.getElementById(id);
const FS = C.FS, PO = 8, BO = 80, MO = 85; // frame layout: players x8, ball at 80, game state at 85
let GAME = null, COLORS = ["#fff", "#000"], TXT = ["#000", "#fff"], NOTABLE = [];
const V = { tick: 0, playing: false, speed: 2, last: 0, visCount: -1, boxAt: -1, view3d: true, replay: null, reel: null, autoReplay: true, channels: null, ch: 0, live: false, lastReplayTk: -1e9,
  intro: null, hold: 0, card: null, ftShown: -1, ctx: null, qMode: "auto", fps: { n: 0, t: 0 }, marksAt: -1 };
let B3 = null, AUDIO = null;

function lum(hex) { const n = parseInt(hex.slice(1), 16); const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function cdist(a, b) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs((x >> 8 & 255) - (y >> 8 & 255)) + Math.abs((x & 255) - (y & 255)); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perName(p) { return p <= 4 ? "Q" + p : (p === 5 ? "OT" : (p - 4) + "OT"); }
function perLong(p) { return p <= 4 ? ["1ST", "2ND", "3RD", "4TH"][p - 1] : p === 5 ? "OT" : (p - 4) + "OT"; }
function fmtClock(c) { c = Math.max(0, c); if (c < 60) return c.toFixed(1); const m = Math.floor(c / 60), s = Math.floor(c % 60); return m + ":" + String(s).padStart(2, "0"); }
// rafters: the home team's titles (newest first) and retired numbers, from the league's real history
function bannersFor(home, season) {
  const lg = typeof D !== "undefined" && D.lg ? D.lg : null, pl = typeof D !== "undefined" && D.pl ? D.pl : null; if (!lg) return [];
  const titles = (lg.champions || []).filter(c => c.champ === home && c.season < season).sort((a, b) => b.season - a.season).slice(0, 9).map(c => ({ kind: "title", year: c.season }));
  const retired = pl ? Object.values(pl).filter(p => p.hof && p.retired && p.retired < season && (p.teams || []).includes(home) && p.num != null).sort((a, b) => b.ovr - a.ovr).slice(0, 3).map(p => ({ kind: "retired", num: p.num, name: p.name.split(" ").slice(-1)[0] })) : [];
  return [...titles, ...retired];
}
function teamColors(h, a) { const c0 = TB[h].c1; let c1 = TB[a].c1; if (cdist(c0, c1) < 140) c1 = TB[a].c2; return [c0, c1]; }
const teamOf = t => TB[t === 0 ? GAME.home : GAME.away];
const lastName = i => GAME.roster[i].name.split(" ").slice(-1)[0];
const ptsOf = e => e.type === "fga" && e.made ? e.val : e.type === "ft" && e.made ? 1 : 0;
function attSideOf(t, per) { return ((t === 0) !== (per >= 3)) ? 1 : 0; }

// ---------- notable moments, ranked by impact ----------
function buildNotable(game) {
  const out = [], E = game.events;
  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    let label = null, col = "#fff", big = 0;
    if (e.type === "tackle" && e.result === "down" && e.gang) { label = "GANG TACKLE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "down") { label = "TACKLE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "fumble") { label = "FUMBLE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "rough") { label = "ROUGHING"; col = "#ffb703"; big = 1; }
    else if (e.type === "fga" && e.made && e.pt === "lob") { label = "ALLEY-OOP!"; col = "#fff"; big = 3; }
    else if (e.type === "tackle" && e.result === "late") { label = "LATE HIT"; col = "#ffb703"; big = 1; }
    else if (e.type === "tackle" && e.result === "broken") { label = "BROKE THE TACKLE"; col = "#7cf"; big = 1; }
    else if (e.type === "fga" && e.gt !== undefined) { label = "GOALTENDING"; col = "#ffb703"; big = 1; }
    else if (e.type === "fga" && e.ci !== undefined) { label = "CYLINDER!"; col = "#ffb703"; big = 1; }
    else if (e.type === "fga" && e.blk !== undefined && e.blk >= 0) { label = e.swat ? "SWAT!" : "REJECTED"; col = "#9ef01a"; big = e.swat ? 3 : 2; }
    else if (e.type === "fga" && e.made && e.val === 4) { label = "FOUR!"; col = "#f2b134"; big = 3; }
    else if (e.type === "fga" && e.made && e.dunk) { label = "SLAM"; col = "#fff"; big = 2; }
    // impact: how big the play was, plus when it happened (late and close counts most)
    let bonus = 0;
    const late = e.per >= 4 && e.clk <= 120, close = Math.abs(e.s0 - e.s1) <= 8;
    if (e.type === "fga" && e.made) {
      const lb = (e.team === 0 ? e.s0 - e.s1 : e.s1 - e.s0) - e.val, la = lb + e.val;
      const clutch = late && Math.abs(lb) <= 6, lead = lb <= 0 && la > 0;
      let buzzer = false; for (let j = i + 1; j < E.length && E[j].tk - e.tk < 30; j++) if (E[j].type === "period_end") buzzer = e.clk < 2;
      if (buzzer) { label = "BUZZER-BEATER!"; col = "#f2b134"; big = 3; bonus += 8; }
      else if (clutch && lead) { if (!label) { label = lb === 0 ? "GO-AHEAD" : "LEAD CHANGE"; col = "#6ec6ff"; big = 2; } bonus += 5; }
      else if (lead) bonus += 1;
      if (clutch) bonus += 3 + (e.clk <= 60 ? 2 : 0);
      if (e.val === 4) bonus += 1;
    } else if (late && close) bonus += 3;
    if (e.type === "tackle" && e.result === "down") bonus += 1; // the league's signature play
    if (label) out.push({ tk: e.tk, label, col, big, impact: big * 3 + bonus, e, i });
  }
  return out;
}

// ---------- 2D tactical view ----------
const cv = $("court"), ctx = cv.getContext("2d");
let bg = null, S = 4, DPR = 1, VERT = false;
function resize() {
  const w = cv.parentElement.clientWidth; DPR = Math.min(2, window.devicePixelRatio || 1);
  V.marksAt = -1;
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
// timeouts left (3 a half, 1 per OT) and team fouls this period, counted from the event log
let bugState = { n: -1 };
function bugCounts(n) {
  if (bugState.n === n && bugState.g === GAME) return bugState;
  const E = GAME.events, v = frameVals(), per = v.per, half = per <= 2 ? [1, 2] : per <= 4 ? [3, 4] : [per, per];
  const to = per >= 5 ? [1, 1] : [3, 3], tf = [0, 0];
  for (let i = 0; i < n; i++) { const e = E[i]; if (e.type === "timeout" && e.per >= half[0] && e.per <= half[1]) to[e.team] = Math.max(0, to[e.team] - 1); if (e.type === "foul" && e.per === per) tf[e.team]++; }
  bugState = { n, g: GAME, to, tf };
  return bugState;
}
function updateBug(n) {
  if (!GAME) return;
  const v = frameVals(), H = TB[GAME.home], A = TB[GAME.away], fin = V.tick >= GAME.ticks - 2, bc = bugCounts(n);
  const tos = t => `<span class="tos">${[0, 1, 2].slice(0, v.per >= 5 ? 1 : 3).map(k => `<i class="${k < bc.to[t] ? "on" : ""}"></i>`).join("")}</span>`;
  const bonus = t => !fin && bc.tf[1 - t] >= 5 ? `<span class="bon">BONUS</span>` : "";
  const team = t => { const tm = t ? A : H; return `<div class="bt" style="--c:${COLORS[t]};--t:${TXT[t]}"><span class="ab">${tm.id}${tos(t)}</span><span class="sc">${t ? v.s1 : v.s0}</span>${v.off === t && !fin ? '<i class="poss"></i>' : ""}${bonus(t)}</div>`; };
  const html = team(1) + team(0) +
    `<div class="bclk">${fin ? "FINAL" + (v.per > 4 ? (v.per === 5 ? "/OT" : "/" + (v.per - 4) + "OT") : "") : perName(v.per) + " " + fmtClock(v.clock)}${!fin && v.shot <= v.clock && v.phase === 0 ? `<b>${Math.ceil(v.shot)}</b>` : ""}</div>` +
    (V.live && !V.replay ? `<div class="blive">LIVE</div>` : "");
  if (html !== bugState.html) { $("bug").innerHTML = html; bugState.html = html; }
}
let l3Timer = 0, coTimer = 0;
function lowerThird(color, title, sub, ms, force) {
  if (!force && (V.replay || V.intro)) return;
  const el = $("l3"); el.style.setProperty("--c", color);
  el.innerHTML = `<b>${title}</b>${sub ? `<span>${sub}</span>` : ""}`; el.classList.add("on");
  clearTimeout(l3Timer); l3Timer = setTimeout(() => el.classList.remove("on"), ms || 3200);
}
function callout(label, col) {
  if (V.replay) return;
  const el = $("callout"); el.textContent = label; el.style.color = col; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  clearTimeout(coTimer); coTimer = setTimeout(() => el.classList.remove("on"), 1500);
}
// unanswered points by the team that scored event i
function runAt(i) {
  const E = GAME.events, t = E[i].team; let pts = 0;
  for (let j = i; j >= 0; j--) { const p = ptsOf(E[j]); if (!p) continue; if (E[j].team !== t) break; pts += p; }
  return pts;
}

// ---------- announcer (browser speech, off by default) ----------
const ANN = (() => {
  const ok = typeof speechSynthesis !== "undefined";
  let on = false, cur = 0, voice = null;
  function pick() { if (voice || !ok) return voice; const vs = speechSynthesis.getVoices(); voice = vs.find(v => /en[-_]US/i.test(v.lang) && /david|guy|alex|daniel|male/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang)) || null; return voice; }
  return {
    ok, get on() { return on; },
    toggle() { on = ok && !on; if (!on && ok) speechSynthesis.cancel(); return on; },
    say(text, pri) {
      if (!on || V.speed > 2 || document.hidden) return;
      if (speechSynthesis.speaking) { if ((pri || 1) <= cur) return; speechSynthesis.cancel(); }
      const u = new SpeechSynthesisUtterance(text), v = pick(); if (v) u.voice = v;
      u.rate = 1.12; u.pitch = 0.92; cur = pri || 1; u.onend = u.onerror = () => { cur = 0; }; speechSynthesis.speak(u);
    },
    stop() { if (ok) speechSynthesis.cancel(); cur = 0; }
  };
})();
const pickLine = (arr, k) => arr[Math.abs(k) % arr.length];
function callFor(e) {
  const n = e.pid !== undefined ? lastName(e.pid) : "", k = e.tk;
  switch (e.type) {
    case "fga":
      if (e.blk !== undefined && e.blk >= 0) return [pickLine(e.swat ? ["Get that out of here! " + lastName(e.blk) + " with the swat!", "Oh, " + lastName(e.blk) + " slaps it off the glass!"] : ["Rejected by " + lastName(e.blk) + "!", lastName(e.blk) + " says no!"], k), 3];
      if (!e.made) return null;
      if (e.val === 4) return [pickLine([n + " from way downtown... FOUR!", n + " pulls up from thirty... got it! Four points!", "Bang! " + n + " with the four!"], k), 3];
      if (e.dunk) return [pickLine([n + " throws it down!", "Oh, " + n + " with the hammer!", n + " rocks the rim!", "Flush! " + n + "!"], k), 3];
      if (e.val === 3) return [pickLine([n + " for three... got it!", n + " buries the three.", n + ", from deep. Yes!"], k), 2];
      return Math.abs(k) % 3 === 0 ? [pickLine([n + " scores.", n + " gets it to go.", "Bucket, " + n + "."], k), 1] : null;
    case "tackle":
      if (e.result === "down") return [pickLine(["Big hit! " + n + " puts " + lastName(e.on) + " on the rubber!", "Tackle! " + n + " brings down " + lastName(e.on) + ". Turnover!", "Oh! " + lastName(e.on) + " gets leveled by " + n + "!"], k), 3];
      if (e.result === "late") return ["Late hit by " + n + ". That's a foul.", 2];
      if (e.result === "broken") return [lastName(e.on) + " shrugs it off!", 2];
      return null;
    case "timeout": return ["Timeout, " + teamOf(e.team).name + ".", 2];
    case "period_end": return [e.per === 2 ? "That will do it for the first half." : e.per < 4 ? "That's the end of the " + ["first", "second", "third"][e.per - 1] + " quarter." : "", 2];
    case "final": { const w = e.s0 > e.s1 ? 0 : 1; return ["And that's the ballgame! The " + teamOf(w).name + " win it, " + Math.max(e.s0, e.s1) + " to " + Math.min(e.s0, e.s1) + ".", 4]; }
  }
  return null;
}

// fire graphics and sound for events we just played past
function playEvents(fromTick, toTick) {
  if (!GAME || toTick <= fromTick || toTick - fromTick > 160) return;
  const E = GAME.events;
  let pts = null;
  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    if (e.tk <= fromTick) continue; if (e.tk > toTick) break;
    const r = e.pid !== undefined ? GAME.roster[e.pid] : null, col = e.team !== undefined ? COLORS[e.team] : "#f2b134";
    const homeTeam = e.team === 0;
    const call = callFor(e); if (call && call[0]) ANN.say(call[0], call[1]);
    switch (e.type) {
      case "fga":
        if (e.made) {
          pts = pts || boxScore(GAME, e.tk);
          if (AUDIO) { AUDIO.swish(); AUDIO.excite(homeTeam ? (e.dunk || e.val === 4 ? 1 : 0.5) : 0.15); if (homeTeam && (e.dunk || e.val === 4)) setTimeout(() => AUDIO.organ(e.tk), 1200); }
          const run = runAt(i), tm = teamOf(e.team);
          if (run >= 8 && Math.floor(run / 4) > Math.floor((run - e.val) / 4)) { lowerThird(col, `${run}-0 RUN`, `${esc(tm.city)} ${esc(tm.name)}`); ANN.say("The " + tm.name + " are on a " + run + " to nothing run.", 2); }
          else lowerThird(col, `#${r.num} ${esc(r.short)}`, `${pts[e.pid].pts} PTS${e.val === 4 ? " · FOUR!" : e.dunk ? " · DUNK" : ""}`);
        } else if (e.blk !== undefined && e.blk >= 0) { if (AUDIO) { AUDIO.excite(0.7); if (e.team === 1) AUDIO.chant("ooh"); } }
        else if (AUDIO && !e.dunk) { AUDIO.clank(); if (e.val === 4 && Math.random() < 0.7) AUDIO.chant("ooh"); }
        break;
      case "tackle":
        if (e.result === "down") { if (AUDIO) { AUDIO.excite(0.9); AUDIO.whistle(); } lowerThird(col, (e.gang ? "GANG TACKLE · " : "TACKLE · ") + esc(r.short) + (e.gang ? " +" + e.gang.length : ""), "turnover"); }
        else if (e.result === "fumble") { if (AUDIO) AUDIO.excite(1); lowerThird(col, "FUMBLE · " + esc(r.short), `jarred loose from ${esc(GAME.roster[e.on].short)} · live ball`); }
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
      case "timeout": if (AUDIO) { AUDIO.whistle(); setTimeout(() => AUDIO.organ(e.tk + 3), 900); } lowerThird(col, "TIMEOUT", esc(teamOf(e.team).city + " " + teamOf(e.team).name)); break;
      case "period_end": {
        if (AUDIO) AUDIO.buzzer();
        const fin = E[i + 1] && E[i + 1].type === "final";
        if (!fin) showBreakCard(e);
        if (e.per === 2) setTimeout(() => showPlanCard(true), 6800); // after the halftime stat card
        break;
      }
      case "final": if (AUDIO) AUDIO.excite(1); break;
      case "period_start": if (AUDIO && e.tk > 0) AUDIO.organ(e.tk); break;
      case "ft": if (e.made && AUDIO) AUDIO.excite(homeTeam ? 0.2 : 0.05); break;
    }
  }
  for (const n of NOTABLE) if (n.tk > fromTick && n.tk <= toTick) callout(n.label, n.col);
}
// free throw graphic: who's shooting, which attempt, how they've shot tonight
function maybeFT(n) {
  if (frameVals().phase !== 2) return;
  const E = GAME.events;
  for (let i = n; i < E.length && E[i].tk - V.tick < 200; i++) {
    const e = E[i]; if (e.type !== "ft") continue;
    if (V.ftShown === i) return; V.ftShown = i;
    const r = GAME.roster[e.pid]; let m = 0, a = 0;
    for (let j = 0; j < n; j++) if (E[j].type === "ft" && E[j].pid === e.pid) { a++; if (E[j].made) m++; }
    lowerThird(COLORS[e.team], `FREE THROW ${e.n} OF ${e.of}`, `#${r.num} ${esc(r.short)} · ${a ? m + "-" + a + " FT tonight" : "first trip tonight"}`, 2600);
    return;
  }
}

// ---------- cards: pregame intro, quarter breaks, final ----------
function teamTotals(box, t) { return box.filter(s => s.t === t).reduce((a, s) => { for (const k in s) if (typeof s[k] === "number") a[k] = (a[k] || 0) + s[k]; return a; }, {}); }
function gameScore(s) { return s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk + 1.2 * s.tkl - 0.4 * s.pf - s.to; }
function statLine(s) { const parts = [`${s.pts} PTS`]; if (s.oreb + s.dreb >= 5) parts.push(`${s.oreb + s.dreb} REB`); if (s.ast >= 4) parts.push(`${s.ast} AST`); if (s.fpm) parts.push(`${s.fpm} FOURS`); if (s.tkl) parts.push(`${s.tkl} TKL`); if (s.blk >= 2) parts.push(`${s.blk} BLK`); return parts.slice(0, 4).join(" · "); }
function showCard(kind, html, ms) {
  const el = $("card"); el.className = "card on " + kind; el.innerHTML = html; V.card = { kind, until: ms ? performance.now() + ms : 0 };
  el.querySelectorAll("[data-a]").forEach(b => b.onclick = ev => { ev.stopPropagation(); cardAction(b.dataset.a); });
}
function hideCard() { $("card").className = "card"; V.card = null; }
function cardAction(a) {
  if (a === "skip") endIntro();
  else if (a === "close") { hideCard(); if (GAME) GAME._finDismissed = true; V.hold = 0; }
  else if (a === "reel") { if (GAME) GAME._finDismissed = true; hideCard(); playReel(); }
  else if (a === "box") { if (GAME) GAME._finDismissed = true; hideCard(); document.querySelector('.bctabs button[data-t="box"]').click(); $("bc-box").scrollIntoView({ behavior: "smooth", block: "start" }); }
  else if (a === "again") { hideCard(); seek(0); V.playing = true; setPlayBtn(); }
}
function records(ctxx) {
  if (!ctxx || !ctxx.S) return null;
  const { row, S: sd } = ctxx, [gid, day, h, a, , , , , type] = row, rec = { [h]: [0, 0], [a]: [0, 0] };
  for (const g of sd.games) {
    if (g[8] !== 0) continue; if (type === 0 && g[1] >= day) continue;
    for (const [tm, won] of [[g[2], g[5] > g[6]], [g[3], g[6] > g[5]]]) if (rec[tm]) rec[tm][won ? 0 : 1]++;
  }
  let series = null;
  if (type !== 0) {
    const w = { [h]: 0, [a]: 0 }; let n = 0;
    for (const g of sd.games) if (g[8] !== 0 && g[0] < gid && ((g[2] === h && g[3] === a) || (g[2] === a && g[3] === h))) { n++; w[g[5] > g[6] ? g[2] : g[3]]++; }
    series = n === 0 ? "Game 1" : w[h] === w[a] ? `Series tied ${w[h]}-${w[a]}` : w[h] > w[a] ? `${h} leads ${w[h]}-${w[a]}` : `${a} leads ${w[a]}-${w[h]}`;
  }
  const co = sd.coaches || {};
  return { rec, series, coach: [co[row[11]] ? co[row[11]].name : null, co[row[12]] ? co[row[12]].name : null], season: sd.season, type, day };
}
function introHTML() {
  const R = records(V.ctx), H = TB[GAME.home], A = TB[GAME.away];
  const tm = t => { const T = t ? A : H, rec = R && R.rec[T.id]; return `<div class="tm" style="--c:${COLORS[t]}"><span class="cty">${esc(T.city)}</span><b>${esc(T.name)}</b><span class="rec">${rec ? rec[0] + "-" + rec[1] : ""}${R && R.coach[t] ? " · " + esc(R.coach[t]) : ""}</span></div>`; };
  const lu = t => `<ul style="--c:${COLORS[t]}">${GAME.roster.filter(r => r.t === t && r.starter).map(r => `<li><span class="num">${r.num}</span>${esc(r.short)}<em>${r.role === "SNIPER" ? "SN" : r.role === "BRUISER" ? "BR" : r.role}</em></li>`).join("")}</ul>`;
  const kick = R ? `${R.season} · ${R.type ? "PLAYOFFS · " + esc(R.series) : "DAY " + (R.day + 1)}` : "UBL";
  return `<div class="cin"><div class="ck">UBL ON TV · ${kick}</div><div class="mu">${tm(1)}<div class="at">at</div>${tm(0)}</div>
    <div class="arena">${esc(H.arena || H.city + " Arena")} · ${esc(H.city)}</div>
    <div class="lus">${lu(1)}${lu(0)}</div><button class="skip" data-a="skip">Tip it off ▶</button></div>`;
}
const POSN = { PG: "guard", SNIPER: "guard", WING: "forward", BRUISER: "forward", BIG: "center" };
const INTRO_CARD = 4.2, INTRO_EACH = 2.0;
function introStarters() { return GAME.roster.filter(r => r.t === 0 && r.starter); }
function newIntro() { const now = performance.now(); return { t0: now, step: -1, until: now + (INTRO_CARD + 5 * INTRO_EACH + 0.6) * 1000 }; }
function startIntro() { V.intro = newIntro(); showCard("intro", introHTML()); $("skipIntro").hidden = false; ANN.say(`Welcome to ${TB[GAME.home].arena || TB[GAME.home].city}, where the ${TB[GAME.away].name} take on the ${TB[GAME.home].name}.`, 2); }
function endIntro() { if (!V.intro) return; V.intro = null; hideCard(); $("skipIntro").hidden = true; $("l3").classList.remove("on"); if (AUDIO) AUDIO.whoosh(); stingerFx(); if (V.tick < 40) setTimeout(showPlanCard, 600); }
// what the intro camera shows right now; fires the player introductions as they come up
function introView(now) {
  const I = V.intro, el = (now - I.t0) / 1000, st = introStarters();
  const step = el < INTRO_CARD ? 0 : Math.min(st.length, 1 + Math.floor((el - INTRO_CARD) / INTRO_EACH));
  if (step !== I.step) {
    I.step = step;
    if (step >= 1) {
      if (V.card && V.card.kind === "intro") hideCard();
      const r = st[step - 1];
      if (r) { lowerThird(COLORS[0], `#${r.num} ${esc(r.name)}`, `${(POSN[r.role] || "forward").toUpperCase()} · ${Math.floor(r.ht / 12)}'${r.ht % 12}" · ${esc(TB[GAME.home].name)}`, INTRO_EACH * 1000 - 150, true); ANN.say(`At ${POSN[r.role] || "forward"}, number ${r.num}, ${r.name}!`, 3); if (AUDIO) AUDIO.excite(0.5); }
    }
  }
  const r = step >= 1 ? st[step - 1] : null;
  return r ? { shot: "lineup", focus: r.idx, ambient: true, spinT: el - INTRO_CARD - (step - 1) * INTRO_EACH } : { shot: "intro", ambient: true };
}
function showBreakCard(e) {
  const box = boxScore(GAME, e.tk), T = [teamTotals(box, 0), teamTotals(box, 1)];
  const title = e.per === 2 ? "HALFTIME" : e.per === 4 ? "END OF REGULATION" : e.per > 4 ? "END OF " + perLong(e.per) : "END OF THE " + perLong(e.per);
  const pct = (m, a) => a ? Math.round(100 * m / a) + "%" : "–";
  const rows = [["FG", t => `${T[t].fgm}-${T[t].fga}`], ["FG%", t => pct(T[t].fgm, T[t].fga)], ["FOURS", t => `${T[t].fpm}-${T[t].fpa}`], ["THREES", t => `${T[t].tpm}-${T[t].tpa}`], ["REBOUNDS", t => T[t].oreb + T[t].dreb], ["TACKLES", t => T[t].tkl], ["TURNOVERS", t => T[t].to]];
  const lead = t => { const s = box.filter(x => x.t === t).sort((a, b) => b.pts - a.pts)[0], r = GAME.roster[s.idx]; return `<div style="--c:${COLORS[t]}"><b><span class="num">${r.num}</span>${esc(r.short)}</b><span>${statLine(s)}</span></div>`; };
  const html = `<div class="cin"><div class="ck">${title}${e.per === 4 ? " · OVERTIME NEXT" : ""}</div>
    <div class="score"><span style="--c:${COLORS[1]}">${TB[GAME.away].id} <b>${e.s1}</b></span><span style="--c:${COLORS[0]}"><b>${e.s0}</b> ${TB[GAME.home].id}</span></div>
    <table class="cmp">${rows.map(([l, f]) => `<tr><td>${f(1)}</td><th>${l}</th><td>${f(0)}</td></tr>`).join("")}</table>
    <div class="leaders">${lead(1)}${lead(0)}</div></div>`;
  showCard("brk", html, 6000);
  if (!V.live && V.speed <= 4) V.hold = performance.now() + 6000;
}
function finalHTML() {
  const box = boxScore(GAME, GAME.ticks), v = frameVals(GAME.ticks), w = v.s0 > v.s1 ? 0 : 1;
  const best = box.slice().sort((a, b) => gameScore(b) - gameScore(a))[0], r = GAME.roster[best.idx];
  const ot = v.per > 4 ? (v.per === 5 ? "/OT" : "/" + (v.per - 4) + "OT") : "";
  return `<div class="cin"><div class="ck">FINAL${ot}</div>
    <div class="score"><span class="${w === 1 ? "w" : ""}" style="--c:${COLORS[1]}">${TB[GAME.away].id} <b>${v.s1}</b></span><span class="${w === 0 ? "w" : ""}" style="--c:${COLORS[0]}"><b>${v.s0}</b> ${TB[GAME.home].id}</span></div>
    <div class="potg" style="--c:${COLORS[r.t]}"><small>PLAYER OF THE GAME</small><b><span class="num">${r.num}</span>${esc(r.name)}</b><span>${esc(teamOf(r.t).name)} · ${statLine(best)}</span></div>
    <div class="cbtn"><button data-a="reel">▶ Top plays</button><button data-a="box">Box score</button><button data-a="again">↺ Watch again</button><button data-a="close" class="x" title="Close">✕</button></div></div>`;
}

// ---------- replays: multi-angle packages, stingers, slow motion ----------
function stingerFx() {
  const el = $("stinger"); el.style.setProperty("--c", COLORS[0]); el.style.setProperty("--c2", "#f2b134");
  el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
}
function stinger(fn) { stingerFx(); if (AUDIO) AUDIO.whoosh(); const g = GAME; setTimeout(() => { if (GAME === g) fn(); }, 300); }
// the frame where the ball left the shooter's hands
function releaseTick(tk) {
  const F = GAME.frames; let f = Math.min(GAME.nFrames - 1, Math.floor(tk / 2));
  for (let k = 0; k < 80 && f > 0; k++, f--) if (F[f * FS + BO + 4] === 0) return f * 2;
  return tk - 20;
}
function packageFor(n) {
  const e = n.e, tk = n.tk, sideFor = t => attSideOf(t, e.per);
  const clip = (shot, from, to, rate, extra) => Object.assign({ shot, from: Math.max(0, from), to: Math.min(GAME.ticks, to), rate }, extra || {});
  let clips;
  if (e.type === "tackle") {
    const side = sideFor(1 - e.team);
    clips = e.result === "down" ? [clip("low", tk - 40, tk + 30, 0.5, { side }), clip("spin", tk - 2, tk - 2, 0, { side, focus: e.pid, hold: 2.4 }), clip("iso", tk - 10, tk + 20, 0.3, { side, focus: e.pid })]
      : [clip("low", tk - 36, tk + 20, 0.5, { side }), clip("iso", tk - 12, tk + 10, 0.35, { side, focus: e.on })];
  } else if (e.type === "fga") {
    const side = sideFor(e.team), r = releaseTick(tk);
    if (e.blk !== undefined && e.blk >= 0) clips = [clip("baseline", tk - 36, tk + 16, 0.5, { side }), clip("spin", tk, tk, 0, { side, focus: e.blk, hold: 2.2 }), clip("iso", tk - 14, tk + 10, 0.3, { side, focus: e.blk })];
    else if (e.dunk) clips = [clip("baseline", r - 40, tk + 16, 0.5, { side }), clip("spin", tk - 3, tk - 3, 0, { side, focus: e.pid, hold: 2.4 }), clip("rim", r - 12, tk + 12, 0.3, { side })];
    else if (e.val === 4) clips = [clip("low", r - 28, tk + 14, 0.5, { side }), clip("spin", r + 3, r + 3, 0, { side, focus: e.pid, hold: 2.2 }), clip("iso", r - 20, r + 10, 0.35, { side, focus: e.pid })];
    else clips = [clip("main", r - 40, tk + 14, 0.5, { side }), clip("iso", r - 16, r + 8, 0.35, { side, focus: e.pid })];
  } else clips = [clip("main", tk - 60, tk + 20, 0.5)];
  return { label: n.label, col: n.col, clips, tk, ar: arFor(n) };
}
// what the replay graphics show: the ball's path, rings under the players, and the numbers that matter
function arFor(n) {
  const e = n.e, F = GAME.frames;
  const at = (tk, idx) => { const f = Math.max(0, Math.min(GAME.nFrames - 1, Math.floor(tk / 2))), o = f * FS; for (let k = 0; k < 10; k++) if (F[o + k * PO + 3] === idx) return { x: F[o + k * PO], y: F[o + k * PO + 1], z: F[o + k * PO + 2] }; return null; };
  const maxZ = (idx, a, b) => { let m = 0; for (let tk = a; tk <= b; tk += 2) { const p = at(tk, idx); if (p) m = Math.max(m, p.z); } return m; };
  const hang = (idx, a, b) => { let c = 0; for (let tk = a; tk <= b; tk += 2) { const p = at(tk, idx); if (p && p.z > 0.25) c++; } return c * 0.1; };
  const mph = (idx, a, b) => { let m = 0; for (let tk = a; tk < b; tk += 2) { const p = at(tk, idx), q = at(tk + 2, idx); if (p && q) m = Math.max(m, Math.hypot(q.x - p.x, q.y - p.y) * 10); } return m * 0.6818; };
  const who = i => { const r = GAME.roster[i]; return `#${r.num} ${r.name.split(" ").slice(-1)[0].toUpperCase()}`; };
  if (e.type === "fga") {
    const r = releaseTick(e.tk);
    if (e.blk !== undefined && e.blk >= 0) return { trace: [r, e.tk + 10], color: [0.7, 3.2, 0.9], rings: [e.blk, e.pid], labels: [{ idx: e.blk, text: `${who(e.blk)} · VERTICAL ${Math.round(maxZ(e.blk, e.tk - 30, e.tk + 4) * 12)}"`, color: COLORS[1 - e.team] }] };
    if (e.dunk) return { rings: [e.pid], labels: [{ idx: e.pid, text: `${who(e.pid)} · VERTICAL ${Math.round(maxZ(e.pid, r - 30, e.tk + 6) * 12)}" · HANG ${hang(e.pid, r - 30, e.tk + 16).toFixed(1)}s`, color: COLORS[e.team] }] };
    const p = at(r, e.pid), hx = attSideOf(e.team, e.per) ? 88.75 : 5.25;
    return { trace: [r, e.tk + 2], rings: [e.pid], line: p && e.val >= 3 ? [p.x, p.y, hx, 25] : null, labels: [{ idx: e.pid, text: `${who(e.pid)} · ${e.d} FT ${e.val === 4 ? "FOUR" : e.val === 3 ? "THREE" : "SHOT"}`, color: COLORS[e.team] }] };
  }
  if (e.type === "tackle") return { rings: [e.pid, e.on], labels: [{ idx: e.pid, text: `${who(e.pid)} · ${mph(e.pid, e.tk - 16, e.tk).toFixed(1)} MPH HIT`, color: COLORS[e.team] }] };
  return null;
}
function startReplay(pkg) {
  if (!B3 || !V.view3d) return;
  if (V.live) pkg = Object.assign({}, pkg, { clips: pkg.clips.slice(0, 1) });
  stinger(() => {
    V.replay = { pkg, ci: 0, t: pkg.clips[0].from, busy: false }; V.playing = true; setPlayBtn();
    $("l3").classList.remove("on");
    if (!V.reel) ANN.say(pickLine(["Let's take another look.", "Look at this again.", "Here it is again, in slow motion."], pkg.tk), 1);
    updateAll(true);
  });
}
function advanceReplay(dt) {
  const R = V.replay; if (R.busy) return;
  const c = R.pkg.clips[R.ci];
  if (c.hold) { R.held = (R.held || 0) + dt; R.t = c.from; if (R.held < c.hold) return; } // frozen moment, camera circles
  else { R.t = Math.min(c.to, R.t + dt * 20 * c.rate); if (R.t < c.to) return; }
  R.busy = true;
  if (R.ci + 1 < R.pkg.clips.length) stinger(() => { if (V.replay !== R) return; R.ci++; R.t = R.pkg.clips[R.ci].from; R.held = 0; R.busy = false; updateAll(true); });
  else stinger(() => { if (V.replay !== R) return; V.replay = null; if (V.reel && V.reel.length) startReplay(packageFor(V.reel.shift())); else { V.reel = null; if (V.tick >= maxTicks() - 1) { V.playing = false; setPlayBtn(); } } updateAll(true); });
}
function stopReplay() { V.replay = null; V.reel = null; }
function maybeChant(now) {
  if (!AUDIO || !AUDIO.on || V.replay || V.speed > 2 || now < (V.chantAt || 0)) return;
  const v = frameVals(), close = Math.abs(v.s0 - v.s1) <= 8;
  if (v.phase === 0 && v.off === 1 && close && (v.per >= 4 || Math.random() < 0.002)) { AUDIO.chant("defense"); V.chantAt = now + 24000; }
  else if (v.phase === 1 && v.off === 0 && Math.random() < 0.004) { AUDIO.chant("letsgo"); V.chantAt = now + 18000; }
}
function maybeReplay() {
  if (!V.autoReplay || V.replay || V.reel || !V.view3d || !B3 || V.speed > 4 || V.speed < 1 || V.hold || V.intro) return;
  if (frameVals().phase === 0) return; // only during a stoppage
  for (let i = NOTABLE.length - 1; i >= 0; i--) {
    const n = NOTABLE[i];
    if (n.tk > V.tick) continue;
    if (V.tick - n.tk > 200) break;
    if (n.impact >= 10 && !n.replayed && n.tk - V.lastReplayTk > 900) { n.replayed = true; V.lastReplayTk = n.tk; startReplay(packageFor(n)); return; }
  }
}
function replayLast() {
  if (!GAME || !B3) return;
  let n = null; for (let i = NOTABLE.length - 1; i >= 0; i--) if (NOTABLE[i].tk <= V.tick) { n = NOTABLE[i]; break; }
  if (n && V.tick - n.tk < 600) { stopReplay(); startReplay(packageFor(n)); return; }
  const to = Math.max(40, Math.floor(V.tick)); stopReplay();
  startReplay({ label: "REPLAY", col: "#fff", tk: to, clips: [{ shot: null, from: Math.max(0, to - 140), to, rate: 0.5 }] });
}
// best plays so far (or all of them once it's final), with a little variety so it's not eight fours in a row
function topPlays(all) {
  const lim = all ? Infinity : V.tick, pool = NOTABLE.filter(n => n.tk <= lim && n.big >= 1).sort((a, b) => b.impact - a.impact || a.tk - b.tk), seen = {}, out = [];
  while (pool.length) {
    let bi = 0, bs = -1e9;
    pool.forEach((n, k) => { const s = n.impact - 2.5 * (seen[n.label] || 0); if (s > bs) { bs = s; bi = k; } });
    const n = pool.splice(bi, 1)[0]; seen[n.label] = (seen[n.label] || 0) + 1; out.push(n);
  }
  return out;
}
function playReel() {
  const fin = V.tick >= GAME.ticks - 2, list = topPlays(fin).slice(0, 8).sort((a, b) => a.tk - b.tk);
  if (!list.length || !B3 || !V.view3d) return;
  stopReplay(); V.reel = list.slice(1); startReplay(packageFor(list[0]));
}

// ---------- play-by-play, top plays & box ----------
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
    case "timeout": return [`Timeout, ${esc(teamOf(e.team).name)}`, "m"];
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
    const t = e.team !== undefined ? e.team : -1, nb = NOTABLE.find(x => x.i === i);
    out.push(`<li class="${L[1]}${nb ? " rp" : ""}"${nb ? ` data-n="${NOTABLE.indexOf(nb)}"` : ""}><span class="t">${perName(e.per)} ${fmtClock(e.clk)}</span><i style="background:${t >= 0 ? COLORS[t] : "transparent"}"></i><span class="x">${L[0]}${nb && B3 ? ' <span class="rpb">▶</span>' : ""}</span><span class="s">${e.s1}-${e.s0}</span></li>`);
  }
  $("pbp-list").innerHTML = out.join("") || `<li class="m"><span class="x">Waiting for tip-off…</span></li>`;
}
function renderTop() {
  const fin = V.tick >= GAME.ticks - 2, list = topPlays(fin).slice(0, 12);
  $("topnote").textContent = fin ? "The game's best plays" : "Best plays so far (no spoilers)";
  $("reel").disabled = !list.length || !B3;
  $("top-list").innerHTML = list.map(n => {
    const L = pbpLine(n.e), stars = "★".repeat(Math.max(1, Math.min(5, Math.round(n.impact / 3.5))));
    return `<li data-n="${NOTABLE.indexOf(n)}"><span class="tpl" style="color:${n.col}">${esc(n.label)}</span><span class="x">${L ? L[0] : ""}</span><span class="t">${perName(n.e.per)} ${fmtClock(n.e.clk)} · <span class="st">${stars}</span></span></li>`;
  }).join("") || `<li class="m"><span class="x">Nothing yet. Big plays show up here as they happen.</span></li>`;
}
function renderBox() {
  const v = frameVals();
  const S = boxScore(GAME, V.tick, v.per, v.clock);
  let html = "";
  for (const t of [1, 0]) {
    const tm = teamOf(t);
    const rows = S.filter(s => s.t === t);
    const tot = teamTotals(S, t);
    const line = (name, s, cls) => `<tr class="${cls || ""}"><td class="pn">${name}</td><td>${s.played === false ? (V.tick >= GAME.ticks ? "DNP" : "–") : Math.floor(s.secs / 60)}</td><td class="b">${s.pts}</td><td>${s.oreb + s.dreb}</td><td>${s.ast}</td><td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.fpm}-${s.fpa}</td><td>${s.ftm}-${s.fta}</td><td>${s.tkl}</td><td>${s.btk}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.to}</td><td>${s.pf}</td></tr>`;
    html += `<h3 style="--c:${COLORS[t]}">${esc(tm.city)} ${esc(tm.name)}</h3><div class="tw"><table class="box"><thead><tr><th class="pn">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>3P</th><th>4P</th><th>FT</th><th title="Tackles (turnovers forced)">TKL</th><th title="Broken tackles">BTK</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>`;
    for (const s of rows) { const r = GAME.roster[s.idx]; html += line(`<span class="num">${r.num}</span>${typeof pcQuick === "function" && GAME.season ? `<a class="plq" tabindex="0" data-pid="${r.id}" data-season="${GAME.season}" title="Player card">${esc(r.short)}</a>` : esc(r.short)} <span class="m">${r.role === "SNIPER" ? "SN" : r.role === "BRUISER" ? "BR" : r.role}</span>${B3 ? ` <span class="pcam${V.follow === s.idx ? " on" : ""}" data-idx="${s.idx}" title="Follow with the player cam">🎥</span>` : ""}`, s, r.starter ? "st" : ""); }
    tot.played = true;
    html += line("<b>Team</b>", tot, "tot") + `</tbody></table></div>`;
  }
  $("box-tables").innerHTML = html;
}
// timeline under the scrubber: quarters, what's been played, and the big moments so far
function drawMarks() {
  const c = $("marks"), w = c.clientWidth, h = c.clientHeight, d = Math.min(2, window.devicePixelRatio || 1);
  if (!w || !GAME) return;
  if (c.width !== Math.round(w * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
  const g = c.getContext("2d"), max = +$("scrub").max || 1, inset = 8 * d, W = c.width - 2 * inset, Hh = c.height, X = tk => inset + W * Math.min(1, tk / max);
  const fin = V.tick >= GAME.ticks - 2;
  g.clearRect(0, 0, c.width, Hh);
  g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(inset, Hh * 0.35, W, Hh * 0.3);
  g.fillStyle = "rgba(242,177,52,0.35)"; g.fillRect(inset, Hh * 0.35, X(V.tick) - inset, Hh * 0.3);
  g.fillStyle = "rgba(255,255,255,0.45)";
  for (const e of GAME.events) if (e.type === "period_start" && e.tk > 0) g.fillRect(X(e.tk) - d * 0.5, 0, d, Hh);
  for (const n of NOTABLE) { if ((!fin && n.tk > V.tick) || n.big < 2) continue; g.fillStyle = n.col; const bw = n.big >= 3 ? 3 * d : 2 * d; g.fillRect(X(n.tk) - bw / 2, n.big >= 2 ? 0 : Hh * 0.25, bw, n.big >= 2 ? Hh : Hh * 0.5); }
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
  const html = V.channels.map((c, i) => {
    const g = c.game, f = Math.min(g.nFrames - 1, Math.floor(V.tick / 2)), o = f * FS + MO, F = g.frames;
    const fin = V.tick >= g.ticks - 2;
    return `<button class="chn ${i === V.ch ? "on" : ""}" data-ch="${i}"><span class="cn">CH ${i + 1}</span><span><i style="background:${c.colors[1]}"></i>${c.away} <b>${F[o + 4]}</b></span><span><i style="background:${c.colors[0]}"></i>${c.home} <b>${F[o + 3]}</b></span><span class="cs">${V.intro ? "PREGAME" : fin ? "FINAL" : perName(F[o + 2]) + " " + fmtClock(F[o])}</span></button>`;
  }).join("");
  if (html !== V.chHtml) { V.chHtml = html; $("channels").innerHTML = html; document.querySelectorAll(".chn").forEach(b => b.onclick = () => flip(+b.dataset.ch)); }
}
function useGame(game, colors) {
  GAME = game; COLORS = colors; TXT = COLORS.map(c => lum(c) > 0.55 ? "#111" : "#fff");
  NOTABLE = buildNotable(GAME); V.visCount = -1; V.boxAt = -1; V.replay = null; V.reel = null; V.ftShown = -1; V.marksAt = -1; bugState = { n: -1 };
  if (B3) { const ssn = V.ctx && V.ctx.S ? V.ctx.S.season : 2000; B3.setGame(GAME, TB[GAME.home], TB[GAME.away], COLORS, { season: ssn, banners: bannersFor(GAME.home, ssn) }); }
  applyEra(); if (V.follow !== undefined && !GAME.roster[V.follow]) V.follow = undefined;
  drawCourtBg();
}
function flip(i) {
  if (!V.channels) return;
  V.ch = (i + V.channels.length) % V.channels.length;
  const c = V.channels[V.ch]; V.ctx = c.ctx; useGame(c.game, c.colors);
  if (V.intro) showCard("intro", introHTML()); else if (V.card && V.card.kind !== "intro") hideCard();
  $("seed").innerHTML = c.note; V.chHtml = null; updateAll(true); renderChannels();
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
function resetShow() { stopReplay(); V.intro = null; V.hold = 0; hideCard(); ANN.stop(); $("skipIntro").hidden = true; }
// Replay a stored game: same seed + same lineups + same coaches + same engine = the same game.
function loadGame(row, seasonData) {
  V.playing = false; V.channels = null; V.live = false; resetShow(); renderChannels(); resize();
  $("bc-overlay").textContent = "Replaying from the record…"; $("bc-overlay").hidden = false;
  setTimeout(() => {
    const game = simulate(row, seasonData);
    V.ctx = { row, S: seasonData };
    useGame(game, teamColors(row[2], row[3]));
    V.tick = 0; $("scrub").max = game.ticks; $("scrub").value = 0;
    $("seed").innerHTML = game.note + keyHint();
    $("bc-overlay").hidden = true; updateAll(true);
    V.playing = true; setPlayBtn();
    if (B3 && V.view3d) startIntro(); else showPlanCard(); // with the intro, the gameplans come up at tip-off
  }, 30);
}
// Load several games (one day's slate) to air together.
function loadChannels(rows, seasonData) {
  V.playing = false; resetShow(); resize();
  $("bc-overlay").textContent = `Tuning in ${rows.length} games…`; $("bc-overlay").hidden = false;
  const chans = []; let i = 0;
  const next = () => {
    if (i < rows.length) {
      const row = rows[i++], game = simulate(row, seasonData);
      chans.push({ game, colors: teamColors(row[2], row[3]), home: row[2], away: row[3], note: game.note, ctx: { row, S: seasonData } });
      $("bc-overlay").textContent = `Tuning in game ${i} of ${rows.length}…`;
      setTimeout(next, 10); return;
    }
    V.channels = chans; V.ch = 0; V.live = true; setSpeed(1);
    V.tick = 0; $("scrub").max = Math.max(...chans.map(c => c.game.ticks)); $("scrub").value = 0;
    if (B3 && V.view3d) { V.intro = newIntro(); $("skipIntro").hidden = false; }
    flip(0); $("bc-overlay").hidden = true; V.playing = true; setPlayBtn();
  };
  setTimeout(next, 30);
}
function stopBroadcast() { V.playing = false; V.channels = null; resetShow(); }

// ---------- main loop ----------
function updateAll(force) {
  if (!GAME) return;
  const n = visibleCount();
  updateBug(n);
  if (n !== V.visCount || force) {
    V.visCount = n;
    if (!$("bc-pbp").hidden) renderPBP(n);
    if (!$("bc-top").hidden) renderTop();
  }
  if (!$("bc-box").hidden && (force || Math.abs(V.tick - V.boxAt) >= 20)) { V.boxAt = V.tick; renderBox(); }
  if (force || Math.abs(V.tick - V.marksAt) >= 10) { V.marksAt = V.tick; drawMarks(); }
  if ($("bc-strat") && !$("bc-strat").hidden && (force || Math.abs(V.tick - (V.stratAt || -1e9)) >= 40)) { V.stratAt = V.tick; renderStrategy(); }
  $("scrub").value = V.tick;
  if (V.channels) renderChannels();
  const R = V.replay, tag = $("replayTag");
  $("courtwrap").classList.toggle("rp", !!R); $("courtwrap").classList.toggle("post", !!(B3 && B3.postActive && V.view3d));
  if (R) { const c = R.pkg.clips[R.ci]; tag.hidden = false; tag.innerHTML = `REPLAY <span>${esc(R.pkg.label)}</span> <em>${c.hold ? "FREEZE 360°" : (c.rate < 0.3 ? "¼" : c.rate < 0.45 ? "⅓" : "½") + "×"}</em>${V.reel ? ` <em>${V.reel.length} more</em>` : ""}`; }
  else if (V.speed < 1 && V.view3d) { tag.hidden = false; tag.innerHTML = `SLOW MO <em>${V.speed === 0.25 ? "¼" : "½"}×</em>`; }
  else tag.hidden = true;
  // final card once the game ends
  const fin = V.tick >= GAME.ticks - 2;
  if (fin && !R && !V.reel && !GAME._finDismissed && (!V.card || V.card.kind !== "fin")) showCard("fin", finalHTML());
  if (!fin && V.card && V.card.kind === "fin") hideCard();
}
function maxTicks() { return V.channels ? Math.max(...V.channels.map(c => c.game.ticks)) : GAME.ticks; }
function seek(tk) { stopReplay(); V.intro = null; V.hold = 0; if (V.card && V.card.kind !== "fin") hideCard(); V.tick = Math.max(0, Math.min(maxTicks(), tk)); V.live = false; V.visCount = -1; updateAll(true); }
function autoQuality(dt) {
  if (!B3 || !V.view3d || V.qMode !== "auto" || document.hidden) return;
  const f = V.fps; f.n++; f.t += dt;
  if (f.n < 90) return;
  const avg = f.t / f.n; f.n = 0; f.t = 0;
  if (avg > 1 / 28 && B3.quality === "high") B3.setQuality("medium");
  else if (avg > 1 / 24 && B3.quality === "medium") B3.setQuality("low");
}
function loop(ts) {
  const now = performance.now(), dt = Math.min(0.1, (ts - (V.last || ts)) / 1000); V.last = ts;
  if (GAME && V.playing) {
    if (V.intro) { if (now >= V.intro.until) endIntro(); }
    else {
      if (V.replay) advanceReplay(dt);
      if (!V.replay || V.live) {
        if (V.hold && !V.live) { if (now >= V.hold) { V.hold = 0; if (V.card && V.card.kind === "brk") hideCard(); } }
        else {
          const before = V.tick;
          V.tick += dt * 20 * V.speed;
          const mt = maxTicks();
          if (V.tick >= mt) { V.tick = mt; if (!V.replay) { V.playing = false; setPlayBtn(); } }
          playEvents(before, V.tick);
          const n = visibleCount(); maybeFT(n); maybeReplay(); maybeChant(now);
        }
      }
    }
    if (V.card && V.card.until && now >= V.card.until && V.card.kind === "brk") { hideCard(); V.hold = 0; }
    updateAll(false);
  }
  if (GAME && V.view3d && B3) {
    let view;
    if (V.intro) view = introView(performance.now());
    else if (V.replay) { const c = V.replay.pkg.clips[V.replay.ci]; view = { shot: c.shot || undefined, focus: c.focus, side: c.side, rate: c.hold ? 0.01 : c.rate, replay: true, spinT: V.replay.held || 0, ar: V.replay.pkg.ar }; }
    else if (V.hold && !V.live) view = { shot: "dance", ambient: true, dance: true };
    else if (V.tick >= GAME.ticks - 2) view = { ambient: true, shot: V.card && V.card.kind === "fin" ? "orbit" : undefined, rate: V.speed };
    else view = { rate: V.speed, focus: $("cam").value === "player" ? V.follow : undefined };
    view.era = V.eraOn ? eraMode() : 0;
    B3.render(V.replay ? V.replay.t : V.tick, view);
    autoQuality(dt);
  } else draw2D(V.tick);
  requestAnimationFrame(loop);
}
function eraMode() { const y = V.ctx && V.ctx.S ? V.ctx.S.season : 2020; return y < 1966 ? 3 : y < 1985 ? 2 : y < 2005 ? 1 : 0; }
function applyEra() {
  const m = V.eraOn ? eraMode() : 0, cw = $("courtwrap");
  for (const k of [1, 2, 3]) { cw.classList.toggle("era" + k, m === k); cw.classList.toggle("erafx" + k, m === k && !(B3 && B3.postActive && V.view3d)); }
  $("era").classList.toggle("on", !!V.eraOn); $("era").title = V.eraOn ? ["", "1990s video look", "1970s film look", "1950s kinescope look"][m] || "Modern HD" : "Broadcast look of the game's era";
}
function setPlayBtn() { $("play").textContent = V.playing ? "❚❚" : "▶"; }
function setSpeed(s) { V.speed = s; V.live = V.channels ? s === 1 : false; document.querySelectorAll(".spd button").forEach(x => x.classList.toggle("on", +x.dataset.s === s)); }
function followPlayer(idx) {
  if (!B3 || !GAME.roster[idx]) return;
  V.follow = idx; setView("player"); const r = GAME.roster[idx];
  lowerThird(COLORS[r.t], "PLAYER CAM", `#${r.num} ${esc(r.name)}`, 2400); V.boxAt = -1; updateAll(true);
}
function setView(mode) {
  if (mode === "player" && (V.follow === undefined || !GAME || !GAME.roster[V.follow])) { if (GAME) { const st = GAME.roster.filter(r => r.starter), box = boxScore(GAME, V.tick); st.sort((a, b) => box[b.idx].pts - box[a.idx].pts); V.follow = st.length ? st[0].idx : undefined; } }
  V.view3d = mode !== "tactical" && !!B3;
  $("court3d").hidden = !V.view3d; $("court").hidden = V.view3d;
  if (B3 && V.view3d) B3.setCamera(mode);
  if (!V.view3d) { stopReplay(); if (V.intro) endIntro(); }
  $("cam").value = mode;
  resize(); updateAll(true);
}
const CAMS = ["auto", "sideline", "endline", "baseline", "follow", "low", "sky", "overhead", "player", "free"];
function keyHint() { return window.matchMedia && window.matchMedia("(pointer: fine)").matches ? ` · <span class="keys">keys: space pause · ←/→ seek${V.channels ? " (channels)" : ""} · R replay · S slow-mo · C camera · F fullscreen · M sound · A announcer</span>` : ""; }
function initBroadcast() {
  try { if (window.Broadcast3D && Broadcast3D.supported()) { B3 = Broadcast3D.create($("court3d")); AUDIO = Broadcast3D.makeAudio(); } } catch (e) { console.warn("3D unavailable", e); B3 = null; }
  if (!B3) { V.view3d = false; $("court3d").hidden = true; $("court").hidden = false; $("cam").value = "tactical"; $("cam").disabled = true; $("q").disabled = true; $("rlast").disabled = true; }
  if (!ANN.ok) $("ann").disabled = true;
  try { const q = localStorage.getItem("ubl.quality"); if (q) { V.qMode = q; $("q").value = q; if (B3 && q !== "auto") B3.setQuality(q); } } catch (e) {}
  resize(); window.addEventListener("resize", resize);
  const togglePlay = () => { if (!GAME) return; if (V.intro) { endIntro(); return; } if (V.tick >= maxTicks() && !V.replay) { seek(0); } V.playing = !V.playing; setPlayBtn(); };
  $("play").onclick = togglePlay;
  $("rew").onclick = () => { if (GAME) seek(V.tick - 200); };
  $("end").onclick = () => { if (!GAME) return; seek(maxTicks()); V.playing = false; setPlayBtn(); updateAll(true); };
  $("scrub").oninput = e => { if (GAME) seek(+e.target.value); };
  $("subs").onchange = () => { V.visCount = -1; updateAll(true); };
  if ($("calls")) $("calls").onchange = () => { V.visCount = -1; updateAll(true); };
  if ($("plans")) $("plans").onclick = () => { const el = $("plancard"); if (el.classList.contains("on")) el.classList.remove("on"); else showPlanCard(frameVals().per >= 3); };
  $("cam").onchange = e => setView(e.target.value);
  $("q").onchange = e => { V.qMode = e.target.value; try { localStorage.setItem("ubl.quality", V.qMode); } catch (er) {} if (B3) B3.setQuality(V.qMode === "auto" ? "high" : V.qMode); };
  $("snd").onclick = () => { if (!AUDIO) return; const on = AUDIO.toggle(); $("snd").textContent = on ? "🔊" : "🔈"; $("snd").classList.toggle("on", on); };
  $("ann").onclick = () => { const on = ANN.toggle(); $("ann").classList.toggle("on", on); if (on) ANN.say("Announcer on.", 1); };
  $("rpl").onclick = () => { V.autoReplay = !V.autoReplay; $("rpl").classList.toggle("on", V.autoReplay); if (!V.autoReplay) stopReplay(); };
  $("rlast").onclick = replayLast;
  try { V.eraOn = localStorage.getItem("ubl.era") === "1"; } catch (e) {}
  $("era").onclick = () => { V.eraOn = !V.eraOn; try { localStorage.setItem("ubl.era", V.eraOn ? "1" : "0"); } catch (e) {} applyEra(); if (GAME && V.eraOn) lowerThird("#f2b134", ["MODERN HD", "1990s VIDEO", "1970s FILM", "1950s KINESCOPE"][eraMode()], "the broadcast look of " + (V.ctx && V.ctx.S ? V.ctx.S.season : "this season"), 2400); };
  $("box-tables").onclick = ev => { const t = ev.target.closest("[data-idx]"); if (t) { followPlayer(+t.dataset.idx); $("courtwrap").scrollIntoView({ behavior: "smooth", block: "nearest" }); } };
  if (B3) B3.onCue((kind, vol, pan, rate) => { if (AUDIO && AUDIO.on && V.speed <= 2 && AUDIO.sfx[kind]) AUDIO.sfx[kind](vol, pan, rate); });
  $("skipIntro").onclick = endIntro;
  $("reel").onclick = playReel;
  const playFrom = (ev, sel) => { const li = ev.target.closest(sel); if (!li || !B3 || !V.view3d) return; const n = NOTABLE[+li.dataset.n]; if (!n) return; stopReplay(); startReplay(packageFor(n)); $("courtwrap").scrollIntoView({ behavior: "smooth", block: "nearest" }); };
  $("top-list").onclick = ev => playFrom(ev, "li[data-n]");
  $("pbp-list").onclick = ev => playFrom(ev, "li[data-n]");
  $("fs").onclick = () => { const el = $("courtwrap"); try { if (document.fullscreenElement) document.exitFullscreen(); else (el.requestFullscreen || el.webkitRequestFullscreen).call(el); } catch (e) {} };
  document.addEventListener("fullscreenchange", () => setTimeout(resize, 50));
  document.querySelectorAll(".spd button").forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
  document.querySelectorAll(".bctabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".bctabs button").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll(".bctab").forEach(s => s.hidden = s.id !== "bc-" + b.dataset.t);
    V.visCount = -1; updateAll(true);
  });
  // swipe to change channel (not while orbiting the free camera)
  let sx = null;
  $("courtwrap").addEventListener("touchstart", e => { sx = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  $("courtwrap").addEventListener("touchend", e => { if (sx === null || !V.channels || (B3 && B3.camera === "free")) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 60) flip(V.ch + (dx < 0 ? 1 : -1)); sx = null; });
  document.addEventListener("keydown", e => {
    if ($("broadcast").hidden || !GAME || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.id !== "scrub") return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
    else if (k === "arrowright" || k === "arrowleft") { e.preventDefault(); const d = k === "arrowright" ? 1 : -1; if (V.channels) flip(V.ch + d); else seek(V.tick + d * 100); }
    else if (k === "j" || k === "l") seek(V.tick + (k === "l" ? 200 : -200));
    else if (k === "r") replayLast();
    else if (k === "s") setSpeed(V.speed < 1 ? (V.prevSpeed || 1) : (V.prevSpeed = V.speed, 0.25));
    else if (k === "c" && B3) { const i = CAMS.indexOf($("cam").value); setView(CAMS[(i + 1) % CAMS.length]); }
    else if (k === "f") $("fs").click();
    else if (k === "m") $("snd").click();
    else if (k === "a") $("ann").click();
    else if (k === "v") $("era").click();
    else if (k === "p") setView($("cam").value === "player" ? "auto" : "player");
    else if (/^[1-3]$/.test(k) && V.channels) flip(+k - 1);
    else if (k === "escape" && V.replay) { stopReplay(); updateAll(true); }
  });
  requestAnimationFrame(loop);
}
