'use strict';
// Co-op, the guest's side: the same world from the same seed, your own player as in solo, and the foes and the guardian as puppets of what the host sends.
// A hit is worked out here with your own build (numbers, crits, boons) and the result goes to the host, which owns every foe's health.
(function () {
  const K = G.Coop;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  K.vec = (v) => [r2(v.x), r2(v.y), r2(v.z)];
  // numbers, strings and vectors only: callbacks and object references stay home
  K.plain = function (o) {
    const out = {};
    for (const k in o) {
      const v = o[k];
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') out[k] = v;
      else if (v && v.isVector3) out[k] = { $v: K.vec(v) };
    }
    return out;
  };
  K.unplain = function (o) { const out = {}; for (const k in o) { const v = o[k]; out[k] = v && v.$v ? V(...v.$v) : v; } return out; };
  // a guardian's moving parts, in a fixed order both sides agree on
  K.nodesOf = function (b) { const a = []; b.root.traverse((n) => { if (n !== b.root) a.push(n); }); return [b.root].concat(a); };
  // a kill that gives this machine its own body and coins, but none of the killer's kill effects
  K.makeQuietKill = function (ke) {
    return function (e, info) {
      const C = G.combat, run = G.game.run, B = G.buffs, em = B.emit;
      const s = [run.kills, run.headshots, run.combo, run.lastKillT, run.multi, run.multiT];
      run.multiT = -10;
      B.emit = function (n, a) { if (n !== 'onKill') return em.call(B, n, a); };
      try { ke.call(C, e, Object.assign({}, info, { head: false }), 0); } finally { B.emit = em; [run.kills, run.headshots, run.combo, run.lastKillT, run.multi, run.multiT] = s; }
    };
  };

  K.installGuest = function () {
    const GM = G.game, P = G.player, E = G.enemies, C = G.combat, BS = G.bosses, FX = G.fx;
    K.wrapLevels();
    const reps = new Map();
    let net = false, hits = [], fromHost = false, seed0 = null;
    // ---------------- nothing hostile starts here on its own ----------------
    GM.spawnEnemy = () => null;
    const sp = C.spawnProjectile, zn = C.zone, ex = C.explode;
    C.spawnProjectile = function (o) { if (o.owner === 'enemy' && !net) return Object.assign({}, o, { dead: true }); return sp.call(C, o); };
    C.zone = function (pos, r, dur, kind, dps, opts) { if (opts && opts.enemy && !net) return Object.assign({ pos: pos.clone(), r, dur, t: dur, kind }, opts); return zn.call(C, pos, r, dur, kind, dps, opts); };
    C.explode = function (pos, r, dmg, info) { if (info && info.enemy && !net) return; return ex.call(C, pos, r, dmg, info); };
    const es = E.spawn;
    let spawning = false;
    E.spawn = function (def, level, pos, opts) { const e = es.call(E, def, level, pos, opts); if (!spawning) e._stray = true; return e; };
    G.Tutorial.update = function () {};
    const trap = G.Areas.springTrap;
    G.Areas.springTrap = function (it) { K.send({ t: 'trap', p: K.vec(it.pos) }); return trap.call(G.Areas, it); };
    // the waves stay the host's: the objective is kept for its look and the panel shows what the host says
    function tame() {
      const O = GM.objective;
      if (O && O.waves) { O.tutorial = true; }
    }
    // ---------------- areas ----------------
    const ea = GM.enterArea, sr = GM.startRun;
    GM.enterArea = function (n, kind) {
      if (!fromHost) { K.send({ t: 'gate', n, kind }); return; }
      GM.seed = seed0;
      for (const e of reps.values()) e.alive = false;
      reps.clear();
      if (P.dead) K.rise(P.pos, P.stats.maxHp * 0.5, false);
      if (G.ui.clearScreen && GM.state !== 'playing') G.ui.clearScreen();
      if (G.InvUI.isOpen()) G.InvUI.close && G.InvUI.close();
      ea.call(GM, n, kind);
      tame();
      K._engaged = false; K._areaT = performance.now();
      for (const e of E.list) if (!e.custom && !e._rep) { e.alive = false; e.remove(); e.removed = true; }
    };
    K.handlers.go = function () { K.started(); };
    K.handlers.area = function (m) {
      seed0 = m.seed;
      fromHost = true;
      try {
        if (!GM.run) { if (!K.live) K.started(); G.Run.set(m.diff, m.lv); sr.call(GM, { id: m.diff, lv: m.lv }, 0); }
        else GM.enterArea(m.n, m.kind);
      } finally { fromHost = false; }
      const fp = K.fingerprint();
      K.fpOk = fp === m.fp;
      if (!K.fpOk) { console.error('coop: world differs from the host', fp, m.fp, K.fpInfo(), m.fi); K.fpMsg = `ホストと地形が一致していません（${K.fpInfo()} / ${m.fi}）。両方のページを Ctrl+F5 で再読み込みしてください`; K.msg('⚠ ' + K.fpMsg); K.fail = true; }
    };
    // ---------------- foes ----------------
    function repUpdate(dt) {
      if (this.dying) return this.updateDeath(dt);
      C.updateStatus(this, dt);
      if (!this.alive) return;
      const k = Math.min(1, dt * 12), n = this._n;
      const px = this.pos.x, pz = this.pos.z;
      this.pos.lerp(n.pos, k);
      this.yaw += G.U.wrapAngle(n.yaw - this.yaw) * k;
      const sp2 = Math.hypot(this.pos.x - px, this.pos.z - pz) / (dt || 1);
      this.mv = n.mv || Math.min(1, sp2 / (this.speed || 1));
      this.walk += sp2 * dt * 1.2;
      this.flinch = Math.max(0, this.flinch - dt * 3);
      this.atk = n.atk; this.wind = n.wind;
      this.st.stun = n.fl & 8 ? 1 : 0; this.st.frozen = n.fl & 16 ? 1 : 0;
      this.burrowed = !!(n.fl & 1); this.untargetable = !!(n.fl & 2); this.invuln = !!(n.fl & 4);
      this.model.group.visible = !(n.fl & 64);
      this.animate(dt);
      this.updateHits();
    }
    K.handlers.es = function (m) {
      for (const a of m.a) {
        const [id, did, lvl, x, y, z, yaw, hp, mx, sh, msh, el, sc, name, fl] = a;
        const def = G.ENEMY_BY_ID[did]; if (!def || reps.has(id)) continue;
        spawning = true;
        let e;
        try { e = E.spawn(def, lvl, V(x, y, z), { elite: !!el, scale: sc, noSplit: true, noReward: !!(fl & 1), noLoot: !!(fl & 2) }); } finally { spawning = false; }
        e._rep = true; e._nid = id; e.yaw = yaw; e.hp = hp; e.maxHp = mx; e.shield = sh; e.maxShield = msh;
        e.bossSpawn = !!(fl & 4); e.cursed = !!(fl & 8); e.champion = !!(fl & 16); e.marked = !!(fl & 32);
        if (name !== def.name) e.def = Object.assign({}, e.def, { name });
        e.revived = true; e.eliteMod = null; e.split = false; e.state = 'chase';
        e._n = { pos: V(x, y, z), yaw, atk: 0, wind: 0, mv: 0, fl: 0 };
        e.update = repUpdate;
        e.model.inner.position.y = 0; e.model.group.scale.setScalar(1);
        reps.set(id, e);
      }
    };
    K.handlers.s = function (m) {
      const now = performance.now();
      for (const a of m.e) {
        const e = reps.get(a[0]); if (!e || !e.alive) continue;
        const n = e._n; n.pos.set(a[1], a[2], a[3]); n.yaw = a[4]; n.fl = a[7]; n.atk = a[8]; n.wind = a[9]; n.mv = a[10];
        // your own last hits are ahead of what the host has seen yet
        if (!(e._hitT > now - 400)) { e.hp = a[5]; e.shield = a[6]; }
      }
    };
    K.handlers.ed = function (m) {
      const e = reps.get(m.id); if (!e) return;
      reps.delete(m.id);
      if (!e.alive) return;
      if (m.r) { e.alive = false; e.remove(); return; }
      e.hp = 0; net = true;
      try {
        if (m.k === K.id) ke.call(C, e, e._pk || { src: 'bullet' }, 0);
        else K.quietKill(e, { src: 'bullet' });
      } finally { net = false; }
    };
    // ---------------- your hits ----------------
    const dm = C.damageEnemy, ke = C.killEnemy, st0 = C.status, stun0 = C.stun;
    K.quietKill = K.makeQuietKill(ke);
    const remoteOf = (e) => e && (e._rep || (e.boss && e._nid));
    C.damageEnemy = function (e, amount, info) {
      if (!remoteOf(e)) return dm.call(C, e, amount, info);
      const h0 = e.hp, s0 = e.shield || 0;
      const r = dm.call(C, e, amount, info);
      const dh = h0 - e.hp, ds = s0 - (e.shield || 0);
      if (dh > 0 || ds > 0) { e._hitT = performance.now(); e._pk = info || e._pk; pushHit(e, dh, ds); }
      if (e.hp <= 0 && e.alive) e.hp = 1;
      return r;
    };
    function pushHit(e, dh, ds, cc, kn) { hits.push([e._nid, r2(Math.max(0, dh)), r2(Math.max(0, ds)), cc || 0, kn || 0]); }
    C.killEnemy = function (e, info, ov) {
      if (!net && remoteOf(e) && !(info && info.src === 'clear')) { if (e.alive) e.hp = Math.max(1, e.hp); return; }
      return ke.call(C, e, info, ov);
    };
    // a freeze and a stun must stop the real foe: they travel with the hits
    C.status = function (e, kind, stacks) { const r = st0.call(C, e, kind, stacks); if (kind === 'frost' && remoteOf(e)) pushHit(e, 0, 0, 1); return r; };
    C.stun = function (e, t) { const r = stun0.call(C, e, t); if (remoteOf(e)) pushHit(e, 0, 0, 1 + t); return r; };
    // ---------------- what comes down the wire and hurts ----------------
    K.handlers.dmg = function (m) {
      C.damagePlayer(m.a, { src: m.s, elem: m.e, fixed: !!m.f, pos: m.p ? V(...m.p) : null });
      if (m.n && P.dead) GM.lastCause = m.n;
    };
    K.handlers.kick = function (m) { P.vel.x += m.v[0]; P.vel.y += m.v[1]; P.vel.z += m.v[2]; };
    const wrapNet = (fn) => { net = true; try { fn(); } finally { net = false; } };
    K.handlers.pj = function (m) { const o = K.unplain(m.o); if (!o.pos || !o.vel) return; wrapNet(() => C.spawnProjectile(o)); };
    K.handlers.zn = function (m) { const [p, r, dur, kind, dps] = m.a; wrapNet(() => C.zone(V(...p), r, dur, kind, dps, K.unplain(m.o))); };
    K.handlers.bm = function (m) {
      const [p, r, dmg] = m.a, o = K.unplain(m.o);
      if (m.h) wrapNet(() => C.explode(V(...p), r, dmg, o));
      else { const q = V(...p); G.fx.explosion(q, r, o.color || 0xff9a40); G.sfx.explosion(q, r / 4); }
    };
    K.handlers.tg = function (m) { const [p, r, dur, col] = m.a; FX.telegraph(V(...p), r, dur, col); };
    K.handlers.tl = function (m) { const [a, b, w, dur, col] = m.a; FX.teleLine(V(...a), V(...b), w, dur, col); };
    // ---------------- the state of the area ----------------
    K.handlers.o = function (m) {
      const O = GM.objective; if (!O) return;
      if (GM.bossEngaged) return;
      O.text = () => m.x; O.sub = m.s ? () => m.s : null; if (m.ic) O.icon = m.ic;
      O.segs = null; if (m.p !== null && m.p !== undefined) O.progress = () => m.p;
    };
    K.handlers.clear = function (m) { if (!GM.areaCleared) GM.clearArea(m.boss ? { boss: true } : {}); };
    K.handlers.engage = function () {
      const w = G.world;
      if (GM.bossEngaged || P.dead || !w.arenaCenter) return;
      P.pos.z = (w.ledgeZ ? w.ledgeZ : w.arenaD) - 4; P.pos.x = w.arenaCenter.x; P.vel.set(0, 0, 0);
      K.msg('仲間が守護者の間へ入った');
    };
    K.handlers.wipe = function () { K.ended('全滅', `エリア ${GM.area} で倒れた`); };
    const vic = GM.victory;
    GM.victory = function () { const was = GM.won; vic.call(GM); if (!was && GM.won) K.send({ t: 'won' }); };
    K.handlers.won = function () { vic.call(GM); };
    // ---------------- the guardian as a puppet ----------------
    const bs = BS.start, bu = BS.update;
    BS.start = function () { return undefined; };
    K.handlers.bstart = function (m) {
      const b = K.seeded(m.seed, () => bs.call(BS, m.id, m.level, G.world));
      b.maxHp = m.mx; b.hp = m.hp;
      b.parts.forEach((p, i) => { p._nid = -(i + 1); });
      K.bossNodes = K.nodesOf(b);
      K._pose = K.bossNodes.map(() => null);
      if (K.bossNodes.length !== m.n) console.error('coop: guardian differs from the host', K.bossNodes.length, m.n);
      if (!GM.bossEngaged) K.handlers.engage();
    };
    K.handlers.b = function (m) {
      const b = BS.active; if (!b || b.dead || !K._pose) return;
      const now = performance.now();
      if (!(b._hitT > now - 400)) b.hp = m.hp;
      b.shield = m.sh; b.maxShield = m.mxs; b.pos.set(...m.pos); b.yaw = m.yaw; b._ph = m.ph;
      for (const a of m.nodes) K._pose[a[0]] = a;
      b.parts.forEach((p, i) => {
        const s = m.parts[i]; if (!s) return;
        p.alive = !!s[0]; p.untargetable = !!s[1]; const inv = !!s[2]; p.isInvuln = () => inv; p.invuln = false;
        if (p.shield !== undefined) p.shield = s[5];
        if (Object.getOwnPropertyDescriptor(p, 'hp').writable) { p.hp = s[3]; p.maxHp = s[4]; }
      });
    };
    K.handlers.bdead = function () { const b = BS.active; if (b && !b.dead) { b.hp = 0; b.kill(); } };
    function puppet(dt) {
      const b = BS.active, k = Math.min(1, dt * 14);
      const q = new THREE.Quaternion(), T = V();
      K.bossNodes.forEach((n, i) => {
        const a = K._pose[i]; if (!a) return;
        T.set(a[1], a[2], a[3]); n.position.lerp(T, k);
        q.set(a[4] / 1000, a[5] / 1000, a[6] / 1000, a[7] / 1000).normalize(); n.quaternion.slerp(q, k);
        n.visible = !!a[8]; n.scale.setScalar === undefined || (Math.abs(n.scale.x - a[9]) > 0.001 && n.scale.multiplyScalar(a[9] / (n.scale.x || 1)));
      });
      b.updateHits();
      b.bar();
    }
    BS.update = function (dt) {
      const b = BS.active; if (!b) return;
      if (b.dead) return bu.call(BS, dt);
      puppet(dt);
    };
    // ---------------- once per net beat ----------------
    K.onNet = function () {
      if (hits.length) { K.send({ t: 'hit', h: hits }); hits = []; }
      if (!GM.run || !G.world) return;
      if (GM.bossEngaged && !K._engaged) { K._engaged = true; K.send({ t: 'engage' }); }
      for (const e of E.list) if (e._stray) { e._stray = false; e.alive = false; e.remove(); e.removed = true; }
    };
  };

  // sent on to everyone but the one it came from (the host is the hub)
  K.relay = function (m, from) { for (const id of K.players.keys()) if (id && id !== from) K.net.send(id, m); };
})();
