'use strict';
// Three things of co-op checked against solo (js/coop/host.js, client.js, fxsync.js, core.js):
//  1. the burning and poison a guest puts on a foe tick on the host with that guest's 防御無視 (and poison boons), the foe's 防御ダウン counted
//     once; a burn the host puts on ticks with the host's own;
//  2. the nails in a foe (nail guns: +3% damage taken each): one count of them, kept by the host - a guest's nail reaches it, the host's
//     reach the guest, a guest's blow is not grown by them twice, and they run out on both; a guest's nail drawn on the host's screen
//     goes no further than the foe in its way;
//  3. a guest's shot heard on the host: from how far off it was, suppressed or not, and with the guest's own gun.
//   COOP_PORT=9952 node tests/coop/rest_test.js
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(process.env.FX_ROOT || path.resolve(__dirname, '..', '..')); // (FX_ROOT: another copy of the game to run against)
const PORT = +process.env.COOP_PORT || 9952;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'R' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`); globalThis.__h = h;
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 120000);
    await h.booted();
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`); globalThis.__g = g;
    await g.booted();
    await g.until('window.G && G.Coop && G.Coop.id === 1', 180000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 90000);
    for (const pg of [h, g]) await pg.running(undefined, 120000);
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await sleep(1500);
    const play = 'G.ui.clearScreen(); G.game.state = "playing"; 1';
    await h.eval(play); await g.eval(play);
    // the host's other foes out of the way; one of the test's own beside the host, held still, plain (no shield, mutation, armour of its own)
    await h.eval(`(() => {
      const GM = G.game; GM.dev = { god: true, speed: 1, freeze: true };
      for (const e of G.enemies.list) if (e.alive && !e.custom) { e.alive = false; e.remove(); e.removed = true; }
      const P = G.player, e = GM.spawnEnemy({ def: G.ENEMY_BY_ID.skeleton_normal, at: { x: P.pos.x + 3, y: P.pos.y, z: P.pos.z } });
      e.maxHp = e.hp = 1e6; e.state = 'chase'; e.stateT = 0; e.model.inner.position.y = 0; e.model.group.scale.setScalar(1); if (e.updateHits) e.updateHits(); e.shield = e.maxShield = 0; e.elite = false; e.mut = null; e.dmgMul = null; e.inv = null; e.defDown = null;
      window.__F = e; return 1;
    })()`);
    await h.until('window.__F._nid > 0', 8000);
    const id = await h.eval('window.__F._nid');
    await g.until(`G.enemies.list.some((x) => x._nid === ${id} && x.alive)`, 10000);
    const rep = `G.enemies.list.find((x) => x._nid === ${id})`;
    await g.eval(`G.game.dev = { god: true, speed: 1 }; (() => { const P = G.player, f = ${rep}; P.pos.set(f.pos.x + 6, f.pos.y, f.pos.z); P.vel.set(0, 0, 0); P.stats.critChance = 0; P.stats.elemChance = 0; })(); ${play}`);
    await sleep(400);

    // ---------------- 1. damage over time and the foe's defence ----------------
    // (every tick the host deals to the test's foe: [element, amount asked, health taken])
    await h.eval(`(() => { const C = G.combat, de = C.damageEnemy; window.__dl = [];
      C.damageEnemy = function (e, a, i) { const h0 = e.hp; const r = de.apply(this, arguments); if (e === window.__F && i && i.src === 'dot' && i.remote === undefined && a > 0) window.__dl.push([i.elem, a, h0 - e.hp, e._dotBy || 0]); return r; };
      G.player.stats.defIgnore = 0; G.player.stats.poisonDmg = 0; G.player.stats.dotDmg = 0; G.combat.defDown(window.__F, 'test', 0.3, 120, { raw: true }); return 1; })()`);
    const ticks = async (el, owner, n) => {
      await h.eval('window.__dl = []; 1');
      await h.until(`window.__dl.filter((x) => x[0] === '${el}' && x[3] === ${owner}).length >= ${n}`, 15000).catch(() => {});
      const l = JSON.parse(await h.eval(`JSON.stringify(window.__dl.filter((x) => x[0] === '${el}' && x[3] === ${owner}))`));
      return l.map((x) => x[2] / x[1]);
    };
    const near = (a, b) => Math.abs(a - b) < 0.02;
    // the guest: 防御無視 50%, poison boons +50%; the host: none. The foe: 防御ダウン 30% (put on by the host)
    await g.eval('(() => { const S = G.player.stats; S.defIgnore = 0.5; S.poisonDmg = 0.5; S.dotDmg = 0; return 1; })()');
    await g.until(`G.combat.defDownOf(${rep}) > 0.29`, 5000).catch(() => {});
    await g.eval(`G.combat.status(${rep}, 'burn', 1); 1`);
    await h.until('window.__F.st.burn > 0 && window.__F._dotBy === 1', 5000).catch(() => {});
    let r = await ticks('fire', 1, 2);
    const want1 = 2 / (2 - 0.3 - 0.5);
    check(r.length >= 2 && r.every((k) => near(k, want1)), `a guest's burn ticks on the host with the guest's 防御無視 and the 防御ダウン once (x${r.map((k) => k.toFixed(3)).join(' x')}, want x${want1.toFixed(3)}; the host's own would be x${(2 / 1.7).toFixed(3)})`);
    // the host's own burn: the host's 防御無視 (20%)
    await h.eval('G.player.stats.defIgnore = 0.2; G.combat.status(window.__F, "burn", 1); 1');
    r = await ticks('fire', 0, 2);
    const want2 = 2 / (2 - 0.3 - 0.2);
    check(r.length >= 2 && r.every((k) => near(k, want2)), `a burn the host puts on ticks with the host's own (x${r.map((k) => k.toFixed(3)).join(' x')}, want x${want2.toFixed(3)})`);
    // the guest's poison: its 防御無視 and its poison boons (the host's are none)
    await g.eval(`G.combat.status(${rep}, 'poison', 1); 1`);
    await h.until('window.__F.st.poison > 0 && window.__F._dotBy === 1', 5000).catch(() => {});
    r = await ticks('poison', 1, 2);
    const want3 = want1 * 1.5;
    check(r.length >= 2 && r.every((k) => near(k, want3)), `a guest's poison ticks with the guest's 防御無視 and poison boons (x${r.map((k) => k.toFixed(3)).join(' x')}, want x${want3.toFixed(3)})`);
    await h.eval('(() => { const F = window.__F; F.st.burn = 0; F.st.poison = 0; F.st.poisonStacks = 0; F.defDown = null; G.player.stats.defIgnore = 0; return 1; })()');
    await g.eval('(() => { const S = G.player.stats; S.defIgnore = 0; S.poisonDmg = 0; return 1; })()');
    await sleep(600);

    // ---------------- 2. the nails ----------------
    const nailId = await g.eval('(Object.values(G.WEAPON_BY_ID).find((d) => d.arch === "nail") || {}).id || ""');
    check(!!nailId, `a nail gun to test with (${nailId})`);
    await h.eval('window.__F.st.nails = 0; window.__F.st.nailT = 0; 1');
    await g.until(`!(${rep}.st.nails > 0)`, 5000).catch(() => {});
    await g.eval(`(() => { window.__NW = G.weapons.make(${JSON.stringify(nailId)}); G.combat.damageEnemy(${rep}, 10, { src: 'bullet', weapon: window.__NW }); return 1; })()`);
    await h.until('window.__F.st.nails === 1', 5000).catch(() => {});
    check(await h.eval('window.__F.st.nails') === 1, `a nail the guest puts in the foe is in it on the host (${await h.eval('window.__F.st.nails')})`);
    await h.eval('window.__F.st.nails = 3; window.__F.st.nailT = 30; 1');
    await g.until(`${rep}.st.nails === 3`, 5000).catch(() => {});
    check(await g.eval(`${rep}.st.nails`) === 3, `the host's nails reach the guest (${await g.eval(`${rep}.st.nails`)})`);
    const hp0 = await h.eval('window.__F.hp');
    const gd = await g.eval(`(() => { const e = ${rep}, h0 = e.hp; G.combat.damageEnemy(e, 100, { src: 'bullet' }); return h0 - e.hp; })()`);
    await h.until(`window.__F.hp < ${hp0} - 1`, 5000).catch(() => {});
    const hd = hp0 - await h.eval('window.__F.hp');
    check(gd > 0 && Math.abs(hd / gd - 1) < 0.01, `a guest's blow counts the nails once (guest ${gd.toFixed(2)}, host took ${hd.toFixed(2)} = x${(hd / (gd || 1)).toFixed(3)})`);
    check(await h.eval('window.__F.st.nails') === 3, 'and a blow that is not a nail leaves the count as it is');
    await h.eval('window.__F.st.nailT = 0.05; 1');
    await g.until(`!(${rep}.st.nails > 0)`, 5000).catch(() => {});
    check(!(await g.eval(`${rep}.st.nails`) > 0) && !(await h.eval('window.__F.st.nails') > 0), 'they run out on both');
    // a guest's nail drawn on the host's screen stops at the foe in its way (6 m off at 60 m/s: a tenth of a second, not 4 s stuck in a wall)
    await h.eval(`(() => { const L = G.combat.projectiles; window.__NL = []; L.push = function (p) { if (p && p.owner === 'remote' && p.kind === 'nail') window.__NL.push(p.life); return Array.prototype.push.apply(this, arguments); }; return 1; })()`);
    await g.eval(`(() => { const e = ${rep}, P = G.player, o = e.centerPos().clone(); o.x += 6; const v = e.centerPos().sub(o).normalize().multiplyScalar(60);
      G.combat.spawnProjectile({ kind: 'nail', pos: o, vel: v, grav: 0, owner: 'player', dmg: 1, radius: 0.12, life: 6, pierce: 0, info: { src: 'bullet' } }); return 1; })()`);
    await h.until('window.__NL.length > 0', 5000).catch(() => {});
    const nl = JSON.parse(await h.eval('JSON.stringify(window.__NL)'));
    check(nl.length > 0 && nl[0] < 0.3, `the guest's nail is drawn on the host and ends at the foe (its life ${nl.length ? nl[0].toFixed(3) : '-'} s)`);

    // ---------------- 3. a guest's shot heard ----------------
    await h.eval('(() => { const g0 = G.sfx.gun; window.__GS = []; G.sfx.gun = function (k, o) { window.__GS.push([k, o || {}]); return g0.apply(this, arguments); }; return 1; })()');
    const gunId = await g.eval(`(() => { const d = Object.values(G.WEAPON_BY_ID).find((x) => x.arch === 'rifle' && x.rarity !== 'common' && x.rarity !== 'uncommon') || Object.values(G.WEAPON_BY_ID).find((x) => x.arch === 'rifle'); const P = G.player; P.weapons[P.wIdx] = G.weapons.make(d.id); P.weapon.mag = 999; G.weapons.dirty = true; return P.weapon.def.id; })()`);
    // the guest 20-30 m off the host, on open ground
    const spot = JSON.parse(await g.eval(`(() => { const P = G.player, w = G.world, hp = ${JSON.stringify(await h.eval('JSON.stringify([G.player.pos.x, G.player.pos.z])'))}; const H = JSON.parse(hp); const c = w.randomOpenCell(new G.RNG(11), (x, z, i) => (!w.reachMask || w.reachMask[i]) && Math.hypot(x - H[0], z - H[1]) > 20 && Math.hypot(x - H[0], z - H[1]) < 30); if (c) { P.pos.set(c.x, c.y + 0.05, c.z); P.vel.set(0, 0, 0); } P.pitch = 1.45; return JSON.stringify(c); })()`));
    await g.eval(play);
    await sleep(800);
    const shoot = (hush) => g.eval(`(() => { const W = G.weapons, w = G.player.weapon, s = W.stats(w); w.mag = 999; G.player.pitch = 1.45; W.shoot(w, ${hush ? 'Object.assign({}, s, { hush: true })' : 's'}); return 1; })()`);
    await shoot(true); await sleep(400); await shoot(false);
    await h.until('window.__GS.length >= 2', 5000).catch(() => {});
    const gs = JSON.parse(await h.eval('JSON.stringify(window.__GS)'));
    const dist = await h.eval('(() => { const rp = G.Coop.players.get(1); return G.player.pos.distanceTo(rp.to); })()');
    console.log('      heard: ' + JSON.stringify(gs).slice(0, 300));
    check(!!spot && gs.length >= 2, `the host hears both of the guest's shots (${gs.length})`);
    if (gs.length >= 2) {
      const [a, b] = gs;
      check(a[1].suppressed === true && b[1].suppressed === false, `suppressed or not, as the guest's gun was (${a[1].suppressed} / ${b[1].suppressed})`);
      check(a[1].rid === gunId && b[1].rid === gunId && !a[1].id, `with the guest's own gun (rid ${b[1].rid}, want ${gunId}; no id, which would mark it the host's own)`);
      const hd2 = (0.8 - b[1].vol) * 80;
      check(Math.abs(hd2 - dist) < 2.5, `from how far off it was (the level says ${hd2.toFixed(1)} m, the guest stands ${dist.toFixed(1)} m off)`);
    }
    // ---------------- 4. a guest's pointed shots drawn on the other screens (the host's, and a second guest's) ----------------
    // a second guest comes in (a run under way)
    const g2 = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest2${q}`); globalThis.__g2 = g2;
    await g2.booted(240000);   // (the page's boot first: a busy machine can take long over it, and the room is joined meanwhile)
    await g2.until('window.G && G.Coop && G.Coop.id >= 2 && G.game.run && G.world && G.Coop.fpOk !== undefined', 180000);
    await g2.eval(off); await g2.running(undefined, 120000);
    await g2.eval('G.game.dev = { god: true, speed: 1 }; ' + play);
    await g2.until(`G.enemies.list.some((x) => x._nid === ${id} && x.alive)`, 15000).catch(() => {});
    check(await g2.eval(`G.enemies.list.some((x) => x._nid === ${id} && x.alive)`), 'a second guest comes in and sees the test\'s foe');
    // (every picture of someone else's shot made on a screen: the shot, and the life it was given)
    const rec = `(() => { const L = G.combat.projectiles; window.__PJ = []; L.push = function (p) { if (p && p.owner === 'remote') window.__PJ.push({ p, life0: p.life }); return Array.prototype.push.apply(this, arguments); }; return 1; })()`;
    await h.eval(rec); await g2.eval(rec);
    // Where the guest fires from: a place round the foe (R m off, on its +x side and up to 75 degrees either way of it: the test's other
    // foes stand on its -x side) that is clear - not inside anything, the foe in sight, and the shot's own way free of walls and roofs:
    // straight at the foe, along its whole arc for a lobbed one, the first few metres for one let go off to the side (a homing one).
    // A field is drawn anew every run, a narrow lane or a low roof among them: a place picked blindly put the shot into a wall now and then.
    //   o: { R (6), fixed (only straight off its +x side), speed | t + grav (lobbed: the time it takes on its arc),
    //        side (radians off the foe, either way) | up (to the side square to the foe, rising by this much); clear (metres free ahead) }
    // Returns { from, v, deg, sg } or null.
    await g.eval(`window.__aim = (o) => {
      const w = G.world, e = ${rep}, c = e.centerPos(), up = new THREE.Vector3(0, 1, 0);
      const free = (q) => w.boxFree(q.x - 0.2, q.y - 0.2, q.z - 0.2, q.x + 0.2, q.y + 0.2, q.z + 0.2);
      const open = (a, b) => { const d = b.clone().sub(a), L = d.length(); return L < 1e-6 || !w.raycast(a, d.divideScalar(L), L); };
      const arc = (from, v, gr, T) => { let a = from.clone(); for (let i = 1; i <= 16; i++) { const t = T * i / 16, b = from.clone().addScaledVector(v, t); b.y -= 0.5 * gr * t * t; if (!open(a, b)) return false; a = b; } return true; };
      for (const deg of o.fixed ? [0] : [0, 20, -20, 40, -40, 60, -60, 75, -75]) {
        const a = deg * Math.PI / 180, R = o.R || 6, from = c.clone().add(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
        if (!free(from) || !w.los(from, c)) continue;
        const to = c.clone().sub(from).normalize();
        if (o.t) { const v = c.clone().sub(from).divideScalar(o.t); v.y += 0.5 * o.grav * o.t; if (arc(from, v, o.grav, o.t * 0.97)) return { from, v, deg }; continue; }
        if (o.side !== undefined || o.up !== undefined) {
          for (const sg of [1, -1]) {
            const d = o.up !== undefined ? to.clone().cross(up).multiplyScalar(sg).addScaledVector(up, o.up).normalize() : to.clone().applyAxisAngle(up, o.side * sg);
            if (open(from, from.clone().addScaledVector(d, o.clear || 4))) return { from, v: d.multiplyScalar(o.speed), deg, sg };
          }
          continue;
        }
        if (open(from, c)) return { from, v: to.multiplyScalar(o.speed || 60), deg };
      }
      return null;
    }; 1`);
    const fire = (o) => g.eval(`(() => { const s = window.__aim(${JSON.stringify({ R: o.R, fixed: o.fixed, speed: o.speed, t: o.t, grav: o.grav })});
      if (!s) return JSON.stringify({ ok: false });
      const p = G.combat.spawnProjectile(Object.assign({ pos: s.from, vel: s.v, owner: 'player', dmg: 1, radius: 0.12, life: 6, info: { src: 'bullet' } }, ${JSON.stringify(o.pj)}));
      window.__own = p; return JSON.stringify({ ok: true, deg: s.deg, over: ${o.t ? `+(0.5 * ${o.grav} * ${o.t} * ${o.t}).toFixed(2)` : 0} }); })()`);
    const lastPic = async (pg, n0) => { await pg.until(`window.__PJ.length > ${n0}`, 5000).catch(() => {}); return JSON.parse(await pg.eval(`JSON.stringify(window.__PJ.length > ${n0} ? (() => { const r = window.__PJ[window.__PJ.length - 1]; return { kind: r.p.kind, life: +r.life0.toFixed(3), pierce: r.p.pierce || 0 }; })() : null)`)); };
    const shots = [
      { name: 'a crossbow bolt (no pierce)', pj: { kind: 'bolt', grav: 5, pierce: 0 }, speed: 95, cut: true },
      { name: 'an arrow', pj: { kind: 'arrow', grav: 2, pierce: 0 }, speed: 70, cut: true },
      { name: 'a harpoon', pj: { kind: 'harpoon', grav: 4, pierce: 0 }, speed: 85, cut: true },
      { name: 'a stake (破甲杭: it bursts where it strikes)', pj: { kind: 'harpoon', grav: 1.5, pierce: 0, explode: 3, life: 3 }, speed: 70, cut: true },
      { name: 'a nail', pj: { kind: 'nail', grav: 3, pierce: 0 }, speed: 140, cut: true },
      { name: 'a lobbed arrow (its straight line passes over the foe)', pj: { kind: 'arrow', grav: 9.8, pierce: 0 }, R: 9, t: 0.7, grav: 9.8, cut: true, arc: true },
      { name: 'a crossbow bolt that pierces (2)', pj: { kind: 'bolt', grav: 5, pierce: 2 }, speed: 95, cut: false },
      { name: 'a spear (it pierces all)', pj: { kind: 'spear', grav: 3, pierce: 99, life: 4 }, speed: 65, cut: false },
    ];
    for (const s of shots) {
      const n0 = await h.eval('window.__PJ.length'), m0 = await g2.eval('window.__PJ.length');
      const info = JSON.parse(await fire(s));
      const a = await lastPic(h, n0), b = await lastPic(g2, m0);
      const ok = (x) => x && (s.cut ? x.life < (s.arc ? 0.85 : 0.3) && (!s.arc || x.life > 0.45) : x.life >= 2.5);
      check(ok(a) && ok(b), `${s.name}: ${s.cut ? 'ends at the foe' : 'goes on through'} on the host and on the second guest (life ${a ? a.life : '-'} / ${b ? b.life : '-'} s${s.arc ? `; the straight line passes ${info.over} m over the foe's middle` : ''})`);
      await sleep(250);
    }
    // ---- a shot that pierces ends at the foe past as many as it pierces; one that bursts, at the first foe
    // (two more foes of the test's own in a line behind the first, away from the guest's side: 2 m and 4 m on)
    const more = JSON.parse(await h.eval(`(() => { const F = window.__F, out = [];
      for (const dx of [-2, -4]) { const e = G.game.spawnEnemy({ def: G.ENEMY_BY_ID.skeleton_normal, at: { x: F.pos.x + dx, y: F.pos.y, z: F.pos.z } });
        e.maxHp = e.hp = 1e6; e.state = 'chase'; e.stateT = 0; e.model.inner.position.y = 0; e.model.group.scale.setScalar(1); e.shield = e.maxShield = 0; e.mut = null; e.pos.set(F.pos.x + dx, F.pos.y, F.pos.z); if (e.updateHits) e.updateHits(); out.push(e); }
      window.__L3 = out; return JSON.stringify(out.map((e) => [e.pos.x, e.pos.y, e.pos.z])); })()`));
    await h.until('window.__L3.every((e) => e._nid > 0)', 8000).catch(() => {});
    const ids3 = JSON.parse(await h.eval('JSON.stringify(window.__L3.map((e) => e._nid))'));
    for (const pg of [g, g2]) await pg.until(`${JSON.stringify(ids3)}.every((n) => G.enemies.list.some((x) => x._nid === n && x.alive && x.pos.distanceTo(x._n ? x._n.pos : x.pos) < 0.2))`, 10000).catch(() => {});
    console.log(`      a line of three foes: the first at ${JSON.stringify(await g.eval(`(() => { const c = ${rep}.centerPos(); return [+c.x.toFixed(2), +c.z.toFixed(2)]; })()`))}, then ${JSON.stringify(more.map((p) => [+p[0].toFixed(2), +p[2].toFixed(2)]))}`);
    {
      // the times the bolt (95 m/s from 6 m off the first) reaches the second and the third foe's middle
      const t2 = 8 / 95, t3 = 10 / 95;
      const n0 = await h.eval('window.__PJ.length'), m0 = await g2.eval('window.__PJ.length');
      const lf = JSON.parse(await fire({ pj: { kind: 'bolt', grav: 0, pierce: 2 }, speed: 95, fixed: true }));
      if (!lf.ok) console.log('      (the line of foes cannot be shot along from its own end here: ' + JSON.stringify(lf) + ')');
      const a = await lastPic(h, n0), b = await lastPic(g2, m0);
      const ok = (x) => x && x.life > t2 && x.life < t3 + 0.01;
      check(ok(a) && ok(b), `a crossbow bolt that pierces 2 ends in the third foe on the host and on the second guest (life ${a ? a.life : '-'} / ${b ? b.life : '-'} s; the second foe at ${t2.toFixed(3)} s, the third at ${t3.toFixed(3)} s)`);
      await sleep(250);
    }
    const bursts = [
      { name: 'a rocket', pj: { kind: 'rocket', grav: 0, explode: 4.5, life: 6 }, speed: 46 },
      { name: 'a grenade launcher\'s round', pj: { kind: 'grenade', grav: 18, explode: 4, fuse: 1.6, bounce: true, life: 6 }, t: 6 / 32, grav: 18 },
      { name: 'a fireball', pj: { kind: 'fireball', grav: 0, explode: 3, life: 4 }, speed: 40 },
    ];
    for (const s of bursts) {
      const n0 = await h.eval('window.__PJ.length'), m0 = await g2.eval('window.__PJ.length');
      await fire(s);
      const a = await lastPic(h, n0), b = await lastPic(g2, m0);
      const ok = (x) => x && x.life < 0.3;
      check(ok(a) && ok(b), `${s.name}: the picture ends at the first foe, where it bursts (life ${a ? a.life : '-'} / ${b ? b.life : '-'} s)`);
      await sleep(400);
    }
    // a thrown grenade (fuse 1.4 s, it bounces): on its thrower's screen it bursts where it meets a foe in the air (combat.js: a shot that
    // bursts, bursts on the foe it meets), so its picture ends there too
    {
      const n0 = await h.eval('window.__PJ.length'), m0 = await g2.eval('window.__PJ.length');
      const t0 = await g.eval('G.game.time');
      await fire({ pj: { kind: 'grenade', look: 'gl_g_frag', grav: 18, explode: 3.5, fuse: 1.4, bounce: true, life: 10, info: { src: 'explosion', grenade: true } }, R: 7, t: 0.45, grav: 18 });
      const a = await lastPic(h, n0), b = await lastPic(g2, m0);
      await g.until(`!G.combat.projectiles.includes(window.__own)`, 5000).catch(() => {});
      const own = JSON.parse(await g.eval(`JSON.stringify({ gone: +(G.game.time - ${t0}).toFixed(2), d: +window.__own.pos.distanceTo(${rep}.centerPos()).toFixed(2) })`));
      check(own.gone < 1.2 && own.d < 1.5, `a thrown grenade bursts on the foe it meets in the air, on its thrower's screen (gone after ${own.gone} s, ${own.d} m from the foe; its fuse was 1.4 s)`);
      const ok = (x) => x && x.life > 0.25 && x.life < 0.5;
      check(ok(a) && ok(b), `and its picture ends there on the host and on the second guest (life ${a ? a.life : '-'} / ${b ? b.life : '-'} s)`);
      await sleep(400);
    }
    // ---- homing shots: the picture turns to the foe on the other screens too, and ends there
    // (the picture made next on a page, followed every frame: how well it heads for the foe at first and at best, and how far from a foe it ends)
    const follow = `window.__follow = () => { const n0 = window.__PJ.length, r = { first: null, best: -2, gone: false };
      const f = () => { const rec = window.__PJ[n0]; if (!rec) return requestAnimationFrame(f); const p = rec.p;
        const foes = G.enemies.list.filter((e) => e.alive && !e.custom);
        if (!G.combat.projectiles.includes(p)) { r.gone = true; r.why = { stuck: !!p.stuck, life: +p.life.toFixed(2), at: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)] }; r.endD = +Math.min(...foes.map((e) => e.centerPos().distanceTo(p.pos))).toFixed(2); r.t = +(p.t || 0).toFixed(2); r.tgt = p.target ? p.target._nid : 0; return; }
        const t = p.target && p.target.alive ? p.target : null;
        if (t) { const k = +p.vel.clone().normalize().dot(t.centerPos().sub(p.pos).normalize()).toFixed(3); if (r.first === null) r.first = k; r.best = Math.max(r.best, k); }
        requestAnimationFrame(f); };
      f(); return r; }; 1`;
    // (only the test's own foes stand now: one of the area's elsewhere could be the nearest to a homing shot's start)
    await h.eval(`(() => { const keep = [window.__F].concat(window.__L3); for (const e of G.enemies.list) if (e.alive && !e.custom && !keep.includes(e)) { e.alive = false; e.remove(); e.removed = true; } return 1; })()`);
    await sleep(800);
    await h.eval(follow); await g2.eval(follow);
    const homing = async (name, js, want) => { // (js: the shot, from \`from\` with velocity \`s.v\`; want.aim: how it is let go, see __aim)
      await h.eval('window.__HR = window.__follow(); 1'); await g2.eval('window.__HR = window.__follow(); 1');
      const shot = JSON.parse(await g.eval(`(() => { const s = window.__aim(${JSON.stringify(want.aim)}); if (!s) return 'null'; const e = ${rep}, from = s.from; ${js} return JSON.stringify({ deg: s.deg, side: s.sg }); })()`));
      if (!shot) { check(false, `${name}: a clear place to fire it from (none found round the foe)`); return; }
      if (want.kill) { await sleep(150); await h.eval(want.kill); }
      for (const pg of [h, g2]) await pg.until('window.__HR.gone', 8000).catch(() => {});
      const a = JSON.parse(await h.eval('JSON.stringify(window.__HR)')), b = JSON.parse(await g2.eval('JSON.stringify(window.__HR)'));
      // (turned: its heading came round towards the foe - by more than 0.15 of the cosine where it started well off it, to within 25 degrees otherwise)
      const ok = (x) => x.gone && (want.turn ? x.first !== null && x.first < 0.7 && x.best > x.first + 0.15 : x.best > 0.9) && x.endD < 1.3 && (!want.tgt || x.tgt === want.tgt);
      check(ok(a) && ok(b), `${name}: on the host and the second guest its picture turns to the foe and ends there (host ${JSON.stringify(a)} / second guest ${JSON.stringify(b)})`);
      await sleep(300);
    };
    // a soul bolt (C.soulBolt: aimed at a foe, homing 9), let go upward and to the side as the game lets it go
    await homing('a soul bolt aimed at the first foe', `G.combat.spawnProjectile({ kind: 'soul', pos: from, vel: s.v, owner: 'player', dmg: 1, homing: 9, target: e, radius: 0.3, life: 3, info: { src: 'buff', proc: true, noMarker: true } });`, { turn: true, tgt: id, aim: { up: 0.4, speed: 22, clear: 3 } });
    // a homing gun's round (no target of its own: the nearest foe), fired slow and 60 degrees off the foe: its straight line passes 5 m wide of it
    await homing('a homing crossbow bolt (森王の長弓)', `G.combat.spawnProjectile({ kind: 'bolt', pos: from, vel: s.v, grav: 0, owner: 'player', dmg: 1, radius: 0.12, life: 6, pierce: 0, homing: 5, info: { src: 'bullet' } });`, { turn: true, aim: { side: 1.05, speed: 20, clear: 4 } });
    await homing('a homing rocket (流星)', `G.combat.spawnProjectile({ kind: 'rocket', pos: from, vel: s.v, grav: 0, owner: 'player', dmg: 1, radius: 0.25, life: 6, explode: 2, homing: 5, info: { src: 'explosion' } });`, { turn: true, aim: { side: 1.05, speed: 20, clear: 4 } });
    // a soul bolt whose foe falls before it gets there: it turns to the nearest one left, as on its shooter's screen
    await homing('a soul bolt whose foe falls on the way', `const t = G.enemies.list.find((x) => x._nid === ${ids3[1]}); G.combat.spawnProjectile({ kind: 'soul', pos: from, vel: s.v, owner: 'player', dmg: 1, homing: 9, target: t, radius: 0.3, life: 4, info: { src: 'buff', proc: true, noMarker: true } });`, { aim: { up: 0.4, speed: 9, clear: 3 }, kill: `(() => { const e = window.__L3[1]; e.hp = 1; G.combat.damageEnemy(e, 1e7, { src: 'bullet', fixed: true }); return 1; })()` });
    // a sticky shot sticks to the foe on the other screens too, and goes with it
    {
      const n0 = await h.eval('window.__PJ.length'), m0 = await g2.eval('window.__PJ.length');
      await fire({ pj: { kind: 'grenade', grav: 0, sticky: true, fuse: 2.5, explode: 0.5 }, speed: 30 });
      await h.until(`window.__PJ.length > ${n0} && window.__PJ[window.__PJ.length - 1].p.stuck`, 5000).catch(() => {});
      await g2.until(`window.__PJ.length > ${m0} && window.__PJ[window.__PJ.length - 1].p.stuck`, 5000).catch(() => {});
      const hs = await h.eval(`(() => { const r = window.__PJ[window.__PJ.length - 1]; return !!r && r.p.stuck && r.p.stuckTo === window.__F; })()`);
      const gs2 = await g2.eval(`(() => { const r = window.__PJ[window.__PJ.length - 1]; return !!r && r.p.stuck && !!r.p.stuckTo && r.p.stuckTo._nid === ${id}; })()`);
      const own = await g.eval('!!(window.__own && window.__own.stuck && window.__own.stuckTo && window.__own.stuckTo._nid === ' + id + ')');
      check(own && hs && gs2, `a sticky one sticks to the foe on the guest's own screen (${own}), on the host's (${hs}) and on the second guest's (${gs2})`);
    }
    // the way a pointed one is drawn: point first, the same on the screen it was fired on and on the others (combat.js NOSE_FWD)
    {
      const n0 = await h.eval('window.__PJ.length');
      await fire({ pj: { kind: 'spear', grav: 0, pierce: 99, life: 4 }, R: 14, speed: 20 });
      await h.until(`window.__PJ.length > ${n0}`, 5000).catch(() => {});
      await h.frames(4); await g.frames(4);
      const way = 'const f = new THREE.Vector3(0, 0, -1).applyQuaternion(p.mesh.quaternion), v = p.vel.clone().normalize(); return [+f.dot(v).toFixed(3), !!p.headFwd];';
      const hw = await h.eval(`(() => { const p = window.__PJ[window.__PJ.length - 1].p; ${way} })()`);
      const gw = await g.eval(`(() => { const p = window.__own; ${way} })()`);
      check(hw[0] > 0.95 && gw[0] > 0.95 && hw[1] && gw[1], `a spear is drawn point first on the guest's screen (${gw[0]}) and on the host's (${hw[0]})`);
    }
    for (const pg of [g2]) if (pg.errs.length) h.errs.push(...pg.errs.map((x) => 'g2: ' + x));
    check(!h.errs.length && !g.errs.length, 'no errors ' + h.errs.concat(g.errs).slice(0, 3).join(' | ').slice(0, 600));
  } catch (e) { console.log('STOPPED: ' + e.message); for (const pg of [globalThis.__h, globalThis.__g, globalThis.__g2]) if (pg) console.log('coop: ' + await pg.eval('JSON.stringify({ id: G.Coop && G.Coop.id, role: G.Coop && G.Coop.role, live: G.Coop && G.Coop.live, st: G.game && G.game.state, booted: !!(document.getElementById("loading") && document.getElementById("loading").classList.contains("done")), n: G.Coop && G.Coop.players && G.Coop.players.size, href: location.href })').catch((x) => 'eval failed ' + x.message)); for (const pg of [globalThis.__h, globalThis.__g, globalThis.__g2]) if (pg) console.log('errs: ' + pg.errs.slice(0, 4).join(' | ').slice(0, 900)); throw e; } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nREST TEST FAILED (${fails.length})` : '\nREST TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
