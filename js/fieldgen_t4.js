'use strict';
// The deep tier's new fields (runplan.js R.TIERS[3]): drawn instead of the blue-fire ruin for a segment.
//   frozen  - 凍てつく霊廟: a mausoleum frozen solid. Pillars sheathed in ice, crystal growths, frozen statues, slick ice underfoot,
//             and icicles that break from the vault: a shadow on the floor, then the fall.
//   sanctum - 天空の聖域 (below): a sanctuary floating in a false sky at the bottom of the abyss; broad islands of white stone and wide bridges
//             over clouds with darkness under them.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  // ---------------------------------------------------------------- 凍てつく霊廟
  // a pillar in a sheath of ice, icicles hanging from where it meets the vault
  function icePillar(w, rng, x, z, h) {
    P().pillarRound(w, x, z, 0, h, 0.5, false, rng);
    w.batch.geo('ice', PG().cyl8, Mx(x, h * 0.3, z, 0.78, h * 0.6, 0.78, 0, rng.range(0, 3), 0));
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + rng.range(-0.3, 0.3); w.batch.geo('ice', PG().cone, Mx(x + Math.cos(a) * 0.9, h - 1.3, z + Math.sin(a) * 0.9, 0.18, rng.range(1.2, 2.4), 0.18, Math.PI, 0, 0)); }
  }
  // a statue frozen in a block of ice
  function frozenStatue(w, rng, x, z) {
    P().statue(w, x, z, 0, rng.range(0, 6), rng, rng.range(0.9, 1.15));
    w.batch.geo('ice', PG().box, Mx(x, 1.45, z, 2.1, 2.9, 2.1, 0, rng.range(-0.3, 0.3), 0));
    w.addCollider(x - 1.0, 0, z - 1.0, x + 1.0, 2.9, z + 1.0, { surf: 'stone' });
  }
  // icicles all over the vault (visual; the ones that fall are the field's hazard, see F.tickIcicles)
  function vaultIcicles(w, rng, W, D, y, n) {
    for (let i = 0; i < n; i++) w.batch.geo('ice', PG().cone, Mx(rng.range(3, W - 3), y - 0.9, rng.range(3, D - 3), rng.range(0.15, 0.35), rng.range(1.2, 3.2), rng.range(0.15, 0.35), Math.PI, 0, 0));
  }
  // (the mausoleum's area itself: field_frozen.js, the frozen lake whose ice breaks; it builds with these pieces)
  F._frozen = { icePillar, frozenStatue, vaultIcicles };
  // the icicles that fall: while you fight in a frozen hall, every few seconds one breaks from the vault near you. A pale ring on the
  // floor marks it a second before it lands; inside the ring it hurts and leaves ice (each player's own: they fall around whoever is there).
  F.tickIcicles = function (w, dt) {
    const I = w.icicles, GM = G.game, Pl = G.player;
    if (!I || !Pl || Pl.dead || GM.state !== 'playing' || GM.areaCleared || GM.stage === 'boss' || !(G.enemies.list.length > 0)) return;
    if (I.falls) for (const f of I.falls.slice()) {
      f.t += dt;
      if (f.t >= f.T) {
        I.falls.splice(I.falls.indexOf(f), 1);
        G.fx.sparks(f.p.clone().setY(0.4), V(0, 1, 0), 18, 0xd8f0ff, 6); G.fx.debris && G.fx.debris(f.p.clone().setY(0.6), w.mats.ice, 6, 0.4, 6);
        if (G.vfx && G.vfx.spikes) G.vfx.spikes([f.p.clone()], { kind: 'ice', r: 0.6, h: 1.4, n: 2, dur: 0.5 });
        G.sfx.ice ? G.sfx.ice(f.p) : G.sfx.explosion(f.p, 0.3);
        if (Math.hypot(Pl.pos.x - f.p.x, Pl.pos.z - f.p.z) < f.r && Pl.pos.y < 3) G.combat.damagePlayer(Pl.stats.maxHp * 0.07, { src: 'aoe', pos: f.p.clone(), elem: 'frost', el: 'ice' });
        for (const e of G.enemies.list) if (e.alive && !e._rep && !e.flyer && Math.hypot(e.pos.x - f.p.x, e.pos.z - f.p.z) < f.r + (e.radius || 0.5) * 0.5) G.combat.damageEnemy(e, e.maxHp * 0.05, { src: 'env', el: 'ice' });
        if (F.iceHit) F.iceHit(w, f.p.x, f.p.z, f.r, 1); // (on the frozen lake it cracks the ice: field_frozen.js)
        if (f.mesh) { w.group.remove(f.mesh); f.mesh = null; }
      } else if (f.mesh) f.mesh.position.y = (I.y - 1.4) - (I.y - 2.6) * Math.pow(Math.max(0, (f.t - f.T + 0.4) / 0.4), 2); // (it hangs, shakes loose, then drops in the last 0.4 s)
    }
    I.next -= dt;
    if (I.next > 0) return;
    I.next = 4 + Math.random() * 4;
    const a = Math.random() * Math.PI * 2, d = 1.5 + Math.random() * 5, p = V(Pl.pos.x + Math.cos(a) * d, 0.02, Pl.pos.z + Math.sin(a) * d);
    if (p.x < 2 || p.z < 2 || p.x > w.W - 2 || p.z > w.D - 2) return;
    const f = { p, t: 0, T: 1.2, r: 1.5 };
    G.fx.telegraph(p, f.r, f.T, 0xbfe8ff);
    f.mesh = new THREE.Mesh(PG().cone, w.mats.ice); f.mesh.scale.set(0.45, 2.6, 0.45); f.mesh.rotation.x = Math.PI; f.mesh.position.set(p.x, I.y - 1.4, p.z); w.group.add(f.mesh); // (in the world's group: gone with the area)
    (I.falls = I.falls || []).push(f);
  };
  F.SHELL.frozen = {
    outdoor: false,
    road(w, rng, W, AD, D) {
      const nook = FB.roadHall(w, rng, W, AD, D, false), cx = W / 2;
      for (let z = AD + 8; z < D - 6; z += 7) for (const sx of [-1, 1]) { if (sx < 0 && Math.abs(z - nook.nz) < 7) continue; P().crystals(w, cx + sx * 5.6, 0, z, rng, rng.range(0.9, 1.4)); }
      for (let i = 0; i < 30; i++) w.batch.geo('ice', PG().cone, Mx(cx + rng.range(-6, 6), 12.2, rng.range(AD + 4, D - 2), rng.range(0.15, 0.3), rng.range(1, 2.4), rng.range(0.15, 0.3), Math.PI, 0, 0));
      return nook;
    },
    ring(w, rng, W, AD) { F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 2 }); vaultIcicles(w, rng, W, AD, 24, 50); },
    dress(w, rng, W, AD) {
      for (const [x, z] of [[5, 5], [W - 5, 5], [5, AD - 9], [W - 5, AD - 9]]) P().crystals(w, x, 0, z, rng, 2);
      for (let z = 8; z < AD - 4; z += 9) for (const side of [0, W]) w.visual('ice', side === 0 ? 0 : W - 0.03, rng.range(3, 8), z, side === 0 ? 0.03 : W, rng.range(12, 18), z + rng.range(1.5, 3), { uv: 2, grad: false });
    },
    text: { sub: '— 霊廟の奥へ —', icon: '❄️', obj: '凍てつく回廊を進め — 石の扉をくぐると戦いが始まる' },
  };

  // ---------------------------------------------------------------- 天空の聖域
  // white stone islands over a sea of clouds: the floor exists only on the islands and the bridges between them.
  // The sky fields are laid out wider than the others (most of the area is sky): a great island in the middle, broad islands round it
  // (each a round body with a lobe or two) and bridges wide enough to fight on, so the floor comes near what the other fields of the
  // depth give you.
  function genSanctum(area, seed, extraChests, gates, kind) {
    const { rng, W, D, w, occ } = FB.base(area, seed, 'sanctum', Math.min(96, 82 + Math.floor(area / 3) * 2 + ((seed >>> 0) % 3) * 4));
    FB.reserve(occ, W, D, gates);
    const pit = new Uint8Array(W * D).fill(1);
    const fill = (x0, z0, x1, z1) => { for (let z = Math.max(0, Math.floor(z0)); z < Math.min(D, Math.ceil(z1)); z++) for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) pit[z * W + x] = 0; };
    const disc = (cx, cz, r) => { for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (x >= 0 && z >= 0 && x < W && z < D && Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r) pit[z * W + x] = 0; };
    // the gate terrace (exits, the post-clear stall) and the landing you arrive on
    const TD = 18, LW = 14, LD = 18, GAP = 3; // (GAP: the sky kept between two islands, and round the terrace and the landing)
    fill(0, 0, W, TD); fill(W / 2 - LW, D - LD, W / 2 + LW, D);
    const isl = [{ x: W / 2, z: TD / 2, r: 0, discs: [] }, { x: W / 2, z: D - LD / 2, r: 0, discs: [] }];
    const fits = ([x, z, r]) => z - r >= TD + GAP && x - r >= 2 && x + r <= W - 2 && z + r <= D - 3
      && !(z + r > D - LD - GAP && x + r > W / 2 - LW - GAP && x - r < W / 2 + LW + GAP)
      && isl.every((q) => q.discs.every(([a, b, s]) => Math.hypot(a - x, b - z) >= s + r + GAP));
    // the great island in the middle: the open heart of the sanctuary (a shrine at its centre, a wide ring of columns, room to fight)
    {
      const r = Math.min(17, (D - LD - TD) / 2 - GAP - 3), body = [W / 2 + rng.range(-6, 6), (TD + D - LD) / 2 + rng.range(-3, 3), r];
      isl.push({ x: body[0], z: body[1], r, discs: [body], great: true }); disc(...body);
    }
    // broad islands first, then smaller ones into the sky left between them
    const nI = 10 + rng.int(0, 2);
    for (let t = 0; t < 1400 && isl.length < nI + 3; t++) {
      const r = t < 700 ? rng.range(9, 13) : rng.range(6.5, 9), body = [rng.range(r + 2, W - r - 2), rng.range(TD + GAP + r, D - 3 - r), r];
      if (!fits(body)) continue;
      const discs = [body];
      for (let k = rng.int(1, 3); k > 0; k--) { const a = rng.range(0, 6.28), d = r * rng.range(0.6, 0.85), lobe = [body[0] + Math.cos(a) * d, body[1] + Math.sin(a) * d, r * rng.range(0.5, 0.7)]; if (fits(lobe)) discs.push(lobe); }
      isl.push({ x: body[0], z: body[1], r, discs }); for (const [a, b, s] of discs) disc(a, b, s);
    }
    // bridges: a tree joining every island (nearest first), and two more for loops
    const bridge = (a, b, hw) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2); for (let i = 0; i <= n; i++) { const k = i / n; disc(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, hw); } };
    const linked = [0], links = [];
    while (linked.length < isl.length) {
      let best = null;
      for (const i of linked) for (let j = 0; j < isl.length; j++) if (!linked.includes(j)) { const d = Math.hypot(isl[i].x - isl[j].x, isl[i].z - isl[j].z); if (!best || d < best.d) best = { i, j, d }; }
      linked.push(best.j); links.push([best.i, best.j]);
    }
    for (const [i, j] of links) bridge(isl[i], isl[j], 2.4);
    for (let k = 0; k < 2 && isl.length > 3; k++) { const a = rng.int(2, isl.length - 1), b = rng.int(0, isl.length - 1); if (a !== b && !links.some(([i, j]) => (i === a && j === b) || (i === b && j === a))) { bridge(isl[a], isl[b], 2.0); links.push([a, b]); } }
    for (let i = 0; i < W * D; i++) if (pit[i]) occ.a[i] = 1;
    H.floors(w, W, D, pit, 'floor');
    H.perimeter(w, rng, W, D, { gates, h: 9, noBal: true });
    w.layout = 'islands';
    w.killY = -12; w.noRim = true;
    // the islands' undersides: rock cones hanging into the clouds (visual)
    w.deferred.push((grp) => {
      for (const q of isl) for (const [x, z, s] of q.discs) { const m = new THREE.Mesh(PG().cone, w.mats.rock); m.scale.set(s * 0.95, s * 1.6, s * 0.95); m.rotation.x = Math.PI; m.position.set(x, -s * 0.8 - 0.4, z); grp.add(m); }
      for (const [x0, z0, x1, z1] of [[0, 0, W, TD], [W / 2 - LW, D - LD, W / 2 + LW, D]]) { const m = new THREE.Mesh(PG().box, w.mats.rock); m.scale.set(x1 - x0, 6, z1 - z0); m.position.set((x0 + x1) / 2, -3.4, (z0 + z1) / 2); grp.add(m); }
    });
    // the statues that breathe the wind (風の像, gimmick_b.js): on the rim of one or two broad islands, each blowing across its island
    // toward open sky (never at a bridge, nor out over one); the lane is kept clear of the island's columns and trees
    if (G.Gim) {
      const HW = G.Gim.GA.hw, want = 1 + (rng.chance(0.5) ? 1 : 0), used = new Set();
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      const bridgeAng = (i) => links.filter(([a, b]) => a === i || b === i).map(([a, b]) => { const o = isl[a === i ? b : a]; return Math.atan2(o.z - isl[i].z, o.x - isl[i].x); });
      for (let t = 0, n = 0; t < 40 && n < want && isl.length > 3; t++) {
        const i = rng.int(2, isl.length - 1), q = isl[i];
        if (used.has(i) || q.great || q.r < 9) continue;
        const ba = bridgeAng(i), a0 = rng.range(0, 6.28);
        for (let k = 0; k < 16; k++) {
          const a = a0 + k * 0.39, sx = q.x + Math.cos(a) * (q.r - 1.7), sz = q.z + Math.sin(a) * (q.r - 1.7);
          if (ba.some((b) => Math.abs(wrap(a - b)) < 0.75 || Math.abs(wrap(a + Math.PI - b)) < 0.6)) continue;
          if (!occ.free(sx - 1.2, sz - 1.2, sx + 1.2, sz + 1.2)) continue;
          const dx = -Math.cos(a), dz = -Math.sin(a), len = 2 * (q.r - 1.7) + 5;
          occ.mark(sx - 1.2, sz - 1.2, sx + 1.2, sz + 1.2);
          for (let s = 1.2; s < len; s += 0.6) for (let l = -HW - 0.5; l <= HW + 0.5; l += 0.6) { const x = sx + dx * s + dz * l, z = sz + dz * s - dx * l; if (x >= 0 && z >= 0 && x < W && z < D) occ.a[Math.floor(z) * W + Math.floor(x)] = 1; }
          G.Gim.addGale(w, sx, sz, dx, dz, len); used.add(i); q.gale = true; n++; break;
        }
      }
    }
    // on the islands: a ring of columns round a shrine, statues, golden braziers, a vent that throws you up to a floating slab
    let tops = 0;
    for (const q of isl) {
      if (!q.r) continue;
      const big = q.r > 10.5;
      let kind2 = q.great ? 'shrine' : rng.pick(['ring', 'shrine', 'statues', 'garden']);
      if (q.gale && kind2 === 'shrine') kind2 = 'ring'; // (no altar in the middle of the gale's way)
      if (kind2 === 'ring' || kind2 === 'shrine') {
        const n = q.great ? 10 : big ? 8 : 6, rr = q.r - 2;
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + rng.range(-0.1, 0.1), x = q.x + Math.cos(a) * rr, z = q.z + Math.sin(a) * rr; if (occ.free(x - 0.8, z - 0.8, x + 0.8, z + 0.8)) { P().pillarRound(w, x, z, 0, rng.range(4, 7), 0.42, rng.chance(0.25), rng); occ.mark(x - 0.8, z - 0.8, x + 0.8, z + 0.8); } }
        if (kind2 === 'shrine') { w.solid('trim', q.x - 1.2, 0, q.z - 1.2, q.x + 1.2, 1.0, q.z + 1.2, { uv: 1 }); P().brazier(w, q.x, 1.0, q.z, 1.1); occ.mark(q.x - 1.8, q.z - 1.8, q.x + 1.8, q.z + 1.8); }
      } else if (kind2 === 'statues') {
        for (let i = 0; i < (big ? 4 : 3); i++) { const a = rng.range(0, 6.28), d = rng.range(0, q.r - 3), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; if (occ.free(x - 1.4, z - 1.4, x + 1.4, z + 1.4)) { occ.mark(x - 1.4, z - 1.4, x + 1.4, z + 1.4); w.solid('block', x - 1, 0, z - 1, x + 1, 0.8, z + 1, { uv: 1 }); P().statue(w, x, z, 0.8, rng.range(0, 6), rng, 1); } }
      } else {
        for (let i = 0; i < (big ? 5 : 4); i++) { const a = rng.range(0, 6.28), d = rng.range(1, q.r - 2), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d; if (occ.free(x - 1, z - 1, x + 1, z + 1)) { occ.mark(x - 1, z - 1, x + 1, z + 1); const ts = rng.int(1, 1e9), sc = rng.range(0.7, 1.0); w.deferred.push((grp) => LG.tree(grp, w, x, 0, z, new G.RNG(ts), sc)); w.addCollider(x - 0.25, 0, z - 0.25, x + 0.25, 4, z + 0.25, { surf: 'wood' }); } }
      }
      for (let i = 0; i < 2; i++) { const a = rng.range(0, 6.28), x = q.x + Math.cos(a) * (q.r - 1.2), z = q.z + Math.sin(a) * (q.r - 1.2); if (occ.free(x - 0.6, z - 0.6, x + 0.6, z + 0.6)) { P().brazier(w, x, 0, z, 0.9, true); occ.mark(x - 0.8, z - 0.8, x + 0.8, z + 0.8); } }
      // a floating slab above the island, reached by the updraft of a vent
      if (G.Fields && tops < 4 && rng.chance(0.6)) {
        const a = rng.range(0, 6.28), d = rng.range(0, Math.max(0.5, q.r - 4)), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d, y = rng.range(4.5, 6);
        if (occ.free(x - 2.5, z - 2.5, x + 2.5, z + 2.5)) {
          occ.mark(x - 2.5, z - 2.5, x + 2.5, z + 2.5);
          w.solid('block', x - 2.4, y - 0.5, z - 2.4, x + 2.4, y, z + 2.4, { uv: 2 }); w.solid('trim', x - 2.5, y - 0.7, z - 2.5, x + 2.5, y - 0.5, z + 2.5, { uv: 1 });
          w.platTops.push({ x0: x - 2.1, z0: z - 2.1, x1: x + 2.1, z1: z + 2.1, y, cx: x, cz: z });
          const vx = x + (rng.chance(0.5) ? 3.6 : -3.6);
          if (Math.hypot(vx - q.x, z - q.z) < q.r - 1.4) G.Fields.add(w, 'vent', vx - 1, z - 1, vx + 1, z + 1);
          tops++;
        }
      }
    }
    // the gate terrace: a colonnade along its edge over the drop, golden lamps
    for (let x = 6; x < W - 4; x += 7) if (LG.gateXs(W, gates || 1).every((g) => Math.abs(g - x) > 6) && Math.abs(x - W / 2) > 14) { P().pillarRound(w, x, 17, 0, 7, 0.42, false, rng); occ.mark(x - 1, 16, x + 1, 18); }
    for (let x = 3; x < W - 3; x += 8) { const c = pit[18 * W + Math.floor(x)]; if (c) { w.solid('block', x - 0.2, 0, 17.6, x + 0.2, 1.0, 17.99, { uv: 1 }); } }
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.sanctum = genSanctum;
  // the sanctuary's guardian approach: a long bridge over the clouds to a white gate; the field itself is a great island
  function roadSanctum(w, rng, W, AD, D) {
    const cx = W / 2, gz0 = AD, gz1 = AD + 3, hw = 5;
    w.solid('floor', cx - hw, -1, gz1, cx + hw, 0, D, { uv: 2 });
    // the merchant's balcony on the left half way
    const nz = gz1 + (D - gz1) * 0.45;
    w.solid('floor', cx - hw - 6, -1, nz - 5, cx - hw, 0, nz + 6, { uv: 2 });
    w.deferred.push((grp) => { const m = new THREE.Mesh(PG().box, w.mats.rock); m.scale.set(hw * 2 + 2, 5, D - gz1); m.position.set(cx, -3.6, (gz1 + D) / 2); grp.add(m); const b = new THREE.Mesh(PG().cone, w.mats.rock); b.scale.set(8, 14, 8); b.rotation.x = Math.PI; b.position.set(cx - hw - 3, -7, nz); grp.add(b); });
    // balustrades along the bridge (open at the balcony), statues and golden lamps
    const bal = (x0, z0, x1, z1) => { w.solid('block', x0, 0, z0, x1, 1.0, z1, { uv: 1 }); w.visual('trim', x0 - 0.04, 1.0, z0 - 0.04, x1 + 0.04, 1.08, z1 + 0.04, { uv: 1 }); };
    bal(cx + hw - 0.4, gz1, cx + hw, D); bal(cx - hw, gz1, cx - hw + 0.4, nz - 5); bal(cx - hw, nz + 6, cx - hw + 0.4, D);
    bal(cx - hw - 6, nz - 5.4, cx - hw, nz - 5); bal(cx - hw - 6, nz + 6, cx - hw, nz + 6.4); bal(cx - hw - 6.4, nz - 5, cx - hw - 6, nz + 6);
    for (let z = gz1 + 8; z < D - 4; z += 12) { P().brazier(w, cx + hw - 1.2, 0, z, 0.9, true); if (Math.abs(z - nz) > 8) P().brazier(w, cx - hw + 1.2, 0, z + 6, 0.9, true); }
    // the white gate
    const gate = 3.2;
    w.solid('block', 0, 0, gz0, cx - gate, 9, gz1, { uv: 4 }); w.solid('block', cx + gate, 0, gz0, W, 9, gz1, { uv: 4 });
    for (const sx of [-1, 1]) w.solid('trim', cx + sx * gate + (sx < 0 ? -1.4 : 0), 0, gz0 - 0.5, cx + sx * gate + (sx > 0 ? 1.4 : 0), 10.5, gz1 + 0.5, { uv: 2 });
    w.solid('block', cx - gate - 1.4, 7, gz0 - 0.5, cx + gate + 1.4, 10.5, gz1 + 0.5, { uv: 3 });
    w.addCollider(cx - gate - 1.4, 10.5, gz0 - 0.5, cx + gate + 1.4, 14, gz1 + 0.5, { noGrapple: true });
    for (const sx of [-1, 1]) { P().statue(w, cx + sx * (gate + 3.4), gz1 + 2, 0, 0, rng, 1.2); w.addLight(cx + sx * (gate + 0.8), 6, gz1 + 1.6, { flame: 0.3, intensity: 7, range: 11, color: '#ffd090', prio: 1.2 }); }
    w.bossGate = { x: cx, z0: gz0, z1: gz1, w: gate * 2 };
    w.deferred.push((grp) => { const pc = H.portcullis(w, gate * 2 - 0.2, 6.2); pc.position.set(cx, 5.8, gz1 - 0.2); grp.add(pc); w.bossGate.pc = pc; });
    return { nz, side: -1, nx: cx - hw - 2.4 };
  }
  F.SHELL.sanctum = {
    outdoor: true, wallH: 4, road: roadSanctum, perim: (AD) => ({ balD: AD + 3 }), floor: 'arena',
    ring(w, rng, W, AD, last) {
      // columns round the field's rim (the balustrade of the island is the perimeter's)
      for (let z = 8; z < AD - 4; z += 10) for (const px of [2.2, W - 2.2]) P().pillarRound(w, px, z, 0, rng.range(5, 8), 0.45, rng.chance(0.2), rng);
      w.killY = -14;
    },
    dress(w, rng, W, AD) {
      for (const [x, z] of [[5, 5], [W - 5, 5]]) P().brazier(w, x, 0, z, 1.2);
    },
    text: { sub: '— 聖域の奥へ —', icon: '☁️', obj: '雲の上の橋を渡れ — 白い門をくぐると戦いが始まる' },
  };
})();
