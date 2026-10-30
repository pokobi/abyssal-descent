'use strict';
// Co-op, the host's side: the real game runs here. Guests are one more target for the foes, the same way the mercenary is: while a foe acts on a guest the player's
// position and velocity are swapped for the guest's, and a blow that lands on "the player" goes down the wire instead. Foes, their shots and the guardian's body are sent out.
(function () {
  const K = G.Coop;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  // the same random numbers on both sides while something both must build alike is built (levels, guardians)
  K.seeded = function (seed, fn) {
    const r = new G.RNG(seed >>> 0), m = Math.random;
    Math.random = () => r.next();
    try { return fn(); } finally { Math.random = m; }
  };
  // levels: what the level generator draws from Math.random must match too, and a boon of one player must not change the map of the other
  K.wrapLevels = function () {
    const L = G.LevelGen;
    for (const k of ['generate', 'shop', 'boss', 'room']) {
      const f = L[k];
      L[k] = function (...a) {
        const seed = a[1];
        if (k === 'generate') a[2] = Object.assign({}, a[2], { extraChests: 0 });
        return K.seeded(seed ^ 0x5eed, () => f.apply(L, a));
      };
    }
  };
  // a short print of a world, to prove both sides built the same one
  K.fingerprint = function () {
    const w = G.world; let h = 0;
    const add = (v) => { h = (h * 31 + Math.round(v * 10)) | 0; };
    for (const c of w.colliders || []) { add(c.x0); add(c.z0); add(c.x1); add(c.y1 || 0); }
    for (const it of w.interactables) { add(it.pos ? it.pos.x : 0); add(it.pos ? it.pos.z : 0); }
    return h;
  };
  K.hpScale = () => 1 + 0.6 * (K.players.size - 1);

  K.installHost = function () {
    const GM = G.game, P = G.player, E = G.enemies, C = G.combat, BS = G.bosses, FX = G.fx, Ep = E.Enemy.prototype;
    K.wrapLevels();
    let nextId = 1;
    const known = new Map();
    const alivePlayers = () => [...K.players.values()].filter((p) => p.id !== 0 && !p.dead);
    const tv0 = V(), tv1 = V();
    // run fn as if guest rp were the player
    function withTarget(rp, fn) {
      tv0.copy(P.pos); tv1.copy(P.vel);
      const d0 = P.dead, w = G.world, nd = w.ndist;
      P.pos.copy(rp.to); P.vel.copy(rp.vel); P.dead = false; K.swap = rp;
      if (rp.field && rp.field.length === nd.length) w.ndist = rp.field;
      const vx = P.vel.x, vy = P.vel.y, vz = P.vel.z;
      try { return fn(); } finally {
        const dx = P.vel.x - vx, dy = P.vel.y - vy, dz = P.vel.z - vz;
        if (dx * dx + dy * dy + dz * dz > 1) K.send({ t: 'kick', v: [r2(dx), r2(dy), r2(dz)] }, rp.id);
        K.swap = null; w.ndist = nd; P.pos.copy(tv0); P.vel.copy(tv1); P.dead = d0;
      }
    }
    // ---------------- foes go for whoever is nearest (a little stickiness so they do not flip between two) ----------------
    function pick(e) {
      let best = P.dead ? null : 0, bd = P.dead ? 1e9 : e.pos.distanceTo(P.pos);
      if (e._cp === 0) bd *= 0.8;
      for (const rp of alivePlayers()) {
        let d = e.pos.distanceTo(rp.to); if (e._cp === rp.id) d *= 0.8;
        if (d < bd) { bd = d; best = rp.id; }
      }
      e._cp = best;
      return best ? K.players.get(best) : null;
    }
    const upd = Ep.update;
    Ep.update = function (dt) {
      if (!K.live || this.dying || this.ally) return upd.call(this, dt);
      const rp = pick(this);
      return rp ? withTarget(rp, () => upd.call(this, dt)) : upd.call(this, dt);
    };
    // each guest gets a path field of its own, so foes find the way round walls to them as well
    function updateFields(dt) {
      K._fT = (K._fT || 0) - dt;
      if (K._fT > 0) return;
      K._fT = 0.3;
      const w = G.world; if (!w || !w.ndist) return;
      const nd = w.ndist;
      for (const rp of alivePlayers()) {
        if (!rp.field || rp.field.length !== nd.length) rp.field = new nd.constructor(nd.length).fill(Infinity);
        w.ndist = rp.field;
        try { w.updateFlow(rp.to.x, rp.to.z, rp.to.y); } finally { w.ndist = nd; }
      }
    }
    // a blow on "the player" during a swap belongs to the guest
    const dp = C.damagePlayer;
    C.damagePlayer = function (amount, info) {
      const rp = K.swap;
      if (!rp) return dp.call(C, amount, info);
      const i = info || {}, a = i.attacker;
      K.send({ t: 'dmg', a: r2(amount), s: i.src, e: i.elem, f: i.fixed ? 1 : 0, p: i.pos ? [r2(i.pos.x), r2(i.pos.y), r2(i.pos.z)] : null, n: a && a.def ? a.def.name : null }, rp.id);
      return amount;
    };
    // the guardian: one player per attack, as with the mercenary; an area blow also catches whoever stands near its centre
    const bu = BS.update;
    BS.update = function (dt) {
      const b = BS.active;
      if (!K.live || !b || b.dead) return bu.call(BS, dt);
      const has = !!b.act;
      if (has && !b._cpHad) {
        const all = alivePlayers().map((p) => p.id); if (!P.dead) all.push(0);
        b._cpT = all.length ? all[Math.floor(Math.random() * all.length)] : 0;
      }
      if (!has) { const near = alivePlayers(); let bi = P.dead ? -1 : 0, bd = P.dead ? 1e9 : b.pos.distanceTo(P.pos); for (const p of near) { const d = b.pos.distanceTo(p.to); if (d < bd) { bd = d; bi = p.id; } } b._cpT = bi; }
      b._cpHad = has;
      const rp = b._cpT > 0 && K.players.get(b._cpT);
      return rp && !rp.dead ? withTarget(rp, () => bu.call(BS, dt)) : bu.call(BS, dt);
    };
    const hp = BS.Boss.prototype.hurtPlayer;
    BS.Boss.prototype.hurtPlayer = function (dmg, src, pos, elem) {
      const sw = K.swap;
      hp.call(this, dmg, src, pos, elem);
      if (!K.live || !pos || this.dead || (src !== 'aoe' && src !== 'explosion')) return;
      for (const rp of alivePlayers()) {
        if (rp === sw) continue;
        if (Math.hypot(rp.to.x - pos.x, rp.to.z - pos.z) < BS.SPLASH_R && Math.abs(rp.to.y - pos.y) < 4) K.send({ t: 'dmg', a: r2(dmg * this.dmgScale * 0.6), s: src, e: elem, p: [r2(pos.x), r2(pos.y), r2(pos.z)], n: this.def.name }, rp.id);
      }
      if (sw && !P.dead && Math.hypot(tv0.x - pos.x, tv0.z - pos.z) < BS.SPLASH_R && Math.abs(tv0.y - pos.y) < 4) {
        const k = K.swap; K.swap = null;
        const p0 = P.pos.clone(); P.pos.copy(tv0);
        try { dp.call(C, dmg * this.dmgScale * 0.6, { src, attacker: this.parts[0], pos, elem }); } finally { P.pos.copy(p0); K.swap = k; }
      }
    };
    // a guardian is built the same on both sides, then its pose is sent out node by node
    const bs = BS.start;
    BS.start = function (id, level, world) {
      const seed = (GM.seed ^ G.U.hashStr('bossbody' + GM.area)) >>> 0;
      const b = K.seeded(seed, () => bs.call(BS, id, level, world));
      const k = K.hpScale();
      b.maxHp *= k; b.hp = b.maxHp;
      for (const p of b.parts) if (Object.getOwnPropertyDescriptor(p, 'hp').writable) { p.maxHp = (p.maxHp || 0) * k; p.hp = (p.hp || 0) * k; }
      b.parts.forEach((p, i) => { p._nid = -(i + 1); });
      K.bossNodes = K.nodesOf(b);
      K._bossLast = [];
      K.send({ t: 'bstart', id, level, seed, hp: b.hp, mx: b.maxHp, n: K.bossNodes.length });
      return b;
    };
    // ---------------- things the foes make: every player's own copy flies and hits on its own machine ----------------
    const sp = C.spawnProjectile;
    C.spawnProjectile = function (o) {
      const p = sp.call(C, o);
      if (K.live && o.owner === 'enemy') K.send({ t: 'pj', o: K.plain(o) });
      return p;
    };
    const zn = C.zone;
    C.zone = function (pos, r, dur, kind, dps, opts) {
      const z = zn.call(C, pos, r, dur, kind, dps, opts);
      if (K.live && opts && opts.enemy) K.send({ t: 'zn', a: [K.vec(pos), r, dur, kind, dps], o: K.plain(opts) });
      return z;
    };
    const ex = C.explode;
    C.explode = function (pos, r, dmg, info) {
      const res = ex.call(C, pos, r, dmg, info);
      if (K.live && info && info.enemy) K.send({ t: 'bm', a: [K.vec(pos), r, dmg], o: K.plain(info), h: K.swap ? 0 : 1 });
      return res;
    };
    const tg = FX.telegraph, tl = FX.teleLine;
    FX.telegraph = function (p, r, dur, color) { if (K.live) K.send({ t: 'tg', a: [K.vec(p), r, dur, color] }); return tg.call(FX, p, r, dur, color); };
    FX.teleLine = function (a, b, width, dur, color) { if (K.live) K.send({ t: 'tl', a: [K.vec(a), K.vec(b), width, dur, color] }); return tl.call(FX, a, b, width, dur, color); };

    // ---------------- areas ----------------
    const ea = GM.enterArea;
    GM.enterArea = function (n, kind) {
      known.clear(); K._cleared = false; K._engaged = false; K._objKey = '';
      if (P.dead) K.rise(P.pos, P.stats.maxHp * 0.5, false);
      ea.call(GM, n, kind);
      GM.areaMods.hp *= K.hpScale();
      K.send({ t: 'area', n, kind, seed: GM.seed, diff: G.Run.cur.id, lv: G.Run.cur.lv, fp: K.fingerprint() });
    };
    K.go = function (n, kind) {
      if (GM.transitioning || n !== GM.area + 1) return;
      GM.transitioning = true;
      G.sfx.whoosh(0.8, 0.8);
      document.getElementById('fade').classList.add('on');
      setTimeout(() => { GM.enterArea(n, kind); (GM._warmP || Promise.resolve()).then(() => { GM.transitioning = false; document.getElementById('fade').classList.remove('on'); }); }, 650);
    };
    K.handlers.gate = (m) => K.go(m.n, m.kind);
    K.handlers.engage = () => { if (!GM.bossEngaged && !P.dead && G.world.arenaCenter) { P.pos.z = Math.min(P.pos.z, (G.world.ledgeZ ? G.world.ledgeZ : G.world.arenaD) - 4); P.pos.x = G.world.arenaCenter.x; K.msg('仲間が守護者の間へ入った'); } };
    K.begin = function () {
      K.started();
      K.send({ t: 'go' });
      GM.startRun({ id: 'normal', lv: 0 }, 0);
    };
    // ---------------- what the guests did ----------------
    const dm = C.damageEnemy, ke = C.killEnemy;
    K.quietKill = K.makeQuietKill(ke);
    C.killEnemy = function (e, info, ov) {
      if (info && info.remote !== undefined) { e._killer = info.remote; return K.quietKill(e, info); }
      if (e._nid) e._killer = 0;
      return ke.call(C, e, info, ov);
    };
    const find = (id) => (id < 0 ? BS.active && BS.active.parts[-id - 1] : known.get(id));
    K.handlers.hit = function (m, from) {
      for (const [id, dh, ds, cc, kn] of m.h) {
        const e = find(id); if (!e || !e.alive || e.dying) continue;
        if (ds && e.shield > 0) { e.shield = Math.max(0, e.shield - ds); if (e.shield <= 0 && e.onShieldBreak) e.onShieldBreak(); }
        if (dh > 0) {
          // the guest's machine already worked out armour, marks and shields: this is the plain result
          const mul = e.dmgMul, sh = e.shield, mk = e.st.mark; e.dmgMul = null; e.shield = 0; e.st.mark = 0;
          try { dm.call(C, e, dh, { src: 'dot', silent: true, noBuffs: true, remote: from, proc: true, noSkOn: true }); } finally { if (e.alive) { e.dmgMul = mul; e.shield = sh; e.st.mark = mk; } }
        }
        if (cc === 1) C.status(e, 'frost', 1);
        if (cc > 1) C.stun(e, cc - 1);
        if (kn && !e.boss && e.knockback) e.knockback(V(kn[0], 0, kn[1]), kn[2]);
      }
    };
    K.handlers.trap = function (m) { const d = G.ENEMY_BY_ID.mimic_trap; if (d) GM.spawnEnemy({ def: d, at: { x: m.p[0], y: m.p[1], z: m.p[2] } }); };
    K.onLeave = function () { if (GM.run) checkWipe(); };

    // ---------------- what is sent, and how often ----------------
    function checkWipe() {
      if (!K.live || !P.dead || P.revives > 0) return;
      for (const rp of K.players.values()) if (rp.id !== 0 && (!rp.dead || rp.rev > 0)) return;
      K.send({ t: 'wipe' });
      K.ended('全滅', `エリア ${GM.area} で倒れた`);
    }
    let snapT = 0, objT = 0;
    K.onNet = function (dt) {
      if (!GM.run || !G.world) return;
      updateFields(dt);
      snapT -= dt;
      if (snapT <= 0) { snapT = 0.066; K.sendEnemies(); K.sendBoss(); }
      objT -= dt;
      if (objT <= 0) { objT = 0.4; sendObjective(); checkWipe(); helpAltars(0.4); }
      if (GM.areaCleared && !K._cleared) { K._cleared = true; K.send({ t: 'clear', boss: GM.stage === 'boss' ? 1 : 0 }); }
      if (GM.bossEngaged && !K._engaged) { K._engaged = true; K.send({ t: 'engage' }); }
      K.scanChests();
    };
    K.sendEnemies = function () {
      const add = [], snap = [];
      for (const e of E.list) {
        if (e.custom || e.ally || !e.isEnemy || !e.alive) continue;
        if (!e._nid) {
          e._nid = nextId++; known.set(e._nid, e);
          add.push([e._nid, e.def.id, e.level, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.yaw), Math.round(e.hp), e.maxHp, Math.round(e.shield), e.maxShield, e.elite ? 1 : 0, r2(e.model.scale / (e.elite ? 1.15 : 1)), e.def.name, (e.noReward ? 1 : 0) | (e.noLoot ? 2 : 0) | (e.bossSpawn ? 4 : 0) | (e.cursed ? 8 : 0) | (e.champion ? 16 : 0) | (e.marked ? 32 : 0)]);
        }
        const fl = (e.burrowed ? 1 : 0) | (e.untargetable ? 2 : 0) | (e.invuln ? 4 : 0) | (e.st.stun > 0 ? 8 : 0) | (e.st.frozen > 0 ? 16 : 0) | (e.state === 'spawn' ? 32 : 0) | (e.model.group.visible ? 0 : 64);
        snap.push([e._nid, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.yaw), Math.round(e.hp), Math.round(e.shield), fl, r2(e.atk || 0), r2(e.wind || 0), r2(e.mv || 0)]);
      }
      if (add.length) K.send({ t: 'es', a: add });
      for (const [id, e] of known) {
        if (e.alive && !e.removed) continue;
        known.delete(id);
        K.send({ t: 'ed', id, k: e._killer === undefined ? -1 : e._killer, r: e.dying ? 0 : 1 });
      }
      if (snap.length) K.send({ t: 's', e: snap });
    };
    K.sendBoss = function () {
      const b = BS.active;
      if (!b || !K.bossNodes) return;
      if (b.dead) { if (!b._cpSent) { b._cpSent = true; K.send({ t: 'bdead' }); } return; }
      const nodes = [], last = K._bossLast;
      K.bossNodes.forEach((n, i) => {
        const a = [r2(n.position.x), r2(n.position.y), r2(n.position.z), Math.round(n.quaternion.x * 1000), Math.round(n.quaternion.y * 1000), Math.round(n.quaternion.z * 1000), Math.round(n.quaternion.w * 1000), n.visible ? 1 : 0, r2(n.scale.x)];
        const key = a.join();
        if (last[i] !== key) { last[i] = key; nodes.push([i].concat(a)); }
      });
      const parts = b.parts.map((p) => [p.alive ? 1 : 0, p.untargetable ? 1 : 0, p.invuln || (p.isInvuln && p.isInvuln({ src: 'bullet' })) ? 1 : 0, Math.round(p.hp), Math.round(p.maxHp), Math.round(p.shield || 0)]);
      K.send({ t: 'b', hp: Math.round(b.hp), sh: Math.round(b.shield || 0), mxs: Math.round(b.maxShield || 0), pos: K.vec(b.pos), yaw: r2(b.yaw), ph: b.phaseText ? b.phaseText() : '', nodes, parts });
    };
    function sendObjective() {
      const O = GM.objective; if (!O) return;
      let text = '', sub = '', prog = null;
      try { text = O.text ? O.text() : ''; sub = !O.done && O.sub ? O.sub() : ''; prog = O.segs ? null : O.progress ? O.progress() : null; } catch (e) { return; }
      const key = text + '|' + sub + '|' + (prog === null ? '' : Math.round(prog * 50));
      if (key === K._objKey) return;
      K._objKey = key;
      K.send({ t: 'o', x: text, s: sub, p: prog, ic: O.icon });
    }
    // a guest standing in a ritual circle chants too
    function helpAltars(dt) {
      const O = GM.objective;
      if (!O || !O.altars || GM.areaCleared) return;
      for (const a of O.altars) {
        if (a.done) continue;
        const hostIn = !P.dead && Math.hypot(P.pos.x - a.x, P.pos.z - a.z) < 2.8;
        if (hostIn) continue;
        for (const rp of alivePlayers()) if (Math.hypot(rp.to.x - a.x, rp.to.z - a.z) < 2.8 && Math.abs(rp.to.y - a.y) < 2) { a.p = Math.min(1, a.p + dt * (1 / 8 + 1 / 30)); break; }
      }
    }
  };
})();
