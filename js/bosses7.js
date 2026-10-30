'use strict';
// Small, quick guardians (v7): four duellists that dart, dodge and strike from angles instead of towering over you.
//  影縫いの剣客・朧 (oboro) / 三尾の狐火 (foxfire) / からくり刺客 (karakuri) / 迅雷の小鬼 (stormimp)
// They share one framework (Agile): circling at their own range, sidestepping when you aim and fire at them, after-images while
// they dash, a second phase at half health. Each has its own rig, poses and attacks.
(function () {
  const BS = G.bosses, U = G.U;
  const { mat, mesh, joint } = BS.h;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const PG = () => G.Props.PG;
  const Pl = () => G.player;
  const C = () => G.combat;
  const tex = () => G.Tex.tex;
  const glowM = (c, k) => mat('#000', { emissive: c, emissiveIntensity: k || 2.2 });
  const addM = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o ?? 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const sprite = (parent, c, s, o) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: c, transparent: true, opacity: o ?? 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(s); parent.add(sp); return sp; };
  // distance (horizontal) from p to the segment a-b
  const segDist = (p, a, b) => { const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1e-6; const t = U.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1); return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t)); };
  const flat = (v) => { v.y = 0; const l = Math.hypot(v.x, v.z) || 1; v.x /= l; v.z /= l; return v; };

  // a pose animator: each pose names target rotations [x, y, z] (and hip drop 'dy') for named joints; the joints ease to them
  // (fast, so the moves snap), and the locomotion cycle is added on top
  function poseTo(J, poses, name, dt, rate) {
    const tgt = poses[name] || poses.idle;
    for (const key in J.pj) {
      const j = J.pj[key], r = tgt[key] || poses.idle[key] || [0, 0, 0];
      const b = j.userData.b || (j.userData.b = [j.rotation.x, j.rotation.y, j.rotation.z]);
      for (let i = 0; i < 3; i++) b[i] = U.damp(b[i], r[i], rate || 14, dt);
      j.rotation.set(b[0], b[1], b[2]);
    }
    J.dy = U.damp(J.dy || 0, tgt.dy || 0, rate || 14, dt);
  }

  // ================================================================ the shared framework
  class Agile extends BS.Boss {
    constructor(def, level, world) {
      super(def, level, world);
      const S = (this.S = SPECS[def.id]);
      this.maxHp = Math.round(S.hp * this.hpScale); this.hp = this.maxHp;
      this.bloodColor = S.blood;
      this.J = S.build(this);
      this.main = this.part({ name: def.name, hitW: this.J.hits, blood: this.bloodColor, radius: S.radius, height: this.J.height });
      this.main.dmgMul = (info) => (S.dmgMul ? S.dmgMul(this, info) : 1);
      this.pos.set(world.arenaCenter.x, 0, world.arenaCenter.z - 8);
      this.tempo = BS.tempo ? BS.tempo() : 1;
      this.cd = 2.2; this.dir = 1; this.flipT = 1.5; this.dodgeCd = 3; this.ghosts = []; this.ghostT = 0; this.objs = [];
      this.pose = 'idle'; this.mv = 0; this.walk = 0; this.y = S.fly || 0; this.hY = 0; this.last = null; this.count = 0;
      if (S.init) S.init(this);
    }
    phaseText() { return this.S.phaseText ? this.S.phaseText(this) : ''; }
    // the attack clock: harder modes and the second phase run it faster, capped so the fastest moves stay readable
    rate() { const cap = [1.12, 1.22, 1.32, 1.42][BS.diffRank ? BS.diffRank() : 1]; return Math.min(this.tempo * (this.phase > 1 ? this.S.p2 || 1.15 : 1), cap); }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const S = this.S, P = Pl();
      if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
        this.phase = 2; this.end(1.2);
        G.ui.toast(S.p2msg, 'warn'); G.sfx.monster(this.pos, S.cry || 'screech', S.pitch || 1.2, 1.2); P.addShake(0.35);
        if (S.onPhase2) S.onPhase2(this);
      }
      this.cd -= dt * this.rate();
      if (this.graceT > 0) this.graceT -= dt;
      this.dodgeCd -= dt;
      this.tickGhosts(dt);
      if (this.act) {
        const a = this.act;
        a.t += dt * this.rate();
        G.fx.teleK = this.rate();
        let done = false;
        try { done = a.fn.call(this, a, dt); } catch (e) { console.error(e); done = true; } finally { G.fx.teleK = 1; }
        if (done && this.act === a) this.end(a.cd);
      } else {
        this.stalk(dt);
        if (this.cd <= 0 && !(this.graceT > 0)) this.choose();
      }
      this.root.position.set(this.pos.x, this.y + this.hY + (this.J.dy || 0), this.pos.z); this.root.rotation.y = this.yaw;
      S.anim(this, dt);
      if (S.tick) S.tick(this, dt);
      this.updateHits();
      this.bar();
    }
    // circling at its range; the direction flips now and then, and against a wall
    stalk(dt) {
      const P = Pl(), S = this.S;
      const dx = P.pos.x - this.pos.x, dz = P.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      this.face(P.pos, dt, 9);
      this.flipT -= dt; if (this.flipT <= 0) { this.flipT = U.rand(1.1, 2.4); if (Math.random() < 0.45) this.dir *= -1; }
      const rad = U.clamp((d - S.range) / 3, -1, 1), tan = 0.85;
      let mx = ux * rad - uz * this.dir * tan, mz = uz * rad + ux * this.dir * tan; const ml = Math.hypot(mx, mz) || 1;
      if (this.groundMove(mx / ml, mz / ml, S.speed * (this.phase > 1 ? 1.12 : 1), dt, S.radius)) this.dir *= -1;
      this.mv = 1; this.walk += dt * S.stride;
      this.pose = S.runPose || 'idle';
      // aimed at and fired upon: a quick sidestep (not while the shots come from point-blank)
      if (this.dodgeCd <= 0 && d > 4.5 && G.game.time - (P.lastShotT || -9) < 0.25) {
        const f = P.forward(), to = this.pos.clone().setY(this.y + this.J.height * 0.5).sub(G.camera.position).normalize();
        if (f.dot(to) > 0.975) this.dodge();
      }
    }
    dodge() {
      const P = Pl(), S = this.S;
      this.dodgeCd = (S.dodgeCd || 3.2) * (this.phase > 1 ? 0.75 : 1);
      const side = flat(P.pos.clone().sub(this.pos)); const sx = Math.random() < 0.5 ? 1 : -1;
      this.act = { fn: DODGE, t: 0, dx: -side.z * sx, dz: side.x * sx, cd: Math.max(this.cd, 0.25) };
      G.sfx.whoosh(0.25, 1.5);
    }
    choose() {
      const P = Pl(), S = this.S, dh = this.playerDistH();
      const list = S.attacks.filter((a) => (a.phase || 1) <= this.phase && (a.min ?? 0) <= dh && dh <= (a.max ?? 99) && (!a.when || a.when(this)));
      if (!list.length) { this.cd = 0.3; return; }
      const wt = (a) => (a.w || 1) * (a.id === this.last ? 0.3 : 1);
      let tot = 0; for (const a of list) tot += wt(a);
      let x = Math.random() * tot, pick = list[0];
      for (const a of list) { x -= wt(a); if (x <= 0) { pick = a; break; } }
      this.last = pick.id; this.count++;
      this.act = Object.assign({ t: 0 }, pick);
      this.mv = 0;
    }
    end(cd) {
      this.act = null; this.cd = cd ?? this.S.cd ?? 1.1; this.hY = 0; this.pose = 'idle';
      // whatever an attack left half-done (a dive, a sink into the shadow, a wind-up) is put right
      this.root.visible = true; this.main.invuln = false; this.winding = false; this.charging = false; this.diving = false;
      if (this.shade) this.shade.visible = false;
      if (this.S.fly) this.wantY = this.S.fly;
    }
    hit(dmg, src, pos, elem) { this.hurtPlayer(dmg, src, pos, elem); }
    // move in a straight line (walls stop it); returns the collider that stopped it, if any
    dash(dx, dz, speed, dt) { this.walk += dt * this.S.stride * 1.6; return this.groundMove(dx, dz, speed, dt, this.S.radius); }
    // a fading copy of the body where it stands
    ghost(col, life) {
      if (this.ghosts.length > 12) { const g = this.ghosts.shift(); G.scene.remove(g.o); g.m.dispose(); }
      this.root.updateMatrixWorld(true);
      const m = addM(col || this.S.ghost || 0x8090ff, 0.4);
      const o = this.root.clone();
      o.traverse((c) => { if (c.isMesh) { c.material = m; c.castShadow = false; } else if (c.isSprite || c.isPoints || c.isLight) c.visible = false; });
      G.scene.add(o); this.ghosts.push({ o, m, t: 0, life: life || 0.32 });
    }
    tickGhosts(dt) {
      for (let i = this.ghosts.length - 1; i >= 0; i--) {
        const g = this.ghosts[i]; g.t += dt; g.m.opacity = 0.4 * Math.max(0, 1 - g.t / g.life);
        if (g.t >= g.life) { G.scene.remove(g.o); g.m.dispose(); this.ghosts.splice(i, 1); }
      }
    }
    trail(dt, every, col) { this.ghostT -= dt; if (this.ghostT <= 0) { this.ghostT = every || 0.035; this.ghost(col); } }
    // a point the player will be near a moment from now, kept inside the arena
    lead(k) { const P = Pl(), w = this.world; const p = P.pos.clone().addScaledVector(P.vel, k || 0); p.x = U.clamp(p.x, 3, w.W - 3); p.z = U.clamp(p.z, 3, (w.arenaD || w.D) - 3); p.y = 0; return p; }
    // how far the floor runs from p along d before a wall (at waist height), up to max
    room(p, d, max) { const h = G.world.raycast(V(p.x, 1, p.z), V(d.x, 0, d.z), max); return h ? Math.max(0, h.t - this.S.radius - 0.3) : max; }
    kill() { super.kill(); for (const o of this.objs) if (o.parent) o.parent.remove(o); }
    updateDeath(dt) {
      // a small body does not crumble like a giant: it staggers, flickers, and bursts into its own colour
      this.deathT += dt;
      this.tickGhosts(dt);
      const S = this.S;
      if (this.deathT < 1.6) {
        this.root.rotation.z = Math.sin(this.deathT * 9) * 0.15 * (1 - this.deathT / 1.6) + this.deathT * 0.5;
        this.root.position.y = Math.max(0, this.root.position.y - dt * 2);
        if (Math.random() < dt * 14) G.fx.sparks(this.pos.clone().setY(this.root.position.y + this.J.height * 0.5), null, 4, S.ghost || 0xffffff, 5);
        if (Math.random() < dt * 5) this.ghost(S.ghost, 0.5);
      }
      if (this.deathT > 1.6 && !this.burst) {
        this.burst = true; const c = this.pos.clone().setY(this.root.position.y + this.J.height * 0.5);
        G.fx.explosion(c, 3, S.ghost || 0xffb060, { decal: false }); G.fx.ring(this.pos.clone().setY(0.2), 6, S.ghost || 0xffc080, 0.6); G.fx.flash(c, S.ghost || 0xffffff, 60, 0.4, 16);
        G.sfx.explosion(c, 1.4); G.sfx.bell(); Pl().addShake(0.5);
        this.root.visible = false;
      }
      if (this.deathT > 2.4) {
        this.dispose();
        BS.active = null;
        G.game.onBossDefeated(this);
        return true;
      }
      return false;
    }
    extraDispose() {
      for (const g of this.ghosts) { G.scene.remove(g.o); g.m.dispose(); } this.ghosts = [];
      for (const o of this.objs) if (o.parent) o.parent.remove(o); this.objs = [];
      if (this.S.dispose) this.S.dispose(this);
    }
    keep(o) { G.scene.add(o); this.objs.push(o); return o; }
  }
  // the sidestep: a burst sideways, leaving after-images
  function DODGE(a, dt) {
    const sp = 24 * Math.max(0, 1 - a.t / 0.26) + 6;
    if (this.dash(a.dx, a.dz, sp, dt)) return true;
    this.trail(dt, 0.03);
    this.pose = this.S.dodgePose || 'idle';
    return a.t > 0.26;
  }

  // a ring on the floor that widens from c: hits anyone standing (not jumping) where it passes
  function ringWave(b, a, key, c, speed, maxR, dmg, col, dt) {
    const w = a[key] || (a[key] = { r: 0.6, hit: false, sr: G.fx.shockRing(c, col, 0.7, maxR + 2) });
    if (w.r >= maxR) { if (w.sr) { w.sr.dispose(); w.sr = null; } return true; }
    w.r += speed * dt * b.rate();
    if (w.sr) w.sr.set(w.r, Math.max(0, 1 - w.r / maxR) * 0.9 + 0.1);
    const P = Pl(), d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z);
    if (!w.hit && Math.abs(d - w.r) < 0.75 && P.pos.y < 0.9) { w.hit = true; b.hit(dmg, 'aoe', c); const k = flat(P.pos.clone().sub(c)); P.vel.addScaledVector(k, 7); P.vel.y = Math.max(P.vel.y, 4); }
    if (Math.random() < 0.7) { const an = Math.random() * Math.PI * 2; G.fx.sparks(V(c.x + Math.cos(an) * w.r, 0.3, c.z + Math.sin(an) * w.r), V(0, 1, 0), 2, col, 3); }
    return false;
  }

  // ================================================================ 1) 影縫いの剣客・朧
  const OBORO_POSE = {
    idle: { torso: [0.15, 0, 0], head: [0, 0, 0], rsh: [0.5, 0, 0.25], rel: [-0.6, 0, 0], lsh: [0.2, 0, -0.2], lel: [-0.4, 0, 0], lhp: [0, 0, 0], rhp: [0, 0, 0], lkn: [0, 0, 0], rkn: [0, 0, 0] },
    run: { torso: [0.5, 0, 0], rsh: [1.1, 0, 0.5], rel: [-0.2, 0, 0], lsh: [0.6, 0, -0.3], lel: [-0.9, 0, 0] },
    iai: { dy: -0.32, torso: [0.6, -0.5, 0], head: [-0.4, 0.4, 0], rsh: [-0.2, 0.9, -0.5], rel: [-1.4, 0, 0], lsh: [-0.3, 0.6, 0.3], lel: [-1.2, 0, 0], lhp: [-0.9, 0, -0.2], rhp: [0.4, 0, 0.2], lkn: [1.3, 0, 0], rkn: [0.5, 0, 0] },
    slash: { dy: -0.18, torso: [0.7, 0.6, 0], head: [-0.5, -0.4, 0], rsh: [-1.3, 0, 1.55], rel: [0, 0, 0], lsh: [0.8, 0, -0.6], lel: [-0.4, 0, 0], lhp: [-0.6, 0, 0], rhp: [0.9, 0, 0], lkn: [0.6, 0, 0], rkn: [0.2, 0, 0] },
    sheathe: { torso: [0.1, 0, 0], rsh: [-0.4, 0.8, -0.4], rel: [-1.3, 0, 0], lsh: [-0.2, 0.5, 0.2], lel: [-1.0, 0, 0] },
    throw: { torso: [-0.2, -0.6, 0], rsh: [0.4, 0, 0.3], lsh: [-1.6, 0, -0.2], lel: [0, 0, 0] },
    spin: { dy: -0.2, torso: [0.35, 0, 0], rsh: [-1.4, 0, 1.4], rel: [0, 0, 0], lsh: [-1.2, 0, -1.3], lhp: [-0.5, 0, -0.3], rhp: [0.3, 0, 0.3], lkn: [0.8, 0, 0] },
    rise: { torso: [-0.35, 0, 0], head: [-0.4, 0, 0], rsh: [-3.0, 0, 0.2], rel: [0, 0, 0], lsh: [0.6, 0, -0.5], lhp: [-0.2, 0, 0], rhp: [0.4, 0, 0] },
    dodge: { dy: -0.25, torso: [0.6, 0, 0.3], rsh: [1.0, 0, 0.6], lsh: [0.8, 0, -0.6], lhp: [-0.6, 0, 0], rhp: [0.3, 0, 0], lkn: [0.9, 0, 0], rkn: [0.6, 0, 0] },
  };
  function buildOboro(b) {
    const r = b.root;
    const M = {
      cloth: mat('#17161d', { roughness: 0.92, map: tex().cloth.map }), dark: mat('#0a090d', { roughness: 0.7 }),
      plate: mat('#2a2830', { metalness: 0.6, roughness: 0.4 }), mask: mat('#ece6da', { roughness: 0.35 }), sash: mat('#7a121c', { roughness: 0.8 }),
      steel: mat('#d8dce6', { metalness: 1, roughness: 0.15, emissive: 0x202838, emissiveIntensity: 0.4 }), gold: mat('#b8902a', { metalness: 0.8, roughness: 0.3 }),
      eye: glowM(0xff2238, 2.6),
    };
    b.M = M;
    const hips = joint(r, 0, 1.0, 0);
    mesh(hips, PG().box, M.cloth, 0.46, 0.3, 0.3);
    mesh(hips, PG().box, M.sash, 0.5, 0.12, 0.34, 0, 0.14, 0);
    // the scabbard rides on the left hip
    const scab = joint(hips, -0.26, 0.05, 0); scab.rotation.set(0.25, 0, 0.35);
    mesh(scab, PG().box, M.dark, 0.06, 0.07, 1.05, 0, 0, -0.25); mesh(scab, PG().box, M.gold, 0.07, 0.08, 0.05, 0, 0, 0.27);
    const legs = [];
    for (const sx of [-1, 1]) {
      const hp = joint(hips, sx * 0.14, -0.08, 0);
      mesh(hp, PG().box, M.cloth, 0.22, 0.55, 0.26, 0, -0.27, 0);
      const kn = joint(hp, 0, -0.55, 0);
      mesh(kn, PG().box, M.cloth, 0.24, 0.48, 0.3, 0, -0.22, 0.02);
      mesh(kn, PG().box, M.dark, 0.13, 0.08, 0.26, 0, -0.46, 0.06);
      legs.push({ hp, kn });
    }
    const torso = joint(hips, 0, 0.16, 0);
    mesh(torso, PG().box, M.cloth, 0.5, 0.62, 0.3, 0, 0.32, 0);
    mesh(torso, PG().box, M.plate, 0.44, 0.32, 0.06, 0, 0.42, 0.16);
    for (const sx of [-1, 1]) mesh(torso, PG().box, M.plate, 0.2, 0.08, 0.28, sx * 0.3, 0.62, 0, 0, 0, sx * -0.35);
    // the long red scarf: a chain that trails behind and flutters with speed
    const scarf = []; let sp = joint(torso, 0, 0.66, -0.12);
    for (let i = 0; i < 7; i++) { const j = joint(sp, 0, 0, i ? -0.3 : 0); mesh(j, PG().box, M.sash, 0.15 - i * 0.008, 0.035, 0.32, 0, 0, -0.15); scarf.push(j); sp = j; }
    const head = joint(torso, 0, 0.72, 0.02);
    mesh(head, PG().sph, M.dark, 0.16, 0.18, 0.17, 0, 0.1, -0.01);
    mesh(head, PG().box, M.mask, 0.22, 0.25, 0.06, 0, 0.1, 0.13);
    mesh(head, PG().cone, M.mask, 0.05, 0.12, 0.05, 0, 0.27, 0.13);
    for (const sx of [-1, 1]) mesh(head, PG().box, M.eye, 0.075, 0.016, 0.012, sx * 0.055, 0.14, 0.167, 0, 0, sx * 0.3);
    mesh(head, PG().sph, M.dark, 0.07, 0.06, 0.07, 0, 0.28, -0.1);
    const arms = {};
    for (const sx of [-1, 1]) {
      const sh = joint(torso, sx * 0.31, 0.58, 0);
      mesh(sh, PG().box, M.cloth, 0.13, 0.42, 0.13, 0, -0.2, 0);
      mesh(sh, PG().sph, M.plate, 0.12, 0.08, 0.12, 0, 0.02, 0);
      const el = joint(sh, 0, -0.42, 0);
      mesh(el, PG().box, M.dark, 0.11, 0.38, 0.11, 0, -0.18, 0);
      const hand = joint(el, 0, -0.4, 0);
      mesh(hand, PG().box, M.dark, 0.1, 0.1, 0.1);
      arms[sx > 0 ? 'r' : 'l'] = { sh, el, hand };
    }
    // the katana, edge out
    const R = arms.r.hand;
    mesh(R, PG().cyl8, M.sash, 0.026, 0.3, 0.026, 0, 0, 0.08, Math.PI / 2);
    mesh(R, PG().cyl, M.gold, 0.075, 0.016, 0.075, 0, 0, 0.24, Math.PI / 2);
    mesh(R, PG().box, M.steel, 0.018, 0.05, 1.1, 0, 0.005, 0.8);
    mesh(R, PG().box, M.steel, 0.012, 0.03, 0.12, 0, 0.012, 1.38, -0.2);
    const tip = joint(R, 0, 0, 1.4);
    const J = { hips, torso, head, arms, legs, scarf, tip, hipY: 1.0, height: 2.1 };
    J.pj = { torso, head, rsh: arms.r.sh, rel: arms.r.el, lsh: arms.l.sh, lel: arms.l.el, lhp: legs[0].hp, rhp: legs[1].hp, lkn: legs[0].kn, rkn: legs[1].kn };
    J.hits = [{ n: torso, r: 0.36, part: 'body', o: V(0, 0.34, 0) }, { n: head, r: 0.2, part: 'head', o: V(0, 0.1, 0.03) }, { n: hips, r: 0.28, part: 'body' }, { n: legs[0].hp, r: 0.17, part: 'body', o: V(0, -0.45, 0) }, { n: legs[1].hp, r: 0.17, part: 'body', o: V(0, -0.45, 0) }];
    // the shadow it travels in (shadowstep) and the crescent wave
    b.shade = new THREE.Mesh(new THREE.CircleGeometry(1.3, 28), new THREE.MeshBasicMaterial({ color: 0x050008, transparent: true, opacity: 0.75, depthWrite: false }));
    b.shade.rotation.x = -Math.PI / 2; b.shade.visible = false;
    return J;
  }
  function animOboro(b, dt) {
    const J = b.J;
    poseTo(J, OBORO_POSE, b.pose, dt, b.pose === 'slash' || b.pose === 'rise' ? 30 : 14);
    const mv = b.act ? 0 : Math.min(1, b.mv), w = b.walk;
    if (mv > 0) {
      J.legs.forEach((L, i) => { const ph = w + i * Math.PI; L.hp.rotation.x += Math.sin(ph) * 0.9 * mv; L.kn.rotation.x += Math.max(0, -Math.sin(ph)) * 1.1 * mv; });
      J.hips.position.y = J.hipY - 0.06 + Math.abs(Math.sin(w)) * 0.08 * mv;
    } else J.hips.position.y = J.hipY;
    // the scarf streams out behind with speed and waves in the wind
    const sp = b.act ? 1 : mv;
    J.scarf.forEach((j, i) => { j.rotation.x = -0.35 + (1 - sp) * 0.25 * (i ? 1 : 3) + Math.sin(b.t * 7 - i * 0.9) * (0.12 + 0.1 * sp); j.rotation.y = Math.sin(b.t * 4.3 - i * 0.7) * 0.18 * sp; });
    // the mask's eyes burn brighter in the second phase
    b.M.eye.emissiveIntensity = (b.phase > 1 ? 4.2 : 2.6) + Math.sin(b.t * 9) * 0.6;
  }
  // 居合の連閃: a lane from it through you, then a dash along it faster than the eye; two or three in a row
  function oboroIai(a, dt) {
    const P = Pl();
    if (!a.st) { a.st = 'aim'; a.t0 = a.t; a.k = 0; a.n = this.phase > 1 ? 3 : 2; }
    const lt = a.t - a.t0;
    if (a.st === 'aim') {
      const wind = a.k === 0 ? 0.85 : 0.55;
      this.pose = 'iai';
      if (!a.lane) {
        a.from = this.pos.clone(); a.dir = flat(this.lead(0.25).sub(this.pos));
        const want = this.playerDistH() + 7;
        a.len = Math.max(4, Math.min(want, this.room(this.pos, a.dir, 24)));
        a.lane = G.fx.teleLine(a.from, a.from.clone().addScaledVector(a.dir, a.len), 2.4, wind, 0xff2040);
        G.sfx.mech('boltBack', 0, 0.5); G.sfx.attackWind && G.sfx.attackWind(this.pos, false);
      }
      this.yaw += U.wrapAngle(Math.atan2(a.dir.x, a.dir.z) - this.yaw) * Math.min(1, dt * 18);
      if (lt >= wind) { a.st = 'dash'; a.t0 = a.t; a.hit = false; a.go = 0; a.prev = this.pos.clone(); G.sfx.whoosh(0.35, 1.6); G.sfx.swing(true, 'blade'); }
      return false;
    }
    if (a.st === 'dash') {
      this.pose = 'slash';
      const step = Math.min(46 * dt * this.rate(), a.len - a.go);
      const blocked = this.dash(a.dir.x, a.dir.z, step / Math.max(dt, 1e-4), dt);
      a.go += step;
      this.trail(dt, 0.02, 0xc0c8ff);
      if (!a.hit && segDist(P.pos, a.prev, this.pos) < 1.35 && P.pos.y < 2.6) {
        a.hit = true; this.hit(22, 'melee', this.pos.clone());
        const side = V(-a.dir.z, 0, a.dir.x); if (side.dot(P.pos.clone().sub(this.pos)) < 0) side.negate();
        P.vel.addScaledVector(side, 9); P.vel.y = Math.max(P.vel.y, 4);
        G.fx.blood(P.chestPos(), a.dir.clone(), 0x8a0a0a, 6);
      }
      a.prev.copy(this.pos);
      if (a.go >= a.len - 0.01 || blocked) {
        G.fx.endTeleLine(a.lane); a.lane = null;
        const y = 1.25; G.fx.beam(a.from.clone().setY(y), this.pos.clone().setY(y), 0xe8eeff, 0.06, 0.4); G.fx.beam(a.from.clone().setY(y), this.pos.clone().setY(y), 0xff2040, 0.02, 0.6);
        G.fx.sparks(this.pos.clone().setY(1), null, 10, 0xd0d8ff, 7); G.sfx.meleeHit(true, 'blade', true);
        a.k++;
        if (a.k < a.n) { a.st = 'aim'; a.t0 = a.t; } else { a.st = 'rec'; a.t0 = a.t; G.sfx.mech('magIn', 0, 0.6); }
      }
      return false;
    }
    this.pose = 'sheathe';
    return lt > 0.75;
  }
  // 影苦無: a hop back, then two fans of throwing knives
  function oboroKunai(a, dt) {
    const P = Pl();
    if (a.t < 0.35) {
      const away = flat(this.pos.clone().sub(P.pos));
      this.dash(away.x, away.z, 13, dt); this.hY = Math.sin(a.t / 0.35 * Math.PI) * 1.3; this.pose = 'dodge'; this.face(P.pos, dt, 12);
      return false;
    }
    this.hY = 0; this.pose = 'throw'; this.face(P.pos, dt, 12);
    const salvos = this.phase > 1 ? 3 : 2;
    while ((a.s || 0) < salvos && a.t >= 0.5 + (a.s || 0) * 0.32) {
      a.s = (a.s || 0) + 1;
      const from = this.J.arms.l.hand.getWorldPosition(V());
      const dir = P.chestPos().addScaledVector(P.vel, 0.2).sub(from).normalize();
      for (let i = -1; i <= 1; i++) {
        const d = dir.clone().applyAxisAngle(V(0, 1, 0), i * 0.2);
        C().spawnProjectile({ kind: 'nail', pos: from.clone(), vel: d.multiplyScalar(30), owner: 'enemy', dmg: 9 * this.dmgScale, radius: 0.18, life: 2.5, attacker: this.main });
      }
      G.sfx.swing(false, 'knife');
    }
    return a.t > 0.5 + salvos * 0.32 + 0.3;
  }
  // 影渡り: it sinks into its shadow, the shadow slides under you, and it bursts up out of it with a rising cut
  function oboroShadow(a, dt) {
    const P = Pl();
    if (a.t < 0.35) { this.pose = 'iai'; if (!a.s0) { a.s0 = true; G.fx.smoke(this.pos.clone().setY(1), 14, 1.2, 0x0a0410, 0.4, 1); G.sfx.magic(this.pos, 'dark'); } return false; }
    if (!a.sunk) {
      a.sunk = true; this.root.visible = false; this.main.invuln = true;
      if (!this.shade.parent) this.keep(this.shade);
      this.shade.visible = true; this.shade.position.set(this.pos.x, 0.05, this.pos.z);
    }
    if (a.t < 1.45) {
      // the shadow chases you across the floor
      const to = P.pos.clone().sub(this.pos); to.y = 0; const d = to.length();
      if (d > 0.3) this.dash(to.x / d, to.z / d, Math.min(15, d * 6), dt);
      this.shade.position.set(this.pos.x, 0.05, this.pos.z); this.shade.scale.setScalar(1 + Math.sin(this.t * 12) * 0.08);
      if (Math.random() < 0.5) G.fx.smoke(this.pos.clone().setY(0.2), 1, 0.6, 0x0a0410, 0.6, 0.5);
      return false;
    }
    if (!a.c) { a.c = this.pos.clone().setY(0); a.tele = G.fx.telegraph(a.c, 2.6, 0.55, 0xff2040); G.sfx.attackWind && G.sfx.attackWind(a.c, true); }
    if (a.t < 2.0) return false;
    if (!a.up) {
      a.up = true; this.root.visible = true; this.main.invuln = false; this.shade.visible = false;
      this.face(P.pos, 1, 99); this.pose = 'rise';
      G.fx.explosion(a.c.clone().setY(0.6), 2.2, 0x6020a0, { decal: false }); G.fx.ring(a.c.clone().setY(0.15), 2.8, 0xff3050, 0.4);
      G.fx.beam(a.c.clone().setY(0.2), a.c.clone().setY(4.5), 0xe0e6ff, 0.12, 0.35); G.sfx.swing(true, 'blade'); G.sfx.explosion(a.c, 0.6);
      if (Math.hypot(P.pos.x - a.c.x, P.pos.z - a.c.z) < 2.6 && P.pos.y < 3) { this.hit(26, 'aoe', a.c); P.vel.y = Math.max(P.vel.y, 10); }
    }
    this.hY = Math.max(0, Math.sin(Math.min(1, (a.t - 2.0) / 0.6) * Math.PI) * 2.2);
    return a.t > 2.7;
  }
  // 三日月: a spinning cut that sends a low crescent wave rolling out; jump over it (two in the second phase)
  function oboroCrescent(a, dt) {
    this.pose = 'spin';
    if (a.t < 0.65) { this.yaw += dt * a.t * 26; if (!a.s0) { a.s0 = true; G.sfx.attackWind && G.sfx.attackWind(this.pos, true); a.tele = G.fx.telegraph(this.pos.clone().setY(0), 2.2, 0.65, 0xff2040); } return false; }
    this.yaw += dt * 20;
    if (!a.c) { a.c = this.pos.clone().setY(0); G.sfx.whoosh(0.5, 1.2); G.sfx.swing(true, 'blade'); }
    const d1 = ringWave(this, a, 'w1', a.c, 17, 18, 18, 0xd8e0ff, dt);
    let d2 = true;
    if (this.phase > 1) { if (a.t > 1.1) { if (!a.s2) { a.s2 = true; G.sfx.whoosh(0.5, 1.2); } d2 = ringWave(this, a, 'w2', a.c, 17, 18, 18, 0xff3050, dt); } else d2 = false; }
    return d1 && d2;
  }
  // 影分身 (second phase): two shadow copies take up positions around you and all three cut through you, one after another
  function oboroClones(a, dt) {
    const P = Pl();
    if (!a.acts) {
      a.acts = [];
      const base = Math.atan2(this.pos.x - P.pos.x, this.pos.z - P.pos.z);
      G.ui.toastSmall('👥 影分身 — 三方から斬り込んでくる');
      for (let i = 0; i < 3; i++) {
        const an = base + (i - 1) * 2.1, o = i === 1 ? this.root : this.root.clone();
        const at = V(P.pos.x + Math.sin(an) * 9, 0, P.pos.z + Math.cos(an) * 9);
        at.x = U.clamp(at.x, 4, this.world.W - 4); at.z = U.clamp(at.z, 4, (this.world.arenaD || this.world.D) - 4);
        if (i !== 1) { const m = addM(0x6a40c0, 0.55); o.traverse((c) => { if (c.isMesh) c.material = m; }); this.keep(o); o.position.copy(at); o.userData.m = m; }
        G.fx.smoke(at.clone().setY(1), 10, 1, 0x0a0410, 0.5, 0.8);
        a.acts.push({ o, pos: at, start: 0.75 + i * 0.4, st: 'wait', self: i === 1 });
      }
      this.pos.copy(a.acts[1].pos); G.sfx.magic(this.pos, 'dark');
    }
    let all = true;
    for (const x of a.acts) {
      if (x.st === 'done') continue; all = false;
      if (x.st === 'wait') {
        const to = flat(P.pos.clone().sub(x.pos)); x.o.rotation.y = Math.atan2(to.x, to.z);
        if (x.self) { this.yaw = x.o.rotation.y; this.pose = 'iai'; }
        if (a.t >= x.start - 0.6 && !x.lane) {
          x.dir = flat(this.lead(0.15).sub(x.pos)); x.len = Math.max(4, Math.min(Math.hypot(P.pos.x - x.pos.x, P.pos.z - x.pos.z) + 6, this.room(x.pos, x.dir, 22)));
          x.from = x.pos.clone(); x.lane = G.fx.teleLine(x.from, x.from.clone().addScaledVector(x.dir, x.len), 2.2, 0.6, x.self ? 0xff2040 : 0x9050ff);
          x.o.rotation.y = Math.atan2(x.dir.x, x.dir.z); if (x.self) this.yaw = x.o.rotation.y;
        }
        if (a.t >= x.start) { x.st = 'dash'; x.go = 0; x.prev = x.pos.clone(); G.sfx.whoosh(0.3, 1.6); }
      } else {
        const step = Math.min(44 * dt * this.rate(), x.len - x.go);
        x.go += step; x.pos.addScaledVector(x.dir, step);
        if (x.self) { this.pos.copy(x.pos); this.pose = 'slash'; this.trail(dt, 0.025, 0xc0c8ff); } else { x.o.position.copy(x.pos); if (Math.random() < 0.6) G.fx.smoke(x.pos.clone().setY(1), 1, 0.6, 0x2a1050, 0.3, 0.4); }
        if (!x.hit && segDist(P.pos, x.prev, x.pos) < 1.3 && P.pos.y < 2.6) { x.hit = true; this.hit(x.self ? 22 : 16, 'melee', x.pos.clone()); P.vel.y = Math.max(P.vel.y, 3); }
        x.prev.copy(x.pos);
        if (x.go >= x.len - 0.01) {
          x.st = 'done'; G.fx.endTeleLine(x.lane);
          G.fx.beam(x.from.clone().setY(1.2), x.pos.clone().setY(1.2), x.self ? 0xe8eeff : 0xa080ff, 0.05, 0.4);
          if (!x.self) { G.fx.smoke(x.pos.clone().setY(1), 12, 1, 0x1a0830, 0.6, 0.8); if (x.o.parent) x.o.parent.remove(x.o); x.o.userData.m.dispose(); }
        }
      }
    }
    if (all) { this.pose = 'sheathe'; a.rest = (a.rest || 0) + dt; return a.rest > 0.6; }
    return false;
  }

  // ================================================================ 2) 三尾の狐火
  const FOX_POSE = {
    idle: { body: [0, 0, 0], neck: [-0.25, 0, 0], head: [0.15, 0, 0], jaw: [0.05, 0, 0] },
    crouch: { dy: -0.35, body: [0.12, 0, 0], neck: [0.2, 0, 0], head: [-0.1, 0, 0] },
    leap: { body: [-0.35, 0, 0], neck: [-0.4, 0, 0], jaw: [0.5, 0, 0] },
    howl: { dy: 0.05, body: [-0.35, 0, 0], neck: [-1.0, 0, 0], head: [-0.4, 0, 0], jaw: [0.7, 0, 0] },
    spin: { dy: -0.15, body: [0.05, 0, 0], neck: [0.1, 0, 0], jaw: [0.4, 0, 0] },
  };
  function buildFox(b) {
    const r = b.root;
    const M = {
      fur: mat('#f0e6d6', { roughness: 0.9 }), fur2: mat('#d8c8ae', { roughness: 0.92 }), dark: mat('#1c1416'),
      red: glowM(0xff3040, 1.4), eye: glowM(0xffb020, 3), fire: glowM(0x60c0ff, 2.6), tipM: mat('#ffffff', { emissive: 0x7ad0ff, emissiveIntensity: 1.6 }),
    };
    b.M = M;
    const body = joint(r, 0, 1.0, 0);
    mesh(body, PG().sph, M.fur, 0.4, 0.38, 0.85, 0, 0, -0.05);
    mesh(body, PG().sph, M.fur, 0.42, 0.42, 0.42, 0, 0.04, 0.5);
    mesh(body, PG().sph, M.fur2, 0.3, 0.2, 0.6, 0, -0.18, 0);
    // the red markings along the back
    for (let i = 0; i < 3; i++) mesh(body, PG().box, M.red, 0.04, 0.02, 0.32, (i - 1) * 0.12, 0.37 - Math.abs(i - 1) * 0.04, 0.1 - Math.abs(i - 1) * 0.05, 0, (i - 1) * 0.35, 0);
    const neck = joint(body, 0, 0.18, 0.72);
    mesh(neck, PG().sph, M.fur, 0.24, 0.3, 0.26, 0, 0.12, 0.08);
    const head = joint(neck, 0, 0.34, 0.16);
    mesh(head, PG().sph, M.fur, 0.26, 0.24, 0.27, 0, 0, 0);
    mesh(head, PG().cone, M.fur, 0.13, 0.36, 0.13, 0, -0.04, 0.3, Math.PI / 2);
    mesh(head, PG().sph, M.dark, 0.04, 0.035, 0.04, 0, -0.03, 0.48);
    const jaw = joint(head, 0, -0.1, 0.12); mesh(jaw, PG().cone, M.fur2, 0.08, 0.26, 0.06, 0, 0, 0.12, Math.PI / 2);
    for (const sx of [-1, 1]) {
      mesh(head, PG().cone, M.fur, 0.09, 0.3, 0.05, sx * 0.14, 0.27, -0.04, -0.15, 0, -sx * 0.25);
      mesh(head, PG().cone, M.dark, 0.05, 0.16, 0.03, sx * 0.14, 0.31, -0.02, -0.15, 0, -sx * 0.25);
      mesh(head, PG().box, M.eye, 0.07, 0.022, 0.02, sx * 0.11, 0.06, 0.22, 0, sx * 0.4, sx * 0.35);
      mesh(head, PG().box, M.red, 0.025, 0.1, 0.01, sx * 0.08, 0.13, 0.23, 0, 0, sx * 0.2);
    }
    const legs = [];
    for (const [lx, lz] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) {
      const hp = joint(body, lx, -0.18, lz);
      mesh(hp, PG().box, M.fur, 0.13, 0.42, 0.16, 0, -0.2, 0);
      const kn = joint(hp, 0, -0.4, 0);
      mesh(kn, PG().box, M.fur2, 0.09, 0.4, 0.1, 0, -0.18, lz > 0 ? 0.02 : -0.04);
      mesh(kn, PG().box, M.dark, 0.11, 0.06, 0.16, 0, -0.39, 0.05);
      legs.push({ hp, kn, front: lz > 0 });
    }
    // three great tails, each tipped with a cold blue flame (the weak points)
    const tails = [];
    for (let i = 0; i < 3; i++) {
      const base = joint(body, (i - 1) * 0.12, 0.15, -0.8); base.rotation.set(-0.9, (i - 1) * 0.55, 0);
      const segs = []; let p = base;
      for (let k = 0; k < 6; k++) { const j = joint(p, 0, 0, k ? -0.2 : 0); const s = 0.14 + Math.sin((k + 0.8) / 6 * Math.PI) * 0.15; mesh(j, PG().sph, k >= 4 ? M.tipM : M.fur, s, s, 0.24, 0, 0, -0.1); segs.push(j); p = j; }
      const tip = joint(p, 0, 0, -0.22);
      const fl = sprite(tip, 0x70c8ff, 0.9, 0.9);
      tails.push({ base, segs, tip, fl, ph: i * 2.1 });
    }
    const J = { body, neck, head, jaw, legs, tails, hipY: 1.0, height: 1.9 };
    J.pj = { body, neck, head, jaw };
    J.hits = [{ n: body, r: 0.5, part: 'body', o: V(0, 0, 0.35) }, { n: body, r: 0.46, part: 'body', o: V(0, 0, -0.4) }, { n: head, r: 0.26, part: 'head' }];
    for (const t of tails) J.hits.push({ n: t.tip, r: 0.32, part: 'head' });
    return J;
  }
  function animFox(b, dt) {
    const J = b.J;
    poseTo(J, FOX_POSE, b.pose, dt, 16);
    const mv = Math.min(1, b.mv), w = b.walk;
    J.body.position.y = J.hipY + Math.abs(Math.sin(w)) * 0.16 * mv;
    J.body.rotation.x += Math.sin(w * 2) * 0.12 * mv;
    const leap = b.pose === 'leap', crouch = b.pose === 'crouch';
    J.legs.forEach((L, i) => {
      // a bounding gallop: the front pair and the hind pair move together
      const ph = w + (L.front ? 0 : Math.PI) + (i % 2) * 0.35;
      L.hp.rotation.x = leap ? (L.front ? -1.1 : 0.9) : crouch ? (L.front ? 0.5 : -0.6) : Math.sin(ph) * 0.8 * mv;
      L.kn.rotation.x = leap ? (L.front ? 0.3 : 0.2) : crouch ? (L.front ? -0.6 : 1.0) : Math.max(0, Math.sin(ph + 1)) * 0.8 * mv * (L.front ? -1 : 1);
    });
    const spread = b.pose === 'spin' ? 1 : b.pose === 'howl' ? 0.6 : 0;
    const hot = b.phase > 1;
    J.tails.forEach((T, i) => {
      T.base.rotation.x = U.damp(T.base.rotation.x, -0.9 + spread * 0.8 + Math.sin(b.t * 2 + T.ph) * 0.12, 8, dt);
      T.base.rotation.y = U.damp(T.base.rotation.y, (i - 1) * (0.55 + spread * 0.7), 8, dt);
      T.segs.forEach((s, k) => { s.rotation.x = Math.sin(b.t * 3 + T.ph - k * 0.7) * 0.12 + 0.08; s.rotation.y = Math.sin(b.t * 2.4 + T.ph - k * 0.8) * (0.18 + mv * 0.1); });
      T.fl.scale.setScalar((hot ? 1.3 : 0.9) + Math.sin(b.t * 13 + i * 2) * 0.15);
      if (Math.random() < dt * (hot ? 26 : 12)) { const p = T.tip.getWorldPosition(V()); G.fx.add.spawn(p.x, p.y, p.z, U.rand(-0.3, 0.3), U.rand(0.5, 1.4), U.rand(-0.3, 0.3), 0.5, 0.16, 0.02, 0.45, 0.8, 1, 0.9, 0, 0); }
    });
  }
  // 跳躍: three (four) short pounces, each onto where you are about to be
  function foxPounce(a, dt) {
    const P = Pl(), n = this.phase > 1 ? 4 : 3;
    if (!a.st) { a.st = 'wind'; a.t0 = a.t; a.k = 0; }
    const lt = a.t - a.t0, wind = a.k === 0 ? 0.55 : 0.32, air = 0.44;
    if (a.st === 'wind') {
      this.pose = 'crouch';
      if (!a.c) {
        a.c = this.lead(0.4); a.from = this.pos.clone();
        const d = a.c.clone().sub(a.from); d.y = 0; if (d.length() > 13) a.c.copy(a.from).addScaledVector(flat(d), 13);
        a.tele = G.fx.telegraph(a.c, 2.4, wind + air, 0x60b0ff); G.sfx.monster(this.pos, 'snarl', 1.6, 0.6);
      }
      this.face(a.c, dt, 14);
      if (lt >= wind) { a.st = 'air'; a.t0 = a.t; G.sfx.whoosh(0.3, 1.2); }
      return false;
    }
    if (a.st === 'air') {
      this.pose = 'leap';
      const f = Math.min(1, lt / air);
      this.pos.lerpVectors(a.from, a.c, f); this.pos.y = 0; this.hY = Math.sin(f * Math.PI) * 3.4;
      this.trail(dt, 0.05, 0x60b0ff);
      if (f >= 1) {
        this.hY = 0;
        G.fx.ring(a.c.clone().setY(0.15), 2.4, 0x80d0ff, 0.35); G.fx.fireBurst ? G.fx.fireBurst(a.c.clone().setY(0.3), 1.8, 0x60b0ff) : G.fx.explosion(a.c.clone().setY(0.3), 1.5, 0x60b0ff, { decal: false });
        G.sfx.explosion(a.c, 0.5); P.addShake(0.25);
        if (Math.hypot(P.pos.x - a.c.x, P.pos.z - a.c.z) < 2.4 && P.pos.y < 1.4) { this.hit(20, 'aoe', a.c); const k = flat(P.pos.clone().sub(a.c)); P.vel.addScaledVector(k, 8); P.vel.y = Math.max(P.vel.y, 5); }
        if (this.phase > 1) C().zone(a.c.clone(), 1.5, 3, 'fire', 5 * this.dmgScale, { enemy: true });
        a.k++; a.c = null;
        if (a.k < n) { a.st = 'wind'; a.t0 = a.t; } else { a.st = 'rec'; a.t0 = a.t; }
      }
      return false;
    }
    this.pose = 'idle';
    return lt > 0.5;
  }
  // 狐火: wisps of blue fire gather round it, then fly at you one by one, curving after you a little
  function foxWisps(a, dt) {
    const P = Pl(), n = this.phase > 1 ? 7 : 5;
    this.pose = 'howl'; this.face(P.pos, dt, 6);
    if (!a.ws) {
      a.ws = []; G.sfx.monster(this.pos, 'wail', 1.8, 0.7); G.sfx.magic(this.pos, 'holy');
      for (let i = 0; i < n; i++) { const g = new THREE.Group(); sprite(g, 0x60c0ff, 1.1, 0.95); sprite(g, 0xffffff, 0.4, 0.9); this.keep(g); a.ws.push({ g, an: i / n * Math.PI * 2, out: false }); }
    }
    const c = this.pos.clone().setY(this.y + 1.6);
    a.ws.forEach((w, i) => {
      if (w.out) return;
      w.an += dt * 3.2; const rr = Math.min(1.8, a.t * 3);
      w.g.position.set(c.x + Math.cos(w.an) * rr, c.y + Math.sin(this.t * 4 + i) * 0.3, c.z + Math.sin(w.an) * rr);
      if (a.t > 0.9 + i * 0.2) {
        w.out = true; if (w.g.parent) w.g.parent.remove(w.g);
        const dir = P.chestPos().sub(w.g.position).normalize();
        C().spawnProjectile({ kind: 'soul', pos: w.g.position.clone(), vel: dir.multiplyScalar(15), owner: 'enemy', dmg: 12 * this.dmgScale, radius: 0.4, life: 3.2, homing: 1.1, attacker: this.main, elem: 'fire' });
        G.sfx.magic(w.g.position, 'holy');
      }
    });
    return a.t > 0.9 + n * 0.2 + 0.35;
  }
  // 尾の旋風: it spins with its tails spread and a ring of blue fire rolls out along the floor (jump it; two in the second phase)
  function foxSpin(a, dt) {
    this.pose = 'spin';
    if (a.t < 0.55) { this.yaw += dt * a.t * 30; if (!a.s0) { a.s0 = true; a.tele = G.fx.telegraph(this.pos.clone().setY(0), 2.0, 0.55, 0x60b0ff); G.sfx.monster(this.pos, 'snarl', 1.4, 0.7); } return false; }
    this.yaw += dt * 18;
    if (!a.c) { a.c = this.pos.clone().setY(0); G.sfx.whoosh(0.6, 1); G.sfx.fire && G.sfx.fire(this.pos); }
    const d1 = ringWave(this, a, 'w1', a.c, 14, 15, 16, 0x60c0ff, dt);
    let d2 = true;
    if (this.phase > 1) { if (a.t > 1.05) d2 = ringWave(this, a, 'w2', a.c, 14, 15, 16, 0xa0e0ff, dt); else d2 = false; }
    return d1 && d2;
  }
  // 狐火の環: it races a circle round you, dropping foxfire that bursts a moment later; get out of the ring or between the flames
  function foxCircle(a, dt) {
    const P = Pl();
    if (!a.c) { a.c = P.pos.clone().setY(0); a.an = Math.atan2(this.pos.x - a.c.x, this.pos.z - a.c.z); a.rr = U.clamp(this.playerDistH(), 6, 9); a.marks = []; a.dropT = 0; G.sfx.monster(this.pos, 'snarl', 1.7, 0.6); }
    const dur = 1.7;
    if (a.t < dur) {
      this.pose = 'idle'; this.mv = 1;
      a.an += dt * this.rate() * 3.7;
      const tx = a.c.x + Math.sin(a.an) * a.rr, tz = a.c.z + Math.cos(a.an) * a.rr;
      const to = V(tx - this.pos.x, 0, tz - this.pos.z), d = to.length();
      if (d > 0.05) { this.dash(to.x / d, to.z / d, Math.min(d / Math.max(dt, 1e-4), 30), dt); this.yaw = Math.atan2(to.x, to.z); }
      this.trail(dt, 0.05, 0x60b0ff);
      a.dropT -= dt * this.rate();
      if (a.dropT <= 0) { a.dropT = 0.17; const p = this.pos.clone().setY(0); a.marks.push({ c: p, t: a.t + 1.0, tele: G.fx.telegraph(p, 1.7, 1.0, 0x60b0ff) }); }
    } else this.pose = 'howl';
    for (const m of a.marks) if (!m.done && a.t >= m.t) {
      m.done = true; G.fx.explosion(m.c.clone().setY(0.4), 1.4, 0x60b0ff, { decal: false }); G.sfx.fire ? G.sfx.fire(m.c) : G.sfx.explosion(m.c, 0.3);
      if (Math.hypot(P.pos.x - m.c.x, P.pos.z - m.c.z) < 1.7 && P.pos.y < 2.5) this.hit(12, 'aoe', m.c, 'fire');
    }
    return a.t > dur && a.marks.every((m) => m.done) && a.t > dur + 1.1;
  }

  // ================================================================ 3) からくり刺客
  const DOLL_POSE = {
    idle: { torso: [0.1, 0, 0], head: [0, 0, 0], u0: [0.3, 0, -0.5], u1: [0.3, 0, 0.5], l0: [0.6, 0, -0.2], l1: [0.6, 0, 0.2], neck: [0, 0, 0] },
    rev: { dy: -0.1, torso: [0.6, 0, 0], head: [-0.5, 0, 0], u0: [2.4, 0, -0.3], u1: [2.4, 0, 0.3], l0: [1.4, 0, -0.4], l1: [1.4, 0, 0.4] },
    aim: { torso: [-0.05, 0, 0], head: [0.1, 0, 0], u0: [-0.3, 0, -1.1], u1: [-0.3, 0, 1.1], l0: [-1.55, 0, -0.08], l1: [-1.55, 0, 0.08] },
    spin: { dy: 0.05, torso: [0, 0, 0], head: [0, 0, 0], u0: [0, 0, -1.55], u1: [0, 0, 1.55], l0: [0, 0, -1.4], l1: [0, 0, 1.4] },
    crouch: { dy: -0.35, torso: [0.4, 0, 0], u0: [0.9, 0, -0.6], u1: [0.9, 0, 0.6], l0: [0.9, 0, -0.4], l1: [0.9, 0, 0.4] },
    wind: { dy: -0.25, torso: [0.75, 0, 0.15], head: [0.6, 0, 0.5], u0: [1.2, 0, -0.1], u1: [1.0, 0, 0.2], l0: [1.4, 0, 0.1], l1: [1.3, 0, -0.1] },
  };
  function buildDoll(b) {
    const r = b.root;
    const M = {
      porc: mat('#f1ece4', { roughness: 0.25, metalness: 0.05 }), lac: mat('#8a1018', { roughness: 0.3, metalness: 0.2 }), black: mat('#121012', { roughness: 0.35 }),
      brass: mat('#c49a3a', { metalness: 0.9, roughness: 0.28 }), steel: mat('#cfd4dc', { metalness: 1, roughness: 0.18 }), eye: glowM(0xff4020, 1.6),
      key: mat('#e8c050', { metalness: 0.9, roughness: 0.2, emissive: 0x6a4010, emissiveIntensity: 0.6 }),
    };
    b.M = M;
    // the single wheel it rides on
    const wheel = joint(r, 0, 0.42, 0);
    const wr = joint(wheel, 0, 0, 0);
    mesh(wr, PG().torus, M.black, 0.42, 0.42, 0.9, 0, 0, 0, 0, Math.PI / 2, 0);
    mesh(wr, PG().torus, M.brass, 0.34, 0.34, 0.5, 0, 0, 0, 0, Math.PI / 2, 0);
    for (let i = 0; i < 6; i++) mesh(wr, PG().box, M.brass, 0.03, 0.66, 0.025, 0, 0, 0, i * Math.PI / 6, 0, 0);
    mesh(wr, PG().cyl, M.lac, 0.09, 0.14, 0.09, 0, 0, 0, 0, 0, Math.PI / 2);
    for (const sx of [-1, 1]) mesh(wheel, PG().box, M.brass, 0.03, 0.6, 0.05, sx * 0.1, 0.3, 0);
    const hips = joint(r, 0, 1.08, 0);
    mesh(hips, PG().cone, M.lac, 0.4, 0.5, 0.4, 0, -0.08, 0, Math.PI);
    mesh(hips, PG().torus, M.brass, 0.38, 0.38, 0.3, 0, -0.3, 0, Math.PI / 2, 0, 0);
    const torso = joint(hips, 0, 0.1, 0);
    mesh(torso, PG().box, M.porc, 0.42, 0.46, 0.28, 0, 0.25, 0);
    mesh(torso, PG().box, M.lac, 0.44, 0.12, 0.3, 0, 0.04, 0);
    // the chest is open: gears turn behind a brass frame
    mesh(torso, PG().box, M.black, 0.26, 0.24, 0.02, 0, 0.3, 0.14);
    const gears = [];
    for (const [gx, gy, gs] of [[-0.05, 0.32, 0.09], [0.07, 0.25, 0.06], [0.06, 0.38, 0.05]]) { const g = joint(torso, gx, gy, 0.15); mesh(g, PG().cyl, M.brass, gs, 0.02, gs, 0, 0, 0, Math.PI / 2); for (let k = 0; k < 8; k++) mesh(g, PG().box, M.brass, 0.02, 0.02, 0.02, Math.cos(k * 0.785) * gs * 1.1, Math.sin(k * 0.785) * gs * 1.1, 0); gears.push(g); }
    for (const sx of [-1, 1]) mesh(torso, PG().box, M.brass, 0.02, 0.26, 0.03, sx * 0.13, 0.3, 0.15);
    // the wind-up key on its back: the weak point
    const key = joint(torso, 0, 0.3, -0.16);
    mesh(key, PG().cyl8, M.key, 0.025, 0.14, 0.025, 0, 0, -0.07, Math.PI / 2);
    for (const sx of [-1, 1]) mesh(key, PG().torus, M.key, 0.09, 0.09, 0.25, sx * 0.1, 0, -0.16, 0, Math.PI / 2, 0);
    const neck = joint(torso, 0, 0.5, 0);
    mesh(neck, PG().cyl8, M.brass, 0.045, 0.1, 0.045, 0, 0.04, 0);
    const head = joint(neck, 0, 0.1, 0);
    mesh(head, PG().sph, M.porc, 0.17, 0.2, 0.17, 0, 0.12, 0);
    mesh(head, PG().box, M.black, 0.38, 0.2, 0.32, 0, 0.24, -0.04);
    mesh(head, PG().box, M.black, 0.36, 0.06, 0.12, 0, 0.27, 0.12);
    for (const sx of [-1, 1]) { mesh(head, PG().sph, M.black, 0.035, 0.03, 0.02, sx * 0.065, 0.13, 0.155); mesh(head, PG().sph, M.eye, 0.012, 0.012, 0.012, sx * 0.065, 0.13, 0.17); mesh(head, PG().box, M.lac, 0.04, 0.025, 0.01, sx * 0.09, 0.07, 0.15); }
    mesh(head, PG().box, M.lac, 0.05, 0.02, 0.01, 0, 0.04, 0.165);
    // four arms: the upper pair carry long blades, the lower pair needle launchers
    const arms = [];
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 ? 1 : -1, up = i < 2;
      const sh = joint(torso, sx * 0.25, up ? 0.42 : 0.2, 0);
      mesh(sh, PG().sph, M.brass, 0.06, 0.06, 0.06);
      mesh(sh, PG().cyl8, M.porc, 0.04, 0.32, 0.04, 0, -0.16, 0);
      const el = joint(sh, 0, -0.32, 0);
      mesh(el, PG().sph, M.brass, 0.045, 0.045, 0.045);
      mesh(el, PG().cyl8, M.porc, 0.035, 0.28, 0.035, 0, -0.14, 0);
      const hand = joint(el, 0, -0.3, 0);
      if (up) { mesh(hand, PG().box, M.brass, 0.05, 0.05, 0.1, 0, 0, 0.03); mesh(hand, PG().box, M.steel, 0.012, 0.05, 0.85, 0, 0, 0.47); mesh(hand, PG().cone, M.steel, 0.02, 0.12, 0.03, 0, 0, 0.95, Math.PI / 2); }
      else { mesh(hand, PG().cyl8, M.black, 0.035, 0.22, 0.035, 0, -0.05, 0); mesh(hand, PG().cyl8, M.brass, 0.045, 0.04, 0.045, 0, -0.17, 0); }
      arms.push({ sh, el, hand });
    }
    const J = { wheel, wr, hips, torso, head, neck, key, gears, arms, hipY: 1.08, height: 2.0 };
    J.pj = { torso, head, neck, u0: arms[0].sh, u1: arms[1].sh, l0: arms[2].sh, l1: arms[3].sh };
    J.hits = [{ n: torso, r: 0.34, part: 'body', o: V(0, 0.27, 0) }, { n: head, r: 0.2, part: 'head', o: V(0, 0.14, 0) }, { n: hips, r: 0.32, part: 'body', o: V(0, -0.15, 0) }, { n: wheel, r: 0.42, part: 'body' }, { n: key, r: 0.2, part: 'head', o: V(0, 0, -0.14) }];
    b.spring = 3;
    return J;
  }
  function animDoll(b, dt) {
    const J = b.J;
    poseTo(J, DOLL_POSE, b.pose, dt, b.pose === 'spin' ? 10 : 22);
    // the wheel turns with ground speed
    const v = b._lp ? Math.hypot(b.pos.x - b._lp.x, b.pos.z - b._lp.z) / Math.max(dt, 1e-4) : 0; b._lp = (b._lp || V()).copy(b.pos);
    J.wr.rotation.x += v * dt / 0.42;
    // a doll's head twitches: it snaps between angles rather than turning smoothly
    if (!b._twT || b.t > b._twT) { b._twT = b.t + U.rand(0.3, 1.1); b._tw = [U.rand(-0.25, 0.25), U.rand(-0.35, 0.35)]; }
    if (b.pose !== 'wind') { J.head.rotation.z += (b._tw[0] - J.head.rotation.z) * Math.min(1, dt * 40); J.head.rotation.y += (b._tw[1] - J.head.rotation.y) * Math.min(1, dt * 40); }
    J.hips.position.y = J.hipY + Math.sin(b.t * 18) * 0.008 * Math.min(1, v / 5);
    J.gears.forEach((g, i) => { g.rotation.z += dt * (i % 2 ? -1 : 1) * (b.winding ? 18 : 4 + v * 0.5); });
    J.key.rotation.z += dt * (b.winding ? 14 : 1.2);
    b.M.key.emissiveIntensity = b.winding ? 2.2 + Math.sin(b.t * 14) * 0.8 : 0.6;
    b.M.eye.emissiveIntensity = b.phase > 1 ? 3 : 1.6;
  }
  // 疾走斬り: it revs up and rolls through you, blades out; off a wall it turns and comes again (two bounces, three later)
  function dollRoll(a, dt) {
    const P = Pl();
    if (!a.st) { a.st = 'rev'; a.t0 = a.t; a.k = 0; a.n = this.phase > 1 ? 3 : 2; }
    const lt = a.t - a.t0;
    if (a.st === 'rev') {
      const wind = a.k === 0 ? 0.75 : 0.42;
      this.pose = 'rev';
      if (!a.lane) {
        a.dir = flat(this.lead(0.2).sub(this.pos)); a.len = this.room(this.pos, a.dir, 30); a.from = this.pos.clone();
        a.lane = G.fx.teleLine(a.from, a.from.clone().addScaledVector(a.dir, a.len + this.S.radius), 2.2, wind, 0xff6020);
        G.sfx.mech('boltBack', 0, 1.4); G.sfx.chain && G.sfx.chain(this.pos);
      }
      this.yaw += U.wrapAngle(Math.atan2(a.dir.x, a.dir.z) - this.yaw) * Math.min(1, dt * 16);
      this.J.wr.rotation.x += dt * 40;
      if (Math.random() < 0.7) G.fx.sparks(this.pos.clone().setY(0.1), V(-a.dir.x, 1, -a.dir.z), 3, 0xffc060, 5);
      if (lt >= wind) { a.st = 'roll'; a.t0 = a.t; a.prev = this.pos.clone(); a.hit = false; a.go = 0; G.sfx.whoosh(0.5, 1.4); }
      return false;
    }
    if (a.st === 'roll') {
      this.pose = 'rev';
      const step = 30 * dt * this.rate();
      const blocked = this.dash(a.dir.x, a.dir.z, step / Math.max(dt, 1e-4), dt);
      a.go += step;
      this.trail(dt, 0.04, 0xff8040);
      if (Math.random() < 0.8) G.fx.sparks(this.pos.clone().setY(0.1), V(-a.dir.x, 0.6, -a.dir.z), 2, 0xffd080, 6);
      if (!a.hit && segDist(P.pos, a.prev, this.pos) < 1.3 && P.pos.y < 2.2) { a.hit = true; this.hit(18, 'melee', this.pos.clone()); P.vel.addScaledVector(a.dir, 10); P.vel.y = Math.max(P.vel.y, 4); G.sfx.meleeHit(true, 'blade', false); }
      a.prev.copy(this.pos);
      if (blocked || a.go > a.len + 1.5) {
        G.fx.endTeleLine(a.lane); a.lane = null;
        G.fx.sparks(this.pos.clone().setY(1), flat(a.dir.clone().negate()), 18, 0xffe0a0, 9); G.sfx.impact(this.pos.clone().setY(1), 'metal'); G.sfx.explosion(this.pos, 0.35); P.addShake(0.2);
        a.k++;
        if (a.k <= a.n) { a.st = 'rev'; a.t0 = a.t; } else { a.st = 'rec'; a.t0 = a.t; }
      }
      return false;
    }
    this.pose = 'idle';
    return lt > 0.45;
  }
  // 針の連射: the lower arms come up and spit fans of needles, three bursts (four later)
  function dollNeedles(a, dt) {
    const P = Pl(), n = this.phase > 1 ? 4 : 3;
    this.pose = 'aim'; this.face(P.pos, dt, 7);
    if (!a.s0) { a.s0 = true; G.sfx.mech('boltBack', 0, 1.6); }
    while ((a.s || 0) < n && a.t >= 0.55 + (a.s || 0) * 0.3) {
      a.s = (a.s || 0) + 1;
      for (const hi of [2, 3]) {
        const from = this.J.arms[hi].hand.getWorldPosition(V());
        const dir = P.chestPos().addScaledVector(P.vel, 0.15).sub(from).normalize();
        for (let i = -1; i <= 1; i++) C().spawnProjectile({ kind: 'nail', pos: from.clone(), vel: dir.clone().applyAxisAngle(V(0, 1, 0), i * 0.17 + (hi === 2 ? -0.05 : 0.05)).multiplyScalar(32), owner: 'enemy', dmg: 6 * this.dmgScale, radius: 0.15, life: 2.5, attacker: this.main });
        G.fx.flash(from, 0xffd080, 8, 0.05, 4);
      }
      G.sfx.mech('click', 0, 1.8);
      G.sfx.mech('boltFwd', 0, 1.7);
    }
    return a.t > 0.55 + n * 0.3 + 0.3;
  }
  // 刃の独楽: it spins like a top with all four arms out and drifts after you; stay out of the circle
  function dollTop(a, dt) {
    const P = Pl(), R = 2.8, dur = this.phase > 1 ? 2.6 : 2.1;
    if (a.t < 0.5) { this.pose = 'spin'; this.yaw += dt * a.t * 40; if (!a.tele) a.tele = G.fx.telegraph(this.pos.clone().setY(0), R, 0.5, 0xff6020); G.fx.teleMove(a.tele, this.pos.clone().setY(0)); if (!a.s0) { a.s0 = true; G.sfx.mech('boltBack', 0, 1.2); } return false; }
    if (a.t < 0.5 + dur) {
      this.pose = 'spin'; this.yaw += dt * 22;
      const to = P.pos.clone().sub(this.pos); to.y = 0; const d = to.length();
      if (d > 0.5) this.dash(to.x / d, to.z / d, this.phase > 1 ? 5.6 : 4.6, dt);
      if (!a.ring) { a.ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.12, R, 40), addM(0xffa040, 0.55)); a.ring.rotation.x = -Math.PI / 2; this.keep(a.ring); }
      a.ring.position.set(this.pos.x, 0.08, this.pos.z);
      if (Math.random() < 0.9) { const an = Math.random() * Math.PI * 2; G.fx.sparks(V(this.pos.x + Math.cos(an) * R * 0.8, 1.2, this.pos.z + Math.sin(an) * R * 0.8), V(Math.cos(an), 0.2, Math.sin(an)), 2, 0xffe0a0, 7); }
      a.tick = (a.tick || 0) - dt;
      if (a.tick <= 0) { a.tick = 0.3; G.sfx.swing(false, 'blade'); if (d < R && P.pos.y < 2.4) { this.hit(9, 'melee', this.pos.clone()); const k = flat(P.pos.clone().sub(this.pos)); P.vel.addScaledVector(k, 6); } }
      return false;
    }
    if (a.ring) { if (a.ring.parent) a.ring.parent.remove(a.ring); a.ring = null; }
    // dizzy for a moment afterwards: it wobbles, an opening
    this.pose = 'wind'; this.J.torso.rotation.z = Math.sin(a.t * 14) * 0.3;
    return a.t > 0.5 + dur + 0.75;
  }
  // 発条跳び: it springs high across the arena and drops three bombs along the way
  function dollLeap(a, dt) {
    const P = Pl(), air = 0.75;
    if (a.t < 0.4) { this.pose = 'crouch'; if (!a.s0) { a.s0 = true; G.sfx.mech('boltBack', 0, 0.8); } return false; }
    if (!a.to) {
      a.from = this.pos.clone(); const w = this.world;
      let best = null; for (let i = 0; i < 12; i++) { const an = Math.random() * Math.PI * 2, dd = U.rand(11, 16); const p = V(U.clamp(P.pos.x + Math.cos(an) * dd, 5, w.W - 5), 0, U.clamp(P.pos.z + Math.sin(an) * dd, 5, (w.arenaD || w.D) - 5)); if (!best || p.distanceTo(a.from) > best.distanceTo(a.from)) best = p; }
      a.to = best; a.bombs = []; G.sfx.whoosh(0.4, 1); G.sfx.mech('boltFwd', 0, 0.7);
    }
    const f = Math.min(1, (a.t - 0.4) / air);
    this.pose = 'spin'; this.yaw += dt * 9;
    this.pos.lerpVectors(a.from, a.to, f); this.pos.y = 0; this.hY = Math.sin(f * Math.PI) * 6;
    this.trail(dt, 0.06, 0xff8040);
    const nb = this.phase > 1 ? 4 : 3;
    while (a.bombs.length < nb && f >= (a.bombs.length + 0.5) / nb) {
      const near = a.bombs.length === Math.floor(nb / 2);
      const c = near ? this.lead(0.3) : this.pos.clone().setY(0).add(V(U.rand(-2, 2), 0, U.rand(-2, 2)));
      a.bombs.push({ c, t: a.t + 1.35, tele: G.fx.telegraph(c, 2.4, 1.35, 0xff6020) });
      G.sfx.mech('click', 0, 1.2);
    }
    for (const bm of a.bombs) if (!bm.done && a.t >= bm.t) {
      bm.done = true; G.fx.explosion(bm.c.clone().setY(0.5), 2, 0xffa050, { decal: true }); G.sfx.explosion(bm.c, 0.7); P.addShake(0.2);
      if (Math.hypot(P.pos.x - bm.c.x, P.pos.z - bm.c.z) < 2.4 && P.pos.y < 2.5) { this.hit(18, 'explosion', bm.c); const k = flat(P.pos.clone().sub(bm.c)); P.vel.addScaledVector(k, 8); P.vel.y = Math.max(P.vel.y, 5); }
    }
    if (f >= 1 && !a.landed) { a.landed = true; this.hY = 0; G.fx.dust(this.pos, V(0, 1, 0), 0x8a7a60, 10); G.sfx.impact(this.pos.clone().setY(0.5), 'metal'); }
    return a.landed && a.bombs.every((bm) => bm.done) && a.t > 0.4 + air + 0.3;
  }
  // ゼンマイ巻き: after a few attacks it runs down and has to wind itself up: it slumps and the key on its back spins (an opening: ×1.8, the key is a weak point)
  function dollWind(a, dt) {
    const dur = this.phase > 1 ? 2.6 : 3.2;
    this.pose = 'wind'; this.winding = true;
    if (!a.s0) { a.s0 = true; G.ui.toastSmall('⚙️ ゼンマイが切れた — 背中の鍵を狙え！'); G.sfx.mech('magOut', 0, 0.6); }
    if (Math.random() < dt * 10) G.sfx.mech('click', 0, 1 + Math.random());
    if (a.t > dur) { this.winding = false; this.spring = 3; G.sfx.mech('boltFwd', 0, 0.9); G.fx.sparks(this.J.key.getWorldPosition(V()), null, 12, 0xffe080, 5); return true; }
    return false;
  }

  // ================================================================ 4) 迅雷の小鬼
  const IMP_POSE = {
    idle: { body: [0.2, 0, 0], head: [-0.1, 0, 0], ls: [0.2, 0, -0.6], rs: [0.2, 0, 0.6], ll: [0.4, 0, -0.1], rl: [0.4, 0, 0.1] },
    cast: { body: [-0.2, 0, 0], head: [-0.4, 0, 0], ls: [-2.6, 0, -0.5], rs: [-2.6, 0, 0.5] },
    point: { body: [0.1, 0, 0], ls: [0.3, 0, -0.5], rs: [-1.5, 0, 0.2] },
    dive: { body: [1.2, 0, 0], head: [-0.8, 0, 0], ls: [-0.4, 0, -1.2], rs: [-0.4, 0, 1.2], ll: [1.0, 0, 0], rl: [1.0, 0, 0] },
    slump: { body: [0.7, 0, 0.2], head: [0.5, 0, 0.3], ls: [0.6, 0, -0.2], rs: [0.6, 0, 0.2], ll: [-0.6, 0, 0], rl: [-0.6, 0, 0] },
    dash: { body: [0.9, 0, 0], ls: [0.6, 0, -0.9], rs: [0.6, 0, 0.9], ll: [0.9, 0, 0], rl: [0.9, 0, 0] },
  };
  function buildImp(b) {
    const r = b.root;
    const M = {
      skin: mat('#2c3456', { roughness: 0.6, map: tex().skin.map }), belly: mat('#5a6890', { roughness: 0.7 }), horn: mat('#e8d090', { metalness: 0.3, roughness: 0.4 }),
      wing: mat('#24183a', { roughness: 0.8, side: THREE.DoubleSide }), gold: mat('#d0a030', { metalness: 0.9, roughness: 0.25 }), drum: mat('#6a1a14', { roughness: 0.6 }),
      eye: glowM(0x60e8ff, 3.2), mouth: glowM(0xfff080, 2.6), bolt: glowM(0x90d8ff, 3),
    };
    b.M = M;
    const body = joint(r, 0, 0, 0);
    mesh(body, PG().sph, M.skin, 0.36, 0.4, 0.34, 0, 0, 0);
    mesh(body, PG().sph, M.belly, 0.26, 0.3, 0.12, 0, -0.02, 0.24);
    mesh(body, PG().box, M.gold, 0.4, 0.06, 0.38, 0, -0.18, 0);
    const head = joint(body, 0, 0.5, 0.04);
    mesh(head, PG().sph, M.skin, 0.33, 0.3, 0.3, 0, 0.05, 0);
    for (const sx of [-1, 1]) {
      mesh(head, PG().cone, M.horn, 0.07, 0.36, 0.07, sx * 0.17, 0.32, -0.04, -0.25, 0, -sx * 0.45);
      mesh(head, PG().sph, M.eye, 0.07, 0.05, 0.03, sx * 0.12, 0.1, 0.27, 0, 0, sx * -0.3);
      mesh(head, PG().cone, M.skin, 0.06, 0.22, 0.04, sx * 0.33, 0.08, -0.02, 0, 0, -sx * 1.3);
    }
    mesh(head, PG().box, M.mouth, 0.24, 0.05, 0.03, 0, -0.08, 0.27);
    for (let i = 0; i < 4; i++) mesh(head, PG().cone, M.horn, 0.02, 0.05, 0.02, (i - 1.5) * 0.055, -0.06, 0.29, Math.PI);
    const arms = [];
    for (const sx of [-1, 1]) { const sh = joint(body, sx * 0.3, 0.12, 0.05); mesh(sh, PG().box, M.skin, 0.09, 0.32, 0.09, 0, -0.15, 0); const cl = joint(sh, 0, -0.32, 0); for (let k = 0; k < 3; k++) mesh(cl, PG().cone, M.horn, 0.02, 0.1, 0.02, (k - 1) * 0.03, -0.05, 0.02, Math.PI); arms.push(sh); }
    const legs = [];
    for (const sx of [-1, 1]) { const hp = joint(body, sx * 0.14, -0.3, 0); mesh(hp, PG().box, M.skin, 0.1, 0.3, 0.1, 0, -0.14, 0); mesh(hp, PG().box, M.skin, 0.1, 0.06, 0.16, 0, -0.3, 0.04); legs.push(hp); }
    // bat wings on the back, beating fast
    const wings = [];
    for (const sx of [-1, 1]) {
      const wj = joint(body, sx * 0.2, 0.2, -0.22);
      mesh(wj, PG().box, M.skin, 0.62, 0.04, 0.04, sx * 0.31, 0.06, 0, 0, 0, sx * 0.25);
      for (let k = 0; k < 3; k++) mesh(wj, PG().box, M.wing, 0.24, 0.42 - k * 0.08, 0.012, sx * (0.12 + k * 0.2), -0.14 + k * 0.03, -0.01);
      wings.push({ wj, sx });
    }
    // the ring of drums behind it (it beats them to call the lightning)
    const ring = joint(body, 0, 0.3, -0.42);
    mesh(ring, PG().torus, M.gold, 0.85, 0.85, 0.5);
    const drums = [];
    for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2; const d = joint(ring, Math.cos(an) * 0.85, Math.sin(an) * 0.85, 0); mesh(d, PG().cyl, M.drum, 0.16, 0.1, 0.16, 0, 0, 0, Math.PI / 2); mesh(d, PG().cyl, M.gold, 0.17, 0.02, 0.17, 0, 0, 0.055, Math.PI / 2); mesh(d, PG().sph, M.bolt, 0.05, 0.05, 0.02, 0, 0, 0.07); drums.push(d); }
    // a tail that ends in a spark
    const tail = []; let tp = joint(body, 0, -0.2, -0.28);
    for (let i = 0; i < 5; i++) { const j = joint(tp, 0, 0, i ? -0.16 : 0); mesh(j, PG().box, M.skin, 0.06 - i * 0.008, 0.06 - i * 0.008, 0.18, 0, 0, -0.08); tail.push(j); tp = j; }
    const tipS = sprite(tp, 0x90e0ff, 0.5, 0.95);
    const glow = sprite(body, 0x60c0ff, 2.4, 0.18);
    const J = { body, head, arms, legs, wings, ring, drums, tail, tipS, glow, hipY: 0, height: 1.5 };
    J.pj = { body, head, ls: arms[0], rs: arms[1], ll: legs[0], rl: legs[1] };
    J.hits = [{ n: body, r: 0.42, part: 'body' }, { n: head, r: 0.33, part: 'head', o: V(0, 0.06, 0) }, { n: ring, r: 0.5, part: 'body' }];
    return J;
  }
  function animImp(b, dt) {
    const J = b.J;
    poseTo(J, IMP_POSE, b.pose, dt, 16);
    const flap = b.pose === 'slump' ? 3 : b.pose === 'dash' || b.pose === 'dive' ? 0 : 22;
    J.wings.forEach((w) => { w.wj.rotation.z = w.sx * (Math.sin(b.t * flap) * 0.7 + (b.pose === 'dive' ? -1.2 : 0.1)); w.wj.rotation.y = w.sx * -0.3; });
    J.ring.rotation.z += dt * (b.charging ? 9 : 1.2);
    J.tail.forEach((j, i) => { j.rotation.x = 0.25 + Math.sin(b.t * 5 - i * 0.8) * 0.25; j.rotation.y = Math.sin(b.t * 3.3 - i) * 0.3; });
    J.glow.material.opacity = (b.charging ? 0.4 : 0.16) + Math.sin(b.t * 20) * 0.04;
    b.M.bolt.emissiveIntensity = b.charging ? 6 + Math.random() * 3 : 3;
    if (Math.random() < dt * (b.charging ? 30 : 6)) { const p = J.tipS.getWorldPosition(V()); G.fx.sparks(p, null, 2, 0xb0e8ff, 3); }
    if (b.charging && Math.random() < dt * 8) { const d = J.drums[Math.floor(Math.random() * 6)].getWorldPosition(V()); G.fx.lightning(d, d.clone().add(V(U.rand(-1, 1), U.rand(0.5, 1.5), U.rand(-1, 1))), 0xa0e0ff); }
  }
  // the imp hovers: bobbing, rising and falling towards a height it wants
  function impTick(b, dt) {
    if (b.dead) return;
    const want = b.wantY ?? 3.4;
    b.y = U.damp(b.y, want + Math.sin(b.t * 2.3) * 0.35, b.diving ? 0 : 3, dt);
  }
  // 雷鼓三連: it beats its drums and three (four) bolts fall one after another where you stand
  function impBolts(a, dt) {
    const P = Pl(), n = this.phase > 1 ? 4 : 3;
    this.pose = 'cast'; this.charging = true; this.face(P.pos, dt, 4);
    if (!a.pts) { a.pts = []; G.sfx.monster(this.pos, 'screech', 1.9, 0.5); }
    while (a.pts.length < n && a.t >= 0.15 + a.pts.length * 0.38) {
      const c = this.lead(0.25);
      a.pts.push({ c, t: a.t + 0.8, tele: G.fx.telegraph(c, 2.5, 0.8, 0x70c0ff) });
      G.sfx.mech('click', 0, 0.6);
    }
    for (const p of a.pts) if (!p.done && a.t >= p.t) {
      p.done = true;
      G.fx.lightning(p.c.clone().add(V(U.rand(-2, 2), 20, U.rand(-2, 2))), p.c.clone().setY(0.1), 0xd0f0ff); G.fx.strike(p.c.clone(), 0xc8e8ff, true);
      G.fx.flash(p.c.clone().setY(1), 0xc0e0ff, 60, 0.2, 14); G.fx.ring(p.c.clone().setY(0.15), 2.5, 0xa0e0ff, 0.3); G.sfx.zap(p.c); G.sfx.thunder && G.sfx.thunder(0); P.addShake(0.3);
      if (Math.hypot(P.pos.x - p.c.x, P.pos.z - p.c.z) < 2.5 && P.pos.y < 3.5) this.hit(16, 'aoe', p.c, 'shock');
    }
    const over = a.pts.length >= n && a.pts.every((p) => p.done);
    if (over) this.charging = false;
    return over && a.t > a.pts[n - 1].t + 0.35;
  }
  // 球電: slow balls of lightning that drift after you
  function impBalls(a, dt) {
    const P = Pl(), n = this.phase > 1 ? 4 : 3;
    this.pose = 'point'; this.face(P.pos, dt, 6);
    if (!a.s0) { a.s0 = true; this.charging = true; G.sfx.magic(this.pos, 'holy'); }
    while ((a.s || 0) < n && a.t >= 0.5 + (a.s || 0) * 0.22) {
      a.s = (a.s || 0) + 1;
      const from = this.pos.clone().setY(this.y + 0.6);
      const dir = P.chestPos().sub(from).normalize().applyAxisAngle(V(0, 1, 0), ((a.s - 1) - (n - 1) / 2) * 0.45);
      C().spawnProjectile({ kind: 'orb', pos: from, vel: dir.multiplyScalar(8.5), owner: 'enemy', dmg: 14 * this.dmgScale, radius: 0.6, life: 4.5, homing: 0.9, attacker: this.main, elem: 'shock' });
      G.sfx.zap(from);
    }
    if (a.t > 0.5 + n * 0.22) this.charging = false;
    return a.t > 0.5 + n * 0.22 + 0.35;
  }
  // 急降下: it climbs, picks a spot under you, and dives into the floor with a shock ring; then it sits stunned for a moment (the time to hit it)
  function impDive(a, dt) {
    const P = Pl();
    if (a.t < 0.5) { this.pose = 'cast'; this.wantY = 8; this.face(P.pos, dt, 6); return false; }
    if (!a.c) { a.c = this.lead(0.2); a.tele = G.fx.telegraph(a.c, 3.8, 0.75, 0x70c0ff); a.from = this.pos.clone(); a.fy = this.y; G.sfx.monster(this.pos, 'screech', 2.0, 0.6); }
    if (a.t < 1.25) { this.pose = 'dive'; this.face(a.c, dt, 10); return false; }
    if (!a.down) {
      this.diving = true;
      const f = Math.min(1, (a.t - 1.25) / 0.26);
      this.pos.lerpVectors(a.from, a.c, f); this.pos.y = 0; this.y = a.fy * (1 - f) + 0.6 * f;
      this.trail(dt, 0.025, 0x90d0ff);
      if (f < 1) return false;
      a.down = true; this.diving = false; this.wantY = 0.6; this.y = 0.6;
      G.fx.explosion(a.c.clone().setY(0.4), 2.6, 0x80c8ff, { decal: false }); G.fx.ring(a.c.clone().setY(0.15), 3.8, 0xc0e8ff, 0.4); G.fx.flash(a.c.clone().setY(1), 0xa0d8ff, 70, 0.25, 16);
      for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2; G.fx.lightning(a.c.clone().setY(0.3), a.c.clone().add(V(Math.cos(an) * 4, 0.2, Math.sin(an) * 4)), 0xc0e8ff); }
      G.sfx.explosion(a.c, 1); G.sfx.zap(a.c); P.addShake(0.5);
      if (Math.hypot(P.pos.x - a.c.x, P.pos.z - a.c.z) < 3.8 && P.pos.y < 2) { this.hit(24, 'aoe', a.c, 'shock'); const k = flat(P.pos.clone().sub(a.c)); P.vel.addScaledVector(k, 10); P.vel.y = Math.max(P.vel.y, 6); }
      a.t1 = a.t;
    }
    this.pose = 'slump';
    if (Math.random() < dt * 8) G.fx.sparks(this.pos.clone().setY(1.2), null, 2, 0xfff0a0, 2);
    if (a.t > a.t1 + 1.1) { this.wantY = 3.4; return true; }
    return false;
  }
  // 稲妻走り (second phase): it zigzags low across the arena; each leg leaves a charged lane that bursts a moment later
  function impZigzag(a, dt) {
    const P = Pl(), legs = 4;
    if (!a.pts) {
      a.pts = []; a.k = 0; a.legs = []; this.wantY = 1.6; const w = this.world;
      let p = this.pos.clone().setY(0);
      for (let i = 0; i < legs; i++) {
        const side = (i % 2 ? 1 : -1), toP = flat(P.pos.clone().sub(p)), perp = V(-toP.z, 0, toP.x);
        const q = P.pos.clone().addScaledVector(perp, side * U.rand(5, 8)).addScaledVector(toP, U.rand(1, 4)); q.y = 0;
        q.x = U.clamp(q.x, 4, w.W - 4); q.z = U.clamp(q.z, 4, (w.arenaD || w.D) - 4);
        a.pts.push(q); p = q;
      }
      G.sfx.monster(this.pos, 'screech', 2.1, 0.5);
    }
    if (a.t < 0.35) { this.pose = 'cast'; this.charging = true; return false; }
    this.charging = false;
    if (a.k < legs) {
      this.pose = 'dash';
      const q = a.pts[a.k], to = q.clone().sub(this.pos); to.y = 0; const d = to.length();
      if (!a.legStart) { a.legStart = this.pos.clone().setY(0); }
      const step = Math.min(d, 34 * dt * this.rate());
      if (d > 0.05) { this.pos.addScaledVector(to, step / d); this.yaw = Math.atan2(to.x, to.z); }
      this.trail(dt, 0.025, 0x90d0ff);
      if (d - step < 0.05) {
        const from = a.legStart; a.legStart = null;
        a.legs.push({ a: from, b: q.clone(), t: a.t + 0.75, tele: G.fx.teleLine(from, q.clone(), 2.0, 0.75, 0x70c0ff) });
        a.k++; G.sfx.zap(this.pos);
      }
    }
    for (const L of a.legs) if (!L.done && a.t >= L.t) {
      L.done = true; G.fx.endTeleLine(L.tele);
      G.fx.lightning(L.a.clone().setY(0.6), L.b.clone().setY(0.6), 0xd0f0ff); G.fx.beam(L.a.clone().setY(0.4), L.b.clone().setY(0.4), 0x90d8ff, 0.12, 0.3); G.sfx.zap(L.b);
      if (segDist(P.pos, L.a, L.b) < 1.0 + 0.4 && P.pos.y < 2.5) this.hit(14, 'aoe', this.pos.clone(), 'shock');
    }
    const done = a.k >= legs && a.legs.every((L) => L.done);
    if (done) this.wantY = 3.4;
    return done && a.t > a.legs[legs - 1].t + 0.3;
  }

  // ================================================================ specs
  const SPECS = {
    oboro: {
      hp: 4600, radius: 0.55, speed: 8.5, stride: 9, range: 9, cd: 0.95, p2: 1.18, blood: 0x6a0a14, ghost: 0x8090ff, cry: 'screech', pitch: 1.4,
      build: buildOboro, anim: animOboro, runPose: 'run', dodgePose: 'dodge',
      attacks: [
        { id: 'iai', fn: oboroIai, w: 3, min: 3 },
        { id: 'kunai', fn: oboroKunai, w: 2, min: 5 },
        { id: 'shadow', fn: oboroShadow, w: 1.6, min: 4 },
        { id: 'crescent', fn: oboroCrescent, w: 1.5, max: 12 },
        { id: 'clones', fn: oboroClones, w: 1.8, phase: 2 },
      ],
      p2msg: '🌑 朧が影を纏った — 分身を操り始める',
      phaseText: (b) => (b.phase > 1 ? '影分身が三方から斬り込む　|　斬撃の線から横へ逃げろ' : '赤い線の上から横へ逃げろ　|　低い斬撃波はジャンプでかわせ　|　仮面（頭）が弱点'),
      dispose: (b) => { if (b.shade) { if (b.shade.parent) b.shade.parent.remove(b.shade); b.shade.geometry.dispose(); } },
    },
    foxfire: {
      hp: 4400, radius: 0.7, speed: 9.5, stride: 7, range: 10, cd: 1.0, p2: 1.2, blood: 0x4a1020, ghost: 0x60b0ff, cry: 'wail', pitch: 1.7,
      build: buildFox, anim: animFox, dodgePose: 'leap',
      attacks: [
        { id: 'pounce', fn: foxPounce, w: 3, min: 3 },
        { id: 'wisps', fn: foxWisps, w: 2, min: 5 },
        { id: 'spin', fn: foxSpin, w: 1.6, max: 11 },
        { id: 'circle', fn: foxCircle, w: 1.4, phase: 2 },
      ],
      p2msg: '🔥 三本の尾が燃え上がった — 狐火が勢いを増す',
      phaseText: () => '三本の尾の先の炎と頭が弱点　|　火の輪はジャンプでかわせ',
    },
    karakuri: {
      hp: 4800, radius: 0.6, speed: 9, stride: 6, range: 8, cd: 0.9, p2: 1.15, blood: 0x3a2a18, ghost: 0xff8040, cry: 'screech', pitch: 2.2,
      build: buildDoll, anim: animDoll, dodgePose: 'rev',
      attacks: [
        { id: 'roll', fn: dollRoll, w: 3, min: 4 },
        { id: 'needles', fn: dollNeedles, w: 2, min: 5 },
        { id: 'top', fn: dollTop, w: 1.6, max: 10 },
        { id: 'leap', fn: dollLeap, w: 1.3, max: 9 },
      ],
      init: (b) => {
        // every attack uses up a little of the spring; when it runs out, it has to stop and wind itself
        const choose0 = b.choose.bind(b);
        b.choose = () => {
          if (b.spring <= 0) { b.act = { fn: dollWind, t: 0, id: 'wind', cd: 0.5 }; b.last = 'wind'; return; }
          choose0(); if (b.act) b.spring--;
        };
      },
      dmgMul: (b) => (b.winding ? 1.8 : 1),
      p2msg: '⚙️ からくりの歯車が軋み、速く回り始めた',
      phaseText: (b) => (b.winding ? '⚙️ ゼンマイを巻いている — 総攻撃！（×1.8・背中の鍵が弱点）' : '数回攻撃するとゼンマイ切れで止まる　|　独楽の円から離れろ'),
    },
    stormimp: {
      hp: 4200, radius: 0.5, speed: 8, stride: 5, range: 11, cd: 1.05, p2: 1.18, blood: 0x1a2a50, ghost: 0x90d0ff, cry: 'screech', pitch: 2.0, fly: 3.4,
      build: buildImp, anim: animImp, tick: impTick, dodgePose: 'dash', dodgeCd: 2.6,
      attacks: [
        { id: 'bolts', fn: impBolts, w: 3 },
        { id: 'balls', fn: impBalls, w: 2, min: 5 },
        { id: 'dive', fn: impDive, w: 1.8 },
        { id: 'zigzag', fn: impZigzag, w: 1.6, phase: 2 },
      ],
      dmgMul: (b) => (b.act && b.act.id === 'dive' && b.act.down ? 1.6 : 1),
      p2msg: '⚡ 小鬼が雷鼓を打ち鳴らす — 稲妻のように駆け回る',
      phaseText: (b) => (b.act && b.act.id === 'dive' && b.act.down ? '💫 着地の隙 — 今だ！（×1.6）' : '空を飛ぶ — 頭が弱点　|　急降下の後は地面で隙ができる'),
    },
  };

  // ---------------- registration ----------------
  const DEFS = [
    ['oboro', '影縫いの剣客・朧', 'OBORO, THE SHADOW DUELIST', '🥷', '仮面の剣客。目にも止まらぬ踏み込みの居合で斬り抜け、影に潜って足元から現れる。撃たれると身を翻して避けるので、攻撃の終わり際を狙え。', ['赤い線の上を一瞬で斬り抜ける（横へ逃げろ）', '影に潜っている間は無敵 — 足元の円から出ろ', '低い斬撃波はジャンプでかわせ', 'HP50%で影分身（三方からの居合）']],
    ['foxfire', '三尾の狐火', 'SANBI, THE FOXFIRE', '🦊', '青い狐火を灯す三本の尾を持つ妖狐。飛びかかりを重ね、狐火を放ち、回転して火の輪を広げる。尾の先の炎が弱点。', ['尾の先の炎と頭が弱点', '連続の飛びかかり（着地点に円）', '火の輪はジャンプでかわせ', 'HP50%で狐火の環（周りを駆けて炎を残す）']],
    ['karakuri', 'からくり刺客', 'KARAKURI, THE CLOCKWORK ASSASSIN', '🎎', '一輪車に乗った四本腕のからくり人形。刃を立てて走り抜け、壁で跳ね返ってまた来る。数回攻撃するとゼンマイが切れて動きが止まる。', ['ゼンマイ切れで止まる（被ダメ×1.8・背中の鍵が弱点）', '疾走斬りは壁で跳ね返る', '刃の独楽の円から離れろ', '跳びながら爆弾を落とす']],
    ['stormimp', '迅雷の小鬼', 'JINRAI, THE STORM IMP', '👺', '雷鼓を背負って宙を飛び回る小鬼。雷を落とし、球電を放ち、地面へ急降下する。宙にいる間は狙いにくいが、急降下の後は地面で動けなくなる。', ['空を飛ぶ — 頭が弱点', '雷は円の外へ（三連・四連）', '急降下の後に隙（被ダメ×1.6）', 'HP50%で稲妻走り（走った跡が弾ける）']],
  ];
  for (const [id, name, title, icon, desc, mech] of DEFS) if (!G.BOSS_BY_ID[id]) G.BOSSES.push({ id, name, title, icon, desc, mech, field: true, small: true });
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));
  for (const id of Object.keys(SPECS)) BS.CLS[id] = Agile;
  BS.SMALL = Object.keys(SPECS);
  BS.Agile = Agile;
})();
