// ===================== BROADCAST (replays any game from the record) =====================
"use strict";
const TB = {}; BB.TEAMS.forEach(t => TB[t.id] = t);
const $ = id => document.getElementById(id);
const FS = C.FS;
let GAME = null, COLORS = ["#fff", "#000"], TXT = ["#000", "#fff"], NOTABLE = [];
const V = { tick: 0, playing: false, speed: 2, last: 0, visCount: -1, boxAt: -1 };
function lum(hex) { const n = parseInt(hex.slice(1), 16); const r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
function cdist(a, b) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.abs((x >> 16) - (y >> 16)) + Math.abs((x >> 8 & 255) - (y >> 8 & 255)) + Math.abs((x & 255) - (y & 255)); }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function perName(p) { return p <= 4 ? "Q" + p : (p === 5 ? "OT" : (p - 4) + "OT"); }
function fmtClock(c) { c = Math.max(0, c); if (c < 60) return c.toFixed(1); const m = Math.floor(c / 60), s = Math.floor(c % 60); return m + ":" + String(s).padStart(2, "0"); }
function ftin(h) { return Math.floor(h / 12) + "'" + (h % 12) + '"'; }

// ---------- notable moments (on-court callouts) ----------
function buildNotable() {
  NOTABLE = [];
  for (const e of GAME.events) {
    let label = null, col = "#fff";
    if (e.type === "tackle" && e.result === "down") { label = "TACKLE!"; col = "#ff4d4d"; }
    else if (e.type === "tackle" && e.result === "late") { label = "LATE HIT"; col = "#ffb703"; }
    else if (e.type === "tackle" && e.result === "broken") { label = "BROKE THE TACKLE"; col = "#7cf"; }
    else if (e.type === "fga" && e.gt !== undefined) { label = "GOALTENDING"; col = "#ffb703"; }
    else if (e.type === "fga" && e.ci !== undefined) { label = "CYLINDER!"; col = "#ffb703"; }
    else if (e.type === "fga" && e.blk !== undefined && e.blk >= 0) { label = e.swat ? "SWAT!" : "REJECTED"; col = "#9ef01a"; }
    else if (e.type === "fga" && e.made && e.val === 4) { label = "FOUR!"; col = "#f2b134"; }
    else if (e.type === "fga" && e.made && e.dunk) { label = "SLAM"; col = "#fff"; }
    if (label) NOTABLE.push({ tk: e.tk, label, col });
  }
}

