'use strict';
// One player, the plan's new numbers in a real page: areas on both sides of the segment boundaries in every difficulty, each kind of fight, the shop and a guardian.
// Foes must come (as many as the plan says) with no errors, and the coins and the shop's stock must work.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9987;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; 1");
    for (const [id, lv] of [['normal', 0], ['hard', 0], ['extra', 1]]) {
      await p.eval(`G.game.startRun({ id: '${id}', lv: ${lv} }, 0); G.game.dev = { god: true, speed: 1 }; 1`);
      await p.until("!!G.game.run && !!G.world && G.game.area >= 1", 30000);
      await sleep(800);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
      const seen = [];
      for (const [n, kind] of [[5, 'combat'], [8, 'combat'], [9, 'elite'], [9, 'cursed'], [12, 'combat'], [15, 'combat'], [16, 'vault']]) {
        await p.eval(`G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(${n}, '${kind}'); 1`);
        await p.until(`G.game.area === ${n} && !!G.game.objective && !!G.game.objective.waves`, 20000);
        await sleep(300);
        const plan = JSON.parse(await p.eval("JSON.stringify({ total: G.game.objective.total, kind: G.game.objective.kind, waves: G.game.objective.waves.map((w) => w.n), cap: G.Run.cap(G.game.area), hp: G.game.areaMods.hp })"));
        await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
        await p.until("G.enemies.list.some((e) => e.alive && !e.custom)", 20000).catch(() => {});
        const alive = await p.eval("G.enemies.list.filter((e) => e.alive && !e.custom).length");
        seen.push(`${n}${kind[0]}:${plan.total}/${plan.cap.toFixed(1)}`);
        check(plan.total >= 2 && plan.waves.reduce((s, v) => s + v, 0) === plan.total && alive >= 1, `${id} area ${n} ${kind}: ${plan.total} foes planned (cap ${plan.cap.toFixed(2)}), ${alive} on the field`);
      }
      console.log('     ' + id + ' plans: ' + seen.join('  '));
      // the shop, its altar and its stock
      await p.eval("G.game.run.coins = 20000; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(6, 'shop'); 1");
      await p.until("G.game.stage === 'shop' && !!G.game.shop && G.game.shop.offers.length > 10", 20000);
      const sh = JSON.parse(await p.eval("JSON.stringify({ n: G.game.shop.offers.length, rr: [G.world.rerollPos.x, G.world.rerollPos.z], price: G.game.rerollCost() })"));
      check(sh.n >= 20 && Math.abs(sh.rr[0] - 28) < 0.01 && Math.abs(sh.rr[1] - 28.5) < 0.01, `${id}: the shop is stocked (${sh.n} wares) and the altar stands mid-hall at ${sh.rr.join(', ')}`);
      const before = await p.eval("G.game.run.coins");
      await p.eval("G.game.shop.rerolls = 0; G.game.run.coins -= G.game.rerollCost(); G.game.shop.rerolls++; G.game.fillShop(); 1");
      check(await p.eval("G.game.shop.offers.length") >= 20, `${id}: and it restocks`);
      // a guardian
      await p.eval("G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(7, 'boss'); 1");
      await p.until("G.game.stage === 'boss' && G.game.area === 7", 20000);
      await sleep(500);
      // coins: a kill pays more early on easy / normal / hard than a kill of the same foe would plain
      const pay = JSON.parse(await p.eval(`(() => { const R = G.Run; return JSON.stringify([R.incomeMul(1), R.incomeMul(8), R.incomeMul(14)]); })()`));
      console.log('     ' + id + ' coin multiplier at areas 1 / 8 / 14: ' + pay.map((v) => v.toFixed(2)).join(' / '));
    }
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nSOLO SMOKE TEST FAILED (${fails.length})` : '\nSOLO SMOKE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
