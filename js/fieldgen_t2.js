'use strict';
// The entrance tier's new fields (runplan.js R.TIERS[1]): drawn instead of the dungeon entrance for a segment.
//   catacombs - 地下墓所: the burial maze under the graveyard. Narrow passages walled with bones, small burial chambers, a low vault.
//   castle    - 血月の古城 (below): the castle that guards the way down, its baileys under a blood moon.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  // ---------------------------------------------------------------- 地下墓所
  // an ossuary wall face: rows of skulls in dark niches (visual, on a wall along x or z, facing dir)
  function ossuary(w, rng, a0, a1, c, alongX, face, y0) {
    for (let y = y0 + 0.9; y < y0 + 4.2; y += 1.1) {
      if (rng.chance(0.25)) continue;
      if (alongX) w.visual('dark', a0 + 0.3, y, c + face * 0.02, a1 - 0.3, y + 0.55, c + face * 0.06, { uv: 1, grad: false });
      else w.visual('dark', c + face * 0.02, y, a0 + 0.3, c + face * 0.06, y + 0.55, a1 - 0.3, { uv: 1, grad: false });
      for (let u = a0 + 0.55; u < a1 - 0.4; u += 0.55) if (rng.chance(0.7)) {
        const ry = alongX ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (alongX) P().skull(w, u, y + 0.06, c + face * 0.2, ry, 0.75); else P().skull(w, c + face * 0.2, y + 0.06, u, ry, 0.75);
      }
    }
  }
  function genCatacombs(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = FB.base(area, seed, 'catacombs');
    FB.reserve(occ, W, D, gates);
    const HT = 8;
    H.floors(w, W, D, null, rng.chance(0.5) ? 'floor' : 'cobble');
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0 });
    F.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: 0, beamStep: 9 });
    const layout = rng.pick(['maze', 'galleries', 'crypts']);
    w.layout = layout;
    // the maze: a grid of cells, walls between them, a corridor tree with a few loops, some cells merged into burial chambers
    const CELL = layout === 'galleries' ? 8 : 7, WT = 1.4;
    const gx0 = 3, gz0 = 18, cols = Math.floor((W - 6) / CELL), rows = Math.floor((D - gz0 - 12) / CELL);
    const ox = gx0 + ((W - 6) - cols * CELL) / 2, oz = gz0;
    const id = (c, r) => r * cols + c, open = new Set(), key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
    // depth-first carve
    const seen = new Uint8Array(cols * rows), stack = [[Math.floor(cols / 2), rows - 1]]; seen[id(...stack[0])] = 1;
    while (stack.length) {
      const [c, r] = stack[stack.length - 1];
      const nb = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < cols && b < rows && !seen[id(a, b)]);
      if (!nb.length) { stack.pop(); continue; }
      const [a, b] = rng.pick(nb); seen[id(a, b)] = 1; open.add(key(id(c, r), id(a, b))); stack.push([a, b]);
    }
    // loops: a share of the remaining walls comes down (more in the galleries: long halls rather than a maze)
    const loopP = layout === 'galleries' ? 0.5 : layout === 'crypts' ? 0.3 : 0.22;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (c + 1 < cols && rng.chance(loopP)) open.add(key(id(c, r), id(c + 1, r))); if (r + 1 < rows && rng.chance(loopP)) open.add(key(id(c, r), id(c, r + 1))); }
    // burial chambers: 2 x 2 blocks of cells with no walls inside
    const rooms = [];
    for (let i = 0; i < (layout === 'crypts' ? 4 : 2); i++) {
      const c = rng.int(0, cols - 2), r = rng.int(0, rows - 2);
      if (rooms.some((q) => Math.abs(q.c - c) < 3 && Math.abs(q.r - r) < 3)) continue;
      rooms.push({ c, r });
      open.add(key(id(c, r), id(c + 1, r))); open.add(key(id(c, r + 1), id(c + 1, r + 1))); open.add(key(id(c, r), id(c, r + 1))); open.add(key(id(c + 1, r), id(c + 1, r + 1)));
    }
    const inRoom = (c, r) => rooms.find((q) => c >= q.c && c <= q.c + 1 && r >= q.r && r <= q.r + 1);
    // the walls: a pier at every grid node, a wall on every closed cell edge; openings to the halls north and south
    const nOpenN = new Set([0, cols - 1, Math.floor(cols / 2), ...LG.gateXs(W, gates || 1).map((g) => Math.max(0, Math.min(cols - 1, Math.floor((g - ox) / CELL))))]);
    const nOpenS = new Set([Math.floor(cols / 2), rng.int(0, cols - 1), rng.int(0, cols - 1)]);
    const wall = (x0, z0, x1, z1) => { w.solid('wall', x0, 0, z0, x1, HT, z1, { uv: 2.5 }); occ.mark(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5); };
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const x = ox + c * CELL, z = oz + r * CELL;
      const edgeN = r === 0, edgeS = r === rows, edgeW = c === 0, edgeE = c === cols;
      const pierOK = !((edgeN || edgeS) && (edgeW || edgeE));
      if (pierOK || true) { w.solid('block', x - WT / 2, 0, z - WT / 2, x + WT / 2, HT, z + WT / 2, { uv: 2 }); occ.mark(x - WT / 2 - 0.5, z - WT / 2 - 0.5, x + WT / 2 + 0.5, z + WT / 2 + 0.5); }
      // the edge east of this node (between rows r-1 and r): closed unless open
      if (c < cols) {
        const above = r - 1, below = r;
        let closed;
        if (above < 0) closed = !nOpenN.has(c);
        else if (below >= rows) closed = !nOpenS.has(c);
        else closed = !open.has(key(id(c, above), id(c, below)));
        if (closed) wall(x + WT / 2, z - WT / 2, x + CELL - WT / 2, z + WT / 2);
      }
      if (r < rows) {
        const left = c - 1, right = c;
        let closed;
        if (left < 0 || right >= cols) closed = true;
        else closed = !open.has(key(id(left, r), id(right, r)));
        if (closed) wall(x - WT / 2, z + WT / 2, x + WT / 2, z + CELL - WT / 2);
      }
    }
    // the maze's faces toward the two halls are walls of bones too
    for (let c = 0; c < cols; c++) { const a0 = ox + c * CELL + WT / 2, a1 = a0 + CELL - WT; if (!nOpenN.has(c)) ossuary(w, rng, a0, a1, oz - WT / 2, true, -1, 0); if (!nOpenS.has(c)) ossuary(w, rng, a0, a1, oz + rows * CELL + WT / 2, true, 1, 0); }
    for (let x = 6; x < W - 6; x += 7) if (rng.chance(0.5)) P().candles(w, x, 0, oz + rows * CELL + WT / 2 + 0.6, rng, rng.chance(0.4));
    // the gaps between the maze and the outer walls on west / east are sealed (the maze is the way)
    if (ox > 3.5) { w.solid('wall', 0, 0, oz - WT / 2, ox - WT / 2, HT, oz + rows * CELL + WT / 2, { uv: 2.5 }); w.solid('wall', ox + cols * CELL + WT / 2, 0, oz - WT / 2, W, HT, oz + rows * CELL + WT / 2, { uv: 2.5 }); }
    occ.mark(0, oz - 1, ox, oz + rows * CELL + 1); occ.mark(ox + cols * CELL, oz - 1, W, oz + rows * CELL + 1);
    // dressing: skull niches on the wall faces, candles and webs in the passages, sarcophagi and an altar in the chambers
    let lights = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = ox + c * CELL + WT / 2, z0 = oz + r * CELL + WT / 2, x1 = x0 + CELL - WT, z1 = z0 + CELL - WT, cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
      const room = inRoom(c, r);
      if (!room) {
        if (r > 0 && !open.has(key(id(c, r - 1), id(c, r))) && rng.chance(0.55)) ossuary(w, rng, x0, x1, z0, true, 1, 0);
        if (c > 0 && !open.has(key(id(c - 1, r), id(c, r))) && rng.chance(0.4)) ossuary(w, rng, z0, z1, x0, false, 1, 0);
        if (rng.chance(0.22) && lights < 14) { P().candles(w, x0 + 0.5, 0, z0 + 0.5, rng, true); lights++; }
        if (rng.chance(0.3)) P().web(w, x0 + 0.4, HT - 1.2, z0 + 0.4, Math.PI / 4, rng.range(1.2, 2));
        if (rng.chance(0.35)) P().bones(w, cxm + rng.range(-1.5, 1.5), 0.02, czm + rng.range(-1.5, 1.5), rng);
        if (rng.chance(0.12)) { P().urn(w, x1 - 0.6, z1 - 0.6, 0, rng); occ.mark(x1 - 1.2, z1 - 1.2, x1, z1); }
      } else if (room.c === c && room.r === r) {
        // the chamber's middle: an altar or a sarcophagus under a hanging candle crown, coffins round the walls
        const rx = ox + c * CELL + CELL, rz = oz + r * CELL + CELL;
        if (rng.chance(0.5)) { P().sarcophagus(w, rx, rz, 0, true, rng); occ.mark(rx - 1.6, rz - 1.2, rx + 1.6, rz + 1.2); }
        else { w.solid('trim', rx - 1.4, 0, rz - 0.8, rx + 1.4, 1.1, rz + 0.8, { uv: 1 }); P().candles(w, rx, 1.1, rz, rng, true); P().skull(w, rx + 0.6, 1.12, rz, 0, 1); occ.mark(rx - 1.8, rz - 1.2, rx + 1.8, rz + 1.2); }
        P().chandelier(w, rx, HT - 2.6, rz, HT);
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (rng.chance(0.6)) { const x = rx + dx * (CELL - 2.2), z = rz + dz * (CELL - 2.6); P().sarcophagus(w, x, z, 0, rng.chance(0.4), rng); occ.mark(x - 1.4, z - 1.1, x + 1.4, z + 1.1); }
        lights++;
      }
    }
    // the halls at both ends: a vestibule toward the gates (pillars, coffins stacked up) and the stair hall you come down into
    for (let x = 10; x < W - 8; x += 12) { if (LG.gateXs(W, gates || 1).some((g) => Math.abs(g - x) < 7) || Math.abs(x - W / 2) < 14) continue; P().pillarSquare(w, x, 13, 0, HT, 1.2); occ.mark(x - 1.2, 12, x + 1.2, 14); }
    for (const sx of [-1, 1]) { const x = W / 2 + sx * rng.range(9, 13), z = D - 6; P().sarcophagus(w, x, z, 0, true, rng); occ.mark(x - 1.6, z - 1.2, x + 1.6, z + 1.2); }
    for (let x = 6; x < W - 4; x += 9) if (Math.abs(x - W / 2) > 5) P().torch(w, x, 3.2, D, 'nz');
    H.scatter(w, rng, occ, W, D, 6);
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.catacombs = genCatacombs;
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
  function wallWalk(w, rng, occ, x0, x1, z0, z1, h, side) {
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
  function genCastle(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = FB.base(area, seed, 'castle');
    FB.reserve(occ, W, D, gates);
    H.floors(w, W, D, null, 'floor');
    H.perimeter(w, rng, W, D, { gates, h: 5.4 }); // (the curtain stands 1.4 m over the wall walk: you look out between its merlons)
    const layout = rng.pick(['bailey', 'keep', 'ward']);
    w.layout = layout;
    const cx = W / 2;
    const way = (x0, z0, x1, z1) => { w.visual('cobble', x0, 0, z0, x1, 0.03, z1, { uv: 2, grad: false }); occ.mark(x0 - 0.6, z0, x1 + 0.6, z1); };
    way(cx - 2.4, 9, cx + 2.4, D);
    const gxs = LG.gateXs(W, gates || 1);
    way(Math.min(...gxs) - 1.6, 9, Math.max(...gxs) + 1.6, 12.2);
    for (const gx of gxs) way(gx - 1.6, 0, gx + 1.6, 12);
    // the wall walks along both curtain walls and the towers at the south corners
    for (const side of [-1, 1]) if (rng.chance(side < 0 ? 0.9 : 0.75)) {
      const top = wallWalk(w, rng, occ, side < 0 ? 0 : W - 3.4, side < 0 ? 3.4 : W, 16, D - 12, 4, side);
      w.platTops.push(top);
    }
    for (const sx of [-1, 1]) { const x = sx < 0 ? 6 : W - 6, z = D - 6.5; if (occ.free(x - 4, z - 4, x + 4, z + 4)) { tower(w, rng, x, z, 3, 10.5); occ.mark(x - 4, z - 4, x + 4, z + 4); } }
    let hallR = null;
    if (layout === 'bailey') {
      // an inner curtain wall across the castle with arched gates: the inner bailey and its hall beyond
      const zw = Math.round(D * 0.45);
      occ.mark(0, zw - 2, W, zw + 2); const ops = H.archWall(w, rng, zw, W, rng.int(2, 3)); for (const [a, b] of ops) occ.mark(a - 1, zw - 4, b + 1, zw + 4, 2);
      hallR = { x0: Math.round(cx - 11), z0: 17, x1: Math.round(cx + 11), z1: Math.round(zw - 5) };
    } else if (layout === 'keep') {
      hallR = { x0: Math.round(cx - 12), z0: Math.round(D * 0.3), x1: Math.round(cx + 12), z1: Math.round(D * 0.3) + 18 };
    }
    if (hallR && hallR.z1 - hallR.z0 >= 12) {
      // the main way runs up to the hall's door; side ways lead round it to the gates
      occ.mark(hallR.x0 - 1.5, hallR.z0 - 1.5, hallR.x1 + 1.5, hallR.z1 + 1.5);
      greatHall(w, rng, hallR);
      way(hallR.x1 + 1.6, hallR.z0 - 1.6, hallR.x1 + 4.2, hallR.z1 + 1.6); way(hallR.x0 - 4.2, hallR.z0 - 1.6, hallR.x0 - 1.6, hallR.z1 + 1.6);
    } else {
      // the chapel ward: a ruined chapel and its burial ground
      const r = occ.place(rng, 12, 16, 2);
      if (r) {
        const x0 = r.x0, z0 = r.z0, x1 = r.x1, z1 = r.z1;
        for (let z = z0; z < z1; z += 2) { if (rng.chance(0.15)) continue; w.solid('wall', x0, 0, z, x0 + 0.7, 3 + Math.abs(Math.sin(z + seed)) * 4, z + 2, { uv: 2 }); w.solid('wall', x1 - 0.7, 0, z, x1, 3 + Math.abs(Math.cos(z + seed)) * 4, z + 2, { uv: 2 }); }
        w.solid('wall', x0, 0, z0, x1, 8, z0 + 0.7, { uv: 2 });
        P().statue(w, (x0 + x1) / 2, z0 + 1.3, 0, 0, rng, 1.1); P().candles(w, (x0 + x1) / 2 + 1.3, 0, z0 + 1.8, rng, true);
        for (let z = z0 + 5; z < z1 - 3; z += 2.3) for (const sx of [-1, 1]) w.solid('woodDark', (x0 + x1) / 2 + sx * 1.5 - (sx < 0 ? 3 : 0), 0, z, (x0 + x1) / 2 + sx * 1.5 + (sx > 0 ? 3 : 0), 0.5, z + 0.45, { uv: 1 });
      }
      for (let i = 0; i < 12; i++) { const q = occ.place(rng, 1, 2, 0.7, 10); if (q) P().gravestone(w, q.x0 + 0.5, q.z0 + 0.4, 0, rng.range(-0.3, 0.3), rng); }
    }
    // the outer bailey: training yard, stables, the well, carts and barrels; quarters (ruined houses) against the walls
    { const r = occ.place(rng, 12, 9, 1.5, 30); if (r) { trainingYard(w, rng, r.x0, r.z0, r.x1, r.z1); F.woodFence && F.woodFence(w, r.x0, r.z1, r.x1, r.z1, 1.1, [[(r.x0 + r.x1) / 2 - 1, (r.x0 + r.x1) / 2 + 1]]); } }
    { const r = occ.place(rng, 12, 5, 1.5, 30); if (r) stables(w, rng, r.x0, r.z0, r.x1, r.z1); }
    { const r = occ.place(rng, 4, 4, 1.5, 20); if (r) P().well(w, r.x0 + 2, r.z0 + 2, 0); }
    for (let i = 0; i < 2 + rng.int(0, 2); i++) { const r = occ.place(rng, rng.int(7, 9), rng.int(6, 8), 1.4, 20); if (r) H.house(w, rng, r, { ruined: 0.75, h: [3.6, 4.8] }); }
    for (let i = 0; i < 6; i++) { const r = occ.place(rng, 2, 2, 0.8, 10); if (!r) continue; if (rng.chance(0.5)) P().barrel(w, r.x0 + 0.7, r.z0 + 0.7, 0, rng, rng.chance(0.3)); else P().crate(w, r.x0 + 1, r.z0 + 1, 0, rng); }
    for (let i = 0; i < 3; i++) { const r = occ.place(rng, 2, 2, 1.2, 12); if (r) F.deadTree(w, r.x0 + 1, r.z0 + 1, rng, rng.range(1, 1.4)); }
    // braziers along the main way (the banners hang from the wall walks' parapets)
    for (let z = D - 14; z > 14; z -= 12) { P().brazier(w, cx - 3.2, 0, z, 0.9, true); if (rng.chance(0.5)) P().brazier(w, cx + 3.2, 0, z - 6, 0.9, true); }
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.castle = genCastle;
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
