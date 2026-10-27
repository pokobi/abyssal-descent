'use strict';
// Area types, branching gate choice, post-clear mini shop, aim trial, NPC events, shrine, forge, trapped vaults.
(function () {
  const AR = (G.Areas = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, GM;
  AR.init = function () { P = G.player; GM = G.game; };

  // ---------------- area type catalogue ----------------
  AR.TYPES = {
    combat: { name: '戦闘', icon: '⚔️', hint: '魔物の群れ／報酬: 加護', color: '#d0703a', w: 5, min: 1 },
    elite: { name: '精鋭狩り', icon: '👑', hint: '強力な精鋭／報酬: 上位の加護', color: '#e0b040', w: 2.2, min: 2 },
    trial: { name: '射的の試練', icon: '🎯', hint: '制限時間内に的を撃て／スコアで報酬', color: '#5ab0e0', w: 1.4, min: 2 },
    event: { name: '邂逅', icon: '❓', hint: '誰かが待っている…（危険もある）', color: '#a880e0', w: 1.6, min: 2 },
    shop: { name: '商人の間', icon: '🛒', hint: '武器・スキル・アイテムを購入', color: '#7acb6a', w: 0.9, min: 2 },
    vault: { name: '宝物庫', icon: '💰', hint: '大量の宝箱（ミミック注意）', color: '#f0c040', w: 1.0, min: 3 },
    shrine: { name: '祈りの祠', icon: '⛩️', hint: '全回復＋強化を一つ', color: '#60d0c0', w: 0.9, min: 3 },
    forge: { name: '鍛冶場', icon: '⚒️', hint: '武器とスキルを鍛える', color: '#e08040', w: 0.9, min: 3 },
    alchemy: { name: '練成所', icon: '⚗️', hint: '防具や持ち物を掛け合わせて練成', color: '#58d898', w: 0.85, min: 3 },
    cursed: { name: '呪いの闘技場', icon: '☠️', hint: '強化された敵／報酬: 加護×2', color: '#d0405a', w: 0.8, min: 4 },
    boss: { name: '守護者の間', icon: '👿', hint: '守護者が待ち構える', color: '#ff5030', w: 0, min: 5 },
  };
  AR.ARENA = ['combat', 'elite', 'cursed', 'vault', 'trial'];
  AR.ROOMS = ['event', 'shrine', 'forge', 'alchemy', 'casino', 'bank', 'auction', 'merc', 'offering'];

  AR.rollGates = function (nextArea) {
    if (G.Run.isBoss(nextArea)) return ['boss'];
    if (G.Run.isPrep(nextArea)) return ['shop']; // the area before a guardian is always a single merchant hall
    const rg = new G.RNG((GM.seed ^ U.hashStr('gates' + nextArea)) >>> 0), r = () => rg.next(); // from the run's own random key: the same doors after a restart
    const keys = Object.keys(AR.TYPES).filter((k) => k !== 'boss' && AR.TYPES[k].min <= nextArea);
    const out = [];
    // always offer at least one fight so the build keeps growing
    const fights = keys.filter((k) => k === 'combat' || k === 'elite' || k === 'cursed');
    out.push(U.weighted(fights, (k) => AR.TYPES[k].w, r));
    while (out.length < 3) {
      const k = U.weighted(keys.filter((x) => !out.includes(x)), (k) => AR.TYPES[k].w * (k === 'combat' ? 0.8 : 1), r);
      out.push(k);
    }
    return U.shuffle(out, r);
  };

  // ---------------- gates ----------------
  function labelTex(t) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 220;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(14,11,8,0.88)'; g.fillRect(8, 8, 496, 204);
    g.strokeStyle = t.color; g.lineWidth = 6; g.strokeRect(8, 8, 496, 204);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '86px "Segoe UI Emoji","Noto Color Emoji",sans-serif'; if (G.Icons && G.Icons.split(t.icon).some((q) => typeof q !== 'string')) G.Icons.fillText(g, t.icon, 256, 70, { iconScale: 1.05 }); else g.fillText(t.icon, 256, 70);
    g.font = '900 44px "Noto Sans JP",sans-serif'; g.fillStyle = t.color; g.fillText(t.name, 256, 140);
    g.font = '500 24px "Noto Sans JP",sans-serif'; g.fillStyle = '#e8dcc4'; g.fillText(t.hint, 256, 186);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  AR.openGates = function (instant, preset) {
    const w = G.world;
    if (!w.exits) return;
    let types = preset && preset.length && preset.every((t) => t && AR.TYPES[t]) ? preset : AR.rollGates(GM.area + 1);
    // fewer exits than choices: the fight is the one that must survive
    const nEx = w.exits.filter((ex) => !ex.open).length;
    if (!preset && nEx < types.length) { const pri = (t) => (t === 'combat' || t === 'elite' || t === 'cursed' ? 0 : 1); types = types.slice().sort((a, b) => pri(a) - pri(b)); }
    w.exits.forEach((ex, i) => {
      if (ex.open) return;
      ex.type = types[i % types.length];
      const T = AR.TYPES[ex.type];
      ex.open = true; ex.openT = instant ? 1.999 : 0;
      ex.col.alive = false;
      ex.light.on = true; ex.light.intensity = 30; ex.light.color = T.color;
      if (ex.glow) ex.glow.material.color.set(T.color);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(T), transparent: true, depthWrite: false }));
      ex.labelY = w.strata ? 12.8 : 11.5; // hang the sign clear of the flames on the gate lintel
      sp.scale.set(5.6, 2.4, 1); sp.position.set(ex.x, ex.labelY, 1.2);
      w.group.add(sp); ex.label = sp;
    });
    if (!instant) { G.sfx.stoneGrind(V(w.W / 2, 2, 0), 2); G.sfx.bell(); }
  };

  // ---------------- mini shop (appears after each cleared arena) ----------------
  AR.spawnMiniShop = function (roadside, healOnly, preset, quiet) {
    const w = G.world;
    if (!w.miniSlots || GM.shop) return;
    if (preset) {
      // restore a mini shop exactly as it was
      const S = GM.shop = { offers: preset, rerolls: 0, w, mini: true, healUsed: false };
      for (const o of preset) { buildStand(w, o.slot.x, o.slot.z, (o.slot.y || 1.15) - 1.15); GM.buildPedestal(o, w); if (o.sold) o.mesh.visible = false; }
      healOnly = true; roadside = true; quiet = true;
      buildHeal(w, S);
      return;
    }
    const S = GM.shop = { offers: [], rerolls: 0, w, mini: true, healUsed: false };
    const kinds = U.shuffle(['weapon', 'melee', 'skill', 'attachment', 'item', 'item', 'buff', 'tech', 'forge', 'tome', GM.area >= 3 && Math.random() < 0.3 ? 'ult' : 'item'].slice()).slice(0, 3);
    const used = new Set();
    if (!healOnly) kinds.forEach((k, i) => {
      const obj = GM.pickOffer(k, used);
      if (!obj) return;
      used.add(obj.id);
      const slot = w.miniSlots[i];
      buildStand(w, slot.x, slot.z, (slot.y || 1.15) - 1.15);
      S.offers.push({ kind: k === 'pile' || k === 'tech' ? 'buff' : k, obj, price: GM.offerPrice(k === 'pile' || k === 'tech' ? 'buff' : k, obj), sold: false, slot, lv: k === 'weapon' || k === 'melee' ? GM.shopLv() : 0 });
    });
    // very rarely the travelling merchant carries a revive charm
    if (Math.random() < 0.05) { const o = S.offers.find((x) => x.kind !== 'weapon'); if (o) { o.kind = 'revive'; o.obj = GM.REVIVE; o.price = Math.round(GM.revivePrice() * 1.1 / 10) * 10; } }
    for (const o of S.offers) GM.buildPedestal(o, w);
    buildHeal(w, S);
    if (w.roadMerchant && !healOnly) { const m = G.enemies.buildModel(G.ENEMY_BY_ID.shaman_normal, {}); m.group.position.copy(w.roadMerchant); m.group.rotation.y = Math.PI / 2; w.group.add(m.group); }
    if (quiet) return;
    if (!roadside) { G.fx.smoke(V(w.W / 2, 0.5, 12), 14, 1.5, 0x5a4a30, 0.6, 1.2); G.ui.toast('🛒 旅の商人が店を広げた（北の門の前）', 'good'); }
    else setTimeout(() => G.ui.toastSmall(w.stoneVendor ? '🗿 道の脇に古の交換石機と癒しの水盆がある' : '🛒 道の脇に商人と癒しの水盆がある'), 3200);
  };
  // paid healing basin
  function buildHeal(w, S) {
    const h = w.miniHeal;
    w.addCollider(h.x - 0.7, h.y, h.z - 0.7, h.x + 0.7, h.y + 0.9, h.z + 0.7);
    const bg = new THREE.Group(); bg.position.copy(h);
    const base = new THREE.Mesh(G.Props.PG.oct, w.mats.trim); base.scale.set(0.75, 0.9, 0.75); base.position.y = 0.45; bg.add(base);
    const water = new THREE.Mesh(G.Props.PG.cyl, new THREE.MeshBasicMaterial({ color: 0x60ff90, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); water.scale.set(0.6, 0.02, 0.6); water.position.y = 0.92; bg.add(water);
    w.group.add(bg);
    w.lightSources.push({ pos: h.clone().add(V(0, 1.4, 0)), color: '#70ff9a', intensity: 4, range: 5, flame: 0, emit: false, ph: 0, prio: 1.5, steady: true });
    S.healPos = h.clone().setY(h.y + 1.0);
  }
  function buildStand(w, x, z, y) {
    y = y || 0;
    w.addCollider(x - 0.55, y, z - 0.55, x + 0.55, y + 1.15, z + 0.55);
    const g = new THREE.Group(); g.position.set(x, y, z);
    const a = new THREE.Mesh(G.Props.PG.box, w.mats.trim); a.scale.set(1.1, 0.25, 1.1); a.position.y = 0.125; g.add(a);
    const b = new THREE.Mesh(G.Props.PG.box, w.mats.block); b.scale.set(0.8, 0.8, 0.8); b.position.y = 0.65; g.add(b);
    const c = new THREE.Mesh(G.Props.PG.box, w.mats.trim); c.scale.set(1.0, 0.1, 1.0); c.position.y = 1.1; g.add(c);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    w.group.add(g);
  }
  AR.miniHealCost = () => GM.price(70 + GM.area * 9);

  // ---------------- aim trial ----------------
  AR.setupTrial = function () {
    const O = GM.objective = { kind: 'trial', t: 0, dur: 25, score: 0, combo: 0, best: 0, hits: 0, misses: 0, spawnT: 1.2, started: false, countdown: 3 };
    O.title = '射的の試練'; O.icon = '🎯';
    O.text = () => O.countdown > 0 ? `構えろ… <b>${Math.ceil(O.countdown)}</b>` : `スコア <b>${U.fmt(O.score)}</b>　残り <b>${Math.ceil(Math.max(0, O.dur - O.t))}</b>秒　コンボ ×<b>${O.combo}</b>`;
    O.progress = () => O.t / O.dur;
    AR.targets = [];
    G.ui.toast('🎯 浮遊する的を撃ち抜け！ 中心ほど高得点・連続で倍率UP', 'good');
  };
  function makeTarget() {
    const w = G.world;
    const f = P.forward(); f.y = 0; f.normalize();
    for (let k = 0; k < 20; k++) {
      const ang = U.rand(-1.1, 1.1);
      const d = f.clone().applyAxisAngle(V(0, 1, 0), ang);
      const dist = U.rand(9, 30);
      const p = P.pos.clone().addScaledVector(d, dist); p.y = P.pos.y + U.rand(1.0, 6.5);
      if (p.x < 2 || p.z < 2 || p.x > w.W - 2 || p.z > w.D - 2) continue;
      if (!w.los(G.camera.position, p) || !w.boxFree(p.x - 0.7, p.y - 0.7, p.z - 0.7, p.x + 0.7, p.y + 0.7, p.z + 0.7)) continue;
      const small = Math.random() < 0.25, moving = Math.random() < 0.35 + GM.area * 0.01;
      const s = small ? 0.65 : 1;
      const g = new THREE.Group();
      const ringM = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.4, emissive: c, emissiveIntensity: 0.25 });
      const disc = (r, c, z) => { const m = new THREE.Mesh(G.Props.PG.cyl, ringM(c)); m.scale.set(r, 0.05, r); m.rotation.x = Math.PI / 2; m.position.z = z; g.add(m); };
      disc(0.6 * s, 0x8a6a3a, 0); disc(0.42 * s, 0xe8dcc0, 0.02); disc(0.26 * s, 0xa02818, 0.04); disc(0.12 * s, 0xffd060, 0.06);
      g.position.copy(p); g.lookAt(G.camera.position);
      g.scale.setScalar(0.01);
      G.scene.add(g);
      G.fx.sparks(p, null, 8, 0xffd070, 3);
      const T = {
        isEnemy: true, custom: true, alive: true, noBar: true, ignoreCount: true, noReward: true, isTarget: true,
        def: { id: 'target', name: '的', plan: 'target' }, st: {}, level: 1, hp: 1, maxHp: 1, shield: 0, maxShield: 0, radius: 0.6 * s, height: 1, pos: p.clone(), centerRef: p.clone(),
        hitW: [{ w: p.clone(), r: 0.6 * s, part: 'body' }, { w: p.clone(), r: 0.16 * s, part: 'head' }], bloodColor: 0xd0a040, lastHitT: -10, flinch: 0,
        life: small ? 2.0 : 2.8, maxLife: small ? 2.0 : 2.8, base: p.clone(), ph: Math.random() * 6, moving, small, mesh: g,
        centerPos() { return this.centerRef.clone(); }, knockback() {},
        update(dt) {
          this.life -= dt;
          const k = Math.min(1, (this.maxLife - this.life) * 6);
          this.mesh.scale.setScalar(Math.max(0.01, k * Math.min(1, this.life * 2)));
          if (this.moving) { this.pos.copy(this.base); this.pos.x += Math.sin(G.game.time * 2.2 + this.ph) * 2.5; this.pos.y += Math.sin(G.game.time * 3.1 + this.ph) * 0.6; }
          this.mesh.position.copy(this.pos); this.mesh.lookAt(G.camera.position);
          this.centerRef.copy(this.pos); for (const h of this.hitW) h.w.copy(this.pos);
          if (this.life <= 0 && this.alive) { this.alive = false; this.removeMesh(); AR.onTargetMiss(this); }
        },
        removeMesh() { G.scene.remove(this.mesh); this.removed = true; },
        remove() { this.removeMesh(); },
        die(info) { if (!this.alive) return false; this.alive = false; AR.onTargetHit(this, info); this.removeMesh(); return false; },
      };
      G.enemies.add(T); AR.targets.push(T);
      return T;
    }
    return null;
  }
  AR.onTargetHit = function (T, info) {
    const O = GM.objective;
    if (!O || O.kind !== 'trial') return;
    const speed = Math.max(0, T.life / T.maxLife);
    const center = info && info.head;
    O.combo++; O.best = Math.max(O.best, O.combo); O.hits++;
    const mult = Math.min(3, 1 + O.combo * 0.1);
    const pts = Math.round((100 + (center ? 120 : 0) + speed * 120 + (T.small ? 80 : 0) + (T.moving ? 60 : 0)) * mult);
    O.score += pts;
    G.fx.dmgNum(T.pos.clone().add(V(0, 0.6, 0)), '+' + pts, center ? 'head' : 'crit');
    G.fx.sparks(T.pos, null, 18, center ? 0xffe070 : 0xffb050, 6);
    G.fx.debris(T.pos, G.world.mats.wood, 6, 0.12, 5);
    G.sfx.breakObj(T.pos, 'wood'); if (center) G.sfx.ui('ready');
    if (O.combo % 10 === 0) G.ui.feed(`🎯 ${O.combo} コンボ！`, 'big');
  };
  AR.onTargetMiss = function () {
    const O = GM.objective; if (!O || O.kind !== 'trial') return;
    if (O.combo >= 5) G.ui.toastSmall('コンボが途切れた…');
    O.combo = 0; O.misses++;
  };
  AR.updateTrial = function (dt) {
    const O = GM.objective;
    if (!O || O.kind !== 'trial' || GM.areaCleared) return;
    if (O.countdown > 0) { const prev = Math.ceil(O.countdown); O.countdown -= dt; if (Math.ceil(O.countdown) !== prev) G.sfx.ui(O.countdown <= 0 ? 'select' : 'click'); return; }
    O.t += dt;
    O.spawnT -= dt;
    const alive = AR.targets.filter((t) => t.alive).length;
    const maxAlive = 2 + Math.min(3, Math.floor(O.t / 7));
    if (O.spawnT <= 0 && alive < maxAlive) { makeTarget(); O.spawnT = U.rand(0.25, 0.6); }
    AR.targets = AR.targets.filter((t) => t.alive);
    // the clock: ticks in the last 10 seconds, faster and higher in the last 5, a gong at the end
    const left = O.dur - O.t, sec = Math.ceil(left);
    if (sec !== O.lastSec) {
      O.lastSec = sec;
      if (sec <= 10 && sec > 0) G.sfx.tick && G.sfx.tick(sec <= 5 ? 1 : 0, sec);
    }
    const half = Math.floor(left * 2);
    if (left <= 5 && left > 0 && half !== O.lastHalf) { O.lastHalf = half; if (half % 2 === 1 && G.sfx.tick) G.sfx.tick(2, sec); }
    G.ui.trialClock && G.ui.trialClock(left, O.dur);
    if (O.t >= O.dur) { G.sfx.bell(); G.ui.trialClock && G.ui.trialClock(-1); AR.finishTrial(); }
  };
  AR.finishTrial = function () {
    const O = GM.objective;
    for (const t of AR.targets) if (t.alive) { t.alive = false; t.removeMesh(); }
    AR.targets = [];
    const rank = O.score >= 15500 ? 'S' : O.score >= 9500 ? 'A' : O.score >= 4500 ? 'B' : 'C';
    O.rank = rank;
    const coins = Math.round(Math.min(O.score / 45, 260 + GM.area * 35));
    G.ui.banner(`RANK ${rank}`, `スコア ${U.fmt(O.score)} ／ 命中 ${O.hits} ／ 最大コンボ ${O.best}`, false, true);
    G.combat.coins(coins, null, '射的報酬');
    if (rank === 'B') { const it = U.pick(G.ITEMS.filter((x) => G.RARITY[x.rarity].tier <= 2)); if (P.addItem(it.id, 1)) { G.ui.toast(`${it.icon} ${it.name} を手に入れた`, 'good'); G.ui.gain(it); } }
    GM.clearArea({ reward: rank === 'S' ? 'boost' : rank === 'A' ? 'buff' : 'none', noBase: true });
  };

  // ---------------- curses helpers ----------------
  AR.addCurse = function (id) {
    const pool = G.BUFFS.filter((b) => b.cat === 'curse' && (P.buffs.get(b.id) || 0) < b.max);
    const c = id ? G.BUFF_BY_ID[id] : U.pick(pool);
    if (!c) return null;
    P.addBuff(c.id);
    G.ui.itemCard(c, '[呪い]');
    G.ui.toast(`🕯️ 呪い「${c.name}」を受けた`, 'warn');
    G.sfx.magic(P.pos, 'dark');
    return c;
  };
  AR.curses = () => [...P.buffs.keys()].filter((id) => G.BUFF_BY_ID[id] && G.BUFF_BY_ID[id].cat === 'curse');
  AR.removeCurse = function (id) {
    const n = P.buffs.get(id); if (!n) return;
    if (n > 1) P.buffs.set(id, n - 1); else P.buffs.delete(id);
    P.recalc();
    G.ui.toast(`✨ 呪い「${G.BUFF_BY_ID[id].name}」が解けた`, 'good');
  };
  AR.randomGoodBuff = function (minTier) {
    const pool = G.BUFFS.filter((b) => b.cat !== 'curse' && G.RARITY[b.rarity].tier >= (minTier || 0) && (P.buffs.get(b.id) || 0) < b.max);
    const b = U.pick(pool); if (!b) return null;
    P.addBuff(b.id); G.ui.itemCard(b, '[加護]'); G.ui.toast(`${b.icon} ${b.name} を獲得`, 'good');
    return b;
  };

  // ---------------- NPC events ----------------
  const cost = (base) => Math.round((base + GM.area * base * 0.12) / 10) * 10;
  // armour repair: price follows the missing durability (see G.Inv.repairCost)
  const repairPrice = (which, frac) => Math.max(10, Math.round(GM.price(G.Inv.repairCost(P, which, frac)) / 10) * 10);
  AR.EVENTS = [
    { id: 'armorer', npc: '旅の鎧職人', icon: '🛡️', text: '「傷んだ鎧は命取りだ。腕のいい職人が直してやろう」',
      opts: () => { const eq = G.Inv.damaged(P, 'equip').length, all = G.Inv.damaged(P, 'all').length, c1 = repairPrice('equip', 1), c2 = repairPrice('all', 1), ch = repairPrice('equip', 0.5);
        return [{ icon: '🛡️', label: `装備中の防具をすべて修理（${c1}🪙）`, sub: eq ? `傷んでいる防具 ${eq}点 → 耐久を全回復` : '傷んでいる防具はない', disabled: !eq || GM.run.coins < c1, run: () => { GM.run.coins -= c1; G.Inv.repair(P, 'equip', 1); G.ui.toast('🛡️ 装備中の防具を修理した', 'good'); } },
          { icon: '🎒', label: `持っている防具をすべて修理（${c2}🪙）`, sub: all ? `インベントリの中も含めて ${all}点 → 耐久を全回復` : '傷んでいる防具はない', disabled: !all || GM.run.coins < c2, run: () => { GM.run.coins -= c2; G.Inv.repair(P, 'all', 1); G.ui.toast('🎒 持っている防具を修理した', 'good'); } },
          { icon: '🔧', label: `応急処置（${ch}🪙）`, sub: eq ? '装備中の防具の失われた耐久を半分だけ回復' : '傷んでいる防具はない', disabled: !eq || GM.run.coins < ch, run: () => { GM.run.coins -= ch; G.Inv.repair(P, 'equip', 0.5); G.ui.toast('🔧 応急処置をした', 'good'); } }]; } },
    { id: 'blood_altar', npc: '血の司祭', icon: '🩸', text: '「血を捧げよ。さすれば力を授けよう」\n最大HPを永続的に10%失う代わりに、上位の加護を一つ選べる。',
      opts: () => [{ icon: '🩸', label: '血を捧げる', sub: '最大HP -10%（永続） → 上位の加護を選択', run: () => { P.permMaxHp -= Math.round(P.stats.maxHp * 0.1); P.recalc(); return { boon: 'boost' }; } }] },
    { id: 'gambler', npc: '骸骨の賭博師', icon: '🎲', text: '「賭けをしないか？ 所持金の3割を賭けて、勝てば倍だ」',
      opts: () => { const bet = Math.floor(GM.run.coins * 0.3); return [{ icon: '🎲', label: `${bet}🪙 賭ける`, sub: '勝率50%：勝てば賭け金×2', disabled: bet < 20, run: () => { if (Math.random() < 0.5) { G.combat.coins(bet, null, '賭けに勝利'); G.ui.toast('🎲 勝った！', 'good'); } else { GM.run.coins -= bet; G.ui.toast(`🎲 負けた… -${bet}🪙`, 'warn'); } } }]; } },
    { id: 'cursed_spring', npc: '泉の番人', icon: '⛲', text: '「この泉の水は傷を癒す。だが、時に呪いも運ぶ」',
      opts: () => [{ icon: '🥤', label: '泉の水を飲む', sub: 'HP全回復＋50%で加護 / 50%で呪い', run: () => { G.combat.heal(9999); G.sfx.drink(); if (Math.random() < 0.5) AR.randomGoodBuff(1); else AR.addCurse(); } }] },
    { id: 'lost_soul', npc: '迷える魂', icon: '👻', text: '「…さむい…なにか…わけて…」\n施せば何かを返してくれそうだ。',
      opts: () => [{ icon: '🪙', label: `${cost(80)}🪙 施す`, sub: 'レア以上の加護を一つ得る', disabled: GM.run.coins < cost(80), run: () => { GM.run.coins -= cost(80); AR.randomGoodBuff(2); } },
        { icon: '🗡️', label: '魂を斬り払う', sub: '+' + cost(150) + '🪙 ／ 呪い「狩られる者」', run: () => { G.combat.coins(cost(150), null, '魂の残り香'); AR.addCurse('c_hunted'); } }] },
    { id: 'ghost_smith', npc: '亡霊の鍛冶師', icon: '⚒️', text: '「その武器、鍛え直してやろう。代価は…お前の運だ」',
      opts: () => [{ icon: '⚒️', label: '鍛えてもらう', sub: `${P.weapon.def.name} の強化値+2 ／ ランダムな呪い`, disabled: (P.weapon.lv || 0) >= AR.FORGE_MAX, run: () => { P.weapon.lv = Math.min(AR.FORGE_MAX, (P.weapon.lv || 0) + 2); P.weapon.ver++; G.ui.refreshWeapon(); G.ui.toast(`⚒️ ${P.weapon.def.name} +${P.weapon.lv}`, 'good'); AR.addCurse(); } }] },
    { id: 'peddler', npc: '怪しい行商人', icon: '🎁', text: '「中身は開けてのお楽しみさ。損はさせない…たぶんね」',
      opts: () => [{ icon: '🎁', label: `謎の箱を買う（${cost(160)}🪙）`, sub: '武器／スキル／アイテム／呪い のどれか', disabled: GM.run.coins < cost(160), run: () => { GM.run.coins -= cost(160); const r = Math.random(); if (r < 0.25) { const wd = U.pick(G.WEAPONS.filter((x) => G.RARITY[x.rarity].tier >= 2)); GM.giveWeapon(wd.id); } else if (r < 0.42) { const sk = U.pick(G.SKILLS.filter((x) => !P.skills.some((s) => s && s.id === x.id))); GM.giveSkill(sk.id); } else if (r < 0.82) { for (let i = 0; i < 2; i++) { const it = U.pick(G.ITEMS.filter((x) => G.RARITY[x.rarity].tier >= 1)); P.addItem(it.id, 1); } } else AR.addCurse(); } }] },
    { id: 'ambush', npc: '物乞いの老人', icon: '🧓', text: '「…近う寄れ…」\n（どこか様子がおかしい）',
      opts: () => [{ icon: '⚔️', label: '近づく', sub: '???', run: () => { G.ui.toast('罠だ！ 魔物が現れた！', 'warn'); for (let i = 0; i < 2 + Math.floor(GM.area / G.Run.CYCLE); i++) GM.spawnEnemy({ elite: true, near: true }); GM.ambushReward = true; } }] },
    { id: 'spirit', npc: '囚われた精霊', icon: '🧚', text: '「封印を解いて…あなたの力を少しだけ分けて…」',
      opts: () => [{ icon: '💔', label: '生命力を分け与える', sub: '現在HPの40%を失う → 使い魔を得る', run: () => { P.hp = Math.max(1, P.hp * 0.6); const b = P.has('z_owl') ? 'z_wolf' : 'z_owl'; P.addBuff(b); G.ui.itemCard(G.BUFF_BY_ID[b], '[使い魔]'); } }] },
    { id: 'purifier', npc: '浄化の僧', icon: '📿', text: '「呪いに蝕まれておるな。祓ってしんぜよう」',
      opts: () => { const cs = AR.curses(); return [{ icon: '✨', label: `全ての呪いを祓う（${cost(140)}🪙）`, sub: cs.length ? `呪い ${cs.length}種` : '呪いはない', disabled: !cs.length || GM.run.coins < cost(140), run: () => { GM.run.coins -= cost(140); for (const id of cs) { P.buffs.delete(id); } P.recalc(); G.ui.toast('✨ 全ての呪いが祓われた', 'good'); } },
        { icon: '🙏', label: '祈りを受ける', sub: 'HPを50%回復', run: () => { G.combat.heal(P.stats.maxHp * 0.5); G.sfx.heal(); } }]; } },
    { id: 'veteran', npc: '老兵', icon: '🪖', text: '「その落下の拳…まだ甘い。稽古をつけてやる」',
      opts: () => [{ icon: '🔨', label: '稽古を受ける', sub: 'HP30を失う → スキル・アルティメットの強化を一つ選ぶ', run: () => { P.hp = Math.max(1, P.hp - 30); return { boon: 'pile' }; } }] },
    { id: 'bard', npc: '吟遊詩人', icon: '🪕', text: '「一曲いかが？ 次の戦いで力が湧くよ」',
      opts: () => [{ icon: '🎵', label: `歌を聴く（${cost(60)}🪙）`, sub: '120秒間 与ダメ+25%・移動速度+10%', disabled: GM.run.coins < cost(60), run: () => { GM.run.coins -= cost(60); G.combat.temp('bard', 120, { dmg: 0.25, moveSpeed: 0.1 }, '🪕'); } }] },
    { id: 'cartographer', npc: '地図描き', icon: '🗺️', text: '「この先に隠し宝がある。地図、要るかい？」',
      opts: () => [{ icon: '🗺️', label: `地図を買う（${cost(70)}🪙）`, sub: 'この場に宝箱が出現する', disabled: GM.run.coins < cost(70), run: () => { GM.run.coins -= cost(70); GM.spawnChestNear(1); } }] },
  ];
  AR.setupEvents = function () {
    const w = G.world;
    // seeded so that a resumed area has the same visitors
    const er = new G.RNG((GM.seed ^ U.hashStr('events' + GM.area)) >>> 0);
    const evs = U.shuffle(AR.EVENTS.slice(), () => er.next()).slice(0, w.npcSpots.length);
    w.npcSpots.forEach((pos, i) => {
      const ev = evs[i];
      const def = ev.id === 'lost_soul' || ev.id === 'spirit' ? G.ENEMY_BY_ID.wraith_normal : ev.id === 'gambler' ? G.ENEMY_BY_ID.skeleton_bone : G.ENEMY_BY_ID.shaman_normal;
      const m = G.enemies.buildModel(def, {});
      m.group.position.copy(pos); w.group.add(m.group);
      w.lightSources.push({ pos: pos.clone().add(V(0, 2.6, 0.6)), color: '#d0a0ff', intensity: 6, range: 7, flame: 0, emit: false, ph: 0, prio: 2, steady: true });
      w.interactables.push({ type: 'npc', ev, pos: pos.clone().add(V(0, 1.4, 0)), model: m, used: false });
    });
  };
  // ---------------- transmutation hall (練成所) ----------------
  const ALCH_MAX = 2; // transmutations allowed per hall
  const alchCauldron = () => G.world && G.world.interactables.find((i) => i.type === 'cauldron');
  AR.setupAlchemy = function () {
    const w = G.world;
    const m = G.enemies.buildModel(G.ENEMY_BY_ID.shaman_normal, {});
    m.group.position.copy(w.npcSpots[0]); w.group.add(m.group);
    const light = { pos: w.cauldronPos.clone().add(V(0, 1.1, 0)), color: '#58ff98', intensity: 9, range: 10, flame: 0, emit: false, ph: 0, prio: 3, steady: true };
    w.lightSources.push(light);
    w.interactables.push({ type: 'cauldron', pos: w.cauldronPos.clone(), used: 0, model: m, light });
  };
  function alchExtinguish(cz) {
    if (!cz || cz.dead) return;
    cz.dead = true;
    if (cz.light) { cz.light.on = false; cz.light.intensity = 0; }
    const vis = G.world && G.world.cauldronVis;
    if (vis) {
      if (vis.brew && vis.brew.material) {
        vis.brew.material = vis.brew.material.clone();
        vis.brew.material.color.setHex(0x1e2422);
        vis.brew.material.blending = THREE.NormalBlending;
        vis.brew.material.opacity = 0.92;
        vis.brew.material.needsUpdate = true;
      }
      for (const r of vis.rings || []) { r.sp = 0; if (r.m) r.m.visible = false; }
    }
    const p = (G.world && G.world.cauldronPos) ? G.world.cauldronPos.clone() : P.pos.clone().add(V(0, 1, 0));
    G.fx.smoke && G.fx.smoke(p.clone().add(V(0, 0.9, 0)), 14, 0x3b4440);
  }
  AR.extinguishAlchemy = alchExtinguish;
  function alchFx() {
    const cz = alchCauldron();
    if (cz) { cz.used = (cz.used || 0) + 1; if (cz.used >= ALCH_MAX) alchExtinguish(cz); }
    const p = (G.world && G.world.cauldronPos) ? G.world.cauldronPos.clone() : P.pos.clone().add(V(0, 1, 0));
    G.sfx.magic && G.sfx.magic(p, 'holy'); G.sfx.ui('rare');
    G.fx.sparks(p.clone().add(V(0, 0.3, 0)), V(0, 1, 0), 32, 0x58ff98, 7);
    G.fx.ring(p.clone(), 2.2, 0x58ff98, 0.55);
  }
  const ALCH_CATS = {
    armor: { name: '🛡️ 防具', short: '防具' },
    weapon: { name: '🔫 武器', short: '武器' },
    att: { name: '🔩 パーツ', short: 'アタッチメント' },
    item: { name: '🧪 道具', short: 'アイテム' },
    valuable: { name: '💎 金品', short: '金品（実用変換）' },
  };
  const RAR_BY_TIER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  function alchAllItems() {
    const out = [];
    for (const sl of G.ARMOR_SLOTS) {
      const it = P.equip && P.equip[sl.id];
      const d = it && G.ARMOR_BY_ID[it.id];
      if (!d) continue;
      const S = G.ARMOR_SLOT_BY_ID[d.slot], M = G.ARMOR_MAT_BY_ID[d.mat], dur = Math.round(G.Inv.durFrac(it) * 100);
      const fx = d.fixed.map((f) => '◆' + f.desc).concat((it.ench || []).map((e) => '✦' + G.enchantText(e))).join(' ');
      out.push({ uid: 'eq:' + sl.id, cat: 'armor', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: G.armorIcon(d), name: d.name, badge: '装備中',
        sub: `${S.name}（${M.name}） 防御${d.def} 耐久${dur}%${fx ? ' · ' + fx : ''}`, d, it, eq: sl.id,
        consume: () => { if (P.equip[sl.id] === it) P.equip[sl.id] = null; } });
    }
    for (const it of (P.bag ? P.bag.items : [])) {
      if (it.type === 'armor' && G.ARMOR_BY_ID[it.id]) {
        const d = G.ARMOR_BY_ID[it.id], S = G.ARMOR_SLOT_BY_ID[d.slot], M = G.ARMOR_MAT_BY_ID[d.mat], dur = Math.round(G.Inv.durFrac(it) * 100);
        const fx = d.fixed.map((f) => '◆' + f.desc).concat((it.ench || []).map((e) => '✦' + G.enchantText(e))).join(' ');
        out.push({ uid: 'bag:' + it.uid, cat: 'armor', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: G.armorIcon(d), name: d.name, badge: '',
          sub: `${S.name}（${M.name}） 防御${d.def} 耐久${dur}%${fx ? ' · ' + fx : ''}`, d, it, eq: null,
          consume: () => { G.Inv.remove(P.bag, it); } });
      }
    }
    for (const pw of G.weapons.gunsInOrder()) {
      const d = pw.def, lv = pw.lv || 0;
      out.push({ uid: 'wep:' + P.weapons.indexOf(pw), cat: 'weapon', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: d.icon, name: `${d.name}${lv ? ' +' + lv : ''}`, badge: '装備中',
        sub: `${d.mythic ? '✴️ 神器 · ' : ''}銃（${d.cat}）${lv ? ' · 強化+' + lv : ''}`, d, w: pw, gun: true, lv,
        consume: () => { GM.stashAtts(pw); const idx = P.weapons.indexOf(pw); if (idx >= 0) P.weapons.splice(idx, 1); P.wOrder = (P.wOrder || []).map((t) => (t === pw ? null : t)); } });
    }
    if (P.melee && P.melee.id !== (G.BARE_MELEE || 'fists')) {
      const d = P.melee.def, lv = P.melee.lv || 0;
      out.push({ uid: 'wep:melee', cat: 'weapon', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: d.icon, name: `${d.name}${lv ? ' +' + lv : ''}`, badge: '装備中',
        sub: `${d.mythic ? '✴️ 神器 · ' : ''}近接武器${lv ? ' · 強化+' + lv : ''}`, d, w: P.melee, gun: false, lv,
        consume: () => { P.melee = G.weapons.makeMelee(G.BARE_MELEE || 'fists'); } });
    }
    for (const pw of G.weapons.gunsInOrder()) for (const sl in pw.atts) {
      const id = pw.atts[sl], d = G.ATT_BY_ID[id];
      if (!d) continue;
      out.push({ uid: 'att:w:' + P.weapons.indexOf(pw) + ':' + sl, cat: 'att', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: d.icon, name: d.name, badge: '装着中',
        sub: `${G.ATT_SLOTS[d.slot].name}（${pw.def.name}） — ${d.desc}`, d, w: pw, sl,
        consume: () => { delete pw.atts[sl]; pw.ver++; if (!P.meleeMode && pw === P.weapon) G.weapons.equip(true); } });
    }
    for (const it of (P.bag ? P.bag.items : [])) {
      if (it.type === 'att' && G.ATT_BY_ID[it.id]) {
        const d = G.ATT_BY_ID[it.id];
        out.push({ uid: 'att:b:' + it.uid, cat: 'att', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: d.icon, name: d.name, badge: '',
          sub: `${G.ATT_SLOTS[d.slot].name} — ${d.desc}`, d, it,
          consume: () => { G.Inv.remove(P.bag, it); } });
      }
    }
    for (const c of G.Inv.pcs(P)) for (const o of c.items) {
      if (o.type === 'item' && G.ITEM_BY_ID[o.id]) {
        const d = G.ITEM_BY_ID[o.id];
        for (let k = 0; k < (o.n || 1); k++) {
          out.push({ uid: `itm:${o.uid}:${k}`, cat: 'item', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: d.icon, name: d.name, badge: '',
            sub: d.desc || '', d, itemId: o.id,
            consume: () => { P.takeItem(o.id); } });
        }
      }
    }
    for (const it of (P.bag ? P.bag.items : [])) {
      if (it.type === 'valuable' && G.VALUABLE_BY_ID[it.id]) {
        const d = G.VALUABLE_BY_ID[it.id];
        out.push({ uid: 'val:' + it.uid, cat: 'valuable', rarity: d.rarity, tier: G.RARITY[d.rarity].tier, icon: d.icon, name: d.name, badge: '',
          sub: `価値 ${G.Inv.value(it)}🪙 — ${d.desc}`, d, it,
          consume: () => { G.Inv.remove(P.bag, it); } });
      }
    }
    return out;
  }
  function alchChoiceModal(title, desc, opts) {
    GM.state = 'modal';
    G.input.exitLock();
    const wrap = opts.map((o) => Object.assign({}, o, { onPick: () => { o.onPick(); if (GM._keepModal) { GM._keepModal = false; return; } GM.resume(); } }));
    G.ui.choice(title, desc, wrap, null);
  }
  function alchOpenResult(a, b) {
    const tA = a.tier, targetTier = Math.min(4, tA + 1), rarName = G.RARITY[RAR_BY_TIER[targetTier]].name;
    const consumeBoth = () => { a.consume(); b.consume(); };
    if (a.cat === 'armor') {
      let pool = G.ARMOR.filter((x) => G.RARITY[x.rarity].tier === targetTier && (tA < 4 || (x.id !== a.d.id && x.id !== b.d.id)));
      if (!pool.length) pool = G.ARMOR.filter((x) => G.RARITY[x.rarity].tier === targetTier);
      const cands = [];
      const sameSlot = pool.filter((x) => x.slot === a.d.slot || x.slot === b.d.slot);
      const sameMat = pool.filter((x) => (x.mat === a.d.mat || x.mat === b.d.mat) && !cands.includes(x));
      if (sameSlot.length) cands.push(U.pick(sameSlot));
      const sm = sameMat.filter((x) => !cands.includes(x));
      if (sm.length) cands.push(U.pick(sm));
      for (const x of U.shuffle(pool.slice())) { if (cands.length >= 3) break; if (!cands.includes(x)) cands.push(x); }
      const built = cands.map((d) => {
        const inst = G.Inv.makeArmor(d.id);
        if (targetTier >= 4 && (!inst.ench || inst.ench.length < 2)) inst.ench = G.rollEnchants('legendary');
        return { d, inst };
      });
      const opts = built.map(({ d, inst }) => {
        const S = G.ARMOR_SLOT_BY_ID[d.slot], M = G.ARMOR_MAT_BY_ID[d.mat];
        const fx = d.fixed.map((f) => '◆' + f.desc).concat((inst.ench || []).map((e) => '✦' + G.enchantText(e))).join(' ／ ');
        return { icon: G.armorIcon(d), label: `${d.name}（${G.RARITY[d.rarity].name}）`, sub: `${S.name}（${M.name}）・防御力${d.def}・新品（耐久100%）${fx ? ' — ' + fx : ''}`, onPick: () => {
          consumeBoth();
          if (P.equip && !P.equip[d.slot]) { P.equip[d.slot] = inst; P.recalc(); }
          else { P.recalc(); G.Inv.give(P, 'armor', d.id, 1, { ench: inst.ench }); }
          G.ui.refreshItems();
          alchFx(); G.ui.toast(`⚗️ ${a.d.name} ＋ ${b.d.name} → ${d.icon} ${d.name}`, 'good'); G.ui.itemCard(d, '[防具練成]');
        } };
      });
      alchChoiceModal(`🛡️ 練成結果の選択（${rarName}）`, `${a.d.icon} ${a.d.name} ＋ ${b.d.icon} ${b.d.name} から、次のうち1つを練成する。`, opts);
      return;
    }
    if (a.cat === 'weapon') {
      const newLv = Math.max(a.lv || 0, b.lv || 0);
      const gunsLeft = P.weapons.length - (a.gun ? 1 : 0) - (b.gun ? 1 : 0);
      const allowMythic = tA >= 4;
      let gunPool = G.WEAPONS.filter((x) => x.id !== 'starter' && x.id !== a.d.id && x.id !== b.d.id && (allowMythic ? (x.mythic || G.RARITY[x.rarity].tier === 4) : (!x.mythic && G.RARITY[x.rarity].tier === targetTier)));
      if (!gunPool.length) gunPool = G.WEAPONS.filter((x) => x.id !== 'starter' && !x.mythic && G.RARITY[x.rarity].tier === targetTier);
      const meleePool = gunsLeft > 0 ? G.MELEE.filter((x) => !G.isDefaultMelee(x.id) && x.id !== a.d.id && x.id !== b.d.id && (allowMythic ? (x.mythic || G.RARITY[x.rarity].tier === 4) : (!x.mythic && G.RARITY[x.rarity].tier === targetTier))) : [];
      const pool = (!a.gun || !b.gun) && meleePool.length ? gunPool.concat(meleePool) : gunPool;
      const cands = U.shuffle(pool.slice()).slice(0, 3);
      const opts = cands.map((d) => ({ icon: d.icon, label: `${d.name}${newLv ? ' +' + newLv : ''}（${d.mythic ? '★神器' : G.RARITY[d.rarity].name}）`, sub: `${d.kind === 'melee' ? '🗡️ 近接武器' : '🔫 ' + d.cat} — ${d.traitDesc || (d.trait && G.WEAPON_TRAITS[d.trait] ? G.WEAPON_TRAITS[d.trait].desc : d.desc || '')}`, onPick: () => {
        consumeBoth();
        if (d.kind === 'melee') {
          P.melee = G.weapons.makeMelee(d.id); P.melee.lv = newLv;
          if (P.wIdx >= P.weapons.length) P.wIdx = Math.max(0, P.weapons.length - 1);
          if (P.meleeMode) G.weapons.melee.equip(false); else G.weapons.equip(false);
        } else {
          const nw = G.weapons.make(d.id); nw.lv = newLv; nw.ver++; nw.mag = G.weapons.stats(nw).mag;
          P.weapons.push(nw); G.weapons.switchTo(P.weapons.length - 1);
        }
        G.weapons.order(); G.ui.refreshWeapon(); G.ui.refreshItems(); P.recalc();
        alchFx(); G.ui.toast(`⚗️ ${a.d.name} ＋ ${b.d.name} → ${d.icon} ${d.name}${newLv ? ' +' + newLv : ''}`, 'good'); G.ui.itemCard(d, '[武器練成]');
      } }));
      alchChoiceModal(`🔫 練成結果の選択（${rarName}）`, `${a.d.icon} ${a.d.name} ＋ ${b.d.icon} ${b.d.name} から、次のうち1つを練成する${newLv ? `（強化値 +${newLv} を継承）` : ''}。`, opts);
      return;
    }
    if (a.cat === 'att') {
      let pool = G.ATTACHMENTS.filter((x) => G.RARITY[x.rarity].tier === targetTier && (tA < 4 || (x.id !== a.d.id && x.id !== b.d.id)));
      if (pool.length < 3) {
        const extra = G.ATTACHMENTS.filter((x) => G.RARITY[x.rarity].tier >= Math.max(2, targetTier - 1) && !pool.includes(x) && x.id !== a.d.id && x.id !== b.d.id);
        pool = pool.concat(U.shuffle(extra));
      }
      const comp = pool.filter((x) => P.weapons.some((pw) => x.compat(pw.def)));
      const cands = U.shuffle((comp.length >= 3 ? comp : pool).slice()).slice(0, 3);
      const opts = cands.map((d) => ({ icon: d.icon, label: `${d.name}（${G.RARITY[d.rarity].name}）`, sub: `${G.ATT_SLOTS[d.slot].name} — ${d.desc}`, onPick: () => {
        consumeBoth();
        G.Inv.give(P, 'att', d.id, 1); G.ui.refreshWeapon(); G.ui.refreshItems();
        alchFx(); G.ui.toast(`⚗️ ${a.d.name} ＋ ${b.d.name} → ${d.icon} ${d.name}`, 'good'); G.ui.itemCard(d, '[パーツ練成]');
      } }));
      alchChoiceModal(`🔩 練成結果の選択（${rarName}）`, `${a.d.icon} ${a.d.name} ＋ ${b.d.icon} ${b.d.name} から、次のうち1つを練成する。`, opts);
      return;
    }
    if (a.cat === 'item') {
      const bothGren = a.d.cat === 'grenade' && b.d.cat === 'grenade';
      let pool = G.ITEMS.filter((x) => (bothGren ? true : x.cat !== 'grenade') && !x.noLoot && G.RARITY[x.rarity].tier === targetTier);
      if (pool.length < 3) {
        const extra = G.ITEMS.filter((x) => (bothGren ? true : x.cat !== 'grenade') && !x.noLoot && G.RARITY[x.rarity].tier >= Math.max(2, targetTier - 1) && !pool.includes(x));
        pool = pool.concat(U.shuffle(extra));
      }
      const cands = U.shuffle(pool.slice()).slice(0, 3);
      const opts = cands.map((d) => ({ icon: d.icon, label: `${d.name}（${G.RARITY[d.rarity].name}）`, sub: d.desc || '', onPick: () => {
        consumeBoth();
        P.addItem(d.id, 1); G.ui.refreshItems();
        alchFx(); G.ui.toast(`⚗️ ${a.d.name} ＋ ${b.d.name} → ${d.icon} ${d.name}`, 'good'); G.ui.itemCard(d, '[道具練成]');
      } }));
      alchChoiceModal(`🧪 練成結果の選択（${rarName}）`, `${a.d.icon} ${a.d.name} ＋ ${b.d.icon} ${b.d.name} から、次のうち1つを練成する。`, opts);
      return;
    }
    if (a.cat === 'valuable') {
      const arD = U.pick(G.ARMOR.filter((x) => G.RARITY[x.rarity].tier === targetTier)) || U.pick(G.ARMOR.filter((x) => G.RARITY[x.rarity].tier >= 2));
      const arInst = G.Inv.makeArmor(arD.id);
      if (targetTier >= 4 && (!arInst.ench || arInst.ench.length < 2)) arInst.ench = G.rollEnchants('legendary');
      const attPool = G.ATTACHMENTS.filter((x) => G.RARITY[x.rarity].tier === targetTier && P.weapons.some((pw) => x.compat(pw.def)));
      const attD = U.pick(attPool.length ? attPool : G.ATTACHMENTS.filter((x) => G.RARITY[x.rarity].tier >= Math.max(2, targetTier - 1)));
      const itD = U.pick(G.ITEMS.filter((x) => x.cat !== 'grenade' && !x.noLoot && G.RARITY[x.rarity].tier === targetTier)) || U.pick(G.ITEMS.filter((x) => x.cat !== 'grenade' && !x.noLoot && G.RARITY[x.rarity].tier >= Math.max(2, targetTier - 1)));
      const S = G.ARMOR_SLOT_BY_ID[arD.slot], M = G.ARMOR_MAT_BY_ID[arD.mat], fx = arD.fixed.map((f) => '◆' + f.desc).concat((arInst.ench || []).map((e) => '✦' + G.enchantText(e))).join(' ／ ');
      const opts = [
        { icon: G.armorIcon(arD), label: `【防具】${arD.name}（${G.RARITY[arD.rarity].name}）`, sub: `${S.name}（${M.name}）・防御力${arD.def}・新品${fx ? ' — ' + fx : ''}`, onPick: () => { consumeBoth(); G.Inv.give(P, 'armor', arD.id, 1, { ench: arInst.ench }); G.ui.refreshItems(); alchFx(); G.ui.toast(`⚗️ ${a.d.name} ＋ ${b.d.name} → ${arD.icon} ${arD.name}`, 'good'); G.ui.itemCard(arD, '[練成した]'); } },
        { icon: attD.icon, label: `【パーツ】${attD.name}（${G.RARITY[attD.rarity].name}）`, sub: `${G.ATT_SLOTS[attD.slot].name} — ${attD.desc}`, onPick: () => { consumeBoth(); G.Inv.give(P, 'att', attD.id, 1); G.ui.refreshWeapon(); G.ui.refreshItems(); alchFx(); G.ui.toast(`⚗️ ${a.d.name} ＋ ${b.d.name} → ${attD.icon} ${attD.name}`, 'good'); G.ui.itemCard(attD, '[練成した]'); } },
        { icon: itD.icon, label: `【道具】${itD.name}（${G.RARITY[itD.rarity].name}）`, sub: itD.desc || '', onPick: () => { consumeBoth(); P.addItem(itD.id, 1); G.ui.refreshItems(); alchFx(); G.ui.toast(`⚗️ ${a.d.name} ＋ ${b.d.name} → ${itD.icon} ${itD.name}`, 'good'); G.ui.itemCard(itD, '[練成した]'); } },
      ];
      alchChoiceModal(`💎 練成結果の選択（${rarName}）`, `${a.d.icon} ${a.d.name} ＋ ${b.d.icon} ${b.d.name} から、次のうち1つを練成する。`, opts);
    }
  }
  const ALCH_CAT_ORDER = { armor: 0, weapon: 1, att: 2, item: 3, valuable: 4 };
  function alchDurBar(it) {
    const f = G.Inv.durFrac(it), col = f > 0.5 ? '#6ee06a' : f > 0.2 ? '#f0b040' : '#ff4a3a';
    return `<i class="iv-dur" style="--f:${f.toFixed(3)};--dc:${col}"></i>`;
  }
  AR.useAlchemy = function (arg) {
    const cz = alchCauldron(), used = cz ? cz.used || 0 : 0, left = ALCH_MAX - used;
    if (left <= 0) { G.ui.toast('⚗️ 練成の釜はもう冷え切っている（この練成所での練成は2回まで）', 'warn'); return; }
    const keepState = arg && arg.keep ? arg : null;
    GM.state = 'modal';
    G.input.exitLock();
    const items = alchAllItems();
    const pairableUids = new Set();
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].cat === items[j].cat && items[i].rarity === items[j].rarity) {
          if (items[i].cat === 'weapon' && items[i].gun && items[j].gun && P.weapons.length < 2) continue;
          pairableUids.add(items[i].uid); pairableUids.add(items[j].uid);
        }
      }
    }
    let tab = keepState ? keepState.tab : 'all';
    let sel = keepState && keepState.selUids ? keepState.selUids.map((u) => items.find((x) => x.uid === u)).filter(Boolean) : [];
    const dots = Array.from({ length: ALCH_MAX }, (_, i) => `<i class="alch-dot ${i < left ? 'on' : 'off'}"></i>`).join('');
    const s = G.ui.screen(`<div class="panel alch-panel">
      <div class="alch-head">
        <div>
          <h2 class="alch-title">⚗️ 練成所 — 同レアリティ合成</h2>
          <div class="alch-desc">同じ種類・同じレア度の素材を2つ掛け合わせ、<b>1段階上のレア度</b>の品を練成する。</div>
        </div>
        <div class="alch-uses"><span>釜の魔力</span><div class="alch-dots">${dots}</div><b>残り ${left}/${ALCH_MAX}回</b></div>
      </div>
      <div class="alch-tabs"></div>
      <div class="alch-body">
        <div class="alch-inv"><div class="alch-grid"></div></div>
        <div class="alch-work"></div>
      </div>
    </div>`, 'dim');
    const m = s.querySelector('.alch-panel');
    const tabsEl = m.querySelector('.alch-tabs');
    const invEl = m.querySelector('.alch-inv');
    const gridEl = m.querySelector('.alch-grid');
    const workEl = m.querySelector('.alch-work');

    const syncSelection = () => {
      const s1 = sel[0] || null, s2 = sel[1] || null;
      gridEl.querySelectorAll('.alch-item').forEach((b) => {
        const x = items.find((it) => it.uid === b.dataset.uid);
        if (!x) return;
        const idx = sel.indexOf(x);
        const isSel = idx >= 0;
        let state = '';
        if (isSel) state = 'sel';
        else if (s1 && !s2) {
          const ok = x.cat === s1.cat && x.rarity === s1.rarity && !(x.cat === 'weapon' && s1.gun && x.gun && P.weapons.length < 2);
          state = ok ? 'match' : 'dim';
        } else if (s1 && s2) state = 'dim';
        else if (!pairableUids.has(x.uid)) state = 'dim no-pair';
        b.className = 'alch-item' + (state ? ' ' + state : '');
        const numEl = b.querySelector('.ai-num');
        if (numEl) {
          if (isSel) { numEl.textContent = String(idx + 1); numEl.style.display = ''; }
          else numEl.style.display = 'none';
        }
      });
      const slotHtml = (st, n) => {
        if (!st) return `<div class="alch-slot empty"><span class="as-num">素材 ${n}</span><div class="as-ph">${n === 1 ? '左の一覧から1つ目をタップ' : s1 ? `同じ【${G.RARITY[s1.rarity].name}・${ALCH_CATS[s1.cat].short}】をタップ` : '2つ目の素材'}</div></div>`;
        const rc = G.RARITY[st.rarity].color;
        return `<button class="alch-slot filled" data-unel="${n - 1}" style="--rc:${rc}" title="タップで選択解除">
          <span class="as-num">${n}</span>
          <span class="as-rm">× 解除</span>
          <div class="as-ic">${st.icon}</div>
          <div class="as-info">
            <div class="as-nm">${U.esc(st.name)}</div>
            <div class="as-rar" style="color:${rc}">${G.RARITY[st.rarity].name} · ${ALCH_CATS[st.cat].short}</div>
          </div>
        </button>`;
      };
      let prevHtml = `<div class="alch-prev wait"><div class="ap-ic">？</div><div class="ap-txt">同じ種類・同じレア度の素材を2つ選ぶと<br><b>1段階上のレア度</b>の3候補から選べます</div></div>`;
      if (s1 && s2) {
        const isReroll = s1.tier >= 4;
        const tTier = Math.min(4, s1.tier + 1);
        const tRar = G.RARITY[RAR_BY_TIER[tTier]];
        const catLabel = s1.cat === 'valuable' ? '防具 / パーツ / 道具' : ALCH_CATS[s1.cat].short;
        prevHtml = `<div class="alch-prev ready ${isReroll ? 'reroll' : ''}" style="--rc:${tRar.color}">
          <div class="ap-ic">？</div>
          <div class="ap-info">
            <div class="ap-tag">${isReroll ? '⚠️ 同ランク再練成（リロール）' : '✦ レアリティ +1 確定'}</div>
            <div class="ap-main" style="color:${tRar.color}">【${tRar.name}】の${catLabel}</div>
            <div class="ap-sub">${isReroll ? 'レジェンダリーが上限のためレア度は上がらず、別の新品候補（3択）へ作り変えます' : '3つの候補の中から好きな1つを選んで獲得できます（耐久100%・新品）'}</div>
          </div>
        </div>`;
      }
      workEl.innerHTML = `${slotHtml(s1, 1)}
        <div class="alch-op">＋</div>
        ${slotHtml(s2, 2)}
        <div class="alch-op">⬇</div>
        ${prevHtml}
        <button class="btn alch-go" id="alch-go" ${s1 && s2 ? '' : 'disabled'}>⚗️ 練成を実行する（3候補から選択）</button>
        <button class="btn small alch-close" id="alch-close">🚶 立ち去る</button>`;
      workEl.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => G.sfx.ui('hover')));
      workEl.querySelectorAll('[data-unel]').forEach((b) => {
        b.onclick = () => { G.sfx.ui('click'); sel.splice(+b.dataset.unel, 1); syncSelection(); };
      });
      const goBtn = workEl.querySelector('#alch-go');
      if (goBtn) goBtn.onclick = () => {
        if (sel.length < 2) return;
        const [a, b] = sel;
        if (a.tier >= 4) {
          const snap = { keep: true, tab, scrollTop: invEl.scrollTop, selUids: sel.map((x) => x.uid) };
          alchChoiceModal('⚠️ レジェンダリー同士の練成確認', `これ以上レアリティは上昇しません。<br>【${U.esc(a.name)}】と【${U.esc(b.name)}】を消費し、同じレジェンダリー帯の別アイテム（3候補）へ作り変えます。よろしいですか？`, [
            { icon: '⚗️', label: '練成を実行する（リロール）', sub: '素材2つを消費してレジェンダリー3候補を開く', onPick: () => { GM._keepModal = true; alchOpenResult(a, b); } },
            { icon: '↩', label: 'やめて素材選択へ戻る', onPick: () => { GM._keepModal = true; AR.useAlchemy(snap); } },
          ]);
          return;
        }
        G.sfx.ui('select');
        alchOpenResult(a, b);
      };
      const clBtn = workEl.querySelector('#alch-close');
      if (clBtn) clBtn.onclick = () => { G.sfx.ui('click'); GM.resume(); };
    };

    const renderGrid = (resetScroll) => {
      tabsEl.innerHTML = [['all', 'すべて'], ['armor', '🛡️ 防具'], ['weapon', '🔫 武器'], ['att', '🔩 パーツ'], ['item', '🧪 道具'], ['valuable', '💎 金品']]
        .map(([k, lbl]) => {
          const cnt = k === 'all' ? items.length : items.filter((x) => x.cat === k).length;
          return `<button class="alch-tab ${tab === k ? 'on' : ''}" data-tab="${k}">${lbl} <small>${cnt}</small></button>`;
        }).join('');
      tabsEl.querySelectorAll('.alch-tab').forEach((b) => {
        b.addEventListener('mouseenter', () => G.sfx.ui('hover'));
        b.onclick = () => {
          if (tab === b.dataset.tab) return;
          G.sfx.ui('click');
          tab = b.dataset.tab;
          renderGrid(true);
        };
      });
      const shown = items.filter((x) => tab === 'all' || x.cat === tab).sort((a, b) => {
        const pA = pairableUids.has(a.uid) ? 0 : 1, pB = pairableUids.has(b.uid) ? 0 : 1;
        if (pA !== pB) return pA - pB;
        const cA = ALCH_CAT_ORDER[a.cat] ?? 9, cB = ALCH_CAT_ORDER[b.cat] ?? 9;
        if (cA !== cB) return cA - cB;
        if (b.tier !== a.tier) return b.tier - a.tier;
        return String(a.d.id || a.name).localeCompare(String(b.d.id || b.name));
      });
      gridEl.innerHTML = shown.length ? shown.map((x) => {
        const rc = G.RARITY[x.rarity].color;
        const dur = x.cat === 'armor' && x.it ? alchDurBar(x.it) : '';
        return `<button class="alch-item" data-uid="${x.uid}" style="--rc:${rc}">
          <span class="ai-num" style="display:none"></span>
          ${x.badge ? `<span class="ai-badge">${x.badge}</span>` : ''}
          <div class="ai-ic">${x.icon}</div>
          <div class="ai-nm">${U.esc(x.name)}</div>
          <div class="ai-rar" style="color:${rc}">${G.RARITY[x.rarity].name} · ${ALCH_CATS[x.cat].short}</div>
          <div class="ai-sub">${U.esc(x.sub)}</div>
          ${dur}
        </button>`;
      }).join('') : `<div class="alch-empty">該当するアイテムがありません</div>`;
      gridEl.querySelectorAll('.alch-item').forEach((b) => {
        b.addEventListener('mouseenter', () => G.sfx.ui('hover'));
        b.onclick = () => {
          const it = items.find((x) => x.uid === b.dataset.uid);
          if (!it) return;
          const idx = sel.indexOf(it);
          if (idx >= 0) { G.sfx.ui('click'); sel.splice(idx, 1); syncSelection(); return; }
          if (sel.length === 0) {
            if (!pairableUids.has(it.uid)) { G.sfx.ui('deny'); G.ui.toast('同じ種類・同じレア度のもう1つの素材がありません', 'warn'); return; }
            G.sfx.ui('click'); sel.push(it); syncSelection(); return;
          }
          if (sel.length === 1) {
            const first = sel[0];
            if (it.cat !== first.cat || it.rarity !== first.rarity) {
              G.sfx.ui('deny');
              G.ui.toast(`1つ目と同じ【${G.RARITY[first.rarity].name}・${ALCH_CATS[first.cat].short}】のみ選べます`, 'warn');
              return;
            }
            if (it.cat === 'weapon' && first.gun && it.gun && P.weapons.length < 2) {
              G.sfx.ui('deny');
              G.ui.toast('銃がすべて失われる組み合わせは選べません', 'warn');
              return;
            }
            G.sfx.ui('click'); sel.push(it); syncSelection();
          }
        };
      });
      if (resetScroll) invEl.scrollTop = 0;
      syncSelection();
    };

    renderGrid(false);
    if (keepState && keepState.scrollTop) invEl.scrollTop = keepState.scrollTop;
  };
  AR.runEvent = function (it) {
    AR._alchIt = it;
    const ev = it.ev;
    const opts = ev.opts();
    const choices = opts.map((o) => ({ icon: o.icon, label: o.label, sub: o.sub || '', disabled: o.disabled, onPick: () => {
      if (o.disabled) { G.sfx.ui('error'); return; }
      if (!ev.repeat) it.used = true;
      const res = o.run() || {};
      G.sfx.ui('select');
      // keep the dialog open for repeat purchases (no mouse-lock round trip)
      if (res.reopen) { GM._keepModal = true; setTimeout(() => AR.runEvent(it), 0); }
      if (res.sub) { GM._keepModal = true; setTimeout(() => res.sub(() => AR.runEvent(it)), 0); } // a sub-menu of this dialog; its back button reopens the dialog
      if (res.offer) setTimeout(() => GM.offerBuffs(true, { filter: res.offer, title: 'OFFERING', sub: '捧げた分の加護 — 一つを選べ', after: () => setTimeout(() => AR.runEvent(it), 120) }), 60);
      if (res.boon === 'boost') setTimeout(() => GM.offerBuffs(true), 50);
      else if (res.boon === 'pile') setTimeout(() => GM.offerBuffs(false, { filter: G.isTech, title: 'SKILL TRAINING', sub: 'スキル・アルティメットの強化を一つ選べ' }), 50);
    } }));
    choices.push({ icon: '🚶', label: '立ち去る', sub: '何もしない', onPick: () => {} });
    GM.modal(`${ev.icon} ${ev.npc}`, ev.text.replace(/\n/g, '<br>'), choices);
  };

  // ---------------- shrine / forge ----------------
  AR.setupShrine = function () {
    const w = G.world;
    w.interactables.push({ type: 'shrine', pos: w.altarPos.clone(), used: false });
    w.lightSources.push({ pos: w.altarPos.clone().add(V(0, 1.5, 0)), color: '#80ffe0', intensity: 10, range: 10, flame: 0, emit: false, ph: 0, prio: 3, steady: true });
  };
  AR.useShrine = function (it) {
    const cs = AR.curses();
    const opts = [{ icon: '🙏', label: '祈る', sub: 'HP全回復 ＋ 装備中の防具の耐久も全回復 ＋ スキル・アルティメット／グラップル／防御の強化を一つ選ぶ', onPick: () => { it.used = true; G.combat.heal(9999); G.Inv.repair(P, 'equip', 1); G.sfx.bell(); setTimeout(() => GM.offerBuffs(false, { filter: (b) => G.isTech(b) || b.cat === 'defense' || (b.cat === 'mobility' && /グラップル|鉤/.test(b.desc + b.name)), title: 'BLESSING', sub: '祠の加護 — 一つを選べ' }), 50); } }];
    if (cs.length) opts.push({ icon: '✨', label: '浄化を願う', sub: `呪いを一つ解き、HPを50%回復（${cs.map((id) => G.BUFF_BY_ID[id].name).join('・')}）`, onPick: () => { it.used = true; AR.removeCurse(cs[0]); G.combat.heal(P.stats.maxHp * 0.5); } });
    opts.push({ icon: '🚶', label: '立ち去る', onPick: () => {} });
    GM.modal('⛩️ 祈りの祠', '静かな祠だ。ここで祈れば力が満ちる。（一度だけ）', opts);
  };
  AR.setupForge = function () {
    const w = G.world;
    const m = G.enemies.buildModel(G.ENEMY_BY_ID.brute_normal, { scale: 0.75 });
    m.group.position.copy(w.npcSpots[0]); w.group.add(m.group);
    w.interactables.push({ type: 'anvil', pos: w.anvilPos.clone(), used: 0, model: m });
  };
  AR.FORGE_MAX = 15;
  AR.forgeCost = (w) => GM.price(300 * Math.pow(1.27, w.lv || 0) + GM.area * 15);
  // skill levels at the forge: +1 for a chosen skill / ultimate / the pile driver; the price follows that skill's own level
  AR.skillLvCost = (lv) => GM.price(900 * Math.pow(1.25, lv));
  AR.skillForge = function () {
    const MAXLV = G.abilities.MAXLV, out = [];
    const fx = () => { G.sfx.mech('magIn'); G.sfx.explosion(G.world.anvilPos, 0.3); G.fx.sparks(G.world.anvilPos.clone().add(V(0, 0.3, 0)), V(0, 1, 0), 30, 0xffb060, 7); };
    const pl = P.pileLevel(), pc = AR.skillLvCost(pl);
    out.push({ icon: '🔨', label: `[${G.input.keyName('crouch')}] パイルドライバー Lv${pl} → Lv${pl + 1}（${pc}🪙）`, sub: pl >= MAXLV ? '最大レベル' : '威力+60%', disabled: pl >= MAXLV || GM.run.coins < pc, onPick: () => { GM.run.coins -= pc; P.pileTome = (P.pileTome || 0) + 1; fx(); G.ui.toast(`⚒️ パイルドライバー Lv${P.pileLevel()}`, 'good'); } });
    P.skills.forEach((s, i) => {
      if (!s) return;
      const lv = s.lv || 0, c = AR.skillLvCost(lv), mx = lv >= MAXLV, ult = !!s.def.ult;
      out.push({ icon: s.def.icon, label: `[${G.input.skillKey(i)}]${ult ? '（ULT）' : ''} ${s.def.name} Lv${lv} → Lv${lv + 1}（${c}🪙）`, sub: mx ? '最大レベル' : '効果量UP・クールタイム-2%', disabled: mx || GM.run.coins < c, onPick: () => { GM.run.coins -= c; s.lv = lv + 1; fx(); G.ui.toast(`⚒️ ${s.def.name} Lv${s.lv}`, 'good'); } });
    });
    out.push({ icon: '↩', label: '戻る', onPick: () => { GM._keepModal = true; setTimeout(() => AR.useForge(), 0); } });
    GM.modal('⚒️ スキルを Lv+1', 'どのスキルを鍛える？（価格は、そのスキルの今の Lv で決まる）', out);
  };
  AR.useForge = function () {
    const opts = G.weapons.gunsInOrder().map((pw) => {
      const lv = pw.lv || 0, c = AR.forgeCost(pw);
      const mx = lv >= AR.FORGE_MAX;
      return { _tok: pw, icon: pw.def.icon, label: `${G.weapons.keyLabel(pw)}${pw.def.name} +${lv} → +${lv + 1}（${c}🪙）`, sub: mx ? '最大強化' : `ダメージ×1.13（現在 ×${Math.pow(1.13, lv).toFixed(2)}）`, disabled: mx || GM.run.coins < c, onPick: () => {
        GM.run.coins -= c; pw.lv = lv + 1; pw.ver++; G.sfx.mech('magIn'); G.sfx.explosion(G.world.anvilPos, 0.3); G.fx.sparks(G.world.anvilPos.clone().add(V(0, 0.3, 0)), V(0, 1, 0), 30, 0xffb060, 7);
        if (pw === P.weapon) G.weapons.equip(true); G.ui.refreshWeapon(); G.ui.toast(`⚒️ ${pw.def.name} +${pw.lv}`, 'good');
      } };
    });
    {
      const mw = P.melee, lv = mw.lv || 0, c = AR.forgeCost(mw);
      const mx = lv >= AR.FORGE_MAX;
      if (mw.id !== (G.BARE_MELEE || 'fists')) opts.push({ _tok: 'm', icon: mw.def.icon, label: `${G.weapons.keyLabel('m')}${mw.def.name} +${lv} → +${lv + 1}（${c}🪙）`, sub: mx ? '最大強化' : `近接ダメージ×1.13（現在 ×${Math.pow(1.13, lv).toFixed(2)}）`, disabled: mx || GM.run.coins < c, onPick: () => {
        GM.run.coins -= c; mw.lv = lv + 1; G.sfx.mech('magIn'); G.sfx.explosion(G.world.anvilPos, 0.3); G.fx.sparks(G.world.anvilPos.clone().add(V(0, 0.3, 0)), V(0, 1, 0), 30, 0xffb060, 7);
        G.ui.refreshWeapon(); G.ui.toast(`⚒️ ${mw.def.name} +${mw.lv}`, 'good');
      } });
    }
    { const ord = G.weapons.order(), head = opts.splice(0, opts.length).sort((a, b) => ord.indexOf(a._tok) - ord.indexOf(b._tok)); opts.push(...head); }
    const pc = GM.price(450 + GM.area * 20);
    opts.push({ icon: '📘', label: 'スキルを Lv+1', sub: 'スキル・アルティメット・パイルドライバーのレベルを上げる（どれを上げるかを選ぶ）', onPick: () => { GM._keepModal = true; setTimeout(() => AR.skillForge(), 0); } });
    opts.push({ icon: '🔨', label: `スキルの加護を得る（${pc}🪙）`, sub: 'スキル・アルティメットの強化を一つ選ぶ', disabled: GM.run.coins < pc, onPick: () => { GM.run.coins -= pc; setTimeout(() => GM.offerBuffs(false, { filter: G.isTech, title: 'FORGED SKILL', sub: 'スキル・アルティメットの強化を一つ選べ' }), 50); } });
    { const c = repairPrice('all', 1), n = G.Inv.damaged(P, 'all').length;
      opts.push({ icon: '🛡️', label: `防具をすべて修理（${c}🪙）`, sub: n ? `傷んでいる防具 ${n}点（インベントリの中も含む）→ 耐久を全回復` : '傷んでいる防具はない', disabled: !n || GM.run.coins < c, onPick: () => { GM.run.coins -= c; G.Inv.repair(P, 'all', 1); G.sfx.explosion(G.world.anvilPos, 0.2); G.ui.toast('🛡️ 防具を修理した', 'good'); } }); }
    opts.push({ icon: '🚶', label: 'やめておく', onPick: () => {} });
    GM.modal('⚒️ 鍛冶場', '炉の熱気が肌を焼く。武器を鍛えるか？（何度でも利用可能）', opts);
  };

  // ---------------- vault: some chests bite ----------------
  AR.setupVault = function () {
    const w = G.world;
    for (const it of w.interactables) if (it.type === 'chest' && GM.arng.next() < 0.3 + GM.area * 0.005) it.trap = true; // seeded: the same chests bite after a restart
  };
  AR.springTrap = function (it) {
    if (it.mesh) it.mesh.visible = false;
    const e = G.enemies.spawn(G.ENEMY_BY_ID.mimic_trap, G.Run.enemyLv(GM.area) + 1, it.pos.clone().setY(it.pos.y - 0.5), { elite: GM.area > 8 });
    e.state = 'chase'; e.stateT = 0; e.atkCd = 0.6;
    G.sfx.monster(it.pos, 'chitter', 0.8, 1.2); G.sfx.monster(it.pos, 'roar', 1.2, 0.7);
    G.ui.toast('📦 ミミックだ！', 'warn');
    P.addShake(0.3);
  };

  // ---------------- exit markers (the stacked-storey fields: the hanging sign is hidden by the slabs above) ----------------
  // a small screen marker per open gate: icon, name, distance; at the edge of the screen when the gate is out of view
  const _em = new THREE.Vector3();
  AR.exitMarks = function (w) {
    const root = document.getElementById('worldui');
    const on = root && w.exits && w.strata && GM.state === 'playing';
    for (const ex of w.exits || []) {
      let m = ex.mark;
      if (!on || !ex.open || !ex.type) { if (m) m.style.display = 'none'; continue; }
      if (!m) {
        m = ex.mark = document.createElement('div'); m.className = 'exit-mark';
        const T = AR.TYPES[ex.type]; m.style.setProperty('--c', typeof T.color === 'string' ? T.color : '#' + (+T.color).toString(16).padStart(6, '0'));
        m.innerHTML = `<span>${T.icon}</span><em>${T.name || ''}</em><b></b>`; root.appendChild(m);
        ex.markD = m.querySelector('b');
      }
      _em.set(ex.x, 3.2, 0.5).project(G.camera);
      const W = innerWidth, H = innerHeight;
      let sx = _em.x, sy = _em.y;
      if (_em.z > 1) { sx = -sx; sy = -sy; } // behind: mirror so it points the way round
      const out = _em.z > 1 || Math.abs(sx) > 0.9 || Math.abs(sy) > 0.85;
      if (out) { const k = Math.max(Math.abs(sx) / 0.9, Math.abs(sy) / 0.85, 0.001); sx /= k; sy /= k; if (_em.z > 1) sy = Math.max(sy, 0.85) * 1; }
      m.style.display = ''; m.style.left = ((sx * 0.5 + 0.5) * W) + 'px'; m.style.top = ((-sy * 0.5 + 0.5) * H) + 'px';
      m.classList.toggle('edge', out);
      const d = Math.round(Math.hypot(P.pos.x - ex.x, P.pos.z - 0.5, (P.pos.y - 1.5)));
      if (ex.markDv !== d) { ex.markDv = d; ex.markD.textContent = d + 'm'; }
    }
  };
  AR.clearExitMarks = function (w) { for (const ex of (w && w.exits) || []) if (ex.mark) { ex.mark.remove(); ex.mark = null; } };

  // ---------------- per-frame ----------------
  AR.update = function (dt) {
    AR.updateTrial(dt);
    const w = G.world;
    for (const it of w.interactables) {
      if (it.model && it.model.animate) it.model.animate({ walk: 0, mv: 0, atk: 0, wind: Math.max(0, Math.sin(GM.time * 0.9)) * 0.25, flinch: 0, t: GM.time });
      if (it.model && it.type === 'npc') { const to = P.pos.clone().sub(it.model.group.position); it.model.group.rotation.y = Math.atan2(to.x, to.z); if (it.used && it.model.group.visible) { it.model.group.visible = false; G.fx.smoke(it.pos, 12, 1, 0x4a3a5a, 0.6, 1.2); } }
    }
    for (const ex of w.exits || []) if (ex.label) { ex.label.position.y = (ex.labelY || 10.4) + Math.sin(GM.time * 1.5 + ex.idx) * 0.12; }
    AR.exitMarks(w);
    if (GM.ambushReward && G.enemies.aliveCount() === 0) { GM.ambushReward = false; GM.spawnChestNear(2); G.ui.toast('👑 待ち伏せを退けた！ 宝箱が残された', 'good'); }
  };
})();
