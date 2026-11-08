'use strict';
// The rock that bounds an area (the rim round the great shaft, the rock round the shaft's chambers, the crags of the battlefield)
// has an invisible wall over it up into the sky (w.skyCap): from the walkable side, high over the rim and pushing at it, or hanging
// at its lip and climbing (mantle), you never get onto it; no gap is left between the rock's top and the wall to stand in; and the
// hook still holds on the rock's face (no "can't hold" there). A control run with the walls taken away shows the push does get over.
//   node tests/rim_test.js [field:kind,..., default shaft:combat,shaft:shop,battlefield:combat]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9887;

const PAGE = `
window.__rim = function () {
  const GM = G.game, P = G.player, w = G.world, K = G.input.keys, B = G.BIND, out = { caps: 0, gaps: [], cand: 0, over: [], climbed: [], control: 0, controlN: 0, faceN: 0, faceNo: [] };
  G.enemies.clear(); GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
  const caps = w.colliders.filter((c) => c.skyCap && c.alive !== false); out.caps = caps.length;
  const capAt = (x, z) => caps.find((c) => x > c.x0 + 0.02 && x < c.x1 - 0.02 && z > c.z0 + 0.02 && z < c.z1 - 0.02); // (taken away or not: the control looks for the same rock)
  // 1) no room between the rock's top and the wall over it (the highest solid thing under the wall's foot)
  for (const c of caps) for (let x = c.x0 + 0.25; x < c.x1; x += 1) for (let z = c.z0 + 0.25; z < c.z1; z += 1) {
    if (x < 0.4 || x > w.W - 0.4 || z < 0.4 || z > w.D - 0.4) continue; // (beyond the map's bounds nobody stands anyway)
    let top = -1e9; for (const k of w.query(x - 0.01, -80, z - 0.01, x + 0.01, c.y0 - 0.01, z + 0.01)) if (!k.ghost && !k.trigger) top = Math.max(top, Math.min(k.y1, c.y0)); // (a column up past the wall's foot fills it)
    if (c.y0 - top > 0.25 && out.gaps.length < 8) out.gaps.push([+x.toFixed(1), +z.toFixed(1), +top.toFixed(2), +c.y0.toFixed(2)]);
  }
  // 2) walkable cells beside the capped rock (the nav reaches them from the way in)
  const cand = [];
  for (let i = 0; i < w.N; i++) {
    if (!w.reachMask || !w.reachMask[i] || !(w.nf[i] > -50)) continue;
    const x = i % w.Wn - (w.xo || 0), z = Math.floor(i / w.Wn) - (w.zo || 0);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = capAt(x + 0.5 + dx, z + 0.5 + dz);
      if (c && c.y0 > w.nf[i] + 2.5 && !capAt(x + 0.5, z + 0.5)) cand.push({ x, z, dx, dz, f: w.nf[i], top: c.y0 });
    }
  }
  out.cand = cand.length;
  for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
  // on the rock: over its cap's footprint, at or above the cap's foot (under a lump jutting from a crag's face is not on it)
  const overRock = () => { const c = capAt(P.pos.x, P.pos.z); return !!c && P.pos.y >= c.y0 - 0.05; };
  const hw = P.hw || 0.36, ht = P.height || 1.8;
  const free = () => w.boxFree(P.pos.x - hw, P.pos.y + 0.02, P.pos.z - hw, P.pos.x + hw, P.pos.y + ht, P.pos.z + hw);
  // pushing at the rock from just over its top (as at the top of a swing); with the walls away (control) the same push gets over
  const push = (q) => {
    P.pos.set(q.x + 0.5, q.top + 0.6, q.z + 0.5); P.vel.set(0, 0, 0); P.grapple.state = 'none'; P.yaw = yawTo(q.dx, q.dz); P.pitch = 0;
    if (!free()) return null; // (a start inside something tells nothing)
    let over = false;
    for (let i = 0; i < 25; i++) { P.vel.x = q.dx * 8; P.vel.z = q.dz * 8; P.vel.y = Math.max(P.vel.y, 0); P.pos.y = Math.max(P.pos.y, q.top + 0.6); GM.step(0.05, 1); if (overRock()) over = true; }
    return over;
  };
  // hanging at the lip, climbing: forward and jump held (the mantle)
  const climb = (q) => {
    P.pos.set(q.x + 0.5 + q.dx * 0.1, q.top - 1.1, q.z + 0.5 + q.dz * 0.1); P.vel.set(0, 0, 0); P.grapple.state = 'none'; P.yaw = yawTo(q.dx, q.dz); P.pitch = 0;
    if (!free()) return null;
    K[B.forward[0]] = true; K[B.jump[0]] = true; G.input.pressed[B.jump[0]] = true;
    let over = false;
    for (let i = 0; i < 40; i++) { if (i < 6) { P.vel.y = Math.max(P.vel.y, 0); P.pos.y = Math.max(P.pos.y, q.top - 1.1); } GM.step(0.05, 1); if (overRock()) over = true; if (i === 10) G.input.pressed[B.jump[0]] = true; }
    K[B.forward[0]] = false; K[B.jump[0]] = false; GM.step(0.05, 2);
    return over;
  };
  out.tried = 0;
  for (const q of cand.slice(0, 40)) {
    if (out.tried >= 14) break;
    const a = push(q), b = climb(q);
    if (a === null && b === null) continue;
    out.tried++;
    if (a) out.over.push([q.x, q.z, q.dx, q.dz, +q.top.toFixed(1)]);
    if (b) out.climbed.push([q.x, q.z, q.dx, q.dz, +q.top.toFixed(1)]);
    // 3) the hook on the rock's face: aimed at it from the cell's floor, at a few heights up the face
    for (const pitch of [0.35, 0.8, 1.15]) {
      P.pos.set(q.x + 0.5 - q.dx * 0.3, q.f + 0.05, q.z + 0.5 - q.dz * 0.3); P.vel.set(0, 0, 0); P.grapple.state = 'none'; P.grappleCd = 0; P.yaw = yawTo(q.dx, q.dz); P.pitch = pitch;
      GM.step(0.02, 2);
      const pv = P.grapplePreview;
      if (!pv || pv.dist > P.stats.grappleRange) continue;
      const hx = pv.point.x - pv.normal.x * 0.05, hz = pv.point.z - pv.normal.z * 0.05;
      if (!capAt(hx, hz) || pv.point.y > q.top + 0.05) continue; // (only a hit on the capped rock's face)
      out.faceN++;
      if (!pv.ok && out.faceNo.length < 6) out.faceNo.push([+pv.point.x.toFixed(1), +pv.point.y.toFixed(1), +pv.point.z.toFixed(1)]);
    }
  }
  // control: the walls taken away, the same push from over the top gets onto the rock
  for (const c of caps) c.alive = false;
  for (const q of cand.slice(0, 40)) { if (out.controlN >= 4) break; const a = push(q); if (a === null) continue; out.controlN++; if (a) out.control++; }
  for (const c of caps) c.alive = true;
  return JSON.stringify(out);
};
1;`;

