'use strict';
// v2.0 "Depth" systems: enemy mutations, area anomalies and abyssal pacts.
// Difficulty past the early game comes from new behaviour rather than bigger numbers.
(function () {
  const D = (G.Depth = {});
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  let P, C, GM;
  D.init = function () { P = G.player; C = G.combat; GM = G.game; };

  D.TIERS = [{ name: '上層', from: 1 }, { name: '深層', from: 26 }, { name: '奈落', from: 51 }];
  D.tier = (n) => (n >= 51 ? 2 : n >= 26 ? 1 : 0);
  D.tierName = (n) => D.TIERS[D.tier(n)].name;

  // ---------------------------------------------------------------- mutations
  // Each mutation changes how a foe behaves. Shown as icons on the HP bar and as a coloured aura.
  D.MUTS = [
    { id: 'blink', name: '瞬身', icon: '🌀', col: 0x60a0ff, desc: '被弾すると一定確率でプレイヤーの近くへ瞬間移動する。' },
    { id: 'warden', name: '守護', icon: '🛡️', col: 0x80d0ff, desc: '周囲の仲間にシールドを張り続ける。最優先で倒せ。' },
    { id: 'volatile', name: '爆裂', icon: '💥', col: 0xff7020, desc: '倒されると少し遅れて爆発する。離れて倒せ。' },
    { id: 'undying', name: '不屈', icon: '♻️', col: 0xe0e0a0, desc: '一度だけHP40%で蘇る。' },
    { id: 'haste', name: '疾風', icon: '💨', col: 0x80ffb0, desc: '自分と周囲の仲間の移動速度を上げる。' },
    { id: 'leech', name: '吸魂', icon: '🩸', col: 0xc01030, desc: '攻撃を当てると大きく回復する。' },
    { id: 'gravity', name: '重力', icon: '🧲', col: 0x9060ff, desc: '定期的にプレイヤーを引き寄せる。' },
    { id: 'mirror', name: '鏡面', icon: '🪞', col: 0xd0e8ff, desc: '数秒ごとに青く光る。光っている間（約2秒）に銃で撃つと、一部が自分に跳ね返る。' },
    { id: 'splitter', name: '分裂', icon: '🧬', col: 0xa0e040, desc: '倒されると小さな分身を2体生む。' },
    { id: 'frenzy', name: '狂乱', icon: '😈', col: 0xff3030, desc: 'HPが40%を切ると速く、攻撃間隔も短くなる。' },
    { id: 'nullify', name: '無効化', icon: '🚫', col: 0xb0b0b0, desc: '状態異常とスタンを一切受けない。' },
  ];
  D.MUT_BY_ID = Object.fromEntries(D.MUTS.map((m) => [m.id, m]));

  D.mutChance = function (n) {
    if (n < 12) return 0;
    let p = Math.min(0.8, (n - 11) * 0.035);
    if (P.has('pact_mutate')) p = Math.min(0.95, p + 0.25);
    if (GM.stage === 'cursed') p = Math.min(0.95, p + 0.2);
    return p;
  };
  D.mutCount = (n) => 1 + (n >= 30 ? 1 : 0) + (n >= 55 ? 1 : 0) + (P.has('pact_merciless') ? 1 : 0);

  D.onSpawn = function (e, opts) {
    const n = G.Run.depthArea(GM.area);
    if (opts && opts.noMut) return;
    if (!(Math.random() < D.mutChance(n) || (P.has('pact_merciless') && n >= 12))) return;
    const pool = U.shuffle(D.MUTS.slice());
    const k = Math.min(pool.length, D.mutCount(n));
    e.mut = {};
    for (let i = 0; i < k; i++) { e.mut[pool[i].id] = true; G.save.mark('items', 'mut_' + pool[i].id); }
    e.mutT = U.rand(2, 5);
    e.mutIcons = Object.keys(e.mut).map((id) => D.MUT_BY_ID[id].icon).join('');
    e.mutCol = D.MUT_BY_ID[Object.keys(e.mut)[0]].col;
  };
  D.tickEnemy = function (e, dt) {
    const m = e.mut;
    e.mutT -= dt;
    if (m.warden) {
      if (Math.random() < dt * 3) for (const o of G.enemies.inRadius(e.pos, 8)) {
        if (o === e || o.boss || !o.alive) continue;
        if (!o.maxShield) { o.maxShield = Math.round(o.maxHp * 0.3); }
        o.shield = Math.min(o.maxShield, (o.shield || 0) + o.maxHp * 0.06);
        if (Math.random() < 0.3) G.fx.tracer(e.centerPos(), o.centerPos(), 0x80d0ff, 0.02, 0.15);
      }
    }
    // mirror: a readable stance instead of a constant tax. A pale ring flashes (0.8 s warning), then for 2 s the foe glints blue and bullets that hit it
    // send a little of their damage back at you (see onHurt). Outside the stance nothing is reflected; melee, skills and explosions never are.
    if (m.mirror) {
      if (e.mirT === undefined) e.mirT = U.rand(3, 6);
      e.mirT -= dt;
      if (e.mirOn > 0) {
        e.mirOn -= dt;
        e.mirFx = (e.mirFx || 0) - dt;
        if (e.mirFx <= 0) { e.mirFx = 0.3; G.fx.flash(e.centerPos(), 0xd0e8ff, 30, 0.16, 7); G.fx.ring(e.pos.clone().setY(e.pos.y + 0.1), 1.3, 0xd0e8ff, 0.35); }
      } else if (e.mirWarn > 0) {
        e.mirWarn -= dt;
        if (e.mirWarn <= 0) { e.mirOn = 2.0; e.mirFx = 0; G.sfx.shieldUp && G.sfx.shieldUp(); }
      } else if (e.mirT <= 0 && e.hasLOS !== false && !P.dead && P.pos.distanceTo(e.pos) < 40) {
        e.mirT = U.rand(7, 10); e.mirWarn = 0.8;
        G.fx.ring(e.pos.clone().setY(e.pos.y + 0.1), 2.4, 0xd0e8ff, 0.8); G.fx.flash(e.centerPos(), 0xd0e8ff, 45, 0.5, 9); G.sfx.magic(e.pos, 'holy');
        if (!P.mirTip) { P.mirTip = true; G.ui.toastSmall && G.ui.toastSmall('🪞 鏡面 — 青く光っている間に撃つと、ダメージが跳ね返る'); }
      }
    }
    if (m.haste) for (const o of G.enemies.inRadius(e.pos, 8)) if (!o.boss) o.hasteT = 0.5;
    // gravity: a short, readable pull. A violet line runs from the foe to you for a second (and a mark at the screen edge shows which way), then you are
    // drawn up to 4.5 m towards it. Nobody can pull you again for the next 14 s, whichever foe it is. (Bosses with hooks are separate and unchanged.)
    if (m.gravity) {
      const gw = e.gravWarn;
      if (gw) {
        gw.t += dt;
        const k = Math.min(1, gw.t / 1.0), src = e.centerPos(), tgt = P.chestPos();
        if (!e.alive || P.dead) { endGrav(e, gw); }
        else {
          G.fx.beam(src, tgt, 0xa070ff, 0.025 + 0.09 * k, 0.09);
          // the floor line: where you would be drawn to, from where you stand now
          const dir = e.pos.clone().sub(P.pos); dir.y = 0; const l = dir.length() || 1; dir.divideScalar(l); const dist = Math.max(0, Math.min(4.5, l - 2.8));
          if (gw.line) { const ax = P.pos.x, az = P.pos.z, bx = ax + dir.x * dist, bz = az + dir.z * dist, o = gw.line; o.m.position.set((ax + bx) / 2, P.pos.y + 0.07, (az + bz) / 2); o.m.rotation.set(0, Math.atan2(dir.x, dir.z), 0); o.m.scale.set(1.2, 1, Math.max(0.1, dist)); }
          gw.hit.t = 0.4;
          if (!gw.b2 && gw.t > 0.5) { gw.b2 = true; G.sfx.magic(e.pos, 'dark'); }
          if (gw.t >= 1.0) {
            if (dist > 0.6) { P.pullDir = dir; P.pullSpd = dist / 0.4; P.pullT = 0.4; P.dragT = 0.4; P.vel.y = Math.max(P.vel.y, 2); G.fx.lightning(src, tgt, 0xa070ff); G.sfx.whoosh(0.4, 0.8); P.addShake(0.15); }
            endGrav(e, gw);
          }
        }
      } else if (e.mutT <= 0 && e.hasLOS !== false && GM.time > (P.gravFreeAt || 0) && !P.dead) {
        e.mutT = U.rand(7, 10);
        const d = P.pos.distanceTo(e.pos);
        if (d < 20 && d > 4.5) {
          P.gravFreeAt = GM.time + 15; // one pull at a time, and a long rest afterwards
          const line = G.fx.teleLine(P.pos.clone(), P.pos.clone(), 1.2, 1.0, 0xa070ff);
          const el = document.createElement('div'); el.className = 'di grav'; G.ui.el.dirind.appendChild(el);
          const hit = { el, pos: e.pos, t: 0.4 }; G.ui.dirHits.push(hit);
          e.gravWarn = { t: 0, line, hit };
          G.sfx.magic(e.pos, 'dark'); G.ui.toastSmall && G.ui.toastSmall('⚠ 引き寄せ — 紫の線の先へ引かれる');
        }
      }
    }
    if (m.frenzy && e.hp < e.maxHp * 0.4) { if (!e.frenzied) { e.frenzied = true; G.sfx.monster(e.pos, e.def.sound, (e.def.pitch || 1) * 1.2, 1); } if (e.atkCd > 0) e.atkCd -= dt * 0.6; }
  };
  function endGrav(e, gw) { if (gw.line) G.fx.endTeleLine(gw.line); gw.hit.t = 0.15; e.gravWarn = null; }
  D.onHurt = function (e, info, dealt) {
    const m = e.mut;
    if (m.mirror && e.mirOn > 0 && info.src === 'bullet' && dealt > 0 && !info.proc) {
      e.mirrorAcc = (e.mirrorAcc || 0) + dealt * 0.1;
      const now = GM.time;
      if (now - (e.mirrorT || -9) > 0.5 && e.mirrorAcc > 1) { e.mirrorT = now; const d = Math.min(e.mirrorAcc, P.stats.maxHp * 0.04); e.mirrorAcc = 0; C.damagePlayer(d, { src: 'ranged', attacker: e, pos: e.centerPos() }); G.fx.tracer(e.centerPos(), P.chestPos(), 0xd0e8ff, 0.02, 0.12); }
    }
    if (m.blink && e.alive && GM.time - (e.blinkT || -9) > 4 && Math.random() < 0.3) {
      e.blinkT = GM.time;
      const w = G.world;
      const c = w.randomOpenCell(new G.RNG((Math.random() * 1e9) >>> 0), (x, z, idx) => (!w.reachMask || w.reachMask[idx]) && Math.abs(w.nf[idx] - e.pos.y) < 2.5 && Math.hypot(x - P.pos.x, z - P.pos.z) > 5 && Math.hypot(x - P.pos.x, z - P.pos.z) < 10);
      if (c) { G.fx.smoke(e.centerPos(), 8, 1, 0x3050a0, 0.5, 0.6); e.pos.set(c.x, c.y + (e.flyer ? 2.5 : 0), c.z); e.vel.set(0, 0, 0); G.fx.smoke(e.centerPos(), 8, 1, 0x3050a0, 0.5, 0.6); G.sfx.whoosh(0.3, 1.4); }
    }
  };
  // returns false to cancel the death (undying)
  D.onDie = function (e, info) {
    const m = e.mut;
    if (m.undying && !e.mutRevived) {
      e.mutRevived = true; e.hp = e.maxHp * 0.4;
      G.fx.ring(e.pos.clone(), 2.5, 0xe0e0a0, 0.6); G.fx.flash(e.centerPos(), 0xfff0c0, 30, 0.3, 8); G.sfx.magic(e.pos, 'holy');
      G.ui.feed(`♻️ ${e.def.name} が不屈の力で蘇った`);
      return false;
    }
    return true;
  };
  D.onDeath = function (e) {
    const m = e.mut;
    if (m.volatile) {
      const p = e.centerPos(), dmg = P.stats.maxHp * 0.3;
      G.fx.telegraph(e.pos.clone(), 4, 1.0, 0xff6020);
      setTimeout(() => C.explode(p, 4, dmg, { enemy: true, src: 'explosion' }), 1000);
    }
    if (m.splitter) {
      for (let i = 0; i < 2; i++) {
        const s = G.enemies.spawn(e.def, Math.max(1, e.level - 2), e.pos.clone().add(V(U.rand(-0.8, 0.8), 0.2, U.rand(-0.8, 0.8))), { scale: 0.6, hpMul: 0.3, noSplit: true });
        s.state = 'chase'; s.stateT = 0; s.noReward = true; GM.onChildSpawn(e, s);
      }
    }
  };
  D.onPlayerHit = function (e, dmg) { if (e.mut && e.mut.leech) { e.hp = Math.min(e.maxHp, e.hp + dmg * 3 + e.maxHp * 0.05); G.fx.tracer(P.chestPos(), e.centerPos(), 0xc01030, 0.03, 0.2); } };
  D.speedMul = (e) => (e.hasteT > 0 ? 1.3 : 1) * (e.mut && e.mut.frenzy && e.hp < e.maxHp * 0.4 ? 1.4 : 1);

  // ---------------------------------------------------------------- anomalies
  D.ANOMS = [
    { id: 'darkness', name: '暗黒', icon: '🌑', desc: '光が奪われる。手元の灯りだけが頼り。' },
    { id: 'meteor', name: '隕石雨', icon: '☄️', desc: '頭上から火球が降り注ぐ。赤い円から離れろ。' },
    { id: 'stalker', name: '追跡者', icon: '👁️‍🗨️', desc: 'しばらくすると倒せない追跡者が現れ、ゆっくり追ってくる。早くエリアを片付けろ。' },
    { id: 'miasma', name: '瘴気', icon: '☁️', desc: '毒の霧が漂い、プレイヤーに寄ってくる。中にいるとHPが削れる。' },
  ];
  D.ANOM_BY_ID = Object.fromEntries(D.ANOMS.map((a) => [a.id, a]));
  const COMBAT_KINDS = ['combat', 'elite', 'cursed', 'vault', 'trial'];
  D.startArea = function (n, kind) {
    D.endArea();
    G.weapons.devour = 0;
    const A = (D.cur = { list: [], t: 0 });
    if (!COMBAT_KINDS.includes(kind) || kind === 'trial') return;
    n = G.Run.depthArea(n);
    let chance = n < 14 ? 0 : Math.min(0.75, 0.3 + (n - 14) * 0.025);
    if (P.has('pact_anomaly')) chance = 1;
    // drawn from the run seed and the area, so entering the same area again (a soul lantern restarts it) gives the same anomaly
    const rng = new G.RNG((GM.seed ^ U.hashStr('anom' + GM.area + kind)) >>> 0);
    if (rng.next() < chance) A.list.push(D.ANOMS[Math.floor(rng.next() * D.ANOMS.length)].id);
    if (P.has('pact_night') && !A.list.includes('darkness')) A.list.push('darkness');
    if (P.has('pact_hunted') && !A.list.includes('stalker')) A.list.push('stalker');
    if (!A.list.length) return;
    for (const id of A.list) { G.save.mark('items', 'anom_' + id); D['start_' + id] && D['start_' + id](A); }
    const names = A.list.map((id) => D.ANOM_BY_ID[id].icon + ' ' + D.ANOM_BY_ID[id].name).join('　');
    const ids = A.list.slice();
    setTimeout(() => { if (D.cur === A) G.HudX.anomalyAlert(ids); else G.ui.toast(`⚠ 異変: ${names}`, 'warn'); }, 450);
  };
  // the area is cleared: the darkness lifts (other anomalies end with the area as before)
  D.liftDarkness = function () {
    const A = D.cur; if (!A || !A.dark) return;
    const L = GM.lights;
    if (A.dark.world === G.world) {
      L.hemi.intensity = A.dark.h; L.amb.intensity = A.dark.a; L.moon.intensity = A.dark.m;
      G.scene.fog.density = A.dark.fd; G.scene.fog.color.copy(A.dark.fc);
      if (A.dark.bg && G.scene.background && G.scene.background.isColor) G.scene.background.copy(A.dark.bg);
      G.fx.setFog(G.scene.fog.color, G.scene.fog.density);
    }
    G.camera.remove(A.dark.spot); G.camera.remove(A.dark.spot.target); A.dark.spot.dispose && A.dark.spot.dispose();
    GM.setDarkness(false);
    A.dark = null; A.list = A.list.filter((id) => id !== 'darkness');
    G.ui.toastSmall('🌅 暗黒が晴れた');
  };
  D.anomText = () => (D.cur && D.cur.list.length ? D.cur.list.map((id) => D.ANOM_BY_ID[id].icon + D.ANOM_BY_ID[id].name).join(' ') : '');
  D.endArea = function () {
    const A = D.cur; if (!A) return;
    if (A.dark) { const L = GM.lights; if (A.dark.world !== G.world) { G.camera.remove(A.dark.spot); G.camera.remove(A.dark.spot.target); GM.setDarkness(false); } else { L.hemi.intensity = A.dark.h; L.amb.intensity = A.dark.a; L.moon.intensity = A.dark.m; G.scene.fog.density = A.dark.fd; G.scene.fog.color.copy(A.dark.fc); if (A.dark.bg && G.scene.background && G.scene.background.isColor) G.scene.background.copy(A.dark.bg); G.fx.setFog(G.scene.fog.color, G.scene.fog.density); G.camera.remove(A.dark.spot); G.camera.remove(A.dark.spot.target); A.dark.spot.dispose && A.dark.spot.dispose(); GM.setDarkness(false); } }
    if (A.fogs) for (const f of A.fogs) G.scene.remove(f.g);
    if (A.stalker && A.stalker.alive) { A.stalker.noReward = true; A.stalker.hp = 0; A.stalker.invuln = false; C.killEnemy(A.stalker, { src: 'clear', proc: true }, 0); }
    D.cur = null;
  };
  D.start_darkness = function (A) {
    const L = GM.lights;
    A.dark = { h: L.hemi.intensity, a: L.amb.intensity, m: L.moon.intensity, fd: G.scene.fog.density, fc: G.scene.fog.color.clone(), bg: G.scene.background && G.scene.background.isColor ? G.scene.background.clone() : null, world: G.world };
    // pitch black: only your lamp, a few dimmed torches and glowing things remain
    L.hemi.intensity *= 0.03; L.amb.intensity *= 0.02; L.moon.intensity *= 0.02;
    G.scene.fog.color.setRGB(0.004, 0.004, 0.006); G.scene.fog.density *= 1.7; G.fx.setFog(G.scene.fog.color, G.scene.fog.density);
    if (G.scene.background && G.scene.background.isColor) G.scene.background.setRGB(0.002, 0.002, 0.004);
    GM.setDarkness(true);
    const spot = new THREE.SpotLight(0xfff0d8, 90, 34, 0.42, 0.5, 1.6);
    spot.position.set(0.25, -0.2, 0); G.camera.add(spot); spot.target.position.set(0, -0.6, -6); G.camera.add(spot.target);
    A.dark.spot = spot;
  };
  D.start_meteor = function (A) { A.meteorT = 4; };
  D.start_stalker = function (A) { A.stalkT = P.has('pact_hunted') && !A.list.includes('stalker') ? 50 : 40; };
  D.start_miasma = function (A) {
    A.fogs = [];
    const w = G.world;
    for (let i = 0; i < 4; i++) {
      const c = w.randomOpenCell(new G.RNG((Math.random() * 1e9) >>> 0), (x, z) => Math.hypot(x - P.pos.x, z - P.pos.z) > 18);
      if (!c) continue;
      const g = new THREE.Group(); g.position.set(c.x, c.y + 1.2, c.z);
      for (let k = 0; k < 5; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0x6a2a8a, transparent: true, opacity: 0.35, depthWrite: false })); s.position.set(U.rand(-1.5, 1.5), U.rand(-0.5, 1), U.rand(-1.5, 1.5)); s.scale.setScalar(U.rand(4, 6.5)); g.add(s); }
      G.scene.add(g);
      A.fogs.push({ g, r: 3.4, sp: U.rand(1.1, 1.6) });
    }
  };
  D.update = function (dt) {
    const A = D.cur; if (!A || !A.list.length || GM.state !== 'playing') return;
    A.t += dt;
    const cleared = GM.areaCleared;
    if (A.meteorT !== undefined && !cleared) {
      A.meteorT -= dt;
      if (A.meteorT <= 0) {
        A.meteorT = U.rand(2.2, 4);
        const tgt = P.pos.clone().add(V(U.rand(-5, 5), 0, U.rand(-5, 5)));
        const gy = G.world.groundAt(V(tgt.x, P.pos.y + 3, tgt.z), 0.3, 12); tgt.y = gy > -Infinity ? gy : P.pos.y;
        G.fx.telegraph(tgt.clone(), 3.4, 1.4, 0xff5010);
        setTimeout(() => {
          if (!D.cur || D.cur !== A) return;
          G.fx.tracer(tgt.clone().add(V(6, 30, -4)), tgt.clone().add(V(0, 0.5, 0)), 0xff8030, 0.25, 0.25);
          C.explode(tgt.clone().add(V(0, 0.4, 0)), 3.4, P.stats.maxHp * 0.24, { enemy: true, src: 'explosion', color: 0xff6020 });
        }, 1400);
      }
    }
    if (A.stalkT !== undefined && !cleared && !A.stalker) {
      A.stalkT -= dt;
      if (A.stalkT <= 0) {
        const e = GM.spawnEnemy({ def: G.ENEMY_BY_ID.wraith_normal || G.ENEMIES.find((x) => x.plan === 'wraith'), noMut: true });
        if (e) {
          A.stalker = e; e.stalker = true; e.invuln = true; e.ignoreCount = true; e.noReward = true; e.champion = true;
          e.speed = 3.0; e.dmg = P.stats.maxHp * 0.35; e.def = Object.assign({}, e.def, { name: '深淵の追跡者', flyer: true });
          e.model.group.scale.setScalar(1.6); e.makeCurseRing(0x400010);
          G.ui.toast('👁️‍🗨️ 追跡者が現れた — 倒せない。急いでエリアを片付けろ！', 'warn'); G.sfx.monster(e.pos, 'roar', 0.35, 1.3);
        } else A.stalkT = 5;
      }
    }
    if (A.fogs && !cleared) {
      for (const f of A.fogs) {
        const to = P.pos.clone().setY(P.pos.y + 1.2).sub(f.g.position); const l = to.length();
        if (l > 0.5) f.g.position.addScaledVector(to.divideScalar(l), f.sp * dt);
        f.g.children.forEach((s, i) => { s.material.rotation += dt * (i % 2 ? 0.3 : -0.3); });
        if (l < f.r) { A.dotAcc = (A.dotAcc || 0) + dt; if (A.dotAcc > 0.5) { A.dotAcc = 0; C.damagePlayer(P.stats.maxHp * 0.03, { src: 'dot', elem: 'poison' }); } }
      }
    }
    if (cleared && A.fogs) for (const f of A.fogs) f.g.children.forEach((s) => { s.material.opacity = Math.max(0, s.material.opacity - dt * 0.4); });
    if (cleared && A.stalker && A.stalker.alive) { A.stalker.invuln = false; A.stalker.hp = 0; C.killEnemy(A.stalker, { src: 'clear', proc: true }, 0); }
  };

  // ---------------------------------------------------------------- pacts
  D.offerPact = function (after) {
    GM.offerBuffs(false, {
      filter: (b) => b.cat === 'pact', title: 'ABYSSAL PACT', sub: '深淵は代償を求める — 誓いを一つ結べ（必須・報酬付き）', noReroll: true,
      onPicked: (b) => { if (b.id === 'pact_merciless') { P.revives++; G.ui.toast('🪔 魂の灯火が一つ灯った', 'good'); } },
      after,
    });
  };

  // codex entries (mutations & anomalies are "discovered" when first met)
  D.CODEX = [
    { id: 'mut_pileres', name: '衝撃耐性 Ⅰ〜Ⅲ', icon: '🪨', rarity: 'epic', desc: 'パイルドライバーの衝撃を受け流す。Ⅰ: -30% / Ⅱ: -55% / Ⅲ: -75%。\n（深層で現れ、深くなるほど高レベルが出る。地面から2m以上浮いている飛行型も衝撃波が半減する）', cat: '耐性' },
    ...D.MUTS.map((m) => ({ id: 'mut_' + m.id, name: '変異: ' + m.name, icon: m.icon, rarity: 'epic', desc: m.desc + '\n（深層で、深く潜るほど多くの敵に付く。さらに深いと2つ重なることも）', cat: '変異' })),
    ...D.ANOMS.map((a) => ({ id: 'anom_' + a.id, name: '異変: ' + a.name, icon: a.icon, rarity: 'legendary', desc: a.desc + '\n（深層の戦闘エリアで発生することがある）', cat: '異変' })),
  ];
})();
