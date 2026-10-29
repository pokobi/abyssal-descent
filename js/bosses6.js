'use strict';
// The last guardian: the Crimson Sovereign (the last area of the extra difficulty), on its own field (fieldgen.js F.finalArena).
// A giant seen from the waist up across the void, out of reach. It tears the 7x7 stone tiles away, slams and sweeps the floor with its hands
// (a hand that hits the floor can be struck for a moment), throws things across, and makes crystal constructs on your side that hurt it when broken.
// At 0 HP the crown breaks and the second form wakes: gravity reversal, a pull towards the void, both hands at once.
// Whoever falls takes a heavy hit and is put back on the nearest whole tile (player.js fellInPit); the entrance ledge is sealed once the fight starts.
(function () {
  const BS = G.bosses, U = G.U;
  const { mat, mesh, joint } = BS.h;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const PG = () => G.Props.PG;
  const Pl = () => G.player;
  const C = () => G.combat;
  const tex = () => G.Tex.tex;
  const glowM = (c, k) => mat('#000', { emissive: c, emissiveIntensity: k || 2.2 });
  const N = 7;

  // ================================================================ terrain: tiles that can be torn away and given back
  const TR = (BS.terrain = {});
  TR.tiles = () => (G.world && G.world.tiles) || [];
  TR.at = (x, z) => TR.tiles().find((t) => x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1) || null;
  TR.playerTile = () => { const P = G.player; return TR.at(P.pos.x, P.pos.z); };
  TR.collapse = function (list, warn) {
    let n = 0;
    for (const t of list) if (t.state === 'up') { t.state = 'warn'; t.warn = t.timer = warn + Math.random() * 0.25; t.rot = Math.random() < 0.5 ? 1 : -1; n++; }
    if (n) { G.sfx.rumble && G.sfx.rumble(1.2, 0.9); }
    return n;
  };
  TR.restore = function (list, delay) {
    for (const t of list) if (t.state === 'down' || t.state === 'fall') { t.state = 'wait'; t.timer = (delay || 0) + Math.random() * 0.9; }
  };
  TR.restoreAll = function (instant) {
    for (const t of TR.tiles()) {
      if (instant) { t.state = 'up'; t.dy = 0; t.mesh.visible = true; t.mesh.position.y = -0.5; t.mesh.rotation.set(0, 0, 0); t.mesh.material.emissive.setRGB(0, 0, 0); if (t.col) t.col.alive = true; }
      else if (t.state === 'down' || t.state === 'fall') { t.state = 'wait'; t.timer = Math.random() * 0.8; }
      else if (t.state === 'warn') { t.state = 'up'; t.mesh.position.y = -0.5; t.mesh.material.emissive.setRGB(0, 0, 0); }
    }
  };
  // after a fall: the whole tile nearest to where you went over (one that is not about to go)
  TR.nearestSafe = function (p) {
    let best = null, bd = 1e9;
    for (const t of TR.tiles()) { if (t.state !== 'up') continue; const d = Math.hypot(t.cx - p.x, t.cz - p.z); if (d < bd) { bd = d; best = t; } }
    return best;
  };
  // the sky stage (second half): set while it exists; a fall from it puts you back on it, on the side you went over
  TR.stage = null;
  TR.stageSpot = function (p) {
    const S = TR.stage, dx = p.x - S.c.x, dz = p.z - S.c.z, d = Math.hypot(dx, dz) || 1, r = Math.min(d, S.R - 3);
    return V(S.c.x + dx / d * r, Y2 + 0.1, S.c.z + dz / d * r);
  };
  // once the fight starts the entrance ledge is closed off by a wall of crimson light (no safe spot outside the tiles)
  TR.seal = function (w) {
    if (w.ledgeWall || !w.ledgeZ) return;
    const z = w.ledgeZ;
    w.addCollider(0, -40, z - 0.3, w.W, 80, z + 0.3, { surf: 'metal', noGrapple: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w.W, 30), new THREE.MeshBasicMaterial({ color: 0xff4a9a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: G.Tex.spr.soft }));
    m.position.set(w.W / 2, 6, z); w.group.add(m);
    w.ledgeWall = { m, t: 0 };
    G.sfx.magic && G.sfx.magic(V(w.W / 2, 1, z), 'dark'); G.sfx.rumble && G.sfx.rumble(1, 0.8);
    for (let x = 2; x < w.W; x += 3) G.fx.smoke(V(x, 0.3, z), 2, 1.2, 0xff4a9a, 2, 1.2);
    G.ui.toastSmall('🔒 背後の足場が紅い光の壁に閉ざされた');
  };
  TR.update = function (dt) {
    const w = G.world, gt = G.game.time;
    if (w.ledgeWall) { const L = w.ledgeWall; L.t += dt; L.m.material.opacity = Math.min(0.32, L.t * 0.4) * (0.75 + 0.25 * Math.sin(gt * 2.2)); if (Math.random() < dt * 14) G.fx.add.spawn(U.rand(1, w.W - 1), U.rand(0, 2), w.ledgeZ, 0, U.rand(1.5, 3.5), 0, 1.6, 0.12, 0.03, 1, 0.3, 0.6, 0.9, -0.2, 0.3); }
    for (const t of TR.tiles()) {
      const m = t.mesh;
      if (t.state === 'warn') {
        t.timer -= dt; const k = 1 - t.timer / t.warn, pulse = 0.55 + 0.45 * Math.sin(gt * 18);
        m.material.emissive.setRGB((0.3 + 0.7 * k) * pulse, 0.03, (0.1 + 0.3 * k) * pulse);
        m.position.y = -0.5 + Math.sin(gt * 45 + t.i * 2) * 0.03 * k;
        if (Math.random() < dt * 8) G.fx.dust(V(t.x0 + Math.random() * (t.x1 - t.x0), 0.2, t.z0 + Math.random() * (t.z1 - t.z0)), V(0, 1, 0), 0x8a3a5a, 2);
        if (t.timer <= 0) { t.state = 'fall'; t.vy = 0.5; w.removeCollider(t.col); m.material.emissive.setRGB(0.5, 0.05, 0.15); G.sfx.stoneGrind && Math.random() < 0.5 && G.sfx.stoneGrind(V(t.cx, 0, t.cz), 0.5); }
      } else if (t.state === 'fall') {
        t.vy += 30 * dt; t.dy -= t.vy * dt; m.position.y = -0.5 + t.dy; m.rotation.x += dt * 0.9 * t.rot; m.rotation.z += dt * 0.5 * t.rot;
        if (t.dy < -28) { t.state = 'down'; m.visible = false; }
      } else if (t.state === 'wait') {
        t.timer -= dt;
        if (t.timer <= 0) { t.state = 'rise'; t.dy = -11; m.visible = true; m.rotation.set(0, 0, 0); m.material.emissive.setRGB(0.25, 0.08, 0.2); m.position.y = -0.5 + t.dy; }
      } else if (t.state === 'rise') {
        t.dy += 10 * dt; m.position.y = -0.5 + Math.min(0, t.dy);
        if (t.dy >= 0) { t.dy = 0; t.state = 'up'; m.position.y = -0.5; m.material.emissive.setRGB(0, 0, 0); if (t.col) t.col.alive = true; G.fx.dust(V(t.cx, 0.1, t.cz), V(0, 1, 0), 0x8a3a5a, 6); }
      }
    }
  };
  const ups = () => TR.tiles().filter((t) => t.state === 'up');
  // the patterns: each returns the tiles to tear away; `hold` is how long they stay gone
  const C3 = (N - 1) / 2;
  const PAT = {
    scatter: (k) => ({ list: U.shuffle(ups().slice()).slice(0, k), hold: 5.5 }),
    rings: (r) => ({ list: ups().filter((t) => Math.max(Math.abs(t.i - C3), Math.abs(t.j - C3)) === r), hold: 6.5 }),
    half: () => {
      const pt = TR.playerTile() || { i: 1, j: 3 }, axisX = Math.random() < 0.5;
      const side = (axisX ? pt.i : pt.j) <= C3 ? -1 : 1; // the half you are standing on
      return { list: ups().filter((t) => { const v = (axisX ? t.i : t.j) - C3; return v !== 0 && Math.sign(v) === side; }), hold: 6.5 };
    },
    checker: () => { const pt = TR.playerTile(), par = pt ? (pt.i + pt.j) % 2 : Math.round(Math.random()); return { list: ups().filter((t) => (t.i + t.j) % 2 === par), hold: 5.5 }; },
    cross: () => ({ list: ups().filter((t) => t.i !== C3 && t.j !== C3), hold: 8 }),
    center: () => ({ list: ups().filter((t) => Math.abs(t.i - C3) <= 1 && Math.abs(t.j - C3) <= 1), hold: 6.5 }),
    rows: () => { const pt = TR.playerTile() || { j: 3 }; return { list: ups().filter((t) => Math.abs(t.j - pt.j) <= 1 && t.i % 2 === 0), hold: 6 }; },
  };
  const PHASE_PAT = [
    [['scatter', 7], ['rows']],
    [['scatter', 10], ['half'], ['rings', 3]],
    [['checker'], ['cross'], ['center'], ['half'], ['rings', 3]],
    [['cross'], ['checker'], ['center'], ['rings', 2], ['half']],
  ];
  TR.run = function (b, name, arg) {
    const p = PAT[name](arg); if (!p.list.length) return 0;
    const warn = [2.1, 1.9, 1.6, 1.4][Math.min(3, b.phase - 1)];
    const n = TR.collapse(p.list, warn);
    if (n) { G.ui.toastSmall('⚠ 足元が赤く光る — 床が崩れる！'); b._restoreQ = (b._restoreQ || []).concat([{ list: p.list, t: warn + 0.6 + p.hold }]); }
    return n;
  };
  TR.runPhase = function (b) { const set = PHASE_PAT[Math.min(3, b.phase - 1)], pick = set[Math.floor(Math.random() * set.length)]; return TR.run(b, pick[0], pick[1]); };
  // the tiles move and come back on their own clock (the guardian only decides when to tear them away)
  TR.tick = function (b, dt) {
    const w = G.world; if (!w || !w.final || !w.tiles) return;
    TR.update(dt);
    if (b._restoreQ) { for (const q of b._restoreQ) { q.t -= dt; if (q.t <= 0) { TR.restore(q.list, 0); q.done = true; } } b._restoreQ = b._restoreQ.filter((q) => !q.done); }
  };

  // ================================================================ the guardian
  const PINK = 0xff4a9a, VIO = 0xb070ff;
  const HP1 = 10000, HP2 = 6000; // the crowned giant, then the Avatar of the Void (together the old single bar of 16000)
  // the sky stage the Avatar fights on: a round platform Y2 m above the tiles, PR m across, the Avatar circling it ORB m out
  const Y2 = 150, PR = 21, ORB = 46;
  const TOP = 24; // how high the gravity reversal throws you
  // the open hand, palm to claw tips, runs from -2.6 to +8.9 m along its fingers: 11.5 m long, centred 3.15 m ahead of the palm
  const HAND_L = 11.5, HAND_C = 3.15;
  const SC = 1.4; // the body (not the hands) is built at 1 and shown 1.4x: the head ends up about 33 m above the tiles
  const tapered = new THREE.CylinderGeometry(0.72, 1, 1, 10, 1); tapered.translate(0, 0.5, 0); // an arm bone: base at 0, tip at 1
  const Y = V(0, 1, 0);

  class Sovereign extends BS.Boss {
    constructor(def, level, world) {
      super(def, level, world);
      this.form = 1;
      this.maxHp = Math.round(HP1 * this.hpScale); this.hp = this.maxHp;
      this.hp2 = Math.round(HP2 * this.hpScale);
      this.bloodColor = 0x6a0a3a;
      this.tempo = BS.tempo ? BS.tempo() : 1;
      this.speedK = 1;
      this.home = world.bossHome ? world.bossHome.clone() : V(world.arenaCenter.x, 0, world.arenaCenter.z - 50);
      this.pos.copy(this.home);
      this.root.position.copy(this.home);
      this.constructs = []; this.cols = []; this.stage2 = false; this.yawB = 0; if (world.tiles) TR.stage = null; // (the codex builds this model too, on a stand-in world: leave a live fight's stage alone)
      this.noDmgT = 0; this.conT = 30; this.conCd = 0; this.tearT = 10; this.lastHp = this.hp; this.last = null;
      this.build();
      const body = this.J.body;
      // (offsets are in the body's own units and scale with it; radii are world metres, so they carry SC)
      this.main = this.part({ name: def.name, blood: this.bloodColor, radius: 8 * SC, height: 30 * SC, hitW: [
        { n: this.J.chest, r: 7.5 * SC, part: 'body', o: V(0, 10, 0) }, { n: this.J.chest, r: 6 * SC, part: 'body', o: V(0, 2, 0) },
        { n: this.J.sh[0], r: 4.2 * SC, part: 'body' }, { n: this.J.sh[1], r: 4.2 * SC, part: 'body' },
        { n: this.J.head, r: 3.6 * SC, part: 'head', o: V(0, 1.8, 0.8) },
      ] });
      this.main.noFalloff = true;
      this.main.isInvuln = () => this.state !== 'fight';
      this.hands.forEach((h, i) => {
        const p = this.part({ name: i ? '君主の右手' : '君主の左手', blood: this.bloodColor, radius: 3.4, height: 2.6, hitW: [{ n: h.g, r: 3.3, part: 'body', o: V(0, 0.2, 0.4) }, { n: h.g, r: 2.2, part: 'body', o: V(0, 0, 4.4) }, { n: h.g, r: 1.8, part: 'body', o: V(0, 0, 7.2) }] });
        p.noFalloff = true;
        p.isInvuln = () => this.state !== 'fight';
        p.dmgMul = () => (h.planted ? 1.5 : 0.5); // a hand pinned to the floor is the one place a blade can reach
        h.part = p;
      });
      this.state = 'intro'; this.introT = 0;
      body.position.y = this.world.tiles ? -46 : 0;
      if (def.id === 'sovereign2') { this.avatarLook(); this.maxHp = this.hp2; this.hp = this.maxHp; }
      this.pose(0);
    }
    // what the crown breaking leaves: no crown or breastplate, the void core bared, horns, the gravity rings, violet light
    avatarLook() {
      const J = this.J;
      J.crown.visible = false; J.plates.forEach((m) => { m.visible = false; }); J.core.visible = true; J.horns.visible = true; J.grav.forEach((g) => { g.visible = true; });
      for (const m of this.glows) m.emissive.set(m === this.M.eye ? 0xe0c0ff : VIO);
    }
    // ---------------------------------------------------------------- the model (everything under root; root faces +z, towards the tiles)
    build() {
      const r = this.root, s = 1;
      const M = this.M = {
        body: mat('#3a0e32', { map: tex().metal.map, metalness: 0.6, roughness: 0.45, emissive: 0x2e0a26, emissiveIntensity: 0.8 }),
        armor: mat('#6a1652', { map: tex().metal.map, normalMap: tex().metal.normalMap, metalness: 0.65, roughness: 0.4, emissive: 0x3a0c30, emissiveIntensity: 0.8 }),
        dark: mat('#1e0618', { metalness: 0.85, roughness: 0.32, emissive: 0x1e0418, emissiveIntensity: 0.7 }),
        cloth: mat('#8a1048', { map: tex().cloth.map, side: THREE.DoubleSide, roughness: 0.9, emissive: 0x2a0418, emissiveIntensity: 0.5 }),
        glow: glowM(0xff7ab8, 1.6), eye: glowM(PINK, 3.2), halo: glowM(PINK, 2.2), core: glowM(VIO, 3.5),
        rock: mat('#3a2434', { map: tex().rock && tex().rock.map, roughness: 0.95, emissive: 0x200a18, emissiveIntensity: 0.5 }),
      };
      this.glows = [M.glow, M.eye, M.halo];
      const body = joint(r, 0, 0, 0); body.scale.setScalar(SC);
      // the waist sinks into the dark below the tiles; mist hides the cut
      const waist = joint(body, 0, -8, 0);
      mesh(waist, PG().cyl8, M.armor, 7.5, 14, 5.8, 0, -6, 0);
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(waist, PG().box, M.cloth, 4.2, 18, 0.25, Math.sin(a) * 7.4, -10, Math.cos(a) * 5.6, 0.12, a, 0); } // tattered skirt plates
      const chest = joint(waist, 0, 8, 0);
      mesh(chest, PG().cyl8, M.body, 6.2, 8, 4.8, 0, 2, 0);
      for (let i = 0; i < 4; i++) mesh(chest, PG().box, M.armor, 9 - i * 0.6, 1.1, 1.2, 0, -0.6 + i * 1.9, 4.6 - i * 0.05, -0.1); // the belly bands
      const ribs = mesh(chest, PG().dode, M.armor, 9.5, 7.2, 6, 0, 10.5, 0);
      const plates = [ribs];
      for (const sx of [-1, 1]) {
        plates.push(mesh(chest, PG().box, M.armor, 6.4, 6.2, 1.6, sx * 3.4, 11, 5.4, -0.18, sx * 0.32, 0));
        plates.push(mesh(chest, PG().box, M.glow, 0.25, 6.4, 0.3, sx * 0.4, 11, 6.35, -0.18, 0, 0));
        mesh(chest, PG().box, M.dark, 1.2, 9, 1.2, sx * 8.4, 9, -1, 0, 0, sx * 0.18);
      }
      plates.push(mesh(chest, PG().torus, M.glow, 3.2, 3.2, 3.2, 0, 11.5, 6.0)); // the sigil on the breastplate
      mesh(chest, PG().cyl8, M.armor, 4.6, 3.4, 4.2, 0, 16.6, 0); // gorget
      // the void core under the breastplate (the second form's weak point)
      const core = joint(chest, 0, 11, 3.2);
      mesh(core, PG().sph, mat('#000', { color: 0x050008, roughness: 1 }), 2.9, 2.9, 2.9);
      const coreRim = mesh(core, PG().torus, M.core, 3.3, 3.3, 5, 0, 0, 0.6);
      const coreGlow = mesh(core, PG().sph, new THREE.MeshBasicMaterial({ color: VIO, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 4.2, 4.2, 4.2);
      core.visible = false;
      // shoulders: great spiked pauldrons
      const sh = [];
      for (const sx of [-1, 1]) {
        const j = joint(chest, sx * 12.5, 15, 0);
        mesh(j, PG().dode, M.armor, 4.8, 3.8, 4.8);
        mesh(j, PG().dode, M.dark, 3.6, 2.6, 3.6, sx * 0.6, -2.4, 0);
        for (let i = 0; i < 3; i++) mesh(j, PG().cone, M.glow, 0.7, 4.5 - i, 0.7, sx * (1 + i * 1.4), 3.6 - i * 0.6, -0.6 + i * 0.5, 0, 0, -sx * (0.3 + i * 0.25));
        sh.push(j);
      }
      // head: a crowned helm with a burning third eye
      const head = joint(chest, 0, 19.5, 0.6);
      mesh(head, PG().dode, M.armor, 3.4, 4.4, 3.6, 0, 1.6, 0);
      mesh(head, PG().box, M.body, 4.4, 2.6, 0.8, 0, 1.0, 3.0, -0.12);
      for (const sx of [-1, 1]) { mesh(head, PG().box, M.eye, 1.2, 0.35, 0.3, sx * 1.15, 1.9, 3.45, 0, 0, sx * 0.2); mesh(head, PG().box, M.armor, 0.5, 3.4, 2.6, sx * 3.1, 0.8, 0.4, 0, 0, sx * 0.25); }
      const jewel = mesh(head, PG().oct3, M.eye, 0.75, 1.05, 0.5, 0, 3.4, 3.15);
      const crown = joint(head, 0, 4.6, 0);
      mesh(crown, PG().torus, M.glow, 3.1, 3.1, 3.1, 0, 0, 0, Math.PI / 2);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; mesh(crown, PG().cone, M.glow, 0.45, i % 2 ? 2.2 : 3.4, 0.45, Math.sin(a) * 3.1, 1.2, Math.cos(a) * 3.1, Math.cos(a) * 0.35, 0, -Math.sin(a) * 0.35); }
      const horns = joint(head, 0, 2.4, -0.4);
      for (const sx of [-1, 1]) { const hj = joint(horns, sx * 2.6, 1.2, 0); hj.rotation.z = -sx * 0.7; hj.rotation.x = -0.4; mesh(hj, PG().cone, M.dark, 0.9, 6.5, 0.9, 0, 3.2, 0); mesh(hj, PG().cone, M.core, 0.35, 2, 0.35, 0, 6.6, 0); }
      horns.visible = false;
      // the burning halo and the wings of blades behind it
      const halo = mesh(chest, PG().torus, M.halo, 12.5, 12.5, 6, 0, 21, -6);
      const halo2 = mesh(chest, PG().torus, M.glow, 9, 9, 3, 0, 21, -6.2);
      const wings = [];
      for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) wings.push(mesh(chest, PG().box, M.dark, 0.6, 22 - i * 2, 2.2, sx * (8 + i * 3.4), 14 - i * 0.6, -6, 0, 0, -sx * (0.45 + i * 0.2)));
      // a cape hanging into the dark
      for (const sx of [-1, 1]) mesh(chest, PG().plane, M.cloth, 11, 34, 1, sx * 6.5, -2, -4.6, 0.12, sx * 0.25, 0);
      // gravity rings (second form)
      const ringG = new THREE.TorusGeometry(1, 0.012, 4, 72), ringM = new THREE.MeshBasicMaterial({ color: VIO, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
      const grav = [0, 1, 2].map((i) => { const g = joint(chest, 0, 10, 0); const m = mesh(g, ringG, ringM, 12 + i * 2.5, 12 + i * 2.5, 12 + i * 2.5, 0, 0, 0, Math.PI / 2); m.castShadow = false; g.rotation.set(0.5 * i - 0.5, i, 0.3); g.visible = false; return g; });
      // arms (shoulder -> elbow -> wrist, laid out every frame) and the great hands
      const bone = (rr) => { const g = joint(r); const m = mesh(g, tapered, M.armor, rr, 1, rr); m.castShadow = false; mesh(g, PG().cyl8, M.dark, rr * 1.25, 0.1, rr * 1.25, 0, 0.82, 0); mesh(g, PG().cyl8, M.glow, rr * 1.12, 0.03, rr * 1.12, 0, 0.9, 0); return g; };
      this.arms = [-1, 1].map((sx) => ({ sx, up: bone(2.6), fo: bone(2.0), el: mesh(r, PG().dode, M.dark, 2.8, 2.8, 2.8) }));
      this.hands = [-1, 1].map((sx, i) => this.buildHand(sx, i));
      this.J = { body, waist, chest, head, jewel, crown, horns, halo, halo2, wings, sh, core, coreRim, coreGlow, plates, grav };
      this.J.height = 30 * s;
    }
    buildHand(sx, i) {
      const M = this.M, g = joint(this.root);
      g.rotation.order = 'YXZ';
      mesh(g, PG().box, M.armor, 5.4, 1.6, 5.2);
      mesh(g, PG().box, M.dark, 4.4, 0.6, 4.2, 0, 1.0, -0.2);
      mesh(g, PG().box, M.glow, 0.3, 0.2, 4.0, 0, 1.36, -0.2);
      mesh(g, PG().cyl8, M.dark, 2.3, 2.4, 2.3, 0, 0, -3.2, Math.PI / 2);
      mesh(g, PG().torus, M.glow, 2.4, 2.4, 2.4, 0, 0, -2.4);
      const fingers = [];
      for (let k = 0; k < 4; k++) {
        const f1 = joint(g, (k - 1.5) * 1.3, -0.1, 2.5); f1.rotation.y = (k - 1.5) * 0.06;
        mesh(f1, PG().box, M.armor, 1.05, 1.05, 2.8, 0, 0, 1.4);
        const f2 = joint(f1, 0, 0, 2.8);
        mesh(f2, PG().box, M.body, 0.9, 0.9, 2.3, 0, 0, 1.15);
        mesh(f2, PG().cone, M.glow, 0.42, 1.5, 0.42, 0, 0, 2.9, Math.PI / 2);
        fingers.push([f1, f2]);
      }
      const t1 = joint(g, -sx * 2.9, -0.1, 0.4); t1.rotation.y = -sx * 0.9;
      mesh(t1, PG().box, M.armor, 1.2, 1.2, 2.6, 0, 0, 1.3);
      const t2 = joint(t1, 0, 0, 2.6); mesh(t2, PG().box, M.body, 1, 1, 2, 0, 0, 1); mesh(t2, PG().cone, M.glow, 0.45, 1.4, 0.45, 0, 0, 2.5, Math.PI / 2);
      fingers.push([t1, t2]);
      const rockM = mesh(g, PG().dode, M.rock, 2.2, 2.2, 2.2, 0, -2.6, 2.2); rockM.visible = false; // what it scoops out of the dark to throw
      const rest = V(this.home.x + sx * 22, 4, this.home.z + 14);
      return { sx, i, g, fingers, rockM, pos: rest.clone(), rest, yaw: 0, pitch: 0, roll: 0, curl: 0.35, planted: false, busy: false };
    }
    // lay out an arm bone from a to b (both world points)
    seg(g, a, b) {
      const d = b.clone().sub(a), l = d.length() || 0.01;
      g.position.copy(a).sub(this.root.position);
      g.quaternion.setFromUnitVectors(Y, d.divideScalar(l));
      g.scale.set(1, l, 1);
    }
    pose(dt) {
      const P = Pl(), J = this.J, t = this.t;
      // breathing, leaning towards you, looking at you
      const tx = this.stage2 ? U.clamp(U.wrapAngle(Math.atan2(P.pos.x - this.home.x, P.pos.z - this.home.z) - this.yawB) * 1.5, -1, 1) : P ? U.clamp((P.pos.x - this.home.x) / 40, -1, 1) : 0;
      J.body.rotation.y = this.yawB;
      J.chest.rotation.y = U.damp(J.chest.rotation.y, this.stage2 ? 0 : tx * 0.22, 2, dt || 1);
      J.chest.rotation.x = U.damp(J.chest.rotation.x, (this.lean || 0) + Math.sin(t * 0.9) * 0.02, 3, dt || 1);
      J.chest.position.y = 8 + Math.sin(t * 0.9) * 0.4;
      J.head.rotation.y = tx * 0.3; J.head.rotation.x = 0.12 + Math.sin(t * 0.6) * 0.03;
      J.halo.rotation.z += (dt || 0) * 0.25; J.halo2.rotation.z -= (dt || 0) * 0.4;
      J.wings.forEach((w, i) => { w.rotation.x = Math.sin(t * 0.8 + i * 0.4) * 0.05; });
      J.grav.forEach((g, i) => { g.rotation.y += (dt || 0) * (0.3 + i * 0.15); g.rotation.x += (dt || 0) * 0.1 * (i - 1); });
      M_pulse(this);
      this.root.updateMatrixWorld(true);
      // hands and arms
      for (const h of this.hands) {
        h.g.position.copy(h.pos).sub(this.root.position);
        h.g.rotation.set(h.pitch, h.yaw, h.roll);
        h.fingers.forEach(([f1, f2], k) => { const c = h.curl * (k === 4 ? 0.7 : 1); f1.rotation.x = c * 1.1; f2.rotation.x = c * 1.3; });
        const A = this.arms[h.i], S = J.sh[h.i].getWorldPosition(V());
        const fwd = V(Math.sin(h.yaw), 0, Math.cos(h.yaw));
        const Wr = h.pos.clone().addScaledVector(fwd, -3.4);
        const d = Wr.distanceTo(S), L = 24, mid = S.clone().add(Wr).multiplyScalar(0.5);
        const dir = Wr.clone().sub(S).normalize();
        const bend = V(A.sx * 0.8, -0.5, -0.3); bend.addScaledVector(dir, -bend.dot(dir)).normalize();
        const El = mid.addScaledVector(bend, Math.sqrt(Math.max(0, L * L - d * d / 4)) + 2);
        this.seg(A.up, S, El); this.seg(A.fo, El, Wr);
        A.el.position.copy(El).sub(this.root.position);
      }
    }
    phaseText() {
      if (this.state === 'intro') return '🌑 奈落の向こうから、君主が這い上がってくる…';
      if (this.state === 'transform') return '🌑 王冠が砕け、重力が裏返る';
      return this.form === 1 ? '👑 紅月の玉座　|　床を叩いた手・造物を攻撃できる' : '🌌 天穹の果て　|　胸の虚無核が弱点・紫の紋章は重力反転';
    }
    bar() {
      if (!this._broke) return super.bar();
      G.ui.bossBar({ lv: this.level, name: '虚無の化身', title: 'AVATAR OF THE VOID', hp: this.hp, max: this.maxHp, shield: 0, maxShield: 0, phase: this.phaseText() });
    }
    atkRate() { const cap = [1.15, 1.25, 1.35, 1.45][BS.diffRank ? BS.diffRank() : 1]; return Math.min(this.speedK * this.tempo, cap); }
    hit(dmg, src, pos, elem) { this.hurtPlayer(dmg, src, pos, elem); }
    // ---------------------------------------------------------------- the frame
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const P = Pl();
      TR.tick(this, dt);
      if (this.stage2) this.orbit(dt);
      if (this.stg && this.stg.stars) { this.stg.stars.position.copy(G.camera.position); this.stg.spin.rotation.y += dt * 0.05; }
      if (this.hp < this.lastHp) this.noDmgT = 0; else this.noDmgT += dt;
      this.lastHp = this.hp;
      if (this.state === 'intro') this.updateIntro(dt);
      else if (this.state === 'transform') this.updateTransform(dt);
      else {
        // escalation inside a form
        const frac = this.hp / this.maxHp;
        if (this.form === 1 && this.phase === 1 && frac <= 0.5) this.escalate(2, '🌑 君主が怒りに震える — 攻撃が激しくなった', 'rings', 3);
        if (this.form === 2 && this.phase === 3 && frac <= 0.5) this.escalate(4, '🌌 虚無が溢れ出す — 終焉が近い');
        this.cd -= dt * this.atkRate();
        this.tearT -= dt;
        if (this.act) { G.fx.teleK = this.atkRate(); try { this.runAct(dt); } finally { G.fx.teleK = 1; } }
        else {
          this.lean = U.damp(this.lean || 0, 0, 2, dt);
          for (const h of this.hands) if (!h.busy) this.restHand(h, dt);
          if (this.cd <= 0) this.choose();
        }
        this.updateConstructs(dt);
      }
      this.updateLift(dt);
      // mist where the body meets the dark, embers off the crown
      if (!this.stage2 && Math.random() < dt * 14) { const a = Math.random() * Math.PI * 2; G.fx.norm.spawn(this.home.x + Math.cos(a) * 12, U.rand(-6, -1), this.home.z + Math.sin(a) * 9, U.rand(-0.5, 0.5), U.rand(0.3, 1.2), U.rand(-0.5, 0.5), 3, 2.5, 6, 0.25, 0.04, 0.16, 0.5, -0.1, 1); }
      if (Math.random() < dt * 8) { const p = this.J.crown.getWorldPosition(V()); G.fx.flameLick(p.x + U.rand(-3, 3), p.y + U.rand(0, 2), p.z + U.rand(-3, 3), 3.5, this.form === 2 ? VIO : PINK); }
      this.pose(dt);
      this.updateHits();
      this.bar();
    }
    escalate(ph, msg, pat, arg) {
      this.phase = ph; this.speedK = ph === 2 ? 1.15 : 1.3;
      G.ui.toast(msg, 'warn'); this.roar(0.42, 1.3); Pl().addShake(0.5);
      if (pat) TR.run(this, pat, arg); this.tearT = 12;
    }
    roar(pitch, vol) { const P = Pl(), p = this.home.clone().lerp(P.pos, 0.75); p.y += 8; G.sfx.monster(p, 'roar', pitch || 0.4, vol || 1.2); }
    updateIntro(dt) {
      this.introT += dt;
      const k = U.clamp(this.introT / 5, 0, 1), e = 1 - Math.pow(1 - k, 3);
      this.J.body.position.y = -46 * (1 - e);
      if (this.introT < 5) { Pl().addShake(dt * 0.6); if (Math.random() < dt * 3) G.sfx.rumble && G.sfx.rumble(0.8, 0.8); }
      if (!this._introRoar && this.introT > 3.2) { this._introRoar = true; this.roar(0.35, 1.5); G.ui.banner('虚無の君主', '— 奈落の向こうより、紅い月の主が立ち上がる —', true); Pl().addShake(0.8); }
      for (const h of this.hands) this.restHand(h, dt, this.introT < 3.5 ? -20 : 0);
      if (this.introT > 6.2) { this.state = 'fight'; this.cd = 1.2; G.ui.toast('🌑 床を叩いた手や、こちら側に現れる造物も攻撃できる', 'warn'); }
    }
    restHand(h, dt, dy) {
      const t = this.t + h.i * 1.7;
      const want = h.rest.clone().add(V(Math.sin(t * 0.7) * 1.2, Math.sin(t * 0.9) * 1.4 + (dy || 0), Math.cos(t * 0.5) * 1));
      h.pos.lerp(want, 1 - Math.exp(-2.5 * dt));
      this.aimHand(h, dt, 0.3, 0, 0.45);
    }
    // point a hand away from its shoulder (fingers out), with a pitch / roll / curl to ease into
    aimHand(h, dt, pitch, roll, curl, rate) {
      const S = this.J.sh[h.i].getWorldPosition(V());
      const want = Math.atan2(h.pos.x - S.x, h.pos.z - S.z), k = 1 - Math.exp(-(rate || 6) * dt);
      h.yaw += U.wrapAngle(want - h.yaw) * k;
      h.pitch += (pitch - h.pitch) * k; h.roll += (roll - h.roll) * k; h.curl += (curl - h.curl) * k;
    }
    moveHand(h, to, dt, rate) { h.pos.lerp(to, 1 - Math.exp(-(rate || 5) * dt)); }
    // ---------------------------------------------------------------- choosing
    choose() {
      const f2 = this.form === 2, P = Pl();
      const list = f2 ? [['starring', 2.2], ['rift', 2.2], ['lance', 2], ['clap', 2], ['gravity', this.lift ? 0 : 2.4], ['singularity', 1.3]]
        : [['slam', 3], ['sweep', 2.2], ['volley', 1.8], ['meteors', 1.4], ['hurl', 1.4]];
      if (!f2 && this.tearT <= 0) list.push(['tear', 6]);
      const ok = list.filter(([k, w]) => w > 0 && k !== this.last);
      let tot = 0; for (const [, w] of ok) tot += w;
      let x = Math.random() * tot, k = ok[0][0];
      for (const [kk, w] of ok) { x -= w; if (x <= 0) { k = kk; break; } }
      this.last = k;
      const n = k === 'slam' ? (this.phase >= 2 ? 2 : 1) : k === 'sweep' ? (this.phase >= 2 && Math.random() < 0.4 ? 2 : 1) : 1;
      this.act = { k, t: 0, n, i: 0 };
      if (k === 'tear') this.tearT = [16, 13, 12, 10][this.phase - 1] + Math.random() * 3;
      if (!P) this.act = null;
    }
    end(cd) {
      const a = this.act;
      if (a) { G.fx.endTelegraph(a.tele); G.fx.endTelegraph(a.tele2); G.fx.endTeleLine(a.line); for (const h of a.hs || []) if (h.slam) G.fx.endTelegraph(h.slam.tele); if (a.pts) for (const p of a.pts) G.fx.endTelegraph(p.tele); if (a.rock) { G.fx.endTelegraph(a.rock.tele); if (!a.done) G.scene.remove(a.rock.m); } if (a.g) dropG(a.g); for (const wv of a.waves || []) if (wv.sr) wv.sr.dispose(); }
      if (a && a.lance) G.scene.remove(a.lance);
      for (const h of this.hands) { h.busy = false; this.unplant(h); h.rockM.visible = false; h._x = undefined; }
      this.act = null; this.cd = cd ?? (this.form === 2 ? 1.25 : 1.6);
    }
    runAct(dt) {
      const a = this.act; a.t += dt * this.atkRate();
      const fn = this['a_' + a.k];
      if (!fn || fn.call(this, a, dt)) this.end();
    }
    // ---------------------------------------------------------------- attacks
    // slam: a hand hangs over you, follows you, stops, and comes down. It stays on the floor for a moment: strike it.
    // the open hand's footprint (palm + fingers) is centred HAND_C ahead of the palm; the warning circle sits on that centre and covers it
    a_slam(a, dt) {
      const P = Pl(), W = 1.6, DROP = 0.16, PLANT = 2.2, UP = 0.55, R = 5.9; // (R: the hand reaches 5.85 m from the centre, so the circle still covers it)
      if (!a.hs) {
        a.hs = a.both ? [this.hands[0], this.hands[1]] : [this.hands[(a.i + (Math.random() < 0.5 ? 0 : 1)) % 2]];
        a.hs.forEach((h, j) => { h.busy = true; h.slam = { off: j ? V(U.rand(-1, 1), 0, U.rand(-1, 1)).normalize().multiplyScalar(U.rand(9, 13)) : V(), c: null, at: null, tele: null, done: false }; });
        G.sfx.attackWind && G.sfx.attackWind(P.pos, true); this.lean = 0.12;
      }
      for (const h of a.hs) {
        const S = h.slam;
        if (a.t < W) {
          const lock = a.t > W - 0.42;
          if (!lock) { S.c = clampTiles(P.pos.clone().add(S.off).setY(0)); const sh = this.J.sh[h.i].getWorldPosition(V()); S.yaw = Math.atan2(S.c.x - sh.x, S.c.z - sh.z); S.at = S.c.clone().add(V(Math.sin(S.yaw), 0, Math.cos(S.yaw)).multiplyScalar(-HAND_C)); }
          this.moveHand(h, S.at.clone().setY(12 + Math.sin(a.t * 6) * 0.3), dt, lock ? 10 : 4);
          this.aimHand(h, dt, 0.15, 0, 0.1);
          if (!S.tele) S.tele = G.fx.telegraph(S.c, R, W, this.col()); else G.fx.teleMove(S.tele, S.c);
          if (Math.random() < dt * 10) G.fx.add.spawn(h.pos.x + U.rand(-2, 2), h.pos.y - 1, h.pos.z + U.rand(-2, 2), 0, -U.rand(2, 5), 0, 0.6, 0.2, 0.05, 1, 0.3, 0.6, 0.8, 0, 0.5);
        } else if (a.t < W + DROP) {
          const k = (a.t - W) / DROP; h.pos.y = U.lerp(12, 0.85, k * k); h.pos.x = S.at.x; h.pos.z = S.at.z;
          this.aimHand(h, dt, 0, 0, 0, 20); h.yaw = S.yaw;
        } else {
          if (!S.done) {
            S.done = true; h.pos.set(S.at.x, 0.85, S.at.z); h.yaw = S.yaw; h.pitch = 0; h.curl = 0;
            G.fx.explosion(S.c.clone().setY(0.6), 3.4, this.col(), { decal: false, noSmoke: true }); G.fx.ring(S.c.clone().setY(0.15), R, this.col(), 0.5); G.fx.dust(S.c.clone().setY(0.3), V(0, 1, 0), 0x6a3a5a, 26);
            G.fx.decal(S.c.clone().setY(0.03), V(0, 1, 0), 'crack', 8, true);
            G.sfx.explosion(S.c, 1.6); P.addShake(0.75); G.sfx.rumble && G.sfx.rumble(0.8, 0.6);
            if (Math.hypot(P.pos.x - S.c.x, P.pos.z - S.c.z) < R && P.pos.y < 3.4) { this.hit(36, 'aoe', S.c.clone()); const kd = P.pos.clone().sub(S.c).setY(0); if (kd.lengthSq() < 0.01) kd.set(1, 0, 0); kd.normalize(); P.vel.addScaledVector(kd, 15); P.vel.y = Math.max(P.vel.y, 6); }
            this.plant(h);
            if (!this.slamTip) { this.slamTip = true; G.ui.toastSmall('✋ 床を叩いた手は、しばらくの間攻撃できる（ダメージ1.5倍）'); }
            if (this.phase >= 2 && Math.random() < 0.5) { const t = TR.at(S.c.x, S.c.z); if (t) a.crack = (a.crack || []).concat([t]); }
          }
          const tp = a.t - W - DROP;
          if (tp < PLANT) { h.pos.y = 0.85; if (Math.random() < dt * 4) G.fx.dust(h.pos.clone().setY(0.2), V(0, 1, 0), 0x6a3a5a, 2); }
          else { this.unplant(h); this.moveHand(h, h.rest, dt, 2.2); this.aimHand(h, dt, 0.3, 0, 0.45); }
        }
      }
      if (a.t > W + DROP + PLANT + UP) {
        if (a.crack) { TR.collapse(a.crack, 1.0); this._restoreQ = (this._restoreQ || []).concat([{ list: a.crack, t: 7 }]); }
        a.i++;
        if (a.i < a.n) { for (const h of a.hs) { h.busy = false; this.unplant(h); } a.hs = null; a.t = 0.35; a.crack = null; return false; }
        return true;
      }
      return false;
    }
    // the palm on the floor is solid (box around the palm; the fingers are lower and stay walkable)
    plant(h) {
      h.planted = true;
      const w = this.world, P = Pl(), c = Math.abs(Math.cos(h.yaw)), s = Math.abs(Math.sin(h.yaw));
      const ex = 2.7 * c + 2.6 * s, ez = 2.7 * s + 2.6 * c;
      if (w.addCollider) { h.col = w.addCollider(h.pos.x - ex, 0, h.pos.z - ez, h.pos.x + ex, 1.65, h.pos.z + ez, { surf: 'metal', noGrapple: true }); w.depenetrate && w.depenetrate(P.pos, P.hw, P.height); }
    }
    unplant(h) { if (!h.planted) return; h.planted = false; if (h.col) { this.world.removeCollider(h.col); h.col = null; } }
    // sweep: a hand comes in low from one side and brushes a whole lane of the floor (it throws you far: off the edge if you stand near it)
    // the hand stands on its edge, fingers pointing straight down the lane's length (+z): the lane is exactly palm + fingers wide
    a_sweep(a, dt) {
      const P = Pl(), w = this.world, W = 1.6, GO = 0.75, wid = HAND_L, x0 = -10, x1 = (w.W || 76) + 10;
      if (!a.h) {
        a.dir = Math.random() < 0.5 ? 1 : -1;
        a.h = this.hands[a.dir > 0 ? 0 : 1]; a.h.busy = true;
        a.z = clampTiles(P.pos.clone()).z;
        a.from = V(a.dir > 0 ? x0 : x1, 1.7, a.z - HAND_C); a.to = V(a.dir > 0 ? x1 : x0, 1.7, a.z - HAND_C);
        a.line = G.fx.teleLine(V(x0, 0, a.z), V(x1, 0, a.z), wid, W, this.col());
        G.sfx.attackWind && G.sfx.attackWind(P.pos, true);
      }
      const h = a.h;
      if (a.t < W) {
        this.moveHand(h, a.from.clone().add(V(0, Math.max(0, 1 - a.t / W * 1.6) * 8, -6 * Math.max(0, 1 - a.t / W * 1.6))), dt, 4);
        this.aimHand(h, dt, 0, a.dir * Math.PI / 2, 0.2, 8); h.yaw = U.damp(h.yaw, 0, 8, dt);
        return false;
      }
      const k = Math.min(1, (a.t - W) / GO);
      if (!a.go) { a.go = true; G.sfx.whoosh(0.9, 1.4); G.fx.endTeleLine(a.line); a.line = null; }
      const px = h.pos.x;
      h.pos.lerpVectors(a.from, a.to, k);
      this.aimHand(h, dt, 0, a.dir * Math.PI / 2, 0, 30); h.yaw = 0;
      if (Math.random() < 0.9) G.fx.dust(V(h.pos.x, 0.2, a.z + U.rand(-4, 4)), V(0, 1, 0), 0x6a3a5a, 3);
      // the edge-on hand is 1.6 m thick and reaches 4.4 m up; the player is 0.4 m around
      const lo = Math.min(px, h.pos.x) - 1.2, hi = Math.max(px, h.pos.x) + 1.2;
      if (!a.hitP && P.pos.x > lo && P.pos.x < hi && Math.abs(P.pos.z - a.z) < wid / 2 + 0.4 && P.pos.y < 4.4) {
        a.hitP = true; this.hit(28, 'melee', h.pos.clone());
        P.vel.x = a.dir * 30; P.vel.z += (P.pos.z - a.z) * 0.5; P.vel.y = 8; P.grounded = false; P.addShake(0.6);
        G.ui.toastSmall('💨 はらい飛ばされた！');
      }
      if (k >= 1) {
        if (a.n > 1 && !a.second) { a.second = true; h.busy = false; a.h = null; a.go = false; a.hitP = false; a.t = 0.3; return false; }
        return a.t > W + GO + 0.3;
      }
      return false;
    }
    // volley: fans of dark orbs from the third eye, across the void
    a_volley(a, dt) {
      const P = Pl(), W = 0.85, salvos = this.form === 2 ? 4 : 3;
      if (a.t < W) { if (!a.s) { a.s = true; G.sfx.magic(P.pos.clone().lerp(this.home, 0.3), 'dark'); } this.J.jewel.scale.setScalar(1 + a.t); return false; }
      while ((a.step || 0) < salvos && a.t >= W + (a.step || 0) * 0.45) {
        a.step = (a.step || 0) + 1;
        const from = this.eyePos(), aim = P.chestPos().add(P.vel.clone().multiplyScalar(0.55)), dir = aim.sub(from).normalize();
        const cnt = 5;
        for (let i = 0; i < cnt; i++) {
          const d = dir.clone().applyAxisAngle(Y, (i - (cnt - 1) / 2) * 0.045);
          C().spawnProjectile({ kind: 'darkorb', pos: from.clone(), vel: d.multiplyScalar(30), owner: 'enemy', dmg: 16 * this.dmgScale, radius: 0.55, life: 4.5, attacker: this.main });
        }
        G.sfx.magic(P.pos.clone().lerp(from, 0.4), 'dark'); G.fx.flash(from, PINK, 60, 0.15, 20);
      }
      if (a.t > W + salvos * 0.45 + 0.5) { this.J.jewel.scale.setScalar(1); return true; }
      return false;
    }
    eyePos() { this.root.updateMatrixWorld(true); return this.J.jewel.getWorldPosition(V()); }
    // meteors: the hand raised to the red moon; stars come down around you
    a_meteors(a, dt) {
      const P = Pl(), n = this.form === 2 ? 11 : 8, R = 3.3;
      const h = this.hands[1]; h.busy = true;
      this.moveHand(h, this.home.clone().add(V(14, 44, 6)), dt, 3); this.aimHand(h, dt, -1.2, 0, 0.9);
      if (!a.pts) {
        a.pts = []; this.roar(0.5, 0.9);
        for (let i = 0; i < n; i++) { const c = clampTiles(i === 0 ? P.pos.clone() : P.pos.clone().add(V(U.rand(-11, 11), 0, U.rand(-11, 11)))).setY(0); const T = 1.5 + i * 0.16; a.pts.push({ c, T, tele: G.fx.telegraph(c, R, T, this.col()), sky: c.clone().add(V(U.rand(-8, 8), 46, -18)), done: false }); }
      }
      for (const p of a.pts) {
        if (p.done) continue;
        const k = (a.t - (p.T - 0.45)) / 0.45;
        if (k > 0 && k < 1) { const q = p.sky.clone().lerp(p.c, k); G.fx.add.spawn(q.x, q.y, q.z, 0, 0, 0, 0.12, 1.2, 0.6, 1.6, 0.5, 1.0, 1, 0, 0); G.fx.add.spawn(q.x, q.y, q.z, U.rand(-1, 1), 2, U.rand(-1, 1), 0.5, 0.5, 0.05, 1, 0.3, 0.6, 0.8, 0, 0.3); }
        if (a.t >= p.T) {
          p.done = true;
          G.fx.explosion(p.c.clone().setY(0.5), R * 0.7, this.col(), { decal: false }); G.sfx.explosion(p.c, 0.7);
          if (Math.hypot(P.pos.x - p.c.x, P.pos.z - p.c.z) < R && P.pos.y < 3.5) this.hit(26, 'aoe', p.c.clone());
        }
      }
      return a.pts.every((p) => p.done) && a.t > a.pts[a.pts.length - 1].T + 0.4;
    }
    // hurl: the hand scoops a boulder out of the dark and throws it in an arc onto you
    a_hurl(a, dt) {
      const P = Pl(), h = this.hands[a.side ?? (a.side = Math.random() < 0.5 ? 0 : 1)], DIP = 1.1, RISE = 0.55, FLY = 1.5, R = 4.4;
      h.busy = true;
      if (a.t < DIP) { this.moveHand(h, V(this.home.x + h.sx * 18, -14, this.home.z + 15), dt, 4); this.aimHand(h, dt, 0.4, 0, 0.2); return false; }
      if (a.t < DIP + RISE) { h.rockM.visible = true; this.moveHand(h, V(this.home.x + h.sx * 16, 24, this.home.z + 8), dt, 7); this.aimHand(h, dt, -0.9, 0, 0.85, 8); if (!a.up) { a.up = true; G.sfx.stoneGrind && G.sfx.stoneGrind(P.pos.clone().lerp(h.pos, 0.6), 1.2); } return false; }
      if (!a.rock) {
        h.rockM.visible = false;
        const from = h.rockM.getWorldPosition(V());
        const to = clampTiles(P.pos.clone().add(P.vel.clone().setY(0).multiplyScalar(0.6))).setY(0);
        const m = new THREE.Mesh(PG().dode, this.M.rock); m.scale.setScalar(2.2); m.position.copy(from); G.scene.add(m);
        a.rock = { m, from, to, tele: G.fx.telegraph(to, R, FLY, this.col()) };
        G.sfx.whoosh(0.8, 1.2);
      }
      const k = Math.min(1, (a.t - DIP - RISE) / FLY), r = a.rock;
      r.m.position.lerpVectors(r.from, r.to, k); r.m.position.y = U.lerp(r.from.y, 1.4, k) + Math.sin(k * Math.PI) * 14;
      r.m.rotation.x += dt * 4; r.m.rotation.z += dt * 2.5;
      if (Math.random() < 0.8) G.fx.norm.spawn(r.m.position.x, r.m.position.y, r.m.position.z, 0, 0, 0, 0.8, 1.0, 2.2, 0.35, 0.15, 0.3, 0.5, 0, 0.5);
      this.moveHand(h, h.rest, dt, 2); this.aimHand(h, dt, 0.3, 0, 0.45);
      if (k >= 1 && !a.done) {
        a.done = true; G.scene.remove(r.m);
        G.fx.explosion(r.to.clone().setY(0.8), R * 0.75, 0xff7ab8); G.fx.debris(r.to.clone().setY(1), this.M.rock, 10, 0.7, 9); G.fx.dust(r.to, V(0, 1, 0), 0x6a3a5a, 20);
        G.sfx.explosion(r.to, 1.4); P.addShake(0.5);
        if (Math.hypot(P.pos.x - r.to.x, P.pos.z - r.to.z) < R && P.pos.y < 4) { this.hit(32, 'explosion', r.to.clone()); const kd = P.pos.clone().sub(r.to).setY(0).normalize(); P.vel.addScaledVector(kd, 10); P.vel.y = Math.max(P.vel.y, 6); }
      }
      return a.done && a.t > DIP + RISE + FLY + 0.3;
    }
    // tear: the hand rakes the air over the floor and a pattern of tiles lights up and falls
    a_tear(a, dt) {
      const h = this.hands[a.side ?? (a.side = Math.random() < 0.5 ? 0 : 1)];
      h.busy = true;
      if (a.t < 0.7) { this.moveHand(h, V(this.home.x + h.sx * 10, 18, this.home.z + 18), dt, 4); this.aimHand(h, dt, -0.6, 0, 1.0); if (!a.r) { a.r = true; this.roar(0.5, 0.8); } return false; }
      if (!a.done) { a.done = true; TR.runPhase(this); G.sfx.whoosh(0.7, 1); Pl().addShake(0.3); }
      this.moveHand(h, V(this.home.x + h.sx * 10, -4, this.home.z + 20), dt, 6); this.aimHand(h, dt, 0.8, 0, 1.0);
      return a.t > 1.5;
    }
    // gravity reversal (second form): a violet circle; whoever stands in it when it goes off is thrown high, held, and smashed down
    // (its warning is a seal of its own, not the round warning every other attack uses: rotating runes, a hexagram, six pillars of light)
    a_gravity(a, dt) {
      const P = Pl(), W = 1.7, R = 8.5, fl = this.floorY();
      if (!a.zones) {
        a.zones = [this.clampFloor(P.pos.clone())];
        if (this.phase >= 4 && this.stage2) { const o = this.stagePt(4, PR - 4); if (o.distanceTo(a.zones[0]) > 14) a.zones.push(o); }
        a.g = new THREE.Group(); G.scene.add(a.g);
        a.sig = a.zones.map((z) => gravSeal(a.g, z, R));
        G.ui.toastSmall('⚠ 紫の紋章 — 重力が反転する！ 紋章の外へ'); if (G.sfx.gravWarn) G.sfx.gravWarn(W / this.atkRate()); this.roar(0.3, 0.9);
      }
      for (const h of this.hands) { h.busy = true; this.moveHand(h, this.home.clone().add(this.rotL(h.sx * 21, 12 + a.t * 4, 14)), dt, 3); this.aimHand(h, dt, 0, Math.PI, 0.6); }
      const k = Math.min(1, a.t / W);
      for (const sg of a.sig) sg.tick(dt, k, a.done ? a.t - W : -1);
      if (a.t < W) {
        for (const z of a.zones) if (Math.random() < dt * 50) { const an = Math.random() * 6.28, r = Math.sqrt(Math.random()) * R; G.fx.add.spawn(z.x + Math.cos(an) * r, fl + 0.1, z.z + Math.sin(an) * r, 0, U.rand(3, 7) * (0.4 + k), 0, 1.2, 0.12, 0.04, 0.8, 0.5, 1.3, 0.9, -0.3, 0.3); }
        return false;
      }
      if (!a.done) {
        a.done = true;
        for (const z of a.zones) { G.fx.flash(z.clone().setY(fl + 2), 0xd0a0ff, 90, 0.35, 20); for (let i = 0; i < 24; i++) { const an = i / 24 * 6.28; G.fx.add.spawn(z.x + Math.cos(an) * R * 0.85, fl + 0.3, z.z + Math.sin(an) * R * 0.85, 0, 26, 0, 1, 0.45, 0.05, 0.85, 0.55, 1.5, 1, 0, 0); } }
        G.sfx.whoosh(1, 1.5);
        const inZ = a.zones.find((z) => Math.hypot(P.pos.x - z.x, P.pos.z - z.z) < R);
        if (inZ && P.pos.y < fl + 5 && !this.lift && !P.dead) this.startLift();
      }
      return a.t > W + 0.9;
    }
    startLift() {
      const P = Pl();
      if (BS.swapMerc) { BS.hurtMerc(BS.swapMerc, 1e9); G.fx.ring(P.pos.clone().setY(P.pos.y + 0.2), 4, VIO, 0.5); return; } // aimed at the mercenary: it is simply smashed (capped at half its health)
      this.lift = { ph: 'up', t: 0, top: Math.max(this.floorY(), P.pos.y) + TOP, hold: 1.5 };
      P.grapple.state = 'none'; P.pileState = null; P.grounded = false;
      G.ui.toast('🌀 重力が反転した！', 'warn'); if (G.sfx.gravLift) G.sfx.gravLift(); else G.sfx.magic(P.pos, 'dark'); P.addShake(0.5);
    }
    updateLift(dt) {
      const L = this.lift, P = Pl(); if (!L) return;
      if (P.dead || G.game.state !== 'playing' && G.game.state !== 'inv') { if (P.dead) this.endLift(); return; }
      L.t += dt;
      P.grapple.state = 'none'; P.pileState = null; P.dragT = Math.max(P.dragT || 0, 0.12);
      P.vel.x *= Math.exp(-3 * dt); P.vel.z *= Math.exp(-3 * dt);
      if (Math.random() < dt * 30) G.fx.add.spawn(P.pos.x + U.rand(-0.6, 0.6), P.pos.y + U.rand(0, 1.6), P.pos.z + U.rand(-0.6, 0.6), 0, L.ph === 'down' ? 8 : -3, 0, 0.6, 0.15, 0.02, 0.7, 0.4, 1.2, 0.9, 0, 0.3);
      if (L.ph === 'up') {
        P.liftVy = Math.min(34, (L.top - P.pos.y) * 3.2 + 3);
        if (G.sfx.gravFloat) G.sfx.gravFloat(0.3);
        if (P.pos.y > L.top - 1 || L.t > 1.6) { L.ph = 'hold'; L.t = 0; }
      } else if (L.ph === 'hold') {
        P.liftVy = (L.top - P.pos.y) * 2 + Math.sin(L.t * 3) * 0.4;
        if (G.sfx.gravFloat) G.sfx.gravFloat(0.3 + 0.7 * L.t / L.hold);
        L.beat = (L.beat || 0) - dt; if (L.beat <= 0) { L.beat = Math.max(0.22, 0.6 - L.t * 0.25); if (G.sfx.heartbeat) G.sfx.heartbeat(0.5 + L.t / L.hold * 0.5); }
        if (L.t > L.hold - 0.55 && !L.warned) { L.warned = true; G.ui.toastSmall('⚠ 落ちる！'); if (G.sfx.gravCreak) G.sfx.gravCreak(); P.addShake(0.25); }
        if (L.t > L.hold) { L.ph = 'down'; L.t = 0; if (G.sfx.gravDrop) G.sfx.gravDrop(); else G.sfx.whoosh(1, 1.2); }
      } else if (L.ph === 'down') {
        P.liftVy = -46;
        if (L.t > 0.05 && P.grounded) {
          const c = P.pos.clone();
          this.endLift();
          G.fx.explosion(c.clone().setY(c.y + 0.4), 2.6, VIO, { decal: false }); G.fx.ring(c.clone().setY(c.y + 0.1), 6, VIO, 0.6); G.fx.dust(c, V(0, 1, 0), 0x6a3a5a, 30); G.fx.decal(c.clone().setY(c.y + 0.03), V(0, 1, 0), 'crack', 5, true);
          if (G.sfx.gravCrash) G.sfx.gravCrash(); else G.sfx.explosion(c, 1.6); P.addShake(1.1);
          C().damagePlayer(P.stats.maxHp * 0.5, { src: 'aoe', fixed: true, attacker: this.main, pos: c });
          G.ui.toastSmall('💥 地面に叩きつけられた');
        } else if (P.pos.y < this.floorY() - 2) this.endLift(); // no floor under you: the void takes over
      }
    }
    endLift() { const P = Pl(); this.lift = null; if (P) { P.liftVy = null; P.dragT = 0; } }
    // singularity (second form): a black star opens over the void at the edge and drags everything towards it
    a_singularity(a, dt) {
      const P = Pl(), DUR = 3.6;
      if (!a.c) {
        if (this.stage2) { const S = this.stg, d = this.home.clone().sub(S.c).setY(0).normalize(); a.c = S.c.clone().addScaledVector(d, PR + 5); a.c.y = Y2 + 3; }
        else a.c = V(U.clamp(P.pos.x, 14, (this.world.W || 76) - 14), 3, 2);
        const g = new THREE.Group(); g.position.copy(a.c);
        mesh(g, PG().sph, new THREE.MeshBasicMaterial({ color: 0x000000 }), 2.2, 2.2, 2.2);
        a.ring = mesh(g, PG().torus, new THREE.MeshBasicMaterial({ color: VIO, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), 4.2, 4.2, 6, 0, 0, 0, 1.3);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xd080ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(16, 16, 1); g.add(sp);
        g.scale.setScalar(0.01); G.scene.add(g); a.g = g;
        G.ui.toastSmall('⚠ 虚無の渦 — 強く引き寄せられる！ 走って逆へ'); G.sfx.rumble && G.sfx.rumble(1.4, 1.2); this.roar(0.32, 1);
      }
      const k = Math.min(1, a.t / 0.8); a.g.scale.setScalar(0.01 + k); a.ring.rotation.z += dt * 3;
      for (const h of this.hands) { h.busy = true; this.moveHand(h, a.c.clone().add(this.rotL(h.sx * 7, 2, -3)), dt, 3); this.aimHand(h, dt, 0, -h.sx * 1.2, 0.7); }
      if (Math.random() < dt * 60) { const an = Math.random() * 6.28, r = U.rand(8, 16); G.fx.add.spawn(a.c.x + Math.cos(an) * r, a.c.y + U.rand(-2, 2), a.c.z + Math.sin(an) * r, -Math.cos(an) * r * 0.9, 0, -Math.sin(an) * r * 0.9, 1, 0.25, 0.05, 0.7, 0.4, 1.2, 0.9, 0, 0); }
      if (a.t > 0.6 && a.t < DUR && !this.lift) {
        const to = a.c.clone().sub(P.pos).setY(0), l = to.length();
        // up to 7 m/s: walking (6.2) is not enough, a run (9.7) gets you out
        if (l > 1) { const spd = U.lerp(3, 7, Math.min(1, (a.t - 0.6) / 1.3)); P.pos.addScaledVector(to.divideScalar(l), spd * dt); }
        P.addShake(dt * 0.15);
      }
      if (a.t >= DUR && !a.done) {
        a.done = true; G.scene.remove(a.g);
        G.fx.explosion(a.c.clone(), 4, VIO, { decal: false }); G.sfx.explosion(a.c, 1.2);
        const base = this.stage2 ? Math.atan2(this.stg.c.x - a.c.x, this.stg.c.z - a.c.z) : 0; // a fan back over the floor
        for (let i = 0; i < 14; i++) { const an = base + i / 13 * 2.4 - 1.2; C().spawnProjectile({ kind: 'darkorb', pos: a.c.clone().setY(this.floorY() + 1.4), vel: V(Math.sin(an), 0, Math.cos(an)).multiplyScalar(13), owner: 'enemy', dmg: 14 * this.dmgScale, radius: 0.55, life: 5, attacker: this.main }); }
      }
      return a.done && a.t > DUR + 0.5;
    }
    col() { return this.form === 2 ? VIO : PINK; }
    // ---------------------------------------------------------------- the constructs (something to break for builds that cannot shoot across)
    updateConstructs(dt) {
      const cap = this.form === 2 ? 2 : 1;
      this.conCd -= dt; this.conT -= dt;
      if (this.constructs.length < cap && this.conCd <= 0 && (this.noDmgT > 9 || this.conT <= 0)) this.spawnConstruct();
      const P = Pl();
      for (const c of this.constructs) {
        c.t += dt;
        const tile = c.tile, fl = this.floorY();
        if (tile && (tile.state === 'fall' || tile.state === 'down')) this.moveConstruct(c);
        c.pos.y = fl + 1.9 + Math.sin(c.t * 2) * 0.25;
        c.g.position.copy(c.pos); c.p.hitW[0].w.copy(c.pos); c.p.pos.copy(c.pos).setY(fl); c.p.centerRef.copy(c.pos);
        c.spin.rotation.y += dt * 1.6; c.ring.rotation.z += dt * 0.8;
        G.fx.beam(c.pos, this.J.chest.getWorldPosition(V()).add(V(0, 10, 0)), this.col(), 0.06, 0.05);
        // a crimson pulse: jump it, or step back out of it
        c.pulse -= dt;
        if (c.pulse < 1.0 && !c.tele) c.tele = G.fx.telegraph(c.pos.clone().setY(fl), 4.6, 1.0, this.col());
        if (c.pulse <= 0) {
          c.pulse = 4.8; c.tele = null;
          G.fx.ring(c.pos.clone().setY(fl + 0.2), 4.6, this.col(), 0.4); G.sfx.magic(c.pos, 'dark');
          if (Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z) < 4.6 && P.pos.y < fl + 1.2) { this.hurtPlayer(14, 'aoe', c.pos.clone()); const kd = P.pos.clone().sub(c.pos).setY(0).normalize(); P.vel.addScaledVector(kd, 9); P.vel.y = Math.max(P.vel.y, 4); }
        }
      }
    }
    spawnConstruct() {
      const P = Pl();
      let tile = null, pos;
      if (this.stage2) { pos = this.stagePt(5, PR - 4); for (let i = 0; i < 8 && pos.distanceTo(P.pos.clone().setY(Y2)) < 7; i++) pos = this.stagePt(5, PR - 4); pos.y = Y2 + 1.9; }
      else {
        const free = ups().filter((t) => !this.constructs.some((c) => c.tile === t) && !this.hands.some((h) => h.planted && Math.hypot(h.pos.x - t.cx, h.pos.z - t.cz) < 6));
        if (!free.length) return;
        const near = free.filter((t) => { const d = Math.hypot(t.cx - P.pos.x, t.cz - P.pos.z); return d > 7 && d < 20; });
        tile = U.pick(near.length ? near : free); pos = V(tile.cx, 1.9, tile.cz);
      }
      const col = this.col();
      const g = new THREE.Group(); g.position.copy(pos); G.scene.add(g);
      const spin = joint(g);
      mesh(spin, PG().oct3, glowM(col, 1.8), 0.95, 1.7, 0.95);
      mesh(spin, PG().oct3, this.M.dark, 0.62, 1.15, 0.62);
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; mesh(spin, PG().cone, glowM(col, 2.2), 0.18, 0.7, 0.18, Math.cos(a) * 1.6, Math.sin(i) * 0.4, Math.sin(a) * 1.6, 0, 0, Math.PI); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = -1.8; g.add(ring);
      const hp = Math.round((this.form === 2 ? 700 : 520) * this.hpScale);
      const p = this.part({ name: '虚晶の造物', shared: false, hp, maxHp: hp, hitW: [{ r: 1.2, part: 'body', w: pos.clone() }], radius: 1.2, height: 2.4, showBar: true, blood: col });
      p.noFalloff = true;
      const c = { g, spin, ring, p, tile, pos, t: 0, pulse: 3.5 };
      p.die = () => { if (!p.alive) return false; p.alive = false; this.constructBroken(c); return true; };
      this.constructs.push(c);
      this.conCd = 10; this.conT = 38;
      G.fx.smoke(pos, 10, 1.4, col, 1, 1.2); G.fx.flash(pos, col, 40, 0.3, 10); G.sfx.magic(pos, 'dark');
      G.ui.toastSmall(this.conTip ? '💎 虚晶の造物が現れた' : '💎 虚晶の造物が現れた — 砕けば、君主に大きなダメージが入る'); this.conTip = true;
    }
    moveConstruct(c) {
      const t = U.pick(ups().filter((t) => !this.constructs.some((o) => o.tile === t)));
      if (!t) return;
      G.fx.smoke(c.pos, 6, 1, this.col(), 1, 1);
      c.tile = t; c.pos.set(t.cx, 1.9, t.cz);
      if (c.tele) { G.fx.endTelegraph(c.tele); c.tele = null; c.pulse = Math.max(c.pulse, 1.5); }
    }
    removeConstruct(c) { this.conCd = Math.max(this.conCd, 8); G.scene.remove(c.g); if (c.tele) G.fx.endTelegraph(c.tele); c.p.alive = false; c.p.removed = true; this.constructs = this.constructs.filter((o) => o !== c); }
    constructBroken(c) {
      this.removeConstruct(c);
      G.fx.explosion(c.pos.clone(), 2.4, this.col(), { decal: false }); G.fx.debris(c.pos.clone(), this.M.glow, 10, 0.4, 8); G.sfx.shieldBreak && G.sfx.shieldBreak(c.pos);
      if (this.state !== 'fight' || this.dead) return;
      const chest = this.J.chest.getWorldPosition(V()).add(V(0, 10, 4));
      for (let i = 0; i < 3; i++) setTimeout(() => G.fx.lightning(c.pos.clone().add(V(0, 1, 0)), chest.clone().add(V(U.rand(-3, 3), U.rand(-3, 3), 0)), this.col()), i * 90);
      const dmg = Math.round(this.maxHp * 0.08);
      setTimeout(() => {
        if (this.dead || this.state !== 'fight') return;
        this.hp -= dmg;
        G.fx.explosion(chest, 5, this.col(), { decal: false }); G.fx.dmgNum(chest, dmg, 'crit'); this.roar(0.55, 0.9); Pl().addShake(0.3);
        G.ui.feed(`💎 造物を砕いた — 君主に ${dmg} ダメージ`, 'big');
        if (this.hp <= 0) { this.hp = 0; this.onPartDeath(this.main); }
      }, 320);
    }
    // ---------------------------------------------------------------- the crown breaks: the second form
    onPartDeath(p) {
      if (this.dead || this.hp > 0) return false;
      if (this.form === 1) { this.beginTransform(); return false; }
      this.kill(); return true;
    }
    beginTransform() {
      this.state = 'transform'; this.trT = 0; this.hp = 1;
      if (this.act) this.end(0); this.endLift();
      for (const c of this.constructs.slice()) { G.fx.smoke(c.pos, 8, 1.2, PINK, 1, 1); this.removeConstruct(c); }
      C().purgeHostile && C().purgeHostile(); G.fx.clearTelegraphs();
      TR.restoreAll(false); this._restoreQ = [];
      for (const h of this.hands) { h.busy = false; this.unplant(h); }
      G.ui.toast('👑 王冠に亀裂が走る……', 'warn'); this.roar(0.3, 1.6); Pl().addShake(0.8);
      this.buildSky();
    }
    updateTransform(dt) {
      const T = (this.trT += dt), J = this.J, P = Pl(), S = this.stg;
      // clutching its head, then breaking open; then the hands spread, palms up, as it rises
      if (T < 3.0) for (const h of this.hands) { this.moveHand(h, J.head.getWorldPosition(V()).add(this.rotL(h.sx * 9, 1, 7)), dt, 2.5); this.aimHand(h, dt, -0.3, -h.sx * 1.4, 0.8); }
      else for (const h of this.hands) { this.moveHand(h, this.home.clone().add(this.rotL(h.sx * 24, 12, 10)), dt, 2.2); this.aimHand(h, dt, -0.4, Math.PI, 0.3); }
      this.lean = U.damp(this.lean || 0, T < 2.4 ? 0.25 : -0.15, 2, dt);
      if (T < 2.4) { P.addShake(dt * 0.5); if (Math.random() < dt * 7) { const hw = U.pick(this.main.hitW); G.fx.explosion(hw.w.clone().add(V(U.rand(-2, 2), U.rand(-2, 2), 2)), 1.6, PINK, { decal: false, noSmoke: true }); G.sfx.explosion(P.pos.clone().lerp(hw.w, 0.5), 0.4); } }
      if (T >= 2.4 && !this._broke) {
        this._broke = true;
        const cp = J.crown.getWorldPosition(V());
        this.avatarLook();
        G.save.mark('bosses', 'sovereign2'); // the codex learns of the second half only now
        G.fx.explosion(cp, 7, 0xffffff, { decal: false }); G.fx.debris(cp, this.M.glow, 16, 1.2, 14);
        G.fx.explosion(J.core.getWorldPosition(V()), 9, VIO, { decal: false }); G.fx.debris(J.core.getWorldPosition(V()), this.M.armor, 18, 1.6, 16);
        G.fx.flash(cp, 0xd080ff, 200, 0.6, 120);
        G.sfx.explosion(P.pos.clone().lerp(cp, 0.5), 2.4); if (G.sfx.shieldBreak) G.sfx.shieldBreak(P.pos); this.roar(0.25, 1.8); P.addShake(1.2);
        G.ui.banner('虚無の化身', '— 王冠は砕け、重力が裏返る —', true);
        // the weak point moves from the crowned head to the core
        const hw = this.main.hitW; hw[4].part = 'body'; hw.push({ n: J.core, r: 3.4 * SC, part: 'head', o: V(0, 0, 0.8), w: V() });
        this.maxHp = this.hp2; this.hp = 1;
      }
      if (T >= 3.0 && !this.asc) {
        this.asc = { y0: P.pos.y, from: this.home.clone(), fromBody: J.body.position.y };
        if (G.sfx.ascend) G.sfx.ascend(4.4); if (G.sfx.gravLift) G.sfx.gravLift();
        G.ui.toast('🌀 重力が裏返った — 空へ落ちていく！', 'warn'); G.ui.fadeFlash && G.ui.fadeFlash();
        P.grapple.state = 'none'; P.pileState = null; P.grounded = false; P.addShake(0.6);
        this.endLift();
      }
      if (this.asc && !this.stage2) {
        const A = this.asc, k = U.clamp((T - 3.0) / 3.8, 0, 1), e = k * k * (3 - 2 * k);
        // you: carried up and over the platform (no harm can come to you on the way)
        P.invulnT = Math.max(P.invulnT || 0, 0.5); P.dragT = Math.max(P.dragT || 0, 0.12);
        P.liftVy = U.clamp((U.lerp(A.y0, Y2 + 7, e) - P.pos.y) * 6, -10, 95);
        const want = this.clampStage(P.pos.clone(), 6); P.pos.x += (want.x - P.pos.x) * Math.min(1, dt * 1.4); P.pos.z += (want.z - P.pos.z) * Math.min(1, dt * 1.4); P.vel.x = 0; P.vel.z = 0;
        if (G.sfx.gravFloat) G.sfx.gravFloat(0.4 + 0.6 * k);
        // the air rushes past downwards; the ruins drop away; the dark and its stars close in
        for (let i = 0; i < 4; i++) if (Math.random() < dt * 30) G.fx.add.spawn(P.pos.x + U.rand(-8, 8), P.pos.y + U.rand(4, 16), P.pos.z + U.rand(-8, 8), 0, -U.rand(35, 60), 0, 0.35, 0.06, 0.02, 0.8, 0.7, 1.2, 0.9, 0, 0);
        const ks = U.clamp((T - 3.4) / 3.0, 0, 1); G.game.setSpace && G.game.setSpace(ks); S.stars.material.opacity = ks;
        // the giant comes up with you, to the first point of its orbit
        this.home.lerpVectors(A.from, this.orbitPos(this.orbA), e); J.body.position.y = U.lerp(A.fromBody, 0, e);
        this.root.position.copy(this.home); this.pos.copy(this.home);
        // the platform assembles out of the dark
        if (T > 4.6) { const kp = U.clamp((T - 4.6) / 1.7, 0, 1), ep = 1 - Math.pow(1 - kp, 3); S.plat.visible = true; S.spin.visible = true; S.plat.scale.setScalar(Math.max(0.001, ep)); if (Math.random() < dt * 40) { const an = Math.random() * 6.28; G.fx.add.spawn(S.c.x + Math.cos(an) * PR * ep, Y2, S.c.z + Math.sin(an) * PR * ep, 0, U.rand(1, 3), 0, 0.8, 0.25, 0.04, 0.85, 0.6, 1.3, 1, 0, 0.3); } }
        if (T >= 6.8) { this.solidSky(); this.stage2 = true; S.plat.scale.setScalar(1); P.pos.y = Math.max(P.pos.y, Y2 + 4); P.liftVy = -10; G.game.setSpace && G.game.setSpace(1); S.stars.material.opacity = 1; }
      } else if (this.stage2 && P.liftVy != null) {
        // settling onto the platform
        P.dragT = Math.max(P.dragT || 0, 0.1); P.invulnT = Math.max(P.invulnT || 0, 0.5);
        if (P.grounded || T > 11) { P.liftVy = null; P.dragT = 0; G.fx.ring(P.pos.clone().setY(Y2 + 0.1), 5, VIO, 0.6); G.sfx.land && G.sfx.land(1, 'stone'); P.addShake(0.4); }
      }
      if (T >= 3.0) { this.hp = Math.min(this.maxHp, Math.max(1, this.maxHp * U.clamp((T - 4) / 2.6, 0, 1))); J.coreGlow.scale.setScalar(4.2 + Math.sin(this.t * 6) * 0.4); }
      if (this.stage2 && P.liftVy == null && T > 7.4) {
        this.state = 'fight'; this.form = 2; this.phase = 3; this.speedK = 1.15; this.hp = this.maxHp; this.lastHp = this.hp; this.cd = 1.6; this.conT = 20; this.conCd = 6;
        G.ui.toast('🌌 胸の虚無核が弱点。紫の紋章に入ると、重力が反転する', 'warn');
      }
    }
    // ---------------------------------------------------------------- the sky stage
    buildSky() {
      const w = this.world, c = w.arenaCenter, S = this.stg = { c: V(c.x, Y2, c.z), R: PR };
      const grp = w.group || G.scene; // (owned by the field: it stays after the Avatar falls and goes with the area)
      const stars = new THREE.Mesh(new THREE.SphereGeometry(330, 32, 16), new THREE.MeshBasicMaterial({ map: starTex(), side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      stars.renderOrder = -8; stars.frustumCulled = false; grp.add(stars); S.stars = stars;
      const spin = new THREE.Group(); spin.position.copy(S.c); spin.visible = false; grp.add(spin); S.spin = spin;
      const plat = new THREE.Group(); plat.position.copy(S.c); plat.visible = false; plat.scale.setScalar(0.001); grp.add(plat); S.plat = plat;
      const stone = new THREE.MeshStandardMaterial({ color: 0x2c2440, roughness: 0.5, metalness: 0.35, emissive: 0x160c2c, emissiveIntensity: 1, map: tex().ashlar ? tex().ashlar.map : null });
      const dark = new THREE.MeshStandardMaterial({ color: 0x120c1c, roughness: 0.8, metalness: 0.2, emissive: 0x0a0414, emissiveIntensity: 1 });
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR * 0.93, 2.4, 72), stone); slab.position.y = -1.2; slab.receiveShadow = true; plat.add(slab);
      const under = new THREE.Mesh(new THREE.ConeGeometry(PR * 0.9, 28, 14), dark); under.rotation.x = Math.PI; under.position.y = -16.4; plat.add(under);
      for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2 + 0.3, r = U.rand(4, PR * 0.75); const m = new THREE.Mesh(PG().cone, glowM(VIO, 1.8)); m.scale.set(0.55, U.rand(3, 7), 0.55); m.rotation.x = Math.PI; m.position.set(Math.cos(an) * r, U.rand(-14, -5), Math.sin(an) * r); plat.add(m); }
      const inlay = new THREE.Mesh(new THREE.CircleGeometry(PR - 0.6, 72), addM(0xb070ff, 0.3, sigilTex())); inlay.rotation.x = -Math.PI / 2; inlay.position.y = 0.03; plat.add(inlay); S.inlay = inlay;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(PR, 0.16, 6, 96), glowM(0xc890ff, 2.2)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; plat.add(rim);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(PR * 0.93, 0.1, 6, 96), glowM(VIO, 1.6)); rim2.rotation.x = Math.PI / 2; rim2.position.y = -2.4; plat.add(rim2);
      for (let i = 0; i < 28; i++) { const an = Math.random() * 6.28, r = U.rand(PR + 5, PR + 17); const m = new THREE.Mesh(U.pick([PG().dode, PG().oct3]), dark); m.scale.setScalar(U.rand(0.5, 2.4)); m.position.set(Math.cos(an) * r, U.rand(-9, 3), Math.sin(an) * r); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); spin.add(m); }
      this.orbA = -Math.PI / 2; // starts on the far side, where it already stands
    }
    // the platform turns solid (a stack of strips inside the circle), the lights come on, a fall now comes back up here
    solidSky() {
      const w = this.world, S = this.stg, st = 1.5;
      for (let z = -PR; z < PR; z += st) { const zf = Math.max(Math.abs(z), Math.abs(z + st)), hw = Math.sqrt(Math.max(0, PR * PR - zf * zf)); if (hw < 0.6) continue; w.addCollider(S.c.x - hw, Y2 - 2.4, S.c.z + z, S.c.x + hw, Y2, S.c.z + z + st, { surf: 'stone' }); }
      w.killY = Y2 - 30; TR.stage = S;
      for (const [x, z] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) w.lightSources.push({ pos: V(S.c.x + x, Y2 + 6, S.c.z + z), color: '#c0a8ff', intensity: x || z ? 6 : 10, range: 18, flame: 0, emit: false, ph: 0, prio: 4, steady: true });
    }
    orbitPos(an) { const S = this.stg; return V(S.c.x + Math.cos(an) * ORB, Y2 - 13 + Math.sin(this.t * 0.6) * 1.5, S.c.z + Math.sin(an) * ORB); }
    // up there it circles the platform for the rest of the fight, facing it
    orbit(dt) {
      if (this.state === 'fight') this.orbA += dt * 0.11;
      const to = this.orbitPos(this.orbA); this.home.copy(to); this.pos.copy(to); this.root.position.copy(to);
      this.yawB = Math.atan2(this.stg.c.x - to.x, this.stg.c.z - to.z);
      for (const h of this.hands) h.rest = this.home.clone().add(this.rotL(h.sx * 22, 14, 10));
      this.stg.inlay.rotation.z += dt * 0.04;
    }
    rotL(x, y, z) { const c = Math.cos(this.yawB), s = Math.sin(this.yawB); return V(x * c + z * s, y, -x * s + z * c); } // a point in the body's own frame (it only ever turns about y)
    floorY() { return this.stage2 ? Y2 : 0; }
    clampFloor(p) { return this.stage2 ? this.clampStage(p, 2) : clampTiles(p).setY(0); }
    clampStage(p, m) { const S = this.stg, dx = p.x - S.c.x, dz = p.z - S.c.z, d = Math.hypot(dx, dz), lim = S.R - (m ?? 2); if (d > lim) { p.x = S.c.x + dx / d * lim; p.z = S.c.z + dz / d * lim; } p.y = Y2; return p; }
    stagePt(r0, r1) { const S = this.stg, an = Math.random() * 6.28, r = U.rand(r0, r1); return V(S.c.x + Math.cos(an) * r, Y2, S.c.z + Math.sin(an) * r); }
    // ---------------------------------------------------------------- the Avatar's attacks (the sky stage)
    // star ring: shards gather from its hands into a ring round the platform and close in, turning; slip out through a gap
    a_starring(a, dt) {
      const S = this.stg, P = Pl(), K = this.phase >= 4 ? 16 : 13, W = 1.1, SPD = 4.4, H = 1.15;
      if (!a.sh) {
        a.r = PR + 4; a.ang = Math.random() * 6.28; a.spin = (Math.random() < 0.5 ? 1 : -1) * 0.5;
        a.g = new THREE.Group(); G.scene.add(a.g);
        const core = glowM(0xd8b8ff, 3);
        a.sh = []; for (let i = 0; i < K; i++) { const sh = new THREE.Group(); mesh(sh, PG().oct3, core, 0.5, 1.1, 0.5).castShadow = false; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: VIO, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(2.6, 3.6, 1); sh.add(sp); a.g.add(sh); a.sh.push(sh); }
        a.ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), addM(VIO, 0)); a.ring.rotation.x = -Math.PI / 2; a.ring.position.set(S.c.x, Y2 + 0.06, S.c.z); a.g.add(a.ring);
        a.from = this.hands.map((h) => h.pos.clone());
        if (G.sfx.starRing) G.sfx.starRing(); G.ui.toastSmall('⚠ 星環 — 迫る星の輪の隙間を抜けて外へ');
      }
      for (const h of this.hands) { h.busy = true; this.moveHand(h, this.home.clone().add(this.rotL(h.sx * 24, 26, 16)), dt, 3); this.aimHand(h, dt, -0.5, Math.PI, 0.1); }
      const k = Math.min(1, a.t / W);
      if (k >= 1) { a.r -= SPD * dt * this.atkRate(); a.ang += a.spin * dt; }
      a.ring.scale.setScalar(Math.max(0.1, a.r)); a.ring.material.opacity = 0.2 + 0.4 * k;
      for (let i = 0; i < K && !a.done; i++) {
        const an = a.ang + i / K * Math.PI * 2, tgt = V(S.c.x + Math.cos(an) * a.r, Y2 + H, S.c.z + Math.sin(an) * a.r), sh = a.sh[i];
        if (k < 1) sh.position.lerpVectors(a.from[i % 2], tgt, k * k * (3 - 2 * k)); else sh.position.copy(tgt);
        sh.rotation.y += dt * 4;
        if (Math.random() < dt * 5) G.fx.add.spawn(sh.position.x, sh.position.y, sh.position.z, 0, 0.5, 0, 0.6, 0.3, 0.02, 0.8, 0.6, 1.3, 0.8, 0, 0.5);
        // each shard is an upright crystal 0.5 m round and 2.2 m tall: that is what touches you
        if (k >= 1 && !a.hit && Math.hypot(P.pos.x - tgt.x, P.pos.z - tgt.z) < 0.5 + 0.4 && P.pos.y < tgt.y + 1.1 && P.pos.y + 1.8 > tgt.y - 1.1) {
          a.hit = true; this.hit(22, 'aoe', tgt.clone()); G.fx.sparks(tgt, null, 12, 0xe0c8ff, 6);
          const kd = P.pos.clone().sub(S.c).setY(0); if (kd.lengthSq() > 0.01) P.vel.addScaledVector(kd.normalize(), 7); P.vel.y = Math.max(P.vel.y, 4);
        }
      }
      if (a.r <= 3.2 && !a.done) {
        a.done = true;
        for (const sh of a.sh) G.fx.sparks(sh.position, null, 6, 0xe0c8ff, 7);
        G.fx.flash(S.c.clone().setY(Y2 + 2), 0xd0b0ff, 70, 0.3, 20); if (G.sfx.starBurst) G.sfx.starBurst();
        dropG(a.g); a.g = null;
      }
      return a.done;
    }
    // rifts: seams of light open across the platform one after another; a curtain of light falls on each
    a_rift(a, dt) {
      const P = Pl(), n = this.phase >= 4 ? 4 : 3, GAP = 0.6, W = 1.15, HW = 1.7, LIVE = 0.45;
      if (!a.rs) { a.g = new THREE.Group(); G.scene.add(a.g); a.rs = []; for (let i = 0; i < n; i++) a.rs.push({ t0: i * GAP }); G.ui.toastSmall('⚠ 天裂 — 床に走る光の筋から離れろ'); }
      const h = this.hands[1]; h.busy = true;
      let next = null;
      for (const r of a.rs) {
        const lt = a.t - r.t0;
        if (lt < 0) continue;
        if (!r.mid) {
          const S = this.stg, th = Math.random() * Math.PI, dir = V(Math.cos(th), 0, Math.sin(th)), nrm = V(-dir.z, 0, dir.x);
          const o = r === a.rs[0] ? P.pos.clone() : this.stagePt(0, PR - 5);
          const d = U.clamp((o.x - S.c.x) * nrm.x + (o.z - S.c.z) * nrm.z, -(PR - 3), PR - 3), half = Math.sqrt(PR * PR - d * d) + 1.5;
          r.mid = V(S.c.x + nrm.x * d, Y2, S.c.z + nrm.z * d); r.nrm = nrm; r.half = half;
          const grp = new THREE.Group(); grp.position.copy(r.mid); grp.rotation.y = Math.atan2(dir.x, dir.z); a.g.add(grp); r.grp = grp;
          r.crack = new THREE.Mesh(PL, addM(0xe8d8ff, 0)); r.crack.rotation.x = -Math.PI / 2; r.crack.position.y = 0.06; r.crack.scale.set(0.15, half * 2, 1); grp.add(r.crack);
          r.edge = [-1, 1].map((sd) => { const m = new THREE.Mesh(PL, addM(VIO, 0)); m.rotation.x = -Math.PI / 2; m.position.set(sd * HW, 0.05, 0); m.scale.set(0.1, half * 2, 1); grp.add(m); return m; });
          r.cur = new THREE.Mesh(PL, addM(0xd8c0ff, 0, gradTex())); r.cur.rotation.y = Math.PI / 2; r.cur.scale.set(half * 2, 44, 1); r.cur.position.y = 22; r.cur.visible = false; grp.add(r.cur);
          if (G.sfx.riftOpen) G.sfx.riftOpen();
        }
        if (lt < W) {
          const k = lt / W;
          r.crack.scale.x = 0.15 + k * 0.6; r.crack.material.opacity = (0.35 + 0.5 * k) * (0.7 + 0.3 * Math.sin(lt * 30));
          r.edge.forEach((m) => { m.material.opacity = 0.3 + 0.6 * k; });
          if (Math.random() < dt * 25) { const q = r.grp.localToWorld(V(U.rand(-0.3, 0.3), 0.1, U.rand(-r.half, r.half))); G.fx.add.spawn(q.x, q.y, q.z, 0, U.rand(1.5, 4), 0, 0.8, 0.1, 0.02, 0.8, 0.6, 1.3, 0.9, -0.2, 0.3); }
          if (!next) next = r;
        } else if (!r.done) {
          // the curtain: exactly the seam's width (HW each side of the line), from the floor to the sky
          r.done = true; r.cur.visible = true; r.cur.material.opacity = 1; r.crack.scale.x = HW * 2; r.crack.material.opacity = 1;
          if (G.sfx.riftFall) G.sfx.riftFall(); P.addShake(0.3);
          G.fx.flash(r.mid.clone().setY(Y2 + 3), 0xd0b0ff, 90, 0.25, 30);
          for (let i = 0; i < 18; i++) { const q = r.grp.localToWorld(V(U.rand(-HW, HW), 0.2, U.rand(-r.half, r.half))); G.fx.add.spawn(q.x, q.y, q.z, U.rand(-2, 2), U.rand(4, 10), U.rand(-2, 2), 0.7, 0.3, 0.05, 1, 0.8, 1.4, 1, 6, 0.4); }
          const rel = P.pos.clone().sub(r.mid), sd = rel.x * r.nrm.x + rel.z * r.nrm.z;
          if (Math.abs(sd) < HW + 0.4 && P.pos.y < Y2 + 8) { this.hit(26, 'aoe', r.mid.clone()); P.vel.addScaledVector(r.nrm, (Math.sign(sd) || 1) * 9); P.vel.y = Math.max(P.vel.y, 5); }
        } else {
          const f = Math.max(0, 1 - (lt - W) / LIVE); r.cur.material.opacity = f; r.crack.material.opacity = f; r.edge.forEach((m) => { m.material.opacity = f * 0.8; });
        }
      }
      // the hand hangs over the next seam and comes down on it as the curtain falls
      if (next) { const lt = a.t - next.t0, hi = lt < W - 0.15; this.moveHand(h, next.mid.clone().add(V(0, hi ? 22 : 4, 0)), dt, hi ? 3 : 14); this.aimHand(h, dt, 1.0, 0, 0); }
      else this.restHand(h, dt);
      return a.t > a.rs[a.rs.length - 1].t0 + W + LIVE + 0.2;
    }
    // comet lance: a spear of light forms in its hand, a reticle marks where it lands; the strike throws out a ring you jump over
    a_lance(a, dt) {
      const P = Pl(), n = this.phase >= 4 ? 4 : 3, AIM = 1.05, FLY = 0.3, CYC = 1.7, R = 3.2;
      const h = this.hands[0]; h.busy = true;
      if (!a.g) { a.g = new THREE.Group(); G.scene.add(a.g); a.waves = []; a.i = 0; G.ui.toastSmall('⚠ 彗星の槍 — 着弾点から光の輪が広がる（ジャンプで越えられる）'); }
      const lt = a.t - a.i * CYC;
      if (a.i < n && lt >= 0) {
        if (!a.cur) {
          const L = new THREE.Group(); a.g.add(L);
          const core = new THREE.Mesh(PG().cyl8, addM(0xffffff, 1)); core.scale.set(0.22, 10, 0.22); core.rotation.x = Math.PI / 2; L.add(core);
          const glow = new THREE.Mesh(PG().cyl8, addM(VIO, 0.55)); glow.scale.set(0.6, 10.5, 0.6); glow.rotation.x = Math.PI / 2; L.add(glow);
          const tip = new THREE.Mesh(PG().cone, addM(0xf0e0ff, 1)); tip.scale.set(0.6, 2.4, 0.6); tip.rotation.x = Math.PI / 2; tip.position.z = 6; L.add(tip);
          const ret = new THREE.Group(); a.g.add(ret);
          const o1 = new THREE.Mesh(new THREE.RingGeometry(R - 0.14, R, 64), addM(0xe0c8ff, 0)); o1.rotation.x = -Math.PI / 2; ret.add(o1);
          const o2 = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), addM(0xffffff, 0)); o2.rotation.x = -Math.PI / 2; ret.add(o2);
          const cr = [0, 1].map((i) => { const m = new THREE.Mesh(PL, addM(0xe0c8ff, 0)); m.rotation.x = -Math.PI / 2; m.rotation.z = i * Math.PI / 2; m.scale.set(0.08, R * 2 + 1.6, 1); ret.add(m); return m; });
          const line = new THREE.Mesh(PG().box, addM(VIO, 0)); a.g.add(line);
          a.cur = { L, ret, o1, o2, cr, line, tgt: null };
          if (G.sfx.lanceCharge) G.sfx.lanceCharge(AIM / this.atkRate());
        }
        const c = a.cur, handP = h.pos.clone().add(V(0, 3, 0));
        if (lt < AIM) {
          this.moveHand(h, this.home.clone().add(this.rotL(-18, 30, 14)), dt, 4); this.aimHand(h, dt, -0.8, 0, 0.9);
          if (lt < AIM - 0.25 || !c.tgt) c.tgt = this.clampStage(P.pos.clone().add(P.vel.clone().setY(0).multiplyScalar(0.45)), 1.5);
          const k = lt / AIM;
          c.L.position.copy(handP); c.L.lookAt(c.tgt); c.L.scale.setScalar(0.3 + 0.7 * k);
          c.ret.position.copy(c.tgt).setY(Y2 + 0.08); c.ret.rotation.y += dt * 2;
          c.o1.material.opacity = 0.45 + 0.5 * k; c.o2.scale.setScalar(Math.max(0.2, R * (1 - k))); c.o2.material.opacity = 0.85; c.cr.forEach((m) => { m.material.opacity = 0.35 + 0.4 * k; });
          const len = handP.distanceTo(c.tgt); c.line.position.copy(handP).lerp(c.tgt, 0.5); c.line.lookAt(c.tgt); c.line.scale.set(0.06, 0.06, len); c.line.material.opacity = 0.12 + 0.3 * k;
        } else if (lt < AIM + FLY) {
          if (!c.from) { c.from = c.L.position.clone(); G.sfx.whoosh(0.5, 1.4); c.line.visible = false; }
          c.L.position.lerpVectors(c.from, c.tgt, (lt - AIM) / FLY);
          for (let i = 0; i < 3; i++) G.fx.add.spawn(c.L.position.x, c.L.position.y, c.L.position.z, U.rand(-1, 1), U.rand(-1, 1), U.rand(-1, 1), 0.4, 0.5, 0.05, 0.9, 0.7, 1.4, 1, 0, 0.5);
        } else {
          G.fx.explosion(c.tgt.clone().setY(Y2 + 0.6), 2.6, VIO, { decal: false, noSmoke: true }); G.fx.flash(c.tgt.clone().setY(Y2 + 2), 0xe0c8ff, 120, 0.3, 30);
          if (G.sfx.lanceHit) G.sfx.lanceHit(c.tgt); P.addShake(0.45);
          if (Math.hypot(P.pos.x - c.tgt.x, P.pos.z - c.tgt.z) < R + 0.4 && P.pos.y < Y2 + 4) this.hit(28, 'aoe', c.tgt.clone());
          // the ring: drawn band = tested band (0.55 m either side of its radius)
          a.waves.push({ c: c.tgt.clone(), r: 0.5, sr: G.fx.shockRing(c.tgt.clone().setY(Y2), 0xe8d0ff, 0.55, PR * 2 + 6), hit: false });
          a.g.remove(c.L); a.g.remove(c.ret); a.g.remove(c.line); a.cur = null; a.i++;
        }
      } else if (a.i >= n) this.restHand(h, dt);
      for (const wv of a.waves) {
        if (wv.dead) continue;
        wv.r += 15 * dt; wv.sr.set(wv.r, Math.max(0.2, 1 - wv.r / (PR * 2 + 6)));
        const d = Math.hypot(P.pos.x - wv.c.x, P.pos.z - wv.c.z);
        if (!wv.hit && Math.abs(d - wv.r) < 0.55 + 0.4 && P.pos.y < Y2 + 0.7) { wv.hit = true; this.hit(14, 'aoe', wv.c.clone()); P.vel.y = Math.max(P.vel.y, 4); }
        if (wv.r > PR * 2 + 4) { wv.dead = true; wv.sr.dispose(); }
      }
      return a.i >= n && a.waves.every((w) => w.dead);
    }
    // the cage of palms: both hands stand on edge at either end of a band of light round you, then clap shut down its length.
    // The band is exactly as wide as the hands are long; step out of it sideways. The hands stay where they met for a moment: strike them.
    a_clap(a, dt) {
      const P = Pl(), W = 1.5, GO = 0.42, PLANT = 1.5, D0 = 17;
      if (!a.u) {
        const th = Math.random() * Math.PI; a.u = V(Math.cos(th), 0, Math.sin(th)); a.v = V(-a.u.z, 0, a.u.x); a.hy = Math.atan2(a.v.x, a.v.z);
        a.c = this.clampStage(P.pos.clone(), 3);
        a.g = new THREE.Group(); G.scene.add(a.g);
        const band = new THREE.Group(); band.rotation.y = Math.atan2(a.u.x, a.u.z); a.g.add(band); a.band = band;
        a.fill = new THREE.Mesh(PL, addM(0xb070ff, 0)); a.fill.rotation.x = -Math.PI / 2; a.fill.scale.set(HAND_L, D0 * 2, 1); band.add(a.fill);
        a.edges = [-1, 1].map((sd) => { const m = new THREE.Mesh(PL, addM(0xf0e0ff, 0)); m.rotation.x = -Math.PI / 2; m.position.x = sd * HAND_L / 2; m.scale.set(0.12, D0 * 2, 1); band.add(m); return m; });
        G.ui.toastSmall('⚠ 掌の檻 — 光の帯の外へ（両手が閉じる）'); if (G.sfx.attackWind) G.sfx.attackWind(P.pos, true);
      }
      if (a.t < W * 0.6) a.c = this.clampStage(P.pos.clone(), 3);
      a.band.position.copy(a.c).setY(Y2 + 0.07);
      const k = Math.min(1, a.t / W);
      a.fill.material.opacity = a.clapped ? Math.max(0, a.fill.material.opacity - dt * 2) : 0.08 + 0.22 * k * (0.75 + 0.25 * Math.sin(a.t * 20));
      a.edges.forEach((m) => { m.material.opacity = a.clapped ? a.fill.material.opacity * 2 : 0.4 + 0.5 * k; });
      for (const h of this.hands) {
        h.busy = true;
        const sg = h.i ? 1 : -1, roll = sg < 0 ? Math.PI / 2 : -Math.PI / 2;
        const at = (x) => a.c.clone().addScaledVector(a.u, sg * x).addScaledVector(a.v, -HAND_C).setY(Y2 + 2.7);
        if (a.t < W) { this.moveHand(h, at(D0).add(V(0, (1 - k) * 10, 0)), dt, 6); h.yaw = a.hy; h.roll += (roll - h.roll) * Math.min(1, dt * 8); h.pitch *= 0.8; h.curl = 0.05; continue; }
        if (a.t > W + GO + PLANT) { this.unplant(h); h.busy = false; this.restHand(h, dt); continue; }
        const kk = Math.min(1, (a.t - W) / GO), x = D0 + (0.85 - D0) * kk * kk, px = h._x ?? D0; h._x = x;
        h.pos.copy(at(x)); h.yaw = a.hy; h.roll = roll; h.pitch = 0;
        // a hand 1.6 m thick sweeping its length: whoever it passes on the way in is caught (0.4 m for your own width)
        if (!a.hit) {
          const rel = P.pos.clone().sub(a.c), su = rel.dot(a.u) * sg, sv = rel.dot(a.v);
          if (Math.abs(sv) < HAND_L / 2 + 0.4 && P.pos.y < Y2 + 5.4 && su <= px + 1.2 && su >= x - 1.2) { a.hit = true; this.hit(30, 'melee', a.c.clone()); P.vel.addScaledVector(a.v, (Math.sign(sv) || 1) * 14); P.vel.y = Math.max(P.vel.y, 7); }
        }
        if (kk >= 1) h.planted = true;
      }
      if (a.t >= W + GO && !a.clapped) {
        a.clapped = true;
        const cp = a.c.clone().setY(Y2 + 2.7);
        G.fx.flash(cp, 0xe8d0ff, 160, 0.35, 40); for (let i = 0; i < 30; i++) { const d = a.v.clone().multiplyScalar(U.rand(-1, 1)).add(V(0, U.rand(0.2, 1), 0)).normalize(); G.fx.add.spawn(cp.x, cp.y, cp.z, d.x * 14, d.y * 10, d.z * 14, 0.6, 0.35, 0.05, 1, 0.8, 1.4, 1, 6, 0.5); }
        if (G.sfx.clap) G.sfx.clap(); P.addShake(0.8);
        if (!this.clapTip) { this.clapTip = true; G.ui.toastSmall('✋ 閉じた両手は、しばらくの間攻撃できる（ダメージ1.5倍）'); }
      }
      return a.t > W + GO + PLANT + 0.5;
    }
    // ---------------------------------------------------------------- death
    kill() {
      this.endLift();
      for (const h of this.hands) this.unplant(h);
      super.kill();
      TR.restoreAll(false); this._restoreQ = [];
    }
    updateDeath(dt) {
      this.deathT += dt;
      const T = this.deathT, J = this.J, P = Pl();
      TR.update(dt);
      if (T < 4.5 && Math.random() < dt * 9) { const hw = U.pick(this.main.hitW); const p = hw.w.clone().add(V(U.rand(-3, 3), U.rand(-3, 3), U.rand(0, 3))); G.fx.explosion(p, U.rand(2, 4), U.pick([VIO, PINK, 0xffffff]), { decal: false }); G.sfx.explosion(P.pos.clone().lerp(p, 0.4), 0.5); }
      if (T < 4.5) { J.coreGlow.scale.setScalar(Math.max(0.1, 4.2 * (1 - T / 4.5)) + Math.random()); P.addShake(dt * 0.8); }
      for (const h of this.hands) { h.pos.y -= dt * (2 + T * 4); h.pitch += dt * 0.3; h.curl = Math.min(1, h.curl + dt * 0.3); }
      if (T > 2) { J.body.position.y -= dt * (T - 2) * 6; J.chest.rotation.x += dt * 0.05; }
      if (T > 4.5 && !this._boom) {
        this._boom = true;
        const c = J.core.getWorldPosition(V());
        G.fx.explosion(c, 14, 0xffffff, { decal: false }); G.fx.flash(c, 0xffe0ff, 260, 1.0, 200);
        const rc = this.stg ? this.stg.c.clone().setY(Y2 + 0.2) : this.world.arenaCenter.clone().setY(0.2);
        for (let i = 0; i < 6; i++) setTimeout(() => G.fx.ring(rc, 8 + i * 7, 0xffd0f0, 1), i * 160);
        G.sfx.explosion(P.pos, 3); G.sfx.bell && G.sfx.bell(); P.addShake(1.4);
      }
      this.pose(dt); this.updateHits();
      if (T > 7.5) {
        this.dispose();
        BS.active = null;
        G.game.onBossDefeated(this);
        return true;
      }
      return false;
    }
    extraDispose() {
      this.endLift();
      for (const c of this.constructs.slice()) this.removeConstruct(c);
      for (const h of this.hands) this.unplant(h);
      if (this.act && this.act.rock) G.scene.remove(this.act.rock.m);
      if (this.act && this.act.g) dropG(this.act.g);
      if (this.act && this.act.lance) G.scene.remove(this.act.lance);
      for (const wv of (this.act && this.act.waves) || []) if (wv.sr && !wv.dead) wv.sr.dispose();
      const P = Pl(); if (P && P.liftVy != null) { P.liftVy = null; P.dragT = 0; }
    }
  }
  // keep a planned spot on the floor (never over the void around it)
  function clampTiles(p) {
    const T = TR.tiles(); if (!T.length) return p;
    const x0 = T[0].x0, z0 = T[0].z0, x1 = T[T.length - 1].x1, z1 = T[T.length - 1].z1;
    p.x = U.clamp(p.x, x0 + 2, x1 - 2); p.z = U.clamp(p.z, z0 + 2, z1 - 2);
    return p;
  }
  // the jewel and the core breathe
  function M_pulse(b) {
    const k = 0.75 + 0.25 * Math.sin(b.t * 3);
    b.M.eye.emissiveIntensity = 3.2 * k; b.M.halo.emissiveIntensity = 2.2 * (0.85 + 0.15 * Math.sin(b.t * 1.3));
    b.M.core.emissiveIntensity = 3.5 * (0.8 + 0.2 * Math.sin(b.t * 5));
  }
  const PL = new THREE.PlaneGeometry(1, 1);
  // a glowing, see-through, unlit material (the sky stage's effects)
  const addM = (col, op, map) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, map: map || null, fog: false });
  // throw away an attack's meshes (shared prototype geometries stay)
  function dropG(g) {
    const shared = new Set([PL, ...Object.values(PG())]);
    g.traverse((o) => { if (o.material) o.material.dispose(); if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose(); });
    if (g.parent) g.parent.remove(g);
  }
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; return t; };
  // the gravity seal and the platform's inlay: rings, a hexagram, a band of runes
  let _sig = null;
  const sigilTex = () => _sig || (_sig = canvasTex(512, 512, (x) => {
    x.translate(256, 256); x.strokeStyle = '#fff'; x.fillStyle = '#fff';
    for (const [r, lw] of [[250, 6], [226, 3], [196, 2], [150, 4], [60, 3], [40, 2]]) { x.lineWidth = lw; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke(); }
    x.lineWidth = 3;
    for (const off of [0, Math.PI]) { x.beginPath(); for (let i = 0; i <= 3; i++) { const an = off + i / 3 * Math.PI * 2 - Math.PI / 2; const px = Math.cos(an) * 196, py = Math.sin(an) * 196; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
    const R = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ'; x.font = 'bold 19px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let i = 0; i < 36; i++) { const an = i / 36 * Math.PI * 2; x.save(); x.rotate(an); x.fillText(R[i % R.length], 0, -238); x.restore(); }
    for (let i = 0; i < 12; i++) { const an = i / 12 * Math.PI * 2; x.beginPath(); x.moveTo(Math.cos(an) * 60, Math.sin(an) * 60); x.lineTo(Math.cos(an) * 150, Math.sin(an) * 150); x.lineWidth = 1.5; x.stroke(); }
  }));
  // a curtain fading upwards (light walls)
  let _grad = null;
  const gradTex = () => _grad || (_grad = canvasTex(4, 128, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }));
  // deep space: thousands of stars, a few violet and blue clouds
  let _stars = null;
  const starTex = () => _stars || (_stars = canvasTex(2048, 1024, (x, w, h) => {
    x.fillStyle = '#020106'; x.fillRect(0, 0, w, h);
    for (const [cx, cy, r, col] of [[400, 380, 420, 'rgba(120,50,200,0.22)'], [1300, 600, 520, 'rgba(60,70,190,0.16)'], [1750, 300, 360, 'rgba(200,60,150,0.14)'], [900, 760, 300, 'rgba(90,40,160,0.18)']]) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    for (let i = 0; i < 3200; i++) { const b = Math.random(), r = b > 0.985 ? 1.8 : b > 0.9 ? 1.1 : 0.6; x.fillStyle = `rgba(${220 + Math.random() * 35 | 0},${210 + Math.random() * 45 | 0},255,${0.35 + b * 0.65})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2); x.fill(); }
  }));
  // the gravity seal: a rune disc turning faster as it charges, a hexagram disc turning the other way, a rim, a curtain rising round it, six pillars of light
  function gravSeal(parent, c, R) {
    const g = new THREE.Group(); g.position.set(c.x, c.y + 0.07, c.z); parent.add(g);
    const disc = new THREE.Mesh(PL, addM(0xc890ff, 0, sigilTex())); disc.rotation.x = -Math.PI / 2; disc.scale.set(R * 2, R * 2, 1); g.add(disc);
    const disc2 = new THREE.Mesh(PL, addM(0xffffff, 0, sigilTex())); disc2.rotation.x = -Math.PI / 2; disc2.scale.set(R * 1.25, R * 1.25, 1); disc2.position.y = 0.02; g.add(disc2);
    const edge = new THREE.Mesh(new THREE.RingGeometry(R - 0.14, R + 0.14, 96), addM(0xe0c0ff, 0)); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.03; g.add(edge);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 64, 1, true), addM(0xb070ff, 0, gradTex())); g.add(wall);
    const pil = []; for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 1, 8, 1, true), addM(0xf0e0ff, 0)); m.position.set(Math.cos(an) * R * 0.87, 0, Math.sin(an) * R * 0.87); g.add(m); pil.push(m); }
    return {
      g,
      tick(dt, k, after) {
        if (after >= 0) { const f = Math.max(0, 1 - after / 0.6); for (const m of [disc, disc2, edge, ...pil]) m.material.opacity = f; wall.material.opacity = 0.6 * f; wall.scale.y = 4 + after * 50; wall.position.y = wall.scale.y / 2; return; }
        disc.rotation.z += dt * (0.4 + k * 1.8); disc2.rotation.z -= dt * (0.8 + k * 2.4);
        const pulse = 0.75 + 0.25 * Math.sin(G.game.time * (8 + k * 14));
        disc.material.opacity = (0.25 + 0.6 * k) * pulse; disc2.material.opacity = 0.2 + 0.5 * k; edge.material.opacity = 0.5 + 0.5 * k;
        wall.scale.y = 0.3 + k * 3.5; wall.position.y = wall.scale.y / 2; wall.material.opacity = 0.15 + 0.35 * k;
        pil.forEach((m, i) => { const hh = 0.2 + k * 9 * (0.8 + 0.2 * Math.sin(i * 1.7)); m.scale.set(1, hh, 1); m.position.y = hh / 2; m.material.opacity = 0.3 + 0.6 * k; });
      },
    };
  }

  // ---------------- registration ----------------
  // (the second half is a secret: the first entry says nothing of it, and the second stays hidden in the codex until the crown has broken once)
  G.BOSSES.push(
    { id: 'sovereign', name: '虚無の君主', title: 'CRIMSON SOVEREIGN', icon: '🌑', rarity: 'legendary', desc: '深淵の最奥、紅い月の下、奈落の向こう岸にそびえる巨人。こちらからは決して届かない場所から、床を剥がし、巨大な手で叩き潰し、薙ぎ払う。', mech: ['エクストラの最終エリアに必ず現れる。戦いが始まると入口の足場は閉ざされる', '床が定期的に崩れて奈落になる（赤く光ってから約2秒）。落ちると最大HPの約40%のダメージを受け、近くの無事な床へ戻される', '叩きつけた手はしばらく床に残り、攻撃できる（ダメージ1.5倍）。薙ぎ払いは大きく吹き飛ばす', 'しばらくダメージが入らないと、こちら側に「虚晶の造物」が現れる。砕くと君主に大ダメージ'], field: true, ending: true },
    { id: 'sovereign2', name: '虚無の化身', title: 'AVATAR OF THE VOID', icon: '🌌', rarity: 'legendary', codexOnly: true, desc: '王冠が砕けた君主の、真の姿。重力を裏返して戦う者を星々の只中へと引きずり上げ、天空の円い足場の周りを巡りながら攻め立てる。', mech: ['虚無の君主の王冠が砕けると現れる。重力が裏返り、天空の円い足場へと舞台が移る', '足場は崩れないが、縁から落ちると大ダメージを受けて足場へ戻される', '星の環・天の裂け目・彗星の槍・掌の檻で攻めてくる。胸の虚無核が弱点。閉じた両手は攻撃できる（ダメージ1.5倍）', '紫の紋章に入ると重力が反転し、高く打ち上げられてから叩きつけられる（最大HPの50%）', '虚無の渦は強く引き寄せる（走れば逃げられる）'], field: true },
  );
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));
  BS.CLS.sovereign = Sovereign; BS.CLS.sovereign2 = Sovereign; // (sovereign2: only ever built by the codex)
})();
