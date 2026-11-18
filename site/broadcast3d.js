// ===================== 3D BROADCAST =====================
// Renders a recorded game (engine frames) as a TV broadcast: stylized players animated from the
// action the engine recorded for each of them, an arena, a camera director and instant replays.
// Units are feet. Engine (x, y, z) -> scene (x, z, y).
"use strict";
(function () {
if (typeof THREE === "undefined") { window.Broadcast3D = null; return; }
const FS = BB.C.FS, ACT = BB.ACT;
const PI = Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= 2 * PI; while (d < -PI) d += 2 * PI; return d; };
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
const SKIN = ["#f1c9a5", "#e0ac83", "#c68a5e", "#a8704a", "#8d5a3b", "#6e4630", "#583826", "#3f2a1d"];
const HAIR = ["#1b1410", "#2b1d14", "#4a3020", "#7a5530", "#c9a25d", "#8a3b1c", null, null];

function supported() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }

function canvasTex(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}

// ---------- court texture ----------
function courtTexture(home, rules) {
  const M = 8, S = 20; // margin (ft), px per ft
  return canvasTex((94 + 2 * M) * S, (50 + 2 * M) * S, (g, W, H) => {
    const X = x => (x + M) * S, Y = y => (y + M) * S;
    g.fillStyle = "#1a1d24"; g.fillRect(0, 0, W, H);
    g.fillStyle = home.c2; g.globalAlpha = 0.55; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    // rubber playing surface with speckle
    g.fillStyle = "#2c323c"; g.fillRect(X(0), Y(0), 94 * S, 50 * S);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.16)"; g.fillRect(X(rnd() * 94), Y(rnd() * 50), 2, 2); }
    // home-colored paint and center circle
    g.globalAlpha = 0.5; g.fillStyle = home.c1;
    g.fillRect(X(0), Y(17), 19 * S, 16 * S); g.fillRect(X(75), Y(17), 19 * S, 16 * S);
    g.beginPath(); g.arc(X(47), Y(25), 6 * S, 0, 7); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = "rgba(240,236,226,0.95)"; g.lineWidth = 0.17 * S;
    g.strokeRect(X(0), Y(0), 94 * S, 50 * S);
    g.beginPath(); g.moveTo(X(47), Y(0)); g.lineTo(X(47), Y(50)); g.stroke();
    g.beginPath(); g.arc(X(47), Y(25), 6 * S, 0, 7); g.stroke();
    g.beginPath(); g.arc(X(47), Y(25), 2 * S, 0, 7); g.stroke();
    for (const side of [0, 1]) {
      const hx = side ? 88.75 : 5.25, dir = side ? -1 : 1, base = side ? 94 : 0;
      g.strokeRect(Math.min(X(base), X(base + dir * 19)), Y(17), 19 * S, 16 * S);
      g.beginPath(); g.arc(X(base + dir * 19), Y(25), 6 * S, 0, 7); g.stroke();
      g.beginPath(); g.arc(X(hx), Y(25), 4 * S, side ? PI / 2 : -PI / 2, side ? PI * 1.5 : PI / 2); g.stroke();
      const a3 = Math.asin(22 / 23.75);
      g.beginPath(); g.moveTo(X(base), Y(3)); g.lineTo(X(base + dir * 14.2), Y(3));
      if (!side) g.arc(X(hx), Y(25), 23.75 * S, -a3, a3); else g.arc(X(hx), Y(25), 23.75 * S, PI + a3, PI - a3, true);
      g.lineTo(X(base), Y(47)); g.stroke();
      if (!rules || rules.four !== false) { // the four-point line arrived with the 1979 merger
        g.save(); g.beginPath(); g.rect(X(0), Y(0), 94 * S, 50 * S); g.clip();
        g.strokeStyle = "#f2b134"; g.lineWidth = 0.3 * S; g.setLineDash([1.2 * S, 0.8 * S]);
        g.beginPath(); if (!side) g.arc(X(hx), Y(25), 30 * S, -PI / 2, PI / 2); else g.arc(X(hx), Y(25), 30 * S, PI / 2, PI * 1.5); g.stroke(); g.restore();
      }
      // team name on the apron behind each baseline
      g.save(); g.translate(X(side ? 94 + M / 2 : -M / 2), Y(25)); g.rotate(side ? -PI / 2 : PI / 2);
      g.fillStyle = home.c1; g.font = `700 ${4.2 * S}px Oswald, Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(home.name.toUpperCase(), 0, 0); g.restore();
    }
    g.fillStyle = "rgba(255,255,255,0.92)"; g.font = `700 ${3.4 * S}px Oswald, Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("UBL", X(47), Y(25.2));
    g.fillStyle = "rgba(255,255,255,0.75)"; g.font = `700 ${2.2 * S}px Oswald, Impact, sans-serif`;
    g.fillText(home.city.toUpperCase(), X(47), Y(-M / 2)); g.fillText("AKRON SPEC FLOOR", X(47), Y(50 + M / 2));
  });
}
function ballTexture() {
  return canvasTex(256, 128, (g, W, H) => {
    g.fillStyle = "#e0701c"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { g.fillStyle = "rgba(90,30,0,0.18)"; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
    g.strokeStyle = "#1c0f06"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    for (const x of [W / 4, 3 * W / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (const x of [0, W / 2]) { g.beginPath(); g.ellipse(x + W / 4, H / 2, W / 6, H / 2, 0, 0, 7); g.stroke(); }
  });
}
function jerseyTexture(num, c1, c2) {
  return canvasTex(256, 128, (g, W, H) => {
    g.fillStyle = c1; g.fillRect(0, 0, W, H);
    g.fillStyle = c2; g.fillRect(0, 0, W, 10); g.fillRect(0, H - 34, W, 5);
    g.fillStyle = c2; g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 3;
    g.font = "700 64px Oswald, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const x of [0, W, W / 2]) { g.strokeText(String(num), x, H * 0.45); g.fillText(String(num), x, H * 0.45); }
  });
}

// ---------- player model ----------
const MAT = {};
function mat(color, opt) { const k = color + (opt ? JSON.stringify(opt) : ""); return MAT[k] || (MAT[k] = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.75, metalness: 0.02 }, opt || {}))); }
function capsule(r, len, m) { const g = new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 10); return new THREE.Mesh(g, m); }
function buildPlayer(info, c1, c2) {
  const H = info.ht / 12, ws = clamp(Math.sqrt(info.wt / (info.ht * 2.85)), 0.85, 1.3);
  const h1 = hash(info.id * 7 + 3), h2 = hash(info.id * 13 + 5), h3 = hash(info.id * 29 + 11);
  const skin = mat(SKIN[Math.floor(h1 * SKIN.length)]), jersey = new THREE.MeshStandardMaterial({ map: jerseyTexture(info.num, c1, c2), roughness: 0.8 });
  const shortsM = mat(c1), trim = mat(c2), shoeM = mat(h3 < 0.5 ? "#f4f4f4" : c2), sock = mat("#f0f0f0");
  const legLen = 0.47 * H, thigh = 0.24 * H, shin = 0.23 * H, torso = 0.3 * H, tR = 0.105 * H * ws, headR = 0.088 * H;
  const ua = 0.165 * H, fa = 0.155 * H, sW = tR * 1.15 + 0.06 * H;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); body.position.y = legLen;
  const tor = capsule(tR, torso - 2 * tR * 0.6, jersey); tor.position.y = torso * 0.5; tor.scale.z = 0.72; body.add(tor);
  const shorts = new THREE.Mesh(new THREE.CylinderGeometry(tR * 1.02, tR * 1.12, 0.13 * H, 12), shortsM); shorts.position.y = 0.01 * H; shorts.scale.z = 0.8; body.add(shorts);
  const head = new THREE.Group(); head.position.y = torso + headR * 0.85; body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(headR, 16, 12), skin); head.add(skull);
  const hair = HAIR[Math.floor(h2 * HAIR.length)];
  if (hair) { const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.04, 16, 8, 0, 2 * PI, 0, PI * 0.45), mat(hair)); cap.rotation.x = -0.25; head.add(cap); }
  if (h3 > 0.78) { const band = new THREE.Mesh(new THREE.TorusGeometry(headR * 1.0, headR * 0.12, 6, 16), trim); band.rotation.x = PI / 2; band.position.y = headR * 0.25; head.add(band); }
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.2, 8, 6), mat("#ffffff")); eye.position.set(s * headR * 0.36, headR * 0.12, headR * 0.86); head.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.1, 6, 6), mat("#111111")); pup.position.set(s * headR * 0.36, headR * 0.12, headR * 1.04); head.add(pup);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.14, 6, 6), skin); nose.position.set(0, -headR * 0.08, headR * 0.98); head.add(nose);
  const arms = [], legs = [];
  for (const s of [1, -1]) { // +x = left side of the body when facing +z
    const sh = new THREE.Group(); sh.position.set(s * sW, torso * 0.9, 0); body.add(sh);
    const sleeve = new THREE.Mesh(new THREE.SphereGeometry(tR * 0.45, 8, 6), jersey); sh.add(sleeve);
    const up = capsule(0.032 * H * ws, ua - 0.064 * H, skin); up.position.y = -ua / 2; sh.add(up);
    const el = new THREE.Group(); el.position.y = -ua; sh.add(el);
    const lo = capsule(0.028 * H * ws, fa - 0.056 * H, skin); lo.position.y = -fa / 2; el.add(lo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048 * H, 8, 6), skin); hand.position.y = -fa - 0.02 * H; el.add(hand);
    arms.push({ sh, el, hand });
    const hip = new THREE.Group(); hip.position.set(s * tR * 0.5, 0, 0); body.add(hip);
    const th = capsule(0.05 * H * ws, thigh - 0.1 * H, skin); th.position.y = -thigh / 2; hip.add(th);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.058 * H * ws, 0.056 * H * ws, thigh * 0.55, 10), shortsM); sl.position.y = -thigh * 0.25; hip.add(sl);
    const kn = new THREE.Group(); kn.position.y = -thigh; hip.add(kn);
    const sn = capsule(0.04 * H, shin - 0.08 * H, skin); sn.position.y = -shin / 2; kn.add(sn);
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.043 * H, 0.04 * H, shin * 0.4, 8), sock); sk.position.y = -shin * 0.72; kn.add(sk);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.09 * H, 0.06 * H, 0.19 * H), shoeM); shoe.position.set(0, -shin - 0.01 * H, 0.04 * H); kn.add(shoe);
    legs.push({ hip, kn });
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return { root, body, head, arms, legs, H, legLen, tR, phase: hash(info.id) * 6, pose: null, lastAct: 0, flip: h2 < 0.5 ? 1 : -1, info };
}
// ---------- poses ----------
function targetPose(m, act, actT, speed, defending, holding, ball) {
  const p = { pitch: 0, roll: 0, drop: 0, crouch: 0, aLx: 0.05, aLz: 0.12, eL: -0.25, aRx: 0.05, aRz: -0.12, eR: -0.25, hL: 0, kL: 0.05, hR: 0, kR: 0.05, headX: 0 };
  const runA = clamp(speed / 17, 0, 1), ph = m.phase;
  const run = () => {
    const sw = Math.sin(ph) * 0.9 * runA;
    p.hL = -sw; p.hR = sw; p.kL = 0.1 + Math.max(0, Math.sin(ph + 1.6)) * 1.3 * runA; p.kR = 0.1 + Math.max(0, Math.sin(ph + 1.6 + PI)) * 1.3 * runA;
    p.aLx = sw * 0.9; p.aRx = -sw * 0.9; p.eL = -0.35 - runA * 0.9; p.eR = -0.35 - runA * 0.9; p.pitch = runA * 0.22;
  };
  switch (act) {
    case ACT.DRIBBLE: run(); p.aRx = -0.55 + (ball ? clamp((ball.z - 1.4) * 0.35, -0.4, 0.5) : 0); p.eR = -0.6; p.aRz = -0.3; p.crouch = 0.08; break;
    case ACT.STANCE: { const sh = Math.sin(ph * 1.3) * 0.25 * runA; p.crouch = 0.22; p.hL = -0.55 + sh; p.hR = -0.55 - sh; p.kL = 0.95; p.kR = 0.95; p.pitch = 0.25; p.aLz = 1.05; p.aRz = -1.05; p.aLx = -0.25; p.aRx = -0.25; p.eL = -0.4; p.eR = -0.4; break; }
    case ACT.SHOOT: if (actT < 0.35) { p.crouch = 0.18 * Math.sin(Math.min(1, actT / 0.35) * PI); p.kL = p.kR = 0.9; p.hL = p.hR = -0.5; p.aLx = p.aRx = -1.6; p.eL = p.eR = -1.6; }
      else { p.aLx = -2.9; p.aRx = -2.95; p.eL = -0.25; p.eR = -0.15; p.aLz = 0.2; p.aRz = -0.1; p.hL = -0.1; p.hR = -0.2; p.kL = p.kR = 0.25; } break;
    case ACT.LAYUP: p.aRx = -3.0; p.eR = -0.1; p.aLx = -1.0; p.eL = -0.9; p.hL = -1.3; p.kL = 1.6; p.hR = 0.15; p.kR = 0.3; p.pitch = 0.1; break;
    case ACT.DUNK: if (actT < 0.3) { p.crouch = 0.2; p.kL = p.kR = 1.0; p.hL = p.hR = -0.6; p.aLx = p.aRx = -1.4; p.eL = p.eR = -1.2; }
      else { const slam = actT > 0.75; p.aLx = slam ? -1.7 : -3.05; p.aRx = slam ? -1.5 : -3.1; p.eL = p.eR = slam ? -0.6 : -0.05; p.hL = -0.9; p.kL = 1.5; p.hR = -0.5; p.kR = 1.2; p.pitch = slam ? 0.3 : -0.05; } break;
    case ACT.PASS: { const k = clamp(actT / 0.25, 0, 1); p.aLx = p.aRx = -1.4 - k * 0.2; p.eL = p.eR = -1.4 + k * 1.3; p.aLz = 0.35 - k * 0.3; p.aRz = -0.35 + k * 0.3; p.pitch = 0.1; break; }
    case ACT.CATCH: run(); p.aLx = p.aRx = -1.35; p.eL = p.eR = -0.5; p.aLz = 0.35; p.aRz = -0.35; break;
    case ACT.TACKLE: { const k = clamp(actT / 0.18, 0, 1); p.pitch = 0.4 + k * 0.85; p.aLx = p.aRx = -2.3; p.eL = p.eR = -0.3; p.aLz = 0.45; p.aRz = -0.45; p.hL = 0.5; p.hR = 0.8; p.kL = 0.6; p.kR = 0.3; p.drop = k * 0.35; break; }
    case ACT.DOWN: { const face = m.lastHard === ACT.TACKLE; p.pitch = face ? 1.5 : -1.45; p.drop = 1; p.aLx = face ? -2.6 : 0.4; p.aRx = face ? -2.4 : 0.6; p.aLz = 0.7; p.aRz = -0.9; p.hL = face ? 0.2 : -0.4; p.kL = 0.5; p.hR = 0.1; p.kR = 0.2; break; }
    case ACT.GETUP: { const k = clamp(actT / 0.45, 0, 1), face = m.lastHard === ACT.TACKLE; p.pitch = (face ? 1.5 : -1.45) * (1 - k); p.drop = 1 - k; p.kL = p.kR = 1.4 * (1 - k * 0.7); p.hL = p.hR = -1.0 * (1 - k); p.aLx = p.aRx = -0.6; break; }
    case ACT.CONTEST: p.aLx = -3.05; p.aRx = -2.9; p.eL = p.eR = -0.05; p.aLz = 0.15; p.aRz = -0.2; p.hL = -0.15; p.kL = 0.3; p.kR = 0.25; break;
    case ACT.REBOUND: p.aLx = p.aRx = -2.85; p.eL = p.eR = -0.2; p.aLz = 0.35; p.aRz = -0.35; p.hL = -0.45; p.kL = 0.8; p.hR = -0.2; p.kR = 0.5; break;
    case ACT.SWAT: { const k = clamp(actT / 0.35, 0, 1); p.aRx = -3.1 + k * 0.9; p.aRz = -0.2; p.eR = -0.05; p.aLx = -1.2; p.aLz = 0.6; p.hL = -0.5; p.kL = 0.9; break; }
    case ACT.CELEBRATE: { const pump = Math.sin(actT * 11); if (m.flip > 0) { p.aRx = -2.6 - pump * 0.3; p.eR = -1.2 - pump * 0.6; p.aLz = 0.5; p.aLx = 0.2; } else { p.aLx = p.aRx = -2.7; p.aLz = 0.5; p.aRz = -0.5; p.eL = p.eR = -0.9; } p.headX = -0.25; if (speed > 2) { run(); p.aRx = -2.7; p.eR = -1.4; } break; }
    case ACT.BOXOUT: p.crouch = 0.2; p.pitch = 0.35; p.hL = -0.7; p.hR = -0.7; p.kL = p.kR = 1.0; p.aLz = 1.25; p.aRz = -1.25; p.eL = p.eR = -1.0; p.aLx = p.aRx = 0.3; break;
    case ACT.SCREEN: p.crouch = 0.08; p.aLx = p.aRx = -0.55; p.aLz = -0.5; p.aRz = 0.5; p.eL = p.eR = -1.7; p.hL = -0.15; p.hR = -0.15; p.kL = p.kR = 0.35; break;
    case ACT.FT: { const k = ball && ball.mode === 5 ? 1 : 0; if (k) { p.aLx = -2.85; p.aRx = -2.95; p.eL = p.eR = -0.2; } else { p.aLx = p.aRx = -1.1; p.eL = p.eR = -1.5; p.crouch = 0.06 + Math.max(0, Math.sin(actT * 3)) * 0.06; p.kL = p.kR = 0.35; } break; }
    case ACT.INBOUND: p.aLx = p.aRx = -2.6; p.eL = p.eR = -1.1; p.aLz = 0.25; p.aRz = -0.25; break;
    case ACT.STUMBLE: p.pitch = 0.3 * Math.sin(actT * 20); p.roll = 0.25 * Math.sin(actT * 15); p.aLz = 1.0; p.aRz = -1.0; run(); break;
    case ACT.REACH: run(); p.aRx = -1.6; p.aRz = -0.6; p.eR = -0.05; break;
    case ACT.POST: p.crouch = 0.22; p.pitch = 0.3; p.hL = -0.6; p.hR = -0.5; p.kL = p.kR = 1.0; p.aLz = 0.9; p.aLx = -0.4; p.aRx = -1.2; p.eR = -1.3; break;
    case ACT.CALL: run(); p.aRx = -0.55 + (ball ? clamp((ball.z - 1.4) * 0.35, -0.4, 0.5) : 0); p.eR = -0.6; p.aRz = -0.3; p.crouch = 0.06; p.aLx = -2.9; p.aLz = 0.25; p.eL = -0.9 + Math.sin(actT * 14) * 0.25; p.headX = -0.1; break; // dribbling, fist up: calling the play
    case ACT.WALL: { const sh = Math.sin(ph * 1.3) * 0.15 * runA; p.crouch = 0.16; p.hL = -0.45 + sh; p.hR = -0.45 - sh; p.kL = p.kR = 0.8; p.pitch = 0.1; p.aLx = -2.7; p.aRx = -2.75; p.aLz = 0.45; p.aRz = -0.45; p.eL = p.eR = -0.15; break; } // goalie: arms up in front of the rim
    case ACT.HUDDLE: p.pitch = 0.25; p.aLx = p.aRx = -0.6; p.aLz = 0.6; p.aRz = -0.6; p.eL = p.eR = -0.6; p.headX = 0.3; break;
    default:
      if (speed > 1.2) run();
      else if (defending) { p.crouch = 0.12; p.hL = p.hR = -0.35; p.kL = p.kR = 0.65; p.pitch = 0.15; p.aLz = 0.7; p.aRz = -0.7; p.eL = p.eR = -0.5; }
      else { const br = Math.sin(m.phase * 0.5) * 0.03; p.aLz = 0.12 + br; p.aRz = -0.12 - br; p.hL = -0.05; p.hR = -0.08; p.kL = p.kR = 0.12; }
  }
  return p;
}
function applyPose(m, t, k) {
  const p = m.pose || (m.pose = Object.assign({}, t));
  for (const key in t) p[key] = lerp(p[key], t[key], k);
  const [L, R] = m.arms, [LL, RL] = m.legs;
  L.sh.rotation.set(p.aLx, 0, p.aLz); L.el.rotation.x = p.eL;
  R.sh.rotation.set(p.aRx, 0, p.aRz); R.el.rotation.x = p.eR;
  LL.hip.rotation.x = p.hL; LL.kn.rotation.x = p.kL; RL.hip.rotation.x = p.hR; RL.kn.rotation.x = p.kR;
  m.body.rotation.set(p.pitch, 0, p.roll);
  m.body.position.y = m.legLen * (1 - p.crouch) - p.drop * (m.legLen - m.tR * 1.1);
  m.head.rotation.x = p.headX;
}

