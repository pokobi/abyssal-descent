'use strict';
// Effects made of meshes and shaders, for what point particles alone cannot show: ground areas drawn to the exact radius their
// hit test uses (a bright rim right on it), a curling wave that travels, domes that swell out to a radius, pillars of light,
// sweeping slashes, spikes that burst from the floor, boiling fireballs.
// Every effect runs on game time (FX.update's dt), so a hit timed from the same numbers lands exactly when the picture says it does.
// The one-shot effects (wave, nova, pillar, slash, spikes, ...) take only positions, directions and numbers: co-op replays them by name
// on the other screens (coop/fxsync.js). Areas belong to zones / auras, which every screen already builds on its own.
(function () {
  const VX = (G.vfx = {});
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const rnd = (a, b) => a + Math.random() * (b - a);
  let scene = null;
  const live = [];                 // running effects: { update(dt) -> false when finished, dispose() }
  const TIME = { value: 0 };       // one clock (game time) shared by every material made here
  const FOG = { d: { value: 0.02 }, c: { value: new THREE.Color(0) } };
  const warmMeshes = [];           // one mesh per material kind, shown for a moment while the shaders compile

  // ---------------- GLSL ----------------
  const NOISE = `
    float h21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return v; }
    float fbm3(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vnoise(p); p = p * 2.11 + vec2(1.3, 7.7); a *= 0.5; } return v; }
  `;
  const FOG_U = 'uniform float uFogD; uniform vec3 uFogC; varying float vDepth;';
  const fogAdd = 'float fogv = exp(-uFogD * uFogD * vDepth * vDepth);';
  function mk(vs, fs, uni, o) {
    return new THREE.ShaderMaterial(Object.assign({
      uniforms: Object.assign({ uT: TIME, uFogD: FOG.d, uFogC: FOG.c }, uni),
      vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false,
    }, o || {}));
  }
  const col3 = (c) => new THREE.Color(c);

  // ================================================================ ground areas
  // kinds: the pattern inside. The rim's outer edge is exactly r.
  const AREA_K = { fire: 0, poison: 1, smoke: 2, heal: 3, holy: 4, frost: 5, gravity: 6, whirl: 7, grasp: 8, arrowrain: 9, acid: 10, web: 11, blood: 12, shock: 13, dark: 14, water: 15 };
  const AREA_COL = { // [inside, rim]
    fire: [0xff6a10, 0xffb040], poison: [0x5a9a18, 0x9ae040], smoke: [0x6a6a6a, 0xa0a0a0], heal: [0x50e070, 0xa0ffb0], holy: [0xffd870, 0xfff0b0],
    frost: [0x8ac8ff, 0xe0f4ff], gravity: [0x7a30d0, 0xd0a0ff], whirl: [0x2a80d0, 0xb0e8ff], grasp: [0x40104a, 0xb050d0], arrowrain: [0xd8c8a0, 0xfff0c8],
    acid: [0x8ac010, 0xd0ff40], web: [0xe0e0d8, 0xffffff], blood: [0x900818, 0xff4050], shock: [0x80b0ff, 0xe0f0ff], dark: [0x200830, 0x9050d0], water: [0x2a80d0, 0xb0e8ff],
  };
  const AREA_ADD = { fire: 1, heal: 1, holy: 1, frost: 1, arrowrain: 1, shock: 1 };
  const AREA_VS = `uniform float uS; varying vec2 vP; ${FOG_U.replace('uniform float uFogD; uniform vec3 uFogC; ', '')}
    void main() { vP = position.xz * uS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const AREA_FS = `uniform float uT; uniform float uR; uniform float uA; uniform float uK; uniform float uSeed; uniform float uFlash; uniform float uAdd;
    uniform vec3 uC1; uniform vec3 uC2; ${FOG_U} varying vec2 vP;
    ${NOISE}
    void main() {
      float d = length(vP);
      if (d > uR + 0.7) discard;
      float t = uT + uSeed * 37.0;
      vec2 q = vP + uSeed * 13.0;
      float ang = atan(vP.y, vP.x);
      float e = clamp(d / max(uR, 0.01), 0.0, 1.0);
      float inside = 1.0 - smoothstep(uR - 0.05, uR + 0.02, d);
      // the rim: its outer edge sits exactly on the radius the hit test uses
      float rim = smoothstep(uR - 0.5, uR - 0.06, d) * inside;
      float rimCore = smoothstep(uR - 0.16, uR - 0.03, d) * inside;
      float halo = d > uR ? exp(-(d - uR) * 6.0) * 0.4 : 0.0;
      vec3 col = uC1; float a = 0.0;
      int k = int(uK + 0.5);
      if (k == 0) {            // fire: a bed of flame that crawls and flickers
        float n = fbm(q * 0.5 + vec2(0.0, -t * 0.8)), n2 = fbm(q * 1.4 - vec2(t * 0.4, t * 1.5));
        float heat = clamp(n * 1.45 + n2 * 0.7 - 0.85 - e * 0.15, 0.0, 1.0);
        float em = smoothstep(0.88, 0.97, vnoise(q * 5.0 + vec2(0.0, -t * 2.5))) * (0.5 + 0.5 * sin(t * 9.0 + q.x * 3.0));
        col = mix(vec3(0.35, 0.04, 0.0), vec3(1.0, 0.4, 0.04), smoothstep(0.05, 0.5, heat));
        col = mix(col, vec3(1.0, 0.85, 0.42), smoothstep(0.55, 0.95, heat));
        col += em * vec3(1.0, 0.7, 0.3);
        a = inside * (0.1 + heat * 1.1 + em * 0.8);
      } else if (k == 1 || k == 10) {   // poison / acid: murk with bubbles
        float n = fbm(q * 0.6 + t * vec2(0.15, 0.1));
        float b = vnoise(q * 2.6 + vec2(0.0, t * 0.7)), bub = smoothstep(0.78, 0.9, b) * (1.0 - smoothstep(0.9, 0.97, b));
        vec3 lo = k == 1 ? vec3(0.08, 0.16, 0.02) : vec3(0.18, 0.26, 0.0), hi = k == 1 ? vec3(0.38, 0.62, 0.1) : vec3(0.62, 0.86, 0.1);
        col = mix(lo, hi, n) + bub * vec3(0.4, 0.6, 0.15);
        a = inside * (0.4 + 0.3 * n + bub * 0.4);
      } else if (k == 2) {     // smoke
        float n = fbm(q * 0.35 + vec2(t * 0.1, -t * 0.07));
        col = mix(vec3(0.25), vec3(0.55), n); a = inside * (0.25 + 0.3 * n);
      } else if (k == 3 || k == 4) {    // heal / holy: soft light, a turning ring of runes, pulses moving out
        float runeBand = smoothstep(0.80, 0.83, e) * (1.0 - smoothstep(0.9, 0.93, e));
        float runes = runeBand * step(0.45, fract(ang / 6.2832 * 28.0 + t * (k == 3 ? 0.08 : -0.1))) * (0.6 + 0.4 * vnoise(vec2(ang * 9.0, 1.0)));
        float inner = smoothstep(0.55, 0.57, e) * (1.0 - smoothstep(0.58, 0.6, e));
        float pr = fract(e * 1.6 - t * 0.5), pulse = smoothstep(0.0, 0.04, pr) * (1.0 - smoothstep(0.04, 0.14, pr)) * (1.0 - e);
        float rays = k == 4 ? pow(abs(sin(ang * 6.0 + t * 0.4)), 10.0) * (1.0 - e) : 0.0;
        col = mix(uC1, uC2, runes + inner);
        a = inside * (0.1 + 0.18 * (1.0 - e) + pulse * 0.35 + rays * 0.5) + (runes + inner * 0.6) * 0.8;
      } else if (k == 5) {     // frost: frosted ice with cracks
        float c = abs(fbm(q * 0.8) - 0.5), crack = 1.0 - smoothstep(0.0, 0.035, c);
        float fr = fbm(q * 2.4);
        col = mix(vec3(0.45, 0.7, 1.0), vec3(0.92, 0.98, 1.0), crack * 0.8 + fr * 0.3);
        a = inside * (0.16 + 0.25 * fr + 0.6 * crack);
      } else if (k == 6) {     // gravity: arms that spiral in, a black heart
        float s = sin(ang * 3.0 + log(d + 0.6) * 5.5 + t * 5.0);
        float arms = smoothstep(0.2, 1.0, s) * smoothstep(0.08, 0.5, e);
        float core = 1.0 - smoothstep(0.0, max(0.6, uR * 0.22), d);
        col = mix(vec3(0.16, 0.04, 0.32), vec3(0.8, 0.55, 1.0), arms * e);
        col = mix(col, vec3(0.0), core);
        a = inside * (0.28 + 0.5 * arms) + core * 0.85 * inside;
      } else if (k == 7 || k == 15) {   // whirl / water: churning water with foam arms
        float spin = k == 7 ? 1.0 : 0.15;
        float s = sin(ang * 4.0 + d * 0.9 * spin - t * 4.0 * spin + fbm(q * 0.6) * 3.0);
        float n = fbm(q * 0.7 + vec2(t * 0.3, 0.0));
        float foam = smoothstep(0.55, 0.95, s * 0.6 + n * 0.7);
        col = mix(vec3(0.02, 0.16, 0.38), vec3(0.15, 0.55, 0.85), n);
        col = mix(col, vec3(0.9, 0.97, 1.0), foam);
        a = inside * (0.5 + 0.25 * foam) * (k == 15 ? (0.6 + 0.4 * (1.0 - e)) : 1.0);
      } else if (k == 8 || k == 14) {   // grasp / dark: black ooze with writhing tendrils
        float n = fbm(q * 0.7 + vec2(t * 0.08, -t * 0.05));
        float ten = smoothstep(0.55, 0.78, fbm(vec2(ang * 3.0, d * 0.7 - t * 0.8)));
        col = mix(vec3(0.02, 0.0, 0.04), mix(uC1, uC2, 0.4) * 1.3, ten);
        a = inside * (0.5 + 0.3 * n + 0.2 * ten);
      } else if (k == 9) {     // arrow rain: a faint marked circle
        float rings = smoothstep(0.93, 1.0, abs(sin(d * 1.9)));
        float cross = (1.0 - smoothstep(0.03, 0.09, abs(vP.x))) + (1.0 - smoothstep(0.03, 0.09, abs(vP.y)));
        col = uC1; a = inside * (0.05 + 0.25 * rings + 0.25 * cross * (1.0 - e));
      } else if (k == 11) {    // web: radial strands and rings
        float rad = smoothstep(0.965, 1.0, abs(cos(ang * 7.0 + vnoise(vec2(d, 0.0)) * 0.6)));
        float circ = smoothstep(0.9, 1.0, abs(sin(d * 2.4 + vnoise(vec2(ang * 4.0, 0.0)))));
        col = vec3(0.92); a = inside * (0.06 + 0.65 * max(rad, circ));
      } else if (k == 12) {    // blood: a dark red swirl
        float s = 0.5 + 0.5 * sin(ang * 2.0 - t * 2.4 + d * 0.5 + fbm(q * 0.5) * 4.0);
        col = mix(vec3(0.12, 0.0, 0.02), vec3(0.75, 0.04, 0.1), s * (0.4 + 0.6 * e));
        a = inside * (0.3 + 0.4 * s);
      } else if (k == 13) {    // shock: electric arcs crawling over the floor
        float arcs = 1.0 - smoothstep(0.0, 0.025, abs(fbm(q * 1.2 + vec2(t * 3.0, -t * 2.0)) - 0.5));
        col = mix(uC1, vec3(1.0), arcs); a = inside * (0.06 + 0.8 * arcs);
      }
      col = mix(col, uC2, rim * 0.8);
      col = mix(col, vec3(1.0), rimCore * 0.35 + uFlash * rim * 0.5);
      a += rim * 0.55 + rimCore * 0.5 + halo * 0.5 + uFlash * rim;
      ${fogAdd}
      if (uAdd > 0.5) col *= fogv; else col = mix(uFogC, col, fogv);
      a = clamp(a, 0.0, 1.0) * uA;
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a);
    }`;
  let areaGeo = null;
  function areaMat(kind) {
    const add = !!AREA_ADD[kind], c = AREA_COL[kind] || AREA_COL.fire;
    return mk(AREA_VS, AREA_FS, {
      uS: { value: 1 }, uR: { value: 1 }, uA: { value: 0 }, uK: { value: AREA_K[kind] ?? 0 }, uSeed: { value: Math.random() }, uFlash: { value: 1 }, uAdd: { value: add ? 1 : 0 },
      uC1: { value: col3(c[0]) }, uC2: { value: col3(c[1]) },
    }, { blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }
  // a ground area: r is the hit radius. o: { follow: an object with a .pos / a Vector3 to stay on, col: [inside, rim], fadeIn, lift }
  // returns a handle: .pos (move it), .r (change it), .end(fade) to let it go
  VX.area = function (c, r, kind, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(areaGeo, areaMat(kind)); m.frustumCulled = false; m.renderOrder = 3;
    if (o.col) { m.material.uniforms.uC1.value.set(o.col[0]); m.material.uniforms.uC2.value.set(o.col[1] ?? o.col[0]); }
    scene.add(m);
    const h = { pos: c.clone(), r, t: 0, dur: dur ?? Infinity, fade: 0.35, dead: false, m, lift: o.lift ?? 0.05, follow: o.follow || null, a0: o.alpha ?? 1, fadeIn: o.fadeIn ?? 0.15, grow: o.grow || 0, lease: o.lease || 0,
      end(f) { if (this.dur > this.t + (f ?? 0.35)) { this.dur = this.t + (f ?? 0.35); this.fade = f ?? 0.35; } },
      touch() { this.seen = this.t; },
      update(dt) {
        this.t += dt;
        if (this.lease && this.t - (this.seen || 0) > this.lease) this.end(0.2); // (held by a zone / an aura: gone soon after they stop holding it)
        if (this.follow) { const p = this.follow.pos || this.follow; this.pos.set(p.x, p.y, p.z); }
        const R = this.grow ? this.r * ease(Math.min(1, this.t / this.grow)) : this.r; // (grow: it spreads with a nova's front, on the same curve)
        const S = R + 0.7, u = m.material.uniforms;
        m.scale.set(S, 1, S); m.position.set(this.pos.x, this.pos.y + this.lift, this.pos.z);
        u.uS.value = S; u.uR.value = Math.max(0.01, R);
        const left = this.dur - this.t;
        u.uA.value = this.a0 * Math.min(1, this.t / this.fadeIn) * Math.min(1, left / this.fade);
        u.uFlash.value = Math.max(0, 1 - this.t / 0.35);
        return left > 0;
      },
      dispose() { scene.remove(m); m.material.dispose(); this.dead = true; },
    };
    h.update(0);
    live.push(h);
    return h;
  };

  // ================================================================ shells: domes, bubbles, funnels (fresnel + noise bands)
  const SHELL_VS = `varying vec3 vN; varying vec3 vV; varying vec3 vO; varying float vDepth;
    void main() { vO = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const SHELL_FS = `uniform float uT; uniform float uA; uniform vec3 uC; uniform vec3 uC2; uniform float uStyle; uniform float uSeed; ${FOG_U}
    varying vec3 vN; varying vec3 vV; varying vec3 vO;
    ${NOISE}
    void main() {
      float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float ang = atan(vO.z, vO.x), h = vO.y;
      int s = int(uStyle + 0.5);
      float pat = 0.0;
      if (s == 0) pat = fbm(vec2(ang * 3.0, h * 4.0 - uT * 2.0) + uSeed * 9.0);                                   // plain energy
      else if (s == 1) { float c = abs(fbm(vec2(ang * 5.0, h * 6.0) + uSeed * 9.0) - 0.5); pat = 1.0 - smoothstep(0.0, 0.05, c); } // ice: facets / cracks
      else if (s == 2) { float c = abs(fbm(vec2(ang * 6.0 + uT * 4.0, h * 8.0 - uT * 6.0)) - 0.5); pat = 1.0 - smoothstep(0.0, 0.03, c); } // electric arcs
      else if (s == 3) pat = pow(abs(sin(ang * 10.0 + uT * 0.6)), 6.0) * (1.0 - h);                                // holy rays
      else if (s == 4) pat = fbm(vec2(ang * 2.0 + uT * 2.5, h * 3.0 - uT * 1.5));                                  // fire / blood churn
      else if (s == 5) { pat = sin(ang * 3.0 + h * 9.0 - uT * 6.0) * 0.5 + 0.5; }                                  // spiral bands (vortex funnel)
      vec3 col = mix(uC, uC2, clamp(pat, 0.0, 1.0));
      float a = (f * 0.85 + pat * 0.45 * (0.3 + f)) * uA;
      ${fogAdd}
      col *= fogv;
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * (1.0 + f * 0.6), clamp(a, 0.0, 1.0));
    }`;
  const SHELL_STYLE = { energy: 0, ice: 1, emp: 2, holy: 3, fire: 4, blood: 4, spiral: 5 };
  let domeGeo = null, sphGeo = null, cylGeo = null, coneGeo = null;
  function shellMat(c1, c2, style) {
    return mk(SHELL_VS, SHELL_FS, { uA: { value: 1 }, uC: { value: col3(c1) }, uC2: { value: col3(c2 ?? 0xffffff) }, uStyle: { value: SHELL_STYLE[style] ?? 0 }, uSeed: { value: Math.random() } },
      { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }

  // ================================================================ nova: a dome and a ground shock that swell out to r
  // the radius grows as r * (1 - (1 - k)^2): VX.novaTime gives the moment it reaches a distance (abilities time their hits by it)
  const ease = (k) => 1 - (1 - k) * (1 - k);
  VX.novaTime = (d, r, dur) => dur * (1 - Math.sqrt(Math.max(0, 1 - Math.min(1, Math.max(0, d) / r))));
  const NOVA_STYLE = {
    ice: { c1: 0x9ad8ff, c2: 0xffffff, shell: 'ice', ground: 0xcfefff, hk: 0.45 },
    holy: { c1: 0xffd070, c2: 0xfff8e0, shell: 'holy', ground: 0xffe8a0, hk: 0.55 },
    emp: { c1: 0x6aa8ff, c2: 0xe8f4ff, shell: 'emp', ground: 0xa8d0ff, hk: 0.6 },
    shock: { c1: 0xd0b890, c2: 0xffffff, shell: 'energy', ground: 0xffe0b0, hk: 0.3 },
    fire: { c1: 0xff5010, c2: 0xffd060, shell: 'fire', ground: 0xffa040, hk: 0.45 },
    dark: { c1: 0x7020c0, c2: 0xe0b0ff, shell: 'energy', ground: 0xb070ff, hk: 0.5 },
    blood: { c1: 0xa00818, c2: 0xff6070, shell: 'blood', ground: 0xff4050, hk: 0.45 },
    gold: { c1: 0xffc040, c2: 0xfff0b0, shell: 'energy', ground: 0xffd070, hk: 0.6 },
    water: { c1: 0x2a80d0, c2: 0xd0f0ff, shell: 'energy', ground: 0x9ad8ff, hk: 0.35 },
    shout: { c1: 0xff9040, c2: 0xffe0a0, shell: 'energy', ground: 0xffc070, hk: 0.4 },
    time: { c1: 0x7a98c0, c2: 0xf0f8ff, shell: 'energy', ground: 0xd0e4ff, hk: 0.3 },
    heal: { c1: 0x40d060, c2: 0xd0ffd8, shell: 'energy', ground: 0xa0ffb0, hk: 0.4 },
  };
  // c: centre (on the floor), r: radius (the hit radius), dur: time to reach it. o: { style, dome (false: ground only), hk (dome height / r), arc: [dir, half angle] for a cone }
  VX.nova = function (c, r, dur, o) {
    o = o || {};
    const S = NOVA_STYLE[o.style] || NOVA_STYLE.shock;
    const pos = c.clone();
    let dome = null;
    if (o.dome !== false) { dome = new THREE.Mesh(domeGeo, shellMat(S.c1, S.c2, S.shell)); dome.position.copy(pos); dome.frustumCulled = false; dome.renderOrder = 7; scene.add(dome); }
    const ring = G.fx.shockRing(pos, o.ground ?? S.ground, Math.max(0.35, Math.min(0.85, r * 0.06)), r + 2);
    const hk = o.hk ?? S.hk, life = dur + 0.45;
    let t = 0;
    live.push({
      update(dt) {
        t += dt;
        const k = Math.min(1, t / dur), R = r * ease(k);
        const fade = t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.45);
        if (dome) { dome.scale.set(Math.max(0.05, R), Math.max(0.05, R * hk), Math.max(0.05, R)); dome.material.uniforms.uA.value = (0.35 + 0.65 * (1 - k)) * fade; }
        ring.set(R, fade);
        return t < life;
      },
      dispose() { if (dome) { scene.remove(dome); dome.material.dispose(); } ring.dispose(); },
    });
    // style extras
    if (o.style === 'ice') VX.spikes(ringPts(pos, r * 0.92, Math.min(40, Math.round(r * 2.2))), { kind: 'ice', r: 0.5, h: Math.min(2.2, 0.6 + r * 0.09), n: 2, dur: 1.4, delay: dur * 0.85 });
    if (o.style === 'holy') for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, d = Math.random() * r * 0.8; VX.pillar(V(pos.x + Math.cos(a) * d, pos.y, pos.z + Math.sin(a) * d), 0.25, 6 + Math.random() * 4, 0xffe8a0, 0.6, { delay: Math.random() * dur, ground: false }); }
    if (o.style === 'emp') for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28; setGameTimeout(() => { const R2 = r * 0.8; G.fx.lightning(V(pos.x, pos.y + r * hk * 0.6, pos.z), V(pos.x + Math.cos(a) * R2, pos.y + 0.3, pos.z + Math.sin(a) * R2), 0xb0d4ff); }, Math.random() * dur); }
    return { pos, r, dur };
  };
  function ringPts(c, r, n) { const out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.random() * 0.2; out.push(V(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r)); } return out; }
  VX.ringPts = ringPts;

  // ================================================================ pillars / beams of light
  const BEAM_VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying float vDepth;
    void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const BEAM_FS = `uniform float uT; uniform float uA; uniform vec3 uC; uniform vec3 uC2; uniform float uSeed; uniform float uSpeed; uniform float uEnds; ${FOG_U}
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${NOISE}
    void main() {
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float core = pow(facing, 3.0);                                  // bright through the middle, thin at the edges
      float streak = fbm(vec2(vUv.x * 8.0 + uSeed * 5.0, vUv.y * 3.0 - uT * uSpeed));
      float ends = uEnds > 0.5 ? smoothstep(0.0, 0.1, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y)) : smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
      vec3 col = mix(uC, uC2, core * 0.55 + streak * 0.2);
      float a = (core * 0.55 + facing * 0.12 + streak * 0.3 * facing) * ends * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * fogv, clamp(a, 0.0, 1.0));
    }`;
  function beamMat(c1, c2, speed) {
    return mk(BEAM_VS, BEAM_FS, { uA: { value: 1 }, uC: { value: col3(c1) }, uC2: { value: col3(c2 ?? 0xffffff) }, uSeed: { value: Math.random() }, uSpeed: { value: speed ?? 2 }, uEnds: { value: 0 } },
      { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }
  // a column of light standing on c: r = its radius (the hit radius when it hurts), h = its height. o: { delay, follow, ground (a glow on the floor), c2, grow }
  // returns a handle: .pos to move it, .end() to let it go
  VX.pillar = function (c, r, h, col, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(cylGeo, beamMat(col, o.c2 ?? 0xffffff, o.speed ?? 3)); m.frustumCulled = false; m.renderOrder = 8; m.visible = false; scene.add(m);
    const inner = new THREE.Mesh(cylGeo, beamMat(0xffffff, 0xffffff, (o.speed ?? 3) * 1.5)); inner.frustumCulled = false; inner.renderOrder = 8; inner.visible = false; scene.add(inner);
    const ground = o.ground === false ? null : VX.area(c, r, o.groundKind || 'holy', Infinity, { col: [col, o.c2 ?? 0xffffff], alpha: 0.7, follow: null });
    if (ground) ground.m.visible = false;
    const h0 = { pos: c.clone(), r, t: -(o.delay || 0), dur, dead: false, lease: o.lease || 0, seen: -(o.delay || 0),
      end(f) { this.dur = Math.min(this.dur, Math.max(0, this.t) + (f ?? 0.25)); },
      touch() { this.seen = this.t; },
      update(dt) {
        this.t += dt;
        if (this.lease && this.t - this.seen > this.lease) this.end(0.2);
        if (this.t < 0) return true;
        if (o.follow) this.pos.copy(o.follow.pos || o.follow);
        const left = this.dur - this.t, k = Math.min(1, this.t / 0.12), fade = Math.min(1, left / 0.25);
        const grow = o.grow === false ? 1 : 0.4 + 0.6 * k;
        m.visible = inner.visible = true;
        m.scale.set(this.r * grow, h, this.r * grow); m.position.set(this.pos.x, this.pos.y + h / 2, this.pos.z);
        inner.scale.set(this.r * 0.35 * grow, h, this.r * 0.35 * grow); inner.position.copy(m.position);
        m.material.uniforms.uA.value = fade * (0.8 + 0.2 * Math.sin(this.t * 40)); inner.material.uniforms.uA.value = fade * 0.6;
        if (ground) { ground.pos.copy(this.pos); ground.r = this.r; ground.m.visible = true; ground.dur = this.dur; ground.t = this.t; }
        return left > 0;
      },
      dispose() { scene.remove(m); scene.remove(inner); m.material.dispose(); inner.material.dispose(); if (ground) ground.end(0.01); this.dead = true; },
    };
    live.push(h0);
    return h0;
  };

  // ================================================================ slashes: a crescent that sweeps around a point
  const SLASH_VS = `attribute float aU; attribute float aV; varying float vU; varying float vV2; varying float vDepth;
    void main() { vU = aU; vV2 = aV; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const SLASH_FS = `uniform float uT; uniform float uP; uniform float uA; uniform vec3 uC; uniform float uTail; ${FOG_U}
    varying float vU; varying float vV2;
    ${NOISE}
    void main() {
      float behind = uP - vU;                     // how far behind the leading edge this point is (0..1 of the arc)
      if (behind < 0.0 || behind > uTail) discard;
      float k = 1.0 - behind / uTail;
      float edge = smoothstep(0.0, 0.25, vV2) * (1.0 - smoothstep(0.75, 1.0, vV2));
      float hot = pow(vV2, 3.0);                   // the outer edge is the blade's path: white-hot
      float n = vnoise(vec2(vU * 30.0, vV2 * 4.0 - uT * 3.0));
      vec3 col = mix(uC, vec3(1.0), hot * k);
      float a = (k * k * (0.35 + 0.65 * hot) + n * 0.12 * k) * edge * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * fogv * 1.4, clamp(a, 0.0, 1.0));
    }`;
  function arcGeo(r0, r1, arc, segs) {
    const g = new THREE.BufferGeometry(), pos = [], au = [], av = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, a = -arc / 2 + arc * u;
      for (let j = 0; j <= 1; j++) { const r = j ? r1 : r0; pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); au.push(u); av.push(j); }
      if (i < segs) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aU', new THREE.Float32BufferAttribute(au, 1)); g.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1));
    g.setIndex(idx); return g;
  }
  // c: the pivot, dir: the middle of the sweep, r: its reach (the hit reach), arc: its full angle. o: { tilt (radians about the sweep's axis), r0, tail, dur, cw }
  VX.slash = function (c, dir, r, arc, col, o) {
    o = o || {};
    const g = arcGeo(o.r0 ?? r * 0.45, r, arc, 28);
    const mat = mk(SLASH_VS, SLASH_FS, { uP: { value: 0 }, uA: { value: 1 }, uC: { value: col3(col) }, uTail: { value: o.tail ?? 0.6 } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 8;
    m.position.copy(c); m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(dir.x, dir.z); m.rotation.z = o.tilt || 0;
    if (o.cw) m.scale.x = -1;
    scene.add(m);
    const dur = o.dur ?? 0.18; let t = 0;
    live.push({
      update(dt) { t += dt; const k = t / dur; mat.uniforms.uP.value = Math.min(1 + (o.tail ?? 0.6), k * (1 + (o.tail ?? 0.6))); mat.uniforms.uA.value = 1; return k < 1; },
      dispose() { scene.remove(m); g.dispose(); mat.dispose(); },
    });
  };

  // ================================================================ spikes that burst from the floor (rock / ice / bone / blood)
  const SPIKE_MAX = 600;
  const spk = {};          // kind -> { mesh, list }
  function spikeKind(kind) {
    if (spk[kind]) return spk[kind];
    let mat;
    if (kind === 'ice') mat = new THREE.MeshStandardMaterial({ color: 0xc8ecff, emissive: 0x3a7ab0, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 });
    else if (kind === 'bone') mat = new THREE.MeshStandardMaterial({ color: 0xe0d6c0, roughness: 0.7 });
    else if (kind === 'blood') mat = new THREE.MeshStandardMaterial({ color: 0x7a0612, emissive: 0x3a0006, roughness: 0.3 });
    else if (kind === 'dark') mat = new THREE.MeshStandardMaterial({ color: 0x1a0c24, emissive: 0x4a1a70, emissiveIntensity: 0.7, roughness: 0.4 });
    else mat = new THREE.MeshStandardMaterial({ color: 0x8c7c68, roughness: 0.92, flatShading: true, emissive: 0x1a120a });
    const geo = new THREE.ConeGeometry(1, 1, kind === 'ice' ? 5 : 6, 1); geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, SPIKE_MAX); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = kind !== 'ice';
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return (spk[kind] = { mesh, list: [] });
  }
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V(), _p = V();
  // points: where they burst (each point gets a cluster within r). o: { kind, r, h, n, dur, delay, step (a delay added per point, in order), rise }
  VX.spikes = function (points, o) {
    o = o || {};
    const S = spikeKind(o.kind || 'rock');
    const r = o.r ?? 1, h = o.h ?? 1.6, n = o.n ?? 3;
    points.forEach((p, i) => {
      for (let k = 0; k < n; k++) {
        if (S.list.length >= SPIKE_MAX) return;
        const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * r * 0.75;
        const hh = h * rnd(0.55, 1) * (k === 0 ? 1 : 0.8);
        S.list.push({ x: p.x + Math.cos(a) * d, y: p.y, z: p.z + Math.sin(a) * d, w: hh * rnd(0.16, 0.26), h: hh, tx: rnd(-0.35, 0.35), tz: rnd(-0.35, 0.35), ry: Math.random() * 6.28,
          t: -((o.delay || 0) + (o.step || 0) * i + Math.random() * 0.03), dur: o.dur ?? 1.2, rise: o.rise ?? 0.09, dust: k === 0 && o.kind !== 'ice' });
      }
    });
  };
  function updateSpikes(dt) {
    for (const kind in spk) {
      const S = spk[kind]; let n = 0;
      for (let i = S.list.length - 1; i >= 0; i--) {
        const s = S.list[i]; const was = s.t; s.t += dt;
        if (s.t >= s.dur + 0.3) { S.list.splice(i, 1); continue; }
        if (s.t < 0) continue;
        if (was < 0 && s.dust) G.fx.dust(V(s.x, s.y + 0.1, s.z), V(0, 1, 0), 0x7a6a50, 2);
        const up = Math.min(1, s.t / s.rise), down = s.t > s.dur ? 1 - (s.t - s.dur) / 0.3 : 1;
        const k = Math.max(0.001, up * down);
        _e.set(s.tx, s.ry, s.tz); _q.setFromEuler(_e); _p.set(s.x, s.y - (1 - k) * s.h * 0.3, s.z); _s.set(s.w, s.h * k, s.w);
        S.mesh.setMatrixAt(n++, _m4.compose(_p, _q, _s));
      }
      S.mesh.count = n; S.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ================================================================ water: a curling wave that travels
  const WAVE_VS = `attribute float aU; uniform float uHalf; varying float vU; varying float vX; varying vec3 vN; varying vec3 vV; varying float vK; varying float vDepth;
    uniform float uT;
    void main() {
      vU = aU; vX = position.x;
      float k = smoothstep(0.0, 0.22, 1.0 - abs(position.x) / uHalf);      // the two ends of the wave lean back and sink a little
      vK = k;
      vec3 p = position;
      p.y *= 0.55 + 0.45 * k;
      p.z -= (1.0 - k) * 1.2;
      p.y += sin(position.x * 0.7 + uT * 3.0) * 0.12 * aU + sin(position.x * 1.9 - uT * 4.0) * 0.06 * aU;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const WAVE_FS = `uniform float uT; uniform float uA; ${FOG_U} varying float vU; varying float vX; varying vec3 vN; varying vec3 vV; varying float vK;
    ${NOISE}
    void main() {
      vec3 deep = vec3(0.0, 0.07, 0.18), mid = vec3(0.01, 0.3, 0.46), light = vec3(0.16, 0.62, 0.74);
      vec3 col = mix(deep, mid, smoothstep(0.0, 0.5, vU));
      col = mix(col, light, smoothstep(0.5, 0.78, vU) * 0.8);
      float streak = smoothstep(0.6, 0.88, fbm(vec2(vX * 1.1, vU * 8.0 - uT * 4.0)));
      col += streak * 0.16 * vec3(0.6, 0.9, 1.0);
      float fn = fbm(vec2(vX * 0.4, vU * 3.0 - uT * 2.4));
      float foam = smoothstep(0.8, 0.92, vU + (fn - 0.5) * 0.3);
      float lace = smoothstep(0.55, 0.75, vU) * smoothstep(0.7, 0.86, fbm(vec2(vX * 2.2, vU * 14.0 - uT * 5.0))) * 0.45;
      col = mix(col, vec3(0.94, 0.98, 1.0), max(foam, lace));
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
      col += fres * 0.2 * vec3(0.5, 0.8, 1.0);
      float a = (0.74 + 0.26 * max(foam, lace)) * uA * (0.6 + 0.4 * vK) * smoothstep(0.0, 0.08, vU);
      ${fogAdd}
      col = mix(uFogC, col, fogv);
      gl_FragColor = vec4(col, a);
    }`;
  function waveGeo(w, H) {
    // the cross-section (forward = +z): the back slope, the crest at z = 0, a lip curling forward and down
    const cur = new THREE.CatmullRomCurve3([V(0, 0, -H * 1.5), V(0, H * 0.22, -H * 0.85), V(0, H * 0.7, -H * 0.3), V(0, H, 0), V(0, H * 0.97, H * 0.22), V(0, H * 0.78, H * 0.36), V(0, H * 0.55, H * 0.3)]);
    const NU = 22, NX = Math.max(12, Math.round(w * 2.2)), prof = cur.getPoints(NU);
    const pos = [], au = [], idx = [];
    for (let j = 0; j <= NX; j++) {
      const x = -w / 2 + w * j / NX;
      for (let i = 0; i <= NU; i++) { pos.push(x, prof[i].y, prof[i].z); au.push(i / NU); }
    }
    for (let j = 0; j < NX; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aU', new THREE.Float32BufferAttribute(au, 1));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // the churned water a wave leaves behind it: foam right behind the crest, thinning out a few metres back, then draining away
  const SHEET_VS = `varying vec2 vP; varying float vDepth;
    void main() { vP = vec2(position.x, position.z); vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const SHEET_FS = `uniform float uT; uniform float uA; uniform float uFront; uniform float uHalf; ${FOG_U} varying vec2 vP;
    ${NOISE}
    void main() {
      float back = uFront - vP.y;                       // metres behind the leading edge
      if (back < 0.0) discard;
      float side = 1.0 - smoothstep(uHalf * 0.82, uHalf, abs(vP.x));
      float n = fbm(vec2(vP.x * 0.5, vP.y * 0.35 - uT * 1.6)), f2 = fbm(vec2(vP.x * 1.4 + uT, vP.y * 1.2 - uT * 3.0));
      float foam = smoothstep(0.55, 0.85, n * 0.6 + f2 * 0.6) * exp(-back * 0.12);
      vec3 col = mix(vec3(0.02, 0.16, 0.3), vec3(0.12, 0.48, 0.66), n);
      col = mix(col, vec3(0.92, 0.97, 1.0), foam);
      float a = side * (0.62 * exp(-back * 0.06) + foam * 0.35) * uA;
      ${fogAdd}
      col = mix(uFogC, col, fogv);
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a);
    }`;
  // a wave that rises at a + f * start and rolls forward along f to a + f * len at `speed`, `w` wide (centred on the lane).
  // VX.waveFront(t, start, speed) = how far along the lane its leading edge is at time t (the hit uses the same)
  VX.WAVE_H = 5.2;
  VX.waveLead = (H) => (H || VX.WAVE_H) * 0.36;
  VX.waveFront = (t, start, speed, len, H) => Math.min(len, start + speed * t) + VX.waveLead(H);
  VX.wave = function (a, f, len, w, speed, o) {
    o = o || {};
    const H = o.h || VX.WAVE_H, start = o.start ?? 1.5, dir = V(f.x, 0, f.z).normalize();
    const g = waveGeo(w, H), mat = mk(WAVE_VS, WAVE_FS, { uA: { value: 0 }, uHalf: { value: w / 2 } }, { side: THREE.DoubleSide });
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 9;
    m.rotation.y = Math.atan2(dir.x, dir.z); scene.add(m);
    const side = V(dir.z, 0, -dir.x);
    const travel = Math.max(0.01, (len - start) / speed);
    // the sheet: a plane laid along the lane from the caster to the end (its own coordinates: x across, z along)
    const sg = new THREE.PlaneGeometry(w, len + 2, 1, 1); sg.rotateX(-Math.PI / 2); sg.translate(0, 0, (len + 2) / 2 - 1);
    const smat = mk(SHEET_VS, SHEET_FS, { uA: { value: 1 }, uFront: { value: 0 }, uHalf: { value: w / 2 } }, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const sheet = new THREE.Mesh(sg, smat); sheet.frustumCulled = false; sheet.renderOrder = 3; sheet.rotation.y = m.rotation.y;
    { const fl = G.world ? G.world.floorBelow(a.x, a.y + 1, a.z) : a.y; sheet.position.set(a.x, (fl > -50 ? fl : a.y) + 0.06, a.z); }
    scene.add(sheet);
    let t = 0;
    live.push({
      update(dt) {
        t += dt;
        const s = Math.min(len, start + speed * t), crash = Math.max(0, t - travel) / 0.4;
        const rise = Math.min(1, t / 0.18), sink = 1 - Math.min(1, crash);
        const fl = G.world ? G.world.floorBelow(a.x + dir.x * s, a.y + 2, a.z + dir.z * s) : a.y;
        m.position.set(a.x + dir.x * s, (fl > -50 ? fl : a.y) - 0.15, a.z + dir.z * s);
        m.scale.set(1, Math.max(0.01, rise * (0.35 + 0.65 * sink)), 1 + crash * 0.4);
        mat.uniforms.uA.value = Math.min(1, rise * 1.5) * sink;
        smat.uniforms.uFront.value = s; smat.uniforms.uA.value = Math.min(1, t / 0.2) * Math.max(0, 1 - Math.max(0, t - travel - 0.2) / 0.8);
        // spray off the crest, churned water at the foot, a wake behind
        const cx = m.position.x, cy = m.position.y, cz = m.position.z;
        if (sink > 0.05) {
          const n = Math.round(w * 1.2 * dt * 60 * 0.25);
          for (let i = 0; i < n; i++) {
            const u = rnd(-0.5, 0.5) * w * 0.92, hk = 1 - Math.pow(Math.abs(u) / (w / 2), 4) * 0.45;
            const px = cx + side.x * u, pz = cz + side.z * u, py = cy + H * hk * m.scale.y;
            G.fx.norm.spawn(px + dir.x * H * 0.2, py, pz + dir.z * H * 0.2, dir.x * rnd(3, 8) + rnd(-1, 1), rnd(1, 5), dir.z * rnd(3, 8) + rnd(-1, 1), rnd(0.5, 0.9), 0.35, 1.3, 0.85, 0.94, 1.0, 0.75, 6, 1.2);
            if (Math.random() < 0.5) G.fx.norm.spawn(px - dir.x * H * 1.2, cy + 0.3, pz - dir.z * H * 1.2, -dir.x * rnd(0, 2), rnd(0.2, 1.2), -dir.z * rnd(0, 2), rnd(0.8, 1.4), 0.8, 2.4, 0.55, 0.78, 0.92, 0.5, -0.2, 1.5);
          }
        }
        if (crash > 0 && !this.crashed) {
          this.crashed = true;
          for (let i = 0; i < w * 3; i++) { const u = rnd(-0.5, 0.5) * w; G.fx.norm.spawn(cx + side.x * u + dir.x * 1.5, cy + rnd(0.5, H), cz + side.z * u + dir.z * 1.5, dir.x * rnd(2, 7) + rnd(-2, 2), rnd(2, 7), dir.z * rnd(2, 7) + rnd(-2, 2), rnd(0.7, 1.2), 0.5, 2.2, 0.85, 0.94, 1.0, 0.8, 9, 1); }
        }
        return t < travel + 1.0;
      },
      dispose() { scene.remove(m); g.dispose(); mat.dispose(); scene.remove(sheet); sg.dispose(); smat.dispose(); },
    });
    return { travel, start, H };
  };

  // ================================================================ fireballs: a boiling ball of flame (explosions, fire projectiles, meteors)
  const FIRE_VS = `uniform float uT; uniform float uSeed; varying vec3 vO; varying vec3 vN; varying vec3 vV; varying float vDepth;
    ${NOISE}
    void main() {
      vO = position;
      float n = vnoise(position.xy * 2.5 + vec2(uT * 2.0, uSeed * 7.0)) + vnoise(position.zy * 2.5 - vec2(uT * 1.6, 0.0));
      vec3 p = position * (1.0 + (n - 1.0) * 0.18);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const FIRE_FS = `uniform float uT; uniform float uA; uniform float uHeat; uniform float uSeed; uniform vec3 uTint; ${FOG_U} varying vec3 vO; varying vec3 vN; varying vec3 vV;
    ${NOISE}
    void main() {
      float facing = abs(dot(normalize(vN), normalize(vV)));
      float n = fbm(vO.xy * 2.2 + vec2(uSeed * 5.0, -uT * 2.2)) * 0.6 + fbm(vO.zy * 2.6 + vec2(uT * 1.4, uSeed)) * 0.6;
      float heat = clamp(n * 0.9 + facing * 0.55 * uHeat - (1.0 - uHeat) * 0.5, 0.0, 1.2);
      vec3 col = mix(vec3(0.12, 0.03, 0.01), vec3(0.95, 0.3, 0.04), smoothstep(0.2, 0.55, heat));
      col = mix(col, vec3(1.0, 0.75, 0.3), smoothstep(0.55, 0.85, heat));
      col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(0.85, 1.1, heat));
      col *= uTint;
      float a = smoothstep(0.05, 0.35, heat) * (0.35 + 0.65 * facing) * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * fogv * 1.6, clamp(a, 0.0, 1.0));
    }`;
  function fireMat(tint) { return mk(FIRE_VS, FIRE_FS, { uA: { value: 1 }, uHeat: { value: 1 }, uSeed: { value: Math.random() }, uTint: { value: col3(tint ?? 0xffffff) } }, { blending: THREE.AdditiveBlending }); }
  VX.fireMat = fireMat; VX.shellMat = (c1, c2, style) => shellMat(c1, c2, style);
  // a fireball for a blast: swells to 0.85 r (the blast hurts out to r), then cools and rises. tint: a colour the flame is multiplied by (white = plain fire)
  const fbPool = [];
  VX.fireball = function (p, r, tint) {
    let o = fbPool.find((x) => !x.on);
    if (!o) { if (fbPool.length >= 14) o = fbPool[0]; else { const m = new THREE.Mesh(sphGeo, fireMat()); m.frustumCulled = false; m.renderOrder = 9; scene.add(m); o = { m }; fbPool.push(o); } }
    o.on = true; o.t = 0; o.r = r; o.pos = p.clone(); o.m.visible = true;
    o.m.material.uniforms.uTint.value.set(tint ?? 0xffffff); o.m.material.uniforms.uSeed.value = Math.random();
  };
  // a burst of light for a blast that is not fire (purple, blue, green ...): a glowing shell that swells to r and fades
  const bsPool = [];
  VX.burst = function (p, r, col) {
    let o = bsPool.find((x) => !x.on);
    if (!o) { if (bsPool.length >= 10) o = bsPool[0]; else { const m = new THREE.Mesh(sphGeo, shellMat(0xffffff, 0xffffff, 'energy')); m.frustumCulled = false; m.renderOrder = 9; scene.add(m); o = { m }; bsPool.push(o); } }
    o.on = true; o.t = 0; o.r = r; o.m.position.copy(p); o.m.visible = true;
    o.m.material.uniforms.uC.value.set(col ?? 0xa070ff); o.m.material.uniforms.uC2.value.set(0xffffff);
  };
  function updateFireballs(dt) {
    for (const o of bsPool) {
      if (!o.on) continue;
      o.t += dt; const k = Math.min(1, o.t / 0.16), f = Math.max(0, 1 - Math.max(0, o.t - 0.1) / 0.3);
      o.m.scale.setScalar(Math.max(0.05, o.r * (0.2 + 0.8 * (1 - Math.pow(1 - k, 3)))));
      o.m.material.uniforms.uA.value = f * 1.4;
      if (f <= 0) { o.on = false; o.m.visible = false; }
    }
    for (const o of fbPool) {
      if (!o.on) continue;
      o.t += dt;
      const k = o.t, grow = Math.min(1, k / 0.12), cool = Math.max(0, (k - 0.1) / 0.55);
      const R = o.r * (0.25 + 0.6 * (1 - Math.pow(1 - grow, 3))) * (1 + cool * 0.15);
      o.m.scale.setScalar(Math.max(0.05, R));
      o.m.position.set(o.pos.x, o.pos.y + cool * o.r * 0.35, o.pos.z);
      o.m.material.uniforms.uHeat.value = Math.max(0, 1 - cool * 1.1);
      o.m.material.uniforms.uA.value = Math.max(0, 1 - cool);
      if (cool >= 1) { o.on = false; o.m.visible = false; }
    }
  }

  // ================================================================ a wall of light standing on a circle (the rim of a holy ground, a barrier)
  const WALL_VS = `varying vec2 vUv; varying float vDepth;
    void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const WALL_FS = `uniform float uT; uniform float uA; uniform vec3 uC; ${FOG_U} varying vec2 vUv;
    ${NOISE}
    void main() {
      float up = 1.0 - vUv.y;
      float streak = fbm(vec2(vUv.x * 40.0, vUv.y * 2.0 - uT * 1.2));
      float a = up * up * (0.35 + 0.65 * streak) * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uC, vec3(1.0), up * 0.4) * fogv, clamp(a, 0.0, 1.0));
    }`;
  VX.wall = function (c, r, h, col, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(cylGeo, mk(WALL_VS, WALL_FS, { uA: { value: 0 }, uC: { value: col3(col) } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 7; scene.add(m);
    const hd = { pos: c.clone(), r, t: 0, dur: dur ?? Infinity, fade: 0.35, follow: o.follow || null, a0: o.alpha ?? 0.8, lease: o.lease || 0,
      end(f) { if (this.dur > this.t + (f ?? 0.35)) { this.dur = this.t + (f ?? 0.35); this.fade = f ?? 0.35; } },
      touch() { this.seen = this.t; },
      update(dt) {
        this.t += dt;
        if (this.lease && this.t - (this.seen || 0) > this.lease) this.end(0.2);
        if (this.follow) this.pos.copy(this.follow.pos || this.follow);
        m.scale.set(this.r, h, this.r); m.position.set(this.pos.x, this.pos.y + h / 2, this.pos.z);
        m.material.uniforms.uA.value = this.a0 * Math.min(1, this.t / 0.25) * Math.min(1, (this.dur - this.t) / this.fade);
        return this.t < this.dur;
      },
      dispose() { scene.remove(m); m.material.dispose(); this.dead = true; },
    };
    hd.update(0); live.push(hd); return hd;
  };

  // ================================================================ a shell that stays around something (a barrier on you, a ward)
  VX.shield = function (follow, r, col, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(sphGeo, shellMat(col, o.c2 ?? 0xffffff, o.style || 'energy')); m.frustumCulled = false; m.renderOrder = 7; scene.add(m);
    const hd = { t: 0, dur: dur ?? Infinity, r, dead: false,
      end(f) { this.dur = Math.min(this.dur, this.t + (f ?? 0.3)); },
      update(dt) {
        this.t += dt;
        const p = follow.pos || follow, k = Math.min(1, this.t / 0.2), left = this.dur - this.t;
        m.position.set(p.x, p.y + (o.lift ?? 1), p.z);
        m.scale.setScalar(this.r * (0.6 + 0.4 * k) * (1 + 0.025 * Math.sin(this.t * 6)));
        m.material.uniforms.uA.value = (o.alpha ?? 0.45) * k * Math.min(1, left / 0.3) * (1 + (this.t < 0.3 ? (0.3 - this.t) * 4 : 0));
        return left > 0;
      },
      dispose() { scene.remove(m); m.material.dispose(); this.dead = true; },
    };
    live.push(hd); return hd;
  };

  // ================================================================ a meteor falling from `from` to `to` in exactly dur seconds (its blast is the caller's, at the same moment)
  VX.meteor = function (from, to, dur, size) {
    const s = size || 1.2, g = new THREE.Group();
    const rock = new THREE.Mesh(G.Props.PG.dode, new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0x801800, emissiveIntensity: 0.9, roughness: 0.9, flatShading: true }));
    rock.scale.setScalar(s * 0.7); g.add(rock);
    const fire = new THREE.Mesh(sphGeo, fireMat()); fire.scale.setScalar(s * 1.15); g.add(fire);
    g.position.copy(from); scene.add(g);
    const d = to.clone().sub(from); let t = 0;
    live.push({
      update(dt) {
        t += dt; const k = Math.min(1, t / dur);
        g.position.copy(from).addScaledVector(d, k);
        rock.rotation.x += dt * 4; rock.rotation.z += dt * 3;
        const n = Math.round(60 * dt * 4);
        for (let i = 0; i < n; i++) {
          G.fx.flame.spawn(g.position.x + rnd(-0.5, 0.5) * s, g.position.y + rnd(-0.5, 0.5) * s, g.position.z + rnd(-0.5, 0.5) * s, -d.x / dur * 0.15 + rnd(-1, 1), -d.y / dur * 0.15 + rnd(0, 1.5), -d.z / dur * 0.15 + rnd(-1, 1), rnd(0.3, 0.6), s * 0.9, s * 0.25, 1.6, 1.0, 0.45, 1, -1, 1.5, 1.0, 0.25, 0.05);
          if (Math.random() < 0.5) G.fx.norm.spawn(g.position.x, g.position.y, g.position.z, rnd(-0.6, 0.6), rnd(0, 1), rnd(-0.6, 0.6), rnd(1.2, 2.2), s * 0.6, s * 2.2, 0.12, 0.1, 0.09, 0.55, -0.3, 1);
        }
        return k < 1;
      },
      dispose() { scene.remove(g); rock.material.dispose(); fire.material.dispose(); },
    });
  };

  // ================================================================ a spectral bell hanging above you (終焉の鐘): it swings and flares at each toll
  let bellGeo = null;
  VX.bell = function (follow, dur, tolls) {
    if (!bellGeo) { const pts = []; for (let i = 0; i <= 16; i++) { const y = i / 16; pts.push(new THREE.Vector2(0.2 + 0.8 * Math.pow(1 - y, 2.2) + (y < 0.06 ? 0.08 : 0), y)); } pts.push(new THREE.Vector2(0.001, 1.02)); bellGeo = new THREE.LatheGeometry(pts, 32); } // (wide mouth at the bottom, a closed crown on top)
    const m = new THREE.Mesh(bellGeo, shellMat(0xffc860, 0xfff4d0, 'holy')); m.frustumCulled = false; m.renderOrder = 8; scene.add(m);
    let t = 0;
    live.push({
      update(dt) {
        t += dt;
        const p = follow.pos || follow, k = Math.min(1, t / 0.4), left = dur - t;
        let flare = 0; for (const tt of tolls || []) { const x = t - tt; if (x >= 0 && x < 0.5) flare = Math.max(flare, 1 - x / 0.5); }
        m.position.set(p.x, p.y + 6.5, p.z); m.scale.setScalar(2.2 * (0.7 + 0.3 * k) * (1 + flare * 0.12));
        m.rotation.z = Math.sin(t * 3.2) * 0.22; m.rotation.y += dt * 0.4;
        m.material.uniforms.uA.value = (0.55 + flare * 0.9) * k * Math.min(1, left / 0.4);
        return left > 0;
      },
      dispose() { scene.remove(m); m.material.dispose(); },
    });
  };

  // ================================================================ the heart of a gravity well: a black core, a glowing rim and a turning disk
  VX.vortex = function (c, r, dur) {
    const g = new THREE.Group(); scene.add(g);
    const core = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0x000000 })); g.add(core);
    const rim = new THREE.Mesh(sphGeo, shellMat(0x9040ff, 0xffd0ff, 'spiral')); g.add(rim);
    const disk = new THREE.Mesh(areaGeo, areaMat('gravity')); disk.renderOrder = 6; g.add(disk);
    const hd = { pos: c.clone(), r, t: 0, dur: dur ?? Infinity, dead: false, lease: 0.3,
      end(f) { this.dur = Math.min(this.dur, this.t + (f ?? 0.3)); },
      touch() { this.seen = this.t; },
      update(dt) {
        this.t += dt;
        if (this.t - (this.seen || 0) > this.lease) this.end(0.2);
        const left = this.dur - this.t, k = Math.min(1, this.t / 0.4), f = Math.min(1, left / 0.3), R = Math.max(0.5, this.r * 0.12);
        g.position.set(this.pos.x, this.pos.y + 1.2 + R, this.pos.z);
        core.scale.setScalar(R * 0.8 * k); rim.scale.setScalar(R * 1.15 * k); rim.material.uniforms.uA.value = 1.2 * f;
        const D = R * 3.2; disk.scale.set(D, 1, D); disk.rotation.set(0.35, this.t * 2.5, 0.2);
        const u = disk.material.uniforms; u.uS.value = D; u.uR.value = D - 0.7; u.uA.value = 0.9 * k * f; u.uFlash.value = 0;
        // matter drawn into it
        for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, d = this.r * rnd(0.4, 1); G.fx.add.spawn(this.pos.x + Math.cos(a) * d, this.pos.y + rnd(0.2, 2.5), this.pos.z + Math.sin(a) * d, -Math.cos(a) * d * 1.6 - Math.sin(a) * 4, rnd(0.5, 2), -Math.sin(a) * d * 1.6 + Math.cos(a) * 4, 0.6, 0.14, 0.02, 0.7, 0.45, 1.0, 0.9, 0, 0.5); }
        return left > 0;
      },
      dispose() { scene.remove(g); rim.material.dispose(); disk.material.dispose(); core.material.dispose(); this.dead = true; },
    };
    live.push(hd); return hd;
  };

  // ================================================================ the band swept by orbiting blades: bright just behind each blade
  const SPIN_VS = `uniform float uS; varying vec2 vP; varying float vDepth;
    void main() { vP = position.xz * uS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const SPIN_FS = `uniform float uR; uniform float uHW; uniform float uN; uniform float uPh; uniform float uA; uniform vec3 uC; ${FOG_U} varying vec2 vP;
    void main() {
      float d = length(vP), e = abs(d - uR);
      if (e > uHW) discard;
      float ang = atan(vP.y, vP.x);
      float step = 6.2832 / uN;
      float behind = mod(uPh - ang, step);          // how far this point lies behind the blade ahead of it
      float trail = exp(-behind * 3.2);
      float band = 1.0 - smoothstep(uHW * 0.55, uHW, e);
      float edge = 1.0 - smoothstep(0.0, uHW * 0.3, e);
      float a = (trail * (0.55 * band + 0.45 * edge) + 0.05 * band) * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uC, vec3(1.0), edge * trail) * fogv, clamp(a, 0.0, 1.0));
    }`;
  // the ring of blades (刃の旋風 / 剣の嵐 / the blade boon): r = their radius, hw = how far either side of it they cut (the hit reach)
  VX.spinRing = function () {
    const m = new THREE.Mesh(areaGeo, mk(SPIN_VS, SPIN_FS, { uS: { value: 1 }, uR: { value: 3 }, uHW: { value: 1.2 }, uN: { value: 6 }, uPh: { value: 0 }, uA: { value: 0 }, uC: { value: col3(0xc8dcff) } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 6; m.visible = false; scene.add(m);
    return {
      m,
      set(pos, y, r, hw, n, ph, a, col) {
        m.visible = a > 0.01; if (!m.visible) return;
        const S = r + hw + 0.2; m.scale.set(S, 1, S); m.position.set(pos.x, y, pos.z);
        const u = m.material.uniforms; u.uS.value = S; u.uR.value = r; u.uHW.value = hw; u.uN.value = n; u.uPh.value = ph; u.uA.value = a; if (col !== undefined) u.uC.value.set(col);
      },
    };
  };

  // ================================================================ zones and ultimate auras: one look, on every screen
  const ZONE_AREA = { fire: 'fire', poison: 'poison', smoke: 'smoke', heal: 'heal', holy: 'holy', frost: 'frost', gravity: 'gravity', whirl: 'whirl', grasp: 'grasp', arrowrain: 'arrowrain', acid: 'acid', web: 'web' };
  VX.zoneTick = function (z, dt) {
    const p = z.pos, r = z.r, left = z.dur - z.t, k = Math.min(1, left * 2), R = Math.random;
    const kind = ZONE_AREA[z.kind];
    if (kind && (!z.vx || z.vx.dead)) z.vx = VX.area(p, r, kind, Infinity, { alpha: z.enemy ? 0.92 : 1, lease: 0.3 });
    if (z.vx) { z.vx.touch(); z.vx.pos.copy(p); z.vx.r = r; if (left < 0.35) z.vx.end(Math.max(0.05, left)); }
    if (z.kind === 'gravity' && r >= 3 && !z.noCore && (!z.vxCore || z.vxCore.dead)) z.vxCore = VX.vortex(p, r, Infinity);
    if (z.vxCore) { z.vxCore.touch(); z.vxCore.pos.copy(p); if (left < 0.35) z.vxCore.end(Math.max(0.05, left)); }
    const rp = () => { const a = R() * 6.28, d = Math.sqrt(R()) * r; return [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d]; };
    switch (z.kind) {
      case 'fire': for (let n = 0; n < r * r * dt * 2.4 * k; n++) { const [x, zz] = rp(); G.fx.flameLick(x, p.y + 0.05, zz, 1.3 + R()); } break;
      case 'poison': case 'acid': if (R() < dt * r * 3) { const [x, zz] = rp(); G.fx.norm.spawn(x, p.y + 0.3, zz, 0, 0.3, 0, 1.6, 0.6, 2.2, 0.35, 0.5, 0.12, 0.3 * k, -0.05, 0.5); } break;
      case 'smoke': if (R() < dt * r * 6) { const [x, zz] = rp(); G.fx.norm.spawn(x, p.y + 0.5, zz, 0, 0.2, 0, 2.5, 1.5, 4, 0.5, 0.5, 0.5, 0.6 * k, -0.02, 0.3); } break;
      case 'heal': case 'holy': if (R() < dt * 12) { const [x, zz] = rp(); const c = z.kind === 'heal' ? [0.4, 1.0, 0.5] : [1.0, 0.9, 0.5]; G.fx.add.spawn(x, p.y + 0.1, zz, 0, 1.3, 0, 1.0, 0.12, 0.02, c[0], c[1], c[2], 0.8, -0.3, 0.5); } break;
      case 'frost': if (R() < dt * r * 3) { const [x, zz] = rp(); G.fx.norm.spawn(x, p.y + 0.2, zz, 0, 0.3, 0, 1.4, 0.4, 1.6, 0.8, 0.9, 1.0, 0.25 * k, -0.05, 0.5); } break;
      case 'arrowrain': if (R() < dt * 30) { const [x, zz] = rp(); G.fx.tracer(V(x + 1, p.y + 10, zz), V(x, p.y, zz), 0xcfc0a0, 0.02, 0.12); if (R() < 0.3) G.fx.dust(V(x, p.y, zz), V(0, 1, 0), 0x8a8070, 1); } break;
      case 'grasp': if (R() < dt * 8) { const [x, zz] = rp(); G.fx.norm.spawn(x, p.y + 0.1, zz, 0, 1.5, 0, 0.8, 0.3, 0.1, 0.08, 0.02, 0.1, 0.8, 0, 1); } if (R() < dt * 5 * k) { const [x, zz] = rp(); VX.spikes([V(x, p.y, zz)], { kind: 'dark', r: 0.6, h: 1.1, n: 2, dur: 0.45, rise: 0.12 }); } break; // (dark hands clutch up out of it)
      case 'whirl': for (let n = 0; n < 2; n++) { const a = z.t * 5 + n * 3.1 + R() * 0.5, d = r * (0.3 + R() * 0.7); G.fx.norm.spawn(p.x + Math.cos(a) * d, p.y + 0.2 + R() * 0.5, p.z + Math.sin(a) * d, -Math.sin(a) * 3, 0.6, Math.cos(a) * 3, 0.5, 0.25, 0.6, 0.8, 0.92, 1.0, 0.6 * k, 2, 1); } break;
      default: break;
    }
  };
  VX.zoneEnd = function (z) { if (z.vx) { z.vx.end(0.3); z.vx = null; } if (z.vxCore) { z.vxCore.end(0.3); z.vxCore = null; } };
  // an ultimate's aura centred on c (the caster / a fixed spot / the orbital beam's point)
  VX.auraTick = function (a, c, dt) {
    const k = a.kind || a.k, R = Math.random;
    if (!a.vx || a.vx.dead) {
      if (k === 'fire') a.vx = VX.area(c, a.r, 'fire', Infinity, { lease: 0.3 });
      else if (k === 'drain') a.vx = VX.area(c, a.r, 'blood', Infinity, { lease: 0.3 });
      else if (k === 'holy') { a.vx = VX.area(c, a.r, 'holy', Infinity, { lease: 0.3 }); a.vx2 = VX.wall(c, a.r, 2.6, 0xffe8a0, Infinity, { alpha: 0.55, lease: 0.3 }); }
      else if (k === 'beam') a.vx = VX.pillar(c, a.r, 45, 0xffe8b0, Infinity, { c2: 0xffffff, groundKind: 'fire', speed: 5, lease: 0.3 });
    }
    if (a.vx) { a.vx.touch && a.vx.touch(); a.vx.pos.copy(c); }
    if (a.vx2) { a.vx2.touch && a.vx2.touch(); a.vx2.pos.copy(c); }
    if (k === 'fire' && R() < dt * 24) { const an = R() * 6.28, d = Math.sqrt(R()) * a.r; G.fx.flameLick(c.x + Math.cos(an) * d, c.y + 0.1, c.z + Math.sin(an) * d, 1.8, a.col); }
    else if (k === 'drain' && R() < dt * 22) { const an = R() * 6.28, d = a.r * (0.5 + R() * 0.5); G.fx.norm.spawn(c.x + Math.cos(an) * d, c.y + 0.3, c.z + Math.sin(an) * d, -Math.cos(an) * d * 0.9, rnd(1, 2.5), -Math.sin(an) * d * 0.9, 0.9, 0.16, 0.05, 0.75, 0.04, 0.08, 0.9, 0, 0.6); }
    else if (k === 'holy' && R() < dt * 16) G.fx.add.spawn(c.x + rnd(-a.r, a.r) * 0.7, c.y + 0.1, c.z + rnd(-a.r, a.r) * 0.7, 0, 1.4, 0, 1, 0.12, 0.02, 1.2, 1.0, 0.5, 0.8, -0.3, 0.5);
    else if (k === 'beam') for (let i = 0; i < 2; i++) { const an = R() * 6.28, d = Math.sqrt(R()) * a.r; G.fx.flame.spawn(c.x + Math.cos(an) * d, c.y + 0.1, c.z + Math.sin(an) * d, rnd(-0.5, 0.5), rnd(2, 6), rnd(-0.5, 0.5), rnd(0.3, 0.6), 0.5, 0.1, 1.6, 1.3, 0.8, 1, -1, 1, 1.0, 0.5, 0.1); }
  };
  VX.auraEnd = function (a) { if (a.vx) { a.vx.end(0.4); a.vx = null; } if (a.vx2) { a.vx2.end(0.4); a.vx2 = null; } };

  // ================================================================ motes that rise around someone for a while (a buff you can see on yourself)
  VX.motes = function (follow, col, dur, rate) {
    const c = col3(col); let t = 0;
    live.push({
      update(dt) {
        t += dt; const p = follow.pos || follow, n = (rate || 30) * dt;
        for (let i = 0; i < n || Math.random() < n - i; i++) {
          const a = Math.random() * 6.28, d = rnd(0.5, 1.1);
          G.fx.add.spawn(p.x + Math.cos(a) * d, p.y + rnd(0, 1.8), p.z + Math.sin(a) * d, -Math.cos(a) * 0.3, rnd(0.8, 2.2), -Math.sin(a) * 0.3, rnd(0.5, 0.9), 0.1, 0.02, c.r * 1.3, c.g * 1.3, c.b * 1.3, 0.9, -0.3, 0.5);
          if (i > 6) break;
        }
        return t < dur;
      },
      dispose() {},
    });
  };

  // ================================================================ a tube of light between two points (a dimensional tear, a dash's streak): r = its reach
  VX.tube = function (a, b, r, col, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(cylGeo, beamMat(col, o.c2 ?? 0xffffff, o.speed ?? 3)); m.frustumCulled = false; m.renderOrder = 8; scene.add(m);
    m.material.uniforms.uEnds.value = 1;
    const inner = o.core === false ? null : new THREE.Mesh(cylGeo, beamMat(o.c2 ?? 0xffffff, 0xffffff, (o.speed ?? 3) * 1.6));
    if (inner) { inner.frustumCulled = false; inner.renderOrder = 8; inner.material.uniforms.uEnds.value = 1; scene.add(inner); }
    const d = b.clone().sub(a), len = d.length() || 0.01, q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
    let t = 0;
    live.push({
      update(dt) {
        t += dt; const k = Math.min(1, t / 0.08), f = Math.min(1, (dur - t) / Math.min(0.3, dur * 0.5));
        m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.copy(q); m.scale.set(r * (0.5 + 0.5 * k), len, r * (0.5 + 0.5 * k));
        m.material.uniforms.uA.value = f * (o.alpha ?? 1) * (0.85 + 0.15 * Math.sin(t * 37));
        if (inner) { inner.position.copy(m.position); inner.quaternion.copy(q); inner.scale.set(r * 0.22, len, r * 0.22); inner.material.uniforms.uA.value = f * 0.8; }
        return t < dur;
      },
      dispose() { scene.remove(m); m.material.dispose(); if (inner) { scene.remove(inner); inner.material.dispose(); } },
    });
  };

  // ================================================================ a fan-shaped shock running out over the floor (a cone attack): the band is the front, the fan its reach
  const FAN_VS = `uniform float uS; varying vec2 vP; varying float vDepth;
    void main() { vP = position.xz * uS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const FAN_FS = `uniform float uT; uniform float uR; uniform float uRmax; uniform float uHalf; uniform float uDir; uniform float uNear; uniform float uA; uniform vec3 uC; ${FOG_U} varying vec2 vP;
    ${NOISE}
    void main() {
      float d = length(vP);
      if (d > uRmax + 0.05) discard;
      float ang = atan(vP.y, vP.x), da = abs(mod(ang - uDir + 3.14159265, 6.2831853) - 3.14159265);
      float inFan = 1.0 - smoothstep(uHalf - 0.05, uHalf + 0.02, da);
      float near = 1.0 - smoothstep(uNear - 0.1, uNear, d);
      float m = max(inFan, near);
      if (m < 0.01) discard;
      float e = abs(d - uR);
      float band = exp(-e * 2.6) * (d <= uR + 0.6 ? 1.0 : 0.0);
      float trail = d < uR ? exp(-(uR - d) * 0.35) * 0.45 : 0.0;
      float edge = inFan * (1.0 - smoothstep(0.0, 0.08, abs(da - uHalf))) * (d < uR ? 0.5 : 0.0); // the two sides of the fan, lit where the front has been
      float n = fbm(vP * 0.6 + uT * 0.5);
      float a = (band * (0.8 + 0.4 * n) + trail * (0.6 + 0.6 * n) + edge) * m * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uC, vec3(1.0), band * 0.6) * fogv, clamp(a, 0.0, 1.0));
    }`;
  // c: the apex on the floor, f: the middle of the fan, r: its reach, half: its half angle (radians), dur: the time its front takes to reach r
  // (the same curve as a nova: abilities time the hits with VX.novaTime). o: { near: a full circle of this radius around the apex that is hit too, col }
  VX.fan = function (c, f, r, half, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(areaGeo, mk(FAN_VS, FAN_FS, { uS: { value: r + 1 }, uR: { value: 0 }, uRmax: { value: r }, uHalf: { value: half }, uDir: { value: Math.atan2(f.z, f.x) }, uNear: { value: o.near || 0 }, uA: { value: 1 }, uC: { value: col3(o.col ?? 0xe0d0b0) } },
      { blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.frustumCulled = false; m.renderOrder = 4; m.scale.set(r + 1, 1, r + 1); m.position.set(c.x, c.y + 0.06, c.z); scene.add(m);
    const life = dur + 0.4; let t = 0;
    live.push({
      update(dt) {
        t += dt; const k = Math.min(1, t / dur), u = m.material.uniforms;
        u.uR.value = r * ease(k); u.uA.value = t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.4);
        return t < life;
      },
      dispose() { scene.remove(m); m.material.dispose(); },
    });
    // dust thrown out along the fan
    for (let i = 0; i < 24; i++) { const a = Math.atan2(f.z, f.x) + (Math.random() * 2 - 1) * half, s = rnd(0.6, 1) * r / dur * 0.85, d0 = 1.6; G.fx.norm.spawn(c.x + Math.cos(a) * d0, c.y + 0.15, c.z + Math.sin(a) * d0, Math.cos(a) * s, rnd(0.2, 1.2), Math.sin(a) * s, dur * 1.1, 0.25, 1.0, 0.72, 0.68, 0.62, 0.4, 0, 1.5); } // (low, and starting clear of the caster's eyes)
  };

  // ================================================================ something that rises out of the floor (a stone wall): its mesh grows to full height
  VX.rise = function (mesh, h, y0, dur) {
    let t = 0; const sx = mesh.scale.x, sz = mesh.scale.z;
    live.push({ update(dt) { t += dt; const k = Math.min(1, t / (dur || 0.18)), e = 1 - (1 - k) * (1 - k); mesh.scale.set(sx, Math.max(0.02, h * e), sz); mesh.position.y = y0 + h * e / 2; return k < 1; }, dispose() {} });
  };

  // ================================================================ timing on game time (for the effects' own steps)
  const timers = [];
  function setGameTimeout(fn, ms) { timers.push({ t: (ms || 0) / 1000, fn }); }
  VX.after = setGameTimeout;

  // ================================================================ the hit view (development): the shapes the hit tests use, drawn for a moment
  VX.debug = false;
  const dbg = [];
  VX.dbgCircle = function (c, r, col) {
    if (!VX.debug || !scene) return;
    const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push(V(c.x + Math.cos(a) * r, c.y + 0.12, c.z + Math.sin(a) * r)); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col ?? 0xff00ff, depthTest: false, transparent: true }));
    l.renderOrder = 99; scene.add(l); dbg.push({ o: l, t: 0.8 });
  };
  VX.dbgLane = function (a, f, len, w, col) {
    if (!VX.debug || !scene) return;
    const d = V(f.x, 0, f.z).normalize(), s = V(d.z, 0, -d.x).multiplyScalar(w / 2), b = a.clone().addScaledVector(d, len);
    const pts = [a.clone().add(s), b.clone().add(s), b.clone().sub(s), a.clone().sub(s), a.clone().add(s)].map((p) => p.setY(p.y + 0.12));
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col ?? 0xff00ff, depthTest: false, transparent: true }));
    l.renderOrder = 99; scene.add(l); dbg.push({ o: l, t: 1.2 });
  };

  // ================================================================ set-up, warm-up, update
  VX.init = function (sc) {
    scene = sc;
    areaGeo = new THREE.PlaneGeometry(2, 2, 1, 1); areaGeo.rotateX(-Math.PI / 2);
    domeGeo = new THREE.SphereGeometry(1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2);
    sphGeo = new THREE.SphereGeometry(1, 28, 18);
    cylGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
    coneGeo = new THREE.ConeGeometry(1, 1, 28, 1, true);
    VX.geo = { area: areaGeo, dome: domeGeo, sph: sphGeo, cyl: cylGeo, cone: coneGeo };
    // one of each kind of material, for the shader warm-up
    const add = (m) => { m.visible = false; m.frustumCulled = false; scene.add(m); warmMeshes.push(m); };
    add(new THREE.Mesh(areaGeo, areaMat('fire'))); add(new THREE.Mesh(areaGeo, areaMat('poison')));
    add(new THREE.Mesh(domeGeo, shellMat(0xffffff, 0xffffff, 'energy')));
    add(new THREE.Mesh(cylGeo, beamMat(0xffffff)));
    add(new THREE.Mesh(sphGeo, fireMat()));
    add(new THREE.Mesh(arcGeo(0.5, 1, 1, 4), mk(SLASH_VS, SLASH_FS, { uP: { value: 0 }, uA: { value: 0 }, uC: { value: col3(0xffffff) }, uTail: { value: 0.5 } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    add(new THREE.Mesh(waveGeo(4, 2), mk(WAVE_VS, WAVE_FS, { uA: { value: 0 }, uHalf: { value: 2 } }, { side: THREE.DoubleSide })));
    for (const k of ['rock', 'ice']) spikeKind(k);
  };
  // shown (far below the world) while the renderer compiles: the first use never stalls
  VX.warmShow = function () { const saved = warmMeshes.map((m) => [m, m.visible]); for (const m of warmMeshes) { m.visible = true; m.position.set(0, -500, 0); } return () => { for (const [m, v] of saved) m.visible = v; }; };
  VX.setFog = function (color, density) { FOG.c.value.set(color); FOG.d.value = density; };
  VX.clear = function () {
    for (const e of live) e.dispose(); live.length = 0;
    for (const o of fbPool) { o.on = false; o.m.visible = false; }
    for (const o of bsPool) { o.on = false; o.m.visible = false; }
    for (const k in spk) { spk[k].list.length = 0; spk[k].mesh.count = 0; }
    timers.length = 0;
    for (const d of dbg) scene.remove(d.o); dbg.length = 0;
  };
  VX.update = function (dt) {
    if (!scene) return;
    TIME.value += dt;
    for (let i = timers.length - 1; i >= 0; i--) { const t = timers[i]; t.t -= dt; if (t.t <= 0) { timers.splice(i, 1); try { t.fn(); } catch (e) { console.error(e); } } }
    for (let i = live.length - 1; i >= 0; i--) { const e = live[i]; let ok = false; try { ok = e.update(dt); } catch (err) { console.error(err); } if (!ok) { e.dispose(); live.splice(i, 1); } }
    updateSpikes(dt); updateFireballs(dt);
    for (let i = dbg.length - 1; i >= 0; i--) { const d = dbg[i]; d.t -= dt; if (d.t <= 0) { scene.remove(d.o); d.o.geometry.dispose(); dbg.splice(i, 1); } }
  };
  VX.liveCount = () => live.length;
})();
