'use strict';
// 地下墓所 (catacombs, the entrance tier), on a framework of its own: two layers, one under the other.
//   Above: a maze of low passages walled with bones (a ceiling just over your head), small burial chambers on its corners.
//   Below: the great ossuary, a dark vaulted crypt under the whole middle of the maze, its piers standing right under the maze's.
// Where the maze's floor has fallen in you drop into the crypt; the wells in the burial chambers have stairs down (and back up).
// The iron gates in the passages still shut (the key) and must be battered down. You come down into the stair hall at the south and
// leave through the vestibule with the gates at the north.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const CR = () => F._crypt;
  const CELL = 5.5, WT = 1.2, HT = 4.6, LOW = -4.5, SLAB = 0.3;

  function genCatacombs(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const cols = 12 + rng.int(0, 1), rows = 10 + rng.int(0, 2), oz = 18;
    const W = Math.ceil(cols * CELL + 6), D = Math.ceil(oz + rows * CELL + 11);
    const ox = (W - cols * CELL) / 2;
    const w = new G.World(W, D, 'catacombs');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'catacombs', ['ossuary', 'wells', 'collapse']);
    w.layout = layout;
    // ---- the maze: a tree of passages with a few loops, some 2 x 2 burial chambers
    const id = (c, r) => r * cols + c, open = new Set(), key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    const seen = new Uint8Array(cols * rows), stack = [[Math.floor(cols / 2), rows - 1]]; seen[id(...stack[0])] = 1;
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && !seen[id(a, b)]);
      if (!nb.length) { stack.pop(); continue; }
      const [a, b] = rng.pick(nb); seen[id(a, b)] = 1; open.add(key(id(c, r), id(a, b))); stack.push([a, b]);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (c + 1 < cols && rng.chance(0.14)) open.add(key(id(c, r), id(c + 1, r))); if (r + 1 < rows && rng.chance(0.14)) open.add(key(id(c, r), id(c, r + 1))); }
    // the crypt lies under the inner cells (not the outer ring)
    const inCrypt = (c, r) => c >= 1 && c <= cols - 2 && r >= 1 && r <= rows - 2;
    const rooms = [];
    for (let t = 0; t < 40 && rooms.length < (layout === 'wells' ? 4 : 3); t++) {
      const c = rng.int(1, cols - 3), r = rng.int(1, rows - 3);
      if (rooms.some((q) => Math.abs(q.c - c) < 4 && Math.abs(q.r - r) < 4)) continue;
      rooms.push({ c, r, well: rooms.length < (layout === 'wells' ? 3 : 2) });
      open.add(key(id(c, r), id(c + 1, r))); open.add(key(id(c, r + 1), id(c + 1, r + 1))); open.add(key(id(c, r), id(c, r + 1))); open.add(key(id(c + 1, r), id(c + 1, r + 1)));
    }
    const inRoom = (c, r) => rooms.find((q) => c >= q.c && c <= q.c + 1 && r >= q.r && r <= q.r + 1);
    // fallen floor: dead ends over the crypt (a pit there costs no way through)
    const degree = (c, r) => [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && open.has(key(id(c, r), id(a, b)))).length;
    const holes = new Set();
    const nHoles = layout === 'collapse' ? 7 : 3;
    for (let t = 0; t < 200 && holes.size < nHoles; t++) {
      const c = rng.int(1, cols - 2), r = rng.int(1, rows - 2);
      if (!inCrypt(c, r) || inRoom(c, r) || degree(c, r) !== 1 || holes.has(id(c, r))) continue;
      holes.add(id(c, r));
    }
    // ---- the floors: the maze's (a thin slab over the crypt, solid ground elsewhere), the crypt's
    const cx0 = (c) => ox + c * CELL, cz0 = (r) => oz + r * CELL;
    w.solid('floor', 0, -1, 0, W, 0, oz, { uv: 4 }); w.solid('floor', 0, -1, oz + rows * CELL, W, 0, D, { uv: 4 });
    w.solid('floor', 0, -1, oz, ox, 0, oz + rows * CELL, { uv: 4 }); w.solid('floor', ox + cols * CELL, -1, oz, W, 0, oz + rows * CELL, { uv: 4 });
    const holeR = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = cx0(c), z0 = cz0(r), x1 = x0 + CELL, z1 = z0 + CELL;
      if (!inCrypt(c, r)) { w.solid(rng.chance(0.5) ? 'floor' : 'cobble', x0, -1, z0, x1, 0, z1, { uv: 4 }); continue; }
      const room = inRoom(c, r);
      let hole = null;
      if (holes.has(id(c, r))) hole = { x0: x0 + WT / 2 + 0.2, z0: z0 + WT / 2 + 0.2, x1: x1 - WT / 2 - 0.2, z1: z1 - WT / 2 - 0.2 };
      else if (room && room.well && room.c === c && room.r === r) hole = { x0: x0 + WT / 2 + 0.4, z0: z0 + WT / 2 + 0.4, x1: x0 + 2 * CELL - WT / 2 - 0.4, z1: z0 + 2 * CELL - WT / 2 - 0.4, well: true };
      if (room && room.well && !(room.c === c && room.r === r)) hole = 'in-well';
      if (hole === 'in-well') { // (the parts of a chamber round its well: slab only where the well does not reach)
        const q = room, hx0 = cx0(q.c) + WT / 2 + 0.4, hz0 = cz0(q.r) + WT / 2 + 0.4, hx1 = cx0(q.c) + 2 * CELL - WT / 2 - 0.4, hz1 = cz0(q.r) + 2 * CELL - WT / 2 - 0.4;
        slabAround(w, x0, z0, x1, z1, hx0, hz0, hx1, hz1);
        continue;
      }
      if (!hole) { w.solid('floor', x0, -SLAB, z0, x1, 0, z1, { uv: 4 }); continue; }
      slabAround(w, x0, z0, x1, z1, hole.x0, hole.z0, hole.x1, hole.z1);
      holeR.push(hole);
    }
    // the crypt: its floor, its outer walls lined with bones, the piers under the maze's, a vault of shadow
    const kx0 = cx0(1), kz0 = cz0(1), kx1 = cx0(cols - 1), kz1 = cz0(rows - 1);
    w.solid('cobble', kx0, LOW - 1, kz0, kx1, LOW, kz1, { uv: 3 });
    w.solid('rock', kx0, -14, kz0, kx1, LOW - 1, kz1, { uv: 6, grad: false });
    for (const [a, b, c2, d] of [[kx0 - 1, kz0 - 1, kx1 + 1, kz0], [kx0 - 1, kz1, kx1 + 1, kz1 + 1], [kx0 - 1, kz0, kx0, kz1], [kx1, kz0, kx1 + 1, kz1]]) w.solid('wall', a, LOW - 1, b, c2, -SLAB, d, { uv: 2.5 });
    for (let c = 1; c <= cols - 1; c++) for (let r = 1; r <= rows - 1; r++) {
      const x = cx0(c), z = cz0(r);
      if (c === 1 || c === cols - 1 || r === 1 || r === rows - 1) continue;
      if (holeR.some((h) => x > h.x0 - 0.4 && x < h.x1 + 0.4 && z > h.z0 - 0.4 && z < h.z1 + 0.4)) continue;
      w.solid('block', x - 0.55, LOW, z - 0.55, x + 0.55, -SLAB, z + 0.55, { uv: 2 });
      w.visual('trim', x - 0.75, -SLAB - 0.35, z - 0.75, x + 0.75, -SLAB, z + 0.75, { uv: 1 });
    }
    for (let x = kx0 + 0.5; x < kx1 - 1; x += 3.3) { CR().ossuary(w, rng, x, x + 3.2, kz0, true, 1, LOW); CR().ossuary(w, rng, x, x + 3.2, kz1, true, -1, LOW); }
    for (let z = kz0 + 0.5; z < kz1 - 1; z += 3.3) { CR().ossuary(w, rng, z, z + 3.2, kx0, false, 1, LOW); CR().ossuary(w, rng, z, z + 3.2, kx1, false, -1, LOW); }
    // in the crypt: rows of coffins, heaps of bones, candles of a cold light, an altar under each well
    for (let i = 0; i < 18; i++) {
      const x = rng.range(kx0 + 2, kx1 - 2), z = rng.range(kz0 + 2, kz1 - 2);
      if (holeR.some((h) => x > h.x0 - 1.5 && x < h.x1 + 1.5 && z > h.z0 - 1.5 && z < h.z1 + 1.5)) continue;
      const t = rng.next();
      if (t < 0.4) P().sarcophagus(w, x, z, LOW, rng.chance(0.5), rng);
      else if (t < 0.75) P().bones(w, x, LOW + 0.02, z, rng);
      else P().urn(w, x, z, LOW, rng);
    }
    for (let x = kx0 + 4; x < kx1 - 2; x += 11) for (let z = kz0 + 4; z < kz1 - 2; z += 11) w.addLight(x, LOW + 2.5, z, { flame: 0.3, intensity: 7, range: 11, color: '#7ad0b0', prio: 0.7 });
    // the wells: a stair down one side, the rim railed where the stair is not
    for (const h of holeR) {
      if (!h.well) {
        for (let k = 0; k < 5; k++) P().rubble(w, rng.range(h.x0, h.x1), LOW, rng.range(h.z0, h.z1), rng, rng.range(0.8, 1.4), 'rock');
        continue;
      }
      const sx = h.x0 + 1.3;
      H.stairs(w, 'S', h.z0, sx, 2.2, LOW, 0, 'trim');
      for (const [a, b] of [[h.z0 + 0.2, h.z1]]) w.solid('wall', h.x1 - 0.3, 0, a, h.x1, 0.9, b, { uv: 1.5 });
      w.solid('wall', sx + 1.2, 0, h.z1 - 0.3, h.x1, 0.9, h.z1, { uv: 1.5 });
      const ax = (sx + 1.2 + h.x1) / 2, az = (h.z0 + h.z1) / 2;
      w.solid('trim', ax - 1.3, LOW, az - 0.7, ax + 1.3, LOW + 1.1, az + 0.7, { uv: 1 }); P().candles(w, ax, LOW + 1.1, az, rng, true); P().skull(w, ax + 0.7, LOW + 1.12, az, 0, 1.1);
      w.addLight(ax, LOW + 2, az, { flame: 0.4, intensity: 9, range: 12, color: '#ffb070', prio: 1 });
    }
    // ---- the maze's walls (on the slab), its low ceiling
    const nOpenN = new Set([Math.floor(cols / 2), ...LG.gateXs(W, gates || 1).map((g) => U.clamp(Math.floor((g - ox) / CELL), 0, cols - 1))]);
    const nOpenS = new Set([Math.floor(cols / 2), rng.int(0, cols - 1)]);
    const wall = (x0, z0, x1, z1) => { w.solid('wall', x0, 0, z0, x1, HT, z1, { uv: 2.5 }); occ.mark(x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4); };
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const x = cx0(c), z = cz0(r);
      w.solid('block', x - WT / 2, 0, z - WT / 2, x + WT / 2, HT, z + WT / 2, { uv: 2 });
      occ.mark(x - WT / 2 - 0.4, z - WT / 2 - 0.4, x + WT / 2 + 0.4, z + WT / 2 + 0.4);
      if (c < cols) {
        const closed = r === 0 ? !nOpenN.has(c) : r === rows ? !nOpenS.has(c) : !open.has(key(id(c, r - 1), id(c, r)));
        if (closed) wall(x + WT / 2, z - WT / 2, x + CELL - WT / 2, z + WT / 2);
      }
      if (r < rows) {
        const closed = c === 0 || c === cols || !open.has(key(id(c - 1, r), id(c, r)));
        if (closed) wall(x - WT / 2, z + WT / 2, x + WT / 2, z + CELL - WT / 2);
      }
    }
    w.solid('rock', -3, HT, oz - WT / 2, W + 3, HT + 1.5, oz + rows * CELL + WT / 2, { uv: 6, noGrapple: true, grad: false });
    // the halls at both ends (higher vaults)
    const HH = 8;
    w.solid('rock', -3, HH, -3, W + 3, HH + 1.5, oz - WT / 2, { uv: 6, noGrapple: true, grad: false });
    w.solid('rock', -3, HH, oz + rows * CELL + WT / 2, W + 3, HH + 1.5, D + 3, { uv: 6, noGrapple: true, grad: false });
    w.solid('wall', -3, HT, oz - WT / 2 - 0.3, W + 3, HH, oz - WT / 2, { uv: 2.5 }); w.solid('wall', -3, HT, oz + rows * CELL + WT / 2, W + 3, HH, oz + rows * CELL + WT / 2 + 0.3, { uv: 2.5 });
    if (ox > 0.5) { w.solid('wall', -3, 0, oz, ox - WT / 2, HT, oz + rows * CELL, { uv: 2.5 }); w.solid('wall', ox + cols * CELL + WT / 2, 0, oz, W + 3, HT, oz + rows * CELL, { uv: 2.5 }); }
    H.perimeter(w, rng, W, D, { gates, h: HH, top: HH + 1.5, beams: 0 });
    occ.mark(0, oz - 1, ox, oz + rows * CELL + 1); occ.mark(ox + cols * CELL, oz - 1, W, oz + rows * CELL + 1);
    // iron gates in east-west openings on loops (every cell still reached with all of them shut), not in a chamber or by a pit
    if (G.Strata && CR()) {
      const cand = [];
      for (let r = 0; r < rows; r++) for (let c = 1; c < cols; c++) {
        if (!open.has(key(id(c - 1, r), id(c, r)))) continue;
        if (inRoom(c - 1, r) && inRoom(c - 1, r) === inRoom(c, r)) continue;
        if ((inRoom(c - 1, r) || {}).well || (inRoom(c, r) || {}).well) continue; // (a well's pit would take one side of it)
        if (holes.has(id(c - 1, r)) || holes.has(id(c, r))) continue;
        cand.push([rng.next(), c, r]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      const whole = (cut) => {
        const shut = new Set(cut.map(([c, r]) => key(id(c - 1, r), id(c, r)))), sn = new Uint8Array(cols * rows), q = [0]; sn[0] = 1; let n = 1;
        while (q.length) { const i = q.pop(), c = i % cols, r = (i / cols) | 0; for (const [a, b] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) { if (a < 0 || b < 0 || a >= cols || b >= rows) continue; const j = id(a, b), k = key(i, j); if (sn[j] || !open.has(k) || shut.has(k)) continue; sn[j] = 1; n++; q.push(j); } }
        return n === cols * rows;
      };
      const chosen = [];
      for (const [, c, r] of cand) {
        if (chosen.length >= 3) break;
        if (chosen.some(([a, b]) => Math.abs(a - c) + Math.abs(b - r) < 3) || !whole([...chosen, [c, r]])) continue;
        chosen.push([c, r]);
      }
      for (const [c, r] of chosen) CR().gate(w, rng, cx0(c), cz0(r) + WT / 2, cz0(r + 1) - WT / 2, HT, WT);
    }
    // chest spots: the dead ends of the maze (a chest at the end of a blind passage) and the crypt's corners
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((degree(c, r) === 1 || rng.chance(0.4)) && !holes.has(id(c, r)) && !inRoom(c, r)) { const x0 = cx0(c) + WT / 2 + 0.6, z0 = cz0(r) + WT / 2 + 0.6; w.platTops.push({ x0, z0, x1: x0 + CELL - WT - 1.2, z1: z0 + CELL - WT - 1.2, y: 0, cx: x0 + (CELL - WT) / 2 - 0.6, cz: z0 + (CELL - WT) / 2 - 0.6 }); }
    for (const [x, z] of [[kx0 + 2.5, kz0 + 2.5], [kx1 - 2.5, kz0 + 2.5], [kx0 + 2.5, kz1 - 2.5], [kx1 - 2.5, kz1 - 2.5]]) w.platTops.push({ x0: x - 1.5, z0: z - 1.5, x1: x + 1.5, z1: z + 1.5, y: LOW, cx: x, cz: z });
    // ---- the maze's dressing: skull niches, candles (few: it is dark), webs, bones; the chambers' coffins
    let lights = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = cx0(c) + WT / 2, z0 = cz0(r) + WT / 2, x1 = x0 + CELL - WT, z1 = z0 + CELL - WT;
      if (holes.has(id(c, r))) { for (let k = 0; k < 3; k++) P().rubble(w, k % 2 ? x0 + 0.3 : x1 - 0.3, 0, rng.range(z0, z1), rng, 0.6, 'rock'); continue; }
      const room = inRoom(c, r);
      if (!room) {
        if (r > 0 && !open.has(key(id(c, r - 1), id(c, r))) && rng.chance(0.6)) CR().ossuary(w, rng, x0, x1, z0, true, 1, 0);
        if (c > 0 && !open.has(key(id(c - 1, r), id(c, r))) && rng.chance(0.45)) CR().ossuary(w, rng, z0, z1, x0, false, 1, 0);
        if (rng.chance(0.18) && lights < 16) { P().candles(w, x0 + 0.4, 0, z0 + 0.4, rng, true); lights++; }
        if (rng.chance(0.25)) P().web(w, x0 + 0.3, HT - 0.9, z0 + 0.3, Math.PI / 4, rng.range(1, 1.6));
        if (rng.chance(0.3)) P().bones(w, (x0 + x1) / 2 + rng.range(-1, 1), 0.02, (z0 + z1) / 2 + rng.range(-1, 1), rng);
      } else if (room.c === c && room.r === r && !room.well) {
        const rx = cx0(c) + CELL, rz = cz0(r) + CELL;
        P().sarcophagus(w, rx, rz, 0, true, rng); occ.mark(rx - 1.6, rz - 1.2, rx + 1.6, rz + 1.2);
        w.platTops.push({ x0: rx - 3.5, z0: rz - 3.5, x1: rx + 3.5, z1: rz + 3.5, y: 0, cx: rx + 2.5, cz: rz + 2.5 });
        P().chandelier(w, rx, HT - 1.6, rz, HT); lights++;
      }
    }
    // the vestibule (north): pillars, coffins stacked; the stair hall (south): torches, a sarcophagus either side
    for (let x = 8; x < W - 6; x += 11) { if (LG.gateXs(W, gates || 1).some((g) => Math.abs(g - x) < 7)) continue; P().pillarSquare(w, x, 7, 0, HH, 1.1); occ.mark(x - 1.2, 6, x + 1.2, 8); }
    for (const sx of [-1, 1]) { const x = W / 2 + sx * rng.range(8, 12), z = D - 5; P().sarcophagus(w, x, z, 0, true, rng); occ.mark(x - 1.6, z - 1.2, x + 1.6, z + 1.2); }
    for (let x = 6; x < W - 4; x += 9) if (Math.abs(x - W / 2) > 5) P().torch(w, x, 3.2, D, 'nz');
    for (const g of LG.gateXs(W, gates || 1)) { P().brazier(w, g - 4.5, 0, 4.5, 1, true); P().brazier(w, g + 4.5, 0, 4.5, 1, true); }
    // (the crypt and the halls are not for the area's later things: they go on the maze's floor)
    for (const h of holeR) occ.mark(h.x0 - 0.5, h.z0 - 0.5, h.x1 + 0.5, h.z1 + 0.5, 2);
    w.navLayers = 2;
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  // a slab over a cell, with a hole (hx0..hx1, hz0..hz1) left in it
  function slabAround(w, x0, z0, x1, z1, hx0, hz0, hx1, hz1) {
    const a0 = Math.max(x0, hx0), a1 = Math.min(x1, hx1), b0 = Math.max(z0, hz0), b1 = Math.min(z1, hz1);
    if (a0 >= a1 || b0 >= b1) { w.solid('floor', x0, -SLAB, z0, x1, 0, z1, { uv: 4 }); return; }
    if (b0 > z0) w.solid('floor', x0, -SLAB, z0, x1, 0, b0, { uv: 4 });
    if (b1 < z1) w.solid('floor', x0, -SLAB, b1, x1, 0, z1, { uv: 4 });
    if (a0 > x0) w.solid('floor', x0, -SLAB, b0, a0, 0, b1, { uv: 4 });
    if (a1 < x1) w.solid('floor', a1, -SLAB, b0, x1, 0, b1, { uv: 4 });
    for (const [p, q, r2, s] of [[a0, b0, a1, b0 + 0.12], [a0, b1 - 0.12, a1, b1], [a0, b0, a0 + 0.12, b1], [a1 - 0.12, b0, a1, b1]]) w.visual('rock', p, -SLAB - 0.5, q, r2, -SLAB, s, { uv: 2, grad: false }); // (the broken edge)
  }
  F.gen.catacombs = genCatacombs;
})();
