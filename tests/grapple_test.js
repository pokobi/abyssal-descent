'use strict';
// The grapple holds on a cave's ceiling and its rock walls, and takes you as high as it will; the map's bounds are walls of no height:
// high over an exit you cannot get past them (over the tunnel's roof and out), while down in the exit's opening the tunnel still lets you in.
//   node tests/grapple_test.js [fields, default mine,catacombs,shaft]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9873;

const PAGE = `
window.__grap = function () {
  const GM = G.game, P = G.player, w = G.world, K = G.input.keys, B = G.BIND, out = {};
  G.enemies.clear(); GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
  // 1) straight up from a floor you walk to: what is overhead can be held (a ceiling or the rock), and the rope takes you up
  const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => w.reachMask[idx] && Math.abs(w.nf[idx]) < 0.5 && (() => { const h = w.raycast(new THREE.Vector3(x + 0.5, w.nf[idx] + 1.7, z + 0.5), new THREE.Vector3(0, 1, 0), 40); return h && h.t > 5 && h.t < 40; })());
  if (!c) { out.noCeil = true; } else {
    P.pos.set(c.x, c.y + 0.05, c.z); P.vel.set(0, 0, 0); P.pitch = 1.5; P.grappleCd = 0;
    GM.step(0.05, 3);
    const pv = P.grapplePreview; out.overhead = pv ? { ok: pv.ok, dist: +pv.dist.toFixed(1), y: +pv.point.y.toFixed(1) } : null;
    K[B.grapple[0]] = true; G.input.pressed[B.grapple[0]] = true;
    let maxY = -99, att = false;
    for (let i = 0; i < 80; i++) { GM.step(0.05, 1); maxY = Math.max(maxY, P.pos.y); if (P.grapple.state === 'attached') att = true; }
    K[B.grapple[0]] = false; GM.step(0.05, 40);
    out.attached = att; out.rose = +(maxY - c.y).toFixed(2);
  }
  // 2) high over an exit, pushing north: the map's bound holds (not over the tunnel's roof and out)
  G.Areas.openGates(true);
  const ex = w.exits[0];
  let top = 0; for (const k of w.query(ex.x - 4, -2, -14, ex.x + 4, 60, 0.4)) if (k.alive !== false) top = Math.max(top, k.y1);
  out.wallTop = +top.toFixed(1);
  let minZ = 99;
  P.pos.set(ex.x, top + 2.5, 2); P.vel.set(0, 0, 0);
  for (let i = 0; i < 25; i++) { P.vel.z = -14; P.vel.y = Math.max(P.vel.y, 0); P.pos.y = Math.max(P.pos.y, top + 2.5); GM.step(0.05, 1); minZ = Math.min(minZ, P.pos.z); }
  out.highMinZ = +minZ.toFixed(2);
  // 3) down in the exit's opening: the tunnel still lets you in
  minZ = 99; P.pos.set(ex.x, 0.05, 1.2); P.vel.set(0, 0, 0);
  for (let i = 0; i < 6; i++) { P.vel.z = -6; GM.step(0.05, 1); minZ = Math.min(minZ, P.pos.z); }
  out.lowMinZ = +minZ.toFixed(2);
  return JSON.stringify(out);
};
1;`;

(async () => {
  const fields = (process.argv[2] || 'mine,catacombs,shaft').split(',');
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.eval(PAGE);
    if (process.env.GRAPPLE_PRE) await p.eval(process.env.GRAPPLE_PRE + '; 1'); // (debugging: code run in the page first)
    for (const f of fields) {
      await p.eval('window.__w0 = G.world; 1');
      await p.eval(`(() => { G.Run.field = () => '${f}'; G.game.seed = 1017; G.game.area = 2; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(3, 'combat'); })(); 1`);
      await p.until(`G.world && G.world !== window.__w0 && G.world.biome === '${f}'`, 40000); await sleep(1500);
      const r = JSON.parse(await p.eval('window.__grap()'));
      console.log(f, JSON.stringify(r));
      if (!r.noCeil) {
        ok(r.overhead && r.overhead.ok, `${f}: what is over your head can be held (${JSON.stringify(r.overhead)})`);
        ok(r.attached && r.rose > 2, `${f}: the grapple holds and takes you up (${r.rose} m)`);
      } else console.log(`   (${f}: nothing overhead to hold)`);
      ok(r.highMinZ >= 0.3, `${f}: high over an exit (${r.wallTop + 2.5} m), the map's bound holds (z never below ${r.highMinZ})`);
      ok(r.lowMinZ < 0.3, `${f}: down in the exit's opening the tunnel still lets you in (z ${r.lowMinZ})`);
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? '\nGRAPPLE TEST FAILED (' + fails + ')' : '\nGRAPPLE TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
