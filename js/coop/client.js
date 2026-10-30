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
    C.explode = function (pos, r, dmg, info) { if (info && info.enemy && !net && !info.pjx) return; return ex.call(C, pos, r, dmg, info); };
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
      // joining a run under way: the first area is the one the others are in
      if (K.late) { n = K.late.n; kind = K.late.kind; GM.route = (K.late.route || []).slice(0, -1); K.late = null; }
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
    K.handlers.late = function (m) {
      K.late = m; seed0 = m.seed; fromHost = true;
      try { K.started(); G.Run.set(m.diff, m.lv); sr.call(GM, { id: m.diff, lv: m.lv }, 0); } finally { fromHost = false; }
      if (m.snap) {
        GM.applyPlayerSnap(m.snap);
        if (m.snap.coins !== undefined) GM.run.coins = m.snap.coins;
        G.weapons.dirty = true; G.weapons.equip(true); G.ui.refreshWeapon(); G.ui.refreshItems();
        K.msg('🔗 復帰した — 持ち物は最後の状態に戻っている');
      }
      const fp = K.fingerprint();
      K.fpOk = fp === m.fp;
      K.send({ t: 'ready' });
    };
    // what you carry goes to the host now and then: if your connection drops, you come back with it
    const saveMe = () => { if (GM.run && !P.dead) K.send({ t: 'sv', d: Object.assign(GM.playerSnap(), { coins: GM.run.coins }) }); };
    setInterval(() => { if (K.live) saveMe(); }, 20000);
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
      K.mirrorStatus(this, n, dt);
      this.burrowed = !!(n.fl & 1); this.untargetable = !!(n.fl & 2); this.invuln = !!(n.fl & 4);
      this.model.group.visible = !(n.fl & 64);
      this.animate(dt);
      this.updateHits();
    }
    // The host's statuses are what a foe really has: they are shown from its snapshots (and tick there). A status you put on it yourself shows at once and is
    // sent to the host (C.status / C.stun below); nothing ticks damage here, so one burn is never counted twice.
    const SB = ['burn', 'poison', 'bleed', 'frozen', 'frost', 'shock', 'stun', 'slow', 'root', 'fear', 'mark'];
    K.mirrorStatus = function (e, n, dt) {
      const s = e.st, mine = e._ssT > performance.now() - 600;
      SB.forEach((k, i) => {
        if (n.sb & (1 << i)) s[k] = Math.max(s[k] || 0, 0.5);
        else if (!mine && s[k] > 0) s[k] = 0;
        else if (s[k] > 0) s[k] -= dt;
      });
      if (n.sx) { s.poisonStacks = n.sx[0]; s.frostStacks = n.sx[1]; s.burnLv = n.sx[2]; s.markMul = n.sx[3] || s.markMul; s.bleedLv = 1; s.shockLv = 1; }
      // the particles of each (the damage that goes with them is the host's)
      const c = e.centerPos(), R = Math.random;
      if (s.burn > 0 && R() < dt * 14) G.fx.flameLick(e.pos.x + U.rand(-0.3, 0.3), e.pos.y + e.height * U.rand(0.2, 0.8), e.pos.z + U.rand(-0.3, 0.3), 0.8);
      if (s.poison > 0 && R() < dt * 5) G.fx.norm.spawn(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z, U.rand(-0.3, 0.3), -0.5, U.rand(-0.3, 0.3), 0.8, 0.12, 0.3, 0.4, 0.8, 0.1, 0.7, 0, 0);
      if (s.bleed > 0 && R() < dt * 6) G.fx.blood(c, null, e.bloodColor, 1);
      if (s.shock > 0 && R() < dt * 8) G.fx.sparks(c, null, 2, 0xfff0a0, 3);
    };
    const U = G.U;
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
        if (e.cursed && e.makeCurseRing) e.makeCurseRing(0x9a30ff);
        if (e.champion && e.makeCurseRing) e.makeCurseRing(0xff3018);
        if (e.marked && e.markTarget) e.markTarget(e.champion);
        if (a[15] && e.makeCurseRing) e.makeCurseRing(a[15]);
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
        const n = e._n; n.pos.set(a[1], a[2], a[3]); n.yaw = a[4]; n.fl = a[7]; n.atk = a[8]; n.wind = a[9]; n.mv = a[10]; n.sb = a[11] | 0; n.sx = a[12];
        // your own last hits are ahead of what the host has seen yet
        if (!(e._hitT > now - 400)) { if (a[5] < e.hp - 0.5) { e.lastHitT = GM.time; e.flinch = Math.min(1, e.flinch + 0.2); } e.hp = a[5]; e.shield = a[6]; }
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
      // a blow that throws the foe back must throw the real one
      let kn = 0;
      if (info && info.knock && !e.boss) { const d = info.dir || e.pos.clone().sub(P.pos).setY(0).normalize(); kn = [r2(d.x), r2(d.z), r2(info.knock)]; }
      if (dh > 0 || ds > 0) { e._hitT = performance.now(); e._pk = info || e._pk; pushHit(e, dh, ds, kn); }
      // (the real kill is the host's: until its word comes the foe stands at 1)
      if (e.hp <= 0 && e.alive) e.hp = 1;
      return r;
    };
    function pushHit(e, dh, ds, kn) { hits.push([e._nid, r2(Math.max(0, dh)), r2(Math.max(0, ds)), kn || 0]); }
    C.killEnemy = function (e, info, ov) {
      if (!net && remoteOf(e) && !(info && info.src === 'clear')) return; // (health is read back by C.damageEnemy above, after this: clamping it here would swallow the blow that kills)
      return ke.call(C, e, info, ov);
    };
    // a status you put on a foe is worked out here with your build, then handed to the host in full (it ticks the damage there)
    const SS = ['burn', 'burnPow', 'burnLv', 'burnDps', 'poison', 'poisonPow', 'poisonStacks', 'bleed', 'bleedDps', 'bleedLv', 'frost', 'frostStacks', 'frozen', 'shock', 'shockLv', 'stun', 'slow', 'root', 'fear', 'mark', 'markMul', 'markKillReset'];
    const ssOut = new Map();
    const sendStatus = (e) => { e._ssT = performance.now(); const o = {}; for (const k of SS) if (e.st[k]) o[k] = e.st[k] === true ? 1 : +(+e.st[k]).toFixed(2); ssOut.set(e._nid, o); };
    C.status = function (e, kind, stacks) { const r = st0.call(C, e, kind, stacks); if (remoteOf(e)) sendStatus(e); return r; };
    C.stun = function (e, t) { const r = stun0.call(C, e, t); if (remoteOf(e)) sendStatus(e); return r; };
    K.flushStatus = function () { if (ssOut.size) { K.send({ t: 'ss', a: [...ssOut] }); ssOut.clear(); } };
    // ---------------- what comes down the wire and hurts ----------------
    K.handlers.dmg = function (m) {
      C.damagePlayer(m.a, { src: m.s, elem: m.e, fixed: !!m.f, pos: m.p ? V(...m.p) : null });
      if (m.n && P.dead) GM.lastCause = m.n;
    };
    K.handlers.kick = function (m) { P.vel.x += m.v[0]; P.vel.y += m.v[1]; P.vel.z += m.v[2]; };
    // what a foe did to you besides the damage: grabs, pulls, slows, being thrown off a grapple
    K.handlers.pfx = function (m) {
      const o = m.o;
      for (const k of ['dragT', 'pullT', 'pullSpd', 'gravFreeAt', 'mirTip']) if (k in o) P[k] = o[k];
      if ('invulnT' in o) P.invulnT = Math.max(P.invulnT || 0, o.invulnT || 0);
      if (o.slow) P.st.slow = Math.max(P.st.slow || 0, o.slow);
      if (o.shock) P.st.shock = Math.max(P.st.shock || 0, o.shock);
      if (o.gr) P.grapple.state = 'none';
      if (o.pile) P.pileState = null;
      if (o.pd) P.pullDir = V(...o.pd);
      if (o.pullT > 0 && !P.pullDir) P.pullT = 0;
      if (o.dp) { P.pos.x += o.dp[0]; P.pos.y += o.dp[1]; P.pos.z += o.dp[2]; G.world.depenetrate(P.pos, P.hw, P.height); }
    };
    const wrapNet = (fn) => { net = true; try { fn(); } finally { net = false; } };
    K.handlers.pj = function (m) { const o = K.unplain(m.o); if (!o.pos || !o.vel) return; if (o.explode) o.info = { pjx: 1 }; wrapNet(() => C.spawnProjectile(o)); };
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
    // a fight that drags on grows frantic for everyone (the host keeps the clock)
    K.handlers.en = function (m) { const E0 = GM.enrage; if (m.lv > E0.lv) G.ui.toast(`🔥 戦いが長引いている — 敵が激化した（激化 Lv${m.lv}）`, 'warn'); E0.lv = m.lv; E0.dmg = m.d; E0.tm = m.tm; };
    K.handlers.clear = function (m) { if (!GM.areaCleared) GM.clearArea(m.boss ? { boss: true } : {}); };
    K.handlers.engage = function () {
      const w = G.world;
      if (GM.bossEngaged || P.dead || !w.arenaCenter) return;
      P.pos.z = (w.ledgeZ ? w.ledgeZ : w.arenaD) - 4; P.pos.x = w.arenaCenter.x; P.vel.set(0, 0, 0);
      K.msg('仲間が守護者の間へ入った');
    };
    K.handlers.wipe = function () { K.ended('全滅', `エリア ${GM.area} で倒れた`); };
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
      // the last guardian's second form: the same set piece runs here (the fall of the crown, the climb to the sky floor), carried by its own code
      if (m.st === 'transform' && b.state !== 'transform' && !b._bT && b.beginTransform) { b._bT = true; b.beginTransform(); }
      if (m.tl) for (const [i, s, tm] of m.tl) applyFloor(BS.terrain.tiles()[i], s, tm, -0.5);
      if (m.sg && b.stg) for (const [i, s, tm] of m.sg) applyFloor(b.stg.segs[i], s, tm, 0);
      for (const a of m.nodes) K._pose[a[0]] = a;
      b.parts.forEach((p, i) => {
        const s = m.parts[i]; if (!s) return;
        p.alive = !!s[0]; p.untargetable = !!s[1]; const inv = !!s[2]; p.isInvuln = () => inv; p.invuln = false;
        if (p.shield !== undefined) p.shield = s[5];
        if (Object.getOwnPropertyDescriptor(p, 'hp').writable) { p.hp = s[3]; p.maxHp = s[4]; }
      });
    };
    K.handlers.bdead = function () { const b = BS.active; if (b && !b.dead) { b.hp = 0; b.kill(); } };
    function applyFloor(t, s, tm, y0) {
      if (!t) return;
      if (s === 'warn') { t.state = 'warn'; t.warn = t.timer = Math.max(0.1, tm); t.rot = t.rot || 1; }
      else if (s === 'wait') { t.state = 'wait'; t.timer = tm; }
      else if (s === 'up') { t.state = 'up'; t.dy = 0; t.mesh.visible = true; t.mesh.position.y = y0; t.mesh.material.emissive.setRGB(0, 0, 0); if (t.col) t.col.alive = true; for (const c of t.cols || []) c.alive = true; }
    }
    function puppet(dt) {
      const b = BS.active, k = Math.min(1, dt * 14);
      if (b.state === 'transform' && b.updateTransform) { try { b.trT = b.trT || 0; b.updateTransform(dt); } catch (e) { console.error(e); } }
      if (G.world.final && G.world.tiles && BS.terrain) BS.terrain.update(dt);
      if (b.stage2 && b.segTick) { try { b.segTick(dt); } catch (e) { console.error(e); } }
      if (b.stg && b.stg.stars) { b.stg.stars.position.copy(G.camera.position); b.stg.spin.rotation.y += dt * 0.05; }
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
      K.flushStatus();
      if (!GM.run || !G.world) return;
      if (GM.bossEngaged && !K._engaged) { K._engaged = true; K.send({ t: 'engage' }); }
      for (const e of E.list) if (e._stray) { e._stray = false; e.alive = false; e.remove(); e.removed = true; }
    };
  };

  // sent on to everyone but the one it came from (the host is the hub)
  K.relay = function (m, from) { for (const id of K.players.keys()) if (id && id !== from) K.net.send(id, m); };
})();
