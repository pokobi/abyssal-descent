'use strict';
// ULTIMATES: the Q slot. Very strong, very long cooldowns (~95-150 s). Everyone starts with 不屈の城塞;
// others are found in shops / events like skills. They count as skills for damage (src 'skill', info.ult).
(function () {
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  // [id, name, icon, rarity, price, cooldown, desc, params]
  const UL = [
    ['ult_bastion', '不屈の城塞', '🏰', 'rare', 3200, 100, '10秒間、金色の障壁を纏う。被ダメ-60%・毎秒最大HPの3%回復。', { dur: 10 }],
    ['ult_meteor', '星落とし', '🌠', 'legendary', 9000, 125, '照準地点の周囲に、2.5秒かけて5つの巨大隕石を落とす。', { r: 7, dmg: 520, n: 5 }],
    ['ult_timestop', '時止め', '⏱️', 'legendary', 9500, 140, '5秒間、敵と投射物の時間がほぼ止まる。', { dur: 5 }],
    ['ult_berserk', '鬼神化', '👹', 'epic', 7800, 120, '12秒間、与ダメ+80%・連射速度+40%・吸血8%・移動速度+20%。', { dur: 12 }],
    ['ult_blackhole', '虚無の渦', '🌀', 'legendary', 9200, 130, '照準地点に巨大な重力場を5秒間生み、最後に大爆縮させる。', { r: 14, dur: 5, dmg: 800 }],
    ['ult_judgement', '天罰', '⚡', 'epic', 8200, 120, '周囲40mの全ての敵に落雷し、ダメージと1.5秒のスタン（ボスは無効）。', { r: 40, dmg: 380 }],
    ['ult_phoenix', '鳳凰転生', '🐦', 'legendary', 9000, 150, '15秒間、炎の衣を纏い周囲を焼く。その間に倒れるとHP50%で蘇る。', { dur: 15, dps: 90, r: 6 }],
    ['ult_armory', '無限兵装', '🔫', 'epic', 7600, 110, '15秒間、弾薬無限・連射速度+80%。', { dur: 15 }],
    ['ult_legion', '亡者の軍勢', '💀', 'epic', 8400, 140, '6体の骸骨兵を25秒間召喚し、共に戦わせる。', { n: 6, dur: 25, dmg: 55 }],
    ['ult_tsunami', '大海嘯', '🌊', 'epic', 8000, 120, '前方30mを大波で押し流す。ダメージと大きな吹き飛ばし。', { len: 30, w: 14, dmg: 450 }],
    ['ult_cryo', '絶対零度', '🧊', 'epic', 8000, 120, '周囲25mの敵を凍結させ、ダメージを与える。', { r: 25, dmg: 300 }],
    ['ult_inferno', '煉獄', '🔥', 'epic', 7800, 120, '8秒間、自分の周囲12mを業火で包み、敵を炎上させる。', { r: 12, dur: 8, dps: 110 }],
    ['ult_shadow', '影の舞', '🥷', 'epic', 8200, 125, '10秒間透明になり、会心率+60%・会心ダメージ+50%。', { dur: 10 }],
    ['ult_orbital', '衛星砲', '🛰️', 'legendary', 9400, 130, '6秒間、照準地点を追う天からの光線が地上を焼き払う。', { dur: 6, dps: 360, r: 3.2 }],
    ['ult_sanctuary', '聖域', '✨', 'rare', 7200, 120, '10秒間、足元に聖域を展開。中では毎秒HP4%回復、敵は継続ダメージと鈍化。', { r: 10, dur: 10, dps: 70 }],
    ['ult_bloodstorm', '血の嵐', '🩸', 'epic', 8000, 120, '8秒間、周囲15mの敵から生命力を吸い続け、与ダメの40%を回復する。', { r: 15, dur: 8, dps: 110 }],
    ['ult_overcharge', '過充電', '🔋', 'rare', 6800, 95, '全スキルとグラップルのクールタイムを即リセット。10秒間、スキルのクールタイム-70%。', { dur: 10 }],
    ['ult_titan', '巨人化', '🗿', 'epic', 8600, 140, '12秒間、最大HP+80%・近接ダメージ+150%・パイルドライバー威力+100%・被ダメ-25%。', { dur: 12 }],
    ['ult_bladestorm', '剣の嵐', '🗡️', 'epic', 8200, 120, '10秒間、周囲を刃が高速回転し、触れた敵を切り刻む。', { dur: 10, dps: 240 }],
    ['ult_execution', '断罪', '⚖️', 'legendary', 9600, 135, '周囲30mの敵に刻印し、2秒後に最大HPの25%（ボス6%）のダメージ。HP20%以下の通常敵は即死。', { r: 30 }],
  ];
  G.ULTS = UL.map(([id, name, icon, rarity, price, cd, desc, p]) => ({ id, name, icon, rarity, price, cd, desc, p, kind: 'ult', ult: true }));
  for (const u of G.ULTS) G.SKILL_BY_ID[u.id] = u;
  G.DEFAULT_ULT = 'ult_bastion';

  const A = G.abilities;
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
        if (m.x_nova) for (const e of G.enemies.inRadius(P.pos, 8)) { const to = e.pos.clone().sub(P.pos).setY(0).normalize(); C.damageEnemy(e, sc(150), Object.assign({ knock: 20, dir: to.setY(0.5) }, info)); }
        G.fx.ring(P.pos.clone(), 3, 0xffd070, 0.6); G.fx.ring(P.pos.clone(), 5, 0xfff0b0, 0.9); G.fx.flash(P.chestPos(), 0xffd070, 80, 0.4, 16); G.sfx.magic(P.pos, 'holy'); G.sfx.shieldUp ? G.sfx.shieldUp() : G.sfx.bell();
        for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; G.fx.add.spawn(P.pos.x + Math.cos(a) * 1.2, P.pos.y + 0.2, P.pos.z + Math.sin(a) * 1.2, Math.cos(a) * 2, U.rand(2, 5), Math.sin(a) * 2, 0.9, 0.12, 0.02, 1, 0.85, 0.4, 1, 0, 0); }
        break;
      }
      case 'ult_meteor': {
        const c = aimPt(60), n = p.n + (m.x_more ? 3 : 0);
        for (let i = 0; i < n; i++) {
          const pt = i ? c.clone().add(V(U.rand(-p.r, p.r), 0, U.rand(-p.r, p.r))) : c.clone();
          later(() => {
            G.fx.telegraph(pt.clone().setY(pt.y + 0.02), p.r, 1.0, 0xff6020);
            later(() => { G.fx.explosion(pt.clone().add(V(0, 1, 0)), p.r, 0xff8030, { decal: true }); C.explode(pt.clone().add(V(0, 1, 0)), p.r, sc(p.dmg), Object.assign({ color: 0xff7030, noFx: true }, info)); if (m.x_crater) C.zone(pt, p.r * 0.7, 5, 'fire', sc(40)); G.sfx.explosion(pt, 1.6); P.addShake(0.4); }, 1000);
          }, i * 450);
        }
        G.sfx.rumble(3, 1); break;
      }
      case 'ult_timestop':
        G.game.chronoT = p.dur; G.game.chronoSlow = 0.95; // enemies keep 5% of their speed
        tmp('ult_timestop', p.dur, { dmg: m.x_free ? 0.35 : 0, hpRegen: m.x_heal ? st.maxHp * 0.04 : 0 }, '⏱️', '時止め');
        G.ui.tint('chrono', p.dur); G.sfx.magic(P.pos, 'dark'); G.sfx.bell(); break;
      case 'ult_berserk': tmp('ult_berserk', p.dur, { dmg: 0.8 + (m.x_rage ? 0.4 : 0), fireRate: 0.4, lifesteal: 0.08 + (m.x_blood ? 0.06 : 0), moveSpeed: 0.2, armor: m.x_iron ? 0.3 : 0 }, '👹', '鬼神化'); G.ui.tint('rage', p.dur); G.sfx.monster(null, 'roar', 1.3, 0.6); break;
      case 'ult_blackhole': {
        const pt = aimPt(45);
        C.zone(pt, p.r, p.dur, 'gravity', 0, { onEnd: () => { C.explode(pt.clone().add(V(0, 1, 0)), p.r * 0.75, sc(p.dmg) * (m.x_crush ? 1.6 : 1), Object.assign({ color: 0xa070ff }, info)); P.addShake(0.6); } });
        if (m.x_tear) C.zone(pt, p.r, p.dur, 'grasp', sc(80), { interval: 0.5 });
        G.sfx.magic(pt, 'dark'); G.sfx.rumble(p.dur, 0.8); break;
      }
      case 'ult_judgement': {
        const strike = (k) => {
          const list = G.enemies.inRadius(P.pos, p.r);
          list.forEach((e, i) => later(() => { if (!e.alive) return; const c = e.centerPos(); G.fx.lightning(c.clone().add(V(U.rand(-3, 3), 30, U.rand(-3, 3))), c, 0xe0e8ff); G.fx.flash(c, 0xc0d0ff, 40, 0.15, 14); C.damageEnemy(e, sc(p.dmg) * k, Object.assign({ elem: 'shock' }, info)); if (!e.boss) C.stun(e, m.x_stun ? 3 : 1.5); }, i * 60));
          G.sfx.thunder && G.sfx.thunder(1); P.addShake(0.4);
          return list.length;
        };
        if (!strike(1)) G.ui.toastSmall('⚡ 雷は天を裂いた（敵がいない）');
        if (m.x_twice) later(() => strike(0.6), 1000);
        break;
      }
      case 'ult_phoenix':
        tmp('ult_phoenix', p.dur, { hpRegen: m.x_heal ? st.maxHp * 0.02 : 0 }, '🐦', '鳳凰転生'); P.phoenixFull = !!m.x_rebirth;
        A.auras.push({ kind: 'fire', t: p.dur, r: p.r, dps: sc(p.dps), follow: true, col: 0xff7030, sk: id }); G.sfx.fire && G.sfx.fire(P.pos, true); G.fx.fireBurst(P.pos.clone(), 3); break;
      case 'ult_armory': tmp('ult_armory', p.dur, { infAmmo: 1, fireRate: m.x_rate ? 1.2 : 0.8, dmg: m.x_dmg ? 0.25 : 0 }, '🔫', '無限兵装'); C.refill && C.refill(1, true); G.sfx.mech('boltBack'); G.sfx.mech('boltFwd', 0.15); break;
      case 'ult_legion': { const n = p.n + (m.x_more ? 3 : 0); for (let i = 0; i < n; i++) A.summonSkeleton(P.pos.clone().add(V(Math.cos(i * 6.28 / n) * 2.5, 0, Math.sin(i * 6.28 / n) * 2.5)), p.dur, sc(p.dmg), m.x_explode ? sc(150) : 0); G.sfx.monster(P.pos, 'groan', 1.1, 0.8); break; }
      case 'ult_tsunami': {
        const f = P.forward(); f.y = 0; f.normalize();
        const a = P.pos.clone(), b = a.clone().addScaledVector(f, p.len);
        const wave = (k) => {
          for (const e of G.enemies.inRadius(a.clone().lerp(b, 0.5), p.len * 0.6)) {
            const t = U.clamp(e.pos.clone().sub(a).dot(f), 0, p.len), side = e.pos.clone().sub(a.clone().addScaledVector(f, t)).setY(0).length();
            if (side < p.w / 2 && e.pos.clone().sub(a).dot(f) > -1) C.damageEnemy(e, sc(p.dmg) * k, Object.assign({ knock: 22 * k, dir: f.clone().setY(0.4) }, info));
          }
          for (let i = 0; i < 14; i++) setTimeout(() => { const q = a.clone().addScaledVector(f, i * p.len / 14); for (let n = 0; n < 10; n++) G.fx.norm.spawn(q.x + U.rand(-p.w / 2, p.w / 2), q.y + U.rand(0, 3), q.z + U.rand(-1, 1), f.x * 8, U.rand(2, 6), f.z * 8, 1.0, 0.8, 2.2, 0.45, 0.7, 1, 0.8, -0.5, 1); }, i * 40);
          G.sfx.whoosh(1, 0.4); G.sfx.rumble(1.2, k);
        };
        wave(1);
        if (m.x_second) later(() => wave(0.7), 800);
        break;
      }
      case 'ult_cryo': {
        const hit = G.enemies.inRadius(P.pos, p.r);
        for (const e of hit) { C.damageEnemy(e, sc(p.dmg), Object.assign({ elem: 'frost' }, info)); C.status(e, 'frost', 10); }
        if (m.x_shatter) later(() => { for (const e of hit) if (e.alive) { C.damageEnemy(e, sc(p.dmg) * 0.6, Object.assign({ elem: 'frost' }, info)); G.fx.sparks(e.centerPos(), null, 10, 0xd8f0ff, 5); } G.sfx.ice(P.pos); }, 1500);
        if (m.x_armor) tmp('ult_cryo_armor', 8, { armor: 0.3 }, '🛡️');
        G.fx.ring(P.pos, p.r, 0xcfefff, 0.8); G.fx.flash(P.chestPos(), 0xd8f0ff, 70, 0.4, 30); G.sfx.magic(P.pos, 'ice'); break;
      }
      case 'ult_inferno':
        A.auras.push({ kind: 'fire', t: p.dur, r: p.r, dps: sc(p.dps), follow: true, col: 0xff5010, burn: true, sk: id, onEnd: m.x_end ? () => C.explode(P.pos.clone().add(V(0, 1, 0)), 12, sc(400), Object.assign({ color: 0xff5010 }, info)) : null });
        if (m.x_heal) tmp('ult_inferno_heal', p.dur, { hpRegen: st.maxHp * 0.02 }, '💚');
        G.sfx.fire && G.sfx.fire(P.pos, true); break;
      case 'ult_shadow': tmp('ult_shadow', p.dur, { invis: 1, critChance: 0.6, critMul: m.x_lethal ? 1.0 : 0.5, lifesteal: m.x_vamp ? 0.05 : 0, moveSpeed: m.x_speed ? 0.3 : 0 }, '🥷', '影の舞'); G.sfx.magic(P.pos, 'dark'); break;
      case 'ult_orbital': A.auras.push({ kind: 'beam', t: p.dur, r: p.r, dps: sc(p.dps), pt: aimPt(70), track: m.x_track ? 9 : 3, sk: id }); G.sfx.zap && G.sfx.zap(P.pos); break;
      case 'ult_sanctuary': A.auras.push({ kind: 'holy', t: p.dur, r: p.r, dps: sc(p.dps), c: P.pos.clone(), heal: (m.x_heal ? 0.07 : 0.04) * A.effK(sk), follow: !!m.x_follow, sk: id }); G.sfx.magic(P.pos, 'holy'); break;
      case 'ult_bloodstorm': A.auras.push({ kind: 'drain', t: p.dur, r: p.r, dps: sc(p.dps), follow: true, ls: m.x_ls ? 0.65 : 0.4, over: !!m.x_over, sk: id }); G.sfx.magic(P.pos, 'dark'); break;
      case 'ult_overcharge': P.ocCd = Math.max(0.12, 0.3 * Math.pow(0.95, A.totalLv(sk))); C.cdResetAll(); P.pileCd = 0; tmp('ult_overcharge', p.dur, { skillDmg: m.x_power ? 0.3 : 0 }, '🔋', '過充電'); G.sfx.zap && G.sfx.zap(P.pos); G.fx.flash(P.chestPos(), 0x80d0ff, 50, 0.3, 14); break;
      case 'ult_titan': {
        const before = st.maxHp;
        tmp('ult_titan', p.dur, { maxHpPct: 0.8, meleeDmg: 1.5, pileDmg: 1.0, armor: m.x_iron ? 0.4 : 0.25 }, '🗿', '巨人化');
        P.hp += Math.max(0, P.stats.maxHp - before);
        if (m.x_heal) C.heal(P.stats.maxHp * 0.3);
        if (m.x_stomp) A.auras.push({ kind: 'stomp', t: p.dur, r: 8 * (1 + m.area), dmg: sc(80), follow: true, every: 1.5, sk: id });
        G.sfx.monster(null, 'roar', 0.7, 0.8); P.addShake(0.5); break;
      }
      case 'ult_bladestorm': P.bladesT = p.dur; P.bladesDps = sc(p.dps); P.bladesUlt = true; P.bladesN = 6; P.bladesR = 3 + (m.x_wide ? 1.5 : 0) + m.area * 3; P.bladesSk = id; G.sfx.whoosh(0.8, 0.6); break;
      case 'ult_execution': {
        const list = G.enemies.inRadius(P.pos, p.r);
        const th = m.x_thresh ? 0.3 : 0.2, k = m.x_dmg ? 1.4 : 1;
        for (const e of list) G.fx.ring(e.pos.clone().setY(e.pos.y + 0.05), 1.2, 0xff2040, 2);
        later(() => {
          let kills = 0;
          for (const e of list) {
            if (!e.alive) continue;
            const c = e.centerPos(); G.fx.beam(c.clone().add(V(0, 12, 0)), c, 0xff3050, 0.25, 0.25);
            if (!e.boss && e.hp < e.maxHp * th) { C.damageEnemy(e, e.hp + 1, Object.assign({ noBuffs: true }, info)); kills++; continue; }
            C.damageEnemy(e, e.maxHp * (e.boss ? 0.06 : 0.25) * k * (1 + (st.ultDmg || 0)) * (1 + m.dmg), Object.assign({ noBuffs: true }, info));
            if (!e.alive) kills++;
          }
          if (m.x_refund && kills) { C.ultReduce(3 * kills); G.ui.toastSmall(`🔁 断罪の連鎖：CT-${3 * kills}秒`); }
          G.sfx.bell(); P.addShake(0.4);
        }, 2000);
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
        a.tick = (a.tick || 0); if (a.tick <= 0) { a.tick = a.every; for (const e of G.enemies.inRadius(P.pos, a.r)) { C.damageEnemy(e, a.dmg, { src: 'skill', ult: true, sk: a.sk }); if (!e.boss) C.stun(e, 0.4); } G.fx.ring(P.pos.clone(), a.r, 0xb09060, 0.5); G.sfx.explosion(P.pos, 0.6); P.addShake(0.3); }
        if (a.t <= 0) A.auras.splice(i, 1);
        continue;
      }
      if (a.kind === 'beam') { a.pt.lerp(A.aim(70).floorPt, Math.min(1, dt * (a.track || 3))); G.fx.beam(a.pt.clone().add(V(0, 40, 0)), a.pt.clone().setY(a.pt.y + 0.1), 0xfff0c0, a.r * 0.4, 0.05); if (Math.random() < dt * 30) G.fx.flameLick(a.pt.x + U.rand(-a.r, a.r) * 0.6, a.pt.y + 0.1, a.pt.z + U.rand(-a.r, a.r) * 0.6, 2, 0xffe0a0); }
      if (a.kind === 'fire' && Math.random() < dt * 40) { const an = Math.random() * 6.28, d = Math.random() * a.r; G.fx.flameLick(c.x + Math.cos(an) * d, c.y + 0.1, c.z + Math.sin(an) * d, 1.6, a.col); }
      if (a.kind === 'drain' && Math.random() < dt * 20) G.fx.norm.spawn(c.x + U.rand(-a.r, a.r), c.y + U.rand(0.3, 2), c.z + U.rand(-a.r, a.r), 0, 0.5, 0, 0.8, 0.12, 0.25, 0.7, 0.05, 0.1, 0.8, 0, 1);
      if (a.kind === 'holy' && a.ring && a.follow) a.ring.position.copy(c).setY(c.y + 0.05);
      if (a.kind === 'holy') { if (!a.ring) { a.ring = new THREE.Mesh(new THREE.RingGeometry(a.r - 0.3, a.r, 48), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); a.ring.rotation.x = -Math.PI / 2; a.ring.position.copy(c).setY(c.y + 0.05); G.scene.add(a.ring); } if (Math.random() < dt * 20) G.fx.add.spawn(c.x + U.rand(-a.r, a.r) * 0.7, c.y + 0.1, c.z + U.rand(-a.r, a.r) * 0.7, 0, 1.2, 0, 1, 0.12, 0.02, 1, 0.9, 0.5, 0.8, -0.3, 0.5); }
      if (a.tick <= 0) {
        a.tick = 0.5;
        let dealt = 0;
        for (const e of G.enemies.inRadius(c, a.r)) { const d = C.damageEnemy(e, a.dps * 0.5, { src: 'skill', ult: true, proc: true, sk: a.sk, elem: a.burn ? 'fire' : undefined }); dealt += d || 0; if (a.burn) C.status(e, 'burn', 1); if (a.kind === 'holy') C.status(e, 'frost', 1); }
        if (a.ls && dealt) { const h = dealt * a.ls, room = P.stats.maxHp - P.hp; C.heal(h, true); if (a.over && h > room) C.timedShield(h - room, 8, 120); }
        if (a.heal && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < a.r) C.heal(P.stats.maxHp * a.heal * 0.5, true);
      }
      if (a.t <= 0) { if (a.ring) G.scene.remove(a.ring); A.auras.splice(i, 1); if (a.onEnd) A.withSk(a.sk, a.onEnd)(); }
    }
    if (P.bladesUlt && P.bladesT <= 0) P.bladesUlt = false;
    // time-limited shields expire (whatever of them is left is removed)
    if (P.tShields && P.tShields.length) for (let i = P.tShields.length - 1; i >= 0; i--) { const s = P.tShields[i]; s.t -= dt; if (s.t <= 0) { P.os = Math.max(0, P.os - Math.min(P.os, s.left)); P.tShields.splice(i, 1); } }
  };
  A.clearUltAuras = function () { for (const a of A.auras) if (a.ring) G.scene.remove(a.ring); A.auras.length = 0; };
})();
