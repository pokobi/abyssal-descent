'use strict';
// 沈む石柱の海 (pillars, the deep tier): a sea of stone pillars standing up out of the dark, no floor under them, a violet mist far below.
// The pillars stand shoulder to shoulder at heights half a step apart, so the tops make a broken ground you can walk; channels of the
// dark run between their clusters, crossed by narrow stone beams. And the ground does not stay: while you fight, pillar after pillar
// lights up along its seams, sinks into the dark (whoever stays on it goes down with it) and some seconds later rises again.
// A way of pillars that never sink always joins the way in to the gates.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  G.Tex.BIOMES.pillars = { name: '沈む石柱の海', stone: '#868a92', stone2: '#72767e', floor: '#767a82', trim: '#a0a4ac', rock: '#44484e', wood: '#54504c', fog: '#0a0e14', fogD: 0.014, hemiS: '#6a7890', hemiG: '#12141a', amb: 0.5, moon: '#b8c8e0', moonI: 1.0, torch: '#a8c8e8', cloth: '#2a3040', accent: 'bones', outdoor: 'sky', sky: ['#010204', '#060a12', '#141c2a'], sunDir: [0.2, 0.8, -0.4], sunCol: [0.62, 0.7, 0.9], cloudCol: 0x1a2230, isletGrass: 0x30363c, stars: true };
  const C = 4;           // a pillar's width (the grid it stands on)
  const SINK = 13;       // how far a pillar goes down
  const DOWN_Y = -SINK;

  function genPillars(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const NX = 19 + rng.int(0, 2), NZ = 17 + rng.int(0, 2), LAND_S = 8, LAND_N = 11;
    const W = NX * C, D = LAND_N + NZ * C + LAND_S;
    const w = new G.World(W, D, 'pillars');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    w.noRim = true; w.killY = -9;
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'pillars', ['shoals', 'channels', 'rings']);
    w.layout = layout;
    const n1 = T.noise(seed ^ 0x3c7), cx = W / 2;
    // ---- which cells stand: 0 dark, 1 a pillar that stays, 2 one that sinks
    const cell = new Uint8Array(NX * NZ).fill(1), ht = new Float32Array(NX * NZ);
    const id = (i, k) => k * NX + i, cz0 = LAND_N;
    const ccx = (i) => i * C + C / 2, ccz = (k) => cz0 + k * C + C / 2;
    if (layout === 'channels') {
      // winding channels of the dark across the area
      for (let t = 0; t < 3; t++) { let k = rng.int(2, NZ - 3), dir = 0; for (let i = 0; i < NX; i++) { cell[id(i, k)] = 0; if (rng.chance(0.35)) { dir = rng.int(-1, 1); k = U.clamp(k + dir, 1, NZ - 2); cell[id(i, k)] = 0; } } }
    } else if (layout === 'rings') {
      // rings of the dark round a few raised hubs
      for (let t = 0; t < 4; t++) { const hi = rng.int(3, NX - 4), hk = rng.int(3, NZ - 4), r = rng.range(2.2, 3.2); for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const d = Math.hypot(i - hi, k - hk); if (Math.abs(d - r) < 0.55) cell[id(i, k)] = 0; } }
    } else {
      // shoals: the dark eats in from the edges and in holes
      for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) { const v = n1(i * 0.45, k * 0.45); if (v < 0.36) cell[id(i, k)] = 0; }
    }
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if ((i === 0 || i === NX - 1) && rng.chance(0.5)) cell[id(i, k)] = 0;
    // heights: rolling, half-step apart at most between neighbours
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) ht[id(i, k)] = Math.max(0, (T.fbm(n1, i / 4 + 7, k / 4, 2) * 0.5 + 0.5) * 6.5 - 1);
    for (let pass = 0; pass < 30; pass++) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) for (const [a, b] of [[i - 1, k], [i + 1, k], [i, k - 1], [i, k + 1]]) { if (a < 0 || b < 0 || a >= NX || b >= NZ) continue; if (ht[id(i, k)] > ht[id(a, b)] + 0.5) ht[id(i, k)] = ht[id(a, b)] + 0.5; }
    for (let k = 0; k < NZ; k++) ht[id(0, k)] = Math.min(ht[id(0, k)], 9);
    for (let n = 0; n < NX * NZ; n++) ht[n] = Math.round(ht[n] * 2) / 2;
    // the rows by the landings stay low and whole, so the ground meets the landings
    for (let i = 0; i < NX; i++) { for (const k of [0, NZ - 1]) { cell[id(i, k)] = Math.abs(ccx(i) - cx) < 14 || rng.chance(0.4) ? 1 : cell[id(i, k)]; ht[id(i, k)] = 0; } }
    for (let i = 0; i < NX; i++) for (const k of [1, NZ - 2]) ht[id(i, k)] = Math.min(ht[id(i, k)], 0.5);
    // the way that never sinks: from the way in to every gate, through standing cells where it can (it raises the cells it needs)
    const gxs = LG.gateXs(W, gates), keepWay = new Uint8Array(NX * NZ);
    const startI = Math.floor(cx / C);
    for (const g of gxs) {
      let i = startI, k = NZ - 1; const gi = U.clamp(Math.floor(g / C), 0, NX - 1);
      keepWay[id(i, k)] = 1;
      while (k > 0 || i !== gi) {
        const wantI = i !== gi && (k === 0 || rng.chance(0.35)), ni = wantI ? i + Math.sign(gi - i) : i, nk = wantI ? k : k - 1;
        if (!cell[id(ni, nk)]) { cell[id(ni, nk)] = 1; ht[id(ni, nk)] = U.clamp(ht[id(i, k)] + (rng.chance(0.5) ? 0 : 0.5) * (rng.chance(0.5) ? 1 : -1), 0, 4); }
        if (Math.abs(ht[id(ni, nk)] - ht[id(i, k)]) > 0.5) ht[id(ni, nk)] = ht[id(i, k)] + Math.sign(ht[id(ni, nk)] - ht[id(i, k)]) * 0.5;
        i = ni; k = nk; keepWay[id(i, k)] = 1;
      }
    }
    // the sinking ones: about a third of the rest, never by the landings
    for (let k = 1; k < NZ - 1; k++) for (let i = 0; i < NX; i++) if (cell[id(i, k)] && !keepWay[id(i, k)] && rng.chance(layout === 'shoals' ? 0.4 : 0.32)) cell[id(i, k)] = 2;
    // ---- build: the landings, the pillars, the beams over the dark
    w.solid('floor', 0, -0.4, 0, W, 0, LAND_N, { uv: 3 }); w.solid('rock', 2, -14, 0, W - 2, -0.4, LAND_N, { uv: 6, grad: false });
    w.solid('floor', cx - 9, -0.4, D - LAND_S, cx + 9, 0, D, { uv: 3 }); w.solid('rock', cx - 8, -14, D - LAND_S, cx + 8, -0.4, D, { uv: 6, grad: false });
    for (let x = 0; x < W; x += 2) w.visual('trim', x, 0, LAND_N - 0.3, x + 1.6, 0.35, LAND_N, { uv: 1 });
    // (the dark beyond the landings' edges: the north rock wall with the gates, rock either side of the way in)
    let ax = -2;
    for (const g of [...gxs, W + 6]) { const e = g - 5; if (e > ax) w.solid('rock', ax, -14, -4, e, 14, 0, { uv: 6, grad: false }); ax = g + 5; }
    for (const s of [-1, 1]) w.solid('rock', s < 0 ? cx - 16 : cx + 9, -14, D - LAND_S, s < 0 ? cx - 9 : cx + 16, 9, D + 3, { uv: 6, grad: false });
    H.perimeter(w, rng, W, D, { gates, h: 14, walls: false, beams: 0, stub: 2.5 });
    w.pillars = [];
    w.unsafeGround = (x, z) => !!F.pillarAt(w, x, z); // (player.js: never remember a sinking pillar as the safe place to come back to)
    const glowMat = () => new THREE.MeshBasicMaterial({ color: 0xc890ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
      const c = cell[id(i, k)]; if (!c) continue;
      const x0 = i * C + 0.13, x1 = (i + 1) * C - 0.13, z0 = cz0 + k * C + 0.13, z1 = cz0 + (k + 1) * C - 0.13, top = ht[id(i, k)], tt = 0.82 + rng.next() * 0.3;
      if (c === 1) {
        w.solid('block', x0, -40, z0, x1, top - 0.3, z1, { uv: 3, grad: false, tint: [tt, tt, tt * 1.04] });
        w.solid('floor', x0 - 0.04, top - 0.3, z0 - 0.04, x1 + 0.04, top, z1 + 0.04, { uv: 2, tint: [tt, tt, tt] });
        w.visual('trim', x0 + 0.25, top, z0 + 0.25, x1 - 0.25, top + 0.03, z0 + 0.4, { uv: 1, grad: false }); // (a worn edge line on its top)
        if (top > 0.2 || rng.chance(0.3)) w.platTops.push({ x0: x0 + 0.4, z0: z0 + 0.4, x1: x1 - 0.4, z1: z1 - 0.4, y: top, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
        continue;
      }
      // a pillar that sinks: its own mesh and collider, moved by tickPillars
      const col = w.addCollider(x0, -40, z0, x1, top, z1, { surf: 'stone' });
      const p = { x0, z0, x1, z1, top, col, y: top, st: 'up', t: 0, next: rng.range(4, 26), down: rng.range(5, 9), mesh: null, glow: null };
      w.pillars.push(p);
      w.deferred.push((grp) => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(PG().box, w.mats.block); body.scale.set(x1 - x0, 40 + top - 0.3, z1 - z0); body.position.y = -(40 + top - 0.3) / 2 - 0.3; g.add(body);
        const cap = new THREE.Mesh(PG().box, w.mats.floor); cap.scale.set(x1 - x0 + 0.1, 0.3, z1 - z0 + 0.1); cap.position.y = -0.15; g.add(cap);
        // the seams that light up: a ring of light round the cap and a cross over its top
        const gm = glowMat(), sx = x1 - x0, sz = z1 - z0;
        for (const [ox, oz, ex, ez] of [[0, sz / 2 + 0.06, sx + 0.14, 0.05], [0, -sz / 2 - 0.06, sx + 0.14, 0.05], [sx / 2 + 0.06, 0, 0.05, sz + 0.14], [-sx / 2 - 0.06, 0, 0.05, sz + 0.14], [0, 0, sx * 0.8, 0.07], [0, 0, 0.07, sz * 0.8]]) {
          const m = new THREE.Mesh(PG().box, gm); m.scale.set(ex, 0.03, ez); m.position.set(ox, 0.02, oz); g.add(m);
        }
        g.position.set((x0 + x1) / 2, top, (z0 + z1) / 2); grp.add(g); p.mesh = g; p.glow = gm;
      });
    }
    // beams over the channels: between two standing pillars two cells apart with the dark between them
    for (let k = 1; k < NZ - 1; k++) for (let i = 0; i < NX; i++) {
      for (const [di, dk] of [[2, 0], [0, 2]]) {
        const a = id(i, k), bi = i + di, bk = k + dk; if (bi >= NX || bk >= NZ) continue;
        const b = id(bi, bk), m = id(i + di / 2, k + dk / 2);
        if (cell[a] !== 1 || cell[b] !== 1 || cell[m] !== 0 || Math.abs(ht[a] - ht[b]) > 0.5 || !rng.chance(0.55)) continue;
        const y = Math.min(ht[a], ht[b]), mx = ccx(i + di / 2), mz = ccz(k + dk / 2);
        if (di) w.solid('trim', mx - C / 2 - 0.3, y - 0.45, mz - 0.9, mx + C / 2 + 0.3, y, mz + 0.9, { uv: 1.5 });
        else w.solid('trim', mx - 0.9, y - 0.45, mz - C / 2 - 0.3, mx + 0.9, y, mz + C / 2 + 0.3, { uv: 1.5 });
      }
    }
    // ---- the dressing: braziers of violet fire on some standing pillars, broken statues, chains, bones
    for (let n = 0; n < 9; n++) { const i = rng.int(0, NX - 1), k = rng.int(1, NZ - 2); if (cell[id(i, k)] !== 1 || keepWay[id(i, k)]) continue; const x = ccx(i) + rng.range(-1, 1), z = ccz(k) + rng.range(-1, 1); P().brazier(w, x, ht[id(i, k)], z, 1, true); }
    for (let n = 0; n < 5; n++) { const i = rng.int(0, NX - 1), k = rng.int(1, NZ - 2); if (cell[id(i, k)] !== 1) continue; P().statue(w, ccx(i), ccz(k), ht[id(i, k)], rng.range(0, 6.3), rng, rng.range(0.9, 1.2)); occ.mark(i * C, cz0 + k * C, (i + 1) * C, cz0 + (k + 1) * C); }
    for (let n = 0; n < 10; n++) { const i = rng.int(0, NX - 1), k = rng.int(1, NZ - 2); if (cell[id(i, k)] !== 1) continue; P().bones(w, ccx(i) + rng.range(-1.2, 1.2), ht[id(i, k)] + 0.02, ccz(k) + rng.range(-1.2, 1.2), rng); }
    // light from below: the violet mist far down
    for (let x = 8; x < W; x += 16) for (let z = cz0 + 6; z < D - LAND_S; z += 16) w.addLight(x, -7, z, { flame: 0, intensity: 16, range: 20, color: '#7a4ad8', emit: false, prio: 0.6 });
    for (const g of gxs) { P().brazier(w, g - 4.5, 0, 4.5, 1, true); P().brazier(w, g + 4.5, 0, 4.5, 1, true); }
    for (const s of [-1, 1]) P().brazier(w, cx + s * 7.5, 0, D - 4, 1, true);
    // the cells that are not ground (for what the area lays down afterwards): the dark and the sinking pillars
    for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (cell[id(i, k)] !== 1) occ.mark(i * C, cz0 + k * C, (i + 1) * C, cz0 + (k + 1) * C, 2);
    occ.mark(0, D - LAND_S, cx - 9, D, 2); occ.mark(cx + 9, D - LAND_S, W, D, 2);
    w.groundTop = (x, z) => {
      if (z < LAND_N) return 0; if (z >= D - LAND_S) return Math.abs(x - cx) < 9 ? 0 : null;
      const i = Math.floor(x / C), k = Math.floor((z - cz0) / C); if (i < 0 || k < 0 || i >= NX || k >= NZ) return null;
      return cell[id(i, k)] === 1 ? ht[id(i, k)] : null;
    };
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.pillars = genPillars;

  // ---------------------------------------------------------------- the pillars that sink
  // up -> warn (its seams light up: 1.6 s; foes stop counting it as ground) -> sink (2.4 s) -> down (some seconds, no collider)
  // -> rise (2.6 s) -> up. The times come from the area's own clock, the same on every co-op screen to within the moment each loaded it.
  const WARN = 1.6, SINKT = 2.4, RISE = 2.6;
  F.tickPillars = function (w, dt) {
    const Pl = G.player;
    for (const p of w.pillars) {
      p.t += dt;
      const was = p.st;
      if (p.st === 'up' && p.t >= p.next) { p.st = 'warn'; p.t = 0; p.col.navIgnore = true; w.navPatch(p.x0, p.z0, p.x1, p.z1); w._vn = null; if (Pl && Math.hypot(Pl.pos.x - (p.x0 + p.x1) / 2, Pl.pos.z - (p.z0 + p.z1) / 2) < 30) G.sfx.stoneGrind(V((p.x0 + p.x1) / 2, p.top, (p.z0 + p.z1) / 2), 0.5); }
      else if (p.st === 'warn' && p.t >= WARN) { p.st = 'sink'; p.t = 0; }
      else if (p.st === 'sink' && p.t >= SINKT) { p.st = 'down'; p.t = 0; p.col.alive = false; }
      else if (p.st === 'down' && p.t >= p.down) { p.st = 'rise'; p.t = 0; p.col.alive = true; }
      else if (p.st === 'rise' && p.t >= RISE) { p.st = 'up'; p.t = 0; p.next = U.rand(9, 20); p.col.navIgnore = false; w.navPatch(p.x0, p.z0, p.x1, p.z1); w._vn = null; }
      const k = p.st === 'sink' ? p.t / SINKT : p.st === 'rise' ? 1 - p.t / RISE : p.st === 'down' ? 1 : 0;
      const ease = k * k * (3 - 2 * k);
      p.y = p.top - SINK * ease;
      p.col.y1 = p.y;
      if (p.mesh) {
        p.mesh.position.y = p.y;
        // the shake as it lets go, the glow of its seams (warn: brightening and flickering; sinking: fading into the dark)
        p.mesh.position.x = (p.x0 + p.x1) / 2 + (p.st === 'warn' ? Math.sin(p.t * 60) * 0.03 * (p.t / WARN) : 0);
        if (p.glow) p.glow.opacity = p.st === 'warn' ? (0.35 + 0.65 * p.t / WARN) * (0.75 + 0.25 * Math.sin(p.t * 30)) : p.st === 'sink' ? 1 - k : p.st === 'rise' ? 0.4 * (1 - k) : 0;
      }
      if (was !== p.st && p.st === 'sink' && Math.random() < 0.6) G.fx.dust(V((p.x0 + p.x1) / 2, p.top, (p.z0 + p.z1) / 2), V(0, 1, 0), 0x6a5a80, 8);
    }
  };
  // the sinking pillar at (x, z), if any; and making one start to sink now (a foe's stamp: fieldfoes.js K.quake)
  F.pillarAt = (w, x, z) => (w && w.pillars ? w.pillars.find((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) || null : null);
  F.sinkNow = (w, p) => { if (p.st === 'up') p.next = p.t; };
  F.SHELL.pillars = Object.assign({}, F.SHELL.sanctum || F.SHELL.hall, { text: { sub: '— 石柱の海の奥へ —', icon: '🗿', obj: '石柱の海を渡れ — 門をくぐると戦いが始まる' } });
})();
