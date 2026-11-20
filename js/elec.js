'use strict';
// The power plant's live devices (廃発電所, docs/plant_spec.md 3-4): live floors and high-voltage arcs that the plant switches on by itself.
// The field (field_plant.js) writes where they are into w.elec when it generates the area:
//   w.elec = { zones: [{ id, x0, z0, x1, z1, y, box: { x, y, z, ry } }], arcs: [{ id, a: {x,y,z}, b: {x,y,z}, box: { x, y, z, ry } }] }
// and draws what stands still (the plates, the insulators and the wire, the switch box with its lamp dark). This file runs them:
//   - a surge every 20-40 s of a fight: 1.5 s of warning (the hall's lamps stutter, the low hum, sparks and small arcs where it will come),
//     then the stopped devices nearest you (1-2, more deeper in, at most 4) go live;
//   - a live floor hurts whoever stands on it (you and the foes) every 0.4 s, about as much as shallow lava; a live wire hurts and
//     throws back whoever touches it;
//   - each device's switch box shows a red lamp while it is live; shoot it or strike it and that device drops dead, and stays dead
//     40-60 s (after that a surge may wake it again); left alone, it stays live;
//   - once the area is cleared no surge comes and the live ones die.
// Areas without w.elec cost nothing. The rules' random draws (when a surge comes, how many wake, how long a stopped one sleeps) are
// seeded by the run seed and the area; the looks use Math.random. Nothing of it is saved: an area resumed from a mid-area save starts
// with every device stopped. It hooks itself onto G.Gim.build / G.Gim.update (gimmick.js: run on game time, so a pause stops it), and
// its switch boxes are G.Gim devices of the kind 'elecbox' (shot-only colliders and a hit sphere: bullets, blows and blasts reach them).
(function () {
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const E = (G.Elec = { list: [], boxes: [], waveT: 0, warn: null, on: false });
  // the numbers of the rules (seconds, metres; damage: what shallow lava does is 2.5 + area * 0.3 every 0.4 s, player.js postMove)
  const T = E.T = {
    first: [10, 16], gap: [20, 40], prelude: 1.5, sleep: [40, 60], dying: 0.5,
    tick: 0.4, floorDmg: [2.5, 0.3], floorFoe: 0.025, // (a foe on a live floor: 2.5% of its health a tick, half for a big one / a guardian: gimmick.js hurtFoe)
    arcDmg: [5, 0.5], arcFoe: 0.04, arcCd: 0.8, arcR: 0.16, knockMe: 7, knockUp: 3.5, knockFoe: 6,
  };
  E.count = (area) => 1 + Math.floor(Math.max(0, area - 1) / 8); // (a surge wakes this many, or one more; at most 4)
  const COL = 0xbcd4ff, SPARK = 0xffd8a8;
  let rng = null, world = null;

  // ---------------------------------------------------------------- the floor's glaze: thin veins of current crawling over the plates
  // and the seam round them. Mostly clear: lines that come and go, never a lit slab. uA: how strongly (0 = gone), uP: 0 warning / 1 live.
  const Gm = G.Gim;
  const ZONE_VS = `varying vec2 vP; ${Gm.FOG_VS}
    uniform vec2 uH;
    void main() { vP = position.xz * (uH + 0.08); vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const ZONE_FS = `uniform float uT; uniform float uA; uniform float uP; uniform vec2 uH; uniform float uSeed; ${Gm.FOG_FS} varying vec2 vP;
    ${Gm.NOISE}
    // a line about px pixels wide wherever v crosses zero (its width on the screen, near or far)
    float line(float v, float px) { float d = abs(v) / (fwidth(v) + 1e-5); return 1.0 - smoothstep(px * 0.5, px * 0.5 + 1.0, d); }
    vec2 h22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
    // the borders of a crooked cell pattern: straight runs meeting at angles, the way a discharge forks over metal (distance to the
    // nearest border, in cell units, and the cell it is in)
    vec3 cells(vec2 x) {
      vec2 n = floor(x), f = fract(x), mg = vec2(0.0), mr = vec2(0.0); float md = 8.0;
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec2 g = vec2(float(i), float(j)), r = g + h22(n + g) - f; float d = dot(r, r); if (d < md) { md = d; mr = r; mg = g; } }
      md = 8.0;
      for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 g = mg + vec2(float(i), float(j)), r = g + h22(n + g) - f; if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr))); }
      return vec3(md, n + mg);
    }
    void main() {
      vec2 q = uH - abs(vP); float e = min(q.x, q.y);
      if (e < -0.06) discard;
      float t = uT + uSeed * 7.0;
      // the seam round the plates: lit only in pieces, pulses of current racing along it (never one even frame of light)
      float s = (vP.x * sign(vP.y) - vP.y * sign(vP.x));
      float run = vnoise(vec2(s * 1.6 - t * 9.0, uSeed * 5.0)) * vnoise(vec2(s * 4.3 + t * 5.0, uSeed * 3.0 + 7.0));
      float seam = line(e - 0.02, 1.6) * smoothstep(0.32, 0.6, run);
      // veins: the zero lines of a shifting noise, lit only where a flicker passes over them (so they come and go in pieces)
      // veins: the borders of a crooked cell pattern, a few of them lit at a time and jumping to others many times a second, under a
      // travelling flicker - short forked runs of current that come and go, never the whole net at once
      vec2 x = vP * 2.4 + vec2(uSeed * 13.0, 0.0);
      x += (vec2(vnoise(vP * 5.0 + 3.0), vnoise(vP * 5.0 - 7.0)) - 0.5) * 0.45;
      vec3 cv = cells(x);
      float cw = length(fwidth(x)), px = cv.x / (cw + 1e-5);
      float farK = 1.0 - smoothstep(0.06, 0.22, cw); // (far off the net would close into a smear: it thins out with distance)
      float vl = 1.0 - smoothstep(0.25, 1.05, px), vg = exp(-cv.x * 14.0) * 0.3; // (a hair-thin white core, a blue glow a few centimetres wide bleeding round it)
      // (lit in pieces: a patchy mask that jumps to a new place 14 times a second, so a run of border and its forks flash, never a whole cell)
      float jump = floor(t * 14.0);
      float pick = smoothstep(0.66, 0.74, vnoise(x * 0.8 + vec2(jump * 3.7, jump * 1.3)));
      float sweep = smoothstep(0.45, 0.7, vnoise(vP * 0.9 + vec2(t * 4.0, -t * 2.5)));
      float soft = smoothstep(0.58, 0.78, vnoise(x * 0.8 + vec2(jump * 3.7, jump * 1.3)));
      float vm = pick * (0.4 + 0.6 * sweep) * farK;
      float veins = vl * vm, glow = vg * soft * (0.4 + 0.6 * sweep) * farK * farK;
      float flick = 0.7 + 0.3 * step(0.35, fract(sin(floor(t * 23.0) * 12.9898 + uSeed) * 43758.5453));
      float inside = smoothstep(-0.02, 0.04, e);
      float core = (seam * (0.7 + 0.3 * uP) + veins * inside * uP) * flick, halo = glow * inside * uP * flick;
      float a = core + halo;
      vec3 col = mix(vec3(0.3, 0.45, 1.0), vec3(1.0), clamp(core / max(a, 1e-4), 0.0, 1.0));
      ${Gm.fogv}
      a = clamp(a, 0.0, 1.0) * uA * fogv;
      if (a < 0.004) discard;
      gl_FragColor = vec4(col, a);
    }`;
  const zoneMat = (hx, hz, seed) => Gm.mat(ZONE_VS, ZONE_FS, { uA: { value: 0 }, uP: { value: 0 }, uH: { value: new THREE.Vector2(hx, hz) }, uSeed: { value: seed } },
    { blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  // (compiled with the field devices' own shaders while an area loads: gimmick.js warmShow)
  if (Gm.warmMats) Gm.warmMats.push(() => zoneMat(1, 1, 0));

  // ---------------------------------------------------------------- setting up an area
  const lensGeo = () => E._lensGeo || (E._lensGeo = new THREE.CylinderGeometry(0.03, 0.034, 0.025, 14).rotateX(Math.PI / 2));
  E.setup = function (w) {
    E.teardown();
    world = w || null;
    if (!w || !w.elec) return;
    const GM = G.game;
    rng = new G.RNG(((GM.seed || 0) ^ U.hashStr('elec' + GM.area)) >>> 0);
    E.waveT = rng.range(T.first[0], T.first[1]);
    const mk = (kind, s, k) => {
      const d = { kind, src: s, id: s.id ?? kind + k, state: 'off', t: 0, sleep: 0, fxT: 0, sndT: 0 };
      if (kind === 'zone') {
        d.x0 = Math.min(s.x0, s.x1); d.x1 = Math.max(s.x0, s.x1); d.z0 = Math.min(s.z0, s.z1); d.z1 = Math.max(s.z0, s.z1); d.y = s.y || 0;
        d.c = V((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2); d.hx = (d.x1 - d.x0) / 2; d.hz = (d.z1 - d.z0) / 2;
      } else {
        d.a = V(s.a.x, s.a.y, s.a.z); d.b = V(s.b.x, s.b.y, s.b.z); d.c = d.a.clone().add(d.b).multiplyScalar(0.5);
      }
      w.addLight(d.c.x, d.c.y + (kind === 'zone' ? 0.5 : 0.2), d.c.z, { color: '#a9c6ff', intensity: 0, range: kind === 'zone' ? Math.max(d.hx || 0, d.hz || 0) + 4 : d.a.distanceTo(d.b) * 0.6 + 4, flame: 0, emit: false, steady: true, prio: 1.2 });
      d.light = w.lightSources[w.lightSources.length - 1]; d.light.elec = true; d.light.color = '#a9c6ff';
      if (s.box) d.box = makeBox(w, d, s.box);
      E.list.push(d);
      return d;
    };
    (w.elec.zones || []).forEach((s, k) => mk('zone', s, k));
    (w.elec.arcs || []).forEach((s, k) => mk('arc', s, k));
    if (E.list.length && G.sfx.elecPrep) G.sfx.elecPrep(); // (the running sounds' loops written now, not at the first surge)
  };
  // the switch box: a shot-only collider a little larger than the box the field drew (so a shot meets it first), a sphere for blows and
  // blasts, and the red lamp on its face (dark until its device is live). b.y: the box's middle; ry: the way its face looks
  function makeBox(w, d, b) {
    const f = V(Math.sin(b.ry || 0), 0, Math.cos(b.ry || 0)), p = V(b.x, b.y, b.z);
    const g = { kind: 'elecbox', i: Gm.list.length, used: false, run: false, t: 0, dmg: 0, hb: [{ p: p.clone(), r: 0.45 }], dev: d };
    const hx = 0.34, hy = 0.46, hz = 0.22, c = Math.abs(f.z), s = Math.abs(f.x), ex = c * hx + s * hz, ez = s * hx + c * hz;
    Gm.col(w, g, p.x - ex, p.y - hy, p.z - ez, p.x + ex, p.y + hy, p.z + ez, { shotOnly: true, surf: 'metal' });
    Gm.list.push(g); E.boxes.push(g);
    const lamp = new THREE.Mesh(lensGeo(), new THREE.MeshBasicMaterial({ color: 0x2a0a08 }));
    lamp.position.copy(p).addScaledVector(f, hz + 0.012); lamp.position.y += 0.28; lamp.rotation.y = b.ry || 0;
    G.scene.add(lamp);
    return { g, p, f, lamp, lampP: lamp.position.clone().addScaledVector(f, 0.03) };
  }
  E.teardown = function () {
    endFlicker();
    if (E.warnSnd) { E.warnSnd.stop(0.05); E.warnSnd = null; }
    if (G.sfx.elecHumStop) G.sfx.elecHumStop(null, 0.05);
    for (const d of E.list) if (d.box) { G.scene.remove(d.box.lamp); d.box.lamp.material.dispose(); }
    for (const d of E.list) if (d.ov) { G.scene.remove(d.ov); d.ov.material.dispose(); }
    for (const g of E.boxes) { const i = Gm.list.indexOf(g); if (i >= 0) Gm.list.splice(i, 1); }
    E.list = []; E.boxes = []; E.warn = null; E.on = false; world = null;
  };

  // ---------------------------------------------------------------- the clock of surges
  const fighting = () => { const GM = G.game; return !GM.areaCleared && GM.stage !== 'title'; };
  E.update = function (dt) {
    if (!E.list.length) return;
    const P = G.player, fight = fighting();
    for (const d of E.list) if (d.sleep > 0) d.sleep = Math.max(0, d.sleep - dt);
    if (fight) {
      if (!E.warn) { E.waveT -= dt; if (E.waveT <= 0) E.surge(); }
      else {
        E.warn.t += dt;
        if (E.warnSnd) E.warnSnd.keep();
        flicker(E.warn.t / T.prelude);
        if (E.warn.t >= T.prelude) {
          endFlicker(true);
          for (const d of E.warn.devs) if (d.state === 'warn') goLive(d);
          E.warn = null; E.warnSnd = null;
        }
      }
    } else {
      if (E.warn) { for (const d of E.warn.devs) if (d.state === 'warn') d.state = 'off'; E.warn = null; endFlicker(); if (E.warnSnd) { E.warnSnd.stop(0.15); E.warnSnd = null; } }
      for (const d of E.list) if (d.state === 'on') drop(d, false);
    }
    E.on = false; E.fr = (E.fr || 0) + 1;
    E.arcPT = Math.max(0, (E.arcPT || 0) - dt);
    for (const d of E.list) {
      d.t += dt;
      if (d.state === 'warn') look(d, dt, 'warn');
      else if (d.state === 'on') { E.on = true; look(d, dt, 'on'); if (G.sfx.elecHum) G.sfx.elecHum(d, d.kind, sndPt(d), 1); if (P && !P.dead) hurt(d, dt); }
      else if (d.state === 'dying') { look(d, dt, 'dying'); if (d.t >= T.dying) { d.state = 'off'; d.t = 0; } }
      else if (d.ov && d.ov.visible) { d.ov.visible = false; }
      lamp(d, dt);
    }
  };
  // a surge: the stopped devices (not sleeping) nearest you; the warning first
  E.surge = function () {
    const GM = G.game, P = G.player;
    E.waveT = rng.range(T.gap[0], T.gap[1]);
    const n = Math.min(4, E.count(GM.area || 1) + (rng.next() < 0.5 ? 1 : 0));
    const free = E.list.filter((d) => d.state === 'off' && d.sleep <= 0);
    if (!free.length) return null;
    const pp = P ? P.pos : V();
    free.sort((a, b) => distTo(a, pp) - distTo(b, pp));
    const devs = free.slice(0, n);
    for (const d of devs) { d.state = 'warn'; d.t = 0; }
    E.warn = { t: 0, devs };
    if (E.warnSnd) E.warnSnd.stop(0.05);
    E.warnSnd = G.sfx.elecWarn ? G.sfx.elecWarn(T.prelude) : null;
    return devs.map((d) => d.id);
  };
  function distTo(d, p) {
    if (d.kind === 'zone') return Math.hypot(Math.max(d.x0 - p.x, 0, p.x - d.x1), Math.max(d.z0 - p.z, 0, p.z - d.z1), (p.y - d.y) * 2);
    return segPt(d.a, d.b, p, _q);
  }
  function goLive(d) {
    d.state = 'on'; d.t = 0;
    if (G.sfx.elecOn) G.sfx.elecOn(sndPt(d).clone(), d.kind);
    if (d.kind === 'arc') { G.fx.arcBolt(d.a, d.b, { col: COL, w: 0.12, life: 0.2, rough: 0.12, branches: 2, minSeg: 0.15 }); G.fx.flash(d.c, 0xbcd4ff, 60, 0.14, 12); }
    else { G.fx.flash(d.c.clone().setY(d.y + 0.6), 0xbcd4ff, 45, 0.14, Math.max(d.hx, d.hz) * 2 + 6); for (let i = 0; i < 6; i++) crawl(d, 1.4, 0.04); }
  }
  // the device drops dead (its box shot or struck, or the fight over): what was running through it bursts out once and is gone
  function drop(d, hit) {
    if (d.state !== 'on' && d.state !== 'warn') return false;
    const was = d.state;
    d.state = was === 'on' ? 'dying' : 'off'; d.t = 0;
    if (hit) d.sleep = rng.range(T.sleep[0], T.sleep[1]);
    if (E.warn && E.warn.devs.includes(d)) { E.warn.devs = E.warn.devs.filter((x) => x !== d); }
    if (was !== 'on') return true;
    if (d.kind === 'arc') {
      G.fx.arcBolt(d.a, d.b, { col: COL, w: 0.12, life: 0.16, rough: 0.14, branches: 3, minSeg: 0.15, down: true });
      for (const e of [d.a, d.b]) { G.fx.sparks(e, V(0, -0.4, 0), 14, SPARK, 6); G.fx.smoke(e, 2, 0.3, 0x40403c, 0.6, 1.2); }
    } else {
      for (let i = 0; i < 8; i++) crawl(d, 1.6, 0.05);
      for (let i = 0; i < 4; i++) G.fx.sparks(edgePt(d), V(0, 1, 0), 6, SPARK, 5);
    }
    G.fx.flash(d.kind === 'zone' ? d.c.clone().setY(d.y + 0.5) : d.c, 0xbcd4ff, 40, 0.1, 10);
    if (G.sfx.elecHumStop) G.sfx.elecHumStop(d, 0.03);
    if (G.sfx.elecOff) G.sfx.elecOff(sndPt(d).clone(), d.kind);
    return true;
  }
  E.drop = drop;

  // ---------------------------------------------------------------- what it does to you and the foes
  const _q = V(), _r = V();
  E.pT = 0;
  function onZone(d, p, up) { return p.x > d.x0 && p.x < d.x1 && p.z > d.z0 && p.z < d.z1 && p.y < d.y + (up || 0.2) && p.y > d.y - 0.3; }
  function hurt(d, dt) {
    const P = G.player, C = G.combat, GM = G.game, area = GM.area || 1;
    if (d.kind === 'zone') {
      // (one clock for every live floor, as lava has: standing where two plates meet does not hurt twice; a foe likewise, once a frame)
      if (E._meF !== E.fr && P.grounded && !(G.Strata && G.Strata.onRope) && onZone(d, P.pos)) {
        E._meF = E.fr;
        E.pT -= dt;
        if (E.pT <= 0) {
          E.pT = Math.max(0, E.pT + T.tick);
          const n = C.damagePlayer(T.floorDmg[0] + area * T.floorDmg[1], { src: 'aoe', el: 'volt', pos: P.pos.clone() });
          E.lastMe = { dev: d.id, dmg: n, t: GM.time };
          if (G.sfx.elecShock) G.sfx.elecShock(false);
          zapAt(V(P.pos.x, d.y + 0.02, P.pos.z), V(P.pos.x + U.rand(-0.15, 0.15), P.pos.y + U.rand(0.3, 0.8), P.pos.z + U.rand(-0.15, 0.15)));
        }
      }
      for (const e of Gm.foes()) {
        if (e.burrowed || e._elecF === E.fr || !onZone(d, e.pos, 0.35)) continue;
        e._elecF = E.fr;
        e._elecT = (e._elecT ?? 0) - dt;
        if (e._elecT > 0) continue;
        e._elecT += T.tick; if (e._elecT < 0) e._elecT = 0;
        Gm.hurtFoe(e, T.floorFoe, 'volt');
        const c = e.centerPos();
        zapAt(V(e.pos.x, d.y + 0.02, e.pos.z), V(c.x + U.rand(-0.2, 0.2), e.pos.y + (e.height || 1.6) * U.rand(0.2, 0.6), c.z + U.rand(-0.2, 0.2)));
        if (G.fx.arcsOn) G.fx.arcsOn(c, (e.radius || 0.5) * 0.8, (e.height || 1.6) * 0.8, 2);
      }
    } else {
      // a live wire: whoever's body comes within reach of it is struck and thrown off it (a moment's grace after)
      if (E.arcPT <= 0 && bodyNear(d, P.pos, P.height || 1.8, P.hw + T.arcR)) {
        E.arcPT = T.arcCd;
        const k = knockDir(d, P.pos);
        const n = C.damagePlayer(T.arcDmg[0] + area * T.arcDmg[1], { src: 'aoe', el: 'volt', pos: _q.clone() });
        E.lastMe = { dev: d.id, dmg: n, t: GM.time, arc: true };
        P.vel.x += k.x * T.knockMe; P.vel.z += k.z * T.knockMe; P.vel.y = Math.max(P.vel.y, T.knockUp); P.grounded = false;
        strikeAt(_q.clone(), P.chestPos ? P.chestPos() : P.pos.clone().setY(P.pos.y + 1.1), true);
      }
      for (const e of Gm.foes()) {
        if (e.burrowed) continue;
        if ((e._arcT || 0) > G.game.time || !bodyNear(d, e.pos, e.height || 1.6, (e.radius || 0.5) * 0.6 + T.arcR)) continue;
        e._arcT = G.game.time + T.arcCd;
        const k = knockDir(d, e.pos);
        Gm.hurtFoe(e, T.arcFoe, 'volt');
        if (e.alive && e.knockback) e.knockback(k, T.knockFoe);
        strikeAt(_q.clone(), e.centerPos());
      }
    }
  }
  // closest distance from the wire to a body standing at p, h tall (its middle line); leaves the nearest point of the wire in _q
  function bodyNear(d, p, h, r) {
    let best = 1e9, bq = null;
    for (let i = 0; i <= 6; i++) {
      _r.set(p.x, p.y + 0.1 + (h - 0.2) * i / 6, p.z);
      const dd = segPt(d.a, d.b, _r, _q);
      if (dd < best) { best = dd; bq = _q.clone(); }
    }
    if (bq) _q.copy(bq);
    return best < r;
  }
  function knockDir(d, p) {
    const k = V(p.x - _q.x, 0, p.z - _q.z);
    if (k.lengthSq() < 1e-4) { const ab = d.b.clone().sub(d.a); k.set(-ab.z, 0, ab.x); }
    return k.normalize();
  }
  // where a device's sound comes from: the nearest point of its floor (just over the plates) or of its wire to your ears
  const _s = V();
  function sndPt(d) {
    const L = G.sfx.listener || (G.player && G.player.pos) || d.c;
    if (d.kind === 'zone') return _s.set(U.clamp(L.x, d.x0, d.x1), d.y + 0.05, U.clamp(L.z, d.z0, d.z1));
    segPt(d.a, d.b, L, _s);
    return _s;
  }
  function segPt(a, b, p, out) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L = abx * abx + aby * aby + abz * abz || 1e-6;
    const t = U.clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L, 0, 1);
    out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
    return out.distanceTo(p);
  }

  // ---------------------------------------------------------------- the switch boxes
  Gm.K.elecbox = {
    name: '配電箱', cd: 1,
    hit(g, kind, pos) {
      if (kind !== 'bullet' && kind !== 'melee' && kind !== 'explosion') return;
      const d = g.dev, b = d && d.box; if (!b) return;
      const live = d.state === 'on' || d.state === 'warn';
      G.fx.sparks(pos || b.p, b.f, live ? 6 : 4, SPARK, 4);
      if (!live) return;
      drop(d, true);
      E.lastDrop = { dev: d.id, by: kind, t: G.game.time, sleep: d.sleep };
      // the box itself shorts out: a burst of sparks from its face, a blue-white flash, a puff of smoke, and its lamp goes out
      G.fx.sparks(b.lampP, V(b.f.x, -0.3, b.f.z), 10, SPARK, 5);
      G.fx.arcBolt(b.lampP, b.lampP.clone().addScaledVector(b.f, 0.35).add(V(U.rand(-0.2, 0.2), U.rand(-0.3, 0.1), U.rand(-0.2, 0.2))), { col: COL, w: 0.05, life: 0.1, branches: 1, minSeg: 0.04, rough: 0.3 });
      G.fx.flash(b.lampP, 0xd0e0ff, 30, 0.1, 6);
      G.fx.smoke(b.lampP, 3, 0.35, 0x3a3834, 0.5, 1.4);
      if (G.sfx.elecShort) G.sfx.elecShort(b.p.clone());
      b.dark = 0.25;
    },
  };
  const LAMP_ON = new THREE.Color(3.2, 0.32, 0.16), LAMP_OFF = new THREE.Color(0x2a0a08), _lc = new THREE.Color();
  function lamp(d, dt) {
    const b = d.box; if (!b) return;
    const on = d.state === 'on';
    if (b.dark > 0) b.dark -= dt;
    if (on) {
      // steady red with a slow breath; a glow round the lens
      const k = 0.82 + 0.18 * Math.sin(G.game.time * 3.6);
      _lc.copy(LAMP_OFF).lerp(LAMP_ON, k); b.lamp.material.color.copy(_lc);
      b.glowT = (b.glowT || 0) - dt;
      if (b.glowT <= 0) { b.glowT = 0.04; G.fx.add.spawn(b.lampP.x, b.lampP.y, b.lampP.z, 0, 0, 0, 0.07, 0.16, 0.18, 1.0 * k, 0.12 * k, 0.06 * k, 0.55, 0, 0); }
    } else if (b.dark > 0) {
      // (just shorted: it flickers out)
      b.lamp.material.color.copy(Math.random() < 0.5 ? LAMP_ON : LAMP_OFF);
    } else b.lamp.material.color.copy(LAMP_OFF);
  }

  // ---------------------------------------------------------------- the looks
  function look(d, dt, st) {
    const near = G.player ? G.player.pos.distanceTo(d.c) : 0;
    if (d.kind === 'zone') lookZone(d, dt, st, near); else lookArc(d, dt, st, near);
  }
  function overlay(d) {
    if (d.ov) return d.ov;
    const m = new THREE.Mesh(Gm.plane(), zoneMat(d.hx, d.hz, Math.random() * 10));
    m.scale.set(d.hx + 0.08, 1, d.hz + 0.08); m.position.set(d.c.x, d.y + 0.025, d.c.z);
    m.frustumCulled = false; m.renderOrder = 5;
    G.scene.add(m);
    return (d.ov = m);
  }
  function edgePt(d) {
    const per = 2 * (d.hx + d.hz), s = Math.random() * per * 2;
    if (s < 2 * d.hx) return V(d.x0 + s, d.y + 0.03, d.z0);
    if (s < 2 * d.hx + 2 * d.hz) return V(d.x1, d.y + 0.03, d.z0 + s - 2 * d.hx);
    if (s < 4 * d.hx + 2 * d.hz) return V(d.x1 - (s - 2 * d.hx - 2 * d.hz), d.y + 0.03, d.z1);
    return V(d.x0, d.y + 0.03, d.z1 - (s - 4 * d.hx - 2 * d.hz));
  }
  // a thin arc crawling a little way along the seam round the plates (k: how bright, lift: how high over the plate)
  function crawl(d, k, lift) {
    const a = edgePt(d), alongX = Math.abs(a.z - d.z0) < 1e-3 || Math.abs(a.z - d.z1) < 1e-3;
    const L = U.rand(0.5, 1.6) * (Math.random() < 0.5 ? -1 : 1);
    const b = alongX ? V(U.clamp(a.x + L, d.x0, d.x1), a.y, a.z) : V(a.x, a.y, U.clamp(a.z + L, d.z0, d.z1));
    a.y += lift || 0.015; b.y += lift || 0.015;
    if (a.distanceTo(b) < 0.2) return;
    G.fx.arcBolt(a, b, { col: COL, w: U.rand(0.018, 0.034), life: U.rand(0.07, 0.14), rough: 0.14, branches: Math.random() < 0.35 ? 1 : 0, minSeg: 0.07, k: k || 1, restrike: Math.random() < 0.4 ? 0.04 : 0 });
  }
  // a small discharge over the plate: a jump between two points a hand apart, bowed up
  function skip(d, k) {
    const x = U.rand(d.x0 + 0.1, d.x1 - 0.1), z = U.rand(d.z0 + 0.1, d.z1 - 0.1), an = Math.random() * 6.283, l = U.rand(0.15, 0.55);
    const a = V(x, d.y + 0.015, z), b = V(U.clamp(x + Math.cos(an) * l, d.x0, d.x1), d.y + 0.015, U.clamp(z + Math.sin(an) * l, d.z0, d.z1));
    G.fx.arcBolt(a, b, { col: COL, w: U.rand(0.012, 0.026), life: U.rand(0.04, 0.08), rough: 0.45, branches: Math.random() < 0.3 ? 1 : 0, minSeg: 0.04, k: k || 0.9, restrike: 0 });
  }
  function zapAt(a, b) {
    G.fx.arcBolt(a, b, { col: COL, w: 0.035, life: 0.09, rough: 0.3, branches: 1, minSeg: 0.06 });
    G.fx.sparks(a, V(0, 1, 0), 4, SPARK, 4);
  }
  function strikeAt(a, b, me) {
    G.fx.arcBolt(a, b, { col: COL, w: 0.07, life: 0.14, rough: 0.25, branches: 2, minSeg: 0.1 });
    G.fx.flash(a, 0xbcd4ff, 40, 0.12, 8);
    G.fx.sparks(a, null, 10, SPARK, 6);
    if (G.sfx.elecSnap) G.sfx.elecSnap(a, 'arc');
    if (me && G.sfx.elecShock) G.sfx.elecShock(true);
  }
  const rate = (r, dt) => { const n = r * dt; return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0); };
  function lookZone(d, dt, st, near) {
    const ov = overlay(d), u = ov.material.uniforms, area = d.hx * d.hz * 4, far = near > 45 ? 0.35 : 1;
    ov.visible = true;
    if (st === 'warn') {
      // the warning: the seam round it flickers on and off, sparks spit from it, small arcs try the plates; it all thickens to the end
      const k = Math.min(1, d.t / T.prelude);
      u.uP.value = 0.15 * k;
      u.uA.value = Math.random() < 0.45 + 0.45 * k ? (0.4 + 0.6 * k) * (0.6 + Math.random() * 0.4) : 0.12;
      for (let i = rate((4 + 14 * k) * far, dt); i > 0; i--) G.fx.sparks(edgePt(d), V(0, 1, 0), 2 + (Math.random() * 3 | 0), Math.random() < 0.5 ? SPARK : 0xd8e6ff, 3 + 3 * k);
      for (let i = rate((4 + 14 * k) * far, dt); i > 0; i--) crawl(d, 0.5 + 0.45 * k, 0.012);
      if (k > 0.5) for (let i = rate(6 * k * far, dt); i > 0; i--) skip(d, 0.5);
      d.light.intensity = Math.random() < 0.3 + 0.4 * k ? 2 + 4 * k * Math.random() : 0.4;
      d.sndT -= dt; if (d.sndT <= 0 && near < 30) { d.sndT = U.rand(0.18, 0.32); if (G.sfx.elecSnap) G.sfx.elecSnap(edgePt(d), 'warn'); }
      return;
    }
    if (st === 'dying') {
      // dropped: one last bright pulse, then it gutters out in a few stutters
      const k = 1 - d.t / T.dying;
      u.uP.value = Math.max(0, k);
      u.uA.value = d.t < 0.06 ? 0.95 : (Math.random() < k * 0.8 ? k * 0.8 : 0);
      if (Math.random() < k * 0.6) crawl(d, k, 0.015);
      if (Math.random() < dt * 20 * k) G.fx.sparks(edgePt(d), V(0, 1, 0), 3, SPARK, 3);
      d.light.intensity = d.t < 0.08 ? 10 : Math.random() < k ? 3 * k : 0;
      if (d.state === 'dying' && d.t + dt >= T.dying) { u.uA.value = 0; d.light.intensity = 0; }
      return;
    }
    // live: the veins and the seam run; arcs crawl along the seam and skip over the plates (more on a bigger floor); now and then a
    // spark spits from the edge, and the light it throws stutters
    u.uP.value = 1;
    u.uA.value = 0.75 + 0.25 * Math.random();
    const big = Math.min(3, 0.6 + area / 12);
    for (let i = rate(9 * big * far, dt); i > 0; i--) crawl(d, 1, 0.015);
    for (let i = rate(11 * big * far, dt); i > 0; i--) skip(d, 0.9);
    if (Math.random() < dt * 3 * far) G.fx.sparks(edgePt(d), V(0, 1, 0), 3 + (Math.random() * 4 | 0), SPARK, 4);
    if (Math.random() < dt * 1.2 * far) { const p = V(U.rand(d.x0, d.x1), d.y + 0.02, U.rand(d.z0, d.z1)); G.fx.arcBolt(p, p.clone().add(V(U.rand(-0.3, 0.3), U.rand(0.3, 0.7), U.rand(-0.3, 0.3))), { col: COL, w: 0.025, life: 0.07, rough: 0.4, branches: 1, minSeg: 0.05 }); }
    d.light.intensity = (Math.random() < 0.12 ? 4.5 : 1.6) + Math.random() * 1.2;
    d.sndT -= dt; if (d.sndT <= 0 && near < 26) { d.sndT = U.rand(0.35, 0.8); if (G.sfx.elecSnap) G.sfx.elecSnap(V(U.rand(d.x0, d.x1), d.y + 0.1, U.rand(d.z0, d.z1)), 'zone'); }
  }
  function lookArc(d, dt, st, near) {
    const far = near > 50 ? 0.5 : 1;
    d.fxT -= dt;
    if (st === 'warn') {
      // the warning: the insulators' ends crackle with small arcs and spit sparks; toward the end a faint thread tries the gap
      const k = Math.min(1, d.t / T.prelude);
      for (const e of [d.a, d.b]) {
        if (Math.random() < dt * (6 + 16 * k)) G.fx.arcsOn(e, 0.14, 0.18, 1, COL);
        if (Math.random() < dt * (3 + 8 * k)) G.fx.sparks(e, V(0, -0.3, 0), 2 + (Math.random() * 3 | 0), SPARK, 3);
      }
      if (k > 0.55 && Math.random() < dt * 10 * k) G.fx.arcBolt(d.a, d.b, { col: COL, w: 0.018, life: 0.05, rough: 0.12, branches: 0, minSeg: 0.2, k: 0.35 * k, restrike: 0 });
      d.light.intensity = Math.random() < 0.25 + 0.4 * k ? 1 + 4 * k * Math.random() : 0.3;
      d.sndT -= dt; if (d.sndT <= 0 && near < 30) { d.sndT = U.rand(0.2, 0.35); if (G.sfx.elecSnap) G.sfx.elecSnap((Math.random() < 0.5 ? d.a : d.b).clone(), 'warn'); }
      return;
    }
    if (st === 'dying') {
      const k = 1 - d.t / T.dying;
      if (Math.random() < dt * 14 * k) G.fx.arcBolt(d.a, d.b, { col: COL, w: 0.03 + 0.05 * k, life: 0.05, rough: 0.15, branches: 1, minSeg: 0.2, k, restrike: 0 });
      if (Math.random() < dt * 12 * k) G.fx.sparks(Math.random() < 0.5 ? d.a : d.b, V(0, -0.5, 0), 3, SPARK, 3);
      d.light.intensity = Math.random() < k ? 6 * k : 0;
      if (d.t + dt >= T.dying) d.light.intensity = 0;
      return;
    }
    // live: a fresh channel every frame or so - its path, width and forks never the same twice - with a thinner second one beside it,
    // the ends wrapped in a pale corona, sparks dripping off the insulators, and the light it throws jumping with it
    if (d.fxT <= 0) {
      d.fxT = far < 1 ? 0.05 : 0.028;
      const w = U.rand(0.06, 0.12), life = U.rand(0.03, 0.05);
      const pts = G.fx.arcBolt(d.a, d.b, { col: COL, w, life, rough: U.rand(0.09, 0.15), branches: 0, minSeg: 0.12, k: 1.2, restrike: 0 });
      if (Math.random() < 0.3) G.fx.arcBolt(d.a, d.b, { col: COL, w: w * 0.35, life: 0.03, rough: U.rand(0.08, 0.13), branches: 0, minSeg: 0.25, k: 0.45, restrike: 0 });
      if (pts) {
        for (let j = Math.random() < 0.5 ? 1 : 0; j > 0; j--) { const q = pts[1 + Math.floor(Math.random() * (pts.length - 2))]; G.fx.arcBolt(q, q.clone().add(V(U.rand(-0.35, 0.35), U.rand(-0.45, 0.2), U.rand(-0.35, 0.35))), { col: COL, w: w * 0.4, life, rough: 0.35, branches: 0, minSeg: 0.05, k: 0.6, restrike: 0 }); }
      }
      for (const e of [d.a, d.b]) G.fx.add.spawn(e.x, e.y, e.z, 0, 0, 0, 0.06, 0.2, 0.26, 0.55, 0.68, 1.0, 0.6, 0, 0);
    }
    for (const e of [d.a, d.b]) if (Math.random() < dt * 2.5 * far) G.fx.sparks(e, V(0, -0.5, 0), 2 + (Math.random() * 3 | 0), SPARK, 3);
    d.light.intensity = 5 + Math.random() * 5;
    d.sndT -= dt; if (d.sndT <= 0 && near < 28) { d.sndT = U.rand(0.3, 0.6); if (G.sfx.elecSnap) G.sfx.elecSnap(d.a.clone().lerp(d.b, Math.random()), 'arc'); }
  }

  // the warning's stutter of the hall's own lamps (every light of the area but these devices'), put back exactly after
  let flick = null;
  function flicker(k) {
    if (!world) return;
    if (!flick) { flick = []; for (const s of world.lightSources) if (!s.elec && s.intensity > 0) flick.push([s, s.intensity, Math.random() * 10]); }
    for (const f of flick) {
      const s = f[0];
      f[2] -= 1;
      if (f[2] <= 0) { f[2] = 2 + Math.random() * 6; f[3] = Math.random() < 0.25 + 0.45 * k ? 0.12 + Math.random() * 0.35 : 0.85 + Math.random() * 0.3; }
      s.intensity = f[1] * (f[3] || 1);
    }
  }
  function endFlicker(surge) {
    if (!flick) return;
    for (const f of flick) f[0].intensity = f[1];
    flick = null;
    if (surge && world) G.fx.flash(G.player ? G.player.pos.clone().setY(G.player.pos.y + 3) : V(), 0xd8e4ff, 8, 0.12, 30);
  }

  // ---------------------------------------------------------------- hooks (gimmick.js: an area's devices are built when it starts, and run on game time)
  const build0 = Gm.build, update0 = Gm.update;
  Gm.build = function (w) { build0.call(Gm, w); try { E.setup(w); } catch (e) { console.error(e); } };
  Gm.update = function (dt) { update0.call(Gm, dt); try { E.update(dt); } catch (e) { console.error(e); } };

  // (development / tests) the state of every device
  E.state = () => E.list.map((d) => ({ id: d.id, kind: d.kind, state: d.state, sleep: +d.sleep.toFixed(2) }));
})();
