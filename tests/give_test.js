'use strict';
// A weapon handed over for free (the peddler's mystery box, an auction won) must never push out a weapon you hold:
// with every gun slot taken it goes into the bag, with the bag full it is set down at your feet. Nothing is traded in behind your back.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9991;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(600);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    // every gun slot taken (two guns of their own, forged, with a part on) and a melee weapon in hand
    const setup = (bagFull) => p.eval(`(() => {
      const P = G.player, IV = G.Inv, W = G.WEAPONS.filter((x) => !x.mythic && x.id !== 'starter');
      P.weapons = []; for (let i = 0; i < P.stats.weaponSlots; i++) { const w = G.weapons.make(W[i].id); w.lv = 3; P.weapons.push(w); }
      P.wIdx = 0; P.wOrder = null; G.weapons.order(); G.weapons.equip(false);
      P.melee = G.weapons.makeMelee(G.MELEE.find((x) => !x.mythic && x.id !== (G.BARE_MELEE || 'fists')).id); P.melee.lv = 2;
      P.bag.items = []; IV.changed(P.bag); IV.ground.length = 0;
      if (${bagFull}) while (IV.findSpot(P.bag, IV.make('valuable', G.VALUABLES[0].id, 1))) IV.put(P.bag, IV.make('valuable', G.VALUABLES[0].id, 1));
      G.game.run.coins = 5000;
      window.__before = { guns: P.weapons.map((w) => w.id + '+' + w.lv), melee: P.melee.id, coins: G.game.run.coins };
      return P.weapons.length;
    })()`);
    const state = () => p.eval(`(() => { const P = G.player, IV = G.Inv; return { guns: P.weapons.map((w) => w.id + '+' + w.lv), melee: P.melee.id, coins: G.game.run.coins,
      bag: P.bag.items.filter((o) => IV.isArm(o)).map((o) => o.type + ':' + o.id), ground: IV.ground.filter((g) => IV.isArm(g.it)).map((g) => g.it.type + ':' + g.it.id), before: window.__before }; })()`);
    const kept = (s) => JSON.stringify(s.guns) === JSON.stringify(s.before.guns) && s.melee === s.before.melee;

    // 1. the peddler's mystery box landing on a weapon, gun slots full
    await setup(false);
    const got = await p.eval(`(() => {
      const ev = G.Areas.EVENTS.find((e) => e.id === 'peddler'), r0 = Math.random; let n = 0;
      Math.random = () => (n++ === 0 ? 0.05 : 0.5); // the box roll lands on "weapon" (then an ordinary rare)
      try { ev.opts()[0].run(); } finally { Math.random = r0; }
      return 1; })()`);
    let s = await state();
    check(got && kept(s), `mystery box with every gun slot taken: the guns held stay (${s.guns.join(', ')})`);
    check(s.bag.length === 1 && s.bag[0].startsWith('gun:'), `... and the new gun goes into the bag (${s.bag.join(', ') || 'none'})`);
    check(s.coins < s.before.coins, `... and nothing was traded in: only the box was paid for (coins ${s.before.coins} -> ${s.coins})`);

    // 2. the same with the bag full: set down at your feet
    await setup(true);
    await p.eval("G.game.giveWeapon(G.WEAPONS.find((x) => x.rarity === 'epic' && !x.mythic).id); 1");
    s = await state();
    check(kept(s) && s.bag.length === 0 && s.ground.length === 1, `bag full too: the guns held stay and the new one lies at your feet (${s.ground.join(', ') || 'nothing on the ground'})`);

    // 3. an auction won: a gun, and a melee weapon while one is in hand
    await setup(false);
    await p.eval("G.Rooms2.grant({ kind: 'weapon', obj: G.WEAPONS.find((x) => x.rarity === 'legendary' && !x.mythic) }); 1");
    await p.eval("G.Rooms2.grant({ kind: 'melee', obj: G.MELEE.find((x) => x.id !== G.player.melee.id && x.id !== (G.BARE_MELEE || 'fists') && !x.mythic) }); 1");
    s = await state();
    check(kept(s) && s.coins === s.before.coins, `auction: the gun and the melee weapon in hand stay, no trade-in (coins ${s.before.coins} -> ${s.coins})`);
    check(s.bag.length === 2 && s.bag.some((x) => x.startsWith('gun:')) && s.bag.some((x) => x.startsWith('melee:')), `... and both new weapons are in the bag (${s.bag.join(', ')})`);

    // 4. with a free slot / bare hands the new weapon is taken in hand as before
    await p.eval("(() => { const P = G.player; P.weapons.length = 1; P.wIdx = 0; P.wOrder = null; G.weapons.order(); P.melee = G.weapons.makeMelee(G.BARE_MELEE || 'fists'); P.bag.items = []; })(); 1");
    await p.eval("G.game.giveWeapon(G.WEAPONS.find((x) => x.rarity === 'rare' && !x.mythic).id); G.Rooms2.grant({ kind: 'melee', obj: G.MELEE.find((x) => x.id !== (G.BARE_MELEE || 'fists') && !x.mythic) }); 1");
    s = await state();
    check(s.guns.length === 2 && s.melee !== (await p.eval("G.BARE_MELEE || 'fists'")) && s.bag.length === 0, `a free gun slot / bare hands: taken in hand (${s.guns.join(', ')} / ${s.melee})`);

    check(!p.errs.length, 'no errors' + (p.errs.length ? ': ' + p.errs.slice(-2).join(' | ').slice(0, 300) : ''));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nGIVE TEST FAILED (${fails.length})` : '\nGIVE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
