'use strict';
// The ways in and out are open: nothing of an area's dressing stands in a gate, a door or a passage you have to go through
// (2026-11-22: in the catacombs' guardian hall the walls' rows of skulls (fieldgen_t2.js, the shelves of an ossuary) were laid along
// the north wall right across its three exit gates - after the fight there was no way out).
//   For every field a run can draw (runplan.js R.TIERS, in the blue of the deep segments too), over several seeds: its ordinary areas
//   (three exits or one), its guardian's hall (with exits, and the last one without), its rooms and its merchant's hall are built, and
//   from where you come in it is worked out, by the colliders (the player's own box: 0.7 m across, crouched 1.15 m tall, a step of
//   0.5 m, falling anywhere, swimming up deep water; the exits' portcullises up, the guardian's door slid away, the cell gates opened),
//   where you can go:
//   - walking (no jump): every exit's tunnel; in a guardian's hall, through its door into the arena, up to the guardian
//   - walking or jumping (up to 1.7 m, a jump and a climb), or else with the hook (a clear line to it, 42 m): every chest, every device,
//     cell gate and figure you work, the wares, the mini shop, the stone vendor
//   - and nothing drawn (a box of the area's mesh, a shape, an instance) stands in the mouth of an exit, the guardian's door or the way in
//   The last guardian's own field is checked once. Told, not failed: how much of the floor the monsters' map reaches is not yours.
//   node tests/door_test.js [field ...] [--seeds=N] [--kinds=combat,boss,rooms,shop] [--v]   (--v: where the blocked ones are, and what is in the way)
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9988;
const argv = process.argv.slice(2);
const opt = (k, d) => { const a = argv.find((s) => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const only = argv.filter((a) => !a.startsWith('--')), VERB = argv.includes('--v');
const SEEDS = +opt('seeds', 3);

// ---------------------------------------------------------------- in the page
function inPage() {
  const DT = (window.DoorT = {});
  const HW = 0.35, CH = 1.15, STEP = 0.5, JUMP = 1.7, S = 0.25, L = 8;
  // (--v) where each collider was made: the first line of the game's code outside world.js that made it
  DT.trace = function () {
    const WP = G.World.prototype; if (WP._dtAdd) return;
    WP._dtAdd = WP.addCollider;
    WP.addCollider = function (...a) { const c = WP._dtAdd.apply(this, a); const st = String(new Error().stack).split('\n').slice(2).map((s) => (s.match(/js\/([\w]+\.js):(\d+)/) || [])).filter((m) => m[1] && m[1] !== 'world.js'); c.src = st.length ? st[0][1] + ':' + st[0][2] + (st[1] ? ' < ' + st[1][1] + ':' + st[1][2] : '') : 'world.js'; return c; };
  };
  // what is drawn, as boxes: every box and shape written into an area's mesh (world.js Batch box / geo) and every instance (props.js
  // P.inst - the skulls and bones of the ossuaries), kept on the batch as [mk, x0, y0, z0, x1, y1, z1]
  DT.traceVis = function () {
    const BP = G.Batch.prototype; if (BP._dtBox) return;
    const rec = (b, mk, a) => { if (b) (b._dtv || (b._dtv = [])).push([mk, ...a]); };
    const bb = new THREE.Box3();
    const geoBox = (geo, m) => { if (!geo.boundingBox) geo.computeBoundingBox(); bb.copy(geo.boundingBox).applyMatrix4(m); return [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]; };
    BP._dtBox = BP.box; BP.box = function (mk, x0, y0, z0, x1, y1, z1) { rec(this, mk, [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]); return BP._dtBox.apply(this, arguments); };
    BP._dtGeo = BP.geo; BP.geo = function (mk, geo, mat) { if (geo && geo.attributes && mat && mat.elements) rec(this, mk, geoBox(geo, mat)); return BP._dtGeo.apply(this, arguments); };
    const PR = G.Props; PR._dtInst = PR.inst; PR.inst = function (w, mk, geo, m4) { if (w && geo && m4) rec(w.batch, mk, geoBox(geo, w._atY ? new THREE.Matrix4().makeTranslation(0, w._atY, 0).multiply(m4) : m4)); return PR._dtInst.apply(this, arguments); };
  };
  // the mouths you go through, as boxes of the air in them a person passes through (from 0.25 m over the floor to 2.4 m):
  // each exit's gate and its tunnel, the guardian's door with a stride before and after it, the spawn
  DT.mouths = function (w) {
    const m = [];
    for (const ex of w.exits || []) m.push({ what: 'exit ' + ex.idx + ' (x ' + ex.x + ')', b: [ex.gx0 + 0.5, 0.25, -11, ex.gx1 - 0.5, 2.4, 1.2] });
    const bg = w.bossGate; if (bg) m.push({ what: "the guardian's door", b: [bg.x - bg.w / 2 + 0.5, 0.25, bg.z0 - 1.2, bg.x + bg.w / 2 - 0.5, 2.4, bg.z1 + 1.2] });
    if (w.spawn) m.push({ what: 'the way in', b: [w.spawn.x - 1.2, (w.spawn.y || 0) + 0.25, w.spawn.z - 1.2, w.spawn.x + 1.2, (w.spawn.y || 0) + 2.4, w.spawn.z + 1.2] });
    return m;
  };
  // what is drawn standing in a mouth (more than 0.3 m of it across and 0.3 m up it; what lies flat on the floor is left out)
  DT.visIn = function (w) {
    const out = [], v = (w.batch && w.batch._dtv) || [];
    for (const M of DT.mouths(w)) {
      const [a0, b0, c0, a1, b1, c1] = M.b, hit = [];
      for (const q of v) {
        const [mk, x0, y0, z0, x1, y1, z1] = q;
        if (y1 - y0 <= 0.12) continue;
        const ix = Math.min(x1, a1) - Math.max(x0, a0), iy = Math.min(y1, b1) - Math.max(y0, b0), iz = Math.min(z1, c1) - Math.max(z0, c0);
        if (ix > 0.3 && iy > 0.3 && iz > 0) hit.push(mk + ' ' + [x0, y0, z0, x1, y1, z1].map((t) => +t.toFixed(2)).join(','));
      }
      if (hit.length) out.push({ what: M.what, hit: hit.slice(0, 6), n: hit.length });
    }
    return out;
  };
  // build an area of field f: kind 'combat' / 'elite' (an ordinary area), 'boss', 'shop', or a room's kind
  DT.build = function (f, kind, seed, o) {
    o = o || {};
    const R = G.Run, LG = G.LevelGen, f0 = R.field, l0 = R.isLast;
    R.field = () => f; R._blueGen = !!o.blue; R.isLast = () => !!o.last; // (o.last: the last area of a run - its guardian's hall has no exits)
    try {
      if (kind === 'boss') return LG.boss(7, seed, o.boss || 'colossus');
      if (kind === 'final') return LG.boss(21, seed, 'sovereign');
      if (kind === 'shop') return LG.shop(6, seed, o.gates || 3);
      if (kind === 'combat' || kind === 'elite') return LG.generate(9, seed, { gates: o.gates || 3, kind });
      return LG.room(9, seed, kind, o.gates || 3);
    } finally { R.field = f0; R._blueGen = false; R.isLast = l0; }
  };
  // Where the player can get to from the spawn, over a grid of 0.25 m: each column's surfaces you can stand on (crouched), and which of
  // them are reached. up: how far up you go to the next column (STEP walking; JUMP with a jump and a climb, player.js tryMantle)
  DT.reach = function (w, up) {
    const pad = 8, x0 = -pad, z0 = -14, NX = Math.ceil((w.W + 2 * pad) / S), NZ = Math.ceil((w.D + 14 + pad) / S);
    const tops = new Array(NX * NZ), vis = new Uint8Array(NX * NZ * L), q = new Int32Array(NX * NZ * L);
    const kill = w.killY ?? -12;
    const free = (ax, ay, az, bx, by, bz) => w.boxFree(ax, ay, az, bx, by, bz);
    const X = (i) => x0 + ((i % NX) + 0.5) * S, Z = (i) => z0 + (((i / NX) | 0) + 0.5) * S;
    // (you stand on the highest top under any part of your box, as world.js groundAt; a terrain's ground only under your middle)
    const col = (i) => {
      let t = tops[i]; if (t) return t;
      const cx = X(i), cz = Z(i), ys = [];
      for (const c of w.query(cx - HW + 0.003, kill, cz - HW + 0.003, cx + HW - 0.003, 90, cz + HW - 0.003)) {
        if (c.tg && !(cx >= c.x0 && cx < c.x1 && cz >= c.z0 && cz < c.z1)) continue;
        const y = c.tg ? w.tTop(c, cx, cz) : c.y1; if (y > kill && !ys.some((v) => Math.abs(v - y) < 0.005)) ys.push(y);
      }
      ys.sort((a, b) => a - b);
      t = []; for (const y of ys) if (t.length < L && free(cx - HW, y + 0.02, cz - HW, cx + HW, y + CH, cz + HW)) t.push(y);
      return (tops[i] = t);
    };
    const deep = (x, z, y) => { if (!w.deepWater) return null; for (const d of w.deepWater) if (x > d.x0 && x < d.x1 && z > d.z0 && z < d.z1 && y < d.y - 0.1) return d; return null; };
    let n = 0, h = 0;
    const sx = Math.floor((w.spawn.x - x0) / S), sz = Math.floor((w.spawn.z - z0) / S), si = sz * NX + sx, st = col(si);
    let sk = -1, bd = 1e9; st.forEach((y, k) => { const d = Math.abs(y - (w.spawn.y || 0)); if (d < bd) { bd = d; sk = k; } });
    if (sk >= 0) { vis[si * L + sk] = 1; q[n++] = si * L + sk; }
    const D4 = [1, 0, -1, 0, 0, 1, 0, -1];
    w.pp = true; // (as the player moves: monster-only colliders let you by, a terrain's ground is its drawn surface)
    try {
      while (h < n) {
        const a = q[h++], ia = (a / L) | 0, ya = tops[ia][a % L], ax = X(ia), az = Z(ia), xi = ia % NX, zi = (ia / NX) | 0;
        const dq = deep(ax, az, ya), base = dq ? Math.max(ya, dq.y) : ya, lim = dq ? 0.9 : STEP; // (in deep water you swim up to its top and climb out onto what is up to 0.9 m over it: world.js)
        for (let d = 0; d < 8; d += 2) {
          const xx = xi + D4[d], zz = zi + D4[d + 1]; if (xx < 0 || zz < 0 || xx >= NX || zz >= NZ) continue;
          const ib = zz * NX + xx, tb = col(ib), bx = X(ib), bz = Z(ib);
          // walking on: you come down on the highest surface no more than a step over you (stepping up onto it, or falling to it)
          let kw = -1; for (let k = tb.length - 1; k >= 0; k--) if (tb[k] <= base + lim + 1e-3) { kw = k; break; }
          if (kw >= 0 && !vis[ib * L + kw]) { const yb = tb[kw]; if (yb >= ya - 0.01 || free(bx - HW, yb + 0.02, bz - HW, bx + HW, ya + CH, bz + HW)) { vis[ib * L + kw] = 1; q[n++] = ib * L + kw; } }
          // jumping up onto a higher one: room over you to rise to it
          if (up > lim) for (let k = kw + 1; k < tb.length; k++) { const yb = tb[k]; if (yb > base + up + 1e-3) break; if (vis[ib * L + k]) continue; if (free(ax - HW, ya + 0.1, az - HW, ax + HW, yb + CH, az + HW)) { vis[ib * L + k] = 1; q[n++] = ib * L + k; } }
        }
      }
    } finally { w.pp = false; }
    return { vis, tops, NX, NZ, x0, z0, n, col };
  };
  // the hook (player.js, 42 m): from somewhere reached, a clear line to where you would stand by the goal (a perch you swing up to).
  // Only for what is off the ways (a chest on a ledge, a ware): the ways themselves are walked
  DT.hook = function (w, R, gl) {
    const { vis, tops, NX, NZ, x0, z0, col } = R, sp = [], V3 = THREE.Vector3;
    const box = (x, z, r) => [Math.max(0, Math.floor((x - r - x0) / S)), Math.min(NX - 1, Math.floor((x + r - x0) / S)), Math.max(0, Math.floor((z - r - z0) / S)), Math.min(NZ - 1, Math.floor((z + r - z0) / S))];
    w.pp = true;
    try {
      const [a, b, c, e] = box(gl.x, gl.z, gl.r);
      for (let zi = c; zi <= e; zi++) for (let xi = a; xi <= b; xi++) { const nx = x0 + (xi + 0.5) * S, nz = z0 + (zi + 0.5) * S; if (Math.hypot(nx - gl.x, nz - gl.z) > gl.r) continue; for (const y of col(zi * NX + xi)) if (!gl.ok || gl.ok(y, nx, nz)) sp.push(new V3(nx, y + 0.5, nz)); }
    } finally { w.pp = false; }
    if (!sp.length) return false;
    const pick = sp.filter((_, i) => i % Math.ceil(sp.length / 6) === 0), eye = new V3();
    const [a, b, c, e] = box(gl.x, gl.z, 40);
    for (let zi = c; zi <= e; zi += 4) for (let xi = a; xi <= b; xi += 4) {
      const i = zi * NX + xi, t = tops[i]; if (!t) continue;
      for (let k = 0; k < t.length; k++) if (vis[i * L + k]) { eye.set(x0 + (xi + 0.5) * S, t[k] + 1.62, z0 + (zi + 0.5) * S); for (const p of pick) if (eye.distanceTo(p) <= 41 && w.los(eye, p)) return true; }
    }
    return false;
  };
  // the reached surface within r of (x, z) for which ok(y, x, z) holds, the nearest first; null if there is none
  DT.near = function (R, x, z, r, ok) {
    const { vis, tops, NX, NZ, x0, z0 } = R;
    const a = Math.max(0, Math.floor((x - r - x0) / S)), b = Math.min(NX - 1, Math.floor((x + r - x0) / S));
    const c = Math.max(0, Math.floor((z - r - z0) / S)), e = Math.min(NZ - 1, Math.floor((z + r - z0) / S));
    let best = null, bd = 1e9;
    for (let zi = c; zi <= e; zi++) for (let xi = a; xi <= b; xi++) {
      const i = zi * NX + xi, t = tops[i]; if (!t) continue;
      const nx = x0 + (xi + 0.5) * S, nz = z0 + (zi + 0.5) * S, d = Math.hypot(nx - x, nz - z); if (d > r || d >= bd) continue;
      for (let k = 0; k < t.length; k++) if (vis[i * L + k] && (!ok || ok(t[k], nx, nz))) { best = { x: +nx.toFixed(2), y: +t[k].toFixed(2), z: +nz.toFixed(2) }; bd = d; break; }
    }
    return best;
  };
  // what has to be reached: [{ kind, what, x, z, r, ok, walk }] (walk: on foot alone, no jump)
  DT.goals = function (w) {
    const g = [], eye = (p, reach) => (y, x, z) => Math.hypot(x - p.x, y + 1.62 - p.y, z - p.z) <= reach || Math.hypot(x - p.x, y + 1.0 - p.y, z - p.z) <= reach;
    for (const ex of w.exits || []) g.push({ kind: 'exit', what: 'exit ' + ex.idx + ' (x ' + ex.x + ')', x: ex.x, z: -5.5, r: 2, walk: true });
    if (w.isBoss && w.arenaCenter) g.push({ kind: 'arena', what: 'the guardian (arena centre)', x: w.arenaCenter.x, z: w.arenaCenter.z, r: 10, walk: true });
    const RE = { chest: 3.2, npc: 4, shrine: 4, anvil: 4, cauldron: 4, celldoor: 3.4 };
    for (const it of w.interactables || []) {
      if (!it.pos) continue;
      const reach = it.type === 'gimmick' ? (it.reach || 3) : RE[it.type] || 3.2;
      g.push({ kind: it.type === 'gimmick' && it.gim ? 'gimmick:' + it.gim.kind : it.type, what: it.type + (it.gim ? ' ' + it.gim.kind : ''), x: it.pos.x, z: it.pos.z, y: it.pos.y, r: reach, ok: eye(it.pos, reach) });
    }
    for (const s of w.shopSlots || []) g.push({ kind: 'ware', what: 'ware', x: s.x, z: s.z, y: s.y, r: 3.2, ok: eye(s, 3.2) });
    for (const s of w.miniSlots || []) g.push({ kind: 'mini', what: 'mini shop', x: s.x, z: s.z, y: s.y, r: 3.2, ok: eye(s, 3.2) });
    if (w.miniHeal) g.push({ kind: 'miniheal', what: 'paid basin', x: w.miniHeal.x, z: w.miniHeal.z, y: (w.miniHeal.y || 0) + 1, r: 3.2, ok: eye({ x: w.miniHeal.x, y: (w.miniHeal.y || 0) + 1, z: w.miniHeal.z }, 3.2) });
    if (w.stoneVendor && w.stoneVendor.pos) g.push({ kind: 'vendor', what: 'stone vendor', x: w.stoneVendor.pos.x, z: w.stoneVendor.pos.z, y: w.stoneVendor.pos.y, r: 3.2, ok: eye(w.stoneVendor.pos, 3.2) });
    for (const s of w.npcSpots || []) g.push({ kind: 'figure', what: 'figure', x: s.x, z: s.z, y: (s.y || 0) + 1.2, r: 4, ok: eye({ x: s.x, y: (s.y || 0) + 1.2, z: s.z }, 4) });
    return g;
  };
  // the floor the monsters' map reaches from the spawn (levelgen.js validate: w.reachMask, 1 m cells) that you can't, walking and jumping:
  // a way between two parts of the area that is shut to you alone (told, not failed: the monsters' map passes over small things)
  DT.navGap = function (w, R) {
    if (!w.reachMask || !w.nf) return null;
    let n = 0, miss = 0; const at = [];
    for (let i = 0; i < w.reachMask.length; i++) {
      if (!w.reachMask[i] || w.nb[i]) continue;
      const c = i % w.N, x = (c % w.Wn) - w.xo + 0.5, z = ((c / w.Wn) | 0) - w.zo + 0.5, y = w.nf[i];
      if (!(y > -50)) continue;
      n++;
      if (!DT.near(R, x, z, 0.8, (yy) => Math.abs(yy - y) < 0.7)) { miss++; if (at.length < 4) at.push([x, +y.toFixed(1), z]); }
    }
    return { n, miss, at };
  };
  // check an area: which of its goals can't be reached (walking for the ways, jumping too for the rest)
  DT.check = function (w, verbose) {
    const t0 = performance.now(), shut = [];
    // what opens as you go: the exits' portcullises (up once the area is cleared), the guardian's stone door (it slides away as you come)
    for (const ex of w.exits || []) if (ex.col && ex.col.alive !== false) { ex.col.alive = false; shut.push(ex.col); }
    if (w.slideDoor && w.slideDoor.col && w.slideDoor.col.alive !== false) { w.slideDoor.col.alive = false; shut.push(w.slideDoor.col); }
    // and the iron gates of the cells (strata.js) and the chapels (fieldgen_t2.js): you open them (reaching them is a goal of its own)
    for (const d of w.doors || []) if (d.col && d.col.alive !== false) { d.col.alive = false; shut.push(d.col); }
    const out = { bad: [], goals: 0, ms: 0 };
    try {
      const walk = DT.reach(w, STEP), jump = DT.reach(w, JUMP);
      for (const gl of DT.goals(w)) {
        out.goals++;
        const R = gl.walk ? walk : jump;
        if (DT.near(R, gl.x, gl.z, gl.r, gl.ok)) continue;
        if (!gl.walk && DT.hook(w, jump, gl)) { out.hook = (out.hook || 0) + 1; continue; }
        const b = { kind: gl.kind, what: gl.what, at: [+gl.x.toFixed(1), gl.y != null ? +gl.y.toFixed(1) : null, +gl.z.toFixed(1)] };
        if (gl.walk) b.jumpOk = !!DT.near(jump, gl.x, gl.z, gl.r, gl.ok);
        if (verbose) {
          const nr = DT.near(R, gl.x, gl.z, 30); b.nearest = nr;
          // what stands about the way in: colliders round the goal (or, for an exit, in its mouth) less than 2.5 m up
          const bx0 = gl.kind === 'exit' ? gl.x - 3 : gl.x - 2.5, bx1 = gl.kind === 'exit' ? gl.x + 3 : gl.x + 2.5, bz0 = gl.kind === 'exit' ? -2 : gl.z - 2.5, bz1 = gl.kind === 'exit' ? 4 : gl.z + 2.5;
          b.near = w.query(bx0, 0.05, bz0, bx1, 2.5, bz1).filter((c) => !c.ghost).slice(0, 14).map((c) => [c.mk || c.surf, [c.x0, c.y0, c.z0, c.x1, c.y1, c.z1].map((v) => +v.toFixed(2)).join(','), c.src || ''].join(' '));
        }
        out.bad.push(b);
      }
      out.reached = walk.n; out.reachedJ = jump.n;
      out.vis = DT.visIn(w);
      out.gap = DT.navGap(w, jump);
    } finally { for (const c of shut) c.alive = true; }
    out.ms = Math.round(performance.now() - t0);
    return out;
  };
}

// ---------------------------------------------------------------- the run
(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.booted();
    await p.eval("G.renderer.render = () => {}; G.renderer.compile = () => {}; G.Warm = null; G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'normal', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await p.running();
    await sleep(500);
    await p.eval('(' + inPage.toString() + ')(); 1');
    if (VERB) await p.eval('DoorT.trace(); 1');
    await p.eval('DoorT.traceVis(); 1');
    const all = await p.eval('JSON.stringify(G.Run.TIERS.flat().filter((f) => G.Run.isField(f)))').then(JSON.parse);
    const list = only.length ? all.filter((k) => only.includes(k)) : all;
    const ROOMS = await p.eval("JSON.stringify(G.Areas.ROOMS.concat(['trial']))").then(JSON.parse);
    const KINDS = opt('kinds', ['combat', 'boss', 'rooms', 'shop'].join(',')).split(',');
    const BOSSES = ['colossus', 'wyrm', 'archon', 'executioner', 'broodmother', 'twins', 'heart', 'hunter', 'drake'];
    console.log('fields:', list.join(' '), '| seeds', SEEDS, '| kinds', KINDS.join(','));
    const t0 = Date.now();
    for (const f of list) {
      const sum = {};
      for (const kind of KINDS) {
        const runs = [];
        for (let s = 0; s < SEEDS; s++) {
          const seed = (20261122 + s * 7919 + f.length * 131) >>> 0, blue = s % 2 === 1;
          // (an area before a guardian or the merchant-only one has a single exit: the second seed; the third guardian is a run's last, no exits)
          const g1 = s % 4 === 1 ? 1 : 3;
          if (kind === 'combat') runs.push({ k: s % 3 === 2 ? 'elite' : 'combat', seed, o: { blue, gates: g1 } });
          else if (kind === 'boss') runs.push({ k: 'boss', seed, o: { blue, boss: BOSSES[(s + f.length) % BOSSES.length], last: s % 5 === 2 } });
          else if (kind === 'shop') runs.push({ k: 'shop', seed, o: { blue, gates: g1 } });
          else if (kind === 'rooms') for (const rk of ROOMS) runs.push({ k: rk, seed: seed + rk.length, o: { blue, gates: g1 } });
          else runs.push({ k: kind, seed, o: { blue } });
        }
        for (const r of runs) {
          const res = await p.eval(`(() => { try { const w = DoorT.build('${f}', '${r.k}', ${r.seed}, ${JSON.stringify(r.o)}); const o = DoorT.check(w, ${VERB}); o.field = w.field; return JSON.stringify(o); } catch (e) { return JSON.stringify({ err: e.message + ' ' + String(e.stack).split('\\n')[1] }); } })()`).then(JSON.parse);
          const key = kind === 'rooms' ? 'rooms' : kind;
          const S = (sum[key] = sum[key] || { n: 0, bad: 0, seeds: new Set(), what: {}, errs: [], ms: 0, vis: 0, vseeds: new Set(), hook: 0 });
          S.n++; S.ms += res.ms || 0; S.hook += res.hook || 0;
          if (res.gap && res.gap.n) { const sh = res.gap.miss / res.gap.n; if (sh > (S.gapMax || 0)) { S.gapMax = sh; S.gapAt = r.k + ' ' + r.seed + ' ' + JSON.stringify(res.gap.at); } }
          if (res.err) { S.errs.push(r.k + ' ' + r.seed + ': ' + res.err); continue; }
          if (res.vis && res.vis.length) {
            S.vis += res.vis.length; S.vseeds.add(r.seed);
            for (const b of res.vis) { const k = r.k + ':drawn in ' + b.what.replace(/ \(x \d+\)/, ''); S.what[k] = (S.what[k] || 0) + 1; }
            if (VERB) for (const b of res.vis) console.log(`  ${f} ${r.k} seed ${r.seed}${r.o.boss ? ' ' + r.o.boss : ''}: drawn in ${b.what} (${b.n})\n      ${b.hit.join('\n      ')}`);
          }
          if (res.bad.length) {
            S.bad += res.bad.length; S.seeds.add(r.seed);
            for (const b of res.bad) { const k = r.k + ':' + b.kind; S.what[k] = (S.what[k] || 0) + 1; }
            if (VERB) for (const b of res.bad) console.log(`  ${f} ${r.k} seed ${r.seed}${r.o.boss ? ' ' + r.o.boss : ''}${r.o.blue ? ' blue' : ''}: ${b.what} at ${JSON.stringify(b.at)}${b.jumpOk != null ? ' (jumping: ' + (b.jumpOk ? 'yes' : 'no') + ')' : ''} nearest ${JSON.stringify(b.nearest)}\n      ${(b.near || []).join('\n      ')}`);
          }
        }
      }
      for (const [k, S] of Object.entries(sum)) {
        console.log(`${f.padEnd(11)} ${k.padEnd(6)} ${S.n} built, ${S.bad} blocked in ${S.seeds.size}${S.vis ? ', ' + S.vis + ' drawn in a mouth in ' + S.vseeds.size : ''}${S.hook ? ', ' + S.hook + ' reached only with the hook' : ''}${S.gapMax > 0.03 ? `, at most ${(S.gapMax * 100).toFixed(1)}% of the monsters' floor not yours (${S.gapAt})` : ''}${S.bad || S.vis ? ' — ' + Object.entries(S.what).map(([a, b]) => a + ' x' + b).join(', ') + ' (seeds ' + [...new Set([...S.seeds, ...S.vseeds])].join(' ') + ')' : ''}  ~${Math.round(S.ms / Math.max(1, S.n))} ms each`);
        check(!S.errs.length, `${f} ${k}: every area builds and is checked${S.errs.length ? ' — ' + S.errs.slice(0, 2).join(' | ') : ''}`);
        check(S.bad === 0, `${f} ${k}: every exit, door, chest, device and ware can be reached from the way in`);
        check(S.vis === 0, `${f} ${k}: nothing drawn stands in an exit, the guardian's door or the way in`);
      }
    }
    // the last guardian's own field (fieldgen.js finalArena: the tiles over the void), the same in every run
    if (!only.length) {
      const res = await p.eval(`(() => { try { const w = DoorT.build('ruin', 'final', 4242, {}); return JSON.stringify(DoorT.check(w, ${VERB})); } catch (e) { return JSON.stringify({ err: e.message }); } })()`).then(JSON.parse);
      check(!res.err && !res.bad.length && !(res.vis || []).length, `the last guardian's field: its tiles reached from the ledge, nothing in its ways${res.err ? ' — ' + res.err : res.bad.length || (res.vis || []).length ? ' — ' + JSON.stringify([res.bad, res.vis]).slice(0, 300) : ''}`);
    }
    console.log('time', Math.round((Date.now() - t0) / 1000), 's');
    const errs = p.errs.filter((e) => !/favicon/.test(e));
    check(errs.length === 0, 'no page errors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));
  } catch (e) { console.log('ERROR', e.stack || e); fails.push('crashed'); }
  finally { await ch.close(); srv.close(); }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
  process.exit(fails.length ? 1 : 0);
})();
