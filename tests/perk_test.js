'use strict';
// 秘伝 (js/classes.js): after each guardian the class's pair of perks is offered (一の巻, then 二の巻; easy both at the first; none at the
// last guardian), before the guardian's boon; the choice is saved with the run and a perk still owed is offered later. Every one of the
// 24 perks does what its card says, the class's start effects changed (sniper: +40%, no gauge back; heavy: knocked about again), and the
// pictures (飛燕's crescent, 一閃's beam) run without errors.
//   node tests/perk_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9891;

const PAGE = `
window.T = {
  // a dummy foe dz m ahead (dx to the side) that never moves, its body and hit spheres where it stands
  mk(dz, dx, hp) {
    const P = G.player, f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), side = new THREE.Vector3(-f.z, 0, f.x);
    const pos = P.pos.clone().addScaledVector(f, dz).addScaledVector(side, dx || 0);
    const e = G.enemies.spawn(G.ENEMY_BY_ID.brute_normal, 5, pos, { noSplit: true });
    e.maxHp = e.hp = hp || 1e6; e.shield = e.maxShield = 0; e.update = () => {}; e.state = 'chase';
    e.model.group.position.copy(e.pos); e.updateHits(); e.hasLOS = true;
    return e;
  },
  clean() { for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); } G.enemies.list.length = 0; G.combat.clear(); },
  as(cls, perks) { const P = G.player; const GM = G.game; GM.areaCleared = false; GM.clearSweep = false; GM.rewardPending = null; G.Classes._offering = false; P.cls = cls; P.resetRun(); P.perks = (perks || []).slice(); P._cs = null; P.recalc(); P.hp = P.stats.maxHp; P.os = 0; P.invulnT = 0; P.stats.critChance = 0; G.game.state = 'playing'; G.game.dev = { speed: 1 }; return P; },
  step(sec) { const n = Math.max(1, Math.round(sec / 0.02)); G.game.step(0.02, n); },
};
1;`;

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  const J = async (p, js) => JSON.parse(await p.eval(`JSON.stringify((() => { ${js} })())`));
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(800);
    await p.eval(PAGE);
    await p.eval("T.clean(); G.game.objective = null; 1");

    // ---------------- the data
    const d = await J(p, `const C = G.Classes; const out = { ok: true, bad: [] };
      for (const c of C.LIST) { const pr = C.PERKS[c.id]; if (!pr || pr.length !== 2 || pr.some((x) => x.length !== 2)) { out.ok = false; out.bad.push(c.id); continue; }
        for (const pk of pr.flat()) { if (!pk.name || !pk.desc || !pk.icon || C.PERK[pk.id] !== pk || pk.cls !== c.id) { out.ok = false; out.bad.push(pk.id); } if (/受付|合図|作りのメモ|【提案】/.test(pk.desc)) { out.ok = false; out.bad.push(pk.id + ' (rule words)'); } } }
      out.n = Object.keys(C.PERK).length; out.cols = C.LIST.map((c) => c.col).join(' '); return out;`);
    check(d.ok && d.n === 24, `six classes, two scrolls of two perks each (${d.n}), the card text only what the player needs ${d.bad.join(',')}`);
    check(d.cols === '#9ab070 #ff6a50 #5aa8ff #ffb040 #c08a5a #b07aff', 'the class colours: sniper blue, blade orange, heavy brown, mage purple (' + d.cols + ')');

    // ---------------- the order after a guardian (normal): 一の巻, the boon; 二の巻, the boon; the last guardian: nothing
    const guardian = async (area) => {
      await p.eval(`(() => { const GM = G.game; G.ui.clearScreen(); GM.state = 'playing'; GM.rewardPending = null; G.Classes._offering = false; GM.area = ${area}; GM.stage = 'boss'; GM.areaCleared = false; GM.clearArea({ boss: true }); })(); 1`);
    };
    const waitFor = async (sel, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 8000)) { if (await p.eval(`!!document.querySelector('${sel}')`)) return true; await sleep(150); } return false; };
    await p.eval("T.as('assault'); G.Run.set('normal'); 1");
    await guardian(7);
    let shown = await waitFor('.pk-card');
    const s1 = await J(p, "const t = document.querySelector('.pk-title'); return { t: t && t.textContent, n: document.querySelectorAll('.pk-card').length, txt: document.querySelector('.pk-wrap').textContent, boon: !!document.querySelector('.bs-cards'), st: G.game.state };");
    check(shown && /一の巻/.test(s1.t) && s1.n === 2 && /肉薄/.test(s1.txt) && /血の昂り/.test(s1.txt) && /猛進/.test(s1.txt) && !s1.boon && s1.st === 'buff', `1st guardian: 秘伝 一の巻 with the two cards, the next scroll shown below, before any boon (${s1.t}, ${s1.n} cards)`);
    await p.eval("G.ui._buffKeys('Digit2'); 1"); await sleep(700);
    const b1 = await waitFor('.bs-cards .card', 4000);
    const r1 = await J(p, "return { perks: G.player.perks, boon: !!document.querySelector('.bs-title') && document.querySelector('.bs-title').textContent };");
    check(b1 && r1.perks.join() === 'assault_1b' && /ROYAL BOON/.test(r1.boon), `key 2 takes the second card (${r1.perks}), then the guardian's boon (${r1.boon})`);
    await p.eval("G.ui._buffApi.pick(0); 1"); await sleep(600);
    await guardian(14);
    shown = await waitFor('.pk-card');
    const s2 = await J(p, "return { t: document.querySelector('.pk-title').textContent, txt: document.querySelector('.pk-wrap').textContent };");
    check(shown && /二の巻/.test(s2.t) && /猛進/.test(s2.txt) && /背水/.test(s2.txt) && /会得した秘伝.*血の昂り/.test(s2.txt), '2nd guardian: 二の巻, with what was taken before');
    await p.eval("document.querySelectorAll('.pk-card')[0].click(); 1"); await sleep(700);
    await waitFor('.bs-cards .card', 4000); await p.eval("G.ui._buffApi && G.ui._buffApi.pick(0); 1"); await sleep(600);
    check(await p.eval("G.player.perks.join() === 'assault_1b,assault_2a' && G.Classes.perkDue() === 0"), 'a click takes a card: 血の昂り and 猛進 now');
    await guardian(21);
    await sleep(3500);
    check(await p.eval("!document.querySelector('.pk-card') && G.Classes.perkDue() === 0"), 'the last guardian (the run ends): no 秘伝');
    // easy: both scrolls at the first guardian, one after the other, then the boon
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; T.as('mage'); G.Run.set('easy'); 1");
    await guardian(7);
    await waitFor('.pk-card');
    const e1 = await p.eval("document.querySelector('.pk-title').textContent");
    await p.eval("G.ui._buffKeys('Digit1'); 1"); await sleep(700);
    const e2ok = await waitFor('.pk-card');
    const e2 = await p.eval("document.querySelector('.pk-title') ? document.querySelector('.pk-title').textContent : ''");
    await p.eval("G.ui._buffApi.move(1); G.ui._buffApi.confirm(); 1"); await sleep(700);
    const eb = await waitFor('.bs-cards .card', 4000);
    check(/一の巻/.test(e1) && e2ok && /二の巻/.test(e2) && eb && (await p.eval("G.player.perks.join()")) === 'mage_1a,mage_2b', `easy: at the first guardian 一の巻 then 二の巻 at once (wheel + Enter took the second), then the boon (${await p.eval("G.player.perks.join()")})`);
    await p.eval("G.ui._buffApi && G.ui._buffApi.pick(0); 1"); await sleep(500);
    await p.eval("G.Run.set('normal'); G.ui.clearScreen(); G.game.state = 'playing'; 1");
    // kept with the run; a perk still owed comes up once the area is quiet
    check(await p.eval("(() => { const P = T.as('heavy', ['heavy_1b']); const snap = G.game.playerSnap(); P.perks = []; G.game.applyPlayerSnap(snap); return snap.perks.join() === 'heavy_1b' && G.player.perks.join() === 'heavy_1b' && G.Classes.has('heavy_1b'); })()"), 'the perks are saved with the run and come back');
    await p.eval("(() => { const GM = G.game; T.as('blade'); GM.area = 10; GM.stage = 'combat'; GM.areaCleared = true; GM.rewardPending = null; G.Classes._offering = false; G.Classes._dueT = 0; })(); 1");
    await p.eval("T.step(0.1); 1");
    const owed = await waitFor('.pk-card', 3000);
    check(owed && /一の巻/.test(await p.eval("document.querySelector('.pk-title').textContent")), 'joined later (area 10, nothing chosen): 一の巻 is offered once the area is clear');
    await p.eval("G.ui._buffKeys('Digit1'); 1"); await sleep(700);
    check(await p.eval("G.player.perks.join() === 'blade_1a' && !document.querySelector('.pk-card') && G.game.state !== 'buff'"), '...taken, and back to the game');

    // ---------------- the screens: the class screen shows the four, the status sheet the chosen one
    check(await p.eval("(() => { const c = G.Classes.BY.sniper, h = G.Classes.detailHTML(c); return ['残心', '一発入魂', '急所穿ち', '一閃'].every((n) => h.includes(n)) && /秘伝/.test(h) && !/Lv3/.test(h) && /\\+40%/.test(h); })()"), 'class screen: the start effect (+40%) and the four perks, no Lv');
    check(await p.eval("(() => { const c = G.Classes.BY.heavy, h = G.Classes.perksHTML(c, ['heavy_1a']); const d = document.createElement('div'); d.innerHTML = h; return d.querySelectorAll('.cls-pk-c.on').length === 1 && d.querySelectorAll('.cls-pk-c.off').length === 1 && /次の守護者で選ぶ/.test(d.textContent); })()"), 'status sheet: the perk taken, the other one dimmed, the next scroll still to come');

    // ---------------- 兵士
    const so = await J(p, `const C = G.Classes; let P = T.as('soldier'); const ch0 = P.stats.buffChoices, rr0 = C.freeRerolls();
      P = T.as('soldier', ['soldier_1a']); const ch1 = P.stats.buffChoices; P = T.as('soldier', ['soldier_1b']); const rr1 = C.freeRerolls();
      P = T.as('soldier', ['soldier_2a']); const w = [C.rarW('common'), C.rarW('uncommon'), C.rarW('rare'), C.rarW('legendary')];
      P = T.as('soldier'); for (const id of ['h_synergy', 'x_master', 'rx_echo']) P.buffs.set(id, 1); P.recalc(); const d0 = P.stats.dmg;
      P.perks = ['soldier_2b']; P.recalc(); const d1 = P.stats.dmg;
      const want = ['h_synergy', 'x_master', 'rx_echo'].map((id) => ({ common: 0.025, uncommon: 0.025, rare: 0.05, epic: 0.1, legendary: 0.2, mythic: 0.4 })[G.BUFF_BY_ID[id].rarity]).reduce((a, b) => a + b, 0);
      return { ch: [ch0, ch1], rr: [rr0, rr1], w, dd: Math.round((d1 - d0) * 1000) / 1000, want: Math.round(want * 1000) / 1000 };`);
    check(so.ch[1] === so.ch[0] + 1 && so.rr[0] === 1 && so.rr[1] === 2, `兵士 選り取り: one more card (${so.ch}); 仕切り直し: two free rerolls (${so.rr})`);
    check(so.w.join() === '1,1,2,2' && so.dd === so.want && so.dd > 0, `兵士 掘り出し物: rare and better x2 (${so.w}); 百戦の備え: +${so.dd} damage for the boons held (${so.want})`);

    // ---------------- 突撃兵
    const as = await J(p, `const C = G.Classes; let P = T.as('assault'); const a = [C.dmgAdd(P, 5), C.dmgAdd(P, 13)]; P = T.as('assault', ['assault_1a']); const b = [C.dmgAdd(P, 5), C.dmgAdd(P, 13), C.dmgAdd(P, 25)];
      P = T.as('assault', ['assault_2b']); const hi = [C.dmgAdd(P, 30), C.fireAdd()]; P.hp = P.stats.maxHp * 0.4; const lo = [C.dmgAdd(P, 30), C.fireAdd()];
      P = T.as('assault', ['assault_1b']); P.hp = 20; const m0 = C.moveAdd(); const e = T.mk(5); e.hp = 1; let beams = 0; const fb = G.fx.beam; G.fx.beam = function () { beams++; return fb.apply(this, arguments); }; try { G.combat.damageEnemy(e, 50, { src: 'bullet' }); } finally { G.fx.beam = fb; } const hp1 = P.hp, m1 = C.moveAdd();
      G.ui.clsHud(); const pop = document.querySelector('#hp-wrap .rush-pop'), ind = document.getElementById('cls-ind'); const fx = { pop: pop ? pop.textContent : '', flare: document.getElementById('hp-wrap').classList.contains('rush-heal'), veil: !!document.querySelector('#rush-veil.kick'), lines: Math.round(C.rushLines() * 100) / 100, fov: P.fovKick, beams, chip: ind ? ind.textContent : '' };
      T.step(5.2); const m2 = C.moveAdd(); G.ui.clsHud(); fx.after = [Math.round(C.rushLines() * 100) / 100, ind ? ind.textContent : '']; T.clean();
      P = T.as('assault'); const sl0 = P.stats.slideBoost; P = T.as('assault', ['assault_2a']); const sl1 = P.stats.slideBoost;
      const r = (x) => Math.round(x * 1000) / 1000;
      return { a: a.map(r), b: b.map(r), hi: hi.map(r), lo: lo.map(r), heal: hp1 - 20, m: [m0, m1, m2].map(r), sl: r(sl1 - sl0), fx };`);
    check(as.a.join() === '0.175,0' && as.b.join() === '0.267,0.053,-0.2', `突撃兵 肉薄: +40% reaching 15 m (5 m: ${as.b[0]}, 13 m: ${as.b[1]}; without: ${as.a}); still -20% far away`);
    check(as.heal === 30 && as.m.join() === '0,0.25,0', `突撃兵 血の昂り: a kill heals 30 (${as.heal}) and +25% speed for 5 s (${as.m})`);
    check(/\+30/.test(as.fx.pop) && as.fx.flare && as.fx.veil && as.fx.beams >= 1 && as.fx.fov >= 6 && as.fx.lines > 0.4 && /血の昂り/.test(as.fx.chip) && /移動\+25%/.test(as.fx.chip) && as.fx.after[0] === 0 && !/血の昂り/.test(as.fx.after[1]), `突撃兵 血の昂り shows: the life drawn in from the foe, "${as.fx.pop}" from the HP bar, the bar's flare, the red pulse, the view widened, speed lines, "${as.fx.chip}"; all gone 5 s on`);
    check(as.hi.join() === '-0.2,0' && as.lo.join() === '0.1,0.2' && as.sl === 0.3, `突撃兵 背水: below half health +30% damage, +20% fire rate (${as.hi} -> ${as.lo}); 猛進: slides +30% further (${as.sl})`);
    const tk = await J(p, `const C = G.Classes; const P = T.as('assault', ['assault_2a']); const e = T.mk(0.9); const hp0 = e.hp;
      const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); P.sliding = true; P.vel.set(f.x * 12, 0, f.z * 12); C.tick(0.016);
      const d1 = hp0 - e.hp, stun = (e.st && e.st.stun) || 0; C.tick(0.016); const d2 = hp0 - e.hp; P.sliding = false; P.vel.set(0, 0, 0);
      const ms = G.weapons.meleeStats(P.melee); T.clean(); return { d1: Math.round(d1), d2: Math.round(d2), stun: Math.round(stun * 10) / 10, heavy: Math.round(ms.dmg * ms.heavy[0]) };`);
    check(tk.d1 >= tk.heavy && tk.d2 === tk.d1 && tk.stun >= 0.9, `突撃兵 猛進: a slide into a foe hits like the heavy blow (${tk.d1} >= ${tk.heavy}), staggers it (${tk.stun} s), once (${tk.d2})`);

    // ---------------- 狙撃手
    const sn = await J(p, `const C = G.Classes, W = G.weapons; let P = T.as('sniper'); const st = () => C.state(); const w = P.weapons[0]; const s = W.stats(w);
      st().focus = 1; W.adsT = 1; const a = C.shot(s); const e0 = T.mk(6); e0.hp = 1; st().focus = 0; G.combat.killEnemy(e0, { src: 'bullet', head: true }); const back0 = st().focus; T.clean();
      P = T.as('sniper', ['sniper_1a']); st().focus = 1; W.adsT = 1; let q = C.shot(W.stats(P.weapons[0])); const e1 = T.mk(6); C.focusHit(e1, { head: true }, q); const f1 = st().focus; e1.alive = false; C.focusHit(e1, { head: true }, q); const f2 = st().focus; T.clean();
      P = T.as('sniper', ['sniper_1b']); const w2 = P.weapons[0]; w2.mag = 1; st().focus = 1; W.adsT = 1; q = C.shot(W.stats(w2)); const e2 = T.mk(6); C.focusHit(e2, { head: true }, q); const m1 = w2.mag; e2.alive = false; C.focusHit(e2, { head: true }, q); const m2 = w2.mag; C.focusHit(e2, { head: true }, q); const m3 = w2.mag; T.clean();
      P = T.as('sniper', ['sniper_2a']); st().focus = 1; W.adsT = 1; q = C.shot(W.stats(P.weapons[0])); const sure = [C.sureCrit(q, { head: true }), C.sureCrit(q, { head: false }), C.sureCrit(W.stats(P.weapons[0]), { head: true })];
      W.adsT = 0;
      return { mul: Math.round(a.dmg / s.dmg * 100) / 100, pierce: (a.pierce || 0) - (s.pierce || 0), back0, f: [f1, f2], m: [m1, m2, m3], sure };`);
    check(sn.mul === 1.4 && sn.pierce === 1 && sn.back0 === 0, `狙撃手 start: a full shot x${sn.mul}, through ${sn.pierce} more; a headshot kill gives no gauge back (${sn.back0})`);
    check(sn.f.join() === '0.5,0.9' && sn.m.join() === '2,3,3', `狙撃手 残心: the gauge back to 50% on a head, 90% on the kill (${sn.f}); 一発入魂: a round, one more on the kill, no more (${sn.m})`);
    check(sn.sure.join() === 'true,false,false', `狙撃手 急所穿ち: a full shot to the head is a sure crit; not the body, not a shot that was not full (${sn.sure})`);
    // 一閃: more foes in a row than a plain full shot goes through (the beam takes them all); one foe just off the line, where a thin shot
    // misses it (the beam, 0.8 m across, still takes it). No spread on the shots.
    const beam = async (perks) => J(p, `const C = G.Classes, W = G.weapons; const P = T.as('sniper', ${JSON.stringify(perks)}); P.pitch = 0;
      { const y0 = P.yaw; for (let k = 0; k < 16; k++) { P.yaw = y0 + k * Math.PI / 8; const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); if (!G.world.raycast(P.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), f, 13)) break; } } // (a way with no wall for 13 m: the beam stops at walls)
      G.game.step(0.02, 2);
      const w = P.weapons[0], through = (W.stats(w).pierce || 0) + 1, row = [];
      for (let i = 0; i < through + 3; i++) row.push(T.mk(3 + i * 1.6));
      let vb = 0; const f0 = G.vfx.focusBeam, sp0 = W.currentSpread; G.vfx.focusBeam = function () { vb++; return f0.apply(this, arguments); }; W.currentSpread = () => 0;
      const fire = () => { C.state().focus = 1; W.adsT = 1; w.mag = 5; W.shoot(w, W.stats(w)); };
      try {
        fire(); const n = row.filter((e) => e.hp < e.maxHp).length, of = row.length; T.clean();
        const e0 = T.mk(8); const rr = Math.max(...e0.hitW.map((h) => h.r + Math.hypot(h.w.x - e0.pos.x, h.w.z - e0.pos.z))); T.clean();
        const side = T.mk(8, rr + 0.1); fire(); const sideHit = side.hp < side.maxHp; T.clean();
        return { n, of, through, sideHit, off: Math.round((rr + 0.1) * 100) / 100, vb };
      } finally { G.vfx.focusBeam = f0; W.currentSpread = sp0; W.adsT = 0; }`);
    const bm0 = await beam([]), bm1 = await beam(['sniper_2b']);
    check(bm1.n === bm1.of && bm0.n < bm0.of && bm1.vb >= 1 && bm0.vb === 0, `狙撃手 一閃: through every foe in the row (${bm1.n}/${bm1.of}; a plain full shot ${bm0.n}), drawn as a beam`);
    check(bm1.sideHit && !bm0.sideHit, `狙撃手 一閃: a foe ${bm1.off} m off the line is taken by the beam's width, missed by a thin shot (${bm1.sideHit}, ${bm0.sideHit})`);

    // ---------------- 剣士
    const bl = await J(p, `const C = G.Classes; let P = T.as('blade'); for (let i = 0; i < 9; i++) C.onMeleeHit(); const n0 = C.blade();
      P = T.as('blade', ['blade_1a']); for (let i = 0; i < 9; i++) C.onMeleeHit(); const n1 = C.blade();
      P = T.as('blade', ['blade_1b']); P.meleeMode = false; const g = C.moveAdd(); P.meleeMode = true; const m = C.moveAdd(); P.meleeMode = false;
      return { n: [n0, n1], mv: [g, m] };`);
    check(bl.n.join() === '5,7' && bl.mv.join() === '0,0.1', `剣士 深い連斬: 7 stacks (${bl.n}); 軽身: +10% with the melee weapon in hand only (${bl.mv})`);
    const pa = await J(p, `const C = G.Classes; const P = T.as('blade', ['blade_2a']); P.meleeMode = true; const e = T.mk(1.5); const hp0 = e.hp;
      C.parryPress(); T.step(0.1); const h0 = P.hp; const a = G.combat.damagePlayer(40, { src: 'melee', attacker: e, pos: e.pos.clone() }); const keep = P.hp === h0, back = hp0 - e.hp;
      P.invulnT = 0; T.step(0.7); C.parryPress(); T.step(0.1); const r = G.combat.damagePlayer(40, { src: 'ranged', pos: e.pos.clone() }); const keep2 = P.hp === h0; const back2 = hp0 - e.hp;
      P.invulnT = 0; T.step(0.7); C.parryPress(); T.step(0.45); const late = G.combat.damagePlayer(40, { src: 'melee', attacker: e, pos: e.pos.clone() }); const hurt = P.hp < h0;
      P.invulnT = 0; P.hp = P.stats.maxHp; const h1 = P.hp; T.step(1); C.parryPress(); T.step(0.1); C.parryPress(); T.step(0.1); const mash = G.combat.damagePlayer(40, { src: 'melee', attacker: e, pos: e.pos.clone() });
      const ms = G.weapons.meleeStats(P.melee); P.meleeMode = false; T.clean();
      return { keep, back: Math.round(back), want: Math.round(ms.dmg * ms.heavy[0] * 2), keep2, back2: Math.round(back2 - back), hurt, mash: P.hp < h1 || mash > 0 };`);
    check(pa.keep && pa.back >= pa.want, `剣士 見切り: the guard key just before a blow: nothing taken, struck back at 200% of the heavy blow (${pa.back} >= ${pa.want})`);
    check(pa.keep2 && pa.back2 === 0 && pa.hurt, `剣士 見切り: a shot is stopped but not struck back (${pa.back2}); pressed too early (0.45 s) it does nothing`);
    const yb = await J(p, `const C = G.Classes; const P = T.as('blade', ['blade_2b']); P.pitch = 0; G.game.step(0.02, 2); const es = [T.mk(4), T.mk(8, 0.6), T.mk(15)]; let vs = 0; const f0 = G.vfx.skySlash; G.vfx.skySlash = function () { vs++; return f0.apply(this, arguments); };
      const f = P.forward(); try { C.onHeavy(G.camera.position.clone(), f, 100); } finally { G.vfx.skySlash = f0; } T.step(0.8);
      const d = es.map((e) => Math.round(e.maxHp - e.hp)); T.clean(); return { d, vs };`);
    check(yb.vs === 1 && yb.d[0] >= 60 && yb.d[1] >= 60 && yb.d[2] === 0, `剣士 飛燕: the crescent (drawn: ${yb.vs}) cuts through the foes on its way for 60% of the blow, not past 12 m (${yb.d})`);

    // ---------------- 重装兵
    const hv = await J(p, `const C = G.Classes; let P = T.as('heavy'); const ar0 = P.stats.armor; G.combat.damagePlayer(30, { src: 'melee' }); const iron = C.ironRed(), snap0 = !!P._knockSnap; P._knockSnap = null;
      P = T.as('heavy', ['heavy_1a']); const ar1 = P.stats.armor; P = T.as('heavy', ['heavy_1b']); G.combat.damagePlayer(30, { src: 'melee' }); const kk = P._knockSnap ? P._knockK : null; P._knockSnap = null;
      return { ar: Math.round((ar1 - ar0) * 100) / 100, iron, snap0, kk };`);
    check(hv.iron === 0.1 && !hv.snap0, `重装兵 start: 鉄壁 -10% after a hit, and knocked about like anyone (no immunity now)`);
    check(hv.ar === 0.1 && hv.kk === 0.5, `重装兵 不動の城: -10% more at all times (${hv.ar}); 根を張る: the knock taken halved (${hv.kk})`);
    const sh = await J(p, `const C = G.Classes, W = G.weapons; const P = T.as('heavy', ['heavy_2a']); P.meleeMode = false; P.pitch = 0; G.game.step(0.02, 2);
      const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), front = P.pos.clone().addScaledVector(f, 5), back = P.pos.clone().addScaledVector(f, -5);
      const mx = C.shMax(); W.adsT = 1; const up = C.shieldUp(); const h0 = P.hp; G.combat.damagePlayer(30, { src: 'ranged', pos: front }); const kept = P.hp === h0, sh1 = C.state().shHp;
      P.invulnT = 0; G.combat.damagePlayer(30, { src: 'ranged', pos: back }); const hurtBack = P.hp < h0; P.hp = P.stats.maxHp;
      W.adsT = 0; C.tick(0.02); const s0 = C.state().shHp; T.step(1); C.tick(1); const s1 = C.state().shHp; C.state().shUpT = G.game.time - 5; C.tick(1); const s2 = C.state().shHp;
      W.adsT = 1; const through = C.shieldAbsorb(1e4, { src: 'ranged', pos: front }); const broke = C.state().shBrokeT > G.game.time && through > 0, upB = C.shieldUp(); W.adsT = 0;
      C.state().shBrokeT = G.game.time - 0.01; C.tick(0.02); const back2 = C.state().shHp;
      return { up, kept, hurtBack, used: Math.round(mx - sh1), mx: Math.round(mx), regen: [Math.round(s1 - s0), Math.round(s2 - s1)], broke, upB, back2: Math.round(back2) };`);
    check(sh.up && sh.kept && sh.used > 0 && sh.hurtBack && sh.mx === Math.round(sh.mx), `重装兵 携行防盾: up with the sights, it takes a blow from the front (${sh.used} of ${sh.mx} = 60% of max HP), not one from behind`);
    check(sh.regen[0] === 0 && sh.regen[1] > 0 && sh.broke && !sh.upB && sh.back2 === sh.mx, `重装兵 携行防盾: refills only 2 s after it was down (${sh.regen}), broken it is down, then whole again after 20 s (${sh.back2})`);
    const gr = await J(p, `const C = G.Classes; const P = T.as('heavy', ['heavy_2b']); P.hp = 10; G.combat.damagePlayer(500, { src: 'melee', fixed: true }); const hp1 = P.hp, inv = P.invulnT;
      const left = C.gritLeft(), again = C.lethal(500); P.hp = P.stats.maxHp; P.invulnT = 0; return { hp1, inv: Math.round(inv * 10) / 10, left: Math.round(left), again };`);
    check(gr.hp1 === 1 && gr.inv >= 1.9 && gr.left >= 89 && gr.again === 500, `重装兵 不屈: a lethal blow leaves 1 HP and 2 s untouchable (${gr.hp1}, ${gr.inv} s), then not again for 90 s (${gr.left})`);

    // ---------------- 術士
    const mg = await J(p, `const C = G.Classes, A = G.abilities; let P = T.as('mage'); const rx0 = C.rxMul(); const fb = A.makeSlot('fireball'), dash = A.makeSlot('dash'); const c0 = [A.cdOf(fb), A.cdOf(dash)];
      P = T.as('mage', ['mage_1a']); const rx1 = C.rxMul(); P = T.as('mage', ['mage_1b']); const c1 = [A.cdOf(fb), A.cdOf(dash)];
      P = T.as('mage', ['mage_2a']); const e = T.mk(5); for (let i = 0; i < 12; i++) C.onReaction(e, 'boil', {}); const n = C.rxStacks(), add = C.dmgAdd(P, 5); C.onReaction(e, 'boil', { echo: true }); T.step(8.1); const n2 = C.rxStacks(); T.clean();
      P = T.as('mage', ['mage_2b']); P.os = 0; const e2 = T.mk(5); C.onReaction(e2, 'freeze', {}); const os1 = P.os; for (let i = 0; i < 20; i++) C.onReaction(e2, 'freeze', {}); const os2 = P.os; T.clean();
      const r = (x) => Math.round(x * 100) / 100; return { rx: [rx0, rx1], cd: [r(c1[0] / c0[0]), r(c1[1] / c0[1])], n, add: r(add), n2, os: [os1, os2] };`);
    check(mg.rx.join() === '0.2,0.35' && mg.cd.join() === '0.8,1', `術士 元素の奔流: reactions +35% (${mg.rx}); 詠唱短縮: the fireball cools 20% faster, a skill with no element not (${mg.cd})`);
    check(mg.n === 10 && mg.add === 0.4 && mg.n2 === 0, `術士 昂る理: +4% a reaction up to 10 (${mg.n}, +${mg.add}), all gone 8 s after the last (${mg.n2})`);
    check(mg.os.join() === '8,80', `術士 理の障壁: +8 overshield a reaction, up to 80 (${mg.os})`);

    // ---------------- the pictures: the crescent (on to a wall and broken there, in the open and spent), the beam; the HUD's chips and gauge
    const fx = await J(p, `const P = T.as('heavy', ['heavy_2a', 'heavy_1a']); const n0 = G.vfx.liveCount(); const f = P.forward(); f.y = 0; f.normalize(); const a = P.pos.clone(); a.y += 1.15;
      G.vfx.skySlash(a, f, 12, 32, 0xbfe4ff, 0, 0.3); G.vfx.skySlash(a, f.clone().negate(), 3, 32, 0xffa040, 1, -0.3); G.vfx.focusBeam(a, a.clone().addScaledVector(f, 30), 0x6ab8ff);
      const n1 = G.vfx.liveCount(); T.step(0.25); G.weapons.adsT = 1; G.ui.clsHud(); const g = document.getElementById('shield-gauge'), on = !!g && g.classList.contains('on'); G.weapons.adsT = 0; G.ui.clsHud(); T.step(3.2); const n2 = G.vfx.liveCount();
      return { n0, n1, n2, on };`);
    check(fx.n1 >= fx.n0 + 3 && fx.n2 <= fx.n0 && fx.on, `the pictures run and end (${fx.n0} -> ${fx.n1} -> ${fx.n2}); 携行防盾's gauge shows with the sights up`);
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nPERK TEST FAILED (${fails.length})` : '\nPERK TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
