'use strict';
// No foe is ever moved to you (no warping), and no area hangs on a foe you cannot get at: in a combat area of every field the bot fights
// until the area is cleared. All the while every foe is watched: never standing (or flying) where you cannot reach (E.walkOk / E.airOk),
// and one that has not moved for a long while far from you is noted (with where it is). No foe jumps more than a few metres in a moment.
// When no foe has been hurt for 20 s the bot is set down near the nearest one left, in sight of it (walking to its 💀 mark, as you would).
//   node tests/clear_test.js            (CLEAR_SECS: the longest an area may take, 150 by default)
const path = require('path'), fs = require('fs');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
const LIMIT = +(process.env.CLEAR_SECS || 150);
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; 1");
    await p.eval("G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(1500);
    await p.eval(fs.readFileSync(path.join(ROOT, 'tests/bot.js'), 'utf8') + '; 1');
    // the watcher: at every update of the foes (game time, not the wall clock: a busy page's timers run late)
    await p.eval(`(() => {
      window.__W = { bad: [], stuck: [], jump: 0, jumpEx: '', hurt: 0 };
      const seen = new Map(), E = G.enemies, upd = E.update;
      E.update = function (dt) {
        const before = new Map(); for (const e of E.list) if (e.alive) before.set(e, e.pos.clone());
        const hp0 = E.list.reduce((s, e) => s + (e.alive ? e.hp : 0), 0), n0 = E.list.filter((e) => e.alive).length;
        const r0 = upd.apply(this, arguments);
        const GM = G.game, P = G.player; if (GM.state !== 'playing' || GM.transitioning || !G.world) return r0;
        if (E.list.reduce((s, e) => s + (e.alive ? e.hp : 0), 0) < hp0 - 0.5 || E.list.filter((e) => e.alive).length < n0) window.__W.hurt = GM.time;
        for (const e of E.list) {
          if (!e.alive || e.custom || e.boss || e.ally || e.burrowed || e.state === 'spawn') continue;
          const b = before.get(e);
          const blinker = e.def.blink || e.def.variant === 'shadow' || (e.mut && e.mut.blink); // (their own sidestep / the mutation's blink: a move of theirs, not a warp to you)
          if (b && !blinker) { const step = Math.hypot(e.pos.x - b.x, e.pos.z - b.z); if (step > window.__W.jump) { window.__W.jump = step; window.__W.jumpEx = e.def.name + ' ' + step.toFixed(2) + 'm in ' + dt.toFixed(3) + ' s'; } }
          const ok = e.flyer ? E.airOk(e.pos.x, e.pos.z) : E.walkOk(e.pos.x, e.pos.z, e.pos.y);
          let r = seen.get(e); if (!r || r.w !== G.world) { r = { w: G.world, p: e.pos.clone(), t: GM.time, noted: false, bad: false }; seen.set(e, r); }
          if (!ok && !r.bad) { r.bad = true; window.__W.bad.push(G.world.field + ' ' + e.def.name + (e.flyer ? '(飛)' : '') + ' @' + e.pos.x.toFixed(1) + ',' + e.pos.y.toFixed(1) + ',' + e.pos.z.toFixed(1)); }
          if (e.pos.distanceTo(r.p) > 0.6) { r.p.copy(e.pos); r.t = GM.time; }
          else if (!r.noted && GM.time - r.t > 20 && Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) > 8) { r.noted = true; window.__W.stuck.push(G.world.field + ' ' + e.def.name + ' still 20 s @' + e.pos.x.toFixed(1) + ',' + e.pos.y.toFixed(1) + ',' + e.pos.z.toFixed(1) + ' sees you ' + !!e.hasLOS + ' aware ' + !!e.aware); }
        }
        return r0;
      };
      // walking to the 💀 mark (what you would do, and the bot does not): a reachable spot a few metres from the nearest foe left, in sight of it
      window.__toMark = () => {
        const w = G.world, P = G.player, left = E.list.filter((e) => e.alive && !e.custom && !e.boss && !e.ally && !e.burrowed);
        if (!left.length) return '';
        left.sort((a, b) => a.pos.distanceTo(P.pos) - b.pos.distanceTo(P.pos)); const e = left[0];
        let best = null;
        for (let i = 0; i < 300; i++) { const c = w.randomOpenCell({ next: Math.random }, (x, z, idx) => w.reachMask && w.reachMask[idx] && Math.hypot(x - e.pos.x, z - e.pos.z) > 2.5 && Math.hypot(x - e.pos.x, z - e.pos.z) < 7); if (!c) break; if (w.los(new THREE.Vector3(c.x, c.y + 1.6, c.z), e.centerPos())) { best = c; break; } }
        if (!best) return e.def.name + ' (no spot in sight)';
        P.pos.set(best.x, best.y + 0.05, best.z); P.vel.set(0, 0, 0); P.yaw = Math.atan2(-(e.pos.x - best.x), -(e.pos.z - best.z));
        return e.def.name;
      };
      return 1;
    })()`);
    const fields = JSON.parse(await p.eval('JSON.stringify(G.Run.TIERS.flat().filter((f) => G.Run.isField(f)))'));
    const times = [], marks = [];
    for (const f of fields) {
      await p.eval(`(() => { const GM = G.game; G.Run.field = () => '${f}'; GM.seed = ${(f.length * 4099 + f.charCodeAt(0)) % 100000}; GM.area = 7; GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; GM.dev = { god: true, speed: 1 }; GM.enterArea(8, 'combat'); return 1; })()`);
      await p.until(`G.world && G.world.field === '${f}' && G.game.state === 'playing' && !G.game.transitioning`, 40000).catch(() => {});
      await sleep(800);
      const t0 = await p.eval('G.game.time');
      let cleared = false;
      for (let k = 0; k < LIMIT / 5 + 2; k++) {
        await p.eval("(() => { const GM = G.game; GM.dev = { god: true, speed: 1 }; if (GM.state !== 'playing' && GM.state !== 'buff' && GM.state !== 'modal') { G.ui.clearScreen(); GM.state = 'playing'; } return 1; })()");
        await p.eval('window.__bot(5000).then(String)');
        const st = JSON.parse(await p.eval(`JSON.stringify({ c: !!(G.game.areaCleared || G.game.rewardPending), a: G.game.area, t: G.game.time, quiet: G.game.time - Math.max(window.__W.hurt || 0, ${t0}) })`));
        if (st.c || st.a !== 8) { cleared = true; break; }
        if (st.t - t0 > LIMIT) break;
        if (st.quiet > 20) { const who = await p.eval('window.__toMark()'); if (who) marks.push(f + ': ' + who); await p.eval('window.__W.hurt = G.game.time; 1'); }
      }
      const t = +(await p.eval('G.game.time') - t0).toFixed(0);
      const left = await p.eval("G.enemies.list.filter((e) => e.alive && !e.custom && !e.boss && !e.ally).map((e) => e.def.name + ' @' + e.pos.x.toFixed(0) + ',' + e.pos.y.toFixed(0) + ',' + e.pos.z.toFixed(0)).slice(0, 4).join(' | ')");
      times.push([f, cleared, t]);
      console.log(`      ${f.padEnd(12)} ${cleared ? 'cleared' : 'NOT CLEARED'} in ${t} s${cleared ? '' : '  left: ' + left}`);
    }
    const W = JSON.parse(await p.eval('JSON.stringify(window.__W)'));
    console.log('      not reachable: ' + (W.bad.length ? W.bad.slice(0, 10).join('\n                     ') : 'none'));
    console.log('      long still (20 s+, far): ' + (W.stuck.length ? W.stuck.slice(0, 12).join('\n                     ') : 'none'));
    console.log('      walked to a mark (no foe hurt for 20 s): ' + (marks.join(', ') || 'never'));
    console.log('      largest step in one update: ' + W.jumpEx);
    check(times.every((x) => x[1]), `every field's combat area cleared without any foe moved to you (${times.filter((x) => x[1]).length}/${times.length})`);
    check(!W.bad.length, `no foe ever where you cannot reach it (${W.bad.length})`);
    check(W.jump < 3, `no foe warped (largest step in one update: ${W.jumpEx})`);
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nCLEAR TEST FAILED (${fails.length})` : '\nCLEAR TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
