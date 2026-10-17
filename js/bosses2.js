'use strict';
// v2.0 bosses: Twin Knights (revive each other), Abyssal Heart (pylons + exposed phases), Shadow Hunter (a dark mirror of the player).
(function () {
  const BS = G.bosses, U = G.U;
  const { mat, mesh, joint, V } = BS.h;
  const Boss = BS.Boss;
  let P, C, PG;
  const env = () => { P = G.player; C = G.combat; PG = G.Props.PG; };
  const distH = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // point-to-segment distance on the ground plane
  function segDist(p, a, b) {
    const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1;
    const t = U.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
    return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
  }
  function lineTele(a, b, w, t, col) {
    // a chain of small telegraph discs along the path
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / (w * 1.6)));
    for (let i = 0; i <= n; i++) G.fx.telegraph(a.clone().lerp(b, i / n).setY(0.02), w, t, col);
  }
  function humanoid(root, o) {
    const J = {};
    J.body = joint(root, 0, o.hip, 0);
    mesh(J.body, PG.box, o.armor, 0.9 * o.s, 0.5 * o.s, 0.6 * o.s, 0, 0, 0);
    J.torso = joint(J.body, 0, 0.25 * o.s, 0);
    mesh(J.torso, PG.box, o.armor, 1.2 * o.s, 1.1 * o.s, 0.7 * o.s, 0, 0.55 * o.s, 0);
    mesh(J.torso, PG.box, o.trim, 1.3 * o.s, 0.18 * o.s, 0.75 * o.s, 0, 1.05 * o.s, 0);
    for (const sx of [-1, 1]) mesh(J.torso, PG.sph, o.trim, 0.32 * o.s, 0.26 * o.s, 0.32 * o.s, sx * 0.72 * o.s, 1.05 * o.s, 0);
    if (o.cape) mesh(J.torso, PG.box, o.cape, 1.1 * o.s, 1.8 * o.s, 0.05 * o.s, 0, 0.1 * o.s, -0.4 * o.s, 0.12);
    J.head = joint(J.torso, 0, 1.45 * o.s, 0);
    mesh(J.head, PG.box, o.armor, 0.5 * o.s, 0.6 * o.s, 0.55 * o.s);
    mesh(J.head, PG.box, o.glow, 0.36 * o.s, 0.06 * o.s, 0.05 * o.s, 0, 0.05 * o.s, 0.28 * o.s);
    if (o.crest) mesh(J.head, PG.cone, o.trim, 0.12 * o.s, 0.6 * o.s, 0.12 * o.s, 0, 0.5 * o.s, -0.05 * o.s);
    J.arms = [];
    for (const sx of [-1, 1]) {
      const sh = joint(J.torso, sx * 0.78 * o.s, 0.95 * o.s, 0);
      mesh(sh, PG.cyl8, o.armor, 0.17 * o.s, 0.8 * o.s, 0.17 * o.s, 0, -0.4 * o.s, 0);
      const el = joint(sh, 0, -0.8 * o.s, 0);
      mesh(el, PG.cyl8, o.trim, 0.16 * o.s, 0.75 * o.s, 0.16 * o.s, 0, -0.37 * o.s, 0);
      const hand = joint(el, 0, -0.78 * o.s, 0);
      J.arms.push({ sh, el, hand });
    }
    J.legs = [];
    for (const sx of [-1, 1]) {
      const hp = joint(J.body, sx * 0.3 * o.s, -0.1 * o.s, 0);
      mesh(hp, PG.cyl8, o.armor, 0.2 * o.s, 1.0 * o.s, 0.2 * o.s, 0, -0.5 * o.s, 0);
      const kn = joint(hp, 0, -1.0 * o.s, 0);
      mesh(kn, PG.cyl8, o.trim, 0.18 * o.s, 1.0 * o.s, 0.18 * o.s, 0, -0.5 * o.s, 0);
      mesh(kn, PG.box, o.armor, 0.3 * o.s, 0.16 * o.s, 0.45 * o.s, 0, -1.0 * o.s, 0.08 * o.s);
      J.legs.push({ hp, kn });
    }
    return J;
  }
  const damp = (o, k, v, r, dt) => { o[k] = U.damp(o[k], v, r, dt); };

  // ======================================================================
  // 6) TWIN KNIGHTS — light & shadow; each revives the other unless both fall together, and they shield each other when close
  class Twins extends Boss {
    constructor(def, level, world) {
      env(); super(def, level, world);
      const each = Math.round(2400 * this.hpScale);
      const c = world.arenaCenter;
      const mk = (light) => {
        const g = new THREE.Group(); this.root.add(g);
        const armor = light ? mat('#d8c890', { metalness: 0.85, roughness: 0.25 }) : mat('#22202a', { metalness: 0.7, roughness: 0.3 });
        const trim = light ? mat('#fff0c0', { metalness: 1, roughness: 0.2, emissive: 0x403010 }) : mat('#5a3a8a', { metalness: 0.8, roughness: 0.3, emissive: 0x200a40 });
        const glow = mat('#000', { emissive: light ? 0xffe080 : 0xa050ff, emissiveIntensity: 3 });
        const cape = mat(light ? '#e8e0d0' : '#14101a', { side: THREE.DoubleSide });
        const J = humanoid(g, { s: 1.15, hip: 2.3, armor, trim, glow, cape, crest: light });
        if (light) { const l = mesh(J.arms[1].hand, PG.cone, trim, 0.16, 3.4, 0.16, 0, 0, 1.4, Math.PI / 2); l.userData.lance = true; mesh(J.arms[0].hand, PG.box, armor, 0.1, 1.3, 0.9, 0, 0, 0.2); }
        else { for (const a of J.arms) mesh(a.hand, PG.box, trim, 0.06, 0.08, 1.4, 0, 0, 0.7); }
        const k = { light, g, J, pos: c.clone().add(V(light ? -6 : 6, 0, -4)), yaw: Math.PI, hp: each, maxHp: each, down: false, reviveT: 0, act: null, cd: U.rand(1.5, 3), walk: 0, name: light ? '光の騎士ソル' : '影の騎士ウンブラ', glowM: glow };
        const part = this.part({ name: k.name, shared: false, hitW: [{ n: J.torso, r: 0.95, part: 'body', o: V(0, 0.55, 0) }, { n: J.body, r: 0.8, part: 'body' }, { n: J.head, r: 0.5, part: 'head' }], radius: 1, height: 3.6, showBar: true, blood: light ? 0xffe0a0 : 0x6020a0 });
        Object.defineProperty(part, 'hp', { get: () => k.hp, set: (v) => { k.hp = v; } });
        Object.defineProperty(part, 'maxHp', { get: () => k.maxHp });
        part.die = () => { this.knightDown(k); return false; };
        part.isInvuln = () => k.down;
        part.dmgMul = () => (this.linked ? 0.4 : 1);
        part.barPos = () => part.centerRef.clone().add(V(0, 2.2, 0));
        k.part = part;
        return k;
      };
      this.K = [mk(true), mk(false)];
      this.linkBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe0ff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      G.scene.add(this.linkBeam);
      this.light = { pos: V(), color: '#e0c0ff', intensity: 10, range: 12, flame: 0, emit: false, ph: 0, prio: 5 };
      world.lightSources.push(this.light);
      this.comboCd = 14;
    }
    // two health bars side by side (light on the left, shadow on the right)
    bar() {
      G.ui.bossBar({ lv: this.level, name: this.def.name, title: this.def.title, hp: this.hp, max: this.maxHp, phase: this.phaseText(),
        split: this.K.map((k) => ({ name: k.name, hp: Math.max(0, k.hp), max: k.maxHp, col: k.light ? 'light' : 'shadow', down: k.down ? k.reviveT : 0, enraged: !!k.enraged && !k.down, linked: !!this.linked })) });
    }
    get hp() { return this.K ? this.K.reduce((s, k) => s + Math.max(0, k.hp), 0) : 0; }
    set hp(v) { /* derived */ }
    get maxHp() { return this.K ? this.K.reduce((s, k) => s + k.maxHp, 0) : 1; }
    set maxHp(v) { /* derived */ }
    phaseText() {
      const d = this.K.find((k) => k.down);
      if (d) return `⚠ ${d.name}が倒れた — 復活まで ${d.reviveT.toFixed(1)}秒！ 相方も倒せ！`;
      return this.linked ? '🔗 共鳴中：2体が近いとダメージ-60% — 引き離せ！' : '⚔ 2体同時に倒さないと互いに蘇生する';
    }
    knightDown(k) {
      if (k.down || this.dead) return;
      k.down = true; k.hp = 0; k.act = null; k.reviveT = Math.max(6, 11 - this.loop * 2);
      G.sfx.monster(k.pos, 'roar', k.light ? 0.9 : 0.6, 1.1); G.fx.explosion(k.part.centerRef.clone(), 2, k.light ? 0xffe0a0 : 0x8040ff, { decal: false });
      if (this.K.every((x) => x.down)) { this.kill(); return; }
      const o = this.K.find((x) => !x.down);
      o.enraged = true;
      G.ui.toast(`${k.name}が膝をついた！ ${k.reviveT.toFixed(0)}秒以内に${o.name}も倒せ！`, 'good');
    }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const [a, b] = this.K;
      this.linked = !a.down && !b.down && distH(a.pos, b.pos) < 7;
      for (const k of this.K) {
        if (k.down) {
          k.reviveT -= dt;
          damp(k.J.body.position, 'y', 1.2, 4, dt); damp(k.J.torso.rotation, 'x', 0.6, 4, dt);
          k.glowM.emissiveIntensity = 1 + Math.sin(this.t * 10) * 0.8;
          if (Math.random() < dt * 10) G.fx.add.spawn(k.pos.x + U.rand(-0.6, 0.6), 0.3, k.pos.z + U.rand(-0.6, 0.6), 0, 2, 0, 0.8, 0.12, 0.02, k.light ? 1 : 0.6, k.light ? 0.9 : 0.3, k.light ? 0.5 : 1, 1, 0, 0);
          if (k.reviveT <= 0) {
            k.down = false; k.hp = k.maxHp * 0.5; k.J.body.position.y = 2.3 * 1.15 / 1.15;
            const o = this.K.find((x) => x !== k); o.enraged = false;
            G.fx.ring(k.pos.clone(), 4, k.light ? 0xffe0a0 : 0x9050ff, 0.6); G.sfx.magic(k.pos, k.light ? 'holy' : 'dark'); G.ui.toast(`${k.name}が蘇った…！`, 'warn'); this.recover(3, k);
          }
        } else {
          damp(k.J.body.position, 'y', 2.3, 4, dt); damp(k.J.torso.rotation, 'x', 0, 4, dt);
          k.glowM.emissiveIntensity = 3;
          this.knightAI(k, dt);
        }
        k.g.position.copy(k.pos); k.g.rotation.y = k.yaw;
      }
      // the resonance link
      if (this.linked) {
        const p1 = a.part.centerRef, p2 = b.part.centerRef, mid = p1.clone().add(p2).multiplyScalar(0.5);
        this.linkBeam.visible = true; this.linkBeam.position.copy(mid); this.linkBeam.scale.set(1, p1.distanceTo(p2), 1);
        this.linkBeam.quaternion.setFromUnitVectors(V(0, 1, 0), p2.clone().sub(p1).normalize());
        this.linkBeam.material.opacity = 0.4 + Math.sin(this.t * 12) * 0.2;
      } else this.linkBeam.visible = false;
      // combined cross-dash every so often
      this.comboCd -= dt;
      if (this.comboCd <= 0 && !a.down && !b.down && !a.act && !b.act) { this.comboCd = U.rand(13, 18) * (this.loop ? 0.8 : 1); this.crossDash(); }
      this.light.pos.copy(a.pos).add(b.pos).multiplyScalar(0.5).setY(3);
      this.updateHits();
      this.bar();
    }
    knightAI(k, dt) {
      const sp = (k.enraged ? 1.35 : 1) * (1 + this.loop * 0.15);
      if (k.act) return this.knightAct(k, dt, sp);
      const other = this.K.find((x) => x !== k);
      const want = k.light ? 9 : 3.2;
      // the light knight drifts toward its twin (keeping the link up) while keeping range
      const tgt = k.light && !other.down ? P.pos.clone().lerp(other.pos, 0.5) : P.pos.clone();
      const d = distH(k.pos, P.pos);
      this.faceK(k, P.pos, dt, 5);
      const dx = tgt.x - k.pos.x, dz = tgt.z - k.pos.z, l = Math.hypot(dx, dz) || 1;
      if (d > want + 1 || (k.light && distH(k.pos, tgt) > 3)) { this.moveK(k, dx / l, dz / l, (k.light ? 4.5 : 6.5) * sp, dt); k.walk += dt * 6; }
      else if (d < want - 2 && k.light) { this.moveK(k, -dx / l, -dz / l, 4 * sp, dt); k.walk += dt * 6; }
      for (let i = 0; i < 2; i++) k.J.legs[i].hp.rotation.x = Math.sin(k.walk + i * Math.PI) * 0.4;
      k.cd -= dt * sp;
      if (k.cd <= 0) {
        if (k.light) k.act = Math.random() < 0.55 ? { k: 'pillars', t: 0 } : { k: 'lance', t: 0 };
        else k.act = d < 8 && Math.random() < 0.5 ? { k: 'slash', t: 0 } : Math.random() < 0.5 ? { k: 'dash', t: 0 } : { k: 'fan', t: 0 };
      }
    }
    faceK(k, p, dt, rate) { const w = Math.atan2(p.x - k.pos.x, p.z - k.pos.z); k.yaw += U.wrapAngle(w - k.yaw) * Math.min(1, dt * rate); }
    moveK(k, dx, dz, s, dt) {
      const save = this.pos; this.pos = k.pos; this.groundMove(dx, dz, s, dt, 1.1); this.pos = save;
    }
    knightAct(k, dt, sp) {
      const a = k.act; a.t += dt * sp;
      const J = k.J, fwd = () => V(Math.sin(k.yaw), 0, Math.cos(k.yaw));
      const end = (cd) => { k.act = null; k.cd = (cd || U.rand(1.6, 2.6)) / (k.enraged ? 1.4 : 1); for (const ar of J.arms) { ar.sh.rotation.set(0, 0, 0); } };
      if (a.k === 'pillars') {
        if (a.t < 0.2 && !a.pts) {
          const n = 3 + Math.min(3, this.loop + (k.enraged ? 2 : 0));
          a.pts = [P.pos.clone().setY(0.02)]; for (let i = 1; i < n; i++) a.pts.push(P.pos.clone().add(V(U.rand(-6, 6), 0, U.rand(-6, 6))).setY(0.02));
          for (const p of a.pts) G.fx.telegraph(p, 2.3, 1.2, 0xffe080);
          G.sfx.magic(k.pos, 'holy');
        }
        J.arms[1].sh.rotation.x = -2.8;
        if (a.t >= 1.2 && !a.hit) {
          a.hit = true;
          for (const p of a.pts) { G.fx.beam(p.clone(), p.clone().setY(18), 0xfff0b0, 1.1, 0.4); G.fx.flash(p.clone().setY(2), 0xffe0a0, 30, 0.2, 8); if (distH(P.pos, p) < 2.3 && P.pos.y < 6) this.hurtPlayer(24, 'aoe', p); }
          G.sfx.zap(k.pos);
        }
        if (a.t > 1.6) end();
      } else if (a.k === 'lance' || a.k === 'dash') {
        const wind = a.k === 'lance' ? 0.95 : 0.7, len = a.k === 'lance' ? 17 : 14;
        if (!a.from) { this.faceK(k, P.pos, 1, 1); a.from = k.pos.clone(); a.to = k.pos.clone().addScaledVector(fwd(), len); lineTele(a.from, a.to, 1.3, wind, k.light ? 0xffd070 : 0xa060ff); G.sfx.attackWind(k.pos, true); }
        if (a.t < wind) { J.arms[1].sh.rotation.x = -1.6; return; }
        const kk = Math.min(1, (a.t - wind) / 0.3);
        const prev = k.pos.clone();
        k.pos.copy(a.from).lerp(a.to, kk);
        this.moveK(k, 0, 0, 0, 0);
        if (!a.hit && segDist(P.pos, prev, k.pos) < 1.7 && P.pos.y < 3) { a.hit = true; this.hurtPlayer(a.k === 'lance' ? 30 : 24, 'melee', k.pos); P.vel.x += fwd().x * 10; P.vel.z += fwd().z * 10; P.vel.y = 5; }
        if (Math.random() < 0.8) G.fx.add.spawn(k.pos.x, 1.5, k.pos.z, 0, 0.5, 0, 0.4, 0.4, 0.05, k.light ? 1 : 0.5, k.light ? 0.85 : 0.3, k.light ? 0.4 : 1, 0.8, 0, 0);
        if (kk >= 1) end(U.rand(1.4, 2.2));
      } else if (a.k === 'slash') {
        if (a.t < 0.55) { if (!a.w) { a.w = true; G.fx.telegraph(k.pos.clone().addScaledVector(fwd(), 2.4).setY(0.02), 3, 0.55, 0xa060ff); } for (const ar of J.arms) ar.sh.rotation.x = -2.2; return; }
        for (const ar of J.arms) ar.sh.rotation.x = 0.6;
        if (!a.hit) { a.hit = true; G.sfx.whoosh(0.4, 1.4); const c = k.pos.clone().addScaledVector(fwd(), 2.4); if (distH(P.pos, c) < 3 && P.pos.y < 3) this.hurtPlayer(22, 'melee', k.pos); }
        if (a.t > 0.9) end(U.rand(1, 1.6));
      } else if (a.k === 'fan') {
        if (a.t < 0.6) { J.arms[0].sh.rotation.x = -2.6; this.faceK(k, P.pos, 0.05, 6); return; }
        if (!a.done) {
          a.done = true;
          const base = Math.atan2(P.pos.x - k.pos.x, P.pos.z - k.pos.z), n = 5 + (k.enraged ? 2 : 0);
          for (let i = 0; i < n; i++) {
            const an = base + (i - (n - 1) / 2) * 0.16, from = k.pos.clone().add(V(0, 2.4, 0));
            const to = P.chestPos(); const dy = (to.y - from.y) / Math.max(1, distH(from, to));
            C.spawnProjectile({ kind: 'nail', pos: from, vel: V(Math.sin(an), dy, Math.cos(an)).normalize().multiplyScalar(30), grav: 0, owner: 'enemy', dmg: 12 * this.dmgScale, radius: 0.25, attacker: k.part, life: 3 });
          }
          G.sfx.whoosh(0.3, 1.6);
        }
        if (a.t > 0.9) end();
      }
    }
    crossDash() {
      // both knights leap to opposite sides of the player and slash through the centre
      const ang = Math.random() * Math.PI;
      const c = P.pos.clone().setY(0);
      this.K.forEach((k, i) => {
        const s = i ? 1 : -1;
        const from = c.clone().add(V(Math.cos(ang) * 9 * s, 0, Math.sin(ang) * 9 * s));
        k.pos.copy(from); G.fx.smoke(from.clone().setY(1), 8, 1.2, k.light ? 0xfff0c0 : 0x402060, 0.5, 0.8);
        k.yaw = Math.atan2(c.x - from.x, c.z - from.z);
        k.act = { k: 'dash', t: -0.35 };
      });
      G.ui.toastSmall('⚠ 双影の交差 — 線の外へ！'); G.sfx.monster(c, 'roar', 0.8, 0.8);
    }
    dispose() { super.dispose(); G.scene.remove(this.linkBeam); }
    aoe() {}
    emp() {}
  }

  // ======================================================================
  // 7) ABYSSAL HEART — invulnerable while its blood pylons stand; break them all to expose it
  class Heart extends Boss {
    constructor(def, level, world) {
      env(); super(def, level, world);
      this.maxHp = Math.round(5200 * this.hpScale); this.hp = this.maxHp;
      const c = world.arenaCenter;
      this.pos.set(c.x, 0, c.z);
      this.flesh = mat('#5a0a14', { roughness: 0.45, emissive: 0x3a0008, emissiveIntensity: 1 });
      const vein = mat('#2a0408', { roughness: 0.6 });
      this.hg = joint(this.root, 0, 7, 0);
      this.core = mesh(this.hg, PG.sph, this.flesh, 2.6, 2.9, 2.4);
      for (let i = 0; i < 6; i++) mesh(this.hg, PG.torus, vein, 2.0, 2.0, 2.0, U.rand(0, 3), U.rand(0, 3), 0);
      for (let i = 0; i < 4; i++) mesh(this.hg, PG.cyl8, vein, 0.5, 2.4, 0.5, U.rand(-1, 1), 2.6, U.rand(-1, 1), U.rand(-0.4, 0.4), 0, U.rand(-0.4, 0.4));
      this.tents = [];
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const t = joint(this.hg, Math.cos(a) * 1.6, -1.8, Math.sin(a) * 1.6); mesh(t, PG.cone, vein, 0.35, 4, 0.35, 0, -2, 0, Math.PI); this.tents.push(t); }
      this.heartPart = this.part({ name: def.name, hitW: [{ n: this.hg, r: 2.7, part: 'body' }], radius: 2.7, height: 5 });
      this.heartPart.isInvuln = () => this.state !== 'exposed';
      this.heartPart.dmgMul = () => 1.3;
      // pylons
      this.cycle = 0;
      this.pyM = mat('#300810', { emissive: 0xff2040, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.3 });
      this.pylons = [];
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + Math.PI / 4;
        const holder = joint(this.root, Math.cos(a) * 13, 0, Math.sin(a) * 13);
        const m = mesh(holder, PG.oct, this.pyM, 0.9, 2.2, 0.9, 0, 2.2, 0);
        mesh(holder, PG.cyl8, vein, 1.1, 0.5, 1.1, 0, 0.25, 0);
        const py = this.part({ name: '血晶柱', shared: false, hitW: [{ n: holder, r: 1.0, part: 'body', o: V(0, 2.2, 0) }], radius: 1, height: 4.4, showBar: true, blood: 0xff2040 });
        py.maxHp = Math.round(this.maxHp * 0.055); py.hp = py.maxHp; py.mesh = m; py.holder = holder;
        py.die = () => { this.pylonBroken(py); return false; };
        py.isInvuln = () => py.broken;
        py.barPos = () => py.centerRef.clone().add(V(0, 2.8, 0));
        this.pylons.push(py);
      }
      this.state = 'guarded'; this.cd = 2.5;
      this.light = { pos: c.clone().setY(7), color: '#ff2040', intensity: 26, range: 26, flame: 0, emit: false, ph: 0, prio: 5 };
      world.lightSources.push(this.light);
      this.beat = 0;
    }
    phaseText() {
      if (this.state === 'exposed') return `💔 心臓が露出！ 残り ${this.expT.toFixed(1)}秒 — 撃ち込め！`;
      return `🩸 血晶柱 残り ${this.pylons.filter((p) => !p.broken).length}/4 — 全て壊すと心臓が露出する`;
    }
    pylonBroken(py) {
      if (py.broken) return;
      py.broken = true; py.mesh.visible = false;
      G.fx.explosion(py.centerRef.clone(), 2.5, 0xff2040); G.sfx.shieldBreak(py.centerRef); G.sfx.monster(this.hg.getWorldPosition(V()), 'gurgle', 0.5, 1.2);
      this.hp -= this.maxHp * 0.04;
      if (this.hp <= 0) { this.kill(); return; }
      if (this.pylons.every((p) => p.broken)) { this.state = 'exposed'; this.expT = 10; this.act = null; G.ui.toast('💔 心臓が露出した！', 'good'); G.sfx.heartbeat(1); }
    }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const ph = this.hp / this.maxHp, phase = ph < 0.3 ? 3 : ph < 0.6 ? 2 : 1;
      if (phase !== this.phase) { this.phase = phase; G.ui.toast(`🫀 深淵の心臓が激しく脈打つ（フェーズ${phase}）`, 'warn'); this.summon(2 + phase); }
      // heartbeat
      const rate = 1.1 + this.phase * 0.35 + (this.state === 'exposed' ? 0.6 : 0);
      this.beat += dt * rate;
      const b = Math.pow(Math.max(0, Math.sin(this.beat * Math.PI * 2)), 6);
      this.core.scale.set(2.6 + b * 0.35, 2.9 + b * 0.35, 2.4 + b * 0.35);
      this.flesh.emissiveIntensity = 0.8 + b * 1.8 + (this.state === 'exposed' ? 1.2 : 0);
      if (b > 0.9 && !this._bt) { this._bt = true; G.sfx.heartbeat(0.5 + this.phase * 0.15); } else if (b < 0.5) this._bt = false;
      for (let i = 0; i < this.tents.length; i++) this.tents[i].rotation.set(Math.sin(this.t * 1.3 + i) * 0.3, 0, Math.cos(this.t * 1.1 + i) * 0.3);
      this.pyM.emissiveIntensity = 1.2 + b * 1.2;
      if (this.state === 'exposed') {
        this.expT -= dt;
        damp(this.hg.position, 'y', 3.2, 2, dt);
        if (this.expT <= 0) {
          this.state = 'guarded'; this.cycle++;
          for (const p of this.pylons) { p.broken = false; p.mesh.visible = true; p.maxHp = Math.round(this.maxHp * 0.055 * (1 + this.cycle * 0.15)); p.hp = p.maxHp; }
          G.ui.toast('🩸 血晶柱が再生した', 'warn'); this.summon(2 + this.phase); this.recover(3);
        }
      } else {
        damp(this.hg.position, 'y', 7, 2, dt);
        this.cd -= dt;
        if (!this.act && this.cd <= 0) {
          const r = Math.random();
          if (r < 0.3) this.act = { k: 'pulse', t: 0 };
          else if (r < 0.58) this.act = { k: 'rain', t: 0 };
          else if (r < 0.85) this.act = { k: 'tentacle', t: 0, n: 2 + this.phase };
          else this.act = this.phase >= 2 ? { k: 'beam', t: 0 } : { k: 'pulse', t: 0 };
        }
      }
      if (this.act) this.doAct(dt);
      this.root.position.copy(this.pos);
      this.light.pos.copy(this.hg.getWorldPosition(V()));
      this.updateHits();
      this.bar();
    }
    summon(n) { for (let i = 0; i < n; i++) { const e = G.game.spawnEnemy({ near: true }); if (e) { e.noReward = true; e.ignoreCount = true; } } }
    doAct(dt) {
      const a = this.act; a.t += dt;
      const sp = 1 + (this.phase - 1) * 0.25 + this.loop * 0.15;
      const c = V(this.pos.x, 0, this.pos.z);
      const end = () => { this.act = null; this.cd = U.rand(1.8, 3) / sp; };
      if (a.k === 'pulse') {
        if (!a.wave) {
          a.wave = { r: 2 }; G.ui.toastSmall('⚠ 鼓動の波 — ジャンプで越えろ！');
          const m = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.3, c.z); G.scene.add(m); a.wave.mesh = m; G.sfx.explosion(c, 1.2); P.addShake(0.3);
        }
        const w = a.wave; w.r += dt * 14 * sp; w.mesh.scale.setScalar(w.r); w.mesh.material.opacity = Math.max(0, 1 - w.r / 34);
        if (!a.hitP && Math.abs(distH(P.pos, c) - w.r) < 0.9 && P.pos.y < 0.8) { a.hitP = true; this.hurtPlayer(26, 'aoe', c); P.vel.y = 6; }
        if (w.r > 34) { G.scene.remove(w.mesh); end(); }
      } else if (a.k === 'rain') {
        if (!a.pts) {
          a.pts = []; const n = 6 + this.phase * 2;
          for (let i = 0; i < n; i++) a.pts.push(P.pos.clone().add(V(U.rand(-7, 7), 0, U.rand(-7, 7))).setY(0.02));
          a.pts[0] = P.pos.clone().setY(0.02);
          for (const p of a.pts) G.fx.telegraph(p, 2.4, 1.3, 0xc01030);
        }
        if (a.t > 1.3 && !a.hit) {
          a.hit = true;
          for (const p of a.pts) { G.fx.blood(p.clone().setY(0.5), V(0, 1, 0), 0x8a0010, 6); if (distH(P.pos, p) < 2.4 && P.pos.y < 2) this.hurtPlayer(22, 'aoe', p); }
          if (this.phase >= 2) for (let i = 0; i < 3; i++) C.zone(a.pts[i].clone(), 2.2, 5, 'acid', 10 * this.dmgScale, { enemy: true });
          G.sfx.monster(c, 'gurgle', 0.6, 0.8);
        }
        if (a.t > 1.6) end();
      } else if (a.k === 'tentacle') {
        a.i = a.i || 0; a.next = a.next ?? 0;
        if (a.i < a.n && a.t >= a.next) {
          a.i++; a.next = a.t + 0.55 / sp;
          const p = P.pos.clone().setY(0.02); G.fx.telegraph(p, 1.9, 0.9 / sp, 0xff2040);
          setTimeout(() => {
            if (this.dead) return;
            const t = new THREE.Mesh(PG.cone, this.flesh); t.scale.set(0.9, 6, 0.9); t.position.set(p.x, 3, p.z); G.scene.add(t);
            G.fx.dust(p, V(0, 1, 0), 0x5a1010, 12); G.sfx.explosion(p, 0.5);
            if (distH(P.pos, p) < 1.9 && P.pos.y < 5) { this.hurtPlayer(30, 'melee', p); P.vel.y = 11; }
            let k = 0; const iv = setInterval(() => { k++; t.position.y -= 0.35; if (k > 18) { clearInterval(iv); G.scene.remove(t); } }, 30);
          }, 900 / sp);
        }
        if (a.i >= a.n && a.t > a.next + 1) end();
      } else if (a.k === 'beam') {
        if (!a.ang) { a.ang = Math.atan2(P.pos.x - c.x, P.pos.z - c.z) - 1.2; a.dir = Math.random() < 0.5 ? 1 : -1; if (a.dir < 0) a.ang += 2.4; G.ui.toastSmall('⚠ 血の薙ぎ払い — ジャンプで越えろ！'); }
        if (a.t < 0.8) { const to = c.clone().add(V(Math.sin(a.ang) * 24, 0.8, Math.cos(a.ang) * 24)); G.fx.beam(c.clone().setY(0.8), to, 0xff3050, 0.06, 0.05); return; }
        a.ang += a.dir * dt * 1.0 * sp;
        const to = c.clone().add(V(Math.sin(a.ang) * 24, 0.8, Math.cos(a.ang) * 24));
        G.fx.beam(c.clone().setY(0.8), to, 0xff2040, 0.35, 0.05);
        const pa = Math.atan2(P.pos.x - c.x, P.pos.z - c.z);
        if (Math.abs(U.wrapAngle(pa - a.ang)) < 0.06 && distH(P.pos, c) < 24 && P.pos.y < 1.2) { a.tick = (a.tick || 0) - dt; if (a.tick <= 0) { a.tick = 0.4; this.hurtPlayer(18, 'aoe', c); } }
        if (a.t > 0.8 + 2.4 / sp) end();
      }
    }
    aoe() {}
    emp() {}
  }

  // ======================================================================
  // 8) SHADOW HUNTER — a dark mirror: grapples between pillars, pile-drives from the sky, snipes with a warning laser, cloaks
  class Hunter extends Boss {
    constructor(def, level, world) {
      env(); super(def, level, world);
      this.maxHp = Math.round(4400 * this.hpScale); this.hp = this.maxHp;
      this.armorM = mat('#18161c', { roughness: 0.5, metalness: 0.4, transparent: true });
      this.trimM = mat('#3a3044', { roughness: 0.4, metalness: 0.6, transparent: true });
      this.glowM = mat('#000', { emissive: 0xff2030, emissiveIntensity: 3, transparent: true });
      this.capeM = mat('#0c0a10', { side: THREE.DoubleSide, transparent: true });
      this.J = humanoid(this.root, { s: 0.95, hip: 1.9, armor: this.armorM, trim: this.trimM, glow: this.glowM, cape: this.capeM });
      mesh(this.J.arms[1].hand, PG.box, this.trimM, 0.12, 0.16, 1.3, 0, 0, 0.5);
      this.muzzle = joint(this.J.arms[1].hand, 0, 0, 1.2);
      this.mats = [this.armorM, this.trimM, this.glowM, this.capeM];
      this.body = this.part({ name: def.name, hitW: [{ n: this.J.torso, r: 0.75, part: 'body', o: V(0, 0.5, 0) }, { n: this.J.body, r: 0.6, part: 'body' }, { n: this.J.head, r: 0.42, part: 'head' }], radius: 0.8, height: 3 });
      this.body.dmgMul = () => (this.cloaked ? 1.5 : 1);
      this.state = 'ground'; this.cd = 2; this.clones = [];
      this.pos.set(world.arenaCenter.x, 0, world.arenaCenter.z - 10);
      this.vy = 0; this.strafe = 1; this.strafeT = 2;
      this.laser = null;
    }
    phaseText() {
      return this.cloaked ? '👻 姿を消した — 背後に注意（透明中は被ダメ1.5倍）' : this.state === 'air' ? '⚠ 上空 — 落下地点から離れろ！' : '🎯 赤いレーザーは狙撃の予兆 — 柱の陰へ';
    }
    setCloak(on) { this.cloaked = on; for (const m of this.mats) m.opacity = on ? 0.07 : 1; }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const sp = 1 + (this.hp < this.maxHp * 0.25 ? 0.35 : 0) + this.loop * 0.15;
      if (!this.split && this.hp < this.maxHp * 0.5) { this.split = true; this.spawnClones(); }
      if (this.state === 'air') this.updateAir(dt);
      else if (this.act) this.doAct(dt, sp);
      else {
        this.face(P.pos, dt, 6);
        const d = this.playerDistH();
        const dx = (P.pos.x - this.pos.x) / (d || 1), dz = (P.pos.z - this.pos.z) / (d || 1);
        this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = U.rand(1.2, 2.5); this.strafe *= -1; }
        let mx = -dz * this.strafe, mz = dx * this.strafe;
        if (d > 16) { mx += dx; mz += dz; } else if (d < 8) { mx -= dx; mz -= dz; }
        const l = Math.hypot(mx, mz) || 1;
        this.groundMove(mx / l, mz / l, 7.5 * sp, dt, 0.9);
        this.walk = (this.walk || 0) + dt * 9;
        this.cd -= dt * sp;
        if (this.cd <= 0) {
          const r = Math.random();
          if (r < 0.3) this.act = { k: 'snipe', t: 0 };
          else if (r < 0.55) this.act = { k: 'burst', t: 0, n: 0 };
          else if (r < 0.8) this.act = { k: 'grapple', t: 0 };
          else this.act = { k: 'cloak', t: 0 };
        }
      }
      for (let i = 0; i < 2; i++) this.J.legs[i].hp.rotation.x = Math.sin((this.walk || 0) + i * Math.PI) * 0.5;
      this.J.arms[1].sh.rotation.x = U.damp(this.J.arms[1].sh.rotation.x, this.act && (this.act.k === 'snipe' || this.act.k === 'burst') ? -1.5 : -0.3, 10, dt);
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
      for (const cl of this.clones) this.updateClone(cl, dt);
      this.updateHits();
      this.bar();
    }
    muzzleW() { this.root.updateMatrixWorld(true); return this.muzzle.getWorldPosition(V()); }
    doAct(dt, sp) {
      const a = this.act; a.t += dt * sp;
      const end = (cd) => { this.act = null; this.cd = cd || U.rand(1.2, 2.2); if (this.laser) { this.laser = null; } };
      if (a.k === 'snipe') {
        this.face(P.pos, dt, a.t < 1.0 ? 8 : 0);
        const m = this.muzzleW();
        if (a.t < 1.0) { a.aim = P.chestPos(); G.fx.beam(m, a.aim, 0xff1020, 0.015, 0.04); if (!a.w) { a.w = true; G.sfx.ui('deny'); } return; }
        if (a.t < 1.3) { G.fx.beam(m, a.aim, 0xff6060, 0.03, 0.04); return; } // locked: last chance to move
        if (!a.fired) {
          a.fired = true;
          const dir = a.aim.clone().sub(m).normalize();
          const wh = G.world.raycast(m, dir, 200); const end2 = wh ? wh.point : m.clone().addScaledVector(dir, 200);
          G.fx.beam(m, end2, 0xffd0d0, 0.08, 0.2); G.sfx.gun('sniper', {});
          // hit if the player is still on the locked line
          const pc = P.chestPos(); const t = pc.clone().sub(m).dot(dir);
          if (t > 0 && (!wh || t < wh.t) && pc.clone().sub(m.clone().addScaledVector(dir, t)).length() < 0.9) this.hurtPlayer(34, 'ranged', m);
        }
        if (a.t > 1.6) end();
      } else if (a.k === 'burst') {
        this.face(P.pos, dt, 8);
        a.next = a.next ?? 0.35;
        if (a.t >= a.next && a.n < 9) {
          a.n++; a.next += a.n % 3 === 0 ? 0.45 : 0.09;
          const m = this.muzzleW(), dir = P.chestPos().sub(m).normalize();
          dir.x += U.rand(-0.03, 0.03); dir.y += U.rand(-0.02, 0.02); dir.normalize();
          C.spawnProjectile({ kind: 'nail', pos: m, vel: dir.multiplyScalar(48), grav: 0, owner: 'enemy', dmg: 9 * this.dmgScale, radius: 0.2, attacker: this.body, life: 3 });
          G.sfx.gun('smg', { vol: 0.6 });
        }
        if (a.n >= 9 && a.t > a.next) end();
      } else if (a.k === 'grapple') {
        if (!a.pil) {
          const ps = this.world.bossPillars.slice().sort((p, q) => distH(q, P.pos) - distH(p, P.pos));
          a.pil = ps[Math.floor(Math.random() * Math.min(3, ps.length))].clone().setY(9);
          a.from = this.pos.clone();
          G.sfx.whoosh(0.4, 1.4);
        }
        const k = Math.min(1, a.t / 0.7);
        G.fx.tracer(this.muzzleW(), a.pil, 0x9a8aa0, 0.02, 0.05);
        this.pos.copy(a.from).lerp(a.pil.clone().setY(0), k); this.pos.y = Math.sin(k * Math.PI) * 6 + k * 8;
        if (k >= 1) { this.act = null; this.state = 'air'; this.airT = 0; this.vy = 4; this.slam = null; }
      } else if (a.k === 'cloak') {
        if (!a.on) { a.on = true; this.setCloak(true); G.sfx.magic(this.pos, 'dark'); G.fx.smoke(this.pos.clone().setY(1.5), 10, 1.2, 0x100810, 0.4, 0.8); }
        // circle around behind the player
        const back = P.pos.clone().sub(P.forward().setY(0).normalize().multiplyScalar(3));
        const d = distH(this.pos, back);
        if (d > 1) this.groundMove((back.x - this.pos.x) / d, (back.z - this.pos.z) / d, 11, dt, 0.9);
        this.face(P.pos, dt, 8);
        if (Math.random() < dt * 20) G.fx.norm.spawn(this.pos.x + U.rand(-0.4, 0.4), this.pos.y + U.rand(0.5, 2.5), this.pos.z + U.rand(-0.4, 0.4), 0, 0.3, 0, 0.5, 0.15, 0.3, 0.08, 0.05, 0.1, 0.5, 0, 1);
        if (a.t > 2.6 && !a.stab) { a.stab = true; this.setCloak(false); G.fx.telegraph(this.pos.clone().addScaledVector(V(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 1.6).setY(0.02), 2.2, 0.35, 0xff2030); G.sfx.attackWind(this.pos, false); }
        if (a.t > 2.95 && !a.hit) { a.hit = true; const c = this.pos.clone().addScaledVector(V(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 1.6); if (distH(P.pos, c) < 2.2 && P.pos.y < this.pos.y + 3) this.hurtPlayer(28, 'melee', this.pos); G.sfx.whoosh(0.3, 1.6); }
        if (a.t > 3.4) { this.setCloak(false); end(); }
      }
    }
    updateAir(dt) {
      this.airT += dt;
      if (!this.slam) {
        // hover above the pillar, then dive at the player
        this.face(P.pos, dt, 6);
        if (this.airT > 0.5) {
          this.slam = { to: P.pos.clone().setY(0), t: 0 };
          G.fx.telegraph(this.slam.to.clone().setY(0.02), 4.6, 1.0, 0xff2030); G.ui.toastSmall('⚠ 影のパイルドライバー！');
          G.sfx.whoosh(0.5, 0.7);
        }
        return;
      }
      const s = this.slam; s.t += dt;
      if (s.t < 0.75) { this.pos.lerp(V(s.to.x, this.pos.y + 2 * dt, s.to.z), Math.min(1, dt * 3)); return; }
      this.pos.x = U.damp(this.pos.x, s.to.x, 20, dt); this.pos.z = U.damp(this.pos.z, s.to.z, 20, dt);
      this.pos.y -= dt * 46;
      if (this.pos.y <= 0) {
        this.pos.y = 0; this.state = 'ground'; this.cd = U.rand(1.4, 2.2);
        G.fx.ring(this.pos.clone().setY(0.1), 4.6, 0xff4050, 0.5); G.fx.dust(this.pos, V(0, 1, 0), 0x3a2a3a, 26); G.fx.decal(this.pos.clone().setY(0.03), V(0, 1, 0), 'crack', 6, true);
        G.sfx.explosion(this.pos, 1.3); P.addShake(0.6);
        if (distH(P.pos, this.pos) < 4.6 && P.pos.y < 2) { this.hurtPlayer(34, 'aoe', this.pos); P.vel.y = 8; }
      }
    }
    spawnClones() {
      G.ui.toast('👥 影の狩人が分身した！ 分身は脆い', 'warn');
      for (let i = 0; i < 2; i++) {
        const g = new THREE.Group(); G.scene.add(g);
        const dm = mat('#100c14', { transparent: true, opacity: 0.55, emissive: 0x200818 });
        const gm = mat('#000', { emissive: 0xff4060, emissiveIntensity: 2.5 });
        const J = humanoid(g, { s: 0.9, hip: 1.8, armor: dm, trim: dm, glow: gm, cape: dm });
        const cl = { g, J, pos: this.pos.clone().add(V(i ? 4 : -4, 0, 0)), yaw: 0, cd: U.rand(1, 3), alive: true, walk: 0 };
        const part = this.part({ name: '影の分身', shared: false, hitW: [{ n: J.torso, r: 0.7, part: 'body', o: V(0, 0.5, 0) }, { n: J.head, r: 0.4, part: 'head' }], radius: 0.7, height: 2.8, showBar: true, blood: 0x300818 });
        part.maxHp = Math.round(this.maxHp * 0.05); part.hp = part.maxHp;
        part.die = () => { cl.alive = false; part.alive = false; G.scene.remove(g); G.fx.smoke(cl.pos.clone().setY(1.4), 12, 1.3, 0x100810, 0.6, 0.8); return false; };
        part.barPos = () => part.centerRef.clone().add(V(0, 1.6, 0));
        cl.part = part;
        this.clones.push(cl);
      }
    }
    updateClone(cl, dt) {
      if (!cl.alive) return;
      const d = distH(cl.pos, P.pos) || 1;
      const w = Math.atan2(P.pos.x - cl.pos.x, P.pos.z - cl.pos.z); cl.yaw += U.wrapAngle(w - cl.yaw) * Math.min(1, dt * 6);
      if (d > 10) { const save = this.pos; this.pos = cl.pos; this.groundMove((P.pos.x - cl.pos.x) / d, (P.pos.z - cl.pos.z) / d, 6, dt, 0.8); this.pos = save; cl.walk += dt * 8; }
      cl.cd -= dt;
      if (cl.cd <= 0) {
        cl.cd = U.rand(2.2, 3.5);
        const from = cl.pos.clone().add(V(0, 2, 0)), dir = P.chestPos().sub(from).normalize();
        C.spawnProjectile({ kind: 'darkorb', pos: from, vel: dir.multiplyScalar(16), grav: 0, owner: 'enemy', dmg: 12 * this.dmgScale, radius: 0.35, attacker: cl.part, life: 4 });
      }
      for (let i = 0; i < 2; i++) cl.J.legs[i].hp.rotation.x = Math.sin(cl.walk + i * Math.PI) * 0.45;
      cl.g.position.copy(cl.pos); cl.g.rotation.y = cl.yaw;
    }
    extraDispose() { for (const cl of this.clones) G.scene.remove(cl.g); }
    aoe() {}
    emp() { if (this.cloaked) { this.setCloak(false); if (this.act && this.act.k === 'cloak') this.act = null; G.ui.toastSmall('⚡ EMPで透明化が解けた'); } }
  }

  Object.assign(BS.CLS, { twins: Twins, heart: Heart, hunter: Hunter });
  BS.order.push('twins', 'heart', 'hunter');
  G.BOSSES.push(
    { id: 'twins', name: '双影の騎士', title: 'TWIN KNIGHTS', icon: '⚔️', desc: '光の騎士ソルと影の騎士ウンブラ。片方を倒しても、もう片方が生きていれば数秒で蘇生する。2体が近いと共鳴してダメージを大きく軽減する。引き離し、ほぼ同時に倒せ。', mech: ['相互蘇生（ほぼ同時に倒す）', '共鳴（近いとダメージ-60%）', '光柱・突撃・短剣の扇', '双影の交差（挟み撃ちの突進）'] },
    { id: 'heart', name: '深淵の心臓', title: 'ABYSSAL HEART', icon: '🫀', desc: '宙に浮かぶ巨大な心臓。周囲の4本の血晶柱が守っている間は無敵。全て壊すと心臓が降りてきて10秒間露出する。鼓動の波はジャンプで越えろ。', mech: ['血晶柱の破壊で露出', '鼓動の衝撃波（ジャンプ回避）', '血の雨・触手の突き上げ', '回転する血の薙ぎ払い', '眷属の召喚'] },
    { id: 'hunter', name: '影の狩人', title: 'SHADOW HUNTER', icon: '🥷', desc: 'あなたと同じ技を使う影。柱へグラップルで飛び移り、上空からパイルドライバーで降ってくる。赤いレーザーの後に来る狙撃は柱の陰で避けろ。姿を消している間は被ダメージが大きい。', mech: ['予兆レーザー付きの狙撃', 'グラップル→影のパイルドライバー', '透明化からの背後強襲（EMPで解除）', 'HP50%で分身2体'] },
  );
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));
})();
