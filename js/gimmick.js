'use strict';
// Field gimmicks: one device per field that belongs to its world and that you set off yourself (docs: gimmick plan).
//   霧の廃村 the chapel bell / 黄昏の廃都 the cracked great pillars / 血月の古城 the cauldrons of boiling oil on the wall walks /
//   水没回廊 the sluice wheels / 溶鉱の深層 the hanging crucibles / 天空の聖域 the statues that breathe the wind
//   (地下墓所's iron gates are strata.js's cell gates, built by fieldgen_t2.js).
// Each one works once. The generators place them (G.Gim.add, with colliders that shots strike); this file builds their meshes when the
// area starts, routes shots, blows, blasts and the interact key to them, runs what they set off on game time, and saves which are spent.
// What they do to monsters is done only to the ones this screen runs (not to e._rep copies); what they do to you, each screen does to its own player.
// The kinds themselves are in gimmick_a.js / gimmick_b.js (G.Gim.K[kind]).
(function () {
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const Gm = (G.Gim = { K: {}, list: [], fx: [], timers: [] });

  // ---------------------------------------------------------------- generation
  // o: the kind's own data (positions, sizes, directions). Set o.use (a point) for one you work with the interact key, o.look for one
  // that only tells you what it is when you look at it (o.lookR: how close, o.lookD: how far).
  Gm.add = function (w, kind, o) {
    w.gims = w.gims || [];
    const g = Object.assign({ kind, i: w.gims.length, used: false, run: false, t: 0, dmg: 0, hb: [] }, o || {});
    w.gims.push(g);
    const p = g.use || g.look;
    if (p) { g.it = { type: 'gimmick', pos: p.clone(), gim: g, r: g.useR || 1.0, reach: g.useD || 3.6, info: !g.use }; w.interactables.push(g.it); }
    return g;
  };
  // a collider that belongs to it: shots that strike it reach it (o.shotOnly: shots alone, nothing walks into it)
  Gm.col = function (w, g, x0, y0, z0, x1, y1, z1, o) {
    const c = w.addCollider(x0, y0, z0, x1, y1, z1, Object.assign({ noGrapple: true, surf: 'stone' }, o || {}));
    c.gim = g; if (o && o.shotOnly) c.shotOnly = true;
    (g.cols = g.cols || []).push(c);
    return c;
  };

  // ---------------------------------------------------------------- the area's life
  Gm.build = function (w) {
    Gm.clearFx();
    Gm.list = (w && w.gims) || [];
    for (const g of Gm.list) { const K = Gm.K[g.kind]; if (K && K.build) { try { K.build(g, w); } catch (e) { console.error(e); } } }
  };
  Gm.clearFx = function () {
    for (const f of Gm.fx) { try { f.dispose && f.dispose(); } catch (e) { /* (the world it belonged to is gone) */ } }
    Gm.fx.length = 0; Gm.timers.length = 0;
  };
  Gm.update = function (dt) {
    const sc = G.scene && G.scene.fog;
    if (sc) { FOG.c.value.copy(sc.color); FOG.d.value = sc.density || 0; }
    TIME.value += dt;
    const GM = G.game, S = GM.search;
    for (const g of Gm.list) {
      const K = Gm.K[g.kind]; if (!K) continue;
      if (!g.used && K.idle) K.idle(g, dt);
      if (!g.used && K.searching && g.it) K.searching(g, S && S.it === g.it ? Math.min(1, S.t / Math.max(0.01, S.dur)) : 0, dt);
      if (g.run) { g.t += dt; let go = false; try { go = K.run(g, dt); } catch (e) { console.error(e); } if (!go) g.run = false; }
    }
    for (let i = Gm.timers.length - 1; i >= 0; i--) { const t = Gm.timers[i]; t.t -= dt; if (t.t <= 0) { Gm.timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } } }
    for (let i = Gm.fx.length - 1; i >= 0; i--) { const f = Gm.fx[i]; let ok = false; try { ok = f.update(dt); } catch (e) { console.error(e); } if (!ok) { try { f.dispose && f.dispose(); } catch (e) { /* */ } Gm.fx.splice(i, 1); } }
  };
  Gm.after = (sec, fn) => Gm.timers.push({ t: sec, fn });

  // ---------------------------------------------------------------- setting one off
  // o.by: what set it off ('use', 'bullet', 'melee', 'explosion', 'flame'); o.net: it came from another screen (nothing is sent back)
  Gm.trigger = function (g, o) {
    if (!g || g.used) return false;
    const K = Gm.K[g.kind]; if (!K) return false;
    g.used = true; g.run = true; g.t = 0;
    const GM = G.game;
    if (g.it && GM.search && GM.search.it === g.it) GM.cancelSearch();
    try { K.start(g, o || {}); } catch (e) { console.error(e); }
    return true;
  };
  // a shot, a blow, a blast or a flame reached it: some go off at once, a pillar wants a few blows (K.hit)
  Gm.hit = function (g, dmg, kind, pos, dir) {
    if (!g || g.used) return false;
    const K = Gm.K[g.kind]; if (!K) return false;
    if (K.hit) K.hit(g, kind, pos, dir, dmg); else Gm.trigger(g, { by: kind });
    return true;
  };
  // a blast of radius r at pos (your own explosions)
  Gm.blast = function (pos, r) {
    for (const g of Gm.list) { if (g.used) continue; for (const s of g.hb) if (s.p.distanceTo(pos) < r + s.r) { Gm.hit(g, 0, 'explosion', pos); break; } }
  };
  // a swing / a flame in front of you: anything of it within reach and inside the cone (cosMin) is struck
  Gm.swing = function (o, reach, f, cosMin, kind) {
    let any = false;
    for (const g of Gm.list) {
      if (g.used) continue;
      for (const s of g.hb) {
        _t.copy(s.p).sub(o); const d = _t.length();
        if (d > reach + s.r) continue;
        if (d > s.r && _t.divideScalar(d).dot(f) < cosMin) continue;
        Gm.hit(g, 0, kind, s.p.clone(), f); any = true; break;
      }
    }
    return any;
  };
  const _t = V();

  // ---------------------------------------------------------------- the interact key / looking at it
  Gm.prompt = function (it, I) {
    const g = it.gim, K = Gm.K[g.kind], GM = G.game; if (!K) return;
    if (it.info || !K.interact) { G.ui.showInteract({ key: 'gim-' + g.kind, icon: K.icon, name: K.name, rc: K.rc, cat: K.cat, desc: K.desc, action: null }); return; }
    const S = GM.search && GM.search.it === it ? GM.search : null, A = K.interact, dur = GM.searchDur(A.dur);
    G.ui.showInteract({ key: 'gim-' + g.kind + (S ? 's' : ''), icon: K.icon, name: K.name, rc: K.rc, cat: `${A.verb} — ${dur.toFixed(1)}秒`, desc: S ? A.doing + ' 視点を大きく外したり離れると最初からやり直し' : K.desc, action: S ? A.doing : A.verb });
    if (I.hit('interact') && !S) GM.startSearch(it, it.pos, A.dur, K.icon, () => Gm.trigger(g, { by: 'use' }), A.doing);
  };

  // ---------------------------------------------------------------- what it does to the monsters and to you
  // the monsters this screen runs (never a copy of someone else's, an ally, a guardian's part)
  Gm.foes = () => G.enemies.list.filter((e) => e.alive && !e.dying && !e._rep && !e.custom && !e.ally);
  Gm.hurtFoe = function (e, frac, el, extra) {
    const amt = e.maxHp * (e.big || e.boss ? frac * 0.5 : frac);
    G.combat.damageEnemy(e, amt, Object.assign({ src: 'env', el: el || null, pos: e.centerPos(), noMarker: true }, extra || {}));
  };
  Gm.stunFoe = function (e, sec) { if (!e.alive || G.combat.stunImmune(e)) return; e.st.stun = Math.max(e.st.stun || 0, sec); };
  Gm.hurtMe = function (frac, info) {
    const P = G.player; if (!P || P.dead) return 0;
    return G.combat.damagePlayer(P.stats.maxHp * frac, Object.assign({ src: 'aoe' }, info || {}));
  };
  // set alight the way lava does (a fierce, long burn)
  Gm.igniteMe = function () { const P = G.player; if (!P || P.dead) return; P.st.burn = Math.max(P.st.burn || 0, 5); P.st.burnMul = 4; P.st.burnLv = Math.max(P.st.burnLv || 1, 3); if (G.Elem) G.Elem.envPlayer('fire'); };
  // the camera shakes with how close you are
  Gm.shake = function (p, a, range) { const P = G.player; if (!P) return; const d = P.pos.distanceTo(p); if (d < range) P.addShake(a * (1 - d / range)); };

  // ---------------------------------------------------------------- shared looks
  const TIME = { value: 0 }, FOG = { c: { value: new THREE.Color(0) }, d: { value: 0 } };
  Gm.TIME = TIME; Gm.FOG = FOG;
  const NOISE = `
    float h21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return v; }`;
  Gm.NOISE = NOISE;
  const FOG_VS = 'varying float vDepth;', FOG_FS = 'uniform float uFogD; uniform vec3 uFogC; varying float vDepth;';
  Gm.mat = function (vs, fs, uni, o) {
    return new THREE.ShaderMaterial(Object.assign({
      uniforms: Object.assign({ uT: TIME, uFogD: FOG.d, uFogC: FOG.c }, uni),
      vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
    }, o || {}));
  };
  Gm.FOG_VS = FOG_VS; Gm.FOG_FS = FOG_FS;
  Gm.fogv = 'float fogv = exp(-uFogD * uFogD * vDepth * vDepth);';

  // a warning on the floor: a rectangle (hx across, hz along its own z) or a circle (r). Its edge is exactly the edge of what will be hit:
  // a bright rim right on it, hazard stripes crawling inside, and a fill that spreads over it as the moment comes
  // (from: 'base' sweeps along +z from the near end, 'centre' grows from the middle out). handle.k (0..1) is the fill.
  const WARN_VS = `uniform vec2 uS; varying vec2 vP; ${FOG_VS}
    void main() { vP = position.xz * uS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const WARN_FS = `uniform float uT; uniform float uA; uniform float uK; uniform vec2 uH; uniform float uR; uniform float uCirc; uniform float uFrom; uniform vec3 uC; ${FOG_FS} varying vec2 vP;
    ${NOISE}
    void main() {
      float edge, inside, prog;
      if (uCirc > 0.5) { float d = length(vP); edge = uR - d; prog = d / max(uR, 0.01); }
      else { vec2 q = uH - abs(vP); edge = min(q.x, q.y); prog = uFrom > 0.5 ? (vP.y + uH.y) / (2.0 * uH.y) : max(abs(vP.x) / uH.x, abs(vP.y) / uH.y); }
      if (edge < -0.25) discard;
      inside = smoothstep(-0.02, 0.03, edge);
      float rim = (1.0 - smoothstep(0.0, 0.16, abs(edge - 0.06))) ;
      float halo = edge < 0.0 ? exp(edge * 14.0) * 0.5 : 0.0;
      float stripes = step(0.5, fract((vP.x + vP.y) * 0.9 - uT * 1.4));
      float filled = 1.0 - smoothstep(uK - 0.04, uK, prog);
      float front = exp(-abs(prog - uK) * 28.0) * step(0.001, uK) * (1.0 - step(0.999, uK));
      float n = fbm(vP * 0.7 + uT * 0.6);
      float pulse = 0.75 + 0.25 * sin(uT * 14.0);
      vec3 col = mix(uC, vec3(1.0, 0.95, 0.85), rim * 0.55 + front * 0.6);
      float a = inside * (0.1 + stripes * 0.1 + filled * (0.28 + 0.18 * n)) * pulse + rim * 0.9 + halo + front * 0.8 * inside;
      ${'float fogv = exp(-uFogD * uFogD * vDepth * vDepth);'}
      a = clamp(a, 0.0, 1.0) * uA * fogv;
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a);
    }`;
  let planeGeo = null;
  const plane = () => { if (!planeGeo) { planeGeo = new THREE.PlaneGeometry(2, 2, 1, 1); planeGeo.rotateX(-Math.PI / 2); } return planeGeo; };
  Gm.plane = plane;
  // o: { c (centre on the floor), yaw (the rectangle's +z along this heading), hx, hz | r, col, dur (fill time), from, hold (seconds it stays after filling) }
  Gm.warn = function (o) {
    const circ = o.r != null, pad = 0.3;
    // the plane is 2 x 2 (-1..1), scaled to the shape plus a margin for the halo; uS turns its coordinates back into metres
    const sx = circ ? o.r + pad : o.hx + pad, sz = circ ? o.r + pad : o.hz + pad;
    const mat = Gm.mat(WARN_VS, WARN_FS, { uS: { value: new THREE.Vector2(sx, sz) }, uA: { value: 0 }, uK: { value: 0 }, uH: { value: new THREE.Vector2(o.hx || 1, o.hz || 1) }, uR: { value: o.r || 1 }, uCirc: { value: circ ? 1 : 0 }, uFrom: { value: o.from === 'base' ? 1 : 0 }, uC: { value: new THREE.Color(o.col ?? 0xff3018) } },
      { blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const m = new THREE.Mesh(plane(), mat); m.frustumCulled = false; m.renderOrder = 5;
    m.scale.set(sx, 1, sz); m.position.set(o.c.x, (o.c.y || 0) + 0.07, o.c.z); m.rotation.y = o.yaw || 0;
    G.scene.add(m);
    const h = { k: 0, t: 0, dur: o.dur || 1, hold: o.hold ?? 0.2, done: false,
      end() { this.done = true; },
      update(dt) {
        this.t += dt;
        if (!o.manual) this.k = Math.min(1, this.t / this.dur); // (manual: the owner sets k as what it warns of comes, and ends it)
        mat.uniforms.uK.value = this.k;
        const fin = this.done || (!o.manual && this.t > this.dur + this.hold);
        if (fin) { this.fade = (this.fade ?? 1) - dt / 0.18; if (this.fade <= 0) return false; }
        mat.uniforms.uA.value = (o.alpha ?? 1) * Math.min(1, this.t / 0.1) * (fin ? Math.max(0, this.fade) : 1);
        return true;
      },
      dispose() { G.scene.remove(m); mat.dispose(); },
    };
    Gm.fx.push(h);
    return h;
  };

  // a strip laid on the floor or the water along a lane (hw either side of its middle line, len long, its +z the way it runs): streaks that
  // race along it. style 0: water (foam, a deep blue), 1: wind (pale streaks, nearly clear). front: only the part the flow has reached shows.
  const FLOW_VS = `varying vec2 vP; ${FOG_VS}
    void main() { vP = vec2(position.x, position.z); vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const FLOW_FS = `uniform float uT; uniform float uA; uniform float uHalf; uniform float uLen; uniform float uFront; uniform float uSpeed; uniform float uStyle; ${FOG_FS} varying vec2 vP;
    ${NOISE}
    void main() {
      if (vP.y > uFront || vP.y < 0.0) discard;
      float side = 1.0 - smoothstep(uHalf * 0.78, uHalf, abs(vP.x));
      float ends = smoothstep(0.0, 1.5, vP.y) * (1.0 - smoothstep(uLen - 3.0, uLen, vP.y));
      float lead = exp(-(uFront - vP.y) * 0.8);
      float s1 = fbm(vec2(vP.x * 2.6, vP.y * 0.22 - uT * uSpeed * 0.22));
      float s2 = fbm(vec2(vP.x * 5.0 + 3.0, vP.y * 0.4 - uT * uSpeed * 0.4));
      float streak = smoothstep(0.55, 0.8, s1 * 0.7 + s2 * 0.5);
      vec3 col; float a;
      if (uStyle < 0.5) {
        float n = fbm(vP * 0.35 - vec2(0.0, uT * uSpeed * 0.12));
        col = mix(vec3(0.03, 0.2, 0.32), vec3(0.2, 0.55, 0.68), n);
        col = mix(col, vec3(0.93, 0.98, 1.0), clamp(streak + lead * 0.6, 0.0, 1.0));
        a = side * ends * (0.35 + 0.5 * streak + 0.4 * lead);
      } else {
        float chev = smoothstep(0.82, 1.0, fract(vP.y * 0.18 - abs(vP.x) * 0.1 - uT * uSpeed * 0.18));
        col = mix(vec3(0.45, 0.72, 0.95), vec3(0.95, 0.99, 1.0), streak * 0.6 + lead * 0.4);
        a = side * ends * (0.04 + 0.4 * streak + 0.28 * chev + 0.45 * lead);
      }
      ${'float fogv = exp(-uFogD * uFogD * vDepth * vDepth);'}
      a = clamp(a, 0.0, 1.0) * uA;
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uFogC, col, fogv), a * (0.35 + 0.65 * fogv));
    }`;
  // a: where the lane starts (its middle, on the surface), dir: its heading (level), hw: half its width, len: its length, style 'water' | 'wind'
  Gm.flow = function (a, dir, hw, len, style, o) {
    o = o || {};
    const g = new THREE.PlaneGeometry(hw * 2, len, 1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, len / 2);
    const mat = Gm.mat(FLOW_VS, FLOW_FS, { uA: { value: 0 }, uHalf: { value: hw }, uLen: { value: len }, uFront: { value: 0 }, uSpeed: { value: o.speed || 10 }, uStyle: { value: style === 'wind' ? 1 : 0 } },
      { blending: THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 4;
    m.position.set(a.x, a.y, a.z); m.rotation.y = Math.atan2(dir.x, dir.z);
    G.scene.add(m);
    const h = { t: 0, front: 0, a: 0, want: 1, dead: false,
      set(front, alpha) { this.front = front; this.want = alpha; },
      update(dt) {
        this.t += dt;
        this.a = U.damp(this.a, this.want, 8, dt);
        mat.uniforms.uFront.value = this.front; mat.uniforms.uA.value = this.a;
        return !(this.dead && this.a < 0.01);
      },
      end() { this.want = 0; this.dead = true; },
      dispose() { G.scene.remove(m); g.dispose(); mat.dispose(); },
    };
    Gm.fx.push(h);
    return h;
  };

  // ---------------------------------------------------------------- warm-up
  // The shaders made here and in the kinds' files are compiled with the rest while an area loads (fx.js withWarm), so the moment a
  // device first goes off never stalls. Gm.warmMats: functions that each make one such material (the kinds' files add theirs).
  Gm.warmMats = [
    () => Gm.mat(WARN_VS, WARN_FS, { uS: { value: new THREE.Vector2(1, 1) }, uA: { value: 0 }, uK: { value: 0 }, uH: { value: new THREE.Vector2(1, 1) }, uR: { value: 1 }, uCirc: { value: 0 }, uFrom: { value: 0 }, uC: { value: new THREE.Color(0xffffff) } }, { blending: THREE.AdditiveBlending }),
    () => Gm.mat(FLOW_VS, FLOW_FS, { uA: { value: 0 }, uHalf: { value: 1 }, uLen: { value: 1 }, uFront: { value: 0 }, uSpeed: { value: 1 }, uStyle: { value: 0 } }, { side: THREE.DoubleSide }),
  ];
  let warm = null;
  Gm.warmShow = function () {
    const sc = G.scene; if (!sc) return null;
    if (!warm) {
      warm = [];
      for (const f of Gm.warmMats) { try { const m = new THREE.Mesh(plane(), f()); m.frustumCulled = false; m.position.set(0, -500, 0); m.renderOrder = 1; warm.push(m); } catch (e) { console.error(e); } }
    }
    for (const m of warm) { if (m.parent !== sc) sc.add(m); m.visible = true; }
    // (the light wall the bell's wave stands on is one of vfx.js's own: one for a moment, far below)
    const wl = G.vfx && G.vfx.wall ? G.vfx.wall(V(0, -500, 0), 1, 1, 0xffffff, 0.05) : null;
    return () => { for (const m of warm) m.visible = false; if (wl) wl.end(0.01); };
  };

  // a chain of rings from a to b (a hanging chain): one instanced mesh; hot (0..1) makes the links glow red
  let linkG = null;
  Gm.chain = function (a, b, mat, scale) {
    if (!linkG) linkG = new THREE.TorusGeometry(0.5, 0.16, 6, 10);
    const s = scale || 0.16, L = a.distanceTo(b), n = Math.max(2, Math.round(L / (s * 1.32)));
    const im = new THREE.InstancedMesh(linkG, mat, n); im.frustumCulled = false; im.castShadow = true;
    const o = new THREE.Object3D(), d = b.clone().sub(a).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
    for (let i = 0; i < n; i++) {
      o.position.copy(a).addScaledVector(d, (i + 0.5) / n * L);
      o.quaternion.copy(q); o.rotateY(i % 2 ? Math.PI / 2 : 0); o.rotateX(Math.PI / 2);
      o.scale.set(s, s * 1.5, s); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    return im;
  };

  // a little warm or cold light that can be turned up and down (one of the area's pooled lights)
  Gm.light = function (w, x, y, z, o) {
    w.addLight(x, y, z, Object.assign({ flame: 0, emit: false, prio: 0.8 }, o || {}));
    return w.lightSources[w.lightSources.length - 1];
  };

  // ---------------------------------------------------------------- the mid-area save (midsave.js)
  Gm.save = () => Gm.list.map((g) => (g.used ? 1 : 0));
  Gm.restore = function (arr) {
    (arr || []).forEach((v, i) => {
      const g = Gm.list[i]; if (!g || !v || g.used) return;
      g.used = true; g.run = false;
      const K = Gm.K[g.kind];
      try { if (K && K.restore) K.restore(g); } catch (e) { console.error(e); }
    });
  };
})();
