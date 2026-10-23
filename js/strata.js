'use strict';
// Fields 3 and 4 (halls / ruin): the whole area is split in two by a deep chasm running across it. Each half is a stack of
// 3 or 4 storeys (the ground plus slabs above), joined within a half by stairs, wooden ramps and the odd ladder.
// Across the chasm: at least one plank bridge (walkers use it), sometimes more, and swaying chain bridges (player only).
// At the bottom of the chasm runs a trench of lava (blue in the ruin): nothing spawns there, monsters will not walk in,
// and one knocked in is thrown back out (enemies.js). The player burns and can climb out by the low ledges.
// The runtime half (chain bridges, ladders) is driven from player.js.
(function () {
  const LG = G.LevelGen, H = LG._, FG = G.FieldGen, U = G.U;
  const P = () => G.Props;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const S = (G.Strata = { chains: [], ladders: [] });

  // a rectangle minus holes, as a list of rectangles (x strips)
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
  function gen(area, seed, extraChests, gates, kind, ruined) {
    const rng = new G.RNG(seed);
    const size = Math.min(88, 72 + (seed % 4) * 4);
    const W = size, D = size + rng.int(0, 3) * 4;
    const w = new G.World(W, D, ruined ? 'ruin' : 'halls');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    const occ = H.Occ(W, D);
    const nc0 = w.colliders.length;
    // ---- storeys and the chasm ----
    const NL = rng.chance(0.5) ? 3 : 4, SP = NL === 4 ? 6.8 : 7.4, Y = [];
    for (let k = 0; k < NL; k++) Y.push(k * SP);
    const HT = Y[NL - 1] + 8;
    const cz = D / 2 + rng.range(-2, 2);
    const eN = [], eS = []; // per storey: the north half ends at eN, the south half starts at eS
    for (let k = 0; k < NL; k++) {
      const g = rng.range(12, 15), c = cz + rng.range(-1.5, 1.5);
      eN.push(Math.round(c - g / 2)); eS.push(Math.round(c + g / 2));
    }
    const T = { z0: eN[0], z1: eS[0], y: -1.0, blue: ruined };
    w.trench = T; w.strata = { Y, eN, eS, HT };
    w.navLayers = NL + 3;
    w.navHazard = (x, y, z) => (z > T.z0 && z < T.z1 && y < -0.2) || y > HT - 1;
    // ground: floors on both halves, the trench between them (rock bed, a low ledge on each side to climb out by, lava)
    const pit = new Uint8Array(W * D);
    for (let z = T.z0; z < T.z1; z++) for (let x = 0; x < W; x++) pit[z * W + x] = 1;
    const fm = rng.chance(0.5) ? 'floor' : 'cobble';
    H.floors(w, W, D, pit, fm);
    w.solid('rock', 0, -14, T.z0, W, T.y, T.z1, { uv: 5, grad: false });
    w.solid('block', 0, T.y, T.z0, W, -0.5, T.z0 + 0.8, { uv: 2 });
    w.solid('block', 0, T.y, T.z1 - 0.8, W, -0.5, T.z1, { uv: 2 });
    G.Fields.add(w, 'lava', 0, T.z0 + 0.8, W, T.z1 - 0.8, { blue: ruined, y: T.y, noLight: true });
    for (let x = 6; x < W - 3; x += 12) w.addLight(x, 0.4, (T.z0 + T.z1) / 2, { flame: 0, intensity: 16, range: 15, color: ruined ? '#3a8aff' : '#ff6a20', prio: 1.1, emit: false });
    occ.mark(0, T.z0 - 1, W, T.z1 + 1, 2);
    // reserve the entrance, the exits and the mini shop
    occ.mark(W / 2 - 6, D - 10, W / 2 + 6, D, 2);
    for (const gx of LG.gateXs(W, gates || 1)) occ.mark(gx - 6, 0, gx + 6, 9, 2);
    occ.mark(W / 2 - 13, 8, W / 2 + 13, 16, 2);
    occ.mark(0, 0, W, 2, 2); occ.mark(0, D - 2, W, D, 2); occ.mark(0, 0, 2, D, 2); occ.mark(W - 2, 0, W, D, 2);
    H.perimeter(w, rng, W, D, { gates, h: HT, top: HT, beams: 0 });
    F_ceiling(w, rng, W, D, HT, ruined);

    // per storey and half: what lies on it (occupancy), its surface rectangle and the holes cut in it
    const half = (s, k) => (s === 'N' ? { x0: 0, z0: 0, x1: W, z1: eN[k] } : { x0: 0, z0: eS[k], x1: W, z1: D });
    const lv = { N: [], S: [] };
    for (const s of ['N', 'S']) for (let k = 0; k < NL; k++) {
      let o = occ;
      if (k > 0) {
        o = H.Occ(W, D);
        const r = half(s, k);
        o.mark(0, 0, W, r.z0, 2); o.mark(0, r.z1, W, D, 2);
        o.mark(0, 0, 2, D, 2); o.mark(W - 2, 0, W, D, 2); o.mark(0, 0, W, 2, 2); o.mark(0, D - 2, W, D, 2);
      }
      lv[s].push({ occ: o, holes: [], par: [] });
    }
    // the gate frames reach up past the first slab: open it above them (and above the entrance)
    if (NL > 1) {
      for (const gx of LG.gateXs(W, gates || 1)) { const h = { x0: gx - 5, z0: 0, x1: gx + 5, z1: 3.2 }; lv.N[1].holes.push(h); lv.N[1].par.push({ r: h, open: 'N' }); lv.N[1].occ.mark(h.x0 - 1, 0, h.x1 + 1, h.z1 + 1.5, 2); }
      const h = { x0: W / 2 - 5, z0: D - 3.2, x1: W / 2 + 5, z1: D }; lv.S[1].holes.push(h); lv.S[1].par.push({ r: h, open: 'S' }); lv.S[1].occ.mark(h.x0 - 1, h.z0 - 1.5, h.x1 + 1, D, 2);
    }

    // ---- climbing within a half: one walkable flight per storey (stone stairs or a wooden ramp), now and then a ladder or a second flight ----
    const wd = 2.6, len = LG.stairsLen(SP);
    const flight = (s, k, wood) => {
      const lo = lv[s][k], hi = lv[s][k + 1];
      const za = s === 'N' ? 4 : Math.max(eS[k], eS[k + 1]) + 4, zb = s === 'N' ? Math.min(eN[k], eN[k + 1]) - 4 : D - 4;
      for (let t = 0; t < 60; t++) {
        const dirE = rng.chance(0.5), c = Math.round(rng.range(za, zb)) + 0.5;
        const e = dirE ? rng.int(5, W - 6 - Math.ceil(len)) : rng.int(6 + Math.ceil(len), W - 5);
        const xa = dirE ? e : e - len, xb = dirE ? e + len : e;
        const exitA = dirE ? e - 3 : e, exitB = dirE ? e : e + 3; // where you step off at the top
        const footA = dirE ? xb : xa - 2.5, footB = dirE ? xb + 2.5 : xa;
        const zr = [c - wd / 2 - 0.8, c + wd / 2 + 0.8];
        if (!lo.occ.free(Math.min(xa, footA), zr[0], Math.max(xb, footB), zr[1])) continue;
        if (!hi.occ.free(Math.min(xa, exitA) - 0.5, zr[0] - 0.5, Math.max(xb, exitB) + 0.5, zr[1] + 0.5)) continue;
        if (wood) FG.ramp(w, dirE ? 'E' : 'W', e, c, wd, Y[k], Y[k + 1]); else H.stairs(w, dirE ? 'E' : 'W', e, c, wd, Y[k], Y[k + 1], 'trim');
        lo.occ.mark(Math.min(xa, footA), zr[0], Math.max(xb, footB), zr[1], 2);
        const hole = { x0: xa, z0: c - wd / 2 - 0.25, x1: xb, z1: c + wd / 2 + 0.25 };
        hi.holes.push(hole); hi.par.push({ r: hole, open: dirE ? 'W' : 'E' });
        hi.occ.mark(Math.min(xa, exitA) - 0.5, zr[0] - 0.5, Math.max(xb, exitB) + 0.5, zr[1] + 0.5, 2);
        return true;
      }
      return false;
    };
    const ladder = (s, k) => {
      const lo = lv[s][k], hi = lv[s][k + 1];
      const za = s === 'N' ? 4 : Math.max(eS[k], eS[k + 1]) + 4, zb = s === 'N' ? Math.min(eN[k], eN[k + 1]) - 4 : D - 4;
      for (let t = 0; t < 40; t++) {
        const x = rng.int(5, W - 5) + 0.5, z = Math.round(rng.range(za, zb)) + 0.5;
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
    for (const s of ['N', 'S']) for (let k = 0; k < NL - 1; k++) {
      if (!flight(s, k, rng.chance(0.45)) && !flight(s, k, false)) return null;
      if (rng.chance(0.3)) { if (rng.chance(0.6)) ladder(s, k); else flight(s, k, rng.chance(0.5)); }
    }

    // ---- across the chasm: a plank bridge for certain, sometimes more planks or a chain bridge ----
    w.chains = [];
    const bridgeXs = [];
    const across = (k, chain) => {
      const y = Y[k], z0 = eN[k], z1 = eS[k], bw = chain ? 2 : 3;
      for (let t = 0; t < 40; t++) {
        const bx = rng.int(6, W - 6 - bw);
        if (bridgeXs.some((x) => Math.abs(x - bx) < 7)) continue;
        const nO = lv.N[k].occ, sO = lv.S[k].occ;
        if (k > 0 && (!nO.free(bx - 1, z0 - 3.5, bx + bw + 1, z0 - 0.01) || !sO.free(bx - 1, z1 + 0.01, bx + bw + 1, z1 + 3.5))) continue;
        if (k === 0 && (!occ.free(bx - 1, z0 - 4.5, bx + bw + 1, z0 - 1.01) || !occ.free(bx - 1, z1 + 1.01, bx + bw + 1, z1 + 4.5))) continue;
        nO.mark(bx - 1, z0 - 3.5, bx + bw + 1, z0, 2); sO.mark(bx - 1, z1, bx + bw + 1, z1 + 3.5, 2);
        bridgeXs.push(bx);
        if (!chain) FG.bridge(w, bx, z0, bx + bw, z1, y, false);
        else {
          const x = bx + bw / 2;
          for (const zz of [z0, z1]) for (const sx of [-0.95, 0.95]) w.solid('iron', x + sx - 0.07, y, zz - 0.07 + (zz === z0 ? -0.15 : 0.15), x + sx + 0.07, y + 1.25, zz + 0.07 + (zz === z0 ? -0.15 : 0.15), { uv: 1, noGrapple: true });
          w.chains.push({ x, z0, z1, y, hw: 0.8 });
        }
        return true;
      }
      return false;
    };
    const kMain = rng.int(0, NL - 1);
    if (!across(kMain, false) && !across(0, false)) return null;
    const extra = rng.chance(0.55) ? rng.int(1, 2) : 0;
    for (let i = 0; i < extra; i++) { const chain = rng.chance(0.5); across(chain ? rng.int(1, NL - 1) : rng.int(0, NL - 1), chain); } // chains sag: never right over the lava
    // keep the chasm edges of the upper storeys clear of furniture and chests
    for (let k = 1; k < NL; k++) { lv.N[k].occ.mark(0, eN[k] - 1.5, W, eN[k], 1); lv.S[k].occ.mark(0, eS[k], W, eS[k] + 1.5, 1); }

    // ---- the slabs (cut around the holes), their railings, chasm-side trim ----
    for (const s of ['N', 'S']) for (let k = 1; k < NL; k++) {
      const L = lv[s][k], y = Y[k];
      for (const r of cut(half(s, k), L.holes)) {
        w.solid(fm, r.x0, y - 0.3, r.z0, r.x1, y, r.z1, { uv: 4, grad: false });
        w.solid('block', r.x0, y - 0.75, r.z0, r.x1, y - 0.3, r.z1, { uv: 3 });
      }
      const ez = s === 'N' ? eN[k] : eS[k];
      w.visual('trim', 0, y - 0.85, ez - 0.12, W, y - 0.6, ez + 0.12, { uv: 1 });
      for (const p of L.par) {
        const r = p.r, T0 = 0.35;
        const pr = { x0: r.x0 - (p.open === 'W' ? 0 : T0), z0: r.z0 - (p.open === 'N' ? 0 : T0), x1: r.x1 + (p.open === 'E' ? 0 : T0), z1: r.z1 + (p.open === 'S' ? 0 : T0) };
        H.parapet(w, pr.x0, pr.z0, pr.x1, pr.z1, y, [{ side: p.open, a: -1, b: 999 }]);
      }
      // the slab is held up by square piers along the chasm side
      for (let x = 8 + rng.int(0, 4); x < W - 6; x += rng.int(10, 14)) {
        const pz = s === 'N' ? eN[k] - 1.4 : eS[k] + 1.4, b = lv[s][k - 1];
        if (b.occ.free(x - 1, pz - 1, x + 1, pz + 1) && L.holes.every((h) => x + 1 < h.x0 || x - 1 > h.x1 || pz + 1 < h.z0 || pz - 1 > h.z1)) {
          b.occ.mark(x - 1, pz - 1, x + 1, pz + 1, 2);
          if (ruined && rng.chance(0.25)) { P().pillarSquare(w, x, pz, Y[k - 1], rng.range(2, 4), 1.1); P().rubble(w, x + 1.4, Y[k - 1], pz, rng, 1.1); }
          else P().pillarSquare(w, x, pz, Y[k - 1], SP - 0.75, 1.1);
        }
      }
    }
    // chains and vines hanging down the chasm walls
    for (let i = 0; i < 10; i++) {
      const k = rng.int(1, NL - 1), s = rng.chance(0.5) ? 'N' : 'S', x = rng.range(4, W - 4), ez = s === 'N' ? eN[k] + 0.2 : eS[k] - 0.2;
      if (ruined) P().vines(w, x, Y[k] - 0.8, ez, s === 'N' ? 'pz' : 'nz', rng.range(2, 5), rng); else P().chain(w, x, Y[k] - 0.8 - 3, ez, 3);
    }

    // ---- light and furnishing on every storey ----
    for (const s of ['N', 'S']) for (let k = 0; k < NL; k++) {
      const y = Y[k], L = lv[s][k], r = half(s, k);
      for (let z = r.z0 + 5; z < r.z1 - 3; z += 13) { P().torch(w, 0, y + 3.2, z, 'px'); P().torch(w, W, y + 3.2, z, 'nx'); }
      dress(w, rng, L.occ, y, k, r, ruined);
    }

    // ---- chests anywhere, on any storey ----
    const nChest = (kind === 'vault' ? 6 : (area <= 4 ? 2 : rng.chance(0.75) ? 1 : 0) + (rng.chance(0.25) ? 1 : 0)) + (extraChests || 0);
    for (let i = 0; i < nChest; i++) {
      const tier = rng.chance(0.08 + area * 0.004) ? 2 : rng.chance(0.3) ? 1 : 0;
      for (let t = 0; t < 12; t++) {
        const s = rng.chance(0.5) ? 'N' : 'S', k = rng.int(0, NL - 1), o = lv[s][k].occ;
        const r = o.place(rng, 2, 2, 1); if (!r) continue;
        const x = r.x0 + 1, z = r.z0 + 1;
        if (LG.chestSpotFree(w, x, Y[k], z)) { P().chest(w, x, z, Y[k], rng.range(0, 6), tier); break; }
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
  // furnishing for one storey of one half (y: its floor)
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

  // ---------------------------------------------------------------- runtime: chain bridges and ladders
  // chain bridge: sags under you, sways sideways (and keeps swaying for a while). Not walkable for monsters.
  S.build = function (w) {
    S.chains = []; S.ladders = (w && w.ladders) || [];
    if (!w || !w.chains) return;
    const plankG = new THREE.BoxGeometry(1, 1, 1);
    for (const c of w.chains) {
      const L = c.z1 - c.z0, n = Math.max(8, Math.round(L / 0.5));
      const g = new THREE.Group();
      const planks = [], links = [];
      for (let i = 0; i < n; i++) { const m = new THREE.Mesh(plankG, w.mats.wood); m.scale.set(c.hw * 2, 0.07, L / n * 0.82); m.castShadow = true; m.receiveShadow = true; g.add(m); planks.push(m); }
      for (let i = 0; i < n; i++) for (let s = 0; s < 4; s++) { const m = new THREE.Mesh(plankG, w.mats.iron); m.scale.set(0.05, 0.05, L / n * 1.02); g.add(m); links.push(m); }
      w.group.add(g);
      S.chains.push({ c, L, n, planks, links, sway: 0, swayV: 0, bob: 0, bobV: 0, load: 0, tp: 0.5, on: false });
    }
    S.update(0);
  };
  const tri = (t, p) => (t < p ? t / Math.max(p, 1e-3) : (1 - t) / Math.max(1 - p, 1e-3));
  function shape(b, t) { // height drop (+) and sideways offset of the deck at t (0..1 along the bridge)
    const s = Math.sin(Math.PI * t);
    return { dy: 0.3 * s + b.load * 0.75 * Math.sin(Math.PI * b.tp) * tri(t, b.tp) + b.bob * s, dx: b.sway * s };
  }
  S.update = function (dt) {
    const Pp = G.player && G.player.pos;
    for (const b of S.chains) {
      const c = b.c;
      // sideways sway: a soft, lightly damped spring; vertical bob after a landing
      b.swayV += (-18 * b.sway - 0.35 * b.swayV) * dt; b.sway += b.swayV * dt;
      b.bobV += (-40 * b.bob - 3 * b.bobV) * dt; b.bob += b.bobV * dt;
      b.load = U.damp(b.load, b.on ? 1 : 0, 6, dt);
      if (Pp && Math.abs(Pp.x - c.x) > 60 && Math.abs(Pp.z - (c.z0 + c.z1) / 2) > 60 && dt) continue;
      for (let i = 0; i < b.n; i++) {
        const t = (i + 0.5) / b.n, sh = shape(b, t), z = c.z0 + t * b.L, y = c.y - sh.dy - 0.04;
        const t2 = Math.min(1, t + 0.5 / b.n), sh2 = shape(b, t2), slope = Math.atan2(sh2.dy - sh.dy, (t2 - t) * b.L);
        const pl = b.planks[i]; pl.position.set(c.x + sh.dx, y, z); pl.rotation.set(slope, 0, 0);
        for (let s = 0; s < 4; s++) {
          const lk = b.links[i * 4 + s], side = s % 2 ? 1 : -1, up = s >= 2;
          const hy = up ? 0.95 * (1 - 0.25 * Math.sin(Math.PI * t)) : -0.02;
          lk.position.set(c.x + sh.dx * (up ? 0.8 : 1) + side * (c.hw + 0.04), y + hy, z); lk.rotation.set(slope, 0, 0);
        }
      }
    }
  };
  // player.js physics: stand on a chain bridge (sets grounded); returns true while on one
  S.support = function (Pl, dt, preVy) {
    let on = null;
    for (const b of S.chains) {
      const c = b.c;
      if (Pl.pos.z <= c.z0 || Pl.pos.z >= c.z1 || Pl.vel.y > 0.5) { b.on = false; continue; }
      const t = (Pl.pos.z - c.z0) / b.L;
      if (b.on || b.load < 0.05) b.tp = t;
      const sh = shape(b, t), h = c.y - sh.dy;
      if (Math.abs(Pl.pos.x - (c.x + sh.dx)) > c.hw + 0.15 || Pl.pos.y > h + 0.15 || Pl.pos.y < h - 0.7) { b.on = false; continue; }
      if (!b.on) { // landing: the deck dips and starts to swing
        const f = Math.min(12, Math.max(0, -(preVy || 0)));
        b.bobV += f * 0.12; b.swayV += (Math.random() < 0.5 ? -1 : 1) * (0.4 + f * 0.12);
        G.sfx.chain(0.25, 0.25 + f * 0.03);
      }
      // walking rocks it; the deck carries you only partly, so a big swing can tip you off
      const sp = Math.hypot(Pl.vel.x, Pl.vel.z);
      if (sp > 1.5 && Math.random() < dt * 3) b.swayV += (Math.random() < 0.5 ? -1 : 1) * sp * 0.08;
      Pl.pos.x += b.swayV * Math.sin(Math.PI * t) * dt * 0.55;
      Pl.pos.y = h; if (Pl.vel.y < 0) Pl.vel.y = 0; Pl.grounded = true;
      b.on = true; on = b;
      if (Math.abs(b.swayV) > 0.8 && Math.random() < dt * 2) G.sfx.chain(0.2, 0.15);
    }
    S.onChain = !!on;
    return !!on;
  };
  // player.js: climbing a ladder (hold forward or jump inside its opening)
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
})();