// ---------- audio ----------
function makeAudio() {
  let ctx = null, master = null, crowdGain = null, on = false, organBusy = 0;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    // crowd bed: brown noise through a low-pass
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0.18;
    src.connect(lp); lp.connect(crowdGain); crowdGain.connect(master); src.start();
  }
  function noiseBurst(dur, freq, q, gain) {
    if (!on) return; const n = ctx.sampleRate * dur, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  function tone(freqs, dur, type, gain, att) {
    if (!on) return; const t = ctx.currentTime, g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); g.connect(master);
    for (const f of freqs) { const o = ctx.createOscillator(); o.type = type || "sine"; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
  }
  // organ: additive "drawbar" voice playing short original riffs
  const RIFFS = [[0, 4, 7, 12, 7, 12], [7, 7, 9, 7, 12, 11], [0, 2, 4, 5, 7, -1, 7], [12, 11, 9, 7, 9, 12], [0, 0, 7, 7, 9, 9, 7], [5, 9, 12, 9, 5, 12]];
  function organ(riffIdx) {
    if (!on || performance.now() < organBusy) return;
    const notes = RIFFS[riffIdx % RIFFS.length], base = 261.63, t0 = ctx.currentTime;
    notes.forEach((n, i) => {
      if (n < 0) return; const f = base * Math.pow(2, n / 12), t = t0 + i * 0.19;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.015); g.gain.setValueAtTime(0.09, t + 0.15); g.gain.linearRampToValueAtTime(0, t + 0.18); g.connect(master);
      for (const [h, w] of [[1, 1], [2, 0.6], [3, 0.4], [4, 0.25], [8, 0.12]]) { const o = ctx.createOscillator(); o.frequency.value = f * h; const og = ctx.createGain(); og.gain.value = w; o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.2); }
    });
    organBusy = performance.now() + notes.length * 190 + 4000;
  }
  return {
    get on() { return on; },
    toggle() { init(); on = !on; if (ctx.state === "suspended") ctx.resume(); master.gain.value = on ? 0.8 : 0; return on; },
    excite(level) { if (on && crowdGain) { const t = ctx.currentTime; crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(crowdGain.gain.value, t); crowdGain.gain.linearRampToValueAtTime(0.18 + level * 0.55, t + 0.15); crowdGain.gain.linearRampToValueAtTime(0.18, t + 2.5 + level * 1.5); } },
    whistle() { if (!on) return; const t = ctx.currentTime, g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.38); g.connect(master);
      for (const f of [2900, 3150]) { const o = ctx.createOscillator(); o.frequency.value = f; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 38; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency); o.connect(g); o.start(t); lfo.start(t); o.stop(t + 0.4); lfo.stop(t + 0.4); } },
    buzzer() { tone([196, 247], 1.0, "square", 0.08, 0.01); },
    swish() { noiseBurst(0.25, 3200, 0.8, 0.5); },
    clank() { tone([620, 935, 1410], 0.35, "triangle", 0.07); },
    thud() { tone([95], 0.12, "sine", 0.18); },
    organ
  };
}

