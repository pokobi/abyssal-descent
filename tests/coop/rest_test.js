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
const ROOT = path.resolve(__dirname, '..', '..');
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
    await g.until('window.G && G.Coop && G.Coop.id === 1', 120000);
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
    check(!h.errs.length && !g.errs.length, 'no errors ' + h.errs.concat(g.errs).slice(0, 3).join(' | ').slice(0, 600));
  } catch (e) { console.log('STOPPED: ' + e.message); for (const pg of [globalThis.__h, globalThis.__g]) if (pg) console.log('errs: ' + pg.errs.slice(0, 4).join(' | ').slice(0, 900)); throw e; } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nREST TEST FAILED (${fails.length})` : '\nREST TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
