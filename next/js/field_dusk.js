'use strict';
// 黄昏の廃都 (dusk, the surface tier), on a framework of its own: the city on the great bridge over the abyss, at sundown.
// The area is one long bridge from the cliff at the way in (south) to the cliff with the gates (north), the dark falling away on either
// side of it. On its deck the fallen city: an avenue down the middle, ruined houses along the parapets, the cracked great pillars
// (gimmick_a.js) that topple across it. Inside the bridge, under the deck, runs the old service gallery, its arches open on the void;
// stairwells in the deck go down to it. Now and then the deck itself has fallen in: a beam is left to cross on, or the gallery below.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props;
  const DK = () => F._dusk;
  const LOW = -7, DECK = 1.2;

  function genDusk(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const W = 66, D = 100 + rng.int(0, 2) * 4, DW = 32 + rng.int(0, 1) * 4, cx = W / 2, dx0 = cx - DW / 2, dx1 = cx + DW / 2, ZN = 12, ZS = D - 10;
    const w = new G.World(W, D, 'dusk');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    w.noGround = true; w.killY = -10;
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'dusk', ['avenue', 'market', 'broken']);
    w.layout = layout;
    // ---- the two cliffs (landings) and the bridge between them
    for (const [z0, z1] of [[0, ZN], [ZS, D]]) { w.solid('floor', 0, -1, z0, W, 0, z1, { uv: 4 }); w.solid('rock', 0, -40, z0, W, -1, z1, { uv: 6, grad: false }); }
    // what of the deck is missing: stairwells down to the gallery, and (broken) a fallen stretch with one beam left over it
    // (the gallery runs under one side of the deck, so the avenue down the middle is a single storey: the great pillars fall there)
    const GW = 4.2, gs = rng.chance(0.5) ? -1 : 1, gx = gs < 0 ? dx0 + 6.2 : dx1 - 6.2;
    const wells = [];
    const nW = layout === 'broken' ? 1 : 2;
    for (let k = 0; k < nW; k++) { const z = Math.round(ZN + 10 + k * (ZS - ZN - 36) / Math.max(1, nW - 1) + rng.range(-3, 3)); wells.push({ x0: gx - 1.6, x1: gx + 1.6, z0: z, z1: z + LG.stairsLen(-LOW) + 0.6 }); }
    const gap = layout === 'broken' ? { z0: Math.round(D * 0.55), z1: Math.round(D * 0.55) + 7, bx: rng.chance(0.5) ? dx0 + 5 : dx1 - 5 } : null;
    const holes = [...wells, ...(gap ? [{ x0: dx0, x1: dx1, z0: gap.z0, z1: gap.z1 }] : [])];
    // the deck: slabs between the holes (a run along z, cut where a hole crosses it)
    const zs = [ZN, ZS, ...holes.flatMap((h) => [h.z0, h.z1])].sort((a, b) => a - b);
    for (let i = 0; i + 1 < zs.length; i++) {
      const a = zs[i], b = zs[i + 1]; if (b - a < 0.05) continue;
      const m = (a + b) / 2, hs = holes.filter((h) => m > h.z0 && m < h.z1);
      let x = dx0;
      for (const h of hs.sort((p, q) => p.x0 - q.x0)) { if (h.x0 > x) w.solid('floor', x, -DECK, a, h.x0, 0, b, { uv: 4 }); x = Math.max(x, h.x1); }
      if (dx1 > x) w.solid('floor', x, -DECK, a, dx1, 0, b, { uv: 4 });
    }
    if (gap) { w.solid('trim', gap.bx - 0.6, -0.5, gap.z0 - 0.3, gap.bx + 0.6, 0, gap.z1 + 0.3, { uv: 1, tag: 'bridge' }); for (let k = 0; k < 4; k++) P().rubble(w, rng.range(dx0 + 2, dx1 - 2), LOW, rng.range(gap.z0, gap.z1), rng, rng.range(1, 1.6)); }
    // the body of the bridge under the deck (solid stone either side of the gallery), the piers going down into the dark
    w.solid('block', dx0, -16, ZN, gx - GW - 0.8, -DECK, ZS, { uv: 4 }); w.solid('block', gx + GW + 0.8, -16, ZN, dx1, -DECK, ZS, { uv: 4 });
    for (let z = ZN + 6; z < ZS - 4; z += 14) { w.visual('block', dx0 + 2, -60, z, dx1 - 2, -16, z + 6, { uv: 6 }); }
    // the gallery: its floor, its walls with arches open on the void (a sill to lean on), lamps
    w.solid('cobble', gx - GW, LOW - 1, ZN, gx + GW, LOW, ZS, { uv: 3 });
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? gx - GW - 0.8 : gx + GW, x1 = x0 + 0.8;
      if (s !== gs) { w.solid('wall', x0, LOW, ZN, x1, -DECK, ZS, { uv: 2.5 }); for (let z = ZN + 4; z < ZS; z += 12) P().torch(w, s < 0 ? gx - GW : gx + GW, LOW + 3, z, s < 0 ? 'px' : 'nx'); continue; } // (the inner side: the body of the bridge)
      for (let z = ZN; z < ZS; z += 6) {
        w.solid('wall', x0, LOW, z, x1, -DECK, z + 2, { uv: 2.5 });
        w.solid('wall', x0, LOW, z + 2, x1, LOW + 1.0, Math.min(ZS, z + 6), { uv: 2 });        // the sill
        w.solid('wall', x0, LOW + 4.2, z + 2, x1, -DECK, Math.min(ZS, z + 6), { uv: 2.5 });    // over the arch
        w.visual('trim', x0 - 0.05, LOW + 3.9, z + 2, x1 + 0.05, LOW + 4.2, Math.min(ZS, z + 6), { uv: 1 });
      }
    }
    for (const h of wells) {
      H.stairs(w, 'S', h.z0 + 0.3, gx, 2.6, LOW, 0, 'trim');
      for (const s of [-1, 1]) w.solid('wall', gx + s * 1.6 - 0.2, 0, h.z0, gx + s * 1.6 + 0.2, 1.0, h.z1, { uv: 1.5 });
      w.solid('wall', gx - 1.8, 0, h.z1 - 0.2, gx + 1.8, 1.0, h.z1, { uv: 1.5 });
      occ.mark(gx - 3, h.z0 - 1.5, gx + 3, h.z1 + 1);
    }
    // the parapets along the deck's edges (gaps where they fell), the lip of the landings over the dark
    for (const ex of [dx0, dx1 - 0.45]) for (let z = ZN; z < ZS; z += 2) { if (rng.chance(0.18) || (gap && z + 2 > gap.z0 && z < gap.z1)) continue; w.solid('wall', ex, 0, z, ex + 0.45, 1.0, z + 1.8, { uv: 1.5 }); w.visual('trim', ex - 0.05, 1.0, z - 0.05, ex + 0.5, 1.1, z + 1.85, { uv: 1 }); }
    for (const [z0, z1] of [[ZN - 0.45, ZN], [ZS, ZS + 0.45]]) for (const [a, b] of [[0, dx0], [dx1, W]]) w.solid('wall', a, 0, z0, b, 1.0, z1, { uv: 1.5 });
    occ.mark(0, ZN, dx0 + 1, ZS, 2); occ.mark(dx1 - 1, ZN, W, ZS, 2); if (gap) occ.mark(dx0, gap.z0 - 1, dx1, gap.z1 + 1, 2);
    H.perimeter(w, rng, W, D, { gates, h: 6.5, walls: false, beams: 0, stub: 4 });
    { let ax = -1; for (const g of [...LG.gateXs(W, gates), W + 7]) { const e = g - 6.5; if (e > ax) w.solid('rock', ax, -1, -3, e, 9, 0, { uv: 6, grad: false }); ax = g + 6.5; } }
    for (const [a, b] of [[-3, cx - 7], [cx + 7, W + 3]]) w.solid('rock', a, -1, D, b, 8, D + 3, { uv: 6, grad: false });
    // ---- the city on the deck: the avenue in the middle, ruined houses along the sides, the great pillars, columns, statues
    const sideX = [[dx0 + 1.2, cx - 6.5], [cx + 6.5, dx1 - 1.2]];
    for (const [a, b] of sideX) for (let z = ZN + 4; z < ZS - 8;) {
      const d = rng.int(8, 12);
      if (gap && z + d > gap.z0 - 1 && z < gap.z1 + 1) { z = gap.z1 + 1.5; continue; }
      if (layout !== 'avenue' || rng.chance(0.75)) { const R = { x0: Math.round(a), z0: z, x1: Math.round(b), z1: z + d }; if (occ.free(R.x0, R.z0, R.x1, R.z1)) { occ.mark(R.x0 - 1, R.z0 - 1, R.x1 + 1, R.z1 + 1); const up = DK().ruinBlock(w, rng, R, rng.pick([3, 3.5])); if (up) w.platTops.push(up); } }
      z += d + rng.int(3, 6);
    }
    if (G.Gim) {
      const want = 2 + (rng.chance(0.5) ? 1 : 0), L = G.Gim.PIL.laneL + 0.6;
      for (let t = 0, n = 0; t < 160 && n < want; t++) {
        const x = Math.round(gs < 0 ? rng.range(cx - 2.5, cx + 5) : rng.range(cx - 5, cx + 2.5)) + 0.5, z = Math.round(rng.range(ZN + 4, ZS - 4)) + 0.5, dz = rng.chance(0.5) ? 1 : -1, dx = 0;
        if (!occ.free(x - 1.7, z - 1.7, x + 1.7, z + 1.7)) continue;
        const lz0 = Math.min(z, z + dz * L), lz1 = Math.max(z, z + dz * L);
        if (lz0 < ZN + 1 || lz1 > ZS - 1 || !occ.free(x - 1.9, lz0, x + 1.9, lz1)) continue;
        occ.mark(x - 1.7, z - 1.7, x + 1.7, z + 1.7); occ.mark(x - 1.9, lz0, x + 1.9, lz1);
        G.Gim.addPillar(w, x, z, dx, dz, rng.range(0, 100)); n++;
      }
    }
    if (layout === 'market') for (let i = 0; i < 5; i++) { const r = occ.place(rng, 4, 3, 1, 20); if (r && r.z0 > ZN && r.z1 < ZS) { P().table(w, r.x0 + 2, r.z0 + 1.5, 0, true, rng); w.visual('cloth', r.x0, 2.4, r.z0, r.x1, 2.5, r.z1, { uv: 2 }); for (const [px, pz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) w.solid('woodDark', px - 0.06, 0, pz - 0.06, px + 0.06, 2.4, pz + 0.06, { uv: 1 }); } }
    for (let i = 0; i < 3; i++) { const ax = rng.chance(0.5), r = occ.place(rng, ax ? 7 : 2, ax ? 2 : 7, 1, 14); if (r && r.z0 > ZN && r.z1 < ZS) DK().fallenColumn(w, rng, (r.x0 + r.x1) / 2 - (ax ? 0.6 : 0), (r.z0 + r.z1) / 2 - (ax ? 0 : 0.6), ax); }
    for (let i = 0; i < 2; i++) { const r = occ.place(rng, 3, 3, 1.2, 14); if (r && r.z0 > ZN && r.z1 < ZS) { w.solid('block', r.x0 + 0.4, 0, r.z0 + 0.4, r.x1 - 0.4, 1.0, r.z1 - 0.4, { uv: 1 }); P().statue(w, r.x0 + 1.5, r.z0 + 1.5, 1.0, rng.range(0, 6), rng, 0.9); } }
    for (let i = 0; i < 5; i++) { const r = occ.place(rng, 2, 2, 0.8, 10); if (r) { if (rng.chance(0.5)) P().urn(w, r.x0 + 1, r.z0 + 1, 0, rng); else P().rubble(w, r.x0 + 1, 0, r.z0 + 1, rng, rng.range(0.8, 1.4)); } }
    for (let z = ZS - 6; z > ZN + 4; z -= 13) for (const [bx, bz] of [[cx - 4.5, z], [cx + 4.5, z - 6]]) if (occ.free(bx - 0.8, bz - 0.8, bx + 0.8, bz + 0.8)) { occ.mark(bx - 0.8, bz - 0.8, bx + 0.8, bz + 0.8); P().brazier(w, bx, 0, bz, 0.9, true); }
    for (const g of LG.gateXs(W, gates)) { P().brazier(w, g - 5.5, 0, 4.5, 1, true); P().brazier(w, g + 5.5, 0, 4.5, 1, true); }
    // chest spots along the deck by its parapets (the open middle is for the fight)
    for (let z = ZN + 6; z < ZS - 6; z += 7) for (const x of [dx0 + 3.2, dx1 - 3.2]) if (occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) w.platTops.push({ x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5, y: 0, cx: x, cz: z });
    for (const x of [6, W - 6, 12, W - 12]) for (const z of [D - 5, 6]) if (occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) w.platTops.push({ x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5, y: 0, cx: x, cz: z }); // (the landings' corners)
    // a chest or two in the gallery's alcoves
    for (let k = 0; k < 4; k++) { const z = ZN + 6 + k * (ZS - ZN - 12) / 3; if (wells.some((h) => z > h.z0 - 2 && z < h.z1 + 2)) continue; w.platTops.push({ x0: gx - 3, z0: z - 1.5, x1: gx + 3, z1: z + 1.5, y: LOW, cx: gx, cz: z }); }
    DK().skyline(w, rng, W, D);
    w.navLayers = 2; w.navRebuild = true; // (the great pillars fall across the deck: the nav is worked out again then)
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.dusk = genDusk;
})();
