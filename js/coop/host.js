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
  K.fpInfo = () => `${(G.world.colliders || []).length}/${G.world.interactables.length}`;
  K.hpScale = () => 1 + 0.6 * (K.players.size - 1);

  K.installHost = function () {
    const GM = G.game, P = G.player, E = G.enemies, C = G.combat, BS = G.bosses, FX = G.fx, Ep = E.Enemy.prototype;
    K.wrapLevels();
    let nextId = 1;
    const known = new Map();
    const alivePlayers = () => [...K.players.values()].filter((p) => p.id !== 0 && !p.dead);
    const tv0 = V(), tv1 = V();
    // run fn as if guest rp were the player. Whatever the foe does to "the player" meanwhile (a grab, a slow, a pull) is not the host's: it is taken back and sent to the guest
    const SW = ['dragT', 'pullT', 'pullSpd', 'liftVy', 'liftLock', 'gravFreeAt', 'invulnT', 'mirTip'];
    const s0 = new Array(SW.length);
    function withTarget(rp, fn) {
      tv0.copy(P.pos); tv1.copy(P.vel);
      const d0 = P.dead, w = G.world, nd = w.ndist, smk = P.smokeT, inv = P.stats.invis, gr = P.grapple.state, pile = P.pileState, gnd = P.grounded, stS = P.st.slow, stK = P.st.shock, pd = P.pullDir;
      SW.forEach((k, i) => { s0[i] = P[k]; });
      P.pos.copy(rp.to); P.vel.copy(rp.vel); P.dead = false; K.swap = rp; P.smokeT = rp.ps & 16 ? 1 : 0; P.stats.invis = 0; P.grounded = !!rp.gnd;
      if (rp.field && rp.field.length === nd.length) w.ndist = rp.field;
      const vx = P.vel.x, vy = P.vel.y, vz = P.vel.z, px = P.pos.x, py = P.pos.y, pz = P.pos.z;
      try { return fn(); } finally {
        const dx = P.vel.x - vx, dy = P.vel.y - vy, dz = P.vel.z - vz;
        if (dx * dx + dy * dy + dz * dz > 1) K.send({ t: 'kick', v: [r2(dx), r2(dy), r2(dz)] }, rp.id);
        let o = null;
        const put = (k, v) => { (o || (o = {}))[k] = v; };
        SW.forEach((k, i) => { if (P[k] !== s0[i]) { put(k, P[k] === undefined ? null : P[k]); P[k] = s0[i]; } });
        if (P.st.slow !== stS) { put('slow', P.st.slow); P.st.slow = stS; }
        if (P.st.shock !== stK) { put('shock', P.st.shock); P.st.shock = stK; }
        if (P.grapple.state !== gr) { put('gr', 1); P.grapple.state = gr; }
        if (P.pileState !== pile) { put('pile', 1); P.pileState = pile; }
        if (P.pullDir !== pd) { if (P.pullDir) put('pd', [r2(P.pullDir.x), r2(P.pullDir.y || 0), r2(P.pullDir.z)]); P.pullDir = pd; }
        if (Math.abs(P.pos.x - px) + Math.abs(P.pos.y - py) + Math.abs(P.pos.z - pz) > 0.05) put('dp', [r2(P.pos.x - px), r2(P.pos.y - py), r2(P.pos.z - pz)]);
        if (o) K.send({ t: 'pfx', o }, rp.id);
        K.swap = null; w.ndist = nd; P.pos.copy(tv0); P.vel.copy(tv1); P.dead = d0; P.smokeT = smk; P.stats.invis = inv; P.grounded = gnd;
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
      // (the last guardian's gravity reversal holds its victim for seconds, with a landing of its own: it stays on the host's character)
      const held = b.gravBusy && b.gravBusy() && !P.dead;
      return rp && !rp.dead && !held ? withTarget(rp, () => bu.call(BS, dt)) : bu.call(BS, dt);
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
      // (a guest's gravity reversal runs on the guest's own machine)
      if (b.startLift) { const s = b.startLift; b.startLift = function () { if (!K.swap) return s.call(b); }; }
      K._bs = { t: 'bstart', id, level, seed, hp: b.hp, mx: b.maxHp, n: K.bossNodes.length };
      K.send(K._bs);
      return b;
    };
    // ---------------- things the foes make: every player's own copy flies and hits on its own machine ----------------
    const sp = C.spawnProjectile;
    C.spawnProjectile = function (o) {
      if (K.live && o.owner === 'enemy' && o.explode) o.info = Object.assign({}, o.info, { pjx: 1 });
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
      if (K.live && info && info.enemy && !info.pjx) K.send({ t: 'bm', a: [K.vec(pos), r, dmg], o: K.plain(info), h: K.swap ? 0 : 1 });
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
      K.send({ t: 'area', n, kind, seed: GM.seed, diff: G.Run.cur.id, lv: G.Run.cur.lv, fp: K.fingerprint(), fi: K.fpInfo() });
    };
    K.go = function (n, kind) {
      if (GM.transitioning || n !== GM.area + 1) return;
      GM.transitioning = true;
      G.sfx.whoosh(0.8, 0.8);
      document.getElementById('fade').classList.add('on');
      setTimeout(() => { try { GM.enterArea(n, kind); } catch (e) { console.error(e); } (GM._warmP || Promise.resolve()).then(() => { GM.transitioning = false; document.getElementById('fade').classList.remove('on'); }); }, 650);
    };
    K.handlers.gate = (m) => K.go(m.n, m.kind);
    K.handlers.engage = () => { if (!GM.bossEngaged && !P.dead && G.world.arenaCenter) { P.pos.z = Math.min(P.pos.z, (G.world.ledgeZ ? G.world.ledgeZ : G.world.arenaD) - 4); P.pos.x = G.world.arenaCenter.x; K.msg('仲間が守護者の間へ入った'); } };
    K.begin = function () {
      K.started();
      K.send({ t: 'go' });
      GM.startRun(K.diff, 0);
    };
    // ---------------- what the guests did ----------------
    const dm = C.damageEnemy, ke = C.killEnemy;
    K.quietKill = K.makeQuietKill(ke);
    C.killEnemy = function (e, info, ov) {
      if (info && info.remote !== undefined) { e._killer = info.remote; return K.quietKill(e, info); }
      if (e._nid) e._killer = info && info.src === 'dot' && e._dotBy ? e._dotBy : 0;
      return ke.call(C, e, info, ov);
    };
    const find = (id) => (id < 0 ? BS.active && BS.active.parts[-id - 1] : known.get(id));
    K.handlers.hit = function (m, from) {
      for (const [id, dh, ds, kn] of m.h) {
        const e = find(id); if (!e || !e.alive || e.dying) continue;
        if (ds && e.shield > 0) { e.shield = Math.max(0, e.shield - ds); if (e.shield <= 0 && e.onShieldBreak) e.onShieldBreak(); }
        if (dh > 0) {
          // the guest's machine already worked out armour, marks and shields: this is the plain result
          const mul = e.dmgMul, sh = e.shield, mk = e.st.mark; e.dmgMul = null; e.shield = 0; e.st.mark = 0;
          try { dm.call(C, e, dh, { src: 'dot', silent: true, noBuffs: true, remote: from, proc: true, noSkOn: true }); } finally { if (e.alive) { e.dmgMul = mul; e.shield = sh; e.st.mark = mk; } }
          G.fx.blood(e.centerPos(), null, e.bloodColor, 3);
        }
        if (kn && !e.boss && e.knockback) e.knockback(V(kn[0], 0, kn[1]), kn[2]);
      }
    };
    // what the guests are told of a foe's statuses (shown there), and what a guest puts on a foe (merged in here, where it ticks)
    const SB = ['burn', 'poison', 'bleed', 'frozen', 'frost', 'shock', 'stun', 'slow', 'root', 'fear', 'mark'];
    K.statusBits = (e) => { let b = 0; SB.forEach((k, i) => { if (e.st[k] > 0) b |= 1 << i; }); return b; };
    K.handlers.ss = function (m, from) {
      for (const [id, o] of m.a) {
        const e = find(id); if (!e || !e.alive || e.dying) continue;
        for (const k in o) e.st[k] = Math.max(+e.st[k] || 0, o[k]);
        e._dotBy = from;
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
      if (GM.enrage.lv !== K._enLv) { K._enLv = GM.enrage.lv; K.send({ t: 'en', lv: GM.enrage.lv, d: GM.enrage.dmg, tm: GM.enrage.tm }); }
      if (GM.areaCleared && !K._cleared) { K._cleared = true; K.send({ t: 'clear', boss: GM.stage === 'boss' ? 1 : 0 }); }
      if (GM.bossEngaged && !K._engaged) { K._engaged = true; K.send({ t: 'engage' }); }
    };
    // one foe as a newcomer is told of it
    const esRow = (e) => [e._nid, e.def.id, e.level, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.yaw), Math.round(e.hp), e.maxHp, Math.round(e.shield), e.maxShield, e.elite ? 1 : 0, r2(e.model.scale / (e.elite ? 1.15 : 1)), e.def.name, (e.noReward ? 1 : 0) | (e.noLoot ? 2 : 0) | (e.bossSpawn ? 4 : 0) | (e.cursed ? 8 : 0) | (e.champion ? 16 : 0) | (e.marked ? 32 : 0), e.mut ? e.mutCol || 0xffffff : 0];
    // ---------------- someone joins a run under way (or comes back after losing the connection, with what they carried when last seen) ----------------
    K.saved = {};
    K.handlers.sv = function (m, from) { const rp = K.players.get(from); if (rp) K.saved[rp.name] = m.d; };
    K.lateJoin = function (to, name) {
      K.send({ t: 'late', n: GM.area, kind: GM.stage, seed: GM.seed, diff: G.Run.cur.id, lv: G.Run.cur.lv, fp: K.fingerprint(), fi: K.fpInfo(), route: GM.route, snap: K.saved[name] || null }, to);
    };
    K.handlers.need = function (m, from) { const e = known.get(m.id); if (e && e.alive) K.send({ t: 'es', a: [esRow(e)] }, from); };
    K.handlers.ready = function (m, from) {
      const list = [...known.values()].filter((e) => e.alive).map(esRow);
      if (list.length) K.send({ t: 'es', a: list }, from);
      if (BS.active && !BS.active.dead && K._bs) { K.send(K._bs, from); K._bossLast = []; }
      if (GM.bossEngaged) K.send({ t: 'engage' }, from);
      if (GM.areaCleared) K.send({ t: 'clear', boss: GM.stage === 'boss' ? 1 : 0 }, from);
      K.catchUp(from);
    };
    K.sendEnemies = function () {
      const add = [], snap = [];
      for (const e of E.list) {
        if (e.custom || e.ally || !e.isEnemy || !e.alive) continue;
        // (a foe the game brought back after it was reported gone is simply announced again)
        if (e._nid && !known.has(e._nid)) { known.set(e._nid, e); add.push(esRow(e)); }
        if (!e._nid) {
          e._nid = nextId++; known.set(e._nid, e);
          add.push(esRow(e));
        }
        const fl = (e.burrowed ? 1 : 0) | (e.untargetable ? 2 : 0) | (e.invuln ? 4 : 0) | (e.st.stun > 0 ? 8 : 0) | (e.st.frozen > 0 ? 16 : 0) | (e.state === 'spawn' ? 32 : 0) | (e.model.group.visible ? 0 : 64);
        snap.push([e._nid, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.yaw), Math.round(e.hp), Math.round(e.shield), fl, r2(e.atk || 0), r2(e.wind || 0), r2(e.mv || 0), K.statusBits(e), [e.st.poisonStacks | 0, e.st.frostStacks | 0, e.st.burnLv | 0, e.st.markMul || 0]]);
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
      // the floor that falls away in the last field: only what starts a change is sent, the rest runs on the same clock there
      const scan = (list) => {
        const out = [];
        (list || []).forEach((t, i) => {
          if (t._ns === t.state) return;
          const was = t._ns; t._ns = t.state;
          if (was === undefined && t.state === 'up') return;
          if (t.state === 'warn' || t.state === 'wait' || (t.state === 'up' && was === 'warn')) out.push([i, t.state, r2(t.timer || 0)]);
        });
        return out.length ? out : undefined;
      };
      // the last guardian's set pieces: each is announced once, and runs from its own code on the guests' machines
      if (b.act && b.act.k === 'gravity' && b.act.zones && K._gaSent !== b.act) { K._gaSent = b.act; K.send({ t: 'bg', z: b.act.zones.map(K.vec) }); }
      if (b.constructs) for (const c of b.constructs) if (!c._sent) { c._sent = true; K.send({ t: 'bcn', pi: b.parts.indexOf(c.p), tile: c.tile ? BS.terrain.tiles().indexOf(c.tile) : -1, seg: c.seg ? b.stg.segs.indexOf(c.seg) : -1 }); }
      if (b.holes) for (const h of b.holes) if (!h._sent) { h._sent = true; K.send({ t: 'bhl', c: K.vec(h.c) }); }
      K.send({ t: 'b', pa: b.phase, cs: b.constructs ? b.constructs.map((c) => [b.parts.indexOf(c.p), r2(c.pos.x), r2(c.pos.y), r2(c.pos.z)]) : undefined, hp: Math.round(b.hp), sh: Math.round(b.shield || 0), mxs: Math.round(b.maxShield || 0), pos: K.vec(b.pos), yaw: r2(b.yaw), ph: b.phaseText ? b.phaseText() : '', nodes, parts,
        st: typeof b.state === 'string' ? b.state : '', tl: BS.terrain && G.world.final ? scan(BS.terrain.tiles()) : undefined, sg: b.stg ? scan(b.stg.segs) : undefined });
    };
    function sendObjective() {
      const O = GM.objective; if (!O) return;
      let text = '', sub = '', prog = null, segs = null;
      try { text = O.text ? O.text() : ''; sub = !O.done && O.sub ? O.sub() : ''; segs = O.segs ? O.segs().map((x) => ({ w: x.w, k: r2(x.k), cur: x.cur ? 1 : 0, ticks: x.ticks || 0 })) : null; prog = O.segs ? null : O.progress ? O.progress() : null; } catch (e) { return; }
      const al = O.altars ? O.altars.map((a) => [r2(a.p), a.done ? 1 : 0]) : null;
      const key = text + '|' + sub + '|' + (prog === null ? '' : Math.round(prog * 50)) + JSON.stringify(segs) + JSON.stringify(al);
      if (key === K._objKey) return;
      K._objKey = key;
      K.send({ t: 'o', x: text, s: sub, p: prog, ic: O.icon, sg: segs, al });
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
