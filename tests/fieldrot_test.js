'use strict';
// A new game is a new place: the fields you went into in your last game (any difficulty) are passed over while their tier has another;
// a field that was drawn but never gone into (a later segment of a game given up early) is not; a run keeps the fields it drew (a
// reload meets the same ones).
//   node tests/fieldrot_test.js [games, default 8]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9879;

(async () => {
  const games = +(process.argv[2] || 8);
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.save.data.lastFields = []; 1");
    let prevEntered = null;
    for (let g = 0; g < games; g++) {
      const diff = g % 3 === 2 ? 'normal' : 'hard', deep = g % 2 === 1; // (every other game also goes on into its second segment)
      await p.eval(`G.game.state = 'title'; G.game.startRun({ id: '${diff}', lv: 0 }, 0); 1`);
      await p.until('!!G.game.run && !!G.world && G.game.area === 1', 30000); await sleep(300);
      const r = JSON.parse(await p.eval(`(() => {
        const R = G.Run, run = G.game.run, segs = R.def().segs.map((s) => s[0]);
        return JSON.stringify({ fields: run.fields, segs, tiers: segs.map((b) => R.TIERS[R.tierOf(b)]), f1: R.field(1), entered: (G.save.data.lastFields || []).slice() });
      })()`));
      if (deep) {
        await p.eval('window.__w0 = G.world; G.game.area = 7; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = "playing"; G.game.enterArea(8, "combat"); 1');
        await p.until('G.world !== window.__w0 && G.game.area === 8', 30000); await sleep(300);
      }
      const entered = JSON.parse(await p.eval('JSON.stringify(G.save.data.lastFields || [])'));
      console.log(`game ${g + 1} ${diff}: ${r.fields.join(' / ')}  entered ${entered.join(', ')}`);
      ok(Array.isArray(r.fields) && r.fields.length === r.segs.length && r.fields[0] === r.f1, `game ${g + 1}: the run keeps the fields it drew`);
      ok(entered.length === (deep ? 2 : 1) && entered[0] === r.fields[0] && (!deep || entered[1] === r.fields[1]), `game ${g + 1}: only the fields gone into are counted (${entered.join(', ')})`);
      if (prevEntered) {
        // each segment: a field gone into last game is passed over while its tier has another field not taken
        r.fields.forEach((f, i) => {
          const tier = r.tiers[i], others = tier.filter((x) => !prevEntered.includes(x) && !r.fields.slice(0, i).includes(x));
          if (others.length) ok(!prevEntered.includes(f), `game ${g + 1} segment ${i + 1}: not a field of the last game (${f}; last game went into ${prevEntered.join(', ')})`);
        });
      }
      // a reload meets the same fields: the drawn list stays put whatever is counted since
      const again = JSON.parse(await p.eval("(() => { const keep = G.save.data.lastFields; G.save.data.lastFields = ['x']; const f = [1, 8, 15].filter((n) => n <= G.Run.areas()).map((n) => G.Run.field(n)); G.save.data.lastFields = keep; return JSON.stringify(f); })()"));
      ok(again.every((f, i) => f === r.fields[i]), `game ${g + 1}: the fields of the run stay as drawn`);
      prevEntered = entered;
    }
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? '\nFIELD ROTATION TEST FAILED (' + fails + ')' : '\nFIELD ROTATION TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
