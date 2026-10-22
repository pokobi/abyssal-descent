'use strict';
// Central combat: damage pipeline (shields, crits, headshots, statuses), explosions, projectiles, zones, pickups, allies, buff event bus.
(function () {
  const C = (G.combat = { projectiles: [], zones: [], pickups: [], mines: [], allies: [], decoys: [], walls: [] });
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P = null;
  const U = G.U;

  // ---------------- buff event bus ----------------
  G.buffs = {
    emit(ev, ctx) {
      const pl = G.player; if (!pl) return;
      for (const [id, n] of pl.buffs) {
        const b = G.BUFF_BY_ID[id];
        if (!b || !b.hooks || !b.hooks[ev]) continue;
        let st = pl.buffState[id]; if (!st) st = pl.buffState[id] = {};
        try { b.hooks[ev](ctx, n, st); } catch (e) { console.warn('buff', id, e); }
      }
    },
  };

  C.init = function () { P = G.player; };
  C.area = () => (G.game && G.game.area) || 1;
  C.scale = (v) => v * (1 + 0.14 * (C.area() - 1));
  C.gunScale = () => 1 + 0.07 * (C.area() - 1);

  // ---------------- player-side helpers used by buffs/skills ----------------
  // life drain is paid out of a refilling pool tied to max HP: damage grows far faster than HP over a run,
  // so a flat % of damage was weak early and near-immortal late. pool: refills (lifesteal% x 1.5) of max HP per second, holds 20%.
  C.leech = function (amount, ls) {
    if (!P || P.dead || amount <= 0) return;
    const mx = P.stats.maxHp, now = G.game.time;
    const rate = mx * Math.max(0.03, ls || P.stats.lifesteal) * 1.5, cap = mx * 0.2;
    P._lsB = Math.min(cap, (P._lsB ?? cap) + Math.max(0, now - (P._lsT ?? now)) * rate); P._lsT = now;
    const h = Math.min(amount, P._lsB); P._lsB -= h;
    if (h > 0) C.heal(h, true);
  };
  C.heal = function (amount, silent) {
    if (!P || P.dead || amount <= 0) return;
    amount *= Math.max(0, 1 + P.stats.healMul);
    if (P.has('t_blood') && false) return;
    const max = P.stats.maxHp;
    const over = P.hp + amount - max;
    P.hp = Math.min(max, P.hp + amount);
    if (over > 0 && P.has('d_overheal')) P.os = Math.min(Math.max(P.os, 60), P.os + over);
    if (!silent && amount >= 5) G.ui.healFlash();
  };
  C.overshield = function (amount, cap) { if (!P) return; P.os = Math.min(Math.max(P.os, cap || 9999), P.os + amount); };
  // a shield that only lasts `dur` seconds
  C.timedShield = function (amount, dur, cap) { if (!P) return; const b = P.os; C.overshield(amount, cap); const add = P.os - b; if (add > 0) (P.tShields || (P.tShields = [])).push({ left: add, t: dur }); };
  C.temp = function (id, dur, mods, icon, label) {
    const ex = P.temps.get(id);
    P.temps.set(id, { t: dur, max: dur, mods, icon: icon || '✨', label });
    if (!ex) P.recalc(); else ex.t = dur;
    P.recalc();
  };
  C.untemp = function (id) { if (P.temps.delete(id)) P.recalc(); };
  C.cdReduce = function (s) { for (const sk of P.skills) if (sk && !(sk.def && sk.def.ult) && sk.cd > 0) sk.cd = Math.max(0, sk.cd - s); if (P.pileCd > 0) P.pileCd = Math.max(0, P.pileCd - s); };
  C.cdResetAll = function () { for (const sk of P.skills) if (sk && !(sk.def && sk.def.ult)) { sk.cd = 0; if (sk.maxCharges) sk.charges = sk.maxCharges; } P.grappleCd = 0; P.pileCd = 0; };
  C.ultReduce = function (s) { const u = P.skills[0]; if (u && u.def.ult && u.cd > 0) u.cd = Math.max(0, u.cd - s); };
  C.refill = function (frac, silent) {
    const w = P.weapon; if (!w) return;
    const max = G.weapons.stats(w).mag;
    w.magAcc = (w.magAcc || 0) + frac * max;
    const add = Math.floor(w.magAcc);
    if (add > 0) { w.magAcc -= add; w.mag = Math.min(max, w.mag + add); }
  };
  C.refillN = function (n) { const w = P.weapon; if (!w) return; w.mag = Math.min(G.weapons.stats(w).mag, w.mag + n); };
  C.finishReload = function () { const w = P.weapon; if (w && w.reloading) w.reloadT = 0.001; };
  C.inRadius = (pos, r) => G.enemies.inRadius(pos, r);
  C.nearest = (pos, r, excl) => G.enemies.nearest(pos, r, excl);
  C.randomEnemy = function (r) { const a = G.enemies.inRadius(P.pos, r); return a.length ? a[Math.floor(Math.random() * a.length)] : null; };
  C.statusCount = function (e) { const s = e.st; if (!s) return 0; let n = 0; for (const k of ['burn', 'frost', 'poison', 'shock', 'bleed']) if (s[k] > 0) n++; return n; };
  // stun with diminishing returns: repeated stuns get shorter, then the foe shrugs them off for a few seconds.
  // Bosses are immune outright.
  C.stunImmune = (e) => e.boss || (e.mut && e.mut.nullify) || G.game.time < (e.stunImmuneUntil || 0);
  C.stun = function (e, d) {
    if (!e.alive || C.stunImmune(e)) return;
    const now = G.game.time;
    e.stunRes = Math.max(0, (e.stunRes || 0) - (now - (e.stunResT ?? now)) * 0.2); e.stunResT = now;
    const dur = d * (1 - Math.min(0.8, e.stunRes));
    if (dur < 0.08) return;
    e.st.stun = Math.max(e.st.stun || 0, dur);
    e.stunRes += 0.3 + Math.min(0.3, d * 0.15);
    if (e.stunRes >= 0.85) { e.stunImmuneUntil = now + e.st.stun + 3.5; e.stunRes = 0; G.fx.dmgNum(e.centerPos().add(new THREE.Vector3(0, 0.6, 0)), 'スタン耐性', 'immune'); }
  };
  C.fear = function (e, d) { if (!e.alive || e.boss) return; e.st.fear = Math.max(e.st.fear || 0, d); };

  // ---------------- coins & pickups ----------------
  // 技 augments: every skill / pile / ultimate hit may burn, chill, shock, stun or heal
  C.techOnHit = function (e, dealt, info) {
    const st = P.stats;
    if (st.techBurn && Math.random() < 0.35 * st.techBurn) C.status(e, 'burn', 2);
    if (st.techFrost && Math.random() < 0.35 * st.techFrost) C.status(e, 'frost', 2);
    if (st.techShock && Math.random() < 0.25 * st.techShock && e.alive) C.chain(e, 2, dealt * 0.3, 8, { src: 'skill', proc: true, noTech: true });
    if (st.techStun && e.alive && !e.boss && Math.random() < 0.15) C.stun(e, 0.6);
    if (st.techVamp) C.heal(dealt * 0.04 * st.techVamp, true);
  };
  C.coins = function (amount, pos, reason, isBonus) {
    if (!G.game.run || C._noCoins) return;
    let a = amount * (1 + P.stats.coinMul);
    a = Math.max(1, Math.round(a));
    if (pos) {
      // drop physical coins that fly to the player
      const n = Math.min(8, Math.max(1, Math.ceil(a / 6)));
      for (let i = 0; i < n; i++) C.spawnPickup('coin', pos, Math.floor(a / n) + (i < a % n ? 1 : 0));
    } else {
      G.game.run.coins += a; G.game.run.coinsTotal += a;
      G.ui.coinPop(a, reason);
      G.sfx.coins(Math.min(5, Math.ceil(a / 20)));
      G.buffs.emit('onCoin', { amount: a });
    }
  };
  let coinGeo = null, coinMat = null, orbMat = null;
  C.spawnPickup = function (kind, pos, value) {
    if (!coinGeo) {
      coinGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.025, 12); coinGeo.rotateX(Math.PI / 2);
      coinMat = new THREE.MeshStandardMaterial({ color: 0xe8b84a, metalness: 1, roughness: 0.28, emissive: 0x3a2400 });
      orbMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a });
    }
    let m;
    if (kind === 'coin') m = new THREE.Mesh(coinGeo, coinMat);
    else { m = new THREE.Mesh(G.Props.PG.sph, orbMat); m.scale.setScalar(0.16); }
    m.position.copy(pos);
    G.scene.add(m);
    const a = Math.random() * 6.28;
    C.pickups.push({ kind, m, v: V(Math.cos(a) * U.rand(1, 3), U.rand(3, 6), Math.sin(a) * U.rand(1, 3)), value, t: 0, floor: G.world.floorBelow(pos.x, pos.y + 0.5, pos.z) });
  };
  function updatePickups(dt) {
    const eye = P.pos.clone(); eye.y += 1.0;
    for (let i = C.pickups.length - 1; i >= 0; i--) {
      const p = C.pickups[i];
      p.t += dt;
      const d = p.m.position.distanceTo(eye);
      const range = P.stats.pickupRange;
      if ((p.t > 0.5 && d < range) || p.t > 1.6 || p.homing) {
        p.homing = true;
        const dir = eye.clone().sub(p.m.position).normalize();
        const sp = 10 + p.t * 12;
        p.m.position.addScaledVector(dir, sp * dt);
      } else {
        p.v.y -= 20 * dt;
        p.m.position.addScaledVector(p.v, dt);
        if (p.m.position.y < p.floor + 0.1) { p.m.position.y = p.floor + 0.1; p.v.y = Math.abs(p.v.y) * 0.4; p.v.x *= 0.6; p.v.z *= 0.6; }
      }
      p.m.rotation.y += dt * 8;
      if (d < 0.9 || p.t > 6) {
        if (p.kind === 'coin') {
          G.game.run.coins += p.value; G.game.run.coinsTotal += p.value;
          G.ui.coinPop(p.value);
          G.sfx.coin();
          G.buffs.emit('onCoin', { amount: p.value });
        } else { C.heal(p.value); G.sfx.heal(); }
        G.scene.remove(p.m);
        C.pickups.splice(i, 1);
      }
    }
  }

  // ---------------- damage to enemies ----------------
  const SHIELD_BASE = { bullet: 0.6, melee: 0.6, explosion: 0.9, skill: 1.0, buff: 0.7, dot: 0.3, ally: 0.6 };
  C.damageEnemy = function (e, amount, info) {
    if (!e || !e.alive || e.dying) return 0;
    info = info || {};
    const src = info.src || 'bullet';
    const st = P.stats;
    const pos = info.pos || e.centerPos();
    if (e.invuln || (e.isInvuln && e.isInvuln(info))) {
      if (!info.silent && src !== 'dot') { G.fx.dmgNum(pos, '無効', 'immune'); if (src === 'bullet') { G.fx.sparks(pos, null, 4, 0xcfcfcf, 5); G.sfx.impact(pos, 'metal'); } }
      if (e.onImmuneHit) e.onImmuneHit(info);
      return 0;
    }
    const dist = P.pos.distanceTo(e.pos);
    const ctx = { e, bonus: 0, head: !!info.head, src, dist, weapon: info.weapon, proc: !!info.proc, execute: false, crit: false, part: info.part, lowHit: info.lowHit, shieldBonus: 0, heavy: !!info.heavy, backstab: !!info.backstab, forceCrit: false };
    if (!info.noBuffs && src !== 'dot') G.buffs.emit('preHit', ctx);
    let add = st.dmg + ctx.bonus;
    if (src === 'skill') add += st.skillDmg + (info.ult ? st.ultDmg || 0 : 0);
    if (src === 'explosion') add += st.explosionDmg;
    if (info.grenade) add += st.grenadeDmg;
    if (src === 'melee') add += st.meleeDmg;
    if (e.boss) add += st.bossDmg;
    if (e.elite || e.boss) add += st.eliteDmg + (info.eliteBonus || 0);
    if (P.adsActive && src === 'bullet') add += st.adsDmg;
    if (src === 'dot') add = 0;
    let dmg = amount * Math.max(0.1, 1 + add);
    if (G.game.dev && G.game.dev.oneHit && src !== 'dot') dmg = Math.max(dmg, (e.hp + (e.shield || 0)) * 4 + 1e5);
    if (info.elem === 'shock' && e.wetUntil > G.game.time) dmg *= 1.5; // wet from shallow water
    // pile driver vs. shock-resistant foes (and flyers hovering above the shockwave)
    if (info.pile) { if (e.pileRes) dmg *= [1, 0.7, 0.45, 0.25][e.pileRes]; if (e.flyer && e.pos.y - P.pos.y > 2.2) dmg *= 0.5; if (e.boss) dmg *= 0.5; } // guardians brace against the shockwave
    if (info.head) dmg *= info.headMul || 2;
    // crits
    let crit = false;
    if (src === 'bullet' || src === 'melee' || src === 'skill' || src === 'ally') {
      let cc = st.critChance + (info.critBonus || 0);
      if (info.forceCrit || ctx.forceCrit || Math.random() < cc) { crit = true; dmg *= info.forceCrit ? Math.max(2.5, st.critMul) : st.critMul; }
    }
    ctx.crit = crit;
    if (e.st.mark > 0) dmg *= 1.6;
    if (e.dmgMul) dmg *= e.dmgMul(info, ctx);
    // front armour (beetles etc.)
    let armored = false;
    if (e.def.frontArmor && src !== 'dot' && !e.st.stun) {
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      const tx = P.pos.x - e.pos.x, tz = P.pos.z - e.pos.z, tl = Math.hypot(tx, tz) || 1;
      if ((fx * tx + fz * tz) / tl > 0.45) { dmg *= 1 - e.def.frontArmor; armored = true; }
    }
    if (ctx.execute && !e.boss) dmg = e.hp + e.shield + 1;
    // ---- shields ----
    let shieldDealt = 0;
    if (e.shield > 0) {
      const eff = (info.shieldMul || 1) * (SHIELD_BASE[src] ?? 0.6) * (1 + st.shieldDmg + (ctx.shieldBonus || 0)) * (info.elem === 'shock' ? 1.5 : 1);
      const sd = dmg * eff;
      if (sd >= e.shield) {
        shieldDealt = e.shield;
        dmg = (sd - e.shield) / eff;
        e.shield = 0;
        G.fx.bubble(e.centerPos(), e.radius * 1.7, 0xd8eeff);
        G.fx.sparks(e.centerPos(), null, 26, 0xcfe8ff, 9);
        G.sfx.shieldBreak(e.pos);
        G.fx.dmgNum(pos, 'BREAK', 'shield');
        G.buffs.emit('onShieldBreak', { e });
        if (info.emp && !e.boss) C.stun(e, 2.5);
        if (e.onShieldBreak) e.onShieldBreak();
      } else {
        e.shield -= sd; shieldDealt = sd;
        dmg = P.has('o_shieldpierce') ? dmg * 0.25 : 0;
        if (src !== 'dot' && !info.silent) {
          if (!e._bubT || G.game.time - e._bubT > 0.08) { e._bubT = G.game.time; G.fx.bubble(e.centerPos(), e.radius * 1.6, 0xbfe2ff, e.centerRef); }
          if (src === 'bullet') { G.fx.sparks(pos, null, 7, 0xcfe8ff, 6); G.sfx.hitShield(pos); }
        }
      }
      if (shieldDealt > 0 && !info.silent && src !== 'dot') G.fx.dmgNum(pos, shieldDealt, 'shield');
    }
    // ---- health ----
    let dealt = 0, overkill = 0;
    if (dmg > 0) {
      dealt = Math.min(e.hp, dmg);
      overkill = Math.max(0, dmg - e.hp);
      e.hp -= dmg;
      e.lastHitT = G.game.time;
      e.flinch = Math.min(1, e.flinch + (src === 'dot' ? 0.05 : 0.35));
      if (!info.silent) {
        G.fx.dmgNum(pos, dmg, src === 'dot' ? (info.elem === 'poison' ? 'poison' : 'dot') : info.head ? 'head' : crit ? 'crit' : '');
        if (src === 'bullet' || src === 'melee') {
          G.fx.blood(pos, info.dir ? info.dir.clone() : null, e.bloodColor, info.head ? 12 : 6);
          G.sfx.hitFlesh(pos, false, dmg > 60);
          if (info.head) G.sfx.headshot(e.hp <= 0);
          if (Math.random() < 0.3) G.fx.decal(V(pos.x, G.world.floorBelow(pos.x, pos.y, pos.z) + 0.01, pos.z), V(0, 1, 0), 'splat', U.rand(0.4, 0.9), true, e.bloodColor);
        }
        if (armored && src === 'bullet') { G.fx.sparks(pos, null, 6, 0xffe0b0, 6); G.sfx.impact(pos, 'metal'); }
      }
      // lifesteal (direct hits only)
      if (!info.proc && src !== 'dot') {
        const ls = st.lifesteal + (info.weapon && info.weapon.trait === 'lifesteal' ? 0.04 : 0) + (info.lifesteal || 0);
        if (ls > 0) C.leech(dealt * ls, ls);
      }
    }
    if ((src === 'bullet' || src === 'melee') && !info.noMarker) G.ui.hitMarker(e.hp <= 0 ? 'kill' : info.head ? 'head' : shieldDealt > 0 && dmg <= 0 ? 'shield' : '');
    // ---- statuses ----
    if (src !== 'dot') {
      if (info.elem && Math.random() < (info.elemChance ?? 1)) C.status(e, info.elem, info.stacks || 1);
      if (st.elemChance > 0 && !info.proc && Math.random() < st.elemChance) C.status(e, info.elem || U.pick(['burn', 'frost', 'poison', 'shock', 'bleed']), 1);
      if (info.knock && !e.boss) e.knockback(info.dir || e.pos.clone().sub(P.pos).setY(0).normalize(), info.knock);
    }
    ctx.dmg = dealt + shieldDealt; ctx.pos = pos;
    if (!info.proc && src !== 'dot') G.buffs.emit('onHit', ctx);
    G.enemies.onDamaged(e, info);
    if (e.mut) G.Depth.onHurt(e, info, dealt + shieldDealt);
    if (e.hp <= 0) C.killEnemy(e, info, overkill);
    if (src === 'skill' && !info.proc && !info.noTech && dealt + shieldDealt > 0) C.techOnHit(e, dealt + shieldDealt, info);
    { const skId = info.sk || ((src === 'skill' || src === 'explosion') && C.curSk); if (skId && !info.noSkOn && dealt + shieldDealt > 0 && C.skOnHit) C.skOnHit(e, dealt + shieldDealt, skId, info); }
    return dealt + shieldDealt;
  };
  C.killEnemy = function (e, info, overkill) {
    const run = G.game.run;
    const really = e.die(info);
    if (!really) return;
    if (e.ally) return;
    run.kills++;
    if (info.head) run.headshots++;
    G.save.mark('kills', e.def.id); G.save.data.records.totalKills++;
    // combo & multikill
    const now = G.game.time;
    run.combo = now - run.lastKillT < 3 ? run.combo + 1 : 1;
    run.lastKillT = now;
    run.multi = now - run.multiT < 0.6 ? run.multi + 1 : 1;
    run.multiT = now;
    // rewards
    if (e.bossSpawn && !e.noReward && Math.random() < 0.09 + P.stats.healDrop) C.spawnPickup('orb', e.centerPos(), 15);
    if (!e.noReward && !e.bossSpawn) {
      // fewer foes per area (waves) -> each kill is worth more
      let base = (7 + Math.max(1, e.level - G.Run.lvOff()) * 1.1) * 1.8 * (e.def.big ? 1.6 : 1) * (e.elite ? 4 : 1) * (e.boss ? 0 : 1);
      if (e.elite && P.has('e_bounty')) base *= 2;
      if (P.has('k_combo')) base *= 1 + Math.min(1, (run.combo - 1) * 0.1);
      if (info.head) base += 3;
      if (P.temps.has('u_lantern')) { base += 3; C.heal(8); }
      C.coins(Math.round(base), e.centerPos());
      if (Math.random() < 0.09 + P.stats.healDrop) C.spawnPickup('orb', e.centerPos(), 15);
      if (run.multi >= 2) {
        const bonus = Math.round(run.multi * 6 * (P.has('k_multi') ? 2 : 1));
        G.ui.feed(`マルチキル ×${run.multi}  +${bonus}`, 'big');
        C.coins(bonus, null);
      }
      if (info.head) G.ui.feed('ヘッドショット', 'hs');
      if (e.elite) G.ui.feed(`精鋭撃破 ${e.def.name}`, 'big');
    }
    C._noCoins = !!e.bossSpawn; // kill hooks (bounties, midas...) pay nothing for boss adds either
    try { G.buffs.emit('onKill', { e, pos: e.centerPos(), head: !!info.head, src: info.src, overkill: overkill || 0, weapon: info.weapon, proc: info.proc }); } finally { C._noCoins = false; }
    if (info.weapon && info.weapon.trait === 'killReload') { info.weapon.mag = G.weapons.stats(info.weapon).mag; info.weapon.reloading = false; }
    if (e.st.markKillReset) {
      const sk = P.skills.find((s) => s && s.id === 'mark'); if (sk) sk.cd = 0;
      const m = G.abilities.skm('mark');
      if (m.x_heal) C.heal(15);
      if (m.x_spread) { let n = 0; for (const o of G.enemies.inRadius(e.pos, 12)) { if (o === e || !o.alive || n >= 2) continue; C.status(o, 'mark', 8); o.st.markKillReset = true; G.fx.beam(e.centerPos(), o.centerPos(), 0xff4030, 0.04, 0.3); n++; } }
    }
    G.game.onEnemyKilled(e);
  };

  // ---------------- statuses ----------------
  C.status = function (e, kind, stacks) {
    if (!e || !e.alive || (e.mut && e.mut.nullify)) return;
    const s = e.st; stacks = stacks || 1;
    const st = P.stats;
    const dotMul = 1 + (st.dotDmg || 0);
    switch (kind) {
      case 'fire': case 'burn':
        s.burn = 4; s.burnDps = Math.max(s.burnDps || 0, C.scale(7) * (1 + st.burnDmg) * dotMul * (0.8 + stacks * 0.2)); break;
      case 'frost':
        if (s.frozen > 0) break;
        s.frostStacks = (s.frostStacks || 0) + stacks; s.frost = 4;
        // freezing follows the same rule: bosses only get slowed, and a thawed foe can't be refrozen right away
        if (s.frostStacks >= 5 && (e.boss || G.game.time < (e.freezeImmuneUntil || 0))) { s.frostStacks = 4; break; }
        if (s.frostStacks >= 5) { s.frozen = 2.0; e.freezeImmuneUntil = G.game.time + 2.0 + 4; s.frostStacks = 0; G.sfx.ice(e.pos); G.fx.sparks(e.centerPos(), null, 14, 0xd0f0ff, 5); }
        break;
      case 'poison': {
        const max = 8 + (st.poisonStacks || 0);
        s.poisonStacks = Math.min(max, (s.poisonStacks || 0) + stacks); s.poison = 5;
        if (P.has('x_toxburst') && s.poisonStacks >= 5) {
          s.poisonStacks = 0;
          G.fx.smoke(e.centerPos(), 10, 1.5, 0x6a9a2a, 0.5, 1.2);
          for (const o of C.inRadius(e.pos, 4)) { C.damageEnemy(o, C.scale(30), { src: 'buff', proc: true, silent: o !== e }); if (o !== e) C.status(o, 'poison', 2); }
        }
        break;
      }
      case 'shock':
        s.shock = 1.5;
        if (!C.stunImmune(e)) s.stun = Math.max(s.stun || 0, 0.18);
        if (!s._shockLock) {
          s._shockLock = true;
          C.damageEnemy(e, C.scale(8), { src: 'dot', elem: 'shock', silent: false, shieldMul: 3 });
          if (P.has('h_overcurrent')) { const t = C.nearest(e.pos, 8, e); if (t) { G.fx.lightning(e.centerPos(), t.centerPos()); C.status(t, 'shock', 1); } }
          s._shockLock = false;
        }
        G.fx.sparks(e.centerPos(), null, 5, 0xfff0a0, 4);
        break;
      case 'bleed': s.bleed = 5; s.bleedDps = Math.max(s.bleedDps || 0, C.scale(6) * dotMul * (0.8 + stacks * 0.25)); break;
      case 'slow': s.slow = 4; break;
      case 'mark': s.mark = stacks; break;
      case 'root': s.root = stacks; break;
    }
  };
  C.updateStatus = function (e, dt) {
    const s = e.st;
    for (const k of ['stun', 'fear', 'root', 'slow', 'mark', 'frozen', 'shock']) if (s[k] > 0) s[k] -= dt;
    if (s.frost > 0) { s.frost -= dt; if (s.frost <= 0) s.frostStacks = 0; }
    s.tick = (s.tick || 0) - dt;
    if (s.tick <= 0) {
      s.tick = 0.5;
      if (s.burn > 0) {
        C.damageEnemy(e, s.burnDps * 0.5, { src: 'dot', elem: 'fire' });
        G.fx.flameLick(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z, 1.2);
        if (P.has('x_spread') && Math.random() < 0.35) { const t = C.nearest(e.pos, 4, e); if (t && !(t.st.burn > 0)) C.status(t, 'burn', 1); }
      }
      if (s.poison > 0 && s.poisonStacks > 0) C.damageEnemy(e, C.scale(2.4) * s.poisonStacks * 0.5 * (1 + P.stats.poisonDmg + (P.stats.dotDmg || 0)), { src: 'dot', elem: 'poison' });
      if (s.bleed > 0) C.damageEnemy(e, s.bleedDps * 0.5, { src: 'dot', elem: 'bleed' });
    }
    if (s.burn > 0) { s.burn -= dt; if (Math.random() < dt * 14) G.fx.flameLick(e.pos.x + U.rand(-0.3, 0.3), e.pos.y + e.height * U.rand(0.2, 0.8), e.pos.z + U.rand(-0.3, 0.3), 0.8); }
    if (s.poison > 0) { s.poison -= dt; if (s.poison <= 0) s.poisonStacks = 0; if (Math.random() < dt * 5) G.fx.norm.spawn(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z, U.rand(-0.3, 0.3), -0.5, U.rand(-0.3, 0.3), 0.8, 0.12, 0.3, 0.45, 0.7, 0.15, 0.7, 2, 0.5); }
    if (s.bleed > 0) { s.bleed -= dt; if (Math.random() < dt * 6) G.fx.blood(e.centerPos(), null, e.bloodColor, 1); }
    if (s.shock > 0 && Math.random() < dt * 8) G.fx.sparks(e.centerPos(), null, 2, 0xfff0a0, 3);
  };
  C.speedMul = function (e) {
    const s = e.st;
    if (s.frozen > 0 || s.stun > 0 || s.root > 0) return 0;
    let m = 1;
    if (s.frost > 0) m *= 1 - Math.min(0.5, (s.frostStacks || 0) * 0.1 + 0.1);
    if (s.slow > 0) m *= 0.7;
    if (G.game.enemyTimeScale < 1) m *= 1;
    return m * (1 + P.stats.enemySpeed) * G.Depth.speedMul(e);
  };
  C.burstBleed = function (e) { const s = e.st; if (s.bleed > 0) { const d = s.bleedDps * s.bleed; s.bleed = 0; C.damageEnemy(e, d, { src: 'dot', elem: 'bleed' }); G.fx.blood(e.centerPos(), null, e.bloodColor, 20); } };
  C.spreadStatus = function (e, r) {
    const s = e.st;
    for (const o of C.inRadius(e.pos, r)) {
      if (o === e) continue;
      if (s.burn > 0) C.status(o, 'burn', 1);
      if (s.poisonStacks > 0) C.status(o, 'poison', Math.ceil(s.poisonStacks / 2));
      if (s.frost > 0) C.status(o, 'frost', 2);
      if (s.bleed > 0) C.status(o, 'bleed', 1);
    }
  };

  // ---------------- AoE ----------------
  C.explode = function (pos, r, dmg, info) {
    info = Object.assign({ src: 'explosion' }, info || {});
    if (!info.enemy && !info.sk && C.curSk) info.sk = C.curSk;
    if (!info.enemy) r *= 1 + P.stats.explosionRadius;
    if (!info.noFx) {
      if (info.small) { G.fx.explosion(pos, r * 0.7, info.color || 0xff9a40, { noSmoke: false, decal: false }); G.sfx.explosion(pos, 0.4); }
      else { G.fx.explosion(pos, r, info.color || 0xff9a40); G.sfx.explosion(pos, r / 4); }
    }
    const d = P.pos.distanceTo(pos);
    G.player.addShake(Math.max(0, (info.small ? 0.25 : 0.7) * (1 - d / (r * 4))));
    if (info.enemy) {
      // enemy explosion hurts the player
      if (d < r + 0.4) C.damagePlayer(dmg * (1 - 0.5 * d / (r + 0.4)), { src: 'explosion', pos, attacker: info.attacker, elem: info.elem });
      return;
    }
    // your own grenade hurts you too: inside the blast you take a fifth (20%) of its damage
    if (info.grenade && !info.isCluster && !info.noSelf && d < r) C.damagePlayer(dmg * 0.2 / ((C.ENEMY_DMG || 1) * Math.max(0.1, 1 + P.stats.enemyDmg)), { src: 'explosion', pos }); // exactly 20% of the grenade's damage (before your armour)
    for (const e of G.enemies.inRadius(pos, r + 0.6)) {
      if (info.los && !C.pileLos(pos, e)) continue;
      const dd = Math.max(0, e.pos.distanceTo(pos) - e.radius);
      const k = 1 - 0.5 * Math.min(1, dd / r);
      const dir = e.pos.clone().sub(pos).setY(0); dir.y = 0.5; dir.normalize();
      C.damageEnemy(e, dmg * k, Object.assign({}, info, { pos: e.centerPos(), dir, knock: info.knock ?? 6, noMarker: true }));
    }
    for (const ds of G.world.destructibles) if (ds.alive && ds.pos.distanceTo(pos) < r + 0.5) C.damageDestructible(ds, dmg, pos);
    if (G.bosses.active) G.bosses.active.aoe && G.bosses.active.aoe(pos, r, dmg, info);
    if (!info.proc) G.buffs.emit('onExplode', { pos, radius: r });
    if (G.Fields) G.Fields.onExplode(pos, r);
    if (info.cluster) for (let i = 0; i < info.cluster; i++) C.spawnProjectile({ kind: 'grenade', pos: pos.clone().add(V(0, 0.4, 0)), vel: V(U.rand(-5, 5), U.rand(5, 8), U.rand(-5, 5)), grav: 18, owner: 'player', dmg: dmg * 0.4, explode: r * 0.55, fuse: U.rand(0.5, 0.9), bounce: true, info: { src: 'explosion', sk: info.sk, isCluster: true, small: true } });
    if (info.grenade && P.has('g_cluster') && !info.isCluster) {
      for (let i = 0; i < 3; i++) C.spawnProjectile({ kind: 'grenade', pos: pos.clone().add(V(0, 0.4, 0)), vel: V(U.rand(-5, 5), U.rand(5, 8), U.rand(-5, 5)), grav: 18, owner: 'player', dmg: dmg * 0.35, explode: r * 0.55, fuse: U.rand(0.6, 1.0), bounce: true, info: { src: 'explosion', grenade: true, isCluster: true, small: true } });
    }
  };
  C.chain = function (from, n, dmg, range, info) {
    const hit = new Set();
    let cur = from && from.isEnemy ? from : null;
    let pos = cur ? cur.centerPos() : from.clone();
    if (cur) hit.add(cur);
    for (let i = 0; i < n; i++) {
      let best = null, bd = range;
      for (const e of G.enemies.inRadius(pos, range)) { if (hit.has(e)) continue; const d = e.centerPos().distanceTo(pos); if (d < bd) { bd = d; best = e; } }
      if (!best) break;
      const np = best.centerPos();
      G.fx.lightning(pos, np, 0xd0e4ff);
      hit.add(best);
      C.damageEnemy(best, dmg, Object.assign({ src: 'skill', elem: 'shock', proc: true, shieldMul: 1.5 }, info));
      pos = np;
    }
    if (hit.size > 0) G.sfx.zap(pos);
  };
  C.lightningStrike = function (e, dmg) {
    const p = e.centerPos();
    const top = p.clone(); top.y += 18; top.x += U.rand(-2, 2);
    G.fx.lightning(top, p, 0xe0ecff);
    G.fx.flash(p, 0xcfe0ff, 60, 0.15, 20);
    G.sfx.zap(p); G.sfx.explosion(p, 0.3);
    C.damageEnemy(e, dmg, { src: 'skill', elem: 'shock', proc: true, shieldMul: 2 });
  };
  C.spiritBite = function (e, dmg) {
    const p = e.centerPos();
    for (let i = 0; i < 3; i++) G.fx.tracer(p.clone().add(V(U.rand(-0.8, 0.8), 0.8, U.rand(-0.8, 0.8))), p.clone().add(V(U.rand(-0.5, 0.5), -0.4, U.rand(-0.5, 0.5))), 0xbfd8ff, 0.05, 0.2);
    G.fx.sparks(p, null, 10, 0xbfd8ff, 5);
    G.sfx.monster(p, 'snarl', 1.3, 0.6);
    C.damageEnemy(e, dmg, { src: 'skill', proc: true, elem: 'bleed' });
  };
  C.damageDestructible = function (d, dmg, pos) {
    if (!d.alive) return;
    d.hp -= dmg;
    if (d.mesh) { d.mesh.position.x += U.rand(-0.03, 0.03); d.mesh.position.z += U.rand(-0.03, 0.03); }
    if (d.hp <= 0) C.breakDestructible(d);
  };
  // restore helper: remove an already-broken object without effects or loot
  C.removeDestructibleSilent = function (d) {
    if (!d.alive) return;
    d.alive = false; G.world.removeCollider(d.col); if (d.mesh) G.world.group.remove(d.mesh);
    const W = G.world;
    for (let z = Math.floor(d.col.z0) - 1; z <= Math.ceil(d.col.z1); z++) for (let x = Math.floor(d.col.x0) - 1; x <= Math.ceil(d.col.x1); x++) {
      const i = W.navIdx(x + 0.5, z + 0.5); if (i < 0) continue;
      const a = W.query(x + 0.5 - 0.32, W.nf[i] + 0.85, z + 0.5 - 0.32, x + 0.5 + 0.32, W.nf[i] + 1.9, z + 0.5 + 0.32);
      W.nb[i] = a.length ? 1 : 0;
    }
  };
  C.breakDestructible = function (d) {
    if (!d.alive) return;
    d.alive = false;
    G.world.removeCollider(d.col);
    if (d.mesh) { G.world.group.remove(d.mesh); }
    const mats = G.world.mats;
    G.fx.debris(d.pos, d.mat === 'ceramic' ? mats.ceramic : mats.wood, d.type === 'urn' ? 10 : 12, d.type === 'urn' ? 0.12 : 0.2, 6);
    G.fx.dust(d.pos, null, 0x7a6a50, 6);
    G.sfx.breakObj(d.pos, d.mat);
    // re-open nav cells
    const W = G.world;
    for (let z = Math.floor(d.col.z0) - 1; z <= Math.ceil(d.col.z1); z++) for (let x = Math.floor(d.col.x0) - 1; x <= Math.ceil(d.col.x1); x++) {
      const i = W.navIdx(x + 0.5, z + 0.5); if (i < 0) continue;
      const a = W.query(x + 0.5 - 0.32, W.nf[i] + 0.85, z + 0.5 - 0.32, x + 0.5 + 0.32, W.nf[i] + 1.9, z + 0.5 + 0.32);
      W.nb[i] = a.length ? 1 : 0;
    }
    const mul = P.has('e_destroy') ? 2 : 1;
    if (d.explosive) {
      setTimeout(() => C.explode(d.pos.clone(), 5, C.scale(140), { src: 'explosion', hurtsPlayer: false }), 60);
      // barrels also hurt the player if close
      const dd = P.pos.distanceTo(d.pos);
      if (dd < 4) C.damagePlayer(25 * (1 - dd / 4), { src: 'explosion', pos: d.pos });
    } else if (Math.random() < 0.55) C.coins(Math.round(U.randi(d.coins[0], d.coins[1]) * mul * (1 + C.area() * 0.08)), d.pos);
    if (P.has('e_destroy') && Math.random() < 0.08) C.spawnPickup('orb', d.pos, 15);
    G.game.run.destroyed++;
  };

  // ---------------- damage to player ----------------
  C.ENEMY_DMG = 1.25; // tuned for a player wearing armour (defence)
  C.defMul = (def) => 100 / (100 + Math.max(0, def || 0));
  C.damagePlayer = function (amount, info) {
    if (!P || P.dead || (G.game.state !== 'playing' && G.game.state !== 'inv')) return 0;
    info = info || {};
    if (P.invulnT > 0 || (G.game.dev && G.game.dev.god)) return 0;
    amount *= 1 + P.stats.enemyDmg;
    if (G.game.enrage && G.game.enrage.lv && info.src !== 'fall' && info.src !== 'dot') amount *= G.game.enrage.dmg; // a fight that drags on (see game.js updateEnrage)
    // defence (from armour) is its own reduction, applied before the percentage ones
    amount *= C.ENEMY_DMG * C.defMul(P.stats.defense);
    if ((info.src === 'explosion' || info.src === 'aoe') && P.stats.blastRes) amount *= Math.max(0.2, 1 - P.stats.blastRes);
    if (Math.random() < Math.min(0.75, P.stats.dodge)) { G.ui.toastSmall('回避!'); G.sfx.whoosh(0.2, 0.4); return 0; }
    const ctx = { amount, red: 0, src: info.src || 'melee', attacker: info.attacker, elem: info.elem };
    G.buffs.emit('preDamaged', ctx);
    if (ctx.block) return 0;
    if (P.pileState === 'charge') ctx.red += 0.5;
    let armor = U.clamp(P.stats.armor + ctx.red, -1, 0.85);
    let dmg = amount * (1 - armor);
    if (P.has('d_iron')) dmg = Math.min(dmg, P.stats.maxHp * 0.25);
    if (dmg <= 0) return 0;
    let osHit = 0;
    if (P.os > 0) { osHit = Math.min(P.os, dmg); P.os -= osHit; dmg -= osHit; }
    // lethal-blow protection (buffs: 踏みとどまり / 不死身): from high HP a single hit can't kill you outright
    const und = P.has('d_undying');
    if ((und || P.has('d_grit')) && dmg >= P.hp && P.hp >= P.stats.maxHp * (und ? 0.5 : 0.8) && G.game.time - (P.lastGuardT ?? -99) > (und ? 10 : 25)) {
      dmg = Math.max(0, P.hp - 1); P.lastGuardT = G.game.time; P.invulnT = Math.max(P.invulnT || 0, 0.8);
      G.ui.toast('💢 致命の一撃を耐えた！', 'warn'); G.sfx.heartbeat(1);
    }
    if (P.temps.has('ult_bastion') && G.PStatus && G.PStatus.guardHit) G.PStatus.guardHit(amount, dmg + osHit);
    const atk = info.attacker;
    if (atk && atk.alive && atk.isEnemy) {
      if (P.temps.has('ult_bastion') && G.abilities.skm('ult_bastion').x_thorns) C.damageEnemy(atk, amount * 2, { src: 'skill', ult: true, sk: 'ult_bastion', proc: true, noBuffs: true });
      if (P.temps.has('thornarmor') && ctx.src === 'melee') C.damageEnemy(atk, amount * (G.abilities.skm('thornarmor').x_reflect ? 2 : 1), { src: 'skill', sk: 'thornarmor', proc: true, noBuffs: true });
    }
    P.hp -= dmg;
    if (G.Inv && G.Inv.wear && ctx.src !== 'dot' && ctx.src !== 'fall') G.Inv.wear(P, dmg + osHit); // worn armour takes the hit
    P.lastHurtT = G.game.time;
    G.game.run.dmgTaken += dmg + osHit;
    G.game.areaDamage += dmg + osHit;
    G.ui.damageFlash(Math.min(1, (dmg + osHit) / 30), info.pos || (info.attacker && info.attacker.pos));
    G.sfx.hurt(dmg + osHit);
    P.addShake(Math.min(0.6, 0.15 + (dmg + osHit) / 60));
    P.hurtKick = Math.min(1, (dmg + osHit) / 25);
    // statuses on player
    const ps = P.st;
    const cl = P.has('d_cleanse') ? 0.4 : 1;
    if (info.elem === 'fire') { ps.burn = 3 * cl; }
    if (info.elem === 'frost') { ps.slow = 2.5 * cl; }
    if (info.elem === 'poison') { ps.poison = 4 * cl; ps.poisonStacks = Math.min(5, (ps.poisonStacks || 0) + 1); }
    if (info.elem === 'shock') { ps.shock = 0.6 * cl; }
    if (info.elem === 'web') { ps.slow = 2.5 * cl; }
    G.game.lastCause = info.attacker && info.attacker.def ? info.attacker.def.name : ({ melee: '近接攻撃', ranged: '遠距離攻撃', explosion: '爆発', aoe: '範囲攻撃', dot: '状態異常', fall: '奈落' }[ctx.src] || ctx.src);
    G.buffs.emit('onDamaged', { amount: dmg + osHit, raw: amount, src: ctx.src, attacker: info.attacker });
    if (P.hp <= 0) P.onLethal();
    return dmg;
  };

  // ---------------- projectiles ----------------
  const projMeshes = {};
  function projMesh(kind) {
    const pool = projMeshes[kind] || (projMeshes[kind] = []);
    const m = pool.pop();
    if (m) { m.visible = true; return m; }
    const mats = G.world.mats;
    const PG = G.Props.PG;
    let g;
    const add = (geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) => { const mm = new THREE.Mesh(geo, mat); mm.scale.set(sx, sy, sz); mm.position.set(x || 0, y || 0, z || 0); mm.rotation.set(rx || 0, ry || 0, rz || 0); g.add(mm); return mm; };
    g = new THREE.Group();
    const glow = (c, s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: c, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.scale.setScalar(s); g.add(sp); return sp; };
    switch (kind) {
      case 'rocket': add(PG.cyl8, mats.iron, 0.07, 0.6, 0.07, 0, 0, 0, Math.PI / 2); add(PG.cone, mats.iron, 0.07, 0.18, 0.07, 0, 0, -0.38, -Math.PI / 2); glow(0xffa050, 0.6).position.z = 0.35; break;
      case 'grenade': add(PG.sph, mats.iron, 0.09, 0.11, 0.09); add(PG.cyl8, mats.brass, 0.03, 0.05, 0.03, 0, 0.11, 0); break;
      case 'bottle': add(PG.cyl8, mats.water, 0.07, 0.2, 0.07); add(PG.cyl8, mats.cloth2, 0.025, 0.1, 0.025, 0, 0.14, 0); glow(0xff9040, 0.3).position.y = 0.2; break;
      case 'dyna': for (let i = 0; i < 3; i++) add(PG.cyl8, mats.ceramic, 0.035, 0.25, 0.035, (i - 1) * 0.07, 0, 0); break;
      case 'mine': add(PG.cyl, mats.iron, 0.2, 0.06, 0.2); add(PG.sph, mats.glow, 0.03, 0.03, 0.03, 0, 0.04, 0); break;
      case 'bolt': case 'arrow': add(PG.box, mats.woodDark, 0.025, 0.025, 0.7); add(PG.cone, mats.iron, 0.03, 0.1, 0.03, 0, 0, -0.38, -Math.PI / 2); add(PG.box, mats.cloth2, 0.005, 0.06, 0.12, 0, 0, 0.3); break;
      case 'nail': add(PG.box, mats.iron, 0.012, 0.012, 0.12); break;
      case 'harpoon': add(PG.box, mats.iron, 0.03, 0.03, 1.0); add(PG.cone, mats.iron, 0.06, 0.2, 0.06, 0, 0, -0.55, -Math.PI / 2); break;
      case 'spear': add(PG.cyl8, mats.woodDark, 0.03, 1.8, 0.03, 0, 0, 0, Math.PI / 2); add(PG.cone, mats.iron, 0.07, 0.35, 0.07, 0, 0, -1.05, -Math.PI / 2); glow(0xffe0a0, 0.5).position.z = -1; break;
      case 'icespear': add(PG.oct3, mats.ice, 0.12, 0.12, 0.9); glow(0xbfe8ff, 1.0); break;
      case 'orb': glow(0xc070ff, 0.8); glow(0xffffff, 0.25); break;
      case 'soul': glow(0x9fd8ff, 0.7); glow(0xffffff, 0.22); break;
      case 'fireball': glow(0xff8a30, 1.2); glow(0xffe0a0, 0.45); break;
      case 'bigfire': glow(0xff7a20, 2.6); glow(0xffe0a0, 1.0); break;
      case 'spit': add(PG.sph, new THREE.MeshStandardMaterial({ color: 0x6a9a20, emissive: 0x2a4a00, roughness: 0.2 }), 0.14, 0.14, 0.14); break;
      case 'acid': add(PG.sph, new THREE.MeshStandardMaterial({ color: 0x9ac020, emissive: 0x4a6a00, roughness: 0.2 }), 0.3, 0.3, 0.3); glow(0x9ad040, 1.0); break;
      case 'web': add(PG.sph, new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.9 }), 0.16, 0.16, 0.16); break;
      case 'spore': add(PG.sph, new THREE.MeshStandardMaterial({ color: 0x8aa040, emissive: 0x1a2a00, roughness: 0.9, transparent: true, opacity: 0.8 }), 0.25, 0.25, 0.25); break;
      case 'boulder': add(PG.dode, mats.rock, 0.6, 0.55, 0.6); break;
      case 'frostorb': glow(0xbfe8ff, 1.0); glow(0xffffff, 0.3); break;
      case 'darkorb': add(PG.sph, new THREE.MeshBasicMaterial({ color: 0x1a0820 }), 0.25, 0.25, 0.25); glow(0xa040ff, 1.1); break;
      default: glow(0xffffff, 0.4);
    }
    g.userData.kind = kind;
    G.scene.add(g);
    return g;
  }
  function releaseMesh(m) { m.visible = false; (projMeshes[m.userData.kind] = projMeshes[m.userData.kind] || []).push(m); }
  // a guardian falls: its shots, fields and anything it still had queued vanish with it
  C.purgeHostile = function () {
    C.muteHostileUntil = G.game.time + 4;
    for (let i = C.projectiles.length - 1; i >= 0; i--) { const p = C.projectiles[i]; if (p.owner !== 'player') { releaseMesh(p.mesh); C.projectiles.splice(i, 1); } }
    for (let i = C.zones.length - 1; i >= 0; i--) { const z = C.zones[i]; if (z.enemy) { if (z.pos) G.fx.smoke(z.pos.clone().setY(z.pos.y + 0.3), 4, 1, 0x1a1412, 1, 1); C.zones.splice(i, 1); } }
  };
  // can the pile shockwave reach this foe? (a wall in between blocks it; checked low and high so a waist-high ledge doesn't)
  C.pileLos = function (pos, e) {
    const w = G.world; if (!w || !w.los) return true;
    const a = pos.clone(); a.y += 0.5;
    const c = e.centerPos ? e.centerPos() : e.pos.clone().setY(e.pos.y + 1);
    return w.los(a, c) || w.los(a.clone().setY(a.y + 1.2), c.clone().setY(Math.max(c.y, e.pos.y + (e.height || 1.6))));
  };
  C.spawnProjectile = function (o) {
    if (o.owner === 'enemy' && G.game.time < (C.muteHostileUntil || 0)) return Object.assign({}, o, { dead: true });
    const p = Object.assign({ grav: 0, life: 6, radius: 0.15, pierce: 0, hit: new Set(), t: 0 }, o);
    p.pos = o.pos.clone(); p.vel = o.vel.clone();
    if (C.curSk && p.owner === 'player') {
      p.info = Object.assign({}, p.info || {}); if (!p.info.sk) p.info.sk = C.curSk;
      for (const k of ['onDetonate', 'onHitEnemy', 'onEnd']) if (p[k]) p[k] = G.abilities.withSk(p.info.sk, p[k]);
    }
    if (p.owner === 'enemy' && P.has('pact_fang')) p.vel.multiplyScalar(1.25);
    p.mesh = projMesh(o.kind);
    p.mesh.position.copy(p.pos);
    C.projectiles.push(p);
    return p;
  };
  function trail(p, dt) {
    switch (p.kind) {
      case 'rocket': G.fx.norm.spawn(p.pos.x, p.pos.y, p.pos.z, U.rand(-0.3, 0.3), U.rand(0, 0.5), U.rand(-0.3, 0.3), 1.2, 0.2, 1.0, 0.5, 0.48, 0.45, 0.5, -0.3, 1); G.fx.flame.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.08, 0.35, 0.1, 1.5, 0.9, 0.4, 1, 0, 0); break;
      case 'fireball': case 'bigfire': G.fx.flameLick(p.pos.x, p.pos.y - 0.1, p.pos.z, p.kind === 'bigfire' ? 2.5 : 1.0); break;
      case 'orb': case 'darkorb': G.fx.add.spawn(p.pos.x, p.pos.y, p.pos.z, U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), 0.4, 0.25, 0.02, 0.6, 0.3, 1.0, 0.8, 0, 1); break;
      case 'soul': G.fx.add.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.3, 0.2, 0.02, 0.5, 0.8, 1.0, 0.8, 0, 1); break;
      case 'frostorb': case 'icespear': G.fx.add.spawn(p.pos.x, p.pos.y, p.pos.z, U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), U.rand(-0.3, 0.3), 0.4, 0.2, 0.02, 0.7, 0.9, 1.0, 0.8, 0, 1); break;
      case 'acid': case 'spit': if (Math.random() < 0.5) G.fx.norm.spawn(p.pos.x, p.pos.y, p.pos.z, 0, -1, 0, 0.5, 0.08, 0.04, 0.5, 0.7, 0.1, 0.9, 5, 0); break;
      case 'bolt': case 'harpoon': case 'spear': case 'arrow': if (Math.random() < 0.4) G.fx.norm.spawn(p.pos.x, p.pos.y, p.pos.z, 0, 0, 0, 0.3, 0.04, 0.08, 0.7, 0.7, 0.7, 0.25, 0, 0); break;
    }
  }
  const tmpD = V();
  function updateProjectiles(dt) {
    const pdt = dt;
    for (let i = C.projectiles.length - 1; i >= 0; i--) {
      const p = C.projectiles[i];
      const sdt = p.owner === 'enemy' ? pdt * G.game.enemyTimeScale : pdt;
      p.t += sdt; p.life -= sdt;
      if (p.stuck) {
        if (p.stuckTo && p.stuckTo.alive) p.pos.copy(p.stuckTo.centerPos()).add(p.stuckOff);
        p.mesh.position.copy(p.pos);
        if (p.fuse !== undefined) { p.fuse -= sdt; if (p.fuse <= 0) { detonate(p); remove(i); } }
        else if (p.life <= 0) remove(i);
        continue;
      }
      // homing
      if (p.homing) {
        let tgt = p.target && p.target.alive ? p.target : null;
        if (!tgt && p.owner === 'player') { tgt = G.enemies.nearest(p.pos, 30); p.target = tgt; }
        const tp = p.owner === 'enemy' ? G.player.chestPos() : tgt ? tgt.centerPos() : null;
        if (tp) {
          const desired = tp.sub(p.pos).normalize().multiplyScalar(p.vel.length());
          p.vel.lerp(desired, Math.min(1, p.homing * sdt));
        }
      }
      p.vel.y -= p.grav * sdt;
      const step = p.vel.length() * sdt;
      if (step <= 1e-6) {
        p.mesh.position.copy(p.pos);
        let fin = false;
        if (p.fuse !== undefined) { p.fuse -= sdt; if (p.fuse <= 0) { detonate(p); fin = true; } }
        if (!fin && p.life <= 0) { if (p.explode) detonate(p); fin = true; }
        if (fin) remove(i);
        continue;
      }
      tmpD.copy(p.vel).divideScalar(p.vel.length());
      let done = false, bounced = false;
      // world
      const wh = G.world.raycast(p.pos, tmpD, step + p.radius * 0.5);
      let enemyHit = null;
      if (p.owner === 'player') enemyHit = G.enemies.raycast(p.pos, tmpD, wh ? wh.t : step, p.radius, p.hit);
      if (enemyHit) {
        const e = enemyHit.e;
        p.hit.add(e);
        const hp = p.pos.clone().addScaledVector(tmpD, enemyHit.t);
        if (p.sticky) { p.stuck = true; p.stuckTo = e; p.stuckOff = hp.clone().sub(e.centerPos()); p.pos.copy(hp); G.sfx.bounce(hp, 4); continue; }
        if (p.explode) { p.pos.copy(hp); detonate(p); done = true; }
        else {
          const info = Object.assign({ src: 'bullet', head: enemyHit.part === 'head', headMul: p.headMul || 2, dir: tmpD.clone(), pos: hp, part: enemyHit.part, weapon: p.weapon }, p.info || {});
          C.damageEnemy(e, p.dmg, info);
          if (p.onHitEnemy) p.onHitEnemy(e, hp);
          if (p.pierce-- <= 0) done = true;
        }
      } else if (p.owner === 'enemy' && hitPlayer(p, step)) {
        done = true;
      } else if (p.owner === 'enemy' && hitMerc(p, step)) {
        done = true;
      } else if (wh) {
        p.pos.copy(wh.point);
        if (wh.c.dest) C.damageDestructible(wh.c.dest, p.dmg, wh.point);
        if (p.bounce && p.fuse !== undefined) {
          // reflect
          const n = wh.normal; const vn = p.vel.dot(n);
          p.vel.addScaledVector(n, -1.6 * vn).multiplyScalar(0.55);
          bounced = true;
          p.pos.addScaledVector(n, 0.05);
          if (Math.abs(vn) > 2) G.sfx.bounce(p.pos, Math.abs(vn));
          if (p.vel.length() < 1.2 && n.y > 0.5) { p.vel.set(0, 0, 0); p.grav = 0; p.rest = true; }
        } else if (p.sticky) { p.stuck = true; p.pos.addScaledVector(wh.normal, 0.05); G.sfx.bounce(p.pos, 3); continue; }
        else if (p.mine) { p.vel.set(0, 0, 0); p.grav = 0; p.armed = 0.6; p.pos.y += 0.05; C.mines.push({ pos: p.pos.clone(), mesh: p.mesh, dmg: p.dmg, r: p.explode || 4, armed: 0.6, info: p.info }); C.projectiles.splice(i, 1); continue; }
        else {
          if (p.explode) detonate(p);
          else {
            G.fx.sparks(wh.point, wh.normal, 5, 0xffd0a0, 4);
            G.fx.dust(wh.point, wh.normal, 0x8a8070, 3);
            if (p.onHitWorld) p.onHitWorld(wh);
            if (p.kind === 'bolt' || p.kind === 'harpoon' || p.kind === 'spear' || p.kind === 'arrow' || p.kind === 'nail') { p.stuck = true; p.life = Math.min(p.life, 4); p.mesh.position.copy(p.pos); continue; }
          }
          done = true;
        }
      }
      if (!done && !p.stuck) {
        if (!p.rest && !bounced) p.pos.addScaledVector(tmpD, step);
        p.mesh.position.copy(p.pos);
        if (p.vel.lengthSq() > 0.01) p.mesh.lookAt(p.pos.x + p.vel.x, p.pos.y + p.vel.y, p.pos.z + p.vel.z);
        trail(p, sdt);
        // ward / orbs / player-side interceptors
        if (p.owner === 'enemy' && interceptors(p)) done = true;
      }
      if (!done && p.fuse !== undefined && !p.stuck) { p.fuse -= sdt; if (p.fuse <= 0) { detonate(p); done = true; } }
      if (!done && p.life <= 0) { if (p.explode) detonate(p); done = true; }
      if (p.pos.y < G.world.killY - 10) done = true;
      if (done) remove(i);
    }
    function remove(i) { const p = C.projectiles[i]; releaseMesh(p.mesh); C.projectiles.splice(i, 1); if (p.onEnd) p.onEnd(p); }
  }
  function interceptors(p) {
    const pl = G.player;
    if (pl.wardT > 0 && p.pos.distanceTo(pl.chestPos()) < 3.2) { G.fx.bubble(pl.chestPos(), 3.2, 0xd0b0ff); G.fx.sparks(p.pos, null, 8, 0xd0b0ff, 4); return true; }
    if (pl.has('z_orbs')) {
      for (const o of pl.orbPositions || []) if (o.distanceTo(p.pos) < 0.7) { G.fx.sparks(p.pos, null, 10, 0xd0e0ff, 5); G.sfx.hitShield(p.pos); return true; }
    }
    return false;
  }
  function hitMerc(p, step) {
    const mc = G.Rooms2 && G.Rooms2.mercAlly;
    if (!mc || mc.dead || !mc.targetable || !mc.targetable()) return false;
    const c = mc.ent.pos, a = p.pos, b = p.pos.clone().addScaledVector(tmpD, step);
    for (let k = 0; k <= 4; k++) {
      const q = a.clone().lerp(b, k / 4);
      const dy = U.clamp(q.y - c.y, 0, 2);
      if (Math.hypot(q.x - c.x, q.z - c.z, q.y - (c.y + dy)) < 0.55 + p.radius) {
        if (p.explode) { p.pos.copy(q); detonate(p); mc.hurt(p.dmg * 0.6); return true; }
        mc.hurt(p.dmg); G.fx.sparks(q, null, 6, 0xffa080, 4);
        return true;
      }
    }
    return false;
  }
  function hitPlayer(p, step) {
    const pl = G.player;
    // segment vs vertical capsule
    const a = p.pos, b = p.pos.clone().addScaledVector(tmpD, step);
    const ph = pl.height;
    for (let k = 0; k <= 4; k++) {
      const q = a.clone().lerp(b, k / 4);
      const dy = U.clamp(q.y - pl.pos.y, 0, ph);
      const dx = q.x - pl.pos.x, dz = q.z - pl.pos.z;
      const dist = Math.hypot(dx, dz, q.y - (pl.pos.y + dy));
      if (dist < 0.42 + p.radius) {
        if (p.explode) { p.pos.copy(q); detonate(p); return true; }
        C.damagePlayer(p.dmg, { src: 'ranged', pos: p.pos.clone(), attacker: p.attacker, elem: p.elem });
        if (p.onHitPlayer) p.onHitPlayer(q);
        G.fx.sparks(q, null, 6, 0xffa080, 4);
        return true;
      }
    }
    return false;
  }
  function detonate(p) {
    const info = Object.assign({ src: 'explosion' }, p.info || {});
    if (p.owner === 'enemy') { C.explode(p.pos, p.explode, p.dmg, Object.assign(info, { enemy: true, attacker: p.attacker })); if (p.onEnd) p.onEnd(p); p.onEnd = null; return; }
    if (p.onDetonate) { p.onDetonate(p); return; }
    C.explode(p.pos, p.explode, p.dmg, info);
    if (p.cluster) for (let i = 0; i < p.cluster; i++) C.spawnProjectile({ kind: 'grenade', pos: p.pos.clone().add(V(0, 0.4, 0)), vel: V(U.rand(-6, 6), U.rand(5, 9), U.rand(-6, 6)), grav: 18, owner: 'player', dmg: p.dmg * 0.4, explode: p.explode * 0.6, fuse: U.rand(0.5, 1.0), bounce: true, info: Object.assign({}, info, { small: true, isCluster: true }) });
  }

  // ---------------- zones ----------------
  // kind: fire, poison, smoke, heal, acid(enemy), web(enemy), frost, gravity, holy, arrowrain, grasp
  C.zone = function (pos, r, dur, kind, dps, opts) {
    if (opts && opts.enemy && G.game.time < (C.muteHostileUntil || 0)) return Object.assign({ pos: pos.clone(), r, dur, t: dur, kind }, opts);
    const z = Object.assign({ pos: pos.clone(), r, dur, t: 0, kind, dps: dps || 0, tick: 0 }, opts || {});
    if (!z.sk && C.curSk && !z.enemy) z.sk = C.curSk;
    if (kind === 'acid' || kind === 'web') { G.fx.decal(V(pos.x, pos.y + 0.02, pos.z), V(0, 1, 0), 'splat', r * 2, true, kind === 'acid' ? 0x6a9a10 : 0xd8d8d0); }
    if (kind === 'fire' && r > 2) G.fx.decal(V(pos.x, pos.y + 0.02, pos.z), V(0, 1, 0), 'scorch', r * 1.8, true);
    C.zones.push(z);
    return z;
  };
  function updateZones(dt) {
    const pl = G.player;
    for (let i = C.zones.length - 1; i >= 0; i--) {
      const z = C.zones[i];
      z.t += dt; z.tick -= dt;
      if (z.follow) z.pos.set(pl.pos.x, pl.pos.y, pl.pos.z);
      const p = z.pos, r = z.r;
      const rnd = () => { const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r; return [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d]; };
      const k = Math.min(1, (z.dur - z.t) * 2);
      switch (z.kind) {
        case 'fire': for (let n = 0; n < r * r * dt * 6 * k; n++) { const [x, zz] = rnd(); G.fx.flameLick(x, p.y + 0.05, zz, 1.4 + Math.random()); } break;
        case 'poison': case 'acid': if (Math.random() < dt * r * 4) { const [x, zz] = rnd(); G.fx.norm.spawn(x, p.y + 0.3, zz, 0, 0.3, 0, 1.6, 0.6, 2.2, 0.35, 0.5, 0.12, 0.35 * k, -0.05, 0.5); } break;
        case 'smoke': if (Math.random() < dt * r * 6) { const [x, zz] = rnd(); G.fx.norm.spawn(x, p.y + 0.5, zz, 0, 0.2, 0, 2.5, 1.5, 4, 0.5, 0.5, 0.5, 0.6 * k, -0.02, 0.3); } break;
        case 'heal': case 'holy': if (Math.random() < dt * 14) { const [x, zz] = rnd(); G.fx.add.spawn(x, p.y + 0.1, zz, 0, 1.2, 0, 1.0, 0.12, 0.02, 0.4, 1.0, 0.5, 0.8, -0.3, 0.5); } if (z.tick <= 0.01 && z.t % 1 < dt) G.fx.ring(p, r, 0x6ad06a, 0.8); break;
        case 'frost': if (Math.random() < dt * r * 5) { const [x, zz] = rnd(); G.fx.norm.spawn(x, p.y + 0.2, zz, 0, 0.3, 0, 1.4, 0.4, 1.6, 0.8, 0.9, 1.0, 0.3 * k, -0.05, 0.5); } break;
        case 'web': break;
        case 'gravity': for (let n = 0; n < 3; n++) { const a = Math.random() * 6.28; const d = r * (0.6 + Math.random() * 0.4); G.fx.add.spawn(p.x + Math.cos(a) * d, p.y + 0.5 + Math.random() * 2, p.z + Math.sin(a) * d, -Math.cos(a) * d * 2, 0, -Math.sin(a) * d * 2, 0.5, 0.12, 0.02, 0.6, 0.4, 1.0, 0.8, 0, 0); } break;
        case 'arrowrain': if (Math.random() < dt * 30) { const [x, zz] = rnd(); const a = V(x + 1, p.y + 10, zz); const b = V(x, p.y, zz); G.fx.tracer(a, b, 0xcfc0a0, 0.02, 0.12); if (Math.random() < 0.3) G.fx.dust(b, V(0, 1, 0), 0x8a8070, 1); } break;
        case 'grasp': if (Math.random() < dt * 10) { const [x, zz] = rnd(); G.fx.norm.spawn(x, p.y + 0.1, zz, 0, 1.5, 0, 0.8, 0.3, 0.1, 0.08, 0.02, 0.1, 0.8, 0, 1); } break;
        case 'blades': break;
      }
      if (z.tick <= 0) {
        z.tick = z.interval || 0.5;
        const dmg = z.dps * z.tick;
        if (z.enemy) {
          // hazard to the player
          if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < r && Math.abs(pl.pos.y - p.y) < 2) {
            if (z.kind === 'web') { pl.st.slow = Math.max(pl.st.slow || 0, 0.7); }
            else C.damagePlayer(dmg, { src: 'aoe', elem: z.kind === 'acid' ? 'poison' : z.elem, pos: p });
          }
        } else {
          const list = G.enemies.inRadius(p, r);
          for (const e of list) {
            if (Math.abs(e.pos.y - p.y) > 3 && !e.def.flyer) continue;
            if (z.kind === 'fire') { C.damageEnemy(e, dmg, { src: 'skill', sk: z.sk, silent: false, proc: true, noMarker: true }); C.status(e, 'burn', 1); }
            else if (z.kind === 'poison') { C.status(e, 'poison', z.stacks || 1); if (dmg) C.damageEnemy(e, dmg, { src: 'skill', sk: z.sk, proc: true, noMarker: true }); }
            else if (z.kind === 'frost') C.status(e, 'frost', 1);
            else if (z.kind === 'smoke') e.blindT = 1;
            else if (z.kind === 'gravity') { /* pull handled continuously below */ }
            else if (z.kind === 'arrowrain' || z.kind === 'grasp' || z.kind === 'holy') { C.damageEnemy(e, dmg * (z.kind === 'holy' && e.def.undead ? 3 : 1), { src: 'skill', sk: z.sk, proc: true, noMarker: true }); if (z.kind === 'grasp') e.st.root = Math.max(e.st.root || 0, 0.6); }
          }
          if (z.kind === 'heal' && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < r) { C.heal(z.hps * z.tick, true); pl.healZoneT = 0.6; }
          if (z.kind === 'smoke' && Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < r) pl.smokeT = 0.6;
        }
      }
      if (z.kind === 'gravity') {
        for (const e of G.enemies.inRadius(p, r * 1.2)) { if (e.boss) continue; const d = p.clone().sub(e.pos); d.y = 0; const l = d.length(); if (l > 0.5) e.pos.addScaledVector(d.normalize(), Math.min(l, 9 * dt)); e.st.stun = Math.max(e.st.stun || 0, 0.1); }
      }
      if (z.t >= z.dur) { if (z.onEnd) G.abilities.withSk(z.sk || null, z.onEnd)(z); C.zones.splice(i, 1); }
    }
  }

  // ---------------- mines / allies / decoys ----------------
  C.dropMine = function (pos, dmg) {
    const m = projMesh('mine');
    m.position.copy(pos); m.position.y += 0.05;
    C.mines.push({ pos: pos.clone(), mesh: m, dmg, r: 4, armed: 0.8, info: { src: 'explosion' } });
  };
  function updateMines(dt) {
    for (let i = C.mines.length - 1; i >= 0; i--) {
      const m = C.mines[i];
      m.armed -= dt;
      if (m.armed > 0) continue;
      if (Math.random() < dt * 2) G.fx.add.spawn(m.pos.x, m.pos.y + 0.12, m.pos.z, 0, 0, 0, 0.15, 0.12, 0.05, 1.2, 0.3, 0.2, 1, 0, 0);
      const near = G.enemies.inRadius(m.pos, 2.2);
      if (near.length) { C.explode(m.pos.clone().add(V(0, 0.3, 0)), m.r, m.dmg, m.info); releaseMesh(m.mesh); C.mines.splice(i, 1); }
    }
  }
  C.addAlly = function (a) { C.allies.push(a); return a; };
  C.getDecoy = function () { for (const d of C.decoys) if (d.t > 0) return d; return null; };
  C.addDecoy = function (pos, dur, explodeDmg) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8090a0, emissive: 0x203040, roughness: 0.5, transparent: true, opacity: 0.75 });
    const body = new THREE.Mesh(G.Props.PG.cyl8, mat); body.scale.set(0.3, 1.2, 0.3); body.position.y = 0.9; g.add(body);
    const head = new THREE.Mesh(G.Props.PG.sph, mat); head.scale.setScalar(0.2); head.position.y = 1.7; g.add(head);
    g.position.copy(pos); G.scene.add(g);
    const d = { pos: pos.clone(), t: dur, mesh: g, explodeDmg, hp: 9999, sk: C.curSk };
    C.decoys.push(d);
    G.sfx.magic(pos);
    return d;
  };
  function updateAllies(dt) {
    for (let i = C.decoys.length - 1; i >= 0; i--) {
      const d = C.decoys[i];
      d.t -= dt;
      d.mesh.rotation.y += dt * 2;
      if (Math.random() < dt * 6) G.fx.add.spawn(d.pos.x + U.rand(-0.3, 0.3), d.pos.y + U.rand(0.3, 1.8), d.pos.z + U.rand(-0.3, 0.3), 0, 0.5, 0, 0.6, 0.1, 0.02, 0.5, 0.7, 1.0, 0.6, 0, 0);
      if (d.t <= 0) {
        if (d.explodeDmg) C.explode(d.pos.clone().add(V(0, 1, 0)), d.explodeR || 5, d.explodeDmg, { src: 'skill', sk: d.sk });
        G.scene.remove(d.mesh); C.decoys.splice(i, 1);
      }
    }
    for (let i = C.allies.length - 1; i >= 0; i--) {
      const a = C.allies[i];
      a.t -= dt;
      a.update(dt);
      if (a.t <= 0 || a.dead) { a.remove(); C.allies.splice(i, 1); }
    }
  }
  // automatic ballista turret
  C.spawnTurret = function (pos, dur, dmg) {
    const g = new THREE.Group();
    const mats = G.world.mats, PG = G.Props.PG;
    for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(PG.box, mats.woodDark); leg.scale.set(0.07, 1.1, 0.07); const a = k / 3 * Math.PI * 2; leg.position.set(Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(leg); }
    const head = new THREE.Group(); head.position.y = 1.05; g.add(head);
    const stock = new THREE.Mesh(PG.box, mats.wood); stock.scale.set(0.12, 0.12, 0.9); head.add(stock);
    const bow = new THREE.Mesh(PG.box, mats.iron); bow.scale.set(1.0, 0.06, 0.06); bow.position.z = -0.35; head.add(bow);
    g.position.copy(pos); g.traverse((o) => { o.castShadow = true; }); G.scene.add(g);
    G.sfx.mech('boltFwd'); G.fx.dust(pos, V(0, 1, 0), 0x8a8070, 6);
    let cd = 0; const sk = C.curSk;
    return C.addAlly({
      t: dur, mesh: g,
      info() { return { icon: '🏹', name: '自動弩', t: this.t, tMax: dur }; },
      update(dt) {
        cd -= dt;
        const e = G.enemies.nearest(pos, 32);
        if (!e) return;
        const tp = e.centerPos();
        const from = pos.clone(); from.y += 1.1;
        head.lookAt(tp);
        if (cd <= 0 && G.world.los(from, tp)) {
          cd = 0.55 / (this.rate || 1);
          const dir = tp.clone().sub(from).normalize();
          C.spawnProjectile({ kind: 'arrow', pos: from.clone().addScaledVector(dir, 0.6), vel: dir.multiplyScalar(70), grav: 2, owner: 'player', dmg, radius: 0.12, info: { src: 'ally', sk, noMarker: true } });
          G.sfx.launcher('crossbow');
        }
      },
      remove() { G.scene.remove(g); G.fx.dust(pos, V(0, 1, 0), 0x8a8070, 6); },
    });
  };

  // ---------------- player passive auras (orbit blades / guard orbs) ----------------
  let bladeMeshes = [], orbMeshes = [];
  function updateAuras(dt) {
    const pl = G.player;
    const nb = pl.buffs.get('z_blades') || 0;
    const skillBlades = pl.bladesT > 0 ? pl.bladesN || 6 : 0;
    const total = nb * 2 + skillBlades;
    while (bladeMeshes.length < total) {
      const m = new THREE.Mesh(G.Props.PG.box, new THREE.MeshStandardMaterial({ color: 0xd8e0ff, metalness: 1, roughness: 0.2, emissive: 0x404a70 }));
      m.scale.set(0.06, 0.04, 0.7); G.scene.add(m); bladeMeshes.push(m);
    }
    for (let i = 0; i < bladeMeshes.length; i++) bladeMeshes[i].visible = i < total;
    const t = G.game.time;
    for (let i = 0; i < total; i++) {
      const a = t * 3.2 + i / total * Math.PI * 2;
      const r = i < nb * 2 ? 2.0 : pl.bladesR || 3.0;
      const m = bladeMeshes[i];
      m.position.set(pl.pos.x + Math.cos(a) * r, pl.pos.y + 1.0, pl.pos.z + Math.sin(a) * r);
      m.rotation.set(0, -a, 0);
      for (const e of G.enemies.inRadius(m.position, 0.9 + 0.3)) {
        if ((e._bladeT || 0) > t) continue;
        e._bladeT = t + 0.35;
        C.damageEnemy(e, i < nb * 2 ? C.scale(14) : C.scale(pl.bladesDps * 0.35), { src: 'skill', sk: i < nb * 2 ? null : pl.bladesSk, ult: i >= nb * 2 && pl.bladesUlt, proc: true, noMarker: true, elem: 'bleed', elemChance: 0.3 });
        G.fx.sparks(m.position, null, 4, 0xe0e8ff, 4);
      }
    }
    // guard orbs
    const no = pl.has('z_orbs') ? 3 : 0;
    while (orbMeshes.length < no) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xc0d8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(0.45); G.scene.add(sp); orbMeshes.push(sp);
    }
    pl.orbPositions = [];
    for (let i = 0; i < orbMeshes.length; i++) {
      orbMeshes[i].visible = i < no;
      if (i >= no) continue;
      const a = -t * 2 + i / no * Math.PI * 2;
      orbMeshes[i].position.set(pl.pos.x + Math.cos(a) * 1.3, pl.pos.y + 1.2 + Math.sin(t * 3 + i) * 0.2, pl.pos.z + Math.sin(a) * 1.3);
      pl.orbPositions.push(orbMeshes[i].position);
    }
  }

  C.soulBolt = function (pos, dmg, target) {
    const t = target || G.enemies.nearest(pos, 30);
    if (!t) return;
    const dir = t.centerPos().sub(pos).normalize();
    dir.y += 0.4; dir.normalize();
    C.spawnProjectile({ kind: 'soul', pos: pos.clone(), vel: dir.multiplyScalar(22), owner: 'player', dmg, homing: 9, target: t, radius: 0.3, life: 3, info: { src: 'buff', proc: true, noMarker: true } });
  };

  C.update = function (dt) {
    updateProjectiles(dt);
    updateZones(dt);
    updatePickups(dt);
    updateMines(dt);
    updateAllies(dt);
    updateAuras(dt);
  };
  C.clear = function () {
    for (const p of C.projectiles) releaseMesh(p.mesh);
    C.projectiles.length = 0;
    C.zones.length = 0;
    for (const p of C.pickups) G.scene.remove(p.m);
    C.pickups.length = 0;
    for (const m of C.mines) releaseMesh(m.mesh);
    C.mines.length = 0;
    for (const a of C.allies) a.remove();
    C.allies.length = 0;
    for (const d of C.decoys) G.scene.remove(d.mesh);
    C.decoys.length = 0;
    for (const w of C.walls) w.remove();
    C.walls.length = 0;
  };
  C.collectAllPickups = function () { for (const p of C.pickups) { p.homing = true; p.t = Math.max(p.t, 2); } };
})();
