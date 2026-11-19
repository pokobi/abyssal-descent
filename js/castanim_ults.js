'use strict';
// Which first-person motion each ultimate casts with (castanim.js). The same form as js/castanim_skills.js. An ultimate's effect is
// never held back (no release): its motion plays from the moment it goes off.
(function () {
  G.CastAnim.table({
    ult_bastion: { m: 'clasp', f: 'fist', hold: 0.5, speed: 0.9 },     // 不屈の城塞: fist to palm before the chest
    ult_meteor: { m: 'sign', sign: 'point', up: true, hold: 0.7 },     // 星落とし
    ult_bell: { m: 'raise', both: true, high: 1, hold: 0.7 },          // 終焉の鐘
    ult_godfall: { m: 'raise', both: true, high: 1, hold: 0.8, speed: 0.85 },   // 神降ろし
    ult_timestop: { m: 'sign', sign: 'seal', hold: 0.7 },              // 時止め
    ult_berserk: { m: 'channel', f: 'fist', hold: 0.6 },               // 鬼神化
    ult_blackhole: { m: 'crush', close: 0.6, speed: 0.9 },             // 虚無の渦
    ult_judgement: { m: 'sign', sign: 'point', up: true, hold: 0.6 },  // 天罰
    ult_phoenix: { m: 'part', wide: 1, speed: 0.7 },                   // 鳳凰転生: the arms flung wide
    ult_armory: { m: 'raise', f: 'fist', hold: 0.4 },                  // 無限兵装
    ult_legion: { m: 'plant', both: true, hold: 0.6 },                 // 亡者の軍勢
    ult_tsunami: { m: 'push2', wide: 1, speed: 0.85 },                 // 大海嘯
    ult_cryo: { m: 'slam', both: true, palm: true },                   // 絶対零度
    ult_inferno: { m: 'channel', hold: 0.6 },                          // 煉獄
    ult_shadow: { m: 'sign', sign: 'seal', hold: 0.5 },                // 影の舞
    ult_orbital: { m: 'sign', sign: 'point', hold: 0.6 },              // 衛星砲
    ult_sanctuary: { m: 'clasp', hold: 0.7 },                          // 聖域
    ult_bloodstorm: { m: 'crush', both: true, close: 0.5 },            // 血の嵐
    ult_overcharge: { m: 'channel', hold: 0.5 },                       // 過充電
    ult_titan: { m: 'channel', f: 'fist', hold: 0.7 },                 // 巨人化
    ult_bladestorm: { m: 'sweep', angle: 0.1, speed: 0.9 },            // 剣の嵐
    ult_execution: { m: 'sign', sign: 'point', hold: 0.6 },            // 断罪
  });
})();
