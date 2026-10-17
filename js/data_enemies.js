'use strict';
// 15 body plans x 10 variants = 150 monster types (+ special).
(function () {
  // attack kinds: lunge, slash, slam, swoop, pounce, spit, orb, beam, charge, bounce, spore, boulder, dashslash, burrow, support, throw
  const PLANS = [
    { key: 'hound', name: '猟犬', icon: '🐺', hp: 55, dmg: 11, speed: 8.2, size: 1.0, attack: 'lunge', range: 2.4, cd: 1.3, minArea: 1, sound: 'snarl', pitch: 1.0, ai: 'flank', h: 1.1, desc: '群れで獲物を囲む四足の魔獣。素早く飛びかかり噛み付く。' },
    { key: 'imp', name: 'インプ', icon: '👺', hp: 38, dmg: 9, speed: 6.5, size: 0.75, attack: 'throw', range: 26, cd: 2.0, minArea: 1, sound: 'screech', pitch: 1.4, ai: 'ranged', h: 1.1, desc: '小柄な悪魔。距離を取りながら火の玉を投げつけてくる臆病者。' },
    { key: 'skeleton', name: '骸骨兵', icon: '💀', hp: 70, dmg: 14, speed: 4.6, size: 1.0, attack: 'slash', range: 2.3, cd: 1.5, minArea: 1, sound: 'groan', pitch: 1.2, ai: 'melee', h: 1.85, undead: true, desc: '錆びた剣を振るう不死の兵士。盾で身を守ることもある。' },
    { key: 'slime', name: 'スライム', icon: '🟢', hp: 85, dmg: 12, speed: 3.6, size: 1.0, attack: 'bounce', range: 5, cd: 2.2, minArea: 1, sound: 'slosh', pitch: 1.0, ai: 'melee', h: 1.1, split: true, desc: '跳ねて押し潰そうとする粘体。倒すと小さく分裂する。' },
    { key: 'bat', name: '大蝙蝠', icon: '🦇', hp: 34, dmg: 9, speed: 9.5, size: 0.9, attack: 'swoop', range: 2.0, cd: 2.4, minArea: 2, sound: 'screech', pitch: 1.6, ai: 'flyer', flyer: true, h: 0.8, desc: '空を舞い急降下してくる。飛行するため地形を無視する。' },
    { key: 'spider', name: '洞窟蜘蛛', icon: '🕷️', hp: 50, dmg: 10, speed: 8.6, size: 0.9, attack: 'pounce', range: 9, cd: 2.0, minArea: 2, sound: 'chitter', pitch: 1.0, ai: 'flank', h: 0.8, web: true, desc: '壁際から素早く跳びかかる。粘着質の糸を吐き動きを鈍らせる。' },
    { key: 'brute', name: 'オーガ', icon: '👹', hp: 260, dmg: 30, speed: 4.2, size: 1.0, attack: 'slam', range: 4.2, cd: 2.6, minArea: 3, sound: 'roar', pitch: 0.8, ai: 'melee', h: 3.0, big: true, desc: '巨体で地面を叩き割る怪物。衝撃波はジャンプで避けられる。' },
    { key: 'gargoyle', name: '石像鬼', icon: '😈', hp: 110, dmg: 16, speed: 4.2, size: 1.0, attack: 'beam', range: 28, cd: 3.5, minArea: 3, sound: 'screech', pitch: 0.7, ai: 'ranged', flyer: true, h: 1.4, desc: '墓所や門に据えられた石の魔物。翼で宙に留まり、溜めの後に石化の視線を放つ。' },
    { key: 'beetle', name: '甲殻虫', icon: '🪲', hp: 170, dmg: 22, speed: 5.0, size: 1.0, attack: 'charge', range: 16, cd: 3.2, minArea: 4, sound: 'chitter', pitch: 0.6, ai: 'melee', h: 1.3, frontArmor: 0.7, big: true, desc: '前面が硬い甲殻に覆われている。突進は横へ避け、背中を狙え。' },
    { key: 'wraith', name: '怨霊', icon: '👻', hp: 105, dmg: 14, speed: 5.5, size: 1.0, attack: 'orb', range: 28, cd: 2.4, minArea: 4, sound: 'wail', pitch: 1.0, ai: 'ranged', hover: true, h: 2.1, undead: true, blink: true, desc: '漂う亡霊。追尾する呪弾を放ち、瞬間移動で逃げる。' },
    { key: 'mushroom', name: '胞子茸', icon: '🍄', hp: 115, dmg: 8, speed: 3.0, size: 1.0, attack: 'spore', range: 14, cd: 3.0, minArea: 5, sound: 'gurgle', pitch: 0.9, ai: 'ranged', h: 1.6, desc: '歩く茸。毒の胞子雲を撒き散らし、死ぬと破裂する。' },
    { key: 'golem', name: '岩石ゴーレム', icon: '🗿', hp: 380, dmg: 28, speed: 3.4, size: 1.0, attack: 'boulder', range: 32, cd: 3.4, minArea: 6, sound: 'rumble', pitch: 0.7, ai: 'melee', h: 3.2, big: true, shield: 0.4, desc: '岩の巨人。岩塊を投げつけ、近づけば叩き潰す。シールドを持つ。' },
    { key: 'shaman', name: '呪術師', icon: '🧙', hp: 125, dmg: 12, speed: 4.5, size: 1.0, attack: 'support', range: 22, cd: 4.0, minArea: 6, sound: 'groan', pitch: 1.3, ai: 'support', h: 2.0, desc: '仲間を癒しシールドを与える。最優先で倒すべき支援役。' },
    { key: 'mantis', name: '刃蟷螂', icon: '🦗', hp: 140, dmg: 24, speed: 7.0, size: 1.0, attack: 'dashslash', range: 10, cd: 2.4, minArea: 7, sound: 'hiss', pitch: 1.1, ai: 'flank', h: 2.4, cloak: true, desc: '姿を消して忍び寄り、一瞬で間合いを詰めて斬りつける。' },
    { key: 'worm', name: '穴蟲', icon: '🪱', hp: 190, dmg: 22, speed: 6.0, size: 1.0, attack: 'burrow', range: 3.5, cd: 3.0, minArea: 8, sound: 'rumble', pitch: 1.1, ai: 'burrow', h: 2.2, big: true, desc: '地中を潜行し、足元から飛び出してくる。地面の揺れに注意。' },
  ];
  const VARIANTS = [
    { key: 'normal', prefix: '', icon: '', minAdd: 0, hp: 1, dmg: 1, spd: 1, size: 1, desc: '', color: null },
    { key: 'elder', prefix: '古き', icon: '🦴', minAdd: 5, hp: 1.9, dmg: 1.3, spd: 0.92, size: 1.28, desc: '長い年月を生きた大型個体。角と装甲を持つ。', orn: 'horns', shield: 0.15 },
    { key: 'fire', prefix: '炎獄の', icon: '🔥', minAdd: 2, hp: 1.1, dmg: 1.15, spd: 1.05, size: 1, elem: 'fire', desc: '攻撃が炎上を付与する。体が燻り続けている。', orn: 'ember', color: '#5a2a1a', eye: '#ffb050' },
    { key: 'frost', prefix: '氷結の', icon: '❄️', minAdd: 3, hp: 1.2, dmg: 1.05, spd: 0.95, size: 1.05, elem: 'frost', desc: '攻撃が冷気を付与し、動きを鈍らせる。', orn: 'ice', color: '#8aa8c0', eye: '#d0f0ff' },
    { key: 'venom', prefix: '猛毒の', icon: '☠️', minAdd: 3, hp: 1.1, dmg: 1.1, spd: 1.05, size: 1, elem: 'poison', desc: '攻撃が毒を付与する。毒は重なるほど危険。', orn: 'spikes', color: '#4a5a2a', eye: '#b0f060' },
    { key: 'storm', prefix: '雷鳴の', icon: '⚡', minAdd: 4, hp: 1.05, dmg: 1.1, spd: 1.22, size: 0.95, elem: 'shock', desc: '素早く、攻撃が電撃を伴う。', orn: 'sparks', color: '#4a4a5a', eye: '#ffe880' },
    { key: 'shadow', prefix: '影の', icon: '🌑', minAdd: 6, hp: 1.15, dmg: 1.2, spd: 1.15, size: 1, desc: '照準を感知して回避し、短距離を瞬間移動する。', orn: 'wisps', color: '#1a1820', eye: '#c060ff', dodge: true },
    { key: 'bone', prefix: '屍骨の', icon: '☠', minAdd: 7, hp: 1.3, dmg: 1.15, spd: 0.95, size: 1.05, desc: '一度倒しても数秒後に蘇る。骨の鎧を纏う。', orn: 'bones', color: '#c8bca0', eye: '#80ffd0', revive: true, undead: true },
    { key: 'crystal', prefix: '晶殻の', icon: '💎', minAdd: 9, hp: 1.3, dmg: 1.2, spd: 0.95, size: 1.1, desc: '結晶の殻が強固なシールドとなる。EMPや電撃で砕け。', orn: 'crystal', color: '#4a5a7a', eye: '#a0e0ff', shield: 0.8 },
    { key: 'abyss', prefix: '深淵の', icon: '🕳️', minAdd: 13, hp: 2.3, dmg: 1.45, spd: 1.08, size: 1.35, desc: '深淵から這い出た最上位種。シールドと威圧のオーラを持つ。', orn: 'abyss', color: '#140c18', eye: '#ff3040', shield: 0.6, aura: true },
  ];
  const ENEMIES = [];
  for (const p of PLANS) {
    for (const v of VARIANTS) {
      const id = p.key + '_' + v.key;
      const e = {
        id, plan: p.key, variant: v.key,
        name: v.prefix + p.name,
        icon: p.icon,
        vicon: v.icon,
        hp: Math.round(p.hp * v.hp),
        dmg: Math.round(p.dmg * v.dmg),
        speed: p.speed * v.spd,
        size: p.size * v.size,
        attack: p.attack, range: p.range, cd: p.cd, ai: p.ai,
        flyer: !!p.flyer, hover: !!p.hover, h: p.h * v.size,
        big: !!p.big || v.size > 1.25,
        elem: v.elem || (p.key === 'imp' ? 'fire' : null),
        shield: Math.max(p.shield || 0, v.shield || 0),
        revive: !!v.revive, dodge: !!v.dodge || p.key === 'mantis', aura: !!v.aura,
        undead: !!p.undead || !!v.undead,
        frontArmor: p.frontArmor || 0, split: !!p.split, web: !!p.web, cloak: !!p.cloak, blink: !!p.blink || v.key === 'shadow',
        minArea: p.minArea + v.minAdd,
        sound: p.sound, pitch: p.pitch / Math.sqrt(v.size),
        color: v.color, eye: v.eye, orn: v.orn,
        desc: p.desc + (v.desc ? '\n【' + (v.prefix.replace('の', '') || v.key) + '】' + v.desc : ''),
        rarity: v.key === 'abyss' ? 'legendary' : v.key === 'crystal' || v.key === 'elder' ? 'epic' : v.key === 'normal' ? 'common' : v.key === 'bone' || v.key === 'shadow' ? 'rare' : 'uncommon',
      };
      ENEMIES.push(e);
    }
  }
  // special: treasure mimic (runs away with coins)
  ENEMIES.push({
    id: 'mimic_gold', plan: 'mimic', variant: 'normal', name: '黄金のミミック', icon: '💰', vicon: '', hp: 160, dmg: 6, speed: 7.5, size: 1, attack: 'none', range: 0, cd: 99, ai: 'flee', h: 1.0,
    flyer: false, hover: false, big: false, elem: null, shield: 0, minArea: 2, sound: 'chitter', pitch: 1.2, color: null, eye: '#ffd040',
    desc: '財宝を抱えて逃げ回る宝箱の魔物。時間内に倒せば大量のコインを落とす。', rarity: 'legendary', special: true,
  });
  ENEMIES.push({
    id: 'mimic_trap', plan: 'mimic', variant: 'normal', name: '人喰いミミック', icon: '📦', vicon: '', hp: 260, dmg: 18, speed: 7, size: 1.15, attack: 'bounce', range: 5, cd: 1.6, ai: 'melee', h: 1.1,
    flyer: false, hover: false, big: false, elem: null, shield: 0.2, minArea: 3, sound: 'chitter', pitch: 0.9, color: '#5a3a20', eye: '#ff4020',
    desc: '宝物庫の宝箱に化けた凶暴なミミック。開けた者に襲いかかり、跳躍して押し潰そうとする。', rarity: 'epic', special: true,
  });
  G.ENEMY_PLANS = PLANS;
  G.ENEMY_VARIANTS = VARIANTS;
  G.ENEMIES = ENEMIES;
  // the bestiary unlocks one stage (5 areas) at a time, so a stage keeps the same faces throughout;
  // status-inflicting kinds (fire, webs, poison...) only show up from the 2nd-3rd stage on
  const PLAN_K = { hound: 0, skeleton: 0, slime: 0, bat: 0, imp: 1, spider: 1, brute: 1, eye: 2, beetle: 2, wraith: 2, mushroom: 3, golem: 3, shaman: 4, mantis: 4, worm: 5 };
  const VAR_K = { normal: 0, elder: 1, fire: 2, frost: 2, venom: 3, storm: 3, shadow: 4, bone: 5, crystal: 6, abyss: 8 };
  for (const e of ENEMIES) if (!e.special) { e.unlockK = Math.max(PLAN_K[e.plan] ?? 0, VAR_K[e.variant] ?? 0); e.minArea = e.unlockK * 5 + 1; }
  G.ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

  G.BOSSES = [
    { id: 'colossus', name: '石棺の巨像', title: 'SARCOPHAGUS COLOSSUS', icon: '🗿', desc: '古代の守護像。本体は無敵で、体に埋め込まれた4つの魂核を破壊すると崩れ落ち、頭部が露出する。地面を叩く衝撃波はジャンプで、薙ぎ払いはしゃがみで避けろ。', mech: ['魂核の破壊でダウン', '衝撃波（ジャンプで回避）', '岩塊投擲', '薙ぎ払い（しゃがみ回避）'] },
    { id: 'wyrm', name: '深淵の大蛇', title: 'ABYSS WYRM', icon: '🐍', desc: '地中を泳ぐ巨大な蛇。地面が揺れる場所から飛び出してくる。弱点は頭部のみで、胴体へのダメージは大きく軽減される。酸の溜まりを残す。', mech: ['地中からの奇襲', '頭部のみが弱点', '酸弾の連射', '第2形態で同時潜行'] },
    { id: 'archon', name: '百眼の司教', title: 'HUNDRED-EYED ARCHON', icon: '👁️', desc: '宙に浮かぶ大司教。周囲を回る6つの護符眼がシールドを張っている。護符眼を全て破壊すると本体が無防備になる。回転する熱線は柱の陰へ。', mech: ['護符眼のシールド', '弾幕', '回転熱線（遮蔽で回避）', '眷属召喚・瞬間移動'] },
    { id: 'executioner', name: '鎖の処刑人', title: 'CHAINED EXECUTIONER', icon: '🪓', desc: '鎖を纏う巨大な処刑人。正面の装甲は銃弾をほとんど通さない。突進を柱に激突させるとスタンし、装甲が剥がれる。背中の傷は常に弱点。', mech: ['正面装甲（-85%）', '突進→柱で自滅スタン', '鎖の引き寄せ', '大斧の叩き付け'] },
    { id: 'broodmother', name: '巣の女王', title: 'BROOD MOTHER', icon: '🕷️', desc: '巨大な母蜘蛛。高所の巣に登ると攻撃が届かなくなり、卵嚢から子蜘蛛が孵化する。卵嚢を破壊し、降りてきた所で腹部の弱点を撃て。', mech: ['巣への退避（無敵）', '卵嚢と子蜘蛛', '粘着糸で鈍化', '跳躍のしかかり'] },
  ];
  G.BOSS_BY_ID = Object.fromEntries(G.BOSSES.map((b) => [b.id, b]));
})();
