'use strict';
// Guardians (v5): harder guardians, a shared library of new attack patterns, and the new guardians of the dungeon / ruin fields.
//  * difficulty: BS.tempo() / BS.heavyMul() / BS.diffRank() - higher modes run the guardian's whole moveset faster and favour its heavy attacks
//  * BS.atk: new attack kinds usable by every guardian (spec attacks `{ k: 'lines', ... }`, or from the older class bosses via runX)
//  * every existing guardian gets 2-3 of them; the old attacks are a little tighter (shorter wind-ups, one more combo hit / volley in hard+)
(function () {
  const BS = G.bosses, U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const Pl = () => G.player;
  const C = () => G.combat;
  const FX = () => G.fx;

  // ================================================================ difficulty
  BS.diffRank = () => { const id = G.Run.cur.id; return id === 'easy' ? 0 : id === 'normal' ? 1 : id === 'hard' ? 2 : 3; };
  BS.tempo = () => { const r = BS.diffRank(); return [1.0, 1.08, 1.18, 1.28 + 0.012 * (G.Run.cur.lv || 1)][r]; };
  BS.heavyMul = () => [0.5, 1, 1.5, 2][BS.diffRank()];

  // ================================================================ helpers
  const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // distance from (px,pz) to the segment a-b on the floor plane; also the position along it (0..1)
  function segDist(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-6;
    const t = U.clamp(((px - a.x) * dx + (pz - a.z) * dz) / l2, 0, 1);
    return { d: Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t)), t };
  }
  const arenaClamp = (b, p) => { const w = b.world; p.x = U.clamp(p.x, 4, w.W - 4); p.z = U.clamp(p.z, 4, (w.arenaD || w.D) - 4); return p; };
  const pose = (b, k) => { if (b.pose) b.pose.k = Math.max(b.pose.k, k); };
  const sfxCast = (b, a) => { if (!a.sw) { a.sw = true; G.sfx.magic(b.pos, a.snd || 'dark'); } };
  const boom = (c, r, col, dmgFn) => { FX().explosion(c.clone().setY(0.4), r * 0.55, col, { decal: false }); FX().ring(c.clone().setY(0.15), r, col, 0.4); G.sfx.explosion(c, 0.7); if (dmgFn) dmgFn(); };

  // ================================================================ the attack library
  // Each function runs with `this` = the guardian, gets the attack's state object `a` (a.t = seconds since it began) and returns true when it is over.
  const atk = (BS.atk = {});

  // fissures: lanes torn open across the floor from the guardian; they burst a moment after they appear (step out of the lane / jump is no use: leave it)
  atk.lines = function (a) {
    const P = Pl(), T = a.delay || 1.35, len = a.len || 38, wid = a.wid || 3, col = a.col || 0xff5030;
    if (!a.init) {
      a.init = true; sfxCast(this, a); pose(this, 1);
      const base = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), n = a.n || 3; a.L = [];
      for (let i = 0; i < n; i++) {
        let ang;
        if (a.mode === 'cross') ang = base + i * Math.PI / (n / 2) + (a.rot || 0.4);
        else if (a.mode === 'around') ang = base + (i / n) * Math.PI * 2 + 0.2;
        else ang = base + (i - (n - 1) / 2) * (a.spread || 0.45);
        const o = this.pos.clone().setY(0), e = o.clone().add(V(Math.sin(ang) * len, 0, Math.cos(ang) * len));
        a.L.push({ o, e, tele: FX().teleLine(o, e, wid, T, col) });
      }
    }
    if (a.t >= T && !a.done) {
      a.done = true; G.sfx.explosion(this.pos, 1); P.addShake(0.5);
      for (const l of a.L) {
        FX().endTeleLine(l.tele);
        for (let i = 1; i <= 9; i++) { const p = l.o.clone().lerp(l.e, i / 9); FX().explosion(p.clone().setY(0.3), 1.6, col, { decal: false }); FX().dust(p, V(0, 1, 0), 0x6a5a48, 4); }
        const s = segDist(P.pos.x, P.pos.z, l.o, l.e);
        if (s.d < wid / 2 + 0.4 && P.pos.y < 1.8) { this.hurtPlayer(a.dmg || 30, 'aoe', l.o, a.elem); P.vel.y = Math.max(P.vel.y, 5); }
        if (a.zone) for (let i = 2; i <= 8; i += 3) C().zone(l.o.clone().lerp(l.e, i / 9), 1.8, a.zone.dur || 4, a.zone.kind, (a.zone.dps || 8) * this.dmgScale, { enemy: true });
      }
    }
    return a.t > T + 0.7;
  };

  // a sweeping beam (one or more arms) that turns around the guardian
  atk.beam = function (a, dt) {
    const P = Pl(), W = a.wind || 1.0, dur = a.dur || 3.4, len = a.len || 36, wid = a.wid || 1.8, col = a.col || 0xff3060;
    if (!a.init) {
      a.init = true; sfxCast(this, a); pose(this, 1);
      a.ang = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z) + (Math.random() < 0.5 ? 0.9 : -0.9);
      a.dir = Math.random() < 0.5 ? 1 : -1; a.arms = a.arms || 1; a.tick = 0; a.tl = [];
      for (let k = 0; k < a.arms; k++) { const an = a.ang + k * Math.PI * 2 / a.arms; a.tl.push(FX().teleLine(this.pos.clone().setY(0), this.pos.clone().add(V(Math.sin(an) * len, 0, Math.cos(an) * len)).setY(0), wid, W, col)); }
    }
    if (a.t < W) return false;
    const e = a.t - W;
    for (const t of a.tl) FX().endTeleLine(t);
    a.ang += a.dir * (a.rot || 0.8) * (1 + e * 0.1) * dt;
    const o = this.pos.clone().setY(a.h || 1.1);
    a.tick -= dt;
    for (let k = 0; k < a.arms; k++) {
      const an = a.ang + k * Math.PI * 2 / a.arms, end = o.clone().add(V(Math.sin(an) * len, 0, Math.cos(an) * len));
      FX().beam(o, end, col, wid * 0.45, 0.07);
      if (Math.random() < 0.7) FX().sparks(end.clone().setY(0.2), null, 2, col, 4);
      if (a.tick <= 0) { const s = segDist(P.pos.x, P.pos.z, o, end); if (s.d < wid / 2 + 0.35 && (!a.low || P.pos.y < 1.3)) this.hurtPlayer(a.dmg || 9, 'aoe', o, a.elem); }
    }
    if (a.tick <= 0) a.tick = 0.2;
    return e > dur;
  };

  // a hail of impacts over the arena (the first ones land on you)
  atk.meteors = function (a) {
    const P = Pl(), r = a.r || 3.2, col = a.col || 0xff8040;
    if (!a.pts) {
      sfxCast(this, a); pose(this, 1);
      a.pts = []; const n = a.n || 8, d0 = a.delay || 1.15;
      for (let i = 0; i < n; i++) {
        const p = i < 2 ? P.pos.clone().add(V(U.rand(-1.5, 1.5), 0, U.rand(-1.5, 1.5))) : P.pos.clone().add(V(U.rand(-(a.range || 15), a.range || 15), 0, U.rand(-(a.range || 15), a.range || 15)));
        arenaClamp(this, p); p.y = 0;
        const t = d0 + i * (a.stagger || 0.22);
        a.pts.push({ c: p, t, tele: FX().telegraph(p, r, t, col), done: false });
      }
    }
    let all = true;
    for (const p of a.pts) {
      if (p.done) continue;
      if (a.t < p.t) { all = false; continue; }
      p.done = true;
      FX().seg(V(p.c.x + 5, 46, p.c.z + 2), p.c.clone().setY(0.3), col, 0.35, 0.25);
      boom(p.c, r, col, () => { if (hd(P.pos, p.c) < r && P.pos.y < 3.5) this.hurtPlayer(a.dmg || 26, 'aoe', p.c, a.elem); });
      if (a.zone) C().zone(p.c.clone(), r * 0.7, a.zone.dur || 3, a.zone.kind, (a.zone.dps || 8) * this.dmgScale, { enemy: true });
    }
    return all && a.t > a.pts[a.pts.length - 1].t + 0.4;
  };

  // circles that appear under you one after another: keep moving
  atk.chase = function (a) {
    const P = Pl(), r = a.r || 3.2, col = a.col || 0xc060ff, n = a.n || 4;
    if (!a.s) { a.s = { i: 0, next: a.wind || 0.5, cur: null }; sfxCast(this, a); pose(this, 1); }
    const s = a.s;
    if (!s.cur && s.i < n && a.t >= s.next) {
      const d = Math.max(0.5, (a.delay || 0.95) - s.i * 0.07), c = P.pos.clone().setY(0);
      s.cur = { c, t: a.t + d, tele: FX().telegraph(c, r, d, col) }; s.i++;
    }
    if (s.cur && a.t >= s.cur.t) {
      const c = s.cur.c; s.cur = null; s.next = a.t + 0.12;
      boom(c, r, col, () => { if (hd(P.pos, c) < r && P.pos.y < 3) this.hurtPlayer(a.dmg || 26, 'aoe', c, a.elem); });
      if (a.zone) C().zone(c.clone(), r * 0.7, a.zone.dur || 3, a.zone.kind, (a.zone.dps || 8) * this.dmgScale, { enemy: true });
    }
    return s.i >= n && !s.cur;
  };

  // shock rings spreading from the guardian one after another: jump each one
  const RING_HW = 0.8; // half-width of a jump-over ring, drawn and tested
  atk.rings = function (a) {
    // rings you have to jump: never more than three, far enough apart to land, take off again and time the next one, and not too fast
    const P = Pl(), n = Math.min(3, a.n || 3), gap = Math.max(1.4, a.gap || 0.75), speed = Math.min(13, a.speed || 15), W = a.wind || 0.8, col = a.col || 0xffa060, R = 44;
    if (!a.rg) {
      sfxCast(this, a); pose(this, 1);
      a.o = this.pos.clone().setY(0); a.rg = []; a.tele = FX().telegraph(a.o, 5, W, col);
      for (let i = 0; i < n; i++) a.rg.push({ t0: W + i * gap, started: false, hit: false });
    }
    for (const g of a.rg) {
      if (a.t < g.t0) continue;
      if (!g.started) { g.started = true; g.sr = FX().shockRing(a.o, col, RING_HW, R); G.sfx.explosion(a.o, 1.0); P.addShake(0.5); FX().dust(a.o, V(0, 1, 0), 0x7a6a50, 14); }
      const r = (a.t - g.t0) * speed;
      if (g.sr) { if (r > R) { g.sr.dispose(); g.sr = null; } else g.sr.set(r, 1 - Math.max(0, r - R * 0.6) / (R * 0.4) * 0.6); } // the drawn band is exactly the hit band
      if (!g.hit && Math.abs(hd(P.pos, a.o) - r) < RING_HW && P.pos.y < 0.6) { g.hit = true; this.hurtPlayer(a.dmg || 28, 'aoe', a.o, a.elem); P.vel.y = Math.max(P.vel.y, 5); }
    }
    return a.t > W + (n - 1) * gap + R / speed;
  };

  // an arm-spiral of projectiles
  atk.spiral = function (a, dt) {
    const W = a.wind || 0.8, dur = a.dur || 3.4, arms = a.arms || 3;
    if (a.ang === undefined) { a.ang = Math.random() * 6.28; a.acc = 0; sfxCast(this, a); pose(this, 1); }
    if (a.t < W) return false;
    a.ang += (a.rot || 1.5) * dt * (a.flip ? -1 : 1);
    a.acc += dt * (a.rate || 8);
    const from = this.pos.clone().setY(a.y || 1.6);
    while (a.acc >= 1) {
      a.acc--;
      for (let k = 0; k < arms; k++) { const an = a.ang + k * Math.PI * 2 / arms; C().spawnProjectile({ kind: a.proj || 'soul', pos: from.clone(), vel: V(Math.cos(an), 0, Math.sin(an)).multiplyScalar(a.speed || 12), owner: 'enemy', dmg: (a.dmg || 12) * this.dmgScale, radius: 0.5, life: 5, attacker: this.main || this.parts[0], elem: a.elem }); }
      G.sfx.magic(this.pos, a.snd || 'dark');
    }
    return a.t - W > dur;
  };

  // travelling walls of force along the floor (jump them)
  atk.shockline = function (a) {
    const P = Pl(), W = a.wind || 0.7, len = a.len || 42, wid = a.wid || 5, speed = a.speed || 19, col = a.col || 0x80c0ff;
    if (!a.wv) {
      sfxCast(this, a); pose(this, 1);
      const base = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), n = a.n || 3; a.wv = [];
      const o = this.pos.clone().setY(0);
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * (a.spread || 0.5), dir = V(Math.sin(ang), 0, Math.cos(ang));
        a.wv.push({ o, dir, perp: V(dir.z, 0, -dir.x), t0: W + i * (a.gap || 0.25), hit: false, tele: FX().teleLine(o, o.clone().addScaledVector(dir, len), wid, W, col) });
      }
    }
    let live = false;
    for (const w of a.wv) {
      if (a.t < w.t0) { live = true; continue; }
      const d = (a.t - w.t0) * speed; if (d > len) continue; live = true;
      const c = w.o.clone().addScaledVector(w.dir, d);
      { const a0 = c.clone().addScaledVector(w.perp, wid / 2).setY(0.3), b0 = c.clone().addScaledVector(w.perp, -wid / 2).setY(0.3); FX().beam(a0, b0, 0xffffff, 0.12, 0.09); FX().beam(a0, b0, col, 0.4, 0.09); } // a solid bar of light along the front: the hit test is the same width, 1 m deep
      if (Math.random() < 0.6) FX().dust(c.clone().addScaledVector(w.perp, U.rand(-wid / 2, wid / 2)), V(0, 1, 0), 0x8a8a8a, 1);
      const rel = P.pos.clone().sub(w.o), along = rel.dot(w.dir), across = Math.abs(rel.dot(w.perp));
      if (!w.hit && Math.abs(along - d) < 0.9 && across < wid / 2 + 0.1 && P.pos.y < 0.6) { w.hit = true; this.hurtPlayer(a.dmg || 28, 'aoe', c, a.elem); P.vel.y = Math.max(P.vel.y, 5); P.vel.addScaledVector(w.dir, 6); }
    }
    return !live;
  };

  // delayed charges dropped where you have been standing
  atk.trail = function (a) {
    const P = Pl(), W = a.wind || 0.5, dur = a.dur || 3.4, iv = a.iv || 0.42, d = a.delay || 1.15, r = a.r || 2.6, col = a.col || 0xff6030;
    if (!a.bombs) { a.bombs = []; a.next = W; sfxCast(this, a); pose(this, 1); }
    if (a.t >= a.next && a.t < W + dur) { a.next += iv; const c = P.pos.clone().setY(0); a.bombs.push({ c, t: a.t + d, tele: FX().telegraph(c, r, d, col), done: false }); }
    let open = false;
    for (const b of a.bombs) {
      if (b.done) continue;
      if (a.t < b.t) { open = true; continue; }
      b.done = true; boom(b.c, r, col, () => { if (hd(P.pos, b.c) < r && P.pos.y < 3) this.hurtPlayer(a.dmg || 24, 'aoe', b.c, a.elem); });
      if (a.zone) C().zone(b.c.clone(), r * 0.7, a.zone.dur || 3, a.zone.kind, (a.zone.dps || 8) * this.dmgScale, { enemy: true });
    }
    return a.t > W + dur && !open;
  };

  // lightning: a run of strikes, the first ones on you
  atk.storm = function (a) {
    const P = Pl(), r = a.r || 2.6, col = a.col || 0xcfe0ff;
    if (!a.pts) {
      sfxCast(this, a, 'zap'); pose(this, 1);
      a.pts = []; const n = a.n || 9, d0 = a.delay || 0.85;
      for (let i = 0; i < n; i++) {
        const p = i < 3 ? P.pos.clone().add(V(U.rand(-2, 2), 0, U.rand(-2, 2))) : P.pos.clone().add(V(U.rand(-16, 16), 0, U.rand(-16, 16)));
        arenaClamp(this, p); p.y = 0; const t = d0 + i * (a.stagger || 0.26);
        a.pts.push({ c: p, t, tele: FX().telegraph(p, r, t, 0xb0c8ff), done: false });
      }
    }
    let all = true;
    for (const p of a.pts) {
      if (p.done) continue;
      if (a.t < p.t) { all = false; continue; }
      p.done = true; FX().strike(p.c.clone().setY(0.1), col, true);
      if (hd(P.pos, p.c) < r && P.pos.y < 4) this.hurtPlayer(a.dmg || 24, 'aoe', p.c, 'shock');
    }
    return all && a.t > a.pts[a.pts.length - 1].t + 0.4;
  };

  // vanish, reappear at your side, strike - several times over
  atk.mblink = function (a) {
    const P = Pl(), hits = a.hits || 3, r = a.r || 5.2, col = a.col || 0x9a50ff;
    if (!a.s) a.s = { i: 0, ph: 'gone', t: a.t, tele: null };
    const s = a.s, el = a.t - s.t;
    if (s.ph === 'gone') {
      if (el < 0.01 && !s.fx) { s.fx = true; FX().smoke(this.pos.clone().setY(2), 14, 1.6, 0x1a0a20, 0.6, 1.4); G.sfx.magic(this.pos, 'dark'); this.root.visible = false; }
      if (el > 0.3) {
        const an = Math.random() * 6.28, d = a.dist || 3.4;
        this.pos.set(P.pos.x + Math.cos(an) * d, 0, P.pos.z + Math.sin(an) * d); arenaClamp(this, this.pos);
        this.root.visible = true; this.face(P.pos, 1, 99); FX().smoke(this.pos.clone().setY(2), 12, 1.4, 0x1a0a20, 0.6, 1.2);
        s.ph = 'tele'; s.t = a.t; s.tele = FX().telegraph(this.pos.clone().setY(0), r, a.tele || 0.5, col); pose(this, 1); this.pose && (this.pose.n = 'swing');
      }
    } else if (s.ph === 'tele' && el > (a.tele || 0.5)) {
      s.ph = 'hit'; s.t = a.t; if (this.pose) this.pose.hit = 1;
      boom(this.pos, r, col, () => { if (hd(P.pos, this.pos) < r && P.pos.y < 3) { this.hurtPlayer(a.dmg || 24, 'melee', this.pos.clone(), a.elem); const kd = P.pos.clone().sub(this.pos).setY(0).normalize(); P.vel.addScaledVector(kd, 9); P.vel.y = Math.max(P.vel.y, 4); } });
    } else if (s.ph === 'hit' && el > 0.25) {
      s.i++; if (this.pose) this.pose.hit = 0;
      if (s.i >= hits) { this.root.visible = true; return true; }
      s.ph = 'gone'; s.t = a.t; s.fx = false;
    }
    return false;
  };

  // an inward pull that ends in a crushing burst
  atk.gravity = function (a, dt) {
    const P = Pl(), W = a.wind || 0.8, dur = a.dur || 1.7, R = a.r || 7, col = a.col || 0x9a50ff;
    if (!a.c) { a.c = this.pos.clone().setY(0); a.tele = FX().telegraph(a.c, R, W + dur, col); sfxCast(this, a); pose(this, 1); }
    if (a.t < W) return false;
    const e = a.t - W;
    if (e < dur) {
      const to = a.c.clone().sub(P.pos); to.y = 0; const l = to.length() || 1;
      if (l > 1.5) { const f = (a.pull || 34) * dt; P.vel.x += to.x / l * f; P.vel.z += to.z / l * f; }
      if (Math.random() < 0.5) FX().sparks(P.pos.clone().setY(P.pos.y + 1), null, 1, col, 3);
      return false;
    }
    if (!a.done) {
      a.done = true;
      boom(a.c, R, col, () => { if (hd(P.pos, a.c) < R && P.pos.y < 3) { this.hurtPlayer(a.dmg || 34, 'aoe', a.c, a.elem); const kd = P.pos.clone().sub(a.c).setY(0).normalize(); P.vel.addScaledVector(kd, 14); P.vel.y = 6; } });
      P.addShake(0.7);
    }
    return e > dur + 0.5;
  };

  // several jumps in a row, each at where you are standing when it starts
  atk.leapx = function (a) {
    const P = Pl(), n = a.hops || 3, w0 = a.w0 || 0.38, air = a.air || 0.5, r = a.r || 4.6, col = a.col || 0xff4020;
    if (!a.s) a.s = { i: 0, ph: 'wind', t: a.t, c: null, from: null, done: false };
    const s = a.s, el = a.t - s.t;
    if (s.ph === 'wind') {
      if (!s.c) { s.c = P.pos.clone().setY(0); s.from = this.pos.clone(); s.tele = FX().telegraph(s.c, r, w0 + air, col); sfxCast(this, a); }
      this.face(s.c, 0.016, 8); this.hY = -0.3;
      if (el > w0) { s.ph = 'air'; s.t = a.t; this.hY = 0; }
    } else if (s.ph === 'air') {
      const f = Math.min(1, el / air);
      this.pos.lerpVectors(s.from, s.c, f); this.pos.y = 0; this.hYbase = Math.sin(f * Math.PI) * (a.height || 6);
      if (f >= 1) {
        this.hYbase = 0; arenaClamp(this, this.pos);
        boom(s.c, r, col, () => { if (hd(P.pos, s.c) < r && P.pos.y < 1.3) { this.hurtPlayer(a.dmg || 30, 'aoe', s.c, a.elem); const kd = P.pos.clone().sub(s.c).setY(0).normalize(); P.vel.addScaledVector(kd, 10); P.vel.y = 5; } });
        P.addShake(0.5); s.i++; s.ph = 'rec'; s.t = a.t;
      }
    } else if (s.ph === 'rec' && el > 0.22) {
      if (s.i >= n) { this.hYbase = 0; return true; }
      s.ph = 'wind'; s.t = a.t; s.c = null;
    }
    return false;
  };
  atk.leapx.air = true; // keeps the guardian's own height handling out of the way while it is in the air

  // ================================================================ old guardians: run a library attack from their own update loop
  // (the class bosses call this from doAct for attacks whose kind starts with "x_"; returns true when the attack is over)
  BS.runX = function (boss, a, dt) {
    const f = atk[a.k.slice(2)];
    return f ? !!f.call(boss, a, dt) : true;
  };

  // a guardian that dies while vanished (blink strikes) must not stay invisible
  const kill0 = BS.Boss.prototype.kill;
  BS.Boss.prototype.kill = function () { if (this.root) this.root.visible = true; return kill0.call(this); };

  BS.CLS5 = true;
})();
