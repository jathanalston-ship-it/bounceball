// ===================== CARD ART: frames, backgrounds, player figures (pure SVG strings) =====================
// Every card is one SVG (viewBox 250x350), crisp at any size. The art is generated from the card
// itself (collection, rarity tier, team colors, season, the player's build), seeded by the card id,
// so the same card always looks the same.
"use strict";
const CART = (function () {
const W = 250, H = 350;
let UID = 0;
const FONT = "Oswald, 'Bebas Neue', 'Arial Narrow', Impact, sans-serif";
const rad = a => a * Math.PI / 180;
const dir = a => [Math.sin(rad(a)), Math.cos(rad(a))]; // 0 = down, 90 = right, 180 = up, -90 = left
const f1 = n => Math.round(n * 10) / 10;
const xe = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function rngOf(seed) { let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0; s = s || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hex2rgb(h) { h = String(h).replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
function lum(h) { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
const add = (a, v, k) => [a[0] + v[0] * (k === undefined ? 1 : k), a[1] + v[1] * (k === undefined ? 1 : k)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const vlen = a => Math.hypot(a[0], a[1]);
const unit = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l]; };
const P2 = p => f1(p[0]) + "," + f1(p[1]);
const poly = pts => "M" + pts.map(P2).join(" L") + "Z";
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
// tapered capsule from a (radius ra) to b (radius rb), as a polygon path
function capsule(a, b, ra, rb, steps) {
  steps = steps || 7;
  const d = sub(b, a), L = vlen(d) || 0.01, u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
  const al = Math.asin(Math.max(-0.9, Math.min(0.9, (ra - rb) / L)));
  const mp = unit(add([n[0] * Math.cos(al), n[1] * Math.cos(al)], u, Math.sin(al)));
  const mm = unit(add([-n[0] * Math.cos(al), -n[1] * Math.cos(al)], u, Math.sin(al)));
  const tu = Math.atan2(u[1], u[0]), a1 = Math.atan2(mp[1], mp[0]), a2 = Math.atan2(mm[1], mm[0]);
  const d1 = wrapA(tu - a1) * 2, d2 = wrapA(tu + Math.PI - a2) * 2, pts = [];
  for (let i = 0; i <= steps; i++) { const t = a1 + d1 * i / steps; pts.push([b[0] + Math.cos(t) * rb, b[1] + Math.sin(t) * rb]); }
  for (let i = 0; i <= steps; i++) { const t = a2 + d2 * i / steps; pts.push([a[0] + Math.cos(t) * ra, a[1] + Math.sin(t) * ra]); }
  return poly(pts);
}
function chamf(x, y, w, h, c) { return `M${x + c},${y} H${x + w - c} L${x + w},${y + c} V${y + h - c} L${x + w - c},${y + h} H${x + c} L${x},${y + h - c} V${y + c}Z`; }

// ---------- rarity materials ----------
// frame: metallic gradient stops; acc: glow / highlight / gem; ink: text on the plate; deep: darkest frame tone
const TP = {
  rubber:   { frame: ["#15171b", "#41464f", "#1d2025", "#5a606a", "#16181c"], acc: "#a7b0bb", ink: "#e9edf3", deep: "#0b0c0e", mat: "tread" },
  bronze:   { frame: ["#3e230f", "#c98a4b", "#6e4220", "#f2c08c", "#4f2d14"], acc: "#e7a467", ink: "#fff3e6", deep: "#26150a", mat: "metal" },
  silver:   { frame: ["#4f565f", "#eef2f6", "#7b838d", "#ffffff", "#5d646d"], acc: "#e3e9f0", ink: "#ffffff", deep: "#2b3036", mat: "metal" },
  gold:     { frame: ["#5e420a", "#f7d774", "#9c7314", "#fff6cf", "#6f500e"], acc: "#f6cf55", ink: "#fffaf0", deep: "#3a2905", mat: "metal" },
  emerald:  { frame: ["#042e1d", "#2ee59d", "#0b5a39", "#c4ffe6", "#063a25"], acc: "#35eaa3", ink: "#eafff6", deep: "#021a10", mat: "gem" },
  sapphire: { frame: ["#06184a", "#4d9bff", "#0d3384", "#d0e4ff", "#081f55"], acc: "#5aa5ff", ink: "#eef5ff", deep: "#030c26", mat: "gem" },
  ruby:     { frame: ["#3d050c", "#ff3f60", "#7d0c1f", "#ffc8d2", "#4a0710"], acc: "#ff5571", ink: "#fff0f3", deep: "#200206", mat: "gem" },
  amethyst: { frame: ["#220a42", "#b779ff", "#431a7a", "#efe0ff", "#2a0e4f"], acc: "#c08cff", ink: "#f8f0ff", deep: "#120524", mat: "gem" },
  diamond:  { frame: ["#3a86a8", "#f4fcff", "#8fd2ee", "#ffffff", "#5aa9cc"], acc: "#c9f4ff", ink: "#ffffff", deep: "#16384a", mat: "crystal", holo: true },
  opal:     { frame: ["#ff8fd8", "#8fd3ff", "#b6ffd0", "#ffe58f", "#d79bff"], acc: "#ffd3f2", ink: "#ffffff", deep: "#3a2050", mat: "opal", holo: true },
  vulcan:   { frame: ["#0d0503", "#ff5a1f", "#2a0904", "#ffb347", "#120604"], acc: "#ff6a1f", ink: "#fff1e6", deep: "#050100", mat: "lava", holo: true, molten: true }
};

// ---------- player figure ----------
// Forward kinematics on a skeleton; angles absolute in degrees (0 down, 90 right, 180 up, -90 left).
const POSES = {
  portrait:  { lean: 0,   arms: [-4, 101, 4, -101],    legs: [-7, -3, 7, 3],      ball: null, armsFront: true },
  akimbo:    { lean: 0,   arms: [-48, 42, 48, -42],    legs: [-7, -3, 7, 3],      ball: null, armsFront: true },
  ballhip:   { lean: 0,   arms: [-6, -2, 26, -62],     legs: [-7, -3, 7, 3],      ball: "hip", armsFront: true },
  stand:     { lean: 0,   arms: [-10, -4, 16, 62],     legs: [-7, -3, 7, 3],      ball: "R" },
  mugshot:   { lean: 0,   arms: [-6, 78, 6, -78],      legs: [-6, -2, 6, 2],      ball: null, placard: true, armsFront: true, portrait: true },
  dunk:      { lean: 18,  arms: [-70, -25, 158, 172],  legs: [28, -35, -12, -52], ball: "R", air: 70 },
  block:     { lean: -12, arms: [168, 176, 115, 150],  legs: [22, -12, -26, -45], ball: "swat", air: 62 },
  shoot:     { lean: -3,  arms: [148, 205, 164, 186],  legs: [-4, 4, 5, -4],      ball: "release", air: 22 },
  tackle:    { lean: 68,  arms: [72, 120, 100, 135],   legs: [-38, -12, 45, -25], ball: null },
  stiffarm:  { lean: 16,  arms: [-8, 62, 96, 92],      legs: [-34, -70, 52, -2],  ball: "L", air: 8 },
  pass:      { lean: 10,  arms: [-42, -18, 96, 90],    legs: [-16, -6, 22, 6],    ball: "pass" },
  rebound:   { lean: 0,   arms: [-168, 152, 168, -152], legs: [-26, 16, 26, -16], ball: "top", air: 34 },
  steal:     { lean: 30,  arms: [-50, -20, 72, 58],    legs: [-42, 2, 46, -6],    ball: "poke" },
  dribble:   { lean: 14,  arms: [-62, -30, 30, 8],     legs: [-30, -6, 26, 2],    ball: "floor" },
  trophy:    { lean: 0,   arms: [-170, 148, 170, -148], legs: [-8, -3, 8, 3],     ball: null, trophy: true },
  celebrate: { lean: 0,   arms: [-150, -160, 150, 160], legs: [-12, -4, 12, 4],   ball: null, air: 6 },
  guard:     { lean: 14,  arms: [-82, -108, 82, 108],  legs: [-40, -4, 40, 4],    ball: null },
  fadeaway:  { lean: -16, arms: [150, 200, 166, 188],  legs: [-14, -40, 22, -6],  ball: "release", air: 30 },
  hangrim:   { lean: 3,   arms: [172, 176, -172, -176], legs: [8, -14, 20, 2],    ball: null, air: 70 },
  flex:      { lean: 0,   arms: [-96, 170, 96, -170],  legs: [-9, -3, 9, 3],      ball: null, armsFront: true },
  point:     { lean: 0,   arms: [-12, -6, 172, 178],   legs: [-8, -3, 8, 3],      ball: null, finger: "R" },
  crossover: { lean: 12,  arms: [-56, -14, 24, -38],   legs: [-40, -6, 32, 6],    ball: "floor" }
};
function hairFor(R, season) {
  const x = R();
  if (season < 1966) return x < 0.15 ? "flat" : "crew";
  if (season < 1983) return x < 0.42 ? "afro" : x < 0.55 ? "band" : "crew";
  if (season < 2000) return x < 0.28 ? "hightop" : x < 0.4 ? "band" : x < 0.55 ? "bald" : "crew";
  return x < 0.3 ? "band" : x < 0.5 ? "bald" : x < 0.62 ? "locs" : "crew";
}
function figure(poseKey, o) {
  // o: { ht, wt, c1, c2, num, id, cx, floor, scale, R, season, shoe, anchor, headTop, top, placard }
  const p = POSES[poseKey] || POSES.stand, R = o.R || Math.random;
  const s = o.scale * (0.92 + (o.ht - 72) / 14 * 0.16);
  const t = 0.86 + Math.max(-0.12, Math.min(0.42, (o.wt - 190) / 100 * 0.5)); // bulk
  const L = { torso: 60 * s, neck: 6 * s, head: 11.2 * s, sh: 17.5 * s * (0.9 + t * 0.12), hip: 10.5 * s * (0.94 + t * 0.08), ua: 29 * s, fa: 26.5 * s, th: 44 * s, sn: 43 * s };
  const lean = p.lean, u = [Math.sin(rad(lean)), -Math.cos(rad(lean))], q = [Math.cos(rad(lean)), Math.sin(rad(lean))];
  const legDrop = Math.max(Math.cos(rad(p.legs[0])) * L.th + Math.cos(rad(p.legs[1])) * L.sn, Math.cos(rad(p.legs[2])) * L.th + Math.cos(rad(p.legs[3])) * L.sn);
  const P = [o.cx, o.floor - legDrop - (p.air || 0) * s - 6 * s];
  const loc = (x, y) => [P[0] + q[0] * x + u[0] * y, P[1] + q[1] * x + u[1] * y]; // torso frame: x right, y up the spine
  const T = L.torso;
  const N = loc(0, T), SL = loc(-L.sh, T - 5 * s), SR = loc(L.sh, T - 5 * s), HL = loc(-L.hip, 0), HR = loc(L.hip, 0);
  const Hc = add(N, u, L.neck + L.head);
  const EL = add(SL, dir(p.arms[0]), L.ua), AL = add(EL, dir(p.arms[1]), L.fa);
  const ER = add(SR, dir(p.arms[2]), L.ua), AR = add(ER, dir(p.arms[3]), L.fa);
  const KL = add(HL, dir(p.legs[0]), L.th), FL = add(KL, dir(p.legs[1]), L.sn);
  const KR = add(HR, dir(p.legs[2]), L.th), FR = add(KR, dir(p.legs[3]), L.sn);
  const k = s * t, face = lean >= 0 ? 1 : -1;
  const ink = `url(#${o.id}-ink)`, inkBack = "#0b0e13", edge = mix("#2a3446", o.acc || "#ffffff", 0.25);
  const shorts = mix(o.c1, "#000000", 0.12), shortsBack = mix(o.c1, "#000000", 0.4), trim = o.c2;
  const era = o.season || 2000, sleeve = era >= 1995 && !p.armsFront && R() < 0.28, kneeSl = era >= 1980 && R() < 0.22, wrist = !p.armsFront && R() < 0.35;
  let hair = hairFor(R, era); if (o.hat === "clover") hair = "band"; const shoeCol = o.shoe || "#f4f4f4";
  const sty = (fill, st) => `fill="${fill}"${st ? ` stroke="${st}" stroke-width="${f1(0.9 * s)}" stroke-linejoin="round"` : ""}`;
  // ---- limbs ----
  const arm = (S, E, A, ang, fill, st, front) => {
    let g = `<circle cx="${f1(S[0])}" cy="${f1(S[1])}" r="${f1(8.4 * k)}" ${sty(fill)}/>`;
    g += `<path d="${capsule(S, E, 7.0 * k, 5.2 * k)}" ${sty(fill, st)}/>`;
    g += `<path d="${capsule(lerp(S, E, 0.18), lerp(S, E, 0.62), 7.6 * k, 6.2 * k)}" ${sty(fill)}/>`; // biceps / triceps
    g += `<path d="${capsule(E, A, 5.4 * k, 3.7 * k)}" ${sty(fill, st)}/>`;
    g += `<path d="${capsule(lerp(E, A, 0.08), lerp(E, A, 0.45), 6.0 * k, 5.0 * k)}" ${sty(fill)}/>`; // forearm
    const hd = unit(sub(A, E)), Hd = add(A, hd, 3.2 * s);
    g += `<ellipse cx="${f1(Hd[0])}" cy="${f1(Hd[1])}" rx="${f1(4.3 * s)}" ry="${f1(5.4 * s)}" transform="rotate(${f1(Math.atan2(hd[1], hd[0]) * 180 / Math.PI - 90)} ${f1(Hd[0])} ${f1(Hd[1])})" ${sty(fill, st)}/>`;
    if (p.finger && ((p.finger === "R" && A === AR) || (p.finger === "L" && A === AL))) g += `<path d="${capsule(add(Hd, hd, 3 * s), add(Hd, hd, 10 * s), 1.7 * s, 1.3 * s)}" ${sty(fill, st)}/>`;
    if (front && sleeve) g += `<path d="${capsule(lerp(S, E, 0.05), A, 7.4 * k, 4.6 * k)}" fill="${mix(trim, "#000", 0.15)}" stroke="${mix(trim, "#000", 0.45)}" stroke-width="${f1(0.8 * s)}"/>`;
    if (wrist && front) g += `<path d="${capsule(lerp(E, A, 0.72), lerp(E, A, 0.95), 4.7 * k, 4.3 * k)}" fill="${trim}" stroke="${mix(trim, "#000", 0.4)}" stroke-width=".6"/>`;
    return g;
  };
  const leg = (Hp, K, F, sn, fill, st, shortFill, front, sleeveOn) => {
    let g = `<path d="${capsule(Hp, K, 10.8 * k, 6.8 * k)}" ${sty(fill, st)}/>`;
    g += `<path d="${capsule(lerp(Hp, K, 0.2), lerp(Hp, K, 0.7), 11.6 * k, 8.6 * k)}" ${sty(fill)}/>`;
    g += `<path d="${capsule(K, F, 6.4 * k, 3.6 * k)}" ${sty(fill, st)}/>`;
    const sd = unit(sub(F, K)), bk = [-face * sd[1], face * sd[0]]; // calf bulges toward the back of the leg
    g += `<path d="${capsule(add(lerp(K, F, 0.15), bk, 1.6 * k), add(lerp(K, F, 0.55), bk, 1.2 * k), 7.0 * k, 5.0 * k)}" ${sty(fill)}/>`;
    if (sleeveOn) g += `<path d="${capsule(lerp(Hp, K, 0.78), lerp(K, F, 0.3), 7.6 * k, 6.4 * k)}" fill="#0d0f13" stroke="#3a4352" stroke-width=".7"/>`;
    // sock + shoe
    g += `<path d="${capsule(lerp(K, F, 0.78), F, 4.2 * k, 4.0 * k)}" fill="#eef1f4"/>`;
    const td = dir(sn + 90 * face);
    const hb = add(add(F, td, -5.5 * s), sd, 3.6 * s), tb = add(add(F, td, 12 * s), sd, 3.6 * s), tt = add(add(F, td, 13.6 * s), sd, 0.6 * s),
      tp = add(add(F, td, 9.5 * s), sd, -3.4 * s), cf = add(add(F, td, 2.5 * s), sd, -5.6 * s), cb2 = add(add(F, td, -4.6 * s), sd, -5.2 * s);
    g += `<path d="${poly([hb, tb, tt, tp, cf, cb2])}" fill="${shoeCol}" stroke="${mix(shoeCol, "#000", 0.55)}" stroke-width="${f1(0.8 * s)}" stroke-linejoin="round"/>`;
    g += `<path d="M${P2(add(hb, sd, -0.6 * s))} L${P2(add(tb, sd, -0.6 * s))}" stroke="${lum(shoeCol) > 0.7 ? mix(trim, "#000", 0.1) : "#f4f4f4"}" stroke-width="${f1(2.6 * s)}" stroke-linecap="round"/>`;
    // shorts leg: from the hip down past mid-thigh, flaring out
    const thd = unit(sub(K, Hp)), nO0 = [-thd[1], thd[0]], outS = (nO0[0] * (Hp[0] - P[0]) + nO0[1] * (Hp[1] - P[1])) >= 0 ? 1 : -1, nO = [nO0[0] * outS, nO0[1] * outS];
    const hem = lerp(Hp, K, 0.6), oTop = add(add(Hp, nO, 12.5 * k), thd, -6 * s), iTop = add(add(P, u, -2 * s), nO, -1 * s), hO = add(hem, nO, 12.6 * k), hI = add(hem, nO, -11.4 * k);
    g += `<path d="M${P2(oTop)} L${P2(hO)} Q${P2(add(hem, thd, 1.6 * s))} ${P2(hI)} L${P2(iTop)}Z" fill="${shortFill}" stroke="${mix(shortFill, "#000", 0.35)}" stroke-width="${f1(0.7 * s)}" stroke-linejoin="round"/>`;
    g += `<path d="M${P2(add(oTop, nO, -1.2 * s))} L${P2(add(hO, nO, -1.2 * s))}" stroke="${trim}" stroke-width="${f1(2.4 * s)}"/>`;
    g += `<path d="M${P2(hO)} Q${P2(add(hem, thd, 1.6 * s))} ${P2(hI)}" stroke="${trim}" stroke-width="${f1(1.6 * s)}" fill="none"/>`;
    return g;
  };
  // ---- torso ----
  const tq = (x, y) => loc(x, y);
  const skin = poly([tq(-5.5 * s, T + 1 * s), tq(5.5 * s, T + 1 * s), tq(L.sh + 2 * s, T - 3 * s), tq(L.sh + 1 * s, T - 21 * s), tq(-L.sh - 1 * s, T - 21 * s), tq(-L.sh - 2 * s, T - 3 * s)]);
  const jw = (L.hip + 3 * s);
  const jersey = `M${P2(tq(-6.6 * s, T - 0.5 * s))} Q${P2(tq(0, T - 15 * s))} ${P2(tq(6.6 * s, T - 0.5 * s))} L${P2(tq(12.5 * s, T - 2.8 * s))} Q${P2(tq(L.sh - 2.5 * s, T - 9 * s))} ${P2(tq(L.sh - 1 * s, T - 20 * s))} Q${P2(tq(L.sh + 0.5 * s, T * 0.45))} ${P2(tq(jw, 8 * s))} L${P2(tq(jw + 0.5 * s, -2 * s))} L${P2(tq(-jw - 0.5 * s, -2 * s))} L${P2(tq(-jw, 8 * s))} Q${P2(tq(-L.sh - 0.5 * s, T * 0.45))} ${P2(tq(-L.sh + 1 * s, T - 20 * s))} Q${P2(tq(-L.sh + 2.5 * s, T - 9 * s))} ${P2(tq(-12.5 * s, T - 2.8 * s))}Z`;
  const trimPath = `M${P2(tq(-6.6 * s, T - 0.5 * s))} Q${P2(tq(0, T - 15 * s))} ${P2(tq(6.6 * s, T - 0.5 * s))} M${P2(tq(12.5 * s, T - 2.8 * s))} Q${P2(tq(L.sh - 2.5 * s, T - 9 * s))} ${P2(tq(L.sh - 1 * s, T - 20 * s))} M${P2(tq(-12.5 * s, T - 2.8 * s))} Q${P2(tq(-L.sh + 2.5 * s, T - 9 * s))} ${P2(tq(-L.sh + 1 * s, T - 20 * s))}`;
  const side = `M${P2(tq(L.sh - 1.5 * s, T - 21 * s))} Q${P2(tq(L.sh - 0.5 * s, T * 0.45))} ${P2(tq(jw - 1 * s, 0))} M${P2(tq(-L.sh + 1.5 * s, T - 21 * s))} Q${P2(tq(-L.sh + 0.5 * s, T * 0.45))} ${P2(tq(-jw + 1 * s, 0))}`;
  const waist = poly([tq(-jw - 1.5 * s, 4.5 * s), tq(jw + 1.5 * s, 4.5 * s), tq(jw + 1.8 * s, -1.5 * s), tq(-jw - 1.8 * s, -1.5 * s)]);
  const numC = o.portrait ? tq(0, T - 21 * s) : tq(0, T * 0.56), showNum = !p.placard;
  const numFill = lum(o.c1) > 0.62 ? mix(o.c2, "#000", 0.25) : (lum(o.c2) < 0.22 || Math.abs(lum(o.c2) - lum(o.c1)) < 0.12 ? "#ffffff" : o.c2);
  const num = `<text x="${f1(numC[0])}" y="${f1(numC[1] + 6.5 * s)}" transform="rotate(${f1(lean)} ${f1(numC[0])} ${f1(numC[1])})" font-family="${FONT}" font-weight="700" font-size="${f1((o.portrait ? 14 : 17) * s)}" text-anchor="middle" fill="${numFill}" stroke="${mix(o.c1, "#000", 0.55)}" stroke-width="${f1(1.6 * s)}" paint-order="stroke" letter-spacing="-.3">${xe(o.num)}</text>`;
  // ---- head + hair ----
  const hr = L.head;
  let head = "";
  if (hair === "afro") head += `<circle cx="${f1(Hc[0] + u[0] * 2 * s)}" cy="${f1(Hc[1] + u[1] * 2 * s)}" r="${f1(hr * 1.42)}" fill="${inkBack}" stroke="${edge}" stroke-width=".8"/>`;
  if (hair === "locs") for (const sg of [-1, 1]) head += `<path d="${capsule(add(Hc, q, sg * hr * 0.6), add(add(Hc, q, sg * hr * 1.05), u, -hr * 1.5), 3.8 * s, 2.6 * s)}" fill="${inkBack}"/>`;
  head += `<ellipse cx="${f1(Hc[0])}" cy="${f1(Hc[1])}" rx="${f1(hr * 0.86)}" ry="${f1(hr)}" transform="rotate(${f1(lean)} ${f1(Hc[0])} ${f1(Hc[1])})" fill="${ink}"/>`;
  const jaw = add(add(Hc, u, -hr * 0.55), q, face * hr * 0.12);
  head += `<ellipse cx="${f1(jaw[0])}" cy="${f1(jaw[1])}" rx="${f1(hr * 0.72)}" ry="${f1(hr * 0.5)}" transform="rotate(${f1(lean)} ${f1(jaw[0])} ${f1(jaw[1])})" fill="${ink}"/>`;
  const ear = add(add(Hc, q, -face * hr * 0.8), u, -hr * 0.08);
  head += `<ellipse cx="${f1(ear[0])}" cy="${f1(ear[1])}" rx="${f1(2.2 * s)}" ry="${f1(3.2 * s)}" fill="${ink}" stroke="${edge}" stroke-width=".6"/>`;
  if (hair === "hightop") head += `<path d="${poly([add(add(Hc, q, -hr * 0.82), u, hr * 0.35), add(add(Hc, q, hr * 0.82), u, hr * 0.35), add(add(Hc, q, hr * 0.8), u, hr * 1.55), add(add(Hc, q, -hr * 0.8), u, hr * 1.55)])}" fill="${inkBack}" stroke="${edge}" stroke-width=".7"/>`;
  if (hair === "crew" || hair === "flat") head += `<path d="M${P2(add(add(Hc, q, -hr * 0.86), u, hr * 0.1))} Q${P2(add(Hc, u, hr * (hair === "flat" ? 1.16 : 1.3)))} ${P2(add(add(Hc, q, hr * 0.86), u, hr * 0.1))}" fill="${inkBack}"/>`;
  if (hair === "band") head += `<path d="M${P2(add(add(Hc, q, -hr * 0.9), u, hr * 0.3))} Q${P2(add(Hc, u, hr * 0.62))} ${P2(add(add(Hc, q, hr * 0.9), u, hr * 0.3))}" stroke="${o.hat === "clover" ? "#2f9e44" : trim}" stroke-width="${f1(3.6 * s)}" fill="none"/>`;
  if (o.hat === "santa") {
    const bl = add(add(Hc, q, -hr * 1.0), u, hr * 0.42), br = add(add(Hc, q, hr * 1.0), u, hr * 0.42), tip = add(add(Hc, u, hr * 2.0), q, face * hr * 1.6);
    head += `<path d="M${P2(bl)} Q${P2(add(Hc, u, hr * 1.9))} ${P2(tip)} Q${P2(add(add(Hc, u, hr * 1.2), q, face * hr * 0.6))} ${P2(br)}Z" fill="#d7263d" stroke="#7a0f1f" stroke-width="${f1(.8 * s)}"/>`;
    head += `<path d="M${P2(bl)} Q${P2(add(Hc, u, hr * 0.75))} ${P2(br)}" stroke="#ffffff" stroke-width="${f1(5 * s)}" stroke-linecap="round" fill="none"/><circle cx="${f1(tip[0])}" cy="${f1(tip[1])}" r="${f1(3.4 * s)}" fill="#ffffff"/>`;
  }
  const neck = `<path d="${capsule(add(N, u, -3 * s), add(N, u, L.neck + 3 * s), 5.6 * k, 5.0 * k)}" fill="${ink}"/>`;
  // ---- ball & props ----
  let ball = "";
  const B = (x, y, r) => ballSVG(x, y, (r || 8.8) * s, o.id);
  const hd = (E, A) => add(A, unit(sub(A, E)), 4 * s);
  if (p.ball === "R") ball = B(...add(hd(ER, AR), unit(sub(AR, ER)), 5 * s));
  if (p.ball === "L") ball = B(AL[0] + 2 * s, AL[1] - 2 * s);
  if (p.ball === "hip") ball = B(AR[0] - 4 * s, AR[1] - 11 * s, 11);
  if (p.ball === "release") ball = B(AR[0] + 6 * s, AR[1] - 25 * s);
  if (p.ball === "top") ball = B((AL[0] + AR[0]) / 2, (AL[1] + AR[1]) / 2 - 8 * s);
  if (p.ball === "floor") ball = B(AR[0] + 3 * s, o.floor - 9 * s);
  if (p.ball === "pass") ball = `<g opacity=".6">${[0, 1, 2].map(i => `<line x1="${f1(AR[0] + 16 * s)}" y1="${f1(AR[1] - 5 + i * 5)}" x2="${f1(AR[0] + (36 + i * 6) * s)}" y2="${f1(AR[1] - 5 + i * 5)}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`).join("")}</g>` + B(AR[0] + 54 * s, AR[1]);
  if (p.ball === "swat") ball = `<g opacity=".75">${[0, 1, 2].map(i => `<line x1="${f1(AL[0] + 8 + i * 5)}" y1="${f1(AL[1] - 2 + i * 6)}" x2="${f1(AL[0] + 30 + i * 9)}" y2="${f1(AL[1] + 14 + i * 7)}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`).join("")}</g>` + B(AL[0] - 14 * s, AL[1] - 10 * s);
  if (p.ball === "poke") ball = B(AR[0] + 13 * s, AR[1] + 6 * s) + `<g stroke="#fff" stroke-width="2" stroke-linecap="round">${[[-14, -6], [-6, -16], [6, -15]].map(([dx, dy]) => `<line x1="${f1(AR[0] + 13 * s + dx * .6)}" y1="${f1(AR[1] + 6 * s + dy * .6)}" x2="${f1(AR[0] + 13 * s + dx)}" y2="${f1(AR[1] + 6 * s + dy)}"/>`).join("")}</g>`;
  let prop = "";
  if (p.trophy) prop = trophySVG((AL[0] + AR[0]) / 2, Math.min(AL[1], AR[1]) - 6 * s, s);
  if (p.placard) { const pc = tq(0, T * 0.42); prop = `<g transform="rotate(${f1(lean)} ${f1(pc[0])} ${f1(pc[1])})"><rect x="${f1(pc[0] - 31 * s)}" y="${f1(pc[1] - 13 * s)}" width="${f1(62 * s)}" height="${f1(28 * s)}" rx="1.5" fill="#101215" stroke="#d7dbe0" stroke-width="1.6"/><text x="${f1(pc[0])}" y="${f1(pc[1] - 2 * s)}" font-family="${FONT}" font-size="${f1(8 * s)}" fill="#e9edf3" text-anchor="middle" letter-spacing="1.2">UBL POLICE DEPT</text><text x="${f1(pc[0])}" y="${f1(pc[1] + 9 * s)}" font-family="${FONT}" font-weight="700" font-size="${f1(9 * s)}" fill="#ffffff" text-anchor="middle" letter-spacing=".5">${xe(o.placard || "")}</text></g>`; }
  // ---- assemble (back limbs, torso, front limbs) ----
  const backIsL = lean >= 0;
  const armL = (f, st, fr) => arm(SL, EL, AL, p.arms[1], f, st, fr), armR = (f, st, fr) => arm(SR, ER, AR, p.arms[3], f, st, fr);
  const legL = (f, st, sf, fr) => leg(HL, KL, FL, p.legs[1], f, st, sf, fr, kneeSl && !fr), legR = (f, st, sf, fr) => leg(HR, KR, FR, p.legs[3], f, st, sf, fr, kneeSl && fr);
  let body = "";
  if (p.armsFront) {
    body += legL(ink, edge, shorts, false) + legR(ink, edge, shorts, true) + neck
      + `<path d="${skin}" fill="${ink}"/><circle cx="${f1(SL[0])}" cy="${f1(SL[1])}" r="${f1(8.6 * k)}" fill="${ink}"/><circle cx="${f1(SR[0])}" cy="${f1(SR[1])}" r="${f1(8.6 * k)}" fill="${ink}"/>`
      + `<path d="${jersey}" fill="url(#${o.id}-jer)"/><path d="${side}" stroke="${trim}" stroke-width="${f1(2.2 * s)}" fill="none"/><path d="${trimPath}" stroke="${trim}" stroke-width="${f1(2.4 * s)}" fill="none" stroke-linecap="round"/>`
      + `<path d="${waist}" fill="${mix(shorts, "#000", 0.1)}" stroke="${trim}" stroke-width="${f1(1.1 * s)}"/>` + (showNum ? num : "") + head
      + armR(ink, edge, false) + armL(ink, edge, true);
  } else {
    body += (backIsL ? armL(inkBack, null, false) : armR(inkBack, null, false))
      + (backIsL ? legL(inkBack, null, shortsBack, false) : legR(inkBack, null, shortsBack, false)) + neck
      + `<path d="${skin}" fill="${ink}"/><circle cx="${f1(SL[0])}" cy="${f1(SL[1])}" r="${f1(8.6 * k)}" fill="${ink}"/><circle cx="${f1(SR[0])}" cy="${f1(SR[1])}" r="${f1(8.6 * k)}" fill="${ink}"/>`
      + `<path d="${jersey}" fill="url(#${o.id}-jer)"/><path d="${side}" stroke="${trim}" stroke-width="${f1(2.2 * s)}" fill="none"/><path d="${trimPath}" stroke="${trim}" stroke-width="${f1(2.4 * s)}" fill="none" stroke-linecap="round"/>`
      + (backIsL ? legR(ink, edge, shorts, true) : legL(ink, edge, shorts, true))
      + `<path d="${waist}" fill="${mix(shorts, "#000", 0.1)}" stroke="${trim}" stroke-width="${f1(1.1 * s)}"/>` + num + head
      + (backIsL ? armR(ink, edge, true) : armL(ink, edge, true));
  }
  const defs = `<linearGradient id="${o.id}-ink" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#344055"/><stop offset=".45" stop-color="#1a212d"/><stop offset="1" stop-color="#0c0f15"/></linearGradient>
<linearGradient id="${o.id}-jer" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(o.c1, "#ffffff", 0.28)}"/><stop offset=".5" stop-color="${o.c1}"/><stop offset="1" stop-color="${mix(o.c1, "#000000", 0.42)}"/></linearGradient>`;
  let svg = `<g filter="url(#${o.id}-rim)">${body}</g>` + ball + prop;
  // keep raised hands, heads and trophies inside the card
  const minY = Math.min(Hc[1] - hr * (o.hat === "santa" ? 2.3 : hair === "hightop" ? 1.6 : hair === "afro" ? 1.45 : 1), AL[1], AR[1]) - (p.ball === "release" ? 35 * s : p.ball === "top" ? 18 * s : p.trophy ? 46 * s : p.finger ? 16 * s : 7 * s);
  const lim = o.top || 30;
  if (p.armsFront) {
    const dy = (o.headTop || 64) - (Hc[1] - hr * (hair === "hightop" ? 1.55 : hair === "afro" ? 1.4 : 1.05));
    svg = `<g transform="translate(0 ${f1(dy)})">${svg}</g>`;
    return { svg, defs, head: Hc, pelvis: P, hands: [AL, AR], scale: s };
  }
  if (!o.anchor && minY < lim) {
    const lift = (p.air || 0) * s, dy = Math.min(lift, lim - minY);
    let kk = 1; if (minY + dy < lim) kk = (o.floor - lim) / (o.floor - minY - dy);
    svg = `<g transform="translate(${f1(P[0])} ${f1(o.floor)}) scale(${f1(kk * 1000) / 1000}) translate(${f1(-P[0])} ${f1(-o.floor + dy)})">${svg}</g>`;
  }
  if (o.anchor) { const hn = o.anchor.hand === "L" ? AL : AR; svg = `<g transform="translate(${f1(o.anchor.x - hn[0])} ${f1(o.anchor.y - hn[1])})">${svg}</g>`; }
  const shadow = `<ellipse cx="${f1(P[0])}" cy="${f1(o.floor + 2)}" rx="${f1((p.air ? 24 : 40) * s)}" ry="${f1((p.air ? 3.5 : 6) * s)}" fill="#000" opacity="${p.air ? .3 : .5}" filter="url(#${o.id}-soft)"/>`;
  return { svg: shadow + svg, defs, head: Hc, pelvis: P, hands: [AL, AR], scale: s };
}
function ballSVG(x, y, r, id) {
  return `<g><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#ballg)" stroke="#3a1b05" stroke-width="${f1(r * 0.1)}"/><path d="M${f1(x - r)},${f1(y)} Q${f1(x)},${f1(y + r * 0.18)} ${f1(x + r)},${f1(y)} M${f1(x)},${f1(y - r)} Q${f1(x - r * 0.12)},${f1(y)} ${f1(x)},${f1(y + r)} M${f1(x - r * 0.72)},${f1(y - r * 0.68)} Q${f1(x - r * 0.12)},${f1(y)} ${f1(x - r * 0.72)},${f1(y + r * 0.68)} M${f1(x + r * 0.72)},${f1(y - r * 0.68)} Q${f1(x + r * 0.12)},${f1(y)} ${f1(x + r * 0.72)},${f1(y + r * 0.68)}" stroke="#2b1404" stroke-width="${f1(r * 0.09)}" fill="none"/><ellipse cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.4)}" rx="${f1(r * 0.35)}" ry="${f1(r * 0.22)}" fill="#fff" opacity=".28" transform="rotate(-30 ${f1(x - r * 0.35)} ${f1(y - r * 0.4)})"/></g>`;
}
function trophySVG(x, y, s) {
  const k = s * 1.1;
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(k)})"><path d="M-14,-36 H14 V-23 Q14,-6 0,-2 Q-14,-6 -14,-23Z" fill="url(#goldg)" stroke="#5a4108" stroke-width="1"/><path d="M-14,-31 Q-25,-31 -23,-20 Q-21,-14 -12,-12 M14,-31 Q25,-31 23,-20 Q21,-14 12,-12" stroke="url(#goldg)" stroke-width="3" fill="none"/><ellipse cx="-5" cy="-26" rx="3" ry="7" fill="#fff" opacity=".35"/><rect x="-3" y="-3" width="6" height="8" fill="url(#goldg)"/><rect x="-10" y="4" width="20" height="6" rx="1" fill="url(#goldg)" stroke="#5a4108" stroke-width=".8"/><rect x="-12" y="10" width="24" height="4" rx="1" fill="#2a1f08"/></g>`;
}

// ---------- background building blocks ----------
const pts = a => a.map(P2).join(" ");
function rays(cx, cy, n, col, op, spread) {
  let s = ""; const R = 560;
  for (let i = 0; i < n; i++) { const a = (i / n) * 360, w = (spread || 360 / n / 2); s += `<polygon points="${pts([[cx, cy], [cx + Math.cos(rad(a - w / 2)) * R, cy + Math.sin(rad(a - w / 2)) * R], [cx + Math.cos(rad(a + w / 2)) * R, cy + Math.sin(rad(a + w / 2)) * R]])}" fill="${col}" opacity="${op}"/>`; }
  return s;
}
function stripes(angle, w, col, op) { let s = `<g transform="rotate(${angle} ${W / 2} ${H / 2})" opacity="${op}">`; for (let x = -320; x < 580; x += w * 2) s += `<rect x="${x}" y="-220" width="${w}" height="800" fill="${col}"/>`; return s + "</g>"; }
function halftone(id, col, op, step, ang) { return `<pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(${ang === undefined ? 30 : ang})"><circle cx="${step / 2}" cy="${step / 2}" r="${step * 0.24}" fill="${col}"/></pattern><rect width="${W}" height="${H}" fill="url(#${id})" opacity="${op}"/>`; }
function confetti(R, n, cols, yMax) { let s = ""; for (let i = 0; i < n; i++) { const x = R() * W, y = R() * (yMax || H * 0.8), c = cols[Math.floor(R() * cols.length)]; s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(2.5 + R() * 4)}" height="${f1(5 + R() * 6)}" fill="${c}" transform="rotate(${Math.floor(R() * 180)} ${f1(x)} ${f1(y)})" opacity="${f1(.65 + R() * .35)}"/>`; } return s; }
function star4(x, y, r, col, op) { return `<path d="M${f1(x)},${f1(y - r)} L${f1(x + r * .22)},${f1(y - r * .22)} L${f1(x + r)},${f1(y)} L${f1(x + r * .22)},${f1(y + r * .22)} L${f1(x)},${f1(y + r)} L${f1(x - r * .22)},${f1(y + r * .22)} L${f1(x - r)},${f1(y)} L${f1(x - r * .22)},${f1(y - r * .22)}Z" fill="${col}" opacity="${op}"/>`; }
function sparkles(R, n, col, yMax) { let s = ""; for (let i = 0; i < n; i++) s += star4(R() * W, R() * (yMax || H * 0.75), 2 + R() * 5, col, f1(.45 + R() * .55)); return s; }
function bokeh(g, n, cols, yMax, rMax) { let s = `<g filter="url(#${g.id}-blur)">`; for (let i = 0; i < n; i++) s += `<circle cx="${f1(g.R() * W)}" cy="${f1(g.R() * (yMax || 200))}" r="${f1(2 + g.R() * (rMax || 9))}" fill="${cols[i % cols.length]}" opacity="${f1(.18 + g.R() * .4)}"/>`; return s + `</g>`; }
function word(txt, x, y, size, col, op, rot, outline) {
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="700" font-size="${size}" text-anchor="middle" letter-spacing="-1" ${outline ? `fill="none" stroke="${col}" stroke-width="${outline}"` : `fill="${col}"`} opacity="${op}" ${rot ? `transform="rotate(${rot} ${x} ${y})"` : ""}>${xe(txt)}</text>`;
}
let SPOT = 0;
function spot(x, y, x2, w, col, op, id) { const gid = id + "-bm" + (++SPOT); return `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".9"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient><polygon points="${pts([[x - 3, y], [x + 3, y], [x2 + w, H + 20], [x2 - w, H + 20]])}" fill="url(#${gid})" opacity="${op}"/>`; }
function rimSVG(x, y, k, net) {
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect x="-8" y="-62" width="74" height="50" rx="2" fill="rgba(210,235,255,.14)" stroke="rgba(255,255,255,.85)" stroke-width="2.6"/><rect x="13" y="-40" width="28" height="21" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2.2"/><rect x="25" y="-12" width="4" height="9" fill="#d65c10"/><ellipse cx="14" cy="-2" rx="23" ry="5.4" fill="none" stroke="#ff7a1a" stroke-width="3.8"/>${net ? `<path d="M-8,-1 L-1,27 M2,1 L4,28 M12,2 L11,29 M22,2 L18,28 M35,0 L28,27 M-8,-1 L4,28 M2,1 L18,28 M12,2 L28,27 M35,0 L11,29 M22,2 L-1,27 M-4,12 H32 M-1,22 H30" stroke="rgba(255,255,255,.75)" stroke-width="1.1" fill="none"/>` : ""}</g>`;
}
// ---------- the arena behind the card ----------
// An era-specific room drawn in neutral tones; bg() lays each collection's colors over it, partly
// see-through, so every card keeps its identity and gains a place: a 1950s gym (brick, tall windows,
// wooden bleachers), a classic arena (hanging scoreboard, spotlights, haze), a 1990s dome (jumbotron,
// ribbon boards, lasers) or the LED era (light rig, LED ribbons and courtside boards, phone lights).
// It has its own random stream, so it never shifts a card's pose or other draws.
function stage(g) {
  const y = g.season, id = g.id, R = rngOf("stage:" + g.season + ":" + g.c1 + ":" + (g.num || 0)), c1 = g.c1, c2 = g.c2;
  const era = y < 1966 ? "gym" : y < 1990 ? "arena" : y < 2010 ? "dome" : "led";
  const head = (pid, sc, col, sh, dx) => `<pattern id="${id}-${pid}" width="${f1(9 * sc)}" height="${f1(10 * sc)}" patternUnits="userSpaceOnUse" patternTransform="translate(${f1(dx || 0)} 0)"><circle cx="${f1(4.5 * sc)}" cy="${f1(3.4 * sc)}" r="${f1(2.5 * sc)}" fill="${col}"/><ellipse cx="${f1(4.5 * sc)}" cy="${f1(9.2 * sc)}" rx="${f1(4 * sc)}" ry="${f1(2.8 * sc)}" fill="${sh}"/></pattern>`;
  let d = "", s = "";
  // the floor: a wood court in perspective, glossy under the lights
  d += `<linearGradient id="${id}-fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6a44"/><stop offset="1" stop-color="#3a2a18"/></linearGradient>`;
  let planks = ""; for (let i = -10; i <= 10; i++) planks += `<line x1="${125 + i * 9}" y1="${g.floor}" x2="${125 + i * 34}" y2="${H}" stroke="#2a1d10" stroke-width=".6" opacity=".55"/>`;
  const floorS = `<rect x="0" y="${g.floor - 2}" width="${W}" height="${H - g.floor + 2}" fill="url(#${id}-fl)"/>${planks}<ellipse cx="125" cy="${g.floor + 10}" rx="120" ry="14" fill="#fff" opacity=".12"/>`;
  if (era === "gym") {
    d += `<pattern id="${id}-brick" width="18" height="8" patternUnits="userSpaceOnUse"><rect width="18" height="8" fill="#6e4a36"/><path d="M0,0 H18 M0,4 H18 M9,0 V4 M0,4 V8 M18,4 V8" stroke="#3b271b" stroke-width=".9"/></pattern>`
      + `<linearGradient id="${id}-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7dc"/><stop offset="1" stop-color="#cfd9e2"/></linearGradient>`
      + `<linearGradient id="${id}-shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4cc" stop-opacity=".55"/><stop offset="1" stop-color="#fff4cc" stop-opacity="0"/></linearGradient>`
      + head("cr", 1.1, "#3a3330", "#4a423c");
    s += `<rect width="${W}" height="${g.floor}" fill="url(#${id}-brick)"/><rect width="${W}" height="${g.floor}" fill="#1a120c" opacity=".35"/>`;
    for (const x of [26, 98, 170]) s += `<path d="M${x},96 V36 Q${x + 27},12 ${x + 54},36 V96Z" fill="url(#${id}-win)" opacity=".9"/><path d="M${x + 27},20 V96 M${x},62 H${x + 54}" stroke="#4b3426" stroke-width="2.2"/>`
      + `<polygon points="${x},96 ${x + 54},96 ${x + 120},${g.floor} ${x + 30},${g.floor}" fill="url(#${id}-shaft)" style="mix-blend-mode:screen"/>`;
    for (let i = 0; i < 6; i++) s += `<rect x="0" y="${150 + i * 14}" width="${W}" height="3" fill="#a07a4e" opacity=".8"/><rect x="0" y="${153 + i * 14}" width="${W}" height="11" fill="#2a1d14" opacity=".55"/>`;
    s += `<rect x="0" y="146" width="${W}" height="${g.floor - 146}" fill="url(#${id}-cr)" opacity=".7"/>`;
    for (const x of [62, 188]) s += `<line x1="${x}" y1="0" x2="${x}" y2="20" stroke="#222" stroke-width="1"/><path d="M${x - 9},26 L${x - 4},18 H${x + 4} L${x + 9},26Z" fill="#2b2b2b"/><ellipse cx="${x}" cy="26" rx="9" ry="2.2" fill="#ffe9b0"/>`;
    return `<defs>${d}</defs>${s}${floorS}`;
  }
  // a bowl full of people: three bands of rows, smaller and darker toward the rafters
  d += head("c1", 0.55, "#2a2e36", "#22262d", R() * 5) + head("c2", 0.75, "#3a404a", "#30353e", R() * 5) + head("c3", 1.0, "#4c5360", "#3e4450", R() * 5);
  d += `<linearGradient id="${id}-bowl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05070a"/><stop offset="1" stop-color="#1b1f27"/></linearGradient>`;
  s += `<rect width="${W}" height="${g.floor}" fill="url(#${id}-bowl)"/>`;
  s += `<rect x="0" y="40" width="${W}" height="58" fill="url(#${id}-c1)" opacity=".75"/><rect x="0" y="98" width="${W}" height="56" fill="url(#${id}-c2)" opacity=".85"/><rect x="0" y="158" width="${W}" height="${g.floor - 178}" fill="url(#${id}-c3)"/>`;
  s += `<rect x="0" y="154" width="${W}" height="4" fill="#0b0d12"/>`; // the rail between decks
  // the deck rail and the courtside wall
  s += `<rect x="0" y="${g.floor - 22}" width="${W}" height="20" fill="#0c0f14"/>`;
  if (era === "arena") {
    // a hanging scoreboard cube with bulbs, spotlights crossing in haze
    s += `<line x1="125" y1="0" x2="125" y2="8" stroke="#111" stroke-width="2"/><rect x="101" y="8" width="48" height="30" rx="2" fill="#111419" stroke="#3b414b"/><rect x="106" y="13" width="38" height="12" fill="#1a0a05"/>`;
    for (let i = 0; i < 9; i++) s += `<circle cx="${f1(109 + i * 4)}" cy="19" r="1.1" fill="#ffb347" opacity="${f1(.4 + R() * .6)}"/>`;
    s += `<text x="125" y="34" font-family="${FONT}" font-size="6" fill="#ff6a1f" text-anchor="middle" letter-spacing="1">HOME ${10 + Math.floor(R() * 90)} · ${10 + Math.floor(R() * 90)} VIS</text>`;
    d += `<linearGradient id="${id}-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6dc" stop-opacity=".5"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></linearGradient>`;
    for (const [x, tx] of [[10, 150], [240, 100], [60, 210]]) s += `<polygon points="${x - 4},0 ${x + 4},0 ${tx + 26},${g.floor} ${tx - 26},${g.floor}" fill="url(#${id}-beam)" style="mix-blend-mode:screen" opacity=".55"/>`;
    for (let i = 0; i < 9; i++) s += star4(R() * W, 45 + R() * 150, 1.5 + R() * 2.5, "#ffffff", f1(.5 + R() * .5)); // flashbulbs
    s += `<ellipse cx="125" cy="150" rx="160" ry="40" fill="#9aa3b0" opacity=".1" filter="url(#${id}-blur)"/>`;
  } else {
    // ribbon boards around the bowl in the team's colors
    d += `<linearGradient id="${id}-rib" x1="0" y1="0" x2="1" y2="0">${[c1, c2, c1, c2, c1].map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join("")}</linearGradient>`;
    s += `<rect x="0" y="152" width="${W}" height="7" fill="url(#${id}-rib)"/><rect x="0" y="152" width="${W}" height="7" fill="#fff" opacity=".18"/>`;
    for (let x = 4; x < W; x += 6) s += `<rect x="${x}" y="154" width="3" height="3" fill="#fff" opacity=".35"/>`;
    // the big screen over center court
    s += `<line x1="104" y1="0" x2="104" y2="6" stroke="#111" stroke-width="1.5"/><line x1="146" y1="0" x2="146" y2="6" stroke="#111" stroke-width="1.5"/><rect x="92" y="6" width="66" height="36" rx="2" fill="#0d1016" stroke="#454c58"/><rect x="96" y="10" width="58" height="26" fill="${mix(c1, "#000", .35)}"/><rect x="96" y="10" width="58" height="26" fill="url(#${id}-rib)" opacity=".35"/><text x="125" y="27" font-family="${FONT}" font-weight="700" font-size="10" fill="#fff" text-anchor="middle" opacity=".85">${era === "led" ? "DEFENSE!" : "MAKE NOISE"}</text>`;
    if (era === "dome") { // lasers
      for (let i = 0; i < 5; i++) { const x0 = R() * W, x1 = R() * W; s += `<line x1="${f1(x0)}" y1="0" x2="${f1(x1)}" y2="${g.floor}" stroke="${i % 2 ? "#3ff2ff" : "#ff3fa4"}" stroke-width=".9" opacity=".45" style="mix-blend-mode:screen"/>`; }
      for (let i = 0; i < 7; i++) s += star4(R() * W, 45 + R() * 150, 1.4 + R() * 2.2, "#ffffff", f1(.5 + R() * .5));
    } else { // the light rig, phones in the crowd, LED boards courtside
      s += `<rect x="0" y="0" width="${W}" height="5" fill="#15181e"/>`;
      for (let x = 14; x < W; x += 28) s += `<circle cx="${x}" cy="6" r="2.4" fill="#e9f4ff"/><polygon points="${x - 2},7 ${x + 2},7 ${x + 22},120 ${x - 22},120" fill="#cfe6ff" opacity=".05" style="mix-blend-mode:screen"/>`;
      for (let i = 0; i < 34; i++) s += `<circle cx="${f1(R() * W)}" cy="${f1(42 + R() * 180)}" r="${f1(.6 + R() * .7)}" fill="${R() < .7 ? "#ffffff" : "#9ed8ff"}" opacity="${f1(.55 + R() * .45)}"/>`;
      s += `<rect x="0" y="${g.floor - 20}" width="${W}" height="14" fill="url(#${id}-rib)" opacity=".85"/><rect x="0" y="${g.floor - 20}" width="${W}" height="14" fill="#000" opacity=".25"/>`;
    }
  }
  return `<defs>${d}</defs>${s}${floorS}`;
}
const STAGED = new Set(["base", "posterized", "swat", "wrecking", "escape", "fouralarm", "splash", "dimes", "boards", "pickpockets", "buckets", "mvp", "fmvp", "dpoy", "roy", "champ",
  "moments", "fifty", "tripledouble", "postseason", "breakout", "younggun", "numberone", "bench", "prime", "opening", "game7", "dunktober", "rookie", "dynasty",
  // holiday games were played in arenas too: their decorations hang over the room
  "halloween", "thanksgiving", "christmas", "newyear", "valentine", "leapday", "piday", "stpatricks", "friday13"]);
function bg(g, top, bot, glowCol) {
  if (g.stage) return stage(g) + `<defs><linearGradient id="${g.id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>
<radialGradient id="${g.id}-halo" cx=".52" cy=".46" r=".5"><stop offset="0" stop-color="${glowCol || g.acc}" stop-opacity=".55"/><stop offset=".55" stop-color="${glowCol || g.acc}" stop-opacity=".12"/><stop offset="1" stop-color="${glowCol || g.acc}" stop-opacity="0"/></radialGradient>
</defs><rect width="${W}" height="${H}" fill="url(#${g.id}-bg)" opacity=".5" style="mix-blend-mode:color"/><rect width="${W}" height="${H}" fill="url(#${g.id}-bg)" opacity=".42"/>`;
  return `<defs><linearGradient id="${g.id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>
<radialGradient id="${g.id}-halo" cx=".52" cy=".46" r=".5"><stop offset="0" stop-color="${glowCol || g.acc}" stop-opacity=".55"/><stop offset=".55" stop-color="${glowCol || g.acc}" stop-opacity=".12"/><stop offset="1" stop-color="${glowCol || g.acc}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#${g.id}-bg)"/>`;
}
const halo = (g, cx, cy, r) => `<ellipse cx="${cx || 132}" cy="${cy || 168}" rx="${r || 140}" ry="${(r || 140) * 1.05}" fill="url(#${g.id}-halo)"/>`;
function floor(g, col, line) { return `<rect x="0" y="${g.floor}" width="${W}" height="${H - g.floor}" fill="${col || "rgba(0,0,0,.4)"}"/><line x1="0" y1="${g.floor}" x2="${W}" y2="${g.floor}" stroke="${line || "rgba(255,255,255,.22)"}" stroke-width="1.2"/>`; }
function courtLines(g, col, op) { return `<g stroke="${col}" fill="none" opacity="${op}" stroke-width="1.6"><ellipse cx="125" cy="${g.floor + 34}" rx="150" ry="26"/><ellipse cx="125" cy="${g.floor + 34}" rx="70" ry="12"/><line x1="0" y1="${g.floor + 14}" x2="250" y2="${g.floor + 14}"/></g>`; }
function crowd(g, col, y, op) { let s = `<g fill="${col}" opacity="${op}">`; for (let i = 0; i < 40; i++) { const x = (i / 40) * W + g.R() * 6, r = 4 + g.R() * 2.5, yy = y + (i % 3) * 6 + g.R() * 3; s += `<circle cx="${f1(x)}" cy="${f1(yy)}" r="${f1(r)}"/><rect x="${f1(x - r * 1.2)}" y="${f1(yy + r * .7)}" width="${f1(r * 2.4)}" height="${f1(r * 2.4)}" rx="${f1(r)}"/>`; } return s + `</g>`; }
function flames(g, base, h, cols, n) {
  let s = "";
  cols.forEach((c, li) => {
    let d = `M-10,${H + 10} L-10,${base}`; const k = 1 - li * 0.28, step = W / (n || 7);
    for (let x = -10; x < W + 10; x += step) { const tip = base - h * k * (0.55 + g.R() * 0.6); d += ` Q${f1(x + step * 0.15)},${f1(base - h * k * 0.25)} ${f1(x + step * 0.5)},${f1(tip)} Q${f1(x + step * 0.7)},${f1(base - h * k * 0.3)} ${f1(x + step)},${f1(base - g.R() * 10)}`; }
    s += `<path d="${d} L${W + 10},${H + 10}Z" fill="${c}" opacity="${f1(.9 - li * .1)}"/>`;
  });
  return s;
}

const ART = {
  base(g) {
    const y = g.season, c1 = g.c1, c2 = g.c2;
    if (y < 1962) { // 1950s: litho print on cream stock
      return bg(g, "#efe0bd", mix("#b88f55", c1, .18), mix(c1, "#ffffff", .3)) + rays(125, 190, 26, mix(c1, "#efe0bd", .55), .35) + halftone(g.id + "-ht", "#6b4a26", .22, 6)
        + `<circle cx="125" cy="170" r="92" fill="${mix(c1, "#efe0bd", .35)}" opacity=".55"/><circle cx="125" cy="170" r="92" fill="none" stroke="#6b4a26" stroke-width="1.5" opacity=".45" stroke-dasharray="2 3"/>`
        + word(String(y), 125, 330, 120, "#6b4a26", .08) + floor(g, "rgba(107,74,38,.25)", "rgba(107,74,38,.4)");
    }
    if (y < 1979) { // 1960s-70s: bold color fields, TV-screen window, racing stripes
      return bg(g, mix(c1, "#ffffff", .12), mix(c1, "#000000", .45)) + `<rect x="0" y="0" width="${W}" height="${H}" fill="${mix(c2, c1, .3)}" opacity=".25"/>`
        + `<g opacity=".9">${[0, 1, 2].map(i => `<rect x="-20" y="${86 + i * 16}" width="300" height="9" fill="${[c2, "#ffffff", c2][i]}" opacity="${[.55, .25, .35][i]}" transform="rotate(-14 125 120)"/>`).join("")}</g>`
        + `<rect x="34" y="70" width="182" height="170" rx="46" fill="${mix(c1, "#000", .25)}" opacity=".55" stroke="${c2}" stroke-width="3" stroke-opacity=".6"/>` + halo(g) + floor(g);
    }
    if (y < 2000) { // 1980s-90s: neon grid sunset, Memphis shapes
      let s = bg(g, mix(c1, "#0a0420", .65), mix(c2, "#1a0533", .55), mix(c2, "#ff3fa4", .4)) + `<circle cx="125" cy="${g.floor - 40}" r="78" fill="url(#${g.id}-sun)"/><defs><linearGradient id="${g.id}-sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#ff3fa4"/></linearGradient></defs>`;
      for (let i = 0; i < 6; i++) s += `<rect x="40" y="${g.floor - 70 + i * 9}" width="170" height="${2 + i * .6}" fill="${mix(c1, "#0a0420", .6)}"/>`;
      s += `<g stroke="${mix(c2, "#5eead4", .4)}" stroke-width="1" opacity=".55">`; for (let i = 0; i < 13; i++) s += `<line x1="${-260 + i * 64}" y1="${H}" x2="${125}" y2="${g.floor}"/>`; for (let i = 0; i < 6; i++) s += `<line x1="0" y1="${g.floor + i * i * 2.6}" x2="${W}" y2="${g.floor + i * i * 2.6}"/>`; s += `</g>`;
      for (let i = 0; i < 10; i++) { const x = g.R() * W, yy = g.R() * 150 + 20, sh = i % 3; s += sh === 0 ? `<polygon points="${pts([[x, yy], [x + 11, yy + 18], [x - 11, yy + 18]])}" fill="none" stroke="${i % 2 ? c2 : "#5eead4"}" stroke-width="2.2" opacity=".55" transform="rotate(${Math.floor(g.R() * 90)} ${f1(x)} ${f1(yy)})"/>` : sh === 1 ? `<path d="M${f1(x)},${f1(yy)} q6,-8 12,0 t12,0 t12,0" stroke="#ffd166" stroke-width="2.2" fill="none" opacity=".6"/>` : `<circle cx="${f1(x)}" cy="${f1(yy)}" r="4" fill="#ff3fa4" opacity=".55"/>`; }
      return s + halo(g, 132, 170, 120);
    }
    let s = bg(g, mix(c1, "#000", .45), "#05070a", c1) + bokeh(g, 26, [mix(c1, "#fff", .35), mix(c2, "#fff", .2), "#ffffff"], 140, 7) + crowd(g, "#000", 150, .35);
    s += `<path d="M-30,130 L290,30 L290,72 L-30,178Z" fill="${c2}" opacity=".26"/><path d="M-30,200 L290,112 L290,122 L-30,212Z" fill="#fff" opacity=".1"/><path d="M-30,236 L290,170 L290,174 L-30,240Z" fill="${c1}" opacity=".5"/>`;
    return s + halo(g) + floor(g, "rgba(0,0,0,.55)") + courtLines(g, "#ffffff", .1);
  },
  rookie(g) {
    let s = bg(g, mix(g.c1, "#ffffff", .3), mix(g.c1, "#000", .35), "#ffffff") + rays(125, 160, 30, "#ffffff", .1) + stripes(-30, 10, "#fff", .07);
    s += [["#ff5ec4", -40], ["#7ad7ff", -20], ["#ffe066", 0]].map(([c, d]) => `<path d="M-20,${200 + d} L270,${60 + d} L270,${74 + d} L-20,${214 + d}Z" fill="${c}" opacity=".3"/>`).join("");
    s += word("ROOKIE", 125, 150, 70, "#ffffff", .2, -10, 2.2) + halo(g, 132, 168, 130) + floor(g, "rgba(0,0,0,.3)");
    return { bg: s, fg: `<g transform="translate(200 230) rotate(-12)"><path d="M0,-25 L22,-14 V8 Q22,22 0,30 Q-22,22 -22,8 V-14Z" fill="#d7263d" stroke="#fff" stroke-width="2.6"/><text y="9" font-family="${FONT}" font-weight="700" font-size="22" fill="#fff" text-anchor="middle">RC</text></g>` };
  },
  founders(g) {
    let s = bg(g, "#f1dfb3", "#8a6a3e", "#fff2c8") + `<circle cx="160" cy="118" r="44" fill="#fff0c2" opacity=".85"/>` + halftone(g.id + "-ht", "#4a3520", .2, 5);
    s += `<g fill="#4a3520">`;
    for (let i = 0; i < 6; i++) { const x = 6 + i * 44 + g.R() * 8, h = 70 + g.R() * 60; s += `<rect x="${f1(x)}" y="${f1(g.floor - h)}" width="${f1(9 + g.R() * 5)}" height="${f1(h)}" opacity=".7"/>`; for (let k = 0; k < 5; k++) s += `<circle cx="${f1(x + 6 + k * 9 + g.R() * 4)}" cy="${f1(g.floor - h - 8 - k * 13)}" r="${f1(6 + k * 3.4)}" opacity="${f1(.42 - k * .07)}"/>`; }
    s += `<path d="M0,${g.floor - 46} H36 V${g.floor - 82} L66,${g.floor - 64} V${g.floor - 82} L96,${g.floor - 64} V${g.floor - 82} L126,${g.floor - 64} V${g.floor - 82} L156,${g.floor - 64} V${g.floor - 82} L186,${g.floor - 64} V${g.floor - 46} H250 V${g.floor} H0Z" opacity=".78"/></g>`;
    s += `<g transform="translate(125 210)"><path d="M-70,-12 H70 L62,0 L70,12 H-70 L-62,0Z" fill="#7a1f1f" opacity=".85"/><text y="5" font-family="${FONT}" font-weight="700" font-size="14" fill="#f1dfb3" text-anchor="middle" letter-spacing="3">EST. 1954</text></g>`;
    return s + floor(g, "rgba(74,53,32,.35)", "rgba(74,53,32,.5)");
  },
  wba(g) {
    let s = bg(g, "#13205a", "#f8a75b", "#ffd166") + `<circle cx="125" cy="${g.floor - 34}" r="74" fill="url(#${g.id}-sun)"/><defs><linearGradient id="${g.id}-sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#ff5a3c"/></linearGradient></defs>`;
    for (let i = 0; i < 5; i++) s += `<rect x="0" y="${g.floor - 78 + i * 12}" width="${W}" height="${4 + i}" fill="#13205a" opacity=".35"/>`;
    s += `<path d="M0,${g.floor - 30} L28,${g.floor - 74} H82 L96,${g.floor - 42} L140,${g.floor - 42} L150,${g.floor - 96} H204 L218,${g.floor - 30} H250 V${g.floor} H0Z" fill="#4a2015" opacity=".95"/>`;
    for (let i = 0; i < 26; i++) s += star4(g.R() * W, g.R() * 120 + 8, 1 + g.R() * 2.6, "#ffffff", .85);
    s += `<g opacity=".9">${["#d7263d", "#ffffff", "#1f4bd6"].map((c, i) => `<rect x="-20" y="${40 + i * 8}" width="300" height="6" fill="${c}" opacity=".55" transform="rotate(-8 125 50)"/>`).join("")}</g>`;
    return s + word("WBA", 158, 170, 74, "#ffffff", .14, -6) + floor(g, "rgba(40,10,0,.5)");
  },
  posterized(g) {
    let s = bg(g, "#05070d", mix(g.c1, "#000", .65), "#bfe9ff") + crowd(g, "#000", 205, .5) + bokeh(g, 18, ["#ffffff", g.acc, "#9fd3ff"], 150, 6);
    s += spot(176, -10, 120, 70, "#ffffff", .12, g.id) + spot(60, -10, 140, 50, g.acc, .12, g.id);
    s += rays(178, 84, 18, g.acc, .13, 8);
    // shattered glass: radial cracks + shards
    s += `<g stroke="#e7f7ff" stroke-width="1.1" opacity=".75" fill="none">`; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + g.R() * .3; let x = 178, y = 76, d = `M${x},${y}`; for (let k = 0; k < 4; k++) { x += Math.cos(a + (g.R() - .5) * .5) * (10 + g.R() * 9); y += Math.sin(a + (g.R() - .5) * .5) * (10 + g.R() * 9); d += ` L${f1(x)},${f1(y)}`; } s += `<path d="${d}"/>`; } s += `</g>`;
    s += rimSVG(162, 92, 1.08, true);
    for (let i = 0; i < 14; i++) { const x = 130 + g.R() * 120, y = 24 + g.R() * 110, k = 4 + g.R() * 9; s += `<polygon points="${pts([[x, y], [x + k, y + k * .4], [x + k * .3, y + k * 1.1]])}" fill="#e7f7ff" opacity="${f1(.35 + g.R() * .45)}"/>`; }
    s += halo(g, 140, 150, 130) + floor(g, "rgba(0,0,0,.6)") + courtLines(g, "#ffffff", .12);
    return { bg: s, fg: `<g transform="translate(62 200) rotate(-12)"><rect x="-38" y="-15" width="76" height="30" fill="none" stroke="${g.acc}" stroke-width="2.6" opacity=".8"/><text y="9.5" font-family="${FONT}" font-weight="700" font-size="25" fill="${g.acc}" text-anchor="middle" opacity=".85" letter-spacing="2">SLAM</text></g>` };
  },
  swat(g) {
    let s = bg(g, "#020a05", "#0a3b1c", "#9ef01a") + bokeh(g, 16, ["#9ef01a", "#ffffff"], 160, 6);
    for (let i = 0; i < 6; i++) s += `<circle cx="70" cy="70" r="${30 + i * 26}" fill="none" stroke="#9ef01a" stroke-width="${2.4 - i * .3}" opacity="${.42 - i * .06}"/>`;
    s += `<g stroke="#d6ff9a" stroke-width="2" fill="none" opacity=".7" stroke-linejoin="round">`; for (let i = 0; i < 4; i++) { let x = 70, y = 70, d = `M${x},${y}`; const a = rad(10 + i * 50 + g.R() * 20); for (let k = 0; k < 5; k++) { x += Math.cos(a) * 14 + (g.R() - .5) * 14; y += Math.sin(a) * 14 + (g.R() - .5) * 14; d += ` L${f1(x)},${f1(y)}`; } s += `<path d="${d}"/>`; } s += `</g>`;
    s += rimSVG(180, 212, 0.72, true) + halo(g, 132, 160, 130) + floor(g, "rgba(0,0,0,.5)");
    return { bg: s, fg: `<g transform="translate(168 196) rotate(-10)" opacity=".85"><rect x="-62" y="-16" width="124" height="32" fill="none" stroke="#9ef01a" stroke-width="3"/><text y="10" font-family="${FONT}" font-weight="700" font-size="25" fill="#9ef01a" text-anchor="middle" letter-spacing="2">REJECTED</text></g>` };
  },
  wrecking(g) {
    let s = bg(g, "#1b1a17", "#3a2f12", "#f5c400") + halftone(g.id + "-ht", "#000", .25, 7, 0);
    s += `<polygon points="${pts(Array.from({ length: 28 }, (_, i) => { const r = i % 2 ? 50 : 118 + g.R() * 26; const a = i / 28 * Math.PI * 2; return [148 + Math.cos(a) * r, 150 + Math.sin(a) * r]; }))}" fill="#f5c400" opacity=".34"/>`;
    s += `<polygon points="${pts(Array.from({ length: 22 }, (_, i) => { const r = i % 2 ? 30 : 72 + g.R() * 16; const a = i / 22 * Math.PI * 2 + .2; return [148 + Math.cos(a) * r, 150 + Math.sin(a) * r]; }))}" fill="#ff7a1a" opacity=".38"/>`;
    s += `<g stroke="#fff" stroke-width="1.6" opacity=".4" fill="none">`; for (let i = 0; i < 7; i++) { let x = 148, y = 150, d = `M${x},${y}`; const a = g.R() * Math.PI * 2; for (let k = 0; k < 4; k++) { x += Math.cos(a + (g.R() - .5)) * 24; y += Math.sin(a + (g.R() - .5)) * 24; d += ` L${f1(x)},${f1(y)}`; } s += `<path d="${d}"/>`; } s += `</g>`;
    for (let i = 0; i < 16; i++) { const x = g.R() * W, y = g.R() * 260, k = 2 + g.R() * 5; s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(k)}" height="${f1(k)}" fill="#d9c9a0" opacity=".5" transform="rotate(${Math.floor(g.R() * 90)} ${f1(x)} ${f1(y)})"/>`; }
    const haz = `<g clip-path="url(#${g.id}-hz)">${stripes(45, 9, "#f5c400", .95)}</g><clipPath id="${g.id}-hz"><rect x="0" y="${g.floor + 4}" width="${W}" height="14"/></clipPath>`;
    return { bg: s + floor(g, "rgba(0,0,0,.55)") + haz, fg: word("HIT!", 188, 150, 40, "#ffffff", .85, -14) };
  },
  escape(g) {
    let s = bg(g, mix(g.c1, "#000", .62), "#060910", "#7fd3ff") + bokeh(g, 14, ["#7fd3ff", "#ffffff"], 160, 6);
    for (let i = 0; i < 34; i++) { const y = g.R() * H, l = 40 + g.R() * 140, x = g.R() * (W + 80); s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x - l)}" y2="${f1(y)}" stroke="${i % 4 ? "#ffffff" : "#7fd3ff"}" stroke-width="${f1(.8 + g.R() * 2.2)}" opacity="${f1(.1 + g.R() * .3)}" stroke-linecap="round"/>`; }
    s += `<g stroke="#9aa4b2" stroke-width="3.2" fill="none" opacity=".45"><ellipse cx="40" cy="96" rx="13" ry="7" transform="rotate(-30 40 96)"/><ellipse cx="58" cy="86" rx="13" ry="7" transform="rotate(-30 58 86)" stroke-dasharray="26 10"/><ellipse cx="86" cy="70" rx="13" ry="7" transform="rotate(-30 86 70)" stroke-dasharray="8 30"/></g>`;
    return s + halo(g, 140, 170, 120) + floor(g);
  },
  fouralarm(g) {
    let s = bg(g, "#120202", "#4a0a00", "#ff6a1f") + word("4", 160, 268, 290, "url(#" + g.id + "-chrome)", .22);
    s += `<defs><linearGradient id="${g.id}-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#ffb347"/><stop offset=".52" stop-color="#7a2a00"/><stop offset="1" stop-color="#ff6a1f"/></linearGradient></defs>`;
    for (let i = 0; i < 4; i++) s += `<ellipse cx="125" cy="${g.floor + 40}" rx="${126 + i * 26}" ry="${100 + i * 22}" fill="none" stroke="#ffb347" stroke-width="${i === 3 ? 2.5 : 1.4}" stroke-dasharray="${i === 3 ? "0" : "5 6"}" opacity="${.16 + i * .08}"/>`;
    s += halo(g, 132, 170, 130) + flames(g, H - 40, 120, ["#ff3d00", "#ff7a1a", "#ffd166"], 7);
    for (let i = 0; i < 26; i++) s += `<circle cx="${f1(g.R() * W)}" cy="${f1(80 + g.R() * 220)}" r="${f1(.8 + g.R() * 1.8)}" fill="#ffd166" opacity="${f1(.4 + g.R() * .6)}"/>`;
    return s + `<text x="206" y="84" font-family="${FONT}" font-weight="700" font-size="16" fill="#ffd166" opacity=".55" text-anchor="middle" letter-spacing="2">30 FT</text>`;
  },
  splash(g) {
    let s = bg(g, "#021a33", "#0a6aa0", "#7fd3ff") + word("3", 160, 270, 290, "#7fd3ff", .14) + bokeh(g, 20, ["#bfe9ff", "#ffffff"], 220, 8);
    for (let i = 0; i < 6; i++) s += `<ellipse cx="128" cy="${g.floor + 8}" rx="${28 + i * 32}" ry="${6 + i * 6.5}" fill="none" stroke="#bfe9ff" stroke-width="1.6" opacity="${.5 - i * .07}"/>`;
    let crown = `M30,${g.floor + 4}`; for (let i = 0; i < 9; i++) { const x = 30 + i * 22; crown += ` Q${x + 6},${g.floor - 34 - g.R() * 22} ${x + 11},${g.floor - 8} Q${x + 16},${g.floor - 22 - g.R() * 16} ${x + 22},${g.floor + 4}`; }
    s += `<path d="${crown}Z" fill="#bfe9ff" opacity=".28"/>`;
    for (let i = 0; i < 26; i++) { const x = g.R() * W, y = g.R() * 240 + 20, r = 2 + g.R() * 5; s += `<path d="M${f1(x)},${f1(y - r * 1.9)} Q${f1(x + r)},${f1(y)} ${f1(x)},${f1(y + r)} Q${f1(x - r)},${f1(y)} ${f1(x)},${f1(y - r * 1.9)}Z" fill="#dff4ff" opacity="${f1(.25 + g.R() * .45)}"/>`; }
    return s + halo(g, 132, 168, 120) + floor(g, "rgba(0,40,80,.4)");
  },
  dimes(g) {
    let s = bg(g, "#04201f", "#081a2b", "#5eead4"); const nodes = Array.from({ length: 10 }, () => [16 + g.R() * 218, 18 + g.R() * 230]);
    s += `<g stroke="#5eead4" stroke-width="1.5" opacity=".5">`; nodes.forEach((a, i) => nodes.slice(i + 1).forEach(b => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 110) s += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke-dasharray="5 4"/>`; })); s += `</g>`;
    s += `<g filter="url(#${g.id}-blur)">${nodes.map(([x, y]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="9" fill="#5eead4" opacity=".5"/>`).join("")}</g>`;
    for (const [x, y] of nodes.slice(0, 7)) s += `<g transform="translate(${f1(x)} ${f1(y)})"><circle r="8.5" fill="url(#silverg)" stroke="#2c3e50" stroke-width="1"/><circle r="6.2" fill="none" stroke="#2c3e50" stroke-width=".6" opacity=".6"/><text y="2.8" font-size="7" font-family="${FONT}" font-weight="700" text-anchor="middle" fill="#2c3e50">10¢</text></g>`;
    return s + halo(g, 132, 168, 120) + floor(g);
  },
  boards(g) {
    let s = bg(g, "#070e1c", mix(g.c1, "#000", .62), "#9fc5ff");
    s += `<g stroke="#9fc5ff" opacity=".14">`; for (let x = 0; x <= W; x += 20) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`; for (let y = 0; y <= H; y += 20) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`; s += `</g>`;
    s += `<rect x="34" y="16" width="182" height="116" rx="5" fill="rgba(200,230,255,.1)" stroke="rgba(255,255,255,.7)" stroke-width="3.2"/><rect x="94" y="54" width="62" height="46" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.6"/>`;
    s += `<path d="M44,24 L90,24 L56,64Z" fill="#fff" opacity=".08"/><ellipse cx="125" cy="134" rx="31" ry="6.5" fill="none" stroke="#ff7a1a" stroke-width="3.8"/>`;
    s += `<g stroke="#fff" opacity=".6" stroke-width="1"><path d="M95,134 L102,164 M108,136 L110,166 M125,137 L125,168 M142,136 L140,166 M155,134 L148,164 M95,134 L110,166 M108,136 L125,168 M125,137 L140,166 M142,136 L148,164 M100,150 H150"/></g>`;
    return s + halo(g, 132, 175, 120) + floor(g);
  },
  pickpockets(g) {
    let s = bg(g, "#0b0613", "#24103c", "#d9c7ff");
    s += `<pattern id="${g.id}-brk" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="none" stroke="#b48cff" stroke-width=".8"/><line x1="14" y1="7" x2="14" y2="14" stroke="#b48cff" stroke-width=".8"/><line x1="0" y1="7" x2="28" y2="7" stroke="#b48cff" stroke-width=".8"/></pattern><rect width="${W}" height="${g.floor}" fill="url(#${g.id}-brk)" opacity=".14"/>`;
    s += spot(30, -10, 120, 90, "#ffffff", .1, g.id);
    s += `<g stroke="#ff2a4a" stroke-width="1.4" opacity=".75">${[[0, 60, 250, 150], [0, 210, 250, 90], [0, 120, 250, 236], [20, 0, 230, 260]].map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join("")}</g>`;
    s += `<g stroke="#ff2a4a" stroke-width="5" opacity=".18" filter="url(#${g.id}-blur)">${[[0, 60, 250, 150], [0, 210, 250, 90]].map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"/>`).join("")}</g>`;
    for (let i = 0; i < 6; i++) { const x = 20 + i * 40, y = g.floor + 14 + (i % 2) * 10; s += `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.2" fill="#b48cff" opacity=".35"/>`; }
    return s + halo(g, 132, 168, 120) + floor(g, "rgba(0,0,0,.4)") + word("STOLEN", 160, 120, 46, "#b48cff", .18, -10);
  },
  buckets(g) {
    let s = bg(g, "#0e0b02", "#3a2a00", "#ffcf3d");
    const txt = String(g.value || "").replace(".", "").slice(0, 3) || "00";
    const DIG = { 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111" };
    s += `<rect x="14" y="22" width="222" height="112" rx="6" fill="#050402" stroke="#5a4708" stroke-width="2"/>`;
    s += `<g filter="url(#${g.id}-blur)" fill="#ffcf3d">`; txt.split("").forEach((d, k2) => { const m = DIG[d] || DIG[0]; for (let i = 0; i < 15; i++) if (m[i] === "1") s += `<circle cx="${34 + k2 * 70 + (i % 3) * 17}" cy="${40 + Math.floor(i / 3) * 18}" r="7" opacity=".5"/>`; }); s += `</g>`;
    s += `<g fill="#ffcf3d">`; txt.split("").forEach((d, k2) => { const m = DIG[d] || DIG[0]; for (let i = 0; i < 15; i++) s += `<circle cx="${34 + k2 * 70 + (i % 3) * 17}" cy="${40 + Math.floor(i / 3) * 18}" r="6" opacity="${m[i] === "1" ? .9 : .07}"/>`; }); s += `</g>`;
    s += spot(60, 130, 90, 40, "#ffcf3d", .1, g.id) + spot(190, 130, 160, 40, "#ffcf3d", .1, g.id);
    return s + halo(g, 132, 190, 110) + floor(g);
  },
  mvp(g) {
    let s = bg(g, "#140e03", "#4a3200", "#ffd56b") + rays(132, 165, 32, "#ffd56b", .1) + bokeh(g, 20, ["#ffe9a8", "#ffffff"], 180, 7);
    s += `<g fill="url(#goldg)" opacity=".55">`; for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 11; i++) { const a = rad(105 + i * 15), x = 132 + side * Math.cos(a) * -96, y = 172 + Math.sin(a) * 96; s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="11" ry="4.6" transform="rotate(${f1(side * (i * 15 + 15))} ${f1(x)} ${f1(y)})"/>`; } s += `</g>`;
    return s + halo(g, 132, 160, 130) + word("MVP", 150, 150, 84, "#ffd56b", .17) + sparkles(g.R, 12, "#fff3c2") + floor(g);
  },
  fmvp(g) {
    let s = bg(g, "#0b0b10", mix(g.c1, "#000", .55), "#ffd56b") + spot(40, -10, 100, 60, "#ffd56b", .14, g.id) + spot(210, -10, 150, 60, "#ffffff", .1, g.id);
    s += crowd(g, "#000", 200, .5) + `<g opacity=".2">${trophySVG(132, 214, 4.4)}</g>` + halo(g, 132, 160, 130);
    return { bg: s + floor(g), fg: confetti(g.R, 46, [g.c1, g.c2, "#ffd56b", "#ffffff"], 300) };
  },
  dpoy(g) {
    let s = bg(g, "#071016", "#1b2733", "#9fd0ff");
    s += `<pattern id="${g.id}-fence" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="none" stroke="#a8bed3" stroke-width="1.4"/></pattern><rect width="${W}" height="${H}" fill="url(#${g.id}-fence)" opacity=".24"/>`;
    s += `<path d="M132,36 L204,58 V128 Q204,190 132,224 Q60,190 60,128 V58Z" fill="${g.acc}" opacity=".16" stroke="${g.acc}" stroke-width="3" stroke-opacity=".45"/>`;
    s += `<g transform="translate(132 112)" opacity=".28"><path d="M-14,-6 V-16 A14,14 0 0 1 14,-16 V-6" stroke="#cfe0f0" stroke-width="5" fill="none"/><rect x="-20" y="-6" width="40" height="30" rx="3" fill="#cfe0f0"/></g>`;
    return s + halo(g, 132, 165, 120) + word("LOCKDOWN", 125, 312, 38, "#a8bed3", .18) + floor(g);
  },
  roy(g) {
    let s = bg(g, "#ffb35c", "#5a1e00", "#ffe08a") + `<circle cx="132" cy="${g.floor - 14}" r="96" fill="#ffd166" opacity=".6"/>` + rays(132, g.floor - 14, 24, "#fff4c2", .22);
    s += `<g fill="#5a1e00" opacity=".25">${[0, 1, 2].map(i => `<rect x="0" y="${g.floor - 40 + i * 12}" width="${W}" height="${3 + i * 2}"/>`).join("")}</g>`;
    return s + floor(g, "rgba(60,20,0,.5)") + word("ROY", 150, 150, 78, "#ffffff", .2) + sparkles(g.R, 8, "#ffffff", 150);
  },
  champ(g) {
    let s = bg(g, mix(g.c1, "#000", .25), mix(g.c2, "#000", .55), "#ffd56b") + rays(132, 140, 24, "#ffffff", .08);
    s += `<g transform="translate(132 128)" opacity=".3"><ellipse rx="64" ry="42" fill="none" stroke="url(#goldg)" stroke-width="18"/><path d="M-26,-48 L0,-74 L26,-48Z" fill="url(#goldg)"/><circle cy="-58" r="11" fill="#ffffff"/></g>`;
    s += `<g transform="translate(125 300)"><path d="M-80,-14 H80 L70,0 L80,14 H-80 L-70,0Z" fill="${g.c1}" opacity=".7" stroke="#ffd56b" stroke-width="1.5"/></g>`;
    return { bg: s + halo(g, 132, 160, 130) + floor(g), fg: confetti(g.R, 50, [g.c1, g.c2, "#ffd56b", "#ffffff"], 300) };
  },
  ironworkers(g) {
    let s = bg(g, "#2a2622", "#0f0c0a", "#ff8a3d");
    const beam = (y, a) => `<g transform="rotate(${a} 125 ${y})"><rect x="-40" y="${y - 10}" width="330" height="20" fill="#9a4517"/><rect x="-40" y="${y - 10}" width="330" height="4" fill="#ff8a3d" opacity=".6"/><rect x="-40" y="${y + 6}" width="330" height="4" fill="#4a1c06"/>${Array.from({ length: 14 }, (_, i) => `<circle cx="${-30 + i * 24}" cy="${y}" r="2.4" fill="#2a2622"/><circle cx="${-30.6 + i * 24}" cy="${y - .6}" r="1" fill="#ffb37a" opacity=".6"/>`).join("")}</g>`;
    s += `<g opacity=".7">${beam(56, -8) + beam(168, 6)}</g><g opacity=".4" stroke="#9a4517" stroke-width="6">${[0, 1, 2, 3, 4, 5].map(i => `<line x1="${i * 50}" y1="58" x2="${i * 50 + 50}" y2="168"/>`).join("")}</g>`;
    for (let i = 0; i < 30; i++) { const a = rad(200 + g.R() * 140), l = 6 + g.R() * 18, x = 40 + g.R() * 30, y = 160 + g.R() * 20; s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x + Math.cos(a) * l)}" y2="${f1(y + Math.sin(a) * l)}" stroke="#ffd166" stroke-width="${f1(.7 + g.R())}" opacity="${f1(.5 + g.R() * .5)}" stroke-linecap="round"/>`; }
    return s + halo(g, 132, 168, 120) + floor(g, "rgba(0,0,0,.45)") + word("82", 206, 312, 46, "#ff8a3d", .25);
  },
  prime(g) {
    let s = bg(g, "#160a33", "#ff7e5f", "#ffd166") + `<circle cx="132" cy="${g.floor - 64}" r="62" fill="#ffd166" opacity=".65"/>`;
    for (let i = 0; i < 24; i++) s += star4(g.R() * W, g.R() * 110 + 10, .8 + g.R() * 2, "#ffffff", .8);
    s += `<polygon points="0,${g.floor} 56,${g.floor - 124} 92,${g.floor - 84} 134,${g.floor - 176} 198,${g.floor - 74} 250,${g.floor - 114} 250,${g.floor}" fill="#2d1b4e" opacity=".9"/><polygon points="0,${g.floor} 40,${g.floor - 60} 90,${g.floor - 30} 150,${g.floor - 90} 210,${g.floor - 40} 250,${g.floor - 60} 250,${g.floor}" fill="#1b1033" opacity=".9"/><polygon points="134,${g.floor - 176} 150,${g.floor - 150} 130,${g.floor - 154} 120,${g.floor - 146}" fill="#fff" opacity=".75"/>`;
    return s + halo(g, 132, 168, 110);
  },
  hof(g) {
    let s = bg(g, "#f2ece0", "#b4a98f", "#fff3c2");
    s += `<g stroke="#8c8270" fill="none" opacity=".32">`; for (let i = 0; i < 8; i++) { let d = `M${f1(g.R() * W)},0`; for (let k = 0; k < 6; k++) d += ` Q${f1(g.R() * W)},${f1(k * 60 + 30)} ${f1(g.R() * W)},${f1(k * 60 + 60)}`; s += `<path d="${d}" stroke-width="${f1(.6 + g.R() * 1.4)}"/>`; } s += `</g>`;
    for (const x of [30, 220]) s += `<rect x="${x - 13}" y="40" width="26" height="${g.floor - 40}" fill="url(#goldg)" opacity=".6"/>${[0, 1, 2, 3].map(i => `<line x1="${x - 7 + i * 4.6}" y1="46" x2="${x - 7 + i * 4.6}" y2="${g.floor - 6}" stroke="#7a5a12" opacity=".35"/>`).join("")}<rect x="${x - 17}" y="30" width="34" height="11" fill="url(#goldg)" opacity=".75"/><rect x="${x - 17}" y="${g.floor - 8}" width="34" height="8" fill="url(#goldg)" opacity=".75"/>`;
    s += `<path d="M10,30 L125,6 L240,30Z" fill="url(#goldg)" opacity=".55"/>`;
    return s + halo(g, 132, 168, 120) + floor(g, "rgba(90,70,30,.28)") + word("HALL OF FAME", 132, 132, 28, "#7a5a12", .35);
  },
  moments(g) {
    const k = (g.extra && g.extra.k) || "pts", lab = { pts: "POINTS", reb: "REBOUNDS", ast: "ASSISTS", tkl: "TACKLES", dnk: "DUNKS", fpm: "FOURS" }[k];
    let s = bg(g, "#06080c", mix(g.c1, "#000", .6), "#ffffff") + crowd(g, "#000", 196, .55) + bokeh(g, 22, ["#ffffff", g.acc, mix(g.c1, "#fff", .4)], 170, 6);
    s += spot(70, -10, 110, 60, "#ffffff", .14, g.id) + spot(190, -10, 150, 60, "#ffffff", .12, g.id);
    s += `<g opacity=".14">${Array.from({ length: 60 }, (_, i) => `<rect x="0" y="${i * 6}" width="${W}" height="2" fill="#fff"/>`).join("")}</g>`;
    s += word(String(g.value || "").split(" ")[0], 150, 196, 150, "#ffffff", .1);
    if (k === "dnk") s += rimSVG(162, 92, 1.08, true);
    s += halo(g, 132, 165, 125) + floor(g, "rgba(0,0,0,.55)") + courtLines(g, "#ffffff", .12);
    const opp = g.extra && g.extra.o ? "VS " + g.extra.o : "", day = g.extra && g.extra.d !== null && g.extra.d !== undefined ? "DAY " + (g.extra.d + 1) : "";
    const bug = `<g transform="translate(22 196)"><rect x="0" y="0" width="104" height="30" rx="3" fill="rgba(5,7,10,.82)" stroke="${g.acc}" stroke-width="1"/><rect x="0" y="0" width="5" height="30" fill="${g.acc}"/><text x="12" y="13" font-family="${FONT}" font-size="9" fill="#cfd6e0" letter-spacing="1.2">${xe(lab)}</text><text x="12" y="25" font-family="${FONT}" font-weight="700" font-size="11" fill="#fff" letter-spacing=".8">${xe([opp, day].filter(Boolean).join(" · "))}</text><circle cx="96" cy="9" r="3" fill="#ff2a4a"/></g>`;
    return { bg: s, fg: bug };
  },
  fifty(g) {
    let s = bg(g, "#120d02", "#3d2a00", "#ffd56b") + rays(132, 150, 28, "#ffd56b", .08);
    s += `<defs><linearGradient id="${g.id}-chr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset=".48" stop-color="#ffd56b"/><stop offset=".5" stop-color="#7a5a12"/><stop offset="1" stop-color="#ffe9a8"/></linearGradient></defs>`;
    s += word("50", 132, 210, 190, `url(#${g.id}-chr)`, .32) + word("50", 132, 210, 190, "#7a5a12", .5, 0, 1.5);
    for (let b = 0; b < 3; b++) { const cx = 40 + g.R() * 170, cy = 30 + g.R() * 90, col = ["#ffd56b", "#ff5ec4", "#7ad7ff"][b]; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = 14 + g.R() * 14; s += `<line x1="${f1(cx + Math.cos(a) * 4)}" y1="${f1(cy + Math.sin(a) * 4)}" x2="${f1(cx + Math.cos(a) * r)}" y2="${f1(cy + Math.sin(a) * r)}" stroke="${col}" stroke-width="1.4" opacity=".7" stroke-linecap="round"/>`; } }
    return s + halo(g, 132, 165, 125) + sparkles(g.R, 12, "#fff3c2") + floor(g);
  },
  tripledouble(g) {
    let s = bg(g, "#0b0620", "#230b3d", "#c58bff");
    for (let i = 0; i < 3; i++) s += `<circle cx="132" cy="150" r="${58 + i * 26}" fill="none" stroke="${["#c58bff", "#5eead4", "#ffd166"][i]}" stroke-width="${7 - i * 1.5}" opacity="${.35 - i * .06}" stroke-dasharray="${i === 1 ? "14 8" : "0"}"/>`;
    s += [["10", 54, 66], ["10", 206, 120], ["10", 58, 206]].map(([t, x, y]) => `<g transform="translate(${x} ${y})"><circle r="17" fill="rgba(5,7,10,.6)" stroke="#c58bff" stroke-width="1.6"/><text y="6" font-family="${FONT}" font-weight="700" font-size="16" fill="#fff" text-anchor="middle">${t}</text></g>`).join("");
    return s + bokeh(g, 14, ["#c58bff", "#5eead4"], 200, 6) + halo(g, 132, 160, 120) + floor(g);
  },
  postseason(g) {
    let s = bg(g, "#120304", "#4a0a12", "#ff5a3c") + crowd(g, "#000", 198, .5);
    s += `<g stroke="#ff8a6a" stroke-width="1.6" fill="none" opacity=".45">`; for (let i = 0; i < 8; i++) { const y = 26 + i * 24; s += `<path d="M14,${y} H44 V${y + 12} H58"/><path d="M236,${y} H206 V${y + 12} H192"/>`; } for (let i = 0; i < 4; i++) { const y = 38 + i * 48; s += `<path d="M58,${y} H74 V${y + 24} H86"/><path d="M192,${y} H176 V${y + 24} H164"/>`; } s += `</g>`;
    s += `<g opacity=".3">${flames(g, H - 40, 70, ["#ff3d00", "#ff7a1a"], 9)}</g>`;
    return s + halo(g, 132, 165, 125) + floor(g) + word("PLAYOFFS", 125, 320, 34, "#ff8a6a", .18);
  },
  dynasty(g) {
    let s = bg(g, "#1a0b2e", "#3b1a00", "#ffd56b") + rays(132, 140, 26, "#ffd56b", .08);
    s += `<g transform="translate(132 58)" opacity=".55"><path d="M-40,22 L-46,-14 L-22,6 L0,-26 L22,6 L46,-14 L40,22Z" fill="url(#goldg)" stroke="#7a5a12" stroke-width="1.2"/><rect x="-40" y="22" width="80" height="8" fill="url(#goldg)"/>${[-30, 0, 30].map(x => `<circle cx="${x}" cy="26" r="2.6" fill="#ff3f60"/>`).join("")}</g>`;
    s += [70, 132, 194].map((x, i) => `<g transform="translate(${x} ${g.floor - 6})" opacity="${.5 + i * .1}">${trophySVG(0, 0, 1.25)}</g>`).join("");
    return { bg: s + halo(g, 132, 165, 125) + floor(g), fg: confetti(g.R, 36, ["#ffd56b", "#c58bff", "#ffffff"], 260) };
  },
  numberone(g) {
    let s = bg(g, "#05070d", mix(g.c1, "#000", .55), "#ffffff");
    s += `<defs><linearGradient id="${g.id}-chr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="${mix(g.c1, "#fff", .4)}"/><stop offset="1" stop-color="${g.c1}"/></linearGradient></defs>`;
    s += word("1", 150, 270, 300, `url(#${g.id}-chr)`, .28) + spot(132, -10, 132, 70, "#ffffff", .2, g.id);
    s += `<rect x="40" y="${g.floor - 10}" width="170" height="10" fill="${g.c1}" opacity=".7"/><rect x="40" y="${g.floor - 12}" width="170" height="2" fill="#fff" opacity=".5"/>`;
    return { bg: s + halo(g, 132, 160, 120) + floor(g), fg: confetti(g.R, 26, [g.c1, g.c2, "#ffffff"], 220) };
  },
  younggun(g) {
    let s = bg(g, "#1a1a1f", "#2b2230", "#ff3fa4");
    s += `<pattern id="${g.id}-brk" width="30" height="15" patternUnits="userSpaceOnUse"><rect width="30" height="15" fill="#3a2a2a"/><rect x="1" y="1" width="28" height="6" fill="#4a3434"/><rect x="-14" y="8.5" width="28" height="6" fill="#4a3434"/><rect x="16" y="8.5" width="28" height="6" fill="#4a3434"/></pattern><rect width="${W}" height="${g.floor}" fill="url(#${g.id}-brk)" opacity=".7"/>`;
    for (let i = 0; i < 7; i++) { const x = g.R() * W, y = g.R() * 220, r = 10 + g.R() * 26, c = ["#ff3fa4", "#5eead4", "#ffd166", "#7ad7ff"][i % 4]; s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${c}" opacity=".35" filter="url(#${g.id}-blur)"/>`; for (let k = 0; k < 7; k++) s += `<circle cx="${f1(x + (g.R() - .5) * r * 2.6)}" cy="${f1(y + (g.R() - .5) * r * 2.6)}" r="${f1(1 + g.R() * 2.5)}" fill="${c}" opacity=".6"/>`; }
    s += `<text x="150" y="128" font-family="'Permanent Marker', 'Comic Sans MS', ${FONT}" font-weight="700" font-size="46" fill="none" stroke="#5eead4" stroke-width="2.4" opacity=".5" transform="rotate(-12 150 128)">YOUNG</text>`;
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(0,0,0,.5)");
  },
  breakout(g) {
    let s = bg(g, "#05070a", mix(g.c1, "#000", .6), g.acc);
    s += `<rect x="30" y="30" width="190" height="230" fill="none" stroke="#9aa4b2" stroke-width="4" opacity=".35"/>`;
    s += `<g stroke="${g.acc}" stroke-width="2" fill="none" opacity=".85">`; for (let i = 0; i < 9; i++) { let x = 132 + (g.R() - .5) * 20, y = 150 + (g.R() - .5) * 20, d = `M${f1(x)},${f1(y)}`; const a = g.R() * Math.PI * 2; for (let k = 0; k < 5; k++) { x += Math.cos(a + (g.R() - .5) * .9) * 22; y += Math.sin(a + (g.R() - .5) * .9) * 22; d += ` L${f1(x)},${f1(y)}`; } s += `<path d="${d}"/>`; } s += `</g>`;
    s += rays(132, 150, 20, g.acc, .14);
    for (let i = 0; i < 12; i++) { const x = g.R() * W, y = g.R() * 250, k = 4 + g.R() * 10; s += `<polygon points="${pts([[x, y], [x + k, y + k * .3], [x + k * .4, y + k]])}" fill="#9aa4b2" opacity=".45"/>`; }
    s += `<g fill="${g.acc}" opacity=".35">${[40, 210].map(x => `<path d="M${x},${g.floor - 30} l-10,0 l10,-18 l10,18 l-10,0 v20 h0Z"/>`).join("")}</g>`;
    return s + halo(g, 132, 160, 130) + floor(g);
  },
  bench(g) {
    let s = bg(g, "#0c1018", mix(g.c1, "#000", .55), "#ffd166") + crowd(g, "#000", 160, .45);
    s += `<rect x="-10" y="${g.floor - 34}" width="270" height="12" rx="3" fill="#7a5230"/><rect x="-10" y="${g.floor - 34}" width="270" height="3" fill="#b07a48"/>${[20, 90, 160, 230].map(x => `<rect x="${x}" y="${g.floor - 22}" width="6" height="22" fill="#4a3018"/>`).join("")}`;
    s += [30, 200].map(x => `<path d="M${x},${g.floor - 34} q8,-14 16,0 l-2,18 h-12z" fill="#f4f4f4" opacity=".6"/>`).join("");
    s += `<g stroke="#ffd166" stroke-width="2.4" fill="none" opacity=".75" stroke-linejoin="round">${[[40, 40], [200, 70], [60, 150]].map(([x, y]) => `<path d="M${x},${y} l10,14 h-8 l10,16"/>`).join("")}</g>`;
    return s + halo(g, 132, 165, 120) + floor(g);
  },
  ageless(g) {
    let s = bg(g, "#e8dcc0", "#8a744e", "#fff2c8") + halftone(g.id + "-ht", "#5a4426", .16, 6);
    s += `<g transform="translate(132 120)" opacity=".28" stroke="#5a4426" fill="none"><circle r="80" stroke-width="3"/><circle r="72" stroke-width="1"/>${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-66" x2="0" y2="-58" stroke-width="3" transform="rotate(${i * 30})"/>`).join("")}<line x1="0" y1="0" x2="0" y2="-48" stroke-width="4" transform="rotate(${Math.floor(g.R() * 360)})"/><line x1="0" y1="0" x2="0" y2="-62" stroke-width="2.4" transform="rotate(${Math.floor(g.R() * 360)})"/></g>`;
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(90,68,38,.35)") + word("AGELESS", 125, 318, 34, "#5a4426", .2);
  },
  franchise(g) {
    let s = bg(g, mix(g.c1, "#000", .55), "#05070a", g.c1) + bokeh(g, 16, ["#ffffff", mix(g.c1, "#fff", .4)], 120, 5);
    s += `<rect x="0" y="0" width="${W}" height="10" fill="#1a1d22"/>`;
    s += [[28, 0.9], [76, 1], [174, 1], [222, 0.9]].map(([x, k], i) => `<g transform="translate(${x} 10) scale(${k})"><path d="M-18,0 H18 V64 L0,76 L-18,64Z" fill="${i % 2 ? g.c1 : mix(g.c1, "#000", .25)}" stroke="${g.c2}" stroke-width="2"/><text y="44" font-family="${FONT}" font-weight="700" font-size="22" fill="${g.c2}" text-anchor="middle">${i === 1 || i === 2 ? xe(g.num) : String(10 + Math.floor(g.R() * 80))}</text><rect x="-18" y="6" width="36" height="5" fill="${g.c2}" opacity=".7"/></g>`).join("");
    return s + halo(g, 132, 165, 125) + floor(g) + courtLines(g, "#ffffff", .1);
  },
  journeyman(g) {
    let s = bg(g, "#e6d8b8", "#a88c5c", "#fff4d6");
    s += `<g stroke="#8a6d3e" stroke-width=".8" opacity=".3">${Array.from({ length: 10 }, (_, i) => `<line x1="0" y1="${i * 34}" x2="${W}" y2="${i * 34 + 10}"/><line x1="${i * 28}" y1="0" x2="${i * 28 - 10}" y2="${H}"/>`).join("")}</g>`;
    const pinsXY = Array.from({ length: 7 }, () => [20 + g.R() * 210, 24 + g.R() * 200]);
    s += `<path d="M${pinsXY.map(P2).join(" L")}" stroke="#b3122b" stroke-width="2" stroke-dasharray="5 4" fill="none" opacity=".7"/>`;
    s += pinsXY.map(([x, y]) => `<g transform="translate(${f1(x)} ${f1(y)})"><path d="M0,0 C-6,-8 -6,-14 0,-14 C6,-14 6,-8 0,0Z" fill="#b3122b"/><circle cy="-10" r="2.2" fill="#fff"/></g>`).join("");
    s += `<g transform="translate(196 236) rotate(8)" opacity=".7"><rect x="-26" y="-12" width="52" height="24" rx="3" fill="#f4e7c8" stroke="#6b5229" stroke-width="1.4"/><text y="5" font-family="${FONT}" font-weight="700" font-size="11" fill="#6b5229" text-anchor="middle">${xe(String(g.value || "") + " TEAMS")}</text></g>`;
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(90,68,38,.3)");
  },
  expansion(g) {
    let s = bg(g, "#0a2a5a", "#061833", "#7ad7ff");
    s += `<g stroke="#9fd3ff" opacity=".22">${Array.from({ length: 26 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="${H}" stroke-width="${i % 5 ? .5 : 1.2}"/><line x1="0" y1="${i * 14}" x2="${W}" y2="${i * 14}" stroke-width="${i % 5 ? .5 : 1.2}"/>`).join("")}</g>`;
    s += `<g stroke="#dff4ff" stroke-width="1.6" fill="none" opacity=".55"><rect x="30" y="${g.floor - 120}" width="190" height="120"/><path d="M30,${g.floor - 120} L125,${g.floor - 170} L220,${g.floor - 120}"/><ellipse cx="125" cy="${g.floor - 60}" rx="60" ry="22"/><line x1="125" y1="${g.floor - 170}" x2="125" y2="${g.floor}" stroke-dasharray="4 4"/></g>`;
    s += `<text x="40" y="44" font-family="${FONT}" font-size="9" fill="#dff4ff" opacity=".6" letter-spacing="1.5">PLAN NO. ${xe(String(g.season))}-01</text>`;
    return { bg: s + halo(g, 132, 165, 120) + floor(g, "rgba(0,10,30,.5)"), fg: `<g transform="translate(192 214) rotate(-12)" opacity=".85"><rect x="-26" y="-13" width="52" height="26" fill="none" stroke="#ffd166" stroke-width="2.6"/><text y="7" font-family="${FONT}" font-weight="700" font-size="18" fill="#ffd166" text-anchor="middle" letter-spacing="2">NEW</text></g>` };
  },
  skyscrapers(g) {
    let s = bg(g, "#7fb6e8", "#1b2a4a", "#ffffff");
    for (let i = 0; i < 4; i++) s += `<ellipse cx="${f1(g.R() * W)}" cy="${f1(20 + g.R() * 80)}" rx="${f1(30 + g.R() * 30)}" ry="${f1(8 + g.R() * 6)}" fill="#fff" opacity=".35" filter="url(#${g.id}-blur)"/>`;
    const bld = (x, w, h, c) => { let b = `<rect x="${x}" y="${g.floor - h}" width="${w}" height="${h}" fill="${c}"/>`; for (let yy = g.floor - h + 6; yy < g.floor - 4; yy += 9) for (let xx = x + 4; xx < x + w - 4; xx += 7) b += `<rect x="${xx}" y="${yy}" width="3" height="4" fill="#ffe9a8" opacity="${g.R() < .45 ? .8 : .12}"/>`; return b; };
    s += `<g opacity=".9">${bld(0, 40, 210, "#22314f")}${bld(44, 30, 150, "#2a3a5c")}${bld(186, 34, 230, "#22314f")}${bld(222, 30, 170, "#2a3a5c")}</g>`;
    s += `<polygon points="200,${g.floor - 230} 203,${g.floor - 262} 206,${g.floor - 230}" fill="#22314f"/>`;
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(10,20,40,.55)");
  },
  pocket(g) {
    let s = bg(g, "#05061a", "#1a0a3a", "#ff7a1a");
    for (let i = 0; i < 40; i++) s += star4(g.R() * W, g.R() * 260, .6 + g.R() * 1.8, "#ffffff", .8);
    s += `<g transform="translate(60 70) rotate(40)"><path d="M0,-22 Q8,-10 8,10 L-8,10 Q-8,-10 0,-22Z" fill="#dfe6ee"/><circle cy="-6" r="3" fill="#7ad7ff"/><path d="M-8,4 L-14,14 L-8,12Z M8,4 L14,14 L8,12Z" fill="#ff3f60"/><path d="M-5,10 Q0,40 5,10Z" fill="#ffb347"/><path d="M-3,10 Q0,26 3,10Z" fill="#fff6c2"/></g>`;
    s += `<path d="M60,70 Q120,170 220,${g.floor - 10}" stroke="#ffb347" stroke-width="10" fill="none" opacity=".18" filter="url(#${g.id}-blur)"/>`;
    return s + halo(g, 132, 165, 120) + floor(g);
  },
  immortals(g) {
    let s = bg(g, "#030414", "#140632", "#ffe9a8");
    const neb = [["#7a2bff", 60, 80, 90], ["#ff3fa4", 190, 130, 80], ["#2bd4ff", 120, 220, 100], ["#ffd166", 150, 60, 60]];
    s += neb.map(([c, x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * .7}" fill="${c}" opacity=".35" filter="url(#${g.id}-neb)"/>`).join("") + `<filter id="${g.id}-neb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>`;
    for (let i = 0; i < 70; i++) s += `<circle cx="${f1(g.R() * W)}" cy="${f1(g.R() * H)}" r="${f1(.4 + g.R() * 1.3)}" fill="#fff" opacity="${f1(.4 + g.R() * .6)}"/>`;
    const cons = Array.from({ length: 7 }, () => [20 + g.R() * 210, 20 + g.R() * 120]);
    s += `<path d="M${cons.map(P2).join(" L")}" stroke="#ffe9a8" stroke-width=".8" fill="none" opacity=".55"/>` + cons.map(([x, y]) => star4(x, y, 4, "#fff", .95)).join("");
    s += `<circle cx="132" cy="110" r="62" fill="none" stroke="url(#goldg)" stroke-width="3" opacity=".6"/><circle cx="132" cy="110" r="70" fill="none" stroke="#ffe9a8" stroke-width=".8" opacity=".4"/>`;
    return s + halo(g, 132, 160, 140) + sparkles(g.R, 10, "#fff3c2") + `<rect x="0" y="${g.floor}" width="${W}" height="${H - g.floor}" fill="rgba(10,0,30,.5)"/>`;
  },
  opening(g) {
    let s = bg(g, "#05060c", mix(g.c1, "#000", .6), "#ffffff") + crowd(g, "#000", 196, .55);
    for (let i = 0; i < 6; i++) { const x = 20 + i * 42, col = [g.acc, "#ffffff", mix(g.c1, "#fff", .3)][i % 3]; s += spot(x, -10, 125 + (i - 2.5) * 30, 26, col, .16, g.id); }
    let bulbs = ""; for (let x = 18; x < 234; x += 9) bulbs += `<circle cx="${x}" cy="150" r="2.2" fill="#ffd166" opacity="${f1(.5 + g.R() * .5)}"/>`;
    s += `<g opacity=".75" transform="translate(0 -46)"><rect x="76" y="120" width="160" height="36" rx="4" fill="rgba(5,7,10,.7)" stroke="#ffd166" stroke-width="1.4"/>${bulbs.replace(/cx="(\d+)"/g, (m, x) => +x < 80 ? 'cx="-20"' : m)}<text x="156" y="144" font-family="${FONT}" font-weight="700" font-size="15" fill="#ffd166" text-anchor="middle" letter-spacing="3">OPENING NIGHT</text></g>`;
    return s + halo(g, 132, 175, 125) + floor(g, "rgba(0,0,0,.55)") + courtLines(g, "#ffffff", .14);
  },
  halloween(g) {
    let s = bg(g, "#1a0b2e", "#4a1a05", "#ff8a1a") + `<circle cx="168" cy="78" r="44" fill="#fff4d6" opacity=".9"/><circle cx="168" cy="78" r="58" fill="#fff4d6" opacity=".18" filter="url(#${g.id}-blur)"/>`;
    for (let i = 0; i < 7; i++) { const x = 20 + g.R() * 210, y = 30 + g.R() * 120, k = .5 + g.R() * .7; s += `<path transform="translate(${f1(x)} ${f1(y)}) scale(${f1(k)})" d="M0,0 Q-6,-6 -14,-2 Q-10,-1 -9,3 Q-5,0 0,4 Q5,0 9,3 Q10,-1 14,-2 Q6,-6 0,0Z" fill="#0b0613"/>`; }
    s += `<path d="M14,14 L60,14 M14,14 L14,60 M14,14 L48,48 M14,30 Q24,24 30,14 M14,44 Q34,36 44,14 M30,30 Q34,22 38,20" stroke="#d9c7ff" stroke-width=".8" fill="none" opacity=".5"/>`;
    const pk = (x, k) => `<g transform="translate(${x} ${g.floor - 2}) scale(${k})"><ellipse cx="0" cy="-10" rx="16" ry="12" fill="#ff7a1a"/><ellipse cx="-7" cy="-10" rx="6" ry="12" fill="#e2580e" opacity=".6"/><ellipse cx="7" cy="-10" rx="6" ry="12" fill="#e2580e" opacity=".6"/><rect x="-2" y="-25" width="4" height="6" fill="#3a6b1a"/><path d="M-8,-13 l3,-4 l3,4Z M2,-13 l3,-4 l3,4Z M-8,-6 Q0,-1 8,-6 L5,-4 L2,-6 L0,-4 L-2,-6 L-5,-4Z" fill="#ffe066"/></g>`;
    s += halo(g, 132, 170, 120) + `<rect x="0" y="${g.floor - 30}" width="${W}" height="60" fill="#d9c7ff" opacity=".08" filter="url(#${g.id}-blur)"/>` + floor(g, "rgba(10,0,20,.55)") + pk(36, 1) + pk(214, .8);
    return s;
  },
  thanksgiving(g) {
    let s = bg(g, "#f2a65a", "#5a2a0a", "#ffd166") + `<circle cx="132" cy="${g.floor - 30}" r="80" fill="#ffcf7a" opacity=".55"/>`;
    const leaf = (x, y, k, r, c) => `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${r}) scale(${f1(k)})" d="M0,-10 L2,-4 L7,-6 L5,-1 L10,1 L4,3 L5,8 L0,5 L-5,8 L-4,3 L-10,1 L-5,-1 L-7,-6 L-2,-4Z M0,5 L0,12" fill="${c}" stroke="${c}" stroke-width=".6"/>`;
    for (let i = 0; i < 22; i++) s += leaf(g.R() * W, g.R() * 300, .7 + g.R() * .9, Math.floor(g.R() * 360), ["#c2410c", "#e9a23b", "#8a2b06", "#d9480f"][i % 4]);
    s += `<g opacity=".3" fill="#5a2a0a">${[0, 1, 2, 3, 4].map(i => `<rect x="0" y="${g.floor - 50 + i * 10}" width="${W}" height="${2 + i}"/>`).join("")}</g>`;
    return s + halo(g, 132, 170, 120) + floor(g, "rgba(60,20,0,.5)");
  },
  christmas(g) {
    let s = bg(g, "#06122a", "#0b3a2a", "#ffffff");
    s += `<path d="M196,${g.floor} L232,${g.floor} L214,${g.floor - 120}Z" fill="#0f5a34" opacity=".9"/><path d="M200,${g.floor - 40} L228,${g.floor - 40} L214,${g.floor - 140}Z" fill="#147a45" opacity=".9"/>` + star4(214, g.floor - 146, 7, "#ffd166", 1);
    for (let i = 0; i < 8; i++) s += `<circle cx="${f1(200 + g.R() * 28)}" cy="${f1(g.floor - 20 - g.R() * 100)}" r="2.6" fill="${["#ff3f60", "#ffd166", "#7ad7ff"][i % 3]}"/>`;
    let wire = `M0,22`; for (let x = 0; x <= W; x += 25) wire += ` Q${x + 12},34 ${x + 25},22`; s += `<path d="${wire}" stroke="#1b2a1b" stroke-width="1.4" fill="none"/>`;
    for (let x = 12; x < W; x += 25) { const c = ["#ff3f60", "#ffd166", "#35eaa3", "#7ad7ff"][(x / 25 | 0) % 4]; s += `<ellipse cx="${x}" cy="31" rx="3" ry="4.6" fill="${c}"/><ellipse cx="${x}" cy="31" rx="7" ry="8" fill="${c}" opacity=".3" filter="url(#${g.id}-blur)"/>`; }
    s += halo(g, 132, 170, 120) + `<path d="M0,${g.floor - 6} Q60,${g.floor - 16} 125,${g.floor - 8} T250,${g.floor - 10} V${H} H0Z" fill="#eef6ff" opacity=".85"/>`;
    let snow = ""; for (let i = 0; i < 60; i++) snow += `<circle cx="${f1(g.R() * W)}" cy="${f1(g.R() * H)}" r="${f1(.6 + g.R() * 1.8)}" fill="#fff" opacity="${f1(.5 + g.R() * .5)}"/>`;
    return { bg: s, fg: snow };
  },
  newyear(g) {
    let s = bg(g, "#05061a", "#1a0f3a", "#ffd166");
    for (let b = 0; b < 4; b++) { const cx = 30 + g.R() * 190, cy = 26 + g.R() * 110, col = ["#ffd166", "#ff5ec4", "#7ad7ff", "#35eaa3"][b], n = 18, rr = 18 + g.R() * 18; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; s += `<line x1="${f1(cx + Math.cos(a) * rr * .3)}" y1="${f1(cy + Math.sin(a) * rr * .3)}" x2="${f1(cx + Math.cos(a) * rr)}" y2="${f1(cy + Math.sin(a) * rr)}" stroke="${col}" stroke-width="1.3" stroke-linecap="round" opacity=".85"/><circle cx="${f1(cx + Math.cos(a) * rr * 1.08)}" cy="${f1(cy + Math.sin(a) * rr * 1.08)}" r="1.2" fill="${col}"/>`; } }
    s += `<g transform="translate(132 210)" opacity=".22"><circle r="48" fill="none" stroke="#ffd166" stroke-width="4"/>${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="-42" x2="0" y2="-36" stroke="#ffd166" stroke-width="3" transform="rotate(${i * 30})"/>`).join("")}<line x1="0" y1="0" x2="0" y2="-34" stroke="#ffd166" stroke-width="4"/><line x1="0" y1="0" x2="0" y2="-26" stroke="#ffd166" stroke-width="5" transform="rotate(-2)"/></g>`;
    return { bg: s + halo(g, 132, 170, 120) + floor(g), fg: confetti(g.R, 40, ["#ffd166", "#ffffff", "#c58bff"], 280) };
  },
  valentine(g) {
    let s = bg(g, "#ff7aa8", "#5a0a2a", "#ffd3e2");
    const heart = (x, y, k, c, o, br) => `<path transform="translate(${f1(x)} ${f1(y)}) scale(${f1(k)})" d="M0,6 C-12,-2 -10,-12 -4,-12 C-1,-12 0,-9 0,-8 C0,-9 1,-12 4,-12 C10,-12 12,-2 0,6Z" fill="${c}" opacity="${o}"/>${br ? `<path transform="translate(${f1(x)} ${f1(y)}) scale(${f1(k)})" d="M0,-8 L-2,-3 L2,0 L-1,4" stroke="#5a0a2a" stroke-width="1.4" fill="none"/>` : ""}`;
    s += heart(132, 150, 9, "#ff3f7a", .3, true);
    for (let i = 0; i < 16; i++) s += heart(g.R() * W, g.R() * 260, .6 + g.R() * 1.2, ["#ffffff", "#ff3f7a", "#ffd3e2"][i % 3], f1(.4 + g.R() * .5));
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(90,10,42,.45)");
  },
  leapday(g) {
    let s = bg(g, "#0a3a2a", "#062018", "#9dff9a") + word("29", 150, 250, 210, "#9dff9a", .14);
    s += `<g transform="translate(196 66) rotate(8)" opacity=".85"><rect x="-26" y="-28" width="52" height="58" rx="4" fill="#f4f4f4"/><rect x="-26" y="-28" width="52" height="16" rx="4" fill="#d7263d"/><text y="-16" font-family="${FONT}" font-weight="700" font-size="11" fill="#fff" text-anchor="middle">FEB</text><text y="20" font-family="${FONT}" font-weight="700" font-size="28" fill="#111" text-anchor="middle">29</text></g>`;
    for (let i = 0; i < 5; i++) s += `<ellipse cx="${f1(20 + g.R() * 210)}" cy="${f1(g.floor + 6 + g.R() * 20)}" rx="${f1(14 + g.R() * 10)}" ry="${f1(4 + g.R() * 2)}" fill="#3a8a3a" opacity=".6"/>`;
    s += `<path d="M30,${g.floor - 20} Q90,40 220,${g.floor - 30}" stroke="#9dff9a" stroke-width="2" stroke-dasharray="6 6" fill="none" opacity=".45"/>`;
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(0,20,10,.5)");
  },
  piday(g) {
    let s = bg(g, "#1d3b2a", "#10241a", "#e6f4ea");
    const chalk = (t, x, y, sz, r) => `<text x="${x}" y="${y}" font-family="'Segoe Print','Comic Sans MS',${FONT}" font-size="${sz}" fill="#f4f7f2" opacity=".55" transform="rotate(${r || 0} ${x} ${y})">${xe(t)}</text>`;
    s += chalk("π = 3.14159…", 24, 44, 15, -4) + chalk("A = πr²", 150, 70, 14, 3) + chalk("C = 2πr", 30, 140, 13, -2) + chalk("4 > 3 > 2", 160, 150, 12, 4) + chalk("e^iπ + 1 = 0", 36, 196, 12, -3);
    s += `<circle cx="180" cy="112" r="28" fill="none" stroke="#f4f7f2" stroke-width="1.6" opacity=".5"/><line x1="180" y1="112" x2="206" y2="102" stroke="#f4f7f2" stroke-width="1.4" opacity=".5"/>` + word("π", 140, 255, 190, "#f4f7f2", .1);
    return s + halo(g, 132, 165, 120, ) + floor(g, "rgba(0,0,0,.35)", "rgba(244,247,242,.3)");
  },
  stpatricks(g) {
    let s = bg(g, "#0f6b3a", "#062a16", "#9dff9a");
    s += [["#ff3f60", 0], ["#ff9e5e", 6], ["#ffd166", 12], ["#35eaa3", 18], ["#5aa5ff", 24], ["#b779ff", 30]].map(([c, o]) => `<path d="M-30,${g.floor} A170,170 0 0 1 290,${g.floor}" transform="translate(0 ${o})" stroke="${c}" stroke-width="6" fill="none" opacity=".45"/>`).join("");
    const clover = (x, y, k, o) => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(k)})" opacity="${o}" fill="#35eaa3">${[0, 90, 180, 270].map(a => `<path transform="rotate(${a})" d="M0,0 C-6,-4 -6,-12 0,-10 C6,-12 6,-4 0,0Z"/>`).join("")}<path d="M0,0 Q2,8 6,12" stroke="#35eaa3" stroke-width="1.6" fill="none"/></g>`;
    for (let i = 0; i < 12; i++) s += clover(g.R() * W, g.R() * 230, .6 + g.R() * .9, f1(.35 + g.R() * .4));
    s += `<g transform="translate(206 ${g.floor - 4})"><path d="M-18,-16 Q-20,4 0,4 Q20,4 18,-16Z" fill="#1b1d21"/><ellipse cy="-16" rx="18" ry="5" fill="#2a2d33"/>${[-10, -4, 2, 8].map(x => `<circle cx="${x}" cy="-18" r="3.4" fill="url(#goldg)"/>`).join("")}</g>`;
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(0,30,10,.5)");
  },
  aprilfools(g) {
    let s = bg(g, "#2a1a5a", "#120a2a", "#ffd166");
    s += `<pattern id="${g.id}-har" width="28" height="40" patternUnits="userSpaceOnUse"><path d="M14,0 L28,20 L14,40 L0,20Z" fill="#d7263d" opacity=".45"/><path d="M0,0 L14,0 L0,20Z M28,0 L14,0 L28,20Z M0,40 L14,40 L0,20Z M28,40 L14,40 L28,20Z" fill="#ffd166" opacity=".25"/></pattern><rect width="${W}" height="${H}" fill="url(#${g.id}-har)"/>`;
    s += `<g transform="translate(125 130) rotate(180)" opacity=".2">${word("SURPRISE", 0, 0, 40, "#ffffff", 1)}</g>`;
    return { bg: s + halo(g, 132, 165, 120) + floor(g), fg: `<g transform="translate(190 120) rotate(14)" opacity=".85"><rect x="-38" y="-14" width="76" height="28" rx="3" fill="none" stroke="#ffd166" stroke-width="2.6"/><text y="6" font-family="${FONT}" font-weight="700" font-size="15" fill="#ffd166" text-anchor="middle" letter-spacing="2">NO JOKE</text></g>` };
  },
  friday13(g) {
    let s = bg(g, "#05060a", "#1a1d2a", "#9fb3c8") + word("13", 150, 250, 230, "#9fb3c8", .1);
    s += `<path d="M150,0 L138,52 L156,56 L132,128 L148,130 L118,206" stroke="#e6f0ff" stroke-width="2.4" fill="none" opacity=".75"/><path d="M150,0 L138,52 L156,56 L132,128 L148,130 L118,206" stroke="#9fd3ff" stroke-width="8" fill="none" opacity=".2" filter="url(#${g.id}-blur)"/>`;
    s += `<g transform="translate(206 ${g.floor - 2})" fill="#000"><ellipse cx="0" cy="-12" rx="12" ry="10"/><circle cx="8" cy="-26" r="7"/><path d="M3,-31 L5,-38 L9,-32Z M10,-32 L14,-38 L14,-30Z"/><path d="M-12,-12 Q-26,-20 -20,-34" stroke="#000" stroke-width="3" fill="none"/><circle cx="6" cy="-27" r="1.2" fill="#ffd166"/><circle cx="11" cy="-27" r="1.2" fill="#ffd166"/></g>`;
    return s + halo(g, 132, 165, 120) + floor(g, "rgba(0,0,0,.55)");
  },
  dunktober(g) {
    let s = bg(g, "#1a0a00", "#3a1400", "#ff7a1a");
    s += `<path d="M-20,${H} L270,0 L270,${H}Z" fill="#ff7a1a" opacity=".2"/>` + rays(178, 84, 20, "#ff7a1a", .12, 8) + rimSVG(162, 92, 1.08, true);
    const leaf = (x, y, k, r, c) => `<path transform="translate(${f1(x)} ${f1(y)}) rotate(${r}) scale(${f1(k)})" d="M0,-10 L2,-4 L7,-6 L5,-1 L10,1 L4,3 L5,8 L0,5 L-5,8 L-4,3 L-10,1 L-5,-1 L-7,-6 L-2,-4Z" fill="${c}"/>`;
    for (let i = 0; i < 14; i++) s += leaf(g.R() * W, g.R() * 280, .6 + g.R() * .8, Math.floor(g.R() * 360), ["#ff7a1a", "#ffd166", "#c2410c"][i % 3]);
    s += word("DUNKTOBER", 125, 214, 36, "#ffd166", .22, -8);
    return s + halo(g, 132, 165, 125) + floor(g, "rgba(0,0,0,.55)");
  },
  game7(g) {
    let s = bg(g, "#0a0204", "#3a0610", "#ff3f60") + crowd(g, "#000", 190, .6);
    s += `<defs><linearGradient id="${g.id}-c7" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#ff8aa0"/><stop offset=".52" stop-color="#5a0a14"/><stop offset="1" stop-color="#ff3f60"/></linearGradient></defs>`;
    s += word("7", 150, 270, 300, `url(#${g.id}-c7)`, .3) + spot(132, -10, 132, 80, "#ffffff", .18, g.id);
    s += `<g transform="translate(46 160)" opacity=".7"><rect x="-26" y="-12" width="52" height="24" rx="3" fill="#000" stroke="#ff3f60"/><text y="7" font-family="'Courier New',monospace" font-weight="700" font-size="17" fill="#ff3f60" text-anchor="middle">0:00</text></g>`;
    return { bg: s + halo(g, 132, 165, 125) + floor(g, "rgba(0,0,0,.6)"), fg: confetti(g.R, 26, ["#ff3f60", "#ffffff", g.c1], 240) };
  },
  rapsheet(g) {
    let s = bg(g, "#cfd2d7", "#8e939b", "#ffffff");
    for (let i = 0; i <= 10; i++) { const y = g.floor - i * 24; s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#2b2f36" stroke-width="${i % 2 ? .8 : 1.6}" opacity=".5"/>`; if (i % 2 === 0) s += `<text x="8" y="${y - 3}" font-family="${FONT}" font-size="10" fill="#2b2f36" opacity=".7">${5 + i / 4 | 0}'${(i % 4) * 3}"</text><text x="242" y="${y - 3}" font-family="${FONT}" font-size="10" fill="#2b2f36" opacity=".7" text-anchor="end">${5 + i / 4 | 0}'${(i % 4) * 3}"</text>`; }
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${g.id}-flash)"/><defs><radialGradient id="${g.id}-flash" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>`;
    return { bg: s, fg: `<g transform="rotate(-16 125 222)"><rect x="-40" y="213" width="330" height="17" fill="#f5c400" stroke="#111" stroke-width=".6"/><text x="125" y="225.5" font-family="${FONT}" font-weight="700" font-size="9.5" fill="#111" text-anchor="middle" letter-spacing="1.5">POLICE LINE · DO NOT CROSS · POLICE LINE · DO NOT CROSS</text></g><g transform="translate(184 120) rotate(-14)" opacity=".8"><rect x="-38" y="-14" width="76" height="28" fill="none" stroke="#b3122b" stroke-width="3"/><text y="8" font-family="${FONT}" font-weight="700" font-size="21" fill="#b3122b" text-anchor="middle" letter-spacing="3">FILED</text></g>` };
  }
};

