'use strict';
// 秘伝 in co-op: when a guardian falls each player chooses on their own screen (their own class's pair; nobody waits for anyone), a player
// with a perk still owed (joined later) is offered it once the area is clear, and 飛燕's crescent / 一閃's beam show on the other screen.
//   node tests/coop/perk_test.js
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9711;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'K' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.save.data.settings.volume = 0; G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await sleep(3000);
    const as = (cls) => `(() => { const P = G.player; P.cls = '${cls}'; G.game.run.cls = '${cls}'; P._cs = null; P.perks = []; P.recalc(); return 1; })()`;
    await h.eval(as('heavy')); await g.eval(as('blade'));
    // ---- a guardian falls (the host's clear goes to the guest): each gets their own class's 一の巻
    const boss = `(() => { const GM = G.game; for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); } G.enemies.list.length = 0; GM.objective = null; G.ui.clearScreen(); GM.state = 'playing'; GM.rewardPending = null; G.Classes._offering = false; GM.area = 7; GM.stage = 'boss'; GM.areaCleared = false; return 1; })()`;
    await h.eval(boss); await g.eval(boss);
    await h.eval('G.game.clearArea({ boss: true }); 1');
    const waitFor = async (pg, sel, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 10000)) { if (await pg.eval(`!!document.querySelector('${sel}')`)) return true; await sleep(200); } return false; };
    const hs = await waitFor(h, '.pk-card'), gs = await waitFor(g, '.pk-card');
    const ht = hs ? await h.eval("document.querySelector('.pk-wrap').textContent") : '', gt = gs ? await g.eval("document.querySelector('.pk-wrap').textContent") : '';
    check(hs && gs && /不動の城/.test(ht) && /根を張る/.test(ht) && /深い連斬/.test(gt) && /軽身/.test(gt), 'a guardian falls: each player is offered their own class\'s 一の巻 (host: 重装兵, guest: 剣士)');
    await h.eval("G.ui._buffKeys('Digit1'); 1"); await sleep(800);
    const hb = await waitFor(h, '.bs-cards .card', 5000);
    const gStill = await g.eval("!!document.querySelector('.pk-card')");
    check(hb && gStill && (await h.eval("G.player.perks.join()")) === 'heavy_1a', 'the host chose (不動の城) and goes on to the boon while the guest is still choosing: nobody waits');
    await g.eval("G.ui._buffKeys('Digit2'); 1"); await sleep(800);
    check((await g.eval("G.player.perks.join()")) === 'blade_1b' && (await h.eval("G.player.perks.join()")) === 'heavy_1a', 'each keeps their own choice (guest: 軽身)');
    await h.eval("G.ui._buffApi && G.ui._buffApi.pick(0); 1"); await g.eval("(() => { const b = document.querySelector('.bs-cards .card'); if (b && G.ui._buffApi) G.ui._buffApi.pick(0); return 1; })()"); await sleep(800);
    // ---- joined later: a perk still owed is offered once the area is clear
    await g.eval("(() => { const GM = G.game, P = G.player; G.ui.clearScreen(); GM.state = 'playing'; P.perks = []; GM.area = 10; GM.stage = 'combat'; GM.areaCleared = true; GM.rewardPending = null; G.Classes._offering = false; G.Classes._dueT = 0; return 1; })()");
    const late = await waitFor(g, '.pk-card', 6000);
    check(late && /一の巻/.test(await g.eval("document.querySelector('.pk-title').textContent")), 'a player with nothing chosen at area 10 (joined later) is offered 一の巻 once the area is clear');
    await g.eval("G.ui._buffKeys('Digit1'); 1"); await sleep(600);
    // ---- the pictures of the perks show on the other screen
    const n0 = await h.eval('G.vfx.liveCount()');
    await g.eval("(() => { const P = G.player, f = P.forward(); f.y = 0; f.normalize(); const a = P.pos.clone(); a.y += 1.15; G.vfx.skySlash(a, f, 12, 32, 0xbfe4ff, 0, 0.3); G.vfx.focusBeam(a, a.clone().addScaledVector(f, 30), 0x6ab8ff); return 1; })()");
    let n1 = n0; for (let i = 0; i < 12 && n1 < n0 + 2; i++) { await sleep(150); n1 = await h.eval('G.vfx.liveCount()'); }
    check(n1 >= n0 + 2, `飛燕's crescent and 一閃's beam made on the guest show on the host's screen (${n0} -> ${n1})`);
    const errs = h.errs.concat(g.errs);
    check(!errs.length, 'no page errors ' + errs.slice(0, 3).join(' | ').slice(0, 400));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nCOOP PERK TEST FAILED (${fails.length})` : '\nCOOP PERK TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
