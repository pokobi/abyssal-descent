'use strict';
// A skill's own upgrades (skillaug.js) add to it: with any one of them the skill still deals its own damage. Each skill (and ultimate)
// is cast at a dummy 7 m ahead, first bare, then with each of its upgrades alone; the damage the dummy takes in the next 4 s with
// an upgrade must not fall far below the bare cast, in all or in its biggest blow (an upgrade that took the skill's own blast away:
// 焼夷 on the fireball did).
//   node tests/skillaug_test.js [skill ids, default all]
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9889;

const PAGE = `
window.__aug = {
  init() {
    const P = G.player, w = G.world;
    // every blow the dummy takes, one by one (the skill's own hit is its biggest: a fire left behind only adds small ticks)
    const de = G.combat.damageEnemy, self = this;
    G.combat.damageEnemy = function (e, amt) { const r = de.apply(this, arguments); if (e === self.e && typeof r === 'number' && r > self.big) self.big = r; return r; };
    // somewhere with 14 m of open floor ahead
    let best = null;
    for (let k = 0; k < 8 && !best; k++) {
      const yaw = P.yaw + k * Math.PI / 4, f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const h = w.raycast(P.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), f, 14);
      if (!h) best = yaw;
    }
    this.home = P.pos.clone(); this.yaw = best == null ? P.yaw : best;
    return best != null;
  },
  setup(id, aug) {
    const GM = G.game, P = G.player, A = G.abilities, C = G.combat;
    G.ui.clearScreen(); GM.state = 'playing';
    C.clear(); if (A.clearUltAuras) A.clearUltAuras(); A.rifts.length = 0; if (A.shadowEnd) A.shadowEnd(); P.leap = null; // (nothing left over from the cast before: a rift erases a plain foe)
    for (const e of G.enemies.list.slice()) { e.alive = false; e.remove && e.remove(); } G.enemies.list.length = 0;
    for (const k of [...P.buffs.keys()]) { const b = G.BUFF_BY_ID[k]; if (b && b.skill) P.buffs.delete(k); }
    if (aug) P.buffs.set(aug, 1);
    if (P.temps && P.temps.clear) P.temps.clear();
    P.recalc(); P._skm = null; P.stats.critChance = 0;
    P.pos.copy(this.home); P.vel.set(0, 0, 0); P.yaw = this.yaw; P.pitch = 0; P.grapple.state = 'none'; P.pileState = null; P.invulnT = 99;
    GM.step(0.02, 2);
    const e = G.enemies.spawn(G.ENEMY_BY_ID.brute_normal, 5, P.pos.clone(), { noSplit: true });
    e.maxHp = e.hp = 1e6; e.shield = e.maxShield = 0; e.update = () => {}; e.state = 'chase';
    const f = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
    e.pos.copy(P.pos).addScaledVector(f, 7); e.model.group.position.copy(e.pos); e.updateHits(); e.hasLOS = true; e.lastHitT = GM.time; // (its body and hit spheres where it stands: it never moves)
    this.e = e; this.big = 0;
    const s = A.makeSlot(id); s.cd = 0; if (s.maxCharges) s.charges = s.maxCharges; P.skills[1] = s; A.cast(s);
    return 1;
  },
  dmg() { return [Math.round(1e6 - this.e.hp), Math.round(this.big)]; },
};
1;`;

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  let fails = 0;
  const ok = (c, m) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fails++; };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000); await sleep(800);
    await p.eval("G.game.dev = { god: true, speed: 1 }; G.game.objective = null; 1");
    await p.eval(PAGE);
    ok(await p.eval('__aug.init()'), 'an open place to cast in');
    const want = process.argv[2] ? process.argv[2].split(',') : null;
    const skills = JSON.parse(await p.eval('JSON.stringify((G.SKILLS || []).map((s) => s.id))')).filter((id) => !want || want.includes(id));
    const cast = async (id, aug) => {
      await p.eval(`__aug.setup('${id}', ${aug ? `'${aug}'` : 'null'})`);
      for (let i = 0; i < 18; i++) { await p.eval('G.game.step(0.05, 8); 1'); await sleep(70); } // (7.2 s: a well that ends in its crush, made 30% longer, still ends inside it)
      return JSON.parse(await p.eval('JSON.stringify(__aug.dmg())')); // [all it took, its biggest blow]
    };
    const bad = [];
    // (upgrades that only move where the skill lands: the dummy stands where the bare one lands)
    const SKIP = { sk_leap_x_far: 'jumps 1.4 times as far: over the dummy' };
    let tried = 0;
    for (const id of skills) {
      const augs = JSON.parse(await p.eval(`JSON.stringify(Object.values(G.BUFF_BY_ID).filter((b) => b.skill === '${id}').map((b) => [b.id, b.name]))`));
      const [base, big0] = await cast(id, null);
      if (base < 30) { console.log(`   ${id}: no damage of its own on the dummy (${base}), skipped`); continue; }
      const lost = ([d, b]) => d < base * 0.5 || b < big0 * 0.5; // (less in all, or its own big hit gone)
      const row = [];
      for (const [aug, name] of augs) {
        if (SKIP[aug]) { row.push(`${name}:(${SKIP[aug]})`); continue; }
        let r = await cast(id, aug);
        if (lost(r)) { const r2 = await cast(id, aug); if (!lost(r2)) r = r2; } // (once more: a hit that just missed is not what this looks for)
        tried++;
        row.push(`${name}:${Math.round(r[0] / base * 100)}%/${Math.round(r[1] / Math.max(1, big0) * 100)}%`);
        if (lost(r)) bad.push(`${id} + ${name} (${aug}): ${r[0]} of ${base} in all, biggest blow ${r[1]} of ${big0}`);
      }
      console.log(`   ${id} bare ${base} (biggest ${big0})  ${row.join(' ')}`);
    }
    ok(tried > (want ? 0 : 50), `upgrades tried (${tried})`);
    ok(bad.length === 0, "no upgrade takes the skill's own damage away" +(bad.length ? ':\n       ' + bad.join('\n       ') : ''));
    const errs = p.errs || [];
    ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('crashed', e && e.stack || e); fails++; }
  finally { ch.close(); srv.close(); }
  console.log(fails ? '\nSKILLAUG TEST FAILED (' + fails + ')' : '\nSKILLAUG TEST PASSED');
  process.exit(fails ? 1 : 0);
})();
