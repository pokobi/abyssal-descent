'use strict';
// The foe's defence and gunfire heard, in co-op (js/coop/host.js, client.js, core.js):
//  - a guest's 防御無視 makes its blows land harder on the host's foe, and the host's own 防御無視 is not put on them again;
//  - 防御ダウン on a host's foe is shown on the guest's screen (and counts in the guest's blows); one the guest puts on reaches the host;
//  - a guest's shot is heard by the host's foes from the guest's muzzle (a quarter of the reach suppressed), even while the guest is
//    invisible; three shots from one place give that guest away, and the foe goes for that guest, not for the host standing nearer;
//  - a foe the guest hits goes to look where the guest fired from.
const path = require('path');
const { serve, launch, sleep } = require('./cdp');
const ROOT = path.resolve(__dirname, '..', '..');
const PORT = +process.env.COOP_PORT || 9994;
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const q = '&local=1&lat=30&jit=10', room = 'D' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const h = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&host=1&name=Host${q}`);
    await h.until('window.G && G.Coop && G.Coop.role === "host" && G.game.state === "title"', 90000);
    await h.booted();
    await sleep(300);
    const g = await ch.page(`http://127.0.0.1:${PORT}/coop.html?room=${room}&name=Guest${q}`);
    await g.booted();
    await g.until('window.G && G.Coop && G.Coop.id === 1', 90000);
    const off = 'G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; 1';
    await h.eval(off); await g.eval(off);
    await h.eval('G.Coop.begin(); G.game.dev = { god: true, speed: 1 }; 1');
    await g.until('G.game.run && G.Coop.fpOk !== undefined', 60000);
    for (const pg of [h, g]) await pg.running();
    await g.eval('G.game.dev = { god: true, speed: 1 }; 1');
    await sleep(1500);
    const play = 'G.ui.clearScreen(); G.game.state = "playing"; 1';
    await h.eval(play); await g.eval(play);
    // the host's other foes out of the way, one foe of the test's own beside the host, all held still
    const nid = await h.eval(`(() => {
      const GM = G.game; GM.dev = { god: true, speed: 1, freeze: true };
      for (const e of G.enemies.list) if (e.alive && !e.custom) { e.alive = false; e.remove(); e.removed = true; }
      const P = G.player, e = GM.spawnEnemy({ def: G.ENEMY_BY_ID.skeleton_normal, at: { x: P.pos.x + 3, y: P.pos.y, z: P.pos.z } });
      e.maxHp = e.hp = 1e6; e.shield = e.maxShield = 0; e.elite = false; e.mut = null; e.dmgMul = null; e.inv = null; e.defDown = null;
      window.__F = e; return -1;
    })()`);
    await h.until('window.__F._nid > 0', 5000);
    const id = await h.eval('window.__F._nid');
    check(nid === -1 && id > 0, 'a foe of the test\'s own is sent to the guest (#' + id + ')');
    await g.until(`G.enemies.list.some((x) => x._nid === ${id} && x.alive)`, 8000);
    const rep = `G.enemies.list.find((x) => x._nid === ${id})`;
    // the guest a few metres off the foe, still
    await g.eval(`(() => { const P = G.player, f = ${rep}; P.pos.set(f.pos.x + 6, f.pos.y, f.pos.z); P.vel.set(0, 0, 0); })(); ${play}`);
    await sleep(400);

    // ---------------- the defence ----------------
    const hit = async (gIgn, hIgn) => {
      const hp0 = await h.eval(`G.player.stats.defIgnore = ${hIgn}; window.__F.hp`);
      await g.eval(`(() => { const P = G.player; P.stats.critChance = 0; P.stats.defIgnore = ${gIgn}; P.stats.elemChance = 0; G.combat.damageEnemy(${rep}, 100, { src: 'bullet' }); P.stats.defIgnore = 0; })(); 1`);
      await h.until(`window.__F.hp < ${hp0} - 0.01`, 5000).catch(() => {});
      const hp1 = await h.eval('window.__F.hp');
      await h.eval('G.player.stats.defIgnore = 0; 1');
      await sleep(250);
      return hp0 - hp1;
    };
    const d0 = await hit(0, 0), d1 = await hit(1, 0), d2 = await hit(0, 1);
    check(d0 > 0, `a guest's blow lands on the host's foe (${d0.toFixed(1)})`);
    check(d0 > 0 && Math.abs(d1 / d0 - 2) < 0.1, `the guest's 防御無視 100% doubles it on the host (${d1.toFixed(1)} = x${(d1 / (d0 || 1)).toFixed(2)})`);
    check(d0 > 0 && Math.abs(d2 / d0 - 1) < 0.05, `the host's own 防御無視 is not put on the guest's blow (${d2.toFixed(1)} = x${(d2 / (d0 || 1)).toFixed(2)})`);
    // 防御ダウン the host puts on: shown on the guest's screen, and counted in the guest's blow
    await h.eval('G.combat.defDown(window.__F, "test", 0.3, 20); 1');
    await g.until(`G.combat.defDownOf(${rep}) > 0.29`, 3000).catch(() => {});
    check(Math.abs(await g.eval(`G.combat.defDownOf(${rep})`) - 0.3) < 0.01, '防御ダウン on the host\'s foe reaches the guest (30%)');
    // (the bar is up while the foe is looked at: the guest turned to it)
    await g.eval(`(() => { const P = G.player, e = ${rep}, c = e.centerPos(), o = G.camera.position; const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz)); e.showBar = true; })(); ${play}`);
    await g.frames(6);
    // (the bar is put up by the guest's own frames: looked at again for a moment if it is not up yet)
    for (let i = 0; i < 8 && !(await g.eval(`(() => { const e = ${rep}; G.enemies.updateBars(); return !!(e.bar && e.bar.dd.style.display === ''); })()`)); i++) await g.frames(3);
    const bar = await g.eval(`(() => { const e = ${rep}; G.enemies.updateBars(); if (e.bar) return e.bar.dd.style.display; const s = {}; G.fx.project(new THREE.Vector3(e.pos.x, e.pos.y + e.height + 0.35, e.pos.z), s); return 'no bar ' + JSON.stringify({ alive: e.alive, st: e.state, bur: e.burrowed, cl: e.cloakOn, ut: e.untargetable, nb: e.noBar, d: +e.pos.distanceTo(G.player.pos).toFixed(1), scr: s, gs: G.game.state }); })()`);
    check(bar === '', `the cracked shield on the guest's bar of that foe is shown (display "${bar}")`);
    const d3 = await hit(0, 0);
    check(d0 > 0 && Math.abs(d3 / d0 - 2 / 1.7) < 0.06, `and the guest's blow counts it (x${(d3 / (d0 || 1)).toFixed(3)}, want x${(2 / 1.7).toFixed(3)})`);
    // 防御ダウン the guest puts on (a skill, a perk, a round of 削岩弾): reaches the host
    await g.eval(`G.combat.defDown(${rep}, 'gtest', 0.2, 20); G.combat.defStack(${rep}, 'gstk', 0.05, 0.3, 20); G.combat.defStack(${rep}, 'gstk', 0.05, 0.3, 20); 1`);
    await h.until('window.__F.defDown && window.__F.defDown.gtest && window.__F.defDown.gstk', 3000).catch(() => {});
    const hd = JSON.parse(await h.eval('JSON.stringify(window.__F.defDown || {})'));
    check(hd.gtest && Math.abs(hd.gtest.v - 0.2) < 0.01 && hd.gstk && Math.abs(hd.gstk.v - 0.1) < 0.01, `防御ダウン the guest puts on reaches the host (${JSON.stringify(hd)})`);
    // gone on the host: gone on the guest too
    await h.eval('window.__F.defDown = null; 1');
    await g.until(`G.combat.defDownOf(${rep}) === 0`, 3000).catch(() => {});
    check(await g.eval(`G.combat.defDownOf(${rep})`) === 0, 'and when it is gone on the host, it is gone on the guest');

    // ---------------- gunfire heard ----------------
    await g.eval('(() => { const P = G.player; P.invisT = 60; if (P.weapon) P.weapon.mag = 999; P.pitch = 1.45; })(); 1');
    const arch = await g.eval('G.player.weapon ? G.player.weapon.def.arch : ""');
    const R = await h.eval(`G.enemies.HEAR[${JSON.stringify(arch)}] || 40`);
    // the guest at 60% of the reach of its gun (a quarter of it, suppressed, does not get there); the host by the foe
    // (on open ground the player can stand on: a spot off the floor would be put back where it was)
    const spot = JSON.parse(await g.eval(`(() => { const P = G.player, f = ${rep}, w = G.world; const c = w.randomOpenCell(new G.RNG(7), (x, z, i) => (!w.reachMask || w.reachMask[i]) && Math.hypot(x - f.pos.x, z - f.pos.z) > ${R * 0.5} && Math.hypot(x - f.pos.x, z - f.pos.z) < ${R * 0.65}); if (c) { P.pos.set(c.x, c.y + 0.05, c.z); P.vel.set(0, 0, 0); } P.pitch = 1.45; return JSON.stringify(c); })()`));
    await g.eval(play);
    await sleep(700);
    const gd = await g.eval(`Math.hypot(G.player.pos.x - ${rep}.pos.x, G.player.pos.z - ${rep}.pos.z)`);
    check(!!spot && gd > R * 0.45, `the guest stands ${gd.toFixed(1)} m from the foe (the reach ${R} m, suppressed ${R / 4} m)`);
    check(await h.eval('(() => { const rp = G.Coop.players.get(1); return !!rp && (rp.ps & 16) > 0; })()'), 'the guest is invisible for the host\'s foes');
    const shoot = (hush) => g.eval(`(() => { const W = G.weapons, w = G.player.weapon, s = W.stats(w); w.mag = 999; G.player.pitch = 1.45; W.shoot(w, ${hush ? 'Object.assign({}, s, { hush: true })' : 's'}); })(); 1`);
    const clear = 'window.__F.inv = null; window.__F.spotT = 0; window.__F._spotBy = undefined; { const rp = G.Coop.players.get(1); rp.shotLog = []; } 1';
    await h.eval(clear);
    await shoot(true);
    await sleep(900);
    check(await h.eval('!window.__F.inv'), `a suppressed shot is not heard from ${gd.toFixed(1)} m (${arch}: ${R} m, suppressed ${R / 4} m)`);
    await h.eval(clear);
    await sleep(500);
    await shoot(false);
    await h.until('!!window.__F.inv', 3000).catch(() => {});
    const iv = JSON.parse(await h.eval('JSON.stringify(window.__F.inv ? { p: window.__F.inv.p, left: window.__F.inv.end - G.game.time } : null)'));
    const gp = JSON.parse(await g.eval('JSON.stringify(G.player.pos)'));
    check(!!iv && Math.hypot(iv.p.x - gp.x, iv.p.z - gp.z) < 1.5 && iv.left > 5, `a shot is heard by the host's foe, and it goes to look where the invisible guest fired from (${iv ? `${Math.hypot(iv.p.x - gp.x, iv.p.z - gp.z).toFixed(2)} m off, ${iv.left.toFixed(1)} s` : 'not heard'})`);
    check(await h.eval('!(window.__F.spotT > 0)'), 'one shot does not give the guest away');
    await sleep(600); await shoot(false); await sleep(600); await shoot(false);
    await h.until('window.__F.spotT > 0', 3000).catch(() => {});
    check(await h.eval('window.__F.spotT > 0 && window.__F._spotBy === 1'), `three shots from one place give the guest away (spotT ${await h.eval('window.__F.spotT')}, by ${await h.eval('window.__F._spotBy')})`);
    await sleep(400);
    const near = await h.eval('(() => { const f = window.__F, rp = G.Coop.players.get(1); return [f.pos.distanceTo(G.player.pos), f.pos.distanceTo(rp.to), f._cp]; })()');
    check(near[0] < near[1] && near[2] === 1, `the foe goes for the guest who gave themself away, not for the host nearer to it (host ${near[0].toFixed(1)} m, guest ${near[1].toFixed(1)} m, target ${near[2]})`);
    // the host's own shots: counted on their own, and a foe given away by them goes for the host
    await h.eval(clear);
    // a foe the guest hits goes to look where the guest fired from
    await h.eval('window.__F.inv = null; window.__F.spotT = 0; 1');
    await g.eval(`G.combat.damageEnemy(${rep}, 5, { src: 'bullet' }); 1`);
    await h.until('!!window.__F.inv', 3000).catch(() => {});
    const iv2 = JSON.parse(await h.eval('JSON.stringify(window.__F.inv ? { p: window.__F.inv.p, hit: window.__F.inv.hit } : null)'));
    check(!!iv2 && iv2.hit && Math.hypot(iv2.p.x - gp.x, iv2.p.z - gp.z) < 1.5, `a foe the guest hits goes to look where the guest fired from (${iv2 ? Math.hypot(iv2.p.x - gp.x, iv2.p.z - gp.z).toFixed(2) + ' m off' : 'did not'})`);
    // the host's own shots still work as in solo, and give the host away
    await h.eval(`(() => { const P = G.player; if (P.weapon) P.weapon.mag = 999; P.pitch = 1.45; window.__F.inv = null; window.__F.spotT = 0; })(); ${play}`);
    const hs = 'G.weapons.shoot(G.player.weapon, G.weapons.stats(G.player.weapon)); 1';
    await h.eval(hs); await h.gameFor(0.5); await h.eval(hs); await h.gameFor(0.5); await h.eval(hs);
    check(await h.eval('!!window.__F.inv && window.__F.spotT > 0 && window.__F._spotBy === 0'), `the host's own three shots give the host away (${await h.eval('JSON.stringify([!!window.__F.inv, window.__F.spotT, window.__F._spotBy])')})`);
    await sleep(300);
    check(await h.eval('window.__F._cp === 0'), 'and that foe goes for the host');
    check(!h.errs.length && !g.errs.length, 'no errors ' + h.errs.concat(g.errs).slice(0, 3).join(' | ').slice(0, 500));
  } finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nSYNC DEF TEST FAILED (${fails.length})` : '\nSYNC DEF TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
