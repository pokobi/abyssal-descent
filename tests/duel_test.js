'use strict';
// Duels (js/duel.js), solo: for each duelling guardian (or the ids given): the duel starts at 70%, the ring / lock / guide are up, the guardian holds off
// for the reading time, every blow flashes gold first, a press in the window parries (no damage, gauge down), a press too early or a held key fails
// (damage taken), the gauge emptied by parries breaks (12% of health, stagger), and a duel that runs out leaves the gauge as a shield that ordinary
// damage wears down at half rate before health can fall; the second duel comes at 35%.
//   node tests/duel_test.js [ids...]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9993;
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['madman', 'hollowknight', 'oboro'];
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until("!!G.game.run && !!G.world", 30000);
    await sleep(500);
    // blows on the player are counted, not felt
    await p.eval("window.__hits = []; const d0 = G.combat.damagePlayer; G.combat.damagePlayer = function (dmg, info) { if (info && info.attacker && info.attacker.boss) { __hits.push({ t: G.Duel.cur ? G.Duel.cur.t : -1, dmg }); return 0; } return d0.apply(this, arguments); }; 1");
    // a press of the guard key, as melee.js passes it on
    // the bot rides on the game's own frame (a background tab gives requestAnimationFrame no time): the key goes down the frame a blow flashes, up two frames later
    await p.eval("window.__auto = null; window.__up = 0; const u0 = G.bosses.update; G.bosses.update = function (dt) { const r = u0.apply(this, arguments); const d = G.Duel.cur, k = G.BIND.reload[0]; if (window.__up > 0 && --window.__up === 0) G.input.keys[k] = false; if (d && d.combo && window.__auto === 'ok') for (const s of d.combo.list) if (s.flashed && !s.done && !s.parried && !s._p) { s._p = true; G.input.keys[k] = true; window.__up = 2; } return r; }; 1");
    const press = () => p.eval("G.input.keys[G.BIND.reload[0]] = true; 1").then(() => sleep(60)).then(() => p.eval("G.input.keys[G.BIND.reload[0]] = false; 1"));
    for (const id of IDS) {
      console.log(`--- ${id}`);
      await p.eval(`G.bosses.forArea = () => '${id}'; G.bosses.clear(); G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(5, 'boss'); 1`);
      await p.until("G.game.stage === 'boss' && !!G.world.arenaCenter", 20000);
      await sleep(500);
      await p.eval("(() => { const w = G.world, P = G.player; G.ui.clearScreen(); G.game.state = 'playing'; P.pos.set(w.arenaCenter.x, (w.roadFloorY ? 0 : P.pos.y) + 0.1, w.ledgeZ ? w.ledgeZ - 4 : w.arenaD - 6); P.vel.set(0, 0, 0); return 1; })()");
      await p.until(`!!G.bosses.active && G.bosses.active.def.id === '${id}'`, 20000);
      check(await p.eval('!!G.bosses.active.duelSt'), 'the guardian duels');
      // a gun in hand, then the guardian is brought to 69%
      await p.eval("G.weapons.switchTo(0); 1");
      await sleep(300);
      await p.eval("(() => { const b = G.bosses.active; b.hp = b.maxHp * 0.69; return 1; })()");
      await p.until('!!G.Duel.cur', 5000).catch(() => {});
      const st = JSON.parse(await p.eval("JSON.stringify({ on: !!G.Duel.cur, lock: !!G.player.duelLock, melee: !!G.player.meleeMode, ring: !!(G.Duel.cur && G.Duel.cur.ring), ov: document.getElementById('duel-ov').className, guide: document.querySelector('#duel-ov .dv-guide').textContent.length, wg: G.bosses.active.duelSt.wg / G.bosses.active.maxHp, foes: G.enemies.list.filter((e) => e.alive && !e.boss).length })"));
      console.log('     ', JSON.stringify(st));
      check(st.on && st.lock && st.melee && st.ring, 'at 70% a duel starts: the melee weapon in hand, locked, a ring');
      check(/on/.test(st.ov) && /read/.test(st.ov) && st.guide > 60, 'the rules are shown as it starts');
      check(Math.abs(st.wg - 0.12) < 0.001, 'a white gauge of 12% of its health');
      check(st.foes === 0, 'nothing else is left on the field');
      // sealed: skills, items, the bag, a gun
      const sealed = await p.eval("(() => { const P = G.player, r = {}; const sk = P.skills.find((s) => s); const cd = sk ? sk.cd : 0; if (sk) { sk.cd = 0; G.abilities.cast(sk); r.skill = sk.cd === 0; } G.weapons.switchTo(0); r.gun = P.meleeMode; return JSON.stringify(r); })()");
      check(/"gun":true/.test(sealed) && !/"skill":false/.test(sealed), 'skills and guns are sealed ' + sealed);
      // the reading time: no blow
      const h0 = await p.eval('__hits.length');
      await p.until('G.Duel.cur && G.Duel.cur.t > G.Duel.INTRO + G.Duel.READ - 0.3', 9000);
      check((await p.eval('__hits.length')) === h0 && (await p.eval('!G.Duel.cur.combo')), 'no blow for the reading time');
      // a missed blow: no press -> it lands
      await p.until('G.Duel.cur && G.Duel.cur.combo', 8000);
      const hb = await p.eval('__hits.length');
      await p.until('!G.Duel.cur || !G.Duel.cur.combo', 12000);
      const missed = (await p.eval('__hits.length')) - hb;
      check(missed > 0, `blows not parried land (${missed})`);
      check(await p.eval('G.bosses.active.duelSt.wg / G.bosses.active.maxHp > 0.119'), 'and take nothing off the gauge');
      // parry: wait for each flash and press inside the window
      // the in-page bot presses the key the frame each blow flashes (the test's own polling is far too slow for a 0.3 s window)
      const parryCombo = async () => {
        await p.until('G.Duel.cur && G.Duel.cur.combo', 8000);
        await p.eval("window.__auto = 'ok'; 1");
        await p.until('!G.Duel.cur || !G.Duel.cur.combo', 12000);
        await p.eval("window.__auto = null; 1");
        return 1;
      };
      const g0 = await p.eval('G.bosses.active.duelSt.wg'), hp0 = await p.eval('G.bosses.active.hp'), h1 = await p.eval('__hits.length');
      const presses = await parryCombo();
      const after = JSON.parse(await p.eval(`JSON.stringify({ wg: G.bosses.active.duelSt.wg, hp: G.bosses.active.hp, hits: __hits.length - ${h1}, max: G.bosses.active.maxHp })`));
      console.log('      parried combo: presses', presses, JSON.stringify(after));
      check(after.hits === 0 && after.wg < g0 - 1, 'pressing as it flashes parries every blow: no damage, the gauge goes down');
      check(Math.abs(after.hp - hp0) < 1, 'its health does not move in the duel');
      // a held key: fails
      await p.until('G.Duel.cur && !G.Duel.cur.combo', 8000);
      await p.eval("G.input.keys[G.BIND.reload[0]] = true; 1");
      const h2 = await p.eval('__hits.length'), g2 = await p.eval('G.bosses.active.duelSt.wg');
      await p.until('G.Duel.cur && G.Duel.cur.combo', 8000);
      await p.until('!G.Duel.cur || !G.Duel.cur.combo', 12000);
      await p.eval("G.input.keys[G.BIND.reload[0]] = false; 1");
      check((await p.eval('__hits.length')) > h2 && (await p.eval('G.bosses.active.duelSt.wg')) === g2, 'holding the key does not parry');
      // too early: pressed during the wind-up, before the flash
      await p.until('G.Duel.cur && G.Duel.cur.combo', 8000);
      await p.until('G.Duel.cur && G.Duel.cur.combo && G.Duel.cur.combo.t > G.Duel.cur.combo.list[0].at - 0.7 && !G.Duel.cur.combo.list[0].flashed', 6000).catch(() => {});
      const h3 = await p.eval('__hits.length');
      await press();
      await p.until('!G.Duel.cur || G.Duel.cur.combo.list[0].done', 6000);
      const first = await p.eval('G.Duel.cur ? JSON.stringify(G.Duel.cur.combo ? { p: G.Duel.cur.combo.list[0].parried, f: G.Duel.cur.combo.list[0].fail } : null) : "end"');
      check((await p.eval('__hits.length')) > h3, 'a press before the flash fails: the blow lands ' + first);
      // the break: parry until the gauge is gone
      for (let i = 0; i < 6 && (await p.eval('!!G.Duel.cur')); i++) { await p.until('!G.Duel.cur || !G.Duel.cur.combo', 12000); await parryCombo(); }
      const br = JSON.parse(await p.eval("JSON.stringify({ duel: !!G.Duel.cur, wg: G.bosses.active.duelSt.wg, hp: G.bosses.active.hp / G.bosses.active.maxHp, stun: G.bosses.active.duelSt.stunT, lock: !!G.player.duelLock, melee: G.player.meleeMode })"));
      console.log('      after the parries', JSON.stringify(br));
      check(!br.duel && br.wg === 0 && Math.abs(br.hp - 0.57) < 0.011 && br.stun > 3, 'emptied by parries: BREAK, 12% of its health and a stagger');
      check(!br.lock && !br.melee, 'the duel is over: unlocked, the gun back in hand');
      // in the stagger it takes x1.5
      const mul = await p.eval("G.bosses.active.main.dmgMul({ src: 'bullet' }, {})");
      check(mul === 1.5, 'staggered: damage x1.5 (' + mul + ')');
      // the second duel at 35%, left to run out: the gauge stays as a shield
      await p.until('G.bosses.active.duelSt.stunT <= 0', 8000);
      await p.eval("(() => { const b = G.bosses.active; b.hp = b.maxHp * 0.34; return 1; })()");
      await p.until('!!G.Duel.cur', 5000).catch(() => {});
      check(await p.eval('!!G.Duel.cur && G.bosses.active.duelSt.n === 2'), 'the second duel comes at 35%');
      await p.eval('G.Duel.cur.t = G.Duel.INTRO + G.Duel.READ + G.Duel.LIMIT - 0.5; 1');
      await p.until('!G.Duel.cur', 5000);
      const sh = JSON.parse(await p.eval("JSON.stringify({ wg: G.bosses.active.duelSt.wg, max: G.bosses.active.duelSt.wgMax, hp: G.bosses.active.hp, lbl: document.getElementById('boss-duel').className })"));
      check(sh.wg === sh.max && /on/.test(sh.lbl), 'time ran out: the white gauge stays (and is shown)');
      await p.eval(`(() => { const b = G.bosses.active; b.state = 'fight'; G.combat.damageEnemy(b.main, 100, { src: 'bullet', noBuffs: true, silent: true }); return 1; })()`);
      const sh2 = JSON.parse(await p.eval("JSON.stringify({ wg: G.bosses.active.duelSt.wg, hp: G.bosses.active.hp })"));
      check(sh2.hp === sh.hp && sh2.wg < sh.wg && sh2.wg > sh.wg - 200, 'ordinary damage wears the shield down (at half rate), not its health (' + Math.round(sh.wg - sh2.wg) + ')');
      await p.eval("(() => { const b = G.bosses.active; b.duelSt.wg = 1; G.combat.damageEnemy(b.main, 50, { src: 'bullet', noBuffs: true, silent: true }); G.combat.damageEnemy(b.main, 50, { src: 'bullet', noBuffs: true, silent: true }); return 1; })()");
      check(await p.eval(`G.bosses.active.hp < ${sh.hp}`), 'once it is gone, health falls again');
      await p.eval('G.bosses.clear(); 1');
    }
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 600));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nDUEL TEST FAILED (${fails.length})` : '\nDUEL TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
