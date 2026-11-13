'use strict';
// 血月の古城 (castle, the entrance tier), on a framework of its own: a castle built down a hillside in three baileys, one under the
// other. You come in at the top by the keep (south) and go down to the gates (north): each bailey stands some 4.5 m over the next,
// on a retaining wall with a crenellated parapet along its edge, joined to the one below by a stair under a gatehouse arch. From a
// parapet you look (and shoot) down into the bailey below; you can drop over it, but you climb back only by the stairs. The lowest,
// outer bailey has the wall walks with the cauldrons of boiling oil (gimmick_a.js).
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props;
  const CA = () => F._castle;
  const STEP = 4.5;

  function genCastle(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const W = 78 + rng.int(0, 2) * 4, D = 100 + rng.int(0, 2) * 4;
    const w = new G.World(W, D, 'castle');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'castle', ['stair', 'zigzag', 'split']);
    w.layout = layout;
    const cx = W / 2, TOPY = 2 * STEP;
    // the three baileys: outer (north, y 0), middle, upper (south, by the keep)
    const z1a = Math.round(D * 0.42), z2a = Math.round(D * 0.71);
    const B = [{ z0: 0, z1: z1a, y: 0 }, { z0: z1a, z1: z2a, y: STEP }, { z0: z2a, z1: D, y: TOPY }];
    w.solid('floor', 0, -1, 0, W, 0, z1a, { uv: 4 });
    for (const b of B.slice(1)) { w.solid('block', 0, -1, b.z0, W, b.y - 0.3, b.z1, { uv: 3 }); w.solid('floor', 0, b.y - 0.3, b.z0, W, b.y, b.z1, { uv: 4 }); }
    // the curtain round it all, stepping down with the baileys; merlons on top
    const CUR = 5.2;
    for (const b of B) for (const [x0, x1] of [[-1.2, 0], [W, W + 1.2]]) {
      w.solid('wall', x0, -1, b.z0, x1, b.y + CUR, b.z1, { uv: 3 });
      for (let z = b.z0 + 0.3; z < b.z1 - 0.8; z += 1.8) LG.hard(w, 'block', x0, b.y + CUR, z, x1, b.y + CUR + 1, z + 0.9, { noGrapple: true });
    }
    w.solid('wall', -1.2, -1, D, W + 1.2, TOPY + CUR, D + 1.2, { uv: 3 });
    H.perimeter(w, rng, W, D, { gates, h: CUR + 1, walls: false, beams: 0, stub: 3, southY: TOPY });
    { let ax = -1.2; for (const g of [...LG.gateXs(W, gates), W + 7]) { const e = g - 5.5; if (e > ax) w.solid('wall', ax, -1, -1.2, e, CUR + 1, 0, { uv: 3 }); ax = g + 5.5; } }
    // ---- the drops between the baileys: parapet along the upper edge (gaps to drop through), stairs down under gatehouse arches
    const stairs = [], rpar = [], rmer = [];
    for (let k = 1; k < B.length; k++) {
      const b = B[k], e = b.z0, y = b.y, L = LG.stairsLen(STEP);
      const xs = layout === 'split' ? [W * 0.2, W * 0.8] : layout === 'zigzag' ? [k % 2 ? W * 0.22 : W * 0.78] : [cx + rng.range(-6, 6)];
      if (layout === 'stair' && rng.chance(0.6)) xs.push(rng.chance(0.5) ? W * 0.15 : W * 0.85);
      for (const sx of xs) {
        const wd = 3.2;
        H.stairs(w, 'N', e, sx, wd, B[k - 1].y, y, 'trim');
        for (const s of [-1, 1]) w.solid('wall', sx + s * (wd / 2 + 0.2) - 0.2, B[k - 1].y, e - L, sx + s * (wd / 2 + 0.2) + 0.2, y + 0.9, e, { uv: 1.5 }); // (the stair's side walls)
        // the gatehouse at its top: two towers and the arch over the stair head
        for (const s of [-1, 1]) { w.solid('block', sx + s * (wd / 2 + 1.4) - 1.0, y, e - 0.2, sx + s * (wd / 2 + 1.4) + 1.0, y + 6, e + 2.2, { uv: 2.5 }); P().torch(w, sx + s * (wd / 2 + 1.4), y + 3.2, e - 0.2, 'nz'); }
        w.solid('block', sx - wd / 2 - 0.4, y + 4.2, e - 0.2, sx + wd / 2 + 0.4, y + 6, e + 2.2, { uv: 2.5 });
        w.visual('trim', sx - wd / 2 - 0.4, y + 3.9, e - 0.25, sx + wd / 2 + 0.4, y + 4.2, e + 2.25, { uv: 1 });
        stairs.push({ x: sx, e, wd, y, L });
        occ.mark(sx - wd / 2 - 2.5, e - L - 1.5, sx + wd / 2 + 2.5, e + 3.5);
      }
      // the parapet: crenellated, open in places (drop through), not across a stair head or its towers
      // (rpar, rmer: its stretches and its merlons, drawn with the rest of the castle below)
      for (let x = 0.3; x < W - 0.3; x += 2) {
        if (stairs.some((s) => s.e === e && Math.abs(x + 0.9 - s.x) < s.wd / 2 + 2.6)) continue;
        if ((Math.floor(x / 2) + k * 3) % 9 === 0) continue;
        w.solid('wall', x, y, e, x + 1.8, y + 1.0, e + 0.4, { uv: 1.5 });
        if (Math.floor(x / 2) % 2 === 0) { LG.hard(w, 'block', x + 0.2, y + 1.0, e, x + 1.0, y + 1.6, e + 0.4, { noGrapple: true }); rmer.push([x + 0.6, y + 1.0, e]); }
        rpar.push([x, x + 1.8, y, e]);
      }
      // the face of the retaining wall: buttresses, torches, banners hanging down it
      for (let x = 6; x < W - 4; x += 9) {
        if (stairs.some((s) => s.e === e && Math.abs(x - s.x) < s.wd / 2 + 3.5)) continue;
        w.solid('wall', x - 0.6, B[k - 1].y, e - 0.8, x + 0.6, y - 0.6, e, { uv: 2 });
        if (rng.chance(0.5)) P().torch(w, x + 2.5, B[k - 1].y + 3.0, e, 'nz');
        else if (rng.chance(0.6)) P().banner(w, x + 3, y - 0.2, e - 0.01, 'nz', 3.4, CA().RED);
      }
      occ.mark(0, e - 2, W, e + 2, 1);
      w.platTops.push({ x0: 2, z0: e + 1, x1: W - 2, z1: e + 3.5, y, cx: W * 0.3, cz: e + 2 });
    }
    // ---- the castle to look at (none of it stops anyone; no dice are thrown for it). Outside the curtain: a square tower at every
    // step of the wall and at its ends, with a corbelled, crenellated head and slit windows; beyond the south wall the great keep, with
    // a turret at each corner. On the curtain's inner face: a plinth, a string course under the merlons, arrow loops. On the retaining
    // walls: a course of corbels under the parapet. In each gatehouse: an arch under its lintel, merlons on its two towers.
    {
      const vis = (mk, x0, y0, z0, x1, y1, z1, uv) => w.visual(mk, x0, y0, z0, x1, y1, z1, { uv: uv || 2 });
      LG._tag = 'castle';
      const FT = LG.fort, faces4 = (cxx, czz, half) => [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([sx, sz]) => (sz ? (a, y, d) => [cxx - sz * a, y, czz + sz * (half + d)] : (a, y, d) => [cxx + sx * (half + d), y, czz + sx * a]));
      // (the head of a tower: corbels in three courses all round, the parapet standing out over them, its merlons and loops)
      const crown = (cxx, czz, half, top) => {
        const tg = LG._tag; LG._tag = 'castle.towers';
        for (const T of faces4(cxx, czz, half)) {
          FT.corbels(w, T, -half, half, top - 0.62, 0.34, { step: 0.95, course: false, wd: 0.15, far: true });
          FT.parapet(w, T, -half - 0.34, half + 0.34, top - 0.62, -0.12, 0.34, { pitch: 1.7, sill: 0.95, ht: 1.0, far: true, dmg: 0.6 });
        }
        LG._tag = tg;
      };
      const tower = (cxx, czz, half, y0, top, mk) => {
        vis(mk || 'wall', cxx - half, y0, czz - half, cxx + half, top, czz + half, 3);
        // (its foot stands outside the curtain, out of sight from within: none drawn)
        crown(cxx, czz, half, top);
        for (let y = y0 + 3.2; y < top - 2.4; y += 3.6) for (const s2 of [-1, 1]) {                                    // (slit windows)
          vis('dark', cxx - 0.11, y, s2 > 0 ? czz + half : czz - half - 0.03, cxx + 0.11, y + 1.3, s2 > 0 ? czz + half + 0.03 : czz - half, 1);
          vis('dark', s2 > 0 ? cxx + half : cxx - half - 0.03, y, czz - 0.11, s2 > 0 ? cxx + half + 0.03 : cxx - half, y + 1.3, czz + 0.11, 1);
        }
      };
      // the towers of the curtain
      const zs = [[1.5, 0], [z1a, STEP], [z2a, TOPY], [D - 1.5, TOPY]];
      for (const [tz, ty] of zs) for (const s2 of [-1, 1]) tower(s2 < 0 ? -3.9 : W + 3.9, tz, 2.7, -1, ty + CUR + 5.5);
      // the keep beyond the south wall, and its turrets
      { const kz0 = D + 1.2, kz1 = D + 19, kx0 = cx - 15, kx1 = cx + 15, top = TOPY + CUR + 17;
        vis('wall', kx0, -1, kz0, kx1, top, kz1, 4);
        { const T = (a, y, d) => [cx + a, y, kz0 - d]; FT.corbels(w, T, kx0 - cx, kx1 - cx, top - 0.7, 0.4, { step: 1.1, course: false, wd: 0.18, far: true }); FT.parapet(w, T, kx0 - cx - 0.3, kx1 - cx + 0.3, top - 0.7, -0.15, 0.4, { pitch: 2.0, sill: 1.0, ht: 1.15, far: true, dmg: 0.6 }); }
        for (let x = kx0 + 3.5; x < kx1 - 2; x += 5.5) for (let y = TOPY + 6; y < top - 3; y += 5) vis('dark', x - 0.14, y, kz0 - 0.03, x + 0.14, y + 1.7, kz0, 1);
        for (const s2 of [-1, 1]) tower(s2 < 0 ? kx0 : kx1, kz0 + 1.5, 2.4, -1, top + 4.5);
      }
      // the curtain's inner face, bailey by bailey
      LG._tag = 'castle.curtain';
      for (const b of B) for (const s2 of [-1, 1]) {
        const xf = s2 < 0 ? 0 : W, xo = s2 < 0 ? 0.14 : -0.14, T = s2 < 0 ? (a, y, d) => [d, y, a] : (a, y, d) => [W - d, y, a];
        FT.talus(w, T, b.z0, b.z1, b.y, 0.85, 0.28);
        FT.corbels(w, T, b.z0, b.z1, b.y + CUR - 0.16, 0.42, { step: 1.8 });
        let n = 0; for (let z = b.z0 + 0.3; z < b.z1 - 0.8; z += 1.8) n++;
        FT.parapet(w, T, b.z0 - 0.15, b.z0 - 0.15 + n * 1.8, b.y + CUR, -1.2, -0.6, { gy: b.y });
        for (let z = b.z0 + 4; z < b.z1 - 3; z += 6) vis('dark', Math.min(xf, xf + xo * 0.25), b.y + 2.1, z - 0.09, Math.max(xf, xf + xo * 0.25), b.y + 3.4, z + 0.09, 1);
      }
      // the south wall behind the keep's bailey and the stretches of curtain between the gates: the parapet along their tops
      // (not about the way in: its gate frame stands there, and the stretch of wall round it rises higher)
      for (const [a0, a1] of [[-1.2, W / 2 - 7.7], [W / 2 + 7.7, W + 1.2]]) { for (const [p0, p1] of [[a0, Math.min(a1, cx - 15.3)], [Math.max(a0, cx + 15.3), a1]]) if (p1 - p0 > 1.5) FT.parapet(w, (a, y, d) => [a, y, D + 1.2 - d], p0, p1, TOPY + CUR, 0, 0.6, { gy: TOPY });   // (none where the keep's wall rises right behind it)
        FT.corbels(w, (a, y, d) => [a, y, D - d], Math.max(0, a0), Math.min(W, a1), TOPY + CUR - 0.16, 0.42, { step: 1.5 }); }
      { let ax = -1.2; for (const g of [...LG.gateXs(W, gates), W + 7]) { const e = g - 5.5; if (e > ax + 1.5) FT.parapet(w, (a, y, d) => [a, y, -1.2 + d], ax, e, CUR + 1, 0, 0.6); ax = g + 5.5; } }
      LG._tag = 'castle.retaining';
      // the parapets on the retaining walls: a coping along their tops, their merlons
      { const M = LG.mason(w); for (const [x0, x1, y, e] of rpar) { const v = M.var(x0, y, e); M.hexa('trim', [[x0 - 0.02, y + 0.98, e - 0.06], [x0 + 1.82, y + 0.98, e - 0.06], [x0 - 0.02, y + 1.12, e + 0.12], [x0 + 1.82, y + 1.12, e + 0.12], [x0 - 0.02, y + 0.98, e + 0.46], [x0 + 1.82, y + 0.98, e + 0.46], [x0 - 0.02, y + 1.12, e + 0.28], [x0 + 1.82, y + 1.12, e + 0.28]], 0, { gy: y, top: y + 1.2, tint: [v[0] * 0.85, v[1] * 0.85, v[2] * 0.85], n: 0.008, chip: 0.25, chipS: 0.06, uv: 1.4 }); } }
      for (const [a, y, e] of rmer) FT.merlon(w, (u, yy, d) => [u, yy, e + d], a, y + 0.1, 0.4, 0, 0.8, 0.6, { gy: y, loop: false, dmg: 0 });   // (whole, each: they stand where you fight, and the box of each stops you)
      LG._tag = 'castle.retaining';
      // corbels under each parapet, on the face of the retaining wall (not across a stair)
      for (let k = 1; k < B.length; k++) {
        const e = B[k].z0, y = B[k].y;
        let r0 = null;
        for (let x = 0.4; x < W - 0.5; x += 1.3) {
          const skip = stairs.some((q) => q.e === e && Math.abs(x + 0.3 - q.x) < q.wd / 2 + 2.8) || x + 1.3 >= W - 0.5;
          if (!skip && r0 === null) r0 = x;
          if ((skip || x + 2.6 >= W - 0.5) && r0 !== null) { const r1 = skip ? x : x + 1.3; if (r1 - r0 > 1) FT.corbels(w, (a, yy, d) => [a, yy, e - d], r0, r1, y - 0.2, 0.32, { step: 1.3, course: false, one: true }); r0 = null; }
        }
      }
      // the gatehouses
      LG._tag = 'castle.gatehouses';
      const GX = G.GFX;
      for (const q of stairs) {
        const half = q.wd / 2 + 0.4;
        if (GX && GX.archRib) { const mt = new THREE.Matrix4().makeTranslation(q.x, q.y + 2.95, q.e + 1.0); w.batch.geo('block', GX.archSpandrel(half, 0.95, 2.36, 16), mt); w.batch.geo('trim', GX.archRib(half, 0.95, 0.3, 2.5, 16), mt); }
        for (const s2 of [-1, 1]) crown(q.x + s2 * (q.wd / 2 + 1.4), q.e + 1.0, 1.0, q.y + 6);
        FT.parapet(w, (a, y, d) => [q.x + a, y, q.e - 0.2 - d], -half, half, q.y + 6, -0.5, 0, { pitch: 1.25, sill: 0.4, ht: 0.85, gy: q.y, dmg: 0.4 });
      }
      LG._tag = null;
    }
    // (placing inside one bailey: the others are closed off on the occupancy grid meanwhile)
    const inB = (b, fn) => { const save = occ.a.slice(); occ.mark(0, 0, W, b.z0 + 1.5, 1); occ.mark(0, b.z1 - 1.5, W, D, 1); try { return fn(); } finally { for (let z = 0; z < D; z++) if (z < b.z0 + 1.5 || z >= b.z1 - 1.5) for (let x = 0; x < W; x++) occ.a[z * W + x] = save[z * W + x]; } };
    // ---- the upper bailey: the keep, a tower at each corner, the chapel's ruin
    const up = B[2];
    const keepS = rng.chance(0.5) ? -1 : 1, kx = keepS < 0 ? 12 : W - 12, kz = (up.z0 + up.z1) / 2 + 2;
    T.at(w, up.y, () => { CA().tower(w, rng, kx, kz, 6, 12); });
    occ.mark(kx - 7.5, kz - 7.5, kx + 7.5, kz + 7.5);
    T.at(w, up.y, () => { for (const sx of [-1, 1]) { const x = sx < 0 ? 5 : W - 5, z = D - 5; if (Math.abs(x - kx) > 10) { CA().tower(w, rng, x, z, 3, 9); occ.mark(x - 4, z - 4, x + 4, z + 4); } } });
    inB(up, () => T.at(w, up.y, () => { const r = occ.place(rng, 4, 4, 1.5, 20); if (r) P().well(w, r.x0 + 2, r.z0 + 2, 0); }));
    // ---- the middle bailey: the great hall (roofless) or the barracks, the stables
    const mid = B[1];
    inB(mid, () => T.at(w, mid.y, () => {
      const hw = 9, R = { x0: Math.round(cx - hw), z0: mid.z0 + 6, x1: Math.round(cx + hw), z1: Math.min(mid.z1 - 4, mid.z0 + 6 + 15) };
      if (layout !== 'split' && occ.free(R.x0 - 1.5, R.z0 - 1.5, R.x1 + 1.5, R.z1 + 1.5) && R.z1 - R.z0 >= 12) { occ.mark(R.x0 - 1.5, R.z0 - 1.5, R.x1 + 1.5, R.z1 + 1.5); CA().greatHall(w, rng, R); }
      else for (let i = 0; i < 2; i++) { const r = occ.place(rng, rng.int(7, 9), rng.int(6, 8), 1.4, 20); if (r) H.house(w, rng, r, { ruined: 0.75, h: [3.6, 4.8] }); }
      const r = occ.place(rng, 12, 5, 1.5, 30); if (r) CA().stables(w, rng, r.x0, r.z0, r.x1, r.z1);
    }));
    // ---- the outer bailey: the wall walks with the oil, the training yard, quarters against the walls
    for (const side of [-1, 1]) if (rng.chance(side < 0 ? 0.95 : 0.8)) w.platTops.push(CA().wallWalk(w, rng, occ, side < 0 ? 0 : W - 3.4, side < 0 ? 3.4 : W, 13, z1a - 3, 4, side, null));
    inB(B[0], () => {
      const r = occ.place(rng, 12, 9, 1.5, 30); if (r) CA().trainingYard(w, rng, r.x0, r.z0, r.x1, r.z1);
      for (let i = 0; i < rng.int(1, 2); i++) { const q = occ.place(rng, rng.int(7, 9), rng.int(6, 8), 1.4, 20); if (q) H.house(w, rng, q, { ruined: 0.75, h: [3.6, 4.8] }); }
    });
    // things lying about every bailey, braziers by the stairs
    for (const b of B) inB(b, () => T.at(w, b.y, () => {
      for (let i = 0; i < 5; i++) { const r = occ.place(rng, 2, 2, 0.8, 10); if (!r) continue; if (rng.chance(0.5)) P().barrel(w, r.x0 + 0.7, r.z0 + 0.7, 0, rng, rng.chance(0.3)); else P().crate(w, r.x0 + 1, r.z0 + 1, 0, rng); }
      if (b.y === 0) for (let i = 0; i < 2; i++) { const r = occ.place(rng, 2, 2, 1.2, 12); if (r) F.deadTree(w, r.x0 + 1, r.z0 + 1, rng, rng.range(1, 1.4)); }
    }));
    for (const s of stairs) for (const sx of [-1, 1]) P().brazier(w, s.x + sx * (s.wd / 2 + 1.2), s.y - STEP, s.e - s.L - 1.2, 0.9, true);
    for (const g of LG.gateXs(W, gates)) { P().brazier(w, g - 5, 0, 4.5, 1, true); P().brazier(w, g + 5, 0, 4.5, 1, true); }
    // the ground of each bailey (for what the area lays down afterwards: chests, graves, pools)
    w.groundTop = (x, z) => (z < z1a ? 0 : z < z2a ? STEP : TOPY);
    const ww = FB.finish(w, rng, occ, W, D, area, kind, extraChests);
    ww.spawn = { x: W / 2, y: TOPY, z: D - 4.5, yaw: 0 };
    return ww;
  }
  F.gen.castle = genCastle;
})();
