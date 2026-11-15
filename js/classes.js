'use strict';
// Classes: what a run starts with (a common gun and melee weapon, one uncommon skill, one epic ultimate), one strength and one weakness,
// the grapple's cooldown, what turns up a little more often (x1.3), and how the character looks in third person (js/avatar.js, the co-op bodies).
// Every class starts equally strong; only the direction differs. Chosen after the difficulty; the last choice is remembered.
(function () {
  const CL = (G.Classes = {});
  CL.LIST = [
    { id: 'soldier', name: '兵士', icon: '🪖', col: '#9ab070', gun: 'a_ranger', melee: 'm_basic', skill: 'spear', ult: 'ult_armory', grapple: 18,
      mods: { buffChoices: 1 }, minus: 'なし', favName: 'なし', fav: null,
      look: 'オリーブ色の戦闘服とヘルメット', role: '何でもこなす基準のクラス' },
    { id: 'assault', name: '突撃兵', icon: '💨', col: '#ff6a50', gun: 's_wasp', melee: 'm_basic', skill: 'dash', ult: 'ult_berserk', grapple: 15,
      mods: { moveSpeed: 0.1 }, minus: '20m以上の敵への与ダメ-20%', favName: 'SMG・ショットガン（作業台でもおすすめ）、機動・連射・装填の加護',
      fav: (o) => o.kind === 'weapon' && (o.arch === 'smg' || o.arch === 'shotgun' || o.arch === 'autoshotgun'), look: '赤いバンダナとゴーグルの軽装', role: '近距離で暴れる' },
    { id: 'sniper', name: '狙撃手', icon: '🎯', col: '#5aa8ff', gun: 'n_scout', atts: { optic: 'o_x2' }, melee: 'm_basic', skill: 'decoy', ult: 'ult_shadow', grapple: 18,
      mods: {}, minus: 'ADSせずに撃つ（腰だめ）と拡散+40%', favName: '狙撃銃・DMR（作業台でもおすすめ）、会心・ヘッドショットの加護',
      fav: (o) => o.kind === 'weapon' && (o.arch === 'sniper' || o.arch === 'dmr'), look: '青いフード付きマントとマスク、右目の照準鏡', role: '遠くから急所を撃つ' },
    { id: 'blade', name: '剣士', icon: '⚔️', col: '#ffb040', gun: 'p_viper', melee: 'm_machete', skill: 'haste', ult: 'ult_bladestorm', grapple: 15,
      mods: { magSize: -0.25, moveSpeed: 0.1 }, minus: '銃の装弾数-25%', favName: '近接武器（作業台でもおすすめ）、近接の加護',
      fav: (o) => o.kind === 'melee', look: '橙の羽織と紺の袴、白い鉢巻、背中に鞘', role: '近接で斬り込む' },
    { id: 'heavy', name: '重装兵', icon: '🛡️', col: '#c08a5a', gun: 'g_breacher', melee: 'm_woodshield', skill: 'thornarmor', ult: 'ult_bastion', grapple: 28,
      mods: { armor: 0.1, maxHp: 20, moveSpeed: -0.12, slideBoost: -0.4 }, minus: '移動速度-12%、スライディングの距離-40%', favName: '防具・盾、防御の加護（作業台のおすすめは近接武器）',
      fav: (o) => o.kind === 'armor' || (o.kind === 'melee' && !!o.guard && o.guard[0] >= 0.75), look: '板金の鎧と大きな肩当て、茶色の陣羽織とマント、顔まで覆う兜', role: '前に立って受け止める' },
    { id: 'mage', name: '術士', icon: '🔮', col: '#b07aff', gun: 't_rivet', atts: { core: 'c_water' }, melee: 'm_basic', skill: 'fireball', ult: 'ult_tsunami', grapple: 20,
      mods: { elIcd: 0.4, maxHp: -15 }, minus: '最大HP-15', favName: '属性コア・属性のスキル、属性・状態異常・スキル強化の加護',
      fav: (o) => (o.kind === 'attachment' && o.slot === 'core') || (o.kind === 'skill' && G.Elem && !!G.Elem.skEl(o.id)), look: '紫のフード付きローブ。フードの奥で目が光り、まわりに属性の光球が浮く', role: '属性反応で崩す' },
  ];
  // ---------------- the class's own effect (固有効果): what every run starts with ----------------
  // rows: [what, how much]; notes: the rest of the rule in words
  const PAS = {
    soldier: { name: '目利き', icon: '🃏', short: '加護の選択肢が1枚多く、無料リロールも1回多い', rows: [['加護の選択肢', '+1枚'], ['加護の無料リロール', '+1回']],
      notes: ['加護「選択肢」「運命の再配」とは別に数える。'] },
    assault: { name: '突貫', icon: '💨', short: '近い敵ほど大ダメージ', rows: [['近い敵への与ダメ（0mで最大、12mで0）', '+30%']],
      notes: ['距離に応じてなめらかに減る（6mなら半分）。'] },
    sniper: { name: '一点集中', icon: '🎯', short: 'ためるほど強い1発。頭を撃てばゲージが戻る', rows: [['ゲージに応じた与ダメ（満タンで）', '+40%'], ['撃った弾', '1体貫通'], ['ヘッドショットで戻るゲージ', '50%'], ['ヘッドショットで倒すと', '全部戻る']],
      notes: ['ADS中にゲージがたまる（1.5秒で満タン）。撃つと0になり、ADSをやめると1秒で半分減る。', 'ゲージ半分なら+20%。腰だめ撃ちにはゲージが乗らない。'] },
    blade: { name: '連斬', icon: '⚔️', short: '近接を当て続けるほど、攻撃も移動も速くなる', rows: [['近接を当てるとたまる層の上限', '5層']],
      notes: ['1層につき近接の攻撃速度+5%・移動速度+3%（銃には効かない）。', '7.5秒続き、当てるたびに7.5秒に戻る。切れると全部なくなる。'] },
    heavy: { name: '鉄壁', icon: '🛡️', short: '攻撃を受けると、しばらく硬くなる', rows: [['ダメージを受けた後3秒間の被ダメ', '-10%'], ['いつでも被ダメ', '-10%']],
      notes: ['3秒の間にまた受けると、そこからさらに3秒。'] },
    mage: { name: '反応強化', icon: '🔮', short: '属性反応のダメージが大きい', rows: [['反応のダメージ（凍結の時間なども）', '+20%'], ['沸騰・熱融の倍率', '+0.1']],
      notes: ['属性熟練・反応の加護とは別の枠で掛かる。銃の属性付与の間隔が2.5秒から1.5秒になる。'] },
  };
  for (const c of CL.LIST) c.pas = PAS[c.id];
  // ---------------- 秘伝: after a guardian falls, one of two. The first guardian: 一の巻 (the numbers of the class grow), the second: 二の巻
  // (a new way to fight). Easy has two guardians, the last ending the run: both at the first. The pairs are fixed (seen on the class screen).
  const PK = (id, name, icon, desc) => ({ id, name, icon, desc });
  const PERKS = {
    soldier: [[PK('soldier_1a', '選り取り', '🗂️', '加護の選択肢がさらに +1枚（始めと合わせて +2枚）'), PK('soldier_1b', '仕切り直し', '🎲', '加護の無料リロールがさらに +1回（始めと合わせて +2回）')],
      [PK('soldier_2a', '掘り出し物', '💎', '加護の選択肢に、レアリティの高いカードがずっと出やすくなる'), PK('soldier_2b', '百戦の備え', '🎖️', '持っている加護1つにつき与ダメが上がる（コモン・アンコモン +2.5%、レア +5%、エピック +10%、レジェンダリー +20%、ミシック +40%）')]],
    assault: [[PK('assault_1a', '肉薄', '👊', '至近距離の与ダメ +30% → +40%。効く距離が 12m → 15m に伸びる'), PK('assault_1b', '血の昂り', '🩸', '敵を倒すとHPを30回復し、5秒間移動速度 +25%')],
      [PK('assault_2a', '猛進', '🐗', 'スライディングで敵にぶつかると体当たりになり、大きなダメージを与えてよろめかせる。スライディングの距離 +30%'), PK('assault_2b', '背水', '🌊', 'HPが半分を切っている間、与ダメ +30%・連射速度 +20%')]],
    sniper: [[PK('sniper_1a', '鷹の目', '🦅', '遠い敵ほど銃の与ダメが上がる（30mで最大+40%、15mなら+20%）。ゲージとは別に加わる'), PK('sniper_1b', '一発入魂', '🔂', 'ゲージのたまる速さ+100%。満タンの1発がヘッドショットに当たると、弾が1発戻る。その1発で倒すと、さらに1発戻る')],
      [PK('sniper_2a', '急所穿ち', '💀', '満タンの1発がヘッドショットなら、必ず会心になる'), PK('sniper_2b', '一閃', '⚡', '満タンの1発が太い光の筋になり、線の上の敵を何体でも貫く。当たり判定も大きくなる。貫いてもダメージは落ちない')]],
    blade: [[PK('blade_1a', '深い連斬', '🌀', '層の上限 5 → 7'), PK('blade_1b', '軽身', '🍃', '近接武器を持っている間、移動速度 +10%')],
      [PK('blade_2a', '見切り', '👁️', 'いつでもパリィできる。敵の攻撃が当たる直前にガード（リロード）を押すと、その攻撃を完全に防ぎ、重撃の200%のダメージを返す。遠距離の攻撃は防ぐだけ（返さない）'), PK('blade_2b', '飛燕', '🕊️', '重撃が、前へ斬撃を飛ばす。斬撃は敵を貫き、重撃の60%のダメージを与える')]],
    heavy: [[PK('heavy_1a', '不動の城', '🏯', 'いつでもの被ダメ -10% → -20%'), PK('heavy_1b', '根を張る', '🌳', '受けるノックバック -50%')],
      [PK('heavy_2a', '携行防盾', '🔰', 'ADSの間、前からの攻撃を防ぐ盾を構える。盾の耐久は最大HPの60%。構えていない間は少しずつ回復し、壊れると20秒後に元に戻る'), PK('heavy_2b', '不屈', '💢', 'HPが0になる攻撃を受けても、HP1で耐えて2秒間無敵になる（90秒に1回）')]],
    mage: [[PK('mage_1a', '元素の奔流', '🌊', '反応のダメージ +20% → +35%'), PK('mage_1b', '詠唱短縮', '📜', '属性を持つスキル・アルティメットのクールタイム -20%')],
      [PK('mage_2a', '昂る理', '🔥', '反応を起こすたびに、8秒間与ダメ +4%（最大10回で +40%）'), PK('mage_2b', '理の障壁', '🔷', '反応を起こすたびに、オーバーシールド +8（最大80）')]],
  };
  CL.PERKS = PERKS; CL.PERK = {};
  for (const cls in PERKS) PERKS[cls].forEach((pair, t) => pair.forEach((pk, k) => { Object.assign(pk, { cls, tier: t + 1, slot: k ? 'B' : 'A' }); CL.PERK[pk.id] = pk; }));
  CL.TIER = ['一の巻', '二の巻'];
  CL.TIER_TAG = ['固有効果を伸ばす', '新しい戦い方'];
  CL.BY = Object.fromEntries(CL.LIST.map((c) => [c.id, c]));
  CL.DEFAULT = 'soldier';
  CL.of = (id) => CL.BY[id] || CL.BY[CL.DEFAULT];
  CL.last = () => { const s = G.save && G.save.data.settings; return s && CL.BY[s.lastClass] ? s.lastClass : CL.DEFAULT; };
  CL.remember = (id) => { if (!CL.BY[id] || !G.save) return; G.save.data.settings.lastClass = id; G.save.write(); };

  // the starting kit (called by Player.resetRun)
  CL.kit = function (P) {
    const c = CL.of(P.cls);
    const w = G.weapons.make(c.gun); w.kit = true;
    if (c.atts) { Object.assign(w.atts, c.atts); w.ver++; w.mag = G.weapons.stats(w).mag; }
    P.weapons = [w];
    P.melee = G.weapons.makeMelee(c.melee); P.melee.kit = true;
    P.skills = [G.abilities.makeSlot(c.ult), G.abilities.makeSlot(c.skill), null, null];
    P.skills[0].kit = true; P.skills[1].kit = true;
    P.kitAtts = Object.values(c.atts || {}); // (the mage's water core sells for nothing, once)
    P._cs = null; // (the class effect's stacks and gauges)
    P.perks = []; // (秘伝: chosen after the guardians)
  };
  // the perks a player holds (only those of their class: a class changed in the dev menu leaves none behind)
  CL.perksOf = (P) => ((P && P.perks) || []).filter((id) => CL.PERK[id] && CL.PERK[id].cls === P.cls);
  CL.has = (id) => { const P = G.player; return !!P && !!P.perks && P.perks.indexOf(id) >= 0 && !!CL.PERK[id] && CL.PERK[id].cls === P.cls; };
  // 百戦の備え (兵士): damage for every boon held, by its rarity (each stack counts)
  const VETERAN = { common: 0.025, uncommon: 0.025, rare: 0.05, epic: 0.1, legendary: 0.2, mythic: 0.4 };
  // the class's strength / weakness as stats (folded in by Player.recalc), the grapple's own cooldown, and what its perks add to them
  CL.mods = function (P) {
    const c = CL.of(P.cls), m = Object.assign({ grappleBase: c.grapple }, c.mods), pk = CL.perksOf(P), on = (id) => pk.indexOf(id) >= 0;
    const add = (k, v) => { m[k] = (m[k] || 0) + v; };
    if (on('soldier_1a')) add('buffChoices', 1);
    if (on('assault_2a')) add('slideBoost', 0.3);
    if (on('heavy_1a')) add('armor', 0.1);
    if (on('soldier_2b') && P.buffs) { let a = 0; for (const [id, n] of P.buffs) { const b = G.BUFF_BY_ID[id]; if (b && b.cat !== 'curse') a += (VETERAN[b.rarity] || 0) * (n || 1); } add('dmg', a); }
    return m;
  };
  // how many perks are still to be chosen: the guardians fallen so far say how many are due (1 per guardian, 2 at the first on easy, never more than 2)
  CL.perkDue = function () {
    const GM = G.game, R = G.Run, P = G.player;
    if (!GM || !R || !P || !GM.area || GM.tutorial || !GM.run) return 0;
    let done = Math.floor((GM.area - 1) / R.CYCLE);
    if (R.isBoss(GM.area) && GM.areaCleared) done++;
    const total = Math.max(2, Math.floor(R.areas() / R.CYCLE));
    return Math.max(0, Math.min(2, total <= 2 ? done * 2 : done) - CL.perksOf(P).length);
  };
  const is = (id) => !!G.player && G.player.cls === id;
  const now = () => (G.game ? G.game.time : 0);
  // the running state (stacks, gauges, timers), kept on the player and cleared with the kit
  const S = () => { const P = G.player; return P._cs || (P._cs = { blade: 0, bladeT: 0, focus: 0, ironT: 0 }); };
  CL.state = S;
  // 突撃兵: close range (smooth, 0 m best, 12 m nothing; 肉薄: 15 m, +40%), far away a little less; 背水: below half health. 術士 昂る理: its stacks.
  // 狙撃手 鷹の目: a gun's hit farther off, stronger
  CL.dmgAdd = function (P, dist, src) {
    let a = 0;
    if (is('sniper') && CL.has('sniper_1a') && src === 'bullet') a += 0.4 * Math.min(1, dist / 30); // 鷹の目 (0 m nothing, 30 m and beyond +40%)
    if (is('assault')) {
      if (dist >= 20) a -= 0.2;
      else { const far = CL.has('assault_1a'); a += Math.max(0, 1 - dist / (far ? 15 : 12)) * (far ? 0.4 : 0.3); }
      if (CL.has('assault_2b') && P.hp < P.stats.maxHp * 0.5) a += 0.3;
    }
    if (is('mage')) a += CL.rxStacks() * 0.04;
    return a;
  };
  CL.backWater = () => CL.has('assault_2b') && G.player.hp < G.player.stats.maxHp * 0.5;
  CL.fireAdd = () => (CL.backWater() ? 0.2 : 0); // 背水 (突撃兵)
  // 剣士: its stacks (+3% each), 軽身 with the melee weapon in hand; 突撃兵 血の昂り: a burst of speed after a kill
  CL.moveAdd = function () {
    let a = 0;
    if (is('blade')) { a += CL.blade() * 0.03; if (CL.has('blade_1b') && G.player.meleeMode) a += 0.1; }
    if (CL.rushLeft() > 0) a += 0.25;
    return a;
  };
  // 剣士: stacks on every melee swing that lands (深い連斬: up to 7)
  CL.bladeMax = () => (CL.has('blade_1a') ? 7 : 5);
  CL.blade = () => { if (!is('blade')) return 0; const s = S(); if (s.blade && s.bladeT <= now()) s.blade = 0; return s.blade; };
  CL.onMeleeHit = function () { if (!is('blade')) return; const s = S(); s.blade = Math.min(CL.bladeMax(), CL.blade() + 1); s.bladeT = now() + 7.5; };
  CL.meleeSpeed = () => 1 + CL.blade() * 0.05;
  // 狙撃手: the focus gauge (filled while aiming down the sights): a shot is stronger by as much as the gauge holds (full +40%, half +20%) and
  // every shot goes through one foe. Only a full shot is 急所穿ち's sure crit and 一閃's beam (through all, 0.8 m across)
  CL.focus = () => (is('sniper') ? S().focus : 0);
  CL.spreadMul = (ads) => (is('sniper') ? 1 + 0.4 * (1 - ads) : 1);
  CL.shot = function (s) {
    if (!is('sniper')) return s;
    const st = S(), g = G.weapons.adsT > 0.6 ? Math.min(1, st.focus) : 0, full = g >= 1; // (the gauge rides on an aimed shot only)
    st.focus = 0;
    const o = Object.assign({}, s, { dmg: s.dmg * (1 + 0.4 * g), pierce: (s.pierce || 0) + 1, focusShot: { head: false, kill: false, full, g } });
    if (full && CL.has('sniper_2b')) { o.pierce = 999; o.beam = 0.4; }
    return o;
  };
  // a shot has struck (weapons.js traceShot, after the blow): a head gives half the gauge back, a head kill all of it (the start effect);
  // 一発入魂: a full shot's head a round, its kill one more
  CL.focusHit = function (e, info, s) {
    const f = s && s.focusShot; if (!f || !info.head || !is('sniper')) return;
    const P = G.player, st = S(), w = P.weapon, killed = !e.alive;
    const mag = (n) => { if (w && !P.meleeMode && !w.def.melee) w.mag = Math.min(G.weapons.stats(w).mag, w.mag + n); };
    if (!f.head) { f.head = true; st.focus = Math.max(st.focus, 0.5); if (f.full && CL.has('sniper_1b')) mag(1); }
    if (killed && !f.kill) { f.kill = true; st.focus = 1; if (f.full && CL.has('sniper_1b')) mag(1); }
  };
  CL.sureCrit = (s, info) => !!(s && s.focusShot && s.focusShot.full && info.head && CL.has('sniper_2a')); // 急所穿ち (a full shot only)
  // 重装兵: a hit opens 3 s of 鉄壁 (-10%); 根を張る halves the knockback taken (combat.js damagePlayer / player.js)
  CL.ironOn = () => is('heavy') && S().ironT > now();
  CL.ironRed = () => (CL.ironOn() ? 0.1 : 0);
  CL.onHurt = function () { if (is('heavy')) S().ironT = now() + 3; };
  CL.hurtMul = () => 1;
  CL.knockK = () => (CL.has('heavy_1b') ? 0.5 : 1);
  // 携行防盾: while aiming down the sights a shield takes what comes from the front (60% of max HP); it refills from 2 s after it was last
  // raised, all of it in 15 s; broken, it is back whole 20 s later
  CL.shMax = () => G.player.stats.maxHp * 0.6;
  const SH = () => { const s = S(); if (s.shHp == null) s.shHp = CL.shMax(); return s; };
  CL.shieldRaised = () => CL.has('heavy_2a') && !G.player.meleeMode && G.weapons.adsT > 0.5 && !G.player.dead;
  CL.shieldUp = () => CL.shieldRaised() && !(SH().shBrokeT > now()) && SH().shHp > 0;
  CL.shieldAbsorb = function (dmg, info) {
    if (dmg <= 0 || !CL.shieldUp() || info.fixed || info.src === 'dot' || info.src === 'fall') return dmg;
    const P = G.player, a = info.attacker, from = info.pos || (a && a.pos); if (!from) return dmg;
    const dx = from.x - P.pos.x, dz = from.z - P.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.35) return dmg; // (something on top of you has no front)
    const f = P.forward(), fl = Math.hypot(f.x, f.z) || 1;
    if ((dx * f.x + dz * f.z) / (d * fl) < Math.cos(70 * Math.PI / 180)) return dmg;
    const s = SH(), cut = Math.min(dmg, s.shHp);
    s.shHp -= cut; s.shUpT = now();
    const at = P.pos.clone(); at.y += 1.2; at.x += dx / d * 0.9; at.z += dz / d * 0.9;
    G.fx.sparks(at, null, 10, 0x9fd0ff, 6); s.shFlash = 1;
    if (G.sfx.shieldHit) G.sfx.shieldHit(); else G.sfx.impact(at, 'metal');
    if (s.shHp <= 0.01) {
      s.shHp = 0; s.shBrokeT = now() + 20;
      G.fx.sparks(at, null, 30, 0xcfe8ff, 9); G.fx.flash(at, 0x9fd0ff, 40, 0.2, 8);
      if (G.sfx.shieldBreak) G.sfx.shieldBreak(P.pos);
      G.ui.toastSmall('🔰 携行防盾が壊れた（20秒で元に戻る）');
    }
    return dmg - cut;
  };
  // 不屈: a blow that would leave you at 0 leaves you at 1 and untouchable for 2 s, once every 90 s (before a soul lantern is spent)
  CL.gritLeft = () => Math.max(0, (S().gritT || 0) - now());
  CL.lethal = function (dmg) {
    const P = G.player;
    if (!CL.has('heavy_2b') || dmg < P.hp || CL.gritLeft() > 0) return dmg;
    S().gritT = now() + 90;
    P.invulnT = Math.max(P.invulnT || 0, 2);
    const c = P.pos.clone(); c.y += 1;
    G.fx.ring(P.pos.clone().setY(P.pos.y + 0.1), 2.2, 0xffd060, 0.5); G.fx.flash(c, 0xffc040, 50, 0.3, 10); G.fx.sparks(c, null, 24, 0xffd890, 8);
    if (G.sfx.invulnOn) G.sfx.invulnOn(); G.sfx.heartbeat(1);
    G.ui.toast('💢 不屈 — HP1で踏みとどまった（2秒間無敵）', 'warn');
    return Math.max(0, P.hp - 1);
  };
  // 術士: reactions (元素の奔流: +35%); 詠唱短縮: the skills and ultimates of an element cool down 20% faster
  CL.rxMul = () => (is('mage') ? (CL.has('mage_1a') ? 0.35 : 0.2) : 0);
  CL.ampAdd = () => (is('mage') ? 0.1 : 0);
  CL.cdMul = (sk) => (sk && CL.has('mage_1b') && G.Elem && G.Elem.skEl(sk.id) ? 0.8 : 1);
  // 昂る理: +4% a reaction for 8 s (up to 10; each new one starts the 8 s again, then all go together); 理の障壁: +8 overshield a reaction (up to 80)
  CL.rxStacks = () => { if (!CL.has('mage_2a')) return 0; const s = S(); if (s.rxN && (s.rxT || 0) <= now()) s.rxN = 0; return s.rxN || 0; };
  CL.onReaction = function (e, id, opts) {
    if (!is('mage') || (opts && (opts.echo || opts.enemy || opts.remote !== undefined))) return;
    if (CL.has('mage_2a')) { const s = S(); s.rxN = Math.min(10, CL.rxStacks() + 1); s.rxT = now() + 8; }
    if (CL.has('mage_2b')) G.combat.overshield(8, 80);
  };
  // 兵士: one more free reroll on every boon screen (仕切り直し: two); 掘り出し物: rare and better twice as likely
  CL.freeRerolls = () => (is('soldier') ? (CL.has('soldier_1b') ? 2 : 1) : 0);
  CL.rarW = (k) => (CL.has('soldier_2a') && G.RARITY[k] && G.RARITY[k].tier >= 2 ? 2 : 1);
  // a kill by the player (C.killEnemy): 血の昂り
  CL.onKill = function (e, info) {
    const P = G.player; if (!P || !e || (info && (info.enemy || info.remote !== undefined))) return;
    if (CL.has('assault_1b') && !P.dead) {
      const hp0 = P.hp; G.combat.heal(30, true); const healed = Math.round(P.hp - hp0);
      S().rushT = now() + 5;
      // seen at once: the fallen foe's life runs into you as a red thread, the amount rises from the HP bar, the screen's edge pulses red,
      // the view widens a little; while the speed lasts, speed lines and a red edge that fades with it (ui.js clsHud, player.js)
      const c = e.centerPos ? e.centerPos() : e.pos.clone(), to = P.chestPos();
      G.fx.beam(c, to, 0xff4058, 0.06, 0.3); G.fx.beam(c, to, 0xffc0c8, 0.02, 0.22); G.fx.sparks(c, null, 12, 0xff5068, 6);
      P.fovKick = Math.max(P.fovKick || 0, 7);
      if (G.ui.bloodRush) G.ui.bloodRush(healed);
      if (G.sfx.heal) G.sfx.heal(); if (G.sfx.heartbeat) G.sfx.heartbeat(0.7); G.sfx.whoosh(0.35, 0.6, true);
    }
  };
  CL.rushLeft = () => (CL.has('assault_1b') ? Math.max(0, (S().rushT || 0) - now()) : 0);
  CL.rushLines = () => CL.rushLeft() / 5 * 0.45; // (the speed lines while 血の昂り lasts, fading with it)
  // ---- 見切り (剣士): the guard key pressed just before a blow lands parries it (the guardians' duel window, duel.js D.win: no gold flash here).
  // A melee blow is struck back at 200% of the heavy blow; a shot is only stopped. Pressing again too soon after a press that caught nothing does nothing.
  CL.parryPress = function () {
    const P = G.player; if (!CL.has('blade_2a') || !P.meleeMode || P.dead) return;
    const s = S(), t = now(), lock = G.Duel ? G.Duel.LOCK : 0.6;
    if (s.pyT != null && t - s.pyT < lock && !s.pyOk) return;
    s.pyT = t; s.pyOk = false;
  };
  CL.parry = function (amount, info) {
    if (!CL.has('blade_2a') || info.fixed || (info.src !== 'melee' && info.src !== 'ranged')) return false;
    if (G.Duel && G.Duel.mine && G.Duel.mine()) return false;
    const P = G.player, s = S(), t = now(), win = G.Duel ? G.Duel.win() : 0.3;
    if (s.pyT == null || t < s.pyT || t - s.pyT > win) return false;
    if (s.pyOk && t - (s.pyOkT || 0) > 0.15) return false; // (one press: the blows that land together with the first one)
    s.pyOk = true; s.pyOkT = s.pyOkT && t - s.pyOkT <= 0.15 ? s.pyOkT : t;
    const a = info.attacker, from = (a && a.centerPos ? a.centerPos() : null) || info.pos || P.pos.clone().add(P.forward());
    const at = P.pos.clone(); at.y += 1.3; at.lerp(from, 0.35);
    G.fx.sparks(at, null, 26, 0xffd860, 10); G.fx.sparks(at, null, 10, 0xffffff, 6); G.fx.flash(at, 0xffe0a0, 40, 0.15, 7);
    if (G.sfx.clang) G.sfx.clang(null); else G.sfx.impact(at, 'metal');
    P.addShake(0.5);
    if (G.weapons.gd) { G.weapons.gd.kick = 1; G.weapons.gd.pk = 0.2; }
    if (info.src === 'melee' && a && a.alive && a.isEnemy && !a.ally) {
      const ms = G.weapons.meleeStats(P.melee), d = a.pos.clone().sub(P.pos).setY(0);
      if (d.lengthSq() > 1e-6) d.normalize();
      G.combat.damageEnemy(a, ms.dmg * ms.heavy[0] * 2, { src: 'melee', heavy: true, pos: a.centerPos(), dir: d, knock: 7, parried: true });
    }
    return true;
  };
  // ---- 猛進 (突撃兵): a slide into a foe is a body blow (the heavy blow's damage, a 1 s stagger; the same foe once every 3 s)
  function tackle() {
    const P = G.player; if (!CL.has('assault_2a') || !P.sliding || P.dead) return;
    const d = P.vel.clone().setY(0), sp = d.length(); if (sp < 4) return;
    d.normalize();
    for (const e of G.enemies.inRadius(P.pos, 3)) {
      if (!e.alive || e.dying || e.ally || (e._tackleT || -9) > now()) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, dist = Math.hypot(dx, dz);
      if (dist > (e.radius || 0.5) + 0.8 || dx * d.x + dz * d.z < -0.2) continue;
      if (e.pos.y > P.pos.y + 1.6 || e.pos.y + (e.height || 1.8) < P.pos.y - 0.3) continue;
      e._tackleT = now() + 3;
      const ms = G.weapons.meleeStats(P.melee), c = e.centerPos();
      G.combat.damageEnemy(e, ms.dmg * ms.heavy[0], { src: 'melee', heavy: true, pos: c, dir: d.clone(), knock: 9, tackle: true });
      G.combat.stun(e, 1);
      G.fx.sparks(c, null, 14, 0xffc080, 7); G.fx.dust(e.pos.clone(), new THREE.Vector3(0, 1, 0), 0x8a7a60, 6); G.fx.ring(e.pos.clone().setY(e.pos.y + 0.1), 1.4, 0xff8a50, 0.25);
      G.sfx.meleeHit(true, 'blunt', true); P.addShake(0.4);
    }
  }
  // ---- 飛燕 (剣士): the heavy blow sends a crescent of its edge flying 12 m on (through foes, 60% of the blow); it breaks on a wall
  const slashes = [];
  CL.onHeavy = function (o, f, dmg) {
    if (!CL.has('blade_2b')) return;
    const P = G.player, dir = f.clone();
    const pitch = Math.max(-0.45, Math.min(0.45, Math.asin(Math.max(-1, Math.min(1, dir.y)))));
    const h = Math.hypot(dir.x, dir.z) || 1; dir.set(dir.x / h * Math.cos(pitch), Math.sin(pitch), dir.z / h * Math.cos(pitch));
    const start = P.pos.clone(); start.y += 1.15; start.addScaledVector(dir, 0.7);
    const wh = G.world.raycast(start, dir, 12.4), L = wh ? Math.max(0.6, wh.t - 0.15) : 12;
    const el = G.Elem && G.Elem.wEl ? G.Elem.wEl(P.melee) : null, col = el && G.Elem.BY[el] ? G.Elem.BY[el].hex : 0xbfe4ff;
    const tilt = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2);
    if (G.vfx.skySlash) G.vfx.skySlash(start, dir, L, 32, col, wh ? 1 : 0, tilt);
    if (G.sfx.skySlash) G.sfx.skySlash(); else G.sfx.whoosh(0.4, 1.0);
    slashes.push({ p: start, d: dir, L, s: 0, dmg: dmg * 0.6, hit: new Set(), area: G.game.area, col, tilt });
  };
  function slashTick(dt) {
    for (let i = slashes.length - 1; i >= 0; i--) {
      const q = slashes[i];
      if (q.area !== G.game.area) { slashes.splice(i, 1); continue; }
      const s0 = q.s; q.s = Math.min(q.L, q.s + 32 * dt);
      const a = q.p.clone().addScaledVector(q.d, s0), b = q.p.clone().addScaledVector(q.d, q.s), mid = a.clone().lerp(b, 0.5);
      for (const e of G.enemies.inRadius(mid, (q.s - s0) / 2 + 2.6)) {
        if (!e.alive || e.dying || e.ally || q.hit.has(e)) continue;
        const c = e.centerPos(), ab = b.clone().sub(a), t = ab.lengthSq() > 1e-9 ? Math.max(0, Math.min(1, c.clone().sub(a).dot(ab) / ab.lengthSq())) : 0;
        const near = a.clone().addScaledVector(ab, t), off = c.clone().sub(near);
        if (Math.abs(off.y) > 1.1 + (e.height || 1.8) * 0.4 || Math.hypot(off.x, off.z) > 1.15 + (e.radius || 0.5)) continue;
        q.hit.add(e);
        G.combat.damageEnemy(e, q.dmg, { src: 'melee', pos: c, dir: q.d.clone(), knock: 4, swallow: true });
        G.fx.sparks(c, null, 16, q.col, 8); G.fx.sparks(c, null, 6, 0xffffff, 5);
        if (G.vfx.slash) G.vfx.slash(c, q.d, 0.95, 1.5, q.col, { dur: 0.16, tilt: q.tilt * 2.4, tail: 0.8 });
        if (G.sfx.meleeHit) G.sfx.meleeHit(true, 'blade', false);
      }
      if (q.s >= q.L) slashes.splice(i, 1);
    }
  }
  CL.slashes = slashes;
  // every frame (game.js, next to the boons' tick)
  CL.tick = function (dt) {
    const P = G.player; if (!P) return;
    slashTick(dt);
    tackle();
    if (CL.has('heavy_2a')) {
      const s = SH(), mx = CL.shMax();
      if (CL.shieldRaised()) s.shUpT = now();
      if (s.shBrokeT && s.shBrokeT <= now()) { s.shBrokeT = 0; s.shHp = mx; if (G.sfx.shieldUp) G.sfx.shieldUp(); G.ui.toastSmall('🔰 携行防盾が元に戻った'); }
      else if (!s.shBrokeT && now() - (s.shUpT || -9) > 2) s.shHp = Math.min(mx, s.shHp + mx / 15 * dt);
      if (s.shHp > mx) s.shHp = mx;
      s.shFlash = Math.max(0, (s.shFlash || 0) - dt * 4);
    }
    // a perk still owed (joined a run under way, a screen lost on the way): offered once the area is quiet
    const GM = G.game;
    if (CL._offering && GM.state === 'playing' && !document.querySelector('#screens .pk-card')) CL._offering = false; // (its screen was taken down without a choice)
    if (!CL._offering && GM.state === 'playing' && GM.areaCleared && !GM.rewardPending && !GM.transitioning && !P.dead && now() > (CL._dueT || 0)) {
      CL._dueT = now() + 2;
      if (CL.perkDue() > 0) CL.offerPerks(null);
    }
    if (!is('sniper')) return;
    const st = S();
    const q0 = Math.floor(st.focus * 4 + 1e-6);
    const Wp = G.weapons, w = P.weapon, an = Wp.anim || {};
    const aiming = !P.meleeMode && !!w && Wp.adsT > 0.9 && !w.reloading && !(Wp.switchT > 0) && !(an.melee > 0) && !(an.throwT > 0) && !P.mantle && !P.pileState
      && !(G.ItemAnim && G.ItemAnim.busy()) && !(G.GrenHold && G.GrenHold.active()) && !(G.abilities.wheelOpen && G.abilities.wheelOpen());
    if (aiming) st.focus = Math.min(1, st.focus + dt / 1.5 * (CL.has('sniper_1b') ? 2 : 1)); // (一発入魂: twice as fast)
    else if (st.focus > 0) st.focus = Math.max(0, st.focus - dt * 0.5);
    const q = Math.floor(st.focus * 4 + 1e-6);
    if (q > q0 && G.sfx && G.sfx.focus) G.sfx.focus(q); // (a quiet blip each quarter, a chime when full)
  };
  // ---- the start effect as a table, the perks as cards (class screen, status screen). taken: the perks chosen (the status screen)
  CL.pasHTML = function (c) {
    const p = c.pas; if (!p) return '';
    return `<div class="cls-pas"><div class="cls-pas-h">${p.icon} <b>${esc(p.name)}</b></div>
      <table>${p.rows.map((r) => `<tr><td>${esc(r[0])}</td><td class="on">${esc(r[1])}</td></tr>`).join('')}</table>
      ${p.notes.map((n) => `<div class="cls-pas-n">${esc(n)}</div>`).join('')}</div>`;
  };
  CL.perksHTML = function (c, taken) {
    const pairs = PERKS[c.id]; if (!pairs) return '';
    const got = taken || [];
    return `<div class="cls-pk">${pairs.map((pair, t) => {
      const pick = pair.find((pk) => got.indexOf(pk.id) >= 0), open = !taken || t <= got.length;
      return `<div class="cls-pk-t${taken && !pick && !open ? ' later' : ''}"><div class="cls-pk-h">📜 秘伝 ${CL.TIER[t]}<small>${CL.TIER_TAG[t]}</small>${taken && !pick ? `<em>${t === got.length ? '次の守護者で選ぶ' : 'まだ選べない'}</em>` : ''}</div>
        ${pair.map((pk) => `<div class="cls-pk-c${pick ? (pick === pk ? ' on' : ' off') : ''}"><span class="cls-pk-ic">${pk.icon}</span><div><b>${esc(pk.name)}</b>${pick === pk ? '<i>会得</i>' : ''}<small>${esc(pk.desc)}</small></div></div>`).join('')}</div>`;
    }).join('')}</div>`;
  };
  // ---- the choice of a perk: the class's colour round two big cards (not the boon screen's look: the two can follow each other).
  // after(): what comes next (the guardian's boon); none: back to the game. Click or 1 / 2; wheel / arrows + Enter.
  CL.offerPerks = function (after) {
    const P = G.player, GM = G.game, c = CL.of(P.cls), pairs = PERKS[c.id];
    const tier = CL.perksOf(P).length;
    if (!pairs || tier >= 2 || CL.perkDue() <= 0) { CL._offering = false; if (after) after(); return; }
    CL._offering = true;
    GM.state = 'buff';
    G.input.exitLock();
    const pair = pairs[tier], nextPair = pairs[tier + 1];
    const card = (pk, i) => `<div class="card pk-card" data-i="${i}" style="--rc:${c.col};animation-delay:${i * 0.14}s"><span class="c-key">${i + 1}</span>
      <div class="pk-ic">${pk.icon}</div><div class="pk-name">${esc(pk.name)}</div><div class="pk-tag">${CL.TIER_TAG[tier]}</div><div class="pk-desc">${esc(pk.desc)}</div></div>`;
    const mine = CL.perksOf(P).map((id) => CL.PERK[id]);
    const foot = (mine.length ? `<div class="pk-f"><span>会得した秘伝</span>${mine.map((pk) => `<b>${pk.icon} ${esc(pk.name)}</b>`).join('')}</div>` : '')
      + (nextPair ? `<div class="pk-f dim"><span>次の守護者で（${CL.TIER[tier + 1]}）</span>${nextPair.map((pk) => `<b>${pk.icon} ${esc(pk.name)}</b>`).join('<i>／</i>')}</div>` : '');
    const s = G.ui.screen(`<div class="pk-wrap" style="--cc:${c.col}">
      <div class="pk-head"><div class="pk-title">秘伝 ${CL.TIER[tier]}</div><div class="pk-cls">${c.icon} ${esc(c.name)}「${esc(c.pas.name)}」</div></div>
      <div class="pk-cards">${pair.map(card).join('')}</div>
      <div class="pk-keys">クリック／1・2：選択 ／ ←→・ホイール：切替 → Enter：決定（選び直しはできません）</div>
      ${foot ? `<div class="pk-foot">${foot}</div>` : ''}
    </div>`, 'live');
    let picked = false, hl = 0;
    const els = [...s.querySelectorAll('.pk-card')];
    const paint = () => els.forEach((el, k) => el.classList.toggle('hl', k === hl));
    const pick = (i) => {
      if (picked || !pair[i]) return; picked = true;
      els.forEach((el, k) => el.classList.add(k === i ? 'picked' : 'unpicked'));
      G.sfx.ui('rare');
      const pk = pair[i];
      setTimeout(() => {
        P.perks = (P.perks || []).filter((id) => CL.PERK[id] && CL.PERK[id].tier !== pk.tier).concat(pk.id);
        P._skm = null; P.recalc();
        if (pk.id === 'heavy_2a') { const st = S(); st.shHp = CL.shMax(); st.shBrokeT = 0; }
        G.ui.toast(`📜 秘伝「${pk.name}」を会得した`, 'good');
        G.ui.clearScreen(); G.ui._buffKeys = null;
        if (CL.perkDue() > 0) { CL.offerPerks(after); return; } // (easy: the second scroll right after the first)
        CL._offering = false; CL._dueT = now() + 2;
        if (after) { GM.state = 'playing'; after(); } else GM.resume();
      }, 320);
    };
    els.forEach((el, k) => { el.onclick = () => pick(k); el.addEventListener('mouseenter', () => { if (!picked) { hl = k; paint(); } }); });
    paint();
    G.ui._buffApi = { pick: (i) => pick(i), move: (d) => { if (picked) return; hl = (hl + d + pair.length) % pair.length; paint(); G.sfx.ui('click'); }, confirm: () => pick(hl), reroll: () => {} };
    G.ui._buffKeys = (code) => { if (code === 'Digit1' || code === 'Numpad1') pick(0); else if (code === 'Digit2' || code === 'Numpad2') pick(1); else if (code === 'ArrowLeft' || code === 'ArrowRight') G.ui._buffApi.move(code === 'ArrowLeft' ? -1 : 1); };
    setTimeout(() => G.sfx.ui('card'), 120); setTimeout(() => G.sfx.ui('card'), 260);
  };
  // what turns up more often for the class (x1.3)
  CL.weight = function (o) { const c = G.player && CL.of(G.player.cls); return c && c.fav && o && c.fav(o) ? 1.3 : 1; };
  // boons that suit the class turn up more often within their rarity (the rarity itself is not touched): [weight, test]
  const M = (b, ks) => !!b.mods && ks.some((k) => (b.mods[k] || 0) > 0);
  const BOON = {
    assault: [1.5, (b) => b.cat === 'mobility' || M(b, ['fireRate', 'reloadSpeed', 'magSize', 'moveSpeed'])],
    sniper: [2, (b) => M(b, ['headMul', 'critChance', 'critMul', 'range', 'adsSpeed'])],
    blade: [1.5, (b) => b.cat === 'melee' || M(b, ['meleeDmg', 'meleeCd', 'meleeRange', 'meleeRecover', 'guardHp'])],
    heavy: [1.3, (b) => b.cat === 'defense' || M(b, ['maxHp', 'armor', 'maxHpPct', 'guardHp'])],
    mage: [1.3, (b) => b.cat === 'attr' || b.cat === 'element' || b.cat === 'skill' || M(b, ['elMastery', 'skillDmg', 'skillCd'])],
  };
  CL.boonFav = (b, cls) => { const x = BOON[cls || (G.player && G.player.cls)]; return !!x && !!b && b.cat !== 'curse' && !b.skill && x[1](b); };
  CL.boonW = (b) => (CL.boonFav(b) ? BOON[G.player.cls][0] : 1);
  // weapon parts: the kinds of weapon the workbench marks as recommended for the class (parts.js; parts themselves have no kind)
  const PART = { assault: { smg: 1.5, sg: 1.5 }, sniper: { sr: 2 }, blade: { ml: 2 }, heavy: { ml: 1.5 } };
  CL.partW = (fam) => { const x = G.player && PART[G.player.cls]; return (x && x[fam]) || 1; };
  CL.pick = function (r, list) { if (!list.length) return undefined; if (list.every((o) => CL.weight(o) === 1)) return r.pick(list); return r.weighted(list, (o) => CL.weight(o)); };
  // the 不屈の城塞 of a team-mate near you takes a quarter off what you suffer (co-op hooks this in)
  CL.allyGuard = () => false;

  // ---------------- the choice: a list on the left, the chosen class on the right (a turning 3D figure, its kit, its numbers) ----------------
  const U = G.U;
  const esc = U.esc;
  const BASE_HP = 100;
  // the stats a class starts a run with: the player's base stats with the class folded in the way Player.recalc does it (no gear, no boons)
  CL.stats = function (c) {
    const s = Object.assign({}, G.PLAYER_BASE), m = CL.mods({ cls: c.id });
    for (const k in m) if (typeof m[k] === 'number') s[k] = (s[k] || 0) + m[k];
    s.maxHp = Math.max(10, Math.round(s.maxHp * Math.max(0.2, 1 + (s.maxHpPct || 0))));
    return s;
  };
  // the numbers on the class screen come from the same functions the game uses
  CL.numbers = function (c) {
    const s = CL.stats(c);
    return { hp: s.maxHp, move: Math.round((1 + (s.moveSpeed || 0)) * 100), grapple: Math.round(G.grappleCdOf(s) * 10) / 10 };
  };
  const wDef = (id) => G.WEAPON_BY_ID[id] || G.MELEE_BY_ID[id];
  const sk = (id) => G.SKILL_BY_ID[id] || (G.ULTS || []).find((u) => u.id === id) || { name: id, icon: '', desc: '' };
  const rec = (c) => { const r = G.save && G.save.data.records.byClass && G.save.data.records.byClass[c.id]; if (!r) return '—'; const cl = Object.keys(r.clears || {}).filter((k) => G.Run.DIFFS[k]).map((k) => G.Run.DIFFS[k].name).join('・'); return `最深エリア ${r.bestArea}${cl ? `／クリア ${cl}` : ''}`; };
  const bar = (label, v, lo, hi, txt, good) => { const k = Math.max(0.04, Math.min(1, (v - lo) / (hi - lo))); return `<div class="cls-bar"><span>${label}</span><i><b style="width:${(k * 100).toFixed(0)}%;background:${good ? 'var(--cc)' : '#c06050'}"></b></i><em>${txt}</em></div>`; };
  CL.detailHTML = function (c) {
    const n = CL.numbers(c), g = wDef(c.gun), mel = wDef(c.melee);
    const kitAtts = Object.values(c.atts || {}).map((id) => G.ATT_BY_ID[id]).filter(Boolean);
    const R = (r) => (G.RARITY[r] ? G.RARITY[r].color : '#ccc');
    const kitRow = (tag, icon, name, rar, sub) => `<div class="cls-kit"><span class="cls-tag">${tag}</span><span class="cls-kic">${icon}</span><div><b style="color:${R(rar)}">${esc(name)}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
    // the skill and the ultimate: the status screen's own card for them (its cooldown, damage, range and the numbers in the text are the game's)
    const st = CL.stats(c);
    const skRow = (tag, id, ult) => { let card = ''; try { card = G.StatusUI.previewSkill(id, st); } catch (e) { const d = sk(id); card = `<div class="sc"><div class="sc-d">${esc(d.desc)}</div></div>`; } return `<div class="cls-skill${ult ? ' ult' : ''}"><span class="cls-tag">${tag}</span>${card}</div>`; };
    return `<div class="cls-head"><span class="cls-big">${c.icon}</span><div><div class="cls-title">${c.name}</div><div class="cls-sub">${esc(c.role)}</div></div></div>
      ${c.pas ? `<div class="cls-merit"><span class="cls-merit-ic">${c.pas.icon}</span><div><small>固有効果「${esc(c.pas.name)}」</small><b>${esc(c.pas.short)}</b></div></div>` : ''}
      <div class="cls-cols">
        <div class="cls-col">
          <div class="cls-sec">装備</div>
          ${kitRow('銃', g.icon || '🔫', g.name, g.rarity, esc(g.cat || '') + kitAtts.map((a) => `・${a.icon}${a.name}付き`).join(''))}
          ${kitRow('近接', mel.icon || '🗡️', mel.name, mel.rarity, esc(mel.cat || ''))}
          <div class="cls-sec">スキル</div>
          ${skRow('スキル', c.skill, false)}
          ${skRow('アルティメット', c.ult, true)}
        </div>
        <div class="cls-col">
          <div class="cls-sec">固有効果</div>
          ${CL.pasHTML(c)}
          <div class="cls-sec">秘伝（守護者を倒すたびに2枚から1枚）</div>
          ${CL.perksHTML(c)}
          <div class="cls-trait dn"><span>▼ 短所</span>${esc(c.minus)}</div>
          <div class="cls-sec">能力</div>
          ${bar('最大HP', n.hp, 70, 140, n.hp, n.hp >= BASE_HP)}
          ${bar('移動速度', n.move, 85, 110, n.move + '%', n.move >= 100)}
          ${bar('グラップル', 32 - n.grapple, 0, 18, 'CT ' + n.grapple + '秒', n.grapple <= 18)}
          <div class="cls-sec">その他</div>
          <div class="cls-kv"><span>出やすい物</span><b>${esc(c.favName)}</b></div>
          <div class="cls-kv"><span>見た目</span><b>${esc(c.look)}</b></div>
          <div class="cls-kv"><span>記録</span><b>${esc(rec(c))}</b></div>
        </div>
      </div>`;
  };
  // the preview: its own small renderer (made once, its canvas moved into each screen), a figure in the class's clothes holding its gun, slowly turning (drag to turn it)
  const PV = { r: null, cv: null, scene: null, cam: null, fig: null, raf: 0, yaw: 0.5, drag: null };
  function pvInit() {
    if (PV.r) return true;
    try { PV.cv = document.createElement('canvas'); PV.cv.className = 'cls-cv'; PV.r = new THREE.WebGLRenderer({ canvas: PV.cv, antialias: true, alpha: true }); } catch (e) { PV.r = null; return false; }
    PV.r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); PV.r.outputColorSpace = THREE.SRGBColorSpace; PV.r.toneMapping = THREE.ACESFilmicToneMapping;
    PV.scene = new THREE.Scene();
    // (lit as a figure by a lamp in a dark vault: a warm key from in front and a little above, a weak cool fill from the other side,
    // a dim sky / floor bounce, and an edge light from behind to part it from the dark - the class's colour only a touch in it)
    PV.scene.add(new THREE.HemisphereLight(0xc4bcb0, 0x2a241c, 0.85));
    const key = new THREE.DirectionalLight(0xffe2c4, 3.4); key.position.set(1.4, 3.0, 3.6); PV.scene.add(key);
    const fill = new THREE.DirectionalLight(0x98a2ae, 0.55); fill.position.set(-3.2, 0.8, 2.2); PV.scene.add(fill);
    PV.rim = new THREE.DirectionalLight(0xe8dcc8, 2.6); PV.rim.position.set(-2.2, 2.6, -3.2); PV.scene.add(PV.rim);
    PV.disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
    PV.disc.rotation.x = -Math.PI / 2; PV.disc.position.y = 0.005; PV.scene.add(PV.disc);
    PV.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    // something for the metal to reflect (a dim room with a warm light above): without it plate and steel come out black
    try {
      const env = new THREE.Scene(), pm = new THREE.PMREMGenerator(PV.r);
      env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4e473c, side: THREE.BackSide })));   // (dim: the walls of a vault, not a studio's white)
      const lamp = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d8 })); lamp.position.set(0, 8, 2); lamp.rotation.x = Math.PI / 2; env.add(lamp);
      const side = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x9a9080 })); side.position.set(-8, 2, 0); side.rotation.y = Math.PI / 2; env.add(side);
      PV.scene.environment = pm.fromScene(env, 0.04).texture; pm.dispose();
    } catch (e) { /* plain lights only */ }
    return true;
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  function figureOf(c) {
    const F = G.avatar.buildFigure(), J = F.J;
    G.avatar.dress(J, c.id);
    // an easy stance: the gun held across the body
    J.arms[1].sh.rotation.set(-0.5, 0, 0.12); J.arms[1].el.rotation.set(-0.55, 0, 0);
    J.arms[0].sh.rotation.set(-0.35, 0, -0.2); J.arms[0].el.rotation.set(-0.6, 0, 0);
    J.legs[0].hip.rotation.x = 0.08; J.legs[1].hip.rotation.x = -0.08;
    try {
      const d = G.WEAPON_BY_ID[c.gun], g = G.weapons.displayModel(d, c.atts || {});
      const w = new THREE.Group(); g.rotation.set(0, 0, 0); g.position.set(0, 0, 0); w.add(g);
      w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(-1, 0, 0), V3(0, 0, 1), V3(0, 1, 0)));
      const hold = new THREE.Group(); hold.position.set(0, -0.02, 0.06); J.arms[1].hand.add(hold); hold.add(w);
    } catch (e) { /* the figure without a gun is still worth showing */ }
    // the heavy's shield / the swordsman's blade in the other hand
    try {
      if (c.id === 'heavy' || c.id === 'blade') {
        const mm = G.weapons.meleeDisplayModel(G.MELEE_BY_ID[c.melee]);
        const w = new THREE.Group(); w.add(mm); w.rotation.set(Math.PI, 0, 0); w.scale.setScalar(0.9);
        const h = new THREE.Group(); h.position.set(0, -0.02, 0.06); J.arms[0].hand.add(h); h.add(w);
      }
    } catch (e) { /* likewise */ }
    F.root.traverse((o) => { o.frustumCulled = false; });
    return F;
  }
  function pvShow(c, host) {
    if (!pvInit()) { host.innerHTML = `<div class="cls-noview">${c.icon}</div>`; return; }
    if (PV.cv.parentNode !== host) { host.innerHTML = ''; host.appendChild(PV.cv); }
    if (PV.fig) PV.scene.remove(PV.fig.root);
    PV.fig = figureOf(c); PV.scene.add(PV.fig.root); PV.cls = c;
    // (the baked cloth, leather and gun surfaces belong to the game's renderer: this one is given copies, or they come out black)
    if (G.GFX && G.GFX.portable) G.GFX.portable(PV.fig.root, PV.r);
    PV.disc.material.color.set(c.col); PV.rim.color.set(0xe8dcc8).lerp(new THREE.Color(c.col), 0.22);
    if (!PV.raf) PV.raf = requestAnimationFrame(pvLoop);
  }
  CL._pv = PV;
  function pvLoop(t) {
    if (!PV.cv || !PV.cv.isConnected) { PV.raf = 0; return; }
    PV.raf = requestAnimationFrame(pvLoop);
    CL.pvFrame(t);
  }
  CL.pvFrame = function (t) {
    const w = PV.cv.clientWidth || 300, h = PV.cv.clientHeight || 400, pr = PV.r.getPixelRatio();
    if (PV.cv.width !== Math.round(w * pr) || PV.cv.height !== Math.round(h * pr)) { PV.r.setSize(w, h, false); PV.cam.aspect = w / h; PV.cam.updateProjectionMatrix(); }
    if (!PV.drag) PV.yaw += 0.0016; // (a slow turn)
    const F = PV.fig; if (!F) return;
    t = t || performance.now();
    F.root.rotation.y = PV.yaw;
    F.J.chest.rotation.y = Math.sin(t / 900) * 0.04; F.J.body.position.y = 0.95 + Math.sin(t / 700) * 0.008;
    if (F.J.orbs) G.avatar.orbTick(F.J, 1 / 60, PV.cls && PV.cls.atts && PV.cls.atts.core ? G.ATT_BY_ID[PV.cls.atts.core].mods.el : null);
    PV.cam.position.set(0, 1.3, 5.6); PV.cam.lookAt(0, 0.95, 0);
    PV.r.render(PV.scene, PV.cam);
  };
  CL.select = function (onPick, back) {
    const UI = G.ui; let cur = CL.last();
    const s = UI.screen(`<div class="cls-wrap"><h2 class="df-title">クラスを選択</h2>
      <div class="cls-main"><div class="cls-list"></div>
        <div class="cls-view"><div class="cls-model"><div class="cls-host"></div><div class="cls-hint">ドラッグで回転</div></div><div class="cls-detail"></div></div></div>
      <div class="cls-foot"><span class="cls-note">始めの装備と方向性が決まります。拾った物はどのクラスでも使えます。</span><span><button class="btn" id="cls-back">↩ 戻る</button> <button class="btn primary" id="cls-go"></button></span></div></div>`, G.game.state === 'title' ? '' : 'solid'); // (from the end of the tutorial: over the game, not see-through)
    const wrap = s.querySelector('.cls-wrap'), list = s.querySelector('.cls-list'), det = s.querySelector('.cls-detail'), host = s.querySelector('.cls-host');
    list.innerHTML = CL.LIST.map((c) => `<button class="cls-item" data-c="${c.id}" style="--cc:${c.col}"><span class="cls-iic">${c.icon}</span><span class="cls-in"><b>${c.name}</b><small>${esc(c.role)}</small></span></button>`).join('');
    const show = () => {
      const c = CL.of(cur);
      list.querySelectorAll('.cls-item').forEach((b) => b.classList.toggle('on', b.dataset.c === cur));
      wrap.style.setProperty('--cc', c.col);
      det.innerHTML = CL.detailHTML(c);
      s.querySelector('#cls-go').textContent = `${c.icon} ${c.name}で始める`;
      pvShow(c, host);
    };
    let onKey = null;
    const done = () => { if (onKey) window.removeEventListener('keydown', onKey, true); onKey = null; };
    const go = () => { done(); CL.remember(cur); G.sfx.ui('select'); onPick(cur); };
    list.querySelectorAll('.cls-item').forEach((b) => { b.onclick = () => { if (cur === b.dataset.c) return; cur = b.dataset.c; G.sfx.ui('click'); show(); }; b.ondblclick = go; });
    onKey = (e) => {
      if (!s.isConnected) { done(); return; }
      const ids = CL.LIST.map((c) => c.id), i = ids.indexOf(cur);
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { cur = ids[(i + 1) % ids.length]; G.sfx.ui('click'); show(); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { cur = ids[(i + ids.length - 1) % ids.length]; G.sfx.ui('click'); show(); e.preventDefault(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(); }
    };
    window.addEventListener('keydown', onKey, true);
    // drag the figure round
    const md = s.querySelector('.cls-model');
    md.addEventListener('pointerdown', (e) => { PV.drag = { x: e.clientX, y: PV.yaw }; try { md.setPointerCapture(e.pointerId); } catch (er) { /* no capture: fine */ } });
    md.addEventListener('pointermove', (e) => { if (PV.drag) PV.yaw = PV.drag.y + (e.clientX - PV.drag.x) * 0.012; });
    const up = () => { PV.drag = null; }; md.addEventListener('pointerup', up); md.addEventListener('pointercancel', up);
    s.querySelector('#cls-go').onclick = go;
    s.querySelector('#cls-back').onclick = () => { done(); G.sfx.ui('back'); if (back) back(); };
    show();
    return s;
  };
})();
