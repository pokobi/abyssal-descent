'use strict';
// The warm-up made every shader an area needs before it is shown: after the area's black fade, nothing that turns up later makes the page
// wait for a new shader (a foe's searchable body and its highlight, the clear, the mini shop with its stands and wares, the healing basin,
// the boon screen). Also the performance monitor (perfmon.js): a frame made slow on purpose by our own code is reported as JS (it was put
// on the frame after it before), the whole frame's draw calls are counted, and the report has the GPU time and the browser's own record.
//   node tests/warm_test.js [fields, default castle,mine]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9899;

const PAGE = `
window.__wt = (function () {
  const R = G.renderer, S = { hits: [], ev: [] };
  let seen = new Set(R.info.programs.map((p) => p.id));
  S.reset = () => { seen = new Set(R.info.programs.map((p) => p.id)); S.hits = []; };
  const ro = R.render;
  R.render = function (sc, cam) {
    const a = performance.now(); const r = ro.call(this, sc, cam); const d = performance.now() - a;
    const fresh = R.info.programs.filter((p) => !seen.has(p.id));
    if (fresh.length && !G.game._warming) {
      for (const p of fresh) seen.add(p.id);
      const who = [];
      sc.traverse((o) => { if (!o.material) return; for (const mt of Array.isArray(o.material) ? o.material : [o.material]) { const pr = R.properties.get(mt).currentProgram; if (pr && fresh.includes(pr)) { let path = [], q = o; for (let i = 0; q && i < 4; i++, q = q.parent) path.push(q.name || q.type); who.push(mt.type + (mt.map ? '+map' : '') + (mt.normalMap ? '+normal' : '') + ' side' + mt.side + ' fog' + mt.fog + ' tm' + mt.toneMapped + ' cast' + o.castShadow + ' col#' + (mt.color ? mt.color.getHexString() : '') + ' op' + mt.opacity + ' vis' + o.visible + ' @ ' + path.join('<')); } } });
      S.hits.push({ phase: S.phase, keys: fresh.map((p) => (p.cacheKey || '').slice(0, 300)), ms: Math.round(d), n: fresh.length, scene: sc === G.scene ? 'world' : 'other', st: G.game.state, who: [...new Set(who)].slice(0, 6) });
    } else if (fresh.length) for (const p of fresh) seen.add(p.id);
    return r;
  };
  setInterval(() => { if (G.game.state === 'paused' || G.game.state === 'resuming') { G.game.state = 'playing'; G.ui.clearScreen(); } }, 100); // (headless: no pointer lock)
  return S;
})();
1;`;

