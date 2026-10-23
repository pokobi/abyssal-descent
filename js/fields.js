'use strict';
// Field gimmicks: patches of ground that change how you (and the monsters) move and fight.
//   water   — slows a little, puts out burning, wet foes take +50% shock damage
//   lava    — sets the player alight (monsters are not hurt by it)
//   moss    — slippery footing, slides go faster
//   ice     — very slippery
//   mud     — heavy: slow walking, weak jumps (foes are slowed too)
//   poison  — poisons whatever wades through
//   holy    — a sacred spring: heals you while you stand in it, until it runs dry
//   oil     — harmless... until fire or an explosion touches it, then it burns for a while
//   thorns  — cuts whoever pushes through (you only when moving), slows
//   vent    — an updraft that throws you (and foes) high into the air
(function () {
  const F = (G.Fields = {});
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  F.KINDS = {
    water: { name: '浅瀬', icon: '💧', tip: '浅瀬：少し遅くなる・炎上が消える・濡れた敵は電撃に弱い' },
    lava: { name: '溶岩', icon: '🌋', tip: '溶岩：踏むと激しく燃える' },
    // (a blue-flame patch is a 'lava' field with blue = true: the same burning, in the ruined depths)
    moss: { name: '苔', icon: '🌿', tip: '苔：足が滑る・スライディングが伸びる' },
    ice: { name: '氷床', icon: '❄️', tip: '氷床：とても滑る' },
    mud: { name: '泥沼', icon: '🟫', tip: '泥沼：移動とジャンプが重くなる（敵も遅くなる）' },
    poison: { name: '毒沼', icon: '☠️', tip: '毒沼：浸かると毒を受ける（敵も）' },
    holy: { name: '聖泉', icon: '✨', tip: '聖泉：立っている間HPが回復する（枯れるまで）' },
    oil: { name: '油溜まり', icon: '🛢️', tip: '油溜まり：炎や爆発で引火し、しばらく燃え続ける' },
    thorns: { name: '茨の茂み', icon: '🌵', tip: '茨：動くと傷つく・遅くなる（敵も傷つく）' },
    vent: { name: '上昇気流', icon: '🌀', tip: '上昇気流：乗ると高く打ち上げられる' },
  };
  // which gimmicks each biome likes (plus a little of everything)
  const BIOME = {
    flooded: ['water', 'water', 'moss', 'mud'], forge: ['lava', 'oil', 'oil', 'vent'], frozen: ['ice', 'ice', 'water', 'vent'],
    temple: ['moss', 'thorns', 'water'], catacombs: ['poison', 'oil', 'mud'], ruins: ['moss', 'mud', 'thorns', 'water'],
    bloodmoon: ['thorns', 'poison', 'mud', 'oil'], sky: ['vent', 'vent', 'moss'], void: ['poison', 'vent', 'ice'], abyss: ['poison', 'lava', 'vent'],
  };
  const ANY = ['water', 'moss', 'mud', 'poison', 'oil', 'thorns', 'vent', 'ice', 'lava'];

  // ---------------- placement (levelgen, normal areas) ----------------
  F.place = function (w, rng, occ, W, D, area) {
    w.fields = w.fields || [];
    const pool = BIOME[w.biome] || ANY;
    // rare: nothing in the early areas (1-10), then only about one area in four has a patch (very rarely two)
    if (area <= 10 || !rng.chance(0.25)) return;
    const n = rng.chance(0.15) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      let kind = rng.chance(0.75) ? rng.pick(pool) : rng.pick(ANY);
      if (kind === 'vent') {
        const r = occ.place(rng, 3, 3, 2); if (!r) continue;
        F.add(w, 'vent', r.x0 + 0.6, r.z0 + 0.6, r.x1 - 0.6, r.z1 - 0.6);
        continue;
      }
      const fw = rng.int(4, 9), fd = rng.int(4, 9);
      const r = occ.place(rng, fw, fd, 1); if (!r) continue;
      F.add(w, kind, r.x0, r.z0, r.x1, r.z1);
    }
  };
  F.add = function (w, kind, x0, z0, x1, z1, opts) {
    const f = { kind, x0, z0, x1, z1, y: (opts && opts.y) || 0, t: 0, cap: kind === 'holy' ? 60 : 0, burnT: 0, blue: !!(opts && opts.blue) };
    w.fields = w.fields || [];
    w.fields.push(f);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const flat = (mat, h, o) => w.visual(mat, x0, f.y, z0, x1, f.y + (h || 0.03), z1, Object.assign({ uv: 3, grad: false, skip: { bottom: true } }, o || {}));
    switch (kind) {
      case 'water': flat('water', 0.035); w.waterZones.push(f); break;
      case 'lava': flat(f.blue ? 'bluefire' : 'lava'); w.lavaZones.push(f); if (!(opts && opts.noLight)) w.addLight(cx, f.y + 0.6, cz, { flame: 0, intensity: f.blue ? 14 : 12, range: 11, color: f.blue ? '#3a8aff' : '#ff6a20', prio: 1.0, emit: false }); break;
      case 'ice': flat('ice', 0.04); break;
      case 'moss': flat('moss', 0.025); break;
      case 'mud': flat('mud', 0.03); break;
      case 'poison': flat('poison', 0.035); w.addLight(cx, 0.5, cz, { flame: 0, intensity: 4, range: 8, color: '#7adf30', prio: 0.5, emit: false }); break;
      case 'holy': flat('holy', 0.035); f.light = w.lightSources[w.lightSources.push({ pos: V(cx, 0.8, cz), color: '#90e0ff', intensity: 7, range: 9, flame: 0, emit: false, ph: 0, prio: 0.9, steady: true }) - 1]; break;
      case 'oil': flat('oil', 0.02); break;
      case 'thorns': {
        flat('moss', 0.02, { tint: [0.45, 0.4, 0.3] });
        const rr = () => Math.random();
        for (let i = 0; i < (x1 - x0) * (z1 - z0) * 0.7; i++) {
          const x = x0 + 0.3 + rr() * (x1 - x0 - 0.6), z = z0 + 0.3 + rr() * (z1 - z0 - 0.6), h = 0.35 + rr() * 0.5;
          w.batch.geo('vine', G.Props.PG.cone, new THREE.Matrix4().compose(V(x, h / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rr() - 0.5) * 0.6, rr() * 6, (rr() - 0.5) * 0.6)), V(0.05, h, 0.05)));
        }
        break;
      }
      case 'vent': {
        w.visual('iron', x0, 0, z0, x1, 0.08, z1, { uv: 1, grad: false });
        for (let i = 0; i < 5; i++) { const t = x0 + (x1 - x0) * (i + 0.5) / 5; w.visual('dark', t - 0.06, 0.08, z0 + 0.1, t + 0.06, 0.09, z1 - 0.1, { uv: 1, grad: false }); }
        w.addLight(cx, 0.6, cz, { flame: 0, intensity: 3, range: 6, color: '#bfe8ff', prio: 0.4, emit: false });
        break;
      }
    }
    return f;
  };

  // ---------------- runtime ----------------
  const inside = (f, p, pad) => p.x > f.x0 - (pad || 0) && p.x < f.x1 + (pad || 0) && p.z > f.z0 - (pad || 0) && p.z < f.z1 + (pad || 0);
  let tick = 0, hurtT = 0, seen = null;
  F.onExplode = function (pos, r) {
    const w = G.world; if (!w || !w.fields) return;
    for (const f of w.fields) if (f.kind === 'oil' && f.burnT <= 0 && pos.y < 3 && pos.x > f.x0 - r && pos.x < f.x1 + r && pos.z > f.z0 - r && pos.z < f.z1 + r) F.ignite(f);
  };
  F.ignite = function (f) {
    f.burnT = 9;
    const c = V((f.x0 + f.x1) / 2, 0.05, (f.z0 + f.z1) / 2);
    G.sfx.fire && G.sfx.fire(c, true); G.fx.fireBurst && G.fx.fireBurst(c, Math.max(f.x1 - f.x0, f.z1 - f.z0) / 2);
  };
  F.update = function (dt) {
    const w = G.world, P = G.player, C = G.combat;
    P.fieldSpeed = 1; P.fieldSlip = 1; P.fieldJump = 1; P.fieldSlide = 1;
    if (!w || !w.fields || !w.fields.length || P.dead) return;
    if (!seen || seen.run !== G.game.run) seen = { run: G.game.run, k: {} };
    tick -= dt; hurtT -= dt;
    const doTick = tick <= 0; if (doTick) tick = 0.25;
    const feet = P.pos;
    const moving = Math.hypot(P.vel.x, P.vel.z) > 1.2;
    for (const f of w.fields) {
      const cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
      // ambient life
      // blue fire: tall pale-blue tongues rise out of the patch (only close ones, only a few at a time)
      if (f.kind === 'lava' && f.blue && Math.hypot(cx - feet.x, cz - feet.z) < 40 + (f.x1 - f.x0 + f.z1 - f.z0) / 2) {
        const n = Math.min(3.5, (f.x1 - f.x0) * (f.z1 - f.z0) * 0.12 + 0.6) * dt * 9;
        for (let k = Math.random() < n % 1 ? 1 : 0, m = Math.floor(n); k <= m; k++) G.fx.flameLick(U.rand(f.x0, f.x1), f.y + 0.06, U.rand(f.z0, f.z1), U.rand(1.7, 2.8), 0x4a9cff);
      }
      if (f.kind === 'poison' && Math.random() < dt * 3) G.fx.norm.spawn(U.rand(f.x0, f.x1), 0.1, U.rand(f.z0, f.z1), 0, 0.4, 0, 1.4, 0.2, 0.7, 0.4, 0.85, 0.15, 0.5, -0.1, 0.5);
      if (f.kind === 'holy' && f.cap > 0 && Math.random() < dt * 6) G.fx.add.spawn(U.rand(f.x0, f.x1), 0.1, U.rand(f.z0, f.z1), 0, U.rand(0.6, 1.4), 0, 1.2, 0.08, 0.01, 0.6, 0.9, 1, 0.9, -0.2, 0.4);
      if (f.kind === 'vent' && Math.random() < dt * 14) G.fx.norm.spawn(U.rand(f.x0, f.x1), 0.2, U.rand(f.z0, f.z1), U.rand(-0.2, 0.2), U.rand(5, 9), U.rand(-0.2, 0.2), 0.7, 0.15, 0.6, 0.85, 0.92, 1, 0.35, 0, 0.6);
      if (f.kind === 'oil' && f.burnT > 0) {
        f.burnT -= dt;
        if (Math.random() < dt * (f.x1 - f.x0) * (f.z1 - f.z0) * 3) G.fx.flameLick(U.rand(f.x0, f.x1), 0.05, U.rand(f.z0, f.z1), U.rand(1.6, 2.6));
      }
      // oil catches from fire zones and burning foes standing in it
      if (f.kind === 'oil' && f.burnT <= 0 && doTick) {
        if (C.zones.some((z) => z.kind === 'fire' && !z.enemy && z.pos.x > f.x0 - z.r && z.pos.x < f.x1 + z.r && z.pos.z > f.z0 - z.r && z.pos.z < f.z1 + z.r)) F.ignite(f);
        else for (const e of G.enemies.list) if (e.alive && e.st && e.st.burn > 0 && inside(f, e.pos) && e.pos.y < 0.5) { F.ignite(f); break; }
      }
      // ---- the player ----
      const onGround = P.grounded && feet.y < f.y + 0.25 && feet.y > f.y - 0.3;
      const pin = inside(f, feet) && (f.kind === 'vent' ? feet.y < f.y + 1 && feet.y > f.y - 0.3 : onGround);
      if (pin) {
        const tk = f.blue ? 'blue' : f.kind; if (!seen.k[tk]) { seen.k[tk] = true; G.ui.toastSmall(f.blue ? '🔵 蒼炎：踏むと激しく燃える' : `${F.KINDS[f.kind].icon} ${F.KINDS[f.kind].tip}`); }
        switch (f.kind) {
          case 'water': if (P.st.burn > 0) { P.st.burn = 0; G.fx.smoke && G.fx.smoke(P.pos.clone().setY(0.5), 6, 0.6, 0x9aa4aa, 0.5, 0.8); } break;
          case 'moss': P.fieldSlip = 0.35; P.fieldSlide = 1.5; break;
          case 'ice': P.fieldSlip = 0.12; P.fieldSlide = 1.8; break;
          case 'mud': P.fieldSpeed = 0.62; P.fieldJump = 0.72; break;
          case 'poison': if (doTick) { P.st.poison = Math.max(P.st.poison || 0, 2.5); P.st.poisonStacks = Math.min(5, (P.st.poisonStacks || 0) + (Math.random() < 0.3 ? 1 : 0)); } break;
          case 'holy': if (f.cap > 0 && P.hp < P.stats.maxHp) { const h = Math.min(f.cap, 4 * dt * Math.max(1, P.stats.maxHp / 100)); f.cap -= h; C.heal(h, true); if (f.cap <= 0) { G.ui.toastSmall('✨ 聖泉が枯れた'); if (f.light) f.light.intensity = 0.5; } } break;
          case 'thorns': P.fieldSpeed = 0.8; if (moving && hurtT <= 0) { hurtT = 0.5; C.damagePlayer(3 + G.game.area * 0.2, { src: 'aoe', pos: P.pos.clone() }); } break;
          case 'oil': if (f.burnT > 0 && hurtT <= 0) { hurtT = 0.5; C.damagePlayer(5 + G.game.area * 0.4, { src: 'aoe', elem: 'fire', pos: P.pos.clone() }); } break;
          case 'vent': if (P.vel.y < 12) { P.vel.y = 15; P.grounded = false; G.sfx.whoosh && G.sfx.whoosh(0.5, 1.0, true); P.fovKick = 8; } break;
        }
      }
      // ---- monsters ----
      if (!doTick) continue;
      for (const e of G.enemies.inRadius(V(cx, f.y, cz), Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2 + 1)) {
        if (e.boss || !inside(f, e.pos) || e.pos.y > f.y + (f.kind === 'vent' ? 1 : 0.5) || e.pos.y < f.y - 0.5 || (e.def.flyer && f.kind !== 'vent')) continue;
        switch (f.kind) {
          case 'water': e.wetUntil = G.game.time + 2; if (e.st.burn) e.st.burn = 0; break;
          // lava does not hurt monsters (burning from the player's own weapons and skills works as usual)
          case 'mud': e.st.slow = Math.max(e.st.slow || 0, 0.5); break;
          case 'poison': C.status(e, 'poison', 1); break;
          case 'thorns': C.damageEnemy(e, C.scale(4), { src: 'dot', proc: true, noMarker: true }); e.st.slow = Math.max(e.st.slow || 0, 0.4); break;
          case 'oil': if (f.burnT > 0) { C.status(e, 'burn', 1); C.damageEnemy(e, C.scale(8), { src: 'dot', proc: true, noMarker: true }); } break;
          case 'vent': if (!e.def.flyer && e.vel) { e.vel.y = 12; } break;
        }
      }
    }
  };
})();
