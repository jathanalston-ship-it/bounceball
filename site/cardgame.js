// ===================== THE CARD CGSAVE: coins, the pack store, the trade desk, the pack-opening show =====================
// One save in this browser (ubl-game-v1). The rules live in src/cardeco.js (BB.ECO); this file draws
// the store, dailies and challenges, the trade desk (quick-sell, exchanges, sets, save codes) and the
// pack opening: the tier tease, arcade callouts, synthesized sound, and 3D walkouts for Ruby and up.
"use strict";
const ECO = BB.ECO;
const ecoCard = c => ({ key: pcKey(c), tier: c.tier.key, col: c.col, season: c.season, ovr: c.ovr });
const fmtN = n => Math.round(n).toLocaleString("en-US");
const coinH = n => `<span class="coinv"><i class="coin"></i>${fmtN(n)}</span>`;
const TIX = k => CC.TIERS.findIndex(t => t.key === k);

// ---------- the save ----------
const CGSAVE = {
  k: "ubl-game-v1", d: null,
  load() {
    if (this.d) return this.d;
    let d = null, fresh = false; try { d = JSON.parse(localStorage.getItem(this.k)); } catch (e) { d = null; }
    if (!d || d.v !== 1) { let old = null; try { old = JSON.parse(localStorage.getItem("ubl-cards-v1")); } catch (e) { old = null; } d = ECO.migrate(old, Date.now()); fresh = true; }
    const b = ECO.newSave(Date.now());
    this.d = Object.assign(b, d, { opts: Object.assign(b.opts, d.opts || {}), daily: Object.assign(b.daily, d.daily || {}), tokens: Object.assign({}, d.tokens || {}), sets: Object.assign({}, d.sets || {}) });
    if (fresh) { this.d.welcome = 1; this.save(); }
    return this.d;
  },
  save() { try { localStorage.setItem(this.k, JSON.stringify(this.d)); } catch (e) { /* storage blocked: keep it for this visit */ } },
  replace(d) { this.d = d; this.save(); }
};
// the card screens ask MY what's owned
const MY = {
  load: () => CGSAVE.load(), save: () => CGSAVE.save(),
  add(c) { const d = CGSAVE.load(), k = pcKey(c), isNew = !d.owned[k]; d.owned[k] = (d.owned[k] || 0) + 1; d.cards++; return isNew; }
};

// ---------- what the rules need from the card index ----------
const CG = { all: null };
function cgPrep(all) {
  if (CG.all === all) return; CG.all = all;
  CG.byKey = new Map(all.map(c => [pcKey(c), c]));
  CG.sets = ECO.setsOf(all.map(ecoCard)); for (const st of CG.sets) st.ks = new Set(st.keys);
  CG.decades = [...new Set(all.map(c => Math.floor(c.season / 10) * 10))].sort((a, b) => a - b);
}
function cgWeek(s) { return ECO.ensureWeek(s, ECO.weekKey(new Date()), CG.decades, Object.keys(CC.GROUP_NAMES), CC.GROUP_NAMES); }
function cgToday() { const n = new Date(), y = new Date(n); y.setDate(n.getDate() - 1); return [ECO.dayKey(n), ECO.dayKey(y)]; }
function cgHoliday() { const n = new Date(); return ECO.holidayNow(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()), CC.holidaysOf); }
function cgPackDef(key) { return (PC.packs || []).find(p => p.key === key) || ECO.XPACKS[key] || null; }
function cgSpares(s) { const out = []; for (const [k, n] of Object.entries(s.owned)) if (n > 1 && CG.byKey.has(k)) for (let i = 1; i < n; i++) out.push(CG.byKey.get(k)); return out; }

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
  vulcan: ["VULCANIZED!!! It melted the rubber!", "THE RAREST CARD IN THE CGSAVE!"]
};
function cgCallout(big, small, tier, ms) {
  const host = $("cgcall") || document.body, el = document.createElement("div");
  el.className = `cgcall t-${tier || "gold"}`; el.innerHTML = `<b>${esc(big)}</b>${small ? `<small>${esc(small)}</small>` : ""}`;
  host.appendChild(el); setTimeout(() => el.classList.add("out"), ms || 1500); setTimeout(() => el.remove(), (ms || 1500) + 450);
}
function cgWallet(s, extra) {
  const tk = Object.entries(s.tokens).filter(([, n]) => n > 0).reduce((a, [, n]) => a + n, 0);
  return `<div class="wallet">${coinH(s.coins)}<span class="m">${tk ? `${tk} unopened pack${tk === 1 ? "" : "s"}` : "no unopened packs"}</span>${extra || ""}</div>`;
}
// a strip for the Cards home page
function cgHomeStrip() {
  const s = CGSAVE.load(), [today] = cgToday(), ready = s.daily.last !== today;
  return `<a class="homestrip" href="#cards-packs">${coinH(s.coins)}${ready ? `<span class="dot">Daily reward ready</span>` : `<span class="m">Streak ${s.daily.streak} day${s.daily.streak === 1 ? "" : "s"}</span>`}<b>Packs →</b></a>`;
}

