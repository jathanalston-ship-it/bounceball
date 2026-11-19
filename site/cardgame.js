// ===================== THE CARD GAME: coins, packs, variants, progress, the pack-opening show =====================
// One save in this browser (ubl-game-v1). The rules live in src/cardeco.js (BB.ECO); this file draws
// the store (the Diamond meter, the featured collection, the event pack, Pick-One and Team packs), dailies
// and challenges, the pack opening (the tier tease, arcade callouts, synthesized sound, 3D walkouts for
// Ruby and up, callouts for parallels, autographs, patches and Gem Mint 10s), My collection (collector
// level, collection score, showcase shelf, achievements, base and team sets, the trade desk, save codes),
// album pages, and the copies box in the card viewer.
"use strict";
const ECO = BB.ECO;
const ecoCard = c => ({ key: pcKey(c), tier: c.tier.key, col: c.col, season: c.season, ovr: c.ovr, team: c.teamId });
const fmtN = n => Math.round(n).toLocaleString("en-US");
const coinH = n => `<span class="coinv"><i class="coin"></i>${fmtN(n)}</span>`;
const TIX = k => CC.TIERS.findIndex(t => t.key === k);
const DMIN = CC.TIERS.find(t => t.key === "diamond").min;

// ---------- the save ----------
const CGSAVE = {
  k: "ubl-game-v1", d: null,
  load() {
    if (this.d) return this.d;
    let d = null, fresh = false; try { d = JSON.parse(localStorage.getItem(this.k)); } catch (e) { d = null; }
    if (!d || (d.v !== 1 && d.v !== 2)) { let old = null; try { old = JSON.parse(localStorage.getItem("ubl-cards-v1")); } catch (e) { old = null; } d = ECO.migrate(old, Date.now()); fresh = true; }
    const was = d.v; this.d = ECO.upgrade(d);
    if (fresh) { this.d.welcome = 1; this.save(); } else if (was === 1) { this.d.welcome2 = 1; this.save(); }
    return this.d;
  },
  save() { try { localStorage.setItem(this.k, JSON.stringify(this.d)); } catch (e) { /* storage blocked: keep it for this visit */ } },
  replace(d) { this.d = d; this.save(); }
};
// the card screens ask MY what's owned
const MY = {
  load: () => CGSAVE.load(), save: () => CGSAVE.save(),
  add(c, cp) { const d = CGSAVE.load(), isNew = ECO.addCopy(d, pcKey(c), cp || ECO.rollCopy()); d.cards++; return isNew; },
  best(c) { const d = CGSAVE.load(), k = pcKey(c); return d.owned[k] ? ECO.copiesOf(d, k)[0] : null; }
};

// ---------- what the rules need from the card index ----------
const CG = { all: null, base: null, viewCp: {} };
function cgPrep(all) {
  const base = PC.base || [];
  if (CG.all === all && CG.base === base) { cgWitSync(); return; } CG.all = all; CG.base = base;
  CG.byKey = new Map(all.concat(base).map(c => [pcKey(c), c]));
  CG.sets = ECO.setsOf(all.map(ecoCard)).concat(ECO.baseSetsOf(base.map(ecoCard))); for (const st of CG.sets) st.ks = new Set(st.keys);
  CG.setBy = new Map(CG.sets.map(st => [st.key, st]));
  CG.decades = [...new Set(all.map(c => Math.floor(c.season / 10) * 10))].sort((a, b) => a - b);
  CG.colN = {}; for (const c of all) CG.colN[c.col] = (CG.colN[c.col] || 0) + 1;
  CG.teams = [...new Set(base.map(c => c.teamId))].filter(t => TB[t]);
  CG.featCols = Object.keys(CG.colN).filter(k => CG.colN[k] >= 12);
  cgWitSync();
}
// Classic Nights witness cards aren't in the card index: they're built from the save
function cgWitSync() {
  if (!CG.byKey) CG.byKey = new Map();
  for (const [k, w] of Object.entries(CGSAVE.load().wit || {})) {
    if (CG.byKey.has(k)) continue; const [, y, pid] = k.split(":");
    CG.byKey.set(k, Object.assign(pcCard("witness", +y, +pid, w.team, w.ovr, 0, w.line, w.num), { base: Math.max(1, w.ovr - 4), extra: { date: w.d, o: w.vs } }));
  }
}
const tierOfKey = k => { const c = CG.byKey && CG.byKey.get(k); return c ? c.tier.key : null; };
function cgScore(s) { return ECO.scoreOf(s, tierOfKey); }
function cgAch(s) {
  const own = {}; for (const k of Object.keys(s.owned)) { const col = k.slice(0, k.indexOf(":")); own[col] = (own[col] || 0) + 1; }
  return ECO.checkAch(s, { uniq: Object.keys(s.owned).length, score: cgScore(s), colDone: col => CG.colN[col] > 0 && own[col] >= CG.colN[col] });
}
function cgWeek(s) { return ECO.ensureWeek(s, ECO.weekKey(new Date()), CG.decades, Object.keys(CC.GROUP_NAMES), CC.GROUP_NAMES); }
function cgToday() { const n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1); return [ECO.dayKey(n), ECO.dayKey(y)]; }
function cgHoliday() { const n = new Date(); return ECO.holidayNow(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()), CC.holidaysOf); }
function cgSpares(s) { const out = []; for (const k of Object.keys(s.owned)) if (CG.byKey.has(k)) { const n = ECO.spareOf(s, k); for (let i = 0; i < n; i++) out.push(CG.byKey.get(k)); } return out; }
const teamName = id => { const t = TB[id] || {}; return t.name ? `${t.city ? t.city + " " : ""}${t.name}` : id; };
const leftTxt = ms => { const h = Math.max(0, Math.floor(ms / 36e5)), d = Math.floor(h / 24); return d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${Math.floor(ms / 6e4) % 60}m` : `${Math.max(1, Math.floor(ms / 6e4))}m`; };

// ---------- the packs: the regular list plus Pick-One, Team, the featured collection and the event pack ----------
const cgPickDef = () => ({ key: "pick", name: "Pick-One Pack", sub: "3 cards you don't own, face up · keep 1 · one Sapphire+", c1: "#0ea5e9", c2: "#082f49", icon: "numberone", n: 3, pick: true, guarantee: CC.TIERS.find(t => t.key === "sapphire").min, lockL: 3 });
function cgTeamDef(team) { const t = TB[team] || {}; return { key: "team", name: "Team Pack", sub: `Today: ${teamName(team)} base cards, any season · last Gold+`, c1: t.c1 || "#555", c2: t.c2 || "#222", icon: "franchise", n: 5, team, baseOnly: true, guarantee: CC.TIERS.find(x => x.key === "gold").min, lockL: 6 }; }
function cgFeatDef(col, ends) { const C = CC.CBY[col] || { name: col }; return { key: "featured", name: `${C.name} Spotlight`, sub: "This week's featured collection · Emerald+ 2.5× as likely", c1: "#f59e0b", c2: "#1c1206", icon: col, n: 4, cols: [col], boost: ECO.FEATURED_BOOST, ends, featured: col }; }
function cgEventDef(ev, ends) { return { key: "ev" + ev.key, name: ev.name, sub: ev.sub, c1: ev.c1, c2: ev.c2, icon: ev.icon, n: 4, ev, ends }; }
function cgPackList(all) {
  const now = new Date(), P = pcPackList(all).concat([cgPickDef()]);
  const td = ECO.teamOfDay(ECO.dayKey(now), CG.teams || []); if (td) P.push(cgTeamDef(td));
  const fc = ECO.featuredOf(ECO.weekKey(now), CG.featCols || []); if (fc) P.push(cgFeatDef(fc, ECO.weekEnds(now)));
  const E = ECO.eventNow(now), ed = cgEventDef(E.ev, E.ends); if (cgPool(ed).length >= 12) P.push(ed);
  return P;
}
function cgPackDef(key) {
  const f = (PC.packs || []).find(p => p.key === key); if (f) return f;
  if (ECO.XPACKS[key]) return ECO.XPACKS[key];
  if (key === "pick") return cgPickDef();
  if (/^ev/.test(key) && ECO.EBY[key.slice(2)]) return cgEventDef(ECO.EBY[key.slice(2)], 0);
  return null;
}
// which cards a pack draws from
function cgPool(pk) {
  if (pk.baseOnly) return (CG.base || []).filter(c => c.teamId === pk.team);
  if (pk.ev) return (CG.all || []).filter(c => ECO.inEvent(pk.ev, c));
  if (pk.cols) return (CG.all || []).filter(c => pk.cols.includes(c.col));
  return pcPool(CG.all || [], pk);
}
function cgBasePool(pk) { return (CG.base || []).filter(c => !pk.from || (c.season >= pk.from && c.season <= pk.to)); }

// ---------- variant chips: parallel, autograph, patch, grade ----------
function cgChips(cp, full, specialOnly) {
  if (!cp) return ""; const o = ECO.parseCopy(cp), out = [];
  if (o.par) out.push(`<i class="vc p-${o.par.code}">${o.par.run === 1 ? "1/1" : `${full ? o.par.name + " " : ""}${o.n}/${o.par.run}`}</i>`);
  if (o.auto) out.push(`<i class="vc au">AUTO</i>`); if (o.patch != null) out.push(`<i class="vc pa">PATCH</i>`);
  if (!specialOnly || o.g === 10) out.push(`<i class="vc gr${o.g === 10 ? " gm" : ""}">${full ? ECO.GRADE_NAME[o.g] + " " : ""}${o.g}</i>`);
  return out.join("");
}
// the card the viewer shows: a copy you picked, the copy you pulled, or your best copy
function cgViewCard(c) {
  if (!c || c.upcoming) return c;
  const s = CGSAVE.load(), k = pcKey(c), L = s.owned[k] ? ECO.copiesOf(s, k) : [], pick = CG.viewCp[k];
  const cp = pick && L.includes(pick) ? pick : c.cp || L[0] || null;
  return cp && cp !== c.cp ? Object.assign({}, c, { cp }) : c;
}
// the grading label over a card in the viewer
function cgSlab(c) {
  const o = ECO.parseCopy(c.cp);
  return `<div class="slab${o.g === 10 ? " gm" : ""}${o.par ? " p-" + o.par.code : ""}"><span>UBL GRADING</span><b>${esc(c.name)} · ${c.season}</b><em>${ECO.GRADE_NAME[o.g].toUpperCase()} <strong>${o.g}</strong></em>${o.par || o.auto || o.patch != null ? `<small>${esc(ECO.copyName(c.cp).split(" · ").slice(0, -1).join(" · "))}</small>` : ""}</div>`;
}

// ---------- sound: synthesized, nothing to download ----------
const SFX = {
  a: null,
  ctx() {
    if (!CGSAVE.load().opts.sound) return null;
    if (!this.a) { const A = window.AudioContext || window.webkitAudioContext; if (!A) return null; try { this.a = new A(); } catch (e) { return null; } }
    if (this.a.state === "suspended") this.a.resume(); return this.a;
  },
  tone(f0, f1, dur, type, vol, at) {
    const a = this.ctx(); if (!a) return; const t = a.currentTime + (at || 0), o = a.createOscillator(), g = a.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, f0, f1, at, rise) {
    const a = this.ctx(); if (!a) return; const t = a.currentTime + (at || 0), n = Math.ceil(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1 || f0, t + dur);
    g.gain.setValueAtTime(rise ? 0.0001 : vol, t); g.gain.exponentialRampToValueAtTime(rise ? vol : 0.0001, t + dur * (rise ? 0.95 : 1)); if (rise) g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    s.connect(f).connect(g).connect(a.destination); s.start(t); s.stop(t + dur + 0.1);
  },
  riser(dur, lvl) { this.tone(90, 420 + 900 * lvl, dur, "sawtooth", 0.035 + 0.02 * lvl); this.tone(180, 840 + 1800 * lvl, dur, "triangle", 0.03); this.noise(dur, 0.09 + 0.06 * lvl, 400, 6000, 0, true); },
  boom(lvl) { this.tone(150, 38, 0.7, "sine", 0.55); this.noise(0.4, 0.22 + 0.1 * (lvl || 0), 1400, 200); },
  sparkle(n) { for (let i = 0; i < (n || 5); i++) this.tone(1300 + i * 260, 1600 + i * 300, 0.18, "triangle", 0.05, i * 0.055); },
  coin() { this.tone(1320, 1320, 0.07, "square", 0.04); this.tone(1760, 1760, 0.14, "square", 0.04, 0.07); },
  clunk() { this.tone(92, 48, 0.2, "square", 0.09); this.noise(0.14, 0.16, 320, 180); },
  flip() { this.noise(0.12, 0.08, 2500, 900); },
  horn() { [0, 0.16, 0.32].forEach((d, i) => this.tone(330 * [1, 1.26, 1.5][i], 330 * [1, 1.26, 1.5][i], 0.5 - d, "sawtooth", 0.05, d)); }
};

// ---------- small pieces ----------
function cgToast(html, cls) {
  let t = $("cgtoast"); if (!t) { t = document.createElement("div"); t.id = "cgtoast"; document.body.appendChild(t); }
  const el = document.createElement("div"); el.className = "cgt " + (cls || ""); el.innerHTML = html; t.appendChild(el);
  setTimeout(() => el.classList.add("out"), 2600); setTimeout(() => el.remove(), 3100);
}
const LINES = {
  emerald: ["Green light!", "Emerald on the board."], sapphire: ["Blue chip!", "Sapphire. Now it's a pack."],
  ruby: ["RUBY! Now we're talking!", "Red-hot pull!"], amethyst: ["AMETHYST! Purple reign!", "That is a big-time card!"],
  diamond: ["DIAMOND! Ice cold!", "Are you kidding me?! A Diamond!"], opal: ["OPAL!! Check the odds on that!", "One in a thousand, folks!"],
  vulcan: ["VULCANIZED!!! It melted the rubber!", "THE RAREST CARD IN THE GAME!"]
};
const PAR_CALL = { B: ["BLUE /199", "sapphire"], G: ["GOLD /99", "gold"], R: ["RED /25", "ruby"], K: ["BLACK /10", "diamond"], S: ["ONE OF ONE", "opal"] };
// callouts and sounds queued for a pack window are dropped when it closes
const cgLater = (fn, ms) => { const t = setTimeout(() => { CG.timers = (CG.timers || []).filter(x => x !== t); fn(); }, ms); (CG.timers = CG.timers || []).push(t); return t; };
function cgClearLater() { for (const t of CG.timers || []) clearTimeout(t); CG.timers = []; const h = $("cgcall"); if (h) h.innerHTML = ""; }
function cgCallout(big, small, tier, ms) {
  const host = $("cgcall") || document.body, el = document.createElement("div");
  el.className = `cgcall t-${tier || "gold"}`; el.innerHTML = `<b>${esc(big)}</b>${small ? `<small>${esc(small)}</small>` : ""}`;
  host.appendChild(el); setTimeout(() => el.classList.add("out"), ms || 1500); setTimeout(() => el.remove(), (ms || 1500) + 450);
}
// a copy's own callouts: parallels, autographs, patches, Gem Mint 10s
function cgVariantCall(cp, delay) {
  const o = ECO.parseCopy(cp), calls = [];
  if (o.par) calls.push(() => { cgCallout(PAR_CALL[o.par.code][0], o.par.run === 1 ? "A Superfractor. There is only one." : `Serial ${o.n} of ${o.par.run}`, PAR_CALL[o.par.code][1], o.par.code === "S" ? 2600 : 1800); SFX.sparkle(4 + "BGRKS".indexOf(o.par.code)); if ("KS".includes(o.par.code)) SFX.horn(); });
  if (o.auto) calls.push(() => { cgCallout("AUTOGRAPH", "Certified, on-card ink", "sapphire", 1700); SFX.sparkle(5); });
  if (o.patch != null) calls.push(() => { cgCallout("GAME-WORN", "A swatch of a real game's jersey", "ruby", 1700); SFX.clunk(); });
  if (o.g === 10) calls.push(() => { cgCallout("GEM MINT 10", "Perfect centering, perfect corners", "emerald", 1500); SFX.coin(); });
  calls.forEach((f, i) => cgLater(f, (delay || 0) + i * 900));
  return calls.length;
}
function cgWallet(s, extra) {
  const tk = Object.entries(s.tokens).filter(([, n]) => n > 0).reduce((a, [, n]) => a + n, 0), L = ECO.levelOf(s.xp);
  return `<div class="wallet">${coinH(s.coins)}<span class="m">${tk ? `${tk} unopened pack${tk === 1 ? "" : "s"}` : "no unopened packs"}</span><a class="lvchip" href="#cards-mine" title="Collector level">Lv ${L}</a>${extra || ""}</div>`;
}
// a strip for the Cards home page
function cgHomeStrip() {
  const s = CGSAVE.load(), [today] = cgToday(), ready = s.daily.last !== today, L = ECO.levelOf(s.xp);
  return `<a class="homestrip" href="#cards-packs">${coinH(s.coins)}<span class="lvchip">Lv ${L}</span>${s.pick ? `<span class="dot">A pick is waiting</span>` : ready ? `<span class="dot">Daily reward ready</span>` : `<span class="m">Streak ${s.daily.streak} day${s.daily.streak === 1 ? "" : "s"}</span>`}<b>Packs →</b></a>`;
}
function cgLevelCard(s) {
  const P = ECO.levelProg(s.xp), nx = ECO.UNLOCKS.find(u => u.L > P.L);
  return `<div class="cgm lv"><div class="mh"><b>Collector level ${P.L}</b><small>${P.need ? `${fmtN(P.have)} / ${fmtN(P.need)} XP` : "Top level"}</small></div><i class="prog"><em style="width:${P.need ? (P.have / P.need * 100).toFixed(1) : 100}%"></em></i>
    <small class="m">XP from every pull, set and exchange. Each level pays coins and a pack; daily and challenge coins +${Math.round((ECO.coinBonus(s) - 1) * 100)}%.${nx ? ` Level ${nx.L}: ${esc(nx.text)}.` : ""}</small></div>`;
}
function cgPityCard(s) {
  const p = s.pity || 0, pct = Math.min(100, p / ECO.PITY_N * 100);
  return `<div class="cgm pity${p + 1 >= ECO.PITY_N ? " full" : ""}"><div class="mh"><b>Diamond meter</b><small>${p.toFixed(p % 1 ? 1 : 0)} / ${ECO.PITY_N}</small></div><i class="prog"><em style="width:${pct.toFixed(1)}%"></em></i>
    <small class="m">Fills by a Standard pack's worth per pack (pricier packs count more) and empties on any Diamond or better. The pack that fills it ends with a Diamond or better.</small></div>`;
}