// ---------- court ----------
const cv = $("court"), ctx = cv.getContext("2d");
let bg = null, S = 4, DPR = 1, VERT = false;
// world box incl. margins: court 94x50 + 3ft each side = 100 x 56. On narrow screens the court is drawn vertically.
function resize() {
  const w = cv.parentElement.clientWidth; DPR = Math.min(2, window.devicePixelRatio || 1);
  VERT = w < 600;
  let cw, ch;
  if (VERT) { ch = Math.min(w * 100 / 56, window.innerHeight * 0.64); cw = ch * 56 / 100; }
  else { cw = w; ch = w * 56 / 100; }
  cv.style.width = cw + "px"; cv.style.height = ch + "px";
  cv.width = Math.round(cw * DPR); cv.height = Math.round(ch * DPR);
  S = (VERT ? cv.height : cv.width) / 100; drawCourtBg();
}
// landscape helpers (used under a rotation transform when VERT)
const X = x => (x + 3) * S, Y = y => (y + 3) * S;
// world -> screen (handles rotation)
const SX = (x, y) => VERT ? (53 - y) * S : (x + 3) * S;
const SY = (x, y) => VERT ? (x + 3) * S : (y + 3) * S;
function drawCourtBg() {
  bg = document.createElement("canvas"); bg.width = cv.width; bg.height = cv.height;
  const g = bg.getContext("2d");
  g.fillStyle = "#0d1015"; g.fillRect(0, 0, bg.width, bg.height);
  if (VERT) g.setTransform(0, 1, -1, 0, bg.width, 0);
  // rubber floor with speckle
  g.fillStyle = "#2a3039"; g.fillRect(X(0), Y(0), 94 * S, 50 * S);
  const rs = makeRng(77);
  for (let i = 0; i < 2600; i++) { g.fillStyle = rs.chance(0.5) ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)"; g.fillRect(X(rs.range(0, 94)), Y(rs.range(0, 50)), Math.max(1, S * 0.18), Math.max(1, S * 0.18)); }
  const home = GAME ? COLORS[0] : "#f2b134";
  g.lineWidth = Math.max(1, S * 0.18); g.strokeStyle = "rgba(238,232,218,0.85)";
  g.strokeRect(X(0), Y(0), 94 * S, 50 * S);
  g.beginPath(); g.moveTo(X(47), Y(0)); g.lineTo(X(47), Y(50)); g.stroke();
  g.beginPath(); g.arc(X(47), Y(25), 6 * S, 0, 7); g.stroke();
  g.save(); g.globalAlpha = 0.5; g.fillStyle = home; g.beginPath(); g.arc(X(47), Y(25), 6 * S, 0, 7); g.fill(); g.restore();

  for (const side of [0, 1]) {
    const hx = C.HX[side], dir = side === 0 ? 1 : -1, base = side === 0 ? 0 : 94;
    // paint
    g.save(); g.globalAlpha = 0.28; g.fillStyle = home;
    g.fillRect(Math.min(X(base), X(base + dir * 19)), Y(17), 19 * S, 16 * S); g.restore();
    g.strokeRect(Math.min(X(base), X(base + dir * 19)), Y(17), 19 * S, 16 * S);
    g.beginPath(); g.arc(X(base + dir * 19), Y(25), 6 * S, 0, 7); g.stroke();
    g.beginPath(); g.arc(X(hx), Y(25), 4 * S, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : Math.PI * 1.5); g.stroke();
    // three
    const a3 = Math.asin(C.C3 / C.R3);
    g.beginPath(); g.moveTo(X(base), Y(3)); g.lineTo(X(base + dir * C.C3X), Y(3));
    if (side === 0) g.arc(X(hx), Y(25), C.R3 * S, -a3, a3); else g.arc(X(hx), Y(25), C.R3 * S, Math.PI + a3, Math.PI - a3, true);
    g.lineTo(X(base), Y(47)); g.stroke();
    // four
    g.save(); g.beginPath(); g.rect(X(0), Y(0), 94 * S, 50 * S); g.clip();
    g.strokeStyle = "#f2b134"; g.lineWidth = Math.max(1.5, S * 0.3); g.setLineDash([S * 1.2, S * 0.8]);
    g.beginPath(); if (side === 0) g.arc(X(hx), Y(25), C.R4 * S, -Math.PI / 2, Math.PI / 2); else g.arc(X(hx), Y(25), C.R4 * S, Math.PI / 2, Math.PI * 1.5);
    g.stroke(); g.restore();
    // backboard + rim
    g.strokeStyle = "#e8e8e8"; g.lineWidth = Math.max(1.5, S * 0.35);
    g.beginPath(); g.moveTo(X(base + dir * 4), Y(22)); g.lineTo(X(base + dir * 4), Y(28)); g.stroke();
    g.strokeStyle = "#ff7a1a"; g.lineWidth = Math.max(1.5, S * 0.25);
    g.beginPath(); g.arc(X(hx), Y(25), 0.75 * S, 0, 7); g.stroke();
    g.strokeStyle = "rgba(238,232,218,0.85)"; g.lineWidth = Math.max(1, S * 0.18);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "rgba(255,255,255,0.9)"; g.font = `700 ${Math.round(S * 3)}px Oswald, Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("UBL", SX(47, 25), SY(47, 25) + S * 0.2);
}
function lerp(a, b, t) { return a + (b - a) * t; }
function drawFrame() {
  if (!bg || !bg.width || !cv.width) return;
  ctx.drawImage(bg, 0, 0);
  if (!GAME) return;
  const ff = V.tick / 2, f0 = Math.min(GAME.nFrames - 1, Math.floor(ff)), f1 = Math.min(GAME.nFrames - 1, f0 + 1), a = ff - f0;
  const F = GAME.frames, o0 = f0 * FS, o1 = f1 * FS;
  const ents = [];
  for (let k = 0; k < 10; k++) {
    const b0 = o0 + k * 5, b1 = o1 + k * 5;
    const same = F[b0 + 3] === F[b1 + 3];
    const t = same ? a : 0;
    ents.push({ x: lerp(F[b0], F[b1], t), y: lerp(F[b0 + 1], F[b1 + 1], t), z: lerp(F[b0 + 2], F[b1 + 2], t), idx: F[b0 + 3], fl: F[b0 + 4], team: k < 5 ? 0 : 1 });
  }
  const bo0 = o0 + 50, bo1 = o1 + 50;
  const ball = { x: lerp(F[bo0], F[bo1], a), y: lerp(F[bo0 + 1], F[bo1 + 1], a), z: lerp(F[bo0 + 2], F[bo1 + 2], a) };
  const LIFT = 0.35;
  // shadows
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  for (const e of ents) { ctx.beginPath(); ctx.ellipse(SX(e.x, e.y), SY(e.x, e.y), 1.2 * S, 0.8 * S, 0, 0, 7); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(SX(ball.x, ball.y), SY(ball.x, ball.y), 0.6 * S, 0.4 * S, 0, 0, 7); ctx.fill();
  // players (lowest first)
  ents.sort((p, q) => p.z - q.z);
  for (const e of ents) {
    const R = GAME.roster[e.idx];
    const px = SX(e.x, e.y), py = SY(e.x, e.y) - e.z * LIFT * S, r = (1.25 + e.z * 0.07) * S;
    const down = e.fl & 1;
    ctx.save();
    if (down) { ctx.globalAlpha = 0.6; ctx.translate(px, py); ctx.scale(1.35, 0.6); ctx.translate(-px, -py); }
    ctx.fillStyle = COLORS[e.team]; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    ctx.lineWidth = Math.max(1, S * 0.18);
    ctx.strokeStyle = (e.fl & 4) ? "#ff4d4d" : (e.fl & 2) ? "#ffffff" : (e.fl & 8) ? "#ffd166" : "rgba(0,0,0,0.55)";
    if (e.fl & 6) ctx.lineWidth = Math.max(2, S * 0.35);
    ctx.stroke();
    ctx.fillStyle = TXT[e.team]; ctx.font = `700 ${Math.max(8, Math.round(r * 1.05))}px Oswald, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(R.num, px, py + r * 0.05);
    ctx.restore();
  }
  // ball
  const br = Math.max(3, (0.62 + ball.z * 0.045) * S);
  const bx = SX(ball.x, ball.y), by = SY(ball.x, ball.y) - ball.z * LIFT * S;
  const grad = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
  grad.addColorStop(0, "#ffb15c"); grad.addColorStop(1, "#d9620c");
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
  ctx.strokeStyle = "rgba(40,15,0,0.7)"; ctx.lineWidth = Math.max(1, br * 0.15); ctx.stroke();
  // callout
  let n = null;
  for (let i = NOTABLE.length - 1; i >= 0; i--) { const m = NOTABLE[i]; if (m.tk <= V.tick) { if (V.tick - m.tk < 36) n = m; break; } }
  if (n) {
    const age = (V.tick - n.tk) / 36;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age * age);
    ctx.font = `700 ${Math.round(S * (VERT ? 3.6 : 4.2))}px Oswald, Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const cx = cv.width / 2, cy = cv.height * (VERT ? 0.5 : 0.2) - age * 2 * S;
    ctx.lineWidth = S * 0.6; ctx.strokeStyle = "rgba(0,0,0,0.8)"; ctx.strokeText(n.label, cx, cy);
    ctx.fillStyle = n.col; ctx.fillText(n.label, cx, cy);
    ctx.restore();
  }
}

// ---------- scoreboard ----------
function frameVals() {
  const f = Math.min(GAME.nFrames - 1, Math.floor(V.tick / 2)), o = f * FS + 54, F = GAME.frames;
  return { clock: F[o], shot: F[o + 1], per: F[o + 2], s0: F[o + 3], s1: F[o + 4] };
}
function updateBug() {
  if (!GAME) return;
  const v = frameVals(), H = TB[GAME.home], A = TB[GAME.away];
  const fin = V.tick >= GAME.ticks - 2;
  $("bug").innerHTML =
    `<div class="tm" style="--c:${COLORS[0]};--t:${TXT[0]}"><span class="ab">${H.id}</span><span class="nm">${esc(H.name)}</span><span class="sc">${v.s0}</span></div>` +
    `<div class="mid"><div class="clk">${fin ? "FINAL" + (v.per > 4 ? (v.per === 5 ? "/OT" : "/" + (v.per - 4) + "OT") : "") : perName(v.per) + " " + fmtClock(v.clock)}</div>` +
    `<div class="shot">${fin ? "" : (v.shot <= v.clock ? "shot " + Math.ceil(v.shot) : "")}</div></div>` +
    `<div class="tm r" style="--c:${COLORS[1]};--t:${TXT[1]}"><span class="sc">${v.s1}</span><span class="nm">${esc(A.name)}</span><span class="ab">${A.id}</span></div>`;
}

// ---------- play-by-play ----------
function visibleCount() { const E = GAME.events; let lo = 0, hi = E.length; while (lo < hi) { const m = (lo + hi) >> 1; if (E[m].tk <= V.tick) lo = m + 1; else hi = m; } return lo; }
function nm(i) { const r = GAME.roster[i]; return `<b>${esc(r.short)}</b>`; }
function pbpLine(e) {
  switch (e.type) {
    case "tip": return [`${nm(e.pid)} wins the opening tip`, ""];
    case "fga": {
      const kind = e.dunk ? "dunk" : e.layup ? "layup" : e.val === 4 ? `${e.d}-ft four` : e.val === 3 ? `${e.d}-ft three` : `${e.d}-ft jumper`;
      if (e.gt !== undefined) return [`${nm(e.pid)}'s ${kind} counts. Goaltending on ${nm(e.gt)}`, "hot"];
      if (e.ci !== undefined) return [`${nm(e.pid)}'s ${kind} counts. ${nm(e.ci)}'s hand went through the cylinder`, "hot"];
      if (e.blk !== undefined && e.blk >= 0) return [e.swat ? `SWAT! ${nm(e.blk)} slaps ${nm(e.pid)}'s ${kind} off the rim` : `${nm(e.blk)} blocks ${nm(e.pid)}'s ${kind}`, "hot"];
      if (e.made) return [`${nm(e.pid)} ${e.dunk ? "throws it down" : "hits the " + kind}${e.ast >= 0 ? ` <span class="m">(${esc(GAME.roster[e.ast].short)} assist)</span>` : ""}`, e.val === 4 || e.dunk ? "score hot" : "score"];
      return [`${nm(e.pid)} misses the ${kind}`, ""];
    }
    case "ft": return [`${nm(e.pid)} ${e.made ? "makes" : "misses"} free throw ${e.n} of ${e.of}`, e.made ? "score" : ""];
    case "reb": return [`${nm(e.pid)} ${e.off ? "offensive" : "defensive"} rebound`, "m"];
    case "to":
      if (e.kind === "steal") return [`${nm(e.by)} picks off ${nm(e.pid)}'s pass`, ""];
      if (e.kind === "loose") return [`${nm(e.by)} comes up with the loose ball`, ""];
      if (e.kind === "oob") return [`${nm(e.pid)} turns it over out of bounds`, ""];
      if (e.kind === "shotclock") return [`Shot clock violation`, ""];
      return null;
    case "tackle":
      if (e.result === "down") return [`TACKLE! ${nm(e.pid)} puts ${nm(e.on)} on the rubber. Turnover`, "hot"];
      if (e.result === "broken") return [`${nm(e.on)} shrugs off ${nm(e.pid)}'s tackle`, ""];
      if (e.result === "whiff") return [`${nm(e.pid)} whiffs on the tackle`, "m"];
      if (e.result === "late") return [`LATE HIT. ${nm(e.pid)} tackles ${nm(e.on)} after the ball is gone`, "hot"];
      return null;
    case "foul": return [`Foul on ${nm(e.pid)} <span class="m">(${e.pf} PF${e.kind === "shooting" ? ", shooting" : ""})</span>`, "m"];
    case "fouledout": return [`${nm(e.pid)} has fouled out`, "hot"];
    case "sub": return [`${nm(e.inn)} checks in for ${nm(e.out)}`, "m sub"];
    case "period_end": return [`End of ${perName(e.per)}`, "sep"];
    case "final": return [`FINAL`, "sep"];
  }
  return null;
}
function renderPBP(n) {
  const E = GAME.events, out = [];
  const showSubs = $("subs").checked;
  for (let i = n - 1; i >= 0 && out.length < 250; i--) {
    const e = E[i]; if (e.type === "sub" && !showSubs) continue;
    const L = pbpLine(e); if (!L) continue;
    const t = e.team !== undefined ? e.team : -1;
    const dot = t >= 0 ? `<i style="background:${COLORS[t]}"></i>` : `<i></i>`;
    out.push(`<li class="${L[1]}"><span class="t">${perName(e.per)} ${fmtClock(e.clk)}</span>${dot}<span class="x">${L[0]}</span><span class="s">${e.s0}-${e.s1}</span></li>`);
  }
  $("pbp-list").innerHTML = out.join("") || `<li class="m"><span class="x">Waiting for tip-off…</span></li>`;
}

