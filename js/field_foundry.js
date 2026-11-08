'use strict';
// 溶鉱の深層 (foundry, the middle tier), on a framework of its own: a works over a lake of molten iron, and its machines still run.
// There is no floor: iron-plated work bays stand up out of the glowing melt at two heights, joined by catwalks (always a way across),
// and between them the machines move: carriages that shuttle across a gap and back, lifts that rise from a low bay to a high one,
// belts that carry whoever stands on them. Fall in and the heat throws you back to where you stood (15% of your HP). The hanging
// crucibles (gimmick_b.js) still pour over the low bays. Way in at the south, the gates on the landing at the north.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const FO = () => F._foundry;
  const HT = 18, UP = 3.5, MELT = -5;

  function genFoundry(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const BS = 10, GAP = 4, PITCH = BS + GAP, nC = 5, nR = 5, ox = 4, oz = 15;
    const W = Math.ceil(ox * 2 + nC * PITCH - GAP), D = Math.ceil(oz + nR * PITCH - GAP + 13);
    const w = new G.World(W, D, 'foundry');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    w.killY = -8;
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'foundry', ['works', 'gantries', 'belts']);
    w.layout = layout;
    const pz0 = oz - 2, pz1 = oz + nR * PITCH - GAP + 2;
    // ---- the landings, the melt below everything else
    w.solid('floor', 0, -1, 0, W, 0, pz0, { uv: 4 }); w.solid('rock', 0, -14, 0, W, -1, pz0, { uv: 6, grad: false });
    w.solid('floor', 0, -1, pz1, W, 0, D, { uv: 4 }); w.solid('rock', 0, -14, pz1, W, -1, D, { uv: 6, grad: false });
    w.visual('lava', 0, MELT - 0.1, pz0, W, MELT, pz1, { uv: 4, grad: false, skip: { bottom: true } });
    for (let x = 6; x < W; x += 13) for (let z = pz0 + 5; z < pz1; z += 13) w.addLight(x, MELT + 1.5, z, { flame: 0, intensity: 14, range: 15, color: '#ff6a20', emit: false, prio: 0.7 });
    w.solid('trim', 0, -0.4, pz0 - 0.4, W, 0.2, pz0, { uv: 1 }); w.solid('trim', 0, -0.4, pz1, W, 0.2, pz1 + 0.4, { uv: 1 });
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT + 2, beams: 0 });
    w.solid('rock', -3, HT, -3, W + 3, HT + 2, D + 3, { uv: 6, noGrapple: true, grad: false });
    // ---- the bays (low ones at the landings' height, high ones on gantries), the catwalks of a tree over them
    const bays = [];
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) {
      const hi = r > 0 && r < nR - 1 && rng.chance(layout === 'gantries' ? 0.55 : 0.3);
      bays.push({ c, r, x0: ox + c * PITCH, z0: oz + r * PITCH, x1: ox + c * PITCH + BS, z1: oz + r * PITCH + BS, y: hi ? UP : 0 });
    }
    const Bay = (c, r) => (c < 0 || r < 0 || c >= nC || r >= nR ? null : bays[r * nC + c]);
    for (const b of bays) {
      w.solid('iron', b.x0, -12, b.z0, b.x1, b.y - 0.3, b.z1, { uv: 3 });
      w.solid('iron', b.x0 - 0.1, b.y - 0.3, b.z0 - 0.1, b.x1 + 0.1, b.y, b.z1 + 0.1, { uv: 2, surf: 'metal' });
      for (const [x, z] of [[b.x0 + 0.4, b.z0 + 0.4], [b.x1 - 0.4, b.z0 + 0.4], [b.x0 + 0.4, b.z1 - 0.4], [b.x1 - 0.4, b.z1 - 0.4]]) w.visual('glow', x - 0.08, b.y - 0.28, z - 0.08, x + 0.08, b.y - 0.27, z + 0.08, { uv: 1, grad: false, tint: [1, 0.4, 0.1] });
      if (b.y > 0) for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x1 - 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z1 - 1]]) w.visual('iron', x - 0.3, MELT, z - 0.3, x + 0.3, b.y - 0.3, z + 0.3, { uv: 1 });
      w.platTops.push({ x0: b.x0 + 1, z0: b.z0 + 1, x1: b.x1 - 1, z1: b.z1 - 1, y: b.y, cx: (b.x0 + b.x1) / 2, cz: (b.z0 + b.z1) / 2 });
    }
    const links = new Set(), lk = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    { const seen = new Set([0]), st = [0]; while (st.length) { const i = st[st.length - 1], c = i % nC, r = (i / nC) | 0; const nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b2]) => Bay(a, b2) && !seen.has(b2 * nC + a)); if (!nb.length) { st.pop(); continue; } const [a, b2] = rng.pick(nb); const j = b2 * nC + a; seen.add(j); links.add(lk(i, j)); st.push(j); } }
    const walks = [];
    const catwalk = (x0, z0, x1, z1, y) => {
      w.solid('iron', x0, y - 0.25, z0, x1, y, z1, { uv: 1, tag: 'bridge', surf: 'metal' });
      const ax = x1 - x0 > z1 - z0;
      for (const s of [0, 1]) { if (ax) w.solid('iron', x0, y, s ? z1 - 0.08 : z0, x1, y + 1.0, s ? z1 : z0 + 0.08, { uv: 1 }); else w.solid('iron', s ? x1 - 0.08 : x0, y, z0, s ? x1 : x0 + 0.08, y + 1.0, z1, { uv: 1 }); }
      walks.push({ x0, z0, x1, z1, y, ax });
    };
    // where two joined bays differ in height, a stair on the low one runs up to the catwalk's level along the edge they share
    const joinBays = (a, b) => {
      const y = Math.max(a.y, b.y), wd = 1.8, lo = a.y < b.y ? a : b.y < a.y ? b : null;
      if (lo) lo.stairs = true; // (no crucible over a bay with a stair in it: its pour wants the floor clear)
      if (a.r === b.r) {
        const [l, rr] = a.c < b.c ? [a, b] : [b, a], z = rng.range(Math.max(l.z0, rr.z0) + 2.5, Math.min(l.z1, rr.z1) - 2.5);
        catwalk(l.x1, z - wd / 2, rr.x0, z + wd / 2, y);
        if (lo) { const run = LG.stairsLen(UP); if (lo === l) H.stairs(w, 'W', l.x1, z, wd, 0, UP, 'iron'); else H.stairs(w, 'E', rr.x0, z, wd, 0, UP, 'iron'); occ.mark(lo === l ? l.x1 - run - 0.5 : rr.x0, z - 1.5, lo === l ? l.x1 : rr.x0 + run + 0.5, z + 1.5); }
      } else {
        const [t, bt] = a.r < b.r ? [a, b] : [b, a], x = rng.range(Math.max(t.x0, bt.x0) + 2.5, Math.min(t.x1, bt.x1) - 2.5);
        catwalk(x - wd / 2, t.z1, x + wd / 2, bt.z0, y);
        if (lo) { const run = LG.stairsLen(UP); if (lo === t) H.stairs(w, 'N', t.z1, x, wd, 0, UP, 'iron'); else H.stairs(w, 'S', bt.z0, x, wd, 0, UP, 'iron'); occ.mark(x - 1.5, lo === t ? t.z1 - run - 0.5 : bt.z0, x + 1.5, lo === t ? t.z1 : bt.z0 + run + 0.5); }
      }
    };
    for (const key of links) { const [i, j] = key.split(':').map(Number); joinBays(bays[i], bays[j]); }
    // the landings: catwalks from each landing to two or three bays of the row by it (those stand low)
    for (const [r, zA, zB] of [[0, pz0, oz], [nR - 1, oz + (nR - 1) * PITCH + BS, pz1]]) {
      for (const c of U.shuffle([...Array(nC).keys()], () => rng.next()).slice(0, 3)) { const b = Bay(c, r), x = rng.range(b.x0 + 2.5, b.x1 - 2.5); catwalk(x - 1, Math.min(zA, zB), x + 1, Math.max(zA, zB), 0); }
    }
    // ---- the machines in the other gaps: shuttles between bays of a height, lifts from a low bay to a high one
    w.movers = [];
    for (let r = 0; r < nR; r++) for (let c = 0; c < nC; c++) for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const a = Bay(c, r), b = Bay(c + dc, r + dr); if (!b || links.has(lk(r * nC + c, (r + dr) * nC + c + dc)) || !rng.chance(0.55)) continue;
      const S = 3;
      if (a.y === b.y) {
        // a carriage: a plate on a rail that runs across the gap and back (a stop at each end)
        if (dc) { const z = rng.range(Math.max(a.z0, b.z0) + 2.5, Math.min(a.z1, b.z1) - 2.5); mover(w, a.x1 - S, z - S / 2, a.x1, z + S / 2, a.y, GAP + S, 0, 0, rng); }
        else { const x = rng.range(Math.max(a.x0, b.x0) + 2.5, Math.min(a.x1, b.x1) - 2.5); mover(w, x - S / 2, a.z1 - S, x + S / 2, a.z1, a.y, 0, 0, GAP + S, rng); }
      } else {
        // a lift in the gap: from the low bay's height up to the high bay's, and down again
        const lo = a.y < b.y ? a : b;
        if (dc) { const z = rng.range(Math.max(a.z0, b.z0) + 2.5, Math.min(a.z1, b.z1) - 2.5); mover(w, a.x1 + 0.5, z - S / 2, b.x0 - 0.5, z + S / 2, lo.y, 0, UP, 0, rng); }
        else { const x = rng.range(Math.max(a.x0, b.x0) + 2.5, Math.min(a.x1, b.x1) - 2.5); mover(w, x - S / 2, a.z1 + 0.5, x + S / 2, b.z0 - 0.5, lo.y, 0, UP, 0, rng); }
      }
    }
    // belts: some catwalks carry you along (you can walk against them)
    w.belts = [];
    for (const k of walks) if (rng.chance(layout === 'belts' ? 0.6 : 0.25)) {
      const s = rng.chance(0.5) ? 1 : -1, b = { x0: k.x0, z0: k.z0, x1: k.x1, z1: k.z1, y: k.y, dx: k.ax ? s : 0, dz: k.ax ? 0 : s, sp: 3.2 };
      w.belts.push(b);
      for (let u = 0; u < (k.ax ? k.x1 - k.x0 : k.z1 - k.z0); u += 0.8) { if (k.ax) w.visual('dark', k.x0 + u, k.y, k.z0 + 0.15, k.x0 + u + 0.4, k.y + 0.02, k.z1 - 0.15, { uv: 1, grad: false }); else w.visual('dark', k.x0 + 0.15, k.y, k.z0 + u, k.x1 - 0.15, k.y + 0.02, k.z0 + u + 0.4, { uv: 1, grad: false }); }
      w.visual('glow', k.ax ? (s > 0 ? k.x1 - 0.3 : k.x0) : k.x0 + 0.6, k.y + 0.02, k.ax ? k.z0 + 0.6 : (s > 0 ? k.z1 - 0.3 : k.z0), k.ax ? (s > 0 ? k.x1 : k.x0 + 0.3) : k.x1 - 0.6, k.y + 0.04, k.ax ? k.z1 - 0.6 : (s > 0 ? k.z1 : k.z0 + 0.3), { uv: 1, grad: false, tint: [1, 0.6, 0.2] });
    }
    // ---- on the bays: furnaces, molds, anvils, coal; the crucibles over the low bays
    let live = 0;
    for (const b of U.shuffle(bays.slice(), () => rng.next())) {
      const t = rng.next(), x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
      if (b.y === 0 && !b.stairs && G.Gim && live < 2 && b.r > 0 && b.r < nR - 1) { G.Gim.addCrucible(w, x - 1, rng.range(6, 8), z, HT); live++; b.cru = true; occ.mark(b.x0 + 1, b.z0 + 1, b.x1 - 1, b.z1 - 1); w.platTops = w.platTops.filter((t) => !(t.cx > b.x0 && t.cx < b.x1 && t.cz > b.z0 && t.cz < b.z1)); continue; } // (its pour wants the floor clear: no chest there)
      if (t < 0.3) smelter(w, rng, b.x0 + 1, b.z0 + 1, b.y);
      else if (t < 0.55) { w.solid('iron', x - 3, b.y, z - 1.5, x + 3, b.y + 0.45, z + 1.5, { uv: 1 }); for (let u = x - 2.5; u < x + 2.5; u += 1.4) w.visual(rng.chance(0.5) ? 'lava' : 'dark', u, b.y + 0.45, z - 1.1, u + 1.0, b.y + 0.47, z + 1.1, { uv: 1, grad: false }); }
      else if (t < 0.75) { for (let k = 0; k < rng.int(3, 6); k++) w.solid(rng.chance(0.3) ? 'gold' : 'iron', x - 0.8, b.y + k * 0.22, z - 0.3 + (k % 2) * 0.4, x + 0.8, b.y + k * 0.22 + 0.2, z + 0.1 + (k % 2) * 0.4, { uv: 1 }); }
      else if (rng.chance(0.5) && G.Fields) G.Fields.add(w, 'vent', x - 1.2, z - 1.2, x + 1.2, z + 1.2, { y: b.y });
      if (rng.chance(0.5)) P().barrel(w, b.x1 - 1.2, b.z1 - 1.2, b.y, rng, rng.chance(0.4));
      if (rng.chance(0.6)) P().brazier(w, b.x0 + 1.2, b.y, b.z1 - 1.2, 0.8, true);
    }
    for (let i = 0; i < 6; i++) { const x = rng.range(6, W - 6), z = rng.range(pz0, pz1); w.batch.geo('iron', PG().cyl8, new THREE.Matrix4().compose(V(x, HT - 5, z), new THREE.Quaternion(), V(0.12, 10, 0.12))); }
    for (let x = 10; x < W - 6; x += 12) { P().pillarSquare(w, x, 5.5, 0, HT, 1.1); P().torch(w, x, 3.4, 6.2, 'pz'); }
    // what is laid afterwards goes on the bays and the landings only
    occ.mark(0, pz0, W, pz1, 2);
    for (const b of bays) if (!b.cru) occ.mark(b.x0 + 0.5, b.z0 + 0.5, b.x1 - 0.5, b.z1 - 0.5, 0);
    w.groundTop = (x, z) => { if (z < pz0 || z > pz1) return 0; const b = bays.find((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1); return b ? b.y : null; };
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  // a small smelter on a bay: a brick stack with a glowing mouth and its chimney up into the dark
  function smelter(w, rng, x, z, y) {
    w.solid('block', x, y, z, x + 3.2, y + 3.4, z + 3.2, { uv: 2 });
    w.visual('glow', x + 1.0, y + 0.4, z + 3.2, x + 2.2, y + 1.5, z + 3.24, { uv: 1, grad: false, tint: [1, 0.45, 0.1] });
    w.solid('block', x + 0.9, y + 3.4, z + 0.9, x + 2.3, HT, z + 2.3, { uv: 2, noGrapple: true });
    w.addLight(x + 1.6, y + 1.2, z + 4, { flame: 0.6, intensity: 8, range: 9, color: '#ff7a30', prio: 0.9 });
  }
  // a moving plate: (x0..x1, z0..z1) at y, travelling (dx, dy, dz) and back, stopping at each end; carries what stands on it
  function mover(w, x0, z0, x1, z1, y, dx, dy, dz, rng) {
    // (its collider is filed in the spatial hash over its whole travel, then set to where it is)
    const col = w.addCollider(Math.min(x0, x0 + dx), y - 0.35, Math.min(z0, z0 + dz), Math.max(x1, x1 + dx), y + Math.max(0, dy), Math.max(z1, z1 + dz), { surf: 'metal', noGrapple: true });
    col.x0 = x0; col.x1 = x1; col.z0 = z0; col.z1 = z1; col.y0 = y - 0.35; col.y1 = y;
    col.navIgnore = true; col.noFire = true; col.tag = 'bridge';
    const m = { col, x0, z0, x1, z1, y, dx, dy, dz, ox: 0, oy: 0, oz: 0, t: rng.range(0, 10), period: dy ? 9 : 7.5, mesh: null };
    w.movers.push(m);
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      const plate = new THREE.Mesh(PG().box, w.mats.iron); plate.scale.set(x1 - x0, 0.35, z1 - z0); plate.position.y = -0.175; g.add(plate);
      const rim = new THREE.Mesh(PG().box, new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xff6a20, emissiveIntensity: 0.8 })); rim.scale.set(x1 - x0 + 0.06, 0.06, z1 - z0 + 0.06); rim.position.y = -0.33; g.add(rim);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const ch = new THREE.Mesh(PG().cyl8, w.mats.iron); ch.scale.set(0.06, dy ? 30 : 0.6, 0.06); ch.position.set(sx * ((x1 - x0) / 2 - 0.2), dy ? 15 : 0.3, sz * ((z1 - z0) / 2 - 0.2)); g.add(ch); }
      g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); grp.add(g); m.mesh = g;
    });
    // its rail / its shaft (visual)
    if (!dy) w.visual('iron', Math.min(x0, x0 + dx) + (x1 - x0) / 2 - 0.1, y - 0.6, Math.min(z0, z0 + dz) + (z1 - z0) / 2 - 0.1, Math.max(x1, x1 + dx) - (x1 - x0) / 2 + 0.1, y - 0.45, Math.max(z1, z1 + dz) - (z1 - z0) / 2 + 0.1, { uv: 1 });
    return m;
  }
  // the machines at work: the movers' ping-pong (a stop at each end), the belts
  const ease = (k) => k * k * (3 - 2 * k);
  F.tickMovers = function (w, dt) {
    const Pl = G.player, hw = Pl ? Pl.hw : 0.3;
    for (const m of w.movers) {
      m.t += dt;
      const ph = (m.t / m.period) % 1, k = ph < 0.2 ? 0 : ph < 0.5 ? ease((ph - 0.2) / 0.3) : ph < 0.7 ? 1 : ease(1 - (ph - 0.7) / 0.3);
      const nx = m.dx * k, ny = m.dy * k, nz = m.dz * k, ddx = nx - m.ox, ddy = ny - m.oy, ddz = nz - m.oz;
      if (!ddx && !ddy && !ddz) continue;
      const c = m.col, top0 = c.y1;
      const on = (p, r) => p.x > c.x0 - r && p.x < c.x1 + r && p.z > c.z0 - r && p.z < c.z1 + r && Math.abs(p.y - top0) < 0.2;
      const ride = Pl && !Pl.dead && Pl.grounded && on(Pl.pos, hw * 0.6);
      const foes = G.enemies.list.filter((e) => e.alive && !e._rep && !e.def.flyer && on(e.pos, 0.2));
      c.x0 = m.x0 + nx; c.x1 = m.x1 + nx; c.z0 = m.z0 + nz; c.z1 = m.z1 + nz; c.y0 = m.y - 0.35 + ny; c.y1 = m.y + ny;
      m.ox = nx; m.oy = ny; m.oz = nz;
      if (m.mesh) m.mesh.position.set((m.x0 + m.x1) / 2 + nx, m.y + ny, (m.z0 + m.z1) / 2 + nz);
      if (ride) { Pl.pos.x += ddx; Pl.pos.z += ddz; Pl.pos.y = c.y1; }
      for (const e of foes) { e.pos.x += ddx; e.pos.z += ddz; e.pos.y = c.y1; }
    }
    // belts: whoever stands on one is carried along it (through the world's own movement, so walls still stop you)
    if (Pl && !Pl.dead && Pl.grounded && w.belts) for (const b of w.belts) {
      if (Pl.pos.x > b.x0 && Pl.pos.x < b.x1 && Pl.pos.z > b.z0 && Pl.pos.z < b.z1 && Math.abs(Pl.pos.y - b.y) < 0.2) {
        w.pp = true; try { w.moveBox(Pl.pos, V(b.dx * b.sp, 0, b.dz * b.sp), dt, Pl.hw, Pl.height, { canStep: true }); } finally { w.pp = false; }
        break;
      }
    }
  };
  F.gen.foundry = genFoundry;
})();