// ---------- the pack store ----------
function pcPacks(all) {
  cgPrep(all); const s = CGSAVE.load(), P = cgPackList(all); PC.packs = P; const W = cgWeek(s); CGSAVE.save();
  const [today] = cgToday(), hol = cgHoliday(), holName = k => (CC.COLLECTIONS.find(c => c.hol === k) || {}).name || k, now = Date.now();
  let h = `<p><a href="#cards">← All collections</a></p><div class="vh"><h2>Packs</h2><a class="btn ghost" href="#cards-mine">My collection →</a></div>`;
  if (s.welcome) { h += `<div class="welcome"><b>Welcome to the card game.</b> Packs cost coins now. You start with ${coinH(1500)}, three Standard packs and a Premium pack${Object.keys(s.owned).length ? `, and every card you already pulled is still yours` : ""}. Earn more with the daily reward, weekly challenges, finished sets and by selling spare copies.</div>`; delete s.welcome; delete s.welcome2; CGSAVE.save(); }
  else if (s.welcome2) { h += `<div class="welcome"><b>New: deeper collecting.</b> Every card you pull now has a grade (Gem Mint 10 is the chase), and a few come as color parallels, autographs or game-worn patches. Base cards are in Standard and decade packs, with team sets to finish. Level up as a collector, earn achievements, fill the Diamond meter, and look for this week's featured collection and event pack. Cards you already had were graded on arrival.</div>`; delete s.welcome2; CGSAVE.save(); }
  h += cgWallet(s);
  if (s.pick) h += `<div class="welcome pickwait"><b>You have a Pick-One pack open.</b> Choose the card you keep. <button class="btn" onclick="cgPickResume()">Finish your pick</button></div>`;
  // daily reward and streak
  const claimed = s.daily.last === today, next = claimed ? s.daily.streak : (s.daily.last === cgToday()[1] ? s.daily.streak : 0);
  h += `<div class="daily${claimed ? " done" : ""}"><div><b>Daily reward</b><small>${claimed ? `Claimed today · come back tomorrow for day ${next + 1}` : `A free Standard pack and coins. Come back every day: day 7 adds a Premium pack.`}</small></div>
    <div class="streak">${ECO.STREAK.map((v, i) => `<span class="${i < (claimed ? (next - 1) % 7 + 1 : next % 7) ? "got" : ""}${!claimed && i === next % 7 ? " now" : ""}"><b>${i + 1}</b><small>${Math.round(v * ECO.coinBonus(s))}${i === 6 ? "+P" : ""}</small></span>`).join("")}</div>
    ${claimed ? "" : `<button class="btn" onclick="cgDaily()">Claim</button>`}</div>`;
  h += `<div class="meters">${cgLevelCard(s)}${cgPityCard(s)}</div>`;
  // packs you own
  const mine = Object.entries(s.tokens).filter(([, n]) => n > 0).map(([k, n]) => [cgPackDef(k), n]).filter(([p]) => p);
  if (mine.length) h += `<h3>Your packs</h3><div class="packs">${mine.map(([pk, n]) => `<button class="packt own" onclick="cgOpen('${pk.key}')"><span class="pk">${CART.packSVG(pk, pk.key)}<i class="cnt">×${n}</i></span><b>${esc(pk.name)}</b><small>${esc(pk.sub)}</small><em class="price free">Open</em></button>`).join("")}</div>`;
  const tile = pk => {
    const price = ECO.priceOf(pk.key), off = pk.key === "holiday" && !hol.active, locked = pk.lockL && !ECO.unlocked(s, pk.key), short = s.coins < price;
    const note = off ? (hol.next ? `Back for ${holName(hol.next[1])}` : "Holidays only") : pk.key === "holiday" ? `On sale for ${holName(hol.active)}` : locked ? `Unlocks at collector level ${pk.lockL}` : pk.ends ? `Leaves in ${leftTxt(pk.ends - now)}` : `${fmtN(cgPool(pk).length)} cards${pk.base ? ` + ${pk.base} base` : ""}`;
    const dis = off || locked;
    return `<button class="packt${dis ? " off" : ""}${pk.ends ? " timed" : ""}" ${dis ? "disabled" : ""} onclick="cgOpen('${pk.key}')"><span class="pk">${CART.packSVG(pk, pk.key)}${locked ? `<i class="lock">Lv ${pk.lockL}</i>` : ""}</span><b>${esc(pk.name)}</b><small>${esc(pk.sub)} · ${note}</small><em class="price${short && !dis ? " short" : ""}">${off ? "Off sale" : locked ? "Locked" : coinH(price)}</em></button>`;
  };
  // this week: the featured collection and the event pack
  const feat = P.find(p => p.key === "featured"), ev = P.find(p => p.ev);
  if (feat || ev) {
    const FC = feat && CC.CBY[feat.featured], fl = feat ? cgPool(feat).sort((a, b) => b.ovr - a.ovr) : [];
    h += `<h3>This week</h3><div class="weekrow">`;
    if (feat) h += `<div class="featban"><a class="mini" href="#cards-${feat.featured}">${fl[0] ? CART.front(fl[0]) : ""}</a><div><small>Featured collection · changes in ${leftTxt(feat.ends - now)}</small><b>${esc(FC.name)}</b><p>${esc(FC.blurb || "")} ${fl.length} cards. Its Spotlight pack makes Emerald and up 2.5× as likely.</p><a class="btn ghost sm" href="#cards-album-${feat.featured}">Album</a></div></div>`;
    h += `<div class="packs wk">${[feat, ev].filter(Boolean).map(tile).join("")}</div></div>`;
  }
  h += `<h3>Store</h3><div class="packs">${P.filter(p => p !== feat && p !== ev).map(tile).join("")}</div>`;
  // weekly challenges
  h += `<h3>This week's challenges</h3><div class="chall">${W.list.map(ch => { const p = Math.min(ch.n, W.prog[ch.id] || 0), d = W.done[ch.id]; return `<div class="ch${d ? " done" : ""}"><div><b>${esc(ch.text)}</b><small>${d ? "Done" : `${p} of ${ch.n}`} · ${coinH(Math.round(ch.coins * ECO.coinBonus(s)))}${ch.token ? ` + a ${(cgPackDef(ch.token) || { name: ch.token }).name}` : ""}</small></div><i class="prog"><em style="width:${(p / ch.n * 100).toFixed(0)}%"></em></i></div>`; }).join("")}</div><p class="m small">New challenges every Monday.</p>`;
  // settings and odds
  const tg = (k, label, sub) => `<label class="tgl"><input type="checkbox" ${s.opts[k] ? "checked" : ""} onchange="cgOpt('${k}',this.checked)"><span><b>${label}</b><small>${sub}</small></span></label>`;
  h += `<h3>Opening</h3><div class="tgls">${tg("quick", "Quick open", "Skip the show and see every card at once")}${tg("walkouts", "Walkouts", "Ruby and up walk out of the tunnel in 3D")}${tg("sound", "Sound", "Pack, pull and coin sounds")}</div>`;
  const tot = Object.values(ECO.TIER_W).reduce((a, b) => a + b, 0), pc = x => x >= 0.01 ? (x * 100).toFixed(1) + "%" : x >= 0.001 ? (x * 100).toFixed(2) + "%" : "1 in " + fmtN(1 / x);
  h += `<h3>Odds per card</h3><div class="chips">${CC.TIERS.slice().reverse().map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${(ECO.TIER_W[t.key] / tot * 100).toFixed(ECO.TIER_W[t.key] / tot < 0.01 ? 2 : 1)}%</b></span>`).join("")}</div><p class="m small">Every slot rolls a tier with these odds, then a card from that tier. Packs with a guarantee roll the last card only from cards at or above that tier.</p>`;
  h += `<div class="chips">${ECO.PARALLELS.map(p => `<span class="tchip"><i class="vc p-${p.code}">${p.run === 1 ? "1/1" : "/" + p.run}</i>${p.name} <b>${pc(p.p)}</b></span>`).join("")}<span class="tchip"><i class="vc au">AUTO</i> <b>${pc(ECO.AUTO_P)}</b></span><span class="tchip"><i class="vc pa">PATCH</i> <b>${pc(ECO.PATCH_P)}</b></span><span class="tchip"><i class="vc gr gm">10</i>Gem Mint <b>3%</b></span></div>
    <p class="m small">Variants roll after the card is drawn, so they never change the tier odds. Every card gets a grade (most are 7–9). Serial numbers are for show: there is no global print run. Any version of a card counts toward sets.</p>`;
  return h;
}
function cgOpt(k, v) { const s = CGSAVE.load(); s.opts[k] = !!v; CGSAVE.save(); if (k === "sound" && v) SFX.coin(); }
function cgLevelToasts(ups) {
  for (const u of ups || []) { SFX.horn(); cgToast(`<b>Level ${u.L}!</b> ${coinH(u.reward.coins)} + ${cgTokText(u.reward.tokens)}${u.unlocks.length ? ` · unlocked: ${esc(u.unlocks.map(x => x.text).join(", "))}` : ""}`, "gold"); }
}
function cgAchToasts(list) { for (const a of list || []) cgToast(`<b>Achievement: ${esc(a.name)}</b> · ${esc(a.text)} · ${cgRewardText(a.r)}`, "gold"); }
const cgTokText = t => Object.entries(t || {}).map(([k, n]) => `${n > 1 ? n + " " : "a "}${(cgPackDef(k) || { name: k }).name}${n > 1 ? "s" : ""}`).join(" + ");
const cgRewardText = r => [r.coins ? coinH(r.coins) : "", cgTokText(r.tokens)].filter(Boolean).join(" + ");
function cgDaily() {
  const s = CGSAVE.load(), [today, yest] = cgToday(), r = ECO.claimDaily(s, today, yest); if (!r) return;
  cgPrep(CG.all || []); cgWeek(s); const fin = ECO.track(s, { type: "daily" }), ach = cgAch(s); CGSAVE.save();
  const pu = BB.NIGHTS ? BB.NIGHTS.passGain(s, BB.NIGHTS.PASS_GAIN.daily, Date.now()) : []; CGSAVE.save();
  SFX.coin(); cgToast(`Day ${r.streak}: ${coinH(r.coins)} and a Standard pack${r.tokens.premium ? " + a Premium pack" : ""}`);
  if (window.cnPassToasts) cnPassToasts(pu);
  for (const ch of fin) cgToast(`Challenge done: ${esc(ch.text)} · ${coinH(Math.round(ch.coins * ECO.coinBonus(s)))}`, "gold");
  cgLevelToasts(r.ups); cgAchToasts(ach);
  route();
}

// ---------- opening a pack ----------
async function cgOpen(key) {
  const all = pcAll(await pcIndex()); await pcBaseLoad(); cgPrep(all); PC.packs = cgPackList(all);
  const s = CGSAVE.load(); cgWeek(s);
  if (s.pick) { cgPickResume(); return; }
  const pk = cgPackDef(key); if (!pk) return;
  const token = (s.tokens[key] || 0) > 0;
  if (key === "holiday" && !cgHoliday().active && !token) { cgToast("The Holiday pack is only on sale around holidays."); return; }
  if (pk.lockL && !ECO.unlocked(s, pk.key) && !token) { cgToast(`The ${esc(pk.name)} unlocks at collector level ${pk.lockL}.`); return; }
  if (pk.ends && Date.now() > pk.ends && !token) { cgToast("That pack has left the store."); return; }
  const pool = cgPool(pk); if (!pool.length) { cgToast("No cards for that pack in this history yet."); return; }
  const how = ECO.payFor(s, key);
  if (!how) { cgToast(`You need ${coinH(ECO.priceOf(key))} for the ${esc(pk.name)}. You have ${coinH(s.coins)}.`, "bad"); return; }
  const pity = ECO.pityReady(s, key), last = Math.max(pk.guarantee || 0, pity ? DMIN : 0);
  s.packs++;
  if (pk.pick) {
    const cards = cgPickDraw(pool, pk.n, last, s).map(c => Object.assign({}, c, { cp: ECO.rollCopy() }));
    s.pick = { pk: key, c: cards.map(c => pcKey(c) + "|" + c.cp), pity, how }; CGSAVE.save();
    return cgPickShow();
  }
  let cards = [];
  for (let k = 0; k < pk.n; k++) cards.push(pcDraw(pool, k === pk.n - 1 ? last : 0, pk.boost));
  if (pk.base) { const bp = cgBasePool(pk); if (bp.length) for (let i = 0; i < pk.base; i++) cards.push(pcDraw(bp, 0)); }
  cards = cards.map(c => Object.assign({}, c, { cp: pk.force ? ECO.forceCopy(ECO.rollCopy(), pk.force) : ECO.rollCopy() }));
  // base cards first, then by overall; the best card last, like a real pack
  cards.sort((a, b) => (b.col === "base") - (a.col === "base") || a.ovr - b.ovr || ECO.copyMult(a.cp) - ECO.copyMult(b.cp));
  const res = cgAddPulls(s, cards, key, pity); res.how = how;
  cgShow(pk, cards, res.news, res);
}
// adds pulled copies to the save: stats and XP, challenges, the Diamond meter, sets, achievements
function cgAddPulls(s, cards, key, pity) {
  const res = { fin: [], paid: [], ups: [], ach: [], pity: false, news: [] };
  res.fin.push(...ECO.track(s, { type: "open" }));
  let gotD = false;
  for (const c of cards) {
    const isNew = MY.add(c, c.cp); res.news.push(isNew);
    res.ups.push(...ECO.notePull(s, c.tier.key, c.cp, isNew));
    res.fin.push(...ECO.track(s, { type: "pull", tier: c.tier.key, season: c.season, group: (CC.CBY[c.col] || {}).group, isNew, cp: c.cp }));
    if (TIX(c.tier.key) >= TIX("diamond")) gotD = true;
  }
  if (pity && gotD) { res.pity = true; s.st.pityHits = (s.st.pityHits || 0) + 1; }
  ECO.pityAfter(s, key, gotD);
  const touched = CG.sets.filter(st => cards.some(c => st.ks.has(pcKey(c))));
  res.paid = ECO.paySets(s, touched);
  for (const p of res.paid) { res.ups.push(...p.ups); if (p.kind === "team") res.fin.push(...ECO.track(s, { type: "teamset" })); }
  res.ach = cgAch(s); for (const a of res.ach) res.ups.push(...a.ups);
  res.pass = BB.NIGHTS ? BB.NIGHTS.passGain(s, BB.NIGHTS.PASS_GAIN.pack, Date.now()) : [];
  const top = cards.reduce((a, c) => c.ovr > a.ovr ? c : a, cards[0]), best = s.best && CG.byKey.get(s.best);
  if (top && (!best || top.ovr > best.ovr)) s.best = pcKey(top);
  CGSAVE.save(); return res;
}
function cgShow(pk, cards, news, res) {
  const s = CGSAVE.load(), quick = s.opts.quick, top = cards.reduce((a, c) => c.ovr > a.ovr ? c : a, cards[0]), ti = TIX(top.tier.key), T = CART.TP[top.tier.key] || CART.TP.gold;
  const fancy = cards.some(c => { const o = ECO.parseCopy(c.cp); return o.par && "RKS".includes(o.par.code); });
  cgClearLater(); PC.pull = cards; pcSetList(cards, "pull"); CG.show = { pk, cards, news, res, left: cards.length, busy: false };
  let m = $("packmodal");
  if (!m) { m = document.createElement("div"); m.id = "packmodal"; m.className = "cmodal packm"; document.body.appendChild(m); }
  const again = ECO.canOpen(s, pk.key), againTxt = again === "token" ? `Open another (×${s.tokens[pk.key]})` : ECO.priceOf(pk.key) != null ? `Open another · ${coinH(ECO.priceOf(pk.key))}` : "";
  m.innerHTML = `<div class="cm-box"><button class="cm-x" onclick="pcClosePack()" aria-label="Close">✕</button>
    <div id="cgcall" class="cgcalls"></div>
    ${quick ? "" : `<div class="tearwrap${fancy ? " fancy" : ""}" id="tearwrap" onclick="cgTear()" style="--glow:${ti >= TIX("emerald") ? T.acc : fancy ? "#ffe27a" : "transparent"};--amp:${(1 + Math.max(0, ti - 3) * 0.5).toFixed(1)}px"><div class="tear">${CART.packSVG(pk, pk.key)}</div><p class="m">Tap the pack to open it${res.pity ? " · the Diamond meter is full" : ""}</p></div>`}
    <div class="pull" id="pull" ${quick ? "" : "hidden"}>${cards.map((c, k) => cgSlot(c, k, news[k], quick)).join("")}</div>
    <div class="pullsum" id="pullsum" ${quick ? "" : "hidden"}>${cgSummary(cards, news, res)}</div>
    <div class="pullbar" id="pullbar" ${quick ? "" : "hidden"}><button onclick="cgRevealAll()" id="revall" ${quick ? "hidden" : ""}>Reveal all</button>${againTxt ? `<button ${again ? "" : "disabled"} onclick="cgOpen('${pk.key}')">${againTxt}</button>` : ""}<a class="btn ghost" href="#cards-packs" onclick="pcClosePack()">Store</a><a class="btn ghost" href="#cards-mine" onclick="pcClosePack()">My collection</a></div></div>`;
  m.hidden = false; document.body.classList.add("noscroll");
  if (quick) {
    CG.show.left = 0; let d = 0;
    if (ti >= TIX("ruby")) { SFX.boom(ti / 10); cgCallout(top.tier.name.toUpperCase(), LINES[top.tier.key][0], top.tier.key); d = 1600; } else SFX.flip();
    const sp = cards.slice().sort((a, b) => ECO.copyMult(b.cp) - ECO.copyMult(a.cp))[0]; if (sp && ECO.special(sp.cp)) cgVariantCall(sp.cp, d);
    cgAfter();
  }
}
function cgSlot(c, k, isNew, shown) {
  const o = ECO.parseCopy(c.cp), sp = ECO.special(c.cp);
  return `<div class="pslot t-${c.tier.key}${c.ovr >= 81 ? " rare" : ""}${c.ovr >= 90 ? " ultra" : ""}${sp ? " var" : ""}${o.par ? " p-" + o.par.code : ""}${shown ? " shown" : ""}" style="--d:${k * 0.12}s"><div class="fcard tilt pflip${shown ? " flip" : ""}" onclick="cgReveal(this, ${k})"><div class="fc-in"><div class="fc-f">${CART.mystery()}</div><div class="fc-b">${CART.front(c)}</div></div><div class="glare"></div></div>${isNew ? `<span class="newb">NEW</span>` : ""}<span class="ctl pl">${esc(c.tier.name)} · ${esc(c.col === "base" ? "Base" : (CC.CBY[c.col] || {}).name || "")}</span><span class="pl vline">${cgChips(c.cp, true)}</span></div>`;
}
function cgSummary(cards, news, res) {
  const n = news.filter(Boolean).length, out = [];
  out.push(`<span><b>${n} new card${n === 1 ? "" : "s"}</b>${n < cards.length ? ` · ${cards.length - n} more cop${cards.length - n === 1 ? "y" : "ies"}` : ""}</span>`);
  const sp = cards.filter(c => ECO.special(c.cp));
  for (const c of sp) out.push(`<span class="var">${cgChips(c.cp, true, true)} ${esc(c.name)} ${c.season}</span>`);
  if (res.pity) out.push(`<span class="gold">The Diamond meter paid off: a guaranteed Diamond or better.</span>`);
  for (const ch of res.fin) out.push(`<span class="gold">Challenge done: ${esc(ch.text)} · ${coinH(Math.round(ch.coins * ECO.coinBonus(CGSAVE.load())))}${ch.token ? " + " + cgTokText({ [ch.token]: 1 }) : ""}</span>`);
  for (const st of res.paid) out.push(`<span class="gold">Set complete: ${esc(cgSetName(st))} · ${cgRewardText(st.reward)}</span>`);
  for (const a of res.ach) out.push(`<span class="gold">Achievement: <b>${esc(a.name)}</b> · ${esc(a.text)} · ${cgRewardText(a.r)}</span>`);
  for (const u of res.ups) out.push(`<span class="lvup">Level ${u.L}! ${cgRewardText(u.reward)}${u.unlocks.length ? ` · unlocked: ${esc(u.unlocks.map(x => x.text).join(", "))}` : ""}</span>`);
  for (const u of res.pass || []) out.push(`<span class="lvup">Season pass level ${u.L}! ${cgRewardText(u.reward)}</span>`);
  return out.join("");
}
function cgSetName(st) {
  if (st.kind === "team") return `${st.season} ${teamName(st.team)} team set`;
  if (st.kind === "season") return `${st.season} base set`;
  return `${(CC.CBY[st.col] || {}).name || st.col} ${st.decade === "all" ? "(every card)" : st.decade + "s"}`;
}
// the tier tease: the pack glows the color of its best card and shakes harder the rarer it is
function cgTear() {
  const w = $("tearwrap"), S = CG.show; if (!w || w.classList.contains("charge") || !S) return;
  const top = S.cards.reduce((a, c) => c.ovr > a.ovr ? c : a, S.cards[0]), ti = TIX(top.tier.key), dur = ti >= TIX("diamond") ? 1.9 : ti >= TIX("ruby") ? 1.3 : ti >= TIX("emerald") ? 0.9 : 0.45;
  w.style.setProperty("--dur", dur + "s"); w.classList.add("charge"); SFX.riser(dur, Math.max(0, ti - 3) / 7);
  setTimeout(() => {
    w.classList.add("go"); SFX.boom(Math.max(0, ti - 3) / 7);
    const fl = document.createElement("div"); fl.className = "flash"; fl.style.background = ti >= TIX("emerald") ? getComputedStyle(w).getPropertyValue("--glow") : "#fff"; document.body.appendChild(fl); setTimeout(() => fl.remove(), 700);
    setTimeout(() => { w.hidden = true; $("pull").hidden = false; $("pullbar").hidden = false; }, 380);
  }, dur * 1000);
}
async function cgReveal(el, k) {
  const S = CG.show; if (!S) return;
  if (el.classList.contains("flip")) return pcOpen(k, "pull");
  if (S.busy) return; S.busy = true;
  try { await cgFlip(el, k); } finally { S.busy = false; }
}
async function cgFlip(el, k) {
  const S = CG.show, c = S.cards[k], ti = TIX(c.tier.key), s = CGSAVE.load();
  if (c.ovr >= 81 && s.opts.walkouts && !s.opts.quick && window.Broadcast3D && Broadcast3D.walkout && Broadcast3D.supported()) await cgWalkout(c);
  el.classList.add("flip"); el.closest(".pslot").classList.add("shown"); SFX.flip();
  let d = 0;
  if (ti >= TIX("emerald")) { const L = LINES[c.tier.key]; cgCallout(c.tier.name.toUpperCase(), ti >= TIX("ruby") ? L[(c.pid + c.season) % L.length] : "", c.tier.key, ti >= TIX("diamond") ? 2200 : 1400); if (ti >= TIX("ruby")) { SFX.boom(ti / 10); SFX.sparkle(ti - 3); } else SFX.sparkle(3); d = ti >= TIX("diamond") ? 2300 : 1500; }
  const n = cgVariantCall(c.cp, d);
  if (n) await new Promise(r => setTimeout(r, Math.min(2400, d + n * 700)));
  if (--S.left === 0) cgAfter();
}
async function cgRevealAll() {
  const S = CG.show; if (!S || S.busy) return; S.busy = true; const b = $("revall"); if (b) b.hidden = true;
  try { for (const [k, el] of [...document.querySelectorAll("#pull .pflip")].entries()) { if (el.classList.contains("flip")) continue; await cgFlip(el, k); await new Promise(r => setTimeout(r, 260)); } }
  finally { S.busy = false; }
}
// after the last card: the summary, and callouts for sets, challenges, achievements and levels
function cgAfter() {
  const S = CG.show; if (!S) return; const sm = $("pullsum"); if (sm) sm.hidden = false; const b = $("revall"); if (b) b.hidden = true;
  let d = 900;
  for (const st of S.res.paid) { cgLater(() => { SFX.horn(); cgCallout("SET COMPLETE", cgSetName(st), "gold", 2000); }, d); d += 2200; }
  for (const ch of S.res.fin) { cgLater(() => { SFX.coin(); cgCallout("CHALLENGE DONE", ch.text, "emerald", 1600); }, d); d += 1700; }
  for (const a of S.res.ach) { cgLater(() => { SFX.sparkle(5); cgCallout("ACHIEVEMENT", a.name, "amethyst", 1700); }, d); d += 1800; }
  for (const u of S.res.ups) { cgLater(() => { SFX.horn(); cgCallout(`LEVEL ${u.L}`, u.unlocks.length ? "Unlocked: " + u.unlocks.map(x => x.text).join(", ") : "Collector level up", "sapphire", 1800); }, d); d += 1900; }
}
function pcClosePack() { cgClearLater(); const m = $("packmodal"); if (m) { m.hidden = true; m.innerHTML = ""; } CG.show = null; document.body.classList.remove("noscroll"); if (location.hash.startsWith("#cards")) route(); }

// ---------- Pick-One packs: three face up, keep one ----------
// The pick waits in the save until it's made, so closing the window or reloading doesn't lose the pack.
function cgPickDraw(pool, n, last, s) {
  const out = [], seen = new Set();
  for (let k = 0; k < n; k++) {
    let c = null;
    for (let t = 0; t < 12 && !c; t++) { const x = pcDraw(pool, k === n - 1 ? last : 0); if (!seen.has(pcKey(x)) && (!s.owned[pcKey(x)] || t >= 10)) c = x; }
    c = c || pcDraw(pool, 0); seen.add(pcKey(c)); out.push(c);
  }
  return out;
}
function cgPickCards(s) { return (s.pick ? s.pick.c : []).map(x => { const [k, cp] = x.split("|"), c = CG.byKey.get(k); return c ? Object.assign({}, c, { cp }) : null; }).filter(Boolean); }
async function cgPickResume() { const all = pcAll(await pcIndex()); await pcBaseLoad(); cgPrep(all); cgPickShow(); }
function cgPickShow() {
  const s = CGSAVE.load(), cards = cgPickCards(s); if (!cards.length) { delete s.pick; CGSAVE.save(); return; }
  cgClearLater(); const pk = cgPackDef(s.pick.pk) || cgPickDef(); PC.pull = cards; pcSetList(cards, "pull"); CG.show = { pk, cards, news: cards.map(c => !s.owned[pcKey(c)]), res: null, pick: true };
  let m = $("packmodal"); if (!m) { m = document.createElement("div"); m.id = "packmodal"; m.className = "cmodal packm"; document.body.appendChild(m); }
  m.innerHTML = `<div class="cm-box"><button class="cm-x" onclick="pcClosePack()" aria-label="Close">✕</button><div id="cgcall" class="cgcalls"></div>
    <h3 class="pickh">Pick one to keep</h3><p class="m small pickp">${esc(pk.name)} · the other two go back${s.pick.pity ? " · the Diamond meter guaranteed a Diamond or better" : ""}. You can close this and pick later.</p>
    <div class="pull pick3" id="pull">${cards.map((c, k) => `<div class="pslot shown t-${c.tier.key}${ECO.special(c.cp) ? " var" : ""}"><div class="fcard tilt" onclick="pcOpen(${k},'pull')">${CART.front(c)}<div class="glare"></div></div>${!s.owned[pcKey(c)] ? `<span class="newb">NEW</span>` : ""}<span class="ctl pl">${esc(c.tier.name)} · ${esc(c.col === "base" ? "Base" : (CC.CBY[c.col] || {}).name || "")}</span><span class="pl vline">${cgChips(c.cp, true)}</span><button class="keep" onclick="cgKeep(${k})">Keep</button></div>`).join("")}</div>
    <div class="pullsum" id="pullsum" hidden></div><div class="pullbar" id="pullbar" hidden></div></div>`;
  m.hidden = false; document.body.classList.add("noscroll"); SFX.flip();
}
async function cgKeep(k) {
  const s = CGSAVE.load(), cards = cgPickCards(s), c = cards[k], S = CG.show; if (!c || !s.pick || (S && S.busy)) return;
  if (S) S.busy = true;
  const key = s.pick.pk, pity = s.pick.pity; delete s.pick;
  const res = cgAddPulls(s, [c], key, pity);
  document.querySelectorAll("#pull .pslot").forEach((el, i) => { el.classList.toggle("kept", i === k); el.classList.toggle("gone", i !== k); const b = el.querySelector(".keep"); if (b) b.remove(); });
  if (c.ovr >= 81 && s.opts.walkouts && !s.opts.quick && window.Broadcast3D && Broadcast3D.walkout && Broadcast3D.supported()) await cgWalkout(c);
  const ti = TIX(c.tier.key); let d = 0;
  if (ti >= TIX("ruby")) { SFX.boom(ti / 10); cgCallout(c.tier.name.toUpperCase(), LINES[c.tier.key][0], c.tier.key, 1600); d = 1700; } else SFX.coin();
  cgVariantCall(c.cp, d);
  CG.show = { pk: cgPackDef(key) || cgPickDef(), cards: [c], news: res.news, res, left: 0 };
  const again = ECO.canOpen(s, key), sm = $("pullsum"), bar = $("pullbar");
  sm.innerHTML = cgSummary([c], res.news, res); sm.hidden = false;
  bar.innerHTML = `${ECO.priceOf(key) != null || again ? `<button ${again ? "" : "disabled"} onclick="cgOpen('${key}')">${again === "token" ? `Open another (×${s.tokens[key]})` : `Open another · ${coinH(ECO.priceOf(key))}`}</button>` : ""}<a class="btn ghost" href="#cards-packs" onclick="pcClosePack()">Store</a><a class="btn ghost" href="#cards-mine" onclick="pcClosePack()">My collection</a>`; bar.hidden = false;
  const h = document.querySelector(".pickh"); if (h) h.textContent = "Kept";
  cgLater(cgAfter, d);
}

// ---------- the walkout: Ruby and up walk out of the tunnel before the card flips ----------
function cgWalkout(c) {
  return new Promise(res => {
    const T = CART.TP[c.tier.key] || CART.TP.ruby, ti = TIX(c.tier.key), team = TB[c.teamId] || {};
    const ov = document.createElement("div"); ov.className = `wkov t-${c.tier.key}`;
    ov.innerHTML = `<canvas></canvas><div class="wk-n"><small>${esc(team.city ? team.city + " " + team.name : "")} · ${c.season}</small><b>${esc(c.name)}</b></div><div class="wk-t"><b>${esc(c.tier.name.toUpperCase())}</b><small>${c.ovr} OVR · ${esc((CC.CBY[c.col] || {}).name || "")}</small></div><button class="wk-skip">Skip ›</button>`;
    document.body.appendChild(ov);
    const hat = c.col === "christmas" ? "santa" : c.col === "stpatricks" ? "clover" : null;
    const spec = Object.assign(CART.photoSpec(c, null, hat), { color: T.acc, color2: T.frame[3], sparks: ti >= TIX("diamond") });
    let w = null;
    const end = () => { ov.classList.add("out"); setTimeout(() => ov.remove(), 320); res(); };
    try {
      w = Broadcast3D.walkout(ov.querySelector("canvas"), spec, { beat: b => {
        if (b === "bar") SFX.clunk();
        if (b === "spot") { SFX.boom(0.3); ov.classList.add("lit"); }
        if (b === "pose") { SFX.horn(); SFX.sparkle(ti - 3); ov.classList.add("posed"); }
      } });
    } catch (e) { console.warn("walkout", e); ov.remove(); res(); return; }
    ov.querySelector(".wk-skip").onclick = ev => { ev.stopPropagation(); w.skip(); };
    ov.onclick = () => w.skip();
    w.done.then(end, end);
  });
}

// ---------- my collection: level, score, the showcase, achievements, the trade desk, sets ----------
function pcMine(all) {
  cgPrep(all); const s = CGSAVE.load(), byCol = {}; for (const c of all) (byCol[c.col] = byCol[c.col] || []).push(c);
  const ach = cgAch(s); if (ach.length) { CGSAVE.save(); setTimeout(() => { cgAchToasts(ach); cgLevelToasts(ach.flatMap(a => a.ups)); }, 300); }
  const mine = all.filter(c => s.owned[pcKey(c)]).sort((a, b) => b.ovr - a.ovr), baseOwn = CG.base.filter(c => s.owned[pcKey(c)]);
  let h = `<p><a href="#cards">← All collections</a></p><div class="vh"><h2>My collection</h2><a class="btn" href="#cards-packs">Packs</a></div>`;
  h += cgWallet(s);
  if (!mine.length && !baseOwn.length && !Object.keys(s.wit || {}).length) return h + `<p class="m">Nothing yet. Open a pack and your cards land here.</p>` + cgBackup();
  // the collector: level, score, numbers
  const total = all.length + CG.base.length, uniq = mine.length + baseOwn.length, st = s.st || {}, par = st.par || {};
  const nAch = ECO.ACH.filter(a => s.ach[a.id]).length;
  h += `<div class="collector"><div class="lvbig"><small>Collector</small><b>${ECO.levelOf(s.xp)}</b><small>level</small></div><div class="cstats">
    <div class="score"><small>Collection score</small><b>${fmtN(cgScore(s))}</b></div>
    <div class="kv"><div><b>${fmtN(uniq)}</b><span>Unique cards</span></div><div><b>${fmtN(s.cards)}</b><span>Cards pulled</span></div><div><b>${fmtN(s.packs)}</b><span>Packs opened</span></div><div><b>${(uniq / Math.max(1, total) * 100).toFixed(1)}%</b><span>Of every card</span></div><div><b>${nAch}/${ECO.ACH.length}</b><span>Achievements</span></div></div>
    <div class="chips">${ECO.PARALLELS.filter(p => par[p.code]).map(p => `<span class="tchip"><i class="vc p-${p.code}">${p.run === 1 ? "1/1" : "/" + p.run}</i>${p.name} <b>${par[p.code]}</b></span>`).join("")}${st.auto ? `<span class="tchip"><i class="vc au">AUTO</i> <b>${st.auto}</b></span>` : ""}${st.patch ? `<span class="tchip"><i class="vc pa">PATCH</i> <b>${st.patch}</b></span>` : ""}${st.gem ? `<span class="tchip"><i class="vc gr gm">10</i>Gem Mint <b>${st.gem}</b></span>` : ""}</div>
  </div></div>`;
  h += `<div class="meters">${cgLevelCard(s)}${cgPityCard(s)}</div>`;
  // the showcase shelf
  const shelf = (s.shelf || []).map(x => { const [k, cp] = x.split("|"), c = CG.byKey.get(k); return c ? Object.assign({}, c, { cp }) : null; }).filter(Boolean);
  pcSetList(shelf, "shelf");
  const frames = ECO.FRAMES.filter(f => ECO.levelOf(s.xp) >= f.L);
  h += `<div class="vh"><h3>Showcase</h3>${frames.length > 1 ? `<select class="sp" onchange="cgFrame(this.value)">${frames.map(f => `<option value="${f.key}" ${s.frame === f.key ? "selected" : ""}>${f.name} shelf</option>`).join("")}</select>` : ""}</div>
    <div class="shelf fr-${s.frame || "wood"}">${shelf.length ? `<div class="cgrid">${shelf.map((c, i) => pcTile(c, i, `${c.season}`, "shelf")).join("")}</div>` : `<p class="m small">Your trophy shelf. Open any card you own and tap ★ on a copy to put it here (up to ${ECO.SHELF_N}).</p>`}</div>`;
  const wit = Object.keys(s.wit || {}).map(k => CG.byKey.get(k)).filter(Boolean).sort((a, b) => s.wit[pcKey(b)].d.localeCompare(s.wit[pcKey(a)].d));
  if (wit.length) { pcSetList(wit, "wit"); h += `<div class="vh"><h3>Witnessed on Classic Nights · ${wit.length}</h3><a class="btn ghost sm" href="#nights">Classic Nights →</a></div><div class="cgrid">${wit.map((c, i) => pcTile(c, i, s.wit[pcKey(c)].d, "wit")).join("")}</div>`; }
  const best = mine.slice(0, 8); pcSetList(best, "mine");
  h += `<h3>Best pulls</h3><div class="cgrid">${best.map((c, i) => pcTile(c, i, `${c.season}`, "mine")).join("")}</div>`;
  // achievements
  h += `<details class="achs"><summary><h3>Achievements · ${nAch} of ${ECO.ACH.length}</h3></summary><div class="achg">${ECO.ACH.map(a => `<div class="ach${s.ach[a.id] ? " done" : ""}"><b>${esc(a.name)}</b><small>${esc(a.text)}</small><em>${cgRewardText(a.r)}</em></div>`).join("")}</div></details>`;
  // spare copies: sell or trade
  const sp = cgSpares(s), spT = {}; for (const c of sp) spT[c.tier.key] = (spT[c.tier.key] || 0) + 1;
  const val = list => { let v = 0; const used = {}; for (const c of list) { const k = pcKey(c), idx = ECO.plainSpares(s, k)[used[k] = (used[k] || 0)]; used[k]++; v += ECO.copyValue(c.tier.key, ECO.copiesOf(s, k)[idx], c.col === "base"); } return v; };
  const low = sp.filter(c => TIX(c.tier.key) <= TIX("gold"));
  h += `<h3>Trade desk</h3><div class="desk"><div class="dk"><b>Spare copies</b>`;
  if (!sp.length) h += `<small>No spares yet. Duplicates you pull show up here, and you always keep your best copy.</small>`;
  else {
    h += `<small>${sp.length} plain spare cop${sp.length === 1 ? "y" : "ies"}, worth ${coinH(val(sp))}. Selling keeps your best copy of every card and never touches parallels, autographs, patches or Gem Mint 10s (sell those one at a time from the card viewer).</small><div class="chips">${CC.TIERS.slice().reverse().filter(t => spT[t.key]).map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${spT[t.key]}</b></span>`).join("")}</div><div class="row">`;
    if (low.length && low.length < sp.length) h += `<button onclick="cgSell('low')">Sell Gold and below · ${coinH(val(low))}</button>`;
    h += `<button class="${low.length < sp.length ? "warn" : ""}" onclick="cgSell('all', this)">Sell all spares · ${coinH(val(sp))}</button></div>`;
  }
  h += `</div><div class="dk"><b>Exchanges</b><small>Trade plain spare copies for a better pack. Uses your lowest spares first, and on average it's worth more than selling them.</small>`;
  for (const ex of ECO.EXCHANGES) {
    const have = sp.filter(c => ex.from.includes(c.tier.key)).length, P = cgPackDef(ex.gives) || ECO.XPACKS[ex.gives], names = ex.from.map(t => CC.TIERS[TIX(t)].name).join(" or ");
    h += `<div class="ex"><span><b>${ex.n} ${names}</b> → ${esc(P ? P.name : ex.gives)}<small>${esc(P ? P.sub : "")}</small></span><button ${have >= ex.n ? "" : "disabled"} onclick="cgExchange('${ex.key}', this)">${have >= ex.n ? "Trade" : `${have}/${ex.n}`}</button></div>`;
  }
  h += `</div></div>`;
  // base set and team sets
  h += cgBaseSets(s);
  // collection sets
  h += `<h3>Collection sets</h3><p class="m small">Every collection splits into one set per decade. Finish one for 1.5× what its cards would sell for, plus a pack for sets of five or more (Legends if it holds a Diamond or better). Finish a whole collection for 3× and two Legends packs. Any version of a card counts.</p><div class="sets">`;
  for (const [grp, title] of Object.entries(CC.GROUP_NAMES)) {
    h += `<div class="setg"><b>${title}</b>`;
    for (const C of CC.COLLECTIONS.filter(c => c.group === grp)) {
      const list = byCol[C.key] || []; if (!list.length) continue;
      const have = list.filter(c => s.owned[pcKey(c)]).length, sets = CG.sets.filter(st => st.kind === "col" && st.col === C.key && st.decade !== "all").sort((a, b) => a.decade - b.decade), master = CG.setBy.get(C.key + "@all");
      h += `<details class="setr${have === list.length ? " done" : ""}"><summary><span>${esc(C.name)}</span><i class="prog"><em style="width:${(have / list.length * 100).toFixed(1)}%"></em></i><small>${have}/${list.length}</small></summary><div class="decs">`;
      for (const st of master ? sets.concat([master]) : sets) {
        const n = ECO.setHave(s, st), r = ECO.setReward(st), paid = s.sets[st.key];
        h += `<a class="dec${paid ? " paid" : ""}" href="#cards-album-${C.key}${st.decade === "all" ? "" : "_" + st.decade}"><b>${st.decade === "all" ? "Every card" : st.decade + "s"}</b><small>${n}/${st.keys.length} · album</small><em>${paid ? "Paid ✓" : cgRewardText(r)}</em></a>`;
      }
      h += `</div></details>`;
    }
    h += `</div>`;
  }
  h += `</div>` + cgBackup();
  return h;
}
function cgFrame(f) { const s = CGSAVE.load(); if (ECO.FRAMES.some(x => x.key === f && ECO.levelOf(s.xp) >= x.L)) { s.frame = f; CGSAVE.save(); route(); } }
// base cards: one team set per team per season, and each season's whole base set
function cgBaseSets(s) {
  if (!CG.base.length) return "";
  const seasons = {};
  for (const st of CG.sets) { if (st.kind !== "team" && st.kind !== "season") continue; const S = seasons[st.season] || (seasons[st.season] = { team: [], season: null }); if (st.kind === "team") S.team.push(st); else S.season = st; }
  const ys = Object.keys(seasons).map(Number).sort((a, b) => b - a), haveIn = st => ECO.setHave(s, st);
  const started = ys.filter(y => seasons[y].season && haveIn(seasons[y].season) > 0), done = Object.keys(s.sets).filter(k => k.startsWith("team@")).length;
  let h = `<h3>Base set & team sets</h3><p class="m small">Every player's base card for every season is in Standard and decade packs (two per pack) and in the Team pack. Finish a team's roster for a season for 2× what the cards would sell for plus a pack; finish a whole season's base set for a Legends pack. ${done ? `You've finished ${done} team set${done === 1 ? "" : "s"}.` : ""}</p>`;
  if (!started.length) return h + `<p class="m small">No base cards yet.</p>`;
  h += `<div class="sets">`;
  for (const y of started) {
    const S = seasons[y], n = haveIn(S.season), tot = S.season.keys.length;
    h += `<details class="setr${n === tot ? " done" : ""}"><summary><span>${y} base set</span><i class="prog"><em style="width:${(n / tot * 100).toFixed(1)}%"></em></i><small>${n}/${tot}</small></summary><div class="decs">`;
    for (const st of S.team.sort((a, b) => haveIn(b) / b.keys.length - haveIn(a) / a.keys.length || teamName(a.team).localeCompare(teamName(b.team)))) {
      const k = haveIn(st), paid = s.sets[st.key];
      h += `<a class="dec${paid ? " paid" : ""}" href="#cards-team-${y}_${st.team}"><b>${esc(teamName(st.team))}</b><small>${k}/${st.keys.length}</small><em>${paid ? "Paid ✓" : cgRewardText(ECO.setReward(st))}</em></a>`;
    }
    h += `<a class="dec${s.sets[S.season.key] ? " paid" : ""}" href="#cards-team-${y}"><b>Whole season</b><small>${n}/${tot}</small><em>${s.sets[S.season.key] ? "Paid ✓" : cgRewardText(ECO.setReward(S.season))}</em></a></div></details>`;
  }
  return h + `</div>`;
}
// ---------- album pages: every card in a set, with empty slots for the missing ones ----------
function cgAlbum(list, title, sub, back, extra) {
  const s = CGSAVE.load(), have = list.filter(c => s.owned[pcKey(c)]).length; pcSetList(list, "album");
  let h = `<p><a href="${back}">← Back</a></p><div class="vh"><h2>${esc(title)}</h2><span class="m">${have} of ${list.length}</span></div><p class="m small">${sub}</p>${extra || ""}<i class="prog big"><em style="width:${(have / Math.max(1, list.length) * 100).toFixed(1)}%"></em></i>`;
  h += `<div class="cgrid album">${list.map((c, i) => s.owned[pcKey(c)] ? pcTile(c, i, `${c.season}${c.col === "base" ? "" : ""}`, "album") : `<button class="slot t-${c.tier.key}" onclick="pcOpen(${i},'album')"><span class="gem t-${c.tier.key}"></span><b>${esc(c.name)}</b><small>${c.season} · ${c.ovr} OVR</small><small>${esc(c.tier.name)}</small></button>`).join("")}</div>`;
  return h;
}
function cgAlbumPage(all, arg) {
  cgPrep(all); const [col, dec] = String(arg || "").split("_"), C = CC.CBY[col]; if (!C) return `<p>Unknown collection.</p>`;
  const list = all.filter(c => c.col === col).sort((a, b) => a.season - b.season || (a.rank || 99) - (b.rank || 99) || b.ovr - a.ovr);
  const decs = [...new Set(list.map(c => Math.floor(c.season / 10) * 10))].sort((a, b) => a - b), d = dec ? +dec : decs[0];
  const sel = decs.length > 1 ? `<div class="seg">${decs.map(x => `<a class="${x === d ? "on" : ""}" href="#cards-album-${col}_${x}">${x}s</a>`).join("")}</div>` : "";
  const st = CG.setBy.get(`${col}@${d}`), r = st ? ECO.setReward(st) : null, paid = st && CGSAVE.load().sets[st.key];
  return cgAlbum(list.filter(c => Math.floor(c.season / 10) * 10 === d), `${C.name} · ${d}s`, `${esc(C.blurb || "")} ${st ? (paid ? "Set reward paid ✓" : `Finish this page for ${cgRewardText(r)}.`) : ""}`, "#cards-mine", sel);
}
function cgTeamPage(arg) {
  const [y, team] = String(arg || "").split("_"); cgPrep(CG.all || []);
  const list = CG.base.filter(c => c.season === +y && (!team || c.teamId === team)).sort((a, b) => team ? b.ovr - a.ovr : teamName(a.teamId).localeCompare(teamName(b.teamId)) || b.ovr - a.ovr);
  if (!list.length) return `<p>No base cards for that.</p>`;
  const st = CG.setBy.get(team ? `team@${y}@${team}` : `base@${y}`), paid = st && CGSAVE.load().sets[st.key];
  return cgAlbum(list, team ? `${y} ${teamName(team)}` : `${y} base set`, `${team ? "The team set: everyone who played for them that season." : "Every player's base card from the season."} ${st ? (paid ? "Set reward paid ✓" : `Finish it for ${cgRewardText(ECO.setReward(st))}.`) : ""}`, "#cards-mine");
}
function cgSell(which, btn) {
  const s = CGSAVE.load(); let sp = cgSpares(s); if (which === "low") sp = sp.filter(c => TIX(c.tier.key) <= TIX("gold"));
  if (btn && sp.some(c => TIX(c.tier.key) >= TIX("ruby")) && !btn.dataset.sure) { btn.dataset.sure = 1; btn.innerHTML = "This sells Ruby-or-better spares too. Tap again to sell"; return; }
  const r = ECO.sell(s, sp.map(ecoCard)); CGSAVE.save();
  if (r.n) { SFX.coin(); cgToast(`Sold ${r.n} spare${r.n === 1 ? "" : "s"} for ${coinH(r.coins)}`); }
  route();
}
function cgExchange(key, btn) {
  const s = CGSAVE.load(), ex = ECO.EXCHANGES.find(e => e.key === key), cards = cgSpares(s);
  const uniq = [...new Map(cards.map(c => [pcKey(c), c])).values()].map(ecoCard), take = ECO.exchangeTake(s, ex, uniq); if (!take) return;
  if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = "Confirm"; btn.title = take.map(t => { const c = CG.byKey.get(t.key); return `${c.name} ${c.season} (${c.ovr})`; }).join(", "); cgToast(`Trades: ${esc(take.map(t => { const c = CG.byKey.get(t.key); return `${c.name} ${c.season}`; }).join(", "))}. Tap Confirm.`); return; }
  const lv = ECO.levelOf(s.xp); ECO.exchange(s, ex, uniq); const ach = cgAch(s); CGSAVE.save(); SFX.coin();
  const P = cgPackDef(ex.gives) || ECO.XPACKS[ex.gives]; cgToast(`Traded for a ${esc(P.name)}. <a href="#cards-packs">Open it in Packs</a>`, "gold");
  if (ECO.levelOf(s.xp) > lv) cgToast(`<b>Level ${ECO.levelOf(s.xp)}!</b> Check your packs.`, "gold");
  cgAchToasts(ach); route();
}
// ---------- the card viewer: your copies of this card ----------
function cgCardBox(c) {
  if (!c || c.upcoming) return "";
  const s = CGSAVE.load(), k = pcKey(c), L = s.owned[k] ? ECO.copiesOf(s, k) : [];
  if (!L.length) return `<p class="m small">Not in your collection yet.</p>`;
  const tier = c.tier.key, base = c.col === "base", shelf = new Set(s.shelf || []);
  let h = `<div class="copies"><b>Your copies · ${L.length}</b>`;
  L.forEach((cp, i) => {
    const on = cp === c.cp, star = shelf.has(k + "|" + cp);
    h += `<div class="cprow${on ? " on" : ""}"><button class="linkbtn" onclick="cgViewCopy('${k}',${i})" title="Show this copy">${cgChips(cp, false)} <span>${esc(ECO.copyName(cp))}</span></button><small>${coinH(ECO.copyValue(tier, cp, base))}</small><button class="star${star ? " on" : ""}" onclick="cgShelf('${k}','${cp}')" title="${star ? "Take off" : "Put on"} your showcase">★</button>${L.length > 1 ? `<button class="sm ghost" onclick="cgSellCopy('${k}',${i},this)">Sell</button>` : ""}</div>`;
  });
  const o = c.cp ? ECO.parseCopy(c.cp) : null;
  if (o && o.patch != null && L.includes(c.cp)) { h += `<p class="m small" id="patchinfo">Looking up the game…</p>`; setTimeout(() => cgPatchInfo(c, o.patch), 0); }
  return h + `<small class="m">You keep your best copy when you sell spares from the trade desk.</small></div>`;
}
function cgViewCopy(k, i) { const s = CGSAVE.load(), L = ECO.copiesOf(s, k); if (L[i]) { CG.viewCp[k] = L[i]; pcOpen(PC.at); } }
function cgShelf(k, cp) { const s = CGSAVE.load(), r = ECO.shelfToggle(s, k, cp); CGSAVE.save(); if (r !== null) cgToast(r ? "On your showcase ★" : "Off your showcase"); CG.viewCp[k] = cp; pcOpen(PC.at); }
function cgSellCopy(k, i, btn) {
  const s = CGSAVE.load(), c = CG.byKey && CG.byKey.get(k), L = ECO.copiesOf(s, k), cp = L[i]; if (!c || !cp) return;
  if ((ECO.special(cp) || TIX(c.tier.key) >= TIX("ruby")) && !btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = `Sell for ${fmtN(ECO.copyValue(c.tier.key, cp, c.col === "base"))}? Tap again`; return; }
  const r = ECO.sellCopy(s, k, c.tier.key, i); if (!r) return; CGSAVE.save(); SFX.coin(); cgToast(`Sold ${esc(ECO.copyName(r.cp))} for ${coinH(r.coins)}`);
  if (CG.viewCp[k] === r.cp) delete CG.viewCp[k]; pcOpen(PC.at);
}
// a game-worn patch: the game it came from (one the player dressed for that season)
async function cgPatchInfo(c, n) {
  const el = () => $("patchinfo");
  try {
    const S = await season(c.season), gs = (S.games || []).filter(g => (g[9] || []).includes(c.pid) || (g[10] || []).includes(c.pid));
    if (!gs.length) { if (el()) el().textContent = "Game-worn in the " + c.season + " season."; return; }
    const g = gs[n % gs.length], regDays = Math.max(...S.games.filter(x => !x[8]).map(x => x[1])) + 1, cal = CC.seasonCalendar(S.season, regDays), dt = new Date(cal.date(g[1]) + "T12:00:00Z");
    if (el()) el().innerHTML = `Game-worn: ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}${g[8] ? " (playoffs)" : ""}, ${esc(TB[g[3]] ? TB[g[3]].name : g[3])} ${g[6]} at ${esc(TB[g[2]] ? TB[g[2]].name : g[2])} ${g[5]}. <a href="#watch-${c.season}-${g[0]}" onclick="pcClose()">Watch it</a>`;
  } catch (e) { if (el()) el().textContent = "Game-worn in the " + c.season + " season."; }
}

