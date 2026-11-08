'use strict';
// 古戦場の丘 (battlefield, the surface tier): the hills where an old war was fought, under a grey sky before the dawn.
// No walls: the ground itself rolls (a height grid, terrain.js), crags bound the area, and beyond them the hills go on to the mountains.
// The layout is the lie of the land: a ridge with a pass and a ditch dug in front of it, a field of barrows, or a dry gully winding
// through. On it: the wrecks of the siege engines, lines of stakes, spears left standing, banners of the two hosts, cold camp fires.
// You come in through a gate in the crags at the south and leave by the gates hewn into the cliff at the north.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));
  const HOST = [[1.5, 0.42, 0.34], [0.5, 0.66, 1.25]]; // the two hosts' colours (crimson, steel blue) over the cloth

  G.Tex.BIOMES.battlefield = { name: '古戦場の丘', stone: '#8a8680', stone2: '#76726c', floor: '#55583e', trim: '#a29c90', rock: '#6a665e', wood: '#6a5a46', fog: '#5e646c', fogD: 0.0105, hemiS: '#8a94a8', hemiG: '#2a2a22', amb: 0.62, moon: '#e8dcc8', moonI: 1.25, torch: '#ffa860', cloth: '#5a4a3a', accent: 'grass', outdoor: 'ruins', floorTex: 'grass', grassTint: '#5c6040', sky: ['#1c2028', '#4c5460', '#a29a8e'], sunDir: [0.25, 0.22, -0.9], sunCol: [0.98, 0.86, 0.72], mtnCol: 0x30343c, mtnEm: 0x101216, groundCol: 0x2c3222, leaf: 0x3a3a26 };

  // ---------------------------------------------------------------- pieces
  // a frame turned by ry about (x, y, z): parts are given in its own space
  function rig(w, x, y, z, ry) {
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const part = (mk, lx, ly, lz, sx, sy, sz, rx, rry, rz, geo, tint) => {
      const [px, pz] = at(lx, lz);
      const q = q0.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, rry || 0, rz || 0)));
      w.batch.geo(mk, geo || PG().box, new THREE.Matrix4().compose(V(px, y + ly, pz), q, V(sx, sy, sz)), tint ? { tint } : undefined);
    };
    // a collider round a part (the box round its turned footprint)
    const col = (lx, lz, hx, hz, y0, y1) => {
      const ex = Math.abs(hx * c) + Math.abs(hz * s), ez = Math.abs(hx * s) + Math.abs(hz * c), [px, pz] = at(lx, lz);
      return w.addCollider(px - ex, y + y0, pz - ez, px + ex, y + y1, pz + ez, { surf: 'wood' });
    };
    return { part, col, at };
  }
  const wheel = (r, lx, ly, lz, rad, flat) => r.part('woodDark', lx, ly, lz, rad * 2, 0.18, rad * 2, 0, 0, flat ? 0 : Math.PI / 2, PG().cyl8);
  // a catapult, its arm snapped or still cocked
  function catapult(w, rng, x, y, z, ry) {
    const r = rig(w, x, y, z, ry), broken = rng.chance(0.5);
    for (const sx of [-1.1, 1.1]) r.part('woodDark', sx, 0.62, 0, 0.3, 0.32, 4.8);
    for (const lz of [-2.1, 0, 2.1]) r.part('woodDark', 0, 0.62, lz, 2.6, 0.28, 0.28);
    for (const sx of [-1, 1]) r.part('woodDark', sx * 1.0, 1.75, -0.4, 0.28, 2.3, 0.28, 0, 0, -sx * 0.16);
    r.part('woodDark', 0, 2.85, -0.4, 2.3, 0.3, 0.3);
    if (broken) { r.part('wood', 0, 1.1, 0.4, 0.26, 0.26, 2.6, -0.35, 0, 0); r.part('wood', 1.6, 0.2, 2.6, 0.26, 0.26, 2.9, 0, 0.7, 1.5); }
    else { r.part('wood', 0, 2.2, 0.9, 0.26, 0.26, 5.4, -0.62, 0, 0); r.part('iron', 0, 3.85, 3.15, 0.85, 0.4, 0.85, -0.62, 0, 0); }
    for (const [lx, lz] of [[-1.35, -1.7], [1.35, -1.7], [-1.35, 1.7]]) wheel(r, lx, 0.55, lz, 0.55);
    wheel(r, 2.3, 0.1, 1.2, 0.55, true);
    r.col(0, 0, 1.3, 2.4, -0.3, 1.0);
    r.col(0, -0.4, 1.2, 0.3, -0.3, 3.0);
    return 2.8;
  }
  // the burnt frame of a siege tower, its posts broken off at different heights, its ramp fallen in front
  function tower(w, rng, x, y, z, ry) {
    const r = rig(w, x, y, z, ry), hs = [rng.range(5, 7.5), rng.range(3, 6), rng.range(4.5, 7), rng.range(2.5, 5)];
    [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([lx, lz], k) => { r.part('woodDark', lx, hs[k] / 2 - 0.3, lz, 0.38, hs[k], 0.38, rng.range(-0.06, 0.06), 0, rng.range(-0.06, 0.06)); r.col(lx, lz, 0.22, 0.22, -0.3, hs[k] - 0.3); });
    for (const ly of [2.2, 4.4]) for (const [lx, lz, sx, sz] of [[0, -1.6, 3.4, 0.25], [0, 1.6, 3.4, 0.25], [-1.6, 0, 0.25, 3.4], [1.6, 0, 0.25, 3.4]]) if (ly < 3 || rng.chance(0.5)) r.part('woodDark', lx, ly, lz, sx, 0.25, sz);
    r.part('wood', 0, 2.3, 0, 3.2, 0.14, 3.2); r.col(0, 0, 1.7, 1.7, 2.1, 2.4);
    for (let k = 0; k < 5; k++) if (rng.chance(0.7)) r.part('wood', -1.3 + k * 0.65, 1.2 + rng.range(0, 1.6), -1.72, 0.55, rng.range(1.2, 2.4), 0.06, 0, 0, rng.range(-0.15, 0.15));
    r.part('wood', 0, 0.55, 3.7, 3, 0.14, 4.2, 0.24, 0, 0.05);
    r.part('dark', 0, 0.04, 0, 4.6, 0.04, 4.6, 0, 0, 0);
    return 3.4;
  }
  // a ballista on its trestle, its bow arms still spread
  function ballista(w, rng, x, y, z, ry) {
    const r = rig(w, x, y, z, ry);
    for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) r.part('woodDark', lx, 0.5, lz, 0.18, 1.0, 0.18, lx * 0.2, 0, lz * 0.2);
    r.part('woodDark', 0, 1.1, 0, 0.32, 0.26, 3.2, rng.range(-0.15, 0.1), 0, 0);
    for (const sx of [-1, 1]) r.part('woodDark', sx * 0.9, 1.15, -1.1, 1.8, 0.14, 0.14, 0, sx * 0.4, 0);
    r.part('iron', 0, 1.3, 0.6, 0.06, 0.06, 2.6, 0, 0, 0);
    r.col(0, 0, 0.8, 1.4, -0.3, 1.2);
    return 1.8;
  }
  // a line of stakes (cheval de frise): a log with sharpened stakes crossed through it, low enough to vault
  function stakes(w, rng, x, y, z, along, len) {
    const r = rig(w, x, y, z, along ? 0 : Math.PI / 2);
    r.part('woodDark', 0, 0.55, 0, 0.36, len, 0.36, 0, 0, Math.PI / 2, PG().cyl8);
    for (let u = -len / 2 + 0.4; u < len / 2; u += 0.75) for (const s of [-1, 1]) { r.part('wood', u, 0.62, 0, 0.09, 2.3, 0.09, s * 0.72, 0, 0); r.part('iron', u, 0.62 + Math.cos(0.72) * 1.15, s * Math.sin(0.72) * 1.15, 0.1, 0.22, 0.1, s * 0.72, 0, 0, PG().cone); }
    r.col(0, 0, len / 2, 0.75, -0.2, 1.05);
  }
  // spears left standing in the ground, a helm and a shield among them
  function spears(w, rng, x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, 6.3), d = rng.range(0, 1.6), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, rx = rng.range(-0.45, 0.45), rz = rng.range(-0.45, 0.45), L = rng.range(2.2, 3);
      w.batch.geo('woodDark', PG().cyl8, Mx(px, y + L * 0.4, pz, 0.045, L, 0.045, rx, 0, rz));
      const tip = new THREE.Vector3(0, L * 0.5, 0).applyEuler(new THREE.Euler(rx, 0, rz));
      w.batch.geo('iron', PG().cone, Mx(px + tip.x, y + L * 0.4 + tip.y, pz + tip.z, 0.07, 0.3, 0.07, rx, 0, rz));
    }
    if (rng.chance(0.7)) { const h = rng.int(0, 1); w.batch.geo('wood', PG().cyl8, Mx(x + rng.range(-1, 1), y + 0.45, z + rng.range(-1, 1), 0.55, 0.07, 0.55, rng.range(1.0, 1.3), rng.range(0, 6), 0), { tint: HOST[h] }); }
    if (rng.chance(0.6)) P().skull(w, x + rng.range(-1, 1), y + 0.02, z + rng.range(-1, 1), rng.range(0, 6), 1);
  }
  // a host's banner on its pole, torn
  function banner(w, rng, x, y, z, host) {
    const h = rng.range(4, 5.5), lean = rng.range(-0.12, 0.12), ry = rng.range(0, 6.3);
    w.batch.geo('woodDark', PG().cyl8, Mx(x, y + h / 2, z, 0.07, h, 0.07, lean, 0, 0));
    const r = rig(w, x, y, z, ry);
    r.part('woodDark', 0, h - 0.3, 0, 1.3, 0.06, 0.06);
    for (let k = 0; k < 3; k++) { const L = rng.range(1.0, 2.2); r.part('cloth', -0.42 + k * 0.42, h - 0.35 - L / 2, 0.04, 0.4, L, 0.03, rng.range(-0.08, 0.08), 0, rng.range(-0.06, 0.06), null, HOST[host]); }
    w.addCollider(x - 0.12, y, z - 0.12, x + 0.12, y + h, z + 0.12, { surf: 'wood', noGrapple: true });
  }
  // a cold camp fire (a few still smoulder), its ring of stones, a fallen tent
  function camp(w, rng, x, y, z, lit) {
    for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; T.boulder(w, x + Math.cos(a) * 0.95, y - 0.1, z + Math.sin(a) * 0.95, 0.24, 0.18, 0.24, rng, { collide: false }); }
    for (let k = 0; k < 3; k++) w.batch.geo('woodDark', PG().cyl8, Mx(x, y + 0.14, z, 0.1, 1.3, 0.1, Math.PI / 2, k * 1.05, 0));
    if (lit) {
      w.visual('glow', x - 0.35, y + 0.05, z - 0.35, x + 0.35, y + 0.12, z + 0.35, { uv: 1, grad: false, tint: [1, 0.45, 0.12] });
      (w.fireRects = w.fireRects || []).push({ x0: x - 0.4, x1: x + 0.4, z0: z - 0.4, z1: z + 0.4, y: y + 0.12, acc: 0, low: true, blue: false });
      w.addLight(x, y + 1.0, z, { flame: 1, intensity: 9, range: 12, color: '#ff9a50', prio: 1.1 });
    } else w.visual('dark', x - 0.5, y + 0.02, z - 0.5, x + 0.5, y + 0.05, z + 0.5, { uv: 1, grad: false });
    // the tent: a ridge pole and the cloth slumped over it
    const r = rig(w, x + rng.range(2.6, 3.4), y, z + rng.range(-1, 1), rng.range(0, 6.3));
    r.part('woodDark', 0, 0.9, 0, 0.08, 1.8, 0.08); r.part('woodDark', 0, 0.55, 1.6, 0.08, 1.1, 0.08, 0.6, 0, 0);
    for (const s of [-1, 1]) r.part('cloth', s * 0.75, 0.55, 0.8, 0.04, 1.75, 3.0, 0, 0, s * 0.95, null, [0.9, 0.85, 0.7]);
    r.col(0, 0.8, 1.1, 1.6, -0.2, 1.0);
  }
  // standing stones on a barrow's top, now and then a dolmen
  function stones(w, rng, x, y, z, R) {
    const n = rng.int(5, 8), a0 = rng.range(0, 6.3);
    for (let k = 0; k < n; k++) {
      if (rng.chance(0.2)) continue;
      const a = a0 + k / n * 6.28, px = x + Math.cos(a) * R, pz = z + Math.sin(a) * R, h = rng.range(1.8, 3.2), fallen = rng.chance(0.15);
      if (fallen) { w.batch.geo('block', PG().box, Mx(px, y + 0.3, pz, 0.7, 0.55, h, 0.08, a, 0)); w.addCollider(px - 0.6, y - 0.2, pz - 0.6, px + 0.6, y + 0.55, pz + 0.6, { surf: 'stone' }); continue; }
      w.batch.geo('block', PG().box, Mx(px, y + h / 2 - 0.2, pz, 0.75, h, 0.5, rng.range(-0.08, 0.08), a, rng.range(-0.08, 0.08)));
      w.addCollider(px - 0.42, y - 0.2, pz - 0.42, px + 0.42, y + h - 0.2, pz + 0.42, { surf: 'stone' });
    }
    if (rng.chance(0.55)) {
      for (const s of [-1, 1]) { w.solid('block', x + s * 0.9 - 0.25, y - 0.2, z - 0.5, x + s * 0.9 + 0.25, y + 1.5, z + 0.5, { uv: 1.5 }); }
      w.batch.geo('block', PG().box, Mx(x, y + 1.72, z, 2.8, 0.45, 1.6, 0, rng.range(-0.2, 0.2), rng.range(-0.06, 0.06)));
      w.addCollider(x - 1.4, y + 1.5, z - 0.8, x + 1.4, y + 1.95, z + 0.8, { surf: 'stone' });
      P().candles(w, x, y, z, rng, true);
    }
  }

  // ---------------------------------------------------------------- the area
  function genBattlefield(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const W = Math.min(104, 86 + Math.floor(area / 3) * 2 + rng.int(0, 2) * 4), D = W + rng.int(-1, 2) * 4;
    const w = new G.World(W, D, 'battlefield');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    const layout = F.pickLayout(rng, 'battlefield', ['ridge', 'barrows', 'gully']);
    w.layout = layout;
    const n1 = T.noise(seed ^ 0x2f1), n2 = T.noise(seed ^ 0x77a), cx = W / 2;
    const hf = T.grid(W, D, -3);
    // ---- the lie of the land
    const mounds = [];
    const ridge = { z: D * rng.range(0.44, 0.56), ph: rng.range(0, 6.3), pass: rng.range(W * 0.3, W * 0.7), ditch: rng.chance(0.75) };
    const gully = { ph: rng.range(0, 6.3), amp: W * rng.range(0.18, 0.28) };
    if (layout === 'barrows') {
      for (let t = 0; t < 60 && mounds.length < rng.int(4, 6); t++) {
        const R = rng.range(7, 10.5), x = rng.range(12 + R * 0.4, W - 12 - R * 0.4), z = rng.range(24, D - 24);
        if (mounds.some((m) => Math.hypot(m.x - x, m.z - z) < m.R + R + 3)) continue;
        mounds.push({ x, z, R, h: rng.range(3, 5.2) });
      }
    }
    const ridgeZ = (x) => ridge.z + Math.sin(x / W * Math.PI * 1.3 + ridge.ph) * D * 0.07;
    const gullyX = (z) => cx + Math.sin(z / D * Math.PI * 1.6 + gully.ph) * gully.amp;
    const sm = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
    const raw = (x, z) => {
      let h = (T.fbm(n1, x / 24, z / 24, 3) * 0.5 + 0.5) * 3.6 + T.fbm(n2, x / 9, z / 9, 2) * 0.5;
      if (layout === 'ridge') {
        const r = Math.abs(z - ridgeZ(x)), saddle = 1 - 0.75 * Math.exp(-(((x - ridge.pass) / 8) ** 2));
        h += 6.2 * Math.max(0, 1 - (r / 12) ** 2) * saddle;
        if (ridge.ditch) { const dz = z - (ridgeZ(x) + 14); h += -1.4 * Math.max(0, 1 - (Math.abs(dz) / 2) ** 2) + 0.9 * Math.max(0, 1 - (Math.abs(dz + 3) / 1.6) ** 2); }
      } else if (layout === 'barrows') {
        h *= 0.7;
        for (const m of mounds) { const d = Math.hypot(x - m.x, z - m.z) / m.R; if (d < 1) h = Math.max(h, h * 0.4 + m.h * Math.min(1, Math.cos(d * Math.PI / 2) * 1.35)); }
      } else {
        const d = Math.abs(x - gullyX(z));
        h = h * (0.7 + 0.5 * sm(4, 14, d)) + 1.6 * Math.max(0, 1 - ((d - 8) / 3.5) ** 2) - 1.9 * Math.max(0, 1 - (d / 4.5) ** 2);
      }
      return h;
    };
    // flat at the gates (the north strip and the merchant's ground before them) and round the way in
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const k = Math.min(sm(15, 26, z), sm(10, 21, Math.hypot(x + 0.5 - cx, (z + 0.5 - (D - 4)) * 1.3)));
      hf.h[z * W + x] = Math.max(-1.75, raw(x + 0.5, z + 0.5) * k);
    }
    const keep = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (z < 15 || Math.hypot(x + 0.5 - cx, (z + 0.5 - (D - 4)) * 1.3) < 10) { hf.h[z * W + x] = 0; keep[z * W + x] = 1; }
    T.limit(hf, 0.45, keep);
    const gy = (x, z) => hf.h[Math.max(0, Math.min(D - 1, Math.floor(z))) * W + Math.max(0, Math.min(W - 1, Math.floor(x)))];
    T.build(w, hf, { mk: 'floor', uv: 4, tintSeed: seed & 1023, steepTint: [0.7, 0.64, 0.56] });
    w.groundElse = () => 0;
    // dry grass in tufts over the slopes (decor only), set on the smooth surface the eye sees
    for (let i = 0; i < 340; i++) {
      const x = rng.range(4, W - 4), z = rng.range(4, D - 4), y = T.surface(hf, x, z), s = rng.range(0.7, 1.35);
      for (let k = 0; k < 2; k++) w.batch.geo('vine', PG().plane, P().M(x, y + 0.2 * s, z, 0.75 * s, 0.5 * s, 1, 0, k * Math.PI / 2 + rng.range(0, 1), 0), { su: 0.6, sv: 0.5, tint: [1.15, 1.05, 0.62] });
    }
    // ---- the bounds: crags west and east, the cliff at the north with the gates hewn into it, the crags round the way in
    H.perimeter(w, rng, W, D, { gates, h: 9, walls: false, beams: 0, stub: 3.5 });
    T.crags(w, rng, 'W', -2, D + 2, 2.5, 6, 6.5, 10.5, gy);
    T.crags(w, rng, 'E', -2, D + 2, 2.5, 6, 6.5, 10.5, gy);
    const gxs = LG.gateXs(W, gates);
    let a = 0;
    for (const g of [...gxs, W + 2]) { const e = g - 6.2; if (e > a + 0.5) T.crags(w, rng, 'N', a, e, 2, 4.5, 9, 13.5, gy); a = g + 6.2; }
    T.crags(w, rng, 'S', 0, cx - 8.2, 2, 4.5, 7, 11, gy); T.crags(w, rng, 'S', cx + 8.2, W, 2, 4.5, 7, 11, gy);
    for (const g of gxs) for (const s of [-1, 1]) T.boulder(w, g + s * 7.4, 8.5, -1.2, 2.6, 2.4, 2.4, rng, { collide: false }); // (the cliff closes over the gate stubs)
    occ.mark(0, 0, 7, D, 2); occ.mark(W - 7, 0, W, D, 2); occ.mark(0, 0, W, 6, 2); occ.mark(0, D - 6, W, D, 2);
    // ---- the barrows' tops
    for (const m of mounds) {
      const y = gy(m.x, m.z);
      stones(w, rng, m.x, y, m.z, Math.min(3.4, m.R * 0.38));
      occ.mark(m.x - 4.5, m.z - 4.5, m.x + 4.5, m.z + 4.5);
      w.platTops.push({ x0: m.x - 2.6, z0: m.z - 2.6, x1: m.x + 2.6, z1: m.z + 2.6, y, cx: m.x, cz: m.z });
    }
    // ---- what the war left
    // where a thing of footprint fw x fd can stand: free, and the ground under it not too steep (it is sunk to the lowest point)
    const spot = (fw, fd, pad, slope) => {
      for (let t = 0; t < 30; t++) {
        const r = occ.place(rng, fw, fd, pad ?? 1, 6); if (!r) return null;
        let lo = Infinity, hi = -Infinity;
        for (let zz = r.z0; zz < r.z1; zz++) for (let xx = r.x0; xx < r.x1; xx++) { const y = gy(xx, zz); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        if (hi - lo <= (slope ?? 1.2)) return Object.assign(r, { y: lo, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2 });
        occ.mark(r.x0, r.z0, r.x1, r.z1, 0);
      }
      return null;
    };
    const nWreck = rng.int(2, 4);
    for (let i = 0; i < nWreck; i++) {
      const t = rng.next(), r = spot(7, 7, 1.5, 1.4); if (!r) continue;
      if (t < 0.4) catapult(w, rng, r.cx, r.y, r.cz, rng.range(0, 6.3)); else if (t < 0.7) tower(w, rng, r.cx, r.y, r.cz, rng.range(0, 6.3)); else ballista(w, rng, r.cx, r.y, r.cz, rng.range(0, 6.3));
      if (rng.chance(0.6)) spears(w, rng, r.cx + rng.range(-3, 3), r.y, r.cz + rng.range(-3, 3), rng.int(3, 6));
    }
    // the front: a line of stakes along the ridge's ditch, others where the hosts stood
    if (layout === 'ridge') {
      for (let x = 10; x < W - 10; x += rng.range(8.5, 11)) {
        if (Math.abs(x - ridge.pass) < 6) continue;
        const z = Math.round(ridgeZ(x) + (ridge.ditch ? 17.5 : 10)), len = rng.range(4.5, 6.5);
        if (!occ.free(x - len / 2, z - 1, x + len / 2, z + 1)) continue;
        occ.mark(x - len / 2, z - 1, x + len / 2, z + 1);
        stakes(w, rng, x, Math.min(gy(x - len / 2, z), gy(x, z), gy(x + len / 2, z)), z, true, len);
      }
    }
    for (let i = 0; i < rng.int(2, 4); i++) { const along = rng.chance(0.5), len = rng.range(4.5, 7), r = spot(along ? Math.ceil(len) : 2, along ? 2 : Math.ceil(len), 1, 0.9); if (r) stakes(w, rng, r.cx, r.y, r.cz, along, len); }
    for (let i = 0; i < rng.int(5, 8); i++) { const r = spot(3, 3, 0.5, 1.5); if (r) spears(w, rng, r.cx, r.y, r.cz, rng.int(4, 10)); }
    for (let i = 0; i < rng.int(4, 7); i++) { const r = spot(2, 2, 1, 1.5); if (r) banner(w, rng, r.cx, r.y, r.cz, i % 2); }
    for (let i = 0; i < rng.int(2, 3); i++) { const r = spot(6, 4, 1, 0.6); if (r) camp(w, rng, r.x0 + 1.5, r.y, r.cz, rng.chance(0.55)); }
    for (let i = 0; i < rng.int(3, 5); i++) { const r = spot(3, 3, 1.5, 1.2); if (r) T.at(w, r.y, () => F.deadTree(w, r.cx, r.cz, rng, rng.range(0.9, 1.3))); }
    for (let i = 0; i < rng.int(5, 9); i++) { const r = spot(2, 2, 0.5, 1.6); if (!r) continue; if (rng.chance(0.5)) P().bones(w, r.cx, r.y + 0.02, r.cz, rng); else T.boulder(w, r.cx, r.y - 0.2, r.cz, rng.range(0.7, 1.4), rng.range(0.5, 1), rng.range(0.7, 1.4), rng); }
    // cairns for the fallen
    for (let i = 0; i < rng.int(1, 3); i++) { const r = spot(3, 3, 1, 0.8); if (!r) continue; for (let k = 0; k < 6; k++) T.boulder(w, r.cx + rng.range(-0.6, 0.6), r.y + k * 0.28, r.cz + rng.range(-0.6, 0.6), 0.75 - k * 0.09, 0.4, 0.75 - k * 0.09, rng, { collide: k === 0, top: 3.4 }); P().skull(w, r.cx, r.y + 1.7, r.cz, rng.range(0, 6), 1.1); }
    // braziers at the gates, lanterns on the way in
    for (const g of gxs) { P().brazier(w, g - 5.4, 0, 4.5, 1, true); P().brazier(w, g + 5.4, 0, 4.5, 1, true); }
    for (const s of [-1, 1]) F.lantern(w, cx + s * 5.5, D - 6, '#ffb070');
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.battlefield = genBattlefield;

  // ---------------------------------------------------------------- the guardian's approach: a sunken lane between the earthworks
  function roadBattle(w, rng, W, AD, D) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 5;
    w.solid('floor', cx - hw - 1, -1, gz1, cx + hw + 1, 0, D, { uv: 2 });
    w.visual('mud', cx - 2.2, 0, gz1, cx + 2.2, 0.025, D, { uv: 3, grad: false, skip: { bottom: true } });
    const nz = gz1 + (D - gz1) * 0.45, nx = cx - hw - 2.6;
    // the banks: rolling earth either side, rising to the crags; flat ground in the merchant's nook
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : Math.ceil(cx + hw + 1), x1 = side < 0 ? Math.floor(cx - hw - 1) : W, hf = T.grid(x1 - x0, D - gz1, -3), n = T.noise(rng.int(1, 1e6));
      const keep = new Uint8Array(hf.W * hf.D);
      for (let z = 0; z < hf.D; z++) for (let x = 0; x < hf.W; x++) {
        const wx = x0 + x + 0.5, wz = gz1 + z + 0.5, d = side < 0 ? (cx - hw - 1) - wx : wx - (cx + hw + 1);
        let h = Math.min(6, d * 0.42) + T.fbm(n, wx / 10, wz / 10, 2) * 1.2;
        if (side < 0 && Math.abs(wz - nz) < 8 && d < 9) { h = 0; keep[z * hf.W + x] = 1; }
        if (d < 1.2) { h = 0; keep[z * hf.W + x] = 1; }
        hf.h[z * hf.W + x] = Math.max(0, h);
      }
      T.limit(hf, 0.45, keep);
      T.build(w, hf, { mk: 'floor', uv: 4, x0, z0: gz1 });
      const gy = (x, z) => hf.h[Math.max(0, Math.min(hf.D - 1, Math.floor(z - gz1))) * hf.W + Math.max(0, Math.min(hf.W - 1, Math.floor(x - x0)))];
      T.crags(w, rng, side < 0 ? 'W' : 'E', gz1, D + 2, 2.5, 5, 7, 10, gy);
      for (let z = gz1 + 8; z < D - 6; z += rng.range(9, 13)) {
        if (side < 0 && Math.abs(z - nz) < 10) continue;
        const bx = cx + side * (hw + rng.range(4, 12));
        const t = rng.next();
        if (t < 0.35) banner(w, rng, bx, gy(bx, z), z, side < 0 ? 0 : 1);
        else if (t < 0.6) spears(w, rng, bx, gy(bx, z), z, rng.int(4, 8));
        else if (t < 0.75) stakes(w, rng, cx + side * (hw + 2.2), gy(cx + side * (hw + 2.2), z), z, false, 4.5);
        else T.boulder(w, bx, gy(bx, z) - 0.3, z, rng.range(1, 1.8), rng.range(0.7, 1.2), rng.range(1, 1.8), rng);
      }
      if (rng.chance(0.8)) { const z = side < 0 ? D - 12 : rng.range(gz1 + 20, D - 14), x = cx + side * (hw + 11); (rng.chance(0.5) ? catapult : tower)(w, rng, x, gy(x, z), z, rng.range(0, 6.3)); }
    }
    for (let z = gz1 + 6; z < D - 3; z += 14) for (const s of [-1, 1]) if (!(s < 0 && Math.abs(z - nz) < 8)) F.lantern(w, cx + s * (hw + 0.4), z, '#ffb070');
    camp(w, rng, nx - 3.5, 0, nz + 5.5, true);
    // the gate: an earthen rampart with a palisade on it, two timber towers, the iron gate slams shut behind you
    const gate = 3.2;
    for (const s of [-1, 1]) {
      const xa = s < 0 ? 0 : cx + gate, xb = s < 0 ? cx - gate : W;
      w.solid('floor', xa, 0, gz0 - 0.6, xb, 2.2, gz1 + 0.6, { uv: 3 });
      T.at(w, 2.2, () => F.palisade(w, xa, (gz0 + gz1) / 2, xb, (gz0 + gz1) / 2, 2.6, []));
      const tx = cx + s * (gate + 1.1);
      w.solid('woodDark', tx - 1.1, 0, gz0 - 0.6, tx + 1.1, 7.2, gz1 + 0.6, { uv: 2 });
      w.solid('wood', tx - 1.4, 7.2, gz0 - 0.9, tx + 1.4, 7.5, gz1 + 0.9, { uv: 1, noGrapple: true });
      w.batch.geo('woodDark', PG().cone, Mx(tx, 8.6, (gz0 + gz1) / 2, 1.9, 2.2, 2.4, 0, Math.PI / 4, 0));
      w.addCollider(tx - 1.4, 7.5, gz0 - 0.9, tx + 1.4, 10, gz1 + 0.9, { noGrapple: true });
      banner(w, rng, tx + s * 2.2, 2.2, gz1 + 0.2, s < 0 ? 0 : 1);
      w.addLight(tx, 6.8, gz1 + 1.4, { flame: 0.3, intensity: 7, range: 11, color: '#ff8a40', prio: 1.2 });
    }
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => { const pc = H.portcullis(w, gate * 2 - 0.2, 6.2); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
    return { nz, side: -1, nx };
  }
  F.SHELL.battlefield = {
    outdoor: true, wallH: 3.2, road: roadBattle,
    ring(w, rng, W, AD, last) {
      F.palisade(w, 0.4, 0.4, W - 0.4, 0.4, 4.8, last ? [] : LG.gateXs(W, 3).map((g) => [g - 2.6, g + 2.6]));
      F.palisade(w, 0.4, 0.4, 0.4, AD, 4.8, []); F.palisade(w, W - 0.4, 0.4, W - 0.4, AD, 4.8, []);
    },
    dress(w, rng, W, AD) {
      // the field's edges: the hosts' banners, stakes and a wreck in a corner
      for (let z = 10; z < AD - 6; z += 15) { banner(w, rng, 2.6, 0, z, 0); banner(w, rng, W - 2.6, 0, z + 7, 1); }
      if (rng.chance(0.7)) { const [x, z] = rng.pick([[9, 9], [W - 9, 9], [9, AD - 12], [W - 9, AD - 12]]); (rng.chance(0.5) ? catapult : ballista)(w, rng, x, 0, z, rng.range(0, 6.3)); }
    },
    text: { sub: '— 古戦場の奥へ —', icon: '⚔️', obj: '丘を越えて奥へ進め — 柵の門をくぐると戦いが始まる' },
  };
})();
