// ===================== 3D BROADCAST v3 =====================
// Renders a recorded game as a TV broadcast. Everything on screen is derived from the engine's frames
// and event log, so any moment can be re-rendered (replays, slow motion, free camera) and looks the
// same every time.
// v3: skinned characters (one continuous body per player, era-accurate uniforms and hair), HDR
// pipeline with bloom and filmic grading, glossy court reflections, image-based lighting, a GPU-animated
// crowd, cloth nets, an intro light show and confetti.
// Units: feet. Engine (x, y, z) -> scene (x, z, y).
"use strict";
(function () {
if (typeof THREE === "undefined") { window.Broadcast3D = null; return; }
const FS = BB.C.FS, ACT = BB.ACT, PO = 8, BO = 80, MO = 85;
if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false; // hex colors are sRGB
const PI = Math.PI, TAU = Math.PI * 2, V3 = THREE.Vector3;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sstep = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = b - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
function cr(p0, p1, p2, p3, t) { return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t); }
function crd(p0, p1, p2, p3, t) { return 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t * t); }
// exact critically damped spring step (stable at any dt)
function spring(x, v, target, w, dt) { const y = x - target, e = Math.exp(-w * dt), nx = (y + (v + w * y) * dt) * e + target, nv = (v - w * (v + w * y) * dt) * e; return [nx, nv]; }
const SKIN = ["#f3cfb0", "#e5b48f", "#cf9a72", "#b47a52", "#97603d", "#7b4a2e", "#5f3721", "#452717"];
const HAIRC = ["#120d0a", "#1f1510", "#2e1f15", "#4a3020", "#7a5530", "#b8904f", "#8a3b1c", "#120d0a"];
const ADS = ["SUMMIT TIRE & RUBBER · OFFICIAL FLOOR OF THE UBL", "BOUNCECOIN · NOT FINANCIAL ADVICE", "MAUMEE GLASS WORKS · WE SEE RIGHT THROUGH YOU", "LAKESHORE STEEL", "FLINT MOTOR PARTS CO.", "AKRON SPEC FLOORING · ADD A FOOT", "PRESQUE ISLE SHIPPING", "UBL ON TV · THREE GAMES AT ONCE"];
const col = h => new THREE.Color(h);

function supported() { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } }
function canvasTex(w, h, draw, aniso, linear) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (!linear) t.encoding = THREE.sRGBEncoding; t.anisotropy = aniso || 4; return t;
}

// ---------- textures ----------
// the court: color, or (rough=true) a roughness map where painted areas are glossier than the rubber
function courtTexture(home, aniso, rough, four) {
  const M = 9, S = 20;
  return canvasTex((94 + 2 * M) * S, (50 + 2 * M) * S, (g, W, H) => {
    const X = x => (x + M) * S, Y = y => (y + M) * S;
    const paint = rough ? "#4a4a4a" : null, rub = rough ? "#9a9a9a" : null;
    g.fillStyle = rough ? "#b4b4b4" : home.c2; g.fillRect(0, 0, W, H);
    if (!rough) { g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, 0, W, H); }
    if (rough) { g.fillStyle = rub; g.fillRect(X(0), Y(0), 94 * S, 50 * S); }
    else {
      const grad = g.createLinearGradient(0, Y(0), 0, Y(50)); grad.addColorStop(0, "#272d36"); grad.addColorStop(0.5, "#2f3640"); grad.addColorStop(1, "#272d36");
      g.fillStyle = grad; g.fillRect(X(0), Y(0), 94 * S, 50 * S);
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 42000; i++) { g.fillStyle = rnd() < 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.16)"; g.fillRect(X(rnd() * 94), Y(rnd() * 50), 1.5 + rnd() * 1.5, 1.5 + rnd() * 1.5); }
      // a faint poured-rubber sheen pattern
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.008 + rnd() * 0.01})`; g.beginPath(); g.ellipse(X(rnd() * 94), Y(rnd() * 50), (4 + rnd() * 12) * S, (1 + rnd() * 3) * S, rnd() * PI, 0, TAU); g.fill(); }
    }
    g.globalAlpha = rough ? 1 : 0.6; g.fillStyle = rough ? paint : home.c1;
    g.fillRect(X(0), Y(17), 19 * S, 16 * S); g.fillRect(X(75), Y(17), 19 * S, 16 * S);
    g.beginPath(); g.arc(X(47), Y(25), 6 * S, 0, 7); g.fill(); g.globalAlpha = 1;
    g.strokeStyle = rough ? paint : "rgba(242,238,228,0.96)"; g.lineWidth = 0.17 * S;
    g.strokeRect(X(0), Y(0), 94 * S, 50 * S);
    g.beginPath(); g.moveTo(X(47), Y(0)); g.lineTo(X(47), Y(50)); g.stroke();
    g.beginPath(); g.arc(X(47), Y(25), 6 * S, 0, 7); g.stroke(); g.beginPath(); g.arc(X(47), Y(25), 2 * S, 0, 7); g.stroke();
    for (const side of [0, 1]) {
      const hx = side ? 88.75 : 5.25, dir = side ? -1 : 1, base = side ? 94 : 0;
      g.strokeRect(Math.min(X(base), X(base + dir * 19)), Y(17), 19 * S, 16 * S);
      g.beginPath(); g.arc(X(base + dir * 19), Y(25), 6 * S, 0, 7); g.stroke();
      g.beginPath(); g.arc(X(hx), Y(25), 4 * S, side ? PI / 2 : -PI / 2, side ? PI * 1.5 : PI / 2); g.stroke();
      for (const d of [7, 8, 11, 14]) { g.beginPath(); g.moveTo(X(base + dir * d), Y(17)); g.lineTo(X(base + dir * d), Y(16.4)); g.moveTo(X(base + dir * d), Y(33)); g.lineTo(X(base + dir * d), Y(33.6)); g.stroke(); }
      const a3 = Math.asin(22 / 23.75);
      g.beginPath(); g.moveTo(X(base), Y(3)); g.lineTo(X(base + dir * 14.2), Y(3));
      if (!side) g.arc(X(hx), Y(25), 23.75 * S, -a3, a3); else g.arc(X(hx), Y(25), 23.75 * S, PI + a3, PI - a3, true);
      g.lineTo(X(base), Y(47)); g.stroke();
      if (four !== false) { // the four-point line arrived with the 1979 merger
        g.save(); g.beginPath(); g.rect(X(0), Y(0), 94 * S, 50 * S); g.clip();
        g.strokeStyle = rough ? paint : "#f2b134"; g.lineWidth = 0.32 * S; g.setLineDash([1.2 * S, 0.8 * S]);
        g.beginPath(); if (!side) g.arc(X(hx), Y(25), 30 * S, -PI / 2, PI / 2); else g.arc(X(hx), Y(25), 30 * S, PI / 2, PI * 1.5); g.stroke(); g.restore();
      }
      g.save(); g.translate(X(side ? 94 + M / 2 : -M / 2), Y(25)); g.rotate(side ? -PI / 2 : PI / 2);
      g.fillStyle = rough ? paint : home.c1; g.font = `700 ${4.4 * S}px Oswald, Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(home.name.toUpperCase(), 0, 0); g.restore();
    }
    // center logo: team badge
    g.save(); g.translate(X(47), Y(25));
    if (!rough) { g.fillStyle = home.c2; g.beginPath(); g.arc(0, 0, 4.2 * S, 0, TAU); g.fill(); g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 0.2 * S; g.stroke(); }
    else { g.fillStyle = paint; g.beginPath(); g.arc(0, 0, 4.2 * S, 0, TAU); g.fill(); }
    g.fillStyle = rough ? paint : "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${3.0 * S}px Oswald, Impact, sans-serif`; g.fillText(home.id, 0, -0.5 * S);
    g.font = `700 ${0.9 * S}px Oswald, Impact, sans-serif`; g.fillText("UBL · EST. " + (home.joined || 1954), 0, 1.9 * S);
    g.restore();
    g.fillStyle = rough ? paint : "rgba(255,255,255,0.8)"; g.font = `700 ${2.3 * S}px Oswald, Impact, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(home.city.toUpperCase() + " " + home.name.toUpperCase(), X(47), Y(-M / 2));
    g.fillText("AKRON SPEC RUBBER · +12\" VERTICAL", X(47), Y(50 + M / 2));
  }, aniso, rough);
}
function ballTextures() {
  const seams = (g, W, H) => {
    g.strokeStyle = "#140a04"; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    for (const x of [W / 4, 3 * W / 4]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (const x of [0, W / 2]) { g.beginPath(); g.ellipse(x + W / 4, H / 2, W / 6, H / 2, 0, 0, 7); g.stroke(); }
  };
  const map = canvasTex(512, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "#c95a12"); gr.addColorStop(0.5, "#e2721f"); gr.addColorStop(1, "#c95a12");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(90,30,0,0.22)" : "rgba(255,190,120,0.12)"; g.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6); }
    seams(g, W, H);
  });
  const bump = canvasTex(512, 256, (g, W, H) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26000; i++) { const v = 150 + Math.random() * 105 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(Math.random() * W, Math.random() * H, 0.9, 0, TAU); g.fill(); }
    g.strokeStyle = "#202020"; g.lineWidth = 6; seams(g, W, H);
  }, 4, true);
  return { map, bump };
}
// player uniform atlas: top half jersey (neck at top, hem at bottom), bottom half shorts (waist to hem).
// u wraps around the body: 0 back, .25 right side, .5 front, .75 left side, 1 back.
function txt(g, s, x, y, size, fill, stroke, font) {
  g.font = `700 ${size}px ${font || "Oswald, Impact, sans-serif"}`; g.lineJoin = "round"; g.textAlign = "center"; g.textBaseline = "middle";
  if (stroke) { g.lineWidth = size * 0.14; g.strokeStyle = stroke; g.strokeText(s, x, y); }
  g.fillStyle = fill; g.fillText(s, x, y);
}
function jerseyAtlas(num, name, tm, c1, c2, skin, era) {
  return canvasTex(512, 512, g => {
    g.fillStyle = c1; g.fillRect(0, 0, 512, 256);
    g.fillStyle = "rgba(0,0,0,0.08)"; for (let y = 0; y < 256; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < 512; x += 3) g.fillRect(x, y, 1, 1);
    const sh = g.createLinearGradient(0, 0, 0, 256); sh.addColorStop(0, "rgba(255,255,255,0.06)"); sh.addColorStop(1, "rgba(0,0,0,0.1)"); g.fillStyle = sh; g.fillRect(0, 0, 512, 256);
    if (era >= 1990) { g.fillStyle = c2; for (const x of [128, 384]) g.fillRect(x - 8, 50, 16, 206); }
    // armholes and scoop necks show skin, trimmed in the second color
    g.fillStyle = skin; g.strokeStyle = c2; g.lineWidth = 7;
    const ell = (cx, cy, rx, ry) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill(); g.stroke(); };
    ell(128, -8, 50, era < 1975 ? 58 : 70); ell(384, -8, 50, era < 1975 ? 58 : 70); ell(256, -6, 48, 30); ell(0, -6, 42, 18); ell(512, -6, 42, 18);
    g.fillStyle = c2; g.fillRect(0, 249, 512, 7);
    const sk = "rgba(0,0,0,0.35)";
    if (era < 1975) txt(g, tm.city.toUpperCase(), 256, 64, 24, c2, sk, "Georgia, serif");
    else txt(g, tm.name.toUpperCase(), 256, 64, 25, c2, sk);
    txt(g, String(num), 256, 132, 78, c2, sk, era < 1975 ? "Georgia, serif" : null);
    for (const x of [0, 512]) { txt(g, String(name).toUpperCase(), x, 52, 23, c2, sk); txt(g, String(num), x, 132, 94, c2, sk, era < 1975 ? "Georgia, serif" : null); }
    // shorts
    g.fillStyle = c1; g.fillRect(0, 256, 512, 256);
    g.fillStyle = "rgba(0,0,0,0.13)"; for (let y = 284; y < 512; y += 24) { g.fillRect(0, y, 512, 2); }
    const sh2 = g.createLinearGradient(0, 256, 0, 512); sh2.addColorStop(0, "rgba(0,0,0,0.12)"); sh2.addColorStop(1, "rgba(255,255,255,0.04)"); g.fillStyle = sh2; g.fillRect(0, 256, 512, 256);
    g.fillStyle = c2; g.fillRect(0, 256, 512, 20); for (const x of [128, 384]) g.fillRect(x - 10, 256, 20, 256); g.fillRect(0, 496, 512, 16);
    txt(g, tm.id.slice(0, 1), 300, 340, 36, c2, "rgba(0,0,0,0.3)");
  });
}
function danceAtlas(home, skin) {
  return canvasTex(512, 512, g => {
    g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
    g.fillStyle = home.c1; g.fillRect(0, 0, 512, 142);
    for (let i = 0; i < 700; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.55)" : "rgba(255,230,160,0.5)"; g.fillRect(Math.random() * 512, Math.random() * 138, 2, 2); }
    g.fillStyle = home.c2; g.fillRect(0, 134, 512, 9);
    g.fillStyle = skin; g.strokeStyle = home.c2; g.lineWidth = 6;
    const ell = (cx, cy, rx, ry) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill(); g.stroke(); };
    ell(128, -8, 58, 84); ell(384, -8, 58, 84); ell(256, -6, 58, 42); ell(0, -6, 52, 34); ell(512, -6, 52, 34);
    txt(g, home.name.toUpperCase(), 256, 104, 22, home.c2, "rgba(0,0,0,0.3)");
    g.fillStyle = home.c2; g.fillRect(0, 256, 512, 256); g.fillStyle = home.c1; g.fillRect(0, 256, 512, 26); g.fillRect(0, 490, 512, 22);
  });
}
function refAtlas() {
  return canvasTex(256, 256, g => {
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? "#111" : "#f2f2f2"; g.fillRect(i * 16, 0, 16, 128); }
    g.fillStyle = "#111"; g.fillRect(0, 0, 256, 10); g.fillRect(118, 0, 20, 30);
    g.fillStyle = "#16181c"; g.fillRect(0, 128, 256, 128);
    g.fillStyle = "#0b0c0e"; g.fillRect(0, 128, 256, 10);
  });
}
function coachAtlas(tm, suit) {
  return canvasTex(256, 256, g => {
    g.fillStyle = suit; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "#f4f4f2"; g.beginPath(); g.moveTo(104, 0); g.lineTo(152, 0); g.lineTo(128, 70); g.closePath(); g.fill();
    g.fillStyle = tm.c1; g.beginPath(); g.moveTo(122, 4); g.lineTo(134, 4); g.lineTo(137, 58); g.lineTo(128, 70); g.lineTo(119, 58); g.closePath(); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 3; g.beginPath(); g.moveTo(98, 0); g.lineTo(128, 86); g.lineTo(158, 0); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)"; for (const y of [92, 108]) { g.beginPath(); g.arc(128, y, 2.5, 0, TAU); g.fill(); }
    g.fillStyle = tm.c1; g.fillRect(92, 30, 8, 5);
    g.fillStyle = suit; g.fillRect(0, 128, 256, 128); g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, 128, 256, 8);
  });
}
function stripTex(home) {
  const t = canvasTex(4096, 128, (g, W, H) => {
    g.fillStyle = "#04060a"; g.fillRect(0, 0, W, H);
    let x = 0; g.font = "700 72px Oswald, Impact, sans-serif"; g.textBaseline = "middle";
    const cols = ["#f2b134", "#ffffff", "#6ec6ff", "#ff6b6b", "#9ef01a"];
    for (let i = 0; x < W; i++) { const s = "  ✦  " + ADS[i % ADS.length]; g.fillStyle = cols[i % cols.length]; g.fillText(s, x, H / 2); x += g.measureText(s).width; }
    g.fillStyle = "rgba(0,0,0,0.25)"; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
function radialTex(inner, outer) {
  return canvasTex(128, 128, (g, W) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, W, W); }, 1, true);
}
function beamTex() {
  return canvasTex(64, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "rgba(255,255,255,0.0)"); gr.addColorStop(0.15, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0.25)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }, 1, true);
}
function signAtlas(home) {
  return canvasTex(1024, 512, g => {
    const signs = [["D-FENSE", "#fff", "#111"], ["TACKLE IT!", home.c1, "#fff"], ["4!", "#f2b134", "#111"], ["BOUNCE!", "#fff", home.c1], ["WE ❤ " + home.name.toUpperCase(), "#fff", "#c1121f"], [home.city.toUpperCase(), home.c1, "#fff"], ["MVP", "#fff", "#1d3557"], ["LET'S GO " + home.id, home.c2, home.c1]];
    signs.forEach(([s, bg, fg], i) => {
      const x = (i % 4) * 256, y = Math.floor(i / 4) * 128;
      g.fillStyle = "#eee"; g.fillRect(x + 4, y + 4, 248, 120); g.fillStyle = bg; g.fillRect(x + 10, y + 10, 236, 108);
      g.save(); g.beginPath(); g.rect(x + 10, y + 10, 236, 108); g.clip();
      let size = 64; g.font = `700 ${size}px Oswald, Impact, sans-serif`; while (g.measureText(s).width > 220 && size > 18) { size -= 4; g.font = `700 ${size}px Oswald, Impact, sans-serif`; }
      txt(g, s, x + 128, y + 66, size, fg, null); g.restore();
    });
  });
}

// mesh-knit fabric: small staggered holes, as a normal map shared by every uniform
let KNIT = null;
function knitNormal() {
  if (KNIT) return KNIT;
  const W = 1024, h = new Float32Array(W * W), data = new Uint8Array(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const row = Math.floor(y / 4), ox = row % 2 ? 2 : 0, dx = ((x + ox) % 4) - 1.5, dy = (y % 4) - 1.5; h[y * W + x] = 1 - Math.exp(-(dx * dx + dy * dy) / 1.1); }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const hx = h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W], hy = h[((y + 1) % W) * W + x] - h[((y + W - 1) % W) * W + x];
    let nx = -hx * 1.4, ny = -hy * 1.4, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * W + x) * 4; data[o] = (nx * 0.5 + 0.5) * 255; data[o + 1] = (ny * 0.5 + 0.5) * 255; data[o + 2] = (nz * 0.5 + 0.5) * 255; data[o + 3] = 255;
  }
  KNIT = new THREE.DataTexture(data, W, W, THREE.RGBAFormat); KNIT.wrapS = KNIT.wrapT = THREE.RepeatWrapping; KNIT.generateMipmaps = true; KNIT.minFilter = THREE.LinearMipmapLinearFilter; KNIT.magFilter = THREE.LinearFilter; KNIT.needsUpdate = true;
  return KNIT;
}

// a rim light from the overhead rigs behind the players, as TV lighting does it
const RIM = { value: new THREE.Color(0.5, 0.56, 0.7).multiplyScalar(0.5) };
function rimLight(sh) {
  sh.uniforms.uRim = RIM;
  sh.fragmentShader = "uniform vec3 uRim;\n" + sh.fragmentShader.replace("#include <output_fragment>", "float rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);\n  outgoingLight += uRim * rimF * clamp(normal.y * 0.6 + 0.55, 0.0, 1.0);\n#include <output_fragment>");
}

// skin: light scattered under the surface warms the edge between lit and shadowed (masked to skin-colored vertices)
function skinSSS(sh, skin) {
  sh.uniforms.uSkinCol = { value: new THREE.Vector3(skin.r, skin.g, skin.b) };
  sh.fragmentShader = "uniform vec3 uSkinCol;\n" + sh.fragmentShader.replace("#include <lights_physical_pars_fragment>", THREE.ShaderChunk.lights_physical_pars_fragment.replace("vec3 irradiance = dotNL * directLight.color;",
    "vec3 irradiance = dotNL * directLight.color;\n\tfloat sssNL = dot( geometry.normal, directLight.direction ); float skinM = 1.0 - smoothstep( 0.05, 0.14, distance( vColor.rgb, uSkinCol ) );\n\tirradiance += directLight.color * vec3( 0.2, 0.065, 0.04 ) * skinM * smoothstep( -0.5, 0.3, sssNL ) * ( 1.0 - dotNL );"));
}
// hair: fine strands (straight hair) or tight coils, shaded from the bind-pose position
function hairShader(kink) {
  return sh => {
    rimLight(sh); sh.uniforms.uKink = { value: kink };
    sh.vertexShader = "varying vec3 vHP;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vHP = position;");
    sh.fragmentShader = "uniform float uKink; varying vec3 vHP;\n" + sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float hang = atan(vHP.x, vHP.z);
      float strand = 0.5 + 0.5 * sin(hang * 150.0 + sin(vHP.y * 40.0) * 2.5) * sin(hang * 47.0 + vHP.y * 13.0);
      float coil = 0.5 + 0.5 * sin(vHP.x * 95.0 + sin(vHP.z * 60.0)) * sin(vHP.y * 90.0) * sin(vHP.z * 88.0 + vHP.x * 20.0);
      float hp = mix(strand, coil, uKink); diffuseColor.rgb = diffuseColor.rgb * (0.74 + 0.42 * hp) + 0.03 * hp;`);
  };
}

