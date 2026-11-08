'use strict';
// The extra level on the difficulty screen: the one picked last time is picked again; clearing the highest level you could play for the
// first time moves it to the one just opened; clearing a lower one again leaves your pick alone.
//   node tests/extralv_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9883;

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); 1");
    // hard and extra 1-3 cleared: extra 4 is the highest you can play
    await p.eval("(() => { const c = G.Run.rec(); c.hard = c.hard || 1; for (let k = 1; k <= 10; k++) delete c['extra' + k]; c.extra1 = c.extra2 = c.extra3 = 1; delete G.save.data.extraLv; G.save.write(); })(); 1");
    // open the difficulty screen, turn to the extra side, read the level; pick it (or another first) to start
    const open = async () => {
      await p.eval("window.__pick = null; G.ui.difficulty((d) => { window.__pick = d; }, () => {}); 1");
      await p.until("!!document.querySelector('[data-sw=\"1\"]')", 5000);
      await p.eval("document.querySelector('[data-sw=\"1\"]').click(); 1");
      await p.until("!!document.querySelector('#df-xlv')", 5000); await sleep(900);
      return p.eval("+document.querySelector('#df-xlv').textContent.replace(/[^0-9]/g, '')");
    };
    const pickAt = async (lv) => {
      for (let i = 0; i < 12; i++) {
        const cur = await p.eval("+document.querySelector('#df-xlv').textContent.replace(/[^0-9]/g, '')");
        if (cur === lv) break;
        await p.eval(`document.querySelector('[data-x="${cur < lv ? 1 : -1}"]').click(); 1`); await sleep(60);
      }
      await p.eval("document.querySelector('.df-card[data-id=\"extra\"]').click(); 1"); await sleep(200);
      return p.eval('JSON.stringify(window.__pick)').then(JSON.parse);
    };
    const clear = (lv) => p.eval(`(() => { const keep = G.Run.cur; G.Run.cur = { id: 'extra', lv: ${lv} }; const f = G.Run.markClear(); G.Run.cur = keep; G.ui.clearScreen(); return f; })()`);

    let lv = await open();
    ok(lv === 4, `nothing picked before: the highest you can play (${lv})`);
    let pk = await pickAt(2);
    ok(pk && pk.id === 'extra' && pk.lv === 2 && (await p.eval('G.save.data.extraLv')) === 2, `extra 2 picked and kept (${JSON.stringify(pk)})`);
    await p.eval('G.ui.clearScreen(); 1');
    lv = await open();
    ok(lv === 2, `next time: the level picked last time (${lv})`);
    await p.eval('G.ui.clearScreen(); 1');
    await clear(2);
    lv = await open();
    ok(lv === 2, `extra 2 cleared again: the pick stays (${lv})`);
    pk = await pickAt(4);
    await p.eval('G.ui.clearScreen(); 1');
    const first = await clear(4);
    lv = await open();
    ok(first && lv === 5, `the highest level (4) cleared for the first time: the one just opened (${lv})`);
    await p.eval('G.ui.clearScreen(); 1');
    // a reload keeps it
    await p.eval('G.save.write(); location.reload(); 1').catch(() => {});
    await sleep(1500);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    lv = await open();
    ok(lv === 5, `after a reload: still that level (${lv})`);
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
    await p.eval("(() => { const c = G.Run.rec(); for (let k = 1; k <= 10; k++) delete c['extra' + k]; delete G.save.data.extraLv; G.save.write(); })(); 1");
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? '\nEXTRA LEVEL TEST FAILED (' + fails + ')' : '\nEXTRA LEVEL TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
