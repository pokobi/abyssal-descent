'use strict';
// The surface tier's new fields (runplan.js R.TIERS[0]): drawn instead of the graveyard for a segment.
//   hamlet - 霧の廃村: the village's pieces (its area: field_hamlet.js) and the guardian's approach down its main street.
//   dusk   - 黄昏の廃都: the fallen city's pieces (its area: field_dusk.js) and its guardian approach.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));
  const STRAW = [1.2, 1.05, 0.62];

  // ---------------------------------------------------------------- village pieces
  // a low split-rail fence along an axis (posts + two rails, one thin collider per run, gaps left open)
  F.woodFence = function (w, x0, z0, x1, z1, h, gaps) {
    h = h || 1.1; gaps = gaps || [];
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1), c = alongX ? z0 : x0;
    const segs = []; let s = a0;
    for (const [ga, gb] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (ga > s) segs.push([s, ga]); s = Math.max(s, gb); }
    if (s < a1) segs.push([s, a1]);
    for (const [p, q] of segs) {
      if (q - p < 0.4) continue;
      const box = (u0, y0, u1, y1, t) => { if (alongX) w.visual('woodDark', u0, y0, c - t, u1, y1, c + t, { uv: 1 }); else w.visual('woodDark', c - t, y0, u0, c + t, y1, u1, { uv: 1 }); };
      box(p, h * 0.42, q, h * 0.42 + 0.09, 0.04); box(p, h * 0.82, q, h * 0.82 + 0.09, 0.04);
      for (let u = p; u <= q + 0.01; u += Math.max(1.4, (q - p) / Math.ceil((q - p) / 2.2))) box(Math.min(u, q) - 0.07, 0, Math.min(u, q) + 0.07, h + 0.12, 0.07);
      if (alongX) w.addCollider(p, 0, c - 0.08, q, h, c + 0.08, { surf: 'wood', noGrapple: true });
      else w.addCollider(c - 0.08, 0, p, c + 0.08, h, q, { surf: 'wood', noGrapple: true });
    }
  };
  // a timber palisade: sharpened stakes side by side (the guardian's ring in the hamlet)
  F.palisade = function (w, x0, z0, x1, z1, h, gaps) {
    gaps = gaps || [];
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1), c = alongX ? z0 : x0;
    const segs = []; let s = a0;
    for (const [ga, gb] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (ga > s) segs.push([s, ga]); s = Math.max(s, gb); }
    if (s < a1) segs.push([s, a1]);
    let k = 0;
    for (const [p, q] of segs) {
      if (q - p < 0.4) continue;
      for (let u = p + 0.2; u < q; u += 0.42) {
        const hh = h * (0.9 + 0.1 * Math.sin(k++ * 2.3)), x = alongX ? u : c, z = alongX ? c : u;
        w.batch.geo('woodDark', PG().cyl8, Mx(x, hh / 2, z, 0.2, hh, 0.2));
        w.batch.geo('woodDark', PG().cone, Mx(x, hh + 0.25, z, 0.2, 0.5, 0.2));
      }
      const band = (y) => { if (alongX) w.visual('wood', p, y, c - 0.26, q, y + 0.16, c - 0.2, { uv: 1 }); else w.visual('wood', c + 0.2, y, p, c + 0.26, y + 0.16, q, { uv: 1 }); };
      band(h * 0.3); band(h * 0.72);
      if (alongX) w.addCollider(p, 0, c - 0.22, q, h + 0.4, c + 0.22, { surf: 'wood', noGrapple: true });
      else w.addCollider(c - 0.22, 0, p, c + 0.22, h + 0.4, q, { surf: 'wood', noGrapple: true });
    }
  };
  function haystack(w, x, z, s) {
    s = s || 1;
    w.batch.geo('wood', PG().cyl, Mx(x, 0.6 * s, z, 1.05 * s, 1.2 * s, 1.05 * s), { tint: STRAW });
    w.batch.geo('wood', PG().cone, Mx(x, 1.5 * s, z, 1.1 * s, 0.7 * s, 1.1 * s), { tint: STRAW });
    w.addCollider(x - 0.95 * s, 0, z - 0.95 * s, x + 0.95 * s, 1.5 * s, z + 0.95 * s, { surf: 'wood', noGrapple: true });
  }
  // a broken farm cart, along x or along z
  function cart(w, rng, x, z, alongX) {
    const L = 2.6, Wd = 1.4, y = 0.62;
    const hx = alongX ? L / 2 : Wd / 2, hz = alongX ? Wd / 2 : L / 2;
    w.solid('wood', x - hx, y, z - hz, x + hx, y + 0.14, z + hz, { uv: 1.5 });
    for (const sd of [-1, 1]) { if (alongX) w.solid('woodDark', x - hx, y + 0.14, z + sd * (hz - 0.06) - 0.06, x + hx, y + 0.62, z + sd * (hz - 0.06) + 0.06, { uv: 1 }); else w.solid('woodDark', x + sd * (hx - 0.06) - 0.06, y + 0.14, z - hz, x + sd * (hx - 0.06) + 0.06, y + 0.62, z + hz, { uv: 1 }); }
    // wheels (one lies broken on the ground) and the shaft
    for (const sd of [-1, 1]) {
      if (sd > 0 && rng.chance(0.4)) { w.batch.geo('woodDark', PG().cyl8, Mx(x + (alongX ? 1.6 : 1.8), 0.05, z + (alongX ? 1.8 : 1.6), 0.55, 0.08, 0.55)); continue; }
      if (alongX) w.batch.geo('woodDark', PG().cyl8, Mx(x, 0.55, z + sd * (hz + 0.08), 0.55, 0.1, 0.55, Math.PI / 2, 0, 0));
      else w.batch.geo('woodDark', PG().cyl8, Mx(x + sd * (hx + 0.08), 0.55, z, 0.55, 0.1, 0.55, 0, 0, Math.PI / 2));
    }
    w.addCollider(x - hx, 0, z - hz, x + hx, y + 0.14, z + hz, { surf: 'wood', noGrapple: true });
    if (alongX) w.visual('woodDark', x + hx, 0.5, z - 0.05, x + hx + 1.6, 0.6, z + 0.05, { uv: 1 }); else w.visual('woodDark', x - 0.05, 0.5, z + hz, x + 0.05, 0.6, z + hz + 1.6, { uv: 1 });
    if (rng.chance(0.6)) P().crate(w, x + rng.range(-0.4, 0.4), z + rng.range(-0.3, 0.3), y + 0.14, rng, 0.8);
  }
  // a market stall: a counter, four posts and a faded awning
  function stall(w, rng, x, z, alongX) {
    const hx = alongX ? 1.6 : 1.1, hz = alongX ? 1.1 : 1.6;
    P().table(w, x, z, 0, alongX, null);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.solid('woodDark', x + sx * hx - 0.07, 0, z + sz * hz - 0.07, x + sx * hx + 0.07, 2.4, z + sz * hz + 0.07, { uv: 1 });
    const tint = rng.pick([[1.4, 0.7, 0.5], [0.8, 0.9, 1.3], [1.3, 1.2, 0.8], [0.9, 1.2, 0.8]]);
    w.batch.geo('cloth', PG().box, Mx(x, 2.5, z, hx * 2 + 0.5, 0.05, hz * 2 + 0.5, alongX ? 0.18 : 0, 0, alongX ? 0 : 0.18), { tint });
    for (let i = 0; i < rng.int(1, 3); i++) { const a = rng.range(0, 6.28); if (rng.chance(0.5)) P().crate(w, x + Math.cos(a) * (hx + 0.9), z + Math.sin(a) * (hz + 0.9), 0, rng, 0.75); else P().barrel(w, x + Math.cos(a) * (hx + 0.9), z + Math.sin(a) * (hz + 0.9), 0, rng); }
  }
  // a scarecrow keeping watch over a garden
  function scarecrow(w, rng, x, z) {
    w.solid('woodDark', x - 0.07, 0, z - 0.07, x + 0.07, 2.4, z + 0.07, { uv: 1 });
    w.visual('woodDark', x - 0.9, 1.75, z - 0.05, x + 0.9, 1.85, z + 0.05, { uv: 1 });
    w.batch.geo('cloth', PG().box, Mx(x, 1.35, z, 0.7, 0.9, 0.22), { tint: [0.9, 0.75, 0.55] });
    w.batch.geo('wood', PG().sph, Mx(x, 2.25, z, 0.24, 0.26, 0.24), { tint: STRAW });
    w.batch.geo('woodDark', PG().cone, Mx(x, 2.55, z, 0.42, 0.3, 0.42), { tint: [0.6, 0.55, 0.5] });
  }
  // the bell tower of the village chapel (solid; a landmark you can see over the roofs)
  function belltower(w, rng, x, z, h, rx) {
    const s = 2.2;
    w.solid('wall', x - s, 0, z - s, x + s, h, z + s, { uv: 3 });
    w.solid('trim', x - s - 0.2, h, z - s - 0.2, x + s + 0.2, h + 0.4, z + s + 0.2, { uv: 2 });
    // the open belfry: four corner piers and the bell, then the steep roof
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.solid('trim', x + dx * (s - 0.35) - 0.35, h + 0.4, z + dz * (s - 0.35) - 0.35, x + dx * (s - 0.35) + 0.35, h + 3.2, z + dz * (s - 0.35) + 0.35, { uv: 1, noGrapple: true });
    if (G.Gim) G.Gim.bellTower(w, x, z, h, s, rx || 1); // (the bell: 弔いの鐘, gimmick_a.js; its rope hangs down the rx face)
    else w.batch.geo('brass', PG().bowl, Mx(x, h + 2.4, z, 1.5, 2.6, 1.5, Math.PI, 0, 0)); // (the bell, mouth down)
    w.solid('trim', x - s - 0.3, h + 3.2, z - s - 0.3, x + s + 0.3, h + 3.55, z + s + 0.3, { uv: 2, noGrapple: true });
    w.batch.geo('woodDark', PG().cone, Mx(x, h + 5.4, z, s * 1.55, 3.7, s * 1.55, 0, Math.PI / 8, 0));
    w.addCollider(x - s, h + 3.55, z - s, x + s, h + 7, z + s, { noGrapple: true });
    w.addLight(x, h + 1.6, z, { flame: 0.2, intensity: 6, range: 12, color: '#ffb070', prio: 0.8 });
  }

  // ---------------------------------------------------------------- 霧の廃村
  // (the hamlet's area itself: field_hamlet.js, houses to walk into and roofs to walk on; it builds with these pieces)
  F._hamlet = { haystack, cart, stall, scarecrow, belltower };

  // ---------------------------------------------------------------- the hamlet's guardian approach: the main street between the last houses
  function roadHamlet(w, rng, W, AD, D) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 4.5, side = 15;
    w.solid('floor', 0, -1, gz1, W, 0, D, { uv: 2 });
    w.visual('cobble', cx - hw, 0, gz1, cx + hw, 0.03, D, { uv: 2, grad: false });
    w.solid('block', 0, 0, gz1, cx - side, 4.6, D, { uv: 3 }); w.solid('block', cx + side, 0, gz1, W, 4.6, D, { uv: 3 });
    // the last houses of the village face the street: gables, dark doors, shuttered windows, lamps
    const nz = gz1 + (D - gz1) * 0.45;
    for (let z = gz1 + 4; z < D - 6; z += 10) for (const sx of [-1, 1]) {
      const fx = cx + sx * side, d = 6.5, x0 = sx < 0 ? fx : fx - d, x1 = sx < 0 ? fx + d : fx, z0 = z, z1 = z + 7.5, h = rng.range(3.6, 4.6);
      w.solid('wall', x0, 0, z0, x1, h, z1, { uv: 2.5 });
      for (const zz of [z0 + 1.4, z1 - 1.4]) w.visual('woodDark', sx < 0 ? x1 : x0 - 0.04, 0, zz - 0.7, sx < 0 ? x1 + 0.04 : x0, 2.2, zz + 0.7, { uv: 1 });
      w.visual('dark', sx < 0 ? x1 : x0 - 0.02, 2.6, (z0 + z1) / 2 - 0.5, sx < 0 ? x1 + 0.02 : x0, 3.3, (z0 + z1) / 2 + 0.5, { uv: 1, grad: false });
      w.batch.geo('woodDark', PG().box, Mx((x0 + x1) / 2 + sx * 0.6, h + 0.9, (z0 + z1) / 2, d * 0.6, 0.12, 8.2, 0, 0, sx * 0.55));
      w.batch.geo('woodDark', PG().box, Mx((x0 + x1) / 2 - sx * 1.6, h + 0.9, (z0 + z1) / 2, d * 0.6, 0.12, 8.2, 0, 0, -sx * 0.55));
      w.addCollider(x0, h, z0, x1, h + 2, z1, { noGrapple: true });
      if (!(sx < 0 && Math.abs(z + 3 - nz) < 8)) { if (rng.chance(0.5)) haystack(w, cx + sx * (hw + 3), z + 3.5, 0.8); else if (rng.chance(0.5)) P().barrel(w, cx + sx * (hw + 2.4), z + 2, 0, rng); } // (the merchant's nook stays clear)
      if ((z / 10) % 2 < 1) F.lantern(w, cx + sx * (hw + 0.6), z + 5, '#ffb070');
    }
    // the palisade gate: two timber towers, the iron gate slams shut behind you
    const gate = 3.2;
    w.solid('block', 0, 0, gz0, cx - gate, 4.6, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, 4.6, gz1, { uv: 4 });
    for (const sx of [-1, 1]) {
      const tx = cx + sx * (gate + 1.1);
      w.solid('woodDark', tx - 1.1, 0, gz0 - 0.6, tx + 1.1, 7.2, gz1 + 0.6, { uv: 2 });
      w.solid('wood', tx - 1.4, 7.2, gz0 - 0.9, tx + 1.4, 7.5, gz1 + 0.9, { uv: 1, noGrapple: true });
      w.batch.geo('woodDark', PG().cone, Mx(tx, 8.6, (gz0 + gz1) / 2, 1.9, 2.2, 2.4, 0, Math.PI / 4, 0));
      w.addCollider(tx - 1.4, 7.5, gz0 - 0.9, tx + 1.4, 10, gz1 + 0.9, { noGrapple: true });
      P().skull(w, tx, 6.6, gz1 + 0.62, 0, 1.3);
      w.addLight(tx, 6.8, gz1 + 1.4, { flame: 0.3, intensity: 7, range: 11, color: '#ff8a40', prio: 1.2 });
    }
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => { const pc = H.portcullis(w, gate * 2 - 0.2, 6.2); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
    return { nz, side: -1, nx: cx - hw - 2.4 };
  }
  F.SHELL.hamlet = {
    outdoor: true, wallH: 3.2, road: roadHamlet,
    ring(w, rng, W, AD, last) {
      F.palisade(w, 0.4, 0.4, W - 0.4, 0.4, 4.8, last ? [] : LG.gateXs(W, 3).map((g) => [g - 2.6, g + 2.6]));
      F.palisade(w, 0.4, 0.4, 0.4, AD, 4.8, []); F.palisade(w, W - 0.4, 0.4, W - 0.4, AD, 4.8, []);
    },
    dress(w, rng, W, AD) {
      // the village's leavings at the edges of the field: hay, a cart, lamp posts on the palisade
      for (const [x, z] of [[5, 6], [W - 5, 6], [5, AD - 10], [W - 5, AD - 10]]) if (rng.chance(0.7)) haystack(w, x, z, rng.range(0.9, 1.2));
      if (rng.chance(0.7)) cart(w, rng, rng.chance(0.5) ? 7 : W - 7, AD / 2 + rng.range(-8, 8), false);
      for (let z = 12; z < AD - 6; z += 16) { F.lantern(w, 1.6, z, '#ffb070'); F.lantern(w, W - 1.6, z, '#ffb070'); }
    },
    text: { sub: '— 村の奥へ —', icon: '🏚️', obj: '村の奥へ進め — 柵の門をくぐると戦いが始まる' },
  };

  // ---------------------------------------------------------------- 黄昏の廃都
  // A two-storey ruin: roofless outer walls (doorways, broken window rows) round a court; an upper floor along one side reached by
  // a stair inside, its parapet open toward the court: the rooftops you shoot from. Returns its upper floor (a platTop).
  function ruinBlock(w, rng, R, h2) {
    const x0 = R.x0 + 0.5, z0 = R.z0 + 0.5, x1 = R.x1 - 0.5, z1 = R.z1 - 0.5, T = 0.6, top = h2 + rng.range(2.5, 4.5);
    // the doors keep clear of the gallery and its stair: the gallery runs along the north wall (or the west one in a deep ruin)
    const alongX = (x1 - x0) >= (z1 - z0);
    const doors = alongX ? { N: false, S: true, W: rng.chance(0.4), E: false } : { N: false, S: rng.chance(0.5), W: false, E: true };
    const edge = (side) => {
      const horiz = side === 'N' || side === 'S', a0 = horiz ? x0 : z0 + T, a1 = horiz ? x1 : z1 - T, mid = (a0 + a1) / 2;
      const fixed = side === 'N' ? z0 : side === 'S' ? z1 - T : side === 'W' ? x0 : x1 - T;
      for (let s = a0; s < a1 - 0.01; s += 1) {
        const e = Math.min(a1, s + 1), m = (s + e) / 2, hh = top * (0.6 + 0.4 * Math.abs(Math.sin(m * 1.7 + x0)));
        const B = (y0, y1) => { if (y1 - y0 < 0.05) return; if (horiz) w.solid('wall', s, y0, fixed, e, y1, fixed + T, { uv: 2.5 }); else w.solid('wall', fixed, y0, s, fixed + T, y1, e, { uv: 2.5 }); };
        if (doors[side] && Math.abs(m - mid) < 1.1) { if (hh > 3.2) B(3.0, hh); continue; }
        if (Math.abs(m - mid) > 1.6 && Math.round(m) % 3 === 0 && hh > h2 + 1.6) { B(0, h2 + 0.6); B(h2 + 1.8, hh); continue; } // upper window
        B(0, hh);
      }
      if (doors[side]) { if (horiz) w.visual('trim', mid - 1.4, 2.9, fixed - 0.05, mid + 1.4, 3.2, fixed + T + 0.05, { uv: 1 }); else w.visual('trim', fixed - 0.05, 2.9, mid - 1.4, fixed + T + 0.05, 3.2, mid + 1.4, { uv: 1 }); }
    };
    for (const s of ['N', 'S', 'W', 'E']) edge(s);
    // the upper floor: a slab along one long wall, a stair along its front edge up to it, a low parapet on the rest of that edge
    const dep = 3.4, L = LG.stairsLen(h2), sw = 1.8;
    const inner = alongX ? (x1 - x0) - 2 * T : (z1 - z0) - 2 * T, across = alongX ? (z1 - z0) - 2 * T : (x1 - x0) - 2 * T;
    if (inner < L + 1.5 || across < dep + sw + 1.6) return null; // (no room for the stair: it stays a plain ruin)
    let up;
    if (alongX) {
      const zs = z0 + T, ze = zs + dep;
      w.solid('wall', x0 + T, 0, zs, x1 - T, h2 - 0.2, ze, { uv: 2.5 }); w.solid('trim', x0 + T, h2 - 0.2, zs, x1 - T, h2, ze + 0.08, { uv: 1.5 }); // (solid to the ground: the gallery is a floor the foes can walk too)
      H.stairs(w, 'W', x1 - T, ze + sw / 2, sw, 0, h2, 'trim');
      w.solid('trim', x0 + T, h2, ze - 0.3, x1 - T - 1.4, h2 + 0.95, ze, { uv: 1 });
      up = { x0: x0 + T + 0.3, z0: zs + 0.3, x1: x1 - T - 0.3, z1: ze - 0.4, y: h2, cx: (x0 + x1) / 2, cz: (zs + ze) / 2 };
    } else {
      const xs = x0 + T, xe = xs + dep;
      w.solid('wall', xs, 0, z0 + T, xe, h2 - 0.2, z1 - T, { uv: 2.5 }); w.solid('trim', xs, h2 - 0.2, z0 + T, xe + 0.08, h2, z1 - T, { uv: 1.5 });
      H.stairs(w, 'S', z0 + T, xe + sw / 2, sw, 0, h2, 'trim');
      w.solid('trim', xe - 0.3, h2, z0 + T + 1.4, xe, h2 + 0.95, z1 - T, { uv: 1 });
      up = { x0: xs + 0.3, z0: z0 + T + 0.3, x1: xe - 0.4, z1: z1 - T - 0.3, y: h2, cx: (xs + xe) / 2, cz: (z0 + z1) / 2 };
    }
    if (rng.chance(0.5)) P().vines(w, x0, rng.range(2, top - 1), rng.range(z0 + 1, z1 - 1), 'nx', rng.range(2, 4), rng);
    return up;
  }
  // a broken column lying on its side (along x or z)
  function fallenColumn(w, rng, x, z, alongX) {
    const L = rng.range(3.5, 5.5), r = 0.45;
    if (alongX) { w.batch.geo('trim', PG().cyl8, Mx(x, r, z, r, L, r, 0, 0, Math.PI / 2)); w.addCollider(x - L / 2, 0, z - r, x + L / 2, r * 2, z + r, { surf: 'stone' }); }
    else { w.batch.geo('trim', PG().cyl8, Mx(x, r, z, r, L, r, Math.PI / 2, 0, 0)); w.addCollider(x - r, 0, z - L / 2, x + r, r * 2, z + L / 2, { surf: 'stone' }); }
    P().rubble(w, x + (alongX ? L / 2 + 0.6 : 0), 0, z + (alongX ? 0 : L / 2 + 0.6), rng, 0.8);
  }
  // a triumphal arch across a way along z (piers either side, a walkway on top that burns: see fireTops)
  function arch(w, rng, x, z, span) {
    const pw = 2.2, h = 8.5, d = 2.4;
    for (const sx of [-1, 1]) w.solid('block', x + sx * span / 2 + (sx < 0 ? -pw : 0), 0, z - d / 2, x + sx * span / 2 + (sx > 0 ? pw : 0), h, z + d / 2, { uv: 3 });
    w.solid('block', x - span / 2 - pw, h, z - d / 2, x + span / 2 + pw, h + 2.2, z + d / 2, { uv: 3 });
    w.solid('trim', x - span / 2 - pw - 0.2, h + 2.2, z - d / 2 - 0.2, x + span / 2 + pw + 0.2, h + 2.6, z + d / 2 + 0.2, { uv: 2 });
    w.visual('trim', x - span / 2, h - 0.6, z - d / 2 - 0.05, x + span / 2, h, z + d / 2 + 0.05, { uv: 1 });
    for (const sx of [-1, 1]) P().statue(w, x + sx * (span / 2 + pw / 2), z + d / 2 + 0.6, 0, 0, rng, 0.75);
  }

  // far beyond the city walls: the broken towers of the rest of the city against the sunset (visual only)
  function skyline(w, rng, W, D) {
    w.deferred.push((grp) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x3a2a2a, emissive: 0x1a0c08, roughness: 1, flatShading: true, fog: false });
      for (let i = 0; i < 34; i++) {
        const a = rng.range(0, Math.PI * 2), r = rng.range(Math.max(W, D) * 0.9, 150), h = rng.range(12, 46), s = rng.range(5, 12);
        const t = new THREE.Mesh(PG().box, m); t.scale.set(s, h, s * rng.range(0.6, 1.4)); t.position.set(W / 2 + Math.cos(a) * r, h / 2 - 2, D / 2 + Math.sin(a) * r); t.rotation.y = rng.range(0, 3); grp.add(t);
        if (rng.chance(0.4)) { const c = new THREE.Mesh(PG().cone, m); c.scale.set(s * 0.6, s, s * 0.6); c.position.set(t.position.x, h - 2 + s / 2, t.position.z); grp.add(c); }
      }
    });
  }

  // ---------------------------------------------------------------- the city's guardian approach: a colonnaded way to a great arch
  function roadDusk(w, rng, W, AD, D) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 5, side = 15;
    w.solid('floor', 0, -1, gz1, W, 0, D, { uv: 2 });
    w.visual('cobble', cx - hw, 0, gz1, cx + hw, 0.03, D, { uv: 2, grad: false });
    w.solid('block', 0, 0, gz1, cx - side, 6.5, D, { uv: 3 }); w.solid('block', cx + side, 0, gz1, W, 6.5, D, { uv: 3 });
    const nz = gz1 + (D - gz1) * 0.45;
    for (let z = gz1 + 6; z < D - 4; z += 5) for (const sx of [-1, 1]) {
      if (sx < 0 && Math.abs(z - nz) < 4) continue;
      P().pillarRound(w, cx + sx * (hw + 1.2), z, 0, rng.chance(0.2) ? rng.range(2, 4) : 7, 0.45, false, rng);
    }
    for (let z = gz1 + 8; z < D - 6; z += 15) for (const sx of [-1, 1]) { if (sx < 0 && Math.abs(z - nz) < 6) continue; w.solid('block', cx + sx * (side - 1.4) - 1, 0, z - 1, cx + sx * (side - 1.4) + 1, 1, z + 1, { uv: 1 }); P().statue(w, cx + sx * (side - 1.4), z, 1, sx < 0 ? Math.PI / 2 : -Math.PI / 2, rng, 0.9); }
    for (let z = gz1 + 12; z < D - 6; z += 18) for (const sx of [-1, 1]) P().brazier(w, cx + sx * (hw - 0.8), 0, z, 0.9, true);
    // the great arch over the gate
    const gate = 3.2;
    w.solid('block', 0, 0, gz0, cx - gate, 6.5, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, 6.5, gz1, { uv: 4 });
    for (const sx of [-1, 1]) w.solid('block', cx + sx * gate + (sx < 0 ? -2.4 : 0), 0, gz0 - 0.5, cx + sx * gate + (sx > 0 ? 2.4 : 0), 9.5, gz1 + 0.5, { uv: 3 });
    w.solid('block', cx - gate - 2.4, 6.4, gz0 - 0.5, cx + gate + 2.4, 9.5, gz1 + 0.5, { uv: 3 });
    w.solid('trim', cx - gate - 2.7, 9.5, gz0 - 0.8, cx + gate + 2.7, 10.0, gz1 + 0.8, { uv: 2, noGrapple: true });
    w.addCollider(cx - gate - 2.7, 10, gz0 - 0.8, cx + gate + 2.7, 13, gz1 + 0.8, { noGrapple: true });
    for (const sx of [-1, 1]) w.addLight(cx + sx * (gate + 1.2), 6, gz1 + 1.5, { flame: 0.3, intensity: 7, range: 11, color: '#ffa050', prio: 1.2 });
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => { const pc = H.portcullis(w, gate * 2 - 0.2, 6.2); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
    skyline(w, rng, W, D);
    return { nz, side: -1, nx: cx - hw - 2.4 };
  }
  // (the fallen city's area itself: field_dusk.js, the city on the great bridge; it builds with these pieces)
  F._dusk = { ruinBlock, fallenColumn, arch, skyline };
  F.SHELL.dusk = {
    outdoor: true, wallH: 4.5, road: roadDusk,
    ring(w, rng, W, AD, last) {
      // a broken balustrade with column stumps round the field (low: the sunset stays in view)
      const gaps = last ? [] : LG.gateXs(W, 3).map((g) => [g - 2.6, g + 2.6]);
      const bal = (x0, z0, x1, z1) => { w.solid('block', x0, 0, z0, x1, 1.2, z1, { uv: 1 }); w.visual('trim', x0 - 0.05, 1.2, z0 - 0.05, x1 + 0.05, 1.32, z1 + 0.05, { uv: 1 }); };
      let x = 0.2; for (const [a, b] of gaps) { if (a > x) bal(x, 0.2, a, 0.7); x = b; } if (x < W - 0.2) bal(x, 0.2, W - 0.2, 0.7);
      bal(0.2, 0.7, 0.7, AD); bal(W - 0.7, 0.7, W - 0.2, AD);
      for (let z = 8; z < AD - 4; z += 12) for (const px of [1.5, W - 1.5]) P().pillarRound(w, px, z, 0, rng.range(2.5, 6), 0.45, true, rng);
    },
    dress(w, rng, W, AD) {
      for (let i = 0; i < 3; i++) fallenColumn(w, rng, rng.chance(0.5) ? rng.range(5, 10) : rng.range(W - 10, W - 5), rng.range(8, AD - 12), rng.chance(0.5));
    },
    text: { sub: '— 都の奥へ —', icon: '🏛️', obj: '大通りを進め — 凱旋門をくぐると戦いが始まる' },
  };
})();
