'use strict';
// Elements (js/element.js): leaving an element, every reaction and its order, the gun / boon cool-down, foes born with an element, 属性熟練 and the reaction boons
// as separate factors, resistances, the player's side, the colours of the numbers, the badge on the HP bar, 属性の油, 属性コア, the water skills.
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9993;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(800);
    // a quiet test bench: no foes of the area, crits off, a dummy far from walls
    await p.eval(`(() => {
      for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); }
      G.enemies.list.length = 0;
      G.game.spawnEnemy = G.game.spawnEnemy;
      window.T = {};
      T.def = G.ENEMY_BY_ID.brute_normal;
      T.mk = (dx, dz, o) => { const P = G.player; const e = G.enemies.spawn(T.def, 5, new THREE.Vector3(P.pos.x + (dx || 0), P.pos.y, P.pos.z + (dz || -6)), Object.assign({ noSplit: true }, o || {})); e.maxHp = e.hp = 1e6; e.shield = e.maxShield = 0; e.update = () => {}; e.state = 'chase'; e.centerRef = e.pos.clone(); e.centerRef.y += 1; e.hitW = null; return e; };
      T.clean = () => { for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); } G.enemies.list.length = 0; };
      T.hit = (e, el, amt, extra) => G.combat.damageEnemy(e, amt || 100, Object.assign({ src: 'explosion', el: el === undefined ? null : el, noMarker: true }, extra || {}));
      T.nums = []; const dn = G.fx.dmgNum; G.fx.dmgNum = function (p, v, c) { T.nums.push([String(v), c || '']); return dn.apply(this, arguments); };
      G.player.stats.critChance = 0;
      return 1; })()`);
    // ---- leaving an element
    check(await p.eval("(() => { T.clean(); const e = T.mk(); T.hit(e, 'fire'); return G.Elem.auraOf(e) === 'fire' && Math.abs(G.Elem.auraLeft(e) - 8) < 0.2; })()"), 'a fire hit leaves fire on the foe for 8 s');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); T.hit(e, 'wind'); T.hit(e, 'earth'); return G.Elem.auraOf(e) === null; })()"), 'wind and earth never stay on their own');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); T.hit(e, 'ice'); T.hit(e, 'ice'); return G.Elem.auraOf(e) === 'ice'; })()"), 'the same element again only renews it');
    // ---- amplifying reactions and their order
    const amp = async (a, b) => p.eval(`(() => { T.clean(); const e = T.mk(); const base = T.hit(e, null, 100); T.hit(e, '${a}', 1); const d = T.hit(e, '${b}', 100); return Math.round(d / base * 100) / 100 + ':' + (G.Elem.auraOf(e) || '-'); })()`);
    let r;
    r = await amp('fire', 'water'); check(r === '1.5:-', 'fire, then water: 沸騰 ×1.5 and both are spent (' + r + ')');
    r = await amp('water', 'fire'); check(r === '2:-', 'water, then fire: 沸騰 ×2.0 (' + r + ')');
    r = await amp('fire', 'ice'); check(r === '2:-', 'fire, then ice: 熱融 ×2.0 (' + r + ')');
    r = await amp('ice', 'fire'); check(r === '1.5:-', 'ice, then fire: 熱融 ×1.5 (' + r + ')');
    check(await p.eval("T.nums.some(([v, c]) => v === '沸騰' && /rx-boil/.test(c)) && !T.nums.some(([v]) => /×/.test(v))"), 'the reaction is named over the number, without its factor');
    // ---- the other reactions
    check(await p.eval("(() => { T.clean(); const e = T.mk(); T.hit(e, 'water'); T.hit(e, 'ice'); return e.st.frozen > 2.9 && e.st.frozen <= 3.01; })()"), '水＋氷 = 凍結: an ordinary foe is frozen 3 s');
    check(await p.eval("(() => { T.clean(); const e = T.mk(0, -6, { elite: true }); e.maxHp = e.hp = 1e6; e.shield = e.maxShield = 0; T.hit(e, 'water'); T.hit(e, 'ice'); return Math.abs(e.st.frozen - 1.5) < 0.05; })()"), 'an elite 1.5 s');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); T.hit(e, 'water'); T.hit(e, 'ice'); const h = e.hp; T.hit(e, null, 1, { src: 'melee', heavy: true }); return e.st.frozen <= 0 && h - e.hp > 100; })()"), '粉砕: a heavy melee blow on the frozen foe breaks it for a lot');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); const o = T.mk(2, -6); const h = o.hp; T.hit(e, 'fire'); T.hit(e, 'volt'); return h - o.hp > 50 && o.st.burn > 0; })()"), '炎＋雷 = 爆轟: the blast hurts and sets fire to the foe beside it');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); T.hit(e, 'water'); T.hit(e, 'volt'); return e.st.leak > 3.9 && e.st.shock > 0; })()"), '水＋雷 = 漏電 for 4 s, with shock');
    await p.eval("(() => { T.clean(); T.e = T.mk(); T.o = T.mk(3, -6); T.hit(T.o, 'water'); T.oh = T.o.hp; T.hit(T.e, 'water'); T.hit(T.e, 'volt'); for (let i = 0; i < 8; i++) G.combat.updateStatus(T.e, 0.25); return 1; })()");
    check(await p.eval("T.o.st.leak > 0 && T.oh > T.o.hp"), 'and it runs on into a wet foe nearby');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); const base = T.hit(e, null, 100); T.hit(e, 'ice'); T.hit(e, 'volt', 1); const d = T.hit(e, null, 100); return e.st.brittle > 7 && Math.abs(d / base - 1.25) < 0.01; })()"), '氷＋雷 = 脆化: +25% damage taken for 8 s');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); const o = T.mk(3, -6); T.hit(e, 'fire'); T.hit(e, 'wind'); return G.Elem.auraOf(o) === 'fire' && G.Elem.auraOf(e) === null; })()"), '風 = 旋風: the element is spread to the foes around');
    check(await p.eval("(() => { T.clean(); G.Elem.clear(); const e = T.mk(); T.hit(e, 'volt'); T.hit(e, 'earth'); return G.Elem.crystals.length === 1 && G.Elem.crystals[0].el === 'volt'; })()"), '地 = 晶壁: a crystal of that element falls');
    check(await p.eval("(() => { const c = G.Elem.crystals[0]; c.m.position.copy(G.player.chestPos()); const os = G.player.os || 0; G.Elem.update(0.016); return (G.player.os || 0) >= os + 39 && G.player.stats.elRes_volt >= 0.4 && G.Elem.crystals.length === 0; })()"), 'picking it up: +40 shield and +40% resistance to that element');
    // ---- the cool-down of a gun's element
    check(await p.eval("(() => { T.clean(); const e = T.mk(); const w = { def: { id: 'tw' } }; G.combat.damageEnemy(e, 10, { src: 'bullet', el: 'fire', weapon: w, noMarker: true }); G.combat.damageEnemy(e, 10, { src: 'bullet', el: 'water', weapon: w, noMarker: true }); return G.Elem.auraOf(e) === 'fire'; })()"), 'one gun leaves its element on one foe once every 2.5 s');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); T.hit(e, 'fire', 10, { src: 'skill' }); T.hit(e, 'fire', 10, { src: 'skill' }); T.hit(e, 'water', 10, { src: 'skill' }); return G.Elem.auraOf(e) === null; })()"), 'skills always do');
    // ---- foes born with an element
    r = await p.eval("(() => { T.clean(); const e = T.mk(); e.auFix = 'water'; e.elRes = { water: 0.7 }; const base = T.hit(e, null, 100); const w = T.hit(e, 'water', 100); const f = T.hit(e, 'fire', 100); const f2 = T.hit(e, 'fire', 100); return [Math.round(w / base * 100) / 100, Math.round(f / base * 100) / 100, Math.round(f2 / base * 100) / 100, G.Elem.auraOf(e)].join(':'); })()");
    check(r === '0.3:2:1:water', 'born with water: water ×0.3, fire reacts (×2.0) and the water stays; then 1 s before the next (' + r + ')');
    // ---- 属性熟練 and the reaction boons: separate factors
    r = await p.eval(`(() => { T.clean(); const P = G.player; const blast = () => { T.clean(); const e = T.mk(); const o = T.mk(2, -6); const h = o.hp; T.hit(e, 'fire', 1); T.hit(e, 'volt', 1); return h - o.hp - 1; };
      const b0 = blast(); P.stats.elMastery = 100; const b1 = blast(); P.stats.reactDmg = 0.4; const b2 = blast(); P.stats.elMastery = 0; P.stats.reactDmg = 0;
      return [Math.round(b1 / b0 * 100) / 100, Math.round(b2 / b0 * 100) / 100].join(':'); })()`);
    { const [x, y] = r.split(':').map(Number); r = Math.abs(x - 1.5) < 0.02 && Math.abs(y - 2.1) < 0.03 ? 'ok' : r; }
    check(r === 'ok', '属性熟練 100 = ×1.5 on 爆轟; with 反応の極意 (+40%) ×1.5 × 1.4 = ×2.1 (' + r + ')');
    r = await p.eval("(() => { const P = G.player; P.stats.elMastery = 100; T.clean(); const e = T.mk(); const base = T.hit(e, null, 100); T.hit(e, 'water', 1); const d = T.hit(e, 'fire', 100); P.stats.elMastery = 0; return Math.round(d / base * 100) / 100; })()");
    check(r === 2.15, 'and +0.15 on the factor of 沸騰 (2.0 -> ' + r + ')');
    // ---- the player's side (the page of a test runs in the background, where the game pauses itself)
    await p.eval("G.game.state = 'playing'; 1");
    check(await p.eval("(() => { const P = G.player; G.game.dev.god = false; P.invulnT = 0; P.hp = P.stats.maxHp; P.au = null; P.invulnT = 0; G.combat.damagePlayer(5, { src: 'melee', el: 'water' }); const a = G.Elem.playerAura(); P.invulnT = 0; G.combat.damagePlayer(5, { src: 'melee', el: 'ice' }); const f = P.elFrozen; G.game.dev.god = true; P.hp = P.stats.maxHp; return a === 'water' && f > 0.9 && !G.Elem.playerAura(); })()"), 'on you: water stays, ice on it freezes you for 1 s');
    r = await p.eval("(() => { const P = G.player; G.game.dev.god = false; P.os = 0; P.stats.dodge = 0; P.au = null; P.elFrozen = 0; P.hp = P.stats.maxHp; const h0 = P.hp; P.invulnT = 0; G.combat.damagePlayer(20, { src: 'melee' }); const plain = h0 - P.hp; P.hp = P.stats.maxHp; P.stats.elRes_fire = 0.5; P.au = null; P.invulnT = 0; G.combat.damagePlayer(20, { src: 'melee', el: 'fire' }); const res = P.stats.maxHp - P.hp; P.stats.elRes_fire = 0; P.au = null; G.game.dev.god = true; P.hp = P.stats.maxHp; return Math.round(res / plain * 100) / 100; })()");
    check(r === 0.5, '属性耐性 50% halves a fire blow (' + r + ')');
    check(await p.eval("(() => { const P = G.player; G.game.dev.god = false; P.os = 0; P.stats.elRes_fire = 0.5; P.au = null; P.invulnT = 0; G.combat.damagePlayer(1, { src: 'melee', el: 'fire' }); const left = P.au ? P.au.t - G.game.time : 0; P.stats.elRes_fire = 0; P.au = null; G.game.dev.god = true; P.hp = P.stats.maxHp; return Math.abs(left - 6) < 0.1; })()"), 'and leaves the time it stays on you as it is (6 s)');
    // ---- numbers and the HP bar
    {
      await p.eval("T.nums.length = 0; (() => { T.clean(); const e = T.mk(); G.combat.damageEnemy(e, 50, { src: 'explosion', el: 'volt' }); G.combat.damageEnemy(e, 50, { src: 'explosion', head: true }); return 1; })()");
      const nums = JSON.parse(await p.eval('JSON.stringify(T.nums)'));
      check(nums.some(([, c]) => /el-volt/.test(c)) && nums.some(([, c]) => /head/.test(c) && !/el-/.test(c)), 'numbers: the colour of the element, a headshot by its own class (outline) ' + JSON.stringify(nums));
    }
    check(await p.eval("(() => { const e = G.enemies.list[0]; e.hasLOS = true; G.enemies.updateBars(); const b = e.bar; return !!b && b.eb.classList.contains('on') && b.eb.textContent === '⚡'; })()"), 'the HP bar shows the element badge');
    check(await p.eval("(() => { const e = G.enemies.list[0]; e.auFix = 'fire'; G.enemies.updateBars(); return e.bar.eb.classList.contains('fix') && e.bar.el.classList.contains('elfix'); })()"), 'a foe born with one gets the double ring and a coloured frame');
    check(await p.eval("(() => { T.clean(); const e = T.mk(0, -6, { elite: true }); G.Depth.onSpawn(e, {}); e.hasLOS = true; G.enemies.updateBars(); const b = e.bar; return !!e.mut && Object.keys(e.mut).length >= 1 && b.el.classList.contains('elite') && b.ch.querySelectorAll('i').length >= 1 && !/★/.test(b.nm.textContent); })()"), 'an elite carries a mutation, shown as a chip, with no ★ in its name');
    // ---- 属性の油, 属性コア
    check(await p.eval("(() => { const P = G.player; const w = P.weapon; w.atts.core = 'c_ice'; const a = G.Elem.wEl(w); G.abilities.applyItem('u_oil_fire'); const b = G.Elem.wEl(w); w.oil = null; delete w.atts.core; return a === 'ice' && b === 'fire'; })()"), 'a gun with 氷の属性コア shoots ice; 炎の油 makes it fire for a while');
    check(await p.eval("G.ITEM_BY_ID.u_oil_fire.rarity === 'rare' && G.ATT_BY_ID.c_fire.compat(G.WEAPON_BY_ID.starter) && !G.ATT_BY_ID.c_fire.compat(G.WEAPON_BY_ID.p_cinder)"), 'the oil is rare; a core fits an ordinary gun, not one born with an element');
    // ---- the water skills
    check(await p.eval("!!G.SKILL_BY_ID.waterbolt && G.SKILL_BY_ID.waterbolt.rarity === 'uncommon' && G.SKILL_BY_ID.whirlpool.rarity === 'rare' && G.Elem.skEl('waterbolt') === 'water'"), 'two water skills: 水弾 (uncommon), 渦潮 (rare)');
    await p.eval("(() => { T.clean(); const P = G.player; T.e = T.mk(0, -8); P.skills[1] = G.abilities.makeSlot('whirlpool'); P.skills[1].cd = 0; G.combat.zone(T.e.pos.clone(), 4.5, 5, 'whirl', 25, { sk: 'whirlpool' }); G.game.state = 'playing'; for (let i = 0; i < 4; i++) G.combat.update(0.25); return 1; })()");
    check(await p.eval("G.Elem.auraOf(T.e) === 'water' && T.e.hp < 1e6"), '渦潮 soaks and hurts what stands in it');
    check(await p.eval("G.combat.zones.length > 0 ? (G.combat.zones.length = 0, true) : true"), '(zones cleared)');
    // ---- bleeding is gone; what took its place
    check(await p.eval("(() => { T.clean(); const e = T.mk(); G.combat.status(e, 'bleed', 3); return !(e.st.bleed > 0) && !G.BUFF_BY_ID.h_bleed && !/出血/.test(JSON.stringify([G.BUFFS, G.ITEMS, G.ATTACHMENTS, G.MELEE, G.WEAPONS].map((l) => l.map((o) => o.desc + o.name)))); })()"), 'no bleeding anywhere (status, boons, items, attachments, weapons)');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); const w = { def: G.WEAPON_BY_ID.t_rivet, atts: {} }; const a = G.combat.damageEnemy(e, 100, { src: 'bullet', weapon: w, noMarker: true }); for (let i = 0; i < 6; i++) G.combat.damageEnemy(e, 1, { src: 'bullet', weapon: w, noMarker: true }); const b = G.combat.damageEnemy(e, 100, { src: 'bullet', weapon: w, noMarker: true }); return e.st.nails === 5 && Math.abs(b / a - 1.15) < 0.01; })()"), 'nail guns: nails stay in the foe, +3% each, up to 5');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); const w = G.weapons.make('starter'); w.atts.ammo = 'a_bleed'; w.ver++; const a = G.combat.damageEnemy(e, 100, { src: 'bullet', weapon: w, noMarker: true }); for (let i = 0; i < 12; i++) G.combat.damageEnemy(e, 1, { src: 'bullet', weapon: w, noMarker: true }); const b = G.combat.damageEnemy(e, 100, { src: 'bullet', weapon: w, noMarker: true }); return Math.abs(b / a - 1.3) < 0.01; })()"), '破砕弾: the same gun on the same foe grows to +30%');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); G.player.stats.critChance = 1; const s = G.weapons.meleeStats({ def: G.MELEE_BY_ID.m_kukri }); let n = 0; const dn = G.combat.damageEnemy; const h0 = e.hp; G.combat.damageEnemy(e, 100, { src: 'melee', critSlash: s.critSlash, noMarker: true }); const d = h0 - e.hp; G.player.stats.critChance = 0; return s.critSlash === 0.5 && d > 100 * G.player.stats.critMul + 49; })()"), 'ククリ: a crit cuts once more for half');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); G.combat.status(e, 'poison', 6); const h = e.hp; G.combat.burstPoison(e); return !(e.st.poison > 0) && h - e.hp > 0 && G.BUFF_BY_ID.h_hemorrhage.name === '毒抜き'; })()"), '毒抜き: the poison is spent at once');
    // ---- the boons and the armour
    check(await p.eval("G.BUFFS.filter((b) => b.cat === 'attr').length === 16 && G.BUFF_CAT.element.name === '状態異常' && G.BUFF_CAT.attr.name === '属性' && !!G.BUFF_BY_ID.s_elMastery_3"), '16 element boons in their own group; the old one is 状態異常; a tiered 属性熟練 boon');
    check(await p.eval("(() => { const P = G.player; P.buffs.set('rx_master', 1); P.recalc(); const ok = P.stats.reactDmg === 0.4 && P.stats.reactMul === 0.2; P.buffs.delete('rx_master'); P.recalc(); return ok; })()"), '反応の極意 sets the reaction factor (+40%, +0.2)');
    check(await p.eval("(() => { const P = G.player; const it = { id: 'ar_chest_cloth_rare', ench: [{ id: 'elm', v: 20 }, { id: 'elres', v: 12, el: 'ice' }] }; const old = P.equip.chest; P.equip.chest = it; P.recalc(); const ok = P.stats.elMastery === 20 && Math.abs(P.stats.elRes_ice - 0.12) < 1e-9 && G.enchantText(it.ench[0]) === '属性熟練+20' && G.enchantText(it.ench[1]).includes('氷耐性+12%'); P.equip.chest = old; P.recalc(); return ok; })()"), 'enchantments: 属性熟練 +20 (a number), 氷耐性 +12%');
    check(await p.eval("(() => { let m = 0, r = 0, el = new Set(); for (let i = 0; i < 4000; i++) for (const e of G.rollEnchants('legendary')) { if (e.id === 'elm') { m++; if (e.v !== Math.round(e.v)) return false; } if (e.id === 'elres') { r++; el.add(e.el); } } return m > 100 && r > 100 && el.size === 6; })()"), 'and they are drawn with the rest (all six elements)');
    // ---- foes with elements
    check(await p.eval("['fire', 'water', 'ice', 'volt'].every((el) => G.ENEMY_BY_ID['slime_el' + el] && G.ENEMY_BY_ID['slime_el' + el].auFix === el && G.ENEMY_BY_ID['core_' + el]) && G.ENEMY_BY_ID.golem_lava.auFix === 'fire' && G.ENEMY_BY_ID.golem_glacier.auFix === 'ice'"), 'born with an element: four slimes, four elemental cores, a lava and a glacier golem');
    check(await p.eval("G.ENEMIES.filter((e) => e.variant === 'tide').length === 15 && G.ENEMY_BY_ID.hound_fire.el === 'fire' && G.ENEMY_BY_ID.hound_frost.el === 'ice' && G.ENEMY_BY_ID.hound_storm.el === 'volt' && G.ENEMY_BY_ID.hound_venom.el === null && G.ENEMY_BY_ID.imp_normal.el === 'fire'"), 'wielding one: 炎獄 / 氷結 / 雷鳴 / the new 水禍 (15 kinds), the imp; 猛毒 has none');
    check(await p.eval("(() => { const ids = (n) => G.game.enemyPool(n).map(([e]) => e.id); return !ids(2).includes('slime_elfire') && ids(3).includes('slime_elfire') && !ids(3).includes('core_fire'); })()"), 'the element slimes come from area 3, the cores later');
    check(await p.eval("(() => { T.clean(); T.def = G.ENEMY_BY_ID.slime_elwater; const e = T.mk(); T.def = G.ENEMY_BY_ID.brute_normal; return e.auFix === 'water' && G.Elem.auraOf(e) === 'water' && e.elRes.water === 0.7 && e.elAtk === 'water'; })()"), 'a water slime is always wet, resists water by 70%, strikes with water');
    check(await p.eval("(() => { const P = G.player; G.game.dev.god = false; P.os = 0; P.au = null; P.invulnT = 0; const e = G.enemies.list[0]; G.combat.damagePlayer(3, { src: 'melee', attacker: e }); const a = G.Elem.playerAura(); P.au = null; G.game.dev.god = true; P.hp = P.stats.maxHp; return a === 'water'; })()"), 'its blows leave water on you');
    check(await p.eval("(() => { T.clean(); T.def = G.ENEMY_BY_ID.core_volt; const c = T.mk(); T.def = G.ENEMY_BY_ID.brute_normal; const o = T.mk(2, -6); c.hp = 1; G.combat.damageEnemy(c, 50, { src: 'explosion', el: null }); return !c.alive && G.Elem.auraOf(o) === 'volt'; })()"), 'an elemental core bursts and leaves its element on the foes around');
    check(await p.eval("(() => { const b = { parts: [{}, {}] }; G.Elem.bossInit(b, 'houndlord'); const t = { parts: [{}, {}] }; G.Elem.bossInit(t, 'twins'); return b.elAtk === 'fire' && b.parts[1].elRes.fire === 0.25 && b.parts[1].elRes.water === -0.25 && t.parts[0].elAtk === 'fire' && t.parts[1].elAtk === 'ice'; })()"), 'guardians: Garm wields fire (25% resisted), weak to water (-25%); the twins one fire, one ice');
    // ---- the last pieces: an element of its own on a weapon made from parts, the skill upgrades for elemental skills
    check(await p.eval("(() => { const w = G.weapons.make('starter'); w.el = 'earth'; w.atts.core = 'c_fire'; const a = G.Elem.wEl(w); const snap = G.game.playerSnap(); G.player.weapons = [w]; const s2 = G.game.playerSnap(); return a === 'earth' && s2.weapons[0].el === 'earth'; })()"), 'a weapon with an element of its own keeps it (over a core) and in the save');
    check(await p.eval("!!G.BUFF_BY_ID.sk_fireball_elT && !!G.BUFF_BY_ID.sk_waterbolt_elCd && !G.BUFF_BY_ID.sk_dash_elT"), 'elemental skills get 残留 / 反応充填 upgrades, others do not');
    check(await p.eval("(() => { T.clean(); const e = T.mk(); const P = G.player; P.buffs.set('sk_fireball_elT', 1); P.recalc(); G.abilities._skmC = null; const C = G.combat; const prev = C.curSk; C.curSk = 'fireball'; T.hit(e, 'fire', 10, { src: 'skill', sk: 'fireball' }); C.curSk = prev; const left = G.Elem.auraLeft(e); P.buffs.delete('sk_fireball_elT'); P.recalc(); return Math.abs(left - 12) < 0.2; })()"), '残留: the fireball leaves fire for 12 s');
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nELEMENT TEST FAILED (${fails.length})` : '\nELEMENT TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
