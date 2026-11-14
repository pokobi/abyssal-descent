'use strict';
// The middle tier's new fields (runplan.js R.TIERS[2]): drawn instead of the storeyed halls for a segment.
//   flooded - 水没回廊: halls drowned by the groundwater. The floor lies under shallow water; raised stone walkways and bridges run above
//             it, pillars stand in it, water falls from grates high in the walls.
//   foundry - 溶鉱の深層 (below): the old foundries, rivers of molten iron, furnaces, iron catwalks, steam.
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U, V = U.V;
  const P = () => G.Props, PG = () => G.Props.PG;
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), V(sx, sy, sz));

  // ---------------------------------------------------------------- 水没回廊
  // water falling from a grate high in a wall (a sheet of water, a pale haze where it lands, a glint of light)
  function waterfall(w, x, z, y, face, wd) {
    const alongX = face === 'pz' || face === 'nz', s = face === 'pz' || face === 'px' ? 1 : -1;
    const ox = alongX ? 0 : s * 0.35, oz = alongX ? s * 0.35 : 0;
    w.visual('iron', x - (alongX ? wd / 2 + 0.2 : 0.06) + ox, y - 0.2, z - (alongX ? 0.06 : wd / 2 + 0.2) + oz, x + (alongX ? wd / 2 + 0.2 : 0.06) + ox, y + 1.0, z + (alongX ? 0.06 : wd / 2 + 0.2) + oz, { uv: 1 });
    w.visual('water', x - (alongX ? wd / 2 : 0.08) + ox * 1.6, 0.05, z - (alongX ? 0.08 : wd / 2) + oz * 1.6, x + (alongX ? wd / 2 : 0.08) + ox * 1.6, y, z + (alongX ? 0.08 : wd / 2) + oz * 1.6, { uv: 2, grad: false });
    w.deferred.push((grp) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xc8e0e0, transparent: true, opacity: 0.35, depthWrite: false }));
      sp.scale.set(wd + 2.4, 1.6, 1); sp.position.set(x + ox * 3, 0.7, z + oz * 3); grp.add(sp);
    });
    (w.waterfalls = w.waterfalls || []).push({ bx: x + ox * 1.6, bz: z + oz * 1.6, wd, ax: alongX ? 1 : 0, az: alongX ? 0 : 1, nx: alongX ? 0 : s, nz: alongX ? s : 0 }); // (where it lands: water.js)
    w.addLight(x + ox * 4, 1.2, z + oz * 4, { flame: 0, intensity: 3, range: 7, color: '#9fd8d0', emit: false, prio: 0.5, steady: true });
  }
  // a raised stone walkway (solid to the ground, a curb along its edges): ax = along x
  function walkway(w, x0, z0, x1, z1, h) {
    w.solid('wall', x0, 0, z0, x1, h - 0.15, z1, { uv: 2.5 });
    w.solid('trim', x0 - 0.06, h - 0.15, z0 - 0.06, x1 + 0.06, h, z1 + 0.06, { uv: 1.5 });
    w.visual('moss', x0 - 0.08, 0, z0 - 0.08, x1 + 0.08, 0.35, z1 + 0.08, { uv: 2, grad: false });
  }
  // (the drowned town's area itself: field_flooded.js; it builds with this piece)
  F._flooded = { waterfall, walkway };
  F.SHELL.flooded = {
    outdoor: false,
    road(w, rng, W, AD, D) {
      const nook = FB.roadHall(w, rng, W, AD, D, false), cx = W / 2;
      // the hall road is half under water: water over its floor, moss on its piers, a fall of water at the far end
      w.visual('water', cx - 6.5, 0.0, AD + 3, cx + 6.5, 0.06, D - 2, { uv: 4, grad: false, skip: { bottom: true } });
      w.waterZones.push({ x0: cx - 6.5, z0: AD + 3, x1: cx + 6.5, z1: D - 2 });
      waterfall(w, cx + 5, D - 0.02, 9, 'nz', 2);
      return nook;
    },
    ring(w, rng, W, AD) { F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 2 }); },
    dress(w, rng, W, AD) {
      for (let i = 0; i < 4; i++) waterfall(w, rng.chance(0.5) ? 0.02 : W - 0.02, rng.range(10, AD - 10), rng.range(9, 13), rng.chance(0.5) ? 'px' : 'nx', rng.range(1.6, 2.6));
      for (let z = 8; z < AD - 4; z += 10) { P().vines(w, 0, rng.range(10, 16), z, 'px', rng.range(4, 7), rng); P().vines(w, W, rng.range(10, 16), z + 5, 'nx', rng.range(4, 7), rng); }
      w.animated.push({ kind: 'uvflow', mat: w.mats.water, sp: [0, -0.05] });
    },
    text: { sub: '— 水路の奥へ —', icon: '🌊', obj: '水に沈んだ回廊を進め — 石の扉をくぐると戦いが始まる' },
  };

  // iron straps about a square stack at the heights ys, an angle iron up each corner from y0 to y1 (to look at)
  F.ironBands = function (w, x0, z0, x1, z1, ys, y0, y1) {
    const o = 0.05, t = [0.5, 0.46, 0.42];
    for (const y of ys) { w.visual('iron', x0 - o, y, z0 - o, x1 + o, y + 0.16, z0, { uv: 1, tint: t }); w.visual('iron', x0 - o, y, z1, x1 + o, y + 0.16, z1 + o, { uv: 1, tint: t }); w.visual('iron', x0 - o, y, z0, x0, y + 0.16, z1, { uv: 1, tint: t }); w.visual('iron', x1, y, z0, x1 + o, y + 0.16, z1, { uv: 1, tint: t }); }
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) w.visual('iron', cx - 0.09, y0, cz - 0.09, cx + 0.09, y1, cz + 0.09, { uv: 1, tint: t });
  };
  // ---------------------------------------------------------------- 溶鉱の深層
  // a furnace: a brick mass with a glowing mouth, a chimney up to the vault, its light and its roar
  function furnace(w, rng, x, z, face, HT) {
    const s = 2.6, h = 6;
    w.solid('wall', x - s, 0, z - s, x + s, h, z + s, { uv: 2.5 });
    w.solid('trim', x - s - 0.2, h, z - s - 0.2, x + s + 0.2, h + 0.4, z + s + 0.2, { uv: 1.5 });
    w.solid('block', x - 1.2, h + 0.4, z - 1.2, x + 1.2, HT, z + 1.2, { uv: 2 });
    const d = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] }[face];
    const mx = x + d[0] * (s + 0.02), mz = z + d[1] * (s + 0.02), across = d[0] ? 'z' : 'x';
    // (the mouth: an arched iron frame, the fire behind a grate, doors swung open, a hood - gfx.js; iron bands and corner irons about the stack)
    if (!P().put(w, 'furnacemouth', mx, 0.5, mz, { pz: 0, nz: Math.PI, px: Math.PI / 2, nx: -Math.PI / 2 }[face], 1, { sx: 2.2, sy: 1.75, sz: 1.5 })) {
      w.visual('lava', across === 'x' ? mx - 1.1 : mx - 0.02, 0.6, across === 'z' ? mz - 1.1 : mz - 0.02, across === 'x' ? mx + 1.1 : mx + 0.02, 2.3, across === 'z' ? mz + 1.1 : mz + 0.02, { uv: 1, grad: false });
      w.visual('iron', across === 'x' ? mx - 1.3 : mx - 0.06, 2.3, across === 'z' ? mz - 1.3 : mz - 0.06, across === 'x' ? mx + 1.3 : mx + 0.06, 2.5, across === 'z' ? mz + 1.3 : mz + 0.06, { uv: 1 });
    }
    F.ironBands(w, x - s, z - s, x + s, z + s, [3.4, 4.9], 0, h);
    { const hw = 1.42, dp = 0.62, c = d[0] ? w.addCollider(Math.min(mx, mx + d[0] * dp), 0.5, mz - hw, Math.max(mx, mx + d[0] * dp), 2.3, mz + hw, { surf: 'metal' }) : w.addCollider(mx - hw, 0.5, Math.min(mz, mz + d[1] * dp), mx + hw, 2.3, Math.max(mz, mz + d[1] * dp), { surf: 'metal' }); c.vis = true; }   // (the doors swung open stop you)
    F.ironBands(w, x - 1.2, z - 1.2, x + 1.2, z + 1.2, [h + 1.6, h + 4.2, h + 6.8].filter((y) => y < HT - 0.5), h + 0.4, HT);
    w.addLight(x + d[0] * (s + 1.4), 1.6, z + d[1] * (s + 1.4), { flame: 0.5, intensity: 10, range: 12, color: '#ff6a20', prio: 1.1 });
    // (the flame that light draws before the mouth burns a body in it, player.js fireTouch; the fire in the mouth is behind the doors' box)
    (w.fireSpots || (w.fireSpots = [])).push({ k: 'mouth', x: x + d[0] * (s + 1.4), z: z + d[1] * (s + 1.4), r: 0.12, y0: 1.55, y1: 1.9 });
    w.lavaZones.push({ x0: mx - 0.5, z0: mz - 0.5, x1: mx + 0.5, z1: mz + 0.5, y: 1, decor: true });
  }
  // an anvil and its block
  function anvil(w, x, z) {
    w.solid('woodDark', x - 0.45, 0, z - 0.45, x + 0.45, 0.6, z + 0.45, { uv: 1 });
    w.solid('iron', x - 0.6, 0.6, z - 0.22, x + 0.6, 0.95, z + 0.22, { uv: 1 });
    w.batch.geo('iron', PG().cone, Mx(x + 0.85, 0.82, z, 0.2, 0.6, 0.2, 0, 0, Math.PI / 2));
  }
  // a crucible hanging on chains over the floor (visual; a little glow)
  function crucible(w, x, y, z, top) {
    w.batch.geo('iron', PG().bowl, Mx(x, y, z, 1.4, 2.2, 1.4));
    w.visual('lava', x - 0.6, y + 0.66, z - 0.6, x + 0.6, y + 0.72, z + 0.6, { uv: 1, grad: false });
    P().chain(w, x - 0.8, top - 0.2, z, top - y - 0.4); P().chain(w, x + 0.8, top - 0.2, z, top - y - 0.4);
    w.addLight(x, y + 1.4, z, { flame: 0, intensity: 4, range: 8, color: '#ff7a30', emit: false, prio: 0.6 });
  }
  // (the works' area itself: field_foundry.js, bays over the melt and the machines between them)
  F._foundry = { furnace, crucible };
  F.SHELL.foundry = {
    outdoor: false,
    road(w, rng, W, AD, D) {
      const nook = FB.roadHall(w, rng, W, AD, D, false), cx = W / 2;
      // a channel of molten iron runs along the road (behind a lip), lighting it from below
      for (const sx of [-1, 1]) {
        const x = cx + sx * 5.6;
        w.solid('iron', x - 0.6, 0, AD + 6, x + 0.6, 0.35, D - 4, { uv: 1 });
        // (the iron in it is lava as the melt is, fields.js: step in it and it burns)
        if (G.Fields) G.Fields.add(w, 'lava', x - 0.45, AD + 6, x + 0.45, D - 4, { y: 0.35, noLight: true }); else w.visual('lava', x - 0.45, 0.35, AD + 6, x + 0.45, 0.37, D - 4, { uv: 2, grad: false });
      }
      for (let z = AD + 10; z < D - 6; z += 14) w.addLight(cx, 1, z, { flame: 0, intensity: 8, range: 12, color: '#ff6a20', emit: false, prio: 0.8 });
      return nook;
    },
    ring(w, rng, W, AD) { F.ceiling(w, rng, 0, 0, W, AD, 24, { chandeliers: 0 }); },
    dress(w, rng, W, AD) {
      for (const [x, z, f] of [[3.2, AD * 0.3, 'px'], [W - 3.2, AD * 0.55, 'nx']]) furnace(w, rng, x, z, f, 24);
      for (let i = 0; i < 3; i++) crucible(w, rng.range(12, W - 12), rng.range(9, 13), rng.range(10, AD - 10), 24);
    },
    text: { sub: '— 炉の奥へ —', icon: '🔥', obj: '溶鉄の流れる回廊を進め — 石の扉をくぐると戦いが始まる' },
  };
})();
