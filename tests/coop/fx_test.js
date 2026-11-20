'use strict';
// Kills by the guest, statuses both ways, throwables and effects seen by the other player, a grenade of someone else hurting you.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9011;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=40&jit=20', room = 'F' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await h.booted();
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.booted();   // (the page's boot first: a busy machine can take long over it, and the room is joined meanwhile)
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    // (both players untouchable until a step that hurts one of them on purpose: the foes of the area fight all along, and a host they
    // had worn down - or put down - would take nothing from the blasts below)
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.game.state === "playing" && G.Coop.fpOk !== undefined', 60000);
    for (const pg of [h, g]) await pg.running();
    await sleep(2500);
    const foes = 'G.enemies.list.filter((e) => e.alive && !e.custom && e._nid && e.state !== "spawn")';
    await g.until(`${foes}.length >= 2`, 60000);   // (the foes come by the game's time: on a busy machine its frames are fewer)
    // ---- the guest finishes a foe, hit by hit (never dying at 1 hp)
    await g.eval(`(() => { G.game.dev = { god: true, speed: 1 }; const e = ${foes}[0]; window.__id = e._nid; window.__hp0 = e.hp; })(); 1`);
    const id = +(await g.eval('window.__id'));
    const hp0 = +(await g.eval('window.__hp0'));
    for (let i = 0; i < 6; i++) { await g.eval(`(() => { const e = G.enemies.list.find((x) => x._nid === ${id}); if (e && e.alive) G.combat.damageEnemy(e, ${Math.ceil(hp0 / 3)}, { src: "bullet", pos: e.centerPos() }); })(); 1`); await sleep(250); }
    await sleep(800);
    check(await h.eval(`!G.enemies.list.some((x) => x._nid === ${id} && x.alive)`), `the foe the guest hit was killed on the host (${hp0} hp)`);
    check(await g.eval(`!G.enemies.list.some((x) => x._nid === ${id} && x.alive)`), 'and is dead on the guest');
    check(await g.eval('G.game.run.kills >= 1'), 'the kill counts for the guest');
    // ---- a real shot: the guest aims at a foe with the camera and fires the gun in hand
    // (the foes are held still on the host from here: a real shot is aimed at the foe where the guest sees it, and a small foe on the move
    // - a slime, a bat - was often somewhere else by the time the round flew; the guest's copies follow the host's still ones)
    await h.eval('G.game.dev = { god: true, speed: 1, freeze: true }; 1');
    await sleep(500);
    // the guest stands 5 m off a foe it can see, aims at it with the camera and fires the gun in hand. The guest is put on open ground
    // with nothing between (a place picked blindly put the guest inside a wall or behind a pillar now and then): a few foes are tried
    const pickShot = `(() => { const P = G.player, w = G.world, list = ${foes}.filter((e) => !e.burrowed && !e.untargetable && !e.invuln);
      for (const e of list) { const c = e.centerPos(), gy = w.floorBelow(c.x, e.pos.y + 0.5, c.z);
        // (the ground under the foe, not its feet: a bat or a crow flies well above it)
        for (let k = 0; k < 48; k++) { const a = k / 16 * Math.PI * 2, R = [5, 4, 6.5][Math.floor(k / 16)], x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R, y = w.floorBelow(x, gy + 2, z);
          if (!(y > gy - 1.2 && y < gy + 1.2) || !w.boxFree(x - 0.4, y + 0.05, z - 0.4, x + 0.4, y + 1.9, z + 0.4)) continue;
          const eye = new THREE.Vector3(x, y + 1.6, z); if (!w.los(eye, c)) continue;
          window.__s = e._nid; window.__sh = e.hp + (e.shield || 0); P.pos.set(x, y + 0.02, z); P.vel.set(0, 0, 0); return e._nid; } }
      return 0; })()`;
    const aimFire = `(() => { const W = G.weapons, P = G.player, w = P.weapon; w.mag = 20; w.reloading = false; G.ui.clearScreen(); G.game.state = 'playing'; const e = G.enemies.list.find((x) => x._nid === window.__s), c = e.centerPos(), o = G.camera.position; const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); G.camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); G.camera.updateMatrixWorld(true); W.shoot(w, W.stats(w)); })(); 1`;
    let sh = 0, after = 0, tries = 0, sid = 0;
    for (; tries < 3; tries++) {
      await g.until(`${foes}.length >= 1`, 20000);
      sid = await g.eval(pickShot); if (!sid) { await sleep(500); continue; }
      sh = +(await g.eval('window.__sh'));
      await g.frames(6);
      await g.eval(aimFire);
      await h.until(`(() => { const e = G.enemies.list.find((x) => x._nid === ${sid}); return !e || !e.alive || e.hp + (e.shield || 0) < ${sh}; })()`, 3000).catch(() => {});
      after = await h.eval(`(() => { const e = G.enemies.list.find((x) => x._nid === ${sid}); return e && e.alive ? e.hp + (e.shield || 0) : -1; })()`);
      if (after < sh) break;
      await sleep(800); // (the gun's own pace before the next round)
    }
    if (!(sid && after < sh)) console.log('      shot: ' + await g.eval(`JSON.stringify({ field: G.world.field, foes: ${foes}.map((e) => [e.def.id, e.state, !!e.flyer, Math.round(e.pos.y * 10) / 10]) })`));
    check(sid && after < sh, `a real shot of the guest took health off the host's foe (${Math.round(sh)} -> ${Math.round(after)}, shot ${tries + 1})`);
    await h.eval('G.game.dev = { god: true, speed: 1 }; 1');
    // ---- a status the guest puts on a foe ticks on the host; one the host puts on shows on the guest
    await g.until(`${foes}.length >= 1`, 20000);
    await g.eval(`(() => { const e = ${foes}[0]; window.__b = e._nid; G.combat.status(e, 'burn', 2); })(); 1`);
    await sleep(900);
    const b = +(await g.eval('window.__b'));
    check(await h.eval(`(() => { const e = G.enemies.list.find((x) => x._nid === ${b}); return !e || !e.alive || e.st.burn > 0; })()`), 'a burn put on by the guest burns on the host');
    await h.until(`${foes}.length >= 1`, 20000);
    await h.eval(`(() => { const e = ${foes}[0]; window.__p = e._nid; G.combat.status(e, 'poison', 3); })(); 1`);
    const pz = +(await h.eval('window.__p'));
    check(await g.until(`(() => { const e = G.enemies.list.find((x) => x._nid === ${pz}); return !e || !e.alive || e.st.poison > 0; })()`, 4000).then(() => true, () => false), 'a poison put on by the host shows on the guest');
    // ---- throwables
    await g.eval('window.__pj = 0; const sp = G.combat.spawnProjectile; G.combat.spawnProjectile = function (o) { if (o.owner === "remote") window.__pj++; return sp.call(G.combat, o); }; window.__fx = 0; for (const f of ["explosion", "ring"]) { const o = G.fx[f]; G.fx[f] = function () { if (G.Coop._fxNet) window.__fx++; return o.apply(G.fx, arguments); }; } 1');
    await h.eval("(() => { const P = G.player; G.combat.spawnProjectile({ kind: 'grenade', pos: P.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), vel: new THREE.Vector3(0, 6, -8), grav: 18, owner: 'player', dmg: 50, radius: 0.12, life: 10, fuse: 1.2, bounce: true, explode: 4, info: { src: 'explosion', grenade: true } }); })(); 1");
    check(await g.until('G.combat.projectiles.some((p) => p.owner === "remote")', 3000).then(() => true, () => false), 'a grenade thrown by the host flies on the guest screen');
    await sleep(900);
    // ---- an explosion of the host's grenade beside the guest hurts the guest
    // (the one hurt: mortal, and nothing of its own between it and the blow - no time unhurt, no overshield (a crystal picked up, a perk),
    // no shield of a skill: a friend's grenade is 2% of its damage, a couple of points, and an overshield took all of it. Still, so that
    // where the other screen sees it is where it is; the health looked at until it drops, not once after a set time)
    const bare = 'G.game.dev = { god: false, speed: 1 }; (() => { const P = G.player; P.invulnT = 0; P.os = 0; P.tShields = []; P.vel.set(0, 0, 0); P.hp = P.stats.maxHp; window.__hp = P.hp; return 1; })()';
    const seenAt = async (pg, other, id) => { const p = JSON.parse(await pg.eval('JSON.stringify(G.player.pos)')); await other.until(`G.Coop.players.get(${id}).to.distanceTo(new THREE.Vector3(${p.x}, ${p.y}, ${p.z})) < 0.8`, 5000).catch(() => {}); };
    await g.eval(bare);
    await seenAt(g, h, 1);
    await h.eval("(() => { const p = G.Coop.players.get(1).to.clone(); G.combat.explode(p, 5, 120, { src: 'explosion', grenade: true }); })(); 1");
    await g.until('G.player.hp < window.__hp', 5000).catch(() => {});
    check(await g.eval('G.player.hp < window.__hp'), 'a grenade of someone else that goes off beside you hurts you');
    check(+(await g.eval('window.__fx')) >= 1, 'its explosion is drawn on the guest screen');
    // ---- every kind of projectile the game has, thrown by the host: each one is drawn on the guest with no error
    const kinds = await h.eval("JSON.stringify(['rocket', 'arrow', 'nail', 'bolt', 'harpoon', 'spear', 'icespear', 'orb', 'soul', 'fireball', 'bigfire', 'darkorb', 'frostorb', 'rock', 'bottle', 'dyna', 'grenade'].map((k) => [k, k]).concat(G.ITEMS.filter((i) => i.cat === 'grenade').map((i) => ['grenade', 'gl_' + i.id])))");
    const list = JSON.parse(kinds);
    await g.eval('window.__seen = new Set(); (() => { const a = G.combat.projectiles, push = a.push; a.push = function (p) { if (p && p.owner === "remote") window.__seen.add(p.look || p.kind); return push.apply(a, arguments); }; })(); 1');   // (taken as each picture is made, not by looking now and then: one whose way meets a foe at once is gone within a frame, as on the thrower's screen)
    for (const [k, look] of list) {
      await h.eval(`G.combat.spawnProjectile({ kind: ${JSON.stringify(k)}, look: ${look === k ? 'undefined' : JSON.stringify(look)}, pos: G.player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), vel: new THREE.Vector3(0, 3, -10), grav: 8, owner: 'player', dmg: 1, radius: 0.12, life: 2, explode: 3, info: { src: 'explosion' } }); 1`);
      await sleep(60);
    }
    await sleep(1500);
    const seen = JSON.parse(await g.eval('JSON.stringify([...window.__seen])'));
    check(list.every(([, look]) => seen.includes(look)), `all ${list.length} kinds of projectile were drawn on the guest` + (list.length === seen.length ? '' : ' (missing: ' + list.filter(([, l]) => !seen.includes(l)).map((x) => x[1]).join(' ') + ')'));
    // ---- a blow of a foe that has picked the guest (the host sends it down the wire)
    await g.eval(bare);
    await h.eval("(() => { G.Coop.swap = G.Coop.players.get(1); try { G.combat.damagePlayer(10, { src: 'melee' }); } finally { G.Coop.swap = null; } })(); 1");
    await g.until('G.player.hp < window.__hp', 5000).catch(() => {});
    check(await g.eval('G.player.hp < window.__hp'), 'a blow the host works out for a foe on the guest lands on the guest');
    // ---- the other way round, and a skill's ring
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await h.eval(bare);
    await seenAt(h, g, 0);
    await g.eval("(() => { const p = G.Coop.players.get(0).to.clone(); G.combat.explode(p, 5, 120, { src: 'explosion', grenade: true }); })(); 1");
    await h.until('G.player.hp < window.__hp', 5000).catch(() => {});
    check(await h.eval('G.player.hp < window.__hp'), 'and the guest grenade hurts the host');
    await h.eval('G.game.dev = { god: true, speed: 1 }; 1');
    // ---- zones and auras of the other player: nothing breaks, nothing stays
    await h.eval("(() => { const P = G.player; G.combat.zone(P.pos.clone(), 4, 2, 'fire', 0); G.abilities.auras.push({ kind: 'fire', t: 2, r: 4, dps: 0, follow: true, col: 0xff7030 }); G.abilities.auras.push({ kind: 'holy', t: 2, r: 4, dps: 0, c: P.pos.clone() }); })(); 1");
    await sleep(600);
    check(await g.eval('G.Coop.vizCount() >= 3'), 'the zone and the two auras of the host are drawn on the guest');
    check(await g.until('G.Coop.vizCount() === 0', 9000).then(() => true, () => false), 'and are gone when their time is');
    check(!h.errs.length, 'no errors on the host ' + h.errs.slice(0, 3).join(' | '));
    check(!g.errs.length, 'no errors on the guest ' + g.errs.slice(0, 3).join(' | '));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nFX TEST FAILED (${fails.length})` : '\nFX TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
