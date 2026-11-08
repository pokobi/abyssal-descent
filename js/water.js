'use strict';
// The water of the fields, alive: what touches it makes it move and sound like water.
//  - ripples: a step, a landing, a shot, a blast, a foe wading, a drip from the vault, the foot of a fall: each starts a ring on the
//    surface (textures.js waterize draws them from T.waterU.uRip, a ring buffer of 16)
//  - splashes: droplets thrown up and falling back, a crown, a puff of mist; a blast throws up a column
//  - the area's current (the flooded halls run toward their gates, the village stream runs across): T.waterU.uFlow
//  - sound: your feet in the water (audio.js step 'water'), wading, splashes; the roar of the falls, the stream's babble, the lap of a
//    pool near you (one bed each in audio.js, its level and side set from here a few times a second)
// Only looks and sound: what the water does in the fight (slow, the water element) is fields.js / element.js.
(function () {
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const R = Math.random, rnd = (a, b) => a + R() * (b - a);
  const Wt = (G.Water = { falls: [], streams: [], zones: [] });
  let ri = 0, sndT = 0, wadeT = 0, dripT = 0, fallT = 0;
  const foeT = new WeakMap();
  const U2 = () => G.Tex && G.Tex.waterU;

  // ---------------------------------------------------------------- the area
  Wt.build = function (w) {
    const u = U2(); if (!u) return;
    for (const v of u.uRip.value) v.set(0, 0, -99, 0);
    // the current: set by the generator (w.waterFlow), or read from the old drifting-ripple animation of the flooded halls
    let fx = 0, fz = 0;
    if (w && w.waterFlow) { fx = w.waterFlow.x; fz = w.waterFlow.z; }
    else if (w) for (const a of w.animated || []) if (a.kind === 'uvflow' && a.sp) { fx = a.sp[0] * 7; fz = a.sp[1] * 7; }
    u.uFlow.value.set(fx, fz);
    Wt.zones = (w && w.waterZones) || [];
    Wt.falls = (w && w.waterfalls) || [];
    Wt.streams = (w && w.streams) || [];
    Wt.flooded = !!(w && w.biome === 'flooded');
  };
  // is p in the water (inside a pool, near its surface)? returns the pool
  Wt.at = function (p, below, above) {
    for (const z of Wt.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < (z.y || 0) + (above ?? 0.35) && p.y > (z.y || 0) - (below ?? 0.45) - (z.deep || 0)) return z; // (z.deep: water that deep over its bed)
    return null;
  };
  const surfY = (z) => (z && z.y ? z.y : 0) + 0.06;
  // a ring on the surface at (x, z), s: how strong (0.3 a toe, 1 a landing, 1.5 a blast)
  Wt.ripple = function (x, z, s) {
    const u = U2(); if (!u) return;
    const v = u.uRip.value[ri]; ri = (ri + 1) % u.uRip.value.length;
    v.set(x, z, G.Tex.lavaT.value, Math.min(1.6, s ?? 0.6));
  };

  // ---------------------------------------------------------------- splashes
  // droplets thrown up and out, a crown round the spot, mist; size 0..1.5
  Wt.splash = function (p, size, o) {
    o = o || {};
    size = size ?? 0.6;
    const z = Wt.at(p, 1.2, 1.2), y = z ? surfY(z) : p.y + 0.05, x = p.x, zz = p.z, N = G.fx.norm;
    const n = Math.round(6 + size * 26);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, sp = rnd(0.6, 2.4) * (0.6 + size), up = rnd(1.6, 4.2) * (0.6 + size * 0.7);
      N.spawn(x + Math.cos(a) * 0.1, y + 0.02, zz + Math.sin(a) * 0.1, Math.cos(a) * sp, up, Math.sin(a) * sp, rnd(0.45, 0.85), rnd(0.045, 0.08), 0.025, 0.82, 0.9, 0.95, 0.9, 9.8, 0.4);
    }
    // the crown: a ring of drops thrown outward low, all round
    if (size > 0.45) for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28 + R() * 0.3, sp = (1.6 + size * 1.6); N.spawn(x + Math.cos(a) * 0.3, y + 0.05, zz + Math.sin(a) * 0.3, Math.cos(a) * sp, rnd(1.2, 2.2) * (0.6 + size * 0.5), Math.sin(a) * sp, rnd(0.35, 0.55), 0.07, 0.03, 0.88, 0.94, 0.97, 0.85, 9.8, 0.6); }
    // a column straight up (a shot strikes, a blast throws the water high)
    if (o.column) for (let i = 0; i < 10 + size * 18; i++) N.spawn(x + rnd(-0.15, 0.15) * (1 + size), y, zz + rnd(-0.15, 0.15) * (1 + size), rnd(-0.6, 0.6), rnd(4, 7) * (0.5 + size * 0.6), rnd(-0.6, 0.6), rnd(0.6, 1.1), rnd(0.06, 0.12), 0.04, 0.86, 0.93, 0.97, 0.9, 9.8, 0.25);
    // mist
    for (let i = 0; i < 2 + size * 4; i++) N.spawn(x + rnd(-0.3, 0.3), y + 0.15, zz + rnd(-0.3, 0.3), rnd(-0.4, 0.4), rnd(0.3, 0.9), rnd(-0.4, 0.4), rnd(0.7, 1.3), 0.3 + size * 0.25, 1.0 + size * 0.9, 0.86, 0.92, 0.96, 0.28, -0.1, 1.2);
    Wt.ripple(x, zz, 0.55 + size * 0.6);
    if (size > 0.9) setTimeout(() => Wt.ripple(x, zz, size * 0.5), 140); // (a big one: a second ring after the first)
    if (!o.silent && G.sfx.splash) G.sfx.splash(V(x, y, zz), size);
  };
  // a step of yours in the water (player.js): a ring and a few drops at your feet (the sound is the step's own)
  Wt.step = function (p, k) {
    const z = Wt.at(p); if (!z) return;
    const y = surfY(z), N = G.fx.norm;
    for (let i = 0; i < 4 + k * 6; i++) { const a = R() * 6.28, sp = rnd(0.4, 1.3); N.spawn(p.x + Math.cos(a) * 0.15, y + 0.02, p.z + Math.sin(a) * 0.15, Math.cos(a) * sp, rnd(1.2, 2.6) * (0.6 + k * 0.5), Math.sin(a) * sp, rnd(0.35, 0.6), rnd(0.04, 0.065), 0.02, 0.84, 0.92, 0.96, 0.85, 9.8, 0.4); }
    Wt.ripple(p.x, p.z, 0.45 + k * 0.4);
  };
  // where a shot strikes: in the water it splashes (a plume, a ring, a plunk) instead of kicking up dust; true when it did
  Wt.shot = function (pt) {
    if (!Wt.zones.length || !pt) return false;
    const z = Wt.at(pt, 0.35, 0.25); if (!z) return false;
    Wt.splash(V(pt.x, surfY(z), pt.z), 0.28, { column: true, silent: true });
    if (G.sfx.splash) G.sfx.splash(V(pt.x, surfY(z), pt.z), 0.25);
    return true;
  };
  // a blast at pos with radius r: if water lies under it, it throws up a column and rings
  Wt.blast = function (pos, r) {
    if (!Wt.zones.length) return;
    const z = Wt.at(pos, 0.5, Math.max(1.5, r * 0.6)); if (!z) return;
    Wt.splash(V(pos.x, surfY(z), pos.z), Math.min(1.5, 0.7 + r * 0.12), { column: true });
    for (let i = 0; i < 3; i++) { const a = R() * 6.28, d = r * 0.5; Wt.ripple(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d, 0.8); }
  };

  // ---------------------------------------------------------------- every frame
  Wt.update = function (dt) {
    const w = G.world, P = G.player; if (!w || !P || !U2()) return;
    const GM = G.game;
    // you wading: rings at your feet as you go (the steps make their own splash)
    if (P.inWater && P.speedH > 0.6) { wadeT -= dt; if (wadeT <= 0) { wadeT = 0.24; Wt.ripple(P.pos.x, P.pos.z, 0.25 + Math.min(0.4, P.speedH * 0.05)); } }
    // the foes wading: a ring now and then round each that moves, a few drops
    if (Wt.zones.length) for (const e of G.enemies.list) {
      if (!e.alive || e.flyer || e.removed) continue;
      const t = (foeT.get(e) || 0) - dt; foeT.set(e, t); if (t > 0) continue;
      const mv = e.vel ? Math.hypot(e.vel.x, e.vel.z) + (e.mv || 0) * (e.speed || 0) : 0;
      if (mv < 0.5 || !Wt.at(e.pos)) { foeT.set(e, 0.4); continue; }
      foeT.set(e, 0.32 + R() * 0.1);
      Wt.ripple(e.pos.x, e.pos.z, Math.min(0.7, 0.25 + (e.radius || 0.5) * 0.4));
      if (R() < 0.5) { const N = G.fx.norm; for (let i = 0; i < 3; i++) N.spawn(e.pos.x + rnd(-0.3, 0.3), 0.08, e.pos.z + rnd(-0.3, 0.3), rnd(-0.6, 0.6), rnd(1, 2), rnd(-0.6, 0.6), 0.45, 0.05, 0.02, 0.84, 0.92, 0.96, 0.8, 9.8, 0.4); }
    }
    // the falls: spray and mist where they land, rings spreading from the foot
    fallT -= dt;
    const cp = G.camera ? G.camera.position : P.pos;
    for (const f of Wt.falls) {
      const d = Math.hypot(f.bx - cp.x, f.bz - cp.z); if (d > 45) continue;
      const N = G.fx.norm, k = dt * (d < 20 ? 1 : 0.5);
      for (let i = 0; i < 14 * k * f.wd; i++) N.spawn(f.bx + f.ax * rnd(-0.5, 0.5) * f.wd, 0.1, f.bz + f.az * rnd(-0.5, 0.5) * f.wd, f.nx * rnd(0.5, 2.5) + rnd(-0.6, 0.6), rnd(1.2, 3.2), f.nz * rnd(0.5, 2.5) + rnd(-0.6, 0.6), rnd(0.4, 0.8), rnd(0.05, 0.09), 0.03, 0.86, 0.93, 0.97, 0.85, 9.8, 0.5);
      for (let i = 0; i < 4 * k * f.wd; i++) N.spawn(f.bx + f.ax * rnd(-0.5, 0.5) * f.wd + f.nx * rnd(0.2, 1.4), 0.25, f.bz + f.az * rnd(-0.5, 0.5) * f.wd + f.nz * rnd(0.2, 1.4), f.nx * rnd(0.2, 0.8), rnd(0.2, 0.7), f.nz * rnd(0.2, 0.8), rnd(1.2, 2.0), 0.5, 1.8, 0.85, 0.92, 0.95, 0.22, -0.05, 1.0);
      if (fallT <= 0) Wt.ripple(f.bx + f.nx * rnd(0.4, 1.4) + f.ax * rnd(-0.4, 0.4) * f.wd, f.bz + f.nz * rnd(0.4, 1.4) + f.az * rnd(-0.4, 0.4) * f.wd, rnd(0.5, 0.9));
    }
    if (fallT <= 0) fallT = 0.18;
    // the flooded halls: drops from the vault ring the water round you (with the drip's own sound)
    if (Wt.flooded && GM.state === 'playing') {
      dripT -= dt;
      if (dripT <= 0) {
        dripT = rnd(0.25, 0.7);
        const a = R() * 6.28, d = rnd(2, 14), p = V(cp.x + Math.cos(a) * d, 0, cp.z + Math.sin(a) * d), z = Wt.at(p.setY(0.05), 0.5, 0.5);
        if (z) { Wt.ripple(p.x, p.z, rnd(0.3, 0.55)); G.fx.norm.spawn(p.x, surfY(z) + 0.02, p.z, 0, rnd(0.8, 1.4), 0, 0.3, 0.035, 0.02, 0.85, 0.92, 0.96, 0.8, 9.8, 0); if (R() < 0.35 && G.sfx.drip) G.sfx.drip(p.clone().setY(surfY(z))); }
      }
    }
    // the stream: flecks of foam carried along
    for (const s of Wt.streams) {
      if (Math.abs((s.z0 + s.z1) / 2 - cp.z) > 30 && Math.abs((s.x0 + s.x1) / 2 - cp.x) > 30) continue;
      if (R() < dt * 10) { const u = U2().uFlow.value; G.fx.norm.spawn(U.clamp(cp.x + rnd(-14, 14), s.x0 + 0.3, s.x1 - 0.3), 0.07, rnd(s.z0 + 0.3, s.z1 - 0.3), u.x * 1.2, 0, u.y * 1.2, rnd(1.6, 2.6), 0.06, 0.05, 0.9, 0.95, 0.97, 0.7, 0, 0); }
    }
    // the beds of sound: wading, the nearest fall (its side), the stream, the water round you; a few times a second
    sndT -= dt;
    if (sndT <= 0 && G.sfx.waterBed && !Wt.holdBeds) { // (holdBeds: a test sets the beds itself)
      sndT = 0.1;
      const L = P.pos, side = (x, z) => { const ang = Math.atan2(x - L.x, -(z - L.z)) - (G.sfx.listenerYawNeg || 0), d = Math.hypot(x - L.x, z - L.z); return Math.max(-0.85, Math.min(0.85, Math.sin(ang) * Math.min(1, d / 4))); };
      const rectD = (q) => Math.hypot(Math.max(q.x0 - L.x, 0, L.x - q.x1), Math.max(q.z0 - L.z, 0, L.z - q.z1));
      let fall = 0, fallPan = 0;
      for (const f of Wt.falls) { const d = Math.hypot(f.bx - L.x, f.bz - L.z), v = Math.max(0, 1 / (1 + d * 0.16) - 0.12); if (v > fall) { fall = v; fallPan = side(f.bx, f.bz); } }
      let brook = 0, brookPan = 0;
      for (const s of Wt.streams) { const d = rectD(s), v = Math.pow(Math.max(0, 1 - d / 24), 1.6); if (v > brook) { brook = v; brookPan = side(U.clamp(L.x, s.x0, s.x1), U.clamp(L.z, s.z0, s.z1)); } }
      let lap = 0, lapPan = 0;
      for (const q of Wt.zones) { const d = rectD(q), v = Math.max(0, 1 - d / 12) * Math.min(1, ((q.x1 - q.x0) * (q.z1 - q.z0)) / 60); if (v > lap) { lap = v; lapPan = d > 0.5 ? side(U.clamp(L.x, q.x0, q.x1), U.clamp(L.z, q.z0, q.z1)) : 0; } }
      const wade = P.inWater && !P.dead ? Math.min(1, P.speedH / 6.5) : 0;
      const on = GM.state === 'playing' || GM.state === 'inv';
      G.sfx.waterBed(on ? { wade, fall, fallPan, brook, brookPan, lap: Math.min(1, lap), lapPan } : { wade: 0, fall: 0, brook: 0, lap: 0 });
    }
  };
})();
