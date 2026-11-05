'use strict';
// The shop: a ミシック is set out on the stall of its own kind (no armour or skill on the weapons island), the last gun can be sold
// (after a warning: you go on with the melee weapon), and a weapon's price skips the per-visit rise and adds +10% per forged level.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9995;
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
    await p.eval("G.game.run.freeArea = -1; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.area = 17; G.game.enterArea(18, 'shop'); 1");
    await p.until("G.game.stage === 'shop' && !!G.game.shop && G.game.shop.offers.length > 10", 20000);
    await sleep(400);

    // 1. where the ミシック lands, over many restocks (each stall's slots: weapons 0-2, skills 4-8, attachments 10-12, armour 16-20, the relic 25)
    const r = await p.eval(`(() => {
      const GM = G.game, S = GM.shop, w = S.w, zone = (i) => (i <= 3 ? 'arms' : i <= 9 ? 'skill' : i <= 12 ? 'attachment' : i <= 15 ? 'item' : i <= 20 ? 'armor' : 'buff');
      const want = (o) => (o.kind === 'weapon' || o.kind === 'melee' ? 'arms' : o.kind === 'ult' ? 'skill' : o.kind === 'relic' ? 'buff' : o.kind);
      const seen = {}, bad = []; let n = 0;
      for (let k = 0; k < 90; k++) {
        S.rerolls = k; GM.fillShop();
        for (const o of S.offers) {
          const myth = o.obj && (o.obj.mythic || o.obj.rarity === 'mythic'); if (!myth) continue;
          n++; const i = w.shopSlots.indexOf(o.slot), z = zone(i); seen[o.kind] = (seen[o.kind] || 0) + 1;
          if (z !== want(o)) bad.push(o.kind + ':' + o.obj.name + '@' + i);
        }
        const arms = S.offers.filter((o) => (o.kind === 'weapon' || o.kind === 'melee') && zone(w.shopSlots.indexOf(o.slot)) === 'arms').length;
        if (arms < 3) bad.push('only ' + arms + ' weapons on the weapons island');
      }
      return { n, seen, bad: bad.slice(0, 6) };
    })()`);
    check(r.n > 10 && !r.bad.length, `every ミシック sits on the stall of its own kind (${r.n} seen: ${JSON.stringify(r.seen)}) ${r.bad.join(', ')}`);

    // 2. weapon prices: no per-visit rise, +10% per forged level
    const pr = await p.eval(`(() => { const GM = G.game; GM.run.shopVisits = 6; const d = G.WEAPONS.find((x) => x.rarity === 'legendary' && !x.mythic), lv = GM.shopLvOf(d);
      const got = GM.offerPrice('weapon', d), area = 1 + 0.03 * Math.max(0, GM.area - 1), disc = Math.max(0.3, 1 - G.player.stats.shopDiscount);
      const want = Math.round(d.price * (1 + 0.1 * lv) * disc * area / 10) * 10, skill = GM.offerPrice('skill', G.SKILLS[0]), skill0 = Math.round(G.SKILLS[0].price * disc * 1.3 * area / 10) * 10;
      return { got, want, lv, skill, skill0 }; })()`);
    check(pr.got === pr.want, `a forged legendary costs base x (1 + 0.1 x ${pr.lv}) x area, with no per-visit rise (${pr.got} / want ${pr.want})`);
    check(pr.skill === pr.skill0, `other wares keep the per-visit rise (${pr.skill} / want ${pr.skill0})`);

    // 3. the last gun can be sold, after a warning; then you fight with the melee weapon
    await p.eval("(() => { const P = G.player; P.weapons.length = 1; P.wIdx = 0; P.wOrder = null; G.weapons.order(); G.weapons.equip(false); G.ui.clearScreen(); G.game.state = 'playing'; G.Pawn.tab = 'all'; G.Pawn.open(); })(); 1");
    await sleep(300);
    const row = await p.eval("(() => { const rows = [...document.querySelectorAll('.pw-row')], i = rows.findIndex((x) => /最後の銃/.test(x.textContent)); const b = i >= 0 && rows[i].querySelector('[data-s]'); if (b) b.click(); return i >= 0 ? (b ? 'clicked' : 'no button') : 'no row'; })()");
    await sleep(300);
    const warn = await p.eval("(document.querySelector('#screens') || document.body).textContent.includes('これが最後の銃です')");
    await p.eval("(() => { const c = [...document.querySelectorAll('#screens .choice')].find((x) => /売る/.test(x.textContent)); if (c) c.click(); })(); 1");
    await sleep(400);
    const after = await p.eval("JSON.stringify({ guns: G.player.weapons.length, melee: !!G.player.meleeMode })");
    check(row === 'clicked' && warn && after === JSON.stringify({ guns: 0, melee: true }), `the last gun sells after a warning and you switch to melee (${row}, warning ${warn}, ${after})`);

    check(!p.errs.length, 'no errors' + (p.errs.length ? ': ' + p.errs.slice(-2).join(' | ').slice(0, 300) : ''));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nSHOP TEST FAILED (${fails.length})` : '\nSHOP TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
