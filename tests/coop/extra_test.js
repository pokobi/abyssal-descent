'use strict';
// A run on a hard difficulty (default extra 1): both sides must build the same world. node tests/coop/extra_test.js [id] [lv] [areas to walk, default 6]
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9001;
const did = process.argv[2] || 'extra', dlv = +process.argv[3] || 1, areas = +process.argv[4] || 6;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'X' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    if (process.env.COOP_HARD) {
      // the way a person does it: the solo save has hard cleared, the host presses the extra button in the lobby
      await h.until('document.querySelector("[data-d=extra]")', 20000);
      await h.eval('document.querySelector("[data-d=extra]").click(); 1');
      console.log('lobby diff', await h.eval('JSON.stringify(G.Coop.diff)'), await g.eval('JSON.stringify(G.Coop.diff)'));
    }
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval(`${process.env.COOP_HARD ? '' : `G.Coop.diff = { id: '${did}', lv: ${dlv} };`} G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1`);
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 90000);
    check(await g.eval('G.Coop.fpOk === true'), 'area 1 the same on both sides');
    for (let n = 2; n <= areas; n++) {
      await g.eval('G.Coop.fpOk = undefined; 1');
      await h.eval(`G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.Coop.go(${n}, ${n % 7 === 0 ? "'boss'" : "'combat'"}); 1`);
      try { await g.until(`G.game.area === ${n} && G.Coop.fpOk !== undefined`, 30000); } catch (e) { check(false, `area ${n} reached on the guest`); break; }
      check(await g.eval('G.Coop.fpOk === true'), `area ${n} (${await g.eval('G.game.stage')}) the same on both sides`);
    }
    check(!h.errs.length && !g.errs.length, 'no errors ' + h.errs.concat(g.errs).slice(0, 3).join(' | '));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nEXTRA TEST FAILED (${fails.length})` : '\nEXTRA TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
