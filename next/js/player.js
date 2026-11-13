'use strict';
// First-person player: movement (walk/sprint/crouch/slide/jump/mantle), grapple, pile driver, camera feel, stats.
(function () {
  // the grapple's cooldown: 15 s, shortened by the grapple-cooldown stat (never below 15% of that)
  G.GRAPPLE_CD = 15;
  G.TUNNEL_TOP = 4.5; // m: the feet below this in an exit's opening (6 m high) to be let into its tunnel past the map's bounds
  G.SWIM_FLOAT = 0.75; G.SWIM_UP = 3.2; G.SWIM_SINK = 2.4; G.SWIM_HOP = 6.2; // deep water: the feet this far under the surface at the top (chest out); m/s up while jump is held; the fastest you sink; the hop out at the top (m/s)
  G.grappleCdOf = (st) => (st.grappleBase || G.GRAPPLE_CD) * (1 - Math.min(0.85, Math.max(-1, st.grappleCd || 0))); // (the class sets the base: 15-28 s, see classes.js)
  const U = G.U, I = G.input;
  const V = G.U.V;
  const BASE = {
    maxHp: 100, maxHpPct: 0, hpRegen: 0, armor: 0, moveSpeed: 0, jumpPower: 0, maxJumps: 1, airControl: 0,
    dmg: 0, headMul: 0, critChance: 0.05, critMul: 1.5, fireRate: 0, reloadSpeed: 0, magSize: 0, spread: 0, recoil: 0, adsSpeed: 0, range: 0,
    shieldDmg: 0, explosionDmg: 0, explosionRadius: 0, grenadeDmg: 0, skillDmg: 0, cdr: 0, elemChance: 0, burnDmg: 0, poisonDmg: 0, poisonStacks: 0, dotDmg: 0,
    lifesteal: 0, coinMul: 0, luck: 0, pickupRange: 4, dodge: 0, grappleRange: 42, grappleCd: 0, grappleSpeed: 0, slideBoost: 0, meleeDmg: 0, meleeCd: 0, meleeRange: 0, meleeMove: 0, meleeRecover: 0,
    bossDmg: 0, eliteDmg: 0, pierce: 0, ricochet: 0, doubleShot: 0, knock: 0, shopDiscount: 0, buffChoices: 3, buffRerolls: 0, weaponSlots: 2, ammoSave: 0,
    healMul: 0, enemyDmg: 0, enemySpeed: 0, enemyHp: 0, infAmmo: 0, lowGrav: 0, soulLantern: 0, adsDmg: 0, hipSpread: 0, extraChests: 0, chestBonus: 0,
    healDrop: 0, throwPow: 0, invis: 0, extraEnemies: 0, defense: 0, weight: 0, statusRes: 0, dotRes: 0, blastRes: 0, sprintRamp: 0,
    grappleBase: 0, guardHp: 0, elMastery: 0, elRes_fire: 0, elRes_water: 0, elRes_ice: 0, elRes_volt: 0, elRes_wind: 0, elRes_earth: 0, reactDmg: 0, reactMul: 0,
    elIcd: 0, elAuraT: 0, elSelfT: 0, elSelfRes: 0, rxFreezeT: 0, rxBlastR: 0, rxLeak: 0, rxCrystal: 0, rxBrittle: 0, rxSwirlR: 0, rxSwirlT: 0, // (the element boons: element.js)
    skillCd: 0, skillRad: 0, skillDur: 0, skillCharges: 0, techBurn: 0, techFrost: 0, techShock: 0, techStun: 0, techVamp: 0, techShield: 0,
    ultDmg: 0, ultCd: 0, ultDur: 0, ultCharge: 0, ultHeal: 0, ultShield: 0, ultOver: 0, ultEcho: 0, ultTech: 0,
    pileDmg: 0, pileRadius: 0, pileCd: 0, pileFast: 0, pileFire: 0, pileShock: 0, pileFrost: 0, pileStun: 0, pileVacuum: 0, pileBounce: 0, pileShield: 0, pileHeal: 0, pileHeight: 0, pileShieldMul: 0, pileMeteor: 0,
  };
  G.PLAYER_BASE = BASE;
  // what each stat does (the tooltip on its name in the status / inventory screens)
  G.STAT_DESC = {
    elMastery: '属性反応の強さ。爆轟・漏電などのダメージと、沸騰・熱融の倍率が上がる。値が大きいほど伸びはゆるやかになる（100で爆轟・漏電などのダメージ+50%、沸騰・熱融の倍率+0.15）。反応を強くする加護とは別にかかる。',
    elRes_fire: '炎属性の攻撃から受けるダメージを減らす（最大70%）。炎が付いている時間は変わらない。',
    elRes_water: '水属性の攻撃から受けるダメージを減らす（最大70%）。水が付いている時間は変わらない。',
    elRes_ice: '氷属性の攻撃から受けるダメージを減らす（最大70%）。氷が付いている時間は変わらない。',
    elRes_volt: '雷属性の攻撃から受けるダメージを減らす（最大70%）。雷が付いている時間は変わらない。',
    elRes_wind: '風属性の攻撃から受けるダメージを減らす（最大70%）。',
    elRes_earth: '地属性の攻撃から受けるダメージを減らす（最大70%）。',
    maxHp: 'HPの上限。',
    armor: '受けるダメージを割合で減らす（最大85%）。防御力の後にかかる。',
    dmg: '与えるダメージ全体が増える（銃・近接・スキル・爆発）。',
    fireRate: '銃の連射の速さ。近接武器の連撃の間隔にも半分だけ効く（近接攻撃の間隔と合わせて最大-50%）。',
    reloadSpeed: 'リロードの速さ。',
    critChance: '会心が出る確率。会心のダメージ数字には「!!」が付く。',
    critMul: '会心が出たときのダメージ倍率。',
    headMul: 'ヘッドショットのダメージ倍率への上乗せ。',
    moveSpeed: '移動の速さ。防具の重さで下がる。',
    hpRegen: '毎秒回復するHP。',
    lifesteal: '与えたダメージのうち、HPとして戻る割合。',
    cdr: 'スキルのクールタイムを短くする（最大60%。アルティメットには半分だけ効く）。',
    coinMul: '手に入るコインが増える。',
    skillDmg: 'スキルとアルティメットのダメージが増える。',
    explosionDmg: '爆発のダメージが増える（投擲物・爆発する弾・スキルの爆発）。',
    defense: '防具の防御力。受けるダメージが ×100÷(100＋防御力) になる。',
    weight: '防具の重さ。重いほど移動が遅くなる（布の防具は重さ0）。',
    shieldDmg: '敵のシールドに与えるダメージが増える。',
    maxJumps: '空中も含めて続けて跳べる回数。',
    grappleRange: 'グラップルが届く距離。',
    luck: 'レアリティの高い物が出やすくなる。',
  };
  G.statTip = (k) => { const n = G.STAT_NAMES[k], d = G.STAT_DESC[k]; return n && d ? `data-tip="${('<b>' + n[0] + ' ' + n[1] + '</b><br>' + d).replace(/"/g, '&quot;')}"` : ''; };
  G.STAT_NAMES = {
    elMastery: ['🔮', '属性熟練', 'n'], elRes_fire: ['🔥', '炎耐性', 'p'], elRes_water: ['💧', '水耐性', 'p'], elRes_ice: ['❄️', '氷耐性', 'p'], elRes_volt: ['⚡', '雷耐性', 'p'], elRes_wind: ['🌪️', '風耐性', 'p'], elRes_earth: ['🪨', '地耐性', 'p'],
    maxHp: ['❤️', '最大HP', 'n'], armor: ['🛡️', '被ダメ軽減', 'p'], dmg: ['💪', '与ダメ', 'p'], fireRate: ['🔁', '連射', 'p'], reloadSpeed: ['♻️', 'リロード', 'p'],
    critChance: ['💢', '会心率', 'p'], critMul: ['💥', '会心ダメージ', 'cd'], headMul: ['🎯', 'HS倍率', 'p'], moveSpeed: ['👟', '移動', 'p'], hpRegen: ['💚', '再生/秒', 'n'],
    lifesteal: ['🩸', '吸血', 'p'], cdr: ['⏳', 'CT短縮', 'p'], coinMul: ['🪙', 'コイン獲得', 'p'], skillDmg: ['🔮', 'スキル', 'p'],
    explosionDmg: ['💣', '爆発', 'p'], defense: ['🛡️', '防御力', 'n'], weight: ['⚖️', '重さ', 'n'], shieldDmg: ['🔨', '対シールド', 'p'], maxJumps: ['🪽', 'ジャンプ回数', 'n'], grappleRange: ['⚓', 'グラップル射程', 'n'], luck: ['🍀', '幸運', 'p'],
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
      this.rc = null; this.hurtKick = 0;
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
      this.cls = this.cls || (G.Classes ? G.Classes.last() : 'soldier');
      this.attStash = []; // detached attachments (kept when moving parts around or swapping a weapon out)
      this.meleeMode = false;
      this.revives = G.Run ? G.Run.startRevives() : 3;
      // Q = ultimate, X / Z / V = skills (the class's own kit is put in by G.Classes.kit below)
      this.skills = [G.abilities.makeSlot(G.DEFAULT_ULT || 'ult_bastion'), null, null, null];
      if (G.Classes) { G.Classes.kit(this); this.recalc(); this.hp = this.stats.maxHp; } // the class's gun, melee weapon, skill and ultimate (classes.js)
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
      if (b && b.mastery) { const s = this.skills.find((x) => x && x.id === b.skill); if (s) s.maxCd = G.abilities.cdOf(s); } // 習熟 counts as a separate level layer (G.abilities.totalLv)
      G.save.mark('buffs', id);
      if (G.ui) G.ui._itemsDirty = true;
    }
    recalc() {
      this._skm = null;
      const s = Object.assign({}, BASE);
      const apply = (mods, n) => { for (const k in mods) { if (typeof mods[k] === 'number') s[k] = (s[k] || 0) + mods[k] * n; } };
      for (const [id, n] of this.buffs) { const b = G.BUFF_BY_ID[id]; if (b && b.mods) apply(b.mods, n); }
      for (const [, t] of this.temps) apply(t.mods, 1);
      if (G.Classes) apply(G.Classes.mods(this), 1);
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
    // The view shaken. a: how hard (about 0..1). from (optional): where the blow came from, a point in the world - the view is thrown
    // away from it. Two things make the shake: a kick on a spring (the head thrown, swinging back and settling in two or three swings)
    // and a rumble laid over it (smooth, never the same twice, the low part of it stronger the harder the blow). Both scale with the
    // setting (設定 → 画面揺れ).
    addShake(a, from) {
      const k = a * G.save.data.settings.shake; if (!(k > 0)) return;
      this.shake = Math.min(1.2, this.shake + k);
      const sp = this.shSp || (this.shSp = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, p: 0, r: 0, vp: 0, vr: 0, t: Math.random() * 100 });
      // (in the view's own frame: x right, y up, z back. No source given: a jolt up through the ground, down and back)
      let dx = (Math.random() - 0.5) * 0.9, dy = -0.3 - Math.random() * 0.4, dz = 0.25 + Math.random() * 0.4;
      if (from && from.isVector3) {
        let wx = this.pos.x - from.x, wy = this.pos.y + this.eyeH - from.y, wz = this.pos.z - from.z; const l = Math.hypot(wx, wy, wz);
        if (l > 0.05) { wx /= l; wy /= l; wz /= l; const c = Math.cos(this.yaw), sn = Math.sin(this.yaw); dx = wx * c - wz * sn + (Math.random() - 0.5) * 0.25; dy = wy * 0.6 - 0.15; dz = wx * sn + wz * c; }
      }
      const m = Math.min(1, k);
      sp.vx += dx * m * 2.6; sp.vy += dy * m * 2.2; sp.vz += dz * m * 2.6;
      sp.vp += (dz * 0.8 - dy * 0.5 + (Math.random() - 0.5) * 0.4) * m * 1.9; sp.vr += (dx * 1.4 + (Math.random() - 0.5) * 0.5) * m * 1.9;
    }
    // A shot's kick on the view (radians: p up, y sideways; see W.recoilShot). It is not put on at once but over a few frames, at the
    // gun's own pace (o.tau: a pistol snaps up, a rocket heaves); a share of it (o.ret up, o.retH sideways) is kept to come back once the
    // firing stops (after o.delay s), eased in and out at o.k (a critically damped return: no spring snapping it back). The rest stays:
    // that much the shooter pulls back down by hand.
    addRecoil(p, y, o) {
      o = o || {};
      const rc = this.rc || (this.rc = { pp: 0, py: 0, tau: 0.02, x: 0, y: 0, vx: 0, vy: 0, k: 9, delay: 0.08 });
      rc.pp += p; rc.py += y; rc.tau = o.tau || 0.02; rc.k = o.k || 9; rc.delay = o.delay || 0.08;
      rc.x += p * (o.ret === undefined ? 0.5 : o.ret); rc.y += y * (o.retH === undefined ? 0.25 : o.retH); rc.vx = 0; rc.vy = 0;
    }
    resetRecoil() { this.rc = null; }
    // the view's recoil, each frame (postMove): the kick still to be laid on, then (the firing over) what comes back
    updateRecoil(dt) {
      const rc = this.rc; if (!rc) return;
      if (rc.pp || rc.py) {
        const k = 1 - Math.exp(-dt / rc.tau), a = rc.pp * k, b = rc.py * k;
        this.pitch += a; this.yaw += b; rc.pp -= a; rc.py -= b;
        if (Math.abs(rc.pp) < 1e-6 && Math.abs(rc.py) < 1e-6) { this.pitch += rc.pp; this.yaw += rc.py; rc.pp = 0; rc.py = 0; }
      }
      if (G.game.time - this.lastShotT > rc.delay && (rc.x > 1e-6 || Math.abs(rc.y) > 1e-6)) {
        const w = rc.k, T = Math.min(dt, 0.05), n = Math.max(1, Math.ceil(w * T / 0.12)), h = T / n;
        for (let i = 0; i < n; i++) {
          rc.vx += (-w * w * rc.x - 2 * w * rc.vx) * h; let dx = rc.vx * h; if (rc.x + dx < 0) dx = -rc.x; rc.x += dx; this.pitch += dx;
          if (rc.y) { rc.vy += (-w * w * rc.y - 2 * w * rc.vy) * h; let dy = rc.vy * h; if (Math.sign(rc.y + dy) !== Math.sign(rc.y)) dy = -rc.y; rc.y += dy; this.yaw += dy; }
        }
      }
      if (!rc.pp && !rc.py && rc.x <= 1e-6 && Math.abs(rc.y) <= 1e-6) this.rc = null;
    }
    // ---- inventory: items are grouped by category slot (4 heal / 5 guard / 6 boost / 7 tool) ----
    itemCount(id) { return this.bag ? G.Inv.countAll(this, 'item', id) : 0; }
    // the items sitting in a consumable pocket (key 4 / key 5 / G)
    slotItems(slot) { const c = this.spec && this.spec[slot]; const ids = []; if (c) for (const o of c.items) if (o.type === 'item' && !ids.includes(o.id)) ids.push(o.id); return ids; }
    // the pocket's cells in order, left to right: the item id in each cell or null (the selection wheel mirrors it: cell 1 up, 2 right, 3 down, 4 left)
    slotCells(slot) { const c = this.spec && this.spec[slot]; const cells = []; if (!c) return cells; for (let i = 0; i < c.cols; i++) cells.push(null); for (const o of c.items) if (o.type === 'item' && o.x >= 0 && o.x < c.cols) cells[o.x] = o.id; return cells; }
    selItem(slot) { let id = this.isel[slot]; const l = this.slotItems(slot); if (!id || !l.includes(id)) { id = l[0] || null; this.isel[slot] = id; } return id; }
    // when a pocket (G / 4 / 5) has room again, consumables / throwables waiting in the bag move in by themselves; the selected grenade follows what you still own
    refillPockets() {
      const IV = G.Inv; if (!this.bag || !this.spec) return;
      for (const it of this.bag.items.slice()) {
        if (it.type !== 'item') continue;
        const k = IV.specOf(it); if (!k) continue;
        const list = k === 'g' ? [this.spec.g] : [this.spec.c1, this.spec.c2];
        for (const c of list) for (const o of c.items) if (it.n > 0 && o.type === it.type && o.id === it.id && o.n < IV.maxStack(o)) { const t = Math.min(IV.maxStack(o) - o.n, it.n); o.n += t; it.n -= t; IV.changed(c); IV.changed(this.bag); }
        if (it.n <= 0) { IV.remove(this.bag, it); continue; }
        IV.remove(this.bag, it);
        if (!list.some((c) => IV.put(c, it) === 0)) IV.put(this.bag, it);
      }
      if (this.grenades && !this.grenades[this.grenadeSel]) { const o = Object.keys(this.grenades).find((x) => this.grenades[x] > 0); if (o) { this.grenadeSel = o; if (G.GrenHold && G.GrenHold.refresh) G.GrenHold.refresh(); } }
    }
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
        G.ui.itemCard(it, it.cat === 'grenade' ? `[${G.K('grenade')} で構え→クリックで投擲・長押しで選択]` : it.passive ? '[常時：持っているだけで自動発動]' : it.kit ? (it.data.forge ? '[持ち物画面で武器へドラッグして強化]' : '[持ち物画面で防具へドラッグして修復]') : pocket ? `[${G.K('item' + (G.ITEM_SLOTS.indexOf(pocket) + 1))} で使用・長押しで選択]` : '[持ち物画面から使用（消耗品枠が満杯）]');
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
      this.eyeOff = 0; this.landDip = 0; this.rc = null;
      if (this.slideLoop) { this.slideLoop.stop(); this.slideLoop = null; }
    }

    // ------------------------------------------------------------
    update(dt) {
      this._rfT = (this._rfT || 0) - dt; if (this._rfT <= 0) { this._rfT = 0.5; if (!(G.InvUI && G.InvUI.isOpen())) this.refillPockets(); }
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
      this.sprinting = this.sprintToggle && fwdIn > 0 && !ads && (!this.crouching || this._sjRun) && canSprintAfterShot && !G.weapons.reloadBlocksSprint() && !(this.st.shock > 0) && !(G.weapons.guarding && G.weapons.guarding());
      if (!this.sprinting && !S.autoSprint && !I.down('sprint') && this.sprintToggle && !this.sliding && !this._sjRun) this.sprintToggle = false; // the run broke: it does not resume by itself

      // pile driver trigger: crouch in air
      this.pileCd = Math.max(0, (this.pileCd || 0) - dt);
      this.pileLandT = Math.max(0, (this.pileLandT || 0) - dt);
      this.dragT = Math.max(0, (this.dragT || 0) - dt); // reeled in by a chain / hook: no control of your own
      if (this.pullT > 0) { this.pullT -= dt; this.vel.x = this.pullDir.x * this.pullSpd; this.vel.z = this.pullDir.z * this.pullSpd; } // the gravity pull of an ordinary foe (depth.js): a fixed, short glide
      if (this.grounded && this.pileFree && !this.pileState && this._pileBounced && this.vel.y <= 0) { this.pileFree = false; this._pileBounced = false; }
      if (crouchHit && !this.grounded && !this.pileState && !this.mantle && this.liftVy == null) {
        const below = w.groundAt(this.pos, this.hw, 60);
        if (this.pos.y - below > (G.Tutorial && G.Tutorial.active ? 0.8 : 1.3) || below === -Infinity) {
          if (this.pileReady() && !this.duelLock) this.startPile();
          else { G.ui.toastSmall(`🔨 パイルドライバー CT ${this.pileCd.toFixed(1)}秒`); G.sfx.ui('deny'); }
        }
      }

      // ---- slide ----
      // (only out of a run: crouch pressed while sprinting slides, however slow the run still is; crouch at any other time is a crouch,
      // however fast a blast, a slope, a skill or the ice has you going)
      if (this.grounded && crouchHit && this.sprinting && !this.sliding && !this.pileState && !(this.elFrozen > 0)) this.startSlide(wx, wz);
      if (this.sliding) {
        this.slideT += dt;
        if (!wantCrouch && !S.crouchToggle && this.slideT > 0.25) this.endSlide();
        else if (this.speedH < (this.slideEndV || 4.5) || this.slideT > 1.25 || !this.grounded && this.slideT > 0.3) this.endSlide();
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
      if (!this.pileState && (this.jumpBuf > -0.2 || this.swimming) && I.down('jump') && fwdIn > 0 && this.grapple.state !== 'attached') { if (this.tryMantle(fx, fz)) { this.postMove(dt, 0, true); return; } } // (swimming: held jump climbs out onto a wall's top)

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
      if (this._knockSnap) { const k = this._knockSnap, kk = this._knockK || 0; this._knockSnap = null; if (Math.hypot(this.vel.x, this.vel.z) > Math.hypot(k.x, k.z) + 0.5) { this.vel.x = k.x + (this.vel.x - k.x) * kk; this.vel.z = k.z + (this.vel.z - k.z) * kk; } const ky = Math.max(k.y, 0); if (this.vel.y > ky + 0.5) this.vel.y = ky + (this.vel.y - ky) * kk; } // 根を張る (重装兵): the knock taken cut to kk of itself
      // ---- speed target ----
      const spd = this.walkSpeed();
      let targetSpeed = spd;
      // armour: speed builds up the longer you keep sprinting (+x per second, up to 3 steps)
      this.sprintT = this.sprinting ? (this.sprintT || 0) + dt : 0;
      if (this.sprinting) targetSpeed = 9.7 * (1 + st.moveSpeed + this.clsMove() + Math.min(3, Math.floor(this.sprintT)) * (st.sprintRamp || 0)) * this.moveMul();
      if (this.crouching && !this.sliding && !this._sjRun) targetSpeed = 3.3 * (1 + st.moveSpeed * 0.5) * this.moveMul();
      if (G.weapons.adsT > 0.5) targetSpeed *= 0.62;
      if (this.st.slow > 0) targetSpeed *= Math.max(0.4, 0.7 - 0.1 * ((this.st.slowLv || 1) - 1));
      if (this.elFrozen > 0) targetSpeed = 0; // 凍結 on you (element.js)
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
      if (this.liftVy != null) this.vel.y = this.liftVy; // held by the last guardian's gravity reversal (bosses6.js)
      else if (this.pileState !== 'charge') {
        if (this.grapple.state === 'attached') this.vel.y -= g * 0.6 * dt;
        else this.vel.y -= g * dt;
      }
      // jump
      if (this.jumpBuf > 0 && !this.pileState && !(this.dragT > 0) && this.liftVy == null) {
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
      this.swim(dt);
      if (G.Strata.ladders.length && this.grapple.state !== 'attached' && !this.pileState) G.Strata.ladder(this, fwdIn > 0 || I.down('jump'), dt);
      // speed cap safety
      const vmax = 60; if (this.vel.length() > vmax) this.vel.setLength(vmax);

      this.physics(dt);
      this.updateGrapple(dt);
      this.postMove(dt, wl, false);
    }
    walkSpeed() { return 6.2 * (1 + this.stats.moveSpeed + this.clsMove()) * this.moveMul(); }
    // what is holding your run down right now (the same factors as the speed target above: slowed, frozen, wading, mud / thorns / deep
    // ground), as one share of it; your gear and class are not in it. A slide out of the run is held down with it (see startSlide)
    runDrag() {
      let k = 1;
      if (this.st.slow > 0) k *= Math.max(0.4, 0.7 - 0.1 * ((this.st.slowLv || 1) - 1));
      if (this.elFrozen > 0) k = 0;
      if (this.inWater) k *= 0.9;
      return k * (this.fieldSpeed || 1);
    }
    clsMove() { return G.Classes ? G.Classes.moveAdd() : 0; } // 連斬 (剣士)
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
      if (onGround) { this.pos.y = w.gTerr ? gnd : Math.max(this.pos.y, gnd); this.grounded = true; if (this.vel.y < 0) this.vel.y = 0; } // (on a terrain's slope the feet stay right on it: no hovering a few cm over the way down, then dropping)
      else if (wasGrounded && this.vel.y <= 0 && !this.pileState) {
        // snap down stairs / small drops
        const g2 = w.groundAt(this.pos, this.hw, 0.6);
        if (g2 > -Infinity && this.pos.y - g2 < 0.58) { this.pos.y = g2; this.grounded = true; this.vel.y = 0; }
        else { this.grounded = false; this.coyote = 0.12; }
      } else this.grounded = false;
      if (G.Strata.ropes.length) G.Strata.support(this, dt, preVy);
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
          if (this.inWater && G.Water) G.Water.splash(this.pos, 0.5 + k * 0.9, { silent: true });
          if (fall > 9) { this.addShake(k * 0.35); G.fx.dust(this.pos.clone().setY(this.pos.y + 0.05), V(0, 1, 0), 0x8a8070, 6); }
          G.buffs.emit('onLand', { speed: fall });
          if (!this.has('m_bunny') && !this.sliding && fall > 10) { this.vel.x *= 0.7; this.vel.z *= 0.7; }
        }
      }
      // fail-safes: out of bounds / abyss
      if (this.pos.y < w.killY) this.fellInPit();
      // (the bounds of the map are walls of no height, however high you go: only an exit's tunnel lets you past them, and only down in it,
      // under its 6 m opening, not over its roof)
      const inTunnel = this.pos.z < 0.5 && this.pos.y < G.TUNNEL_TOP && (w.exits || []).some((ex) => this.pos.x > ex.gx0 && this.pos.x < ex.gx1);
      if (!inTunnel) {
        this.pos.z = U.clamp(this.pos.z, 0.36, w.D - 0.36);
        if (w.nooks) { const [lo, hi] = w.xLimits(this.pos.z, this.pos.y, 0.36); this.pos.x = U.clamp(this.pos.x, lo, hi); } else this.pos.x = U.clamp(this.pos.x, 0.36, w.W - 0.36);
      }
      // safe position memory
      if (this.grounded && !this.pileState) {
        this._safeT = (this._safeT || 0) - dt;
        if (this._safeT <= 0) {
          this._safeT = 0.3;
          const ok = [[-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8]].every(([ox, oz]) => w.groundAt(V(this.pos.x + ox, this.pos.y, this.pos.z + oz), 0.1, 0.4) > -Infinity)
            && !(w.unsafeGround && w.unsafeGround(this.pos.x, this.pos.z)); // (ground that moves away, a pillar that sinks, is never the place to come back to)
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
      if (G.Strata.onRope) return 'metal';
      const a = G.world.query(this.pos.x - 0.1, this.pos.y - 0.1, this.pos.z - 0.1, this.pos.x + 0.1, this.pos.y + 0.01, this.pos.z + 0.1);
      let best = null; for (const c of a) if (!best || c.y1 > best.y1) best = c;
      const w = G.world, surf = best ? best.surf : 'stone';
      // (where the ground is turf: the ground itself is turf, what is built on it or paved over it is not)
      if (surf === 'stone' && w.mats && w.mats.biome && w.mats.biome.floorTex === 'grass' && (!best || !best.mk || best.mk === 'floor')) {
        const x = this.pos.x, z = this.pos.z, y = this.pos.y;
        for (const q of w.paved || []) if (x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3] && Math.abs(y - q[4]) < 0.3) return 'stone';
        return 'grass';
      }
      return surf;
    }
    // deep water (the drowned town, w.deepWater): hold jump and you swim up to the surface, chest out of the water, and at the top you hop
    // up out of it (held, you bob: up, a hop, back into the water, a hop... ). Moving at a wall's top while you hold jump, you climb onto
    // it (tryMantle). Let go and you sink back, slowly.
    swim(dt) {
      const w = G.world; this.swimming = false;
      if (!w || !w.deepWater || this.pileState || this.grapple.state === 'attached' || this.liftVy != null || this.mantle) return;
      const d = w.deepWater.find((q) => this.pos.x > q.x0 && this.pos.x < q.x1 && this.pos.z > q.z0 && this.pos.z < q.z1);
      if (!d || this.pos.y > d.y - 0.3) return;
      this.swimming = true;
      const top = d.y - G.SWIM_FLOAT;
      if (I.down('jump')) {
        if (this.pos.y < top - 0.05) this.vel.y = Math.max(this.vel.y, this.vel.y + (G.SWIM_UP - this.vel.y) * Math.min(1, 7 * dt));
        else if (this.vel.y < G.SWIM_HOP * 0.5) { this.vel.y = G.SWIM_HOP; this.grounded = false; if (G.Water) G.Water.splash(this.pos, 0.7, { silent: true }); } // (at the top: a hop out of the water)
      } else if (this.vel.y < -G.SWIM_SINK) this.vel.y = -G.SWIM_SINK; // (the water holds you back as you sink)
    }
    fellInPit() {
      const wf = G.world.fallFrac || 0.15;
      let dmg = this.has('m_feather') ? 0 : Math.round(this.stats.maxHp * wf);
      if (G.world.fallSpot) { dmg = Math.min(dmg, Math.max(0, Math.floor(this.hp) - 1)); this.pos.copy(G.world.fallSpotAt ? G.world.fallSpotAt(this.pos) : G.world.fallSpot); } // the last field: a heavy fall that never kills, then back on the nearest whole tile
      else {
        this.pos.copy(this.lastSafe);
        // (the ground there has gone since: the nearest ground instead)
        if (G.world.groundAt(V(this.pos.x, this.pos.y + 0.3, this.pos.z), 0.25, 0.8) === -Infinity && G.world.nearestGround) { const g = G.world.nearestGround(this.pos.x, this.pos.y, this.pos.z, 40); if (g) this.pos.set(g.x, g.y, g.z); }
      }
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
      if (this.grounded && !G.Strata.onRope) for (const z of w.lavaZones) if (this.pos.x > z.x0 && this.pos.x < z.x1 && this.pos.z > z.z0 && this.pos.z < z.z1 && this.pos.y < (z.y || 0) + 0.2 && this.pos.y > (z.y || 0) - 0.3) {
        this._lavaT = (this._lavaT || 0) - dt;
        if (this._lavaT <= 0) { this._lavaT = 0.4; G.combat.damagePlayer(5 + G.game.area * 0.6, { src: 'aoe', elem: 'fire' }); G.sfx.lava(this.pos); }
        // lava sets you alight with a fierce, long burn (it hurts several times more than an ordinary one)
        this.st.burn = Math.max(this.st.burn || 0, 5); this.st.burnMul = 4; this.st.burnLv = Math.max(this.st.burnLv || 1, 3);
      }
      // footsteps
      if (this.grounded && this.speedH > 1.2 && !this.sliding) {
        this.stepDist += this.speedH * dt;
        const stride = this.sprinting ? 2.5 : this.crouching ? 1.4 : 2.0;
        if (this.stepDist > stride) {
          this.stepDist = 0; this.footL = !this.footL;
          G.sfx.step(this.surfaceBelow(), this.crouching ? 0.4 : this.sprinting ? 1.1 : 0.75);
          if (this.inWater && G.Water) G.Water.step(this.pos, this.sprinting ? 1 : this.crouching ? 0.3 : 0.6); // (drops and a ring at your feet: water.js)
        }
        this.bobPhase += this.speedH * dt * (this.sprinting ? 1.25 : 1.45);
        this.bobAmt = U.damp(this.bobAmt, Math.min(1, this.speedH / 9), 8, dt);
      } else this.bobAmt = U.damp(this.bobAmt, 0, 6, dt);
      // camera
      this.eyeOff = U.damp(this.eyeOff, 0, 12, dt);
      this.landDip = U.damp(this.landDip, 0, 7, dt);
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.hurtKick = Math.max(0, this.hurtKick - dt * 3);
      // recoil: the kick laid on, what comes back
      this.updateRecoil(dt);
      this.pitch = U.clamp(this.pitch, -1.55, 1.55);
      const cam = G.camera;
      const bobK = S.bob * this.bobAmt * (G.weapons.adsT > 0.5 ? 0.25 : 1);
      // (a walk: the head rises and falls on each step - coming down a little sharply, as a heel does - sways with the weight from foot
      // to foot, and tips with it)
      const bobY = Math.pow(Math.abs(Math.sin(this.bobPhase)), 1.35) * 0.055 * bobK;
      const bobX = Math.cos(this.bobPhase) * 0.035 * bobK;
      const bobR = -Math.cos(this.bobPhase) * 0.0045 * bobK, bobP = Math.sin(this.bobPhase * 2) * 0.0028 * bobK;
      const sh = this.shake * this.shake;
      // the shake (see addShake): the spring, then the rumble over it
      let shX = 0, shY = 0, shZ = 0, shp = 0, shy = 0, shr = 0;
      const sp = this.shSp;
      if (sp) {
        const h = Math.min(dt, 0.033), W2 = 1936, D = 26.4;   // (7 Hz, damped to settle in two or three swings)
        sp.vx += (-W2 * sp.x - D * sp.vx) * h; sp.x += sp.vx * h; sp.vy += (-W2 * sp.y - D * sp.vy) * h; sp.y += sp.vy * h; sp.vz += (-W2 * sp.z - D * sp.vz) * h; sp.z += sp.vz * h;
        sp.vp += (-W2 * sp.p - D * sp.vp) * h; sp.p += sp.vp * h; sp.vr += (-W2 * sp.r - D * sp.vr) * h; sp.r += sp.vr * h;
        sp.t += dt;
        const t = sp.t, lo = Math.min(1, this.shake), hi = 1 - lo * 0.45;
        const n3 = (a, b, c) => Math.sin(t * 69 + a) * 0.5 + Math.sin(t * 109 + b) * 0.32 + Math.sin(t * 183 + c) * 0.18;
        shp = sp.p + (n3(0.3, 1.7, 4.1) * hi + Math.sin(t * 31 + 2.2) * lo * 0.6) * sh * 0.021;
        shy = (n3(2.9, 0.4, 5.3) * hi + Math.sin(t * 27 + 0.7) * lo * 0.6) * sh * 0.017;
        shr = sp.r + (n3(4.7, 3.1, 1.2) * hi + Math.sin(t * 23 + 5.0) * lo * 0.7) * sh * 0.019;
        shX = sp.x + n3(1.1, 5.9, 2.4) * sh * 0.005; shY = sp.y + n3(3.6, 2.2, 0.9) * sh * 0.005; shZ = sp.z;
      }
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      cam.position.set(this.pos.x + rx * (bobX + shX) - rz * shZ, this.pos.y + this.eyeH + this.eyeOff + this.landDip + bobY + shY, this.pos.z + rz * (bobX + shX) + rx * shZ);
      // tilt (strafe & slide)
      const strafe = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
      const targetRoll = (this.sliding ? 0.07 : 0) - strafe * 0.018 * (this.grounded ? 1 : 0.5) + (this.grapple.state === 'attached' ? -strafe * 0.05 : 0);
      this.roll = U.damp(this.roll, targetRoll, 8, dt);
      cam.rotation.set(this.pitch + shp + bobP + this.hurtKick * 0.03, this.yaw + shy, this.roll + shr + bobR, 'YXZ');
      // third-person camera for grapple swings and the pile driver
      const gs = this.grapple.state;
      const wantTP = gs === 'firing' || gs === 'attached' || gs === 'reelEnemy' || !!this.pileState || (this.pileLandT || 0) > 0 || !!this.duelLock; // (a duel, duel.js: third person all through)
      this.tpHold = wantTP ? 0.3 : Math.max(0, (this.tpHold || 0) - dt);
      const AV = G.avatar;
      const goingTP = wantTP || this.tpHold > 0;
      AV.returning = !goingTP;
      AV.tpK = U.damp(AV.tpK, goingTP ? 1 : 0, goingTP ? 7 : 10, dt);
      if (!goingTP && AV.tpK < 0.02) AV.tpK = 0;
      if (AV.tpK > 0.001) {
        const head = V(this.pos.x, this.pos.y + this.height * 0.85, this.pos.z);
        const f = this.forward();
        const dl = !!this.duelLock, fh = dl ? V(f.x, 0, f.z).normalize() : f; // (a duel: further back and higher, level with the ground, so you and the guardian both fit)
        const desired = head.clone().addScaledVector(fh, dl ? -5.2 : -4.4).add(V(Math.cos(this.yaw) * 0.75, dl ? 0.75 : 0.9, -Math.sin(this.yaw) * 0.75));
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
      const sl = U.clamp((this.speedH - 10.5) / 12, 0, 1) + (this.pileState === 'fall' ? 0.6 : 0) + (this.grapple.state === 'attached' ? 0.25 : 0) + (G.Classes ? G.Classes.rushLines() : 0); // (血の昂り of the 突撃兵)
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
        const dy = -I.mx * sens * slow, dp = -I.my * sens * (S.invertY ? -1 : 1);
        this.yaw += dy; this.pitch += dp;
        // pulling against the recoil by hand takes that much off what would come back by itself (no return past where you brought it)
        const rc = this.rc;
        if (rc) { if (dp < 0 && rc.x > 0) rc.x = Math.max(0, rc.x + dp); if (dy * rc.y < 0) rc.y = Math.sign(rc.y) * Math.max(0, Math.abs(rc.y) - Math.abs(dy)); }
      }
      this.pitch = U.clamp(this.pitch, -1.55, 1.55);
      // keep yaw bounded without any visible reset (pure modulo of a full turn)
      if (this.yaw > Math.PI * 8 || this.yaw < -Math.PI * 8) this.yaw = U.wrapAngle(this.yaw);
    }
    updateStatuses(dt) {
      const s = this.st;
      const sdt = dt / Math.max(0.3, 1 - (this.stats.statusRes || 0)); // armour: statuses wear off sooner
      const dr = Math.max(0.1, 1 - (this.stats.dotRes || 0));
      for (const k of ['slow', 'shock']) if (s[k] > 0) { s[k] -= sdt; if (s[k] <= 0) s[k + 'Lv'] = 0; }
      s.tick = (s.tick || 0) - dt;
      if (s.tick <= 0) {
        s.tick = 0.5;
        const sc = (1 + 0.1 * (G.game.area - 1)) * dr;
        if (s.burn > 0) { G.combat.damagePlayer(1.6 * sc * (s.burnMul || 1) * (0.7 + 0.3 * (s.burnLv || 1)), { src: 'dot', elem: null }); }
        if (s.poison > 0) { G.combat.damagePlayer(0.8 * sc * (s.poisonStacks || 1), { src: 'dot' }); }
      }
      if (s.burn > 0) { s.burn -= sdt; if (s.burn <= 0) { s.burnMul = 1; s.burnLv = 0; } }
      if (s.poison > 0) { s.poison -= sdt; if (s.poison <= 0) s.poisonStacks = 0; }
    }

    // ---- slide ----
    // wx, wz: the way the keys push (flat, unit; 0 when none)
    startSlide(wx, wz) {
      this.sliding = true; this.slideT = 0; this.crouching = true;
      this._slideRun = true; // a slide only comes out of a run: the run carries on when the slide is over
      // which way: the way you are going; barely moving yet (the first step of a run), the way you push, or face
      const hs = Math.hypot(this.vel.x, this.vel.z);
      let dx = -Math.sin(this.yaw), dz = -Math.cos(this.yaw);
      if (hs > 0.5) { dx = this.vel.x / hs; dz = this.vel.z / hs; } else if (wx || wz) { dx = wx; dz = wz; }
      // how fast: the slide's own speed (滑走 and gear change it), held down when the run itself is held down by more than a wade or thorns
      // (slowed, mud, deep ground: no slide out of it faster than out of a free run). Out of the first step of a run it starts at 60% of
      // that, rising to all of it at 7 m/s (the run's own pace: a slide out of a run at 7 m/s or more is as it always was), so it is never
      // ahead of where the run would have got. It ends when it has lost 40% of its speed (at 4.5 m/s at most)
      const top = 12.8 * (1 + this.stats.slideBoost) * Math.pow(Math.min(1, this.runDrag() / 0.8), 2);
      const sp = Math.max(hs, top * (0.6 + 0.4 * Math.min(1, hs / 7)));
      this.vel.x = dx * sp; this.vel.z = dz * sp; this.speedH = sp;
      this.slideEndV = Math.min(4.5, sp * 0.6);
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
      if (I.hit('grapple') && !this.pileState && !this.liftLock && !this.duelLock) {
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