// ---------- collection medallion icons (drawn in a 24x24 box centred on 0,0) ----------
const ICON = {
  base: `<circle r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M-9,0 H9 M0,-9 V9 M-6.5,-6.5 Q-2,0 -6.5,6.5 M6.5,-6.5 Q2,0 6.5,6.5" stroke="currentColor" stroke-width="1.5" fill="none"/>`,
  rookie: `<text y="5" font-family="${FONT}" font-weight="700" font-size="14" text-anchor="middle" fill="currentColor">RC</text>`,
  founders: `<path d="M-10,9 V-1 L-5,3 V-1 L0,3 V-1 L5,3 V-9 H8 V9Z" fill="currentColor"/><circle cx="7" cy="-11" r="2" fill="currentColor" opacity=".6"/>`,
  wba: `<path d="M0,-10 L2.9,-3.1 L10,-3.1 L4.3,1.4 L6.4,8.6 L0,4.4 L-6.4,8.6 L-4.3,1.4 L-10,-3.1 L-2.9,-3.1Z" fill="currentColor"/>`,
  posterized: `<rect x="-9" y="-10" width="18" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><ellipse cy="3" rx="6" ry="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M-5,4 L-3,10 M0,4.5 V10.5 M5,4 L3,10" stroke="currentColor" stroke-width="1.2"/>`,
  swat: `<path d="M-6,10 V-1 M-6,-1 V-8 M-2,-1 V-10 M2,-1 V-9 M6,1 V-6 M-6,10 H6 Q9,6 6,1" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  wrecking: `<path d="M0,-11 L3,-4 L10,-6 L5,0 L10,6 L3,4 L0,11 L-3,4 L-10,6 L-5,0 L-10,-6 L-3,-4Z" fill="currentColor"/>`,
  escape: `<rect x="-11" y="-4" width="9" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="2" y="-4" width="9" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M-1,-8 L1,-3 M1,3 L-1,8" stroke="currentColor" stroke-width="1.5"/>`,
  fouralarm: `<path d="M0,-11 Q7,-3 5,3 Q9,0 8,-4 Q12,3 8,8 Q4,12 0,11 Q-6,11 -8,6 Q-10,0 -4,-4 Q-4,0 -2,1 Q-4,-6 0,-11Z" fill="currentColor"/>`,
  splash: `<path d="M0,-11 Q8,0 7,4 A7,7 0 0 1 -7,4 Q-8,0 0,-11Z" fill="currentColor"/>`,
  dimes: `<circle r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><text y="4.5" font-family="${FONT}" font-weight="700" font-size="12" text-anchor="middle" fill="currentColor">10</text>`,
  boards: `<rect x="-10" y="-10" width="20" height="13" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M0,10 V-3 M-4,1 L0,-3 L4,1" stroke="currentColor" stroke-width="2" fill="none"/>`,
  pickpockets: `<path d="M-11,-2 Q-11,-6 -6,-6 H6 Q11,-6 11,-2 Q11,5 5,5 Q2,5 0,1 Q-2,5 -5,5 Q-11,5 -11,-2Z" fill="currentColor"/><ellipse cx="-5" cy="-1" rx="2.6" ry="1.6" fill="#0b0d11"/><ellipse cx="5" cy="-1" rx="2.6" ry="1.6" fill="#0b0d11"/>`,
  buckets: `<path d="M-9,-6 H9 L6,10 H-6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M-9,-6 Q0,-14 9,-6" stroke="currentColor" stroke-width="1.6" fill="none"/>`,
  mvp: `<path d="M-11,6 L-9,-7 L-4,-1 L0,-10 L4,-1 L9,-7 L11,6Z" fill="currentColor"/><rect x="-11" y="7" width="22" height="3" fill="currentColor"/>`,
  fmvp: `<path d="M-7,-10 H7 V-3 Q7,4 0,5 Q-7,4 -7,-3Z M-3,5 H3 V8 H-3Z M-6,8 H6 V11 H-6Z" fill="currentColor"/><path d="M-7,-8 Q-12,-8 -11,-3 Q-10,0 -6,0 M7,-8 Q12,-8 11,-3 Q10,0 6,0" stroke="currentColor" stroke-width="1.6" fill="none"/>`,
  dpoy: `<path d="M0,-11 L9,-7 V0 Q9,7 0,11 Q-9,7 -9,0 V-7Z" fill="none" stroke="currentColor" stroke-width="2"/><rect x="-4" y="-1" width="8" height="6" rx="1" fill="currentColor"/><path d="M-2.5,-1 V-3.5 A2.5,2.5 0 0 1 2.5,-3.5 V-1" stroke="currentColor" stroke-width="1.6" fill="none"/>`,
  roy: `<path d="M-11,5 H11 M-8,5 A8,8 0 0 1 8,5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M0,-9 V-5 M-8,-5 L-6,-3 M8,-5 L6,-3 M-11,1 H-9 M11,1 H9" stroke="currentColor" stroke-width="1.8"/>`,
  champ: `<circle cy="3" r="7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M-4,-5 L0,-11 L4,-5Z" fill="currentColor"/>`,
  ironworkers: `<path d="M-10,-10 H10 V-6 H3 V6 H10 V10 H-10 V6 H-3 V-6 H-10Z" fill="currentColor"/>`,
  prime: `<path d="M-11,9 L-4,-3 L0,3 L4,-9 L11,9Z" fill="currentColor"/><path d="M4,-9 L6.5,-4 L2,-4.5Z" fill="#0b0d11" opacity=".5"/>`,
  hof: `<path d="M-11,-5 L0,-11 L11,-5Z M-9,-4 H9 V-2 H-9Z M-8,-1 H-5 V7 H-8Z M-1.5,-1 H1.5 V7 H-1.5Z M5,-1 H8 V7 H5Z M-10,8 H10 V10 H-10Z" fill="currentColor"/>`,
  rapsheet: `<path d="M0,-11 L2.5,-6 L8,-7 L6,-2 L10,2 L5,4 L5,10 L0,7 L-5,10 L-5,4 L-10,2 L-6,-2 L-8,-7 L-2.5,-6Z" fill="currentColor"/><circle r="2.6" fill="#0b0d11"/>`
};
Object.assign(ICON, {
  moments: `<rect x="-11" y="-8" width="22" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M-3,-4 L5,0 L-3,4Z" fill="currentColor"/>`,
  fifty: `<text y="5.5" font-family="${FONT}" font-weight="700" font-size="15" text-anchor="middle" fill="currentColor">50</text>`,
  tripledouble: `<circle r="10" fill="none" stroke="currentColor" stroke-width="1.6"/><circle r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle r="3" fill="currentColor"/>`,
  postseason: `<path d="M-11,-9 H-5 V-3 H0 M-11,3 H-5 V-3 M-11,9 H-5 V3 M0,-3 H5 M5,-9 H11 M5,9 H11 M5,-9 V9" stroke="currentColor" stroke-width="1.8" fill="none"/>`,
  dynasty: `<path d="M-11,7 L-9,-6 L-4,0 L0,-9 L4,0 L9,-6 L11,7Z" fill="currentColor"/><text y="5" font-family="${FONT}" font-weight="700" font-size="7" text-anchor="middle" fill="#0b0d11">III</text>`,
  numberone: `<text y="6.5" font-family="${FONT}" font-weight="700" font-size="19" text-anchor="middle" fill="currentColor">1</text><circle r="10.5" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  younggun: `<path d="M-10,8 L-3,-9 L1,0 L5,-5 L10,8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6" cy="-9" r="2" fill="currentColor"/>`,
  breakout: `<path d="M-9,9 L9,-9 M2,-9 H9 V-2" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M-10,-4 L-6,-6 M-4,-10 L-6,-6" stroke="currentColor" stroke-width="1.4"/>`,
  bench: `<rect x="-11" y="-2" width="22" height="4" rx="1" fill="currentColor"/><path d="M-8,2 V9 M8,2 V9" stroke="currentColor" stroke-width="2.4"/><path d="M-2,-11 L2,-6 H-1 L3,-1" stroke="currentColor" stroke-width="1.6" fill="none"/>`,
  ageless: `<circle r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="M0,-6 V0 L5,3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  franchise: `<path d="M-8,-11 H8 V6 L0,11 L-8,6Z" fill="currentColor"/><text y="3" font-family="${FONT}" font-weight="700" font-size="9" text-anchor="middle" fill="#0b0d11">#</text>`,
  journeyman: `<rect x="-10" y="-5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M-4,-5 V-9 H4 V-5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M-10,1 H10" stroke="currentColor" stroke-width="1.4"/>`,
  expansion: `<path d="M-10,9 V-3 L0,-10 L10,-3 V9Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M0,1 V9 M-4,5 H4" stroke="currentColor" stroke-width="2"/>`,
  skyscrapers: `<path d="M-10,10 V-2 H-4 V-10 H4 V-5 H10 V10Z" fill="currentColor"/>`,
  pocket: `<path d="M0,-11 Q6,-4 5,5 H-5 Q-6,-4 0,-11Z M-5,2 L-9,8 L-5,6Z M5,2 L9,8 L5,6Z" fill="currentColor"/><path d="M-2,6 Q0,13 2,6" fill="currentColor" opacity=".6"/>`,
  immortals: `${"<path d='M0,-11 L2.4,-3.3 L10.5,-3.4 L4,1.3 L6.5,9 L0,4.3 L-6.5,9 L-4,1.3 L-10.5,-3.4 L-2.4,-3.3Z' fill='currentColor'/>"}<circle r="12" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>`
});
Object.assign(ICON, {
  opening: `<path d="M-10,9 L-6,-9 H6 L10,9Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M-3,-9 L-8,-2 M3,-9 L8,-2" stroke="currentColor" stroke-width="1.4"/>${[-6, -2, 2, 6].map(x => `<circle cx="${x}" cy="5" r="1.4" fill="currentColor"/>`).join("")}`,
  halloween: `<ellipse cy="2" rx="10" ry="8" fill="currentColor"/><rect x="-1.5" y="-10" width="3" height="5" fill="currentColor"/><path d="M-5,0 l2,-3 l2,3Z M1,0 l2,-3 l2,3Z M-5,5 Q0,9 5,5" fill="#0b0d11" stroke="#0b0d11" stroke-width=".8"/>`,
  thanksgiving: `<path d="M0,-11 L2,-4 L8,-7 L5,-1 L11,1 L4,3 L6,9 L0,5 L-6,9 L-4,3 L-11,1 L-5,-1 L-8,-7 L-2,-4Z" fill="currentColor"/>`,
  christmas: `<path d="M0,-11 L8,1 H4 L10,9 H-10 L-4,1 H-8Z" fill="currentColor"/><rect x="-2" y="9" width="4" height="3" fill="currentColor"/>`,
  newyear: `<path d="M-6,-10 H6 L2,0 V7 H5 V9 H-5 V7 H-2 V0Z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="-8" r="1.4" fill="currentColor"/><circle cx="-8" cy="-4" r="1" fill="currentColor"/>`,
  valentine: `<path d="M0,9 C-14,0 -12,-11 -5,-11 C-2,-11 0,-8 0,-7 C0,-8 2,-11 5,-11 C12,-11 14,0 0,9Z" fill="currentColor"/><path d="M0,-7 L-2,-2 L2,1 L-1,6" stroke="#0b0d11" stroke-width="1.4" fill="none"/>`,
  leapday: `<text y="5" font-family="${FONT}" font-weight="700" font-size="13" text-anchor="middle" fill="currentColor">29</text><rect x="-10" y="-10" width="20" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
  piday: `<text y="7" font-family="Georgia,serif" font-weight="700" font-size="22" text-anchor="middle" fill="currentColor">π</text>`,
  stpatricks: `${[0, 90, 180, 270].map(a => `<path transform="rotate(${a})" d="M0,0 C-6,-4 -6,-11 0,-9 C6,-11 6,-4 0,0Z" fill="currentColor"/>`).join("")}`,
  aprilfools: `<path d="M-10,-6 L-4,4 L0,-8 L4,4 L10,-6 L8,8 H-8Z" fill="currentColor"/><circle cx="-10" cy="-8" r="2" fill="currentColor"/><circle cx="0" cy="-10" r="2" fill="currentColor"/><circle cx="10" cy="-8" r="2" fill="currentColor"/>`,
  friday13: `<text y="6" font-family="${FONT}" font-weight="700" font-size="16" text-anchor="middle" fill="currentColor">13</text>`,
  dunktober: `<rect x="-9" y="-11" width="18" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/><ellipse cy="1" rx="6" ry="1.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M-6,4 L5,12 M-2,10 L6,6" stroke="currentColor" stroke-width="1.3"/>`,
  game7: `<text y="8" font-family="${FONT}" font-weight="700" font-size="22" text-anchor="middle" fill="currentColor">7</text>`
});
const ABBR = { base: "", rookie: "RC", founders: "1954", wba: "WBA", posterized: "SLAM", swat: "SWAT", wrecking: "HIT", escape: "ESC", fouralarm: "4PT", splash: "3PT", dimes: "AST", boards: "REB", pickpockets: "STL", buckets: "PTS", mvp: "MVP", fmvp: "FMVP", dpoy: "DPOY", roy: "ROY", champ: "RING", ironworkers: "82", prime: "PRIME", hof: "HOF", rapsheet: "FILE" };

// ---------- frame materials ----------
function material(id, T, R) {
  const band = `url(#${id}-band)`;
  let s = "";
  if (T.mat === "tread") { for (let i = 0; i < 36; i++) s += `<path d="M${-12 + i * 10},0 l7,7 -7,7" stroke="#000" fill="none" stroke-width="3" opacity=".55" transform="translate(0 ${(i % 2) * 5})"/>`; s = `<g clip-path="${band}">${s}<g transform="translate(0 336)">${s}</g></g>`; }
  if (T.mat === "metal") { let l = ""; for (let y = 0; y < H; y += 2.2) l += `<line x1="0" y1="${f1(y)}" x2="${W}" y2="${f1(y + 3)}" stroke="${R() < .5 ? "#fff" : "#000"}" stroke-width=".6" opacity="${f1(.05 + R() * .08)}"/>`; s = `<g clip-path="${band}">${l}<path d="M0,0 L${W},${H} M${W},0 L0,${H}" stroke="#fff" stroke-width="1" opacity=".18"/></g>`; }
  if (T.mat === "gem" || T.mat === "crystal") { let f = ""; for (let i = 0; i < 26; i++) { const x = R() * W, y = R() * H, k = 18 + R() * 40; f += `<polygon points="${pts([[x, y], [x + k * (R() - .3), y + k * (R() - .5)], [x + k * (R() - .7), y + k * (R() + .2)]])}" fill="${R() < .5 ? "#fff" : "#000"}" opacity="${f1(.06 + R() * (T.mat === "crystal" ? .22 : .14))}"/>`; } s = `<g clip-path="${band}">${f}</g>`; }
  if (T.mat === "opal") { let f = ""; ["#ff8fd8", "#8fd3ff", "#b6ffd0", "#ffe58f", "#d79bff"].forEach((c, i) => { f += `<ellipse cx="${f1(R() * W)}" cy="${f1(R() * H)}" rx="${f1(60 + R() * 60)}" ry="${f1(40 + R() * 60)}" fill="${c}" opacity=".55" filter="url(#${id}-blur)"/>`; }); s = `<g clip-path="${band}" class="opalshift">${f}</g>`; }
  if (T.mat === "lava") s = `<g clip-path="${band}"><rect width="${W}" height="${H}" filter="url(#${id}-lava)"/></g>`;
  return s;
}
function gemSVG(T, key, x, y) {
  const a = T.acc, d = T.deep;
  if (key === "rubber") return `<g transform="translate(${x} ${y})"><circle r="9" fill="#202328" stroke="#6b717b" stroke-width="2"/><circle r="4" fill="#0f1114" stroke="#6b717b"/>${[0, 1, 2, 3, 4, 5].map(i => `<rect x="-1.2" y="-10.5" width="2.4" height="3" fill="#6b717b" transform="rotate(${i * 60})"/>`).join("")}</g>`;
  if (key === "bronze" || key === "silver" || key === "gold") return `<g transform="translate(${x} ${y})"><circle r="10" fill="${mix(a, d, .4)}" stroke="${d}" stroke-width="1"/><circle r="8" fill="${a}"/><circle r="8" fill="none" stroke="#fff" stroke-width="1" opacity=".5" stroke-dasharray="1.5 1.5"/><path d="M0,-5 L1.5,-1.5 L5,-1.5 L2.2,.8 L3.2,4.5 L0,2.4 L-3.2,4.5 L-2.2,.8 L-5,-1.5 L-1.5,-1.5Z" fill="${mix(a, d, .5)}"/></g>`;
  // brilliant cut
  const c1 = mix(a, "#fff", .55), c2 = a, c3 = mix(a, d, .35), c4 = mix(a, d, .6);
  return `<g transform="translate(${x} ${y})"><path d="M-12,-3 L-7,-9 H7 L12,-3 L0,11Z" fill="${c3}" stroke="${d}" stroke-width=".8"/><path d="M-7,-9 L-4,-3 H4 L7,-9Z" fill="${c1}"/><path d="M-12,-3 L-4,-3 L-7,-9Z" fill="${c2}"/><path d="M12,-3 L4,-3 L7,-9Z" fill="${c2}"/><path d="M-12,-3 L0,11 L-4,-3Z" fill="${c4}"/><path d="M12,-3 L0,11 L4,-3Z" fill="${c2}"/><path d="M-4,-3 L0,11 L4,-3Z" fill="${c3}"/><path d="M-5,-7 L-3,-5" stroke="#fff" stroke-width="1.2" opacity=".9"/>${star4(6, -9, 4, "#fff", .9)}</g>`;
}

// ---------- premium frame finishes ----------
// A raised bevel on the frame band: light catches the top-left edges, the bottom-right fall into shadow.
function bevel(id, T) {
  return `<linearGradient id="${id}-bvl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".45" stop-color="#fff" stop-opacity=".1"/><stop offset=".55" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></linearGradient>
<linearGradient id="${id}-bvi" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".8"/><stop offset=".5" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".6"/></linearGradient>
<path d="${chamf(1.5, 1.5, W - 3, H - 3, 17)}" fill="none" stroke="url(#${id}-bvl)" stroke-width="3"/>
<path d="${chamf(8.6, 8.6, W - 17.2, H - 17.2, 12.6)}" fill="none" stroke="url(#${id}-bvi)" stroke-width="2.8"/>
<path d="${chamf(5, 5, W - 10, H - 10, 15)}" fill="none" stroke="${mix(T.acc, "#ffffff", .5)}" stroke-width=".5" opacity=".55"/>`;
}
// Emerald and up: a refractor of fine rainbow lines on the frame band that slides as the card tilts
function prism(id, T, key) {
  const gem = ["emerald", "sapphire", "ruby", "amethyst", "diamond", "opal", "vulcan"].includes(key); if (!gem) return "";
  const cols = T.molten ? ["#ff3d00", "#ffd166", "#ff6a1f", "#fff1e6"] : ["#ff5ec4", "#7ad7ff", "#9dff9a", "#fff27a", "#c58bff"];
  return `<pattern id="${id}-pr" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">${cols.map((c, i) => `<rect x="${f1(i * 9 / cols.length)}" width="${f1(9 / cols.length * .55)}" height="9" fill="${c}"/>`).join("")}</pattern>
<g clip-path="url(#${id}-band)" style="mix-blend-mode:overlay" opacity="${key === "emerald" || key === "sapphire" ? .3 : .45}"><rect class="prism" x="-60" y="-60" width="${W + 120}" height="${H + 120}" fill="url(#${id}-pr)"/></g>`;
}
// corners: brackets for the metals, faceted gem studs for the gems, star bursts for Diamond and up
function corners(T, key) {
  const at = [[10, 10, 1, 1], [240, 10, -1, 1], [10, 340, 1, -1], [240, 340, -1, -1]];
  let s = at.map(([x, y, sx, sy]) => `<path d="M${x + sx * 4},${y + sy * 22} V${y + sy * 8} L${x + sx * 8},${y + sy * 4} H${x + sx * 22}" stroke="${T.acc}" stroke-width="2.2" fill="none"/>`).join("");
  const ti = TIERK.indexOf(key);
  if (ti >= TIERK.indexOf("emerald")) s += at.map(([x, y, sx, sy]) => { const cx = x + sx * 6.5, cy = y + sy * 6.5; return `<g transform="translate(${cx} ${cy})"><path d="M0,-4.4 L4.4,0 L0,4.4 L-4.4,0Z" fill="${T.acc}" stroke="${T.deep}" stroke-width=".7"/><path d="M0,-4.4 L4.4,0 L0,0Z" fill="#fff" opacity=".55"/><path d="M0,4.4 L-4.4,0 L0,0Z" fill="#000" opacity=".3"/></g>`; }).join("");
  if (ti >= TIERK.indexOf("diamond")) s += at.map(([x, y, sx, sy]) => star4(x + sx * 6.5, y + sy * 6.5, 9, "#ffffff", .9)).join("");
  return s;
}
const TIERK = ["rubber", "bronze", "silver", "gold", "emerald", "sapphire", "ruby", "amethyst", "diamond", "opal", "vulcan"];
// a team crest drawn from the team: its shape, stripes and stars come from the team id
function crest(teamId, c1, c2, sz) {
  const h = rngOf("crest:" + teamId), shape = Math.floor(h() * 4), k = (sz || 30) / 30, ab = String(teamId || "").slice(0, 3);
  const tc = lum(c1) > 0.6 ? "#111" : "#fff", ring = lum(c2) < 0.12 && lum(c1) < 0.12 ? "#d7dbe0" : c2;
  const paths = ["M0,-15 H13 V-2 Q13,10 0,16 Q-13,10 -13,-2 V-15Z", "M0,-15 A15,15 0 1,1 -0.01,-15Z", "M0,-15 L13,-7.5 V7.5 L0,15 L-13,7.5 V-7.5Z", "M-13,-14 H13 V4 L0,16 L-13,4Z"];
  const p = paths[shape], stripe = h() < 0.6, stars = Math.floor(h() * 3);
  return `<g transform="scale(${f1(k * 100) / 100})"><path d="${p}" fill="${ring}" transform="scale(1.16)"/><path d="${p}" fill="${c1}"/>${stripe ? `<clipPath id="cr-${teamId}-${shape}"><path d="${p}"/></clipPath><g clip-path="url(#cr-${teamId}-${shape})"><rect x="-16" y="5" width="32" height="3.2" fill="${ring}"/><rect x="-16" y="9.6" width="32" height="1.4" fill="${ring}" opacity=".8"/></g>` : ""}${Array.from({ length: stars }, (_, i) => star4((i - (stars - 1) / 2) * 7, -9.5, 2.3, ring, 1)).join("")}<text y="${stripe ? 3 : 4.5}" font-family="${FONT}" font-size="${ab.length > 2 ? 10 : 12}" font-weight="700" fill="${tc}" text-anchor="middle" stroke="rgba(0,0,0,.35)" stroke-width=".6" paint-order="stroke">${xe(ab)}</text></g>`;
}

// ---------- collection frames (overlays on the tier frame band) ----------
function frameOverlay(kind, id, T, R) {
  const band = `clip-path="url(#${id}-band)"`;
  if (kind === "film") {
    let h = `<g ${band}><rect width="${W}" height="${H}" fill="#07080a" opacity=".72"/>`;
    for (let y = 18; y < H - 18; y += 13) h += `<rect x="2.5" y="${y}" width="5" height="7" rx="1.2" fill="#d9dde3" opacity=".85"/><rect x="${W - 7.5}" y="${y}" width="5" height="7" rx="1.2" fill="#d9dde3" opacity=".85"/>`;
    return h + `</g>`;
  }
  if (kind === "marble") {
    let v = ""; for (let i = 0; i < 14; i++) { let d = `M${f1(R() * W)},${f1(R() * 20 - 10)}`; for (let k = 0; k < 6; k++) d += ` Q${f1(R() * W)},${f1(k * 60 + 30)} ${f1(R() * W)},${f1(k * 60 + 60)}`; v += `<path d="${d}" stroke="#8c8270" stroke-width="${f1(.5 + R())}" fill="none" opacity=".6"/>`; }
    return `<g ${band}><rect width="${W}" height="${H}" fill="#f1ece2" opacity=".9"/>${v}</g><path d="${chamf(5, 5, W - 10, H - 10, 15)}" fill="none" stroke="url(#goldg)" stroke-width="2.4"/>`;
  }
  if (kind === "cosmic") {
    let st = ""; for (let i = 0; i < 60; i++) st += `<circle cx="${f1(R() * W)}" cy="${f1(R() * H)}" r="${f1(.3 + R() * 1)}" fill="#fff" opacity="${f1(.4 + R() * .6)}"/>`;
    return `<g ${band}><rect width="${W}" height="${H}" fill="#0a0420"/><ellipse cx="40" cy="60" rx="70" ry="50" fill="#7a2bff" opacity=".5" filter="url(#${id}-blur)"/><ellipse cx="210" cy="290" rx="70" ry="60" fill="#ff3fa4" opacity=".4" filter="url(#${id}-blur)"/><ellipse cx="220" cy="80" rx="40" ry="60" fill="#2bd4ff" opacity=".35" filter="url(#${id}-blur)"/>${st}</g><path d="${chamf(1.5, 1.5, W - 3, H - 3, 17)}" fill="none" stroke="url(#${id}-holo)" stroke-width="2.6"/>`;
  }
  if (kind === "vintage") return `<g ${band}><rect width="${W}" height="${H}" fill="#efe2c4" opacity=".92"/>${halftone(id + "-vht", "#8a6a3e", .25, 4)}</g><path d="${chamf(6, 6, W - 12, H - 12, 14)}" fill="none" stroke="#7a1f1f" stroke-width="1.6" opacity=".8"/>`;
  if (kind === "tape") return `<g ${band}>${stripes(45, 7, "#f5c400", .9)}</g>`;
  if (kind === "candycane") return `<g ${band}><rect width="${W}" height="${H}" fill="#ffffff"/>${stripes(45, 8, "#d7263d", 1)}</g><path d="${chamf(5, 5, W - 10, H - 10, 15)}" fill="none" stroke="#147a45" stroke-width="2"/>`;
  if (kind === "spooky") { let d = ""; for (let x = 14; x < W - 10; x += 12 + R() * 14) d += `<path d="M${f1(x)},9 v${f1(4 + R() * 14)} a3,3 0 0 1 -6,0 v${f1(-(4 + R() * 6))}Z" fill="#7cff4a" opacity=".85"/>`; return `<g ${band}><rect width="${W}" height="${H}" fill="#2a0e4f"/>${stripes(-45, 6, "#ff7a1a", .5)}</g>${d}`; }
  if (kind === "autumn") { let l = ""; for (let i = 0; i < 40; i++) l += `<circle cx="${f1(R() * W)}" cy="${f1(R() * H)}" r="${f1(2 + R() * 4)}" fill="${["#c2410c", "#e9a23b", "#8a2b06"][i % 3]}"/>`; return `<g ${band}><rect width="${W}" height="${H}" fill="#5a2a0a"/>${l}</g>`; }
  if (kind === "glitter") { let l = ""; for (let i = 0; i < 160; i++) l += `<circle cx="${f1(R() * W)}" cy="${f1(R() * H)}" r="${f1(.4 + R() * 1.2)}" fill="${R() < .5 ? "#fff6c2" : "#ffd166"}"/>`; return `<g ${band}><rect width="${W}" height="${H}" fill="#3a2a00"/>${l}</g><path d="${chamf(5, 5, W - 10, H - 10, 15)}" fill="none" stroke="url(#goldg)" stroke-width="2.4"/>`; }
  if (kind === "hearts") { let l = ""; for (let y = 4; y < H; y += 14) for (let x = (y / 14 % 2) * 7; x < W; x += 14) l += `<path transform="translate(${x} ${y}) scale(.45)" d="M0,6 C-12,-2 -10,-12 -4,-12 C-1,-12 0,-9 0,-8 C0,-9 1,-12 4,-12 C10,-12 12,-2 0,6Z" fill="#ff3f7a"/>`; return `<g ${band}><rect width="${W}" height="${H}" fill="#ffd3e2"/>${l}</g>`; }
  if (kind === "chalk") return `<g ${band}><rect width="${W}" height="${H}" fill="#7a4a24"/>${stripes(0, 2, "#5a3416", .5)}</g><path d="${chamf(8, 8, W - 16, H - 16, 13)}" fill="none" stroke="#3a2210" stroke-width="2"/>`;
  if (kind === "clover") { let l = ""; for (let i = 0; i < 30; i++) l += `<g transform="translate(${f1(R() * W)} ${f1(R() * H)}) scale(.35)">${[0, 90, 180, 270].map(a => `<path transform="rotate(${a})" d="M0,0 C-6,-4 -6,-12 0,-10 C6,-12 6,-4 0,0Z" fill="#35eaa3"/>`).join("")}</g>`; return `<g ${band}><rect width="${W}" height="${H}" fill="#0f6b3a"/>${l}</g><path d="${chamf(5, 5, W - 10, H - 10, 15)}" fill="none" stroke="url(#goldg)" stroke-width="2"/>`; }
  if (kind === "jester") { let l = ""; for (let y = -10; y < H; y += 20) for (let x = 0; x < W; x += 14) l += `<path d="M${x + 7},${y} L${x + 14},${y + 10} L${x + 7},${y + 20} L${x},${y + 10}Z" fill="${((x / 14) + (y + 10) / 20) % 2 ? "#d7263d" : "#ffd166"}"/>`; return `<g ${band}>${l}</g>`; }
  if (kind === "cracked") { let l = ""; for (let i = 0; i < 14; i++) { let x = R() * W, y = R() * H, d = `M${f1(x)},${f1(y)}`; for (let k = 0; k < 4; k++) { x += (R() - .5) * 30; y += (R() - .5) * 30; d += ` L${f1(x)},${f1(y)}`; } l += `<path d="${d}" stroke="#cfd8e3" stroke-width=".8" fill="none"/>`; } return `<g ${band}><rect width="${W}" height="${H}" fill="#0b0d13"/>${l}</g>`; }
  if (kind === "game7") return `<g ${band}><rect width="${W}" height="${H}" fill="#2a0610"/>${stripes(-45, 3, "#ff3f60", .35)}</g><path d="${chamf(5, 5, W - 10, H - 10, 15)}" fill="none" stroke="#ff3f60" stroke-width="2"/>`;
  return "";
}
// ---------- foils ----------
function foil(key, id, R) {
  if (key === "diamond") { // cracked ice
    const P = Array.from({ length: 34 }, () => [R() * W, R() * H]); let l = "";
    P.forEach((a, i) => { P.map((b, j) => [j, Math.hypot(a[0] - b[0], a[1] - b[1])]).filter(x => x[0] !== i).sort((x, y) => x[1] - y[1]).slice(0, 3).forEach(([j]) => { if (j > i) l += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(P[j][0])}" y2="${f1(P[j][1])}"/>`; }); });
    return `<g stroke="#ffffff" stroke-width=".9" opacity=".32" style="mix-blend-mode:overlay">${l}</g>`;
  }
  if (key === "ruby" || key === "amethyst") return `<g opacity=".08" style="mix-blend-mode:overlay">${stripes(-35, 1.5, "#ffffff", 1)}</g>`;
  if (key === "opal") { let st = ""; for (let i = 0; i < 40; i++) st += star4(R() * W, R() * H, 1 + R() * 2.4, ["#ff9de2", "#8fd3ff", "#b6ffd0", "#ffe58f"][i % 4], .8); return `<g style="mix-blend-mode:screen" opacity=".7">${st}</g>`; }
  return "";
}
// ---------- autographs: a seeded scribble built from the player's name ----------
function signature(name, R) {
  const parts = String(name).split(" "), last = parts.slice(1).join("") || parts[0];
  let d = `M0,6 C-6,-6 4,-26 10,-20 C14,-14 4,0 -2,4 C6,0 14,-4 18,0 C20,-18 28,-24 30,-14 C31,-6 24,2 22,4 C28,0 32,-2 36,0`, x = 36;
  for (const ch of last.slice(1, 9).toLowerCase()) {
    const asc = "bdfhklt".includes(ch), desc = "gjpqyz".includes(ch), w = 5 + R() * 3, h = asc ? 13 + R() * 4 : 5 + R() * 3;
    if (desc) d += ` C${f1(x + 2)},-6 ${f1(x + w)},-6 ${f1(x + w * .6)},4 C${f1(x + w * .3)},14 ${f1(x + w * 1.2)},12 ${f1(x + w)},0`;
    else d += ` C${f1(x + 1)},${f1(-h)} ${f1(x + w * .8)},${f1(-h)} ${f1(x + w * .5)},${f1(-h * .3)} C${f1(x + w * .4)},0 ${f1(x + w)},2 ${f1(x + w)},0`;
    x += w;
  }
  d += ` C${f1(x + 8)},-4 ${f1(x + 10)},6 ${f1(x - 6)},8 C${f1(x * .5)},10 10,12 -4,9`;
  return { d, w: x + 10 };
}

// ---------- packs ----------
// p: { name, sub, c1, c2, n }
function packSVG(p, key) {
  install();
  const id = "pk" + (++UID), R = rngOf(key || p.name);
  const edge = []; for (let x = 0; x <= W; x += 10) edge.push([x, 14 - (x / 10 % 2 ? 5 : 0)]);
  for (let x = W; x >= 0; x -= 10) edge.push([x, H - 14 + (x / 10 % 2 ? 5 : 0)]);
  const shape = poly(edge);
  let rays = ""; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; rays += `<polygon points="${pts([[125, 150], [125 + Math.cos(a) * 300, 150 + Math.sin(a) * 300], [125 + Math.cos(a + .12) * 300, 150 + Math.sin(a + .12) * 300]])}" fill="#fff" opacity=".07"/>`; }
  return `<svg class="cardsvg pack" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${xe(p.name)} pack">
<defs><linearGradient id="${id}-f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(p.c1, "#000", .35)}"/><stop offset=".35" stop-color="${p.c1}"/><stop offset=".5" stop-color="${mix(p.c1, "#fff", .45)}"/><stop offset=".65" stop-color="${p.c1}"/><stop offset="1" stop-color="${mix(p.c2, "#000", .3)}"/></linearGradient>
<linearGradient id="${id}-holo" x1="0" y1="0" x2="1" y2=".4">${["#ff5ec4", "#7ad7ff", "#9dff9a", "#fff27a", "#ff9e5e", "#c58bff", "#ff5ec4"].map((c, i, a) => `<stop offset="${f1(i / (a.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient>
<clipPath id="${id}-c"><path d="${shape}"/></clipPath></defs>
<g clip-path="url(#${id}-c)"><rect width="${W}" height="${H}" fill="url(#${id}-f)"/>${rays}
<g style="mix-blend-mode:overlay" opacity=".45"><rect class="holo" x="-250" y="0" width="750" height="${H}" fill="url(#${id}-holo)"/></g>
${Array.from({ length: 8 }, (_, i) => `<line x1="0" y1="${30 + i * 40}" x2="${W}" y2="${10 + i * 40}" stroke="#fff" stroke-width=".6" opacity=".12"/>`).join("")}
<rect x="0" y="0" width="${W}" height="30" fill="#000" opacity=".25"/><rect x="0" y="${H - 30}" width="${W}" height="30" fill="#000" opacity=".25"/></g>
<path d="${shape}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="1.5"/>
<g font-family="${FONT}" text-anchor="middle">
 <g transform="translate(125 112)"><circle r="44" fill="rgba(5,7,10,.55)" stroke="#fff" stroke-opacity=".7" stroke-width="2"/><g transform="scale(2.6)" style="color:#fff">${ICON[p.icon] || ICON.base}</g></g>
 <text x="125" y="196" font-size="15" fill="#fff" letter-spacing="5" opacity=".85">UBL</text>
 <text x="125" y="226" font-size="${p.name.length > 14 ? 22 : 28}" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.4)" stroke-width="1" paint-order="stroke"${p.name.length > 16 ? ` textLength="206" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(p.name.toUpperCase())}</text>
 <text x="125" y="246" font-size="${(p.sub || "").length > 40 ? 8 : (p.sub || "").length > 24 ? 9.5 : 11}" fill="#fff" opacity=".85" letter-spacing="1.5"${(p.sub || "").length > 24 ? ` textLength="206" lengthAdjust="spacingAndGlyphs"` : ""}>${xe((p.sub || "").toUpperCase())}</text>
 <g transform="translate(125 286)"><rect x="-38" y="-12" width="76" height="24" rx="12" fill="#fff"/><text y="5" font-size="12" font-weight="700" fill="${mix(p.c1, "#000", .5)}" letter-spacing="1">${p.n || 5} CARDS</text></g>
</g></svg>`;
}
// face-down card (before a pack reveal)
function mystery() {
  install();
  const id = "my" + (++UID);
  return `<svg class="cardsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-label="Face-down card">
<defs><linearGradient id="${id}-f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a2f38"/><stop offset=".5" stop-color="#8a93a3"/><stop offset="1" stop-color="#1b1f26"/></linearGradient>
<radialGradient id="${id}-g" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#f2b134" stop-opacity=".45"/><stop offset="1" stop-color="#05070a" stop-opacity="0"/></radialGradient></defs>
<path d="${OUTER}" fill="url(#${id}-f)"/><path d="${INNER}" fill="#0b0e13"/><path d="${INNER}" fill="url(#${id}-g)"/>
<g opacity=".1">${halftone(id + "-ht", "#f2b134", 1, 7)}</g>
<path d="${chamf(13, 13, W - 26, H - 26, 10)}" fill="none" stroke="#f2b134" stroke-opacity=".5"/>
<g transform="translate(125 160)"><circle r="54" fill="none" stroke="#f2b134" stroke-width="3"/><circle r="46" fill="#f2b134"/><path d="M-46,0 H46 M0,-46 V46 M-33,-33 Q-12,0 -33,33 M33,-33 Q12,0 33,33" stroke="#0b0e13" stroke-width="3.4" fill="none"/></g>
<text x="125" y="258" font-family="${FONT}" font-weight="700" font-size="30" fill="#f2b134" text-anchor="middle" letter-spacing="6">UBL</text>
<text x="125" y="278" font-family="${FONT}" font-size="9" fill="#8a93a3" text-anchor="middle" letter-spacing="2.5">UNITED BOUNCEBALL LEAGUE</text>
</svg>`;
}

// ---------- shared defs + runtime styles ----------
function sharedDefs() {
  return `<radialGradient id="ballg" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#ffb661"/><stop offset=".6" stop-color="#e2711d"/><stop offset="1" stop-color="#8a3c06"/></radialGradient>
<linearGradient id="goldg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5a12"/><stop offset=".45" stop-color="#ffe27a"/><stop offset=".7" stop-color="#c8971f"/><stop offset="1" stop-color="#fff3c2"/></linearGradient>
<linearGradient id="silverg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d8792"/><stop offset=".5" stop-color="#f4f7fa"/><stop offset="1" stop-color="#9aa4ae"/></linearGradient>`;
}
const CSS = `.cardsvg .holo{animation:cardholo 5s ease-in-out infinite alternate}
@keyframes cardholo{from{transform:translateX(-170px)}to{transform:translateX(170px)}}
.cardsvg .glint{animation:cardglint 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes cardglint{0%,70%,100%{opacity:0;transform:scale(.3)}80%{opacity:1;transform:scale(1)}}
.cardsvg .ember{animation:cardember 4s linear infinite;transform-box:fill-box}
@keyframes cardember{0%{transform:translateY(0);opacity:0}15%{opacity:1}100%{transform:translateY(-170px);opacity:0}}
.cardsvg .opalshift{animation:cardopal 9s linear infinite}
@keyframes cardopal{to{filter:hue-rotate(360deg)}}
.ctile .cardsvg .holo,.ctile .cardsvg .ember,.ctile .cardsvg .glint,.ctile .cardsvg .opalshift,.colt .cardsvg *{animation:none!important}
.ctile:hover .cardsvg .holo{animation:cardholo 5s ease-in-out infinite alternate!important}
.cardsvg .lay-bg,.cardsvg .lay-fig,.cardsvg .lay-fg{transform-origin:125px 175px;transition:transform .25s ease-out}
.fcard.tilting .cardsvg .lay-bg{transform:translate(calc(var(--px,0) * -7px),calc(var(--py,0) * -7px)) scale(1.05)}
.fcard.tilting .cardsvg .lay-fig{transform:translate(calc(var(--px,0) * 5px),calc(var(--py,0) * 4px))}
.fcard.tilting .cardsvg .lay-fg{transform:translate(calc(var(--px,0) * 9px),calc(var(--py,0) * 8px))}
.fcard.tilting .cardsvg .lay-bg,.fcard.tilting .cardsvg .lay-fig,.fcard.tilting .cardsvg .lay-fg{transition:transform .06s linear}
.fcard.tilting .cardsvg .holo{animation:none!important;transform:translateX(calc(var(--px,0) * 190px))}
.cardsvg .prism{animation:cardprism 7s linear infinite}.cardsvg .sfrac{animation:sfhue 4s linear infinite}@keyframes sfhue{to{filter:hue-rotate(360deg)}}.ctile .cardsvg .sfrac{animation:none}@keyframes cardprism{to{transform:translate(18px,-14px)}}
.fcard.tilting .cardsvg .prism{animation:none!important;transform:translate(calc(var(--px,0) * 40px),calc(var(--py,0) * 30px))}
.ctile .cardsvg .prism{animation:none!important}
.cardsvg .photo.fadein{animation:phin .35s ease-out both}@keyframes phin{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.cardsvg *{animation:none!important}.cardsvg .lay-bg,.cardsvg .lay-fig,.cardsvg .lay-fg{transform:none!important}}`;
let installed = false;
function install() {
  if (installed || typeof document === "undefined") return; installed = true;
  const d = document.createElement("div"); d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  d.innerHTML = `<svg width="0" height="0" aria-hidden="true"><defs>${sharedDefs()}</defs></svg>`; document.body.appendChild(d);
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
}

// ---------- the card ----------
const OUTER = chamf(0, 0, W, H, 18), INNER = chamf(10, 10, W - 20, H - 20, 12);
function frameDefs(id, T, R) {
  const fr = T.frame;
  return `<linearGradient id="${id}-fr" x1="0" y1="0" x2="1" y2="1">${fr.map((s, i) => `<stop offset="${f1(i / (fr.length - 1))}" stop-color="${s}"/>`).join("")}</linearGradient>
<linearGradient id="${id}-frv" x1="0" y1="0" x2="0" y2="1">${fr.slice().reverse().map((s, i) => `<stop offset="${f1(i / (fr.length - 1))}" stop-color="${s}"/>`).join("")}</linearGradient>
<clipPath id="${id}-band"><path d="${OUTER} ${INNER}" clip-rule="evenodd" fill-rule="evenodd"/></clipPath>
<clipPath id="${id}-clip"><path d="${INNER}"/></clipPath>
<clipPath id="${id}-oclip"><path d="${OUTER}"/></clipPath>
<filter id="${id}-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
<filter id="${id}-soft" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="2.5"/></filter>
${T.mat === "lava" ? `<filter id="${id}-lava" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".035 .05" numOctaves="3" seed="${Math.floor(R() * 90)}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 .38  0 0 0 0 .05  0 0 0 -9 5.2"/><feGaussianBlur stdDeviation=".4"/></filter>` : ""}`;
}
function rimFilter(id, acc, fill) {
  return `<filter id="${id}-rim" x="-35%" y="-30%" width="170%" height="160%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="8" result="g0"/><feFlood flood-color="${acc}" flood-opacity=".5"/><feComposite in2="g0" operator="in" result="aura"/>
<feOffset in="SourceAlpha" dx="-2.6" dy="2" result="o1"/><feComposite in="SourceAlpha" in2="o1" operator="out" result="e1"/><feGaussianBlur in="e1" stdDeviation=".7" result="e1b"/><feFlood flood-color="${mix(acc, "#ffffff", .45)}"/><feComposite in2="e1b" operator="in" result="rim1"/>
<feOffset in="SourceAlpha" dx="2.2" dy="-.6" result="o2"/><feComposite in="SourceAlpha" in2="o2" operator="out" result="e2"/><feGaussianBlur in="e2" stdDeviation=".8" result="e2b"/><feFlood flood-color="${fill}" flood-opacity=".75"/><feComposite in2="e2b" operator="in" result="rim2"/>
<feMerge><feMergeNode in="aura"/><feMergeNode in="SourceGraphic"/><feMergeNode in="rim1"/><feMergeNode in="rim2"/></feMerge></filter>`;
}

// ---------- player photos ----------
// Rendered on demand by the broadcast's photo booth (Broadcast3D.photo), kept as blob URLs in memory
// and in IndexedDB between visits. Cards ask only once they are on screen (or about to be).
const PH = { mem: new Map(), spec: new Map(), lay: new Map(), q: [], qs: new Set(), busy: false, off: false, fails: 0, ok: undefined, io: null, db: undefined };
const PV = 3; // bump to re-shoot every photo (2: the arcade athletes of broadcast v11; 3: hero camera, tier-colored rim)
function photoOK() {
  if (PH.ok === undefined) {
    let off = false; try { off = localStorage.getItem("ubl-photos") === "off"; } catch (e) { /* storage blocked */ }
    PH.ok = !off && typeof window !== "undefined" && typeof document !== "undefined" && !!(window.Broadcast3D && window.Broadcast3D.photo) && window.Broadcast3D.supported() && typeof IntersectionObserver !== "undefined";
    if (PH.ok) photoWatch();
  }
  return PH.ok && !PH.off;
}
function photoKey(c, pose, hat) { return [PV, c.pid, c.season, c.teamId || "", c.num, c.ht || "", c.wt || "", c.c1, pose, hat || "", c.tier ? c.tier.key : ""].join("|"); }
function photoSpec(c, pose, hat) {
  const tm = (BB.TEAMS || []).find(t => t.id === c.teamId) || { id: "UBL", city: "UBL", name: "UBL", c1: c.c1, c2: c.c2 };
  // rims: the card's tier color on one edge, the team's color on the other
  const T = TP[c.tier && c.tier.key] || TP.gold, team = lum(c.c1) > 0.25 ? c.c1 : lum(c.c2) > 0.25 ? c.c2 : mix(c.c1, "#ffffff", 0.45);
  return { r: { id: c.pid, ht: c.ht, wt: c.wt, num: c.num, name: c.name }, season: c.season, tm, c1: c.c1, c2: c.c2, pose, hat, rim: mix(T.acc, "#ffffff", 0.15), rim2: team };
}
function photoGet(key) { const ph = PH.mem.get(key); if (ph) { PH.mem.delete(key); PH.mem.set(key, ph); } return ph; }
function photoWatch() {
  PH.io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { PH.io.unobserve(e.target); photoWant(e.target.getAttribute("data-ph")); } }, { rootMargin: "400px" });
  const look = n => { if (n.nodeType !== 1) return; if (n.matches("svg.cardsvg[data-ph]")) PH.io.observe(n); else if (n.querySelector) n.querySelectorAll("svg.cardsvg[data-ph]").forEach(e => PH.io.observe(e)); };
  new MutationObserver(ms => { for (const m of ms) m.addedNodes.forEach(look); }).observe(document.body, { childList: true, subtree: true });
  document.querySelectorAll("svg.cardsvg[data-ph]").forEach(e => PH.io.observe(e));
}
function photoWant(key) {
  if (!key) return;
  if (PH.mem.has(key)) return photoApply(key);
  if (!PH.qs.has(key)) { PH.qs.add(key); PH.q.push(key); }
  photoPump();
}
const waiting = key => [...document.querySelectorAll("svg.cardsvg[data-ph]")].filter(el => el.getAttribute("data-ph") === key);
function photoApply(key) {
  const ph = photoGet(key); if (!ph) return;
  for (const el of waiting(key)) {
    const cid = el.getAttribute("data-cid"), lo = PH.lay.get(cid), g = el.querySelector(".lay-fig"); el.removeAttribute("data-ph");
    if (!lo || !g) continue;
    PH.lay.delete(cid);
    const old = g.querySelector(".vec"); g.insertAdjacentHTML("beforeend", photoLayer(ph, lo, true));
    if (old) { old.style.transition = "opacity .3s"; old.style.opacity = "0"; setTimeout(() => old.remove(), 350); }
  }
}
function idb() {
  if (PH.db !== undefined) return PH.db;
  PH.db = new Promise(res => {
    try {
      const rq = indexedDB.open("ubl-photos", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("p");
      rq.onsuccess = () => { const db = rq.result; try { const st = db.transaction("p", "readwrite").objectStore("p"), n = st.count(); n.onsuccess = () => { if (n.result > 2500) st.clear(); }; } catch (e) { /* fine */ } res(db); };
      rq.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  return PH.db;
}
async function idbGet(k) { const db = await idb(); if (!db) return null; return new Promise(res => { try { const rq = db.transaction("p").objectStore("p").get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch (e) { res(null); } }); }
async function idbPut(k, v) { const db = await idb(); if (!db) return; try { db.transaction("p", "readwrite").objectStore("p").put(v, k); } catch (e) { /* full or blocked: memory only */ } }
async function photoPump() {
  if (PH.busy) return; PH.busy = true;
  try {
    while (PH.q.length && !PH.off) {
      const key = PH.q.shift(); PH.qs.delete(key);
      if (PH.mem.has(key)) { photoApply(key); continue; }
      if (!waiting(key).length) continue; // scrolled away or closed: ask again when it's back
      let rec = await idbGet(key);
      if (!rec || !rec.blob) {
        const spec = PH.spec.get(key); if (!spec) continue;
        try { rec = await window.Broadcast3D.photo(spec); }
        catch (e) { console.warn("card photo", e); if (++PH.fails >= 3) PH.off = true; continue; }
        if (!rec || !rec.blob) continue;
        idbPut(key, rec);
      }
      PH.mem.set(key, { url: URL.createObjectURL(rec.blob), w: rec.w, h: rec.h, ppf: rec.ppf, a: rec.a });
      if (PH.mem.size > 900) { const [k0, v0] = PH.mem.entries().next().value; URL.revokeObjectURL(v0.url); PH.mem.delete(k0); }
      photoApply(key);
      await new Promise(r => window.requestIdleCallback ? requestIdleCallback(r, { timeout: 250 }) : setTimeout(r, 16)); // shoot when the page is idle
    }
  } finally { PH.busy = false; }
}
const ACTION = new Set(["dunk", "block", "shoot", "tackle", "stiffarm", "pass", "rebound", "steal", "dribble", "fadeaway", "hangrim", "crossover"]);
// the photo pops off the card: a dark contour, a soft glow in the tier color, a touch more contrast.
// Also: tier-colored motion blur for afterimages, and the mask that fades his floor reflection.
function photoFilter(id, acc, floorY) {
  const fy = floorY || 268;
  return `<filter id="${id}-mb" x="-30%" y="-10%" width="160%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="6 .6" result="b"/><feFlood flood-color="${acc}"/><feComposite in2="b" operator="in"/></filter>
<linearGradient id="${id}-rfg" gradientUnits="userSpaceOnUse" x1="0" y1="${fy}" x2="0" y2="${fy + 58}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="${id}-rfm" maskUnits="userSpaceOnUse" x="0" y="${fy}" width="${W}" height="${H - fy}"><rect x="0" y="${fy}" width="${W}" height="${H - fy}" fill="url(#${id}-rfg)"/></mask>
<filter id="${id}-phf" x="-25%" y="-12%" width="150%" height="124%" color-interpolation-filters="sRGB">
<feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="d"/><feGaussianBlur in="d" stdDeviation="1.1" result="db"/><feFlood flood-color="#04060a" flood-opacity=".8"/><feComposite in2="db" operator="in" result="edge"/>
<feGaussianBlur in="SourceAlpha" stdDeviation="7" result="g0"/><feFlood flood-color="${acc}" flood-opacity=".38"/><feComposite in2="g0" operator="in" result="aura"/>
<feMerge><feMergeNode in="aura"/><feMergeNode in="edge"/></feMerge></filter>`;
}
// place the cutout on the card: feet on the floor (or a hand on the rim), held inside the frame
function photoLayer(ph, o, fade) {
  const a = ph.a, p = POSES[o.pose] || POSES.stand, upf = o.portrait ? 47.5 : 31;
  let k = upf / ph.ppf, x0, y0;
  if (o.portrait) { x0 = o.cx - a.pelvis[0] * k; y0 = 62 - (a.head[1] - a.head[2] * 1.25) * k; }
  else if (o.anchor) { const hn = a.rim || a.hR; x0 = o.anchor.x - hn[0] * k; y0 = o.anchor.y - hn[1] * k; }
  else {
    x0 = o.cx - a.floor[0] * k; y0 = o.floor - a.floor[1] * k;
    const lim = 26;
    if (y0 < lim) {
      const air = Math.max(0, (a.floor[1] - a.feet[1]) * k), dy = Math.min(air, lim - y0); y0 += dy;
      if (y0 < lim) { const kk = (o.floor - lim) / (o.floor - y0); x0 = o.cx + (x0 - o.cx) * kk; y0 = o.floor + (y0 - o.floor) * kk; k *= kk; }
    }
  }
  const X = q => x0 + q[0] * k, Y = q => y0 + q[1] * k, s = upf / 28, w = ph.w * k, h = ph.h * k;
  const img = (extra, op, dx) => `<image href="${ph.url}" x="${f1(x0 + (dx || 0))}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" preserveAspectRatio="none"${op ? ` opacity="${op}"` : ""}${extra || ""}/>`;
  let out = "";
  const airy = (a.floor[1] - a.feet[1]) * k > 8, action = ACTION.has(o.pose), acc = o.acc || "#ffffff";
  let sd = Math.floor(Math.abs(x0 * 977 + y0 * 131)) % 2147483647 || 7; const rnd = () => (sd = sd * 48271 % 2147483647) / 2147483647;
  // speed lines behind a player in motion (he moves to the right)
  if (action && !o.portrait) {
    const top = y0 + h * 0.12, bot = Math.min(o.floor - 4, y0 + h * 0.92), back = x0 + w * 0.42;
    let ln = ""; for (let i = 0; i < 11; i++) { const y = top + (bot - top) * rnd(), len = 40 + rnd() * 90, x2 = back - rnd() * 18, wd = 0.8 + rnd() * 2.2; ln += `<line x1="${f1(x2 - len)}" y1="${f1(y)}" x2="${f1(x2)}" y2="${f1(y)}" stroke="${i % 3 ? acc : "#ffffff"}" stroke-width="${f1(wd)}" stroke-linecap="round" opacity="${f1(.25 + rnd() * .45)}"/>`; }
    out += `<g style="mix-blend-mode:screen">${ln}</g>`;
  }
  // an impact burst where the play happens: the rim hand on a dunk, the blocking hand, the hit
  const burstAt = o.pose === "dunk" || o.pose === "hangrim" ? (a.rim || a.hR) : o.pose === "block" ? a.hL : o.pose === "tackle" ? [(a.hL[0] + a.hR[0]) / 2, (a.hL[1] + a.hR[1]) / 2] : null;
  if (burstAt) { const bx = X(burstAt), by = Y(burstAt), n = 14; let d = ""; for (let i = 0; i < n * 2; i++) { const an = i / (n * 2) * Math.PI * 2, rr = i % 2 ? 9 * s : (26 + rnd() * 16) * s; d += (i ? "L" : "M") + f1(bx + Math.cos(an) * rr) + "," + f1(by + Math.sin(an) * rr); } out += `<path d="${d}Z" fill="${acc}" opacity=".5" style="mix-blend-mode:screen"/><circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(10 * s)}" fill="#fff" opacity=".55" filter="url(#${o.id}-soft)"/>`; }
  if (!o.portrait) {
    out += `<ellipse cx="${f1(X(a.floor))}" cy="${o.floor + 2}" rx="${f1((airy ? 26 : 42) * s / 1.1)}" ry="${f1((airy ? 3.5 : 6) * s / 1.1)}" fill="#000" opacity="${airy ? .3 : .5}" filter="url(#${o.id}-soft)"/>`;
    // his reflection in a glossy floor
    out += `<g mask="url(#${o.id}-rfm)" opacity="${airy ? .16 : .26}"><image href="${ph.url}" x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" preserveAspectRatio="none" transform="translate(0 ${f1(2 * o.floor + 4)}) scale(1 -1)"/></g>`;
  }
  // afterimages: blurred, tier-colored copies trailing the move
  if (action) out += [26, 13].map((dx, i) => img(` filter="url(#${o.id}-mb)"`, f1(.3 + i * .2), -dx * s)).join("");
  if (o.col === "escape") out += [34, 18].map((dx, i) => img("", f1(.14 + i * .12), -dx)).join("");
  // the contour and glow come from a copy underneath: run through a filter, the photo's own colors shift in some browsers
  out += img(` filter="url(#${o.id}-phf)"`) + img(` class="ph"`);
  // props drawn over the photo
  const hL = [X(a.hL), Y(a.hL)], hR = [X(a.hR), Y(a.hR)];
  if (p.ball === "pass") out += `<g opacity=".6">${[0, 1, 2].map(i => `<line x1="${f1(hR[0] + 16 * s)}" y1="${f1(hR[1] - 5 + i * 5)}" x2="${f1(hR[0] + (36 + i * 6) * s)}" y2="${f1(hR[1] - 5 + i * 5)}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`).join("")}</g>` + ballSVG(hR[0] + 54 * s, hR[1], 8.8 * s);
  if (p.ball === "swat") out += `<g opacity=".75">${[0, 1, 2].map(i => `<line x1="${f1(hL[0] + 8 + i * 5)}" y1="${f1(hL[1] - 2 + i * 6)}" x2="${f1(hL[0] + 30 + i * 9)}" y2="${f1(hL[1] + 14 + i * 7)}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`).join("")}</g>` + ballSVG(hL[0] - 12 * s, hL[1] - 12 * s, 8.8 * s);
  if (p.ball === "poke") { const bx = hR[0] + 14 * s, by = hR[1] + 4 * s; out += ballSVG(bx, by, 8.8 * s) + `<g stroke="#fff" stroke-width="2" stroke-linecap="round">${[[-14, -6], [-6, -16], [6, -15]].map(([dx, dy]) => `<line x1="${f1(bx + dx * .6)}" y1="${f1(by + dy * .6)}" x2="${f1(bx + dx)}" y2="${f1(by + dy)}"/>`).join("")}</g>`; }
  if (p.trophy) out += trophySVG((hL[0] + hR[0]) / 2, Math.min(hL[1], hR[1]) - 4 * s, s * 1.05);
  if (p.placard) { const ch = [X(a.chest), Y(a.chest) + 22 * s]; out += `<g><rect x="${f1(ch[0] - 31 * s)}" y="${f1(ch[1] - 13 * s)}" width="${f1(62 * s)}" height="${f1(28 * s)}" rx="1.5" fill="#101215" stroke="#d7dbe0" stroke-width="1.6"/><text x="${f1(ch[0])}" y="${f1(ch[1] - 2 * s)}" font-family="${FONT}" font-size="${f1(8 * s)}" fill="#e9edf3" text-anchor="middle" letter-spacing="1.2">UBL POLICE DEPT</text><text x="${f1(ch[0])}" y="${f1(ch[1] + 9 * s)}" font-family="${FONT}" font-weight="700" font-size="${f1(9 * s)}" fill="#ffffff" text-anchor="middle" letter-spacing=".5">${xe(o.placard || "")}</text></g>`; }
  if (o.col === "aprilfools") out = `<g transform="translate(250 0) scale(-1 1)">${out}</g>`;
  return `<g class="photo${fade ? " fadein" : ""}">${out}</g>`;
}

// c: { col, season, pid, team, ovr, rank, value, num, name, role, ht, wt, c1, c2, teamId, tier, serial }
// ---------- variants: parallels recolor the frame; autographs and game-worn patches add a sticker and a swatch ----------
const PFR = { B: ["#06235e", "#4f9dff", "#0b3fa8", "#cfe4ff", "#08296e"], G: ["#5a3d00", "#ffd54a", "#a87400", "#fff4c2", "#6b4a00"], R: ["#47040f", "#ff2f4f", "#8c0a1e", "#ffc2cb", "#52061a"],
  K: ["#050507", "#3a3d46", "#0c0d10", "#6f7480", "#060608"], S: ["#6b4a00", "#ffe27a", "#ff8fd8", "#8fd3ff", "#ffe27a"] };
const PINK = { B: "#7fb8ff", G: "#ffd54a", R: "#ff5c76", K: "#e6e9ef", S: "#ffe27a" };
function autoSticker(c, id) {
  const sg = signature(c.name, rngOf("sig" + c.pid)), k = Math.min(1.15, 96 / sg.w);
  return `<g transform="translate(124 188) rotate(-3)" filter="url(#${id}-ds)"><rect x="0" y="0" width="104" height="40" rx="4" fill="#f6f1e4"/><rect x="0" y="0" width="104" height="40" rx="4" fill="url(#${id}-sheen)"/>
<rect x="3" y="3" width="98" height="34" rx="3" fill="none" stroke="#c9b98f" stroke-width=".6"/>
<g transform="translate(${f1(52 - sg.w * k / 2)} 22) scale(${f1(k * 100) / 100})" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${sg.d}" stroke="#1d3fbf" stroke-width="2.1"/></g>
<text x="52" y="35.5" font-family="${FONT}" font-size="5" font-weight="700" fill="#7a6a45" text-anchor="middle" letter-spacing="1.1">CERTIFIED AUTOGRAPH · UBL</text></g>`;
}
function patchWindow(c, id, T) {
  const a = c.c1, b = c.c2 || "#222", lt = mix(a, "#ffffff", .25), dk = mix(a, "#000000", .3);
  let mesh = ""; for (let y = 0; y < 6; y++) for (let x = 0; x < 5; x++) mesh += `<circle cx="${f1(4 + x * 8.4 + (y % 2) * 4.2)}" cy="${f1(4 + y * 8.6)}" r="1.5" fill="${dk}" opacity=".55"/>`;
  return `<g transform="translate(22 146)"><defs><clipPath id="${id}-pw"><rect x="0" y="0" width="44" height="50" rx="6"/></clipPath></defs>
<rect x="-3" y="-3" width="50" height="56" rx="8" fill="rgba(5,7,10,.75)" stroke="url(#${id}-fr)" stroke-width="2.2"/>
<g clip-path="url(#${id}-pw)"><rect width="44" height="50" fill="${a}"/><rect width="44" height="50" fill="${lt}" opacity=".25"/>${mesh}
<path d="M-4,30 L48,14 L48,22 L-4,38Z" fill="${b}"/><path d="M-4,40 L48,24 L48,26 L-4,42Z" fill="#fff" opacity=".7"/>
<path d="M3,3 H41 V47 H3Z" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7" stroke-dasharray="2 1.6"/>
<rect width="44" height="50" fill="url(#${id}-sheen)"/></g>
<text x="22" y="62" font-family="${FONT}" font-size="6.2" font-weight="700" fill="${T.ink}" text-anchor="middle" letter-spacing="1">GAME-WORN</text></g>`;
}
function front(c) {
  install();
  const VO = c.cp && BB.ECO ? BB.ECO.parseCopy(c.cp) : null, PAR = VO && VO.par, T0 = TP[c.tier.key] || TP.gold;
  const id = "cd" + (++UID), T = PAR ? Object.assign({}, T0, { frame: PFR[PAR.code] }, PAR.code === "K" ? { deep: "#f4f6fa" } : {}) : T0, R = rngOf(c.col + ":" + c.season + ":" + c.pid);
  const C = BB.CARDS.CBY[c.col] || BB.CARDS.CBY.base;
  const g = { id, R, c1: c.c1, c2: c.c2, acc: T.acc, season: c.season, value: c.value, extra: c.extra, num: c.num, floor: 268, stage: STAGED.has(c.col) };
  let art = (ART[c.col] || ART.base)(g); if (typeof art === "string") art = { bg: art, fg: "" };
  const pv = R();
  const MPOSE = { pts: "fadeaway", reb: "rebound", ast: "pass", tkl: "tackle", dnk: "hangrim", fpm: "shoot" };
  const pose = C.pose === "stand" && c.col !== "ironworkers" && c.col !== "journeyman" ? (pv < 0.45 ? "portrait" : pv < 0.75 ? "akimbo" : "ballhip")
    : c.col === "moments" && c.extra ? MPOSE[c.extra.k] || "fadeaway" : c.col === "rapsheet" ? "mugshot" : C.poses ? C.poses[Math.floor(pv * C.poses.length)] : C.pose || "stand";
  const hangRim = pose === "hangrim" && (c.col === "posterized" || c.col === "moments");
  const portrait = POSES[pose] && POSES[pose].armsFront;
  const cx = pose === "tackle" ? 92 : pose === "steal" ? 112 : 134, anchor = pose === "dunk" ? { hand: "R", x: 180, y: 80 } : hangRim ? { hand: "R", x: 184, y: 90 } : null;
  const placard = c.col === "rapsheet" ? `${c.season}-${String(c.pid).padStart(5, "0")}` : "", hat = c.col === "christmas" ? "santa" : c.col === "stpatricks" ? "clover" : null;
  const fig = figure(pose, { ht: c.ht || 78, wt: c.wt || 210, c1: c.c1, c2: c.c2, num: c.num, id, R, season: c.season, acc: T.acc, portrait,
    cx, floor: portrait ? 430 : g.floor, scale: portrait ? 1.72 : 1.12, headTop: 62,
    anchor, shoe: R() < 0.5 ? "#f4f4f4" : (lum(c.c2) < 0.15 ? "#1b1d21" : c.c2), placard, hat });
  if (c.col === "aprilfools") fig.svg = `<g transform="translate(250 0) scale(-1 1)">${fig.svg}</g>`;
  const ghosts = c.col === "escape" ? [34, 18].map((dx, i) => `<g opacity="${.14 + i * .12}" transform="translate(${-dx} 0)">${fig.svg.replace(/filter="url\([^)]*-rim\)"/g, "")}</g>`).join("") : "";
  // the player's photo (his 3D model from the broadcast, posed for this card); the drawn figure stands in until it's ready
  let figLayer = `<g class="vec">${ghosts}${fig.svg}</g>`, phAttr = "";
  if (photoOK()) {
    const key = photoKey(c, pose, hat), lo = { id, pose, portrait, cx, floor: g.floor, anchor, placard, col: c.col, acc: T.acc }, ph = photoGet(key);
    if (ph) figLayer = photoLayer(ph, lo);
    else { PH.spec.set(key, photoSpec(c, pose, hat)); PH.lay.set(id, lo); if (PH.lay.size > 4000) for (const k of [...PH.lay.keys()].slice(0, 1500)) PH.lay.delete(k); phAttr = ` data-ph="${xe(key)}" data-cid="${id}"`; }
  }
  const last = (c.name.split(" ").slice(1).join(" ") || c.name).toUpperCase(), first = c.name.split(" ")[0].toUpperCase();
  const lastFit = last.length > 9 ? ` textLength="${Math.min(192, last.length * 17.5)}" lengthAdjust="spacingAndGlyphs"` : "";
  const unit = (C.short || C.unit || "").toUpperCase();
  const val = C.kind === "leader" && c.value !== null && c.value !== undefined ? `${c.value} ${unit}` : "";
  const ft = h => `${Math.floor(h / 12)}'${h % 12}"`, ex = c.extra || {};
  const ribbon = C.kind === "leader" ? (c.col === "dunktober" ? `${ex.date ? BB.CARDS.shortDate(ex.date) + " · " : ""}${c.value} DUNKS${ex.o ? " VS " + ex.o : ""}` : c.rank === 1 ? "LEAGUE LEADER" + (val ? " · " + val : "") : `#${c.rank}` + (val ? " · " + val : ""))
    : C.kind === "holiday" && c.col !== "game7" ? `${ex.date ? BB.CARDS.shortDate(ex.date) + " · " : ""}${c.value || ""}${ex.o ? " VS " + ex.o : ""}`
    : ({ moments: () => `${c.value}${ex.o ? " VS " + ex.o : ""}`, fifty: () => `${c.value}${ex.o ? " VS " + ex.o : ""}`, immortals: () => `ALL-TIME #${c.rank}`, hof: () => c.value ? `CLASS OF ${c.value}` : "",
      numberone: () => `#1 PICK · ${c.value || c.season - 1}`, franchise: () => `${c.value} SEASONS`, journeyman: () => `${c.value} TEAMS`, younggun: () => `AGE ${c.value}`, ageless: () => `AGE ${c.value}`,
      skyscrapers: () => ft(c.value), pocket: () => ft(c.value), game7: () => `GAME 7 · ${c.value || ""}${ex.o ? " VS " + ex.o : ""}`, dynasty: () => `${c.value} STRAIGHT TITLES`, ironworkers: () => `${c.value} GAMES`, mvp: () => "MVP", fmvp: () => "FINALS MVP", dpoy: () => "DEFENSIVE POY", roy: () => "ROOKIE OF THE YEAR", champ: () => "CHAMPION" }[c.col] || (() => ""))().toUpperCase();
  const subTxt = (c.col === "base" ? (BB.ROLES[c.role] ? BB.ROLES[c.role].name + " · " + c.season : String(c.season)) : C.name + " · " + c.season).toUpperCase();
  const subFit = subTxt.length > 30 ? ` textLength="190" lengthAdjust="spacingAndGlyphs"` : "";
  const ribW = Math.min(196, Math.max(96, ribbon.length * 7 + 24)), ribFit = ribbon.length * 7 + 24 > 196 ? ` textLength="180" lengthAdjust="spacingAndGlyphs"` : "";
  const holo = T.holo ? `<g style="mix-blend-mode:${T.molten ? "screen" : "overlay"}" opacity="${T.molten ? .32 : .5}"><rect class="holo" x="-250" y="0" width="750" height="350" fill="url(#${id}-holo)"/></g>` : "";
  const glints = (c.tier.key === "diamond" || c.tier.key === "opal" || c.tier.key === "vulcan") ? [[34, 120], [214, 168], [60, 250], [196, 96]].map(([x, y], i) => `<g class="glint" style="animation-delay:${f1(i * .8)}s">${star4(x, y, 7, "#ffffff", 1)}</g>`).join("") : "";
  const embers = T.molten ? Array.from({ length: 16 }, () => `<circle class="ember" style="animation-delay:${f1(R() * 4)}s;animation-duration:${f1(3 + R() * 3)}s" cx="${f1(20 + R() * 210)}" cy="${f1(200 + R() * 140)}" r="${f1(1 + R() * 1.8)}" fill="#ffb347"/>`).join("") : "";
  const tc = c.c1, tt = lum(c.c1) > 0.6 ? "#111" : "#fff";
  const pos = BB.CARDS.POS[c.role] || "";
  const icon = ICON[c.col] || ICON.base;
  const serial = c.serial ? `No. ${c.serial}` : `#${c.num}`;
  const signed = !(VO && VO.auto) && c.col !== "rapsheet" && (c.ovr >= 81 || ["hof", "immortals", "mvp", "fmvp", "numberone", "franchise"].includes(c.col));
  let sig = "";
  if (signed) {
    const sg = signature(c.name, rngOf("sig" + c.pid)), k = Math.min(1.25, 92 / sg.w);
    const light = ["hof", "rapsheet", "founders", "ageless", "journeyman"].includes(c.col) || (c.col === "base" && c.season < 1962);
    const ink = c.col === "hof" || c.col === "immortals" ? "url(#goldg)" : light ? "#1a2a6c" : "#ffffff";
    sig = `<g transform="translate(${f1(214 - sg.w * k)} ${c.col === "moments" ? 172 : 214}) rotate(-9) scale(${f1(k * 100) / 100})" fill="none" stroke-linecap="round" stroke-linejoin="round">${light ? "" : `<path d="${sg.d}" stroke="#000" stroke-width="4" opacity=".45"/>`}<path d="${sg.d}" stroke="${ink}" stroke-width="1.9"/></g>`;
  }
  return `<svg class="cardsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"${phAttr} aria-label="${xe(c.name)} ${c.season} ${xe(C.name)} card, ${c.ovr} overall, ${c.tier.name}">
<defs>
 ${frameDefs(id, T, R)}${rimFilter(id, T.acc, mix(c.c1, "#ffffff", 0.35))}${fig.defs}${PH.ok ? photoFilter(id, T.acc) : ""}
 <linearGradient id="${id}-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".42" stop-color="#05070a" stop-opacity=".78"/><stop offset="1" stop-color="#05070a" stop-opacity=".97"/></linearGradient>
 <radialGradient id="${id}-vig" cx=".5" cy=".45" r=".72"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
 <linearGradient id="${id}-holo" x1="0" y1="0" x2="1" y2=".4">${(T.molten ? ["#ff3d00", "#ffb347", "#ff3d00", "#2a0904", "#ff6a1f", "#ffd166", "#ff3d00"] : ["#ff5ec4", "#7ad7ff", "#9dff9a", "#fff27a", "#ff9e5e", "#c58bff", "#ff5ec4"]).map((s, i, a) => `<stop offset="${f1(i / (a.length - 1))}" stop-color="${s}"/>`).join("")}</linearGradient>
 <linearGradient id="${id}-nm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="${mix(T.acc, "#ffffff", .55)}"/><stop offset=".56" stop-color="${mix(T.acc, "#ffffff", .25)}"/><stop offset="1" stop-color="${mix(T.acc, "#ffffff", .7)}"/></linearGradient>
 <filter id="${id}-ds" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-color="#000" flood-opacity=".6"/></filter>
 <linearGradient id="${id}-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<path d="${OUTER}" fill="url(#${id}-fr)"/>
${material(id, T, R)}
${prism(id, T, PAR ? "diamond" : c.tier.key)}
${PAR ? `<g clip-path="url(#${id}-band)"${PAR.code === "S" ? ` class="sfrac"` : ""}><rect width="${W}" height="${H}" fill="url(#${id}-holo)" opacity="${PAR.code === "S" ? .55 : PAR.code === "K" ? .12 : .2}" style="mix-blend-mode:overlay"/></g>` : ""}
<path d="${chamf(3, 3, W - 6, H - 6, 16)}" fill="none" stroke="url(#${id}-frv)" stroke-width="1.6" opacity=".9"/>
${frameOverlay(C.frame, id, T, R)}
${bevel(id, T)}
<path d="${OUTER}" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="1.4"/>
<g clip-path="url(#${id}-clip)">
 <g class="lay-bg">${art.bg}</g>
 ${foil(c.tier.key, id, R)}${holo}
 <g class="lay-fig">${figLayer}</g>
 <g class="lay-fg">${art.fg}</g>
 ${embers}
 <rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>
 <rect x="0" y="214" width="${W}" height="136" fill="url(#${id}-plate)"/>
 ${sig}
 ${VO && VO.auto ? autoSticker(c, id) : ""}
 ${glints}
 <rect width="${W}" height="${H}" fill="url(#${id}-sheen)"/>
</g>
<path d="${INNER}" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2.4"/>
<path d="${chamf(13, 13, W - 26, H - 26, 10)}" fill="none" stroke="${T.acc}" stroke-opacity=".55" stroke-width=".9"/>
${PAR ? `<path d="${INNER}" fill="none" stroke="${PINK[PAR.code]}" stroke-width="2.2" opacity=".85"/>` : ""}
${corners(T, c.tier.key)}
<g font-family="${FONT}">
 <path d="M18,10 H70 V88 L44,100 L18,88Z" fill="rgba(5,7,10,.62)" stroke="url(#${id}-fr)" stroke-width="2.4"/>
 <path d="M22,14 H66 V20 H22Z" fill="${T.acc}" opacity=".85"/>
 <text x="44" y="58" font-size="${c.ovr >= 100 ? 30 : 38}" font-weight="700" fill="url(#${id}-nm)" text-anchor="middle" stroke="rgba(0,0,0,.6)" stroke-width="1.2" paint-order="stroke">${c.ovr}</text>
 <line x1="28" y1="66" x2="60" y2="66" stroke="${T.acc}" stroke-width="1" opacity=".7"/>
 <text x="44" y="82" font-size="13" font-weight="700" fill="${T.ink}" text-anchor="middle" letter-spacing="1.4">${xe(pos)}</text>
 <g transform="translate(44 120)" filter="url(#${id}-ds)">${crest(c.teamId, tc, c.c2, 30)}</g>
 <g transform="translate(210 40)" style="color:${T.ink}"><circle r="21" fill="rgba(5,7,10,.72)" stroke="url(#${id}-fr)" stroke-width="3.4"/><circle r="16.5" fill="none" stroke="${T.acc}" stroke-width=".8" opacity=".7"/><g transform="scale(.95)">${icon}</g></g>
 <g transform="translate(210 74)"><rect x="-20" y="-8" width="40" height="16" rx="3" fill="rgba(5,7,10,.72)" stroke="${T.acc}" stroke-width=".9"/><text y="4.5" font-size="11" font-weight="700" fill="${T.ink}" text-anchor="middle">'${String(c.season).slice(2)}</text></g>
 ${ribbon ? `<g transform="translate(125 238)"><path d="M${-ribW / 2},-10 H${ribW / 2} L${ribW / 2 + 7},0 L${ribW / 2},10 H${-ribW / 2} L${-ribW / 2 - 7},0Z" fill="url(#${id}-fr)" stroke="#000" stroke-opacity=".5"/><text y="4" font-size="11" font-weight="700" fill="${T.deep}" text-anchor="middle" letter-spacing="1.2"${ribFit}>${xe(ribbon)}</text></g>` : ""}
 <text x="125" y="268" font-size="12" fill="#d4dbe4" text-anchor="middle" letter-spacing="3.5">${xe(first)}</text>
 <g transform="translate(125 296) skewX(-7)"><text x="2" y="2.5" font-size="31" font-weight="700" fill="${T0.deep}" opacity=".85" text-anchor="middle" letter-spacing=".6"${lastFit}>${xe(last)}</text><text x="0" y="0" font-size="31" font-weight="700" fill="url(#${id}-nm)" text-anchor="middle" letter-spacing=".6" stroke="rgba(0,0,0,.55)" stroke-width="1.1" paint-order="stroke"${lastFit}>${xe(last)}</text></g>
 <path d="M24,304 H226 L220,318 H30Z" fill="url(#${id}-fr)" opacity=".95"/>
 <path d="M24,304 H226" stroke="#fff" stroke-opacity=".45" stroke-width=".8"/>
 <text x="125" y="314.5" font-size="10" font-weight="700" fill="${T.deep}" text-anchor="middle" letter-spacing="1.4"${subFit}>${xe(subTxt)}</text>
 <text x="30" y="333" font-size="8.5" fill="${PAR ? PINK[PAR.code] : "#9aa4b2"}" letter-spacing="1.2"${PAR ? ` font-weight="700"` : ""}${PAR && c.tier.name.length + PAR.name.length > 11 ? ` textLength="78" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(c.tier.name.toUpperCase() + (PAR ? " · " + (PAR.code === "S" ? "SUPER 1/1" : PAR.name.toUpperCase()) : ""))}</text>
 ${PAR ? `<g transform="translate(205 330)"><rect x="-22" y="-9" width="44" height="13" rx="2.5" fill="url(#${id}-fr)" stroke="#000" stroke-opacity=".6" stroke-width=".8"/><text y="1" font-size="9" font-weight="700" fill="${PAR.code === "K" ? "#fff" : "#120d02"}" text-anchor="middle" letter-spacing=".8">${PAR.run === 1 ? "1/1" : `${VO.n}/${PAR.run}`}</text></g>`
    : `<text x="220" y="333" font-size="8.5" fill="#9aa4b2" letter-spacing="1.2" text-anchor="end">${xe(serial)}</text>`}
 ${VO && VO.patch != null ? patchWindow(c, id, T) : ""}
</g>
${gemSVG(T, c.tier.key, 125, 336)}
</svg>`;
}

// ---------- back of the card ----------
// r: ratings on the card. c.arch (archetype), c.line (season stat line), c.serial and c.boosts are optional.
// Laid out like a real card back: a crest header, the collection's card text, a radar beside bars for
// the six rating groups, a stat table for the season, badges, and a bio line with the card's numbers.
function wrapText(str, n) { const out = []; let line = ""; for (const w of String(str || "").split(/\s+/)) { if ((line + " " + w).trim().length > n) { if (line) out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out; }
function back(c, r) {
  install();
  const VO = c.cp && BB.ECO ? BB.ECO.parseCopy(c.cp) : null, PAR = VO && VO.par, T0 = TP[c.tier.key] || TP.gold;
  const id = "cb" + (++UID), T = PAR ? Object.assign({}, T0, { frame: PFR[PAR.code] }) : T0, R = rngOf("b" + c.pid + c.season), CC = BB.CARDS;
  const gs = CC.groupScores(r), bd = CC.badges(r).slice(0, 6), C = CC.CBY[c.col] || CC.CBY.base;
  const BC = { hof: "#c58bff", gold: "#f6cf55", silver: "#dfe6ee", bronze: "#e0a46a" };
  const team = (BB.TEAMS || []).find(t => t.id === c.teamId), first = c.name.split(" ")[0].toUpperCase(), last = (c.name.split(" ").slice(1).join(" ") || c.name).toUpperCase();
  const tc = c.c1, ft = h => h ? `${Math.floor(h / 12)}'${h % 12}"` : "";
  // radar of the six rating groups, left
  const n = CC.GROUPS.length, cx = 62, cy = 172, RR = 30;
  const pt = (i, v) => { const a = -Math.PI / 2 + i / n * Math.PI * 2, rr = RR * Math.max(0, v - 25) / 74; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; };
  let radar = "";
  for (const lv of [50, 75, 99]) radar += `<polygon points="${CC.GROUPS.map((q, i) => P2(pt(i, lv))).join(" ")}" fill="none" stroke="#ffffff" stroke-opacity=".14"/>`;
  CC.GROUPS.forEach((q, i) => { const [x, y] = pt(i, 99); radar += `<line x1="${cx}" y1="${cy}" x2="${f1(x)}" y2="${f1(y)}" stroke="#fff" stroke-opacity=".1"/>`; });
  radar += `<polygon points="${CC.GROUPS.map((q, i) => P2(pt(i, gs[q.key]))).join(" ")}" fill="${T.acc}" fill-opacity=".35" stroke="${T.acc}" stroke-width="1.6"/>`;
  CC.GROUPS.forEach((q, i) => { const [x, y] = pt(i, gs[q.key]); radar += `<circle cx="${f1(x)}" cy="${f1(y)}" r="1.6" fill="#fff"/>`; });
  // bars for the same six groups, right
  const bars = CC.GROUPS.map((q, i) => { const v = Math.round(gs[q.key]), y = 143 + i * 11.8, w = 52 * Math.max(0, Math.min(99, v) - 25) / 74;
    return `<text x="104" y="${f1(y + 3)}" font-size="7" fill="#aab3bf" letter-spacing=".3">${xe(q.name.toUpperCase())}</text><rect x="161" y="${f1(y - 2.5)}" width="52" height="5" rx="2.5" fill="#ffffff" opacity=".08"/><rect x="161" y="${f1(y - 2.5)}" width="${f1(w)}" height="5" rx="2.5" fill="${valColor(v)}"/><text x="228" y="${f1(y + 3.3)}" font-size="9.5" font-weight="700" fill="#fff" text-anchor="end">${v}</text>`; }).join("");
  // the season's stat table
  const line = c.line && c.line.length ? `<g transform="translate(0 226)"><rect x="22" y="-14" width="206" height="38" rx="5" fill="rgba(0,0,0,.35)" stroke="${T.acc}" stroke-opacity=".45"/><rect x="22" y="-14" width="206" height="12" rx="5" fill="${T.acc}" opacity=".22"/>`
    + `<text x="30" y="-5" font-size="7.2" fill="${T.ink}" letter-spacing="1.4">${c.season} SEASON · PER GAME</text>`
    + c.line.map(([l, v], i, a) => { const x = 40 + i * (170 / (a.length - 1)); return `<text x="${f1(x)}" y="14" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${v}</text><text x="${f1(x)}" y="21.5" font-size="6.6" fill="#8b95a5" text-anchor="middle" letter-spacing="1">${xe(l)}</text>`; }).join("") + `</g>` : "";
  let text = wrapText(C.blurb || "", 54); if (text.length > 3) { text = text.slice(0, 3); text[2] = text[2].replace(/[\s,.;:]*\S*$/, "…"); }
  const by = line ? 266 : 226;
  const bio = [ft(c.ht), c.wt ? c.wt + " LB" : "", c.num !== undefined ? "#" + c.num : "", team ? (team.city + " " + team.name).toUpperCase() : ""].filter(Boolean).join("  ·  ");
  return `<svg class="cardsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${frameDefs(id, T, R)}
<linearGradient id="${id}-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c.c1, "#05070a", .55)}"/><stop offset=".35" stop-color="${mix(c.c1, "#05070a", .82)}"/><stop offset="1" stop-color="#05070a"/></linearGradient>
<linearGradient id="${id}-nm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="${mix(T.acc, "#ffffff", .55)}"/><stop offset=".56" stop-color="${mix(T.acc, "#ffffff", .25)}"/><stop offset="1" stop-color="${mix(T.acc, "#ffffff", .7)}"/></linearGradient>
<filter id="${id}-ds" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-color="#000" flood-opacity=".6"/></filter></defs>
<path d="${OUTER}" fill="url(#${id}-fr)"/>${material(id, T, R)}${prism(id, T, PAR ? "diamond" : c.tier.key)}
${PAR ? `<g clip-path="url(#${id}-band)"${PAR.code === "S" ? ` class="sfrac"` : ""}><rect width="${W}" height="${H}" fill="url(#${id}-holo)" opacity="${PAR.code === "S" ? .55 : PAR.code === "K" ? .12 : .2}" style="mix-blend-mode:overlay"/></g>` : ""}${bevel(id, T)}
<path d="${INNER}" fill="url(#${id}-in)"/>
<g clip-path="url(#${id}-clip)"><g opacity=".07" transform="translate(196 300) scale(3.2)">${crest(c.teamId, "#ffffff", "#ffffff", 30)}</g>${halftone(id + "-ht", "#ffffff", .04, 5)}
 <path d="M10,10 H240 V84 H10Z" fill="${tc}" opacity=".22"/><path d="M10,84 H240" stroke="${T.acc}" stroke-opacity=".6"/></g>
<path d="${INNER}" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2.4"/>
<path d="${chamf(13, 13, W - 26, H - 26, 10)}" fill="none" stroke="${T.acc}" stroke-opacity=".5" stroke-width=".9"/>
${corners(T, c.tier.key)}
<g font-family="${FONT}">
 <g transform="translate(40 48)" filter="url(#${id}-ds)">${crest(c.teamId, tc, c.c2, 38)}</g>
 <text x="66" y="31" font-size="9" fill="#d4dbe4" letter-spacing="2.6">${xe(first)}</text>
 <g transform="translate(66 52) skewX(-7)"><text x="1.6" y="2" font-size="22" font-weight="700" fill="${T.deep}" opacity=".85"${last.length > 7 ? ` textLength="${Math.min(118, last.length * 13.5)}" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(last)}</text><text font-size="22" font-weight="700" fill="url(#${id}-nm)" stroke="rgba(0,0,0,.5)" stroke-width=".9" paint-order="stroke"${last.length > 7 ? ` textLength="${Math.min(118, last.length * 13.5)}" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(last)}</text></g>
 <text x="66" y="68" font-size="8.4" fill="${T.acc}" letter-spacing="1.1"${(c.arch || "").length > 26 ? ` textLength="128" lengthAdjust="spacingAndGlyphs"` : ""}>${xe((c.arch || (BB.ROLES[c.role] ? BB.ROLES[c.role].name : "")).toUpperCase())}</text>
 <g transform="translate(214 46)"><path d="M-20,-28 H20 V18 L0,28 L-20,18Z" fill="rgba(5,7,10,.65)" stroke="url(#${id}-fr)" stroke-width="2"/><text y="2" font-size="25" font-weight="700" fill="url(#${id}-nm)" text-anchor="middle" stroke="rgba(0,0,0,.6)" stroke-width="1" paint-order="stroke">${c.ovr}</text><text y="15" font-size="8.5" font-weight="700" fill="${T.acc}" text-anchor="middle" letter-spacing="1">${xe(CC.POS[c.role] || "")}</text></g>
 <text x="22" y="99" font-size="8" fill="${T.acc}" letter-spacing="1.6">${xe(c.tier.name.toUpperCase())} · ${xe(C.name.toUpperCase())} · ${c.season}</text>
 ${text.map((t, i) => `<text x="22" y="${110 + i * 9}" font-family="Inter, system-ui, sans-serif" font-size="7.3" fill="#cfd6e0" font-style="italic">${xe(t)}</text>`).join("")}
 ${radar}${bars}
 ${line}
 <text x="22" y="${by}" font-size="8" fill="${T.acc}" letter-spacing="1.6">BADGES</text>
 ${bd.length ? bd.map((b, i) => `<g transform="translate(${24 + (i % 2) * 102} ${by + 13 + Math.floor(i / 2) * 13})"><path d="M0,-5 L4.4,-2.5 V2.5 L0,5 L-4.4,2.5 V-2.5Z" transform="translate(4 -3)" fill="${BC[b.tier]}"/><text x="12" y="0" font-size="9" fill="#e9edf3">${xe(b.name)}</text></g>`).join("") : `<text x="24" y="${by + 13}" font-size="9" fill="#8b95a5">No badges yet</text>`}
 <text x="125" y="318" font-size="7.4" fill="#aab3bf" text-anchor="middle" letter-spacing="1"${bio.length > 52 ? ` textLength="200" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(bio)}</text>
 <text x="30" y="333" font-size="8" fill="#8b95a5" letter-spacing="1.4">${c.serial ? `NO. ${xe(c.serial)}` : `UBL ${c.season}`}</text>
 <text x="220" y="333" font-size="8" fill="${c.boosts && Object.keys(c.boosts).length ? T.acc : "#8b95a5"}" letter-spacing=".6" text-anchor="end">${c.boosts && Object.keys(c.boosts).length ? Object.entries(c.boosts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${SHORT[k] || k.toUpperCase()} +${v}`).join(" ") : "TAP TO FLIP"}</text>
</g>
${gemSVG(T, c.tier.key, 125, 336)}
</svg>`;
}
const SHORT = { spd: "SPD", acc: "ACC", str: "STR", vert: "VRT", bnc: "BNC", sta: "STA", hands: "HND", sec: "SEC", brk: "BRK", tck: "TCK", ins: "FIN", mid: "MID", thr: "3PT", fr: "4PT", ft: "FT", pas: "PAS", iq: "IQ", perD: "DEF", rim: "RIM", reb: "REB" };
function valColor(v) { return v >= 90 ? "#c58bff" : v >= 80 ? "#35eaa3" : v >= 70 ? "#f6cf55" : v >= 60 ? "#ff9e5e" : "#ff5a6a"; }
return { front, back, packSVG, mystery, valColor, TP, POSES, figure, mix, lum, rngOf, ABBR, ICON, W, H, photos: PH, photoSpec };
})();
