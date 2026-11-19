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
    if (e.type === "tackle" && e.move && !e.moveFail && (e.result === "whiff" || e.result === "broken")) { label = MOVE_LABEL[e.move] + "!"; col = "#7cf"; big = e.move === "hurdle" || e.move === "stiff" ? 3 : 2; }
    else if (e.type === "fight") { label = e.brawl ? "BENCHES CLEAR!" : "FIGHT!"; col = "#ff4d4d"; big = 2; }
    else if (e.type === "tackle" && e.result === "flagrant") { label = e.targeting ? "TARGETING" : "FLAGRANT " + e.lvl; col = "#ff4d4d"; big = 2; }
    else if (e.type === "tackle" && e.result === "fumble" && e.drib) { label = "POPPED LOOSE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "down" && e.tech === "hit" && !e.gang) { label = "BIG HIT!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "down" && e.tech === "dive" && !e.gang) { label = "DIVING TACKLE!"; col = "#ff4d4d"; big = 3; }
    else if (e.type === "tackle" && e.result === "down" && e.gang) { label = "GANG TACKLE!"; col = "#ff4d4d"; big = 3; }
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
    if (e.type === "tackle" && e.move === "hurdle" && !e.moveFail) bonus += 2;
    if (label) out.push({ tk: e.tk, label, col, big, impact: big * 3 + bonus, e, i });
  }
  return out;
}

const MOVE_LABEL = { juke: "JUKE", spin: "SPIN MOVE", stiff: "STIFF-ARM", hurdle: "HURDLE" };
const BODY = { stinger: "neck", "bruised ribs": "ribs", "sprained ankle": "ankle", concussion: "head", "hamstring strain": "hamstring", "separated shoulder": "shoulder", "broken wrist": "wrist", "torn ACL": "knee" };
const CUSTOM_SETS = new Set(["horns", "spain", "split", "floppy", "elevator", "dho", "hammer"]);
const COVTAG = { drop: "DROP", hedge: "HEDGE", switch: "SWITCH", ice: "ICE", trap: "HIT TRAP" };
const seasonNow = () => V.ctx && V.ctx.S ? V.ctx.S.season : GAME && GAME.season ? GAME.season : 2000;
const htStr = i => { const h = GAME.roster[i].ht; return h ? Math.floor(h / 12) + "'" + (h % 12) + '"' : ""; };