// ---------- box score ----------
function renderBox() {
  const v = frameVals();
  const S = boxScore(GAME, V.tick, v.per, v.clock);
  let html = "";
  for (let t = 0; t < 2; t++) {
    const tm = TB[t === 0 ? GAME.home : GAME.away];
    const rows = S.filter(s => s.t === t);
    const tot = rows.reduce((a, s) => { for (const k in s) if (typeof s[k] === "number") a[k] = (a[k] || 0) + s[k]; return a; }, {});
    const line = (name, s, cls) => `<tr class="${cls || ""}"><td class="pn">${name}</td><td>${s.played === false ? (V.tick >= GAME.ticks ? "DNP" : "–") : Math.floor(s.secs / 60)}</td><td class="b">${s.pts}</td><td>${s.oreb + s.dreb}</td><td>${s.ast}</td><td>${s.fgm}-${s.fga}</td><td>${s.tpm}-${s.tpa}</td><td>${s.fpm}-${s.fpa}</td><td>${s.ftm}-${s.fta}</td><td>${s.tkl}</td><td>${s.btk}</td><td>${s.stl}</td><td>${s.blk}</td><td>${s.to}</td><td>${s.pf}</td></tr>`;
    html += `<h3 style="--c:${COLORS[t]}">${esc(tm.city)} ${esc(tm.name)}</h3><div class="tw"><table class="box"><thead><tr><th class="pn">Player</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FG</th><th>3P</th><th>4P</th><th>FT</th><th title="Tackles (turnovers forced)">TKL</th><th title="Broken tackles">BTK</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>`;
    for (const s of rows) { const r = GAME.roster[s.idx]; html += line(`<span class="num">${r.num}</span>${esc(r.short)} <span class="m">${r.role === "SNIPER" ? "SN" : r.role === "BRUISER" ? "BR" : r.role}</span>`, s, r.starter ? "st" : ""); }
    tot.played = true;
    html += line("<b>Team</b>", tot, "tot") + `</tbody></table></div>`;
  }
  $("box-tables").innerHTML = html;
}

