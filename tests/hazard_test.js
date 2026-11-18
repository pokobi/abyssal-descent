'use strict';
// The void and the elements of the surroundings:
//   - walkers never walk, leap or get jostled off an edge into the void on their own (sky islands, the foundry's chasm);
//   - one thrown off by your knockback dies, and its body lies on the nearest ground by the edge (searchable); a flyer shot down
//     over the void too; a body never hangs in the air;
//   - water, lava, an ice sheet and burning oil leave their element on you and on the foes in them (fields.js); the grates in the
//     works' rooms only glow: they burn nothing;
//   - the weather keeps its element on everyone (rain: water, snow: ice, embers: fire), never over another one, and lightning
//     strikes (on a wet foe: 漏電); the falling icicles leave ice (weather.js, fieldgen_t4.js).
//   node tests/hazard_test.js
const path = require('path');
const { serve, launch, sleep } = require('./coop/cdp');
const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.COOP_PORT || 9993;

// ---- in the page (section 6): lava and open fire ----
// enter an area of a field (kind: combat / event ...) on a fixed seed; and H.stand(at, s): the body held at a point for s seconds of game
// time, the fire / lava hits on it counted (src 'aoe'; nothing is taken off), and the burn on it at the end
async function hotEnter(a) {
  const [field, kind, seed] = a, H = window.__H, GM = G.game, P = G.player, C = G.combat, R = G.Run;
  R._f0 = R._f0 || R.field; R.field = () => field; G.Sky.force = ((G.Sky.V[field] || [])[0] || {}).id;
  G.enemies.clear(); GM.seed = seed; GM.area = 11; GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; GM.enterArea(12, kind);
  G.enemies.clear(); GM.objective = null; GM.waves = null; GM.dev = { speed: 1, god: true }; GM.areaCleared = false;
  if (G.Warm && G.Warm.world) G.Warm.world();
  await H.sl(500);
  H.stand = async (at, s) => {
    const hits = [], d0 = C.damagePlayer, own = Object.prototype.hasOwnProperty.call(P, 'postMove'), pm = P.postMove;
    C.damagePlayer = function (amt, info) { if (info && info.src === 'aoe') hits.push([+amt.toFixed(3), GM.time]); return 0; };
    P.postMove = function () { this.pos.copy(at); this.vel.set(0, 0, 0); return pm.apply(this, arguments); };
    P.st = {}; P._lavaT = 0; P._fireT = 0; P.au = null; P.pos.copy(at); P.vel.set(0, 0, 0);
    try { await H.sl(s * 1000); } finally { if (own) P.postMove = pm; else delete P.postMove; C.damagePlayer = d0; }
    const st = { burn: +(P.st.burn || 0).toFixed(2), burnMul: P.st.burnMul || 0, burnLv: P.st.burnLv || 0 };
    P.st = {};
    const gaps = hits.slice(1).map((h, i) => h[1] - hits[i][1]).sort((x, y) => x - y);
    return { n: hits.length, amts: [...new Set(hits.map((h) => h[0]))], gap: gaps.length ? +gaps[gaps.length >> 1].toFixed(2) : 0, st };
  };
  return 1;
}
// a spot in a lava zone the feet stand on at its face, and the body held there 3 s
async function hotLavaIn(z) {
  const w = G.world, V = (x, y, q) => new THREE.Vector3(x, y, q);
  let at = null;
  for (let i = 0; i < 400 && !at; i++) { const x = z.x0 + 0.5 + Math.random() * Math.max(0.01, z.x1 - z.x0 - 1), q = z.z0 + 0.5 + Math.random() * Math.max(0.01, z.z1 - z.z0 - 1); const g = w.groundAt(V(x, (z.y || 0) + 0.5, q), 0.3, 1.2); if (Math.abs(g - (z.y || 0)) < 0.15 && w.boxFree(x - 0.4, g + 0.05, q - 0.4, x + 0.4, g + 1.9, q + 0.4)) at = V(x, g + 0.01, q); }
  if (!at) return { err: 'no foothold' };
  const r = await window.__H.stand(at, 3); r.area = G.game.area; return r;
}
async function hotLava() {
  const out = {};
  await hotEnter(['foundry', 'combat', 777]);
  { const w = G.world, z = w.lavaZones.find((q) => q.lavaDeep && q.x0 === 0 && q.x1 === w.W); out.deep = z ? await hotLavaIn(z) : { err: 'no melt' }; }
  for (const f of ['foundry', 'ruin', 'halls']) {
    if (f !== 'foundry') await hotEnter([f, 'combat', 777]);
    const z = G.world.lavaZones.find((q) => !q.lavaDeep && !q.decor);
    if (!z) continue;
    out.shallow = await hotLavaIn(z); out.shallow.where = f + (z.blue ? ' blue fire' : '') + ' y' + (z.y || 0); break;
  }
  if (!out.shallow) out.shallow = { err: 'no shallow lava in foundry / ruin / halls' };
  return JSON.stringify(out);
}
async function hotFire() {
  await hotEnter(['gate', 'combat', 4242]);
  const w = G.world, P = G.player, V = (x, y, z) => new THREE.Vector3(x, y, z), spots = w.fireSpots || [];
  const br = spots.find((f) => f.k === 'brazier'); if (!br) return JSON.stringify({ err: 'no brazier' });
  const k = br.r / 0.3, base = br.y0 - 0.9 * k;
  const out = { area: G.game.area };
  out.top = await window.__H.stand(V(br.x, base + 1.05 * k + 0.01, br.z), 3);
  out.side = await window.__H.stand(V(br.x + 0.42 * k + P.hw + 0.02, base, br.z), 2);
  // (fireTouch has run by now: each spot marked on / off once)
  const tr = spots.filter((f) => f.k === 'torch'), high = tr.filter((f) => f.y0 - w.floorBelow(f.x, f.y0, f.z) >= P.standH);
  out.torches = { all: tr.length, high: high.length, highOn: high.filter((f) => f.off !== true).length, ran: !!w._fireReach };
  return JSON.stringify(out);
}
async function hotGrate() {
  await hotEnter(['foundry', 'event', 4242]);
  const w = G.world, V = (x, y, z) => new THREE.Vector3(x, y, z), H = window.__H;
  if (w.biome !== 'foundry' || w.field) return JSON.stringify({ err: 'not the works hall: ' + w.biome + ' / ' + w.field });
  // the grates: the glowing melt laid in the floor at the hall's corners (field_rooms.js S.foundry, w.visual 'lava' 2.4 m square, so in w.paved)
  const corners = [[6, 7], [w.W - 6, 7], [6, w.D - 7], [w.W - 6, w.D - 7]];
  const grates = (w.paved || []).filter((q) => Math.abs(q[2] - q[0] - 2.4) < 0.05 && Math.abs(q[3] - q[1] - 2.4) < 0.05 && q[4] < 0.05 && corners.some(([x, z]) => Math.abs((q[0] + q[2]) / 2 - x) < 0.01 && Math.abs((q[1] + q[3]) / 2 - z) < 0.01));
  if (!grates.length) return JSON.stringify({ err: 'no grate' });
  const g = grates[0], cx = (g[0] + g[2]) / 2, cz = (g[1] + g[3]) / 2;
  const out = { area: G.game.area, grates: grates.length, hot: (w.hotZones || []).length };
  out.me = await H.stand(V(cx, 0.06, cz), 3);
  // a foe on the grate, a foe on the floor away from it
  const def = G.ENEMIES.find((d) => !d.flyer && !d.el && !d.boss) || G.ENEMIES[0];
  const mk = (x, z) => { const e = G.enemies.spawn(def, 9, V(x, 0, z), { noLoot: true, noMut: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.au = null; return e; };
  const ox = cx < w.W / 2 ? w.W / 2 : w.W / 2 - 2, oz = w.D / 2;
  const a = mk(cx, cz), b = mk(ox, oz);
  const t0 = G.game.time; while (G.game.time - t0 < 1.5) { a.pos.set(cx, 0.06, cz); b.pos.set(ox, 0, oz); await H.sl(30); }
  out.foeOn = G.Elem.auraOf(a) || null; out.foeOff = G.Elem.auraOf(b) || null; out.foeBurn = +((a.st && a.st.burn) || 0).toFixed(2); out.foeHp = +(a.hp / a.maxHp).toFixed(3);
  G.enemies.clear();
  return JSON.stringify(out);
}

(async () => {
  const srv = await serve(ROOT, PORT), ch = await launch(PORT + 1000);
  const fails = [];
  const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails.push(what); };
  try {
    const p = await ch.page(`http://127.0.0.1:${PORT}/index.html?pc=1`);
    await p.until("window.G && G.game && G.game.state === 'title'", 90000);
    await p.booted();
    await p.eval("G.save.data.settings.askTutorial = false; G.save.data.settings.volume = 0; G.sfx.setVolume(0); G.game.startRun({ id: 'hard', lv: 0 }, 0); 1");
    await p.until('!!G.game.run && !!G.world', 30000);
    await p.running();
    await sleep(600);
    // helpers in the page: enter an area of a field (with a mood), cells next to the void, a walker / flyer of the area's level
    await p.eval(`(() => {
      const H = window.__H = {};
      // (waits run on the game's own clock: right after an area is built, or under load, it runs behind the wall clock)
      H.sl = (ms) => new Promise((res) => { const g0 = G.game.time, r0 = performance.now(); const tick = () => { if (G.game.time - g0 >= ms / 1000 || performance.now() - r0 > ms * 8 + 4000) res(); else setTimeout(tick, 15); }; tick(); });
      // (seed: the area built on that seed, the same layout every time, the run's own seed kept for the rest; none: the run's, a new one each run)
      H.enter = (field, mood, seed) => { const R = G.Run, GM = G.game, s0 = GM.seed; R._f0 = R._f0 || R.field; R.field = () => field; G.Sky.force = mood || ((G.Sky.V[field] || [])[0] || {}).id;
        if (seed != null) GM.seed = seed;
        G.enemies.clear(); GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; GM.enterArea(9, 'combat'); GM.seed = s0; G.enemies.clear(); GM.objective = null; GM.waves = null; GM.dev = { speed: 1 }; GM.areaCleared = false;
        if (G.Warm && G.Warm.world) G.Warm.world(); }; // (its shaders compiled now, as the game does behind the fade between areas)
      H.edgeCells = () => { const w = G.world, out = [];
        for (let z = 2; z < w.Dn - 2; z++) for (let x = 2; x < w.Wn - 2; x++) { const i = z * w.Wn + x; if (w.nb[i] || w.nf[i] < -0.5 || w.nf[i] > 0.5 || w.npen[i] > 0.36 || (w.reachMask && !w.reachMask[i])) continue;
          const px = x - w.xo + 0.5, pz = z - w.zo + 0.5; let v = null;
          for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (w.voidBelow(px + dx, 0.5, pz + dz)) { v = [dx / 2, dz / 2]; break; }
          if (v) out.push({ x: px, y: w.nf[i], z: pz, vx: v[0], vz: v[1] }); }
        return out; };
      // from edge cell c out along (vx, vz): how far to the void, or what stops a body on the way first (a wall at body height, floor no
      // foe may be on: E.walkOk) - [kind, m]
      H.wayOut = (c, max) => { const w = G.world;
        for (let d = 0; d <= (max || 3); d += 0.1) { const x = c.x + c.vx * d, z = c.z + c.vz * d;
          if (w.voidBelow(x, c.y, z)) return ['void', +d.toFixed(1)];
          if (!w.boxFree(x - 0.35, c.y + 0.5, z - 0.35, x + 0.35, c.y + 1.7, z + 0.35)) return ['wall', +d.toFixed(1)];
          if (!G.enemies.walkOk(x, z, c.y)) return ['noWalk', +d.toFixed(1)]; }
        return ['none', max || 3]; };
      // edge cells in turn from a third of the way along (as the test always took), the first that passes ok(c)
      H.edgePick = (ok) => { const edge = H.edgeCells(), n = edge.length; for (let k = 0; k < n; k++) { const c = edge[(Math.floor(n / 3) + k) % n]; if (ok(c)) return c; } return null; };
      // a spot on dry, plain ground (no water, lava or field patch under it, not a floor of ice: the frozen lake's ice leaves ice of its own)
      H.dry = (x, z, k) => { const w = G.world, y = w.nf[k]; return ![...w.waterZones, ...w.lavaZones, ...(w.fields || [])].some((q) => x > q.x0 - 1.5 && x < q.x1 + 1.5 && z > q.z0 - 1.5 && z < q.z1 + 1.5 && y < (q.y || 0) + 0.4) && !w.query(x - 1, y - 0.1, z - 1, x + 1, y + 0.01, z + 1).some((c) => c.surf === 'ice'); };
      H.walkers = () => G.ENEMIES.filter((d) => !d.special && !d.flyer && !d.hover && !d.custom && !d.boss && !d.burrow && (!d.fields || d.fields.includes(G.world.field)) && (d.unlockK ?? 0) <= 2);
      H.falls = 0; const k0 = G.combat.killEnemy; G.combat.killEnemy = function (e, info, o) { if (info && info.src === 'fall') H.falls++; return k0.apply(this, arguments); };
      return 1; })()`);

    // ---------------- 1) nobody walks off into the void ----------------
    for (const field of ['sanctum', 'foundry']) {
      for (const control of [false, false, true]) { // (twice with the rule, on two different layouts; once without it)
        const r = await p.eval(`(async () => {
          const H = window.__H, P = G.player, w0 = () => G.world; H.enter('${field}');
          await H.sl(400);
          const w = w0(); if (${control}) w.edgeSafe = () => true; // (control: the old behaviour, to see the scene does push foes off)
          const edge = H.edgeCells(); if (edge.length < 20) return JSON.stringify({ err: 'few edge cells ' + edge.length });
          // you stand on an edge; the foes on edges across the void from you, and a few right next to you
          // (the edge cell with the most edge cells across the void from it)
          const acrossOf = (me) => edge.filter((c) => { const d = Math.hypot(c.x - me.x, c.z - me.z); return d > 6 && d < 22 && w.voidBelow((c.x + me.x) / 2, 0.5, (c.z + me.z) / 2); });
          let me = edge[0], across = [];
          for (let k = 0; k < 40; k++) { const c = edge[Math.floor((k + 0.5) * edge.length / 40)]; const a = acrossOf(c); if (a.length > across.length) { me = c; across = a; } }
          P.pos.set(me.x, me.y + 0.05, me.z); P.vel.set(0, 0, 0); G.game.dev.god = true;
          const nearMe = edge.filter((c) => { const d = Math.hypot(c.x - me.x, c.z - me.z); return d > 1.5 && d < 6; });
          const defs = H.walkers(); let n = 0;
          const pick = (arr, k) => { for (let i = 0; i < k && arr.length; i++) { const c = arr[(i * 7 + 3) % arr.length]; const e = G.enemies.spawn(defs[(n++ * 5) % defs.length], 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true }); if (e) { e.state = 'chase'; e.aware = true; } } };
          pick(across, 10); pick(nearMe, 5);
          // the field's own leapers too (the drowned grab, the bonecrawler pounce ...)
          for (const d of G.ENEMIES.filter((d) => d.fields && d.fields.includes('${field}') && !d.flyer)) { const c = nearMe[n % Math.max(1, nearMe.length)] || me; const e = G.enemies.spawn(d, 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true }); if (e) { e.state = 'chase'; e.aware = true; } n++; }
          H.falls = 0; const spawned = G.enemies.list.filter((e) => e.alive).length;
          for (let t = 0; t < 120; t++) { await H.sl(100); P.hp = P.stats.maxHp; for (const e of G.enemies.list) if (e.alive && e.hp < e.maxHp) e.hp = e.maxHp; }
          const over = G.enemies.list.filter((e) => e.alive && !e.flyer && w.voidBelow(e.pos.x, e.pos.y, e.pos.z)).length;
          const res = { spawned, falls: H.falls, over };
          G.game.dev.god = false; G.enemies.clear(); delete w.edgeSafe;
          return JSON.stringify(res);
        })()`).then(JSON.parse);
        console.log(field, control ? '(control, no edge rule)' : '', JSON.stringify(r));
        if (r.err) { check(false, `${field}: set up (${r.err})`); continue; }
        if (!control) check(r.falls === 0 && r.over === 0 && r.spawned >= 10, `${field}: ${r.spawned} walkers chase you along the edges for 12 s and none falls into the void (${r.falls} fell)`);
      }
    }

    // ---------------- 2) thrown off by your blow: it dies, its body lies by the edge ----------------
    // (each on one fixed layout; the edge it is thrown off has a clear way out to the void - no railing, pillar or ledge in between - and
    // you stand 4 m back from it, never on the foe's own cell)
    for (const [field, seed] of [['sanctum', 2], ['foundry', 3]]) {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player; H.enter('${field}', null, ${seed}); await H.sl(400);
        const w = G.world, back = (c) => [c.x - c.vx * 4, c.y + 0.05, c.z - c.vz * 4];
        const c = H.edgePick((c) => { const wo = H.wayOut(c, 2.5), b = back(c); return wo[0] === 'void' && w.boxFree(b[0] - 0.3, b[1] + 0.1, b[2] - 0.3, b[0] + 0.3, b[1] + 1.8, b[2] + 0.3) && !w.voidBelow(b[0], c.y, b[2]); });
        if (!c) return JSON.stringify({ err: 'no edge with a clear way out to the void' });
        P.pos.set(...back(c)); P.vel.set(0, 0, 0); G.game.dev.god = true;
        const def = H.walkers()[2];
        const e = G.enemies.spawn(def, 9, new THREE.Vector3(c.x, c.y, c.z), {}); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        H.falls = 0;
        // knocked toward the void until it is out over it (then it falls)
        for (let i = 0; i < 40 && e.alive && !w.voidBelow(e.pos.x, e.pos.y, e.pos.z); i++) { e.knockback(new THREE.Vector3(c.vx, 0, c.vz), 9); await H.sl(100); }
        for (let i = 0; i < 60 && e.alive; i++) await H.sl(100);
        await H.sl(600);
        const corpse = G.Inv.corpses.find((k) => k.e === e);
        const res = { fell: H.falls, alive: e.alive, corpse: !!corpse, y: +e.pos.y.toFixed(2), overVoid: w.voidBelow(e.pos.x, e.pos.y, e.pos.z), dEdge: +Math.hypot(e.pos.x - c.x, e.pos.z - c.z).toFixed(1), aboveFloor: +(e.pos.y - w.floorBelow(e.pos.x, e.pos.y + 0.3, e.pos.z)).toFixed(2) };
        // (still standing: where, and what lies from there on toward the void)
        if (e.alive) res.stuck = { at: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)], from: [c.x, c.z, c.vx, c.vz], way: H.wayOut({ x: e.pos.x, y: e.pos.y, z: e.pos.z, vx: c.vx, vz: c.vz }, 3), st: e.state, kbT: +(e.kbT || 0).toFixed(2), r: e.radius };
        G.game.dev.god = false; return JSON.stringify(res);
      })()`).then(JSON.parse);
      console.log(field, 'knocked off:', JSON.stringify(r));
      if (r.err) { check(false, `${field}: set up (${r.err})`); continue; }
      check(r.fell === 1 && !r.alive, `${field}: your knockback can still throw a foe into the void (it dies)`);
      check(r.corpse && !r.overVoid && r.aboveFloor < 0.1 && r.dEdge < 8, `${field}: its body lies on the ground by the edge, ${r.dEdge} m from where it went over, and can be searched`);
      // a flyer shot down over the void
      const f = await p.eval(`(async () => {
        const H = window.__H, P = G.player, w = G.world, edge = H.edgeCells();
        const c = edge.slice(Math.floor(edge.length * 0.6)).concat(edge).find((c) => w.voidBelow(c.x + c.vx * 3, c.y + 2.5, c.z + c.vz * 3)) || edge[Math.floor(edge.length * 0.6)]; // (one with the void 3 m out from it, where the flyer is put)
        const def = G.ENEMIES.find((d) => d.flyer && !d.special && !d.fields && (d.unlockK ?? 0) <= 2);
        const at = new THREE.Vector3(c.x + c.vx * 3, c.y + 2.5, c.z + c.vz * 3);
        const e = G.enemies.spawn(def, 9, at, {}); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        await H.sl(150); const was = w.voidBelow(e.pos.x, e.pos.y, e.pos.z);
        G.combat.damageEnemy(e, e.maxHp * 10, { src: 'bullet' });
        await H.sl(2500);
        const corpse = G.Inv.corpses.find((k) => k.e === e);
        return JSON.stringify({ def: def.id, was, alive: e.alive, corpse: !!corpse, overVoid: w.voidBelow(e.pos.x, e.pos.y, e.pos.z), aboveFloor: +(e.pos.y - w.floorBelow(e.pos.x, e.pos.y + 0.3, e.pos.z)).toFixed(2) });
      })()`).then(JSON.parse);
      console.log(field, 'flyer shot down over the void:', JSON.stringify(f));
      check(f.was && !f.alive && f.corpse && !f.overVoid && f.aboveFloor < 0.5, `${field}: a ${f.def} shot down over the void comes to lie on the ground (searchable)`);
    }
    // a body killed in the air over solid ground drops on to it
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player; H.enter('flooded'); await H.sl(400);
        const w = G.world, c = w.randomOpenCell(G.game.arng, (x, z, i) => !w.reachMask || w.reachMask[i]);
        const e = G.enemies.spawn(H.walkers()[1], 9, new THREE.Vector3(c.x, c.y, c.z), {}); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        await H.sl(300); e.pos.y += 3; e.vel.y = 0; G.combat.damageEnemy(e, e.maxHp * 10, { src: 'bullet' });
        await H.sl(1800);
        return JSON.stringify({ alive: e.alive, aboveFloor: +(e.pos.y - w.floorBelow(e.pos.x, e.pos.y + 0.3, e.pos.z)).toFixed(2) });
      })()`).then(JSON.parse);
      check(!r.alive && r.aboveFloor < 0.05, `a foe killed 3 m up in the air drops to the floor (${r.aboveFloor} m above it)`);
    }

    // ---------------- 3) the elements of the ground ----------------
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem; H.enter('flooded'); await H.sl(500);
        const w = G.world, out = {};
        G.game.dev.god = true;
        // stand somewhere in the water that covers the floor (no field patch: the flooded halls' own water), with nothing there to
        // stand on (a crate or a slab out of the water is dry: it is not in the nav, so look at the colliders)
        const wz = w.waterZones[0];
        let at = null; for (let k = 0; k < 400 && !at; k++) { const c = w.randomOpenCell(G.game.arng, (x, z, i) => (!w.reachMask || w.reachMask[i]) && Math.abs(w.nf[i] - ((wz.y || 0) - (wz.deep || 0))) < 0.1 && x > wz.x0 + 1 && x < wz.x1 - 1 && z > wz.z0 + 1 && z < wz.z1 - 1 && w.boxFree(x - 0.5, 0.05, z - 0.5, x + 0.5, 1.8, z + 0.5)); if (c) at = c; }
        if (!at) return JSON.stringify({ err: 'no water spot' });
        const place = async (x, y, z, kind) => {
          P.au = null; P.pos.set(x, y + 0.02, z); P.vel.set(0, 0, 0);
          const e = G.enemies.spawn(H.walkers()[0], 9, new THREE.Vector3(x + 1.2, y, z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.au = null;
          P.st.burn = kind === 'water' ? 3 : 0;
          await H.sl(900);
          out[kind] = { me: EL.playerAura(), foe: EL.auraOf(e), burnOut: P.st.burn <= 0 };
          e.alive = false; e.remove(); G.enemies.clear();
        };
        await place(at.x, at.y, at.z, 'water');
        // patches laid down here for the test: lava, an ice sheet, oil set alight
        const F = G.Fields, spot = (dx) => [at.x + dx, at.z];
        for (const [kind, dx] of [['lava', 0], ['ice', 0], ['oil', 0]]) {
          // (a dry stretch of floor: the walkway or the landing)
          let d = null; for (let k = 0; k < 400 && !d; k++) { const c = w.randomOpenCell(G.game.arng, (x, z, i) => (!w.reachMask || w.reachMask[i]) && !w.waterZones.some((q) => x > q.x0 - 3 && x < q.x1 + 3 && z > q.z0 - 3 && z < q.z1 + 3) && w.npen[i] < 0.1 && w.boxFree(x - 0.5, w.nf[i] + 0.05, z - 0.5, x + 0.5, w.nf[i] + 1.8, z + 0.5)); if (c) d = c; }
          if (!d) { out[kind] = { err: 'no dry spot' }; continue; }
          const f = F.add(w, kind, d.x - 2.5, d.z - 2.5, d.x + 2.5, d.z + 2.5, { y: d.y });
          if (kind === 'oil') F.ignite(f);
          await place(d.x, d.y, d.z, kind);
          w.fields.splice(w.fields.indexOf(f), 1); const lz = w.lavaZones.indexOf(f); if (lz >= 0) w.lavaZones.splice(lz, 1);
        }
        G.game.dev.god = false; P.st.burn = 0;
        return JSON.stringify(out);
      })()`).then(JSON.parse);
      console.log('ground:', JSON.stringify(r));
      if (r.err) check(false, 'ground: set up (' + r.err + ')');
      else {
        check(r.water.me === 'water' && r.water.foe === 'water' && r.water.burnOut, `the flooded halls' water: water on you and on the foe in it, and your burning goes out (${JSON.stringify(r.water)})`);
        check(r.lava.me === 'fire' && r.lava.foe === 'fire', `lava: fire on you and on the foe on it (${JSON.stringify(r.lava)})`);
        check(r.ice.me === 'ice' && r.ice.foe === 'ice', `an ice sheet: ice on you and on the foe on it (${JSON.stringify(r.ice)})`);
        check(r.oil.me === 'fire' && r.oil.foe === 'fire', `burning oil: fire on you and on the foe in it (${JSON.stringify(r.oil)})`);
      }
    }

    // ---------------- 4) the weather ----------------
    // (each on one fixed layout; each foe in the open as the weather itself sees it - weather.js roofed at the foe, its own height -
    // and on dry, plain ground; no mutation on it: 無効化 takes no element)
    for (const [field, mood, el, seed] of [['grave', 'rain', 'water', 21], ['grave', 'snow', 'ice', 22], ['halls', 'ember', 'fire', 23], ['frozen', 'snow', 'ice', 24], ['flooded', 'drip', 'water', 25]]) {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem, Wx = G.Weather; H.enter('${field}', '${mood}', ${seed}); await H.sl(300);
        const w = G.world; G.game.dev.god = true; P.au = null;
        const es = []; for (let i = 0; i < 3; i++) for (let tries = 0; tries < 20; tries++) {
          const c = w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && !Wx.roofed(x, w.nf[k], z, 2.4)); /* (in the open: under a roof the sky does not reach) */
          const e = G.enemies.spawn(H.walkers()[i], 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true, noMut: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
          if (tries < 19 && Wx.roofed(e.pos.x, e.pos.y, e.pos.z, e.height || 1.7)) { e.remove(); G.enemies.list.splice(G.enemies.list.indexOf(e), 1); continue; }
          es.push(e); break; }
        const other = '${el}' === 'fire' ? 'ice' : 'fire'; EL.setAura(es[2], other, 30); // (an element of the player's on a foe: the weather leaves it alone)
        await H.sl(3600);
        const res = { mood: w.sky && w.sky.id, el: w.sky && w.sky.el, me: EL.playerAura(), foes: es.map((e) => EL.auraOf(e)) };
        // (a foe without the weather's element: what about it)
        res.odd = es.slice(0, 2).filter((e) => EL.auraOf(e) !== '${el}').map((e) => ({ id: e.def.id, alive: e.alive, at: [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2)], h: e.height, roofed: Wx.roofed(e.pos.x, e.pos.y, e.pos.z, e.height || 1.7), auFix: e.auFix || null, mut: e.mut ? Object.keys(e.mut) : null, bare: e._envBare || 0, t: +G.game.time.toFixed(2) }));
        G.game.dev.god = false; G.enemies.clear(); return JSON.stringify(res);
      })()`).then(JSON.parse);
      console.log(field, mood, JSON.stringify(r));
      check(r.mood === mood && r.el === el && r.me === el && r.foes[0] === el && r.foes[1] === el && r.foes[2] === (el === 'fire' ? 'ice' : 'fire'), `${field} «${mood}»: ${el} on you and on every foe, but never over another element (${JSON.stringify(r.foes)})`);
    }
    // a mood that does not fall (fog) leaves nothing
    {
      const r = await p.eval(`(async () => { const H = window.__H, P = G.player; H.enter('grave', 'mist'); await H.sl(300); P.au = null; G.game.dev.god = true; await H.sl(3200); G.game.dev.god = false; return JSON.stringify({ el: G.world.sky.el || null, me: G.Elem.playerAura() }); })()`).then(JSON.parse);
      check(!r.el && !r.me, `grave «mist»: no element (${JSON.stringify(r)})`);
    }
    // lightning: a bolt on a wet foe is 漏電; on you it hurts and leaves volt; in a storm they keep coming while you fight
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem, Wx = G.Weather; H.enter('grave', 'rain'); await H.sl(300);
        const w = G.world; P.au = null; P.hp = P.stats.maxHp; P.invulnT = 0;
        const c = w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && Math.hypot(x - P.pos.x, z - P.pos.z) > 8);
        const e = G.enemies.spawn(H.walkers()[0], 9, new THREE.Vector3(c.x, c.y, c.z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99;
        await H.sl(3600);
        const wet = EL.auraOf(e), hp0 = e.hp;
        Wx.boltAt(e.pos.clone().setY(w.floorBelow(e.pos.x, e.pos.y + 1, e.pos.z)));
        await H.sl(200);
        const leak = (e.st.leak || 0) > 0, took = Math.round(hp0 - e.hp);
        const meWet = EL.playerAura(), mhp = P.hp; P.invulnT = 0;
        Wx.boltAt(P.pos.clone().setY(w.floorBelow(P.pos.x, P.pos.y + 1, P.pos.z)));
        await H.sl(200);
        const res = { wet, leak, took, meWet, hurt: Math.round(mhp - P.hp), myLeak: (P.elLeak || 0) > 0 };
        // natural bolts during a fight (a fresh foe that the bolts never wear down). A bolt is tried every 6-13 s, by you or by a foe within
        // 30 m of you, on open ground under the sky (weather.js spotNear); a try that finds no such spot is lost. So you stand out in the
        // open (no roof over you or 3 m round you) and the foe 6-25 m off: where you came in may be under the gate's arch
        G.game.dev.god = true; G.game.areaCleared = false;
        const sky = (x, y, z) => !Wx.roofed(x, y, z, 1.8) && w.boxFree(x - 0.3, y + 0.1, z - 0.3, x + 0.3, y + 1.8, z + 0.3) && w.floorBelow(x, y + 1.5, z) > w.killY;
        const cp = w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && Math.hypot(x - e.pos.x, z - e.pos.z) > 4 && [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dz]) => sky(x + dx, w.nf[k], z + dz)));
        if (cp) { P.pos.set(cp.x, cp.y + 0.05, cp.z); P.vel.set(0, 0, 0); }
        const c2 = w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && Math.hypot(x - P.pos.x, z - P.pos.z) > 6 && Math.hypot(x - P.pos.x, z - P.pos.z) < 25) || w.randomOpenCell(G.game.arng, (x, z, k) => (!w.reachMask || w.reachMask[k]) && H.dry(x, z, k) && Math.hypot(x - P.pos.x, z - P.pos.z) > 6);
        const e2 = G.enemies.spawn(H.walkers()[1], 9, new THREE.Vector3(c2.x, c2.y, c2.z), { noLoot: true }); e2.state = 'idle'; e2.speed = 0; e2.atkCd = 99;
        const s0 = Wx.strikes; for (let i = 0; i < 300 && Wx.strikes - s0 < 1; i++) { await H.sl(100); for (const o of [e, e2]) if (o.alive) o.hp = o.maxHp; }
        res.natural = Wx.strikes - s0; G.game.dev.god = false; G.enemies.clear();
        return JSON.stringify(res);
      })()`).then(JSON.parse);
      console.log('lightning:', JSON.stringify(r));
      check(r.wet === 'water' && r.leak && r.took > 0, `a bolt on a foe wet from the rain: it takes damage and 漏電 runs through it (${r.took})`);
      check(r.meWet === 'water' && r.hurt > 0 && r.myLeak, `a bolt on you in the rain: it hurts (${r.hurt}) and 漏電 runs through you`);
      check(r.natural >= 1, `in the rain bolts come down by themselves while you fight (${r.natural} within 30 s)`);
    }
    // the falling icicles leave ice
    {
      const r = await p.eval(`(async () => {
        const H = window.__H, P = G.player, EL = G.Elem; H.enter('frozen'); await H.sl(400);
        const w = G.world; P.au = null; P.hp = P.stats.maxHp; P.invulnT = 0;
        const e = G.enemies.spawn(H.walkers()[0], 9, new THREE.Vector3(P.pos.x + 0.6, P.pos.y, P.pos.z), { noLoot: true }); e.state = 'idle'; e.speed = 0; e.atkCd = 99; e.au = null;
        w.icicles.next = 99; w.icicles.falls = [{ p: new THREE.Vector3(P.pos.x, 0.02, P.pos.z), t: 0, T: 0.05, r: 1.8 }];
        await H.sl(400);
        const res = { me: EL.playerAura(), foe: EL.auraOf(e) }; G.enemies.clear(); return JSON.stringify(res);
      })()`).then(JSON.parse);
      check(r.me === 'ice' && r.foe === 'ice', `a falling icicle leaves ice on you and on the foe it hits (${JSON.stringify(r)})`);
    }
    // ---------------- 5) a guardian's hall: always the field's own sky, no weather ----------------
    {
      const r = await p.eval(`(async () => {
        const S = G.Sky, bad = [];
        for (const k of Object.keys(S.V)) for (const n of [5, 10, 15, 20]) for (const f of [null, 'rain', 'snow', 'ember', 'storm']) {
          S.force = f; const v = S.choose({ isBoss: true, field: k }, n, 'boss');
          if (v !== S.V[k][0] || v.el || v.bolt || v.flash || (v.p && v.p.length)) bad.push(k + ':' + n + ':' + f + '->' + (v && v.id));
        }
        // and in a real one: the graveyard's guardian with the rain asked for
        const H = window.__H, R = G.Run, GM = G.game, P = G.player; R._f0 = R._f0 || R.field; R.field = () => 'grave'; S.force = 'rain';
        let n = 1; while (!R.isBoss(n)) n++;
        G.enemies.clear(); GM.transitioning = false; G.ui.clearScreen(); GM.state = 'playing'; P.au = null; GM.enterArea(n, 'boss'); GM.dev = { speed: 1, god: true };
        await H.sl(2500);
        const w = G.world, res = { bad, isBoss: !!w.isBoss, mood: w.sky && w.sky.id, me: G.Elem.playerAura(), pending: G.Weather.pending(), strikes0: G.Weather.strikes };
        GM.dev.god = false; S.force = null; return JSON.stringify(res);
      })()`).then(JSON.parse);
      check(!r.bad.length, `a guardian's hall always draws the field's own sky, whatever is asked (${r.bad.slice(0, 4).join(', ')})`);
      check(r.isBoss && r.mood === 'clear' && !r.me && !r.pending, `the graveyard's guardian hall stays under the plain moon even with rain asked for: no element on you, no bolt (${JSON.stringify(r)})`);
    }
    // ---------------- 6) lava and open fire: how much they hurt, the burn they leave, which lava is deep ----------------
    {
      await p.eval([hotEnter, hotLavaIn, hotLava, hotFire, hotGrate].map((f) => 'window.' + f.name + ' = ' + f.toString() + ';').join('\n') + ' 1');
      // which lava is deep (lavaDeep: the foundry's lake of melt, the great spiral's bottom - nothing else)
      for (const field of ['foundry', 'halls', 'ruin']) {
        const r = JSON.parse(await p.eval('hotEnter(' + JSON.stringify([field, 'combat', 777]) + ').then(() => JSON.stringify(G.world.lavaZones.map((z) => ({ deep: !!z.lavaDeep, y: +(z.y || 0).toFixed(2), full: z.x0 === 0 && z.x1 === G.world.W, decor: !!z.decor }))))'));
        const want = (z) => (field === 'foundry' ? z.full : z.y < -0.5);
        const wrong = r.filter((z) => z.deep !== want(z));
        console.log(field, 'lava zones:', JSON.stringify(r.map((z) => (z.deep ? 'deep' : 'shallow') + (z.decor ? '/decor' : '') + ' y' + z.y)));
        check(r.some((z) => z.deep) && !wrong.length, `${field}: lavaDeep only on ${field === 'foundry' ? 'the lake of melt under the works' : 'the bottom of the great spiral'} (${r.filter((z) => z.deep).length} deep, ${r.length - r.filter((z) => z.deep).length} shallow${wrong.length ? ', wrong: ' + JSON.stringify(wrong) : ''})`);
      }
      // standing in deep lava (the foundry's melt) and in shallow lava (anything else on the ground)
      const lava = JSON.parse(await p.eval('hotLava()'));
      console.log('lava:', JSON.stringify(lava));
      for (const [k, dmg, st, what] of [['deep', [5, 0.6], [5, 4, 3], "the foundry's lake of melt"], ['shallow', [2.5, 0.3], [2, 1.5, 1], 'shallow lava (' + (lava.shallow && lava.shallow.where) + ')']]) {
        const r = lava[k];
        if (!r || r.err) { check(false, `${k} lava: set up (${r && r.err})`); continue; }
        const want = +(dmg[0] + dmg[1] * r.area).toFixed(3);
        // (the ticks carry what a frame overshoots over to the next, so that the count is the same at any refresh rate: one gap is a frame
        // shorter or longer than the interval, and their middle may fall a frame under it - 0.4 s is 0.383 / 0.4 at 60 Hz)
        check(r.n >= 4 && r.amts.length === 1 && Math.abs(r.amts[0] - want) < 0.01 && r.gap > 0.37 && r.gap < 0.5, `${what}: ${want} (${dmg[0]}+${dmg[1]}a) every 0.4 s while you stand in it (${r.n} hits of ${JSON.stringify(r.amts)}, every ${r.gap} s)`);
        check(r.st.burn > st[0] - 0.5 && r.st.burn <= st[0] && r.st.burnMul === st[1] && r.st.burnLv === st[2], `${what}: it sets you alight at ${st.join('/')} (burn / its strength / its level: ${JSON.stringify(r.st)})`);
      }
      // a brazier: on its basket, fire; right beside it, none. A torch out of reach is left out
      const fire = JSON.parse(await p.eval('hotFire()'));
      console.log('fire:', JSON.stringify(fire));
      if (fire.err) check(false, 'brazier: set up (' + fire.err + ')');
      else {
        const want = +(1.5 + 0.15 * fire.area).toFixed(3);
        check(fire.top.n >= 4 && fire.top.amts.length === 1 && Math.abs(fire.top.amts[0] - want) < 0.01 && fire.top.gap > 0.47 && fire.top.gap < 0.6, `standing on a brazier's basket: ${want} (1.5+0.15a) fire every 0.5 s (${fire.top.n} hits of ${JSON.stringify(fire.top.amts)}, every ${fire.top.gap} s)`);
        check(fire.top.st.burn > 1.5 && fire.top.st.burn <= 2 && fire.top.st.burnMul === 1 && fire.top.st.burnLv === 1, `... and a mild burn (${JSON.stringify(fire.top.st)})`);
        check(fire.side.n === 0 && !fire.side.st.burn, `right beside the brazier: nothing (${fire.side.n} hits)`);
        check(fire.torches.high > 0 && fire.torches.highOn === 0, `torches out of reach (flame 1.8 m or more over the floor) are left out: ${fire.torches.high} of ${fire.torches.all}, ${fire.torches.highOn} left in`);
      }
      // a hall of the works (the foundry's rooms: the merchant's hall, the forge, the shrine, an event ...): the melt glows through the grates at
      // its corners, but in no room does it burn (2026-11-19: nothing on a room's floor hurts) - no hot zone, no hit, no burn, no element
      const grate = JSON.parse(await p.eval('hotGrate()'));
      console.log('grate:', JSON.stringify(grate));
      if (grate.err) check(false, 'grate: set up (' + grate.err + ')');
      else {
        check(grate.hot === 0, `the works' rooms lay no burning floor (${grate.hot} hot zones; ${grate.grates} grates glow)`);
        check(grate.me.n === 0 && !(grate.me.st.burn > 0), `standing on a grate 3 s: no hit, no burn (${grate.me.n} hits, ${JSON.stringify(grate.me.st)})`);
        check(!grate.foeOn && !grate.foeOff && !(grate.foeBurn > 0) && grate.foeHp === 1, `a foe on the grate gets no element, no burn, no harm, nor one on the floor by it (${grate.foeOn}, ${grate.foeOff}, burn ${grate.foeBurn}, hp ${grate.foeHp})`);
      }
    }
    check(p.errs.length === 0, `no page errors${p.errs.length ? ' — ' + p.errs.slice(0, 3).join(' | ').slice(0, 500) : ''}`);
  } catch (e) { console.log('crashed', e && e.message || e); fails.push('crashed'); }
  finally { ch.close(); srv.close(); }
  console.log(fails.length ? `\nHAZARD TEST FAILED (${fails.length})` : '\nHAZARD TEST PASSED');
  process.exit(fails.length ? 1 : 0);
})();