// ---------- the pack store ----------
function pcPacks(all) {
  cgPrep(all); const s = CGSAVE.load(), P = pcPackList(all); PC.packs = P; const W = cgWeek(s); CGSAVE.save();
  const [today] = cgToday(), hol = cgHoliday(), holName = k => (CC.COLLECTIONS.find(c => c.hol === k) || {}).name || k;
  let h = `<p><a href="#cards">← All collections</a></p><div class="vh"><h2>Packs</h2><a class="btn ghost" href="#cards-mine">My collection →</a></div>`;
  if (s.welcome) { h += `<div class="welcome"><b>Welcome to the card game.</b> Packs cost coins now. You start with ${coinH(1500)}, three Standard packs and a Premium pack${Object.keys(s.owned).length ? `, and every card you already pulled is still yours` : ""}. Earn more with the daily reward, weekly challenges, finished sets and by selling spare copies.</div>`; delete s.welcome; CGSAVE.save(); }
  h += cgWallet(s);
  // daily reward and streak
  const claimed = s.daily.last === today, next = claimed ? s.daily.streak : (s.daily.last === cgToday()[1] ? s.daily.streak : 0);
  h += `<div class="daily${claimed ? " done" : ""}"><div><b>Daily reward</b><small>${claimed ? `Claimed today · come back tomorrow for day ${next + 1}` : `A free Standard pack and coins. Come back every day: day 7 adds a Premium pack.`}</small></div>
    <div class="streak">${ECO.STREAK.map((v, i) => `<span class="${i < (claimed ? (next - 1) % 7 + 1 : next % 7) ? "got" : ""}${!claimed && i === next % 7 ? " now" : ""}"><b>${i + 1}</b><small>${v}${i === 6 ? "+P" : ""}</small></span>`).join("")}</div>
    ${claimed ? "" : `<button class="btn" onclick="cgDaily()">Claim</button>`}</div>`;
  // packs you own
  const mine = Object.entries(s.tokens).filter(([, n]) => n > 0).map(([k, n]) => [cgPackDef(k), n]).filter(([p]) => p);
  if (mine.length) h += `<h3>Your packs</h3><div class="packs">${mine.map(([pk, n]) => `<button class="packt own" onclick="cgOpen('${pk.key}')"><span class="pk">${CART.packSVG(pk, pk.key)}<i class="cnt">×${n}</i></span><b>${esc(pk.name)}</b><small>${esc(pk.sub)}</small><em class="price free">Open</em></button>`).join("")}</div>`;
  // the store
  h += `<h3>Store</h3><div class="packs">${P.map(pk => {
    const price = ECO.priceOf(pk.key), off = pk.key === "holiday" && !hol.active, short = s.coins < price;
    const note = off ? (hol.next ? `Back for ${holName(hol.next[1])}` : "Holidays only") : pk.key === "holiday" ? `On sale for ${holName(hol.active)}` : `${pcPool(all, pk).length} cards`;
    return `<button class="packt${off ? " off" : ""}" ${off ? "disabled" : ""} onclick="cgOpen('${pk.key}')"><span class="pk">${CART.packSVG(pk, pk.key)}</span><b>${esc(pk.name)}</b><small>${esc(pk.sub)} · ${note}</small><em class="price${short && !off ? " short" : ""}">${off ? "Off sale" : coinH(price)}</em></button>`;
  }).join("")}</div>`;
  // weekly challenges
  h += `<h3>This week's challenges</h3><div class="chall">${W.list.map(ch => { const p = Math.min(ch.n, W.prog[ch.id] || 0), d = W.done[ch.id]; return `<div class="ch${d ? " done" : ""}"><div><b>${esc(ch.text)}</b><small>${d ? "Done" : `${p} of ${ch.n}`} · ${coinH(ch.coins)}${ch.token ? " + a Premium pack" : ""}</small></div><i class="prog"><em style="width:${(p / ch.n * 100).toFixed(0)}%"></em></i></div>`; }).join("")}</div><p class="m small">New challenges every Monday.</p>`;
  // settings and odds
  const tg = (k, label, sub) => `<label class="tgl"><input type="checkbox" ${s.opts[k] ? "checked" : ""} onchange="cgOpt('${k}',this.checked)"><span><b>${label}</b><small>${sub}</small></span></label>`;
  h += `<h3>Opening</h3><div class="tgls">${tg("quick", "Quick open", "Skip the show and see every card at once")}${tg("walkouts", "Walkouts", "Ruby and up walk out of the tunnel in 3D")}${tg("sound", "Sound", "Pack, pull and coin sounds")}</div>`;
  const tot = Object.values(ECO.TIER_W).reduce((a, b) => a + b, 0);
  h += `<h3>Odds per card</h3><div class="chips">${CC.TIERS.slice().reverse().map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${(ECO.TIER_W[t.key] / tot * 100).toFixed(ECO.TIER_W[t.key] / tot < 0.01 ? 2 : 1)}%</b></span>`).join("")}</div><p class="m small">Every slot rolls a tier with these odds, then a card from that tier. Packs with a guarantee roll the last card only from cards at or above that tier.</p>`;
  return h;
}
function cgOpt(k, v) { const s = CGSAVE.load(); s.opts[k] = !!v; CGSAVE.save(); if (k === "sound" && v) SFX.coin(); }
function cgDaily() {
  const s = CGSAVE.load(), [today, yest] = cgToday(), r = ECO.claimDaily(s, today, yest); if (!r) return;
  cgPrep(CG.all || []); cgWeek(s); const fin = ECO.track(s, { type: "daily" }); CGSAVE.save();
  SFX.coin(); cgToast(`Day ${r.streak}: ${coinH(r.coins)} and a Standard pack${r.tokens.premium ? " + a Premium pack" : ""}`);
  for (const ch of fin) cgToast(`Challenge done: ${esc(ch.text)} · ${coinH(ch.coins)}`, "gold");
  route();
}

// ---------- opening a pack ----------
async function cgOpen(key) {
  const all = pcAll(await pcIndex()); cgPrep(all); if (!PC.packs) PC.packs = pcPackList(all);
  const s = CGSAVE.load(); cgWeek(s);
  const pk = cgPackDef(key); if (!pk) return;
  if (key === "holiday" && !cgHoliday().active && !(s.tokens.holiday > 0)) { cgToast("The Holiday pack is only on sale around holidays."); return; }
  const how = ECO.payFor(s, key);
  if (!how) { cgToast(`You need ${coinH(ECO.priceOf(key))} for the ${esc(pk.name)}. You have ${coinH(s.coins)}.`, "bad"); return; }
  const pool = pcPool(all, pk), cards = [];
  for (let k = 0; k < pk.n; k++) cards.push(pcDraw(pool, k === pk.n - 1 && pk.guarantee ? pk.guarantee : 0));
  cards.sort((a, b) => a.ovr - b.ovr); // best card last, like a real pack
  s.packs++;
  const news = cards.map(c => MY.add(c)), fin = ECO.track(s, { type: "open" });
  cards.forEach((c, k) => fin.push(...ECO.track(s, { type: "pull", tier: c.tier.key, season: c.season, group: (CC.CBY[c.col] || {}).group, isNew: news[k] })));
  const touched = CG.sets.filter(st => cards.some(c => st.ks.has(pcKey(c)))), paid = ECO.paySets(s, touched);
  const top = cards[cards.length - 1], best = s.best && CG.byKey.get(s.best);
  if (!best || top.ovr > best.ovr) s.best = pcKey(top);
  CGSAVE.save();
  cgShow(pk, cards, news, { fin, paid, how });
}
function cgShow(pk, cards, news, res) {
  const s = CGSAVE.load(), quick = s.opts.quick, top = cards[cards.length - 1], ti = TIX(top.tier.key), T = CART.TP[top.tier.key] || CART.TP.gold;
  PC.pull = cards; pcSetList(cards, "pull"); CG.show = { pk, cards, news, res, left: cards.length, busy: false };
  let m = $("packmodal");
  if (!m) { m = document.createElement("div"); m.id = "packmodal"; m.className = "cmodal packm"; document.body.appendChild(m); }
  const again = ECO.canOpen(s, pk.key), againTxt = again === "token" ? `Open another (×${s.tokens[pk.key]})` : ECO.priceOf(pk.key) != null ? `Open another · ${coinH(ECO.priceOf(pk.key))}` : "";
  m.innerHTML = `<div class="cm-box"><button class="cm-x" onclick="pcClosePack()" aria-label="Close">✕</button>
    <div id="cgcall" class="cgcalls"></div>
    ${quick ? "" : `<div class="tearwrap" id="tearwrap" onclick="cgTear()" style="--glow:${ti >= TIX("emerald") ? T.acc : "transparent"};--amp:${(1 + Math.max(0, ti - 3) * 0.5).toFixed(1)}px"><div class="tear">${CART.packSVG(pk, pk.key)}</div><p class="m">Tap the pack to open it</p></div>`}
    <div class="pull" id="pull" ${quick ? "" : "hidden"}>${cards.map((c, k) => `<div class="pslot t-${c.tier.key}${c.ovr >= 81 ? " rare" : ""}${c.ovr >= 90 ? " ultra" : ""}${quick ? " shown" : ""}" style="--d:${k * 0.12}s"><div class="fcard tilt pflip${quick ? " flip" : ""}" onclick="cgReveal(this, ${k})"><div class="fc-in"><div class="fc-f">${CART.mystery()}</div><div class="fc-b">${CART.front(c)}</div></div><div class="glare"></div></div>${news[k] ? `<span class="newb">NEW</span>` : ""}<span class="ctl pl">${esc(c.tier.name)} · ${esc((CC.CBY[c.col] || {}).name || "")}</span></div>`).join("")}</div>
    <div class="pullsum" id="pullsum" ${quick ? "" : "hidden"}>${cgSummary(cards, news, res)}</div>
    <div class="pullbar" id="pullbar" ${quick ? "" : "hidden"}><button onclick="cgRevealAll()" id="revall" ${quick ? "hidden" : ""}>Reveal all</button>${againTxt ? `<button ${again ? "" : "disabled"} onclick="cgOpen('${pk.key}')">${againTxt}</button>` : ""}<a class="btn ghost" href="#cards-packs" onclick="pcClosePack()">Store</a><a class="btn ghost" href="#cards-mine" onclick="pcClosePack()">My collection</a></div></div>`;
  m.hidden = false; document.body.classList.add("noscroll");
  if (quick) { CG.show.left = 0; if (ti >= TIX("ruby")) { SFX.boom(ti / 10); cgCallout(top.tier.name.toUpperCase(), LINES[top.tier.key][0], top.tier.key); } else SFX.flip(); cgAfter(); }
}
function cgSummary(cards, news, res) {
  const n = news.filter(Boolean).length, out = [];
  out.push(`<span><b>${n} new card${n === 1 ? "" : "s"}</b>${n < cards.length ? ` · ${cards.length - n} spare cop${cards.length - n === 1 ? "y" : "ies"}` : ""}</span>`);
  for (const ch of res.fin) out.push(`<span class="gold">Challenge done: ${esc(ch.text)} · ${coinH(ch.coins)}${ch.token ? " + Premium pack" : ""}</span>`);
  for (const st of res.paid) out.push(`<span class="gold">Set complete: ${esc((CC.CBY[st.col] || {}).name || st.col)} ${st.decade === "all" ? "(every card)" : st.decade + "s"} · ${coinH(st.reward.coins)}${Object.keys(st.reward.tokens).map(k => ` + ${st.reward.tokens[k] > 1 ? st.reward.tokens[k] + " " : ""}${(cgPackDef(k) || { name: k }).name}${st.reward.tokens[k] > 1 ? "s" : ""}`).join("")}</span>`);
  return out.join("");
}
// the tier tease: the pack glows the color of its best card and shakes harder the rarer it is
function cgTear() {
  const w = $("tearwrap"), S = CG.show; if (!w || w.classList.contains("charge") || !S) return;
  const top = S.cards[S.cards.length - 1], ti = TIX(top.tier.key), dur = ti >= TIX("diamond") ? 1.9 : ti >= TIX("ruby") ? 1.3 : ti >= TIX("emerald") ? 0.9 : 0.45;
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
  if (ti >= TIX("emerald")) { const L = LINES[c.tier.key]; cgCallout(c.tier.name.toUpperCase(), ti >= TIX("ruby") ? L[(c.pid + c.season) % L.length] : "", c.tier.key, ti >= TIX("diamond") ? 2200 : 1400); if (ti >= TIX("ruby")) { SFX.boom(ti / 10); SFX.sparkle(ti - 3); } else SFX.sparkle(3); }
  if (--S.left === 0) cgAfter();
}
async function cgRevealAll() {
  const S = CG.show; if (!S || S.busy) return; S.busy = true; const b = $("revall"); if (b) b.hidden = true;
  try { for (const [k, el] of [...document.querySelectorAll("#pull .pflip")].entries()) { if (el.classList.contains("flip")) continue; await cgFlip(el, k); await new Promise(r => setTimeout(r, 260)); } }
  finally { S.busy = false; }
}
// after the last card: the summary, and callouts for sets and challenges
function cgAfter() {
  const S = CG.show; if (!S) return; const sm = $("pullsum"); if (sm) sm.hidden = false; const b = $("revall"); if (b) b.hidden = true;
  let d = 900;
  for (const st of S.res.paid) { setTimeout(() => { SFX.horn(); cgCallout("SET COMPLETE", `${(CC.CBY[st.col] || {}).name || st.col} ${st.decade === "all" ? "· every card" : st.decade + "s"}`, "gold", 2000); }, d); d += 2200; }
  for (const ch of S.res.fin) { setTimeout(() => { SFX.coin(); cgCallout("CHALLENGE DONE", ch.text, "emerald", 1600); }, d); d += 1700; }
}
function pcClosePack() { const m = $("packmodal"); if (m) { m.hidden = true; m.innerHTML = ""; } CG.show = null; document.body.classList.remove("noscroll"); if (location.hash.startsWith("#cards")) route(); }

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

// ---------- my collection, with the trade desk ----------
function pcMine(all) {
  cgPrep(all); const s = CGSAVE.load(), byCol = {}; for (const c of all) (byCol[c.col] = byCol[c.col] || []).push(c);
  const mine = all.filter(c => s.owned[pcKey(c)]).sort((a, b) => b.ovr - a.ovr);
  let h = `<p><a href="#cards">← All collections</a></p><div class="vh"><h2>My collection</h2><a class="btn" href="#cards-packs">Packs</a></div>`;
  h += cgWallet(s);
  if (!mine.length) return h + `<p class="m">Nothing yet. Open a pack and your cards land here.</p>` + cgBackup();
  const pct = mine.length / all.length * 100;
  h += `<div class="kv"><div><b>${fmtN(mine.length)}</b><span>Unique cards</span></div><div><b>${fmtN(s.cards)}</b><span>Cards pulled</span></div><div><b>${fmtN(s.packs)}</b><span>Packs opened</span></div><div><b>${pct.toFixed(1)}%</b><span>Of every card</span></div></div>`;
  const byTier = {}; for (const c of mine) byTier[c.tier.key] = (byTier[c.tier.key] || 0) + 1;
  h += `<div class="chips">${CC.TIERS.slice().reverse().filter(t => byTier[t.key]).map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${byTier[t.key]}</b></span>`).join("")}</div>`;
  const best = mine.slice(0, 8); pcSetList(best, "mine");
  h += `<h3>Best pulls</h3><div class="cgrid">${best.map((c, i) => pcTile(c, i, `${c.season}`, "mine")).join("")}</div>`;
  // spare copies: sell or trade
  const sp = cgSpares(s), spT = {}; for (const c of sp) spT[c.tier.key] = (spT[c.tier.key] || 0) + 1;
  const val = list => list.reduce((a, c) => a + ECO.SELL[c.tier.key], 0), low = sp.filter(c => TIX(c.tier.key) <= TIX("gold"));
  h += `<h3>Trade desk</h3><div class="desk"><div class="dk"><b>Spare copies</b>`;
  if (!sp.length) h += `<small>No spares yet. Duplicates you pull show up here, and you always keep one copy.</small>`;
  else {
    h += `<small>${sp.length} spare cop${sp.length === 1 ? "y" : "ies"}, worth ${coinH(val(sp))}. Selling never touches your last copy.</small><div class="chips">${CC.TIERS.slice().reverse().filter(t => spT[t.key]).map(t => `<span class="tchip"><span class="gem t-${t.key}"></span>${t.name} <b>${spT[t.key]}</b><small>${ECO.SELL[t.key]} each</small></span>`).join("")}</div><div class="row">`;
    if (low.length && low.length < sp.length) h += `<button onclick="cgSell('low')">Sell Gold and below · ${coinH(val(low))}</button>`;
    h += `<button class="${low.length < sp.length ? "warn" : ""}" onclick="cgSell('all', this)">Sell all spares · ${coinH(val(sp))}</button></div>`;
  }
  h += `</div><div class="dk"><b>Exchanges</b><small>Trade spare copies for a better pack. Uses your lowest spares first, and on average it's worth more than selling them.</small>`;
  for (const ex of ECO.EXCHANGES) {
    const have = sp.filter(c => ex.from.includes(c.tier.key)).length, P = cgPackDef(ex.gives) || ECO.XPACKS[ex.gives], names = ex.from.map(t => CC.TIERS[TIX(t)].name).join(" or ");
    h += `<div class="ex"><span><b>${ex.n} ${names}</b> → ${esc(P ? P.name : ex.gives)}<small>${esc(P ? P.sub : "")}</small></span><button ${have >= ex.n ? "" : "disabled"} onclick="cgExchange('${ex.key}', this)">${have >= ex.n ? "Trade" : `${have}/${ex.n}`}</button></div>`;
  }
  h += `</div></div>`;
  // sets
  h += `<h3>Sets</h3><p class="m small">Every collection splits into one set per decade. Finish one for 1.5× what its cards would sell for, plus a pack for sets of five or more (Legends if it holds a Diamond or better). Finish a whole collection for 3× and two Legends packs.</p><div class="sets">`;
  for (const [grp, title] of Object.entries(CC.GROUP_NAMES)) {
    h += `<div class="setg"><b>${title}</b>`;
    for (const C of CC.COLLECTIONS.filter(c => c.group === grp)) {
      const list = byCol[C.key] || []; if (!list.length) continue;
      const have = list.filter(c => s.owned[pcKey(c)]).length, sets = CG.sets.filter(st => st.col === C.key && st.decade !== "all").sort((a, b) => a.decade - b.decade), master = CG.sets.find(st => st.key === C.key + "@all");
      h += `<details class="setr${have === list.length ? " done" : ""}"><summary><span>${esc(C.name)}</span><i class="prog"><em style="width:${(have / list.length * 100).toFixed(1)}%"></em></i><small>${have}/${list.length}</small></summary><div class="decs">`;
      for (const st of master ? sets.concat([master]) : sets) {
        const n = ECO.setHave(s, st), r = ECO.setReward(st), paid = s.sets[st.key];
        h += `<a class="dec${paid ? " paid" : ""}" href="#cards-${C.key}${st.decade === "all" ? "" : "-" + st.decade}" onclick="PC.ownF='miss'"><b>${st.decade === "all" ? "Every card" : st.decade + "s"}</b><small>${n}/${st.keys.length}</small><em>${paid ? "Paid ✓" : `${coinH(r.coins)}${Object.keys(r.tokens).map(k => ` + ${(cgPackDef(k) || { name: k }).name.replace(" Pack", "")}${r.tokens[k] > 1 ? " ×" + r.tokens[k] : ""}`).join("")}`}</em></a>`;
      }
      h += `</div></details>`;
    }
    h += `</div>`;
  }
  h += `</div>` + cgBackup();
  return h;
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
  ECO.exchange(s, ex, uniq); CGSAVE.save(); SFX.coin();
  const P = cgPackDef(ex.gives) || ECO.XPACKS[ex.gives]; cgToast(`Traded for a ${esc(P.name)}. <a href="#cards-packs">Open it in Packs</a>`, "gold");
  route();
}
// the card viewer shows how many copies you have and sells spares
function cgCardBox(c) {
  if (!c || c.col === "base") return "";
  const s = CGSAVE.load(), n = s.owned[pcKey(c)] || 0; if (!n) return `<p class="m small">Not in your collection yet.</p>`;
  return `<p class="ownline">You own <b>${n}</b> cop${n === 1 ? "y" : "ies"}${n > 1 ? ` <button class="linkbtn" onclick="cgSellOne('${pcKey(c)}',this)">Sell ${n - 1} spare${n > 2 ? "s" : ""} · ${coinH((n - 1) * ECO.SELL[c.tier.key])}</button>` : ""}</p>`;
}
function cgSellOne(key, btn) {
  const s = CGSAVE.load(), c = CG.byKey && CG.byKey.get(key); if (!c) return;
  if (TIX(c.tier.key) >= TIX("ruby") && !btn.dataset.sure) { btn.dataset.sure = 1; btn.textContent = `Sell a ${c.tier.name} spare? Tap again`; return; }
  const r = ECO.sell(s, Array.from({ length: Math.max(0, (s.owned[key] || 0) - 1) }, () => ecoCard(c))); CGSAVE.save();
  SFX.coin(); btn.parentElement.innerHTML = `You own <b>1</b> copy · sold ${r.n} for ${coinH(r.coins)}`;
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
@media (prefers-reduced-motion:reduce){.tearwrap.charge .tear,.cgcall,.cgcall b{animation:none!important}}`;
  document.head.appendChild(st);
})();
