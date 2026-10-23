'use strict';
// Spawn graves: a mound with a headstone, wrapped in a pale unholy glow. Stand near one for about three seconds and something climbs out:
// one random foe (the area's usual pool) rises in its place and the grave is gone. While you linger it stirs (the stone shakes, wisps climb, the
// ground rumbles) so you can leave in time; step away and it settles again.
// They do not care about the area's foe cap or its waves, they keep working after the area is cleared, and the foe a grave raises does not count
// towards the objective (see GM.onEnemyKilled / GM.spawnEnemy in game.js). Stay away from a grave and nothing happens.
// Rare on the first two fields, fairly common on the third (mostly inside the barred rooms), a little more on the fourth (strata.js).
(function () {
  const Gr = (G.Graves = { list: [], TRIGGER: 7.5, DWELL: 3 });
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let sph = null, box = null, cyl = null, ringTex = null, outMats = {};

  // ---- generation: only a record on the world; the meshes are made when the world is set up ----
  Gr.add = function (w, x, y, z, ry) { (w.graves = w.graves || []).push({ x, y, z, ry: ry || 0 }); };
  // tier 1 / 2: the first two fields, where a grave is a rare find
  Gr.scatter = function (w, rng, occ, W, D, tier) {
    if (!rng.chance(tier === 1 ? 0.2 : 0.25)) return;
    const n = rng.chance(0.15) ? 2 : 1;
    for (let i = 0; i < n; i++) { const r = occ.place(rng, 2, 2, 1.5, 30); if (r) Gr.add(w, r.x0 + 1, 0, r.z0 + 1, rng.range(0, 6)); }
  };

  // a soft ring on the ground (made once)
  function makeRing() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 18, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // thin back-face shells: a faint outline (hidden by anything in front of it, like any other mesh)
  const outlineMat = (col) => outMats[col] || (outMats[col] = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide, transparent: true, opacity: 0.34, depthWrite: false }));

  // ---- the world is up: build the little grave meshes ----
  Gr.build = function (w) {
    for (const g of Gr.list) Gr.drop(g);
    Gr.list = [];
    if (!w || !w.graves || !w.graves.length) return;
    sph = sph || new THREE.SphereGeometry(1, 10, 6); box = box || new THREE.BoxGeometry(1, 1, 1); cyl = cyl || new THREE.CylinderGeometry(0.5, 0.5, 1, 10); ringTex = ringTex || makeRing();
    const ruin = w.biome === 'ruin', tint = ruin ? 0x4a78ff : 0x9a50ff, wisp = ruin ? [0.35, 0.6, 1] : [0.62, 0.4, 1];
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x4a4650, roughness: 0.85, emissive: ruin ? 0x0a1230 : 0x1c0a30, emissiveIntensity: 0.9 });
    const dirtM = new THREE.MeshStandardMaterial({ color: 0x1e1614, roughness: 1, emissive: ruin ? 0x081028 : 0x140824, emissiveIntensity: 0.7 });
    for (const d of w.graves) {
      const g = new THREE.Group(); g.position.set(d.x, d.y, d.z); g.rotation.y = d.ry; g.scale.setScalar(1.3);
      const parts = [];
      const mound = new THREE.Mesh(sph, dirtM); mound.scale.set(0.8, 0.26, 1.35); mound.position.set(0, 0.02, 0.5); g.add(mound); parts.push(mound);
      const stone = new THREE.Mesh(box, stoneM); stone.scale.set(0.74, 0.95, 0.18); stone.position.set(0, 0.5, -0.55); stone.rotation.z = 0.05; g.add(stone); parts.push(stone);
      const arch = new THREE.Mesh(cyl, stoneM); arch.scale.set(0.74, 0.18, 0.74); arch.rotation.x = Math.PI / 2; arch.position.set(0, 0.97, -0.55); g.add(arch); parts.push(arch);
      for (const m of parts) {
        m.castShadow = true; m.receiveShadow = true;
        const o = new THREE.Mesh(m.geometry, outlineMat(tint)); o.scale.setScalar(1.09); m.add(o); // a shell around each part (in its own space)
      }
      // a pale glow on the stone, a ring breathing on the ground
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: tint, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(2.3, 2.3, 1); glow.position.set(0, 0.8, -0.2); g.add(glow);
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, color: tint, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.04, 0.2); ring.scale.set(3.2, 3.2, 1); g.add(ring);
      w.group.add(g);
      Gr.list.push({ x: d.x, y: d.y, z: d.z, g, glow, ring, stone, wisp, tint, ph: Math.random() * 6, used: false, dwell: 0, wT: 0, sT: 0, dT: 0, base: g.position.clone() });
    }
  };
  Gr.drop = function (o) { if (o.g && o.g.parent) o.g.parent.remove(o.g); if (o.glow) o.glow.material.dispose(); if (o.ring) { o.ring.geometry.dispose(); o.ring.material.dispose(); } };

  // ---- the grave opens and something climbs out ----
  Gr.trigger = function (o) {
    o.used = true;
    Gr.drop(o);
    const pos = V(o.x, o.y, o.z), w = G.world;
    G.fx.dust(pos.clone().setY(o.y + 0.1), V(0, 1, 0), 0x3a2a48, 20);
    G.fx.debris(pos.clone().setY(o.y + 0.4), w.mats.rock, 10, 0.22, 6);
    G.fx.ring && G.fx.ring(pos.clone().setY(o.y + 0.1), 3.2, o.tint, 0.5);
    for (let i = 0; i < 18; i++) G.fx.add.spawn(o.x + (Math.random() - 0.5) * 1.2, o.y + 0.3, o.z + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.4, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 2.4, 0.9 + Math.random() * 0.8, 0.16, 0.02, o.wisp[0], o.wisp[1], o.wisp[2], 0.9, 1.2, 0.8);
    G.sfx.graveRise ? G.sfx.graveRise(pos) : G.sfx.breakObj(pos, 'stone');
    G.game.spawnEnemy({ at: pos, grave: true });
  };
  // the foe a grave raised keeps a pale haze and a ring of the grave's colour, so it can be told from the area's own foes
  function aura(e) {
    const ruin = G.world && G.world.biome === 'ruin', col = ruin ? 0x4a78ff : 0x9a50ff, h = e.height || 1.8, r = e.radius || 0.5;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: col, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(Math.max(h, r * 3) * 1.5, h * 1.5, 1); sp.position.y = h * 0.5;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.25, r * 1.8, 18), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
    e.model.group.add(sp, ring); e.graveAura = { sp, ring, t: 0, wisp: ruin ? [0.35, 0.6, 1] : [0.62, 0.4, 1] };
  }
  function auraTick(dt) {
    const t = G.game.time;
    for (const e of G.enemies.list) {
      if (!e.graveSpawn || !e.alive || !e.model) continue;
      if (!e.graveAura) aura(e);
      const a = e.graveAura; a.sp.material.opacity = 0.3 + 0.1 * Math.sin(t * 3 + (e.id || 0)); a.ring.rotation.z += dt * 1.2; a.ring.material.opacity = 0.34 + 0.1 * Math.sin(t * 2.2);
      a.t -= dt;
      if (a.t <= 0 && e.pos.distanceTo(G.player.pos) < 45) { a.t = 0.28; G.fx.add.spawn(e.pos.x + (Math.random() - 0.5) * e.radius * 2, e.pos.y + 0.2, e.pos.z + (Math.random() - 0.5) * e.radius * 2, 0, 0.6 + Math.random() * 0.6, 0, 1.0, 0.1, 0.02, a.wisp[0], a.wisp[1], a.wisp[2], 0.7, -0.1, 0.5); }
    }
  }
  Gr.update = function (dt) {
    const P = G.player;
    if (G.game.state === 'playing') auraTick(dt);
    if (!Gr.list.length || G.game.state !== 'playing' || P.dead) return;
    const t = G.game.time, cam = G.camera ? G.camera.position : P.pos;
    for (const o of Gr.list) {
      if (o.used) continue;
      const dxz = Math.hypot(P.pos.x - o.x, P.pos.z - o.z), inR = dxz < Gr.TRIGGER && Math.abs(P.pos.y - o.y) < 2.8;
      o.dwell = inR ? o.dwell + dt : Math.max(0, o.dwell - dt * 1.5);
      const k = Math.min(1, o.dwell / Gr.DWELL);
      // idle shimmer, stronger as it stirs
      o.glow.material.opacity = 0.3 + 0.12 * Math.sin(t * 2.4 + o.ph) + k * 0.55;
      o.glow.scale.setScalar(2.3 + k * 1.6 + 0.2 * Math.sin(t * 5 + o.ph));
      o.ring.material.opacity = 0.32 + 0.1 * Math.sin(t * 1.7 + o.ph) + k * 0.55;
      o.ring.scale.setScalar(3.2 + k * 1.8 + 0.3 * Math.sin(t * 3 + o.ph));
      o.ring.rotation.z += dt * (0.4 + k * 3);
      // it shakes as it wakes
      if (k > 0) { o.g.position.set(o.base.x + (Math.random() - 0.5) * 0.05 * k, o.base.y, o.base.z + (Math.random() - 0.5) * 0.05 * k); o.stone.rotation.z = 0.05 + (Math.random() - 0.5) * 0.18 * k; } else if (o.stone.rotation.z !== 0.05) { o.g.position.copy(o.base); o.stone.rotation.z = 0.05; }
      // wisps (only while it can be seen at all)
      const near = Math.hypot(cam.x - o.x, cam.z - o.z) < 45;
      if (near) {
        o.wT -= dt;
        if (o.wT <= 0) {
          o.wT = 1 / (1.6 + k * 14);
          G.fx.add.spawn(o.x + (Math.random() - 0.5) * 1.1, o.y + 0.25, o.z + (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.9 + k * 1.5, (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 0.9, 0.12 + k * 0.1, 0.02, o.wisp[0], o.wisp[1], o.wisp[2], 0.75, -0.1, 0.5);
          if (k > 0.2 && Math.random() < 0.5) G.fx.norm.spawn(o.x + (Math.random() - 0.5), o.y + 0.1, o.z + (Math.random() - 0.5), (Math.random() - 0.5) * 0.4, 0.5 + Math.random(), (Math.random() - 0.5) * 0.4, 1.4, 0.2, 0.8, o.wisp[0] * 0.3, o.wisp[1] * 0.3, o.wisp[2] * 0.4, 0.4, -0.2, 1);
        }
      }
      // the ground rumbles and it whispers, faster and louder the longer you stay
      if (k > 0) {
        o.sT -= dt;
        if (o.sT <= 0) { o.sT = Math.max(0.2, 0.62 - k * 0.42); G.sfx.graveStir && G.sfx.graveStir(k, V(o.x, o.y + 0.4, o.z)); G.player.addShake && G.player.addShake(0.04 + k * 0.12); }
        o.dT -= dt;
        if (o.dT <= 0) { o.dT = 0.25; G.fx.dust(V(o.x + (Math.random() - 0.5) * 1.6, o.y + 0.05, o.z + (Math.random() - 0.5) * 1.6), V(0, 1, 0), 0x2a2030, 2 + Math.round(k * 3)); }
      }
      if (o.dwell >= Gr.DWELL) { Gr.trigger(o); break; }
    }
    Gr.list = Gr.list.filter((o) => !o.used);
  };
})();