// ---------- the broadcast ----------
function create(canvas, overlay) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07090d); scene.fog = new THREE.Fog(0x07090d, 170, 330);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 1, 900);
  scene.add(new THREE.HemisphereLight(0xe8eeff, 0x302418, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(30, 120, 70); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd0ff, 0.35); fill.position.set(80, 60, -60); scene.add(fill);

  // court
  const courtMat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.0 });
  const court = new THREE.Mesh(new THREE.PlaneGeometry(110, 66), courtMat); court.rotation.x = -PI / 2; court.position.set(47, 0, 25); scene.add(court);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 300), mat("#0e1015")); floor.rotation.x = -PI / 2; floor.position.set(47, -0.05, 25); scene.add(floor);
  // hoops
  const nets = [];
  for (const side of [0, 1]) {
    const hx = side ? 88.75 : 5.25, dir = side ? -1 : 1, bx = side ? 90 : 4;
    const g = new THREE.Group(); scene.add(g);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 6), new THREE.MeshStandardMaterial({ color: 0xdfefff, transparent: true, opacity: 0.28, roughness: 0.1 })); board.position.set(bx, 10.6, 25); g.add(board);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 3.5, 6)), new THREE.LineBasicMaterial({ color: 0xffffff })); edges.position.copy(board.position); g.add(edges);
    const sq = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.17, 1.5, 2)), new THREE.LineBasicMaterial({ color: 0xffffff })); sq.position.set(bx, 10.25, 25); g.add(sq);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 0.6), mat("#3a3f48")); arm.position.set(bx - dir * 2.6, 11.2, 25); g.add(arm);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(1.4, 12, 1.4), mat("#3a3f48")); pole.position.set(bx - dir * 5.2, 6, 25); g.add(pole);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 4), mat("#20242c")); pad.position.set(bx - dir * 5.6, 1.6, 25); g.add(pad);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 24), mat("#ff6a13", { metalness: 0.4, roughness: 0.4 })); rim.rotation.x = PI / 2; rim.position.set(hx, 10, 25); g.add(rim);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.48, 1.5, 12, 3, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.75 })); net.position.set(hx, 9.25, 25); g.add(net);
    nets.push({ net, t: 0 });
  }
  // stands and crowd
  const standMat = mat("#1b1f28"), standMat2 = mat("#232937");
  const seats = [];
  function tier(x0, z0, x1, z1, outX, outZ, rows) {
    for (let r = 0; r < rows; r++) {
      const off = 14 + r * 3.2, hgt = 2 + r * 2.1;
      const cx = (x0 + x1) / 2 + outX * off, cz = (z0 + z1) / 2 + outZ * off;
      const lx = Math.abs(x1 - x0) + (outZ ? 2 * off : 0), lz = Math.abs(z1 - z0) + (outX ? 2 * off : 0);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(outX ? 3.2 : lx, hgt, outZ ? 3.2 : lz), r % 2 ? standMat : standMat2); slab.position.set(cx, hgt / 2, cz); scene.add(slab);
      const n = Math.floor((outX ? lz : lx) / 2.3);
      for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; seats.push({ x: outX ? cx : cx + u * lx, y: hgt + 1.1, z: outZ ? cz : cz + u * lz, rx: outX, rz: outZ, ph: Math.random() * 6, sp: 2 + Math.random() * 3 }); }
    }
  }
  tier(-6, 0, 100, 0, 0, -1, 9); tier(-6, 50, 100, 50, 0, 1, 5); tier(0, -6, 0, 56, -1, 0, 7); tier(94, -6, 94, 56, 1, 0, 7);
  const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(1.35, 2.0, 1.0), new THREE.MeshStandardMaterial({ roughness: 0.9 }), seats.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), seats.length);
  scene.add(crowd); scene.add(heads);
  seats.forEach((s, i) => heads.setColorAt(i, new THREE.Color(SKIN[Math.floor(hash(i * 17 + 3) * SKIN.length)])));
  const dummy = new THREE.Object3D();
  function paintCrowd(home, away) {
    const cols = [home.c1, home.c1, home.c1, home.c2, away.c1, "#d8d8d8", "#30343c", "#8a6f5a", "#5a7085", "#c94f4f"].map(c => new THREE.Color(c));
    seats.forEach((s, i) => crowd.setColorAt(i, cols[Math.floor(hash(i * 31 + 7) * cols.length)]));
    crowd.instanceColor.needsUpdate = true;
  }
  // benches + scorer's table on the far sideline
  for (const t of [0, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(14, 1.8, 2.5), mat("#2a2f39")); b.position.set(47 + (t ? 13 : -13), 0.9, -6.5); scene.add(b); }
  const table = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 2.5), mat("#14171d")); table.position.set(47, 1.5, -5); scene.add(table);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); const led = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 1.4), ledMat); led.position.set(47, 2, -3.7); scene.add(led);
  // center-hung scoreboard
  const sbCanvas = document.createElement("canvas"); sbCanvas.width = 512; sbCanvas.height = 256;
  const sbTex = new THREE.CanvasTexture(sbCanvas); sbTex.encoding = THREE.sRGBEncoding;
  const sbMat = new THREE.MeshBasicMaterial({ map: sbTex });
  const board = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), [sbMat, sbMat, mat("#111"), mat("#111"), sbMat, sbMat]); board.position.set(47, 46, 25); scene.add(board);
  let sbKey = "";
  function drawBoard(home, away, s0, s1, per, clk) {
    const k = s0 + "-" + s1 + "-" + per + "-" + Math.ceil(clk); if (k === sbKey) return; sbKey = k;
    const g = sbCanvas.getContext("2d"); g.fillStyle = "#05070b"; g.fillRect(0, 0, 512, 256);
    g.fillStyle = away.c1; g.fillRect(0, 0, 256, 60); g.fillStyle = home.c1; g.fillRect(256, 0, 256, 60);
    g.font = "700 40px Oswald, Impact, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#fff"; g.fillText(away.id, 128, 32); g.fillText(home.id, 384, 32);
    g.font = "700 110px Oswald, Impact, sans-serif"; g.fillStyle = "#ffcf4a"; g.fillText(s1, 128, 150); g.fillText(s0, 384, 150);
    g.font = "700 34px Oswald, Impact, sans-serif"; g.fillStyle = "#fff"; g.fillText((per <= 4 ? "Q" + per : "OT") + "  " + fmt(clk), 256, 230);
    sbTex.needsUpdate = true;
  }
  const fmt = c => { c = Math.max(0, c); if (c < 60) return c.toFixed(1); return Math.floor(c / 60) + ":" + String(Math.floor(c % 60)).padStart(2, "0"); };

  // ball
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.39, 18, 14), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.7 })); scene.add(ball);
  const blob = new THREE.CanvasTexture((() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(0,0,0,0.6)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })());
  const shadowMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
  const ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), shadowMat); ballShadow.rotation.x = -PI / 2; scene.add(ballShadow);

  // state
  let G = null, teams = null, models = {}, onCourt = new Map(), shadows = [], camMode = "auto", fx = { excite: 0 };
  const cam = { pos: new THREE.Vector3(47, 40, 110), look: new THREE.Vector3(47, 2, 25), init: false };
  for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), shadowMat); s.rotation.x = -PI / 2; s.position.y = 0.03; scene.add(s); shadows.push(s); }

  function setGame(game, home, away, colors) {
    G = game; teams = [home, away];
    for (const k in models) scene.remove(models[k].root);
    models = {}; onCourt.clear();
    courtMat.map = courtTexture(home, game.rules); courtMat.needsUpdate = true;
    paintCrowd(home, away);
    ledMat.color.set(home.c1);
    G.colors = colors; sbKey = "";
    cam.init = false;
  }
  function model(idx) {
    if (models[idx]) return models[idx];
    const r = G.roster[idx], t = r.t, c1 = G.colors[t], tm = teams[t];
    const c2 = (c1 === tm.c1 ? tm.c2 : tm.c1);
    const m = buildPlayer({ id: r.id || idx, ht: r.ht || 78, wt: r.wt || 210, num: r.num }, c1, c2);
    scene.add(m.root); models[idx] = m; return m;
  }
  function frameAt(tick) {
    const F = G.frames, ff = clamp(tick / 2, 0, G.nFrames - 1), f0 = Math.floor(ff), f1 = Math.min(G.nFrames - 1, f0 + 1), a = ff - f0;
    return { F, o0: f0 * FS, o1: f1 * FS, a };
  }
  // ---------- camera director ----------
  function direct(fr, focus, dt, portrait, phase, replay) {
    const off = fr.F[fr.o0 + 85 + 5], per = fr.F[fr.o0 + 85 + 2];
    const attRight = ((off === 0) !== (per >= 3));
    let mode = camMode === "auto" ? (portrait ? "endline" : "sideline") : camMode;
    if (camMode === "auto" && phase === 2) mode = "ft";
    if (phase === 4 || phase === 3) mode = camMode === "auto" ? "wide" : mode;
    if (replay) mode = "replay";
    const P = new THREE.Vector3(), L = new THREE.Vector3();
    let fov = 36;
    const bx = focus.x, bz = focus.z;
    if (mode === "sideline") { const cx = clamp(bx * 0.85 + 47 * 0.15, 16, 78); P.set(cx, 30, 50 + 52); L.set(clamp(bx, 12, 82), 3, 23 + (bz - 25) * 0.3); fov = portrait ? 52 : 26; }
    else if (mode === "endline") { const ex = attRight ? 94 + 24 : -24; P.set(ex, 33, 31 + (bz - 25) * 0.35); L.set(attRight ? Math.max(bx, 52) - 4 : Math.min(bx, 42) + 4, 2, 25 + (bz - 25) * 0.6); fov = portrait ? 54 : 40; }
    else if (mode === "ft") { const hx = attRight ? 88.75 : 5.25; P.set(attRight ? hx - 40 : hx + 40, 16, 25 + 14); L.set(hx, 7, 25); fov = portrait ? 58 : 34; }
    else if (mode === "overhead") { P.set(47, 120, 25.1 + (portrait ? 0 : 30)); L.set(47, 0, 25); fov = portrait ? 75 : 40; }
    else if (mode === "follow") { P.set(bx - (attRight ? 26 : -26), 13, bz + 16); L.set(bx + (attRight ? 8 : -8), 4, bz); fov = portrait ? 66 : 46; }
    else if (mode === "wide") { const t = performance.now() / 9000; P.set(47 + Math.cos(t) * 95, 55, 25 + Math.sin(t) * 75); L.set(47, 4, 25); fov = portrait ? 62 : 42; }
    else if (mode === "replay") { const t = performance.now() / 5000; P.set(bx + Math.cos(t) * 30, 12, bz + Math.sin(t) * 30); L.set(bx, 5, bz); fov = portrait ? 60 : 38; }
    const k = !cam.init ? 1 : 1 - Math.exp(-dt * (mode === "replay" ? 3 : 2.2));
    if (cam.mode !== mode && cam.init && (mode === "endline" || mode === "ft" || mode === "replay" || cam.mode === "replay" || mode === "wide" || cam.mode === "wide")) { cam.pos.copy(P); cam.look.copy(L); } // hard cut, like TV
    else { cam.pos.lerp(P, k); cam.look.lerp(L, k); }
    cam.mode = mode; cam.init = true;
    camera.fov = lerp(camera.fov, fov, cam.init ? 0.1 : 1); camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.updateProjectionMatrix();
  }
  // ---------- render one moment ----------
  let lastT = performance.now(), lastTick = -1;
  function render(tick, opts) {
    opts = opts || {};
    const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; }
    if (!G) { renderer.render(scene, camera); return; }
    const fr = frameAt(tick), F = fr.F;
    const gtick = tick - lastTick; lastTick = tick;
    const simDt = clamp(Math.abs(gtick) / 20, 0, 0.25);
    const seen = new Set();
    const bo0 = fr.o0 + 80, bo1 = fr.o1 + 80;
    const holder = F[bo0 + 3], bmode = F[bo0 + 4];
    const ballP = { x: lerp(F[bo0], F[bo1], fr.a), y: lerp(F[bo0 + 1], F[bo1 + 1], fr.a), z: lerp(F[bo0 + 2], F[bo1 + 2], fr.a), mode: bmode };
    const phase = F[fr.o0 + 85 + 6], off = F[fr.o0 + 85 + 5];
    let holderModel = null, holderAct = 0;
    for (let k = 0; k < 10; k++) {
      const b0 = fr.o0 + k * 8, b1 = fr.o1 + k * 8, idx = F[b0 + 3];
      const same = F[b1 + 3] === idx, a = same ? fr.a : 0;
      const m = model(idx); seen.add(idx);
      const x = lerp(F[b0], F[b1], a), y = lerp(F[b0 + 1], F[b1 + 1], a), z = lerp(F[b0 + 2], F[b1 + 2], a);
      const face = F[b0 + 5] + angDiff(F[b0 + 5], F[b1 + 5]) * a;
      const act = F[b0 + 6], actT = F[b0 + 7] + (F[b1 + 6] === act ? (F[b1 + 7] - F[b0 + 7]) * a : 0);
      const prev = m.root.position;
      const speed = m.seen ? Math.hypot(x - prev.x, y - prev.z) / Math.max(simDt, 0.001) * (simDt > 0 ? 1 : 0) : 0;
      m.speed = lerp(m.speed || 0, clamp(speed, 0, 25), 0.3);
      m.phase += m.speed * simDt / (0.95 * m.H) * PI;
      if (act === ACT.TACKLE || act === ACT.DUNK || act === ACT.SHOOT) m.lastHard = act === ACT.TACKLE ? ACT.TACKLE : m.lastHard;
      if (act === ACT.DOWN && m.lastAct !== ACT.DOWN && m.lastAct !== ACT.TACKLE) m.lastHard = 0;
      m.lastAct = act;
      m.root.position.set(x, z, y); m.root.rotation.y = PI / 2 - face; m.root.visible = true; m.seen = true;
      const defending = (k < 5 ? 0 : 1) !== off;
      applyPose(m, targetPose(m, act, actT, m.speed, defending, holder === idx, ballP), 1 - Math.exp(-dt * 16));
      shadows[k].position.set(x, 0.03, y); shadows[k].scale.setScalar(1 - Math.min(0.5, z * 0.06));
      if (holder === idx) { holderModel = m; holderAct = act; }
    }
    for (const k in models) if (!seen.has(+k)) models[k].root.visible = false;
    // ball: rides in the hands while held
    if (holderModel) {
      holderModel.root.updateMatrixWorld(true);
      const R = holderModel.arms[1].hand, Lh = holderModel.arms[0].hand, v = new THREE.Vector3(), v2 = new THREE.Vector3();
      R.getWorldPosition(v); Lh.getWorldPosition(v2);
      if (holderAct === ACT.DRIBBLE || holderAct === ACT.CALL) { const fwd = new THREE.Vector3(Math.sin(holderModel.root.rotation.y), 0, Math.cos(holderModel.root.rotation.y)); ball.position.set(v.x + fwd.x * 0.5, Math.max(0.39, ballP.z), v.z + fwd.z * 0.5); }
      else if (holderAct === ACT.POST) ball.position.copy(v).add(new THREE.Vector3(0, 0.3, 0));
      else ball.position.copy(v.add(v2).multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.35, 0));
    } else ball.position.set(ballP.x, Math.max(0.39, ballP.z), ballP.y);
    ball.rotation.x += simDt * 9; ball.rotation.z += simDt * 4;
    ballShadow.position.set(ball.position.x, 0.04, ball.position.z); ballShadow.scale.setScalar(1 - Math.min(0.6, ball.position.y * 0.04));
    // nets
    for (const n of nets) { if (n.t > 0) { n.t -= dt; const k = Math.sin((0.6 - n.t) * 25) * n.t; n.net.scale.set(1 - k * 0.15, 1 + k * 0.35, 1 - k * 0.15); } else n.net.scale.set(1, 1, 1); }
    // crowd: bob harder when they're into it
    fx.excite = Math.max(0, fx.excite - dt * 0.35);
    const tt = now / 1000, amp = 0.08 + fx.excite * 1.2;
    for (let i = 0; i < seats.length; i++) {
      const s = seats[i], up = Math.max(0, Math.sin(tt * s.sp + s.ph)) * amp * (0.5 + hash(i) * 0.8);
      dummy.position.set(s.x, s.y - 0.15 + up, s.z); dummy.rotation.set(0, s.rx ? PI / 2 : 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); crowd.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 1.45; dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    }
    crowd.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    const mo = fr.o0 + 85; drawBoard(teams[0], teams[1], F[mo + 3], F[mo + 4], F[mo + 2], F[mo]);
    const portrait = h > w * 1.05;
    const focus = opts.focus || { x: ball.position.x, z: ball.position.z };
    direct(fr, focus, dt, portrait, phase, !!opts.replay);
    renderer.render(scene, camera);
  }
  return {
    setGame, render,
    setCamera(m) { camMode = m; cam.init = false; },
    get camera() { return camMode; },
    swish(side) { const n = nets[side]; if (n) n.t = 0.6; },
    excite(level) { fx.excite = Math.max(fx.excite, level); },
    dispose() { renderer.dispose(); }
  };
}
window.Broadcast3D = { supported, create, makeAudio };
})();
