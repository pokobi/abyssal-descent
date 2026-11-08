'use strict';
// What the sky does to the fight (its looks are in skyvary.js). Only what falls from it counts:
//   rain, drizzle, a dripping vault -> water;  snow, frost -> ice;  embers, blue embers, a far fire's sparks -> fire.
// The weather keeps its element on you and on every foe in the area (element.js envPlayer / envEnemy): laid on when there is none,
// kept up while it lasts, but it never sets off a reaction by itself. An element already on you or on a foe stays, and one just spent
// in a reaction is left bare a moment before the weather comes back. Guardians are left out of it.
// Lightning (the stormy moods, `bolt`): while you fight, a bolt now and then comes down near you or near a foe, a ring on the ground
// a moment first. It hurts whoever is inside and leaves volt: on someone wet from the rain that is 漏電.
// Each screen runs its own weather around its own player (in co-op the foes are the host's: a guest's bolts never hit them).
// Under a roof the sky does not reach: no element is laid on whoever stands under one (you or a foe), and no bolt comes down there.
(function () {
  const W = (G.Weather = {});
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  W.BARE = 2.5; // s a target stays bare after a reaction spent its element, before the weather lays it on again
  W.BOLT_R = 2.6; // m: the ring of a bolt
  W.BOLT_WARN = 1.3; // s between the ring and the strike
  const TIP = { water: '自分にも敵にも水属性が付き続ける', ice: '自分にも敵にも氷属性が付き続ける', fire: '自分にも敵にも炎属性が付き続ける' };
  let tickT = 0, boltT = 8, bolts = [], seen = null;
  W.strikes = 0; // (counted for the tests)
  W.pending = () => bolts.length;

  W.mood = () => { const w = G.world; return (w && w.sky) || null; };
  // a roof over (x, z) above a body standing at y, h tall: anything solid overhead (a roof, a bridge's deck, an overhang, the ceiling
  // of a low passage, the road of the turn above). The area's own vault (one collider over nearly all of it: the sky of a hall under
  // the ground) is not a roof, nor is anything gone (a broken tile, a sunk pillar).
  W.roofed = function (x, y, z, h) {
    const w = G.world; if (!w || !w.query) return false;
    const top = y + (h || 1.7);
    for (const c of w.query(x - 0.05, top, z - 0.05, x + 0.05, top + 40, z + 0.05)) {
      if (c.alive === false || c.enemyOnly || c.y0 < top - 0.05) continue;
      if (c.x1 - c.x0 >= w.W * 0.8 && c.z1 - c.z0 >= w.D * 0.8) continue;
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      return true;
    }
    return false;
  };
  W.reset = function () { for (const b of bolts) if (b.tele) G.fx.endTelegraph(b.tele); bolts = []; boltT = 6 + Math.random() * 6; tickT = 0; };

  W.update = function (dt) {
    const GM = G.game, P = G.player, EL = G.Elem, v = W.mood();
    if (!v || !EL || !P || GM.state !== 'playing') return;
    if (!seen || seen.run !== GM.run) seen = { run: GM.run, k: {} };
    // ---- the element it keeps on everyone ----
    if (v.el) {
      tickT -= dt;
      if (tickT <= 0) {
        tickT = 0.5;
        if (!P.dead && !W.roofed(P.pos.x, P.pos.y, P.pos.z, 1.7) && EL.envPlayer(v.el, W.BARE) && !seen.k[v.id + v.el]) { seen.k[v.id + v.el] = true; G.ui.toastSmall(`${EL.BY[v.el].icon} ${v.name}：${TIP[v.el]}`); }
        for (const e of G.enemies.list) if (e.alive && !e._rep && !e.custom && !e.boss && !e.burrowed && !W.roofed(e.pos.x, e.pos.y, e.pos.z, e.height || 1.7)) EL.envEnemy(e, v.el, W.BARE);
      }
    }
    // ---- lightning ----
    if (v.bolt) updateBolts(dt, v);
  };

  function fighting() {
    const GM = G.game;
    return !GM.areaCleared && GM.stage !== 'boss' && G.enemies.list.some((e) => e.alive && !e.custom);
  }
  // where a bolt may come down: open ground (not over the void, not inside a wall) near p
  function spotNear(p, spread) {
    const w = G.world;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * spread;
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (x < 1.5 || z < 1.5 || x > w.W - 1.5 || z > w.D - 1.5) continue;
      const y = w.floorBelow(x, p.y + 1.5, z);
      if (y < w.killY || Math.abs(y - p.y) > 3) continue;
      if (!w.boxFree(x - 0.3, y + 0.1, z - 0.3, x + 0.3, y + 1.8, z + 0.3)) continue;
      if (W.roofed(x, y, z, 1.8)) continue; // (not under a roof)
      return V(x, y, z);
    }
    return null;
  }
  function updateBolts(dt, v) {
    const P = G.player;
    for (const b of bolts.slice()) {
      b.t += dt;
      if (b.t >= W.BOLT_WARN) { bolts.splice(bolts.indexOf(b), 1); strike(b); }
    }
    if (P.dead || !fighting()) return;
    boltT -= dt;
    if (boltT > 0) return;
    boltT = 6 + Math.random() * 7;
    // near you more often than not; otherwise next to one of the foes near you
    let at = null;
    if (Math.random() < 0.55) at = spotNear(P.pos, 5);
    else {
      const near = G.enemies.list.filter((e) => e.alive && !e._rep && !e.custom && !e.flyer && e.pos.distanceTo(P.pos) < 30);
      if (near.length) at = spotNear(U.pick(near).pos, 1.5);
    }
    if (!at) return;
    bolts.push({ p: at, t: 0, tele: G.fx.telegraph(at, W.BOLT_R, W.BOLT_WARN, 0x8fb0ff) });
  }
  function strike(b) {
    const P = G.player, C = G.combat, p = b.p, r = W.BOLT_R;
    if (b.tele) G.fx.endTelegraph(b.tele);
    W.strikes++;
    // the thick lower bolt with its flash, shock ring and sparks (fx.js strike), and the rest of it up into the clouds
    const top = V(p.x + U.rand(-1, 1), p.y + 13.5, p.z + U.rand(-1, 1));
    G.fx.strike(p.clone().setY(p.y + 0.05), 0xd8e4ff, true);
    G.fx.lightning(V(p.x + U.rand(-5, 5), p.y + 42, p.z + U.rand(-5, 5)), top, 0xcfe0ff);
    G.fx.lightning(V(p.x + U.rand(-6, 6), p.y + 40, p.z + U.rand(-6, 6)), top, 0xb8ccff);
    G.fx.sparks(p.clone().setY(p.y + 0.2), V(0, 1, 0), 18, 0xd8e4ff, 7);
    if (G.Sky && G.Sky.flashNow) G.Sky.flashNow();
    if (G.sfx.thunder) G.sfx.thunder(0);
    P.addShake && P.addShake(Math.max(0, 0.35 - P.pos.distanceTo(p) * 0.02));
    if (!P.dead && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < r && Math.abs(P.pos.y - p.y) < 2.5 && !W.roofed(P.pos.x, P.pos.y, P.pos.z, 1.7)) C.damagePlayer(P.stats.maxHp * 0.08, { src: 'aoe', pos: p.clone(), el: 'volt' });
    for (const e of G.enemies.list) {
      if (!e.alive || e._rep || e.custom || e.boss || W.roofed(e.pos.x, e.pos.y, e.pos.z, e.height || 1.7)) continue;
      if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < r + (e.radius || 0.5) * 0.5 && Math.abs(e.pos.y - p.y) < 3) C.damageEnemy(e, e.maxHp * 0.08, { src: 'env', el: 'volt' });
    }
  }
  // (development / tests: a bolt right here, now)
  W.boltAt = function (p) { strike({ p: p.clone() }); };
})();
