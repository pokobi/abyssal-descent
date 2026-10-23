'use strict';
// Buff definitions. Stat buffs use `mods`, mechanic buffs use event hooks: fn(ctx, stacks, state).
(function () {
  const BUFFS = [];
  let C = null, P = null;
  G.bindBuffs = () => { C = G.combat; P = G.player; };
  const CAT = {
    stat: { name: '能力', icon: '📈' }, pile: { name: 'パイルドライバー強化', icon: '🔨' }, curse: { name: '呪い', icon: '🕯️' }, trade: { name: '代償', icon: '⚖️' }, offense: { name: '攻撃', icon: '⚔️' }, defense: { name: '防御', icon: '🛡️' },
    mobility: { name: '機動', icon: '👟' }, economy: { name: '経済', icon: '🪙' }, element: { name: '属性', icon: '🌈' }, summon: { name: '召喚', icon: '👻' }, skill: { name: 'スキル強化', icon: '🔮' }, ult: { name: 'アルティメット強化', icon: '🌟' }, melee: { name: '近接', icon: '🗡️' }, pact: { name: '契約', icon: '📜' }, relic: { name: '遺物', icon: '🏺' },
  };
  G.BUFF_CAT = CAT;
  function add(id, name, icon, rarity, cat, desc, def) {
    BUFFS.push(Object.assign({ id, name, icon, rarity, cat, desc, max: 1, kind: 'buff' }, def || {}));
  }

  // ---------- tiered stat buffs ----------
  const ST = [
    ['dmg', '火力強化', '💪', [0.08, 0.14, 0.22], (v) => `与ダメ+${Math.round(v * 100)}%`],
    ['maxHp', '体力強化', '❤️', [15, 25, 40], (v) => `最大HP+${v}`],
    ['fireRate', '速射', '🔁', [0.07, 0.12, 0.18], (v) => `連射速度+${Math.round(v * 100)}%`],
    ['reloadSpeed', '早装填', '♻️', [0.12, 0.2, 0.3], (v) => `リロード速度+${Math.round(v * 100)}%`],
    ['magSize', '弾倉拡張', '📦', [0.15, 0.25, 0.4], (v) => `装弾数+${Math.round(v * 100)}%`],
    ['moveSpeed', '俊足', '👟', [0.05, 0.09, 0.14], (v) => `移動速度+${Math.round(v * 100)}%`],
    ['critChance', '会心', '💢', [0.05, 0.08, 0.12], (v) => `会心率+${Math.round(v * 100)}%`],
    ['critMul', '会心ダメージ', '💥', [0.2, 0.35, 0.55], (v) => `会心ダメージ+${Math.round(v * 100)}%`],
    ['headMul', '首狩り', '🎯', [0.2, 0.35, 0.5], (v) => `ヘッドショット倍率+${Math.round(v * 100)}%`],
    ['armor', '鎧', '🛡️', [0.04, 0.07, 0.1], (v) => `被ダメ-${Math.round(v * 100)}%`],
    ['hpRegen', '再生', '💚', [0.6, 1.0, 1.6], (v) => `毎秒HP+${v}回復`],
    ['lifesteal', '吸血', '🩸', [0.02, 0.03, 0.045], (v) => `与ダメの${(v * 100).toFixed(1)}%を回復`],
    ['cdr', '瞑想', '⏳', [0.06, 0.1, 0.15], (v) => `スキルのクールタイム-${Math.round(v * 100)}%`],
    ['coinMul', '強欲', '🪙', [0.1, 0.18, 0.28], (v) => `コイン獲得量+${Math.round(v * 100)}%`],
    ['skillDmg', '魔力', '🔮', [0.08, 0.12, 0.18], (v) => `スキルダメージ+${Math.round(v * 100)}%`],
    ['explosionDmg', '爆破', '💣', [0.12, 0.2, 0.32], (v) => `爆発ダメージ+${Math.round(v * 100)}%`],
    ['shieldDmg', '盾砕き', '🔨', [0.25, 0.4, 0.6], (v) => `シールドへのダメージ+${Math.round(v * 100)}%`],
    ['spread', '精密', '📐', [-0.1, -0.17, -0.25], (v) => `弾の拡散${Math.round(v * 100)}%`],
    ['recoil', '安定', '🧘', [-0.12, -0.2, -0.3], (v) => `反動${Math.round(v * 100)}%`],
    ['jumpPower', '跳躍', '🦘', [0.08, 0.14, 0.2], (v) => `ジャンプ力+${Math.round(v * 100)}%`],
    ['grappleCd', '鉤縄習熟', '⚓', [0.12, 0.2, 0.3], (v) => `グラップルのクールタイム-${Math.round(v * 100)}%`],
    ['elemChance', '属性親和', '🌈', [0.05, 0.08, 0.12], (v) => `全攻撃に${Math.round(v * 100)}%で属性付与（武器属性/ランダム）`],
    ['pickupRange', '磁力', '🧲', [2, 3.5, 5], (v) => `コイン・回復の取得範囲+${v}m`],
    ['dodge', '回避', '🌫️', [0.04, 0.07, 0.1], (v) => `${Math.round(v * 100)}%で攻撃を回避`],
    ['bossDmg', '英雄', '👑', [0.1, 0.18, 0.28], (v) => `ボスへのダメージ+${Math.round(v * 100)}%`],
    ['range', '射程', '📏', [0.15, 0.25, 0.4], (v) => `有効射程+${Math.round(v * 100)}%`],
    ['meleeDmg', '剛腕', '👊', [0.3, 0.5, 0.8], (v) => `近接ダメージ+${Math.round(v * 100)}%`],
    ['slideBoost', '滑走', '🛷', [0.15, 0.25, 0.4], (v) => `スライディング速度+${Math.round(v * 100)}%`],
    ['grenadeDmg', '擲弾兵', '🧨', [0.15, 0.25, 0.4], (v) => `投擲物ダメージ+${Math.round(v * 100)}%`],
    ['adsSpeed', '早撃ち', '👁️', [0.15, 0.25, 0.35], (v) => `ADS速度+${Math.round(v * 100)}%`],
  ];
  const TIER = [['I', 'common'], ['II', 'uncommon'], ['III', 'rare']];
  for (const [k, name, icon, vals, df] of ST) {
    vals.forEach((v, i) => add(`s_${k}_${i + 1}`, `${name} ${TIER[i][0]}`, icon, TIER[i][1], 'stat', df(v), { mods: { [k]: v }, max: 5 }));
  }

  // ---------- trade-offs ----------
  add('t_glass', 'ガラスの大砲', '🏺', 'rare', 'trade', '与ダメ+40%、最大HP-30%', { mods: { dmg: 0.4, maxHpPct: -0.3 } });
  add('t_heavy', '重撃', '🔨', 'uncommon', 'trade', '与ダメ+25%、連射速度-15%', { mods: { dmg: 0.25, fireRate: -0.15 } });
  add('t_spray', '乱射', '🌧️', 'uncommon', 'trade', '連射速度+30%、拡散+30%', { mods: { fireRate: 0.3, spread: 0.3 } });
  add('t_jugg', '重戦車', '🐘', 'rare', 'trade', '最大HP+60、移動速度-10%', { mods: { maxHp: 60, moveSpeed: -0.1 } });
  add('t_sprinter', '韋駄天', '⚡', 'uncommon', 'trade', '移動速度+20%、最大HP-15', { mods: { moveSpeed: 0.2, maxHp: -15 } });
  add('t_blood', '血の契約', '🩸', 'rare', 'trade', '吸血+5%、自然再生を失う', { mods: { lifesteal: 0.05, hpRegen: -99 } });
  add('t_bigmag', '大容量主義', '🛢️', 'uncommon', 'trade', '装弾数+80%、リロード速度-25%', { mods: { magSize: 0.8, reloadSpeed: -0.25 } });
  add('t_quick', '早業', '🤹', 'uncommon', 'trade', 'リロード速度+50%、装弾数-20%', { mods: { reloadSpeed: 0.5, magSize: -0.2 } });
  add('t_sniper', '狙撃の構え', '🔭', 'rare', 'trade', 'ADS中の与ダメ+30%、腰だめの拡散+40%', { mods: { adsDmg: 0.3, hipSpread: 0.4 } });
  add('t_miser', '守銭奴', '💰', 'uncommon', 'trade', 'コイン獲得量+40%、ショップの価格+15%', { mods: { coinMul: 0.4, shopDiscount: -0.15 } });
  add('t_gamble', '博打打ち', '🎲', 'rare', 'trade', '会心率+15%、会心ダメージ-20%', { mods: { critChance: 0.15, critMul: -0.2 } });
  add('t_overclock', 'オーバークロック', '🔥', 'rare', 'trade', 'スキルのクールタイム-25%、最大HP-20', { mods: { cdr: 0.25, maxHp: -20 } });
  add('t_tank', '城壁', '🏰', 'uncommon', 'trade', '被ダメ-12%、移動速度-8%', { mods: { armor: 0.12, moveSpeed: -0.08 } });
  add('t_junkie', '興奮剤中毒', '💊', 'uncommon', 'trade', '連射速度+20%・移動速度+10%、被ダメ+10%', { mods: { fireRate: 0.2, moveSpeed: 0.1, armor: -0.1 } });
  add('t_hollow', '空ろな器', '🫙', 'rare', 'trade', '与ダメ+20%、回復量-40%', { mods: { dmg: 0.2, healMul: -0.4 } });
  add('t_cursed', '呪われた金貨', '🪙', 'rare', 'trade', 'コイン獲得量+60%、敵の攻撃力+15%', { mods: { coinMul: 0.6, enemyDmg: 0.15 } });
  add('t_light', '軽装', '🪶', 'uncommon', 'trade', '移動速度+12%・ジャンプ力+15%、装弾数-15%', { mods: { moveSpeed: 0.12, jumpPower: 0.15, magSize: -0.15 } });
  add('t_bulwark', '不動の砦', '🗿', 'rare', 'trade', '最大HP+40・被ダメ-8%、ジャンプ力-20%', { mods: { maxHp: 40, armor: 0.08, jumpPower: -0.2 } });
  add('t_chaos', '混沌の加護', '🌀', 'epic', 'trade', '与ダメ+30%・会心率+10%、敵のHP+20%', { mods: { dmg: 0.3, critChance: 0.1, enemyHp: 0.2 } });

  // ---------- helpers for mechanic buffs ----------
  const sc = (v) => (C ? C.scale(v) : v);
  const isWeapon = (c) => c.src === 'bullet';

  // ---------- on kill ----------
  add('k_explode', '連鎖爆発', '💥', 'rare', 'offense', '撃破した敵が爆発し、半径3.5mにダメージを与える。', { max: 3, hooks: { onKill(c, n) { C.explode(c.pos, 3.5, sc(28) * n, { src: 'buff', proc: true, color: 0xff8a3a, small: true }); } } });
  add('k_heal', '生命の収穫', '🌿', 'common', 'defense', '撃破時にHP+3。', { max: 4, hooks: { onKill(c, n) { C.heal(3 * n); } } });
  add('k_reload', '戦闘の高揚', '♻️', 'uncommon', 'offense', '撃破時、マガジンの20%を補充。', { max: 3, hooks: { onKill(c, n) { C.refill(0.2 * n); } } });
  add('k_speed', '狩人の疾走', '🐆', 'uncommon', 'mobility', '撃破時、3秒間移動速度+25%。', { hooks: { onKill() { C.temp('k_speed', 3, { moveSpeed: 0.25 }, '🐆'); } } });
  add('k_cd', '魂の循環', '⏳', 'rare', 'skill', '撃破時、スキルのクールタイム-0.5秒。', { max: 3, hooks: { onKill(c, n) { C.cdReduce(0.5 * n); } } });
  add('k_shield', '魂の障壁', '💠', 'uncommon', 'defense', '撃破時、オーバーシールド+5（最大50）。', { max: 3, hooks: { onKill(c, n) { C.overshield(5 * n, 50); } } });
  add('k_chain', '雷葬', '⚡', 'rare', 'element', '撃破時、近くの敵2体に雷撃（電撃付与）。', { max: 2, hooks: { onKill(c, n) { C.chain(c.pos, 2 * n, sc(30), 10, { src: 'buff', proc: true, elem: 'shock' }); } } });
  add('k_frenzy', '殺戮の狂乱', '🩸', 'rare', 'offense', '撃破毎に与ダメ+3%（最大+30%）。5秒間撃破がないとリセット。', {
    hooks: {
      onKill(c, n, s) { s.k = Math.min(10, (s.k || 0) + 1); s.t = 5; },
      tick(dt, n, s) { if (s.t > 0) { s.t -= dt; if (s.t <= 0) s.k = 0; } },
      preHit(c, n, s) { c.bonus += 0.03 * (s.k || 0); },
    }, counter: (s) => s.k || 0,
  });
  add('k_coin', '略奪者', '💰', 'common', 'economy', '撃破時、追加でコイン+2。', { max: 5, hooks: { onKill(c, n) { C.coins(2 * n, c.pos, null, true); } } });
  add('k_plague', '疫病の伝播', '🦠', 'rare', 'element', '状態異常の敵を倒すと、その状態異常が周囲6mの敵に伝染する。', { hooks: { onKill(c) { C.spreadStatus(c.e, 6); } } });
  add('k_ash', '灰燼', '🔥', 'uncommon', 'element', '撃破時、周囲4mの敵を炎上させる。', { hooks: { onKill(c) { for (const e of C.inRadius(c.pos, 4)) C.status(e, 'burn', 2); } } });
  add('k_icegrave', '氷葬', '❄️', 'uncommon', 'element', '撃破時、周囲4mの敵に冷気を付与。', { hooks: { onKill(c) { for (const e of C.inRadius(c.pos, 4)) C.status(e, 'frost', 2); } } });
  add('k_grapple', '鉤縄の補充', '⚓', 'uncommon', 'mobility', '撃破時、35%でグラップルのクールタイムをリセット。', { hooks: { onKill() { if (Math.random() < 0.35) P.grappleCd = 0; } } });
  add('k_overkill', '過剰殺傷', '🔪', 'rare', 'offense', '撃破時の超過ダメージが最も近い敵に転移する。', { hooks: { onKill(c) { if (c.overkill > 1) { const t = C.nearest(c.pos, 12, c.e); if (t) C.damageEnemy(t, c.overkill, { src: 'buff', proc: true }); } } } });
  add('k_soul', '魂弾', '👻', 'epic', 'offense', '撃破時、追尾する魂弾が近くの敵へ飛ぶ（ダメージ大）。', { max: 2, hooks: { onKill(c, n) { for (let i = 0; i < n; i++) C.soulBolt(c.pos, sc(45)); } } });
  add('k_multi', '連続撃破報酬', '🏅', 'common', 'economy', 'マルチキルのコインボーナス+100%。', { flag: true });
  add('k_headpop', '爆頭', '🎇', 'epic', 'offense', 'ヘッドショットで撃破すると頭部が爆発し、半径4mにダメージ。', { hooks: { onKill(c) { if (c.head) C.explode(c.pos, 4, sc(60), { src: 'buff', proc: true, color: 0xffcc66 }); } } });
  add('k_elite', '精鋭狩り', '👑', 'rare', 'defense', '精鋭を撃破するたび、最大HP+6（永続）。', { hooks: { onKill(c) { if (c.e.elite) { P.permMaxHp += 6; P.recalc(); C.heal(6); G.ui.toast('👑 最大HP+6', 'good'); } } } });
  add('k_asura', '修羅', '⚔️', 'epic', 'offense', 'エリア内の撃破数×0.6%与ダメ上昇（最大+40%）。エリア毎にリセット。', {
    hooks: { onAreaStart(c, n, s) { s.k = 0; }, onKill(c, n, s) { s.k = (s.k || 0) + 1; }, preHit(c, n, s) { c.bonus += Math.min(0.4, (s.k || 0) * 0.006); } }, counter: (s) => s.k || 0,
  });
  add('k_magfull', '弾倉吸収', '🔋', 'rare', 'offense', 'ヘッドショットで撃破するとマガジンが全回復。', { hooks: { onKill(c) { if (c.head) C.refill(1); } } });
  add('k_armor', '鋼の意志', '🦾', 'uncommon', 'defense', '撃破時、4秒間被ダメ-15%。', { hooks: { onKill() { C.temp('k_armor', 4, { armor: 0.15 }, '🦾'); } } });
  add('k_fear', '威圧', '😱', 'rare', 'offense', '撃破時、周囲6mの敵を2秒間恐怖させ逃走させる。', { hooks: { onKill(c) { for (const e of C.inRadius(c.pos, 6)) C.fear(e, 2); } } });
  add('k_combo', 'コンボ報酬', '🔢', 'uncommon', 'economy', 'コンボ（3秒以内の連続撃破）数に応じて撃破コイン+10%ずつ増加（最大+100%）。', { flag: true });

  // ---------- on hit ----------
  const procElem = (id, name, icon, rar, elem, p, d) => add(id, name, icon, rar, 'element', d, { max: 3, hooks: { onHit(c, n) { if (!c.proc && Math.random() < p * n) C.status(c.e, elem, 1); } } });
  procElem('h_burn', '火種', '🔥', 'common', 'burn', 0.1, '命中時10%で炎上を付与。');
  procElem('h_frost', '霜の指先', '❄️', 'common', 'frost', 0.1, '命中時10%で冷気を付与（蓄積で凍結）。');
  procElem('h_poison', '毒塗り', '☠️', 'common', 'poison', 0.12, '命中時12%で毒を付与（蓄積）。');
  procElem('h_shock', '帯電', '⚡', 'common', 'shock', 0.08, '命中時8%で電撃を付与。');
  procElem('h_bleed', '鋸刃', '🩸', 'common', 'bleed', 0.12, '命中時12%で出血を付与。');
  add('h_chain', '雷鎖', '⛓️', 'rare', 'element', '命中時15%で2体に雷撃が連鎖（ダメージ50%）。', { max: 2, hooks: { onHit(c, n) { if (!c.proc && Math.random() < 0.15 * n) C.chain(c.e, 2, c.dmg * 0.5 + 5, 10, { src: 'buff', proc: true, elem: 'shock' }); } } });
  add('h_focus', '弱点看破', '🔍', 'uncommon', 'offense', '同じ敵に連続命中するたび与ダメ+2%（最大+20%）。', {
    hooks: { preHit(c, n, s) { if (s.e === c.e) c.bonus += Math.min(0.2, (s.k || 0) * 0.02); }, onHit(c, n, s) { if (c.proc) return; if (s.e === c.e) s.k = (s.k || 0) + 1; else { s.e = c.e; s.k = 0; } } },
  });
  add('h_first', '先制の一撃', '🗡️', 'uncommon', 'offense', 'HP満タンの敵へのダメージ+40%。', { hooks: { preHit(c) { if (c.e.hp >= c.e.maxHp && c.e.shield <= 0) c.bonus += 0.4; } } });
  add('h_low', '処刑人', '⚰️', 'rare', 'offense', 'HP30%以下の敵へのダメージ+35%。', { hooks: { preHit(c) { if (c.e.hp < c.e.maxHp * 0.3) c.bonus += 0.35; } } });
  add('h_execute', '慈悲なき刃', '💀', 'epic', 'offense', 'HP12%以下の通常の敵を即死させる。', { hooks: { preHit(c) { if (!c.e.boss && c.e.hp < c.e.maxHp * 0.12) c.execute = true; } } });
  add('h_synergy', '相乗効果', '🌈', 'rare', 'element', '敵の状態異常1種につき与ダメ+10%。', { hooks: { preHit(c) { c.bonus += 0.1 * C.statusCount(c.e); } } });
  add('h_inferno', '業火', '🔥', 'uncommon', 'element', '炎上ダメージ+60%。', { mods: { burnDmg: 0.6 }, max: 3 });
  add('h_shatter', '砕氷', '🧊', 'rare', 'element', '凍結中の敵へのダメージ+50%。', { hooks: { preHit(c) { if (c.e.st && c.e.st.frozen > 0) c.bonus += 0.5; } } });
  add('h_corrode', '腐食毒', '🧪', 'uncommon', 'element', '毒の最大スタック+5、毒ダメージ+30%。', { mods: { poisonDmg: 0.3, poisonStacks: 5 }, max: 2 });
  add('h_overcurrent', '過電流', '🔌', 'uncommon', 'element', '電撃付与時、追加で近くの敵1体にも電撃が伝播。', { flag: true });
  add('h_hemorrhage', '失血', '💉', 'rare', 'element', '出血中の敵へのヘッドショットで、残りの出血ダメージを一括で与える。', { hooks: { onHit(c) { if (c.head && !c.proc) C.burstBleed(c.e); } } });
  add('h_critheal', '会心の癒し', '💖', 'uncommon', 'defense', '会心時にHP+2。', { max: 3, hooks: { onHit(c, n) { if (c.crit && !c.proc) C.heal(2 * n); } } });
  add('h_critcd', '冴え', '💫', 'rare', 'skill', '会心時、スキルのクールタイム-0.3秒。', { hooks: { onHit(c) { if (c.crit && !c.proc) C.cdReduce(0.3); } } });
  add('h_hsammo', '精密射撃', '🎯', 'uncommon', 'offense', 'ヘッドショット時30%で弾を1発返却。', { hooks: { onHit(c) { if (c.head && isWeapon(c) && Math.random() < 0.3) C.refillN(1); } } });
  add('h_concuss', '脳震盪', '😵', 'rare', 'offense', 'ヘッドショットで敵を0.5秒スタン（3秒に1回/敵）。', { hooks: { onHit(c) { if (c.head && !c.proc && !c.e.boss && (c.e._concT || 0) < G.game.time) { c.e._concT = G.game.time + 3; C.stun(c.e, 0.5); } } } });
  add('h_close', '近接戦闘', '👊', 'common', 'offense', '8m以内の敵へのダメージ+20%。', { max: 3, hooks: { preHit(c, n) { if (c.dist < 8) c.bonus += 0.2 * n; } } });
  add('h_long', '狙撃手', '🔭', 'common', 'offense', '25m以上離れた敵へのダメージ+25%。', { max: 3, hooks: { preHit(c, n) { if (c.dist > 25) c.bonus += 0.25 * n; } } });
  add('h_ads', '集中射撃', '👁️', 'uncommon', 'offense', 'ADS中の与ダメ+15%。', { max: 3, mods: { adsDmg: 0.15 } });
  add('h_hip', '腰だめの達人', '🤠', 'uncommon', 'offense', '腰だめ射撃時の与ダメ+15%、拡散-25%。', { hooks: { preHit(c) { if (!P.adsActive && isWeapon(c)) c.bonus += 0.15; } }, mods: { hipSpread: -0.25 } });
  add('h_air', '空中殺法', '🦅', 'rare', 'mobility', '空中にいる間、与ダメ+30%。', { hooks: { preHit(c) { if (!P.grounded) c.bonus += 0.3; } } });
  add('h_slide', '滑走射撃', '🛷', 'uncommon', 'mobility', 'スライディング中と終了後1秒間、与ダメ+40%。', { hooks: { preHit(c) { if (P.sliding || G.game.time - P.slideEndT < 1) c.bonus += 0.4; } } });
  add('h_moving', '機動戦', '🏃', 'uncommon', 'mobility', '移動速度に比例して与ダメ最大+25%。', { hooks: { preHit(c) { c.bonus += Math.min(0.25, P.speedH / 12 * 0.25); } } });
  add('h_still', '不動の構え', '🗿', 'uncommon', 'offense', '静止中、与ダメ+25%・拡散-30%。', { hooks: { preHit(c) { if (P.speedH < 0.5) c.bonus += 0.25; } }, flag: true });
  add('h_last', '最後の一発', '🔚', 'rare', 'offense', 'マガジン最後の3発のダメージ+100%。', { hooks: { preHit(c) { if (isWeapon(c) && P.weapon && P.weapon.mag < 3) c.bonus += 1.0; } } });
  add('h_firstb', '初撃強化', '🥇', 'uncommon', 'offense', 'リロード後最初の5発のダメージ+30%。', { hooks: { onReloadEnd(c, n, s) { s.k = 5; }, onShoot(c, n, s) { if (s.k > 0) s.k--; s.on = s.k > 0; }, preHit(c, n, s) { if (isWeapon(c) && s.on) c.bonus += 0.3; } } });
  add('h_fullhp', '万全', '💯', 'uncommon', 'offense', 'HP満タン時、与ダメ+20%。', { hooks: { preHit(c) { if (P.hp >= P.stats.maxHp) c.bonus += 0.2; } } });
  add('h_desperate', '背水の陣', '🔥', 'rare', 'offense', 'HPが低いほど与ダメ上昇（最大+50%）。', { hooks: { preHit(c) { c.bonus += 0.5 * (1 - P.hp / P.stats.maxHp); } } });
  add('h_shieldstun', '盾割りの衝撃', '🔨', 'uncommon', 'offense', 'シールドを破壊した敵を2秒スタン。', { hooks: { onShieldBreak(c) { C.stun(c.e, 2); } } });
  add('h_shieldboom', '破砕衝撃', '💠', 'rare', 'offense', 'シールド破壊時、その場で爆発（周囲のシールドに大ダメージ）。', { hooks: { onShieldBreak(c) { C.explode(c.e.pos.clone().setY(c.e.pos.y + 1), 4.5, sc(50), { src: 'buff', proc: true, shieldMul: 5, color: 0xa8d8ff }); } } });
  add('h_boss', '巨人殺し', '🗡️', 'rare', 'offense', 'ボスへのダメージ+20%、ボスからの被ダメ-10%。', { mods: { bossDmg: 0.2 }, hooks: { preDamaged(c) { if (c.attacker && c.attacker.boss) c.red += 0.1; } } });
  add('h_elite', '精鋭特攻', '⭐', 'uncommon', 'offense', '精鋭へのダメージ+25%。', { mods: { eliteDmg: 0.25 }, max: 2 });
  add('h_flyer', '撃墜王', '🪃', 'uncommon', 'offense', '飛行する敵へのダメージ+35%。', { hooks: { preHit(c) { if (c.e.flyer) c.bonus += 0.35; } } });
  add('h_big', '巨獣狩り', '🐘', 'uncommon', 'offense', '大型の敵へのダメージ+25%。', { hooks: { preHit(c) { if (c.e.big) c.bonus += 0.25; } } });
  add('h_ricochet', '跳弾', '↪️', 'rare', 'offense', '15%で弾が近くの敵へ跳弾する。', { mods: { ricochet: 0.15 }, max: 3 });
  add('h_pierce', '貫通', '➶', 'rare', 'offense', '弾の貫通数+1。', { mods: { pierce: 1 }, max: 3 });
  add('h_double', '双撃', '👯', 'epic', 'offense', '10%で弾が2発発射される。', { mods: { doubleShot: 0.1 }, max: 3 });
  add('h_echo', '残響', '🔁', 'epic', 'offense', '4発命中毎に、幽霊弾が同じ敵を追撃（ダメージ50%）。', { hooks: { onHit(c, n, s) { if (c.proc || !isWeapon(c)) return; s.k = (s.k || 0) + 1; if (s.k >= 4) { s.k = 0; C.soulBolt(P.eyePos(), c.dmg * 0.5 + 4, c.e); } } } });
  add('h_boom', '爆裂弾', '💥', 'rare', 'offense', '8%で命中点が爆発（半径2.5m）。', { max: 3, hooks: { onHit(c, n) { if (!c.proc && isWeapon(c) && Math.random() < 0.08 * n) C.explode(c.pos, 2.5, c.dmg * 0.8 + sc(10), { src: 'buff', proc: true, small: true }); } } });
  add('h_critchain', '会心雷', '⚡', 'rare', 'element', '会心時に近くの敵3体へ雷撃が連鎖。', { hooks: { onHit(c) { if (c.crit && !c.proc) C.chain(c.e, 3, c.dmg * 0.4 + 5, 10, { src: 'buff', proc: true, elem: 'shock' }); } } });
  add('h_heavy', '重弾', '⚫', 'uncommon', 'offense', 'ダメージ+8%、敵を強くノックバック。', { mods: { dmg: 0.08, knock: 1 }, max: 2 });

  // ---------- mobility ----------
  add('m_dj', '二段ジャンプ', '🪽', 'rare', 'mobility', '空中でもう1回ジャンプできる（重ねると三段）。', { mods: { maxJumps: 1 }, max: 2 });
  add('m_airdash', '空中ダッシュ', '💨', 'rare', 'mobility', '空中でスプリントキーを押すと視線方向へダッシュ（着地で回復）。', { flag: true });
  add('m_bunny', '慣性の達人', '🐇', 'uncommon', 'mobility', '着地時の減速がなくなり、空中制御+60%。', { mods: { airControl: 0.6 }, flag: true });
  add('m_slidereload', '滑りながら装填', '♻️', 'uncommon', 'mobility', 'スライディング開始時、リロード中なら即座に完了する。', { hooks: { onSlide() { C.finishReload(); } } });
  add('m_slideshield', '滑走の盾', '🛡️', 'uncommon', 'defense', 'スライディング中の被ダメ-50%。', { hooks: { preDamaged(c) { if (P.sliding) c.red += 0.5; } } });
  add('m_landshock', '着地衝撃', '💥', 'uncommon', 'mobility', '高所（落下速度大）から着地すると周囲に衝撃波。', { hooks: { onLand(c) { if (c.speed > 13) C.explode(P.pos.clone().setY(P.pos.y + 0.3), 4.5, sc(25) + c.speed * 2, { src: 'buff', proc: true, color: 0xd0b080, small: true, knock: 8 }); } } });
  add('m_feather', '羽毛の加護', '🪶', 'common', 'mobility', '奈落への落下ダメージ無効、空中制御+30%。', { mods: { airControl: 0.3 }, flag: true });
  add('m_grapdmg', '鉤縄の一撃', '⚓', 'rare', 'mobility', 'グラップル中と解除後2秒間、与ダメ+30%。', { hooks: { preHit(c) { if (P.grapple.state === 'attached' || G.game.time - P.grapple.endT < 2) c.bonus += 0.3; } } });
  add('m_grapenemy', '獲物の鉤爪', '🪝', 'epic', 'mobility', '敵にグラップル可能。命中した敵を引き寄せてダメージ＋スタン。', { flag: true });
  add('m_graprange', '長鎖', '⛓️', 'common', 'mobility', 'グラップル射程+15m。', { mods: { grappleRange: 15 }, max: 2 });
  // ---- grapple (its cooldown is 15 s by default, so these matter) ----
  add('g_oil', '鉤縄の油', '🛢️', 'uncommon', 'mobility', 'グラップルのクールタイム-25%。', { mods: { grappleCd: 0.25 }, max: 3 });
  add('g_recoil', '反動利用', '🏹', 'uncommon', 'mobility', 'グラップル使用時、4秒間 与ダメ+20%。', { max: 2, hooks: { onGrapple(c, n) { C.temp('g_recoil', 4, { dmg: 0.2 * n }, '🏹'); } } });
  add('g_gale', '疾風の鉤', '🌬️', 'uncommon', 'mobility', 'グラップル使用時、4秒間 移動速度+30%。', { hooks: { onGrapple() { C.temp('g_gale', 4, { moveSpeed: 0.3 }, '🌬️'); } } });
  add('g_wave', '鉤縄衝撃', '💥', 'rare', 'mobility', 'グラップル使用時、周囲5mに衝撃波（ダメージ＋ノックバック）。', { max: 2, hooks: { onGrapple(c, n) { C.explode(P.pos.clone().setY(P.pos.y + 0.8), 5, sc(60 * n), { src: 'buff', proc: true, knock: 8, color: 0xbfd8ff }); } } });
  add('g_guard', '鉤縄の加護', '🛡️', 'rare', 'mobility', 'グラップル使用時、オーバーシールド+25（最大60）。', { hooks: { onGrapple() { C.overshield(25, 60); } } });
  add('g_aerial', '空中戦の流儀', '🕊️', 'epic', 'mobility', 'グラップルで移動している最中に敵を倒すと、グラップルのクールタイムを即リセット。', { hooks: { onKill() { const g = P.grapple; if (g && (g.state === 'attached' || g.state === 'firing' || g.state === 'retract' || (G.game.time - (g.endT || -10)) < 3)) { P.grappleCd = 0; G.ui.toastSmall('⚓ グラップル再使用可能'); } } } });
  add('g_twin', '双鉤', '⚓', 'legendary', 'mobility', 'グラップルのクールタイム-40%・射程+10m・巻き取り速度+25%。', { mods: { grappleCd: 0.4, grappleRange: 10, grappleSpeed: 0.25 } });
  add('m_grapspeed', '巻上げ機', '⚙️', 'uncommon', 'mobility', 'グラップルの巻き取り速度+35%。', { mods: { grappleSpeed: 0.35 }, max: 2 });
  add('m_grapshield', '吊り盾', '💠', 'uncommon', 'defense', 'グラップル開始時、オーバーシールド+15（最大60）。', { hooks: { onGrapple() { C.overshield(15, 60); } } });
  add('m_momentum', '疾走の勢い', '🚀', 'rare', 'mobility', '秒速11m以上で移動中、与ダメ+20%・被ダメ-15%。', { hooks: { preHit(c) { if (P.speedH > 11) c.bonus += 0.2; }, preDamaged(c) { if (P.speedH > 11) c.red += 0.15; } } });
  add('m_sprintreload', '走行装填', '🏃', 'uncommon', 'mobility', 'スプリント中もリロードでき、リロード速度+25%。', { mods: { reloadSpeed: 0.25 }, flag: true });
  add('m_skillhaste', '詠唱疾走', '⚡', 'uncommon', 'mobility', 'スキル使用時、3秒間移動速度+30%。', { hooks: { onSkill() { C.temp('m_skillhaste', 3, { moveSpeed: 0.3 }, '⚡'); } } });
  add('m_pileup', '隕撃', '🔨', 'rare', 'pile', 'パイルドライバーの範囲+40%、ダメージ+40%。', { flag: true, max: 2 });
  add('m_dashdodge', '回避本能', '🌫️', 'uncommon', 'defense', 'ダッシュ/スライディング後1秒間、回避率+50%。', { hooks: { onSlide() { C.temp('m_dashdodge', 1, { dodge: 0.5 }, '🌫️'); }, onDash() { C.temp('m_dashdodge', 1, { dodge: 0.5 }, '🌫️'); } } });
  add('m_trail', '炎の足跡', '👣', 'rare', 'element', 'スプリント中、足跡に炎を残す。', { hooks: { tick(dt, n, s) { if (P.sprinting && P.grounded) { s.t = (s.t || 0) - dt; if (s.t <= 0) { s.t = 0.25; C.zone(P.pos.clone(), 1.6, 2.5, 'fire', sc(14), { proc: true }); } } } } });

  // ---------- defense ----------
  add('d_secondwind', '不屈', '💗', 'epic', 'defense', '致死ダメージを1回だけ耐え、HP50%で復活する（エリア毎に再使用可）。', { hooks: { onAreaStart(c, n, s) { s.used = 0; } }, flag: true });
  add('d_thorns', '茨', '🌵', 'uncommon', 'defense', '近接攻撃してきた敵へ被ダメの150%を反射。', { max: 3, hooks: { onDamaged(c, n) { if (c.src === 'melee' && c.attacker && c.attacker.alive) C.damageEnemy(c.attacker, c.raw * 1.5 * n + sc(5), { src: 'buff', proc: true }); } } });
  add('d_adren', '窮地の加速', '🫀', 'uncommon', 'defense', 'HP30%以下の時、移動速度+25%・連射速度+20%。', { hooks: { tick(dt, n, s) { const low = P.hp < P.stats.maxHp * 0.3; if (low !== !!s.on) { s.on = low; if (low) C.temp('d_adren', 9999, { moveSpeed: 0.25, fireRate: 0.2 }, '🫀'); else C.untemp('d_adren'); } } } });
  add('d_rest', '休息', '🛌', 'common', 'defense', 'エリア開始時にHPを25%回復。', { max: 2, hooks: { onAreaStart(c, n) { C.heal(P.stats.maxHp * 0.25 * n); } } });
  add('d_wine', '勝利の美酒', '🍷', 'common', 'defense', 'エリアクリア時にHP+30。', { max: 3, hooks: { onAreaClear(c, n) { C.heal(30 * n); } } });
  add('d_overheal', '過剰治癒', '💠', 'rare', 'defense', '最大HPを超えた回復量をオーバーシールドに変換（最大60）。', { flag: true });
  add('d_shieldregen', '魔力障壁', '🔵', 'rare', 'defense', '4秒間被弾しないとオーバーシールドが25まで自動再生する。', { hooks: { tick(dt) { if (G.game.time - P.lastHurtT > 4 && P.os < 25) P.os = Math.min(25, P.os + dt * 10); } } });
  add('d_angel', '守護天使', '👼', 'rare', 'defense', '被弾後1秒間、被ダメ-60%。', { hooks: { preDamaged(c) { if (G.game.time - P.lastHurtT < 1) c.red += 0.6; } } });
  add('d_supply', '補給', '💉', 'uncommon', 'defense', '空のマガジンをリロードするとHP+6。', { max: 3, hooks: { onReload(c, n) { if (c.empty) C.heal(6 * n); } } });
  add('d_vampcrit', '吸血会心', '🦇', 'rare', 'defense', '会心時、与ダメの8%を回復。', { hooks: { onHit(c) { if (c.crit && !c.proc) C.leech(c.dmg * 0.08, 0.08); } } });
  add('d_coldblood', '冷血', '🧊', 'uncommon', 'defense', '冷気状態の敵からの被ダメ-30%。', { hooks: { preDamaged(c) { if (c.attacker && c.attacker.st && c.attacker.st.frost > 0) c.red += 0.3; } } });
  add('d_ranged', '弾除け', '🪨', 'uncommon', 'defense', '遠距離攻撃の被ダメ-25%。', { max: 2, hooks: { preDamaged(c, n) { if (c.src === 'ranged') c.red += 0.25 * n; } } });
  add('d_melee', '堅牢', '🧱', 'uncommon', 'defense', '近接攻撃の被ダメ-20%。', { max: 2, hooks: { preDamaged(c, n) { if (c.src === 'melee') c.red += 0.2 * n; } } });
  add('d_blast', '爆風耐性', '💣', 'common', 'defense', '爆発・範囲攻撃の被ダメ-50%。', { hooks: { preDamaged(c) { if (c.src === 'explosion' || c.src === 'aoe') c.red += 0.5; } } });
  add('d_laststand', '最後の抵抗', '⚔️', 'rare', 'defense', 'HP25%以下で被ダメ-35%。', { hooks: { preDamaged(c) { if (P.hp < P.stats.maxHp * 0.25) c.red += 0.35; } } });
  add('d_phoenix', '不死鳥', '🐦', 'legendary', 'defense', 'ラン中1回だけ、死亡時にHP全快で復活し周囲に大爆発を起こす。', { flag: true });
  add('d_vampaura', '吸血の霧', '🌫️', 'epic', 'defense', '周囲6mの敵から毎秒生命力を吸収する。', { hooks: { tick(dt, n, s) { s.t = (s.t || 0) - dt; if (s.t > 0) return; s.t = 0.5; let tot = 0; for (const e of C.inRadius(P.pos, 6)) { C.damageEnemy(e, sc(4) * n, { src: 'buff', proc: true, silent: true }); tot += Math.max(1.2, G.player.stats.maxHp * 0.003); } if (tot) C.heal(tot * n, true); } } });
  add('d_iron', '鉄の皮膚', '🪖', 'uncommon', 'defense', '1回の被ダメが最大HPの25%を超えなくなる。', { flag: true });
  add('d_cleanse', '浄化の加護', '✨', 'uncommon', 'defense', '状態異常の持続時間-60%。', { flag: true });

  // ---------- economy & meta ----------
  add('e_interest', '利子', '🏦', 'rare', 'economy', 'エリア開始時、所持コインの8%（最大120）を得る。', { max: 2, hooks: { onAreaStart(c, n) { const v = Math.min(120 * n, Math.floor(G.game.run.coins * 0.08 * n)); if (v > 0) C.coins(v, null, '利子'); } } });
  add('e_discount', '値切り上手', '🏷️', 'uncommon', 'economy', 'ショップの価格-12%。', { mods: { shopDiscount: 0.12 }, max: 3 });
  add('e_choice', '選択肢', '🃏', 'epic', 'economy', '加護選択の選択肢+1。', { mods: { buffChoices: 1 }, max: 2 });
  add('e_reroll', '運命の再配', '🎲', 'uncommon', 'economy', '加護選択時にリロールが1回可能になる。', { mods: { buffRerolls: 1 }, max: 3 });
  add('e_luck', '幸運', '🍀', 'uncommon', 'economy', '高レアリティの加護・商品が出やすくなる。', { mods: { luck: 0.35 }, max: 3 });
  add('e_treasure', '宝探し', '🗺️', 'uncommon', 'economy', '各エリアに宝箱が1つ追加される。', { mods: { extraChests: 1 }, max: 3 });
  add('e_chestbonus', '宝箱の主', '📦', 'common', 'economy', '宝箱から得られるコイン+50%、中身も高レアリティになりやすい（宝箱のみ・幸運+0.5相当）。', { mods: { chestBonus: 0.5 }, max: 3 });
  add('e_speedrun', '速攻', '⏱️', 'uncommon', 'economy', '速攻クリアボーナスが2倍。', { flag: true });
  add('e_flawless', '無傷の誇り', '🏅', 'uncommon', 'economy', '無傷クリアボーナスが2倍、無傷クリア毎に最大HP+3。', { hooks: { onAreaClear(c) { if (c.flawless) { P.permMaxHp += 3; P.recalc(); } } } });
  add('e_free', '常連客', '🎁', 'epic', 'economy', 'ショップの商品が1つ無料になる（エリアごとに1回・リロールでは増えない）。', { flag: true });
  add('e_goldblood', '黄金の血', '💛', 'rare', 'economy', 'コインを拾う度にHP+1。', { hooks: { onCoin() { C.heal(1); } } });
  add('e_ready', '準備万端', '🔋', 'common', 'skill', 'エリア開始時に全スキルのクールタイムをリセット。', { hooks: { onAreaStart() { C.cdResetAll(); } } });
  add('e_bandolier', '弾薬帯', '🎗️', 'uncommon', 'economy', 'エリア開始時に破片手榴弾+1。', { max: 3, hooks: { onAreaStart(c, n) { P.addItem('g_frag', n); } } });
  add('e_destroy', '破壊衝動', '🪓', 'common', 'economy', '破壊可能オブジェクトからのコイン+100%、破壊時に稀に回復薬。', { flag: true });
  add('e_chestbless', '宝箱の祝福', '🎁', 'rare', 'economy', '宝箱を開けると20秒間ランダムな強化を得る。', { hooks: { onChest() { const opts = [['dmg', 0.3, '💪'], ['fireRate', 0.3, '🔁'], ['moveSpeed', 0.3, '👟'], ['armor', 0.3, '🛡️'], ['critChance', 0.2, '💢']]; const o = opts[Math.floor(Math.random() * opts.length)]; C.temp('e_chestbless', 20, { [o[0]]: o[1] }, o[2]); } } });
  add('e_stealth', '隠密', '🤫', 'uncommon', 'offense', 'エリア開始時5秒間、敵に発見されない。その間の与ダメ+100%。', { hooks: { onAreaStart() { C.temp('e_stealth', 5, { invis: 1 }, '🤫'); }, preHit(c) { if (P.stats.invis > 0) c.bonus += 1.0; } } });
  add('e_hawk', '鷹の目', '🦅', 'rare', 'skill', '25m以上でのヘッドショット時、スキルのクールタイム-1秒。', { hooks: { onHit(c) { if (c.head && c.dist > 25 && !c.proc) C.cdReduce(1); } } });
  add('e_bounty', '賞金首', '💰', 'uncommon', 'economy', '精鋭撃破時のコイン×2。', { flag: true });
  add('e_salvage', '鉄屑回収', '🔩', 'common', 'economy', '武器の下取り額が、価格の30%分さらに増える。', { flag: true });

  // ---------- grenades / skills ----------
  add('g_cluster', '散開手榴弾', '🎆', 'rare', 'offense', '投擲物の爆発時に子爆弾3個を撒く。', { flag: true });
  add('g_refund', '再利用', '♻️', 'rare', 'offense', '投擲物の使用時30%で消費しない。', { flag: true });
  add('g_radius', '爆風拡大', '🌋', 'uncommon', 'offense', '爆発半径+25%。', { mods: { explosionRadius: 0.25 }, max: 3 });
  add('s_echo', '残響詠唱', '🔁', 'legendary', 'skill', 'スキル使用時25%でクールタイムが発生しない。', { flag: true });
  add('s_after', '詠唱の余韻', '✨', 'uncommon', 'skill', 'スキル使用後4秒間、与ダメ+20%。', { hooks: { onSkill() { C.temp('s_after', 4, { dmg: 0.2 }, '✨'); } } });
  add('s_heal', '魔力循環', '💚', 'uncommon', 'skill', 'スキル使用時、HP+8。', { max: 3, hooks: { onSkill(c, n) { C.heal(8 * n); } } });
  add('s_ammo', '自動装填', '🔄', 'rare', 'offense', '3秒間撃たないと、マガジンが毎秒15%ずつ自動回復。', { hooks: { tick(dt) { if (G.game.time - P.lastShotT > 3 && P.weapon && !P.weapon.reloading) C.refill(0.15 * dt, true); } } });
  add('s_reloaddmg', '装填の怒り', '😤', 'uncommon', 'offense', 'リロード完了後3秒間、与ダメ+25%。', { hooks: { onReloadEnd() { C.temp('s_reloaddmg', 3, { dmg: 0.25 }, '😤'); } } });
  add('s_reloadnova', '装填衝撃波', '💫', 'rare', 'offense', '空のマガジンをリロードすると周囲6mに衝撃波。', { hooks: { onReload(c) { if (c.empty) C.explode(P.pos.clone().setY(P.pos.y + 1), 6, sc(30), { src: 'buff', proc: true, knock: 10, color: 0xc0d8ff, small: true }); } } });
  add('s_tactical', 'タクティカル', '⚡', 'common', 'offense', 'マガジンが空の時のリロードが40%速い。', { flag: true });
  add('s_bullethell', '弾の嵐', '🌧️', 'epic', 'offense', '連射速度+25%、装弾数+25%。', { mods: { fireRate: 0.25, magSize: 0.25 } });

  // ---------- elemental mastery ----------
  add('x_master', '元素の王', '👑', 'legendary', 'element', '属性付与率+15%、状態異常ダメージ+50%。', { mods: { elemChance: 0.15, burnDmg: 0.5, poisonDmg: 0.5, dotDmg: 0.5 } });
  add('x_spread', '延焼', '🔥', 'rare', 'element', '炎上中の敵が近くの敵に燃え移る。', { flag: true });
  add('x_shatter', '凍結破砕', '❄️', 'rare', 'element', '凍結中の敵を倒すと氷片が飛び散り範囲ダメージ＋冷気。', { hooks: { onKill(c) { if (c.e.st && c.e.st.frozen > 0) { C.explode(c.pos, 4, sc(40), { src: 'buff', proc: true, color: 0xbfe8ff, small: true }); for (const e of C.inRadius(c.pos, 4)) C.status(e, 'frost', 3); } } } });
  add('x_toxburst', '毒爆', '☠️', 'rare', 'element', '毒が5スタック以上の敵は破裂し、周囲に毒を撒く。', { flag: true });
  add('x_overload', '過負荷', '⚡', 'rare', 'element', '電撃状態の敵へのシールドダメージ+100%。', { hooks: { preHit(c) { if (c.e.st && c.e.st.shock > 0) c.shieldBonus = (c.shieldBonus || 0) + 1; } } });
  add('x_frostaura', '冷気の衣', '🥶', 'rare', 'element', '周囲5mの敵に継続的に冷気を付与。', { hooks: { tick(dt, n, s) { s.t = (s.t || 0) - dt; if (s.t > 0) return; s.t = 0.8; for (const e of C.inRadius(P.pos, 5)) C.status(e, 'frost', 1); } } });
  add('x_slowtime', '刹那', '⌛', 'epic', 'offense', 'ADS中、時間の流れが25%遅くなる。', { flag: true });
  add('x_curse', '呪詛', '🕯️', 'rare', 'offense', '敵の最大HP-10%。', { mods: { enemyHp: -0.1 }, max: 2 });
  add('x_weaken', '弱体化の呪い', '🧿', 'uncommon', 'defense', '敵の攻撃力-8%。', { mods: { enemyDmg: -0.08 }, max: 3 });
  add('x_heavyair', '重き空気', '🐌', 'uncommon', 'defense', '敵の移動速度-8%。', { mods: { enemySpeed: -0.08 }, max: 3 });

  // ---------- summons / auras ----------
  add('z_blades', '周回する刃', '🌀', 'epic', 'summon', '周囲を2本の霊刃が回転し、触れた敵を切り裂く。', { max: 3, flag: true });
  add('z_wolf', '霊狼の加護', '🐺', 'legendary', 'summon', '霊狼が2秒ごとに近くの敵へ噛み付き、大ダメージ＋出血。', { hooks: { tick(dt, n, s) { s.t = (s.t || 0) - dt; if (s.t > 0) return; s.t = 2 / n; const e = C.nearest(P.pos, 18); if (e) C.spiritBite(e, sc(55)); } } });
  add('z_owl', '使い魔の梟', '🦉', 'epic', 'summon', '3秒ごとに近くの敵へ追尾魔弾を放つ。', { max: 2, hooks: { tick(dt, n, s) { s.t = (s.t || 0) - dt; if (s.t > 0) return; s.t = 3 / n; const e = C.nearest(P.pos, 30); if (e) C.soulBolt(P.eyePos().add(new THREE.Vector3(0, 0.6, 0)), sc(35), e); } } });
  add('z_storm', '雷雲', '🌩️', 'legendary', 'summon', '4秒ごとにランダムな敵へ落雷（電撃付与）。', { hooks: { tick(dt, n, s) { s.t = (s.t || 0) - dt; if (s.t > 0) return; s.t = 4 / n; const e = C.randomEnemy(35); if (e) C.lightningStrike(e, sc(80)); } } });
  add('z_orbs', '守護の宝珠', '🔮', 'epic', 'summon', '3つの宝珠が周囲を回り、敵の投射物を相殺する。', { flag: true });
  add('z_mine', '自動地雷', '⚙️', 'rare', 'summon', '8秒ごとに足元へ地雷を設置する。', { hooks: { tick(dt, n, s) { s.t = (s.t || 0) - dt; if (s.t > 0) return; s.t = 8 / n; C.dropMine(P.pos.clone(), sc(90)); } } });

  // ---------- extra flavourful ones ----------
  add('o_glasscrit', '研ぎ澄まされた一撃', '🔪', 'epic', 'offense', '会心ダメージ+60%、会心率+5%。', { mods: { critMul: 0.6, critChance: 0.05 } });
  add('o_ricochetwall', '壁跳ね', '🧱', 'rare', 'offense', '壁に当たった弾が30%で近くの敵へ跳ね返る。', { flag: true });
  add('o_vengeance', '報復', '😤', 'uncommon', 'offense', '被弾後4秒間、与ダメ+30%。', { hooks: { onDamaged() { C.temp('o_vengeance', 4, { dmg: 0.3 }, '😤'); } } });
  add('o_opening', '開幕の号砲', '📯', 'uncommon', 'offense', 'エリア開始から10秒間、与ダメ+50%・連射速度+25%。', { hooks: { onAreaStart() { C.temp('o_opening', 10, { dmg: 0.5, fireRate: 0.25 }, '📯'); } } });
  add('o_closer', '幕引き', '🎬', 'rare', 'offense', '残り敵が3体以下になると与ダメ+40%。', { hooks: { preHit(c) { if (G.enemies.aliveCount() <= 3) c.bonus += 0.4; } } });
  add('o_bloodlust', '血の渇望', '🧛', 'rare', 'defense', '出血中の敵へのダメージで与ダメの6%を回復。', { hooks: { onHit(c) { if (c.e.st && c.e.st.bleed > 0 && !c.proc) C.heal(c.dmg * 0.06); } } });
  add('o_meleeshock', '雷拳', '🤜', 'uncommon', 'offense', '近接攻撃が雷撃を伴い、周囲に連鎖する。', { hooks: { onHit(c) { if (c.src === 'melee') C.chain(c.e, 3, c.dmg * 0.5, 8, { src: 'buff', proc: true, elem: 'shock' }); } } });
  add('o_meleecd', '格闘術', '🥋', 'uncommon', 'offense', '近接攻撃の間隔-40%、近接ダメージ+40%。', { mods: { meleeDmg: 0.4, meleeCd: 0.4 } });
  add('o_grenadecd', '投擲の名手', '🎯', 'uncommon', 'offense', '投擲物の飛距離+35%、ダメージ+20%。', { mods: { grenadeDmg: 0.2, throwPow: 0.35 } });
  add('o_scavenger', '漁り屋', '🦝', 'common', 'economy', '敵が稀に回復の雫を落とすようになる（+8%）。', { mods: { healDrop: 0.08 }, max: 3 });
  add('o_magnetism', '黄金の引力', '🧲', 'common', 'economy', 'コインの取得範囲+4m、コイン+5%。', { mods: { pickupRange: 4, coinMul: 0.05 } });
  add('o_shieldpierce', '盾貫き', '🗡️', 'rare', 'offense', 'シールドを持つ敵にも、ダメージの25%が本体へ貫通する。', { flag: true });
  add('o_cripple', '足止め', '🦵', 'uncommon', 'offense', '脚（下半身）への命中で敵を4秒間30%鈍化。', { hooks: { onHit(c) { if (c.part === 'body' && c.lowHit && !c.proc) C.status(c.e, 'slow', 1); } } });
  add('o_executioner', '断頭台', '🪓', 'legendary', 'offense', 'ヘッドショット倍率+60%、ヘッドショットで撃破するとスキルのクールタイム-2秒。', { mods: { headMul: 0.6 }, hooks: { onKill(c) { if (c.head) C.cdReduce(2); } } });
  add('o_ammohoard', '弾薬庫', '🗃️', 'uncommon', 'offense', '装弾数+30%、20%で弾を消費しない。', { mods: { magSize: 0.3, ammoSave: 0.2 } });
  add('o_frenzyshot', '連射狂', '🔥', 'rare', 'offense', '撃ち続けると連射速度が徐々に上昇（最大+40%）。', { hooks: { tick(dt, n, s) { if (G.game.time - P.lastShotT < 0.3) s.v = Math.min(0.4, (s.v || 0) + dt * 0.15); else s.v = Math.max(0, (s.v || 0) - dt * 0.5); P.dynFireRate = s.v; } } });
  add('o_sharp', '鋭敏', '👃', 'common', 'offense', '敵のHPバーが遠くからでも見える。精鋭へのダメージ+10%。', { mods: { eliteDmg: 0.1 }, flag: true });
  add('o_thunderjump', '雷踏み', '⛈️', 'rare', 'mobility', '二段目以降のジャンプ時に足元へ雷撃。', { hooks: { onJump(c) { if (c.air) for (const e of C.inRadius(P.pos, 5)) C.damageEnemy(e, sc(30), { src: 'buff', proc: true, elem: 'shock' }); } } });
  add('o_grapplebomb', '鉤爆', '💣', 'rare', 'mobility', 'グラップルの着弾点で小爆発が起きる。', { hooks: { onGrapple(c) { C.explode(c.point, 3, sc(40), { src: 'buff', proc: true, small: true }); } } });

  // ---------- sturdier defence (plain, always-on survivability) ----------
  add('d_vital', '頑健', '🏋️', 'common', 'defense', '最大HP+20。', { mods: { maxHp: 20 }, max: 5 });
  add('d_bonecage', '骨の籠手', '🦴', 'common', 'defense', '最大HP+10、被ダメ-4%。', { mods: { maxHp: 10, armor: 0.04 }, max: 3 });
  add('d_healboost', '治癒の才', '🩹', 'common', 'defense', '回復量+30%。', { mods: { healMul: 0.3 }, max: 3 });
  add('d_plate', '板金鎧', '🛡️', 'uncommon', 'defense', '被ダメ-8%。', { mods: { armor: 0.08 }, max: 3 });
  add('d_bloodpact', '溢れる生命', '🫀', 'uncommon', 'defense', '最大HP+25%。', { mods: { maxHpPct: 0.25 }, max: 2 });
  add('d_light', '身軽', '🍃', 'uncommon', 'defense', '回避率+8%。', { mods: { dodge: 0.08 }, max: 3 });
  add('d_ward', '守りの護符', '🧿', 'uncommon', 'defense', 'エリア開始時と各WAVE開始時にオーバーシールド+35。', { hooks: { onAreaStart() { C.overshield(35, 35); }, onWave() { C.overshield(35, 35); } } });
  add('d_spring', '生命の泉', '⛲', 'uncommon', 'defense', '3秒間被弾しないと、毎秒最大HPの2.5%を回復する。', { hooks: { tick(dt) { if (G.game.time - P.lastHurtT > 3 && P.hp < P.stats.maxHp) C.heal(P.stats.maxHp * 0.025 * dt, true); } } });
  add('d_resolve', '不退転', '🪨', 'uncommon', 'defense', '被弾する度に5秒間、被ダメ-6%（最大5重）。', { hooks: { onDamaged(c, n, s) { s.v = Math.min(5, (s.v || 0) + 1); s.t = 5; }, preDamaged(c, n, s) { c.red += (s.v || 0) * 0.06; }, tick(dt, n, s) { if (s.t > 0) { s.t -= dt; if (s.t <= 0) s.v = 0; } } }, counter: (s) => (s.v || 0) + '重' });
  add('d_eliteguard', '精鋭殺しの鎧', '🎖️', 'uncommon', 'defense', '精鋭・覇者からの被ダメ-25%。', { hooks: { preDamaged(c) { if (c.attacker && (c.attacker.elite || c.attacker.champion)) c.red += 0.25; } } });
  add('d_stoneskin', '石肌', '🗿', 'rare', 'defense', '最大HPの20%を超える大きな一撃の被ダメ-40%。', { hooks: { preDamaged(c) { if (c.amount > P.stats.maxHp * 0.2) c.red += 0.4; } } });
  add('d_bulwark', '堅守の構え', '🏯', 'rare', 'defense', '立ち止まっている時かしゃがみ中、被ダメ-30%。', { hooks: { preDamaged(c) { if ((P.speedH || 0) < 1 || P.crouching) c.red += 0.3; } } });
  add('d_lifeline', '命綱', '🪢', 'rare', 'defense', 'HPが30%を下回ると即座に最大HPの35%を回復（40秒に1回）。', { hooks: { onDamaged(c, n, s) { if (P.hp > 0 && P.hp < P.stats.maxHp * 0.3 && G.game.time - (s.last ?? -99) > 40) { s.last = G.game.time; C.heal(P.stats.maxHp * 0.35); G.ui.toast('🪢 命綱が繋いだ！', 'good'); } } } });
  add('d_emergency', '緊急障壁', '🚨', 'rare', 'defense', '最大HPの25%以上の被弾を受けると、オーバーシールド+40（15秒に1回）。', { hooks: { onDamaged(c, n, s) { if (c.amount >= P.stats.maxHp * 0.25 && G.game.time - (s.last ?? -99) > 15) { s.last = G.game.time; C.overshield(40, 40); } } } });
  add('d_bossguard', '守護者の外套', '🧥', 'rare', 'defense', 'ボスからの被ダメ-25%。', { hooks: { preDamaged(c) { if (c.attacker && c.attacker.boss) c.red += 0.25; } } });
  add('d_aegis', 'イージス', '🔰', 'epic', 'defense', '12秒ごとに、次に受ける攻撃を1回完全に防ぐ。', { hooks: { tick(dt, n, s) { if (!s.ready) { s.t = (s.t ?? 0) + dt; if (s.t >= 12) { s.ready = true; s.t = 0; G.sfx.ui('select'); } } }, preDamaged(c, n, s) { if (s.ready) { s.ready = false; c.block = true; G.ui.toastSmall('🔰 イージスが防いだ'); G.fx.ring(P.pos.clone().setY(P.pos.y + 1), 1.4, 0x80c8ff, 0.3); G.sfx.shieldBreak && G.sfx.shieldBreak(P.chestPos()); } } }, counter: (s) => (s.ready ? '準備完了' : Math.ceil(12 - (s.t || 0)) + '秒') });
  add('d_titan', '巨人の心臓', '💓', 'epic', 'defense', '最大HP+80、被ダメ-6%。', { mods: { maxHp: 80, armor: 0.06 } });
  add('d_grit', '踏みとどまり', '💢', 'rare', 'defense', 'HP80%以上の時に致死ダメージを受けても、HP1で耐える（25秒に1回）。', { flag: true });
  add('d_undying', '不死身', '♾️', 'legendary', 'defense', '最大HP+60。HP50%以上の時に致死ダメージを受けても、HP1で耐える（10秒に1回）。', { mods: { maxHp: 60 }, flag: true });

  // ---------- melee (slot 3) ----------
  const isM = (c) => c.src === 'melee' && !c.proc;
  add('k_whet', '研ぎ師の業', '🪨', 'common', 'melee', '近接ダメージ+25%。', { mods: { meleeDmg: 0.25 }, max: 4 });
  add('k_haste', '疾風の太刀筋', '🌬️', 'uncommon', 'melee', '近接攻撃の間隔-18%。', { mods: { meleeCd: 0.18 }, max: 2 });
  add('k_reach', '長き腕', '🦾', 'uncommon', 'melee', '近接攻撃のリーチ+0.7m。', { mods: { meleeRange: 0.7 }, max: 2 });
  add('k_light', '軽装の心得', '🪶', 'common', 'melee', '近接武器を持っている間、移動速度+8%。', { mods: { meleeMove: 0.08 }, max: 2 });
  add('k_backstab', '背刺し', '🗡️', 'rare', 'melee', '背後からの近接攻撃は与ダメ+100%かつ必ず会心。', { hooks: { preHit(c) { if (isM(c) && c.backstab) { c.bonus += 1.0; c.forceCrit = true; } } } });
  add('k_bloodedge', '血吸いの刃', '🩸', 'rare', 'melee', '近接攻撃の与ダメの5%を回復する。', { hooks: { onHit(c) { if (isM(c)) C.heal(c.dmg * 0.05, true); } } });
  add('k_killrush', '殺陣', '🏃', 'uncommon', 'melee', '近接で倒すと3秒間、移動速度+25%・近接ダメージ+20%。', { hooks: { onKill(c) { if (c.src === 'melee') C.temp('k_killrush', 3, { moveSpeed: 0.25, meleeDmg: 0.2 }, '🏃'); } } });
  add('k_armorpierce', '鎧通し', '🔩', 'uncommon', 'melee', '近接攻撃のシールドへのダメージ+120%。', { hooks: { preHit(c) { if (isM(c)) c.shieldBonus += 1.2; } } });
  add('k_parry', '見切り', '🤺', 'epic', 'melee', '重撃の溜め中は被ダメ-70%。溜め中に被弾すると、その重撃のダメージ+80%。', { hooks: { preDamaged(c) { if (P.meleeMode && G.weapons.ms.ph === 'hwind') { c.red += 0.7; G.weapons.ms.parried = true; } }, preHit(c) { if (isM(c) && c.heavy && G.weapons.ms.parried) c.bonus += 0.8; } } });
  add('k_cleave', '旋風', '🌀', 'rare', 'melee', '重撃が全方位を薙ぎ払う（範囲+0.8m）。', { flag: true });
  add('k_wave', '剣圧', '〰️', 'epic', 'melee', '近接の通常攻撃が7m先まで届く斬撃波を放つ（与ダメ45%・貫通）。', { flag: true });
  add('k_execute', '介錯', '⚰️', 'rare', 'melee', 'HP30%以下の敵への近接ダメージ+70%。', { hooks: { preHit(c) { if (isM(c) && c.e.hp < c.e.maxHp * 0.3) c.bonus += 0.7; } } });
  add('k_momentum', '突進の勢い', '💨', 'uncommon', 'melee', '移動速度に応じて近接ダメージが最大+45%（スライディング中は最大）。', { hooks: { preHit(c) { if (isM(c)) c.bonus += Math.min(0.45, (P.speedH || 0) / 12 * 0.45); } } });
  add('k_air', '空中斬り', '🦅', 'rare', 'melee', '空中での近接ダメージ+50%。空中で当てると少し浮き上がる。', { hooks: { preHit(c) { if (isM(c) && !P.grounded) c.bonus += 0.5; }, onHit(c) { if (isM(c) && !P.grounded && P.vel.y < 4) P.vel.y = 4; } } });
  add('k_fury', '闘志', '🔥', 'rare', 'melee', '近接を当てる度に近接ダメージ+5%（最大10重・3秒当てないと消える）。', { hooks: { onHit(c, n, s) { if (isM(c)) { s.v = Math.min(10, (s.v || 0) + 1); s.t = 3; } }, preHit(c, n, s) { if (isM(c)) c.bonus += (s.v || 0) * 0.05; }, tick(dt, n, s) { if (s.t > 0) { s.t -= dt; if (s.t <= 0) s.v = 0; } } }, counter: (s) => (s.v || 0) + '重' });
  add('k_guard', '構え', '🛡️', 'uncommon', 'melee', '近接武器を持っている間、被ダメ-15%。', { hooks: { preDamaged(c) { if (P.meleeMode) c.red += 0.15; } } });
  add('k_quickdraw', '抜刀術', '⚡', 'uncommon', 'melee', '近接武器に持ち替えて2秒以内の最初の一撃が与ダメ+100%。持ち替えが一瞬になる。', { flag: true, hooks: { preHit(c) { if (isM(c) && G.game.time - (G.weapons.meleeDrawT || -9) < 2 && !G.weapons.quickUsed) { c.bonus += 1.0; G.weapons.quickUsed = true; } } } });
  add('k_laceration', '裂傷', '🩹', 'common', 'melee', '近接攻撃が50%で出血を付与する。', { hooks: { onHit(c) { if (isM(c) && Math.random() < 0.5) C.status(c.e, 'bleed', 1); } } });
  add('k_quake', '大地の怒り', '🌋', 'epic', 'melee', '重撃が必ず周囲3.5mに衝撃波（与ダメ45%・スタン）を起こす。', { flag: true });
  add('k_vigor', '闘気', '💪', 'uncommon', 'melee', '近接で倒すとHP+6回復。', { hooks: { onKill(c) { if (c.src === 'melee') C.heal(6); } }, max: 2 });
  add('k_throw', '投げ短剣', '🔪', 'rare', 'melee', '近接の通常攻撃3回毎に、狙った先へ短剣を投げる（貫通・出血）。', { flag: true });
  add('k_master', '剣聖', '⚔️', 'legendary', 'melee', '近接ダメージ+60%・近接攻撃の間隔-20%・重撃の隙-40%。', { mods: { meleeDmg: 0.6, meleeCd: 0.2, meleeRecover: 0.4 } });

  // ---------- abyssal pacts (offered after every boss from area 25: a lasting hardship + a lasting reward) ----------
  const pact = (id, name, icon, desc, def) => add(id, name, icon, 'epic', 'pact', desc, Object.assign({ pact: true }, def));
  pact('pact_horde', '群れの誓い', '👥', '【代償】各WAVEの敵+1（エリア上限10体）\n【報酬】コイン獲得量+20%', { mods: { coinMul: 0.2 } });
  pact('pact_elite', '精鋭の誓い', '👑', '【代償】精鋭の出現率+15%\n【報酬】幸運+0.4（高レアが出やすい）', { mods: { luck: 0.4 } });
  pact('pact_mutate', '変異の誓い', '🧬', '【代償】敵が変異する確率+25%\n【報酬】与ダメ+12%', { mods: { dmg: 0.12 } });
  pact('pact_anomaly', '異変の誓い', '🌀', '【代償】戦闘エリアで必ず異変が起きる\n【報酬】加護の選択肢+1', { mods: { buffChoices: 1 } });
  pact('pact_thirst', '渇きの誓い', '🏜️', '【代償】回復量-25%\n【報酬】会心率+8%', { mods: { healMul: -0.25, critChance: 0.08 } });
  pact('pact_swift', '疾き獣の誓い', '🐆', '【代償】敵の移動速度+12%\n【報酬】移動速度+8%', { mods: { enemySpeed: 0.12, moveSpeed: 0.08 } });
  pact('pact_fang', '鋭き牙の誓い', '🦷', '【代償】敵の投射物の速度+25%\n【報酬】リロード速度+20%', { mods: { reloadSpeed: 0.2 } });
  pact('pact_merciless', '無慈悲の誓い', '💀', '【代償】深層の敵は全て変異し、変異数+1\n【報酬】魂の灯火+1（即時）', {});
  pact('pact_night', '常夜の誓い', '🌑', '【代償】戦闘エリアは常に暗黒\n【報酬】ヘッドショット倍率+40%', { mods: { headMul: 0.4 } });
  pact('pact_hunted', '狩られる誓い', '👁️', '【代償】戦闘エリアで必ず追跡者が現れる\n【報酬】コイン獲得量+25%', { mods: { coinMul: 0.25 } });
  pact('pact_glass', '硝子の誓い', '🥂', '【代償】最大HP-20%\n【報酬】与ダメ+25%', { mods: { maxHpPct: -0.2, dmg: 0.25 } });
  pact('pact_fury', '激昂の誓い', '😤', '【代償】敵の攻撃間隔-20%\n【報酬】連射速度+12%', { mods: { fireRate: 0.12 } });

  // ---------- relics: expensive passive artefacts sold in shops (max 3) ----------
  const relic = (id, name, icon, price, desc, def) => add(id, name, icon, 'legendary', 'relic', desc, Object.assign({ relic: true, price }, def));
  relic('r_hourglass', '時の砂時計', '⌛', 6000, 'グラップルで張り付いている間、周囲の時間が40%遅くなる。', { hooks: { tick() { if (P.grapple && P.grapple.state === 'attached') { G.game.chronoT = Math.max(G.game.chronoT || 0, 0.12); G.game.chronoSlow = 0.4; } } } });
  relic('r_thunder', '雷槌の欠片', '🌩️', 5000, 'パイルドライバー着地時、周囲18mの敵6体に落雷（パイルドライバーの威力の60%）。', { hooks: { onPile(c) { const es = G.enemies.inRadius(c.pos, 18).filter((e) => !e.ally).slice(0, 6); for (const e of es) { const p = e.centerPos(); G.fx.lightning(p.clone().add(V(0, 14, 0)), p, 0xd0e0ff); C.damageEnemy(e, c.dmg * 0.6, { src: 'skill', proc: true, elem: 'shock', pos: p }); } if (es.length) G.sfx.zap(c.pos); } } });
  relic('r_crown', '亡者の王冠', '👑', 4500, '敵を倒すと25%でHP+4%回復し、スキルのクールタイムが1秒縮む。', { hooks: { onKill() { if (Math.random() < 0.25) { C.heal(P.stats.maxHp * 0.04, true); C.cdReduce(1); } } } });
  relic('r_mirror', '鏡の盾', '🪞', 4000, '被ダメ-10%。受けたダメージの60%を攻撃者へ跳ね返す。', { mods: { armor: 0.1 }, hooks: { onDamaged(c) { if (c.attacker && c.attacker.alive && !c.attacker.boss) C.damageEnemy(c.attacker, c.raw * 0.6, { src: 'buff', proc: true }); } } });
  relic('r_chalice', '血盟の杯', '🍷', 4500, 'HP50%以下の間、与ダメ+40%・与ダメの3%を回復。', { hooks: { preHit(c) { if (P.hp < P.stats.maxHp * 0.5) c.bonus += 0.4; }, onHit(c) { if (P.hp < P.stats.maxHp * 0.5 && !c.proc) C.heal(c.dmg * 0.03, true); } } });
  relic('r_compass', '異変の羅針盤', '🧭', 3500, '異変の起きているエリアでは与ダメ+20%。異変エリアのクリア時にコイン+（300＋エリア×25）。', { hooks: { preHit(c) { if (G.Depth.cur && G.Depth.cur.list.length) c.bonus += 0.2; }, onAreaClear() { if (G.Depth.cur && G.Depth.cur.list.length) C.coins(300 + G.game.area * 25, null, '羅針盤'); } } });
  relic('r_gravity', '重力核', '🕳️', 5500, 'パイルドライバーが落下中に周囲の敵を吸い寄せ、ダメージ+50%。', { mods: { pileVacuum: 1, pileDmg: 0.5 } });
  relic('r_engine', '永久機関', '⚙️', 6500, 'スキルのクールタイム-20%、グラップルのクールタイム-25%。', { mods: { cdr: 0.2, grappleCd: 0.25 } });

  // ---------- hoarding: boons that reward keeping coins ----------
  const coins = () => G.game.run.coins;
  add('e_greed', '強欲の王冠', '💰', 'rare', 'economy', '所持コイン1,000枚ごとに与ダメ+2%（最大+80%）。', { hooks: { preHit(c) { c.bonus += Math.min(0.8, coins() / 1000 * 0.02); } } });
  add('e_coinshield', '金貨の盾', '🪙', 'rare', 'economy', '被弾時、ダメージの半分をコインで肩代わりする（1ダメージにつき4枚。足りなければ通常通り）。', { hooks: { preDamaged(c) { const pay = Math.ceil(c.amount * 0.5 * 4); if (coins() >= pay && c.amount > 0) { G.game.run.coins -= pay; c.red += 0.5; } } } });
  add('e_vaultkeeper', '金庫番', '🗝️', 'uncommon', 'economy', 'エリアクリア時、所持コイン5,000枚ごとに装飾された宝箱が1つ現れる（最大3つ）。', { hooks: { onAreaClear() { const k = Math.min(3, Math.floor(coins() / 5000)); for (let i = 0; i < k; i++) setTimeout(() => G.game.spawnChestNear(1), 400 + i * 300); } } });
  add('e_midas', '成金の一撃', '💸', 'uncommon', 'economy', '会心時にコイン10枚を消費して、追加でダメージの60%を与える。', { hooks: { onHit(c) { if (c.crit && !c.proc && coins() >= 10) { G.game.run.coins -= 10; C.damageEnemy(c.e, c.dmg * 0.6, { src: 'buff', proc: true, noMarker: true }); } } } });
  add('e_miser', '守銭奴の執念', '🧳', 'epic', 'economy', '所持コインが5,000枚以上あれば、死亡時に半分を支払ってHP全快で復活する（エリアごとに1回）。', { flag: true });
  add('e_goldweight', '黄金の重み', '🏋️', 'rare', 'economy', '所持コイン150枚ごとに最大HP+1（最大+200）。ただし重さで移動速度が少し落ちる（最大-15%）。', { hooks: { tick(dt, n, s) { s.t = (s.t || 0) - dt; if (s.t > 0) return; s.t = 0.5; const b = Math.min(200, Math.floor(coins() / 150)); if (b !== s.b) { s.b = b; C.temp('e_goldweight', 99999, { maxHp: b, moveSpeed: -Math.min(0.15, b / 1330) }, '🏋️'); } } } });

  // ---------- pile driver upgrades (innate ability that grows with you) ----------
  const PT = [['I', 'common'], ['II', 'uncommon'], ['III', 'rare']];
  [0.3, 0.5, 0.8].forEach((v, i) => add('p_dmg' + (i + 1), '重撃の拳 ' + PT[i][0], '🔨', PT[i][1], 'pile', `パイルドライバーのダメージ+${Math.round(v * 100)}%`, { mods: { pileDmg: v }, max: 4 }));
  [0.2, 0.3, 0.45].forEach((v, i) => add('p_rad' + (i + 1), '衝撃波拡大 ' + PT[i][0], '🌊', PT[i][1], 'pile', `パイルドライバーの範囲+${Math.round(v * 100)}%`, { mods: { pileRadius: v }, max: 4 }));
  [0.15, 0.25].forEach((v, i) => add('p_cd' + (i + 1), '連撃の構え ' + PT[i][0], '⏳', PT[i + 1][1], 'pile', `パイルドライバーのクールタイム-${Math.round(v * 100)}%`, { mods: { pileCd: v }, max: 3 }));
  add('p_fast', '早詠唱', '⚡', 'uncommon', 'pile', 'パイルドライバーの詠唱時間-60%、落下速度+30%。', { mods: { pileFast: 1 } });
  add('p_fire', '灼熱の着弾', '🔥', 'rare', 'pile', '着弾点に5秒間燃える炎の亀裂を残す。', { mods: { pileFire: 1 } });
  add('p_shock', '雷撃の着弾', '⚡', 'rare', 'pile', '着弾時、範囲外の敵4体へ雷撃が連鎖する。', { mods: { pileShock: 1 } });
  add('p_frost', '氷結の着弾', '❄️', 'rare', 'pile', '着弾範囲の敵を凍結させる。', { mods: { pileFrost: 1 } });
  add('p_stun', '大地割り', '💫', 'uncommon', 'pile', '着弾範囲の敵を1.5秒スタンさせる。', { mods: { pileStun: 1 } });
  add('p_vacuum', '吸引落下', '🌀', 'epic', 'pile', '落下中、周囲の敵を着弾点へ吸い寄せる。', { mods: { pileVacuum: 1 } });
  add('p_bounce', '跳ね返り', '🦘', 'epic', 'pile', '着弾後に大きく跳ね上がり、クールタイムなしでもう一度パイルドライバーを放てる。', { mods: { pileBounce: 1 } });
  add('p_shield', '鉄壁着地', '🛡️', 'uncommon', 'pile', '着弾時にオーバーシールド+30（最大90）。', { mods: { pileShield: 1 }, max: 2 });
  add('p_heal', '生命の衝撃', '💚', 'uncommon', 'pile', '着弾で命中した敵1体につきHP+4。', { mods: { pileHeal: 1 }, max: 2 });
  add('p_height', '高度の暴力', '🏔️', 'rare', 'pile', '高い所から落ちるほどのダメージボーナスが2倍になる。', { mods: { pileHeight: 1 } });
  add('p_shatter', '盾砕きの鉄槌', '💠', 'rare', 'pile', 'パイルドライバーのシールドへのダメージ×3（通常×2）。', { mods: { pileShieldMul: 1 } });
  add('p_meteor', '隕星の化身', '☄️', 'legendary', 'pile', '着弾時に追加で大爆発（範囲1.5倍）を起こし、パイルドライバーのダメージ+50%。', { mods: { pileMeteor: 1, pileDmg: 0.5 } });

  // ---------- curses (negative effects from events; never offered as boons) ----------
  const curse = (id, name, icon, desc, def) => add(id, name, icon, 'cursed', 'curse', desc, Object.assign({ curse: true }, def));
  curse('c_frail', '脆き骨', '🦴', '最大HP-15%。', { mods: { maxHpPct: -0.15 }, max: 3 });
  curse('c_sluggish', '鈍重', '🐌', '移動速度-10%。', { mods: { moveSpeed: -0.1 }, max: 3 });
  curse('c_rust', '錆びた弾倉', '🧱', '装弾数-20%。', { mods: { magSize: -0.2 }, max: 3 });
  curse('c_unlucky', '不運', '🐈‍⬛', '高レアリティが出にくくなる。', { mods: { luck: -0.5 }, max: 3 });
  curse('c_hunted', '狩られる者', '🩸', '敵の攻撃力+15%。', { mods: { enemyDmg: 0.15 }, max: 3 });
  curse('c_shaky', '震える手', '🤲', '弾の拡散+30%。', { mods: { spread: 0.3 }, max: 3 });
  curse('c_thirst', '渇き', '🏜️', '回復量-35%。', { mods: { healMul: -0.35 }, max: 2 });
  curse('c_waste', '浪費', '🕳️', 'コイン獲得量-25%。', { mods: { coinMul: -0.25 }, max: 3 });
  curse('c_horde', '招かれざる客', '👥', '戦闘エリアの敵の数+25%。', { mods: { extraEnemies: 0.25 }, max: 3 });
  curse('c_clumsy', '不器用', '🫳', 'リロード速度-25%。', { mods: { reloadSpeed: -0.25 }, max: 3 });
  curse('c_brittle', '脆い鎧', '🥚', '被ダメ+10%。', { mods: { armor: -0.1 }, max: 3 });
  curse('c_debt', '血の負債', '💉', 'HPが40%以上の間、毎秒HPを1失う。', { hooks: { tick(dt) { if (P.hp > P.stats.maxHp * 0.4) P.hp -= dt; } } });
  curse('c_dull', '鈍い魔力', '🌫️', 'スキルのクールタイム+20%。', { mods: { cdr: -0.2 }, max: 3 });
  curse('c_tax', '重税', '💸', 'ショップの価格+20%。', { mods: { shopDiscount: -0.2 }, max: 3 });
  curse('c_heavy', '重い鎖', '⛓️', 'グラップルのクールタイム+40%。', { mods: { grappleCd: -0.4 }, max: 2 });

  // ---------- 技 augments: skills and ultimates get as many ways to grow as the pile driver ----------
  // (the pile driver is a skill too: skill damage, skill CD and the on-hit augments below apply to it)
  [0.1, 0.16, 0.24].forEach((v, i) => add('sa_dmg' + (i + 1), '術式強化 ' + PT[i][0], '🔮', PT[i][1], 'skill', `スキルのダメージ+${Math.round(v * 100)}%`, { mods: { skillDmg: v }, max: 4 }));
  [0.06, 0.1].forEach((v, i) => add('sa_cd' + (i + 1), '高速詠唱 ' + PT[i][0], '⏳', PT[i + 1][1], 'skill', `スキルのクールタイム-${Math.round(v * 100)}%`, { mods: { skillCd: v }, max: 2 }));
  add('sa_area', '術式拡張', '⭕', 'uncommon', 'skill', '全スキルの範囲・射程+12%。', { mods: { skillRad: 0.12 }, max: 2 });
  add('sa_dur', '持続詠唱', '⌛', 'uncommon', 'skill', '全スキルの効果時間+15%。', { mods: { skillDur: 0.15 }, max: 2 });
  add('sa_charge', '多重充填', '🔋', 'rare', 'skill', 'チャージ式スキルのチャージ数+1。', { mods: { skillCharges: 1 }, max: 2 });
  add('sa_fire', '灼熱の術式', '🔥', 'rare', 'skill', 'スキル・アルティメットの命中時、20%で炎上させる。', { mods: { techBurn: 0.6 }, max: 2 });
  add('sa_frost', '凍結の術式', '❄️', 'rare', 'skill', 'スキル・アルティメットの命中時、20%で冷気を付与する。', { mods: { techFrost: 0.6 }, max: 2 });
  add('sa_shock', '雷鳴の術式', '⚡', 'rare', 'skill', 'スキル・アルティメットの命中時、15%で近くの2体へ雷撃が連鎖する。', { mods: { techShock: 0.6 }, max: 2 });
  add('sa_stun', '衝撃の術式', '💫', 'uncommon', 'skill', 'スキル・アルティメットの命中時、15%で0.6秒スタン（ボス無効）。', { mods: { techStun: 1 } });
  add('sa_vamp', '吸命の術式', '🩸', 'rare', 'skill', 'スキル・アルティメットの与ダメの2%を回復。', { mods: { techVamp: 0.5 }, max: 3 });
  add('sa_shield', '術式障壁', '🛡️', 'uncommon', 'skill', 'スキルを使う度に、6秒間だけ持続するシールド+12（最大120）。', { mods: { techShield: 0.6 }, max: 2 });
  [0.12, 0.2, 0.3].forEach((v, i) => add('ua_dmg' + (i + 1), '終の一撃 ' + PT[i][0], '🌟', PT[i][1], 'ult', `アルティメットのダメージ+${Math.round(v * 100)}%`, { mods: { ultDmg: v }, max: 3 }));
  [0.06, 0.1].forEach((v, i) => add('ua_cd' + (i + 1), '覚醒の刻 ' + PT[i][0], '⏳', PT[i + 1][1], 'ult', `アルティメットのクールタイム-${Math.round(v * 100)}%`, { mods: { ultCd: v }, max: 2 }));
  add('ua_dur', '永き奇跡', '⌛', 'rare', 'ult', 'アルティメットの効果時間+15%。', { mods: { ultDur: 0.15 }, max: 2 });
  add('ua_charge', '魂の充填', '💠', 'rare', 'ult', '敵を倒す度にアルティメットのクールタイム-1秒。', { max: 3, hooks: { onKill(c, n) { C.ultReduce(1 * n); } } });
  add('ua_heal', '再起の光', '💚', 'uncommon', 'ult', 'アルティメット使用時、最大HPの12%を回復。', { mods: { ultHeal: 0.5 }, max: 2 });
  add('ua_shield', '守護の光輪', '🛡️', 'uncommon', 'ult', 'アルティメット使用時、10秒間だけ持続するシールド+40。', { mods: { ultShield: 0.5 }, max: 2 });
  add('ua_over', '覚醒', '⚡', 'rare', 'ult', 'アルティメット使用後8秒間、与ダメ+15%・連射速度+10%。', { mods: { ultOver: 1 } });
  add('ua_echo', '奇跡の残響', '🔁', 'epic', 'ult', 'アルティメット使用時、20%でクールタイムが半分になる。', { mods: { ultEcho: 1 } });
  add('ua_tech', '奥義連携', '🔗', 'epic', 'ult', 'アルティメット使用時、全スキルのクールタイムをリセット。', { mods: { ultTech: 1 } });
  add('ua_quick', '先手必勝', '🏁', 'uncommon', 'ult', 'エリア開始時、アルティメットのクールタイム-30秒。', { max: 2, hooks: { onAreaStart(c, n) { C.ultReduce(30 * n); } } });
  G.isTech = (b) => b.cat === 'pile' || b.cat === 'skill' || b.cat === 'ult';
  G.BUFFS = BUFFS;
  G.BUFF_BY_ID = Object.fromEntries(BUFFS.map((b) => [b.id, b]));
})();
