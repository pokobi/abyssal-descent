'use strict';
// Duels (parry phases) for three guardians: 影縫いの剣客・朧, 虚ろなる騎士王, 狂乱の獄囚.
// At 70% and 35% of its health the guardian calls a duel: everything else is cleared away, a golden ring closes around the two of you, your melee weapon
// is forced into your hand and guns / skills / items / attacks are sealed. A white gauge appears under its health bar; while any of it is left its health
// cannot fall. It attacks only in melee, with a golden flash just before each blow lands: pressing guard (reload) in that moment parries (no damage, the
// gauge loses a sixth). Pressing outside it, or holding the key from before, fails and the blow lands. Empty the gauge -> BREAK: 12% of its health and a
// 5 s stagger (x1.5 damage taken). If time runs out the gauge stays as a shield that ordinary damage wears down at half rate before its health can fall.
(function () {
  const D = (G.Duel = {});
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const BS = G.bosses;
  D.AT = [0.7, 0.35]; // health shares that call a duel
  D.GAUGE = 0.12; // the white gauge, as a share of max health
  D.PARRY = 1 / 6; // one parry takes this much of it
  D.BREAK = 0.12; D.STUN = 5; D.STUN_MUL = 1.5;
  D.OUT_EFF = 0.1; // damage from anyone else while the duel lasts (co-op), into the gauge
  D.AFTER_EFF = 0.5; // a gauge left after the duel: ordinary damage wears it down at this rate
  D.INTRO = 1.5; D.READ = 4; D.LIMIT = 35;
  D.WIN = 0.3; D.WIN_M = 0.38; D.LATE = 0.05; D.LOCK = 0.6;
  D.RING = 8; // the smallest ring; it is normally half the stage across (see ringR)
  D.ringR = (w) => Math.max(D.RING, Math.min(w.W, w.arenaD || w.D) * 0.25);
  D.authority = true; // who judges the gauge and the clock: the solo game, or the co-op host (the guests' copies only show it)
  D.cur = null;
  const isM = () => !!(window.G_MOBILE || document.documentElement.classList.contains('m'));
  D.win = () => (isM() ? D.WIN_M : D.WIN);
  // ---- who is who (co-op replaces these: js/coop) ----
  D.myId = () => 0;
  D.players = () => [{ id: 0, pos: G.player.pos, alive: !G.player.dead }];
  D.posOf = (id) => { const p = D.players().find((q) => q.id === id); return p ? p.pos : G.player.pos; };
  D.limit = () => D.LIMIT;
  D.pickFirst = (b) => { let best = null, bd = 1e9; for (const p of D.players()) if (p.alive) { const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z); if (d < bd) { bd = d; best = p.id; } } return best ?? D.myId(); };
  D.mine = () => !!(D.cur && D.cur.who === D.myId());
  D.timeK = () => { const n = performance.now(); return n < D._stopUntil ? 0.05 : n < D._slowUntil ? 0.3 : 1; };
  D._stopUntil = 0; D._slowUntil = 0;

  // ---------------------------------------------------------------- the three styles
  // a combo is a list of blows; each blow: at = when it lands (s after the combo starts), from = when its wind-up begins
  const rr = (a, b) => U.rand(a, b);
  const STYLE = {
    oboro: { sys: 'agile', dmg: 26, speed: 8, reach: 2.3, rest: [0.9, 1.4], combo: () => { const n = U.randi(2, 4); const g = []; for (let i = 1; i < n; i++) g.push(rr(0.45, 0.6)); return { first: 0.8, gaps: g }; } },
    hollowknight: { sys: 'beast', dmg: 36, speed: 5.5, reach: 2.9, rest: [1.1, 1.6], combo: () => { const n = U.randi(1, 3); const g = []; for (let i = 1; i < n; i++) g.push(rr(0.85, 1.05)); const delay = Math.random() < 0.4 ? U.randi(0, n - 1) : -1; return { first: 1.15, gaps: g, delay }; } },
    madman: { sys: 'beast', dmg: 20, speed: 7, reach: 2.3, rest: [0.9, 1.4], combo: () => { const n = U.randi(3, 5); const g = []; for (let i = 1; i < n; i++) g.push(rr(0.34, 0.7)); return { first: 0.7, gaps: g }; } },
  };
  D.STYLE = STYLE;
  // how close it stands to strike, by the size of its body (a big knight keeps a step further off so it stays in view)
  const near = (b) => ((b.S && b.S.radius) || 0.6) * 1.5 + 1.6;
  const reachOf = (b) => near(b) + 0.8;
  D.has = (id) => !!STYLE[id];
  function makeCombo(st) {
    const c = st.combo(), minGap = D.win() + D.LATE + 0.08, out = [];
    let at = c.first;
    for (let i = 0; i <= c.gaps.length; i++) {
      if (i > 0) at += Math.max(minGap, c.gaps[i - 1]);
      const hold = c.delay === i ? 0.4 : 0; // the knight's late blow: the raised sword hangs a moment longer
      at += hold;
      out.push({ at, from: i === 0 ? 0 : out[i - 1].at + 0.12, hold, flashed: false, done: false, parried: false, fail: false });
    }
    return out;
  }

  // ---------------------------------------------------------------- set-up on the guardians that duel
  const start0 = BS.start;
  BS.start = function (id, level, world) {
    const b = start0(id, level, world);
    if (STYLE[id]) arm(b);
    return b;
  };
  function arm(b) {
    const s = (b.duelSt = { n: 0, wg: 0, wgMax: 0, stunT: 0 });
    const pt0 = b.phaseText.bind(b);
    b.phaseText = () => (D.cur && D.cur.b === b ? `⚔ 決闘中 — 金色に光った瞬間に${D.keyName()}でパリィ（白いゲージを削り切ればブレイク）` : s.stunT > 0 ? `💥 ブレイク — 総攻撃の好機！（被ダメージ×${D.STUN_MUL}）` : s.wg > 0 ? '⚪ 白いゲージ（盾）を削り切るまで本体は無傷' : pt0());
    // its health only falls while no white gauge is left; what would have come off goes into the gauge instead (at a rate)
    let hp = b.hp;
    Object.defineProperty(b, 'hp', { configurable: true, get: () => hp, set: (v) => {
      if (D.authority && s.wg > 0 && v < hp && !b.dead) {
        const inDuel = D.cur && D.cur.b === b;
        s.wg = Math.max(0, s.wg - (hp - v) * (inDuel ? D.OUT_EFF : D.AFTER_EFF));
        if (s.wg <= 0) { if (inDuel) D.breakIt(); else shieldGone(b); }
        return;
      }
      hp = v;
    } });
    const dm0 = b.main.dmgMul;
    b.main.dmgMul = (info, ctx) => (s.stunT > 0 ? D.STUN_MUL : dm0 ? dm0(info, ctx) : 1);
    b.duelStyle = STYLE[b.def.id];
  }
  function shieldGone(b) {
    G.fx.sparks(b.main.centerPos(), null, 24, 0xffffff, 8); G.sfx.shieldBreak && G.sfx.shieldBreak(b.pos);
    G.ui.toast('⚪ 白いゲージが砕けた — 本体に攻撃が通る', 'good');
  }

  // ---------------------------------------------------------------- the loop
  const up0 = BS.update;
  BS.update = function (dt) {
    const b = BS.active;
    if (D.cur && D.cur.b !== b) D.abort();
    if (!b || !b.duelSt) { bar(null); return up0(dt); }
    const s = b.duelSt;
    if (b.dead) { bar(null); return up0(dt); }
    if (D.cur) { tick(dt); bar(b); return; }
    if (s.stunT > 0) { stunTick(b, dt); bar(b); return; }
    if (D.authority && s.wg <= 0 && s.n < D.AT.length && b.hp / b.maxHp <= D.AT[s.n]) { D.want(b); bar(b); return; }
    up0(dt);
    bar(b);
    outside(dt);
  };
  const clear0 = BS.clear;
  BS.clear = function () { D.abort(); bar(null); return clear0.apply(this, arguments); };

  // ---------------------------------------------------------------- start / end
  D.want = (b) => D.begin(b); // (co-op starts it outside the guardian's update)
  D.begin = function (b, who, ring) {
    const s = b.duelSt;
    s.n++; s.wgMax = b.maxHp * D.GAUGE; s.wg = s.wgMax;
    if (D.authority) stopBoss(b);
    // what is on the field goes: shots, fields, warnings, everything summoned (the foes themselves only where they are owned)
    G.combat.purgeHostile(); G.fx.clearTelegraphs();
    if (D.authority) for (const e of G.enemies.list) if (e.alive && !e.boss && e.def.id !== 'mimic_gold') { G.fx.smoke(e.centerPos(), 6, 1, 0x1a1412, 1, 1); e.noReward = true; e.hp = 0; G.combat.killEnemy(e, { src: 'clear', proc: true }, 0); }
    const w = b.world, R = D.ringR(w);
    const c = ring ? V(ring.x, 0, ring.z) : V(U.clamp(b.pos.x, R + 1, w.W - R - 1), 0, U.clamp(b.pos.z, R + 1, (w.arenaD || w.D) - R - 1));
    c.y = b.pos.y || 0;
    const d = (D.cur = { b, who: who ?? D.pickFirst(b), t: 0, c, R, combo: null, cd: 1.2, lockUntil: -9, st: 'intro', fx: [], readUntil: D.INTRO + D.READ, fightT: 0, slotT: 0, note: '' });
    // the guardian steps to the centre, the duellist comes inside the ring
    if (D.authority) { b.pos.x = c.x; b.pos.z = c.z; }
    buildRing(d);
    G.sfx.monster(b.pos, 'roar', 0.6, 1.3); G.sfx.bell && G.sfx.bell(); G.player.addShake(0.4);
    D.onBegin(d);
    D.syncMe(d);
    if (!D.mine()) G.ui.toast(`⚔ 決闘 — ${D.nameOf(d.who)} が ${b.def.name} と一騎打ち`, 'warn');
    return d;
  };
  D.onBegin = () => {}; D.onEnd = () => {}; D.onCombo = () => {}; D.onParry = () => {}; D.onSwitch = () => {}; // co-op hooks
  // the duellist changes (co-op): the new one gets the rules and the reading time again
  D.switchTo = function (id) {
    const d = D.cur; if (!d || d.who === id) return;
    d.who = id; d.readUntil = d.t + D.READ; d.combo = null; d.cd = 1.0; d.slotT = 0; d.lockUntil = -9; d.lastHit = undefined;
    D.onSwitch(d);
    D.syncMe(d);
    if (!D.mine()) G.ui.toastSmall(`⚔ 決闘の相手が ${D.nameOf(id)} に代わった`);
  };
  // each machine puts its own player in or out of the duel as the duellist changes
  D.syncMe = function (d) {
    const P = G.player; if (!P) return;
    const mine = D.mine();
    if (mine && !P.duelLock && !P.dead) enterMe(d);
    else if (!mine && P.duelLock) { leaveMe(); P.invulnT = Math.max(P.invulnT || 0, 1); }
    if (!mine) { ov(); if (!/watch/.test(OV.className)) OV.className = 'watch'; }
  };
  D.nameOf = () => 'あなた';
  function stopBoss(b) {
    b.act = null; b.hYbase = 0; b.hY = 0; b.root.visible = true; if (b.main) b.main.invuln = false;
    if (b.duelStyle.sys === 'agile') { b.pose = 'idle'; b.winding = false; b.charging = false; b.diving = false; if (b.shade) b.shade.visible = false; } else { b.pose = { n: null, k: 0 }; b.state = 'fight'; }
    b.mv = 0;
  }
  D.finish = function (broke) {
    const d = D.cur; if (!d) return;
    const b = d.b, me = D.mine();
    D.cur = null;
    dropRing(d);
    leaveMe(d);
    if (me) G.player.invulnT = Math.max(G.player.invulnT || 0, 1);
    if (D.authority) { stopBoss(b); if (b.recover && !broke) b.recover(1.5); }
    if (!broke && b.duelSt.wg > 0) G.ui.toast('⏳ 決闘の時間切れ — 白いゲージが盾として残った（削り切るまで本体は無傷）', 'warn');
    D.onEnd(d, broke);
  };
  D.abort = function () { const d = D.cur; if (!d) return; D.cur = null; dropRing(d); leaveMe(d); };

  // ---------------------------------------------------------------- the duellist's own side
  let prevTok = null;
  function enterMe(d) {
    const P = G.player;
    P.duelLock = true;
    prevTok = G.weapons.curTok();
    if (G.InvUI && G.InvUI.isOpen && G.InvUI.isOpen()) G.InvUI.close();
    if (G.GrenHold && G.GrenHold.active && G.GrenHold.active()) G.GrenHold.putAway(true);
    if (!P.meleeMode) G.weapons.setMelee();
    // inside the ring, facing the guardian
    const b = d.b, to = V(P.pos.x - d.c.x, 0, P.pos.z - d.c.z), l = Math.hypot(to.x, to.z);
    const ux = l > 0.01 ? to.x / l : 0, uz = l > 0.01 ? to.z / l : 1, r = Math.min(d.R - 1.2, near(b) + 4);
    P.pos.x = d.c.x + ux * r; P.pos.z = d.c.z + uz * r; P.vel.set(0, 0, 0);
    P.yaw = Math.atan2(-(b.pos.x - P.pos.x), -(b.pos.z - P.pos.z)); P.pitch = 0.12;
    lockHud(true);
    ov(); OV.className = 'on';
    banner(`⚔ 決闘`, `${b.def.name}との一騎打ち`);
    G.ui.toast(`⚔ 決闘！ 金色に光った瞬間に ${D.keyName()} でパリィ`, 'warn');
  }
  function leaveMe() {
    const P = G.player;
    if (P && P.duelLock) {
      P.duelLock = false;
      if (prevTok && prevTok !== 'm' && P.weapons.includes(prevTok)) G.weapons.selectTok(prevTok);
      prevTok = null;
    }
    lockHud(false);
    if (OV) { OV.className = 'fx'; clearTimeout(OV._t); OV._t = setTimeout(() => { if (OV.className === 'fx') OV.className = ''; }, 1400); }
  }
  function lockHud(on) {
    const UI = G.ui; for (const el of [...(UI.abEls || []), UI.grEl, UI.pileEl]) if (el) el.classList.toggle('locked', on || !!(G.player && G.player.liftLock));
    document.documentElement.classList.toggle('duel-me', on);
  }
  // the key that parries
  D.keyName = () => (isM() ? '構えボタン（🔄）' : G.K ? G.K('reload') : 'R');
  // the moment the key really went down (a slow frame must not make a press late: it is dated back to its keydown, a quarter second at most)
  D._kt = 0;
  window.addEventListener('keydown', (e) => { if (!e.repeat && G.BIND && G.BIND.reload && G.BIND.reload.includes(e.code)) D._kt = performance.now(); }, true);
  D.press = function () {
    const d = D.cur; if (!d || !D.mine()) return;
    if (G.weapons.gd) G.weapons.gd.pk = 0.2; // the quick parry stance
    const ago = D._kt ? (performance.now() - D._kt) / 1000 : 0, fresh = ago > 0 && ago < 0.25;
    D.tryParry(d.t - (fresh ? ago * D.timeK() : 0), true, fresh ? D._kt : 0);
  };
  // judged on the duellist's own machine, by the duel clock. kt = when the key went down (performance.now): it counts from the moment the flash appeared
  D.tryParry = function (now, local, kt) {
    const d = D.cur; if (!d || !d.combo) { if (d) d.lockUntil = now + D.LOCK; return false; }
    const w = D.win(), t0 = d.combo.t0;
    const s = d.combo.list.find((x) => !x.done && !x.parried && now <= t0 + x.at + D.LATE && (kt && x.flashed ? kt >= x.flashReal : now >= t0 + x.at - w));
    if (!s || s.fail || now < d.lockUntil) { d.lockUntil = now + D.LOCK; if (s) s.fail = true; return false; }
    s.parried = true;
    D.parried(d, s, local);
    D.onParry(d, d.combo.list.indexOf(s));
    return true;
  };
  D.parried = function (d, s, local) {
    const b = d.b, st = b.duelSt;
    const at = tipPos(b);
    G.fx.sparks(at, null, 30, 0xffd860, 10); G.fx.sparks(at, null, 12, 0xffffff, 6);
    if (G.sfx.clang) G.sfx.clang(D.mine() ? null : at); else G.sfx.impact(at, 'metal');
    if (local !== false && D.mine()) {
      D._stopUntil = performance.now() + 80; D._slowUntil = performance.now() + 330;
      G.player.addShake(0.7); // a short jolt of the screen
      if (G.weapons.gd) G.weapons.gd.kick = 1;
      flashScreen('parry');
    }
    // the guardian is knocked back a step and reels
    d.recoil = 0.3;
    if (D.authority) {
      const P = D.posOf(d.who), dx = b.pos.x - P.x, dz = b.pos.z - P.z, l = Math.hypot(dx, dz) || 1;
      b.pos.x += dx / l * 0.9; b.pos.z += dz / l * 0.9;
      st.wg = Math.max(0, st.wg - st.wgMax * D.PARRY);
      if (st.wg <= 1e-6) D.breakIt();
    }
  };
  D.breakIt = function () {
    const d = D.cur; if (!d) return;
    const b = d.b, st = b.duelSt;
    st.wg = 0;
    const dmg = Math.round(b.maxHp * D.BREAK);
    D.dealBreak(b, dmg);
    D._stopUntil = performance.now() + 140; D._slowUntil = performance.now() + 600;
    G.fx.dmgNum && G.fx.dmgNum(b.main.centerPos(), 'BREAK ' + dmg, 'crit');
    G.fx.sparks(b.main.centerPos(), null, 40, 0xffffff, 12); G.sfx.shieldBreak && G.sfx.shieldBreak(b.pos); G.sfx.explosion && G.sfx.explosion(b.pos, 0.8);
    D.breakFx(b);
    G.ui.toast(`💥 ブレイク！ ${b.def.name}が崩れた — ${D.STUN}秒間 総攻撃（被ダメージ×${D.STUN_MUL}）`, 'good');
    D.finish(true);
    if (!b.dead) { st.stunT = D.STUN; stopBoss(b); }
  };
  D.breakFx = function (b) { ov(); flashScreen('break'); pop('BREAK', true); G.player.addShake(0.5); };
  D.dealBreak = function (b, dmg) {
    const s = b.duelSt, keep = s.wg; s.wg = 0;
    b.hp = Math.max(0, b.hp - dmg);
    s.wg = keep;
    if (b.hp <= 0 && !b.dead) b.kill();
  };

  // ---------------------------------------------------------------- the duel's clock and the guardian's blows
  function tick(dt) {
    const d = D.cur, b = d.b, st = b.duelStyle, P = D.posOf(d.who), A = D.authority;
    d.t += dt;
    const lim = D.limit();
    if (d.t < D.INTRO) d.st = 'intro'; else if (d.t < d.readUntil) d.st = 'read'; else d.st = 'fight';
    if (d.st === 'fight') { d.fightT += dt; d.slotT += dt; }
    D.syncMe(d);
    if (D.mine() && d.st === 'fight' && OV.classList.contains('read')) OV.classList.remove('read');
    const dh = Math.hypot(P.x - b.pos.x, P.z - b.pos.z);
    if (A) { b.t += dt; b.mv = 0; }
    if (d.recoil > 0) d.recoil -= dt;
    if (!A) { if (d.combo) combo(d, dt, P); }
    else if (d.st !== 'fight') { b.face(P, dt, 6); pose(b, 'idle'); }
    else if (!d.combo) {
      b.face(P, dt, 8);
      d.cd -= dt;
      if (dh > reachOf(b)) { const l = dh || 1; b.groundMove((P.x - b.pos.x) / l, (P.z - b.pos.z) / l, st.speed, dt, (b.S && b.S.radius) || 1.2); b.mv = 1; b.walk = (b.walk || 0) + dt * ((b.S && b.S.stride) || 6); pose(b, 'run'); }
      else pose(b, 'idle');
      if (d.cd <= 0 && dh < reachOf(b) + 1.2 && D.authority) D.startCombo(makeCombo(st));
    } else combo(d, dt, P);
    // the two stay inside the ring (everyone else outside it)
    if (A) { const bx = b.pos.x - d.c.x, bz = b.pos.z - d.c.z, bl = Math.hypot(bx, bz); if (bl > d.R - 1) { b.pos.x = d.c.x + bx / bl * (d.R - 1); b.pos.z = d.c.z + bz / bl * (d.R - 1); } }
    if (D.mine()) { keepIn(d); lockOn(d, dt); } else keepOut(d);
    if (A) place(b, dt);
    tickFx(d, dt);
    hud(d, lim);
    if (A && d.fightT >= lim) D.finish(false);
  }
  D.tick = tick;
  D.startCombo = function (list, t0) { const d = D.cur; if (!d) return; d.combo = { t: 0, t0: t0 ?? d.t, list, id: (d.comboN = (d.comboN || 0) + 1) }; D.onCombo(d); };
  function combo(d, dt, P) {
    const b = d.b, cb = d.combo, w = D.win();
    cb.t = d.t - cb.t0;
    const ct = cb.t;
    const s = cb.list.find((x) => !x.done) || null;
    const A = D.authority;
    if (s) {
      // wind-up, then the lunge that closes in so running away does not help
      const wind = Math.max(0.15, s.at - s.from - s.hold), k = U.clamp((ct - s.from) / wind, 0, 1);
      if (!A) { /* the guardian itself moves on the host */ } else if (ct < s.at - 0.22) {
        b.face(P, dt, 10);
        const dx = P.x - b.pos.x, dz = P.z - b.pos.z, l = Math.hypot(dx, dz) || 1;
        if (l > reachOf(b) + 1) b.groundMove(dx / l, dz / l, b.duelStyle.speed * 1.2, dt, (b.S && b.S.radius) || 1.2);
      } else {
        const dx = P.x - b.pos.x, dz = P.z - b.pos.z, l = Math.hypot(dx, dz) || 1, want = near(b);
        if (l > want) { const m = Math.min(l - want, dt * 70); b.groundMove(dx / l, dz / l, m / Math.max(dt, 1e-4), dt, (b.S && b.S.radius) || 1.2); }
        b.face(P, dt, 20);
      }
      if (A) { if (d.recoil > 0) pose(b, 'recoil'); else pose(b, 'wind', k); }
      if (!s.flashed && ct >= s.at - w) { s.flashed = true; s.flashReal = performance.now(); goldFlash(d); if (D.mine() && G.input.down('reload')) s.fail = true; } // held from before the flash: no parry this time
      // a blow not parried lands one frame after its window closes (a press already on its way in that frame still counts)
      if (ct >= s.at + D.LATE && !s.due) s.due = true;
      else if (s.due) {
        s.done = true;
        if (!s.parried) D.strike(d, s); // (the blow is felt only on the duellist's own machine: D.hurt)
        d.lastHit = ct;
      }
    }
    if (A && d.lastHit !== undefined && ct - d.lastHit < 0.22 && d.recoil <= 0) pose(b, 'strike', (ct - d.lastHit) / 0.22);
    if (!s && ct > cb.list[cb.list.length - 1].at + 0.55) { d.combo = null; d.cd = U.rand(...b.duelStyle.rest); d.lastHit = undefined; }
  }
  // a blow that was not parried
  D.strike = function (d, s) {
    const b = d.b, P = D.posOf(d.who);
    G.sfx.whoosh(0.8, 0.7);
    G.fx.ring(V(P.x, (P.y || 0) + 0.2, P.z), 1.4, 0xff6040, 0.25);
    D.hurt(d, b.duelStyle.dmg);
  };
  D.hurt = function (d, dmg) {
    if (d.who !== D.myId()) return;
    const b = d.b, P = G.player;
    if (P.dead) return;
    b.hurtPlayer(dmg, 'melee', b.pos.clone());
    const dx = P.pos.x - b.pos.x, dz = P.pos.z - b.pos.z, l = Math.hypot(dx, dz) || 1;
    P.vel.x += dx / l * 4; P.vel.z += dz / l * 4;
  };
  function keepIn(d) {
    const P = G.player, x = P.pos.x - d.c.x, z = P.pos.z - d.c.z, l = Math.hypot(x, z);
    if (l > d.R - 0.5) { P.pos.x = d.c.x + x / l * (d.R - 0.5); P.pos.z = d.c.z + z / l * (d.R - 0.5); const vr = (P.vel.x * x + P.vel.z * z) / l; if (vr > 0) { P.vel.x -= x / l * vr; P.vel.z -= z / l * vr; } }
  }
  function lockOn(d, dt) {
    const P = G.player, b = d.b; if (P.dead) return;
    const want = Math.atan2(-(b.pos.x - P.pos.x), -(b.pos.z - P.pos.z));
    P.yaw += U.wrapAngle(want - P.yaw) * Math.min(1, dt * 3.5);
  }
  function keepOut(d) {
    const P = G.player; if (!P || P.dead) return;
    const x = P.pos.x - d.c.x, z = P.pos.z - d.c.z, l = Math.hypot(x, z) || 0.01;
    if (l < d.R + 0.5) { P.pos.x = d.c.x + x / l * (d.R + 0.5); P.pos.z = d.c.z + z / l * (d.R + 0.5); const vr = (P.vel.x * x + P.vel.z * z) / l; if (vr < 0) { P.vel.x -= x / l * vr; P.vel.z -= z / l * vr; } }
  }
  function outside() {}

  // ---------------------------------------------------------------- the guardian's body in a duel
  const HOLD = { t: 0, fn: () => false, duel: true };
  function pose(b, k, f) {
    const agile = b.duelStyle.sys === 'agile';
    if (agile) {
      b.pose = k === 'wind' ? 'iai' : k === 'strike' ? 'slash' : k === 'run' ? 'run' : k === 'recoil' || k === 'daze' ? 'dodge' : 'idle';
      b.act = k === 'run' || k === 'idle' ? null : HOLD; // (its legs walk only while it is not "acting")
    } else {
      if (k === 'wind') b.pose = { n: 'swing', k: f || 0, hit: 0 };
      else if (k === 'strike') b.pose = { n: 'swing', k: 1, hit: Math.min(1, f || 1) };
      else if (k === 'daze') b.pose = { n: 'slam', k: 0.4, hit: 1 };
      else if (k === 'recoil') b.pose = { n: 'swing', k: 0.2, hit: 0 };
      else b.pose = { n: null, k: 0 };
    }
  }
  function place(b, dt) {
    if (b.duelStyle.sys === 'agile') {
      b.root.position.set(b.pos.x, (b.y || 0) + (b.J.dy || 0), b.pos.z); b.root.rotation.y = b.yaw;
      b.S.anim(b, dt);
    } else {
      b.root.position.set(b.pos.x, 0, b.pos.z); b.root.rotation.y = b.yaw;
      b.J.anim(b, dt);
    }
    b.updateHits();
    b.bar();
  }
  function stunTick(b, dt) {
    const s = b.duelSt;
    s.stunT -= dt; b.t += dt; b.mv = 0;
    pose(b, 'daze');
    if (Math.random() < dt * 6) G.fx.sparks(b.main.centerPos().add(V(0, 1, 0)), null, 2, 0xfff0a0, 2);
    place(b, dt);
    if (s.stunT <= 0) { s.stunT = 0; stopBoss(b); if (b.recover) b.recover(1.2); }
  }
  // the end of its weapon (where the flash and the sparks appear)
  function tipPos(b) {
    const t = b.J && b.J.tip;
    if (t) return t.getWorldPosition(V());
    return b.pos.clone().add(V(Math.sin(b.yaw) * 1.2, 1.6, Math.cos(b.yaw) * 1.2));
  }

  // ---------------------------------------------------------------- effects
  let starTex = null;
  function star() {
    if (starTex) return starTex;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.18, 'rgba(255,220,110,0.95)'); g.addColorStop(0.5, 'rgba(255,180,40,0.25)'); g.addColorStop(1, 'rgba(255,160,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.globalCompositeOperation = 'lighter'; x.fillStyle = 'rgba(255,240,180,0.95)';
    for (const [w, h] of [[6, 124], [124, 6]]) x.fillRect(64 - w / 2, 64 - h / 2, w, h);
    x.save(); x.translate(64, 64); x.rotate(Math.PI / 4); x.fillStyle = 'rgba(255,230,150,0.6)'; x.fillRect(-2, -40, 4, 80); x.fillRect(-40, -2, 80, 4); x.restore();
    starTex = new THREE.CanvasTexture(c); return starTex;
  }
  // the golden flash: a star at the weapon, the screen's edges flare gold, a bright ring of sound
  function goldFlash(d) {
    const b = d.b, at = tipPos(b);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: star(), color: 0xffd25a, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    sp.position.copy(at); sp.scale.setScalar(0.4); sp.renderOrder = 999; G.scene.add(sp);
    d.fx.push({ sp, t: 0, life: 0.42, follow: true });
    // a second glint on its body, on your side of it (the blade can be high above the view of a tall guardian)
    const sp2 = new THREE.Sprite(sp.material.clone()); sp2.renderOrder = 999; G.scene.add(sp2);
    d.fx.push({ sp: sp2, t: 0, life: 0.42, body: true, k: 0.75 });
    G.fx.sparks(at, null, 10, 0xffe080, 5);
    if (G.sfx.shing) G.sfx.shing(); else if (G.sfx.ui) G.sfx.ui('select');
    if (D.mine()) flashScreen('gold');
  }
  function tickFx(d, dt) {
    for (const f of d.fx) {
      f.t += dt;
      const k = f.t / f.life;
      if (f.follow) f.sp.position.copy(tipPos(d.b));
      if (f.body) { const b = d.b, P = D.posOf(d.who), c = b.main.centerPos(), dx = P.x - c.x, dz = P.z - c.z, l = Math.hypot(dx, dz) || 1; f.sp.position.set(c.x + dx / l * ((b.S && b.S.radius) || 0.6), Math.min(c.y, (P.y || 0) + 2.2), c.z + dz / l * ((b.S && b.S.radius) || 0.6)); }
      f.sp.scale.setScalar((0.4 + Math.sin(Math.min(1, k) * Math.PI) * 2.4) * (f.k || 1));
      f.sp.material.rotation = k * 1.2;
      f.sp.material.opacity = Math.max(0, 1 - Math.max(0, k - 0.5) * 2);
    }
    d.fx = d.fx.filter((f) => { if (f.t < f.life) return true; G.scene.remove(f.sp); f.sp.material.dispose(); return false; });
    if (d.ring) { d.ring.wall.material.opacity = 0.1 + Math.sin(d.t * 3) * 0.03; d.ring.band.rotation.z += dt * 0.3; }
  }
  function buildRing(d) {
    const g = new THREE.Group(); g.position.set(d.c.x, (G.world.floorBelow ? Math.max(0, G.world.floorBelow(d.c.x, (d.c.y || 0) + 3, d.c.z)) : 0) + 0.04, d.c.z);
    const band = new THREE.Mesh(new THREE.RingGeometry(d.R - 0.22, d.R, 96), new THREE.MeshBasicMaterial({ color: 0xffc840, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    band.rotation.x = -Math.PI / 2; g.add(band);
    const inner = new THREE.Mesh(new THREE.RingGeometry(d.R - 0.9, d.R - 0.82, 96), band.material.clone()); inner.material.opacity = 0.35; inner.rotation.x = -Math.PI / 2; g.add(inner);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(d.R, d.R, 3.2, 96, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    wall.position.y = 1.6; g.add(wall);
    G.scene.add(g);
    d.ring = { g, band, wall };
  }
  function dropRing(d) {
    if (d.ring) { G.scene.remove(d.ring.g); d.ring.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); d.ring = null; }
    for (const f of d.fx || []) G.scene.remove(f.sp);
    d.fx = [];
  }

  // ---------------------------------------------------------------- the screen
  let OV = null, CSS = null;
  function ov() {
    if (!CSS) {
      CSS = document.createElement('style');
      CSS.textContent = `
#duel-ov { position: fixed; inset: 0; pointer-events: none; z-index: 40; display: none; }
#duel-ov.on, #duel-ov.fx { display: block; }
#duel-ov.fx > :not(.dv-flash):not(.dv-pop):not(.dv-banner) { display: none; }
#duel-ov.watch { display: block; } #duel-ov.watch > :not(.dv-low):not(.dv-pop):not(.dv-flash) { display: none; }
#duel-ov.watch .dv-low { bottom: 120px; color: #ffe8b0; }
#duel-ov .dv-bar { position: absolute; left: 0; right: 0; height: 7vh; background: #000; opacity: 0.85; transition: transform .4s; }
#duel-ov .dv-bar.t { top: 0; } #duel-ov .dv-bar.b { bottom: 0; }
#duel-ov .dv-frame { position: absolute; inset: 0; box-shadow: inset 0 0 0 3px rgba(255,200,80,0.55), inset 0 0 90px rgba(255,180,40,0.28); }
#duel-ov .dv-flash { position: absolute; inset: 0; opacity: 0; }
#duel-ov .dv-flash.gold { animation: dvGold .38s ease-out; box-shadow: inset 0 0 220px 60px rgba(255,205,60,0.95); background: radial-gradient(circle, rgba(255,220,120,0) 45%, rgba(255,200,60,0.22)); }
#duel-ov .dv-flash.parry { animation: dvGold .3s ease-out; background: radial-gradient(circle, rgba(255,240,190,0.35), rgba(255,200,60,0) 60%); }
#duel-ov .dv-flash.break { animation: dvGold .6s ease-out; background: rgba(255,255,255,0.75); }
@keyframes dvGold { 0% { opacity: 1; } 100% { opacity: 0; } }
#duel-ov .dv-banner { position: absolute; left: 50%; top: 24%; transform: translate(-50%, -50%); text-align: center; color: #ffe2a0; text-shadow: 0 0 18px rgba(255,170,40,0.9), 0 2px 0 #000; opacity: 0; }
#duel-ov .dv-banner.show { animation: dvBan 1.8s ease-out forwards; }
#duel-ov .dv-banner b { display: block; font-size: 64px; letter-spacing: 0.25em; font-weight: 900; }
#duel-ov .dv-banner span { font-size: 18px; letter-spacing: 0.1em; }
@keyframes dvBan { 0% { opacity: 0; transform: translate(-50%, -50%) scale(1.6); } 15% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; } }
#duel-ov .dv-low { position: absolute; left: 50%; bottom: calc(7vh + 18px); transform: translateX(-50%); width: min(420px, 70vw); text-align: center; color: #ffe2a0; font-size: 13px; text-shadow: 0 1px 2px #000; }
#duel-ov .dv-time { height: 6px; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,200,90,0.6); border-radius: 3px; overflow: hidden; margin-top: 4px; }
#duel-ov .dv-time i { display: block; height: 100%; background: linear-gradient(90deg, #ffb030, #ffe080); }
#duel-ov .dv-pop { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); font-size: 40px; font-weight: 900; color: #fff1c0; text-shadow: 0 0 16px rgba(255,190,40,1), 0 2px 0 #000; opacity: 0; letter-spacing: 0.1em; }
#duel-ov .dv-pop.show { animation: dvPop .7s ease-out; } #duel-ov .dv-pop.big { font-size: 72px; color: #fff; }
@keyframes dvPop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -60%) scale(1); } }
#boss-duel { height: 7px; margin: 3px auto 0; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.55); border-radius: 3px; overflow: hidden; display: none; }
#boss-duel i { display: block; height: 100%; width: 100%; background: linear-gradient(180deg, #ffffff, #d8dde8); box-shadow: 0 0 8px rgba(255,255,255,0.8); transition: width .15s; }
#boss-duel.on { display: block; }
#boss-duel-lbl { font-size: 11px; color: #f4f4ff; text-align: center; text-shadow: 0 1px 2px #000; display: none; }
#boss-duel-lbl.on { display: block; }
html.duel-me #hud-br { filter: grayscale(0.6); }
html.duel-me .mb[data-id="reload"] { box-shadow: 0 0 0 3px #ffc840, 0 0 22px rgba(255,190,40,0.9) !important; background: rgba(120,80,10,0.75) !important; }
html.duel-me .mb:not([data-id="reload"]):not([data-id="pause"]):not([data-id="jump"]) { opacity: 0.3 !important; }
`;
      document.head.appendChild(CSS);
    }
    if (!OV) {
      OV = document.createElement('div'); OV.id = 'duel-ov';
      OV.innerHTML = '<div class="dv-frame"></div><div class="dv-bar t"></div><div class="dv-bar b"></div><div class="dv-flash"></div><div class="dv-banner"></div><div class="dv-pop"></div><div class="dv-low"><div class="dv-lt"></div><div class="dv-time"><i></i></div></div>';
      document.body.appendChild(OV);
    }
    return OV;
  }
  function banner(t, s) { const el = ov().querySelector('.dv-banner'); el.innerHTML = `<b>${t}</b><span>${U.esc(s)}</span>`; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  function flashScreen(k) { const el = ov().querySelector('.dv-flash'); el.className = 'dv-flash'; void el.offsetWidth; el.className = 'dv-flash ' + k; }
  function pop(t, big) { const el = ov().querySelector('.dv-pop'); el.textContent = t; el.className = 'dv-pop'; void el.offsetWidth; el.className = 'dv-pop show' + (big ? ' big' : ''); }
  D.flashScreen = flashScreen; D.pop = pop;
  function hud(d, lim) {
    ov();
    const left = Math.max(0, lim - d.fightT), fight = d.st === 'fight', wait = Math.max(0, Math.ceil(d.readUntil - d.t));
    const lt = OV.querySelector('.dv-lt'), tm = OV.querySelector('.dv-time i');
    const txt = !D.mine() ? `⚔ ${U.esc(D.nameOf(d.who))} が決闘中（残り ${Math.ceil(left)}秒）${d.note ? '　' + U.esc(d.note) : ''}`
      : fight ? `⚔ 決闘中 — 金色に光ったら ${U.esc(D.keyName())}　残り ${Math.ceil(left)}秒${d.note ? '　' + U.esc(d.note) : ''}` : `⚔ 決闘開始まで ${wait}秒`;
    if (lt._t !== txt) { lt.innerHTML = txt; lt._t = txt; }
    tm.style.width = (fight || !D.mine() ? left / lim * 100 : 100).toFixed(1) + '%';
  }
  // the white gauge under the guardian's health bar
  let wEl = null, wLbl = null;
  function bar(b) {
    const box = G.ui.el && G.ui.el.boss; if (!box) return;
    if (!wEl) {
      wEl = document.createElement('div'); wEl.id = 'boss-duel'; wEl.innerHTML = '<i></i>';
      wLbl = document.createElement('div'); wLbl.id = 'boss-duel-lbl';
      const hb = box.querySelector('#boss-bar'); if (hb && hb.parentNode) { hb.parentNode.insertBefore(wLbl, hb.nextSibling); hb.parentNode.insertBefore(wEl, hb.nextSibling); } else { box.appendChild(wEl); box.appendChild(wLbl); }
      ov();
    }
    const s = b && b.duelSt, on = !!(s && s.wg > 0 && s.wgMax > 0);
    wEl.classList.toggle('on', on);
    if (!on) return;
    const hb = box.querySelector('#boss-bar'); if (hb) wEl.style.width = hb.offsetWidth ? hb.offsetWidth + 'px' : '';
    wEl.firstChild.style.width = (s.wg / s.wgMax * 100).toFixed(1) + '%';
  }
  D.bar = bar;
})();
