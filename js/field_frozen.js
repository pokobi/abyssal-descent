'use strict';
// 凍てつく霊廟 (frozen, the deep tier), on a framework of its own: the mausoleum's great hall stands over a lake frozen solid. The floor
// of the fight is the ice itself: slick underfoot, and it does not hold. An explosion or a falling icicle cracks it (white lines),
// a second blow breaks it out, and below is water cold enough to kill: whoever goes in is thrown back to where they last stood firm,
// 15% of their HP gone (a foe that goes in is lost). A broken patch freezes over again in a while. Round the lake a stone shore, and
// tomb islands stand up out of the ice; icicles still fall from the vault (fieldgen_t4.js F.tickIcicles).
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const FZ = () => F._frozen;
  const TS = 3, HT = 16, REFREEZE = 24;

  function genFrozen(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const W = 82 + rng.int(0, 2) * 4, D = 92 + rng.int(0, 2) * 4;
    const w = new G.World(W, D, 'frozen');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    w.killY = -6;
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
    w.visual('water', lx0, -1.25, lz0, lx1, -1.2, lz1, { uv: 4, grad: false, skip: { bottom: true }, tint: [0.35, 0.5, 0.6] });
    w.visual('dark', lx0, -9, lz0, lx1, -8.9, lz1, { uv: 4, grad: false });
    for (const r of isl) { w.solid('block', r.x0, -10, r.z0, r.x1, 0.6, r.z1, { uv: 3 }); w.solid('trim', r.x0 - 0.1, 0.6, r.z0 - 0.1, r.x1 + 0.1, 0.85, r.z1 + 0.1, { uv: 1.5 }); }
    w.iceTiles = [];
    for (let k = 0; k < nZ; k++) for (let i = 0; i < nX; i++) {
      const x0 = ix0 + i * TS, z0 = iz0 + k * TS, cx = x0 + TS / 2, cz = z0 + TS / 2;
      if (isl.some((r) => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1)) continue;
      if (chan && cx > chan.x0 && cx < chan.x1) continue;
      const col = w.addCollider(x0, -0.5, z0, x0 + TS, 0, z0 + TS, { surf: 'ice', noGrapple: true });
      w.iceTiles.push({ k: w.iceTiles.length, x0, z0, x1: x0 + TS, z1: z0 + TS, col, hp: 2, t: 0, mesh: null, crack: null });
    }
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
    for (let z = 8; z < D - 4; z += 7) for (const side of [0, W]) w.visual('ice', side === 0 ? 0 : W - 0.03, rng.range(2, 6), z, side === 0 ? 0.03 : W, rng.range(8, 12), z + rng.range(1, 3), { uv: 2, grad: false });
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
  // a tile's state: 2 whole, 1 cracked, 0 broken (gone: no collider, open water). fx: the crack's sound, the break's shards and splash
  function setTile(w, t, hp, fx) {
    const was = t.hp; if (hp === was) return false;
    const c = V((t.x0 + t.x1) / 2, 0, (t.z0 + t.z1) / 2);
    t.hp = hp;
    if (hp > 0) {
      if (was <= 0) { t.col.alive = true; t.t = 0; w.navPatch(t.x0, t.z0, t.x1, t.z1); w._vn = null; }
      iceLook(w, t, hp >= 2 ? 'whole' : 'crack');
      if (fx && hp < was && G.sfx.ice) G.sfx.ice(c);
      return true;
    }
    t.t = 0; t.col.alive = false;
    iceLook(w, t, 'gone');
    if (fx) {
      G.fx.debris && G.fx.debris(c.clone().setY(0.2), w.mats.ice, 8, 0.35, 5);
      if (G.Water) G.Water.splash(c.clone().setY(-1.2), 1.2, { silent: false });
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
