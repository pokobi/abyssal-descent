'use strict';
// Fields 3 and 4 (halls / ruin). The area is built around a chasm that runs north-south (the way from the spawn to the exits):
//   - the spawn lies south of its end and the three exits on the north wall, so a floor strip is left at both ends of the chasm
//   - the chasm splits the area into a west and an east half; each half is a stack of three tall storeys joined by stairs, wooden ramps and ladders
//   - between the halves: bare plank bridges (every storey has at least one) and, separately, thin tightropes that you balance across
//   - at the bottom of the chasm runs a trench of lava (blue in the ruin): nothing spawns there, monsters will not walk in,
//     and one knocked in is thrown back out (enemies.js); the player burns and can climb out by the low ledges
//   - barred prison rooms are dug into the west / east walls; some are shut by an iron gate (the player opens it in 2 s, a monster whose way leads
//     through it batters it down); spawn graves (graves.js) stand in them and around
(function () {
  const LG = G.LevelGen, H = LG._, FG = G.FieldGen, U = G.U;
  const P = () => G.Props;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const S = (G.Strata = { ropes: [], ladders: [], doors: [], onRope: false });
  const NS = 18, SS = 10;           // the floor left north / south of the chasm (the exits and the mini shop / the spawn)
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3(), _s = new THREE.Vector3();
  // a box with yaw / pitch / roll (order YXZ: yaw last) into the static batch
  function box(w, mk, x, y, z, sx, sy, sz, ry, rx, rz, tint) {
    _e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q.setFromEuler(_e);
    w.batch.geo(mk, G.Props.PG.box, new THREE.Matrix4().compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz)), tint ? { tint } : undefined);
  }
  const cl = (a, i) => a[U.clamp(Math.floor(i), 0, a.length - 1)];
  const amin = (a, i0, i1) => { let m = Infinity; for (let i = Math.max(0, Math.floor(i0)); i <= Math.min(a.length - 1, Math.floor(i1)); i++) m = Math.min(m, a[i]); return m; };
  const amax = (a, i0, i1) => { let m = -Infinity; for (let i = Math.max(0, Math.floor(i0)); i <= Math.min(a.length - 1, Math.floor(i1)); i++) m = Math.max(m, a[i]); return m; };
  const runs = (a) => { const out = []; let s = 0; for (let i = 1; i <= a.length; i++) if (i === a.length || a[i] !== a[s]) { out.push({ x0: s, x1: i, e: a[s] }); s = i; } return out; };

  // a rectangle minus holes, as a list of rectangles
  function cut(r, holes) {
    const hs = holes.filter((h) => h.x1 > r.x0 && h.x0 < r.x1 && h.z1 > r.z0 && h.z0 < r.z1);
    const xs = [r.x0, r.x1];
    for (const h of hs) xs.push(U.clamp(h.x0, r.x0, r.x1), U.clamp(h.x1, r.x0, r.x1));
    const ux = [...new Set(xs)].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < ux.length - 1; i++) {
      const a = ux[i], b = ux[i + 1]; if (b - a < 0.01) continue;
      const m = (a + b) / 2;
      const zs = hs.filter((h) => h.x0 < m && h.x1 > m).map((h) => [Math.max(r.z0, h.z0), Math.min(r.z1, h.z1)]).sort((p, q) => p[0] - q[0]);
      let z = r.z0;
      for (const [p, q] of zs) { if (p > z + 0.01) out.push({ x0: a, z0: z, x1: b, z1: p }); z = Math.max(z, q); }
      if (r.z1 > z + 0.01) out.push({ x0: a, z0: z, x1: b, z1: r.z1 });
    }
    return out;
  }

  // ---- a plank bridge: just loose planks laid across the gap (no posts, no rails), each a little askew; the walkable deck is in short staggered steps so it may run at a slant ----
  // from (x0, za) to (x1, zb); bw wide
  function plankBridge(w, rng, x0, x1, za, zb, y, bw) {
    const n = Math.max(4, Math.ceil((x1 - x0) / 0.8));
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n, xb = x0 + ((x1 - x0) * (i + 1)) / n, zc = za + (zb - za) * ((i + 0.5) / n);
      const c = w.addCollider(xa, y - 0.25, zc - bw / 2, xb, y, zc + bw / 2, { surf: 'wood' }); c.tag = 'bridge';
    }
    const Ld = Math.hypot(x1 - x0, zb - za), ux = (x1 - x0) / Ld, uz = (zb - za) / Ld, th = Math.atan2(ux, uz), px = uz, pz = -ux;
    const at = (u, side) => [x0 + ux * u + px * side, za + uz * u + pz * side];
    // two stringers underneath, a little off true
    for (const sd of [-1, 1]) { const [x, z] = at(Ld / 2, sd * (bw / 2 - 0.3)); box(w, 'woodDark', x, y - 0.17, z, 0.16, 0.14, Ld + 0.4, th + rng.range(-0.015, 0.015), rng.range(-0.01, 0.01)); }
    // the deck: planks of different lengths and widths, each laid down a little askew, with gaps between them
    for (let u = rng.range(0.1, 0.25); u < Ld - 0.12; u += rng.range(0.3, 0.42)) {
      const [x, z] = at(u, rng.range(-0.12, 0.12));
      const tone = rng.range(0.7, 1.12);
      box(w, rng.chance(0.3) ? 'woodDark' : 'wood', x, y - 0.04 + rng.range(-0.012, 0.02), z, bw * rng.range(0.9, 1.16), rng.range(0.045, 0.07), rng.range(0.2, 0.3), th + rng.range(-0.13, 0.13), rng.range(-0.03, 0.03), rng.range(-0.035, 0.035), [tone, tone * rng.range(0.9, 1), tone * rng.range(0.82, 0.95)]);
    }
  }

  // ---- a barred prison room dug into the west / east wall (s: 'W' wall at x = 0, 'E' wall at x = W) ----
  // The niche is carved out of the wall (levelgen perimeter, via notches) and lined with extra masonry behind it; its mouth is a wall of
  // bars flush with the wall face. Returns false if it does not fit.
  function cell(w, rng, o, s, k, y, W, D, area, fm, ctx) {
    const cw = rng.int(10, 18), d = rng.int(6, 9), hc = rng.range(5.2, 5.8), ext = 1.2, WT = LG._.WALL_T;
    const sg = s === 'W' ? -1 : 1, xf = s === 'W' ? 0 : W;
    const X = (u) => xf + sg * u;                                   // depth u from the mouth -> x
    for (let t = 0; t < 50; t++) {
      const z0 = rng.int(5, D - 5 - cw), z1 = z0 + cw;
      if (ctx.nooks.some((n) => n.side === s && n.k === k && n.a1 + 2.5 > z0 && n.a0 - 2.5 < z1)) continue;
      const fa = s === 'W' ? 2 : W - 6, fb = s === 'W' ? 6 : W - 2;
      if (!o.free(fa, z0 - 0.5, fb, z1 + 0.5)) continue;
      o.mark(fa, z0 - 0.5, fb, z1 + 0.5, 2);
      const back = X(d), mm = (a, b) => (a < b ? [a, b] : [b, a]);
      const sol = (mk, u0, y0, a0, u1, y1, a1) => { const [p, q] = mm(X(u0), X(u1)); w.solid(mk, p, y0, a0, q, y1, a1, { uv: 3 }); };
      // the part of the niche beyond the wall's own thickness: floor, back wall, side walls and roof
      sol(fm, 0, y - 0.6, z0, d + ext, y, z1);
      sol('block', d, y - 0.6, z0 - ext, d + ext, y + hc + 1, z1 + ext);
      sol('block', WT, y - 0.6, z0 - ext, d + ext, y + hc + 1, z0); sol('block', WT, y - 0.6, z1, d + ext, y + hc + 1, z1 + ext);
      sol('block', WT, y + hc, z0 - ext, d + ext, y + hc + 1, z1 + ext);
      ctx.notches.push({ side: s, a0: z0, a1: z1, y0: y, y1: y + hc });
      ctx.nooks.push({ side: s, k, a0: z0, a1: z1, y0: y - 0.6, y1: y + hc, lo: -(d + ext), hi: W + d + ext });
      // the bars across the mouth, with a doorway
      const dw = 2, da = rng.int(z0 + 2, z1 - 2 - dw), db = da + dw, dh = 4; // whole metres: the nav cells in the doorway stay open
      for (let z = z0 + 0.12; z < z1 - 0.05; z += 0.2) {
        if (z > da - 0.05 && z < db + 0.05) { w.visual('iron', xf - 0.025, y + dh, z - 0.025, xf + 0.025, y + hc, z + 0.025, { uv: 1 }); continue; }
        w.visual('iron', xf - 0.025, y, z - 0.025, xf + 0.025, y + hc, z + 0.025, { uv: 1 });
      }
      for (const ry of [0.12, 1.3, 2.5, 3.6]) { w.visual('iron', xf - 0.04, y + ry, z0, xf + 0.04, y + ry + 0.06, da, { uv: 1 }); w.visual('iron', xf - 0.04, y + ry, db, xf + 0.04, y + ry + 0.06, z1, { uv: 1 }); }
      w.visual('iron', xf - 0.04, y + hc - 0.14, z0, xf + 0.04, y + hc - 0.06, z1, { uv: 1 });
      w.visual('iron', xf - 0.05, y + dh - 0.04, da - 0.06, xf + 0.05, y + dh + 0.04, db + 0.06, { uv: 1 });
      const bar = (a, y0, b, y1, block) => { const c = w.addCollider(xf - 0.06, y0, a, xf + 0.06, y1, b, { surf: 'metal', noGrapple: true }); c.bars = true; if (block) c.navBlock = true; return c; };
      bar(z0, y, da, y + hc, true); bar(db, y, z1, y + hc, true); bar(da, y + dh, db, y + hc, false);
      // every room keeps an iron gate in the doorway
      {
        const c = bar(da + 0.02, y, db - 0.02, y + dh, false); c.navIgnore = true; // monsters plan their way through it (and batter it down)
        const door = { axis: 'z', plane: xf, lo: da, hi: db, y, h: dh, hinge: rng.chance(0.5) ? 0 : 1, face: s === 'W' ? 1 : -1, col: c, hp: 100, state: 'closed' };
        const it = { type: 'celldoor', pos: V(xf, y + 1.2, (da + db) / 2), door };
        door.it = it; w.doors.push(door); w.interactables.push(it);
      }
      // inside: straw, shackles on the back wall, bones, crates and barrels, a table, cobwebs, torches, chests and graves
      const big = Math.max(1, Math.round(cw * d / 45)), items = [];
      const slot = () => ({ a: rng.range(z0 + 1.2, z1 - 1.2), u: rng.range(1.2, d - 1.1) });
      const clear = (q, r) => !items.some((p) => Math.hypot(p.a - q.a, p.u - q.u) < r) && (Math.abs(q.a - (da + db) / 2) > 3 || q.u > 3.6); // keep the way in from the doorway clear
      const place = (r, fn) => { for (let t2 = 0; t2 < 12; t2++) { const q = slot(); if (clear(q, r)) { items.push(q); fn(X(q.u), q.a, q); return true; } } return false; };
      for (let i = 0; i < Math.round(cw * d / 7); i++) { const u = rng.range(0.6, d - 1.2), a = rng.range(z0 + 0.3, z1 - 1.6); const [p, q] = mm(X(u), X(u + rng.range(0.6, 1.2))); w.visual('wood', p, y + 0.012, a, q, y + 0.032, a + rng.range(0.8, 1.8), { uv: 1, tint: [0.95, 0.82, 0.45], grad: false }); }
      for (let i = 0, n = rng.int(2, 3 + big); i < n; i++) P().chain(w, back - sg * 0.12, y + rng.range(0.6, 1.4), rng.range(z0 + 0.6, z1 - 0.6), rng.range(1.2, 2.4));
      for (let i = 0, n = rng.int(2, 3 + big); i < n; i++) P().bones(w, X(rng.range(0.8, d - 0.8)), y, rng.range(z0 + 0.6, z1 - 0.6), rng);
      for (let i = 0, n = rng.int(0, 3); i < n; i++) P().skull(w, X(rng.range(0.8, d - 0.8)), y, rng.range(z0 + 0.6, z1 - 0.6), rng.range(0, 6));
      for (let i = 0, n = rng.int(1, 2 + big); i < n; i++) place(2, (x, z) => { for (let j = 0, m = rng.int(1, 2); j < m; j++) P().crate(w, x + rng.range(-0.4, 0.4), z + rng.range(-0.4, 0.4), y, rng); });
      for (let i = 0, n = rng.int(0, 1 + big); i < n; i++) place(1.6, (x, z) => P().barrel(w, x, z, y, rng, false));
      if (rng.chance(0.5)) place(3, (x, z) => P().table(w, x, z, y, false, rng));
      for (const zz of [z0 + 0.3, z1 - 0.3]) P().web(w, back - sg * 0.2, y + hc - 0.2, zz, s === 'W' ? Math.PI / 2 : -Math.PI / 2, rng.range(0.9, 1.5));
      const nt = Math.max(2, Math.round(cw / 4));
      for (let i = 0; i < nt; i++) P().torch(w, back, y + 2.4, z0 + (i + 0.5) * cw / nt, s === 'W' ? 'px' : 'nx');
      // chests: most rooms hold one, many two
      const nch = rng.chance(0.85) ? 1 + (rng.chance(0.35) ? 1 : 0) + (rng.chance(0.12) ? 1 : 0) : 0;
      for (let i = 0; i < nch; i++) {
        const tier = rng.chance(0.1 + area * 0.004) ? 2 : rng.chance(0.35) ? 1 : 0;
        for (let t2 = 0; t2 < 14; t2++) { const q = { a: rng.range(z0 + 1, z1 - 1), u: d - 1.1 }; const x = X(q.u); if (LG.chestSpotFree(w, x, y, q.a) && clear(q, 2.4)) { items.push(q); P().chest(w, x, q.a, y, s === 'W' ? Math.PI / 2 : -Math.PI / 2, tier); break; } }
      }
      // spawn graves: the rooms are where they stand thickest
      const ng = ctx.ruined ? (rng.chance(0.75) ? rng.int(1, 3) : 0) : (rng.chance(0.55) ? (rng.chance(0.3) ? 2 : 1) : 0);
      for (let i = 0; i < ng; i++) place(2.4, (x, z) => G.Graves.add(w, x, y, z, rng.range(0, 6)));
      return true;
    }
    return false;
  }

  const bail = (why) => { if (G.dbgStrata) G.dbgStrata.push(why); return null; };
  function gen(area, seed, extraChests, gates, kind, ruined) {
    const rng = new G.RNG(seed);
    const size = 80 + (seed % 4) * 4;
    const W = size, D = size + rng.int(0, 3) * 4;
    const w = new G.World(W, D, ruined ? 'ruin' : 'halls');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    const nc0 = w.colliders.length;
    // ---- three tall storeys and the chasm between the west and the east half ----
    const NL = 3, SP = 9, Y = [0, SP, 2 * SP], HT = 2 * SP + 9;
    const Zn = NS, Zs = D - SS;
    const cxm = W / 2 + rng.range(-1, 1);
    // per storey, per metre of z: the west half ends at WL[k][z], the east half starts at ER[k][z].
    // Each edge is made of runs 3-11 m long, set back 0-3 m at random: the gap is always 14 m or more.
    const WL = [], ER = [];
    for (let k = 0; k < NL; k++) {
      const gap = 14 + rng.int(0, 3), base = Math.round(cxm + rng.range(-0.5, 0.5) - gap / 2), l = new Int16Array(D), r = new Int16Array(D);
      for (const [arr, sg] of [[l, -1], [r, 1]]) {
        let z = 0;
        while (z < D) { const L = rng.int(3, 11), j = rng.int(0, 3); for (let i = z; i < Math.min(D, z + L); i++) arr[i] = sg < 0 ? base - j : base + gap + j; z += L; }
      }
      WL.push(l); ER.push(r);
    }
    // the slabs shut out the light from above: a brighter fill and thinner haze than the open halls had
    w.envOverride = ruined ? { amb: 1.15, hemiS: '#8ea6e0', hemiG: '#2c3658', fog: '#101a2e', fogD: 0.009 } : { amb: 1.1, hemiS: '#a8968a', hemiG: '#4a3a2a', fog: '#1c1610', fogD: 0.01 };
    const T = { zN: Zn, zS: Zs, w: WL[0], e: ER[0], y: -1.0, blue: ruined };
    w.trench = T; w.strata = { Y, WL, ER, HT, Zn, Zs };
    w.navLayers = NL + 3; w.navPadX = 12;
    w.navHazard = (x, y, z) => y > HT - 1 || (z > Zn && z < Zs && y < -0.2 && x > cl(WL[0], z) && x < cl(ER[0], z));
    // ground: floors on both halves and the two end strips, the trench between (rock bed, a low ledge on every side to climb out by, lava)
    const pit = new Uint8Array(W * D);
    for (let z = Zn; z < Zs; z++) for (let x = WL[0][z]; x < ER[0][z]; x++) pit[z * W + x] = 1;
    const fm = rng.chance(0.5) ? 'floor' : 'cobble';
    H.floors(w, W, D, pit, fm);
    for (let zr = Zn; zr < Zs;) {
      let z1 = zr + 1; while (z1 < Zs && WL[0][z1] === WL[0][zr] && ER[0][z1] === ER[0][zr]) z1++;
      const wl = WL[0][zr], er = ER[0][zr];
      w.solid('rock', wl, -14, zr, er, T.y, z1, { uv: 5, grad: false });
      w.solid('block', wl, T.y, zr, wl + 0.8, -0.5, z1, { uv: 2 }); w.solid('block', er - 0.8, T.y, zr, er, -0.5, z1, { uv: 2 });
      if (zr === Zn) w.solid('block', wl, T.y, zr, er, -0.5, zr + 0.8, { uv: 2 });
      if (z1 === Zs) w.solid('block', wl, T.y, z1 - 0.8, er, -0.5, z1, { uv: 2 });
      G.Fields.add(w, 'lava', wl + 0.8, zr + (zr === Zn ? 0.8 : 0), er - 0.8, z1 - (z1 === Zs ? 0.8 : 0), { blue: ruined, y: T.y, noLight: true });
      zr = z1;
    }
    for (let z = Zn + 6; z < Zs - 2; z += 12) w.addLight((cl(WL[0], z) + cl(ER[0], z)) / 2, 0.4, z, { flame: 0, intensity: 16, range: 15, color: ruined ? '#3a8aff' : '#ff6a20', prio: 1.1, emit: false });
    for (let z = Zn - 1; z < Zs + 1; z++) occ.mark(cl(WL[0], z) - 1, z, cl(ER[0], z) + 1, z + 1, 2);
    // reserve the entrance, the exits and the mini shop
    occ.mark(W / 2 - 6, D - 10, W / 2 + 6, D, 2);
    for (const gx of LG.gateXs(W, gates || 1)) occ.mark(gx - 6, 0, gx + 6, 9, 2);
    occ.mark(W / 2 - 13, 8, W / 2 + 13, 16, 2);
    occ.mark(0, 0, W, 2, 2); occ.mark(0, D - 2, W, D, 2); occ.mark(0, 0, 2, D, 2); occ.mark(W - 2, 0, W, D, 2);
    F_ceiling(w, rng, W, D, HT, ruined);

    // per storey and half: what lies on it (occupancy), the holes cut in it, the railings around them
    const lv = { W: [], E: [] };
    for (const s of ['W', 'E']) for (let k = 0; k < NL; k++) {
      let o = occ;
      if (k > 0) {
        o = H.Occ(W, D);
        for (let z = 0; z < D; z++) { if (s === 'W') o.mark(WL[k][z], z, W, z + 1, 2); else o.mark(0, z, ER[k][z], z + 1, 2); }
        o.mark(0, 0, 2, D, 2); o.mark(W - 2, 0, W, D, 2); o.mark(0, 0, W, 2, 2); o.mark(0, D - 2, W, D, 2);
      }
      lv[s].push({ occ: o, holes: [], par: [] });
    }
    // the exit gate frames reach up past the first slab where a slab lies over them: open it above them
    for (const gx of LG.gateXs(W, gates || 1)) {
      const h = { x0: gx - 5, z0: 0, x1: gx + 5, z1: 3.2 };
      for (const s of ['W', 'E']) {
        const under = s === 'W' ? gx + 5 <= amin(WL[1], 0, 4) : gx - 5 >= amax(ER[1], 0, 4);
        if (under) { lv[s][1].holes.push(h); lv[s][1].par.push({ r: h, open: 'N' }); lv[s][1].occ.mark(h.x0 - 1, 0, h.x1 + 1, h.z1 + 1.5, 2); }
      }
    }

    // ---- climbing within a half: one walkable flight per storey (stone stairs or a bare wooden ramp), now and then a ladder or a second flight ----
    const wd = 2.6, len = LG.stairsLen(SP);
    const xband = (s, k) => (s === 'W' ? [4, Math.min(amin(WL[k], 0, D), amin(WL[k + 1], 0, D)) - 4] : [Math.max(amax(ER[k], 0, D), amax(ER[k + 1], 0, D)) + 4, W - 4]);
    const flight = (s, k, wood) => {
      const lo = lv[s][k], hi = lv[s][k + 1], [xa, xb] = xband(s, k);
      if (xb - xa < wd + 2.5) return false;
      for (let t = 0; t < 80; t++) {
        const dirS = rng.chance(0.5), c = rng.range(xa + wd / 2 + 1, xb - wd / 2 - 1);
        const e = dirS ? rng.int(5, D - 6 - Math.ceil(len)) : rng.int(6 + Math.ceil(len), D - 5);
        const za = dirS ? e : e - len, zb = dirS ? e + len : e;
        const exitA = dirS ? e - 3 : e, exitB = dirS ? e : e + 3;           // where you step off at the top
        const footA = dirS ? zb : za - 2.5, footB = dirS ? zb + 2.5 : za;
        const xr = [c - wd / 2 - 0.8, c + wd / 2 + 0.8];
        if (!lo.occ.free(xr[0], Math.min(za, footA), xr[1], Math.max(zb, footB))) continue;
        if (!hi.occ.free(xr[0] - 0.5, Math.min(za, exitA) - 0.5, xr[1] + 0.5, Math.max(zb, exitB) + 0.5)) continue;
        if (wood) FG.ramp(w, dirS ? 'S' : 'N', e, c, wd, Y[k], Y[k + 1]); else H.stairs(w, dirS ? 'S' : 'N', e, c, wd, Y[k], Y[k + 1], 'trim');
        lo.occ.mark(xr[0], Math.min(za, footA), xr[1], Math.max(zb, footB), 2);
        const hole = { x0: c - wd / 2 - 0.25, z0: za, x1: c + wd / 2 + 0.25, z1: zb };
        hi.holes.push(hole); hi.par.push({ r: hole, open: dirS ? 'N' : 'S' });
        hi.occ.mark(xr[0] - 0.5, Math.min(za, exitA) - 0.5, xr[1] + 0.5, Math.max(zb, exitB) + 0.5, 2);
        return true;
      }
      return false;
    };
    const ladder = (s, k) => {
      const lo = lv[s][k], hi = lv[s][k + 1], [xa, xb] = xband(s, k);
      if (xb - xa < 4) return false;
      for (let t = 0; t < 40; t++) {
        const x = rng.range(xa + 1.5, xb - 1.5), z = rng.int(6, D - 6) + 0.5;
        const dir = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
        if (!lo.occ.free(x - 1.6, z - 1.6, x + 1.6, z + 1.6)) continue;
        if (!hi.occ.free(x - 1.6 + Math.min(0, dir[0]) * 2, z - 1.6 + Math.min(0, dir[1]) * 2, x + 1.6 + Math.max(0, dir[0]) * 2, z + 1.6 + Math.max(0, dir[1]) * 2)) continue;
        lo.occ.mark(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 2);
        hi.occ.mark(x - 1.6 + Math.min(0, dir[0]) * 2, z - 1.6 + Math.min(0, dir[1]) * 2, x + 1.6 + Math.max(0, dir[0]) * 2, z + 1.6 + Math.max(0, dir[1]) * 2, 2);
        const hole = { x0: x - 0.7, z0: z - 0.7, x1: x + 0.7, z1: z + 0.7 };
        hi.holes.push(hole); hi.par.push({ r: hole, open: dir[0] > 0 ? 'E' : dir[0] < 0 ? 'W' : dir[1] > 0 ? 'S' : 'N' });
        // rails against the far side of the opening, rungs every 0.35 m
        const bx = x - dir[0] * 0.55, bz = z - dir[1] * 0.55, y0 = Y[k], y1 = Y[k + 1] + 1.1;
        for (const sd of [-0.32, 0.32]) {
          const rx = bx + (dir[0] ? 0 : sd), rz = bz + (dir[0] ? sd : 0);
          w.visual('wood', rx - 0.05, y0, rz - 0.05, rx + 0.05, y1, rz + 0.05, { uv: 1 });
        }
        for (let y = y0 + 0.3; y < y1 - 0.1; y += 0.35) w.visual('woodDark', bx - (dir[0] ? 0.04 : 0.32), y, bz - (dir[0] ? 0.32 : 0.04), bx + (dir[0] ? 0.04 : 0.32), y + 0.05, bz + (dir[0] ? 0.32 : 0.04), { uv: 1 });
        w.ladders.push({ x, z, y0, y1: Y[k + 1], dir });
        return true;
      }
      return false;
    };
    w.ladders = [];
    for (const s of ['W', 'E']) for (let k = 0; k < NL - 1; k++) {
      if (!flight(s, k, rng.chance(0.45)) && !flight(s, k, false)) return bail('flight ' + s + k);
      if (rng.chance(0.35)) { if (rng.chance(0.6)) ladder(s, k); else flight(s, k, rng.chance(0.5)); }
    }

    // ---- across the chasm (along x): bare plank bridges, at least one on every storey, often more; any of them may slant ----
    const spans = [[], [], []];          // z of every crossing per storey (planks and tightropes alike)
    const zRange = (k) => (k === 0 ? [Zn + 4, Zs - 4] : [6, D - 6]);
    const across = (k) => {
      const y = Y[k], bw = 2.6, [z0, z1] = zRange(k);
      for (let t = 0; t < 90; t++) {
        const zc = rng.range(z0, z1), dz = rng.chance(0.7) ? rng.range(-3.5, 3.5) : 0, zb = U.clamp(zc + dz, z0, z1);
        if (spans[k].some((s) => Math.abs(s - zc) < 6 || Math.abs(s - zb) < 6)) continue;
        const zlo = Math.min(zc, zb) - bw / 2 - 1, zhi = Math.max(zc, zb) + bw / 2 + 1;
        const xw = amin(WL[k], zlo, zhi), xe = amax(ER[k], zlo, zhi);
        const wo = lv.W[k].occ, eo = lv.E[k].occ, land = k === 0 ? 5 : 3.5;
        const gp = k === 0 ? 1.01 : 0.01; // the ground's own occupancy already holds a metre either side of the lava
        if (!wo.free(xw - land, zlo, xw - gp, zhi) || !eo.free(xe + gp, zlo, xe + land, zhi)) continue;
        wo.mark(xw - land, zlo, xw + 3, zhi, 2); eo.mark(xe - 3, zlo, xe + land, zhi, 2);
        spans[k].push(zc);
        plankBridge(w, rng, xw - 0.6, xe + 0.6, zc, zb, y, bw);
        w.addLight((xw + xe) / 2, y + 2.4, (zc + zb) / 2, { flame: 0, intensity: 9, range: 14, color: ruined ? '#6a9aff' : '#ffb070', emit: false, prio: 0.9, steady: true }); // a soft glow over the span
        return true;
      }
      return false;
    };
    for (let k = 0; k < NL; k++) {
      if (!across(k)) return bail('across ' + k);
      if (rng.chance(0.75)) across(k);
      if (rng.chance(0.4)) across(k);
    }
    // ---- tightropes: a thin chain across the gap (a separate thing from the bridges, and entirely at random) ----
    w.ropes = [];
    const rope = (k) => {
      const y = Y[k], [z0, z1] = zRange(k);
      for (let t = 0; t < 60; t++) {
        const zc = Math.floor(rng.range(z0, z1)) + 0.5;
        if (spans[k].some((s) => Math.abs(s - zc) < 4.5)) continue;
        const xw = amin(WL[k], zc - 1, zc + 1), xe = amax(ER[k], zc - 1, zc + 1);
        const wo = lv.W[k].occ, eo = lv.E[k].occ;
        const gp = k === 0 ? 1.01 : 0.01;
        if (!wo.free(xw - 3, zc - 1.2, xw - gp, zc + 1.2) || !eo.free(xe + gp, zc - 1.2, xe + 3, zc + 1.2)) continue;
        wo.mark(xw - 3, zc - 1.2, xw + 2, zc + 1.2, 2); eo.mark(xe - 2, zc - 1.2, xe + 3, zc + 1.2, 2);
        spans[k].push(zc);
        const xa = xw - 0.5, xb = xe + 0.5;
        const c = w.addCollider(xa, y - 0.1, zc - 0.25, xb, y, zc + 0.25, { surf: 'metal', noGrapple: true }); c.enemyOnly = true; // monsters walk it like a path; the player balances on the rope itself (strata runtime)
        w.ropes.push({ xa, xb, z: zc, y, seed: rng.int(1, 1e6) });
        w.addLight((xw + xe) / 2, y + 2.2, zc, { flame: 0, intensity: 7, range: 12, color: ruined ? '#6a9aff' : '#ffb070', emit: false, prio: 0.8, steady: true });
        return true;
      }
      return false;
    };
    for (let k = 0; k < NL; k++) { if (rng.chance(0.6)) rope(k); if (rng.chance(0.3)) rope(k); }
    // keep the chasm edges of the upper storeys clear of furniture and chests
    for (let k = 1; k < NL; k++) for (let z = 0; z < D; z++) { lv.W[k].occ.mark(WL[k][z] - 1.5, z, WL[k][z], z + 1, 1); lv.E[k].occ.mark(ER[k][z], z, ER[k][z] + 1.5, z + 1, 1); }

    // ---- barred prison rooms dug into the outer (west / east) walls: on most storeys of both sides, often two or three ----
    w.doors = [];
    const ctx = { notches: [], nooks: [], ruined };
    for (const s of ['W', 'E']) for (let k = 0; k < NL; k++) {
      if (rng.chance(0.85)) cell(w, rng, lv[s][k].occ, s, k, Y[k], W, D, area, fm, ctx);
      if (rng.chance(0.5)) cell(w, rng, lv[s][k].occ, s, k, Y[k], W, D, area, fm, ctx);
      if (rng.chance(0.2)) cell(w, rng, lv[s][k].occ, s, k, Y[k], W, D, area, fm, ctx);
    }
    w.nooks = ctx.nooks;
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0, notches: ctx.notches });

    // ---- the slabs (ragged along the chasm, cut around the holes), their railings, edge trim ----
    for (const s of ['W', 'E']) for (let k = 1; k < NL; k++) {
      const L = lv[s][k], y = Y[k];
      for (const rn of runs(s === 'W' ? WL[k] : ER[k])) {
        const r = s === 'W' ? { x0: 0, z0: rn.x0, x1: rn.e, z1: rn.x1 } : { x0: rn.e, z0: rn.x0, x1: W, z1: rn.x1 };
        for (const q of cut(r, L.holes)) {
          w.solid(fm, q.x0, y - 0.3, q.z0, q.x1, y, q.z1, { uv: 4, grad: false });
          w.solid('block', q.x0, y - 0.75, q.z0, q.x1, y - 0.3, q.z1, { uv: 3 });
        }
        w.visual('trim', rn.e - 0.12, y - 0.85, rn.x0, rn.e + 0.12, y - 0.6, rn.x1, { uv: 1 });
        // broken stones lying along the lip
        if (rng.chance(0.5)) { const z = rng.range(rn.x0 + 0.5, rn.x1 - 0.5), x = rn.e + (s === 'W' ? -0.45 : 0.45); box(w, 'block', x, y + 0.08, z, rng.range(0.25, 0.45), rng.range(0.12, 0.2), rng.range(0.3, 0.7), rng.range(0, 3), rng.range(-0.1, 0.1), rng.range(-0.1, 0.1)); }
      }
      for (const p of L.par) {
        const r = p.r, T0 = 0.35;
        const pr = { x0: r.x0 - (p.open === 'W' ? 0 : T0), z0: r.z0 - (p.open === 'N' ? 0 : T0), x1: r.x1 + (p.open === 'E' ? 0 : T0), z1: r.z1 + (p.open === 'S' ? 0 : T0) };
        H.parapet(w, pr.x0, pr.z0, pr.x1, pr.z1, y, [{ side: p.open, a: -1, b: 999 }]);
      }
      // the slab is held up by square piers along the chasm side (where there is something to stand on)
      const b = lv[s][k - 1];
      for (let z = 8 + rng.int(0, 4); z < D - 6; z += rng.int(10, 14)) {
        const ex = s === 'W' ? amin(WL[k], z - 1, z + 1) : amax(ER[k], z - 1, z + 1), x = s === 'W' ? ex - 1.4 : ex + 1.4;
        const below = s === 'W' ? amin(WL[k - 1], z - 1, z + 1) : amax(ER[k - 1], z - 1, z + 1);
        const stands = (k - 1 === 0 && (z < Zn - 1 || z > Zs + 1)) || (s === 'W' ? x + 1 < below : x - 1 > below);
        if (stands && b.occ.free(x - 1, z - 1, x + 1, z + 1) && L.holes.every((h) => x + 1 < h.x0 || x - 1 > h.x1 || z + 1 < h.z0 || z - 1 > h.z1)) {
          b.occ.mark(x - 1, z - 1, x + 1, z + 1, 2);
          if (ruined && rng.chance(0.25)) { P().pillarSquare(w, x, z, Y[k - 1], rng.range(2, 4), 1.1); P().rubble(w, x + 1.4, Y[k - 1], z, rng, 1.1); }
          else P().pillarSquare(w, x, z, Y[k - 1], SP - 0.75, 1.1);
        }
      }
    }
    // chains and vines hanging down the chasm walls
    for (let i = 0; i < 12; i++) {
      const k = rng.int(1, NL - 1), s = rng.chance(0.5) ? 'W' : 'E', z = rng.int(4, D - 4) + 0.5, ex = (s === 'W' ? WL : ER)[k][Math.floor(z)];
      if (ruined) P().vines(w, ex + (s === 'W' ? -0.2 : 0.2), Y[k] - 0.8, z, s === 'W' ? 'px' : 'nx', rng.range(2, 5), rng); else P().chain(w, ex + (s === 'W' ? -0.2 : 0.2), Y[k] - 0.8 - 3, z, 3);
    }

    // ---- light and furnishing on every storey ----
    const nR = (s, k, z) => ctx.nooks.some((n) => n.side === s && n.k === k && z > n.a0 - 1 && z < n.a1 + 1);
    for (const s of ['W', 'E']) for (let k = 0; k < NL; k++) {
      const y = Y[k], L = lv[s][k];
      const r = s === 'W' ? { x0: 0, z0: 0, x1: amin(WL[k], 0, D), z1: D } : { x0: amax(ER[k], 0, D), z0: 0, x1: W, z1: D };
      for (let z = 7; z < D - 3; z += 13) if (!nR(s, k, z)) P().torch(w, s === 'W' ? 0 : W, y + 3.2, z, s === 'W' ? 'px' : 'nx');
      dress(w, rng, L.occ, y, k, r, ruined);
    }

    // ---- chests anywhere, on any storey ----
    const nChest = (kind === 'vault' ? 6 : (area <= 4 ? 2 : rng.chance(0.75) ? 1 : 0) + (rng.chance(0.25) ? 1 : 0)) + (extraChests || 0);
    for (let i = 0; i < nChest; i++) {
      const tier = rng.chance(0.08 + area * 0.004) ? 2 : rng.chance(0.3) ? 1 : 0;
      for (let t = 0; t < 12; t++) {
        const s = rng.chance(0.5) ? 'W' : 'E', k = rng.int(0, NL - 1), o = lv[s][k].occ;
        const r = o.place(rng, 2, 2, 1); if (!r) continue;
        const x = r.x0 + 1, z = r.z0 + 1;
        if (LG.chestSpotFree(w, x, Y[k], z)) { P().chest(w, x, z, Y[k], rng.range(0, 6), tier); break; }
      }
    }
    // spawn graves outside the rooms too: some on the third field, a few more on the fourth
    for (let i = 0, n = ruined ? rng.int(2, 3) : rng.int(1, 2); i < n; i++) {
      for (let t = 0; t < 12; t++) {
        const s = rng.chance(0.5) ? 'W' : 'E', k = rng.int(0, NL - 1), r = lv[s][k].occ.place(rng, 2, 2, 1.2); if (!r) continue;
        G.Graves.add(w, r.x0 + 1, Y[k], r.z0 + 1, rng.range(0, 6)); break;
      }
    }
    if (G.Fields) G.Fields.place(w, rng, occ, W, D, area);
    // nothing built here becomes a fire perch (the storeys themselves are walkways)
    for (let i = nc0; i < w.colliders.length; i++) w.colliders[i].noFire = true;
    w.miniSlots = [-6, -2, 2].map((dx) => ({ x: W / 2 + dx, y: 1.15, z: 12, face: 1 })); w.miniHeal = V(W / 2 + 6, 0, 12);
    w.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    return w;
  }
  function F_ceiling(w, rng, W, D, HT, ruined) {
    FG.ceiling(w, rng, 0, 0, W, D, HT, { chandeliers: 0, ruined });
    if (ruined) for (let i = 0; i < 7; i++) { const x = rng.range(8, W - 14), z = rng.range(10, D - 16); w.visual('dark', x, HT - 0.04, z, x + rng.range(3, 6), HT - 0.02, z + rng.range(3, 6), { uv: 1, grad: false }); }
  }
  // furnishing for one storey of one half (y: its floor; r: the part of it clear of the ragged chasm edge)
  function dress(w, rng, o, y, k, r, ruined) {
    const area = (r.x1 - r.x0) * (r.z1 - r.z0), n = Math.round(area / 110);
    for (let i = 0; i < n; i++) {
      const t = rng.next();
      if (t < 0.2) { const q = o.place(rng, 3, 3, 1); if (!q) continue; for (let j = 0; j < rng.int(1, 3); j++) P().crate(w, q.x0 + 0.8 + rng.range(0, 1.4), q.z0 + 0.8 + rng.range(0, 1.4), y, rng); if (rng.chance(0.4)) P().barrel(w, q.x0 + 2.5, q.z0 + 0.6, y, rng, rng.chance(0.25)); }
      else if (t < 0.32) { const q = o.place(rng, 2, 2, 1); if (!q) continue; P().barrel(w, q.x0 + 0.7, q.z0 + 0.7, y, rng, rng.chance(0.35)); }
      else if (t < 0.44) { const q = o.place(rng, 2, 2, 1); if (!q) continue; for (let j = 0; j < rng.int(1, 3); j++) P().urn(w, q.x0 + 0.5 + rng.range(0, 1), q.z0 + 0.5 + rng.range(0, 1), y, rng); }
      else if (t < 0.56) { const q = o.place(rng, 2, 2, 1.5); if (!q) continue; P().brazier(w, q.x0 + 1, y, q.z0 + 1, 1); }
      else if (t < 0.68) { const q = o.place(rng, 2, 2, 0.5); if (!q) continue; P().rubble(w, q.x0 + 1, y, q.z0 + 1, rng, rng.range(0.8, 1.6)); }
      else if (t < 0.8) {
        if (ruined) { const q = o.place(rng, 6, 2, 1); if (!q) continue; w.solid('block', q.x0, y, q.z0 + 0.55, q.x1, y + 0.9, q.z1 - 0.55, { uv: 2 }); P().rubble(w, q.x1 + 0.2, y, q.z0 + 1, rng, 1); }
        else { const q = o.place(rng, 3, 2, 1); if (!q) continue; P().bookshelf(w, q.x0 + 1.5, q.z0 + 1, y, true, rng); }
      } else if (t < 0.9) {
        if (ruined) { const q = o.place(rng, 2, 2, 1); if (!q) continue; P().pillarRound(w, q.x0 + 1, q.z0 + 1, y, rng.range(1.5, 3.5), rng.range(0.45, 0.6), true, rng); }
        else { const q = o.place(rng, 3, 3, 1.2); if (!q) continue; P().cage(w, q.x0 + 1.5, q.z0 + 1.5, y, 1, rng); }
      } else { const q = o.place(rng, 3, 2, 1); if (!q) continue; P().table(w, q.x0 + 1.5, q.z0 + 1, y, true, rng); }
    }
    for (let i = 0; i < n * 0.6; i++) { const x = rng.range(r.x0 + 3, r.x1 - 3), z = rng.range(r.z0 + 3, r.z1 - 3); if (o.free(x - 0.5, z - 0.5, x + 0.5, z + 0.5)) (rng.chance(0.5) ? P().bones(w, x, y, z, rng) : P().skull(w, x, y, z, rng.range(0, 6))); }
    if (ruined) {
      // blue fire welling up through the cracked floors, moss, a few cold lights
      for (let i = 0; i < (k ? 1 : 2); i++) { const q = o.place(rng, rng.int(3, 6), rng.int(3, 6), 1.2, 30); if (q) G.Fields.add(w, 'lava', q.x0, q.z0, q.x1, q.z1, { blue: true, y: y + 0.005 }); }
      for (let i = 0; i < n * 2; i++) { const x = rng.range(r.x0 + 1, r.x1 - 2), z = rng.range(r.z0 + 1, r.z1 - 2); w.visual('floor', x, y + 0.02, z, x + rng.range(0.5, 2), y + 0.05, z + rng.range(0.5, 2), { uv: 1, tint: [rng.range(0.08, 0.16), rng.range(0.22, 0.34), rng.range(0.4, 0.6)], grad: false }); }
      if (rng.chance(0.7)) { const q = o.place(rng, 2, 2, 1, 20); if (q) { w.addLight(q.x0 + 1, y + 1.2, q.z0 + 1, { flame: 0.5, intensity: 7, range: 11, color: '#4a8aff', prio: 0.8 }); P().candles(w, q.x0 + 1, y, q.z0 + 1, rng, false); } }
    }
  }
  S.gen = gen;

  // ---------------------------------------------------------------- runtime
  S.build = function (w) {
    S.ropes = []; S.ladders = (w && w.ladders) || []; S.doors = (w && w.doors) || []; S.onRope = false;
    if (!w) return;
    const boxG = new THREE.BoxGeometry(1, 1, 1);
    // tightropes: a thin chain, drawn as one instanced strip of links
    for (const r of w.ropes || []) {
      const L = r.xb - r.xa, n = Math.max(24, Math.round(L / 0.115));   // links overlap: a ring every 11 cm
      const im = new THREE.InstancedMesh(linkGeo(), ropeMat(), n); im.frustumCulled = false; im.castShadow = true;
      w.group.add(im);
      S.ropes.push({ r, L, n, im, bob: 0, bobV: 0, load: 0, tp: 0.5, on: false });
    }
    // cell gates: bars hung on a hinge; their material tints towards rust as they are battered
    for (const d of S.doors) {
      const g = new THREE.Group(), mat = w.mats.iron.clone(), wd = d.hi - d.lo;
      g.rotation.order = 'YXZ'; d.sg = d.hinge ? -1 : 1; d.hz = d.hinge ? d.hi : d.lo;
      g.position.set(d.plane, d.y, d.hz);
      const bars = [];
      for (let x = 0.1; x < wd - 0.05; x += 0.19) { const m = new THREE.Mesh(boxG, mat); m.scale.set(0.05, d.h - 0.06, 0.05); m.position.set(d.sg * x, d.h / 2, 0); m.castShadow = true; g.add(m); bars.push({ m, x: d.sg * x, bend: (Math.random() - 0.5) * 2 }); }
      for (const yy of [0.12, 1.1, d.h - 0.1]) { const m = new THREE.Mesh(boxG, mat); m.scale.set(wd - 0.06, 0.07, 0.07); m.position.set(d.sg * wd / 2, yy, 0); g.add(m); }
      const lock = new THREE.Mesh(boxG, mat); lock.scale.set(0.16, 0.22, 0.12); lock.position.set(d.sg * (wd - 0.12), 1.1, 0); g.add(lock);
      w.group.add(g);
      Object.assign(d, { g, mat, bars, base: mat.color.clone(), ang: 0, fall: 0, shake: 0 });
      S.paintDoor(d);
    }
    S.update(0);
  };
  // dark silver links: rings threaded through one another (every other one turned a quarter), not a thread
  let _rm = null, _lg = null;
  const ropeMat = () => _rm || (_rm = new THREE.MeshStandardMaterial({ color: 0x80878f, emissive: 0x14171b, roughness: 0.42, metalness: 0.85 }));
  const linkGeo = () => _lg || (_lg = new THREE.TorusGeometry(0.5, 0.17, 6, 12));
  const tri = (t, p) => (t < p ? t / Math.max(p, 1e-3) : (1 - t) / Math.max(1 - p, 1e-3));
  // height drop (+) of the rope at t (0..1 along it): a slight sag of its own, deeper under your weight
  function shape(b, t) {
    const s = Math.sin(Math.PI * t);
    return { dy: 0.12 * s + b.load * 0.5 * Math.sin(Math.PI * b.tp) * tri(t, b.tp) + b.bob * s, dz: 0 };
  }
  const _o = new THREE.Object3D();
  S.update = function (dt) {
    const Pp = G.player && G.player.pos;
    for (const b of S.ropes) {
      const r = b.r;
      // vertical bob after a landing (no sideways sway)
      b.bobV += (-40 * b.bob - 3 * b.bobV) * dt; b.bob += b.bobV * dt;
      b.load = U.damp(b.load, b.on ? 1 : 0, 6, dt);
      if (Pp && dt && Math.abs(Pp.x - (r.xa + r.xb) / 2) > 70 && Math.abs(Pp.z - r.z) > 70) continue;
      for (let i = 0; i < b.n; i++) {
        const t = (i + 0.5) / b.n, sh = shape(b, t), t2 = Math.min(1, t + 0.5 / b.n), sh2 = shape(b, t2);
        _o.position.set(r.xa + t * b.L, r.y - sh.dy - 0.05, r.z);
        _o.rotation.set(i % 2 ? Math.PI / 2 : 0, 0, -Math.atan2(sh2.dy - sh.dy, (t2 - t) * b.L));
        _o.scale.set(0.2, 0.13, 0.13); _o.updateMatrix(); b.im.setMatrixAt(i, _o.matrix);
      }
      b.im.instanceMatrix.needsUpdate = true;
    }
    // cell gates: swinging open, falling flat when broken, rattling while battered
    for (const d of S.doors) {
      if (!d.g) continue;
      if (d.state === 'open' && d.ang < 1.75) d.ang = Math.min(1.75, d.ang + dt * 2.6);
      if (d.state === 'broken' && d.fall < 1) d.fall = Math.min(1, d.fall + dt * 3.2);
      d.shake = Math.max(0, d.shake - dt * 4);
      d.g.rotation.set(-d.face * d.fall * 1.45, -Math.PI / 2 + d.face * d.sg * d.ang, 0);
      d.g.position.x = d.plane + d.face * d.fall * 0.15;
      d.g.position.z = d.hz + (d.shake ? (Math.random() - 0.5) * 0.04 * d.shake : 0);
    }
  };
  // ---- tightropes: player.js physics stands you on one (sets grounded). It takes balance: the chain is as thin as a hand and it
  // pushes you off centre (an inverted pendulum): steer with the side keys or fall. Monsters cross it on a hidden strip, no fuss. ----
  S.support = function (Pl, dt, preVy) {
    let on = null;
    const T = G.game.time;
    for (const b of S.ropes) {
      const r = b.r;
      if (Pl.pos.x <= r.xa || Pl.pos.x >= r.xb || Pl.vel.y > 0.5) { b.on = false; continue; }
      const t = (Pl.pos.x - r.xa) / b.L;
      if (b.on || b.load < 0.05) b.tp = t;
      const sh = shape(b, t), h = r.y - sh.dy, dz = Pl.pos.z - (r.z + sh.dz);
      if (Math.abs(dz) > (b.on ? 0.26 : 0.34) || Pl.pos.y > h + 0.15 || Pl.pos.y < h - 0.7) { b.on = false; continue; }
      if (!b.on) { // landing: the rope dips and starts to swing
        const f = Math.min(12, Math.max(0, -(preVy || 0)));
        b.bobV += f * 0.1;
        G.sfx.chain(0.25, 0.2 + f * 0.03);
      }
      // it carries you only on its centre line and nudges you away from it (an inverted pendulum): steer with the side keys
      Pl.pos.z += dz * 2.6 * dt;
      Pl.pos.y = h; if (Pl.vel.y < 0) Pl.vel.y = 0; Pl.grounded = true;
      b.on = true; on = b;
    }
    S.onRope = !!on;
    return !!on;
  };
  // ---- ladders: player.js climbs while you hold forward or jump inside the opening ----
  S.ladder = function (Pl, wantUp, dt) {
    for (const l of S.ladders) {
      if (Math.abs(Pl.pos.x - l.x) > 0.75 || Math.abs(Pl.pos.z - l.z) > 0.75 || Pl.pos.y < l.y0 - 0.2 || Pl.pos.y > l.y1 + 0.3) continue;
      if (!wantUp) return false;
      if (Pl.pos.y > l.y1 - 0.25) { Pl.vel.x = l.dir[0] * 4.5; Pl.vel.z = l.dir[1] * 4.5; Pl.vel.y = 3.2; return true; }
      Pl.vel.y = 4.6; Pl.vel.x = (l.x - Pl.pos.x) * 6; Pl.vel.z = (l.z - Pl.pos.z) * 6;
      Pl.grounded = false; Pl.jumps = 0; Pl.coyote = 0;
      Pl._ladT = (Pl._ladT || 0) - dt; if (Pl._ladT <= 0) { Pl._ladT = 0.42; G.sfx.step('wood', 0.5); }
      return true;
    }
    return false;
  };
  // ---- cell gates ----
  // battered look: rust creeping in, bars bowing (more and more as the gate gives)
  S.paintDoor = function (d) {
    const k = 1 - d.hp / 100;
    d.mat.color.copy(d.base).lerp(new THREE.Color(0x6a3a20), Math.min(1, k * 1.1));
    for (const b of d.bars) { b.m.rotation.z = b.bend * k * k * 0.45; b.m.rotation.x = b.bend * k * 0.18; b.m.position.x = b.x + b.bend * k * 0.06; }
  };
  const doorPos = (d) => V(d.plane, d.y + 1.1, (d.lo + d.hi) / 2);
  function free(d, state) {
    d.state = state; d.col.alive = false; d.it.opened = true;
    if (G.game.search && G.game.search.it === d.it) G.game.cancelSearch();
  }
  S.openDoor = function (d) {
    if (d.state !== 'closed') return;
    free(d, 'open');
    G.sfx.chestUnlock(doorPos(d)); G.sfx.chain(0.35, 0.3);
  };
  S.breakDoor = function (d) {
    if (d.state !== 'closed') return;
    d.hp = 0; S.paintDoor(d); free(d, 'broken');
    const p = doorPos(d);
    G.sfx.shieldBreak(p); G.sfx.impact(p, 'metal');
    G.fx.debris(p, G.world.mats.iron, 10, 0.08, 6); G.fx.dust(p.clone().setY(d.y + 0.1), V(0, 1, 0), 0x7a6a50, 10);
  };
  // enemies.js: a monster pressed against a shut gate on its way batters it; the stronger it is, the sooner the gate gives
  S.bash = function (e, dt) {
    for (const d of S.doors) {
      if (d.state !== 'closed' || Math.abs(e.pos.y - d.y) > 1.2) continue;
      if (e.pos.z < d.lo - 1.3 || e.pos.z > d.hi + 1.3 || Math.abs(e.pos.x - d.plane) > e.radius + 0.6) continue; // pressed against the gate or the bars beside it
      e.yaw = Math.atan2(d.plane - e.pos.x, 0); e.bashAt = G.game.time;
      e.bashT = (e.bashT || 0) - dt;
      if (e.bashT > 0) return true;
      e.bashT = 0.8; e.atk = 1;
      d.hp -= (9 + (e.level || 1) * 1.1) * (e.big ? 1.6 : 1) * (e.elite ? 1.3 : 1);
      d.shake = 1;
      const p = V(d.plane, d.y + 1 + Math.random() * 0.6, U.clamp(e.pos.z, d.lo, d.hi));
      if (d.hp <= 0) S.breakDoor(d);
      else { S.paintDoor(d); G.sfx.hitShield(p); G.fx.debris(p, G.world.mats.iron, 3, 0.05, 3); }
      return true;
    }
    return false;
  };
})();