(async () => {
  const runs = (process.argv[2] || 'shaft:combat,shaft:shop,battlefield:combat').split(',').map((s) => s.split(':'));
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.eval(PAGE);
    for (const [f, kind] of runs) for (const seed of [1017, 2203]) {
      await p.eval('window.__w0 = G.world; 1');
      await p.eval(`(() => { G.Run.field = () => '${f}'; G.game.seed = ${seed}; G.game.area = 2; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(3, '${kind || 'combat'}'); })(); 1`);
      await p.until(`G.world && G.world !== window.__w0 && G.world.biome === '${f}'`, 40000); await sleep(1500);
      const r = JSON.parse(await p.eval('window.__rim()'));
      const tag = `${f} ${kind || 'combat'} seed ${seed}`;
      console.log(tag, JSON.stringify(r));
      ok(r.caps > 0, `${tag}: the bounding rock has its invisible walls (${r.caps})`);
      ok(r.gaps.length === 0, `${tag}: no room between the rock's top and the wall over it`);
      ok(r.cand >= 4 && r.tried >= 4, `${tag}: places beside the rock to try from (${r.tried} tried of ${r.cand})`);
      ok(r.over.length === 0, `${tag}: pushing from over the top never gets onto the rock`);
      ok(r.climbed.length === 0, `${tag}: climbing at the lip never gets onto the rock`);
      ok(r.faceN > 0 && r.faceNo.length === 0, `${tag}: the hook holds on the rock's face (${r.faceN} aims)`);
      ok(r.controlN > 0 && r.control > 0, `${tag}: control - without the walls the push gets over (${r.control}/${r.controlN})`);
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('ERROR', e && e.stack || e); fails++; }
  finally { try { ch.close(); } catch (e) {} try { srv.close(); } catch (e) {} }
  console.log(fails ? `\nRIM TEST FAILED (${fails})` : '\nRIM TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
