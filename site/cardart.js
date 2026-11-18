// ===================== CARD ART: frames, backgrounds, player figures (pure SVG strings) =====================
// Every card is one SVG (viewBox 250x350), so it is crisp at any size. Art is generated from the
// card itself (collection, tier, team colors, season, the player's build), seeded by the card id,
// so the same card always looks the same.
"use strict";
const CART = (function () {
const W = 250, H = 350;
let UID = 0;
const FONT = "Oswald, 'Arial Narrow', Impact, sans-serif";
const rad = a => a * Math.PI / 180;
const dir = a => [Math.sin(rad(a)), Math.cos(rad(a))]; // 0 = down, 90 = right, 180 = up, -90 = left
const f1 = n => Math.round(n * 10) / 10;
const xe = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function rngOf(seed) { let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0; s = s || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function hex2rgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
function lum(h) { const [r, g, b] = hex2rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

// ---------- rarity frames ----------
// frame: metallic gradient stops; acc: accent used for glow, text highlights and the gem
const TP = {
  rubber:   { frame: ["#1b1d21", "#4a4f58", "#23262b", "#5b616b", "#1b1d21"], acc: "#a7b0bb", ink: "#e9edf3" },
  bronze:   { frame: ["#4a2c14", "#c98a4b", "#6e4220", "#eab07a", "#5a3519"], acc: "#e7a467", ink: "#fff3e6" },
  silver:   { frame: ["#5f666f", "#eef2f6", "#868e98", "#ffffff", "#6c737c"], acc: "#e3e9f0", ink: "#ffffff" },
  gold:     { frame: ["#6b4c0c", "#f7d774", "#9c7314", "#fff3c2", "#7d5a10"], acc: "#f6cf55", ink: "#fffaf0" },
  emerald:  { frame: ["#063a25", "#2ee59d", "#0b5a39", "#b5ffe0", "#08462d"], acc: "#35eaa3", ink: "#eafff6" },
  sapphire: { frame: ["#081f55", "#4d9bff", "#0d3384", "#c4dcff", "#0a2766"], acc: "#5aa5ff", ink: "#eef5ff" },
  ruby:     { frame: ["#4a0710", "#ff3f60", "#7d0c1f", "#ffc0cc", "#5c0914"], acc: "#ff5571", ink: "#fff0f3" },
  amethyst: { frame: ["#2a0e4f", "#b779ff", "#431a7a", "#ead6ff", "#33125f"], acc: "#c08cff", ink: "#f8f0ff" },
  diamond:  { frame: ["#3f8db0", "#f4fcff", "#8fd2ee", "#ffffff", "#5aa9cc"], acc: "#c9f4ff", ink: "#ffffff", holo: true },
  opal:     { frame: ["#ff8fd8", "#8fd3ff", "#b6ffd0", "#ffe58f", "#d79bff"], acc: "#ffd3f2", ink: "#ffffff", holo: true },
  vulcan:   { frame: ["#0d0503", "#ff5a1f", "#2a0904", "#ffb347", "#120604"], acc: "#ff6a1f", ink: "#fff1e6", holo: true, molten: true }
};

// ---------- player figure: pictogram-style skeleton posed by forward kinematics ----------
// Angles are absolute, in degrees: 0 points down, 90 right, 180 up, -90 left.
// lean tilts the spine (positive = toward the right). air lifts the figure off the floor.
const POSES = {
  portrait:  { lean: 0,   arms: [-4, 101, 4, -101],   legs: [-7, -3, 7, 3],     ball: null, air: 0, armsFront: true, portrait: true },
  stand:     { lean: 0,   arms: [-10, -4, 16, 62],   legs: [-7, -3, 7, 3],     ball: "R", air: 0 },
  mugshot:   { lean: 0,   arms: [-6, 78, 6, -78],    legs: [-6, -2, 6, 2],     ball: null, air: 0, placard: true },
  dunk:      { lean: 18,  arms: [-70, -25, 158, 172], legs: [28, -35, -12, -52], ball: "R", air: 70 },
  block:     { lean: -12, arms: [168, 176, 115, 150], legs: [22, -12, -26, -45], ball: "swat", air: 62 },
  shoot:     { lean: -3,  arms: [148, 205, 164, 186], legs: [-4, 4, 5, -4],    ball: "release", air: 22 },
  tackle:    { lean: 68,  arms: [72, 120, 100, 135],  legs: [-38, -12, 45, -25], ball: null, air: 0, low: 34 },
  stiffarm:  { lean: 16,  arms: [-8, 62, 96, 92],     legs: [-34, -70, 52, -2], ball: "L", air: 8 },
  pass:      { lean: 10,  arms: [-42, -18, 96, 90],   legs: [-16, -6, 22, 6],   ball: "pass", air: 0 },
  rebound:   { lean: 0,   arms: [-160, 172, 160, -172], legs: [-26, 16, 26, -16], ball: "top", air: 34 },
  steal:     { lean: 30,  arms: [-50, -20, 72, 58],   legs: [-42, 2, 46, -6],   ball: "poke", air: 0 },
  dribble:   { lean: 14,  arms: [-62, -30, 30, 8],    legs: [-30, -6, 26, 2],   ball: "floor", air: 0, low: 14 },
  trophy:    { lean: 0,   arms: [-162, 178, 162, -178], legs: [-8, -3, 8, 3],  ball: null, air: 0, trophy: true },
  celebrate: { lean: 0,   arms: [-150, -160, 150, 160], legs: [-12, -4, 12, 4], ball: null, air: 6 },
  guard:     { lean: 14,  arms: [-82, -108, 82, 108], legs: [-40, -4, 40, 4],   ball: null, air: 0, low: 22 }
};
function figure(poseKey, o) {
  // o: { ht, wt, c1, c2, num, glow, id, cx, floor, scale }
  const p = POSES[poseKey] || POSES.stand;
  const s = o.scale * (0.92 + (o.ht - 72) / 14 * 0.16), t = 0.82 + Math.max(-0.1, Math.min(0.5, (o.wt - 180) / 100 * 0.55));
  const L = { torso: 60 * s, neck: 6 * s, head: 12.5 * s, sh: 19 * s * (0.85 + t * 0.2), hip: 11.5 * s * (0.9 + t * 0.12), ua: 29 * s, fa: 27 * s, th: 43 * s, sn: 43 * s };
  const lean = p.lean, u = [Math.sin(rad(lean)), -Math.cos(rad(lean))], q = [Math.cos(rad(lean)), Math.sin(rad(lean))];
  // pelvis height above the floor: leg reach along the stance + lift
  const legDrop = Math.max(Math.cos(rad(p.legs[0])) * L.th + Math.cos(rad(p.legs[1])) * L.sn, Math.cos(rad(p.legs[2])) * L.th + Math.cos(rad(p.legs[3])) * L.sn);
  const P = [o.cx, o.floor - legDrop - (p.air || 0) * s - 4];
  const add = (a, v, k) => [a[0] + v[0] * k, a[1] + v[1] * k];
  const N = add(P, u, L.torso), Sc = add(N, u, -5 * s);
  const SL = add(Sc, q, -L.sh), SR = add(Sc, q, L.sh), HL = add(P, q, -L.hip), HR = add(P, q, L.hip);
  const Hc = add(N, u, L.neck + L.head);
  const EL = add(SL, dir(p.arms[0]), L.ua), AL = add(EL, dir(p.arms[1]), L.fa);
  const ER = add(SR, dir(p.arms[2]), L.ua), AR = add(ER, dir(p.arms[3]), L.fa);
  const KL = add(HL, dir(p.legs[0]), L.th), FL = add(KL, dir(p.legs[1]), L.sn);
  const KR = add(HR, dir(p.legs[2]), L.th), FR = add(KR, dir(p.legs[3]), L.sn);
  const ink = "#0c0f14", back = "#1a1f27";
  const seg = (a, b, w, c) => `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${c}" stroke-width="${f1(w)}" stroke-linecap="round"/>`;
  const shoe = (K, F, sn, c) => { const face = (p.lean >= 0 ? 1 : -1) || 1; const td = dir(sn + 90 * face); return seg(F, add(F, td, 10 * s), 9.5 * s * t, c); };
  const arm = (S, E, A, c) => seg(S, E, 13 * s * t, c) + seg(E, A, 10.5 * s * t, c);
  const leg = (Hp, K, F, sn, c, shorts) => seg(Hp, K, 17 * s * t, c) + seg(K, F, 13 * s * t, c) + shoe(K, F, sn, o.shoe || "#f4f4f4") + seg(Hp, add(Hp, [K[0] - Hp[0], K[1] - Hp[1]], 0.5), 21 * s * t, shorts);
  const shorts = mix(o.c1, "#000000", 0.18);
  // torso: a slightly tapered jersey
  const tq = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const jersey = `M${f1(SL[0])},${f1(SL[1])} L${f1(SR[0])},${f1(SR[1])} Q${f1(tq(SR, HR, 0.5)[0] + q[0] * 3 * s)},${f1(tq(SR, HR, 0.5)[1] + q[1] * 3 * s)} ${f1(HR[0] + q[0] * 2 * s)},${f1(HR[1] + q[1] * 2 * s)} L${f1(HL[0] - q[0] * 2 * s)},${f1(HL[1] - q[1] * 2 * s)} Q${f1(tq(SL, HL, 0.5)[0] - q[0] * 3 * s)},${f1(tq(SL, HL, 0.5)[1] - q[1] * 3 * s)} ${f1(SL[0])},${f1(SL[1])}Z`;
  const mid = tq(Sc, P, 0.5);
  const numCol = lum(o.c1) > 0.6 ? mix(o.c2, "#000", 0.2) : (lum(o.c2) < 0.25 ? "#ffffff" : o.c2);
  let ball = "";
  const B = (x, y, r) => ballSVG(x, y, (r || 8.6) * s);
  if (p.ball === "R") ball = B(AR[0] + dir(p.arms[3])[0] * 6 * s, AR[1] + dir(p.arms[3])[1] * 6 * s);
  if (p.ball === "L") ball = B(AL[0] + 2 * s, AL[1] - 3 * s);
  if (p.ball === "release") ball = B(AR[0] + 6 * s, AR[1] - 24 * s);
  if (p.ball === "top") ball = B((AL[0] + AR[0]) / 2, (AL[1] + AR[1]) / 2 - 7 * s);
  if (p.ball === "floor") ball = B(AR[0] + 3 * s, o.floor - 9 * s);
  if (p.ball === "pass") ball = `<g opacity=".55">${[1, 2, 3].map(i => `<line x1="${f1(AR[0] + 14 * s)}" y1="${f1(AR[1] - 4 + i * 4)}" x2="${f1(AR[0] + (34 + i * 6) * s)}" y2="${f1(AR[1] - 4 + i * 4)}" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`).join("")}</g>` + B(AR[0] + 52 * s, AR[1]);
  if (p.ball === "swat") ball = `<g opacity=".7">${[0, 1, 2].map(i => `<line x1="${f1(AL[0] + 8 + i * 5)}" y1="${f1(AL[1] - 2 + i * 6)}" x2="${f1(AL[0] + 30 + i * 9)}" y2="${f1(AL[1] + 14 + i * 7)}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`).join("")}</g>` + B(AL[0] - 14 * s, AL[1] - 10 * s);
  if (p.ball === "poke") ball = B(AR[0] + 12 * s, AR[1] + 6 * s) + `<g stroke="#fff" stroke-width="2" stroke-linecap="round">${[[-14, -6], [-6, -16], [6, -15]].map(([dx, dy]) => `<line x1="${f1(AR[0] + 12 * s + dx * .55)}" y1="${f1(AR[1] + 6 * s + dy * .55)}" x2="${f1(AR[0] + 12 * s + dx)}" y2="${f1(AR[1] + 6 * s + dy)}"/>`).join("")}</g>`;
  let prop = "";
  if (p.trophy) { const tx = (AL[0] + AR[0]) / 2, ty = Math.min(AL[1], AR[1]) - 6 * s; prop = trophySVG(tx, ty, s); }
  if (p.placard) { const px = mid[0], py = tq(Sc, P, 0.62)[1]; prop = `<rect x="${f1(px - 30 * s)}" y="${f1(py - 13 * s)}" width="${f1(60 * s)}" height="${f1(27 * s)}" rx="2" fill="#16181c" stroke="#d7dbe0" stroke-width="1.5"/><text x="${f1(px)}" y="${f1(py - 1 * s)}" font-family="${FONT}" font-size="${f1(9 * s)}" fill="#e9edf3" text-anchor="middle" letter-spacing="1">UBL POLICE</text><text x="${f1(px)}" y="${f1(py + 9 * s)}" font-family="${FONT}" font-size="${f1(8.5 * s)}" fill="#e9edf3" text-anchor="middle">${xe(o.placard || "")}</text>`; }
  const head = `<circle cx="${f1(Hc[0])}" cy="${f1(Hc[1])}" r="${f1(L.head)}" fill="${ink}"/>` + (o.band ? `<path d="M${f1(Hc[0] - L.head * 0.98)},${f1(Hc[1] - L.head * 0.25)} A${f1(L.head)} ${f1(L.head)} 0 0 1 ${f1(Hc[0] + L.head * 0.98)},${f1(Hc[1] - L.head * 0.25)}" stroke="${o.c2}" stroke-width="${f1(3.2 * s)}" fill="none"/>` : "");
  const neck = seg(add(N, u, -2 * s), add(N, u, L.neck + 2 * s), 11 * s * t, ink);
  const num = `<text x="${f1(mid[0])}" y="${f1(mid[1] + 6 * s)}" transform="rotate(${f1(lean)} ${f1(mid[0])} ${f1(mid[1])})" font-family="${FONT}" font-weight="700" font-size="${f1(19 * s)}" text-anchor="middle" fill="${numCol}" stroke="${mix(o.c1, "#000", 0.35)}" stroke-width="0.6">${xe(o.num)}</text>`;
  // back limbs first (darker), then torso, then front limbs
  const backArm = p.lean >= 0 ? "L" : "R";
  if (p.armsFront) {
    const body2 = leg(HL, KL, FL, p.legs[1], ink, shorts) + leg(HR, KR, FR, p.legs[3], ink, shorts) + neck
      + `<path d="${jersey}" fill="${o.c1}" stroke="${o.c2}" stroke-width="${f1(2.2 * s)}" stroke-linejoin="round"/>` + (() => { const c = tq(Sc, P, 0.2); return `<text x="${f1(c[0])}" y="${f1(c[1] + 5 * s)}" font-family="${FONT}" font-weight="700" font-size="${f1(13.5 * s)}" text-anchor="middle" fill="${numCol}" stroke="${mix(o.c1, "#000", 0.35)}" stroke-width="0.6">${xe(o.num)}</text>`; })()
      + arm(SR, ER, AR, back) + arm(SL, EL, AL, ink) + head;
    const top = Hc[1] - L.head, dy = (o.headTop || 70) - top;
    return { svg: `<g transform="translate(0 ${f1(dy)})"><g filter="url(#${o.id}-glow)">${body2}</g></g>`, head: Hc, pelvis: P, hands: [AL, AR], scale: s };
  }
  const body = (backArm === "L" ? arm(SL, EL, AL, back) : arm(SR, ER, AR, back))
    + leg(HL, KL, FL, p.legs[1], back, mix(shorts, "#000", 0.25)) + leg(HR, KR, FR, p.legs[3], ink, shorts)
    + neck + `<path d="${jersey}" fill="${o.c1}" stroke="${o.c2}" stroke-width="${f1(2.2 * s)}" stroke-linejoin="round"/>` + num
    + (backArm === "L" ? arm(SR, ER, AR, ink) : arm(SL, EL, AL, ink)) + head;
  const shadow = p.air ? `<ellipse cx="${f1(P[0])}" cy="${f1(o.floor)}" rx="${f1(26 * s)}" ry="${f1(4 * s)}" fill="#000" opacity=".28"/>` : `<ellipse cx="${f1(P[0])}" cy="${f1(o.floor)}" rx="${f1(38 * s)}" ry="${f1(6 * s)}" fill="#000" opacity=".4"/>`;
  let svg = `<g filter="url(#${o.id}-glow)">${body}</g>` + ball + prop;
  const minY = Math.min(Hc[1] - L.head, AL[1], AR[1]) - (p.ball === "release" ? 34 * s : p.ball === "top" ? 17 * s : p.trophy ? 44 * s : 6 * s);
  const lim = o.top || 30;
  if (!o.anchor && minY < lim) {
    const lift = (p.air || 0) * s, dy = Math.min(lift, lim - minY);
    let k = 1; if (minY + dy < lim) k = (o.floor - lim) / (o.floor - minY - dy);
    svg = `<g transform="translate(${f1(P[0])} ${f1(o.floor)}) scale(${f1(k * 1000) / 1000}) translate(${f1(-P[0])} ${f1(-o.floor + dy)})">${svg}</g>`;
  }
  if (o.anchor) { const hnd = o.anchor.hand === "L" ? AL : AR; svg = `<g transform="translate(${f1(o.anchor.x - hnd[0])} ${f1(o.anchor.y - hnd[1])})">${svg}</g>`; }
  return { svg: shadow + svg, head: Hc, pelvis: P, hands: [AL, AR], scale: s };
}
function ballSVG(x, y, r) {
  return `<g><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#ballg)" stroke="#3a1b05" stroke-width="${f1(r * 0.12)}"/><path d="M${f1(x - r)},${f1(y)} H${f1(x + r)} M${f1(x)},${f1(y - r)} V${f1(y + r)} M${f1(x - r * 0.7)},${f1(y - r * 0.7)} Q${f1(x - r * 0.15)},${f1(y)} ${f1(x - r * 0.7)},${f1(y + r * 0.7)} M${f1(x + r * 0.7)},${f1(y - r * 0.7)} Q${f1(x + r * 0.15)},${f1(y)} ${f1(x + r * 0.7)},${f1(y + r * 0.7)}" stroke="#3a1b05" stroke-width="${f1(r * 0.1)}" fill="none"/></g>`;
}
function trophySVG(x, y, s) {
  const k = s * 1.1;
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(k)})"><path d="M-14,-34 H14 V-22 Q14,-6 0,-2 Q-14,-6 -14,-22Z" fill="url(#goldg)" stroke="#5a4108" stroke-width="1"/><path d="M-14,-30 Q-24,-30 -22,-20 Q-20,-14 -12,-12 M14,-30 Q24,-30 22,-20 Q20,-14 12,-12" stroke="url(#goldg)" stroke-width="3" fill="none"/><rect x="-3" y="-3" width="6" height="8" fill="url(#goldg)"/><rect x="-9" y="4" width="18" height="5" rx="1" fill="url(#goldg)" stroke="#5a4108" stroke-width=".8"/></g>`;
}

// ---------- backgrounds ----------
const pts = a => a.map(p => f1(p[0]) + "," + f1(p[1])).join(" ");
function rays(cx, cy, n, col, op, r0, spread) {
  let s = ""; const R = 520;
  for (let i = 0; i < n; i++) { const a = (i / n) * 360, w = (spread || 360 / n / 2); s += `<polygon points="${pts([[cx, cy], [cx + Math.cos(rad(a - w / 2)) * R, cy + Math.sin(rad(a - w / 2)) * R], [cx + Math.cos(rad(a + w / 2)) * R, cy + Math.sin(rad(a + w / 2)) * R]])}" fill="${col}" opacity="${op}"/>`; }
  return s;
}
function stripes(angle, w, col, op) { let s = `<g transform="rotate(${angle} ${W / 2} ${H / 2})" opacity="${op}">`; for (let x = -300; x < 560; x += w * 2) s += `<rect x="${x}" y="-200" width="${w}" height="760" fill="${col}"/>`; return s + "</g>"; }
function halftone(id, col, op, step) { return `<pattern id="${id}" width="${step}" height="${step}" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="${step / 2}" cy="${step / 2}" r="${step * 0.22}" fill="${col}"/></pattern><rect width="${W}" height="${H}" fill="url(#${id})" opacity="${op}"/>`; }
function confetti(R, n, cols) { let s = ""; for (let i = 0; i < n; i++) { const x = R() * W, y = R() * H * 0.8, c = cols[Math.floor(R() * cols.length)]; s += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(3 + R() * 4)}" height="${f1(6 + R() * 6)}" fill="${c}" transform="rotate(${Math.floor(R() * 180)} ${f1(x)} ${f1(y)})" opacity=".9"/>`; } return s; }
function sparkles(R, n, col) { let s = ""; for (let i = 0; i < n; i++) { const x = R() * W, y = R() * H * 0.75, r = 2 + R() * 4; s += `<path d="M${f1(x)},${f1(y - r)} L${f1(x + r * .25)},${f1(y - r * .25)} L${f1(x + r)},${f1(y)} L${f1(x + r * .25)},${f1(y + r * .25)} L${f1(x)},${f1(y + r)} L${f1(x - r * .25)},${f1(y + r * .25)} L${f1(x - r)},${f1(y)} L${f1(x - r * .25)},${f1(y - r * .25)}Z" fill="${col}" opacity="${f1(.5 + R() * .5)}"/>`; } return s; }
function bigText(txt, x, y, size, col, op, rot) { return `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="700" font-size="${size}" fill="${col}" opacity="${op}" text-anchor="middle" ${rot ? `transform="rotate(${rot} ${x} ${y})"` : ""}>${xe(txt)}</text>`; }
function rimSVG(x, y, k, net) {
  return `<g transform="translate(${x} ${y}) scale(${k})"><rect x="-6" y="-58" width="70" height="46" rx="2" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.75)" stroke-width="2.5"/><rect x="14" y="-38" width="26" height="20" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="2"/><rect x="25" y="-12" width="4" height="8" fill="#ff7a1a"/><ellipse cx="14" cy="-2" rx="22" ry="5" fill="none" stroke="#ff7a1a" stroke-width="3.5"/>${net ? `<path d="M-7,-1 L-1,26 M2,1 L4,27 M12,2 L11,28 M22,2 L18,27 M33,0 L27,26 M-7,-1 L4,27 M2,1 L18,27 M12,2 L27,26 M33,0 L11,28 M22,2 L-1,26 M-3,12 H31 M0,22 H29" stroke="rgba(255,255,255,.7)" stroke-width="1.1" fill="none"/>` : ""}</g>`;
}
function arena(g, top, bot) { return `<rect width="${W}" height="${H}" fill="url(#${g.id}-bg)"/><defs><linearGradient id="${g.id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient></defs>`; }
function floorLine(g, col) { return `<rect x="0" y="${g.floor}" width="${W}" height="${H - g.floor}" fill="${col || "rgba(0,0,0,.35)"}"/><line x1="0" y1="${g.floor}" x2="${W}" y2="${g.floor}" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>`; }

const ART = {
  base(g) {
    const y = g.season, era = y < 1962 ? 0 : y < 1979 ? 1 : y < 2000 ? 2 : 3, c1 = g.c1, c2 = g.c2;
    if (era === 0) return arena(g, mix("#d9c39a", c1, .18), mix("#8a6d45", c2, .2)) + halftone(g.id + "-ht", "#5a4024", .25, 7) + `<rect x="18" y="18" width="214" height="314" fill="none" stroke="#5a4024" stroke-width="1.5" opacity=".5"/>` + bigText(g.season, 125, 205, 110, "#5a4024", .12);
    if (era === 1) return arena(g, mix(c1, "#fff", .1), mix(c1, "#000", .45)) + rays(125, 230, 18, c2, .22) + `<circle cx="125" cy="230" r="70" fill="${c2}" opacity=".18"/>`;
    if (era === 2) { let s = arena(g, mix(c1, "#000", .55), mix(c2, "#000", .5)); s += `<g opacity=".35" stroke="${c1}" stroke-width="1">`; for (let i = 0; i < 12; i++) s += `<line x1="${-200 + i * 50}" y1="${H}" x2="${125}" y2="150"/>`; for (let i = 0; i < 7; i++) s += `<line x1="0" y1="${200 + i * i * 4}" x2="${W}" y2="${200 + i * i * 4}"/>`; s += `</g>`; for (let i = 0; i < 9; i++) { const x = g.R() * W, yy = g.R() * 160 + 20; s += `<polygon points="${pts([[x, yy], [x + 10, yy + 16], [x - 10, yy + 16]])}" fill="${i % 2 ? c2 : "#fff"}" opacity=".3" transform="rotate(${Math.floor(g.R() * 90)} ${f1(x)} ${f1(yy)})"/>`; } return s; }
    return arena(g, mix(c1, "#000", .35), mix(c1, "#000", .8)) + `<path d="M-20,120 L270,40 L270,80 L-20,170Z" fill="${c2}" opacity=".22"/><path d="M-20,190 L270,110 L270,125 L-20,205Z" fill="#fff" opacity=".08"/><circle cx="125" cy="${g.floor + 40}" r="120" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="2"/>`;
  },
  rookie(g) {
    return arena(g, mix(g.c1, "#fff", .25), mix(g.c1, "#000", .3)) + stripes(-30, 14, "#fff", .1) + rays(125, 170, 24, "#fff", .12) + bigText("ROOKIE", 125, 140, 64, "#fff", .14, -8)
      + `<g transform="translate(196 236) rotate(-12)"><circle r="20" fill="#d7263d" stroke="#fff" stroke-width="2.5"/><text y="7" font-family="${FONT}" font-weight="700" font-size="19" fill="#fff" text-anchor="middle">RC</text></g>`;
  },
  founders(g) {
    let s = arena(g, "#e2cfa6", "#7b5c37") + halftone(g.id + "-ht", "#4a3520", .22, 6);
    s += `<g fill="#4a3520" opacity=".45">`; for (let i = 0; i < 6; i++) { const x = 10 + i * 42 + g.R() * 10, h = 40 + g.R() * 50; s += `<rect x="${f1(x)}" y="${f1(g.floor - h - 50)}" width="${f1(10 + g.R() * 6)}" height="${f1(h + 50)}"/>`; for (let k = 0; k < 4; k++) s += `<circle cx="${f1(x + 6 + k * 7)}" cy="${f1(g.floor - h - 58 - k * 12)}" r="${f1(6 + k * 3)}" opacity="${f1(.6 - k * .12)}"/>`; }
    s += `<path d="M0,${g.floor - 50} H40 V${g.floor - 80} L70,${g.floor - 64} V${g.floor - 80} L100,${g.floor - 64} V${g.floor - 80} L130,${g.floor - 64} V${g.floor - 80} L160,${g.floor - 64} V${g.floor - 50} H250 V${g.floor} H0Z"/></g>`;
    return s + bigText("EST. 1954", 140, 150, 34, "#4a3520", .3);
  },
  wba(g) {
    let s = arena(g, "#1d2b64", "#f8a75b") + `<circle cx="125" cy="${g.floor - 30}" r="70" fill="#ffd166" opacity=".55"/>`;
    for (let i = 0; i < 5; i++) s += `<rect x="0" y="${g.floor - 70 + i * 12}" width="${W}" height="5" fill="#1d2b64" opacity=".35"/>`;
    s += `<path d="M0,${g.floor - 30} L30,${g.floor - 70} H80 L95,${g.floor - 40} L140,${g.floor - 40} L150,${g.floor - 90} H200 L215,${g.floor - 30} H250 V${g.floor} H0Z" fill="#5a2a1c" opacity=".9"/>`;
    for (let i = 0; i < 18; i++) s += `<circle cx="${f1(g.R() * W)}" cy="${f1(g.R() * 120 + 10)}" r="${f1(.8 + g.R() * 1.6)}" fill="#fff" opacity=".8"/>`;
    return s + stripes(0, 6, "#d7263d", .0) + bigText("WBA", 150, 150, 64, "#fff", .16);
  },
  posterized(g) {
    let s = arena(g, "#07090f", mix(g.c1, "#000", .6));
    s += `<polygon points="${pts([[150, -10], [70, H], [250, H]])}" fill="#fff" opacity=".06"/><polygon points="${pts([[200, -10], [140, H], [260, H]])}" fill="${g.acc}" opacity=".07"/>`;
    s += rays(176, 86, 16, g.acc, .13, 0, 9) + rimSVG(160, 92, 1.05, true);
    for (let i = 0; i < 9; i++) { const x = 140 + g.R() * 100, y = 40 + g.R() * 90; s += `<polygon points="${pts([[x, y], [x + 6 + g.R() * 10, y + 3 + g.R() * 6], [x + 2, y + 9 + g.R() * 10]])}" fill="#dff6ff" opacity="${f1(.35 + g.R() * .4)}"/>`; }
    return s + bigText("SLAM", 64, 302, 54, g.acc, .16, -10) + floorLine(g);
  },
  swat(g) {
    let s = arena(g, "#04140a", "#0a3b1c");
    for (let i = 0; i < 7; i++) s += `<line x1="${-40 + i * 50}" y1="${H}" x2="${60 + i * 50}" y2="0" stroke="#9ef01a" stroke-width="${2 + (i % 3)}" opacity=".18"/>`;
    s += `<g opacity=".22" stroke="#9ef01a" stroke-width="10" stroke-linecap="round"><line x1="40" y1="60" x2="110" y2="130"/><line x1="110" y1="60" x2="40" y2="130"/></g>`;
    return s + rimSVG(176, 210, 0.75, true) + bigText("REJECTED", 125, 298, 40, "#9ef01a", .17, -6) + floorLine(g);
  },
  wrecking(g) {
    let s = arena(g, "#1b1a17", "#3a2f12") + stripes(45, 16, "#f5c400", .22);
    s += `<polygon points="${pts(Array.from({ length: 24 }, (_, i) => { const r = i % 2 ? 46 : 110 + g.R() * 20; const a = i / 24 * Math.PI * 2; return [150 + Math.cos(a) * r, 150 + Math.sin(a) * r]; }))}" fill="#f5c400" opacity=".28"/>`;
    s += `<g stroke="#fff" stroke-width="1.6" opacity=".35" fill="none">`; for (let i = 0; i < 6; i++) { let x = 150, y = 150, d = `M${x},${y}`; const a = g.R() * Math.PI * 2; for (let k = 0; k < 4; k++) { x += Math.cos(a + (g.R() - .5)) * 22; y += Math.sin(a + (g.R() - .5)) * 22; d += ` L${f1(x)},${f1(y)}`; } s += `<path d="${d}"/>`; } s += `</g>`;
    return s + bigText("HIT", 170, 215, 80, "#fff", .12, -12) + floorLine(g, "rgba(0,0,0,.45)");
  },
  escape(g) {
    let s = arena(g, mix(g.c1, "#000", .65), "#0b0e14");
    for (let i = 0; i < 26; i++) { const y = g.R() * H, l = 40 + g.R() * 120, x = g.R() * W; s += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x - l)}" y2="${f1(y)}" stroke="#fff" stroke-width="${f1(.8 + g.R() * 1.8)}" opacity="${f1(.1 + g.R() * .25)}" stroke-linecap="round"/>`; }
    return s + floorLine(g);
  },
  fouralarm(g) {
    let s = arena(g, "#160303", "#5a0c00") + bigText("4", 150, 250, 300, "#ff6a1f", .14);
    for (let i = 0; i < 4; i++) s += `<circle cx="125" cy="${g.floor + 40}" r="${120 + i * 26}" fill="none" stroke="#ffb347" stroke-width="1.5" stroke-dasharray="${i === 3 ? "0" : "5 6"}" opacity="${.18 + i * .07}"/>`;
    let fl = `M0,${H}`; for (let x = 0; x <= W; x += 18) fl += ` Q${x + 9},${H - 120 - g.R() * 90} ${x + 18},${H - 40 - g.R() * 30}`; fl += ` L${W},${H}Z`;
    s += `<path d="${fl}" fill="url(#${g.id}-fire)" opacity=".9"/><defs><linearGradient id="${g.id}-fire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd166"/><stop offset=".45" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></linearGradient></defs>`;
    return s + bigText("30 FT", 205, 60, 18, "#ffb347", .45);
  },
  splash(g) {
    let s = arena(g, "#04223f", "#0a5a8a") + bigText("3", 150, 250, 300, "#7fd3ff", .12);
    for (let i = 0; i < 5; i++) s += `<ellipse cx="125" cy="${g.floor + 6}" rx="${30 + i * 34}" ry="${6 + i * 7}" fill="none" stroke="#bfe9ff" stroke-width="1.6" opacity="${.45 - i * .07}"/>`;
    for (let i = 0; i < 22; i++) { const x = g.R() * W, y = g.R() * 230 + 20, r = 2 + g.R() * 5; s += `<path d="M${f1(x)},${f1(y - r * 1.8)} Q${f1(x + r)},${f1(y)} ${f1(x)},${f1(y + r)} Q${f1(x - r)},${f1(y)} ${f1(x)},${f1(y - r * 1.8)}Z" fill="#bfe9ff" opacity="${f1(.25 + g.R() * .4)}"/>`; }
    return s + floorLine(g, "rgba(0,40,80,.35)");
  },
  dimes(g) {
    let s = arena(g, "#062a2a", "#0b1d2f"); const nodes = Array.from({ length: 9 }, () => [20 + g.R() * 210, 20 + g.R() * 230]);
    s += `<g stroke="#5eead4" stroke-width="1.4" opacity=".4">`; nodes.forEach((a, i) => nodes.slice(i + 1).forEach(b => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 120) s += `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke-dasharray="4 4"/>`; })); s += `</g>`;
    for (const [x, y] of nodes) s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="9" fill="url(#silverg)" stroke="#2c3e50" stroke-width="1" opacity=".75"/><text x="${f1(x)}" y="${f1(y + 3)}" font-size="7" font-family="${FONT}" text-anchor="middle" fill="#2c3e50" opacity=".9">10¢</text>`;
    return s + floorLine(g);
  },
  boards(g) {
    let s = arena(g, "#0b1220", mix(g.c1, "#000", .6));
    s += `<g stroke="#9fc5ff" opacity=".18">`; for (let x = 0; x <= W; x += 25) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`; for (let y = 0; y <= H; y += 25) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}"/>`; s += `</g>`;
    s += `<rect x="40" y="20" width="170" height="110" rx="4" fill="rgba(200,230,255,.08)" stroke="rgba(255,255,255,.55)" stroke-width="3"/><rect x="95" y="55" width="60" height="45" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/>`;
    return s + `<ellipse cx="125" cy="132" rx="30" ry="6" fill="none" stroke="#ff7a1a" stroke-width="3.5"/>` + floorLine(g);
  },
  pickpockets(g) {
    let s = arena(g, "#0d0716", "#26113f") + `<polygon points="${pts([[40, -10], [-30, H], [170, H]])}" fill="#fff" opacity=".07"/><circle cx="160" cy="${g.floor - 70}" r="95" fill="#d9c7ff" opacity=".07"/>`;
    for (let i = 0; i < 6; i++) { const x = 20 + i * 40, y = g.floor + 14 + (i % 2) * 10; s += `<ellipse cx="${x}" cy="${y}" rx="6" ry="3.2" fill="#b48cff" opacity=".35"/>`; }
    return s + bigText("STOLEN", 150, 150, 44, "#b48cff", .16, -8) + floorLine(g, "rgba(0,0,0,.3)");
  },
  buckets(g) {
    let s = arena(g, "#130f02", "#3a2a00");
    const txt = String(g.value || "").replace(".", "").slice(0, 3) || "00";
    const DIG = { 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001001001001", 8: "111101111101111", 9: "111101111001111" };
    s += `<g fill="#ffcf3d">`; txt.split("").forEach((d, k) => { const m = DIG[d] || DIG[0]; for (let i = 0; i < 15; i++) { const x = 30 + k * 70 + (i % 3) * 18, y = 40 + Math.floor(i / 3) * 18; s += `<circle cx="${x}" cy="${y}" r="6.5" opacity="${m[i] === "1" ? .42 : .07}"/>`; } }); s += `</g>`;
    return s + floorLine(g);
  },
  mvp(g) {
    let s = arena(g, "#1a1205", "#4a3200") + rays(125, 160, 28, "#ffd56b", .12);
    s += `<g fill="#ffd56b" opacity=".3">`; for (let i = 0; i < 9; i++) { const a = rad(200 + i * 16); s += `<ellipse cx="${f1(125 + Math.cos(a) * 92)}" cy="${f1(165 + Math.sin(a) * 92)}" rx="10" ry="4.5" transform="rotate(${f1(200 + i * 16 + 60)} ${f1(125 + Math.cos(a) * 92)} ${f1(165 + Math.sin(a) * 92)})"/><ellipse cx="${f1(125 - Math.cos(a) * 92)}" cy="${f1(165 + Math.sin(a) * 92)}" rx="10" ry="4.5" transform="rotate(${f1(-(200 + i * 16 + 60))} ${f1(125 - Math.cos(a) * 92)} ${f1(165 + Math.sin(a) * 92)})"/>`; } s += `</g>`;
    return s + bigText("MVP", 150, 150, 76, "#ffd56b", .16) + sparkles(g.R, 10, "#fff3c2") + floorLine(g);
  },
  fmvp(g) {
    let s = arena(g, "#0d0d12", mix(g.c1, "#000", .5)) + rays(125, 120, 20, "#ffd56b", .1);
    return s + trophySVG(125, 210, 4.2).replace("<g ", '<g opacity=".18" ') + confetti(g.R, 40, [g.c1, g.c2, "#ffd56b", "#fff"]) + floorLine(g);
  },
  dpoy(g) {
    let s = arena(g, "#0a1016", "#1e2a36");
    s += `<pattern id="${g.id}-fence" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="none" stroke="#9fb3c8" stroke-width="1.3"/></pattern><rect width="${W}" height="${H}" fill="url(#${g.id}-fence)" opacity=".22"/>`;
    s += `<path d="M125,40 L195,62 V130 Q195,190 125,222 Q55,190 55,130 V62Z" fill="${g.acc}" opacity=".16" stroke="${g.acc}" stroke-width="3" stroke-opacity=".35"/>`;
    return s + bigText("LOCKDOWN", 125, 300, 34, "#9fb3c8", .2) + floorLine(g);
  },
  roy(g) {
    let s = arena(g, "#ff9f43", "#5a1e00") + `<circle cx="125" cy="${g.floor - 10}" r="90" fill="#ffd166" opacity=".55"/>` + rays(125, g.floor - 10, 20, "#fff4c2", .2);
    return s + floorLine(g, "rgba(60,20,0,.45)") + bigText("ROY", 150, 150, 70, "#fff", .18);
  },
  champ(g) {
    let s = arena(g, mix(g.c1, "#000", .3), mix(g.c2, "#000", .55)) + rays(125, 140, 22, "#fff", .08);
    s += `<g transform="translate(125 130)" opacity=".25"><ellipse rx="62" ry="40" fill="none" stroke="#ffd56b" stroke-width="16"/><path d="M-24,-46 L0,-70 L24,-46Z" fill="#ffd56b"/><circle cy="-56" r="10" fill="#fff"/></g>`;
    return s + confetti(g.R, 46, [g.c1, g.c2, "#ffd56b", "#fff"]) + floorLine(g);
  },
  ironworkers(g) {
    let s = arena(g, "#2a2622", "#120f0c");
    const beam = (y, a) => `<g transform="rotate(${a} 125 ${y})"><rect x="-40" y="${y - 9}" width="330" height="18" fill="#c4581d" opacity=".55"/><rect x="-40" y="${y - 9}" width="330" height="4" fill="#ff8a3d" opacity=".5"/>${Array.from({ length: 14 }, (_, i) => `<circle cx="${-30 + i * 24}" cy="${y}" r="2.2" fill="#2a2622" opacity=".7"/>`).join("")}</g>`;
    s += beam(60, -8) + beam(170, 6) + `<g opacity=".35" stroke="#c4581d" stroke-width="5">${[0, 1, 2, 3, 4, 5].map(i => `<line x1="${i * 50}" y1="60" x2="${i * 50 + 50}" y2="170"/>`).join("")}</g>`;
    return s + floorLine(g, "rgba(0,0,0,.35)") + bigText("82", 205, 312, 44, "#ff8a3d", .22);
  },
  prime(g) {
    let s = arena(g, "#1b0c3a", "#ff7e5f") + `<circle cx="125" cy="${g.floor - 60}" r="60" fill="#ffd166" opacity=".6"/>`;
    s += `<polygon points="0,${g.floor} 60,${g.floor - 120} 95,${g.floor - 80} 135,${g.floor - 170} 200,${g.floor - 70} 250,${g.floor - 110} 250,${g.floor}" fill="#2d1b4e" opacity=".85"/><polygon points="135,${g.floor - 170} 150,${g.floor - 145} 128,${g.floor - 150} 120,${g.floor - 142}" fill="#fff" opacity=".7"/>`;
    return s + sparkles(g.R, 8, "#fff");
  },
  hof(g) {
    let s = arena(g, "#efe9dc", "#b8ad97");
    s += `<g stroke="#8c8270" fill="none" opacity=".35">`; for (let i = 0; i < 7; i++) { let d = `M${f1(g.R() * W)},0`; for (let k = 0; k < 6; k++) d += ` Q${f1(g.R() * W)},${f1(k * 60 + 30)} ${f1(g.R() * W)},${f1(k * 60 + 60)}`; s += `<path d="${d}" stroke-width="${f1(.6 + g.R() * 1.4)}"/>`; } s += `</g>`;
    for (const x of [26, 224]) s += `<rect x="${x - 12}" y="40" width="24" height="${g.floor - 40}" fill="url(#goldg)" opacity=".55"/>${[0, 1, 2, 3].map(i => `<line x1="${x - 6 + i * 4}" y1="46" x2="${x - 6 + i * 4}" y2="${g.floor - 6}" stroke="#7a5a12" opacity=".35"/>`).join("")}<rect x="${x - 16}" y="32" width="32" height="10" fill="url(#goldg)" opacity=".7"/>`;
    return s + floorLine(g, "rgba(90,70,30,.25)") + bigText("HALL OF FAME", 140, 128, 26, "#7a5a12", .4);
  },
  rapsheet(g) {
    let s = arena(g, "#c9ccd1", "#8e939b");
    for (let i = 0; i <= 10; i++) { const y = g.floor - i * 24; s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#2b2f36" stroke-width="${i % 2 ? .8 : 1.6}" opacity=".5"/>`; if (i % 2 === 0) s += `<text x="8" y="${y - 3}" font-family="${FONT}" font-size="10" fill="#2b2f36" opacity=".7">${5 + i / 4 | 0}'${(i % 4) * 3}"</text><text x="242" y="${y - 3}" font-family="${FONT}" font-size="10" fill="#2b2f36" opacity=".7" text-anchor="end">${5 + i / 4 | 0}'${(i % 4) * 3}"</text>`; }
    return s;
  }
};
const ARTKEY = { base: "base", rookie: "rookie", founders: "founders", wba: "wba" };

// ---------- the card ----------
const ABBR = { base: "", rookie: "RC", founders: "1954", wba: "WBA", posterized: "SLAM", swat: "SWAT", wrecking: "HIT", escape: "ESC", fouralarm: "4PT", splash: "3PT", dimes: "AST", boards: "REB", pickpockets: "STL", buckets: "PTS", mvp: "MVP", fmvp: "FMVP", dpoy: "DPOY", roy: "ROY", champ: "RING", ironworkers: "82", prime: "PRIME", hof: "HOF", rapsheet: "FILE" };
function sharedDefs() {
  return `<linearGradient id="ballg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffab4a"/><stop offset="1" stop-color="#b3530c"/></linearGradient>
<linearGradient id="goldg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5a12"/><stop offset=".45" stop-color="#ffe27a"/><stop offset=".7" stop-color="#c8971f"/><stop offset="1" stop-color="#fff3c2"/></linearGradient>
<linearGradient id="silverg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7d8792"/><stop offset=".5" stop-color="#f4f7fa"/><stop offset="1" stop-color="#9aa4ae"/></linearGradient>`;
}
let defsInstalled = false;
function installDefs() {
  if (defsInstalled || typeof document === "undefined") return; defsInstalled = true;
  const d = document.createElement("div"); d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  d.innerHTML = `<svg width="0" height="0" aria-hidden="true"><defs>${sharedDefs()}</defs></svg>`; document.body.appendChild(d);
}

// c: { col, season, pid, team, ovr, rank, value, num, name, role, ht, wt, c1, c2, teamId, tier }
function front(c) {
  installDefs();
  const id = "cd" + (++UID), T = TP[c.tier.key] || TP.gold, R = rngOf(c.col + ":" + c.season + ":" + c.pid);
  const C = BB.CARDS.CBY[c.col] || BB.CARDS.CBY.base;
  const g = { id, R, c1: c.c1, c2: c.c2, acc: T.acc, season: c.season, value: c.value, floor: 268 };
  const art = (ART[c.col] || ART.base)(g);
  const pose = C.pose === "stand" && c.col !== "ironworkers" ? "portrait" : C.pose || "stand";
  const fig = figure(pose, { headTop: 64, ht: c.ht || 78, wt: c.wt || 210, c1: c.c1, c2: c.c2, num: c.num, id, cx: pose === "tackle" || pose === "steal" ? 118 : 136, floor: pose === "portrait" ? 420 : g.floor, scale: pose === "portrait" ? 1.75 : 1.12, anchor: pose === "dunk" ? { hand: "R", x: 178, y: 80 } : null, band: R() < 0.3, shoe: R() < 0.5 ? "#f4f4f4" : c.c2, placard: c.col === "rapsheet" ? `${c.season}-${String(c.pid).padStart(5, "0")}` : "" });
  const ghosts = c.col === "escape" ? [32, 18].map((dx, i) => `<g opacity="${.16 + i * .1}" transform="translate(${-dx} 0)">${fig.svg.replace(/filter="url\([^)]*\)"/, "")}</g>`).join("") : "";
  const fr = T.frame, last = (c.name.split(" ").slice(1).join(" ") || c.name).toUpperCase(), first = c.name.split(" ")[0].toUpperCase();
  const lastFit = last.length > 10 ? ` textLength="${Math.min(196, last.length * 17)}" lengthAdjust="spacingAndGlyphs"` : "";
  const unit = (C.short || C.unit || "").toUpperCase();
  const ribbon = c.rank === 1 && C.kind === "leader" ? "LEAGUE LEADER" : c.rank > 1 && C.kind === "leader" ? `#${c.rank} IN ${unit}` : "";
  const subTxt = (c.col === "base" ? (BB.ROLES[c.role] ? BB.ROLES[c.role].name : "") : C.name + (C.kind === "leader" && c.value !== null && c.value !== undefined ? " · " + c.value + " " + unit : "")).toUpperCase();
  const subFit = subTxt.length > 30 ? ` textLength="212" lengthAdjust="spacingAndGlyphs"` : "";
  const ribW = Math.max(96, ribbon.length * 7.2 + 22);
  const holo = T.holo ? `<g class="holo" style="mix-blend-mode:${T.molten ? "screen" : "overlay"}" opacity="${T.molten ? .35 : .55}"><rect x="-250" y="0" width="750" height="350" fill="url(#${id}-holo)"/></g>` : "";
  const embers = T.molten ? Array.from({ length: 14 }, (_, i) => `<circle class="ember" style="animation-delay:${f1(R() * 4)}s;animation-duration:${f1(3 + R() * 3)}s" cx="${f1(20 + R() * 210)}" cy="${f1(200 + R() * 140)}" r="${f1(1 + R() * 1.8)}" fill="#ffb347"/>`).join("") : "";
  const tc = c.c1, tt = lum(c.c1) > 0.6 ? "#111" : "#fff";
  return `<svg class="cardsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${xe(c.name)} ${c.season} ${xe(C.name)} card, ${c.ovr} overall, ${c.tier.name}">
<defs>
 <linearGradient id="${id}-fr" x1="0" y1="0" x2="1" y2="1">${fr.map((s, i) => `<stop offset="${f1(i / (fr.length - 1))}" stop-color="${s}"/>`).join("")}</linearGradient>
 <linearGradient id="${id}-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".45" stop-color="#05070a" stop-opacity=".82"/><stop offset="1" stop-color="#05070a" stop-opacity=".96"/></linearGradient>
 <linearGradient id="${id}-holo" x1="0" y1="0" x2="1" y2=".35">${(T.molten ? ["#ff3d00", "#ffb347", "#ff3d00", "#2a0904", "#ff6a1f", "#ffd166", "#ff3d00"] : ["#ff5ec4", "#7ad7ff", "#9dff9a", "#fff27a", "#ff9e5e", "#c58bff", "#ff5ec4"]).map((s, i, a) => `<stop offset="${f1(i / (a.length - 1))}" stop-color="${s}"/>`).join("")}</linearGradient>
 <radialGradient id="${id}-vig" cx="0.22" cy="0.3" r="0.75"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
 <clipPath id="${id}-clip"><rect x="9" y="9" width="232" height="332" rx="10"/></clipPath>
 <filter id="${id}-glow" x="-30%" y="-30%" width="160%" height="160%"><feMorphology in="SourceAlpha" operator="dilate" radius="1.6" result="d"/><feGaussianBlur in="d" stdDeviation="2.2" result="b"/><feFlood flood-color="${T.acc}" flood-opacity=".95"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<rect x="0" y="0" width="${W}" height="${H}" rx="15" fill="url(#${id}-fr)"/>
${c.tier.key === "rubber" ? `<g opacity=".25" clip-path="url(#${id}-clip)">${Array.from({ length: 30 }, (_, i) => `<path d="M${-10 + i * 12},0 l8,8 -8,8" stroke="#000" fill="none" stroke-width="3" transform="translate(0 ${(i % 2) * 6})"/>`).join("")}</g>` : ""}
<g clip-path="url(#${id}-clip)">
 ${art}
 <rect width="130" height="130" fill="url(#${id}-vig)"/>
 ${ghosts}${fig.svg}
 ${embers}
 <rect x="0" y="236" width="${W}" height="114" fill="url(#${id}-plate)"/>
 ${holo}
</g>
<rect x="9" y="9" width="232" height="332" rx="10" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="2"/>
<rect x="5" y="5" width="240" height="340" rx="12" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1"/>
<g font-family="${FONT}">
 <text x="20" y="58" font-size="46" font-weight="700" fill="${T.ink}" stroke="rgba(0,0,0,.55)" stroke-width="1.2" paint-order="stroke">${c.ovr}</text>
 <rect x="20" y="64" width="${c.ovr >= 100 ? 70 : 46}" height="2.5" fill="${T.acc}"/>
 <text x="21" y="82" font-size="14" font-weight="700" fill="${T.ink}" letter-spacing="1.5" stroke="rgba(0,0,0,.6)" stroke-width="1" paint-order="stroke">${xe(BB.CARDS.POS[c.role] || "")}</text>
 <rect x="20" y="88" width="34" height="16" rx="3" fill="${tc}" stroke="${c.c2}" stroke-width="1.5"/><text x="37" y="100" font-size="10.5" font-weight="700" fill="${tt}" text-anchor="middle">${xe(c.teamId || "")}</text>
 <g transform="translate(228 22)"><rect x="-44" y="-11" width="44" height="22" rx="4" fill="rgba(5,7,10,.72)" stroke="${T.acc}" stroke-width="1.2"/><text x="-22" y="5" font-size="12.5" font-weight="700" fill="${T.ink}" text-anchor="middle">'${String(c.season).slice(2)}</text></g>
 ${ABBR[c.col] ? `<g transform="translate(228 48)"><rect x="-44" y="-9" width="44" height="18" rx="4" fill="${T.acc}"/><text x="-22" y="4.5" font-size="10.5" font-weight="700" fill="#0b0d11" text-anchor="middle" letter-spacing=".5">${ABBR[c.col]}</text></g>` : ""}
 ${ribbon ? `<g transform="translate(125 246)"><rect x="${-ribW / 2}" y="-10" width="${ribW}" height="18" rx="9" fill="${T.acc}" opacity=".95"/><text y="3.5" font-size="10.5" font-weight="700" fill="#0b0d11" text-anchor="middle" letter-spacing="1">${xe(ribbon)}</text></g>` : ""}
 <text x="125" y="276" font-size="12.5" fill="#cfd6e0" text-anchor="middle" letter-spacing="3">${xe(first)}</text>
 <text x="125" y="304" font-size="29" font-weight="700" fill="#fff" text-anchor="middle" letter-spacing=".5"${lastFit}>${xe(last)}</text>
 <text x="125" y="322" font-size="11" fill="${T.acc}" text-anchor="middle" letter-spacing="1.2"${subFit}>${xe(subTxt)}</text>
 <g transform="translate(125 334)"><path d="M-5,0 L0,-5 L5,0 L0,5Z" fill="${T.acc}"/><text x="9" y="3.6" font-size="9" fill="#aab3bf" letter-spacing="2">${xe(c.tier.name.toUpperCase())}</text><text x="-9" y="3.6" font-size="9" fill="#aab3bf" letter-spacing="2" text-anchor="end">#${xe(c.num)}</text></g>
</g>
</svg>`;
}

// Back of the card: group scores and top badges.
function back(c, r) {
  const id = "cb" + (++UID), T = TP[c.tier.key] || TP.gold, fr = T.frame, CC = BB.CARDS;
  const gs = CC.groupScores(r), bd = CC.badges(r).slice(0, 6);
  const bar = (label, v, y) => `<text x="26" y="${y}" font-size="12" fill="#cfd6e0" letter-spacing=".8">${label.toUpperCase()}</text><text x="224" y="${y}" font-size="15" font-weight="700" fill="#fff" text-anchor="end">${v}</text><rect x="26" y="${y + 5}" width="198" height="5" rx="2.5" fill="rgba(255,255,255,.12)"/><rect x="26" y="${y + 5}" width="${f1(198 * v / 99)}" height="5" rx="2.5" fill="${CART.valColor(v)}"/>`;
  const BC = { hof: "#c58bff", gold: "#f6cf55", silver: "#dfe6ee", bronze: "#e0a46a" };
  return `<svg class="cardsvg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="${id}-fr" x1="0" y1="0" x2="1" y2="1">${fr.map((s, i) => `<stop offset="${f1(i / (fr.length - 1))}" stop-color="${s}"/>`).join("")}</linearGradient>
<linearGradient id="${id}-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c.c1, "#05070a", .7)}"/><stop offset="1" stop-color="#05070a"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="15" fill="url(#${id}-fr)"/><rect x="9" y="9" width="232" height="332" rx="10" fill="url(#${id}-in)"/>
<g font-family="${FONT}">
 <text x="26" y="44" font-size="34" font-weight="700" fill="#fff">${c.ovr}</text><text x="76" y="30" font-size="11" fill="${T.acc}" letter-spacing="1.5"${(c.tier.name + (CC.CBY[c.col] || CC.CBY.base).name).length > 19 ? ` textLength="148" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(c.tier.name.toUpperCase())} · ${xe((CC.CBY[c.col] || CC.CBY.base).name.toUpperCase())}</text>
 <text x="76" y="46" font-size="16" font-weight="700" fill="#fff" ${c.name.length > 18 ? `textLength="148" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(c.name.toUpperCase())}</text>
 <line x1="26" y1="58" x2="224" y2="58" stroke="${T.acc}" stroke-opacity=".5"/>
 ${c.arch ? `<text x="125" y="74" font-size="11" fill="#cfd6e0" text-anchor="middle" letter-spacing="1"${c.arch.length > 30 ? ` textLength="198" lengthAdjust="spacingAndGlyphs"` : ""}>${xe(c.arch.toUpperCase())}</text>` : ""}
 ${CC.GROUPS.map((gq, i) => bar(gq.name, gs[gq.key], (c.arch ? 94 : 82) + i * 30)).join("")}
 <text x="26" y="268" font-size="11" fill="${T.acc}" letter-spacing="1.5">BADGES</text>
 ${bd.length ? bd.map((b, i) => `<g transform="translate(${26 + (i % 2) * 100} ${282 + Math.floor(i / 2) * 18})"><path d="M0,-4 L4,0 L0,4 L-4,0Z" transform="translate(4 -3.5)" fill="${BC[b.tier]}"/><text x="12" y="0" font-size="10.5" fill="#e9edf3">${xe(b.name)}</text></g>`).join("") : `<text x="26" y="286" font-size="11" fill="#8b95a5">None yet</text>`}
 <text x="125" y="336" font-size="9" fill="#8b95a5" text-anchor="middle" letter-spacing="1.5">TAP TO FLIP</text>
</g></svg>`;
}
function valColor(v) { return v >= 90 ? "#c58bff" : v >= 80 ? "#35eaa3" : v >= 70 ? "#f6cf55" : v >= 60 ? "#ff9e5e" : "#ff5a6a"; }
return { front, back, valColor, TP, POSES, figure, mix, lum, rngOf, ABBR, W, H };
})();
