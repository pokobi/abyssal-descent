'use strict';
// The four fields of a run (see runplan.js):
//  grave  - outdoors on a moonlit night among graves, fences, dead trees and mausoleums
//  gate   - the dungeon entrance: high vaulted halls with a ceiling, barred windows onto the night outside, moonlight falling in
//  halls  - deeper: two or three storeys joined by stairs, wooden ramps and bridges (walkers route over them; flyers cut across)
//  ruin   - the ruined depths: the same vertical build, collapsed, darker
// plus their guardian approaches (no stairs on the road; a fenced arena outdoors, a long hall + sliding stone door below ground)
// and the ancient stone vending machine that replaces the roadside merchant.
(function () {
  const LG = G.LevelGen, H = LG._, U = G.U;
  const P = () => G.Props;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));
  const F = (G.FieldGen = {});

  // ---------------------------------------------------------------- props
  // iron fence along an axis (bars + rails, one thin collider per run, gaps left open)
  F.fence = function (w, x0, z0, x1, z1, h, gaps) {
    gaps = gaps || [];
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1), c = alongX ? z0 : x0;
    const segs = []; let s = a0;
    for (const [ga, gb] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (ga > s) segs.push([s, ga]); s = Math.max(s, gb); }
    if (s < a1) segs.push([s, a1]);
    for (const [p, q] of segs) {
      if (q - p < 0.3) continue;
      const box = (u0, y0, u1, y1, t, mk, col) => { if (alongX) (col ? w.solid : w.visual).call(w, mk, u0, y0, c - t, u1, y1, c + t, { uv: 1 }); else (col ? w.solid : w.visual).call(w, mk, c - t, y0, u0, c + t, y1, u1, { uv: 1 }); };
      box(p, 0, q, 0.18, 0.12, 'block', false);           // stone kerb
      box(p, h - 0.1, q, h - 0.03, 0.04, 'iron', false);  // top rail
      box(p, 0.35, q, 0.41, 0.04, 'iron', false);         // low rail
      for (let u = p + 0.08; u < q; u += 0.22) box(u, 0.18, u + 0.035, h + 0.18 * ((Math.round(u / 0.22) % 2) ? 1 : 0.5), 0.02, 'iron', false); // bars with spikes
      for (let u = p; u <= q + 0.01; u += Math.max(1.2, (q - p) / Math.ceil((q - p) / 2.4))) box(u - 0.06, 0, u + 0.06, h + 0.25, 0.06, 'iron', false); // posts
      if (alongX) w.addCollider(p, 0, c - 0.08, q, h + 0.2, c + 0.08, { surf: 'metal', noGrapple: true });
      else w.addCollider(c - 0.08, 0, p, c + 0.08, h + 0.2, q, { surf: 'metal', noGrapple: true });
    }
  };
  F.deadTree = function (w, x, z, rng, s) {
    s = s || 1;
    w.addCollider(x - 0.3 * s, 0, z - 0.3 * s, x + 0.3 * s, 4.5 * s, z + 0.3 * s, { surf: 'wood' });
    const trunk = Mx(x, 2.2 * s, z, 0.32 * s, 4.4 * s, 0.32 * s, rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08));
    w.batch.geo('woodDark', PG().cyl8, trunk);
    const n = rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), y = rng.range(2.4, 4.2) * s, L = rng.range(1.2, 2.4) * s, tilt = rng.range(0.6, 1.1);
      const cx = x + Math.cos(a) * L * 0.42 * Math.sin(tilt), cz = z + Math.sin(a) * L * 0.42 * Math.sin(tilt);
      w.batch.geo('woodDark', PG().cyl8, Mx(cx, y + L * 0.3, cz, 0.12 * s, L, 0.12 * s, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt));
      // twigs
      w.batch.geo('woodDark', PG().cyl8, Mx(cx + Math.cos(a) * L * 0.3, y + L * 0.55, cz + Math.sin(a) * L * 0.3, 0.05 * s, L * 0.5, 0.05 * s, Math.sin(a + 0.8) * 0.9, 0, -Math.cos(a + 0.8) * 0.9));
    }
  };
  F.tombs = function (w, x0, z0, x1, z1, rng, facing) {
    // two rows of graves with mounds and the odd candle
    for (let x = x0 + 1.2; x < x1 - 0.8; x += 1.9) for (let r = 0; r < 2; r++) {
      const z = r ? z1 - 1.6 : z0 + 1.6;
      if (rng.chance(0.12)) continue;
      const head = facing > 0 ? z - 1.0 : z + 1.0;
      P().gravestone(w, x, head, 0, 0, rng);
      w.visual('rock', x - 0.38, 0, z - 0.85, x + 0.38, 0.16 + rng.range(0, 0.08), z + 0.85, { uv: 1, grad: false });
      if (rng.chance(0.12)) P().candles(w, x + 0.4, 0, head + 0.2, rng, rng.chance(0.3));
      if (rng.chance(0.06)) P().skull(w, x - 0.25, 0.02, z, rng.range(0, 6), 0.9);
    }
  };
  F.mausoleum = function (w, rng, x0, z0, x1, z1) {
    const h = rng.range(3.6, 4.6), cx = (x0 + x1) / 2, dz = z1; // the door faces +z (south)
    w.solid('block', x0, 0, z0, x0 + 0.5, h, z1, { uv: 2 }); w.solid('block', x1 - 0.5, 0, z0, x1, h, z1, { uv: 2 });
    w.solid('block', x0, 0, z0, x1, h, z0 + 0.5, { uv: 2 });
    w.solid('block', x0, 0, z1 - 0.5, cx - 0.9, h, z1, { uv: 2 }); w.solid('block', cx + 0.9, 0, z1 - 0.5, x1, h, z1, { uv: 2 });
    w.solid('block', cx - 0.9, 2.4, z1 - 0.5, cx + 0.9, h, z1, { uv: 2 });
    w.solid('trim', x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.35, z1 + 0.3, { uv: 2 });
    w.solid('trim', x0 + 0.4, h + 0.35, z0 + 0.4, x1 - 0.4, h + 0.8, z1 - 0.4, { uv: 2, noGrapple: true });
    // pediment + columns
    w.visual('trim', cx - 1.6, h - 0.6, z1, cx + 1.6, h, z1 + 0.25, { uv: 1 });
    for (const sx of [-1.3, 1.3]) w.solid('trim', cx + sx - 0.2, 0, z1, cx + sx + 0.2, h - 0.6, z1 + 0.4, { uv: 1 });
    w.visual('dark', x0 + 0.5, 0, z0 + 0.5, x1 - 0.5, 0.02, z1 - 0.5, { uv: 1, grad: false });
    P().sarcophagus(w, cx, (z0 + z1) / 2 - 0.4, 0, true, rng);
    P().candles(w, cx + 1.2, 0, z0 + 1, rng, true);
    P().skull(w, cx, h - 0.5, z1 + 0.27, 0, 1.2);
  };
  F.lantern = function (w, x, z, col, y) {
    y = y || 0;
    w.solid('iron', x - 0.07, y, z - 0.07, x + 0.07, y + 2.6, z + 0.07, { uv: 1 });
    w.visual('iron', x - 0.3, y + 2.5, z - 0.04, x + 0.07, y + 2.56, z + 0.04, { uv: 1 });
    w.visual('iron', x - 0.42, y + 2.0, z - 0.12, x - 0.18, y + 2.36, z + 0.12, { uv: 1 });
    w.visual('glow', x - 0.38, y + 2.06, z - 0.08, x - 0.22, y + 2.3, z + 0.08, { uv: 1, grad: false });
    w.addLight(x - 0.3, y + 2.2, z, { flame: 0.25, intensity: 6, range: 10, color: col || '#ffb070', prio: 1 });
  };
  // the night outside a barred window: a sky plane with stars (and the moon on one of them)
  F.nightPane = function (w, x, y, z, wd, h, face, moon) {
    w.deferred.push((grp) => {
      if (!F._skyTex) {
        const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#0a1430'); gr.addColorStop(0.55, '#24386a'); gr.addColorStop(1, '#5a74a8');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; g.fillRect(Math.random() * 64, Math.random() * 160, 1, 1); }
        F._skyTex = new THREE.CanvasTexture(c); F._skyTex.colorSpace = THREE.SRGBColorSpace;
      }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, h), new THREE.MeshBasicMaterial({ map: F._skyTex, fog: false }));
      m.position.set(x, y, z); m.rotation.y = face; grp.add(m);
      if (moon) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xe8f0ff, fog: false, depthWrite: false }));
        s.scale.setScalar(Math.min(wd, h) * 0.5); s.position.set(x + Math.sin(face) * 0.05, y + h * 0.2, z + Math.cos(face) * 0.05); grp.add(s);
      }
    });
  };
  // moonlight slanting in through a window onto the floor
  F.moonShaft = function (w, x0, y0, z0, x1, y1, z1, col) {
    w.deferred.push((grp) => {
      const a = V(x0, y0, z0), b = V(x1, y1, z1), L = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.9, L, 12, 1, true), new THREE.MeshBasicMaterial({ map: G.Tex.spr.lightshaft, color: col || 0xa8c0ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, -1, 0), b.clone().sub(a).normalize());
      m.renderOrder = 8; grp.add(m);
    });
    w.addLight(x1, y1 + 0.5, z1, { flame: 0, intensity: 4, range: 9, color: '#9ab4ff', emit: false, prio: 0.8, steady: true });
  };
  // the ceiling: a solid slab (grapple can't latch) with beams, chains and the odd chandelier
  F.ceiling = function (w, rng, x0, z0, x1, z1, y, opts) {
    opts = opts || {};
    w.solid('block', x0 - 3, y, z0 - 3, x1 + 3, y + 1.2, z1 + 3, { uv: 4, noGrapple: true });
    w.ceilingY = y;
    for (let z = z0 + 5; z < z1 - 2; z += opts.beamStep || 7) {
      if (opts.ruined && rng.chance(0.3)) continue;
      w.visual('woodDark', x0, y - 0.7, z - 0.35, x1, y, z + 0.35, { uv: 2 });
      if (rng.chance(0.5)) P().chain(w, rng.range(x0 + 4, x1 - 4), y - rng.range(2.5, 5), z, rng.range(2.5, 4.5));
    }
    const nch = opts.chandeliers ?? 2;
    for (let i = 0; i < nch; i++) P().chandelier(w, rng.range(x0 + 10, x1 - 10), y - rng.range(4, 6), rng.range(z0 + 12, z1 - 12), y - 0.7);
  };
  // a wooden ramp: shallow plank steps with side rails and support posts
  F.ramp = function (w, side, e, c, wd, h0, h1) {
    const len = H.stairs(w, side, e, c, wd, h0, h1, 'wood');
    const sg = side === 'S' || side === 'E' ? 1 : -1;
    const along = side === 'N' || side === 'S';
    for (let i = 0; i <= Math.ceil(len / 2.2); i++) {
      const u = e + sg * Math.min(len, i * 2.2);
      const k = Math.min(1, i * 2.2 / len), top = h1 - (h1 - h0) * k + 0.95;
      for (const s of [-1, 1]) {
        const v = c + s * (wd / 2 + 0.08);
        if (along) w.visual('woodDark', v - 0.06, 0, u - 0.06, v + 0.06, top, u + 0.06, { uv: 1 }); else w.visual('woodDark', u - 0.06, 0, v - 0.06, u + 0.06, top, v + 0.06, { uv: 1 });
      }
    }
    // hand rails (thin colliders so you don't fall off; walkers keep to the planks)
    for (const s of [-1, 1]) {
      const v = c + s * (wd / 2 + 0.08);
      const ua = Math.min(e, e + sg * len), ub = Math.max(e, e + sg * len);
      if (along) w.addCollider(v - 0.05, h0, ua, v + 0.05, h1 + 0.95, ub, { surf: 'wood', noGrapple: true }); else w.addCollider(ua, h0, v - 0.05, ub, h1 + 0.95, v + 0.05, { surf: 'wood', noGrapple: true });
    }
    return len;
  };
  // a plank bridge between two ledges at height y (broken: a gap in the middle you must jump / grapple)
  F.bridge = function (w, x0, z0, x1, z1, y, broken) {
    const alongX = x1 - x0 > z1 - z0;
    const parts = broken ? (alongX ? [[x0, (x0 + x1) / 2 - 1.3], [(x0 + x1) / 2 + 1.3, x1]] : [[z0, (z0 + z1) / 2 - 1.3], [(z0 + z1) / 2 + 1.3, z1]]) : [alongX ? [x0, x1] : [z0, z1]];
    for (const [a, b] of parts) {
      if (alongX) { w.solid('wood', a, y - 0.25, z0, b, y, z1, { uv: 1, tag: 'bridge' }); w.visual('woodDark', a, y - 0.5, z0 + 0.1, b, y - 0.25, z0 + 0.3, { uv: 1 }); w.visual('woodDark', a, y - 0.5, z1 - 0.3, b, y - 0.25, z1 - 0.1, { uv: 1 }); }
      else { w.solid('wood', x0, y - 0.25, a, x1, y, b, { uv: 1, tag: 'bridge' }); w.visual('woodDark', x0 + 0.1, y - 0.5, a, x0 + 0.3, y - 0.25, b, { uv: 1 }); w.visual('woodDark', x1 - 0.3, y - 0.5, a, x1 - 0.1, y - 0.25, b, { uv: 1 }); }
      // rope rails
      for (const s of [0, 1]) {
        if (alongX) { const z = s ? z1 - 0.05 : z0 + 0.05; w.visual('woodDark', a, y + 0.9, z - 0.03, b, y + 0.96, z + 0.03, { uv: 1 }); w.addCollider(a, y, z - 0.05, b, y + 0.95, z + 0.05, { surf: 'wood', noGrapple: true }); for (let u = a; u <= b; u += 1.6) w.visual('woodDark', u - 0.05, y, z - 0.05, u + 0.05, y + 0.96, z + 0.05, { uv: 1 }); }
        else { const x = s ? x1 - 0.05 : x0 + 0.05; w.visual('woodDark', x - 0.03, y + 0.9, a, x + 0.03, y + 0.96, b, { uv: 1 }); w.addCollider(x - 0.05, y, a, x + 0.05, y + 0.95, b, { surf: 'wood', noGrapple: true }); for (let u = a; u <= b; u += 1.6) w.visual('woodDark', x - 0.05, y, u - 0.05, x + 0.05, y + 0.96, u + 0.05, { uv: 1 }); }
      }
    }
  };
  F.fallenColumn = function (w, x, z, L, alongX, rng) {
    const r = 0.45;
    if (alongX) w.solid('block', x - L / 2, 0, z - r, x + L / 2, r * 2, z + r, { uv: 2 }); else w.solid('block', x - r, 0, z - L / 2, x + r, r * 2, z + L / 2, { uv: 2 });
    P().rubble(w, alongX ? x + L / 2 + 0.6 : x, 0, alongX ? z : z + L / 2 + 0.6, rng, 1.0);
  };

  // the ruined depths: broken walls with jagged tops, snapped pillars, fallen masonry, cracked floors, moss over everything, hanging vines.
  // everything here is real geometry (not just a texture): ragged wall runs, tilted stone chunks, moss slabs that cling to the stone.
  F.ruinDressing = function (w, rng, occ, W, D, HT) {
    const PGm = G.Props.PG, M = G.Props.M;
    const MOSS = () => [rng.range(0.08, 0.16), rng.range(0.22, 0.34), rng.range(0.4, 0.6)]; // cold blue lichen
    // 1) ragged wall runs: each metre-wide piece is a different height, so the top is a broken skyline
    for (let i = 0; i < 14; i++) {
      const alongX = rng.chance(0.5), len = rng.int(6, 10), r = occ.place(rng, alongX ? len : 2, alongX ? 2 : len, 1.2, 30);
      if (!r) continue;
      const peak = rng.range(1.6, 3.6);
      for (let k = 0; k < len; k++) {
        const t = k / (len - 1), hgt = Math.max(0.3, peak * (0.3 + 0.7 * Math.sin(t * Math.PI)) * rng.range(0.45, 1.05));
        const x = alongX ? r.x0 + k : r.x0 + 0.5, z = alongX ? r.z0 + 0.5 : r.z0 + k;
        w.solid(k % 3 === 1 ? 'wall' : 'block', alongX ? x : x - 0.4, 0, alongX ? z - 0.4 : z, alongX ? x + 1 : x + 0.4, hgt, alongX ? z + 0.4 : z + 1, { uv: 2 });
        // a chipped corner stone lying on top / beside
        if (rng.chance(0.5)) w.batch.geo('block', PGm.dode, M(x + (alongX ? 0.5 : 0), hgt + 0.12, z + (alongX ? 0 : 0.5), 0.22, 0.17, 0.24, rng.range(0, 3), rng.range(0, 3), 0), { su: 0.3, sv: 0.3 });
        if (rng.chance(0.55)) { const a2 = alongX ? [x + 0.05, hgt - 0.02, z - 0.43, x + 0.95, hgt + 0.06, z + 0.43] : [x - 0.43, hgt - 0.02, z + 0.05, x + 0.43, hgt + 0.06, z + 0.95]; w.visual('floor', ...a2, { uv: 1, tint: MOSS(), grad: false }); }
      }
      G.Props.rubble(w, alongX ? r.x0 + len / 2 : r.x0 + 1.4, 0, alongX ? r.z0 + 1.4 : r.z0 + len / 2, rng, 1.3);
    }
    // 2) snapped pillars (octagonal shafts with a jagged crown) with moss at their feet
    for (let i = 0; i < 18; i++) {
      const r = occ.place(rng, 2, 2, 1.3, 30); if (!r) continue;
      const cx = r.x0 + 1, cz = r.z0 + 1;
      G.Props.pillarRound(w, cx, cz, 0, rng.range(3, 7), rng.range(0.45, 0.65), true, rng);
      w.visual('floor', cx - 0.9, 0.02, cz - 0.9, cx + 0.9, 0.06, cz + 0.9, { uv: 1, tint: MOSS(), grad: false });
    }
    // 3) fallen masonry: big tilted chunks with a collider, and scattered smaller ones
    for (let i = 0; i < 20; i++) {
      const r = occ.place(rng, 3, 3, 1, 30); if (!r) continue;
      const cx = r.x0 + 1.5, cz = r.z0 + 1.5, s = rng.range(0.7, 1.3);
      w.batch.geo('block', PGm.dode, M(cx, s * 0.5, cz, s, s * 0.75, s * 0.9, rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3)), { su: 0.6, sv: 0.6 });
      w.addCollider(cx - s * 0.75, 0, cz - s * 0.75, cx + s * 0.75, s * 0.95, cz + s * 0.75);
      for (let k = 0; k < 5; k++) { const q = rng.range(0.12, 0.3); w.batch.geo('block', PGm.dode, M(cx + rng.range(-1.4, 1.4), q * 0.5, cz + rng.range(-1.4, 1.4), q, q * 0.7, q * 0.9, rng.range(0, 3), rng.range(0, 3), 0), { su: 0.3, sv: 0.3 }); }
      w.visual('floor', cx - 1.2, 0.02, cz - 1.2, cx + 1.2, 0.05, cz + 1.2, { uv: 1, tint: MOSS(), grad: false });
    }
    // 4) moss: floor patches, slabs on the lower wall faces, creeping up the walls
    for (let i = 0; i < 90; i++) {
      const x = rng.range(2, W - 2), z = rng.range(2, D - 2), sx = rng.range(0.5, 2.2), sz = rng.range(0.5, 2.2);
      w.visual('floor', x, 0.02, z, x + sx, 0.045 + rng.range(0, 0.02), z + sz, { uv: 1, tint: MOSS(), grad: false });
    }
    for (let i = 0; i < 46; i++) {
      const side = rng.int(0, 3), y = rng.range(0.2, 9), h = rng.range(0.8, 3.6), len = rng.range(1, 4.5);
      const t = side < 2 ? rng.range(3, D - 3) : rng.range(3, W - 3);
      if (side === 0) w.visual('wall', 0, y, t, 0.07, y + h, t + len, { uv: 1, tint: MOSS(), grad: false });
      else if (side === 1) w.visual('wall', W - 0.07, y, t, W, y + h, t + len, { uv: 1, tint: MOSS(), grad: false });
      else if (side === 2) w.visual('wall', t, y, 0, t + len, y + h, 0.07, { uv: 1, tint: MOSS(), grad: false });
      else w.visual('wall', t, y, D - 0.07, t + len, y + h, D, { uv: 1, tint: MOSS(), grad: false });
    }
    // 5) cracks in the floor and breaches in the walls (dark gashes with rubble heaped below)
    for (let i = 0; i < 70; i++) {
      const x = rng.range(3, W - 3), z = rng.range(3, D - 3), L = rng.range(1.2, 4), ax = rng.chance(0.5);
      w.visual('dark', x, 0.021, z, ax ? x + L : x + 0.08, 0.03, ax ? z + 0.08 : z + L, { uv: 1, grad: false });
    }
    for (let i = 0; i < 18; i++) {
      const side = rng.int(0, 1), t = rng.range(10, D - 12), y0 = rng.range(0.5, 3), hh = rng.range(2, 4.5), wd = rng.range(2, 4);
      if (side === 0) { w.visual('dark', 0, y0, t, 0.1, y0 + hh, t + wd, { uv: 1, grad: false }); G.Props.rubble(w, 1.2, 0, t + wd / 2, rng, rng.range(1, 1.6)); }
      else { w.visual('dark', W - 0.1, y0, t, W, y0 + hh, t + wd, { uv: 1, grad: false }); G.Props.rubble(w, W - 1.2, 0, t + wd / 2, rng, rng.range(1, 1.6)); }
    }
    // 6) vines hanging down the walls
    for (let i = 0; i < 16; i++) {
      const side = rng.int(0, 3), y = rng.range(7, 16), h = rng.range(3, 8);
      if (side === 0) G.Props.vines(w, 0.02, y, rng.range(4, D - 4), 'px', h, rng);
      else if (side === 1) G.Props.vines(w, W - 0.02, y, rng.range(4, D - 4), 'nx', h, rng);
      else if (side === 2) G.Props.vines(w, rng.range(4, W - 4), y, 0.02, 'pz', h, rng);
      else G.Props.vines(w, rng.range(4, W - 4), y, D - 0.02, 'nz', h, rng);
    }
  };

  // ---------------------------------------------------------------- shared area plumbing
  function base(area, seed, biomeKey, sz) {
    const rng = new G.RNG(seed);
    const size = sz || Math.min(88, 62 + Math.floor(area / 3) * 2 + rng.int(0, 3) * 4);
    const W = size, D = size + rng.int(-2, 3) * 4;
    const w = new G.World(W, D, biomeKey);
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    return { rng, W, D, w, occ };
  }
  function reserve(occ, W, D, gates) {
    occ.mark(W / 2 - 6, D - 10, W / 2 + 6, D, 2);
    for (const gx of LG.gateXs(W, gates || 1)) occ.mark(gx - 6, 0, gx + 6, 9, 2);
    occ.mark(W / 2 - 13, 8, W / 2 + 13, 16, 2);
    occ.mark(0, 0, W, 2, 2); occ.mark(0, D - 2, W, D, 2); occ.mark(0, 0, 2, D, 2); occ.mark(W - 2, 0, W, D, 2);
  }
  function finish(w, rng, occ, W, D, area, kind, extraChests) {
    if (G.Fields) G.Fields.place(w, rng, occ, W, D, area);
    H.placeChests(w, rng, occ, (kind === 'vault' ? 6 : (area <= 4 ? 2 : rng.chance(0.75) ? 1 : 0) + (rng.chance(0.25) ? 1 : 0)) + (extraChests || 0), area);
    w.miniSlots = [-6, -2, 2].map((dx) => ({ x: W / 2 + dx, y: 1.15, z: 12, face: 1 })); w.miniHeal = V(W / 2 + 6, 0, 12);
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    return w;
  }


  // ---------------------------------------------------------------- a chasm across the area (not common)
  // The floor is left out of a wide band across the middle; a few stone bridges cross it (the first one carries the main path).
  // Falling in costs 15% of your HP and puts you back on the last safe ground (see player.js fellInPit); foes that fall die.
  F.chasmMask = function (rng, W, D, occ) {
    const pit = new Uint8Array(W * D);
    const z0 = Math.floor(D * 0.42), z1 = Math.floor(D * 0.57);
    for (let z = z0; z < z1; z++) for (let x = 3; x < W - 3; x++) pit[z * W + x] = 1;
    occ.mark(0, z0 - 1, W, z1 + 1, 1);
    const nb = rng.int(2, 3);
    {
      const list = [[W / 2 - 1.6, W / 2 + 1.6, z0, z1]];
      for (let i = 1; i < nb; i++) { const bx = rng.chance(0.5) ? rng.range(8, W / 2 - 9) : rng.range(W / 2 + 9, W - 8); list.push([bx - 1.6, bx + 1.6, z0, z1]); }
      pit.bridges = list; pit.band = { z0, z1 };
    }
    return pit;
  };
  F.chasmDress = function (w, rng, W, D, pit, glow) {
    const { z0, z1 } = pit.band;
    w._bridges = pit.bridges; w._pit = pit.band;
    for (const [a, b] of pit.bridges) {
      w.solid('block', a, -0.6, z0 - 0.01, b, 0, z1 + 0.01, { uv: 2 });
      w.solid('trim', a, 0, z0, a + 0.3, 0.9, z1, { uv: 1 }); w.solid('trim', b - 0.3, 0, z0, b, 0.9, z1, { uv: 1 });   // railings
      w.solid('block', a + 0.2, -12, (z0 + z1) / 2 - 0.6, b - 0.2, -0.6, (z0 + z1) / 2 + 0.6, { uv: 3 });                 // arch support down into the dark
      P().torch(w, a, 1.6, z0 + 0.5, 'px'); P().torch(w, b, 1.6, z1 - 0.5, 'nx');
    }
    w.solid('trim', 3, 0, z0 - 0.3, W - 3, 0.25, z0, { uv: 1, tag: 'lip' });
    w.solid('trim', 3, 0, z1, W - 3, 0.25, z1 + 0.3, { uv: 1, tag: 'lip' });
    w.visual('dark', 3, -14, z0, W - 3, -13.9, z1, { uv: 4, grad: false });
    for (let x = 10; x < W - 6; x += 14) w.addLight(x, -6, (z0 + z1) / 2, { flame: 0, intensity: 14, range: 14, color: glow || '#5a7ae0', emit: false, prio: 0.7 });
    w.abyss = { z0, z1 };
    if (rng.chance(0.4)) {
      const ix = W / 2 + rng.range(-9, 9);
      if (pit.bridges.every(([a, b]) => ix + 3.5 < a || ix - 3.5 > b)) {
        w.solid('wall', ix - 3, -12, z0 + 2, ix + 3, 2.5, z1 - 2, { uv: 3 });
        w.solid('trim', ix - 3.06, 2.25, z0 + 1.94, ix + 3.06, 2.5, z1 - 1.94, { uv: 2 });
        P().brazier(w, ix, 2.5, (z0 + z1) / 2, 1);
        w.platTops.push({ x0: ix - 2.5, z0: z0 + 2.5, x1: ix + 2.5, z1: z1 - 2.5, y: 2.5, cx: ix + 1.5, cz: (z0 + z1) / 2 });
      }
    }
  };

  // ---------------------------------------------------------------- 1) the moonlit graveyard
  function genGrave(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = base(area, seed, 'grave');
    reserve(occ, W, D, gates);
    const pit = area >= 4 && rng.chance(0.2) ? F.chasmMask(rng, W, D, occ) : null; // now and then a chasm cuts the graveyard in two
    H.floors(w, W, D, pit, 'floor');
    H.perimeter(w, rng, W, D, { gates, h: 4.6 });
    if (pit) F.chasmDress(w, rng, W, D, pit, '#6a8ae8');
    const layout = pit ? 'chasm' : rng.pick(['rows', 'chapel', 'barrow']);
    w.layout = layout;
    // gravel paths from the entrance to every exit
    const cxs = LG.gateXs(W, gates || 1);
    w.visual('cobble', W / 2 - 1.6, 0, 9, W / 2 + 1.6, 0.03, D, { uv: 2, grad: false });
    w.visual('cobble', Math.min(...cxs) - 1.6, 0, 9, Math.max(...cxs) + 1.6, 0.03, 12.2, { uv: 2, grad: false });
    for (const gx of cxs) w.visual('cobble', gx - 1.6, 0, 0, gx + 1.6, 0.03, 12, { uv: 2, grad: false });
    occ.mark(W / 2 - 2.5, 9, W / 2 + 2.5, D);
    if (layout === 'chapel') {
      // a roofless ruined chapel in the middle: broken walls, empty windows, an altar and pews
      const cw = 14, cd = 20, x0 = Math.round(W / 2 - cw / 2), z0 = Math.round(D / 2 - cd / 2 - 2);
      if (occ.free(x0 - 1, z0 - 1, x0 + cw + 1, z0 + cd + 1)) {
        occ.mark(x0 - 1, z0 - 1, x0 + cw + 1, z0 + cd + 1);
        const wallH = (z) => 2.5 + Math.abs(Math.sin(z * 0.7 + seed)) * 3.5;
        for (let z = z0; z < z0 + cd; z += 2) { const h = wallH(z); if (rng.chance(0.15)) continue; w.solid('wall', x0, 0, z, x0 + 0.6, h, z + 2, { uv: 2 }); w.solid('wall', x0 + cw - 0.6, 0, z, x0 + cw, wallH(z + 7), z + 2, { uv: 2 }); }
        w.solid('wall', x0, 0, z0, x0 + cw, 6.5, z0 + 0.6, { uv: 2 });
        for (const dx of [0, cw - 4.5]) w.solid('wall', x0 + dx, 0, z0 + cd - 0.6, x0 + dx + 4.5, 4.2, z0 + cd, { uv: 2 });
        w.solid('trim', x0 + cw / 2 - 2, 0, z0 + 1.5, x0 + cw / 2 + 2, 1.0, z0 + 3, { uv: 2 });
        P().candles(w, x0 + cw / 2, 1.0, z0 + 2.2, rng, true);
        P().statue(w, x0 + cw / 2, z0 + 1.1, 1.0, 0, rng, 1.0);
        for (let z = z0 + 6; z < z0 + cd - 3; z += 2.4) for (const sx of [-1, 1]) w.solid('woodDark', x0 + cw / 2 + sx * 1.6 - (sx < 0 ? 3 : 0), 0, z, x0 + cw / 2 + sx * 1.6 + (sx > 0 ? 3 : 0), 0.55, z + 0.5, { uv: 1 });
        for (const k of [0.3, 0.7]) P().brazier(w, x0 + cw * k, 0, z0 + cd - 2, 0.9, true);
      }
    } else if (layout === 'barrow') {
      // a raised burial mound with an obelisk and the oldest graves on top
      const s = 14, h = 2.5, L = Math.ceil(LG.stairsLen(h));
      const R = { x0: Math.round(W / 2 - s / 2 - L), z0: Math.round(D / 2 - s / 2 - L - 2), x1: Math.round(W / 2 + s / 2 + L), z1: Math.round(D / 2 + s / 2 + L - 2) };
      if (occ.free(R.x0, R.z0, R.x1, R.z1)) {
        occ.mark(R.x0, R.z0, R.x1, R.z1);
        const top = H.platform(w, rng, R, h, ['N', 'S', 'E', 'W'], { decor: false, mk: 'rock' });
        w.platTops.push(top);
        w.solid('block', top.cx - 0.5, h, top.cz - 0.5, top.cx + 0.5, h + 5.5, top.cz + 0.5, { uv: 2 });
        w.solid('trim', top.cx - 0.8, h, top.cz - 0.8, top.cx + 0.8, h + 0.6, top.cz + 0.8, { uv: 1 });
        for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) P().gravestone(w, top.cx + dx, top.cz + dz, h, rng.range(-0.3, 0.3), rng);
        for (const [dx, dz] of [[-5, 0], [5, 0]]) F.lantern(w, top.cx + dx, top.cz + dz, '#9ab4ff', h);
      }
    }
    // fenced grave plots
    const nPlots = 4 + Math.floor(W * D / 900) + rng.int(0, 2);
    for (let i = 0; i < nPlots; i++) {
      const pw = rng.pick([7.6, 9.5, 11.4]), pd = 6.4;
      const r = occ.place(rng, Math.ceil(pw), Math.ceil(pd), 1.4); if (!r) continue;
      const x0 = r.x0, z0 = r.z0, x1 = r.x0 + pw, z1 = r.z0 + pd;
      const gapAt = (x0 + x1) / 2;
      F.fence(w, x0, z0, x1, z0, 1.1, rng.chance(0.5) ? [[gapAt - 0.8, gapAt + 0.8]] : []);
      F.fence(w, x0, z1, x1, z1, 1.1, [[gapAt - 0.8, gapAt + 0.8]]);
      F.fence(w, x0, z0, x0, z1, 1.1, []);
      F.fence(w, x1, z0, x1, z1, 1.1, rng.chance(0.4) ? [[(z0 + z1) / 2 - 0.8, (z0 + z1) / 2 + 0.8]] : []);
      F.tombs(w, x0, z0, x1, z1, rng, 1);
    }
    // mausoleums
    for (let i = 0; i < rng.int(1, 3); i++) { const r = occ.place(rng, 6, 7, 1.5); if (r) F.mausoleum(w, rng, r.x0, r.z0, r.x0 + 6, r.z0 + 7); }
    // lone graves scattered between the plots
    for (let i = 0; i < 18 + rng.int(0, 10); i++) { const r = occ.place(rng, 1, 2, 0.8, 10); if (r) { P().gravestone(w, r.x0 + 0.5, r.z0 + 0.3, 0, rng.range(-0.4, 0.4), rng); w.visual('rock', r.x0 + 0.12, 0, r.z0 + 0.6, r.x0 + 0.88, 0.14, r.z0 + 2, { uv: 1, grad: false }); } }
    // dead trees and lanterns
    for (let i = 0; i < 6 + rng.int(0, 6); i++) { const r = occ.place(rng, 2, 2, 1.2, 12); if (r) F.deadTree(w, r.x0 + 1, r.z0 + 1, rng, rng.range(0.9, 1.4)); }
    for (let z = D - 14; z > 14; z -= 11) { F.lantern(w, W / 2 - 2.4, z, '#ffb070'); if (rng.chance(0.5)) F.lantern(w, W / 2 + 2.4, z - 5, '#9ab4ff'); }
    // a few open graves / coffins and bones
    for (let i = 0; i < 4; i++) { const r = occ.place(rng, 2, 3, 0.8, 10); if (r) { w.visual('dark', r.x0 + 0.3, 0, r.z0 + 0.3, r.x0 + 1.7, 0.02, r.z0 + 2.7, { uv: 1, grad: false }); w.solid('woodDark', r.x0 + 1.75, 0, r.z0 + 0.4, r.x0 + 2, 0.5, r.z0 + 2.6, { uv: 1 }); P().bones(w, r.x0 + 1, 0.03, r.z0 + 1.5, rng); } }
    return finish(w, rng, occ, W, D, area, kind, extraChests);
  }

  // ---------------------------------------------------------------- 2) the dungeon entrance
  function genGate(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = base(area, seed, 'gate');
    reserve(occ, W, D, gates);
    const HT = 16;
    // barred windows high in both side walls (between the buttresses)
    const wins = [];
    for (let z = 16; z < D - 12; z += 16) wins.push([z + 0.6, z + 3.6, 6.2, 12.4]);
    const pit = area >= 4 && rng.chance(0.15) ? F.chasmMask(rng, W, D, occ) : null;
    H.floors(w, W, D, pit, rng.chance(0.5) ? 'cobble' : 'floor');
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0, windows: wins });
    if (pit) F.chasmDress(w, rng, W, D, pit, '#7a60d8');
    F.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: rng.int(1, 3) });
    for (const [a, b, y0, y1] of wins) for (const side of [-1, 1]) {
      const xw = side < 0 ? 0 : W, zc = (a + b) / 2;
      // bars + sill
      for (let z = a + 0.2; z < b; z += 0.4) w.visual('iron', xw - 0.06 + side * -1.5, y0, z - 0.03, xw + 0.06 + side * -1.5, y1, z + 0.03, { uv: 1 });
      w.addCollider(side < 0 ? -3 : W, y0, a, side < 0 ? 0 : W + 3, y1, b, { surf: 'metal', noGrapple: true });
      w.visual('trim', side < 0 ? -0.4 : W, y0 - 0.25, a - 0.2, side < 0 ? 0 : W + 0.4, y0, b + 0.2, { uv: 1 });
      // the night beyond, and moonlight falling in
      F.nightPane(w, side < 0 ? -3.2 : W + 3.2, (y0 + y1) / 2, zc, (b - a) + 2, (y1 - y0) + 2, side < 0 ? Math.PI / 2 : -Math.PI / 2, rng.chance(0.25));
      if (rng.chance(0.8)) F.moonShaft(w, xw, (y0 + y1) / 2, zc, xw - side * rng.range(6, 10), 0.05, zc + rng.range(-2, 2));
      w.addLight(xw - side * 1.2, (y0 + y1) / 2, zc, { flame: 0, intensity: 5, range: 11, color: '#8aa8ff', emit: false, prio: 0.7, steady: true });
    }
    const layout = pit ? 'nave' : rng.pick(['nave', 'gallery', 'gatehouse']);
    w.layout = layout;
    if (layout === 'nave') {
      // two rows of heavy piers up to the vault
      for (const sx of [-1, 1]) for (let z = 16; z < D - 14; z += 9) { const x = W / 2 + sx * rng.range(9, 12); if (occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) { occ.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5); P().pillarSquare(w, x, z, 0, HT, 1.6); if (rng.chance(0.5)) P().torch(w, x, 3.4, z + 0.95, 'pz'); } }
    } else if (layout === 'gallery') {
      // a raised gallery along one wall with stairs and a colonnade
      const side = rng.chance(0.5) ? 'W' : 'E', depth = rng.int(8, 10), h = 3.5;
      const x0 = side === 'W' ? 0 : W - depth, x1 = side === 'W' ? depth : W, z0 = 14, z1 = D - 14;
      const L = Math.ceil(LG.stairsLen(h));
      occ.mark(side === 'W' ? x0 : x0 - L - 1, z0, side === 'W' ? x1 + L + 1 : x1, z1);
      w.solid('wall', x0, 0, z0, x1, h - 0.25, z1, { uv: 3 });
      w.solid('trim', x0, h - 0.25, z0 - 0.06, x1, h, z1 + 0.06, { uv: 2 });
      const edgeX = side === 'W' ? x1 : x0, gaps = [];
      for (const sz of [z0 + (z1 - z0) * 0.25, z0 + (z1 - z0) * 0.75]) { H.stairs(w, side === 'W' ? 'E' : 'W', edgeX, sz, 2.8, 0, h, 'trim'); gaps.push({ side: side === 'W' ? 'E' : 'W', a: sz - 1.5, b: sz + 1.5 }); }
      H.parapet(w, x0, z0, x1, z1, h, gaps.concat([{ side, a: -1, b: 999 }]));
      H.colonnade(w, rng, side === 'W' ? x0 + 2.2 : x1 - 2.2, z0 + 3, z1 - z0 - 6, false, HT - h, true);
      w.platTops.push({ x0: x0 + 1, z0: z0 + 1, x1: x1 - 1, z1: z1 - 1, y: h, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
    } else {
      const n = W > 72 ? 2 : 1;
      for (let i = 0; i < n; i++) { const z = Math.round(D * (i + 1) / (n + 1)); occ.mark(0, z - 2, W, z + 2); const ops = H.archWall(w, rng, z, W, rng.int(2, 3)); for (const [a, b] of ops) occ.mark(a - 1, z - 4, b + 1, z + 4, 2); }
    }
    // dungeon dressing: cages, chains, sarcophagi, rubble, bones, a broken portcullis
    for (let i = 0; i < 3; i++) { const r = occ.place(rng, 3, 3, 1.2, 12); if (r) P().cage(w, r.x0 + 1.5, r.z0 + 1.5, 0, rng.range(0.9, 1.2), rng); }
    for (let i = 0; i < 4; i++) { const r = occ.place(rng, 3, 2, 1, 12); if (r) P().sarcophagus(w, r.x0 + 1.5, r.z0 + 1, 0, rng.chance(0.5), rng); }
    for (let i = 0; i < 6; i++) { const r = occ.place(rng, 2, 2, 0.8, 10); if (r) { if (rng.chance(0.5)) P().rubble(w, r.x0 + 1, 0, r.z0 + 1, rng, rng.range(0.8, 1.4)); else P().bones(w, r.x0 + 1, 0.02, r.z0 + 1, rng); } }
    H.structures(w, rng, occ, W, D, 3 + Math.floor(W * D / 1200));
    H.scatter(w, rng, occ, W, D, 10 + Math.floor(W * D / 600));
    return finish(w, rng, occ, W, D, area, kind, extraChests);
  }

  // ---------------------------------------------------------------- 3 / 4) the storeyed depths (and their ruin)
  function genStoreys(area, seed, extraChests, gates, kind, ruined) {
    const { rng, W, D, w, occ } = base(area, seed, ruined ? 'ruin' : 'halls', Math.min(88, 70 + rng0(seed) * 4));
    reserve(occ, W, D, gates);
    const HT = 26, L1 = 4.5, L2 = 9, L3 = 13.5;
    H.floors(w, W, D, null, rng.chance(0.5) ? 'floor' : 'cobble');
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0 });
    F.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: ruined ? 1 : rng.int(2, 3), ruined });
    const z0 = 14, z1 = D - 14;
    const west = rng.chance(0.5);
    const sA = west ? 'W' : 'E', sB = west ? 'E' : 'W';
    // storey 1 along side A (y = 4.5) and storey 2 along side B (y = 9, reached from a 4.5 landing)
    const dA = rng.int(8, 10);
    const ax0 = sA === 'W' ? 0 : W - dA, ax1 = sA === 'W' ? dA : W;
    w.solid('wall', ax0, 0, z0, ax1, L1 - 0.25, z1, { uv: 3 });
    w.solid('trim', ax0, L1 - 0.25, z0 - 0.06, ax1, L1, z1 + 0.06, { uv: 2 });
    w.platTops.push({ x0: ax0 + 1, z0: z0 + 1, x1: ax1 - 1, z1: z1 - 1, y: L1, cx: (ax0 + ax1) / 2, cz: (z0 + z1) / 2 });
    const edgeA = sA === 'W' ? ax1 : ax0, inA = sA === 'W' ? 'E' : 'W';
    const gapsA = [];
    // a stone stair and a long wooden ramp up to storey 1
    // the far end of storey 1 rises on: stairs up to a second floor (9), on it more stairs up to a third (13.5)
    const a3 = 7, zs1 = z1 - a3 - 10, zbase = zs1 - 9, acx = (ax0 + ax1) / 2, a3z0 = zs1 + 10;
    const sz1 = z0 + 3.4, sz2 = zbase - 2.2;
    H.stairs(w, inA, edgeA, sz1, 2.8, 0, L1, 'trim'); gapsA.push({ side: inA, a: sz1 - 1.5, b: sz1 + 1.5 });
    const szs = [sz1];
    if (sz2 - sz1 > 4) { F.ramp(w, inA, edgeA, sz2, 2.2, 0, L1); gapsA.push({ side: inA, a: sz2 - 1.3, b: sz2 + 1.3 }); szs.push(sz2); }
    const lenA = LG.stairsLen(L1);
    occ.mark(ax0, z0, ax1, z1);
    {
      // floor 2: a solid block at 9 from zs1 to the end wall; floor 3: a block at 13.5 over its last stretch
      w.solid('wall', ax0, L1 - 0.25, zs1, ax1, L2 - 0.25, z1, { uv: 3 });
      w.solid('trim', ax0, L2 - 0.25, zs1 - 0.06, ax1, L2, z1 + 0.06, { uv: 2 });
      H.stairs(w, 'N', zs1, acx, 3, L1, L2, 'trim');
      w.solid('wall', ax0, L2 - 0.25, a3z0, ax1, L3 - 0.25, z1, { uv: 3 });
      w.solid('trim', ax0, L3 - 0.25, a3z0 - 0.06, ax1, L3, z1 + 0.06, { uv: 2 });
      H.stairs(w, 'N', a3z0, acx, 3, L2, L3, 'trim');
      w.platTops.push({ x0: ax0 + 1, z0: zs1 + 1, x1: ax1 - 1, z1: zs1 + 9, y: L2, cx: acx, cz: zs1 + 5 });
      w.platTops.push({ x0: ax0 + 1, z0: a3z0 + 1, x1: ax1 - 1, z1: z1 - 1, y: L3, cx: acx, cz: (a3z0 + z1) / 2 });
      H.parapet(w, ax0, zs1, ax1, z1, L2, [{ side: 'N', a: acx - 1.6, b: acx + 1.6 }, { side: sA, a: -1, b: 999 }]);
      H.parapet(w, ax0, a3z0, ax1, z1, L3, [{ side: 'N', a: acx - 1.6, b: acx + 1.6 }, { side: sA, a: -1, b: 999 }, { side: inA, a: (a3z0 + z1) / 2 - 1.5, b: (a3z0 + z1) / 2 + 1.5 }]);
      P().brazier(w, sA === 'W' ? ax0 + 1.6 : ax1 - 1.6, L3, z1 - 1.6, 1, true);
    }
    for (const sz of szs) occ.mark(sA === 'W' ? ax1 : ax0 - lenA - 1.5, sz - 2.5, sA === 'W' ? ax1 + lenA + 1.5 : ax0, sz + 2.5);
    // storey 2: landing (4.5) + high gallery (9)
    const dB = rng.int(7, 9), dL = 6;
    const bx0 = sB === 'W' ? 0 : W - dB, bx1 = sB === 'W' ? dB : W;
    const lx0 = sB === 'W' ? bx1 : bx0 - dL, lx1 = sB === 'W' ? bx1 + dL : bx0;
    const bz0 = z0 + 4, bz1 = z1 - 4;
    w.solid('wall', bx0, 0, bz0, bx1, L2 - 0.25, bz1, { uv: 3 });
    w.solid('trim', bx0, L2 - 0.25, bz0 - 0.06, bx1, L2, bz1 + 0.06, { uv: 2 });
    const lz0 = bz0 + (bz1 - bz0) * 0.3, lz1 = bz0 + (bz1 - bz0) * 0.7;
    w.solid('wall', lx0, 0, lz0, lx1, L1 - 0.25, lz1, { uv: 3 });
    w.solid('trim', lx0, L1 - 0.25, lz0 - 0.06, lx1, L1, lz1 + 0.06, { uv: 2 });
    w.platTops.push({ x0: bx0 + 1, z0: bz0 + 1, x1: bx1 - 1, z1: bz1 - 1, y: L2, cx: (bx0 + bx1) / 2, cz: (bz0 + bz1) / 2 });
    // ground -> landing: wooden ramp along z; landing -> gallery: stone stairs along z
    const lEdge = sB === 'W' ? lx1 : lx0, inB = sB === 'W' ? 'E' : 'W';
    F.ramp(w, inB, lEdge, lz0 + (lz1 - lz0) * 0.78, 2.2, 0, L1);
    // stone stairs along the landing, hugging the gallery face, climbing to the gallery
    const se = lz0 + LG.stairsLen(L2 - L1) + 0.6, stx = sB === 'W' ? bx1 + 1.2 : bx0 - 1.2;
    H.stairs(w, 'S', se - LG.stairsLen(L2 - L1), stx, 2.4, L1, L2, 'trim');
    const lenB = LG.stairsLen(L1);
    occ.mark(Math.min(bx0, lx0) - (sB === 'W' ? 0 : lenB + 1.5), bz0, Math.max(bx1, lx1) + (sB === 'W' ? lenB + 1.5 : 0), bz1);
    const stTop = se - LG.stairsLen(L2 - L1); // the stairs' highest step (they descend toward +z)
    const gapsB = [{ side: inB, a: stTop - 0.4, b: stTop + 1.4 }];
    // a sky bridge leaves the gallery towards the middle of the hall (see below): the parapet is open there
    const zm = bz0 + (bz1 - bz0) * 0.8;
    gapsB.push({ side: inB, a: zm - 1.5, b: zm + 1.5 });
    H.parapet(w, ax0, z0, ax1, z1, L1, gapsA.concat([{ side: sA, a: -1, b: 999 }]));
    H.parapet(w, bx0, bz0, bx1, bz1, L2, gapsB.concat([{ side: sB, a: -1, b: 999 }]));
    // a central tower platform (4.5) joined to storey 1 by a plank bridge
    const tw = 9, tcx = sA === 'W' ? ax1 + 6 + tw / 2 : ax0 - 6 - tw / 2, tcz = D / 2;
    const T = { x0: Math.round(tcx - tw / 2), z0: Math.round(tcz - tw / 2), x1: Math.round(tcx + tw / 2), z1: Math.round(tcz + tw / 2) };
    if (occ.free(T.x0 - 1, T.z0 - 1, T.x1 + 1, T.z1 + 1)) {
      occ.mark(T.x0 - 1, T.z0 - 1, T.x1 + 1, T.z1 + 1);
      w.solid('wall', T.x0, 0, T.z0, T.x1, L1 - 0.25, T.z1, { uv: 3 });
      w.solid('trim', T.x0 - 0.06, L1 - 0.25, T.z0 - 0.06, T.x1 + 0.06, L1, T.z1 + 0.06, { uv: 2 });
      w.platTops.push({ x0: T.x0 + 0.5, z0: T.z0 + 0.5, x1: T.x1 - 0.5, z1: T.z1 - 0.5, y: L1, cx: tcx, cz: tcz });
      const bzc = tcz, near = sA === 'W' ? ax1 : ax0, far = sA === 'W' ? T.x0 : T.x1;
      if (Math.abs(far - near) > 1.5) F.bridge(w, Math.min(near, far), bzc - 1.2, Math.max(near, far), bzc + 1.2, L1, ruined && rng.chance(0.6));
      // and a ramp down on the far side
      F.ramp(w, sA === 'W' ? 'E' : 'W', sA === 'W' ? T.x1 : T.x0, tcz + 2.2, 2.0, 0, L1);
      H.parapet(w, T.x0, T.z0, T.x1, T.z1, L1, [{ side: sA === 'W' ? 'W' : 'E', a: bzc - 1.4, b: bzc + 1.4 }, { side: sA === 'W' ? 'E' : 'W', a: tcz + 0.9, b: tcz + 3.5 }]);
      P().brazier(w, tcx, L1, tcz, 1.1, true);
    }
    // sky bridges: gallery -> pillar -> pillar across the nave, all at gallery height (9m). Reachable on foot; a long way down.
    {
      const dirIn = sB === 'W' ? 1 : -1;
      let px = sB === 'W' ? bx1 : bx0;
      const ps = 5;
      if (occ.free(Math.min(px, px + dirIn * 40), zm - 3, Math.max(px, px + dirIn * 40), zm + 3)) {
        for (let k = 0; k < 2; k++) {
          const gapL = k === 0 ? 8 : 7;
          const nx0 = dirIn > 0 ? px + gapL : px - gapL - ps, nx1 = nx0 + ps;
          if (nx0 < 3 || nx1 > W - 3 || !occ.free(nx0 - 1, zm - ps / 2 - 1, nx1 + 1, zm + ps / 2 + 1)) break;
          occ.mark(nx0 - 1, zm - ps / 2 - 1, nx1 + 1, zm + ps / 2 + 1);
          w.solid('wall', nx0, 0, zm - ps / 2, nx1, L2 - 0.25, zm + ps / 2, { uv: 3 });
          w.solid('trim', nx0 - 0.06, L2 - 0.25, zm - ps / 2 - 0.06, nx1 + 0.06, L2, zm + ps / 2 + 0.06, { uv: 2 });
          const bxa = dirIn > 0 ? px : nx1, bxb = dirIn > 0 ? nx0 : px;
          F.bridge(w, bxa, zm - 1.2, bxb, zm + 1.2, L2, ruined && rng.chance(0.5));
          occ.mark(Math.min(bxa, bxb), zm - 2, Math.max(bxa, bxb), zm + 2);
          P().brazier(w, (nx0 + nx1) / 2, L2, zm, 1, true);
          px = dirIn > 0 ? nx1 : nx0;
        }
      }
    }
    // a high span from the third floor: bridge to a tall stone pillar-top in the nave, and on to another
    {
      const dirIn = sA === 'W' ? 1 : -1, zc = (a3z0 + z1) / 2, ps = 6;
      let px = sA === 'W' ? ax1 : ax0;
      for (let k = 0; k < 2; k++) {
        const gapL = 8, nx0 = dirIn > 0 ? px + gapL : px - gapL - ps, nx1 = nx0 + ps;
        if (nx0 < 3 || nx1 > W - 3 || !occ.free(nx0 - 1, zc - ps / 2 - 1, nx1 + 1, zc + ps / 2 + 1)) break;
        occ.mark(nx0 - 1, zc - ps / 2 - 1, nx1 + 1, zc + ps / 2 + 1);
        w.solid('wall', nx0, 0, zc - ps / 2, nx1, L3 - 0.25, zc + ps / 2, { uv: 3 });
        w.solid('trim', nx0 - 0.06, L3 - 0.25, zc - ps / 2 - 0.06, nx1 + 0.06, L3, zc + ps / 2 + 0.06, { uv: 2 });
        const bxa = dirIn > 0 ? px : nx1, bxb = dirIn > 0 ? nx0 : px;
        F.bridge(w, bxa, zc - 1.2, bxb, zc + 1.2, L3, ruined && rng.chance(0.5));
        occ.mark(Math.min(bxa, bxb), zc - 2, Math.max(bxa, bxb), zc + 2);
        w.platTops.push({ x0: nx0 + 1, z0: zc - 2, x1: nx1 - 1, z1: zc + 2, y: L3, cx: (nx0 + nx1) / 2, cz: zc });
        P().brazier(w, (nx0 + nx1) / 2, L3, zc, 1, true);
        px = dirIn > 0 ? nx1 : nx0;
      }
    }
    // a stepped ziggurat in the open: four 1.2m tiers you can jump up, with a chest-worthy top
    {
      const r = occ.place(rng, 14, 14, 1.5, 30);
      if (r) {
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        [[13, 1.2], [10, 2.4], [7, 3.6], [4, 4.8]].forEach(([s, hh], i, arr) => {
          w.solid(i % 2 ? 'trim' : 'wall', cx - s / 2, i ? arr[i - 1][1] : 0, cz - s / 2, cx + s / 2, hh, cz + s / 2, { uv: 2 });
        });
        w.platTops.push({ x0: cx - 2, z0: cz - 2, x1: cx + 2, z1: cz + 2, y: 4.8, cx, cz });
        P().brazier(w, cx, 4.8, cz, 1.0, true);
      }
    }
    // piers to the ceiling, torches on the storey faces
    for (let z = z0 + 6; z < z1 - 4; z += 10) {
      for (const x of [W * 0.38, W * 0.62]) if (occ.free(x - 1.2, z - 1.2, x + 1.2, z + 1.2)) { occ.mark(x - 1.2, z - 1.2, x + 1.2, z + 1.2); if (ruined && rng.chance(0.35)) { P().pillarSquare(w, x, z, 0, rng.range(3, 8), 1.3); P().rubble(w, x + 1.4, 0, z, rng, 1.2); } else P().pillarSquare(w, x, z, 0, HT, 1.3); }
      if (!ruined || rng.chance(0.5)) { P().torch(w, edgeA, L1 - 1.4, z, sA === 'W' ? 'px' : 'nx'); P().torch(w, sB === 'W' ? bx1 : bx0, L2 - 1.4, z, sB === 'W' ? 'px' : 'nx'); }
    }
    if (ruined) {
      // collapse: fallen columns, rubble mounds, holes torn in the vault, dim red light
      for (let i = 0; i < 14; i++) { const r = occ.place(rng, 6, 2, 1, 12); if (r) F.fallenColumn(w, r.x0 + 3, r.z0 + 1, rng.range(4, 6), true, rng); }
      for (let i = 0; i < 40; i++) { const r = occ.place(rng, 2, 2, 0.8, 10); if (r) P().rubble(w, r.x0 + 1, 0, r.z0 + 1, rng, rng.range(1, 2.4)); }
      // blue fire: pools where the floor has split open, and long fissures. Touching it sets you alight with a fierce burn (see player.js)
      for (let i = 0; i < 8; i++) { const r = occ.place(rng, rng.int(5, 8), rng.int(5, 8), 1.2, 30); if (r) G.Fields.add(w, 'lava', r.x0, r.z0, r.x1, r.z1, { blue: true }); }
      for (let i = 0; i < 8; i++) { const ax = rng.chance(0.5), len = rng.int(9, 15), r = occ.place(rng, ax ? len : 2, ax ? 2 : len, 1, 30); if (r) G.Fields.add(w, 'lava', r.x0, r.z0, r.x1, r.z1, { blue: true }); }
      for (let i = 0; i < 9; i++) { const r = occ.place(rng, 3, 3, 0.8, 20); if (r) G.Fields.add(w, 'lava', r.x0, r.z0, r.x1, r.z1, { blue: true }); }
      // braziers of blue flame scattered through the ruin, so it is never pitch dark
      for (let i = 0; i < 12; i++) { const r = occ.place(rng, 2, 2, 1, 20); if (r) P().brazier(w, r.x0 + 1, 0, r.z0 + 1, rng.range(0.8, 1.2)); }
      // torn-open floors of the upper levels would be the next step; for now the vault is shredded and the dark leaks in
      for (let i = 0; i < 9; i++) { const x = rng.range(8, W - 14), z = rng.range(10, D - 16); w.visual('dark', x, HT - 0.04, z, x + rng.range(3, 6), HT - 0.02, z + rng.range(3, 6), { uv: 1, grad: false }); }
      for (let i = 0; i < 3; i++) { const x = rng.range(10, W - 10), z = rng.range(14, D - 14); w.addLight(x, 1.2, z, { flame: 0.5, intensity: 7, range: 11, color: '#4a8aff', prio: 0.8 }); P().candles(w, x, 0, z, rng, false); }
    } else {
      for (let i = 0; i < 3; i++) { const r = occ.place(rng, 3, 2, 1, 12); if (r) P().bookshelf(w, r.x0 + 1.5, r.z0 + 1, 0, true, rng); }
      for (let i = 0; i < 3; i++) { const r = occ.place(rng, 3, 3, 1.2, 12); if (r) P().cage(w, r.x0 + 1.5, r.z0 + 1.5, 0, 1, rng); }
    }
    if (ruined) F.ruinDressing(w, rng, occ, W, D, HT);
    H.structures(w, rng, occ, W, D, 2 + Math.floor(W * D / 1600));
    H.scatter(w, rng, occ, W, D, 10 + Math.floor(W * D / 600));
    return finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  const rng0 = (seed) => (seed % 4);

  F.gen = { grave: genGrave, gate: genGate, halls: (a, s, e, g, k) => genStoreys(a, s, e, g, k, false), ruin: (a, s, e, g, k) => genStoreys(a, s, e, g, k, true) };
  // route LevelGen.generate through the field generators
  const gen0 = LG.generate;
  LG.generate = function (area, seed, opts) {
    opts = opts || {};
    const field = G.Run ? G.Run.field(area) : null, f = F.gen[field];
    if (!f) return gen0(area, seed, opts);
    for (let t = 0; t < 8; t++) {
      const w = f(area, (seed + t * 7919) >>> 0, opts.extraChests, opts.gates || 3, opts.kind);
      if (H.validate(w)) { w.seed = seed; w.field = field; H.fireTops(w, {}); return w; }
    }
    return gen0(area, seed, opts);
  };

  // ---------------------------------------------------------------- guardian approach (flat; no stairs anywhere)
  function roadGrave(w, rng, W, AD, D) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 4.5;
    w.solid('floor', 0, -1, gz1, W, 0, D, { uv: 2 });
    w.visual('cobble', cx - hw, 0, gz1, cx + hw, 0.03, D, { uv: 2, grad: false });
    // cemetery walls either side of the road; the land beyond is graves under the moon
    const side = 15;
    w.solid('block', 0, 0, gz1, cx - side, 4.6, D, { uv: 3 }); w.solid('block', cx + side, 0, gz1, W, 4.6, D, { uv: 3 });
    for (let z = gz1 + 6; z < D - 4; z += 7) for (const sx of [-1, 1]) {
      const fx = cx + sx * (hw + 1.2);
      F.fence(w, fx, z, fx, z + 5, 1.2, []);
      for (let k = 0; k < 2; k++) P().gravestone(w, cx + sx * rng.range(hw + 3, side - 1.5), z + rng.range(0.5, 4.5), 0, rng.range(-0.3, 0.3), rng);
      if (rng.chance(0.4)) F.deadTree(w, cx + sx * rng.range(hw + 4, side - 2), z + 2.5, rng, rng.range(1, 1.3));
      if ((z / 7) % 2 < 1) F.lantern(w, cx + sx * (hw + 0.6), z + 3, sx < 0 ? '#ffb070' : '#9ab4ff');
    }
    // the arena gate: stone gate piers and an iron gate that slams shut behind you
    const gate = 3.2;
    w.solid('block', 0, 0, gz0, cx - gate, 4.6, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, 4.6, gz1, { uv: 4 });
    for (const sx of [-1, 1]) { w.solid('trim', cx + sx * gate - 0.7, 0, gz0 - 0.4, cx + sx * gate + 0.7, 7, gz1 + 0.4, { uv: 2 }); P().skull(w, cx + sx * gate, 7.2, gz1, 0, 1.6); w.addLight(cx + sx * gate, 7.6, gz1 + 1, { flame: 0.3, intensity: 7, range: 11, color: '#ff7a40', prio: 1.2 }); }
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => { const pc = H.portcullis(w, gate * 2 - 0.2, 6.2); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
    return { nz: gz1 + (D - gz1) * 0.45, side: -1, nx: cx - hw - 2.4 };
  }
  function roadHall(w, rng, W, AD, D, ruined) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 7, HC = 13;
    w.solid('floor', 0, -1, gz1, W, 0, D, { uv: 2 });
    // the corridor: walls, piers with torches, banners, a vaulted ceiling
    // a merchant alcove on the left half way down
    const nz = gz1 + (D - gz1) * 0.5;
    w.solid('block', 0, 0, gz1, cx - hw, HC + 2, nz - 5, { uv: 3 }); w.solid('block', 0, 0, nz + 5, cx - hw, HC + 2, D, { uv: 3 });
    w.solid('block', 0, 0, nz - 5, cx - hw - 6, HC + 2, nz + 5, { uv: 3 });
    w.solid('block', cx + hw, 0, gz1, W, HC + 2, D, { uv: 3 });
    w.solid('block', cx - hw - 7, HC, gz1, cx + hw + 1, HC + 2, D, { uv: 4, noGrapple: true });
    w.ceilingRoad = HC;
    for (let z = gz1 + 5; z < D - 3; z += 6) for (const sx of [-1, 1]) {
      if (sx < 0 && Math.abs(z - nz) < 7) continue;
      const x = cx + sx * (hw - 0.6);
      if (ruined && rng.chance(0.3)) { P().pillarSquare(w, x, z, 0, rng.range(2, 6), 1.0); P().rubble(w, x - sx * 1.2, 0, z, rng, 1); continue; }
      P().pillarSquare(w, x, z, 0, HC, 1.0);
      if ((z / 6) % 2 < 1) P().torch(w, x - sx * 0.65, 3.6, z, sx < 0 ? 'px' : 'nx'); else if (rng.chance(0.5)) P().banner(w, cx + sx * hw, 9, z + 3, sx < 0 ? 'px' : 'nx', 5, ruined ? 0x101a3a : 0x4a0e0e);
    }
    P().rug(w, cx - hw - 3, nz, 0, 5, 8, [0.18, 0.12, 0.08]);
    for (let z = gz1 + 2; z < D; z += 14) P().chandelier(w, cx, HC - 4, z + 5, HC);
    if (ruined) for (let i = 0; i < 5; i++) P().rubble(w, cx + rng.range(-hw + 1.5, hw - 1.5), 0, rng.range(gz1 + 6, D - 6), rng, rng.range(0.6, 1.1));
    // the facade toward the arena + the sliding stone door (opens by itself as you come, shuts once you are through)
    const gate = 3.2, dh = 8;
    w.solid('block', 0, 0, gz0, cx - gate, HC + 2, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, HC + 2, gz1, { uv: 4 });
    w.solid('block', cx - gate, dh, gz0, cx + gate, HC + 2, gz1, { uv: 4 });
    w.visual('trim', cx - gate - 0.6, 0, gz1, cx - gate, dh + 0.6, gz1 + 0.3, { uv: 1 }); w.visual('trim', cx + gate, 0, gz1, cx + gate + 0.6, dh + 0.6, gz1 + 0.3, { uv: 1 });
    w.visual('trim', cx - gate - 0.6, dh, gz1, cx + gate + 0.6, dh + 0.6, gz1 + 0.3, { uv: 1 });
    for (const sx of [-1, 1]) w.addLight(cx + sx * (gate + 1.2), 5, gz1 + 1.2, { flame: 0.3, intensity: 7, range: 10, color: ruined ? '#4a8aff' : '#ff9a50', prio: 1.2 });
    const col = w.addCollider(cx - gate, 0, gz0 + 1.2, cx + gate, dh, gz1 - 0.6, { surf: 'stone', noGrapple: true });
    const door = { x: cx, gate, dh, z: (gz0 + gz1) / 2 + 0.3, col, k: 0, mesh: null, state: 'closed' };
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(PG().box, w.mats.block); slab.scale.set(gate * 2, dh, 1.0); slab.position.y = dh / 2; g.add(slab);
      const rune = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 6), new THREE.MeshBasicMaterial({ color: 0xff7040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      rune.position.set(0, dh / 2, 0.52); g.add(rune);
      for (const y of [1.2, dh - 1.2]) { const band = new THREE.Mesh(PG().box, w.mats.iron); band.scale.set(gate * 2 + 0.02, 0.25, 1.05); band.position.y = y; g.add(band); }
      g.position.set(cx, 0, door.z); grp.add(g); door.mesh = g; door.rune = rune;
    });
    w.slideDoor = door;
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2, pc: null, slide: door };
    return { nz, side: -1, nx: cx - hw - 3 };
  }
  // the door: slides sideways into the wall when you approach (before the fight), back shut once you're in
  F.tickDoor = function (dt) {
    const w = G.world, d = w && w.slideDoor; if (!d || !d.mesh) return;
    const GM = G.game, P = G.player;
    const want = GM.bossEngaged || GM.areaCleared ? (GM.areaCleared ? 1 : 0) : (P.pos.z > d.z && P.pos.z - d.z < 14 && Math.abs(P.pos.x - d.x) < 9 ? 1 : d.k > 0.5 ? 1 : 0);
    const prev = d.k;
    d.k = U.clamp(d.k + (want ? dt * 0.8 : -dt * 2.2), 0, 1);
    if (d.k !== prev) {
      d.mesh.position.x = d.x + d.k * (d.gate * 2 + 0.2);
      if (Math.random() < dt * 30) G.fx.dust(V(d.x - d.gate + d.k * d.gate * 2, 0.2, d.z + 0.6), V(0, 1, 0), 0x6a5a48, 2);
      if (!d.grind || GM.time - d.grind > 0.35) { d.grind = GM.time; G.sfx.stoneGrind && G.sfx.stoneGrind(V(d.x, 2, d.z), 0.7); }
      if (prev < 1 && d.k >= 1) G.sfx.rumble && G.sfx.rumble(0.5, 0.5);
      if (prev > 0 && d.k <= 0) { G.sfx.explosion(V(d.x, 1, d.z), 0.4); P.addShake(0.4); }
    }
    d.col.alive = d.k < 0.85;
    if (d.rune) d.rune.material.opacity = 0.5 + 0.4 * Math.sin(GM.time * 3);
  };

  // ---------------------------------------------------------------- ancient stone vending machine (coins -> items)
  F.stoneVendor = function (w, x, z, y, face) {
    y = y || 0;
    const sx = face || 1; // +1: faces +x
    w.solid('block', x - 0.9, y, z - 1.2, x + 0.9, y + 3.0, z + 1.2, { uv: 2 });
    w.solid('trim', x - 1.05, y + 3.0, z - 1.35, x + 1.05, y + 3.4, z + 1.35, { uv: 1 });
    w.visual('trim', x - 1.0, y, z - 1.3, x + 1.0, y + 0.3, z + 1.3, { uv: 1 });
    const fx = x + sx * 0.92;
    w.visual('dark', fx - 0.02, y + 0.6, z - 0.5, fx + 0.02, y + 1.0, z + 0.5, { uv: 1, grad: false }); // the tray slot
    w.visual('glow', fx - 0.02, y + 2.2, z - 0.15, fx + 0.02, y + 2.5, z + 0.15, { uv: 1, grad: false }); // the coin slot glows
    const obj = { pos: V(x + sx * 1.2, y + 1.4, z), runes: [] };
    w.deferred.push((grp) => {
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: G.Tex.textTex(['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ'][i], { size: 40, color: '#7ae0ff' }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.position.set(fx + sx * 0.03, y + 1.3 + (i % 3) * 0.35, z - 0.6 + Math.floor(i / 3) * 1.2); m.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(m); obj.runes.push(m);
      }
    });
    w.addLight(x + sx * 1.4, y + 2, z, { flame: 0, intensity: 5, range: 8, color: '#7ae0ff', emit: false, prio: 1.4, steady: true });
    return obj;
  };

  // ---------------------------------------------------------------- the guardian's field
  LG.boss = function (area, seed, bossId) {
    const rng = new G.RNG(seed);
    const style = LG.bossStyle(bossId, seed);
    if (style.arena === 'throne') style.arena = 'fortress';
    const field = G.Run ? G.Run.field(area) : 'gate';
    const outdoor = field === 'grave';
    const W = 76, AD = 76, ROAD = 82, D = AD + ROAD;
    const w = new G.World(W, D, G.Tex.biomeFor(area));
    w.arenaD = AD; w.bossStyle = style; w.field = field;
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const cx = W / 2, cz = AD / 2 - 2;
    H.floors(w, W, AD + 3, null, style.arena === 'colosseum' ? 'floor' : 'cobble');
    H.perimeter(w, rng, W, D, { beams: 0, gates: 3, h: outdoor ? 3.2 : 16, top: outdoor ? undefined : 24 });
    if (outdoor) {
      // the guardian's field is ringed by a tall iron fence on the low cemetery wall
      F.fence(w, 0.2, 0.2, W - 0.2, 0.2, 5.5, LG.gateXs(W, 3).map((g) => [g - 2.6, g + 2.6]));
      F.fence(w, 0.2, 0.2, 0.2, AD, 5.5, []); F.fence(w, W - 0.2, 0.2, W - 0.2, AD, 5.5, []);
    } else F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 2, ruined: field === 'ruin' });
    const nook = outdoor ? roadGrave(w, rng, W, AD, D) : roadHall(w, rng, W, AD, D, field === 'ruin');
    // the stone vending machine + the paid basin
    const vx = nook.nx, vz = nook.nz;
    w.stoneVendor = F.stoneVendor(w, vx - 0.6, vz, 0, 1);
    w.roadMerchant = w.stoneVendor.pos.clone().setY(0);
    w.miniSlots = [];
    w.miniHeal = V(vx + 1.6, 0, vz + 4.2);
    w.road = { z0: AD + 7, z1: D - 4 };
    w.npcSpots = [];
    w.killY = -12;
    w.arenaCenter = V(cx, 0, cz);
    w.bossPillars = [];
    (H.ARENA[style.arena] || H.ARENA.fortress)(w, rng, W, AD, cx, cz);
    H.arenaDressing(w, rng, W, AD, cx, cz);
    w.nestPos = V(W - 4, 11, cz);
    if (bossId === 'broodmother') {
      w.solid('rock', W - 8, 9, cz - 7, W, 10.5, cz + 7, { uv: 4 });
      for (let i = 0; i < 6; i++) P().web(w, rng.range(W - 8, W - 1), rng.range(7, 13), cz + rng.range(-7, 7), Math.PI / 2, rng.range(3, 6));
    }
    if (!outdoor) H.lightShafts(w, rng, W, AD, 3);
    H.fireTops(w, { boss: true, AD });
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    w.isBoss = true;
    // judge reachability with the stone door open (it opens as you arrive)
    if (w.slideDoor) w.slideDoor.col.alive = false;
    H.validate(w);
    if (w.slideDoor) w.slideDoor.col.alive = true;
    return w;
  };
})();
