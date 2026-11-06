'use strict';
// The new fields' own devices (gimmick.js, gimmick_a.js, gimmick_b.js, the crypt gates of fieldgen_t2.js):
//  1. every field builds its device in area after area, where it can be reached, with its lane / patch / circle kept clear;
//  2. each one, set off with monsters inside and outside what it reaches, hits exactly the ones inside (and you, where it says so);
//  3. shots, hitscan, blasts and blows reach them; the interact key works them; a pillar that fell is a wall the monsters walk round;
//  4. the mid-area save brings back the spent ones as they were; no errors on the way.
//   node tests/device_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9961;
const FIELDS = { hamlet: 'bell', dusk: 'pillar', castle: 'oil', flooded: 'sluice', foundry: 'crucible', sanctum: 'gale', catacombs: 'gate' };
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'hard', lv: 0 }, 0); G.game.seed = 424242; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(500);
    // helpers in the page: build an area of a field, foes standing still, how the foes are
    await p.eval(`(() => {
      const GM = G.game, V = (x, y, z) => new THREE.Vector3(x, y, z);
      window.T = {
        enter(field, n) { G.Run.field = () => field; G.Sky.force = null; G.enemies.clear(); GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; GM.enterArea(n, 'combat'); G.enemies.clear(); GM.objective = null; GM.waves = null; GM.dev = { god: true, speed: 1 }; GM.areaCleared = false; return G.world; },
        foes(pts) { const defs = G.ENEMIES.filter((d) => !d.flyer && !d.boss && G.ENEMY_BY_ID[d.id] && !d.revive); return pts.map((c, i) => { const e = G.enemies.spawn(defs[(i * 3) % defs.length], 9, V(c[0], c[1] || 0, c[2]), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.elite = false; return e; }); },
        st(list) { return list.map((e) => ({ hp: e.alive ? e.hp / e.maxHp : 0, alive: e.alive, stun: e.st.stun || 0, burn: e.st.burn || 0, au: G.Elem.auraOf(e), x: e.pos.x, z: e.pos.z, y: e.pos.y })); },
        me(x, y, z) { const P = G.player; P.pos.set(x, y, z); P.vel.set(0, 0, 0); P.hp = P.stats.maxHp; P.st.burn = 0; P.au = null; P.invulnT = 0; P.stats.dodge = 0; },
        cell(x, z) { return G.world.navIdx(x, z); },
        // is there a cell you can walk to from the area's start within d metres (level) of p and on a floor no more than dy below it?
        reachNear(p, d, dy) {
          const w = G.world, s = w.spawn, from = w.navIdx(s.x, s.z, (s.y || 0) + 0.5); if (from < 0) return false;
          const seen = w.reach(from);
          for (let z = Math.floor(p.z - d); z <= Math.ceil(p.z + d); z++) for (let x = Math.floor(p.x - d); x <= Math.ceil(p.x + d); x++) {
            if (Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) > d) continue;
            for (let k = 0; k < (w.L || 1); k++) { const i = w.navIdx(x + 0.5, z + 0.5) + k * (w.N || 0); if (i < 0 || !seen[i] || w.nb[i]) continue; const f = w.nf[i]; if (f <= p.y + 0.2 && f >= p.y - dy) return true; }
          }
          return false;
        },
        // a point d metres (level) from (x, z) that lies inside the area, a few metres in from its walls
        ring(x, z, d, a0) { const w = G.world; for (let a = a0 || 0; a < (a0 || 0) + 6.3; a += 0.2) { const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (px > 3 && px < w.W - 3 && pz > 3 && pz < w.D - 3) return [px, 0, pz]; } return null; },
        // colliders (not the device's own) in a box
        others(g, x0, y0, z0, x1, y1, z1) { return G.world.query(x0, y0, z0, x1, y1, z1).filter((c) => c.gim !== g && !c.navIgnore).length; },
      };
      window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
      const ce = console.error; console.error = function () { window.__errs.push([...arguments].map(String).join(' ')); return ce.apply(console, arguments); };
      return 1;
    })()`);
    const ev = async (js) => JSON.parse(await p.eval(`JSON.stringify((() => { ${js} })())`));

    // ================================================================ 1. building, area after area
    const AREAS = [2, 3, 4, 5, 6, 8, 9, 10];
    for (const [field, kind] of Object.entries(FIELDS)) {
      const r = await ev(`
        const out = [];
        for (const n of ${JSON.stringify(AREAS)}) {
          const w = T.enter('${field}', n);
          if ('${kind}' === 'gate') {
            const ds = (w.doors || []);
            out.push({ n, c: ds.length, bad: ds.filter((d) => d.state !== 'open' || d.col.alive || d.hi - d.lo !== 3).length,
              reach: ds.filter((d) => T.reachNear({ x: d.plane - 1.6, y: 0, z: (d.lo + d.hi) / 2 }, 1.2, 1) && T.reachNear({ x: d.plane + 1.6, y: 0, z: (d.lo + d.hi) / 2 }, 1.2, 1)).length });
            continue;
          }
          const gs = (w.gims || []).filter((g) => g.kind === '${kind}');
          const inside = gs.every((g) => { const x = g.x ?? g.px ?? g.wx, z = g.z; return x >= 0 && x <= w.W && z > 0 && z < w.D; });
          let reach = 0, clear = 0;
          for (const g of gs) {
            if (g.use) reach += T.reachNear(g.use, (g.useD || 3.6) - 1.2, 3.2) ? 1 : 0; else reach++;
            if (g.kind === 'pillar') { const L = G.Gim.PIL.laneL, x0 = Math.min(g.x, g.x + g.dx * L) - (g.dx ? 0 : 1.2), x1 = Math.max(g.x, g.x + g.dx * L) + (g.dx ? 0 : 1.2), z0 = Math.min(g.z, g.z + g.dz * L) - (g.dz ? 0 : 1.2), z1 = Math.max(g.z, g.z + g.dz * L) + (g.dz ? 0 : 1.2);
              // the lane past the plinth: nothing standing in it at body height
              const a0 = 1.0; const bx0 = g.dx > 0 ? g.x + a0 : x0, bx1 = g.dx < 0 ? g.x - a0 : x1, bz0 = g.dz > 0 ? g.z + a0 : z0, bz1 = g.dz < 0 ? g.z - a0 : z1;
              clear += T.others(g, bx0, 0.3, bz0, bx1, 1.8, bz1) === 0 ? 1 : 0; }
            else if (g.kind === 'oil') clear += T.others(g, g.zone.x0 + 0.05, 0.2, g.zone.z0, g.zone.x1 - 0.05, 1.8, g.zone.z1) === 0 ? 1 : 0;
            else if (g.kind === 'crucible') clear += T.others(g, g.imp.x - 2.5, 0.3, g.imp.z - 2.5, g.imp.x + 2.5, 1.8, g.imp.z + 2.5) === 0 ? 1 : 0;
            else if (g.kind === 'gale') { let ok = 0; for (let s = 2; s < g.len - 6; s += 1) { const i = T.cell(g.x + g.dx * s, g.z + g.dz * s); if (i >= 0 && w.nf[i] > -1) ok++; } clear += ok >= Math.max(3, (g.len - 8) * 0.7) ? 1 : 0; }
            else if (g.kind === 'sluice') clear += (w.waterZones || []).some((q) => g.z - 4 > q.z0 && g.z + 4 < q.z1) ? 1 : 0;
            else clear++;
          }
          out.push({ n, c: gs.length, inside, reach, clear });
        }
        return out;`);
      const tot = r.reduce((a, b) => a + b.c, 0), areasWith = r.filter((x) => x.c > 0).length;
      console.log(`     ${field}: ${r.map((x) => `${x.n}:${x.c}`).join(' ')}`);
      const min = { bell: [1, 8], pillar: [2, 8], oil: [1, 6], sluice: [1, 7], crucible: [1, 7], gale: [1, 7], gate: [2, 8] }[kind];
      check(r.every((x) => x.c >= (kind === 'bell' || kind === 'pillar' ? 1 : 0)) && areasWith >= min[1] && tot >= areasWith * min[0], `${field}: the ${kind} is built in ${areasWith}/${r.length} areas (${tot} in all)`);
      if (kind === 'gate') {
        check(r.every((x) => x.bad === 0), `${field}: every gate starts open, 3 m wide`);
        check(r.every((x) => x.reach === x.c), `${field}: both sides of every gate can be walked to`);
      } else {
        check(r.every((x) => x.inside !== false), `${field}: inside the area`);
        check(r.every((x) => x.reach === x.c), `${field}: you can get to where you work it (${r.map((x) => x.reach + '/' + x.c).join(' ')})`);
        check(r.every((x) => x.clear === x.c), `${field}: what it reaches is kept clear (${r.map((x) => x.clear + '/' + x.c).join(' ')})`);
      }
    }
    const errs0 = await ev('return window.__errs.slice()');
    check(!errs0.length, 'no errors while building ' + errs0.slice(0, 2).join(' | '));

    // ================================================================ 2. what each does, inside and outside
    // (waits are counted on the game's own clock: under load it runs behind the wall clock, and what the devices do follows it)
    const wait = async (sec) => {
      const t0 = +(await p.eval('G.game.time'));
      try { await p.until(`G.game.time >= ${t0 + sec}`, sec * 6000 + 8000); }
      catch (e) { // (the clock stopped: say why)
        console.log('     clock stopped:', await p.eval("JSON.stringify({ state: G.game.state, stage: G.game.stage, dead: G.player.dead, hidden: document.hidden, trans: G.game.transitioning, t: G.game.time, modal: !!(G.ui.modalOpen && G.ui.modalOpen()), errs: (window.__errs || []).slice(-2) })"));
        throw e;
      }
    };
    // the bell: monsters out to 25 m stagger at each toll, one at 30 m does not; you are untouched
    {
      await ev("T.enter('hamlet', 2); return 1");
      const g = await ev("const g = G.Gim.list.find((g) => g.kind === 'bell'); return { x: g.x, z: g.z }");
      await ev(`window.F = T.foes([T.ring(${g.x}, ${g.z}, 7, 0), T.ring(${g.x}, ${g.z}, 14, 2), T.ring(${g.x}, ${g.z}, 22, 4), T.ring(${g.x}, ${g.z}, 29, 1)]); T.me(${g.x + 3}, 0, ${g.z + 3}); G.game.dev.god = false; return 1`);
      const hp0 = await ev('return G.player.hp');
      await ev("G.Gim.trigger(G.Gim.list.find((g) => g.kind === 'bell'), { by: 'use' }); return 1");
      await wait(0.75);
      const s1 = await ev('return T.st(F)');
      await wait(2.4);
      const s2 = await ev('return T.st(F)');
      // (each toll's wave: which monsters it reached, and so staggered)
      const hit = await ev("const g = G.Gim.list.find((g) => g.kind === 'bell'); return g.hits.map((h) => F.map((e) => h.has(e)))");
      check(hit.length === 3 && hit.every((h) => h[0] && h[1] && h[2] && !h[3]), `bell: each of its three tolls staggers the three within 25 m and not the one at 29 m (${JSON.stringify(hit)})`);
      check(s1[0].stun > 0.1 && s1[3].stun === 0 && s2[3].stun === 0, `bell: they really are staggered (${s1.map((x) => x.stun.toFixed(2)).join(' ')})`);
      check(s2.slice(0, 3).every((x) => x.hp > 0.99), 'bell: it hurts nobody');
      check(await ev(`return G.player.hp === ${hp0}`), 'bell: nothing happens to you');
    }
    // the pillar: crushed in its lane (40 %), not beside it; you take 15 % in it; it lies as a wall afterwards
    {
      await ev("T.enter('dusk', 2); G.game.dev.god = false; return 1");
      const g = await ev("const g = G.Gim.list.find((g) => g.kind === 'pillar'); return { x: g.x, z: g.z, dx: g.dx, dz: g.dz }");
      const at = (s, l) => [g.x + g.dx * s + g.dz * l, 0, g.z + g.dz * s - g.dx * l];
      await ev(`window.F = T.foes([${JSON.stringify(at(3.5, 0))}, ${JSON.stringify(at(7.2, 0.4))}, ${JSON.stringify(at(5, 2.9))}]); const m = ${JSON.stringify(at(5.6, -0.3))}; T.me(m[0], 0, m[2]); return 1`);
      const hp0 = await ev('return G.player.hp / G.player.stats.maxHp');
      // a grenade-sized blast at its foot and a blow: it goes over
      await ev(`G.combat.explode(new THREE.Vector3(${g.x - g.dx * 1.8}, 0.6, ${g.z - g.dz * 1.8}), 1.5, 5, { noFx: true }); return 1`);
      check(await ev("return !G.Gim.list.find((g) => g.kind === 'pillar').used"), 'pillar: one blast is not enough');
      await ev(`G.Gim.swing(new THREE.Vector3(${g.x - g.dx * 1.6}, 1.5, ${g.z - g.dz * 1.6}), 2.5, new THREE.Vector3(${g.dx}, 0, ${g.dz}), 0.45, 'melee'); return 1`);
      check(await ev("return G.Gim.list.find((g) => g.kind === 'pillar').used"), 'pillar: a blast and a heavy blow topple it');
      await ev('G.player.pos.set(G.player.pos.x, 0, G.player.pos.z); return 1');
      await wait(2.6);
      const s = await ev('return T.st(F)');
      const hp1 = await ev('return G.player.hp / G.player.stats.maxHp');
      check(s[0].hp < 0.7 && s[1].hp < 0.7, `pillar: the two in its lane are crushed (${s.map((x) => x.hp.toFixed(2)).join(' ')})`);
      check(s[2].hp > 0.99, 'pillar: the one beside the lane is untouched');
      check(hp0 - hp1 > 0.05 && hp0 - hp1 < 0.3, `pillar: you in the lane take about 15 % (${(hp0 - hp1).toFixed(3)})`);
      const nav = await ev(`const g = G.Gim.list.find((g) => g.kind === 'pillar'), w = G.world, c = g.lying;
        const mid = [g.x + g.dx * 5, g.z + g.dz * 5], side = [mid[0] + g.dz * 2.2, mid[1] - g.dx * 2.2];
        const a = w.navIdx(side[0], side[1]), b = w.navIdx(mid[0], mid[1]);
        const inside = F.filter((e) => e.alive && e.pos.x > c.x0 && e.pos.x < c.x1 && e.pos.z > c.z0 && e.pos.z < c.z1).length;
        const me = G.player.pos, meIn = me.x > c.x0 && me.x < c.x1 && me.z > c.z0 && me.z < c.z1 && me.y < c.y1 - 0.1;
        return { lying: !!c && c.alive, upright: g.cols.filter((k) => k !== c && k.alive).length, step: w.canStep(a, b), inside, meIn };`);
      check(nav.lying && nav.upright === 0, 'pillar: the standing collider is gone, the fallen one is there');
      check(nav.step === false, 'pillar: monsters cannot walk across the fallen shaft');
      check(nav.inside === 0 && !nav.meIn, 'pillar: nobody is left inside the fallen shaft');
    }
    // the cauldron: the patch below scalds and burns (monsters and you), a monster beside it is untouched; the oil burns about 9 s
    {
      await ev("T.enter('castle', 2); G.game.dev.god = false; return 1");
      const g = await ev("const g = G.Gim.list.find((g) => g.kind === 'oil'); return { zone: g.zone, imp: g.imp, px: g.px, y: g.y, z: g.z, sgn: g.sgn }");
      const zc = [(g.zone.x0 + g.zone.x1) / 2, (g.zone.z0 + g.zone.z1) / 2];
      await ev(`window.F = T.foes([[${zc[0]}, 0, ${zc[1] + 1}], [${zc[0]}, 0, ${g.zone.z1 + 2.5}]]); T.me(${zc[0] + 0.8}, 0, ${zc[1] - 2}); return 1`);
      const hp0 = await ev('return G.player.hp / G.player.stats.maxHp');
      await ev(`const g = G.Gim.list.find((g) => g.kind === 'oil'); G.combat.explode(g.hb[0].p.clone(), 1.2, 5, { noFx: true }); return g.used`);
      check(await ev("return G.Gim.list.find((g) => g.kind === 'oil').used"), 'cauldron: a blast at the pot tips it');
      await wait(1.3);
      const s = await ev('return T.st(F)'), me = await ev('const P = G.player; return { hp: P.hp / P.stats.maxHp, burn: P.st.burn || 0 }');
      const f = await ev("const f = (G.world.fields || []).find((f) => f.kind === 'oil' && f.burnT > 0); return f ? f.burnT : -1");
      check(s[0].hp < 0.95 && s[0].burn > 0, `cauldron: the monster in the patch is scalded and burning (${s[0].hp.toFixed(2)})`);
      check(s[1].hp > 0.99 && !(s[1].burn > 0), 'cauldron: the one past its end is untouched');
      check(hp0 - me.hp > 0.03 && me.burn > 0, `cauldron: you in the patch are scalded and set alight (${(hp0 - me.hp).toFixed(3)})`);
      check(f > 7 && f <= 9, `cauldron: the oil burns on (${f.toFixed(1)} s left)`);
    }
    // the sluice: monsters in the water in its lane are swept along and soaked; one outside the lane stays; you are carried in it, not on a walkway
    {
      await ev("T.enter('flooded', 4); G.game.dev.god = true; return 1");
      const g = await ev("const g = G.Gim.list.find((g) => g.kind === 'sluice'); return { wx: g.wx, z: g.z, sgn: g.sgn, ux: g.ux, uy: g.uy, uz: g.uz }");
      const X = (d) => g.wx + g.sgn * d;
      await ev(`window.F = T.foes([[${X(7)}, 0, ${g.z + 0.5}], [${X(12)}, 0, ${g.z - 2.6}], [${X(9)}, 0, ${g.z + 8}]]); T.me(${X(5)}, 0, ${g.z - 1.5}); return 1`);
      const p0 = await ev('return { f: T.st(F), me: G.player.pos.x }');
      // the wheel, turned with the key (one press, keep looking at it)
      await ev(`const g = G.Gim.list.find((g) => g.kind === 'sluice'), P = G.player; const me = { x: P.pos.x, z: P.pos.z }; P.pos.set(g.ux - g.fx * 1.6, g.uy, g.uz - g.fz * 1.6); P.vel.set(0, 0, 0);
        const d = g.use.clone().sub(P.pos.clone().setY(P.pos.y + 1.6)); P.yaw = Math.atan2(-d.x, -d.z); P.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
        window.__me = me; window.__hold = setInterval(() => { P.vel.set(0, 0, 0); }, 16); G.Gim.prompt(g.it, { hit: (k) => k === 'interact' }); return !!G.game.search`);
      await wait(1.8);
      check(await ev("return G.Gim.list.find((g) => g.kind === 'sluice').used"), 'sluice: turning the wheel with the key opens it');
      await ev('clearInterval(window.__hold); T.me(window.__me.x, 0, window.__me.z); return 1');
      await wait(2.6);
      const p1 = await ev('return { f: T.st(F), me: G.player.pos.x }');
      const moved = (i) => (p1.f[i].x - p0.f[i].x) * g.sgn;
      check(moved(0) > 3 && moved(1) > 3, `sluice: the two in its lane are swept along (${moved(0).toFixed(1)}, ${moved(1).toFixed(1)} m)`);
      check(p1.f[0].au === 'water' && p1.f[0].hp < 1, 'sluice: and soaked (water), a little hurt');
      check(Math.abs(moved(2)) < 0.3, 'sluice: the one outside the lane stays put');
      check((p1.me - p0.me) * g.sgn > 1, `sluice: you in the water in its lane are carried (${((p1.me - p0.me) * g.sgn).toFixed(1)} m)`);
    }
    // the crucible: what it lands on burns (35 %), not past its circle; you in it take a fifth and burn; the pool burns you
    {
      await ev("T.enter('foundry', 2); G.game.dev.god = false; return 1");
      const g = await ev("const g = G.Gim.list.find((g) => g.kind === 'crucible'); return { x: g.x, y: g.y, z: g.z, imp: g.imp }");
      await ev(`window.F = T.foes([[${g.imp.x + 0.6}, 0, ${g.imp.z}], [${g.imp.x}, 0, ${g.imp.z + 4.4}]]); T.me(${g.imp.x - 1.5}, 0, ${g.imp.z - 0.8}); return 1`);
      const hp0 = await ev('return G.player.hp / G.player.stats.maxHp');
      // a real shot up at it from below (a hitscan round from the gun in hand)
      const hit = await ev(`const g = G.Gim.list.find((g) => g.kind === 'crucible'), o = new THREE.Vector3(${g.x} + 6, 1.6, ${g.z}), t = new THREE.Vector3(${g.x}, ${g.y}, ${g.z}), d = t.clone().sub(o).normalize();
        const wh = G.world.raycast(o, d, 30); const w = G.player.weapon, s = G.weapons.stats(w); G.weapons.traceShot(w, s, o, d, o, 1); return { gim: !!(wh && wh.c.gim === g), used: g.used }`);
      check(hit.gim && hit.used, 'crucible: a shot strikes it (and sets it off)');
      await wait(1.5);
      const s = await ev('return T.st(F)'), me = await ev('const P = G.player; return { hp: P.hp / P.stats.maxHp, burn: P.st.burn || 0 }');
      check(s[0].hp < 0.75 && s[0].au === 'fire', `crucible: the monster under it is burnt (${s[0].hp.toFixed(2)})`);
      check(s[1].hp > 0.99, 'crucible: the one past its circle is untouched');
      check(hp0 - me.hp > 0.1 && me.burn > 0, `crucible: you under it take about a fifth and burn (${(hp0 - me.hp).toFixed(3)})`);
      await ev('G.player.hp = G.player.stats.maxHp; G.player.st.burn = 0; G.player.grounded = true; return 1');
      await wait(1.2);
      check(await ev('return G.player.hp < G.player.stats.maxHp && G.player.st.burn > 0'), 'crucible: standing in the molten pool burns you');
      await ev('G.player.hp = G.player.stats.maxHp; G.player.st.burn = 0; return 1');
    }
    // the gale: monsters in its way are driven to the edge (and over it), one beside it is not; you are not moved
    {
      await ev("T.enter('sanctum', 2); G.game.dev.god = true; return 1");
      const g = await ev("const g = G.Gim.list.find((g) => g.kind === 'gale'); return { x: g.x, z: g.z, dx: g.dx, dz: g.dz, len: g.len }");
      const at = (s, l) => [g.x + g.dx * s + g.dz * l, 0, g.z + g.dz * s - g.dx * l];
      await ev(`window.F = T.foes([${JSON.stringify(at(5, 0))}, ${JSON.stringify(at(8, 1.6))}, ${JSON.stringify(at(6, 5.5))}]); const m = ${JSON.stringify(at(4, -1))}; T.me(m[0], 0, m[2]); return 1`);
      const p0 = await ev('return { f: T.st(F), me: [G.player.pos.x, G.player.pos.z] }');
      await ev("const g = G.Gim.list.find((g) => g.kind === 'gale'); G.Gim.hit(g, 10, 'bullet', g.hb[0].p.clone()); return 1");
      await wait(3.2);
      const p1 = await ev('return { f: T.st(F), me: [G.player.pos.x, G.player.pos.z] }');
      const along = (i) => (p1.f[i].x - p0.f[i].x) * g.dx + (p1.f[i].z - p0.f[i].z) * g.dz;
      check([0, 1].every((i) => !p1.f[i].alive || along(i) > 5), `gale: the two in its way are driven off (${[0, 1].map((i) => p1.f[i].alive ? along(i).toFixed(1) + ' m' : 'fell').join(', ')})`);
      check(p1.f[2].alive && Math.abs(along(2)) < 0.3, 'gale: the one beside it is not moved');
      check(Math.hypot(p1.me[0] - p0.me[0], p1.me[1] - p0.me[1]) < 0.2, 'gale: you are not moved');
    }
    // the crypt gates: shut, open again, not on someone, battered down
    {
      await ev("T.enter('catacombs', 2); G.game.dev.god = true; return 1");
      const d = await ev('const d = G.Strata.doors[0]; return { x: d.plane, lo: d.lo, hi: d.hi }');
      await ev(`T.me(${d.x - 3}, 0, ${(d.lo + d.hi) / 2}); return 1`);
      check(await ev('const d = G.Strata.doors[0]; return G.Strata.closeDoor(d) && d.state === "closed" && d.col.alive'), 'gate: it shuts (and then blocks)');
      check(await ev(`const d = G.Strata.doors[0]; const o = new THREE.Vector3(${d.x - 3}, 1.5, ${(d.lo + d.hi) / 2}); return G.world.boxFree(${d.x - 0.3}, 0.2, ${d.lo + 0.4}, ${d.x + 0.3}, 1.8, ${d.hi - 0.4}) === false`), 'gate: shut, nothing walks through it');
      await ev('G.Strata.openDoor(G.Strata.doors[0]); return 1');
      check(await ev('const d = G.Strata.doors[0]; return d.state === "open" && !d.col.alive'), 'gate: it opens again');
      await ev(`window.F = T.foes([[${d.x}, 0, ${(d.lo + d.hi) / 2}]]); return 1`);
      check(await ev('return G.Strata.closeDoor(G.Strata.doors[0]) === false'), 'gate: it will not shut on a monster in the doorway');
      await ev('F[0].pos.x -= 3; G.Strata.closeDoor(G.Strata.doors[0]); for (let i = 0; i < 8; i++) G.Strata.hitDoor(G.Strata.doors[0], 200, "explosion"); return 1');
      check(await ev('return G.Strata.doors[0].state === "broken"'), 'gate: blasts batter it down');
      check(await ev('const it = G.Strata.doors[1].it; return it.type === "celldoor" && G.world.interactables.includes(it)'), 'gate: the key works it (it is a cell gate)');
    }
    // the frozen hall's glacier: its ice ridges are as slick as an ice sheet, the stone floor beside them is not
    {
      const r = await ev(`for (let n = 2; n < 40; n++) { const w = T.enter('frozen', n); if (w.layout === 'glacier') break; } const w = G.world;
        const c = w.colliders.find((c) => c.alive && c.surf === 'ice' && c.y1 > 1); if (!c) return null; return { x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, y: c.y1 };`);
      check(!!r, 'ice: the glacier has its ridges of ice');
      if (r) {
        await ev(`const P = G.player; P.pos.set(${r.x}, ${r.y} + 0.02, ${r.z}); P.vel.set(0, 0, 0); return 1`);
        await wait(0.3);
        const on = await ev('return { slip: G.player.fieldSlip, slide: G.player.fieldSlide, y: G.player.pos.y, g: G.player.grounded }');
        await ev(`const w = G.world, s = w.spawn; G.player.pos.set(s.x, 0.05, s.z); G.player.vel.set(0, 0, 0); return 1`);
        await wait(0.3);
        const off = await ev('return { slip: G.player.fieldSlip }');
        check(on.g && on.slip <= 0.12 && on.slide >= 1.8, `ice: standing on a ridge of ice is slick (${JSON.stringify(on)})`);
        check(off.slip === 1, 'ice: the stone floor is not');
      }
    }
    // the gale and the bell by the key, a projectile at the bell
    {
      await ev("T.enter('hamlet', 3); return 1");
      const r = await ev(`const g = G.Gim.list.find((g) => g.kind === 'bell'), o = new THREE.Vector3(g.x + g.rx * 14, g.py - 0.7, g.z), d = new THREE.Vector3(g.x, g.py - 0.7, g.z).sub(o).normalize(); // (level with it, through the belfry's open side)
        G.combat.spawnProjectile({ owner: 'player', kind: 'bullet', pos: o, vel: d.multiplyScalar(160), dmg: 5, radius: 0.05 }); return 1`);
      await wait(0.5);
      check(await ev("return G.Gim.list.find((g) => g.kind === 'bell').used"), 'bell: a bullet that strikes the bell rings it');
    }

    // ================================================================ 3. the mid-area save
    {
      const one = async (field, n, fn) => {
        await ev(`T.enter('${field}', ${n}); return 1`);
        await ev(`for (const g of G.Gim.list) G.Gim.trigger(g, { by: 'use' }); return 1`);
        await wait(fn || 2.5);
        await ev(`G.player.pos.set(G.world.spawn.x, 0.2, G.world.spawn.z); window.__S = G.MidSave.snapshot(); T.enter('${field}', ${n}); G.MidSave.apply(window.__S); return 1`);
        return ev(`return G.Gim.list.map((g) => ({ k: g.kind, used: g.used, run: g.run,
          lying: g.kind === 'pillar' ? !!(g.lying && g.lying.alive) && g.cols.filter((c) => c !== g.lying && c.alive).length === 0 : null,
          oil: g.kind === 'oil' ? (G.world.fields || []).some((f) => f.kind === 'oil' && f.x0 === g.zone.x0 && f.z0 === g.zone.z0) : null,
          gate: g.kind === 'sluice' ? g.gate.position.y > 3 : null,
          tip: g.kind === 'crucible' ? Math.abs(g.pot.rotation.z - G.Gim.CR.swing) < 0.01 : null }))`);
      };
      const d = await one('dusk', 5, 3.4);
      check(d.length && d.every((g) => g.used && !g.run && g.lying), `save: fallen pillars come back fallen (${d.length})`);
      const c = await one('castle', 3);
      check(c.every((g) => g.used && g.oil), `save: tipped cauldrons come back tipped, their oil still on the ground (${c.length})`);
      const f = await one('flooded', 3, 1.2);
      check(f.length && f.every((g) => g.used && g.gate), `save: opened sluices come back open (${f.length})`);
      const u = await one('foundry', 3, 1.5);
      check(u.length && u.every((g) => g.used && g.tip), `save: spilt crucibles hang spilt (${u.length})`);
      const b = await one('hamlet', 4, 0.5);
      check(b.length === 1 && b[0].used, 'save: a rung bell stays rung');
      // a crypt gate shut before the save is shut after it
      await ev("T.enter('catacombs', 3); G.Strata.closeDoor(G.Strata.doors[1]); window.__S = G.MidSave.snapshot(); T.enter('catacombs', 3); G.MidSave.apply(window.__S); return 1");
      check(await ev('const d = G.Strata.doors[1]; return d.state === "closed" && d.col.alive && G.Strata.doors[0].state === "open"'), 'save: a crypt gate shut before the save is shut after it, the others open');
    }
    const errs = await ev('return window.__errs.slice()');
    check(!errs.length, 'no errors ' + errs.slice(0, 3).join(' | ').slice(0, 400));
    check(!p.errs.length, 'no page errors ' + p.errs.slice(0, 3).join(' | ').slice(0, 400));
  } catch (e) { check(false, 'crashed: ' + (e && e.message || e)); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nDEVICE TEST FAILED (${fails.length})` : '\nDEVICE TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
