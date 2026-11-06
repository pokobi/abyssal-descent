'use strict';
// The middle tier's new fields (runplan.js R.TIERS[2]): drawn instead of the storeyed halls for a segment.
//   flooded - 水没回廊: halls drowned by the groundwater. The floor lies under shallow water; raised stone walkways and bridges run above
//             it, pillars stand in it, water falls from grates high in the walls.
//   foundry - 溶鉱の深層 (below): the old foundries, rivers of molten iron, furnaces, iron catwalks, steam.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  // ---------------------------------------------------------------- 水没回廊
  // water falling from a grate high in a wall (a sheet of water, a pale haze where it lands, a glint of light)
  function waterfall(w, x, z, y, face, wd) {
    const alongX = face === 'pz' || face === 'nz', s = face === 'pz' || face === 'px' ? 1 : -1;
    const ox = alongX ? 0 : s * 0.35, oz = alongX ? s * 0.35 : 0;
    w.visual('iron', x - (alongX ? wd / 2 + 0.2 : 0.06) + ox, y - 0.2, z - (alongX ? 0.06 : wd / 2 + 0.2) + oz, x + (alongX ? wd / 2 + 0.2 : 0.06) + ox, y + 1.0, z + (alongX ? 0.06 : wd / 2 + 0.2) + oz, { uv: 1 });
    w.visual('water', x - (alongX ? wd / 2 : 0.08) + ox * 1.6, 0.05, z - (alongX ? 0.08 : wd / 2) + oz * 1.6, x + (alongX ? wd / 2 : 0.08) + ox * 1.6, y, z + (alongX ? 0.08 : wd / 2) + oz * 1.6, { uv: 2, grad: false });
    w.deferred.push((grp) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xc8e0e0, transparent: true, opacity: 0.35, depthWrite: false }));
      sp.scale.set(wd + 2.4, 1.6, 1); sp.position.set(x + ox * 3, 0.7, z + oz * 3); grp.add(sp);
    });
    (w.waterfalls = w.waterfalls || []).push({ bx: x + ox * 1.6, bz: z + oz * 1.6, wd, ax: alongX ? 1 : 0, az: alongX ? 0 : 1, nx: alongX ? 0 : s, nz: alongX ? s : 0 }); // (where it lands: water.js)
    w.addLight(x + ox * 4, 1.2, z + oz * 4, { flame: 0, intensity: 3, range: 7, color: '#9fd8d0', emit: false, prio: 0.5, steady: true });
  }
  // a raised stone walkway (solid to the ground, a curb along its edges): ax = along x
  function walkway(w, x0, z0, x1, z1, h) {
    w.solid('wall', x0, 0, z0, x1, h - 0.15, z1, { uv: 2.5 });
    w.solid('trim', x0 - 0.06, h - 0.15, z0 - 0.06, x1 + 0.06, h, z1 + 0.06, { uv: 1.5 });
    w.visual('moss', x0 - 0.08, 0, z0 - 0.08, x1 + 0.08, 0.35, z1 + 0.08, { uv: 2, grad: false });
  }
  function genFlooded(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = FB.base(area, seed, 'flooded');
    FB.reserve(occ, W, D, gates);
    const HT = 14;
    H.floors(w, W, D, null, 'cobble');
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0 });
    F.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: rng.int(0, 2) });
    const layout = rng.pick(['cistern', 'canal', 'sluice']);
    w.layout = layout;
    const cx = W / 2, h = 1.1;
    // the water over the whole floor between the entrance landing and the gate landing
    const wz0 = 16, wz1 = D - 11;
    w.visual('water', 0, 0.0, wz0, W, 0.06, wz1, { uv: 4, grad: false, skip: { bottom: true } });
    w.waterZones.push({ x0: 0, z0: wz0, x1: W, z1: wz1 });
    // the walkways: a spine from the entrance landing to the gate landing, cross walks, landings with stairs down into the water
    const walks = [], stairsAt = [];
    const addWalk = (x0, z0, x1, z1) => { walks.push({ x0, z0, x1, z1 }); walkway(w, x0, z0, x1, z1, h); occ.mark(x0 - 0.8, z0 - 0.8, x1 + 0.8, z1 + 0.8); };
    const L = LG.stairsLen(h);
    if (layout === 'canal') {
      // two long walks either side of a canal down the middle; bridges across it
      for (const sx of [-1, 1]) addWalk(cx + sx * 4.5 - (sx < 0 ? 3 : 0), wz0 + L, cx + sx * 4.5 + (sx > 0 ? 3 : 0), wz1 - L);
      for (let z = wz0 + 10; z < wz1 - 8; z += rng.int(11, 15)) { w.solid('trim', cx - 4.5, h - 0.3, z - 1.2, cx + 4.5, h, z + 1.2, { uv: 1.5 }); for (const sx of [-1, 1]) w.solid('trim', cx - 4.5, h, z + sx * 1.2 - (sx > 0 ? 0.25 : 0), cx + 4.5, h + 0.9, z + sx * 1.2 + (sx < 0 ? 0.25 : 0), { uv: 1 }); }
      for (const sx of [-1, 1]) { stairsAt.push([cx + sx * 6, wz0 + L, 'N']); stairsAt.push([cx + sx * 6, wz1 - L, 'S']); }
      for (let i = 0; i < 2; i++) { const z = rng.range(wz0 + 12, wz1 - 12), sx = rng.chance(0.5) ? -1 : 1; addWalk(sx < 0 ? 4 : cx + 7.5, z - 1.4, sx < 0 ? cx - 7.5 : W - 4, z + 1.4); stairsAt.push([sx < 0 ? 4 : W - 4, z, sx < 0 ? 'W' : 'E']); }
    } else {
      addWalk(cx - 1.6, wz0 + L, cx + 1.6, wz1 - L);
      stairsAt.push([cx, wz0 + L, 'N'], [cx, wz1 - L, 'S']);
      const nCross = layout === 'cistern' ? 2 : 3;
      for (let i = 0; i < nCross; i++) {
        const z = Math.round(wz0 + (wz1 - wz0) * (i + 1) / (nCross + 1));
        const xa = rng.range(5, 12), xb = rng.range(5, 12);
        addWalk(xa, z - 1.4, W - xb, z + 1.4);
        stairsAt.push([xa, z, 'W'], [W - xb, z, 'E']);
        // a landing on the walk with a brazier
        const lx = rng.chance(0.5) ? rng.range(xa + 4, cx - 6) : rng.range(cx + 6, W - xb - 4);
        if (layout === 'sluice') { w.solid('wall', lx - 3, 0, z - 3.5, lx + 3, h - 0.15, z + 3.5, { uv: 2.5 }); w.solid('trim', lx - 3.06, h - 0.15, z - 3.56, lx + 3.06, h, z + 3.56, { uv: 1.5 }); P().brazier(w, lx, h, z + 2.4, 0.9); occ.mark(lx - 3.8, z - 4.3, lx + 3.8, z + 4.3); }
      }
    }
    for (const [x, z, side] of stairsAt) {
      if (side === 'N' || side === 'S') { H.stairs(w, side, z, x, 2.4, 0, h, 'trim'); occ.mark(x - 1.6, side === 'N' ? z - L - 0.5 : z, x + 1.6, side === 'N' ? z : z + L + 0.5); }
      else { H.stairs(w, side, x, z, 2.4, 0, h, 'trim'); occ.mark(side === 'W' ? x - L - 0.5 : x, z - 1.6, side === 'W' ? x : x + L + 0.5, z + 1.6); }
    }
    // the sluice gates (水門の車輪, gimmick_b.js): one or two in the side walls, each with its wheel on the walkway nearest its mouth.
    // The surge runs straight across the hall (8 m wide): its lane stays clear of the crossings (and their landings) and of the pillars
    const sluices = [];
    if (G.Gim) {
      const crossZ = walks.filter((k) => (k.x1 - k.x0) > (k.z1 - k.z0)).map((k) => (k.z0 + k.z1) / 2).sort((a, b) => a - b);
      const want = 1 + (rng.chance(0.5) ? 1 : 0), ends = [wz0, ...crossZ, wz1], cands = [];
      for (let k = 0; k + 1 < ends.length; k++) cands.push([rng.next(), (ends[k] + ends[k + 1]) / 2]); // (the middles between the crossings first, in a random order)
      cands.sort((a, b) => a[0] - b[0]);
      for (let t = 0; t < 12; t++) cands.push([1, rng.range(wz0 + 5, wz1 - 5)]);
      for (const [, z] of cands) {
        if (sluices.length >= want) break;
        const sgn = rng.chance(0.5) ? 1 : -1, wx = sgn > 0 ? 0 : W;
        const hw = Math.min(4, z - wz0 - 0.8, wz1 - z - 0.8, ...crossZ.map((cz) => Math.abs(cz - z) - 1.7));
        if (hw < 3.3 || sluices.some((q) => Math.abs(q.z - z) < 12)) continue;
        let best = null;
        for (const k of walks) { const px = U.clamp(wx, k.x0 + 0.55, k.x1 - 0.55), pz = U.clamp(z, k.z0 + 0.55, k.z1 - 0.55), d = Math.hypot(px - wx, pz - z); if (!best || d < best.d) best = { d, px, pz }; }
        if (!best || best.d > 28) continue;
        sluices.push({ sgn, z });
        occ.mark(1, z - hw - 0.6, W - 1, z + hw + 0.6);
        G.Gim.addSluice(w, sgn, wx, z, W - 1.2, best.px, h, best.pz, hw);
      }
    }
    // braziers along the walkways (they hold no one up: no collider), lanterns on chains over the crossings
    for (const k of walks) { const ax = (k.x1 - k.x0) > (k.z1 - k.z0); for (let u = (ax ? k.x0 : k.z0) + 5; u < (ax ? k.x1 : k.z1) - 4; u += 13) P().brazier(w, ax ? u : (k.x0 + k.x1) / 2, h, ax ? (k.z0 + k.z1) / 2 : u, 0.7); }
    w.platTops.push(...walks.map((k) => ({ x0: k.x0 + 0.3, z0: k.z0 + 0.3, x1: k.x1 - 0.3, z1: k.z1 - 0.3, y: h, cx: (k.x0 + k.x1) / 2, cz: (k.z0 + k.z1) / 2 })));
    // pillars standing in the water up to the vault, half drowned statues, moss and hanging weed
    const nPil = layout === 'cistern' ? 16 : 8;
    for (let i = 0; i < nPil; i++) { const r = occ.place(rng, 3, 3, 2.5, 20); if (!r) continue; const x = r.x0 + 1.5, z = r.z0 + 1.5; P().pillarSquare(w, x, z, 0, HT, 1.3); w.visual('moss', x - 1.4, 0, z - 1.4, x + 1.4, 0.8, z + 1.4, { uv: 1, grad: false }); if (rng.chance(0.4)) P().vines(w, x - 1.3, rng.range(5, 10), z, 'nx', rng.range(3, 6), rng); }
    for (let i = 0; i < 3; i++) { const r = occ.place(rng, 3, 3, 1.5, 16); if (r) P().statue(w, r.x0 + 1.5, r.z0 + 1.5, -0.6, rng.range(0, 6), rng, rng.range(0.9, 1.2)); }
    // water falling from the walls
    for (let i = 0; i < 4; i++) {
      const side = rng.pick(['W', 'E', 'S']); const y = rng.range(7, 10), wd = rng.range(1.4, 2.6);
      if (side === 'S') { const x = rng.range(6, W - 6); if (Math.abs(x - cx) < 8) continue; waterfall(w, x, D - 0.02, y, 'nz', wd); }
      else { const z = rng.range(wz0 + 4, wz1 - 4); if (sluices.some((q) => (q.sgn > 0) === (side === 'W') && Math.abs(q.z - z) < 5.5)) continue; waterfall(w, side === 'W' ? 0.02 : W - 0.02, z, y, side === 'W' ? 'px' : 'nx', wd); } // (not over a sluice gate)
    }
    for (let z = 10; z < D - 6; z += 9) { if (rng.chance(0.5)) P().vines(w, 0, rng.range(6, 11), z, 'px', rng.range(3, 6), rng); if (rng.chance(0.5)) P().vines(w, W, rng.range(6, 11), z + 4, 'nx', rng.range(3, 6), rng); }
    // floating debris, half-sunk crates and barrels, rubble islands
    for (let i = 0; i < 6; i++) { const r = occ.place(rng, 2, 2, 1, 12); if (!r) continue; if (rng.chance(0.5)) P().barrel(w, r.x0 + 1, r.z0 + 1, -0.3, rng); else P().crate(w, r.x0 + 1, r.z0 + 1, -0.25, rng); }
    for (let i = 0; i < 4; i++) { const r = occ.place(rng, 3, 3, 1, 12); if (r) P().rubble(w, r.x0 + 1.5, 0, r.z0 + 1.5, rng, rng.range(1, 1.6)); }
    // the landings: torches on the pillars of the arches over them
    for (let x = 8; x < W - 6; x += 10) if (Math.abs(x - cx) > 6) { P().pillarSquare(w, x, 13.5, 0, HT, 1.0); P().torch(w, x, 3.4, 14.1, 'pz'); occ.mark(x - 1.2, 12.5, x + 1.2, 14.5); }
    // the water's slow flow (the surface's ripples drift toward the north gates)
    w.animated.push({ kind: 'uvflow', mat: w.mats.water, sp: [0, -0.05] });
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.flooded = genFlooded;
  F.SHELL.flooded = {
    outdoor: false,
    road(w, rng, W, AD, D) {
      const nook = FB.roadHall(w, rng, W, AD, D, false), cx = W / 2;
      // the hall road is half under water: water over its floor, moss on its piers, a fall of water at the far end
      w.visual('water', cx - 6.5, 0.0, AD + 3, cx + 6.5, 0.06, D - 2, { uv: 4, grad: false, skip: { bottom: true } });
      w.waterZones.push({ x0: cx - 6.5, z0: AD + 3, x1: cx + 6.5, z1: D - 2 });
      waterfall(w, cx + 5, D - 0.02, 9, 'nz', 2);
      return nook;
    },
    ring(w, rng, W, AD) { F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 2 }); },
    dress(w, rng, W, AD) {
      for (let i = 0; i < 4; i++) waterfall(w, rng.chance(0.5) ? 0.02 : W - 0.02, rng.range(10, AD - 10), rng.range(9, 13), rng.chance(0.5) ? 'px' : 'nx', rng.range(1.6, 2.6));
      for (let z = 8; z < AD - 4; z += 10) { P().vines(w, 0, rng.range(10, 16), z, 'px', rng.range(4, 7), rng); P().vines(w, W, rng.range(10, 16), z + 5, 'nx', rng.range(4, 7), rng); }
      w.animated.push({ kind: 'uvflow', mat: w.mats.water, sp: [0, -0.05] });
    },
    text: { sub: '— 水路の奥へ —', icon: '🌊', obj: '水に沈んだ回廊を進め — 石の扉をくぐると戦いが始まる' },
  };

  // ---------------------------------------------------------------- 溶鉱の深層
  // a furnace: a brick mass with a glowing mouth, a chimney up to the vault, its light and its roar
  function furnace(w, rng, x, z, face, HT) {
    const s = 2.6, h = 6;
    w.solid('wall', x - s, 0, z - s, x + s, h, z + s, { uv: 2.5 });
    w.solid('trim', x - s - 0.2, h, z - s - 0.2, x + s + 0.2, h + 0.4, z + s + 0.2, { uv: 1.5 });
    w.solid('block', x - 1.2, h + 0.4, z - 1.2, x + 1.2, HT, z + 1.2, { uv: 2, noGrapple: true });
    const d = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] }[face];
    const mx = x + d[0] * (s + 0.02), mz = z + d[1] * (s + 0.02), across = d[0] ? 'z' : 'x';
    w.visual('lava', across === 'x' ? mx - 1.1 : mx - 0.02, 0.6, across === 'z' ? mz - 1.1 : mz - 0.02, across === 'x' ? mx + 1.1 : mx + 0.02, 2.3, across === 'z' ? mz + 1.1 : mz + 0.02, { uv: 1, grad: false });
    w.visual('iron', across === 'x' ? mx - 1.3 : mx - 0.06, 2.3, across === 'z' ? mz - 1.3 : mz - 0.06, across === 'x' ? mx + 1.3 : mx + 0.06, 2.5, across === 'z' ? mz + 1.3 : mz + 0.06, { uv: 1 });
    w.addLight(x + d[0] * (s + 1.4), 1.6, z + d[1] * (s + 1.4), { flame: 0.5, intensity: 10, range: 12, color: '#ff6a20', prio: 1.1 });
    w.lavaZones.push({ x0: mx - 0.5, z0: mz - 0.5, x1: mx + 0.5, z1: mz + 0.5, y: 1, decor: true });
  }
  // an anvil and its block
  function anvil(w, x, z) {
    w.solid('woodDark', x - 0.45, 0, z - 0.45, x + 0.45, 0.6, z + 0.45, { uv: 1 });
    w.solid('iron', x - 0.6, 0.6, z - 0.22, x + 0.6, 0.95, z + 0.22, { uv: 1 });
    w.batch.geo('iron', PG().cone, Mx(x + 0.85, 0.82, z, 0.2, 0.6, 0.2, 0, 0, Math.PI / 2));
  }
  // a crucible hanging on chains over the floor (visual; a little glow)
  function crucible(w, x, y, z, top) {
    w.batch.geo('iron', PG().bowl, Mx(x, y, z, 1.4, 2.2, 1.4));
    w.visual('lava', x - 0.6, y + 0.66, z - 0.6, x + 0.6, y + 0.72, z + 0.6, { uv: 1, grad: false });
    P().chain(w, x - 0.8, top - 0.2, z, top - y - 0.4); P().chain(w, x + 0.8, top - 0.2, z, top - y - 0.4);
    w.addLight(x, y + 1.4, z, { flame: 0, intensity: 4, range: 8, color: '#ff7a30', emit: false, prio: 0.6 });
  }
  function genFoundry(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = FB.base(area, seed, 'foundry');
    FB.reserve(occ, W, D, gates);
    const HT = 15;
    // the river of molten iron across the middle (a chasm: falling in burns you back to the edge), iron bridges over it
    const pit = F.chasmMask(rng, W, D, occ);
    H.floors(w, W, D, pit, rng.chance(0.5) ? 'floor' : 'cobble');
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0 });
    F.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: 0, beamStep: 6 });
    {
      const { z0, z1 } = pit.band;
      w._bridges = pit.bridges; w._pit = pit.band; w.abyss = { z0, z1 };
      w.visual('lava', 3, -3.6, z0, W - 3, -3.4, z1, { uv: 4, grad: false });
      for (let x = 8; x < W - 6; x += 10) w.addLight(x, -1.2, (z0 + z1) / 2, { flame: 0, intensity: 18, range: 16, color: '#ff5a10', emit: false, prio: 0.9 });
      w.lavaZones.push({ x0: 3, z0, x1: W - 3, z1, y: -3.4, decor: true });
      for (const [a, b] of pit.bridges) {
        w.solid('iron', a, -0.3, z0 - 0.01, b, 0, z1 + 0.01, { uv: 2, tag: 'bridge' });
        for (const xx of [a, b - 0.12]) w.solid('iron', xx, 0, z0, xx + 0.12, 1.0, z1, { uv: 1 });
        w.solid('iron', a + 0.3, -3.4, (z0 + z1) / 2 - 0.3, b - 0.3, -0.3, (z0 + z1) / 2 + 0.3, { uv: 2 });
      }
      w.solid('iron', 3, 0, z0 - 0.3, W - 3, 0.3, z0, { uv: 1, tag: 'lip' }); w.solid('iron', 3, 0, z1, W - 3, 0.3, z1 + 0.3, { uv: 1, tag: 'lip' });
    }
    const layout = rng.pick(['forges', 'catwalks', 'pour']);
    w.layout = layout;
    // furnaces along the walls, their mouths toward the floor
    const nF = layout === 'forges' ? 5 : 3;
    for (let i = 0; i < nF; i++) {
      const side = rng.pick(['W', 'E']), r = occ.place(rng, 7, 7, 1.5, 30); if (!r) continue;
      const x = side === 'W' ? Math.min(r.x0 + 3.5, 6) : Math.max(r.x0 + 3.5, W - 6), z = r.z0 + 3.5;
      if (!occ.free(x - 3.5, z - 3.5, x + 3.5, z + 3.5) && Math.abs(x - (r.x0 + 3.5)) > 0.1) continue;
      furnace(w, rng, x, z, side === 'W' ? 'px' : 'nx', HT); occ.mark(x - 3.5, z - 3.5, x + 3.5, z + 3.5);
      anvil(w, x + (side === 'W' ? 5 : -5), z + 1.5); occ.mark(x + (side === 'W' ? 5 : -5) - 1.2, z + 0.7, x + (side === 'W' ? 5 : -5) + 1.3, z + 2.3); // (nothing else on top of it)
    }
    // iron catwalks along the side walls (stairs up at each end)
    if (layout === 'catwalks' || rng.chance(0.5)) for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : W - 3.2, x1 = side < 0 ? 3.2 : W, h = 3.5, Lc = LG.stairsLen(h);
      for (const [za, zb] of [[16, pit.band.z0 - 3], [pit.band.z1 + 3, D - 12]]) {
        if (zb - za < Lc * 2 + 6 || !occ.free(side < 0 ? 2.1 : x0 - 0.6, za, side < 0 ? x1 + 0.6 : W - 2.1, zb)) continue; // (the outer 2 m are the occ border: look just inside it)
        w.solid('iron', x0, h - 0.2, za + Lc, x1, h, zb - Lc, { uv: 2 });
        for (let z = za + Lc + 1; z < zb - Lc; z += 3.5) w.solid('iron', (side < 0 ? x1 : x0) - 0.15 * side - 0.1, 0, z - 0.1, (side < 0 ? x1 : x0) - 0.15 * side + 0.1, h - 0.2, z + 0.1, { uv: 1 });
        const sx = side < 0 ? x0 + 1.2 : x1 - 1.2;
        H.stairs(w, 'N', za + Lc, sx, 2.0, 0, h, 'iron'); H.stairs(w, 'S', zb - Lc, sx, 2.0, 0, h, 'iron');
        const ex = side < 0 ? x1 - 0.08 : x0;
        w.solid('iron', ex, h, za + Lc + 0.2, ex + 0.08, h + 1.0, zb - Lc - 0.2, { uv: 1 });
        w.platTops.push({ x0: x0 + 0.3, z0: za + Lc + 0.3, x1: x1 - 0.3, z1: zb - Lc - 0.3, y: h, cx: (x0 + x1) / 2, cz: (za + zb) / 2 });
        occ.mark(x0 - 1, za, x1 + 1, zb);
      }
    }
    // the pouring floor: molds in rows, ingots stacked, crucibles hanging overhead
    const nMold = layout === 'pour' ? 4 : 2;
    for (let i = 0; i < nMold; i++) {
      const r = occ.place(rng, 6, 3, 1.2, 20); if (!r) continue;
      w.solid('iron', r.x0, 0, r.z0, r.x1, 0.45, r.z1, { uv: 1 });
      for (let x = r.x0 + 0.5; x < r.x1 - 0.6; x += 1.4) w.visual(rng.chance(0.5) ? 'lava' : 'dark', x, 0.45, r.z0 + 0.4, x + 1.0, 0.47, r.z1 - 0.4, { uv: 1, grad: false });
    }
    for (let i = 0; i < 4; i++) { const r = occ.place(rng, 2, 2, 1, 14); if (!r) continue; for (let k = 0; k < rng.int(3, 6); k++) w.solid(rng.chance(0.3) ? 'gold' : 'iron', r.x0 + 0.2, k * 0.22, r.z0 + 0.3 + (k % 2) * 0.4, r.x0 + 1.6, k * 0.22 + 0.2, r.z0 + 0.7 + (k % 2) * 0.4, { uv: 1 }); }
    // the crucibles: the first two that hang over open floor are live (吊りるつぼ, gimmick_b.js: shoot one and it pours where its lip ends up)
    for (let i = 0, live = 0; i < (layout === 'pour' ? 4 : 2); i++) {
      let x = rng.range(10, W - 10), y = rng.range(5, 8), z = rng.chance(0.5) ? rng.range(18, pit.band.z0 - 4) : rng.range(pit.band.z1 + 4, D - 14);
      if (G.Gim && live < 2) {
        const fit = (cx, cz) => occ.free(cx + 0.7 - 3.6, cz - 3.6, cx + 0.7 + 3.6, cz + 3.6) && occ.free(cx - 1.6, cz - 1.6, cx + 1.6, cz + 1.6);
        for (let t = 0; t < 24 && !fit(x, z); t++) { x = rng.range(10, W - 10); z = rng.chance(0.5) ? rng.range(18, pit.band.z0 - 5) : rng.range(pit.band.z1 + 5, D - 14); }
        if (fit(x, z)) { occ.mark(x + 0.7 - 3.6, z - 3.6, x + 0.7 + 3.6, z + 3.6); G.Gim.addCrucible(w, x, y, z, HT); live++; continue; }
      }
      crucible(w, x, y, z, HT);
    }
    // steam vents in the floor, coal heaps, barrels, chains from the vault
    for (let i = 0; i < 2; i++) { const r = occ.place(rng, 3, 3, 2, 14); if (r && G.Fields) G.Fields.add(w, 'vent', r.x0 + 0.6, r.z0 + 0.6, r.x1 - 0.6, r.z1 - 0.6); }
    for (let i = 0; i < 3; i++) { const r = occ.place(rng, 3, 3, 1, 12); if (r) { w.batch.geo('rock', PG().cone, Mx(r.x0 + 1.5, 0.55, r.z0 + 1.5, 1.4, 1.1, 1.4), { tint: [0.25, 0.22, 0.2] }); w.addCollider(r.x0 + 0.5, 0, r.z0 + 0.5, r.x1 - 0.5, 0.9, r.z1 - 0.5, { surf: 'stone' }); } }
    for (let i = 0; i < 5; i++) { const r = occ.place(rng, 2, 2, 0.8, 10); if (r) P().barrel(w, r.x0 + 1, r.z0 + 1, 0, rng, rng.chance(0.35)); }
    for (let i = 0; i < 6; i++) P().chain(w, rng.range(6, W - 6), HT - 0.5, rng.range(14, D - 10), rng.range(4, 8));
    // pipes along the walls
    for (const side of [-1, 1]) { const x = side < 0 ? 0.35 : W - 0.35; w.batch.geo('iron', PG().cyl8, Mx(x, 9.5, D / 2, 0.3, D - 8, 0.3, Math.PI / 2, 0, 0)); w.batch.geo('iron', PG().cyl8, Mx(x, 11, D / 2, 0.22, D - 8, 0.22, Math.PI / 2, 0, 0)); }
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.foundry = genFoundry;
  F.SHELL.foundry = {
    outdoor: false,
    road(w, rng, W, AD, D) {
      const nook = FB.roadHall(w, rng, W, AD, D, false), cx = W / 2;
      // a channel of molten iron runs along the road (behind a lip), lighting it from below
      for (const sx of [-1, 1]) {
        const x = cx + sx * 5.6;
        w.solid('iron', x - 0.6, 0, AD + 6, x + 0.6, 0.35, D - 4, { uv: 1 });
        w.visual('lava', x - 0.45, 0.35, AD + 6, x + 0.45, 0.37, D - 4, { uv: 2, grad: false });
      }
      for (let z = AD + 10; z < D - 6; z += 14) w.addLight(cx, 1, z, { flame: 0, intensity: 8, range: 12, color: '#ff6a20', emit: false, prio: 0.8 });
      return nook;
    },
    ring(w, rng, W, AD) { F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 0 }); },
    dress(w, rng, W, AD) {
      for (const [x, z, f] of [[3.2, AD * 0.3, 'px'], [W - 3.2, AD * 0.55, 'nx']]) furnace(w, rng, x, z, f, 24);
      for (let i = 0; i < 3; i++) crucible(w, rng.range(12, W - 12), rng.range(9, 13), rng.range(10, AD - 10), 24);
    },
    text: { sub: '— 炉の奥へ —', icon: '🔥', obj: '溶鉄の流れる回廊を進め — 石の扉をくぐると戦いが始まる' },
  };
})();