// ---------- geometry builder for skinned figures ----------
class GB {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.si = []; this.sw = []; this.idx = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, c, u, v, w) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(c.r, c.g, c.b); this.uv.push(u, v);
    let s = 0; for (const q of w) s += q[1];
    for (let k = 0; k < 4; k++) { const q = w[k]; this.si.push(q ? q[0] : 0); this.sw.push(q && s ? q[1] / s : 0); }
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // a closed-ish tube: ring(t) -> {x, y, z, rx, rz}, rows run top to bottom
  tube(n, seg, ring, w, color, uv, capTop, capBot, mod) {
    // mod(t, a) scales the radius around the ring (a = angle, 0 = front): muscles, bones, grooves
    const G = [], rows = [];
    for (let i = 0; i <= n; i++) { const t = i / n, R = ring(t), row = []; for (let j = 0; j <= seg; j++) { const a = PI + (j / seg) * TAU, k = mod ? mod(t, a) : 1; row.push([R.x + R.rx * k * Math.sin(a), R.y, R.z + R.rz * k * Math.cos(a)]); } G.push(row); }
    for (let i = 0; i <= n; i++) {
      const t = i / n, wt = w(t), out = [], row = G[i], upr = G[Math.max(0, i - 1)], dnr = G[Math.min(n, i + 1)];
      for (let j = 0; j <= seg; j++) {
        const u = j / seg, a = PI + u * TAU, p = row[j], nx_ = row[j === seg ? 1 : j + 1], pv_ = row[j === 0 ? seg - 1 : j - 1], up_ = upr[j], dn_ = dnr[j];
        const ax = nx_[0] - pv_[0], ay = nx_[1] - pv_[1], az = nx_[2] - pv_[2], bx = dn_[0] - up_[0], by = dn_[1] - up_[1], bz = dn_[2] - up_[2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        if (nx * Math.sin(a) + nz * Math.cos(a) < 0) { nx = -nx; ny = -ny; nz = -nz; }
        const l = Math.hypot(nx, ny, nz) || 1, q = uv ? uv(t, u) : [0, 0];
        out.push(this.vert(p[0], p[1], p[2], nx / l, ny / l, nz / l, color(t, u), q[0], q[1], wt));
      }
      rows.push(out);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) { const a = rows[i][j], b = rows[i + 1][j], c = rows[i][j + 1], d = rows[i + 1][j + 1]; this.tri(a, b, c); this.tri(c, b, d); }
    const cap = (i, upc, lift) => {
      const R = ring(i ? 1 : 0), q = uv ? uv(i ? 1 : 0, 0.5) : [0, 0];
      const c0 = this.vert(R.x, R.y + (upc ? 1 : -1) * lift, R.z, 0, upc ? 1 : -1, 0, color(i ? 1 : 0, 0.5), q[0], q[1], w(i ? 1 : 0)), row = rows[i ? n : 0];
      for (let j = 0; j < seg; j++) upc ? this.tri(c0, row[j], row[j + 1]) : this.tri(c0, row[j + 1], row[j]);
    };
    if (capTop !== undefined && capTop !== null) cap(0, true, capTop);
    if (capBot !== undefined && capBot !== null) cap(1, false, capBot);
  }
  // append a geometry transformed by m, bound rigidly to one bone; color may be a function of the vertex
  rigid(geo, m, bone, c, wfn) {
    const pos = geo.attributes.position, nor = geo.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m), v = new V3(), nn = new V3(), base = this.count;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); const cc = typeof c === "function" ? c(v.x, v.y, v.z) : c, ww = wfn ? wfn(v.x, v.y, v.z) : [[bone, 1]];
      v.applyMatrix4(m); nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      this.vert(v.x, v.y, v.z, nn.x, nn.y, nn.z, cc, 0, 0, ww);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    geo.dispose();
  }
  build(H) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.boundingSphere = new THREE.Sphere(new V3(0, 0.5 * H, 0), 1.4 * H);
    g.boundingBox = new THREE.Box3(new V3(-1.4 * H, -0.9 * H, -1.4 * H), new V3(1.4 * H, 1.9 * H, 1.4 * H));
    return g;
  }
}
// average normals across UV seams so spheres don't show a crease
function smoothSeams(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) { const k = Math.round(p.getX(i) * 1e4) + "," + Math.round(p.getY(i) * 1e4) + "," + Math.round(p.getZ(i) * 1e4); if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
  for (const ids of map.values()) {
    if (ids.length < 2) continue; let x = 0, y = 0, z = 0;
    for (const i of ids) { x += n.getX(i); y += n.getY(i); z += n.getZ(i); }
    const l = Math.hypot(x, y, z) || 1; for (const i of ids) n.setXYZ(i, x / l, y / l, z / l);
  }
}
function mergeGeos(list) {
  const geos = list.map(g => g.index ? g.toNonIndexed() : g), names = Object.keys(geos[0].attributes), out = new THREE.BufferGeometry();
  for (const nm of names) {
    const size = geos[0].attributes[nm].itemSize, arr = new Float32Array(geos.reduce((s, g) => s + g.attributes[nm].array.length, 0)); let o = 0;
    for (const g of geos) { arr.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
// interpolate a profile [[t, a, b, ...]] smoothly
function prof(P, t) {
  if (t <= P[0][0]) return P[0].slice(1);
  for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; if (t <= b[0]) { const s = sstep((t - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, j) => v + (b[j + 1] - v) * s); } }
  return P[P.length - 1].slice(1);
}
// weights interpolated over control points [[t, {bone: w}]]
function wprof(P, t) {
  let a = P[0], b = P[0], k = 0;
  if (t > P[0][0]) { a = b = P[P.length - 1]; for (let i = 0; i < P.length - 1; i++) if (t <= P[i + 1][0]) { a = P[i]; b = P[i + 1]; k = (t - a[0]) / (b[0] - a[0]); break; } }
  const w = {}; for (const kk in a[1]) w[kk] = (w[kk] || 0) + a[1][kk] * (1 - k); for (const kk in b[1]) w[kk] = (w[kk] || 0) + b[1][kk] * k;
  return Object.keys(w).filter(kk => w[kk] > 0.001).map(kk => [+kk, w[kk]]).sort((x, y) => y[1] - x[1]);
}

// ---------- look by era ----------
function eraLook(season, id) {
  const h = k => hash(id * 131 + k * 17), e = season || 2000;
  const pick = (tbl, x) => { let a = 0; for (const [k, w] of tbl) { a += w; if (x < a) return k; } return tbl[tbl.length - 1][0]; };
  let hair;
  if (e < 1966) hair = pick([["crop", .4], ["flat", .25], ["buzz", .25], ["bald", .1]], h(1));
  else if (e < 1983) hair = pick([["afro", .45], ["crop", .2], ["buzz", .15], ["flat", .1], ["bald", .1]], h(1));
  else if (e < 2000) hair = pick([["hightop", .25], ["buzz", .3], ["crop", .2], ["bald", .15], ["corn", .05], ["afro", .05]], h(1));
  else hair = pick([["buzz", .25], ["bald", .15], ["corn", .15], ["dreads", .15], ["crop", .2], ["afro", .1]], h(1));
  const bp = e < 1966 ? .05 : e < 1983 ? .3 : e < 2000 ? .25 : .45;
  const beard = h(2) < bp ? (h(3) < (e >= 1966 && e < 1983 ? .5 : .3) ? "stache" : "beard") : null;
  return {
    hair, beard, headband: h(4) < (e < 1970 ? .02 : e < 1996 ? .25 : .15), sleeve: e >= 2000 && h(5) < .2, band: h(6) < (e < 1970 ? .05 : .35),
    shortsLen: e < 1985 ? 0.3 : e < 1996 ? 0.52 : 0.82, bag: e < 1985 ? 1.05 : e < 1996 ? 1.14 : 1.26,
    sock: e < 1966 ? "crew" : e < 1986 ? "tube" : e < 2006 ? "low" : "mid", shoe: e < 1975 ? "canvas" : e < 2000 ? "leather" : "modern", era: e, h,
    tat: e >= 1994 && h(12) < (e >= 2008 ? 0.45 : 0.3) ? (h(13) < 0.45 ? 1 : h(13) < 0.8 ? 2 : 3) : 0, // 1 right sleeve, 2 both arms, 3 an armband
    tights: e >= 2002 && h(14) < 0.22, knee: e >= 1990 && h(15) < 0.14 ? (h(16) < 0.55 ? 1 : 2) : 0, goggles: e >= 1972 && e < 1998 && h(17) < 0.035
  };
}

// ---------- a player's look: the same id and season always give the same person ----------
// r: { id, ht, wt, num, name }, tm: the team (city, name, id), c1/c2: the uniform colors
function playerSpec(r, era, tm, c1, c2, idx) {
  const id = (r.id || idx || 0) * 3 + 1, look = eraLook(era, id), h = look.h, H = (r.ht || 78) / 12, ws = clamp(Math.sqrt((r.wt || 210) / ((r.ht || 78) * 2.85)), 0.85, 1.3);
  const si = Math.floor(hash(id * 7 + 3) * SKIN.length), skin = SKIN[si];
  const hairC = si >= 4 ? HAIRC[h(8) < 0.85 ? 0 : 1] : HAIRC[Math.floor(h(9) * HAIRC.length)];
  let shoe, shoe2;
  if (look.shoe === "canvas") { shoe = h(10) < 0.6 ? "#efefe8" : "#1a1a1a"; shoe2 = shoe === "#1a1a1a" ? "#efefe8" : "#2a2a2a"; }
  else if (look.shoe === "leather") { shoe = "#f4f4f4"; shoe2 = c1; }
  else { shoe = h(10) < 0.45 ? c1 : h(10) < 0.75 ? "#141414" : "#f2f2f2"; shoe2 = c2; }
  const sockC = look.sock === "low" ? (h(11) < 0.6 ? "#f2f2f2" : "#141414") : look.sock === "mid" ? (h(11) < 0.5 ? c1 : "#f2f2f2") : "#f2f2f2";
  const tightsC = h(18) < 0.6 ? "#141414" : c1, kneeC = h(19) < 0.6 ? "#161616" : "#f0f0f0";
  return { H, ws, id, skin, hairC, look, accent: c2, c2, shoe, shoe2, shoeStyle: look.shoe, tightsC, kneeC, sock: { kind: look.sock, c: sockC }, sock2: c1,
    cloth: { atlas: jerseyAtlas(r.num, String(r.name || "").split(" ").slice(-1)[0], tm, c1, c2, skin, era), top: true, hem: 0.5, shortsLen: look.shortsLen, bag: look.bag } };
}

// ---------- skinned figures (players, referees, coaches) ----------
// bones: 0 root 1 hips 2 spine 3 chest 4 neck 5 head | 6-8 left shoulder/elbow/wrist | 9-11 right | 12-14 left hip/knee/ankle | 15-17 right
//        18 jaw 19 eyelids 20-21 eyes | 22-24 left knuckles/fingertips/thumb | 25-27 right | 28-29 brows | 30 hair sway
function buildFigure(o) {
  const H = o.H, ws = o.ws, P = new THREE.Group(), B = [];
  const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (parent) parent.add(b); B.push(b); return b; };
  const sW = 0.103 * H * ws, hipX = 0.048 * H * ws;
  const root = bone(null, 0, 0, 0), hips = bone(root, 0, 0.515 * H, 0), spine = bone(hips, 0, 0.02 * H, 0), chest = bone(spine, 0, 0.13 * H, 0), neck = bone(chest, 0, 0.155 * H, 0), head = bone(neck, 0, 0.06 * H, 0);
  const arms = [], legs = [];
  for (const s of [1, -1]) { const shoulder = bone(chest, s * sW, 0.135 * H, 0), elbow = bone(shoulder, 0, -0.17 * H, 0), wrist = bone(elbow, 0, -0.15 * H, 0); const hand = new THREE.Object3D(); hand.position.set(0, -0.052 * H, 0.006 * H); wrist.add(hand); arms.push({ shoulder, elbow, wrist, hand }); }
  for (const s of [1, -1]) { const hip = bone(hips, s * hipX, -0.02 * H, 0), knee = bone(hip, 0, -0.235 * H, 0), ankle = bone(knee, 0, -0.215 * H, 0); legs.push({ hip, knee, ankle }); }
  const jaw = bone(head, 0, 0.032 * H - 0.003 * H, 0.004 * H), lids = bone(head, 0, 0.032 * H + 0.0085 * H, 0.004 * H + 0.0549 * H); // 18 jaw, 19 eyelids
  const eyes = [1, -1].map(s => bone(head, s * 0.02015 * H, 0.032 * H + 0.00845 * H, 0.004 * H + 0.0549 * H)); // 20, 21: the irises orbit these
  const fingers = arms.map((A, k) => { const s = k ? -1 : 1, kn = bone(A.wrist, -s * 0.003 * H, -0.058 * H, 0.002 * H), mid = bone(kn, -s * 0.218 * 0.0176 * H, -0.976 * 0.0176 * H, 0), th = bone(A.wrist, -s * 0.006 * H, -0.024 * H, 0.022 * H); return { kn, mid, th }; });
  const brows = [1, -1].map(s => bone(head, s * 0.0208 * H, 0.032 * H + 0.02405 * H, 0.004 * H + 0.06045 * H)); // 28, 29
  const sway = bone(head, 0, 0.032 * H + 0.01625 * H, 0.004 * H - 0.039 * H); // 30: dreads, ponytails and afros swing from here
  for (const b of [neck, head, ...eyes]) b.rotation.order = "YXZ"; // turn, then nod: a proper look-at
  P.add(root); P.updateMatrixWorld(true);
  const look = o.look || {}, body = new GB(), cloth = new GB(), hairG = new GB(), skin = col(o.skin), seg = 18;
  const inkC = skin.clone().lerp(col("#141a2a"), 0.6), tightsC = col(o.tightsC || "#141414"), kneeC = col(o.kneeC || "#161616"), tSeed = ((o.id || 1) % 97) * 0.37;
  const inked = (k, t, u, fore) => { // tattoo sleeves and armbands, painted on the skin
    const T = look.tat; if (!T || (T !== 2 && k !== 1)) return false;
    if (T === 3) return !fore && t > 0.36 && t < 0.5 && Math.sin(u * TAU * 6 + t * 40) > -0.2;
    const a = u * TAU, z = fore ? t + 1 : t, n = Math.sin(a * 2 + z * 7 + tSeed) + Math.sin(a * 3 - z * 11 + tSeed * 2) * 0.8 + Math.sin(z * 17 + a + tSeed * 3) * 0.6;
    return n > (fore ? 0.55 : 0.2) && (fore ? t < 0.78 : t > 0.12);
  };
  const sock = o.sock, sock2 = o.sock2, shoe = col(o.shoe || "#f2f2f2"), shoe2 = col(o.shoe2 || "#cccccc"), white = col("#f4f4f4");
  // torso (rows top to bottom): y, rx, rz, cz as fractions of H
  const TP = [[0.834, .036, .035, .002], [0.826, .052, .043, 0], [0.816, .072, .05, -.003], [0.802, .09, .057, -.004], [0.786, .1, .061, -.002], [0.765, .103, .065, .004], [0.735, .099, .067, .006], [0.70, .09, .062, .003], [0.66, .079, .055, 0], [0.615, .074, .052, 0], [0.57, .076, .053, -.002], [0.53, .083, .057, -.006], [0.495, .085, .059, -.009], [0.465, .076, .053, -.006], [0.448, .05, .036, -.002]];
  const TW = [[0, { 4: .5, 3: .5 }], [0.11, { 3: 1 }], [0.43, { 3: .5, 2: .5 }], [0.6, { 2: 1 }], [0.77, { 2: .5, 1: .5 }], [0.86, { 1: 1 }]];
  const yTop = 0.832, yBot = 0.448, torsoAt = (t, inf, add) => { const y = lerp(yTop, yBot, t); let v = null; for (let i = 0; i < TP.length - 1; i++) if (y <= TP[i][0] && y >= TP[i + 1][0]) { const k = sstep((TP[i][0] - y) / (TP[i][0] - TP[i + 1][0])); v = [1, 2, 3].map(j => lerp(TP[i][j], TP[i + 1][j], k)); } v = v || [TP[TP.length - 1][1], TP[TP.length - 1][2], TP[TP.length - 1][3]]; return { x: 0, y: y * H, z: v[2] * H, rx: v[0] * H * ws * inf + add, rz: v[1] * H * ws * inf + add }; };
  const gb_ = (a, c, wd) => { const d = angDiff(c, a); return Math.exp(-d * d / (2 * wd * wd)); }, yb = (t, c, wd) => Math.exp(-((t - c) ** 2) / (2 * wd * wd));
  const torsoMod = (t, a) => { // pecs, shoulder blades, lats, spine groove, glutes, flat stomach
    const y = lerp(yTop, yBot, t); let k = 1;
    k += 0.07 * Math.exp(-((y - 0.755) ** 2) / 0.0006) * (gb_(a, 0.5, 0.32) + gb_(a, -0.5, 0.32)) - 0.025 * Math.exp(-((y - 0.75) ** 2) / 0.001) * gb_(a, 0, 0.12);
    k += 0.045 * Math.exp(-((y - 0.765) ** 2) / 0.0007) * (gb_(a, PI - 0.55, 0.3) + gb_(a, PI + 0.55, 0.3));
    k += 0.04 * Math.exp(-((y - 0.7) ** 2) / 0.0015) * (gb_(a, PI / 2 + 0.35, 0.35) + gb_(a, -PI / 2 - 0.35, 0.35));
    k -= 0.03 * gb_(a, PI, 0.12) * sstep((0.8 - y) / 0.05) * sstep((y - 0.55) / 0.05);
    k += 0.07 * Math.exp(-((y - 0.5) ** 2) / 0.0008) * (gb_(a, PI - 0.5, 0.35) + gb_(a, PI + 0.5, 0.35));
    k -= 0.015 * gb_(a, 0, 0.5) * Math.exp(-((y - 0.6) ** 2) / 0.002);
    return k;
  };
  body.tube(30, 24, t => torsoAt(t, 1, 0), t => wprof(TW, t), () => skin, null, 0.006 * H, 0.012 * H, torsoMod);
  // neck
  body.tube(4, 12, t => ({ x: 0, y: lerp(0.884, 0.812, t) * H, z: 0.004 * H, rx: 0.034 * H * Math.sqrt(ws), rz: 0.036 * H * Math.sqrt(ws) }), t => wprof([[0, { 5: .5, 4: .5 }], [0.4, { 4: 1 }], [1, { 4: .6, 3: .4 }]], t), () => skin, null);
  // arms
  const UA = [[0, .012, .012], [.025, .031, .033], [.07, .041, .042], [.15, .044, .043], [.33, .039, .04], [.55, .037, .04], [.8, .031, .032], [1, .028, .028]];
  const FA = [[0, .028, .028], [.12, .032, .03], [.38, .029, .027], [.72, .023, .022], [1, .02, .018]];
  arms.forEach((A, k) => {
    const s = k ? -1 : 1, b0 = 6 + k * 3, b1 = b0 + 1, b2 = b0 + 2, x = s * sW;
    const bandC = look.band ? col(o.accent || "#ffffff") : null, sleeveC = look.sleeve ? col(o.c2 || "#222") : null;
    body.tube(18, 14, t => { const [rx, rz] = prof(UA, t); return { x: x + s * 0.004 * H * (1 - t), y: lerp(0.826, 0.63, t) * H, z: 0, rx: rx * H * ws, rz: rz * H * ws }; }, t => wprof([[0, { 3: .55, [b0]: .45 }], [0.22, { [b0]: 1 }], [0.86, { [b0]: 1 }], [1, { [b0]: .5, [b1]: .5 }]], t), (t, u) => sleeveC && t > 0.45 ? sleeveC : inked(k, t, u, false) ? inkC : skin, null, 0.004 * H, undefined, (t, a) => 1 + 0.06 * yb(t, 0.12, 0.08) + 0.09 * yb(t, 0.5, 0.14) * gb_(a, 0, 0.6) + 0.06 * yb(t, 0.4, 0.15) * gb_(a, PI, 0.6) + 0.03 * yb(t, 0.12, 0.08) * gb_(a, s * PI / 2, 0.7));
    body.tube(12, 14, t => { const [rx, rz] = prof(FA, t); return { x, y: lerp(0.63, 0.48, t) * H, z: 0, rx: rx * H * ws, rz: rz * H * ws }; }, t => wprof([[0, { [b0]: .5, [b1]: .5 }], [0.15, { [b1]: 1 }], [0.86, { [b1]: 1 }], [1, { [b1]: .5, [b2]: .5 }]], t), (t, u) => bandC && t > 0.76 && t < 0.94 ? bandC : sleeveC ? sleeveC : inked(k, t, u, true) ? inkC : skin, null, undefined, undefined, (t, a) => 1 + 0.08 * yb(t, 0.2, 0.12) * gb_(a, s * 0.7, 0.7) + 0.08 * yb(t, 0.02, 0.04) * gb_(a, PI, 0.4));
    const M = A.wrist.matrixWorld;
    const palm = new THREE.SphereGeometry(1, 12, 9); palm.scale(0.0135 * H, 0.033 * H, 0.026 * H); palm.translate(-s * 0.002 * H, -0.033 * H, 0.002 * H);
    body.rigid(palm, M, b2, skin);
    const fb = 22 + k * 3; // knuckles, fingertips, thumb
    [0.031, 0.036, 0.034, 0.027].forEach((len, f) => {
      const L1 = len * H * 0.55, L2 = len * H * 0.45, zf = (f - 1.5) * 0.0118 * H + 0.002 * H;
      const g1 = new THREE.CapsuleGeometry(0.0058 * H, Math.max(0.001, L1 - 0.003 * H), 3, 6); g1.translate(0, -L1 / 2, 0); g1.rotateZ(-s * 0.22); g1.translate(-s * 0.003 * H, -0.058 * H, zf); body.rigid(g1, M, fb, skin);
      const g2 = new THREE.CapsuleGeometry(0.0053 * H, Math.max(0.001, L2 - 0.003 * H), 3, 6); g2.translate(0, -L1 - L2 / 2 + 0.0015 * H, 0); g2.rotateZ(-s * 0.22); g2.translate(-s * 0.003 * H, -0.058 * H, zf); body.rigid(g2, M, fb + 1, skin);
    });
    const th = new THREE.CapsuleGeometry(0.0066 * H, 0.026 * H, 3, 6); th.translate(0, -0.013 * H, 0); th.rotateX(-0.7); th.rotateZ(s * 0.25); th.translate(-s * 0.006 * H, -0.024 * H, 0.022 * H);
    body.rigid(th, M, fb + 2, skin);
  });
  // legs
  const TH = [[0, .059, .058, 0], [.15, .06, .06, .004], [.4, .054, .055, .007], [.7, .045, .046, .004], [.9, .037, .038, 0], [1, .035, .036, .002]];
  const SH = [[0, .035, .036, .002], [.12, .036, .039, -.004], [.3, .037, .042, -.01], [.55, .029, .031, -.004], [.85, .021, .022, 0], [1, .02, .021, 0]];
  const sockLen = sock ? ({ crew: 0.3, tube: 0.62, low: 0.18, mid: 0.36, dress: 0.5 })[sock.kind] : 0;
  legs.forEach((L, k) => {
    const s = k ? -1 : 1, b0 = 12 + k * 3, b1 = b0 + 1, b2 = b0 + 2, x = s * hipX;
    body.tube(16, 14, t => { const [rx, rz, cz] = prof(TH, t); return { x: x - s * 0.006 * H * t, y: lerp(0.505, 0.26, t) * H, z: cz * H, rx: rx * H * ws, rz: rz * H * ws }; }, t => wprof([[0, { 1: .5, [b0]: .5 }], [0.2, { [b0]: 1 }], [0.86, { [b0]: 1 }], [1, { [b0]: .5, [b1]: .5 }]], t), t => look.tights && t < 0.9 ? tightsC : look.knee && t > 0.86 ? kneeC : skin, null, 0, undefined, (t, a) => 1 + 0.06 * yb(t, 0.4, 0.2) * gb_(a, 0, 0.7) + 0.08 * yb(t, 0.8, 0.08) * gb_(a, -s * 0.9, 0.5) + 0.04 * yb(t, 0.45, 0.2) * gb_(a, PI, 0.6) + 0.05 * yb(t, 0.99, 0.04) * gb_(a, 0, 0.35));
    body.tube(16, 14, t => { const [rx, rz, cz] = prof(SH, t); return { x: x - s * 0.006 * H, y: lerp(0.26, 0.045, t) * H, z: cz * H, rx: rx * H * ws * (t > 1 - sockLen ? 1.04 : 1), rz: rz * H * ws * (t > 1 - sockLen ? 1.04 : 1) }; },
      t => wprof([[0, { [b0]: .5, [b1]: .5 }], [0.15, { [b1]: 1 }], [0.86, { [b1]: 1 }], [1, { [b1]: .5, [b2]: .5 }]], t),
      t => { if (look.knee && t < (look.knee === 2 ? 0.45 : 0.17)) return kneeC; if (!sock || t < 1 - sockLen) return skin; if (sock.kind === "tube") { const r = (t - (1 - sockLen)) / sockLen; if ((r > 0.06 && r < 0.13) || (r > 0.19 && r < 0.26)) return col(sock2); } return col(sock.c); }, null, undefined, undefined, (t, a) => 1 + 0.1 * yb(t, 0.28, 0.1) * (gb_(a, PI - 0.45, 0.4) + gb_(a, PI + 0.45, 0.4)) * (t < 1 - sockLen ? 1 : 0.4) + 0.05 * yb(t, 0.02, 0.04) * gb_(a, 0, 0.35) + 0.015 * yb(t, 0.5, 0.25) * gb_(a, 0, 0.15));
    // shoe
    const M = L.ankle.matrixWorld, high = o.shoeStyle === "canvas" || o.shoeStyle === "leather", sx = -s * 0.002 * H, Lh = 0.17 * H, Wd = 0.031 * H, hY = -0.3 * Lh;
    const fs = new THREE.Shape(); // footprint: round heel, wider forefoot, round toe
    fs.moveTo(-Wd * 0.76, hY + 0.07 * Lh); fs.quadraticCurveTo(0, hY - 0.06 * Lh, Wd * 0.76, hY + 0.07 * Lh); fs.quadraticCurveTo(Wd * 1.06, 0.3 * Lh, Wd * 0.92, 0.56 * Lh);
    fs.quadraticCurveTo(0.05 * Wd, 0.77 * Lh, -Wd * 0.84, 0.56 * Lh); fs.quadraticCurveTo(-Wd * 1.02, 0.26 * Lh, -Wd * 0.76, hY + 0.07 * Lh);
    const sole = new THREE.ExtrudeGeometry(fs, { depth: 0.011 * H, bevelEnabled: true, bevelThickness: 0.003 * H, bevelSize: 0.003 * H, bevelSegments: 2, curveSegments: 10 });
    sole.rotateX(PI / 2); sole.translate(sx, -0.031 * H, 0);
    body.rigid(sole, M, b2, (x, y) => o.shoeStyle === "modern" ? (y < -0.039 * H ? col("#1a1a1a") : shoe2) : y < -0.04 * H ? col("#8a8a84") : white);
    const up = new THREE.SphereGeometry(1, 18, 12); up.scale(0.029 * H, 0.027 * H, 0.08 * H); up.translate(sx, -0.014 * H, 0.03 * H);
    body.rigid(up, M, b2, shoe);
    const toe = new THREE.SphereGeometry(1, 14, 8); toe.scale(0.028 * H, 0.018 * H, 0.042 * H); toe.translate(sx, -0.023 * H, 0.086 * H);
    body.rigid(toe, M, b2, o.shoeStyle === "canvas" ? white : shoe);
    const heel = new THREE.SphereGeometry(1, 14, 8); heel.scale(0.028 * H, 0.028 * H, 0.03 * H); heel.translate(sx, -0.012 * H, -0.026 * H);
    body.rigid(heel, M, b2, o.shoeStyle === "modern" ? shoe2 : shoe);
    const collar = new THREE.CylinderGeometry(0.026 * H, 0.029 * H, high ? 0.05 * H : 0.024 * H, 16); collar.translate(0, high ? 0.006 * H : -0.006 * H, -0.004 * H);
    body.rigid(collar, M, b2, shoe);
    const tongue = new THREE.BoxGeometry(0.024 * H, 0.034 * H, 0.008 * H); tongue.rotateX(-0.45); tongue.translate(sx, 0.008 * H, 0.03 * H);
    body.rigid(tongue, M, b2, o.shoeStyle === "canvas" ? shoe : white);
    for (let li = 0; li < 4; li++) { const lace = new THREE.BoxGeometry(0.024 * H, 0.0035 * H, 0.004 * H); lace.translate(sx, 0.006 * H - li * 0.0075 * H, 0.032 * H + li * 0.013 * H); body.rigid(lace, M, b2, white); }
    const sw = new THREE.SphereGeometry(1, 12, 6); sw.scale(0.0302 * H, 0.007 * H, 0.045 * H); sw.rotateX(-0.12); sw.translate(sx, -0.016 * H, 0.03 * H);
    body.rigid(sw, M, b2, shoe2);
  });
  // head (sculpted from a sphere), face, hair
  buildHead(body, o, head.matrixWorld, H, skin, look, hairG);
  // clothing
  const tm = o.cloth;
  if (tm) {
    const bag = tm.bag || 1.06, add = 0.004 * H;
    if (tm.top) { // jersey / shirt / jacket
      const hem = tm.hem || 0.5, tt = (yTop - hem) / (yTop - yBot);
      cloth.tube(22, 24, t => { const r = torsoAt(t * tt, tm.topInf || 1.07, add); if (t === 0) { r.rx *= 1.08; r.rz *= 1.08; } return r; }, t => wprof(TW, t * tt), () => white, (t, u) => [u, 1 - t * 0.5], null, null, (t, a) => 1 + (torsoMod(t * tt, a) - 1) * 0.55);
      if (tm.sleeve) arms.forEach((A, k) => {
        const s = k ? -1 : 1, b0 = 6 + k * 3, b1 = b0 + 1, x = s * sW, len = tm.sleeve;
        cloth.tube(10, 14, t => { const tt2 = t * Math.min(1, len); const [rx, rz] = prof(UA, tt2); return { x: x + s * 0.004 * H * (1 - tt2), y: lerp(0.826, 0.63, tt2) * H, z: 0, rx: rx * H * ws * 1.14 + add, rz: rz * H * ws * 1.14 + add }; }, t => { const tt2 = t * Math.min(1, len); return wprof([[0, { 3: .55, [b0]: .45 }], [0.22, { [b0]: 1 }], [0.86, { [b0]: 1 }], [1, { [b0]: .5, [b1]: .5 }]], tt2); }, () => white, (t, u) => [u, 0.53 + t * 0.03], 0.002 * H);
        if (len > 1) cloth.tube(8, 14, t => { const tt2 = t * (len - 1); const [rx, rz] = prof(FA, tt2); return { x, y: lerp(0.63, 0.48, tt2) * H, z: 0, rx: rx * H * ws * 1.18 + add, rz: rz * H * ws * 1.18 + add }; }, t => wprof([[0, { [b0]: .5, [b1]: .5 }], [0.15, { [b1]: 1 }], [1, { [b1]: 1 }]], t * (len - 1)), () => white, (t, u) => [u, 0.53 + t * 0.03], null, null);
      });
    }
    // shorts or trousers: waist band to crotch, then each leg
    const legEnd = tm.pants ? 1.93 : tm.shortsLen || 0.3;
    cloth.tube(6, 22, t => { const r = torsoAt(lerp((yTop - 0.548) / (yTop - yBot), 1, t), bag, add); return r; }, t => wprof(TW, lerp((yTop - 0.548) / (yTop - yBot), 1, t)), () => white, (t, u) => [u, 0.5 - t * 0.1], null, 0.004 * H);
    legs.forEach((L, k) => {
      const s = k ? -1 : 1, b0 = 12 + k * 3, b1 = b0 + 1, x = s * hipX;
      cloth.tube(tm.pants ? 18 : 8, 18, t => {
        const tl = t * legEnd, onThigh = tl <= 1;
        if (onThigh) { const [rx, rz, cz] = prof(TH, tl); const r0 = Math.max(rx, 0.06) * (tm.pants ? 1.12 : bag); return { x: x - s * 0.006 * H * tl, y: lerp(0.53, 0.26, tl) * H, z: cz * H, rx: r0 * H * ws + add + (1 - t) * 0.01 * H, rz: Math.max(rz, 0.058) * (tm.pants ? 1.12 : bag) * H * ws + add }; }
        const ts = tl - 1, [rx, rz, cz] = prof(SH, ts); return { x: x - s * 0.006 * H, y: lerp(0.26, 0.045, ts) * H, z: cz * 0.5 * H, rx: Math.max(rx, 0.042) * 1.14 * H * ws + add, rz: Math.max(rz, 0.044) * 1.14 * H * ws + add };
      }, t => { const tl = t * legEnd; return tl <= 1 ? wprof([[0, { 1: .5, [b0]: .5 }], [0.2, { [b0]: 1 }], [0.86, { [b0]: 1 }], [1, { [b0]: .5, [b1]: .5 }]], tl) : wprof([[0, { [b0]: .5, [b1]: .5 }], [0.15, { [b1]: 1 }], [1, { [b1]: 1 }]], tl - 1); },
      () => white, (t, u) => [u, 0.4 - t * 0.38], null, null);
    });
  }
  // materials and skinned meshes sharing one skeleton
  const skeleton = new THREE.Skeleton(B);
  const bodyMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.58, metalness: 0, envMapIntensity: 0.55, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(1, 0.8, 0.7) });
  bodyMat.onBeforeCompile = sh => { rimLight(sh); skinSSS(sh, skin); };
  const bodyMesh = new THREE.SkinnedMesh(body.build(H), bodyMat);
  P.add(bodyMesh); bodyMesh.bind(skeleton);
  let hairMesh = null;
  if (hairG.count > 0) {
    const hc = col(o.hairC || HAIRC[0]), kink = ({ afro: 1, hightop: 0.9, corn: 0.7, dreads: 0.55, buzz: 0.5 })[look.hair] || 0;
    const hairMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.35, sheen: 0.6, sheenRoughness: 0.45, sheenColor: hc.clone().multiplyScalar(2.2).addScalar(0.08) });
    hairMat.onBeforeCompile = hairShader(kink);
    hairMesh = new THREE.SkinnedMesh(hairG.build(H), hairMat); P.add(hairMesh); hairMesh.bind(skeleton);
  }
  let clothMesh = null;
  const flap = { uTime: { value: 0 }, uFlap: { value: 0 } };
  if (tm) {
    const cm = new THREE.MeshStandardMaterial({ map: tm.atlas, roughness: 0.8, metalness: 0, envMapIntensity: 0.35, normalMap: knitNormal(), normalScale: new THREE.Vector2(0.3, 0.3) });
    // shorts hems flutter with speed and in the air
    cm.onBeforeCompile = sh => { rimLight(sh); sh.uniforms.uTime = flap.uTime; sh.uniforms.uFlap = flap.uFlap; sh.vertexShader = "uniform float uTime, uFlap;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  float hem = 1.0 - smoothstep(0.02, 0.17, uv.y);\n  transformed += objectNormal * hem * uFlap * (0.5 + 0.5 * sin(uTime * 19.0 + position.x * 37.0 + position.z * 23.0 + position.y * 11.0));"); };
    clothMesh = new THREE.SkinnedMesh(cloth.build(H), cm); P.add(clothMesh); clothMesh.bind(skeleton);
  }
  const h1 = hash(o.id * 7 + 3), h4 = hash(o.id * 41 + 17);
  return { root: P, rootBone: root, hips, spine, chest, neck, head, jaw, lids, eyes, fingers, brows, sway, browY: 0.032 * H + 0.02405 * H, shY: 0.135 * H, arms, legs, H, legLen: 0.515 * H, ankleH: 0.045 * H, tR: 0.1 * H * ws, bodyMat, meshes: [bodyMesh, clothMesh, hairMesh].filter(Boolean),
    ph: h1 * 6, dph: hash(o.id * 13 + 5), hand: -1, crossT: 0, lastSide: 0, lastFlip: -999, P: null, celeb: Math.floor(h4 * 5), lastAct: -1, fallDir: -1, land: 0, prevZ: 0, lastSp: 0, lean: 0, flap, bag: tm ? tm.bag || 1.06 : 1, lock: [{ on: false, p: new V3(), w: 0 }, { on: false, p: new V3(), w: 0 }] };
}
function buildHead(gb, o, M, H, skin, look, hg) {
  const r = 0.065 * H, C = new V3(0, 0.032 * H, 0.004 * H), hb = 5;
  const hairC = col(o.hairC || HAIRC[0]), white = col("#f6f3ee"), iris = col(o.iris || "#2a1a10"), lip = skin.clone().lerp(col("#6e2a24"), 0.32), skinD = skin.clone().multiplyScalar(0.86);
  const place = (geo, x, y, z, c, wfn) => { geo.translate(C.x + x, C.y + y, C.z + z); gb.rigid(geo, M, hb, c, wfn); };
  const placeH = (geo, x, y, z, c, wfn) => { geo.translate(C.x + x, C.y + y, C.z + z); (hg || gb).rigid(geo, M, hb, c, wfn); };
  const swayW = (x, y, z) => { const w = clamp((C.y + 0.05 * r - y) / (0.65 * r), 0, 1); return w > 0.01 ? [[30, w], [hb, 1 - w]] : [[hb, 1]]; };
  const afroW = (x, y, z) => { const w = 0.3 * clamp((y - C.y + 0.2 * r) / (1.4 * r), 0, 1); return w > 0.01 ? [[30, w], [hb, 1 - w]] : [[hb, 1]]; };
  const jawW = (x, y, z) => { const yn = (y - C.y) / r, zn = (z - C.z) / r, w = sstep((-yn - 0.4) / 0.14) * sstep((zn + 0.3) / 0.35); return w > 0.001 ? [[18, w], [hb, 1 - w]] : [[hb, 1]]; };
  // skull shape: the same function shapes hair and beards so they hug it
  const shape = (x, y, z) => {
    x *= 0.9; y *= 1.1;
    if (y < 0) { x *= 1 - 0.26 * sstep(-y / 1.0); if (z > 0) z += 0.07 * sstep((-y - 0.45) / 0.45); }
    if (z < 0 && y > -0.4) z *= 1.08;
    if (z > 0.55) z += 0.05 * Math.exp(-((y - 0.28) ** 2) / 0.006) * sstep((z - 0.55) / 0.3);
    for (const s of [-1, 1]) { const d2 = (x - s * 0.33) ** 2 + (y - 0.13) ** 2; if (z > 0.5) z -= 0.032 * Math.exp(-d2 / 0.011); }
    if (Math.abs(x) > 0.5 && y < 0 && y > -0.35 && z > 0.3) x *= 1.03;
    if (z > 0.2) for (const s of [-1, 1]) { const k = 0.055 * Math.exp(-((x - s * 0.5) ** 2 + (y + 0.12) ** 2) / 0.02); x += s * k * 0.5; z += k; } // cheekbones
    if (y < -0.35 && y > -0.9) x *= 1 + 0.09 * Math.exp(-((y + 0.62) ** 2) / 0.018) * sstep((Math.abs(x) - 0.15) / 0.2) * sstep(z + 0.2); // jaw angle
    if (z > 0.3) z += 0.06 * Math.exp(-(x * x) / 0.03 - ((y + 0.8) ** 2) / 0.02); // chin
    return [x, y, z];
  };
  const shell = (rad, mask, disp) => {
    const g = new THREE.SphereGeometry(1, 34, 26), p = g.attributes.position, soft = mask && mask.sdf, F = [];
    for (let i = 0; i < p.count; i++) {
      const [x, y, z] = shape(p.getX(i), p.getY(i), p.getZ(i)), d = disp ? disp(x, y, z) : 0;
      let R = rad + d;
      if (soft) { const f = mask.sdf(x, y, z); F[i] = f; R = lerp(0.955, R, sstep((f + 0.02) / 0.07)); } // the edge dips under the skin: a soft hairline
      p.setXYZ(i, x * R * r, y * R * r, z * R * r);
    }
    g.computeVertexNormals(); smoothSeams(g);
    if (soft) { const idx = g.index, keep = []; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2); if (Math.max(F[a], F[b], F[c]) > -0.05) keep.push(a, b, c); } g.setIndex(keep); return g; }
    if (mask) { const idx = g.index, keep = []; for (let i = 0; i < idx.count; i += 3) { let ok = true; for (let k = 0; k < 3; k++) { const v = idx.getX(i + k); if (!mask(p.getX(v) / (rad * r), p.getY(v) / (rad * r), p.getZ(v) / (rad * r))) ok = false; } if (ok) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)); } g.setIndex(keep); }
    return g;
  };
  place(shell(1, null), 0, 0, 0, skin, jawW);
  // ears, nose, eyes, brows, lips
  for (const s of [-1, 1]) {
    const ear = new THREE.SphereGeometry(1, 10, 8); ear.scale(0.085 * r, 0.2 * r, 0.14 * r); place(ear, s * 0.86 * r, 0.02 * r, -0.06 * r, skinD);
    const eye = new THREE.SphereGeometry(0.112 * r, 12, 9); eye.scale(1.15, 0.68, 1); place(eye, s * 0.31 * r, 0.13 * r, 0.845 * r, white);
    const ir = new THREE.SphereGeometry(0.058 * r, 8, 6); ir.scale(1, 0.9, 1); place(ir, s * 0.31 * r, 0.13 * r, 0.915 * r, iris, () => [[s > 0 ? 20 : 21, 1]]);
    const br = new THREE.SphereGeometry(1, 12, 6); br.scale(0.15 * r, 0.03 * r, 0.045 * r); br.rotateZ(-s * 0.14); br.rotateY(s * 0.25); place(br, s * 0.32 * r, 0.37 * r, 0.93 * r, hairC, () => [[s > 0 ? 28 : 29, 1]]);
  }
  const nose = new THREE.SphereGeometry(1, 10, 8); nose.scale(0.1 * r, 0.22 * r, 0.13 * r); place(nose, 0, -0.06 * r, 0.96 * r, skin);
  const tip = new THREE.SphereGeometry(1, 10, 8); tip.scale(0.115 * r, 0.08 * r, 0.085 * r); place(tip, 0, -0.18 * r, 1.01 * r, skin);
  const mouth = new THREE.SphereGeometry(1, 12, 8); mouth.scale(0.19 * r, 0.1 * r, 0.12 * r); place(mouth, 0, -0.44 * r, 0.82 * r, col("#2a0f0d"));
  const teeth = new THREE.BoxGeometry(0.24 * r, 0.05 * r, 0.05 * r); place(teeth, 0, -0.405 * r, 0.875 * r, col("#f1ece2"));
  const lipU = new THREE.SphereGeometry(1, 12, 6); lipU.scale(0.2 * r, 0.045 * r, 0.05 * r); place(lipU, 0, -0.39 * r, 0.905 * r, lip);
  const lipL = new THREE.SphereGeometry(1, 12, 6); lipL.scale(0.19 * r, 0.05 * r, 0.05 * r); place(lipL, 0, -0.47 * r, 0.9 * r, lip, () => [[18, 1]]);
  for (const sd of [-1, 1]) { const lid = new THREE.SphereGeometry(0.136 * r, 16, 8, 0, TAU, 0, PI * 0.5); lid.scale(1.12, 1, 1); /* a sphere cap, so it can sweep over the eye */ place(lid, sd * 0.31 * r, 0.13 * r, 0.845 * r, skin.clone().multiplyScalar(0.9), () => [[19, 1]]); }
  // hair: a shell over the skull trimmed to a hairline, plus volume by style
  const hl = (x, y, z) => y > 0.5 * sstep(z / 0.9) - 0.56 * sstep(-z / 0.9) - 0.04 && !(Math.abs(x) > 0.75 && y < 0.18 && z > -0.45);
  hl.sdf = (x, y, z) => Math.min(y - (0.5 * sstep(z / 0.9) - 0.56 * sstep(-z / 0.9) - 0.04) + 0.012 * Math.sin(x * 23 + z * 17), z < -0.5 ? 1 : (Math.hypot((Math.abs(x) - 0.98) / 0.32, (y + 0.06) / 0.3) - 1) * 0.25); // round cut around the temples and ears
  const style = look.hair || "crop";
  const hcol = (x, y, z) => hairC.clone().multiplyScalar(0.84 + 0.3 * (0.5 + 0.5 * Math.sin(x * 37 / r + z * 23 / r) * Math.sin(y * 29 / r + x * 5 / r))); // lighter and darker locks
  if (style === "crop") placeH(shell(1.05, hl), 0, 0, 0, hcol);
  else if (style === "buzz") placeH(shell(1.022, hl), 0, 0, 0, hcol);
  else if (style === "corn") placeH(shell(1.035, hl, (x) => 0.03 * Math.abs(Math.sin(x * 15))), 0, 0, 0, hcol);
  else if (style === "flat") { const g = shell(1.07, hl), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i) / r; if (y > 0.55) { p.setY(i, (0.55 + (y - 0.55) * 0.35 + 0.12) * r); p.setX(i, p.getX(i) * 1.08); p.setZ(i, p.getZ(i) * 1.05); } } g.computeVertexNormals(); placeH(g, 0, 0, 0, hcol); }
  else if (style === "afro") { const g = shell(1.0, (x, y, z) => y > 0.62 * sstep(z / 0.9) - 0.5 * sstep(-z / 0.9) - 0.02, (x, y, z) => 0.03 * (Math.sin(x * 9) + Math.sin(y * 11 + 1) + Math.sin(z * 10 + 2)) / 3 + 0.02); g.scale(1.3, 1.24, 1.26); placeH(g, 0, 0.1 * r, -0.07 * r, hcol, afroW); }
  else if (style === "hightop") { placeH(shell(1.03, hl), 0, 0, 0, hcol); const c = new THREE.CylinderGeometry(0.8 * r, 0.86 * r, 0.75 * r, 22); placeH(c, 0, 0.92 * r, -0.04 * r, hcol); }
  else if (style === "dreads") { placeH(shell(1.04, hl), 0, 0, 0, hcol); for (let i = 0; i < 16; i++) { const a = PI * 0.52 + (i / 15) * PI * 0.96, len = (0.6 + 0.35 * Math.abs(Math.cos(a))) * r + hash(i * 7 + o.id) * 0.25 * r; const d = new THREE.CapsuleGeometry(0.06 * r, len, 2, 5); d.rotateX(0.25 * Math.cos(a)); d.rotateZ(-0.25 * Math.sin(a)); placeH(d, Math.sin(a) * 0.95 * r, -0.12 * r - len / 2 + 0.3 * r, Math.cos(a) * 0.92 * r - 0.02 * r, hcol, swayW); } }
  else if (style === "pony") { placeH(shell(1.045, (x, y, z) => y > 0.5 * sstep(z / 0.9) - 0.7 * sstep(-z / 0.9) - 0.04 && !(Math.abs(x) > 0.8 && y < 0.1 && z > -0.3)), 0, 0, 0, hairC); const pt = new THREE.CapsuleGeometry(0.17 * r, 1.1 * r, 4, 8); pt.translate(0, -0.55 * r, 0); pt.rotateX(0.5); placeH(pt, 0, 0.35 * r, -1.0 * r, hcol, swayW); const bun = new THREE.SphereGeometry(0.22 * r, 8, 6); placeH(bun, 0, 0.42 * r, -0.98 * r, hcol); }
  if (look.beard === "beard") placeH(shell(1.045, (x, y, z) => y < -0.12 && z > -0.25 && !(Math.abs(x) < 0.24 && y > -0.52 && y < -0.33 && z > 0.6)), 0, 0, 0, hcol, jawW);
  if (look.beard === "stache" || look.beard === "beard") { const st = new THREE.SphereGeometry(1, 12, 6); st.scale(0.26 * r, 0.05 * r, 0.06 * r); placeH(st, 0, -0.33 * r, 0.97 * r, hcol); }
  if (look.goggles) { // 1970s–90s sports goggles
    const gm = col("#1b1b1b"); for (const sd of [-1, 1]) { const g = new THREE.TorusGeometry(0.17 * r, 0.035 * r, 6, 16); place(g, sd * 0.31 * r, 0.13 * r, 0.93 * r, gm); }
    const strap = new THREE.TorusGeometry(1.0 * r, 0.045 * r, 5, 28); strap.rotateX(PI / 2); place(strap, 0, 0.14 * r, -0.03 * r, gm);
  }
  if (look.headband) { const b = new THREE.TorusGeometry(1.0 * r, 0.085 * r, 6, 24); b.rotateX(PI / 2 + 0.18); b.scale(0.92, 1, 1.02); place(b, 0, 0.38 * r, -0.03 * r, col(o.accent || "#ffffff")); }
}
function castShadows(m, on) { m.root.traverse(o => { if (o.isMesh) o.castShadow = on; }); }
function disposeFigure(m) { m.root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }

