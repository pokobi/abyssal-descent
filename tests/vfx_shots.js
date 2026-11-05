'use strict';
// Development aid (not part of check.js): casts skills / ultimates on a flat arena among dummies that do not move, and for each one
// writes how many dummies it hit and a screenshot taken a set time after the cast, from a camera placed to see the whole effect.
//   node tests/vfx_shots.js <out dir> <id[@ms][:view]> ...    view: top | side | fp (first person)    e.g. ult_tsunami@600:side frostnova@200
// With VFX_DEBUG=1 the hit shapes (G.vfx.debug) are drawn too.
const path = require('path'), fs = require('fs');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9999;
process.env.COOP_W = process.env.COOP_W || '1280'; process.env.COOP_H = process.env.COOP_H || '720';
(async () => {
  const out = path.resolve(process.argv[2] || 'shots'); fs.mkdirSync(out, { recursive: true });
  const items = process.argv.slice(3);
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const res = {};
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.save.data.settings.dmgNums = true; G.game.startRun({ id: 'normal', lv: 0 }, 0); G.game.dev = { god: true, speed: 1 }; 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await sleep(800);
    // the guardian's arena: wide and flat. Step in once so the fight starts, then send the guardian away for good.
    await p.eval("G.bosses.forArea = () => 'colossus'; G.game.area = 4; G.game.transitioning = false; G.ui.clearScreen(); G.game.state = 'playing'; G.game.enterArea(5, 'boss'); 1");
    await p.until("G.game.stage === 'boss' && !!G.world.arenaCenter", 30000);
    await sleep(1500);
    await p.eval("(() => { const w = G.world, c = w.arenaCenter; G.ui.clearScreen(); G.game.state = 'playing'; G.player.pos.set(c.x, 0.1, c.z); G.player.grounded = true; })(); 1");
    await p.until('!!G.bosses.active', 20000).catch(() => {});
    await sleep(500);
    await p.eval(`(() => {
      G.bosses.clear(); G.ui.clearScreen(); G.game.state = 'playing'; G.vfx.debug = ${process.env.VFX_DEBUG ? 'true' : 'false'};
      const w = G.world, V = (x, y, z) => new THREE.Vector3(x, y, z);
      window.__C = w.arenaCenter.clone(); __C.y = Math.max(0, w.floorBelow(__C.x, 3, __C.z));
      window.__stage = (n, spread, back) => {
        const P = G.player, c = __C; P.pos.set(c.x, c.y + 0.05, c.z - back); P.vel.set(0, 0, 0); P.yaw = Math.PI; P.pitch = -0.12; P.hp = P.stats.maxHp;
        G.enemies.clear(); if (G.bosses.active) G.bosses.clear(); G.abilities.clearUltAuras(); G.combat.zones.length = 0; G.game.chronoT = 0; P.bladesT = 0;
        const def = G.ENEMY_BY_ID.skeleton_normal || G.ENEMIES[0]; let s = 7;
        const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let i = 0, tries = 0; i < n && tries < 400; tries++) {
          const q = V(c.x + (rnd() - 0.5) * spread, c.y, c.z - back + 2 + rnd() * spread * 1.1);
          if (Math.abs(w.floorBelow(q.x, c.y + 2, q.z) - c.y) > 0.3) continue; // (not into the pit in the middle of the arena)
          const e = G.enemies.spawn(def, 1, q, { noLoot: true }); if (e) { e.hp = e.maxHp = 1e7; e.speed = 0; G.combat.stun(e, 999); } i++;
        }
      };
      window.__view = (kind) => {
        const P = G.player, c = __C;
        if (kind === 'fp') { G.game.camHook = null; return; }
        const at = V(c.x, c.y, c.z - 2);
        const cam = kind === 'side' ? V(c.x + 26, c.y + 8, c.z - 4) : V(c.x + 12, c.y + 24, c.z - 22);
        G.game.camHook = (k) => { k.position.copy(cam); k.lookAt(at.x, at.y + 0.5, at.z); k.fov = 62; k.updateProjectionMatrix(); };
      };
      // (VFX_LOG: every hit, with its distance from where the cast was centred)
      window.__log = []; window.__c0 = null;
      if (!window.__dmWrapped) { window.__dmWrapped = true; const C = G.combat, dm = C.damageEnemy, ex = C.explode; C.explode = function (pos, r) { window.__blast = [pos.clone(), r]; return ex.apply(this, arguments); }; C.damageEnemy = function (e, d, info) { const c0 = (window.__blast && info && info.src === 'explosion' ? window.__blast[0] : null) || __c0 || G.player.pos; const dd = Math.hypot(e.pos.x - c0.x, e.pos.z - c0.z); __log.push([Math.round(dd * 10) / 10, Math.round(e.radius * 10) / 10, Math.round(d), (info && info.src) || '', (info && (info.elem || info.el)) || '', info && info.proc ? 'proc' : '', Math.round(e.centerPos().distanceTo(c0) * 10) / 10, dd > 6 ? (new Error().stack || '').split(String.fromCharCode(10)).slice(2, 7).map((l) => l.trim().split('/js/').pop()).join(' < ') : '']); return dm.apply(this, arguments); }; }
      window.__cast = (id) => { __log.length = 0; if (/^g_/.test(id)) { const P = G.player, f = P.forward().setY(0).normalize(), q = P.pos.clone().addScaledVector(f, 9); q.y = G.world.floorBelow(q.x, q.y + 2, q.z) + 0.3; __c0 = q.clone(); G.combat.curSk = null; G.abilities.grenadeEffect(id, q, 200); return; } __c0 = G.player.pos.clone(); __castSk(id); };
      window.__castSk = (id) => { const A = G.abilities, P = G.player, def = G.SKILL_BY_ID[id]; const i = def.ult ? 0 : 1; P.skills[i] = A.makeSlot(id); P.skills[i].cd = 0; if (P.skills[i].maxCharges) P.skills[i].charges = P.skills[i].maxCharges; A.cast(P.skills[i]); };
      window.__hits = () => G.enemies.list.filter((e) => e.alive && e.hp < 1e7).length;
    })(); 1`);
    for (const item of items) {
      const m = item.match(/^([a-z_0-9]+)(?:@(\d+))?(?::(\w+))?$/); if (!m) continue;
      const id = m[1], ms = +(m[2] || 700), view = m[3] || 'top';
      await p.eval(`__stage(${process.env.VFX_N || 14}, ${process.env.VFX_SPREAD || 16}, ${process.env.VFX_BACK || 10}); __view('fp'); 1`);
      if (process.env.VFX_TRACE) console.log('  before', id, await p.eval("JSON.stringify({ zones: G.combat.zones.map((z) => z.kind + ':' + Math.round(z.t * 10) / 10 + '/' + z.dur), vx: G.vfx.liveCount(), auras: G.abilities.auras.length, tasks: G.abilities.tasks.length })"));
      await sleep(120);
      const e0 = p.errs.length;
      await p.eval(`__cast('${id}'); __view('${view}'); 1`);
      await sleep(ms);
      const file = path.join(out, `${id}_${ms}_${view}.png`);
      await p.shot(file);
      await sleep(Math.max(0, 1800 - ms));
      res[id] = { hits: await p.eval('__hits()'), errs: p.errs.slice(e0).map((s) => s.slice(0, 160)), file };
      if (process.env.VFX_LOG) res[id].log = await p.eval('JSON.stringify(__log.slice(0, 40))');
      if (process.env.VFX_LOG) res[id].blast = await p.eval("JSON.stringify(window.__blast ? [window.__blast[1], Math.round(window.__blast[0].distanceTo(__c0 || G.player.pos) * 10) / 10] : null)");
      if (process.env.VFX_LOG) res[id].stats = await p.eval("JSON.stringify({ expR: G.player.stats.explosionRadius, cls: G.player.cls, buffs: [...G.player.buffs.keys()] })");
      if (process.env.VFX_LOG) res[id].refs = await p.eval("JSON.stringify(G.enemies.list.filter((e) => e.alive).slice(0, 6).map((e) => [e.centerRef ? Math.round(e.centerRef.distanceTo(e.centerPos()) * 100) / 100 : 'none', Math.round(e.pos.y * 100) / 100, e.multiPart ? 'mp' : '', e.hitW ? e.hitW.length : 0]))");
      console.log(id, JSON.stringify(res[id]));
    }
  } catch (e) { console.log('crashed', e && e.message || e); }
  finally { ch.close(); srv.close(); }
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(res, null, 1));
})();
