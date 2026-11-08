'use strict';
// 沈む石柱の海 (field_pillars.js): a pillar that sinks takes you down with it (into the dark: back on safe ground, 15% of your HP),
// foes stop counting it as ground while it goes, and it comes back up whole. Also: the sinking ones run on their own clock.
//   node tests/pillar_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9981;
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
    await p.eval("G.Run.field = () => 'pillars'; G.game.area = 15; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(16, 'combat'); 1");
    await p.until("G.world && G.world.biome === 'pillars' && !!G.world.pillars", 40000).catch(async (e) => { console.log(await p.eval("JSON.stringify({ f: G.world && G.world.field, b: G.world && G.world.biome, st: G.game.state, stage: G.game.stage, area: G.game.area })"), p.errs.slice(0, 3)); throw e; });
    await sleep(1500);
    await p.eval("G.enemies.clear(); G.game.objective = null; G.game.waves = null; G.ui.clearScreen(); G.game.state = 'playing'; G.game.dev = { god: false, speed: 1 }; 1");
    const s0 = await p.eval(`JSON.stringify((() => {
      const w = G.world, P = G.player;
      const p = w.pillars.slice().sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - w.W / 2) - Math.abs((b.x0 + b.x1) / 2 - w.W / 2))[0];
      window.__p = p; for (const q of w.pillars) if (q !== p) q.next = 1e9; // (only this one moves)
      P.pos.set((p.x0 + p.x1) / 2, p.top + 0.05, (p.z0 + p.z1) / 2); P.vel.set(0, 0, 0); P.hp = P.stats.maxHp; P.grounded = true;
      const ni = w.navIdx((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
      window.__t0 = G.game.time; G.FieldGen.sinkNow(w, p);
      return { n: w.pillars.length, top: p.top, nf0: w.nf[ni], hp: P.hp, max: P.stats.maxHp };
    })())`).then(JSON.parse);
    check(s0.n > 10, `the area has pillars that sink (${s0.n})`);
    check(isFinite(s0.nf0), `while it stands, foes walk on it (${s0.nf0})`);
    await p.until('G.game.time - __t0 > 0.6', 20000);
    const s1 = await p.eval(`JSON.stringify((() => { const w = G.world, p = __p, ni = w.navIdx((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2); return { st: p.st, glow: p.glow ? p.glow.opacity : -1, nf: w.nf[ni], y: G.player.pos.y }; })())`).then(JSON.parse);
    check(s1.st === 'warn' && s1.glow > 0.3, `first its seams light up (${s1.st}, ${s1.glow.toFixed(2)})`);
    check(s1.nf === null || !isFinite(s1.nf), `from then on foes do not count it as ground (${s1.nf})`);
    await p.until('G.game.time - __t0 > 2.5', 20000);
    const s2 = await p.eval(`JSON.stringify({ st: __p.st, y: __p.y, py: G.player.pos.y })`).then(JSON.parse);
    check(s2.st === 'sink' && s2.y < __top(s0) - 1 && s2.py < s0.top - 1 && s2.py - s2.y < 4, `then it sinks, you going down with it (pillar ${s2.y.toFixed(2)}, you ${s2.py.toFixed(2)})`);
    await p.until('G.game.time - __t0 > 7', 30000);
    const s3 = await p.eval(`JSON.stringify({ st: __p.st, alive: __p.col.alive, py: G.player.pos.y, hp: G.player.hp, safe: !G.world.voidBelow(G.player.pos.x, G.player.pos.y, G.player.pos.z) })`).then(JSON.parse);
    check(s3.st === 'down' && !s3.alive, `it lies down in the dark (no ground there: ${s3.st}, ${s3.alive})`);
    check(s3.py > -1.5 && s3.safe, `riding it down puts you back on safe ground (y ${s3.py.toFixed(2)})`);
    check(s3.hp < s0.hp && s3.hp >= s0.hp - s0.max * 0.25, `and costs some of your HP (${s0.hp} -> ${s3.hp})`);
    await p.until("__p.st === 'up'", 40000);
    const s4 = await p.eval(`JSON.stringify((() => { const w = G.world, p = __p, ni = w.navIdx((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2); return { y: p.y, top: p.top, alive: p.col.alive, y1: p.col.y1, nf: w.nf[ni] }; })())`).then(JSON.parse);
    check(Math.abs(s4.y - s4.top) < 0.01 && s4.alive && Math.abs(s4.y1 - s4.top) < 0.01, `it rises back whole (${s4.y.toFixed(2)} / ${s4.top})`);
    check(isFinite(s4.nf) && Math.abs(s4.nf - s4.top) < 0.05, `and foes walk on it again (${s4.nf})`);
    check(p.errs.length === 0, `no page errors${p.errs.length ? ' — ' + p.errs.slice(0, 2).join(' | ').slice(0, 300) : ''}`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nPILLAR TEST FAILED (${fails.length})` : '\nPILLAR TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
function __top(s) { return s.top; }
