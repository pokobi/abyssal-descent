'use strict';
// Which first-person motion each skill casts with (castanim.js). One line a skill:
//   id: { m: move, side: 'L' | 'R', speed, at, release, ...the move's own values }
//   m: one of G.CastAnim.MOVES - overhand, underhand, palm, push2, slam, plant, raise, part, thrust, sweep, crush, sign, clasp, channel
//   side: the hand that does it ('L', the default: the gun stays in the right hand; 'R' or a move of both hands lowers the gun)
//   speed: quicker (> 1) or slower (< 1) than the move's own pace; at: the moment (s) the hand is to be in place for the effect
//   release: the skill's effect waits for the hand to swing through (a throw or a shot from the hand; at most 0.12 s) and the shot
//            starts from the hand on the screen. The move's own values are listed with each move in castanim.js
//   tick(c, t, rig): run each frame of the motion, for what a move alone does not give (rig.L / rig.R: { g, hand, fore, upper, oh })
// A skill that is not here plays CA.DEFAULT (raise).
(function () {
  G.CastAnim.table({
    // ---- movement
    dash: { m: 'part' },                                         // ダッシュ: both hands part the air
    dash2: { m: 'part', speed: 1.15, wide: 1 },                  // 疾風迅雷
    blink: { m: 'sign', sign: 'point', speed: 1.2, hold: 0.2 },  // ブリンク: pointed to where you go
    leap: { m: 'slam', both: true, palm: true },                 // 雷鳴の跳躍: both hands thrust down off the ground
    flight: { m: 'slam', both: true, palm: true, speed: 0.9 },   // 飛翔
    lunge: { m: 'thrust', at: 0.16 },                            // 吸血の刃: the strike lands as the lunge ends (0.16 s)
    haste: { m: 'raise', f: 'fist', hold: 0.25, speed: 1.2 },    // 加速装置
    // ---- thrown / shot from the hand
    spear: { m: 'overhand', angle: 0.1 },                        // 投槍
    icespear: { m: 'overhand' },                                 // 氷槍
    fireball: { m: 'overhand', angle: 0.25 },                    // 火球
    waterbolt: { m: 'palm', release: true },                     // 水弾
    magnet: { m: 'palm', release: true, speed: 0.95 },           // 磁力爆弾
    sk_pile: { m: 'thrust', release: true },                     // 破甲杭
    chain: { m: 'sign', sign: 'point', release: true },          // 連鎖雷: the bolt leaves the finger tip
    chain2: { m: 'sign', sign: 'point', release: true },         // 雷神の裁き
    anchorstorm: { m: 'crush', pull: true, speed: 1.3 },         // 鉤鎖乱舞: caught and hauled in
    mines: { m: 'underhand' },                                   // 地雷散布
    decoy: { m: 'underhand', high: 1 },                          // 幻影の囮
    turret: { m: 'underhand' },                                  // 自動弩砲
    // ---- at a point aimed at
    meteor: { m: 'sign', sign: 'point', up: true, hold: 0.5 },   // 隕石落とし
    arrowrain: { m: 'sign', sign: 'point', up: true },           // 矢の雨
    firestorm: { m: 'sign', sign: 'point' },                     // 火炎嵐
    toxic: { m: 'sign', sign: 'point' },                         // 毒霧
    sk_acid: { m: 'sign', sign: 'point', up: true },             // 腐蝕の雨
    whirlpool: { m: 'crush', close: 0.5 },                       // 渦潮
    gravity: { m: 'crush' },                                     // 重力井戸
    grasp: { m: 'crush', close: 0.36 },                          // 闇の手
    mark: { m: 'sign', sign: 'point', hold: 0.3 },               // 処刑の刻印
    // ---- round you / ahead of you
    shockwave: { m: 'push2' },                                   // 衝撃波
    emp: { m: 'clasp', clap: 1, open: true, hold: 0.05 },        // EMPバースト: a clap, flung open
    frostnova: { m: 'plant', both: true, hold: 0.3 },            // フロストノヴァ
    groundpound: { m: 'slam' },                                  // 地裂掌
    quake: { m: 'slam', both: true },                            // 地震
    spikes: { m: 'plant', hold: 0.35 },                          // 大地の棘
    barrier: { m: 'raise', both: true, hold: 0.3 },              // 石壁: raised up out of the ground
    drain: { m: 'crush', pull: true },                           // 生命吸収
    harvest: { m: 'sweep', angle: 0.15 },                        // 魂の収穫
    holynova: { m: 'clasp', open: true },                        // 聖なる光
    sk_rift: { m: 'sweep' },                                     // 次元斬
    blades: { m: 'sweep', angle: -0.1, speed: 1.1 },             // 刃の旋風
    warcry: { m: 'raise', f: 'fist', hold: 0.5 },                  // 鬨の声
    summon: { m: 'plant', hold: 0.5 },                           // 骸骨兵召喚
    // ---- on yourself
    chrono: { m: 'sign', sign: 'seal', hold: 0.45 },             // 時間減速
    rewind: { m: 'sign', sign: 'seal' },                         // 時間逆行
    cloak: { m: 'sign', sign: 'seal', hold: 0.3 },               // 透明化
    sk_shadow: { m: 'sign', sign: 'seal', hold: 0.45 },          // 影分身
    sk_scale: { m: 'clasp', hold: 0.6 },                         // 天秤の祈り
    healaura: { m: 'clasp', hold: 0.45 },                        // 癒しの泉
    thornarmor: { m: 'channel', f: 'fist', hold: 0.3 },          // 茨の鎧
    berserk: { m: 'channel', f: 'fist', hold: 0.4 },             // 狂戦士化
    overdrive: { m: 'raise', f: 'fist', hold: 0.25 },            // 弾幕
    ricostorm: { m: 'raise', hold: 0.3 },                        // 跳弾の嵐
  });
})();
