'use strict';
// Deep water (the drowned town): with your eyes under its surface the water closes round you (the tint over the screen, the thick
// blue-green haze, the muffled sounds); hold jump and you swim up to the surface and float there, head out; let go and you sink back.
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
      // hold jump: up to the surface, held there
      K[B.jump[0]] = true; G.input.pressed[B.jump[0]] = true;
      let top = -99; for (let i = 0; i < 70; i++) { GM.step(0.05, 1); top = Math.max(top, P.pos.y); }
      out.floatY = +P.pos.y.toFixed(2); out.top = +top.toFixed(2); out.swimming = !!P.swimming; out.underAtTop = G.Water.underOn(); out.tintAtTop = !!document.querySelector('#underwater.on');
      out.fogBack = +G.scene.fog.density.toFixed(3);
      // let go: back down to the bed
      K[B.jump[0]] = false; GM.step(0.05, 50);
      out.sunk = +P.pos.y.toFixed(2);
      return JSON.stringify(out);
    })()`));
    console.log(JSON.stringify(r));
    if (r.err) { ok(false, r.err); } else {
      ok(r.camY < r.surface, `crouched on the bed the eyes are under the surface (eye ${r.camY}, surface ${r.surface})`);
      ok(r.under && r.tint, 'under the water: the tint is over the screen');
      ok(r.fog >= 0.07, `under the water: the haze is thick (fog ${r.fog})`);
      ok(Math.abs(r.floatY - (r.surface - 1.25)) < 0.2, `holding jump: up to the surface and floating there (feet ${r.floatY}, want ${r.surface - 1.25})`);
      ok(r.top < r.surface - 0.6, `it floats at the surface, it does not fly out of the water (highest ${r.top})`);
      ok(!r.underAtTop && !r.tintAtTop, 'floating: the head is out, no tint');
      ok(r.fogBack < r.fog, `out of the water: the place's own haze is back (${r.fogBack})`);
      ok(r.sunk < r.floatY - 0.2, `let go: sinking back (feet ${r.sunk})`);
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? `\nSWIM TEST FAILED (${fails})` : '\nSWIM TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
