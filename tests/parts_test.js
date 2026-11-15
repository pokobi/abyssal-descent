'use strict';
// Weapon parts: one part per rarity (no kind of weapon), the drops, the separate count (no cell in the bag), the workbenches (free in the
// transmutation hall, paid in the shop: rarity -> kind -> weapon), the raising, the pawn, the cauldron, saves (old kind x rarity parts),
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
    await p.booted();
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await p.running();
    await sleep(600);
    const setParts = (o) => p.eval(`(() => { G.player.parts = ${JSON.stringify(o)}; G.Inv.changed(G.player.bag); return 1; })()`);
    const count = (r) => p.eval(`G.Parts.count('${r}')`);
    // ---- the parts: one per rarity; the kinds the bench can make
    const ids = await p.eval("JSON.stringify(G.PARTS.map((d) => d.id))");
    check(ids === JSON.stringify(['pt_common', 'pt_uncommon', 'pt_rare', 'pt_epic', 'pt_legendary']), 'one part per rarity, no ミシック ' + ids);
    check(await p.eval("G.PARTS.every((d) => /^武器の部品（/.test(d.name) && d.icon === G.Parts.ICON && !d.fam)"), 'each is called 武器の部品 with its rarity, one icon, no kind of weapon');
    const fams = await p.eval("JSON.stringify(G.Parts.FAMS.map((f) => f.id))");
    check(JSON.parse(fams).length === 8, 'eight kinds of weapon to choose at the bench ' + fams);
    const cover = await p.eval("(() => { const a = new Set(G.Parts.FAMS.flatMap((f) => f.arch || [])); return Object.keys(G.WEAPON_ARCH).filter((k) => !a.has(k)).join(','); })()");
    check(cover === '', 'every gun archetype belongs to a kind (' + cover + ')');
    check(await p.eval("G.PARTS.every((d) => G.Parts.FAMS.some((f) => G.Parts.famOk(f.id, d.rarity)))"), 'every rarity of part can become some weapon');
    check(await p.eval("G.Parts.R.every((r) => G.Parts.FAMS.every((f) => G.Parts.pool(f.id, r).every((w) => !w.mythic && w.id !== 'starter' && w.id !== 'fists' && w.id !== 'm_basic')))"), 'no mythic / starting weapon is ever made');
    // ---- drops
    const boss = await p.eval("(() => { let n = 0; for (let i = 0; i < 20; i++) n += G.Inv.chestLoot(3).items.filter((o) => o.type === 'part').reduce((s, o) => s + o.n, 0); return n; })()");
    check(boss === 20 * (await p.eval('G.Parts.BOSS')), 'a guardian chest always holds its part (' + boss + ' in 20)');
    const rate = await p.eval("(() => { const e = { def: { name: 'x', hp: 60 }, radius: 0.5, height: 1.6 }; let n = 0; for (let i = 0; i < 8000; i++) if (G.Inv.corpseLoot(e).items.some((o) => o.type === 'part')) n++; return n / 8000; })()");
    check(rate > 0.012 && rate < 0.03, 'a plain corpse holds a part about 2% of the time (' + rate.toFixed(3) + ')');
    const erate = await p.eval("(() => { const e = { def: { name: 'x', hp: 60 }, radius: 0.5, height: 1.6, elite: true }; let n = 0; for (let i = 0; i < 4000; i++) if (G.Inv.corpseLoot(e).items.some((o) => o.type === 'part')) n++; return n / 4000; })()");
    check(erate > 0.06 && erate < 0.1, 'an elite about 8% (' + erate.toFixed(3) + ')');
    const crate = await p.eval("(() => { let n = 0; for (let i = 0; i < 2000; i++) if (G.Inv.chestLoot(0).items.some((o) => o.type === 'part')) n++; return n / 2000; })()");
    check(crate > 0.35 && crate < 0.45, 'a plain chest about 40% (' + crate.toFixed(3) + ')');
    check(await p.eval("(() => { const s = new Set(); for (let i = 0; i < 400; i++) s.add(G.Parts.roll(0).id); return [...s].every((id) => G.PART_BY_ID[id]); })()"), 'what drops is always one of the five parts');
    // ---- the count of their own: no cell, no weight
    await p.eval("G.player.bag.items = []; G.player.parts = {}; G.Inv.changed(G.player.bag); for (let i = 0; i < 4; i++) G.Inv.stow(G.player, G.Inv.make('part', 'pt_common', 1)); G.Inv.put(G.player.bag, G.Inv.make('part', 'pt_rare', 2)); 1");
    check(await p.eval("G.player.bag.items.length === 0 && G.Parts.count('common') === 4 && G.Parts.count('rare') === 2"), 'picked-up parts go to the parts count, not into the bag');
    check(await p.eval("(() => { const P = G.player, w0 = P.stats.weight || 0; G.Inv.stow(P, G.Inv.make('part', 'pt_epic', 9)); P.recalc(); return (P.stats.weight || 0) === w0 && P.bag.items.length === 0 && G.Inv.findSpot(P.bag, G.Inv.make('armor', G.ARMOR[0].id, 1)) !== null; })()"), 'they weigh nothing and leave every cell free');
    check(await p.eval("G.Inv.value(G.Inv.make('part', 'pt_common', 1)) > 0"), 'a part sells for a little');
    // an old kind x rarity part (a corpse saved mid-area, a run saved before the change) reads as its rarity
    check(await p.eval("(() => { const n = G.Parts.count('uncommon'); const it = G.Inv.make('part', 'pt_sg_uncommon', 1); const ok = !!G.Inv.def(it); G.Inv.stow(G.player, it); return ok && G.Parts.count('uncommon') === n + 1; })()"), 'an old kind x rarity part becomes a part of its rarity');
    // ---- out of a corpse: take all, shift + click, a drag onto the bag
    await setParts({});
    const loot = async (how) => {
      await p.eval(`(() => { const IV = G.Inv; G.ui.clearScreen(); G.game.state = 'playing'; const c = IV.container(4, 3, 'test', 'corpse'); window.__c = c; window.__it = IV.make('part', 'pt_rare', 1); IV.put(c, window.__it); G.InvUI.open(c, null); return 1; })()`);
      await sleep(250);
      await p.eval(how);
      await sleep(250);
      const r = await p.eval("JSON.stringify({ inC: window.__c.items.length, bag: G.player.bag.items.filter((o) => o.type === 'part').length, rare: G.Parts.count('rare'), strip: !!document.querySelector('.iv-ptstrip [data-pr=\"rare\"]'), shown: (document.querySelector('.iv-ptstrip [data-pr=\"rare\"] b') || {}).textContent })");
      await p.eval('G.InvUI.close(); 1');
      return JSON.parse(r);
    };
    let r = await loot("document.getElementById('iv-all').click()");
    check(r.inC === 0 && r.bag === 0 && r.rare === 1 && r.strip && r.shown === '1', 'すべて取る: the part leaves the corpse for the parts count, shown in the loot view ' + JSON.stringify(r));
    r = await loot("(() => { const el = document.querySelector(`.iv-it[data-uid=\"${window.__it.uid}\"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, shiftKey: true, pointerId: 1 })); return 1; })()");
    check(r.inC === 0 && r.bag === 0 && r.rare === 2, 'shift + click: the same ' + JSON.stringify(r));
    r = await loot(`(async () => { const el = document.querySelector('.iv-it[data-uid="' + window.__it.uid + '"]'), a = el.getBoundingClientRect(), g = document.querySelector('[data-grid="bag"]').getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: a.left + 8, clientY: a.top + 8, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: g.left + 30, clientY: g.top + 30, pointerId: 1 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: g.left + 30, clientY: g.top + 30, pointerId: 1, button: 0 })); return 1; })()`);
    check(r.inC === 0 && r.bag === 0 && r.rare === 3, 'dragged onto the bag: the same ' + JSON.stringify(r));
    // ---- the inventory's parts row: counts, and throwing parts away (they can be picked up again)
    await setParts({ common: 4, rare: 3 });
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.Inv.ground.length = 0; G.InvUI.open(null); 1"); await sleep(300);
    const row = await p.eval("JSON.stringify([...document.querySelectorAll('.iv-parts .iv-pt')].map((b) => b.dataset.pr + ':' + b.querySelector('b').textContent + (b.classList.contains('ok') ? '!' : '')))");
    check(row === JSON.stringify(['common:4!', 'uncommon:0', 'rare:3!', 'epic:0', 'legendary:0']), 'the parts row shows each rarity, a full set marked ' + row);
    await p.eval("document.querySelector('.iv-parts [data-pr=\"common\"]').click(); 1"); await sleep(150);
    const menu = await p.eval("[...document.querySelectorAll('.iv-menu [data-i]')].map((x) => x.textContent).join(' / ')");
    console.log('      ' + menu);
    await p.eval("[...document.querySelectorAll('.iv-menu [data-i]')].find((x) => /1個捨てる/.test(x.textContent)).click(); 1"); await sleep(200);
    check((await count('common')) === 3 && (await p.eval("G.Inv.ground.filter((g) => g.it.type === 'part').length")) === 1, 'a part can be thrown away from the row (' + menu + ')');
    await p.eval("G.InvUI.close(); G.Inv.pickUp(G.Inv.ground.find((g) => g.it.type === 'part')); 1");
    check((await count('common')) === 4, 'and picked up again into the count');
    // ---- saves: kept across a checkpoint; an old run with parts in the bag loads them by rarity
    check(await p.eval("(() => { const snap = JSON.parse(JSON.stringify(G.game.playerSnap())); G.player.parts = {}; G.game.applyPlayerSnap(snap); return G.Parts.count('common') === 4 && G.Parts.count('rare') === 3; })()"), 'the parts survive a save');
    check(await p.eval(`(() => { const snap = JSON.parse(JSON.stringify(G.game.playerSnap())); delete snap.invGrid.parts; snap.invGrid.bag.push({ t: 'part', id: 'pt_sg_rare', n: 2, x: 0, y: 0, r: 0 }, { t: 'part', id: 'pt_ml_epic', n: 1, x: 1, y: 0, r: 0 }); snap.invGrid.spec.c1.push({ t: 'part', id: 'pt_hg_common', n: 1, x: 3, y: 0, r: 0 });
      G.game.applyPlayerSnap(snap); return G.Parts.count('rare') === 2 && G.Parts.count('epic') === 1 && G.Parts.count('common') === 1 && !G.Inv.pcs(G.player).some((c) => c.items.some((o) => o.type === 'part')); })()`), 'an old save with kind x rarity parts in the bag continues, as parts of the same rarity');
    // ---- the shop bench: paid
    await p.eval("G.game.run.freeArea = -1; G.game.rewardPending = null; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(6, 'shop'); 1");
    await p.until("G.game.stage === 'shop' && !!G.world.benchPos", 20000);
    await sleep(400);
    check(await p.eval('G.world.benchFree === false'), 'the shop has a paid bench');
    const face = async () => p.eval(`(() => { const P = G.player, b = G.world.benchPos; G.ui.clearScreen(); G.game.state = 'playing'; const x = b.x + 0, z = b.z + 2.0; P.pos.set(x, 0.01, z); P.vel.set(0, 0, 0); const eye = new THREE.Vector3(x, P.pos.y + 1.6, z), v = b.clone().sub(eye).normalize(); P.yaw = Math.atan2(-v.x, -v.z); P.pitch = Math.asin(v.y); return 1; })()`);
    const use = async () => { for (let i = 0; i < 30; i++) { await p.eval('G.input.pressed[G.BIND.interact[0]] = true; 1'); await sleep(120); if (await p.eval("!!document.querySelector('.pb-wrap')")) return true; } return false; };
    const click = (sel) => p.eval(`(() => { const b = document.querySelector('${sel.replace(/'/g, "\\'")}'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    const open = async () => { await face(); return use(); };
    await setParts({ common: 4 });
    await p.eval("G.game.run.coins = 5000; G.player.weapons.length = 1; 1");
    check(await open(), 'the bench opens when used');
    const lay = await p.eval("JSON.stringify({ rars: document.querySelectorAll('.pb-r').length, fams: document.querySelectorAll('.pb-f').length, sel: (document.querySelector('.pb-r.sel') || {}).dataset?.r, make: !!(document.querySelector('#pb-make') || {}).disabled, txt: document.querySelector('.pb-wrap').textContent.replace(/\\s+/g, ' ').slice(0, 160) })");
    console.log('      ' + lay);
    { const l = JSON.parse(lay); check(l.rars === 5 && l.fams === 8 && l.sel === 'common' && l.make, 'step 1: five rarities (the one with a set chosen), step 2: eight kinds; nothing is made before a kind is chosen'); }
    check(await click('[data-f="sg"]'), 'a kind can be chosen');
    const side = await p.eval("document.querySelector('.pb-side').textContent.replace(/\\s+/g, ' ')");
    console.log('      ' + side.slice(0, 220));
    check(/組み立てる/.test(side) && /繰り上げ/.test(side) && new RegExp('部品×3・' + (await p.eval('G.game.price(G.Parts.MAKE_COST.common)'))).test(side) && /出る武器/.test(side), 'the chosen rarity and kind: making, raising, the price, the weapons it can become');
    const coins0 = await p.eval('G.game.run.coins');
    check(await click('#pb-make'), 'making can be started');
    await sleep(200);
    const wopts = await p.eval("document.querySelectorAll('.pb-cand').length"), poolN = await p.eval("G.Parts.pool('sg', 'common').length");
    check(wopts === poolN && poolN > 0, 'step 3: the weapons of that kind and rarity to choose from (' + wopts + ' of ' + poolN + ')');
    const nw0 = await p.eval('G.player.weapons.length');
    await click('.pb-cand'); await sleep(300);
    const got = await p.eval("JSON.stringify({ n: G.player.weapons.length, arch: G.player.weapons[G.player.weapons.length - 1].def.arch, rar: G.player.weapons[G.player.weapons.length - 1].def.rarity, parts: G.Parts.count('common'), coins: G.game.run.coins })");
    console.log('      ' + got);
    const g = JSON.parse(got);
    check(g.n === nw0 + 1 && /shotgun/.test(g.arch) && g.rar === 'common' && g.parts === 1, 'a common shotgun is made from three common parts, one part is left');
    check(coins0 - g.coins === (await p.eval('G.game.price(G.Parts.MAKE_COST.common)')), 'and the price is paid (' + (coins0 - g.coins) + ')');
    check(await p.eval("!!document.querySelector('.pb-wrap')"), 'the bench stays open for the next one');
    // the same parts, another kind: a melee weapon
    await setParts({ common: 3 });
    await open(); await click('[data-r="common"]'); await click('[data-f="ml"]'); await click('#pb-make'); await sleep(150);
    const m0 = await p.eval('G.player.melee.id'); await click('.pb-cand'); await sleep(250);
    check(await p.eval(`G.player.melee.id !== '${m0}' && G.player.melee.def.rarity === 'common' && G.Parts.count('common') === 0`), 'the same three parts can just as well become a melee weapon');
    // raising, paid
    await setParts({ common: 3 });
    await open(); await click('[data-r="common"]');
    const c1 = await p.eval('G.game.run.coins');
    await click('#pb-up'); await sleep(300);
    check(await p.eval("G.Parts.count('common') === 0 && G.Parts.count('uncommon') === 1"), 'three commons raise into one uncommon');
    check(c1 - (await p.eval('G.game.run.coins')) === (await p.eval('G.game.price(G.Parts.UP_COST.uncommon)')), 'and that is paid for too');
    // too poor: refused
    await setParts({ rare: 3 }); await p.eval('G.game.run.coins = 0; 1');
    await open(); await click('[data-r="rare"]'); await click('[data-f="ar"]');
    check(!(await click('#pb-make')) && (await count('rare')) === 3, 'with no coins the shop bench makes nothing');
    // a kind with no weapon of the rarity cannot be chosen
    const gap = await p.eval("(() => { for (const r of G.Parts.R) for (const f of G.Parts.FAMS) if (!G.Parts.famOk(f.id, r)) return r + ':' + f.id; return ''; })()");
    if (gap) { const [gr, gf] = gap.split(':'); await setParts({ [gr]: 3 }); await open(); await click(`[data-r="${gr}"]`); check(!(await click(`[data-f="${gf}"]`)) && (await p.eval(`!!document.querySelector('.pb-f.none') && !G.Parts.make('${gr}', '${gf}', true)`)), 'a kind with no weapon of that rarity cannot be chosen (' + gap + ')'); }
    else console.log('      (every kind has a weapon of every rarity)');
    // every weapon of the kind and rarity is offered, the same each time: backing out and asking again cannot re-roll them
    check(await p.eval(`(() => { G.game.run.coins = 99999; const P = G.Parts; let ok = true;
      for (const f of P.FAMS) for (const r of P.R) { if (!P.famOk(f.id, r)) continue;
        G.player.parts = { [r]: 3 }; const a = P.make(r, f.id, true, null), b = P.make(r, f.id, true, null), pool = P.pool(f.id, r);
        if (!a || a.cands.length !== pool.length || a.cands.some((w) => !pool.includes(w)) || a.cands.map((w) => w.id).join() !== b.cands.map((w) => w.id).join()) ok = false; }
      return ok; })()`), 'the bench offers every weapon of the kind and rarity, the same list each time (no re-rolling by backing out)');
    // ---- the transmutation hall: free
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.game.transitioning = false; G.game.enterArea(4, 'alchemy'); 1");
    await p.until("G.game.stage === 'alchemy' && !!G.world.benchPos", 20000).catch(() => {});
    const st = await p.eval("G.game.stage + ' ' + !!(G.world && G.world.benchPos) + ' ' + (G.world && G.world.benchFree)");
    check(/true true$/.test(st), 'the transmutation hall has a free bench (' + st + ')');
    await sleep(400);
    await setParts({ rare: 3 }); await p.eval('G.game.run.coins = 0; 1');
    check(await open(), 'it opens');
    await click('[data-r="rare"]'); await click('[data-f="ar"]');
    const fo = await p.eval("document.querySelector('.pb-wrap').textContent.replace(/\\s+/g, ' ')");
    check(/部品×3・無料/.test(fo) && /→ 1・無料/.test(fo) && !/部品×3・\d/.test(fo), 'everything there is free');
    await click('#pb-make'); await sleep(200);
    const nw1 = await p.eval('G.player.weapons.length + G.player.bag.items.filter((o) => o.type === "gun").length');
    await click('.pb-cand'); await sleep(300);
    check((await count('rare')) === 0 && (await p.eval('G.player.weapons.length + G.player.bag.items.filter((o) => o.type === "gun").length')) === nw1 + 1 && (await p.eval('G.game.run.coins')) === 0, 'a rare assault weapon is made there with no coins at all');
    await click('#pb-close');
    // ---- the pawn: one by one and all at once
    await setParts({ common: 4, rare: 2 });
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.game.run.coins = 0; G.Pawn.tab = 'part'; G.Pawn.open(); 1"); await sleep(300);
    const rows = await p.eval("[...document.querySelectorAll('.pw-row')].map((x) => x.textContent.replace(/\\s+/g, ' ')).join(' | ')");
    console.log('      ' + rows.slice(0, 200));
    check((await p.eval("document.querySelectorAll('.pw-row').length")) === 2 && /武器の部品（コモン） ×4/.test(rows), 'the pawn lists the parts, one row per rarity');
    await p.eval("document.querySelector('.pw-row [data-s]').click(); 1"); await sleep(300);
    check((await count('common')) === 3 && (await p.eval('G.game.run.coins')) === (await p.eval("G.Inv.value(G.Inv.make('part', 'pt_common', 1))")), 'one part sells');
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; G.Pawn.tab = 'part'; G.Pawn.open(); 1"); await sleep(300);
    const bl = await p.eval("(document.getElementById('pw-bulk-btn') || {}).textContent || ''");
    console.log('      ' + bl);
    check(/部品を一括売却（5点/.test(bl), 'the pawn has a bulk sale for weapon parts');
    await p.eval("document.getElementById('pw-bulk-btn').click(); 1"); await sleep(300);
    await p.eval("[...document.querySelectorAll('#screens .choice')].find((e) => /すべて売る/.test(e.textContent)).click(); 1"); await sleep(300);
    check(G_total(await p.eval('JSON.stringify(G.player.parts)')) === 0 && (await p.eval('G.game.run.coins')) > 0, 'and it sells them all');
    await p.eval("G.ui.clearScreen(); G.game.state = 'playing'; 1");
    // ---- shift + click out of a container (armour)
    const shift = async (setup) => {
      await p.eval(`(() => { const IV = G.Inv, P = G.player; ${setup}; const c = IV.container(6, 4, 'test', 'corpse'); window.__c = c; window.__it = IV.makeArmor(window.__aid); IV.put(c, window.__it); G.InvUI.open(c, null); return 1; })()`);
      await sleep(250);
      await p.eval("(() => { const el = document.querySelector(`.iv-it[data-uid=\"${window.__it.uid}\"]`); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, shiftKey: true, pointerId: 1 })); return 1; })()");
      await sleep(200);
      const q = await p.eval("JSON.stringify({ worn: !!Object.values(G.player.equip).includes(window.__it), inBag: G.player.bag.items.includes(window.__it), inC: window.__c.items.includes(window.__it), old: window.__old ? Object.values(G.player.equip).includes(window.__old) : null })");
      await p.eval('G.InvUI.close(); 1');
      return JSON.parse(q);
    };
    r = await shift("const a = G.ARMOR.find((x) => x.slot === 'head'); window.__aid = a.id; P.equip.head = null; P.bag.items = []; window.__old = null");
    check(r.worn && !r.inC, 'shift + click: armour for a bare part goes on (' + JSON.stringify(r) + ')');
    r = await shift("const a = G.ARMOR.find((x) => x.slot === 'head'); window.__aid = a.id; window.__old = IV.makeArmor(a.id, null, true); window.__old.dur = 1; P.equip.head = window.__old; P.bag.items = []");
    check(!r.worn && r.inBag && r.old === true, 'shift + click: with the part already covered it goes into the bag and what is worn stays (' + JSON.stringify(r) + ')');
    // ---- the transmutation cauldron: two parts of a rarity -> one of the next; a legendary part is not offered
    await setParts({ common: 2, legendary: 2 });
    check(await p.eval(`(async () => { G.ui.clearScreen && G.ui.clearScreen(); G.game.state = 'playing';
      G.Areas.useAlchemy(); await new Promise((r) => setTimeout(r, 200));
      const tab = !!document.querySelector('.pw-tab[data-tab="part"]');
      const its = [...document.querySelectorAll('.alch-item')].filter((b) => /^prt:/.test(b.dataset.uid)), legend = its.some((b) => /^prt:legendary/.test(b.dataset.uid));
      its.forEach((b) => b.click()); await new Promise((r) => setTimeout(r, 100));
      document.getElementById('alch-go').click(); await new Promise((r) => setTimeout(r, 300));
      const names = [...document.querySelectorAll('.card .c-name')].map((x) => x.textContent);
      const first = document.querySelector('.card'); first && first.click(); await new Promise((r) => setTimeout(r, 900));
      const out = JSON.stringify({ tab, n: its.length, legend, names, parts: G.player.parts }); console.log(out); return out; })()`).then((x) => { console.log('      ' + x); const o = JSON.parse(x); return o.tab && o.n === 2 && !o.legend && o.names.length === 1 && o.parts.common === 0 && o.parts.uncommon === 1; }), 'the cauldron makes one part a rarity up from two (a legendary part is not offered)');
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nPARTS TEST FAILED (${fails.length})` : '\nPARTS TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
function G_total(json) { const o = JSON.parse(json || '{}'); return Object.values(o).reduce((s, v) => s + (v || 0), 0); }
