'use strict';
// Field gimmicks (gimmick.js) of the depths:
//   sluice   - 水没回廊: a sluice gate in the wall and the wheel that opens it, on the nearest walkway. Turn the wheel: the gate rises,
//              a surge rolls out across the hall (8 m wide, its front is where it hits) and a current runs behind it for a few seconds.
//              Monsters in the water are swept along, slowed, soaked (water: volt on them is 漏電); you are only carried if you are in it.
//   crucible - 溶鉱の深層: a crucible of molten iron hanging from the vault on two red-hot chains. Shoot it or a chain: a chain snaps, the
//              crucible swings down and pours; where the iron lands (3 m round) it burns terribly, and the pool stays molten for 10 s.
//   gale     - 天空の聖域: a statue on an island's rim that breathes the wind. Wake it (the key, a shot, a blow): after a breath in, a gale
//              blows across the island for 3 s (6 m wide): monsters in it are driven toward the edge, and over it (as by your own blow).
//              You are not moved.
(function () {
  const Gm = G.Gim, U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const R = Math.random, rnd = (a, b) => a + R() * (b - a);
  const ease = (k) => 1 - (1 - k) * (1 - k);
  const C = () => G.combat, P = () => G.player;
  const inWaterAt = (p) => (G.world.waterZones || []).some((z) => p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1);
  // carry the player along (through walls' collisions, never into them)
  function carryMe(v, dt) {
    const Pl = P(), w = G.world; if (!Pl || Pl.dead) return;
    w.pp = true; try { w.moveBox(Pl.pos, v, dt, Pl.hw, Pl.height, { canStep: true, stepH: 0.5 }); } finally { w.pp = false; }
  }

  // ================================================================ 水没回廊: the sluice gates
  const SL = { open: 0.8, wave: 0.5, speed: 11, hw: 4, flow: 4.6, H: 1.0 };
  Gm.K.sluice = {
    name: '水門の車輪', icon: '🛞', rc: '#7ac8e0', cat: '回す — 調べる',
    desc: '壁の水門が開き、激流（幅約8m）が広間を横切る。水の中の敵は押し流され、遅くなり、水属性が付く（雷で漏電）。歩廊の上は安全。一度きり。',
    interact: { verb: '回す', doing: '車輪を回している…', dur: 1.5 },
    build(g, w) {
      const iron = w.mats.iron, stone = w.mats.block, trim = w.mats.trim, s = g.sgn; // (s: the way the water runs, away from the wall)
      const grp = new THREE.Group(); w.group.add(grp);
      // the gate in the wall: two pilasters, a lintel with a keystone, a dark tunnel mouth behind an iron grate
      const wx = g.wx, z = g.z;
      for (const zz of [-2.75, 2.75]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.4, 0.7), stone); p.position.set(wx + s * 0.4, 2.0, z + zz); p.castShadow = true; grp.add(p); }
      const lin = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 6.4), stone); lin.position.set(wx + s * 0.45, 4.15, z); grp.add(lin);
      const key = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.95, 0.8), trim); key.position.set(wx + s * 0.5, 4.2, z); grp.add(key);
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.8), new THREE.MeshBasicMaterial({ color: 0x02060a })); mouth.position.set(wx + s * 0.03, 1.8, z); mouth.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2; grp.add(mouth);
      const gate = new THREE.Group(); gate.position.set(wx + s * 0.35, 0, z); grp.add(gate);
      const gm = new THREE.MeshStandardMaterial({ color: 0x3e4440, metalness: 0.8, roughness: 0.55, map: iron.map || null, normalMap: iron.normalMap || null });
      for (let zz = -2.3; zz <= 2.31; zz += 0.36) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.9, 0.09), gm); b.position.set(0, 1.95, zz); b.castShadow = true; gate.add(b); }
      for (const y of [0.25, 1.3, 2.4, 3.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 4.8), gm); b.position.y = y; gate.add(b); }
      for (let zz = -2.3; zz <= 2.31; zz += 0.36) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 6), gm); sp.position.set(0, -0.12, zz); sp.rotation.x = Math.PI; gate.add(sp); }
      // the wheel on the walkway: an iron post and gear box, the wheel facing the gate, a chain running off it toward the wall
      const wh = new THREE.Group(); wh.position.set(g.ux, g.uy, g.uz); grp.add(wh);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.05, 10), iron); post.position.y = 0.52; wh.add(post);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.42), iron); box.position.y = 1.15; wh.add(box);
      const wheel = new THREE.Group(); wheel.position.set(0, 1.15, 0); wh.add(wheel);
      wheel.rotation.y = Math.atan2(g.fx, g.fz); // (its face toward the gate)
      const spin = new THREE.Group(); spin.position.z = 0.3; wheel.add(spin);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 8, 28), gm); spin.add(rim);
      for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.05, 0.05), gm); sp.rotation.z = i * Math.PI / 6; spin.add(sp); }
      for (let i = 0; i < 6; i++) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), w.mats.brass); const a = i * Math.PI / 3; k.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0); spin.add(k); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), w.mats.brass); hub.rotation.x = Math.PI / 2; spin.add(hub);
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 8), iron); axle.rotation.x = Math.PI / 2; axle.position.z = 0.15; wheel.add(axle);
      const cm = new THREE.MeshStandardMaterial({ color: 0x55504a, metalness: 0.8, roughness: 0.5 });
      grp.add(Gm.chain(V(g.ux, g.uy + 0.9, g.uz), V(g.ux + g.fx * 1.2, 0.05, g.uz + g.fz * 1.2), cm, 0.08));
      // water seeping through the grate: a little foam where it meets the pool (the marker)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0x9ad8e8, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(5, 2.4, 1); glow.position.set(wx + s * 0.8, 0.9, z); grp.add(glow);
      Object.assign(g, { grp, gate, spin, glow, ph: R() * 6, gy: 0 });
    },
    idle(g, dt) {
      g.ph += dt;
      if (!g.gate) return;
      if (R() < dt * 10) G.fx.norm.spawn(g.wx + g.sgn * rnd(0.5, 1.2), 0.15, g.z + rnd(-2.2, 2.2), g.sgn * rnd(0.3, 1.0), rnd(0.1, 0.5), rnd(-0.2, 0.2), rnd(0.6, 1.1), 0.18, 0.6, 0.85, 0.94, 1.0, 0.55, 2, 1.2);
      g.glow.material.opacity = 0.18 + 0.08 * Math.sin(g.ph * 2.4);
    },
    searching(g, k) { if (g.spin) g.spin.rotation.z = -k * Math.PI * 3; },
    start(g) {
      g.hitSet = new Set(); g.waveAt = null;
      G.sfx.chain && G.sfx.chain(1.0, 0.5); G.sfx.mech && G.sfx.mech('boltBack', 0, 1); G.sfx.stoneGrind && G.sfx.stoneGrind(V(g.wx, 1.5, g.z), SL.open);
      const a = V(g.wx + g.sgn * 0.6, 0, g.z), dir = V(g.sgn, 0, 0);
      g.warn = Gm.warn({ c: a.clone().addScaledVector(dir, g.len / 2), yaw: Math.atan2(dir.x, dir.z), hx: g.hw, hz: g.len / 2, from: 'base', dur: SL.wave, hold: 0.25, col: 0x60c8ff, alpha: 0.8 });
      g.flow = Gm.flow(V(a.x, 0.075, a.z), dir, g.hw, g.len, 'water', { speed: 14 });
    },
    run(g, dt) {
      const t = g.t, s = g.sgn, dir = V(s, 0, 0);
      // the wheel spins on, the gate grinds up out of the water
      if (g.spin) g.spin.rotation.z -= dt * Math.max(0, 9 - t * 2);
      if (g.gate) g.gate.position.y = 3.2 * ease(Math.min(1, t / SL.open));
      if (t < SL.open && g.gate) { if (R() < dt * 40) G.fx.norm.spawn(g.wx + s * 0.6, rnd(0.1, 2.5 * t / SL.open), g.z + rnd(-2.3, 2.3), s * rnd(2, 5), rnd(-0.5, 1), rnd(-0.5, 0.5), rnd(0.5, 0.9), 0.25, 0.9, 0.86, 0.95, 1.0, 0.7, 6, 0.6); }
      // the surge: a curling wave rolls out of the mouth across the hall; behind its front the current runs
      const tw = t - SL.wave;
      if (tw >= 0 && !g.waveAt) {
        g.waveAt = G.vfx.wave(V(g.wx + s * 0.4, 0.06, g.z), dir, g.len, g.hw * 2, SL.speed, { h: SL.H, start: 0.6 });
        G.sfx.whoosh && G.sfx.whoosh(1.6, 0.9); G.sfx.waterRush && G.sfx.waterRush(V(g.wx + s * 1.5, 1, g.z), SL.flow + 0.6); Gm.shake(V(g.wx, 1, g.z), 0.35, 30);
        for (let k = 0; k < 60; k++) G.fx.norm.spawn(g.wx + s * rnd(0.3, 1.2), rnd(0.2, 2.8), g.z + rnd(-2.4, 2.4), s * rnd(4, 9), rnd(0.5, 4), rnd(-1, 1), rnd(0.6, 1.2), 0.3, 1.4, 0.85, 0.95, 1.0, 0.8, 8, 0.8);
      }
      const front = tw < 0 ? 0 : Math.min(g.len, G.vfx.waveFront(tw, 0.6, SL.speed, g.len, SL.H));
      const ending = t > SL.wave + SL.flow;
      if (g.flow) g.flow.set(front, ending ? 0 : 0.95);
      if (g.warn && tw > 0.25) { g.warn.end(); g.warn = null; }
      // white water spilling out of the open mouth while it runs
      if (tw >= 0 && !ending && g.gate && R() < dt * 50) G.fx.norm.spawn(g.wx + s * rnd(0.3, 0.8), rnd(0.2, 1.6), g.z + rnd(-2.2, 2.2), s * rnd(3, 7), rnd(-0.5, 1.5), rnd(-0.6, 0.6), rnd(0.5, 1.0), 0.3, 1.2, 0.86, 0.95, 1.0, 0.7, 7, 0.6);
      if (tw >= 0 && !ending) {
        const inLane = (p, r) => { const al = (p.x - g.wx) * s, lat = Math.abs(p.z - g.z); return al >= 0 && al <= front && lat <= g.hw + r && p.y < 0.7 && inWaterAt(p); };
        for (const e of Gm.foes()) {
          if (e.flyer || !inLane(e.pos, (e.radius || 0.5) * 0.5)) continue;
          const k = e.boss ? 0.3 : e.big ? 0.55 : 1;
          if (!g.hitSet.has(e)) { // the wave's front reached it: thrown along, soaked
            g.hitSet.add(e);
            e.knockback(dir, 10 * k); Gm.hurtFoe(e, 0.05, 'water');
            if (G.Water) G.Water.splash(e.pos, 0.8); else G.fx.norm.spawn(e.pos.x, 0.6, e.pos.z, s * 3, 2.5, 0, 0.6, 0.4, 1.4, 0.86, 0.95, 1.0, 0.8, 8, 1);
          }
          // and swept on by the current behind it, slowed
          e.vel.x += s * 46 * k * dt; e.st.slow = Math.max(e.st.slow || 0, 0.6);
          if (G.Elem && R() < dt * 2) G.Elem.envEnemy(e, 'water');
        }
        const Pl = P();
        if (Pl && !Pl.dead && Pl.inWater && inLane(Pl.pos, 0.3)) carryMe(V(s * (g.meHit ? 4.5 : 7), 0, 0), dt), g.meHit = true;
      }
      if (ending && g.flow && !g.flowEnd) { g.flowEnd = true; g.flow.end(); }
      return t < SL.wave + SL.flow + 1.2;
    },
    restore(g) { if (g.gate) g.gate.position.y = 3.2; if (g.glow) g.glow.visible = false; },
  };
  // (fieldgen_t3.js flooded) a gate in the west (sgn +1) or east (sgn -1) wall at z, the water running len metres across the hall;
  // the wheel at (ux, uy, uz) on a walkway, (fx, fz) the way it faces (toward the gate)
  Gm.addSluice = function (w, sgn, wx, z, len, ux, uy, uz, hw) {
    const d = Math.hypot(wx - ux, z - uz) || 1, fx = (wx - ux) / d, fz = (z - uz) / d;
    const g = Gm.add(w, 'sluice', { sgn, wx, z, len, ux, uy, uz, fx, fz, hw: hw || SL.hw, use: V(ux, uy + 1.15, uz), useR: 0.9, useD: 3.4 });
    Gm.col(w, g, ux - 0.25, uy, uz - 0.25, ux + 0.25, uy + 1.45, uz + 0.25, { surf: 'metal' });
    return g;
  };

  // ================================================================ 溶鉱の深層: the hanging crucibles
  const CR = { imp: 1.0, r: 3, pool: 10, swing: -0.85 };
  let crGeo = null, crIn = null;
  function crShape() {
    if (crGeo) return;
    const o = [[0.001, -0.95], [0.55, -0.93], [0.82, -0.75], [1.02, -0.3], [1.12, 0.3], [1.2, 0.7], [1.3, 0.78], [1.3, 0.9], [1.12, 0.9]];
    crGeo = new THREE.LatheGeometry(o.map(([r, y]) => new THREE.Vector2(r, y)), 36);
    const i = [[1.1, 0.88], [1.04, 0.4], [0.92, -0.2], [0.7, -0.68], [0.001, -0.78]];
    crIn = new THREE.LatheGeometry(i.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  }
  const STREAM_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${Gm.FOG_VS} void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const STREAM_FS = `uniform float uT; uniform float uFront; uniform float uTail; uniform float uA; ${Gm.FOG_FS} varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${Gm.NOISE}
    void main() {
      if (vUv.x > uFront || vUv.x < uTail) discard;
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float n = fbm(vec2(vUv.x * 10.0 - uT * 9.0, vUv.y * 4.0));
      vec3 col = mix(vec3(0.9, 0.22, 0.02), vec3(1.0, 0.78, 0.3), n);
      col = mix(col, vec3(1.0, 0.97, 0.8), pow(facing, 4.0) * 0.7);
      float a = (0.7 + 0.3 * facing) * uA;
      ${Gm.fogv}
      gl_FragColor = vec4(col * fogv * 1.6, a);
    }`;
  Gm.warmMats.push(() => Gm.mat(STREAM_VS, STREAM_FS, { uFront: { value: 0 }, uTail: { value: 0 }, uA: { value: 0 } }, { blending: THREE.AdditiveBlending }));
  Gm.K.crucible = {
    name: '吊りるつぼ', icon: '🔥', rc: '#ff8a40', cat: '撃つと落ちる — 鎖かるつぼを撃つ',
    desc: '鎖が切れて傾き、真下（半径3m）に溶鉄が落ちる。中の敵に大ダメージと炎属性。溶鉄は10秒残る（自分も燃える）。一度きり。',
    build(g, w) {
      crShape();
      const iron = w.mats.iron, top = g.top;
      const grp = new THREE.Group(); w.group.add(grp);
      // a rail in the vault with a trolley over the crucible
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.34, 0.3), iron); rail.position.set(g.x, top - 0.25, g.z); grp.add(rail);
      const trol = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.32, 0.5), iron); trol.position.set(g.x, top - 0.55, g.z); grp.add(trol);
      // the chains, red-hot near the crucible (the marker: the live ones glow)
      const hot = new THREE.MeshStandardMaterial({ color: 0x2a1a14, metalness: 0.7, roughness: 0.5, emissive: 0xff3a08, emissiveIntensity: 0.6 });
      const L = V(g.x - 0.85, g.y + 0.78, g.z), Rr = V(g.x + 0.85, g.y + 0.78, g.z);
      const cl = Gm.chain(V(L.x, top - 0.7, g.z), L, hot, 0.13); grp.add(cl);
      const crG = new THREE.Group(); grp.add(crG);
      const cr = Gm.chain(V(Rr.x, top - 0.7, g.z), Rr, hot, 0.13); crG.add(cr);
      // the crucible hangs from both lugs; it turns about the left one once the right chain is gone
      const pot = new THREE.Group(); pot.position.copy(L); grp.add(pot);
      const pm = new THREE.MeshStandardMaterial({ color: 0x1e1a18, metalness: 0.7, roughness: 0.7, map: iron.map || null, normalMap: iron.normalMap || null, emissive: 0x5a1400, emissiveIntensity: 0.2 });
      const body = new THREE.Mesh(crGeo, pm); body.position.set(0.85, -0.78, 0); body.castShadow = true; pot.add(body);
      const inner = new THREE.Mesh(crIn, new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff4a10, emissiveIntensity: 0.6, roughness: 0.9, side: THREE.BackSide })); inner.position.copy(body.position); pot.add(inner);
      const rimG = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.07, 6, 36), new THREE.MeshStandardMaterial({ color: 0x3a1a0c, emissive: 0xff6a20, emissiveIntensity: 0.9, roughness: 0.6 })); rimG.rotation.x = Math.PI / 2; rimG.position.set(0.85, 0.12, 0); pot.add(rimG);
      const melt = new THREE.Mesh(new THREE.CircleGeometry(1.1, 36), w.mats.lava); melt.rotation.x = -Math.PI / 2; melt.position.set(0.85, 0.02, 0); pot.add(melt);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.42), pm); lip.position.set(0.85 + 1.32, 0.08, 0); pot.add(lip);
      for (const sx of [-1, 1]) { const lug = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.05, 6, 12), iron); lug.position.set(0.85 + sx * 0.85, 0, 0); pot.add(lug); }
      g.light = Gm.light(w, g.x, g.y + 1.2, g.z, { color: '#ff6a20', intensity: 7, range: 10, flame: 0.3 });
      Object.assign(g, { grp, pot, pm, melt, hot, crG, ph: R() * 6, swing: 0 });
    },
    idle(g, dt) {
      g.ph += dt;
      if (!g.pot) return;
      g.pot.rotation.z = Math.sin(g.ph * 0.9) * 0.015;
      g.hot.emissiveIntensity = 0.5 + 0.2 * Math.sin(g.ph * 2.3);
      // glowing drops fall now and then from the lip, embers rise off the melt
      if (R() < dt * 1.2) drip(g);
      if (R() < dt * 4) G.fx.add.spawn(g.x + rnd(-0.8, 0.8), g.y + 1.0, g.z + rnd(-0.8, 0.8), rnd(-0.2, 0.2), rnd(0.6, 1.4), rnd(-0.2, 0.2), rnd(1, 1.8), 0.05, 0.01, 1.0, 0.55, 0.15, 0.9, -0.1, 0.4);
    },
    start(g) {
      g.hitSet = new Set(); g.meHit = false; g.landed = false;
      const top = V(g.x + 0.85, g.top - 0.7, g.z);
      // the right chain snaps at the top: sparks, the chain drops away
      G.fx.sparks(top, V(0, -1, 0), 26, 0xffb060, 9); G.sfx.clang && G.sfx.clang(top); G.sfx.chain && G.sfx.chain(0.6, 0.6);
      g.warn = Gm.warn({ c: V(g.imp.x, 0, g.imp.z), r: CR.r, dur: CR.imp, hold: 0.05, col: 0xff4a10 });
      g.fallV = 0;
      if (g.pot) pour(g);
    },
    run(g, dt) {
      const t = g.t;
      if (g.pot) {
        // a pendulum about the remaining chain: it swings past and settles with its lip down
        g.pot.rotation.z = CR.swing * (1 - Math.exp(-3.2 * t) * Math.cos(7 * t));
        g.melt.visible = t < 0.35;
        g.pm.emissiveIntensity = Math.max(0.06, 0.2 - t * 0.03); g.hot.emissiveIntensity = Math.max(0.12, 0.6 - t * 0.1);
        if (g.light) g.light.intensity = Math.max(1.5, 7 - t * 1.2);
        if (g.crG && g.crG.visible) { g.fallV += 18 * dt; g.crG.position.y -= g.fallV * dt; g.crG.rotation.z += dt * 1.5; if (g.crG.position.y < -g.top) g.crG.visible = false; }
      }
      if (t >= CR.imp && !g.landed) splashIron(g);
      return t < 3.2;
    },
    restore(g) {
      if (g.pot) { g.pot.rotation.z = CR.swing; g.melt.visible = false; g.pm.emissiveIntensity = 0.06; g.hot.emissiveIntensity = 0.12; g.crG.visible = false; }
      if (g.light) g.light.intensity = 1.5;
    },
  };
  function drip(g) {
    const lip = V(g.x + 2.15, g.y + 0.86, g.z);
    let vy = 0, y = lip.y, done = false;
    const m = new THREE.Mesh(G.vfx.geo.sph, new THREE.MeshBasicMaterial({ color: 0xffa040 })); m.scale.setScalar(0.06); m.position.copy(lip); G.scene.add(m);
    Gm.fx.push({
      update(dt) {
        if (done) return false;
        vy -= 18 * dt; y += vy * dt; m.position.y = y;
        if (y <= 0.05) { done = true; G.fx.sparks(V(lip.x, 0.08, lip.z), V(0, 1, 0), 6, 0xffa040, 3); G.fx.smoke(V(lip.x, 0.2, lip.z), 2, 0.3, 0x6a5a50, 0.6, 0.6); }
        return true;
      },
      dispose() { G.scene.remove(m); m.material.dispose(); },
    });
  }
  // the iron pouring from the lip (where it lies once the crucible has swung down) to the floor
  function pour(g) {
    const lip = lipOf(g), base = V(g.imp.x, 0.05, g.imp.z);
    const curve = new THREE.CatmullRomCurve3([lip, V(lip.x + 0.25, lip.y - 0.4, lip.z), V(base.x + 0.05, (lip.y + base.y) / 2, base.z), base]);
    const tg = new THREE.TubeGeometry(curve, 40, 0.24, 10, false);
    const mat = Gm.mat(STREAM_VS, STREAM_FS, { uFront: { value: 0 }, uTail: { value: 0 }, uA: { value: 1 } }, { blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(tg, mat); m.frustumCulled = false; m.renderOrder = 8; G.scene.add(m);
    let t = 0;
    Gm.fx.push({
      update(dt) {
        t += dt;
        // it spills over the lip at 0.35 s and strikes the floor at the moment of the impact; it thins and stops from 2 s
        mat.uniforms.uFront.value = U.clamp((t - 0.35) / (CR.imp - 0.35), 0, 1);
        mat.uniforms.uTail.value = U.clamp((t - 2.0) / 0.7, 0, 1);
        if (t > 0.35 && t < 2.5) { const q = curve.getPoint(Math.min(1, R() * mat.uniforms.uFront.value)); G.fx.add.spawn(q.x, q.y, q.z, rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), 0.4, 0.07, 0.02, 1.0, 0.6, 0.15, 1, 9, 0.2); }
        return t < 2.9;
      },
      dispose() { G.scene.remove(m); tg.dispose(); mat.dispose(); },
    });
  }
  function lipOf(g) { const q = V(0.85 + 1.4, 0.1, 0).applyAxisAngle(V(0, 0, 1), CR.swing); return V(g.x - 0.85 + q.x, g.y + 0.78 + q.y, g.z); }
  function splashIron(g) {
    g.landed = true;
    const p = V(g.imp.x, 0, g.imp.z), w = G.world;
    if (g.warn) g.warn.end();
    G.sfx.explosion(p, 0.8); G.sfx.lava && G.sfx.lava(p); G.sfx.fire && G.sfx.fire(p, true);
    G.vfx.fireball(p.clone().setY(1.0), CR.r);
    const ring = G.fx.shockRing(p, 0xff7a20, 0.55, CR.r + 2); let tr = 0;
    Gm.fx.push({ update(dt) { tr += dt; const k = Math.min(1, tr / 0.25); ring.set(CR.r * ease(k), 1 - Math.max(0, tr - 0.25) / 0.3); return tr < 0.55; }, dispose() { ring.dispose(); } });
    for (let k = 0; k < 70; k++) { const a = R() * 6.28, s = rnd(3, 9); G.fx.add.spawn(p.x, 0.3, p.z, Math.cos(a) * s, rnd(3, 9), Math.sin(a) * s, rnd(0.6, 1.2), 0.1, 0.03, 1.0, 0.6, 0.15, 1, 12, 0.25); }
    if (G.fx.decal) G.fx.decal(p.clone().setY(0.02), V(0, 1, 0), 'scorch', CR.r * 2.2, true);
    Gm.shake(p, 0.6, 22);
    // what it lands on burns: a monster's body inside the circle (3 m), your feet inside it
    for (const e of Gm.foes()) {
      if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > CR.r + (e.radius || 0.5) * 0.5 || e.pos.y > 3) continue;
      Gm.hurtFoe(e, 0.35, 'fire'); C().status(e, 'burn', 3);
    }
    const Pl = P();
    if (Pl && !Pl.dead && Math.hypot(Pl.pos.x - p.x, Pl.pos.z - p.z) <= CR.r && Pl.pos.y < 3) { Gm.hurtMe(0.2, { elem: 'fire', pos: p.clone() }); Gm.igniteMe(); }
    // the molten pool: the same circle, burning like lava for 10 s, then it crusts over
    const area = G.vfx.area(p, CR.r, 'fire', CR.pool, { col: [0xff5010, 0xffb050], alpha: 0.7 });
    const melt = new THREE.Mesh(new THREE.CircleGeometry(CR.r, 48), w.mats.lava); melt.rotation.x = -Math.PI / 2; melt.position.set(p.x, 0.035, p.z); melt.renderOrder = 2; w.group.add(melt);
    const pl = Gm.light(w, p.x, 0.8, p.z, { color: '#ff5a10', intensity: 12, range: 12, flame: 0.4 });
    let tp = 0, tick = 0;
    Gm.fx.push({
      update(dt) {
        tp += dt; tick -= dt;
        if (pl) pl.intensity = tp < CR.pool ? 12 : Math.max(0, 12 - (tp - CR.pool) * 20);
        if (tp < CR.pool && R() < dt * 14) { const a = R() * 6.28, d = Math.sqrt(R()) * CR.r; G.fx.add.spawn(p.x + Math.cos(a) * d, 0.1, p.z + Math.sin(a) * d, rnd(-0.6, 0.6), rnd(1.5, 3.5), rnd(-0.6, 0.6), rnd(0.4, 0.7), 0.07, 0.02, 1.0, 0.55, 0.12, 1, 9.8, 0.3); }
        if (tp < CR.pool && tick <= 0) {
          tick = 0.25;
          const Pm = P();
          if (Pm && !Pm.dead && Pm.grounded && Pm.pos.y < 0.3 && Math.hypot(Pm.pos.x - p.x, Pm.pos.z - p.z) <= CR.r) {
            g._lavaT = (g._lavaT || 0) - 0.25;
            if (g._lavaT <= 0) { g._lavaT = 0.4; C().damagePlayer(5 + G.game.area * 0.6, { src: 'aoe', elem: 'fire' }); }
            Gm.igniteMe();
          }
          for (const e of Gm.foes()) if (!e.flyer && e.pos.y < 0.5 && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) <= CR.r && G.Elem) G.Elem.give(e, 'fire');
        }
        if (tp > CR.pool) { const k = Math.max(0.001, 1 - (tp - CR.pool) / 0.8); melt.scale.set(k, k, 1); melt.position.y = 0.035 - (1 - k) * 0.05; }
        return tp < CR.pool + 0.8;
      },
      dispose() { if (area) area.end(0.2); if (melt.parent) melt.parent.remove(melt); melt.geometry.dispose(); },
    });
  }
  // (fieldgen_t3.js foundry) a crucible at height y over (x, z), hanging from the vault at `top`; the iron lands round imp
  Gm.addCrucible = function (w, x, y, z, top) {
    const g = Gm.add(w, 'crucible', { x, y, z, top, look: V(x, y, z), useR: 1.6, useD: 14 });
    const q = V(0.85 + 1.4, 0.1, 0).applyAxisAngle(V(0, 0, 1), CR.swing);
    g.imp = V(x - 0.85 + q.x, 0, z); // (straight below where the lip ends up)
    Gm.col(w, g, x - 1.3, y - 0.95, z - 1.3, x + 1.3, y + 0.95, z + 1.3, { shotOnly: true, surf: 'metal' });
    for (const sx of [-0.85, 0.85]) Gm.col(w, g, x + sx - 0.14, y + 0.95, z - 0.14, x + sx + 0.14, top - 0.6, z + 0.14, { shotOnly: true, surf: 'metal' });
    g.hb.push({ p: V(x, y, z), r: 1.4 });
    return g;
  };
  Gm.CR = CR;

  // ================================================================ 天空の聖域: the statues that breathe the wind
  const GA = { inhale: 1.0, blow: 3.0, hw: 3, speed: 28, push: 62 };
  Gm.K.gale = {
    name: '風の像', icon: '🌬️', rc: '#bfe8ff', cat: '目覚めさせる — 調べる・撃つ・叩く',
    desc: '息を吸い、島を横切る突風（幅6m）を3秒吹く。風の中の敵は奈落の方へ押し流される。自分は押されない。一度きり。',
    interact: { verb: '目覚めさせる', doing: '像に触れている…', dur: 1.0 },
    build(g, w) {
      const stone = w.mats.block, gold = w.mats.trim;
      const grp = new THREE.Group(); grp.position.set(g.x, 0, g.z); grp.rotation.y = Math.atan2(g.dx, g.dz); w.group.add(grp);
      // (in its own frame: +z is where it blows)
      const add = (geo, mat, x, y, z, sx, sy, sz, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; grp.add(m); return m; };
      const box = new THREE.BoxGeometry(1, 1, 1), sph = G.vfx.geo.sph;
      add(box, gold, 0, 0.12, 0, 1.9, 0.24, 1.9); add(box, stone, 0, 0.75, 0, 1.5, 1.05, 1.5); add(box, gold, 0, 1.32, 0, 1.62, 0.12, 1.62);
      // the head: a broad face with puffed cheeks, a heavy brow and a round open mouth
      add(sph, stone, 0, 2.55, 0, 0.95, 1.1, 0.85);
      for (const sx of [-1, 1]) add(sph, stone, sx * 0.42, 2.35, 0.42, 0.42, 0.38, 0.4);
      add(box, stone, 0, 2.95, 0.55, 1.15, 0.2, 0.3, -0.25);
      add(box, stone, 0, 2.62, 0.78, 0.18, 0.34, 0.22, 0.35);
      for (const sx of [-1, 1]) add(sph, new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: 0x6ad8ff, emissiveIntensity: 0.6 }), sx * 0.3, 2.82, 0.72, 0.09, 0.06, 0.05);
      const mouthR = add(new THREE.TorusGeometry(0.3, 0.09, 10, 24), stone, 0, 2.2, 0.78, 1, 1, 1);
      add(new THREE.CircleGeometry(0.29, 20), new THREE.MeshBasicMaterial({ color: 0x02060a }), 0, 2.2, 0.74, 1, 1, 1);
      // curls of wind carved over the brow, and wings of stone feathers at its sides
      for (let i = 0; i < 3; i++) add(new THREE.TorusGeometry(0.28 - i * 0.04, 0.06, 6, 16, Math.PI * 1.4), stone, (i - 1) * 0.42, 3.42 + (i === 1 ? 0.1 : 0), 0.05, 1, 1, 1, 0, 0, (i - 1) * 0.6);
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const a = 0.35 + i * 0.32; add(box, stone, sx * (0.95 + Math.cos(a) * 0.55), 2.2 + Math.sin(a) * 0.9, -0.15, 1.35 - i * 0.18, 0.24, 0.08, 0, 0, sx * a); }
      // the orb in its mouth: the eye of the wind (the marker, and the target)
      const orbM = new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x7adcff, emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.92 });
      const orb = add(sph, orbM, 0, 2.2, 0.7, 0.22, 0.22, 0.22);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0x9ae4ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(1.6, 1.6, 1); glow.position.set(0, 2.2, 0.8); grp.add(glow);
      g.light = Gm.light(w, g.x + g.dx * 1.0, 2.2, g.z + g.dz * 1.0, { color: '#9ae4ff', intensity: 4, range: 7, flame: 0 });
      Object.assign(g, { grp, orb, orbM, glow, mouthR, ph: R() * 6 });
    },
    idle(g, dt) {
      g.ph += dt;
      if (!g.orb) return;
      const k = 0.5 + 0.5 * Math.sin(g.ph * 1.6);
      g.orbM.emissiveIntensity = 0.9 + 0.5 * k; g.glow.material.opacity = 0.28 + 0.2 * k;
      if (R() < dt * 3) { const m = mouth(g); G.fx.add.spawn(m.x, m.y + rnd(-0.1, 0.1), m.z, g.dx * rnd(0.5, 1.5), rnd(-0.1, 0.3), g.dz * rnd(0.5, 1.5), rnd(0.8, 1.4), 0.08, 0.02, 0.8, 0.95, 1.0, 0.7, -0.05, 0.6); }
    },
    start(g) {
      g.hitSet = new Set(); g.blowing = false; g.ringT = 0;
      G.sfx.whoosh && G.sfx.whoosh(GA.inhale, 0.6, true); G.sfx.chime && G.sfx.chime(mouth(g));
      const a = V(g.x + g.dx * 1.0, 0, g.z + g.dz * 1.0), dir = V(g.dx, 0, g.dz);
      g.warn = Gm.warn({ c: a.clone().addScaledVector(dir, g.len / 2), yaw: Math.atan2(g.dx, g.dz), hx: GA.hw, hz: g.len / 2, dur: GA.inhale, hold: GA.blow, from: 'base', col: 0x2a90ff, alpha: 0.55 });
      g.flow = Gm.flow(V(a.x, 0.09, a.z), dir, GA.hw, g.len, 'wind', { speed: 30 });
    },
    run(g, dt) {
      const t = g.t, m = mouth(g), dir = V(g.dx, 0, g.dz);
      if (t < GA.inhale) {
        // the breath in: the orb flares, the air is drawn into its mouth from all along the lane
        const k = t / GA.inhale;
        if (g.orb) { g.orbM.emissiveIntensity = 1.4 + k * 3; g.glow.material.opacity = 0.4 + k * 0.6; g.glow.scale.setScalar(1.6 + k * 1.8); }
        if (g.light) g.light.intensity = 4 + k * 10;
        for (let i = 0; i < 4; i++) { const d = rnd(2, 9), a = rnd(-1.2, 1.2), sx = Math.sin(a) * d, s = V(m.x + g.dx * Math.cos(a) * d + g.dz * sx, m.y + rnd(-1.5, 1.5), m.z + g.dz * Math.cos(a) * d - g.dx * sx); G.fx.add.spawn(s.x, s.y, s.z, (m.x - s.x) * 1.6, (m.y - s.y) * 1.6, (m.z - s.z) * 1.6, 0.6, 0.06, 0.02, 0.85, 0.96, 1.0, 0.8, 0, 0); }
        if (g.flow) g.flow.set(g.len, 0.25 * k);
        return true;
      }
      const tb = t - GA.inhale, front = Math.min(g.len, tb * GA.speed), on = tb < GA.blow;
      if (!g.blowing) { g.blowing = true; G.sfx.whoosh && G.sfx.whoosh(GA.blow, 1.0); G.sfx.wind && G.sfx.wind(1); Gm.shake(m, 0.25, 20); }
      if (g.flow) g.flow.set(front, on ? 1 : 0);
      if (g.orb) { g.orbM.emissiveIntensity = on ? 4 : Math.max(0.2, g.orbM.emissiveIntensity - dt * 3); g.glow.material.opacity = on ? 0.9 : Math.max(0, g.glow.material.opacity - dt); }
      if (g.light) g.light.intensity = on ? 12 : Math.max(0, g.light.intensity - dt * 10);
      if (on) {
        // rings of wind leave the mouth and race down the lane, swelling; streaks and wisps fly with them
        g.ringT -= dt; if (g.ringT <= 0) { g.ringT = 0.22; windRing(g, m, dir); }
        for (let i = 0; i < 6; i++) { const al = rnd(0, front), lat = rnd(-GA.hw, GA.hw); G.fx.add.spawn(m.x + g.dx * al + g.dz * lat, rnd(0.2, 3.2), m.z + g.dz * al - g.dx * lat, g.dx * rnd(18, 30), rnd(-0.5, 0.8), g.dz * rnd(18, 30), rnd(0.25, 0.45), 0.07, 0.03, 0.85, 0.95, 1.0, 0.75, 0, 0.2); }
        if (R() < dt * 20) G.fx.norm.spawn(m.x + g.dx * front, rnd(0.5, 2.5), m.z + g.dz * front, g.dx * rnd(8, 14), rnd(-1, 1), g.dz * rnd(8, 14), rnd(0.8, 1.4), 0.6, 2.4, 0.9, 0.95, 1.0, 0.35, 0, 1.2);
        // the push: whatever is in the gale once its front has passed is driven along it, toward the edge and over it
        for (const e of Gm.foes()) {
          const rx = e.pos.x - (g.x + g.dx), rz = e.pos.z - (g.z + g.dz), al = rx * g.dx + rz * g.dz, lat = Math.abs(rx * g.dz - rz * g.dx);
          if (al < 0 || al > front || lat > GA.hw + (e.radius || 0.5) * 0.5 || e.pos.y > 6) continue;
          const k = e.boss ? 0.3 : (e.def && e.def.plan === 'golem') ? 0.35 : e.big ? 0.55 : 1;
          e.vel.x += g.dx * GA.push * k * dt; e.vel.z += g.dz * GA.push * k * dt; e.kbT = 0.5;
          if (!g.hitSet.has(e)) { g.hitSet.add(e); G.fx.norm.spawn(e.pos.x, e.pos.y + 1, e.pos.z, g.dx * 6, 1, g.dz * 6, 0.5, 0.3, 1.2, 0.9, 0.95, 1.0, 0.6, 0, 1); }
        }
      } else if (g.warn) { g.warn.end(); g.warn = null; }
      if (!on && g.flow && !g.flowEnd) { g.flowEnd = true; g.flow.end(); }
      return tb < GA.blow + 1.2;
    },
    restore(g) { if (g.orb) { g.orbM.emissiveIntensity = 0.2; g.glow.visible = false; } if (g.light) g.light.intensity = 0; },
  };
  const mouth = (g) => V(g.x + g.dx * 0.85, 2.2, g.z + g.dz * 0.85);
  // a ring of wind: a pale band that leaves the mouth and races down the lane, growing and fading
  function windRing(g, m, dir) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.045, 6, 40), new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    r.position.copy(m); r.rotation.y = Math.atan2(dir.x, dir.z); G.scene.add(r);
    let t = 0; const life = Math.min(1.1, g.len / GA.speed);
    Gm.fx.push({
      update(dt) { t += dt; const k = t / life; r.position.set(m.x + dir.x * GA.speed * t, m.y - k * 0.8, m.z + dir.z * GA.speed * t); r.scale.setScalar(0.4 + k * 2.4); r.material.opacity = 0.7 * (1 - k); return k < 1; },
      dispose() { G.scene.remove(r); r.geometry.dispose(); r.material.dispose(); },
    });
  }
  // (fieldgen_t4.js sanctum) a statue at (x, z) on an island's rim, blowing along (dx, dz) for len metres
  Gm.addGale = function (w, x, z, dx, dz, len) {
    const g = Gm.add(w, 'gale', { x, z, dx, dz, len, use: V(x + dx * 0.85, 2.2, z + dz * 0.85), useR: 1.1, useD: 3.8 });
    Gm.col(w, g, x - 0.85, 0, z - 0.85, x + 0.85, 3.7, z + 0.85, { surf: 'stone' });
    g.hb.push({ p: V(x, 2.5, z), r: 1.2 }, { p: V(x, 0.8, z), r: 1.0 });
    return g;
  };
  Gm.GA = GA;
})();
