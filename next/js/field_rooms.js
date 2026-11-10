'use strict';
// The rooms of each field (the merchant's hall, the event room, the shrine, the forge, the alchemist's, the vault, the casino, the
// trial: levelgen.js LG.shop / LG.room): what is in them stays where it always is, on a flat floor in the middle; the place round it is
// the field's own (LG.roomShell[field]). A field without a shell of its own keeps the stone hall.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, U = G.U, V = U.V, T = G.Terrain;
  const P = () => G.Props, PG = () => G.Props.PG;
  const S = (LG.roomShell = {});
  const gateGap = (W, gates, x, half) => LG.gateXs(W, gates || 1).some((g) => Math.abs(g - x) < half);
  // o.keep (the merchant's hall, levelgen.js LG.SHOP_KEEP): the places the hall keeps bare; a thing r across at (x, z) goes there only if clear of them
  const clear = (o, x, z, r) => !(o.keep || []).some(([x0, z0, x1, z1]) => x + r > x0 && x - r < x1 && z + r > z0 && z - r < z1);

  // ---- outdoors on the hills: crags round a patch of grass, the hosts' banners, a camp fire
  S.battlefield = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'floor');
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 7, walls: false, beams: 0, stub: 3 });
    const gy = () => 0;
    const sd0 = o.keep ? 0.3 : 2, sd1 = o.keep ? 0.6 : 3.5; // (in the merchant's hall the stalls stand along these walls: the rock stays behind them)
    T.crags(w, rng, 'W', -2, D + 2, sd0, sd1, 6, 9, gy); T.crags(w, rng, 'E', -2, D + 2, sd0, sd1, 6, 9, gy);
    let a = -2; for (const g of [...LG.gateXs(W, o.gates || 1), W + 8]) { if (g - 6 > a + 0.5) T.crags(w, rng, 'N', a, g - 6, 1.5, 3, 7, 10, gy); a = g + 6; }
    T.crags(w, rng, 'S', -2, W / 2 - 7.5, o.keep ? 0.3 : 1.5, o.keep ? 0.6 : 3, 6, 9, gy); T.crags(w, rng, 'S', W / 2 + 7.5, W + 2, o.keep ? 0.3 : 1.5, o.keep ? 0.6 : 3, 6, 9, gy);
    for (let i = 0; i < 40; i++) { const x = rng.range(4, W - 4), z = rng.range(4, D - 4); if (!clear(o, x, z, 0.5)) continue; for (let k = 0; k < 2; k++) w.batch.geo('vine', PG().plane, P().M(x, 0.2, z, 0.7, 0.45, 1, 0, k * Math.PI / 2 + rng.range(0, 1), 0), { su: 0.6, sv: 0.5, tint: [1.15, 1.05, 0.62] }); }
    w.addLight(W / 2, 6, D / 2, { flame: 0, intensity: 6, range: 24, color: '#ffd8b0', emit: false, prio: 0.8 });
  };
  // ---- a round chamber cut in the rock at the foot of a shaft, the night sky high above, chains hanging down
  S.shaft = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'cobble');
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 9, walls: false, beams: 0, stub: 3 });
    const rk = T.grid(W, D, -2), cx = W / 2, cz = D / 2, rx = W / 2 + 0.6, rz = D / 2 + 0.6; // (a rounded square: the room's things by the walls keep their room)
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const i = z * W + x, d = Math.pow(Math.pow(Math.abs(x + 0.5 - cx) / rx, 4) + Math.pow(Math.abs(z + 0.5 - cz) / rz, 4), 0.25); if (d < 1 || (z < 6 && gateGap(W, o.gates, x + 0.5, 6)) || (z > D - 6 && Math.abs(x + 0.5 - cx) < 6)) { rk.m[i] = 0; continue; } rk.h[i] = 16 + Math.sin(x * 0.7 + z) * 0.6; }
    T.build(w, rk, { mk: 'rock', uv: 5, cliff: 1.2 });
    T.skyCap(w, rk); // (open to the sky: nobody gets up onto the rock round the chamber)
    w.groundTop = null; w.groundGrid = null;
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, r = Math.min(rx, rz) * 0.6; if (!clear(o, cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.6)) continue; w.batch.geo('iron', PG().cyl8, new THREE.Matrix4().compose(V(cx + Math.cos(a) * r, 18, cz + Math.sin(a) * r), new THREE.Quaternion(), V(0.12, 24, 0.12))); }
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; w.addLight(cx + Math.cos(a) * (rx - 1), 3.4, cz + Math.sin(a) * (rz - 1), { flame: 1, intensity: 6, range: 10 }); }
  };
  // ---- a cave in the old diggings: rock all round, a low rock roof with its teeth, timber props, lanterns
  S.mine = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'floor');
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 8, walls: false, beams: 0, stub: 2.5 });
    const rk = T.grid(W, D, -2), cx = W / 2, cz = D / 2, n = T.noise(rng.int(1, 1e6));
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const i = z * W + x, a = Math.atan2(z + 0.5 - cz, x + 0.5 - cx), d = Math.pow(Math.pow(Math.abs(x + 0.5 - cx) / (W / 2 + 0.6), 4) + Math.pow(Math.abs(z + 0.5 - cz) / (D / 2 + 0.6), 4), 0.25) / (0.97 + 0.12 * n(Math.cos(a) * 2, Math.sin(a) * 2)); if (d < 1 || (z < 5 && gateGap(W, o.gates, x + 0.5, 3.5)) || (z > D - 5 && Math.abs(x + 0.5 - cx) < 5)) { rk.m[i] = 0; continue; } rk.h[i] = 9; }
    T.build(w, rk, { mk: 'rock', uv: 5, cliff: 1.2 });
    w.groundTop = null; w.groundGrid = null;
    w.solid('rock', -3, 9, -3, W + 3, 11, D + 3, { uv: 6, grad: false });
    for (let k = 0; k < 18; k++) { const L = rng.range(0.8, 2.4); w.batch.geo('rock', PG().cone, new THREE.Matrix4().compose(V(rng.range(4, W - 4), 9 - L / 2, rng.range(4, D - 4)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)), V(rng.range(0.5, 1), L, rng.range(0.5, 1)))); }
    for (let x = 6; x < W - 4; x += 7) for (const z of [1.2, D - 1.2]) { if ((z < 5 && gateGap(W, o.gates, x, 5)) || (z > D - 5 && Math.abs(x - cx) < 6)) continue; w.solid('woodDark', x - 0.15, 0, z - 0.15, x + 0.15, 8.6, z + 0.15, { uv: 1 }); }
    for (const [x, z] of [[5, D / 2], [W - 5, D / 2], [W / 2 - 9, 6], [W / 2 + 9, D - 6]]) if (clear(o, x, z, 0.5)) F.lantern(w, x, z, '#ffb060');
  };
  // ---- a platform over the dark at the bottom of the abyss: its edge a broken parapet, the void beyond, pillars standing in it
  S.pillars = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'floor');
    w.solid('block', 0, -40, 0, W, -1, D, { uv: 4, grad: false });
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 9, walls: false, beams: 0, stub: 3 });
    { let ax = -2; for (const g of [...LG.gateXs(W, o.gates || 1), W + 7]) { if (g - 5.5 > ax) w.solid('rock', ax, -20, -3, g - 5.5, 12, 0, { uv: 6, grad: false }); ax = g + 5.5; } }
    for (const [a, b] of [[-2, W / 2 - 7.5], [W / 2 + 7.5, W + 2]]) w.solid('rock', a, -20, D, b, 10, D + 3, { uv: 6, grad: false });
    for (const x of [0, W - 0.4]) for (let z = 1; z < D - 1; z += 2) if (rng.chance(0.75)) w.solid('block', x, 0, z, x + 0.4, 0.8, z + 1.6, { uv: 1.5 });
    for (let k = 0; k < 16; k++) { const sx = k % 2 ? -1 : 1, x = sx < 0 ? -rng.range(2, 9) : W + rng.range(2, 9), z = rng.range(0, D), h = rng.range(-6, 4); w.visual('block', x - 1.6, -40, z - 1.6, x + 1.6, h, z + 1.6, { uv: 3 }); }
    w.killY = -9; w.noRim = true;
    for (let z = 6; z < D; z += 12) for (const x of [-4, W + 4]) w.addLight(x, -6, z, { flame: 0, intensity: 12, range: 16, color: '#7a4ad8', emit: false, prio: 0.5 });
  };
  // ---- the village square at night: the walls of the houses round it rising over its low wall, lamps
  S.hamlet = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'cobble');
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 4.2 });
    for (const side of [-1, 1]) for (let a = 1; a < D - 4;) {
      const len = rng.range(6, 9), h = rng.range(5.5, 7.5), x0 = side < 0 ? -6 : W + 1.6, x1 = x0 + 4.4;
      w.visual('wall', x0, 0, a, x1, h, Math.min(D - 1, a + len), { uv: 2.5 });
      const fx = side < 0 ? x1 : x0 - 0.03;
      w.visual('dark', fx, 4.8, a + 1, fx + 0.03, 5.6, a + 2, { uv: 1, grad: false });
      w.batch.geo('woodDark', PG().box, new THREE.Matrix4().compose(V((x0 + x1) / 2, h + 0.9, a + len / 2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side < 0 ? -0.5 : 0.5)), V(5.4, 0.14, len + 0.4)));
      a += len + rng.range(0.5, 2);
    }
    for (const [x, z] of [[6, 6], [W - 6, 6], [6, D - 6], [W - 6, D - 6]]) if (clear(o, x, z, 0.5)) F.lantern(w, x, z, '#ffb070');
  };
  // ---- a terrace on the great bridge: parapets along its sides, the abyss beyond, the sunset
  S.dusk = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'floor');
    w.solid('block', 0, -30, 0, W, -1, D, { uv: 4 });
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 6.5, walls: false, beams: 0, stub: 3 });
    { let ax = -1; for (const g of [...LG.gateXs(W, o.gates || 1), W + 7]) { if (g - 5.5 > ax) w.solid('wall', ax, 0, -1, g - 5.5, 8, 0, { uv: 2.5 }); ax = g + 5.5; } }
    for (const [a, b] of [[-1, W / 2 - 7.5], [W / 2 + 7.5, W + 1]]) w.solid('wall', a, 0, D, b, 8, D + 1, { uv: 2.5 });
    for (const x of [0, W - 0.45]) for (let z = 1; z < D - 1; z += 2) { w.solid('wall', x, 0, z, x + 0.45, 1.0, z + 1.8, { uv: 1.5 }); w.visual('trim', x - 0.05, 1.0, z - 0.05, x + 0.5, 1.1, z + 1.85, { uv: 1 }); }
    w.noGround = true;
  };
  // ---- a low vault of bones: niches of skulls along every wall, candles
  S.catacombs = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'cobble');
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 7, top: 8, beams: 0 });
    w.solid('rock', -3, 7, -3, W + 3, 8.5, D + 3, { uv: 6, grad: false });
    const CR = F._crypt;
    if (CR) for (let a = 1; a < W - 3; a += 3.2) { if (!gateGap(W, o.gates, a + 1.6, 6.5)) CR.ossuary(w, rng, a, a + 3, 0, true, 1, 0); if (Math.abs(a + 1.6 - W / 2) > 6) CR.ossuary(w, rng, a, a + 3, D, true, -1, 0); }
    if (CR) for (let a = 1; a < D - 3; a += 3.2) { CR.ossuary(w, rng, a, a + 3, 0, false, 1, 0); CR.ossuary(w, rng, a, a + 3, W, false, -1, 0); }
    for (let i = 0; i < 6; i++) { const x = rng.chance(0.5) ? 1.2 : W - 1.2, z = rng.range(4, D - 4); if (clear(o, x, z, 0.4)) P().candles(w, x, 0, z, rng, true); }
  };
  // ---- the great hall of the castle: rows of pillars, the red banners, tall dark windows
  S.castle = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'floor');
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 13, top: 16, beams: 0 });
    for (const sx of [-1, 1]) for (let z = 6; z < D - 4; z += 6) { const x = W / 2 + sx * (W / 2 - 5); if (clear(o, x, z, 0.8)) P().pillarSquare(w, x, z, 0, 13, 1.0); P().banner(w, sx < 0 ? 0 : W, 10, z + 3, sx < 0 ? 'px' : 'nx', 5, 0x5a0a0a); }
    for (const x of [0, W]) for (let z = 4; z < D - 4; z += 6) w.visual('dark', x === 0 ? 0 : W - 0.03, 5, z, x === 0 ? 0.03 : W, 11, z + 1.4, { uv: 1, grad: false });
  };
  // ---- a hall the water has come into: the floor under a hand's depth of it, falls from the walls, the dark vault
  S.flooded = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'cobble');
    w.visual('water', 0, 0.0, 0, W, 0.05, D, { uv: 4, grad: false, skip: { bottom: true } });
    w.waterZones.push({ x0: 0, z0: 0, x1: W, z1: D });
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 12, top: 14, beams: 0 });
    w.solid('rock', -3, 12, -3, W + 3, 14, D + 3, { uv: 6, grad: false });
    for (const [x, z, f] of [[0.02, o.keep ? 21.6 : D * 0.3, 'px'], [W - 0.02, o.keep ? 36.6 : D * 0.7, 'nx']]) if (F._flooded) F._flooded.waterfall(w, x, z, 8, f, 2); // (in the merchant's hall: between the stalls, not through one)
    for (let z = 6; z < D - 4; z += 8) { if (rng.chance(0.5)) P().vines(w, 0, rng.range(6, 10), z, 'px', rng.range(3, 5), rng); if (rng.chance(0.5)) P().vines(w, W, rng.range(6, 10), z + 3, 'nx', rng.range(3, 5), rng); }
    w.animated.push({ kind: 'uvflow', mat: w.mats.water, sp: [0, -0.04] });
  };
  // ---- a hall of the works: iron plates underfoot with the melt glowing through grates, furnace mouths in the walls
  S.foundry = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'floor');
    w.visual('iron', 0, 0, 0, W, 0.02, D, { uv: 2, grad: false });
    for (const [x, z] of [[6, 7], [W - 6, 7], [6, D - 7], [W - 6, D - 7]]) { w.visual('lava', x - 1.2, 0.025, z - 1.2, x + 1.2, 0.035, z + 1.2, { uv: 1, grad: false }); for (let u = -1; u <= 1; u += 0.5) w.visual('iron', x + u - 0.05, 0.035, z - 1.2, x + u + 0.05, 0.06, z + 1.2, { uv: 1 }); w.addLight(x, 0.8, z, { flame: 0.4, intensity: 6, range: 8, color: '#ff6a20', emit: false, prio: 0.5 }); }
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 14, top: 16, beams: 0 });
    w.solid('rock', -3, 14, -3, W + 3, 16, D + 3, { uv: 6, grad: false });
    for (const x of [0, W]) for (let z = 8; z < D - 6; z += 10) { w.visual('glow', x === 0 ? 0 : W - 0.03, 0.6, z, x === 0 ? 0.03 : W, 2.0, z + 2.2, { uv: 1, grad: false, tint: [1, 0.45, 0.1] }); w.addLight(x === 0 ? 1.2 : W - 1.2, 1.4, z + 1.1, { flame: 0.6, intensity: 6, range: 8, color: '#ff7a30', prio: 0.7 }); }
  };
  // ---- a hall of ice: the floor a sheet of ice, pillars sheathed in it, icicles over the vault
  S.frozen = function (w, rng, W, D, o) {
    H.floors(w, W, D, null, 'floor');
    w.visual('ice', 0, 0, 0, W, 0.02, D, { uv: 3, grad: false }); // (it looks iced over; the floor under it holds, no slipping in here)
    H.perimeter(w, rng, W, D, { gates: o.gates, h: 12, top: 14, beams: 0 });
    F.ceiling(w, rng, 0, 0, W, D, 12, { chandeliers: 0 });
    const FZ = F._frozen;
    if (FZ) { FZ.vaultIcicles(w, rng, W, D, 12, 24); for (const [x, z] of [[4, 6], [W - 4, 6], [4, D - 6], [W - 4, D - 6]]) if (clear(o, x, z, 1.2)) FZ.icePillar(w, rng, x, z, 12); }
  };

  // the hook in LG.room / LG.shop: the field's shell when it has one, else the stone hall (the caller builds that itself)
  LG.shellFor = (w) => S[w.biome] || null;
})();
