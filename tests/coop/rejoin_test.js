'use strict';
// A guest drops out in the middle of a run and comes back with the same name; a stranger joins a run under way.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9951;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'J' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const url = (n, host) => `http://127.0.0.1:${PORT}/coop.html?room=${room}${host ? '&host=1' : ''}&name=${n}${q}`;
    const h = await ch.page(url('Host', true));
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    let g = await ch.page(url('Guest'));
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    await sleep(3000);
    await g.eval("G.game.run.coins = 777; G.Coop.send({ t: 'sv', d: Object.assign(G.game.playerSnap(), { coins: 777 }) }); 1");
    await sleep(500);
    check(!!(await h.eval('!!G.Coop.saved.Guest')), 'the host keeps what the guest carries');
    await h.eval(`for (const e of G.enemies.list) if (e.alive) { G.Coop.lastFoe = e._nid; } 1`);
    await g.close();
    await sleep(9500);
    check(await h.eval('G.Coop.players.size') === 1, 'the guest dropped out');
    g = await ch.page(url('Guest'));
    await g.until('window.G && G.Coop && G.Coop.id >= 2 && G.game.run && G.Coop.fpOk !== undefined', 90000);
    await g.eval(off);
    check(await g.eval('G.Coop.fpOk') === true, 'the returning guest builds the same world');
    check(await g.eval('G.game.area') === await h.eval('G.game.area'), 'and stands in the same area');
    check(await g.eval('G.game.run.coins') === 777, 'with the coins they had');
    await sleep(1500);
    const a = await h.eval('G.enemies.list.filter((e) => e.alive && !e.custom).length'), b = await g.eval('G.enemies.list.filter((e) => e.alive && !e.custom).length');
    check(a === b, `and sees the same foes (${a} / ${b})`);
    check(await h.eval('G.Coop.players.size') === 2 && await g.eval('G.Coop.players.has(0)'), 'both know each other again');
    await sleep(1000);
    check(!h.errs.length && !g.errs.length, 'no errors ' + h.errs.concat(g.errs).slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nREJOIN TEST FAILED (${fails.length})` : '\nREJOIN TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
