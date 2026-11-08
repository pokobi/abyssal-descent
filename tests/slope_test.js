'use strict';
// Walking the uneven ground of a terrain (the battlefield's hills, the mine, the shaft): the feet follow the drawn surface (no gap
// between them and the ground you see), they rise and fall with it smoothly (no jump of the feet from one frame to the next: no steps),
// and nothing but a real drop (a wall) holds you back (no catch on the way). Runs straight walks from places all over the area.
//   node tests/slope_test.js [fields, default battlefield,mine,shaft] [seeds per layout, default 1]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9885;

const PAGE = `
window.__slope = function (runs, secs) {
  const GM = G.game, P = G.player, w = G.world, K = G.input.keys, B = G.BIND, T = G.Terrain;
  G.enemies.clear(); GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 };
  const surf = (x, z) => { for (const g of w.groundGrid || []) { const s = T.surf(g, x, z); if (s != null) return s; } return null; };
  const out = { runs: 0, frames: 0, onSlope: 0, off: 0, maxOff: 0, maxJump: 0, stalls: 0, walls: 0, sp: 0, ex: [] };
  for (let r = 0; r < runs; r++) {
    const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => w.reachMask && w.reachMask[idx] && surf(x + 0.5, z + 0.5) != null);
    if (!c) break;
    out.runs++;
    P.pos.set(c.x, (surf(c.x, c.z) ?? c.y) + 0.05, c.z); P.vel.set(0, 0, 0); P.yaw = Math.random() * Math.PI * 2; P.pitch = 0;
    GM.step(1 / 60, 20);
    K[B.forward[0]] = true;
    let prevY = P.pos.y, prevG = P.grounded, prevS = null, slowN = 0;
    for (let i = 0; i < secs * 60; i++) {
      GM.step(1 / 60, 1);
      const s = surf(P.pos.x, P.pos.z), sp = Math.hypot(P.vel.x, P.vel.z);
      // (standing on something that is not the ground of a terrain, a rock, a wreck, a crate: not the slope; it is stepped onto as before)
      const prop = w.query(P.pos.x - P.hw, P.pos.y - 0.06, P.pos.z - P.hw, P.pos.x + P.hw, P.pos.y + 0.02, P.pos.z + P.hw).some((c) => !c.tg && c.y1 >= P.pos.y - 0.06 && c.y1 <= P.pos.y + 0.02);
      const g = P.grounded && !prop;
      out.frames++; out.sp += sp; if (prop) out.prop = (out.prop || 0) + 1;
      if (g && s != null) {
        const d = Math.abs(P.pos.y - s);
        if (Math.abs(s - (surf(P.pos.x + 0.6, P.pos.z) ?? s)) > 0.04 || Math.abs(s - (surf(P.pos.x, P.pos.z + 0.6) ?? s)) > 0.04) out.onSlope++;
        if (d > 0.04) { out.off++; if (d > out.maxOff) { out.maxOff = d; if (out.ex.length < 3) out.ex.push(['off', +P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2), +s.toFixed(2)]); } }
        // (how far the feet went up or down beyond the drawn ground itself: a drop the ground itself has, a cliff's edge, is followed, not counted)
        if (prevG && prevS != null) { const j = Math.abs((P.pos.y - prevY) - (s - prevS)); if (j > out.maxJump) { out.maxJump = j; if (j > 0.07 && out.ex.length < 6) out.ex.push(['jump', +P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2), +j.toFixed(3)]); } }
      }
      if (P.hitWall) { out.walls++; slowN = 0; }
      else if (g && sp < 1.5) { if (++slowN === 8) { out.stalls++; if (out.ex.length < 6) out.ex.push(['stall', +P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)]); } }
      else slowN = 0;
      prevY = P.pos.y; prevG = g; prevS = s;
      if (P.pos.y < w.killY + 1) break;
    }
    K[B.forward[0]] = false;
    GM.step(1 / 60, 10);
  }
  out.sp = +(out.sp / Math.max(1, out.frames)).toFixed(2); out.maxOff = +out.maxOff.toFixed(3); out.maxJump = +out.maxJump.toFixed(3);
  return JSON.stringify(out);
};
1;`;

(async () => {
  const fields = (process.argv[2] || 'battlefield,mine,shaft').split(','), seeds = +(process.argv[3] || 1);
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(400);
    await p.eval(PAGE);
    await p.eval("const pl0 = G.FieldGen.pickLayout; G.FieldGen.pickLayout = function (rng, field, list) { (window.__lay = window.__lay || {})[field] = list; return pl0.apply(this, arguments); }; 1");
    const enter = async (f, lay, seed) => {
      await p.eval('window.__w0 = G.world; 1');
      await p.eval(`(() => { G.Run.field = () => '${f}'; ${lay ? `G.FieldGen.forceLayout['${f}'] = '${lay}';` : `delete G.FieldGen.forceLayout['${f}'];`} G.game.seed = ${seed}; G.game.area = 2; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(3, 'combat'); })(); 1`);
      await p.until(`G.world && G.world !== window.__w0 && G.world.biome === '${f}'`, 40000); await sleep(1200);
    };
    for (const f of fields) {
      await enter(f, null, 1017);
      const lays = JSON.parse(await p.eval(`JSON.stringify((window.__lay || {})['${f}'] || [null])`));
      for (const lay of lays) for (let s = 0; s < seeds; s++) {
        await enter(f, lay, 1017 + s * 7919);
        const r = JSON.parse(await p.eval('window.__slope(10, 3)'));
        const tag = `${f}${lay ? '/' + lay : ''} seed ${1017 + s * 7919}`;
        console.log(`${tag}: ${r.runs} walks, ${r.frames} frames (${r.onSlope} on a slope, ${r.prop || 0} on things), mean speed ${r.sp} m/s, off ${r.off} (max ${r.maxOff} m), largest jump ${r.maxJump} m, stalls ${r.stalls}, walls ${r.walls} ${r.ex.length ? JSON.stringify(r.ex) : ''}`);
        ok(r.runs >= 5 && r.onSlope > 50, `${tag}: walked over slopes (${r.onSlope} frames)`);
        ok(r.maxOff <= 0.06, `${tag}: the feet stay on the drawn ground (${r.maxOff} m at most)`);
        ok(r.maxJump <= 0.07, `${tag}: the feet rise and fall with the drawn ground (largest gap from it in a frame ${r.maxJump} m)`);
        ok(r.stalls === 0, `${tag}: no catch on the way (${r.stalls})`);
      }
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? '\nSLOPE TEST FAILED (' + fails + ')' : '\nSLOPE TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
