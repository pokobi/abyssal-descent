'use strict';
// What an arm's own effect and a part's promise do where the shot lands (weapons.js / combat.js), and what a save keeps of them:
// 吸血 (ブラッドヴァイパー, 終焉の咆哮, 不死鳥の吐息), 撃破で即装填 (死神のシックスシューター), 消音の極意's +40%, 連鎖雷 on a bolt (雷霆弩),
// the parts on rounds that fly (bolts, nails, harpoons: 銀の弾丸, 吸血弾, 魂喰らいの弾, the sure crits of 隠密 and 魔弾の引鉄, the 狙撃手's
// gauge on a head), 魂喰らい's count through a checkpoint and the bag, 喰魂's layers through a mid-area save, 初撃強化's five rounds,
// フラッシュハイダー's smaller flash, and the coins a bank, a bet or a slot hands back (no coin-gain bonus on them, no onCoin).
//   node tests/trait_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9893;

const PAGE = `
window.T = {
  // a dummy foe dz m ahead (dx to the side) that never moves, its body and hit spheres where it stands
  mk(dz, dx, hp) {
    const P = G.player, f = new THREE.Vector3(-Math.sin(T.yaw), 0, -Math.cos(T.yaw)), side = new THREE.Vector3(-f.z, 0, f.x);
    const pos = P.pos.clone().addScaledVector(f, dz).addScaledVector(side, dx || 0);
    const e = G.enemies.spawn(G.ENEMY_BY_ID.brute_normal, 5, pos, { noSplit: true });
    e.maxHp = e.hp = hp || 1e6; e.shield = e.maxShield = 0; e.update = () => {}; e.state = 'chase';
    e.model.group.position.copy(e.pos); e.updateHits(); e.hasLOS = true;
    return e;
  },
  clean() { for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); } G.enemies.list.length = 0; G.combat.clear(); },
  // a fresh player of the class, facing the longest clear way from where it stands (the foes stand 5-6 m down it)
  as(cls) {
    const P = G.player, GM = G.game; GM.areaCleared = false; GM.clearSweep = false; GM.rewardPending = null; G.Classes._offering = false;
    P.cls = cls; P.resetRun(); P.perks = []; P._cs = null; P.devMods = { critChance: -1 }; P.recalc(); P.stats.critChance = 0; P.hp = P.stats.maxHp; P.os = 0; P.invulnT = 0; GM.state = 'playing'; GM.dev = { speed: 1 };
    const o = P.pos.clone().add(new THREE.Vector3(0, 1.6, 0)); let best = -1, by = 0;
    for (let k = 0; k < 16; k++) { const y = k * Math.PI / 8, h = G.world.raycast(o, new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)), 40), t = h ? h.t : 40; if (t > best) { best = t; by = y; } }
    T.yaw = P.yaw = by; T.room = best; P.pitch = 0; GM.step(0.02, 2);
    return P;
  },
  step(sec) { const n = Math.max(1, Math.round(sec / 0.02)); G.game.step(0.02, n); },
  // the arm in hand, with these parts on it
  gun(id, atts) { const P = G.player, W = G.weapons, w = W.make(id); Object.assign(w.atts, atts || {}); w.ver++; w.mag = 99; P.weapons = [w]; P.wIdx = 0; P.meleeMode = false; W.equip(true); return w; },
  // one shot straight ahead, no spread (the kick of the last one taken back first)
  fire(w, s) { const P = G.player, W = G.weapons, sp0 = W.currentSpread; if (P.stats.critChance > 0) P.stats.critChance = 0; P.pitch = 0; P.yaw = T.yaw; W.currentSpread = () => 0; try { if (w.def.flame) W.fireFlame(w, s || W.stats(w)); else W.shoot(w, s || W.stats(w)); } finally { W.currentSpread = sp0; P.pitch = 0; P.yaw = T.yaw; } },
  lost(e) { return e.maxHp - e.hp; },
  hurt() { const P = G.player; P.hp = P.stats.maxHp * 0.5; P._lsB = undefined; P._lsT = undefined; return P.hp; },
  cloak(mul) { G.combat.temp('cloak', 6, { invis: 1 }, '👻'); G.weapons._cloakUsed = false; G.weapons._cloakMul = mul; },
};
1;`;

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  const J = async (p, js) => JSON.parse(await p.eval(`JSON.stringify((() => { ${js} })())`));
  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0.01);
  const r2 = (x) => Math.round(x * 1000) / 1000;
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(800);
    await p.eval(PAGE);
    const room = await J(p, "T.yaw = 0; T.clean(); G.game.objective = null; T.as('assault'); return { room: T.room, ls: G.player.stats.lifesteal, crit: G.player.stats.critMul };");
    check(room.room >= 9, `a clear way of ${r2(room.room)} m ahead for the shots (the foes stand 5-6 m down it)`);

    // ---------------- 吸血: 4% of the damage dealt comes back (it read w.trait, which no arm has, and never healed)
    const ls = await J(p, `const P = T.as('assault'); const out = {};
      for (const id of ['s_viper', 'g_doom', 'f_phoenix', 's_wasp']) { T.clean(); const w = T.gun(id); const e = T.mk(5); const h0 = T.hurt(); T.fire(w); out[id] = { heal: P.hp - h0, lost: T.lost(e) }; }
      T.clean(); return out;`);
    const rate = (x) => (x.lost > 0 ? x.heal / x.lost : -1);
    check(near(rate(ls.s_viper), 0.04, 0.002) && near(rate(ls.g_doom), 0.04, 0.002) && near(rate(ls.f_phoenix), 0.04, 0.002) && ls.s_wasp.lost > 0 && ls.s_wasp.heal === 0,
      `吸血: ブラッドヴァイパー, 終焉の咆哮 and 不死鳥の吐息 give back 4% of what they deal (${r2(rate(ls.s_viper))}, ${r2(rate(ls.g_doom))}, ${r2(rate(ls.f_phoenix))}); an arm without it none (${r2(ls.s_wasp.heal)})`);

    // ---------------- 撃破で即装填: a kill fills the cylinder
    const kr = await J(p, `const P = T.as('assault'); const W = G.weapons; const out = {};
      for (const id of ['r_reaper', 'r_judge']) { T.clean(); const w = T.gun(id); const full = W.stats(w).mag; const e = T.mk(5, 0, 1); w.mag = 2; T.fire(w); out[id] = { mag: w.mag, full, dead: !e.alive || e.hp <= 0 }; }
      const w = T.gun('r_reaper'); T.clean(); const e = T.mk(5); w.mag = 2; T.fire(w); out.noKill = w.mag; T.clean(); return out;`);
    check(kr.r_reaper.dead && kr.r_reaper.mag === kr.r_reaper.full && kr.noKill === 1 && kr.r_judge.dead && kr.r_judge.mag === 1,
      `撃破で即装填: 死神のシックスシューター is full after a kill (${kr.r_reaper.mag}/${kr.r_reaper.full}), not after a hit that does not kill (${kr.noKill}); another revolver is not (${kr.r_judge.mag})`);

    // ---------------- 消音の極意: a foe that has not seen you takes 40% more (the bonus was worked out after the damage and never used)
    const hu = await J(p, `const P = T.as('assault'); const W = G.weapons; T.clean(); const w = T.gun('s_wasp', { muzzle: 'm_hush' });
      const a = T.mk(5); a.hasLOS = false; T.fire(w); const da = T.lost(a); T.clean(); const b = T.mk(5); b.hasLOS = true; T.fire(w); const db = T.lost(b); T.clean();
      return { hush: W.stats(w).hush, da, db, fits: G.attOk(G.ATT_BY_ID.m_hush, w) };`);
    check(hu.fits && hu.hush === 0.4 && hu.db > 0 && near(hu.da / hu.db, 1.4), `消音の極意: +40% on a foe that has not seen you (x${r2(hu.da / hu.db)}), nothing on one that has`);

    // ---------------- 連鎖雷 on a bolt: 雷霆弩's lightning (half the hits), none from a plain crossbow
    const cl = await J(p, `const P = T.as('assault'); const C = G.combat; let n = 0; const c0 = C.chain; C.chain = function () { n++; return c0.apply(this, arguments); };
      const run = (id) => { n = 0; let hit = 0; const w = T.gun(id); for (let i = 0; i < 24; i++) { T.clean(); const e = T.mk(6); w.mag = 9; T.fire(w); T.step(0.3); if (T.lost(e) > 0) hit++; } return { n, hit }; };
      try { return { storm: run('c_storm'), hunter: run('c_hunter') }; } finally { C.chain = c0; T.clean(); }`);
    check(cl.storm.hit === 24 && cl.hunter.hit === 24 && cl.storm.n >= 4 && cl.storm.n <= 20 && cl.hunter.n === 0,
      `連鎖雷: 雷霆弩's bolts set the lightning off on about half their hits (${cl.storm.n} of ${cl.storm.hit}); 狩人の連弩's never (${cl.hunter.n} of ${cl.hunter.hit})`);

    // ---------------- parts on a round that flies: 銀の弾丸 (+25% on elites), 吸血弾 (3% back)
    const pr = await J(p, `const P = T.as('soldier');
      const shot = (atts, elite) => { T.clean(); const w = T.gun('c_hunter', atts); const e = T.mk(6); if (elite) e.elite = true; const h0 = T.hurt(); T.fire(w); T.step(0.3); return { d: T.lost(e), heal: P.hp - h0 }; };
      const a = shot({}, true), b = shot({ ammo: 'a_silver' }, true), c = shot({}, false), d = shot({ ammo: 'a_silver' }, false), v = shot({ ammo: 'a_vamp' }, false); T.clean();
      return { elite: b.d / a.d, plain: d.d / c.d, vamp: (v.heal - c.heal) / v.d, hit: a.d > 0 && c.d > 0 && v.d > 0 };`);
    check(pr.hit && near(pr.elite, 1.25) && near(pr.plain, 1) && near(pr.vamp, 0.03, 0.002), `a bolt carries its parts: 銀の弾丸 x${r2(pr.elite)} on an elite (x${r2(pr.plain)} on the rest), 吸血弾 gives ${r2(pr.vamp)} of the damage back`);

    // ---------------- the sure crits on a round that flies, and 隠密's own multiplier kept beside another sure crit
    const cr = await J(p, `const P = T.as('assault'); const W = G.weapons, C = G.combat; const cm = P.stats.critMul;
      const shot = (id, atts, o) => { T.clean(); const w = T.gun(id, atts); const e = T.mk(6); if (o.next) w.critNext = true; if (o.cloak) T.cloak(o.cloak); T.fire(w); T.step(0.3); const r = { d: T.lost(e), cloak: P.temps.has('cloak'), next: !!w.critNext }; C.untemp('cloak'); return r; };
      const b0 = shot('c_hunter', {}, {}), b1 = shot('c_hunter', {}, { cloak: 4 }), b2 = shot('c_hunter', { trigger: 't_magic' }, { next: true }), b3 = shot('c_hunter', { trigger: 't_magic' }, { next: true, cloak: 4 }), b4 = shot('c_hunter', { trigger: 't_magic' }, {});
      const g0 = shot('s_wasp', {}, {}), g1 = shot('s_wasp', { trigger: 't_magic' }, { next: true, cloak: 4 }), g2 = shot('s_wasp', { trigger: 't_magic' }, { next: true }); T.clean();
      return { cm, cloak: b1.d / b0.d, left: b1.cloak, magic: b2.d / b0.d, next: b2.next, both: b3.d / b0.d, none: b4.d / b0.d, noneNext: b4.next, gBoth: g1.d / g0.d, gMagic: g2.d / g0.d };`);
    check(near(cr.cloak, Math.max(4, cr.cm), 0.02) && !cr.left, `隠密's first shot crits with a bolt too (x${r2(cr.cloak)}), and the cloak ends as the bolt lands`);
    check(near(cr.magic, cr.cm, 0.02) && cr.next && near(cr.none, 1, 0.02) && !cr.noneNext, `魔弾の引鉄 on a bolt: the sure crit (x${r2(cr.magic)}) and the next one armed; a bolt that did not crit arms nothing (x${r2(cr.none)})`);
    check(near(cr.both, Math.max(4, cr.cm), 0.02) && near(cr.gBoth, Math.max(4, cr.cm), 0.02) && near(cr.gMagic, cr.cm, 0.02), `隠密 with another sure crit keeps its own multiplier (bolt x${r2(cr.both)}, gun x${r2(cr.gBoth)}; 魔弾 alone x${r2(cr.gMagic)})`);

    // ---------------- 狙撃手: a bolt in the head gives the gauge back like any round
    const sn = await J(p, `const P = T.as('sniper'); const W = G.weapons, C = G.Classes; T.clean(); const w = T.gun('c_hunter'); const e = T.mk(6);
      const hd = e.hitW.find((h) => h.part === 'head'); if (!hd) return { parts: e.hitW.map((h) => h.part) };
      let n = 0, f2 = -1; const f0 = C.focusHit; C.focusHit = function (e2, info, s) { if (info.head && s && s.focusShot) n++; const r = f0.apply(this, arguments); f2 = C.state().focus; return r; };
      const d0 = G.combat.damageEnemy; let part = ''; G.combat.damageEnemy = function (e2, a, info) { if (e2 === e && info) part += (info.part || '?') + ' '; return d0.apply(this, arguments); };
      try { const d = new THREE.Vector3(-Math.sin(T.yaw), 0, -Math.cos(T.yaw)), o = hd.w.clone().addScaledVector(d, -4); C.state().focus = 1; W.adsT = 1; const s = C.shot(W.stats(w)); W.fireProjectile(w, s, o.clone(), o, d); const f1 = C.state().focus; T.step(0.3);
        return { n, f1, f2, part, lost: T.lost(e), full: !!(s.focusShot && s.focusShot.full) }; } finally { C.focusHit = f0; G.combat.damageEnemy = d0; W.adsT = 0; T.clean(); }`);
    check(sn.full && sn.lost > 0 && sn.n === 1 && sn.f1 === 0 && sn.f2 === 0.5 && /^head/.test(sn.part || ''), `狙撃手: a bolt in the head gives the gauge back (${sn.n} head hit told to the class; the gauge ${r2(sn.f1 || 0)} -> ${r2(sn.f2 || 0)}; it struck: ${sn.part || ''}) ${sn.parts ? 'no head on the dummy: ' + sn.parts : ''}`);

    // ---------------- 魂喰らいの弾: on a hit, on a bolt, +1% a kill, halved in the next area, kept by a checkpoint and by the bag
    const so = await J(p, `const P = T.as('assault'); const W = G.weapons, GM = G.game, C = G.combat; T.clean();
      const w = T.gun('c_hunter', { ammo: 'a_soul' }); w.soul = 0.2; w.soulArea = GM.area; T.mk(6); T.fire(w); const pj = C.projectiles[C.projectiles.length - 1]; const bolt = pj ? pj.dmg / W.stats(w).dmg : 0; T.step(0.3); T.clean();
      const g = T.gun('s_wasp', { ammo: 'a_soul' }); g.soul = 0; g.soulArea = GM.area; const a = T.mk(5); T.fire(g); const d0 = T.lost(a); T.clean(); g.soul = 0.2; const b = T.mk(5); T.fire(g); const d1 = T.lost(b); T.clean();
      T.mk(5, 0, 1); T.fire(g); const kill = g.soul; T.clean();
      g.soul = 0.2; g.soulArea = GM.area - 1; const c = T.mk(5); T.fire(g); const d2 = T.lost(c), half = g.soul, here = g.soulArea === GM.area; T.clean();
      g.soul = 0.2; g.soulArea = GM.area; const snap = JSON.parse(JSON.stringify(GM.playerSnap())); g.soul = 0; GM.applyPlayerSnap(snap); const w1 = P.weapons[0], cp = w1.soul, cpArea = w1.soulArea === GM.area;
      const it = JSON.parse(JSON.stringify(G.Inv.ser(GM.gunItem(w1)))); P.weapons = []; const took = GM.takeGun({ id: it.id, gun: it.g }, true); const w2 = P.weapons[P.weapons.length - 1];
      return { bolt, gun: d1 / d0, kill, next: d2 / d0, half, here, cp, cpArea, took, bag: w2 && w2.soul, bagArea: !!w2 && w2.soulArea === GM.area, id: w2 && w2.id };`);
    check(near(so.bolt, 1.2) && near(so.gun, 1.2) && near(so.kill, 0.21, 0.0001), `魂喰らいの弾: what the arm has taken rides on a round (x${r2(so.gun)}) and on a bolt (x${r2(so.bolt)}); a kill adds 1% (${r2(so.kill)})`);
    check(near(so.half, 0.1, 0.0001) && so.here && near(so.next, 1.1), `魂喰らいの弾: half of it is left in the next area (${r2(so.half)}, x${r2(so.next)})`);
    check(so.cp === 0.2 && so.cpArea && so.took && so.id === 's_wasp' && so.bag === 0.2 && so.bagArea, `魂喰らいの弾: the count comes back from a checkpoint (${so.cp}) and from the bag (${so.bag})`);

    // ---------------- 初撃強化: the first five rounds after a reload (it was four)
    const fb = await J(p, `const P = T.as('soldier'); P.addBuff('h_firstb'); T.clean(); const w = T.gun('s_wasp'); const e = T.mk(5);
      const one = () => { const h = e.hp; T.fire(w); return h - e.hp; };
      const base = one(); G.buffs.emit('onReloadEnd', { weapon: w }); const ds = []; for (let i = 0; i < 7; i++) ds.push(Math.round(one() / base * 1000) / 1000); T.clean(); return { base, ds };`);
    check(fb.base > 0 && fb.ds.slice(0, 5).every((x) => near(x, 1.3)) && fb.ds.slice(5).every((x) => near(x, 1)), `初撃強化: +30% on the five rounds after a reload, none on the sixth (${fb.ds.join(' ')})`);

    // ---------------- フラッシュハイダー: a smaller flash at the muzzle
    const fh = await J(p, `const P = T.as('assault'); const W = G.weapons; const f0 = G.fx.flash; let last = null; G.fx.flash = function (pos, c, i, d, r) { if (pos && pos.distanceTo(W.muzzleWorld()) < 0.5) last = { i, r }; return f0.apply(this, arguments); };
      try { T.clean(); const a = T.gun('s_wasp'); last = null; T.fire(a); const plain = last; const b = T.gun('s_wasp', { muzzle: 'm_flash' }); last = null; T.fire(b); const hid = last; return { plain, hid }; } finally { G.fx.flash = f0; }`);
    check(fh.plain && fh.hid && fh.hid.i < fh.plain.i * 0.5 && fh.hid.r < fh.plain.r, `フラッシュハイダー: the flash at the muzzle is smaller (${fh.hid && fh.hid.i} against ${fh.plain && fh.plain.i})`);

    // ---------------- coins handed back: a bank's deposit, a bet's and a slot's winnings come as they are shown, whatever the coin-gain bonus
    const pay = await J(p, `const P = T.as('assault'); const GM = G.game, C = G.combat, R = G.Rooms2; let ev = 0; const e0 = G.buffs.emit, r0 = Math.random; G.buffs.emit = function (name) { if (name === 'onCoin') ev++; return e0.apply(this, arguments); };
      const out = {}; const last = () => G.world.interactables[G.world.interactables.length - 1].ev; const bonus = () => { P.stats.coinMul = 1; };
      try {
        bonus(); GM.run.coins = 100; let t = GM.run.coinsTotal; C.payout(50, 'x', 20); out.payout = GM.run.coins - 100; out.earned = GM.run.coinsTotal - t; out.ev0 = ev;
        bonus(); GM.run.coins = 100; C.coins(50); out.coins = GM.run.coins - 100; out.ev1 = ev; ev = 0;
        R.setup_bank(P.pos.clone()); const bank = last(); bonus(); GM.run.coins = 0; GM.run.bank = 500; t = GM.run.coinsTotal; bank.opts()[2].run(); out.bank = GM.run.coins; out.bankLeft = GM.run.bank; out.bankEarned = GM.run.coinsTotal - t;
        R.setup_casino(P.pos.clone()); const cas = last(); bonus(); GM.run.coins = 1000; t = GM.run.coinsTotal; Math.random = () => 0; cas.opts()[0].run(); Math.random = r0; out.dbl = GM.run.coins - 1000; out.dblEarned = GM.run.coinsTotal - t;
        bonus(); GM.run.coins = 100000; t = GM.run.coinsTotal; const sp = GM.price(150); Math.random = () => 0; cas.opts()[2].run(); Math.random = r0; out.slot = (GM.run.coins - 100000) / sp; out.slotEarned = (GM.run.coinsTotal - t) / sp;
        const gm = G.Areas.EVENTS.find((x) => x.id === 'gambler'); bonus(); GM.run.coins = 1000; t = GM.run.coinsTotal; Math.random = () => 0; gm.opts()[0].run(); Math.random = r0; out.gamble = GM.run.coins - 1000; out.gambleEarned = GM.run.coinsTotal - t;
        out.ev = ev;
      } finally { G.buffs.emit = e0; Math.random = r0; P.recalc(); }
      return out;`);
    check(pay.payout === 50 && pay.earned === 20 && pay.ev0 === 0 && pay.coins === 100 && pay.ev1 >= 1, `a payout is handed over as it is (+${pay.payout}, ${pay.earned} of it counted as gained, no onCoin); coins picked up still take the bonus (+${pay.coins})`);
    check(pay.bank === 500 && pay.bankLeft === 0 && pay.bankEarned === 0, `the bank gives back what it holds (${pay.bank} of 500 with coin gain +100%; ${pay.bankEarned} counted as gained)`);
    check(pay.dbl === 250 && pay.dblEarned === 250 && pay.slot === 49 && pay.slotEarned === 49 && pay.gamble === 300 && pay.gambleEarned === 300 && pay.ev === 0,
      `a won bet pays what it says: 倍か無か +${pay.dbl} on a stake of 250, the slot's jackpot ${pay.slot + 1} times the price, 骸骨の賭博師 +${pay.gamble} on 300; only the winnings count as gained, no onCoin (${pay.ev})`);

    // ---------------- 喰魂の大鎌: its layers through a save made in the middle of an area
    const dv = await J(p, `T.as('assault'); T.clean(); G.weapons.devour = 3; const S = JSON.parse(JSON.stringify(G.MidSave.snapshot())); G.weapons.devour = 0; G.MidSave.apply(S); return { saved: S.player.devour, back: G.weapons.devour };`);
    check(dv.saved === 3 && dv.back === 3, `喰魂: the layers are in a mid-area save and come back from it (${dv.saved} -> ${dv.back})`);

    await sleep(300);
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nTRAIT TEST FAILED (${fails.length})` : '\nTRAIT TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
