'use strict';
// Automatic armour choice (inventory.js IV.autoWear / IV.score / IV.spareFor / locks):
// a piece picked up goes on when its part is bare or when it scores 10% or more above the worn one (the worn one goes to the bag, or to the
// floor when the bag is full); a locked part is never changed; a broken piece is replaced by the best spare in the bag; 「まとめて取る」
// does the same; the lock survives a save and a load.
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
    await p.booted();
    await p.eval("G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await p.running();
    await sleep(600);
    await p.eval(`G.ui.clearScreen(); G.game.state = 'playing';
      window.__toasts = []; const t0 = G.ui.toastSmall; G.ui.toastSmall = (m) => { window.__toasts.push(m); return t0.call(G.ui, m); };
      // a clean player: nothing worn, nothing in the bag, no locks; pieces made by hand (id, enchantments, durability)
      window.__reset = (full) => { const P = G.player, IV = G.Inv; for (const k in P.equip) P.equip[k] = null; P.armLock = {}; P.bag.items = []; IV.ground.length = 0; IV.noAuto = false;
        if (full) while (IV.findSpot(P.bag, IV.make('valuable', G.VALUABLES[0].id, 1))) IV.put(P.bag, IV.make('valuable', G.VALUABLES[0].id, 1));
        IV.changed(P.bag); P.recalc(); window.__toasts.length = 0; };
      window.__mk = (id, ench, dur) => G.Inv.make('armor', id, 1, Object.assign({ ench: ench || [] }, dur !== undefined ? { dur } : {}));
      window.__st = () => { const P = G.player, IV = G.Inv; return { equip: Object.fromEntries(Object.entries(P.equip).map(([k, v]) => [k, v ? v.id + '#' + v.uid : null])),
        bag: P.bag.items.filter((o) => o.type === 'armor').map((o) => o.id + '#' + o.uid), ground: IV.ground.filter((g) => g.it.type === 'armor').map((g) => g.it.id + '#' + g.it.uid), toasts: window.__toasts.slice() }; };
      1`);

    // the scores behind the choices, printed for the report
    const sc = await p.eval(`(() => { const IV = G.Inv, m = window.__mk; return {
      leatherHead: IV.score(m('ar_head_leather_common')), chainHead: IV.score(m('ar_head_chain_common')), plateChest: IV.score(m('ar_chest_plate_common')), clothChest: IV.score(m('ar_chest_cloth_common')),
      critHead: IV.score(m('ar_head_leather_common', [{ id: 'crit', v: 5 }])), halfDur: IV.score(m('ar_head_chain_common', [], 50)) }; })()`);
    console.log('scores', JSON.stringify(sc));

    // (1) a bare part: the piece goes on
    await p.eval("__reset(); G.Inv.stow(G.player, __mk('ar_head_leather_common')); 1");
    let s = await p.eval('__st()');
    check(s.equip.head && s.equip.head.startsWith('ar_head_leather_common') && s.bag.length === 0, `(1) bare head: the leather cap goes on (${s.equip.head})`);

    // (2) 10% or more better: swapped, the old one in the bag, with a notice of the difference
    s = await p.eval("(() => { G.Inv.stow(G.player, __mk('ar_head_chain_common', [{ id: 'crit', v: 2 }])); return __st(); })()");
    check(s.equip.head && s.equip.head.startsWith('ar_head_chain_common') && s.bag.length === 1 && s.bag[0].startsWith('ar_head_leather_common'), `(2) chain helm (better): put on, the leather cap goes to the bag (${s.equip.head} / bag ${s.bag.join(',')})`);
    const nt = s.toasts.find((t) => t.includes('→')) || '';
    check(/→/.test(nt) && /防御\+\d/.test(nt), `(2) ... the notice names both and the difference: 「${nt}」`);

    // (3) under 10% better / worse: not swapped
    s = await p.eval(`(() => { __reset(); const P = G.player, IV = G.Inv; IV.stow(P, __mk('ar_chest_chain_common'));
      const cur = IV.score(P.equip.chest);
      // the same chest with a small enchantment: a little better, but under 10%
      const a = __mk('ar_chest_chain_common', [{ id: 'coin', v: 1 }]); const ra = IV.score(a) / cur; IV.stow(P, a);
      const b = __mk('ar_chest_leather_common'); const rb = IV.score(b) / cur; IV.stow(P, b);
      const o = __st(); o.ra = ra; o.rb = rb; return o; })()`);
    check(s.equip.chest && s.equip.chest.startsWith('ar_chest_chain_common') && s.bag.length === 2 && s.ra > 1 && s.ra < 1.1 && s.rb < 1, `(3) a little better (x${s.ra.toFixed(3)}) and worse (x${s.rb.toFixed(3)}): both go to the bag, the chain mail stays`);

    // (4) a locked part is not changed (not even a bare one)
    s = await p.eval(`(() => { __reset(); const P = G.player, IV = G.Inv; IV.stow(P, __mk('ar_legs_cloth_common')); IV.setLock(P, 'legs', true); IV.setLock(P, 'feet', true);
      IV.stow(P, __mk('ar_legs_plate_rare')); IV.stow(P, __mk('ar_feet_leather_common')); return __st(); })()`);
    check(s.equip.legs && s.equip.legs.startsWith('ar_legs_cloth_common') && !s.equip.feet && s.bag.length === 2, `(4) locked legs keep the cloth (plate went to the bag), locked bare feet stay bare (${s.equip.legs} / ${s.equip.feet})`);

    // (5) bag full: the piece taken off lies at your feet
    s = await p.eval(`(() => { __reset(true); const P = G.player, IV = G.Inv; IV.stow(P, __mk('ar_hands_cloth_common')); IV.stow(P, __mk('ar_hands_plate_rare')); return __st(); })()`);
    check(s.equip.hands && s.equip.hands.startsWith('ar_hands_plate_rare') && s.ground.length === 1 && s.ground[0].startsWith('ar_hands_cloth_common'), `(5) bag full: plate gauntlets on, the cloth gloves on the floor (${s.ground.join(',')})`);
    check(s.toasts.some((t) => t.includes('足元')), `(5) ... and the notice says so`);

    // (6) a piece breaks: the best spare of that part in the bag goes on (and not on a locked part)
    s = await p.eval(`(() => { __reset(); const P = G.player, IV = G.Inv; IV.stow(P, __mk('ar_feet_chain_common', [], 1)); IV.stow(P, __mk('ar_head_chain_common', [], 1));
      IV.noAuto = true; IV.stow(P, __mk('ar_feet_cloth_common')); IV.stow(P, __mk('ar_feet_leather_common')); IV.stow(P, __mk('ar_head_leather_common')); IV.noAuto = false;
      IV.setLock(P, 'head', true);
      IV.wear(P, P.stats.maxHp * 5); return __st(); })()`);
    check(s.equip.feet && s.equip.feet.startsWith('ar_feet_leather_common') && s.bag.some((x) => x.startsWith('ar_feet_cloth_common')), `(6) boots broke: the better spare (leather) goes on, the cloth stays in the bag (${s.equip.feet})`);
    check(!s.equip.head && s.bag.some((x) => x.startsWith('ar_head_leather_common')), `(6) ... the locked head broke and stays bare (${s.equip.head})`);
    check(s.toasts.some((t) => t.includes('予備')), `(6) ... with a notice`);

    // (7) 「まとめて取る」 from a chest: the same rules
    s = await p.eval(`(() => { __reset(); const P = G.player, IV = G.Inv; IV.stow(P, __mk('ar_chest_leather_common'));
      const c = IV.container(5, 4, 'test', 'chest'); IV.put(c, __mk('ar_chest_plate_rare')); IV.put(c, __mk('ar_head_cloth_common')); IV.put(c, __mk('ar_legs_cloth_common', [], 5)); IV.put(c, IV.make('valuable', G.VALUABLES[0].id, 1));
      G.InvUI.open(c); const b = document.querySelector('#iv-all'); window.__hadBtn = !!b; if (b) b.click(); window.__left = c.items.length; G.InvUI.close(); return __st(); })()`);
    const tb = await p.eval('[window.__hadBtn, window.__left]');
    check(tb[0] && tb[1] === 0, `(7) the take-all button was there and emptied the chest (left ${tb[1]})`);
    check(s.equip.chest && s.equip.chest.startsWith('ar_chest_plate_rare') && s.bag.some((x) => x.startsWith('ar_chest_leather_common')) && s.equip.head && s.equip.legs, `(7) take-all: the plate chest replaced the leather (in the bag), the bare head and legs got theirs (${JSON.stringify(s.equip)})`);

    // (8) the lock survives a save and a load (run save / mid-area save both carry GM.playerSnap)
    s = await p.eval(`(() => { __reset(); const P = G.player, IV = G.Inv, GM = G.game; IV.stow(P, __mk('ar_head_cloth_common')); IV.setLock(P, 'head', true); IV.setLock(P, 'hands', true);
      const snap = JSON.parse(JSON.stringify(GM.playerSnap())); IV.setLock(P, 'head', false); IV.setLock(P, 'hands', false);
      GM.applyPlayerSnap(snap); const ms = G.MidSave && G.MidSave.snapshot ? JSON.parse(JSON.stringify(G.MidSave.snapshot())) : null;
      const o = __st(); o.lock = Object.keys(P.armLock).filter((k) => P.armLock[k]).sort(); o.msLock = ms ? ms.player.invGrid.lock.slice().sort() : null; return o; })()`);
    check(JSON.stringify(s.lock) === '["hands","head"]' && s.equip.head, `(8) after a load the locks are back (${s.lock.join(',')}) and the head piece is still on`);
    check(JSON.stringify(s.msLock) === '["hands","head"]', `(8) ... and the mid-area save carries them (${s.msLock})`);

    // the lock menu in the inventory screen
    const menu = await p.eval(`(() => { __reset(); const P = G.player, IV = G.Inv; IV.stow(P, __mk('ar_head_cloth_common')); G.InvUI.open(null);
      const it = document.querySelector('.iv-eq[data-eq="head"] .iv-it'); if (!it) { G.InvUI.close(); return 'no item el'; }
      const r = it.getBoundingClientRect(); it.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true, clientX: r.left + 5, clientY: r.top + 5 }));
      const opt = [...document.querySelectorAll('.iv-menu [data-i]')].find((n) => n.textContent.includes('自動で替えない')); if (!opt) { G.InvUI.close(); return 'no lock option'; }
      opt.click(); const mark = !!document.querySelector('.iv-eq[data-eq="head"] .iv-eqlock'); const locked = IV.locked(P, 'head');
      const e2 = document.querySelector('.iv-eq[data-eq="feet"]'), r2 = e2.getBoundingClientRect(); e2.dispatchEvent(new PointerEvent('pointerdown', { button: 2, bubbles: true, clientX: r2.left + 5, clientY: r2.top + 5 }));
      const opt2 = [...document.querySelectorAll('.iv-menu [data-i]')].find((n) => n.textContent.includes('自動で替えない')); if (opt2) opt2.click();
      G.InvUI.close(); return [mark, locked, IV.locked(P, 'feet')].join(','); })()`);
    check(menu === 'true,true,true', `menu: right click on a worn piece locks it and shows the padlock; a bare slot can be locked too (${menu})`);

    check(!p.errs.length, 'no errors' + (p.errs.length ? ': ' + p.errs.slice(-2).join(' | ').slice(0, 300) : ''));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nARMOR TEST FAILED (${fails.length})` : '\nARMOR TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
