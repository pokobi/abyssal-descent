'use strict';
// Spawn graves: a mound with a headstone that wakes when you come near. One random foe (the area's usual pool) rises in its place and the grave is gone.
// They do not care about the area's foe cap or its waves, they keep working after the area is cleared, and the foe a grave raises does not count
// towards the objective (see GM.onEnemyKilled / GM.spawnEnemy in game.js). Stay away from a grave and nothing happens.
// Rare on the first two fields, fairly common on the third (mostly inside the barred rooms), a little more on the fourth (strata.js).
(function () {
  const Gr = (G.Graves = { list: [], TRIGGER: 7.5 });
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let sph = null, box = null, cyl = null, tmr = 0;

  // ---- generation: only a record on the world; the meshes are made when the world is set up ----
  Gr.add = function (w, x, y, z, ry) { (w.graves = w.graves || []).push({ x, y, z, ry: ry || 0 }); };
  // tier 1 / 2: the first two fields, where a grave is a rare find
  Gr.scatter = function (w, rng, occ, W, D, tier) {
    if (!rng.chance(tier === 1 ? 0.2 : 0.25)) return;
    const n = rng.chance(0.15) ? 2 : 1;
    for (let i = 0; i < n; i++) { const r = occ.place(rng, 2, 2, 1.5, 30); if (r) Gr.add(w, r.x0 + 1, 0, r.z0 + 1, rng.range(0, 6)); }
  };

  // ---- the world is up: build the little grave meshes ----
  Gr.build = function (w) {
    for (const g of Gr.list) Gr.drop(g);
    Gr.list = [];
    if (!w || !w.graves || !w.graves.length) return;
    sph = sph || new THREE.SphereGeometry(1, 10, 6); box = box || new THREE.BoxGeometry(1, 1, 1); cyl = cyl || new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
    for (const d of w.graves) {
      const g = new THREE.Group(); g.position.set(d.x, d.y, d.z); g.rotation.y = d.ry; g.scale.setScalar(1.3);
      const mound = new THREE.Mesh(sph, w.mats.floor); mound.scale.set(0.8, 0.26, 1.35); mound.position.set(0, 0.02, 0.5); g.add(mound);
      const stone = new THREE.Mesh(box, w.mats.block); stone.scale.set(0.74, 0.95, 0.18); stone.position.set(0, 0.5, -0.55); g.add(stone);
      const arch = new THREE.Mesh(cyl, w.mats.block); arch.scale.set(0.74, 0.18, 0.74); arch.rotation.x = Math.PI / 2; arch.position.set(0, 0.97, -0.55); g.add(arch);
      for (const m of [mound, stone, arch]) { m.castShadow = true; m.receiveShadow = true; }
      // a faint soul-glow so it reads as something other than scenery
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: w.biome === 'ruin' ? 0x7aa8ff : 0x9affc0, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(2.4, 2.4, 1); glow.position.set(0, 0.75, 0.2); g.add(glow);
      w.group.add(g);
      Gr.list.push({ x: d.x, y: d.y, z: d.z, g, glow, ph: Math.random() * 6, used: false, w });
    }
  };
  Gr.drop = function (o) { if (o.g && o.g.parent) o.g.parent.remove(o.g); if (o.glow) o.glow.material.dispose(); };

  // ---- near enough: the grave opens and something climbs out ----
  Gr.trigger = function (o) {
    o.used = true;
    Gr.drop(o);
    const pos = V(o.x, o.y, o.z), w = G.world;
    G.fx.dust(pos.clone().setY(o.y + 0.1), V(0, 1, 0), 0x6a5a48, 16);
    G.fx.debris(pos.clone().setY(o.y + 0.4), w.mats.rock, 8, 0.2, 5);
    G.sfx.breakObj(pos, 'stone'); G.sfx.rumble && G.sfx.rumble(0.6, 0.5);
    G.game.spawnEnemy({ at: pos, grave: true });
  };
  Gr.update = function (dt) {
    const P = G.player;
    if (!Gr.list.length || G.game.state !== 'playing' || P.dead) return;
    const t = G.game.time;
    tmr -= dt;
    for (const o of Gr.list) {
      if (o.used) continue;
      o.glow.material.opacity = 0.34 + 0.16 * Math.sin(t * 2.4 + o.ph);
      if (tmr > 0) continue;
      if (Math.hypot(P.pos.x - o.x, P.pos.z - o.z) < Gr.TRIGGER && Math.abs(P.pos.y - o.y) < 2.8) { Gr.trigger(o); tmr = 0.4; break; }
    }
    if (tmr <= 0) tmr = 0.1;
    Gr.list = Gr.list.filter((o) => !o.used);
  };
})();
