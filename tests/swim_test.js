'use strict';
// Deep water (the drowned town): with your eyes under its surface the water closes round you (the tint over the screen, the thick
// blue-green haze, the muffled sounds); hold jump and you swim up and hop out of the water at the top; holding jump and moving at a
// wall's top you climb onto it; let go and you sink back. The foes wade at half speed in it, and one after you climbs out onto the ledge.
//   node tests/swim_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9871;

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.eval("(() => { G.Run.field = () => 'flooded'; G.game.seed = 1017; G.game.area = 2; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(3, 'combat'); })(); 1");
    await p.until("G.world && G.world.biome === 'flooded' && !!G.world.deepWater", 40000); await sleep(1500);
    if (process.env.FOE_TRACE) await p.eval('window.__trace = []; 1');
    const r = JSON.parse(await p.eval(`(() => {
      const GM = G.game, P = G.player, w = G.world, K = G.input.keys, B = G.BIND;
      G.enemies.clear(); GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
      const d = w.deepWater[0], out = { surface: d.y };
      // a spot on the bed of the deep water, open above
      const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => w.nf[idx] < -1 && x > d.x0 + 1 && x < d.x1 - 1 && z > d.z0 + 1 && z < d.z1 - 1 && w.boxFree(x - 0.5, w.nf[idx] + 0.1, z - 0.5, x + 0.5, d.y + 2, z + 0.5));
      if (!c) return JSON.stringify({ err: 'no deep spot' });
      P.pos.set(c.x, c.y + 0.05, c.z); P.vel.set(0, 0, 0); P.pitch = -0.2;
      out.bed = +c.y.toFixed(2);
      // crouched on the bed: the eyes under the surface
      K[B.crouch[0]] = true; GM.step(0.05, 30);
      out.camY = +G.camera.position.y.toFixed(2); out.under = G.Water.underOn(); out.tint = !!document.querySelector('#underwater.on'); out.fog = +G.scene.fog.density.toFixed(3);
      K[B.crouch[0]] = false; GM.step(0.05, 6);
      // hold jump: up to the surface, and a hop out of the water at the top
      K[B.jump[0]] = true; G.input.pressed[B.jump[0]] = true;
      let top = -99, headOut = false; for (let i = 0; i < 70; i++) { GM.step(0.05, 1); top = Math.max(top, P.pos.y); if (!G.Water.underOn()) headOut = true; }
      out.top = +top.toFixed(2); out.headOut = headOut;
      out.fogBack = +G.scene.fog.density.toFixed(3);
      // let go: back down to the bed
      K[B.jump[0]] = false; GM.step(0.05, 60);
      out.sunk = +P.pos.y.toFixed(2);
      // in the water beside a wall's top: holding jump and moving at it, you climb out onto it
      let edge = null;
      for (let z = Math.ceil(d.z0) + 2; z < d.z1 - 2 && !edge; z++) for (let x = 2; x < w.W - 2 && !edge; x++) {
        const fb = w.navFloor(x + 0.5, z + 0.5, -1.5); if (!(fb < -1)) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ft = w.navFloor(x + 0.5 + dx, z + 0.5 + dz, 1); if (!(ft > 0.2 && ft < 0.9)) continue;
          if (!w.boxFree(x + 0.1, fb + 0.1, z + 0.1, x + 0.9, d.y + 1.5, z + 0.9)) continue;
          edge = { x: x + 0.5, z: z + 0.5, fb, dx, dz, top: ft }; break;
        }
      }
      out.edge = edge && [edge.x, edge.z, +edge.top.toFixed(2)];
      if (edge) {
        P.pos.set(edge.x, edge.fb + 0.05, edge.z); P.vel.set(0, 0, 0); P.yaw = Math.atan2(-edge.dx, -edge.dz); P.pitch = 0;
        GM.step(0.05, 4);
        K[B.forward[0]] = true; K[B.jump[0]] = true; G.input.pressed[B.jump[0]] = true;
        for (let i = 0; i < 80 && !(P.grounded && P.pos.y > edge.top - 0.1); i++) GM.step(0.05, 1);
        K[B.forward[0]] = false; K[B.jump[0]] = false; GM.step(0.05, 6);
        out.outY = +P.pos.y.toFixed(2); out.outG = P.grounded;
        // a foe in the water after you, standing on the wall's top: it wades at half speed and climbs out onto the ledge
        const def = G.ENEMIES.find((q) => q.name === '骸骨兵' || (q.ai !== 'flyer' && !q.flyer && q.el !== 'water' && (q.ai === 'melee' || q.ai === 'flank')));
        const sx = edge.x - edge.dx * 2.5, sz = edge.z - edge.dz * 2.5, fs = w.navFloor(sx, sz, -1.5);
        out.foeDef = def && def.name;
        if (def && fs < -1) {
          const e = G.game.spawnEnemy({ def, at: { x: sx, y: fs, z: sz } });
          if (e) {
            e.pos.set(sx, fs + 0.02, sz); e.vel.set(0, 0, 0); out.foeY0 = +e.pos.y.toFixed(2);
            e.state = 'chase'; e.spawnT = 0; GM.dev.freeze = false;
            // (you stand back from the edge, as far as the wall's top goes (at most 2.2 m): right at the edge your body would shove it back into the water)
            let stand = 1.2; for (let k = 1.4; k <= 2.2; k += 0.2) { const f = w.navFloor(edge.x + edge.dx * (k + 0.4), edge.z + edge.dz * (k + 0.4), edge.top + 0.5); if (Math.abs(f - edge.top) < 0.1) stand = k; else break; }
            out.stand = +stand.toFixed(1);
            let wadeK = null, maxY = -99;
            for (let i = 0; i < 240; i++) { P.vel.set(0, 0, 0); P.pos.set(edge.x + edge.dx * stand, edge.top + 0.02, edge.z + edge.dz * stand); if (i < 8) { e.pos.set(sx, fs + 0.02, sz); e.vel.set(0, 0, 0); } GM.step(0.05, 1); if (wadeK == null && e.st && e.st.wade > 0) wadeK = G.combat.speedMul(e) / (1 + (P.stats.enemySpeed || 0)); maxY = Math.max(maxY, e.pos.y); if (window.__trace && i % 3 === 0) window.__trace.push([i, +e.pos.y.toFixed(2), e.hitWallFlag ? 1 : 0, e.attackState ? e.attackState.kind : '-', +(e.target().pos.y - e.pos.y).toFixed(2), +Math.hypot(e.target().pos.x - e.pos.x, e.target().pos.z - e.pos.z).toFixed(2)]); if (e.pos.y > edge.top - 0.15 && e.grounded) break; }
            if (window.__trace) out.trace = window.__trace.slice(0, 60);
            out.foe = { wadeK: wadeK == null ? null : +wadeK.toFixed(2), y: +e.pos.y.toFixed(2), maxY: +maxY.toFixed(2), alive: e.alive };
          }
        }
      }
      return JSON.stringify(out);
    })()`));
    console.log(JSON.stringify(r));
    if (r.err) { ok(false, r.err); } else {
      ok(r.camY < r.surface, `crouched on the bed the eyes are under the surface (eye ${r.camY}, surface ${r.surface})`);
      ok(r.under && r.tint, 'under the water: the tint is over the screen');
      ok(r.fog >= 0.07, `under the water: the haze is thick (fog ${r.fog})`);
      ok(r.top > r.surface + 0.3, `holding jump: up and a hop out of the water at the top (feet up to ${r.top}, surface ${r.surface})`);
      ok(r.headOut, 'up there: the head out of the water, no tint');
      ok(!!r.edge, `a wall's top beside the water was found (${JSON.stringify(r.edge)})`);
      if (r.edge) ok(r.outG && r.outY > r.edge[2] - 0.1, `holding jump and moving at it: you climb out onto the wall's top (feet ${r.outY}, its top ${r.edge[2]})`);
      if (r.foe) {
        ok(r.foe.wadeK != null && Math.abs(r.foe.wadeK - 0.5) < 0.06, `a foe in the water wades at half speed (${r.foe.wadeK})`);
        ok(r.foe.alive && r.foe.y > r.edge[2] - 0.15, `a foe after you climbs out of the water onto the ledge (${r.foe.y}, the top ${r.edge[2]}; ${r.foeDef})`);
      } else ok(false, 'a foe was put in the water (' + r.foeDef + ')');
      ok(r.fogBack < r.fog, `out of the water: the place's own haze is back (${r.fogBack})`);
      ok(r.sunk < r.surface - 1.3, `let go: sinking back to the bed (feet ${r.sunk})`);
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nSWIM TEST FAILED (${fails})` : '\nSWIM TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
