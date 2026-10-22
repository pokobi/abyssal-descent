'use strict';
// First-person player: movement (walk/sprint/crouch/slide/jump/mantle), grapple, pile driver, camera feel, stats.
(function () {
  // the grapple's cooldown: 15 s, shortened by the grapple-cooldown stat (never below 15% of that)
  G.GRAPPLE_CD = 15;
  G.grappleCdOf = (st) => G.GRAPPLE_CD * (1 - Math.min(0.85, Math.max(-1, st.grappleCd || 0)));
  const U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const BASE = {
    maxHp: 100, maxHpPct: 0, hpRegen: 0, armor: 0, moveSpeed: 0, jumpPower: 0, maxJumps: 1, airControl: 0,
    dmg: 0, headMul: 0, critChance: 0.05, critMul: 1.5, fireRate: 0, reloadSpeed: 0, magSize: 0, spread: 0, recoil: 0, adsSpeed: 0, range: 0,
    shieldDmg: 0, explosionDmg: 0, explosionRadius: 0, grenadeDmg: 0, skillDmg: 0, cdr: 0, elemChance: 0, burnDmg: 0, poisonDmg: 0, poisonStacks: 0, dotDmg: 0,
    lifesteal: 0, coinMul: 0, luck: 0, pickupRange: 4, dodge: 0, grappleRange: 42, grappleCd: 0, grappleSpeed: 0, slideBoost: 0, meleeDmg: 0, meleeCd: 0, meleeRange: 0, meleeMove: 0, meleeRecover: 0,
    bossDmg: 0, eliteDmg: 0, pierce: 0, ricochet: 0, doubleShot: 0, knock: 0, shopDiscount: 0, buffChoices: 3, buffRerolls: 0, weaponSlots: 2, ammoSave: 0,
    healMul: 0, enemyDmg: 0, enemySpeed: 0, enemyHp: 0, infAmmo: 0, lowGrav: 0, soulLantern: 0, adsDmg: 0, hipSpread: 0, extraChests: 0, chestBonus: 0,
    healDrop: 0, throwPow: 0, invis: 0, extraEnemies: 0, opSpeed: 0, defense: 0, weight: 0, statusRes: 0, dotRes: 0, blastRes: 0, sprintRamp: 0,
    skillCd: 0, skillRad: 0, skillDur: 0, skillCharges: 0, techBurn: 0, techFrost: 0, techShock: 0, techStun: 0, techVamp: 0, techShield: 0,
    ultDmg: 0, ultCd: 0, ultDur: 0, ultCharge: 0, ultHeal: 0, ultShield: 0, ultOver: 0, ultEcho: 0, ultTech: 0,
    pileDmg: 0, pileRadius: 0, pileCd: 0, pileFast: 0, pileFire: 0, pileShock: 0, pileFrost: 0, pileStun: 0, pileVacuum: 0, pileBounce: 0, pileShield: 0, pileHeal: 0, pileHeight: 0, pileShieldMul: 0, pileMeteor: 0,
  };
  G.PLAYER_BASE = BASE;
  G.STAT_NAMES = {
    maxHp: ['❤️', '最大HP', 'n'], armor: ['🛡️', '被ダメ軽減', 'p'], dmg: ['💪', '与ダメ', 'p'], fireRate: ['🔁', '連射', 'p'], reloadSpeed: ['♻️', 'リロード', 'p'],
    critChance: ['💢', '会心率', 'p'], critMul: ['💥', '会心ダメージ', 'cd'], headMul: ['🎯', 'HS倍率', 'p'], moveSpeed: ['👟', '移動', 'p'], hpRegen: ['💚', '再生/秒', 'n'],
    lifesteal: ['🩸', '吸血', 'p'], cdr: ['⏳', 'CT短縮', 'p'], coinMul: ['🪙', 'コイン獲得', 'p'], dodge: ['🌫️', '回避', 'p'], skillDmg: ['🔮', 'スキル', 'p'],
    explosionDmg: ['💣', '爆発', 'p'], opSpeed: ['🖐️', '操作速度', 'p'], defense: ['🛡️', '防御力', 'n'], weight: ['⚖️', '重さ', 'n'], shieldDmg: ['🔨', '対シールド', 'p'], maxJumps: ['🪽', 'ジャンプ回数', 'n'], grappleRange: ['⚓', 'グラップル射程', 'n'], luck: ['🍀', '幸運', 'p'],
  };

  class Player {
    constructor() {
      this.pos = V(); this.vel = V();
      this.yaw = 0; this.pitch = 0; this.roll = 0;
      this.hw = 0.35; this.standH = 1.8; this.crouchH = 1.15; this.height = 1.8;
      this.eyeH = 1.62; this.eyeOff = 0; this.landDip = 0;
      this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.jumps = 0;
      this.crouching = false; this.crouchToggle = false; this.sprinting = false; this.sprintToggle = false;
      this.sliding = false; this.slideT = 0; this.slideEndT = -10;
      this.mantle = null; this.airDashUsed = false;
      this.fov = 75; this.shake = 0; this.bobPhase = 0; this.bobAmt = 0; this.stepDist = 0; this.footL = false;
      this.recoilRecover = 0; this.hurtKick = 0;
      this.speedH = 0;
      this.grapple = { state: 'none', t: 0, point: V(), hook: V(), endT: -10, enemy: null, normal: V(0, 1, 0) };
      this.grappleCd = 0;
      this.pileState = null; this.pileT = 0;
      this.st = {};
      this.temps = new Map();
      this.buffs = new Map();
      this.buffState = {};
      this.stats = Object.assign({}, BASE);
      this.history = [];
      this.lastSafe = V();
      this.dead = false;
    }
    // ---- the grid inventory is the truth; these are count views over it (see inventory.js) ----
    get inv() { return G.Inv.counts(this, false); }
    set inv(v) { if (!this.bag) G.Inv.setupPlayer(this); G.Inv.clearItems(this, false); for (const id in v || {}) if (G.ITEM_BY_ID[id] && v[id] > 0) G.Inv.stow(this, G.Inv.make('item', id, v[id])); G.Inv.changed(this.bag); }
    get grenades() { return G.Inv.counts(this, true); }
    set grenades(v) { if (!this.bag) G.Inv.setupPlayer(this); G.Inv.clearItems(this, true); for (const id in v || {}) if (G.ITEM_BY_ID[id] && v[id] > 0) G.Inv.stow(this, G.Inv.make('item', id, v[id])); G.Inv.changed(this.bag); }
    get attStash() { return G.Inv.stashView(this); }
    set attStash(v) { if (!this.bag) G.Inv.setupPlayer(this); this.bag.items = this.bag.items.filter((o) => o.type !== 'att'); for (const id of v || []) if (G.ATT_BY_ID[id]) G.Inv.put(this.bag, G.Inv.make('att', id, 1)); G.Inv.changed(this.bag); }
    resetRun() {
      G.Inv.setupPlayer(this);
      this.buffs = new Map(); this.buffState = {}; this.temps = new Map();
      this.permMaxHp = 0; this.devMods = {};
      this.recalc();
      this.hp = this.stats.maxHp; this.os = 0; this.tShields = []; this.pileTome = 0;
      this.weapons = [G.weapons.make('starter')];
      this.wIdx = 0;
      this.wOrder = [];
      this.melee = G.weapons.makeMelee(G.DEFAULT_MELEE);
      this.attStash = []; // detached attachments (kept when moving parts around or swapping a weapon out)
      this.meleeMode = false;
      this.revives = G.Run ? G.Run.startRevives() : 3;
      // Q = ultimate (everyone starts with 不屈の城塞), X / Z / V = skills
      this.skills = [G.abilities.makeSlot(G.DEFAULT_ULT || 'ult_bastion'), null, null, null];
      this.grenades = { g_frag: 2 };
      this.grenadeSel = 'g_frag';
      this.inv = { h_bandage: 3, h_medkit: 1 };
      this.isel = { c1: 'h_bandage', c2: null };
      this.dead = false;
      this.phoenixUsed = false;
      this.st = {};
      this.lastShotT = -10; this.lastHurtT = -10;
      this.dynFireRate = 0;
      this.wardT = 0; this.bladesT = 0; this.invisT = 0;
      this.pileCd = 0; this.pileFree = false; this._pileBounced = false;
    }
    get weapon() { return this.weapons ? this.weapons[this.wIdx] : null; }
    has(id) { return this.buffs.has(id); }
    addBuff(id) {
      const n = (this.buffs.get(id) || 0) + 1;
      this.buffs.set(id, n);
      this.recalc();
      const b = G.BUFF_BY_ID[id];
      if (b && b.mods && b.mods.maxHp > 0) this.hp += b.mods.maxHp;
      if (b && b.mods && b.mods.maxHpPct) this.hp = Math.min(this.hp, this.stats.maxHp);
      G.save.mark('buffs', id);
      if (G.ui) G.ui._itemsDirty = true;
    }
    recalc() {
      this._skm = null;
      const s = Object.assign({}, BASE);
      const apply = (mods, n) => { for (const k in mods) { if (typeof mods[k] === 'number') s[k] = (s[k] || 0) + mods[k] * n; } };
      for (const [id, n] of this.buffs) { const b = G.BUFF_BY_ID[id]; if (b && b.mods) apply(b.mods, n); }
      for (const [, t] of this.temps) apply(t.mods, 1);
      if (this.devMods) apply(this.devMods, 1);
      G.Inv.applyArmor(this, s);
      s.maxHp = Math.max(10, Math.round((s.maxHp + (this.permMaxHp || 0)) * Math.max(0.2, 1 + s.maxHpPct)));
      s.cdr = Math.min(0.6, s.cdr);
      s.critChance = Math.min(1, s.critChance);
      s.hpRegen = Math.max(0, s.hpRegen);
      this.stats = s;
      if (this.hp > s.maxHp) this.hp = s.maxHp;
      if (G.weapons) G.weapons.dirty = true;
    }
    eyePos() { return G.camera.position.clone(); }
    chestPos() { return V(this.pos.x, this.pos.y + this.height * 0.65, this.pos.z); }
    forward() { return V(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
    addShake(a) { this.shake = Math.min(1.2, this.shake + a * G.save.data.settings.shake); }
    addRecoil(p, y) { this.pitch += p; this.yaw += y; this.recoilRecover += p * 0.55; }
    // ---- inventory: items are grouped by category slot (4 heal / 5 guard / 6 boost / 7 tool) ----
    itemCount(id) { return this.bag ? G.Inv.countAll(this, 'item', id) : 0; }
    // the items sitting in a consumable pocket (key 4 / key 5 / G)
    slotItems(slot) { const c = this.spec && this.spec[slot]; const ids = []; if (c) for (const o of c.items) if (o.type === 'item' && !ids.includes(o.id)) ids.push(o.id); return ids; }
    selItem(slot) { let id = this.isel[slot]; const l = this.slotItems(slot); if (!id || !l.includes(id)) { id = l[0] || null; this.isel[slot] = id; } return id; }
    takeItem(id) { if (!this.itemCount(id)) return false; return G.Inv.takeAll(this, 'item', id, 1); }
    addItem(id, n) {
      const it = G.ITEM_BY_ID[id]; if (!it) return false;
      n = n || 1;
      G.save.mark('items', id);
      G.Inv.give(this, 'item', id, n);
      if (it.cat === 'grenade') { if (!this.itemCount(this.grenadeSel)) this.grenadeSel = id; }
      const pocket = it.cat === 'grenade' || it.passive ? null : G.ITEM_SLOTS.find((S) => this.slotItems(S.id).includes(id));
      if (pocket && !this.slotItems(pocket.id).includes(this.isel[pocket.id])) this.isel[pocket.id] = id;
      if (G.game.state === 'playing' || G.game.state === 'modal') {
        G.ui.itemCard(it, it.cat === 'grenade' ? `[${G.K('grenade')} で構え→クリックで投擲・長押しで選択]` : it.passive ? '[常時：持っているだけで自動発動]' : pocket ? `[${G.K('item' + (G.ITEM_SLOTS.indexOf(pocket) + 1))} で使用・長押しで選択]` : '[持ち物画面から使用（消耗品枠が満杯）]');
      }
      G.ui.refreshItems && G.ui.refreshItems();
      return true;
    }
    canAddItem(id) {
      const it = G.ITEM_BY_ID[id];
      return !!this.bag && G.Inv.pcs(this).some((c) => G.Inv.canPut(c, 'item', id, 1));
    }

    spawnAt(w) {
      const s = w.spawn;
      this.pos.set(s.x, s.y + 0.001, s.z);
      w.depenetrate(this.pos, this.hw, this.standH);
      // snap to the real floor under the spawn point (never start mid-air)
      const g = w.groundAt(this.pos, this.hw, 3);
      if (g > -Infinity) this.pos.y = g;
      this.vel.set(0, 0, 0);
      this.yaw = s.yaw; this.pitch = 0;
      this.grounded = true; this.coyote = 0.1; this.jumps = 0;
      this.crouching = false; this.sliding = false; this.height = this.standH; this.eyeH = 1.62; this._slideRun = false; this._sjRun = false;
      this.mantle = null; this.pileState = null;
      this.grapple.state = 'none'; this.grappleCd = 0;
      this.lastSafe.copy(this.pos);
      this.history = [];
      this.st = {};
      this.eyeOff = 0; this.landDip = 0;
      if (this.slideLoop) { this.slideLoop.stop(); this.slideLoop = null; }
    }

    // ------------------------------------------------------------
    update(dt) {
      const w = G.world, S = G.save.data.settings, st = this.stats;
      const t = G.game.time;
      if (this.dead) return this.updateDeadCam(dt);
      this.updateLook(dt);
      // timers
      this.coyote -= dt; this.jumpBuf -= dt; this.grappleCd = Math.max(0, this.grappleCd - dt);
      this.invulnT = Math.max(0, (this.invulnT || 0) - dt);
      this.wardT = Math.max(0, this.wardT - dt); this.bladesT = Math.max(0, this.bladesT - dt);
      this.healZoneT = Math.max(0, (this.healZoneT || 0) - dt); this.smokeT = Math.max(0, (this.smokeT || 0) - dt);
      for (const [id, tm] of this.temps) { tm.t -= dt; if (tm.t <= 0) { this.temps.delete(id); this.recalc(); } }
      // regen & player statuses
      if (st.hpRegen > 0 && this.hp < st.maxHp) this.hp = Math.min(st.maxHp, this.hp + st.hpRegen * Math.max(0, 1 + (st.healMul || 0)) * dt);
      this.updateStatuses(dt);
      // history for rewind
      this._histT = (this._histT || 0) - dt;
      if (this._histT <= 0) { this._histT = 0.1; this.history.push({ p: this.pos.clone(), hp: this.hp, t }); if (this.history.length > 50) this.history.shift(); }

      const fwdIn = (I.down('forward') ? 1 : 0) - (I.down('back') ? 1 : 0);
      const rightIn = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let wx = fx * fwdIn + rx * rightIn, wz = fz * fwdIn + rz * rightIn;
      const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }

      // ---- crouch / sprint input ----
      const crouchHit = I.hit('crouch');
      let wantCrouch;
      if (S.crouchToggle) { if (crouchHit) this.crouchToggle = !this.crouchToggle; wantCrouch = this.crouchToggle; }
      else wantCrouch = I.down('crouch');
      if (S.autoSprint) this.sprintToggle = !I.down('sprint'); // run by default, hold Shift to walk
      else {
        // a tap of Shift starts a run that goes on by itself until it breaks (you stop, aim, shoot, reload, crouch); Shift again ends it early
        const shDown = I.down('sprint');
        if (!shDown) this._spCancel = false;
        if (I.hit('sprint') && this.sprinting) { this.sprintToggle = false; this._spCancel = true; }
        else if (shDown && !this._spCancel) this.sprintToggle = true;
      }
      const ads = G.weapons.adsT > 0.3;
      const canSprintAfterShot = t - this.lastShotT > (G.weapons.curStats && G.weapons.curStats.sprintFire ? 0.05 : 0.22);
      if (this._sjRun && this.grounded) this._sjRun = false; // a slide-jump keeps the run through the air (even with crouch still held); landing ends that
      this.sprinting = this.sprintToggle && fwdIn > 0 && !ads && (!this.crouching || this._sjRun) && canSprintAfterShot && !G.weapons.reloadBlocksSprint() && !(this.st.shock > 0);
      if (!this.sprinting && !S.autoSprint && !I.down('sprint') && this.sprintToggle && !this.sliding && !this._sjRun) this.sprintToggle = false; // the run broke: it does not resume by itself

      // pile driver trigger: crouch in air
      this.pileCd = Math.max(0, (this.pileCd || 0) - dt);
      this.pileLandT = Math.max(0, (this.pileLandT || 0) - dt);
      this.dragT = Math.max(0, (this.dragT || 0) - dt); // reeled in by a chain / hook: no control of your own
      if (this.grounded && this.pileFree && !this.pileState && this._pileBounced && this.vel.y <= 0) { this.pileFree = false; this._pileBounced = false; }
      if (crouchHit && !this.grounded && !this.pileState && !this.mantle) {
        const below = w.groundAt(this.pos, this.hw, 60);
        if (this.pos.y - below > 1.3 || below === -Infinity) {
          if (this.pileReady()) this.startPile();
          else { G.ui.toastSmall(`🔨 パイルドライバー CT ${this.pileCd.toFixed(1)}秒`); G.sfx.ui('deny'); }
        }
      }
      // air dash (buff): sprint pressed in air
      if (!this.grounded && I.hit('sprint') && this.has('m_airdash') && !this.airDashUsed && !this.pileState && this.grapple.state !== 'attached') {
        this.airDashUsed = true;
        const f = this.forward(); f.y = Math.max(-0.2, f.y * 0.5); f.normalize();
        this.vel.copy(f.multiplyScalar(19)); this.vel.y = Math.max(this.vel.y, 2);
        G.sfx.whoosh(0.3, 0.8); this.fovKick = 10; G.buffs.emit('onDash', {});
      }

      // ---- slide ----
      if (this.grounded && crouchHit && this.speedH > 7.0 && !this.sliding && !this.pileState) this.startSlide();
      if (this.sliding) {
        this.slideT += dt;
        if (!wantCrouch && !S.crouchToggle && this.slideT > 0.25) this.endSlide();
        else if (this.speedH < 4.5 || this.slideT > 1.25 || !this.grounded && this.slideT > 0.3) this.endSlide();
      }
      // ---- crouch state (head room check) ----
      const wantLow = wantCrouch || this.sliding;
      if (wantLow && !this.crouching) { this.crouching = true; }
      else if (!wantLow && this.crouching) {
        if (w.boxFree(this.pos.x - this.hw, this.pos.y + this.crouchH, this.pos.z - this.hw, this.pos.x + this.hw, this.pos.y + this.standH, this.pos.z + this.hw)) this.crouching = false;
      }
      if (this.crouching && S.crouchToggle && !S.autoSprint && this.sprintToggle && !this.sliding) { this.crouchToggle = false; this.crouching = false; }
      this.height = this.crouching ? this.crouchH : this.standH;
      this.eyeH = U.damp(this.eyeH, this.crouching ? 1.02 : 1.62, 14, dt);

      // ---- jump input ----
      if (I.hit('jump')) this.jumpBuf = 0.14;

      // ---- mantle ----
      if (this.mantle) { this.updateMantle(dt); this.postMove(dt, 0, true); return; }
      if (!this.pileState && this.jumpBuf > -0.2 && I.down('jump') && fwdIn > 0 && this.grapple.state !== 'attached') { if (this.tryMantle(fx, fz)) { this.postMove(dt, 0, true); return; } }

      // ---- pile driver states ----
      if (this.pileState === 'charge') {
        this.pileT -= dt;
        const fwdSpd = 3.4 / Math.max(0.12, this.pileTMax || 0.32); // ~3.4m forward during the wind-up
        this.vel.x = U.damp(this.vel.x, this.pileDir.x * fwdSpd, 18, dt); this.vel.z = U.damp(this.vel.z, this.pileDir.z * fwdSpd, 18, dt); this.vel.y = 1.2;
        if (Math.random() < 0.8) { const a = Math.random() * 6.28; G.fx.add.spawn(this.pos.x + Math.cos(a) * 1.2, this.pos.y + 0.2, this.pos.z + Math.sin(a) * 1.2, -Math.cos(a) * 2, 0.5, -Math.sin(a) * 2, 0.4, 0.15, 0.02, 1.2, 0.8, 0.4, 0.9, 0, 1); }
        if (this.pileT <= 0) { this.pileState = 'fall'; this.vel.set(this.pileDir.x * 3, this.stats.pileFast ? -60 : -46, this.pileDir.z * 3); G.sfx.whoosh(0.5, 1.0); }
      }
      if (this.pileState === 'fall' && this.stats.pileVacuum) {
        const g0 = w.groundAt(this.pos, this.hw, 60); const c = V(this.pos.x, g0 > -Infinity ? g0 : this.pos.y, this.pos.z);
        for (const e of G.enemies.inRadius(c, 10)) { if (e.boss) continue; const d = c.clone().sub(e.pos); d.y = 0; const l = d.length(); if (l > 1) e.pos.addScaledVector(d.normalize(), Math.min(l, 16 * dt)); }
      }
      // ---- speed target ----
      const spd = this.walkSpeed();
      let targetSpeed = spd;
      // armour: speed builds up the longer you keep sprinting (+x per second, up to 3 steps)
      this.sprintT = this.sprinting ? (this.sprintT || 0) + dt : 0;
      if (this.sprinting) targetSpeed = 9.7 * (1 + st.moveSpeed + Math.min(3, Math.floor(this.sprintT)) * (st.sprintRamp || 0)) * this.moveMul();
      if (this.crouching && !this.sliding && !this._sjRun) targetSpeed = 3.3 * (1 + st.moveSpeed * 0.5) * this.moveMul();
      if (G.weapons.adsT > 0.5) targetSpeed *= 0.62;
      if (this.st.slow > 0) targetSpeed *= 0.6;
      if (this.inWater) targetSpeed *= 0.9;
      targetSpeed *= this.fieldSpeed || 1;

      const g = 22 * (st.lowGrav > 0 ? 0.55 : 1);
      // horizontal
      const hv = V(this.vel.x, 0, this.vel.z);
      if (this.grapple.state === 'attached') {
        this.updateGrapplePull(dt, wx, wz);
      } else if (this.pileState === 'fall' || this.dragT > 0) {
        // locked (pile fall / dragged by a chain)
      } else if (this.grounded && !this.sliding) {
        const tx = wx * targetSpeed, tz = wz * targetSpeed;
        const accel = (wl > 0 ? 70 : 45) * (this.fieldSlip || 1);
        const dx = tx - this.vel.x, dz = tz - this.vel.z;
        const dl = Math.hypot(dx, dz);
        const step = Math.min(dl, accel * dt);
        if (dl > 0) { this.vel.x += dx / dl * step; this.vel.z += dz / dl * step; }
      } else if (this.sliding) {
        const fr = 2.4 / (this.fieldSlide || 1);
        const sp = hv.length();
        const ns = Math.max(0, sp - fr * dt * (1 + sp * 0.06));
        if (sp > 0) { this.vel.x *= ns / sp; this.vel.z *= ns / sp; }
        // small steering
        this.vel.x += wx * 4 * dt; this.vel.z += wz * 4 * dt;
      } else {
        // air control: accelerate toward wish but don't exceed max(current, target)
        const ac = 22 * (1 + st.airControl);
        const cur = hv.length();
        this.vel.x += wx * ac * dt; this.vel.z += wz * ac * dt;
        const nl = Math.hypot(this.vel.x, this.vel.z);
        const cap = Math.max(cur, targetSpeed);
        if (nl > cap) { this.vel.x *= cap / nl; this.vel.z *= cap / nl; }
        if (wl === 0 && !this.has('m_bunny')) { this.vel.x *= Math.exp(-0.6 * dt); this.vel.z *= Math.exp(-0.6 * dt); }
      }
      // vertical
      if (this.pileState !== 'charge') {
        if (this.grapple.state === 'attached') this.vel.y -= g * 0.6 * dt;
        else this.vel.y -= g * dt;
      }
      // jump
      if (this.jumpBuf > 0 && !this.pileState && !(this.dragT > 0)) {
        if (this.grounded || this.coyote > 0) {
          this.vel.y = 7.6 * (1 + st.jumpPower) * (this.fieldJump || 1);
          if (this.sliding) { const run = this._slideRun; this.endSlide(); if (run) this._sjRun = true; const hs = Math.hypot(this.vel.x, this.vel.z); if (hs > 0) { const k = Math.min(1.08, 15 / hs); this.vel.x *= k; this.vel.z *= k; } }
          this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.jumps = 1;
          G.sfx.jump(); G.buffs.emit('onJump', { air: false });
          if (this.crouching && !wantCrouch) this.crouching = false;
        } else if (this.jumps < st.maxJumps && this.grapple.state !== 'attached') {
          this.jumps = Math.max(1, this.jumps) + 1;
          this.vel.y = 7.2 * (1 + st.jumpPower);
          if (wl > 0) { const hs = Math.max(Math.hypot(this.vel.x, this.vel.z), targetSpeed * 0.8); this.vel.x = wx * hs; this.vel.z = wz * hs; }
          this.jumpBuf = 0;
          G.sfx.whoosh(0.25, 0.5, true);
          for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; G.fx.norm.spawn(this.pos.x + Math.cos(a) * 0.4, this.pos.y, this.pos.z + Math.sin(a) * 0.4, Math.cos(a) * 2, 0, Math.sin(a) * 2, 0.4, 0.2, 0.5, 0.8, 0.8, 0.85, 0.3, 0, 2); }
          G.buffs.emit('onJump', { air: true });
        }
      }
      if (this.grapple.state === 'attached' && I.hit('jump')) { this.detachGrapple(true); }
      // speed cap safety
      const vmax = 60; if (this.vel.length() > vmax) this.vel.setLength(vmax);

      this.physics(dt);
      this.updateGrapple(dt);
      this.postMove(dt, wl, false);
    }
    walkSpeed() { return 6.2 * (1 + this.stats.moveSpeed) * this.moveMul(); }
    moveMul() { const mm = G.weapons.meleeMoveMul(); if (mm) return mm; const cs = G.weapons.curStats; return cs ? cs.moveMul : 1; }

    physics(dt) {
      const w = G.world;
      const wasGrounded = this.grounded;
      const preVy = this.vel.y;
      const n = Math.max(1, Math.ceil(dt / (1 / 120)));
      const sdt = dt / n;
      let landed = false, stepped = 0, hitWall = false;
      for (let i = 0; i < n; i++) {
        const r = w.moveBox(this.pos, this.vel, sdt, this.hw, this.height, { canStep: this.grounded || this.coyote > 0 || this.sliding, stepH: 0.5 });
        if (r.landed) landed = true;
        if (r.stepped) stepped += r.stepped;
        if (r.hitWall) hitWall = true;
        if (r.landed && this.vel.y <= 0) this.grounded = true;
      }
      // ground probe
      const gnd = w.groundAt(this.pos, this.hw, 0.08);
      const onGround = gnd > -Infinity && this.pos.y - gnd < 0.06 && this.vel.y <= 0.01;
      if (onGround) { this.pos.y = Math.max(this.pos.y, gnd); this.grounded = true; if (this.vel.y < 0) this.vel.y = 0; }
      else if (wasGrounded && this.vel.y <= 0 && !this.pileState) {
        // snap down stairs / small drops
        const g2 = w.groundAt(this.pos, this.hw, 0.6);
        if (g2 > -Infinity && this.pos.y - g2 < 0.58) { this.pos.y = g2; this.grounded = true; this.vel.y = 0; }
        else { this.grounded = false; this.coyote = 0.12; }
      } else this.grounded = false;
      if (stepped > 0) { this.eyeOff -= Math.min(0.5, stepped); }
      // landing
      if (this.grounded && !wasGrounded) {
        const fall = -preVy;
        this.jumps = 0; this.airDashUsed = false;
        if (this.pileState === 'fall') this.pileImpact();
        else if (fall > 3) {
          const k = Math.min(1, (fall - 3) / 14);
          this.landDip = -0.08 - k * 0.32;
          G.sfx.land(k, this.surfaceBelow());
          if (fall > 9) { this.addShake(k * 0.35); G.fx.dust(this.pos.clone().setY(this.pos.y + 0.05), V(0, 1, 0), 0x8a8070, 6); }
          G.buffs.emit('onLand', { speed: fall });
          if (!this.has('m_bunny') && !this.sliding && fall > 10) { this.vel.x *= 0.7; this.vel.z *= 0.7; }
        }
      }
      // fail-safes: out of bounds / abyss
      if (this.pos.y < w.killY) this.fellInPit();
      const inTunnel = this.pos.z < 0.5 && (w.exits || []).some((ex) => this.pos.x > ex.gx0 && this.pos.x < ex.gx1);
      if (!inTunnel) {
        this.pos.x = U.clamp(this.pos.x, 0.36, w.W - 0.36);
        this.pos.z = U.clamp(this.pos.z, 0.36, w.D - 0.36);
      }
      // safe position memory
      if (this.grounded && !this.pileState) {
        this._safeT = (this._safeT || 0) - dt;
        if (this._safeT <= 0) {
          this._safeT = 0.3;
          const ok = [[-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8]].every(([ox, oz]) => w.groundAt(V(this.pos.x + ox, this.pos.y, this.pos.z + oz), 0.1, 0.4) > -Infinity);
          if (ok) this.lastSafe.copy(this.pos);
        }
      }
      // stuck safety (should never happen but keeps the game playable)
      if (!w.boxFree(this.pos.x - this.hw + 0.02, this.pos.y + 0.05, this.pos.z - this.hw + 0.02, this.pos.x + this.hw - 0.02, this.pos.y + this.height - 0.05, this.pos.z + this.hw - 0.02)) {
        this._stuckT = (this._stuckT || 0) + dt;
        if (this._stuckT > 0.3) { w.depenetrate(this.pos, this.hw, this.height); this._stuckT = 0; }
      } else this._stuckT = 0;
      this.hitWall = hitWall;
    }
    surfaceBelow() {
      if (this.inWater) return 'water';
      const a = G.world.query(this.pos.x - 0.1, this.pos.y - 0.1, this.pos.z - 0.1, this.pos.x + 0.1, this.pos.y + 0.01, this.pos.z + 0.1);
      let best = null; for (const c of a) if (!best || c.y1 > best.y1) best = c;
      return best ? best.surf : 'stone';
    }
    fellInPit() {
      const wf = G.world.fallFrac || 0.15;
      let dmg = this.has('m_feather') ? 0 : Math.round(this.stats.maxHp * wf);
      if (G.world.fallSpot) { dmg = Math.min(dmg, Math.max(0, Math.floor(this.hp) - 1)); this.pos.copy(G.world.fallSpot); } // the last field: a heavy fall that never kills, then back to the entrance ledge
      else this.pos.copy(this.lastSafe);
      this.pos.y += 0.05;
      this.vel.set(0, 0, 0);
      G.world.depenetrate(this.pos, this.hw, this.height);
      this.grapple.state = 'none';
      this.pileState = null;
      if (dmg) { G.combat.damagePlayer(dmg, { src: 'fall' }); }
      G.ui.toast('奈落に落ちた…' + (dmg ? ` -${dmg}HP` : ''), 'warn');
      if (G.world.fallSpot) this.invulnT = Math.max(this.invulnT || 0, 2.5);
      G.ui.fadeFlash();
    }

    postMove(dt, wl, mantling) {
      const S = G.save.data.settings, w = G.world;
      this.speedH = Math.hypot(this.vel.x, this.vel.z);
      // hazards / surfaces
      this.inWater = false;
      for (const z of w.waterZones) if (this.pos.x > z.x0 && this.pos.x < z.x1 && this.pos.z > z.z0 && this.pos.z < z.z1 && this.pos.y < 0.2) this.inWater = true;
      if (this.grounded && this.pos.y < 0.2) for (const z of w.lavaZones) if (this.pos.x > z.x0 && this.pos.x < z.x1 && this.pos.z > z.z0 && this.pos.z < z.z1) {
        this._lavaT = (this._lavaT || 0) - dt;
        if (this._lavaT <= 0) { this._lavaT = 0.4; G.combat.damagePlayer(5 + G.game.area * 0.6, { src: 'aoe', elem: 'fire' }); G.sfx.lava(this.pos); }
        // lava sets you alight with a fierce, long burn (it hurts several times more than an ordinary one)
        this.st.burn = Math.max(this.st.burn || 0, 5); this.st.burnMul = 4;
      }
      // footsteps
      if (this.grounded && this.speedH > 1.2 && !this.sliding) {
        this.stepDist += this.speedH * dt;
        const stride = this.sprinting ? 2.5 : this.crouching ? 1.4 : 2.0;
        if (this.stepDist > stride) {
          this.stepDist = 0; this.footL = !this.footL;
          G.sfx.step(this.surfaceBelow(), this.crouching ? 0.4 : this.sprinting ? 1.1 : 0.75);
          if (this.inWater) G.fx.norm.spawn(this.pos.x, this.pos.y + 0.05, this.pos.z, 0, 1.5, 0, 0.4, 0.1, 0.3, 0.6, 0.7, 0.75, 0.5, 6, 0);
        }
        this.bobPhase += this.speedH * dt * (this.sprinting ? 1.25 : 1.45);
        this.bobAmt = U.damp(this.bobAmt, Math.min(1, this.speedH / 9), 8, dt);
      } else this.bobAmt = U.damp(this.bobAmt, 0, 6, dt);
      // camera
      this.eyeOff = U.damp(this.eyeOff, 0, 12, dt);
      this.landDip = U.damp(this.landDip, 0, 7, dt);
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.hurtKick = Math.max(0, this.hurtKick - dt * 3);
      // recoil recovery
      if (this.recoilRecover > 0 && G.game.time - this.lastShotT > 0.08) { const r = Math.min(this.recoilRecover, dt * 2.2); this.pitch -= r; this.recoilRecover -= r; }
      this.pitch = U.clamp(this.pitch, -1.55, 1.55);
      const cam = G.camera;
      const bobK = S.bob * this.bobAmt * (G.weapons.adsT > 0.5 ? 0.25 : 1);
      const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.055 * bobK;
      const bobX = Math.cos(this.bobPhase) * 0.035 * bobK;
      const sh = this.shake * this.shake;
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      cam.position.set(this.pos.x + rx * bobX, this.pos.y + this.eyeH + this.eyeOff + this.landDip + bobY, this.pos.z + rz * bobX);
      // tilt (strafe & slide)
      const strafe = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
      const targetRoll = (this.sliding ? 0.07 : 0) - strafe * 0.018 * (this.grounded ? 1 : 0.5) + (this.grapple.state === 'attached' ? -strafe * 0.05 : 0);
      this.roll = U.damp(this.roll, targetRoll, 8, dt);
      const shp = (Math.random() - 0.5) * sh * 0.05, shy = (Math.random() - 0.5) * sh * 0.05, shr = (Math.random() - 0.5) * sh * 0.04;
      cam.rotation.set(this.pitch + shp + this.hurtKick * 0.03, this.yaw + shy, this.roll + shr, 'YXZ');
      // third-person camera for grapple swings and the pile driver
      const gs = this.grapple.state;
      const wantTP = gs === 'firing' || gs === 'attached' || gs === 'reelEnemy' || !!this.pileState || (this.pileLandT || 0) > 0;
      this.tpHold = wantTP ? 0.3 : Math.max(0, (this.tpHold || 0) - dt);
      const AV = G.avatar;
      const goingTP = wantTP || this.tpHold > 0;
      AV.returning = !goingTP;
      AV.tpK = U.damp(AV.tpK, goingTP ? 1 : 0, goingTP ? 7 : 10, dt);
      if (!goingTP && AV.tpK < 0.02) AV.tpK = 0;
      if (AV.tpK > 0.001) {
        const head = V(this.pos.x, this.pos.y + this.height * 0.85, this.pos.z);
        const f = this.forward();
        const desired = head.clone().addScaledVector(f, -4.4).add(V(Math.cos(this.yaw) * 0.75, 0.9, -Math.sin(this.yaw) * 0.75));
        const dir = desired.clone().sub(head); const L = dir.length(); dir.divideScalar(L);
        const hit = w.raycast(head, dir, L + 0.3);
        const dist = hit ? Math.max(0.4, hit.t - 0.35) : L;
        const tp = head.addScaledVector(dir, dist);
        const k = AV.tpK * AV.tpK * (3 - 2 * AV.tpK);
        cam.position.lerp(tp, k);
      }
      AV.update(dt, this);
      // FOV
      const baseV = hfovToV(S.fov, cam.aspect);
      let extra = 0;
      if (this.sprinting) extra += 7;
      if (this.sliding) extra += 11;
      if (this.grapple.state === 'attached') extra += 8;
      extra += U.clamp((this.speedH - 10) * 0.9, 0, 14);
      if (this.pileState === 'fall') extra += 16;
      if (this.fovKick) { extra += this.fovKick; this.fovKick = Math.max(0, this.fovKick - dt * 30); }
      this.baseV = baseV;
      const zoom = G.weapons.camZoom();
      const target = (baseV + extra * (1 - G.weapons.adsT * 0.85)) / zoom;
      this.fov = U.damp(this.fov, target, 9, dt);
      if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
      G.sfx.listener.x = cam.position.x; G.sfx.listener.y = cam.position.y; G.sfx.listener.z = cam.position.z;
      G.sfx.listenerYawNeg = -this.yaw;
      // speed lines
      const sl = U.clamp((this.speedH - 10.5) / 12, 0, 1) + (this.pileState === 'fall' ? 0.6 : 0) + (this.grapple.state === 'attached' ? 0.25 : 0);
      G.ui.speedLines(Math.min(1, sl));
      if (this.slideLoop) this.slideLoop.set(Math.min(1.4, this.speedH / 10));
    }
    updateLook(dt) {
      const S = G.save.data.settings;
      let sens = 0.0021 * S.sens;
      if (G.weapons.adsT > 0.5) sens *= S.adsSens * Math.min(1, 1 / Math.max(1, G.weapons.adsZoom() * 0.75));
      const slow = G.game.timeScale < 1 ? 1 : 1;
      const wheel = G.abilities.wheelOpen && G.abilities.wheelOpen();
      if (!wheel) {
        this.yaw -= I.mx * sens * slow;
        this.pitch -= I.my * sens * (S.invertY ? -1 : 1);
      }
      this.pitch = U.clamp(this.pitch, -1.55, 1.55);
      // keep yaw bounded without any visible reset (pure modulo of a full turn)
      if (this.yaw > Math.PI * 8 || this.yaw < -Math.PI * 8) this.yaw = U.wrapAngle(this.yaw);
    }
    updateStatuses(dt) {
      const s = this.st;
      const sdt = dt / Math.max(0.3, 1 - (this.stats.statusRes || 0)); // armour: statuses wear off sooner
      const dr = Math.max(0.1, 1 - (this.stats.dotRes || 0));
      for (const k of ['slow', 'shock']) if (s[k] > 0) s[k] -= sdt;
      s.tick = (s.tick || 0) - dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        const sc = (1 + 0.1 * (G.game.area - 1)) * dr;
        if (s.burn > 0) { G.combat.damagePlayer(1.6 * sc * (s.burnMul || 1), { src: 'dot', elem: null }); }
        if (s.poison > 0) { G.combat.damagePlayer(0.8 * sc * (s.poisonStacks || 1), { src: 'dot' }); }
      }
      if (s.burn > 0) { s.burn -= sdt; if (s.burn <= 0) s.burnMul = 1; }
      if (s.poison > 0) { s.poison -= sdt; if (s.poison <= 0) s.poisonStacks = 0; }
    }

    // ---- slide ----
    startSlide() {
      this.sliding = true; this.slideT = 0; this.crouching = true;
      this._slideRun = !!(this.sprinting || this.sprintToggle); // a slide out of a run: the run carries on when the slide is over
      const hs = Math.hypot(this.vel.x, this.vel.z) || 1;
      const boost = Math.max(hs, 12.8 * (1 + this.stats.slideBoost));
      this.vel.x *= boost / hs; this.vel.z *= boost / hs;
      G.sfx.whoosh(0.25, 0.4);
      this.slideLoop = G.sfx.loop('slide');
      this.fovKick = 4;
      G.buffs.emit('onSlide', {});
    }
    endSlide() {
      this.sliding = false; this.slideEndT = G.game.time;
      if (this._slideRun) { this._slideRun = false; this.sprintToggle = true; }
      if (this.slideLoop) { this.slideLoop.stop(); this.slideLoop = null; }
    }
    // ---- mantle ----
    tryMantle(fx, fz) {
      const w = G.world;
      const px = this.pos.x + fx * 0.55, pz = this.pos.z + fz * 0.55;
      const a = w.query(px - 0.2, this.pos.y + 0.45, pz - 0.2, px + 0.2, this.pos.y + 1.75, pz + 0.2);
      if (!a.length) return false;
      let top = -Infinity; for (const c of a) top = Math.max(top, c.y1);
      if (top - this.pos.y > 1.7 || top - this.pos.y < 0.45) return false;
      // must have room on top
      const tx = this.pos.x + fx * 0.75, tz = this.pos.z + fz * 0.75;
      if (!w.boxFree(tx - this.hw, top + 0.02, tz - this.hw, tx + this.hw, top + this.crouchH, tz + this.hw)) return false;
      if (!w.boxFree(this.pos.x - this.hw, this.pos.y + 0.1, this.pos.z - this.hw, this.pos.x + this.hw, top + this.crouchH, this.pos.z + this.hw)) return false;
      this.mantle = { t: 0, dur: 0.24, from: this.pos.clone(), to: V(tx, top + 0.01, tz), vel: Math.max(5, this.speedH) };
      this.vel.set(0, 0, 0);
      this.jumpBuf = 0;
      G.sfx.mantle();
      return true;
    }
    updateMantle(dt) {
      const m = this.mantle;
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const e = k < 0.6 ? k / 0.6 : 1;
      this.pos.x = U.lerp(m.from.x, m.to.x, k * k);
      this.pos.z = U.lerp(m.from.z, m.to.z, k * k);
      this.pos.y = U.lerp(m.from.y, m.to.y, Math.sin(e * Math.PI / 2));
      this.landDip = -0.06 * Math.sin(k * Math.PI);
      if (k >= 1) {
        this.mantle = null; this.grounded = true; this.jumps = 0;
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        this.vel.set(fx * m.vel * 0.8, 0, fz * m.vel * 0.8);
        G.world.depenetrate(this.pos, this.hw, this.crouchH);
      }
    }

    // ---- grapple ----
    handPos() { if (G.avatar.tpK > 0.5) return G.avatar.handWorld(); G.camera.updateMatrixWorld(); return G.camera.localToWorld(V(-0.3, -0.26, -0.45)); }
    updateGrapple(dt) {
      const gr = this.grapple, st = this.stats;
      const range = st.grappleRange;
      // aim preview
      this.grapplePreview = null;
      if (gr.state === 'none' && this.grappleCd <= 0) {
        const o = G.camera.position, d = this.forward();
        const h = G.world.raycast(o, d, range + 25);
        if (h) this.grapplePreview = { point: h.point, normal: h.normal, ok: h.t <= range && !h.c.noGrapple, dist: h.t };
        if (this.has('m_grapenemy')) { const eh = G.enemies.raycast(o, d, Math.min(range, h ? h.t : range), 0.3); if (eh && !eh.e.boss) this.grapplePreview = { point: o.clone().addScaledVector(d, eh.t), normal: d.clone().negate(), ok: true, dist: eh.t, enemy: eh.e }; }
      }
      if (I.hit('grapple') && !this.pileState) {
        if (gr.state === 'attached' || gr.state === 'firing') this.detachGrapple(false);
        else if (gr.state === 'none' && this.grappleCd <= 0) {
          const pv = this.grapplePreview;
          gr.hook.copy(this.handPos());
          G.sfx.grappleFire();
          if (pv && pv.ok) {
            gr.state = 'firing'; gr.t = 0; gr.point.copy(pv.point); gr.normal.copy(pv.normal); gr.enemy = pv.enemy || null;
          } else {
            gr.state = 'miss'; gr.t = 0;
            gr.point.copy(G.camera.position).addScaledVector(this.forward(), Math.min(range, pv ? pv.dist : range));
            G.ui.toastSmall(pv && pv.point && !pv.ok && pv.dist <= range ? '⚓ 掴めない場所' : '⚓ 射程外');
          }
        }
      }
      if (gr.state === 'firing' || gr.state === 'miss') {
        gr.t += dt;
        const target = gr.enemy && gr.enemy.alive ? gr.enemy.centerPos() : gr.point;
        const d = target.clone().sub(gr.hook);
        const step = 150 * dt;
        if (d.length() <= step) {
          gr.hook.copy(target);
          if (gr.state === 'miss') { gr.state = 'retract'; }
          else if (gr.enemy) {
            gr.state = 'reelEnemy'; gr.t = 0;
            G.sfx.grappleHit(target);
            G.combat.damageEnemy(gr.enemy, G.combat.scale(40), { src: 'skill' });
            G.combat.stun(gr.enemy, 1.2);
            G.buffs.emit('onGrapple', { point: target.clone() });
          } else {
            gr.state = 'attached'; gr.t = 0; gr.len = undefined;
            G.sfx.grappleHit(gr.point);
            G.fx.sparks(gr.point, gr.normal, 10, 0xffd090, 5); G.fx.dust(gr.point, gr.normal, 0x8a8070, 5);
            G.fx.ring(gr.point.clone().addScaledVector(gr.normal, 0.05), 0.6, 0xffc070, 0.4);
            this.vel.y = Math.max(this.vel.y, 2.5);
            this.grounded = false;
            if (this.sliding) this.endSlide();
            G.buffs.emit('onGrapple', { point: gr.point.clone() });
            this.fovKick = 6;
          }
        } else gr.hook.addScaledVector(d.normalize(), step);
      } else if (gr.state === 'retract') {
        const hp = this.handPos();
        const d = hp.clone().sub(gr.hook);
        if (d.length() < 2) { gr.state = 'none'; this.grappleCd = Math.max(this.grappleCd, 0.5); }
        else gr.hook.addScaledVector(d.normalize(), 120 * dt);
      } else if (gr.state === 'attached') {
        gr.t += dt;
        this._ratchet = (this._ratchet || 0) - dt;
        if (this._ratchet <= 0) { this._ratchet = 0.07; G.sfx.ratchet(); }
        const dist = G.camera.position.distanceTo(gr.point);
        if (!I.down('grapple') && gr.t > 0.12 || dist < 1.7 || gr.t > 4.5) this.detachGrapple(false);
      } else if (gr.state === 'reelEnemy') {
        gr.t += dt;
        const e = gr.enemy;
        if (!e || !e.alive || gr.t > 0.6) { gr.state = 'retract'; this.grappleCd = G.grappleCdOf(st); }
        else {
          const toMe = this.pos.clone().sub(e.pos); toMe.y = 0;
          if (toMe.length() > 2.2) e.pos.addScaledVector(toMe.normalize(), 28 * dt);
          gr.hook.copy(e.centerPos());
        }
      }
      G.abilities.updateRope(gr, this);
    }
    updateGrapplePull(dt, wx, wz) {
      const gr = this.grapple;
      const eye = G.camera.position;
      const d = gr.point.clone().sub(eye);
      const dist = d.length(); d.divideScalar(dist || 1);
      const gs = 1 + this.stats.grappleSpeed;
      if (gr.len === undefined) gr.len = dist;
      // steering: input split into "toward anchor", "away from anchor" and sideways
      const wish = V(wx, 0, wz);
      const dH = V(d.x, 0, d.z); if (dH.lengthSq() > 1e-4) dH.normalize();
      const toward = wish.dot(dH);                      // >0: W toward the hook, <0: holding the opposite key
      const away = Math.max(0, -toward);
      const side = wish.clone().addScaledVector(dH, -toward);
      // reel the rope in; holding the opposite key slows the reel so the swing can bulge outward
      const reel = 15 * gs * (1 - 0.8 * away) + Math.max(0, toward) * 6;
      gr.len = Math.max(1.5, Math.min(gr.len, dist) - reel * dt);
      // pull toward the anchor (weaker while pushing away)
      this.vel.addScaledVector(d, (26 * gs + Math.max(0, toward) * 14) * (1 - 0.75 * away) * dt);
      // strong lateral control -> pendulum swings / curving around obstacles
      this.vel.addScaledVector(side, 34 * dt);
      // pushing away lets you swing out wide instead of being yanked in
      if (away > 0) { this.vel.x += wx * 10 * away * dt; this.vel.z += wz * 10 * away * dt; }
      // rope constraint: can't drift farther than the current rope length (keeps tangential momentum)
      if (dist > gr.len) {
        const outV = -this.vel.dot(d);
        if (outV > 0) this.vel.addScaledVector(d, outV * (1 - 0.15 * away));
        this.vel.addScaledVector(d, Math.min(40, (dist - gr.len) * 30) * dt);
      }
      // only light damping so swings keep their energy
      this.vel.multiplyScalar(1 - Math.min(0.5, 0.25 * dt));
      const cap = 32 * (1 + this.stats.grappleSpeed * 0.5);
      if (this.vel.length() > cap) this.vel.setLength(cap);
    }
    detachGrapple(jumpBoost) {
      const gr = this.grapple;
      if (gr.state === 'attached' && jumpBoost) { this.vel.y = Math.max(this.vel.y, 0) + 6.5; G.sfx.jump(); }
      gr.state = 'retract';
      gr.endT = G.game.time;
      this.grappleCd = G.grappleCdOf(this.stats);
    }

    // ---- pile driver (innate, upgradable) ----
    pileCdMax() { return 8 * Math.max(0.3, 1 - this.stats.pileCd - this.stats.cdr - (this.stats.skillCd || 0)) * (this.temps.has('ult_overcharge') ? 0.3 : 1); }
    pileLevel() { let n = 0; for (const [id, c] of this.buffs) { const b = G.BUFF_BY_ID[id]; if (b && b.cat === 'pile') n += c; } return n + (this.pileTome || 0); }
    pileReady() { return (this.pileCd || 0) <= 0 || this.pileFree; }
    // diminishing: every pile boon used to add a flat +60% with no end, which outran enemy HP by far deep in a run
    pileLvMul() { return 1 + 0.5 * Math.pow(this.pileLevel(), 0.8); }
    // shockwave radius, capped at twice the base
    pileRadius() { const st = this.stats, up = 1 + 0.4 * (this.buffs.get('m_pileup') || 0); return Math.min(11, 5.5 * (1 + st.pileRadius) * up * (1 + this.pileLevel() * 0.02)); }
    // final pile driver numbers (same formulas as pileImpact) for the status screen
    pileInfo() {
      const st = this.stats, lvl = this.pileLevel();
      const up = 1 + 0.4 * (this.buffs.get('m_pileup') || 0);
      const hk = st.pileHeight ? 2 : 1;
      const base = 120 * this.pileLvMul() * (1 + st.pileDmg) * up;
      return {
        lvl, dmg: base, dmgMax: base * (1 + 1.5 * hk), heightPer10: 100 * hk, heightCap: 150 * hk,
        radius: this.pileRadius(), cd: this.pileCdMax(), charge: st.pileFast ? 0.16 : 0.32,
        fall: st.pileFast ? 60 : 46, shieldMul: st.pileShieldMul ? 3 : 2,
        fx: [st.pileFire && '🔥 炎の亀裂', st.pileShock && '⚡ 雷撃連鎖×4', st.pileFrost && '❄️ 凍結', st.pileStun && '💫 スタン1.5秒', st.pileVacuum && '🌀 吸引', st.pileBounce && '🦘 跳ね返り（追加1回）', st.pileShield && `🛡️ オーバーシールド+${30 * st.pileShield}`, st.pileHeal && `💚 命中1体につきHP+${4 * st.pileHeal}`, st.pileMeteor && '☄️ 隕星の追加爆発'].filter(Boolean),
      };
    }
    startPile() {
      this.pileState = 'charge';
      this.pileStartY = this.pos.y;
      this.pileT = this.pileTMax = this.stats.pileFast ? 0.16 : 0.32;
      this.pileDir = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      if (this.grapple.state === 'attached' || this.grapple.state === 'firing') this.detachGrapple(false);
      if (this.pileFree) this.pileFree = false; else this.pileCd = this.pileCdMax();
      if (this.has('s_echo') && Math.random() < 0.25) { this.pileCd = 0; G.ui.toastSmall('🔁 残響詠唱！'); }
      if (this.stats.techShield) G.combat.timedShield(20 * this.stats.techShield, 6, 120);
      G.sfx.whoosh(0.35, 0.6, true);
      G.sfx.magic(this.pos, 'dark');
      G.ui.pileIndicator(true);
    }
    pileImpact() {
      const st = this.stats;
      const fallH = Math.max(0, (this.pileStartY || this.pos.y) - this.pos.y);
      const lvl = this.pileLevel();
      const up = 1 + 0.4 * (this.buffs.get('m_pileup') || 0);
      const r = this.pileRadius();
      const hk = st.pileHeight ? 2 : 1;
      const dmg = 120 * this.pileLvMul() * (1 + st.pileDmg) * up * (1 + Math.min(1.5 * hk, fallH / 10 * hk));
      const pos = this.pos.clone(); pos.y += 0.3;
      // the shockwave does not pass through walls
      const hitList = G.enemies.inRadius(pos, r).filter((e) => G.combat.pileLos(pos, e));
      G.combat.explode(pos, r, dmg, { src: 'skill', pile: true, los: true, shieldMul: st.pileShieldMul ? 3 : 2, knock: 12, color: 0xd8b070, noFx: true });
      if (st.pileMeteor) setTimeout(() => G.combat.explode(pos.clone(), r * 1.5, dmg * 0.6, { src: 'skill', pile: true, los: true, color: 0xff7030 }), 120);
      G.buffs.emit('onPile', { pos: pos.clone(), dmg, r });
      for (const e of hitList) {
        if (st.pileStun) G.combat.stun(e, 1.5);
        if (st.pileFrost) G.combat.status(e, 'frost', 5);
      }
      if (st.pileShock) { const far = G.enemies.inRadius(pos, r * 2.5).filter((e) => !hitList.includes(e)); G.combat.chain(pos, 4, dmg * 0.4, r * 2.5, { src: 'skill', pile: true }); }
      if (st.pileFire) G.combat.zone(this.pos.clone(), r * 0.7, 5, 'fire', G.combat.scale(28));
      if (st.pileShield) G.combat.overshield(30 * st.pileShield, 90);
      if (st.pileHeal) G.combat.heal(4 * st.pileHeal * hitList.length);
      G.fx.ring(this.pos, r, 0xe0c090, 0.5);
      G.fx.ring(this.pos, r * 0.6, 0xffffff, 0.3);
      G.fx.dust(pos, V(0, 1, 0), 0x8a7a60, 24);
      for (let i = 0; i < 30; i++) { const a = i / 30 * 6.28; G.fx.norm.spawn(this.pos.x + Math.cos(a) * 0.5, this.pos.y + 0.1, this.pos.z + Math.sin(a) * 0.5, Math.cos(a) * r * 2, 0.5, Math.sin(a) * r * 2, 0.8, 0.5, 1.5, 0.55, 0.5, 0.42, 0.6, 0, 3); }
      G.fx.debris(pos, G.world.mats.block, 14, 0.25, 9);
      G.fx.decal(this.pos.clone(), V(0, 1, 0), 'crack', r * 1.2, true);
      G.fx.flash(pos, 0xffd090, 50, 0.2, r * 3);
      G.sfx.explosion(pos, 1.3); G.sfx.rumble(0.6, 0.9);
      this.addShake(0.9);
      this.landDip = -0.45;
      this.pileState = null;
      this.pileLandT = 0.45;
      G.ui.pileIndicator(false);
      G.buffs.emit('onSkill', { skill: { id: 'pile' } });
      if (st.pileBounce && !this._pileBounced) { this._pileBounced = true; this.vel.y = 12; this.grounded = false; this.pileFree = true; }
      else this._pileBounced = false;
    }

    onLethal() {
      // 守銭奴の執念: buy your way back
      if (this.has('e_miser') && G.game.run.coins >= 5000 && this.miserArea !== G.game.area) {
        this.miserArea = G.game.area; G.game.run.coins -= Math.floor(G.game.run.coins / 2);
        this.hp = this.stats.maxHp; this.invulnT = 2; G.sfx.coins(8); G.fx.sparks(this.chestPos(), null, 40, 0xffd040, 7);
        G.ui.toast('🧳 守銭奴の執念 — 金で命を買い戻した', 'good');
        return;
      }
      if (this.temps.has('ult_phoenix')) {
        G.combat.untemp('ult_phoenix');
        this.hp = this.stats.maxHp * (this.phoenixFull ? 1 : 0.5); this.invulnT = 2;
        G.combat.explode(this.chestPos(), 8, G.combat.scale(260) * (this.phoenixFull ? 2 : 1), { src: 'skill', ult: true, sk: 'ult_phoenix', color: 0xff8030 });
        G.ui.toast('🐦 鳳凰転生 — 炎の中から蘇った！', 'good');
        return;
      }
      // fairy bottle
      if (this.itemCount('h_fairy') > 0) {
        this.takeItem('h_fairy');
        this.hp = this.stats.maxHp; this.invulnT = 1.5;
        G.ui.toast('🧚 妖精の小瓶が砕け、命を繋いだ！', 'good'); G.sfx.heal();
        return;
      }
      if (this.has('d_secondwind') && !this.buffState.d_secondwind?.used) {
        (this.buffState.d_secondwind = this.buffState.d_secondwind || {}).used = 1;
        this.hp = this.stats.maxHp * 0.5; this.invulnT = 1.2;
        G.ui.toast('💗 不屈 — まだ倒れない！', 'good'); G.sfx.heal();
        return;
      }
      if (this.has('d_phoenix') && !this.phoenixUsed) {
        this.phoenixUsed = true;
        this.hp = this.stats.maxHp; this.invulnT = 2;
        G.combat.explode(this.chestPos(), 12, G.combat.scale(400), { src: 'skill', color: 0xff8030 });
        G.ui.toast('🐦 不死鳥の炎で蘇った！', 'good');
        return;
      }
      this.hp = 0;
      this.dead = true;
      this.deathT = 0;
      if (this.slideLoop) { this.slideLoop.stop(); this.slideLoop = null; }
      G.game.playerDied();
    }
    updateDeadCam(dt) {
      G.avatar.tpK = 0; if (G.avatar.root) G.avatar.root.visible = false;
      this.deathT += dt;
      const cam = G.camera;
      const k = Math.min(1, this.deathT / 1.2);
      cam.position.y = U.lerp(cam.position.y, this.pos.y + 0.35, dt * 3);
      cam.rotation.set(this.pitch * (1 - k) - 0.2 * k, this.yaw, k * 1.1, 'YXZ');
    }
  }
  function hfovToV(h, aspect) { return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(h) / 2) / aspect)); }
  G.hfovToV = hfovToV;
  G.Player = Player;
})();