// ===================== CARD PHOTOS =====================
// The player cards use the broadcast's own player models: the same person (face, skin, hair, build,
// uniform of that season) posed for the card in a studio, cut out on a transparent background.
// Poses: legs, spine and head as pose values; hands placed with IK at points in the chest's frame
// (x = the player's left, y = up the spine, z = forward), in fractions of his height.
const CPOSE = {
  portrait:  { yaw: 0.28, look: "cam", p: { aLz: 0.16, aRz: -0.16, eL: -0.2, eR: -0.2, hLz: 0.07, hRz: -0.07 } },
  akimbo:    { yaw: 0.16, look: "cam", p: { hLz: 0.1, hRz: -0.1 }, L: [0.15, -0.15, 0.02, [1, -0.1, -0.5]], R: [-0.15, -0.15, 0.02, [-1, -0.1, -0.5]] },
  ballhip:   { yaw: 0.3, look: "cam", p: { hLz: 0.08, hRz: -0.08, aLz: 0.14, eL: -0.25 }, R: [-0.19, -0.105, 0.075, [-0.6, -0.8, -0.6]], ball: "hip" },
  stand:     { yaw: 0.42, look: "fwd", p: { hLz: 0.07, hRz: -0.07, aLz: 0.15, eL: -0.3 }, R: [-0.16, -0.27, 0.1, [-0.5, -1, -0.5]], ball: "R" },
  mugshot:   { yaw: 0.02, look: "cam", p: { jaw: 0, hLz: 0.06, hRz: -0.06 }, L: [0.08, -0.06, 0.16, [1, -0.6, -0.3]], R: [-0.08, -0.06, 0.16, [-1, -0.6, -0.3]] },
  // dunks go up with the far hand, so the near arm never hides the face; the card hangs that hand on the rim
  dunk:      { yaw: 0.9, air: 2.6, look: "fwdup", p: { spineX: -0.05, hRx: -1.15, kR: 1.5, hLx: -0.1, kL: 0.75, fL: 0.5, fR: 0.35, jaw: 0.35 }, R: [-0.3, -0.02, -0.02, [-1, -0.6, -0.4]], L: [0.06, 0.52, 0.24, [1, 0, -0.4]], ball: "L", hand: 0 },
  block:     { yaw: 0.7, air: 2.0, look: "up", p: { hLx: -0.7, kL: 1.1, hRx: -0.2, kR: 0.5, fL: 0.4, fR: 0.5, jaw: 0.25 }, L: [0.05, 0.56, 0.12, [1, 0, -0.5]], R: [-0.16, 0.42, 0.14, [-1, 0, -0.5]] },
  shoot:     { yaw: 0.6, air: 0.9, look: "fwdup", p: { hLx: -0.12, hRx: -0.05, kL: 0.3, kR: 0.2, fL: 0.55, fR: 0.55 }, L: [0.05, 0.4, 0.17, [1, -0.3, 0]], R: [-0.04, 0.46, 0.13, [-0.6, -0.5, 0.3]], ball: "release" },
  tackle:    { yaw: 1.25, look: "fwd", p: { pitch: 0.75, spineX: 0.35, hLx: -1.4, kL: 1.4, hRx: 0.35, kR: 0.35, fR: 0.4, headX: -0.5, jaw: 0.3 }, L: [0.13, 0.05, 0.36, [1, -0.5, -0.3]], R: [-0.13, 0.08, 0.38, [-1, -0.5, -0.3]] },
  stiffarm:  { yaw: 1.15, run: 0.45, amp: 0.85, look: "fwd", p: { spineX: 0.22 }, L: [0.1, -0.02, 0.16, [1, -1, -0.4]], R: [-0.05, 0.12, 0.42, [-1, -0.3, -0.3]], ball: "L" },
  pass:      { yaw: 1.0, look: "fwd", p: { hLx: -0.55, kL: 0.5, hRx: 0.3, kR: 0.25, spineX: 0.2 }, L: [0.07, 0.07, 0.4, [1, -0.6, 0]], R: [-0.07, 0.07, 0.4, [-1, -0.6, 0]], ball: "pass" },
  rebound:   { yaw: 0.3, air: 2.0, look: "up", p: { hLx: -0.55, kL: 0.95, hRx: -0.45, kR: 0.8, hLz: 0.16, hRz: -0.16, fL: 0.45, fR: 0.45, jaw: 0.3 }, L: [0.07, 0.54, 0.1, [1, 0, -0.5]], R: [-0.07, 0.54, 0.1, [-1, 0, -0.5]], ball: "top" },
  steal:     { yaw: 1.0, look: "fwd", p: { spineX: 0.6, hLx: -1.0, kL: 1.3, hRx: 0.1, kR: 0.7, hLz: 0.12, hRz: -0.2, headX: -0.45 }, L: [0.24, -0.05, 0.12, [1, -0.5, -0.5]], R: [-0.08, -0.12, 0.44, [-1, -0.5, -0.3]], ball: "poke" },
  dribble:   { yaw: 0.75, look: "fwd", p: { spineX: 0.38, hLx: -0.85, kL: 1.15, hRx: -0.3, kR: 0.9, hLz: 0.16, hRz: -0.14, headX: -0.4 }, L: [0.27, 0.0, 0.22, [1, -0.6, -0.4]], R: [-0.2, -0.36, 0.17, [-1, -0.2, -0.6]], ball: "floor" },
  trophy:    { yaw: 0.14, look: "up", p: { hLz: 0.08, hRz: -0.08, jaw: 0.4, cL: 1, cR: 1 }, L: [0.09, 0.53, 0.1, [1, 0, -0.3]], R: [-0.09, 0.53, 0.1, [-1, 0, -0.3]] },
  celebrate: { yaw: 0.2, air: 0.4, look: "up", p: { aLz: 2.45, aRz: -2.45, eL: -0.35, eR: -0.35, aLx: -0.2, aRx: -0.2, hLz: 0.14, hRz: -0.14, kL: 0.35, kR: 0.2, fL: 0.4, fR: 0.4, jaw: 0.45, cL: 1, cR: 1 } },
  guard:     { yaw: 0.35, stance: true, look: "cam", p: { aLz: 1.15, aRz: -1.15, eL: -0.4, eR: -0.4, aLx: -0.4, aRx: -0.4, jaw: 0.1 } },
  fadeaway:  { yaw: 0.9, air: 1.4, look: "fwdup", p: { spineX: -0.38, pitch: -0.15, hLx: -0.95, kL: 1.3, hRx: 0.1, kR: 0.15, fL: 0.4, fR: 0.6 }, L: [0.05, 0.42, 0.22, [1, -0.3, 0]], R: [-0.04, 0.47, 0.2, [-0.6, -0.5, 0.3]], ball: "release" },
  hangrim:   { yaw: 0.25, air: 3.0, hand: 1, look: "fwd", p: { hLx: -0.35, kL: 0.65, hRx: -0.15, kR: 0.4, fL: 0.4, fR: 0.4, jaw: 0.4 }, L: [0.11, 0.56, 0.1, [1, 0, -0.5]], R: [-0.11, 0.56, 0.1, [-1, 0, -0.5]] },
  flex:      { yaw: 0.08, look: "cam", p: { hLz: 0.1, hRz: -0.1, jaw: 0.15, cL: 1, cR: 1 }, L: [0.27, 0.27, 0.03, [1, -0.25, 0]], R: [-0.27, 0.27, 0.03, [-1, -0.25, 0]] },
  point:     { yaw: 0.25, look: "up", p: { hLz: 0.07, hRz: -0.07, aLz: 0.16, eL: -0.25, cR: 0.6 }, R: [-0.13, 0.56, 0.12, [-1, 0, -0.4]] },
  crossover: { yaw: 0.65, look: "fwd", p: { spineX: 0.42, hLx: -0.8, kL: 1.2, hRx: 0.05, kR: 0.85, hLz: 0.3, hRz: -0.28, headX: -0.35 }, L: [0.22, -0.32, 0.2, [1, -0.3, -0.4]], R: [-0.04, -0.38, 0.27, [-1, -0.2, -0.6]], ball: "floor" }
};
const PHOTO = { r: null };
function photoRig() {
  if (PHOTO.r) return PHOTO;
  const W = 640, Hh = 960, cv = document.createElement("canvas"); cv.width = W; cv.height = Hh;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
  r.setPixelRatio(1); r.setSize(W, Hh, false); r.setClearColor(0x000000, 0);
  r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
  // a studio, not the arena: no reflected room, so the shading comes from the lights and the shapes read
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xe6edff, 0x2a2018, 0.2));
  const L = (c, k, x, y, z) => { const l = new THREE.DirectionalLight(c, k); l.position.set(x, y, z); scene.add(l); scene.add(l.target); return l; };
  const key = L(0xfff0de, 3.0, -8, 9, 10), fill = L(0xc4d4ff, 0.32, 9, 2, 8), rimA = L(0xffffff, 2.6, -9, 5, -7), rimB = L(0xffffff, 2.4, 9, 4, -7);
  const cam = new THREE.PerspectiveCamera(14, W / Hh, 1, 600);
  const bt = ballTextures(), ball = new THREE.Mesh(new THREE.SphereGeometry(0.39, 36, 24), new THREE.MeshStandardMaterial({ map: bt.map, bumpMap: bt.bump, bumpScale: 0.015, roughness: 0.72, envMapIntensity: 0.6 }));
  scene.add(ball);
  const c2d = document.createElement("canvas"); c2d.width = W; c2d.height = Hh;
  Object.assign(PHOTO, { r, cv, W, Hh, scene, key, fill, rimA, rimB, cam, ball, c2d, g: c2d.getContext("2d", { willReadFrequently: true }) });
  return PHOTO;
}
// a Santa hat that sits on the head bone (it follows every nod)
function santaHat(m, hair) {
  const r = 0.065 * m.H, h = 1.9 * r, g = new THREE.Group(), red = new THREE.MeshStandardMaterial({ color: "#c8142c", roughness: 0.85, envMapIntensity: 0.4 }), fur = new THREE.MeshStandardMaterial({ color: "#f7f5f0", roughness: 1, envMapIntensity: 0.3 });
  const cone = new THREE.ConeGeometry(r * 1.02, h, 28, 8, true), p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + h / 2) / h; p.setXYZ(i, p.getX(i) * (1 - 0.15 * t) + t * t * r * 0.45, p.getY(i) - t * t * r * 0.35, p.getZ(i) - t * t * r * 0.95); }
  cone.translate(0, h / 2, 0); cone.computeVertexNormals();
  const cm = new THREE.Mesh(cone, red); g.add(cm);
  const brim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.2, 12, 32), fur); brim.rotation.x = PI / 2; g.add(brim);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.26, 14, 10), fur); pom.position.set(r * 0.45, h - r * 0.35, -r * 0.95); g.add(pom);
  // big hair wears a bigger hat, set higher
  const k = hair === "afro" ? 1.36 : hair === "hightop" ? 0.98 : 1, up = hair === "afro" ? 0.22 * r : hair === "hightop" ? 0.66 * r : 0;
  g.scale.setScalar(k); g.position.set(0, 0.032 * m.H + 0.5 * r + up, 0.004 * m.H - 0.08 * r - (hair === "afro" ? 0.08 * r : 0)); g.rotation.x = -0.24;
  m.head.add(g);
}
const _pv = new V3(), _pw = new V3();
// render one card photo. spec: { r: { id, ht, wt, num, name }, season, tm, c1, c2, pose, hat, rim }
// resolves { blob, w, h, ppf (pixels per foot), a: anchors in image pixels }
function photo(spec) {
  const P = photoRig(), C = CPOSE[spec.pose] || CPOSE.portrait;
  const o = playerSpec(spec.r, spec.season, spec.tm, spec.c1, spec.c2);
  if (spec.hat === "clover") { o.look = Object.assign({}, o.look, { headband: true }); o.accent = "#2f9e44"; }
  const m = buildFigure(o), H = m.H;
  if (spec.hat === "santa") santaHat(m, o.look.hair);
  P.scene.add(m.root);
  try {
    // pose
    const yaw = C.yaw || 0; m.root.rotation.y = yaw;
    const p = Object.assign(base(), C.stance ? stancePose(0) : null, C.run !== undefined ? runPose(C.run * TAU, C.amp || 0.8) : null, C.p || {});
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const lk = spec.hat === "santa" && C.look !== "fwd" ? "cam" : C.look; // a Santa hat vanishes behind a head tipped back: hat wearers look at the camera
    m.look = lk === "cam" ? new V3(0, 0.8 * H, 40) : lk === "up" ? new V3(fx * 4, H + 7, fz * 4) : lk === "fwdup" ? new V3(fx * 20, H + 4, fz * 20) : new V3(fx * 20, 0.85 * H, fz * 20);
    m.lookW = 1;
    applyPose(m, p, 0, true);
    m.root.position.y = C.air || 0; m.root.updateMatrixWorld(true);
    for (const [i, T] of [[0, C.L], [1, C.R]]) if (T) {
      const A = m.arms[i], tw = m.chest.localToWorld(_pv.set(T[0] * H, T[1] * H, T[2] * H)).clone();
      const pole = _pw.set(...(T[3] || [i ? -1 : 1, -1, -0.5])).transformDirection(m.chest.matrixWorld).clone();
      ik2(A.shoulder, A.elbow, 0.17 * H, 0.202 * H, tw, pole, -1, 1);
      A.wrist.rotation.x = -0.15;
    }
    m.root.updateMatrixWorld(true);
    // gaze again now that the arms are set (the head never moved, but the eyes settle)
    const wp = ob => ob.getWorldPosition(new V3());
    const hand = i => wp(m.arms[i].hand), elbow = i => wp(m.arms[i].elbow), headC = m.head.localToWorld(new V3(0, 0.032 * H, 0.004 * H));
    // the ball
    const B = P.ball; B.visible = true; let bc = null;
    const along = (i, d) => { const h = hand(i), e = wp(m.arms[i].wrist); return h.clone().add(h.clone().sub(e).normalize().multiplyScalar(d)); };
    if (C.ball === "R") bc = along(1, 0.36);
    else if (C.ball === "L") bc = along(0, 0.3);
    else if (C.ball === "release") bc = along(1, 0.62);
    else if (C.ball === "top") bc = hand(0).add(hand(1)).multiplyScalar(0.5).add(new V3(0, 0.3, 0));
    else if (C.ball === "hip") bc = m.chest.localToWorld(new V3(-0.205 * H, -0.165 * H, 0.06 * H));
    else if (C.ball === "floor") { const h = hand(1); bc = new V3(h.x, 0.39 + 0.35, h.z); }
    if (bc) B.position.copy(bc); else B.visible = false;
    // framing: every joint, the head with its hair, the ball
    const pts = [];
    const add = (v, rad) => { pts.push([v.x - rad, v.y - rad], [v.x + rad, v.y + rad]); };
    add(headC, 0.075 * H * (o.look.hair === "afro" ? 1.5 : o.look.hair === "hightop" ? 1.4 : 1.15) + (spec.hat === "santa" ? 0.17 * H : 0));
    for (let i = 0; i < 2; i++) { add(hand(i), 0.06 * H); add(elbow(i), 0.05 * H); add(wp(m.arms[i].shoulder), 0.07 * H); add(wp(m.legs[i].knee), 0.06 * H); add(wp(m.legs[i].ankle), 0.07 * H); add(wp(m.legs[i].hip), 0.09 * H); }
    if (bc) add(bc, 0.42);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, tf = Math.tan(P.cam.fov * PI / 360), D = Math.max((y1 - y0) / 2 / tf, (x1 - x0) / 2 / (tf * P.cam.aspect)) * 1.12 + 1;
    P.cam.position.set(cx, cy, D); P.cam.lookAt(cx, cy, 0); P.cam.updateMatrixWorld(true);
    // light: warm key, cool fill, white and team-colored rims from behind
    P.rimB.color.set(spec.rim || spec.c2 || "#ffffff");
    for (const l of [P.key, P.fill, P.rimA, P.rimB]) { l.target.position.set(cx, cy, 0); }
    P.r.render(P.scene, P.cam);
    // cut out: crop to what was drawn
    const g = P.g; g.clearRect(0, 0, P.W, P.Hh); g.drawImage(P.cv, 0, 0);
    const px = g.getImageData(0, 0, P.W, P.Hh).data;
    let ax0 = P.W, ax1 = -1, ay0 = P.Hh, ay1 = -1;
    for (let y = 0; y < P.Hh; y++) { const row = y * P.W * 4; for (let x = 0; x < P.W; x++) if (px[row + x * 4 + 3] > 10) { if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y; } }
    if (ax1 < 0) throw new Error("empty photo");
    ax0 = Math.max(0, ax0 - 2); ay0 = Math.max(0, ay0 - 2); ax1 = Math.min(P.W - 1, ax1 + 2); ay1 = Math.min(P.Hh - 1, ay1 + 2);
    const w = ax1 - ax0 + 1, h = ay1 - ay0 + 1, out = document.createElement("canvas"); out.width = w; out.height = h;
    out.getContext("2d").drawImage(P.cv, ax0, ay0, w, h, 0, 0, w, h);
    const proj = v => { const q = v.clone().project(P.cam); return [Math.round(((q.x + 1) / 2 * P.W - ax0) * 10) / 10, Math.round(((1 - q.y) / 2 * P.Hh - ay0) * 10) / 10]; };
    const ppf = P.Hh / 2 / (D * tf);
    const lowFoot = [wp(m.legs[0].ankle), wp(m.legs[1].ankle)].sort((a, b) => a.y - b.y)[0];
    const a = { head: proj(headC).concat([Math.round(0.065 * H * ppf * 10) / 10]), hL: proj(hand(0)), hR: proj(hand(1)), chest: proj(m.chest.localToWorld(new V3(0, 0.02 * H, 0.11 * H))),
      pelvis: proj(wp(m.hips)), feet: proj(lowFoot.clone().setY(lowFoot.y - m.ankleH)), floor: proj(new V3(m.root.position.x, 0, (wp(m.legs[0].ankle).z + wp(m.legs[1].ankle).z) / 2)) };
    if (bc) a.ball = proj(bc).concat([Math.round(0.39 * ppf * 10) / 10]);
    if (C.hand !== undefined) a.rim = C.hand ? a.hR : a.hL; // the hand that goes on the rim
    return new Promise(res => out.toBlob(b => res({ blob: b, w, h, ppf: Math.round(ppf * 100) / 100, a }), "image/webp", 0.9));
  } finally {
    P.scene.remove(m.root);
    m.root.traverse(ob => { if (ob.isMesh) { ob.geometry.dispose(); const mt = ob.material; if (mt.map) mt.map.dispose(); mt.dispose(); } });
  }
}

