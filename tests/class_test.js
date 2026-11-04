'use strict';
// Classes (js/classes.js): six of them, their starting kit at one strength (common gun + melee, an uncommon skill, an epic ultimate), their strength and
// weakness, the grapple's cooldown, the choice screen after the difficulty, the class kept in a saved run, the records per class, the third-person clothes,
// 不屈の城塞 (epic, drawing foes in).
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
    await p.eval("G.save.data.settings.volume = 0; G.save.write(); G.sfx.setVolume && G.sfx.setVolume(0); G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; 1");
    // ---- the data
    check(await p.eval("G.Classes.LIST.length === 6"), 'six classes');
    const kits = JSON.parse(await p.eval("JSON.stringify(G.Classes.LIST.map((c) => [c.id, G.WEAPON_BY_ID[c.gun].rarity, G.MELEE_BY_ID[c.melee].rarity, G.SKILL_BY_ID[c.skill].rarity, G.SKILL_BY_ID[c.ult].rarity]))"));
    console.log('      ' + JSON.stringify(kits));
    check(kits.every(([, g, m, s, u]) => g === 'common' && m === 'common' && s === 'uncommon' && u === 'epic'), 'every class: a common gun and melee weapon, an uncommon skill, an epic ultimate');
    check(await p.eval("G.SKILL_BY_ID.ult_bastion.rarity === 'epic' && G.SKILL_BY_ID.ult_bastion.price === 7800 && G.Classes.BY.heavy.ult === 'ult_bastion' && G.Classes.BY.soldier.ult === 'ult_armory'"), '不屈の城塞 is epic now and belongs to the heavy; the soldier has 無限兵装');
    check(await p.eval("G.WEAPON_BY_ID.n_scout.rarity === 'common' && G.WEAPON_BY_ID.n_scout.arch === 'sniper' && G.MELEE_BY_ID.m_woodshield.rarity === 'common' && !!G.MELEE_BY_ID.m_woodshield.guard"), 'new: a common sniper rifle (スカウト SR), a common shield (木の円盾)');
    // ---- the choice after the difficulty
    await p.eval("G.ui.title(); 1"); await sleep(300);
    await p.eval("document.querySelector('#t-start').click(); 1"); await sleep(500);
    await p.eval("(() => { const b = document.querySelector('.slot-new, [data-slot]'); if (b) b.click(); return 1; })()"); await sleep(400);
    await p.eval("(() => { const c = document.querySelector('.df-card[data-id=\"normal\"]'); if (c) c.click(); return 1; })()"); await sleep(500);
    check(await p.eval("document.querySelectorAll('.cls-item').length === 6 && !!document.querySelector('.cls-host canvas, .cls-noview')"), 'after the difficulty: the list of six on the left, the preview (a 3D figure) on the right');
    await p.eval("document.querySelector('.cls-item[data-c=\"mage\"]').click(); 1"); await sleep(200);
    const card = await p.eval("document.querySelector('.cls-detail').textContent.replace(/\\s+/g, ' ')");
    console.log('      ' + card.slice(0, 260));
    check(/火球/.test(card) && /大海嘯/.test(card) && /長所/.test(card) && /短所/.test(card) && /CT 20秒/.test(card) && /リベッター/.test(card), 'a card names the skill and the ultimate with what they do, the strength, the weakness, the grapple');
    await p.eval("document.querySelector('#cls-go').click(); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(800);
    check(await p.eval("G.save.data.settings.lastClass === 'mage' && G.player.cls === 'mage' && G.game.run.cls === 'mage'"), 'the choice starts the run and is remembered');
    check(await p.eval("(() => { G.game.saveRun(G.game.area, G.game.stage); const r = G.game.loadRun(G.game.slot); G.ui.title(); const b = document.querySelector('#t-cont'); const t = b ? b.textContent : ''; G.ui.slotMenu(() => {}); const menu = document.querySelector('#screens').textContent; G.ui.clearScreen(); G.game.state = 'playing'; return !!r && r.cls === 'mage' && /術士/.test(t + menu); })()"), 'the saved run records its class, and the continue button / slot list name it');
    // ---- each kit
    for (const id of ['soldier', 'assault', 'sniper', 'blade', 'heavy', 'mage']) {
      const r = JSON.parse(await p.eval(`(() => { const P = G.player; P.cls = '${id}'; P.resetRun(); const c = G.Classes.BY['${id}']; return JSON.stringify({ w: P.weapons[0].id, m: P.melee.id, s0: P.skills[0].id, s1: P.skills[1].id, cd: G.grappleCdOf(P.stats), hp: P.stats.maxHp, ok: P.weapons[0].id === c.gun && P.melee.id === c.melee && P.skills[0].id === c.ult && P.skills[1].id === c.skill && P.hp === P.stats.maxHp }); })()`));
      check(r.ok, `${id}: ${r.w} / ${r.m} / ${r.s1} / ${r.s0}, grapple ${r.cd} s, HP ${r.hp}`);
    }
    check(await p.eval("(() => { const P = G.player; const o = {}; for (const id of ['soldier', 'assault', 'blade', 'heavy', 'sniper', 'mage']) { P.cls = id; P.resetRun(); o[id] = G.grappleCdOf(P.stats); } return o.assault === 15 && o.blade === 15 && o.soldier === 18 && o.sniper === 18 && o.mage === 20 && o.heavy === 28; })()"), 'grapple cooldowns: 15 / 15 / 18 / 18 / 20 / 28 s');
    check(await p.eval("(() => { const P = G.player; const r = {}; P.cls = 'heavy'; P.resetRun(); r.h = [P.stats.maxHp, P.stats.armor, P.stats.moveSpeed]; P.cls = 'sniper'; P.resetRun(); r.s = [P.stats.maxHp, P.stats.headMul]; P.cls = 'mage'; P.resetRun(); r.m = [P.stats.maxHp, P.stats.elMastery, G.Elem.wEl(P.weapons[0])]; P.cls = 'blade'; P.resetRun(); r.b = [P.stats.meleeDmg, P.stats.guardHp, P.stats.magSize]; return JSON.stringify(r); })()").then((s) => { console.log('      ' + s); const r = JSON.parse(s); return r.h[0] === 130 && Math.abs(r.h[1] - 0.1) < 1e-9 && r.s[0] === 90 && Math.abs(r.s[1] - 0.3) < 1e-9 && r.m[0] === 85 && r.m[1] === 80 && r.m[2] === 'water' && Math.abs(r.b[0] - 0.2) < 1e-9 && Math.abs(r.b[2] + 0.25) < 1e-9; }), 'strengths and weaknesses as stats (heavy HP 130, sniper 90 with +30% headshots, mage 85 with 属性熟練 80 and a water core, blade +20% melee)');
    // 突撃兵: near and far
    {
      const r = await p.eval(`(() => { const P = G.player; G.game.state = 'playing'; P.stats.critChance = 0; const mk = (dz) => { const e = G.enemies.spawn(G.ENEMY_BY_ID.brute_normal, 5, new THREE.Vector3(P.pos.x, P.pos.y, P.pos.z + dz), { noSplit: true }); e.maxHp = e.hp = 1e6; e.shield = e.maxShield = 0; e.update = () => {}; return e; };
        const hit = () => { const near = mk(-5), far = mk(-25); const a = G.combat.damageEnemy(near, 100, { src: 'explosion', el: null }); const b = G.combat.damageEnemy(far, 100, { src: 'explosion', el: null }); near.alive = far.alive = false; near.remove(); far.remove(); return [a, b]; };
        P.cls = 'soldier'; P.resetRun(); P.stats.critChance = 0; const s = hit(); P.cls = 'assault'; P.resetRun(); P.stats.critChance = 0; const a = hit(); return [Math.round(a[0] / s[0] * 100) / 100, Math.round(a[1] / s[1] * 100) / 100].join(':'); })()`);
      check(r === '1.15:0.85', '突撃兵: +15% within 10 m, -15% beyond 20 m (' + r + ')');
    }
    // ---- a saved run keeps the class
    check(await p.eval("(() => { const P = G.player; P.cls = 'sniper'; P.resetRun(); const snap = G.game.playerSnap(); P.cls = 'soldier'; G.game.applyPlayerSnap(snap); return P.cls === 'sniper' && P.weapons[0].id === 'n_scout'; })()"), 'a saved run keeps its class');
    // ---- records per class
    check(await p.eval("(() => { const P = G.player; P.cls = 'blade'; G.game.state = 'playing'; const R = G.save.data.records; const b0 = (R.byClass && R.byClass.blade && R.byClass.blade.bestArea) || 0; G.Run.markClear(); return !!R.byClass.blade && R.byClass.blade.clears.normal >= 1; })()"), 'clears are kept per class');
    // ---- the clothes
    const looks = JSON.parse(await p.eval("JSON.stringify(G.Classes.LIST.map((c) => { const P = G.player; P.cls = c.id; G.avatar.update(0.016, P); const r = G.avatar.root; let n = 0; r.traverse(() => n++); return [c.id, n]; }))"));
    console.log('      ' + JSON.stringify(looks));
    check(new Set(looks.map((l) => l[1])).size >= 3 && looks.every((l) => l[1] > 45), 'each class wears its own clothes in third person');
    check(await p.eval("(() => { const P = G.player; P.cls = 'mage'; G.avatar.update(0.016, P); const J = G.avatar.root; let orbs = 0; J.traverse((o) => { if (o.material && o.material.isMeshBasicMaterial && o.scale.x === 0.05) orbs++; }); return orbs === 3; })()"), 'the mage has three orbs around it');
    // ---- 不屈の城塞 draws foes in
    check(await p.eval("(() => { const P = G.player; const e = G.enemies.spawn(G.ENEMY_BY_ID.brute_normal, 5, new THREE.Vector3(P.pos.x, P.pos.y, P.pos.z - 6), { noSplit: true }); e.update = () => {}; const dec = { pos: P.pos.clone().add(new THREE.Vector3(3, 0, 0)), t: 9 }; const gd = G.combat.getDecoy; G.combat.getDecoy = () => dec; const a = !!e.target().decoy; P.temps.set('ult_bastion', { t: 5, max: 10, mods: {} }); const b = !e.target().decoy; P.temps.delete('ult_bastion'); G.combat.getDecoy = gd; e.alive = false; e.remove(); return a && b; })()"), '不屈の城塞: a foe within 15 m leaves the decoy for you');
    // ---- the nail guns make a sound when they fire (they shoot projectiles, but have a gun voice of their own); blink waits longer
    check(await p.eval("(() => { const P = G.player; P.cls = 'mage'; P.resetRun(); G.game.state = 'playing'; const got = []; const g0 = G.sfx.gun, l0 = G.sfx.launcher; G.sfx.gun = (k) => got.push('gun:' + k); G.sfx.launcher = (k) => got.push('launcher:' + k); try { const w = P.weapons[0]; G.weapons.shoot(w, G.weapons.stats(w)); } finally { G.sfx.gun = g0; G.sfx.launcher = l0; } return got.includes('gun:nail') && !got.includes('launcher:nail'); })()"), 'the rivet gun (a nail gun) sounds when it fires');
    check(await p.eval("G.SKILL_BY_ID.blink.cd === 11"), 'blink: 11 s before the skill multiplier and levels (was 6 s)');
    // ---- selling the starting kit: the ultimate can't be sold, the rest is worth only its upgrades
    check(await p.eval(`(() => { const P = G.player; P.cls = 'soldier'; P.resetRun(); const PW = G.Pawn; const w = P.weapons[0], m = P.melee, s1 = P.skills[1], u = P.skills[0];
      const v = [PW.weaponValue(w), PW.meleeValue(m), PW.skillValue(s1)]; w.lv = 2; s1.lv = 1; const v2 = [PW.weaponValue(w), PW.skillValue(s1)];
      const found = G.weapons.make('a_ranger'); const fv = PW.weaponValue(found);
      return JSON.stringify({ v, v2, fv, ultKit: !!u.kit }); })()`).then((s) => { console.log('      ' + s); const r = JSON.parse(s); return r.v.every((x) => x === 0) && r.v2[0] === 120 && r.v2[1] > 0 && r.fv > 0 && r.ultKit; }), 'starting gun / melee / skill sell for nothing until upgraded; the same gun found later sells as usual');
    check(await p.eval(`(() => { const P = G.player; P.cls = 'mage'; P.resetRun(); const before = G.game.run.coins; const html = (() => { G.Pawn.open && G.Pawn.open(); return document.querySelector('#screens').textContent; })(); G.ui.clearScreen(); G.game.state = 'playing';
      const coreFree = G.Pawn.attValue('c_water') === 0; return /初期装備のアルティメットは売れません/.test(html) && coreFree; })()`), 'the pawn says the starting ultimate cannot be sold; the mage\'s water core is worth nothing');
    check(await p.eval(`(() => { const P = G.player; P.cls = 'blade'; P.resetRun(); P.skills[0] = G.abilities.makeSlot('ult_meteor'); const snap = G.game.playerSnap(); G.game.applyPlayerSnap(snap); return P.weapons[0].kit && P.melee.kit && P.skills[1].kit && !P.skills[0].kit; })()`), 'the kit marks survive a save; a found ultimate is not kit');
    // ---- the stats explain themselves; dodge is gone
    check(await p.eval("(() => { const keys = ['elMastery', 'elRes_fire', 'defense', 'armor', 'luck', 'cdr']; return keys.every((k) => /data-tip=/.test(G.statTip(k))) && !G.STAT_NAMES.dodge && !G.BUFF_BY_ID.s_dodge_1 && /被ダメ/.test(G.BUFF_BY_ID.d_light.desc) && /被ダメ/.test(G.BUFF_BY_ID.m_dashdodge.desc); })()"), 'stats carry a tooltip; no dodge rate left (its boons now cut damage instead)');
    check(await p.eval("(() => { G.player.stats.dodge = 0.99; G.game.dev.god = false; G.player.invulnT = 0; G.player.os = 0; const h = G.player.hp; G.combat.damagePlayer(5, { src: 'melee' }); const hit = G.player.hp < h; G.game.dev.god = true; G.player.stats.dodge = 0; G.player.hp = G.player.stats.maxHp; return hit; })()"), 'no hit is dodged any more');
    // ---- one drawing per thing: consumables, skills + ultimates, the kinds of part
    check(await p.eval(`(() => { const sil = (o) => { const t = document.createElement('div'); t.textContent = o.icon; return o.icon; }; const dup = (l) => { const m = {}; for (const o of l) { const k = (o.icon || '').replace(/\uFE0F/g, ''); (m[k] = m[k] || []).push(o.name); } return Object.values(m).filter((v) => v.length > 1).map((v) => v.join('/')); };
      return JSON.stringify({ items: dup(G.ITEMS), skills: dup([...G.SKILLS, ...G.ULTS]), parts: dup(G.Parts.FAMS) }); })()`).then((s) => { console.log('      ' + s); const r = JSON.parse(s); return !r.items.length && !r.skills.length && !r.parts.length; }), 'no two consumables, skills / ultimates or kinds of part share an icon');
    check(!p.errs.length, 'no errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 500));
  } catch (e) { console.error(e); fails.push(String(e)); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\nCLASS TEST FAILED (${fails.length})` : '\nCLASS TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
