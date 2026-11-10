'use strict';
// ULTIMATES: the Q slot. Very strong, very long cooldowns (~95-150 s). Each class starts with its own (classes.js);
// others are found in shops / events like skills. They count as skills for damage (src 'skill', info.ult).
(function () {
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  // [id, name, icon, rarity, price, cooldown, desc, params]
  const UL = [
    ['ult_bastion', '不屈の城塞', '🏰', 'epic', 7800, 110, '10秒間、金色の障壁を纏う。被ダメ-60%・毎秒最大HPの3%回復。周囲15mの敵の狙いを自分に引き付け、周囲8mの味方の被ダメ-25%。', { dur: 10 }],
    ['ult_meteor', '星落とし', '🌠', 'legendary', 9000, 125, '照準地点の周囲に、2.5秒かけて5つの巨大隕石を落とす。', { r: 7, dmg: 520, n: 5 }],
    ['ult_timestop', '時止め', '⏱️', 'mythic', 9500, 140, '5秒間、敵と投射物の時間がほぼ止まる。', { dur: 5 }],
    ['ult_berserk', '鬼神化', '👹', 'epic', 7800, 120, '12秒間、与ダメ+80%・連射速度+40%・吸血8%・移動速度+20%。', { dur: 12 }],
    ['ult_blackhole', '虚無の渦', '🌀', 'legendary', 9200, 130, '照準地点に巨大な重力場を5秒間生み、最後に大爆縮させる。', { r: 14, dur: 5, dmg: 800 }],
    ['ult_judgement', '天罰', '🏛️', 'epic', 8200, 120, '周囲40mの全ての敵に落雷し、ダメージと1.5秒のスタン（ボスは無効）。', { r: 40, dmg: 380 }],
    ['ult_phoenix', '鳳凰転生', '🐦', 'legendary', 9000, 150, '15秒間、炎の衣を纏い周囲を焼く。その間に倒れるとHP50%で蘇る。', { dur: 15, dps: 90, r: 6 }],
    ['ult_armory', '無限兵装', '♾️', 'epic', 7600, 110, '15秒間、弾薬無限・連射速度+80%。', { dur: 15 }],
    ['ult_legion', '亡者の軍勢', '🦴', 'epic', 8400, 140, '6体の骸骨兵を25秒間召喚し、共に戦わせる。', { n: 6, dur: 25, dmg: 55 }],
    ['ult_tsunami', '大海嘯', '🌊', 'epic', 8000, 120, '前方30mを大波で押し流す。ダメージと大きな吹き飛ばし。', { len: 30, w: 14, dmg: 450 }],
    ['ult_cryo', '絶対零度', '🥶', 'epic', 8000, 120, '周囲25mの敵を凍結させ、ダメージを与える。', { r: 25, dmg: 300 }],
    ['ult_inferno', '煉獄', '🏮', 'epic', 7800, 120, '8秒間、自分の周囲12mを業火で包み、敵を炎上させる。', { r: 12, dur: 8, dps: 110 }],
    ['ult_shadow', '影の舞', '🥷', 'epic', 8200, 125, '10秒間透明になり、会心率+60%・会心ダメージ+50%。', { dur: 10 }],
    ['ult_orbital', '衛星砲', '🛰️', 'legendary', 9400, 130, '6秒間、照準地点を追う天からの光線が地上を焼き払う。', { dur: 6, dps: 360, r: 3.2 }],
    ['ult_sanctuary', '聖域', '⛩️', 'epic', 7200, 120, '10秒間、足元に聖域を展開。中では毎秒HP4%回復、敵は継続ダメージと鈍化。', { r: 10, dur: 10, dps: 70 }],
    ['ult_bloodstorm', '血の嵐', '🧛', 'epic', 8000, 120, '8秒間、周囲15mの敵から生命力を吸い続け、与ダメの40%を回復する。', { r: 15, dur: 8, dps: 110 }],
    ['ult_overcharge', '過充電', '🔋', 'epic', 6800, 95, '全スキルとグラップルのクールタイムを即リセット。10秒間、スキルのクールタイム-70%。', { dur: 10 }],
    ['ult_titan', '巨人化', '🗿', 'epic', 8600, 140, '12秒間、最大HP+80%・近接ダメージ+150%・パイルドライバー威力+100%・被ダメ-25%。', { dur: 12 }],
    ['ult_bladestorm', '剣の嵐', '🤺', 'epic', 8200, 120, '10秒間、周囲を刃が高速回転し、触れた敵を切り刻む。', { dur: 10, dps: 240 }],
    ['ult_execution', '断罪', '⚖️', 'mythic', 9600, 135, '周囲30mの敵に刻印し、2秒後に最大HPの25%（ボス6%）のダメージ。HP20%以下の通常敵は即死。', { r: 30 }],
    ['ult_bell', '終焉の鐘', '🔔', 'mythic', 10000, 150, '鐘を3回鳴らす。1回ごとに、見えている全ての敵（60m以内）に最大HPの10%（ボスは3%）のダメージと2秒のスタン（ボスはスタンしない）。', { n: 3 }],
    ['ult_godfall', '神降ろし', '🌟', 'mythic', 10000, 160, '15秒間、与ダメ・連射速度・リロード速度・移動速度・近接ダメージ・スキルダメージ+50%、被ダメ-50%、スキルのクールタイムなし。', { dur: 15 }],
  ];
  G.ULTS = UL.map(([id, name, icon, rarity, price, cd, desc, p]) => ({ id, name, icon, rarity, price, cd, desc, p, kind: 'ult', ult: true }));
  for (const u of G.ULTS) G.SKILL_BY_ID[u.id] = u;
  G.DEFAULT_ULT = 'ult_bastion';

  const A = G.abilities, VX = G.vfx;
  let P, C;
  const env = () => { P = G.player; C = G.combat; };
  A.ultPower = (sk, bare) => Math.pow(1.25, bare ? (sk && sk.lv) || 0 : A.totalLv(sk)) * (1 + (!bare && sk ? A.skm(sk.id).dmg : 0));
  A.bastionRegenK = (sk, bare) => 1 + 0.04 * (bare ? (sk && sk.lv) || 0 : A.totalLv(sk));
  A.auras = [];
  A.castUlt = function (sk) {
    env();
    const prev = C.curSk; C.curSk = sk.id;
    try { castUlt(sk); } finally { C.curSk = prev; }
  };
  function castUlt(sk) {
    const st = P.stats, def = sk.def, pw = A.ultPower(sk), id = sk.id, m = A.skm(id);
    const p = A.scaleP(sk);
    const sc = (v) => v * pw, tmp = (a, d, s, i, l) => C.temp(a, d, A.effStats(sk, s), i, l);
    const info = { src: 'skill', ult: true };
    const aimPt = (range) => A.aim(range || 50).floorPt.clone();
    const later = (fn, ms) => A.later(id, fn, ms);
    let ok = true;
    switch (id) {
      case 'ult_bastion': {
        tmp('ult_bastion', p.dur, { armor: m.x_fort ? 0.72 : 0.6, hpRegen: st.maxHp * (m.x_regen ? 0.05 : 0.03) * A.bastionRegenK(sk) }, '🏰', '不屈の城塞');
        // a golden barrier around you for as long as it lasts; a ring runs out to the 15 m it draws foes' aim from
        VX.shield(P, 1.7, 0xffc040, p.dur, { c2: 0xfff4d0, alpha: 0.3, lift: 0.95 });
        VX.nova(P.pos.clone(), 15, 0.45, { style: 'gold', dome: false });
        if (m.x_nova) { const c = P.pos.clone(); VX.nova(c, 8, 0.25, { style: 'gold' }); A.radial(c, 8, 0.25, (e) => { const to = e.pos.clone().sub(c).setY(0).normalize(); C.damageEnemy(e, sc(150), Object.assign({ knock: 20, dir: to.setY(0.5) }, info)); }); }
        G.fx.flash(P.chestPos(), 0xffd070, 80, 0.4, 16); G.sfx.magic(P.pos, 'holy'); G.sfx.shieldUp ? G.sfx.shieldUp() : G.sfx.bell();
        for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; G.fx.add.spawn(P.pos.x + Math.cos(a) * 1.2, P.pos.y + 0.2, P.pos.z + Math.sin(a) * 1.2, Math.cos(a) * 2, U.rand(2, 5), Math.sin(a) * 2, 0.9, 0.12, 0.02, 1, 0.85, 0.4, 1, 0, 0); }
        break;
      }
      case 'ult_meteor': {
        // each one: a warning circle on the floor, a burning rock that falls into it in exactly 1 s, and the blast as it lands
        const c = aimPt(60), n = p.n + (m.x_more ? 3 : 0), er = p.r * (1 + (st.explosionRadius || 0));
        for (let i = 0; i < n; i++) {
          const pt = i ? c.clone().add(V(U.rand(-p.r, p.r), 0, U.rand(-p.r, p.r))) : c.clone();
          A.task(() => {
            const fl = G.world.floorBelow(pt.x, pt.y + 3, pt.z); if (fl > -50) pt.y = fl;
            G.fx.telegraph(pt.clone().setY(pt.y + 0.02), er, 1.0, 0xff6020);
            VX.meteor(pt.clone().add(V(10, 38, -7)), pt.clone().add(V(0, 0.9, 0)), 1.0, 2.2);
            A.task(() => {
              C.explode(pt.clone().add(V(0, 1, 0)), p.r, sc(p.dmg), Object.assign({ color: 0xff7030 }, info));
              VX.nova(pt.clone(), er, 0.3, { style: 'fire', dome: false }); G.fx.debris(pt.clone().add(V(0, 0.5, 0)), G.world.mats.rock, 10, 0.4, 9);
              if (m.x_crater) C.zone(pt, p.r * 0.7, 5, 'fire', sc(40));
              G.sfx.explosion(pt, 1.6); P.addShake(0.4);
            }, 1.0);
          }, i * 0.45);
        }
        G.sfx.rumble(3, 1); break;
      }
      case 'ult_bell': {
        // a bell appears above you; at each toll a golden ring runs out to 60 m and every foe in sight is struck as it reaches him
        const n = p.n + (m.x_four ? 1 : 0), gap = 0.9, R = 60, dur = 0.9;
        VX.bell(P, gap * (n - 1) + 1.5, [...Array(n)].map((_, i) => i * gap));
        for (let i = 0; i < n; i++) A.task(() => {
          G.sfx.bell(); G.fx.flash(P.chestPos(), 0xffe8b0, 90, 0.3, 30); P.addShake(0.3);
          const c = P.pos.clone(), eye = G.camera.position.clone();
          VX.nova(c, R, dur, { style: 'gold', dome: false });
          for (const e of G.enemies.list) {
            if (!e.alive || e.ally || e.pos.distanceTo(c) > R) continue;
            if (!G.world.los(eye, e.centerPos())) continue;
            const d = Math.max(0, Math.hypot(e.pos.x - c.x, e.pos.z - c.z) - (e.radius || 0.5));
            A.task(() => {
              if (!e.alive) return;
              C.damageEnemy(e, e.maxHp * (e.boss ? 0.03 : 0.1), Object.assign({ noMarker: true, fixed: true }, info));
              if (!e.boss) C.stun(e, 2);
              G.fx.sparks(e.centerPos(), null, 8, 0xffe0a0, 4);
            }, VX.novaTime(d, R, dur));
          }
          if (m.x_heal) C.heal(st.maxHp * 0.05);
        }, i * gap);
        break;
      }
      case 'ult_godfall': {
        const dur = p.dur + (m.x_long ? 5 : 0);
        tmp('ult_godfall', dur, { dmg: 0.5, fireRate: 0.5, reloadSpeed: 0.5, moveSpeed: 0.5, meleeDmg: 0.5, skillDmg: 0.5, armor: 0.5 }, '🌟', '神降ろし');
        // a column of light comes down on you; the glow stays on you for as long as it lasts
        VX.pillar(P.pos.clone(), 2.2, 45, 0xffe8a0, 1.0, { c2: 0xffffff, groundKind: 'holy', speed: 6 });
        VX.motes(P, 0xffe090, dur, 26);
        if (m.x_nova) { const c = P.pos.clone(); VX.nova(c, 15, 0.4, { style: 'holy' }); A.radial(c, 15, 0.4, (e) => C.damageEnemy(e, sc(600), Object.assign({ noMarker: true }, info))); }
        else VX.nova(P.pos.clone(), 6, 0.35, { style: 'holy', dome: false });
        G.fx.flash(P.chestPos(), 0xfff0c0, 120, 0.5, 30); G.sfx.magic(P.pos, 'holy'); G.sfx.bell();
        break;
      }
      case 'ult_timestop':
        G.game.chronoT = p.dur; G.game.chronoSlow = 0.95; // enemies keep 5% of their speed
        tmp('ult_timestop', p.dur, { dmg: m.x_free ? 0.35 : 0, hpRegen: m.x_heal ? st.maxHp * 0.04 : 0 }, '⏱️', '時止め');
        VX.nova(P.pos.clone(), 45, 0.7, { style: 'time', hk: 0.25 });
        G.ui.tint('chrono', p.dur); G.sfx.magic(P.pos, 'dark'); G.sfx.bell(); break;
      case 'ult_berserk':
        tmp('ult_berserk', p.dur, { dmg: 0.8 + (m.x_rage ? 0.4 : 0), fireRate: 0.4, lifesteal: 0.08 + (m.x_blood ? 0.06 : 0), moveSpeed: 0.2, armor: m.x_iron ? 0.3 : 0 }, '👹', '鬼神化');
        VX.nova(P.pos.clone(), 6, 0.3, { style: 'blood' }); VX.motes(P, 0xff3020, p.dur, 22);
        G.ui.tint('rage', p.dur); G.sfx.monster(null, 'roar', 1.3, 0.6); break;
      case 'ult_blackhole': {
        // a gravity well (its black heart and the disk turning round it: vfx.js, through the zone), then it collapses into a blast of r x 0.75
        const pt = aimPt(45);
        C.zone(pt, p.r, p.dur, 'gravity', 0, { onEnd: () => { C.explode(pt.clone().add(V(0, 1, 0)), p.r * 0.75, sc(p.dmg) * (m.x_crush ? 1.6 : 1), Object.assign({ color: 0xa070ff }, info)); VX.nova(pt.clone(), p.r * 0.75 * (1 + (P.stats.explosionRadius || 0)), 0.25, { style: 'dark' }); P.addShake(0.6); } });
        if (m.x_tear) C.zone(pt, p.r, p.dur, 'grasp', sc(80), { interval: 0.5 });
        G.sfx.magic(pt, 'dark'); G.sfx.rumble(p.dur, 0.8); break;
      }
      case 'ult_judgement': {
        // a ring of storm runs out to r; each foe it reaches is struck by a bolt from the sky
        const strike = (k) => {
          const c = P.pos.clone(), dur = 0.6;
          VX.nova(c, p.r, dur, { style: 'emp', dome: false });
          const n = A.radial(c, p.r, dur, (e) => {
            const q = e.centerPos();
            VX.pillar(e.pos.clone(), 0.7, 30, 0x9ab8ff, 0.28, { c2: 0xffffff, ground: false, speed: 10 });
            G.fx.lightning(q.clone().add(V(U.rand(-3, 3), 30, U.rand(-3, 3))), q, 0xe0e8ff);
            G.fx.ring(e.pos.clone(), 2, 0xc0d8ff, 0.3); G.fx.flash(q, 0xc0d0ff, 40, 0.15, 14);
            C.damageEnemy(e, sc(p.dmg) * k, Object.assign({ elem: 'shock' }, info)); if (!e.boss) C.stun(e, m.x_stun ? 3 : 1.5);
          });
          G.sfx.thunder && G.sfx.thunder(1); P.addShake(0.4);
          return n;
        };
        if (!strike(1)) G.ui.toastSmall('⚡ 雷は天を裂いた（敵がいない）');
        if (m.x_twice) A.task(() => strike(0.6), 1.0);
        break;
      }
      case 'ult_phoenix':
        tmp('ult_phoenix', p.dur, { hpRegen: m.x_heal ? st.maxHp * 0.02 : 0 }, '🐦', '鳳凰転生'); P.phoenixFull = !!m.x_rebirth;
        A.auras.push({ kind: 'fire', t: p.dur, r: p.r, dps: sc(p.dps), follow: true, col: 0xff7030, sk: id });
        VX.nova(P.pos.clone(), p.r, 0.3, { style: 'fire' }); VX.motes(P, 0xff8030, p.dur, 30);
        G.sfx.fire && G.sfx.fire(P.pos, true); G.fx.fireBurst(P.pos.clone(), 3); break;
      case 'ult_armory':
        tmp('ult_armory', p.dur, { infAmmo: 1, fireRate: m.x_rate ? 1.2 : 0.8, dmg: m.x_dmg ? 0.25 : 0 }, '🔫', '無限兵装'); C.refill && C.refill(1, true);
        VX.nova(P.pos.clone(), 3.5, 0.3, { style: 'gold', dome: false }); VX.motes(P, 0xffd060, p.dur, 14);
        G.sfx.mech('boltBack'); G.sfx.mech('boltFwd', 0.15); break;
      case 'ult_legion': { const n = p.n + (m.x_more ? 3 : 0); for (let i = 0; i < n; i++) A.summonSkeleton(P.pos.clone().add(V(Math.cos(i * 6.28 / n) * 2.5, 0, Math.sin(i * 6.28 / n) * 2.5)), p.dur, sc(p.dmg), m.x_explode ? sc(150) : 0); G.sfx.monster(P.pos, 'groan', 1.1, 0.8); break; }
      case 'ult_tsunami': {
        // a wall of water rises in front of you and rolls 30 m along your aim: each foe in its lane is hit when its leading edge reaches him
        const f = P.forward(); f.y = 0; f.normalize();
        const a = P.pos.clone(), speed = 22, mid = a.clone().addScaledVector(f, p.len / 2);
        const wave = (k) => {
          const W = VX.wave(a, f, p.len, p.w, speed, { start: 1.5 });
          if (VX.debug) VX.dbgLane(a, f, p.len, p.w);
          const hit = new Set(); let t = 0;
          A.flow((dt) => {
            const front = VX.waveFront(t, W.start, speed, p.len, W.H);
            for (const e of G.enemies.inRadius(mid, p.len * 0.6 + 2)) {
              if (hit.has(e)) continue;
              const rx = e.pos.x - a.x, rz = e.pos.z - a.z, along = rx * f.x + rz * f.z, side = Math.abs(rx * f.z - rz * f.x);
              if (along < -1 || along > front || side > p.w / 2) continue;
              hit.add(e); C.damageEnemy(e, sc(p.dmg) * k, Object.assign({ knock: 22 * k, dir: f.clone().setY(0.4) }, info));
            }
            t += dt;
            return t <= W.travel + 0.05;
          });
          G.sfx.whoosh(1, 0.4); G.sfx.rumble(1.2, k);
        };
        wave(1);
        if (m.x_second) A.task(() => wave(0.7), 0.8);
        break;
      }
      case 'ult_cryo': {
        // a dome of frost swells out to r, freezing each foe as it reaches him; spikes of ice burst up along its edge
        const c = P.pos.clone(), dur = 0.6, hit = [];
        VX.nova(c, p.r, dur, { style: 'ice' }); VX.area(c, p.r, 'frost', dur + 1.6, { grow: dur });
        A.radial(c, p.r, dur, (e) => { hit.push(e); C.damageEnemy(e, sc(p.dmg), Object.assign({ elem: 'frost' }, info)); C.status(e, 'frost', 10); });
        if (m.x_shatter) A.task(() => { for (const e of hit) if (e.alive) { C.damageEnemy(e, sc(p.dmg) * 0.6, Object.assign({ elem: 'frost' }, info)); G.fx.sparks(e.centerPos(), null, 10, 0xd8f0ff, 5); VX.spikes([e.pos.clone()], { kind: 'ice', r: 1.2, h: 1.6, n: 4, dur: 0.5 }); } G.sfx.ice(P.pos); }, 1.5);
        if (m.x_armor) tmp('ult_cryo_armor', 8, { armor: 0.3 }, '🛡️');
        G.fx.flash(P.chestPos(), 0xd8f0ff, 70, 0.4, 30); G.sfx.magic(P.pos, 'ice'); break;
      }
      case 'ult_inferno':
        A.auras.push({ kind: 'fire', t: p.dur, r: p.r, dps: sc(p.dps), follow: true, col: 0xff5010, burn: true, sk: id, onEnd: m.x_end ? () => { C.explode(P.pos.clone().add(V(0, 1, 0)), 12, sc(400), Object.assign({ color: 0xff5010 }, info)); VX.nova(P.pos.clone(), 12 * (1 + (P.stats.explosionRadius || 0)), 0.3, { style: 'fire' }); } : null });
        VX.nova(P.pos.clone(), p.r, 0.35, { style: 'fire', dome: false });
        if (m.x_heal) tmp('ult_inferno_heal', p.dur, { hpRegen: st.maxHp * 0.02 }, '💚');
        G.sfx.fire && G.sfx.fire(P.pos, true); break;
      case 'ult_shadow':
        tmp('ult_shadow', p.dur, { invis: 1, critChance: 0.6, critMul: m.x_lethal ? 1.0 : 0.5, lifesteal: m.x_vamp ? 0.05 : 0, moveSpeed: m.x_speed ? 0.3 : 0 }, '🥷', '影の舞');
        VX.nova(P.pos.clone(), 4, 0.3, { style: 'dark' }); G.fx.smoke(P.pos.clone().add(V(0, 0.6, 0)), 18, 1.3, 0x1a1024, 0.5, 1.3);
        G.sfx.magic(P.pos, 'dark'); break;
      case 'ult_orbital': A.auras.push({ kind: 'beam', t: p.dur, r: p.r, dps: sc(p.dps), pt: aimPt(70), track: m.x_track ? 9 : 3, sk: id }); G.sfx.zap && G.sfx.zap(P.pos); break;
      case 'ult_sanctuary': { const c = P.pos.clone(); A.auras.push({ kind: 'holy', t: p.dur, r: p.r, dps: sc(p.dps), c, heal: (m.x_heal ? 0.07 : 0.04) * A.effK(sk), follow: !!m.x_follow, sk: id }); VX.nova(c, p.r, 0.35, { style: 'holy', dome: false }); G.sfx.magic(P.pos, 'holy'); break; }
      case 'ult_bloodstorm': A.auras.push({ kind: 'drain', t: p.dur, r: p.r, dps: sc(p.dps), follow: true, ls: m.x_ls ? 0.65 : 0.4, over: !!m.x_over, sk: id }); VX.nova(P.pos.clone(), p.r, 0.4, { style: 'blood', dome: false }); G.sfx.magic(P.pos, 'dark'); break;
      case 'ult_overcharge':
        P.ocCd = Math.max(0.12, 0.3 * Math.pow(0.95, A.totalLv(sk))); C.cdResetAll(); P.pileCd = 0; tmp('ult_overcharge', p.dur, { skillDmg: m.x_power ? 0.3 : 0 }, '🔋', '過充電');
        VX.nova(P.pos.clone(), 4, 0.3, { style: 'emp' }); VX.motes(P, 0x80d0ff, p.dur, 16);
        G.sfx.zap && G.sfx.zap(P.pos); G.fx.flash(P.chestPos(), 0x80d0ff, 50, 0.3, 14); break;
      case 'ult_titan': {
        const before = st.maxHp;
        tmp('ult_titan', p.dur, { maxHpPct: 0.8, meleeDmg: 1.5, pileDmg: 1.0, armor: m.x_iron ? 0.4 : 0.25 }, '🗿', '巨人化');
        P.hp += Math.max(0, P.stats.maxHp - before);
        if (m.x_heal) C.heal(P.stats.maxHp * 0.3);
        if (m.x_stomp) A.auras.push({ kind: 'stomp', t: p.dur, r: 8 * (1 + m.area), dmg: sc(80), follow: true, every: 1.5, sk: id });
        VX.nova(P.pos.clone(), 5, 0.3, { style: 'shock' }); G.fx.debris(P.pos.clone().add(V(0, 0.3, 0)), G.world.mats.rock, 8, 0.3, 6);
        G.sfx.monster(null, 'roar', 0.7, 0.8); P.addShake(0.5); break;
      }
      case 'ult_bladestorm': P.bladesT = p.dur; P.bladesDps = sc(p.dps); P.bladesUlt = true; P.bladesN = 6; P.bladesR = 3 + (m.x_wide ? 1.5 : 0) + m.area * 3; P.bladesSk = id; G.sfx.whoosh(0.8, 0.6); break;
      case 'ult_execution': {
        // a red sigil under each foe within r; 2 s later a blade of light comes down on every one still standing
        const list = G.enemies.inRadius(P.pos, p.r);
        const th = m.x_thresh ? 0.3 : 0.2, k = m.x_dmg ? 1.4 : 1;
        for (const e of list) VX.area(e.pos.clone(), 1.3, 'blood', 2.1, { follow: e, col: [0xff2040, 0xff6070] });
        VX.nova(P.pos.clone(), p.r, 0.45, { style: 'blood', dome: false });
        A.task(() => {
          let kills = 0;
          for (const e of list) {
            if (!e.alive) continue;
            VX.pillar(e.pos.clone(), 0.7, 14, 0xff2a48, 0.3, { c2: 0xffd0d8, ground: false, speed: 9 });
            VX.slash(e.centerPos(), P.pos.clone().sub(e.pos).setY(0).normalize(), 1.6, 2.6, 0xff4060, { tilt: 0.9, dur: 0.16 });
            if (!e.boss && e.hp < e.maxHp * th) { C.damageEnemy(e, e.hp + 1, Object.assign({ noBuffs: true }, info)); kills++; continue; }
            C.damageEnemy(e, e.maxHp * (e.boss ? 0.06 : 0.25) * k * (1 + (st.ultDmg || 0)) * (1 + m.dmg), Object.assign({ noBuffs: true }, info));
            if (!e.alive) kills++;
          }
          if (m.x_refund && kills) { C.ultReduce(3 * kills); G.ui.toastSmall(`🔁 断罪の連鎖：CT-${3 * kills}秒`); }
          G.sfx.bell(); P.addShake(0.4);
        }, 2.0);
        G.sfx.magic(P.pos, 'dark'); if (!list.length) G.ui.toastSmall('⚖️ 断罪すべき者がいない');
        break;
      }
      default: ok = false;
    }
    if (!ok) return;
    // ---- casting an ultimate ----
    sk.cd = A.cdOf(sk); sk.maxCd = sk.cd;
    if (C.skOnCast(id)) sk.cd = 0;
    if (st.ultEcho && Math.random() < 0.2) { sk.cd *= 0.5; G.ui.toastSmall('🔁 残響：アルティメットのクールタイム半減'); }
    if (st.ultHeal) C.heal(st.maxHp * 0.25 * st.ultHeal);
    if (st.ultShield) C.timedShield(80 * st.ultShield, 10, 200);
    if (st.ultOver) C.temp('ua_over', 8, { dmg: 0.15, fireRate: 0.1 }, '⚡', '覚醒');
    if (st.ultTech) { for (let i = 1; i < 4; i++) { const s = P.skills[i]; if (s) { s.cd = 0; if (s.maxCharges) s.charges = s.maxCharges; } } P.pileCd = 0; }
    G.buffs.emit('onSkill', { skill: sk, ult: true });
    G.ui.abilityFlash(sk);
    G.ui.banner(`${def.icon} ${def.name}`, '— ULTIMATE —');
    G.sfx.ultCast ? G.sfx.ultCast() : G.sfx.ui('rare');
  }

  // auras that follow you or stay put (fire coats, drain, sanctuary, orbital beam)
  A.updateUltAuras = function (dt) {
    env();
    for (let i = A.auras.length - 1; i >= 0; i--) {
      const a = A.auras[i]; a.t -= dt; a.tick = (a.tick || 0) - dt;
      const c = a.kind === 'beam' ? a.pt : a.follow ? P.pos : a.c;
      if (a.kind === 'stomp') {
        a.tick = (a.tick || 0); if (a.tick <= 0) { a.tick = a.every; const sc0 = P.pos.clone(); VX.nova(sc0, a.r, 0.25, { style: 'shock', dome: false }); A.radial(sc0, a.r, 0.25, (e) => { C.damageEnemy(e, a.dmg, { src: 'skill', ult: true, sk: a.sk }); if (!e.boss) C.stun(e, 0.4); }); G.fx.debris(sc0.clone().add(V(0, 0.3, 0)), G.world.mats.rock, 5, 0.25, 5); G.sfx.explosion(P.pos, 0.6); P.addShake(0.3); }
        if (a.t <= 0) A.auras.splice(i, 1);
        continue;
      }
      if (a.kind === 'beam') a.pt.lerp(A.aim(70).floorPt, Math.min(1, dt * (a.track || 3)));
      VX.auraTick(a, c, dt); // (its look: vfx.js, the same on every screen)
      if (a.tick <= 0) {
        a.tick = 0.5;
        let dealt = 0;
        let nb = 0;
        for (const e of G.enemies.inRadius(c, a.r)) { const d = C.damageEnemy(e, a.dps * 0.5, { src: 'skill', ult: true, proc: true, sk: a.sk, elem: a.burn ? 'fire' : undefined }); dealt += d || 0; if (a.burn) C.status(e, 'burn', 1); if (a.kind === 'holy') C.status(e, 'frost', 1); if (a.kind === 'drain' && d > 0 && nb++ < 6) G.fx.beam(e.centerPos(), P.chestPos(), 0xc01828, 0.05, 0.35); }
        if (a.ls && dealt) { const h = dealt * a.ls, room = P.stats.maxHp - P.hp; C.heal(h, true); if (a.over && h > room) C.timedShield(h - room, 8, 120); }
        if (a.heal && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < a.r) C.heal(P.stats.maxHp * a.heal * 0.5, true);
      }
      if (a.t <= 0) { VX.auraEnd(a); A.auras.splice(i, 1); if (a.onEnd) A.withSk(a.sk, a.onEnd)(); }
    }
    if (P.bladesUlt && P.bladesT <= 0) P.bladesUlt = false;
    // time-limited shields expire (whatever of them is left is removed)
    if (P.tShields && P.tShields.length) for (let i = P.tShields.length - 1; i >= 0; i--) { const s = P.tShields[i]; s.t -= dt; if (s.t <= 0) { P.os = Math.max(0, P.os - Math.min(P.os, s.left)); P.tShields.splice(i, 1); } }
  };
  A.clearUltAuras = function () { for (const a of A.auras) VX.auraEnd(a); A.auras.length = 0; A.tasks.length = 0; A.flows.length = 0; };
})();
