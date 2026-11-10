'use strict';
// 地下墓所 (catacombs, the entrance tier): 納骨壁の大回廊, the great ossuary nave.
//   A long, narrow nave under a high vault, from the stair hall at the south to the vestibule with the gates at the north. Its two long
//   walls rise in tiers of burial niches: the nave's floor, a terrace 4.5 m up, a second one 9 m up against the wall, then the wall
//   up to the vault. Stairs climb the terraces' faces; stone bridges cross the nave between the first terraces. Small burial chapels
//   are dug into the first terrace at the nave's level, behind iron gates (shut one behind you, the key: the monsters must batter it).
//   From the nave you see up every tier: what is left to find is seldom out of sight for long.
//   Layouts: 'nave' (the terraces the whole length), 'crossing' (they break off round a crossing in the middle, a monument of bones
//   in it), 'collapse' (stretches of the terraces fallen into slopes of rubble you can climb; one bridge broken in the middle).
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U;
  const P = () => G.Props;
  const CR = () => F._crypt;
  const T1 = 4.5, T2 = 9, VAULT = 16, D1 = 9, D2 = 3.6, SL = 0.3; // terrace tops, the vault; the terraces' depth from the wall; a top slab
  const NZ = 12, SZ = 11; // the vestibule (north) and the stair hall (south): no terraces there

  function genCatacombs(area, seed, extraChests, gates, kind) {
    const rng = new G.RNG(seed);
    const layout = F.pickLayout(rng, 'catacombs', ['nave', 'crossing', 'collapse']);
    const NAVE = 18 + rng.int(0, 2) * 2, L = 78 + rng.int(0, 3) * 4;
    const W = NAVE + 2 * D1, D = NZ + L + SZ, z0 = NZ, z1 = NZ + L;
    const w = new G.World(W, D, 'catacombs');
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = [];
    w.layout = layout;
    const occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    // x of a side's terrace: s = -1 west (its wall at x = 0), +1 east (its wall at x = W); u: distance from that wall
    const X = (s, u) => (s < 0 ? u : W - u);
    const box = (mk, s, u0, u1, y0, y1, za, zb, o) => { const a = X(s, u0), b = X(s, u1); w.solid(mk, Math.min(a, b), y0, za, Math.max(a, b), y1, zb, o || { uv: 2.5 }); };
    const vis = (mk, s, u0, u1, y0, y1, za, zb, o) => { const a = X(s, u0), b = X(s, u1); w.visual(mk, Math.min(a, b), y0, za, Math.max(a, b), y1, zb, o || { uv: 1 }); };

    // ---- the plan along the nave (z): for each side, what stands where
    const zc = Math.round((z0 + z1) / 2);
    const gap = layout === 'crossing' ? [zc - 8, zc + 8] : null; // (the crossing: no terraces there)
    // bridges between the first terraces (z of their middle)
    const bridges = gap ? [gap[0] - 6, gap[1] + 6] : [Math.round(z0 + L * 0.3), Math.round(z0 + L * 0.68)];
    const broken = layout === 'collapse' ? rng.int(0, 1) : -1; // (which bridge fell in the middle)
    // fallen stretches (collapse): one or two, on either side, never under a bridge's end
    const falls = [];
    if (layout === 'collapse') {
      for (let t = 0; t < 30 && falls.length < 2; t++) {
        const s = rng.chance(0.5) ? -1 : 1, za = Math.round(rng.range(z0 + 8, z1 - 20)), zb = za + 11;
        if (bridges.some((b) => b > za - 4 && b < zb + 4) || falls.some((f) => f.s === s && f.zb > za - 8 && f.za < zb + 8)) continue;
        falls.push({ s, za, zb });
      }
    }
    // chapels (dug into the first terrace, a gate in the face): two or three, the sides alternating, apart from bridges and falls
    const chapels = [];
    for (let t = 0; t < 60 && chapels.length < (layout === 'nave' ? 3 : 2) + (layout === 'collapse' ? 0 : 1); t++) {
      const s = chapels.length % 2 ? 1 : -1, za = Math.round(rng.range(z0 + 3, z1 - 10)), zb = za + 7;
      if (gap && zb > gap[0] - 2 && za < gap[1] + 2) continue;
      if (bridges.some((b) => b > za - 4 && b < zb + 4)) continue;
      if (falls.some((f) => f.s === s && f.zb > za - 3 && f.za < zb + 3)) continue;
      if (chapels.some((c) => c.s === s && c.zb > za - 6 && c.za < zb + 6)) continue;
      chapels.push({ s, za, zb });
    }
    // stairs: up to the first terrace (in the nave, against its face) and up to the second (on the first, against the second's face)
    // { s, z: the top's z (it runs down southward from there), lo / hi: the levels }
    const runs = (hFrom, hTo) => LG.stairsLen(hTo - hFrom);
    const stairs = [];
    // each stretch of terrace that runs unbroken (the crossing cuts them in two) gets its own: two up to the first, one or two up to the second
    const pieces = gap ? [[z0, gap[0]], [gap[1], z1]] : [[z0, z1]];
    const hits = (list, za, zb, pad) => list.some((q) => q.zb > za - pad && q.za < zb + pad);
    const place = (s, pa, pb, lv, want, anyway) => {
      const len = runs(lv ? T1 : 0, lv ? T2 : T1) + 2.4; // (the run and its landing)
      const have = [];
      for (let t = 0; t < 120 && have.length < want; t++) {
        const za = Math.round(rng.range(pa + 1.5, pb - len - 1.5)), zb = za + len;
        if (za < pa + 1 || zb > pb - 1) continue;
        if (hits(falls.filter((f) => f.s === s), za, zb, 2)) continue;
        // (a bridge may cross over the lower half of a stair to the first terrace: there is head room under it, not by the landing)
        if (!lv && ((!anyway && hits(chapels.filter((c) => c.s === s), za, zb, 1)) || bridges.some((b) => b > za - 2.5 && b < za + 9.5))) continue;
        if (hits(have, za, zb, t > 60 ? 2 : 10) || hits(stairs.filter((q) => q.s === s && q.lv === lv), za, zb, 2)) continue;
        have.push({ s, lv, za, zb });
      }
      stairs.push(...have);
      return have;
    };
    for (const [pa, pb] of pieces) {
      let n0 = 0;
      for (const s of [-1, 1]) { n0 += place(s, pa, pb, 0, 2, false).length; place(s, pa, pb, 1, 1 + (rng.chance(0.5) ? 1 : 0), false); }
      // no way up onto this stretch's first terraces from either side: one stair anyway, giving up the chapel in its way
      if (!n0) for (const s of [-1, 1]) {
        const h = place(s, pa, pb, 0, 1, true);
        if (!h.length) continue;
        for (let i = chapels.length - 1; i >= 0; i--) { const c = chapels[i]; if (c.s === s && c.zb > h[0].za - 1 && c.za < h[0].zb + 1) chapels.splice(i, 1); }
        break;
      }
    }

    // ---- the floor, the vault, the walls round it
    w.solid('floor', 0, -1, 0, W, 0, D, { uv: 4 });
    w.solid('rock', -3, VAULT, -3, W + 3, VAULT + 1.5, D + 3, { uv: 6, grad: false });
    H.perimeter(w, rng, W, D, { gates, h: VAULT, top: VAULT + 1.5, beams: 0 });

    // ---- the terraces: each side, stretch by stretch along z
    const cuts = (s) => {
      // the z-stretches of a side: plain terrace, chapel, fall, crossing gap (sorted, covering z0..z1)
      const xs = [{ za: z0, zb: z1, t: 'plain' }];
      const split = (za, zb, t, o) => {
        for (let i = 0; i < xs.length; i++) {
          const q = xs[i]; if (q.t !== 'plain' || zb <= q.za || za >= q.zb) continue;
          const parts = [];
          if (za > q.za) parts.push({ za: q.za, zb: za, t: 'plain' });
          parts.push(Object.assign({ za: Math.max(za, q.za), zb: Math.min(zb, q.zb), t }, o));
          if (zb < q.zb) parts.push({ za: zb, zb: q.zb, t: 'plain' });
          xs.splice(i, 1, ...parts); return;
        }
      };
      if (gap) split(gap[0], gap[1], 'gap');
      for (const c of chapels) if (c.s === s) split(c.za, c.zb, 'chapel', { c });
      for (const f of falls) if (f.s === s) split(f.za, f.zb, 'fall', { f });
      return xs;
    };
    const t1top = [], t2top = []; // (the walkable tops, for the rails and the chest spots)
    for (const s of [-1, 1]) {
      for (const q of cuts(s)) {
        const { za, zb } = q;
        if (q.t === 'gap') continue;
        if (q.t === 'plain') {
          box('wall', s, 0, D1, 0, T1 - SL, za, zb);
          box('floor', s, 0, D1, T1 - SL, T1, za, zb, { uv: 4 });
          box('wall', s, 0, D2, T1, T2 - SL, za, zb);
          box('floor', s, 0, D2, T2 - SL, T2, za, zb, { uv: 4 });
          t1top.push({ s, za, zb }); t2top.push({ s, za, zb });
          // the niches: rows of skulls in the first terrace's face, the second's, and the wall above
          CR().ossuary(w, rng, za, zb, X(s, D1), false, -s, 0);
          CR().ossuary(w, rng, za, zb, X(s, D2), false, -s, T1);
          CR().ossuary(w, rng, za, zb, X(s, 0), false, -s, T2);
          CR().ossuary(w, rng, za, zb, X(s, 0), false, -s, T2 + 3.4);
        } else if (q.t === 'chapel') {
          // a chapel dug into the first terrace: its walls, its ceiling under the terrace's top, the iron gate in the face
          const gx = X(s, D1 - 0.5);
          CR().gate(w, rng, gx, za, zb, T1 - SL, 1);
          box('wall', s, 0, D1 - 1, 0, T1 - SL, za, za + 0.6); box('wall', s, 0, D1 - 1, 0, T1 - SL, zb - 0.6, zb);
          box('rock', s, 0, D1 - 1, 4.12, T1 - SL, za + 0.6, zb - 0.6, { uv: 3 });
          box('floor', s, 0, D1, T1 - SL, T1, za, zb, { uv: 4 });
          box('wall', s, 0, D2, T1, T2 - SL, za, zb);
          box('floor', s, 0, D2, T2 - SL, T2, za, zb, { uv: 4 });
          t1top.push({ s, za, zb }); t2top.push({ s, za, zb });
          CR().ossuary(w, rng, za, zb, X(s, D2), false, -s, T1);
          CR().ossuary(w, rng, za, zb, X(s, 0), false, -s, T2);
          CR().ossuary(w, rng, za, zb, X(s, 0), false, -s, T2 + 3.4);
          // inside: the back wall's niches, a sarcophagus, candles; a cold light
          CR().ossuary(w, rng, za + 0.9, zb - 0.9, X(s, 0), false, -s, 0);
          const cx = X(s, (D1 - 1) / 2 + 0.3), cz = (za + zb) / 2;
          P().sarcophagus(w, cx, cz, 0, true, rng);
          P().candles(w, X(s, 1.2), 0, za + 1.4, rng, true); P().candles(w, X(s, 1.2), 0, zb - 1.4, rng, false);
          w.addLight(cx, 3, cz, { flame: 0.3, intensity: 6, range: 9, color: '#7ad0b0', prio: 0.8 });
          // a chest's place: by the sarcophagus, away from the gate
          w.platTops.push({ x0: Math.min(X(s, 0.8), X(s, 3)), z0: za + 1.2, x1: Math.max(X(s, 0.8), X(s, 3)), z1: zb - 1.2, y: 0, cx: X(s, 1.9), cz });
          occ.mark(Math.min(X(s, 0), X(s, D1)), za, Math.max(X(s, 0), X(s, D1)), zb, 2);
        } else if (q.t === 'fall') {
          // a stretch where the first terrace's face fell in: a slope of rubble from the nave's floor up to the first terrace's level
          // (0.25 m a step, 0.5 m deep: as easy as a stair, for you and for the foes), 4 m of it out in the nave. The second terrace
          // still stands over the back of it.
          const uTop = D2 + 0.6, uLow = D1 + 4, n = Math.round(T1 / 0.25), run = (uLow - uTop) / n;
          box('wall', s, 0, uTop, 0, T1 - SL, za, zb); box('floor', s, 0, uTop, T1 - SL, T1, za, zb, { uv: 4 });
          for (let i = 0; i < n; i++) { const u1 = uLow - i * run, h = (i + 1) * (T1 / n); box('rock', s, u1 - run, u1, 0, h, za, zb, { uv: 2, grad: false }); }
          box('wall', s, 0, D2, T1, T2 - SL, za, zb);
          box('floor', s, 0, D2, T2 - SL, T2, za, zb, { uv: 4 });
          t2top.push({ s, za, zb });
          CR().ossuary(w, rng, za, zb, X(s, D2), false, -s, T1);
          // stones fallen out into the nave at its foot (small ones on the slope: nothing to trip on)
          for (let k = 0; k < 3; k++) P().rubble(w, X(s, rng.range(uLow + 0.8, uLow + 2.2)), 0, rng.range(za + 1, zb - 1), rng, rng.range(1, 1.5), 'rock');
          for (let k = 0; k < 4; k++) { const u = rng.range(uTop + 1, uLow - 1), h = T1 * (uLow - u) / (uLow - uTop); P().rubble(w, X(s, u), h, rng.range(za + 1, zb - 1), rng, rng.range(0.5, 0.9), 'rock'); }
          // (the wall above, behind the fall)
          CR().ossuary(w, rng, za + 2, zb - 2, X(s, 0), false, -s, T2);
          occ.mark(Math.min(X(s, 0), X(s, D1 + 6.4)), za, Math.max(X(s, 0), X(s, D1 + 6.4)), zb, 2);
        }
      }
    }
    // the terraces' ends (north and south, and round the crossing): niches on the end faces
    for (const s of [-1, 1]) for (const q of cuts(s)) {
      if (q.t === 'gap') continue;
      const prev = cuts(s).find((r) => r.zb === q.za), next = cuts(s).find((r) => r.za === q.zb);
      const lo = Math.min(X(s, 0), X(s, D1)), hi = Math.max(X(s, 0), X(s, D1));
      if (!prev || prev.t === 'gap') CR().ossuary(w, rng, lo, hi, q.za, true, -1, 0);
      if (!next || next.t === 'gap') CR().ossuary(w, rng, lo, hi, q.zb, true, 1, 0);
    }
    // ---- the rails along the terraces' edges (gaps: stairs' heads, bridges' ends, every so often a gap to drop through)
    const rail = (s, u, y, za, zb, gaps) => {
      let z = za;
      const gs = gaps.filter((g) => g[1] > za && g[0] < zb).sort((a, b) => a[0] - b[0]);
      const seg = (a, b) => { if (b - a < 0.6) return; box('wall', s, u - 0.35, u, y, y + 0.95, a, b, { uv: 2 }); box('trim', s, u - 0.42, u + 0.07, y + 0.95, y + 1.05, a, b, { uv: 1 }); };
      for (const g of gs) { seg(z, Math.max(z, g[0])); z = Math.max(z, g[1]); }
      seg(z, zb);
    };
    const drops = [];
    for (let z = z0 + 9; z < z1 - 6; z += rng.range(13, 18)) drops.push([z, z + 2.2]);
    for (const s of [-1, 1]) {
      const g1 = drops.slice(), g2 = drops.map(([a, b]) => [a + 5, b + 5]);
      for (const b of bridges) g1.push([b - 1.8, b + 1.8]);
      for (const st of stairs) if (st.s === s) (st.lv ? g2 : g1).push([st.za - 0.2, st.za + 2.6]);
      for (const f of falls) if (f.s === s) g1.push([f.za, f.zb]);
      for (const q of t1top) if (q.s === s) rail(s, D1, T1, q.za, q.zb, g1);
      for (const q of t2top) if (q.s === s) rail(s, D2, T2, q.za, q.zb, g2);
      // across the ends of the tops (north / south / at the crossing): the drop into the vestibule, the hall or the crossing
      for (const q of cuts(s)) {
        if (q.t === 'gap' || q.t === 'fall') continue;
        const all = cuts(s), prev = all.find((r) => r.zb === q.za), next = all.find((r) => r.za === q.zb);
        for (const [zEnd, open] of [[q.za, !prev || prev.t === 'gap'], [q.zb, !next || next.t === 'gap']]) {
          if (!open) continue;
          const a = Math.min(X(s, D2), X(s, D1)), b = Math.max(X(s, D2), X(s, D1)), c = Math.min(X(s, 0), X(s, D2)), d = Math.max(X(s, 0), X(s, D2));
          const zz = zEnd === q.za ? [zEnd, zEnd + 0.35] : [zEnd - 0.35, zEnd];
          w.solid('wall', a, T1, zz[0], b, T1 + 0.95, zz[1], { uv: 2 }); w.solid('trim', a, T1 + 0.95, zz[0] - 0.04, b, T1 + 1.05, zz[1] + 0.04, { uv: 1 });
          w.solid('wall', c, T2, zz[0], d, T2 + 0.95, zz[1], { uv: 2 }); w.solid('trim', c, T2 + 0.95, zz[0] - 0.04, d, T2 + 1.05, zz[1] + 0.04, { uv: 1 });
        }
      }
    }
    // ---- the stairs (each with a landing at its head, level with the terrace it climbs to)
    for (const st of stairs) {
      const s = st.s, lo = st.lv ? T1 : 0, hi = st.lv ? T2 : T1, u = st.lv ? D2 : D1, wd = 2.2;
      const cx = X(s, u + wd / 2);
      box('trim', s, u, u + wd, lo, hi, st.za, st.za + 2.4, { uv: 1.5 }); // (the landing)
      H.stairs(w, 'S', st.za + 2.4, cx, wd, lo, hi, 'trim');
      // its outer side railed on the landing
      box('wall', s, u + wd - 0.3, u + wd, hi, hi + 0.95, st.za, st.za + 2.4, { uv: 2 });
      occ.mark(Math.min(X(s, u), X(s, u + wd)) - 0.4, st.za - 0.4, Math.max(X(s, u), X(s, u + wd)) + 0.4, st.zb + 0.4, 2);
    }
    // ---- the bridges across the nave, between the first terraces
    bridges.forEach((bz, i) => {
      const a = D1, b = W - D1, za = bz - 1.7, zb = bz + 1.7;
      if (i === broken) {
        // fallen in the middle: a stub from each side, its broken end over the nave
        for (const [p, q] of [[a, a + 5.5], [b - 5.5, b]]) {
          w.solid('block', p, T1 - 0.7, za, q, T1, zb, { uv: 2 });
          w.solid('wall', p, T1, za, q, T1 + 0.95, za + 0.3, { uv: 2 }); w.solid('wall', p, T1, zb - 0.3, q, T1 + 0.95, zb, { uv: 2 });
        }
        for (let k = 0; k < 5; k++) P().rubble(w, rng.range(a + 6, b - 6), 0, rng.range(za, zb), rng, rng.range(0.6, 1.1), 'rock');
        return;
      }
      w.solid('block', a, T1 - 0.7, za, b, T1, zb, { uv: 2 });
      w.solid('wall', a, T1, za, b, T1 + 0.95, za + 0.3, { uv: 2 }); w.solid('trim', a, T1 + 0.95, za - 0.04, b, T1 + 1.05, za + 0.34, { uv: 1 });
      w.solid('wall', a, T1, zb - 0.3, b, T1 + 0.95, zb, { uv: 2 }); w.solid('trim', a, T1 + 0.95, zb - 0.34, b, T1 + 1.05, zb + 0.04, { uv: 1 });
      // skulls along its sides, a lamp hanging under its middle
      for (let x = a + 1.5; x < b - 1; x += 2.2) for (const z of [za - 0.02, zb + 0.02]) P().skull(w, x, T1 - 0.5, z, z < bz ? Math.PI : 0, 0.8);
      w.addLight((a + b) / 2, T1 - 1.6, bz, { flame: 0.4, intensity: 6, range: 10, color: '#ffb070', prio: 0.6 });
    });
    // ---- the crossing: a monument of bones on a stepped plinth
    if (gap) {
      const cx = W / 2, cz = zc;
      for (const [r, y0, y1] of [[4, 0, 0.45], [3.1, 0.45, 0.9], [2.2, 0.9, 1.35]]) w.solid('trim', cx - r, y0, cz - r, cx + r, y1, cz + r, { uv: 1.5 });
      w.solid('block', cx - 1.2, 1.35, cz - 1.2, cx + 1.2, 4.6, cz + 1.2, { uv: 2 });
      for (const f of [-1, 1]) { CR().ossuary(w, rng, cx - 1, cx + 1, cz + f * 1.2, true, f, 0.7); CR().ossuary(w, rng, cz - 1, cz + 1, cx + f * 1.2, false, f, 0.7); }
      P().candles(w, cx - 2.6, 0.9, cz - 2.6, rng, true); P().candles(w, cx + 2.6, 0.9, cz + 2.6, rng, true);
      w.addLight(cx, 5.5, cz, { flame: 0.3, intensity: 10, range: 16, color: '#ffb070', prio: 1 });
      occ.mark(cx - 4.6, cz - 4.6, cx + 4.6, cz + 4.6, 2);
      w.platTops.push({ x0: cx - 3.9, z0: cz - 3.9, x1: cx - 2.4, z1: cz + 3.9, y: 0, cx: cx - 3.2, cz });
      // the crossing's side walls: niches all the way up
      for (const s of [-1, 1]) for (const y0 of [0, 3.4, 6.8, 10.2]) CR().ossuary(w, rng, gap[0] + 0.5, gap[1] - 0.5, X(s, 0), false, -s, y0);
    }
    // ---- the nave's floor: rows of sarcophagi (lanes between them), heaps of bones, urns, candles; lamps hanging from the vault
    for (let z = z0 + 6; z < z1 - 4; z += rng.range(7, 10)) {
      if (gap && z > gap[0] - 5 && z < gap[1] + 5) continue;
      if (bridges.some((b) => Math.abs(b - z) < 2.5)) continue;
      for (const f of [-1, 1]) {
        const x = W / 2 + f * rng.range(2.6, NAVE / 2 - 4.2);
        if (!occ.free(x - 1.6, z - 1.2, x + 1.6, z + 1.2)) continue;
        if (rng.chance(0.65)) { P().sarcophagus(w, x, z, 0, rng.chance(0.5), rng); occ.mark(x - 1.6, z - 1.2, x + 1.6, z + 1.2); }
        else if (rng.chance(0.5)) { P().urn(w, x, z, 0, rng); occ.mark(x - 0.6, z - 0.6, x + 0.6, z + 0.6); }
        else P().bones(w, x, 0.02, z, rng);
      }
    }
    for (let z = z0 + 10; z < z1 - 6; z += 16) P().chandelier(w, W / 2, VAULT - 5, z, VAULT);
    // braziers on the second terraces, candles along the first, webs in the corners
    for (const q of t2top) for (let z = q.za + 4; z < q.zb - 3; z += 14) { P().brazier(w, X(q.s, 1.4), T2, z, 0.9, true); w.addLight(X(q.s, 1.4), T2 + 1.6, z, { flame: 0.5, intensity: 7, range: 11, color: '#ff9a50', prio: 0.7 }); }
    for (const q of t1top) for (let z = q.za + 3; z < q.zb - 2; z += 9) if (rng.chance(0.6)) P().candles(w, X(q.s, D1 - 0.8), T1, z, rng, rng.chance(0.5));
    for (const q of t2top) if (rng.chance(0.5)) P().web(w, X(q.s, 0.4), VAULT - 1.4, q.za + 0.4, Math.PI / 4, rng.range(1.2, 1.8));
    // chest spots on the tops: the second terraces' ends and a few places on the first
    for (const q of t2top) if (q.zb - q.za > 6) for (const z of [q.za + 2.2, q.zb - 2.2]) if (rng.chance(0.5)) w.platTops.push({ x0: Math.min(X(q.s, 0.6), X(q.s, D2 - 0.8)), z0: z - 1.2, x1: Math.max(X(q.s, 0.6), X(q.s, D2 - 0.8)), z1: z + 1.2, y: T2, cx: X(q.s, 1.6), cz: z });
    for (const q of t1top) if (q.zb - q.za > 10 && rng.chance(0.6)) { const z = rng.range(q.za + 3, q.zb - 3); if (stairs.some((st) => st.s === q.s && st.lv === 1 && z > st.za - 1.5 && z < st.zb + 1.5)) continue; w.platTops.push({ x0: Math.min(X(q.s, D2 + 0.8), X(q.s, D1 - 1)), z0: z - 1.2, x1: Math.max(X(q.s, D2 + 0.8), X(q.s, D1 - 1)), z1: z + 1.2, y: T1, cx: X(q.s, D2 + 2), cz: z }); }
    // ---- the vestibule (north): pillars, braziers by the gates; the stair hall (south): torches, a sarcophagus either side
    for (let x = 7; x < W - 5; x += 10) { if (LG.gateXs(W, gates || 1).some((g) => Math.abs(g - x) < 7)) continue; P().pillarSquare(w, x, 7, 0, VAULT, 1.1); occ.mark(x - 1.2, 6, x + 1.2, 8); }
    for (const sx of [-1, 1]) { const x = W / 2 + sx * rng.range(7, 10), z = D - 5; P().sarcophagus(w, x, z, 0, true, rng); occ.mark(x - 1.6, z - 1.2, x + 1.6, z + 1.2); }
    for (let x = 5; x < W - 3; x += 8) if (Math.abs(x - W / 2) > 5) P().torch(w, x, 3.2, D, 'nz');
    for (const g of LG.gateXs(W, gates || 1)) { P().brazier(w, g - 4.5, 0, 4.5, 1, true); P().brazier(w, g + 4.5, 0, 4.5, 1, true); }
    // (the terraces and chapels are not for the area's later things: they go on the nave's floor)
    for (const s of [-1, 1]) occ.mark(Math.min(X(s, 0), X(s, D1)), z0, Math.max(X(s, 0), X(s, D1)), z1, 2);
    w.navLayers = 2; w.navRebuild = true; // (two layers: a gate's leaves swinging open or shut rebuild the nav, a small one)
    return FB.finish(w, rng, occ, W, D, area, kind, extraChests);
  }
  F.gen.catacombs = genCatacombs;
})();
