'use strict';
// 常連客 (e_free): one offer of the merchant's hall is free, once an area. Rerolls give no second one; "continue" (the area restarts from its
// checkpoint, then the mid-area save puts the shelves back) gives no second one and does not name a free offer that is gone (it used to
// announce the stocked-again one: "〇〇 が無料！" after it was bought or rerolled away). Without a mid-area save the area is replayed from its
// start (your purchases undone too), so its free offer is there again.
//   node tests/free_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9905;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 1); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(800);
    await p.eval(`window.__toasts = []; const t0 = G.ui.toast; G.ui.toast = function (m) { if (/常連客/.test(m)) window.__toasts.push(m); return t0.apply(this, arguments); };
      setInterval(() => { if (G.game.state === 'paused' || G.game.state === 'resuming') G.game.state = 'playing'; }, 100); // (headless: no pointer lock)
      window.__free = () => (G.game.shop ? G.game.shop.offers.filter((o) => o.free).map((o) => ({ sold: !!o.sold, kind: o.kind, name: o.obj.name })) : []); 1`);
    const J = async (js) => JSON.parse(await p.eval(`JSON.stringify(${js})`));
    const enter = async (n) => { await p.eval(`(() => { G.ui.clearScreen(); G.game.state = 'playing'; G.game.rewardPending = null; G.game.transitioning = false; window.__toasts.length = 0; G.game.area = ${n - 1}; G.game.enterArea(${n}, 'shop'); return 1; })()`); await sleep(3000); };
    const cont = async () => { await p.eval("window.__toasts.length = 0; G.game.continueRun(1); 1"); await sleep(3500); };
    await p.eval("G.player.addBuff('e_free'); 1");

    // 1. into the hall: one free offer, named once
    await enter(6);
    const a = await J('window.__free()'), ta = await J('window.__toasts');
    check(a.length === 1 && !a[0].sold && ta.length === 1 && ta[0].includes(a[0].name), `into the hall: one free offer (${a.map((x) => x.kind + ' ' + x.name)}), named once (${ta.length})`);
    // bought, then rerolled: no second free offer
    const skill0 = await p.eval("(() => { const o = G.game.shop.offers.find((x) => x.free); o.sold = true; o.mesh.visible = false; if (o.kind === 'skill') { const i = [1, 2, 3].find((k) => !G.player.skills[k]) || 3; G.player.skills[i] = G.abilities.makeSlot(o.obj.id); return o.obj.id; } return ''; })()");
    let rer = 0; for (let i = 0; i < 4; i++) { await p.eval("G.game.shop.rerolls++; G.game.fillShop(); 1"); rer += (await J('window.__free()')).length; }
    check(rer === 0, `four rerolls: no second free offer (${rer})`);
    // "continue" with the mid-area save: the shelves as they were, and no free offer named
    await p.eval("G.MidSave.tick(); 1");
    await cont();
    const b = await J('window.__free()'), tb = await J('window.__toasts'), sk = await J('G.player.skills.map((s) => s && s.id)');
    check(b.filter((x) => !x.sold).length === 0 && tb.length === 0 && (!skill0 || sk.includes(skill0)), `"continue" after buying it and rerolling: no free offer on the shelves (${JSON.stringify(b)}), none named (${tb.join(' / ') || 'none'}), the bought one kept`);

    // 2. the next hall: its free offer left on the shelf, then "continue": the same one, still free, named once
    await enter(13);
    const c0 = await J('window.__free()');
    await p.eval("G.MidSave.tick(); 1");
    await cont();
    const c = await J('window.__free()'), tc = await J('window.__toasts');
    check(c0.length === 1 && c.length === 1 && !c[0].sold && c[0].name === c0[0].name && tc.length === 1 && tc[0].includes(c[0].name), `"continue" with the free offer still on the shelf: the same one (${c.map((x) => x.name)}), named once (${tc.length})`);

    // 3. no mid-area save: the hall is replayed from its start (its free offer there again, as when you walked in)
    await p.eval("(() => { const k = G.game.runKey(1), d = JSON.parse(localStorage.getItem(k)); delete d.mid; localStorage.setItem(k, JSON.stringify(d)); return 1; })()");
    await cont();
    const d = await J('window.__free()'), td = await J('window.__toasts');
    check(d.length === 1 && !d[0].sold && td.length === 1, `"continue" with no mid-area save: the hall from its start, one free offer (${d.map((x) => x.name)}), named once`);
    check(!p.errs.length, 'no errors' + (p.errs.length ? ': ' + p.errs.slice(-2).join(' | ').slice(0, 300) : ''));
  } catch (e) { check(false, 'crashed: ' + (e && e.stack || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nFREE TEST FAILED (${fails.length})` : '\nFREE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
