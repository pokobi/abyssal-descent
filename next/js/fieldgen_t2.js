'use strict';
// The entrance tier's new fields (runplan.js R.TIERS[1]): drawn instead of the dungeon entrance for a segment.
//   catacombs - 地下墓所: the pieces of the ossuary nave (its area: field_catacombs.js) and its guardian approach.
//   castle    - 血月の古城: the pieces of the castle (its area: field_castle.js) and its guardian approach.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  // ---------------------------------------------------------------- 地下墓所
  // an iron gate in a wall (a chapel's, off the nave): the opening walled up with bones to an arch 3 m wide and 4 m high, a two-leaved iron gate in it
  // (strata.js draws and works it), skulls over the arch and candles at its feet. It stands open; shut it behind you (the key) and the
  // monsters must batter it down to follow.
  function cryptGate(w, rng, x, zA, zB, HT, WT) {
    const mid = (zA + zB) / 2, lo = Math.round(mid - 1.5), hi = lo + 3, dh = 4, T = WT / 2;
    w.solid('wall', x - T, 0, zA, x + T, HT, lo - 0.1, { uv: 2.5 }); w.solid('wall', x - T, 0, hi + 0.1, x + T, HT, zB, { uv: 2.5 });
    w.solid('wall', x - T, dh + 0.12, lo - 0.1, x + T, HT, hi + 0.1, { uv: 2.5 });
    for (const f of [-1, 1]) {
      ossuary(w, rng, zA, lo - 0.1, x + f * T, false, f, 0); ossuary(w, rng, hi + 0.1, zB, x + f * T, false, f, 0);
      // the arch: a band of dressed stone round the opening, a skull for a keystone, candles either side
      w.visual('trim', x + f * T - (f < 0 ? 0.12 : 0), dh + 0.12, lo - 0.45, x + f * T + (f > 0 ? 0.12 : 0), dh + 0.5, hi + 0.45, { uv: 1 });
      for (const z of [lo - 0.45, hi + 0.1]) w.visual('trim', x + f * T - (f < 0 ? 0.12 : 0), 0, z, x + f * T + (f > 0 ? 0.12 : 0), dh + 0.12, z + 0.35, { uv: 1 });
      P().skull(w, x + f * (T + 0.12), dh + 0.62, mid, f > 0 ? Math.PI / 2 : -Math.PI / 2, 1.5);
      for (const z of [lo - 0.9, hi + 0.9]) P().candles(w, x + f * (T + 0.45), 0, z, rng, true);
    }
    w.doors = w.doors || [];
    const c = w.addCollider(x - 0.06, 0, lo + 0.02, x + 0.06, dh, hi - 0.02, { surf: 'metal', noGrapple: true });
    c.bars = true; c.navIgnore = true; c.alive = false; // (monsters plan their way through it; it starts open)
    const door = { axis: 'z', plane: x, lo, hi, y: 0, h: dh, hinge: 0, face: rng.chance(0.5) ? 1 : -1, col: c, hp: 100, state: 'open', s0: 'open', leaves: 2 };
    const it = { type: 'celldoor', pos: V(x, 1.2, (lo + hi) / 2), door, opened: true };
    door.it = it; c.door = door; w.doors.push(door); w.interactables.push(it);
  }
  // an ossuary wall face: rows of skulls in dark niches (visual, on a wall along x or z, facing dir)
  function ossuary(w, rng, a0, a1, c, alongX, face, y0) {
    // (the niche built out of the wall: a sill under each row and a lintel over it, piers between the bays; in it the ends of stacked
    // long bones, and the skulls set along the top of them, each turned a little its own way)
    const PGs = PG(), deep = 0.3;
    const slab = (mk, u0, u1, ya, yb, d0, d1, o) => { const lo = c + face * Math.min(d0, d1), hi = c + face * Math.max(d0, d1), x0 = Math.min(lo, hi), x1 = Math.max(lo, hi); if (alongX) w.visual(mk, u0, ya, x0, u1, yb, x1, o); else w.visual(mk, x0, ya, u0, x1, yb, u1, o); };
    const ry0 = alongX ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
    for (let y = y0 + 0.9; y < y0 + 4.2; y += 1.1) {
      if (rng.chance(0.25)) continue;
      slab('dark', a0 + 0.3, a1 - 0.3, y, y + 0.55, 0.02, 0.06, { uv: 1, grad: false });
      if (a1 - a0 > 1.4) {
        slab('trim', a0 + 0.16, a1 - 0.16, y - 0.13, y, 0, deep + 0.05, { uv: 1.2, grad: false });
        slab('trim', a0 + 0.16, a1 - 0.16, y + 0.55, y + 0.69, 0, deep - 0.04, { uv: 1.2, grad: false });
        const nb = Math.max(1, Math.round((a1 - a0 - 0.6) / 2.4)), bw = (a1 - a0 - 0.6) / nb;
        for (let k = 0; k <= nb; k++) { const u = a0 + 0.3 + k * bw; slab('trim', u - 0.13, u + 0.13, y, y + 0.55, 0, deep, { uv: 1.2, grad: false }); }
        if (PGs.boneEnds) for (let k = 0; k < nb; k++) {
          const u = a0 + 0.3 + (k + 0.5) * bw, d = 0.13;
          if (alongX) w.batch.geo('bone', PGs.boneEnds, Mx(u, y, c + face * d, bw - 0.3, 0.3, 0.2, 0, face > 0 ? 0 : Math.PI, 0), { tint: [0.62, 0.58, 0.5] });
          else w.batch.geo('bone', PGs.boneEnds, Mx(c + face * d, y, u, bw - 0.3, 0.3, 0.2, 0, face > 0 ? Math.PI / 2 : -Math.PI / 2, 0), { tint: [0.62, 0.58, 0.5] });
        }
      }
      for (let u = a0 + 0.55; u < a1 - 0.4; u += 0.55) if (rng.chance(0.7)) {
        const ry = ry0 + (((u * 7.3 + y * 3.1) % 1) - 0.5) * 0.7, yy = y + (a1 - a0 > 1.4 && PGs.boneEnds ? 0.3 : 0.02);
        if (alongX) P().skull(w, u, yy, c + face * 0.17, ry, 0.95); else P().skull(w, c + face * 0.17, yy, u, ry, 0.95);
      }
    }
  }
  // (the catacombs' area itself: field_catacombs.js, the great ossuary nave; these two pieces are its)
  F._crypt = { gate: cryptGate, ossuary };
  // the catacombs' guardian approach: a long burial gallery (the stone hall's build, its walls lined with skulls)
  F.SHELL.catacombs = {
    outdoor: false,
    road(w, rng, W, AD, D) {
      const nook = FB.roadHall(w, rng, W, AD, D, false);
      const cx = W / 2, hw = 7;
      for (let z = AD + 8; z < D - 6; z += 6) for (const sx of [-1, 1]) { if (sx < 0 && Math.abs(z - nook.nz) < 7) continue; ossuary(w, rng, z - 2.4, z + 2.4, cx + sx * hw, false, -sx, 0); }
      return nook;
    },
    ring(w, rng, W, AD) { F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 3 }); },
    dress(w, rng, W, AD) {
      for (let x = 8; x < W - 6; x += 10) ossuary(w, rng, x - 3, x + 3, 0.02, true, 1, 0);
      for (let z = 10; z < AD - 8; z += 10) { ossuary(w, rng, z - 3, z + 3, 0.02, false, 1, 0); ossuary(w, rng, z - 3, z + 3, W - 0.02, false, -1, 0); }
      for (let i = 0; i < 6; i++) P().web(w, rng.chance(0.5) ? rng.range(2, 8) : rng.range(W - 8, W - 2), rng.range(8, 16), rng.range(4, AD - 6), rng.range(0, 3), rng.range(2.5, 4));
    },
    text: { sub: '— 墓所の底へ —', icon: '💀', obj: '納骨の回廊を進め — 石の扉をくぐると戦いが始まる' },
  };

  // ---------------------------------------------------------------- 血月の古城
  const RED = 0x5a0a0a;
  // a wall walk along the inside of the west or east curtain wall: a solid ledge with a stair at each end and a parapet toward the bailey
  function wallWalk(w, rng, occ, x0, x1, z0, z1, h, side, avoid) {
    const L = LG.stairsLen(h), sw = 2.2;
    w.solid('wall', x0, 0, z0 + L, x1, h - 0.25, z1 - L, { uv: 3 });
    w.solid('trim', x0 - 0.05, h - 0.25, z0 + L, x1 + 0.05, h, z1 - L, { uv: 2 });
    const cx = side < 0 ? x0 + sw / 2 + 0.2 : x1 - sw / 2 - 0.2;
    H.stairs(w, 'N', z0 + L, cx, sw, 0, h, 'trim'); H.stairs(w, 'S', z1 - L, cx, sw, 0, h, 'trim');
    // the parapet on the bailey side, open where a stair arrives; merlons on the wall top behind are the curtain's own
    const ex = side < 0 ? x1 - 0.35 : x0;
    w.solid('wall', ex, h, z0 + L + 0.2, ex + 0.35, h + 1.0, z1 - L - 0.2, { uv: 1.5 });
    for (let z = z0 + L + 2; z < z1 - L - 1; z += 3) w.solid('block', ex - 0.05, h + 1.0, z, ex + 0.4, h + 1.45, z + 1.2, { uv: 1, noGrapple: true });
    occ.mark(x0 - 1, z0, x1 + 1, z1);
    for (let z = z0 + L + 4; z < z1 - L - 3; z += 10) { P().brazier(w, (x0 + x1) / 2, h, z, 0.8); P().banner(w, ex + (side < 0 ? 0.36 : -0.01), h - 0.3, z + 5, side < 0 ? 'px' : 'nx', 3, RED); }
    // a cauldron of boiling oil (煮え油の大釜, gimmick_a.js) set in one of the crenels, over a patch of the bailey kept clear below it:
    // not by a brazier or a banner, not where the inner curtain will cross (avoid)
    if (G.Gim) {
      const wall = side < 0 ? x1 : x0, sg = -side, out = [];
      for (let z = z0 + L + 2; z + 3 < z1 - L - 1; z += 3) {
        const zc = z + 2.1;
        if (zc - 4 < 15 || zc + 4 > z1) continue;
        let near = false; for (let b = z0 + L + 4; b < z1 - L - 3; b += 10) if (Math.abs(zc - b) < 2.6 || Math.abs(zc - (b + 5)) < 1.6) near = true;
        if (near || (avoid && zc + 4 > avoid[0] && zc - 4 < avoid[1])) continue;
        const ax0 = Math.min(wall + sg * 1.6, wall + sg * 4.6), ax1 = Math.max(wall + sg * 1.6, wall + sg * 4.6); // (the first metre and a half is the walk's own margin)
        if (occ.free(ax0, zc - 4, ax1, zc + 4)) out.push(zc);
      }
      if (out.length) {
        const zc = rng.pick(out), zx0 = Math.min(wall, wall + sg * 4), zx1 = Math.max(wall, wall + sg * 4);
        occ.mark(Math.min(wall + sg * 1.6, wall + sg * 4.6), zc - 4, Math.max(wall + sg * 1.6, wall + sg * 4.6), zc + 4);
        G.Gim.addOilPot(w, side, wall, h, zc, { x0: zx0, z0: zc - 3.5, x1: zx1, z1: zc + 3.5 });
      }
    }
    return { x0: x0 + 0.4, z0: z0 + L + 0.4, x1: x1 - 0.4, z1: z1 - L - 0.4, y: h, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  }
  // a square tower: solid, crenellated, banners, a lit arrow slit (a landmark at the corners of the bailey)
  function tower(w, rng, x, z, s, h) {
    w.solid('block', x - s, 0, z - s, x + s, h, z + s, { uv: 3 });
    w.solid('trim', x - s - 0.25, h, z - s - 0.25, x + s + 0.25, h + 0.35, z + s + 0.25, { uv: 2, noGrapple: true });
    for (let k = -s; k < s - 0.4; k += 1.4) for (const [a, b] of [[x + k, z - s - 0.25], [x + k, z + s - 0.35], [x - s - 0.25, z + k], [x + s - 0.35, z + k]]) w.solid('block', a, h + 0.35, b, a + 0.7, h + 1.25, b + 0.6, { uv: 1, noGrapple: true });
    w.addCollider(x - s, h + 0.35, z - s, x + s, h + 6, z + s, { noGrapple: true });
    for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0]]) w.visual('glow', x + dx * (s + 0.02) - (dz ? 0.12 : 0.02), h * 0.6, z + dz * (s + 0.02) - (dx ? 0.12 : 0.02), x + dx * (s + 0.02) + (dz ? 0.12 : 0.02), h * 0.6 + 1.2, z + dz * (s + 0.02) + (dx ? 0.12 : 0.02), { uv: 1, grad: false });
    P().banner(w, x, h - 1, z + s + 0.01, 'pz', 4, RED);
  }
  // the great hall: roofless walls with tall windows, doors on three sides, long tables, the lord's seat under his banners
  function greatHall(w, rng, R) {
    const x0 = R.x0, z0 = R.z0, x1 = R.x1, z1 = R.z1, T = 0.9, HH = 7.5, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const seg = (horiz, fixed, a0, a1, door) => {
      for (let s = a0; s < a1 - 0.01; s += 1) {
        const e = Math.min(a1, s + 1), m = (s + e) / 2, hh = HH * (0.7 + 0.3 * Math.abs(Math.sin(m * 0.9 + x0)));
        const B = (y0, y1) => { if (y1 - y0 < 0.05) return; if (horiz) w.solid('wall', s, y0, fixed, e, y1, fixed + T, { uv: 2.5 }); else w.solid('wall', fixed, y0, s, fixed + T, y1, e, { uv: 2.5 }); };
        if (door && Math.abs(m - door) < 1.6) { B(3.6, hh); continue; }
        if (!door && Math.round(m) % 4 === 0 && m > a0 + 2 && m < a1 - 2) { B(0, 2.4); B(5.4, hh); continue; } // tall window
        B(0, hh);
      }
    };
    seg(true, z0, x0, x1, null); seg(true, z1 - T, x0, x1, mx);
    seg(false, x0, z0 + T, z1 - T, rng.chance(0.6) ? mz : null); seg(false, x1 - T, z0 + T, z1 - T, mz);
    // the dais and the seat at the north end
    w.solid('trim', mx - 3, 0, z0 + T, mx + 3, 0.5, z0 + T + 3, { uv: 1 });
    w.solid('block', mx - 0.9, 0.5, z0 + T + 0.6, mx + 0.9, 3.2, z0 + T + 1.4, { uv: 1 }); w.solid('block', mx - 0.9, 0.5, z0 + T + 1.4, mx + 0.9, 1.1, z0 + T + 2.3, { uv: 1 });
    for (const sx of [-1, 1]) P().banner(w, mx + sx * 2.4, HH - 1.2, z0 + T + 0.01, 'pz', 5, RED);
    for (const sx of [-1, 1]) P().brazier(w, mx + sx * 2.6, 0.5, z0 + T + 2.2, 0.9);
    // two long tables down the hall
    for (const sx of [-1, 1]) for (let z = z0 + 6; z < z1 - 4; z += 2.6) P().table(w, mx + sx * 3.2, z, 0, false, rng);
    for (let i = 0; i < 3; i++) P().rubble(w, rng.range(x0 + 2, x1 - 2), 0, rng.range(z0 + 5, z1 - 3), rng, rng.range(0.7, 1.2));
    // fallen roof beams
    for (let i = 0; i < 3; i++) { const z = rng.range(z0 + 4, z1 - 4); w.solid('woodDark', x0 + T, rng.range(5, 6.5), z - 0.25, x1 - T, rng.range(6.6, 7.2), z + 0.25, { uv: 2 }); }
  }
  // the training yard: straw men on posts, a weapon rack, an archery butt
  function trainingYard(w, rng, x0, z0, x1, z1) {
    for (let i = 0; i < 4; i++) {
      const x = rng.range(x0 + 1.5, x1 - 1.5), z = rng.range(z0 + 1.5, z1 - 1.5);
      w.solid('woodDark', x - 0.08, 0, z - 0.08, x + 0.08, 1.9, z + 0.08, { uv: 1 });
      w.visual('woodDark', x - 0.6, 1.45, z - 0.05, x + 0.6, 1.55, z + 0.05, { uv: 1 });
      w.batch.geo('wood', PG().cyl8, Mx(x, 1.25, z, 0.32, 0.8, 0.32), { tint: [1.2, 1.05, 0.62] });
      w.batch.geo('wood', PG().sph, Mx(x, 1.85, z, 0.22, 0.24, 0.22), { tint: [1.2, 1.05, 0.62] });
    }
    P().weaponRack(w, (x0 + x1) / 2, z0 + 0.6, 0, true);
    const bx = x1 - 1.4, bz = (z0 + z1) / 2;
    w.batch.geo('wood', PG().cyl, Mx(bx, 1.2, bz, 0.9, 0.3, 0.9, 0, 0, Math.PI / 2), { tint: [1.2, 1.05, 0.62] });
    w.batch.geo('cloth', PG().cyl, Mx(bx - 0.16, 1.2, bz, 0.5, 0.02, 0.5, 0, 0, Math.PI / 2), { tint: [1.4, 0.4, 0.3] });
    w.solid('woodDark', bx - 0.1, 0, bz - 0.6, bx + 0.1, 1.0, bz + 0.6, { uv: 1 });
  }
  // stables: an open-fronted shed of posts under a lean-to roof, straw on the floor
  function stables(w, rng, x0, z0, x1, z1) {
    w.solid('woodDark', x0, 0, z0, x1, 3.2, z0 + 0.3, { uv: 2 });
    for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / Math.max(2, Math.round((x1 - x0) / 3))) { w.solid('woodDark', x - 0.12, 0, z1 - 0.24, x + 0.12, 2.6, z1, { uv: 1 }); if (x < x1 - 1) w.solid('wood', x + 0.1, 0, z0 + 0.3, x + 0.25, 1.4, z1 - 1.2, { uv: 1 }); }
    w.batch.geo('woodDark', PG().box, Mx((x0 + x1) / 2, 3.0, (z0 + z1) / 2, x1 - x0 + 0.6, 0.1, z1 - z0 + 0.9, 0.18, 0, 0));
    w.addCollider(x0, 2.7, z0, x1, 3.3, z1, { noGrapple: true });
    w.visual('wood', x0 + 0.3, 0, z0 + 0.3, x1 - 0.3, 0.06, z1 - 0.3, { uv: 2, grad: false, tint: [1.2, 1.05, 0.62] });
  }
  // (the castle's area itself: field_castle.js, three baileys down a hillside; it builds with these pieces)
  F._castle = { wallWalk, tower, greatHall, trainingYard, stables, RED };
  // the castle's guardian approach: between the curtain walls to the gatehouse
  function roadCastle(w, rng, W, AD, D) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 4.5, side = 13;
    w.solid('floor', 0, -1, gz1, W, 0, D, { uv: 2 });
    w.visual('cobble', cx - hw, 0, gz1, cx + hw, 0.03, D, { uv: 2, grad: false });
    w.solid('block', 0, 0, gz1, cx - side, 8, D, { uv: 3 }); w.solid('block', cx + side, 0, gz1, W, 8, D, { uv: 3 });
    for (const sx of [-1, 1]) for (let x = cx + sx * side; Math.abs(x - cx) < 40 && x > 0 && x < W; x += sx * 1.8) w.solid('block', x - 0.45, 8, D - 1, x + 0.45, 9, D, { uv: 1, noGrapple: true });
    const nz = gz1 + (D - gz1) * 0.45;
    for (let z = gz1 + 6; z < D - 4; z += 8) for (const sx of [-1, 1]) {
      if (sx < 0 && Math.abs(z - nz) < 6) continue;
      P().banner(w, cx + sx * side, 7, z, sx < 0 ? 'px' : 'nx', 4.5, RED);
      P().torch(w, cx + sx * side, 3.4, z + 4, sx < 0 ? 'px' : 'nx');
    }
    // the gatehouse: two squat towers either side of the iron gate
    const gate = 3.2;
    w.solid('block', 0, 0, gz0, cx - gate, 8, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, 8, gz1, { uv: 4 });
    for (const sx of [-1, 1]) tower(w, rng, cx + sx * (gate + 2.6), gz1 + 1.4, 2.6, 10);
    w.solid('block', cx - gate, 7, gz0, cx + gate, 9.5, gz1, { uv: 3 });
    w.addCollider(cx - gate, 9.5, gz0, cx + gate, 14, gz1, { noGrapple: true });
    for (const sx of [-1, 1]) w.addLight(cx + sx * (gate + 0.8), 5.5, gz1 + 4.4, { flame: 0.3, intensity: 7, range: 11, color: '#ff6a40', prio: 1.2 });
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => { const pc = H.portcullis(w, gate * 2 - 0.2, 6.2); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
    return { nz, side: -1, nx: cx - hw - 2.4 };
  }
  F.SHELL.castle = {
    outdoor: true, wallH: 8, road: roadCastle,
    ring(w, rng, W, AD, last) {
      // the inner curtain: a crenellated wall round the field, gaps for the gates north
      const gaps = last ? [] : LG.gateXs(W, 3).map((g) => [g - 2.6, g + 2.6]);
      const wallZ = (x0, x1) => { w.solid('block', x0, 0, 0.2, x1, 6, 1.2, { uv: 3 }); for (let x = x0 + 0.2; x < x1 - 0.6; x += 1.6) w.solid('block', x, 6, 0.2, x + 0.8, 6.9, 0.7, { uv: 1, noGrapple: true }); };
      let x = 0.2; for (const [a, b] of gaps) { if (a > x) wallZ(x, a); x = b; } if (x < W - 0.2) wallZ(x, W - 0.2);
      for (const [x0, x1] of [[0.2, 1.2], [W - 1.2, W - 0.2]]) { w.solid('block', x0, 0, 1.2, x1, 6, AD, { uv: 3 }); for (let z = 1.4; z < AD - 0.6; z += 1.6) w.solid('block', x0, 6, z, x1, 6.9, z + 0.8, { uv: 1, noGrapple: true }); }
    },
    dress(w, rng, W, AD) {
      for (let z = 10; z < AD - 6; z += 14) { P().banner(w, 1.2, 5.6, z, 'px', 3.6, RED); P().banner(w, W - 1.2, 5.6, z + 7, 'nx', 3.6, RED); }
      for (const [x, z] of [[4, 4], [W - 4, 4]]) P().brazier(w, x, 0, z, 1.2);
    },
    text: { sub: '— 城の奥へ —', icon: '🏰', obj: '城壁の間を進め — 城門をくぐると戦いが始まる' },
  };
})();
