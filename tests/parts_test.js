'use strict';
// Weapon parts: the kinds, the drops, the workbenches (free in the transmutation hall, paid in the shop), the making and the raising,
// and shift + click out of a loot container (fills an empty slot, never swaps out what is worn).
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
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until("!!G.game.run && !!G.world", 30000);
    await sleep(600);
    // ---- the kinds
    const fams = await p.eval("JSON.stringify(G.Parts.FAMS.map((f) => f.id))");
    check(JSON.parse(fams).length === 8, 'eight kinds of part ' + fams);
    const cover = await p.eval("(() => { const a = new Set(G.Parts.FAMS.flatMap((f) => f.arch || [])); return Object.keys(G.WEAPON_ARCH).filter((k) => !a.has(k)).join(','); })()");
    check(cover === '', 'every gun archetype belongs to a kind (' + cover + ')');
    const empty = await p.eval("G.PARTS.filter((d) => !G.Parts.pool(d.fam, d.rarity).length).length");
    check(empty === 0 && (await p.eval('G.PARTS.length')) > 20, 'every part can become a weapon (' + (await p.eval('G.PARTS.length')) + ' parts)');
    check(await p.eval("G.PARTS.every((d) => G.Parts.pool(d.fam, d.rarity).every((w) => !w.mythic && w.id !== 'starter' && w.id !== 'fists' && w.id !== 'm_basic'))"), 'no mythic / starting weapon is ever made');
    // ---- drops
    const boss = await p.eval("(() => { let n = 0; for (let i = 0; i < 20; i++) n += G.Inv.chestLoot(3).items.filter((o) => o.type === 'part').reduce((s, o) => s + o.n, 0); return n; })()");
    check(boss === 40, 'a guardian chest always holds two parts (' + boss + ' in 20)');
    const rate = await p.eval("(() => { const e = { def: { name: 'x', hp: 60 }, radius: 0.5, height: 1.6 }; let n = 0; for (let i = 0; i < 3000; i++) if (G.Inv.corpseLoot(e).items.some((o) => o.type === 'part')) n++; return n / 3000; })()");
    check(rate > 0.06 && rate < 0.1, 'a plain corpse holds a part about 8% of the time (' + rate.toFixed(3) + ')');
    const erate = await p.eval("(() => { const e = { def: { name: 'x', hp: 60 }, radius: 0.5, height: 1.6, elite: true }; let n = 0; for (let i = 0; i < 2000; i++) if (G.Inv.corpseLoot(e).items.some((o) => o.type === 'part')) n++; return n / 2000; })()");
    check(erate > 0.21 && erate < 0.29, 'an elite about 25% (' + erate.toFixed(3) + ')');
    // ---- stacking, value
    await p.eval("G.player.bag.items = []; G.Inv.changed(G.player.bag); for (let i = 0; i < 4; i++) G.Inv.stow(G.player, G.Inv.make('part', 'pt_sg_common', 1)); 1");
    check(await p.eval("G.player.bag.items.filter((o) => o.type === 'part').length === 1 && G.Parts.count('pt_sg_common') === 4"), 'parts stack in one cell');
    check(await p.eval("G.Inv.value(G.Inv.make('part', 'pt_sg_common', 1)) > 0"), 'a part sells for a little');
    // ---- the shop bench: paid
    await p.eval("G.game.run.freeArea = -1; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(6, 'shop'); 1");
    await p.until("G.game.stage === 'shop' && !!G.world.benchPos", 20000);
    await sleep(400);
    check(await p.eval('G.world.benchFree === false'), 'the shop has a paid bench');
    const face = async () => p.eval(`(() => { const P = G.player, b = G.world.benchPos; G.ui.clearScreen(); G.game.state = 'playing'; const x = b.x + 0, z = b.z + 2.0; P.pos.set(x, 0.01, z); P.vel.set(0, 0, 0); const eye = new THREE.Vector3(x, P.pos.y + 1.6, z), v = b.clone().sub(eye).normalize(); P.yaw = Math.atan2(-v.x, -v.z); P.pitch = Math.asin(v.y); return 1; })()`);
    const use = async () => { for (let i = 0; i < 30; i++) { await p.eval('G.input.pressed[G.BIND.interact[0]] = true; 1'); await sleep(120); if (await p.eval("!!document.querySelector('.pb-wrap')")) return true; } return false; };
    const pick = (id) => p.eval(`(() => { const b = document.querySelector('[data-p="${id}"]'); if (!b) return false; b.click(); return true; })()`);
    const click = (sel) => p.eval(`(() => { const b = document.querySelector('${sel}'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    await face();
    check(await use(), 'the bench opens when used');
    const grid = await p.eval("JSON.stringify({ cells: document.querySelectorAll('.pb-c').length, rows: document.querySelectorAll('.pb-rh').length, heads: document.querySelectorAll('.pb-ch').length, txt: document.querySelector('.pb-wrap').textContent.replace(/\s+/g, ' ').slice(0, 200) })");
    console.log('      ' + grid);
    { const g0 = JSON.parse(grid); check(g0.rows === 8 && g0.heads === 5 && g0.cells === 40, 'a table of the eight kinds x five rarities'); }
    await pick('pt_sg_common');
    const side = await p.eval("document.querySelector('.pb-side').textContent.replace(/\s+/g, ' ')");
    console.log('      ' + side.slice(0, 240));
    check(/組み立てる/.test(side) && /繰り上げ/.test(side) && /🪙/.test(side) && /出る武器/.test(side), 'the chosen part: making, raising, the price, the weapons it can become');
    // make a shotgun from three commons
    await p.eval("G.game.run.coins = 5000; G.player.weapons.length = 1; 1");
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    await face(); await use(); await pick('pt_sg_common');
    const coins0 = await p.eval('G.game.run.coins');
    check(await click('#pb-make'), 'making can be started');
    await sleep(200);
    const wopts = await p.eval("document.querySelectorAll('.pb-cand').length");
    const poolN = await p.eval("G.Parts.pool('sg', 'common').length");
    check(wopts === Math.min(3, poolN), 'then up to three weapons to choose from (' + wopts + ' of ' + poolN + ')');
    const nw0 = await p.eval('G.player.weapons.length');
    await click('.pb-cand');
    await sleep(300);
    const got = await p.eval("JSON.stringify({ n: G.player.weapons.length, arch: G.player.weapons[G.player.weapons.length - 1].def.arch, parts: G.Parts.count('pt_sg_common'), coins: G.game.run.coins })");
    console.log('      ' + got);
    const g = JSON.parse(got);
    check(g.n === nw0 + 1 && /shotgun/.test(g.arch) && g.parts === 1, 'a shotgun is made from three shotgun parts, one part is left');
    check(coins0 - g.coins === (await p.eval("G.game.price(G.Parts.MAKE_COST.common)")), 'and the price is paid (' + (coins0 - g.coins) + ')');
    check(await p.eval("!!document.querySelector('.pb-wrap')"), 'the bench stays open for the next one');
    // raising, paid
    await p.eval("G.Inv.stow(G.player, G.Inv.make('part', 'pt_sg_common', 2)); G.ui.clearScreen(); G.game.state = 'playing'; 1");
    await face(); await use(); await pick('pt_sg_common');
    const c1 = await p.eval('G.game.run.coins');
    await click('#pb-up');
    await sleep(300);
    check(await p.eval("G.Parts.count('pt_sg_common') === 0 && G.Parts.count('pt_sg_uncommon') === 1"), 'three commons raise into one uncommon');
    check(c1 - (await p.eval('G.game.run.coins')) === (await p.eval("G.game.price(G.Parts.UP_COST.uncommon)")), 'and that is paid for too');
    // too poor: refused
    await p.eval("G.Inv.stow(G.player, G.Inv.make('part', 'pt_ar_rare', 3)); G.game.run.coins = 0; G.ui.clearScreen(); G.game.state = 'playing'; 1");
    await face(); await use(); await pick('pt_ar_rare');
    check(!(await click('#pb-make')) && (await p.eval("G.Parts.count('pt_ar_rare') === 3")), 'with no coins the shop bench makes nothing');
    // ---- the transmutation hall: free
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.game.transitioning = false; G.game.enterArea(4, 'alchemy'); 1");
    await p.until("G.game.stage === 'alchemy' && !!G.world.benchPos", 20000).catch(() => {});
    const st = await p.eval("G.game.stage + ' ' + !!(G.world && G.world.benchPos) + ' ' + (G.world && G.world.benchFree)");
    check(/true true$/.test(st), 'the transmutation hall has a free bench (' + st + ')');
    await sleep(400);
    await p.eval("G.game.run.coins = 0; G.ui.clearScreen(); G.game.state = 'playing'; 1");
    await face();
    check(await use(), 'it opens');
    await pick('pt_ar_rare');
    const fo = await p.eval("document.querySelector('.pb-wrap').textContent.replace(/\s+/g, ' ')");
    check(/無料/.test(fo) && !/\d🪙/.test(fo.replace(/🪙 *\d+/, '')), 'everything there is free');
    await click('#pb-make'); await sleep(200);
    const nw1 = await p.eval('G.player.weapons.length + G.player.bag.items.filter((o) => o.type === "gun").length');
    await click('.pb-cand');
    await sleep(300);
    check(await p.eval("G.Parts.count('pt_ar_rare') === 0") && (await p.eval('G.player.weapons.length + G.player.bag.items.filter((o) => o.type === "gun").length')) === nw1 + 1 && (await p.eval('G.game.run.coins')) === 0, 'a rare assault weapon is made there with no coins at all');
    await click('#pb-close');
    // ---- the pawn: all the parts at once
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.player.bag.items = G.player.bag.items.filter((o) => o.type !== 'part'); G.Inv.stow(G.player, G.Inv.make('part', 'pt_sg_common', 4)); G.Inv.stow(G.player, G.Inv.make('part', 'pt_ml_rare', 2)); G.game.run.coins = 0; G.Pawn.tab = 'part'; G.Pawn.open(); 1");
    await sleep(300);
    const bl = await p.eval("(document.getElementById('pw-bulk-btn') || {}).textContent || ''");
    console.log('      ' + bl);
    check(/部品を一括売却（6点/.test(bl), 'the pawn has a bulk sale for weapon parts');
    await p.eval("document.getElementById('pw-bulk-btn').click(); 1"); await sleep(300);
    await p.eval("[...document.querySelectorAll('#screens .choice')].find((e) => /すべて売る/.test(e.textContent)).click(); 1"); await sleep(300);
    check((await p.eval("G.player.bag.items.filter((o) => o.type === 'part').length")) === 0 && (await p.eval('G.game.run.coins')) > 0, 'and it sells them all');
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    // ---- shift + click out of a container
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    const shift = async (setup) => {
      await p.eval(`(() => { const IV = G.Inv, P = G.player; ${setup}; const c = IV.container(6, 4, 'test', 'corpse'); window.__c = c; window.__it = IV.makeArmor(window.__aid); IV.put(c, window.__it); G.InvUI.open(c, null); return 1; })()`);
      await sleep(250);
      await p.eval("(() => { const el = document.querySelector(`.iv-it[data-uid=\"${window.__it.uid}\"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, shiftKey: true, pointerId: 1 })); return 1; })()");
      await sleep(200);
      const r = await p.eval("JSON.stringify({ worn: !!Object.values(G.player.equip).includes(window.__it), inBag: G.player.bag.items.includes(window.__it), inC: window.__c.items.includes(window.__it), old: window.__old ? Object.values(G.player.equip).includes(window.__old) : null })");
      await p.eval('G.InvUI.close(); 1');
      return JSON.parse(r);
    };
    // the slot is bare: it goes on
    let r = await shift("const a = G.ARMOR.find((x) => x.slot === 'head'); window.__aid = a.id; P.equip.head = null; P.bag.items = []; window.__old = null");
    check(r.worn && !r.inC, 'shift + click: armour for a bare part goes on (' + JSON.stringify(r) + ')');
    // the slot is taken: into the bag, nothing swapped (even the same piece with more durability)
    r = await shift("const a = G.ARMOR.find((x) => x.slot === 'head'); window.__aid = a.id; window.__old = IV.makeArmor(a.id, null, true); window.__old.dur = 1; P.equip.head = window.__old; P.bag.items = []");
    check(!r.worn && r.inBag && r.old === true, 'shift + click: with the part already covered it goes into the bag and what is worn stays (' + JSON.stringify(r) + ')');
    // ---- the transmutation cauldron takes weapon parts: two of a rarity -> one of the next; the kinds of both are certain, the rest another kind
    check(await p.eval(`(async () => { const P = G.player, IV = G.Inv; G.ui.clearScreen && G.ui.clearScreen(); G.game.state = 'playing'; for (const c of IV.pcs(P)) c.items = c.items.filter((o) => o.type !== 'part'); IV.give(P, 'part', 'pt_smg_common', 1); IV.give(P, 'part', 'pt_sr_common', 1);
      G.Areas.useAlchemy(); await new Promise((r) => setTimeout(r, 200));
      const tab = !!document.querySelector('.pw-tab[data-tab="part"]');
      const its = [...document.querySelectorAll('.alch-item')].filter((b) => /^prt:/.test(b.dataset.uid)); its.forEach((b) => b.click()); await new Promise((r) => setTimeout(r, 100));
      document.getElementById('alch-go').click(); await new Promise((r) => setTimeout(r, 300));
      const names = [...document.querySelectorAll('.card .c-name')].map((x) => x.textContent);
      const first = document.querySelector('.card'); first && first.click(); await new Promise((r) => setTimeout(r, 900));
      const parts = IV.pcs(P).flatMap((c) => c.items).filter((o) => o.type === 'part').map((o) => o.id);
      return JSON.stringify({ tab, n: its.length, names, parts }); })()`).then((r) => { console.log('      ' + r); const o = JSON.parse(r); return o.tab && o.n === 2 && o.names.length === 3 && o.names.some((x) => /SMG/.test(x)) && o.names.some((x) => /狙撃/.test(x)) && o.parts.length === 1 && /_uncommon$/.test(o.parts[0]) && /pt_(smg|sr)_/.test(o.parts[0]); }), 'the cauldron makes one part a rarity up from two, both kinds among the three');
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nPARTS TEST FAILED (${fails.length})` : '\nPARTS TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