// ---------- save codes: move your collection to another device ----------
function cgBackup() {
  return `<h3>Move to another device</h3><div class="backup"><p class="m small">Your coins and cards live in this browser. Make a save code here and load it on your other device.</p>
    <div class="row"><button onclick="cgExport()">Make a save code</button><button class="ghost" onclick="cgShowImport()">Load a save code</button></div>
    <div id="cgcode"></div>
    <p class="m small"><button class="linkbtn" onclick="if(this.dataset.sure){CGSAVE.replace(ECO.newSave(Date.now()));route()}else{this.dataset.sure=1;this.textContent='Tap again to erase every card and coin on this device'}">Start over</button></p></div>`;
}
async function cgCode() {
  const json = ECO.packSave(CGSAVE.load()), jb = ECO.utf8(json);
  if (typeof CompressionStream !== "undefined") {
    try { const z = new Uint8Array(await new Response(new Blob([jb]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer()); return ECO.wrapCode("z", z, jb); } catch (e) { /* plain code below */ }
  }
  return ECO.wrapCode("j", jb, jb);
}
async function cgExport() {
  const code = await cgCode(), box = $("cgcode"); if (!box) return;
  box.innerHTML = `<textarea readonly rows="4">${esc(code)}</textarea><div class="row"><button onclick="cgCopy()">Copy</button><button class="ghost" onclick="cgDownload()">Download</button><small class="m">${fmtN(code.length)} characters</small></div>`;
  CG.code = code;
}
function cgCopy() { const t = document.querySelector("#cgcode textarea"); if (!t) return; (navigator.clipboard ? navigator.clipboard.writeText(t.value) : Promise.reject()).then(() => cgToast("Save code copied"), () => { t.select(); document.execCommand && document.execCommand("copy"); cgToast("Save code selected"); }); }
function cgDownload() { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([CG.code || ""], { type: "text/plain" })); a.download = `ubl-save-${ECO.dayKey(new Date())}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
function cgShowImport() {
  const box = $("cgcode"); if (!box) return;
  box.innerHTML = `<textarea rows="4" placeholder="Paste a save code (UBL1-…)"></textarea><div class="row"><button onclick="cgImport(this)">Load</button><label class="btn ghost">Open a file<input type="file" accept=".txt,text/plain" hidden onchange="cgImportFile(this)"></label></div><p class="m small" id="cgimsg"></p>`;
}
function cgImportFile(inp) { const f = inp.files && inp.files[0]; if (!f) return; f.text().then(t => { const ta = document.querySelector("#cgcode textarea"); ta.value = t.trim(); cgImport(document.querySelector("#cgcode button")); }); }
async function cgImport(btn) {
  const ta = document.querySelector("#cgcode textarea"), msg = $("cgimsg");
  try {
    const rd = ECO.readCode(ta.value); let jb = rd.bytes;
    if (rd.mode === "z") {
      if (typeof DecompressionStream === "undefined") throw new Error("This browser can't read compressed codes. Make the code on a newer browser.");
      jb = new Uint8Array(await new Response(new Blob([rd.bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    }
    ECO.checkCode(rd.crc, jb);
    const ns = ECO.unpackSave(ECO.unutf8(jb)), n = Object.keys(ns.owned).length;
    if (!btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = "Replace this device's collection"; msg.innerHTML = `This code holds <b>${fmtN(n)}</b> cards and ${coinH(ns.coins)}. Loading it replaces everything on this device.`; return; }
    CGSAVE.replace(ns); SFX.coin(); cgToast(`Loaded ${fmtN(n)} cards and ${coinH(ns.coins)}`); route();
  } catch (e) { msg.textContent = e.message || "That code didn't work."; }
}

// ---------- styles ----------
(function () {
  const st = document.createElement("style");
  st.textContent = `.coin{display:inline-block;width:.95em;height:.95em;border-radius:50%;vertical-align:-.12em;margin-right:.28em;background:radial-gradient(circle at 35% 30%,#fff3b0,#f2c230 45%,#a8740a 80%);box-shadow:inset 0 0 0 1.5px #8a5d04,0 1px 2px rgba(0,0,0,.4)}
.coinv{font-weight:700;white-space:nowrap;font-variant-numeric:tabular-nums}
.wallet{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:6px 0 10px;padding:10px 12px;border-radius:12px;background:linear-gradient(120deg,#1d2433,#141922);border:1px solid #2b3445}
.wallet .coinv{font:700 22px Oswald,sans-serif;color:#ffe08a}
.homestrip{display:flex;align-items:center;gap:12px;margin:8px 0;padding:10px 12px;border-radius:12px;background:linear-gradient(120deg,#1d2433,#141922);border:1px solid #2b3445;color:var(--ink)}
.homestrip .coinv{font:700 19px Oswald,sans-serif;color:#ffe08a}.homestrip b{margin-left:auto;font:700 14px Oswald,sans-serif}
.homestrip .dot{color:#35eaa3;font-weight:700;font-size:13px}.homestrip .dot:before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:#35eaa3;margin-right:6px;box-shadow:0 0 8px #35eaa3;animation:cgpulse 1.2s infinite}
@keyframes cgpulse{50%{opacity:.35}}
.welcome{margin:6px 0 10px;padding:10px 12px;border-radius:12px;background:#132a20;border:1px solid #2f7a55;font-size:13.5px}
.daily{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;padding:12px;border-radius:12px;background:linear-gradient(120deg,#2a1f06,#1a1407);border:1px solid #6b5313;margin-bottom:6px}
.daily b{font:700 16px Oswald,sans-serif}.daily small{display:block;color:var(--mut);font-size:12px}
.daily .streak{grid-column:1/-1;display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.daily .streak span{display:flex;flex-direction:column;align-items:center;padding:5px 0;border-radius:8px;background:#211a0a;border:1px solid #3a2e10}
.daily .streak span b{font-size:13px}.daily .streak span small{font-size:10px}
.daily .streak span.got{background:#4a3a0e;border-color:#c99a06}.daily .streak span.now{border-color:#ffe08a;box-shadow:0 0 0 1px #ffe08a inset;animation:cgpulse 1.4s infinite}
.daily .btn{grid-row:1;grid-column:2}.daily.done{opacity:.85}
.packt{position:relative}.packt .price{font-style:normal;font-size:13px;margin-top:2px}.packt .price.short{opacity:.5}.packt .price.free{color:#35eaa3;font-weight:700}
.packt.off{opacity:.45;cursor:not-allowed}.packt .cnt{position:absolute;top:6px;right:8px;background:#35eaa3;color:#062b1b;font:700 13px Oswald,sans-serif;border-radius:999px;padding:1px 8px;font-style:normal}
.packt .pk{position:relative}
.chall{display:flex;flex-direction:column;gap:6px}.ch{display:grid;grid-template-columns:1fr;gap:4px;padding:9px 11px;border-radius:10px;background:#161b24;border:1px solid #262e3b}
.ch b{font-size:13.5px}.ch small{display:block;color:var(--mut);font-size:12px}.ch.done{border-color:#2f7a55;background:#11241b}.ch.done b:after{content:" ✓";color:#35eaa3}
.tgls{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px}.tgl{display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:#161b24;border:1px solid #262e3b;cursor:pointer}
.tgl input{margin-top:3px;accent-color:#35eaa3}.tgl b{display:block;font-size:13.5px}.tgl small{color:var(--mut);font-size:12px}
.desk{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}.dk{padding:12px;border-radius:12px;background:#161b24;border:1px solid #262e3b;display:flex;flex-direction:column;gap:7px}
.dk>b{font:700 16px Oswald,sans-serif}.dk>small{color:var(--mut);font-size:12.5px}.dk .row{display:flex;gap:6px;flex-wrap:wrap}.dk button.warn{background:#5a1a22}
.tchip small{color:var(--mut);margin-left:4px;font-size:10.5px}
.ex{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-top:1px solid #232a35;font-size:13px}.ex small{display:block;color:var(--mut);font-size:11.5px}
.ex button{min-width:74px}
.setr{display:block;padding:6px 0;border-top:1px solid #232a35}.setr summary{display:grid;grid-template-columns:1fr 90px 64px;gap:8px;align-items:center;cursor:pointer;list-style:none;font-size:13px}
.setr summary::-webkit-details-marker{display:none}.setr.done summary span:after{content:" ✓";color:#35eaa3}.setr summary small{text-align:right;color:var(--mut)}
.decs{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:5px;margin:7px 0 3px}
.dec{display:flex;flex-direction:column;padding:7px 9px;border-radius:9px;background:#11151c;border:1px solid #262e3b;color:var(--ink);font-size:12px}.dec small{color:var(--mut)}.dec em{font-style:normal;font-size:11.5px;margin-top:2px}
.dec.paid{border-color:#2f7a55}.dec.paid em{color:#35eaa3}
.ownline{font-size:13.5px}.backup textarea,#cgcode textarea{width:100%;box-sizing:border-box;background:#0d1117;color:var(--ink);border:1px solid #2b3445;border-radius:8px;padding:8px;font:12px ui-monospace,monospace;word-break:break-all}
.backup .row,#cgcode .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0}
#cgtoast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:90;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none;width:min(92vw,460px)}
.cgt{pointer-events:auto;background:#1b2230;border:1px solid #33405a;color:var(--ink);padding:9px 14px;border-radius:12px;font-size:13.5px;box-shadow:0 8px 24px rgba(0,0,0,.5);animation:cgtin .25s ease-out;transition:opacity .4s,transform .4s;text-align:center}
.cgt.gold{border-color:#c99a06;background:#2a2106}.cgt.bad{border-color:#a3263a;background:#2a0f14}.cgt.out{opacity:0;transform:translateY(8px)}.cgt a{color:#ffe08a}
@keyframes cgtin{from{opacity:0;transform:translateY(10px)}}
.pullsum{display:flex;flex-direction:column;gap:4px;margin:10px 0 0;padding:10px 12px;border-radius:12px;background:#161b24;border:1px solid #262e3b;font-size:13.5px}.pullsum[hidden]{display:none!important}.pullsum .gold{color:#ffe08a}
.pullbar .coinv{font-weight:600}
/* the tier tease */
.tearwrap{--glow:transparent;--amp:1px;--dur:1s}
.tearwrap .tear{transition:filter .3s}
.tearwrap.charge .tear{animation:pkcharge var(--dur) ease-in forwards}
@keyframes pkcharge{0%{transform:none;filter:drop-shadow(0 0 0 var(--glow))}
20%{transform:translate(calc(var(--amp)*-1),var(--amp)) rotate(-1deg)}30%{transform:translate(var(--amp),calc(var(--amp)*-1)) rotate(1deg)}
40%{transform:translate(calc(var(--amp)*-2),var(--amp)) rotate(-1.5deg) scale(1.02);filter:drop-shadow(0 0 18px var(--glow)) brightness(1.1)}
55%{transform:translate(calc(var(--amp)*2),calc(var(--amp)*-2)) rotate(2deg) scale(1.04)}70%{transform:translate(calc(var(--amp)*-3),calc(var(--amp)*2)) rotate(-2.5deg) scale(1.06);filter:drop-shadow(0 0 34px var(--glow)) drop-shadow(0 0 60px var(--glow)) brightness(1.25)}
85%{transform:translate(calc(var(--amp)*3),calc(var(--amp)*-3)) rotate(3deg) scale(1.09)}100%{transform:scale(1.12);filter:drop-shadow(0 0 50px var(--glow)) drop-shadow(0 0 90px var(--glow)) brightness(1.6)}}
.tearwrap.charge.go .tear{animation:pktear .45s ease-in forwards}
.flash{position:fixed;inset:0;z-index:95;pointer-events:none;mix-blend-mode:screen;animation:cgflash .7s ease-out forwards}@keyframes cgflash{from{opacity:.95}to{opacity:0}}
/* arcade callouts */
.cgcalls{position:fixed;inset:0;z-index:92;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}
.cgcall{display:flex;flex-direction:column;align-items:center;transform:skewX(-8deg);animation:cgpop .45s cubic-bezier(.2,1.6,.4,1) both;transition:opacity .4s,transform .4s;text-align:center;padding:0 10px}
.cgcall b{font:700 clamp(44px,15vw,104px)/.9 Oswald,sans-serif;letter-spacing:2px;color:#fff;-webkit-text-stroke:2px rgba(0,0,0,.65);paint-order:stroke fill;text-shadow:0 0 18px var(--cc,#ffe08a),0 0 40px var(--cc,#ffe08a),0 6px 0 rgba(0,0,0,.6);background:linear-gradient(180deg,#fff 20%,var(--cc,#ffe08a) 85%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.cgcall small{margin-top:6px;font:700 clamp(15px,4.4vw,22px) Oswald,sans-serif;letter-spacing:.6px;color:#fff;background:rgba(0,0,0,.6);padding:4px 12px;border-radius:6px;text-shadow:0 2px 0 #000}
.cgcall.out{opacity:0;transform:skewX(-8deg) scale(1.25)}
@keyframes cgpop{0%{transform:skewX(-8deg) scale(2.4);opacity:0}60%{opacity:1}100%{transform:skewX(-8deg) scale(1)}}
.cgcall.t-emerald{--cc:#35eaa3}.cgcall.t-sapphire{--cc:#5aa5ff}.cgcall.t-ruby{--cc:#ff5571}.cgcall.t-amethyst{--cc:#c08cff}.cgcall.t-diamond{--cc:#c9f4ff}.cgcall.t-opal{--cc:#ff9be0}.cgcall.t-vulcan{--cc:#ff6a1f}.cgcall.t-gold{--cc:#ffd34d}
.cgcall.t-opal b{background:linear-gradient(90deg,#ff8fd8,#8fd3ff,#b6ffd0,#ffe58f,#d79bff);-webkit-background-clip:text;background-clip:text;animation:cgpop .45s cubic-bezier(.2,1.6,.4,1) both,cghue 1.2s linear infinite}
.cgcall.t-vulcan b{animation:cgpop .45s cubic-bezier(.2,1.6,.4,1) both,cgshake .09s linear infinite}
@keyframes cghue{to{filter:hue-rotate(360deg)}}@keyframes cgshake{25%{translate:2px -1px}50%{translate:-2px 1px}75%{translate:1px 2px}}
/* the walkout */
.wkov{position:fixed;inset:0;z-index:96;background:#020305;animation:cgtin .25s ease-out;transition:opacity .3s}.wkov.out{opacity:0}
.wkov canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.wk-n,.wk-t{position:absolute;left:0;right:0;text-align:center;pointer-events:none;opacity:0;transition:opacity .4s,transform .5s;transform:translateY(10px)}
.wk-n{top:max(18px,env(safe-area-inset-top))}.wk-n b{display:block;font:700 clamp(30px,9vw,56px)/1 Oswald,sans-serif;letter-spacing:1px;color:#fff;text-shadow:0 0 20px rgba(0,0,0,.9)}
.wk-n small{font:600 13px Inter,sans-serif;color:#cfd6e0;letter-spacing:1.5px;text-transform:uppercase}
.wk-t{bottom:max(64px,calc(env(safe-area-inset-bottom) + 48px))}.wk-t b{display:block;font:700 clamp(40px,13vw,88px)/.9 Oswald,sans-serif;transform:skewX(-8deg);color:#fff;-webkit-text-stroke:2px rgba(0,0,0,.6);paint-order:stroke fill;text-shadow:0 0 24px var(--cc),0 0 50px var(--cc)}
.wk-t small{font:700 15px Oswald,sans-serif;color:#fff;letter-spacing:1px}
.wkov.lit .wk-n,.wkov.posed .wk-t{opacity:1;transform:none}
.wkov.t-ruby{--cc:#ff5571}.wkov.t-amethyst{--cc:#c08cff}.wkov.t-diamond{--cc:#8fdcff}.wkov.t-opal{--cc:#ff9be0}.wkov.t-vulcan{--cc:#ff6a1f}
.wk-skip{position:absolute;right:12px;bottom:max(14px,env(safe-area-inset-bottom));background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:7px 14px;font:600 13px Inter,sans-serif}
/* deeper collecting */
.lvchip{display:inline-flex;align-items:center;padding:2px 9px;border-radius:999px;background:linear-gradient(120deg,#3b2a7a,#1f4f9e);color:#fff;font:700 12px Oswald,sans-serif;letter-spacing:.5px;border:1px solid #5a6fd6}
.wallet .lvchip{margin-left:auto}
.meters{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin:8px 0}
.cgm{padding:10px 12px;border-radius:12px;background:#161b24;border:1px solid #262e3b;display:flex;flex-direction:column;gap:5px}
.cgm .mh{display:flex;justify-content:space-between;align-items:baseline}.cgm .mh b{font:700 15px Oswald,sans-serif}.cgm .mh small{color:var(--mut);font-size:12px}
.cgm>small{font-size:11.5px}.cgm .prog{height:8px;margin:0}
.cgm.lv .prog em{background:linear-gradient(90deg,#5a6fd6,#9b7bff)}.cgm.pity .prog em{background:linear-gradient(90deg,#3a86a8,#c9f4ff)}
.cgm.pity.full{border-color:#8fdcff;box-shadow:0 0 0 1px #8fdcff inset,0 0 18px rgba(143,220,255,.25)}
.btn.ghost{color:var(--ink)!important}
.weekrow{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:10px;align-items:start}@media(max-width:640px){.weekrow{grid-template-columns:1fr}}
.featban{display:flex;gap:12px;padding:12px;border-radius:12px;background:linear-gradient(120deg,#3a2606,#151007);border:1px solid #8a6514}
.featban .mini{width:96px;flex:none;filter:drop-shadow(0 6px 12px rgba(0,0,0,.5))}.featban small{color:#ffd166;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase}
.featban b{display:block;font:700 22px Oswald,sans-serif}.featban p{margin:4px 0 8px;font-size:12.5px;color:#d6dbe3}
.packs.wk{margin:0}.packt.timed .pk:after{content:"LIMITED";position:absolute;left:8px;top:8px;background:#ff3fa4;color:#fff;font:700 10px Inter,sans-serif;padding:2px 7px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.5)}
.packt .lock{position:absolute;inset:auto 0 40% 0;margin:auto;width:max-content;background:rgba(0,0,0,.75);color:#fff;font:700 14px Oswald,sans-serif;padding:4px 12px;border-radius:999px;font-style:normal;border:1px solid #fff3}
.btn.sm,button.sm{padding:4px 10px;font-size:12px}
.vc{display:inline-block;font:700 10px/1.5 Inter,sans-serif;font-style:normal;padding:0 6px;border-radius:5px;margin-right:3px;color:#fff;background:#3a4252;letter-spacing:.3px;white-space:nowrap}
.vc.p-B{background:#1f5fd6}.vc.p-G{background:linear-gradient(120deg,#a87400,#ffd54a,#a87400);color:#2a1d00}.vc.p-R{background:#c8102e}.vc.p-K{background:#050507;border:1px solid #6f7480}
.vc.p-S{background:linear-gradient(90deg,#ff8fd8,#8fd3ff,#b6ffd0,#ffe27a,#d79bff);color:#1a1020;animation:cghue 2.4s linear infinite}
.vc.au{background:#f6f1e4;color:#1d3fbf}.vc.pa{background:#7a1f2b;background:repeating-linear-gradient(45deg,#8a2433 0 3px,#6a1824 3px 6px)}.vc.gr{background:#262e3b;color:#cfd6e0}.vc.gr.gm{background:#10b981;color:#02140d}
.pslot .vline{display:flex;flex-wrap:wrap;gap:2px;min-height:15px}
.pslot.var .fcard{box-shadow:0 0 0 2px #ffe27a,0 0 24px rgba(255,226,122,.45);border-radius:7%}
.pslot.p-S .fcard{animation:cghue 3s linear infinite}
.tearwrap.fancy .tear{filter:drop-shadow(0 0 22px #ffe27a) drop-shadow(0 0 40px #ff8fd8)}
.pickh{text-align:center;margin:0}.pickp{text-align:center;margin:2px 0 6px}
.pick3 .keep{margin-top:4px;padding:8px 0;font:700 15px Oswald,sans-serif;letter-spacing:1px;background:#35eaa3;color:#062b1b;border:0;border-radius:8px}
.pick3 .pslot.gone .fcard,.pick3 .pslot.gone .pl{opacity:.25;filter:grayscale(.8);transition:opacity .5s}.pick3 .pslot.kept .fcard{box-shadow:0 0 0 3px #35eaa3,0 0 28px rgba(53,234,163,.6);border-radius:7%}
.welcome.pickwait{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:#0d2a3a;border-color:#2b8ac2}
.pullsum .var{display:flex;align-items:center;gap:3px;color:#ffe9a8}.pullsum .lvup{color:#b7c3ff;font-weight:700}
.collector{display:flex;gap:12px;align-items:stretch;padding:12px;border-radius:14px;background:linear-gradient(120deg,#1b1840,#121826);border:1px solid #3b3f7a;margin:6px 0}
.lvbig{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:74px;border-radius:12px;background:linear-gradient(160deg,#5a6fd6,#3b2a7a);box-shadow:inset 0 0 0 1px #fff3}
.lvbig b{font:700 38px/1 Oswald,sans-serif}.lvbig small{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#dfe4ff}
.cstats{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}.cstats .kv{margin:0}.score small{color:var(--mut);font-size:11px;text-transform:uppercase;letter-spacing:1px}.score b{display:block;font:700 26px Oswald,sans-serif;color:#ffe08a}
.shelf{padding:14px 12px 18px;border-radius:12px;margin-bottom:6px}
.shelf .cgrid{margin:0}
.shelf.fr-wood{background:linear-gradient(#0000 calc(100% - 16px),#5a3a1e calc(100% - 16px),#3a2412),#1a140f;border:1px solid #5a3a1e}
.shelf.fr-glass{background:linear-gradient(160deg,#ffffff14,#ffffff05),#10161f;border:1px solid #8fb4d6;box-shadow:inset 0 1px 0 #fff4}
.shelf.fr-gold{background:radial-gradient(circle at 50% 0,#4a3608,#140f04);border:2px solid #c9a227;box-shadow:inset 0 0 30px rgba(201,162,39,.25)}
.shelf.fr-neon{background:#08060f;border:2px solid #ff3fa4;box-shadow:0 0 14px #ff3fa4,inset 0 0 18px #7a2bff}
.shelf.fr-vault{background:repeating-linear-gradient(90deg,#1b1f26 0 18px,#222833 18px 20px),#1b1f26;border:3px solid #6f7480;box-shadow:inset 0 0 40px #000}
.achs summary{cursor:pointer;list-style:none}.achs summary::-webkit-details-marker{display:none}.achs summary h3:after{content:" ▾";color:var(--mut)}
.achg{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px}
.ach{padding:8px 10px;border-radius:10px;background:#12161d;border:1px solid #232a35;opacity:.6;display:flex;flex-direction:column;gap:2px}.ach b{font-size:13px}.ach small{color:var(--mut);font-size:11.5px}.ach em{font-style:normal;font-size:11px}
.ach.done{opacity:1;border-color:#c99a06;background:linear-gradient(140deg,#2a2106,#141007)}.ach.done b:before{content:"🏅 "}
.cgrid.album{margin-top:8px}.slot{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;aspect-ratio:250/350;border-radius:9%;border:2px dashed #2f3746;background:#0f1319;color:var(--mut);padding:8px;text-align:center;cursor:pointer}
.slot b{font-size:12px;color:#aeb7c4}.slot small{font-size:10.5px}.slot .gem{opacity:.6}
.prog.big{height:8px;margin:6px 0}
.seg a{padding:5px 10px;border-radius:7px;color:var(--ink);font-size:12.5px}.seg a.on{background:#2b3445}
.copies{margin:8px 0;padding:10px 12px;border-radius:12px;background:#161b24;border:1px solid #262e3b;display:flex;flex-direction:column;gap:5px}
.cprow{display:grid;grid-template-columns:1fr auto auto auto;gap:6px;align-items:center;font-size:12.5px;padding:3px 0;border-top:1px solid #232a35}.cprow.on{background:#1d2533;border-radius:6px}
.cprow .linkbtn{text-align:left;display:flex;align-items:center;flex-wrap:wrap;gap:2px}.cprow .star{background:none;border:0;color:#4b5566;font-size:17px;padding:0 4px;cursor:pointer}.cprow .star.on{color:#ffd34d}
.slab{margin:0 auto 6px;max-width:330px;display:grid;grid-template-columns:auto 1fr auto;gap:2px 8px;align-items:center;padding:6px 10px;border-radius:8px;background:linear-gradient(180deg,#f4f6fa,#d9dee6);color:#14181f;border:2px solid #aab3c0;box-shadow:0 4px 14px rgba(0,0,0,.4)}
.slab span{font:700 9px Inter,sans-serif;letter-spacing:1.4px;color:#b3122b;grid-row:1/3}.slab b{font:700 12px Inter,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.slab em{font:700 11px Oswald,sans-serif;font-style:normal;text-align:right;grid-row:1/3;grid-column:3}.slab em strong{font-size:22px;margin-left:3px}
.slab small{font-size:10.5px;color:#3a4252;grid-column:2}.slab.gm{border-color:#10b981}.slab.gm em strong{color:#059669}.slab+.cm-top{margin-top:0}
.slab.p-S{border-image:linear-gradient(90deg,#ff8fd8,#8fd3ff,#b6ffd0,#ffe27a) 1}.slab.p-K{background:linear-gradient(180deg,#2a2d35,#0b0c0f);color:#eef1f6}.slab.p-K small{color:#aab3c0}
.ctile .vtag{position:absolute;left:30%;right:30%;top:3%;display:flex;flex-wrap:wrap;justify-content:center;gap:2px;pointer-events:none}.ctile .vtag .vc{font-size:9px;box-shadow:0 1px 4px rgba(0,0,0,.6)}
@media (prefers-reduced-motion:reduce){.tearwrap.charge .tear,.cgcall,.cgcall b,.vc.p-S,.pslot.p-S .fcard{animation:none!important}}`;
  document.head.appendChild(st);
})();
