'use strict';
// What a two-player test run turned up: a grave a guest wakes, the trial's clock when someone else's time runs out, and being brought into the guardian's hall from the road.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9973;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'P' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    const settle = async () => { await h.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1"); await g.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1"); };
    const go = async (n, kind) => {
      await h.eval(`G.game.area = ${n} - 1; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
      await g.eval(`G.Coop.fpOk = undefined; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
      await h.eval(`G.Coop.go(${n}, '${kind}'); 1`);
      await g.until(`G.game.area === ${n} && G.game.stage === '${kind}' && G.Coop.fpOk !== undefined`, 25000).catch(async (e) => { console.log('H', await h.eval('JSON.stringify([G.game.area, G.game.stage, G.game.state, G.game.transitioning])'), 'G', await g.eval('JSON.stringify([G.game.area, G.game.stage, G.game.state, G.Coop.fpOk, G.Coop.fpMsg])')); throw e; });
      await sleep(500);
      await settle();
    };

    // ---- a grave the guest wakes
    await sleep(1000);
    const add = `(() => { const P = G.player, w = G.world, x = ${'__X__'}, z = ${'__Z__'}; w.graves = []; G.Graves.add(w, x, w.floorBelow(x, 4, z), z, 0); G.Graves.build(w); return G.Graves.list.length; })()`;
    const spot = JSON.parse(await g.eval('JSON.stringify([G.player.pos.x + 1, G.player.pos.z + 1])'));
    const put = add.replace('__X__', spot[0]).replace('__Z__', spot[1]);
    await h.eval(put); await g.eval(put);
    await h.eval(`G.player.pos.set(${spot[0]} + 40, G.player.pos.y, ${spot[1]}); 1`);
    await settle();
    const n0 = await h.eval('G.enemies.list.filter((e) => e.alive && e.graveSpawn).length');
    await g.until('G.Graves.list.length === 0', 9000).catch(() => {});
    check(await g.eval('G.Graves.list.length') === 0, 'the grave the guest stands by opens');
    await h.until(`G.enemies.list.filter((e) => e.alive && e.graveSpawn).length > ${n0}`, 3000).catch(() => {});
    check(await h.eval(`G.enemies.list.filter((e) => e.alive && e.graveSpawn).length`) > n0, 'the host raises its foe');
    await g.until('G.enemies.list.some((e) => e.alive && e.graveSpawn)', 3000).catch(() => {});
    check(await g.eval('G.enemies.list.some((e) => e.alive && e.graveSpawn)'), 'the guest sees it, marked as a grave foe');
    check(await h.eval('G.Graves.list.length') === 0, 'and the grave is gone for the host too');

    // ---- the trial: the guest's time runs out first
    await go(2, 'trial');
    await h.eval('G.game.objective.countdown = 0; 1');
    await g.eval('G.game.objective.countdown = 0; 1');
    await h.until("!!document.getElementById('trial-clock')", 5000).catch(() => {});
    check(await h.eval("!!document.getElementById('trial-clock')"), 'the trial clock is up on the host');
    await g.eval('G.game.objective.t = G.game.objective.dur; 1');
    await h.until('G.game.areaCleared === true', 5000).catch(() => {});
    await sleep(300);
    check(await h.eval("G.game.areaCleared === true"), "the round ends for the host with the guest's");
    check(await h.eval("!document.getElementById('trial-clock') && !document.getElementById('trial-vig')"), "and the host's clock is taken down");

    // ---- brought into the hall from the road, for each kind of arena
    let n = 3;
    for (const id of ['warden', 'abyssking', 'broodmother', 'sovereign']) {
      n += 4;
      await h.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); 1`);
      await g.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); 1`);
      await go(n, 'boss');
      const info = await h.eval(`(() => { const w = G.world, P = G.player, z = (w.ledgeZ ? w.ledgeZ - 1 : w.arenaD - 2) + 8, x = w.bossGate ? w.bossGate.x : w.W / 2, s = w.spawn; let y = s.y; for (let q = s.z; q > z; q -= 0.5) y = w.floorBelow(x, y + 1.3, q); P.pos.set(x, y, z); P.vel.set(0, 0, 0); return JSON.stringify({ y, z, ledge: w.ledgeZ || 0, arena: w.bossStyle && w.bossStyle.arena, ad: w.arenaD }); })()`);
      console.log('    ', id, info);
      // the door opens once for good when both stand in front of it
      const door = (w) => `(() => { const w = G.world, z = (w.ledgeZ ? w.ledgeZ - 1 : w.arenaD - 2) + 2, P = G.player; P.pos.set(w.bossGate ? w.bossGate.x : w.W / 2, P.pos.y, z); P.vel.set(0, 0, 0); })(); 1`;
      await h.eval(door()); await g.eval(`(() => { const w = G.world, P = G.player, s = w.spawn, x = w.bossGate ? w.bossGate.x : w.W / 2, z = (w.ledgeZ ? w.ledgeZ - 1 : w.arenaD - 2) + 2; let y = s.y; for (let q = s.z; q > z; q -= 0.5) y = w.floorBelow(x, y + 1.3, q); P.pos.set(x, y, z); P.vel.set(0, 0, 0); })(); 1`);
      await h.until('G.world._hallOpen === true || !G.world._hall', 4000).catch(() => {});
      const walls = [];
      for (let i = 0; i < 12; i++) { await sleep(60); walls.push(await h.eval('G.world._hall ? 1 : 0') + await g.eval('G.world._hall ? 1 : 0')); }
      const cols = await h.eval('G.world.colliders ? G.world.colliders.length : -1');
      await sleep(500);
      const cols2 = await h.eval('G.world.colliders ? G.world.colliders.length : -1');
      check(walls.every((v) => v === 0), `${id}: the unseen wall stays gone once the door opens (${walls.join('')})`);
      check(cols === cols2, `${id}: and no walls pile up (${cols} / ${cols2})`);
      await h.eval(info.includes('"x"') ? '1' : `(() => { const w = G.world, P = G.player, s = w.spawn, x = w.bossGate ? w.bossGate.x : w.W / 2, z = (w.ledgeZ ? w.ledgeZ - 1 : w.arenaD - 2) + 8; let y = s.y; for (let q = s.z; q > z; q -= 0.5) y = w.floorBelow(x, y + 1.3, q); P.pos.set(x, y, z); P.vel.set(0, 0, 0); })(); 1`);
      await sleep(300);
      await g.eval("G.Coop.send({ t: 'engage' }); 1");
      await sleep(2500);
      const s = JSON.parse(await h.eval(`(() => { const P = G.player, w = G.world; return JSON.stringify({ x: P.pos.x, y: P.pos.y, z: P.pos.z, eng: G.game.bossEngaged, free: w.boxFree(P.pos.x - 0.3, P.pos.y + 0.1, P.pos.z - 0.3, P.pos.x + 0.3, P.pos.y + 1.7, P.pos.z + 0.3), kill: w.killY }); })()`));
      console.log('    ', JSON.stringify(s));
      check(s.y > -2 && s.free, `${id}: the host lands on the arena floor, free to move`);
      check(s.eng === true, `${id}: and the fight starts for the host`);
      await g.eval('G.game.bossEngaged = true; 1');
    }
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 2).join(' | ').slice(0, 400));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 2).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nPLAYTEST TEST FAILED (${fails.length})` : '\nPLAYTEST TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
