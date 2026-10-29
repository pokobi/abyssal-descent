'use strict';
// Active skills (Q/X/Z), consumables (G/T grenades, 4-7 utilities), grapple rope rendering.
(function () {
  const A = (G.abilities = {});
  const U = G.U, I = G.input;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, C;
  A.init = function () { P = G.player; C = G.combat; buildRope(); };

  // ---------------- skill slots ----------------
  A.makeSlot = function (id) {
    const def = G.SKILL_BY_ID[id];
    const s = { id, def, cd: 0, maxCd: def.cd, charges: 0, maxCharges: def.p.charges || 0, lv: 0 };
    if (s.maxCharges) s.charges = s.maxCharges;
    G.save.mark('items', id);
    return s;
  };
  A.SKILL_CD_MUL = 1.2; A.SKILL_POW_MUL = 0.85;
  // Mastery boons add levels in a separate layer: shown as Lv(base+mastery), and the numbers use the total (so Lv 15 can be passed, up to 15+3)
  A.mastery = (sk) => { const p = G.player; return sk && p && p.buffs ? p.buffs.get('sk_' + sk.id + '_mastery') || 0 : 0; };
  A.totalLv = (sk) => ((sk && sk.lv) || 0) + A.mastery(sk);
  A.lvHTML = (sk) => { const b = (sk && sk.lv) || 0, m = A.mastery(sk); return m ? `<span class="lv-m"><i class="sdw">Lv${b}</i><i class="sdb">+${m}</i></span>` : b ? `<span class="sdw">Lv${b}</span>` : ''; };
  A.lvText = (sk) => { const b = (sk && sk.lv) || 0, m = A.mastery(sk); return m ? `Lv${b + m}(${b}+${m})` : b ? 'Lv' + b : ''; };
  A.cdOf = (sk, bare) => {
    const L = bare ? (sk && sk.lv) || 0 : A.totalLv(sk), lvK = 1 - Math.min(0.36, 0.02 * L);
    if (bare) return sk.def.cd * (sk.def.ult ? 1 : A.SKILL_CD_MUL) * lvK;
    const st = P.stats, own = 1 - Math.min(0.5, A.skm ? A.skm(sk.id).cd : 0);
    if (sk.def.ult) return sk.def.cd * (1 - st.cdr * 0.5) * (1 - (st.ultCd || 0)) * lvK * own;
    return sk.def.cd * A.SKILL_CD_MUL * (1 - st.cdr) * (1 - (st.skillCd || 0)) * lvK * own * (P.temps.has('ult_overcharge') ? (P.ocCd || 0.3) : 1);
  };
  // skill power grows with its level (raised with skill tomes / buying the same skill again)
  A.power = (sk, bare) => Math.pow(1.3, bare ? (sk && sk.lv) || 0 : A.totalLv(sk)) * A.SKILL_POW_MUL * (1 + (!bare && sk && A.skm ? A.skm(sk.id).dmg : 0));
  // the other half of levelling: buffs and heals grow too (damage uses A.power). +10% of every buff amount per level; damage reduction closes in on a cap
  A.effK = (sk, bare) => 1 + 0.1 * (bare ? (sk && sk.lv) || 0 : A.totalLv(sk));
  const AMT = ['dmg', 'fireRate', 'lifesteal', 'moveSpeed', 'jumpPower', 'reloadSpeed', 'critChance', 'critMul', 'skillDmg', 'meleeDmg', 'pileDmg', 'maxHpPct'];
  A.effStats = (sk, s, bare) => {
    const o = {}, k = A.effK(sk, bare), L = bare ? (sk && sk.lv) || 0 : A.totalLv(sk);
    for (const key in s) {
      const v = s[key];
      if (key === 'armor' && v > 0) o[key] = Math.min(0.92, 1 - (1 - v) * Math.pow(0.93, L));
      else if (AMT.includes(key) && v > 0) o[key] = key === 'critChance' ? Math.min(1, v * k) : v * k;
      else o[key] = v;
    }
    return o;
  };
  // what a level changes in the skills whose effect is not damage: [label, base, now, unit, decimals, lowerIsBetter, mid] (for the status screen; the numbers mirror castSkill / castUlt)
  A.effInfo = function (sk) {
    const id = sk.id, m = A.skm(id), k = A.effK(sk), k0 = A.effK(sk, true), L = A.totalLv(sk), L0 = (sk && sk.lv) || 0;
    const es = (key, v, bare) => A.effStats(sk, { [key]: v }, bare)[key], pc = (v) => v * 100;
    const row = (lab, key, v0, vCur) => { const v = vCur !== undefined ? vCur : v0; return [lab, pc(v0), pc(es(key, v, false)), '%', undefined, false, pc(es(key, v0, true))]; };
    switch (id) {
      case 'ult_bastion': { const r = m.x_regen ? 5 : 3, rk = A.bastionRegenK ? A.bastionRegenK(sk) : 1 + 0.04 * L, rk0 = A.bastionRegenK ? A.bastionRegenK(sk, true) : 1 + 0.04 * L0; return [row('被ダメ軽減', 'armor', 0.6, m.x_fort ? 0.72 : 0.6), ['毎秒回復（最大HP比）', 3, r * rk, '%', 1, false, 3 * rk0]]; }
      case 'ult_berserk': return [row('与ダメ', 'dmg', 0.8, 0.8 + (m.x_rage ? 0.4 : 0)), row('連射速度', 'fireRate', 0.4), row('吸血', 'lifesteal', 0.08, 0.08 + (m.x_blood ? 0.06 : 0)), row('移動速度', 'moveSpeed', 0.2)];
      case 'ult_armory': return [row('連射速度', 'fireRate', 0.8, m.x_rate ? 1.2 : 0.8)];
      case 'ult_shadow': return [row('会心率', 'critChance', 0.6), row('会心ダメージ', 'critMul', 0.5, m.x_lethal ? 1 : 0.5)];
      case 'ult_titan': return [row('最大HP', 'maxHpPct', 0.8), row('近接ダメージ', 'meleeDmg', 1.5), row('パイルドライバー威力', 'pileDmg', 1), row('被ダメ軽減', 'armor', 0.25, m.x_iron ? 0.4 : 0.25)];
      case 'ult_overcharge': return [['スキルのCT短縮', 70, pc(1 - Math.max(0.12, 0.3 * Math.pow(0.95, L))), '%', 0, false, pc(1 - Math.max(0.12, 0.3 * Math.pow(0.95, L0)))]];
      case 'ult_sanctuary': { const h = m.x_heal ? 7 : 4; return [['毎秒回復（最大HP比）', 4, h * k, '%', 1, false, 4 * k0]]; }
      case 'berserk': return [row('与ダメ', 'dmg', 0.5, m.x_fury ? 0.8 : 0.5), row('連射速度', 'fireRate', 0.3), row('吸血', 'lifesteal', 0.05)];
      case 'haste': return [row('移動速度', 'moveSpeed', 0.6), row('ジャンプ力', 'jumpPower', 0.3, m.x_jump ? 0.6 : 0.3)];
      case 'overdrive': return [row('連射速度', 'fireRate', 0.6, m.x_rate ? 0.9 : 0.6)];
      case 'thornarmor': return [row('被ダメ軽減', 'armor', 0.35, m.x_harden ? 0.5 : 0.35), ['反射ダメージ', 100, (m.x_reflect ? 200 : 100) * k, '%', 0, false, 100 * k0]];
      case 'healaura': return [row('被ダメ軽減', 'armor', 0.2, m.x_armor ? 0.35 : 0.2)];
      case 'warcry': return [row('与ダメ', 'dmg', 0.25, m.x_rally ? 0.45 : 0.25)];
      case 'cloak': return [['最初の一撃の会心倍率', 2.5, 1 + 1.5 * k, '倍', 2, false, 1 + 1.5 * k0]];
      case 'chrono': { const b = m.x_deep ? 0.2 : 0.4; return [['敵を遅くする割合', 60, pc(1 - Math.max(0.08, b * Math.pow(0.93, L))), '%', 0, false, pc(1 - Math.max(0.08, 0.4 * Math.pow(0.93, L0)))]]; }
      case 'mark': return [['受けるダメージ増加', 60, 60 * (1 + 0.5 * (k - 1)), '%', 0, false, 60 * (1 + 0.5 * (k0 - 1))]];
      case 'rewind': return [['巻き戻り時の回復（最大HP比）', 0, 2 * L, '%', 0, false, 2 * L0]];
      case 'flight': return [['上昇の勢い', 100, 100 * (1 + 0.02 * L), '%', 0, false, 100 * (1 + 0.02 * L0)]];
      case 'dash': case 'dash2': return [['突進の距離', 100, 100 * (1 + 0.03 * L), '%', 0, false, 100 * (1 + 0.03 * L0)]];
      case 'ricostorm': return [['跳弾のダメージ', 100, 100 * (1 + 0.06 * L), '%', 0, false, 100 * (1 + 0.06 * L0)]];
    }
    return [];
  };
  A.isUlt = (sk) => !!(sk && sk.def && sk.def.ult);
  A.MAXLV = 15;
  A.ready = (sk) => sk && (sk.maxCharges ? sk.charges > 0 : sk.cd <= 0);
  A.consume = function (sk) {
    G.buffs.emit('onSkill', { skill: sk });
    if (P.stats.techShield) C.timedShield(20 * P.stats.techShield, 6, 120);
    if (C.skOnCast(sk.id)) return;
    if (P.has('s_echo') && Math.random() < 0.25) { G.ui.toastSmall('🔁 残響詠唱！'); return; }
    if (sk.maxCharges) { sk.charges--; if (sk.cd <= 0) sk.cd = A.cdOf(sk); }
    else sk.cd = A.cdOf(sk);
    if (sk.halfCd) { sk.cd *= 0.5; sk.halfCd = false; G.ui.toastSmall('🌾 豊作：クールタイム半減'); }
    sk.maxCd = A.cdOf(sk);
    G.ui.abilityFlash(sk);
  };
  A.update = function (dt) {
    A.updateUltAuras && A.updateUltAuras(dt);
    A.tickUseQueue();
    for (let i = 0; i < 4; i++) {
      const sk = P.skills[i]; if (!sk) continue;
      // charges: the skill's own + 多重充填 (charge skills only) + this skill's charge augments
      { const base = sk.def.p.charges || 0, ex = A.skm(sk.id).charges + (base && !sk.def.ult ? P.stats.skillCharges || 0 : 0), mc = base ? base + ex : ex ? 1 + ex : 0;
        if (mc !== sk.maxCharges) { if (!sk.maxCharges) sk.charges = sk.cd > 0 ? mc - 1 : mc; else sk.charges = Math.max(0, sk.charges + mc - sk.maxCharges); sk.maxCharges = mc; } }
      if (sk.cd > 0) {
        sk.cd -= dt;
        if (sk.cd <= 0) {
          if (sk.maxCharges) { sk.charges = Math.min(sk.maxCharges, sk.charges + 1); if (sk.charges < sk.maxCharges) sk.cd = A.cdOf(sk); else sk.cd = 0; }
          else sk.cd = 0;
          if (A.isUlt(sk)) { G.sfx.ultReady ? G.sfx.ultReady() : G.sfx.ui('rare'); G.ui.toast(`⚡ アルティメット準備完了 — ${sk.def.icon} ${sk.def.name}（${G.input.skillKey(0)}）`, 'good'); }
          else G.sfx.ui('ready');
          G.ui.abilityFlash(sk);
        }
      }
      if (I.hit('skill' + (i + 1))) A.cast(sk);
    }
    // consumables
    A.updateItemKeys(dt);
    G.GrenHold.update(dt);
    // ongoing effects
    if (P.leap) {
      P.leap.t += dt;
      if (P.leap.t > 0.25 && P.grounded) {
        const pos = P.pos.clone(); pos.y += 0.3;
        C.explode(pos, P.leap.r, P.leap.dmg, { src: 'skill', sk: P.leap.sk, elem: P.leap.sk === 'flight' ? undefined : 'shock', color: P.leap.sk === 'flight' ? 0xffd0a0 : 0xbfd8ff, knock: 10 });
        if (P.leap.sk !== 'flight') for (const e of C.inRadius(pos, P.leap.r)) C.status(e, 'shock', 1);
        G.fx.ring(P.pos, P.leap.r, 0xcfe0ff, 0.45); G.sfx.zap(pos);
        P.leap = null;
      } else if (P.leap.t > (P.leap.maxT || 4)) P.leap = null;
    }
    if (P.glideT > 0) { P.glideT -= dt; if (!P.grounded && P.vel.y < -2.2 && I.down('jump')) P.vel.y = -2.2; }
    if (P.lunge) {
      const L = P.lunge; L.t += dt;
      const k = Math.min(1, L.t / 0.16);
      P.pos.lerpVectors(L.from, L.to, k);
      P.vel.set(0, 0, 0);
      if (k >= 1) {
        G.world.depenetrate(P.pos, P.hw, P.height);
        if (L.e.alive) {
          const d = C.damageEnemy(L.e, L.dmg, { src: 'skill', sk: L.sk, head: false, forceCrit: false, pos: L.e.centerPos() }); C.heal(d * (L.vamp || 0.3)); G.fx.blood(L.e.centerPos(), null, L.e.bloodColor, 20);
          if (L.cleave) for (const e of G.enemies.inRadius(L.e.pos, 4)) if (e !== L.e) C.damageEnemy(e, L.dmg * 0.6, { src: 'skill', sk: L.sk });
          if (L.reset && !L.e.alive && L.slot) { L.slot.cd = 0; G.ui.toastSmall('🔁 連撃：クールタイムリセット'); }
        }
        G.sfx.melee(true); P.addShake(0.4);
        P.lunge = null;
      }
    }
    for (const w of C.walls) { w.t -= dt; }
    for (let i = C.walls.length - 1; i >= 0; i--) if (C.walls[i].t <= 0) { C.walls[i].remove(); C.walls.splice(i, 1); }
  };

  function aim(range, wantEnemy) {
    const o = G.camera.position.clone(), d = P.forward();
    const wh = G.world.raycast(o, d, range);
    let e = null;
    const eh = G.enemies.raycast(o, d, wh ? wh.t : range, 0.6);
    if (eh) e = eh.e;
    if (!e && wantEnemy) {
      // soft lock: closest enemy to crosshair within 12 degrees
      let best = null, bd = Math.cos(THREE.MathUtils.degToRad(12));
      for (const en of G.enemies.inRadius(o, range)) {
        const to = en.centerPos().sub(o); const l = to.length(); to.divideScalar(l);
        const dot = to.dot(d);
        if (dot > bd && G.world.los(o, en.centerPos())) { bd = dot; best = en; }
      }
      e = best;
    }
    let point;
    if (e) point = e.pos.clone();
    else if (wh) point = wh.point.clone();
    else point = o.clone().addScaledVector(d, range);
    // project point to floor
    const fl = G.world.floorBelow(point.x, point.y + 0.3, point.z);
    const floorPt = V(point.x, fl > -50 ? fl : point.y, point.z);
    return { o, d, wh, e, point, floorPt };
  }
  A.aim = aim;

  A.cast = function (sk) {
    if (!sk || P.dead) return;
    if (!A.ready(sk)) { G.sfx.ui('deny'); G.ui.abilityDeny(sk); return; }
    if (A.isUlt(sk)) return A.castUlt(sk);
    const id = sk.id, prev = C.curSk;
    C.curSk = id;
    try { castSkill(sk); } finally { C.curSk = prev; }
  };
  // range / duration augments (all skills + this skill's own) scale the skill's numbers
  A.scaleP = function (sk, bare) {
    const p = Object.assign({}, sk.def.p), L = bare ? (sk && sk.lv) || 0 : A.totalLv(sk);
    if (!bare) {
      const st = P.stats, m = A.skm(sk.id), ult = A.isUlt(sk);
      const rk = 1 + (ult ? 0 : st.skillRad || 0) + m.area, dk = 1 + (ult ? st.ultDur || 0 : st.skillDur || 0) + m.dur;
      for (const k of ['r', 'len', 'range', 'w']) if (p[k]) p[k] *= rk;
      if (p.dur) p.dur *= dk;
    }
    if (!p.dmg && !p.dps && p.range) p.range *= 1 + 0.04 * L; // a pure-utility jump goes farther
    if (sk.id === 'barrier' || sk.id === 'ult_timestop') p.dur *= 1 + 0.04 * L; // (the only two whose level stretches the time; every other duration stays as it is)
    return p;
  };
  function castSkill(sk) {
    const p = A.scaleP(sk), m = A.skm(sk.id);
    const sc = (v) => v * A.power(sk);
    const ek = A.effK(sk), tmp = (a, d, s, i, l) => C.temp(a, d, A.effStats(sk, s), i, l);
    const id = sk.id;
    const later = (fn, ms) => A.later(id, fn, ms);
    let ok = true;
    const handFx = (col) => { const h = P.handPos(); G.fx.sparks(h, null, 8, col || 0xffd8a0, 3); };
    // fan of projectiles for the "triple" augments
    const fan = (n) => (n ? [0, -0.18, 0.18] : [0]);
    switch (id) {
      case 'groundpound': {
        const f = P.forward(); f.y = 0; f.normalize();
        for (const e of G.enemies.inRadius(P.pos, p.r)) {
          const to = e.pos.clone().sub(P.pos).setY(0); const l = to.length(); if (!m.x_full && l > 0.5 && to.divideScalar(l).dot(f) < 0.4) continue;
          to.normalize();
          C.damageEnemy(e, sc(p.dmg), { src: 'skill', knock: 10, dir: to.clone().setY(0.5) }); C.stun(e, m.x_stun ? 2 : 0.8);
        }
        const dirs = m.x_full ? [0, 1, 2, 3, 4, 5, 6, 7].map((k) => f.clone().applyAxisAngle(V(0, 1, 0), k * Math.PI / 4)) : [f];
        for (const df of dirs) for (let i = 1; i <= 10; i++) { const pt = P.pos.clone().addScaledVector(df, i * p.r / 10); setTimeout(() => { G.fx.dust(pt, V(0, 1, 0), 0x7a6a50, 3); G.fx.debris(pt, G.world.mats.rock, 2, 0.25, 5); }, i * 30); }
        P.pileCd = Math.max(0, (P.pileCd || 0) - (m.x_pile ? 5 : 2));
        G.sfx.explosion(P.pos, 0.8); P.addShake(0.4);
        break;
      }
      case 'anchorstorm': {
        const list = G.enemies.inRadius(P.pos, p.r).filter((e) => !e.boss && G.world.los(P.chestPos(), e.centerPos())).slice(0, p.n + (m.x_more ? 4 : 0));
        if (!list.length) { G.ui.toastSmall('⛓️ 対象がいない'); ok = false; break; }
        for (const e of list) { G.fx.beam(P.handPos(), e.centerPos(), 0x9a8a7a, 0.03, 0.35); const to = P.pos.clone().sub(e.pos).setY(0); e.knockback(to.normalize(), Math.min(24, P.pos.distanceTo(e.pos) * 2)); C.stun(e, 1.6); C.damageEnemy(e, sc(30), { src: 'skill' }); }
        if (m.x_slam) later(() => C.explode(P.pos.clone().add(V(0, 1, 0)), 4, sc(100), { src: 'skill', color: 0xc0a080 }), 350);
        G.sfx.chain(0.6, 0.8);
        break;
      }
      case 'dash': case 'dash2': {
        const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
        const f = (I.down('forward') ? 1 : 0) - (I.down('back') ? 1 : 0), r = (I.down('right') ? 1 : 0) - (I.down('left') ? 1 : 0);
        let dx = fx * f + rx * r, dz = fz * f + rz * r; const l = Math.hypot(dx, dz);
        if (l < 0.1) { dx = fx; dz = fz; } else { dx /= l; dz /= l; }
        const from = P.pos.clone(), to = from.clone().add(V(dx * 7, 0, dz * 7));
        const dpw = p.power * (1 + 0.03 * A.totalLv(sk)); P.vel.set(dx * dpw, P.grounded ? 2.5 : Math.max(P.vel.y, 1.5), dz * dpw);
        P.grounded = false; P.invulnT = 0.18; P.fovKick = 12;
        G.sfx.whoosh(0.35, 0.9);
        for (let i = 0; i < 16; i++) G.fx.norm.spawn(P.pos.x, P.pos.y + 0.8, P.pos.z, -dx * U.rand(2, 6) + U.rand(-1, 1), U.rand(0, 1), -dz * U.rand(2, 6) + U.rand(-1, 1), 0.5, 0.3, 0.9, 0.7, 0.7, 0.72, 0.35, 0, 2);
        if (id === 'dash2' || m.x_hit) {
          for (const e of G.enemies.inRadius(from.clone().lerp(to, 0.5), 5)) { C.damageEnemy(e, sc(id === 'dash2' ? p.dmg : 60), { src: 'skill', elem: id === 'dash2' ? 'shock' : undefined, knock: m.x_hit ? 10 : 0, dir: V(dx, 0.4, dz) }); if (id === 'dash2') G.fx.lightning(P.chestPos(), e.centerPos()); }
        }
        if (m.x_fire) for (let i = 0; i < 3; i++) { const pt = from.clone().lerp(to, (i + 0.5) / 3); const fl = G.world.floorBelow(pt.x, pt.y + 0.5, pt.z); if (fl > -50) pt.y = fl; C.zone(pt, 2, 3, 'fire', sc(25)); }
        if (m.x_after) C.explode(from.clone().add(V(0, 1, 0)), 4, sc(80), { src: 'skill', elem: 'shock', color: 0xcfe0ff });
        G.buffs.emit('onDash', {});
        break;
      }
      case 'blink': {
        const d = P.forward(); d.y = U.clamp(d.y, -0.3, 0.5); d.normalize();
        const o = P.pos.clone().add(V(0, 1.0, 0));
        const wh = G.world.raycast(o, d, p.range);
        const dist = wh ? Math.max(0, wh.t - 0.7) : p.range;
        const target = o.clone().addScaledVector(d, dist); target.y -= 1.0;
        const from = P.chestPos(), fromFeet = P.pos.clone();
        const g = G.world.groundAt(V(target.x, target.y + 1.2, target.z), P.hw, 4);
        if (g > -Infinity) target.y = Math.max(target.y, g);
        P.pos.copy(target); G.world.depenetrate(P.pos, P.hw, P.height);
        P.vel.multiplyScalar(0.4); P.grounded = false;
        G.fx.smoke(from, 10, 0.8, 0x6a5a8a, 0.5, 0.8); G.fx.sparks(P.chestPos(), null, 14, 0xc0a0ff, 5);
        G.sfx.magic(P.pos); G.sfx.whoosh(0.2, 0.7);
        if (m.x_arrive) C.explode(P.pos.clone().add(V(0, 1, 0)), 4, sc(100), { src: 'skill', color: 0xc0a0ff, knock: 8 });
        if (m.x_frost) C.zone(fromFeet, 4, 4, 'frost', 0);
        P.fovKick = 14;
        break;
      }
      case 'chrono':
        G.game.chronoT = p.dur; G.game.chronoSlow = 1 - Math.max(0.08, (m.x_deep ? 0.2 : p.slow) * Math.pow(0.93, A.totalLv(sk))); // p.slow = the speed that is left; levels leave less of it
        if (m.x_self || m.x_vuln) tmp('chrono_fx', p.dur, { moveSpeed: m.x_self ? 0.2 : 0, fireRate: m.x_self ? 0.2 : 0, dmg: m.x_vuln ? 0.25 : 0 }, '⏳');
        G.sfx.magic(P.pos, 'dark'); G.sfx.rumble(0.8, 0.5); G.ui.tint('chrono', p.dur); break;
      case 'shockwave': {
        const wave = (k) => {
          const o = P.chestPos(), f = P.forward(); f.y = 0; f.normalize();
          for (const e of G.enemies.inRadius(o, p.r)) {
            const to = e.pos.clone().sub(P.pos).setY(0); const l = to.length(); to.divideScalar(l || 1);
            if (!m.x_full && to.dot(f) < 0.35 && l > 2) continue;
            C.damageEnemy(e, sc(p.dmg) * k, { src: 'skill', shieldMul: p.shieldMul, knock: 18 * k, dir: to.clone().setY(0.4), emp: true });
          }
          for (let i = 0; i < 40; i++) { const a = m.x_full ? Math.random() * 6.28 : (Math.random() - 0.5) * 1.6; const dd = f.clone().applyAxisAngle(V(0, 1, 0), a); G.fx.norm.spawn(o.x, o.y - 0.6, o.z, dd.x * U.rand(10, 20), U.rand(0, 2), dd.z * U.rand(10, 20), 0.6, 0.3, 1.5, 0.75, 0.72, 0.68, 0.45, 0, 2.5); }
          G.sfx.whoosh(0.4, 1.0); G.sfx.explosion(o, 0.4); P.addShake(0.3);
        };
        wave(1);
        if (m.x_double) later(() => wave(0.7), 400);
        break;
      }
      case 'emp': {
        const o = P.chestPos(); let n = 0;
        for (const e of G.enemies.inRadius(o, p.r)) { const had = e.shield > 0; C.damageEnemy(e, sc(p.dmg), { src: 'skill', shieldMul: p.shieldMul, emp: true }); n++; if (had) C.stun(e, 3); else if (m.x_stunall && !e.boss) C.stun(e, 1.2); }
        if (m.x_absorb && n) C.timedShield(Math.min(60, 6 * n), 8, 150);
        if (G.bosses.active && G.bosses.active.emp) G.bosses.active.emp(o, p.r);
        G.fx.ring(P.pos, p.r, 0xa8d0ff, 0.5); G.fx.ring(P.pos, p.r * 0.6, 0xffffff, 0.35); G.fx.flash(o, 0xa8d0ff, 60, 0.2, 20);
        G.sfx.zap(o); G.sfx.shieldBreak(o);
        break;
      }
      case 'chain': case 'chain2': {
        const a = aim(40 * (1 + m.area), true);
        if (!a.e) { G.ui.toastSmall('⚡ 対象がいない'); ok = false; break; }
        G.fx.lightning(P.handPos(), a.e.centerPos(), 0xe0ecff);
        C.damageEnemy(a.e, sc(p.dmg), { src: 'skill', elem: 'shock', shieldMul: 2 });
        C.chain(a.e, p.n - 1 + (m.x_jumps ? 3 : 0), sc(p.dmg) * 0.8, 12 * (1 + m.area), { src: 'skill', elemChance: id === 'chain2' ? 1 : 0.5 });
        G.sfx.zap(a.e.pos);
        break;
      }
      case 'firestorm': {
        const a = aim(40); C.zone(a.floorPt, p.r, p.dur, 'fire', sc(p.dps));
        if (m.x_pull) C.zone(a.floorPt, p.r, p.dur * 0.6, 'gravity', 0);
        if (m.x_twin) C.zone(P.pos.clone(), p.r * 0.6, p.dur, 'fire', sc(p.dps) * 0.6);
        G.sfx.fire(a.floorPt, true); handFx(0xff9a40); break;
      }
      case 'frostnova': {
        const o = P.chestPos(), hit = G.enemies.inRadius(o, p.r);
        for (const e of hit) { C.damageEnemy(e, sc(p.dmg), { src: 'skill' }); C.status(e, 'frost', 5); }
        if (m.x_shatter) later(() => { for (const e of hit) if (e.alive && e.st && (e.st.frozen > 0 || e.st.frost > 0)) { C.damageEnemy(e, sc(p.dmg), { src: 'skill', elem: 'frost' }); G.fx.sparks(e.centerPos(), null, 10, 0xd8f0ff, 5); } G.sfx.ice(P.pos); }, 1200);
        if (m.x_armor) tmp('frost_armor', 5, { armor: 0.25 }, '🛡️');
        G.fx.ring(P.pos, p.r, 0xcfefff, 0.5);
        for (let i = 0; i < 60; i++) { const an = Math.random() * 6.28; G.fx.norm.spawn(P.pos.x, P.pos.y + 0.3, P.pos.z, Math.cos(an) * U.rand(6, 14), U.rand(0, 2), Math.sin(an) * U.rand(6, 14), 0.7, 0.3, 1.0, 0.85, 0.93, 1.0, 0.6, 0, 3); }
        G.sfx.ice(o); C.zone(P.pos.clone(), p.r * (m.x_zone ? 1 : 0.7), m.x_zone ? 8 : 3, 'frost', 0);
        break;
      }
      case 'gravity': {
        const a = aim(40); const pt = a.floorPt.clone();
        const ck = m.x_crush ? 1.6 : 1, rk = m.x_crush ? 1.4 : 1;
        C.zone(pt, p.r, p.dur, 'gravity', 0, { onEnd: () => C.explode(pt.clone().add(V(0, 1, 0)), p.r * 0.6 * rk, sc(p.dmg) * ck, { src: 'skill', color: 0xa070ff }) });
        if (m.x_tear) C.zone(pt, p.r, p.dur, 'grasp', sc(40), { interval: 0.5 });
        G.sfx.magic(pt, 'dark'); G.sfx.rumble(p.dur, 0.6);
        break;
      }
      case 'healaura': {
        const z = C.zone(P.pos.clone(), p.r, p.dur, 'heal', 0, { hps: p.hps * ek * (m.x_potent ? 1.6 : 1), interval: 0.25 });
        if (m.x_follow) z.follow = true;
        tmp('healaura', p.dur, { armor: m.x_armor ? 0.35 : 0.2 }, '💚');
        if (m.x_purge) { P.st = {}; G.ui.toastSmall('✨ 状態異常を浄化'); }
        G.sfx.heal(); break;
      }
      case 'drain': {
        let tot = 0;
        for (const e of G.enemies.inRadius(P.pos, p.r)) { tot += C.damageEnemy(e, sc(p.dmg), { src: 'skill' }); G.fx.beam(e.centerPos(), P.chestPos(), 0xc02030, 0.05, 0.4); }
        if (tot <= 0) { G.ui.toastSmall('🩸 範囲内に敵がいない'); ok = false; break; }
        const h = tot * (m.x_heal ? 0.8 : 0.5), room = P.stats.maxHp - P.hp;
        C.heal(h); if (m.x_over && h > room) C.timedShield(Math.min(80, h - room), 8, 150);
        G.sfx.magic(P.pos, 'dark');
        break;
      }
      case 'turret': {
        const a = aim(6), n = m.x_twin ? 2 : 1;
        const f = P.forward(); f.y = 0; f.normalize(); const side = V(-f.z, 0, f.x);
        for (let i = 0; i < n; i++) { const pt = a.floorPt.clone().addScaledVector(side, n > 1 ? (i ? 1.2 : -1.2) : 0); const t = C.spawnTurret(pt, p.dur, sc(p.dmg)); if (m.x_rapid && t) t.rate = 1.5; }
        break;
      }
      case 'mines': {
        const f = P.forward(); f.y = 0; f.normalize();
        const n = p.n + (m.x_more ? 3 : 0);
        for (let i = 0; i < n; i++) {
          const d = f.clone().applyAxisAngle(V(0, 1, 0), (i - (n - 1) / 2) * 0.25 * 5 / n * 1.2);
          const pr = { kind: 'mine', pos: P.handPos(), vel: d.multiplyScalar(U.rand(7, 10)).add(V(0, 4, 0)), grav: 18, owner: 'player', dmg: sc(p.dmg), explode: 4 * (1 + m.area), mine: true, info: { src: 'explosion', sk: id, cluster: m.x_cluster ? 3 : 0 } };
          C.spawnProjectile(pr);
        }
        G.sfx.throwG();
        break;
      }
      case 'meteor': {
        const a = aim(50); const pt = a.floorPt.clone();
        const drop = (q, r, dmg, delay) => {
          const tg = G.fx.telegraph(q, r, 1.2 + delay, 0xff7020);
          const start = q.clone().add(V(8, 30, -6));
          later(() => C.spawnProjectile({ kind: 'bigfire', pos: start, vel: q.clone().sub(start).divideScalar(1.2), owner: 'player', dmg, explode: r, life: 1.25, radius: 0.5, info: { src: 'skill', color: 0xff7020 }, onEnd: () => { G.fx.endTelegraph(tg); if (m.x_crater) C.zone(q, r * 0.7, 5, 'fire', sc(30)); } }), delay * 1000);
        };
        drop(pt, p.r, sc(p.dmg), 0);
        if (m.x_shower) for (let i = 0; i < 2; i++) drop(pt.clone().add(V(U.rand(-p.r, p.r), 0, U.rand(-p.r, p.r))), p.r * 0.6, sc(p.dmg) * 0.5, 0.35 + i * 0.3);
        G.sfx.rumble(1.4, 0.8);
        break;
      }
      case 'spear': case 'icespear': case 'fireball': {
        const o = P.handPos(); const a = aim(80); const tgt = a.e ? a.e.centerPos() : a.wh ? a.wh.point : a.o.clone().addScaledVector(a.d, 80);
        const d0 = tgt.sub(o).normalize();
        const kind = id === 'spear' ? 'spear' : id === 'icespear' ? 'icespear' : 'fireball';
        for (const ang of fan(m.x_triple)) {
          const d = d0.clone().applyAxisAngle(V(0, 1, 0), ang), k = ang ? 0.7 : 1;
          const pr = { kind, pos: o.clone(), vel: d.multiplyScalar(id === 'fireball' ? 40 : 65), grav: id === 'spear' ? 3 : 0, owner: 'player', dmg: sc(p.dmg) * k, radius: 0.25, pierce: id === 'fireball' ? 0 : 99, life: 4, info: { src: 'skill', shieldMul: p.shieldMul || 1, knock: 6 } };
          if (id === 'icespear') pr.onHitEnemy = (e) => C.status(e, 'frost', m.x_deep ? 10 : 5);
          if (id === 'fireball') { pr.explode = p.r; pr.info = { src: 'skill', elem: 'fire', color: 0xff8030 }; if (m.x_napalm) pr.onDetonate = (q) => { const g = q.pos.clone(); const fl = G.world.floorBelow(g.x, g.y + 0.5, g.z); if (fl > -50) g.y = fl; C.zone(g, p.r * 0.7, 4, 'fire', sc(28)); }; }
          C.spawnProjectile(pr);
        }
        G.sfx.whoosh(0.3, 0.8); if (id === 'fireball') G.sfx.fire(o); if (id === 'icespear') G.sfx.ice(o);
        break;
      }
      case 'spikes': {
        const f0 = P.forward(); f0.y = 0; f0.normalize();
        const start = P.pos.clone();
        const hitSet = new Set();
        for (const ang of fan(m.x_triple).map((x) => x * 2)) {
          const f = f0.clone().applyAxisAngle(V(0, 1, 0), ang);
          for (let i = 1; i <= 12; i++) {
            later(() => {
              const pt = start.clone().addScaledVector(f, i * p.len / 12);
              const fl = G.world.floorBelow(pt.x, pt.y + 1.5, pt.z); pt.y = fl > -50 ? fl : pt.y;
              G.fx.debris(pt, G.world.mats.rock, 3, 0.35, 5); G.fx.dust(pt, V(0, 1, 0), 0x7a6a50, 3);
              if (i % 3 === 0) G.sfx.breakObj(pt, 'stone');
              for (const e of G.enemies.inRadius(pt, 2.0)) { if (hitSet.has(e)) continue; hitSet.add(e); C.damageEnemy(e, sc(p.dmg), { src: 'skill', knock: 4, dir: V(0, 1, 0) }); if (!e.boss) e.vel.y = 9; }
            }, i * 40);
          }
        }
        P.addShake(0.2);
        break;
      }
      case 'berserk': tmp('berserk', p.dur, { dmg: m.x_fury ? 0.8 : 0.5, fireRate: 0.3, lifesteal: 0.05, armor: m.x_guard ? 0.2 : 0, moveSpeed: m.x_speed ? 0.25 : 0 }, '😡'); G.sfx.monster(null, 'roar', 1.6, 0.4); G.ui.tint('rage', p.dur); break;
      case 'barrier': {
        const f = P.forward(); f.y = 0; f.normalize();
        const c = P.pos.clone().addScaledVector(f, 2.6);
        const alongX = Math.abs(f.z) > Math.abs(f.x);
        const hw = 1.9 * (m.x_wide ? 1.6 : 1), ht = 0.3, h = 3.0 * (m.x_wide ? 1.3 : 1);
        const x0 = c.x - (alongX ? hw : ht), x1 = c.x + (alongX ? hw : ht), z0 = c.z - (alongX ? ht : hw), z1 = c.z + (alongX ? ht : hw);
        const fl = G.world.floorBelow(c.x, P.pos.y + 0.5, c.z);
        const y0 = fl > -50 ? fl : P.pos.y;
        if (!G.world.boxFree(x0, y0 + 0.05, z0, x1, y0 + h, z1)) { G.ui.toastSmall('🛡️ 設置できない'); ok = false; break; }
        const col = G.world.addCollider(x0, y0, z0, x1, y0 + h, z1, { surf: 'stone' });
        const mesh = new THREE.Mesh(G.Props.PG.box, G.world.mats.block); mesh.scale.set(x1 - x0, h, z1 - z0); mesh.position.set(c.x, y0 + h / 2, c.z); mesh.castShadow = true; mesh.receiveShadow = true;
        G.scene.add(mesh);
        G.fx.dust(V(c.x, y0, c.z), V(0, 1, 0), 0x8a8070, 12); G.sfx.stoneGrind(c, 0.5);
        if (m.x_spikes) C.zone(V(c.x, y0, c.z), hw + 3, p.dur, 'grasp', sc(40), { interval: 0.5 });
        if (m.x_heal) C.zone(V(c.x, y0, c.z), hw + 3, p.dur, 'heal', 0, { hps: 6, interval: 0.5 });
        C.walls.push({ t: p.dur, remove() { col.alive = false; G.scene.remove(mesh); G.fx.debris(V(c.x, y0 + 1, c.z), G.world.mats.block, 10, 0.3, 4); G.sfx.breakObj(c, 'stone'); } });
        break;
      }
      case 'decoy': {
        const a = aim(8);
        const mk = (pt) => { const d = C.addDecoy(pt, p.dur, sc(p.dmg) * (m.x_nova ? 1.5 : 1)); if (d && m.x_nova) d.explodeR = 8; };
        mk(a.floorPt);
        if (m.x_twin) { const f = P.forward(); f.y = 0; f.normalize(); mk(a.floorPt.clone().add(V(-f.z * 3, 0, f.x * 3))); }
        if (m.x_cloak) { tmp('decoy_cloak', 2.5, { invis: 1 }, '👻'); }
        break;
      }
      case 'cloak':
        tmp('cloak', p.dur, { invis: 1, critMul: m.x_assassin ? 1.0 : 0, moveSpeed: m.x_speed ? 0.3 : 0, hpRegen: m.x_heal ? P.stats.maxHp * 0.04 : 0 }, '👻'); G.weapons._cloakUsed = false; G.weapons._cloakMul = 1 + 1.5 * ek;
        if (m.x_smoke) C.zone(P.pos.clone(), 5, 6, 'smoke', 0);
        G.sfx.magic(P.pos, 'dark'); break;
      case 'overdrive':
        tmp('overdrive', p.dur, { infAmmo: 1, fireRate: m.x_rate ? 0.9 : 0.6, dmg: m.x_dmg ? 0.2 : 0 }, '🔫');
        if (m.x_reload) for (const w of P.weapons) if (w && w.mag !== undefined) w.mag = G.weapons.stats(w).mag;
        G.sfx.mech('boltBack'); break;
      case 'blades': P.bladesT = p.dur; P.bladesDps = sc(p.dps); P.bladesN = 6 + (m.x_more ? 3 : 0); P.bladesR = 3 + (m.x_wide ? 1.5 : 0) + m.area * 3; P.bladesSk = id; P.bladesUlt = false; G.sfx.whoosh(0.5, 0.8); break;
      case 'leap': {
        const f = P.forward(); f.y = 0; f.normalize();
        const k = m.x_far ? 1.4 : 1;
        P.vel.set(f.x * 16 * k, 11, f.z * 16 * k); P.grounded = false;
        P.leap = { t: 0, r: p.r, dmg: sc(p.dmg), sk: id };
        G.sfx.whoosh(0.5, 1.0, true); G.sfx.zap(P.pos);
        break;
      }
      case 'mark': {
        const a = aim(60, true); if (!a.e) { G.ui.toastSmall('🎯 対象がいない'); ok = false; break; }
        const targets = [a.e];
        if (m.x_multi) for (const e of G.enemies.inRadius(a.e.pos, 10)) { if (targets.length >= 3) break; if (!targets.includes(e)) targets.push(e); }
        for (const e of targets) { C.status(e, 'mark', p.dur); e.st.markMul = 1 + 0.6 * (1 + 0.5 * (ek - 1)); e.st.markKillReset = true; G.fx.ring(e.pos, 1.2, 0xff4030, 0.6); }
        G.sfx.magic(a.e.pos, 'dark'); break;
      }
      case 'toxic': { const a = aim(40); C.zone(a.floorPt, p.r, p.dur, 'poison', sc(18), { stacks: m.x_virulent ? 2 : 1 }); G.sfx.spit(a.floorPt); break; }
      case 'ricostorm': G.weapons._ricoMul = 1 + 0.06 * A.totalLv(sk); tmp('ricostorm', p.dur, { dmg: m.x_dmg ? 0.2 : 0, fireRate: m.x_rate ? 0.25 : 0 }, '↪️'); break;
      case 'grasp': {
        const a = aim(40), pt = a.floorPt.clone();
        C.zone(pt, p.r, p.dur, 'grasp', sc(p.dps), { interval: 0.25, onEnd: m.x_crush ? () => C.explode(pt.clone().add(V(0, 1, 0)), p.r * 0.7, sc(150), { src: 'skill', color: 0x6a2080 }) : null });
        G.sfx.magic(a.floorPt, 'dark'); break;
      }
      case 'holynova': {
        const o = P.chestPos();
        for (const e of G.enemies.inRadius(o, p.r)) C.damageEnemy(e, sc(p.dmg) * (e.def.undead ? 3 : 1), { src: 'skill', knock: 6 });
        C.heal(p.heal * ek * (m.x_heal ? 2 : 1));
        if (m.x_sanct) C.zone(P.pos.clone(), p.r * 0.6, 5, 'holy', sc(30), { interval: 0.5 });
        G.fx.ring(P.pos, p.r, 0xffe8a0, 0.6); G.fx.flash(o, 0xffe8a0, 70, 0.3, 25);
        for (let i = 0; i < 50; i++) { const an = Math.random() * 6.28; G.fx.add.spawn(P.pos.x, P.pos.y + 1, P.pos.z, Math.cos(an) * U.rand(5, 12), U.rand(-1, 3), Math.sin(an) * U.rand(5, 12), 0.7, 0.2, 0.02, 1.4, 1.2, 0.7, 1, 0, 2); }
        G.sfx.bell();
        break;
      }
      case 'summon': { const n = p.n + (m.x_more ? 2 : 0); for (let i = 0; i < n; i++) A.summonSkeleton(P.pos.clone().add(V(Math.cos(i * 6.28 / n) * 2, 0, Math.sin(i * 6.28 / n) * 2)), p.dur, sc(p.dmg), m.x_explode ? sc(100) : 0); G.sfx.monster(P.pos, 'groan', 1.3, 0.6); break; }
      case 'harvest': {
        let n = 0; const th = m.x_thresh ? 0.45 : 0.3;
        for (const e of G.enemies.inRadius(P.pos, p.r)) {
          if (e.boss || e.hp > e.maxHp * th) continue;
          G.fx.beam(e.centerPos(), P.chestPos(), 0x9fd8ff, 0.04, 0.5);
          C.damageEnemy(e, e.hp + e.shield + 1, { src: 'skill' }); n++;
        }
        if (!n) { G.ui.toastSmall('⚰️ 収穫できる魂がない'); ok = false; break; }
        C.heal((m.x_heal ? 12 : 5) * n * ek); G.sfx.magic(P.pos, 'dark'); G.ui.feed(`魂の収穫 ×${n}`, 'big');
        if (m.x_reset && n >= 3) sk.halfCd = true;
        break;
      }
      case 'magnet': {
        const o = P.handPos(); const a = aim(50, true); const tgt = a.e ? a.e.centerPos() : a.point;
        const d = tgt.sub(o).normalize();
        C.spawnProjectile({ kind: 'darkorb', pos: o, vel: d.multiplyScalar(45), owner: 'player', dmg: sc(p.dmg), explode: p.r, radius: 0.3, life: 3, info: { src: 'skill' }, onDetonate: (pr) => {
          const pt = pr.pos.clone();
          C.zone(pt, p.r, m.x_pull ? 2.5 : 1.2, 'gravity', 0, { onEnd: () => { C.explode(pt, p.r * 0.7, sc(p.dmg), { src: 'skill', color: 0xa060ff }); if (m.x_twin) later(() => C.explode(pt, p.r * 0.7, sc(p.dmg) * 0.6, { src: 'skill', color: 0xa060ff }), 600); } });
          G.sfx.magic(pt, 'dark');
        } });
        break;
      }
      case 'haste': tmp('haste', p.dur, { moveSpeed: 0.6, jumpPower: m.x_jump ? 0.6 : 0.3, armor: m.x_dodge ? 0.15 : 0, reloadSpeed: m.x_reload ? 0.5 : 0, fireRate: m.x_reload ? 0.15 : 0 }, '🏃'); G.sfx.whoosh(0.4, 0.8, true); break;
      case 'rewind': {
        const t0 = G.game.time - p.t - (m.x_time ? 2 : 0);
        let h = P.history[0];
        for (const e of P.history) if (e.t <= t0) h = e;
        if (!h) { ok = false; break; }
        const from = P.pos.clone();
        G.fx.smoke(P.chestPos(), 8, 0.8, 0x4a6a8a, 0.4, 0.8);
        P.pos.copy(h.p); P.vel.set(0, 0, 0); P.hp = Math.max(P.hp, h.hp); G.world.depenetrate(P.pos, P.hw, P.height);
        { const hl = 0.02 * A.totalLv(sk); if (hl > 0) C.heal(P.stats.maxHp * hl); } // each level: +2% max HP healed on the way back
        if (m.x_heal) C.heal(P.stats.maxHp * 0.2);
        if (m.x_nova) C.explode(from.add(V(0, 1, 0)), 5, sc(120), { src: 'skill', color: 0x80b0ff });
        G.sfx.magic(P.pos); G.ui.tint('rewind', 0.5); P.fovKick = 12;
        break;
      }
      case 'lunge': {
        const a = aim(p.range, true);
        if (!a.e || a.e.pos.distanceTo(P.pos) > p.range) { G.ui.toastSmall('🗡️ 対象がいない'); ok = false; break; }
        const to = a.e.pos.clone().sub(P.pos).setY(0); const l = to.length(); to.divideScalar(l || 1);
        const dest = a.e.pos.clone().addScaledVector(to, -(a.e.radius + 0.9)); dest.y = Math.max(a.e.pos.y, P.pos.y);
        P.lunge = { t: 0, from: P.pos.clone(), to: dest, e: a.e, dmg: sc(p.dmg), sk: id, vamp: m.x_vamp ? 0.55 : 0.3, cleave: !!m.x_cleave, reset: !!m.x_reset, slot: sk };
        P.invulnT = 0.3; G.sfx.whoosh(0.2, 1.0); P.fovKick = 16;
        break;
      }
      case 'warcry': for (const e of G.enemies.inRadius(P.pos, p.r)) C.fear(e, m.x_long ? 5 : 3); tmp('warcry', 8, { dmg: m.x_rally ? 0.45 : 0.25 }, '📯'); G.sfx.monster(null, 'roar', 1.5, 0.5); G.fx.ring(P.pos, p.r, 0xffc070, 0.6); break;
      case 'arrowrain': { const a = aim(45); C.zone(a.floorPt, p.r, p.dur, 'arrowrain', sc(p.dps), { interval: 0.25 }); G.sfx.whoosh(0.8, 0.6); break; }
      case 'quake': {
        const shake = (k) => {
          for (const e of G.enemies.inRadius(P.pos, p.r)) { if (e.def.flyer && !e.grounded) continue; C.damageEnemy(e, sc(p.dmg) * k, { src: 'skill' }); C.stun(e, (m.x_long ? 3.5 : 2) * k); }
          P.addShake(k); G.sfx.rumble(1.2, 1.2 * k); G.sfx.explosion(P.pos, 1.2 * k);
          for (let i = 0; i < 40; i++) { const an = Math.random() * 6.28, d = Math.random() * p.r; G.fx.dust(V(P.pos.x + Math.cos(an) * d, P.pos.y + 0.1, P.pos.z + Math.sin(an) * d), V(0, 1, 0), 0x7a6a50, 2); }
          G.fx.ring(P.pos, p.r, 0xb09060, 0.8);
        };
        shake(1);
        if (m.x_after) later(() => shake(0.5), 1000);
        break;
      }
      case 'thornarmor': tmp('thornarmor', p.dur, { armor: m.x_harden ? 0.5 : 0.35, hpRegen: m.x_heal ? 3 : 0 }, '🌵'); G.sfx.mech('grab'); break;
      case 'flight':
        P.vel.y = 17 * (1 + 0.02 * A.totalLv(sk)); P.grounded = false; P.glideT = p.dur + 1.5;
        if (m.x_sky) tmp('flight_sky', p.dur + 1.5, { dmg: 0.25 }, '🎯');
        if (m.x_dive) P.leap = { t: -0.6, r: 6 * (1 + m.area), dmg: sc(140), sk: id, maxT: p.dur + 6 };
        G.sfx.whoosh(0.6, 1.0, true); P.fovKick = 12; for (let i = 0; i < 20; i++) G.fx.norm.spawn(P.pos.x, P.pos.y, P.pos.z, U.rand(-3, 3), U.rand(-1, 0), U.rand(-3, 3), 0.6, 0.3, 1.2, 0.8, 0.8, 0.8, 0.4, 0, 2); break;
      default: ok = false;
    }
    if (ok) { A.consume(sk); G.sfx.ui('skill'); }
  }

  // ---------------- ally skeletons ----------------
  A.summonSkeleton = function (pos, dur, dmg, boom) {
    const sk = C.curSk;
    const def = G.ENEMY_BY_ID.skeleton_bone;
    const m = G.enemies.buildModel(def, { ally: true });
    m.group.position.copy(pos);
    G.scene.add(m.group);
    G.fx.smoke(pos, 8, 1, 0x3a4a5a, 1, 1);
    const ent = { pos: pos.clone(), vel: V(), yaw: 0, radius: 0.4, height: 1.8, def, anim: m, cd: 0, walk: 0, atk: 0 };
    C.addAlly({
      t: dur,
      info() { return { icon: '💀', name: '骸骨の従者', t: this.t, tMax: dur }; },
      update(dt) {
        ent.cd -= dt;
        const e = G.enemies.nearest(ent.pos, 30);
        let moving = false;
        if (e) {
          const to = e.pos.clone().sub(ent.pos); to.y = 0; const l = to.length();
          ent.yaw = Math.atan2(to.x, to.z);
          if (l > e.radius + 1.2) { G.enemies.groundMove(ent, to.x / l, to.z / l, 5.5, dt); moving = true; }
          else if (ent.cd <= 0) { ent.cd = 0.9; ent.atk = 0.4; C.damageEnemy(e, dmg, { src: 'ally', sk, noMarker: true, pos: e.centerPos() }); G.sfx.melee(true); }
        } else {
          const to = P.pos.clone().sub(ent.pos); to.y = 0; const l = to.length();
          if (l > 4) { G.enemies.groundMove(ent, to.x / l, to.z / l, 6, dt); moving = true; ent.yaw = Math.atan2(to.x, to.z); }
        }
        ent.atk = Math.max(0, ent.atk - dt);
        ent.walk += moving ? dt * 9 : 0;
        m.group.position.copy(ent.pos); m.group.rotation.y = ent.yaw;
        m.animate({ walk: ent.walk, moving, atk: ent.atk > 0 ? 1 - ent.atk / 0.4 : 0, t: G.game.time, flinch: 0, state: 'chase' });
      },
      remove() { G.scene.remove(m.group); G.fx.smoke(ent.pos, 6, 1, 0x3a4a5a, 1, 1); if (boom) C.explode(ent.pos.clone().add(V(0, 1, 0)), 4, boom, { src: 'skill', sk, color: 0x9ab0c0 }); },
    });
  };

  // ---------------- grenades ----------------
  A.cycleGrenade = function () {
    const owned = Object.keys(P.grenades).filter((k) => P.grenades[k] > 0);
    if (!owned.length) return;
    const i = owned.indexOf(P.grenadeSel);
    P.grenadeSel = owned[(i + 1) % owned.length];
    G.sfx.ui('click');
    G.ui.refreshItems();
  };
  A.throwGrenade = function () {
    let id = P.grenadeSel;
    if (!P.grenades[id]) { const o = Object.keys(P.grenades).find((k) => P.grenades[k] > 0); if (!o) { G.ui.toastSmall('💣 投擲物がない'); G.sfx.ui('deny'); return; } id = P.grenadeSel = o; }
    if (G.ItemAnim.busy()) return;
    const it = G.ITEM_BY_ID[id];
    if (!(P.has('g_refund') && Math.random() < 0.3)) P.takeItem(id);
    G.ui.refreshItems();
    G.ItemAnim.play('throw', id, () => A.releaseGrenade(id));
  };
  A.releaseGrenade = function (id, under) {
    const it = G.ITEM_BY_ID[id], d = it.data;
    const { o, vel } = G.GrenHold.launch(under);
    const dmg = C.scale(d.dmg);
    const kind = id === 'g_molotov' || id === 'g_holy' ? 'bottle' : id === 'g_dyna' ? 'dyna' : id === 'g_mine' ? 'mine' : 'grenade';
    const pr = { kind, pos: o, vel, grav: 18, owner: 'player', dmg, radius: 0.12, life: 10, info: { src: 'explosion', grenade: true, shieldMul: d.shieldMul || 1, emp: !!d.emp } };
    if (d.mine) { pr.mine = true; pr.explode = d.r; }
    else if (d.impact) { pr.explode = d.r; }
    else { pr.fuse = d.fuse; pr.bounce = true; pr.explode = d.r; }
    if (d.sticky) { pr.sticky = true; pr.bounce = false; }
    pr.look = 'gl_' + id; // its own model and trail (grenfx.js)
    pr.onDetonate = (p) => A.grenadeEffect(id, p.pos.clone(), dmg);
    if (d.mine) pr.onDetonate = null;
    C.spawnProjectile(pr);
    G.sfx.throwG();
    G.buffs.emit('onGrenade', { id });
    G.ui.refreshItems();
  };
  A.grenadeEffect = function (id, pos, dmg) {
    const d = G.ITEM_BY_ID[id].data;
    const fl = G.world.floorBelow(pos.x, pos.y + 0.3, pos.z);
    const ground = V(pos.x, fl > -50 ? fl : pos.y, pos.z);
    const info = { src: 'explosion', grenade: true, shieldMul: d.shieldMul || 1, emp: !!d.emp, elem: d.elem, stacks: d.stacks };
    if (G.GrenFX) G.GrenFX.boom(id, pos, ground, d); // what this one looks and sounds like on top of the shared blast below
    if (d.blackhole) {
      C.zone(ground, d.r, d.blackhole, 'gravity', 0, { onEnd: () => C.explode(ground.clone().add(V(0, 1, 0)), d.r * 0.7, dmg, Object.assign({}, info, { color: 0xa070ff })) });
      G.sfx.magic(pos, 'dark'); G.sfx.rumble(d.blackhole, 0.6);
      return;
    }
    if (d.decoy) { const dc = C.addDecoy(ground, d.decoy, 0); if (G.GrenFX) G.GrenFX.bell(dc); return; }
    if (d.zone === 'smoke') { C.zone(ground, d.r, d.dur, 'smoke', 0); G.sfx.whoosh(0.6, 0.6); G.fx.smoke(pos, 16, 2, 0x8a8a8a, 0.8, 3); return; }
    if (d.stun) {
      G.fx.flash(pos, 0xffffff, 120, 0.3, 30); G.fx.add.spawn(pos.x, pos.y, pos.z, 0, 0, 0, 0.3, 6, 10, 2, 2, 2, 1, 0, 0);
      for (const e of G.enemies.inRadius(pos, d.r)) C.stun(e, d.stun);
      G.sfx.explosion(pos, 0.3);
      const dp = P.pos.distanceTo(pos); if (dp < 12 && G.world.los(G.camera.position, pos)) G.ui.whiteFlash(1 - dp / 12);
      return;
    }
    if (d.holy) {
      for (const e of G.enemies.inRadius(pos, d.r)) C.damageEnemy(e, dmg * (e.def.undead ? 3 : 1), { src: 'explosion', grenade: true, knock: 3 });
      if (P.pos.distanceTo(pos) < d.r + 1) C.heal(25);
      G.fx.ring(ground, d.r, 0xffe8a0, 0.5); G.fx.flash(pos, 0xffe8a0, 40, 0.2, 14); G.sfx.breakObj(pos, 'ceramic'); G.sfx.heal();
      for (let i = 0; i < 30; i++) G.fx.add.spawn(pos.x, pos.y, pos.z, U.rand(-4, 4), U.rand(1, 5), U.rand(-4, 4), 0.8, 0.15, 0.02, 1.3, 1.2, 0.8, 1, 6, 1);
      return;
    }
    if (id === 'g_molotov') { G.sfx.breakObj(pos, 'ceramic'); G.sfx.fire(pos, true); G.fx.fireBurst(ground, d.r); C.zone(ground, d.r, d.dur, 'fire', C.scale(22)); for (const e of G.enemies.inRadius(pos, d.r)) C.damageEnemy(e, dmg, info); return; }
    C.explode(pos, d.r, dmg, Object.assign({}, info, { color: d.elem === 'frost' ? 0xbfe8ff : d.emp ? 0xa8d0ff : d.elem === 'shock' ? 0xe0e8ff : undefined }));
    if (d.zone) C.zone(ground, d.r, d.dur, d.zone, C.scale(d.zone === 'fire' ? 26 : 16));
    if (d.elem === 'shock') for (const e of G.enemies.inRadius(pos, d.r)) C.chain(e, 2, dmg * 0.3, 8, { src: 'explosion' });
    if (d.cluster) for (let i = 0; i < d.cluster; i++) C.spawnProjectile({ kind: 'grenade', pos: pos.clone().add(V(0, 0.4, 0)), vel: V(U.rand(-6, 6), U.rand(5, 9), U.rand(-6, 6)), grav: 18, owner: 'player', dmg: dmg * 0.4, explode: d.r * 0.6, fuse: U.rand(0.5, 1.0), bounce: true, info: { src: 'explosion', grenade: true, small: true, isCluster: true } });
    if (d.emp) { G.fx.ring(ground, d.r, 0xa8d0ff, 0.5); G.sfx.zap(pos); if (G.bosses.active && G.bosses.active.emp) G.bosses.active.emp(pos, d.r); }
  };

  // ---------------- item keys: tap = use the selected item, hold = selection wheel ----------------
  const SLOTKEYS = [['grenade', 'g'], ['item1', 'c1'], ['item2', 'c2']];
  A.press = null;
  A.wheelOpen = () => !!(A.press && A.press.wheel);
  const grenadeList = () => Object.keys(P.grenades).filter((k) => P.grenades[k] > 0);
  A.updateItemKeys = function (dt) {
    if (I.hit('cycleGrenade')) A.cycleGrenade();
    if (!A.press) for (const [act, slot] of SLOTKEYS) if (I.hit(act)) { A.press = { act, slot, t: 0 }; break; }
    const pr = A.press; if (!pr) return;
    if (I.down(pr.act)) {
      pr.t += dt;
      if (pr.t > 0.22 && !pr.wheel) {
        const list = P.slotCells(pr.slot).map((id) => (id && (pr.slot !== 'g' || P.grenades[id] > 0) ? id : null)); // a fixed ring: every cell keeps its place, empty ones stay empty
        if (list.filter(Boolean).length > 1) { pr.wheel = true; G.ui.itemWheel(pr.slot, list, pr.slot === 'g' ? P.grenadeSel : P.selItem(pr.slot)); G.sfx.ui('open'); }
      }
      if (pr.wheel) { G.ui.itemWheelMove(I.mx, I.my); }
      return;
    }
    // released
    if (pr.wheel) {
      const id = G.ui.itemWheelClose();
      if (id) { if (pr.slot === 'g') { P.grenadeSel = id; G.GrenHold.refresh(); } else P.isel[pr.slot] = id; G.sfx.ui('click'); G.ui.refreshItems(); }
    } else if (pr.slot === 'g') G.GrenHold.toggle();
    else A.useSlot(pr.slot);
    A.press = null;
  };
  A.useSlot = function (slot) {
    const id = P.selItem(slot);
    if (!id) { const S = G.ITEM_SLOTS.find((s) => s.id === slot); G.ui.toastSmall(`${S.icon} 消耗品を持っていない`); G.sfx.ui('deny'); return; }
    G.GrenHold.putAway(true);
    A.useItemId(id);
  };
  // ---------------- use all: every one of a kind queued, used one after another (each with its own motion) ----------------
  A.useQueue = null; // { id, left }
  A.queueUse = function (id, n) {
    const it = G.ITEM_BY_ID[id]; if (!it || n < 1) return;
    A.useQueue = { id, left: n };
    G.ui.toastSmall(`${it.icon} ${it.name} を${n}個まとめて使う（撃つ・他の道具で中止）`);
  };
  A.cancelUseQueue = function (why) { if (!A.useQueue) return; A.useQueue = null; if (why) G.ui.toastSmall(why); };
  A.tickUseQueue = function () {
    const q = A.useQueue; if (!q) return;
    if (P.dead || !G.game.run) { A.useQueue = null; return; }
    if (I.mpressed[0] && G.game.state === 'playing') { A.cancelUseQueue('🍶 まとめて使うのを中止した'); return; }
    if (G.ItemAnim.busy() || G.game.state !== 'playing') return;
    const have = P.itemCount(q.id);
    if (q.left <= 0 || !have) { A.useQueue = null; return; }
    A.useItemId(q.id, true);
    if (P.itemCount(q.id) < have) q.left--;
    else A.useQueue = null; // refused (HP already full, no room to set it down ...): its own message says why
    if (q.left <= 0) A.useQueue = null;
  };
  // ---------------- utility items ----------------
  A.useItemId = function (id, fromQueue) {
    if (!fromQueue && A.useQueue) A.useQueue = null; // using anything by hand ends a queue
    const it = G.ITEM_BY_ID[id], d = it.data;
    if (d.revive) { G.ui.toastSmall('🧚 所持しているだけで効果を発揮'); return; }
    if (d.heal && P.hp >= P.stats.maxHp && !d.temp && !d.maxHp && !d.os && !d.cleanse) { G.ui.toastSmall('❤️ HPは満タン'); G.sfx.ui('deny'); return; }
    if (G.ItemAnim.busy()) return;
    if (d.chest) {
      const w = G.world; const f = P.forward(); f.y = 0; f.normalize(); const pt = P.pos.clone().addScaledVector(f, 2.5);
      if (!(w.boxFree(pt.x - 0.7, pt.y + 0.05, pt.z - 0.7, pt.x + 0.7, pt.y + 1, pt.z + 0.7) && w.groundAt(V(pt.x, pt.y + 0.3, pt.z), 0.3, 1) > -Infinity)) { G.ui.toastSmall('🗺️ ここには出せない'); return; }
    }
    if (!P.takeItem(id)) return;
    G.ui.refreshItems();
    G.ItemAnim.play(G.ItemAnim.kindOf(id), id, () => A.applyItem(id));
    // centre gauge until the healing is done (the motion, plus any heal-over-time that follows)
    if (d.heal) P.healGauge = { t: 0, id, over: d.over || 0, icon: it.icon };
  };
  A.applyItem = function (id) {
    const u = { id };
    const it = G.ITEM_BY_ID[id], d = it.data;
    if (d.heal) {
      if (d.over) { const hps = d.heal / d.over; C.temp('regen_' + u.id, d.over, { hpRegen: hps }, it.icon); }
      else C.heal(d.heal);
      G.sfx.drink(); setTimeout(() => G.sfx.heal(), 300);
    }
    if (d.maxHp) { P.permMaxHp += d.maxHp; P.recalc(); }
    if (d.os) { C.overshield(d.os); G.sfx.mech('cell'); G.fx.bubble(P.chestPos(), 1.2, 0xa8d0ff); }
    if (d.cleanse) { P.st = {}; }
    if (d.resist) C.temp('item_resist', d.resist, { statusRes: 0.7, dotRes: 0.5 }, it.icon, '状態異常耐性'); // status time -70%, burn / poison damage -50% (see player.js updateStatuses)
    if (d.temp) C.temp('item_' + u.id, d.dur, d.temp, it.icon);
    if (d.slowmo) { G.game.chronoT = d.slowmo; G.game.chronoSlow = 0.5; G.ui.tint('chrono', d.slowmo); }
    if (d.cdReset) { C.cdResetAll(); G.sfx.magic(P.pos); }
    if (d.turret) { const a = aim(5); C.spawnTurret(a.floorPt, d.turret, C.scale(26)); }
    if (d.decoy) { const a = aim(6); C.addDecoy(a.floorPt, d.decoy, 0); }
    if (d.grapple) P.grappleCd = 0;
    if (d.invis) { C.temp('invis_item', d.invis, { invis: 1 }, '👻'); }
    if (d.ward) { P.wardT = d.ward; G.fx.bubble(P.chestPos(), 3.2, 0xd0b0ff); G.sfx.magic(P.pos); }
    if (d.refill) { for (const w of P.weapons) w.mag = G.weapons.stats(w).mag; G.sfx.mech('magIn'); }
    if (d.chest) {
      const w = G.world;
      const f = P.forward(); f.y = 0; f.normalize();
      const pt = P.pos.clone().addScaledVector(f, 2.5);
      if (w.boxFree(pt.x - 0.7, pt.y + 0.05, pt.z - 0.7, pt.x + 0.7, pt.y + 1, pt.z + 0.7) && w.groundAt(V(pt.x, pt.y + 0.3, pt.z), 0.3, 1) > -Infinity) {
        G.Props.chest(w, pt.x, pt.z, w.groundAt(V(pt.x, pt.y + 0.3, pt.z), 0.3, 1), P.yaw, 1);
        w.flushDeferred();
        G.fx.smoke(pt, 8, 1, 0x8a7a50, 0.5, 1); G.sfx.coins(4);
      } else { P.addItem(id, 1); G.ui.toastSmall('🗺️ ここには出せない'); return; }
    }
    G.ui.refreshItems();
    G.ui.toastSmall(`${it.icon} ${it.name}`);
  };

  // ---------------- grapple rope visuals ----------------
  let rope, hook, marker, anchorMk;
  const SEG = 28;
  function buildRope() {
    const geo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.7, roughness: 0.5 });
    rope = new THREE.InstancedMesh(geo, mat, SEG); rope.frustumCulled = false; rope.visible = false;
    G.scene.add(rope);
    hook = new THREE.Group();
    const im = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 1, roughness: 0.3 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), im); shaft.rotation.x = Math.PI / 2; hook.add(shaft);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.22, 5), im); const a = i / 3 * Math.PI * 2; c.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, -0.12); c.rotation.set(-Math.PI / 2 + Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); hook.add(c); }
    hook.visible = false; G.scene.add(hook);
    marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    marker.renderOrder = 20; marker.visible = false; G.scene.add(marker);
    anchorMk = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.45, 24), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    anchorMk.visible = false; G.scene.add(anchorMk);
  }
  A.rebuildVisuals = function () { G.scene.add(rope, hook, marker, anchorMk); };
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
  A.updateRope = function (gr, pl) {
    const t = G.game.time;
    // aim preview marker
    const pv = pl.grapplePreview;
    if (false) {
      marker.visible = true;
      marker.position.copy(pv.point).addScaledVector(pv.normal, 0.03);
      marker.lookAt(pv.point.clone().add(pv.normal));
      const s = Math.max(0.6, pv.dist * 0.04) * (1 + 0.1 * Math.sin(t * 8));
      marker.scale.setScalar(s);
    } else marker.visible = false;
    G.ui.grappleHint(pv, gr.state, pl.grappleCd);
    if (gr.state === 'none') { rope.visible = hook.visible = anchorMk.visible = false; return; }
    const a = pl.handPos(), b = gr.hook;
    const dir = b.clone().sub(a); const L = dir.length();
    if (L < 0.01) { rope.visible = false; return; }
    const ndir = dir.clone().divideScalar(L);
    const side = V().crossVectors(ndir, V(0, 1, 0)); if (side.lengthSq() < 0.01) side.set(1, 0, 0); side.normalize();
    const up = V().crossVectors(side, ndir).normalize();
    // rope shape: a travelling wave while flying, slight sag while attached
    const flying = gr.state === 'firing' || gr.state === 'miss' || gr.state === 'retract';
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const k = i / SEG;
      const p = a.clone().addScaledVector(dir, k);
      const env = Math.sin(k * Math.PI);
      if (flying) { const amp = Math.min(0.5, L * 0.04); p.addScaledVector(up, Math.sin(k * 18 - t * 40) * amp * env); p.addScaledVector(side, Math.cos(k * 13 - t * 30) * amp * 0.6 * env); }
      else p.y -= env * Math.min(0.3, L * 0.006);
      pts.push(p);
    }
    for (let i = 0; i < SEG; i++) {
      const p0 = pts[i], p1 = pts[i + 1];
      const d = p1.clone().sub(p0); const l = d.length();
      q4.setFromUnitVectors(zAxis, d.divideScalar(l || 1));
      s4.set(1, 1, l);
      m4.compose(p0, q4, s4);
      rope.setMatrixAt(i, m4);
    }
    rope.instanceMatrix.needsUpdate = true;
    rope.visible = true;
    hook.visible = true;
    hook.position.copy(b);
    hook.quaternion.setFromUnitVectors(V(0, 0, -1), ndir);
    if (gr.state === 'attached') {
      anchorMk.visible = true;
      anchorMk.position.copy(gr.point).addScaledVector(gr.normal, 0.04);
      anchorMk.lookAt(gr.point.clone().add(gr.normal));
      anchorMk.scale.setScalar(1 + 0.25 * Math.sin(t * 12));
    } else anchorMk.visible = false;
  };
})();
