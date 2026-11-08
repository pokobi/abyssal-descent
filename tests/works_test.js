'use strict';
// The moving ground of the new fields:
//   溶鉱の深層 (field_foundry.js): a carriage carries you across its gap; a lift raises you to the high bay; a belt carries you along.
//   水没回廊 (field_flooded.js): chest-deep in the water you are slowed and can hardly jump.
//   node tests/works_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9983;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(500);
    const enter = async (field, n, want) => {
      for (let t = 0; t < 8; t++) {
        await p.eval(`G.Run.field = () => '${field}'; G.game.seed = ${1234 + 97} * ${t + 1}; G.game.area = ${n - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(${n}, 'combat'); 1`);
        await p.until(`G.world && G.world.biome === '${field}'`, 40000);
        await sleep(800);
        await p.eval("G.enemies.clear(); G.game.objective = null; G.game.waves = null; G.ui.clearScreen(); G.game.state = 'playing'; G.game.dev = { god: true, speed: 1 }; 1");
        if (await p.eval(want)) return true;
      }
      return false;
    };
    const gt = () => p.eval('G.game.time');
    const waitT = async (dt) => { const t0 = await gt(); await p.until(`G.game.time - ${t0} > ${dt}`, 60000); };
    // ---- the foundry
    check(await enter('foundry', 16, "G.world.movers && G.world.movers.some((m) => !m.dy) && G.world.movers.some((m) => m.dy) && G.world.belts && G.world.belts.length > 0"), 'the foundry has carriages, lifts and belts');
    // a carriage: stand on it as it waits at its start, ride it across
    const c0 = await p.eval(`JSON.stringify((() => { const w = G.world, m = w.movers.find((q) => !q.dy), P = G.player; window.__m = m; m.t = m.period * 0.05; m.ox = m.oy = m.oz = 0; const c = m.col; c.x0 = m.x0; c.x1 = m.x1; c.z0 = m.z0; c.z1 = m.z1; c.y1 = m.y; c.y0 = m.y - 0.35;
      P.pos.set((m.x0 + m.x1) / 2, m.y + 0.02, (m.z0 + m.z1) / 2); P.vel.set(0, 0, 0); P.grounded = true; return { x: P.pos.x, z: P.pos.z, d: Math.hypot(m.dx, m.dz) }; })())`).then(JSON.parse);
    await waitT(0.75 * 7.5 * 0.5 + 0.4);
    const c1 = await p.eval(`JSON.stringify({ x: G.player.pos.x, z: G.player.pos.z, y: G.player.pos.y, my: __m.y, k: Math.hypot(__m.ox, __m.oz) })`).then(JSON.parse);
    const moved = Math.hypot(c1.x - c0.x, c1.z - c0.z);
    check(c1.k > c0.d * 0.9 && moved > c0.d * 0.8 && Math.abs(c1.y - c1.my) < 0.3, `a carriage carries you across its gap (${moved.toFixed(1)} of ${c0.d.toFixed(1)} m, still on it)`);
    // a lift
    await p.eval(`(() => { const w = G.world, m = w.movers.find((q) => q.dy), P = G.player; window.__m = m; m.t = m.period * 0.05; m.ox = m.oy = m.oz = 0; const c = m.col; c.x0 = m.x0; c.x1 = m.x1; c.z0 = m.z0; c.z1 = m.z1; c.y1 = m.y; c.y0 = m.y - 0.35;
      P.pos.set((m.x0 + m.x1) / 2, m.y + 0.02, (m.z0 + m.z1) / 2); P.vel.set(0, 0, 0); P.grounded = true; window.__y0 = P.pos.y; })(); 1`);
    await waitT(0.55 * 9 + 0.3);
    const l1 = await p.eval(`JSON.stringify({ y: G.player.pos.y, y0: __y0, top: __m.col.y1, dy: __m.dy })`).then(JSON.parse);
    check(l1.y - l1.y0 > l1.dy * 0.85, `a lift raises you to the high bay (${(l1.y - l1.y0).toFixed(2)} of ${l1.dy} m)`);
    // a belt
    const b0 = await p.eval(`JSON.stringify((() => { const b = G.world.belts[0], P = G.player; window.__b = b; P.pos.set((b.x0 + b.x1) / 2 - b.dx * 1.5, b.y + 0.02, (b.z0 + b.z1) / 2 - b.dz * 1.5); P.vel.set(0, 0, 0); P.grounded = true; return { x: P.pos.x, z: P.pos.z }; })())`).then(JSON.parse);
    await waitT(0.8);
    const b1 = await p.eval(`JSON.stringify({ x: G.player.pos.x, z: G.player.pos.z, dx: __b.dx, dz: __b.dz })`).then(JSON.parse);
    const along = (b1.x - b0.x) * b1.dx + (b1.z - b0.z) * b1.dz;
    check(along > 1.5, `a belt carries you along it (${along.toFixed(2)} m in 0.8 s)`);
    // ---- the drowned town
    check(await enter('flooded', 16, 'G.world.deepWater && G.world.deepWater.length > 0'), 'the drowned town has its deep water');
    const f = await p.eval(`(async () => { const w = G.world, P = G.player, d = w.deepWater[0];
      let at = null; for (let k = 0; k < 400 && !at; k++) { const x = d.x0 + 2 + Math.random() * (d.x1 - d.x0 - 4), z = d.z0 + 2 + Math.random() * (d.z1 - d.z0 - 4); const y = w.floorBelow(x, 0.3, z); if (y < -1.4 && y > -2 && w.boxFree(x - 0.4, y + 0.05, z - 0.4, x + 0.4, y + 1.9, z + 0.4)) at = [x, y, z]; }
      if (!at) return JSON.stringify({ err: 'no deep spot' });
      P.pos.set(at[0], at[1] + 0.02, at[2]); P.vel.set(0, 0, 0); P.grounded = true;
      await new Promise((r) => setTimeout(r, 400));
      return JSON.stringify({ sp: P.fieldSpeed, jp: P.fieldJump, y: P.pos.y }); })()`).then(JSON.parse);
    check(!f.err && f.sp <= 0.55 && f.jp <= 0.55, `chest-deep in the water you wade slowly and hardly jump (${JSON.stringify(f)})`);
    check(p.errs.length === 0, `no page errors${p.errs.length ? ' — ' + p.errs.slice(0, 2).join(' | ').slice(0, 300) : ''}`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nWORKS TEST FAILED (${fails.length})` : '\nWORKS TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
