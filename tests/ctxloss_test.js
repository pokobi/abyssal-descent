'use strict';
// The GPU taken away (webglcontextlost), as a phone short of memory does it: the frames must stop without errors, a notice must cover the
// screen, the run must be saved where it stands, and the page must reload by itself - when the context comes back, or after 5 s without
// it - and go on from that save: the same area, where the player stood, the same foes. A guardian's area goes on before its gate. Two
// losses within a minute start the next page one graphics step lower. Run: COOP_PORT=9942 node tests/ctxloss_test.js  (MOBILE=0: PC page)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9988;
const MOBILE = process.env.MOBILE !== '0';
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?${MOBILE ? 'mobile=1' : 'pc=1'}`);
    const boot = async () => { await p.until("window.G && G.game && G.game.state === 'title'", 120000); await p.booted(180000); await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; 1"); };
    await boot();
    await p.eval("localStorage.removeItem('abyss_ctxloss'); localStorage.removeItem('abyss_gfxsafe'); 1");
    // a real run (saved in slot 1, as a player's is)
    await p.eval("G.ui.clearScreen(); G.game.startRun({ id: 'normal', lv: 0 }, 1); 1");
    await p.running(null, 90000); await sleep(1500);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.invulnT = 999; 1");
    const lose = () => p.eval("(window.__lc = G.renderer.getContext().getExtension('WEBGL_lose_context')).loseContext(); 1");
    const state = () => p.eval(`JSON.stringify({ area: G.game.area, stage: G.game.stage, st: G.game.state, run: !!G.game.run, pos: G.player ? [G.player.pos.x, G.player.pos.z] : null,
      foes: G.enemies.list.filter((e) => e.alive && !e.custom && !e.ally).length, q: G.save.data.settings.quality, safe: G.game.gfxSafe || 0 })`).then(JSON.parse);
    // one loss: what happens at once, then the reload and the resumed run
    const scene = async (name, restore, opt) => {
      opt = opt || {};
      if (!opt.keepLog) await p.eval("localStorage.removeItem('abyss_ctxloss'); 1");
      const before = await state();
      const t0 = await p.eval('G.game.time');
      await lose(); await sleep(400);
      const now = JSON.parse(await p.eval("JSON.stringify({ lost: !!G.game.ctxLost, note: (document.getElementById('ctx-notice') || {}).textContent || '', t: G.game.time })"));
      check(now.lost && /描画を復旧/.test(now.note), `${name}: the loss is seen and the notice covers the screen`);
      // the foes as the loss saved them (midsave.js, written at the loss): these must all be back after the reload. (Foes the area had not
      // sent yet are not in it: the area goes on sending them after the resume, as it would have)
      const saved = opt.foes ? JSON.parse(await p.eval("JSON.stringify(((G.game.loadRun() || {}).mid || {}).enemies || [])")) : [];
      await sleep(700);
      const t1 = await p.eval('G.game.time').catch(() => null);
      check(t1 === null || t1 === now.t, `${name}: no time passes while the GPU is away (${t0} -> ${now.t} -> ${t1})`);
      const T = Date.now();
      if (restore) await p.eval('__lc.restoreContext(); 1').catch(() => {});
      // the page reloads: the new page has no __lc
      await p.until('!window.__lc && !!window.G && !!G.game', 20000);
      const took = Date.now() - T;
      check(restore ? took < 8000 : took > 3500 && took < 12000, `${name}: reloaded ${restore ? 'when the context came back' : 'after the wait'} (${took} ms)`);
      await boot();
      if (opt.title) { await sleep(1500); const s = await state(); check(s.st === 'title' && !s.run, `${name}: back at the title (${s.st})`); return s; }
      await p.until('!!G.game.run && !!G.world && !G.game.transitioning && !G.game._warming', 60000);
      await sleep(2000);
      const after = await state();
      check(after.st === 'paused', `${name}: it waits on the pause menu (${after.st})`);
      console.log('     ' + name + ' before ' + JSON.stringify(before) + ' after ' + JSON.stringify(after));
      check(after.area === before.area && after.stage === before.stage, `${name}: the same area goes on (${before.area} ${before.stage} -> ${after.area} ${after.stage})`);
      if (opt.pos !== false) { const d = Math.hypot(after.pos[0] - before.pos[0], after.pos[1] - before.pos[1]); check(d < 1.5, `${name}: where the player stood (${d.toFixed(2)} m off)`); }
      if (opt.foes) {
        // each saved foe back: the same kind with the same health, one for one (where it stands is not compared: between the resume and
        // the pause menu coming up the foes run at the player for a moment)
        const live = JSON.parse(await p.eval("JSON.stringify(G.enemies.list.filter((e) => e.alive && !e.custom && !e.ally && e.def).map((e) => ({ id: e.def.id, hp: Math.round(e.hp) })))"));
        const pool = live.slice(); let back = 0;
        for (const s of saved) { const i = pool.findIndex((e) => e.id === s.id && e.hp === Math.round(s.hp)); if (i >= 0) { pool.splice(i, 1); back++; } }
        check(saved.length > 0 && back === saved.length, `${name}: the same foes (saved ${saved.length}, back ${back}; ${before.foes} alive before, ${after.foes} after)` + (back === saved.length ? '' : ' saved ' + JSON.stringify(saved.map((s) => [s.id, Math.round(s.hp)])) + ' live ' + JSON.stringify(live)));
      }
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.invulnT = 999; 1");
      return after;
    };
    // foes out first (an area sends its first ones a moment after it starts), so that "the same foes" has something to compare
    await p.until('G.enemies.list.some((e) => e.alive && !e.custom && !e.ally && e.state !== "spawn")', 60000).catch(() => {});
    // walk a little first, so that "where the player stood" is not the area's start
    await p.eval("G.player.pos.x += 2; G.player.pos.z += 1.5; G.world.depenetrate(G.player.pos, G.player.hw, G.player.height); 1"); await sleep(600);
    await scene('fight, context back', true, { foes: true });
    await p.eval("G.player.pos.x -= 1.5; G.world.depenetrate(G.player.pos, G.player.hw, G.player.height); 1"); await sleep(600);
    await scene('fight, context not back', false, { foes: true });
    // the pause menu open
    await p.eval("G.game.state = 'paused'; G.ui.pause(); 1"); await sleep(500);
    await scene('pause menu', true);
    // in the middle of the change of area (the next one being made)
    {
      const n = await p.eval('G.game.area');
      await p.eval(`localStorage.removeItem('abyss_ctxloss'); G.game.rewardPending = null; G.game.transitioning = false; G.game.enterArea(${n + 1}, 'combat'); 1`);
      await sleep(30);
      await lose(); await sleep(300);
      check(await p.eval('!!G.game.ctxLost').catch(() => true), 'change of area: the loss is seen');
      await p.eval('__lc.restoreContext(); 1').catch(() => {});
      await p.until('!window.__lc && !!window.G && !!G.game', 20000);
      await boot();
      await p.until('!!G.game.run && !!G.world && !G.game.transitioning', 60000).catch(() => {});
      const s = await state();
      check(!!s.run && (s.area === n || s.area === n + 1), `change of area: the run goes on (area ${n} -> ${n + 1}: now ${s.area} ${s.stage})`);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.invulnT = 999; 1");
    }
    // a guardian's fight under way: it goes on before the gate, as any resumed save of a guardian's area does
    {
      const n = await p.eval('G.game.area + 1');
      await p.eval(`G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(${n}, 'boss'); 1`);
      await p.until(`G.game.stage === 'boss' && G.game.area === ${n} && !G.game.transitioning && !G.game._warming`, 60000); await sleep(1500);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.invulnT = 999; const c = G.world.arenaCenter; if (c) { G.player.pos.set(c.x, 0, c.z + 6); } 1"); await sleep(4000);
      await p.eval('G.game.bossEngaged = true; 1').catch(() => {});
      const s = await scene('guardian fight', true, { pos: false });
      const g = await p.eval('G.world.bossGate ? Math.hypot(G.player.pos.x - G.world.bossGate.x, G.player.pos.z - (G.world.bossGate.z1 + 9)) : -1');
      check(s.stage === 'boss' && g >= 0 && g < 2, `guardian fight: on before the gate (${g.toFixed ? g.toFixed(2) : g} m from it)`);
    }
    // twice within a minute: one graphics step lower
    {
      await p.eval("localStorage.removeItem('abyss_ctxloss'); localStorage.removeItem('abyss_gfxsafe'); G.save.data.settings.quality = 'med'; G.save.write(); 1");
      await scene('second loss in a minute (1)', true, { pos: false });
      const s = await scene('second loss in a minute (2)', true, { pos: false, keepLog: true });
      check(s.q === 'low', `twice in a minute: quality one step lower (med -> ${s.q})`);
      const toast = await p.eval("[...document.querySelectorAll('.toast, #toasts *')].map((e) => e.textContent).join(' | ')");
      check(/画質を一段下げ/.test(toast), 'twice in a minute: the player is told (' + toast.slice(0, 80) + ')');
      // and once more at the lowest: fewer pixels
      await p.eval("localStorage.removeItem('abyss_ctxloss'); 1");
      await scene('at the lowest (1)', true, { pos: false });
      const s2 = await scene('at the lowest (2)', true, { pos: false, keepLog: true });
      const pr = await p.eval('G.renderer.getPixelRatio()');
      check(s2.safe === 1, `at the lowest: fewer pixels next (safe level ${s2.safe}, pixel ratio ${pr})`);
      await p.eval("localStorage.removeItem('abyss_gfxsafe'); localStorage.removeItem('abyss_ctxloss'); 1");
    }
    // at the title (no run going): back to the title, nothing resumed
    await p.eval("G.game.clearRun && G.game.clearRun(1); G.game.debug = true; location.reload(); 1").catch(() => {});
    await sleep(1500); await boot();
    await scene('title', true, { title: true });
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 600));
  } catch (e) { console.error(e); fails.push(String(e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nCONTEXT LOSS TEST FAILED (${fails.length})` : '\nCONTEXT LOSS TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
