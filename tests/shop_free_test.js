'use strict';
// The perk that makes one ware free: the weapon upgrade and the skill tome (which choose what to raise only when bought) must stay free all the way, and a free one is never
// picked when there is nothing for it to raise.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9989;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until("!!G.game.run && !!G.world", 30000);
    await sleep(600);
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.addBuff('e_free'); G.player.skills[1] = G.abilities.makeSlot('dash'); 1");
    const enter = async (area) => {
      await p.eval(`G.game.run.freeArea = -1; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(${area}, 'shop'); 1`);
      await p.until("G.game.stage === 'shop' && !!G.game.shop && G.game.shop.offers.length > 10", 20000);
      await sleep(400);
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    };
    // buy a ware by facing it and pressing the interact key, then answer its question with the first choice
    const buy = async (kind, free, coins) => {
      await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.game.search = null; 1");
      await p.eval(`(() => { const S = G.game.shop, o = S.offers.find((x) => x.kind === '${kind}'), P = G.player; o.sold = false; if (o.mesh) o.mesh.visible = true; o.free = ${free}; o.price = ${free ? 0 : 'G.game.offerPrice(o.kind, o.obj)'}; G.game.run.coins = ${coins};
        const s = o.slot, x = o.pos.x + s.nx * 1.6, z = o.pos.z + s.nz * 1.6; P.pos.set(x, s.y - 1.15 + 0.01, z); P.vel.set(0, 0, 0);
        const eye = new THREE.Vector3(x, P.pos.y + 1.6, z), v = o.pos.clone().sub(eye).normalize(); P.yaw = Math.atan2(-v.x, -v.z); P.pitch = Math.asin(v.y); window.__offer = o; })(); 1`);
      for (let i = 0; i < 40; i++) {
        await p.eval(`G.input.pressed[G.BIND.interact[0]] = true; 1`);
        await sleep(120);
        if (await p.eval("!!document.querySelector('#screens .choice')")) break;
      }
      const asked = await p.eval("document.querySelectorAll('#screens .choice').length");
      if (!asked) return { asked: 0 };
      const label = await p.eval("document.querySelector('#screens .choice').textContent.replace(/\\s+/g, ' ').slice(0, 90)");
      await p.eval("document.querySelector('#screens .choice').click(); 1");
      await sleep(400);
      return { asked, label, sold: await p.eval('window.__offer.sold'), coins: await p.eval('G.game.run.coins') };
    };
    await enter(6);
    // the weapon upgrade, free, with too little money for it
    let lv0 = await p.eval('G.player.weapon.lv || 0');
    let r = await buy('forge', true, 5);
    console.log('     ', JSON.stringify(r));
    check(r.asked > 0 && r.sold === true && r.coins === 5 && (await p.eval('G.player.weapon.lv || 0')) === lv0 + 1, 'a free weapon upgrade costs nothing, even with 5 coins in the purse');
    check(/無料/.test(r.label || ''), 'and its choice says so');
    // the skill tome, free, with too little money for it
    const sk0 = await p.eval('G.player.skills[1].lv || 0');
    r = await buy('tome', true, 5);
    console.log('     ', JSON.stringify(r));
    check(r.asked > 0 && r.sold === true && r.coins === 5, 'a free skill tome costs nothing, even with 5 coins in the purse (' + JSON.stringify(r) + ')');
    check(/無料/.test(r.label || ''), 'and its choice says so');
    const raised = await p.eval('(G.player.skills.filter((s) => s).reduce((a, s) => a + (s.lv || 0), 0)) + (G.player.pileTome || 0)');
    check(raised > sk0, 'and a skill went up a level');
    // ... and with plenty of coins nothing is taken either
    await enter(8);
    r = await buy('tome', true, 99999);
    check(r.asked > 0 && r.sold === true && r.coins === 99999, 'a free skill tome takes nothing from a full purse either (' + (99999 - (r.coins || 0)) + ' taken)');
    // not free: the price is paid
    await enter(7);
    r = await buy('tome', false, 99999);
    check(r.asked > 0 && r.sold === true && r.coins < 99999, 'a tome that is not free is still paid for (' + (99999 - r.coins) + ' coins)');
    // the free ware is never one that has nothing to raise
    await p.eval("G.player.skills.forEach((s, i) => { if (s) s.lv = G.abilities.MAXLV; }); G.player.pileTome = 99; 1");
    const noTargets = await p.eval('G.game.tomeTargets().length');
    let bad = 0;
    for (let i = 0; i < 12; i++) { await p.eval(`G.game.run.freeArea = -1; G.game.shop.rerolls = ${i + 1}; G.game.fillShop(); 1`); if (await p.eval("G.game.shop.offers.some((o) => o.free && o.kind === 'tome')")) bad++; }
    console.log('     tome targets left: ' + noTargets + ', free tomes picked: ' + bad);
    if (noTargets === 0) check(bad === 0, 'a tome with nothing to raise is never the free one');
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nSHOP FREE TEST FAILED (${fails.length})` : '\nSHOP FREE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
