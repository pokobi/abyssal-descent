'use strict';
// The last foes of a fight, and the sky under a roof:
//  - two or fewer foes left (or nobody fighting for 20 s): each is pointed at (a 💀 mark), and one far off and out of sight is brought in;
//  - in the rain, nobody under a roof gets wet (you or a foe), and out in the open everyone does.
//   node tests/rest_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9987;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await p.eval("const ob = G.game.offerBuffs; G.game.offerBuffs = function () { (window.__ob = window.__ob || []).push(G.game.time.toFixed(1) + ' ' + new Error().stack.split(String.fromCharCode(10)).slice(2, 6).map((l) => l.trim().slice(0, 90)).join(' < ')); return ob.apply(this, arguments); }; 1");
    await sleep(500);
    const gt = () => p.eval('G.game.time');
    const waitT = async (dt) => { const t0 = await gt(); await p.until(`G.game.time - ${t0} > ${dt}`, 90000); };
    const enter = async (field, n) => {
      await p.eval(`G.Run.field = () => '${field}'; G.game.area = ${n - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(${n}, 'combat'); 1`);
      await p.until(`G.world && G.world.biome === '${field}' && !!G.game.objective`, 40000);
      await sleep(600);
      // the area's own waves are stopped: only the foes set down here
      await p.eval("(() => { G.enemies.clear(); const O = G.game.objective; O.wave = O.waves.length; G.ui.clearScreen(); G.game.state = 'playing'; G.game.dev = { god: true, speed: 1 }; })(); 1");
    };
    // (setting foes down after the area's own were cleared away: the area must not count as cleared, nor its reward screen come up)
    const settle = () => p.eval("G.game.areaCleared = false; G.game.rewardPending = null; G.ui.clearScreen(); G.game.state = 'playing'; 1");
    const DEF = "G.ENEMIES.filter((d) => !d.flyer && !d.boss && G.ENEMY_BY_ID[d.id] && !d.revive && !d.ranged)[2]";
    // a foe set down at a reachable spot picked by pred(x, y, z), standing still
    const foeAt = (pred) => p.eval(`(() => { const w = G.world, P = G.player; const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => (!w.reachMask || w.reachMask[idx]) && (${pred})(x, w.nf[idx], z));
      if (!c) return -1; const e = G.enemies.spawn(${DEF}, 3, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true, noReward: true }); e.speed = 0; e.atkCd = 99; e.lastHitT = -99; (window.__F = window.__F || []).push(e); return window.__F.length - 1; })()`);
    const farHidden = "(x, y, z) => { const P = G.player; return Math.hypot(x - P.pos.x, z - P.pos.z) > 30 && !G.world.los(new THREE.Vector3(x, y + 1.2, z), G.player.eye ? G.player.eye() : new THREE.Vector3(P.pos.x, P.pos.y + 1.6, P.pos.z)); }";

    // ================= the last foes
    await enter('hamlet', 3);
    await p.eval('window.__F = []; G.player.lastHurtT = G.game.time; 1');
    for (let i = 0; i < 4; i++) await foeAt(farHidden);
    await settle();
    check(await p.eval('window.__F.length === 4 && window.__F.every((e) => e && e.alive)'), 'four foes set down far off, out of sight');
    await sleep(300);
    check(await p.eval('G.enemies.restSet() === null && !document.querySelector(".tgt-edge.rest:not([style*=\\"none\\"])")'), 'four left in a fight just begun: none pointed at');
    await p.eval('window.__F.slice(0, 2).forEach((e) => G.combat.damageEnemy(e, 1e9, { src: "test" })); 1');
    await settle();
    await sleep(600);
    const marks = await p.eval('[...document.querySelectorAll(".tgt-edge.rest")].filter((m) => m.style.display !== "none").length');
    if (marks !== 2) console.log('  diag2', await p.eval('JSON.stringify({ st: G.game.state, cl: G.game.areaCleared, obj: !!G.game.objective, stage: G.game.stage, n: G.enemies.list.filter((e) => e.alive).length, ob: window.__ob || [] })'));
    check(await p.eval('(G.enemies.restSet() || new Set()).size') === 2 && marks === 2, `two left: both pointed at (${marks} marks)`);
    // nobody fighting for a while: every foe left is pointed at
    for (let i = 0; i < 3; i++) await foeAt(farHidden);
    await settle();
    await sleep(300);
    check(await p.eval('G.enemies.restSet() === null'), 'five left again, a fight going on: none pointed at');
    await p.eval('G.game.areaStartT = G.game.time - 30; G.player.lastHurtT = -99; G.enemies.list.forEach((e) => { e.lastHitT = -99; }); 1');
    await sleep(400);
    check(await p.eval('(G.enemies.restSet() || new Set()).size') === 5, 'nobody fighting for 20 s: all five pointed at');
    // one far off and out of sight that keeps wandering (never still long enough for the stuck-foe failsafe) is brought in
    await p.eval('window.__F.forEach((e, i) => { if (i !== 2 && e.alive) G.combat.damageEnemy(e, 1e9, { src: "test" }); }); 1');
    if (!(await p.eval('!!(window.__F[2] && window.__F[2].alive)'))) { const k = await foeAt(farHidden); await p.eval(`window.__F[2] = window.__F[${k}]; 1`); }
    await settle();
    await p.eval('window.__keep = setInterval(() => { const e = window.__F[2]; if (e) { e._stN = 0; } if (G.game.areaCleared || G.game.rewardPending) { G.game.areaCleared = false; G.game.rewardPending = null; } }, 300); 1');
    const d0 = await p.eval('(() => { const e = window.__F[2], P = G.player; return Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); })()');
    const n0 = await p.eval('G.enemies.pulled || 0');
    await waitT(14);
    const d1 = await p.eval('(() => { const e = window.__F[2], P = G.player; return Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z); })()');
    if (!(d1 < 21)) console.log('  diag3', await p.eval('JSON.stringify({ alive: window.__F[2].alive, rest: (G.enemies.restSet() || new Set()).size, cl: G.game.areaCleared, st: G.game.state, n: G.enemies.list.filter((e) => e.alive).length, ob: window.__ob || [] })'));
    check((await p.eval('G.enemies.pulled || 0')) > n0 && d1 < 21, `the last one, far off and out of sight, is brought in (${d0.toFixed(0)} m -> ${d1.toFixed(0)} m)`);
    await p.eval('clearInterval(window.__keep); 1');

    // ================= the sky under a roof
    await enter('hamlet', 4);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    await p.eval("window.__F = []; G.world.sky = Object.assign({}, G.world.sky || {}, { id: 'rain', name: '雨夜', el: 'water', bolt: false }); 1");
    const spot = (roof) => p.eval(`JSON.stringify((() => { const w = G.world, W = G.Weather; const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => (!w.reachMask || w.reachMask[idx]) && W.roofed(x, w.nf[idx], z, 1.8) === ${roof} && w.boxFree(x - 0.4, w.nf[idx] + 0.1, z - 0.4, x + 0.4, w.nf[idx] + 1.8, z + 0.4)); return c; })())`).then(JSON.parse);
    const under = await spot(true), open = await spot(false);
    check(!!under && !!open, `a spot under a roof and one in the open (${under && [under.x, under.y, under.z].map((v) => v.toFixed(1))} / ${open && [open.x, open.y, open.z].map((v) => v.toFixed(1))})`);
    if (under && open) {
      const stand = (s) => settle().then(() => p.eval(`(() => { const P = G.player; P.pos.set(${s.x}, ${s.y} + 0.02, ${s.z}); P.vel.set(0, 0, 0); P.au = null; P._envBare = 0; })(); 1`));
      await stand(under); await waitT(4);
      const a1 = await p.eval('G.Elem.playerAura() || "-"');
      await stand(open); await waitT(4);
      const a2 = await p.eval('G.Elem.playerAura() || "-"');
      if (a2 !== 'water') console.log('  ob', await p.eval('JSON.stringify(window.__ob || [])'));
      if (a2 !== 'water') console.log('  diag', await p.eval('JSON.stringify({ sky: G.world.sky && G.world.sky.el, st: G.game.state, pos: [G.player.pos.x, G.player.pos.y, G.player.pos.z].map((v) => +v.toFixed(1)), roof: G.Weather.roofed(G.player.pos.x, G.player.pos.y, G.player.pos.z, 1.7), dead: G.player.dead, bare: G.player._envBare, t: G.game.time })'));
      check(a1 === '-' && a2 === 'water', `in the rain: under a roof you stay dry (${a1}), in the open you get wet (${a2})`);
      // two foes, one under the roof and one in the open (you stand elsewhere, under the roof)
      await stand(under);
      const fu = await p.eval(`(() => { const e = G.enemies.spawn(${DEF}, 3, new THREE.Vector3(${under.x}, ${under.y}, ${under.z}), { noLoot: true, noReward: true }); e.speed = 0; e.atkCd = 99; window.__U = e; return 1; })()`);
      const fo = await p.eval(`(() => { const e = G.enemies.spawn(${DEF}, 3, new THREE.Vector3(${open.x}, ${open.y}, ${open.z}), { noLoot: true, noReward: true }); e.speed = 0; e.atkCd = 99; window.__O = e; return 1; })()`);
      await waitT(4.5);
      const eu = await p.eval('(window.__U.alive && G.Weather.roofed(window.__U.pos.x, window.__U.pos.y, window.__U.pos.z, window.__U.height)) ? (G.Elem.auraOf(window.__U) || "-") : "moved"');
      const eo = await p.eval('G.Elem.auraOf(window.__O) || "-"');
      check(fu && fo && eu === '-' && eo === 'water', `in the rain: a foe under a roof stays dry (${eu}), one in the open gets wet (${eo})`);
    }
    check(p.errs.length === 0, `no page errors${p.errs.length ? ' — ' + p.errs.slice(0, 2).join(' | ').slice(0, 300) : ''}`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nREST TEST FAILED (${fails.length})` : '\nREST TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