// ---------- the chalkboard: the called set, drawn the way the coach drew it ----------
let chId = 0;
function zig(x1, y1, x2, y2) { // a dribble: the wavy line
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, n = Math.max(2, Math.round(L / 2.2)), nx = -dy / L, ny = dx / L;
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let i = 1; i <= n; i++) { const t = i / n, a = i === n ? 0 : (i % 2 ? 0.9 : -0.9); d += ` L${(x1 + dx * t + nx * a).toFixed(1)} ${(y1 + dy * t + ny * a).toFixed(1)}`; }
  return d;
}
// the half court with the basket at the top; spots are [feet out from the rim, feet across]
function setDiagram(key, roles, side, four) {
  const S = BB.SETS[key]; if (!S || !S.dia) return "";
  const id = "ah" + (++chId), sd = side || 1, ink = "#f4f1e4", P = q => [q[1] * sd, q[0]];
  const ln = (a, b) => `M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  let g = `<g fill="none" stroke="${ink}" stroke-opacity=".42" stroke-width=".4"><rect x="-25" y="-5.25" width="50" height="40"/><rect x="-8" y="-5.25" width="16" height="19"/><circle cx="0" cy="13.75" r="6"/>
    <path d="M-22 -5.25 L-22 8.95 A23.75 23.75 0 0 0 22 8.95 L22 -5.25"/>${four ? `<path d="M-25 16.58 A30 30 0 0 0 25 16.58" stroke-dasharray="1.4 1"/>` : ""}<path d="M-3 -1.25 L3 -1.25"/><circle cx="0" cy="0" r=".75"/></g>`;
  // the actions: cuts (solid), dribbles (wavy), passes (dashed), screens (a bar at the end)
  const spots = {}; for (const r in S.dia.o) spots[r] = P(S.dia.o[r]);
  for (const [r, f, t, k] of S.dia.a) {
    let a = P(f), b = P(t); const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const st = spots[r] && Math.hypot(a[0] - spots[r][0], a[1] - spots[r][1]) < 0.5 ? 2.4 : 0.4; a = [a[0] + ux * st, a[1] + uy * st];
    if (k === "s") { b = [b[0] - ux * 0.6, b[1] - uy * 0.6]; g += `<path d="${ln(a, b)} M${(b[0] - uy * 1.6).toFixed(1)} ${(b[1] + ux * 1.6).toFixed(1)} L${(b[0] + uy * 1.6).toFixed(1)} ${(b[1] - ux * 1.6).toFixed(1)}" stroke="${ink}" stroke-width=".55" fill="none" stroke-linecap="round"/>`; continue; }
    b = [b[0] - ux * 1.2, b[1] - uy * 1.2];
    const d = k === "d" ? zig(a[0], a[1], b[0], b[1]) : ln(a, b);
    g += `<path d="${d}" stroke="${ink}" stroke-width=".5" fill="none" stroke-linecap="round" stroke-linejoin="round"${k === "p" ? ` stroke-dasharray="1.3 1"` : ""} marker-end="url(#${id})"/>`;
  }
  // the players: their numbers where the coach put them; the ball starts with the handler
  const hasBall = S.dia.o.h ? "h" : S.dia.o.k ? "k" : null;
  for (const r in spots) {
    const [x, y] = spots[r], i = roles && roles[r] !== undefined ? roles[r] : -1, num = i >= 0 && GAME.roster[i] ? GAME.roster[i].num : "";
    g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.1" fill="#1f3a2c" stroke="${ink}" stroke-width=".45"/>`;
    g += num !== "" ? `<text x="${x.toFixed(1)}" y="${(y + 0.95).toFixed(1)}" font-family="Oswald,sans-serif" font-size="2.7" font-weight="700" fill="${ink}" text-anchor="middle">${num}</text>` : `<text x="${x.toFixed(1)}" y="${(y + 0.9).toFixed(1)}" font-family="Oswald,sans-serif" font-size="2.4" fill="${ink}" fill-opacity=".6" text-anchor="middle">${r === hasBall ? "1" : ""}</text>`;
    if (r === hasBall) g += `<circle cx="${(x + 1.9).toFixed(1)}" cy="${(y - 1.6).toFixed(1)}" r=".75" fill="#f2b134"/>`;
  }
  return `<svg viewBox="-26.5 -6.5 53 41" role="img" aria-label="${esc(S.name)} diagram"><defs><marker id="${id}" viewBox="0 0 6 6" refX="4.5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L6 3 L0 6 z" fill="${ink}"/></marker></defs>${g}</svg>`;
}
let chTimer = 0;
function showChalk(e, col) {
  const el = $("chalk"); if (!el || V.replay || V.intro || V.speed > 4 || !e.set) return;
  const S = BB.SETS[e.set]; if (!S || !S.dia || !(e.ato || e.hunt || CUSTOM_SETS.has(e.set))) return;
  if ($("plancard") && $("plancard").classList.contains("on")) return;
  el.style.setProperty("--c", col);
  el.innerHTML = `<div class="cht">${e.ato ? "<i>ATO</i>" : e.hunt ? "<i>MISMATCH</i>" : `<i>${esc(TB[e.team === 0 ? GAME.home : GAME.away].id)}</i>`}${esc(S.name)}</div>` + setDiagram(e.set, e.roles, e.side, seasonNow() >= 1979);
  el.classList.add("on"); clearTimeout(chTimer); chTimer = setTimeout(() => el.classList.remove("on"), V.speed >= 2 ? 2800 : 4000);
}
// the head game: heating up, ice cold, rattled, fired up
let psTimer = 0;
function psyTag(label, r, col, tint) {
  const el = $("psytag"); if (!el || V.replay || V.intro) return;
  el.style.setProperty("--c", col); el.style.setProperty("--t", tint);
  el.innerHTML = `<b>${label}</b>#${r.num} ${esc(r.short.split(" ").pop().toUpperCase())}`;
  el.classList.add("on"); clearTimeout(psTimer); psTimer = setTimeout(() => el.classList.remove("on"), 2600);
}
// the coverage on each ball screen: shown when it changes, or now and then as a reminder
let cvTimer = 0; const cvLast = [{ k: "", tk: -1e9 }, { k: "", tk: -1e9 }];
function covTag(e, col) {
  const el = $("covtag"), L = cvLast[e.team]; if (!el || V.replay || V.intro || !COVTAG[e.kind]) return;
  if (L.k === e.kind && e.tk - L.tk < 900 && e.kind !== "trap") return;
  L.k = e.kind; L.tk = e.tk;
  el.style.setProperty("--c", col);
  el.innerHTML = `<b>${COVTAG[e.kind]}</b>${e.on >= 0 ? "ON " + esc(GAME.roster[e.on].short.split(" ").pop().toUpperCase()) : ""}`;
  el.classList.add("on"); clearTimeout(cvTimer); cvTimer = setTimeout(() => el.classList.remove("on"), 1900);
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
function callout(label, col, sub) {
  if (V.replay) return;
  const el = $("callout"), arc = arcadeFX();
  el.classList.toggle("arc", arc);
  if (arc) { el.innerHTML = `<s class="rays"></s><b>${esc(label)}</b>${sub ? `<i>${esc(sub)}</i>` : ""}`; el.style.color = ""; el.style.setProperty("--cc", col); el.style.setProperty("--ray", hexA(col, 0.5)); }
  else { el.textContent = label; el.style.color = col; }
  el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
  clearTimeout(coTimer); coTimer = setTimeout(() => el.classList.remove("on"), arc ? 1700 : 1500);
}
// ---------- arcade presentation: big callouts, hit-stop, slow motion over the rim ----------
function arcadeFX() { return !V.eraOn; } // the era look keeps it authentic
function hexA(hex, a) { const n = parseInt(String(hex).slice(1), 16); return isNaN(n) ? `rgba(255,255,255,${a})` : `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; }
const h01 = x => { const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const ARCADE_LINES = { "BIG HIT!": ["BIG HIT!", "LEVELED!", "LIGHTS OUT!", "DESTROYED!"], "SLAM": ["SLAM!", "JAM!", "BOOM!", "THROWN DOWN!"], "SWAT!": ["SWAT!", "REJECTED!", "NOT IN HERE!"], "REJECTED": ["REJECTED!"],
  "JUKE!": ["ANKLES!", "BROKE HIS ANKLES!", "JUKE!"], "SPIN MOVE!": ["SPUN HIM!", "ANKLES!", "SPIN MOVE!"], "TACKLE!": ["TACKLE!", "STUFFED!", "PLANTED!"], "DIVING TACKLE!": ["DIVING TACKLE!", "SHOESTRING!"],
  "GANG TACKLE!": ["GANG TACKLE!", "DOGPILE!"], "FOUR!": ["FOUR!", "FROM DOWNTOWN!", "WAY DOWNTOWN!"], "POPPED LOOSE!": ["POPPED LOOSE!", "STRIPPED!"], "HURDLE!": ["HURDLE!", "RIGHT OVER HIM!"], "STIFF-ARM!": ["STIFF-ARM!", "GET OFF ME!"] };
function arcadeLabel(n) { const L = ARCADE_LINES[n.label]; return L ? L[Math.floor(h01(n.tk) * L.length)] : n.label; }
function arcadeSub(n) {
  const e = n.e; let i = e.pid;
  if (e.type === "tackle" && e.move && (e.result === "whiff" || e.result === "broken")) i = e.on; // the ball handler made the move
  else if (e.type === "fga" && !e.made && e.blk !== undefined && e.blk >= 0) i = e.blk;
  const r = i !== undefined && GAME.roster[i]; return r ? r.name.split(" ").slice(-1)[0].toUpperCase() : "";
}
let ARC = [];
function buildArc(game) { // the moments that get arcade time
  const out = [];
  for (const e of game.events) {
    if (e.type === "tackle" && (e.result === "down" || e.result === "fumble" || e.result === "flagrant") && (e.tech === "hit" || e.result === "flagrant")) out.push({ stop: e.tk + 3, ms: 140 });
    else if (e.type === "tackle" && (e.result === "down" || e.result === "fumble")) out.push({ stop: e.tk + 2, ms: 70 });
    else if (e.type === "fga" && e.made && e.dunk) out.push(h01(e.tk * 0.71) < 0.3 ? { slow: [e.tk - 16, e.tk - 1], k: 0.35, stop: e.tk, ms: 100 } : { stop: e.tk, ms: 60 }); // dunks are everywhere on this floor: only some get the slow motion
    else if (e.type === "fga" && e.blk !== undefined && e.blk >= 0 && e.swat) out.push({ stop: e.tk, ms: 90 });
    else if (e.type === "tackle" && e.result === "whiff" && (e.move === "juke" || e.move === "spin")) out.push({ slow: [e.tk - 6, e.tk + 18], k: 0.4 });
    if (e.type === "fga" && !e.dunk && game.frames) { // v12: every shot: a touch of slow motion while the ball is in the air
      const F = game.frames, FS = BB.C.FS; let f = Math.min(game.nFrames - 1, Math.floor(e.tk / 2)), n = 0;
      while (f > 0 && F[f * FS + 84] === 2 && n < 120) { f--; n++; }
      const rel = (f + 1) * 2; if (e.tk - rel >= 8) out.push({ slow: [rel + 2, e.tk + 1], k: 0.62 });
    }
  }
  return out;
}
function arcadeStep(t0, dt, now) {
  const step = dt * 20 * V.speed;
  if (!arcadeFX() || V.arcade === false || V.replay || V.channels || !V.view3d || V.speed > 4 || !B3) return t0 + step;
  if (V.freezeUntil && now < V.freezeUntil) return t0; // hit-stop: hold the frame a beat
  V.freezeUntil = 0;
  let rate = 1; for (const a of ARC) if (a.slow && t0 >= a.slow[0] && t0 < a.slow[1]) rate = Math.min(rate, a.k);
  let t1 = t0 + step * rate;
  for (const a of ARC) if (a.stop !== undefined && a.stop > t0 && a.stop <= t1) { t1 = a.stop; V.freezeUntil = now + a.ms; break; }
  return t1;
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
      if (e.dunk) return [pickLine([n + " throws it down!", "Oh, " + n + " with the hammer!", n + " rocks the rim!", "Flush! " + n + "!", "BOOM! " + n + " with authority!", n + " takes off... and throws it DOWN!"], k), 3];
      if (e.val === 3) return [pickLine([n + " for three... got it!", n + " buries the three.", n + ", from deep. Yes!"], k), 2];
      return Math.abs(k) % 3 === 0 ? [pickLine([n + " scores.", n + " gets it to go.", "Bucket, " + n + "."], k), 1] : null;
    case "tackle": {
      const o = lastName(e.on);
      if (e.move && !e.moveFail && (e.result === "whiff" || e.result === "broken")) return [e.move === "hurdle" ? pickLine([o + " goes right over the top of " + n + "!", "He hurdled him! " + o + " leaps right over " + n + "!"], k)
        : e.move === "stiff" ? pickLine(["Stiff-arm! " + o + " puts " + n + " on the floor!", o + " with the stiff-arm, and " + n + " wants no part of it!"], k)
        : e.move === "spin" ? pickLine([o + " spins right out of it!", "Spin move by " + o + ", and " + n + " grabs nothing but air!", o + " spun him around and left him sitting on the floor!"], k)
        : pickLine([o + " makes " + n + " miss!", "What a juke by " + o + "!", "Oh! " + o + " just broke " + n + "'s ankles!", "Somebody help " + n + " up! " + o + " left him on the floor!"], k), e.move === "hurdle" || e.move === "stiff" ? 3 : 2];
      if (e.result === "flagrant") return [pickLine(["Oh, that's dirty. " + n + " went in way too high. That's a flagrant.", "Flag on " + n + ". That was a cheap shot on " + o + "."], k) + (e.lvl === 2 ? " And he's been thrown out." : ""), 3];
      if (e.result === "fumble" && e.drib) return [pickLine(["Hit him on the dribble, and it's loose!", n + " times it perfectly. Ball on the floor!"], k), 3];
      if (e.result === "down" && e.tech === "hit") return [pickLine(["Oh, what a hit by " + n + "!", n + " blows up " + o + "! You felt that one in the upper deck!", "Boom! " + n + " lays the lumber on " + o + "!"], k), 3];
      if (e.result === "down" && e.tech === "dive") return [pickLine([n + " dives and takes out the legs. " + o + " is down.", "Shoestring tackle by " + n + "!"], k), 3];
      if (e.result === "down") return [pickLine(["Big hit! " + n + " puts " + o + " on the rubber!", "Tackle! " + n + " brings down " + o + ". Turnover!", "Oh! " + o + " gets leveled by " + n + "!"], k), 3];
      if (e.result === "late") return ["Late hit by " + n + ". That's a foul.", 2];
      if (e.result === "broken") return [o + " shrugs it off!", 2];
      return null;
    }
    case "call": {
      const S = e.set && BB.SETS[e.set], tm = teamOf(e.team).name;
      if (e.kind === "blob") return [pickLine(["Under their own basket, the " + tm + " go to the box set.", "Baseline out of bounds. Watch the screen for " + n + "."], k), 1];
      if (!S || !(e.ato || CUSTOM_SETS.has(e.set))) return null;
      if (e.ato) return [pickLine(["Out of the timeout, they'll run " + S.name + (n ? " for " + n : "") + ".", "Here's what the coach drew up: " + S.name + "."], k), 2];
      return Math.abs(k) % 3 === 0 ? [pickLine(["The " + tm + " into " + S.name + ".", S.name + " for " + (n || "the " + tm) + "."], k), 1] : null;
    }
    case "cover":
      if (e.kind === "trap") return Math.abs(k) % 2 ? [pickLine(["They trap " + lastName(e.on) + "!", "Two men on the ball. Here comes the trap!"], k), 2] : null;
      if (e.kind === "ice" && Math.abs(k) % 5 === 0) return ["They're icing the pick-and-roll, pushing him to the sideline.", 1];
      if (e.kind === "switch" && Math.abs(k) % 6 === 0) return ["They switch it.", 1];
      return null;
    case "mismatch": return e.v < 12 ? null : [pickLine(["Look at the mismatch: " + n + " has " + lastName(e.d) + " on him" + (e.kind === "post" ? ", and they're going to the post." : ". Clear it out!"), "They want " + n + " against " + lastName(e.d) + ". Smart basketball."], k), 2];
    case "injury": return [e.sev === 0 ? n + " is slow to get up. He's holding his " + (BODY[e.kind] || "shoulder") + "." : pickLine([n + " is down, and he's holding his " + (BODY[e.kind] || "leg") + ". That does not look good.", "Trainers are coming out for " + n + ". He took a shot to the " + (BODY[e.kind] || "body") + "."], k), 3];
    case "ejected": return [e.why === "fight" ? n + " is gone. Ejected for fighting." : e.why === "targeting" ? n + " is ejected for targeting. That was a hit to the head." : n + " has been tossed from this game.", 3];
    case "fight": return [e.brawl ? pickLine(["Here come the benches! This is a full-scale brawl!", "Oh no. Everybody's in it now. Both benches have emptied!"], k) : pickLine([n + " and " + lastName(e.on) + " are going at it! The officials are trying to get in there!", "Punches thrown! " + n + " and " + lastName(e.on) + " have to be separated!"], k), 3];
    case "enforcer": return [pickLine([n + " is going to remember that. Watch number " + GAME.roster[e.pid].num + " the next time " + lastName(e.on) + " has the ball.", "You can bet " + n + " has a message for " + lastName(e.on) + "."], k), 2];
    case "heat": return e.lvl > 0 ? [pickLine([n + " is heating up!", "Somebody find " + n + "! He's feeling it!", n + " is on fire!", "Light it up! " + n + " can't miss!"], k), 2] : Math.abs(k) % 2 ? [n + " just can't buy one tonight.", 1] : null;
    case "mood": return e.lvl < 0 ? (Math.abs(k) % 2 ? [n + " looks rattled after those hits.", 1] : null) : [pickLine([n + " is fired up now!", "That woke " + n + " up. He's angry."], k), 1];
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
    if (GAME.chase && GAME.chase.length && (e.type === "fga" || e.type === "ft" || e.type === "reb" || e.type === "to" || e.type === "tackle")) chaseCheck(e, i);
    switch (e.type) {
      case "fga":
        if (e.made) {
          pts = pts || boxScore(GAME, e.tk);
          if (AUDIO) { AUDIO.swish(); AUDIO.excite(homeTeam ? (e.dunk || e.val === 4 ? 1 : 0.5) : 0.15); if (homeTeam && (e.dunk || e.val === 4)) setTimeout(() => AUDIO.organ(e.tk), 1200); }
          const run = runAt(i), tm = teamOf(e.team);
          if (run >= 8 && Math.floor(run / 4) > Math.floor((run - e.val) / 4)) { lowerThird(col, `${run}-0 RUN`, `${esc(tm.city)} ${esc(tm.name)}`); ANN.say("The " + tm.name + " are on a " + run + " to nothing run.", 2); }
          else lowerThird(col, `#${r.num} ${esc(r.short)}`, `${pts[e.pid].pts} PTS${e.val === 4 ? " · FOUR!" : e.dunk ? " · DUNK" : ""}`);
        } else if (e.blk !== undefined && e.blk >= 0) { if (AUDIO) { AUDIO.excite(0.7); if (e.team === 1) AUDIO.chant("ooh"); } }
        else if (AUDIO && !e.dunk) { if (!(V.view3d && B3)) AUDIO.clank(); /* the 3D court plays the rim where the ball hits it */ if (e.val === 4 && Math.random() < 0.7) AUDIO.chant("ooh"); }
        break;
      case "tackle":
        if (e.move && !e.moveFail && (e.result === "whiff" || e.result === "broken")) { if (AUDIO) AUDIO.excite(e.team === 0 ? 0.5 : 0.9); lowerThird(COLORS[1 - e.team], `${MOVE_LABEL[e.move]} · ${esc(GAME.roster[e.on].short)}`, `${e.move === "hurdle" ? "right over" : e.move === "stiff" ? "plants" : "leaves"} ${esc(r.short)}${e.move === "stiff" ? " on the floor" : e.move === "hurdle" ? " on the dive" : " grabbing air"}`); }
        else if (e.result === "flagrant") { if (AUDIO) AUDIO.whistle(); lowerThird(col, `${e.targeting ? "TARGETING" : "FLAGRANT " + e.lvl} · ${esc(r.short)}`, (e.targeting ? "hit to the head · " : "") + (e.lvl === 2 ? "ejected · " : "") + "two shots and the ball", 4000); }
        else if (e.result === "nocall") { lowerThird(col, `NO CALL · ${esc(r.short)}`, `hit ${esc(GAME.roster[e.on].short)} after the release · play on`, 3000); }
        else if (e.result === "pileon") { if (AUDIO) AUDIO.whistle(); lowerThird(col, `PILE-ON · ${esc(r.short)}`, "third man in · foul, they keep the ball", 3200); }
        else if (e.result === "down") { if (AUDIO) { AUDIO.excite(0.9); AUDIO.whistle(); } lowerThird(col, (e.gang ? "GANG TACKLE · " : e.tech === "hit" ? "BIG HIT · " : e.tech === "dive" ? "DIVING TACKLE · " : "TACKLE · ") + esc(r.short) + (e.gang ? " +" + e.gang.length : ""), "turnover"); }
        else if (e.result === "fumble" && e.drib) { if (AUDIO) AUDIO.excite(1); lowerThird(col, "POPPED LOOSE · " + esc(r.short), `hit ${esc(GAME.roster[e.on].short)} on the dribble · live ball`); }
        else if (e.result === "fumble") { if (AUDIO) AUDIO.excite(1); lowerThird(col, "FUMBLE · " + esc(r.short), `jarred loose from ${esc(GAME.roster[e.on].short)} · live ball`); }
        else if (e.result === "rough") { if (AUDIO) AUDIO.whistle(); lowerThird(col, "ROUGHING · " + esc(r.short), "hit an airborne player · two shots"); }
        else if (e.result === "late" && AUDIO) AUDIO.whistle();
        break;
      case "recover": if (!e.own) lowerThird(col, "RECOVERED · " + esc(r.short), "turnover"); break;
      case "call": callTag(e, col); showChalk(e, col); break;
      case "cover": covTag(e, col); break;
      case "mismatch": if (e.v >= 12) lowerThird(col, `MISMATCH · #${r.num} ${esc(r.short)}`, `${htStr(e.pid)} on ${htStr(e.d)} ${esc(GAME.roster[e.d].short)} · ${e.kind === "post" ? "taking him to the post" : "clearing out for him"}`); break;
      case "injury": lowerThird(col, `INJURY · ${esc(r.short)}`, `${esc(e.kind)} · ${e.sev === 0 ? "done for the night" : "will not return"}`, 4500, true); break;
      case "ejected": lowerThird(col, `EJECTED · ${esc(r.short)}`, e.why === "fight" ? "fighting · he's gone" : e.why === "targeting" ? "targeting · a hit to the head" : "flagrant 2 · he's gone", 4000, true); break;
      case "dunkjudge": { const sc = e.scores.join("  "); lowerThird(e.total >= 48 ? "#d4af37" : "#3b82f6", `${esc(r.short)} · ${e.total}`, `${esc(e.move)} · judges ${sc}`, 4200, true); ANN.say(e.total === 50 ? `Fifty! A perfect score for the ${e.move}!` : e.made ? `The judges give that ${e.move} a ${e.total}.` : `He couldn't get it down. ${e.total} from the judges.`, 2); if (AUDIO) AUDIO.excite(e.total >= 46 ? 1 : 0.5); break; }
      case "dunkmiss": lowerThird("#8b95a5", `${esc(r.short)} · MISS`, `attempt ${e.try} of 3`, 1800); break;
      case "dunkround": lowerThird("#d4af37", e.round === 0 ? "FIRST ROUND" : e.round === 1 ? "THE FINAL" : "DUNK-OFF", e.round === 0 ? "two dunks each · the top two advance" : "two dunks for the title", 3000, true); break;
      case "dunkwin": lowerThird("#d4af37", `${esc(r.short)} WINS THE DUNK CONTEST`, "", 6000, true); ANN.say(`${r.name} is your dunk contest champion!`, 3); if (AUDIO) AUDIO.excite(1); break;
      case "fight": if (AUDIO) { AUDIO.excite(1); AUDIO.whistle(); } lowerThird("#ff4d4d", e.brawl ? "BENCHES CLEAR" : `FIGHT · ${esc(r.short)} & ${esc(GAME.roster[e.on].short)}`, e.brawl ? `${esc(r.short)} and ${esc(GAME.roster[e.on].short)} started it` : "the officials step in", 4500, true); break;
      case "enforcer": lowerThird(col, `ENFORCER · ${esc(r.short)}`, `has a message for ${esc(GAME.roster[e.on].short)}`, 3200); break;
      case "heat": psyTag(e.lvl > 0 ? "HEATING UP" : "ICE COLD", r, col, e.lvl > 0 ? "#ff9f43" : "#7cc6ff"); if (e.lvl > 0 && arcadeFX() && r) setTimeout(() => callout("ON FIRE!", "#ff8a1c", r.name.split(" ").slice(-1)[0].toUpperCase()), 900); break;
      case "mood": psyTag(e.lvl > 0 ? "FIRED UP" : "RATTLED", r, col, e.lvl > 0 ? "#ff6b6b" : "#c8b6ff"); break;
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
  for (const n of NOTABLE) if (n.tk > fromTick && n.tk <= toTick) { const a = arcadeFX(); callout(a ? arcadeLabel(n) : n.label, n.col, a ? arcadeSub(n) : ""); }
  if (window.cnOnPlay) cnOnPlay(GAME, fromTick, toTick, NOTABLE); // Classic Nights: coins for big plays you watch
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
  if (ctxx && ctxx.classic) return ctxx.classic;
  if (!ctxx || !ctxx.S) return null;
  const { row, S: sd } = ctxx, [gid, day, h, a, , , , , type] = row, rec = { [h]: [0, 0], [a]: [0, 0] };
  for (const g of sd.games) {
    if (g[8] !== 0) continue; if (type === 0 && g[1] >= day) continue;
    for (const [tm, won] of [[g[2], g[5] > g[6]], [g[3], g[6] > g[5]]]) if (rec[tm]) rec[tm][won ? 0 : 1]++;
  }
  let series = null;
  if (type === 1) {
    const w = { [h]: 0, [a]: 0 }; let n = 0;
    for (const g of sd.games) if (g[8] !== 0 && g[0] < gid && ((g[2] === h && g[3] === a) || (g[2] === a && g[3] === h))) { n++; w[g[5] > g[6] ? g[2] : g[3]]++; }
    series = n === 0 ? "Game 1" : w[h] === w[a] ? `Series tied ${w[h]}-${w[a]}` : w[h] > w[a] ? `${h} leads ${w[h]}-${w[a]}` : `${a} leads ${w[a]}-${w[h]}`;
  }
  const co = sd.coaches || {};
  return { rec, series, coach: [co[row[11]] ? co[row[11]].name : null, co[row[12]] ? co[row[12]].name : null], season: sd.season, type, day };
}
// the officials and the storylines: who's calling it, who's tired, who's sitting, who has a score to settle
function crewNames() { const c = GAME.ctx; return c && c.crew ? c.crew.map(id => GAME.refs[id] ? GAME.refs[id].name : "Ref #" + id) : []; }
function crewStyle() {
  const r = GAME.ctx && GAME.ctx.ref; if (!r) return "";
  const tight = r.w >= 1.04 ? "a tight crew" : r.w <= 0.96 ? "a let-them-play crew" : "a by-the-book crew";
  const flag = r.s >= 0.6 ? "quick to call a flagrant" : r.s <= 0.4 ? "slow to call a flagrant" : "";
  return tight + (flag ? ", " + flag : "");
}
function whistles(tk) { let n = 0; for (const e of GAME.events) { if (e.tk > tk) break; if (e.type === "foul") n++; } return n; }
function storylines() {
  const c = GAME.ctx || {}, out = [], nm2 = i => esc(GAME.roster[i].short), tn = t => esc(teamOf(t).name);
  if (c.riv >= 0.5) out.push(`Bad blood: the ${tn(1)} and ${tn(0)} do not like each other`); else if (c.riv >= 0.3) out.push(`A rivalry game`);
  const seen = new Set();
  for (const [a, b, w] of (c.gr || []).slice().sort((x, y) => y[2] - x[2])) { const k = Math.min(a, b) + "-" + Math.max(a, b); if (w < 0.5 || seen.has(k) || seen.size >= 2) continue; seen.add(k); out.push(`History between ${nm2(a)} and ${nm2(b)}`); }
  for (const i of c.rev || []) out.push(`Revenge game for ${nm2(i)} against his old team`);
  (c.b2b || []).forEach((b, t) => { if (b) out.push(`The ${tn(t)} are on the second night of a back-to-back`); });
  (c.mi || []).forEach((m, t) => { if (m >= 900 && !(c.b2b && c.b2b[t])) out.push(`The ${tn(t)} flew ${m.toLocaleString()} miles to get here`); });
  for (const r of GAME.restNames || []) out.push(`${esc(r.name)} sits tonight for the ${tn(r.t)} (rest)`);
  // v0.7
  if (GAME.allstar) out.unshift(`All-Star Sunday: East against West under full rules. The hits are real.`);
  const pri = { record: 0, season: 1, pass: 2, mile: 3 };
  for (const c of (GAME.chase || []).slice().sort((a, b) => pri[a.kind] - pri[b.kind]).slice(0, 2)) out.push(chaseLine(c));
  for (const l of (GAME.feudLines || []).slice(0, 1)) out.push(l);
  for (const l of (GAME.demandLines || []).slice(0, 1)) out.push(l);
  if (GAME.att) { const [n, cap] = GAME.att, f = n / cap; if (f >= 0.985) out.push(`A sellout: ${n.toLocaleString()} in the building`); else if (f < 0.5) out.push(`Plenty of empty seats: ${n.toLocaleString()} in a building that holds ${cap.toLocaleString()}`); }
  return out;
}
const CHASE_STAT = { pts: "points", reb: "rebounds", ast: "assists", stl: "steals", blk: "blocks", tkl: "tackles", btk: "broken tackles", dnk: "dunks", fpm: "fours", tpm: "threes" };
function chaseLine(c) {
  const nm = esc(GAME.roster[c.idx].name), st = CHASE_STAT[c.k];
  return c.kind === "mile" ? `${nm} needs ${c.need} ${st} for ${c.target.toLocaleString()} in his career`
    : c.kind === "record" ? `${nm} needs ${c.need} ${st} to pass ${esc(c.other)} for the all-time record`
    : c.kind === "season" ? `${nm} needs ${c.need} ${st} to break ${esc(c.other)}'s single-season record`
    : `${nm} needs ${c.need} ${st} to pass ${esc(c.other)} for No. ${c.rank} all-time`;
}
// the moment a chase ends, on the air
function chaseCheck(e, i) {
  if (!GAME.chase || !GAME.chase.length) return;
  const who = new Set([e.pid, e.ast, e.by, e.blk, e.on].filter(x => x !== undefined && x >= 0));
  const live = GAME.chase.filter(c => !c.done && who.has(c.idx)); if (!live.length) return;
  const box = boxScore(GAME, e.tk);
  for (const c of live) {
    const b = box[c.idx], v = c.k === "reb" ? b.oreb + b.dreb : b[c.k];
    if (v < c.need) continue;
    c.done = true;
    const nm = GAME.roster[c.idx], st = CHASE_STAT[c.k].toUpperCase();
    const title = c.kind === "mile" ? `${c.target.toLocaleString()} CAREER ${st}` : c.kind === "record" ? `THE ALL-TIME ${st} RECORD` : c.kind === "season" ? `SINGLE-SEASON ${st} RECORD` : `NO. ${c.rank} ALL-TIME IN ${st}`;
    setTimeout(() => lowerThird("#d4af37", title, `${esc(nm.short)}${c.other ? " passes " + esc(c.other) : ""}`, 5200, true), 900);
    ANN.say(c.kind === "mile" ? `And that's ${c.target.toLocaleString()} career ${CHASE_STAT[c.k]} for ${nm.name}!` : c.kind === "record" ? `${nm.name} has done it! The all-time ${CHASE_STAT[c.k]} record belongs to him!` : c.kind === "season" ? `There it is: ${nm.name} breaks the single-season record!` : `${nm.name} moves past ${c.other} into number ${c.rank} all-time!`, 3);
    if (AUDIO) AUDIO.excite(1);
  }
}
function introHTML() {
  const R = records(V.ctx), H = TB[GAME.home], A = TB[GAME.away];
  const tm = t => { const T = t ? A : H, rec = R && GAME.type !== 2 && R.rec[T.id]; return `<div class="tm" style="--c:${COLORS[t]}"><span class="cty">${R && R.yr ? R.yr[t] + " · " : ""}${esc(T.city)}</span><b>${esc(T.name)}</b><span class="rec">${rec ? rec[0] + "-" + rec[1] : ""}${R && R.coach[t] ? " · " + esc(R.coach[t]) : ""}</span></div>`; };
  const lu = t => `<ul style="--c:${COLORS[t]}">${GAME.roster.filter(r => r.t === t && r.starter).map(r => `<li><span class="num">${r.num}</span>${esc(r.short)}<em>${r.role === "SNIPER" ? "SN" : r.role === "BRUISER" ? "BR" : r.role}</em></li>`).join("")}</ul>`;
  const kick = R ? (R.classic ? `CLASSIC NIGHTS · ${esc(R.label)} · ${R.season} RULES` : `${R.season} · ${R.type === 2 ? "ALL-STAR SUNDAY" : R.type ? "PLAYOFFS · " + esc(R.series) : "DAY " + (R.day + 1)}`) : "UBL";
  return `<div class="cin"><div class="ck">UBL ON TV · ${kick}</div><div class="mu">${tm(1)}<div class="at">at</div>${tm(0)}</div>
    <div class="arena">${esc(H.arena || H.city + " Arena")} · ${esc(GAME.allstar && GAME.allstar.host && TB[GAME.allstar.host] ? TB[GAME.allstar.host].city : H.city)}${GAME.att ? ` · attendance ${GAME.att[0].toLocaleString()}${GAME.att[0] >= GAME.att[1] ? " (sellout)" : ""}` : ""}</div>
    <div class="lus">${lu(1)}${lu(0)}</div>
    ${crewNames().length ? `<div class="crew"><b>Officials</b> ${crewNames().map((n, i) => esc(n) + (i === 0 ? " <em>(crew chief)</em>" : "")).join(" · ")}<span>${esc(crewStyle())}</span></div>` : ""}
    ${storylines().length ? `<ul class="story">${storylines().slice(0, 4).map(x => `<li>${x}</li>`).join("")}</ul>` : ""}
    <button class="skip" data-a="skip">Tip it off ▶</button></div>`;
}
const POSN = { PG: "guard", SNIPER: "guard", WING: "forward", BRUISER: "forward", BIG: "center" };
const INTRO_CARD = 4.2, INTRO_EACH = 2.0;
function introStarters() { return GAME.roster.filter(r => r.t === 0 && r.starter); }
function newIntro() { const now = performance.now(); return { t0: now, step: -1, until: now + (INTRO_CARD + 5 * INTRO_EACH + 0.6) * 1000 }; }
function startIntro() {
  V.intro = newIntro(); showCard("intro", introHTML()); $("skipIntro").hidden = false;
  const st = storylines().map(x => x.replace(/<[^>]+>/g, ""));
  ANN.say(`Welcome to ${TB[GAME.home].arena || TB[GAME.home].city}, where the ${TB[GAME.away].name} take on the ${TB[GAME.home].name}.${st.length ? " " + st[0] + "." : ""}`, 2);
}
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
    <div class="leaders">${lead(1)}${lead(0)}</div>
    ${crewNames().length ? `<div class="crew sm"><b>The crew</b> ${whistles(e.tk)} whistles so far<span>${esc(crewStyle())}</span></div>` : ""}</div>`;
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
    <div class="recapl">${gameRecap().slice(1, 4).map(x => `<p>${x}</p>`).join("")}</div>
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
  const key = e.type === "fga" ? (e.dunk ? tk - 3 : e.blk !== undefined && e.blk >= 0 ? tk : releaseTick(tk)) : tk; // the moment the replay slows down for
  for (const c of clips) if (c.key === undefined) c.key = key;
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
  else { const w = c.key !== undefined ? Math.exp(-Math.pow((R.t - c.key) / 9, 2)) : 0; R.eff = lerp(Math.min(1, c.rate * 1.9), c.rate * 0.42, w); R.t = Math.min(c.to, R.t + dt * 20 * R.eff); if (R.t < c.to) return; } // speed ramp
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
  tackled: "their ball handlers keep getting buried", star: "he's taking over", stuck: "the offense has stalled", pnr: "the pick-and-roll is killing them" };
function adjustText(e) {
  const S = BB.SYSTEMS, SC = BB.SCHEMES, HI = BB.HITS;
  let what;
  if (e.key === "sys") what = `switch to ${S[e.to].name} on offense`;
  else if (e.key === "scheme") what = e.to === "goalie" ? `go to the Goalie: ${esc(GAME.roster[e.pid].short)} stays home` : e.to === "extend" ? "extend out to the four-point line" : e.to === "zone" ? "drop into a zone" : `switch to ${SC[e.to].name}`;
  else if (e.key === "hit") what = e.to === "blitz" ? "start blitzing the ball handler" : e.to === "contain" ? "pull back to Contain tackling" : "stop sending tacklers";
  else if (e.key === "double") what = `start doubling ${esc(GAME.roster[e.pid].short)}`;
  else if (e.key === "cov") what = `switch the pick-and-roll coverage to ${BB.COVERS[e.to].name}`;
  return what + (WHY[e.why] ? ` (${WHY[e.why]})` : "");
}
function callText(e) {
  const P = e.pid >= 0 ? nm(e.pid) : "", W = e.w >= 0 ? nm(e.w) : "";
  const S = e.set && BB.SETS[e.set], pre = e.ato ? "Out of the timeout, " : e.hunt ? "Hunting the mismatch, " : "";
  if (S && CUSTOM_SETS.has(e.set)) return `${pre}${tnm(e.team)} runs <b>${S.name}</b>${P ? ` for ${P}` : ""}`;
  if (pre && S) return `${pre}${tnm(e.team)} ${e.kind === "post" ? `goes to ${P} in the post` : e.kind === "iso" ? `clears out for ${P}` : `runs a ${S.name.toLowerCase()} for ${P}`}`;
  switch (e.kind) {
    case "blob": return `${tnm(e.team)} runs a box set under its own basket. ${W} finds ${P}`;
    case "slip": return `${P} slips the screen`;
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
    case "cover": {
      const o = e.on >= 0 ? nm(e.on) : "";
      if (e.kind === "switch") return [`${nm(e.pid)} switches onto ${o}`, "m call"];
      if (e.kind === "hedge") return [`${nm(e.pid)} hedges hard on ${o}`, "m call"];
      if (e.kind === "trap") return [`TRAP: two men on ${o}`, "m call"];
      if (e.kind === "ice") return [`${tnm(e.team)} ices the screen and sends ${o} to the sideline`, "m call"];
      return null; // drop is the default: no need to say it every time
    }
    case "mismatch": return [`MISMATCH: ${tnm(e.team)} goes at ${nm(e.d)} with ${nm(e.pid)} ${e.kind === "post" ? "in the post" : "in isolation"} <span class="m">(${htStr(e.pid)} vs ${htStr(e.d)})</span>`, "call"];
    case "scram": return [`${nm(e.pid)} and ${nm(e.w)} scram-switch to fix the mismatch`, "m call"];
    case "injury": return [e.sev === 0 ? `${nm(e.pid)} is shaken up (${esc(e.kind)}) and heads to the locker room` : `INJURY: ${nm(e.pid)} goes down with a ${esc(e.kind)} and won't return`, "hot"];
    case "ejected": return [`${nm(e.pid)} has been ejected${e.why === "fight" ? " for fighting" : e.why === "targeting" ? " for targeting" : ""}`, "hot"];
    case "fight": return [`${e.brawl ? "BRAWL: the benches clear after " : "FIGHT: "}${nm(e.pid)} and ${nm(e.on)} ${e.brawl ? "square off" : "trade punches"}${e.join && e.join.length && !e.brawl ? ` <span class="m">(${e.join.map(i => esc(GAME.roster[i].short)).join(", ")} in to separate them)</span>` : ""}`, "hot"];
    case "enforcer": return [`${nm(e.pid)} will be looking for ${nm(e.on)}`, "m"];
    case "heat": return [e.lvl > 0 ? `${nm(e.pid)} is heating up` : `${nm(e.pid)} has gone ice cold`, "m"];
    case "mood": return [e.lvl > 0 ? `${nm(e.pid)} is fired up` : `${nm(e.pid)} looks rattled`, "m"];
    case "whistle": return e.kind === "injury" ? [`The officials stop play for the injured player`, "m"] : null;
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
      if (e.move && !e.moveFail && e.result === "whiff") return [e.move === "hurdle" ? `HURDLE! ${nm(e.on)} leaps right over the diving ${nm(e.pid)}` : `JUKE! ${nm(e.on)} makes ${nm(e.pid)} miss`, "hot"];
      if (e.move && !e.moveFail && e.result === "broken") return [e.move === "stiff" ? `STIFF-ARM! ${nm(e.on)} puts ${nm(e.pid)} on the floor` : `SPIN MOVE! ${nm(e.on)} spins out of ${nm(e.pid)}'s tackle`, "hot"];
      if (e.result === "flagrant") return [e.targeting ? `TARGETING: ${nm(e.pid)} hits ${nm(e.on)} in the head. He's ejected. Two shots and the ball` : `FLAGRANT ${e.lvl}: ${nm(e.pid)} ${e.tech === "hit" ? "launches into" : "takes a cheap shot at"} ${nm(e.on)}${e.lvl === 2 ? ". He's ejected" : ""}. Two shots and the ball`, "hot"];
      if (e.result === "nocall") return [`${nm(e.pid)} hits ${nm(e.on)} after the release. No call`, ""];
      if (e.result === "pileon") return [`${nm(e.pid)} piles on as the third man in. Foul, and they keep the ball`, ""];
      if (e.result === "fumble" && e.drib) return [e.broke ? `${nm(e.on)} breaks ${nm(e.pid)}'s tackle but loses the dribble. Live ball` : `POPPED LOOSE! ${nm(e.pid)} hits ${nm(e.on)} on the dribble. Live ball`, "hot"];
      if (e.result === "down" && !e.gang && e.tech === "hit") return [`BIG HIT! ${nm(e.pid)} levels ${nm(e.on)}. Turnover`, "hot"];
      if (e.result === "down" && !e.gang && e.tech === "dive") return [`${nm(e.pid)} dives at ${nm(e.on)}'s legs and takes him down. Turnover`, "hot"];
      if (e.result === "broken" && e.moveFail) return [`${nm(e.on)}'s ${MOVE_LABEL[e.move].toLowerCase()} doesn't fool ${nm(e.pid)}, but he breaks the tackle anyway`, ""];
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
      if (e.kind === "roughing" || e.kind === "flagrant" || e.kind === "pileon") return null;
      return [`Foul on ${nm(e.pid)} <span class="m">(${e.pf} PF${e.kind === "shooting" ? ", shooting" : ""})</span>`, "m"];
    case "fouledout": return [`${nm(e.pid)} has fouled out`, "hot"];
    case "timeout": return [`Timeout, ${esc(teamOf(e.team).name)}`, "m"];
    case "sub": return [`${nm(e.inn)} checks in for ${nm(e.out)}${e.why === "injury" ? " <span class=\"m\">(injury)</span>" : e.why === "ejected" ? " <span class=\"m\">(ejection)</span>" : e.why === "fouls" ? " <span class=\"m\">(foul trouble)</span>" : e.why === "closer" ? " <span class=\"m\">(closing lineup)</span>" : e.why === "hack" ? " <span class=\"m\">(getting him away from the hack)</span>" : ""}`, "m sub"];
    case "period_end": return [`End of ${perName(e.per)}`, "sep"];
    case "final": return [`FINAL`, "sep"];
  }
  return null;
}
function renderPBP(n) {
  const E = GAME.events, out = [], showSubs = $("subs").checked, showCalls = !$("calls") || $("calls").checked;
  for (let i = n - 1; i >= 0 && out.length < 250; i--) {
    const e = E[i]; if (e.type === "sub" && !showSubs) continue; if ((e.type === "call" || e.type === "cover" || e.type === "scram") && !showCalls) continue;
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
  const S = e.set && BB.SETS[e.set], label = e.kind === "blob" ? "BASELINE OUT · BOX" : e.kind === "slip" ? "SLIP" : S && S.fam !== "flow" ? S.name.toUpperCase() : TAG[e.kind];
  const el = $("calltag"); if (!el || !label || ($("plancard") && $("plancard").classList.contains("on"))) return;
  const who = e.kind === "double" || e.kind === "hack" ? e.w : e.pid, r = who >= 0 ? GAME.roster[who] : null;
  el.style.setProperty("--c", col);
  el.innerHTML = `<b>${e.ato ? "AFTER TIMEOUT · " : e.hunt ? "MISMATCH · " : ""}${label}</b>${r ? `<span>#${r.num} ${esc(r.short.split(" ").pop().toUpperCase())}</span>` : ""}`;
  el.classList.add("on"); clearTimeout(ctTimer); ctTimer = setTimeout(() => el.classList.remove("on"), 2600);
}
function planOf(t, upto) { const R = strategyReport(GAME, upto === undefined ? 1e12 : upto); return R[t]; }
function curPlan(t, upto) {
  const R = planOf(t, upto), p = R.plan; if (!p) return null;
  const cur = { off: p.off, def: p.def, hit: p.hit, dbl: p.dbl, goalie: p.goalie, pace: p.pace, crash: p.crash, leak: p.leak, cov: p.cov };
  for (const a of R.adjust) { if (a.key === "cov") cur.cov = a.to; if (a.key === "sys") { cur.off = a.to; if (a.pace !== undefined) { cur.pace = a.pace; cur.crash = a.crash; cur.leak = a.leak; } } if (a.key === "scheme") { cur.def = a.to; if (a.to === "goalie") cur.goalie = a.pid; } if (a.key === "hit") cur.hit = a.to; if (a.key === "double") cur.dbl = a.pid; }
  return { p, cur, R };
}
let pcTimer = 0;
function showPlanCard(half) {
  const el = $("plancard"); if (!el || !GAME) return;
  if ($("chalk")) $("chalk").classList.remove("on");
  const rows = [1, 0].map(t => {
    const x = curPlan(t, half ? V.tick : 0); if (!x) return "";
    const tm = TB[t === 0 ? GAME.home : GAME.away], c = x.cur;
    const coach = GAME.coachNames && GAME.coachNames[t] ? `<small>Coach ${esc(GAME.coachNames[t])}</small>` : "";
    const changes = half ? x.R.adjust.filter(a => a.tk <= V.tick).map(a => `<li>${adjustText(a)}</li>`).join("") : "";
    return `<div class="pc" style="--c:${COLORS[t]}"><div class="pch"><b>${esc(tm.city)} ${esc(tm.name)}</b>${coach}</div>
      <div class="pcg"><span>Offense</span><b>${BB.SYSTEMS[c.off].name}</b><span>Defense</span><b>${BB.SCHEMES[c.def].name}${c.def === "goalie" && c.goalie >= 0 ? ` <i>${esc(GAME.roster[c.goalie].short)} stays home</i>` : ""}</b>
      <span>Tackling</span><b>${BB.HITS[c.hit].name}</b>${c.cov && BB.COVERS[c.cov] && c.def !== "zone" ? `<span>Ball screens</span><b>${BB.COVERS[c.cov].name}</b>` : ""}<span>Go-to guy</span><b>${esc(GAME.roster[x.p.star].short)}</b>${c.dbl >= 0 ? `<span>Doubling</span><b>${esc(GAME.roster[c.dbl].short)}</b>` : ""}</div>
      ${half ? (changes ? `<ul class="pcx">${changes}</ul>` : `<p class="pcx">No changes at the half.</p>`) : ""}</div>`;
  }).join("");
  el.innerHTML = `<div class="pct">${half ? "HALFTIME ADJUSTMENTS" : "TONIGHT'S GAMEPLANS"}</div>${rows}`;
  el.classList.add("on"); clearTimeout(pcTimer); pcTimer = setTimeout(() => el.classList.remove("on"), half ? 9000 : 8000);
}
function renderStrategy() {
  const el = $("strat-body"); if (!el || !GAME) return;
  const R = strategyReport(GAME, V.tick), PT = BB.PT_LABEL, fin = V.tick >= GAME.ticks - 2;
  let h = fin ? `<h3>Why it went the way it did</h3><div class="recap">${gameRecap().map(x => `<p>${x}</p>`).join("")}</div>` : "";
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
      ${c.cov && BB.COVERS[c.cov] && c.def !== "zone" ? `<dt>Ball screens</dt><dd><b>${BB.COVERS[c.cov].name}</b> <span class="m">${BB.COVERS[c.cov].blurb}</span></dd>` : ""}
      ${p.scout && (p.scout.hit.length || p.scout.under.length || p.scout.lock.length) ? `<dt>Scouting</dt><dd><ul class="scout">${p.scout.hit.map(i => `<li>Go after ${nm(i)}: careless with the ball</li>`).join("")}${p.scout.under.map(i => `<li>Go under screens on ${nm(i)}: can't shoot it</li>`).join("")}${p.scout.lock.map(i => `<li>Never leave ${nm(i)}</li>`).join("")}</ul></dd>` : ""}
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
  // the playbook: every set called tonight, with what it produced
  const setKeys = Object.keys(BB.SETS).filter(k => k !== "flow" && ((R[0].sets[k] && R[0].sets[k].n) || (R[1].sets[k] && R[1].sets[k].n))).concat((R[0].sets.blob || R[1].sets.blob) ? ["blob"] : []);
  if (setKeys.length) {
    const sv = (t, k) => { const x = R[t].sets[k]; return x ? [x.n, x.pts, x.att] : [0, 0, 0]; };
    setKeys.sort((a, b) => (sv(0, b)[0] + sv(1, b)[0]) - (sv(0, a)[0] + sv(1, a)[0]));
    h += `<h3>Playbook</h3><div class="tw"><table class="box strat"><thead><tr><th class="pn">Set</th><th>${A} calls</th><th>${A} pts (shots)</th><th>${Hm} calls</th><th>${Hm} pts (shots)</th></tr></thead><tbody>`;
    for (const k of setKeys) { const a = sv(1, k), b = sv(0, k); h += `<tr><td class="pn">${k === "blob" ? "Baseline out (box)" : BB.SETS[k].name}</td><td>${a[0]}</td><td class="b">${a[1]} <span class="m">(${a[2]})</span></td><td>${b[0]}</td><td class="b">${b[1]} <span class="m">(${b[2]})</span></td></tr>`; }
    h += `</tbody></table></div>`;
    const drawn = setKeys.filter(k => CUSTOM_SETS.has(k));
    if (drawn.length) h += `<div class="pbook">${drawn.map(k => { const a = sv(1, k), b = sv(0, k); return `<div class="pb"><div class="cht">${BB.SETS[k].name}</div>${setDiagram(k, null, 1, seasonNow() >= 1979)}<div class="pbs">${A} ${a[1]} pts/${a[2]} · ${Hm} ${b[1]} pts/${b[2]}</div></div>`; }).join("")}</div>`;
  }
  // pick-and-roll coverage: what each defense showed, and what it gave up
  const covKeys = Object.keys(BB.COVERS).filter(k => R[0].cover[k] || R[1].cover[k]);
  if (covKeys.length) {
    const cv = (t, k) => `${R[t].cover[k] || 0}${R[t].covAtt[k] ? ` <span class="m">· ${R[t].covPts[k] || 0} pts on ${R[t].covAtt[k]} shots</span>` : ""}`;
    h += `<h3>Pick-and-roll defense</h3><div class="tw"><table class="box strat"><thead><tr><th class="pn">Coverage</th><th>${A} used (allowed)</th><th>${Hm} used (allowed)</th></tr></thead><tbody>`;
    for (const k of covKeys) h += `<tr><td class="pn">${BB.COVERS[k].name}</td><td>${cv(1, k)}</td><td>${cv(0, k)}</td></tr>`;
    h += `<tr><td class="pn">Mismatches hunted (on offense) / scram switches (on defense)</td><td>${R[1].mismatch} / ${R[1].scram}</td><td>${R[0].mismatch} / ${R[0].scram}</td></tr></tbody></table></div>`;
  }
  // the hitting
  const tk = t => R[t].tk, f = (t, k) => R[t].fouls[k] || 0;
  const techS = t => ["hit", "wrap", "dive"].map(k => R[t].tech[k] || 0).join(" / ");
  const moveS = t => { const m = R[t].moves, tr = R[t].movesTried, ks = Object.keys(tr); return ks.length ? ks.map(k => `${(m[k] || 0)}/${tr[k]} ${MOVE_LABEL[k].toLowerCase()}`).join(", ") : "–"; };
  h += `<h3>Tackling</h3><div class="tw"><table class="box strat"><thead><tr><th class="pn"></th><th>${A}</th><th>${Hm}</th></tr></thead><tbody>
    <tr><td class="pn">Tackles for a turnover</td><td class="b">${tk(1).down}</td><td class="b">${tk(0).down}</td></tr>
    <tr><td class="pn">Fumbles forced / recovered</td><td>${tk(1).fumble} / ${R[1].recov}</td><td>${tk(0).fumble} / ${R[0].recov}</td></tr>
    <tr><td class="pn">Gang tackles</td><td>${tk(1).gang}</td><td>${tk(0).gang}</td></tr>
    <tr><td class="pn">Broken tackles allowed</td><td>${tk(1).broken}</td><td>${tk(0).broken}</td></tr>
    <tr><td class="pn">Whiffs</td><td>${tk(1).whiff}</td><td>${tk(0).whiff}</td></tr>
    <tr><td class="pn">Hit on the dribble (popped loose)</td><td>${tk(1).pop}</td><td>${tk(0).pop}</td></tr>
    <tr><td class="pn">Big hits / wrap-ups / dives</td><td>${techS(1)}</td><td>${techS(0)}</td></tr>
    <tr><td class="pn">Ball handlers' moves (beat the tackler / tried)</td><td>${moveS(1)}</td><td>${moveS(0)}</td></tr>
    <tr><td class="pn">Late hits / roughing / flagrants</td><td>${tk(1).late} / ${tk(1).rough} / ${tk(1).flagrant}</td><td>${tk(0).late} / ${tk(0).rough} / ${tk(0).flagrant}</td></tr>
    <tr><td class="pn">Sets called (after timeouts)</td><td>${Object.values(R[1].sets).reduce((a, x) => a + x.n, 0)} (${R[1].ato})</td><td>${Object.values(R[0].sets).reduce((a, x) => a + x.n, 0)} (${R[0].ato})</td></tr>
    <tr><td class="pn">Play calls (P&amp;R / iso / post / screens)</td><td>${R[1].calls.pnr || 0} / ${R[1].calls.iso || 0} / ${R[1].calls.post || 0} / ${R[1].calls.offscr || 0}</td><td>${R[0].calls.pnr || 0} / ${R[0].calls.iso || 0} / ${R[0].calls.post || 0} / ${R[0].calls.offscr || 0}</td></tr>
    <tr><td class="pn">Doubles / intentional fouls / hacks</td><td>${R[1].calls.double || 0} / ${f(1, "intentional")} / ${f(1, "hack")}</td><td>${R[0].calls.double || 0} / ${f(0, "intentional")} / ${f(0, "hack")}</td></tr>
    </tbody></table></div>`;
  // the officials and the head game
  const fts = R[0].fights.concat(R[1].fights).sort((a, b) => a.tk - b.tk);
  const heads = [1, 0].flatMap(t => R[t].heat.map(e => [e.tk, `${nm(e.pid)} ${e.lvl > 0 ? "heated up" : "went ice cold"}`]).concat(R[t].mood.map(e => [e.tk, `${nm(e.pid)} ${e.lvl > 0 ? "got fired up" : "was rattled"}`])).concat(R[t].marks.map(e => [e.tk, `${nm(e.pid)} went looking for ${nm(e.on)}`]))).sort((a, b) => a[0] - b[0]);
  if (crewNames().length || fts.length || heads.length) {
    h += `<h3>The officials and the head game</h3>`;
    if (crewNames().length) h += `<p class="crewp"><b>Crew:</b> ${crewNames().map(esc).join(", ")} <span class="m">· ${esc(crewStyle())} · ${whistles(V.tick)} whistles, ${R[0].nocall + R[1].nocall} late hits let go</span></p>`;
    if (fts.length) h += `<ul class="injl">${fts.map(e => `<li>${e.brawl ? "Brawl" : "Fight"}: ${nm(e.pid)} and ${nm(e.on)}, ${perName(e.per)} ${fmtClock(e.clk)}</li>`).join("")}</ul>`;
    if (heads.length) h += `<ul class="injl">${heads.slice(0, 10).map(x => `<li>${x[1]}</li>`).join("")}</ul>`;
  }
  // who got hurt, who got tossed
  const hurt = [1, 0].flatMap(t => R[t].inj.map(e => `<li>${nm(e.pid)} <span class="m">(${esc(teamOf(t).name)})</span>: ${esc(e.kind)}, ${perName(e.per)} ${fmtClock(e.clk)}</li>`).concat(R[t].ejected.map(e => `<li>${nm(e.pid)} <span class="m">(${esc(teamOf(t).name)})</span>: ejected, ${perName(e.per)} ${fmtClock(e.clk)}</li>`)));
  if (hurt.length) h += `<h3>Injuries and ejections</h3><ul class="injl">${hurt.join("")}</ul>`;
  // personnel
  h += `<h3>Personnel</h3><div class="sgrid">` + [1, 0].map(t => {
    const x = curPlan(t, 0), rot = x ? x.p.rot : [], jobs = new Map(x ? x.p.jobs : []);
    return `<div class="splan" style="--c:${COLORS[t]}"><ul class="pers">${rot.map(i => { const r = GAME.roster[i]; return `<li><span class="num">${r.num}</span>${esc(r.short)} <span class="m">${r.role === "SNIPER" ? "SN" : r.role === "BRUISER" ? "BR" : r.role}</span> <b>${BB.ARCH[r.arch] ? BB.ARCH[r.arch].name : ""}</b> <span class="m">· ${BB.DARCH[r.darch] || ""}${jobs.has(i) && jobs.get(i) !== "space" ? " · " + BB.JOBS[jobs.get(i)] : ""}</span></li>`; }).join("")}</ul></div>`;
  }).join("") + `</div>`;
  el.innerHTML = h;
}

// ---------- the recap: why the game went the way it did, from the event log ----------
function gameRecap() {
  const E = GAME.events, R = strategyReport(GAME), sc = GAME.score, w = sc[0] > sc[1] ? 0 : 1, l = 1 - w;
  const TN = t => esc(teamOf(t).name), full = t => esc(teamOf(t).city + " " + teamOf(t).name), out = [];
  const TP = t => TN(t) + (/s$/.test(teamOf(t).name) ? "'" : "'s"), pl = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  // the result, and how far back the winner came from
  let deficit = 0; for (const e of E) if (e.s0 !== undefined) deficit = Math.max(deficit, w === 0 ? e.s1 - e.s0 : e.s0 - e.s1);
  const ot = GAME.periods > 4 ? (GAME.periods === 5 ? " in overtime" : ` in ${GAME.periods - 4} overtimes`) : "";
  out.push(`The ${full(w)} beat the ${full(l)}, ${sc[w]}-${sc[l]}${ot}${deficit >= 10 ? `, after trailing by ${deficit}` : ""}.`);
  // what worked on offense
  const bestSet = t => { let bk = null, bv = 0; for (const k in R[t].sets) { const x = R[t].sets[k]; if (k !== "flow" && x.att >= 3 && x.pts > bv) { bv = x.pts; bk = k; } } return bk; };
  const ws = bestSet(w);
  if (ws && R[w].sets[ws].pts >= 8) { const x = R[w].sets[ws]; out.push(`The ${TP(w)} best call was ${ws === "blob" ? "the baseline box set" : BB.SETS[ws].name}: ${x.pts} points on ${x.att} shots.`); }
  else { let bk = null, bv = 0; for (const k in R[w].pts) if (k !== "ft" && R[w].pts[k] > bv) { bv = R[w].pts[k]; bk = k; } if (bk && BB.PT_LABEL[bk]) out.push(`The ${TN(w)} did their damage on ${BB.PT_LABEL[bk].toLowerCase()}: ${bv} points.`); }
  // the pick-and-roll defense
  const mainCov = t => { let bk = null, bv = 0; for (const k in R[t].covAtt) if (R[t].covAtt[k] > bv) { bv = R[t].covAtt[k]; bk = k; } return bk; };
  const lc = mainCov(l), wc = mainCov(w), ppa = (t, k) => (R[t].covPts[k] || 0) / R[t].covAtt[k];
  if (lc && R[l].covAtt[lc] >= 7 && ppa(l, lc) >= 1.2) out.push(`The ${TP(l)} ${BB.COVERS[lc].name.toLowerCase()} coverage got picked apart: ${R[l].covPts[lc] || 0} points on ${R[l].covAtt[lc]} shots out of the pick-and-roll.`);
  else if (wc && R[w].covAtt[wc] >= 6 && ppa(w, wc) <= 0.85) out.push(`The ${TP(w)} ${BB.COVERS[wc].name.toLowerCase()} coverage held up: ${R[w].covPts[wc] || 0} points on ${R[w].covAtt[wc]} pick-and-roll shots.`);
  // the hitting
  const take = t => R[t].tk.down + R[t].tk.fumble, miss = t => R[t].tk.broken + R[t].tk.whiff;
  if (take(w) >= take(l) + 3) out.push(`The hitting swung it: the ${TN(w)} forced ${take(w)} turnovers with the tackle (${pl(R[w].tk.down, "tackle")}, ${pl(R[w].tk.fumble, "fumble")}) to the ${TP(l)} ${take(l)}.`);
  else if (miss(l) >= 12 && miss(l) >= miss(w) + 4) out.push(`The ${TN(l)} couldn't wrap up: ${miss(l)} broken tackles and missed hits.`);
  // the adjustment that turned it
  let adj = null, adv = 5;
  for (const e of E) if (e.type === "adjust") { const fs = e.team === 0 ? sc[0] - e.s0 : sc[1] - e.s1, as = e.team === 0 ? sc[1] - e.s1 : sc[0] - e.s0; if (fs - as > adv) { adv = fs - as; adj = { e, fs, as }; } }
  if (adj) out.push(`In the ${perLong(adj.e.per).toLowerCase()} quarter the ${TN(adj.e.team)} decided to ${adjustText(adj.e)}, and won the rest of the game ${adj.fs}-${adj.as}.`.replace("ot quarter", "overtime"));
  // the highlight, the injuries, the ejections
  const hl = E.find(e => e.type === "tackle" && e.move && !e.moveFail && (e.move === "hurdle" || e.move === "stiff") && (e.result === "whiff" || e.result === "broken"));
  if (hl) out.push(`Play of the night: ${nm(hl.on)} ${hl.move === "hurdle" ? "hurdled the diving" : "stiff-armed"} ${nm(hl.pid)} in the ${perLong(hl.per).toLowerCase()}.`.replace("ot.", "overtime."));
  for (const e of E) if (e.type === "injury") out.push(`${nm(e.pid)} (${TN(e.team)}) left with ${/s$/.test(e.kind) ? "" : "a "}${esc(e.kind)}.`);
  for (const e of E) if (e.type === "fight") out.push(`${e.brawl ? "The benches cleared" : "A fight broke out"} in the ${perLong(e.per).toLowerCase()} between ${nm(e.pid)} and ${nm(e.on)}; both were ejected.`.replace("ot.", "overtime."));
  for (const e of E) if (e.type === "ejected" && e.why !== "fight") out.push(`${nm(e.pid)} (${TN(e.team)}) was ejected for ${e.why === "targeting" ? "targeting" : "a flagrant 2"}.`);
  const hot = E.filter(e => e.type === "heat" && e.lvl > 0 && e.team === w)[0];
  if (hot) { const pts = E.filter(e => e.type === "fga" && e.pid === hot.pid && e.made && e.tk >= hot.tk).reduce((a, e) => a + e.val, 0); if (pts >= 8) out.splice(2, 0, `${nm(hot.pid)} got hot in the ${perLong(hot.per).toLowerCase()} and scored ${pts} more after that.`.replace("ot.", "overtime.")); }
  const rv = (GAME.ctx && GAME.ctx.rev || []).find(i => GAME.roster[i].t === w); if (rv !== undefined) out.splice(2, 0, `It was a revenge game for ${nm(rv)} against his old team.`);
  return out;
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
  NOTABLE = buildNotable(GAME); ARC = buildArc(GAME); V.freezeUntil = 0; V.visCount = -1; V.boxAt = -1; V.replay = null; V.reel = null; V.ftShown = -1; V.marksAt = -1; bugState = { n: -1 };
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
  const [gid, day, h, a, seed, hs, as, per, type, hl, al, hc, ac, ctx] = row;
  const ps = seasonData.players, co = seasonData.coaches || {};
  const tactics = hc !== undefined && co[hc] ? [co[hc].tac, co[ac].tac] : undefined;
  const game = simulateGame({ id: h }, { id: a }, [hl.map(id => ps[id]), al.map(id => ps[id])], seed, { tactics, season: seasonData.season, ctx });
  game.ctx = ctx || null; game.refs = seasonData.refs || {};
  game.restNames = ctx && ctx.rest ? ctx.rest.flatMap((ids, t) => (Array.isArray(ids) ? ids : []).map(id => ps[id] ? { name: ps[id].first + " " + ps[id].last, t } : null)).filter(Boolean) : [];
  game.coachNames = [co[hc] ? co[hc].name : "", co[ac] ? co[ac].name : ""];
  game.season = seasonData.season; game.type = type; game.day = day;
  // v0.7: the crowd, record chases, feuds and front-office drama around the game
  game.att = ctx && ctx.att ? ctx.att : null;
  const pname = id => ps[id] ? ps[id].first + " " + ps[id].last : (window.D && D.pl && D.pl[id] ? D.pl[id].name : "#" + id);
  const at = {}; hl.concat(al).forEach((id, i) => at[id] = i);
  game.chase = (seasonData.chase && seasonData.chase[gid] || []).filter(c => at[c[0]] !== undefined).map(c => ({ idx: at[c[0]], k: c[1], need: c[2], kind: c[3], target: c[4], rank: c[5], other: c[3] === "mile" ? null : pname(c[4]) }));
  game.feudLines = (seasonData.feuds || []).filter(f => f.season === seasonData.season && f.day <= day && (!f.end || f.end.season > seasonData.season || type) && (at[f.a] !== undefined))
    .map(f => f.kind === "coach" ? `${esc(pname(f.a))} and his coach aren't speaking` : at[f.b] !== undefined ? `${esc(pname(f.a))} and ${esc(pname(f.b))} are feuding` : null).filter(Boolean);
  game.demandLines = (seasonData.tx || []).filter(t => t.type === "demand" && t.day >= 0 && t.day <= day && at[t.pid] !== undefined).map(t => `${esc(pname(t.pid))} has asked to be traded`);
  if (type === 2 && seasonData.allstar) game.allstar = seasonData.allstar;
  const match = game.score[0] === hs && game.score[1] === as;
  game.note = `${seasonData.season} ${type === 2 ? "All-Star game" : type ? "playoffs" : "day " + (day + 1)} · seed ${seed} · ${match ? '<span class="ok">✓ replay matches the record</span>' : `<span class="bad">replay differs from the record (engine ${ENGINE_VERSION} vs ${seasonData.engineVersion})</span>`}`;
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
// A game simulated elsewhere (Classic Nights builds its own exhibitions); ctx gives the season look and the records.
function loadPrepared(game, ctx, colors) {
  V.playing = false; V.channels = null; V.live = false; resetShow(); renderChannels(); resize();
  V.ctx = ctx; useGame(game, colors || teamColors(game.home, game.away));
  V.tick = 0; $("scrub").max = game.ticks; $("scrub").value = 0;
  $("seed").innerHTML = (game.note || "") + keyHint();
  $("bc-overlay").hidden = true; updateAll(true);
  V.playing = true; setPlayBtn();
  if (B3 && V.view3d) startIntro(); else showPlanCard();
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

// ---------- v0.7: the dunk contest, staged in 3D ----------
// A synthetic "game": the contestants take turns at the right-hand rim while the other All-Stars watch from
// the sidelines. Every attempt is scripted from the stored contest (move, tries, make or miss, the judges' cards),
// recorded in the engine's frame layout, so the broadcast's camera, crowd and replays work as they do for games.
function dunkShow(sd) {
  const K = sd.dunk, A = sd.allstar, ps = sd.players, FS = BB.C.FS, HX = BB.C.HX[1], HY = BB.C.HY, ACT = BB.ACT;
  const field = K.field.slice(0, 4), extra = (A ? A.sides.east.starters.concat(A.sides.west.starters) : []).filter(id => !field.includes(id) && ps[id]).slice(0, 6);
  while (field.length + extra.length < 10) extra.push(field[0]);
  const ids = field.concat(extra).slice(0, 10), roster = ids.map((id, i) => { const p = ps[id] || {}; return { idx: i, id, t: i < 5 ? 0 : 1, name: p.first + " " + p.last, short: (p.first || "?")[0] + ". " + p.last, num: p.num || 0, role: p.role || "WING", starter: true, secs: 0, ht: p.ht, wt: p.wt, arch: "SLA", darch: "LOCK" }; });
  const home = [], events = [], frames = [];
  // where everyone stands: contestants by the near sideline, the rest across the floor
  const spot = i => i < 5 ? { x: 66 + i * 3.2, y: 3.5, f: Math.PI / 2 } : { x: 64 + (i - 5) * 3.4, y: 46.5, f: -Math.PI / 2 };
  const pos = roster.map((r, i) => Object.assign({ z: 0, act: ACT.NONE, actT: 0 }, spot(i)));
  const ball = { x: HX - 1, y: HY, z: 0.2, holder: -1, mode: 4 };
  let tk = 0, s0 = 0;
  const rec = () => {
    const F = new Float32Array(FS); let o = 0;
    for (let i = 0; i < 10; i++) { const P = pos[i]; F[o++] = P.x; F[o++] = P.y; F[o++] = P.z; F[o++] = i; F[o++] = ball.holder === i ? 2 : 0; F[o++] = P.f; F[o++] = P.act; F[o++] = P.actT; }
    F[o++] = ball.x; F[o++] = ball.y; F[o++] = ball.z; F[o++] = ball.holder; F[o++] = ball.mode;
    F[o++] = 0; F[o++] = 0; F[o++] = 1; F[o++] = s0; F[o++] = 0; F[o++] = 0; F[o++] = 1;
    frames.push(F);
  };
  const run = (secs, step) => { const n = Math.round(secs * 10); for (let k = 0; k < n; k++) { step(k / n, k); tk += 2; for (const P of pos) P.actT += 0.1; rec(); } };
  events.push({ type: "period_start", tk: 0, per: 1, clk: 720, l0: [0, 1, 2, 3, 4], l1: [5, 6, 7, 8, 9] });
  run(1.5, () => {});
  const R = K.rounds;
  R.forEach((rd, ri) => {
    events.push({ type: "dunkround", tk, round: ri, n: R.length });
    for (const entry of rd) {
      const i = ids.indexOf(entry.pid); if (i < 0) continue;
      const P = pos[i], home0 = spot(i);
      for (const d of entry.dunks) {
        const far = /four-point/.test(d.move) ? 26 : /free-throw/.test(d.move) ? 15 : 5.5, tx = HX - far, ty = HY + (d.d % 2 ? 2.5 : -2.5);
        for (let t = 0; t < d.tries; t++) {
          const made = d.made && t === d.tries - 1, sx = tx - 24, sy = ty + (t % 2 ? 9 : -9);
          // walk to the start with the ball
          const ax = P.x, ay = P.y; ball.holder = i; ball.mode = 0;
          run(1.4, u => { P.x = ax + (sx - ax) * u; P.y = ay + (sy - ay) * u; P.f = Math.atan2(HY - P.y, HX - P.x); P.act = ACT.NONE; ball.x = P.x + 0.6; ball.y = P.y; ball.z = 3.2; });
          run(0.6, () => { ball.x = P.x + 0.6; ball.y = P.y; ball.z = 3.2; });
          // the run-up, dribbling on the rubber floor
          P.act = ACT.DRIBBLE; P.actT = 0;
          run(1.3, (u, k) => { P.x = sx + (tx - sx) * u; P.y = sy + (ty - sy) * u; P.f = Math.atan2(HY - P.y, HX - P.x); ball.x = P.x + 1.2 * Math.cos(P.f); ball.y = P.y + 1.2 * Math.sin(P.f); ball.z = 0.4 + Math.abs(Math.sin(k * 0.9)) * 2.6; });
          // takeoff, flight, the slam (or the clank)
          events.push({ type: "fga", tk, pid: i, team: 0, val: 2, made, dunk: true, ast: -1, per: 1, clk: 720, x: tx, y: ty, show: 1 });
          P.act = ACT.DUNK; P.actT = 0;
          const hop = 3.2 + (far > 10 ? 0.6 : 0), lx = HX - 1.4, ly = HY + (ty - HY) * 0.25;
          run(1.0, u => { P.x = tx + (lx - tx) * u; P.y = ty + (ly - ty) * u; P.z = 4 * hop * u * (1 - u) + (u > 0.5 ? 0.4 * (u - 0.5) : 0); ball.x = P.x + 0.5 * Math.cos(P.f); ball.y = P.y + 0.5 * Math.sin(P.f); ball.z = P.z + 7.4 + Math.min(1, u * 1.6) * 1.2; });
          ball.holder = -1; ball.mode = made ? 2 : 3;
          const bx = HX, by = HY;
          run(1.2, u => { P.z = Math.max(0, P.z - 0.9); if (made) { ball.x = bx; ball.y = by; ball.z = Math.max(0.2, 10 - u * 14 + (u > 0.6 ? Math.abs(Math.sin(u * 14)) * 1.5 : 0)); } else { ball.x = bx - u * 9; ball.y = by + u * 5; ball.z = Math.max(0.2, 10.5 + u * 6 - u * u * 18); } });
          P.z = 0;
          if (made) { P.act = ACT.CELEBRATE; P.actT = 0; run(1.4, () => {}); }
          else { events.push({ type: "dunkmiss", tk, pid: i, team: 0, try: t + 1, per: 1, clk: 720 }); run(0.8, () => {}); }
        }
        s0 = d.total;
        events.push({ type: "dunkjudge", tk, pid: i, team: 0, move: d.move, scores: d.scores, total: d.total, made: d.made, per: 1, clk: 720 });
        P.act = ACT.NONE; run(2.6, () => {});
        // back to his spot
        const bx0 = P.x, by0 = P.y; ball.holder = -1; ball.mode = 4; ball.x = HX - 2; ball.y = HY; ball.z = 0.2;
        run(1.6, u => { P.x = bx0 + (home0.x - bx0) * u; P.y = by0 + (home0.y - by0) * u; P.f = Math.atan2(P.y - by0, P.x - bx0); });
        P.f = home0.f; s0 = 0;
      }
    }
  });
  events.push({ type: "dunkwin", tk, pid: ids.indexOf(K.winner), team: 0, per: 1, clk: 0 });
  pos[ids.indexOf(K.winner)].act = ACT.CELEBRATE; pos[ids.indexOf(K.winner)].actT = 0; run(3, () => {});
  events.push({ type: "period_end", tk, per: 1, clk: 0 });
  const F = new Float32Array(frames.length * FS); frames.forEach((f, k) => F.set(f, k * FS));
  return { engineVersion: BB.ENGINE_VERSION, seed: 0, home: "ASE", away: "ASW", rules: BB.rulesFor(sd.season), score: [0, 0], periods: 1, ticks: tk, poss: [0, 0], frames: F, nFrames: frames.length, events, roster,
    ctx: null, refs: {}, restNames: [], coachNames: ["", ""], season: sd.season, type: 3, day: 0, att: null, chase: [], feudLines: [], demandLines: [], show: "dunk", note: `${sd.season} dunk contest · scripted from the record` };
}
function loadDunk(seasonData) {
  V.playing = false; V.channels = null; V.live = false; resetShow(); renderChannels(); resize();
  const game = dunkShow(seasonData);
  V.ctx = { S: seasonData, row: [0, 0, "ASE", "ASW", 0, 0, 0, 1, 3] };
  useGame(game, teamColors("ASE", "ASW"));
  V.tick = 0; $("scrub").max = game.ticks; $("scrub").value = 0;
  $("seed").innerHTML = game.note; $("bc-overlay").hidden = true; updateAll(true);
  setSpeed(1); V.playing = true; setPlayBtn();
  lowerThird("#d4af37", "THE DUNK CONTEST", `${TB[seasonData.allstar ? seasonData.allstar.host : "ASE"] ? esc(TB[seasonData.allstar.host].city) : ""} · ${seasonData.season}`, 4000, true);
}

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
function seek(tk) { stopReplay(); V.intro = null; V.hold = 0; if (V.card && V.card.kind !== "fin") hideCard(); V.tick = Math.max(0, Math.min(maxTicks(), tk)); V.live = false; V.visCount = -1; updateAll(true); if (window.cnOnSeek) cnOnSeek(GAME, V.tick); }
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
          V.tick = arcadeStep(before, dt, now);
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
    else if (V.replay) { const c = V.replay.pkg.clips[V.replay.ci]; view = { shot: c.shot || undefined, focus: c.focus, side: c.side, rate: c.hold ? 0.01 : (V.replay.eff || c.rate), replay: true, spinT: V.replay.held || 0, ar: V.replay.pkg.ar }; }
    else if (V.hold && !V.live) view = { shot: "dance", ambient: true, dance: true };
    else if (V.tick >= GAME.ticks - 2) view = { ambient: true, shot: V.card && V.card.kind === "fin" ? "orbit" : undefined, rate: V.speed };
    else view = { rate: V.speed, focus: $("cam").value === "player" ? V.follow : undefined };
    view.era = V.eraOn ? eraMode() : 0;
    view.hl = V.hl !== false; view.shotcam = !V.channels && V.speed <= 4; // v12: highlights and the shot camera
    const R3 = B3.render(V.replay ? V.replay.t : V.tick, view);
    if (R3 && R3.shot === "hero" && R3.subjKind === "player" && !V.replay && frameVals().phase !== 2) heroGraphic(R3.subj);
    autoQuality(dt);
  } else draw2D(V.tick);
  requestAnimationFrame(loop);
}
// when the director finds the scorer, put his line under him
function heroGraphic(idx) {
  const now = performance.now(); if (V.heroIdx === idx && now - (V.heroAt || 0) < 9000) return;
  V.heroIdx = idx; V.heroAt = now;
  const r = GAME.roster[idx], s = r && boxScore(GAME, V.tick).find(x => x.idx === idx); if (!s) return;
  lowerThird(COLORS[r.t], `#${r.num} ${esc(r.name).toUpperCase()}`, `${statLine(s)} · ${s.fgm}-${s.fga} FG`, 2600);
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
  if ($("hlb")) $("hlb").onclick = () => { V.hl = V.hl === false; $("hlb").classList.toggle("on", V.hl !== false); };
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
    else if (k === "h" && $("hlb")) $("hlb").click();
    else if (k === "p") setView($("cam").value === "player" ? "auto" : "player");
    else if (/^[1-3]$/.test(k) && V.channels) flip(+k - 1);
    else if (k === "escape" && V.replay) { stopReplay(); updateAll(true); }
  });
  requestAnimationFrame(loop);
}
