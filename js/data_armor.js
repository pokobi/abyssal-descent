'use strict';
// Armour (5 slots x 5 materials x 5 rarities = 125 pieces) and valuables (sell-only loot).
(function () {
  // ---------------- armour ----------------
  // defence is its own number (damage x 100 / (100 + defence)), separate from the "被ダメ軽減" percentage.
  // heavier materials protect more but weigh more; weight slows you down (cloth weighs nothing).
  G.ARMOR_SLOTS = [
    { id: 'head', name: '頭', icon: '🪖', def: 6, w: 0.8, size: [2, 2] },
    { id: 'chest', name: '胴', icon: '🦺', def: 10, w: 1.4, size: [2, 3] },
    { id: 'legs', name: '脚', icon: '👖', def: 7, w: 1.1, size: [2, 3] },
    { id: 'hands', name: '手', icon: '🧤', def: 3, w: 0.4, size: [2, 2] },
    { id: 'feet', name: '足', icon: '🥾', def: 4, w: 0.6, size: [2, 2] },
  ];
  G.ARMOR_SLOT_BY_ID = Object.fromEntries(G.ARMOR_SLOTS.map((s) => [s.id, s]));
  G.ARMOR_MATS = [
    { id: 'cloth', name: '布', def: 0.5, w: 0, col: '#b8a888' },
    { id: 'leather', name: '革', def: 0.8, w: 0.35, col: '#8a5a32' },
    { id: 'scale', name: '鱗', def: 1.05, w: 0.7, col: '#5e8a6a' },
    { id: 'chain', name: '鎖', def: 1.3, w: 1.0, col: '#9aa4ae' },
    { id: 'plate', name: '板金', def: 1.65, w: 1.5, col: '#c8ccd2' },
  ];
  G.ARMOR_MAT_BY_ID = Object.fromEntries(G.ARMOR_MATS.map((m) => [m.id, m]));
  // the material shows at a glance: the piece sits on a disc of the material's colour with a small tag (布 革 鱗 鎖 板)
  const MAT_TAG = { cloth: '布', leather: '革', scale: '鱗', chain: '鎖', plate: '板' };
  G.armorIcon = (d) => { const m = d && G.ARMOR_MAT_BY_ID[d.mat]; return m ? `<span class="amat mat-${m.id}" style="--mc:${m.col}"><span>${d.icon}</span><i>${MAT_TAG[m.id]}</i></span>` : (d ? d.icon : ''); };
  const RMUL = { common: 1, uncommon: 1.3, rare: 1.65, epic: 2.05, legendary: 2.5 };
  const RPRICE = { common: 120, uncommon: 220, rare: 420, epic: 800, legendary: 1500 };
  const NOUN = {
    head: { cloth: '布の頭巾', leather: '革の帽子', scale: '鱗の兜', chain: '鎖の頭巾', plate: '鋼の大兜' },
    chest: { cloth: '布の外套', leather: '革の鎧', scale: '鱗の鎧', chain: '鎖帷子', plate: '鋼の胸甲' },
    legs: { cloth: '布の脚衣', leather: '革の脚衣', scale: '鱗の脚甲', chain: '鎖の脚衣', plate: '鋼の腿甲' },
    hands: { cloth: '布の手袋', leather: '革の手袋', scale: '鱗の籠手', chain: '鎖の手甲', plate: '鋼の籠手' },
    feet: { cloth: '布の靴', leather: '革の長靴', scale: '鱗の靴', chain: '鎖の脚絆', plate: '鋼の具足' },
  };
  const PREFIX = { common: '粗末な', uncommon: '丈夫な', rare: '精巧な', epic: '名工の' };
  const LEGEND = {
    head: { cloth: '月詠みの頭巾', leather: '狩人王の革帽', scale: '黒竜の鱗兜', chain: '聖堂騎士の鎖頭巾', plate: '不落城主の大兜' },
    chest: { cloth: '星織りの外套', leather: '夜駆けの革鎧', scale: '竜血の鱗鎧', chain: '殉教者の鎖帷子', plate: '巨人殺しの胸甲' },
    legs: { cloth: '霧渡りの脚衣', leather: '影走りの脚衣', scale: '大蛇の脚甲', chain: '守護者の鎖の脚衣', plate: '城壁の腿甲' },
    hands: { cloth: '錬金術師の手袋', leather: '盗賊王の革手袋', scale: '竜爪の籠手', chain: '処刑人の手甲', plate: '鍛冶神の籠手' },
    feet: { cloth: '風歩きの布靴', leather: '韋駄天の長靴', scale: '水蛇の靴', chain: '巡礼者の脚絆', plate: '踏破者の鉄靴' },
  };
  // fixed (non-random) effects on high-rarity pieces, listed in the codex.
  // head / chest / legs: toughness, legs / feet: movement, hands: weapons and handling
  const FX = {
    toughA: { desc: '状態異常の時間-20%', mods: { statusRes: 0.2 } },
    toughB: { desc: '炎上・毒のダメージ-30%', mods: { dotRes: 0.3 } },
    toughC: { desc: '爆発・範囲攻撃の被ダメ-20%', mods: { blastRes: 0.2 } },
    toughD: { desc: '最大HP+25', mods: { maxHp: 25 } },
    toughE: { desc: '毎秒HP+0.6回復', mods: { hpRegen: 0.6 } },
    moveA: { desc: 'スプリント開始から1秒ごとに移動速度+5%（最大+15%）', mods: { sprintRamp: 0.05 } },
    moveB: { desc: 'ジャンプ力+15%', mods: { jumpPower: 0.15 } },
    moveC: { desc: 'スライディングの加速+25%', mods: { slideBoost: 0.25 } },
    moveD: { desc: '空中での制御+40%', mods: { airControl: 0.4 } },
    handA: { desc: '操作速度+20%', mods: { opSpeed: 0.2 } },
    handB: { desc: '近接武器の攻撃速度+20%', mods: { meleeCd: 0.2 } },
    handC: { desc: 'リロード速度+12%', mods: { reloadSpeed: 0.12 } },
    handD: { desc: '反動-15%', mods: { recoil: -0.15 } },
  };
  const FX_FOR = {
    head: { epic: 'toughA', legendary: ['toughA', 'toughC'] },
    chest: { epic: 'toughD', legendary: ['toughD', 'toughB'] },
    legs: { epic: 'moveB', legendary: ['toughE', 'moveA'] },
    hands: { epic: 'handC', legendary: ['handA', 'handB'] },
    feet: { epic: 'moveC', legendary: ['moveA', 'moveD'] },
  };
  // the leather / cloth epics of the hands and feet lean towards handling and speed
  const FX_ALT = { hands: { cloth: { epic: 'handA' }, leather: { epic: 'handD' } }, feet: { cloth: { epic: 'moveD' }, leather: { epic: 'moveA' } } };
  G.ARMOR = [];
  for (const S of G.ARMOR_SLOTS) for (const M of G.ARMOR_MATS) for (const r of G.RARITY_ORDER) {
    const name = r === 'legendary' ? LEGEND[S.id][M.id] : PREFIX[r] + NOUN[S.id][M.id];
    let fx = (FX_ALT[S.id] && FX_ALT[S.id][M.id] && FX_ALT[S.id][M.id][r]) || FX_FOR[S.id][r] || null;
    if (fx && !Array.isArray(fx)) fx = [fx];
    const def = Math.max(1, Math.round(S.def * M.def * RMUL[r]));
    const weight = Math.round(S.w * M.w * 100) / 100;
    const fixed = (fx || []).map((k) => FX[k]);
    G.ARMOR.push({
      id: `ar_${S.id}_${M.id}_${r}`, kind: 'armor', slot: S.id, mat: M.id, rarity: r, name, icon: S.icon, def, weight, fixed,
      price: Math.round(RPRICE[r] * (0.7 + M.def * 0.5) * (S.id === 'chest' ? 1.3 : S.id === 'hands' ? 0.75 : 1) / 10) * 10,
      desc: `${S.name}防具（${M.name}）・防御力${def}${weight ? `・重さ${weight}` : '・重さなし'}${fixed.length ? '。' + fixed.map((f) => f.desc).join('、') : ''}`,
      size: S.size,
    });
  }
  G.ARMOR_BY_ID = Object.fromEntries(G.ARMOR.map((a) => [a.id, a]));
  // random enchantments: none below rare; kind and value fully random (0.1 steps). No duplicates on one piece.
  G.ENCHANTS = [
    { id: 'dmg', name: '与ダメ', min: 1, max: 10, stat: 'dmg' },
    { id: 'red', name: '被ダメ軽減', min: 1, max: 10, stat: 'armor' },
    { id: 'heal', name: '回復力', min: 1, max: 10, stat: 'healMul' },
    { id: 'crit', name: '会心率', min: 0.5, max: 5, stat: 'critChance' },
    { id: 'critd', name: '会心ダメ', min: 1, max: 10, stat: 'critMul' },
    { id: 'move', name: '移動速度', min: 1, max: 10, stat: 'moveSpeed' },
    { id: 'op', name: '操作速度', min: 1, max: 10, stat: 'opSpeed' },
  ];
  G.ENCHANT_BY_ID = Object.fromEntries(G.ENCHANTS.map((e) => [e.id, e]));
  const ENCH_COUNT = { common: [[0, 100]], uncommon: [[0, 100]], rare: [[0, 90], [1, 10]], epic: [[0, 20], [1, 70], [2, 10]], legendary: [[1, 20], [2, 70], [3, 10]] };
  G.rollEnchants = function (rarity, rnd) {
    rnd = rnd || Math.random;
    const t = ENCH_COUNT[rarity] || ENCH_COUNT.common;
    let x = rnd() * 100, n = 0;
    for (const [k, w] of t) { if (x < w) { n = k; break; } x -= w; }
    const pool = G.ENCHANTS.slice(), out = [];
    for (let i = 0; i < n && pool.length; i++) {
      const e = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const steps = Math.round((e.max - e.min) * 10); // every 0.1 step from min to max is equally likely
      out.push({ id: e.id, v: Math.round((e.min + Math.floor(rnd() * (steps + 1)) / 10) * 10) / 10 });
    }
    return out;
  };
  G.enchantText = (e) => `${G.ENCHANT_BY_ID[e.id].name}+${e.v}%`;

  // ---------------- valuables (no effect: worth coins at a merchant) ----------------
  // [id, name, icon, rarity, value, w, h, desc]
  const VL = [
    ['v_coinold', '古びた金貨', '🪙', 'common', 35, 1, 1, '刻印の擦り切れた古代の金貨。'],
    ['v_ring', '銀の指輪', '💍', 'common', 55, 1, 1, '名も知れぬ誰かの指から外れた銀の指輪。'],
    ['v_beads', '祈りの数珠', '📿', 'common', 45, 1, 1, '黒ずんだ木の数珠。'],
    ['v_bone', '骨細工の賽子', '🎲', 'common', 40, 1, 1, '墓守たちの手慰み。'],
    ['v_shard', '黒曜石の欠片', '🔷', 'uncommon', 90, 1, 1, '鏡のように磨かれた火山硝子。'],
    ['v_amulet', '琥珀の護符', '🧿', 'uncommon', 120, 1, 1, '虫を閉じ込めた琥珀のお守り。'],
    ['v_candle', '銀の燭台', '🕯️', 'uncommon', 150, 1, 2, '礼拝堂から持ち出された燭台。'],
    ['v_dagger', '儀礼の短剣', '🗡️', 'uncommon', 170, 2, 1, '刃の潰された祭具の短剣。'],
    ['v_ruby', '血紅玉', '❤️‍🔥', 'rare', 320, 1, 1, '血のように赤い宝石。'],
    ['v_sapph', '深淵の蒼玉', '💎', 'rare', 360, 1, 1, '光を吸い込む蒼い宝石。'],
    ['v_neck', '金の首飾り', '📿', 'rare', 300, 2, 1, '貴人の墓に納められていた首飾り。'],
    ['v_scepter', '錆びた王笏', '🪄', 'rare', 380, 1, 3, 'かつての王の権威の名残。'],
    ['v_idol', '黒檀の小像', '🗿', 'rare', 340, 1, 2, '名も無き神を象った小さな像。'],
    ['v_chalice', '黄金の聖杯', '🏆', 'epic', 780, 2, 2, '聖別された黄金の杯。ずしりと重い。'],
    ['v_skull', '聖者の頭骨', '💀', 'epic', 700, 2, 2, '金箔で装飾された聖遺物。'],
    ['v_casket', '宝石箱', '🧰', 'epic', 860, 2, 2, '宝石が詰まった小箱。'],
    ['v_crown', '堕ちた王冠', '👑', 'legendary', 1600, 2, 2, '深淵に呑まれた王の冠。'],
    ['v_icon', '古の聖像画', '🖼️', 'legendary', 1800, 2, 3, '失われた聖堂の祭壇画。'],
  ];
  G.VALUABLES = VL.map(([id, name, icon, rarity, value, w, h, desc]) => ({ id, kind: 'valuable', name, icon, rarity, value, price: value, size: [w, h], desc }));
  G.VALUABLE_BY_ID = Object.fromEntries(G.VALUABLES.map((v) => [v.id, v]));
})();
