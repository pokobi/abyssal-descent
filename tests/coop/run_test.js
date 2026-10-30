'use strict';
// A whole run by two bots: every gate, every guardian, the rift at the end. Watches for errors, worlds that differ and a run that stops moving.
//   node tests/coop/run_test.js [difficulty id, default normal] [minutes, default 9]
const fs = require('fs'), path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9501;
const diff = process.argv[2] || 'normal', mins = +process.argv[3] || 9;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let bad = 0;
  try {
    const q = '&local=1&lat=40&jit=20', room = 'R' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    const bot = fs.readFileSync(path.join(__dirname, 'coopbot.js'), 'utf8');
    await h.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbRun = true; 1`);
    await g.eval(`(0, eval)(${JSON.stringify(bot)}); window.__cbRun = true; 1`);
    await h.eval(`G.Coop.diff = { id: '${diff}', lv: ${diff === 'extra' ? 1 : 0} }; G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1`);
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await h.eval(`window.__cb = __coopbot(${mins * 60000}); 1`); await g.eval(`window.__cb = __coopbot(${mins * 60000}); 1`);
    const t0 = Date.now();
    let lastArea = 0, lastT = Date.now(), seen = new Set();
    const stat = (p) => p.eval('JSON.stringify({ a: G.game.area, k: G.game.stage, s: G.game.state, f: G.Coop.fpOk, cl: G.game.areaCleared, b: G.bosses.active ? G.bosses.active.def.id + ":" + Math.round(G.bosses.active.hp) : "", foes: G.enemies.list.filter((e) => e.alive && !e.custom).length, tr: !!G.game.transitioning, won: !!G.game.won, at: [...G.Coop.players.values()].map((p) => p.at), fps: G.Coop.fps })');
    while (Date.now() - t0 < mins * 60000) {
      await sleep(6000);
      let a, b;
      try { a = JSON.parse(await stat(h)); b = JSON.parse(await stat(g)); } catch (e) { console.log('page gone', e.message); bad++; break; }
      if (a.a !== lastArea) { lastArea = a.a; lastT = Date.now(); console.log(`${Math.round((Date.now() - t0) / 1000)}s area ${a.a} ${a.k} (guest ${b.a} ${b.k}) world ${b.f}`); }
      if (b.f === false && !seen.has(a.a)) { seen.add(a.a); bad++; console.log('WORLD DIFFERS at', a.a, a.k); }
      if (a.won && b.won) { console.log('both reached the end'); break; }
      if (Date.now() - lastT > 75000) { console.log('STUCK', JSON.stringify(a), JSON.stringify(b)); console.log('foes', await h.eval('JSON.stringify(G.enemies.list.filter((e) => e.alive).slice(0, 5).map((e) => ({ d: e.def.id, hp: Math.round(e.hp), mx: e.maxHp, sh: Math.round(e.shield || 0), st: e.state, inv: !!e.invuln, unt: !!e.untargetable, bur: !!e.burrowed, mut: e.mut && e.mut.id, cu: !!e.custom, tgt: !!e.isTarget, pos: [Math.round(e.pos.x), Math.round(e.pos.y), Math.round(e.pos.z)], clo: !!e.cloaked, ii: e.isInvuln ? e.isInvuln({ src: "bullet" }) : null })))')); console.log('gfoes', await g.eval('JSON.stringify(G.enemies.list.filter((e) => e.alive).slice(0, 5).map((e) => [e._nid, e.def.id, Math.round(e.hp), e.state, !!e.invuln, !!e.untargetable, !!e.burrowed]))')); bad++; lastT = Date.now(); await h.eval('window.__cbStuck = (window.__cbStuck || 0) + 1; 1'); }
      if (h.errs.length + g.errs.length > 0 && !seen.has('e')) { seen.add('e'); bad++; console.log('ERRORS', h.errs.concat(g.errs).slice(0, 4).join(' || ').slice(0, 700)); }
    }
    console.log('errors', h.errs.length, g.errs.length, JSON.stringify(h.errs.concat(g.errs).slice(0, 6)).slice(0, 900));
  } finally { ch.close(); srv.close(); }
  console.log(bad ? `\nRUN TEST: ${bad} problems` : '\nRUN TEST PASSED');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
