'use strict';
// Weapon archetypes, named weapon variants and attachments.
(function () {
  const ARCH = {
    pistol: { cat: 'ハンドガン', icon: '🔫', dmg: 24, rpm: 400, mag: 14, reload: 1.25, auto: false, spread: 1.5, adsSpread: 0.3, recoil: 1.3, zoom: 1.25, range: 45, headMul: 2.0, adsTime: 0.13, moveMul: 1.0, sound: 'pistol', reloadSeq: 'mag', price: 0 },
    revolver: { cat: 'リボルバー', icon: '🔫', dmg: 64, rpm: 150, mag: 6, reload: 2.1, auto: false, spread: 1.8, adsSpread: 0.22, recoil: 3.4, zoom: 1.35, range: 60, headMul: 2.3, adsTime: 0.16, moveMul: 1.0, sound: 'revolver', reloadSeq: 'cyl', price: 100 },
    smg: { cat: 'サブマシンガン', icon: '🔫', dmg: 15, rpm: 870, mag: 32, reload: 1.7, auto: true, spread: 2.6, adsSpread: 1.0, recoil: 0.65, zoom: 1.3, range: 30, headMul: 1.75, adsTime: 0.14, moveMul: 1.05, sound: 'smg', reloadSeq: 'mag', price: 200 },
    rifle: { cat: 'アサルトライフル', icon: '🎯', dmg: 22, rpm: 630, mag: 30, reload: 2.0, auto: true, spread: 2.2, adsSpread: 0.28, recoil: 1.0, zoom: 1.5, range: 70, headMul: 2.0, adsTime: 0.2, moveMul: 0.95, sound: 'rifle', reloadSeq: 'mag', price: 400 },
    burst: { cat: 'バーストライフル', icon: '🎯', dmg: 27, rpm: 900, burst: 3, burstDelay: 0.3, mag: 30, reload: 2.0, auto: false, spread: 2.0, adsSpread: 0.22, recoil: 0.9, zoom: 1.6, range: 75, headMul: 2.0, adsTime: 0.2, moveMul: 0.95, sound: 'rifle', reloadSeq: 'mag', price: 400 },
    dmr: { cat: 'マークスマンライフル', icon: '🎯', dmg: 54, rpm: 300, mag: 15, reload: 2.2, auto: false, spread: 2.6, adsSpread: 0.1, recoil: 2.4, zoom: 2.2, range: 110, headMul: 2.2, adsTime: 0.24, moveMul: 0.92, sound: 'dmr', reloadSeq: 'mag', price: 500 },
    sniper: { cat: 'スナイパーライフル', icon: '🔭', dmg: 165, rpm: 46, mag: 5, reload: 2.8, auto: false, spread: 6, adsSpread: 0.0, recoil: 6, zoom: 4.0, range: 220, headMul: 2.5, adsTime: 0.3, moveMul: 0.86, pierce: 1, sound: 'sniper', reloadSeq: 'bolt', price: 700 },
    shotgun: { cat: 'ショットガン', icon: '💥', dmg: 12, pellets: 9, rpm: 72, mag: 6, reload: 2.5, auto: false, spread: 6.5, adsSpread: 5.0, recoil: 5, zoom: 1.15, range: 22, headMul: 1.5, adsTime: 0.18, moveMul: 0.96, sound: 'shotgun', reloadSeq: 'shells', price: 300 },
    autoshotgun: { cat: 'オートショットガン', icon: '💥', dmg: 9, pellets: 8, rpm: 220, mag: 10, reload: 2.6, auto: true, spread: 7, adsSpread: 5.5, recoil: 3, zoom: 1.15, range: 18, headMul: 1.4, adsTime: 0.2, moveMul: 0.93, sound: 'shotgun', reloadSeq: 'mag', autoShot: true, price: 600 },
    lmg: { cat: 'ライトマシンガン', icon: '🔫', dmg: 24, rpm: 680, mag: 100, reload: 4.0, auto: true, spread: 3, adsSpread: 0.6, recoil: 1.2, zoom: 1.45, range: 75, headMul: 1.8, adsTime: 0.32, moveMul: 0.82, sound: 'lmg', reloadSeq: 'box', price: 700 },
    minigun: { cat: 'ガトリング', icon: '🌀', dmg: 13, rpm: 1500, mag: 250, reload: 5.0, auto: true, spinup: 0.7, spread: 3.6, adsSpread: 2.4, recoil: 0.35, zoom: 1.1, range: 50, headMul: 1.5, adsTime: 0.4, moveMul: 0.7, sound: 'minigun', reloadSeq: 'box', price: 1200 },
    crossbow: { cat: 'クロスボウ', icon: '🏹', dmg: 135, rpm: 80, mag: 5, reload: 2.2, auto: false, spread: 1.2, adsSpread: 0.0, recoil: 1.8, zoom: 2.0, range: 150, headMul: 2.5, adsTime: 0.2, moveMul: 0.95, proj: { kind: 'bolt', speed: 95, grav: 5 }, pierce: 2, sound: 'crossbow', reloadSeq: 'bolt', price: 600 },
    rocket: { cat: 'ロケットランチャー', icon: '🚀', dmg: 190, rpm: 55, mag: 3, reload: 3.0, auto: false, spread: 1, adsSpread: 0.2, recoil: 5, zoom: 1.6, range: 200, headMul: 1.0, adsTime: 0.35, moveMul: 0.84, proj: { kind: 'rocket', speed: 46, grav: 0, explode: 4.5 }, sound: 'rocket', reloadSeq: 'tube', price: 1400 },
    gl: { cat: 'グレネードランチャー', icon: '💣', dmg: 125, rpm: 110, mag: 6, reload: 2.8, auto: false, spread: 1, adsSpread: 0.3, recoil: 3, zoom: 1.3, range: 80, headMul: 1.0, adsTime: 0.25, moveMul: 0.9, proj: { kind: 'grenade', speed: 32, grav: 18, explode: 4, fuse: 1.6, bounce: true }, sound: 'gl', reloadSeq: 'cyl', price: 1100 },
    flame: { cat: '火炎放射器', icon: '🔥', dmg: 9, rpm: 960, mag: 150, reload: 3.0, auto: true, spread: 8, adsSpread: 6, recoil: 0.1, zoom: 1.05, range: 10, headMul: 1.0, adsTime: 0.2, moveMul: 0.9, flame: true, element: 'fire', sound: 'flame', reloadSeq: 'tank', price: 900 },
    rail: { cat: 'レールガン', icon: '⚡', dmg: 320, rpm: 60, mag: 4, reload: 2.8, auto: false, charge: 0.7, spread: 0.5, adsSpread: 0, recoil: 7, zoom: 3.0, range: 250, headMul: 2.0, adsTime: 0.3, moveMul: 0.85, pierce: 99, shieldMul: 2.0, sound: 'rail', reloadSeq: 'cell', price: 1600 },
    nail: { cat: 'ネイルガン', icon: '📌', dmg: 17, rpm: 760, mag: 50, reload: 2.0, auto: true, spread: 2.4, adsSpread: 0.8, recoil: 0.5, zoom: 1.3, range: 60, headMul: 1.9, adsTime: 0.16, moveMul: 1.0, proj: { kind: 'nail', speed: 140, grav: 3 }, element: 'bleed', elemChance: 0.2, sound: 'nail', reloadSeq: 'mag', price: 400 },
    harpoon: { cat: 'ハープーンガン', icon: '🪝', dmg: 110, rpm: 90, mag: 1, reload: 1.1, auto: false, spread: 1, adsSpread: 0.1, recoil: 3, zoom: 1.6, range: 70, headMul: 2.0, adsTime: 0.2, moveMul: 0.95, proj: { kind: 'harpoon', speed: 85, grav: 4 }, pull: true, sound: 'harpoon', reloadSeq: 'bolt', price: 700 },
    tesla: { cat: '雷管銃', icon: '⚡', dmg: 15, rpm: 500, mag: 40, reload: 2.4, auto: true, spread: 1.0, adsSpread: 0.4, recoil: 0.5, zoom: 1.3, range: 28, headMul: 1.3, adsTime: 0.2, moveMul: 0.95, chain: 3, element: 'shock', elemChance: 0.35, shieldMul: 1.6, sound: 'tesla', reloadSeq: 'cell', price: 1000 },
  };
  const RPRICE = { common: 900, uncommon: 1350, rare: 2000, epic: 2900, legendary: 4100 };

  // [id, arch, name, rarity, mods, trait, finish, desc]
  const V = [
    ['starter', 'pistol', 'P9 サービスピストル', 'common', { dmg: 0.88, rpm: 0.9 }, null, 'black', '探索者に支給される標準拳銃。信頼性だけが取り柄。'],
    ['p_viper', 'pistol', 'ヴァイパー .45', 'common', { dmg: 1.25, rpm: 0.85, mag: 0.85 }, null, 'steel', '大口径の半自動拳銃。一発の重みがある。'],
    ['p_hornet', 'pistol', 'ホーネット M9A', 'uncommon', { auto: true, rpm: 1.5, dmg: 0.8, mag: 1.4 }, null, 'black', 'フルオート化された機関拳銃。'],
    ['p_ember', 'pistol', '残り火のデリンジャー', 'rare', { dmg: 1.4, mag: 0.6 }, 'incendiary', 'brass', '命中した敵を燃やす装飾拳銃。'],
    ['p_mercy', 'pistol', '慈悲の一撃', 'epic', { dmg: 1.3, headMul: 1.3 }, 'execute', 'bone', '体力20%以下の敵を即座に処刑する。'],
    ['p_twin', 'pistol', '双子の囁き', 'legendary', { rpm: 1.6, dmg: 1.2, mag: 1.6 }, 'double', 'gold', '射撃毎に25%の確率で弾が二重に放たれる。'],
    ['r_judge', 'revolver', 'ジャッジ .44', 'uncommon', {}, null, 'steel', '重い一撃を叩き込む回転式拳銃。'],
    ['r_thunder', 'revolver', '雷鳴のマグナム', 'rare', { dmg: 1.15 }, 'shock', 'black', '電撃弾。シールドを焼き切る。'],
    ['r_reaper', 'revolver', '死神のシックスシューター', 'epic', { dmg: 1.25, headMul: 1.25 }, 'killReload', 'bone', 'キルすると即座に全弾装填される。'],
    ['r_sun', 'revolver', '落日', 'legendary', { dmg: 1.5, rpm: 1.2 }, 'explosiveRounds', 'gold', '着弾時に小爆発を起こす伝説の拳銃。'],
    ['s_wasp', 'smg', 'ワスプ SMG', 'common', {}, null, 'black', '軽量で取り回しの良い短機関銃。'],
    ['s_vector', 'smg', 'ヴェクター K', 'uncommon', { rpm: 1.25, recoil: 0.8 }, null, 'tan', '反動抑制機構付きの高速連射SMG。'],
    ['s_frost', 'smg', '霜噛み', 'rare', { mag: 1.2 }, 'cryo', 'steel', '冷気弾で敵の動きを鈍らせる。'],
    ['s_viper', 'smg', 'ブラッドヴァイパー', 'epic', { dmg: 1.2, rpm: 1.1 }, 'lifesteal', 'rust', '与ダメの4%を回復する。'],
    ['s_swarm', 'smg', '群蜂', 'legendary', { rpm: 1.35, mag: 1.6, dmg: 1.15 }, 'ricochet', 'gold', '弾丸が近くの敵へ跳弾する。'],
    ['a_ranger', 'rifle', 'レンジャー AR', 'common', {}, null, 'black', '汎用性の高い突撃銃。'],
    ['a_warden', 'rifle', 'ウォーデン AR-7', 'uncommon', { dmg: 1.1, spread: 0.85 }, null, 'tan', '精度を高めた改良型ライフル。'],
    ['a_crusader', 'rifle', 'クルセイダー', 'rare', { dmg: 1.2, mag: 1.15 }, 'pierce', 'steel', '弾丸が敵を1体貫通する。'],
    ['a_inferno', 'rifle', 'インフェルノ', 'rare', { rpm: 1.05 }, 'incendiary', 'rust', '焼夷弾仕様のライフル。'],
    ['a_venom', 'rifle', 'ヴェノムストライク', 'epic', { dmg: 1.2, rpm: 1.1 }, 'toxic', 'tan', '猛毒弾を連射する。'],
    ['a_oath', 'rifle', '誓約の剣', 'legendary', { dmg: 1.35, rpm: 1.15, mag: 1.35, recoil: 0.7 }, 'headhunter', 'gold', 'ヘッドショットで弾薬を2発回復する。'],
    ['b_triad', 'burst', 'トライアド B3', 'uncommon', {}, null, 'black', '3点バーストの精密ライフル。'],
    ['b_hydra', 'burst', 'ヒュドラ', 'epic', { dmg: 1.25 }, 'chainHit', 'steel', 'バーストの3発全てが命中すると雷撃が連鎖。'],
    ['b_tempest', 'burst', 'テンペスト', 'legendary', { burst: 5, dmg: 1.2, mag: 1.33 }, 'shock', 'gold', '5点バースト。嵐の如き連射。'],
    ['d_marksman', 'dmr', 'マークスマン DMR', 'uncommon', {}, null, 'tan', '中〜遠距離用の半自動狙撃銃。'],
    ['d_hawk', 'dmr', 'ホークアイ', 'rare', { dmg: 1.15, headMul: 1.15 }, null, 'black', '鷹の目のような精度。'],
    ['d_glacier', 'dmr', '氷河', 'epic', { dmg: 1.25 }, 'cryo', 'steel', '冷気弾で敵を凍結させる。'],
    ['d_saint', 'dmr', '聖者の裁定', 'legendary', { dmg: 1.4, rpm: 1.2 }, 'pierce', 'gold', '全てを貫く聖なる弾丸。'],
    ['n_longbow', 'sniper', 'ロングボウ SR', 'rare', {}, null, 'tan', 'ボルトアクション式の大口径狙撃銃。'],
    ['n_widow', 'sniper', 'ウィドウメイカー', 'epic', { dmg: 1.2, headMul: 1.2 }, 'execute', 'black', '弱った獲物を確実に仕留める。'],
    ['n_dragon', 'sniper', '竜殺し', 'legendary', { dmg: 1.5, rpm: 1.3, mag: 1.4 }, 'explosiveRounds', 'gold', '竜の鱗をも砕く炸裂弾。'],
    ['g_breacher', 'shotgun', 'ブリーチャー 12G', 'common', {}, null, 'black', '近距離制圧用ポンプショットガン。'],
    ['g_brute', 'shotgun', 'ブルート', 'uncommon', { dmg: 1.15, pellets: 1.1 }, null, 'rust', '散弾を増量した重量級。'],
    ['g_dragon', 'shotgun', 'ドラゴンブレス', 'rare', {}, 'incendiary', 'steel', '焼夷散弾で敵を炎に包む。'],
    ['g_reaver', 'shotgun', 'リーヴァー', 'epic', { dmg: 1.2, rpm: 1.3 }, 'knockback', 'bone', '敵を大きく吹き飛ばす。'],
    ['g_doom', 'shotgun', '終焉の咆哮', 'legendary', { dmg: 1.4, pellets: 1.3, rpm: 1.25 }, 'lifesteal', 'gold', '与ダメの4%を回復する。'],
    ['x_striker', 'autoshotgun', 'ストライカー AS', 'rare', {}, null, 'black', 'フルオートで散弾をばら撒く。'],
    ['x_maelstrom', 'autoshotgun', 'メイルストロム', 'legendary', { dmg: 1.3, mag: 1.6 }, 'shock', 'gold', '電撃散弾の嵐。'],
    ['l_bulwark', 'lmg', 'ブルワーク LMG', 'rare', {}, null, 'tan', '100発の大容量で弾幕を張る。'],
    ['l_siege', 'lmg', '攻城鎚', 'epic', { dmg: 1.2 }, 'pierce', 'steel', '貫通する重機関銃。'],
    ['l_wrath', 'lmg', '憤怒の連弩', 'legendary', { dmg: 1.25, rpm: 1.15 }, 'rampUp', 'gold', '撃ち続けるほど連射速度が上昇。'],
    ['m_cyclone', 'minigun', 'サイクロン', 'epic', {}, null, 'steel', '毎分1500発の回転機関砲。'],
    ['m_hell', 'minigun', '地獄の挽肉機', 'legendary', { dmg: 1.3 }, 'incendiary', 'rust', '焼夷弾をばら撒く悪夢の兵器。'],
    ['c_hunter', 'crossbow', '狩人の連弩', 'uncommon', {}, null, 'wood', '静かで強力な連射式クロスボウ。'],
    ['c_venom', 'crossbow', '毒蛇の弩', 'rare', { dmg: 1.1 }, 'toxic', 'wood', '毒矢を放つ。'],
    ['c_storm', 'crossbow', '雷霆弩', 'epic', { dmg: 1.2, mag: 1.4 }, 'chainHit', 'steel', '命中時に雷撃が連鎖する。'],
    ['c_sylv', 'crossbow', '森王の長弓', 'legendary', { dmg: 1.5, rpm: 1.3 }, 'homing', 'gold', '矢が獲物を追尾する。'],
    ['k_bastion', 'rocket', 'バスティオン RL', 'rare', {}, null, 'tan', '対大型用のロケットランチャー。'],
    ['k_cluster', 'rocket', 'クラスター RL', 'epic', { mag: 1.34 }, 'cluster', 'steel', '爆発後に子弾をばら撒く。'],
    ['k_meteor', 'rocket', '流星', 'legendary', { dmg: 1.4, rpm: 1.4, mag: 1.67 }, 'homing', 'gold', '追尾するロケット。'],
    ['q_thumper', 'gl', 'サンパー GL', 'uncommon', {}, null, 'tan', '跳ねるグレネードを撃ち出す。'],
    ['q_frost', 'gl', '霜嵐の擲弾筒', 'rare', {}, 'cryo', 'steel', '冷気の爆発で敵を凍らせる。'],
    ['q_pandemonium', 'gl', 'パンデモニウム', 'legendary', { mag: 1.5, rpm: 1.3, dmg: 1.2 }, 'cluster', 'gold', '爆発が更なる爆発を呼ぶ。'],
    ['f_scorch', 'flame', 'スコーチャー', 'rare', {}, null, 'rust', '前方を焼き払う火炎放射器。'],
    ['f_phoenix', 'flame', '不死鳥の吐息', 'legendary', { dmg: 1.4, range: 1.3 }, 'lifesteal', 'gold', '炎が生命力を奪う。'],
    ['v_lance', 'rail', 'ランス RG', 'epic', {}, null, 'steel', '全てを貫く電磁投射砲。'],
    ['v_judgement', 'rail', '雷罰', 'legendary', { dmg: 1.3, charge: 0.7 }, 'chainHit', 'gold', '貫いた全ての敵から雷撃が連鎖。'],
    ['t_rivet', 'nail', 'リベッター', 'common', {}, null, 'rust', '工業用ネイルガンを改造した物。出血付与。'],
    ['t_impaler', 'nail', 'インペイラー', 'rare', { dmg: 1.25 }, 'pierce', 'black', '釘が敵を串刺しにする。'],
    ['h_whaler', 'harpoon', 'ホエーラー', 'uncommon', {}, null, 'wood', '敵を引き寄せる銛撃ち銃。'],
    ['h_leviathan', 'harpoon', 'リヴァイアサン', 'epic', { dmg: 1.4, mag: 3 }, 'shock', 'steel', '3連装の電撃銛。'],
    ['e_arc', 'tesla', 'アークスロワー', 'rare', {}, null, 'brass', '近くの敵へ電撃が連鎖する。'],
    ['e_zeus', 'tesla', 'ゼウスの怒り', 'legendary', { dmg: 1.4, chain: 2 }, 'chainHit', 'gold', '連鎖数+2。雷神の武器。'],
    ['a_vanguard', 'rifle', 'ヴァンガード', 'uncommon', { rpm: 1.15, dmg: 0.95, mag: 1.2 }, null, 'black', '高速連射型の突撃銃。'],
    ['s_ghost', 'smg', 'ゴースト SD', 'rare', { dmg: 1.1 }, 'silent', 'black', '一体型サプレッサー。敵に気付かれにくい。'],
    ['d_sentinel', 'dmr', 'センチネル', 'rare', { mag: 1.4, rpm: 1.15 }, null, 'tan', '大容量マガジンの選抜射手銃。'],
    ['n_phantom', 'sniper', 'ファントム', 'epic', { rpm: 1.6, dmg: 0.85, mag: 1.6 }, 'pierce', 'black', 'セミオート狙撃銃。'],
    ['g_widow', 'shotgun', 'ダブルバレル', 'uncommon', { dmg: 1.35, rpm: 2.2, mag: 0.34 }, null, 'wood', '2連発の水平二連銃。'],
    ['p_cinder', 'pistol', 'シンダー', 'uncommon', { dmg: 1.1 }, 'incendiary', 'rust', '小型焼夷拳銃。'],
    // 神器 (mythic, deep shops / auctions only)
    ['y_midas', 'revolver', '神器「黄金律」', 'legendary', { dmg: 1.4, rpm: 1.2 }, 'goldrush', 'gold', '撃つたびにコインを3枚弾丸に込める。コインがある限り威力2.2倍。'],
    ['y_echo', 'rifle', '神器「残響のアリア」', 'legendary', { dmg: 1.3, rpm: 1.1, mag: 1.3 }, 'echo', 'gold', '4発ごとに、周囲の敵3体へ亡霊の弾が追撃する。'],
    ['y_maw', 'shotgun', '神器「虚喰らい」', 'legendary', { dmg: 1.35, pellets: 1.2 }, 'voidmaw', 'black', '命中した敵を手元へ引き寄せ、受けるダメージ+60%の刻印を刻む。'],
    ['y_storm', 'sniper', '神器「天雷の弓」', 'legendary', { dmg: 1.5, rpm: 1.25, mag: 1.4 }, 'stormcall', 'steel', 'ヘッドショットで天から雷が落ち、周囲5体へ連鎖する。'],
  ];
  const WEAPONS = [];
  const TRAITS = {
    incendiary: { icon: '🔥', name: '焼夷', desc: '命中時に炎上を付与' },
    cryo: { icon: '❄️', name: '冷気', desc: '命中時に冷気を付与（鈍化→凍結）' },
    toxic: { icon: '☠️', name: '猛毒', desc: '命中時に毒を付与（蓄積）' },
    shock: { icon: '⚡', name: '電撃', desc: '電撃を付与。シールドに追加ダメージ' },
    lifesteal: { icon: '🩸', name: '吸血', desc: '与ダメの4%を回復' },
    ricochet: { icon: '↪️', name: '跳弾', desc: '40%で近くの敵へ跳弾' },
    pierce: { icon: '➶', name: '貫通', desc: '敵を貫通する' },
    execute: { icon: '⚰️', name: '処刑', desc: 'HP20%以下の敵を即死させる（ボス除く）' },
    double: { icon: '👯', name: '二重射撃', desc: '25%で弾が2発発射される' },
    killReload: { icon: '♻️', name: '即装填', desc: '撃破すると即座に全弾装填' },
    explosiveRounds: { icon: '💥', name: '炸裂弾', desc: '着弾時に小爆発' },
    headhunter: { icon: '🎯', name: '首狩り', desc: 'ヘッドショットで弾薬2発回復' },
    chainHit: { icon: '⛓️', name: '連鎖雷', desc: '命中時に雷撃が近くの敵へ連鎖' },
    knockback: { icon: '💨', name: '衝撃', desc: '敵を大きく吹き飛ばす' },
    rampUp: { icon: '📈', name: '加熱', desc: '連射し続けると連射速度上昇（最大+60%）' },
    homing: { icon: '🧲', name: '追尾', desc: '弾が敵を追尾する' },
    cluster: { icon: '🎆', name: '分裂', desc: '爆発時に子爆弾を撒く' },
    silent: { icon: '🤫', name: '消音', desc: '射撃が静か。敵の反応が遅れる' },
    goldrush: { icon: '🪙', name: '黄金律', desc: '1発ごとにコイン3枚を消費して威力2.2倍' },
    echo: { icon: '👻', name: '残響', desc: '4発ごとに周囲3体へ追撃' },
    voidmaw: { icon: '🕳️', name: '虚喰らい', desc: '命中で引き寄せ＋受けるダメージ+60%の刻印' },
    stormcall: { icon: '🌩️', name: '天雷', desc: 'ヘッドショットで落雷が5体へ連鎖' },
  };
  for (const [id, arch, name, rarity, mods, trait, finish, desc] of V) {
    const A = ARCH[arch];
    const w = Object.assign({}, A, { id, arch, name, rarity, trait, finish, desc, kind: 'weapon' });
    for (const k in mods) {
      if (k === 'auto' || k === 'burst' || k === 'chain') w[k] = k === 'chain' ? (A.chain || 0) + mods[k] : mods[k];
      else if (k === 'pellets') w.pellets = Math.round((A.pellets || 1) * mods[k]);
      else if (k === 'mag') w.mag = Math.max(1, Math.round(A.mag * mods[k]));
      else if (k === 'charge') w.charge = A.charge * mods[k];
      else if (typeof A[k] === 'number') w[k] = A[k] * mods[k];
    }
    if (trait === 'pierce') w.pierce = Math.max(w.pierce || 0, 1) + 1;
    w.icon = A.icon;
    w.price = id === 'starter' ? 0 : Math.round((RPRICE[rarity] + A.price) / 50) * 50;
    WEAPONS.push(w);
  }
  const MYTH = { y_midas: 7000, y_echo: 8000, y_maw: 9000, y_storm: 12000 };
  for (const w of WEAPONS) if (MYTH[w.id]) { w.mythic = true; w.price = MYTH[w.id]; w.name = w.name; }
  G.WEAPON_ARCH = ARCH;
  G.WEAPONS = WEAPONS;
  G.WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
  G.WEAPON_TRAITS = TRAITS;

  // ---------- attachments ----------
  // slot: optic, muzzle, barrel, mag, under, stock, ammo, trigger
  // mods are multiplicative (x) unless key ends with '+' (additive)
  const SLOT = { optic: { name: '光学', icon: '🔭' }, muzzle: { name: 'マズル', icon: '🔇' }, barrel: { name: 'バレル', icon: '📏' }, mag: { name: 'マガジン', icon: '📦' }, under: { name: 'アンダー', icon: '✊' }, stock: { name: 'ストック', icon: '🪵' }, ammo: { name: '弾薬', icon: '🔸' }, trigger: { name: 'トリガー', icon: '☝️' } };
  const NOT_PROJ = (w) => !w.proj && !w.flame;
  const GUNLIKE = (w) => !w.flame;
  const SHOTGUN = (w) => (w.pellets || 1) > 1;
  // high-magnification optics: not on handguns or shotguns
  const LONGGUN = (w) => NOT_PROJ(w) && !SHOTGUN(w) && w.arch !== 'pistol' && w.arch !== 'revolver';
  const SEMI = (w) => !w.auto && !w.burst && !w.charge && !w.flame;
  const AT = [
    ['o_reddot', 'optic', 'レッドドット', '🔴', 'common', 200, { zoom: 1.12, adsTime: 0.9 }, 'reddot', 'ADS時に倍率1.4倍の照準。素早い照準。', GUNLIKE],
    ['o_holo', 'optic', 'ホロサイト', '⭕', 'uncommon', 260, { zoom: 1.18, adsSpread: 0.85 }, 'holo', '精度が向上するホログラフィック照準器。', GUNLIKE],
    ['o_2x', 'optic', '2.5倍スコープ', '🔍', 'uncommon', 300, { zoom: 1.7, adsTime: 1.15, adsSpread: 0.75 }, 'acog', '中距離向けの倍率スコープ。', GUNLIKE],
    ['o_4x', 'optic', '4倍スコープ', '🔭', 'rare', 380, { zoom: 2.6, adsTime: 1.3, adsSpread: 0.5, headMul: 1.08 }, 'scope', '遠距離狙撃用スコープ。（ハンドガン・ショットガン不可）', LONGGUN],
    ['o_8x', 'optic', '8倍スナイパースコープ', '🔭', 'epic', 480, { zoom: 4.5, adsTime: 1.45, adsSpread: 0.3, headMul: 1.15 }, 'scopeL', '極遠距離用の高倍率スコープ。（ハンドガン・ショットガン不可）', LONGGUN],
    ['o_hunter', 'optic', '狩人の眼', '👁️', 'epic', 520, { zoom: 1.3, critChance: 0.08 }, 'holo', '会心率+8%。弱点を見抜く魔眼の照準。', GUNLIKE],
    ['m_supp', 'muzzle', 'サプレッサー', '🔇', 'common', 220, { recoil: 0.9, range: 0.95 }, 'supp', '発射音を抑え、反動を軽減。', NOT_PROJ],
    ['m_comp', 'muzzle', 'コンペンセイター', '🔩', 'common', 200, { recoil: 0.75 }, 'comp', '反動-25%。', GUNLIKE],
    ['m_brake', 'muzzle', 'マズルブレーキ', '⚙️', 'uncommon', 260, { recoil: 0.8, spread: 0.9 }, 'brake', '反動-20%、拡散-10%。', GUNLIKE],
    ['m_choke', 'muzzle', 'フルチョーク', '🎯', 'uncommon', 240, { spread: 0.62, adsSpread: 0.62, range: 1.25 }, 'choke', '散弾の集弾性を大幅に向上。', SHOTGUN],
    ['m_supp2', 'muzzle', '魔導消音器', '🤫', 'rare', 380, { recoil: 0.82, dmg: 1.06 }, 'supp2', '発射音を消し、ダメージ+6%。', NOT_PROJ],
    ['m_flash', 'muzzle', 'フラッシュハイダー', '✴️', 'common', 160, { recoil: 0.9, spread: 0.92 }, 'flash', 'マズルフラッシュを抑制。', GUNLIKE],
    ['b_long', 'barrel', 'ロングバレル', '📏', 'common', 220, { range: 1.4, dmg: 1.08, adsTime: 1.1 }, null, '射程+40%、ダメージ+8%。', GUNLIKE],
    ['b_short', 'barrel', 'ショートバレル', '📐', 'common', 180, { adsTime: 0.8, moveMul: 1.05, spread: 1.1 }, null, 'ADS速度と機動力が向上。', GUNLIKE],
    ['b_heavy', 'barrel', 'ヘビーバレル', '🧱', 'uncommon', 300, { dmg: 1.15, rpm: 0.92 }, null, 'ダメージ+15%、連射速度-8%。', GUNLIKE],
    ['b_fluted', 'barrel', 'フルートバレル', '🌀', 'uncommon', 300, { rpm: 1.1 }, null, '連射速度+10%。', GUNLIKE],
    ['b_match', 'barrel', 'マッチグレードバレル', '🎯', 'rare', 360, { spread: 0.7, adsSpread: 0.7 }, null, '拡散-30%。', GUNLIKE],
    ['b_rifled', 'barrel', 'ライフリング強化', '🧿', 'rare', 380, { headMul: 1.18 }, null, 'ヘッドショット倍率+18%。', GUNLIKE],
    ['b_master', 'barrel', '名匠の銃身', '⚜️', 'epic', 520, { dmg: 1.15, rpm: 1.08, spread: 0.85 }, null, 'ダメージ+15%、連射速度+8%、拡散-15%。', GUNLIKE],
    ['g_ext', 'mag', '拡張マガジン', '📦', 'common', 220, { mag: 1.4 }, 'ext', '装弾数+40%。', GUNLIKE],
    ['g_drum', 'mag', 'ドラムマガジン', '🥁', 'uncommon', 320, { mag: 2.0, reload: 1.3, moveMul: 0.96 }, 'drum', '装弾数+100%、リロード時間+30%。', GUNLIKE],
    ['g_quick', 'mag', 'クイックマガジン', '⚡', 'common', 220, { reload: 0.7 }, 'quick', 'リロード時間-30%。', GUNLIKE],
    ['g_dual', 'mag', 'デュアルマガジン', '📚', 'uncommon', 280, { reload: 0.8, mag: 1.15 }, 'dual', 'リロード時間-20%、装弾数+15%。', GUNLIKE],
    ['g_bottom', 'mag', '底なしの弾倉', '♾️', 'legendary', 650, { mag: 1.5, 'ammoSave+': 0.2 }, 'infdrum', '装弾数+50%、20%の確率で弾を消費しない。', GUNLIKE],
    ['u_vgrip', 'under', 'バーティカルグリップ', '✊', 'common', 200, { recoil: 0.8 }, 'vgrip', '反動-20%。', GUNLIKE],
    ['u_agrip', 'under', 'アングルグリップ', '🤚', 'common', 200, { adsTime: 0.75 }, 'agrip', 'ADS速度+25%。', GUNLIKE],
    ['u_laser', 'under', 'タクティカルレーザー', '🔦', 'uncommon', 260, { spread: 0.65 }, 'laser', '腰だめ射撃の拡散-35%。', GUNLIKE],
    ['u_bipod', 'under', 'バイポッド', '🦵', 'uncommon', 240, { 'crouchRecoil+': 0.5 }, 'bipod', 'しゃがみ時の反動-50%。', GUNLIKE],
    ['u_stab', 'under', 'ジャイロスタビライザー', '🧭', 'rare', 380, { recoil: 0.7, spread: 0.85 }, 'gyro', '反動-30%、拡散-15%。', GUNLIKE],
    ['k_light', 'stock', 'ライトストック', '🪶', 'common', 180, { moveMul: 1.06, adsTime: 0.9 }, 'light', '移動速度+6%。', GUNLIKE],
    ['k_heavy', 'stock', 'ヘビーストック', '🪵', 'common', 200, { recoil: 0.75, moveMul: 0.97 }, 'heavy', '反動-25%。', GUNLIKE],
    ['k_tac', 'stock', 'タクティカルストック', '🛡️', 'uncommon', 260, { 'moveSpread+': -0.35 }, 'tac', '移動中の拡散-35%。', GUNLIKE],
    ['k_skel', 'stock', 'スケルトンストック', '🦴', 'rare', 340, { moveMul: 1.08, adsTime: 0.8, 'sprintFire+': 1 }, 'skel', '機動力向上。ダッシュ後すぐ撃てる。', GUNLIKE],
    ['a_hollow', 'ammo', 'ホローポイント弾', '🔸', 'common', 240, { dmg: 1.12, shieldMul: 0.6 }, null, 'ダメージ+12%（シールドへは-40%）。', NOT_PROJ],
    ['a_ap', 'ammo', '徹甲弾', '🔷', 'uncommon', 300, { shieldMul: 1.9 }, null, 'シールドへのダメージ+90%。', GUNLIKE],
    ['a_fire', 'ammo', '焼夷弾', '🔥', 'uncommon', 320, { 'elem': 'fire', 'elemChance+': 0.3 }, null, '30%で炎上付与。', GUNLIKE],
    ['a_cryo', 'ammo', '冷凍弾', '❄️', 'uncommon', 320, { 'elem': 'frost', 'elemChance+': 0.3 }, null, '30%で冷気付与。', GUNLIKE],
    ['a_toxic', 'ammo', '毒弾', '☠️', 'uncommon', 320, { 'elem': 'poison', 'elemChance+': 0.35 }, null, '35%で毒付与。', GUNLIKE],
    ['a_shock', 'ammo', '電撃弾', '⚡', 'rare', 360, { 'elem': 'shock', 'elemChance+': 0.25, shieldMul: 1.3 }, null, '25%で電撃付与、シールド+30%。', GUNLIKE],
    ['a_explo', 'ammo', '炸裂弾頭', '💥', 'epic', 520, { 'explo+': 1 }, null, '着弾時に小爆発（半径1.5m）。', NOT_PROJ],
    ['a_rico', 'ammo', '跳弾弾', '↪️', 'rare', 380, { 'ricochet+': 0.35 }, null, '35%で近くの敵へ跳弾。', NOT_PROJ],
    ['a_silver', 'ammo', '銀の弾丸', '🥈', 'rare', 400, { 'eliteDmg+': 0.25 }, null, '精鋭・ボスへのダメージ+25%。', GUNLIKE],
    ['a_slug', 'ammo', 'スラッグ弾', '⚫', 'uncommon', 260, { 'slug+': 1 }, null, '散弾を一発の重い弾に変える（射程・精度大幅向上）。', SHOTGUN],
    ['a_pierce', 'ammo', '貫通弾', '➶', 'rare', 420, { 'pierce+': 1 }, null, '敵を1体追加で貫通。', GUNLIKE],
    ['a_bleed', 'ammo', '鋸歯弾', '🩸', 'uncommon', 280, { 'elem': 'bleed', 'elemChance+': 0.3 }, null, '30%で出血付与。', GUNLIKE],
    ['a_vamp', 'ammo', '吸血弾', '🦇', 'epic', 560, { 'lifesteal+': 0.03 }, null, '与ダメの3%を回復。', GUNLIKE],
    ['o_reflex', 'optic', 'リフレックスサイト', '🟠', 'common', 190, { zoom: 1.08, adsTime: 0.8, adsSpread: 0.9 }, 'reddot', '素早く構えられ、ADS時の拡散-10%。', GUNLIKE],
    ['o_marksman', 'optic', 'マークスマンスコープ', '🔍', 'rare', 400, { zoom: 2.0, headMul: 1.12, adsSpread: 0.8, range: 1.15 }, 'scope', '射程+15%、ヘッドショット倍率+12%。（ハンドガン・ショットガン不可）', LONGGUN],
    ['m_amp', 'muzzle', '増幅マズル', '🔊', 'uncommon', 250, { dmg: 1.1, recoil: 1.1 }, 'amp', 'ダメージ+10%、反動+10%。', GUNLIKE],
    ['b_ceramic', 'barrel', 'セラミックバレル', '🏺', 'uncommon', 290, { range: 1.2, spread: 0.85 }, null, '射程+20%、拡散-15%。', GUNLIKE],
    ['g_belt', 'mag', '給弾ベルト', '🎗️', 'rare', 360, { mag: 1.3, reload: 0.85 }, 'belt', '装弾数+30%、リロード時間-15%。', GUNLIKE],
    ['u_handstop', 'under', 'ハンドストップ', '🖐️', 'common', 190, { recoil: 0.85, spread: 0.92 }, 'handstop', '反動-15%、拡散-8%。', GUNLIKE],
    ['k_cheek', 'stock', 'チークレスト', '🧣', 'uncommon', 250, { adsSpread: 0.8, recoil: 0.9 }, 'cheek', 'ADS時の拡散-20%、反動-10%。', GUNLIKE],
    ['a_tracer', 'ammo', '曳光弾', '✨', 'common', 230, { dmg: 1.06, 'eliteDmg+': 0.1 }, null, 'ダメージ+6%、精鋭・ボスへのダメージ+10%。', GUNLIKE],
    ['a_hunter', 'ammo', '狩猟弾', '🏹', 'rare', 380, { 'eliteDmg+': 0.2, headMul: 1.1 }, null, '精鋭・ボスへのダメージ+20%、ヘッドショット倍率+10%。', GUNLIKE],
    ['t_match', 'trigger', '競技用トリガー', '🏁', 'uncommon', 280, { spread: 0.9, rpm: 1.06 }, null, '拡散-10%、連射速度+6%。', GUNLIKE],
    ['t_hair', 'trigger', 'ヘアトリガー', '☝️', 'common', 200, { rpm: 1.12 }, null, '連射速度+12%。', GUNLIKE],
    ['t_auto', 'trigger', 'フルオート化キット', '🔁', 'rare', 450, { 'auto+': 1, rpm: 1.1 }, null, 'セミオート武器をフルオート化。', SEMI],
    ['t_bolt', 'trigger', 'ラピッドボルト', '🔩', 'rare', 380, { rpm: 1.3 }, null, '連射速度+30%（ボルト/ポンプ式向け）。', (w) => w.rpm < 160],
    ['t_crit', 'trigger', '必殺の引鉄', '💢', 'epic', 500, { critChance: 0.1 }, null, '会心率+10%。', GUNLIKE],
    ['t_charge', 'trigger', 'チャージコイル', '🔋', 'rare', 360, { charge: 0.6 }, null, 'チャージ時間-40%。', (w) => !!w.charge],
    ['t_spin', 'trigger', 'プレスピンモーター', '🌀', 'rare', 360, { spinup: 0.4 }, null, '回転開始時間-60%。', (w) => !!w.spinup],
    ['g_fuel', 'mag', '大型燃料タンク', '🛢️', 'uncommon', 280, { mag: 1.6 }, 'tank', '燃料容量+60%。', (w) => !!w.flame],
    ['m_nozzle', 'muzzle', '拡散ノズル', '🌬️', 'uncommon', 260, { range: 1.35, dmg: 1.1 }, 'nozzle', '火炎射程+35%、ダメージ+10%。', (w) => !!w.flame],
    ['b_blast', 'barrel', '高圧発射筒', '🎇', 'rare', 380, { 'explodeR+': 1.2, dmg: 1.1 }, null, '爆発半径+1.2m、ダメージ+10%。', (w) => !!(w.proj && w.proj.explode)],
  ];
  const ATTACHMENTS = AT.map(([id, slot, name, icon, rarity, price, mods, visual, desc, compat]) => ({ id, slot, name, icon, rarity, price, mods, visual, desc, compat, kind: 'attachment' }));
  G.ATT_SLOTS = SLOT;
  G.ATTACHMENTS = ATTACHMENTS;
  G.ATT_BY_ID = Object.fromEntries(ATTACHMENTS.map((a) => [a.id, a]));

  // ---------- melee weapons (slot 3) ----------
  // dmg: light swing, swing: seconds per light swing, range: reach (m), arc: min dot to hit (lower = wider),
  // heavy: [dmg multiplier, wind-up s, recovery s], moveMul: movement while wielded, model: viewmodel shape
  // guard: [share of damage cut, how much it can cut (x max HP) before it runs dry, half-angle of the front it covers (deg)]; none = cannot guard
  const MPRICE = { common: 700, uncommon: 1000, rare: 1500, epic: 2200, legendary: 3200 };
  const MCAT = { fist: '格闘', knife: 'ナイフ', blade: '刀剣', axe: '斧', blunt: '打撃', spear: '長柄', scythe: '大鎌' };
  const ML = [
    // the starting melee weapon. Same overall strength as the old bare fists (light DPS ~67, heavy ~73/s, same move speed):
    // a little more reach and faster swings, but a narrower arc, lighter knockback and smaller hits
    ['m_basic', 'サバイバルナイフ', '🔪', 'common', 'knife', { guard: [0.4, 0.35, 50], dmg: 20, swing: 0.3, range: 2.5, arc: 0.66, heavy: [2.75, 0.34, 0.41], moveMul: 1.12, knock: 3 }, null, 'sknife', '最初から持っている頑丈なナイフ。素早い連撃と少し長いリーチ。右クリックで深く突き刺す。'],
    // bare hands when no melee weapon is held (weaker than the starting knife)
    ['fists', '素手', '👊', 'common', 'fist', { dmg: 12, swing: 0.38, range: 2.0, arc: 0.6, heavy: [2.2, 0.38, 0.45], moveMul: 1.12, knock: 3 }, null, 'fists', '近接武器を持たない素手の状態。リーチが短く威力も控えめだが、右クリックでストレートを放てる。'],
    ['m_knife', 'コンバットナイフ', '🔪', 'common', 'knife', { guard: [0.3, 0.3, 45], dmg: 36, swing: 0.3, range: 2.5, arc: 0.62, heavy: [2.8, 0.32, 0.4], moveMul: 1.16, knock: 3, critChance: 0.1 }, null, 'knife', '軍用の頑丈なナイフ。最速の連撃と高い機動力。'],
    ['m_kukri', 'ククリ', '🗡️', 'uncommon', 'knife', { guard: [0.4, 0.35, 50], dmg: 46, swing: 0.36, range: 2.6, arc: 0.55, heavy: [2.8, 0.36, 0.45], moveMul: 1.14, knock: 4, elem: 'bleed', elemChance: 0.45 }, null, 'kukri', '湾曲した刃が肉を裂き、出血を付与する。'],
    ['m_machete', 'マチェーテ', '🗡️', 'common', 'blade', { guard: [0.5, 0.5, 60], dmg: 50, swing: 0.44, range: 2.8, arc: 0.35, heavy: [2.6, 0.42, 0.5], moveMul: 1.12, knock: 5 }, 'sweep', 'machete', '幅広の山刀。横薙ぎで複数の敵を巻き込む。'],
    ['m_katana', '打刀「時雨」', '⚔️', 'rare', 'blade', { guard: [0.65, 0.5, 55], dmg: 66, swing: 0.4, range: 3.0, arc: 0.5, heavy: [3.0, 0.3, 0.55], moveMul: 1.14, knock: 4, critChance: 0.12 }, 'lunge', 'katana', '重撃は踏み込みの居合。一瞬で間合いを詰めて斬り抜ける。'],
    ['m_rapier', 'レイピア', '🤺', 'rare', 'blade', { guard: [0.45, 0.4, 40], dmg: 42, swing: 0.27, range: 3.2, arc: 0.75, heavy: [3.2, 0.3, 0.4], moveMul: 1.15, knock: 2, critChance: 0.3, headMul: 2.2 }, null, 'rapier', '細身の刺突剣。会心率+30%、頭部への突きは2.2倍。'],
    ['m_axe', '戦斧', '🪓', 'uncommon', 'axe', { guard: [0.55, 0.75, 60], dmg: 78, swing: 0.62, range: 2.8, arc: 0.45, heavy: [3.0, 0.55, 0.65], moveMul: 1.08, knock: 9, shieldMul: 1.8 }, null, 'axe', '重い斧刃でシールドを叩き割る（シールドへ+80%）。'],
    ['m_hammer', '戦鎚', '🔨', 'rare', 'blunt', { guard: [0.6, 1.0, 65], dmg: 92, swing: 0.72, range: 2.7, arc: 0.4, heavy: [2.6, 0.62, 0.7], moveMul: 1.05, knock: 14, shieldMul: 1.4 }, 'quake', 'hammer', '重撃で地面を叩き、周囲に衝撃波とスタンを起こす。'],
    ['m_spear', '長槍', '🔱', 'uncommon', 'spear', { guard: [0.5, 0.6, 50], dmg: 58, swing: 0.5, range: 4.3, arc: 0.82, heavy: [2.7, 0.45, 0.5], moveMul: 1.1, knock: 7 }, 'pierceLine', 'spear', '長いリーチの刺突。直線上の敵をまとめて貫く。'],
    ['m_frost', '氷牙の短剣', '❄️', 'rare', 'knife', { guard: [0.3, 0.3, 45], dmg: 40, swing: 0.3, range: 2.5, arc: 0.6, heavy: [2.8, 0.32, 0.4], moveMul: 1.16, knock: 3, elem: 'frost', elemChance: 0.6 }, null, 'frostknife', '冷気の刃。斬るたびに敵を凍てつかせる。'],
    ['m_ember', '焔刃「緋桜」', '🔥', 'epic', 'blade', { guard: [0.5, 0.5, 55], dmg: 72, swing: 0.42, range: 3.0, arc: 0.45, heavy: [2.8, 0.42, 0.5], moveMul: 1.13, knock: 5, elem: 'burn', elemChance: 0.7 }, 'flameWave', 'emberblade', '燃え盛る刀身。重撃は前方へ炎の斬撃波を放つ。'],
    ['m_venom', '毒蛇の双短剣', '🐍', 'epic', 'knife', { dmg: 30, swing: 0.2, range: 2.4, arc: 0.6, heavy: [3.4, 0.28, 0.35], moveMul: 1.18, knock: 2, elem: 'poison', elemChance: 0.8 }, null, 'twin', '左右交互の超高速連撃。猛毒を重ねる。'],
    ['m_scythe', '死神の大鎌', '💀', 'epic', 'scythe', { guard: [0.4, 0.55, 75], dmg: 84, swing: 0.6, range: 3.4, arc: -0.1, heavy: [2.6, 0.5, 0.6], moveMul: 1.08, knock: 6, lifesteal: 0.06 }, 'reap', 'scythe', '周囲ほぼ全方位を刈り取る。与ダメの6%を吸収。重撃は処刑の一閃。'],
    ['m_thunder', '雷槌「鳴神」', '⚡', 'legendary', 'blunt', { guard: [0.55, 0.8, 60], dmg: 105, swing: 0.68, range: 2.9, arc: 0.4, heavy: [2.8, 0.55, 0.6], moveMul: 1.07, knock: 12, elem: 'shock', elemChance: 0.6, shieldMul: 2.0 }, 'thunder', 'thunder', '雷を纏う戦鎚。命中で雷撃が連鎖し、重撃は落雷を呼ぶ。'],
    ['m_devour', '神器「喰魂の大鎌」', '🌑', 'legendary', 'scythe', { guard: [0.35, 0.45, 75], dmg: 95, swing: 0.55, range: 3.6, arc: -0.15, heavy: [2.8, 0.45, 0.55], moveMul: 1.1, knock: 6, lifesteal: 0.04 }, 'devour', 'scythe', '変異した敵を喰らうほど強くなる（エリア内で最大10重・1重につき+8%、HP5%回復）。'],
    ['m_midas', '神器「黄金の拳」', '🥇', 'legendary', 'fist', { guard: [0.7, 0.5, 50], dmg: 60, swing: 0.3, range: 2.5, arc: 0.6, heavy: [3.0, 0.35, 0.4], moveMul: 1.15, knock: 8, critChance: 0.15 }, 'midas', 'fists', '殴るたびにコインがこぼれる。重撃はコイン50枚を込めて威力3倍。'],
    // shields: the left hand holds a shield, the right a short weapon. Built to hold the line; their attacks are modest
    ['m_buckler', '騎士の円盾', '🛡️', 'uncommon', 'blade', { guard: [0.8, 1.3, 80], dmg: 40, swing: 0.42, range: 2.6, arc: 0.5, heavy: [2.4, 0.4, 0.5], moveMul: 1.08, knock: 6 }, 'bash', 'buckler', '小ぶりな円盾と片手剣。広い角度を受け止め、重撃は盾で殴りつけて怯ませる。'],
    ['m_tower', '城壁の大盾', '🧱', 'rare', 'blunt', { guard: [0.92, 2.0, 70], dmg: 62, swing: 0.7, range: 2.6, arc: 0.4, heavy: [2.6, 0.6, 0.65], moveMul: 1.0, knock: 12, shieldMul: 1.3 }, 'bash', 'tower', '身の丈ほどの鉄の大盾と短い戦鎚。ほとんどの攻撃を受け止めるが、振りは重い。重撃は盾の体当たり。'],
    ['m_holy', '聖剣「黎明」', '✨', 'legendary', 'blade', { guard: [0.55, 0.65, 60], dmg: 88, swing: 0.4, range: 3.2, arc: 0.45, heavy: [2.6, 0.38, 0.45], moveMul: 1.14, knock: 6, critChance: 0.1 }, 'beam', 'holy', '光の聖剣。重撃で貫通する光の斬撃を飛ばす。'],
  ];
  const MTRAIT = {
    sweep: '横薙ぎ：攻撃範囲が広い', lunge: '居合：重撃で前方へ踏み込む', quake: '地震：重撃で周囲に衝撃波＋スタン', pierceLine: '貫通：直線上の敵をまとめて貫く',
    flameWave: '炎波：重撃で炎の斬撃波を放つ', bash: '盾撃：重撃で盾を叩きつけ、長く怯ませる', devour: '喰魂：変異体を倒すほど強化', midas: '黄金：殴るとコイン、重撃でコインを消費して威力3倍', reap: '刈取：ほぼ全方位攻撃・吸血', thunder: '落雷：連鎖雷、重撃で落雷', beam: '光刃：重撃で貫通する光の斬撃',
  };
  G.MELEE = ML.map(([id, name, icon, rarity, mcat, s, trait, model, desc]) => Object.assign({ id, name, icon, rarity, mcat, cat: MCAT[mcat], trait, traitDesc: trait ? MTRAIT[trait] : null, model, desc, kind: 'melee', price: id === 'fists' || id === 'm_basic' ? 0 : MPRICE[rarity] + Math.round(s.dmg / s.swing / 10) * 10, critChance: 0, headMul: 1.5, shieldMul: 1, lifesteal: 0, elem: null, elemChance: 0 }, s));
  for (const m of G.MELEE) if (m.id === 'm_devour' || m.id === 'm_midas') { m.mythic = true; m.price = m.id === 'm_devour' ? 9500 : 6500; }
  G.MELEE_BY_ID = Object.fromEntries(G.MELEE.map((m) => [m.id, m]));
  G.DEFAULT_MELEE = 'm_basic';
  G.BARE_MELEE = 'fists';
  G.MELEE_BY_ID.fists.legacy = true;
  G.isDefaultMelee = (id) => id === G.DEFAULT_MELEE || id === 'fists';
})();
