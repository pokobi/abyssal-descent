'use strict';
// Co-op: the new fields' devices (gimmick.js) on two screens, then three.
//  - both build the same devices in the same places;
//  - set off by the guest, they go off on the host (and the other way round); what they do to a monster is done once, where it lives;
//  - a pillar that fell lies on both sides; a crypt gate shut by one is shut for the other;
//  - someone who joins later finds the spent ones spent (the pillar lying where it fell).
//   node tests/coop/device_test.js
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9441;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  let h, g;
  try {
    const q = '&local=1&lat=40&jit=20', room = 'D' + Math.random().toString(36).slice(2, 6).toUpperCase();
    h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await sleep(300);
    g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    await h.eval("G.save.data.settings.volume = 0; G.sfx.setVolume(0); 1"); await g.eval("G.save.data.settings.volume = 0; G.sfx.setVolume(0); 1");
    await h.eval(`G.Coop.diff = { id: 'hard', lv: 0 }; G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1`);
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    const go = async (field, area) => {
      await h.eval(`G.Run.field = () => '${field}'; 1`); await g.eval(`G.Run.field = () => '${field}'; G.Coop.fpOk = undefined; 1`);
      await h.eval(`G.game.area = ${area - 1}; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.enemies.clear(); G.Coop.go(${area}, 'combat'); 1`);
      await g.until(`G.game.area === ${area} && G.game.stage === 'combat' && G.Coop.fpOk !== undefined`, 25000);
      await sleep(400);
      await h.eval('G.enemies.list.slice().forEach((e) => { if (e.alive && !e.custom) { e.noReward = true; e.alive = false; e.remove && e.remove(); } }); G.enemies.list.length = 0; G.game.objective = null; G.game.waves = null; 1');
      return g.eval('G.Coop.fpOk');
    };
    const sig = (p) => p.eval("JSON.stringify((G.world.gims || []).map((g) => [g.kind, Math.round((g.x ?? g.px ?? g.wx) * 10), Math.round(g.z * 10)]).concat((G.world.doors || []).map((d) => ['gate', d.plane, d.lo])))");
    // a monster standing still on the host (the guest sees it as a copy)
    const foe = (x, z) => h.eval(`(() => { const d = G.ENEMIES.filter((d) => !d.flyer && !d.boss && G.ENEMY_BY_ID[d.id] && !d.revive)[2]; const e = G.enemies.spawn(d, 9, new THREE.Vector3(${x}, 0, ${z}), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.elite = false; (window.__F = window.__F || []).push(e); return window.__F.length - 1; })()`);
    const fst = (i) => h.eval(`JSON.stringify((() => { const e = window.__F[${i}]; return { hp: e.alive ? e.hp / e.maxHp : 0, alive: e.alive, stun: e.st.stun || 0, x: e.pos.x, z: e.pos.z, au: G.Elem.auraOf(e), nid: e._nid }; })())`).then(JSON.parse);
    const used = (p, i) => p.eval(`!!(G.Gim.list[${i}] && G.Gim.list[${i}].used)`);
    const e0 = () => h.errs.length + g.errs.length;

    const cases = [
      // field, area, what to check on the host's monster after the guest sets off device 0 (it, the monster's spot)
      { field: 'dusk', n: 2, kind: 'pillar', spot: 'lane', wait: 3.0, ok: (s) => s.hp > 0.45 && s.hp < 0.75, what: 'crushed once (about 40 %)' },
      { field: 'hamlet', n: 2, kind: 'bell', spot: 'near', wait: 0.9, ok: (s) => s.stun > 0.2 && s.hp > 0.99, what: 'staggered' },
      { field: 'castle', n: 2, kind: 'oil', spot: 'zone', wait: 1.2, ok: (s) => s.hp < 0.95 && s.hp > 0.2, what: 'scalded once' },
      { field: 'flooded', n: 4, kind: 'sluice', spot: 'water', wait: 2.4, ok: (s, s0, gm) => (s.x - s0.x) * gm.sgn > 3, what: 'swept along' },
      { field: 'foundry', n: 2, kind: 'crucible', spot: 'imp', wait: 1.5, ok: (s) => s.hp < 0.8 && s.hp > 0.3, what: 'burnt once (about 35 %)' },
      { field: 'sanctum', n: 2, kind: 'gale', spot: 'galeLane', wait: 3.2, ok: (s, s0, gm) => !s.alive || ((s.x - s0.x) * gm.dx + (s.z - s0.z) * gm.dz) > 5, what: 'driven off' },
    ];
    const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
    for (const c of cases) {
      if (only && !only.includes(c.field)) continue;
      const before = e0();
      // (each co-op run draws its own seed: walk on until an area has the device)
      let fp = false;
      for (let a = c.n; a < c.n + 8; a++) { fp = await go(c.field, a); if (await h.eval(`(G.world.gims || []).some((g) => g.kind === '${c.kind}')`)) break; }
      const [sh, sg] = [await sig(h), await sig(g)];
      check(fp && sh === sg && JSON.parse(sh).length > 0, `${c.field}: the same world and the same devices on both sides (${JSON.parse(sh).length})`);
      const gm = JSON.parse(await h.eval(`JSON.stringify((() => { const g = G.Gim.list.find((g) => g.kind === '${c.kind}'); return { i: g.i, x: g.x ?? g.px ?? g.wx, z: g.z, dx: g.dx, dz: g.dz, sgn: g.sgn, zone: g.zone, imp: g.imp, uy: g.uy }; })())`));
      const spot = { lane: [gm.x + gm.dx * 4, gm.z + gm.dz * 4], near: [gm.x + 6, gm.z + 4], zone: gm.zone && [(gm.zone.x0 + gm.zone.x1) / 2, (gm.zone.z0 + gm.zone.z1) / 2], water: [gm.x + gm.sgn * 8, gm.z + 0.4], imp: gm.imp && [gm.imp.x + 0.5, gm.imp.z], galeLane: [gm.x + gm.dx * 5, gm.z + gm.dz * 5] }[c.spot];
      await h.eval('window.__F = []; 1');
      const fi = await foe(spot[0], spot[1]);
      await sleep(600);
      const s0 = await fst(fi);
      await g.eval(`G.Gim.trigger(G.Gim.list[${gm.i}], { by: 'use' }); 1`);
      let seen = false; try { await h.until(`!!G.Gim.list[${gm.i}].used`, 3000); seen = true; } catch (e) { /* */ }
      check(seen, `${c.field}: set off by the guest, it goes off on the host`);
      // (what it does comes at its own moment on the host's clock: wait for it, a while past the moment)
      let s = await fst(fi);
      for (let k = 0; k < Math.ceil((c.wait + 2.5) / 0.15) && !c.ok(s, s0, gm); k++) { await sleep(150); s = await fst(fi); }
      check(c.ok(s, s0, gm), `${c.field}: the host's monster is ${c.what} (${JSON.stringify({ hp: +s.hp.toFixed(2), stun: +s.stun.toFixed(2), moved: +Math.hypot(s.x - s0.x, s.z - s0.z).toFixed(1), alive: s.alive })})`);
      if (!c.ok(s, s0, gm)) console.log('     ', JSON.stringify({ spot, s0, gm, t: await h.eval(`G.Gim.list[${gm.i}].t`), foes: await h.eval('G.Gim.foes().length'), n: await h.eval('G.enemies.list.length'), st: await h.eval('G.game.state + "/" + G.game.stage + "/" + G.game.areaCleared + "/" + G.game.time.toFixed(2)') }));
      // the guest's copy of it shows the same
      if (s.alive) {
        await sleep(700);
        const gs = JSON.parse(await g.eval(`JSON.stringify((() => { const e = G.enemies.list.find((e) => e._nid === ${s.nid}); return e ? { hp: e.alive ? e.hp / e.maxHp : 0, x: e.pos.x, z: e.pos.z } : null; })())`));
        const hs = await fst(fi);
        // (a burning one keeps losing health and a swept one keeps moving: the copy follows a moment behind)
        const okH = hs.hp > 0.97 ? gs && gs.hp > 0.97 : gs && gs.hp < 0.97;
        const mv = Math.hypot(hs.x - s0.x, hs.z - s0.z), okP = gs && (mv < 1 ? Math.hypot(gs.x - hs.x, gs.z - hs.z) < 1 : Math.hypot(gs.x - s0.x, gs.z - s0.z) > mv * 0.5);
        check(okH && okP, `${c.field}: and the guest sees it so ${JSON.stringify({ g: gs && { hp: +gs.hp.toFixed(2) }, h: +hs.hp.toFixed(2) })}`);
      }
      // a second device set off by the host goes off for the guest
      const n2 = await h.eval(`G.Gim.list.findIndex((g, i) => i !== ${gm.i} && !g.used)`);
      if (n2 >= 0) {
        await h.eval(`G.Gim.trigger(G.Gim.list[${n2}], { by: 'use' }); 1`);
        let s2 = false; try { await g.until(`!!G.Gim.list[${n2}].used`, 3000); s2 = true; } catch (e) { /* */ }
        check(s2, `${c.field}: set off by the host, it goes off for the guest`);
      }
      if (c.kind === 'pillar') {
        await sleep(2500);
        const lie = (p) => p.eval(`(() => { const gs = G.Gim.list.filter((g) => g.kind === 'pillar' && g.used); return gs.length > 0 && gs.every((g) => g.lying && g.lying.alive && g.cols.filter((k) => k !== g.lying && k.alive).length === 0); })()`);
        check(await lie(h) && await lie(g), 'dusk: the fallen pillars lie as walls on both sides');
      }
      await sleep(600);
      check(e0() === before, `${c.field}: no errors` + (e0() > before ? ' ' + h.errs.concat(g.errs).slice(-2).join(' | ').slice(0, 300) : ''));
    }
    // ---- the crypt gates
    if (!only || only.includes('catacombs')) {
      await go('catacombs', 3);
      check(JSON.parse(await sig(h)).length > 0 && await sig(h) === await sig(g), 'catacombs: the same gates on both sides');
      await g.eval('G.Strata.closeDoor(G.Strata.doors[0]); 1');
      await sleep(600);
      check(await h.eval('G.Strata.doors[0].state === "closed" && G.Strata.doors[0].col.alive === true'), 'catacombs: a gate the guest shuts is shut for the host');
      await h.eval('G.Strata.openDoor(G.Strata.doors[0]); 1');
      await sleep(600);
      check(await g.eval('G.Strata.doors[0].state === "open" && G.Strata.doors[0].col.alive === false'), 'catacombs: opened again by the host, open for the guest');
      await h.eval('G.Strata.closeDoor(G.Strata.doors[1]); 1');
      await sleep(600);
      check(await g.eval('G.Strata.doors[1].state === "closed"'), 'catacombs: a gate the host shuts is shut for the guest');
    }
    // ---- a late joiner, in an area whose pillars have fallen and whose gate is shut
    if (!only || only.includes('late')) {
      await go('dusk', 5);
      await h.eval('for (const g of G.Gim.list) G.Gim.trigger(g, { by: "use" }); 1');
      await sleep(3200);
      // (the newcomer is told to build this field before it joins: it opens the room itself once the override is in)
      const t = await ch.page(`http://127.0.0.1:${PORT}/coop.html?name=Third${q}`);
      await t.until('window.G && G.Coop && G.Coop.open && G.game.state === "title"', 90000);
      await t.eval(`G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.Run.field = () => 'dusk'; G.Coop.open('${room}', false, 'Third'); 1`);
      await t.until('G.Coop.id === 2', 60000);
      let inArea = false; try { await t.until("G.game.area === 5 && G.game.stage === 'combat' && !!G.world && (G.world.gims || []).length > 0", 40000); inArea = true; } catch (e) { /* */ }
      check(inArea, 'late join: the third player arrives in the area');
      if (inArea) {
        let spent = false; try { await t.until('G.Gim.list.length > 0 && G.Gim.list.every((g) => g.used)', 8000); spent = true; } catch (e) { /* */ }
        check(spent, 'late join: the devices already spent are spent for them');
        check(await t.eval('G.Gim.list.filter((g) => g.kind === "pillar").every((g) => g.lying && g.lying.alive && g.cols.filter((k) => k !== g.lying && k.alive).length === 0)'), 'late join: the pillars lie where they fell');
        check(!t.errs.length, 'late join: no errors ' + t.errs.slice(0, 2).join(' | ').slice(0, 300));
      }
    }
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 3).join(' | ').slice(0, 400));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 3).join(' | ').slice(0, 400));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nCOOP DEVICE TEST FAILED (${fails.length})` : '\nCOOP DEVICE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
