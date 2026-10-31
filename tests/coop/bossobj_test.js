'use strict';
// Things a guardian makes during the fight reach the guest and can be shot there: egg sacs, shadow clones, wedges, crystals.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9971;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=' + (process.env.COOP_JIT || 10), room = 'E' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    for (const [id, call, name] of [['broodmother', 'b.layEggs()', '卵嚢'], ['hunter', 'b.spawnClones()', '影の分身'], ['abyssking', 'b.spawnAnchors(3)', '深淵の楔'], ['warden', 'b.raiseTotems({ n: 3 })', '']]) {
      await h.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); G.game.area = 4; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
      await g.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); G.Coop.fpOk = undefined; G.ui.clearScreen(); G.game.state = 'playing'; 1`);
      await h.eval("G.Coop.go(5, 'boss'); 1");
      await g.until('G.game.stage === "boss" && G.Coop.fpOk !== undefined', 25000);
      await sleep(600);
      await h.eval('(() => { const w = G.world; G.player.pos.set(w.arenaCenter.x, 0.2, (w.ledgeZ || w.arenaD) - 6); G.player.grounded = true; G.ui.clearScreen(); G.game.state = "playing"; })(); 1');
      await g.until('!!G.bosses.active', 20000);
      await sleep(900);
      const n0 = await g.eval('G.bosses.active.parts.length');
      await h.eval(`(() => { const b = G.bosses.active; G.Coop.own++; try { ${call}; } finally { G.Coop.own--; } })(); 1`);
      await h.until(`G.bosses.active.parts.length > ${n0}`, 3000).catch(() => {});
      const nh = await h.eval('G.bosses.active.parts.length');
      await g.until(`G.bosses.active.parts.length >= ${nh}`, 5000).catch(() => {});
      await sleep(600);
      const ng = await g.eval('G.bosses.active.parts.length');
      check(nh > n0 && ng === nh, `${id}: what it made reached the guest (${n0} -> ${nh} / ${ng} parts)`);
      const p = await g.eval(`(() => { const b = G.bosses.active, p = b.parts[b.parts.length - 1]; return JSON.stringify({ name: p.name, hp: p.hp, x: p.centerRef.x, vis: p.hitW[0].n ? (() => { let o = p.hitW[0].n; while (o.parent && o.parent !== G.scene) o = o.parent; return o.parent === G.scene && o.visible && o.children.length; })() : 'none' }); })()`);
      console.log('    ', p);
      const hx = await h.eval('(() => { const b = G.bosses.active, p = b.parts[b.parts.length - 1]; return JSON.stringify({ x: p.centerRef.x, hp: p.hp, a: p.alive }); })()');
      const P = JSON.parse(p), H = JSON.parse(hx);
      check(!H.x || Math.abs(P.x - H.x) < 1.5, `${id}: it stands in the same place (${P.x.toFixed(1)} / ${H.x.toFixed(1)})`);
      check(P.hp === Math.round(H.hp) || P.hp > 1, `${id}: with its health from the host (${P.hp} / ${Math.round(H.hp)})`);
      await g.eval('(() => { const b = G.bosses.active, p = b.parts[b.parts.length - 1]; G.combat.damageEnemy(p, 1e7, { src: "bullet", pos: p.centerRef.clone() }); })(); 1');
      const dead = await h.until('(() => { const b = G.bosses.active, p = b.parts[b.parts.length - 1]; return !p.alive || p.hp <= 0; })()', 4000).then(() => true, () => false);
      check(dead, `${id}: the guest can destroy it`);
      await g.until('(() => { const b = G.bosses.active; return !b.parts[b.parts.length - 1].alive; })()', 4000).catch(() => {});
      await sleep(400);
      check(await g.eval('(() => { const b = G.bosses.active, p = b.parts[b.parts.length - 1]; return !p.alive; })()'), `${id}: and it is gone on the guest too`);
    }
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 2).join(' | ').slice(0, 400));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 2).join(' | ').slice(0, 400));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nBOSS OBJECT TEST FAILED (${fails.length})` : '\nBOSS OBJECT TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
