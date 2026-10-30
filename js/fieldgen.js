'use strict';
// The four fields of a run (see runplan.js):
//  grave  - outdoors on a moonlit night among graves, fences, dead trees and mausoleums
//  gate   - the dungeon entrance: high vaulted halls with a ceiling, barred windows onto the night outside, moonlight falling in
//  halls  - deeper: 3-4 storeys on either side of a lava chasm, joined by stairs, ramps, ladders and bridges (see strata.js)
//  ruin   - the ruined depths: the same build over blue fire, collapsed, darker
// plus their guardian approaches (no stairs on the road; a fenced arena outdoors, a long hall + sliding stone door below ground)
// and the ancient stone vending machine that replaces the roadside merchant.
(function () {
  const LG = G.LevelGen, H = LG._, U = G.U;
  const P = () => G.Props;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));
  const F = (G.FieldGen = {});

  // ---------------------------------------------------------------- props
  // iron fence along an axis (bars + rails, one thin collider per run, gaps left open)
  F.fence = function (w, x0, z0, x1, z1, h, gaps) {
    gaps = gaps || [];
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1), c = alongX ? z0 : x0;
    const segs = []; let s = a0;
    for (const [ga, gb] of gaps.slice().sort((p, q) => p[0] - q[0])) { if (ga > s) segs.push([s, ga]); s = Math.max(s, gb); }
    if (s < a1) segs.push([s, a1]);
    for (const [p, q] of segs) {
      if (q - p < 0.3) continue;
      const box = (u0, y0, u1, y1, t, mk, col) => { if (alongX) (col ? w.solid : w.visual).call(w, mk, u0, y0, c - t, u1, y1, c + t, { uv: 1 }); else (col ? w.solid : w.visual).call(w, mk, c - t, y0, u0, c + t, y1, u1, { uv: 1 }); };
      box(p, 0, q, 0.18, 0.12, 'block', false);           // stone kerb
      box(p, h - 0.1, q, h - 0.03, 0.04, 'iron', false);  // top rail
      box(p, 0.35, q, 0.41, 0.04, 'iron', false);         // low rail
      for (let u = p + 0.08; u < q; u += 0.22) box(u, 0.18, u + 0.035, h + 0.18 * ((Math.round(u / 0.22) % 2) ? 1 : 0.5), 0.02, 'iron', false); // bars with spikes
      for (let u = p; u <= q + 0.01; u += Math.max(1.2, (q - p) / Math.ceil((q - p) / 2.4))) box(u - 0.06, 0, u + 0.06, h + 0.25, 0.06, 'iron', false); // posts
      if (alongX) w.addCollider(p, 0, c - 0.08, q, h + 0.2, c + 0.08, { surf: 'metal', noGrapple: true });
      else w.addCollider(c - 0.08, 0, p, c + 0.08, h + 0.2, q, { surf: 'metal', noGrapple: true });
    }
  };
  F.deadTree = function (w, x, z, rng, s) {
    s = s || 1;
    w.addCollider(x - 0.3 * s, 0, z - 0.3 * s, x + 0.3 * s, 4.5 * s, z + 0.3 * s, { surf: 'wood' });
    const trunk = Mx(x, 2.2 * s, z, 0.32 * s, 4.4 * s, 0.32 * s, rng.range(-0.08, 0.08), 0, rng.range(-0.08, 0.08));
    w.batch.geo('woodDark', PG().cyl8, trunk);
    const n = rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, Math.PI * 2), y = rng.range(2.4, 4.2) * s, L = rng.range(1.2, 2.4) * s, tilt = rng.range(0.6, 1.1);
      const cx = x + Math.cos(a) * L * 0.42 * Math.sin(tilt), cz = z + Math.sin(a) * L * 0.42 * Math.sin(tilt);
      w.batch.geo('woodDark', PG().cyl8, Mx(cx, y + L * 0.3, cz, 0.12 * s, L, 0.12 * s, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt));
      // twigs
      w.batch.geo('woodDark', PG().cyl8, Mx(cx + Math.cos(a) * L * 0.3, y + L * 0.55, cz + Math.sin(a) * L * 0.3, 0.05 * s, L * 0.5, 0.05 * s, Math.sin(a + 0.8) * 0.9, 0, -Math.cos(a + 0.8) * 0.9));
    }
  };
  F.tombs = function (w, x0, z0, x1, z1, rng, facing) {
    // two rows of graves with mounds and the odd candle
    for (let x = x0 + 1.2; x < x1 - 0.8; x += 1.9) for (let r = 0; r < 2; r++) {
      const z = r ? z1 - 1.6 : z0 + 1.6;
      if (rng.chance(0.12)) continue;
      const head = facing > 0 ? z - 1.0 : z + 1.0;
      P().gravestone(w, x, head, 0, 0, rng);
      w.visual('rock', x - 0.38, 0, z - 0.85, x + 0.38, 0.16 + rng.range(0, 0.08), z + 0.85, { uv: 1, grad: false });
      if (rng.chance(0.12)) P().candles(w, x + 0.4, 0, head + 0.2, rng, rng.chance(0.3));
      if (rng.chance(0.06)) P().skull(w, x - 0.25, 0.02, z, rng.range(0, 6), 0.9);
    }
  };
  F.mausoleum = function (w, rng, x0, z0, x1, z1) {
    const h = rng.range(3.6, 4.6), cx = (x0 + x1) / 2, dz = z1; // the door faces +z (south)
    w.solid('block', x0, 0, z0, x0 + 0.5, h, z1, { uv: 2 }); w.solid('block', x1 - 0.5, 0, z0, x1, h, z1, { uv: 2 });
    w.solid('block', x0, 0, z0, x1, h, z0 + 0.5, { uv: 2 });
    w.solid('block', x0, 0, z1 - 0.5, cx - 0.9, h, z1, { uv: 2 }); w.solid('block', cx + 0.9, 0, z1 - 0.5, x1, h, z1, { uv: 2 });
    w.solid('block', cx - 0.9, 2.4, z1 - 0.5, cx + 0.9, h, z1, { uv: 2 });
    w.solid('trim', x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.35, z1 + 0.3, { uv: 2 });
    w.solid('trim', x0 + 0.4, h + 0.35, z0 + 0.4, x1 - 0.4, h + 0.8, z1 - 0.4, { uv: 2, noGrapple: true });
    // pediment + columns
    w.visual('trim', cx - 1.6, h - 0.6, z1, cx + 1.6, h, z1 + 0.25, { uv: 1 });
    for (const sx of [-1.3, 1.3]) w.solid('trim', cx + sx - 0.2, 0, z1, cx + sx + 0.2, h - 0.6, z1 + 0.4, { uv: 1 });
    w.visual('dark', x0 + 0.5, 0, z0 + 0.5, x1 - 0.5, 0.02, z1 - 0.5, { uv: 1, grad: false });
    P().sarcophagus(w, cx, (z0 + z1) / 2 - 0.4, 0, true, rng);
    P().candles(w, cx + 1.2, 0, z0 + 1, rng, true);
    P().skull(w, cx, h - 0.5, z1 + 0.27, 0, 1.2);
  };
  F.lantern = function (w, x, z, col, y) {
    y = y || 0;
    w.solid('iron', x - 0.07, y, z - 0.07, x + 0.07, y + 2.6, z + 0.07, { uv: 1 });
    w.visual('iron', x - 0.3, y + 2.5, z - 0.04, x + 0.07, y + 2.56, z + 0.04, { uv: 1 });
    w.visual('iron', x - 0.42, y + 2.0, z - 0.12, x - 0.18, y + 2.36, z + 0.12, { uv: 1 });
    w.visual('glow', x - 0.38, y + 2.06, z - 0.08, x - 0.22, y + 2.3, z + 0.08, { uv: 1, grad: false });
    w.addLight(x - 0.3, y + 2.2, z, { flame: 0.25, intensity: 6, range: 10, color: col || '#ffb070', prio: 1 });
  };
  // the night outside a barred window: a sky plane with stars (and the moon on one of them)
  F.nightPane = function (w, x, y, z, wd, h, face, moon) {
    w.deferred.push((grp) => {
      if (!F._skyTex) {
        const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#0a1430'); gr.addColorStop(0.55, '#24386a'); gr.addColorStop(1, '#5a74a8');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`; g.fillRect(Math.random() * 64, Math.random() * 160, 1, 1); }
        F._skyTex = new THREE.CanvasTexture(c); F._skyTex.colorSpace = THREE.SRGBColorSpace;
      }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, h), new THREE.MeshBasicMaterial({ map: F._skyTex, fog: false }));
      m.position.set(x, y, z); m.rotation.y = face; grp.add(m);
      if (moon) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xe8f0ff, fog: false, depthWrite: false }));
        s.scale.setScalar(Math.min(wd, h) * 0.5); s.position.set(x + Math.sin(face) * 0.05, y + h * 0.2, z + Math.cos(face) * 0.05); grp.add(s);
      }
    });
  };
  // moonlight slanting in through a window onto the floor
  F.moonShaft = function (w, x0, y0, z0, x1, y1, z1, col) {
    w.deferred.push((grp) => {
      const a = V(x0, y0, z0), b = V(x1, y1, z1), L = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.9, L, 12, 1, true), new THREE.MeshBasicMaterial({ map: G.Tex.spr.lightshaft, color: col || 0xa8c0ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, -1, 0), b.clone().sub(a).normalize());
      m.renderOrder = 8; grp.add(m);
    });
    w.addLight(x1, y1 + 0.5, z1, { flame: 0, intensity: 4, range: 9, color: '#9ab4ff', emit: false, prio: 0.8, steady: true });
  };
  // the ceiling: a solid slab (the grapple latches onto it) with beams, chains and the odd chandelier
  F.ceiling = function (w, rng, x0, z0, x1, z1, y, opts) {
    opts = opts || {};
    w.solid('block', x0 - 3, y, z0 - 3, x1 + 3, y + 1.2, z1 + 3, { uv: 4 });
    w.ceilingY = y;
    for (let z = z0 + 5; z < z1 - 2; z += opts.beamStep || 7) {
      if (opts.ruined && rng.chance(0.3)) continue;
      w.visual('woodDark', x0, y - 0.7, z - 0.35, x1, y, z + 0.35, { uv: 2 });
      if (rng.chance(0.5)) P().chain(w, rng.range(x0 + 4, x1 - 4), y - rng.range(2.5, 5), z, rng.range(2.5, 4.5));
    }
    const nch = opts.chandeliers ?? 2;
    for (let i = 0; i < nch; i++) P().chandelier(w, rng.range(x0 + 10, x1 - 10), y - rng.range(4, 6), rng.range(z0 + 12, z1 - 12), y - 0.7);
  };
  // a wooden ramp: shallow plank steps, no rails (only the planks)
  F.ramp = function (w, side, e, c, wd, h0, h1) {
    return H.stairs(w, side, e, c, wd, h0, h1, 'wood');
  };
  // ---------------------------------------------------------------- shared area plumbing
  function base(area, seed, biomeKey, sz) {
    const rng = new G.RNG(seed);
    const size = sz || Math.min(88, 62 + Math.floor(area / 3) * 2 + rng.int(0, 3) * 4);
    const W = size, D = size + rng.int(-2, 3) * 4;
    const w = new G.World(W, D, biomeKey);
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    return { rng, W, D, w, occ };
  }
  function reserve(occ, W, D, gates) {
    occ.mark(W / 2 - 6, D - 10, W / 2 + 6, D, 2);
    for (const gx of LG.gateXs(W, gates || 1)) occ.mark(gx - 6, 0, gx + 6, 9, 2);
    occ.mark(W / 2 - 13, 8, W / 2 + 13, 16, 2);
    occ.mark(0, 0, W, 2, 2); occ.mark(0, D - 2, W, D, 2); occ.mark(0, 0, 2, D, 2); occ.mark(W - 2, 0, W, D, 2);
  }
  function finish(w, rng, occ, W, D, area, kind, extraChests) {
    w.fireRects = w.fireRects || [];
    for (const [gx, z0, z1, lz] of [...(w.exits || []).map((e) => [e.x, 0, 1.45, 0.8]), [W / 2, D - 1.45, D, D - 0.8]]) {
      const x0 = gx - 4.6, x1 = gx + 4.6, yT = 8.9;
      w.batch.box('iron', x0, yT, z0, x1, yT + 0.16, z1, { tint: [0.13, 0.12, 0.12], grad: false });
      w.batch.box('glow', x0 + 0.1, yT + 0.16, z0 + 0.1, x1 - 0.1, yT + 0.18, z1 - 0.1, { tint: [1, 0.3, 0.05], grad: false });
      w.fireRects.push({ x0, x1, z0, z1, y: yT + 0.18, acc: 0, low: true, blue: false });
      w.addLight(gx, yT + 1.4, lz, { flame: 0, emit: false, intensity: 8, range: 10, color: '#ff5a18', prio: 0.55 });
    }
    if (G.Fields) G.Fields.place(w, rng, occ, W, D, area);
    if (G.Graves) G.Graves.scatter(w, rng, occ, W, D, w.biome === 'grave' ? 1 : 2);
    H.placeChests(w, rng, occ, (kind === 'vault' ? 6 : (area <= 4 ? 2 : rng.chance(0.75) ? 1 : 0) + (rng.chance(0.25) ? 1 : 0)) + (extraChests || 0), area);
    w.miniSlots = [-6, -2, 2].map((dx) => ({ x: W / 2 + dx, y: 1.15, z: 12, face: 1 })); w.miniHeal = V(W / 2 + 6, 0, 12);
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    return w;
  }


  // ---------------------------------------------------------------- a chasm across the area (not common)
  // The floor is left out of a wide band across the middle; a few stone bridges cross it (the first one carries the main path).
  // Falling in costs 15% of your HP and puts you back on the last safe ground (see player.js fellInPit); foes that fall die.
  F.chasmMask = function (rng, W, D, occ) {
    const pit = new Uint8Array(W * D);
    const z0 = Math.floor(D * 0.42), z1 = Math.floor(D * 0.57);
    for (let z = z0; z < z1; z++) for (let x = 3; x < W - 3; x++) pit[z * W + x] = 1;
    occ.mark(0, z0 - 1, W, z1 + 1, 1);
    const nb = rng.int(2, 3);
    {
      const list = [[W / 2 - 1.6, W / 2 + 1.6, z0, z1]];
      for (let i = 1; i < nb; i++) { const bx = rng.chance(0.5) ? rng.range(8, W / 2 - 9) : rng.range(W / 2 + 9, W - 8); list.push([bx - 1.6, bx + 1.6, z0, z1]); }
      pit.bridges = list; pit.band = { z0, z1 };
    }
    return pit;
  };
  F.chasmDress = function (w, rng, W, D, pit, glow) {
    const { z0, z1 } = pit.band;
    w._bridges = pit.bridges; w._pit = pit.band;
    for (const [a, b] of pit.bridges) {
      w.solid('block', a, -0.6, z0 - 0.01, b, 0, z1 + 0.01, { uv: 2 });
      w.solid('trim', a, 0, z0, a + 0.3, 0.9, z1, { uv: 1 }); w.solid('trim', b - 0.3, 0, z0, b, 0.9, z1, { uv: 1 });   // railings
      w.solid('block', a + 0.2, -12, (z0 + z1) / 2 - 0.6, b - 0.2, -0.6, (z0 + z1) / 2 + 0.6, { uv: 3 });                 // arch support down into the dark
      P().torch(w, a, 1.6, z0 + 0.5, 'px'); P().torch(w, b, 1.6, z1 - 0.5, 'nx');
    }
    w.solid('trim', 3, 0, z0 - 0.3, W - 3, 0.25, z0, { uv: 1, tag: 'lip' });
    w.solid('trim', 3, 0, z1, W - 3, 0.25, z1 + 0.3, { uv: 1, tag: 'lip' });
    w.visual('dark', 3, -14, z0, W - 3, -13.9, z1, { uv: 4, grad: false });
    for (let x = 10; x < W - 6; x += 14) w.addLight(x, -6, (z0 + z1) / 2, { flame: 0, intensity: 14, range: 14, color: glow || '#5a7ae0', emit: false, prio: 0.7 });
    w.abyss = { z0, z1 };
    if (rng.chance(0.4)) {
      const ix = W / 2 + rng.range(-9, 9);
      if (pit.bridges.every(([a, b]) => ix + 3.5 < a || ix - 3.5 > b)) {
        w.solid('wall', ix - 3, -12, z0 + 2, ix + 3, 2.5, z1 - 2, { uv: 3 });
        w.solid('trim', ix - 3.06, 2.25, z0 + 1.94, ix + 3.06, 2.5, z1 - 1.94, { uv: 2 });
        P().brazier(w, ix, 2.5, (z0 + z1) / 2, 1);
        w.platTops.push({ x0: ix - 2.5, z0: z0 + 2.5, x1: ix + 2.5, z1: z1 - 2.5, y: 2.5, cx: ix + 1.5, cz: (z0 + z1) / 2 });
      }
    }
  };

  // ---------------------------------------------------------------- 1) the moonlit graveyard
  function genGrave(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = base(area, seed, 'grave');
    reserve(occ, W, D, gates);
    const pit = area >= 4 && rng.chance(0.3) ? F.chasmMask(rng, W, D, occ) : null; // now and then a chasm cuts the graveyard in two
    H.floors(w, W, D, pit, 'floor');
    H.perimeter(w, rng, W, D, { gates, h: 4.6 });
    if (pit) F.chasmDress(w, rng, W, D, pit, '#6a8ae8');
    const layout = pit ? 'chasm' : rng.pick(['rows', 'chapel', 'barrow']);
    w.layout = layout;
    // gravel paths from the entrance to every exit
    const cxs = LG.gateXs(W, gates || 1);
    w.visual('cobble', W / 2 - 1.6, 0, 9, W / 2 + 1.6, 0.03, D, { uv: 2, grad: false });
    w.visual('cobble', Math.min(...cxs) - 1.6, 0, 9, Math.max(...cxs) + 1.6, 0.03, 12.2, { uv: 2, grad: false });
    for (const gx of cxs) w.visual('cobble', gx - 1.6, 0, 0, gx + 1.6, 0.03, 12, { uv: 2, grad: false });
    occ.mark(W / 2 - 2.5, 9, W / 2 + 2.5, D);
    if (layout === 'chapel') {
      // a roofless ruined chapel in the middle: broken walls, empty windows, an altar and pews
      const cw = 14, cd = 20, x0 = Math.round(W / 2 - cw / 2), z0 = Math.round(D / 2 - cd / 2 - 2);
      if (occ.free(x0 - 1, z0 - 1, x0 + cw + 1, z0 + cd + 1)) {
        occ.mark(x0 - 1, z0 - 1, x0 + cw + 1, z0 + cd + 1);
        const wallH = (z) => 2.5 + Math.abs(Math.sin(z * 0.7 + seed)) * 3.5;
        for (let z = z0; z < z0 + cd; z += 2) { const h = wallH(z); if (rng.chance(0.15)) continue; w.solid('wall', x0, 0, z, x0 + 0.6, h, z + 2, { uv: 2 }); w.solid('wall', x0 + cw - 0.6, 0, z, x0 + cw, wallH(z + 7), z + 2, { uv: 2 }); }
        w.solid('wall', x0, 0, z0, x0 + cw, 6.5, z0 + 0.6, { uv: 2 });
        for (const dx of [0, cw - 4.5]) w.solid('wall', x0 + dx, 0, z0 + cd - 0.6, x0 + dx + 4.5, 4.2, z0 + cd, { uv: 2 });
        w.solid('trim', x0 + cw / 2 - 2, 0, z0 + 1.5, x0 + cw / 2 + 2, 1.0, z0 + 3, { uv: 2 });
        P().candles(w, x0 + cw / 2, 1.0, z0 + 2.2, rng, true);
        P().statue(w, x0 + cw / 2, z0 + 1.1, 1.0, 0, rng, 1.0);
        for (let z = z0 + 6; z < z0 + cd - 3; z += 2.4) for (const sx of [-1, 1]) w.solid('woodDark', x0 + cw / 2 + sx * 1.6 - (sx < 0 ? 3 : 0), 0, z, x0 + cw / 2 + sx * 1.6 + (sx > 0 ? 3 : 0), 0.55, z + 0.5, { uv: 1 });
        for (const k of [0.3, 0.7]) P().brazier(w, x0 + cw * k, 0, z0 + cd - 2, 0.9, true);
      }
    } else if (layout === 'barrow') {
      // a raised burial mound with an obelisk and the oldest graves on top
      const s = 14, h = 2.5, L = Math.ceil(LG.stairsLen(h));
      const R = { x0: Math.round(W / 2 - s / 2 - L), z0: Math.round(D / 2 - s / 2 - L - 2), x1: Math.round(W / 2 + s / 2 + L), z1: Math.round(D / 2 + s / 2 + L - 2) };
      if (occ.free(R.x0, R.z0, R.x1, R.z1)) {
        occ.mark(R.x0, R.z0, R.x1, R.z1);
        const top = H.platform(w, rng, R, h, ['N', 'S', 'E', 'W'], { decor: false, mk: 'rock' });
        w.platTops.push(top);
        w.solid('block', top.cx - 0.5, h, top.cz - 0.5, top.cx + 0.5, h + 5.5, top.cz + 0.5, { uv: 2 });
        w.solid('trim', top.cx - 0.8, h, top.cz - 0.8, top.cx + 0.8, h + 0.6, top.cz + 0.8, { uv: 1 });
        for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5]]) P().gravestone(w, top.cx + dx, top.cz + dz, h, rng.range(-0.3, 0.3), rng);
        for (const [dx, dz] of [[-5, 0], [5, 0]]) F.lantern(w, top.cx + dx, top.cz + dz, '#9ab4ff', h);
      }
    }
    // fenced grave plots
    const nPlots = 4 + Math.floor(W * D / 900) + rng.int(0, 2);
    for (let i = 0; i < nPlots; i++) {
      const pw = rng.pick([7.6, 9.5, 11.4]), pd = 6.4;
      const r = occ.place(rng, Math.ceil(pw), Math.ceil(pd), 1.4); if (!r) continue;
      const x0 = r.x0, z0 = r.z0, x1 = r.x0 + pw, z1 = r.z0 + pd;
      const gapAt = (x0 + x1) / 2;
      F.fence(w, x0, z0, x1, z0, 1.1, rng.chance(0.5) ? [[gapAt - 0.8, gapAt + 0.8]] : []);
      F.fence(w, x0, z1, x1, z1, 1.1, [[gapAt - 0.8, gapAt + 0.8]]);
      F.fence(w, x0, z0, x0, z1, 1.1, []);
      F.fence(w, x1, z0, x1, z1, 1.1, rng.chance(0.4) ? [[(z0 + z1) / 2 - 0.8, (z0 + z1) / 2 + 0.8]] : []);
      F.tombs(w, x0, z0, x1, z1, rng, 1);
    }
    // mausoleums
    for (let i = 0; i < rng.int(1, 3); i++) { const r = occ.place(rng, 6, 7, 1.5); if (r) F.mausoleum(w, rng, r.x0, r.z0, r.x0 + 6, r.z0 + 7); }
    // lone graves scattered between the plots
    for (let i = 0; i < 18 + rng.int(0, 10); i++) { const r = occ.place(rng, 1, 2, 0.8, 10); if (r) { P().gravestone(w, r.x0 + 0.5, r.z0 + 0.3, 0, rng.range(-0.4, 0.4), rng); w.visual('rock', r.x0 + 0.12, 0, r.z0 + 0.6, r.x0 + 0.88, 0.14, r.z0 + 2, { uv: 1, grad: false }); } }
    // dead trees and lanterns
    for (let i = 0; i < 6 + rng.int(0, 6); i++) { const r = occ.place(rng, 2, 2, 1.2, 12); if (r) F.deadTree(w, r.x0 + 1, r.z0 + 1, rng, rng.range(0.9, 1.4)); }
    for (let z = D - 14; z > 14; z -= 11) { F.lantern(w, W / 2 - 2.4, z, '#ffb070'); if (rng.chance(0.5)) F.lantern(w, W / 2 + 2.4, z - 5, '#9ab4ff'); }
    // a few open graves / coffins and bones
    for (let i = 0; i < 4; i++) { const r = occ.place(rng, 2, 3, 0.8, 10); if (r) { w.visual('dark', r.x0 + 0.3, 0, r.z0 + 0.3, r.x0 + 1.7, 0.02, r.z0 + 2.7, { uv: 1, grad: false }); w.solid('woodDark', r.x0 + 1.75, 0, r.z0 + 0.4, r.x0 + 2, 0.5, r.z0 + 2.6, { uv: 1 }); P().bones(w, r.x0 + 1, 0.03, r.z0 + 1.5, rng); } }
    return finish(w, rng, occ, W, D, area, kind, extraChests);
  }

  // ---------------------------------------------------------------- 2) the dungeon entrance
  function genGate(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = base(area, seed, 'gate');
    reserve(occ, W, D, gates);
    const HT = 16;
    // barred windows high in both side walls (between the buttresses)
    const wins = [];
    for (let z = 16; z < D - 12; z += 16) wins.push([z + 0.6, z + 3.6, 6.2, 12.4]);
    const pit = area >= 4 && rng.chance(0.3) ? F.chasmMask(rng, W, D, occ) : null;
    H.floors(w, W, D, pit, rng.chance(0.5) ? 'cobble' : 'floor');
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0, windows: wins });
    if (pit) F.chasmDress(w, rng, W, D, pit, '#7a60d8');
    F.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: rng.int(1, 3) });
    for (const [a, b, y0, y1] of wins) for (const side of [-1, 1]) {
      const xw = side < 0 ? 0 : W, zc = (a + b) / 2;
      // bars + sill
      for (let z = a + 0.2; z < b; z += 0.4) w.visual('iron', xw - 0.06 + side * -1.5, y0, z - 0.03, xw + 0.06 + side * -1.5, y1, z + 0.03, { uv: 1 });
      w.addCollider(side < 0 ? -3 : W, y0, a, side < 0 ? 0 : W + 3, y1, b, { surf: 'metal', noGrapple: true });
      w.visual('trim', side < 0 ? -0.4 : W, y0 - 0.25, a - 0.2, side < 0 ? 0 : W + 0.4, y0, b + 0.2, { uv: 1 });
      // the night beyond, and moonlight falling in
      F.nightPane(w, side < 0 ? -3.2 : W + 3.2, (y0 + y1) / 2, zc, (b - a) + 2, (y1 - y0) + 2, side < 0 ? Math.PI / 2 : -Math.PI / 2, rng.chance(0.25));
      if (rng.chance(0.8)) F.moonShaft(w, xw, (y0 + y1) / 2, zc, xw - side * rng.range(6, 10), 0.05, zc + rng.range(-2, 2));
      w.addLight(xw - side * 1.2, (y0 + y1) / 2, zc, { flame: 0, intensity: 5, range: 11, color: '#8aa8ff', emit: false, prio: 0.7, steady: true });
    }
    const layout = pit ? 'nave' : rng.pick(['nave', 'gallery', 'gatehouse']);
    w.layout = layout;
    if (layout === 'nave') {
      // two rows of heavy piers up to the vault
      for (const sx of [-1, 1]) for (let z = 16; z < D - 14; z += 9) { const x = W / 2 + sx * rng.range(9, 12); if (occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) { occ.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5); P().pillarSquare(w, x, z, 0, HT, 1.6); if (rng.chance(0.5)) P().torch(w, x, 3.4, z + 0.95, 'pz'); } }
    } else if (layout === 'gallery') {
      // a raised gallery along one wall with stairs and a colonnade
      const side = rng.chance(0.5) ? 'W' : 'E', depth = rng.int(8, 10), h = 3.5;
      const x0 = side === 'W' ? 0 : W - depth, x1 = side === 'W' ? depth : W, z0 = 14, z1 = D - 14;
      const L = Math.ceil(LG.stairsLen(h));
      occ.mark(side === 'W' ? x0 : x0 - L - 1, z0, side === 'W' ? x1 + L + 1 : x1, z1);
      w.solid('wall', x0, 0, z0, x1, h - 0.25, z1, { uv: 3 });
      w.solid('trim', x0, h - 0.25, z0 - 0.06, x1, h, z1 + 0.06, { uv: 2 });
      const edgeX = side === 'W' ? x1 : x0, gaps = [];
      for (const sz of [z0 + (z1 - z0) * 0.25, z0 + (z1 - z0) * 0.75]) { H.stairs(w, side === 'W' ? 'E' : 'W', edgeX, sz, 2.8, 0, h, 'trim'); gaps.push({ side: side === 'W' ? 'E' : 'W', a: sz - 1.5, b: sz + 1.5 }); }
      H.parapet(w, x0, z0, x1, z1, h, gaps.concat([{ side, a: -1, b: 999 }]));
      H.colonnade(w, rng, side === 'W' ? x0 + 2.2 : x1 - 2.2, z0 + 3, z1 - z0 - 6, false, HT - h, true);
      w.platTops.push({ x0: x0 + 1, z0: z0 + 1, x1: x1 - 1, z1: z1 - 1, y: h, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
    } else {
      const n = W > 72 ? 2 : 1;
      for (let i = 0; i < n; i++) { const z = Math.round(D * (i + 1) / (n + 1)); occ.mark(0, z - 2, W, z + 2); const ops = H.archWall(w, rng, z, W, rng.int(2, 3)); for (const [a, b] of ops) occ.mark(a - 1, z - 4, b + 1, z + 4, 2); }
    }
    // dungeon dressing: cages, chains, sarcophagi, rubble, bones, a broken portcullis
    for (let i = 0; i < 3; i++) { const r = occ.place(rng, 3, 3, 1.2, 12); if (r) P().cage(w, r.x0 + 1.5, r.z0 + 1.5, 0, rng.range(0.9, 1.2), rng); }
    for (let i = 0; i < 4; i++) { const r = occ.place(rng, 3, 2, 1, 12); if (r) P().sarcophagus(w, r.x0 + 1.5, r.z0 + 1, 0, rng.chance(0.5), rng); }
    for (let i = 0; i < 6; i++) { const r = occ.place(rng, 2, 2, 0.8, 10); if (r) { if (rng.chance(0.5)) P().rubble(w, r.x0 + 1, 0, r.z0 + 1, rng, rng.range(0.8, 1.4)); else P().bones(w, r.x0 + 1, 0.02, r.z0 + 1, rng); } }
    H.structures(w, rng, occ, W, D, 3 + Math.floor(W * D / 1200));
    H.scatter(w, rng, occ, W, D, 10 + Math.floor(W * D / 600));
    return finish(w, rng, occ, W, D, area, kind, extraChests);
  }

  // ---------------------------------------------------------------- 3 / 4) the storeyed depths (and their ruin)
  F.gen = { grave: genGrave, gate: genGate, halls: (a, s, e, g, k) => G.Strata.gen(a, s, e, g, k, false), ruin: (a, s, e, g, k) => G.Strata.gen(a, s, e, g, k, true) };
  // route LevelGen.generate through the field generators
  const gen0 = LG.generate;
  LG.generate = function (area, seed, opts) {
    opts = opts || {};
    const field = G.Run ? G.Run.field(area) : null, f = F.gen[field];
    if (!f) return gen0(area, seed, opts);
    for (let t = 0; t < 8; t++) {
      const w = f(area, (seed + t * 7919) >>> 0, opts.extraChests, opts.gates || 3, opts.kind);
      if (w && H.validate(w)) { w.seed = seed; w.field = field; H.fireTops(w, {}); return w; }
    }
    return gen0(area, seed, opts);
  };

  // ---------------------------------------------------------------- guardian approach (flat; no stairs anywhere)
  function roadGrave(w, rng, W, AD, D) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 4.5;
    w.solid('floor', 0, -1, gz1, W, 0, D, { uv: 2 });
    w.visual('cobble', cx - hw, 0, gz1, cx + hw, 0.03, D, { uv: 2, grad: false });
    // cemetery walls either side of the road; the land beyond is graves under the moon
    const side = 15;
    w.solid('block', 0, 0, gz1, cx - side, 4.6, D, { uv: 3 }); w.solid('block', cx + side, 0, gz1, W, 4.6, D, { uv: 3 });
    for (let z = gz1 + 6; z < D - 4; z += 7) for (const sx of [-1, 1]) {
      const fx = cx + sx * (hw + 1.2);
      F.fence(w, fx, z, fx, z + 5, 1.2, []);
      for (let k = 0; k < 2; k++) P().gravestone(w, cx + sx * rng.range(hw + 3, side - 1.5), z + rng.range(0.5, 4.5), 0, rng.range(-0.3, 0.3), rng);
      if (rng.chance(0.4)) F.deadTree(w, cx + sx * rng.range(hw + 4, side - 2), z + 2.5, rng, rng.range(1, 1.3));
      if ((z / 7) % 2 < 1) F.lantern(w, cx + sx * (hw + 0.6), z + 3, sx < 0 ? '#ffb070' : '#9ab4ff');
    }
    // the arena gate: stone gate piers and an iron gate that slams shut behind you
    const gate = 3.2;
    w.solid('block', 0, 0, gz0, cx - gate, 4.6, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, 4.6, gz1, { uv: 4 });
    for (const sx of [-1, 1]) { w.solid('trim', cx + sx * gate - 0.7, 0, gz0 - 0.4, cx + sx * gate + 0.7, 7, gz1 + 0.4, { uv: 2 }); P().skull(w, cx + sx * gate, 7.2, gz1, 0, 1.6); w.addLight(cx + sx * gate, 7.6, gz1 + 1, { flame: 0.3, intensity: 7, range: 11, color: '#ff7a40', prio: 1.2 }); }
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => { const pc = H.portcullis(w, gate * 2 - 0.2, 6.2); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
    return { nz: gz1 + (D - gz1) * 0.45, side: -1, nx: cx - hw - 2.4 };
  }
  function roadHall(w, rng, W, AD, D, ruined) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 7, HC = 13;
    w.solid('floor', 0, -1, gz1, W, 0, D, { uv: 2 });
    // the corridor: walls, piers with torches, banners, a vaulted ceiling
    // a merchant alcove on the left half way down
    const nz = gz1 + (D - gz1) * 0.5;
    w.solid('block', 0, 0, gz1, cx - hw, HC + 2, nz - 5, { uv: 3 }); w.solid('block', 0, 0, nz + 5, cx - hw, HC + 2, D, { uv: 3 });
    w.solid('block', 0, 0, nz - 5, cx - hw - 6, HC + 2, nz + 5, { uv: 3 });
    w.solid('block', cx + hw, 0, gz1, W, HC + 2, D, { uv: 3 });
    w.solid('block', cx - hw - 7, HC, gz1, cx + hw + 1, HC + 2, D, { uv: 4, noGrapple: true });
    w.ceilingRoad = HC;
    for (let z = gz1 + 5; z < D - 3; z += 6) for (const sx of [-1, 1]) {
      if (sx < 0 && Math.abs(z - nz) < 7) continue;
      const x = cx + sx * (hw - 0.6);
      if (ruined && rng.chance(0.3)) { P().pillarSquare(w, x, z, 0, rng.range(2, 6), 1.0); P().rubble(w, x - sx * 1.2, 0, z, rng, 1); continue; }
      P().pillarSquare(w, x, z, 0, HC, 1.0);
      if ((z / 6) % 2 < 1) P().torch(w, x - sx * 0.65, 3.6, z, sx < 0 ? 'px' : 'nx'); else if (rng.chance(0.5)) P().banner(w, cx + sx * hw, 9, z + 3, sx < 0 ? 'px' : 'nx', 5, ruined ? 0x101a3a : 0x4a0e0e);
    }
    P().rug(w, cx - hw - 3, nz, 0, 5, 8, [0.18, 0.12, 0.08]);
    for (let z = gz1 + 2; z < D; z += 14) P().chandelier(w, cx, HC - 4, z + 5, HC);
    if (ruined) for (let i = 0; i < 5; i++) P().rubble(w, cx + rng.range(-hw + 1.5, hw - 1.5), 0, rng.range(gz1 + 6, D - 6), rng, rng.range(0.6, 1.1));
    // the facade toward the arena + the sliding stone door (opens by itself as you come, shuts once you are through)
    const gate = 3.2, dh = 8;
    w.solid('block', 0, 0, gz0, cx - gate, HC + 2, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, HC + 2, gz1, { uv: 4 });
    w.solid('block', cx - gate, dh, gz0, cx + gate, HC + 2, gz1, { uv: 4 });
    w.visual('trim', cx - gate - 0.6, 0, gz1, cx - gate, dh + 0.6, gz1 + 0.3, { uv: 1 }); w.visual('trim', cx + gate, 0, gz1, cx + gate + 0.6, dh + 0.6, gz1 + 0.3, { uv: 1 });
    w.visual('trim', cx - gate - 0.6, dh, gz1, cx + gate + 0.6, dh + 0.6, gz1 + 0.3, { uv: 1 });
    for (const sx of [-1, 1]) w.addLight(cx + sx * (gate + 1.2), 5, gz1 + 1.2, { flame: 0.3, intensity: 7, range: 10, color: ruined ? '#4a8aff' : '#ff9a50', prio: 1.2 });
    const col = w.addCollider(cx - gate, 0, gz0 + 1.2, cx + gate, dh, gz1 - 0.6, { surf: 'stone', noGrapple: true });
    const door = { x: cx, gate, dh, z: (gz0 + gz1) / 2 + 0.3, col, k: 0, mesh: null, state: 'closed' };
    w.deferred.push((grp) => {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(PG().box, w.mats.block); slab.scale.set(gate * 2, dh, 1.0); slab.position.y = dh / 2; g.add(slab);
      const rune = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.25, 6), new THREE.MeshBasicMaterial({ color: 0xff7040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      rune.position.set(0, dh / 2, 0.52); g.add(rune);
      for (const y of [1.2, dh - 1.2]) { const band = new THREE.Mesh(PG().box, w.mats.iron); band.scale.set(gate * 2 + 0.02, 0.25, 1.05); band.position.y = y; g.add(band); }
      g.position.set(cx, 0, door.z); grp.add(g); door.mesh = g; door.rune = rune;
    });
    w.slideDoor = door;
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2, pc: null, slide: door };
    return { nz, side: -1, nx: cx - hw - 3 };
  }
  // the door: slides sideways into the wall when you approach (before the fight), back shut once you're in
  F.tickDoor = function (dt) {
    const w = G.world, d = w && w.slideDoor; if (!d || !d.mesh) return;
    const GM = G.game, P = G.player;
    const want = GM.bossEngaged || GM.areaCleared ? (GM.areaCleared ? 1 : 0) : (P.pos.z > d.z && P.pos.z - d.z < 14 && Math.abs(P.pos.x - d.x) < 9 ? 1 : d.k > 0.5 ? 1 : 0);
    const prev = d.k;
    d.k = U.clamp(d.k + (want ? dt * 0.8 : -dt * 2.2), 0, 1);
    if (d.k !== prev) {
      d.mesh.position.x = d.x + d.k * (d.gate * 2 + 0.2);
      if (Math.random() < dt * 30) G.fx.dust(V(d.x - d.gate + d.k * d.gate * 2, 0.2, d.z + 0.6), V(0, 1, 0), 0x6a5a48, 2);
      if (!d.grind || GM.time - d.grind > 0.35) { d.grind = GM.time; G.sfx.stoneGrind && G.sfx.stoneGrind(V(d.x, 2, d.z), 0.7); }
      if (prev < 1 && d.k >= 1) G.sfx.rumble && G.sfx.rumble(0.5, 0.5);
      if (prev > 0 && d.k <= 0) { G.sfx.explosion(V(d.x, 1, d.z), 0.4); P.addShake(0.4); }
    }
    d.col.alive = d.k < 0.85;
    if (d.rune) d.rune.material.opacity = 0.5 + 0.4 * Math.sin(GM.time * 3);
  };

  // ---------------------------------------------------------------- ancient stone vending machine (coins -> items)
  F.stoneVendor = function (w, x, z, y, face) {
    y = y || 0;
    const sx = face || 1; // +1: faces +x
    w.solid('block', x - 0.9, y, z - 1.2, x + 0.9, y + 3.0, z + 1.2, { uv: 2 });
    w.solid('trim', x - 1.05, y + 3.0, z - 1.35, x + 1.05, y + 3.4, z + 1.35, { uv: 1 });
    w.visual('trim', x - 1.0, y, z - 1.3, x + 1.0, y + 0.3, z + 1.3, { uv: 1 });
    const fx = x + sx * 0.92;
    w.visual('dark', fx - 0.02, y + 0.6, z - 0.5, fx + 0.02, y + 1.0, z + 0.5, { uv: 1, grad: false }); // the tray slot
    w.visual('glow', fx - 0.02, y + 2.2, z - 0.15, fx + 0.02, y + 2.5, z + 0.15, { uv: 1, grad: false }); // the coin slot glows
    const obj = { pos: V(x + sx * 1.2, y + 1.4, z), runes: [] };
    w.deferred.push((grp) => {
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), new THREE.MeshBasicMaterial({ map: G.Tex.textTex(['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ'][i], { size: 40, color: '#7ae0ff' }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.position.set(fx + sx * 0.03, y + 1.3 + (i % 3) * 0.35, z - 0.6 + Math.floor(i / 3) * 1.2); m.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(m); obj.runes.push(m);
      }
    });
    w.addLight(x + sx * 1.4, y + 2, z, { flame: 0, intensity: 5, range: 8, color: '#7ae0ff', emit: false, prio: 1.4, steady: true });
    return obj;
  };

  // ---------------------------------------------------------------- the last guardian's field (extra, the last area)
  // A floating arena of 7x7 stone tiles over a bottomless dark, under a crimson sky. The guardian tears tiles away and raises them again
  // (see bosses6.js); whoever falls takes a heavy hit and is put back on the ledge at the entrance.
  F.TILE_N = 7; F.TILE_S = 8;
  F.finalArena = function (area, seed) {
    const rng = new G.RNG(seed);
    const W = 76, AD = 76, ROAD = 82, D = AD + ROAD;
    const w = new G.World(W, D, 'crimson');
    w.arenaD = AD; w.bossStyle = { arena: 'void', facade: 'ruin' }; w.field = 'ruin'; w.final = true;
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const cx = W / 2, cz = AD / 2 - 2, N = F.TILE_N, S = F.TILE_S;
    const LEDGE = 64; // the entrance ledge (never collapses) starts here
    // no floor at all in the arena: only the ledge and the road
    const pit = new Uint8Array(W * (AD + 3));
    for (let z = 0; z < LEDGE; z++) for (let x = 0; x < W; x++) pit[z * W + x] = 1;
    H.floors(w, W, AD + 3, pit, 'cobble');
    H.perimeter(w, rng, W, D, { beams: 0, gates: 3, noExits: true, voidArena: true, arenaD: AD, h: 8, openNorth: true });
    const nook = roadHall(w, rng, W, AD, D, true);
    const vx = nook.nx, vz = nook.nz;
    w.stoneVendor = F.stoneVendor(w, vx - 0.6, vz, 0, 1);
    w.roadMerchant = w.stoneVendor.pos.clone().setY(0);
    w.miniSlots = [];
    w.miniHeal = V(vx + 1.6, 0, vz + 4.2);
    w.road = { z0: AD + 7, z1: D - 4 };
    w.npcSpots = [];
    w.killY = -24; // deep: you watch yourself fall a while before the void takes you
    w.arenaCenter = V(cx, 0, cz);
    w.bossPillars = [];
    w.fallFrac = 0.32; w.fallSpot = V(cx, 0.1, AD - 4); // a fall costs 32% x the enemy-damage factor (1.25) = about 40% of max HP
    // once the fight is on you come back on the whole tile nearest to where you fell (the ledge is sealed then, see bosses6.js TR.seal)
    w.fallSpotAt = (p) => { const TR = G.bosses.terrain; if (TR.stage) return TR.stageSpot(p); const t = TR.nearestSafe(p); return t && G.game.bossEngaged ? V(t.cx, 0.1, t.cz) : w.fallSpot; };
    w.ledgeZ = LEDGE;
    w.bossHome = V(cx, 0, -16); // the guardian stands across the void, north of the tiles, out of reach
    w.fogK = 0.5; // thinner fog during the fight: the giant must be readable 30-80 m away
    // the tiles: one slab + one collider each, so a tile can be taken away and given back
    w.tiles = [];
    const x0 = cx - N * S / 2, z0 = cz - N * S / 2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx0 = x0 + i * S, tz0 = z0 + j * S;
      const m = new THREE.Mesh(PG().box, w.mats[(i + j) % 2 ? 'block' : 'floor'].clone());
      m.scale.set(S - 0.08, 1, S - 0.08); m.position.set(tx0 + S / 2, -0.5, tz0 + S / 2); m.receiveShadow = true;
      m.material.emissive = new THREE.Color(0x000000);
      w.group.add(m);
      const col = w.addCollider(tx0 + 0.04, -1, tz0 + 0.04, tx0 + S - 0.04, 0, tz0 + S - 0.04, { surf: 'stone', noGrapple: false });
      w.tiles.push({ i, j, x0: tx0, z0: tz0, x1: tx0 + S, z1: tz0 + S, cx: tx0 + S / 2, cz: tz0 + S / 2, mesh: m, col, state: 'up', timer: 0, dy: 0, vy: 0 });
    }
    // the dark below, glowing violet-red far down
    w.visual('voidglow', -40, -34, -60, W + 40, -33.9, LEDGE, { uv: 6, grad: false }); // (on past the open north side, under the guardian)
    for (let z = 8; z < LEDGE; z += 18) for (let x = 8; x < W; x += 20) w.addLight(x, -20, z, { flame: 0, intensity: 14, range: 20, color: '#ff3a8a', emit: false, prio: 0.6, steady: true });
    // the entrance ledge: braziers and a low parapet
    for (const sx of [-1, 1]) { P().brazier(w, cx + sx * 12, 0, LEDGE + 3, 1.2); P().pillarSquare(w, cx + sx * 20, LEDGE + 2, 0, 9, 1.4); }
    w.visual('trim', 4, 0, LEDGE - 0.3, W - 4, 0.3, LEDGE, { uv: 1 });
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    w.isBoss = true;
    if (w.slideDoor) w.slideDoor.col.alive = false;
    H.validate(w);
    if (w.slideDoor) w.slideDoor.col.alive = true;
    return w;
  };

  // ---------------------------------------------------------------- the guardian's field
  LG.boss = function (area, seed, bossId) {
    if (bossId === 'sovereign') return F.finalArena(area, seed);
    const rng = new G.RNG(seed);
    const style = LG.bossStyle(bossId, seed);
    if (style.arena === 'throne') style.arena = 'fortress';
    const field = G.Run ? G.Run.field(area) : 'gate';
    const outdoor = field === 'grave';
    const W = 76, AD = 76, ROAD = 82, D = AD + ROAD;
    const w = new G.World(W, D, G.Tex.biomeFor(area));
    w.arenaD = AD; w.bossStyle = style; w.field = field;
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const cx = W / 2, cz = AD / 2 - 2;
    H.floors(w, W, AD + 3, null, style.arena === 'colosseum' ? 'floor' : 'cobble');
    H.perimeter(w, rng, W, D, { beams: 0, gates: 3, noExits: !!(G.Run && G.Run.isLast(area)), h: outdoor ? 3.2 : 16, top: outdoor ? undefined : 24 });
    if (outdoor) {
      // the guardian's field is ringed by a tall iron fence on the low cemetery wall
      F.fence(w, 0.2, 0.2, W - 0.2, 0.2, 5.5, G.Run && G.Run.isLast(area) ? [] : LG.gateXs(W, 3).map((g) => [g - 2.6, g + 2.6]));
      F.fence(w, 0.2, 0.2, 0.2, AD, 5.5, []); F.fence(w, W - 0.2, 0.2, W - 0.2, AD, 5.5, []);
    } else F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 2, ruined: field === 'ruin' });
    const nook = outdoor ? roadGrave(w, rng, W, AD, D) : roadHall(w, rng, W, AD, D, field === 'ruin');
    // the stone vending machine + the paid basin
    const vx = nook.nx, vz = nook.nz;
    w.stoneVendor = F.stoneVendor(w, vx - 0.6, vz, 0, 1);
    w.roadMerchant = w.stoneVendor.pos.clone().setY(0);
    w.miniSlots = [];
    w.miniHeal = V(vx + 1.6, 0, vz + 4.2);
    w.road = { z0: AD + 7, z1: D - 4 };
    w.npcSpots = [];
    w.killY = -12;
    w.arenaCenter = V(cx, 0, cz);
    w.bossPillars = [];
    (H.ARENA[style.arena] || H.ARENA.fortress)(w, rng, W, AD, cx, cz);
    H.arenaDressing(w, rng, W, AD, cx, cz);
    w.nestPos = V(W - 4, 11, cz);
    if (bossId === 'broodmother') {
      w.solid('rock', W - 8, 9, cz - 7, W, 10.5, cz + 7, { uv: 4 });
      for (let i = 0; i < 6; i++) P().web(w, rng.range(W - 8, W - 1), rng.range(7, 13), cz + rng.range(-7, 7), Math.PI / 2, rng.range(3, 6));
    }
    if (!outdoor) H.lightShafts(w, rng, W, AD, 3);
    H.fireTops(w, { boss: true, AD });
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    w.isBoss = true;
    // judge reachability with the stone door open (it opens as you arrive)
    if (w.slideDoor) w.slideDoor.col.alive = false;
    H.validate(w);
    if (w.slideDoor) w.slideDoor.col.alive = true;
    return w;
  };
})();
