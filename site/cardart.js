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
  guard:     { lean: 14,  arms: [-82, -108, 82, 108],  legs: [-40, -4, 40, 4],    ball: null }
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
  const hair = hairFor(R, era), shoeCol = o.shoe || "#f4f4f4";
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
  if (hair === "band") head += `<path d="M${P2(add(add(Hc, q, -hr * 0.9), u, hr * 0.3))} Q${P2(add(Hc, u, hr * 0.62))} ${P2(add(add(Hc, q, hr * 0.9), u, hr * 0.3))}" stroke="${trim}" stroke-width="${f1(3.6 * s)}" fill="none"/>`;
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
  const minY = Math.min(Hc[1] - hr * (hair === "hightop" ? 1.6 : hair === "afro" ? 1.45 : 1), AL[1], AR[1]) - (p.ball === "release" ? 35 * s : p.ball === "top" ? 18 * s : p.trophy ? 46 * s : 7 * s);
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
function bg(g, top, bot, glowCol) {
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
  rapsheet(g) {
    let s = bg(g, "#cfd2d7", "#8e939b", "#ffffff");
    for (let i = 0; i <= 10; i++) { const y = g.floor - i * 24; s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#2b2f36" stroke-width="${i % 2 ? .8 : 1.6}" opacity=".5"/>`; if (i % 2 === 0) s += `<text x="8" y="${y - 3}" font-family="${FONT}" font-size="10" fill="#2b2f36" opacity=".7">${5 + i / 4 | 0}'${(i % 4) * 3}"</text><text x="242" y="${y - 3}" font-family="${FONT}" font-size="10" fill="#2b2f36" opacity=".7" text-anchor="end">${5 + i / 4 | 0}'${(i % 4) * 3}"</text>`; }
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${g.id}-flash)"/><defs><radialGradient id="${g.id}-flash" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs>`;
    return { bg: s, fg: `<g transform="translate(184 212) rotate(-14)" opacity=".8"><rect x="-38" y="-14" width="76" height="28" fill="none" stroke="#b3122b" stroke-width="3"/><text y="8" font-family="${FONT}" font-weight="700" font-size="21" fill="#b3122b" text-anchor="middle" letter-spacing="3">FILED</text></g>` };
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
@media (prefers-reduced-motion:reduce){.cardsvg *{animation:none!important}}`;
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

// c: { col, season, pid, team, ovr, rank, value, num, name, role, ht, wt, c1, c2, teamId, tier, serial }
function front(c) {
  install();
  const id = "cd" + (++UID), T = TP[c.tier.key] || TP.gold, R = rngOf(c.col + ":" + c.season + ":" + c.pid);
  const C = BB.CARDS.CBY[c.col] || BB.CARDS.CBY.base;
  const g = { id, R, c1: c.c1, c2: c.c2, acc: T.acc, season: c.season, value: c.value, floor: 268 };
  let art = (ART[c.col] || ART.base)(g); if (typeof art === "string") art = { bg: art, fg: "" };
  const pv = R();
  const pose = C.pose === "stand" && c.col !== "ironworkers" ? (pv < 0.45 ? "portrait" : pv < 0.75 ? "akimbo" : "ballhip") : c.col === "rapsheet" ? "mugshot" : C.pose || "stand";
  const portrait = POSES[pose] && POSES[pose].armsFront;
  const fig = figure(pose, { ht: c.ht || 78, wt: c.wt || 210, c1: c.c1, c2: c.c2, num: c.num, id, R, season: c.season, acc: T.acc, portrait,
    cx: pose === "tackle" ? 92 : pose === "steal" ? 112 : 134, floor: portrait ? 430 : g.floor, scale: portrait ? 1.72 : 1.12, headTop: 62,
    anchor: pose === "dunk" ? { hand: "R", x: 180, y: 80 } : null, shoe: R() < 0.5 ? "#f4f4f4" : (lum(c.c2) < 0.15 ? "#1b1d21" : c.c2),
    placard: c.col === "rapsheet" ? `${c.season}-${String(c.pid).padStart(5, "0")}` : "" });
  const ghosts = c.col === "escape" ? [34, 18].map((dx, i) => `<g opacity="${.14 + i * .12}" transform="translate(${-dx} 0)">${fig.svg.replace(/filter="url\([^)]*-rim\)"/g, "")}</g>`).join("") : "";
  const last = (c.name.split(" ").slice(1).join(" ") || c.name).toUpperCase(), first = c.name.split(" ")[0].toUpperCase();
  const lastFit = last.length > 11 ? ` textLength="${Math.min(204, last.length * 16.5)}" lengthAdjust="spacingAndGlyphs"` : "";
  const unit = (C.short || C.unit || "").toUpperCase();
  const val = C.kind === "leader" && c.value !== null && c.value !== undefined ? `${c.value} ${unit}` : "";
  const ribbon = C.kind !== "leader" ? "" : c.rank === 1 ? "LEAGUE LEADER" + (val ? " · " + val : "") : `#${c.rank}` + (val ? " · " + val : "");
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
  return `<svg class="cardsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${xe(c.name)} ${c.season} ${xe(C.name)} card, ${c.ovr} overall, ${c.tier.name}">
<defs>
 ${frameDefs(id, T, R)}${rimFilter(id, T.acc, mix(c.c1, "#ffffff", 0.35))}${fig.defs}
 <linearGradient id="${id}-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".42" stop-color="#05070a" stop-opacity=".78"/><stop offset="1" stop-color="#05070a" stop-opacity=".97"/></linearGradient>
 <radialGradient id="${id}-vig" cx=".5" cy=".45" r=".72"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
 <linearGradient id="${id}-holo" x1="0" y1="0" x2="1" y2=".4">${(T.molten ? ["#ff3d00", "#ffb347", "#ff3d00", "#2a0904", "#ff6a1f", "#ffd166", "#ff3d00"] : ["#ff5ec4", "#7ad7ff", "#9dff9a", "#fff27a", "#ff9e5e", "#c58bff", "#ff5ec4"]).map((s, i, a) => `<stop offset="${f1(i / (a.length - 1))}" stop-color="${s}"/>`).join("")}</linearGradient>
 <linearGradient id="${id}-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".22"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<path d="${OUTER}" fill="url(#${id}-fr)"/>
${material(id, T, R)}
<path d="${chamf(3, 3, W - 6, H - 6, 16)}" fill="none" stroke="url(#${id}-frv)" stroke-width="1.6" opacity=".9"/>
<path d="${OUTER}" fill="none" stroke="#000" stroke-opacity=".6" stroke-width="1.4"/>
<g clip-path="url(#${id}-clip)">
 ${art.bg}
 ${ghosts}${fig.svg}
 ${art.fg}
 ${embers}
 <rect width="${W}" height="${H}" fill="url(#${id}-vig)"/>
 <rect x="0" y="214" width="${W}" height="136" fill="url(#${id}-plate)"/>
 ${holo}${glints}
 <rect width="${W}" height="${H}" fill="url(#${id}-sheen)"/>
</g>
<path d="${INNER}" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2.4"/>
<path d="${chamf(13, 13, W - 26, H - 26, 10)}" fill="none" stroke="${T.acc}" stroke-opacity=".55" stroke-width=".9"/>
${[[10, 10, 1, 1], [240, 10, -1, 1], [10, 340, 1, -1], [240, 340, -1, -1]].map(([x, y, sx, sy]) => `<path d="M${x + sx * 4},${y + sy * 22} V${y + sy * 8} L${x + sx * 8},${y + sy * 4} H${x + sx * 22}" stroke="${T.acc}" stroke-width="2.2" fill="none"/>`).join("")}
<g font-family="${FONT}">
 <path d="M18,10 H70 V88 L44,100 L18,88Z" fill="rgba(5,7,10,.62)" stroke="url(#${id}-fr)" stroke-width="2.4"/>
 <path d="M22,14 H66 V20 H22Z" fill="${T.acc}" opacity=".85"/>
 <text x="44" y="58" font-size="${c.ovr >= 100 ? 30 : 38}" font-weight="700" fill="${T.ink}" text-anchor="middle" stroke="rgba(0,0,0,.6)" stroke-width="1" paint-order="stroke">${c.ovr}</text>
 <line x1="28" y1="66" x2="60" y2="66" stroke="${T.acc}" stroke-width="1" opacity=".7"/>
 <text x="44" y="82" font-size="13" font-weight="700" fill="${T.ink}" text-anchor="middle" letter-spacing="1.4">${xe(pos)}</text>
 <g transform="translate(44 118)"><path d="M0,-15 L13,-7.5 V7.5 L0,15 L-13,7.5 V-7.5Z" fill="${tc}" stroke="${c.c2}" stroke-width="2"/><path d="M0,-15 L13,-7.5 V0 L-13,0 V-7.5Z" fill="#fff" opacity=".12"/><text y="4" font-size="${(c.teamId || "").length > 3 ? 8 : 9.5}" font-weight="700" fill="${tt}" text-anchor="middle">${xe(c.teamId || "")}</text></g>
 <g transform="translate(210 40)" style="color:${T.ink}"><circle r="21" fill="rgba(5,7,10,.72)" stroke="url(#${id}-fr)" stroke-width="3.4"/><circle r="16.5" fill="none" stroke="${T.acc}" stroke-width=".8" opacity=".7"/><g transform="scale(.95)">${icon}</g></g>
 <g transform="translate(210 74)"><rect x="-20" y="-8" width="40" height="16" rx="3" fill="rgba(5,7,10,.72)" stroke="${T.acc}" stroke-width=".9"/><text y="4.5" font-size="11" font-weight="700" fill="${T.ink}" text-anchor="middle">'${String(c.season).slice(2)}</text></g>
 ${ribbon ? `<g transform="translate(125 238)"><path d="M${-ribW / 2},-10 H${ribW / 2} L${ribW / 2 + 7},0 L${ribW / 2},10 H${-ribW / 2} L${-ribW / 2 - 7},0Z" fill="url(#${id}-fr)" stroke="#000" stroke-opacity=".5"/><text y="4" font-size="11" font-weight="700" fill="${T.deep}" text-anchor="middle" letter-spacing="1.2"${ribFit}>${xe(ribbon)}</text></g>` : ""}
 <text x="125" y="268" font-size="12" fill="#d4dbe4" text-anchor="middle" letter-spacing="3.5">${xe(first)}</text>
 <text x="125" y="296" font-size="30" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing=".6" stroke="rgba(0,0,0,.5)" stroke-width="1" paint-order="stroke"${lastFit}>${xe(last)}</text>
 <path d="M24,304 H226 L220,318 H30Z" fill="url(#${id}-fr)" opacity=".95"/>
 <path d="M24,304 H226" stroke="#fff" stroke-opacity=".45" stroke-width=".8"/>
 <text x="125" y="314.5" font-size="10" font-weight="700" fill="${T.deep}" text-anchor="middle" letter-spacing="1.4"${subFit}>${xe(subTxt)}</text>
 <text x="30" y="333" font-size="8.5" fill="#9aa4b2" letter-spacing="1.2">${xe(c.tier.name.toUpperCase())}</text>
 <text x="220" y="333" font-size="8.5" fill="#9aa4b2" letter-spacing="1.2" text-anchor="end">${xe(serial)}</text>
</g>
${gemSVG(T, c.tier.key, 125, 336)}
</svg>`;
}

// ---------- back of the card ----------
// r: ratings on the card. c.arch (archetype), c.line (season stat line), c.serial are optional.
function back(c, r) {
  install();
  const id = "cb" + (++UID), T = TP[c.tier.key] || TP.gold, R = rngOf("b" + c.pid + c.season), CC = BB.CARDS;
  const gs = CC.groupScores(r), bd = CC.badges(r).slice(0, 6), C = CC.CBY[c.col] || CC.CBY.base;
  const BC = { hof: "#c58bff", gold: "#f6cf55", silver: "#dfe6ee", bronze: "#e0a46a" };
  // radar of the six rating groups
  const n = CC.GROUPS.length, cx = 125, cy = 134, RR = 42;
  const pt = (i, v) => { const a = -Math.PI / 2 + i / n * Math.PI * 2, rr = RR * Math.max(0, v - 25) / 74; return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]; };
  let radar = "";
  for (const lv of [50, 75, 99]) radar += `<polygon points="${CC.GROUPS.map((q, i) => P2(pt(i, lv))).join(" ")}" fill="none" stroke="#ffffff" stroke-opacity=".14"/>`;
  radar += `<polygon points="${CC.GROUPS.map((q, i) => P2(pt(i, gs[q.key]))).join(" ")}" fill="${T.acc}" fill-opacity=".32" stroke="${T.acc}" stroke-width="1.8"/>`;
  CC.GROUPS.forEach((q, i) => { const [x, y] = pt(i, 99), [lx, ly] = pt(i, 128); radar += `<line x1="${cx}" y1="${cy}" x2="${f1(x)}" y2="${f1(y)}" stroke="#fff" stroke-opacity=".1"/><text x="${f1(lx)}" y="${f1(ly - 1)}" font-size="8.5" fill="#aab3bf" text-anchor="middle" letter-spacing=".6">${q.name.toUpperCase()}</text><text x="${f1(lx)}" y="${f1(ly + 10)}" font-size="11" font-weight="700" fill="${CART.valColor(gs[q.key])}" text-anchor="middle">${gs[q.key]}</text>`; });
  const line = c.line ? `<g transform="translate(0 236)">${c.line.map(([l, v], i, a) => { const x = 30 + i * (190 / (a.length - 1)); return `<text x="${f1(x)}" y="0" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${v}</text><text x="${f1(x)}" y="11" font-size="7.5" fill="#8b95a5" text-anchor="middle" letter-spacing="1">${l}</text>`; }).join("")}</g>` : "";
  return `<svg class="cardsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>${frameDefs(id, T, R)}
<linearGradient id="${id}-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c.c1, "#05070a", .62)}"/><stop offset="1" stop-color="#05070a"/></linearGradient></defs>
<path d="${OUTER}" fill="url(#${id}-fr)"/>${material(id, T, R)}
<path d="${INNER}" fill="url(#${id}-in)"/>
<g clip-path="url(#${id}-clip)"><g opacity=".06" style="color:#fff" transform="translate(190 300) scale(4)">${ICON[c.col] || ICON.base}</g>${halftone(id + "-ht", "#ffffff", .04, 5)}</g>
<path d="${INNER}" fill="none" stroke="#000" stroke-opacity=".7" stroke-width="2.4"/>
<path d="${chamf(13, 13, W - 26, H - 26, 10)}" fill="none" stroke="${T.acc}" stroke-opacity=".5" stroke-width=".9"/>
<g font-family="${FONT}">
 <path d="M18,10 H64 V64 L41,74 L18,64Z" fill="rgba(5,7,10,.62)" stroke="url(#${id}-fr)" stroke-width="2"/>
 <text x="41" y="46" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">${c.ovr}</text>
 <text x="41" y="60" font-size="9" fill="${T.acc}" text-anchor="middle" letter-spacing="1">${xe(CC.POS[c.role] || "")}</text>
 <text x="74" y="28" font-size="9.5" fill="${T.acc}" letter-spacing="1.4"${(c.tier.name + C.name).length > 19 ? ` textLength="152" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(c.tier.name.toUpperCase())} · ${xe(C.name.toUpperCase())}</text>
 <text x="74" y="46" font-size="17" font-weight="700" fill="#fff"${c.name.length > 17 ? ` textLength="152" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(c.name.toUpperCase())}</text>
 <text x="74" y="60" font-size="9.5" fill="#cfd6e0" letter-spacing=".8"${(c.arch || "").length > 28 ? ` textLength="152" lengthAdjust="spacingAndGlyphs"` : ""}>${xe((c.arch || (BB.ROLES[c.role] ? BB.ROLES[c.role].name : "")).toUpperCase())}</text>
 ${radar}
 ${line ? `<line x1="26" y1="212" x2="224" y2="212" stroke="${T.acc}" stroke-opacity=".35"/><text x="125" y="222" font-size="7.5" fill="#8b95a5" text-anchor="middle" letter-spacing="1.6">${c.season} REGULAR SEASON · PER GAME</text>${line}` : ""}
 <text x="26" y="${line ? 266 : 232}" font-size="9" fill="${T.acc}" letter-spacing="1.6">BADGES</text>
 ${bd.length ? bd.map((b, i) => `<g transform="translate(${26 + (i % 2) * 100} ${(line ? 280 : 248) + Math.floor(i / 2) * 16})"><path d="M0,-5.5 L4.8,-2.8 V2.8 L0,5.5 L-4.8,2.8 V-2.8Z" transform="translate(4.5 -3.5)" fill="${BC[b.tier]}"/><text x="13" y="0" font-size="10" fill="#e9edf3">${xe(b.name)}</text></g>`).join("") : `<text x="26" y="${line ? 282 : 250}" font-size="10" fill="#8b95a5">None yet</text>`}
 <text x="30" y="333" font-size="8" fill="#8b95a5" letter-spacing="1.4">${c.serial ? `NO. ${xe(c.serial)}` : `UBL ${c.season}`}</text>
 <text x="220" y="333" font-size="8" fill="#8b95a5" letter-spacing="1.4" text-anchor="end">TAP TO FLIP</text>
</g>
${gemSVG(T, c.tier.key, 125, 336)}
</svg>`;
}
function valColor(v) { return v >= 90 ? "#c58bff" : v >= 80 ? "#35eaa3" : v >= 70 ? "#f6cf55" : v >= 60 ? "#ff9e5e" : "#ff5a6a"; }
return { front, back, valColor, TP, POSES, figure, mix, lum, rngOf, ABBR, ICON, W, H };
})();