// ---------- poses ----------
const KEYS = ["jaw", "lid", "cL", "cR", "brow", "pitch", "roll", "drop", "crouch", "spineX", "spineY", "spineZ", "headX", "headY", "aLx", "aLy", "aLz", "eL", "wL", "aRx", "aRy", "aRz", "eR", "wR", "hLx", "hLz", "kL", "fL", "hRx", "hRz", "kR", "fR"];
function base() { return { jaw: 0.03, lid: -0.75, cL: 0.5, cR: 0.5, brow: 0, pitch: 0, roll: 0, drop: 0, crouch: 0, spineX: 0.04, spineY: 0, spineZ: 0, headX: 0, headY: 0, aLx: 0.06, aLy: 0, aLz: 0.13, eL: -0.25, wL: 0, aRx: 0.06, aRy: 0, aRz: -0.13, eR: -0.25, wR: 0, hLx: -0.03, hLz: 0.04, kL: 0.08, fL: 0, hRx: -0.05, hRz: -0.04, kR: 0.1, fR: 0 }; }
function mix(a, b, w) { if (w <= 0) return a; for (const k of KEYS) a[k] = a[k] + (b[k] - a[k]) * w; return a; }
// a run cycle shaped like a real stride: strike with the leg forward, short stance, toe-off,
// a high heel recovery in swing; arms and shoulders counter-rotate against the legs
function runPose(ph, amp) {
  const p = base(), n = ((ph / TAU) % 1 + 1) % 1, st = 0.38;
  const leg = q => {
    const hip = -(0.28 + 0.5 * Math.cos(TAU * (q - 0.02))) * amp;
    const knee = q < st ? 0.18 + 0.32 * Math.sin(PI * q / st) * amp : 0.18 + (0.45 + 1.4 * amp) * Math.pow(Math.sin(PI * (q - st) / (1 - st)), 1.3);
    const ank = q < st ? -0.12 + 0.55 * sstep((q - 0.2) / 0.18) * amp : 0.42 * (1 - sstep((q - st) / 0.25)) - 0.12;
    return [hip, knee, ank];
  };
  const [hl, kl, al] = leg(n), [hr, kr, ar] = leg((n + 0.5) % 1), c = Math.cos(TAU * n);
  p.hLx = hl; p.kL = kl; p.fL = al; p.hRx = hr; p.kR = kr; p.fR = ar; p.hLz = 0.03; p.hRz = -0.03;
  p.aLx = 0.6 * c * amp - 0.08; p.aRx = -0.6 * c * amp - 0.08; p.eL = -0.55 - 0.9 * amp - 0.25 * Math.max(0, -c) * amp; p.eR = -0.55 - 0.9 * amp - 0.25 * Math.max(0, c) * amp;
  p.aLz = 0.15; p.aRz = -0.15;
  p.spineX = 0.06 + amp * 0.22; p.spineY = -c * 0.16 * amp; p.headY = c * 0.07 * amp;
  return p;
}
// walking: heel strike, a long stance, a low swing, small arm swing and a little hip sway
function walkPose(ph, a) {
  const p = base(), n = ((ph / TAU) % 1 + 1) % 1, st = 0.6;
  const leg = q => {
    const hip = -(0.08 + 0.32 * Math.cos(TAU * q)) * a;
    const knee = q < st ? 0.06 + 0.12 * Math.sin(PI * q / st) * a : 0.06 + 0.78 * a * Math.sin(PI * (q - st) / (1 - st));
    const ank = q < st ? (q < 0.12 ? -0.15 * a : 0.32 * a * sstep((q - 0.42) / 0.18)) : 0.25 * a * (1 - sstep((q - st) / 0.2)) - 0.05;
    return [hip, knee, ank];
  };
  const [hl, kl, al] = leg(n), [hr, kr, ar] = leg((n + 0.5) % 1), c = Math.cos(TAU * n);
  p.hLx = hl; p.kL = kl; p.fL = al; p.hRx = hr; p.kR = kr; p.fR = ar;
  p.aLx = 0.32 * c * a + 0.02; p.aRx = -0.32 * c * a + 0.02; p.eL = -0.22 - 0.12 * a - 0.12 * Math.max(0, -c) * a; p.eR = -0.22 - 0.12 * a - 0.12 * Math.max(0, c) * a; p.aLz = 0.12; p.aRz = -0.12;
  p.spineX = 0.03; p.spineY = -c * 0.07 * a; p.roll = Math.sin(TAU * n) * 0.03 * a; p.headY = c * 0.03 * a;
  return p;
}
function backPose(ph, amp) {
  const p = base(), s = Math.sin(ph);
  p.hLx = s * 0.55 * amp - 0.2; p.hRx = -s * 0.55 * amp - 0.2; p.kL = 0.45 + Math.max(0, -s) * 0.6 * amp; p.kR = 0.45 + Math.max(0, s) * 0.6 * amp;
  p.spineX = -0.06; p.crouch = 0.1; p.aLz = 0.55; p.aRz = -0.55; p.eL = p.eR = -0.8; p.aLx = p.aRx = -0.2;
  return p;
}
function slidePose(ph, amp, dir) {
  const p = base(), s = Math.sin(ph * 1.2);
  p.crouch = 0.22; p.spineX = 0.28; p.kL = p.kR = 0.95; p.hLx = p.hRx = -0.55;
  const open = 0.28 + 0.32 * amp * Math.max(0, s), close = 0.12 + 0.1 * amp * Math.max(0, -s);
  p.hLz = dir > 0 ? open : close; p.hRz = -(dir > 0 ? close : open);
  p.aLz = 1.05; p.aRz = -1.05; p.aLx = p.aRx = -0.3; p.eL = p.eR = -0.45;
  return p;
}
function stancePose(phase) { const p = base(); p.crouch = 0.24; p.spineX = 0.3; p.hLx = p.hRx = -0.6; p.kL = p.kR = 1.0; p.hLz = 0.22; p.hRz = -0.22; p.aLz = 0.8; p.aRz = -0.8; p.aLx = -0.35; p.aRx = -0.35; p.eL = p.eR = -0.45; p.aLy = Math.sin(phase * 2) * 0.15; return p; }
function locomotion(m, c) {
  const sp = c.sp;
  if (sp < 1.0) {
    if (c.defending) return stancePose(m.ph);
    const p = base(), br = Math.sin(m.ph * 0.4) * 0.03; p.aLz += br; p.aRz -= br;
    if (!c.ftWatch && c.idle && m.celeb % 3 === 0) { p.aLx = p.aRx = 0.35; p.aLz = 0.62; p.aRz = -0.62; p.eL = p.eR = -1.75; p.spineX = 0.0; return p; }
    if (c.ftWatch) { if (m.celeb % 2) { p.spineX = 0.75; p.hLx = p.hRx = -0.75; p.kL = p.kR = 0.75; p.aLx = p.aRx = -0.85; p.eL = p.eR = -0.25; p.crouch = 0.12; p.headX = -0.45; } else { p.aLz = 0.75; p.aRz = -0.75; p.eL = p.eR = -2.0; p.aLx = p.aRx = 0.3; } }
    return p;
  }
  const amp = clamp(sp / 18, 0.25, 1), tot = Math.abs(c.fwd) + Math.abs(c.left) + 0.001;
  const wF = Math.max(0, c.fwd) / tot, wB = Math.max(0, -c.fwd) / tot, wS = Math.abs(c.left) / tot;
  let p = runPose(m.ph, amp);
  if (wB > 0.05) p = mix(p, backPose(m.ph, amp), wB / (wF + wB + 0.001) * Math.min(1, wB + wF));
  if (wS > 0.35) p = mix(p, c.defending ? slidePose(m.ph, amp, Math.sign(c.left)) : runPose(m.ph, amp * 0.8), clamp((wS - 0.35) * 2, 0, 1));
  if (!c.defending && sp < 6.5 && wF > 0.5) p = mix(p, walkPose(m.ph, clamp(sp / 5, 0.35, 1)), clamp((6.5 - sp) / 2, 0, 1));
  if (sp > 16 && wF > 0.6) { const k = clamp((sp - 16) / 6, 0, 1); p.aLx = (p.aLx + 0.08) * (1 + 0.45 * k) - 0.08; p.aRx = (p.aRx + 0.08) * (1 + 0.45 * k) - 0.08; p.eL -= 0.25 * k; p.eR -= 0.25 * k; p.spineX += 0.08 * k; p.kL *= 1 + 0.15 * k; p.kR *= 1 + 0.15 * k; } // sprint form
  p.roll = clamp(-c.turn * 0.06, -0.18, 0.18) + (p.roll || 0);
  return p;
}
function air(p, z, vz) { if (z < 0.2) return p; const up = vz > 0; p.hLx = up ? -0.55 : -0.25; p.hRx = up ? -0.2 : -0.15; p.kL = up ? 1.1 : 0.45; p.kR = up ? 0.6 : 0.35; p.fL = p.fR = 0.4; return p; }
function poseFor(m, c) {
  const A = c.act, t = c.actT;
  let p = locomotion(m, c), fast = false;
  switch (A) {
    case ACT.DRIBBLE: case ACT.CALL: {
      if (c.chin) { p.aLx = p.aRx = -0.9; p.eL = p.eR = -2.15; p.aLz = 1.0; p.aRz = -1.0; p.crouch = 0.16; p.spineX = 0.28; p.hLz = 0.15; p.hRz = -0.15; p.headX = 0.05; p.jaw = 0.15; p.brow = -0.6; p.cL = p.cR = 0.26; break; } // chinning the rebound
      const d = c.dribble, arm = d.hand > 0 ? "L" : "R", off = d.hand > 0 ? "R" : "L", sg = d.hand > 0 ? 1 : -1;
      const push = Math.max(0, Math.cos(TAU * d.ph));
      p["a" + arm + "x"] = -0.55 - push * 0.25; p["a" + arm + "z"] = sg * 0.32; p["e" + arm] = -0.55 - push * 0.55; p["w" + arm] = -0.5 + push * 0.6;
      p["a" + off + "x"] = -0.95; p["a" + off + "z"] = -sg * 0.35; p["e" + off] = -0.75;
      p.crouch += 0.08; p.spineX += 0.1;
      if (d.cross > 0) { p.spineY = -sg * 0.35; p.crouch += 0.08; }
      if (A === ACT.CALL) { // free hand up, calling the set: a flat palm, then a fist pumped twice
        const pump = t < 0.6 ? 0 : Math.max(0, Math.sin((t - 0.6) * 11)) * 0.3;
        p["a" + off + "x"] = -2.85 + pump; p["a" + off + "z"] = -sg * 0.18; p["e" + off] = -0.35 - pump * 1.6; p.headY = -sg * 0.25; p.jaw = 0.22; p.spineX -= 0.05;
      }
      break;
    }
    case ACT.WALL: { // goalie: arms straight up, wide and tall, chest to the driver
      const sh = Math.sin(m.ph * 3 + t * 5) * 0.06;
      p.aLx = -3.0 + sh; p.aRx = -3.0 - sh; p.aLz = 0.22; p.aRz = -0.22; p.eL = p.eR = -0.08; p.wL = p.wR = 0.3;
      p.hLx = p.hRx = -0.4; p.hLz = 0.26; p.hRz = -0.26; p.kL = p.kR = 0.62; p.crouch = 0.14; p.spineX = -0.05; p.headX = -0.15; p.jaw = 0.08;
      break;
    }
    case ACT.SHOOT: case ACT.FT: {
      const S = c.shotStyle;
      if (A === ACT.FT && c.ballMode !== 5) { // routine at the line
        const r = t % 3.2, win = c.ftWin || 1.3; // each shooter's own number of dribbles
        if (r < win) { const d = c.dribble; p.aRx = -0.55; p.eR = -0.6 - Math.max(0, Math.cos(TAU * d.ph)) * 0.5; p.aLx = -0.8; p.eL = -0.9; p.crouch = 0.12; p.spineX = 0.3; }
        else if (S === "under") { p.aLx = p.aRx = -0.3; p.eL = p.eR = -0.25; p.aLz = 0.22; p.aRz = -0.22; p.crouch = 0.2; p.spineX = 0.5; p.hLx = p.hRx = -0.55; p.kL = p.kR = 0.75; p.headX = -0.55; } // granny style, from between the knees
        else if (c.ftSpin && r < win + 0.55) { const sw = Math.sin(r * 22) * 0.35; p.aLx = p.aRx = -1.15; p.eL = p.eR = -1.5; p.wL = sw; p.wR = -sw; p.crouch = 0.06; } // spin the ball in the hands
        else { p.aLx = p.aRx = -1.1; p.eL = p.eR = -1.55; p.crouch = 0.08; p.kL = p.kR = 0.35; if (r > 2.55) { p.kL = p.kR = 0.62; p.hLx = p.hRx = -0.35; p.crouch = 0.12; } } // the dip before the shot
        p.brow = -0.3; break;
      }
      const inAir = c.z > 0.15 || (A === ACT.FT && c.ballMode === 5);
      if (A === ACT.FT && S === "under") { p.aLx = p.aRx = -2.2; p.eL = p.eR = -0.05; p.aLz = 0.2; p.aRz = -0.2; p.wL = p.wR = 0.6; p.kL = p.kR = 0.1; p.spineX = -0.05; p.headX = -0.35; fast = true; }
      else if (c.holding && !inAir) {
        const k = sstep(t / 0.38); p.crouch = 0.2 * Math.sin(k * PI); p.kL = p.kR = 0.25 + 0.75 * Math.sin(k * PI); p.hLx = p.hRx = -0.45 * Math.sin(k * PI); p.aLx = lerp(-0.9, -2.55, k); p.aRx = lerp(-0.9, -2.75, k); p.eL = p.eR = lerp(-1.4, -1.7, k); p.aLz = 0.25; p.aRz = -0.05; p.spineX = 0.05; p.headX = -0.15;
        if (S === "set2") { p.aLx = p.aRx = lerp(-0.9, -1.5, k); p.eL = p.eR = -1.95; p.aLz = 0.38; p.aRz = -0.38; } // both hands at the chest
        else if (S === "hook") { p.spineY = -0.55; p.aRx = -0.7; p.aRz = -0.9; p.eR = -1.2; p.aLx = -1.2; p.aLz = 0.6; p.eL = -1.3; p.crouch = 0.12; }
      } else {
        const st = m.celeb % 3; p = air(p, c.z, c.vz); p.aRx = -3.0 + st * 0.08; p.eR = -0.12; p.wR = 1.0 + 0.15 * (st % 2); p.aLx = -2.6; p.eL = -0.5; p.aLz = 0.45; p.aRz = -0.05 - 0.1 * st; p.spineX = -0.04; p.headX = -0.35 - 0.05 * st; fast = true;
        if (S === "set2") { p.aLx = p.aRx = -2.65; p.eL = p.eR = -0.12; p.aLz = 0.22; p.aRz = -0.22; p.wL = p.wR = 0.95; p.spineX = 0; p.headX = -0.3; } // the two-hand set shot
        else if (S === "hook") { const k = sstep(clamp((t - 0.35) / 0.3, 0, 1)); p.aRz = lerp(-1.3, -2.95, k); p.aRx = -0.25; p.eR = -0.35 + 0.25 * k; p.wR = 0.9 * k; p.aLx = -1.5; p.aLz = 0.85; p.eL = -1.2; p.spineY = -0.6; p.hRx = -1.3; p.kR = 1.5; p.hLx = -0.1; p.kL = 0.3; p.headX = -0.4; } // sweeping hook
        else if (S === "fade") { p.spineX -= 0.35; p.pitch = -0.22; p.hLx = -0.55; p.kL = 0.45; p.hRx = -0.15; p.kR = 0.6; p.headX = -0.15; } // fading away
        else if (S === "runner") { p.aRx = -2.55; p.eR = -0.1; p.wR = 0.75; p.aLx = -1.2; p.aLz = 0.55; p.eL = -0.9; p.hLx = -1.35; p.kL = 1.55; p.hRx = 0.1; p.kR = 0.35; p.spineX = 0.12; p.headX = -0.35; } // floater off one foot
      }
      p.brow = -0.35;
      break;
    }
    case ACT.LAYUP: {
      if (c.z < 0.15 && c.holding) { p.aLx = p.aRx = -1.0; p.eL = p.eR = -1.2; p.crouch = 0.12; break; }
      p.hLx = -1.45; p.kL = 1.7; p.fL = 0.5; p.hRx = 0.25; p.kR = 0.25; p.aRx = -3.05; p.eR = -0.08; p.wR = c.holding ? 0 : 0.9; p.aLx = -1.1; p.eL = -1.0; p.aLz = 0.35; p.spineX = -0.05; p.headX = -0.4; fast = true;
      if (c.shotStyle === "roll") { p.aRx = -2.6; p.eR = -0.22; p.aRy = -1.3; p.wR = c.holding ? -0.3 : -0.75; } // finger roll, palm up
      break;
    }
    case ACT.DUNK: {
      if (c.z < 0.15 && c.holding) { const k = sstep(t / 0.36); p.crouch = 0.18 * k; p.kL = p.kR = 0.4 + 0.8 * k; p.hLx = p.hRx = -0.7 * k; p.aLx = p.aRx = lerp(-1.0, -2.2, k); p.eL = p.eR = -1.4; p.spineX = 0.3 * k; break; }
      p = air(p, c.z, c.vz);
      const ds = c.dunkStyle || 0, ap = clamp((t - 0.36) / 0.55, 0, 1);
      if (c.holding || c.vz > 2) {
        if (ds === 1) { p.aRx = -3.5; p.eR = -1.9; p.aRz = -0.2; p.aLx = -1.6; p.aLz = 0.5; p.eL = -0.4; p.spineX = -0.25; p.hLx = -1.3; p.kL = 1.7; p.hRx = -0.3; p.kR = 1.2; p.headX = -0.5; } // tomahawk
        else if (ds === 2) { p.aRx = lerp(-0.8, PI + 0.5, sstep(ap)); p.eR = -0.15; p.aRz = -0.15; p.aLx = -1.4; p.aLz = 0.6; p.eL = -0.6; p.hLx = -1.1; p.kL = 1.6; p.hRx = -0.4; p.kR = 1.0; p.spineX = -0.1; p.headX = -0.4; } // windmill
        else { p.aLx = p.aRx = -3.0; p.eL = p.eR = -1.5; p.hLx = -1.2; p.kL = 1.6; p.hRx = -0.5; p.kR = 1.1; p.spineX = -0.2; p.headX = -0.45; if (ds >= 3) { p.hLx = p.hRx = -0.9; p.kL = p.kR = 1.45; } } // power; 360 and reverse spin the body
      }
      else { p.aLx = -2.3; p.aRx = -2.1; p.eL = p.eR = -0.3; p.wL = p.wR = 0.9; p.spineX = 0.35; p.hLx = -0.9; p.kL = 1.3; p.headX = 0.1; } // slam, then hang
      fast = true; break;
    }
    case ACT.PASS: {
      const k = sstep(t / 0.22), S = c.passStyle;
      if (S === "bounce") { p.aLx = p.aRx = -1.0 - k * 0.15; p.eL = p.eR = -1.5 + k * 1.45; p.wL = p.wR = k * 0.9; p.aLz = 0.35 - k * 0.25; p.aRz = -0.35 + k * 0.25; p.crouch = 0.2; p.spineX += 0.35; p.kL = p.kR = 0.8; p.hLx = p.hRx = -0.5; }
      else if (S === "lob") { p.aLx = p.aRx = -2.9 + k * 0.45; p.eL = p.eR = -1.6 + k * 1.5; p.wL = p.wR = k * 0.9; p.aLz = 0.3; p.aRz = -0.3; p.spineX -= 0.1; p.headX = -0.3; }
      else if (S === "long") { p.aRx = lerp(-2.6, -1.5, k); p.aRz = lerp(-0.7, -0.1, k); p.eR = lerp(-1.9, -0.1, k); p.wR = k; p.aLx = -1.2; p.aLz = 0.5; p.eL = -0.6; p.spineY = lerp(-0.55, 0.45, k); p.hLx = -0.6; p.kL = 0.3; }
      else { p.aLx = p.aRx = -1.35 - k * 0.2; p.eL = p.eR = -1.5 + k * 1.4; p.wL = p.wR = k * 0.8; p.aLz = 0.4 - k * 0.32; p.aRz = -0.4 + k * 0.32; p.spineX += 0.12; }
      fast = true; break;
    }
    case ACT.CATCH: p.aLx = p.aRx = -1.4; p.eL = p.eR = -0.4; p.aLz = 0.38; p.aRz = -0.38; p.wL = p.wR = -0.3; break;
    case ACT.TACKLE: { const k = sstep(t / 0.2); p = base(); p.pitch = 0.3 + k * 1.0; p.aLx = p.aRx = -2.2 - k * 0.3; p.eL = p.eR = -0.25 - k * 0.6; p.aLz = 0.75 - k * 0.45; p.aRz = -0.75 + k * 0.45; p.hLx = 0.55; p.kL = 0.5; p.hRx = -0.6 + k * 1.0; p.kR = 0.25; p.headX = -0.6 * k; p.drop = k * 0.25; fast = true; break; }
    case ACT.DOWN: {
      p = base(); const face = m.fallDir > 0, k = sstep(t / 0.28);
      p.pitch = (face ? 1.5 : -1.45) * k; p.drop = k;
      if (face) { p.aLx = -2.7; p.aRx = -2.5; p.aLz = 0.6; p.aRz = -0.7; p.eL = p.eR = -0.6; p.hLx = 0.15; p.kL = 0.6; p.hRx = 0.05; p.kR = 0.3; p.headX = -0.6; }
      else { p.aLx = 0.5; p.aRx = 0.2; p.aLz = 1.1; p.aRz = -0.9; p.eL = -0.3; p.eR = -0.6; p.hLx = -0.5; p.kL = 0.9; p.hRx = -0.1; p.kR = 0.3; p.headX = 0.4; }
      p.bounce = t > 0.25 ? Math.max(0, Math.exp(-(t - 0.25) * 4.5) * Math.sin((t - 0.25) * 15)) * 0.55 : 0; // the rubber floor
      fast = true; break;
    }
    case ACT.GETUP: { const k = sstep(t / 0.45), face = m.fallDir > 0; p = base(); p.pitch = (face ? 1.5 : -1.45) * (1 - k); p.drop = 1 - k; p.kL = p.kR = 1.5 * (1 - k * 0.8); p.hLx = p.hRx = -1.1 * (1 - k); p.aLx = p.aRx = face ? -1.0 * (1 - k) : 0.4; p.eL = p.eR = -1.2 * (1 - k); p.crouch = 0.25 * (1 - k); break; }
    case ACT.CONTEST: p = air(p, c.z, c.vz); p.aLx = -3.05; p.aRx = -2.92; p.eL = p.eR = -0.04; p.aLz = 0.12; p.aRz = -0.2; p.wL = p.wR = -0.2; p.spineX = 0.08; p.headX = -0.3; break;
    case ACT.REBOUND: p = air(p, c.z, c.vz); p.aLx = p.aRx = -2.85; p.eL = p.eR = -0.2; p.aLz = 0.32; p.aRz = -0.32; p.headX = -0.5;
      if (c.holding && c.z < 0.3) { p.aLx = p.aRx = -0.9; p.eL = p.eR = -2.15; p.aLz = 1.0; p.aRz = -1.0; p.crouch = 0.16; p.spineX = 0.28; p.hLz = 0.15; p.hRz = -0.15; p.headX = 0.05; p.jaw = 0.15; p.brow = -0.6; } // chin it
      break;
    case ACT.SWAT: { const k = sstep(t / 0.3); p = air(p, c.z, c.vz); p.aRx = -3.1 + k * 1.1; p.aRz = -0.15 - k * 0.3; p.eR = -0.05; p.wR = k * 0.8; p.aLx = -1.4; p.aLz = 0.7; p.headX = -0.4; fast = true; break; }
    case ACT.CELEBRATE: {
      const pump = Math.sin(t * 11), st = m.celeb;
      if (c.bump) { p.aLx = p.aRx = 0.9; p.aLz = 0.55; p.aRz = -0.55; p.eL = p.eR = -0.4; p.spineX = -0.35; p.headX = -0.25; p.hLx = p.hRx = -0.3; p.kL = p.kR = 0.5; p.jaw = 0.3; p.brow = 0.6; p.cL = p.cR = 1.4; break; } // chest bump
      if (c.sp > 6) { p.aLz = 1.45; p.aRz = -1.45; p.aLx = p.aRx = -0.1; p.eL = p.eR = -0.05; break; } // airplane
      if (st === 0) { p.aRx = -2.65 - pump * 0.3; p.eR = -1.25 - pump * 0.6; p.aLz = 0.4; }
      else if (st === 1) { p.aLx = p.aRx = -1.6; p.aLz = 1.45; p.aRz = -1.45; p.eL = p.eR = -2.1; p.spineX = -0.1; p.headX = -0.2; }
      else if (st === 2) { p.aRx = -2.2; p.aRy = 0.4; p.eR = -0.05; p.aLz = 0.5; p.headX = -0.3; }
      else if (st === 3) { p.aRx = -1.3; p.aRz = 0.9; p.eR = -2.2 - pump * 0.25; p.aLx = -0.4; p.aLz = 0.6; p.spineX = -0.15; }
      else { p.aLx = p.aRx = -0.9; p.eL = p.eR = -1.6; p.spineY = Math.sin(t * 16) * 0.3; p.aLz = 0.5; p.aRz = -0.5; }
      break;
    }
    case ACT.BOXOUT: p.crouch = 0.24; p.pitch = 0.1; p.spineX = 0.32; p.hLx = p.hRx = -0.75; p.kL = p.kR = 1.05; p.hLz = 0.3; p.hRz = -0.3; p.aLz = 1.25; p.aRz = -1.25; p.eL = p.eR = -1.05; p.aLx = p.aRx = 0.35; break;
    case ACT.SCREEN: p.crouch = 0.1; p.hLz = 0.24; p.hRz = -0.24; p.kL = p.kR = 0.4; p.aLx = p.aRx = -0.55; p.aLz = -0.55; p.aRz = 0.55; p.eL = p.eR = -1.75; p.spineX = 0.08; break;
    case ACT.INBOUND: p.aLx = p.aRx = -2.65; p.eL = p.eR = -1.15; p.aLz = 0.25; p.aRz = -0.25; p.headY = Math.sin(t * 2.2) * 0.5; break;
    case ACT.STUMBLE: p.pitch = 0.3 * Math.sin(t * 20); p.roll = 0.25 * Math.sin(t * 15); p.aLz = 1.2 + Math.sin(t * 25) * 0.4; p.aRz = -1.2 + Math.sin(t * 22) * 0.4; break;
    case ACT.REACH: p.aRx = -1.65; p.aRz = -0.55; p.eR = -0.04; p.wR = -0.3; p.spineX += 0.15; fast = true; break;
    case ACT.POST: { const d = c.dribble, push = Math.max(0, Math.cos(TAU * d.ph)); p.crouch = 0.24; p.spineX = 0.12; p.pitch = -0.12; p.hLx = -0.65; p.hRx = -0.5; p.kL = p.kR = 1.0; p.hLz = 0.2; p.hRz = -0.2; p.aLx = 0.5; p.aLz = 0.6; p.eL = -0.4; p.aRx = -0.4; p.aRz = -0.5; p.eR = -0.5 - push * 0.5; p.headY = 1.0; break; }
    case ACT.HUDDLE: p.spineX = 0.35; p.aLx = p.aRx = -0.7; p.aLz = 0.9; p.aRz = -0.9; p.eL = p.eR = -0.4; p.headX = 0.35; break;
    case ACT.STANCE: p = c.sp > 2.5 ? locomotion(m, Object.assign({}, c, { defending: true })) : stancePose(m.ph); break;
  }
  if (c.highfive && A === ACT.NONE) { p.aRx = -2.7; p.aRz = -0.35; p.eR = -0.2; }
  // winded: hands on the knees between whistles once a player has been running hard
  if (A === ACT.NONE && !c.holding && c.sp < 0.6 && (c.ftWatch || c.idle) && c.tired > 0.5 && !c.highfive) {
    p.crouch = 0.1; p.spineX = 0.72; p.pitch = 0.05; p.hLx = p.hRx = -0.7; p.kL = p.kR = 0.55; p.hLz = 0.1; p.hRz = -0.1;
    p.aLx = p.aRx = -0.7; p.aLz = 0.16; p.aRz = -0.16; p.eL = p.eR = -0.12; p.wL = p.wR = 0.2; p.headX = -0.6; p.headY = 0; p.cL = p.cR = 0.7; p.jaw = 0.12;
  } else if (A === ACT.NONE && !c.holding && c.sp < 0.8 && (c.ftWatch || c.idle) && !c.highfive) { // something to do between whistles
    const T = (c.gt || 0) + m.ph * 7, w = Math.floor(T / 6), tl = T - w * 6, id = c.uid || 0;
    if (tl < 2.2 && hash(w * 13.7 + id) < 0.42) {
      const g = Math.floor(hash(w * 7.3 + id * 1.1) * 5), q = Object.assign({}, p), e = Math.sin(PI * clamp(tl / 2.2, 0, 1));
      if (g === 0) { q.aLx = q.aRx = -0.35; q.eL = q.eR = -1.35; q.aLz = 0.42; q.aRz = -0.42; q.cL = q.cR = 1.2; q.crouch = 0.05 + 0.03 * Math.sin(tl * 12); } // hitch up the shorts
      else if (g === 1) { q.aLx = q.aRx = -0.15 + 0.15 * Math.sin(tl * 14); q.aLz = 0.3; q.aRz = -0.3; q.eL = q.eR = -0.5; q.spineX = 0.25; q.cL = q.cR = -0.05; } // wipe the hands
      else if (g === 2) { q.aLx = q.aRx = -2.6; q.aLz = 0.7; q.aRz = -0.7; q.eL = q.eR = -2.3; q.headX = -0.15; q.cL = q.cR = 0.2; } // hands on the head
      else if (g === 3) { if (m.look) { m.look.set(47, 34, 25); m.lookW = 0.95; } q.headX = -0.35; } // check the scoreboard
      else { const cl = 0.3 + 0.12 * Math.sin(tl * 15); q.aLx = q.aRx = -1.15; q.eL = q.eR = -1.25; q.aLz = cl; q.aRz = -cl; q.cL = q.cR = -0.1; q.jaw = 0.12; } // clap it up
      p = mix(p, q, e);
    }
  }
  if (c.land > 0 && A !== ACT.DOWN && A !== ACT.GETUP && A !== ACT.TACKLE) { const k = c.land; p.kL += 0.75 * k; p.kR += 0.75 * k; p.hLx -= 0.45 * k; p.hRx -= 0.45 * k; p.spineX += 0.22 * k; p.aLx -= 0.2 * k; p.aRx -= 0.2 * k; }
  if (c.lean && A !== ACT.DOWN && A !== ACT.GETUP) p.spineX += c.lean;
  // faces: yell when celebrating and dunking, grimace on the floor, blink
  if (A === ACT.CELEBRATE) p.jaw = 0.32 + 0.08 * Math.sin(t * 9); else if (A === ACT.DUNK && c.z > 0.3) p.jaw = 0.3; else if (A === ACT.DOWN || A === ACT.TACKLE || A === ACT.GETUP) p.jaw = 0.17; else if (c.sp > 14) p.jaw = 0.1;
  p.lid = c.blink ? 0.9 : A === ACT.DOWN ? 0.35 : -0.75;
  if (p.brow === 0) {
    if (A === ACT.CELEBRATE) p.brow = m.celeb % 2 ? -0.6 : 0.8;
    else if (A === ACT.DUNK && c.z > 0.3) p.brow = -0.8;
    else if (A === ACT.DOWN || A === ACT.GETUP || A === ACT.TACKLE) p.brow = -0.9;
    else if (A === ACT.STANCE || A === ACT.WALL || A === ACT.CONTEST || A === ACT.SWAT || (c.defending && c.sp < 3)) p.brow = -0.45;
    else if (c.tired > 0.5) p.brow = 0.35;
  }
  // hands: loose while running, cupped on the ball, flicked through on the release, spread to contest, fists to celebrate
  if (p.cL === 0.5 && p.cR === 0.5) {
    let cl = c.sp > 9 ? 0.78 : 0.5, cr = cl;
    if (c.holding) cl = cr = 0.26;
    switch (A) {
      case ACT.SHOOT: case ACT.LAYUP: if (t > 0.32) { cl = 0.18; cr = 0.04; } break;
      case ACT.FT: if (c.ballMode === 5) { cl = 0.18; cr = 0.04; } break;
      case ACT.CONTEST: case ACT.SWAT: case ACT.REBOUND: case ACT.WALL: case ACT.REACH: case ACT.CATCH: cl = cr = -0.12; break;
      case ACT.CELEBRATE: cl = cr = m.celeb % 2 ? 1.55 : -0.1; break;
      case ACT.TACKLE: cl = cr = 1.05; break;
      case ACT.DOWN: case ACT.GETUP: cl = cr = 0.75; break;
      case ACT.CALL: { const fist = t > 0.6 ? 1.55 : -0.12; if (c.dribble.hand > 0) cr = fist; else cl = fist; break; }
      case ACT.DUNK: if (c.z > 0.3) cl = cr = 0.32; break;
    }
    if (c.highfive) cr = -0.12;
    p.cL = cl; p.cR = cr;
  }
  p.fast = fast;
  return p;
}
// ---------- inverse kinematics: two-bone chains ----------
const IK = { m: new THREE.Matrix4(), S: new V3(), T: new V3(), P: new V3(), d: new V3(), E: new V3(), u: new V3(), f: new V3(), x: new V3(), y: new V3(), z: new V3(), q: new THREE.Quaternion() };
// Turn b1 and hinge b2 (about its own x) so the chain's end reaches world point T. lenB includes any rigid
// end piece (the hand). bend -1: elbow (forearm folds forward); +1: knee (shin folds back). pole: world
// direction the middle joint should point.
function ik2(b1, b2, lenA, lenB, T, pole, bend, wt) {
  if (wt <= 0.001) return;
  const { m, S, P, d, E, u, f, x, y, z, q } = IK;
  m.copy(b1.parent.matrixWorld).invert();
  S.copy(b1.position);
  const Tl = IK.T.copy(T).applyMatrix4(m);
  P.copy(pole).transformDirection(m);
  d.subVectors(Tl, S); let dist = d.length(); if (dist < 1e-4) return; d.divideScalar(dist);
  dist = Math.min(dist, (lenA + lenB) * 0.999);
  const along = (lenA * lenA - lenB * lenB + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, lenA * lenA - along * along));
  P.addScaledVector(d, -P.dot(d)); if (P.lengthSq() < 1e-8) P.set(0, 0, 1); P.normalize();
  E.copy(S).addScaledVector(d, along).addScaledVector(P, h);
  u.subVectors(E, S).normalize(); f.copy(S).addScaledVector(d, dist).sub(E).normalize();
  y.copy(u).negate(); z.copy(f).addScaledVector(u, -f.dot(u));
  if (z.lengthSq() < 1e-8) { z.set(0, 0, 1).addScaledVector(u, -u.z); } else { z.normalize(); if (bend > 0) z.negate(); }
  z.normalize(); x.crossVectors(y, z).normalize(); z.crossVectors(x, y);
  m.makeBasis(x, y, z); q.setFromRotationMatrix(m);
  if (wt >= 0.999) b1.quaternion.copy(q); else b1.quaternion.slerp(q, wt);
  const ang = Math.acos(clamp(u.dot(f), -1, 1)) * (bend < 0 ? -1 : 1);
  b2.rotation.set(lerp(b2.rotation.x, ang, wt), b2.rotation.y * (1 - wt), b2.rotation.z * (1 - wt));
}
const IKP = new V3();
function armIK(m, i, T, w) {
  const A = m.arms[i], yaw = m.root.rotation.y, s = i ? -1 : 1;
  IKP.set(Math.cos(yaw) * s * 0.7 - Math.sin(yaw) * 0.6, -1, -Math.sin(yaw) * s * 0.7 - Math.cos(yaw) * 0.6); // elbows down, out and back
  ik2(A.shoulder, A.elbow, 0.17 * m.H, 0.202 * m.H, T, IKP, -1, w);
  A.wrist.rotation.x *= 1 - w;
}
// planted feet stay planted: lock a foot where it lands and bend the leg to keep it there
const FL = { A: new V3(), f: new V3() };
function footLock(m, on, dt, reset) {
  if (reset) for (const k of m.lock) { k.on = false; k.w = 0; }
  const ry = m.root.matrixWorld.elements[13], yaw = m.root.rotation.y; FL.f.set(Math.sin(yaw), 0, Math.cos(yaw));
  let did = false;
  m.legs.forEach((L, i) => {
    const k = m.lock[i]; L.ankle.getWorldPosition(FL.A);
    const planted = on && FL.A.y - ry < m.ankleH + 0.03 * m.H;
    if (planted && !k.on) { k.on = true; k.p.copy(FL.A); }
    if (k.on && (!planted || Math.hypot(FL.A.x - k.p.x, FL.A.z - k.p.z) > 0.9)) k.on = false;
    k.w = clamp(k.w + (k.on ? 1 : -1) * dt * 14, 0, 1);
    if (k.w > 0.01) {
      const fl = L.ankle.rotation.x;
      ik2(L.hip, L.knee, 0.235 * m.H, 0.215 * m.H, FL.A.lerp(k.p, k.w), FL.f, 1, 1);
      L.ankle.rotation.x = lerp(fl, -(m.hips.rotation.x + L.hip.rotation.x + L.knee.rotation.x), k.w);
      did = true;
    }
  });
  if (did) m.root.updateMatrixWorld(true);
}
// dance team routine: four moves on a 120 bpm count, eight bars each
function dancePose(i, t) {
  const p = base(), beat = t * 2, ph = beat * PI, move = Math.floor(t / 3.8) % 4, bounce = Math.abs(Math.sin(ph));
  p.kL = p.kR = 0.25 + 0.4 * bounce; p.hLx = p.hRx = -0.2 - 0.25 * bounce; p.roll = Math.sin(ph) * 0.12; p.spineZ = -Math.sin(ph) * 0.16; p.headX = -0.08;
  if (move === 0) { p.aLx = p.aRx = -2.75 + 0.3 * bounce; p.aLz = 0.5; p.aRz = -0.5; p.eL = p.eR = -0.12; }
  else if (move === 1) { const l = Math.sin(ph) > 0; p.aLx = l ? -2.95 : -0.7; p.aRx = l ? -0.7 : -2.95; p.eL = l ? -0.1 : -1.7; p.eR = l ? -1.7 : -0.1; p.aLz = 0.3; p.aRz = -0.3; }
  else if (move === 2) { const sw = Math.sin(ph * 0.5); p.aLx = p.aRx = -1.6; p.aLz = 0.9 + sw * 0.6; p.aRz = -0.9 + sw * 0.6; p.eL = p.eR = -0.2; p.spineY = sw * 0.35; }
  else { p.aLx = p.aRx = 0.35; p.aLz = 0.62; p.aRz = -0.62; p.eL = p.eR = -1.75; const k = Math.max(0, Math.sin(ph)); if (Math.floor(beat) % 2) { p.hLx = -1.6 * k; p.kL = 0.15; } else { p.hRx = -1.6 * k; p.kR = 0.15; } }
  if (i % 2 && move !== 3) { p.spineY += 0.1; }
  p.jaw = 0.1; p.lid = (t * 1.3 + i) % 4.1 < 0.12 ? 0.9 : -0.75;
  p.fast = true;
  return p;
}
function applyPose(m, t, dt, grounded, place) {
  if (!m.P) { m.P = {}; m.V = {}; for (const k of KEYS) { m.P[k] = t[k]; m.V[k] = 0; } }
  const w = t.fast ? 30 : 16;
  if (dt > 0) for (const k of KEYS) { const r = spring(m.P[k], m.V[k], t[k], w, dt); m.P[k] = r[0]; m.V[k] = r[1]; }
  const p = m.P, [L, R] = m.arms, [LL, RL] = m.legs;
  L.shoulder.rotation.set(p.aLx, p.aLy, p.aLz); L.elbow.rotation.x = p.eL; L.wrist.rotation.x = p.wL;
  R.shoulder.rotation.set(p.aRx, p.aRy, p.aRz); R.elbow.rotation.x = p.eR; R.wrist.rotation.x = p.wR;
  LL.hip.rotation.set(p.hLx, 0, p.hLz); LL.knee.rotation.x = p.kL; LL.ankle.rotation.x = p.fL;
  RL.hip.rotation.set(p.hRx, 0, p.hRz); RL.knee.rotation.x = p.kR; RL.ankle.rotation.x = p.fR;
  m.hips.rotation.set(p.pitch, 0, p.roll);
  m.spine.rotation.set(p.spineX * 0.5, p.spineY * 0.5, p.spineZ * 0.5); m.chest.rotation.set(p.spineX * 0.5, p.spineY * 0.5, p.spineZ * 0.5);
  m.neck.rotation.set(p.headX * 0.4, p.headY * 0.4, 0); m.head.rotation.set(p.headX * 0.6, p.headY * 0.6, 0);
  m.P.lid = t.lid; if (m.jaw) { m.jaw.rotation.x = clamp(p.jaw, 0, 0.5); m.lids.rotation.x = t.lid; }
  if (m.brows) m.brows.forEach((b, k) => { const s = k ? -1 : 1, fu = Math.max(0, -p.brow), ra = Math.max(0, p.brow); b.position.y = m.browY + (ra * 0.0045 - fu * 0.002) * m.H; b.rotation.z = s * (fu * 0.32 - ra * 0.1); });
  if (m.fingers) m.fingers.forEach((F, k) => { const s = k ? -1 : 1, c = k ? p.cR : p.cL; F.kn.rotation.z = -s * c * 0.95; F.mid.rotation.z = -s * Math.max(0, c) * 1.1; F.th.rotation.set(Math.max(0, c) * 0.4, 0, -s * c * 0.5); });
  // breathing: slow and shallow at rest, deep and quick when winded
  const fat = m.fat || 0; m.brPh = ((m.brPh || 0) + dt * (1.6 + 2.8 * fat)) % TAU;
  const br = Math.sin(m.brPh); m.chest.rotation.x -= br * (0.012 + 0.035 * fat);
  if (m.shY) m.arms[0].shoulder.position.y = m.arms[1].shoulder.position.y = m.shY + br * (0.0015 + 0.005 * fat) * m.H;
  if (place) place();
  if (!grounded) { m.hips.position.y = m.legLen * (1 - p.crouch) - p.drop * (m.legLen - m.tR * 1.15) + (t.bounce || 0); m.root.updateMatrixWorld(true); gaze(m, dt); hairSway(m, dt); return; }
  // plant the lower foot on the floor: the hips sit wherever the legs put them
  m.hips.position.y = m.legLen; m.root.updateMatrixWorld(true);
  const ry = m.root.matrixWorld.elements[13], y0 = LL.ankle.matrixWorld.elements[13] - ry, y1 = RL.ankle.matrixWorld.elements[13] - ry, lo = Math.min(y0, y1);
  m.hips.position.y -= lo - m.ankleH;
  [LL, RL].forEach((Lg, i) => { const yi = i ? y1 : y0, k = 1 - clamp((yi - lo) / (0.05 * m.H), 0, 1); if (k > 0) Lg.ankle.rotation.x = lerp(Lg.ankle.rotation.x, -(p.pitch + Lg.hip.rotation.x + Lg.knee.rotation.x), k * 0.85); });
  m.root.updateMatrixWorld(true);
  gaze(m, dt); hairSway(m, dt);
}
const _hv = new V3(), _hv2 = new V3();
function hairSway(m, dt) {
  if (!m.sway) return;
  m.head.getWorldPosition(_hv);
  if (!m.hp || !(dt > 0) || dt > 0.2) { m.hp = _hv.clone(); m.hvl = new V3(); m.sw = m.sw || { x: 0, z: 0, vx: 0, vz: 0 }; return; }
  _hv2.copy(_hv).sub(m.hp).divideScalar(dt); m.hp.copy(_hv);
  const ax = clamp((_hv2.x - m.hvl.x) / dt, -90, 90), ay = clamp((_hv2.y - m.hvl.y) / dt, -90, 90), az = clamp((_hv2.z - m.hvl.z) / dt, -90, 90); m.hvl.copy(_hv2);
  const yaw = m.root.rotation.y, cs = Math.cos(yaw), sn = Math.sin(yaw), af = ax * sn + az * cs, as = ax * cs - az * sn, S = m.sw;
  S.vx += (-55 * S.x - 6 * S.vx + af * 0.011 + ay * 0.004) * dt; S.x = clamp(S.x + S.vx * dt, -0.6, 0.6);
  S.vz += (-55 * S.z - 6 * S.vz - as * 0.011) * dt; S.z = clamp(S.z + S.vz * dt, -0.6, 0.6);
  m.sway.rotation.set(S.x - (m.P.headX * 0.6 + (m.gp || 0) * 0.45) * 0.55, 0, S.z);
}
// look at a point in the world (m.look, weight m.lookW): the neck and head turn, the eyes get there first
const _gv = new V3(), _gd = new V3(), _gq = new THREE.Quaternion();
function gaze(m, dt) {
  let yw = 0, pt = 0;
  if (m.look && m.lookW > 0) {
    m.neck.getWorldPosition(_gv); m.chest.getWorldQuaternion(_gq).invert();
    _gd.copy(m.look).sub(_gv); _gd.y -= 0.05 * m.H; _gd.applyQuaternion(_gq);
    const yaw = Math.atan2(_gd.x, _gd.z), pitch = Math.atan2(-_gd.y, Math.hypot(_gd.x, _gd.z)), k = m.lookW * (1 - sstep((Math.abs(yaw) - 1.9) / 0.5));
    yw = clamp(yaw, -1.3, 1.3) * k; pt = clamp(pitch, -0.65, 0.6) * k;
  }
  const a = dt > 0 ? 1 - Math.exp(-dt * 6) : 1, e = dt > 0 ? 1 - Math.exp(-dt * 24) : 1;
  m.gy = lerp(m.gy || 0, yw, a); m.gp = lerp(m.gp || 0, pt, a);
  m.neck.rotation.y += m.gy * 0.4; m.neck.rotation.x += m.gp * 0.35; m.head.rotation.y += m.gy * 0.5; m.head.rotation.x += m.gp * 0.45;
  m.ey = lerp(m.ey || 0, clamp(yw - m.gy * 0.9, -0.42, 0.42), e); m.ep = lerp(m.ep || 0, clamp(pt - m.gp * 0.8, -0.3, 0.3), e);
  if (m.eyes) { for (const E of m.eyes) E.rotation.set(m.ep, m.ey, 0); m.lids.rotation.x += m.ep * 0.6; }
}

// ---------- audio ----------
function makeAudio() {
  let ctx = null, master = null, crowdGain = null, on = false, organBusy = 0, noiseBuf = null;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 900;
    crowdGain = ctx.createGain(); crowdGain.gain.value = 0.18;
    src.connect(lp); lp.connect(crowdGain); crowdGain.connect(master); src.start();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  // a stereo position for a sound: pan -1 (left of screen) .. 1 (right)
  function out(pan) { if (!ctx.createStereoPanner) return master; const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); p.connect(master); return p; }
  function burstAt(t, dur, type, freq, q, gain, pan, rate) {
    rate = rate || 1; const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq * rate; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur / rate);
    s.connect(f); f.connect(g); g.connect(out(pan)); s.start(t, Math.random()); s.stop(t + dur / rate + 0.05);
  }
  function thumpAt(t, f0, f1, dur, gain, pan, rate) {
    rate = rate || 1; const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0 * rate, t); o.frequency.exponentialRampToValueAtTime(f1 * rate, t + dur / rate);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur / rate); o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur / rate + 0.05);
  }
  // crowd "voice": noise through two formant filters, so a section of fans reads as a vowel
  function voiceAt(t, dur, f1, f2, gain, hiss) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const a = ctx.createBiquadFilter(), b = ctx.createBiquadFilter();
    a.type = b.type = "bandpass"; a.frequency.value = f1; b.frequency.value = f2; a.Q.value = 3.5; b.Q.value = 5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.05); g.gain.setValueAtTime(gain, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(a); s.connect(b); a.connect(g); b.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    if (hiss) burstAt(t + dur * 0.72, 0.2, "highpass", 4500, 0.7, gain * 0.45, 0);
  }
  const clapAt = (t, gn) => { for (let k = 0; k < 4; k++) burstAt(t + k * 0.011 + Math.random() * 0.01, 0.07, "bandpass", 1300 + k * 450, 0.9, gn, (Math.random() - 0.5) * 0.8); };
  function noiseBurst(dur, freq, q, gain) {
    if (!on) return; const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b; const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain; s.connect(f); f.connect(g); g.connect(master); s.start();
  }
  function tone(freqs, dur, type, gain, att) {
    if (!on) return; const t = ctx.currentTime, g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + (att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur); g.connect(master);
    for (const f of freqs) { const o = ctx.createOscillator(); o.type = type || "sine"; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
  }
  const RIFFS = [[0, 4, 7, 12, 7, 12], [7, 7, 9, 7, 12, 11], [0, 2, 4, 5, 7, -1, 7], [12, 11, 9, 7, 9, 12], [0, 0, 7, 7, 9, 9, 7], [5, 9, 12, 9, 5, 12], [0, 3, 5, 6, 5, 3, 0], [7, 12, 16, 12, 7, 12]];
  function organ(i) {
    if (!on || performance.now() < organBusy) return;
    const notes = RIFFS[Math.abs(i) % RIFFS.length], t0 = ctx.currentTime;
    notes.forEach((n, k) => {
      if (n < 0) return; const f = 261.63 * Math.pow(2, n / 12), t = t0 + k * 0.19;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.015); g.gain.setValueAtTime(0.09, t + 0.15); g.gain.linearRampToValueAtTime(0, t + 0.18); g.connect(master);
      for (const [h, w] of [[1, 1], [2, 0.6], [3, 0.4], [4, 0.25], [8, 0.12]]) { const o = ctx.createOscillator(); o.frequency.value = f * h; const og = ctx.createGain(); og.gain.value = w; o.connect(og); og.connect(g); o.start(t); o.stop(t + 0.2); }
    });
    organBusy = performance.now() + notes.length * 190 + 4000;
  }
  return {
    get on() { return on; },
    toggle() { init(); on = !on; if (ctx.state === "suspended") ctx.resume(); master.gain.value = on ? 0.8 : 0; return on; },
    excite(level) { if (on && crowdGain) { const t = ctx.currentTime; crowdGain.gain.cancelScheduledValues(t); crowdGain.gain.setValueAtTime(crowdGain.gain.value, t); crowdGain.gain.linearRampToValueAtTime(0.18 + level * 0.55, t + 0.15); crowdGain.gain.linearRampToValueAtTime(0.18, t + 2.5 + level * 1.5); } },
    whistle() { if (!on) return; const t = ctx.currentTime, g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.02); g.gain.setValueAtTime(0.12, t + 0.32); g.gain.linearRampToValueAtTime(0, t + 0.38); g.connect(master);
      for (const f of [2900, 3150]) { const o = ctx.createOscillator(); o.frequency.value = f; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 38; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency); o.connect(g); o.start(t); lfo.start(t); o.stop(t + 0.4); lfo.stop(t + 0.4); } },
    buzzer() { tone([196, 247], 1.0, "square", 0.08, 0.01); },
    swish() { noiseBurst(0.25, 3200, 0.8, 0.5); },
    clank() { tone([620, 935, 1410], 0.35, "triangle", 0.07); },
    whoosh() { noiseBurst(0.45, 900, 0.6, 0.35); },
    sfx: {
      dribble(v, pan, r) { if (!on) return; const t = ctx.currentTime; thumpAt(t, 160, 70, 0.14, 0.34 * v, pan, r); burstAt(t, 0.05, "lowpass", 900, 0.7, 0.2 * v, pan, r); },
      bounce(v, pan, r) { if (!on) return; const t = ctx.currentTime; thumpAt(t, 140, 60, 0.22, 0.4 * v, pan, r); burstAt(t, 0.07, "lowpass", 800, 0.7, 0.22 * v, pan, r); },
      land(v, pan, r) { if (!on) return; const t = ctx.currentTime; thumpAt(t, 95, 42, 0.24, 0.42 * v, pan, r); burstAt(t, 0.11, "lowpass", 520, 0.7, 0.24 * v, pan, r); },
      squeak(v, pan, r) {
        if (!on) return; r = r || 1; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = (2300 + Math.random() * 900) * r;
        o.type = "triangle"; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.25, t + 0.05 / r); o.frequency.linearRampToValueAtTime(f * 0.9, t + 0.12 / r);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 * v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.14 / r); o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + 0.17 / r);
      }
    },
    chant(kind) {
      if (!on) return; const t0 = ctx.currentTime + 0.05;
      if (kind === "defense") for (let k = 0; k < 4; k++) { const t = t0 + k * 1.5; voiceAt(t, 0.26, 420, 2000, 0.55); voiceAt(t + 0.42, 0.5, 560, 1750, 0.6, true); thumpAt(t + 1.0, 70, 40, 0.15, 0.5, 0); thumpAt(t + 1.2, 70, 40, 0.15, 0.5, 0); }
      else if (kind === "letsgo") for (let k = 0; k < 3; k++) { const t = t0 + k * 1.6; [0, 0.25, 0.75, 1.0, 1.25].forEach(d => clapAt(t + d, 0.3)); }
      else if (kind === "ooh") voiceAt(t0, 1.1, 380, 900, 0.7);
    },
    organ
  };
}


