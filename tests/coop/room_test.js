'use strict';
// The guest walks up to everything in every room and uses it (shop, shrine, anvil, cauldron, casino, bank, auction, barracks, altar, events): menus open over a running world.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9961;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'M' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; G.game.run.coins = 99999; 1');
    await sleep(1000);
    const kinds = ['shop', 'event', 'shrine', 'forge', 'alchemy', 'casino', 'bank', 'auction', 'merc', 'offering'];
    let n = 2, used = 0;
    const errs = () => h.errs.length + g.errs.length;
    for (const kind of kinds) {
      await g.eval('G.Coop.fpOk = undefined; 1');
      await h.eval(`G.game.area = ${n - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.Coop.go(${n}, '${kind}'); 1`);
      await g.until(`G.game.area === ${n} && G.game.stage === '${kind}' && G.Coop.fpOk !== undefined`, 25000);
      await sleep(400);
      const b = errs();
      const count = await g.eval('G.world.interactables.length');
      for (let i = 0; i < Math.min(count, 12); i++) {
        await g.eval(`(() => { const P = G.player, it = G.world.interactables[${i}]; if (!it || !it.pos) return; G.ui.clearScreen(); G.game.state = 'playing'; const a = i2 => 0; P.pos.set(it.pos.x + 1.6, Math.max(P.pos.y, it.pos.y - 1), it.pos.z); P.vel.set(0, 0, 0); P.yaw = Math.PI / 2; P.pitch = 0; })(); 1`.replace('const a = i2 => 0; ', ''));
        await sleep(120);
        await g.eval(`(() => { const P = G.player, it = G.world.interactables[${i}]; if (!it || !it.pos) return; const o = G.camera.position, dx = it.pos.x - o.x, dy = it.pos.y - o.y, dz = it.pos.z - o.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); })(); 1`);
        await sleep(120);
        await g.eval(`G.input.pressed[G.BIND.interact[0]] = true; 1`);
        await sleep(350);
        const r = await g.eval(`(() => { const c = [...document.querySelectorAll('#screens .choice, #screens .card')].filter((e) => !e.classList.contains('disabled')); if (c.length) { c[0].click(); return 1; } return 0; })()`);
        used += r;
        await sleep(200);
        await g.eval(`(() => { const b = document.querySelector('#screens #c-cancel, #screens #pw-close, #screens #alch-close'); if (b) b.click(); if (G.InvUI.isOpen()) G.InvUI.close(); })(); 1`);
        await sleep(100);
      }
      check(errs() === b, `${kind}: ${count} things used, no errors` + (errs() > b ? ' ' + h.errs.concat(g.errs).slice(-2).join(' | ').slice(0, 420) : ''));
      await g.eval(`G.ui.clearScreen(); G.game.state = 'playing'; 1`);
      n = n + 1 >= 6 ? n + 3 : n + 1;
      if (n > 19) n = 2;
    }
    console.log('menus answered', used);
    check(await g.eval('!document.getElementById("fatal") || document.getElementById("fatal").classList.contains("hidden")'), 'no error box on the guest');
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nROOM TEST FAILED (${fails.length})` : '\nROOM TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
