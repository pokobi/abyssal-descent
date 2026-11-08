'use strict';
// The bats' swoop: never at the air where you stood, never into a wall, never the same miss again and again. Bats against a god-mode
// player who keeps moving (round a circle) at spots all over the area; every swoop is logged (hit, stopped by a wall, how close it came).
//   node tests/bat_test.js [fields, default hamlet,battlefield] [seconds, default 60]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9875;
const HARN = `
window.__batRun = async function (field, seed, secs) {
  const GM = G.game, P = G.player;
  G.Run.field = () => field; GM.seed = seed; GM.area = 2; GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing';
  GM.enterArea(3, 'combat');
  await new Promise((r) => setTimeout(r, 2500));
  G.enemies.clear(); GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
  const w = G.world, def = G.ENEMIES.find((d) => d.name === '大蝙蝠');
  const spots = []; for (let i = 0; i < 400 && spots.length < 9; i++) { const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => w.reachMask && w.reachMask[idx] && w.nf[idx] < 1); if (c) spots.push(c); }
  const log = []; let t = 0, si = 0, nextMove = 0;
  const track = new Map();
  while (t < secs) {
    if (t >= nextMove) { const s = spots[si++ % spots.length]; P.pos.set(s.x, s.y + 0.05, s.z); P.vel.set(0, 0, 0); nextMove = t + 10;
      for (const e of G.enemies.list.slice()) if (e.def.name === '大蝙蝠') e.alive && (e.hp = 0, e.alive = false, e.removed = true);
      G.enemies.list = G.enemies.list.filter((e) => e.alive);
      for (let k = 0; k < 5; k++) GM.spawnEnemy({ def, near: true }); }
    P.hp = P.stats.maxHp;
    { const s = spots[(si - 1) % spots.length], an = t * 1.6; const nx = s.x + Math.cos(an) * 3.5, nz = s.z + Math.sin(an) * 3.5; const fl = w.navFloor ? w.navFloor(nx, nz, s.y) : s.y; if (isFinite(fl) && Math.abs(fl - s.y) < 1.2 && w.boxFree(nx - 0.35, fl + 0.05, nz - 0.35, nx + 0.35, fl + 1.8, nz + 0.35)) { P.pos.set(nx, fl + 0.02, nz); } }
    GM.step(0.05, 1); t += 0.05;
    for (const e of G.enemies.list) {
      if (!e.alive || e.def.name !== '大蝙蝠') continue;
      const A = e.attackState;
      let r = track.get(e);
      if (A && A.kind === 'swoop' && A.t >= A.wind) {
        if (!r || r.A !== A) { r = { A, t0: t, p0: e.pos.clone(), min: 99, blocked: 0, tgtP: !!(e.target && e.target().isPlayer), los: e.hasLOS }; track.set(e, r); }
        r.min = Math.min(r.min, e.centerPos().distanceTo(P.eye || P.pos.clone().setY(P.pos.y + 1.6)));
        if (e.hitWallFlag) r.blocked++;
      } else if (r && !r.done) { r.done = true; const moved = e.pos.distanceTo(r.p0); log.push({ hit: !!r.A.hit, blocked: r.blocked, min: +r.min.toFixed(1), moved: +moved.toFixed(1), p: [+r.p0.x.toFixed(1), +r.p0.y.toFixed(1), +r.p0.z.toFixed(1)], pl: [+P.pos.x.toFixed(1), +P.pos.y.toFixed(1), +P.pos.z.toFixed(1)], tgtP: r.tgtP, id: e.uid || e.id }); }
    }
  }
  const n = log.length, hits = log.filter((l) => l.hit).length, blocked = log.filter((l) => !l.hit && l.blocked > 2).length, far = log.filter((l) => !l.hit && l.min > 3).length;
  // the same bat swooping in vain again and again
  const byBat = {}; for (const l of log) (byBat[l.id] = byBat[l.id] || []).push(l);
  let loops = 0; const ex = [];
  for (const k in byBat) { let run = 0; for (const l of byBat[k]) { if (!l.hit && (l.blocked > 2 || l.min > 3)) { run++; if (run === 3) { loops++; if (ex.length < 4) ex.push(l); } } else run = 0; } }
  return { field, seed, swoops: n, hits, blockedMiss: blocked, farMiss: far, loops, ex };
};
1;`;
(async () => {
  const fields = (process.argv[2] || 'hamlet,battlefield').split(','), secs = +(process.argv[3] || 60);
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.eval(HARN);
    for (const f of fields) {
      const r = await p.eval(`__batRun('${f}', 1017, ${secs})`);
      console.log(JSON.stringify(r));
      ok(r.swoops >= 10, `${f}: the bats swoop (${r.swoops})`);
      ok(r.blockedMiss === 0, `${f}: no swoop into a wall (${r.blockedMiss})`);
      ok(r.farMiss <= Math.max(2, r.swoops * 0.12), `${f}: hardly a swoop at the air far from you (${r.farMiss} of ${r.swoops})`);
      ok(r.loops === 0, `${f}: no bat missing again and again (${r.loops})`);
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nBAT TEST FAILED (${fails})` : '\nBAT TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
