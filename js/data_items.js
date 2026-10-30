'use strict';
// Consumable items (grenades / heals / utilities) and active skills.
(function () {
  // ---------- items ----------
  // [id, cat, name, icon, rarity, price, desc, data]
  const IT = [
    // grenades (G to throw, T to cycle)
    ['g_frag', 'grenade', '破片手榴弾', '💣', 'common', 90, '半径5mに爆発ダメージ。', { dmg: 120, r: 5, fuse: 1.6 }],
    ['g_frag2', 'grenade', '高性能破片手榴弾', '🧨', 'uncommon', 150, '半径6mに強力な爆発ダメージ。', { dmg: 210, r: 6, fuse: 1.5 }],
    ['g_fire', 'grenade', '焼夷手榴弾', '🔥', 'uncommon', 130, '着弾地点を6秒間炎上させる。', { dmg: 60, r: 4.5, fuse: 1.2, zone: 'fire', dur: 6 }],
    ['g_cryo', 'grenade', '冷凍手榴弾', '❄️', 'uncommon', 130, '半径5mの敵を凍結させる。', { dmg: 50, r: 5, fuse: 1.4, elem: 'frost', stacks: 6 }],
    ['g_emp', 'grenade', 'EMPグレネード', '📡', 'rare', 170, 'シールドに極大ダメージ（×12）を与え、シールド持ちをスタンさせる。', { dmg: 45, r: 7, fuse: 1.3, shieldMul: 12, emp: true }],
    ['g_shock', 'grenade', '電撃手榴弾', '⚡', 'uncommon', 130, '爆発後、範囲内の敵へ雷撃が連鎖。', { dmg: 80, r: 5, fuse: 1.4, elem: 'shock', stacks: 3, shieldMul: 2.5 }],
    ['g_toxic', 'grenade', '毒ガス弾', '☠️', 'uncommon', 120, '8秒間残る毒ガスを発生させる。', { dmg: 20, r: 5, fuse: 1.2, zone: 'poison', dur: 8 }],
    ['g_cluster', 'grenade', 'クラスター爆弾', '🎆', 'rare', 210, '爆発後に5つの子爆弾をばら撒く。', { dmg: 110, r: 4.5, fuse: 1.5, cluster: 5 }],
    ['g_sticky', 'grenade', '粘着爆弾', '🧲', 'uncommon', 150, '敵や壁に貼り付き、強力な爆発を起こす。', { dmg: 230, r: 3.8, fuse: 1.4, sticky: true }],
    ['g_flash', 'grenade', '閃光弾', '✨', 'common', 80, '半径10mの敵を2.5秒間スタンさせる。', { dmg: 5, r: 10, fuse: 1.0, stun: 2.5 }],
    ['g_hole', 'grenade', '重力子爆弾', '🕳️', 'epic', 320, '3秒間敵を吸い寄せ、最後に爆発する。', { dmg: 260, r: 8, fuse: 1.0, blackhole: 3 }],
    ['g_holy', 'grenade', '聖水瓶', '💧', 'uncommon', 120, '不死の魔物（骸骨・怨霊・屍骨）に3倍ダメージ。範囲内の自分も回復。', { dmg: 90, r: 5, impact: true, holy: true }],
    ['g_molotov', 'grenade', '火炎瓶', '🍾', 'common', 90, '着弾で割れて火の海を作る。', { dmg: 30, r: 4, impact: true, zone: 'fire', dur: 5 }],
    ['g_mine', 'grenade', '対魔地雷', '⚙️', 'rare', 170, '設置後、敵が近づくと爆発する。', { dmg: 260, r: 4.5, mine: true }],
    ['g_smoke', 'grenade', '煙幕弾', '🌫️', 'common', 70, '煙の中では敵がこちらを見失う。', { dmg: 0, r: 6, fuse: 1.0, zone: 'smoke', dur: 8 }],
    ['g_nail', 'grenade', '釘爆弾', '📌', 'uncommon', 140, '爆発で釘を撒き散らし、出血を付与。', { dmg: 100, r: 6, fuse: 1.4, elem: 'bleed', stacks: 3 }],
    ['g_thermite', 'grenade', 'テルミット', '🔶', 'rare', 200, '小範囲を高熱で溶かす。シールドに大ダメージ。', { dmg: 160, r: 3.2, fuse: 1.3, zone: 'fire', dur: 4, shieldMul: 5 }],
    ['g_shatter', 'grenade', 'シールド粉砕弾', '💠', 'epic', 280, 'シールドに×20の破壊的ダメージ。', { dmg: 60, r: 7, fuse: 1.2, shieldMul: 20, emp: true }],
    ['g_dyna', 'grenade', 'ダイナマイト束', '🧨', 'rare', 230, '長い導火線の後、超大爆発。', { dmg: 420, r: 7.5, fuse: 2.6 }],
    ['g_decoy', 'grenade', '囮の鈴', '🔔', 'rare', 160, '着弾地点で鳴り続け、8秒間敵を引き付ける。', { dmg: 0, r: 1, fuse: 0.8, decoy: 8 }],
    // heals (4-7 utility belt)
    ['h_bandage', 'heal', '包帯', '🩹', 'common', 60, '2秒かけてHPを30回復。', { heal: 30, over: 2 }],
    ['h_medkit', 'heal', '救急キット', '🧰', 'uncommon', 120, 'HPを70即時回復。', { heal: 70 }],
    ['h_elixir', 'heal', '生命の霊薬', '🧪', 'rare', 260, 'HPを全回復する。', { heal: 9999 }],
    ['h_regen', 'heal', '再生の薬', '💉', 'uncommon', 110, '10秒間、毎秒HP9回復。', { heal: 90, over: 10 }],
    ['h_blood', 'heal', '血の小瓶', '🩸', 'uncommon', 110, 'HP40回復＋10秒間与ダメ+15%。', { heal: 40, temp: { dmg: 0.15 }, dur: 10 }],
    ['h_troll', 'heal', 'トロールの心臓', '🫀', 'epic', 320, '最大HP+15（永続）、HP40回復。', { heal: 40, maxHp: 15 }],
    ['h_apple', 'heal', '黄金の林檎', '🍎', 'rare', 220, 'HP50回復＋オーバーシールド40。', { heal: 50, os: 40 }],
    ['h_fairy', 'heal', '妖精の小瓶', '🧚', 'legendary', 7500, '所持していると、死亡時に自動で使用されHP全快で復活する。', { revive: true }],
    ['h_water', 'heal', '清めの水', '💧', 'rare', 180, '状態異常を解除してHP10回復。さらに90秒間、状態異常の持続時間-70%・継続ダメージ-50%。', { heal: 10, cleanse: true, resist: 90 }],
    // utilities
    ['u_plate', 'util', '鎧板', '🛡️', 'uncommon', 120, 'オーバーシールド+35。', { os: 35 }],
    ['u_battery', 'util', '魔力電池', '🔋', 'rare', 190, 'オーバーシールド+80。', { os: 80 }],
    ['u_iron', 'util', '鉄皮の薬', '🪨', 'uncommon', 130, '10秒間、被ダメ-50%。', { temp: { armor: 0.5 }, dur: 10 }],
    ['u_invis', 'util', '透明薬', '👻', 'rare', 190, '8秒間透明になり、敵に狙われなくなる。', { invis: 8 }],
    // repair kit: not a pocket item - it is dragged onto an armour piece on the inventory screen (see js/invui.js)
    ['u_repair', 'util', '名工の補修具', '🛠️', 'epic', 380, '名工が遺した携帯用の補修具。インベントリで防具へドラッグ＆ドロップして使う。対象の防具の耐久を+150修復する（最大値まで）。', { repair: 150 }],
  ];
  G.ITEMS = IT.map(([id, cat, name, icon, rarity, price, desc, data]) => ({ id, cat, name, icon, rarity, price, desc, data, kind: 'item' }));
  G.ITEM_BY_ID = Object.fromEntries(G.ITEMS.map((i) => [i.id, i]));
  // consumables that were retired (the kit was cut down to what gets used): a held one is turned into coins when a saved run loads (inventory.js IV.load)
  G.RETIRED_ITEMS = {'h_herb': 45, 'u_adren': 120, 'u_rage': 130, 'u_focus': 170, 'u_infinite': 170, 'u_sand': 230, 'u_turret': 210, 'u_doll': 120, 'u_wind': 110, 'u_lucky': 180, 'u_map': 150, 'u_feather': 60, 'u_ward': 210, 'u_ammo': 40, 'u_berserk': 260, 'u_lantern': 280, 'u_whet': 70};
  G.ITEM_CAT = { grenade: { name: '投擲物', icon: '💣' }, heal: { name: '回復', icon: '❤️' }, util: { name: '補助', icon: '🧰' } };
  // fixed keys by category: 4 = heal, 5 = guard, 6 = boost, 7 = tools (G = grenades). Hold the key for a selection wheel.
  // keys 4 and 5 are two identical consumable pockets: any item except grenades goes into either (G = grenades only)
  // the fairy bottle (a free revive) is far too strong to be common: whenever a drop / shop roll lands on it, it only stays with this chance
  G.FAIRY_KEEP = 0.01;
  G.thinFairy = (pick) => { let it = pick(); for (let i = 0; i < 6 && it && it.id === 'h_fairy' && Math.random() > G.FAIRY_KEEP; i++) it = pick(); return it; };
  G.ITEM_SLOTS = [
    { id: 'c1', key: '4', name: '消耗品', icon: '🧪' },
    { id: 'c2', key: '5', name: '消耗品', icon: '🧪' },
  ];
  const GUARD = ['u_plate', 'u_battery', 'u_iron', 'u_invis'];
  const TOOL = [];
  // grenades: a much bigger blast and far more damage to enemy shields (the descriptions follow the numbers)
  G.GRENADE_RADIUS_MUL = 1.6; G.GRENADE_SHIELD_MUL = 3;
  for (const it of G.ITEMS) {
    if (it.cat !== 'grenade' || !it.data) continue;
    const d = it.data;
    if (d.r) { d.r = Math.round(d.r * G.GRENADE_RADIUS_MUL * 10) / 10; it.desc = it.desc.replace(/半径(\d+(?:\.\d+)?)m/g, () => `半径${d.r}m`); }
    d.shieldMul = (d.shieldMul || 1) * G.GRENADE_SHIELD_MUL;
    it.desc = it.desc.replace(/×(\d+)/g, (m, n) => `×${n * G.GRENADE_SHIELD_MUL}`);
    if (!/シールド/.test(it.desc) && d.dmg > 0 && !d.zone && !d.stun && !d.decoy) it.desc += ` シールドへのダメージ×${d.shieldMul}。`;
  }
  for (const it of G.ITEMS) { it.sub = it.cat === 'grenade' ? 'g' : it.cat === 'heal' ? 'heal' : GUARD.includes(it.id) ? 'guard' : TOOL.includes(it.id) ? 'tool' : 'boost'; it.slot = it.cat === 'grenade' ? 'g' : 'c'; }
  // items that work just by being carried (e.g. the fairy bottle) take no key slot at all
  for (const it of G.ITEMS) if (it.data && it.data.revive) { it.passive = true; it.slot = 'passive'; }
  // the repair kit takes no key slot either: it stays in the bag (1x2 cells) and is used by dropping it on an armour piece
  for (const it of G.ITEMS) if (it.data && it.data.repair) { it.kit = true; it.slot = 'kit'; it.sub = 'tool'; it.size = [1, 2]; }
  G.passiveItems = (P) => Object.keys(P.inv).filter((id) => P.inv[id] > 0 && G.ITEM_BY_ID[id] && G.ITEM_BY_ID[id].passive);
  G.ITEM_CAP = 9;

  // ---------- skills ----------
  // [id, name, icon, rarity, price, cooldown, desc, params]
  const SK = [
    ['dash', 'ダッシュ', '💨', 'uncommon', 2200, 3.2, '移動方向へ瞬時に突進する。2回までチャージ可能。', { charges: 2, power: 26 }],
    ['dash2', '疾風迅雷', '🌪️', 'epic', 3900, 2.6, '3回チャージ。突進中に触れた敵へダメージ＋電撃。', { charges: 3, power: 30, dmg: 60 }],
    ['blink', 'ブリンク', '✨', 'rare', 2800, 6, '視線の先へ最大12m瞬間移動する。', { range: 12 }],
    ['chrono', '時間減速', '⏳', 'epic', 4600, 26, '6秒間、敵と投射物の時間を60%遅くする。', { dur: 6, slow: 0.4 }],
    ['shockwave', '衝撃波', '🌊', 'rare', 3000, 10, '前方の敵を吹き飛ばしダメージ。シールドに×6ダメージ。', { r: 11, dmg: 90, shieldMul: 6 }],
    ['emp', 'EMPバースト', '📡', 'rare', 3200, 16, '周囲12mのシールドを粉砕（×15）し、シールド持ちを3秒スタンさせる。', { r: 12, dmg: 40, shieldMul: 15 }],
    ['chain', '連鎖雷', '⚡', 'rare', 3400, 9, '照準先の敵に落雷し、最大5体に連鎖する。', { dmg: 140, n: 5 }],
    ['chain2', '雷神の裁き', '🌩️', 'legendary', 5300, 7, '最大10体に連鎖し、全員に電撃を付与。', { dmg: 220, n: 10 }],
    ['firestorm', '火炎嵐', '🔥', 'rare', 3400, 14, '照準地点に7秒間燃え盛る炎の渦を発生させる。', { r: 6, dur: 7, dps: 45 }],
    ['frostnova', 'フロストノヴァ', '❄️', 'rare', 3000, 12, '周囲9mの敵を即座に凍結させ、ダメージを与える。', { r: 9, dmg: 70 }],
    ['gravity', '重力井戸', '🕳️', 'epic', 4300, 18, '照準地点に敵を吸い込む重力場を4秒間生成し、最後に圧壊させる。', { r: 10, dur: 4, dmg: 220 }],
    ['healaura', '癒しの泉', '💚', 'rare', 3200, 22, '8秒間、範囲内で毎秒HP12回復＋被ダメ-20%。', { r: 5, dur: 8, hps: 12 }],
    ['drain', '生命吸収', '🩸', 'rare', 3600, 12, '周囲10mの敵全員から生命力を吸い取り、ダメージの50%を回復。', { r: 10, dmg: 70 }],
    ['turret', '自動弩砲', '🏹', 'epic', 3900, 25, '20秒間、敵を自動で撃つ弩砲を設置する。', { dur: 20, dmg: 30 }],
    ['mines', '地雷散布', '⚙️', 'uncommon', 2800, 15, '前方に5つの地雷をばら撒く。', { n: 5, dmg: 140 }],
    ['meteor', '隕石落とし', '☄️', 'legendary', 4900, 22, '1.2秒後、照準地点に巨大な隕石が落下する。', { r: 9, dmg: 520 }],
    ['spear', '投槍', '🔱', 'uncommon', 2600, 6, '全てを貫く槍を投げる。シールドに×3。', { dmg: 200, shieldMul: 3 }],
    ['spikes', '大地の棘', '⛰️', 'rare', 3200, 10, '前方一直線に石の棘を突き出し、敵を打ち上げる。', { len: 18, dmg: 130 }],
    ['berserk', '狂戦士化', '😡', 'epic', 4100, 30, '8秒間、与ダメ+50%・連射速度+30%・吸血+5%。', { dur: 8 }],
    ['barrier', '鉄壁', '🛡️', 'uncommon', 3000, 20, '前方に投射物を防ぐ石壁を10秒間生成する。', { dur: 10 }],
    ['decoy', '幻影の囮', '🎭', 'uncommon', 2600, 20, '10秒間敵を引き付ける幻影を生み出す。消滅時に爆発。', { dur: 10, dmg: 120 }],
    ['cloak', '透明化', '👻', 'rare', 3400, 20, '6秒間透明になる。透明中の最初の一撃は確定会心（×2.5）。', { dur: 6 }],
    ['overdrive', '弾幕', '🔫', 'epic', 4300, 25, '7秒間、弾薬無限・連射速度+60%。', { dur: 7 }],
    ['blades', '刃の旋風', '🌀', 'epic', 3900, 16, '8秒間、周囲を6本の刃が回転し敵を切り刻む。', { dur: 8, dps: 70 }],
    ['leap', '雷鳴の跳躍', '🌩️', 'rare', 3200, 10, '前方へ大跳躍し、着地時に雷撃の衝撃波を放つ。', { dmg: 120, r: 7 }],
    ['mark', '処刑の刻印', '🎯', 'epic', 4000, 10, '照準先の敵に刻印。受けるダメージ+40%。刻印中に倒すとクールタイムをリセット。', { dur: 8 }],
    ['toxic', '毒霧', '☁️', 'uncommon', 2800, 14, '照準地点に10秒間の猛毒の霧を発生させる。', { r: 7, dur: 10 }],
    ['ricostorm', '跳弾の嵐', '↪️', 'rare', 3000, 20, '10秒間、全ての弾が近くの敵へ跳弾する。', { dur: 10 }],
    ['grasp', '闇の手', '🖐️', 'rare', 3200, 16, '照準地点の敵を3.5秒間拘束し、継続ダメージ。', { r: 8, dur: 3.5, dps: 40 }],
    ['holynova', '聖なる光', '☀️', 'epic', 4100, 18, '周囲11mに光の爆発。敵にダメージ、自分はHP40回復。不死の魔物に3倍。', { r: 11, dmg: 150, heal: 40 }],
    ['summon', '骸骨兵召喚', '💀', 'legendary', 5300, 35, '3体の骸骨兵を20秒間召喚し、共に戦わせる。', { n: 3, dur: 20, dmg: 35 }],
    ['harvest', '魂の収穫', '⚰️', 'legendary', 4900, 25, '周囲16mのHP30%以下の通常敵を即死させ、1体毎にHP5回復。', { r: 16 }],
    ['magnet', '磁力爆弾', '🧲', 'rare', 3000, 12, '照準先に磁力爆弾を撃ち込み、周囲の敵を引き寄せてから爆発。', { r: 7, dmg: 190 }],
    ['haste', '加速装置', '🏃', 'uncommon', 2400, 18, '7秒間、移動速度+60%、ジャンプ力+30%。', { dur: 7 }],
    ['rewind', '時間逆行', '⏪', 'epic', 4600, 30, '3秒前の位置とHPに巻き戻る。', { t: 3 }],
    ['lunge', '吸血の刃', '🗡️', 'rare', 3400, 7, '照準先の敵へ一瞬で踏み込み斬撃。与ダメの30%を回復。', { range: 16, dmg: 180 }],
    ['warcry', '鬨の声', '📯', 'rare', 3000, 25, '周囲の敵を3秒間恐怖させ、自身は8秒間与ダメ+25%。', { r: 14 }],
    ['arrowrain', '矢の雨', '☔', 'epic', 4200, 20, '照準地点に5秒間矢の雨を降らせる。', { r: 7, dur: 5, dps: 60 }],
    ['quake', '地震', '🌋', 'epic', 4400, 18, '地上にいる周囲20mの全ての敵にダメージ＋2秒スタン。', { r: 20, dmg: 110 }],
    ['icespear', '氷槍', '🧊', 'uncommon', 3000, 8, '貫通する氷の槍を放ち、命中した敵を凍結させる。', { dmg: 150 }],
    ['fireball', '火球', '🌞', 'uncommon', 3200, 7, '爆発する火球を放ち、敵を炎上させる。', { dmg: 170, r: 4.5 }],
    ['thornarmor', '茨の鎧', '🌵', 'uncommon', 2800, 20, '8秒間、被ダメ-35%、近接攻撃してきた敵へ反射。', { dur: 8 }],
    ['groundpound', '地裂掌', '✋', 'rare', 3100, 9, '地面を叩き、前方扇状に衝撃の亀裂を走らせる。パイルドライバーのクールタイムを2秒短縮。', { dmg: 120, r: 12 }],
    ['anchorstorm', '鉤鎖乱舞', '⛓️', 'epic', 4200, 16, '周囲の敵最大6体へ鎖を撃ち込み、自分の元へ引き寄せてスタンさせる。', { n: 6, r: 22 }],
    ['flight', '飛翔', '🪽', 'rare', 2800, 12, '真上へ大きく飛び上がり、3秒間滑空できる。', { dur: 3 }],
  ];
  G.SKILLS = SK.map(([id, name, icon, rarity, price, cd, desc, p]) => ({ id, name, icon, rarity, price, cd, desc, p, kind: 'skill' }));
  G.SKILL_BY_ID = Object.fromEntries(G.SKILLS.map((s) => [s.id, s]));
})();
