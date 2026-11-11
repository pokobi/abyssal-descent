'use strict';
// Bosses: each has unique mechanics (weak points, invulnerable phases, terrain interaction) instead of scaled-up stats.
(function () {
  const BS = (G.bosses = { active: null });
  // A warning circle shown for 0.8 s or less (on the guardian's own clock) gets 0.2 s more before its blow lands; a longer one is left as it
  // is. (迅雷の小鬼's bolts set the line: warnings as short as those were too short to read.) Every guardian of the draw passes its short
  // warnings through this, its blow timed to the same longer wind-up.
  BS.TELE_SHORT = 0.8; BS.TELE_ADD = 0.2;
  BS.slow = (t) => (t <= BS.TELE_SHORT + 1e-6 ? t + BS.TELE_ADD : t);
  BS.GIMMICK_PCT = 0.15; // (see Boss.gimmickClear)
  const U = G.U;
  const V = G.U.V;
  let P, C, PG;
  BS.init = function () { P = G.player; C = G.combat; PG = G.Props.PG; };

  function mat(color, o) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8 }, o || {})); }
  function mesh(parent, geo, m, sx, sy, sz, x, y, z, rx, ry, rz) { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; parent.add(o); return o; }
  // (a part made and never touched again - nothing keeps hold of what this returns: such parts may be melted into one surface with
  // their neighbours on the same joint, gfx.js. A part that is moved, hidden or recoloured by itself is made with mesh())
  function smesh(parent, geo, m, sx, sy, sz, x, y, z, rx, ry, rz) { const o = mesh(parent, geo, m, sx, sy, sz, x, y, z, rx, ry, rz); o.userData.st = 1; return o; }
  function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }

  class Boss {
    constructor(def, level, world) {
      this.def = def; this.level = level; this.world = world;
      const L = Math.max(0, level - 5);
      const RN = G.Run, an = G.game.area || level;
      this.hpScale = 1.7 * (1 + 0.24 * L) * Math.pow(1.04, L) * Math.max(0.3, 1 + P.stats.enemyHp) * RN.bossHpMul(an);
      this.dmgScale = (1 + 0.08 * L) * RN.bossDmgMul(an);
      { const tk = RN.bossTierK && def && RN.bossTierK(def.id, an); if (tk) { this.hpScale *= tk.hp; this.dmgScale *= tk.dmg; } } // (away from its own depth: that depth's strength, runplan.js)
      this.loop = Math.floor((level - 1) / 25);
      this.parts = [];
      this.root = new THREE.Group();
      G.scene.add(this.root);
      this.t = 0; this.phase = 1; this.dead = false; this.deathT = 0;
      this.pos = world.arenaCenter.clone();
      this.yaw = Math.PI;
      this.act = null; this.actT = 0; this.cd = 2.5;
      this.shield = 0; this.maxShield = 0;
      this.bloodColor = 0x5a1a10;
      this.st = {};
    }
    // a damageable proxy registered in the enemy list
    part(o) {
      const boss = this;
      const p = Object.assign({
        isEnemy: true, custom: true, boss: true, alive: true, dying: false, st: {}, level: this.level, radius: 1, height: 2, flyer: true,
        def: { id: 'boss_' + this.def.id, name: o.name || this.def.name, plan: 'boss', undead: !!o.undead, big: true, flyer: true },
        hitW: [], pos: V(), centerRef: V(), lastHitT: -10, flinch: 0, bloodColor: o.blood || this.bloodColor, noReward: true, elite: false,
        maxShield: 0, shield: 0, multiPart: true, ignoreCount: true,
        update() {}, knockback() {},
        centerPos() { return this.hitW.length ? this.hitW[0].w.clone() : this.pos.clone(); },
        die() { return boss.onPartDeath(this); },
        remove() {},
      }, o);
      if (o.shared !== false) {
        Object.defineProperty(p, 'hp', { get: () => boss.hp, set: (v) => { boss.hp = v; } });
        Object.defineProperty(p, 'maxHp', { get: () => boss.maxHp });
      }
      for (const h of p.hitW) { h.w = h.w || V(); h.o = h.o || V(); }
      G.enemies.add(p);
      this.parts.push(p);
      return p;
    }
    updateHits() {
      this.root.updateMatrixWorld(true);
      for (const p of this.parts) {
        for (const h of p.hitW) if (h.n) h.w.copy(h.o).applyMatrix4(h.n.matrixWorld);
        if (p.hitW.length) { p.centerRef.copy(p.hitW[0].w); p.pos.copy(p.hitW[0].w); p.pos.y -= p.height * 0.5; }
      }
    }
    onPartDeath(p) {
      if (this.dead) return false;
      if (this.hp > 0) return false;
      this.kill();
      return true;
    }
    face(target, dt, rate) {
      const want = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
      this.yaw += U.wrapAngle(want - this.yaw) * Math.min(1, dt * (rate || 3));
    }
    groundMove(dx, dz, speed, dt, r) {
      const w = this.world;
      this.pos.x += dx * speed * dt; this.pos.z += dz * speed * dt;
      let blocked = false;
      const a = w.query(this.pos.x - r, 0.8, this.pos.z - r, this.pos.x + r, 6, this.pos.z + r);
      for (const c of a) {
        const cx = U.clamp(this.pos.x, c.x0, c.x1), cz = U.clamp(this.pos.z, c.z0, c.z1);
        const ox = this.pos.x - cx, oz = this.pos.z - cz, d = Math.hypot(ox, oz);
        if (d < r) { blocked = c; if (d > 1e-4) { this.pos.x += ox / d * (r - d); this.pos.z += oz / d * (r - d); } }
      }
      this.pos.x = U.clamp(this.pos.x, r, w.W - r); this.pos.z = U.clamp(this.pos.z, r, (w.arenaD || w.D) - r);
      return blocked;
    }
    // getting back up from a down / stun: no attack for a moment (k = the boss itself or one of its bodies)
    recover(t, k) { const o = k || this; o.act = null; o.cd = Math.max(o.cd || 0, t); this.graceT = t; G.ui.toastSmall('⏳ 体勢を立て直している…'); }
    // a blow that lands on "the player". While the guardian is aiming at the mercenary (BS.update swaps their positions) it lands on the mercenary instead;
    // an area blow that hits you also catches a mercenary standing within BS.SPLASH_R of its centre
    hurtPlayer(dmg, src, pos, elem) {
      if (this.dead) return;
      if (BS.swapMerc) { BS.hurtMerc(BS.swapMerc, dmg * this.dmgScale); return; }
      C.damagePlayer(dmg * this.dmgScale, { src: src || 'melee', attacker: this.parts[0], pos: pos || this.pos.clone(), elem });
      const mc = (src === 'aoe' || src === 'explosion') && pos && BS.mercOf();
      if (mc && Math.hypot(mc.ent.pos.x - pos.x, mc.ent.pos.z - pos.z) < BS.SPLASH_R && Math.abs(mc.ent.pos.y - pos.y) < 4) BS.hurtMerc(mc, dmg * this.dmgScale * 0.6);
    }
    playerDistH() { return Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z); }
    // every summoned gimmick of one batch broken by the player (ward-eyes, egg sacs, shadow clones, abyss wedges, crystals...): the guardian itself
    // loses GIMMICK_PCT of its max health. It never finishes the guardian off (that stays with the player's own blows, so phase changes keep working).
    // Gimmicks that already hurt it piece by piece (the colossus's cores, the heart's pylons, the drake's wings, the king's echoes, the sovereign's constructs) keep their own rule.
    gimmickClear(what, at, col) {
      if (this.dead || !(this.hp > 1)) return;
      const v = Math.min(this.hp - 1, this.maxHp * BS.GIMMICK_PCT);
      this.hp -= v;
      const p = at || (this.main && this.main.centerRef ? this.main.centerRef.clone() : this.pos.clone().setY(2));
      G.fx.explosion(p, 3, col || 0xffc060, { decal: false }); G.sfx.shieldBreak && G.sfx.shieldBreak(p);
      if (G.fx.dmgNum) G.fx.dmgNum(p, Math.round(v), 'crit'); // (the blast and the number say it: no notice in words, pokobi 2026-11-09)
      this.bar && this.bar();
    }
    kill() {
      this.dead = true; this.deathT = 0;
      for (const p of this.parts) p.alive = false;
      if (G.Rooms2 && G.Rooms2.mercXp && G.game.run && G.game.run.merc) G.Rooms2.mercXp(20); // the guardian's parts carry no reward of their own, so its XP is paid out here, once
      BS.purgeHazards(this);
      G.sfx.monster(this.pos, 'roar', 0.5, 1.2);
      G.ui.bossBar(null);
    }
    updateDeath(dt) {
      this.deathT += dt;
      if (Math.random() < dt * 8 && this.deathT < 2.5) {
        const p = this.pos.clone().add(V(U.rand(-3, 3), U.rand(1, 6), U.rand(-3, 3)));
        G.fx.explosion(p, U.rand(1.5, 3), 0xffa050, { decal: false }); G.sfx.explosion(p, 0.6);
      }
      this.root.position.y -= dt * (this.deathT > 1.5 ? 2 : 0.3);
      this.root.rotation.z += dt * 0.1;
      P.addShake(dt * 1.2);
      if (this.deathT > 3) {
        G.fx.explosion(this.pos.clone().add(V(0, 2, 0)), 8, 0xffb060);
        G.sfx.explosion(this.pos, 2.5); G.sfx.bell();
        this.dispose();
        BS.active = null;
        G.game.onBossDefeated(this);
        return true;
      }
      return false;
    }
    dispose() {
      G.scene.remove(this.root);
      for (const p of this.parts) { p.alive = false; p.removed = true; }
      if (this.extraDispose) this.extraDispose();
    }
    bar() { G.ui.bossBar({ lv: this.level, name: this.def.name, title: this.def.title, hp: this.hp, max: this.maxHp, shield: this.shield, maxShield: this.maxShield, phase: this.phaseText() }); }
    phaseText() { return ''; }
    tele(c, r, t, col) { return G.fx.telegraph(c, r, t, col); }
  }

  // ======================================================================
  // 1) SARCOPHAGUS COLOSSUS - invulnerable body, 4 soul cores, head exposed when downed
  class Colossus extends Boss {
    constructor(def, level, world) {
      super(def, level, world);
      this.maxHp = Math.round(4200 * this.hpScale); this.hp = this.maxHp;
      // (a giant of tomb-stone: its trunk a sarcophagus stood on end - a pitched lid for a breast, split down the middle about the
      // core, bound with iron straps - on a girdle of blocks; a head cut like an effigy's, a helm's brow, nose and a slit of a mouth,
      // the eyes two slots of light far back; shoulders of piled rock, arms of drums of stone banded with iron, fists with knuckles;
      // legs like the piers of a vault on plinths. Joints, cores and what a shot hits as before)
      const stone = mat('#8a8070', { map: G.Tex.tex.ashlar.map, normalMap: G.Tex.tex.ashlar.normalMap });
      const dark = mat('#4a4038', { map: G.Tex.tex.rock.map, normalMap: G.Tex.tex.rock.normalMap });
      { const rk = G.GFX && G.GFX.tex ? G.GFX.tex('rock') : null; if (rk) { dark.map = rk.map; dark.normalMap = rk.normalMap; dark.roughnessMap = rk.orm; dark.aoMap = rk.orm; dark.roughness = 1; dark.color.multiplyScalar(1.5); dark.userData.uvk = 0.45; } stone.userData.uvk = 0.5; }
      const iron = mat('#2c2a2a', { metalness: 0.8, roughness: 0.65 }), black = mat('#060505');
      const coreM = mat('#2a1000', { emissive: 0xe8601a, emissiveIntensity: 1.35, roughness: 0.2 });
      this.coreM = coreM;
      const r = this.root, D = PG.dode, I = PG.ico || PG.dode;
      const hips = joint(r, 0, 4.2, 0);
      smesh(hips, PG.box, dark, 2.6, 1.2, 1.8);
      for (let i = 0; i < 5; i++) smesh(hips, PG.box, stone, 0.5, 0.9, 0.3, (i - 2) * 0.56, -0.5, 0.92, -0.08, 0, 0);            // the girdle: tablets hung before it
      for (const sx of [-1, 1]) smesh(hips, D, dark, 0.7, 0.6, 0.8, sx * 1.25, 0.1, 0, 0.3, sx, 0);
      const torso = joint(hips, 0, 0.6, 0);
      smesh(torso, PG.box, stone, 3.4, 2.6, 2.0, 0, 1.4, -0.1);
      for (const sx of [-1, 1]) {
        smesh(torso, PG.box, stone, 1.55, 2.5, 0.5, sx * 0.93, 1.42, 0.98, 0, -sx * 0.22, 0);                                   // the lid's two pitches
        smesh(torso, PG.box, stone, 0.5, 2.9, 2.3, sx * 1.72, 1.4, -0.05);                                                      // pilasters at its corners
        smesh(torso, D, dark, 0.9, 0.7, 0.9, sx * 1.75, 2.95, -0.1, 0.4, sx * 0.7, 0);
      }
      smesh(torso, PG.box, dark, 4.2, 0.6, 2.4, 0, 2.9, 0);
      smesh(torso, PG.box, stone, 3.7, 0.35, 2.5, 0, 0.12, 0);                                                                  // the plinth it stands on
      for (const y of [0.75, 2.2]) { const st = new THREE.Mesh(PG.rbox || PG.box, iron); st.scale.set(3.75, 0.2, 2.42); st.position.set(0, y, -0.05); st.castShadow = true; torso.add(st); }
      smesh(torso, D, dark, 1.3, 0.9, 1.0, 0, 3.0, -0.75, 0.2, 0.6, 0);                                                         // the hump of the back
      const head = joint(torso, 0, 3.6, 0.3);
      smesh(head, PG.box, stone, 1.25, 1.35, 1.25, 0, 0, -0.03);
      smesh(head, PG.box, dark, 1.5, 0.3, 1.5, 0, 0.75, 0);
      smesh(head, PG.box, stone, 1.36, 0.26, 0.4, 0, 0.26, 0.56, 0.3);                                                          // brow
      smesh(head, PG.box, stone, 0.26, 0.6, 0.3, 0, -0.08, 0.68, -0.12);                                                        // nose
      smesh(head, PG.box, stone, 0.9, 0.36, 0.34, 0, -0.52, 0.56);                                                              // jaw
      for (const sx of [-1, 1]) { smesh(head, PG.box, stone, 0.3, 0.5, 0.28, sx * 0.5, -0.12, 0.58); const so = new THREE.Mesh(PG.box, black); so.scale.set(0.34, 0.2, 0.1); so.position.set(sx * 0.31, 0.08, 0.62); head.add(so); smesh(head, PG.box, coreM, 0.2, 0.05, 0.04, sx * 0.3, 0.08, 0.6); }
      { const mo = new THREE.Mesh(PG.box, black); mo.scale.set(0.5, 0.06, 0.1); mo.position.set(0, -0.36, 0.71); head.add(mo); }
      const arms = [];
      for (const s of [-1, 1]) {
        const sh = joint(torso, s * 2.3, 2.4, 0);
        smesh(sh, D, dark, 1.0, 0.9, 1.0); smesh(sh, I, dark, 0.6, 0.5, 0.6, s * 0.3, 0.55, -0.2, 0.3, s, 0);
        smesh(sh, PG.cyl8, stone, 0.5, 1.0, 0.5, 0, -0.85, 0); smesh(sh, PG.cyl8, stone, 0.46, 1.0, 0.46, 0, -1.85, 0);
        for (const y of [-1.35, -2.3]) { const b2 = new THREE.Mesh(PG.cyl8, iron); b2.scale.set(0.52, 0.14, 0.52); b2.position.set(0, y, 0); b2.castShadow = true; sh.add(b2); }
        const el = joint(sh, 0, -2.5, 0);
        smesh(el, I, dark, 0.56, 0.5, 0.56);
        smesh(el, PG.cyl8, stone, 0.45, 0.9, 0.45, 0, -0.6, 0); smesh(el, PG.cyl8, stone, 0.5, 0.8, 0.5, 0, -1.4, 0);
        { const b2 = new THREE.Mesh(PG.cyl8, iron); b2.scale.set(0.54, 0.16, 0.54); b2.position.set(0, -1.02, 0); b2.castShadow = true; el.add(b2); }
        smesh(el, D, dark, 1.0, 0.9, 1.0, 0, -2.2, 0, 0.3, 0.4, 0);
        for (let k = 0; k < 4; k++) smesh(el, I, dark, 0.3, 0.34, 0.3, (k - 1.5) * 0.42, -2.75, 0.5, 0.4, k, 0);                 // knuckles
        smesh(el, I, dark, 0.3, 0.3, 0.36, -s * 0.85, -2.2, 0.35, 0, 0.5, 0);                                                    // thumb
        arms.push({ sh, el });
      }
      const legs = [];
      for (const s of [-1, 1]) {
        const hp = joint(hips, s * 0.9, -0.4, 0);
        smesh(hp, PG.box, stone, 1.1, 1.5, 1.1, 0, -0.85, 0); smesh(hp, PG.box, stone, 1.0, 1.6, 1.0, 0, -2.75, 0);
        smesh(hp, D, dark, 0.78, 0.6, 0.8, 0, -1.75, 0.12, 0.2, 0.5, 0);                                                         // the knee
        smesh(hp, PG.box, stone, 1.3, 0.3, 1.3, 0, -3.35, 0);
        smesh(hp, PG.box, dark, 1.4, 0.5, 1.6, 0, -3.7, 0.2);
        for (let k = 0; k < 3; k++) smesh(hp, I, dark, 0.26, 0.24, 0.3, (k - 1) * 0.45, -3.78, 1.05, 0, k, 0);                   // toes
        { const b2 = new THREE.Mesh(PG.rbox || PG.box, iron); b2.scale.set(1.16, 0.16, 1.16); b2.position.set(0, -2.1, 0); b2.castShadow = true; hp.add(b2); }
        legs.push(hp);
      }
      // cores
      const corePos = [[torso, 0, 1.6, 1.12, '胸の魂核'], [torso, 0, 1.4, -1.12, '背の魂核'], [arms[0].sh, 0, 0.6, 0.5, '左肩の魂核'], [arms[1].sh, 0, 0.6, 0.5, '右肩の魂核']];
      this.cores = corePos.map(([n, x, y, z, name]) => {
        const holder = joint(n, x, y, z);
        const m = mesh(holder, PG.sph, coreM, 0.38, 0.38, 0.38);
        for (const [rx, ry] of [[0, 0], [0, Math.PI / 2], [Math.PI / 2, 0]]) { const cg = new THREE.Mesh(PG.torus, iron); cg.scale.set(0.5, 0.5, 0.4); cg.rotation.set(rx, ry, 0); cg.castShadow = true; holder.add(cg); }   // (a cage of three hoops about it)
        for (let k = 0; k < 4; k++) { const cl = new THREE.Mesh(PG.cone, iron); cl.scale.set(0.09, 0.5, 0.09); const a = k * Math.PI / 2 + 0.78; cl.position.set(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42); cl.rotation.set(Math.sin(a) * -1.3, 0, Math.cos(a) * 1.3); cl.castShadow = true; holder.add(cl); }   // (claws of iron that hold it)
        const cmax = Math.round(this.maxHp * 0.07);
        const core = this.part({ name, shared: false, hitW: [{ n: holder, r: 0.6, part: 'head' }], radius: 0.6, height: 1.2, showBar: true });
        core.hp = cmax; core.maxHp = cmax; core.mesh = m; core.holder = holder;
        core.die = () => { this.coreBroken(core); return false; };
        core.isInvuln = () => core.broken;
        core.barPos = () => core.centerRef.clone().add(V(0, 0.9, 0));
        core.def.name = name;
        return core;
      });
      this.body = this.part({ name: def.name, hitW: [{ n: torso, r: 1.05, part: 'body', o: V(-0.85, 1.3, 0) }, { n: torso, r: 1.05, part: 'body', o: V(0.85, 1.3, 0) }, { n: torso, r: 1.0, part: 'body', o: V(0, 2.5, 0) }, { n: hips, r: 1.1, part: 'body' }, { n: arms[0].el, r: 0.8, part: 'body', o: V(0, -1.2, 0) }, { n: arms[1].el, r: 0.8, part: 'body', o: V(0, -1.2, 0) }, { n: legs[0], r: 0.8, part: 'body', o: V(0, -2, 0) }, { n: legs[1], r: 0.8, part: 'body', o: V(0, -2, 0) }], radius: 2.2, height: 8 });
      this.body.isInvuln = () => true;
      this.headPart = this.part({ name: def.name + '（頭部）', hitW: [{ n: head, r: 0.9, part: 'head' }], radius: 0.9, height: 1.4 });
      this.headPart.isInvuln = () => this.state !== 'down';
      this.headPart.dmgMul = () => 2.5;
      this.J = { hips, torso, head, arms, legs };
      this.state = 'fight';
      this.pos.set(world.arenaCenter.x, 0, world.arenaCenter.z - 6);
      this.coreLight = { pos: V(), color: '#ff7a20', intensity: 20, range: 14, flame: 0, emit: false, ph: 0, prio: 5 };
      world.lightSources.push(this.coreLight);
    }
    phaseText() { const n = this.cores.filter((c) => !c.broken).length; return this.state === 'down' ? '⚠ 崩れ落ちた！ 頭部を狙え！' : `🔥 魂核 残り ${n}/4　— 本体は無敵${this.noTurnT > 0 ? '　|　⏳ 硬直中：背後へ回り込め！' : '　|　巨像は振り向くのが遅い'}`; }
    coreBroken(core) {
      if (core.broken) return;
      core.broken = true; core.mesh.visible = false;
      G.fx.explosion(core.centerRef.clone(), 2.5, 0xff7a20); G.sfx.shieldBreak(core.centerRef); G.sfx.explosion(core.centerRef, 0.8);
      this.hp -= this.maxHp * 0.1;
      G.ui.feed('🔥 魂核を破壊！', 'big');
      if (this.hp <= 0) { this.kill(); return; }
      if (this.cores.every((c) => c.broken)) { this.state = 'down'; this.downT = 9 + (this.loop ? -1 : 0); this.act = null; G.sfx.monster(this.pos, 'roar', 0.45, 1.2); G.ui.toast('巨像が崩れ落ちた！ 頭部を撃て！', 'good'); G.sfx.stoneGrind(this.pos, 1.2); }
    }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const J = this.J;
      const dh = this.playerDistH();
      if (this.state === 'down') {
        this.downT -= dt;
        J.hips.position.y = U.damp(J.hips.position.y, 1.6, 3, dt);
        J.torso.rotation.x = U.damp(J.torso.rotation.x, 0.75, 3, dt);
        for (const a of J.arms) a.sh.rotation.x = U.damp(a.sh.rotation.x, -0.6, 3, dt);
        if (this.downT <= 0) {
          this.state = 'fight'; this.phase++;
          for (const c of this.cores) { c.broken = false; c.mesh.visible = true; c.hp = c.maxHp * (0.8 + this.phase * 0.1); c.maxHp = c.hp; }
          G.sfx.stoneGrind(this.pos, 1.5); G.ui.toast(`魂核が再生した！（フェーズ${this.phase}）`, 'warn'); this.recover(3);
        }
      } else {
        J.hips.position.y = U.damp(J.hips.position.y, 4.2, 3, dt);
        J.torso.rotation.x = U.damp(J.torso.rotation.x, 0, 3, dt);
        this.noTurnT = Math.max(0, (this.noTurnT || 0) - dt);
        if (!this.act && this.noTurnT <= 0) {
          const want = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
          const maxTurn = (0.55 + (this.phase - 1) * 0.12) * dt; // a stone giant turns slowly
          this.yaw += U.clamp(U.wrapAngle(want - this.yaw), -maxTurn, maxTurn);
        }
        if (this.noTurnT > 0 && Math.random() < dt * 3) G.fx.dust(this.pos.clone().add(V(0, 0.2, 0)), V(0, 1, 0), 0x8a7a60, 2);
        this.cd -= dt * BS.tempo();
        if (!this.act) {
          if (dh > 9) { const l = dh; const b = this.groundMove((P.pos.x - this.pos.x) / l, (P.pos.z - this.pos.z) / l, 1.9 + this.phase * 0.3, dt, 2.3); this.walk = (this.walk || 0) + dt * 2.5; if (Math.sin(this.walk * 2) > 0.98) { G.sfx.rumble(0.3, 0.6); P.addShake(0.08); } }
          if (this.cd <= 0) {
            const r = Math.random();
            if (dh < 10 && r < 0.45) this.act = { k: 'sweep', t: 0 };
            else if (r < 0.75 || dh < 14) this.act = { k: 'slam', t: 0 };
            else this.act = { k: 'throw', t: 0, n: this.phase >= 2 ? 3 : 1 };
            { const xa = BS.pickX('colossus', this, dh); if (xa) this.act = xa; } // new patterns (bosses5.js)
          }
        } else this.doAct(dt);
        for (let i = 0; i < 2; i++) { J.legs[i].rotation.x = Math.sin((this.walk || 0) + i * Math.PI) * 0.25; }
      }
      // core glow pulse
      this.coreM.emissiveIntensity = 2 + Math.sin(this.t * 4) * 0.6;
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
      this.updateHits();
      const alive = this.cores.find((c) => !c.broken);
      if (alive) this.coreLight.pos.copy(alive.centerRef); else this.coreLight.pos.copy(this.headPart.centerRef);
      this.bar();
    }
    doAct(dt) {
      const a = this.act, J = this.J; a.t += dt;
      const sp = (1 + (this.phase - 1) * 0.2) * BS.tempo();
      if (a.k.startsWith('x_')) { if (BS.runX(this, a, dt)) { this.act = null; this.noTurnT = 1.6 / sp; this.cd = U.rand(1.2, 2) / sp; } return; }
      if (a.k === 'slam') {
        const wind = BS.slow(1.3 / sp);
        if (a.t < wind) { for (const ar of J.arms) ar.sh.rotation.x = -2.8 * (a.t / wind); if (!a.tele) { a.tele = this.tele(this.pos, 6, wind, 0xd06020); G.ui.toastSmall('⚠ 衝撃波 — ジャンプで回避！'); } return; }
        if (!a.hit) {
          a.hit = true;
          for (const ar of J.arms) ar.sh.rotation.x = 0.3;
          G.sfx.explosion(this.pos, 1.8); P.addShake(0.7);
          G.fx.dust(this.pos, V(0, 1, 0), 0x8a7a60, 30); G.fx.decal(this.pos.clone().setY(0.03), V(0, 1, 0), 'crack', 9, true);
          a.wave = { r: 3, mesh: null };
          a.wave.sr = G.fx.shockRing(this.pos.clone().setY(0), 0xffb070, 0.8, 34); // drawn band = tested band (fx.js)
        }
        // expanding shockwave: hits grounded players as it passes
        const w = a.wave;
        w.r += dt * 16 * sp;
        w.sr.set(w.r, Math.max(0.2, 1 - Math.max(0, w.r - 20) / 14 * 0.8));
        if (Math.random() < 0.8) { const an = Math.random() * 6.28; G.fx.dust(V(this.pos.x + Math.cos(an) * w.r, 0.1, this.pos.z + Math.sin(an) * w.r), V(0, 1, 0), 0x8a7a60, 1); }
        const d = this.playerDistH();
        if (!a.hitP && Math.abs(d - w.r) < 0.8 && P.pos.y < 0.6) { a.hitP = true; this.hurtPlayer(32, 'aoe'); P.vel.y = 6; }
        if (w.r > 34) { w.sr.dispose(); this.act = null; this.noTurnT = 2.4 / sp; this.cd = U.rand(1.5, 2.5) / sp; }
      } else if (a.k === 'sweep') {
        const wind = BS.slow(1.0 / sp);
        const arm = J.arms[1];
        if (a.t < wind) { arm.sh.rotation.z = -1.4 * (a.t / wind); arm.sh.rotation.x = -1.2; if (!a.warn) { a.warn = true; G.ui.toastSmall('⚠ 薙ぎ払い — しゃがめ！'); G.sfx.attackWind(this.pos, true); a.tele = this.tele(this.pos.clone().add(V(Math.sin(this.yaw) * 5, 0, Math.cos(this.yaw) * 5)), 6, wind, 0xd06020); } return; }
        const k = Math.min(1, (a.t - wind) / 0.5);
        arm.sh.rotation.z = -1.4 + 2.8 * k;
        if (!a.hit && k > 0.4) {
          a.hit = true; G.sfx.whoosh(0.5, 1.2);
          const d = this.playerDistH();
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          const tx = (P.pos.x - this.pos.x) / (d || 1), tz = (P.pos.z - this.pos.z) / (d || 1);
          if (d < 11 && fx * tx + fz * tz > -0.1 && !P.crouching && P.pos.y < 1.5) { this.hurtPlayer(26, 'melee'); P.vel.x += -fz * 14; P.vel.z += fx * 14; P.vel.y = 5; }
        }
        if (k >= 1) { arm.sh.rotation.z = 0; arm.sh.rotation.x = 0; this.act = null; this.noTurnT = 2.4 / sp; this.cd = U.rand(1.2, 2) / sp; }
      } else if (a.k === 'throw') {
        const wind = 0.9 / sp;
        const arm = J.arms[0];
        if (a.t < wind) { arm.sh.rotation.x = -3.0 * (a.t / wind); return; }
        arm.sh.rotation.x = 0.4;
        if (!a.done) {
          a.done = true;
          for (let i = 0; i < a.n; i++) {
            const from = this.pos.clone().add(V(0, 9, 0));
            const to = P.pos.clone().add(V(U.rand(-3, 3) * (i ? 1 : 0), 0, U.rand(-3, 3) * (i ? 1 : 0)));
            const t = 1.4 + i * 0.2; const vel = to.clone().sub(from).divideScalar(t); vel.y += 0.5 * 12 * t;
            C.spawnProjectile({ kind: 'boulder', pos: from, vel, grav: 12, owner: 'enemy', dmg: 30 * this.dmgScale, radius: 0.8, explode: 3.8, attacker: this.body, life: 4 });
            const tg = this.tele(to.clone().setY(0), 3.8, t, 0xd06020);
          }
          G.sfx.whoosh(0.6, 1.0);
        }
        if (a.t > wind + 0.6) { this.act = null; this.noTurnT = 2.4 / sp; this.cd = U.rand(1.5, 2.5) / sp; }
      }
    }
    aoe() {}
    emp() {}
  }

  // ======================================================================
  // 2) ABYSS WYRM - burrows under the arena, erupts beneath the player, only the head takes full damage
  class Wyrm extends Boss {
    constructor(def, level, world) {
      super(def, level, world);
      this.maxHp = Math.round(3800 * this.hpScale); this.hp = this.maxHp;
      const skin = mat('#4c4448', { map: G.Tex.tex.scales.map, normalMap: G.Tex.tex.scales.normalMap, roughness: 0.45 });
      const belly = mat('#74624e', { map: G.Tex.tex.scales.map, roughness: 0.6 });
      const tooth = mat('#e8e0c8', { roughness: 0.3 });
      const eye = mat('#000', { emissive: 0xffa838, emissiveIntensity: 1.3 });
      this.headG = new THREE.Group(); this.root.add(this.headG);
      // (the head carved, the body in rings each over the next: gfx.js foeGear. Where it stands, where its jaw hinges and what of it
      // can be hit are as they were; without those shapes, the ball and boxes it was)
      const GO = BS.h.gearOn, FG = G.GFX && G.GFX.foeGear, carved = !!(GO && FG && FG('wyrmhead') && FG('wyrmjaw') && FG('wyrmseg'));
      const MM = { skin, belly, tooth, eye, def: skin, bone: mat('#b0a488', { roughness: 0.62 }), maw: mat('#3a0e0c', { roughness: 0.55 }) };
      if (carved) { GO(this.headG, 'wyrmhead', MM, 0, 0, 0, 0, 0, 0, 1); this.jaw = joint(this.headG, 0, -0.5, 0.5); GO(this.jaw, 'wyrmjaw', MM, 0, 0, 0, 0, 0, 0, 1); }
      else {
        smesh(this.headG, PG.sph, skin, 1.5, 1.2, 2.0);
        smesh(this.headG, PG.box, skin, 1.6, 0.6, 1.6, 0, 0.5, 0.6);
        this.jaw = joint(this.headG, 0, -0.5, 0.5); smesh(this.jaw, PG.box, belly, 1.3, 0.4, 1.9, 0, -0.1, 0.9);
        for (let i = 0; i < 8; i++) { smesh(this.headG, PG.cone, tooth, 0.12, 0.45, 0.12, -0.9 + i * 0.26, -0.45, 1.75, Math.PI); smesh(this.jaw, PG.cone, tooth, 0.1, 0.35, 0.1, -0.8 + i * 0.23, 0.15, 1.6); }
        for (const s of [-1, 1]) { smesh(this.headG, PG.sph, eye, 0.18, 0.15, 0.1, s * 0.9, 0.5, 1.2); for (let k = 0; k < 3; k++) smesh(this.headG, PG.cone, belly, 0.15, 1.0, 0.15, s * (0.5 + k * 0.25), 0.9, -0.3 - k * 0.3, -0.8, 0, s * 0.4); }
      }
      this.segs = [];
      for (let i = 0; i < 22; i++) {
        const g = new THREE.Group(); const r = 1.35 - i * 0.04;
        if (carved) GO(g, 'wyrmseg', MM, 0, 0, 0, 0, 0, 0, [r, r, r * 0.8]);
        else { smesh(g, PG.sph, skin, r, r, r * 0.8); smesh(g, PG.cone, belly, 0.2, 0.7, 0.2, 0, r * 0.95, 0); }
        this.root.add(g); this.segs.push(g);
      }
      this.headPart = this.part({ name: def.name, hitW: [{ n: this.headG, r: 1.6, part: 'head' }], radius: 1.6, height: 2.5 });
      this.headPart.dmgMul = () => 1.2;
      this.headPart.isInvuln = () => this.state === 'under';
      this.bodyPart = this.part({ name: def.name + '（胴体）', hitW: this.segs.slice(0, 14).map((s) => ({ n: s, r: 1.1, part: 'body' })), radius: 1.2, height: 2 });
      this.bodyPart.dmgMul = () => 0.25;
      this.bodyPart.isInvuln = () => this.state === 'under';
      this.trail = [];
      this.state = 'under'; this.stateT = 2;
      this.hpos = V(world.arenaCenter.x, -6, world.arenaCenter.z);
      for (let i = 0; i < 200; i++) this.trail.push(this.hpos.clone());
      this.extraDispose = () => {};
    }
    phaseText() { return this.state === 'under' ? '🌋 地中を移動中 — 地面の揺れに注意' : '🎯 頭部が弱点（胴体はダメージ大幅軽減）'; }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt; this.stateT -= dt;
      const sp = this.hp < this.maxHp * 0.5 ? 1.35 * BS.tempo() : BS.tempo();
      if (this.hp < this.maxHp * 0.5 && this.phase === 1) { this.phase = 2; G.ui.toast('大蛇が激昂した！', 'warn'); G.sfx.monster(this.pos, 'roar', 0.4, 1.3); }
      BS.xTick(this, dt, 'wyrm'); // new patterns run alongside its dives (bosses5.js)
      if (this.state === 'under') {
        // travel under the floor toward the player
        const tx = P.pos.x, tz = P.pos.z;
        const d = Math.hypot(tx - this.hpos.x, tz - this.hpos.z);
        if (d > 0.5) { this.hpos.x += (tx - this.hpos.x) / d * 11 * sp * dt; this.hpos.z += (tz - this.hpos.z) / d * 11 * sp * dt; }
        this.hpos.y = U.damp(this.hpos.y, -5, 3, dt);
        if (Math.random() < dt * 18) G.fx.dust(V(this.hpos.x + U.rand(-1, 1), 0.05, this.hpos.z + U.rand(-1, 1)), V(0, 1, 0), 0x7a6a50, 2);
        this.rumT = (this.rumT || 0) - dt; if (this.rumT <= 0) { this.rumT = 0.6; G.sfx.monster(this.hpos.clone().setY(0), 'rumble', 0.6, 0.9); P.addShake(Math.max(0, 0.15 - d * 0.005)); }
        if (this.stateT <= 0 && d < 3) {
          this.state = 'warn'; this.stateT = BS.slow(1.1 / sp);
          this.erC = V(P.pos.x, 0, P.pos.z);
          this.tg = this.tele(this.erC, 4, this.stateT, 0xc06020);
          G.sfx.rumble(1.2, 1.0);
        }
      } else if (this.state === 'warn') {
        this.hpos.x = U.damp(this.hpos.x, this.erC.x, 6, dt); this.hpos.z = U.damp(this.hpos.z, this.erC.z, 6, dt);
        if (Math.random() < dt * 40) G.fx.dust(V(this.erC.x + U.rand(-3, 3), 0.05, this.erC.z + U.rand(-3, 3)), V(0, 1, 0), 0x7a6a50, 2);
        if (this.stateT <= 0) {
          // erupt: arc to a landing point beyond
          this.state = 'arc'; this.arcT = 0; this.arcDur = 2.4 / sp;
          this.arcS = this.erC.clone(); this.arcS.y = -3;
          const ang = Math.random() * 6.28;
          const w = this.world;
          this.arcE = V(U.clamp(this.erC.x + Math.cos(ang) * 22, 8, w.W - 8), -4, U.clamp(this.erC.z + Math.sin(ang) * 22, 8, (w.arenaD || w.D) - 8));
          this.arcH = 13;
          G.fx.debris(this.erC.clone().setY(0.3), this.world.mats.rock, 18, 0.5, 10); G.fx.dust(this.erC, V(0, 1, 0), 0x7a6a50, 30);
          G.sfx.explosion(this.erC, 1.5); G.sfx.monster(this.erC, 'roar', 0.5, 1.2); P.addShake(0.6);
          if (Math.hypot(P.pos.x - this.erC.x, P.pos.z - this.erC.z) < 4 && P.pos.y < 2.5) { this.hurtPlayer(34, 'melee'); P.vel.y = 10; }
          this.spat = 0;
        }
      } else if (this.state === 'arc') {
        this.arcT += dt / this.arcDur;
        const k = Math.min(1, this.arcT);
        this.hpos.lerpVectors(this.arcS, this.arcE, k); this.hpos.y += 4 * this.arcH * k * (1 - k);
        // acid volley at the top in phase 2
        if (this.phase >= 2 && k > 0.4 && this.spat < 3 && Math.random() < dt * 6) { this.spat++; this.spitAcid(); }
        if (k >= 1) {
          G.fx.debris(this.arcE.clone().setY(0.3), this.world.mats.rock, 12, 0.5, 8); G.fx.dust(this.arcE.clone().setY(0), V(0, 1, 0), 0x7a6a50, 20); G.sfx.explosion(this.arcE, 1);
          if (Math.random() < 0.45 || this.phase >= 2) { this.state = 'surface'; this.stateT = 3.5; this.surfaceP = this.arcE.clone(); this.surfaceP.y = 3.5; }
          else { this.state = 'under'; this.stateT = 1.5; }
        }
      } else if (this.state === 'surface') {
        // rears up out of the ground, spits acid, then dives
        const target = this.surfaceP;
        this.hpos.lerp(target, Math.min(1, dt * 3));
        this.hpos.y = target.y + Math.sin(this.t * 2) * 0.3;
        this.spitT = (this.spitT || 0) - dt;
        if (this.spitT <= 0) { this.spitT = this.phase >= 2 ? 0.6 : 1.0; this.spitAcid(); }
        if (this.stateT <= 0) { this.state = 'dive'; this.stateT = 0.8; }
      } else if (this.state === 'dive') {
        this.hpos.y -= dt * 12;
        if (this.hpos.y < -4) { this.state = 'under'; this.stateT = 2.5 / sp; G.fx.dust(this.hpos.clone().setY(0), V(0, 1, 0), 0x7a6a50, 20); }
      }
      // contact damage while exposed
      if (this.state === 'arc' || this.state === 'surface') {
        for (const s of [this.headG].concat(this.segs.slice(0, 16))) {
          const p = s.getWorldPosition(V());
          if (p.y > -0.5 && p.distanceTo(P.chestPos()) < 2.0) { this.contactT = (this.contactT || 0) - dt; if (this.contactT <= 0) { this.contactT = 0.8; this.hurtPlayer(20, 'melee'); } break; }
        }
      }
      this.pos.set(this.hpos.x, 0, this.hpos.z);
      // head orientation along motion
      const prev = this.trail[0];
      this.trail.unshift(this.hpos.clone()); this.trail.length = 200;
      const dir = this.hpos.clone().sub(prev);
      if (dir.lengthSq() > 1e-5) { const tgtQ = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), dir.normalize()); this.headG.quaternion.slerp(tgtQ, Math.min(1, dt * 8)); }
      if (this.state === 'surface') { const lk = P.chestPos().sub(this.hpos).normalize(); this.headG.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), lk), Math.min(1, dt * 5)); }
      this.headG.position.copy(this.hpos);
      this.jaw.rotation.x = 0.2 + Math.max(0, Math.sin(this.t * 3)) * 0.3 + (this.state === 'arc' ? 0.4 : 0);
      // body follows the head trail
      let k = 0, acc = 0;
      for (let i = 0; i < this.segs.length; i++) {
        const need = (i + 1) * 1.9;
        while (k < this.trail.length - 1 && acc < need) { acc += this.trail[k].distanceTo(this.trail[k + 1]); k++; }
        const p = this.trail[k];
        this.segs[i].position.copy(p);
        const nxt = this.trail[Math.max(0, k - 2)];
        this.segs[i].lookAt(nxt);
      }
      this.updateHits();
      this.bar();
    }
    spitAcid() {
      const from = this.headG.position.clone();
      const to = P.pos.clone().add(V(U.rand(-2, 2), 0, U.rand(-2, 2)));
      const t = Math.max(0.6, from.distanceTo(to) / 18);
      const vel = to.clone().sub(from).divideScalar(t); vel.y += 0.5 * 9 * t;
      C.spawnProjectile({ kind: 'acid', pos: from, vel, grav: 9, owner: 'enemy', dmg: 18 * this.dmgScale, radius: 0.5, life: 5, attacker: this.headPart, elem: 'poison', onEnd: (p) => C.zone(V(p.pos.x, Math.max(0, G.world.floorBelow(p.pos.x, p.pos.y + 0.5, p.pos.z)), p.pos.z), 3.2, 6, 'acid', 12 * this.dmgScale, { enemy: true }) });
      G.sfx.spit(from);
    }
  }

  // ======================================================================
  // 3) HUNDRED-EYED ARCHON - six orbiting ward-eyes make it immune; sweeping beams (hide behind pillars), bullet rings
  class Archon extends Boss {
    constructor(def, level, world) {
      super(def, level, world);
      this.maxHp = Math.round(3400 * this.hpScale); this.hp = this.maxHp;
      const flesh = mat('#d8c0b0', { map: G.Tex.tex.skin.map, normalMap: G.Tex.tex.skin.normalMap, roughness: 0.35 });
      const robe = mat('#3a1a3a', { map: G.Tex.tex.cloth.map, roughness: 0.9, side: THREE.DoubleSide });
      const gold = mat('#c8a050', { metalness: 1, roughness: 0.3 });
      const iris = mat('#5a1010', { roughness: 0.2 });
      const pupil = mat('#000', { emissive: 0xff3020, emissiveIntensity: 2 });
      this.body = joint(this.root, 0, 0, 0);
      smesh(this.body, PG.sph, flesh, 2.2, 2.2, 2.2);
      smesh(this.body, PG.sph, iris, 1.0, 1.0, 0.35, 0, 0, 2.0);
      this.pupilM = mesh(this.body, PG.sph, pupil, 0.4, 0.5, 0.15, 0, 0, 2.25);
      smesh(this.body, PG.torus, gold, 2.6, 2.6, 2.6, Math.PI / 2);
      smesh(this.body, PG.cone, robe, 2.3, 4.5, 2.3, 0, -3.0, 0, Math.PI);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; smesh(this.body, PG.sph, flesh, 0.25, 0.25, 0.25, Math.cos(a) * 1.9, Math.sin(a) * 1.9 * 0.6 + 0.6, Math.sin(a * 2) * 0.6 + 0.9); smesh(this.body, PG.sph, pupil, 0.1, 0.1, 0.08, Math.cos(a) * 1.95, Math.sin(a) * 1.9 * 0.6 + 0.6, Math.sin(a * 2) * 0.6 + 1.15); }
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; smesh(this.body, PG.cone, gold, 0.18, 1.6, 0.18, Math.cos(a) * 1.6, 2.2, Math.sin(a) * 1.6, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
      this.main = this.part({ name: def.name, hitW: [{ n: this.body, r: 2.3, part: 'body' }, { n: this.body, r: 0.9, part: 'head', o: V(0, 0, 2.0) }], radius: 2.3, height: 4.6, undead: false });
      this.main.isInvuln = () => this.wards.some((w) => w.alive) || this.teleporting;
      this.main.dmgMul = (info) => (info.head ? 1.5 : 1);
      this.wardGroup = new THREE.Group(); this.root.add(this.wardGroup);
      this.wardMat = mat('#e8d8c8', { emissive: 0x6040a0, emissiveIntensity: 0.5, roughness: 0.3 });
      this.wards = [];
      this.spawnWards();
      this.pos.set(world.arenaCenter.x, 7, world.arenaCenter.z);
      this.bubble = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0x9a7aff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.root.add(this.bubble);
      this.beam = { on: false };
      world.lightSources.push(this.light = { pos: V(), color: '#c080ff', intensity: 25, range: 22, flame: 0, emit: false, ph: 0, prio: 5, steady: true });
    }
    spawnWards() {
      for (const w of this.wards) { w.alive = false; if (w.m) this.wardGroup.remove(w.m); }
      this.wards = [];
      const hpEach = Math.round(this.maxHp * 0.045);
      for (let i = 0; i < 6; i++) {
        const holder = joint(this.wardGroup, 0, 0, 0);
        const m = mesh(holder, PG.sph, this.wardMat, 0.55, 0.55, 0.55);
        smesh(holder, PG.sph, mat('#000', { emissive: 0xc070ff, emissiveIntensity: 2 }), 0.22, 0.22, 0.1, 0, 0, 0.5);
        const w = this.part({ name: '護符眼', shared: false, hitW: [{ n: holder, r: 0.75, part: 'head' }], radius: 0.7, height: 1.2, showBar: true });
        w.hp = hpEach; w.maxHp = hpEach; w.m = holder; w.idx = i;
        w.die = () => { w.alive = false; holder.visible = false; G.fx.explosion(w.centerRef.clone(), 1.6, 0xc070ff, { decal: false }); G.sfx.shieldBreak(w.centerRef); G.ui.feed('👁 護符眼を破壊'); if (!this.wards.some((x) => x.alive)) { this.gimmickClear('護符眼', null, 0xc070ff); this.vulnT = 12; G.ui.toast('結界が消えた！ 本体を撃て！', 'good'); G.sfx.bell(); } return false; };
        w.barPos = () => w.centerRef.clone().add(V(0, 1.0, 0));
        this.wards.push(w);
      }
      this.maxShield = 6;
    }
    phaseText() { const n = this.wards.filter((w) => w.alive).length; return n ? `👁 護符眼 残り ${n}/6 — 結界で本体は無敵` : `⚠ 結界消失！ 残り ${Math.max(0, Math.ceil(this.vulnT || 0))}秒`; }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const sp = this.hp < this.maxHp * 0.5 ? 1.3 : 1;
      if (sp > 1 && this.phase === 1) { this.phase = 2; G.ui.toast('司教の眼が血走る…', 'warn'); }
      this.shield = this.wards.filter((w) => w.alive).length;
      if (!this.shield) { this.vulnT -= dt; if (this.vulnT <= 0) { this.spawnWards(); G.sfx.magic(this.pos, 'dark'); G.ui.toast('護符眼が再生した', 'warn'); } }
      this.bubble.visible = this.shield > 0;
      this.bubble.material.opacity = 0.08 + Math.sin(this.t * 3) * 0.03;
      // wards orbit
      let i = 0;
      for (const w of this.wards) { const a = this.t * 0.8 + w.idx / 6 * Math.PI * 2; w.m.position.set(Math.cos(a) * 6, Math.sin(this.t * 1.5 + w.idx) * 1.2, Math.sin(a) * 6); i++; }
      // float & look at player
      this.pos.y = 7 + Math.sin(this.t * 0.9) * 0.6;
      const look = P.chestPos().sub(this.pos);
      this.yaw = Math.atan2(look.x, look.z);
      this.body.rotation.x = -Math.atan2(look.y, Math.hypot(look.x, look.z)) * 0.8;
      this.cd -= dt * sp;
      if (!this.act && this.cd <= 0) {
        const r = Math.random();
        if (r < 0.35) this.act = { k: 'ring', t: 0, n: 0 };
        else if (r < 0.65) this.act = { k: 'beam', t: 0 };
        else if (r < 0.82 && G.enemies.aliveCount() < 12) this.act = { k: 'summon', t: 0 };
        else this.act = { k: 'teleport', t: 0 };
      }
      if (this.act) this.doAct(dt, sp);
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
      this.wardGroup.rotation.y = -this.yaw;
      this.light.pos.copy(this.pos);
      this.updateHits();
      this.bar();
    }
    doAct(dt, sp) {
      const a = this.act; a.t += dt;
      if (a.k === 'ring') {
        // three waves of slow orbs in rotating rings
        if (a.t > a.n * 0.7 && a.n < (this.phase >= 2 ? 4 : 3)) {
          a.n++;
          const N = 18 + this.phase * 4;
          for (let k = 0; k < N; k++) {
            const ang = k / N * Math.PI * 2 + a.n * 0.17;
            const dir = V(Math.cos(ang), -0.28, Math.sin(ang)).normalize();
            C.spawnProjectile({ kind: 'darkorb', pos: this.pos.clone().addScaledVector(dir, 2.5), vel: dir.multiplyScalar(9 + this.phase), owner: 'enemy', dmg: 14 * this.dmgScale, radius: 0.35, life: 7, attacker: this.main });
          }
          G.sfx.magic(this.pos, 'dark');
        }
        if (a.t > 3) { this.act = null; this.cd = 2; }
      } else if (a.k === 'beam') {
        const charge = 1.4;
        const eye = this.pos.clone();
        if (a.t < charge) {
          this.pupilM.scale.set(0.4 * (1 - a.t / charge * 0.6), 0.5, 0.15);
          if (!a.ang0) { const to = P.pos.clone().sub(eye); a.ang0 = Math.atan2(to.z, to.x) - 1.3; a.dir = Math.random() < 0.5 ? 1 : -1; if (a.dir < 0) a.ang0 += 2.6; G.ui.toastSmall('⚠ 薙ぎ払う熱線 — 柱の陰へ！'); G.sfx.rumble(1.4, 0.6); }
          const ang = a.ang0;
          const tgtP = V(eye.x + Math.cos(ang) * 30, 0.5, eye.z + Math.sin(ang) * 30);
          G.fx.beam(eye, tgtP, 0xff4020, 0.03, 0.05);
          return;
        }
        const k = (a.t - charge) / (3.2 / sp);
        const ang = a.ang0 + a.dir * k * 2.6;
        const target = V(eye.x + Math.cos(ang) * 30, 0.6, eye.z + Math.sin(ang) * 30);
        const d = target.clone().sub(eye).normalize();
        const wh = G.world.raycast(eye, d, 70);
        const L = wh ? wh.t : 70;
        const end = eye.clone().addScaledVector(d, L);
        a.ray = G.vfx.hold(a.ray, 0xff6030, 0xffe8c0); a.ray.set(eye, end, 0.65); // (radius 0.65 + the body's 0.35 = the 1 m the hit test reaches)
        if (wh && Math.random() < 0.6) { G.fx.sparks(wh.point, wh.normal, 3, 0xffa060, 6); if (Math.random() < 0.2) G.fx.decal(wh.point, wh.normal, 'scorch', 1.2); }
        // player hit test: distance from chest to beam segment
        const pc = P.chestPos().sub(eye); const tt = U.clamp(pc.dot(d), 0, L);
        if (eye.clone().addScaledVector(d, tt).distanceTo(P.chestPos()) < 1.0) { a.hitT = (a.hitT || 0) - dt; if (a.hitT <= 0) { a.hitT = 0.25; this.hurtPlayer(16, 'ranged', end, 'fire'); } }
        this.beamSnd = (this.beamSnd || 0) - dt; if (this.beamSnd <= 0) { this.beamSnd = 0.25; G.sfx.fire(end, true); }
        if (k >= 1) { this.act = null; this.cd = 2.2; this.pupilM.scale.set(0.4, 0.5, 0.15); }
      } else if (a.k === 'summon') {
        if (!a.done) {
          a.done = true;
          const def = G.ENEMY_BY_ID[this.phase >= 2 ? 'gargoyle_fire' : 'gargoyle_normal'];
          for (let i = 0; i < 3; i++) { const an = Math.random() * 6.28; G.enemies.spawn(def, Math.max(1, this.level - 1), V(this.pos.x + Math.cos(an) * 8, 3, this.pos.z + Math.sin(an) * 8), { noLoot: true }); }
          G.sfx.magic(this.pos, 'dark'); G.sfx.monster(this.pos, 'wail', 0.6, 1);
        }
        if (a.t > 1.2) { this.act = null; this.cd = 2.5; }
      } else if (a.k === 'teleport') {
        if (!a.to) {
          const w = this.world; const c = w.arenaCenter;
          const an = Math.random() * 6.28; a.to = V(c.x + Math.cos(an) * U.rand(0, 14), 7, c.z + Math.sin(an) * U.rand(0, 14));
          this.teleporting = true; G.fx.smoke(this.pos, 20, 2.5, 0x2a1a3a, 0.5, 1.2); G.sfx.magic(this.pos, 'dark');
        }
        const k = Math.min(1, a.t / 0.8);
        this.root.scale.setScalar(k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2);
        if (k >= 0.5 && !a.moved) { a.moved = true; this.pos.x = a.to.x; this.pos.z = a.to.z; G.fx.smoke(this.pos, 20, 2.5, 0x2a1a3a, 0.5, 1.2); }
        if (k >= 1) { this.root.scale.setScalar(1); this.teleporting = false; this.act = null; this.cd = 1.0; }
      }
    }
    emp(pos, r) { for (const w of this.wards) if (w.alive && w.centerRef.distanceTo(pos) < r + 2) C.damageEnemy(w, w.maxHp * 0.6, { src: 'skill', proc: true }); }
    extraDispose() {}
  }

  // ======================================================================
  // 4) CHAINED EXECUTIONER - frontal armour, charge into pillars to stun & crack it, chain pull, cleaves
  class Executioner extends Boss {
    constructor(def, level, world) {
      super(def, level, world);
      this.maxHp = Math.round(4600 * this.hpScale); this.hp = this.maxHp;
      // (a headsman grown huge: a slab of a body, the belly bare over a broad belt, a plate strapped on the breast and nothing on
      // the back - where an old wound never closed; a hood of sacking over the head with two holes cut in it, a rope about the neck;
      // bare upper arms, iron on the forearms, a great axe with a bearded blade, a length of chain hanging from the other fist;
      // an apron to the shins, iron on the legs. Joints and what a shot hits as before; the breast plate is still its own part)
      const TXg = (n) => (G.GFX && G.GFX.tex ? G.GFX.tex(n) : null), grain = (m, n, k) => { const t = TXg(n); if (t) { m.map = t.map; m.normalMap = t.normalMap; m.roughnessMap = t.orm; m.aoMap = t.orm; m.userData.uvk = k; m.color.multiplyScalar(1.3); } return m; };
      const armor = mat('#3a3a40', { map: G.Tex.tex.metal.map, normalMap: G.Tex.tex.metal.normalMap, metalness: 0.85, roughness: 0.62 }); grain(armor, 'steel', 1.2);
      const cloth = grain(mat('#3a1612', { map: G.Tex.tex.cloth.map, roughness: 0.95, side: THREE.DoubleSide }), 'weave', 2.2);
      const flesh = grain(mat('#6a4e40', { map: G.Tex.tex.skin.map, normalMap: G.Tex.tex.skin.normalMap }), 'leather', 1.2);
      const sack = grain(mat('#4a4034', { roughness: 1 }), 'weave', 2.6), hide = grain(mat('#2a1c14', { roughness: 0.85 }), 'leather', 1.5), black = mat('#060505');
      const wound = mat('#3a0000', { emissive: 0xff3010, emissiveIntensity: 1.1 });
      const steel = mat('#77777a', { metalness: 1, roughness: 0.42 });
      const GEAR = (parent, name, MM, x, y, z, rx, ry, rz, sc) => { const d = G.GFX && G.GFX.foeGear ? G.GFX.foeGear(name) : null; if (!d) return null; const g = joint(parent, x, y, z); g.rotation.set(rx || 0, ry || 0, rz || 0); if (Array.isArray(sc)) g.scale.set(sc[0], sc[1], sc[2]); else g.scale.setScalar(sc); for (const q of d) { const m = new THREE.Mesh(q.g, MM[q.m] || MM.def); m.castShadow = true; g.add(m); } return g; };
      const raw = (parent, geo, mt, sx, sy, sz, x, y, z, rx, ry, rz) => { const m = new THREE.Mesh(geo, mt); m.scale.set(sx, sy, sz); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; parent.add(m); return m; };
      this.armorM = armor;
      const r = this.root;
      const hips = joint(r, 0, 2.7, 0);
      smesh(hips, PG.sph, flesh, 0.92, 0.55, 0.66);
      raw(hips, PG.cyl8, hide, 0.95, 0.34, 0.7, 0, 0.2, 0); raw(hips, PG.rbox || PG.box, steel, 0.3, 0.3, 0.08, 0, 0.2, 0.7);         // the belt and its buckle
      if (!GEAR(hips, 'tatter', { cloth }, 0, 0.05, 0.62, 0.05, 0, 0, [9, 6.4, 4])) smesh(hips, PG.box, cloth, 1.7, 1.6, 0.05, 0, -0.9, 0.55);
      GEAR(hips, 'tatter', { cloth }, 0, 0.05, -0.62, 0.05, Math.PI, 0, [8, 4.6, 4]);
      const torso = joint(hips, 0, 0.4, 0);
      smesh(torso, PG.sph, flesh, 1.0, 0.9, 0.72, 0, 1.1, 0); smesh(torso, PG.sph, flesh, 0.92, 0.7, 0.78, 0, 0.35, 0.08);             // ribs, the belly
      smesh(torso, PG.sph, flesh, 0.9, 0.36, 0.56, 0, 1.75, -0.05); smesh(torso, PG.cyl8, flesh, 0.3, 0.5, 0.3, 0, 1.95, 0);          // the yoke of the shoulders, a bull's neck
      for (const s of [-1, 1]) smesh(torso, PG.sph, flesh, 0.45, 0.4, 0.45, s * 1.05, 1.55, 0);
      this.breast = mesh(torso, PG.sph, armor, 0.98, 0.78, 0.3, 0, 1.0, 0.56);
      for (const s of [-1, 1]) { raw(torso, PG.torus, hide, 0.86, 0.6, 0.5, s * 0.12, 1.45, 0, 0, Math.PI / 2 - s * 0.25, 0); for (const y of [0.5, 1.4]) raw(torso, PG.sph, steel, 0.06, 0.06, 0.04, s * 0.7, y, 0.78); }
      smesh(torso, PG.box, wound, 0.9, 0.9, 0.05, 0, 0.9, -0.74); raw(torso, PG.torus, black, 0.5, 0.52, 0.5, 0, 0.9, -0.72);
      for (const s of [-1, 1]) smesh(torso, PG.sph, armor, 0.6, 0.42, 0.62, s * 1.2, 1.72, 0, 0, 0, -s * 0.35);
      const head = joint(torso, 0, 2.0, 0.1);
      smesh(head, PG.sph, sack, 0.42, 0.5, 0.44, 0, 0.05, 0); smesh(head, PG.cone, sack, 0.34, 0.7, 0.34, 0, 0.62, -0.16, -0.5);       // the hood, its peak fallen back
      smesh(head, PG.cone, sack, 0.62, 0.5, 0.56, 0, -0.5, 0);                                                                         // its skirt on the shoulders
      raw(head, PG.torus, hide, 0.36, 0.36, 0.5, 0, -0.38, 0, Math.PI / 2); raw(head, PG.cyl8, hide, 0.035, 0.7, 0.035, 0.2, -0.75, 0.3);   // the rope, its end
      for (const s of [-1, 1]) { raw(head, PG.sph, black, 0.1, 0.075, 0.05, s * 0.17, 0.07, 0.38); smesh(head, PG.box, mat('#000', { emissive: 0xff3010, emissiveIntensity: 2 }), 0.07, 0.035, 0.02, s * 0.17, 0.06, 0.4); }
      const arms = [];
      for (const s of [-1, 1]) {
        const sh = joint(torso, s * 1.25, 1.5, 0);
        smesh(sh, PG.sph, flesh, 0.36, 0.42, 0.38, 0, -0.1, 0); smesh(sh, PG.sph, flesh, 0.31, 0.68, 0.34, 0, -0.72, 0);
        const el = joint(sh, 0, -1.4, 0);
        smesh(el, PG.sph, flesh, 0.25, 0.25, 0.27);
        smesh(el, PG.cyl8, armor, 0.27, 0.95, 0.29, 0, -0.6, 0); smesh(el, PG.cyl8, armor, 0.31, 0.18, 0.33, 0, -1.06, 0); smesh(el, PG.cyl8, armor, 0.31, 0.14, 0.33, 0, -0.16, 0);
        const hand = joint(el, 0, -1.35, 0);
        smesh(hand, PG.sph, flesh, 0.25, 0.27, 0.2); for (let i = 0; i < 3; i++) smesh(hand, PG.sph, flesh, 0.075, 0.2, 0.09, (i - 1) * 0.15, -0.27, 0.05);
        arms.push({ sh, el, hand });
      }
      // great axe
      const axe = joint(arms[1].hand, 0, 0, 0);
      const wood = grain(mat('#3a2618', { map: G.Tex.tex.planks.map }), 'walnut', 1.5);
      if (!GEAR(axe, 'headaxe', { wood, blade: steel, iron: armor, leather: hide }, 0, 0, 0, 0, 0, 0, 1)) { smesh(axe, PG.cyl8, wood, 0.09, 3.2, 0.09, 0, 0, 1.0, Math.PI / 2); smesh(axe, PG.box, steel, 0.08, 1.3, 1.0, 0, 0.55, 2.4); }
      // chains
      for (let i = 0; i < 8; i++) smesh(arms[0].hand, PG.torus, armor, 0.12, 0.18, 0.12, 0, -0.2 - i * 0.22, 0, 0, i % 2 ? Math.PI / 2 : 0);
      raw(arms[0].hand, PG.torus, armor, 0.22, 0.22, 0.5, 0, -2.05, 0, 0, Math.PI / 2, 0);                                              // the shackle at its end
      const legs = [];
      for (const s of [-1, 1]) {
        const hp = joint(hips, s * 0.55, -0.3, 0);
        smesh(hp, PG.sph, cloth, 0.42, 0.75, 0.46, 0, -0.6, 0);                                                                         // breeches
        smesh(hp, PG.sph, armor, 0.3, 0.3, 0.34, 0, -1.2, 0.06); smesh(hp, PG.cyl8, armor, 0.29, 1.05, 0.31, 0, -1.75, 0);
        smesh(hp, PG.box, armor, 0.62, 0.34, 0.95, 0, -2.36, 0.14); smesh(hp, PG.sph, armor, 0.3, 0.2, 0.34, 0, -2.38, 0.6);
        raw(hp, PG.cyl8, hide, 0.32, 0.1, 0.34, 0, -1.3, 0);
        legs.push(hp);
      }
      this.J = { hips, torso, head, arms, legs, axe };
      this.main = this.part({ name: def.name, hitW: [{ n: torso, r: 1.3, part: 'body', o: V(0, 0.9, 0) }, { n: head, r: 0.55, part: 'head' }, { n: hips, r: 0.9, part: 'body' }, { n: legs[0], r: 0.45, part: 'body', o: V(0, -1.2, 0) }, { n: legs[1], r: 0.45, part: 'body', o: V(0, -1.2, 0) }], radius: 1.4, height: 6 });
      this.main.dmgMul = (info, ctx) => {
        // damage depends on where the hit comes from: back wound always weak, front heavily armoured unless cracked
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const tx = P.pos.x - this.pos.x, tz = P.pos.z - this.pos.z, l = Math.hypot(tx, tz) || 1;
        const front = (fx * tx + fz * tz) / l;
        if (this.state === 'stunned') return 1.6;
        if (front < -0.3) { if (info.src === 'bullet' && Math.random() < 0.3) G.fx.dmgNum(this.main.centerRef.clone().add(V(0, 1, 0)), '弱点!', 'crit'); return 1.5; }
        if (info.src === 'explosion' || info.src === 'skill') return 0.5;
        if (front > 0.3 && info.src === 'bullet' && Math.random() < 0.25) { G.fx.sparks(info.pos || this.main.centerRef, null, 4, 0xffe0b0, 5); G.sfx.impact(this.pos, 'metal'); }
        return front > 0.3 ? 0.15 : 0.6;
      };
      this.pos.set(world.arenaCenter.x, 0, world.arenaCenter.z - 8);
      this.state = 'fight';
    }
    phaseText() { return this.state === 'stunned' ? '💫 スタン中！ 装甲が剥がれた — 総攻撃！' : '🛡 正面装甲 -85%　|　背中の傷が弱点　|　突進を柱に誘導しろ'; }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const J = this.J;
      const sp = this.hp < this.maxHp * 0.5 ? 1.3 * BS.tempo() : BS.tempo();
      if (sp > 1 && this.phase === 1) { this.phase = 2; G.ui.toast('処刑人の怒りが増した', 'warn'); G.sfx.monster(this.pos, 'roar', 0.5, 1.2); }
      const dh = this.playerDistH();
      if (this.state === 'stunned') {
        this.stunT -= dt;
        J.torso.rotation.x = U.damp(J.torso.rotation.x, 0.6, 4, dt);
        J.hips.position.y = U.damp(J.hips.position.y, 2.0, 4, dt);
        if (Math.random() < dt * 6) G.fx.sparks(J.head.getWorldPosition(V()).add(V(0, 0.8, 0)), null, 2, 0xfff0a0, 2);
        if (this.stunT <= 0) { this.state = 'fight'; this.breast.visible = true; G.sfx.monster(this.pos, 'roar', 0.5, 1); this.recover(3); }
      } else {
        J.torso.rotation.x = U.damp(J.torso.rotation.x, 0, 4, dt);
        J.hips.position.y = U.damp(J.hips.position.y, 2.7, 4, dt);
        this.cd -= dt * sp;
        if (!this.act) {
          this.face(P.pos, dt, 2.5);
          if (dh > 5) { const l = dh; this.groundMove((P.pos.x - this.pos.x) / l, (P.pos.z - this.pos.z) / l, 3.6 * sp, dt, 1.5); this.walk = (this.walk || 0) + dt * 5; }
          if (this.cd <= 0) {
            const r = Math.random();
            if (dh > 9 && r < 0.55) this.act = { k: 'charge', t: 0 };
            else if (dh > 8) this.act = { k: 'chain', t: 0 };
            else if (r < 0.5) this.act = { k: 'cleave', t: 0 };
            else this.act = { k: 'spin', t: 0 };
            { const xa = BS.pickX('executioner', this, dh); if (xa) this.act = xa; }
          }
        } else this.doAct(dt, sp);
        for (let i = 0; i < 2; i++) J.legs[i].rotation.x = Math.sin((this.walk || 0) + i * Math.PI) * 0.35;
      }
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
      this.updateHits();
      this.bar();
    }
    doAct(dt, sp) {
      const a = this.act, J = this.J; a.t += dt;
      if (a.k.startsWith('x_')) { if (BS.runX(this, a, dt)) { this.act = null; this.cd = 1.3 / sp; } return; }
      if (a.k === 'charge') {
        const wind = 1.0 / sp;
        if (a.t < wind) {
          this.face(P.pos, dt, 6);
          if (!a.tele) { G.sfx.monster(this.pos, 'roar', 0.55, 1); G.ui.toastSmall('⚠ 突進 — 柱の前へ誘導しろ！'); }
          a.tele = true;
          const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
          for (let i = 0; i < 3; i++) { const d = U.rand(2, 25); G.fx.add.spawn(this.pos.x + fx * d, 0.1, this.pos.z + fz * d, 0, 0.2, 0, 0.2, 0.4, 0.3, 1.2, 0.2, 0.1, 0.8, 0, 0); }
          J.torso.rotation.x = -0.3; return;
        }
        J.torso.rotation.x = 0.35;
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const blocked = this.groundMove(fx, fz, 21 * sp, dt, 1.5);
        this.walk = (this.walk || 0) + dt * 12;
        if (Math.random() < 0.5) G.fx.dust(this.pos, V(0, 1, 0), 0x7a6a50, 2);
        if (!a.hit && this.playerDistH() < 2.6 && P.pos.y < 3) { a.hit = true; this.hurtPlayer(38, 'melee'); P.vel.x += fx * 18; P.vel.z += fz * 18; P.vel.y = 7; }
        if (blocked && a.t > wind + 0.1) {
          // crashed into terrain: pillars stun and crack the armour
          const isPillar = blocked.x1 - blocked.x0 > 1.5 && blocked.y1 > 6;
          G.sfx.explosion(this.pos, 1.5); P.addShake(0.6); G.fx.debris(this.pos.clone().add(V(fx * 2, 3, fz * 2)), this.world.mats.block, 16, 0.4, 8);
          if (isPillar || Math.random() < 0.35) { this.state = 'stunned'; this.stunT = 5; this.breast.visible = false; G.ui.toast('処刑人が激突した！ 装甲が剥がれた！', 'good'); G.sfx.shieldBreak(this.pos); }
          this.act = null; this.cd = 2; return;
        }
        if (a.t > wind + 2.2) { this.act = null; this.cd = 1.5; }
      } else if (a.k === 'chain') {
        const wind = 0.6;
        if (a.t < wind) { J.arms[0].sh.rotation.x = -2.5 * a.t / wind; this.face(P.pos, dt, 6); return; }
        if (!a.shot) {
          a.shot = true; J.arms[0].sh.rotation.x = -1.4;
          const from = J.arms[0].hand.getWorldPosition(V());
          const dir = P.chestPos().sub(from).normalize();
          C.spawnProjectile({ kind: 'harpoon', pos: from, vel: dir.multiplyScalar(38), owner: 'enemy', dmg: 10 * this.dmgScale, radius: 0.5, life: 1.5, attacker: this.main, onHitPlayer: () => { a.pulled = 2.2; P.dragT = 0.3; G.sfx.chain(0.6, 0.8); P.addShake(0.35); G.ui.toastSmall('⛓ 鎖に捕まった！'); } });
          G.sfx.chain(0.5, 0.6);
        }
        if (a.pulled > 0) {
          a.pulled -= dt;
          const to = this.pos.clone().sub(P.pos); to.y = 0; const l = to.length();
          // caught: reeled all the way in, fast, with no control of your own — then the cleave
          if (l > 2.8) { P.vel.x = to.x / l * 36; P.vel.z = to.z / l * 36; P.vel.y = Math.max(P.vel.y, 2.5); P.dragT = 0.15; if (Math.random() < dt * 20) G.sfx.chain(0.3, 1.2); }
          else a.pulled = 0;
          if (a.pulled <= 0) { P.vel.x *= 0.2; P.vel.z *= 0.2; this.act = { k: 'cleave', t: 0 }; return; } // the whole wind-up: you were just dragged in
        }
        if (a.t > 2 && !(a.pulled > 0)) { J.arms[0].sh.rotation.x = 0; this.act = null; this.cd = 1.5; }
      } else if (a.k === 'cleave') {
        const wind = BS.slow(0.9 / sp);
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        if (!a.c) { a.c = V(this.pos.x + fx * 3.6, 0, this.pos.z + fz * 3.6); a.tg = this.tele(a.c, 3.4, wind, 0xc02010); G.sfx.attackWind(this.pos, true); }
        if (a.t < wind) { J.arms[1].sh.rotation.x = -3.0 * a.t / wind; return; }
        J.arms[1].sh.rotation.x = Math.min(0.6, -3 + (a.t - wind) * 20);
        if (!a.hit) {
          a.hit = true;
          G.sfx.explosion(a.c, 1.0); G.fx.dust(a.c, V(0, 1, 0), 0x8a7a60, 16); G.fx.decal(a.c.clone().setY(0.03), V(0, 1, 0), 'crack', 5, true); P.addShake(0.5);
          if (Math.hypot(P.pos.x - a.c.x, P.pos.z - a.c.z) < 3.4 && P.pos.y < 2) this.hurtPlayer(42, 'melee');
          if (this.phase >= 2) C.zone(a.c, 3, 4, 'fire', 10 * this.dmgScale, { enemy: true, elem: 'fire' });
        }
        if (a.t > wind + 0.8) { J.arms[1].sh.rotation.x = 0; this.act = null; this.cd = 1.2; }
      } else if (a.k === 'spin') {
        const wind = BS.slow(0.8);
        if (!a.tg) { a.tg = this.tele(this.pos, 5.5, wind, 0xc02010); G.sfx.attackWind(this.pos, true); }
        if (a.t < wind) { J.arms[1].sh.rotation.z = -1.4 * a.t / wind; return; }
        this.yaw += dt * 14; J.arms[1].sh.rotation.z = -1.4;
        this.whT = (this.whT || 0) - dt; if (this.whT <= 0) { this.whT = 0.3; G.sfx.whoosh(0.3, 1.0); }
        if (this.playerDistH() < 5.5 && P.pos.y < 2.5) { a.hitT = (a.hitT || 0) - dt; if (a.hitT <= 0) { a.hitT = 0.5; this.hurtPlayer(18, 'melee'); } }
        if (P.pos.distanceTo(this.pos) > 3) this.groundMove((P.pos.x - this.pos.x) / this.playerDistH(), (P.pos.z - this.pos.z) / this.playerDistH(), 2.5, dt, 1.5);
        if (a.t > wind + 2.2) { J.arms[1].sh.rotation.z = 0; this.act = null; this.cd = 1.4; }
      }
    }
  }

  // ======================================================================
  // 5) BROOD MOTHER - retreats to an unreachable nest laying egg sacs; abdomen weak point
  class BroodMother extends Boss {
    constructor(def, level, world) {
      super(def, level, world);
      this.maxHp = Math.round(3900 * this.hpScale); this.hp = this.maxHp;
      const chit = mat('#2a2220', { map: G.Tex.tex.scales.map, normalMap: G.Tex.tex.scales.normalMap, roughness: 0.4 });
      const mark = mat('#5a0a08', { emissive: 0xa02010, emissiveIntensity: 1.0 });
      const eye = mat('#000', { emissive: 0xc82a18, emissiveIntensity: 1.5 });
      // (carved: gfx.js foeGear. Its joints, what of it can be hit and the mark on its back are as they were)
      const GO = BS.h.gearOn, FG = G.GFX && G.GFX.foeGear, carved = !!(GO && FG && FG('broodabd') && FG('broodceph') && FG('broodfang') && FG('broodleg1') && FG('broodleg2')), MM = { chit, eye, def: chit };
      this.body = joint(this.root, 0, 2.2, 0);
      this.abd = joint(this.body, 0, 0.5, -2.2);
      if (carved) GO(this.abd, 'broodabd', MM, 0, 0, 0, 0, 0, 0, 1); else smesh(this.abd, PG.sph, chit, 2.0, 1.7, 2.4);
      this.weak = mesh(this.abd, PG.sph, mark, 0.9, 0.7, 1.0, 0, 1.3, -0.4);
      const ceph = joint(this.body, 0, 0, 0.6);
      if (carved) GO(ceph, 'broodceph', MM, 0, 0, 0, 0, 0, 0, 1);
      else { smesh(ceph, PG.sph, chit, 1.3, 1.0, 1.4); for (let i = 0; i < 8; i++) smesh(ceph, PG.sph, eye, 0.12, 0.12, 0.1, (i % 4 - 1.5) * 0.25, 0.45 + (i > 3 ? 0.2 : 0), 1.2); }
      this.fangs = [];
      for (const s of [-1, 1]) { const f = joint(ceph, s * 0.35, -0.5, 1.1); if (carved) GO(f, 'broodfang', MM, 0, -0.2, 0.15, 0, 0, s * 0.18, 1); else smesh(f, PG.cone, chit, 0.15, 0.7, 0.15, 0, -0.3, 0.1, Math.PI - 0.3); this.fangs.push(f); }
      this.legs = [];
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
        const hip = joint(this.body, s * 0.9, 0.1, 1.0 - i * 0.6); hip.rotation.y = s * (0.5 - i * 0.35) + (s < 0 ? Math.PI : 0);
        const up = joint(hip, 0, 0, 0); up.rotation.z = 0.8;
        if (carved) GO(up, 'broodleg1', MM, 0, 0, 0, 0, 0, 0, 1); else smesh(up, PG.box, chit, 2.4, 0.2, 0.2, 1.2, 0, 0);
        const kn = joint(up, 2.4, 0, 0); kn.rotation.z = -2.1;
        if (carved) GO(kn, 'broodleg2', MM, 0, 0, 0, 0, 0, 0, 1); else smesh(kn, PG.box, chit, 3.0, 0.15, 0.15, 1.5, 0, 0);
        this.legs.push({ up, hip, ph: i * 1.3 + (s > 0 ? Math.PI : 0) });
      }
      this.main = this.part({ name: def.name, hitW: [{ n: ceph, r: 1.3, part: 'body' }, { n: this.abd, r: 1.9, part: 'body' }, { n: this.abd, r: 0.9, part: 'head', o: V(0, 1.3, -0.4) }], radius: 2.5, height: 4 });
      this.main.isInvuln = () => this.state === 'nest' || this.state === 'climb' || this.state === 'drop';
      this.main.dmgMul = (info) => (info.head ? 1.6 : 0.8);
      this.pos.set(world.arenaCenter.x, 0, world.arenaCenter.z);
      this.state = 'ground'; this.groundT = 14;
      this.eggs = [];
    }
    phaseText() { const n = this.eggs.filter((e) => e.alive).length; return this.state === 'nest' ? `🕸 巣に退避中（無敵） — 卵嚢を破壊せよ！ 残り${n}` : '🎯 背中（腹部）の紋様が弱点'; }
    update(dt) {
      if (this.dead) return this.updateDeath(dt);
      this.t += dt;
      const sp = this.hp < this.maxHp * 0.5 ? 1.3 * BS.tempo() : BS.tempo();
      if (sp > 1 && this.phase === 1) { this.phase = 2; G.ui.toast('女王が狂乱した！', 'warn'); }
      const dh = this.playerDistH();
      let moving = false;
      if (this.state === 'ground') {
        this.groundT -= dt;
        this.cd -= dt * sp;
        if (!this.act) {
          this.face(P.pos, dt, 3);
          if (dh > 6) { moving = true; this.groundMove((P.pos.x - this.pos.x) / dh, (P.pos.z - this.pos.z) / dh, 5.5 * sp, dt, 2.2); }
          if (this.cd <= 0) {
            const r = Math.random();
            if (dh < 5) this.act = { k: 'bite', t: 0 };
            else if (r < 0.5) this.act = { k: 'leap', t: 0 };
            else this.act = { k: 'web', t: 0 };
            { const xa = BS.pickX('broodmother', this, dh); if (xa) this.act = xa; }
          }
        } else this.doAct(dt, sp);
        if (this.groundT <= 0 && !this.act) { this.state = 'climb'; this.stateT = 1.5; this.from = this.pos.clone(); G.sfx.monster(this.pos, 'chitter', 0.5, 1.2); G.ui.toast('女王が巣へ退避した！ 卵嚢を壊せ！', 'warn'); }
      } else if (this.state === 'climb') {
        this.stateT -= dt;
        const k = 1 - this.stateT / 1.5;
        const nest = this.world.nestPos;
        this.pos.lerpVectors(this.from, V(nest.x, 0, nest.z + 1), k);
        this.pos.y = Math.sin(k * Math.PI) * 6 + k * (nest.y - 1);
        if (this.stateT <= 0) { this.state = 'nest'; this.nestT = 16; this.layEggs(); }
      } else if (this.state === 'nest') {
        this.nestT -= dt;
        this.face(P.pos, dt, 2);
        this.webT = (this.webT || 0) - dt;
        if (this.webT <= 0) { this.webT = 2.2 / sp; this.shootWeb(1); }
        const alive = this.eggs.filter((e) => e.alive);
        for (const e of this.eggs) if (e.alive) { e.hatchT -= dt; e.holder.scale.setScalar(1 + Math.sin(this.t * 6 + e.idx) * 0.05 + (1 - e.hatchT / 10) * 0.3); if (e.hatchT <= 0) this.hatch(e); }
        if (!alive.length || this.nestT <= 0) { this.state = 'drop'; this.stateT = 1.2; this.from = this.pos.clone(); this.to = V(P.pos.x, 0, P.pos.z); this.tg = this.tele(this.to, 5, 1.2, 0xc02010); G.sfx.monster(this.pos, 'roar', 0.6, 1); }
      } else if (this.state === 'drop') {
        this.stateT -= dt;
        const k = 1 - this.stateT / 1.2;
        this.pos.lerpVectors(this.from, this.to, k); this.pos.y = this.from.y * (1 - k) + Math.sin(k * Math.PI) * 4;
        if (this.stateT <= 0) {
          this.pos.y = 0; this.state = 'ground'; this.groundT = 16 / sp; this.cd = 1.5;
          G.sfx.explosion(this.pos, 1.4); G.fx.dust(this.pos, V(0, 1, 0), 0x7a6a50, 24); P.addShake(0.6);
          if (this.playerDistH() < 5) this.hurtPlayer(36, 'aoe');
          // fail to break eggs -> remaining hatch now
          for (const e of this.eggs) if (e.alive) this.hatch(e);
        }
      }
      // legs
      for (const l of this.legs) { const s = Math.sin((this.walk || 0) * 1.5 + l.ph); l.up.rotation.z = 0.8 + Math.max(0, s) * 0.3 * (moving ? 1 : 0.2); l.hip.rotation.x = s * 0.2 * (moving ? 1 : 0.2); }
      if (moving) this.walk = (this.walk || 0) + dt * 4;
      this.fangs[0].rotation.z = 0.3 + Math.sin(this.t * 6) * 0.2; this.fangs[1].rotation.z = -this.fangs[0].rotation.z;
      this.abd.rotation.x = Math.sin(this.t * 2) * 0.05;
      this.weak.material.emissiveIntensity = 0.8 + Math.sin(this.t * 4) * 0.4;
      this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
      this.updateHits();
      this.bar();
    }
    doAct(dt, sp) {
      const a = this.act; a.t += dt;
      if (a.k.startsWith('x_')) { if (BS.runX(this, a, dt)) { this.act = null; this.cd = 1.4 / sp; } return; }
      if (a.k === 'bite') {
        if (a.t > 0.5 && !a.hit) { a.hit = true; if (this.playerDistH() < 5.5) this.hurtPlayer(26, 'melee', null, 'poison'); G.sfx.monster(this.pos, 'hiss', 0.6, 1); }
        if (a.t > 1) { this.act = null; this.cd = 1; }
      } else if (a.k === 'leap') {
        if (!a.to) { a.to = V(P.pos.x, 0, P.pos.z); a.from = this.pos.clone(); a.tg = this.tele(a.to, 5, 1.0 / sp, 0xc02010); G.sfx.monster(this.pos, 'chitter', 0.5, 1); }
        const wind = 0.4, dur = 0.8 / sp;
        if (a.t < wind) return;
        const k = Math.min(1, (a.t - wind) / dur);
        this.pos.lerpVectors(a.from, a.to, k); this.pos.y = Math.sin(k * Math.PI) * 7;
        if (k >= 1 && !a.hit) { a.hit = true; this.pos.y = 0; G.sfx.explosion(this.pos, 1.2); G.fx.dust(this.pos, V(0, 1, 0), 0x7a6a50, 20); P.addShake(0.5); if (this.playerDistH() < 5) this.hurtPlayer(32, 'aoe'); }
        if (a.t > wind + dur + 0.5) { this.act = null; this.cd = 1.2; }
      } else if (a.k === 'web') {
        if (a.t > 0.5 && !a.done) { a.done = true; this.shootWeb(this.phase >= 2 ? 5 : 3); }
        if (a.t > 1) { this.act = null; this.cd = 1.5; }
      }
    }
    shootWeb(n) {
      const from = this.pos.clone().add(V(0, 2.5, 0));
      for (let i = 0; i < n; i++) {
        const to = P.chestPos().add(V(U.rand(-2.5, 2.5) * (i ? 1 : 0), 0, U.rand(-2.5, 2.5) * (i ? 1 : 0)));
        const t = Math.max(0.5, from.distanceTo(to) / 22); const vel = to.clone().sub(from).divideScalar(t); vel.y += 0.5 * 6 * t;
        C.spawnProjectile({ kind: 'web', pos: from.clone(), vel, grav: 6, owner: 'enemy', dmg: 8 * this.dmgScale, radius: 0.4, life: 5, attacker: this.main, elem: 'web', onHitPlayer: () => { P.st.slow = 3; G.ui.tint('web', 1.5); }, onEnd: (p) => C.zone(V(p.pos.x, Math.max(0, G.world.floorBelow(p.pos.x, p.pos.y + 0.5, p.pos.z)), p.pos.z), 2.5, 7, 'web', 0, { enemy: true }) });
      }
      G.sfx.spit(from);
    }
    layEggs() {
      const n = 3 + this.phase + (this.loop ? 1 : 0);
      const c = this.world.arenaCenter, batch = []; // (this nest's sacs: all of them broken pays out, a hatched one spoils it)
      const sac = mat('#d8d0b8', { roughness: 0.6, emissive: 0x302810, transparent: true, opacity: 0.92 });
      for (let i = 0; i < n; i++) {
        const an = i / n * Math.PI * 2 + Math.random();
        const p = V(c.x + Math.cos(an) * U.rand(8, 20), 0, c.z + Math.sin(an) * U.rand(8, 20));
        const holder = new THREE.Group(); holder.position.copy(p); this.root.parent.add(holder);
        smesh(holder, PG.sph, sac, 0.8, 1.0, 0.8, 0, 0.9, 0);
        for (let k = 0; k < 4; k++) smesh(holder, PG.cyl8, sac, 0.03, 1.4, 0.03, Math.cos(k * 1.57) * 0.5, 0.6, Math.sin(k * 1.57) * 0.5, 0, 0, Math.cos(k * 1.57) * 0.6);
        const hp = Math.round(this.maxHp * 0.03);
        const egg = this.part({ name: '卵嚢', shared: false, hitW: [{ n: holder, r: 0.95, part: 'body', o: V(0, 0.9, 0) }], radius: 0.9, height: 1.8, showBar: true, blood: 0x8aa040, def: { id: 'boss_egg', name: '卵嚢', plan: 'boss', big: false, flyer: false } });
        egg.hp = hp; egg.maxHp = hp; egg.holder = holder; egg.idx = i; egg.hatchT = 10 + i * 0.5;
        egg.die = () => { egg.alive = false; egg.broken = true; holder.parent && holder.parent.remove(holder); G.fx.blood(egg.centerRef.clone(), null, 0x8aa040, 20); G.sfx.monster(egg.centerRef, 'gurgle', 1.2, 1); if (batch.every((x) => x.broken)) this.gimmickClear('卵嚢', null, 0x8aa040); return false; };
        batch.push(egg);
        egg.barPos = () => egg.centerRef.clone().add(V(0, 1.2, 0));
        this.eggs.push(egg);
        G.fx.smoke(p, 6, 1, 0x5a5040, 0.5, 1);
      }
    }
    hatch(e) {
      if (!e.alive) return;
      e.alive = false; e.holder.parent && e.holder.parent.remove(e.holder);
      const def = G.ENEMY_BY_ID[this.phase >= 2 ? 'spider_venom' : 'spider_normal'];
      for (let i = 0; i < 3; i++) G.enemies.spawn(def, Math.max(1, this.level - 2), e.centerRef.clone().setY(0).add(V(U.rand(-1, 1), 0, U.rand(-1, 1))), { scale: 0.75, noLoot: true });
      G.sfx.monster(e.centerRef, 'chitter', 1.3, 1);
    }
    extraDispose() { for (const e of this.eggs) if (e.holder && e.holder.parent) e.holder.parent.remove(e.holder); }
  }

  const CLS = (BS.CLS = { colossus: Colossus, wyrm: Wyrm, archon: Archon, executioner: Executioner, broodmother: BroodMother });
  BS.Boss = Boss; BS.h = { mat, mesh, smesh, joint, V };
  // every guardian's surfaces: the old hand-drawn hide, cloth, metal, rock and boards changed for the baked ones of gfx.js, at a
  // grain that suits a body some metres high (a material that has been given its own already is left alone)
  BS.regrainAll = function (b) {
    const GX = G.GFX, T = G.Tex && G.Tex.tex; if (!GX || !GX.tex || !T || !b || !b.root) return;
    const K = { leather: 1.3, weave: 2.2, steel: 1.2, rock: 0.5, walnut: 1.5 }, seen = new Set();
    b.root.traverse((o) => {
      const m = o.material; if (!m || Array.isArray(m) || seen.has(m) || !m.map || m.userData.regrained || m.userData.uvk) return; seen.add(m);
      const n = m.map === T.skin.map || m.map === T.scales.map ? 'leather' : m.map === T.cloth.map ? 'weave' : m.map === T.metal.map ? 'steel' : m.map === T.rock.map ? 'rock' : m.map === T.planks.map ? 'walnut' : null, t = n ? GX.tex(n) : null;
      if (!t) return;
      m.userData.regrained = true; m.userData.uvk = K[n]; m.map = t.map; m.normalMap = t.normalMap; m.roughnessMap = t.orm; m.aoMap = t.orm; if (n !== 'steel') m.roughness = 1; else m.roughness = Math.max(m.roughness, 0.55); m.color.multiplyScalar(1.3); m.needsUpdate = true;
    });
  };
  // the still parts of a guardian's body, joint by joint, into one surface each (with the full look on; made once for each shape)
  BS.melt = function (b) { if (b && b.root && G.GFX && G.GFX.fuse && G.Post && G.Post.active) { try { BS.regrainAll(b); G.GFX.fuse(b.root, {}, null, 'guardian', { still: true, free: true, round: b.meltRound || 0.28, blend: b.meltBlend || 0.022, pick: (c) => c.userData.st === 1 }); } catch (e) { /* it stays as built */ } } return b; };
  BS.order = ['colossus', 'wyrm', 'archon', 'executioner', 'broodmother'];
  BS.forArea = function (area) { return BS.order[(Math.floor(area / 5) - 1) % BS.order.length]; };
  BS.has = (id) => !!CLS[id];
  BS.start = function (id, level, world) {
    const def = G.BOSS_BY_ID[id];
    const b = new CLS[id](def, level, world);
    BS.melt(b);
    BS.active = b;
    if (G.Elem) G.Elem.bossInit(b, id);
    G.save.mark('bosses', id);
    G.sfx.monster(b.pos, 'roar', 0.45, 1.4); G.sfx.bell();
    G.player.addShake(0.5);
    return b;
  };
  // ---- the mercenary and the guardians ----
  // A guardian goes for you about nine times in ten; once in ten it picks the mercenary for a whole attack. Guardians aim with the player's position, so while one is
  // aiming at the mercenary the player's position / velocity are swapped for the mercenary's for the length of that update, and the blows (hurtPlayer) land on it.
  BS.SPLASH_R = 5;
  BS.MERC_P = 0.1;
  BS.mercOf = () => { const mc = G.Rooms2 && G.Rooms2.mercAlly; return mc && !mc.dead && mc.targetable && mc.targetable() ? mc : null; };
  BS.hurtMerc = function (mc, v) { const m = G.game.run && G.game.run.merc; const cap = m ? G.Rooms2.mercStats(m).cap : v; mc.hurt(Math.min(v, cap * 0.5)); };
  BS.update = function (dt) {
    const b = BS.active; if (!b) return;
    if (b.dead) { b.update(dt); return; }
    // the choice is made once per attack, when it begins
    const has = !!b.act;
    if (has && !b._hadAct) b.onMerc = !!BS.mercOf() && Math.random() < BS.MERC_P;
    if (!has) b.onMerc = false;
    b._hadAct = has;
    const mc = b.onMerc && BS.mercOf();
    if (!mc) { BS.swapMerc = null; b.update(dt); return; }
    const P = G.player, p0 = P.pos.clone(), v0 = P.vel.clone();
    P.pos.copy(mc.ent.pos); P.vel.set(0, 0, 0); BS.swapMerc = mc;
    try { b.update(dt); } finally { BS.swapMerc = null; P.pos.copy(p0); P.vel.copy(v0); }
  };
  // the moment a guardian falls: its creations, fields, shots, warnings and summoned minions go with it
  BS.purgeHazards = function (b) {
    C.purgeHostile();
    G.fx.clearTelegraphs();
    try { if (b && b.extraDispose) b.extraDispose(); } catch (e) { console.error(e); }
    for (const e of G.enemies.list) if (e.alive && !e.boss && e.def.id !== 'mimic_gold') { G.fx.smoke(e.centerPos(), 6, 1, 0x1a1412, 1, 1); e.noReward = true; e.hp = 0; G.combat.killEnemy(e, { src: 'clear', proc: true }, 0); }
  };
  BS.clear = function () { if (BS.active) { BS.active.dispose(); BS.active = null; } G.ui.bossBar(null); };
})();
