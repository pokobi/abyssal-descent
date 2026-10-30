'use strict';
// Co-op: what one player does with skills, ultimates and throwables is seen by the others.
//  - the big effects (explosions, rings, flashes, beams, lightning, bubbles, smoke) made by your own actions are replayed on their screens;
//  - your projectiles (grenades, rockets, arrows, orbs ...) fly on their screens too, as pictures only: the damage is worked out where they are thrown;
//  - zones and ultimate auras you leave on the ground are drawn on their screens (their damage is yours);
//  - a grenade that goes off beside someone else's character hurts them as it would hurt its thrower (a fifth of its damage).
(function () {
  const K = G.Coop;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const U = G.U;
  const r2 = (v) => Math.round(v * 100) / 100;

  K.installFx = function () {
    const C = G.combat, FX = G.fx, A = G.abilities, P = G.player, GM = G.game;
    K.own = 0;
    const own = () => K.live && !K._fxNet && !K._noMirror && (K.own > 0 || !!C.curSk);
    const withOwn = (fn) => function () { K.own++; try { return fn.apply(this, arguments); } finally { K.own--; } };
    const enc = (v) => {
      if (v && v.isVector3) return { $v: [r2(v.x), r2(v.y), r2(v.z)] };
      if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
      if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return K.plain(v);
      return null;
    };
    const dec = (v) => (v && v.$v ? V(...v.$v) : v && typeof v === 'object' ? K.unplain(v) : v);
    const q = [];
    const push = (m) => { if (q.length < 60) q.push(m); };

    // ---------------- effects ----------------
    for (const fn of ['explosion', 'ring', 'flash', 'beam', 'lightning', 'bubble', 'smoke', 'fireBurst', 'dust', 'sparks']) {
      const f = FX[fn];
      FX[fn] = function () {
        if (own()) push(['f', fn, Array.prototype.map.call(arguments, enc)]);
        return f.apply(FX, arguments);
      };
    }
    // sounds go the same way, a few at a time: skills, the guardian's attacks, and on the host the foes' growls and swings (the guests' foes are puppets and make none)
    let sndN = 0;
    for (const fn of ['monster', 'magic', 'whoosh', 'attackWind', 'rumble', 'mech', 'shieldBreak', 'thunder', 'bell', 'chain', 'zap', 'fire', 'stoneGrind', 'swing', 'impact', 'spit', 'ice']) {
      const f = G.sfx[fn]; if (!f) continue;
      G.sfx[fn] = function () {
        if ((own() || (K.ownS > 0 && !K._fxNet)) && sndN < 10) { sndN++; push(['s', fn, Array.prototype.map.call(arguments, enc)]); }
        return f.apply(G.sfx, arguments);
      };
    }
    // what the guardian does happens only on the host: its effects are sent, as for a skill (its fall and the last guardian's change of form run on every machine)
    const bu = G.bosses.update;
    G.bosses.update = function (dt) {
      const b = G.bosses.active;
      if (!(K.role === 'host' && K.live && b && !b.dead && b.state !== 'transform')) return bu.call(G.bosses, dt);
      K.own++; try { return bu.call(G.bosses, dt); } finally { K.own--; }
    };
    if (K.role === 'host') {
      const Ep = G.enemies.Enemy.prototype, up = Ep.update;
      Ep.update = function (dt) { K.ownS = (K.ownS || 0) + 1; try { return up.call(this, dt); } finally { K.ownS--; } };
    }
    // ---------------- throwables and skills: the scopes that are not skills ----------------
    A.releaseGrenade = withOwn(A.releaseGrenade);
    A.grenadeEffect = withOwn(A.grenadeEffect);
    A.applyItem = withOwn(A.applyItem);
    A.summonSkeleton = withOwn(A.summonSkeleton);

    // ---------------- projectiles ----------------
    const PJ = ['kind', 'look', 'grav', 'life', 'radius', 'fuse', 'bounce', 'sticky', 'explode'];
    const sp = C.spawnProjectile;
    C.spawnProjectile = function (o) {
      const p = sp.call(C, o);
      if (K.live && !K._pjNet && o.owner === 'player' && !o.mine && o.pos && o.vel) {
        const m = { pos: enc(o.pos), vel: enc(o.vel), who: K.id };
        for (const k of PJ) if (o[k] !== undefined && typeof o[k] !== 'function' && typeof o[k] !== 'object') m[k] = o[k];
        push(['p', m]);
      }
      return p;
    };
    const putProjectile = (m) => {
      const o = { owner: 'remote', dmg: 0, info: { src: 'explosion', remoteViz: true }, pos: V(...m.pos.$v), vel: V(...m.vel.$v) };
      for (const k of PJ) if (m[k] !== undefined) o[k] = m[k];
      o.life = Math.min(o.life || 6, 8);
      K._pjNet = true;
      try { sp.call(C, o); } finally { K._pjNet = false; }
    };
    // ---------------- explosions ----------------
    const ex = C.explode;
    C.explode = function (pos, r, dmg, info) {
      if (info && info.remoteViz) return; // a picture of someone else's shot: the real blast is theirs
      if (!K.live) return ex.call(C, pos, r, dmg, info);
      // (a foe's blast is sent on its own: not twice)
      if (info && info.enemy) { K._noMirror = (K._noMirror || 0) + 1; try { return ex.call(C, pos, r, dmg, info); } finally { K._noMirror--; } }
      K.own++;
      try {
        if (info && info.grenade && !info.isCluster && !info.noSelf) push(['x', { p: K.vec(pos), r: r2(r * (1 + P.stats.explosionRadius)), d: r2(dmg), who: K.id }]);
        return ex.call(C, pos, r, dmg, info);
      } finally { K.own--; }
    };
    // a grenade of someone else: a fifth of its damage, as for its own thrower
    const friendly = (m) => {
      if (P.dead || GM.state === 'dead' || !G.world) return;
      const d = P.pos.distanceTo(V(...m.p));
      if (d < m.r) C.damagePlayer(m.d * 0.2 / ((C.ENEMY_DMG || 1) * Math.max(0.1, 1 + P.stats.enemyDmg)), { src: 'explosion', pos: V(...m.p) });
    };

    // a decoy draws the foes, whoever set it down (the foes are the host's)
    const ad = C.addDecoy;
    C.addDecoy = function (pos, dur, x) {
      const r = ad.call(C, pos, dur, x);
      if (K.live && !K._net) push(['d', { p: K.vec(pos), dur: r2(dur) }]);
      return r;
    };
    // ---------------- zones ----------------
    const zn = C.zone, vz = [];
    C.zone = function (pos, r, dur, kind, dps, opts) {
      const z = zn.call(C, pos, r, dur, kind, dps, opts);
      if (K.live && !(opts && opts.enemy) && !K._net) push(['z', { p: K.vec(pos), r: r2(r), dur: r2(dur), k: kind, who: K.id, fol: opts && opts.follow ? 1 : 0, hps: (opts && opts.hps) || 0 }]);
      return z;
    };
    const zoneVisual = (z, dt) => {
      const p = z.pos, r = z.r, k = Math.min(1, (z.dur - z.t) * 2), R = Math.random;
      const rnd = () => { const a = R() * 6.28, d = Math.sqrt(R()) * r; return [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d]; };
      switch (z.kind) {
        case 'fire': for (let n = 0; n < r * r * dt * 6 * k; n++) { const [x, zz] = rnd(); FX.flameLick(x, p.y + 0.05, zz, 1.4 + R()); } break;
        case 'poison': case 'acid': if (R() < dt * r * 4) { const [x, zz] = rnd(); FX.norm.spawn(x, p.y + 0.3, zz, 0, 0.3, 0, 1.6, 0.6, 2.2, 0.35, 0.5, 0.12, 0.35 * k, -0.05, 0.5); } break;
        case 'smoke': if (R() < dt * r * 6) { const [x, zz] = rnd(); FX.norm.spawn(x, p.y + 0.5, zz, 0, 0.2, 0, 2.5, 1.5, 4, 0.5, 0.5, 0.5, 0.6 * k, -0.02, 0.3); } break;
        case 'heal': case 'holy': if (R() < dt * 14) { const [x, zz] = rnd(); FX.add.spawn(x, p.y + 0.1, zz, 0, 1.2, 0, 1.0, 0.12, 0.02, 0.4, 1.0, 0.5, 0.8, -0.3, 0.5); } break;
        case 'frost': if (R() < dt * r * 5) { const [x, zz] = rnd(); FX.norm.spawn(x, p.y + 0.2, zz, 0, 0.3, 0, 1.4, 0.4, 1.6, 0.8, 0.9, 1.0, 0.3 * k, -0.05, 0.5); } break;
        case 'gravity': for (let n = 0; n < 3; n++) { const a = R() * 6.28, d = r * (0.6 + R() * 0.4); FX.add.spawn(p.x + Math.cos(a) * d, p.y + 0.5 + R() * 2, p.z + Math.sin(a) * d, -Math.cos(a) * d * 2, 0, -Math.sin(a) * d * 2, 0.5, 0.1, 0.02, 0.6, 0.3, 1.0, 0.9, 0, 1); } break;
        case 'arrowrain': if (R() < dt * 30) { const [x, zz] = rnd(); FX.tracer(V(x + 1, p.y + 10, zz), V(x, p.y, zz), 0xcfc0a0, 0.02, 0.12); } break;
        case 'grasp': if (R() < dt * 10) { const [x, zz] = rnd(); FX.norm.spawn(x, p.y + 0.1, zz, 0, 1.5, 0, 0.8, 0.3, 0.1, 0.08, 0.02, 0.1, 0.8, 0, 1); } break;
        default: break;
      }
    };

    // ---------------- ultimate auras ----------------
    const sentAura = new WeakSet(), vAuras = [];
    let auraT = 0;
    const scanAuras = () => {
      for (const a of A.auras) {
        if (sentAura.has(a)) continue;
        sentAura.add(a);
        const m = { id: Math.random().toString(36).slice(2, 8), k: a.kind, t: r2(a.t), r: r2(a.r || 3), col: a.col || 0, fol: a.follow ? 1 : 0, who: K.id, heal: a.heal || 0 };
        if (a.c) m.c = K.vec(a.c);
        if (a.pt) m.pt = K.vec(a.pt);
        a._cid = m.id;
        push(['a', m]);
      }
      auraT -= 0.1;
    };
    const beamUpdates = () => {
      for (const a of A.auras) if (a.kind === 'beam' && a._cid) push(['b', { id: a._cid, pt: K.vec(a.pt) }]);
    };
    const auraVisual = (a, dt) => {
      const rp = K.players.get(a.who), c = a.fol && rp ? rp.pos : a.c ? a.c : rp ? rp.pos : P.pos, R = Math.random;
      if (a.k === 'fire' && R() < dt * 40) { const an = R() * 6.28, d = R() * a.r; FX.flameLick(c.x + Math.cos(an) * d, c.y + 0.1, c.z + Math.sin(an) * d, 1.6, a.col); }
      else if (a.k === 'drain' && R() < dt * 20) FX.norm.spawn(c.x + U.rand(-a.r, a.r), c.y + U.rand(0.3, 2), c.z + U.rand(-a.r, a.r), 0, 0.5, 0, 0.8, 0.12, 0.25, 0.7, 0.05, 0.1, 0.8, 0, 1);
      else if (a.k === 'beam' && a.pt) FX.beam(a.pt.clone().add(V(0, 40, 0)), a.pt.clone().setY(a.pt.y + 0.1), 0xfff0c0, a.r * 0.4, 0.05);
      else if (a.k === 'holy') {
        if (!a.ring) { a.ring = new THREE.Mesh(new THREE.RingGeometry(a.r - 0.3, a.r, 48), new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); a.ring.rotation.x = -Math.PI / 2; G.scene.add(a.ring); }
        a.ring.position.set(c.x, c.y + 0.05, c.z); a.ring.material.opacity = 0.45 + 0.15 * Math.sin(a.age * 4);
        if (R() < dt * 12) FX.add.spawn(c.x + U.rand(-a.r, a.r), c.y + 0.1, c.z + U.rand(-a.r, a.r), 0, 1.4, 0, 1, 0.12, 0.02, 1.2, 1.0, 0.5, 0.8, -0.3, 0.5);
        // the sanctuary heals everyone inside it
        if (a.heal && !P.dead && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < a.r) C.heal(P.stats.maxHp * a.heal * dt, true);
      } else if (a.k === 'stomp') { a.tick = (a.tick || 0) - dt; if (a.tick <= 0) { a.tick = 1.5; FX.ring(c.clone(), a.r, 0xffb060, 0.5); } }
    };

    // ---------------- allies and mines: pictures on the others' screens ----------------
    const myAllies = [], theirAllies = new Map(), theirMines = new Map();
    const bm = G.enemies.buildModel;
    G.enemies.buildModel = function (def, opts) {
      const m = bm.call(G.enemies, def, opts);
      if (K.live && opts && opts.ally && !K._net) myAllies.push({ m, id: K.id + '-' + Math.random().toString(36).slice(2, 7), did: def.id, walk: 0, lp: m.group.position.clone() });
      return m;
    };
    const sendAllies = () => {
      for (let i = myAllies.length - 1; i >= 0; i--) {
        const a = myAllies[i], g = a.m.group;
        if (!g.parent) { myAllies.splice(i, 1); push(['ax', a.id]); continue; }
        push(['al', { id: a.id, d: a.did, p: K.vec(g.position), y: r2(g.rotation.y) }]);
      }
      const seen = new Set();
      for (const m of C.mines) {
        if (!m._mid) { m._mid = K.id + '-' + Math.random().toString(36).slice(2, 7); push(['mn', { id: m._mid, p: K.vec(m.pos) }]); }
        seen.add(m._mid);
      }
      for (const id of K._myM || []) if (!seen.has(id)) push(['mx', id]);
      K._myM = seen;
    };
    const putAlly = (a) => {
      let t = theirAllies.get(a.id);
      if (!t) {
        const def = G.ENEMY_BY_ID[a.d]; if (!def) return;
        K._net = true; let m; try { m = bm.call(G.enemies, def, { ally: true }); } finally { K._net = false; }
        G.scene.add(m.group); t = { m, walk: 0, to: V(...a.p), yaw: a.y, seen: 0 }; m.group.position.copy(t.to); theirAllies.set(a.id, t);
      }
      t.to.set(...a.p); t.yaw = a.y; t.seen = 0;
    };
    const dropAlly = (id) => { const t = theirAllies.get(id); if (t) { G.scene.remove(t.m.group); theirAllies.delete(id); } };
    const mineMesh = () => { const m = new THREE.Mesh(G.Props.PG.cyl, new THREE.MeshStandardMaterial({ color: 0x3a3c40, emissive: 0x401008, roughness: 0.5 })); m.scale.set(0.2, 0.06, 0.2); return m; };
    const tickViz = (dt) => {
      for (const [id, t] of theirAllies) {
        t.seen += dt; if (t.seen > 1.2) { dropAlly(id); continue; }
        const g = t.m.group, px = g.position.x, pz = g.position.z;
        g.position.lerp(t.to, Math.min(1, dt * 12)); g.rotation.y = t.yaw;
        const sp = Math.hypot(g.position.x - px, g.position.z - pz) / (dt || 1);
        t.walk += sp > 0.3 ? dt * 9 : 0;
        if (t.m.animate) t.m.animate({ walk: t.walk, moving: sp > 0.3, atk: 0, t: GM.time, flinch: 0, state: 'chase' });
      }
    };

    // ---------------- sending and receiving ----------------
    const base = K.onFrame;
    let sendT = 0;
    K.onFrame = function (dt) {
      if (base) base(dt);
      if (!K.live) return;
      sendT -= dt;
      sndN = 0;
      scanAuras();
      // time slowed or stopped by a guest's ultimate must slow the real foes: the host is told
      if (K.role === 'guest' && GM.chronoT > 0 && !(K._chT > 0)) K.send({ t: 'cr', d: r2(GM.chronoT), s: GM.chronoSlow });
      K._chT = GM.chronoT;
      if (sendT <= 0) {
        sendT = 0.05;
        if (A.auras.some((a) => a.kind === 'beam')) { K._bT = (K._bT || 0) + 1; if (K._bT % 3 === 0) beamUpdates(); }
        K._alT = (K._alT || 0) + 1; if (K._alT % 2 === 0) sendAllies();
        if (q.length) { K.send({ t: 'fx', e: q.splice(0, 60) }); }
      }
      tickViz(dt);
      for (let i = vz.length - 1; i >= 0; i--) {
        const z = vz[i]; z.t += dt;
        const rp = K.players.get(z.who); if (z.fol && rp) z.pos.copy(rp.pos);
        zoneVisual(z, dt);
        // a healing field heals whoever stands in it
        if (z.hps && !P.dead && Math.hypot(P.pos.x - z.pos.x, P.pos.z - z.pos.z) < z.r) C.heal(z.hps * dt, true);
        if (z.t >= z.dur) vz.splice(i, 1);
      }
      for (let i = vAuras.length - 1; i >= 0; i--) {
        const a = vAuras[i]; a.t -= dt; a.age += dt;
        auraVisual(a, dt);
        if (a.t <= 0) { if (a.ring) G.scene.remove(a.ring); vAuras.splice(i, 1); }
      }
    };
    K.handlers.fx = function (m, from) {
      for (const [kind, a, b] of m.e) {
        try {
          if (kind === 'f') { K._fxNet = true; try { FX[a](...b.map(dec)); } finally { K._fxNet = false; } if (a === 'explosion' && b[0] && b[0].$v) G.sfx.explosion(V(...b[0].$v), (b[1] || 4) / 4); }
          else if (kind === 's') { K._fxNet = true; try { G.sfx[a](...b.map(dec)); } finally { K._fxNet = false; } }
          else if (kind === 'p') putProjectile(a);
          else if (kind === 'x') friendly(a);
          else if (kind === 'al') putAlly(a);
          else if (kind === 'ax') dropAlly(a);
          else if (kind === 'mn') { const m = mineMesh(); m.position.set(...a.p); m.position.y += 0.05; G.scene.add(m); theirMines.set(a.id, m); }
          else if (kind === 'mx') { const m = theirMines.get(a); if (m) { G.scene.remove(m); theirMines.delete(a); } }
          else if (kind === 'd') { K._net = true; try { ad.call(C, V(...a.p), a.dur, 0); } finally { K._net = false; } }
          else if (kind === 'z') {
            vz.push({ pos: V(...a.p), r: a.r, dur: a.dur, t: 0, kind: a.k, who: a.who, fol: a.fol, hps: a.hps });
            // what pulls or blinds has to work on the real foes
            if (K.role === 'host' && (a.k === 'gravity' || a.k === 'smoke')) { K._net = true; try { zn.call(C, V(...a.p), a.r, a.dur, a.k, 0, {}); } finally { K._net = false; } }
          }
          else if (kind === 'a') vAuras.push({ id: a.id, k: a.k, t: a.t, r: a.r, col: a.col, fol: a.fol, who: a.who, heal: a.heal, c: a.c ? V(...a.c) : null, pt: a.pt ? V(...a.pt) : null, age: 0 });
          else if (kind === 'b') { const v = vAuras.find((x) => x.id === a.id); if (v) { if (!v.pt) v.pt = V(...a.pt); else v.pt.lerp(V(...a.pt), 0.5); } }
        } catch (e) { console.error(e); }
      }
      if (K.role === 'host') K.relay(m, from);
    };
    K.handlers.cr = function (m) { if (K.role === 'host') { GM.chronoT = Math.max(GM.chronoT || 0, m.d); GM.chronoSlow = Math.max(GM.chronoSlow || 0, m.s); G.ui.toastSmall('⌛ 仲間が時間を操った'); } };
    K.vizCount = () => vz.length + vAuras.length;
    K.clearViz = function () { for (const id of [...theirAllies.keys()]) dropAlly(id); for (const m of theirMines.values()) G.scene.remove(m); theirMines.clear(); myAllies.length = 0; vz.length = 0; for (const a of vAuras) if (a.ring) G.scene.remove(a.ring); vAuras.length = 0; };
  };
})();
