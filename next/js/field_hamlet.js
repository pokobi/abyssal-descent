'use strict';
// 霧の廃村 (hamlet, the surface tier), on a framework of its own: indoors and on the roofs.
// The village is packed tight: houses shoulder to shoulder along narrow lanes, a high street through the middle, the square with the
// well and the bell tower. Nearly every house can be walked into (one or two doors, a room with what was left in it). The low houses
// have flat roofs you can walk on, joined across the lanes by planks; wooden stairs go up the outside walls to them, and the tall
// houses have an inner stair to the upper room, whose door opens onto the next roof. So the fight goes on in two layers at once:
// the lanes and rooms below, the roofs above.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props, PG = () => G.Props.PG;
  const HM = () => F._hamlet;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));
  const LOT = 9, LANE = 3.2, PITCH = LOT + LANE, WT = 0.35, R1 = 3.4, R2 = 6.6;

  function genHamlet(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const nC = 6, nR = 5 + rng.int(0, 1), ox = 4, oz = 15, SHIFT = 3.2;
    const W = Math.ceil(ox * 2 + nC * PITCH - LANE), D = Math.ceil(oz + nR * PITCH - LANE + 13 + SHIFT);
    const w = new G.World(W, D, 'hamlet');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'hamlet', ['street', 'square', 'stream']);
    w.layout = layout;
    const rs = rng.int(1, nR - 3), zsh = (r) => (layout === 'stream' && r > rs ? SHIFT : 0); // (the stream: the lane after row rs is wider and the water runs down it)
    H.floors(w, W, D, null, 'floor');
    H.perimeter(w, rng, W, D, { gates, h: 4.2 });
    // the lots: which hold a house of one storey (flat roof), of two (upper room), a ruin, or a yard; the high street and the square stay open
    const streetC = Math.floor(nC / 2), sq = { c: layout === 'square' ? 2 : rng.int(1, nC - 3), r: rng.int(0, nR - 2) };
    if (layout === 'stream' && (sq.r === rs || sq.r + 1 === rs + 1)) sq.r = rs + 1 < nR - 1 ? rs + 1 : Math.max(0, rs - 2);
    const lot = [];
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
      let t = rng.next() < 0.5 ? 1 : rng.next() < 0.55 ? 2 : rng.next() < 0.5 ? 'ruin' : 'yard';
      if (c >= sq.c && c <= sq.c + 1 && r >= sq.r && r <= sq.r + 1) t = 'square';
      lot.push({ c, r, t, x0: ox + c * PITCH, z0: oz + r * PITCH + zsh(r), x1: ox + c * PITCH + LOT, z1: oz + r * PITCH + LOT + zsh(r), doors: [] });
    }
    const L = (c, r) => (c < 0 || r < 0 || c >= nC || r >= nR ? null : lot[r * nC + c]);
    // the high street: the lane west of streetC is twice as wide (the lots on its east side give up 3 m)
    for (let r = 0; r < nR; r++) { const q = L(streetC, r); if (q.t !== 'square') q.x0 += 3; }
    // ---- houses
    const roofs = []; // flat roofs you can walk on: {x0, z0, x1, z1, y, q}
    for (const q of lot) {
      if (q.t === 'square' || q.t === 'yard') continue;
      const h = q.t === 2 ? R2 : R1, ruin = q.t === 'ruin';
      // doors: on two sides that face a lane (never two on the same side), 1.6 m wide
      const sides = U.shuffle(['N', 'S', 'W', 'E'], () => rng.next()).slice(0, rng.chance(0.6) ? 2 : 1);
      for (const sd of sides) { const along = sd === 'N' || sd === 'S', a0 = along ? q.x0 : q.z0, a1 = along ? q.x1 : q.z1, m = rng.range(a0 + 2, a1 - 2); q.doors.push({ sd, a: m - 0.8, b: m + 0.8 }); }
      house(w, rng, q, h, ruin);
      if (!ruin && q.t === 1) roofs.push({ x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, y: R1 + 0.25, q });
      occ.mark(q.x0 - 0.3, q.z0 - 0.3, q.x1 + 0.3, q.z1 + 0.3);
    }
    // ---- the roofs: low parapets, planks across the lanes to the next flat roof, stairs up the outside
    const planks = [];
    for (const a of roofs) for (const b of roofs) {
      if (a === b) continue;
      const dc = b.q.c - a.q.c, dr = b.q.r - a.q.r;
      if (!((dc === 1 && dr === 0) || (dc === 0 && dr === 1)) || !rng.chance(0.7)) continue;
      const y = a.y;
      if (dc === 1) { const z = rng.range(Math.max(a.z0, b.z0) + 1.5, Math.min(a.z1, b.z1) - 1.5); w.solid('wood', a.x1 - 0.2, y - 0.18, z - 0.65, b.x0 + 0.2, y, z + 0.65, { uv: 1, tag: 'bridge' }); planks.push({ x0: a.x1, z0: z - 0.65, x1: b.x0, z1: z + 0.65 }); }
      else { const x = rng.range(Math.max(a.x0, b.x0) + 1.5, Math.min(a.x1, b.x1) - 1.5); w.solid('wood', x - 0.65, y - 0.18, a.z1 - 0.2, x + 0.65, y, b.z0 + 0.2, { uv: 1, tag: 'bridge' }); planks.push({ x0: x - 0.65, z0: a.z1, x1: x + 0.65, z1: b.z0 }); }
    }
    let ups = 0;
    for (const a of U.shuffle(roofs.slice(), () => rng.next())) {
      if (ups >= 4) break;
      // a wooden stair up the outside of the wall, in the lane (it leaves the lane passable), from the ground to the roof
      const sd = rng.pick(['W', 'E']), x = sd === 'W' ? a.x0 - 0.75 : a.x1 + 0.75, run = LG.stairsLen(a.y), z0 = (a.z0 + a.z1) / 2 - run / 2;
      if (a.q.doors.some((d) => d.sd === sd) || z0 < a.z0 - 0.5) continue;
      H.stairs(w, 'S', z0, x, 1.2, 0, a.y, 'wood');
      occ.mark(x - 0.8, z0 - 0.2, x + 0.8, z0 + run + 0.2);
      ups++;
    }
    for (const a of roofs) {
      // the parapet round a roof: low, gaps where planks or stairs arrive and here and there
      for (let x = a.x0; x < a.x1 - 0.5; x += 1.5) for (const z of [a.z0, a.z1 - 0.25]) if (rng.chance(0.55) && !planks.some((p) => x + 0.75 > p.x0 - 0.3 && x < p.x1 + 0.3 && Math.abs(z - (z < (a.z0 + a.z1) / 2 ? p.z1 : p.z0)) < 0.6)) w.solid('wall', x, a.y, z, x + 1.3, a.y + 0.6, z + 0.25, { uv: 1 });
      w.platTops.push({ x0: a.x0 + 0.6, z0: a.z0 + 0.6, x1: a.x1 - 0.6, z1: a.z1 - 0.6, y: a.y, cx: (a.x0 + a.x1) / 2, cz: (a.z0 + a.z1) / 2 });
      if (rng.chance(0.35)) T.at(w, a.y, () => HM().haystack(w, a.x0 + 2, a.z0 + 2, 0.6));
      if (rng.chance(0.3)) P().barrel(w, a.x1 - 1.4, a.z1 - 1.4, a.y, rng);
    }
    // ---- the square: the well, the bell tower, stalls; the yards: gardens behind fences, haystacks, a scarecrow
    const sx0 = ox + sq.c * PITCH, sz0 = oz + sq.r * PITCH + zsh(sq.r), sx1 = sx0 + 2 * PITCH - LANE, sz1 = sz0 + 2 * PITCH - LANE, scx = (sx0 + sx1) / 2, scz = (sz0 + sz1) / 2;
    w.visual('cobble', sx0, 0, sz0, sx1, 0.03, sz1, { uv: 2, grad: false });
    P().well(w, scx, scz, 0); occ.mark(scx - 2, scz - 2, scx + 2, scz + 2);
    HM().belltower(w, rng, sx1 - 3.5, sz0 + 3.5, 8, -1); occ.mark(sx1 - 6, sz0 + 1, sx1 - 1, sz0 + 6);
    for (let i = 0; i < 2; i++) { const x = sx0 + 3 + i * 6, z = sz1 - 2.5; HM().stall(w, rng, x, z, true); occ.mark(x - 2, z - 1.5, x + 2, z + 1.5); }
    for (const q of lot) if (q.t === 'yard') {
      F.woodFence(w, q.x0, q.z0, q.x1, q.z0, 1.1, [[q.x0 + LOT / 2 - 1, q.x0 + LOT / 2 + 1]]); F.woodFence(w, q.x0, q.z1, q.x1, q.z1, 1.1, []);
      F.woodFence(w, q.x0, q.z0, q.x0, q.z1, 1.1, []); F.woodFence(w, q.x1, q.z0, q.x1, q.z1, 1.1, [[q.z0 + 3, q.z0 + 5]]);
      w.visual('mud', q.x0 + 0.5, 0, q.z0 + 0.5, q.x1 - 0.5, 0.03, q.z1 - 0.5, { uv: 2, grad: false });
      if (rng.chance(0.5)) HM().scarecrow(w, rng, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2); else HM().haystack(w, (q.x0 + q.x1) / 2, (q.z0 + q.z1) / 2, 1);
      occ.mark(q.x0, q.z0, q.x1, q.z1);
    }
    // ---- the stream down the wide lane: water, stone banks, a footbridge on the high street and another, reeds
    if (layout === 'stream') {
      const z0 = oz + (rs + 1) * PITCH - LANE + 1, z1 = z0 + LANE + SHIFT - 2;
      w.visual('water', 3, 0.0, z0, W - 3, 0.04, z1, { uv: 3, grad: false, skip: { bottom: true } });
      w.waterZones.push({ x0: 3, z0, x1: W - 3, z1 });
      w.streams = [{ x0: 3, z0, x1: W - 3, z1 }]; w.waterFlow = { x: (seed & 1 ? 0.55 : -0.55), z: 0 }; // (it runs across the village: water.js)
      w.visual('rock', 3, 0, z0 - 0.35, W - 3, 0.14, z0, { uv: 2, grad: false }); w.visual('rock', 3, 0, z1, W - 3, 0.14, z1 + 0.35, { uv: 2, grad: false });
      occ.mark(3, z0 - 0.6, W - 3, z1 + 0.6);
      const bxs = [ox + streetC * PITCH - LANE / 2 + 1.5, ox + rng.int(0, 1) * PITCH * 4 + LOT + LANE / 2];
      for (const bx of bxs) {
        const bw = 1.4;
        w.visual('wood', bx - bw, 0.04, z0 - 0.5, bx + bw, 0.16, z1 + 0.5, { uv: 1.5 });
        for (const sd of [-1, 1]) { w.solid('woodDark', bx + sd * bw - 0.06, 0, z0 - 0.5, bx + sd * bw + 0.06, 1.0, z1 + 0.5, { uv: 1 }); }
      }
      for (let i = 0; i < 14; i++) { const x = rng.range(5, W - 5); if (bxs.some((b) => Math.abs(x - b) < 2.5)) continue; for (let k = 0; k < 5; k++) w.batch.geo('leaf', PG().cone, Mx(x + rng.range(-0.6, 0.6), 0.5, (rng.chance(0.5) ? z0 : z1) + rng.range(-0.3, 0.3), 0.06, 1.0, 0.06, rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2))); }
    }
    // ---- the lanes: lamps, a cart, barrels; the open ground at both ends (the way in, the fields before the gates)
    for (let r = 0; r <= nR; r++) for (let c = 0; c < nC; c++) if (rng.chance(0.18) && !(layout === 'stream' && r === rs + 1)) { const x = ox + c * PITCH + rng.range(1, LOT - 1), z = oz + r * PITCH + zsh(r) - LANE / 2; if (z > oz && z < D - 13) F.lantern(w, x, z, '#ffb070'); }
    for (let i = 0; i < 2; i++) { const r = occ.place(rng, 5, 3, 0.5, 20); if (r) HM().cart(w, rng, r.x0 + 2.5, r.z0 + 1.5, true); }
    for (let i = 0; i < 8; i++) { const r = occ.place(rng, 2, 2, 0.4, 10); if (r) P().barrel(w, r.x0 + 0.8, r.z0 + 0.8, 0, rng, rng.chance(0.2)); }
    for (let i = 0; i < 3; i++) { const r = occ.place(rng, 2, 2, 1, 12); if (r && (r.z0 < oz - 1 || r.z0 > D - 13)) F.deadTree(w, r.x0 + 1, r.z0 + 1, rng, rng.range(0.9, 1.2)); }
    w.navLayers = 2;
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  // a house on lot q: walls with doors and windows, a room (what was left in it), the floor of the upper room and its stair (two storeys),
  // a flat roof (one storey) or a steep one (two); a ruin has broken walls and no roof
  function house(w, rng, q, h, ruin) {
    const { x0, z0, x1, z1 } = q, DH = 2.4, T = WT;
    const twoUp = h > R1 && !ruin, ws = rng.chance(0.5) ? 'W' : 'E';
    if (twoUp) { q.doors = q.doors.filter((d) => d.sd !== ws); if (!q.doors.length) { const m = (x0 + x1) / 2; q.doors.push({ sd: rng.chance(0.5) ? 'N' : 'S', a: m - 0.8, b: m + 0.8 }); } } // (the inner stair runs along that wall)
    const wallSide = (sd, x0w, z0w, x1w, z1w, a0, a1) => {
      const along = sd === 'N' || sd === 'S';
      const ds = q.doors.filter((d) => d.sd === sd).sort((p, r) => p.a - r.a);
      let s = a0;
      const piece = (a, b, y0, y1) => { if (b - a < 0.05 || y1 - y0 < 0.05) return; if (along) w.solid('wall', a, y0, z0w, b, y1, z1w, { uv: 2.5 }); else w.solid('wall', x0w, y0, a, x1w, y1, b, { uv: 2.5 }); };
      const top = (u) => (ruin ? Math.max(1.2, h * (0.45 + 0.55 * Math.abs(Math.sin(u * 1.7 + x0)))) : h);
      for (const d of ds) { for (let u = s; u < d.a - 0.01; u += 1.5) piece(u, Math.min(d.a, u + 1.5), 0, top(u)); piece(d.a, d.b, DH, Math.max(DH, top(d.a))); s = d.b; }
      for (let u = s; u < a1 - 0.01; u += 1.5) piece(u, Math.min(a1, u + 1.5), 0, top(u));
      // windows (dark panes with a sill)
      if (!ruin) for (let u = a0 + 1.6; u < a1 - 1.6; u += 3.2) {
        if (ds.some((d) => u + 0.6 > d.a - 0.3 && u - 0.6 < d.b + 0.3)) continue;
        for (const wy of h > R1 ? [1.3, 4.4] : [1.3]) {
          if (along) { const fz = sd === 'N' ? z0w - 0.02 : z1w; w.visual('dark', u - 0.5, wy, fz, u + 0.5, wy + 1.1, fz + 0.02, { uv: 1, grad: false }); }
          else { const fx = sd === 'W' ? x0w - 0.02 : x1w; w.visual('dark', fx, wy, u - 0.5, fx + 0.02, wy + 1.1, u + 0.5, { uv: 1, grad: false }); }
          // (its frame and the cross of its bars, a stone sill, a shutter hung open to each side)
          const out = sd === 'N' || sd === 'W' ? -1 : 1, f0 = along ? (sd === 'N' ? z0w : z1w) : (sd === 'W' ? x0w : x1w);
          const pc = (mk, ua, ub, ya, yb, d) => { const fa = Math.min(f0, f0 + out * d), fb = Math.max(f0, f0 + out * d); if (along) w.visual(mk, ua, ya, fa, ub, yb, fb, { uv: 1, grad: false }); else w.visual(mk, fa, ya, ua, fb, yb, ub, { uv: 1, grad: false }); };
          pc('woodDark', u - 0.58, u + 0.58, wy - 0.06, wy, 0.07); pc('woodDark', u - 0.58, u + 0.58, wy + 1.1, wy + 1.18, 0.07);
          pc('woodDark', u - 0.58, u - 0.5, wy, wy + 1.1, 0.07); pc('woodDark', u + 0.5, u + 0.58, wy, wy + 1.1, 0.07);
          pc('woodDark', u - 0.025, u + 0.025, wy, wy + 1.1, 0.045); pc('woodDark', u - 0.5, u + 0.5, wy + 0.62, wy + 0.67, 0.045);
          pc('trim', u - 0.66, u + 0.66, wy - 0.14, wy - 0.06, 0.13);
          pc('wood', u - 1.06, u - 0.6, wy - 0.02, wy + 1.14, 0.045); pc('wood', u + 0.6, u + 1.06, wy - 0.02, wy + 1.14, 0.045);
        }
      }
    };
    wallSide('N', 0, z0, 0, z0 + T, x0, x1); wallSide('S', 0, z1 - T, 0, z1, x0, x1);
    wallSide('W', x0, 0, x0 + T, 0, z0 + T, z1 - T); wallSide('E', x1 - T, 0, x1, 0, z0 + T, z1 - T);
    // ---- the timber frame, to look at: a plinth of stone under the wall (broken at the doors), posts at the corners and between, a plate
    // along the top of each storey - all a hand's breadth proud of the plaster. No dice are thrown for it.
    if (!ruin) {
      const side = (sd) => {
        const along = sd === 'N' || sd === 'S', out = sd === 'N' || sd === 'W' ? -1 : 1, f0 = sd === 'N' ? z0 : sd === 'S' ? z1 : sd === 'W' ? x0 : x1, a0 = along ? x0 : z0, a1 = along ? x1 : z1;
        const pc = (mk, ua, ub, ya, yb, d, uv) => { if (ub - ua < 0.02) return; const fa = Math.min(f0, f0 + out * d), fb = Math.max(f0, f0 + out * d); if (along) w.visual(mk, ua, ya, fa, ub, yb, fb, { uv: uv || 1.2, grad: false }); else w.visual(mk, fa, ya, ua, fb, yb, ub, { uv: uv || 1.2, grad: false }); };
        const ds = q.doors.filter((d) => d.sd === sd).sort((p2, r) => p2.a - r.a);
        let u = a0 - 0.06;
        for (const d of ds) { pc('trim', u, d.a - 0.12, 0, 0.5, 0.07, 1.5); u = d.b + 0.12; }
        pc('trim', u, a1 + 0.06, 0, 0.5, 0.07, 1.5);
        for (const d of ds) pc('woodDark', d.a - 0.2, d.b + 0.2, DH + 0.12, DH + 0.3, 0.1);                 // (a lintel over the door)
        pc('woodDark', a0 - 0.08, a1 + 0.08, h - 0.34, h - 0.1, 0.09);                                       // (the plate under the roof)
        if (h > R1) pc('woodDark', a0 - 0.08, a1 + 0.08, R1 - 0.1, R1 + 0.14, 0.09);                         // (the upper floor's beam)
        const n = Math.max(2, Math.round((a1 - a0) / 3.2));
        for (let i = 0; i <= n; i++) {
          const pu = i === 0 ? a0 + 0.02 : i === n ? a1 - 0.2 : a0 + (a1 - a0) * i / n - 0.09;
          if (ds.some((d) => pu + 0.18 > d.a - 0.05 && pu < d.b + 0.05)) continue;
          // (a post between two windows, not through one)
          let hit = false; for (let wu = a0 + (along ? 1.6 : T + 1.6); wu < a1 - 1.6; wu += 3.2) if (pu + 0.18 > wu - 1.08 && pu < wu + 1.08) hit = true;
          if (hit && i !== 0 && i !== n) continue;
          pc('woodDark', pu, pu + 0.18, 0.5, h - 0.34, 0.085);
        }
      };
      side('N'); side('S'); side('W'); side('E');
    }
    for (const d of q.doors) { // the door frames
      if (d.sd === 'N' || d.sd === 'S') { const z = d.sd === 'N' ? z0 - 0.04 : z1; w.visual('woodDark', d.a - 0.12, 0, z, d.a, DH + 0.12, z + 0.04, { uv: 1 }); w.visual('woodDark', d.b, 0, z, d.b + 0.12, DH + 0.12, z + 0.04, { uv: 1 }); w.visual('woodDark', d.a - 0.12, DH, z, d.b + 0.12, DH + 0.14, z + 0.04, { uv: 1 }); }
      else { const x = d.sd === 'W' ? x0 - 0.04 : x1; w.visual('woodDark', x, 0, d.a - 0.12, x + 0.04, DH + 0.12, d.a, { uv: 1 }); w.visual('woodDark', x, 0, d.b, x + 0.04, DH + 0.12, d.b + 0.12, { uv: 1 }); w.visual('woodDark', x, DH, d.a - 0.12, x + 0.04, DH + 0.14, d.b + 0.12, { uv: 1 }); }
    }
    const ix0 = x0 + T, iz0 = z0 + T, ix1 = x1 - T, iz1 = z1 - T;
    w.visual('wood', ix0, 0, iz0, ix1, 0.03, iz1, { uv: 2, grad: false });
    // what is left in the room
    const free = (x, z) => !q.doors.some((d) => (d.sd === 'N' && Math.abs(z - iz0) < 2 && x > d.a - 1 && x < d.b + 1) || (d.sd === 'S' && Math.abs(z - iz1) < 2 && x > d.a - 1 && x < d.b + 1) || (d.sd === 'W' && Math.abs(x - ix0) < 2 && z > d.a - 1 && z < d.b + 1) || (d.sd === 'E' && Math.abs(x - ix1) < 2 && z > d.a - 1 && z < d.b + 1));
    if (rng.chance(0.7) && free(ix0 + 2.5, (iz0 + iz1) / 2)) P().table(w, ix0 + 2.5, (iz0 + iz1) / 2, 0, false, rng);
    if (rng.chance(0.5) && free(ix1 - 0.6, iz0 + 2)) P().bookshelf(w, ix1, iz0 + 2, 0, false, rng);
    if (rng.chance(0.5) && free(ix1 - 1, iz1 - 1)) P().barrel(w, ix1 - 0.8, iz1 - 0.8, 0, rng);
    if (rng.chance(0.4)) P().bones(w, (ix0 + ix1) / 2 + 0.8, 0.02, (iz0 + iz1) / 2 - 1.2, rng);
    if (!ruin) w.addLight((ix0 + ix1) / 2, 2.3, (iz0 + iz1) / 2, { flame: 0.4, intensity: 3.5, range: 7, color: '#ffa860', prio: 0.45 });
    if (ruin) { for (let k = 0; k < 3; k++) P().rubble(w, rng.range(ix0 + 1, ix1 - 1), 0, rng.range(iz0 + 1, iz1 - 1), rng, rng.range(0.8, 1.4)); return; }
    if (!twoUp) {
      // the flat roof (walkable), its edge a little proud of the walls
      w.solid('woodDark', x0 - 0.1, R1, z0 - 0.1, x1 + 0.1, R1 + 0.25, z1 + 0.1, { uv: 2 });
      return;
    }
    // two storeys: the upper floor (a stair up along the inside of the west or east wall, its well left open), the steep roof over it
    const sx = ws === 'W' ? ix0 + 0.7 : ix1 - 0.7, run = LG.stairsLen(R1 - 0.2), sz = iz1 - 0.3 - run;
    H.stairs(w, 'N', sz + run, sx, 1.2, 0, R1 - 0.2, 'wood');
    const hx0 = ws === 'W' ? ix0 : ix1 - 1.5, hx1 = ws === 'W' ? ix0 + 1.5 : ix1, hz0 = sz - 0.2, hz1 = iz1;
    // the upper floor round the stair well
    w.solid('wood', ix0, R1 - 0.2, iz0, ix1, R1, hz0, { uv: 2 });
    w.solid('wood', ws === 'W' ? hx1 : ix0, R1 - 0.2, hz0, ws === 'W' ? ix1 : hx0, R1, iz1, { uv: 2 });
    w.platTops.push({ x0: ix0 + 0.5, z0: iz0 + 0.5, x1: ix1 - 0.5, z1: hz0 - 0.5, y: R1, cx: (ix0 + ix1) / 2, cz: (iz0 + hz0) / 2 });
    w.addLight((ix0 + ix1) / 2, R1 + 2.2, (iz0 + iz1) / 2, { flame: 0.4, intensity: 3, range: 7, color: '#ffa860', prio: 0.4 });
    // the roof: a ceiling slab and the two pitches over it
    w.solid('woodDark', x0 - 0.1, h - 0.25, z0 - 0.1, x1 + 0.1, h, z1 + 0.1, { uv: 2, noGrapple: true });
    const along = (x1 - x0) >= (z1 - z0), cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
    if (along) for (const s of [-1, 1]) w.batch.geo('woodDark', PG().box, Mx(cxm, h + 1.0, czm + s * (z1 - z0) / 4, x1 - x0 + 0.5, 0.18, (z1 - z0) / 2 * 1.16, s * 0.55, 0, 0));
    else for (const s of [-1, 1]) w.batch.geo('woodDark', PG().box, Mx(cxm + s * (x1 - x0) / 4, h + 1.0, czm, (x1 - x0) / 2 * 1.16, 0.18, z1 - z0 + 0.5, 0, 0, -s * 0.55));
    w.addCollider(x0, h, z0, x1, h + 2.1, z1, { noGrapple: true });
    // ---- the gable walls under the two pitches, a ridge beam, a chimney of stone (to look at)
    {
      const hw = (along ? z1 - z0 : x1 - x0) / 2, rise = hw * 0.62, len = along ? x1 - x0 : z1 - z0;
      if (!house.tri) { const sh = new THREE.Shape(); sh.moveTo(-1, 0); sh.lineTo(1, 0); sh.lineTo(0, 1); sh.closePath(); house.tri = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, steps: 1 }); house.tri.translate(0, 0, -0.5); house.tri.userData.shared = true; }
      for (const e of [-1, 1]) {
        if (along) w.batch.geo('wall', house.tri, Mx(cxm + e * (len / 2 - 0.16), h, czm, hw - 0.05, rise - 0.12, 0.3, 0, Math.PI / 2, 0), { su: 2, sv: 1.2 });
        else w.batch.geo('wall', house.tri, Mx(cxm, h, czm + e * (len / 2 - 0.16), hw - 0.05, rise - 0.12, 0.3, 0, 0, 0), { su: 2, sv: 1.2 });
      }
      if (along) w.visual('woodDark', x0 - 0.3, h + rise - 0.22, czm - 0.11, x1 + 0.3, h + rise + 0.04, czm + 0.11, { uv: 1.2, grad: false });
      else w.visual('woodDark', cxm - 0.11, h + rise - 0.22, z0 - 0.3, cxm + 0.11, h + rise + 0.04, z1 + 0.3, { uv: 1.2, grad: false });
      // (which end the chimney stands at: by where the house is, not by a throw of the dice)
      const ce = (Math.round(x0 * 7 + z0 * 3) % 2) ? 1 : -1, kx = along ? cxm + ce * (len / 2 - 1.3) : cxm + 0.9, kz = along ? czm + 0.9 : czm + ce * (len / 2 - 1.3);
      w.visual('block', kx - 0.42, h - 0.2, kz - 0.42, kx + 0.42, h + rise + 0.9, kz + 0.42, { uv: 1.4 });
      w.visual('trim', kx - 0.52, h + rise + 0.9, kz - 0.52, kx + 0.52, h + rise + 1.05, kz + 0.52, { uv: 1 });
      for (const [ox, oz] of [[-0.18, -0.18], [0.18, 0.18]]) w.batch.geo('dark', PG().cyl8, Mx(kx + ox, h + rise + 1.22, kz + oz, 0.11, 0.34, 0.11), { tint: [0.5, 0.3, 0.22] });
    }
  }
  F.gen.hamlet = genHamlet;
})();
