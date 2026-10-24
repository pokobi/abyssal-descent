'use strict';
// Per-skill augments: every skill and ultimate has its own upgrades (power / cooldown / area / duration
// plus unique effects), the same way the pile driver does. They are only offered while you own that skill,
// and are offered more often than other boons. Their effects are read with A.skm(skillId).
(function () {
  const A = G.abilities;
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, C;
  const env = () => { P = G.player; C = G.combat; };

  // ---- the skill that is currently dealing damage (set while casting; stamped onto zones / projectiles / allies) ----
  A.withSk = function (id, fn) { return function () { env(); const o = C.curSk; C.curSk = id; try { return fn.apply(this, arguments); } finally { C.curSk = o; } }; };
  A.later = (id, fn, ms) => setTimeout(A.withSk(id, fn), ms);

  // ---- aggregated per-skill modifiers (cached until the next recalc) ----
  const ZERO = { get: (o, k) => (typeof k === 'string' ? o[k] || 0 : undefined) };
  A.skm = function (id) {
    env();
    const cache = P._skm || (P._skm = {});
    if (cache[id]) return cache[id];
    const o = {};
    for (const [bid, n] of P.buffs) { const b = G.BUFF_BY_ID[bid]; if (b && b.skill === id) for (const k in b.sm) o[k] = (o[k] || 0) + b.sm[k] * n; }
    return (cache[id] = new Proxy(o, ZERO));
  };

  // ---- shared effects (on hit / on cast), described automatically ----
  const OH = {
    oh_burn: '命中した敵を炎上させる。', oh_frost: '命中した敵に冷気を付与し鈍らせる。', oh_poison: '命中した敵を毒に侵す。',
    oh_shock: '命中時35%で近くの敵2体へ雷撃が連鎖する。', oh_stun: '命中した敵を0.8秒スタンさせる（同じ敵には2秒に1回・ボス無効）。',
    oh_vamp: 'このスキルの与ダメの6%を回復する。', oh_mark: '命中した敵に3秒間の刻印（受けるダメージ+60%）。',
    oh_blast: '命中時30%で小爆発（与ダメの40%）が起きる。', oh_exec: 'HP12%以下になった通常敵を即死させる。',
    oc_heal: '使用時、HP12＋最大HPの4%を回復。', oc_shield: '使用時、6秒間だけ持続するシールド+25。', oc_dmg: '使用後4秒間、与ダメ+15%。',
    oc_haste: '使用後3秒間、移動速度+25%。', oc_ammo: '使用時、構えている武器のマガジンを満タンにする。', oc_echo: '使用時20%でクールタイムが発生しない。',
    oc_nova: '使用時、自分の周囲5mに衝撃波（80ダメージ）を放つ。',
  };
  C = G.combat;
  G.combat.skOnHit = function (e, dealt, id, info) {
    env();
    const m = A.skm(id);
    const base = { src: 'skill', proc: true, noSkOn: true, noMarker: true };
    if (m.oh_burn) C.status(e, 'burn', 2 * m.oh_burn);
    if (m.oh_frost) C.status(e, 'frost', 2 * m.oh_frost);
    if (m.oh_poison) C.status(e, 'poison', 2 * m.oh_poison);
    if (m.oh_mark && e.alive) C.status(e, 'mark', 3);
    if (m.oh_stun && e.alive && !e.boss && G.game.time - (e._skStunT || -9) > 2) { e._skStunT = G.game.time; C.stun(e, 0.8 * m.oh_stun); }
    if (m.oh_vamp) C.heal(dealt * 0.06 * m.oh_vamp, true);
    if (m.oh_shock && e.alive && Math.random() < 0.35 * m.oh_shock) C.chain(e, 2, dealt * 0.3, 8, base);
    if (m.oh_blast && G.game.time - (e._skBlastT || -9) > 0.6 && Math.random() < 0.3 * m.oh_blast) { e._skBlastT = G.game.time; C.explode(e.centerPos(), 3, dealt * 0.4, Object.assign({ small: true, color: 0xffa050 }, base)); }
    if (m.oh_exec && e.alive && !e.boss && e.hp < e.maxHp * 0.12 * m.oh_exec) { G.fx.dmgNum(e.centerPos(), '処刑', 'crit'); C.damageEnemy(e, e.hp + e.shield + 1, base); }
  };
  // returns true when the cooldown should be skipped
  G.combat.skOnCast = function (id) {
    env();
    const m = A.skm(id), st = P.stats;
    if (m.oc_heal) C.heal((12 + st.maxHp * 0.04) * m.oc_heal);
    if (m.oc_shield) C.timedShield(25 * m.oc_shield, 6, 150);
    if (m.oc_dmg) C.temp('skd_' + id, 4, { dmg: 0.15 * m.oc_dmg }, '⚔️');
    if (m.oc_haste) C.temp('skh_' + id, 3, { moveSpeed: 0.25 * m.oc_haste }, '👟');
    if (m.oc_ammo) { const w = P.weapons[P.wIdx]; if (w && w.mag !== undefined) { w.mag = G.weapons.stats(w).mag; G.sfx.mech('magIn'); } }
    if (m.oc_nova) { C.explode(P.pos.clone().add(V(0, 1, 0)), 5, C.scale(80) * m.oc_nova, { src: 'skill', sk: id, color: 0xffe0a0, knock: 10 }); }
    if (m.oc_echo && Math.random() < 0.2 * m.oc_echo) { G.ui.toastSmall('🔁 残響：クールタイムなし'); return true; }
    return false;
  };

  // ---- definitions ----
  // generic per-skill upgrades are generated from the skill's parameters; uniques are listed below
  const NODMG = new Set(['dash', 'blink', 'chrono', 'healaura', 'berserk', 'barrier', 'cloak', 'overdrive', 'ricostorm', 'haste', 'rewind', 'warcry', 'thornarmor', 'flight', 'mark', 'harvest',
    'ult_bastion', 'ult_timestop', 'ult_berserk', 'ult_armory', 'ult_shadow', 'ult_overcharge', 'ult_titan', 'ult_execution']);
  // [key, name, icon, rarity, sm, desc?]  (desc defaults to the shared description of the sm keys)
  const UQ = {
    dash: [['x_fire', '炎の轍', '🔥', 'rare', { x_fire: 1 }, '突進した跡に3秒間燃える炎を残す。'], ['x_hit', '突進撃', '💥', 'uncommon', { x_hit: 1 }, '突進中に触れた敵へダメージ＋吹き飛ばし。'], ['charges', '予備の脚', '🦵', 'rare', { charges: 1 }, 'チャージ数+1。'], ['oc_ammo', '疾走装填', '♻️', 'uncommon', { oc_ammo: 1 }], ['oc_shield', '受け身', '🛡️', 'uncommon', { oc_shield: 1 }]],
    dash2: [['charges', '迅雷の脚', '🦵', 'rare', { charges: 1 }, 'チャージ数+1。'], ['x_fire', '雷火の轍', '🔥', 'rare', { x_fire: 1 }, '突進した跡に3秒間燃える炎を残す。'], ['oh_stun', '痺れる突進', '💫', 'uncommon', { oh_stun: 1 }], ['oc_dmg', '雷速の昂り', '⚔️', 'uncommon', { oc_dmg: 1 }], ['x_after', '残雷', '🌩️', 'epic', { x_after: 1 }, '突進の出発点に雷の爆発（80ダメージ）を残す。']],
    blink: [['charges', '連続転移', '✨', 'rare', { charges: 1 }, 'チャージ数+1（連続で使える）。'], ['x_arrive', '転移衝撃', '💥', 'rare', { x_arrive: 1 }, '転移先で衝撃波（半径4m・100ダメージ）を起こす。'], ['x_frost', '置き土産', '❄️', 'uncommon', { x_frost: 1 }, '転移元に4秒間の冷気の場を残す。'], ['oc_shield', '残像の盾', '🛡️', 'uncommon', { oc_shield: 1 }], ['oc_dmg', '奇襲', '⚔️', 'uncommon', { oc_dmg: 1 }]],
    chrono: [['x_deep', '深き停滞', '🕸️', 'rare', { x_deep: 1 }, '減速が60%→80%になる。'], ['x_self', '時の加護', '🏃', 'rare', { x_self: 1 }, '効果中、自分の移動速度+20%・連射速度+20%。'], ['x_vuln', '時の刃', '🗡️', 'epic', { x_vuln: 1 }, '効果中、与ダメ+25%。'], ['oc_heal', '時の癒し', '💚', 'uncommon', { oc_heal: 1 }]],
    shockwave: [['oh_stun', '衝撃の痺れ', '💫', 'uncommon', { oh_stun: 1 }], ['x_double', '二重衝撃', '🌊', 'epic', { x_double: 1 }, '0.4秒後にもう一度衝撃波を放つ（70%）。'], ['oh_mark', '鎧砕き', '🎯', 'rare', { oh_mark: 1 }], ['x_full', '全周衝撃', '⭕', 'uncommon', { x_full: 1 }, '前方だけでなく全方位に衝撃波を放つ。'], ['oc_shield', '反動の盾', '🛡️', 'uncommon', { oc_shield: 1 }]],
    emp: [['x_stunall', '過負荷', '💫', 'epic', { x_stunall: 1 }, 'シールドの無い敵も1.2秒スタンさせる（ボス無効）。'], ['x_absorb', '吸電', '🔋', 'rare', { x_absorb: 1 }, '命中した敵1体につき、8秒間持続するシールド+6（最大60）。'], ['oh_shock', '放電', '⚡', 'rare', { oh_shock: 1 }], ['oh_mark', '回路焼損', '🎯', 'uncommon', { oh_mark: 1 }]],
    chain: [['x_jumps', '分岐雷', '⚡', 'rare', { x_jumps: 1 }, '連鎖数+3。'], ['oh_stun', '感電麻痺', '💫', 'uncommon', { oh_stun: 1 }], ['oh_mark', '雷の刻印', '🎯', 'uncommon', { oh_mark: 1 }], ['oh_blast', '雷爆', '💥', 'epic', { oh_blast: 1 }], ['oc_echo', '連撃の雷', '🔁', 'rare', { oc_echo: 1 }]],
    chain2: [['x_jumps', '万雷', '⚡', 'rare', { x_jumps: 1 }, '連鎖数+3。'], ['oh_stun', '神罰の痺れ', '💫', 'uncommon', { oh_stun: 1 }], ['oh_blast', '雷爆', '💥', 'epic', { oh_blast: 1 }], ['oh_vamp', '雷吸', '🩸', 'rare', { oh_vamp: 1 }], ['oc_dmg', '雷神の昂り', '⚔️', 'uncommon', { oc_dmg: 1 }]],
    firestorm: [['x_pull', '炎の竜巻', '🌪️', 'epic', { x_pull: 1 }, '炎の渦が周囲の敵を中心へ吸い寄せる。'], ['x_twin', '双炎', '🔥', 'rare', { x_twin: 1 }, '自分の足元にも小さな炎の渦を生む。'], ['oh_blast', '延焼爆発', '💥', 'epic', { oh_blast: 1 }], ['oh_vamp', '焔吸', '🩸', 'rare', { oh_vamp: 1 }]],
    frostnova: [['x_shatter', '砕氷', '💠', 'epic', { x_shatter: 1 }, '1.2秒後、凍った敵が砕けて同じダメージをもう一度受ける。'], ['x_armor', '氷鎧', '🛡️', 'uncommon', { x_armor: 1 }, '使用後5秒間、被ダメ-25%。'], ['oh_mark', '凍傷', '🎯', 'rare', { oh_mark: 1 }], ['x_zone', '永久凍土', '❄️', 'uncommon', { x_zone: 1 }, '残る冷気の場が広く、8秒間持続する。']],
    gravity: [['x_crush', '超圧壊', '🕳️', 'epic', { x_crush: 1 }, '最後の圧壊のダメージ+60%・範囲+40%。'], ['x_tear', '引き裂く重力', '🌀', 'rare', { x_tear: 1 }, '吸い込んでいる間も毎秒40ダメージ。'], ['oh_stun', '余震', '💫', 'uncommon', { oh_stun: 1 }], ['oh_mark', '歪む装甲', '🎯', 'uncommon', { oh_mark: 1 }]],
    healaura: [['x_potent', '癒しの奔流', '💚', 'rare', { x_potent: 1 }, '回復量+60%。'], ['x_armor', '守護の泉', '🛡️', 'rare', { x_armor: 1 }, '被ダメ軽減が20%→35%。'], ['x_follow', '巡る泉', '🚶', 'epic', { x_follow: 1 }, '泉が自分についてくる。'], ['x_purge', '浄化', '✨', 'uncommon', { x_purge: 1 }, '使用時、自分の状態異常を全て治す。'], ['oc_shield', '泉の守り', '🛡️', 'uncommon', { oc_shield: 1 }]],
    drain: [['x_heal', '貪食', '🩸', 'rare', { x_heal: 1 }, '回復率が50%→80%。'], ['x_over', '余剰の血', '🛡️', 'epic', { x_over: 1 }, 'HPが満タンを超えた分を、8秒間持続するシールドにする（最大80）。'], ['oh_poison', '枯死', '☠️', 'uncommon', { oh_poison: 1 }], ['oh_mark', '生命の刻印', '🎯', 'uncommon', { oh_mark: 1 }]],
    turret: [['x_twin', '双弩', '🏹', 'epic', { x_twin: 1 }, '弩砲を2基設置する。'], ['x_rapid', '速射機構', '⚙️', 'rare', { x_rapid: 1 }, '弩砲の連射速度+50%。'], ['oh_blast', '炸裂矢', '💥', 'rare', { oh_blast: 1 }], ['oh_frost', '凍て矢', '❄️', 'uncommon', { oh_frost: 1 }], ['oh_poison', '毒矢', '☠️', 'uncommon', { oh_poison: 1 }]],
    mines: [['x_more', '大量散布', '⚙️', 'rare', { x_more: 1 }, '地雷の数+3。'], ['x_cluster', '子爆弾', '💣', 'epic', { x_cluster: 1 }, '地雷の爆発で3つの子爆弾が飛び散る。'], ['oh_burn', '焼夷地雷', '🔥', 'uncommon', { oh_burn: 1 }], ['oh_stun', '衝撃地雷', '💫', 'uncommon', { oh_stun: 1 }]],
    meteor: [['x_shower', '流星群', '🌠', 'epic', { x_shower: 1 }, '周囲にさらに2つの小隕石（50%）が落ちる。'], ['x_crater', '灼熱の火口', '🔥', 'rare', { x_crater: 1 }, '落下地点に5秒間燃える火口を残す。'], ['oh_stun', '衝突の衝撃', '💫', 'uncommon', { oh_stun: 1 }], ['oh_mark', '星の刻印', '🎯', 'uncommon', { oh_mark: 1 }]],
    spear: [['x_triple', '三叉', '🔱', 'epic', { x_triple: 1 }, '扇状に3本投げる（左右は70%）。'], ['oh_stun', '串刺し', '💫', 'uncommon', { oh_stun: 1 }], ['oh_mark', '刻む穂先', '🎯', 'uncommon', { oh_mark: 1 }], ['oh_blast', '炸裂槍', '💥', 'rare', { oh_blast: 1 }], ['oh_vamp', '血吸いの槍', '🩸', 'rare', { oh_vamp: 1 }]],
    spikes: [['x_triple', '茨の扇', '⛰️', 'epic', { x_triple: 1 }, '扇状に3列の棘を突き出す。'], ['oh_stun', '打ち上げ', '💫', 'uncommon', { oh_stun: 1 }], ['oh_poison', '毒棘', '☠️', 'uncommon', { oh_poison: 1 }], ['oh_mark', '裂傷', '🎯', 'uncommon', { oh_mark: 1 }]],
    berserk: [['x_fury', '怒髪天', '😡', 'rare', { x_fury: 1 }, '与ダメ+50%→+80%。'], ['x_guard', '鋼の怒り', '🛡️', 'rare', { x_guard: 1 }, '効果中、被ダメ-20%。'], ['oc_heal', '血潮', '💚', 'uncommon', { oc_heal: 1 }], ['x_speed', '猛進', '🏃', 'uncommon', { x_speed: 1 }, '効果中、移動速度+25%。']],
    barrier: [['x_wide', '城壁', '🧱', 'uncommon', { x_wide: 1 }, '壁の幅+60%・高さ+30%。'], ['x_spikes', '棘の壁', '🌵', 'rare', { x_spikes: 1 }, '壁の周囲3mの敵に毎秒40ダメージ。'], ['x_heal', '癒しの壁', '💚', 'rare', { x_heal: 1 }, '壁の近くにいる間、毎秒HP6回復。'], ['oc_shield', '盾の構え', '🛡️', 'uncommon', { oc_shield: 1 }]],
    decoy: [['x_twin', '双子の幻', '🎭', 'rare', { x_twin: 1 }, '囮を2体生み出す。'], ['x_nova', '大爆発', '💥', 'rare', { x_nova: 1 }, '消滅時の爆発の範囲+60%・ダメージ+50%。'], ['x_cloak', '身代わり', '👻', 'epic', { x_cloak: 1 }, '使用時、2.5秒間透明になる。'], ['oh_stun', '幻惑', '💫', 'uncommon', { oh_stun: 1 }]],
    cloak: [['x_assassin', '暗殺術', '🗡️', 'epic', { x_assassin: 1 }, '透明中、会心ダメージ+100%。'], ['x_speed', '影走り', '🏃', 'uncommon', { x_speed: 1 }, '透明中、移動速度+30%。'], ['x_heal', '影の癒し', '💚', 'rare', { x_heal: 1 }, '透明中、毎秒最大HPの4%回復。'], ['x_smoke', '煙幕', '💨', 'uncommon', { x_smoke: 1 }, '使用時、足元に煙幕を張る。']],
    overdrive: [['x_rate', '過熱', '🔥', 'rare', { x_rate: 1 }, '連射速度+60%→+90%。'], ['x_dmg', '徹甲弾', '🎯', 'rare', { x_dmg: 1 }, '効果中、与ダメ+20%。'], ['x_reload', '全弾装填', '♻️', 'uncommon', { x_reload: 1 }, '使用時、全ての武器のマガジンを満タンにする。'], ['oc_haste', '突撃', '👟', 'uncommon', { oc_haste: 1 }]],
    blades: [['x_more', '刃の追加', '🌀', 'rare', { x_more: 1 }, '刃の数+3。'], ['x_wide', '大旋風', '⭕', 'uncommon', { x_wide: 1 }, '刃の回転半径+1.5m。'], ['oh_burn', '炎刃', '🔥', 'uncommon', { oh_burn: 1 }], ['oh_frost', '氷刃', '❄️', 'uncommon', { oh_frost: 1 }], ['oh_vamp', '吸血刃', '🩸', 'rare', { oh_vamp: 1 }]],
    leap: [['x_far', '大跳躍', '🦘', 'uncommon', { x_far: 1 }, '跳躍距離+40%。'], ['oh_stun', '雷震', '💫', 'uncommon', { oh_stun: 1 }], ['oc_shield', '着地の構え', '🛡️', 'uncommon', { oc_shield: 1 }], ['oh_burn', '炎の着地', '🔥', 'uncommon', { oh_burn: 1 }], ['charges', '連続跳躍', '🦵', 'rare', { charges: 1 }, 'チャージ数+1。']],
    mark: [['x_spread', '伝染する刻印', '🦠', 'epic', { x_spread: 1 }, '刻印された敵を倒すと、近くの敵2体に刻印が移る。'], ['x_multi', '多重刻印', '🎯', 'rare', { x_multi: 1 }, '狙った敵の近くの敵2体にも刻印する。'], ['x_heal', '処刑の糧', '💚', 'uncommon', { x_heal: 1 }, '刻印された敵を倒すとHP+15。'], ['oc_dmg', '狩人の昂り', '⚔️', 'uncommon', { oc_dmg: 1 }]],
    toxic: [['x_virulent', '猛毒', '☠️', 'rare', { x_virulent: 1 }, '霧の毒の蓄積が2倍になる。'], ['oh_mark', '腐食', '🎯', 'rare', { oh_mark: 1 }], ['oh_frost', '麻痺毒', '❄️', 'uncommon', { oh_frost: 1 }], ['oh_vamp', '瘴気吸収', '🩸', 'rare', { oh_vamp: 1 }]],
    ricostorm: [['x_dmg', '跳弾強化', '🎯', 'rare', { x_dmg: 1 }, '効果中、与ダメ+20%。'], ['x_rate', '連鎖速射', '🔁', 'rare', { x_rate: 1 }, '効果中、連射速度+25%。'], ['oc_ammo', '装填', '♻️', 'uncommon', { oc_ammo: 1 }], ['oc_haste', '跳ね回る足', '👟', 'uncommon', { oc_haste: 1 }]],
    grasp: [['x_crush', '握り潰し', '✊', 'epic', { x_crush: 1 }, '拘束が終わる時に握り潰す（150ダメージの爆発）。'], ['oh_poison', '腐る手', '☠️', 'uncommon', { oh_poison: 1 }], ['oh_vamp', '魂を啜る手', '🩸', 'rare', { oh_vamp: 1 }], ['oh_mark', '呪縛', '🎯', 'uncommon', { oh_mark: 1 }]],
    holynova: [['x_heal', '大いなる癒し', '💚', 'rare', { x_heal: 1 }, '回復量40→80。'], ['oc_shield', '光の盾', '🛡️', 'uncommon', { oc_shield: 1 }], ['oh_stun', '目眩まし', '💫', 'uncommon', { oh_stun: 1 }], ['x_sanct', '聖地', '☀️', 'epic', { x_sanct: 1 }, '足元に5秒間の聖なる場を残し、敵を焼き続ける。']],
    summon: [['x_more', '軍勢', '💀', 'epic', { x_more: 1 }, '骸骨兵+2体。'], ['x_explode', '屍爆', '💥', 'rare', { x_explode: 1 }, '骸骨兵が消える時に爆発する（100ダメージ）。'], ['oh_vamp', '血の盟約', '🩸', 'rare', { oh_vamp: 1 }], ['oh_burn', '業火の骸', '🔥', 'uncommon', { oh_burn: 1 }]],
    harvest: [['x_thresh', '刈り取り', '⚰️', 'epic', { x_thresh: 1 }, '即死させるHPの基準30%→45%。'], ['x_heal', '魂の滋養', '💚', 'uncommon', { x_heal: 1 }, '1体ごとの回復5→12。'], ['x_reset', '豊作', '🌾', 'rare', { x_reset: 1 }, '3体以上刈り取るとクールタイムが半分になる。'], ['oc_dmg', '魂の高揚', '⚔️', 'uncommon', { oc_dmg: 1 }]],
    magnet: [['x_pull', '強磁場', '🧲', 'uncommon', { x_pull: 1 }, '引き寄せ時間1.2→2.5秒。'], ['oh_shock', '電磁', '⚡', 'rare', { oh_shock: 1 }], ['oh_burn', '灼熱磁爆', '🔥', 'uncommon', { oh_burn: 1 }], ['x_twin', '連鎖磁爆', '💥', 'rare', { x_twin: 1 }, '0.6秒後にもう一度爆発する（60%）。']],
    haste: [['x_dodge', '見切り', '🛡️', 'rare', { x_dodge: 1 }, '効果中、被ダメ-15%。'], ['x_reload', '早撃ち', '♻️', 'uncommon', { x_reload: 1 }, '効果中、リロード速度+50%・連射速度+15%。'], ['x_jump', '翔脚', '🦘', 'uncommon', { x_jump: 1 }, 'ジャンプ力+30%→+60%。'], ['oc_heal', '息継ぎ', '💚', 'uncommon', { oc_heal: 1 }]],
    rewind: [['x_heal', '再生', '💚', 'rare', { x_heal: 1 }, '巻き戻り時に最大HPの20%を回復。'], ['x_nova', '時の爆縮', '💥', 'rare', { x_nova: 1 }, '元いた場所で爆発（半径5m・120ダメージ）。'], ['x_time', '長き逆行', '⏪', 'uncommon', { x_time: 1 }, '巻き戻る時間+2秒。'], ['oc_shield', '時の殻', '🛡️', 'uncommon', { oc_shield: 1 }]],
    lunge: [['x_vamp', '鮮血', '🩸', 'rare', { x_vamp: 1 }, '回復率30%→55%。'], ['x_cleave', '薙ぎ払い', '🗡️', 'rare', { x_cleave: 1 }, '周囲4mの敵にも60%のダメージ。'], ['oh_stun', '踏み込み', '💫', 'uncommon', { oh_stun: 1 }], ['x_reset', '連撃', '🔁', 'epic', { x_reset: 1 }, '斬撃で倒すとクールタイムがリセットされる。']],
    warcry: [['x_rally', '鼓舞', '📯', 'rare', { x_rally: 1 }, '与ダメ+25%→+45%。'], ['x_long', '畏怖', '😱', 'uncommon', { x_long: 1 }, '恐怖時間3→5秒。'], ['oc_heal', '雄叫びの癒し', '💚', 'uncommon', { oc_heal: 1 }], ['oc_shield', '戦士の気迫', '🛡️', 'uncommon', { oc_shield: 1 }]],
    arrowrain: [['oh_poison', '毒矢', '☠️', 'uncommon', { oh_poison: 1 }], ['oh_burn', '火矢', '🔥', 'uncommon', { oh_burn: 1 }], ['oh_frost', '氷矢', '❄️', 'uncommon', { oh_frost: 1 }], ['oh_stun', '縫い止め', '💫', 'rare', { oh_stun: 1 }]],
    quake: [['x_after', '余震', '🌋', 'epic', { x_after: 1 }, '1秒後にもう一度揺れる（50%）。'], ['x_long', '激震', '💫', 'rare', { x_long: 1 }, 'スタン時間2→3.5秒。'], ['oh_mark', '地割れ', '🎯', 'uncommon', { oh_mark: 1 }], ['oh_burn', '溶岩噴出', '🔥', 'rare', { oh_burn: 1 }]],
    icespear: [['x_triple', '氷の三叉', '🧊', 'epic', { x_triple: 1 }, '扇状に3本放つ（左右は70%）。'], ['x_deep', '永久凍結', '❄️', 'uncommon', { x_deep: 1 }, '凍結の蓄積5→10。'], ['oh_blast', '砕氷爆', '💥', 'rare', { oh_blast: 1 }], ['oh_mark', '凍傷', '🎯', 'uncommon', { oh_mark: 1 }]],
    fireball: [['x_triple', '三連火球', '🌞', 'epic', { x_triple: 1 }, '扇状に3つ放つ（左右は70%）。'], ['x_napalm', '焼夷', '🔥', 'rare', { x_napalm: 1 }, '爆発地点に4秒間燃える炎を残す。'], ['oh_stun', '爆圧', '💫', 'uncommon', { oh_stun: 1 }], ['oh_mark', '焼き印', '🎯', 'uncommon', { oh_mark: 1 }]],
    thornarmor: [['x_harden', '堅殻', '🛡️', 'rare', { x_harden: 1 }, '被ダメ-35%→-50%。'], ['x_reflect', '鋭棘', '🌵', 'rare', { x_reflect: 1 }, '反射ダメージ×2。'], ['x_heal', '樹液', '💚', 'uncommon', { x_heal: 1 }, '効果中、毎秒HP3回復。'], ['oc_shield', '樹皮', '🛡️', 'uncommon', { oc_shield: 1 }]],
    groundpound: [['x_pile', '大地の共鳴', '🔨', 'rare', { x_pile: 1 }, 'パイルドライバーのクールタイム短縮2→5秒。'], ['x_full', '全周', '⭕', 'uncommon', { x_full: 1 }, '前方だけでなく全方位に亀裂を走らせる。'], ['x_stun', '地割れ', '💫', 'uncommon', { x_stun: 1 }, 'スタン時間0.8→2秒。'], ['oh_burn', '溶岩割り', '🔥', 'uncommon', { oh_burn: 1 }]],
    anchorstorm: [['x_more', '鎖の嵐', '⛓️', 'rare', { x_more: 1 }, '鎖の本数+4。'], ['x_slam', '引き寄せ爆', '💥', 'epic', { x_slam: 1 }, '引き寄せた後、自分の周囲で爆発（半径4m・100ダメージ）。'], ['oh_vamp', '血鎖', '🩸', 'rare', { oh_vamp: 1 }], ['oh_mark', '縛鎖の刻印', '🎯', 'uncommon', { oh_mark: 1 }]],
    flight: [['x_dive', '急降下爆撃', '☄️', 'epic', { x_dive: 1 }, '着地時に衝撃波（半径6m・140ダメージ）。'], ['x_sky', '天空の射手', '🎯', 'rare', { x_sky: 1 }, '効果中、与ダメ+25%。'], ['oc_shield', '風の守り', '🛡️', 'uncommon', { oc_shield: 1 }], ['oc_haste', '追い風', '👟', 'uncommon', { oc_haste: 1 }]],
    // ---- ultimates ----
    ult_bastion: [['x_fort', '金剛', '🏰', 'rare', { x_fort: 1 }, '被ダメ軽減60%→72%。'], ['x_thorns', '反撃の城塞', '🌵', 'epic', { x_thorns: 1 }, '効果中に攻撃してきた敵へ、受けるはずだったダメージの200%を返す。'], ['x_regen', '癒しの城塞', '💚', 'rare', { x_regen: 1 }, '毎秒回復が最大HPの3%→5%。'], ['x_nova', '城塞崩し', '💥', 'uncommon', { x_nova: 1 }, '発動時、周囲8mの敵を吹き飛ばす（150ダメージ）。']],
    ult_meteor: [['x_more', '流星雨', '🌠', 'epic', { x_more: 1 }, '隕石+3個。'], ['x_crater', '溶岩原', '🔥', 'rare', { x_crater: 1 }, '落下地点に5秒間燃える炎を残す。'], ['oh_stun', '衝突の衝撃', '💫', 'uncommon', { oh_stun: 1 }]],
    ult_timestop: [['x_free', '止まった世界で', '🗡️', 'epic', { x_free: 1 }, '効果中、与ダメ+35%。'], ['x_heal', '静寂の癒し', '💚', 'rare', { x_heal: 1 }, '効果中、毎秒最大HPの4%回復。'], ['oc_ammo', '刻の装填', '♻️', 'uncommon', { oc_ammo: 1 }]],
    ult_berserk: [['x_blood', '血の渇き', '🩸', 'rare', { x_blood: 1 }, '吸血+6%。'], ['x_iron', '不動', '🛡️', 'rare', { x_iron: 1 }, '効果中、被ダメ-30%。'], ['x_rage', '鬼気', '😡', 'epic', { x_rage: 1 }, '与ダメ+40%（合計+120%）。']],
    ult_blackhole: [['x_tear', '虚無の牙', '🌀', 'rare', { x_tear: 1 }, '吸い込んでいる間も毎秒80ダメージ。'], ['x_crush', '特異点', '🕳️', 'epic', { x_crush: 1 }, '大爆縮のダメージ+60%。'], ['oh_mark', '歪む装甲', '🎯', 'uncommon', { oh_mark: 1 }]],
    ult_judgement: [['x_twice', '再審', '⚡', 'epic', { x_twice: 1 }, '1秒後にもう一度落雷する（60%）。'], ['x_stun', '天の怒り', '💫', 'rare', { x_stun: 1 }, 'スタン時間1.5→3秒。'], ['oh_mark', '裁きの刻印', '🎯', 'uncommon', { oh_mark: 1 }]],
    ult_phoenix: [['x_rebirth', '不死鳥', '🐦', 'epic', { x_rebirth: 1 }, '蘇生時のHP50%→100%、蘇生時の爆発ダメージ×2。'], ['x_heal', '再生の炎', '💚', 'rare', { x_heal: 1 }, '効果中、毎秒最大HPの2%回復。'], ['oc_shield', '炎の衣', '🛡️', 'uncommon', { oc_shield: 1 }]],
    ult_armory: [['x_dmg', '炸裂弾頭', '💥', 'rare', { x_dmg: 1 }, '効果中、与ダメ+25%。'], ['x_rate', '過給', '🔁', 'rare', { x_rate: 1 }, '連射速度+80%→+120%。'], ['oc_haste', '突撃', '👟', 'uncommon', { oc_haste: 1 }]],
    ult_legion: [['x_more', '大軍勢', '💀', 'epic', { x_more: 1 }, '骸骨兵+3体。'], ['x_explode', '屍爆', '💥', 'rare', { x_explode: 1 }, '骸骨兵が消える時に爆発する（150ダメージ）。'], ['oh_vamp', '血の盟約', '🩸', 'rare', { oh_vamp: 1 }]],
    ult_tsunami: [['x_second', '大津波', '🌊', 'epic', { x_second: 1 }, '0.8秒後に二の波（70%）が来る。'], ['oh_frost', '凍てつく潮', '❄️', 'uncommon', { oh_frost: 1 }], ['oh_stun', '溺れる', '💫', 'uncommon', { oh_stun: 1 }]],
    ult_cryo: [['x_shatter', '砕ける氷河', '💠', 'epic', { x_shatter: 1 }, '1.5秒後、凍った敵が砕けて60%のダメージ。'], ['x_armor', '氷の鎧', '🛡️', 'rare', { x_armor: 1 }, '発動後8秒間、被ダメ-30%。'], ['oh_mark', '凍傷', '🎯', 'uncommon', { oh_mark: 1 }]],
    ult_inferno: [['x_heal', '浄火', '💚', 'rare', { x_heal: 1 }, '効果中、毎秒最大HPの2%回復。'], ['x_end', '大爆炎', '💥', 'epic', { x_end: 1 }, '終了時に大爆発（半径12m・400ダメージ）。'], ['oh_mark', '焼き印', '🎯', 'uncommon', { oh_mark: 1 }]],
    ult_shadow: [['x_lethal', '致命', '🗡️', 'epic', { x_lethal: 1 }, '会心ダメージ+50%（合計+100%）。'], ['x_vamp', '影喰い', '🩸', 'rare', { x_vamp: 1 }, '効果中、吸血+5%。'], ['x_speed', '影走り', '🏃', 'uncommon', { x_speed: 1 }, '効果中、移動速度+30%。']],
    ult_orbital: [['x_track', '追尾演算', '🛰️', 'rare', { x_track: 1 }, '光線が照準へ素早く追従する。'], ['oh_burn', '焦土', '🔥', 'uncommon', { oh_burn: 1 }], ['oh_mark', '照準刻印', '🎯', 'uncommon', { oh_mark: 1 }]],
    ult_sanctuary: [['x_heal', '大聖域', '💚', 'rare', { x_heal: 1 }, '回復が毎秒4%→7%。'], ['x_follow', '聖者の歩み', '🚶', 'epic', { x_follow: 1 }, '聖域が自分についてくる。'], ['oc_shield', '聖なる盾', '🛡️', 'uncommon', { oc_shield: 1 }]],
    ult_bloodstorm: [['x_ls', '血の奔流', '🩸', 'rare', { x_ls: 1 }, '回復率40%→65%。'], ['x_over', '血の鎧', '🛡️', 'epic', { x_over: 1 }, '溢れた回復を、8秒間持続するシールドにする（最大120）。'], ['oh_poison', '腐血', '☠️', 'uncommon', { oh_poison: 1 }]],
    ult_overcharge: [['x_power', '魔力奔流', '🔮', 'epic', { x_power: 1 }, '効果中、スキルダメージ+30%。'], ['oc_ammo', '全装填', '♻️', 'uncommon', { oc_ammo: 1 }], ['oc_heal', '充電回復', '💚', 'uncommon', { oc_heal: 1 }]],
    ult_titan: [['x_stomp', '地響き', '🌋', 'epic', { x_stomp: 1 }, '効果中、1.5秒ごとに周囲8mへ衝撃（80ダメージ・短いスタン）。'], ['x_heal', '巨人の生命', '💚', 'rare', { x_heal: 1 }, '発動時、最大HPの30%を回復。'], ['x_iron', '岩肌', '🛡️', 'rare', { x_iron: 1 }, '被ダメ軽減25%→40%。']],
    ult_bladestorm: [['x_wide', '大旋風', '⭕', 'uncommon', { x_wide: 1 }, '刃の回転半径+1.5m。'], ['oh_vamp', '吸血刃', '🩸', 'rare', { oh_vamp: 1 }], ['oh_burn', '炎刃', '🔥', 'uncommon', { oh_burn: 1 }], ['oh_frost', '氷刃', '❄️', 'uncommon', { oh_frost: 1 }]],
    ult_execution: [['x_thresh', '裁きの線', '⚖️', 'epic', { x_thresh: 1 }, '即死させるHPの基準20%→30%。'], ['x_dmg', '重罰', '💥', 'rare', { x_dmg: 1 }, 'ダメージ 最大HPの25%→35%（ボス6%→9%）。'], ['x_refund', '断罪の連鎖', '🔁', 'rare', { x_refund: 1 }, '倒した敵1体につき、アルティメットのクールタイム-3秒。']],
  };
  const descOf = (sm) => Object.keys(sm).map((k) => OH[k] || '').join('');
  const list = [];
  for (const s of [...G.SKILLS, ...G.ULTS]) {
    const ult = !!s.ult, p = s.p, head = `${s.icon}${s.name}：`;
    const mk = (key, name, icon, rarity, sm, desc, max) => list.push({ id: `sk_${s.id}_${key}`, name: `${name}（${s.name}）`, icon, rarity, cat: ult ? 'ult' : 'skill', desc: head + (desc || descOf(sm)), sm, skill: s.id, max: max || 1, kind: 'buff' });
    if (!NODMG.has(s.id)) mk('dmg', '威力強化', '💥', 'uncommon', { dmg: 0.35 }, 'ダメージ+35%。', 3);
    // mastery: the skill's own level +1 (the Lv itself is raised when the boon is taken, see Player.addBuff; it is not offered at Lv 15)
    mk('mastery', '習熟', '📘', 'rare', {}, `レベル+1（威力×${ult ? 1.25 : 1.3}・クールタイム-2%）。`, 3);
    list[list.length - 1].mastery = true;
    mk('cd', '短縮詠唱', '⏳', 'uncommon', { cd: ult ? 0.12 : 0.15 }, `クールタイム-${ult ? 12 : 15}%。`, 2);
    if (p.r || p.len || p.range || p.w || ['blades', 'ult_bladestorm'].includes(s.id)) mk('area', '範囲拡張', '⭕', 'uncommon', { area: 0.25 }, '範囲・射程+25%。', 2);
    if (p.dur) mk('dur', '持続延長', '⌛', 'uncommon', { dur: 0.3 }, '効果時間+30%。', 2);
    for (const [key, name, icon, rarity, sm, desc] of UQ[s.id] || []) mk(key, name, icon, rarity, sm, desc, key === 'charges' ? 2 : 1);
  }
  for (const b of list) { G.BUFFS.push(b); G.BUFF_BY_ID[b.id] = b; }
  G.SKILL_AUGS = list;
})();
