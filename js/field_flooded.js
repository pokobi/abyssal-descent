'use strict';
// 水没回廊 (flooded, the middle tier), on a framework of its own: a town drowned in a cavern. Only its walls and roofs stand out of the
// water, and they are the ways: the tops of its walls (wide enough to fight on), the flat roofs, the arches and planks across its
// streets. Between them the water is deep: you can go down into it, but chest-deep you wade slowly and can hardly jump (fields.js
// w.deepWater), while the foes of the water move as they like. Stairs climb out of it here and there. The sluice gates in the side
// walls (gimmick_b.js) send their surge across the town; water falls from grates high in the cavern's walls.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props;
  const FL = () => F._flooded;
  const BED = -1.6, TOP = 0.5, HT = 16;

  function genFlooded(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const BS = 11, ST = 6, PITCH = BS + ST;              // a block of the town and the street after it
    const nC = 5, nR = 5 + rng.int(0, 1), ox = 4, oz = 18;
    const W = Math.ceil(ox * 2 + nC * PITCH - ST), D = Math.ceil(oz + nR * PITCH - ST + 14);
    const w = new G.World(W, D, 'flooded');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'flooded', ['town', 'canals', 'roofs']);
    w.layout = layout;
    const wz0 = oz - 4, wz1 = D - 10;
    // ---- the landings at both ends, the bed of the drowned town, the water over it
    w.solid('floor', 0, -1, 0, W, 0, wz0, { uv: 4 }); w.solid('floor', 0, -1, wz1, W, 0, D, { uv: 4 });
    w.solid('cobble', 0, BED - 1, wz0, W, BED, wz1, { uv: 3 });
    w.visual('water', 0, -0.02, wz0, W, 0.02, wz1, { uv: 4, grad: false, skip: { bottom: true } });
    w.waterZones.push({ x0: 0, z0: wz0, x1: W, z1: wz1, y: 0, deep: -BED });
    w.deepWater = [{ x0: 0, z0: wz0, x1: W, z1: wz1, y: 0 }];
    w.solid('trim', 0, -0.3, wz0 - 0.4, W, 0.12, wz0, { uv: 1 }); w.solid('trim', 0, -0.3, wz1, W, 0.12, wz1 + 0.4, { uv: 1 });
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT + 2, beams: 0 });
    w.solid('rock', -3, HT, -3, W + 3, HT + 2, D + 3, { uv: 6, noGrapple: true, grad: false });
    // ---- the blocks: walls round each (their tops the ways), some filled to a flat roof, the water inside the others
    const blk = [];
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
      const x0 = ox + c * PITCH, z0 = oz + r * PITCH;
      const roof = layout === 'roofs' ? rng.chance(0.55) : layout === 'canals' ? rng.chance(0.15) : rng.chance(0.3);
      blk.push({ c, r, x0, z0, x1: x0 + BS, z1: z0 + BS, roof, y: roof ? TOP + (rng.chance(0.5) ? 0.5 : 0) : TOP });
    }
    const B = (c, r) => (c < 0 || r < 0 || c >= nC || r >= nR ? null : blk[r * nC + c]);
    const WT = 1.9;
    for (const b of blk) {
      if (b.roof) {
        w.solid('wall', b.x0, BED, b.z0, b.x1, b.y - 0.3, b.z1, { uv: 3 });
        w.solid('floor', b.x0 - 0.05, b.y - 0.3, b.z0 - 0.05, b.x1 + 0.05, b.y, b.z1 + 0.05, { uv: 3 });
        w.platTops.push({ x0: b.x0 + 1, z0: b.z0 + 1, x1: b.x1 - 1, z1: b.z1 - 1, y: b.y, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 });
        // a chimney stack, a fallen bell cote, a few things left up there
        if (rng.chance(0.5)) w.solid('wall', b.x0 + 1.5, b.y, b.z0 + 1.5, b.x0 + 3, b.y + 2.4, b.z0 + 3, { uv: 2 });
        if (rng.chance(0.5)) P().barrel(w, b.x1 - 1.5, b.z1 - 1.5, b.y, rng);
        continue;
      }
      // the walls: four tops round the flooded inside, a breach in one of them now and then
      const breach = rng.chance(0.35) ? rng.pick(['N', 'S', 'W', 'E']) : null;
      const seg = (x0, z0, x1, z1, side) => {
        if (side === breach) {
          const along = side === 'N' || side === 'S', a0 = along ? x0 : z0, a1 = along ? x1 : z1, m = rng.range(a0 + 3, a1 - 3);
          if (along) { wall(x0, z0, m - 1.2, z1); wall(m + 1.2, z0, x1, z1); }
          else { wall(x0, z0, x1, m - 1.2); wall(x0, m + 1.2, x1, z1); }
          return;
        }
        wall(x0, z0, x1, z1);
      };
      // a wall's top, and the moss at the waterline round it (on the wall only: inside it is open water, not a floor of moss)
      const wall = (x0, z0, x1, z1) => { w.solid('wall', x0, BED, z0, x1, TOP, z1, { uv: 2.5 }); w.visual('moss', x0 - 0.05, -0.2, z0 - 0.05, x1 + 0.05, 0.25, z1 + 0.05, { uv: 2, grad: false, skip: { top: true, bottom: true } }); };
      seg(b.x0, b.z0, b.x1, b.z0 + WT, 'N'); seg(b.x0, b.z1 - WT, b.x1, b.z1, 'S');
      seg(b.x0, b.z0 + WT, b.x0 + WT, b.z1 - WT, 'W'); seg(b.x1 - WT, b.z0 + WT, b.x1, b.z1 - WT, 'E');
      // the steps down into the flooded inside (and up out of it)
      H.stairs(w, 'N', b.z1 - WT, b.x0 + WT + 1.2, 1.6, BED, TOP, 'trim');
      // a drowned room's leavings: a statue up to its chest, a pillar to the vault
      if (rng.chance(0.4)) P().statue(w, (b.x0 + b.x1) / 2 + 1, (b.z0 + b.z1) / 2, BED, rng.range(0, 6), rng, 1.2);
      else if (rng.chance(0.5)) P().pillarSquare(w, (b.x0 + b.x1) / 2 + 1.5, (b.z0 + b.z1) / 2, BED, HT - BED, 1.1);
    }
    // ---- the crossings: a tree over the blocks (every block reached dry), more where the layout wants them; the landings joined
    const links = new Set(), lk = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    { const seen = new Set([0]), st = [0]; while (st.length) { const i = st[st.length - 1], c = i % nC, r = (i / nC) | 0; const nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => B(a, b) && !seen.has(b * nC + a)); if (!nb.length) { st.pop(); continue; } const [a, b2] = rng.pick(nb); const j = b2 * nC + a; seen.add(j); links.add(lk(i, j)); st.push(j); } }
    const extra = layout === 'canals' ? 0.15 : 0.35;
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) { if (B(c + 1, r) && rng.chance(extra)) links.add(lk(r * nC + c, r * nC + c + 1)); if (B(c, r + 1) && rng.chance(extra)) links.add(lk(r * nC + c, (r + 1) * nC + c)); }
    const cross = (x0, z0, x1, z1, y, arch) => {
      if (arch) w.solid('block', x0, y - 0.5, z0, x1, y, z1, { uv: 2, tag: 'bridge' }); // (open water under it: nothing on the bed to snag what the current carries)
      else w.solid('wood', x0, y - 0.18, z0, x1, y, z1, { uv: 1, tag: 'bridge' });
    };
    for (const key of links) {
      const [i, j] = key.split(':').map(Number), a = blk[i], b = blk[j], y = Math.min(a.y, b.y), arch = rng.chance(0.5), wd = arch ? 2.6 : 1.4;
      if (a.r === b.r) { const z = rng.range(a.z0 + 2.5, a.z1 - 2.5), [l, rr] = a.c < b.c ? [a, b] : [b, a]; cross(l.x1 - 0.3, z - wd / 2, rr.x0 + 0.3, z + wd / 2, y, arch); }
      else { const x = rng.range(a.x0 + 2.5, a.x1 - 2.5), [t, bt] = a.r < b.r ? [a, b] : [b, a]; cross(x - wd / 2, t.z1 - 0.3, x + wd / 2, bt.z0 + 0.3, y, arch); }
    }
    // (a step down from a raised roof onto the walls of the next block is half a metre: fine to walk)
    // the landings to the town: a causeway from each landing to the nearest block of the row next to it; stairs down at the landings
    for (const [r, z0, z1] of [[0, wz0, oz], [nR - 1, oz + (nR - 1) * PITCH + BS, wz1]]) {
      const cs = U.shuffle([...Array(nC).keys()], () => rng.next()).slice(0, 2 + rng.int(0, 1));
      for (const c of cs) { const b = B(c, r), x = rng.range(b.x0 + 2.5, b.x1 - 2.5); w.solid('block', x - 1.4, BED, Math.min(z0, z1), x + 1.4, Math.min(b.y, TOP), Math.max(z0, z1), { uv: 2.5, tag: 'bridge' }); }
      const sx = rng.range(8, W - 8);
      if (r === 0) H.stairs(w, 'S', wz0, sx, 2.2, BED, 0, 'trim'); else H.stairs(w, 'N', wz1, sx, 2.2, BED, 0, 'trim');
    }
    // stairs out of the streets onto the walls (one in every few streets)
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC - 1; c++) if (rng.chance(0.35)) { const b = B(c, r); if (b.roof) continue; H.stairs(w, 'E', b.x1, b.z0 + BS / 2, 1.4, BED, TOP, 'trim'); } // (across the east-west streets only: the north-south ones carry the sluices' surges)
    // ---- the sluice gates (水門の車輪, gimmick_b.js) in the side walls: the surge runs down a street across the town
    if (G.Gim) {
      const want = 1 + (rng.chance(0.5) ? 1 : 0); let n = 0;
      for (const r of U.shuffle([...Array(nR - 1).keys()], () => rng.next())) {
        if (n >= want) break;
        const z = oz + r * PITCH + BS + ST / 2, sgn = rng.chance(0.5) ? 1 : -1, wx = sgn > 0 ? 0 : W;
        const b = sgn > 0 ? B(0, r) : B(nC - 1, r); if (!b || b.roof && b.y > TOP) continue;
        const ux = sgn > 0 ? b.x0 + WT / 2 : b.x1 - WT / 2, uz = b.z1 - 0.9;
        G.Gim.addSluice(w, sgn, wx, z, W - 1.2, ux, b.y, uz, ST / 2);
        n++;
      }
    }
    // ---- water falling from grates in the walls, pillars to the vault, braziers on the walls, debris afloat
    for (let i = 0; i < 4; i++) { const side = rng.pick(['W', 'E']), z = rng.range(wz0 + 4, wz1 - 4); FL().waterfall(w, side === 'W' ? 0.02 : W - 0.02, z, rng.range(8, 12), side === 'W' ? 'px' : 'nx', rng.range(1.4, 2.6)); }
    for (const b of blk) if (!b.roof && rng.chance(0.4)) P().brazier(w, b.x0 + WT / 2, TOP, b.z0 + WT / 2, 0.8, true);
    for (const b of blk) if (b.roof && rng.chance(0.6)) P().brazier(w, (b.x0 + b.x1) / 2, b.y, (b.z0 + b.z1) / 2, 0.9, true);
    for (let i = 0; i < 8; i++) { const x = rng.range(4, W - 4), z = rng.range(wz0 + 2, wz1 - 2); if (blk.some((b) => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue; if (rng.chance(0.5)) P().barrel(w, x, z, -0.35, rng); else P().crate(w, x, z, -0.3, rng); }
    for (let x = 10; x < W - 6; x += 12) { P().pillarSquare(w, x, 6, 0, HT, 1.1); P().torch(w, x, 3.4, 6.7, 'pz'); }
    for (let z = 10; z < D - 6; z += 9) { if (rng.chance(0.5)) P().vines(w, 0, rng.range(8, 13), z, 'px', rng.range(3, 6), rng); if (rng.chance(0.5)) P().vines(w, W, rng.range(8, 13), z + 4, 'nx', rng.range(3, 6), rng); }
    w.animated.push({ kind: 'uvflow', mat: w.mats.water, sp: [0, -0.05] });
    // the ground of the town for what is laid afterwards: the walls' and roofs' tops (nothing goes into the water)
    occ.mark(0, wz0, W, wz1, 2);
    for (const b of blk) if (b.roof) occ.mark(b.x0 + 0.5, b.z0 + 0.5, b.x1 - 0.5, b.z1 - 0.5, 0);
    w.groundTop = (x, z) => { if (z < wz0 || z > wz1) return 0; const b = blk.find((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1); return b && b.roof ? b.y : null; };
    w.navLayers = 2;
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.flooded = genFlooded;
})();
