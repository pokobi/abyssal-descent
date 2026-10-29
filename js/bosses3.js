'use strict';
// v3 bosses: Tempest Drake (shoot the wings to bring it down) and the final boss of the 50-area cycle,
// the Abyss King (a crowned giant who is reborn as the Avatar of the Abyss).
// Also: the boss cycle (a boss every 5 areas, the final boss every 50) and the "deeper cycle" variants after area 50.
(function () {
  const BS = G.bosses, U = G.U;
  const { mat, mesh, joint, V } = BS.h;
  const Boss = BS.Boss;
  let P, C, PG;
  const env = () => { P = G.player; C = G.combat; PG = G.Props.PG; };
  const distH = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function segDist(p, a, b) {
    const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1;
    const t = U.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / l2, 0, 1);
    return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
  }
  function lineTele(a, b, w, t, col) {
    const n = Math.max(2, Math.ceil(a.distanceTo(b) / (w * 1.6)));
    for (let i = 0; i <= n; i++) G.fx.telegraph(a.clone().lerp(b, i / n).setY(0.02), w, t, col);
  }
  // an expanding shockwave ring on the ground (jump over it)
  function shockwave(boss, c, speed, maxR, dmg, col) {
    boss.waves.push({ c: c.clone(), r: 1.5, speed, maxR, dmg, sr: G.fx.shockRing(c, col, 0.75, maxR), hit: false }); // drawn band = tested band (fx.js)
  }
  function updateWaves(boss, dt) {
    for (let i = boss.waves.length - 1; i >= 0; i--) {
      const w = boss.waves[i];
      w.r += w.speed * dt; w.sr.set(w.r, 1 - Math.max(0, w.r - w.maxR * 0.6) / (w.maxR * 0.4) * 0.6);
      if (!w.hit && Math.abs(distH(P.pos, w.c) - w.r) < 0.75 && P.pos.y < 0.6) { w.hit = true; boss.hurtPlayer(w.dmg, 'aoe', w.c); P.vel.y = 6; }
      if (w.r >= w.maxR) { w.sr.dispose(); boss.waves.splice(i, 1); }
    }
  }

  // ======================================================================
  // 9) TEMPEST DRAKE — circles the sky; break both wings to bring it crashing down, then go for the head
  class Drake extends Boss {
    constructor(def, level, world) {
      env(); super(def, level, world);
      this.maxHp = Math.round(4800 * this.hpScale); this.hp = this.maxHp;
      this.waves = [];
      const scale = mat('#28323e', { roughness: 0.5, metalness: 0.25 });
      const belly = mat('#5c5a48', { roughness: 0.8 });
      const horn = mat('#d8d0b8', { roughness: 0.5 });
      this.veinM = mat('#001428', { emissive: 0x40b0ff, emissiveIntensity: 1.6 });
      this.membM = mat('#1a2430', { side: THREE.DoubleSide, roughness: 0.7 });
      const eyeM = mat('#000', { emissive: 0x9fe8ff, emissiveIntensity: 4 });
      const r = this.root;
      this.bodyJ = joint(r, 0, 3.2, 0);
      const B = this.bodyJ;
      mesh(B, PG.sph, scale, 1.7, 1.45, 3.4);
      mesh(B, PG.sph, belly, 1.35, 1.0, 3.0, 0, -0.5, 0.1);
      for (let i = 0; i < 7; i++) mesh(B, PG.cone, horn, 0.2, 0.75, 0.2, 0, 1.35, -2.0 + i * 0.65, -0.3);
      for (const s of [-1, 1]) mesh(B, PG.box, this.veinM, 0.07, 0.07, 4.6, s * 0.95, 0.65, 0);
      // neck & head
      this.neck = [];
      let prev = joint(B, 0, 0.6, 2.7);
      for (let i = 0; i < 3; i++) { const sg = joint(prev, 0, 0.22, i ? 1.0 : 0); mesh(sg, PG.sph, scale, 0.72 - i * 0.08, 0.72 - i * 0.08, 0.95, 0, 0, 0.45); this.neck.push(sg); prev = sg; }
      this.head = joint(prev, 0, 0.1, 1.15);
      mesh(this.head, PG.box, scale, 0.95, 0.72, 1.6, 0, 0, 0.55);
      for (const s of [-1, 1]) { mesh(this.head, PG.cone, horn, 0.13, 1.2, 0.13, s * 0.35, 0.45, -0.25, -1.9, 0, s * 0.35); mesh(this.head, PG.sph, eyeM, 0.12, 0.08, 0.12, s * 0.38, 0.18, 0.95); }
      this.jaw = joint(this.head, 0, -0.28, 0.15);
      mesh(this.jaw, PG.box, scale, 0.8, 0.22, 1.35, 0, -0.08, 0.6);
      for (let i = 0; i < 5; i++) mesh(this.jaw, PG.cone, horn, 0.05, 0.16, 0.05, -0.3 + i * 0.15, 0.08, 1.15);
      this.mouth = joint(this.head, 0, -0.15, 1.45);
      // tail
      this.tail = [];
      prev = joint(B, 0, 0.1, -3.0);
      for (let i = 0; i < 6; i++) { const sg = joint(prev, 0, 0, i ? -1.05 : 0); mesh(sg, PG.sph, scale, 0.6 - i * 0.08, 0.55 - i * 0.07, 0.8, 0, 0, -0.5); this.tail.push(sg); prev = sg; }
      mesh(prev, PG.cone, horn, 0.4, 0.9, 0.12, 0, 0.1, -1.0, -Math.PI / 2);
      // legs
      this.legs = [];
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const hp = joint(B, sx * 1.15, -0.6, sz * 1.5); mesh(hp, PG.cyl8, scale, 0.32, 1.5, 0.32, 0, -0.75, 0); const kn = joint(hp, 0, -1.5, 0); mesh(kn, PG.cyl8, belly, 0.24, 1.3, 0.24, 0, -0.6, 0.15, 0.25); mesh(kn, PG.box, horn, 0.5, 0.15, 0.6, 0, -1.25, 0.35); this.legs.push({ hp, kn }); }
      // wings: bone arm + membrane fan (custom triangles)
      this.wings = [];
      for (const s of [-1, 1]) {
        const sh = joint(B, s * 1.25, 0.95, 0.6);
        mesh(sh, PG.cyl8, scale, 0.18, 4.2, 0.18, s * 2.1, 0.2, 0, 0, 0, Math.PI / 2 - s * 0.1);
        const tip = joint(sh, s * 4.2, 0.4, 0);
        mesh(tip, PG.cyl8, scale, 0.12, 3.4, 0.12, s * 1.5, 0, -0.8, 0.5, 0, Math.PI / 2);
        const g = new THREE.BufferGeometry();
        const v = [0, 0, 0, s * 4.2, 0.4, 0, s * 7.2, 0.5, -1.6, s * 4.2, 0.4, 0, s * 6.4, -0.1, -3.4, s * 7.2, 0.5, -1.6, 0, 0, 0, s * 6.4, -0.1, -3.4, s * 4.2, 0.4, 0, 0, 0, 0, s * 3.2, -0.2, -3.6, s * 6.4, -0.1, -3.4, 0, 0, 0, 0, -0.1, -2.8, s * 3.2, -0.2, -3.6];
        g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
        const memb = new THREE.Mesh(g, this.membM); memb.castShadow = true; sh.add(memb);
        const veins = mesh(sh, PG.box, this.veinM, 0.04, 0.04, 3.2, s * 3.5, 0.1, -1.6, 0, s * 0.6, 0);
        const wing = this.part({ name: s < 0 ? '左翼' : '右翼', shared: false, hitW: [{ n: sh, r: 1.7, part: 'body', o: V(s * 2.6, 0.2, -1.2) }, { n: sh, r: 1.6, part: 'body', o: V(s * 5.4, 0.3, -1.6) }], radius: 1.7, height: 2, showBar: true, blood: 0x203040 });
        wing.maxHp = Math.round(this.maxHp * 0.075); wing.hp = wing.maxHp; wing.sh = sh; wing.memb = memb; wing.veins = veins; wing.s = s;
        wing.die = () => { this.wingBroken(wing); return false; };
        wing.isInvuln = () => wing.broken || this.state !== 'air';
        wing.barPos = () => wing.centerRef.clone().add(V(0, 1.4, 0));
        this.wings.push(wing);
      }
      this.body = this.part({ name: def.name, hitW: [{ n: B, r: 1.6, part: 'body', o: V(0, 0, 1.2) }, { n: B, r: 1.6, part: 'body', o: V(0, 0, -1.2) }, { n: this.neck[1], r: 0.7, part: 'body' }, { n: this.tail[1], r: 0.6, part: 'body' }], radius: 2.2, height: 3.5 });
      this.body.dmgMul = () => (this.state === 'air' ? 0.45 : 1);
      this.headP = this.part({ name: def.name + '（頭部）', hitW: [{ n: this.head, r: 0.85, part: 'head', o: V(0, 0, 0.6) }], radius: 0.9, height: 1.2 });
      this.headP.dmgMul = () => (this.state === 'ground' ? (this.crashed ? 2.2 : 1.4) : 0.8);
      this.state = 'air'; this.airT = 0; this.orbA = Math.random() * 6.28; this.cd = 2.5; this.cycle = 0;
      const c = world.arenaCenter;
      this.pos.set(c.x, 13, c.z + 18); this.flap = 0;
      this.light = { pos: this.pos.clone(), color: '#60c0ff', intensity: 0, range: 18, flame: 0, emit: false, ph: 0, prio: 4 };
      world.lightSources.push(this.light);
    }
    phaseText() {
      if (this.state === 'ground') return this.crashed ? `💥 墜落！ 頭部が弱点 — 残り ${Math.max(0, this.groundT).toFixed(1)}秒` : '🐉 着地中 — 頭部を狙え';
      const n = this.wings.filter((w) => !w.broken).length;
      return `🪽 飛行中（胴体は硬い） — 翼を両方撃ち落とせ！ 残り${n}/2`;
    }
    wingBroken(w) {
      if (w.broken) return;
      w.broken = true; w.memb.visible = false; w.veins.visible = false;
      G.fx.explosion(w.centerRef.clone(), 2.2, 0x80c8ff); G.sfx.shieldBreak(w.centerRef); G.sfx.monster(this.pos, 'roar', 0.6, 1.2);
      this.hp -= this.maxHp * 0.03; if (this.hp <= 0) { this.kill(); return; }
      if (this.wings.every((x) => x.broken)) { this.state = 'crash'; this.stT = 0; this.act = null; this.from = this.pos.clone(); G.ui.toast('🐉 嵐翼の竜が墜落する！ 頭を狙え！', 'good'); }
      else G.ui.toastSmall('🪽 片翼を撃ち抜いた！');
    }
    restoreWings() {
      this.cycle++;
      for (const w of this.wings) { w.broken = false; w.memb.visible = true; w.veins.visible = true; w.maxHp = Math.round(this.maxHp * 0.075 * (1 + this.cycle * 0.15)); w.hp = w.maxHp; }
    }
    mouthW() { this.root.updateMatrixWorld(true); return this.mouth.getWorldPosition(V()); }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; G.ui.toast('⚡ 嵐翼の竜が雷を纏った！', 'warn'); G.sfx.thunder && G.sfx.thunder(1); this.veinM.emissiveIntensity = 3.2; }
      const sp = 1 + (this.phase - 1) * 0.25 + this.loop * 0.15;
      const c = this.world.arenaCenter;
      if (this.state === 'air') {
        this.airT += dt;
        if (!this.act) {
          // orbit the arena
          this.orbA += dt * 0.32 * sp;
          const tgt = V(c.x + Math.cos(this.orbA) * 20, 13 + Math.sin(this.t * 0.7) * 1.5, c.z + Math.sin(this.orbA) * 20);
          this.moveTo(tgt, 9 * sp, dt);
          this.cd -= dt;
          if (this.airT > 34 && !this.act) { this.act = { k: 'land', t: 0 }; }
          else if (this.cd <= 0) {
            const r = Math.random();
            if (r < 0.32) this.act = { k: 'breath', t: 0 };
            else if (r < 0.58) this.act = { k: 'volley', t: 0 };
            else if (r < 0.8 || this.phase < 2) this.act = { k: 'dive', t: 0 };
            else this.act = { k: 'storm', t: 0, n: 0 };
          }
        }
        if (this.act) this.doAir(dt, sp);
        this.flap += dt * (this.act && this.act.k === 'dive' ? 2 : 5);
      } else if (this.state === 'crash') {
        this.stT += dt;
        const k = Math.min(1, this.stT / 1.1);
        this.pos.y = this.from.y * (1 - k * k); this.yaw += dt * 2;
        if (k >= 1) { this.pos.y = 0; this.state = 'ground'; this.crashed = true; this.groundT = 11; this.cd = 4; G.sfx.explosion(this.pos, 2); G.fx.dust(this.pos, V(0, 1, 0), 0x6a5a48, 30); P.addShake(0.8); if (this.playerDistH() < 6) this.hurtPlayer(30, 'aoe'); }
      } else if (this.state === 'ground') {
        this.groundT -= dt;
        if (!this.act) {
          this.face(P.pos, dt, 2.5);
          const d = this.playerDistH();
          if (d > 7) { this.groundMove((P.pos.x - this.pos.x) / d, (P.pos.z - this.pos.z) / d, 4.5 * sp, dt, 2.4); this.walk = (this.walk || 0) + dt * 5; }
          this.cd -= dt * sp;
          if (this.cd <= 0) { const r = Math.random(); this.act = d < 8 && r < 0.45 ? { k: 'bite', t: 0 } : r < 0.75 ? { k: 'tail', t: 0 } : { k: 'roar', t: 0 }; }
          if (this.groundT <= 0) { this.state = 'takeoff'; this.stT = 0; if (this.crashed) { this.restoreWings(); this.wasCrashed = true; } this.crashed = false; G.sfx.whoosh(0.8, 0.6); G.ui.toastSmall('🐉 竜が再び舞い上がる'); }
        } else this.doGround(dt, sp);
      } else if (this.state === 'takeoff') {
        this.stT += dt; this.pos.y = Math.min(13, this.pos.y + dt * 10); this.flap += dt * 8;
        if (this.stT > 1.4) { this.state = 'air'; this.airT = 0; this.cd = 1.5; this.orbA = Math.atan2(this.pos.z - c.z, this.pos.x - c.x); if (this.wasCrashed) { this.wasCrashed = false; this.recover(3); } }
      }
      updateWaves(this, dt);
      this.animate(dt);
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
      this.light.pos.copy(this.pos).add(V(0, 3, 0)); this.light.intensity = this.phase >= 2 ? 6 + Math.random() * 6 : 3;
      this.updateHits();
      this.bar();
    }
    moveTo(tgt, speed, dt) {
      const d = tgt.clone().sub(this.pos), L = d.length();
      if (L > 0.01) { this.pos.addScaledVector(d, Math.min(1, speed * dt / L)); const want = Math.atan2(d.x, d.z); this.yaw += U.wrapAngle(want - this.yaw) * Math.min(1, dt * 3); }
      return L;
    }
    animate(dt) {
      const air = this.state === 'air' || this.state === 'takeoff' || this.state === 'crash';
      for (const w of this.wings) {
        const s = w.s;
        const fl = air ? Math.sin(this.flap) * 0.55 : 0;
        w.sh.rotation.z = U.damp(w.sh.rotation.z, air ? s * fl : s * 1.1, 8, dt);
        w.sh.rotation.y = U.damp(w.sh.rotation.y, air ? 0 : -s * 0.9, 6, dt);
      }
      this.bodyJ.position.y = U.damp(this.bodyJ.position.y, air ? 0 : 3.2, 6, dt);
      for (let i = 0; i < this.tail.length; i++) this.tail[i].rotation.y = Math.sin(this.t * 2 + i * 0.6) * 0.18;
      for (let i = 0; i < this.legs.length; i++) { const l = this.legs[i]; l.hp.rotation.x = air ? 0.9 : Math.sin((this.walk || 0) + i * 1.6) * 0.35; }
      // neck tracks the player
      const want = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) - this.yaw;
      this.neck[0].rotation.y = U.damp(this.neck[0].rotation.y, U.clamp(U.wrapAngle(want), -0.8, 0.8) * 0.5, 4, dt);
      this.neck[0].rotation.x = U.damp(this.neck[0].rotation.x, air ? 0.45 : 0, 4, dt);
      this.jaw.rotation.x = U.damp(this.jaw.rotation.x, this.mouthOpen ? 0.55 : 0.05, 12, dt);
    }
    doAir(dt, sp) {
      const a = this.act; a.t += dt;
      const c = this.world.arenaCenter;
      const end = (cd) => { this.act = null; this.mouthOpen = false; this.cd = (cd || U.rand(2, 3.2)) / sp; };
      if (a.k === 'breath') {
        if (!a.A) {
          const ang = Math.random() * Math.PI * 2;
          const pp = P.pos.clone().setY(0), dir = V(Math.cos(ang), 0, Math.sin(ang));
          a.A = pp.clone().addScaledVector(dir, -13); a.B = pp.clone().addScaledVector(dir, 13);
          for (const q of [a.A, a.B]) { q.x = U.clamp(q.x, 4, this.world.W - 4); q.z = U.clamp(q.z, 4, this.world.arenaD - 4); }
          lineTele(a.A, a.B, 2.6, 2.2, 0xff6020); G.ui.toastSmall('⚠ 竜の息 — 赤い帯から離れろ！'); G.sfx.monster(this.pos, 'roar', 0.5, 0.9);
        }
        if (a.t < 1.2) { this.moveTo(a.A.clone().setY(9).addScaledVector(a.B.clone().sub(a.A).normalize(), -6), 18, dt); return; }
        const k = Math.min(1, (a.t - 1.2) / 1.3);
        const cur = a.A.clone().lerp(a.B, k);
        this.moveTo(cur.clone().setY(8).addScaledVector(a.B.clone().sub(a.A).normalize(), -4), 30, dt);
        this.mouthOpen = true;
        const m = this.mouthW();
        if (Math.random() < dt * 40) G.fx.flameLick(cur.x + U.rand(-1, 1), 0.2, cur.z + U.rand(-1, 1), 2.2);
        G.fx.beam(m, cur.clone().setY(0.3), 0xff8030, 0.25, 0.05);
        a.zT = (a.zT || 0) - dt; if (a.zT <= 0) { a.zT = 0.22; C.zone(cur.clone().setY(0), 2.2, 4, 'fire', 12 * this.dmgScale, { enemy: true }); }
        if (!a.hit && segDist(P.pos, a.A, cur) < 2.6 && P.pos.y < 3) { a.hit = true; this.hurtPlayer(30, 'aoe', cur, 'fire'); }
        if (k >= 1) end();
      } else if (a.k === 'volley') {
        this.moveTo(V(this.pos.x, 12, this.pos.z), 4, dt); this.face(P.pos, dt, 4);
        a.next = a.next ?? 0.6; a.n = a.n || 0;
        const N = 3 + this.phase;
        if (a.t >= a.next && a.n < N) {
          a.n++; a.next = a.t + 0.4; this.mouthOpen = true;
          const to = P.pos.clone().add(V(U.rand(-3, 3) * (a.n > 1 ? 1 : 0), 0, U.rand(-3, 3) * (a.n > 1 ? 1 : 0))).setY(0);
          const from = this.mouthW(), t = 1.1, vel = to.clone().sub(from).divideScalar(t); vel.y += 0.5 * 14 * t;
          G.fx.telegraph(to.clone().setY(0.02), 3, t, 0xff5020);
          C.spawnProjectile({ kind: 'bigfire', pos: from, vel, grav: 14, owner: 'enemy', dmg: 10 * this.dmgScale, radius: 0.6, life: 4, attacker: this.body,
            onEnd: (p) => { const q = V(p.pos.x, 0, p.pos.z); G.fx.explosion(q.clone().setY(0.5), 3, 0xff7020, { decal: true }); G.sfx.explosion(q, 0.7); if (distH(P.pos, q) < 3 && P.pos.y < 3) this.hurtPlayer(24, 'aoe', q, 'fire'); if (this.phase >= 2) C.zone(q, 2.4, 4, 'fire', 10 * this.dmgScale, { enemy: true }); } });
          G.sfx.fire && G.sfx.fire(from, true);
        }
        if (a.n >= N && a.t > a.next + 0.6) end();
      } else if (a.k === 'dive') {
        if (!a.to) { a.to = P.pos.clone().setY(0); a.tg = G.fx.telegraph(a.to.clone().setY(0.02), 4.5, 1.3, 0xff3020); G.sfx.monster(this.pos, 'roar', 0.55, 1.1); G.ui.toastSmall('⚠ 急降下！'); }
        if (a.t < 0.7) { this.moveTo(a.to.clone().setY(16), 14, dt); return; }
        if (!a.landed) {
          const L = this.moveTo(a.to, 42, dt);
          if (L < 0.6 || this.pos.y <= 0.1) {
            a.landed = true; this.pos.y = 0; a.lt = a.t;
            G.sfx.explosion(this.pos, 1.6); G.fx.dust(this.pos, V(0, 1, 0), 0x6a5a48, 24); P.addShake(0.6);
            if (this.playerDistH() < 4.5) { this.hurtPlayer(34, 'melee'); P.vel.y = 8; }
            shockwave(this, this.pos.clone().setY(0), 16, 18, 18, 0x80c8ff);
          }
          return;
        }
        if (a.t - a.lt > 1.4) { this.state = 'takeoff'; this.stT = 0; this.act = null; this.cd = 2; }
      } else if (a.k === 'storm') {
        this.moveTo(V(c.x, 15, c.z), 8, dt);
        a.next = a.next ?? 0.4;
        if (a.t >= a.next && a.n < 6) {
          a.n++; a.next = a.t + 0.45;
          const q = P.pos.clone().add(V(U.rand(-2, 2), 0, U.rand(-2, 2))).setY(0.02);
          G.fx.telegraph(q, 2.6, 0.9, 0x80d0ff);
          setTimeout(() => {
            if (this.dead) return;
            const top = q.clone().setY(40).add(V(U.rand(-4, 4), 0, U.rand(-4, 4)));
            G.fx.lightning(top, q.clone().setY(0.1), 0xa0e0ff); G.fx.lightning(top, q.clone().setY(0.1), 0xffffff);
            G.fx.flash(q, 0x80c8ff, 60, 0.2, 24); G.sfx.thunder && G.sfx.thunder(0.5); G.sfx.zap && G.sfx.zap(q);
            if (distH(P.pos, q) < 2.6) { this.hurtPlayer(22, 'aoe', q, 'shock'); P.st.shock = Math.max(P.st.shock || 0, 1.5); }
          }, 900);
        }
        if (a.n >= 6 && a.t > a.next + 1) end();
      } else if (a.k === 'land') {
        if (!a.to) { a.to = V(U.clamp(P.pos.x + U.rand(-8, 8), 10, this.world.W - 10), 0, U.clamp(P.pos.z + U.rand(-8, 8), 10, this.world.arenaD - 12)); }
        const L = this.moveTo(a.to, 10, dt);
        if (L < 0.5) { this.pos.y = 0; this.state = 'ground'; this.groundT = 7; this.act = null; this.cd = 1; G.sfx.explosion(this.pos, 1.2); G.fx.dust(this.pos, V(0, 1, 0), 0x6a5a48, 16); }
      }
    }
    doGround(dt, sp) {
      const a = this.act; a.t += dt * sp;
      const end = (cd) => { this.act = null; this.mouthOpen = false; this.cd = cd || U.rand(1.2, 2); };
      if (a.k === 'bite') {
        this.face(P.pos, dt, 4);
        if (!a.tg) { a.tg = true; const f = V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); G.fx.telegraph(this.pos.clone().addScaledVector(f, 4.5).setY(0.02), 3.2, 0.6, 0xff3020); }
        this.mouthOpen = a.t > 0.3;
        if (a.t > 0.65 && !a.hit) { a.hit = true; const f = V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); const q = this.pos.clone().addScaledVector(f, 4.5); if (distH(P.pos, q) < 3.4 && P.pos.y < 3) this.hurtPlayer(32, 'melee'); G.sfx.monster(this.pos, 'snarl', 0.6, 1); }
        if (a.t > 1.1) end();
      } else if (a.k === 'tail') {
        if (!a.tg) { a.tg = true; G.fx.telegraph(this.pos.clone().setY(0.02), 8, 0.9, 0xff8030); G.ui.toastSmall('⚠ 尾の薙ぎ払い — ジャンプ！'); }
        if (a.t > 0.9 && a.t < 1.5) this.yaw += dt * 10;
        if (a.t > 1.0 && !a.hit) { a.hit = true; if (this.playerDistH() < 8 && P.pos.y < 0.9) { this.hurtPlayer(28, 'melee'); const d = P.pos.clone().sub(this.pos).setY(0).normalize(); P.vel.x += d.x * 14; P.vel.z += d.z * 14; P.vel.y = 5; } G.sfx.whoosh(0.6, 0.8); }
        if (a.t > 1.6) end();
      } else if (a.k === 'roar') {
        this.mouthOpen = true;
        if (a.t > 0.5 && !a.hit) {
          a.hit = true; G.sfx.monster(this.pos, 'roar', 0.4, 1.5); P.addShake(0.5); G.fx.ring(this.pos.clone().setY(0.3), 10, 0x9fd8ff, 0.5);
          if (this.playerDistH() < 10) { const d = P.pos.clone().sub(this.pos).setY(0).normalize(); P.vel.x += d.x * 16; P.vel.z += d.z * 16; P.vel.y = 4; this.hurtPlayer(12, 'aoe'); }
        }
        if (a.t > 1.3) end();
      }
    }
    extraDispose() { for (const w of this.waves) G.scene.remove(w.m); this.waves.length = 0; this.light.intensity = 0; }
    aoe() {}
    emp() { if (this.state === 'air') for (const w of this.wings) if (!w.broken) { w.hp -= w.maxHp * 0.25; if (w.hp <= 0) this.wingBroken(w); } }
  }

  // ======================================================================
  // 10) THE ABYSS KING — final boss of every 50 areas. Phase 1: the crowned giant. At 0 HP he is reborn as the Avatar of the Abyss
  //     (phase 2; shielded by void anchors, beams blocked by pillars), and at 35% the edge of the world falls away (phase 3).
  function giant(root, o) {
    const J = {}, s = o.s;
    J.body = joint(root, 0, o.hip, 0);
    mesh(J.body, PG.box, o.armor, 1.0 * s, 0.55 * s, 0.65 * s);
    mesh(J.body, PG.box, o.cape, 1.1 * s, 0.9 * s, 0.7 * s, 0, -0.55 * s, 0); // tassets
    J.torso = joint(J.body, 0, 0.25 * s, 0);
    mesh(J.torso, PG.box, o.armor, 1.3 * s, 1.2 * s, 0.8 * s, 0, 0.6 * s, 0);
    mesh(J.torso, PG.box, o.trim, 1.4 * s, 0.16 * s, 0.85 * s, 0, 1.15 * s, 0);
    mesh(J.torso, PG.box, o.trim, 0.12 * s, 1.0 * s, 0.86 * s, 0, 0.6 * s, 0);
    for (const sx of [-1, 1]) { mesh(J.torso, PG.sph, o.armor, 0.42 * s, 0.34 * s, 0.42 * s, sx * 0.78 * s, 1.15 * s, 0); for (let k = 0; k < 3; k++) mesh(J.torso, PG.cone, o.trim, 0.06 * s, 0.35 * s, 0.06 * s, sx * (0.68 + k * 0.12) * s, 1.45 * s, 0); }
    mesh(J.torso, PG.box, o.cape, 1.3 * s, 2.3 * s, 0.05 * s, 0, -0.1 * s, -0.45 * s, 0.1);
    J.head = joint(J.torso, 0, 1.5 * s, 0);
    mesh(J.head, PG.box, o.armor, 0.5 * s, 0.62 * s, 0.56 * s);
    mesh(J.head, PG.box, o.glow, 0.36 * s, 0.05 * s, 0.05 * s, 0, 0.05 * s, 0.29 * s);
    J.crown = joint(J.head, 0, 0.36 * s, 0);
    mesh(J.crown, PG.cyl8, o.trim, 0.33 * s, 0.12 * s, 0.33 * s);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; mesh(J.crown, PG.cone, o.trim, 0.06 * s, 0.32 * s, 0.06 * s, Math.cos(a) * 0.3 * s, 0.2 * s, Math.sin(a) * 0.3 * s); }
    J.gem = mesh(J.crown, PG.oct, o.gem, 0.1 * s, 0.14 * s, 0.1 * s, 0, 0.05 * s, 0.33 * s);
    J.arms = [];
    for (const sx of [-1, 1]) {
      const sh = joint(J.torso, sx * 0.85 * s, 1.0 * s, 0);
      mesh(sh, PG.cyl8, o.armor, 0.2 * s, 0.85 * s, 0.2 * s, 0, -0.42 * s, 0);
      const el = joint(sh, 0, -0.85 * s, 0);
      mesh(el, PG.cyl8, o.trim, 0.18 * s, 0.8 * s, 0.18 * s, 0, -0.4 * s, 0);
      const hand = joint(el, 0, -0.82 * s, 0);
      mesh(hand, PG.box, o.armor, 0.22 * s, 0.22 * s, 0.22 * s);
      J.arms.push({ sh, el, hand });
    }
    J.legs = [];
    for (const sx of [-1, 1]) {
      const hp = joint(J.body, sx * 0.32 * s, -0.1 * s, 0);
      mesh(hp, PG.cyl8, o.armor, 0.24 * s, 1.05 * s, 0.24 * s, 0, -0.52 * s, 0);
      const kn = joint(hp, 0, -1.05 * s, 0);
      mesh(kn, PG.cyl8, o.trim, 0.2 * s, 1.0 * s, 0.2 * s, 0, -0.5 * s, 0);
      mesh(kn, PG.box, o.armor, 0.34 * s, 0.18 * s, 0.5 * s, 0, -1.0 * s, 0.1 * s);
      J.legs.push({ hp, kn });
    }
    return J;
  }
  class AbyssKing extends Boss {
    constructor(def, level, world) {
      env(); super(def, level, world);
      this.baseDef = def;
      this.maxHp = Math.round(5200 * this.hpScale); this.hp = this.maxHp;
      this.waves = []; this.fx = []; this.anchors = []; this.orbs = []; this.echoes = [];
      this.form = 1;
      this.armorM = mat('#16121c', { roughness: 0.35, metalness: 0.7, transparent: true });
      this.trimM = mat('#c8a040', { roughness: 0.3, metalness: 1, transparent: true });
      this.capeM = mat('#2a0838', { roughness: 0.8, side: THREE.DoubleSide, transparent: true });
      this.glowM = mat('#000', { emissive: 0xb050ff, emissiveIntensity: 3.5, transparent: true });
      this.gemM = mat('#300040', { emissive: 0xd060ff, emissiveIntensity: 3, roughness: 0.1, transparent: true });
      this.kingG = joint(this.root, 0, 0, 0);
      this.J = giant(this.kingG, { s: 2.3, hip: 4.6, armor: this.armorM, trim: this.trimM, cape: this.capeM, glow: this.glowM, gem: this.gemM });
      // the greatsword
      const hand = this.J.arms[1].hand;
      this.sword = joint(hand, 0, 0, 0.2);
      mesh(this.sword, PG.box, this.trimM, 0.18, 0.18, 1.1, 0, 0, -0.2);
      mesh(this.sword, PG.box, this.trimM, 1.4, 0.18, 0.22, 0, 0, 0.4);
      mesh(this.sword, PG.box, mat('#2a2030', { metalness: 0.9, roughness: 0.2 }), 0.42, 0.1, 6.6, 0, 0, 3.8);
      mesh(this.sword, PG.box, this.glowM, 0.08, 0.12, 6.2, 0, 0, 3.8);
      this.sword.rotation.x = Math.PI / 2;
      this.kmats = [this.armorM, this.trimM, this.capeM, this.glowM, this.gemM];
      // a halo above the crown and a rune circle that follows him across the floor
      this.haloK = mesh(this.J.head, PG.torus, this.glowM, 0.55 * 2.3, 0.55 * 2.3, 0.55 * 2.3, 0, 1.3 * 2.3, -0.2, Math.PI / 2);
      const rt = new THREE.Mesh(new THREE.RingGeometry(5.2, 6, 6, 1), new THREE.MeshBasicMaterial({ color: 0xa040ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const rt2 = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.9, 48, 1), rt.material);
      this.rune = new THREE.Group(); this.rune.add(rt); this.rune.add(rt2); rt.rotation.x = rt2.rotation.x = -Math.PI / 2; this.own(this.rune);
      this.body = this.part({ name: def.name, hitW: [{ n: this.J.torso, r: 1.6, part: 'body', o: V(0, 1.3, 0) }, { n: this.J.body, r: 1.3, part: 'body' }, { n: this.J.legs[0].kn, r: 0.7, part: 'body', o: V(0, -1, 0) }, { n: this.J.legs[1].kn, r: 0.7, part: 'body', o: V(0, -1, 0) }], radius: 2, height: 9 });
      this.body.dmgMul = () => 0.75;
      this.body.isInvuln = () => this.state === 'rise' || this.state === 'transform';
      this.crownP = this.part({ name: def.name + '（王冠）', hitW: [{ n: this.J.head, r: 0.75, part: 'head', o: V(0, 0.6, 0) }], radius: 0.8, height: 1.5 });
      this.crownP.dmgMul = () => 2.0;
      this.crownP.isInvuln = this.body.isInvuln;
      const seat = world.throneSeat || V(world.arenaCenter.x, 0, 6);
      this.pos.set(seat.x, 0, seat.z + 1.5); this.yaw = 0;
      this.state = 'rise'; this.stT = 0; this.cd = 2;
      this.light = { pos: this.pos.clone(), color: '#a040ff', intensity: 10, range: 22, flame: 0, emit: false, ph: 0, prio: 5 };
      world.lightSources.push(this.light);
      G.ui.toast('👑 深淵の王が玉座から立ち上がる……', 'warn');
    }
    phaseText() {
      if (this.state === 'transform') return '⚠ ……深淵が脈打つ';
      if (this.form === 1) return this.hp < this.maxHp * 0.5 ? '👑 王冠の宝石が弱点 — 激昂' : '👑 王冠の宝石が弱点 — 薙ぎ払いはジャンプ、叩きつけの波もジャンプ';
      const a = this.anchors.filter((x) => x.alive).length;
      if (a) return `🔮 深淵の帳：楔 残り${a} — 楔を壊すまで化身へのダメージ大幅軽減`;
      const ec = this.echoes.filter((e) => e.alive).length;
      const nx = `次の帳まで ${Math.max(0, Math.ceil(this.anchorT || 0))}秒`;
      return (this.form === 3 ? '☠ 終焉 — 紫の壁の内側で戦え' : '👁 胸の核が弱点') + `・${nx}` + (ec ? `・👻 残響${ec}体（砕くと化身にダメージ）` : '');
    }
    // --------------------------------------------------------- update
    update(dt) {
      if (this.dead) return this.updateFinalDeath(dt);
      this.t += dt;
      updateWaves(this, dt);
      if (this.state === 'transform') { this.updateTransform(dt); return this.post(dt); }
      if (this.form === 1) this.updateKing(dt); else this.updateAvatar(dt);
      this.post(dt);
    }
    post(dt) {
      // the king never falls: he stays on the island, off the rim and out of the holes
      const w = this.world, c = w.arenaCenter;
      if (w.voidR) {
        const dx = this.pos.x - c.x, dz = this.pos.z - c.z, L = Math.hypot(dx, dz), lim = w.voidR - 4;
        if (L > lim) { this.pos.x = c.x + dx / L * lim; this.pos.z = c.z + dz / L * lim; }
        for (const h of w.voidHoles || []) { const hx = this.pos.x - h.x, hz = this.pos.z - h.z, hl = Math.hypot(hx, hz), need = h.r + 2.5; if (hl < need) { const k = hl > 0.01 ? need / hl : 1; this.pos.x = h.x + (hl > 0.01 ? hx : 1) * k; this.pos.z = h.z + (hl > 0.01 ? hz : 0) * k; } }
        if (this.form === 1) this.pos.y = 0;
      }
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
      // ambience: rune circle, rising void motes, crown halo, heavy footfalls
      if (this.rune) {
        this.rune.position.set(this.pos.x, 0.06, this.pos.z); this.rune.rotation.y += dt * (this.form === 1 ? 0.6 : -0.4);
        const sc = this.form === 1 ? 1 : 2.2; this.rune.scale.setScalar(U.damp(this.rune.scale.x, sc, 2, dt));
        this.rune.children[0].material.opacity = 0.3 + Math.sin(this.t * 3) * 0.12 + (this.act ? 0.15 : 0);
      }
      const ay = this.form === 1 ? 4 : 9;
      if (Math.random() < dt * (this.form === 1 ? 18 : 30)) { const a = Math.random() * 6.28, d = U.rand(0.5, this.form === 1 ? 3 : 6); G.fx.add.spawn(this.pos.x + Math.cos(a) * d, U.rand(0, ay), this.pos.z + Math.sin(a) * d, 0, U.rand(1, 3), 0, U.rand(1, 2), 0.18, 0.02, 0.6, 0.25, 1, 0.8, 0, 0); }
      if (this.haloK) this.haloK.rotation.z += dt * 1.5;
      if (this.form === 1 && this.state === 'fight') { const st = Math.floor((this.walk || 0) / Math.PI); if (st !== this._step) { this._step = st; if (this.walk > 0.1 && !this.act) { G.sfx.explosion(this.pos, 0.25); P.addShake(0.12); G.fx.dust(this.pos, V(0, 1, 0), 0x3a2a4a, 6); } } }
      this.light.pos.copy(this.pos).add(V(0, this.form === 1 ? 6 : 9, 0));
      for (let i = this.orbs.length - 1; i >= 0; i--) { const o = this.orbs[i]; if (o.done) { this.orbs.splice(i, 1); continue; } }
      this.updateHits();
      this.bar();
    }
    bar() { G.ui.bossBar({ lv: this.level, name: this.def.name, title: this.def.title, hp: this.hp, max: this.maxHp, shield: this.shield, maxShield: this.maxShield, phase: this.phaseText() }); }
    // the crowned giant
    updateKing(dt) {
      const J = this.J;
      if (this.state === 'rise') {
        this.stT += dt;
        const k = Math.min(1, this.stT / 2.6);
        J.legs.forEach((l) => { l.hp.rotation.x = -1.3 * (1 - k); l.kn.rotation.x = 1.3 * (1 - k); });
        J.body.position.y = 4.6 - 1.6 * (1 - k);
        if (this.stT > 2.6) { this.state = 'fight'; G.sfx.monster(this.pos, 'roar', 0.35, 1.6); P.addShake(0.6); G.fx.ring(this.pos.clone().setY(0.2), 14, 0xa040ff, 0.6); }
        return;
      }
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
        this.phase = 2; G.ui.toast('👑 王が激昂した！ 近衛が召喚される', 'warn'); this.glowM.emissiveIntensity = 6;
        for (let i = 0; i < 2; i++) { const e = G.game.spawnEnemy({ near: true, elite: true, noMut: true }); if (e) { e.ignoreCount = true; e.def = Object.assign({}, e.def, { name: '王の近衛・' + e.def.name }); } }
      }
      const sp = 1 + (this.phase - 1) * 0.25 + this.loop * 0.15;
      if (!this.act) {
        this.face(P.pos, dt, 2.2);
        const d = this.playerDistH();
        if (d > 9) { this.groundMove((P.pos.x - this.pos.x) / d, (P.pos.z - this.pos.z) / d, 4.2 * sp, dt, 1.8); this.walk = (this.walk || 0) + dt * 3.5; }
        this.cd -= dt * sp;
        if (this.cd <= 0) {
          const r = Math.random();
          this.act = d < 11 && r < 0.36 ? { k: 'sweep', t: 0 } : r < 0.54 ? { k: 'slam', t: 0 } : r < 0.72 ? { k: 'blink', t: 0 } : r < 0.88 ? { k: 'orbs', t: 0 } : { k: 'gale', t: 0 };
        }
      } else this.kingAct(dt, sp);
      // limbs
      const w = this.walk || 0;
      J.legs.forEach((l, i) => { l.hp.rotation.x = Math.sin(w + i * Math.PI) * 0.35; l.kn.rotation.x = Math.max(0, -Math.sin(w + i * Math.PI)) * 0.5; });
      if (!this.act) { J.arms[1].sh.rotation.set(U.damp(J.arms[1].sh.rotation.x, -0.25, 6, dt), 0, 0); J.arms[0].sh.rotation.x = Math.sin(w) * 0.25; }
      this.gemM.emissiveIntensity = 2.5 + Math.sin(this.t * 4) * 1;
    }
    kingAct(dt, sp) {
      const a = this.act; a.t += dt * sp;
      const J = this.J, arm = J.arms[1].sh;
      const fwd = V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const end = (cd) => { this.act = null; this.cd = cd || U.rand(1.2, 2.2); this.setFade(1); };
      if (a.k === 'gale') { J.arms.forEach((ar) => { ar.sh.rotation.x = U.damp(ar.sh.rotation.x, -2.6, 6, dt); }); return this.galeAct(a, dt, end, this.pos.clone()); }
      if (a.k === 'sweep') {
        this.face(P.pos, dt, a.t < 0.7 ? 3 : 0);
        if (!a.tg) { a.tg = true; G.fx.telegraph(this.pos.clone().setY(0.02), 11, 0.95, 0xb040ff); G.ui.toastSmall('⚠ 大剣の薙ぎ払い — ジャンプで躱せ！'); G.sfx.attackWind && G.sfx.attackWind(this.pos, true); }
        if (a.t < 0.95) { arm.rotation.x = U.damp(arm.rotation.x, -1.5, 6, dt); arm.rotation.z = U.damp(arm.rotation.z, 1.3, 6, dt); return; }
        if (a.t < 1.35) { arm.rotation.z = 1.3 - (a.t - 0.95) / 0.4 * 2.8; if (Math.random() < dt * 40) { this.root.updateMatrixWorld(true); const tip = this.sword.localToWorld(V(0, 0, 6.5)); G.fx.add.spawn(tip.x, tip.y, tip.z, 0, 0, 0, 0.4, 0.3, 0.05, 0.7, 0.3, 1, 1, 0, 0); } }
        if (a.t > 1.1 && !a.hit) { a.hit = true; G.sfx.whoosh(0.9, 0.5); if (this.playerDistH() < 11.5 && P.pos.y < 1.3) { this.hurtPlayer(34, 'melee'); const d = P.pos.clone().sub(this.pos).setY(0).normalize(); P.vel.x += d.x * 12; P.vel.z += d.z * 12; P.vel.y = 5; } }
        if (a.t > 1.8) { arm.rotation.z = 0; end(); }
      } else if (a.k === 'slam') {
        if (!a.to) { a.to = this.pos.clone().addScaledVector(fwd, 6).setY(0); this.face(P.pos, 1, 99); a.to = this.pos.clone().addScaledVector(V(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 6.5).setY(0); G.fx.telegraph(a.to.clone().setY(0.02), 4.2, 1.1, 0xff3060); }
        if (a.t < 1.1) { arm.rotation.x = U.damp(arm.rotation.x, -3.0, 5, dt); J.arms[0].sh.rotation.x = U.damp(J.arms[0].sh.rotation.x, -2.6, 5, dt); return; }
        arm.rotation.x = U.damp(arm.rotation.x, -0.9, 18, dt);
        if (!a.hit) {
          a.hit = true; G.sfx.explosion(a.to, 2); G.fx.dust(a.to, V(0, 1, 0), 0x4a3a5a, 30); G.fx.decal(a.to.clone().setY(0.03), V(0, 1, 0), 'crack', 7, true); P.addShake(0.8);
          if (distH(P.pos, a.to) < 4.2 && P.pos.y < 2.5) this.hurtPlayer(40, 'aoe', a.to);
          shockwave(this, a.to, 15, 26, 22, 0xb040ff); G.ui.toastSmall('⚠ 衝撃波 — ジャンプ！');
          if (this.phase >= 2) setTimeout(() => { if (!this.dead && this.form === 1) shockwave(this, a.to, 14, 26, 22, 0xff4080); }, 1300); // the second ring used to follow 0.45 s behind, faster: no time to land and jump again
        }
        if (a.t > 2.0) end();
      } else if (a.k === 'blink') {
        if (!a.gone) { a.gone = true; G.fx.smoke(this.pos.clone().setY(3), 16, 2, 0x200830, 1, 1); G.sfx.magic(this.pos, 'dark'); this.setFade(0.08); }
        if (a.t > 0.6 && !a.at) {
          a.at = true;
          const side = P.forward().setY(0).normalize().multiplyScalar(-9).applyAxisAngle(V(0, 1, 0), U.rand(-1.2, 1.2));
          const np = P.pos.clone().add(side); np.x = U.clamp(np.x, 6, this.world.W - 6); np.z = U.clamp(np.z, 6, this.world.arenaD - 8); np.y = 0;
          if (this.world.voidR) { const cc = this.world.arenaCenter, dd = distH(np, cc), lim = this.world.voidR - 4; if (dd > lim) { np.x = cc.x + (np.x - cc.x) / dd * lim; np.z = cc.z + (np.z - cc.z) / dd * lim; } }
          this.pos.copy(np); this.face(P.pos, 1, 99); this.setFade(1);
          G.fx.smoke(this.pos.clone().setY(3), 16, 2, 0x200830, 1, 1);
          a.A = this.pos.clone().setY(0); a.B = this.pos.clone().addScaledVector(V(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 18).setY(0);
          a.B.x = U.clamp(a.B.x, 4, this.world.W - 4); a.B.z = U.clamp(a.B.z, 4, this.world.arenaD - 4);
          lineTele(a.A, a.B, 2.0, 0.85, 0xb040ff); G.ui.toastSmall('⚠ 背後から突き！');
        }
        if (a.t > 1.45 && a.t < 1.85) { const k = (a.t - 1.45) / 0.4; this.pos.copy(a.A).lerp(a.B, k); arm.rotation.x = -1.4; if (!a.hit && segDist(P.pos, a.A, this.pos) < 2.2 && P.pos.y < 3) { a.hit = true; this.hurtPlayer(32, 'melee'); } }
        if (a.t > 2.2) end();
      } else if (a.k === 'orbs') {
        J.arms[0].sh.rotation.x = U.damp(J.arms[0].sh.rotation.x, -2.8, 6, dt);
        if (!a.made) {
          a.made = true; a.list = [];
          const n = 6 + this.phase * 2;
          for (let i = 0; i < n; i++) { const m = new THREE.Mesh(PG.sph, mat('#000', { emissive: 0xa040ff, emissiveIntensity: 4 })); m.scale.setScalar(0.45); this.own(m); a.list.push(m); }
          G.sfx.magic(this.pos, 'dark');
        }
        const c = this.pos.clone().add(V(0, 7, 0));
        a.list.forEach((m, i) => { if (!m.parent) return; const an = this.t * 3 + i / a.list.length * Math.PI * 2; m.position.set(c.x + Math.cos(an) * 4, c.y + Math.sin(an * 2) * 0.6, c.z + Math.sin(an) * 4); });
        a.next = a.next ?? 1.3; a.i = a.i || 0;
        if (a.t >= a.next && a.i < a.list.length) {
          const m = a.list[a.i++]; a.next = a.t + 0.16;
          const dir = P.chestPos().sub(m.position).normalize();
          C.spawnProjectile({ kind: 'darkorb', pos: m.position.clone(), vel: dir.multiplyScalar(19), grav: 0, owner: 'enemy', dmg: 12 * this.dmgScale, radius: 0.35, attacker: this.body, life: 4 });
          G.scene.remove(m);
        }
        if (a.i >= a.list.length && a.t > a.next + 0.5) end();
      }
    }
    setFade(o) { for (const m of this.kmats) m.opacity = o; }
    // --------------------------------------------------------- the rebirth
    onPartDeath(p) {
      if (this.dead) return false;
      if (this.hp > 0) return false;
      if (this.form === 1) { this.startTransform(); return false; }
      this.kill();
      return true;
    }
    startTransform() {
      if (this.act && this.act.list) for (const m of this.act.list) G.scene.remove(m);
      this.hp = 1; this.state = 'transform'; this.stT = 0; this.act = null; this.setFade(1);
      for (const o of this.orbs) G.scene.remove(o);
      // clear the field
      for (const e of G.enemies.list) if (e.alive && !e.boss) { e.noReward = true; e.hp = 0; C.killEnemy(e, { src: 'clear', proc: true }, 0); }
      G.ui.banner('……まだだ', '— 深淵の王は、深淵そのものとなる —', true);
      G.sfx.monster(this.pos, 'roar', 0.3, 2); G.sfx.bell(); P.addShake(1);
    }
    updateTransform(dt) {
      this.stT += dt;
      const J = this.J, t = this.stT, c = this.world.arenaCenter;
      if (t < 2) {
        // kneels, the crown cracks
        J.legs.forEach((l) => { l.hp.rotation.x = U.damp(l.hp.rotation.x, -1.2, 3, dt); l.kn.rotation.x = U.damp(l.kn.rotation.x, 1.4, 3, dt); });
        J.body.position.y = U.damp(J.body.position.y, 3.1, 3, dt);
        J.arms.forEach((a) => { a.sh.rotation.x = U.damp(a.sh.rotation.x, 0.2, 3, dt); });
        if (Math.random() < dt * 10) G.fx.sparks(J.gem.getWorldPosition(V()), null, 3, 0xd060ff, 4);
      }
      if (t > 1.6 && !this._tint) { this._tint = true; G.game.tintScene && G.game.tintScene('#6a28c0', 0.4); G.fx.flash(this.pos.clone().setY(6), 0xc060ff, 120, 0.6, 60); G.sfx.thunder && G.sfx.thunder(1); }
      if (t > 1.6 && t < 5) {
        // a pillar of the void swallows him
        if (!this.pillar) { this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(2, 3.5, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x8030ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); this.pillar.position.set(this.pos.x, 30, this.pos.z); this.own(this.pillar); }
        this.pillar.material.opacity = Math.min(0.5, (t - 1.6) * 0.4) * (t > 4.2 ? Math.max(0, 1 - (t - 4.2) / 0.8) : 1);
        this.pillar.rotation.y += dt * 2;
        if (Math.random() < dt * 6) { const a = Math.random() * 6.28, d = U.rand(6, 28); const q = V(c.x + Math.cos(a) * d, 0.04, c.z + Math.sin(a) * d); G.fx.decal(q, V(0, 1, 0), 'crack', U.rand(3, 6), true); G.fx.lightning(q.clone().setY(30), q, 0xb060ff); }
        P.addShake(dt * 0.6);
      }
      if (t > 2.6 && t < 4.4) { const k = (t - 2.6) / 1.8; this.kingG.scale.setScalar(Math.max(0.01, 1 - k)); this.setFade(1 - k); if (Math.random() < dt * 30) G.fx.add.spawn(this.pos.x + U.rand(-2, 2), U.rand(1, 9), this.pos.z + U.rand(-2, 2), 0, U.rand(2, 5), 0, 1.2, 0.2, 0.05, 0.7, 0.3, 1, 1, 0, 0); }
      if (t > 3.6 && !this.avatar) this.buildAvatar();
      if (this.avatar && t < 6.2) { const k = U.clamp((t - 3.6) / 2.4, 0, 1); this.avatar.scale.setScalar(0.05 + k * 0.95); this.avatar.position.y = 9 * k; }
      if (t > 6.2) {
        if (this.pillar) { G.scene.remove(this.pillar); this.pillar = null; }
        this.kingG.visible = false;
        for (const p of [this.body, this.crownP]) { p.alive = false; p.removed = true; }
        this.form = 2; this.phase = 1; this.state = 'fight'; this.recover(3.5);
        this.def = { id: this.baseDef.id, name: '深淵の化身', title: 'AVATAR OF THE ABYSS', icon: '👁️' };
        this.maxHp = Math.round(6000 * this.hpScale); this.hp = this.maxHp;
        G.ui.banner('深淵の化身', 'AVATAR OF THE ABYSS', true);
        G.sfx.monster(this.pos, 'roar', 0.25, 2); G.sfx.bell(); P.addShake(1);
        this.anchorT = 6; this.echoT = 13; this.pos.set(c.x, 0, c.z);
      }
    }
    buildAvatar() {
      const av = this.avatar = joint(this.root, 0, 0, 0);
      const ob = mat('#0c0810', { roughness: 0.25, metalness: 0.6 });
      const crack = this.crackM = mat('#000', { emissive: 0xa040ff, emissiveIntensity: 3 });
      const eyeW = mat('#f0e8ff', { roughness: 0.2 }), iris = mat('#000', { emissive: 0xff2060, emissiveIntensity: 4 });
      this.coreM = mat('#200030', { emissive: 0xff40c0, emissiveIntensity: 4, roughness: 0.05 });
      // torso & wisp tail
      mesh(av, PG.sph, ob, 3.2, 3.8, 2.6, 0, 0, 0);
      for (let i = 0; i < 6; i++) mesh(av, PG.box, crack, 0.08, U.rand(1.5, 3.5), 0.08, U.rand(-2.2, 2.2), U.rand(-1.5, 1.5), 2.3, 0, 0, U.rand(-0.8, 0.8));
      this.tailW = mesh(av, PG.cone, mat('#1a0828', { transparent: true, opacity: 0.75, emissive: 0x300050 }), 2.4, 7, 2.4, 0, -6.5, 0, Math.PI);
      this.coreJ = joint(av, 0, 0.4, 2.3);
      this.coreMesh = mesh(this.coreJ, PG.oct, this.coreM, 0.9, 1.3, 0.9);
      // head: horned mask with three eyes
      const head = this.avHead = joint(av, 0, 4.6, 0.3);
      mesh(head, PG.box, ob, 2.0, 2.3, 1.6);
      for (const s of [-1, 1]) mesh(head, PG.cone, ob, 0.35, 3.2, 0.35, s * 1.0, 2.2, -0.2, -0.3, 0, s * 0.5);
      for (const [x, y, sc] of [[-0.55, 0.2, 0.32], [0.55, 0.2, 0.32], [0, 0.85, 0.42]]) { mesh(head, PG.sph, eyeW, sc, sc, sc * 0.6, x, y, 0.82); mesh(head, PG.sph, iris, sc * 0.45, sc * 0.45, sc * 0.3, x, y, 0.98); }
      // halo of eyes
      this.halo = joint(av, 0, 5.2, -1.6);
      mesh(this.halo, PG.torus, crack, 4.2, 4.2, 4.2);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const g = joint(this.halo, Math.cos(a) * 4.2, Math.sin(a) * 4.2, 0); mesh(g, PG.sph, eyeW, 0.42, 0.42, 0.3); mesh(g, PG.sph, iris, 0.2, 0.2, 0.15, 0, 0, 0.18); }
      // four arms
      this.avArms = [];
      for (const [sx, y, l] of [[-1, 1.6, 7], [1, 1.6, 7], [-1, -0.8, 5], [1, -0.8, 5]]) {
        const sh = joint(av, sx * 3.0, y, 0);
        mesh(sh, PG.cyl8, ob, 0.45, l, 0.45, 0, -l / 2, 0);
        const hd = joint(sh, 0, -l, 0);
        for (let k = 0; k < 4; k++) mesh(hd, PG.cone, crack, 0.12, 1.2, 0.12, -0.4 + k * 0.27, -0.6, 0.2, Math.PI, 0, 0);
        sh.rotation.z = sx * 0.6;
        this.avArms.push({ sh, sx, base: sx * 0.6 });
      }
      av.scale.setScalar(0.05);
      // damage proxies
      this.avBody = this.part({ name: '深淵の化身', hitW: [{ n: av, r: 3.2, part: 'body' }, { n: head, r: 1.4, part: 'body' }], radius: 3.3, height: 8 });
      this.avBody.dmgMul = () => 0.55 * this.shieldMul();
      this.avBody.isInvuln = () => this.state === 'transform';
      this.avCore = this.part({ name: '深淵の化身（核）', hitW: [{ n: this.coreJ, r: 1.1, part: 'head' }], radius: 1.1, height: 2 });
      this.avCore.dmgMul = () => 1.8 * this.shieldMul();
      this.avCore.isInvuln = this.avBody.isInvuln;
    }
    shieldMul() { return this.anchors.some((a) => a.alive) ? 0.12 : 1; }
    // --------------------------------------------------------- the avatar
    updateAvatar(dt) {
      const c = this.world.arenaCenter;
      const ph = this.hp / this.maxHp;
      if (this.form === 2 && ph < 0.35) { this.form = 3; this.startEnd(); }
      const sp = 1 + (this.form === 3 ? 0.35 : 0) + this.loop * 0.15;
      // drift around the centre, hovering
      const tgt = V(c.x + Math.cos(this.t * 0.25) * 6, 0, c.z + Math.sin(this.t * 0.31) * 6);
      this.pos.x = U.damp(this.pos.x, tgt.x, 0.8, dt); this.pos.z = U.damp(this.pos.z, tgt.z, 0.8, dt);
      this.face(P.pos, dt, 1.5);
      const av = this.avatar;
      av.position.y = 9 + Math.sin(this.t * 1.2) * 0.6;
      this.halo.rotation.z += dt * 0.6;
      this.avHead.rotation.x = U.damp(this.avHead.rotation.x, U.clamp((P.pos.y - 13) / 20, -0.6, 0.3), 3, dt);
      for (const a of this.avArms) a.sh.rotation.z = a.base + Math.sin(this.t * 1.4 + a.sx) * 0.2;
      this.coreM.emissiveIntensity = 3 + Math.sin(this.t * 5) * 1.5;
      this.tailW.rotation.y += dt;
      if (Math.random() < dt * 12) { const p = this.pos.clone().add(V(U.rand(-2, 2), av.position.y - U.rand(3, 9), U.rand(-2, 2))); G.fx.norm.spawn(p.x, p.y, p.z, 0, -0.5, 0, 1.6, 0.6, 1.6, 0.2, 0.05, 0.3, 0.6, 0, 1); }
      // anchors ("veil of the abyss")
      const veiled = this.anchors.some((a) => a.alive);
      if (!veiled) { this.anchorT -= dt; if (this.anchorT <= 0) this.spawnAnchors(this.form === 3 ? 4 : 3); }
      for (const an of this.anchors) if (an.alive) { an.holder.rotation.y += dt * 1.5; G.fx.beam(an.centerRef.clone(), this.coreJ.getWorldPosition(V()), 0xc060ff, 0.06, 0.05); }
      // void edge in phase 3
      if (this.form === 3) {
        const d = distH(P.pos, c);
        if (d > this.edgeR()) { this.edgeT = (this.edgeT || 0) - dt; if (this.edgeT <= 0) { this.edgeT = 0.5; this.hurtPlayer(10, 'aoe', P.pos.clone()); G.ui.tint && G.ui.tint('poison', 0.4); } }
        if (this.edgeRing) { this.edgeRing.rotation.y += dt * 0.2; this.edgeRing.material.opacity = 0.18 + Math.sin(this.t * 3) * 0.06; }
      }
      // echoes of fallen guardians
      this.echoT -= dt;
      const live = this.echoes.filter((e) => e.alive).length;
      if (this.echoT <= 0 && live < (this.form === 3 ? 2 : 1) && !veiled) { this.echoT = this.form === 3 ? 15 : 21; this.summonEcho(); }
      for (const e of this.echoes) if (e.alive) this.updateEcho(e, dt);
      this.cd -= dt * sp * (live ? 0.6 : 1);
      if (!this.act && this.cd <= 0) {
        const r = Math.random();
        if (r < 0.24) this.act = { k: 'rings', t: 0, n: 0 };
        else if (r < 0.46) this.act = { k: 'beams', t: 0 };
        else if (r < 0.64) this.act = { k: 'meteor', t: 0 };
        else if (r < 0.8) this.act = { k: 'grasp', t: 0, n: 0 };
        else if (r < 0.9) this.act = { k: 'pull', t: 0 };
        else this.act = { k: 'gale', t: 0 };
      }
      if (this.act) this.avatarAct(dt, sp);
    }
    spawnAnchors(n) {
      const c = this.world.arenaCenter;
      G.ui.toast('🔮 深淵の帳 — 楔を壊せ！ 化身への攻撃がほぼ通らない', 'warn'); G.sfx.magic(this.pos, 'dark');
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + Math.random(), d = U.rand(12, 20);
        const p = V(U.clamp(c.x + Math.cos(a) * d, 6, this.world.W - 6), 0, U.clamp(c.z + Math.sin(a) * d, 6, this.world.arenaD - 8));
        const holder = new THREE.Group(); holder.position.copy(p); this.own(holder);
        const m = new THREE.Mesh(PG.oct, mat('#200030', { emissive: 0xc060ff, emissiveIntensity: 2.5, roughness: 0.1 })); m.scale.set(0.9, 2.2, 0.9); m.position.y = 2.4; holder.add(m);
        const ring = new THREE.Mesh(PG.torus, mat('#000', { emissive: 0x8040ff, emissiveIntensity: 2 })); ring.scale.set(1.4, 1.4, 1.4); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; holder.add(ring);
        const an = this.part({ name: '深淵の楔', shared: false, hitW: [{ n: holder, r: 1.1, part: 'body', o: V(0, 2.4, 0) }], radius: 1.1, height: 4.5, showBar: true, blood: 0xc060ff });
        an.maxHp = Math.round(this.maxHp * 0.025); an.hp = an.maxHp; an.holder = holder;
        an.die = () => { an.alive = false; G.scene.remove(holder); G.fx.explosion(an.centerRef.clone(), 2.5, 0xc060ff); G.sfx.shieldBreak(an.centerRef); if (!this.anchors.some((x) => x.alive)) { this.anchorT = this.form === 3 ? 16 : 20; G.ui.toast(`💥 帳が破れた！ ${this.anchorT}秒間、核を撃ち放題！`, 'good'); G.sfx.bell(); } return false; };
        an.barPos = () => an.centerRef.clone().add(V(0, 2.8, 0));
        this.anchors.push(an);
        G.fx.lightning(p.clone().setY(30), p.clone().setY(0.1), 0xc060ff);
      }
    }
    // 虚無の烈風: a telegraphed blast of wind that hurls you away from the king — toward the edge and the void.
    // Crouching braces you (70% less), the grapple anchors you (80% less), and a pillar between you and him blocks it.
    galeAct(a, dt, end, o) {
      const WIND = 1.6;
      if (!a.warned) { a.warned = true; G.ui.toastSmall('⚠ 虚無の烈風 — しゃがんで踏ん張るか、柱の陰へ！'); G.sfx.whoosh && G.sfx.whoosh(1.4, 0.35, true); G.sfx.magic(o, 'dark'); }
      if (a.t < WIND) {
        if (Math.random() < dt * 70) { const an = Math.random() * 6.28, r = U.rand(2, 10); G.fx.norm.spawn(o.x + Math.cos(an) * r, U.rand(0.3, 2.5), o.z + Math.sin(an) * r, Math.cos(an) * 10, 0.2, Math.sin(an) * 10, 0.9, 0.2, 0.9, 0.55, 0.35, 0.85, 0.45, 0, 0.6); }
        if (!a.ring) { a.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.4, 48), new THREE.MeshBasicMaterial({ color: 0xc080ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); a.ring.rotation.x = -Math.PI / 2; a.ring.position.set(o.x, 0.1, o.z); this.own(a.ring); }
        a.ring.scale.setScalar(1 + a.t / WIND * 3);
        return;
      }
      if (!a.blown) {
        a.blown = true; if (a.ring) G.scene.remove(a.ring);
        G.fx.ring(o.clone().setY(0.2), 34, 0xc080ff, 0.7); G.fx.ring(o.clone().setY(1.5), 24, 0xe0c0ff, 0.5); G.sfx.explosion(o, 1.6); P.addShake(0.6);
        const d = P.pos.clone().sub(o).setY(0), L = d.length();
        if (L < 34 && L > 0.01 && G.world.los(o.clone().setY(1.5), P.chestPos())) {
          d.divideScalar(L);
          let k = Math.max(0.6, 1 - L / 50);
          if (P.crouching) k *= 0.3;
          if (P.grapple && P.grapple.state === 'attached') k *= 0.2;
          P.vel.x += d.x * 28 * k; P.vel.z += d.z * 28 * k; P.vel.y = Math.max(P.vel.y, 4.5 * k + 1); P.grounded = false;
          this.hurtPlayer(10, 'aoe', o);
        }
      }
      if (a.t > WIND + 0.6) end();
    }
    edgeR() { return this.world.voidR ? this.world.voidR - 8 : 29; }
    startEnd() {
      G.ui.banner('終焉', '— 世界の縁が崩れ落ちる —', true);
      G.sfx.thunder && G.sfx.thunder(1); P.addShake(0.8);
      G.game.tintScene && G.game.tintScene('#a01850', 0.2);
      const c = this.world.arenaCenter;
      const m = this.edgeRing = new THREE.Mesh(new THREE.CylinderGeometry(this.edgeR(), this.edgeR(), 14, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x6020c0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.set(c.x, 7, c.z); this.own(m);
      G.ui.toast('☠ 外周（紫の壁の外）は虚無 — 内側で戦え', 'warn');
    }
    avatarAct(dt, sp) {
      const a = this.act; a.t += dt * sp;
      const c = this.world.arenaCenter;
      const end = (cd) => { this.act = null; this.cd = cd || U.rand(1.6, 2.6); };
      const eye = () => this.avHead.getWorldPosition(V());
      if (a.k === 'gale') return this.galeAct(a, dt, end, c.clone());
      if (a.k === 'rings') {
        a.next = a.next ?? 0.3;
        const N = this.form === 3 ? 4 : 3;
        if (a.t >= a.next && a.n < N) {
          a.n++; a.next = a.t + 0.9;
          const gap = Math.random() * Math.PI * 2, cnt = 22;
          for (let i = 0; i < cnt; i++) {
            const an = i / cnt * Math.PI * 2;
            if (Math.abs(U.wrapAngle(an - gap)) < 0.45) continue;
            const dir = V(Math.cos(an), 0, Math.sin(an));
            C.spawnProjectile({ kind: 'darkorb', pos: V(this.pos.x, 1.3, this.pos.z).addScaledVector(dir, 3), vel: dir.multiplyScalar(10), grav: 0, owner: 'enemy', dmg: 14 * this.dmgScale, radius: 0.45, attacker: this.avBody, life: 5 });
          }
          G.sfx.magic(this.pos, 'dark');
          if (a.n === 1) G.ui.toastSmall('⚠ 虚無の環 — 切れ目をくぐれ（ジャンプでも越えられる）');
        }
        if (a.n >= N && a.t > a.next) end();
      } else if (a.k === 'beams') {
        const n = this.form === 3 ? 4 : 3;
        if (!a.ang) { a.ang = Math.random() * 6.28; a.dir = Math.random() < 0.5 ? 1 : -1; G.ui.toastSmall('⚠ 深淵の光線 — 柱の陰に隠れろ！'); }
        const from = eye();
        const warm = a.t < 1.2;
        if (!warm) a.ang += a.dir * dt * 0.55;
        for (let i = 0; i < n; i++) {
          const an = a.ang + i / n * Math.PI * 2;
          const to = V(c.x + Math.sin(an) * 34, 0, c.z + Math.cos(an) * 34);
          const dir = to.clone().sub(from).normalize(), L = from.distanceTo(to);
          const wh = G.world.raycast(from, dir, L); const hitP = wh ? wh.point : to;
          G.fx.beam(from, hitP, warm ? 0xc060ff : 0xff40c0, warm ? 0.04 : 0.45, 0.05);
          if (!warm) {
            // the beam's ground track: hurts only if nothing stands between the avatar's eye and you
            const pa = Math.atan2(P.pos.x - c.x, P.pos.z - c.z);
            if (Math.abs(U.wrapAngle(pa - an)) < 0.07 && P.pos.y < 3) {
              const pc = P.chestPos(), d2 = pc.clone().sub(from), l2 = d2.length();
              if (!G.world.raycast(from, d2.divideScalar(l2), l2 - 0.5)) { a.tick = (a.tick || 0) - dt; if (a.tick <= 0) { a.tick = 0.35; this.hurtPlayer(20, 'aoe', from); } }
            }
            if (Math.random() < dt * 20) G.fx.flameLick(hitP.x, hitP.y + 0.1, hitP.z, 1.5, 0xc060ff);
          }
        }
        if (a.t > 1.2 + 4.2) end();
      } else if (a.k === 'meteor') {
        if (!a.pts) {
          a.pts = []; const n = 8 + this.form * 2;
          for (let i = 0; i < n; i++) a.pts.push(P.pos.clone().add(V(U.rand(-9, 9), 0, U.rand(-9, 9))).setY(0.02));
          a.pts[0] = P.pos.clone().setY(0.02);
          for (const p of a.pts) G.fx.telegraph(p, 2.8, 1.5, 0xff40a0);
          G.ui.toastSmall('⚠ 星墜ち — 円から離れろ！');
        }
        if (a.t > 0.6 && !a.fall) { a.fall = true; for (const p of a.pts) { const from = p.clone().setY(36).add(V(U.rand(-6, 6), 0, U.rand(-6, 6))); const t = 0.9; C.spawnProjectile({ kind: 'bigfire', pos: from, vel: p.clone().sub(from).divideScalar(t), grav: 0, owner: 'enemy', dmg: 0, radius: 0.5, life: t + 0.05, attacker: this.avBody }); } }
        if (a.t > 1.5 && !a.hit) {
          a.hit = true;
          for (const p of a.pts) { G.fx.explosion(p.clone().setY(0.6), 2.8, 0xd050ff, { decal: true }); if (distH(P.pos, p) < 2.8 && P.pos.y < 3) this.hurtPlayer(26, 'aoe', p); }
          G.sfx.explosion(P.pos, 1.4); P.addShake(0.5);
        }
        if (a.t > 2) end();
      } else if (a.k === 'grasp') {
        const N = this.form === 3 ? 4 : 3;
        a.next = a.next ?? 0;
        if (a.t >= a.next && a.n < N) {
          a.n++; a.next = a.t + 1.0;
          const q = P.pos.clone().setY(0);
          G.fx.telegraph(q.clone().setY(0.02), 3.8, 1.0, 0xff3080);
          const hand = new THREE.Group(); const ob = mat('#0c0810', { roughness: 0.3, metalness: 0.5 });
          mesh(hand, PG.box, ob, 2.6, 0.8, 3.2, 0, 0, 0); for (let k = 0; k < 4; k++) mesh(hand, PG.cone, this.crackM, 0.22, 1.6, 0.22, -0.9 + k * 0.6, -0.6, 1.6, Math.PI / 2 + 0.6, 0, 0);
          hand.position.set(q.x, 22, q.z); this.own(hand);
          const h0 = performance.now();
          const iv = setInterval(() => {
            const k = (performance.now() - h0) / 1000;
            if (this.dead || k > 2.2) { clearInterval(iv); G.scene.remove(hand); return; }
            if (k < 0.85) hand.position.y = 22 - k * 4; else if (k < 1.0) hand.position.y = Math.max(0.5, 18.6 - (k - 0.85) * 120);
            else if (!hand.userData.hit) { hand.userData.hit = true; hand.position.y = 0.5; G.sfx.explosion(q, 1.5); G.fx.dust(q, V(0, 1, 0), 0x3a2a4a, 24); P.addShake(0.5); if (distH(P.pos, q) < 3.8 && P.pos.y < 3) this.hurtPlayer(32, 'aoe', q); if (this.form === 3) shockwave(this, q, 14, 14, 16, 0xff3080); }
            else hand.position.y += 0.4;
          }, 16);
        }
        if (a.n >= N && a.t > a.next + 0.6) end();
      } else if (a.k === 'pull') {
        if (!a.vx) {
          a.vx = true; G.ui.toastSmall('⚠ 深淵の渦 — 中心から離れろ！（ダッシュ）'); G.sfx.magic(c, 'dark');
          const m = a.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 4.5, 48), new THREE.MeshBasicMaterial({ color: 0x8030ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
          m.rotation.x = -Math.PI / 2; m.position.set(this.pos.x, 0.08, this.pos.z); this.own(m);
        }
        const vc = a.ring.position;
        a.ring.rotation.z += dt * 4;
        if (a.t < 4.5) {
          const d = P.pos.clone().sub(vc).setY(0), L = d.length();
          if (L > 0.5 && L < 40) { const f = 30 * (1 - Math.min(1, L / 40)) + 11; P.vel.x -= d.x / L * f * dt; P.vel.z -= d.z / L * f * dt; }
          if (L < 4.5) { a.tick = (a.tick || 0) - dt; if (a.tick <= 0) { a.tick = 0.4; this.hurtPlayer(14, 'aoe', vc); } }
          if (Math.random() < dt * 40) { const an = Math.random() * 6.28, r = U.rand(5, 24); G.fx.add.spawn(vc.x + Math.cos(an) * r, 0.4, vc.z + Math.sin(an) * r, -Math.cos(an) * r * 0.6, 0.3, -Math.sin(an) * r * 0.6, 1.2, 0.15, 0.02, 0.6, 0.2, 1, 0.8, 0, 0); }
        } else { G.scene.remove(a.ring); G.fx.explosion(vc.clone().setY(1), 5, 0xa040ff); if (distH(P.pos, vc) < 5) this.hurtPlayer(24, 'aoe', vc); end(); }
      }
    }
    // --------------------------------------------------------- echoes of the fallen guardians
    // a translucent copy of a past boss appears on the island, telegraphs ONE signature move, then fades.
    // Breaking it early cancels the move and tears 1.5% off the Avatar.
    summonEcho() {
      const pool = BS.order.filter((id) => id !== this.lastEcho && BS.CLS[id]);
      const id = U.pick(pool); this.lastEcho = id;
      const def = G.BOSS_BY_ID[id];
      const m = BS.buildModelOnly(id, this.level); if (!m) return;
      const root = m.root;
      const em = mat('#24083a', { emissive: 0xa040ff, emissiveIntensity: 1.1, transparent: true, opacity: 0.55, depthWrite: false });
      root.traverse((o) => { if (o.isMesh) { o.material = em; o.castShadow = false; } });
      const box = new THREE.Box3().setFromObject(root), h = Math.max(2, box.max.y - box.min.y);
      const sc = Math.min(1, 6 / h); root.scale.setScalar(sc);
      const c = this.world.arenaCenter, R = (this.world.voidR || 26) - 7;
      const pa = Math.atan2(P.pos.z - c.z, P.pos.x - c.x) + Math.PI + U.rand(-1, 1);
      const pos = V(c.x + Math.cos(pa) * R * U.rand(0.6, 1), 0, c.z + Math.sin(pa) * R * U.rand(0.6, 1));
      root.position.copy(pos); root.rotation.y = Math.atan2(P.pos.x - pos.x, P.pos.z - pos.z); this.own(root);
      const e = { id, def, root, em, pos, t: 0, life: 6.5, alive: true, h: h * sc };
      const part = this.part({ name: '残響・' + def.name, shared: false, hitW: [{ n: root, r: Math.max(1.2, h * sc * 0.28), part: 'body', o: V(0, h * 0.5, 0) }], radius: 1.5, height: h * sc, showBar: true, blood: 0xa040ff });
      part.maxHp = Math.round(this.maxHp * 0.025); part.hp = part.maxHp;
      part.die = () => { if (!e.alive) return false; this.endEcho(e, true); return false; };
      part.barPos = () => part.centerRef.clone().add(V(0, h * sc * 0.6, 0));
      e.part = part;
      this.echoes.push(e);
      G.fx.lightning(pos.clone().setY(40), pos.clone().setY(0.1), 0xc060ff); G.fx.smoke(pos.clone().setY(1.5), 16, 2, 0x200830, 1, 1);
      G.sfx.magic(pos, 'dark'); G.sfx.monster(pos, 'roar', 0.6, 0.7);
      G.ui.toast(`👻 残響「${def.name}」が現れた — 砕けば技を止められる`, 'warn');
    }
    endEcho(e, broken) {
      e.alive = false; e.part.alive = false; e.part.removed = true;
      if (e.tele) for (const t of e.tele) G.fx.endTelegraph && G.fx.endTelegraph(t);
      G.fx.smoke(e.pos.clone().setY(e.h * 0.5), 14, 1.6, 0x300a50, 0.8, 1);
      if (broken) {
        const v = this.maxHp * 0.015; this.hp = Math.max(1, this.hp - v);
        G.fx.explosion(e.pos.clone().setY(e.h * 0.5), 2.5, 0xc060ff); G.sfx.shieldBreak(e.pos);
        G.ui.toastSmall('💥 残響を砕いた！ 化身にダメージ');
      }
      setTimeout(() => G.scene.remove(e.root), 50);
    }
    updateEcho(e, dt) {
      e.t += dt;
      const fade = Math.min(1, e.t / 0.6) * Math.min(1, (e.life - e.t) / 0.6);
      e.em.opacity = 0.55 * Math.max(0, fade); e.em.emissiveIntensity = 0.9 + Math.sin(e.t * 8) * 0.3;
      e.root.position.y = Math.sin(e.t * 2) * 0.15;
      if (Math.random() < dt * 14) G.fx.add.spawn(e.pos.x + U.rand(-1, 1), U.rand(0, e.h), e.pos.z + U.rand(-1, 1), 0, U.rand(0.5, 1.5), 0, 1, 0.15, 0.02, 0.6, 0.25, 1, 0.8, 0, 0);
      this.echoMove(e, dt);
      if (e.t >= e.life) this.endEcho(e, false);
    }
    // one signature move per guardian: wind-up (telegraph) at ~0.8s, strike at ~2.0s
    echoMove(e, dt) {
      const T1 = 0.8, T2 = 2.0, dmg = (v) => v; // damage is scaled by hurtPlayer
      const c = this.world.arenaCenter;
      if (!e.aimed && e.t >= T1) {
        e.aimed = true; e.tele = [];
        const pp = P.pos.clone().setY(0);
        switch (e.id) {
          case 'colossus': e.tele.push(G.fx.telegraph(e.pos.clone().setY(0.02), 5, T2 - T1, 0xb040ff)); G.ui.toastSmall('⚠ 残響の衝撃波 — ジャンプ！'); break;
          case 'wyrm': case 'heart': {
            e.pts = e.id === 'wyrm' ? [pp] : Array.from({ length: 6 }, (_, i) => (i ? pp.clone().add(V(U.rand(-6, 6), 0, U.rand(-6, 6))) : pp));
            for (const p of e.pts) e.tele.push(G.fx.telegraph(p.clone().setY(0.02), e.id === 'wyrm' ? 3.4 : 2.4, T2 - T1, 0xff3080)); break;
          }
          case 'executioner': case 'drake': case 'twins': {
            const lines = [];
            const dir = pp.clone().sub(e.pos).setY(0).normalize();
            lines.push([e.pos.clone().setY(0), e.pos.clone().setY(0).addScaledVector(dir, 34)]);
            if (e.id === 'twins') { const pd = V(-dir.z, 0, dir.x); lines.push([pp.clone().addScaledVector(pd, -16), pp.clone().addScaledVector(pd, 16)]); }
            e.lines = lines; for (const [a, b] of lines) lineTele(a, b, e.id === 'drake' ? 2.6 : 2.0, T2 - T1, 0xff4060);
            break;
          }
          case 'hunter': e.aim = P.chestPos(); break;
          default: break; // archon / broodmother fire projectiles at the strike
        }
      }
      if (e.aimed && e.id === 'hunter' && !e.struck) { const m = e.pos.clone().setY(e.h * 0.7); G.fx.beam(m, e.aim, 0xff1030, 0.02, 0.04); }
      if (!e.struck && e.t >= T2) {
        e.struck = true;
        const pp = P.pos;
        switch (e.id) {
          case 'colossus': shockwave(this, e.pos.clone().setY(0), 15, 24, 24, 0xb040ff); G.sfx.explosion(e.pos, 1.2); P.addShake(0.4); break;
          case 'wyrm': case 'heart': for (const p of e.pts) { G.fx.explosion(p.clone().setY(0.6), e.id === 'wyrm' ? 3.4 : 2.4, 0xc050ff, { decal: false }); if (distH(pp, p) < (e.id === 'wyrm' ? 3.4 : 2.4) && pp.y < 3) { this.hurtPlayer(e.id === 'wyrm' ? 30 : 20, 'aoe', p); if (e.id === 'wyrm') P.vel.y = 10; } } G.sfx.explosion(e.pts[0], 1); break;
          case 'executioner': case 'drake': case 'twins':
            for (const [a, b] of e.lines) { for (let i = 0; i < 6; i++) G.fx.flameLick(a.x + (b.x - a.x) * i / 6, 0.2, a.z + (b.z - a.z) * i / 6, 2.4, 0xc050ff); if (segDist(pp, a, b) < (e.id === 'drake' ? 2.6 : 2.0) && pp.y < 3) { this.hurtPlayer(e.id === 'executioner' ? 32 : 24, 'melee', a); break; } }
            G.sfx.whoosh(0.8, 0.6); break;
          case 'hunter': {
            const m = e.pos.clone().setY(e.h * 0.7), dir = e.aim.clone().sub(m).normalize();
            const wh = G.world.raycast(m, dir, 200); G.fx.beam(m, wh ? wh.point : m.clone().addScaledVector(dir, 120), 0xffd0ff, 0.08, 0.2); G.sfx.gun('sniper', {});
            const pc = P.chestPos(), tt = pc.clone().sub(m).dot(dir);
            if (tt > 0 && (!wh || tt < wh.t) && pc.clone().sub(m.clone().addScaledVector(dir, tt)).length() < 0.9) this.hurtPlayer(30, 'ranged', m);
            break;
          }
          case 'archon': for (let k = 0; k < 2; k++) setTimeout(() => { if (this.dead) return; const n = 16, off = Math.random(); for (let i = 0; i < n; i++) { const a = (i + off) / n * Math.PI * 2, d = V(Math.cos(a), 0, Math.sin(a)); C.spawnProjectile({ kind: 'darkorb', pos: e.pos.clone().setY(1.3).addScaledVector(d, 1.5), vel: d.multiplyScalar(9), grav: 0, owner: 'enemy', dmg: 12 * this.dmgScale, radius: 0.4, attacker: this.avBody, life: 5 }); } }, k * 600); break;
          case 'broodmother': for (let i = 0; i < 5; i++) { const from = e.pos.clone().setY(2), to = P.chestPos().add(V(U.rand(-2, 2) * (i ? 1 : 0), 0, U.rand(-2, 2) * (i ? 1 : 0))); const t = Math.max(0.5, from.distanceTo(to) / 22), vel = to.clone().sub(from).divideScalar(t); vel.y += 3 * t; C.spawnProjectile({ kind: 'web', pos: from, vel, grav: 6, owner: 'enemy', dmg: 8 * this.dmgScale, radius: 0.4, life: 5, attacker: this.avBody, onHitPlayer: () => { P.st.slow = 3; } }); } break;
        }
      }
    }
    // --------------------------------------------------------- the end
    kill() {
      this.dead = true; this.deathT = 0;
      for (const p of this.parts) p.alive = false;
      if (G.Rooms2 && G.Rooms2.mercXp && G.game.run && G.game.run.merc) G.Rooms2.mercXp(20);
      G.bosses.purgeHazards(this);
      G.ui.bossBar(null);
      G.sfx.monster(this.pos, 'roar', 0.25, 2);
      G.ui.banner('深淵を制した', '— 深淵の王は、静かに崩れ落ちる —', true);
    }
    updateFinalDeath(dt) {
      this.deathT += dt;
      const av = this.avatar;
      if (av) { av.rotation.z += dt * 0.15; av.position.y -= dt * (this.deathT > 3 ? 3 : 0.4); }
      if (Math.random() < dt * 10 && this.deathT < 4.5) {
        const p = this.pos.clone().add(V(U.rand(-4, 4), U.rand(4, 14), U.rand(-4, 4)));
        G.fx.explosion(p, U.rand(2, 4), Math.random() < 0.5 ? 0xc060ff : 0xffffff, { decal: false }); G.sfx.explosion(p, 0.7);
        G.fx.beam(p, p.clone().add(V(U.rand(-20, 20), U.rand(10, 30), U.rand(-20, 20))), 0xffe0ff, 0.3, 0.3);
      }
      P.addShake(dt * 1.4);
      if (this.deathT > 5 && !this._white) { this._white = true; G.ui.whiteFlash && G.ui.whiteFlash(1); G.fx.explosion(this.pos.clone().add(V(0, 8, 0)), 14, 0xffffff); G.sfx.explosion(this.pos, 3); G.sfx.bell(); }
      if (this.deathT > 5.6) {
        this.dispose();
        BS.active = null;
        G.game.onBossDefeated(this);
        return true;
      }
      return false;
    }
    // everything the king puts into the world is tracked, so nothing (orbs, runes, hands, echoes) outlives the fight
    own(o) { G.scene.add(o); (this._own || (this._own = [])).push(o); return o; }
    extraDispose() {
      for (const o of this._own || []) G.scene.remove(o); this._own = [];
      for (const w of this.waves) G.scene.remove(w.m); this.waves.length = 0;
      for (const an of this.anchors) if (an.holder) G.scene.remove(an.holder);
      if (this.edgeRing) G.scene.remove(this.edgeRing);
      if (this.pillar) G.scene.remove(this.pillar);
      if (this.rune) G.scene.remove(this.rune);
      if (this.act && this.act.ring) G.scene.remove(this.act.ring);
      if (this.act && this.act.list) for (const m of this.act.list) G.scene.remove(m);
      for (const e of this.echoes || []) G.scene.remove(e.root);
      this.light.intensity = 0;
    }
    aoe() {}
    emp() { for (const an of this.anchors) if (an.alive) { an.hp -= an.maxHp * 0.3; if (an.hp <= 0) an.die(); } }
  }

  Object.assign(BS.CLS, { drake: Drake, abyssking: AbyssKing });
  BS.buildModelOnly = function (id, level) {
    const Cls = BS.CLS[id], def = G.BOSS_BY_ID[id]; if (!Cls || !def) return null;
    env();
    const fake = { arenaCenter: V(0, 0, 0), W: 76, D: 76, arenaD: 76, lightSources: [], bossPillars: [V(10, 0, 0), V(-10, 0, 0)], nestPos: V(0, 11, -20), throneSeat: V(0, 0, 0), mats: (G.world && G.world.mats) || {}, voidR: 0 };
    const listN = G.enemies.list.length, sceneKids = new Set(G.scene.children);
    const toast = G.ui.toast, toastS = G.ui.toastSmall; G.ui.toast = () => {}; G.ui.toastSmall = () => {};
    let b = null;
    try { b = new Cls(def, level || 5, fake); } catch (err) { console.error(err); } finally { G.ui.toast = toast; G.ui.toastSmall = toastS; }
    // undo every side effect: parts registered as enemies, extra objects dropped into the scene
    const added = G.enemies.list.splice(listN); for (const p of added) { p.alive = false; p.removed = true; }
    for (const o of G.scene.children.slice()) if (!sceneKids.has(o) && (!b || o !== b.root)) G.scene.remove(o);
    if (!b) return null;
    G.scene.remove(b.root); b.root.position.set(0, 0, 0); b.root.rotation.set(0, 0, 0);
    if (b.kingG) { b.J.body.position.y = 4.6; b.J.legs.forEach((l) => { l.hp.rotation.x = 0; l.kn.rotation.x = 0; }); }
    // the wyrm is laid out by its AI every frame; pose it as an S-curve rearing out of the ground
    if (b.segs && b.headG) {
      const pts = []; for (let i = 0; i <= b.segs.length + 1; i++) { const k = i / (b.segs.length + 1); pts.push(V(Math.sin(k * 5) * 3, Math.max(0.8, 7 - k * 9 + Math.sin(k * 3) * 1.5), -k * 20)); }
      b.headG.position.copy(pts[0]); b.headG.lookAt(pts[0].clone().add(V(0, 0.4, 2)));
      b.segs.forEach((sg, i) => { sg.position.copy(pts[i + 1]); sg.lookAt(pts[i + 2]); });
    }
    return { root: b.root, boss: b };
  };
  BS.firstArea = (id) => (id === 'abyssking' ? 50 : (BS.order.indexOf(id) + 1) * 5);
  BS.order.push('drake');
  G.BOSSES.push(
    { id: 'drake', name: '嵐翼の竜', title: 'TEMPEST DRAKE', icon: '🐉', desc: '嵐を纏う飛竜。空を旋回している間は胴体がとても硬い。両翼を撃ち抜くと墜落し、しばらく頭部が無防備になる。HP50%で雷を纏い、落雷を呼ぶ。', mech: ['飛行中は胴体ダメージ大幅軽減', '両翼の破壊で墜落（頭部が弱点）', '火炎の息（帯状）・火球・急降下', '尾の薙ぎ払い（ジャンプ）・咆哮', 'HP50%で落雷'] },
    { id: 'abyssking', name: '深淵の王', title: 'THE ABYSS KING', icon: '👑', desc: '深淵の最奥、玉座に座す王。50エリアごとに立ちはだかる最後の守護者。王冠の宝石が弱点。倒すと深淵そのものである「化身」へと姿を変える。化身は楔に守られ、光線は柱で防げる。', mech: ['第1形態：大剣の薙ぎ払い・叩きつけ・瞬間移動の突き・魔弾', '形態変化：深淵の化身', '深淵の帳（楔を壊すまでほぼ無敵）', '光線（柱で防ぐ）・星墜ち・巨腕・渦', 'HP35%で終焉（外周が虚無に）'], final: true },
  );
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));

  // ---------------- the cycle ----------------
  // a guardian every 5 areas, the Abyss King every 50; after 50 the same cycle repeats with "deeper" variants
  BS.forArea = function (area) {
    const k = Math.floor(area / 5);
    if (k <= 0) return BS.order[0];
    const i = (k - 1) % 10;
    if (i === 9) return 'abyssking';
    return BS.order[i % BS.order.length];
  };
  BS.cycleOf = (area) => Math.floor((Math.max(1, area) - 1) / 50);
  const CYCLE_NAMES = ['', '深淵の', '虚無の', '終焉の', '原初の'];
  const CYCLE_HUE = [0, 0.62, 0.33, 0.85, 0.15];
  BS.cyclePrefix = (c) => (c > 0 ? (CYCLE_NAMES[Math.min(c, CYCLE_NAMES.length - 1)] || '深淵の') + (c >= CYCLE_NAMES.length ? `${c}·` : '') : '');
  BS.cycleHue = (c) => CYCLE_HUE[c % CYCLE_HUE.length] + (c >= CYCLE_HUE.length ? 0.07 : 0);
  // recolour a boss in place: bosses build their own materials, so shifting them keeps every reference the boss animates
  // (world materials are skipped so the level is not tinted)
  BS.recolor = function (root, hue, sat, skip) {
    const done = new Set(skip || []);
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (done.has(m)) continue; done.add(m);
        if (m.color) m.color.offsetHSL(hue, sat || 0.08, 0);
        if (m.emissive) m.emissive.offsetHSL(hue, 0.1, 0);
      }
    });
  };
  // guardians are drawn from the current field's pool (see runplan.js)
  const forArea0 = BS.forArea;
  BS.forArea = function (area) { return G.Run.bossFor(area) || forArea0(area); };
  const start0 = BS.start;
  BS.start = function (id, level, world) {
    const b = start0(id, level, world);
    const cyc = BS.cycleOf(G.game.area || level);
    if (cyc > 0) {
      b.def = Object.assign({}, b.def, { name: BS.cyclePrefix(cyc) + b.def.name, title: 'DEEP ' + b.def.title });
      if (b.baseDef) b.baseDef = b.def;
      BS.recolor(b.root, BS.cycleHue(cyc), 0.08, world.mats ? Object.values(world.mats) : []);
      b.root.scale.multiplyScalar(1 + 0.08 * Math.min(3, cyc));
      b.cycle = cyc;
    }
    return b;
  };
})();
