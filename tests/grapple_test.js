'use strict';
// The grapple: it holds on a cave's ceiling and its rock walls; it never takes you more than G.GRAPPLE_TOP (5 m) over the highest floor
// you can walk to; and come down after it on top of something far above every floor round it (a cliff's top, a wall's top), you are
// put back where you last stood (only after the grapple: standing up there some other way is left alone).
//   node tests/grapple_test.js [fields, default mine,catacombs,shaft]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9873;

const PAGE = `
window.__grap = function () {
  const GM = G.game, P = G.player, w = G.world, K = G.input.keys, B = G.BIND, out = {};
  G.enemies.clear(); GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
  const rt = w.reachTops(); out.max = +rt.max.toFixed(2); out.cap = +(rt.max + G.GRAPPLE_TOP).toFixed(2);
  // 1) straight up from a floor you walk to: what is overhead can be held (a ceiling or the rock), and it does not lift you past the cap
  const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => w.reachMask[idx] && Math.abs(w.nf[idx]) < 0.5 && (() => { const h = w.raycast(new THREE.Vector3(x + 0.5, w.nf[idx] + 1.7, z + 0.5), new THREE.Vector3(0, 1, 0), 40); return h && h.t > 5 && h.t < 40; })());
  if (!c) { out.noCeil = true; } else {
    P.pos.set(c.x, c.y + 0.05, c.z); P.vel.set(0, 0, 0); P.pitch = 1.5; P.grappleCd = 0; P.lastSafe.copy(P.pos);
    GM.step(0.05, 3);
    const pv = P.grapplePreview; out.overhead = pv ? { ok: pv.ok, dist: +pv.dist.toFixed(1), y: +pv.point.y.toFixed(1) } : null;
    K[B.grapple[0]] = true; G.input.pressed[B.grapple[0]] = true;
    let maxY = -99, att = false;
    for (let i = 0; i < 80; i++) { GM.step(0.05, 1); maxY = Math.max(maxY, P.pos.y); if (P.grapple.state === 'attached') att = true; }
    K[B.grapple[0]] = false; GM.step(0.05, 40);
    out.attached = att; out.maxY = +maxY.toFixed(2);
  }
  // 2) on top of something far above every floor round it, after the grapple: put back
  let spot = null;
  for (const k of w.colliders) {
    if (!k.vis || k.alive === false || k.x1 - k.x0 < 1.2 || k.z1 - k.z0 < 1.2) continue;
    const x = (k.x0 + k.x1) / 2, z = (k.z0 + k.z1) / 2; if (x < 1.5 || z < 1.5 || x > w.W - 1.5 || z > w.D - 1.5) continue;
    if (!(k.y1 > w.reachNear(x, z, 6) + 4) || k.y1 > out.cap) continue;
    if (!w.boxFree(x - 0.4, k.y1 + 0.05, z - 0.4, x + 0.4, k.y1 + 1.9, z + 0.4)) continue;
    spot = { x, y: k.y1, z }; break;
  }
  out.ledge = spot ? [+spot.x.toFixed(1), +spot.y.toFixed(1), +spot.z.toFixed(1)] : null;
  if (spot) {
    const safe = new THREE.Vector3(c ? c.x : w.spawn.x, c ? c.y + 0.05 : 0.05, c ? c.z : w.spawn.z);
    // not after a grapple: left alone
    P.lastSafe.copy(safe); P._grapAir = false; P.pos.set(spot.x, spot.y + 0.02, spot.z); P.vel.set(0, 0, 0); GM.step(0.05, 30);
    out.stayY = +P.pos.y.toFixed(2);
    // after a grapple: put back
    P.lastSafe.copy(safe); P._grapAir = true; P.pos.set(spot.x, spot.y + 0.02, spot.z); P.vel.set(0, 0, 0); GM.step(0.05, 30);
    out.backY = +P.pos.y.toFixed(2); out.backD = +Math.hypot(P.pos.x - safe.x, P.pos.z - safe.z).toFixed(2);
  }
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
    for (const f of fields) {
      await p.eval('window.__w0 = G.world; 1');
      await p.eval(`(() => { G.Run.field = () => '${f}'; G.game.seed = 1017; G.game.area = 2; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(3, 'combat'); })(); 1`);
      await p.until(`G.world && G.world !== window.__w0 && G.world.biome === '${f}'`, 40000); await sleep(1500);
      const r = JSON.parse(await p.eval('window.__grap()'));
      console.log(f, JSON.stringify(r));
      if (!r.noCeil) {
        ok(r.overhead && r.overhead.ok, `${f}: what is over your head can be held (${JSON.stringify(r.overhead)})`);
        ok(r.attached, `${f}: the grapple holds`);
        ok(r.maxY <= r.cap + 0.05, `${f}: never past ${r.cap} m (the highest floor ${r.max} + 5; went to ${r.maxY})`);
      } else console.log(`   (${f}: nothing overhead to hold)`);
      if (r.ledge) {
        ok(r.stayY > r.ledge[1] - 0.2, `${f}: up on ${JSON.stringify(r.ledge)} some other way: left alone (${r.stayY})`);
        ok(r.backY < r.ledge[1] - 2 && r.backD < 1, `${f}: up there after the grapple: put back where you stood (${r.backY}, ${r.backD} m off)`);
      } else console.log(`   (${f}: no ledge high above the floors)`);
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nGRAPPLE TEST FAILED (${fails})` : '\nGRAPPLE TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