// ---------- loop ----------
function updateAll(force) {
  if (!GAME) return;
  updateBug();
  const n = visibleCount();
  if (n !== V.visCount || force) { V.visCount = n; if (!$("bc-pbp").hidden) renderPBP(n); }
  if (!$("bc-box").hidden && (force || Math.abs(V.tick - V.boxAt) >= 20)) { V.boxAt = V.tick; renderBox(); }
  $("scrub").value = V.tick;
}
function loop(ts) {
  const dt = Math.min(0.1, (ts - (V.last || ts)) / 1000); V.last = ts;
  if (GAME && V.playing) {
    V.tick += dt * 20 * V.speed;
    if (V.tick >= GAME.ticks) { V.tick = GAME.ticks; V.playing = false; setPlayBtn(); }
    updateAll(false);
  }
  drawFrame();
  requestAnimationFrame(loop);
}


function setPlayBtn() { $("play").textContent = V.playing ? "❚❚" : "▶"; }
// Replay a stored game: same seed + same lineups + same engine = the same game, every time.
function loadGame(row, seasonData) {
  const [gid, day, h, a, seed, hs, as, per, type, hl, al] = row;
  const ps = seasonData.players;
  V.playing = false; resize();
  $("bc-overlay").textContent = "Replaying from the record…"; $("bc-overlay").hidden = false;
  setTimeout(() => {
    const t0 = performance.now();
    GAME = simulateGame({ id: h }, { id: a }, [hl.map(id => ps[id]), al.map(id => ps[id])], seed);
    GAME.ms = performance.now() - t0;
    const c0 = TB[h].c1; let c1 = TB[a].c1; if (cdist(c0, c1) < 140) c1 = TB[a].c2;
    COLORS = [c0, c1]; TXT = COLORS.map(c => lum(c) > 0.55 ? "#111" : "#fff");
    buildNotable(); V.tick = 0; V.visCount = -1; V.boxAt = -1;
    $("scrub").max = (GAME.nFrames - 1) * 2; $("scrub").value = 0;
    const match = GAME.score[0] === hs && GAME.score[1] === as;
    const ver = seasonData.engineVersion === ENGINE_VERSION;
    $("seed").innerHTML = `${seasonData.season} ${type ? "playoffs" : "regular season"} · seed ${seed} · ${match ? '<span class="ok">✓ replay matches the record</span>' : `<span class="bad">replay differs from the record (engine ${ENGINE_VERSION} vs ${seasonData.engineVersion})</span>`}`;
    $("bc-overlay").hidden = true; resize(); updateAll(true);
    V.playing = true; setPlayBtn();
  }, 30);
}
function initBroadcast() {
  resize(); window.addEventListener("resize", resize);
  $("play").onclick = () => { if (!GAME) return; if (V.tick >= GAME.ticks) V.tick = 0; V.playing = !V.playing; setPlayBtn(); };
  $("rew").onclick = () => { if (!GAME) return; V.tick = Math.max(0, V.tick - 200); V.visCount = -1; updateAll(true); };
  $("end").onclick = () => { if (!GAME) return; V.tick = GAME.ticks; V.playing = false; setPlayBtn(); V.visCount = -1; updateAll(true); };
  $("scrub").oninput = e => { if (!GAME) return; V.tick = +e.target.value; updateAll(true); };
  $("subs").onchange = () => { V.visCount = -1; updateAll(true); };
  document.querySelectorAll(".spd button").forEach(b => b.onclick = () => { V.speed = +b.dataset.s; document.querySelectorAll(".spd button").forEach(x => x.classList.toggle("on", x === b)); });
  document.querySelectorAll(".bctabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".bctabs button").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll(".bctab").forEach(s => s.hidden = s.id !== "bc-" + b.dataset.t);
    V.visCount = -1; updateAll(true);
  });
  requestAnimationFrame(loop);
}