(async () => {
  const fields = (process.argv[2] || 'castle,mine').split(',');
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    // each field in a page of its own: a fresh session, so no shader is left over from another field
    let p = null;
    for (const f of fields) {
      p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
      await p.send('Emulation.setDeviceMetricsOverride', { width: 1745, height: 982, deviceScaleFactor: 1.1, mobile: false });
      await p.until("window.G && G.game && G.game.state === 'title'", 90000);
      await p.eval(`G.save.data.settings.volume = 0; G.sfx.setVolume && G.sfx.setVolume(0); G.save.data.settings.quality = 'high'; G.save.data.settings.askTutorial = false; G.Run.field = () => '${f}'; G.game.startRun({ id: 'normal', lv: 0 }, 0); 1`);
      await p.until("!!G.game.run && !!G.world && !G.game._warming", 60000);
      await p.eval("G.game.dev = { god: true, speed: 1 }; 1");
      await sleep(800);
      // (the quality set to high: its own area warm-up again, as when the setting is changed)
      await p.eval(`(() => { const GM = G.game; GM.applyQuality && GM.applyQuality(); G.ui.clearScreen(); GM.state = 'playing'; GM.area++; GM.enterArea(GM.area, 'combat'); return 1; })()`);
      await p.until("!G.game._warming && (G.game.state === 'playing' || G.game.state === 'paused')", 30000);
      await p.eval(PAGE);
      await sleep(1200); // (the first frames after the fade)
      // a foe falls (its body can be searched: the highlight), then the area is cleared: the mini shop, the healing basin, the boon screen
      await p.eval("window.__wt.phase = 'body'; 1");
      await p.eval("(() => { const P = G.player, f = P.forward(); f.y = 0; f.normalize(); const e = G.enemies.spawn(G.ENEMY_BY_ID.brute_normal, 5, P.pos.clone().addScaledVector(f, 4), {}); e.hp = 1; G.combat.damageEnemy(e, 50, { src: 'bullet' }); return 1; })()");
      await sleep(1500);
      await p.eval("window.__wt.phase = 'clear'; 1");
      await p.eval("for (const e of G.enemies.list.slice()) if (e.alive) { e.hp = 0; G.combat.killEnemy(e, { src: 'bullet' }); } if (!G.game.areaCleared) G.game.clearArea({}); 1");
      await sleep(3800);
      const shop = await p.eval("!!(G.game.shop && G.game.shop.offers.length) + ' ' + !!document.querySelector('.bs-cards .card')");
      await p.eval("(() => { G.player.hp = G.player.stats.maxHp * 0.3; G.game.healHint = true; return 1; })()"); await sleep(800); // (the basin's hint)
      const r = JSON.parse(await p.eval("JSON.stringify(window.__wt.hits)"));
      for (const h of r) { console.log(`      new shader x${h.n} in the ${h.scene} render, ${h.ms} ms (${h.st}, ${h.phase}): ${h.who.join(' | ')}`); if (process.env.WARM_KEYS) for (const k of h.keys) console.log('        key ' + k); }
      const slow = r.filter((h) => h.ms >= 15);
      check(shop === 'true true' && slow.length === 0, `${f}: after the area's fade, a foe's body, the clear, the mini shop, the basin and the boon screen make no shader on the spot (${r.length} new, ${slow.length} slow; shop/boon ${shop})`);
      await p.eval("G.ui._buffApi && G.ui._buffApi.pick(0); 1"); await sleep(600);
      check(!p.errs.length, `${f}: no page errors ` + p.errs.slice(0, 3).join(' | ').slice(0, 400));
    }
    // ---- the performance monitor
    const pf = JSON.parse(await p.eval(`(async () => {
      const GM = G.game; G.ui.clearScreen(); GM.state = 'playing';
      // one frame made slow by our own code (the HUD's update, 2.5 s in): it is the frame that started the long interval
      const u = G.ui.update, armAt = performance.now() + 2500; let once = true;
      G.ui.update = function () { if (once && performance.now() > armAt) { once = false; const t = performance.now(); while (performance.now() - t < 160) { /* busy */ } } return u.apply(this, arguments); };
      G.Perf.enable();
      await new Promise((r) => setTimeout(r, 4000));
      const rep = G.Perf.report(); G.Perf.disable(); G.ui.update = u;
      return JSON.stringify({ rep, spikes: G.Perf.spikes.map((k) => [Math.round(k.iv), Math.round(k.js), k.top]) });
    })()`));
    console.log('      ' + pf.rep.split('\n').slice(3, 6).join('\n      '));
    const big = pf.spikes.filter((x) => x[0] >= 150);
    check(big.some((x) => x[1] >= 150 && /HUD/.test(x[2])) && /\n\S+s\s+\d+(\.\d)?ms \(js 1[5-9]\d[^\n]*JS HUD/.test(pf.rep), `perf monitor: a frame our code made slow (160 ms in the HUD) is reported as JS HUD, on that frame (${JSON.stringify(big)})`);
    const calls = +((pf.rep.match(/calls (\d+)/) || [])[1] || 0);
    check(calls > 40 && /gpu (\d|-|n\/a)/.test(pf.rep) && /long frames \d+/.test(pf.rep), `perf monitor: the whole frame's draw calls (${calls}), the GPU time and the browser's long frames are in the report`);
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 400));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nWARM TEST FAILED (${fails.length})` : '\nWARM TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
