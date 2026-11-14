'use strict';
// 凍てつく霊廟 (frozen, the deep tier), on a framework of its own: the mausoleum's great hall stands over a lake frozen solid. The floor
// of the fight is the ice itself: slick underfoot, and it does not hold. An explosion or a falling icicle cracks it (white lines),
// a second blow breaks it out, and below is the lake's black water, right under the ice (WY: the ice floats on it). Whoever goes in swims (player.js swim: hold
// jump to rise, at the face a hop, and moving at the rim of the hole with jump held you climb out onto the ice); the water leaves its
// element on you. Under the ice that still holds you can swim on, its underside against your head, your face in the water (only in a
// hole can you come up for air). Let go and you sink: DEEP metres
// under the face is the void (w.killY: back to where you last stood firm, 15% of your HP gone). A foe that goes in sinks and is lost.
// A broken patch freezes over again in a while. Round the lake a stone shore, and tomb islands stand up out of the ice; icicles still
// fall from the vault (fieldgen_t4.js F.tickIcicles).
// The water's open face is in w.waterZones only where it is open to the air (a broken tile, the channel that never froze: its
// splashes, the sound of it, a shot or a blast that throws it up); the whole lake under the ice is w.deepWater (the swimming, the
// look under the water, the water element on whatever is in it: fields.js).
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const FZ = () => F._frozen;
  const TS = 3, HT = 16, REFREEZE = 24;
  const WY = -0.55, DEEP = 7; // the lake's face, just under the ice's underside (-0.5); how far under it the water goes before it is the void

  function genFrozen(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const W = 82 + rng.int(0, 2) * 4, D = 92 + rng.int(0, 2) * 4;
    const w = new G.World(W, D, 'frozen');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    w.killY = WY - DEEP;
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'frozen', ['lake', 'tombs', 'channel']);
    w.layout = layout;
    // ---- the lake: a rectangle of ice tiles between the shores (the ice keeps a margin of stone along the side walls)
    const SH = 6, lx0 = SH, lx1 = W - SH, lz0 = 16, lz1 = D - 12;
    const nX = Math.floor((lx1 - lx0) / TS), nZ = Math.floor((lz1 - lz0) / TS), ix0 = lx0 + ((lx1 - lx0) - nX * TS) / 2, iz0 = lz0 + ((lz1 - lz0) - nZ * TS) / 2;
    // islands of stone in the ice (tombs on plinths): where they stand there is no ice
    const isl = [];
    const nI = layout === 'tombs' ? rng.int(5, 7) : layout === 'channel' ? 2 : rng.int(2, 4);
    for (let t = 0; t < 80 && isl.length < nI; t++) {
      const sw = rng.int(3, 5) * TS, sd = rng.int(2, 4) * TS, x0 = ix0 + rng.int(1, nX - sw / TS - 1) * TS, z0 = iz0 + rng.int(1, nZ - sd / TS - 1) * TS;
      const r = { x0, z0, x1: x0 + sw, z1: z0 + sd };
      if (isl.some((q) => r.x0 < q.x1 + TS * 2 && r.x1 > q.x0 - TS * 2 && r.z0 < q.z1 + TS * 2 && r.z1 > q.z0 - TS * 2)) continue;
      isl.push(r);
    }
    // the channel: a strip down the middle that never froze (open water: a line you cross on the islands or round the shore)
    const chan = layout === 'channel' ? { x0: W / 2 - 4.5, x1: W / 2 + 4.5 } : null;
    // ---- build: the shores and landings (stone), the bed of the lake far down (dark water), the ice, the islands
    w.solid('floor', 0, -1, 0, W, 0, lz0, { uv: 4 }); w.solid('floor', 0, -1, lz1, W, 0, D, { uv: 4 });
    w.solid('floor', 0, -1, lz0, lx0, 0, lz1, { uv: 4 }); w.solid('floor', lx1, -1, lz0, W, 0, lz1, { uv: 4 });
    for (const [a, b] of [[0, lx0], [lx1, W]]) w.solid('rock', a, -12, lz0, b, -1, lz1, { uv: 6, grad: false });
    w.solid('rock', 0, -12, 0, W, -1, lz0, { uv: 6, grad: false }); w.solid('rock', 0, -12, lz1, W, -1, D, { uv: 6, grad: false });
    w.visual('water', lx0, WY - 0.05, lz0, lx1, WY, lz1, { uv: 4, grad: false, skip: { bottom: true }, tint: [0.35, 0.5, 0.6] });
    w.visual('dark', lx0, -9, lz0, lx1, -8.9, lz1, { uv: 4, grad: false });
    // the water itself: the whole lake under the ice (no bed: open = a body going in through its face splashes there, player.js; lid:
    // ice over it but where w.waterZones has a pool marked lake - a hole, the channel: water.js / post.js, the light from above). The
    // hall is roofed: its water mirrors the dark vault, not a sky (water.js)
    w.deepWater = [{ x0: lx0, z0: lz0, x1: lx1, z1: lz1, y: WY, open: true, lid: true }];
    w.waterRoofed = true;
    for (const r of isl) { w.solid('block', r.x0, -10, r.z0, r.x1, 0.6, r.z1, { uv: 3 }); w.solid('trim', r.x0 - 0.1, 0.6, r.z0 - 0.1, r.x1 + 0.1, 0.85, r.z1 + 0.1, { uv: 1.5 }); }
    w.iceTiles = [];
    let cx0 = Infinity, cx1 = -Infinity;
    for (let k = 0; k < nZ; k++) for (let i = 0; i < nX; i++) {
      const x0 = ix0 + i * TS, z0 = iz0 + k * TS, cx = x0 + TS / 2, cz = z0 + TS / 2;
      if (isl.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1)) continue;
      if (chan && cx > chan.x0 && cx < chan.x1) { cx0 = Math.min(cx0, x0); cx1 = Math.max(cx1, x0 + TS); continue; }
      const col = w.addCollider(x0, -0.5, z0, x0 + TS, 0, z0 + TS, { surf: 'ice', noGrapple: true });
      // (zone: its open water while it is broken, put in w.waterZones and taken out again by setTile)
      w.iceTiles.push({ k: w.iceTiles.length, x0, z0, x1: x0 + TS, z1: z0 + TS, col, hp: 2, t: 0, mesh: null, crack: null, zone: { x0, z0, x1: x0 + TS, z1: z0 + TS, y: WY, deep: DEEP, lake: true } });
    }
    // the channel that never froze: open water from end to end (its ends under the never-breaking ice round the tiles)
    if (cx1 > cx0) w.waterZones.push({ x0: cx0, z0: iz0, x1: cx1, z1: iz0 + nZ * TS, y: WY, deep: DEEP, lake: true });
    // the gaps round the ice (between the tile grid and the shore) are ice too, never breaking
    for (const [a, b, c, d] of [[lx0, lz0, lx1, iz0], [lx0, iz0 + nZ * TS, lx1, lz1], [lx0, iz0, ix0, iz0 + nZ * TS], [ix0 + nX * TS, iz0, lx1, iz0 + nZ * TS]]) if (c - a > 0.01 && d - b > 0.01) w.solid('ice', a, -0.5, b, c, 0, d, { uv: 3, grad: false });
    // the ice's own look: all the tiles in one instanced mesh (a broken tile's instance is shrunk away), the cracks in another
    const iceMat = w.mats.ice, Z = new THREE.Matrix4().makeScale(0, 0, 0);
    w.deferred.push((grp) => {
      const n = w.iceTiles.length; if (!n) return;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(TS - 0.02, 0.5, TS - 0.02), iceMat, n); im.receiveShadow = true;
      const cm = new THREE.InstancedMesh(PG().box, new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.85, depthWrite: false }), n * 4);
      const m = new THREE.Matrix4();
      w.iceTiles.forEach((t, i) => {
        t.i = i; t.m = new THREE.Matrix4().makeTranslation((t.x0 + t.x1) / 2, -0.25, (t.z0 + t.z1) / 2); im.setMatrixAt(i, t.m);
        t.cm = [];
        for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI + rng.range(0, 0.4); const q = new THREE.Matrix4().compose(V((t.x0 + t.x1) / 2 + Math.cos(a) * 0.25, 0.012, (t.z0 + t.z1) / 2 + Math.sin(a) * 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), V(TS * rng.range(0.5, 0.9), 0.01, 0.05)); t.cm.push(q); cm.setMatrixAt(i * 4 + k, Z); }
      });
      im.instanceMatrix.needsUpdate = true; cm.instanceMatrix.needsUpdate = true;
      grp.add(im); grp.add(cm); w.iceMesh = { im, cm, Z };
      grp.add(floeSample(w, W / 2, D / 2));
    });
    // ---- the hall: walls, the vault with its icicles, ice-sheathed pillars on the shore, frozen statues, braziers burning blue-white
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0 });
    F.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: rng.int(0, 2) });
    FZ().vaultIcicles(w, rng, W, D, HT, 60);
    for (let z = lz0 + 4; z < lz1 - 2; z += 10) for (const x of [SH / 2, W - SH / 2]) { FZ().icePillar(w, rng, x, z, HT); occ.mark(x - 2, z - 2, x + 2, z + 2); }
    for (const r of isl) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
      P().sarcophagus(w, cx, cz, 0.85, true, rng);
      if (rng.chance(0.6)) P().crystals(w, r.x0 + 1, 0.85, r.z0 + 1, rng, 1.2);
      if (rng.chance(0.6)) P().brazier(w, r.x1 - 1, 0.85, r.z1 - 1, 1);
      w.platTops.push({ x0: r.x0 + 0.6, z0: r.z0 + 0.6, x1: r.x1 - 0.6, z1: r.z1 - 0.6, y: 0.85, cx: r.x0 + 1.4, cz: r.z1 - 1.4 });
    }
    for (let i = 0; i < 3; i++) { const z = rng.range(lz0 + 4, lz1 - 4), x = rng.chance(0.5) ? SH / 2 + 0.5 : W - SH / 2 - 0.5; if (occ.free(x - 1.5, z - 1.5, x + 1.5, z + 1.5)) { occ.mark(x - 1.5, z - 1.5, x + 1.5, z + 1.5); FZ().frozenStatue(w, rng, x, z); } }
    for (const g of LG.gateXs(W, gates)) { P().brazier(w, g - 5, 0, 4.5, 1, true); P().brazier(w, g + 5, 0, 4.5, 1, true); }
    for (let x = 8; x < W - 6; x += 12) if (Math.abs(x - W / 2) > 6) { P().sarcophagus(w, x, D - 5, 0, rng.chance(0.5), rng); occ.mark(x - 1.6, D - 6.2, x + 1.6, D - 3.8); }
    for (let i = 0; i < 6; i++) w.addLight(rng.range(lx0, lx1), -1, rng.range(lz0, lz1), { flame: 0, intensity: 5, range: 9, color: '#6ac8ff', emit: false, prio: 0.4 });
    // hoarfrost on the walls
    for (let z = 8; z < D - 4; z += 7) for (const side of [0, W]) { const y0 = rng.range(2, 6), y1 = rng.range(8, 12), z1 = z + rng.range(1, 3); if (!P().put(w, 'icefall', side === 0 ? 0.02 : W - 0.02, y0, (z + z1) / 2, side === 0 ? Math.PI / 2 : -Math.PI / 2, 1, { sx: (z1 - z) * 1.5, sy: y1 - y0, sz: 0.3 })) w.visual('ice', side === 0 ? 0 : W - 0.03, y0, z, side === 0 ? 0.03 : W, y1, z1, { uv: 2, grad: false }); }   // (ice run down the wall and frozen in ribs: gfx.js)
    w.icicles = { y: HT, next: 4 };
    // what is laid afterwards: not on the ice (it would go down with it); on the shores, landings and islands
    occ.mark(lx0, lz0, lx1, lz1, 2);
    for (const r of isl) occ.mark(r.x0 + 0.5, r.z0 + 0.5, r.x1 - 0.5, r.z1 - 0.5, 0);
    w.unsafeGround = (x, z) => x > ix0 && x < ix0 + nX * TS && z > iz0 && z < iz0 + nZ * TS && !isl.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.frozen = genFrozen;

  // ---------------------------------------------------------------- the ice that breaks
  // a tile's look: whole, cracked (its white lines shown) or gone (shrunk away)
  function iceLook(w, t, s) {
    const M = w.iceMesh; if (!M || t.i == null) return;
    M.im.setMatrixAt(t.i, s === 'gone' ? M.Z : t.m);
    for (let k = 0; k < 4; k++) M.cm.setMatrixAt(t.i * 4 + k, s === 'crack' ? t.cm[k] : M.Z);
    M.im.instanceMatrix.needsUpdate = true; M.cm.instanceMatrix.needsUpdate = true;
  }
  // a broken tile's open water in the area's pools (w.waterZones: water.js and fields.js see it as water open to the air), or taken out
  function openWater(w, t, on) {
    if (!t.zone || !w.waterZones) return;
    const i = w.waterZones.indexOf(t.zone);
    if (on && i < 0) w.waterZones.push(t.zone);
    else if (!on && i >= 0) w.waterZones.splice(i, 1);
  }
  // ---------------------------------------------------------------- the broken ice: its pieces afloat in the hole
  // What breaks out of a tile is not glass: the slab itself, broken into a few plates along straight cracks, as thick as the ice; their
  // tops the ice's own face, their broken sides clouded white and never even, a chip off their edges here and there. The blow throws them
  // up a little; they drop back into the hole and float in it as ice does (nearly all of it under), rocking a little and drifting apart,
  // until the hole freezes over again (they go with it) or they have melted down (16-24 s). Only looks: nothing stands on them.
  const FH = 0.42; // m: a plate's thickness
  let FLM = null;
  const floeSide = () => FLM || (FLM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, envMapIntensity: 0.3 }));
  // the slab's outline broken into n convex pieces: each time the biggest one is cut along a line through near its middle
  const polyArea = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; } return Math.abs(a) / 2; };
  const polyMid = (p) => p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0]);
  function cutSlab(R, x0, z0, x1, z1, n) {
    const ps = [[[x0, z0], [x1, z0], [x1, z1], [x0, z1]]];
    for (let tries = 0; ps.length < n && tries < 40; tries++) {
      ps.sort((a, b) => polyArea(b) - polyArea(a));
      const p = ps.shift(), c = polyMid(p), ang = R() * Math.PI, nx = Math.cos(ang), nz = Math.sin(ang), off = (R() - 0.5) * 0.35;
      const side = (q) => (q[0] - c[0]) * nx + (q[1] - c[1]) * nz - off, A = [], B = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], sa = side(a), sb = side(b);
        (sa >= 0 ? A : B).push(a);
        if ((sa >= 0) !== (sb >= 0)) { const k = sa / (sa - sb), q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; A.push(q); B.push(q); }
      }
      if (A.length < 3 || B.length < 3 || polyArea(A) < 0.3 || polyArea(B) < 0.3) { ps.push(p); continue; }
      ps.push(A, B);
    }
    return ps;
  }
  // a plate: its outline p (world x, z), drawn about its middle. The top and bottom take the ice's own face (uv as the tile's, so its
  // pattern runs on across the break); the sides are the break: white, uneven (each side bent in or out part-way down, its top edge
  // chipped), darker where they sat in the water
  function plateGeo(R, p, t) {
    const c = polyMid(p), pts = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez) || 1, nx = ez / L, nz = -ex / L;
      for (const k of [0, 0.34, 0.68]) { const j = k ? (R() - 0.5) * 0.09 : 0; pts.push([a[0] + ex * k + nx * j, a[1] + ez * k + nz * j]); }
    }
    // (pulled in a little from the cracks, so that the plates stand apart)
    const q = pts.map((v) => { const dx = v[0] - c[0], dz = v[1] - c[1], l = Math.hypot(dx, dz) || 1, s = Math.max(0.2, l - 0.05) / l; return [dx * s, dz * s]; });
    const P = [], N = [], UV = [], C = [], h = FH / 2, n = q.length;
    const uvOf = (x, z) => [(x + c[0] - t.x0) / TS, (z + c[1] - t.z0) / TS];
    const tri = (A, B, Cc, col) => { for (const v of [A, B, Cc]) { P.push(v[0], v[1], v[2]); const u = uvOf(v[0], v[2]); UV.push(u[0], u[1]); C.push(col[0], col[1], col[2]); } };
    // top and bottom (a fan about the middle)
    for (let i = 0; i < n; i++) { const a = q[i], b = q[(i + 1) % n]; tri([0, h, 0], [b[0], h, b[1]], [a[0], h, a[1]], [1, 1, 1]); }
    for (let i = 0; i < n; i++) { const a = q[i], b = q[(i + 1) % n]; tri([0, -h, 0], [a[0], -h, a[1]], [b[0], -h, b[1]], [1, 1, 1]); }
    const top = P.length / 3;
    // the broken sides: each strip of the outline down to the bottom, through a bend part-way down
    const bend = q.map(() => (R() - 0.35) * 0.05), chip = q.map(() => (R() < 0.3 ? R() * 0.05 : 0));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = q[i], b = q[j], la = Math.hypot(a[0], a[1]) || 1, lb = Math.hypot(b[0], b[1]) || 1;
      const ma = [a[0] + a[0] / la * bend[i], -h * 0.15, a[1] + a[1] / la * bend[i]], mb = [b[0] + b[0] / lb * bend[j], -h * 0.15, b[1] + b[1] / lb * bend[j]];
      const ta = [a[0], h - chip[i], a[1]], tb = [b[0], h - chip[j], b[1]], ba = [a[0], -h, a[1]], bb = [b[0], -h, b[1]];
      const w0 = 0.6 + R() * 0.2, wu = [w0, w0 * 1.02, w0 * 1.04], wd = [w0 * 0.55, w0 * 0.62, w0 * 0.68];
      tri(ta, tb, mb, wu); tri(ta, mb, ma, wu); tri(ma, mb, bb, wd); tri(ma, bb, ba, wd);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    g.addGroup(0, top, 0); g.addGroup(top, P.length / 3 - top, 1);
    let r = 0; for (const v of q) r = Math.max(r, Math.hypot(v[0], v[1]));
    return { g, c, r };
  }
  // (one, tiny, inside the rock under the shore: the area's warm-up makes its shaders with the area's, and the first break does not)
  function floeSample(w, x, z) { const pg = plateGeo(Math.random, [[0, 0], [1, 0], [1, 1], [0, 1]], { x0: 0, z0: 0 }); const m = new THREE.Mesh(pg.g, [w.mats.ice, floeSide()]); m.position.set(x, -11.5, z); m.scale.setScalar(0.02); m.castShadow = false; return m; }
  function spawnFloes(w, t) {
    if (!w.group) return;
    const R = Math.random, M = [w.mats.ice, floeSide()], cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
    w.floes = w.floes || [];
    for (const p of cutSlab(R, t.x0 + 0.04, t.z0 + 0.04, t.x1 - 0.04, t.z1 - 0.04, 5 + Math.floor(R() * 3))) {
      const pg = plateGeo(R, p, t), m = new THREE.Mesh(pg.g, M), dx = pg.c[0] - cx, dz = pg.c[1] - cz, l = Math.hypot(dx, dz) || 1;
      m.position.set(pg.c[0], -FH / 2 - 0.04, pg.c[1]); m.rotation.set((R() - 0.5) * 0.1, 0, (R() - 0.5) * 0.1); m.castShadow = false; m.receiveShadow = true;
      w.group.add(m);
      const sp = 0.15 + R() * 0.35;
      w.floes.push({ m, k: t.k, x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1, r: pg.r, vx: dx / l * sp, vz: dz / l * sp, vy: 0.6 + R() * 1.4,
        ax: (R() - 0.5) * 2.4, ay: (R() - 0.5) * 0.8, az: (R() - 0.5) * 2.4, wet: false, t: 0, life: 16 + R() * 8, ph: R() * 6.28 });
    }
  }
  function floesGo(w, k) {
    if (!w.floes) return;
    for (let i = w.floes.length - 1; i >= 0; i--) { const f = w.floes[i]; if (k != null && f.k !== k) continue; if (f.m.parent) f.m.parent.remove(f.m); f.m.geometry.dispose(); w.floes.splice(i, 1); }
  }
  // each frame (fields.js F.update, on every screen): the plates thrown up, dropping in, afloat
  F.tickFloes = function (w, dt) {
    const L = w && w.floes; if (!L || !L.length) return;
    const yF = WY + 0.04 - FH / 2; // (afloat: its top a few centimetres out of the water)
    for (let i = L.length - 1; i >= 0; i--) {
      const f = L[i], m = f.m, p = m.position; f.t += dt;
      const rr = Math.min(f.r, (f.x1 - f.x0) / 2 - 0.05), fit = (lo, hi, v) => Math.max(lo + rr, Math.min(hi - rr, v));
      if (!f.wet) {
        f.vy -= 22 * dt; p.y += f.vy * dt; p.x = fit(f.x0, f.x1, p.x + f.vx * dt); p.z = fit(f.z0, f.z1, p.z + f.vz * dt);
        m.rotation.x += f.ax * dt; m.rotation.z += f.az * dt;
        if (p.y < yF && f.vy < 0) {
          f.wet = true; f.bob = f.vy * 0.12;
          if (G.Water) G.Water.ripple(p.x, p.z, 0.5);
          for (let q = 0; q < 4; q++) G.fx.norm.spawn(p.x + (Math.random() - 0.5) * f.r, WY + 0.04, p.z + (Math.random() - 0.5) * f.r, (Math.random() - 0.5) * 1.4, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4, 0.4, 0.05, 0.03, 0.84, 0.9, 0.94, 0.85, 9.8, 0.4);
        }
        continue;
      }
      // afloat: it settles with a bob or two, rocks a little, drifts apart slowly and comes to rest; melted down, it sinks out of sight
      const melt = Math.max(0, (f.t - f.life) / 3);
      f.bob *= Math.exp(-dt * 3);
      p.y += (yF + f.bob + Math.sin(f.t * 1.5 + f.ph) * 0.008 - melt * 0.5 - p.y) * Math.min(1, dt * 6);
      f.vx *= Math.exp(-dt * 0.6); f.vz *= Math.exp(-dt * 0.6);
      p.x = fit(f.x0, f.x1, p.x + f.vx * dt); p.z = fit(f.z0, f.z1, p.z + f.vz * dt);
      m.rotation.x += (Math.sin(f.t * 1.2 + f.ph) * 0.025 - m.rotation.x) * Math.min(1, dt * 2);
      m.rotation.z += (Math.cos(f.t * 1.0 + f.ph * 1.7) * 0.025 - m.rotation.z) * Math.min(1, dt * 2);
      m.rotation.y += f.ay * 0.05 * dt;
      if (melt >= 1) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); L.splice(i, 1); }
    }
  };
  // a tile's state: 2 whole, 1 cracked, 0 broken (gone: no collider, open water). fx: the crack's sound, the break's shards and splash
  function setTile(w, t, hp, fx) {
    const was = t.hp; if (hp === was) return false;
    const c = V((t.x0 + t.x1) / 2, 0, (t.z0 + t.z1) / 2);
    t.hp = hp;
    if (hp > 0) {
      if (was <= 0) { t.col.alive = true; t.t = 0; w.navPatch(t.x0, t.z0, t.x1, t.z1); w._vn = null; openWater(w, t, false); floesGo(w, t.k); }
      iceLook(w, t, hp >= 2 ? 'whole' : 'crack');
      if (fx && hp < was && G.sfx.ice) G.sfx.ice(c);
      return true;
    }
    t.t = 0; t.col.alive = false;
    iceLook(w, t, 'gone');
    openWater(w, t, true);
    if (fx) {
      spawnFloes(w, t);
      if (G.fx.iceBurst) G.fx.iceBurst(c.clone().setY(0.15), 18, 3.2, 1.4); // (the white chips and the cold puff of the break)
      if (G.Water) G.Water.splash(c.clone().setY(WY), 1.2, { silent: false });
    }
    w.navPatch(t.x0, t.z0, t.x1, t.z1); w._vn = null;
    return true;
  }
  // a blow at (x, z) within r: each tile it reaches loses a point (2 to break). Returns the tiles it changed (their k)
  F.iceHit = function (w, x, z, r, n) {
    const hit = [];
    if (!w || !w.iceTiles) return hit;
    for (const t of w.iceTiles) {
      if (t.hp <= 0) continue;
      const dx = Math.max(t.x0 - x, 0, x - t.x1), dz = Math.max(t.z0 - z, 0, z - t.z1);
      if (dx * dx + dz * dz > r * r) continue;
      if (setTile(w, t, Math.max(0, t.hp - (n || 1)), true)) hit.push(t.k);
    }
    return hit;
  };
  // a tile set as it stands somewhere else (another screen's ice): true if it changed
  F.iceSet = (w, k, hp) => { const t = w && w.iceTiles && w.iceTiles[k]; return t ? setTile(w, t, Math.max(0, Math.min(2, hp | 0)), true) : false; };
  // nobody stands in a broken tile's place (it may freeze over)
  F.iceClear = (w, t) => { const Pl = G.player; return !(Pl && Pl.pos.x > t.x0 - 0.4 && Pl.pos.x < t.x1 + 0.4 && Pl.pos.z > t.z0 - 0.4 && Pl.pos.z < t.z1 + 0.4 && Pl.pos.y < 0.5); };
  // broken ice freezes over again (only when nobody stands in its place). Returns the tiles that froze (their k)
  F.tickIce = function (w, dt) {
    const back = [];
    for (const t of w.iceTiles) {
      if (t.hp > 0) continue;
      t.t += dt;
      if (t.t < REFREEZE || !F.iceClear(w, t)) continue;
      setTile(w, t, 2, false); back.push(t.k);
    }
    return back;
  };
})();
