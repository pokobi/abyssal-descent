'use strict';
// Field gimmicks (gimmick.js) of the upper fields:
//   bell   - 霧の廃村: the chapel's bell. Pull its rope or shoot it: it tolls three times, and every toll is a golden wave that spreads 25 m
//            over the village; each monster it reaches staggers (about 2.5 s in all). Nothing happens to you.
//   pillar - 黄昏の廃都: a great cracked pillar, leaning. A few shots or a heavy blow or a blast and it falls the way it leans: whatever the
//            falling shaft passes through is crushed (the lane on the floor is exactly where it lands), and it stays where it fell as low cover.
//   oil    - 血月の古城: a cauldron of boiling oil on the wall walk. Tip it (the key, a shot, a blow): the oil pours over the parapet and
//            spreads burning over the scorched patch below the wall (7 x 4 m): a scald for whoever is there, then it burns for 9 s.
(function () {
  const Gm = G.Gim, U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const R = Math.random, rnd = (a, b) => a + R() * (b - a);
  const ease = (k) => 1 - (1 - k) * (1 - k), smooth = (k) => k * k * (3 - 2 * k);
  const C = () => G.combat, P = () => G.player;

  // ================================================================ 霧の廃村: the chapel bell
  const BELL_R = 25, TOLL = [0.45, 1.35, 2.25], WAVE_T = 0.6;
  let bellGeo = null;
  function bellShape() {
    if (bellGeo) return bellGeo;
    // the profile of a real bell, crown to lip and back up the inside: shoulder, waist, the thick sound-bow, a flared lip
    const o = [[0.001, 0], [0.3, 0], [0.42, -0.07], [0.48, -0.24], [0.47, -0.55], [0.5, -0.86], [0.58, -1.1], [0.71, -1.31], [0.8, -1.45], [0.79, -1.53], [0.71, -1.52],
      [0.62, -1.41], [0.49, -1.12], [0.42, -0.62], [0.36, -0.22], [0.001, -0.13]];
    bellGeo = new THREE.LatheGeometry(o.map(([r, y]) => new THREE.Vector2(r, y)), 40);
    bellGeo.computeVertexNormals();
    return bellGeo;
  }
  Gm.K.bell = {
    name: '弔いの鐘', icon: '🔔', rc: '#e8c070', cat: '鳴らす — 綱を引くか、鐘を撃つ',
    desc: '三度鳴り、響きの届いた敵（約25m）が鳴るたびに怯む。一度きり。',
    interact: { verb: '綱を引く', doing: '綱を引いている…', dur: 1.0 },
    build(g, w) {
      const grp = new THREE.Group(); grp.position.set(g.x, g.py, g.z); w.group.add(grp);
      const bronze = new THREE.MeshStandardMaterial({ color: 0x8c5c26, metalness: 0.92, roughness: 0.34, emissive: 0x6a3a08, emissiveIntensity: 0.1 });
      const patina = new THREE.MeshStandardMaterial({ color: 0x4f7a64, metalness: 0.4, roughness: 0.75 });
      const iron = w.mats.iron, wood = w.mats.woodDark;
      const bell = new THREE.Mesh(bellShape(), bronze); bell.position.y = -0.12; bell.castShadow = true; grp.add(bell);
      // raised bands round the shoulder and the sound-bow (green with age), the crown's loops on top
      for (const [r, y, t] of [[0.475, -0.36, 0.022], [0.52, -0.95, 0.02], [0.79, -1.47, 0.03]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 40), patina); b.rotation.x = Math.PI / 2; b.position.y = y - 0.12; grp.add(b); }
      for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12), bronze); c.position.set(Math.cos(i * 1.57) * 0.12, 0.0, Math.sin(i * 1.57) * 0.12); c.rotation.y = i * 1.57; grp.add(c); }
      // the clapper on its own pivot (it lags the bell and strikes the bow)
      const clap = new THREE.Group(); clap.position.y = -0.22; grp.add(clap);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6), iron); rod.position.y = -0.5; clap.add(rod);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), iron); ball.position.y = -1.08; clap.add(ball);
      // the headstock: an oak beam bound with iron, turning with the bell; the rope wheel on one end
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.34, 0.4), wood); beam.position.y = 0.12; beam.castShadow = true; grp.add(beam);
      for (const sx of [-1.1, -0.35, 0.35, 1.1]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.44), iron); s.position.set(sx, 0.12, 0); grp.add(s); }
      const wheel = new THREE.Group(); wheel.position.set(g.rx * 1.25, 0.12, 0); grp.add(wheel);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.05, 6, 32), wood); rim.rotation.y = Math.PI / 2; wheel.add(rim);
      for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.62, 0.06), wood); sp.rotation.x = i * Math.PI / 6; wheel.add(sp); }
      // the bearings on the piers stay put
      for (const sx of [-1.45, 1.45]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.5), iron); b.position.set(g.x + sx, g.py + 0.0, g.z); w.group.add(b); }
      // the rope: off the wheel, over a pulley on the tower's edge, down the outside of the tower to a striped sally you can reach
      const rope = new THREE.MeshStandardMaterial({ color: 0x7a5a36, roughness: 0.95 });
      const wx = g.x + g.rx * 1.25, top = V(wx, g.py + 0.12 - 0.82, g.z), pul = V(g.x + g.rx * (g.s + 0.14), g.h + 0.3, g.z);
      const seg = (a, b, r, mat) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize()); return m; };
      w.group.add(seg(top, pul, 0.03, rope));
      const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 14), iron); pulley.position.copy(pul); pulley.rotation.y = Math.PI / 2; w.group.add(pulley);
      const hang = new THREE.Group(); hang.position.set(pul.x, 0, pul.z); w.group.add(hang);
      const ropeV = seg(V(0, pul.y, 0), V(0, 1.95, 0), 0.03, rope); hang.add(ropeV);
      const red = new THREE.MeshStandardMaterial({ color: 0x8a1c1a, roughness: 0.9 }), cream = new THREE.MeshStandardMaterial({ color: 0xd8c8a2, roughness: 0.9 });
      for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8), i % 2 ? cream : red); s.position.y = 1.31 + i * 0.12; hang.add(s); }
      hang.add(seg(V(0, 1.31, 0), V(0, 0.95, 0), 0.028, rope));
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), rope); knot.position.y = 0.93; hang.add(knot);
      // a soft gold glow round the bell (the marker: it hums faintly until it has rung)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xffc860, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(3.6, 3.6, 1); glow.position.y = -0.8; grp.add(glow);
      Object.assign(g, { grp, bell, clap, wheel, hang, glow, bronze, ph: R() * 6 });
    },
    idle(g, dt) {
      g.ph += dt;
      if (!g.grp) return;
      const sway = Math.sin(g.ph * 0.8) * 0.02 + (g.pull || 0) * 0.16;
      g.grp.rotation.x = sway; g.clap.rotation.x = -sway * 0.4;
      g.bronze.emissiveIntensity = 0.08 + 0.08 * (0.5 + 0.5 * Math.sin(g.ph * 2.2));
      g.glow.material.opacity = 0.16 + 0.1 * (0.5 + 0.5 * Math.sin(g.ph * 2.2));
      if (R() < dt * 1.5) G.fx.add.spawn(g.x + rnd(-1, 1), g.py - rnd(0.4, 1.6), g.z + rnd(-1, 1), 0, rnd(0.2, 0.5), 0, 1.6, 0.06, 0.01, 1.3, 1.0, 0.5, 0.8, -0.05, 0.4);
    },
    searching(g, k) { g.pull = k; if (g.hang) g.hang.position.y = -k * 0.45; },
    start(g) {
      g.hits = TOLL.map(() => new Set()); g.tolled = 0; g.pull = 0; if (g.hang) g.hang.position.y = 0;
      G.sfx.chain && G.sfx.chain(0.5, 0.4);
    },
    run(g, dt) {
      const t = g.t, amp = 0.62 * smooth(Math.min(1, t / 0.45)) * (t < 2.4 ? 1 : Math.exp(-(t - 2.4) * 1.3));
      const th = amp * Math.sin(Math.PI * t / 0.9);
      if (g.grp) {
        g.grp.rotation.x = th; g.wheel.rotation.x = 0;
        // the clapper hangs back, then flies to the side the bell swings to and strikes it at the top of each swing
        let rel = -th * 0.35;
        for (const T of TOLL) { const x = t - T; if (x > -0.12 && x < 0.15) rel = Math.sign(Math.sin(Math.PI * T / 0.9)) * 0.3 * (1 - Math.abs(x) / 0.15); }
        g.clap.rotation.x = rel;
        if (g.hang) g.hang.position.y = -Math.max(0, th) * 0.6 + Math.min(0, th) * 0.2;
        g.bronze.emissiveIntensity = Math.max(0.02, g.bronze.emissiveIntensity - dt * 0.3);
        g.glow.material.opacity = Math.max(0, g.glow.material.opacity - dt * 0.3);
      }
      while (g.tolled < TOLL.length && t >= TOLL[g.tolled]) toll(g, g.tolled++);
      // each toll's wave: a monster staggers when the wave's front reaches it (the dome, the ring on the ground: the same curve)
      for (let i = 0; i < g.tolled; i++) {
        const k = (t - TOLL[i]) / WAVE_T; if (k > 1.05) continue;
        const Rf = BELL_R * ease(Math.min(1, k));
        for (const e of Gm.foes()) {
          if (g.hits[i].has(e)) continue;
          if (Math.hypot(e.pos.x - g.x, e.pos.z - g.z) > Math.min(BELL_R, Rf) + (e.radius || 0.5) * 0.5) continue;
          g.hits[i].add(e);
          Gm.stunFoe(e, 0.95);
          G.fx.ring(e.pos.clone(), (e.radius || 0.5) * 2.4, 0xffd070, 0.35);
        }
      }
      return t < 6.5;
    },
    restore(g) { if (g.grp) { g.grp.rotation.x = 0; g.bronze.emissiveIntensity = 0; g.glow.visible = false; } },
  };
  function toll(g, i) {
    const bp = V(g.x, g.py - 0.8, g.z), ground = V(g.x, 0, g.z);
    G.sfx.bell();
    G.fx.flash(bp, 0xffd27a, 3.2, 0.3, 40);
    G.vfx.nova(ground, BELL_R, WAVE_T, { style: 'gold', dome: false }); // (the ring on the ground: the wave's front, on the curve the stagger uses)
    soundWall(ground, BELL_R);
    ripples(bp, BELL_R, i);
    Gm.shake(bp, 0.32, 34);
    // dust and grit shaken out of the belfry, a ring of light round the bell
    for (let k = 0; k < 18; k++) G.fx.norm.spawn(g.x + rnd(-2, 2), g.h + rnd(0.4, 3.2), g.z + rnd(-2, 2), rnd(-0.3, 0.3), rnd(-0.5, 0.2), rnd(-0.3, 0.3), rnd(1, 1.8), 0.12, 0.5, 0.55, 0.5, 0.42, 0.55, 3, 0.6);
    if (G.fx.debris) G.fx.debris(V(g.x, g.h + 3.3, g.z), G.world.mats.trim, 4, 0.06, 2);
    // the crows on the tower take off at the first toll
    if (i === 0) for (let k = 0; k < 16; k++) { const a = R() * 6.28; G.fx.norm.spawn(g.x + Math.cos(a) * 1.5, g.h + rnd(3.5, 6), g.z + Math.sin(a) * 1.5, Math.cos(a) * rnd(3, 6), rnd(2.5, 5), Math.sin(a) * rnd(3, 6), rnd(2.2, 3.4), 0.22, 0.2, 0.05, 0.05, 0.06, 0.95, -0.6, 0.15); }
  }
  // the wave itself: a low wall of gold light standing on the front as it sweeps out over the village (its foot is the ground ring)
  function soundWall(c, Rmax) {
    const wl = G.vfx.wall(c, 0.5, 3.4, 0xffcf70, WAVE_T + 0.1, { alpha: 0.9 }); let t = 0;
    Gm.fx.push({ update(dt) { t += dt; const q = Math.min(1, t / WAVE_T); wl.r = Math.max(0.5, Rmax * ease(q)); wl.a0 = 0.9 * (1 - q * q * 0.85); return q < 1; }, dispose() { wl.end(0.05); } });
  }
  // rings of sound: thin gold bands that race out from the bell across the roofs
  function ripples(c, Rmax, i) {
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.965, 1.0, 128), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.rotation.x = -Math.PI / 2 + (k - 1) * 0.05; m.rotation.z = i * 0.7; m.position.copy(c).setY(c.y - k * 1.6); m.frustumCulled = false; m.renderOrder = 7; G.scene.add(m);
      let t = -k * 0.07;
      Gm.fx.push({
        update(dt) { t += dt; if (t < 0) return true; const q = Math.min(1, t / WAVE_T); const r = Math.max(0.5, Rmax * ease(q)); m.scale.set(r, r, 1); m.material.opacity = (1 - q) * (0.85 - k * 0.2); return q < 1; },
        dispose() { G.scene.remove(m); m.geometry.dispose(); m.material.dispose(); },
      });
    }
    // and a bright ring that bursts off the bell itself
    const b = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    b.position.copy(c); b.rotation.x = Math.PI / 2; G.scene.add(b); let tb = 0;
    Gm.fx.push({ update(dt) { tb += dt; const q = Math.min(1, tb / 0.35); b.scale.setScalar(0.9 + q * 2.4); b.material.opacity = 0.9 * (1 - q); return q < 1; }, dispose() { G.scene.remove(b); b.geometry.dispose(); b.material.dispose(); } });
  }
  Gm.bellTower = function (w, x, z, h, s, rx) {
    // (fieldgen_t1.js belltower: the bell in its belfry; rx: the side the rope comes down, +1 east / -1 west)
    const py = h + 3.0;
    const g = Gm.add(w, 'bell', { x, z, h, s, rx, py, use: V(x + rx * (s + 0.14), 1.6, z), useR: 0.9, useD: 3.2 });
    Gm.col(w, g, x - 0.85, py - 1.7, z - 0.85, x + 0.85, py + 0.1, z + 0.85, { shotOnly: true, surf: 'metal' });
    g.hb.push({ p: V(x, py - 0.8, z), r: 1.0 });
    return g;
  };

  // ================================================================ 黄昏の廃都: the cracked great pillars
  const PIL = { R: 0.72, H: 7.55, base: 0.5, drums: 5, lean: 0.035, k: 4.5, w0: 0.6, creak: 0.8, laneHW: 1.25, laneL: 9.0, cap: 0.82 };
  // a fluted drum: a cylinder whose surface dips into 20 flutes
  function flutedDrum(r0, r1, h, seed) {
    const g = new THREE.CylinderGeometry(r1, r0, h, 80, 2, false), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i), rr = Math.hypot(x, z); if (rr < 0.05) continue;
      const a = Math.atan2(z, x), f = 0.5 + 0.5 * Math.cos(a * 20), chip = Math.abs(y) > h * 0.42 ? 0.04 * Math.max(0, Math.sin(a * 3 + seed) - 0.6) : 0;
      const k = 1 - 0.035 * f - chip; p.setX(i, x * k); p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    return g;
  }
  // a crack: a jagged ribbon wound up the shaft's surface (its own coordinates: around a0..a1 radians, from y0 to y1)
  function crackGeo(rOf, a0, y0, a1, y1, n, w, seed) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const k = i / n, jig = Math.sin(seed + i * 2.7) * 0.09 * (i % 2 ? 1 : -1); pts.push([a0 + (a1 - a0) * k + jig, y0 + (y1 - y0) * k + Math.sin(seed * 3 + i) * 0.05]); }
    const pos = [], idx = [];
    pts.forEach(([a, y], i) => {
      const nx = Math.cos(a), nz = Math.sin(a), ww = w * (0.5 + 0.5 * Math.sin(i * 1.3 + seed)) + w * 0.4, r = rOf(y);
      pos.push(nx * r, y - ww, nz * r, nx * r, y + ww, nz * r);
      if (i) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // the falling angle (from upright) against time: the pillar topples like a stick (angle'' = k sin angle), worked out once so every
  // screen draws and hits with the same curve
  function fallTable() {
    const dt = 1 / 240, out = [PIL.lean]; let th = PIL.lean, w = PIL.w0;
    while (th < Math.PI / 2 && out.length < 2000) { w += PIL.k * Math.sin(th) * dt; th = Math.min(Math.PI / 2, th + w * dt); out.push(th); }
    return { tab: out, dt, T: (out.length - 1) * dt };
  }
  const FALL = fallTable();
  const fallAt = (t) => { const i = Math.min(FALL.tab.length - 1, Math.max(0, t / FALL.dt)); const a = Math.floor(i), b = Math.min(FALL.tab.length - 1, a + 1); return FALL.tab[a] + (FALL.tab[b] - FALL.tab[a]) * (i - a); };
  // as it comes down it slides off its plinth (the last stretch): how far forward and how high its foot is
  const slideOf = (th) => { const k = smooth(U.clamp((th - 1.15) / (Math.PI / 2 - 1.15), 0, 1)); return { s: PIL.R + 0.28 * k, y: PIL.base * (1 - k) }; };
  Gm.K.pillar = {
    name: '崩れかけた大柱', icon: '🏛️', rc: '#e0b080', cat: '撃つ・叩く・爆発で倒れる',
    desc: '傾いている向きへ倒れ、下にいる者を押し潰す（自分も）。倒れた柱は低い遮蔽物として残る。一度きり。',
    build(g, w) {
      const stone = w.mats.block, dark = new THREE.MeshBasicMaterial({ color: 0x120a05 });
      const glowM = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const root = new THREE.Group(); w.group.add(root);
      const ax = V(g.dz, 0, -g.dx).normalize(), back = V(-g.dx * PIL.R, 0, -g.dz * PIL.R);
      const parts = [], hd = 6.9 / PIL.drums;
      const torus = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.1, 8, 32), stone); torus.rotation.x = Math.PI / 2; torus.position.set(back.x, 0.08, back.z); root.add(torus); parts.push({ m: torus, y: 0.08 });
      for (let i = 0; i < PIL.drums; i++) {
        const r0 = PIL.R - 0.016 * i, r1 = PIL.R - 0.016 * (i + 1);
        const m = new THREE.Mesh(flutedDrum(r0, r1, hd - 0.012, g.seed + i), stone); m.castShadow = true; m.receiveShadow = true;
        m.position.set(back.x, hd * (i + 0.5), back.z); m.rotation.y = R() * 6; root.add(m); parts.push({ m, y: hd * (i + 0.5), i });
      }
      // the capital: a swelling echinus under a square abacus with a corner broken away
      const ech = new THREE.Mesh(new THREE.CylinderGeometry(0.93, PIL.R - 0.08, 0.34, 32), stone); ech.position.set(back.x, 6.9 + 0.17, back.z); root.add(ech); parts.push({ m: ech, y: 6.9 + 0.17, cap: true });
      const abG = new THREE.Group(); abG.position.set(back.x, 7.39, back.z); root.add(abG); parts.push({ m: abG, y: 7.39, cap: true });
      const a1 = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.32, 1.2), stone); a1.position.z = -0.22; abG.add(a1);
      const a2 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 0.44), stone); a2.position.set(-0.245, 0, 0.6); abG.add(a2);
      abG.rotation.y = R() * 6; for (const m of [ech, a1, a2]) m.castShadow = true;
      // cracks: dark seams up the back of the leaning shaft (and one in front), with a sliver of sunset light deep in them that grows as it gives
      const cracks = [], rOf = (y) => PIL.R - 0.016 * U.clamp(y / hd, 0, PIL.drums) + 0.008; // (on the tapering shaft's surface, just proud of the flutes' ridges)
      for (const [a0, y0, a1c, y1, n] of [[Math.PI, 0.25, Math.PI + 0.9, 3.4, 9], [Math.PI - 0.6, 1.4, Math.PI - 1.4, 4.6, 8], [0.2, 0.3, -0.25, 1.6, 5], [Math.PI + 0.3, 5.0, Math.PI + 1.1, 6.6, 6]]) {
        const base = Math.atan2(-g.dz, -g.dx); // (radians round the shaft measured from the fall side's back)
        const cg = crackGeo(rOf, base + a0 - Math.PI, y0, base + a1c - Math.PI, y1, n, 0.03, g.seed + a0);
        const dm = new THREE.Mesh(cg, dark); dm.position.copy(back); root.add(dm);
        // (the light is a wider seam just under the dark one: it shows round it, leaking out of the crack as the stone gives)
        const gm = new THREE.Mesh(crackGeo((y) => rOf(y) - 0.002, base + a0 - Math.PI, y0, base + a1c - Math.PI, y1, n, 0.09, g.seed + a0), glowM); gm.position.copy(back); root.add(gm);
        cracks.push(dm, gm);
        const di = Math.min(PIL.drums - 1, Math.floor((y0 + y1) / 2 / hd)); // (a crack moves with the drum it is mostly on when they part)
        parts.push({ m: dm, y: 0, i: di }, { m: gm, y: 0, i: di });
      }
      // grit fallen at its foot
      for (let i = 0; i < 5; i++) { const a = R() * 6.28, d = rnd(1.1, 1.7); const c = new THREE.Mesh(G.Props.PG.dode, stone); c.scale.setScalar(rnd(0.08, 0.2)); c.position.set(g.x + Math.cos(a) * d, 0.06, g.z + Math.sin(a) * d); c.rotation.set(R() * 3, R() * 3, R() * 3); w.group.add(c); }
      Object.assign(g, { root, ax, parts, glowM, cracks, sandT: rnd(0.5, 2), shk: 0, th: PIL.lean });
      pose(g, PIL.lean, { s: PIL.R, y: PIL.base });
    },
    idle(g, dt) {
      g.sandT -= dt; g.shk = Math.max(0, g.shk - dt * 5);
      if (g.shk > 0) pose(g, PIL.lean + (R() - 0.5) * 0.004 * g.shk, { s: PIL.R, y: PIL.base });
      g.glowM.opacity = U.damp(g.glowM.opacity, Math.min(0.9, g.dmg / 5) * (0.75 + 0.25 * Math.sin(G.game.time * 6)), 6, dt);
      if (g.sandT <= 0) { g.sandT = rnd(1.5, 3.5) * (g.dmg > 2 ? 0.4 : 1); sand(g, 7); }
    },
    hit(g, kind, pos) {
      g.dmg += { bullet: 1, melee: 3, explosion: 3, flame: 0.12 }[kind] || 1; g.shk = 1;
      const p = pos || V(g.x, 2, g.z);
      if (kind !== 'flame') { G.fx.debris(p, G.world.mats.block, kind === 'bullet' ? 3 : 8, 0.07, 3.5); G.fx.dust(p, null, 0xb8a080, kind === 'bullet' ? 3 : 8); sand(g, 5); }
      if (g.dmg >= 2.5 && !g.groaned) { g.groaned = true; G.sfx.stoneGrind && G.sfx.stoneGrind(V(g.x, 3, g.z), 0.6); }
      if (g.dmg >= 5) Gm.trigger(g, { by: kind });
    },
    start(g) {
      g.hitSet = new Set(); g.meHit = false; g.landed = false; g.th = PIL.lean;
      const base = V(g.x, 0, g.z), dir = V(g.dx, 0, g.dz);
      g.warn = Gm.warn({ c: base.clone().addScaledVector(dir, PIL.laneL / 2), yaw: Math.atan2(g.dx, g.dz), hx: PIL.laneHW, hz: PIL.laneL / 2, from: 'base', manual: true, col: 0xff3a1a });
      G.sfx.stoneGrind && G.sfx.stoneGrind(V(g.x, 2, g.z), PIL.creak + FALL.T);
      G.sfx.rumble && G.sfx.rumble(PIL.creak + FALL.T, 0.5);
      if (g.glowM) g.glowM.opacity = 1;
    },
    run(g, dt) {
      const t = g.t;
      if (t < PIL.creak) {
        // it creaks: shudders harder and harder, grit pours out of the cracks
        const k = t / PIL.creak;
        if (g.root) pose(g, PIL.lean + Math.sin(t * 38) * 0.006 * k, { s: PIL.R, y: PIL.base });
        if (R() < dt * 30) sand(g, 3);
        if (g.warn) g.warn.k = 0.12 * k;
        return true;
      }
      if (!g.fell) { g.fell = true; for (const c of g.cols || []) if (c !== g.lying) G.world.removeCollider(c); }
      const tf = t - PIL.creak, th = tf >= FALL.T ? Math.PI / 2 : fallAt(tf), sl = slideOf(th);
      g.th = th;
      if (g.root) pose(g, th, sl, tf >= FALL.T ? Math.min(1, (tf - FALL.T) / 0.45) : 0, Math.min(1, tf / FALL.T));
      if (g.warn) g.warn.k = 0.12 + 0.88 * Math.sin(th);
      // dust streams off the top as it comes down
      if (tf < FALL.T && g.root && R() < dt * 40) { const tp = axisPoint(g, th, sl, PIL.H); G.fx.norm.spawn(tp.x, tp.y, tp.z, rnd(-0.5, 0.5), rnd(-0.2, 0.6), rnd(-0.5, 0.5), rnd(0.8, 1.4), 0.4, 1.6, 0.72, 0.64, 0.5, 0.4, 0.2, 1.5); }
      crush(g, th, sl, false);
      if (tf >= FALL.T && !g.landed) land(g);
      if (g.landed && g.glowM) g.glowM.opacity = Math.max(0, g.glowM.opacity - dt * 0.9); // (the light in the cracks dies once it is down)
      return tf < FALL.T + 1.2;
    },
    restore(g) {
      for (const c of g.cols || []) G.world.removeCollider(c);
      g.fell = true; g.th = Math.PI / 2;
      if (g.root) pose(g, Math.PI / 2, slideOf(Math.PI / 2), 1, 1);
      if (g.glowM) g.glowM.opacity = 0;
      lie(g);
    },
  };
  // where a point of the shaft's axis is, `u` metres up it, at angle th (sl: the foot's slide)
  function axisPoint(g, th, sl, u) {
    const c = Math.cos(th), s = Math.sin(th), h = -PIL.R * c + u * s + sl.s;
    return V(g.x + g.dx * h, sl.y + PIL.R * s + u * c, g.z + g.dz * h);
  }
  // lay the pillar at angle th: the whole thing turns about its front foot (sl: slid forward s, its foot at height y);
  // land 0..1: the drums settle apart once it is down; fall 0..1: they part a little on the way down
  function pose(g, th, sl, land, fall) {
    const root = g.root; if (!root) return;
    root.position.set(g.x + g.dx * sl.s, sl.y, g.z + g.dz * sl.s);
    root.quaternion.setFromAxisAngle(g.ax, th);
    for (const p of g.parts) {
      const back = -PIL.R, gap = (p.i !== undefined ? p.i : p.cap ? PIL.drums + 0.3 : 0) * ((fall || 0) * 0.012 + (land || 0) * 0.05);
      // (in the root's own frame: the shaft runs up y, the fall side is (dx, dz); once down, 'up' in the world is the root's -fall side)
      const bounce = land ? Math.sin(Math.min(1, land) * Math.PI) * 0.14 * ((p.i || 0) % 2 ? 1 : 0.6) : 0;
      p.m.position.set(g.dx * back - g.dx * bounce, p.y + gap, g.dz * back - g.dz * bounce);
      if (p.cap && land) { p.m.position.y += 0.18 * land; }
    }
  }
  function sand(g, n) {
    if (!g.root) return;
    const a = Math.atan2(-g.dz, -g.dx) + rnd(-0.6, 0.6), y = rnd(0.8, 3.2), r = PIL.R + 0.05;
    const p = V(g.x + Math.cos(a) * r, y, g.z + Math.sin(a) * r);
    for (let i = 0; i < n; i++) G.fx.norm.spawn(p.x + rnd(-0.05, 0.05), p.y - i * 0.05, p.z + rnd(-0.05, 0.05), Math.cos(a) * 0.3, rnd(-0.4, 0), Math.sin(a) * 0.3, rnd(0.6, 1.1), 0.05, 0.12, 0.78, 0.68, 0.5, 0.85, 9, 0.2);
  }
  // what the falling shaft passes through: a monster whose body the shaft reaches is crushed the moment the shaft comes down into it
  // (its body: radius and height; the shaft: its axis and radius), you the same (your body: 0.4 m round, 1.8 m tall)
  function crush(g, th, sl, landing) {
    const s = Math.sin(th), c = Math.cos(th);
    if (s < 0.05) return;
    const reach = (px, pz, py, top, rad) => {
      const rx = px - g.x, rz = pz - g.z, along = rx * g.dx + rz * g.dz, lat = Math.abs(rx * g.dz - rz * g.dx);
      const u = (along - sl.s + PIL.R * c) / s;
      if (u < -0.3 || u > PIL.H + 0.2) return false;
      const capPart = u > 6.85, wide = capPart ? PIL.cap : PIL.R;
      if (lat > wide + rad) return false;
      const y = sl.y + PIL.R * s + u * c;
      return landing ? py < 1.6 : (y - wide < top && y + wide > py - 0.2);
    };
    for (const e of Gm.foes()) {
      if (g.hitSet.has(e)) continue;
      if (!reach(e.pos.x, e.pos.z, e.pos.y, e.pos.y + (e.height || 1.8), (e.radius || 0.5) * 0.8)) continue;
      g.hitSet.add(e);
      Gm.hurtFoe(e, 0.4); Gm.stunFoe(e, 1.5);
      G.fx.blood(e.centerPos(), V(0, -1, 0), e.bloodColor || 0x6a0a0a, 10); G.fx.dust(e.pos.clone(), null, 0xb8a080, 6);
    }
    const Pl = P();
    if (!g.meHit && Pl && !Pl.dead && reach(Pl.pos.x, Pl.pos.z, Pl.pos.y, Pl.pos.y + 1.8, 0.4)) { g.meHit = true; Gm.hurtMe(0.15, { pos: V(g.x, 1, g.z) }); Pl.addShake(0.6); }
  }
  // it hits the ground: a burst of dust and stone all along it, the floor cracks, it now lies there as a low wall
  function land(g) {
    g.landed = true;
    const sl = slideOf(Math.PI / 2), w = G.world;
    crush(g, Math.PI / 2, sl, true);
    if (g.warn) { g.warn.k = 1; g.warn.end(); }
    const mid = axisPoint(g, Math.PI / 2, sl, PIL.H / 2);
    G.sfx.explosion(mid, 0.9); G.sfx.impact(mid, 'stone'); G.sfx.breakObj && G.sfx.breakObj(mid, 'stone');
    Gm.shake(mid, 0.85, 26);
    for (let u = 0; u <= PIL.H; u += 0.6) {
      const p = axisPoint(g, Math.PI / 2, sl, u); p.y = 0.2;
      for (let k = 0; k < 4; k++) { const side = k % 2 ? 1 : -1; G.fx.norm.spawn(p.x, p.y + rnd(0, 0.5), p.z, g.dz * side * rnd(2, 6) + g.dx * rnd(-1, 1), rnd(0.5, 2.5), -g.dx * side * rnd(2, 6) + g.dz * rnd(-1, 1), rnd(1.2, 2.4), 0.6, 2.6, 0.74, 0.66, 0.52, 0.55, 0.3, 1.8); }
      if (u % 1.8 < 0.6) G.fx.debris(p.clone().setY(0.6), w.mats.block, 5, 0.12, 5);
      if (u % 2.4 < 0.6 && G.fx.decal) G.fx.decal(p.clone().setY(0.01), V(0, 1, 0), 'crack', 2.2, true);
    }
    lie(g);
  }
  // the fallen shaft as a collider (the drums lie inside it), the floor around it walked again, and nobody left inside it
  function lie(g) {
    const w = G.world, sl = slideOf(Math.PI / 2);
    const a = sl.s - 0.15, b = sl.s + PIL.H + 0.5, hw = PIL.cap + 0.03; // (the capital rolls a little past the end of the shaft: 0.5)
    const p0 = V(g.x + g.dx * a, 0, g.z + g.dz * a), p1 = V(g.x + g.dx * b, 0, g.z + g.dz * b);
    const x0 = Math.min(p0.x, p1.x) - (g.dx ? 0 : hw), x1 = Math.max(p0.x, p1.x) + (g.dx ? 0 : hw), z0 = Math.min(p0.z, p1.z) - (g.dz ? 0 : hw), z1 = Math.max(p0.z, p1.z) + (g.dz ? 0 : hw);
    if (!g.lying) g.lying = Gm.col(w, g, x0, 0, z0, x1, PIL.R * 2, z1, { surf: 'stone' });
    w.navPatch(Math.min(x0, g.x - 1.5) - 1, Math.min(z0, g.z - 1.5) - 1, Math.max(x1, g.x + 1.5) + 1, Math.max(z1, g.z + 1.5) + 1);
    const out = (pos, r) => {
      if (pos.x < x0 - r || pos.x > x1 + r || pos.z < z0 - r || pos.z > z1 + r || pos.y > PIL.R * 2) return false;
      const lat = (pos.x - g.x) * g.dz - (pos.z - g.z) * g.dx, side = lat >= 0 ? 1 : -1, need = hw + r + 0.05;
      pos.x += g.dz * side * (need - Math.abs(lat)); pos.z -= g.dx * side * (need - Math.abs(lat));
      return true;
    };
    for (const e of Gm.foes()) if (out(e.pos, e.radius || 0.5) && e.vel) e.vel.set(0, 0, 0);
    const Pl = P(); if (Pl && out(Pl.pos, 0.42)) { Pl.vel.x = Pl.vel.z = 0; w.depenetrate(Pl.pos, Pl.hw, Pl.height); }
  }
  Gm.addPillar = function (w, x, z, dx, dz, seed) {
    // (fieldgen_t1.js dusk: the plinth is part of the world; the shaft is ours)
    w.solid('block', x - 0.95, 0, z - 0.95, x + 0.95, PIL.base, z + 0.95, { uv: 1 });
    const g = Gm.add(w, 'pillar', { x, z, dx, dz, seed, look: V(x, 1.7, z), useR: 1.0, useD: 6 });
    const lx = PIL.lean * PIL.H + 0.05;
    Gm.col(w, g, x - 0.78 + Math.min(0, dx) * lx, PIL.base, z - 0.78 + Math.min(0, dz) * lx, x + 0.78 + Math.max(0, dx) * lx, PIL.base + PIL.H, z + 0.78 + Math.max(0, dz) * lx, { surf: 'stone' });
    for (const y of [1.4, 3.3, 5.2, 7.1]) g.hb.push({ p: V(x + dx * PIL.lean * y, y, z + dz * PIL.lean * y), r: 0.85 });
    return g;
  };
  Gm.PIL = PIL;

  // ================================================================ 血月の古城: the cauldrons of boiling oil
  const OIL = { tip: 0.55, imp: 0.75, spread: 0.3, burn: 9, ang: 1.75 };
  let potGeo = null, potInner = null;
  // a cauldron that turns on trunnions through its middle (y = 0): rounded belly, a heavy rolled rim
  function potShape() {
    if (potGeo) return;
    const o = [[0.001, -0.55], [0.3, -0.53], [0.58, -0.41], [0.76, -0.17], [0.8, 0.07], [0.74, 0.31], [0.68, 0.41], [0.74, 0.45], [0.74, 0.51], [0.64, 0.51]];
    potGeo = new THREE.LatheGeometry(o.map(([r, y]) => new THREE.Vector2(r, y)), 32);
    const i = [[0.62, 0.49], [0.66, 0.31], [0.7, 0.07], [0.66, -0.17], [0.5, -0.39], [0.001, -0.45]];
    potInner = new THREE.LatheGeometry(i.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  }
  const OILS_VS = `varying vec2 vP; ${Gm.FOG_VS} void main() { vP = position.xz; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const OILS_FS = `uniform float uT; uniform float uA; ${Gm.FOG_FS} varying vec2 vP; ${Gm.NOISE}
    void main() {
      vec2 q = vP * 7.0; vec2 i = floor(q), f = fract(q);
      float b = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y)); float h = h21(i + o); vec2 c = o + vec2(h, fract(h * 7.3)) - f;
        float ph = fract(uT * (0.5 + h) + h * 9.0), rr = ph * 0.45; b = max(b, (1.0 - smoothstep(rr - 0.06, rr, length(c))) * smoothstep(rr - 0.12, rr - 0.06, length(c)) * (1.0 - ph));
      }
      float n = fbm(vP * 3.0 + uT * 0.4);
      vec3 col = mix(vec3(0.16, 0.07, 0.01), vec3(0.62, 0.32, 0.05), n * 0.7);
      col += b * vec3(1.0, 0.7, 0.3);
      ${Gm.fogv}
      gl_FragColor = vec4(mix(uFogC, col, fogv), uA);
    }`;
  // the spilt oil on the floor: it spreads from where the pour lands, burns while the field burns, then lies dark and glossy
  const POOL_VS = `uniform vec2 uS; varying vec2 vP; ${Gm.FOG_VS} void main() { vP = position.xz * uS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const POOL_FS = `uniform float uT; uniform vec2 uH; uniform vec2 uImp; uniform float uFront; uniform float uBurn; uniform float uScorch; ${Gm.FOG_FS} varying vec2 vP; ${Gm.NOISE}
    void main() {
      vec2 q = uH - abs(vP); float edge = min(q.x, q.y);
      float n0 = fbm(vP * 0.9);
      float ins = smoothstep(-0.02, 0.12 + n0 * 0.1, edge);
      // the scorched patch that marks the spot (always there)
      float soot = smoothstep(-0.5, 0.6, edge + n0 * 0.9) * uScorch;
      float d = length(vP - uImp), wob = (fbm(vP * 1.4 + 3.0) - 0.5) * 0.9;
      float oil = (1.0 - smoothstep(uFront - 0.15, uFront + 0.05, d + wob)) * ins;
      float sheen = pow(fbm(vP * 2.2 + vec2(uT * 0.05, 0.0)), 3.0) * 1.6;
      vec3 oc = vec3(0.04, 0.025, 0.012) + sheen * vec3(0.32, 0.24, 0.14);
      float fl = fbm(vP * 0.8 + vec2(0.0, -uT * 1.1)), fl2 = fbm(vP * 2.0 - vec2(uT * 0.5, uT * 1.8));
      float heat = clamp(fl * 1.4 + fl2 * 0.8 - 0.75, 0.0, 1.0) * uBurn;
      vec3 fc = mix(vec3(0.5, 0.06, 0.0), vec3(1.0, 0.45, 0.06), smoothstep(0.05, 0.5, heat));
      fc = mix(fc, vec3(1.0, 0.86, 0.45), smoothstep(0.55, 0.95, heat));
      vec3 col = mix(oc, fc, clamp(uBurn * (0.35 + heat * 1.2), 0.0, 1.0));
      float a = max(oil * (0.9 + 0.1 * uBurn), soot * 0.55);
      col = mix(vec3(0.03, 0.025, 0.02), col, oil / max(a, 0.001));
      ${Gm.fogv}
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uFogC, col, fogv), a);
    }`;
  // the pour itself: a rope of burning oil from the lip, along the spout, down the wall to the floor (u: along it; the front runs down it)
  const POUR_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${Gm.FOG_VS} void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const POUR_FS = `uniform float uT; uniform float uFront; uniform float uTail; uniform float uA; ${Gm.FOG_FS} varying vec2 vUv; varying vec3 vN; varying vec3 vV; ${Gm.NOISE}
    void main() {
      if (vUv.x > uFront || vUv.x < uTail) discard;
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float n = fbm(vec2(vUv.x * 18.0 - uT * 7.0, vUv.y * 3.0));
      vec3 col = mix(vec3(0.55, 0.16, 0.0), vec3(1.0, 0.62, 0.15), n);
      col = mix(col, vec3(1.0, 0.92, 0.6), pow(facing, 3.0) * 0.6);
      float a = (0.55 + 0.45 * facing) * smoothstep(0.0, 0.02, uFront - vUv.x) * uA;
      ${Gm.fogv}
      gl_FragColor = vec4(col * fogv * 1.3, a);
    }`;
  Gm.warmMats.push(() => Gm.mat(POUR_VS, POUR_FS, { uFront: { value: 0 }, uTail: { value: 0 }, uA: { value: 0 } }, { blending: THREE.AdditiveBlending }));
  Gm.K.oil = {
    name: '煮え油の大釜', icon: '🫕', rc: '#e09040', cat: '傾ける — 調べる・撃つ・叩く',
    desc: '城壁の下の焦げ跡（7×4m）に煮え油が流れ落ち、9秒燃える。落ちた瞬間、下の敵は熱傷を負う。一度きり。',
    interact: { verb: '傾ける', doing: '大釜を傾けている…', dur: 1.0 },
    build(g, w) {
      potShape();
      const iron = w.mats.iron, sgn = g.sgn, cy = g.cy;
      const grp = new THREE.Group(); w.group.add(grp);
      // iron brackets standing on the two merlons either side of the crenel, the axle across between them
      for (const zz of [-1.2, 1.2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), iron); post.position.set(g.px, g.y + 1.7, g.z + zz); post.castShadow = true; grp.add(post);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.4), iron); foot.position.set(g.px, g.y + 1.48, g.z + zz); grp.add(foot);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 10), iron); cap.rotation.x = Math.PI / 2; cap.position.set(g.px, cy, g.z + zz); grp.add(cap);
      }
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.5, 8), iron); axle.rotation.x = Math.PI / 2; axle.position.set(g.px, cy, g.z); grp.add(axle);
      // the pot turns on its trunnions (its own group turns about the axle)
      const pot = new THREE.Group(); pot.position.set(g.px, cy, g.z); grp.add(pot);
      const potM = new THREE.MeshStandardMaterial({ color: 0x2e2a28, metalness: 0.75, roughness: 0.6, map: iron.map || null, normalMap: iron.normalMap || null, emissive: 0x4a1400, emissiveIntensity: 0.3 });
      const body = new THREE.Mesh(potGeo, potM); body.castShadow = true; pot.add(body);
      const inner = new THREE.Mesh(potInner, new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.9, side: THREE.BackSide })); pot.add(inner);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.05, 6, 32), potM); lip.rotation.x = Math.PI / 2; lip.position.y = 0.48; pot.add(lip);
      for (const zz of [-0.82, 0.82]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 8), iron); l.rotation.x = Math.PI / 2; l.position.z = zz; pot.add(l); }
      // a pouring spout on the bailey side of the rim, and the lever on the walk side that tips it
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.3), potM); spout.position.set(sgn * 0.8, 0.47, 0); spout.rotation.z = sgn * 0.25; pot.add(spout);
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.1, 0.07), iron); lever.position.set(-sgn * 0.95, 0.35, 0.45); lever.rotation.z = sgn * 0.55; pot.add(lever);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8), w.mats.woodDark); grip.position.set(-sgn * 1.25, 0.82, 0.45); grip.rotation.x = Math.PI / 2; pot.add(grip);
      // the oil boiling in it
      const surf = new THREE.Mesh(new THREE.CircleGeometry(0.65, 32), Gm.mat(OILS_VS, OILS_FS, { uA: { value: 1 } }, { transparent: false, depthWrite: true }));
      surf.rotation.x = -Math.PI / 2; surf.position.y = 0.3; pot.add(surf);
      // a fire pan under it in the crenel, its coals glowing
      const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.07, 16), iron); pan.position.set(g.px, g.y + 1.04, g.z); grp.add(pan);
      const coalM = new THREE.MeshStandardMaterial({ color: 0x1a0a04, emissive: 0xff4a10, emissiveIntensity: 1.4, roughness: 0.9, flatShading: true });
      for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(G.Props.PG.dode, coalM); const a = R() * 6.28, d = R() * 0.3; c.scale.setScalar(rnd(0.05, 0.09)); c.position.set(g.px + Math.cos(a) * d, g.y + 1.1, g.z + Math.sin(a) * d); c.rotation.set(R() * 3, R() * 3, R() * 3); grp.add(c); }
      // old pours: dark runs down the wall's face below it
      const runs = new THREE.Mesh(new THREE.PlaneGeometry(1.7, g.y + 1.0), new THREE.MeshBasicMaterial({ color: 0x0a0604, transparent: true, opacity: 0.6, depthWrite: false, map: G.Tex.spr.soft }));
      runs.position.set(g.wall + sgn * 0.02, (g.y + 1.0) / 2, g.z); runs.rotation.y = sgn * Math.PI / 2; grp.add(runs);
      // the scorched patch below (it becomes the burning pool)
      const Z = g.zone, hx = (Z.x1 - Z.x0) / 2, hz = (Z.z1 - Z.z0) / 2, cxz = V((Z.x0 + Z.x1) / 2, 0.03, (Z.z0 + Z.z1) / 2);
      const pm = Gm.mat(POOL_VS, POOL_FS, { uS: { value: new THREE.Vector2(hx + 0.6, hz + 0.6) }, uH: { value: new THREE.Vector2(hx, hz) }, uImp: { value: new THREE.Vector2(g.imp.x - cxz.x, g.imp.z - cxz.z) }, uFront: { value: 0 }, uBurn: { value: 0 }, uScorch: { value: 1 } },
        { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const pool = new THREE.Mesh(Gm.plane(), pm); pool.scale.set(hx + 0.6, 1, hz + 0.6); pool.position.copy(cxz); pool.renderOrder = 3; grp.add(pool);
      g.fire = Gm.light(w, g.px - sgn * 0.6, g.y + 1.4, g.z, { color: '#ff7a30', intensity: 6, range: 9, flame: 0.6 });
      // a glow of heat over the pot (the marker from below: it fades once the pot is spent)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xff8a40, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      glow.scale.set(3.2, 2.4, 1); glow.position.set(g.px, cy + 0.2, g.z); grp.add(glow);
      Object.assign(g, { grp, pot, potM, coalM, pool, pm, surf, glow, ph: R() * 6 });
    },
    idle(g, dt) {
      g.ph += dt;
      if (!g.pot) return;
      // steam and smoke off the boiling oil, little flames licking up round the pot from the coals
      if (R() < dt * 9) G.fx.norm.spawn(g.px + rnd(-0.4, 0.4), g.cy + 0.5, g.z + rnd(-0.4, 0.4), rnd(-0.15, 0.15), rnd(0.9, 1.6), rnd(-0.15, 0.15), rnd(2.4, 3.4), 0.35, 2.2, 0.78, 0.72, 0.66, 0.32, -0.08, 0.35); // (a plume of steam you see from the bailey)
      if (R() < dt * 6) G.fx.flameLick(g.px + rnd(-0.3, 0.3), g.y + 1.1, g.z + rnd(-0.3, 0.3), rnd(0.5, 0.8));
      if (R() < dt * 2) G.fx.add.spawn(g.px + rnd(-0.3, 0.3), g.cy + 0.35, g.z + rnd(-0.3, 0.3), 0, rnd(0.6, 1.2), 0, 0.5, 0.05, 0.02, 1.0, 0.6, 0.2, 0.9, 6, 0.2);
      g.pot.rotation.z = Math.sin(g.ph * 1.3) * 0.012;
      g.glow.material.opacity = 0.28 + 0.1 * Math.sin(g.ph * 3.1);
    },
    start(g) {
      g.hitSet = new Set(); g.meHit = false; g.poured = false;
      const Z = g.zone;
      g.warn = Gm.warn({ c: V((Z.x0 + Z.x1) / 2, 0, (Z.z0 + Z.z1) / 2), yaw: 0, hx: (Z.x1 - Z.x0) / 2, hz: (Z.z1 - Z.z0) / 2, dur: OIL.imp, hold: 0.05, col: 0xff5a14 });
      G.sfx.mech && G.sfx.mech('boltBack', 0, 1); G.sfx.chain && G.sfx.chain(0.4, 0.4); G.sfx.hiss && G.sfx.hiss(V(g.px, g.cy, g.z), 1.2);
      if (g.pot) pourStream(g);
    },
    run(g, dt) {
      const t = g.t;
      if (g.pot) {
        const k = Math.min(1, t / OIL.tip), a = OIL.ang * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
        g.pot.rotation.z = -g.sgn * a;
        g.surf.visible = t < 0.5;
        if (g.fire) g.fire.intensity = Math.max(0.6, 6 - t * 2.2);
        if (g.glow) g.glow.material.opacity = Math.max(0, 0.35 - t * 0.2);
        g.coalM.emissiveIntensity = Math.max(0.35, 1.4 - t * 0.4);
      }
      if (t >= OIL.imp && !g.poured) splash(g);
      if (g.poured) {
        // the pool spreads from where the pour lands: a monster (or you) is scalded when the oil reaches it
        const Z = g.zone, k = Math.min(1, (t - OIL.imp) / OIL.spread), Rf = g.reach * ease(k);
        if (g.pm) { g.pm.uniforms.uFront.value = Rf; }
        const inZ = (p) => p.x > Z.x0 && p.x < Z.x1 && p.z > Z.z0 && p.z < Z.z1;
        for (const e of Gm.foes()) {
          if (g.hitSet.has(e) || e.flyer || e.pos.y > 0.8 || !inZ(e.pos) || Math.hypot(e.pos.x - g.imp.x, e.pos.z - g.imp.z) > Rf) continue;
          g.hitSet.add(e); Gm.hurtFoe(e, 0.15, 'fire'); C().status(e, 'burn', 2);
        }
        const Pl = P();
        if (!g.meHit && Pl && !Pl.dead && Pl.pos.y < 0.8 && inZ(Pl.pos) && Math.hypot(Pl.pos.x - g.imp.x, Pl.pos.z - g.imp.z) <= Rf) { g.meHit = true; Gm.hurtMe(0.08, { elem: 'fire', pos: g.imp.clone() }); Gm.igniteMe(); }
      }
      return t < 2.6;
    },
    restore(g) {
      if (g.pot) { g.pot.rotation.z = -g.sgn * OIL.ang; g.surf.visible = false; g.glow.visible = false; g.coalM.emissiveIntensity = 0.3; if (g.fire) g.fire.intensity = 0.6; }
      addOilField(g, 0);
      poolLife(g);
      if (g.pm) g.pm.uniforms.uFront.value = g.reach;
    },
  };
  function addOilField(g, burn) {
    const Z = g.zone, w = G.world;
    g.field = { kind: 'oil', x0: Z.x0, z0: Z.z0, x1: Z.x1, z1: Z.z1, y: 0, t: 0, cap: 0, burnT: burn, blue: false };
    (w.fields = w.fields || []).push(g.field);
  }
  // the pool keeps showing what the oil does: burning while its field burns (it can catch again from fire), dark and glossy otherwise
  function poolLife(g) {
    if (!g.pm || g.poolOn) return; g.poolOn = true;
    Gm.fx.push({ update(dt) { const f = g.field; g.pm.uniforms.uBurn.value = U.damp(g.pm.uniforms.uBurn.value, f && f.burnT > 0 ? Math.min(1, f.burnT / 1.5) : 0, 4, dt); return true; }, dispose() {} });
  }
  function splash(g) {
    g.poured = true;
    const p = g.imp;
    addOilField(g, OIL.burn);
    poolLife(g);
    if (g.pm) g.pm.uniforms.uBurn.value = 1;
    if (g.warn) g.warn.end();
    G.sfx.fire && G.sfx.fire(p, true); G.sfx.hiss && G.sfx.hiss(p, 1.5);
    G.fx.fireBurst && G.fx.fireBurst(p.clone().setY(0.3), 2.2);
    G.vfx.fireball(p.clone().setY(0.6), 1.6);
    for (let k = 0; k < 40; k++) { const a = R() * 6.28, s = rnd(2, 6); G.fx.add.spawn(p.x, 0.3, p.z, Math.cos(a) * s, rnd(2, 5), Math.sin(a) * s, rnd(0.5, 0.9), 0.08, 0.03, 1.0, 0.55, 0.12, 1, 9.8, 0.3); }
    Gm.shake(p, 0.3, 18);
  }
  // where the oil leaves the rim once the pot is over (the low point of its lip, on the bailey side)
  function lipOf(g) { const q = V(g.sgn * 0.74, 0.47, 0).applyAxisAngle(V(0, 0, 1), -g.sgn * OIL.ang); return V(g.px + q.x, g.cy + q.y, g.z); }
  function pourStream(g) {
    const lip = lipOf(g), sgn = g.sgn;
    const curve = new THREE.CatmullRomCurve3([lip, V(lip.x + sgn * 0.18, lip.y - 0.5, g.z), V((lip.x + g.imp.x) / 2 + sgn * 0.05, lip.y * 0.45, g.z), g.imp.clone().setY(0.05)]);
    const tg = new THREE.TubeGeometry(curve, 48, 0.19, 10, false);
    const mat = Gm.mat(POUR_VS, POUR_FS, { uFront: { value: 0 }, uTail: { value: 0 }, uA: { value: 1 } }, { blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(tg, mat); m.frustumCulled = false; m.renderOrder = 8; G.scene.add(m);
    let t = 0;
    Gm.fx.push({
      update(dt) {
        t += dt;
        // the oil leaves the lip at 0.3 s and reaches the floor at the moment of the splash; the tail runs dry from 1.6 s
        mat.uniforms.uFront.value = U.clamp((t - 0.3) / (OIL.imp - 0.3), 0, 1);
        mat.uniforms.uTail.value = U.clamp((t - 1.6) / 0.6, 0, 1);
        if (t > 0.3 && t < 1.9 && R() < dt * 30) { const q = curve.getPoint(Math.min(1, R() * mat.uniforms.uFront.value)); G.fx.flameLick(q.x, q.y - 0.2, q.z, rnd(0.6, 1.0)); }
        if (t > 0.3 && t < 2.0 && R() < dt * 20) { const q = curve.getPoint(Math.min(1, R() * mat.uniforms.uFront.value)); G.fx.add.spawn(q.x, q.y, q.z, rnd(-0.6, 0.6), rnd(-1, 0.5), rnd(-0.6, 0.6), 0.5, 0.06, 0.02, 1.0, 0.5, 0.1, 1, 9.8, 0.2); }
        return t < 2.3;
      },
      dispose() { G.scene.remove(m); tg.dispose(); mat.dispose(); },
    });
  }
  // (fieldgen_t2.js castle) a cauldron set in a crenel of a wall walk's parapet: side -1 west / +1 east, y the walk's height,
  // z the crenel's middle, wall: the parapet's face toward the bailey, zone: the scorched patch below
  Gm.addOilPot = function (w, side, wall, y, z, zone) {
    const sgn = -side, px = wall - sgn * 0.05, cy = y + 1.75; // (sgn: the way to the bailey; the pot sits over the parapet between two merlons)
    const imp = V(wall + sgn * 0.6, 0, z);
    const g = Gm.add(w, 'oil', { sgn, px, cy, y, z, wall, zone, imp, use: V(px, cy, z), useR: 1.0, useD: 3.6 });
    g.reach = Math.max(...[[zone.x0, zone.z0], [zone.x1, zone.z0], [zone.x0, zone.z1], [zone.x1, zone.z1]].map(([a, b]) => Math.hypot(a - imp.x, b - imp.z)));
    Gm.col(w, g, Math.min(wall - sgn * 0.95, wall + sgn * 0.85), y + 1.0, z - 1.25, Math.max(wall - sgn * 0.95, wall + sgn * 0.85), cy + 0.8, z + 1.25, { surf: 'metal' });
    g.hb.push({ p: V(px, cy, z), r: 1.0 });
    return g;
  };
})();
