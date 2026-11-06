'use strict';
// The chests an area holds (levelgen.js chestCount), the same rule in every field:
//  - one to three in an ordinary area, more on average the further into the run and the harder the difficulty;
//  - a treasure vault keeps its six; the 宝探し boon adds on top; built for more players, the area holds as many again for each;
//  - 金庫番 brings the ornate chests its description promises.
//   node tests/chest_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9967;
const FIELDS = ['grave', 'hamlet', 'dusk', 'gate', 'catacombs', 'castle', 'halls', 'flooded', 'foundry', 'ruin', 'frozen', 'sanctum'];
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(400);
    const ev = async (js) => JSON.parse(await p.eval(`JSON.stringify((() => { ${js} })())`));
    // the chests of an area of a field, built as the game builds it
    await p.eval(`window.CC = (field, n, kind, o) => { G.Run.field = () => field; const seed = (G.game.seed ^ G.U.hashStr('area' + n + kind)) >>> 0; const w = G.LevelGen.generate(n, seed, Object.assign({ gates: 3, kind }, o || {})); return { n: w.interactables.filter((i) => i.type === 'chest').length, f: w.field }; }; 1`);
    const R = await ev(`
      const out = {};
      for (const d of ['easy', 'normal', 'hard', 'extra']) {
        G.Run.set(d, d === 'extra' ? 1 : 0); const N = G.Run.areas();
        const early = [1, 2, 3], late = [N - 3, N - 2, N - 1];
        const o = out[d] = { early: [], late: [], vault: [], bad: [], wrong: 0 };
        for (const f of ${JSON.stringify(FIELDS)}) for (let s = 0; s < 3; s++) {
          G.game.seed = 5000 + s * 977;
          for (const n of early) { const c = CC(f, n, 'combat'); o.early.push(c.n); if (c.n < 1 || c.n > 3) o.bad.push(f + n + ':' + c.n); if (c.f !== f) o.wrong++; }
          for (const n of late) { const c = CC(f, n, 'combat'); o.late.push(c.n); if (c.n < 1 || c.n > 3) o.bad.push(f + n + ':' + c.n); if (c.f !== f) o.wrong++; }
          if (s === 0) o.vault.push(CC(f, 8, 'vault').n);
        }
      }
      return out;`);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    for (const [d, o] of Object.entries(R)) {
      console.log(`     ${d}: start ${avg(o.early).toFixed(2)}  end ${avg(o.late).toFixed(2)}  vault ${o.vault.join('')}`);
      check(o.bad.length === 0, `${d}: every field holds one to three chests in an area ${o.bad.slice(0, 4).join(' ')}`);
      check(o.wrong === 0, `${d}: every field built itself`);
      check(avg(o.late) > avg(o.early) + 0.4, `${d}: more further into the run (${avg(o.early).toFixed(2)} -> ${avg(o.late).toFixed(2)})`);
      check(o.vault.every((v) => v === 6), `${d}: a treasure vault keeps its six`);
    }
    check(avg(R.extra.early) > avg(R.easy.early) + 0.4 && avg(R.extra.late) > avg(R.easy.late) + 0.4, `more on the harder difficulties (start ${avg(R.easy.early).toFixed(2)} -> ${avg(R.extra.early).toFixed(2)}, end ${avg(R.easy.late).toFixed(2)} -> ${avg(R.extra.late).toFixed(2)})`);
    check(Math.abs(avg(R.easy.early) - 1.05) < 0.25 && Math.abs(avg(R.extra.late) - 2.7) < 0.3, 'the averages match the plan (easy start about 1, extra end about 2.75)');
    // the boon, and more players
    const B = await ev(`
      G.Run.set('hard', 0); const out = { boon: [], mul: [] };
      for (const f of ${JSON.stringify(FIELDS)}) {
        G.game.seed = 777;
        const a = CC(f, 9, 'combat'), b = CC(f, 9, 'combat', { extraChests: 2 }), m2 = CC(f, 9, 'combat', { chestMul: 2 }), m3 = CC(f, 9, 'combat', { chestMul: 3 }), v2 = CC(f, 8, 'vault', { chestMul: 2 });
        out.boon.push([f, a.n, b.n]); out.mul.push([f, a.n, m2.n, m3.n, v2.n]);
      }
      return out;`);
    check(B.boon.every(([, a, b]) => b === a + 2), `宝探し: two boons add two chests (${B.boon.map((x) => x[1] + '>' + x[2]).join(' ')})`);
    check(B.mul.every(([, a, m2, m3]) => m2 === a * 2 && m3 === a * 3), `built for 2 / 3 players: twice / three times as many (${B.mul.map((x) => x.slice(1, 4).join('/')).join(' ')})`);
    check(B.mul.every((x) => x[4] === 12), 'a treasure vault for 2 players holds twelve');
    check(await ev('return G.LevelGen.chestMul === 1'), 'alone again afterwards (the count is reset)');
    // 金庫番: the ornate chest (tier 2) its description promises, one per 5,000 coins
    await ev("G.Run.field = () => 'grave'; G.game.enterArea(3, 'combat'); G.enemies.clear(); G.game.dev = { god: true, speed: 1 }; G.player.pos.set(G.world.spawn.x, 0.2, G.world.spawn.z - 6); G.player.yaw = 0; window.__c0 = G.world.interactables.filter((i) => i.type === 'chest').length; G.game.run.coins = 10500; G.BUFF_BY_ID.e_vaultkeeper.hooks.onAreaClear(); return 1");
    await sleep(1500);
    const vk = await ev("return G.world.interactables.filter((i) => i.type === 'chest').slice(window.__c0).map((i) => i.tier)");
    check(vk.length === 2 && vk.every((t) => t === 2), `金庫番: 10,500 coins bring two ornate chests (${vk.join(',')})`);
    check(await ev("return G.BUFF_BY_ID.e_vaultkeeper.desc.includes('装飾された宝箱')"), '金庫番: the description says ornate chests');
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 300));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nCHEST TEST FAILED (${fails.length})` : '\nCHEST TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