// ---------- image-based lighting: a tiny arena with ceiling light banks, prefiltered ----------
function envMap(renderer) {
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(260, 120, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.01, 0.012, 0.018), side: THREE.BackSide }));
  room.position.y = 30; s.add(room);
  const panel = (x, y, z, w, d, c, rx) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.x = rx; s.add(m); };
  for (const z of [-24, 0, 24]) for (const x of [-34, 0, 34]) panel(x, 82, z, 20, 5, new THREE.Color(12, 11.5, 10.5), PI / 2);
  panel(0, 12, -98, 250, 26, new THREE.Color(0.09, 0.07, 0.06), 0); panel(0, 12, 98, 250, 26, new THREE.Color(0.09, 0.07, 0.06), 0);
  panel(0, 30, -98, 250, 4, new THREE.Color(1.6, 1.3, 0.6), 0); panel(0, 30, 98, 250, 4, new THREE.Color(1.6, 1.3, 0.6), 0);
  const pm = new THREE.PMREMGenerator(renderer), tex = pm.fromScene(s, 0.02).texture; pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return tex;
}

// ---------- post: HDR scene -> bloom -> filmic tone map, grade, vignette, grain ----------
function makePost(renderer) {
  const ext = renderer.extensions;
  if (!renderer.capabilities.isWebGL2 || !(ext.has("EXT_color_buffer_float") || ext.has("EXT_color_buffer_half_float"))) return null;
  const VS = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
  const mk = (depth, samples, type) => { const t = new THREE.WebGLRenderTarget(4, 4, { type: type || THREE.HalfFloatType, depthBuffer: !!depth, stencilBuffer: false, samples: samples || 0 }); t.texture.generateMipmaps = false; t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; return t; };
  let samples = 4, sceneRT = mk(true, samples);
  const down = [0, 1, 2, 3, 4].map(() => mk()), up = [0, 1, 2, 3].map(() => mk()), blur = [mk(), mk()], streak = [mk(), mk()], ao = [mk(false, 0, THREE.UnsignedByteType), mk(false, 0, THREE.UnsignedByteType)];
  const depthRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, stencilBuffer: false }); depthRT.texture.generateMipmaps = false;
  depthRT.depthTexture = new THREE.DepthTexture(4, 4); depthRT.depthTexture.type = THREE.UnsignedIntType;
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad); const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const sm = (fs, u) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
  const dirt = canvasTex(512, 288, (g, W, H) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, W, H); let sd = 5; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.12 + rnd() * 0.35})`); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    for (let i = 0; i < 6; i++) { g.strokeStyle = `rgba(255,255,255,${0.06 + rnd() * 0.1})`; g.lineWidth = 2 + rnd() * 3; g.beginPath(); g.arc(rnd() * W, rnd() * H, 20 + rnd() * 40, 0, TAU); g.stroke(); }
  }, 1, true);
  let ks = 9; const krnd = () => (ks = (ks * 16807) % 2147483647) / 2147483647, K = [];
  for (let i = 0; i < 12; i++) { let v; do { v = new V3(krnd() * 2 - 1, krnd() * 2 - 1, krnd()); } while (v.lengthSq() > 1 || v.lengthSq() < 0.02); const sc = (i + 1) / 12; K.push(v.normalize().multiplyScalar(lerp(0.12, 1, sc * sc))); }
  const downM = sm(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uPre, uTh; varying vec2 vUv;
    void main(){ vec2 o = uTexel; vec3 c = texture2D(tSrc, vUv).rgb * 4.0 + texture2D(tSrc, vUv - o).rgb + texture2D(tSrc, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSrc, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSrc, vUv + o).rgb; c /= 8.0;
      if (uPre > 0.5) { c = min(c, vec3(30.0)); float br = max(c.r, max(c.g, c.b)), k = 0.5, s = clamp(br - uTh + k, 0.0, 2.0 * k); s = s * s / (4.0 * k + 1e-4); c *= max(s, br - uTh) / max(br, 1e-4); }
      gl_FragColor = vec4(c, 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPre: { value: 0 }, uTh: { value: 1 } });
  const upM = sm(`uniform sampler2D tLow, tSame; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec2 o = uTexel; vec3 c = texture2D(tLow, vUv + vec2(-2.0 * o.x, 0.0)).rgb + texture2D(tLow, vUv + vec2(2.0 * o.x, 0.0)).rgb + texture2D(tLow, vUv + vec2(0.0, -2.0 * o.y)).rgb + texture2D(tLow, vUv + vec2(0.0, 2.0 * o.y)).rgb
      + 2.0 * (texture2D(tLow, vUv + vec2(-o.x, o.y)).rgb + texture2D(tLow, vUv + o).rgb + texture2D(tLow, vUv - o).rgb + texture2D(tLow, vUv + vec2(o.x, -o.y)).rgb);
      gl_FragColor = vec4(c / 12.0 + texture2D(tSame, vUv).rgb, 1.0); }`, { tLow: { value: null }, tSame: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const streakM = sm(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uStep; varying vec2 vUv;
    void main(){ vec3 c = vec3(0.0); float ws = 0.0; for (int i = -4; i <= 4; i++) { float w = exp(-float(i * i) / 8.0); c += texture2D(tSrc, vUv + vec2(float(i) * uStep * uTexel.x, 0.0)).rgb * w; ws += w; } gl_FragColor = vec4(c / ws, 1.0); }`,
    { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 } });
  const aoM = sm(`uniform sampler2D tDepth; uniform mat4 uProj, uProjInv; uniform vec2 uTexel; uniform float uRadius; uniform vec3 uK[12]; varying vec2 vUv;
    vec3 vpos(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float d0 = texture2D(tDepth, vUv).x; if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 p = vpos(vUv);
      vec3 a1 = vpos(vUv + vec2(uTexel.x, 0.0)) - p, a2 = p - vpos(vUv - vec2(uTexel.x, 0.0)), b1 = vpos(vUv + vec2(0.0, uTexel.y)) - p, b2 = p - vpos(vUv - vec2(0.0, uTexel.y));
      vec3 n = normalize(cross(abs(a1.z) < abs(a2.z) ? a1 : a2, abs(b1.z) < abs(b2.z) ? b1 : b2));
      float an = rnd(vUv * 731.0) * 6.2832; vec3 rv = vec3(cos(an), sin(an), 0.0);
      vec3 t = normalize(rv - n * dot(rv, n)), b = cross(n, t); mat3 tbn = mat3(t, b, n);
      float occ = 0.0;
      for (int i = 0; i < 12; i++) {
        vec3 s = p + tbn * uK[i] * uRadius; vec4 o = uProj * vec4(s, 1.0); vec2 suv = o.xy / o.w * 0.5 + 0.5;
        float sz = vpos(suv).z;
        occ += step(s.z + 0.04, sz) * smoothstep(0.0, 1.0, uRadius / max(abs(p.z - sz), 1e-3));
      }
      gl_FragColor = vec4(vec3(1.0 - occ / 12.0), 1.0); }`, { tDepth: { value: depthRT.depthTexture }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.5 }, uK: { value: K } });
  const aoBlurM = sm(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ float a = 0.0; for (int x = -2; x <= 2; x++) for (int y = -2; y <= 2; y++) a += texture2D(tSrc, vUv + vec2(float(x), float(y)) * uTexel).r; gl_FragColor = vec4(vec3(a / 25.0), 1.0); }`, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const U = { tScene: { value: null }, tBloom: { value: null }, tBlur: { value: null }, tAO: { value: null }, tDepth: { value: depthRT.depthTexture }, tStreak: { value: null }, tDirt: { value: dirt },
    uBloom: { value: 0.16 }, uExp: { value: 1 }, uVig: { value: 0.32 }, uGrain: { value: 0.022 }, uTime: { value: 0 }, uReplay: { value: 0 }, uBlur: { value: 0 }, uSat: { value: 1.06 }, uRes: { value: new THREE.Vector2(1, 1) },
    uAO: { value: 0 }, uDof: { value: 0 }, uFocus: { value: 30 }, uStreak: { value: 0 }, uDirt: { value: 0 }, uProjInv: { value: new THREE.Matrix4() }, uEra: { value: 0 }, uPrevVP: { value: new THREE.Matrix4() }, uInvVP: { value: new THREE.Matrix4() }, uMB: { value: 0 }, uSharp: { value: 0 } };
  const compM = sm(`uniform sampler2D tScene, tBloom, tBlur, tAO, tDepth, tStreak, tDirt; uniform float uBloom, uExp, uVig, uGrain, uTime, uReplay, uBlur, uSat, uAO, uDof, uFocus, uStreak, uDirt, uEra, uMB, uSharp; uniform vec2 uRes; uniform mat4 uProjInv, uPrevVP, uInvVP; varying vec2 vUv;
    vec3 aces(vec3 c) { c *= uExp / 0.6;
      const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = I * c; vec3 a = c * (c + 0.0245786) - 0.000090537; vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081; return clamp(O * (a / b), 0.0, 1.0); }
    vec3 srgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
    float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float zview(vec2 uv) { float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return -p.z / p.w; }
    void main() {
      vec2 uv = vUv;
      if (uEra > 0.5) { // older broadcasts were 4:3
        float ar = uRes.x / uRes.y; if (ar > 1.4) { float hw = 1.3333 / ar * 0.5; if (abs(uv.x - 0.5) > hw) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } }
        if (uEra > 1.5) uv += vec2(sin(uTime * 13.0), cos(uTime * 11.0)) * 0.0006 * (uEra - 1.0); // film gate weave
      }
      vec2 d = uv - 0.5; float r = length(d * vec2(uRes.x / uRes.y, 1.0));
      vec3 c;
      if (uReplay > 0.01) { vec2 ca = d * 0.007 * uReplay * r; c = vec3(texture2D(tScene, uv + ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - ca).b); }
      else if (uEra > 0.5 && uEra < 1.5) c = vec3(texture2D(tScene, uv + vec2(0.0018, 0.0)).r, texture2D(tScene, uv).g, texture2D(tScene, uv - vec2(0.0012, 0.0)).b); // video chroma bleed
      else c = texture2D(tScene, uv).rgb;
      if (uSharp > 0.0) { vec2 tx = 1.0 / uRes; vec3 nb = texture2D(tScene, uv + vec2(tx.x, 0.0)).rgb + texture2D(tScene, uv - vec2(tx.x, 0.0)).rgb + texture2D(tScene, uv + vec2(0.0, tx.y)).rgb + texture2D(tScene, uv - vec2(0.0, tx.y)).rgb; c = max(c + (c - nb * 0.25) * uSharp, 0.0); }
      if (uMB > 0.0) { // camera motion blur: where was this pixel last frame?
        float dd = texture2D(tDepth, uv).x; vec4 wp = uInvVP * vec4(vec3(uv, dd) * 2.0 - 1.0, 1.0); wp /= wp.w; vec4 pp = uPrevVP * wp;
        vec2 vel = (uv - (pp.xy / pp.w * 0.5 + 0.5)) * uMB; float vl = length(vel);
        if (vl > 0.0015) { vel *= min(vl, 0.012) / vl; float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); vec3 acc = c; for (int i = 0; i < 8; i++) acc += texture2D(tScene, uv - vel * ((float(i) + jit) / 8.0)).rgb; c = acc / 9.0; }
      }
      if (uAO > 0.0) c *= mix(1.0, texture2D(tAO, uv).r, uAO);
      if (uDof > 0.0) { float z = zview(uv); float coc = clamp(abs(z - uFocus) / (uFocus * 0.25 + 1.5), 0.0, 1.0); c = mix(c, texture2D(tBlur, uv).rgb, coc * uDof); }
      else if (uBlur > 0.01) c = mix(c, texture2D(tBlur, uv).rgb, uBlur * smoothstep(0.3, 0.78, r));
      if (uEra > 0.5) c = mix(c, texture2D(tBlur, uv).rgb, uEra > 2.5 ? 0.38 : uEra > 1.5 ? 0.24 : 0.16); // older lenses and tubes were soft
      c += texture2D(tBloom, uv).rgb * uBloom * (1.0 + texture2D(tDirt, uv).r * uDirt) * (uEra > 0.5 ? 1.6 : 1.0);
      c += texture2D(tStreak, uv).rgb * uStreak * vec3(0.55, 0.75, 1.0);
      c = aces(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat - 0.25 * uReplay);
      c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.9), uReplay);
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.2);
      float vig = uVig + (uEra > 2.5 ? 0.35 : uEra > 1.5 ? 0.18 : 0.0);
      c *= 1.0 - vig * smoothstep(0.4, 1.05, r);
      if (uEra > 2.5) { // 1950s kinescope: black and white, flicker, dust and scratches
        float g = dot(c, vec3(0.3, 0.59, 0.11)); g = clamp((g - 0.04) * 1.18, 0.0, 1.0) * (0.95 + 0.05 * sin(uTime * 53.0) * sin(uTime * 7.0));
        c = vec3(g) * vec3(1.02, 1.0, 0.93);
        float fr = floor(uTime * 14.0), sx = fract(sin(fr * 12.9898) * 437.585);
        if (fract(fr * 0.37) < 0.5 && abs(uv.x - sx) < 0.0009) c *= 0.55;
        if (rnd(floor(uv * vec2(260.0, 150.0)) + fr) > 0.9986) c *= 0.2;
        if (rnd(floor(uv * vec2(300.0, 170.0)) + fr * 1.7) > 0.9992) c = mix(c, vec3(1.0), 0.6);
      } else if (uEra > 1.5) { // 1970s film: warm, faded blacks, a little less saturation
        float g = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(g), c, 0.82);
        c = c * vec3(1.07, 0.99, 0.84) * 0.9 + vec3(0.055, 0.045, 0.035);
      } else if (uEra > 0.5) { // 1990s standard-definition video: scanlines, punchy color
        float g = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(g), c, 1.1);
        c *= 0.93 + 0.07 * sin(vUv.y * uRes.y * 1.5708);
      }
      c = srgb(c);
      c += (rnd(uv * uRes + fract(uTime) * 61.0) - 0.5) * (uGrain + (uEra > 2.5 ? 0.07 : uEra > 1.5 ? 0.035 : uEra > 0.5 ? 0.015 : 0.0));
      gl_FragColor = vec4(c, 1.0); }`, U);
  function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(qs, qc); }
  let W = 0, H = 0;
  function setSize(w, h, s) {
    if (s !== samples) { sceneRT.dispose(); samples = s; sceneRT = mk(true, samples); W = 0; }
    if (w === W && h === H) return; W = w; H = h;
    sceneRT.setSize(w, h);
    let dw = w, dh = h; for (let i = 0; i < 5; i++) { dw = Math.max(1, dw >> 1); dh = Math.max(1, dh >> 1); down[i].setSize(dw, dh); if (i < 4) up[i].setSize(dw, dh); }
    blur[0].setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); blur[1].setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    for (const t of streak) t.setSize(Math.max(1, w >> 2), Math.max(1, h >> 3));
    depthRT.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); for (const t of ao) t.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    U.uRes.value.set(w, h);
  }
  function render(scene, camera, fx) {
    const useDepth = fx.ao > 0 || fx.dof > 0 || fx.mb > 0;
    if (useDepth) { // depth prepass at half resolution, effects hidden
      const vis = fx.hide.map(o => o.visible); for (const o of fx.hide) o.visible = false;
      const bg = scene.background; scene.background = null; scene.overrideMaterial = depthMat;
      renderer.setRenderTarget(depthRT); renderer.render(scene, camera);
      scene.overrideMaterial = null; scene.background = bg; fx.hide.forEach((o, i) => { o.visible = vis[i]; });
      U.uProjInv.value.copy(camera.projectionMatrixInverse);
      if (fx.ao > 0) {
        aoM.uniforms.uProj.value.copy(camera.projectionMatrix); aoM.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse); aoM.uniforms.uTexel.value.set(1 / depthRT.width, 1 / depthRT.height);
        pass(aoM, ao[0]); aoBlurM.uniforms.tSrc.value = ao[0].texture; aoBlurM.uniforms.uTexel.value.set(1 / ao[0].width, 1 / ao[0].height); pass(aoBlurM, ao[1]);
      }
    }
    renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
    let src = sceneRT.texture, sw = W, sh = H;
    for (let i = 0; i < 5; i++) { downM.uniforms.tSrc.value = src; downM.uniforms.uTexel.value.set(1 / sw, 1 / sh); downM.uniforms.uPre.value = i === 0 ? 1 : 0; downM.uniforms.uTh.value = fx.threshold; pass(downM, down[i]); src = down[i].texture; sw = down[i].width; sh = down[i].height; }
    let low = down[4];
    for (let i = 3; i >= 0; i--) { upM.uniforms.tLow.value = low.texture; upM.uniforms.tSame.value = down[i].texture; upM.uniforms.uTexel.value.set(1 / low.width, 1 / low.height); pass(upM, up[i]); low = up[i]; }
    if (fx.streak > 0) { // anamorphic streaks from the brightest lights
      let ss = down[1].texture; const steps = [1, 4, 14];
      steps.forEach((st, i) => { streakM.uniforms.tSrc.value = ss; streakM.uniforms.uTexel.value.set(1 / streak[0].width, 1 / streak[0].height); streakM.uniforms.uStep.value = st; pass(streakM, streak[i % 2]); ss = streak[i % 2].texture; });
      U.tStreak.value = ss;
    } else U.tStreak.value = down[4].texture;
    if (fx.blur > 0.01 || fx.dof > 0 || fx.era > 0) { src = sceneRT.texture; sw = W; sh = H; for (let i = 0; i < 2; i++) { downM.uniforms.tSrc.value = src; downM.uniforms.uTexel.value.set(1.5 / sw, 1.5 / sh); downM.uniforms.uPre.value = 0; pass(downM, blur[i]); src = blur[i].texture; sw = blur[i].width; sh = blur[i].height; } }
    U.tScene.value = sceneRT.texture; U.tBloom.value = up[0].texture; U.tBlur.value = blur[1].texture; U.tAO.value = ao[1].texture;
    U.uBloom.value = fx.bloom; U.uExp.value = fx.exposure; U.uVig.value = fx.vignette; U.uGrain.value = fx.grain; U.uTime.value = fx.time; U.uReplay.value = fx.replay; U.uBlur.value = fx.blur; U.uSat.value = fx.sat;
    U.uAO.value = fx.ao; U.uDof.value = useDepth ? fx.dof : 0; U.uFocus.value = fx.focus || 30; U.uStreak.value = fx.streak; U.uDirt.value = fx.dirt; U.uEra.value = fx.era || 0; U.uMB.value = useDepth ? fx.mb || 0 : 0; U.uSharp.value = fx.sharp || 0; if (fx.prevVP) { U.uPrevVP.value.copy(fx.prevVP); U.uInvVP.value.copy(fx.invVP); }
    pass(compM, null);
  }
  return { setSize, render };
}

// ---------- the broadcast ----------
function create(canvas, opts) {
  opts = opts || {};
  const mobile = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  let quality = opts.quality || (mobile ? "medium" : "high");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020306); scene.fog = new THREE.Fog(0x020306, 210, 400);
  try { scene.environment = envMap(renderer); } catch (e) { console.warn("env map", e); }
  const post = (() => { try { return makePost(renderer); } catch (e) { console.warn("post", e); return null; } })();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 900);
  const BASE = { hemi: 0.32, key: 1.75, fill: 0.32, rim: 0.35 };
  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2a2018, BASE.hemi); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff2e2, BASE.key); key.position.set(58, 150, 62); key.target.position.set(47, 0, 25); scene.add(key); scene.add(key.target);
  Object.assign(key.shadow.camera, { left: -70, right: 70, top: 50, bottom: -50, near: 50, far: 320 });
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.025;
  const fill = new THREE.DirectionalLight(0xbcd0ff, BASE.fill); fill.position.set(20, 70, -80); scene.add(fill);
  const rimL = new THREE.DirectionalLight(0xffffff, BASE.rim); rimL.position.set(-60, 50, 25); scene.add(rimL);
  const glow = (c, k) => new THREE.Color(c).multiplyScalar(k); // HDR colors that bloom

  // ---------- court with a glossy finish (planar reflections on high quality) ----------
  const reflRT = new THREE.WebGLRenderTarget(4, 4, { type: post ? THREE.HalfFloatType : THREE.UnsignedByteType }); reflRT.texture.generateMipmaps = false;
  const mirror = new THREE.PerspectiveCamera(); const RU = { tRefl: { value: reflRT.texture }, reflMat: { value: new THREE.Matrix4() }, uRefl: { value: 0 } };
  const courtMat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, envMapIntensity: 0.9 });
  courtMat.onBeforeCompile = sh => {
    sh.uniforms.tRefl = RU.tRefl; sh.uniforms.reflMat = RU.reflMat; sh.uniforms.uRefl = RU.uRefl;
    sh.vertexShader = "uniform mat4 reflMat; varying vec4 vRefl;\n" + sh.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n vRefl = reflMat * modelMatrix * vec4(transformed, 1.0);");
    sh.fragmentShader = "uniform sampler2D tRefl; uniform float uRefl; varying vec4 vRefl;\n" + sh.fragmentShader.replace("#include <output_fragment>", `
      if (uRefl > 0.0) {
        vec2 ruv = vRefl.xy / vRefl.w + normal.xz * 0.01;
        vec2 px = vec2(0.0012, 0.0022) * (1.0 + roughnessFactor * 4.0);
        vec3 rc = texture2D(tRefl, ruv).rgb * 0.36 + (texture2D(tRefl, ruv + vec2(px.x, 0.0)).rgb + texture2D(tRefl, ruv - vec2(px.x, 0.0)).rgb + texture2D(tRefl, ruv + vec2(0.0, px.y)).rgb + texture2D(tRefl, ruv - vec2(0.0, px.y)).rgb) * 0.16;
        float fres = 0.1 + 0.9 * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        outgoingLight += rc * uRefl * fres * (1.0 - roughnessFactor);
      }
      #include <output_fragment>`);
  };
  const court = new THREE.Mesh(new THREE.PlaneGeometry(112, 68), courtMat); court.rotation.x = -PI / 2; court.position.set(47, 0, 25); court.receiveShadow = true; scene.add(court);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(440, 340), new THREE.MeshStandardMaterial({ color: "#0b0d12", roughness: 0.85, envMapIntensity: 0.3 })); floor.rotation.x = -PI / 2; floor.position.set(47, -0.05, 25); scene.add(floor);
  const smat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.7, metalness: 0.05, envMapIntensity: 0.5 }, o || {}));

  // ---------- hoops with cloth nets ----------
  function makeNet(hx) {
    const N = 16, R = 6, len = 1.6, n = (R + 1) * N, P = new Float32Array(n * 3), O = new Float32Array(n * 3), REST = new Float32Array(n * 3);
    for (let k = 0; k <= R; k++) for (let j = 0; j < N; j++) { const a = (j + 0.5 * k) / N * TAU, rr = lerp(0.75, 0.42, Math.pow(k / R, 0.75)), i = (k * N + j) * 3; REST[i] = hx + Math.cos(a) * rr; REST[i + 1] = 10 - len * k / R; REST[i + 2] = 25 + Math.sin(a) * rr; }
    P.set(REST); O.set(REST);
    const id = (k, j) => k * N + ((j % N) + N) % N, links = [];
    const d0 = (a, b) => Math.hypot(REST[a * 3] - REST[b * 3], REST[a * 3 + 1] - REST[b * 3 + 1], REST[a * 3 + 2] - REST[b * 3 + 2]);
    for (let k = 0; k < R; k++) for (let j = 0; j < N; j++) { const a = id(k, j); for (const b of [id(k + 1, j), id(k + 1, j - 1)]) links.push([a, b, d0(a, b), 1]); }
    for (let k = 1; k <= R; k++) for (let j = 0; j < N; j++) { const a = id(k, j), b = id(k, j + 1); links.push([a, b, d0(a, b) * 1.02, 0]); }
    const drawn = links.filter(l => l[3]), LP = new Float32Array(drawn.length * 6), geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(LP, 3));
    const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: glow("#ffffff", 1.4), transparent: true, opacity: 0.85 })); mesh.frustumCulled = false; scene.add(mesh);
    function step(dt, bx, by, bz) {
      const g = -22 * dt * dt;
      for (let i = N; i < n; i++) { const o = i * 3; for (let c = 0; c < 3; c++) { const v = (P[o + c] - O[o + c]) * 0.9; O[o + c] = P[o + c]; P[o + c] += v + (c === 1 ? g : 0) + (REST[o + c] - P[o + c]) * 0.02; } }
      const near = Math.abs(bx - hx) < 2.5 && Math.abs(bz - 25) < 2.5 && by < 10.6 && by > 7;
      for (let it = 0; it < 4; it++) {
        for (const [a, b, L] of links) {
          const ia = a * 3, ib = b * 3, dx = P[ib] - P[ia], dy = P[ib + 1] - P[ia + 1], dz = P[ib + 2] - P[ia + 2], d = Math.hypot(dx, dy, dz) || 1e-6, df = (d - L) / d, fa = a < N ? 0 : 0.5, fb = a < N ? 1 : 0.5;
          P[ia] += dx * df * fa; P[ia + 1] += dy * df * fa; P[ia + 2] += dz * df * fa; P[ib] -= dx * df * fb; P[ib + 1] -= dy * df * fb; P[ib + 2] -= dz * df * fb;
        }
        if (near) for (let i = N; i < n; i++) { const o = i * 3, dx = P[o] - bx, dy = P[o + 1] - by, dz = P[o + 2] - bz, d = Math.hypot(dx, dy, dz); if (d < 0.43 && d > 1e-5) { const s = 0.43 / d; P[o] = bx + dx * s; P[o + 1] = by + dy * s; P[o + 2] = bz + dz * s; } }
        for (let j = 0; j < N; j++) { const o = j * 3; P[o] = REST[o]; P[o + 1] = REST[o + 1]; P[o + 2] = REST[o + 2]; }
      }
    }
    function draw() { let o = 0; for (const [a, b] of drawn) { LP[o++] = P[a * 3]; LP[o++] = P[a * 3 + 1]; LP[o++] = P[a * 3 + 2]; LP[o++] = P[b * 3]; LP[o++] = P[b * 3 + 1]; LP[o++] = P[b * 3 + 2]; } geo.attributes.position.needsUpdate = true; }
    draw();
    return { step, draw, reset() { P.set(REST); O.set(REST); draw(); }, mesh };
  }
  const hoops = [];
  const padMat = smat("#c81d33", { roughness: 0.55 }), metalM = smat("#22262e", { metalness: 0.55, roughness: 0.35, envMapIntensity: 0.9 });
  const scCanvas = document.createElement("canvas"); scCanvas.width = 256; scCanvas.height = 96;
  const scTex = new THREE.CanvasTexture(scCanvas); scTex.encoding = THREE.sRGBEncoding;
  const scMat = new THREE.MeshBasicMaterial({ map: scTex, color: glow("#ffffff", 1.8) }); let scKey = "";
  function drawShotClock(shot, clock, live) {
    const k = (live ? Math.ceil(shot) : "-") + "|" + Math.ceil(clock); if (k === scKey) return; scKey = k;
    const g = scCanvas.getContext("2d"); g.fillStyle = "#050505"; g.fillRect(0, 0, 256, 96);
    txt(g, live ? String(Math.max(0, Math.ceil(shot))) : "", 76, 50, 74, live && shot <= 5 ? "#ff3b30" : "#ff8a1f", null, "Courier New, monospace");
    const cl = Math.max(0, clock); txt(g, cl < 60 ? cl.toFixed(1) : Math.floor(cl / 60) + ":" + String(Math.floor(cl % 60)).padStart(2, "0"), 186, 50, 40, "#ffd166", null, "Courier New, monospace");
    scTex.needsUpdate = true;
  }
  for (const side of [0, 1]) {
    const hx = side ? 88.75 : 5.25, dir = side ? -1 : 1, bx = side ? 90 : 4;
    const g = new THREE.Group(); scene.add(g);
    const shake = new THREE.Group(); shake.position.set(bx, 11, 25); g.add(shake);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.5, 6), new THREE.MeshStandardMaterial({ color: 0xdfefff, transparent: true, opacity: 0.18, roughness: 0.02, metalness: 0.2, envMapIntensity: 1.5 })); glass.position.set(0, -0.4, 0); shake.add(glass);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.16, 3.5, 6)), new THREE.LineBasicMaterial({ color: glow("#ffffff", 1.2) })); edges.position.copy(glass.position); shake.add(edges);
    const sq = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.17, 1.5, 2)), new THREE.LineBasicMaterial({ color: glow("#ffffff", 1.2) })); sq.position.set(0, -0.75, 0); shake.add(sq);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 6.1), new THREE.MeshBasicMaterial({ color: glow("#ff3030", 0.2) })); strip.position.set(0, 1.4, 0); shake.add(strip); // shot-clock style edge light
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 6.45), padMat); pad.position.set(0, -2.3, 0); shake.add(pad);
    const rimG = new THREE.Group(); rimG.position.set(hx - bx, -1, 0); shake.add(rimG);
    const rimM = smat("#ff5a0a", { metalness: 0.6, roughness: 0.3, envMapIntensity: 1.2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.055, 10, 36), rimM); ring.rotation.x = PI / 2; ring.castShadow = true; rimG.add(ring);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.5), rimM); brace.position.set(-dir * 0.85, 0, 0); rimG.add(brace);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, hk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.05), rimM); hk.position.set(Math.cos(a) * 0.75, -0.06, Math.sin(a) * 0.75); rimG.add(hk); }
    const baseShape = new THREE.Shape(); // side profile of the padded base, front sloping toward the court
    baseShape.moveTo(-2.6, 0); baseShape.lineTo(2.6, 0); baseShape.lineTo(2.2, 1.0); baseShape.quadraticCurveTo(1.7, 3.0, 0.8, 3.3); baseShape.lineTo(-2.6, 3.3); baseShape.lineTo(-2.6, 0);
    const baseG = new THREE.ExtrudeGeometry(baseShape, { depth: 4.2, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 8 }); baseG.translate(0, 0, -2.1);
    const base_ = new THREE.Mesh(baseG, padMat); base_.position.set(bx - dir * 8.4, 0, 25); base_.rotation.y = side ? PI : 0; base_.castShadow = true; g.add(base_);
    const ax = bx - dir * 8.4, curve = new THREE.CatmullRomCurve3([new V3(ax, 3.4, 25), new V3(ax + dir * 0.25, 7.5, 25), new V3(ax + dir * 1.6, 11.5, 25), new V3(bx - dir * 3.0, 13.0, 25), new V3(bx - dir * 0.3, 12.35, 25)]);
    const armM = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.34, 12, false), metalM); armM.castShadow = true; g.add(armM);
    const armPad = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 4.0, 18), padMat); armPad.position.set(ax + dir * 0.08, 5.5, 25); g.add(armPad);
    for (const zz of [-1, 1]) { const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8), metalM); strut.position.set(bx - dir * 0.9, 11.7, 25 + zz * 1.6); strut.rotation.z = dir * 0.9; g.add(strut); }
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.42, 0.75), rimM); housing.position.set(dir * 0.3, -1.05, 0); shake.add(housing);
    for (const zz of [-1, 1]) { const sidePad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.5, 0.3), padMat); sidePad.position.set(0, -0.4, zz * 3.08); shake.add(sidePad); }
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.15, 3.0), [scMat, scMat, smat("#111"), smat("#111"), smat("#111"), smat("#111")]); sc.position.set(0, 2.05, 0); shake.add(sc);
    hoops.push({ shake, rimG, hx, net: makeNet(hx), strip });
  }

  // ---------- stands: tiers, seats, a GPU-animated crowd, signs ----------
  const seats = [];
  const TIERS = [[-6, 0, 100, 0, 0, -1, 10, 16], [-6, 50, 100, 50, 0, 1, 6, 12], [0, -6, 0, 56, -1, 0, 8, 14], [94, -6, 94, 56, 1, 0, 8, 14]];
  for (const [x0, z0, x1, z1, outX, outZ, rows, startOff] of TIERS) {
    for (let r = 0; r < rows; r++) {
      const off = startOff + r * 3.2, hgt = 2 + r * 2.15, cx = (x0 + x1) / 2 + outX * off, cz = (z0 + z1) / 2 + outZ * off;
      const lx = Math.abs(x1 - x0) + (outZ ? 2 * off : 0), lz = Math.abs(z1 - z0) + (outX ? 2 * off : 0);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(outX ? 3.2 : lx, hgt, outZ ? 3.2 : lz), smat(r % 2 ? "#11141a" : "#161a22", { roughness: 0.9 })); slab.position.set(cx, hgt / 2, cz); scene.add(slab);
      const n = Math.floor((outX ? lz : lx) / 2.3);
      for (let i = 0; i < n; i++) { const u = (i + 0.5) / n - 0.5; if (Math.abs(u * (outX ? lz : lx)) % 26 < 1.6 && r > 0) continue; seats.push({ x: outX ? cx : cx + u * lx, y: hgt + 1.0, z: outZ ? cz : cz + u * lz, ox: outX, oz: outZ, row: r, fan: 2 }); }
    }
  }
  const crowdGeo = (() => {
    const parts = [], add = (g, part, x, y, z) => { g = g.index ? g.toNonIndexed() : g; g.translate(x, y, z); g.setAttribute("aPart", new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(part), 1)); if (g.attributes.uv) g.deleteAttribute("uv"); parts.push(g); };
    add(new THREE.CylinderGeometry(0.5, 0.6, 1.55, 9), 0, 0, 0, 0);
    const shd = new THREE.SphereGeometry(0.62, 10, 6); shd.scale(1, 0.42, 0.72); add(shd, 0, 0, 0.72, 0);
    add(new THREE.CylinderGeometry(0.16, 0.18, 0.25, 6), 1, 0, 0.98, 0.02);
    const hd = new THREE.SphereGeometry(0.37, 12, 9); hd.scale(0.9, 1.08, 0.97); add(hd, 1, 0, 1.3, 0.04);
    const hr = new THREE.SphereGeometry(0.4, 12, 6, 0, TAU, 0, PI * 0.55); hr.rotateX(-0.45); add(hr, 6, 0, 1.33, 0.02);
    add(new THREE.CylinderGeometry(0.41, 0.42, 0.2, 10), 7, 0, 1.6, 0.02); add(new THREE.BoxGeometry(0.5, 0.04, 0.36), 7, 0, 1.52, 0.38);
    for (const sd of [1, -1]) {
      add(new THREE.CylinderGeometry(0.15, 0.13, 0.72, 6), sd > 0 ? 2 : 3, sd * 0.68, 0.42, 0.02);
      add(new THREE.CylinderGeometry(0.12, 0.1, 0.62, 6), sd > 0 ? 4 : 5, sd * 0.68, -0.27, 0.02);
      add(new THREE.SphereGeometry(0.12, 6, 5), sd > 0 ? 4 : 5, sd * 0.68, -0.62, 0.02);
    }
    add(new THREE.BoxGeometry(1.05, 0.36, 1.15), 8, 0, -0.78, 0.45);
    // props in the hands: a foam finger (right) and a phone (left); hidden unless the fan has one
    add(mergeGeos([new THREE.BoxGeometry(0.34, 0.5, 0.12).translate(0, -0.95, 0), new THREE.BoxGeometry(0.1, 0.42, 0.1).translate(0.07, -1.38, 0), new THREE.BoxGeometry(0.1, 0.14, 0.18).translate(-0.17, -0.82, 0.08)]), 4.3, 0.68, 0, 0.02);
    add(new THREE.BoxGeometry(0.13, 0.22, 0.03), 5.3, -0.68, -0.74, 0.12);
    return mergeGeos(parts);
  })();
  const CU = { uTime: { value: 0 }, uEx: { value: new THREE.Vector2() }, uShow: { value: 0 }, uWave: { value: new THREE.Vector2() }, uFoam: { value: new THREE.Color() } };
  const crowdMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  crowdMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = CU.uTime; sh.uniforms.uEx = CU.uEx; sh.uniforms.uShow = CU.uShow; sh.uniforms.uWave = CU.uWave; sh.uniforms.uFoam = CU.uFoam;
    sh.fragmentShader = "varying float vGlow;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n totalEmissiveRadiance += vGlow * vec3(2.4, 2.6, 3.0);");
    sh.vertexShader = "attribute vec4 aSeat; attribute vec3 aSkin, aHair; attribute vec2 aVar; attribute float aPart; uniform float uTime, uShow; uniform vec2 uEx, uWave; uniform vec3 uFoam; varying float vGlow;\n" + sh.vertexShader
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float ex = aSeat.x < 0.5 ? uEx.x : (aSeat.x < 1.5 ? uEx.y : max(uEx.x, uEx.y) * 0.7);
        float stand = smoothstep(aSeat.z, aSeat.z + 0.22, ex);
        // the Wave: a band of standing, arms-up fans travelling round the bowl
        float wvv = 0.0; if (aVar.y > -0.5 && uWave.y > 0.0) { vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]); float wa = atan(ip.z - 25.0, ip.x - 47.0); float wd = abs(mod(wa - uWave.x + 3.14159, 6.28318) - 3.14159); wvv = uWave.y * exp(-wd * wd / 0.05); stand = max(stand, wvv); }
        float foam = step(9.5, mod(max(aVar.y, 0.0), 20.0)), phone = step(19.5, aVar.y);
        float phoneUp = phone * max(step(0.05, uShow), step(0.45, stand));
        vGlow = (abs(aPart - 5.3) < 0.05) ? phoneUp : 0.0;
        if ((abs(aPart - 4.3) < 0.05 && foam < 0.5) || (abs(aPart - 5.3) < 0.05 && phoneUp < 0.5)) transformed = vec3(0.0, 0.2, 0.0);
        float clap = smoothstep(aSeat.z * 0.45, aSeat.z * 0.45 + 0.12, ex) * (1.0 - stand);
        float tt = uTime * aSeat.w + aSeat.y;
        float bob = max(0.0, sin(tt)) * (0.03 + stand * 0.55) + sin(uTime * 0.7 + aSeat.y) * 0.03;
        if (aPart > 6.5 && aPart < 7.5 && aVar.x < 0.5) transformed = vec3(0.0, 0.2, 0.0);
        if (aPart > 1.5 && aPart < 5.5) {
          float side = (aPart < 2.5 || (aPart > 3.5 && aPart < 4.5)) ? 1.0 : -1.0;
          float lift = max(max(stand, uShow * step(0.82, fract(aSeat.y * 7.31))), side < 0.0 ? phoneUp * 0.7 : foam * 0.35);
          float shA = -0.25 - lift * (2.3 + 0.35 * sin(tt * 1.7 + side)) - clap * 0.75;
          float elA = mix(-1.25, -0.2, lift) - clap * 0.45;
          vec3 spv = vec3(side * 0.68, 0.78, 0.02), epv = vec3(side * 0.68, 0.06, 0.02), q = transformed;
          if (aPart > 3.5) {
            q -= epv; float c = cos(elA), s = sin(elA); q = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c);
            float ia = -side * clap * (0.5 + 0.32 * sin(uTime * 12.0 + aSeat.y * 3.0)); float ci = cos(ia), si = sin(ia);
            q = vec3(q.x * ci + q.z * si, q.y, -q.x * si + q.z * ci); q += epv;
          }
          q -= spv; float c2 = cos(shA), s2 = sin(shA); q = vec3(q.x, q.y * c2 - q.z * s2, q.y * s2 + q.z * c2);
          float o = -lift * 0.3 * side; float co = cos(o), so = sin(o); q = vec3(q.x * co - q.y * so, q.x * so + q.y * co, q.z);
          transformed = q + spv;
        }
        transformed.y += (aPart > 7.5 ? stand * 0.25 : stand * 0.85 + wvv * 0.45) + bob;`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        if (aPart > 0.5 && aPart < 1.5) vColor = aSkin; else if (aPart > 3.5 && aPart < 5.5) vColor = aSkin; else if (aPart > 5.5 && aPart < 6.5) vColor = aHair;
        else if (aPart > 7.5) vColor = mix(vec3(0.03, 0.035, 0.05), vec3(0.12, 0.13, 0.16), fract(aSeat.y * 3.7));
        if (abs(aPart - 4.3) < 0.05) vColor = uFoam; if (abs(aPart - 5.3) < 0.05) vColor = vec3(0.05);
        if (aPart < 0.5 && aVar.y > -0.5) { // what they're wearing
          float st = mod(aVar.y, 10.0); vec3 pp = position;
          if (st > 0.5 && st < 1.5) { if (abs(pp.x) < 0.17 && pp.z > 0.0) vColor = mix(vColor, vec3(0.86), 0.85); else vColor *= 0.62; } // open jacket
          else if (st > 1.5 && st < 2.5) { if (pp.y > 0.6 || (abs(pp.x) > 0.48 && pp.y > 0.3)) vColor = vec3(0.92); } // replica jersey
          else if (st > 2.5 && st < 3.5) { if (fract(pp.y * 2.6) < 0.42) vColor = mix(vColor, vec3(0.95), 0.75); } // stripes
          else if (st > 3.5 && st < 4.5) { vColor *= 0.55; if (pp.z > 0.25 && abs(pp.x) < 0.3 && pp.y < -0.1 && pp.y > -0.45) vColor *= 0.7; } // hoodie
        }
        vColor *= 0.82;`);
  };
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, seats.length); crowd.frustumCulled = false; scene.add(crowd);
  const aSeat = new Float32Array(seats.length * 4), aSkin = new Float32Array(seats.length * 3), aHair = new Float32Array(seats.length * 3), aVar = new Float32Array(seats.length * 2);
  const dummy = new THREE.Object3D();
  seats.forEach((s, i) => {
    const empty = hash(i * 19 + 4) < 0.07, kid = hash(i * 29 + 8) < 0.08;
    dummy.position.set(s.x, s.y - 0.4 - (kid ? 0.25 : 0), s.z); dummy.rotation.set(0, s.ox ? (s.ox > 0 ? -PI / 2 : PI / 2) : (s.oz > 0 ? PI : 0), 0); const sc = empty ? 0 : kid ? 0.74 : 0.92 + hash(i * 23) * 0.16; dummy.scale.set(sc * (0.92 + hash(i * 41) * 0.16), sc, sc); dummy.updateMatrix(); crowd.setMatrixAt(i, dummy.matrix);
    aSeat[i * 4] = 2; aSeat[i * 4 + 1] = hash(i * 3 + 1) * 6.28; aSeat[i * 4 + 2] = 0.22 + hash(i * 13) * 0.5; aSeat[i * 4 + 3] = 2 + hash(i * 5 + 2) * 3;
    const si = Math.floor(hash(i * 17 + 3) * SKIN.length), sk = col(SKIN[si]); aSkin[i * 3] = sk.r; aSkin[i * 3 + 1] = sk.g; aSkin[i * 3 + 2] = sk.b;
    const bald = hash(i * 43 + 1) < 0.1, hc = bald ? sk : col(si >= 4 ? HAIRC[0] : hash(i * 47) < 0.12 ? "#9a9a9a" : HAIRC[Math.floor(hash(i * 53) * HAIRC.length)]); aHair[i * 3] = hc.r; aHair[i * 3 + 1] = hc.g; aHair[i * 3 + 2] = hc.b;
    aVar[i * 2] = hash(i * 59 + 2) < 0.16 ? 1 : 0;
    aVar[i * 2 + 1] = Math.floor(hash(i * 61 + 5) * 5) + (hash(i * 67 + 3) < 0.035 ? 10 : 0) + (hash(i * 71 + 1) < 0.12 ? 20 : 0); // clothes, foam finger, phone
    crowd.setColorAt(i, col("#888"));
  });
  crowdGeo.setAttribute("aSeat", new THREE.InstancedBufferAttribute(aSeat, 4)); crowdGeo.setAttribute("aSkin", new THREE.InstancedBufferAttribute(aSkin, 3));
  crowdGeo.setAttribute("aHair", new THREE.InstancedBufferAttribute(aHair, 3)); crowdGeo.setAttribute("aVar", new THREE.InstancedBufferAttribute(aVar, 2));
  // seat backs (visible where seats are empty and between heads)
  const seatGeo = new THREE.BoxGeometry(1.5, 1.2, 0.22), seatsM = new THREE.InstancedMesh(seatGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), seats.length); seatsM.frustumCulled = false; scene.add(seatsM);
  seats.forEach((s, i) => { dummy.position.set(s.x + s.ox * 0.6, s.y - 0.55, s.z + s.oz * 0.6); dummy.rotation.set(0, s.ox ? PI / 2 : 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); seatsM.setMatrixAt(i, dummy.matrix); seatsM.setColorAt(i, col("#333")); });
  function paintCrowd(home, away) {
    const cols = [home.c1, home.c1, home.c1, home.c2, away.c1, "#d8d8d8", "#30343c", "#8a6f5a", "#5a7085", "#c94f4f"], hc = col(home.c1).multiplyScalar(0.45);
    seats.forEach((s, i) => { const k = Math.floor(hash(i * 31 + 7) * cols.length); s.fan = k <= 3 ? 0 : k === 4 ? 1 : 2; aSeat[i * 4] = s.fan; const jersey = aVar[i * 2 + 1] % 10 === 2; crowd.setColorAt(i, col(jersey ? (s.fan === 1 ? away.c1 : home.c1) : cols[k]).multiplyScalar(0.8)); seatsM.setColorAt(i, hc); });
    CU.uFoam.value.set(home.c1).multiplyScalar(1.1);
    crowd.instanceColor.needsUpdate = true; seatsM.instanceColor.needsUpdate = true; crowdGeo.attributes.aSeat.needsUpdate = true;
  }
  // signs held up by home fans (one merged mesh, quads moved on the CPU)
  const signSeats = seats.filter(s => s.row <= 2 && (s.oz !== 0)).filter((s, i) => hash(i * 71 + 9) < 0.06).slice(0, 22);
  const signGeo = new THREE.BufferGeometry(), SP = new Float32Array(signSeats.length * 12), SUV = new Float32Array(signSeats.length * 8), SI = [];
  signSeats.forEach((s, i) => { const c = i % 8, u0 = (c % 4) / 4, v0 = 1 - (Math.floor(c / 4) + 1) / 2; SUV.set([u0, v0, u0 + 0.25, v0, u0 + 0.25, v0 + 0.5, u0, v0 + 0.5], i * 8); SI.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); s.sph = hash(i * 5 + 1) * 6; });
  signGeo.setAttribute("position", new THREE.BufferAttribute(SP, 3)); signGeo.setAttribute("uv", new THREE.BufferAttribute(SUV, 2)); signGeo.setIndex(SI);
  const signMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: glow("#ffffff", 0.9) }), signs = new THREE.Mesh(signGeo, signMat); signs.frustumCulled = false; scene.add(signs);
  // ribbon boards and the dim upper deck
  const upperTex = canvasTex(2048, 512, (g, W, H) => {
    g.fillStyle = "#07090e"; g.fillRect(0, 0, W, H);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cols = ["#3a4252", "#4a3f3a", "#59606e", "#2c3340", "#6b5a4a", "#7a6a3a", "#5a3a3a"];
    for (let r = 0; r < 22; r++) { const y = 12 + r * 22, dim = 1 - r / 28; g.fillStyle = `rgba(30,36,48,${0.9 * dim})`; g.fillRect(0, y + 14, W, 3); for (let x = 4; x < W; x += 11) { if (rnd() < 0.18) continue; g.globalAlpha = dim * 0.8; g.fillStyle = cols[Math.floor(rnd() * cols.length)]; g.fillRect(x, y + 4, 7, 10); g.fillStyle = "#8d6a52"; g.fillRect(x + 1.5, y, 4, 4); } }
    g.globalAlpha = 1; const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, "rgba(2,3,6,0.8)"); gr.addColorStop(0.6, "rgba(2,3,6,0.2)"); gr.addColorStop(1, "rgba(2,3,6,0)"); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
  upperTex.wrapS = THREE.RepeatWrapping;
  const ribbonTex = stripTex(); ribbonTex.repeat.set(2.2, 1);
  for (const [x0, z0, x1, z1, outX, outZ, rows, startOff] of TIERS) {
    const back = startOff + (rows - 1) * 3.2 + 1.8, top = 2 + (rows - 1) * 2.15 + 3.4, len = Math.abs(outX ? z1 - z0 : x1 - x0) + 2 * back;
    const cx = (x0 + x1) / 2 + outX * back, cz = (z0 + z1) / 2 + outZ * back, ry = outZ < 0 ? 0 : outZ > 0 ? PI : outX < 0 ? PI / 2 : -PI / 2;
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.6), new THREE.MeshBasicMaterial({ map: ribbonTex, color: glow("#ffffff", 1.7) })); rib.position.set(cx, top + 1.3, cz); rib.rotation.y = ry; scene.add(rib);
    const ut = upperTex.clone(); ut.needsUpdate = true; ut.repeat.set(len / 60, 1);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(len + 40, 42), new THREE.MeshBasicMaterial({ map: ut })); up.position.set(cx + outX * 10, top + 21.6, cz + outZ * 10); up.rotation.y = ry; up.rotateX(-0.42); scene.add(up);
  }
  // ceiling: dark, with bright light banks and a center-hung scoreboard
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(300, 240), new THREE.MeshBasicMaterial({ color: "#05070b" })); ceil.rotation.x = PI / 2; ceil.position.set(47, 82, 25); scene.add(ceil);
  for (const z of [6, 25, 44]) for (const x of [22, 47, 72]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 3), new THREE.MeshBasicMaterial({ color: glow("#fff4e0", 9) })); bar.position.set(x, 72, z); scene.add(bar); }
  // light haze in the beams (seen from outside, on high quality)
  const hazeMat = new THREE.MeshBasicMaterial({ map: beamTex(), color: glow("#fff2dc", 0.03), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  const haze = []; for (const x of [22, 47, 72]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(3, 16, 70, 24, 1, true), hazeMat); c.position.set(x, 37, 25); scene.add(c); haze.push(c); }
  // scorer's table, LED boards, benches with subs
  const table = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 2.5), smat("#0c0f14")); table.position.set(47, 1.5, -5); table.castShadow = true; scene.add(table);
  const adTex = stripTex(); adTex.repeat.set(0.35, 1);
  const ad1 = new THREE.Mesh(new THREE.PlaneGeometry(15.6, 1.8), new THREE.MeshBasicMaterial({ map: adTex, color: glow("#ffffff", 2) })); ad1.position.set(47, 1.9, -3.74); scene.add(ad1);
  const adTex2 = stripTex(); adTex2.repeat.set(1.4, 1); const adMat2 = new THREE.MeshBasicMaterial({ map: adTex2, color: glow("#ffffff", 1.8) });
  for (const [x, z, ry, w] of [[47, 61.5, PI, 100], [-7.5, 25, PI / 2, 52], [101.5, 25, -PI / 2, 52]]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), adMat2); b.position.set(x, 1.6, z); b.rotation.y = ry; scene.add(b); }
  for (const t of [0, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(16, 1.6, 2.4), smat("#222833")); b.position.set(47 + (t ? 15 : -15), 0.8, -7.4); scene.add(b); }
  const spots = [];
  for (const side of [0, 1]) for (const z of [4, 6, 8, 10, 12, 14, 36, 38, 40, 42, 44, 46]) spots.push({ x: side ? 97.4 : -3.4, z, ry: side ? -PI / 2 : PI / 2, kind: 0, y: 2.25 });
  for (const x of [7, 9, 11, 13, 15, 17, 19, 75, 77, 79, 81, 83, 85, 87]) spots.push({ x, z: -3.6, ry: 0, kind: 0, y: 2.25 });
  for (const t of [0, 1]) for (let i = 0; i < 7; i++) spots.push({ x: 47 + (t ? 1 : -1) * (9.4 + i * 1.9), z: -7.6, ry: 0, kind: 1, t, y: 2.4 });
  for (const x of [43, 45.7, 48.3, 51]) spots.push({ x, z: -6.9, ry: 0, kind: 2, y: 2.3 });
  for (const side of [0, 1]) for (const z of [18, 20.5, 29.5, 32]) spots.push({ x: side ? 95.3 : -1.3, z, ry: side ? -PI / 2 : PI / 2, kind: 3, y: 1.25 });
  const ccGeo = crowdGeo.clone(), cc = new THREE.InstancedMesh(ccGeo, crowdMat, spots.length); cc.frustumCulled = false; scene.add(cc);
  const ccSeat = new Float32Array(spots.length * 4), ccSkin = new Float32Array(spots.length * 3), ccHair = new Float32Array(spots.length * 3), ccVar = new Float32Array(spots.length * 2);
  const chairGeo = mergeGeos([new THREE.BoxGeometry(1.3, 0.2, 1.2).translate(0, 1.45, 0.15), new THREE.BoxGeometry(1.3, 1.5, 0.15).translate(0, 2.2, -0.45), new THREE.BoxGeometry(0.12, 1.4, 0.12).translate(0.5, 0.7, 0.5), new THREE.BoxGeometry(0.12, 1.4, 0.12).translate(-0.5, 0.7, 0.5)]);
  const chairSpots = spots.filter(q => q.kind === 0 || q.kind === 2), chairs = new THREE.InstancedMesh(chairGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, envMapIntensity: 0.5 }), chairSpots.length); chairs.frustumCulled = false; scene.add(chairs);
  const camGeo = mergeGeos([new THREE.BoxGeometry(0.45, 0.36, 0.5), new THREE.CylinderGeometry(0.13, 0.15, 0.55, 10).rotateX(PI / 2).translate(0, 0, 0.45)]);
  const photoSpots = spots.filter(q => q.kind === 3), cams = new THREE.InstancedMesh(camGeo, smat("#121315", { metalness: 0.4, roughness: 0.3 }), photoSpots.length); cams.frustumCulled = false; scene.add(cams);
  spots.forEach((q, i) => {
    dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(q.kind === 3 ? 0.25 : 0, q.ry, 0); dummy.scale.setScalar(q.kind === 1 ? 1.12 : 1); dummy.updateMatrix(); cc.setMatrixAt(i, dummy.matrix);
    ccSeat[i * 4] = q.kind === 1 ? q.t : 2; ccSeat[i * 4 + 1] = hash(i * 7 + 3) * 6.28; ccSeat[i * 4 + 2] = q.kind === 1 ? 0.22 : q.kind === 0 ? 0.3 + hash(i * 11) * 0.4 : 9; ccSeat[i * 4 + 3] = 2 + hash(i * 5) * 3;
    const si = Math.floor(hash(i * 17 + 9) * SKIN.length), sk = col(SKIN[si]); ccSkin.set([sk.r, sk.g, sk.b], i * 3);
    const hc = hash(i * 43) < 0.15 ? sk : col(si >= 4 ? HAIRC[0] : HAIRC[Math.floor(hash(i * 53 + 1) * HAIRC.length)]); ccHair.set([hc.r, hc.g, hc.b], i * 3);
    ccVar[i * 2] = q.kind === 3 && hash(i) < 0.5 ? 1 : 0; ccVar[i * 2 + 1] = -1; /* courtside: no Wave, plain clothes */ cc.setColorAt(i, col("#555"));
  });
  chairSpots.forEach((q, i) => { dummy.position.set(q.x, 0, q.z); dummy.rotation.set(0, q.ry, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); chairs.setMatrixAt(i, dummy.matrix); chairs.setColorAt(i, col("#1b1d22")); });
  photoSpots.forEach((q, i) => { dummy.position.set(q.x, q.y, q.z); dummy.rotation.set(0.25, q.ry, 0); dummy.updateMatrix(); const mtx = new THREE.Matrix4().makeTranslation(0, 1.3, 0.55); dummy.matrix.multiply(mtx); cams.setMatrixAt(i, dummy.matrix); });
  ccGeo.setAttribute("aSeat", new THREE.InstancedBufferAttribute(ccSeat, 4)); ccGeo.setAttribute("aSkin", new THREE.InstancedBufferAttribute(ccSkin, 3)); ccGeo.setAttribute("aHair", new THREE.InstancedBufferAttribute(ccHair, 3)); ccGeo.setAttribute("aVar", new THREE.InstancedBufferAttribute(ccVar, 2));
  function paintCourtside(home, away, colors) {
    const fanCols = [home.c1, "#111214", "#f0f0f0", "#2b2f38", home.c2, "#6b4f3a", away.c1, "#8b1e2d"];
    spots.forEach((q, i) => { cc.setColorAt(i, col(q.kind === 1 ? colors[q.t] : q.kind === 2 ? "#17191d" : q.kind === 3 ? "#30343b" : fanCols[Math.floor(hash(i * 29 + 1) * fanCols.length)]).multiplyScalar(q.kind === 1 ? 1 : 0.85)); if (q.kind === 0) ccSeat[i * 4] = hash(i * 31) < 0.6 ? 0 : hash(i * 37) < 0.5 ? 1 : 2; });
    chairSpots.forEach((q, i) => chairs.setColorAt(i, col(home.c1).multiplyScalar(0.35)));
    cc.instanceColor.needsUpdate = true; chairs.instanceColor.needsUpdate = true; ccGeo.attributes.aSeat.needsUpdate = true;
  }
  // rafters: trusses and a speaker cluster above the scoreboard
  for (const z of [-12, 25, 62]) { const bm = new THREE.Mesh(new THREE.BoxGeometry(160, 1.1, 1.1), smat("#14171c")); bm.position.set(47, 77, z); scene.add(bm); }
  for (const x of [-6, 22, 47, 72, 100]) { const bm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 120), smat("#14171c")); bm.position.set(x, 77.6, 25); scene.add(bm); }
  const spk = new THREE.Mesh(new THREE.CylinderGeometry(4, 5.2, 4.5, 8), smat("#0c0e12")); spk.position.set(47, 70, 25); scene.add(spk);
  // championship banners and retired numbers hang above the far stands
  let banners = [];
  function buildBanners(home, list) {
    for (const b of banners) { scene.remove(b); b.material.map.dispose(); b.material.dispose(); b.geometry.dispose(); }
    banners = [];
    const items = [{ kind: "team" }, ...list].slice(0, 12), n = items.length;
    items.forEach((it, i) => {
      const tex = canvasTex(256, 420, (g, W, H) => {
        const lumH = h => { const v = parseInt(h.slice(1), 16); return (0.3 * (v >> 16) + 0.59 * ((v >> 8) & 255) + 0.11 * (v & 255)) / 255; }, light = lumH(home.c1) > 0.5;
        const bg = light ? home.c2 : home.c1, edge = light ? home.c1 : home.c2;
        g.fillStyle = edge; g.fillRect(0, 0, W, H); g.fillStyle = bg; g.fillRect(12, 12, W - 24, H - 24);
        g.fillStyle = edge; for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(12 + k * 26, H - 12); g.lineTo(25 + k * 26, H); g.lineTo(38 + k * 26, H - 12); g.fill(); }
        const fit = (str, y, size, fill, stroke) => { g.font = `700 ${size}px Oswald, Impact, sans-serif`; const w = g.measureText(str).width; txt(g, str, W / 2, y, Math.floor(size * Math.min(1, (W - 44) / Math.max(1, w))), fill, stroke); };
        if (it.kind === "title") { fit(home.city.toUpperCase(), 62, 26, "#fff"); txt(g, "UBL", W / 2, 120, 64, "#fff", "rgba(0,0,0,0.35)"); txt(g, "CHAMPIONS", W / 2, 182, 34, "#fff"); txt(g, String(it.year), W / 2, 280, 84, "#fff", "rgba(0,0,0,0.3)"); }
        else if (it.kind === "retired") { txt(g, String(it.num), W / 2, 160, 150, "#fff", "rgba(0,0,0,0.3)"); fit(String(it.name).toUpperCase(), 300, 34, "#fff"); }
        else { fit(home.city.toUpperCase(), 110, 34, "#fff"); fit(home.name.toUpperCase(), 175, 48, "#fff", "rgba(0,0,0,0.35)"); txt(g, "EST. " + (home.joined || 1954), W / 2, 300, 32, "#fff"); }
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 10.5), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
      m.position.set(47 + (i - (n - 1) / 2) * 8.2, 35.5, -44); m.userData.ph = i * 1.37; scene.add(m); banners.push(m);
    });
  }
  const sbCanvas = document.createElement("canvas"); sbCanvas.width = 512; sbCanvas.height = 256;
  const sbTex = new THREE.CanvasTexture(sbCanvas); sbTex.encoding = THREE.sRGBEncoding;
  const sbMat = new THREE.MeshBasicMaterial({ map: sbTex, color: glow("#ffffff", 1.6) });
  const board = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), [sbMat, sbMat, smat("#111"), smat("#111"), sbMat, sbMat]); board.position.set(47, 50, 25); scene.add(board);
  // video tier above the score: a live feed on high quality, a matchup graphic otherwise
  const jumboRT = new THREE.WebGLRenderTarget(384, 216); jumboRT.texture.generateMipmaps = false;
  const jumboCam = new THREE.PerspectiveCamera(32, 16 / 9, 1, 600);
  const jumboStaticC = document.createElement("canvas"); jumboStaticC.width = 384; jumboStaticC.height = 216;
  const jumboStatic = new THREE.CanvasTexture(jumboStaticC); jumboStatic.encoding = THREE.sRGBEncoding;
  const jumboMat = new THREE.MeshBasicMaterial({ map: jumboStatic, color: glow("#ffffff", 1.4) });
  const jumbo = new THREE.Mesh(new THREE.BoxGeometry(20, 10.5, 20), [jumboMat, jumboMat, smat("#111"), smat("#111"), jumboMat, jumboMat]); jumbo.position.set(47, 60.6, 25); scene.add(jumbo);
  function drawJumboStatic(home, away) {
    const g = jumboStaticC.getContext("2d"), gr = g.createLinearGradient(0, 0, 384, 216); gr.addColorStop(0, home.c1); gr.addColorStop(1, "#05070b"); g.fillStyle = gr; g.fillRect(0, 0, 384, 216);
    txt(g, away.id + "  @  " + home.id, 192, 92, 54, "#ffffff", "rgba(0,0,0,0.4)"); txt(g, "UBL ON TV", 192, 158, 26, "#ffcf4a"); jumboStatic.needsUpdate = true;
  }
  const ring2 = new THREE.Mesh(new THREE.BoxGeometry(21, 1.2, 21), new THREE.MeshBasicMaterial({ map: ribbonTex, color: glow("#ffffff", 1.6) })); ring2.position.set(47, 44.4, 25); scene.add(ring2);
  let sbKey = "";
  const fmt = c => { c = Math.max(0, c); if (c < 60) return c.toFixed(1); return Math.floor(c / 60) + ":" + String(Math.floor(c % 60)).padStart(2, "0"); };
  function drawBoard(home, away, s0, s1, per, clk) {
    const k = s0 + "-" + s1 + "-" + per + "-" + Math.ceil(clk); if (k === sbKey) return; sbKey = k;
    const g = sbCanvas.getContext("2d"); g.fillStyle = "#03050a"; g.fillRect(0, 0, 512, 256);
    g.fillStyle = away.c1; g.fillRect(0, 0, 256, 60); g.fillStyle = home.c1; g.fillRect(256, 0, 256, 60);
    txt(g, away.id, 128, 32, 40, "#fff"); txt(g, home.id, 384, 32, 40, "#fff");
    txt(g, String(s1), 128, 150, 110, "#ffcf4a"); txt(g, String(s0), 384, 150, 110, "#ffcf4a");
    txt(g, (per <= 4 ? "Q" + per : "OT") + "  " + fmt(clk), 256, 230, 34, "#fff");
    sbTex.needsUpdate = true;
  }
  // ---------- light show (pregame) and confetti (home win) ----------
  const poolTex = radialTex("rgba(255,255,255,1)", "rgba(255,255,255,0)"), bTex = beamTex();
  const show = []; for (let i = 0; i < 5; i++) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0, 0, 0) })); pool.rotation.x = -PI / 2; scene.add(pool);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 6.2, 70, 20, 1, true), new THREE.MeshBasicMaterial({ map: bTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0, 0, 0), side: THREE.DoubleSide })); scene.add(beam);
    show.push({ pool, beam });
  }
  const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 600); confetti.frustumCulled = false; confetti.visible = false; scene.add(confetti);
  // ---------- ball, contact shadows, slow-motion ghosts, flashes ----------
  const BT = ballTextures();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.39, 28, 20), new THREE.MeshStandardMaterial({ map: BT.map, bumpMap: BT.bump, bumpScale: 0.6, roughness: 0.62, envMapIntensity: 0.6 })); ball.castShadow = true; scene.add(ball);
  const ghosts = []; for (let i = 0; i < 7; i++) { const g = new THREE.Mesh(new THREE.SphereGeometry(0.39, 12, 10), new THREE.MeshBasicMaterial({ color: glow("#ff9a3c", 1.5), transparent: true, opacity: 0, depthWrite: false })); scene.add(g); ghosts.push(g); }
  const blobMat = new THREE.MeshBasicMaterial({ map: radialTex("rgba(0,0,0,0.75)", "rgba(0,0,0,0)"), transparent: true, depthWrite: false });
  const blobs = []; for (let i = 0; i < 11; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat); s.rotation.x = -PI / 2; s.position.y = 0.02; s.renderOrder = 1; scene.add(s); blobs.push(s); }
  const AR = new THREE.Group(); scene.add(AR);
  const TRN = 72, trPos = new Float32Array(TRN * 6), trCol = new Float32Array(TRN * 6), trIdx = [];
  for (let i = 0; i < TRN - 1; i++) { const a = i * 2; trIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const trGeo = new THREE.BufferGeometry(); trGeo.setAttribute("position", new THREE.BufferAttribute(trPos, 3)); trGeo.setAttribute("color", new THREE.BufferAttribute(trCol, 3)); trGeo.setIndex(trIdx);
  const tracer = new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); tracer.frustumCulled = false; AR.add(tracer);
  const ringTex = canvasTex(256, 256, g => { const gr = g.createRadialGradient(128, 128, 60, 128, 128, 126); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.6, "rgba(255,255,255,1)"); gr.addColorStop(0.72, "rgba(255,255,255,0.3)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }, 1, true);
  const rings = [0, 1].map(() => { const r = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color() })); r.rotation.x = -PI / 2; AR.add(r); return r; });
  const labels = [0, 1].map(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 128; const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.renderOrder = 10; sp.userData = { c, t, key: "" }; AR.add(sp); return sp; });
  const dashTex = canvasTex(64, 16, g => { g.fillStyle = "#fff"; g.fillRect(0, 3, 38, 10); }, 1, true); dashTex.wrapS = THREE.RepeatWrapping;
  const fline = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.38), new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(3, 2.3, 0.7) })); fline.rotation.x = -PI / 2; AR.add(fline);
  function drawLabel(sp, text, color) {
    const key = text + color; if (sp.userData.key === key) return; sp.userData.key = key;
    const g = sp.userData.c.getContext("2d"); g.clearRect(0, 0, 640, 128);
    g.fillStyle = "rgba(6,8,12,0.84)"; g.beginPath(); g.moveTo(18, 18); g.lineTo(622, 18); g.quadraticCurveTo(636, 18, 636, 32); g.lineTo(636, 96); g.quadraticCurveTo(636, 110, 622, 110); g.lineTo(18, 110); g.quadraticCurveTo(4, 110, 4, 96); g.lineTo(4, 32); g.quadraticCurveTo(4, 18, 18, 18); g.fill();
    g.fillStyle = color; g.fillRect(4, 18, 14, 92);
    let size = 46; g.font = `700 ${size}px Oswald, Impact, sans-serif`; while (g.measureText(text).width > 580 && size > 22) { size -= 2; g.font = `700 ${size}px Oswald, Impact, sans-serif`; }
    txt(g, text, 326, 66, size, "#ffffff"); sp.userData.t.needsUpdate = true;
  }
  const arC = [new THREE.Color(), new THREE.Color()], trC = new THREE.Color(), arV = new V3(), arT = new V3(), arS = new V3();
  function updateAR(ar, tick, pos) {
    AR.visible = !!ar; if (!ar) return;
    (ar.rings || []).forEach((idx, i) => { const r = G.roster[idx]; if (r) arC[i].set(G.colors[r.t]).multiplyScalar(2.6); });
    if (ar.trace) {
      const [t0, t1] = ar.trace, tEnd = Math.min(tick, t1), n = clamp(Math.floor((tEnd - t0) / 0.5) + 1, 2, TRN);
      tracer.visible = tEnd > t0 + 0.5; trC.setRGB(...(ar.color || [3.2, 2.3, 0.6]));
      camera.getWorldDirection(arV);
      for (let i = 0; i < TRN; i++) {
        const ii = Math.min(i, n - 1), tt = t0 + (tEnd - t0) * ii / (n - 1), q = sampleBall(tt), q2 = sampleBall(Math.min(tEnd, tt + 0.5));
        arT.set(q2.x - q.x, q2.z - q.z, q2.y - q.y); if (arT.lengthSq() < 1e-6) arT.set(1, 0, 0);
        arS.crossVectors(arT, arV).normalize().multiplyScalar(0.17);
        const px = q.x, py = Math.max(0.39, q.z), pz = q.y, o = i * 6, k = 0.15 + 0.85 * (ii / (n - 1)) ** 1.5;
        trPos[o] = px + arS.x; trPos[o + 1] = py + arS.y; trPos[o + 2] = pz + arS.z; trPos[o + 3] = px - arS.x; trPos[o + 4] = py - arS.y; trPos[o + 5] = pz - arS.z;
        for (let c = 0; c < 2; c++) { trCol[o + c * 3] = trC.r * k; trCol[o + c * 3 + 1] = trC.g * k; trCol[o + c * 3 + 2] = trC.b * k; }
      }
      trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
    } else tracer.visible = false;
    rings.forEach((rg, i) => { const idx = ar.rings ? ar.rings[i] : undefined, p = idx !== undefined ? pos.find(q => q.idx === idx) : null; rg.visible = !!p; if (!p) return; const sc = 3.4 + Math.sin(performance.now() / 170 + i) * 0.18; rg.scale.set(sc, sc, 1); rg.position.set(p.x, 0.07, p.y); rg.material.color.copy(arC[i]); });
    labels.forEach((sp, i) => {
      const L = ar.labels ? ar.labels[i] : null, p = L ? pos.find(q => q.idx === L.idx) : null; sp.visible = !!p; if (!p) return;
      drawLabel(sp, L.text, L.color || "#f2b134");
      sp.position.set(p.x, (models[p.idx] ? models[p.idx].H : 6.5) + 1.7 + p.z + i * 1.6, p.y);
      const sc = clamp(camera.position.distanceTo(sp.position) * 0.07, 1.4, 8); sp.scale.set(sc * 5, sc, 1);
    });
    if (ar.line) { const [x1, y1, x2, y2] = ar.line, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy); fline.visible = true; fline.position.set((x1 + x2) / 2, 0.08, (y1 + y2) / 2); fline.rotation.set(-PI / 2, 0, -Math.atan2(dy, dx)); fline.scale.set(len, 1, 1); dashTex.repeat.set(len / 1.3, 1); dashTex.offset.x = -(performance.now() / 900) % 1; }
    else fline.visible = false;
  }
  const transients = () => [AR, ...haze, ...show.map(x => x.pool), ...show.map(x => x.beam), flashes, ...ghosts, ...blobs, ...hoops.map(h => h.net.mesh), confetti];
  const ripples = [0, 1, 2, 3].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uA: { value: 0 }, uR: { value: 0.3 } },
      vertexShader: "varying vec2 vU; void main(){ vU = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform float uA, uR; varying vec2 vU; void main(){ float r = length(vU); float crest = exp(-pow((r - uR) / 0.06, 2.0)), trough = exp(-pow((r - uR + 0.11) / 0.05, 2.0)) * 0.8; float a = max(crest, trough) * uA * (1.0 - smoothstep(0.85, 1.0, r)); gl_FragColor = vec4(vec3(crest / (crest + trough + 1e-4)) * 1.35, a); }" }));
    m.rotation.x = -PI / 2; m.visible = false; m.renderOrder = 2; scene.add(m); return m;
  });
  const sprayGeo = new THREE.BufferGeometry(), sprayPos = new Float32Array(200 * 3); sprayGeo.setAttribute("position", new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: glow("#e6f2ff", 1.6), size: 0.16, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false })); spray.frustumCulled = false; scene.add(spray);
  function shotEvent(idx, a0) { for (let i = evIndex(a0 - 6); i < EV.length && EVT[i] <= a0 + 70; i++) { const e = EV[i]; if (e.type === "fga" && e.pid === idx) return e; } return null; }
  function passKind(idx, a0) { // read the ball's flight: off the floor, over everyone, or a long way
    const b0 = sampleBall(a0); let minZ = 99, maxZ = 0, far = 0;
    for (let t = a0 + 4; t <= a0 + 44; t += 2) { const q = sampleBall(t); if (q.holder >= 0 && q.holder !== idx) break; minZ = Math.min(minZ, q.z); maxZ = Math.max(maxZ, q.z); far = Math.max(far, Math.hypot(q.x - b0.x, q.y - b0.y)); }
    return minZ < 0.8 ? "bounce" : maxZ > 10.5 ? "lob" : far > 34 ? "long" : 0;
  }
  function whereWas(idx, tk) { for (let k = 0; k < 10; k++) { const q = samplePlayer(k, tk); if (q.idx === idx) return q; } return null; }
  const flashGeo = new THREE.BufferGeometry(), flashPos = new Float32Array(160 * 3); flashGeo.setAttribute("position", new THREE.BufferAttribute(flashPos, 3));
  const flashes = new THREE.Points(flashGeo, new THREE.PointsMaterial({ color: glow("#ffffff", 6), size: 2.2, sizeAttenuation: true, transparent: true, depthWrite: false })); flashes.frustumCulled = false; scene.add(flashes);
  // ---------- referees and coaches ----------
  const refTex = refAtlas();
  const refs = [0, 1, 2].map(i => { const id = 900 + i * 7, m = buildFigure({ H: 6.0 + i * 0.12, ws: 1.02, id, skin: SKIN[[1, 4, 2][i]], hairC: HAIRC[[3, 0, 5][i]], look: { hair: ["crop", "buzz", "bald"][i], beard: i === 1 ? "stache" : null }, shoe: "#111111", shoe2: "#111111", shoeStyle: "leather", cloth: { atlas: refTex, top: true, hem: 0.47, topInf: 1.1, sleeve: 0.5, pants: true } }); scene.add(m.root); return { m }; });
  let coaches = [], models = {}, dancers = [], danceTeam = null, danceT = 0;
  function buildDancers(home) {
    for (const d of dancers) { scene.remove(d.m.root); disposeFigure(d.m); }
    dancers = [];
    for (let i = 0; i < 8; i++) {
      const id = 700 + i * 13 + home.id.charCodeAt(1) * 7, si = Math.floor(hash(id) * SKIN.length), skin = SKIN[si];
      const m = buildFigure({ H: 5.45 + hash(id + 1) * 0.35, ws: 0.84, id, skin, hairC: si >= 4 ? HAIRC[0] : HAIRC[Math.floor(hash(id + 2) * HAIRC.length)], look: { hair: ["pony", "pony", "afro", "pony", "crop", "pony", "buzz", "pony"][i] },
        shoe: "#f4f4f4", shoe2: home.c1, shoeStyle: "modern", sock: { kind: "low", c: "#f4f4f4" }, sock2: home.c1, cloth: { atlas: danceAtlas(home, skin), top: true, hem: 0.5, shortsLen: 0.16, bag: 1.02 } });
      m.root.visible = false; scene.add(m.root); castShadows(m, quality !== "low"); dancers.push({ m, i });
    }
  }
  function buildCoaches(home, away) {
    for (const c of coaches) { scene.remove(c.m.root); disposeFigure(c.m); }
    coaches = [home, away].map((tm, t) => {
      const id = 950 + t * 7 + tm.id.charCodeAt(0) * 3, m = buildFigure({ H: 5.95, ws: 1.08, id, skin: SKIN[Math.floor(hash(id) * 6)], hairC: HAIRC[Math.floor(hash(id + 1) * 6)], look: { hair: hash(id + 2) < 0.4 ? "bald" : "crop", beard: hash(id + 3) < 0.2 ? "stache" : null }, shoe: "#0d0d0d", shoe2: "#0d0d0d", shoeStyle: "modern", cloth: { atlas: coachAtlas(tm, ["#1b2230", "#262626", "#2c2620", "#1d2a24"][Math.floor(hash(id + 4) * 4)]), top: true, hem: 0.46, topInf: 1.14, sleeve: 1.9, pants: true } });
      scene.add(m.root); castShadows(m, quality !== "low"); return { m, t };
    });
  }
  function setQuality(q) {
    quality = q;
    renderer.setPixelRatio(Math.min(q === "high" ? 2 : q === "medium" ? 1.5 : 1, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = q !== "low"; key.castShadow = q !== "low";
    key.shadow.mapSize.set(q === "high" ? 2048 : 1024, q === "high" ? 2048 : 1024);
    if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    blobMat.opacity = q === "low" ? 1 : 0.55;
    for (const k in models) castShadows(models[k], q !== "low");
    for (const r of refs) castShadows(r.m, q !== "low"); for (const c of coaches) castShadows(c.m, q !== "low"); for (const d of dancers) castShadows(d.m, q !== "low");
    for (const h of haze) h.visible = q === "high";
    scene.traverse(o => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
  }

  // ---------- game state ----------
  let waves = [], G = null, teams = null, EV = [], EVT = [], era = 2000, signTex = null;
  const courtCache = new Map();
  function setGame(game, home, away, colors, o) {
    G = game; teams = [home, away]; era = (o && o.season) || 2000;
    for (const k in models) { scene.remove(models[k].root); disposeFigure(models[k]); }
    models = {};
    const four = !(game.rules && game.rules.four === false), ck = home.id + (four ? "" : "-no4");
    let ct = courtCache.get(ck);
    if (!ct) { ct = { map: courtTexture(home, aniso, false, four), rough: courtTexture(home, aniso, true, four) }; courtCache.set(ck, ct); if (courtCache.size > 6) { const [k0, v0] = courtCache.entries().next().value; v0.map.dispose(); v0.rough.dispose(); courtCache.delete(k0); } }
    courtMat.map = ct.map; courtMat.roughnessMap = ct.rough; courtMat.needsUpdate = true;
    if (signTex) signTex.dispose(); signTex = signAtlas(home); signMat.map = signTex; signMat.needsUpdate = true;
    paintCrowd(home, away); drawJumboStatic(home, away);
    G.colors = colors; sbKey = ""; scKey = "";
    paintCourtside(home, away, colors); padMat.color.set(home.c1); buildBanners(home, (o && o.banners) || []);
    buildCoaches(home, away);
    EV = G.events; EVT = EV.map(e => e.tk);
    waves = []; for (const per of [2, 3]) { const a = EV.find(e => e.type === "period_start" && e.per === per), z = EV.find(e => e.type === "period_end" && e.per === per); if (a && z) { const t0 = a.tk + (0.3 + 0.35 * hash(G.ticks * 0.37 + per)) * (z.tk - a.tk); waves.push([t0, t0 + 680]); } }
    cam.init = false; dir.shot = null; lastTick = -1; finT0 = -1;
    for (const h of hoops) h.net.reset();
  }
  function model(idx) {
    if (models[idx]) return models[idx];
    const r = G.roster[idx], t = r.t, c1 = G.colors[t], tm = teams[t], c2 = (c1 === tm.c1 ? tm.c2 : tm.c1);
    const m = buildFigure(playerSpec(r, era, tm, c1, c2, idx));
    castShadows(m, quality !== "low");
    scene.add(m.root); models[idx] = m; return m;
  }
  function evIndex(tk) { let lo = 0, hi = EVT.length; while (lo < hi) { const m = (lo + hi) >> 1; if (EVT[m] <= tk) lo = m + 1; else hi = m; } return lo; }
  function recent(tick, span, fn) { const i1 = evIndex(tick); for (let i = i1 - 1; i >= 0 && EVT[i] > tick - span; i--) fn(EV[i], tick - EVT[i]); }

  // ---------- sampling (Catmull-Rom between 10 Hz frames) ----------
  function fidx(tick) { const ff = clamp(tick / 2, 0, G.nFrames - 1.0001); return [Math.floor(ff), ff - Math.floor(ff)]; }
  function samplePlayer(k, tick) {
    const F = G.frames, [f1, a] = fidx(tick), n = G.nFrames - 1;
    const f0 = Math.max(0, f1 - 1), f2 = Math.min(n, f1 + 1), f3 = Math.min(n, f1 + 2);
    const o = f => f * FS + k * PO, idx = F[o(f1) + 3];
    const same = F[o(f0) + 3] === idx && F[o(f2) + 3] === idx && F[o(f3) + 3] === idx;
    const comp = j => same ? cr(F[o(f0) + j], F[o(f1) + j], F[o(f2) + j], F[o(f3) + j], a) : lerp(F[o(f1) + j], F[o(f2) + j], F[o(f2) + 3] === idx ? a : 0);
    const der = j => same ? crd(F[o(f0) + j], F[o(f1) + j], F[o(f2) + j], F[o(f3) + j], a) * 10 : 0;
    const act = F[o(f1) + 6], actT = F[o(f1) + 7] + (F[o(f2) + 6] === act ? (F[o(f2) + 7] - F[o(f1) + 7]) * a : 0);
    return { idx, x: comp(0), y: comp(1), z: Math.max(0, comp(2)), vx: der(0), vy: der(1), vz: der(2), face: F[o(f1) + 5] + angDiff(F[o(f1) + 5], F[o(f2) + 5]) * a, act, actT, fl: F[o(f1) + 4] };
  }
  function sampleBall(tick) {
    const F = G.frames, [f1, a] = fidx(tick), n = G.nFrames - 1;
    const f0 = Math.max(0, f1 - 1), f2 = Math.min(n, f1 + 1), f3 = Math.min(n, f1 + 2), o = f => f * FS + BO;
    const mode = F[o(f1) + 4], smooth = F[o(f0) + 4] === mode && F[o(f2) + 4] === mode && F[o(f3) + 4] === mode;
    const comp = j => smooth ? cr(F[o(f0) + j], F[o(f1) + j], F[o(f2) + j], F[o(f3) + j], a) : lerp(F[o(f1) + j], F[o(f2) + j], a);
    return { x: comp(0), y: comp(1), z: comp(2), holder: F[o(f1) + 3], mode, vx: (F[o(f2)] - F[o(f1)]) * 10, vy: (F[o(f2) + 1] - F[o(f1) + 1]) * 10, vz: (F[o(f2) + 2] - F[o(f1) + 2]) * 10 };
  }
  function meta(tick) { const [f1] = fidx(tick), o = f1 * FS + MO, F = G.frames; return { clock: F[o], shot: F[o + 1], per: F[o + 2], s0: F[o + 3], s1: F[o + 4], off: F[o + 5], phase: F[o + 6] }; }
  const attRight = (off, per) => ((off === 0) !== (per >= 3));

  // ---------- refs and crowd energy: pure functions of the tick ----------
  function refTargets(tick) {
    const m = meta(tick), b = sampleBall(tick), right = attRight(m.off, m.per), hx = right ? 88.75 : 5.25, d = right ? -1 : 1, base_ = right ? 96.2 : -2.2;
    return [{ x: base_, y: clamp(b.y, 14, 36) }, { x: hx + d * 31, y: 52.2 }, { x: hx + d * 23, y: -2.2 }];
  }
  function refPos(tick, i) { let x = 0, y = 0, n = 0; for (let k = 0; k <= 36; k += 6) { const t = refTargets(Math.max(0, tick - k))[i]; const w = 1 - k / 48; x += t.x * w; y += t.y * w; n += w; } return { x: x / n, y: y / n }; }
  function refSignal(tick) {
    let s = null;
    recent(tick, 34, (e, age) => {
      if (s) return;
      if (e.type === "foul" || (e.type === "tackle" && e.result === "late")) s = { who: 0, kind: "fist", age };
      else if (e.type === "timeout") s = { who: 2, kind: "T", age };
      else if (e.type === "fga" && e.made && e.val >= 3) s = { who: 1, kind: e.val === 4 ? "four" : "three", age };
      else if (e.type === "tackle" && e.result === "down") s = { who: 0, kind: "point", age };
      else if (e.type === "violation") s = { who: 0, kind: "fist", age };
    });
    return s;
  }
  function excitement(tick) {
    const ex = [0, 0];
    recent(tick, 120, (e, age) => {
      const decay = Math.exp(-age / 40); let w = 0, t = e.team;
      if (e.type === "fga" && e.made) w = e.dunk || e.val === 4 ? 1 : e.val === 3 ? 0.6 : 0.35;
      else if (e.type === "fga" && e.blk >= 0) { w = 0.8; t = 1 - e.team; }
      else if (e.type === "tackle" && e.result === "down") w = 0.9;
      else if (e.type === "ft" && e.made) w = 0.15;
      else if (e.type === "period_end") { w = 0.6; t = -1; }
      if (!w) return;
      if (t === 0 || t === 1) ex[t] = Math.max(ex[t], w * decay); else { ex[0] = Math.max(ex[0], w * decay); ex[1] = Math.max(ex[1], w * decay * 0.5); }
    });
    return ex;
  }

  // ---------- cameras ----------
  const cam = { pos: new V3(47, 40, 110), look: new V3(47, 2, 25), fov: 30, init: false };
  const dir = { shot: null, since: 0, ftShot: 0, lastPhase: -1, phaseStart: 0, cut: false };
  const free = { yaw: 0.6, pitch: 0.35, dist: 46, target: new V3(47, 4, 25) };
  let userCam = "auto";
  const HANDHELD = { low: 1, baseline: 1, iso: 1, rail: 0.7, huddle: 1, crowd: 0.8, ft: 0.6, reverse: 0.8, rim: 0.3, main: 0.15, endzone: 0.2, lineup: 0.35, dance: 0.5 };
  function rig(shot, s) {
    const P = new V3(), L = new V3(); let fov = 30;
    const { bx, bz, bvx, right, hx, minX, maxX, foc, portrait } = s, din = right ? -1 : 1;
    switch (shot) {
      case "main": {
        const lead = clamp(bx + bvx * 0.5, minX, maxX), cx = clamp((minX + maxX) / 2 * 0.4 + lead * 0.6, 16, 78);
        const w = clamp(2 * Math.max(cx - minX, maxX - cx) + 14, 36, 72);
        P.set(cx, 38, 102); L.set(cx, 0, 28 + (bz - 25) * 0.2);
        const dist = P.distanceTo(L), hf = 2 * Math.atan(w / 2 / dist);
        fov = clamp(2 * Math.atan(Math.tan(hf / 2) / s.aspect) * 180 / PI, 16, portrait ? 62 : 28); break;
      }
      case "endzone": { const ex = right ? 94 + 26 : -26; P.set(ex, 34, 31 + (bz - 25) * 0.35); L.set(right ? Math.max(bx, 52) - 4 : Math.min(bx, 42) + 4, 2, 25 + (bz - 25) * 0.6); fov = portrait ? 54 : 40; break; }
      case "baseline": { P.set(right ? 95.6 : -1.6, 4.2, bz > 25 ? 13 : 37); L.set(lerp(bx, hx, 0.4), 6.5, lerp(bz, 25, 0.4)); fov = portrait ? 70 : 52; break; }
      case "rail": { P.set(bx - bvx * 0.7, 9, 58); L.set(bx + bvx * 0.5, 4, bz); fov = portrait ? 54 : 42; break; }
      case "low": { P.set(bx - din * 6, 6.2, 58.5); L.set(bx, 4.8, bz); fov = portrait ? 46 : 36; break; }
      case "reverse": { P.set(bx, 8, -22); L.set(bx, 4, bz); fov = portrait ? 58 : 34; break; }
      case "sky": { P.set(bx - din * 30, 36, bz + 4); L.set(bx + din * 10, 0, bz); fov = portrait ? 64 : 46; break; }
      case "iso": { const a = (foc.face || 0) + 0.9, r = 17; P.set(foc.x + Math.cos(a) * r, 6.5, foc.y + Math.sin(a) * r); L.set(foc.x, 4.5 + foc.z, foc.y); fov = portrait ? 52 : 34; break; }
      case "rim": { P.set(hx + din * 2.5, 18, 27.5); L.set(hx + din * 7, 0, 25); fov = portrait ? 80 : 70; break; }
      case "ft": { const fx = hx + din * 14.5; if (s.ftAlt) { P.set(hx - din * 3, 9, 20); L.set(fx, 5.5, 25); fov = portrait ? 46 : 28; } else { P.set(fx + din * 17, 14, 28); L.set(hx, 8.5, 25); fov = portrait ? 52 : 30; } break; }
      case "huddle": { const hcx = 47 + (s.hudSide ? 9 : -9); P.set(hcx + (s.hudSide ? -5 : 5), 12, 20); L.set(hcx, 2.5, -1.2); fov = portrait ? 62 : 44; break; }
      case "crowd": { const t = s.rt / 7, x = 47 + Math.sin(t) * 30; P.set(x, 10, 34); L.set(x + 12, 15, -30); fov = portrait ? 56 : 34; break; }
      case "orbit": { const t = s.rt / 10; P.set(47 + Math.cos(t) * 95, 55, 25 + Math.sin(t) * 75); L.set(47, 4, 25); fov = portrait ? 62 : 40; break; }
      case "spin": { const a = (foc.face || 0) + 0.5 + s.spinT * 0.95, r = 14; P.set(foc.x + Math.cos(a) * r, 7.6 + foc.z * 0.6, foc.y + Math.sin(a) * r); L.set(foc.x, 4.2 + foc.z, foc.y); fov = portrait ? 52 : 32; break; }
      case "lineup": { const a = foc.face || 0, r = 10.5 - 3 * sstep(s.spinT / 1.8), hh = foc.h || 6.5; P.set(foc.x + Math.cos(a) * r, hh * 0.8, foc.y + Math.sin(a) * r); L.set(foc.x, hh * 0.72, foc.y); fov = portrait ? 40 : 24; break; }
      case "chase": { const a = s.chaseA || 0; P.set(foc.x - Math.cos(a) * 15, 8.5 + foc.z * 0.5, foc.y - Math.sin(a) * 15); L.set(foc.x + Math.cos(a) * 7, 3.5, foc.y + Math.sin(a) * 7); fov = portrait ? 62 : 42; break; }
      case "bench": { const bxx = 47 + (s.benchT ? 15 : -15); P.set(bxx + (s.benchT ? -7 : 7), 7.5, 10); L.set(bxx, 3.4, -7); fov = portrait ? 56 : 36; break; }
      case "dance": { if (portrait) { P.set(47, 6.5, 47); L.set(47, 4.0, 25); fov = 50; } else { P.set(47, 8.5, 59); L.set(47, 4.2, 25); fov = 30; } break; }
      case "intro": { const t = s.rt / 7; P.set(47 + Math.cos(t) * 58, 18 + Math.sin(t * 0.7) * 7, 25 + Math.sin(t) * 46); L.set(47, 6, 25); fov = portrait ? 62 : 38; break; }
      case "overhead": { P.set(47, 125, 25.1 + (portrait ? 0 : 32)); L.set(47, 0, 25); fov = portrait ? 74 : 40; break; }
      case "free": { const d = free.dist; P.set(free.target.x + Math.cos(free.yaw) * Math.cos(free.pitch) * d, free.target.y + Math.sin(free.pitch) * d, free.target.z + Math.sin(free.yaw) * Math.cos(free.pitch) * d); L.copy(free.target); fov = portrait ? 56 : 38; break; }
    }
    if (portrait && (shot === "low" || shot === "rail" || shot === "baseline" || shot === "iso" || shot === "reverse")) { P.y += 3; L.y -= 1.5; }
    return { P, L, fov };
  }
  function direct(s, view, rdt) {
    let shot;
    if (view.shot) shot = view.shot;
    else if (userCam === "free") shot = "free";
    else if (userCam === "player") shot = s.focFound ? "chase" : (s.portrait ? "endzone" : "main");
    else if (userCam !== "auto") shot = userCam === "sideline" ? "main" : userCam === "endline" ? "endzone" : userCam === "follow" ? "rail" : userCam;
    else {
      const main = s.portrait ? "endzone" : "main";
      let want = main;
      if (s.phase === 4) want = s.phaseT < 3 ? "huddle" : s.danceOn ? "dance" : "crowd";
      else if (s.phase === 2) want = "ft";
      else if (s.reaction >= 0 && s.phase !== 0) want = "bench";
      else if (s.drive) want = "baseline";
      else if (s.fastbreak) want = s.portrait ? "endzone" : "rail";
      const cur = dir.shot, minHold = (cur === "baseline" || cur === "rail") ? 1.4 : 1.8;
      if (cur === null || want === cur || dir.forced) shot = want; // coming out of a replay or a forced angle: cut straight back
      else if (want === "ft" || want === "huddle" || want === "dance" || want === "bench" || cur === "ft" || cur === "huddle" || cur === "crowd" || cur === "dance" || cur === "intro" || cur === "orbit") shot = want;
      else if (dir.since > minHold) shot = want;
      else shot = cur;
    }
    dir.forced = !!view.shot || userCam !== "auto";
    if (shot !== dir.shot) { dir.shot = shot; dir.since = 0; dir.cut = true; } else dir.since += rdt;
    return shot;
  }

  // ---------- render ----------
  let pinned = null, ballZ1 = null, ballZ2 = null; const _bT = new THREE.Matrix4(), _bS = new THREE.Matrix4(), _bR = new THREE.Matrix4(); const prevVP = new THREE.Matrix4(), curVP = new THREE.Matrix4(), prevCamPos = new V3();
  let lastT = performance.now(), lastTick = -1, vt = 0, showK = 0, replayK = 0, finT0 = -1, frameNo = 0;
  const tmpV = new V3(), tmpV2 = new V3(), up = new V3(0, 1, 0), qSpin = new THREE.Quaternion(), tA = new V3(), tB = new V3(), tC = new V3(), tD = new V3(), tF = new V3(), tL = new V3();
  function tackleTarget(tick, idx) { // who this player is tackling: the event lands at the end of the lunge
    let on = null; recent(tick, 24, e => { if (on === null && e.type === "tackle" && e.pid === idx) on = e.on; });
    if (on === null) for (let i = evIndex(tick); i < EV.length && EVT[i] < tick + 12; i++) if (EV[i].type === "tackle" && EV[i].pid === idx) { on = EV[i].on; break; }
    return on;
  }
  let cueFn = null; const cues = [];
  function render(tick, view) {
    view = view || {}; cues.length = 0;
    const now = performance.now(), rdt = Math.min(0.1, (now - lastT) / 1000); lastT = now; frameNo++;
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (!w || !h) return null;
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) { renderer.setSize(w, h, false); camera.aspect = w / h; }
    if (!G) { renderer.render(scene, camera); return null; }
    const jump = lastTick < 0 || Math.abs(tick - lastTick) > 12;
    const gdt = jump ? 0 : clamp((tick - lastTick) / 20, 0, 0.25); lastTick = tick;
    const adt = gdt || (view.ambient ? rdt : 0);
    vt += adt;
    const mt = meta(tick), right = view.side !== undefined ? view.side === 1 : attRight(mt.off, mt.per), hx = right ? 88.75 : 5.25;
    const fin = tick >= G.ticks - 3, homeWon = mt.s0 > mt.s1;
    if (fin && finT0 < 0) finT0 = vt; if (!fin) finT0 = -1;
    const finT = fin ? vt - finT0 : 0;
    const b = sampleBall(tick);
    const seen = new Set(), pos = []; let holder = null, holderS = null, minX = 1e9, maxX = -1e9;
    for (let k = 0; k < 10; k++) pos.push(samplePlayer(k, tick));
    const sweat = clamp(tick / G.ticks * 1.4, 0, 1);
    for (let k = 0; k < 10; k++) {
      const s = pos[k], m = model(s.idx); seen.add(s.idx);
      const sp = Math.hypot(s.vx, s.vy), th = s.face, fwd = s.vx * Math.cos(th) + s.vy * Math.sin(th), left = s.vx * Math.sin(th) - s.vy * Math.cos(th);
      const turn = m.lastFace !== undefined && gdt > 0 ? angDiff(m.lastFace, th) / gdt : 0; m.lastFace = th;
      m.ph += sp * gdt / (0.92 * m.H) * PI;
      if (jump) { m.P = null; m.lastAct = -1; m.land = 0; m.lean = 0; m.prevZ = s.z; m.lastSp = sp; }
      if (s.act === ACT.DOWN && m.lastAct !== ACT.DOWN) m.fallDir = m.lastAct === ACT.TACKLE ? 1 : -1;
      m.lastAct = s.act;
      if (gdt > 0) {
        if (m.prevZ > 0.5 && s.z < 0.08) m.land = 1;
        m.land = Math.max(0, m.land - gdt * 3.2); m.prevZ = s.z;
        const acc = (sp - m.lastSp) / gdt; m.lastSp = sp; m.lean = lerp(m.lean, clamp(acc * 0.012, -0.12, 0.18), 1 - Math.exp(-gdt * 6));
      }
      const isHolder = b.holder === s.idx;
      if (gdt > 0) { // sneaker squeaks on hard cuts and stops, thuds on landings
        const hd = Math.atan2(s.vy, s.vx), dh = m.vh === undefined ? 0 : Math.abs(angDiff(m.vh, hd)) / gdt; m.vh = hd;
        if (vt - (m.sqT || -9) > 0.5 && ((sp > 7 && dh > 3.2) || ((m.sp2 === undefined ? sp : m.sp2) - sp) / gdt > 24) && s.z < 0.1) { m.sqT = vt; cues.push(["squeak", s.x, 0.1, s.y]); }
        m.sp2 = sp; if (m.land > (m.landPrev || 0) + 0.2) cues.push(["land", s.x, 0.1, s.y]); m.landPrev = m.land;
      }
      if (isHolder) {
        const pd = m.dph;
        m.dph = (m.dph + gdt * (2.1 + sp * 0.07)) % 1;
        if ((s.act === ACT.DRIBBLE || s.act === ACT.CALL || s.act === ACT.POST) && pd < 0.5 && m.dph >= 0.5) cues.push(["dribble", s.x, 0.3, s.y]);
        if (Math.abs(left) > 5 && Math.sign(left) !== m.lastSide && tick - m.lastFlip > 18) { m.hand = -m.hand; m.crossT = 0.22; m.lastFlip = tick; }
        m.lastSide = Math.sign(left) || m.lastSide; m.crossT = Math.max(0, m.crossT - gdt);
      }
      const lookYaw = angDiff(th, Math.atan2(b.y - s.y, b.x - s.x)), lookPitch = Math.atan2(b.z - 5.5, Math.hypot(b.x - s.x, b.y - s.y) + 0.5);
      const team = k < 5 ? 0 : 1, defending = team !== mt.off, won = (team === 0) === homeWon;
      let highfive = false;
      if (s.act === ACT.NONE && mt.phase !== 0) for (let j = 0; j < 10; j++) { const o = pos[j]; if (j !== k && (j < 5 ? 0 : 1) === team && o.act === ACT.CELEBRATE && Math.hypot(o.x - s.x, o.y - s.y) < 5) highfive = true; }
      if (jump || m.fat === undefined) m.fat = 0.1 + 0.05 * mt.per; else if (gdt > 0) m.fat = clamp(m.fat + gdt * (sp > 11 ? 0.04 : sp > 5 ? 0.012 : -0.022), 0, 1);
      if (m.ftWin === undefined) { const u = s.idx * 3.7 + G.ticks * 0.01; m.ftWin = 0.5 + Math.floor(hash(u) * 4) * 0.33; m.ftSpin = hash(u + 1.3) < 0.45; }
      let bump = false; m.bumpY = 0; m.bumpYaw = 0; // chest bumps between celebrating teammates
      if (s.act === ACT.CELEBRATE && !fin) for (let j = 0; j < 10; j++) { const o = pos[j]; if (j === k || (j < 5 ? 0 : 1) !== team || o.act !== ACT.CELEBRATE || Math.hypot(o.x - s.x, o.y - s.y) > 3.6 || hash(Math.min(k, j) * 7 + Math.max(k, j) * 13 + Math.floor(tick / 80)) > 0.6) continue;
        const u = clamp((Math.min(s.actT, o.actT) - 0.15) / 0.6, 0, 1); if (u > 0 && u < 1) { bump = true; m.bumpY = Math.sin(PI * u) * 1.5; m.bumpYaw = -angDiff(th, Math.atan2(o.y - s.y, o.x - s.x)) * Math.min(1, u * 5); } break; }
      const ctx = { bump, gt: tick / 20, uid: s.idx, ftWin: m.ftWin, ftSpin: m.ftSpin, tired: m.fat, act: s.act, actT: s.actT, sp, fwd, left, turn, z: s.z, vz: s.vz, defending, holding: isHolder, ballMode: b.mode, dribble: { ph: m.dph, hand: m.hand, cross: m.crossT },
        lookYaw: isHolder ? 0 : -lookYaw, lookPitch, ftWatch: (mt.phase === 2 && !isHolder && s.act !== ACT.FT) || (fin && !won), idle: mt.phase === 1, highfive, land: m.land, lean: m.lean };
      if (fin && won) { ctx.act = ACT.CELEBRATE; ctx.actT = finT + m.ph; ctx.sp = 0; }
      ctx.blink = ((vt + m.ph * 3.1) % 3.9) < 0.12;
      if (s.act === ACT.DUNK) { // pick a dunk from the moment it started, so replays show the same one
        const start = Math.round(tick - s.actT * 20); m.dunkStyle = Math.floor(hash(s.idx * 13 + start * 7) * 5); ctx.dunkStyle = m.dunkStyle;
        const ap = clamp((s.actT - 0.36) / 0.55, 0, 1); m.extraYaw = (m.dunkStyle === 3 ? TAU : m.dunkStyle === 4 ? PI : 0) * sstep(ap);
      } else if (m.extraYaw) { const goal = m.extraYaw > PI * 1.2 ? TAU : 0; m.extraYaw = lerp(m.extraYaw, goal, 1 - Math.exp(-(gdt || 0) * 5)); if (Math.abs(m.extraYaw - goal) < 0.02) m.extraYaw = 0; }
      { // what kind of shot or pass this is, decided once when the action starts (so replays match)
        const aStart = Math.round(tick - s.actT * 20), shooting = s.act === ACT.SHOOT || s.act === ACT.LAYUP || s.act === ACT.FT;
        if (shooting && m.styleKey !== aStart * 32 + s.act) {
          m.styleKey = aStart * 32 + s.act; m.shotStyle = 0;
          const id = G.roster[s.idx] ? G.roster[s.idx].id : s.idx;
          if (s.act === ACT.FT) m.shotStyle = era < 1980 && hash(id * 2.71 + 9) < 0.14 ? "under" : 0;
          else if (s.act === ACT.LAYUP) m.shotStyle = hash(aStart * 0.13 + id) < 0.4 ? "roll" : 0;
          else {
            const e = shotEvent(s.idx, aStart), rim = s.x < 47 ? BB.C.HX[0] : BB.C.HX[1], dx = rim - s.x, dy = 25 - s.y, dl = Math.hypot(dx, dy) || 1, toward = (s.vx * dx + s.vy * dy) / dl;
            if (e && e.hook) m.shotStyle = "hook";
            else if (era < 1960 && e && e.d >= 12 && hash(id * 7.31 + 3) < (era < 1957 ? 0.7 : 0.45)) m.shotStyle = "set2";
            else if (toward < -3) m.shotStyle = "fade";
            else if (e && e.d >= 5 && e.d <= 15 && toward > 7) m.shotStyle = "runner";
          }
        }
        if (s.act === ACT.PASS && m.passKey !== aStart) { m.passKey = aStart; m.passStyle = passKind(s.idx, aStart); }
        if (m.prevAct2 === ACT.REBOUND && s.act !== ACT.REBOUND && isHolder && !jump) m.chinTo = tick + 15; // secure it before the first dribble
        m.prevAct2 = s.act; m.chin = ctx.chin = isHolder && s.act === ACT.DRIBBLE && m.chinTo > tick && m.chinTo - tick <= 15;
        ctx.shotStyle = shooting ? m.shotStyle : 0; ctx.passStyle = s.act === ACT.PASS ? m.passStyle : 0;
      }
      const grounded = s.z < 0.08 && ctx.act !== ACT.DOWN && ctx.act !== ACT.GETUP && ctx.act !== ACT.TACKLE && !bump;
      { // eyes on the ball; shooters on the rim; ball handlers scan the floor
        const A = ctx.act, rimX = s.x < 47 ? BB.C.HX[0] : BB.C.HX[1]; if (!m.look) m.look = new V3();
        if (isHolder && (A === ACT.SHOOT || A === ACT.LAYUP || A === ACT.DUNK || (A === ACT.FT && b.mode === 5))) { m.look.set(rimX, 10, 25); m.lookW = A === ACT.DUNK ? 0.5 : 0.9; }
        else if (isHolder) { m.look.set(rimX, 7.5, 25 + Math.sin(vt * 0.9 + m.ph) * 9); m.lookW = A === ACT.CALL ? 0.15 : 0.35; }
        else { m.look.set(b.x, b.z, b.y); m.lookW = 0.9; }
        if (A === ACT.DOWN || A === ACT.GETUP || A === ACT.TACKLE || A === ACT.CELEBRATE || A === ACT.HUDDLE || A === ACT.STUMBLE || (fin && won)) m.lookW = 0;
        else if (A === ACT.BOXOUT || A === ACT.SCREEN) m.lookW = 0.55;
      }
      applyPose(m, poseFor(m, ctx), fin ? adt : gdt, grounded, () => { m.root.position.set(s.x, s.z + m.bumpY + (fin && won && m.celeb % 2 === 0 ? Math.max(0, Math.sin(finT * 6.5 + m.ph)) * 0.9 : 0), s.y); m.root.rotation.y = PI / 2 - th + (m.extraYaw || 0) + m.bumpYaw; });
      if (quality !== "low" && !fin) footLock(m, grounded && ctx.act !== ACT.TACKLE && ctx.act !== ACT.DOWN, gdt, jump);
      m.flap.uTime.value = vt; m.flap.uFlap.value = (Math.min(1, sp / 16) * 0.035 + (s.z > 0.3 ? 0.03 : 0)) * m.bag;
      m.root.visible = true;
      m.bodyMat.roughness = 0.6 - 0.22 * sweat;
      if (isHolder) { holder = m; holderS = s; }
      if (s.x > -3 && s.x < 97) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); }
      const bs = m.H / 6.5 * (1.6 - Math.min(0.9, s.z * 0.1)); blobs[k].position.set(s.x, 0.02, s.y); blobs[k].scale.set(bs * 2.0, bs * 2.0, 1); blobs[k].material.opacity = blobMat.opacity;
    }
    for (const k in models) if (!seen.has(+k)) models[k].root.visible = false;
    // ball: in the hands while held; the renderer owns the dribble so hand and ball stay in sync
    let bx = b.x, by = b.y, bz = b.z;
    if (holder) {
      const yaw = holder.root.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), lx = Math.cos(yaw), lz = -Math.sin(yaw);
      const act = holderS.act;
      const dribbling = !(holder && holder.chin) && (act === ACT.DRIBBLE || act === ACT.CALL || act === ACT.POST) || (act === ACT.FT && b.mode !== 5 && holderS.actT % 3.2 < (holder.ftWin || 1.3));
      if (dribbling) {
        const H = holder.H, top = H * 0.4, u = Math.abs(Math.cos(PI * holder.dph)), hgt = 0.39 + (top - 0.39) * Math.pow(u, 1.25);
        const side = (holder.crossT > 0 ? lerp(-holder.hand, holder.hand, 1 - holder.crossT / 0.22) : holder.hand) * 0.75 * (act === ACT.POST ? 1.3 : 1);
        const fwdD = act === ACT.POST ? -0.4 : 0.85 + Math.min(1.2, Math.hypot(holderS.vx, holderS.vy) * 0.05);
        const p = holder.root.position;
        bx = p.x + fx * fwdD + lx * side; by = p.z + fz * fwdD + lz * side; bz = holder.crossT > 0 ? Math.min(hgt, 1.6) : hgt;
      } else {
        holder.arms[0].hand.getWorldPosition(tmpV); holder.arms[1].hand.getWorldPosition(tmpV2);
        const one = act === ACT.LAYUP || (act === ACT.DUNK && holderS.z > 0.2);
        const c = one ? tmpV2 : tmpV.add(tmpV2).multiplyScalar(0.5);
        bx = c.x + fx * 0.32; by = c.z + fz * 0.32; bz = c.y + (one ? 0.32 : 0.06);
      }
    }
    ball.position.set(bx, Math.max(0.39, bz), by);
    if (quality !== "low") for (let k = 0; k < 10; k++) {
      const s = pos[k], m = models[s.idx]; if (!m) continue;
      const yaw = m.root.rotation.y, f = tF.set(Math.sin(yaw), 0, Math.cos(yaw)), l = tL.set(Math.cos(yaw), 0, -Math.sin(yaw)), act = s.act; let did = false;
      const two = (w, back) => { tA.copy(ball.position).addScaledVector(l, 0.37).addScaledVector(f, -back); tB.copy(ball.position).addScaledVector(l, -0.37).addScaledVector(f, -back); armIK(m, 0, tA, w); armIK(m, 1, tB, w); did = true; };
      if (m === holder) {
        const dribbling = !(holder && holder.chin) && (act === ACT.DRIBBLE || act === ACT.CALL || act === ACT.POST) || (act === ACT.FT && b.mode !== 5 && s.actT % 3.2 < (m.ftWin || 1.3));
        if (dribbling) { const w = sstep((ball.position.y - (m.H * 0.4 - 0.9)) / 0.6) * 0.9; if (w > 0.01) { armIK(m, m.hand > 0 ? 0 : 1, tA.copy(ball.position).addScaledVector(up, 0.36).addScaledVector(f, -0.05), w); did = true; } }
        else if (act === ACT.LAYUP || (act === ACT.DUNK && s.z > 0.2)) { armIK(m, 1, tA.copy(ball.position).addScaledVector(up, -0.33).addScaledVector(f, -0.08), 1); if (act === ACT.DUNK && m.celeb % 2) armIK(m, 0, tB.copy(ball.position).addScaledVector(l, 0.36), 0.9); did = true; }
        else if ((act === ACT.SHOOT || act === ACT.FT) && (s.z > 0.15 || b.mode === 5)) { armIK(m, 1, tA.copy(ball.position).addScaledVector(up, -0.3).addScaledVector(f, -0.16), 1); armIK(m, 0, tB.copy(ball.position).addScaledVector(l, 0.36), 0.9); did = true; }
        else two(1, 0.06);
      } else if (!holder && (act === ACT.CATCH || act === ACT.REBOUND || act === ACT.CONTEST || act === ACT.SWAT)) {
        m.chest.getWorldPosition(tC); const dd = tC.distanceTo(ball.position), w = sstep((3.6 - dd) / 1.6);
        if (w > 0.01) { if (act === ACT.CONTEST || act === ACT.SWAT) { armIK(m, 1, tB.copy(ball.position).addScaledVector(tD.subVectors(ball.position, tC).normalize(), -0.36), w); did = true; } else two(w, 0.2); }
      } else if (act === ACT.TACKLE) {
        const on = tackleTarget(tick, s.idx), tm = on !== null ? models[on] : null;
        if (tm && tm.root.visible) { tm.hips.getWorldPosition(tA); m.hips.getWorldPosition(tB); const w = sstep((4.5 - tA.distanceTo(tB)) / 2); if (w > 0.01) { const ty = tm.root.rotation.y; tD.set(Math.cos(ty), 0, -Math.sin(ty)); tB.copy(tA).addScaledVector(tD, 0.55); tA.addScaledVector(tD, -0.55); armIK(m, 0, tB, w); armIK(m, 1, tA, w); did = true; } }
      }
      if (did) m.root.updateMatrixWorld(true);
    }
    if (gdt > 0) { // spin: backspin in flight, topspin rolling or dribbling
      const vx = b.vx, vz = b.vy, sp = Math.hypot(vx, vz);
      if (sp > 0.5 || holder) {
        tmpV.set(vx, 0, vz).normalize(); const ax = new V3().crossVectors(up, tmpV); if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0); ax.normalize();
        const rate = b.mode === 2 || b.mode === 5 ? -15 : b.mode === 1 ? -9 : holder ? 7 : sp / 0.39;
        qSpin.setFromAxisAngle(ax, rate * gdt); ball.quaternion.premultiply(qSpin);
      }
    }
    if (gdt > 0 && !holder) { // loose ball and rebound bounces
      if (ballZ1 !== null && ballZ2 !== null && ballZ1 < 1.1 && ballZ1 <= ballZ2 && ballZ1 < bz) cues.push(["bounce", bx, 0.3, by]);
      ballZ2 = ballZ1; ballZ1 = bz;
    } else if (gdt > 0) { ballZ1 = ballZ2 = null; }
    { // squash on contact with the floor (in world space, under the spin)
      const sq = clamp((0.47 - ball.position.y) / 0.08, 0, 1);
      ball.matrixAutoUpdate = false;
      if (sq > 0) { const sy = 1 - 0.2 * sq, sxz = 1 + 0.1 * sq; _bT.makeTranslation(ball.position.x, 0.39 * sy, ball.position.z); _bS.makeScale(sxz, sy, sxz); _bR.makeRotationFromQuaternion(ball.quaternion); ball.matrix.copy(_bT).multiply(_bS).multiply(_bR); }
      else ball.updateMatrix();
      ball.matrixWorldNeedsUpdate = true;
    }
    blobs[10].position.set(bx, 0.03, by); const bsz = 0.9 * (1 - Math.min(0.7, bz * 0.05)); blobs[10].scale.set(bsz, bsz, 1);
    const slow = (view.rate || 1) < 0.7;
    ghosts.forEach((g, i) => { if (!slow || holder) { g.material.opacity = 0; return; } const q = sampleBall(tick - (i + 1) * 0.9); g.position.set(q.x, Math.max(0.39, q.z), q.y); g.material.opacity = 0.3 * (1 - i / ghosts.length); g.scale.setScalar(1 - i * 0.07); });
    // hoops: cloth nets react to the ball; rim shake and the backboard strip flash on makes
    for (const hp of hoops) { hp.shake.rotation.set(0, 0, 0); hp.rimG.rotation.z = 0; hp.strip.material.color.copy(glow("#ff3030", 0.2)); }
    recent(tick, 24, (e, age) => {
      if (e.type !== "fga" || !e.made) return;
      const side = attRight(e.team, e.per) ? 1 : 0, hp = hoops[side];
      if (age < 20) hp.strip.material.color.copy(glow(G.colors[e.team], 3 * (1 - age / 20)));
      if (e.dunk) { const sk = Math.exp(-age / 5) * Math.sin(age * 1.6) * 0.05; hp.shake.rotation.z = sk * (side ? 1 : -1); hp.rimG.rotation.z = sk * 2.2 * (side ? 1 : -1); }
    });
    if (jump) for (const hp of hoops) hp.net.reset();
    else if (gdt > 0) { const nsub = Math.min(6, Math.ceil(gdt / (1 / 90))); for (let i = 0; i < nsub; i++) for (const hp of hoops) hp.net.step(gdt / nsub, bx, Math.max(0.39, bz), by); for (const hp of hoops) hp.net.draw(); }
    // refs follow the play and signal calls
    const sig = refSignal(tick);
    refs.forEach((r, i) => {
      const tip = mt.phase === 3 && i === 1, p = tip ? { x: 47, y: 27.4 } : refPos(tick, i), q = tip ? p : refPos(Math.max(0, tick - 2), i), vx = (p.x - q.x) * 10, vy = (p.y - q.y) * 10, sp = Math.hypot(vx, vy);
      const face = Math.atan2(b.y - p.y, b.x - p.x);
      r.m.ph += sp * gdt / (0.92 * r.m.H) * PI;
      const t = locomotion(r.m, { sp, fwd: vx * Math.cos(face) + vy * Math.sin(face), left: vx * Math.sin(face) - vy * Math.cos(face), turn: 0, defending: false });
      if (sig && sig.who === i) {
        const k = sstep(sig.age / 6);
        if (sig.kind === "fist") { t.aRx = -3.05 * k; t.eR = -0.2; }
        else if (sig.kind === "T") { t.aRx = -2.9 * k; t.eR = -0.1; t.aLx = -1.6 * k; t.aLz = -0.9 * k; t.eL = -1.4 * k; }
        else if (sig.kind === "three" || sig.kind === "four") { t.aRx = t.aLx = -3.0 * k; t.eL = t.eR = -0.05; t.aLz = 0.25; t.aRz = -0.25; if (sig.kind === "four") { t.aLz = 0.4 + Math.sin(sig.age * 0.6) * 0.25; t.aRz = -0.4 - Math.sin(sig.age * 0.6) * 0.25; } }
        else if (sig.kind === "point") { t.aRx = -1.6 * k; t.eR = -0.05; t.aRz = -0.2; }
      }
      if (tip) { t.aRx = -2.95; t.eR = -0.15; t.wR = 0.4; t.aLx = -0.4; t.headX = -0.4; }
      if (jump) r.m.P = null;
      if (!r.m.look) r.m.look = new V3(); r.m.look.set(b.x, b.z, b.y); r.m.lookW = sig && sig.kind ? 0.3 : 0.8;
      applyPose(r.m, t, gdt, true, () => { r.m.root.position.set(p.x, 0, p.y); r.m.root.rotation.y = PI / 2 - face; });
    });
    // coaches pace, react, and run the huddle
    const ex = excitement(tick); if (fin) { ex[homeWon ? 0 : 1] = 1; }
    coaches.forEach(c => {
      const t = c.t, sgn = t === 0 ? -1 : 1, gt = tick / 20, huddle = mt.phase === 4;
      const x = huddle ? 47 + sgn * 9 + 2.6 * (t ? -1 : 1) : 47 + sgn * 15 + Math.sin(gt * 0.35 + t) * 3.5, y = huddle ? -0.3 : -3.2;
      const vx = huddle ? 0 : Math.cos(gt * 0.35 + t) * 1.2;
      const face = huddle ? Math.atan2(-1.2 - y, 47 + sgn * 9 - x) : Math.atan2(b.y - y, b.x - x);
      c.m.ph += Math.abs(vx) * gdt / (0.92 * c.m.H) * PI;
      const pose = locomotion(c.m, { sp: Math.abs(vx), fwd: 0, left: Math.abs(vx), turn: 0, defending: false });
      if (!huddle && Math.abs(vx) < 1.0) { pose.aLx = pose.aRx = -0.9; pose.aLz = -0.6; pose.aRz = 0.6; pose.eL = pose.eR = -1.9; }
      const mine = ex[t], theirs = ex[1 - t];
      if (mine > 0.45) { pose.aRx = -2.8; pose.eR = -1.0 - Math.sin(gt * 10 + vt * 6) * 0.4; pose.jaw = 0.3; pose.brow = 0.7; pose.cR = 1.5; }
      else if (theirs > 0.6) { pose.aLx = pose.aRx = -2.5; pose.eL = pose.eR = -2.4; pose.aLz = 0.6; pose.aRz = -0.6; pose.jaw = 0.15; pose.brow = -0.8; }
      pose.lid = ((vt + t * 1.7) % 4.4) < 0.12 ? 0.9 : -0.75;
      if (huddle) { pose.aRx = -1.3; pose.eR = -1.4; pose.aLx = -0.9; pose.eL = -1.2; pose.spineX = 0.2; }
      if (jump) c.m.P = null;
      if (!c.m.look) c.m.look = new V3(); c.m.look.set(b.x, b.z, b.y); c.m.lookW = huddle ? 0 : 0.7;
      applyPose(c.m, pose, fin ? adt : gdt, true, () => { c.m.root.position.set(x, 0, y); c.m.root.rotation.y = PI / 2 - face; });
    });
    for (const bn of banners) bn.rotation.z = Math.sin(vt * 0.35 + bn.userData.ph) * 0.02;
    // light show before tip-off
    showK += ((view.shot === "intro" ? 1 : 0) - showK) * (1 - Math.exp(-rdt * (view.shot === "intro" ? 1.8 : 3.5)));
    const dim = 1 - 0.8 * showK; hemi.intensity = BASE.hemi * dim; key.intensity = BASE.key * dim; fill.intensity = BASE.fill * dim; rimL.intensity = BASE.rim * dim;
    const hc = col(teams[0].c1), rtS = now / 1000;
    show.forEach((sh, i) => {
      const vis = showK > 0.01; sh.pool.visible = sh.beam.visible = vis; if (!vis) return;
      const x = 47 + Math.sin(rtS * 0.45 + i * 1.7) * 32, z = 25 + Math.cos(rtS * 0.6 + i * 2.3) * 17, c = i % 2 ? hc : col("#ffffff");
      sh.pool.position.set(x, 0.06, z); sh.pool.material.color.copy(c).multiplyScalar(2.2 * showK);
      sh.beam.position.set(x, 35, z); sh.beam.material.color.copy(c).multiplyScalar(0.16 * showK);
    });
    if (view.shot === "lineup" && view.focus !== undefined && showK > 0.01) { const fp = pos.find(q => q.idx === view.focus); if (fp) { show[0].pool.position.set(fp.x, 0.06, fp.y); show[0].pool.material.color.setRGB(3.2, 3.1, 2.9).multiplyScalar(showK); show[0].beam.position.set(fp.x, 35, fp.y); show[0].beam.material.color.setRGB(0.3, 0.3, 0.28).multiplyScalar(showK); for (let i = 1; i < show.length; i++) { show[i].pool.material.color.multiplyScalar(0.35); show[i].beam.material.color.multiplyScalar(0.35); } } }
    CU.uShow.value = showK;
    // dance team: timeouts (once the huddle forms) and halftime
    let danceOn = !!view.dance;
    if (mt.phase === 4) { let ta = -1; recent(tick, 2400, e => { if (ta < 0 && e.type === "timeout") ta = (tick - e.tk) / 20; }); if (ta > 1.2) danceOn = true; }
    if (danceOn && danceTeam !== teams[0].id) { buildDancers(teams[0]); danceTeam = teams[0].id; }
    if (danceOn && danceT === 0) for (const d of dancers) { d.m.P = null; d.x = undefined; }
    danceT = danceOn ? danceT + (adt || rdt) : 0;
    dancers.forEach(d => {
      d.m.root.visible = danceOn; if (!danceOn) return;
      const i = d.i, form = Math.floor(danceT / 7.6) % 2, row = i < 4 ? 0 : 1, j = i % 4;
      const x = form ? 47 + (j - 1.5) * (row ? 6.2 : 3.8) : 47 + (j - 1.5) * 5.2, z = form ? 25 + (row ? 3.5 : -2.5) + (row ? 1 : -1) * Math.abs(j - 1.5) * 1.3 : 25 + (row ? 3.5 : -2.5);
      const kf = 1 - Math.exp(-(adt || rdt) * 3); d.x = d.x === undefined ? x : lerp(d.x, x, kf); d.z = d.z === undefined ? z : lerp(d.z, z, kf);
      d.m.look = camera.position; d.m.lookW = 0.55; // play to the camera
      applyPose(d.m, dancePose(i, danceT + (row ? 0.12 : 0)), adt || rdt, true, () => { d.m.root.position.set(d.x, 0, d.z); d.m.root.rotation.y = 0; });
    });
    // crowd
    CU.uTime.value = vt; CU.uEx.value.set(ex[0], ex[1]);
    { let wv = 0, wx = 0; for (const [a, z] of waves) if (tick > a && tick < z) { const u = (tick - a) / 20; wv = sstep(u / 2.5) * sstep((z - tick) / 50); wx = -2.4 + u * 0.62; } CU.uWave.value.set(wx, fin ? 0 : wv); }
    // signs go up when the home crowd is fired up (or before tip-off)
    signSeats.forEach((s, i) => {
      const raise = Math.max(sstep((ex[0] - 0.35) * 3), showK * (i % 2 ? 1 : 0)), wv = Math.sin(vt * 3 + s.sph) * 0.25 * raise;
      const rx = -s.oz, rz = s.ox, wd = 3.2, ht = 1.6, cy = s.y + 0.4 + raise * 3.2 - (1 - raise) * 6;
      const cs = Math.cos(wv), sn = Math.sin(wv), pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      pts.forEach(([a, c], k) => { const ox = a * wd / 2 * cs - c * ht / 2 * sn, oy = a * wd / 2 * sn + c * ht / 2 * cs; SP[i * 12 + k * 3] = s.x + rx * ox; SP[i * 12 + k * 3 + 1] = cy + oy; SP[i * 12 + k * 3 + 2] = s.z + rz * ox; });
    });
    signGeo.attributes.position.needsUpdate = true;
    // rubber ripples and sweat: driven by the game clock, so replays and slow motion show them too
    let nr = 0, ns = 0;
    recent(tick, 34, (e, age) => {
      const hit = e.type === "tackle" && (e.result === "down" || e.result === "fumble"), slam = e.type === "fga" && e.made && e.dunk;
      if (!hit && !slam) return;
      if (!e._fx) { const q = whereWas(hit ? e.on : e.pid, e.tk + (slam ? 12 : 4)); e._fx = q ? { x: q.x, y: q.y, h: hash(e.tk * 3.1) } : { x: -99, y: -99, h: 0 }; }
      const F = e._fx; if (F.x < -50) return;
      const ra = age - (slam ? 12 : 4);
      if (ra > 0 && ra < 22 && nr < ripples.length) { const r = ripples[nr++], u = ra / 22, size = hit ? 15 + (e.gang ? 5 : 0) : 10; r.visible = true; r.position.set(F.x, 0.06, F.y); r.scale.set(size, size, 1); r.material.uniforms.uR.value = 0.12 + 0.8 * Math.sqrt(u); r.material.uniforms.uA.value = (hit ? 0.55 : 0.35) * (1 - u) * (1 - u); }
      if (hit && age < 18) { const t = age / 20; for (let j = 0; j < 36 && ns < 200; j++) { const h1 = hash(e.tk + j * 1.7), h2 = hash(e.tk * 0.3 + j * 3.1), h3 = hash(j * 5.3 + F.h), a = h1 * TAU, v = 6 + h2 * 10, y = 4.4 + (h3 - 0.5) + (4 + h3 * 8) * t - 16 * t * t; if (y < 0.05) continue; sprayPos[ns * 3] = F.x + Math.cos(a) * v * t; sprayPos[ns * 3 + 1] = y; sprayPos[ns * 3 + 2] = F.y + Math.sin(a) * v * t; ns++; } }
    });
    for (let i = nr; i < ripples.length; i++) ripples[i].visible = false;
    sprayGeo.setDrawRange(0, ns); sprayGeo.attributes.position.needsUpdate = true;
    // camera flashes on big moments, phone lights before tip-off
    let nf = 0;
    recent(tick, 40, (e, age) => {
      if (!(e.type === "fga" && e.made && (e.dunk || e.val === 4)) && !(e.type === "tackle" && e.result === "down") && !(e.type === "fga" && e.blk >= 0)) return;
      photoSpots.forEach((q, j) => { if (nf < 90 && age % 7 < 1.6 && hash(e.tk * 13 + j) > 0.35) { flashPos[nf * 3] = q.x + Math.sin(q.ry) * 0.7; flashPos[nf * 3 + 1] = q.y + 1.3; flashPos[nf * 3 + 2] = q.z + Math.cos(q.ry) * 0.7; nf++; } });
      for (let j = 0; j < 45 && nf < 90; j++) { const ft = (j * 0.8) % 30; if (age < ft || age > ft + 2) continue; const s = seats[Math.floor(hash(e.tk * 97 + j) * seats.length)]; flashPos[nf * 3] = s.x; flashPos[nf * 3 + 1] = s.y + 1.3; flashPos[nf * 3 + 2] = s.z; nf++; }
    });
    if (showK > 0.05) for (let j = 0; j < 70 && nf < 160; j++) { if (Math.sin(rtS * (1 + hash(j) * 2) + j) < 0.2) continue; const s = seats[Math.floor(hash(j * 37 + 11) * seats.length)]; flashPos[nf * 3] = s.x; flashPos[nf * 3 + 1] = s.y + 1.8; flashPos[nf * 3 + 2] = s.z; nf++; }
    flashGeo.setDrawRange(0, nf); flashGeo.attributes.position.needsUpdate = true;
    // confetti when the home team wins
    confetti.visible = fin && homeWon;
    if (confetti.visible) {
      const cc = [col(teams[0].c1), col(teams[0].c2), col("#f2b134"), col("#ffffff")];
      for (let i = 0; i < 600; i++) {
        const h1 = hash(i * 3 + 1), h2 = hash(i * 7 + 2), h3 = hash(i * 11 + 5), t0 = h3 * 2.5, tt = Math.max(0, finT - t0);
        let y = 50 + h3 * 12 - tt * (3.5 + h2 * 3); const x = 47 + (h1 - 0.5) * 92 + Math.sin(tt * (1.2 + h2) + i) * 1.8, z = 25 + (h2 - 0.5) * 62 + Math.cos(tt * (1.1 + h1) + i) * 1.8;
        if (y < 0.04) { y = 0.04; dummy.rotation.set(-PI / 2, 0, h1 * 6); } else dummy.rotation.set(tt * (3 + h1 * 4) + i, tt * (2 + h2 * 3), i);
        dummy.position.set(x, finT < t0 ? 90 : y, z); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); confetti.setMatrixAt(i, dummy.matrix);
        if (frameNo % 60 === 1 || !confetti.userData.c) confetti.setColorAt(i, cc[i % 4]);
      }
      confetti.userData.c = 1; confetti.instanceMatrix.needsUpdate = true; if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
    }
    adTex.offset.x = (rtS * 0.02) % 1; adTex2.offset.x = (rtS * 0.012) % 1; ribbonTex.offset.x = (-rtS * 0.01) % 1;
    drawBoard(teams[0], teams[1], mt.s0, mt.s1, mt.per, mt.clock); drawShotClock(mt.shot, mt.clock, mt.phase === 0 && mt.shot <= mt.clock);
    // director and camera
    const portrait = h > w * 1.05;
    const hd = holderS ? Math.hypot(holderS.x - hx, holderS.y - 25) : 99, hsp = holderS ? Math.hypot(holderS.vx, holderS.vy) : 0;
    const toward = holderS ? ((hx - holderS.x) * holderS.vx + (25 - holderS.y) * holderS.vy) / Math.max(1, hd) : 0;
    if (mt.phase !== dir.lastPhase) { dir.phaseStart = now; if (mt.phase === 2) dir.ftShot++; dir.lastPhase = mt.phase; }
    let foc = view.focus !== undefined && view.focus !== null ? pos.find(p => p.idx === view.focus) : null;
    if (foc) foc = Object.assign({ h: models[foc.idx] ? models[foc.idx].H : 6.5 }, foc); else foc = { x: bx, y: by, z: 0, face: 0 };
    const S = { bx, bz: by, bvx: b.vx, right, hx, minX: Math.min(minX, bx), maxX: Math.max(maxX, bx), aspect: w / h, portrait, phase: mt.phase, phaseT: (now - dir.phaseStart) / 1000,
      drive: !!holderS && hd < 18 && toward > 7 && hsp > 8, fastbreak: !!holderS && hsp > 14 && Math.abs(holderS.x - 47) < 30, rt: now / 1000, foc, ftAlt: dir.ftShot % 2 === 1, hudSide: 0, spinT: view.spinT || 0, danceOn };
    if (mt.phase === 4) { let tt = -1; recent(tick, 1200, e => { if (tt < 0 && e.type === "timeout") tt = e.team; }); S.hudSide = tt === 1 ? 1 : 0; }
    S.focFound = view.focus !== undefined && view.focus !== null && pos.some(q => q.idx === view.focus);
    if (S.focFound) { dir.chaseA = dir.chaseA === undefined ? foc.face : dir.chaseA + angDiff(dir.chaseA, foc.face) * (1 - Math.exp(-rdt * 1.4)); S.chaseA = dir.chaseA; }
    S.reaction = -1; // cut to the bench after a big play when there's no replay
    if (!view.replay && mt.phase !== 0) recent(tick, 46, (e, age) => { if (S.reaction < 0 && age > 6 && ((e.type === "fga" && e.made && (e.val >= 3 || e.dunk)) || (e.type === "tackle" && e.result === "down"))) S.reaction = e.team; });
    S.benchT = S.reaction === 1 ? 1 : 0;
    if (userCam === "free" && !view.shot) free.target.lerp(new V3(bx, 4, by), 0.08);
    const shot = direct(S, view, rdt);
    let R = rig(shot, S);
    if (pinned) { R = { P: new V3(...pinned.P), L: new V3(...pinned.L), fov: pinned.fov || 30 }; dir.cut = true; } // stills and tests
    let cutNow = false;
    if (dir.cut || !cam.init) { cam.pos.copy(R.P); cam.look.copy(R.L); cam.fov = R.fov; dir.cut = false; cutNow = true; }
    else { const k = 1 - Math.exp(-rdt * (shot === "free" ? 12 : shot === "main" || shot === "endzone" ? 2.6 : 3.5)); cam.pos.lerp(R.P, k); cam.look.lerp(R.L, k); cam.fov = lerp(cam.fov, R.fov, k); }
    cam.init = true;
    let shk = 0; recent(tick, 16, (e, age) => { if ((e.type === "fga" && e.made && e.dunk) || (e.type === "tackle" && e.result === "down")) shk = Math.max(shk, Math.exp(-age / 4) * (shot === "main" || shot === "endzone" ? 0.35 : 0.6)); });
    const hh = (HANDHELD[shot] || 0) * (shot === "free" ? 0 : 1), T = now / 1000;
    camera.position.copy(cam.pos).add(tmpV.set((Math.sin(T * 0.9 + 1) + Math.sin(T * 2.3) * 0.4) * 0.09 * hh, (Math.sin(T * 1.3) + Math.sin(T * 2.9 + 2) * 0.3) * 0.06 * hh, Math.sin(T * 0.7 + 2) * 0.09 * hh));
    if (shk) camera.position.add(tmpV.set(Math.sin(vt * 90) * shk, Math.sin(vt * 130) * shk, Math.sin(vt * 70) * shk));
    camera.fov = cam.fov * (1 + Math.sin(T * 0.5) * 0.004 * hh); camera.lookAt(tmpV2.copy(cam.look).add(tmpV.set(Math.sin(T * 1.1) * 0.05 * hh, Math.sin(T * 1.7 + 1) * 0.04 * hh, 0))); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    for (const f of refs.concat(coaches)) { const r = f.m.root.position; f.m.root.visible = Math.hypot(r.x - camera.position.x, r.z - camera.position.z) > 22 || camera.position.y > 30; }
    updateAR(view.ar, tick, pos);
    // positional sound: pan by where it is on screen, quieter when far away
    if (cueFn && cues.length) for (const [kind, x, y, z] of cues) { tmpV.set(x, y, z).applyMatrix4(camera.matrixWorldInverse); const dist = tmpV.length(), pan = clamp(tmpV.x / Math.max(4, -tmpV.z) * 1.1, -1, 1), vol = clamp(38 / Math.max(1, dist), 0.12, 1); cueFn(kind, vol, pan, clamp(view.rate || 1, 0.45, 1)); }
    // jumbotron: a live feed from a second camera on high quality, every third frame
    const feed = quality === "high" && frameNo % 3 === 0;
    jumboMat.map = quality === "high" ? jumboRT.texture : jumboStatic;
    if (feed) {
      if (mt.phase === 4 || view.dance) { const s2 = seats[Math.floor((Math.floor(vt / 4) * 97) % seats.length)]; jumboCam.position.set(s2.x - s2.ox * 10, s2.y + 3, s2.z - s2.oz * 10); jumboCam.lookAt(s2.x, s2.y + 0.6, s2.z); jumboCam.fov = 24; }
      else { const fp = view.focus !== undefined ? pos.find(q => q.idx === view.focus) : null, tx = fp ? fp.x : bx, tz = fp ? fp.y : by, a = fp ? fp.face : now / 9000; jumboCam.position.set(tx + Math.cos(a + 0.7) * 16, 6.5, tz + Math.sin(a + 0.7) * 16); jumboCam.lookAt(tx, 4.5, tz); jumboCam.fov = 30; }
      jumboCam.updateProjectionMatrix(); jumbo.visible = false; AR.visible = false;
      renderer.setRenderTarget(jumboRT); renderer.render(scene, jumboCam);
      jumbo.visible = true; AR.visible = !!view.ar;
    }
    // ---- draw: reflection pass, shadows, then the HDR pipeline (or straight to screen on low)
    const usePost = post && quality !== "low", useRefl = quality === "high" && camera.position.y > 0.5;
    const W = canvas.width, Hh = canvas.height;
    if (useRefl) {
      if (reflRT.width !== (W >> 1) || reflRT.height !== (Hh >> 1)) reflRT.setSize(Math.max(1, W >> 1), Math.max(1, Hh >> 1));
      mirror.position.set(camera.position.x, -camera.position.y, camera.position.z);
      tmpV.set(0, 0, -1).applyQuaternion(camera.quaternion).add(camera.position); tmpV.y = -tmpV.y;
      tmpV2.set(0, 1, 0).applyQuaternion(camera.quaternion); tmpV2.y = -tmpV2.y; mirror.up.copy(tmpV2); mirror.lookAt(tmpV);
      mirror.fov = camera.fov; mirror.aspect = camera.aspect; mirror.near = camera.near; mirror.far = camera.far; mirror.updateProjectionMatrix(); mirror.updateMatrixWorld();
      RU.reflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
      court.visible = floor.visible = false; for (const s of show) s.pool.visible = false; for (const bl of blobs) bl.visible = false; confetti.visible = confetti.visible && false; AR.visible = false;
      renderer.setRenderTarget(reflRT); renderer.render(scene, mirror);
      court.visible = floor.visible = true; for (const bl of blobs) bl.visible = true; confetti.visible = fin && homeWon; for (const s of show) s.pool.visible = showK > 0.01; AR.visible = !!view.ar;
      RU.uRefl.value = 0.55;
    } else RU.uRefl.value = 0;
    renderer.shadowMap.needsUpdate = true;
    if (usePost) {
      post.setSize(W, Hh, quality === "high" ? 4 : 2);
      curVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      replayK += ((view.replay ? 1 : 0) - replayK) * (1 - Math.exp(-rdt * 6));
      const blurAmt = view.replay && (shot === "iso" || shot === "rim" || shot === "low" || shot === "baseline") ? 0.75 : shot === "iso" ? 0.4 : 0;
      let dof = 0, fz = 30;
      const onPlayer = (shot === "spin" || shot === "lineup" || shot === "iso") && view.focus !== undefined, onBall = view.replay && (shot === "rim" || shot === "low" || shot === "baseline");
      if (quality === "high" && (onPlayer || onBall)) { tmpV.set(onPlayer ? foc.x : ball.position.x, onPlayer ? 4 + foc.z : ball.position.y, onPlayer ? foc.y : ball.position.z).applyMatrix4(camera.matrixWorldInverse); fz = -tmpV.z; dof = shot === "spin" || shot === "lineup" ? 1 : onBall ? 0.5 : view.replay ? 0.8 : 0.6; }
      post.render(scene, camera, { threshold: 1.0, bloom: quality === "high" ? 0.16 : 0.12, exposure: 1.02, vignette: 0.34 + 0.12 * replayK, grain: quality === "high" ? 0.02 : 0.012, time: now / 1000, replay: replayK, blur: quality === "high" ? (dof ? 0 : blurAmt) : blurAmt, sat: 1.07,
        ao: quality === "high" ? 0.7 : 0, dof, focus: fz, streak: 0.1, dirt: 1.1, hide: transients(), era: view.era || 0,
        mb: quality === "high" && !cutNow && !jump && camera.position.distanceTo(prevCamPos) < 3 ? 0.5 * Math.min(1, 1 / 60 / Math.max(rdt, 1e-3)) : 0 /* a fixed 1/120 s shutter whatever the frame rate */, sharp: 0.22, prevVP, invVP: curVP.clone().invert() });
      prevVP.copy(curVP); prevCamPos.copy(camera.position);
    } else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
    return { shot };
  }
  // free camera: drag to orbit, wheel or pinch to zoom
  const ptr = new Map(); let pinch0 = 0;
  canvas.addEventListener("pointerdown", e => { if (userCam !== "free") return; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch (er) {} });
  canvas.addEventListener("pointermove", e => {
    if (userCam !== "free" || !ptr.has(e.pointerId)) return;
    const p = ptr.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptr.size === 1) { free.yaw -= dx * 0.008; free.pitch = clamp(free.pitch + dy * 0.006, 0.05, 1.45); }
    else if (ptr.size === 2) { const [a, c] = [...ptr.values()], d = Math.hypot(a.x - c.x, a.y - c.y); if (pinch0) free.dist = clamp(free.dist * pinch0 / d, 8, 140); pinch0 = d; }
  });
  const upH = e => { ptr.delete(e.pointerId); if (ptr.size < 2) pinch0 = 0; };
  canvas.addEventListener("pointerup", upH); canvas.addEventListener("pointercancel", upH);
  canvas.addEventListener("wheel", e => { if (userCam !== "free") return; e.preventDefault(); free.dist = clamp(free.dist * (1 + e.deltaY * 0.001), 8, 140); }, { passive: false });
  setQuality(quality);
  return {
    setGame, render, setQuality, pin(v) { pinned = v; }, figure: idx => model(idx), get waves() { return waves; }, get quality() { return quality; }, onCue(fn) { cueFn = fn; }, get postActive() { return !!post && quality !== "low"; },
    setCamera(m) { userCam = m; if (m === "free") { free.target.copy(cam.look); const d = cam.pos.clone().sub(cam.look); free.dist = clamp(d.length(), 12, 120); free.yaw = Math.atan2(d.z, d.x); free.pitch = clamp(Math.asin(d.y / d.length()), 0.08, 1.4); } dir.shot = null; canvas.style.touchAction = m === "free" ? "none" : "pan-y"; },
    get camera() { return userCam; },
    get shot() { return dir.shot; },
    dispose() { renderer.dispose(); }
  };
}
window.Broadcast3D = { supported, create, makeAudio, photo, photoPoses: Object.keys(CPOSE) };
})();
