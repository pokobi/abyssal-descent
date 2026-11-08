'use strict';
// The void and the elements of the surroundings:
//   - walkers never walk, leap or get jostled off an edge into the void on their own (sky islands, the foundry's chasm);
//   - one thrown off by your knockback dies, and its body lies on the nearest ground by the edge (searchable); a flyer shot down
//     over the void too; a body never hangs in the air;
//   - water, lava, an ice sheet and burning oil leave their element on you and on the foes in them (fields.js);
//   - the weather keeps its element on everyone (rain: water, snow: ice, embers: fire), never over another one, and lightning
//     strikes (on a wet foe: 漏電); the falling icicles leave ice (weather.js, fieldgen_t4.js).
//   node tests/hazard_test.js
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
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'hard', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(600);
    // helpers in the page: enter an area of a field (with a mood), cells next to the void, a walker / flyer of the area's level
    await p.eval(`(() => {
      const H = window.__H = {};
      // (waits run on the game's own clock: right after an area is built, or under load, it runs behind the wall clock)
      H.sl = (ms) => new Promise((res) => { const g0 = G.game.time, r0 = performance.now(); const tick = () => { if (G.game.time - g0 >= ms / 1000 || performance.now() - r0 > ms * 8 + 4000) res(); else setTimeout(tick, 15); }; tick(); });
      H.enter = (field, mood) => { const R = G.Run, GM = G.game; R._f0 = R._f0 || R.field; R.field = () => field; G.Sky.force = mood || ((G.Sky.V[field] || [])[0] || {}).id;
        G.enemies.clear(); GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; GM.enterArea(9, 'combat'); G.enemies.clear(); GM.objective = null; GM.waves = null; GM.dev = { speed: 1 }; GM.areaCleared = false;
        if (G.Warm && G.Warm.world) G.Warm.world(); }; // (its shaders compiled now, as the game does behind the fade between areas)
      H.edgeCells = () => { const w = G.world, out = [];
        for (let z = 2; z < w.Dn - 2; z++) for (let x = 2; x < w.Wn - 2; x++) { const i = z * w.Wn + x; if (w.nb[i] || w.nf[i] < -0.5 || w.nf[i] > 0.5 || w.npen[i] > 0.36 || (w.reachMask && !w.reachMask[i])) continue;
          const px = x - w.xo + 0.5, pz = z - w.zo + 0.5; let v = null;
          for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (w.voidBelow(px + dx, 0.5, pz + dz)) { v = [dx / 2, dz / 2]; break; }
          if (v) out.push({ x: px, y: w.nf[i], z: pz, vx: v[0], vz: v[1] }); }
        return out; };
      // a spot on dry, plain ground (no water, lava or field patch under it)
      H.dry = (x, z, k) => { const w = G.world, y = w.nf[k]; return ![...w.waterZones, ...w.lavaZones, ...(w.fields || [])].some((q) => x > q.x0 - 1.5 && x < q.x1 + 1.5 && z > q.z0 - 1.5 && z < q.z1 + 1.5 && y < (q.y || 0) + 0.4); };
      H.walkers = () => G.ENEMIES.filter((d) => !d.special && !d.flyer && !d.hover && !d.custom && !d.boss && !d.burrow && (!d.fields || d.fields.includes(G.world.field)) && (d.unlockK ?? 0) <= 2);
      H.falls = 0; const k0 = G.combat.killEnemy; G.combat.killEnemy = function (e, info, o) { if (info && info.src === 'fall') H.falls++; return k0.apply(this, arguments); };
      return 1; })()`);

    // ---------------- 1) nobody walks off into the void ----------------
    for (const field of ['sanctum', 'foundry']) {
      for (const control of [false, false, true]) { // (twice with the rule, on two different layouts; once without it)
        const r = await p.eval(`(async () => {
          const H = window.__H, P = G.player, w0 = () => G.world; H.enter('${field}');
          await H.sl(400);
          const w = w0(); if (${control}) w.edgeSafe = () => true; // (control: the old behaviour, to see the scene does push foes off)
          const edge = H.edgeCells(); if (edge.length < 20) return JSON.stringify({ err: 'few edge cells ' + edge.length });
          // you stand on an edge; the foes on edges across the void from you, and a few right next to you
          // (the edge cell with the most edge cells across the void from it)
          const acrossOf = (me) => edge.filter((c) => { const d = Math.hypot(c.x - me.x, c.z - me.z); return d > 6 && d < 22 && w.voidBelow((c.x + me.x) / 2, 0.5, (c.z + me.z) / 2); });
          let me = edge[0], across = [];
          for (let k = 0; k < 40; k++) { const c = edge[Math.floor((k + 0.5) * edge.length / 40)]; const a = acrossOf(c); if (a.length > across.length) { me = c; across = a; } }
          P.pos.set(me.x, me.y + 0.05, me.z); P.vel.set(0, 0, 0); G.game.dev.god = true;
          const nearMe = edge.filter((c) => { const d = Math.hypot(c.x - me.x, c.z - me.z); return d > 1.5 && d < 6; });
          const defs = H.walkers(); let n = 0;
          const pick = (arr, k) => { for (let i = 0; i < k && arr.length; i++) { const c = arr[(i * 7 + 3) % arr.length]; const e = G.enemies.spawn(defs[(n++ * 5) % defs.length], 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true }); if (e) { e.state = 'chase'; e.aware = true; } } };
          pick(across, 10); pick(nearMe, 5);
          // the field's own leapers too (the drowned grab, the bonecrawler pounce ...)
          for (const d of G.ENEMIES.filter((d) => d.fields && d.fields.includes('${field}') && !d.flyer)) { const c = nearMe[n % Math.max(1, nearMe.length)] || me; const e = G.enemies.spawn(d, 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true }); if (e) { e.state = 'chase'; e.aware = true; } n++; }
          H.falls = 0; const spawned = G.enemies.list.filter((e) => e.alive).length;
          for (let t = 0; t < 120; t++) { await H.sl(100); P.hp = P.stats.maxHp; for (const e of G.enemies.list) if (e.alive && e.hp < e.maxHp) e.hp = e.maxHp; }
          const over = G.enemies.list.filter((e) => e.alive && !e.flyer && w.voidBelow(e.pos.x, e.pos.y, e.pos.z)).length;
          const res = { spawned, falls: H.falls, over };
          G.game.dev.god = false; G.enemies.clear(); delete w.edgeSafe;
          return JSON.stringify(res);
        })()`).then(JSON.parse);
        console.log(field, control ? '(control, no edge rule)' : '', JSON.stringify(r));
        if (r.err) { check(false, `${field}: set up (${r.err})`); continue; }
        if (!control) check(r.falls === 0 && r.over === 0 && r.spawned >= 10, `${field}: ${r.spawned} walkers chase you along the edges for 12 s and none falls into the void (${r.falls} fell)`);
      }
    }

    // ---------------- 2) thrown off by your blow: it dies, its body lies by the edge ----------------
    for (const field of ['sanctum', 'foundry']) {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player; H.enter('${field}'); await H.sl(400);
        const w = G.world, edge = H.edgeCells(); const c = edge[Math.floor(edge.length / 3)];
        P.pos.set(c.x - c.vx * 4, c.y + 0.05, c.z - c.vz * 4); G.game.dev.god = true;
        if (!w.boxFree(P.pos.x - 0.3, P.pos.y + 0.1, P.pos.z - 0.3, P.pos.x + 0.3, P.pos.y + 1.8, P.pos.z + 0.3)) P.pos.set(c.x, c.y + 0.05, c.z);
        const def = H.walkers()[2];
        const e = G.enemies.spawn(def, 9, new THREE.Vector3(c.x, c.y, c.z), {}); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        H.falls = 0;
        // knocked toward the void until it is out over it (then it falls)
        for (let i = 0; i < 40 && e.alive && !w.voidBelow(e.pos.x, e.pos.y, e.pos.z); i++) { e.knockback(new THREE.Vector3(c.vx, 0, c.vz), 9); await H.sl(100); }
        for (let i = 0; i < 60 && e.alive; i++) await H.sl(100);
        await H.sl(600);
        const corpse = G.Inv.corpses.find((k) => k.e === e);
        const res = { fell: H.falls, alive: e.alive, corpse: !!corpse, y: +e.pos.y.toFixed(2), overVoid: w.voidBelow(e.pos.x, e.pos.y, e.pos.z), dEdge: +Math.hypot(e.pos.x - c.x, e.pos.z - c.z).toFixed(1), aboveFloor: +(e.pos.y - w.floorBelow(e.pos.x, e.pos.y + 0.3, e.pos.z)).toFixed(2) };
        G.game.dev.god = false; return JSON.stringify(res);
      })()`).then(JSON.parse);
      console.log(field, 'knocked off:', JSON.stringify(r));
      check(r.fell === 1 && !r.alive, `${field}: your knockback can still throw a foe into the void (it dies)`);
      check(r.corpse && !r.overVoid && r.aboveFloor < 0.1 && r.dEdge < 8, `${field}: its body lies on the ground by the edge, ${r.dEdge} m from where it went over, and can be searched`);
      // a flyer shot down over the void
      const f = await p.eval(`(async () => {
        const H = window.__H, P = G.player, w = G.world, edge = H.edgeCells(); const c = edge[Math.floor(edge.length * 0.6)];
        const def = G.ENEMIES.find((d) => d.flyer && !d.special && !d.fields && (d.unlockK ?? 0) <= 2);
        const at = new THREE.Vector3(c.x + c.vx * 3, c.y + 2.5, c.z + c.vz * 3);
        const e = G.enemies.spawn(def, 9, at, {}); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        await H.sl(150); const was = w.voidBelow(e.pos.x, e.pos.y, e.pos.z);
        G.combat.damageEnemy(e, e.maxHp * 10, { src: 'bullet' });
        await H.sl(2500);
        const corpse = G.Inv.corpses.find((k) => k.e === e);
        return JSON.stringify({ def: def.id, was, alive: e.alive, corpse: !!corpse, overVoid: w.voidBelow(e.pos.x, e.pos.y, e.pos.z), aboveFloor: +(e.pos.y - w.floorBelow(e.pos.x, e.pos.y + 0.3, e.pos.z)).toFixed(2) });
      })()`).then(JSON.parse);
      console.log(field, 'flyer shot down over the void:', JSON.stringify(f));
      check(f.was && !f.alive && f.corpse && !f.overVoid && f.aboveFloor < 0.5, `${field}: a ${f.def} shot down over the void comes to lie on the ground (searchable)`);
    }
    // a body killed in the air over solid ground drops on to it
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player; H.enter('flooded'); await H.sl(400);
        const w = G.world, c = w.randomOpenCell(G.game.arng, (x, z, i) => !w.reachMask || w.reachMask[i]);
        const e = G.enemies.spawn(H.walkers()[1], 9, new THREE.Vector3(c.x, c.y, c.z), {}); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        await H.sl(300); e.pos.y += 3; e.vel.y = 0; G.combat.damageEnemy(e, e.maxHp * 10, { src: 'bullet' });
        await H.sl(1800);
        return JSON.stringify({ alive: e.alive, aboveFloor: +(e.pos.y - w.floorBelow(e.pos.x, e.pos.y + 0.3, e.pos.z)).toFixed(2) });
      })()`).then(JSON.parse);
      check(!r.alive && r.aboveFloor < 0.05, `a foe killed 3 m up in the air drops to the floor (${r.aboveFloor} m above it)`);
    }

    // ---------------- 3) the elements of the ground ----------------
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem; H.enter('flooded'); await H.sl(500);
        const w = G.world, out = {};
        G.game.dev.god = true;
        // stand somewhere in the water that covers the floor (no field patch: the flooded halls' own water), with nothing there to
        // stand on (a crate or a slab out of the water is dry: it is not in the nav, so look at the colliders)
        const wz = w.waterZones[0];
        let at = null; for (let k = 0; k < 400 && !at; k++) { const c = w.randomOpenCell(G.game.arng, (x, z, i) => (!w.reachMask || w.reachMask[i]) && Math.abs(w.nf[i] - ((wz.y || 0) - (wz.deep || 0))) < 0.1 && x > wz.x0 + 1 && x < wz.x1 - 1 && z > wz.z0 + 1 && z < wz.z1 - 1 && w.boxFree(x - 0.5, 0.05, z - 0.5, x + 0.5, 1.8, z + 0.5)); if (c) at = c; }
        if (!at) return JSON.stringify({ err: 'no water spot' });
        const place = async (x, y, z, kind) => {
          P.au = null; P.pos.set(x, y + 0.02, z); P.vel.set(0, 0, 0);
          const e = G.enemies.spawn(H.walkers()[0], 9, new THREE.Vector3(x + 1.2, y, z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.au = null;
          P.st.burn = kind === 'water' ? 3 : 0;
          await H.sl(900);
          out[kind] = { me: EL.playerAura(), foe: EL.auraOf(e), burnOut: P.st.burn <= 0 };
          e.alive = false; e.remove(); G.enemies.clear();
        };
        await place(at.x, at.y, at.z, 'water');
        // patches laid down here for the test: lava, an ice sheet, oil set alight
        const F = G.Fields, spot = (dx) => [at.x + dx, at.z];
        for (const [kind, dx] of [['lava', 0], ['ice', 0], ['oil', 0]]) {
          // (a dry stretch of floor: the walkway or the landing)
          let d = null; for (let k = 0; k < 400 && !d; k++) { const c = w.randomOpenCell(G.game.arng, (x, z, i) => (!w.reachMask || w.reachMask[i]) && !w.waterZones.some((q) => x > q.x0 - 3 && x < q.x1 + 3 && z > q.z0 - 3 && z < q.z1 + 3) && w.npen[i] < 0.1 && w.boxFree(x - 0.5, w.nf[i] + 0.05, z - 0.5, x + 0.5, w.nf[i] + 1.8, z + 0.5)); if (c) d = c; }
          if (!d) { out[kind] = { err: 'no dry spot' }; continue; }
          const f = F.add(w, kind, d.x - 2.5, d.z - 2.5, d.x + 2.5, d.z + 2.5, { y: d.y });
          if (kind === 'oil') F.ignite(f);
          await place(d.x, d.y, d.z, kind);
          w.fields.splice(w.fields.indexOf(f), 1); const lz = w.lavaZones.indexOf(f); if (lz >= 0) w.lavaZones.splice(lz, 1);
        }
        G.game.dev.god = false; P.st.burn = 0;
        return JSON.stringify(out);
      })()`).then(JSON.parse);
      console.log('ground:', JSON.stringify(r));
      if (r.err) check(false, 'ground: set up (' + r.err + ')');
      else {
        check(r.water.me === 'water' && r.water.foe === 'water' && r.water.burnOut, `the flooded halls' water: water on you and on the foe in it, and your burning goes out (${JSON.stringify(r.water)})`);
        check(r.lava.me === 'fire' && r.lava.foe === 'fire', `lava: fire on you and on the foe on it (${JSON.stringify(r.lava)})`);
        check(r.ice.me === 'ice' && r.ice.foe === 'ice', `an ice sheet: ice on you and on the foe on it (${JSON.stringify(r.ice)})`);
        check(r.oil.me === 'fire' && r.oil.foe === 'fire', `burning oil: fire on you and on the foe in it (${JSON.stringify(r.oil)})`);
      }
    }

    // ---------------- 4) the weather ----------------
    for (const [field, mood, el] of [['grave', 'rain', 'water'], ['grave', 'snow', 'ice'], ['halls', 'ember', 'fire'], ['frozen', 'snow', 'ice'], ['flooded', 'drip', 'water']]) {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem; H.enter('${field}', '${mood}'); await H.sl(300);
        const w = G.world; G.game.dev.god = true; P.au = null;
        const es = []; for (let i = 0; i < 3; i++) { const c = w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && !G.Weather.roofed(x, w.nf[k], z, 2.4)); /* (in the open: under a roof the sky does not reach) */ const e = G.enemies.spawn(H.walkers()[i], 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; es.push(e); }
        const other = '${el}' === 'fire' ? 'ice' : 'fire'; EL.setAura(es[2], other, 30); // (an element of the player's on a foe: the weather leaves it alone)
        await H.sl(3600);
        const res = { mood: w.sky && w.sky.id, el: w.sky && w.sky.el, me: EL.playerAura(), foes: es.map((e) => EL.auraOf(e)) };
        G.game.dev.god = false; G.enemies.clear(); return JSON.stringify(res);
      })()`).then(JSON.parse);
      console.log(field, mood, JSON.stringify(r));
      check(r.mood === mood && r.el === el && r.me === el && r.foes[0] === el && r.foes[1] === el && r.foes[2] === (el === 'fire' ? 'ice' : 'fire'), `${field} «${mood}»: ${el} on you and on every foe, but never over another element (${JSON.stringify(r.foes)})`);
    }
    // a mood that does not fall (fog) leaves nothing
    {
      const r = await p.eval(`(async () => { const H = window.__H, P = G.player; H.enter('grave', 'mist'); await H.sl(300); P.au = null; G.game.dev.god = true; await H.sl(3200); G.game.dev.god = false; return JSON.stringify({ el: G.world.sky.el || null, me: G.Elem.playerAura() }); })()`).then(JSON.parse);
      check(!r.el && !r.me, `grave «mist»: no element (${JSON.stringify(r)})`);
    }
    // lightning: a bolt on a wet foe is 漏電; on you it hurts and leaves volt; in a storm they keep coming while you fight
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem, Wx = G.Weather; H.enter('grave', 'rain'); await H.sl(300);
        const w = G.world; P.au = null; P.hp = P.stats.maxHp; P.invulnT = 0;
        const c = w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && Math.hypot(x - P.pos.x, z - P.pos.z) > 8);
        const e = G.enemies.spawn(H.walkers()[0], 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        await H.sl(3600);
        const wet = EL.auraOf(e), hp0 = e.hp;
        Wx.boltAt(e.pos.clone().setY(w.floorBelow(e.pos.x, e.pos.y + 1, e.pos.z)));
        await H.sl(200);
        const leak = (e.st.leak || 0) > 0, took = Math.round(hp0 - e.hp);
        const meWet = EL.playerAura(), mhp = P.hp; P.invulnT = 0;
        Wx.boltAt(P.pos.clone().setY(w.floorBelow(P.pos.x, P.pos.y + 1, P.pos.z)));
        await H.sl(200);
        const res = { wet, leak, took, meWet, hurt: Math.round(mhp - P.hp), myLeak: (P.elLeak || 0) > 0 };
        // natural bolts during a fight (a fresh foe that the bolts never wear down)
        G.game.dev.god = true; G.game.areaCleared = false;
        const c2 = w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && Math.hypot(x - P.pos.x, z - P.pos.z) > 6);
        const e2 = G.enemies.spawn(H.walkers()[1], 9, new THREE.Vector3(c2.x, c2.y, c2.z), { noLoot: true }); e2.state = 'idle'; e2.speed = 0; e2.atkCd = 99;
        const s0 = Wx.strikes; for (let i = 0; i < 300 && Wx.strikes - s0 < 1; i++) { await H.sl(100); for (const o of [e, e2]) if (o.alive) o.hp = o.maxHp; }
        res.natural = Wx.strikes - s0; G.game.dev.god = false; G.enemies.clear();
        return JSON.stringify(res);
      })()`).then(JSON.parse);
      console.log('lightning:', JSON.stringify(r));
      check(r.wet === 'water' && r.leak && r.took > 0, `a bolt on a foe wet from the rain: it takes damage and 漏電 runs through it (${r.took})`);
      check(r.meWet === 'water' && r.hurt > 0 && r.myLeak, `a bolt on you in the rain: it hurts (${r.hurt}) and 漏電 runs through you`);
      check(r.natural >= 1, `in the rain bolts come down by themselves while you fight (${r.natural} within 30 s)`);
    }
    // the falling icicles leave ice
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem; H.enter('frozen'); await H.sl(400);
        const w = G.world; P.au = null; P.hp = P.stats.maxHp; P.invulnT = 0;
        const e = G.enemies.spawn(H.walkers()[0], 9, new THREE.Vector3(P.pos.x + 0.6, P.pos.y, P.pos.z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.au = null;
        w.icicles.next = 99; w.icicles.falls = [{ p: new THREE.Vector3(P.pos.x, 0.02, P.pos.z), t: 0, T: 0.05, r: 1.8 }];
        await H.sl(400);
        const res = { me: EL.playerAura(), foe: EL.auraOf(e) }; G.enemies.clear(); return JSON.stringify(res);
      })()`).then(JSON.parse);
      check(r.me === 'ice' && r.foe === 'ice', `a falling icicle leaves ice on you and on the foe it hits (${JSON.stringify(r)})`);
    }
    // ---------------- 5) a guardian's hall: always the field's own sky, no weather ----------------
    {
      const r = await p.eval(`(async () => {
        const S = G.Sky, bad = [];
        for (const k of Object.keys(S.V)) for (const n of [5, 10, 15, 20]) for (const f of [null, 'rain', 'snow', 'ember', 'storm']) {
          S.force = f; const v = S.choose({ isBoss: true, field: k }, n, 'boss');
          if (v !== S.V[k][0] || v.el || v.bolt || v.flash || (v.p && v.p.length)) bad.push(k + ':' + n + ':' + f + '->' + (v && v.id));
        }
        // and in a real one: the graveyard's guardian with the rain asked for
        const H = window.__H, R = G.Run, GM = G.game, P = G.player; R._f0 = R._f0 || R.field; R.field = () => 'grave'; S.force = 'rain';
        let n = 1; while (!R.isBoss(n)) n++;
        G.enemies.clear(); GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; P.au = null; GM.enterArea(n, 'boss'); GM.dev = { speed: 1, god: true };
        await H.sl(2500);
        const w = G.world, res = { bad, isBoss: !!w.isBoss, mood: w.sky && w.sky.id, me: G.Elem.playerAura(), pending: G.Weather.pending(), strikes0: G.Weather.strikes };
        GM.dev.god = false; S.force = null; return JSON.stringify(res);
      })()`).then(JSON.parse);
      check(!r.bad.length, `a guardian's hall always draws the field's own sky, whatever is asked (${r.bad.slice(0, 4).join(', ')})`);
      check(r.isBoss && r.mood === 'clear' && !r.me && !r.pending, `the graveyard's guardian hall stays under the plain moon even with rain asked for: no element on you, no bolt (${JSON.stringify(r)})`);
    }
    check(p.errs.length === 0, `no page errors${p.errs.length ? ' — ' + p.errs.slice(0, 3).join(' | ').slice(0, 500) : ''}`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nHAZARD TEST FAILED (${fails.length})` : '\nHAZARD TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
