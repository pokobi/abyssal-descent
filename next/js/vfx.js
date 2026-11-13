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
  const LIT = { value: 1 };        // how light the place is (FX.setLit): what dust, frost, water and smoke are seen by
  const tone = (c, out) => (G.fx && G.fx.tone ? G.fx.tone(c, out) : (out || new THREE.Color()).set(c));
  // (premultiplied: matter hides what is behind it by its alpha, light is added)
  const premul = (m) => { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendEquation = THREE.AddEquation; return m; };

  // ================================================================ ground areas
  // kinds: the pattern inside. The rim's outer edge is exactly r.
  const AREA_K = { fire: 0, poison: 1, smoke: 2, heal: 3, holy: 4, frost: 5, gravity: 6, whirl: 7, grasp: 8, arrowrain: 9, acid: 10, web: 11, blood: 12, shock: 13, dark: 14, water: 15, mark: 16 };
  // the colours a caller may change (o.col: [inside, edge]): they tint the edge and the faint light of a kind, never its matter
  const AREA_COL = { // [inside, edge]
    fire: [0xff6a10, 0xffa040], poison: [0x6a7a28, 0x8a9a40], smoke: [0x6a6a6a, 0xa0a0a0], heal: [0xffe0a0, 0xffe8c0], holy: [0xffe0a0, 0xfff0d0],
    frost: [0xc8dcec, 0xe8f2fa], gravity: [0x5a5048, 0x8a8070], whirl: [0x4a6670, 0xb0c8d0], grasp: [0x30202a, 0x6a4a50], arrowrain: [0xd8c8a0, 0xe8dcc0],
    acid: [0x8a9a20, 0xb0b850], web: [0xe0e0d8, 0xffffff], blood: [0x900818, 0xc03030], shock: [0x9ab8e0, 0xe0ecff], dark: [0x302830, 0x7a6a78], water: [0x4a6670, 0xb0c8d0], mark: [0x9a2a1a, 0xc04030],
  };
  const AREA_VS = `uniform float uS; varying vec2 vP; ${FOG_U.replace('uniform float uFogD; uniform vec3 uFogC; ', '')}
    void main() { vP = position.xz * uS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  // Each kind is a thing lying on the floor, not a disc of colour: burning ground, a pool of gas or sludge, hoarfrost, churning water,
  // black ooze, blood, a pool of warm light. Drawn premultiplied: the matter hides the floor by its alpha, what glows is added.
  // Its edge reads where the hit test's radius is: the matter ends there, a little ragged, with an edge of its own (a wet lip, frost
  // crystals, a line of embers), never outside r.
  const AREA_FS = `uniform float uT; uniform float uR; uniform float uA; uniform float uK; uniform float uSeed; uniform float uFlash; uniform float uLit;
    uniform vec3 uC1; uniform vec3 uC2; ${FOG_U} varying vec2 vP;
    ${NOISE}
    float glint(vec2 p, float t) { return smoothstep(0.8, 0.95, vnoise(p * 3.0 + t * 0.3)) * smoothstep(0.62, 0.92, vnoise(p * 7.3 - t * 0.21)); }
    void main() {
      float d = length(vP);
      if (d > uR + 0.3) discard;
      float t = uT + uSeed * 37.0;
      vec2 q = vP + uSeed * 13.0;
      float ang = atan(vP.y, vP.x);
      float e = clamp(d / max(uR, 0.01), 0.0, 1.0);
      float rag = vnoise(vec2(ang * max(uR, 0.5) * 1.7 + uSeed * 9.0, 1.3)) * 0.06 + vnoise(vec2(ang * max(uR, 0.5) * 5.0, 7.0)) * 0.03;   // (at most 0.15 m inside r)
      float inside = 1.0 - smoothstep(uR - 0.06 - rag, uR - 0.005, d);            // (the matter ends a little ragged, inside r)
      float ex = (d - (uR - 0.08 - rag * 0.6)) / 0.06, edge = exp(-ex * ex);       // (its own edge, just inside where it ends)
      vec3 body = vec3(0.0), em = vec3(0.0); float ba = 0.0;
      int k = int(uK + 0.5);
      if (k == 0) {                    // fire: the ground burning - scorched black, embers along its cracks, a ragged burning edge
        float n = fbm(q * 0.55 + vec2(0.0, -t * 0.2)), cr = abs(fbm(q * 1.25) - 0.5), crack = 1.0 - smoothstep(0.0, 0.045, cr);
        float heat = clamp(n * 1.35 - 0.38 + crack * 0.5, 0.0, 1.2) * (0.65 + 0.35 * sin(t * 3.1 + n * 11.0));
        body = vec3(0.028, 0.02, 0.015); ba = inside * (0.5 + 0.3 * n);
        vec3 ember = mix(vec3(0.45, 0.05, 0.0), vec3(1.0, 0.42, 0.07), smoothstep(0.35, 0.95, heat));
        em = ember * (crack * 0.7 + smoothstep(0.6, 1.0, heat) * 0.5) * inside + mix(uC2, vec3(1.0, 0.45, 0.1), 0.5) * edge * 0.55 * (0.4 + 0.8 * n);
      } else if (k == 1 || k == 10) {  // poison: a murk of gas lying low, slowly turning; acid: a pool of sludge that fizzes
        float n = fbm(q * 0.45 + t * vec2(0.11, 0.07)), n2 = fbm(q * 1.3 - t * vec2(0.05, 0.09));
        float b = vnoise(q * 2.4 + vec2(0.0, t * 0.6)), bub = smoothstep(0.8, 0.86, b) * (1.0 - smoothstep(0.88, 0.93, b));
        if (k == 1) { body = mix(vec3(0.15, 0.155, 0.07), vec3(0.3, 0.3, 0.14), n) * uLit; ba = inside * (0.1 + 0.42 * smoothstep(0.42, 0.8, n2) * smoothstep(0.25, 0.6, n)) + edge * 0.18 * inside; body = mix(body, vec3(0.07, 0.08, 0.03) * uLit, edge * 0.5); }
        else { body = mix(vec3(0.09, 0.09, 0.03), vec3(0.19, 0.18, 0.07), n) * uLit; body = mix(body, vec3(0.04, 0.04, 0.015) * uLit, bub + edge * 0.6); ba = inside * (0.72 + 0.15 * n); em = vec3(0.55, 0.56, 0.36) * glint(q, t) * 0.45 * uLit * inside; }
      } else if (k == 2) {             // smoke: a grey murk on the floor
        float n = fbm(q * 0.35 + vec2(t * 0.1, -t * 0.07)), n2 = fbm(q * 1.1 - t * 0.12);
        body = mix(vec3(0.32), vec3(0.5), n) * uLit; ba = inside * (0.22 + 0.3 * n + 0.12 * n2);
      } else if (k == 3 || k == 4) {   // heal / holy: a pool of warm pale-gold light on the floor, mottled as light through drifting dust,
        // brightest along its edge in one unbroken line (where to stand reads at a glance, and nothing like the danger's red or murk)
        float m = fbm(q * 0.6 + vec2(t * 0.07, -t * 0.05)) * 0.6 + fbm(q * 2.1 + t * 0.1) * 0.4;
        float px = max(fwidth(d), 0.003), rw = max(0.06, px * 1.8), rx2 = (d - (uR - 0.07)) / rw;
        float rimL = exp(-rx2 * rx2) * (0.85 + 0.15 * m);
        float pool = (k == 3 ? 0.13 : 0.19) * (0.7 + 0.3 * smoothstep(0.2, 0.8, m)) * (1.0 - 0.25 * e * e);
        float halo = exp(min(d - uR, 0.0) / 0.4) * (k == 3 ? 0.12 : 0.16);
        em = mix(uC1, vec3(1.0, 0.86, 0.58), 0.5) * ((pool + halo) * inside + rimL * (k == 3 ? 0.55 : 0.7));
      } else if (k == 5) {             // frost: hoarfrost, feathery and grainy, thicker in its middle, crystals at its edge, a few glints
        float f = 1.0 - abs(fbm(q * 2.1) * 2.0 - 1.0), f2 = fbm(q * 6.5), f3 = 1.0 - abs(fbm(q * 9.0 + 3.0) * 2.0 - 1.0);
        float dens = smoothstep(0.58, 1.05, f * 0.55 + f2 * 0.35 + f3 * 0.3 + (1.0 - e) * 0.22) * smoothstep(0.3, 0.6, fbm(q * 0.7 + 4.0));
        body = vec3(0.6, 0.64, 0.68) * uLit * (0.75 + 0.4 * f2); ba = inside * (0.04 + 0.5 * dens) + edge * inside * 0.16 * f3;
        em = vec3(0.7, 0.78, 0.86) * step(0.985, h21(floor(q * 38.0))) * 0.5 * uLit * inside;
      } else if (k == 6) {             // gravity: grit and dust dragged in, curling toward a dark pit in the middle
        float s = sin(ang * 3.0 + log(d + 0.6) * 5.5 + t * 4.0 + fbm(q * 0.8) * 2.0), streak = smoothstep(0.35, 1.0, s) * smoothstep(0.08, 0.45, e);
        float pit = 1.0 - smoothstep(0.0, max(0.6, uR * 0.22), d);
        body = mix(vec3(0.33, 0.31, 0.28) * uLit * (0.7 + 0.5 * fbm(q * 2.0)), vec3(0.008), pit);
        ba = inside * max(0.12 + 0.42 * streak * (0.5 + 0.6 * fbm(q * 1.6 - t * 0.3)), pit * 0.88);
      } else if (k == 7 || k == 15) {  // whirl / water: dark churned water, foam in streaks, glints
        float spin = k == 7 ? 1.0 : 0.15;
        float s = sin(ang * 4.0 + d * 0.9 * spin - t * 4.0 * spin + fbm(q * 0.6) * 3.0), n = fbm(q * 0.7 + vec2(t * 0.3, 0.0));
        float foam = smoothstep(0.78, 1.05, s * 0.5 + n * 0.75) * smoothstep(0.35, 0.8, fbm(q * 3.0 - t));
        body = mix(mix(vec3(0.035, 0.05, 0.055), vec3(0.08, 0.1, 0.105), n) * (0.6 + 0.5 * uLit), vec3(0.55, 0.58, 0.58) * uLit, foam);
        ba = inside * (0.72 + 0.2 * foam) * (k == 15 ? (0.6 + 0.4 * (1.0 - e)) : 1.0) + edge * inside * 0.2;
        em = vec3(0.5, 0.56, 0.58) * glint(q, t) * 0.4 * uLit * inside;
      } else if (k == 8 || k == 14) {  // grasp / dark: black ooze, heaving, with a dull sheen on its ridges
        float n = fbm(q * 0.7 + vec2(t * 0.08, -t * 0.05)), ten = smoothstep(0.55, 0.8, fbm(vec2(ang * 3.0, d * 0.7 - t * 0.6)));
        body = vec3(0.012, 0.01, 0.012) + vec3(0.06, 0.055, 0.058) * ten * uLit; ba = inside * (0.62 + 0.22 * n + 0.1 * ten);
        em = uC2 * (ten * 0.05 + edge * 0.12) * inside;
      } else if (k == 9) {             // arrow rain: the ground scuffed and dusty where the arrows fall, a faint mark at its edge
        float n = fbm(q * 0.9);
        body = vec3(0.42, 0.39, 0.34) * uLit; ba = inside * 0.12 * (0.4 + n) + edge * inside * 0.25;
        em = uC2 * edge * 0.08;
      } else if (k == 11) {            // web: grey strands, sagging and broken in places
        float rad = smoothstep(0.975, 1.0, abs(cos(ang * 7.0 + vnoise(vec2(d * 1.3, 0.0)) * 0.7)));
        float circ = smoothstep(0.93, 1.0, abs(sin(d * 2.4 + vnoise(vec2(ang * 4.0, 0.0)) * 1.2)));
        body = vec3(0.55, 0.54, 0.52) * uLit; ba = inside * 0.6 * max(rad, circ) * smoothstep(0.2, 0.55, vnoise(q * 1.7));
      } else if (k == 12) {            // blood: a pool, dark, thick, with a wet sheen and a darker lip
        float n = fbm(q * 0.5 + vec2(t * 0.03, 0.0)), sw = 0.5 + 0.5 * sin(ang * 2.0 - t * 1.2 + d * 0.5 + fbm(q * 0.5) * 4.0);
        body = mix(vec3(0.022, 0.0015, 0.0015), vec3(0.055, 0.004, 0.003), n * (0.6 + 0.4 * sw)) * (0.55 + 0.45 * uLit);
        body = mix(body, vec3(0.012, 0.001, 0.001), edge * 0.7); ba = inside * (0.82 + 0.1 * n);
        em = vec3(0.5, 0.18, 0.16) * glint(q, t) * 0.4 * uLit * inside;
      } else if (k == 16) {            // mark: a ring daubed on the ground under its mark in red earth, smeared, a little wet (not a light)
        float n = fbm(q * 1.4), br = fbm(vec2(ang * max(uR, 0.5) * 2.5, d * 6.0) + uSeed * 5.0);
        float band = smoothstep(uR * 0.62, uR * 0.74, d + (n - 0.5) * 0.12) * (1.0 - smoothstep(uR * 0.86, uR * 0.98, d + (n - 0.5) * 0.12));
        float dab = band * smoothstep(0.32, 0.6, br) + inside * 0.08 * smoothstep(0.55, 0.8, n);
        body = mix(vec3(0.16, 0.025, 0.015), vec3(0.3, 0.05, 0.03), n) * (0.55 + 0.45 * uLit); ba = clamp(dab, 0.0, 1.0) * 0.85;
        em = mix(uC1, vec3(0.8, 0.12, 0.06), 0.5) * dab * 0.12;
      } else if (k == 13) {            // shock: thin arcs crawling over the floor, scorching it
        float f1 = abs(fbm(q * 1.2 + vec2(t * 3.0, -t * 2.0)) - 0.5), f2 = abs(fbm(q * 2.3 - vec2(t * 4.0, t * 1.0)) - 0.5);
        float arcs = (1.0 - smoothstep(0.0, 0.01, f1)) + (1.0 - smoothstep(0.0, 0.007, f2)) * 0.6;
        float on = step(0.35, fract(sin(floor(t * 14.0) * 12.9898 + uSeed * 7.0) * 43758.5453));
        body = vec3(0.025, 0.022, 0.02); ba = inside * 0.16 * (0.6 + fbm(q));
        em = mix(uC1, vec3(1.0), 0.65) * arcs * on * 1.3 * inside + uC2 * edge * 0.1;
      }
      // its edge, readable from afar on any floor: what it is made of gathers along where it ends - a settled lip (sediment, tar,
      // congealed blood, thick rime, a ridge of grit, a line of foam, a scorched ring), never thinner than two pixels; wet kinds catch
      // the light in a thin sheen just inside it. A warm light rim is only for the grounds that help (heal, holy).
      float pxa = max(fwidth(d), 0.003), lw = max(0.09, pxa * 2.5), lx = (d - (uR - lw * 0.9 - rag * 0.5)) / lw;
      float lip = exp(-lx * lx) * inside * (0.75 + 0.25 * vnoise(vec2(ang * max(uR, 0.5) * 3.0, 9.0 + uSeed)));
      float sx = (d - (uR - lw * 2.3 - rag * 0.5)) / max(lw * 0.45, pxa * 1.2), sheen = exp(-sx * sx) * inside;
      vec3 lc = body, le = vec3(0.0); float la = 0.0, ls = 0.0;
      if (k == 1) { lc = vec3(0.075, 0.08, 0.025) * (0.6 + 0.6 * uLit); la = 0.8; ls = 0.5; }            // poison: a dark sediment where the murk settles
      else if (k == 10) { lc = vec3(0.035, 0.035, 0.01); la = 0.88; ls = 0.8; }                          // acid: a dark wet lip
      else if (k == 2) { lc = vec3(0.1) * uLit; la = 0.55; }                                              // smoke: a ring of soot
      else if (k == 5) { lc = vec3(0.8, 0.84, 0.88) * uLit; la = 0.75; }                                   // frost: rime thickest at its rim
      else if (k == 6) { lc = vec3(0.09, 0.085, 0.075); la = 0.8; }                                       // gravity: a ridge of grit dragged up
      else if (k == 7 || k == 15) { lc = vec3(0.62, 0.65, 0.65) * uLit; la = 0.65; }                       // water: a line of foam
      else if (k == 8 || k == 14) { lc = vec3(0.008); la = 0.88; ls = 1.0; le = uC2 * 0.12; }            // dark: a lip of tar, a dull sheen
      else if (k == 9) { lc = vec3(0.14, 0.125, 0.11) * uLit; la = 0.6; }                                // arrow rain: the ground scuffed dark
      else if (k == 11) { lc = vec3(0.6, 0.59, 0.56) * uLit; la = 0.75; }                                 // web: its anchor strands
      else if (k == 12) { lc = vec3(0.012, 0.001, 0.001); la = 0.92; ls = 0.7; }                          // blood: a congealed lip
      else if (k == 13) { lc = vec3(0.02); la = 0.8; le = mix(uC1, vec3(1.0), 0.5) * 0.07; ls = 0.5; }            // shock: a scorched ring
      else if (k == 0) { la = 0.0; }
      if (la > 0.0) { body = mix(body, lc, lip); ba = max(ba, lip * la); em += le * lip + vec3(0.5, 0.5, 0.46) * ls * sheen * 0.16 * (0.35 + uLit); }
      em += uC2 * edge * uFlash * 0.4 * inside;
      ${fogAdd}
      float a = clamp(ba, 0.0, 0.92) * uA;
      em *= uA * fogv;
      if (a < 0.004 && dot(em, vec3(1.0)) < 0.004) discard;
      gl_FragColor = vec4(em + mix(uFogC, body, fogv) * a, a);
    }`;
  let areaGeo = null;
  function areaMat(kind) {
    const c = AREA_COL[kind] || AREA_COL.fire;
    return premul(mk(AREA_VS, AREA_FS, {
      uS: { value: 1 }, uR: { value: 1 }, uA: { value: 0 }, uK: { value: AREA_K[kind] ?? 0 }, uSeed: { value: Math.random() }, uFlash: { value: 1 }, uLit: LIT,
      uC1: { value: tone(c[0]) }, uC2: { value: tone(c[1]) },
    }, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  }
  // a ground area: r is the hit radius. o: { follow: an object with a .pos / a Vector3 to stay on, col: [inside, rim], fadeIn, lift }
  // returns a handle: .pos (move it), .r (change it), .end(fade) to let it go
  VX.area = function (c, r, kind, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(areaGeo, areaMat(kind)); m.frustumCulled = false; m.renderOrder = 3;
    if (o.col) { tone(o.col[0], m.material.uniforms.uC1.value); tone(o.col[1] ?? o.col[0], m.material.uniforms.uC2.value); }
    scene.add(m);
    const h = { pos: c.clone(), r, t: 0, dur: dur ?? Infinity, fade: 0.35, dead: false, m, lift: o.lift ?? 0.05, follow: o.follow || null, a0: o.alpha ?? 1, fadeIn: o.fadeIn ?? 0.15, grow: o.grow || 0, lease: o.lease || 0,
      end(f) { if (this.dur > this.t + (f ?? 0.35)) { this.dur = this.t + (f ?? 0.35); this.fade = f ?? 0.35; } },
      touch() { this.seen = this.t; },
      update(dt) {
        this.t += dt;
        if (this.lease && this.t - (this.seen || 0) > this.lease) this.end(0.2); // (held by a zone / an aura: gone soon after they stop holding it)
        if (this.follow) { const p = this.follow.pos || this.follow; this.pos.set(p.x, p.y, p.z); }
        const R = this.grow ? this.r * ease(Math.min(1, this.t / this.grow)) : this.r; // (grow: it spreads with a nova's front, on the same curve)
        const S = R + 0.3, u = m.material.uniforms;
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
      else if (s == 6) pat = 0.0;                                                                                     // a ward: its rim only
      vec3 col = mix(uC, uC2, clamp(pat, 0.0, 1.0));
      float a = (s == 6 ? pow(f, 2.2) * (0.75 + 0.25 * fbm(vec2(ang * 4.0, h * 5.0 - uT))) : s == 0 ? pow(f, 1.6) * 0.4 + pat * 0.35 * (0.3 + f) : f * 0.85 + pat * 0.45 * (0.3 + f)) * uA;   // (plain energy: a soft haze, no hard bright rim)
      ${fogAdd}
      col *= fogv;
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * (1.0 + f * 0.6), clamp(a, 0.0, 1.0));
    }`;
  const SHELL_STYLE = { energy: 0, ice: 1, emp: 2, holy: 3, fire: 4, blood: 4, spiral: 5, rim: 6 };
  let domeGeo = null, sphGeo = null, cylGeo = null, coneGeo = null;
  function shellMat(c1, c2, style) {
    return mk(SHELL_VS, SHELL_FS, { uA: { value: 1 }, uC: { value: col3(c1) }, uC2: { value: col3(c2 ?? 0xffffff) }, uStyle: { value: SHELL_STYLE[style] ?? 0 }, uSeed: { value: Math.random() } },
      { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }

  // ================================================================ nova: a dome and a ground shock that swell out to r
  // the radius grows as r * (1 - (1 - k)^2): VX.novaTime gives the moment it reaches a distance (abilities time their hits by it)
  const ease = (k) => 1 - (1 - k) * (1 - k);
  VX.novaTime = (d, r, dur) => dur * (1 - Math.sqrt(Math.max(0, 1 - Math.min(1, Math.max(0, d) / r))));
  // each kind of wave: the band on the floor (ground: the colour of its hot middle line, shockRing) and what its front throws up (med)
  const NOVA_STYLE = {
    ice: { ground: 0xcfe4f0, hk: 0.45, med: 'frost', flash: 0xd8e8f4 },
    holy: { ground: 0xffe0a8, hk: 0.55, med: 'light', flash: 0xffe2b0 },
    emp: { ground: 0xb8ccec, hk: 0.6, med: 'arc', flash: 0xc8d8f0 },
    shock: { ground: 0xffd8a8, hk: 0.3, med: 'dust' },
    fire: { ground: 0xff9a40, hk: 0.45, med: 'fire', flash: 0xff9a50 },
    dark: { ground: 0x6a5a68, hk: 0.5, med: 'soot' },
    blood: { ground: 0xb02020, hk: 0.45, med: 'blood' },
    gold: { ground: 0xffd890, hk: 0.6, med: 'dust', warm: 1 },
    water: { ground: 0xb0c8d0, hk: 0.35, med: 'spray' },
    shout: { ground: 0xffc890, hk: 0.4, med: 'dust' },
    time: { ground: 0xc8d0dc, hk: 0.3, med: 'haze' },
    heal: { ground: 0xffe0a8, hk: 0.4, med: 'warm' },
  };
  // what a wave's front throws up at a point on it (x, y, z on the floor; ox, oz the way out; v its speed out; s how big)
  const MED = {
    dust(x, y, z, ox, oz, v, s, S) { const c = S.warm ? [0.6, 0.52, 0.42] : [0.5, 0.47, 0.43]; G.fx.norm.spawn(x, y + 0.15, z, ox * v * rnd(0.5, 0.9), rnd(0.3, 1.2), oz * v * rnd(0.5, 0.9), rnd(0.9, 1.5), 0.6 * s, rnd(1.7, 2.5) * s, c[0], c[1], c[2], 0.2, -0.2, 2.6); },   // (wide and thin: dust, not tufts)
    haze(x, y, z, ox, oz, v, s) { G.fx.norm.spawn(x, y + 0.3, z, ox * v * 0.4, rnd(0.1, 0.5), oz * v * 0.4, rnd(1.0, 1.6), 0.6 * s, 1.8 * s, 0.62, 0.64, 0.68, 0.14, -0.05, 2); },
    warm(x, y, z, ox, oz, v, s) { G.fx.norm.spawn(x, y + 0.2, z, ox * v * 0.4, rnd(0.3, 0.8), oz * v * 0.4, rnd(0.9, 1.4), 0.4 * s, 1.4 * s, 0.68, 0.6, 0.46, 0.16, -0.1, 2); if (Math.random() < 0.3) G.fx.add.spawn(x, y + rnd(0.2, 1.2), z, ox * 0.3, rnd(0.2, 0.6), oz * 0.3, rnd(0.6, 1.1), 0.05, 0.02, 0.5, 0.42, 0.26, 0.8, -0.1, 0.8); },
    light(x, y, z, ox, oz, v, s) { G.fx.norm.spawn(x, y + 0.2, z, ox * v * 0.6, rnd(0.4, 1.4), oz * v * 0.6, rnd(0.9, 1.4), 0.4 * s, 1.5 * s, 0.74, 0.66, 0.52, 0.24, -0.15, 2.4); if (Math.random() < 0.4) G.fx.add.spawn(x, y + rnd(0.2, 1.6), z, ox * v * 0.2, rnd(0.3, 0.9), oz * v * 0.2, rnd(0.6, 1.2), 0.05, 0.02, 0.7, 0.58, 0.36, 0.85, -0.1, 0.8); },
    frost(x, y, z, ox, oz, v, s) { G.fx.norm.spawn(x, y + 0.12, z, ox * v * rnd(0.4, 0.8), rnd(0.05, 0.5), oz * v * rnd(0.4, 0.8), rnd(1.0, 1.7), 0.4 * s, 1.5 * s, 0.78, 0.83, 0.88, 0.36, 0.05, 2.2); if (Math.random() < 0.5) G.fx.drops.spawn(x, y + 0.2, z, ox * v * rnd(0.3, 0.7) + rnd(-0.6, 0.6), rnd(1, 3), oz * v * rnd(0.3, 0.7) + rnd(-0.6, 0.6), rnd(0.4, 0.7), rnd(0.006, 0.012), 0.86, 0.9, 0.94, 9.8, 0.6, 0.012); },
    fire(x, y, z, ox, oz, v, s) { const S2 = 0.62 * s; G.fx.flame.spawn(x, y + S2 * 0.5, z, ox * v * 0.35, rnd(0.6, 1.4), oz * v * 0.35, rnd(0.28, 0.42), S2 * rnd(1.0, 1.4), S2 * 0.6, 1.0 * 3.2, 0.42 * 3.2, 0.12 * 3.2, 0.9, -0.5, 1.5, 1.2, 0.4, 0.1); if (Math.random() < 0.35) G.fx.norm.spawn(x, y + 0.6, z, ox * 0.4, rnd(0.6, 1.2), oz * 0.4, rnd(1.2, 1.8), 0.4 * s, 1.6 * s, 0.1, 0.09, 0.08, 0.35, -0.3, 1.2); },
    soot(x, y, z, ox, oz, v, s) { G.fx.norm.spawn(x, y + 0.2, z, ox * v * rnd(0.4, 0.8), rnd(0.2, 1.0), oz * v * rnd(0.4, 0.8), rnd(1.0, 1.6), 0.45 * s, 1.7 * s, 0.06, 0.055, 0.06, 0.5, -0.12, 2.4); },
    blood(x, y, z, ox, oz, v, s) { G.fx.norm.spawn(x, y + 0.3, z, ox * v * 0.6, rnd(0.2, 0.9), oz * v * 0.6, rnd(0.6, 1.0), 0.3 * s, 1.1 * s, 0.32, 0.03, 0.03, 0.34, 0.2, 2.6); if (Math.random() < 0.6) G.fx.drops.spawn(x, y + 0.4, z, ox * v * rnd(0.3, 0.8), rnd(1.5, 3.5), oz * v * rnd(0.3, 0.8), rnd(0.35, 0.6), rnd(0.008, 0.016), 0.28, 0.02, 0.02, 9.8, 0.5, 0.02); },
    spray(x, y, z, ox, oz, v, s) { G.fx.norm.spawn(x, y + 0.25, z, ox * v * rnd(0.5, 0.9), rnd(0.8, 2.2), oz * v * rnd(0.5, 0.9), rnd(0.6, 1.0), 0.3 * s, 1.2 * s, 0.7, 0.74, 0.76, 0.34, 3, 2); if (Math.random() < 0.6) G.fx.drops.spawn(x, y + 0.3, z, ox * v * rnd(0.4, 0.9), rnd(2, 4.5), oz * v * rnd(0.4, 0.9), rnd(0.4, 0.7), rnd(0.008, 0.014), 0.62, 0.68, 0.72, 9.8, 0.4, 0.02); },
    arc(x, y, z, ox, oz, v, s) { if (Math.random() < 0.5) { const tx = -oz, tz = ox, L = rnd(0.5, 1.2) * s; G.fx.arcBolt(V(x - tx * L * 0.5, y + 0.06, z - tz * L * 0.5), V(x + tx * L * 0.5 + ox * rnd(-0.3, 0.3), y + rnd(0.05, 0.5), z + tz * L * 0.5 + oz * rnd(-0.3, 0.3)), { col: 0xc8d8f0, w: 0.04, life: rnd(0.05, 0.1), branches: 0, minSeg: 0.1 }); } else G.fx.norm.spawn(x, y + 0.1, z, ox * v * 0.4, rnd(0.2, 0.7), oz * v * 0.4, rnd(0.6, 1.0), 0.3 * s, 1.0 * s, 0.46, 0.45, 0.44, 0.22, -0.1, 2.4); },
  };
  // c: centre (on the floor), r: radius (the hit radius), dur: time to reach it. o: { style, hk (how high the throw reaches / r) }
  // Not a glowing dome: a blow running out over the floor. Its band on the floor sits exactly on the radius it has reached (the hit
  // uses the same curve); along its front, what it throws up (dust, frost, flame, arcs, soot, blood, spray), more where it is wider,
  // a fixed number in all however wide it goes.
  VX.nova = function (c, r, dur, o) {
    o = o || {};
    const S = NOVA_STYLE[o.style] || NOVA_STYLE.shock, med = MED[S.med] || MED.dust;
    const pos = c.clone();
    const ring = G.fx.shockRing(pos, o.ground ?? S.ground, Math.max(0.35, Math.min(0.85, r * 0.06)), r + 2);
    const life = dur + 0.45, total = Math.min(90, 14 + r * 9), sz = Math.min(1.8, Math.max(0.55, r / 5)), spd = r / Math.max(0.05, dur);
    if (S.flash) G.fx.flash(V(pos.x, pos.y + 1, pos.z), S.flash, 22 + r * 3, Math.min(0.4, dur + 0.1), r * 2 + 4);
    let t = 0, done = 0;
    live.push({
      update(dt) {
        t += dt;
        const k = Math.min(1, t / dur), R = r * ease(k);
        const fade = t < dur ? 1 : Math.max(0, 1 - (t - dur) / 0.45);
        ring.set(R, fade);
        // (the throw follows the area swept: as many as its share of the disc it has crossed this frame)
        const want = Math.round(total * (R * R) / (r * r)) - done;
        for (let i = 0; i < want && done < total; i++, done++) { const an = Math.random() * 6.283, ox = Math.cos(an), oz = Math.sin(an), rr = R * rnd(0.9, 1.02); med(pos.x + ox * rr, pos.y, pos.z + oz * rr, ox, oz, spd * (1 - k * 0.8) * 0.25, sz, S); }
        return t < life;
      },
      dispose() { ring.dispose(); },
    });
    // style extras
    if (o.style === 'ice') VX.spikes(ringPts(pos, r * 0.92, Math.min(40, Math.round(r * 2.2))), { kind: 'ice', r: 0.5, h: Math.min(2.2, 0.6 + r * 0.09), n: 2, dur: 1.4, delay: dur * 0.85 });
    if (o.style === 'holy') for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28, d = Math.random() * r * 0.8; VX.pillar(V(pos.x + Math.cos(a) * d, pos.y, pos.z + Math.sin(a) * d), 0.75, 6 + Math.random() * 4, 0xffe8a0, 0.6, { delay: Math.random() * dur, ground: false, soft: true }); }   // (shafts of light through dust, wide and soft)
    if (o.style === 'emp') for (let i = 0; i < 6; i++) { const a = Math.random() * 6.28; setGameTimeout(() => { const R2 = r * 0.8, hk = o.hk ?? S.hk; G.fx.lightning(V(pos.x, pos.y + r * hk * 0.5, pos.z), V(pos.x + Math.cos(a) * R2, pos.y + 0.1, pos.z + Math.sin(a) * R2), 0xc8d8f0); }, Math.random() * dur); }
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
      vec3 col = mix(uC, uC2, core * 0.45 + streak * 0.15);
      float a = (core * 0.45 + facing * 0.1 + streak * 0.36 * facing) * ends * uA;   // (light in dusty air: the dust in it shows, drifting)
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * fogv, clamp(a, 0.0, 1.0));
    }`;
  function beamMat(c1, c2, speed) {
    return mk(BEAM_VS, BEAM_FS, { uA: { value: 1 }, uC: { value: tone(c1) }, uC2: { value: tone(c2 ?? 0xffffff) }, uSeed: { value: Math.random() }, uSpeed: { value: speed ?? 2 }, uEnds: { value: 0 } },
      { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  }
  // a column of light standing on c: r = its radius (the hit radius when it hurts), h = its height. o: { delay, follow, ground (a glow on the floor), c2, grow }
  // returns a handle: .pos to move it, .end() to let it go
  VX.pillar = function (c, r, h, col, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(cylGeo, beamMat(tone(col), tone(o.c2 ?? 0xffffff), o.speed ?? 3)); m.frustumCulled = false; m.renderOrder = 8; m.visible = false; scene.add(m);
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
        m.material.uniforms.uA.value = fade * (o.soft ? 0.22 : 0.5) * (0.94 + 0.06 * Math.sin(this.t * 17)); inner.material.uniforms.uA.value = fade * (o.soft ? 0.04 : 0.18); // (a shaft of light in dusty air: soft, not a lit tube)
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
      float edge = smoothstep(0.0, 0.3, vV2) * (1.0 - smoothstep(0.92, 1.0, vV2));
      float glint = pow(vV2, 14.0);                // the blade's own path: a thin bright line of steel catching the light
      float n = vnoise(vec2(vU * 30.0, vV2 * 4.0 - uT * 3.0));
      vec3 col = mix(uC, vec3(1.0, 0.97, 0.92), glint * 0.8);
      float a = (k * k * (0.12 + 0.88 * glint) + n * 0.06 * k) * edge * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * fogv * 1.15, clamp(a, 0.0, 1.0));
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
    const mat = mk(SLASH_VS, SLASH_FS, { uP: { value: 0 }, uA: { value: 1 }, uC: { value: tone(col) }, uTail: { value: o.tail ?? 0.6 } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
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
  // the shape of one spike, base at y = 0 (radius about 1), tip at y = 1: rings of `sides` points, each pushed in or out a little (by a
  // hash of where it is, the same every time), narrowing by `prof` up to a tip that leans by `bend`; faceted (flat faces) or smooth
  function shardGeo(sides, rows, o) {
    const hh = (i, j, k) => { const n = Math.sin(i * 12.9898 + j * 78.233 + k * 37.719 + (o.seed || 0) * 4.1) * 43758.5453; return n - Math.floor(n); };
    const pos = [], idx = [];
    for (let i = 0; i < rows; i++) {
      const h = i / rows, r = o.radius ? o.radius(h) : Math.pow(1 - h, o.prof || 1);
      for (let j = 0; j < sides; j++) {
        const an = (j + (hh(i, j, 1) - 0.5) * (o.twist || 0.4)) / sides * Math.PI * 2, rj = r * (1 - (o.jit || 0.25) + hh(i, j, 2) * (o.jit || 0.25) * 2);
        pos.push(Math.cos(an) * rj + (o.bend || 0) * h * h, h * (1 + (hh(i, j, 3) - 0.5) * (o.hj || 0) / rows), Math.sin(an) * rj);
      }
    }
    pos.push((o.bend || 0) + (o.tipx || 0), 1, 0);
    const tip = rows * sides;
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < sides; j++) { const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides; idx.push(a, c, b, b, c, d); }
    for (let j = 0; j < sides; j++) idx.push((rows - 1) * sides + j, tip, (rows - 1) * sides + (j + 1) % sides);
    let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    if (o.flat) g = g.toNonIndexed();
    g.computeVertexNormals();
    return g;
  }
  const SPIKE_KIND = {
    // (rock: a broken slab, its faces flat and uneven, a little bent)
    rock: () => [shardGeo(6, 4, { prof: 1.05, jit: 0.32, bend: 0.14, hj: 0.6, flat: true, seed: 1 }), new THREE.MeshStandardMaterial({ color: 0x766a5c, roughness: 0.95, flatShading: true })],
    // (ice: a six-sided crystal with a pointed end, clear, frosted pale)
    ice: () => [shardGeo(6, 3, { radius: (h) => (h < 0.5 ? 0.62 - h * 0.08 : 0.58 - (h - 0.5) * 0.9), jit: 0.06, twist: 0.05, bend: 0.04, flat: true, seed: 2 }), new THREE.MeshStandardMaterial({ color: 0xd8e3ea, emissive: 0x0b1216, roughness: 0.14, metalness: 0, flatShading: true, transparent: true, opacity: 0.82 })],
    // (bone: a horn, curving, smooth)
    bone: () => [shardGeo(7, 8, { radius: (h) => Math.pow(1 - h, 0.75) * (0.85 + 0.22 * Math.sin(h * 11.0) * (1 - h)), jit: 0.18, twist: 0.3, bend: 0.32, hj: 0.4, seed: 3 }), new THREE.MeshStandardMaterial({ color: 0xbfb194, roughness: 0.78 })],   // (a splintered bone: knobbed, uneven, bent)
    // (blood: a thick dark run of it, set, wet on its skin)
    blood: () => [shardGeo(7, 5, { prof: 1.5, jit: 0.16, bend: 0.2, seed: 4 }), new THREE.MeshStandardMaterial({ color: 0x2c0305, roughness: 0.22 })],
    // (dark: black glassy shards, sharp-faced)
    dark: () => [shardGeo(5, 4, { prof: 1.15, jit: 0.3, bend: 0.1, hj: 0.4, flat: true, seed: 5 }), new THREE.MeshStandardMaterial({ color: 0x100e11, roughness: 0.32, metalness: 0.15, flatShading: true })],
  };
  function spikeKind(kind) {
    if (spk[kind]) return spk[kind];
    const [geo, mat] = (SPIKE_KIND[kind] || SPIKE_KIND.rock)();
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
      vec3 deep = vec3(0.01, 0.035, 0.045), mid = vec3(0.04, 0.1, 0.11), light = vec3(0.14, 0.24, 0.24);
      vec3 col = mix(deep, mid, smoothstep(0.0, 0.5, vU));
      col = mix(col, light, smoothstep(0.5, 0.78, vU) * 0.8);
      float streak = smoothstep(0.6, 0.88, fbm(vec2(vX * 1.1, vU * 8.0 - uT * 4.0)));
      col += streak * 0.16 * vec3(0.6, 0.9, 1.0);
      float fn = fbm(vec2(vX * 0.4, vU * 3.0 - uT * 2.4));
      float foam = smoothstep(0.8, 0.92, vU + (fn - 0.5) * 0.3);
      float lace = smoothstep(0.55, 0.75, vU) * smoothstep(0.7, 0.86, fbm(vec2(vX * 2.2, vU * 14.0 - uT * 5.0))) * 0.45;
      col = mix(col, vec3(0.94, 0.98, 1.0), max(foam, lace));
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
      col += fres * 0.16 * vec3(0.55, 0.62, 0.64);
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
      vec3 col = mix(vec3(0.02, 0.045, 0.05), vec3(0.08, 0.15, 0.16), n);
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
  VX.fireMat = fireMat; VX.shellMat = (c1, c2, style) => shellMat(tone(c1), tone(c2 ?? 0xffffff), style);
  // ---- the body of a blast. Not a glowing ball: a mass of puffs, round swells with sharp creases between them, that rolls upward as
  // it is seen. All of it burns white at first; then the crowns of the puffs go to soot while fire still shows in the creases, and at
  // the end it is black smoke that is eaten away in holes. It hides what is behind it (it is not added to the picture as light is).
  const BLAST_N = `
    float h31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
    float vn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
                 mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }
    float bil(float n) { float x = 2.0 * n - 1.0; return sqrt(x * x + 0.012); }
    float puff(vec3 p) { float v = 0.0, a = 0.56; for (int i = 0; i < 3; i++) { v += a * bil(vn3(p)); p = p * 2.13 + vec3(7.1, 3.3, 5.7); a *= 0.38; } return v; }
  `;
  const BLAST_VS = `uniform float uT; uniform float uSeed; uniform float uBoil; uniform float uRoll;
    varying vec3 vN; varying vec3 vV; varying vec3 vD; varying float vH; varying float vDepth;
    ${BLAST_N}
    float hgt(vec3 d) { return puff(d * 1.9 + vec3(uSeed * 13.0, uSeed * 5.0 - uRoll, uSeed * 3.0)); }
    vec3 at(vec3 d, out float h) { h = hgt(d); return d * (1.0 + (h - 0.4) * uBoil); }
    void main() {
      vec3 d = normalize(position);
      vec3 t1 = normalize(cross(d, abs(d.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(d, t1);
      float h, h1, h2;
      vec3 p0 = at(d, h), p1 = at(normalize(d + t1 * 0.05), h1), p2 = at(normalize(d + t2 * 0.05), h2);
      vec3 n = normalize(cross(p1 - p0, p2 - p0));
      vD = d; vH = h;
      vec4 mv = modelViewMatrix * vec4(p0, 1.0);
      vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz); vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;
  const BLAST_FS = `uniform float uT; uniform float uA; uniform float uCool; uniform float uSeed; uniform float uRoll; uniform vec3 uTint; ${FOG_U}
    varying vec3 vN; varying vec3 vV; varying vec3 vD; varying float vH;
    ${BLAST_N}
    void main() {
      vec3 N = normalize(vN), V = normalize(vV);
      float facing = clamp(dot(N, V), 0.0, 1.0);
      float fine = vn3(vD * 5.5 + vec3(uSeed * 9.0, -uRoll * 2.4, 1.7)) * 0.62 + vn3(vD * 12.0 + vec3(3.1, -uRoll * 3.6, uSeed * 4.0)) * 0.38;
      float hh = clamp(vH * 1.25, 0.0, 1.0), deep = (1.0 - hh) * (1.0 - hh);
      // how hot: all of it at first; the crowns of the puffs cool in a third of a second, the creases stay alight three times as long
      float temp = 1.5 * (1.0 - uCool / (0.4 + deep * 2.0)) - hh * 0.62 + (fine - 0.5) * 0.7 - (1.0 - facing) * (1.0 - facing) * 0.95;
      vec3 fire = mix(vec3(0.3, 0.02, 0.004), vec3(1.5, 0.3, 0.03), smoothstep(0.1, 0.42, temp));
      fire = mix(fire, vec3(2.5, 1.05, 0.2), smoothstep(0.42, 0.8, temp));
      fire = mix(fire, vec3(2.7, 1.9, 0.9), smoothstep(0.95, 1.7, temp));
      fire *= uTint;
      // soot: nearly black; lit from the fire in the creases beside it, and a little from above
      vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      float sky = dot(N, up) * 0.5 + 0.5, lit = clamp(1.0 - uCool / 1.9, 0.0, 1.0);
      vec3 soot = vec3(0.03, 0.027, 0.025) * (0.25 + 1.3 * sky * sky) * (0.55 + 0.9 * fine) * (0.7 + 0.6 * hh);
      soot += vec3(0.3, 0.06, 0.008) * uTint * lit * (0.06 + 0.94 * deep * deep) * (0.4 + 0.6 * (1.0 - sky));
      float f = smoothstep(-0.04, 0.24, temp);
      vec3 col = mix(soot, fire, f);
      // eaten away as it thins, in holes; soft at its outline
      float th = 1.0 - uA, q = fine * 0.55 + vH * 0.6;
      float dis = smoothstep(th * 1.35 - 0.3, th * 1.35 - 0.04, q);
      float a = smoothstep(0.02, 0.46, facing + (fine - 0.5) * 0.3) * mix(0.93, 1.0, f) * dis * min(1.0, uA * 2.5);
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uFogC, col, fogv), clamp(a, 0.0, 1.0));
    }`;
  function blastMat() { return mk(BLAST_VS, BLAST_FS, { uA: { value: 1 }, uCool: { value: 0 }, uSeed: { value: Math.random() }, uBoil: { value: 0.4 }, uRoll: { value: 0 }, uTint: { value: col3(0xffffff) } }, {}); }
  let blastGeo = null;
  // a fireball for a blast: swells to about 0.85 r (the blast hurts out to r), then cools, rises and thins to smoke. tint: a colour the flame is multiplied by (white = plain fire)
  const fbPool = [];
  VX.fireball = function (p, r, tint) {
    let o = fbPool.find((x) => !x.on);
    if (!o) { if (fbPool.length >= 14) o = fbPool[0]; else { const m = new THREE.Mesh(blastGeo, blastMat()); m.frustumCulled = false; m.renderOrder = 9; scene.add(m); o = { m }; fbPool.push(o); } }
    o.on = true; o.t = 0; o.r = r; o.pos = p.clone(); o.m.visible = true; o.spin = Math.random() * 6.283;
    o.m.material.uniforms.uTint.value.set(tint ?? 0xffffff); o.m.material.uniforms.uSeed.value = Math.random(); o.m.rotation.y = o.spin; o.hold = null;
    return o;
  };
  // a burst of light for a blast that is not fire (purple, blue, green ...): a glowing shell that swells to r and fades
  const bsPool = [];
  // a burst that is not fire (a blink, a pull, a decoy, a blast of another colour): what it is made of, thrown out from p to about r -
  // cold air and a crackle of arcs (blue), soot and grit (violet, dark), a sick murk (green), dust (grey and the rest) - with a
  // short flash of its light. Not a glowing ball.
  const _hb = { h: 0, s: 0, l: 0 };
  VX.burst = function (p, r, col) {
    const c0 = col3(col ?? 0xa070ff); c0.getHSL(_hb, THREE.SRGBColorSpace);
    const h = _hb.h, sat = _hb.s, c = tone(col ?? 0xa070ff), F = G.fx, n = Math.round(8 + r * 6);
    F.flash(p, c.getHex(), 5 + r * 3, 0.12, r * 3 + 3);
    const puff = (cr, cg, cb, a, rise, k) => { for (let i = 0; i < n; i++) { const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1) * 0.7, rnd(-1, 1)).normalize(), sp = r * rnd(2.2, 3.6); F.norm.spawn(p.x, p.y, p.z, d.x * sp, d.y * sp + rise, d.z * sp, rnd(0.7, 1.2) * k, 0.25 * r, rnd(0.9, 1.4) * r, cr, cg, cb, a, -rise * 0.3, 3.2); } };
    if (sat > 0.2 && h > 0.5 && h < 0.7) { puff(0.74, 0.78, 0.82, 0.3, 0.2, 1); F.arcsOn(p, r * 0.6, r * 0.8, 3, c.getHex()); }
    else if (sat > 0.2 && h >= 0.7 && h < 0.95) { puff(0.08, 0.075, 0.08, 0.55, 0.3, 1.1); F.sparks(p, null, 4, 0xffd0a0, 4); }
    else if (sat > 0.2 && h > 0.18 && h <= 0.5) F.gas(p, n, r * 0.8);
    else puff(0.5, 0.47, 0.43, 0.38, 0.3, 1);
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
      o.t += dt; if (o.hold != null) o.t = o.hold;   // (hold: for looking at one moment of it)
      // (out in a tenth of a second; the crowns of the puffs are soot in a third of one and the creases burn for most of one; then smoke, going up)
      const k = o.t, grow = Math.min(1, k / 0.13), cool = Math.max(0, (k - 0.07) / 0.5), fade = Math.max(0, (k - 0.55) / 0.85), u = o.m.material.uniforms;
      const late = Math.min(2.6, cool), R = o.r * (0.2 + 0.5 * (1 - Math.pow(1 - grow, 3))) * (1 + late * 0.08);
      o.m.scale.set(Math.max(0.05, R), Math.max(0.05, R * (1 + late * 0.12)), Math.max(0.05, R));
      o.m.position.set(o.pos.x, o.pos.y + late * o.r * 0.2, o.pos.z);
      u.uCool.value = cool; u.uA.value = Math.max(0, 1 - fade);
      u.uBoil.value = 0.22 + 0.24 * Math.min(1, k / 0.3);                     // (smooth as it bursts out, lumpier as it slows)
      u.uRoll.value = k * 0.55 + Math.min(1, k / 0.2) * 0.25;                // (the puffs roll upward)
      if (fade >= 1) { o.on = false; o.m.visible = false; }
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
      gl_FragColor = vec4(mix(uC, vec3(1.0, 0.95, 0.85), up * 0.25) * fogv * 0.7, clamp(a, 0.0, 1.0));   // (light standing in dusty air at the rim, not a lit curtain)
    }`;
  VX.wall = function (c, r, h, col, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(cylGeo, mk(WALL_VS, WALL_FS, { uA: { value: 0 }, uC: { value: tone(col) } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
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
    const m = new THREE.Mesh(sphGeo, shellMat(tone(col), tone(o.c2 ?? 0xffffff), 'rim')); m.frustumCulled = false; m.renderOrder = 7; scene.add(m);   // (a ward held: a faint shimmer at its rim, the outline of what it guards; no glass ball)
    const hd = { t: 0, dur: dur ?? Infinity, r, dead: false,
      end(f) { this.dur = Math.min(this.dur, this.t + (f ?? 0.3)); },
      update(dt) {
        this.t += dt;
        const p = follow.pos || follow, k = Math.min(1, this.t / 0.2), left = this.dur - this.t;
        m.position.set(p.x, p.y + (o.lift ?? 1), p.z);
        m.scale.setScalar(this.r * (0.6 + 0.4 * k) * (1 + 0.025 * Math.sin(this.t * 6)));
        m.material.uniforms.uA.value = (o.alpha ?? 0.45) * 0.16 * k * Math.min(1, left / 0.3) * (1 + (this.t < 0.3 ? (0.3 - this.t) * 4 : 0));
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
    const m = new THREE.Mesh(bellGeo, VX.bellMat); m.frustumCulled = false; scene.add(m);   // (one material for every bell: bronze, kept)
    const tolled = new Set();
    let t = 0;
    live.push({
      update(dt) {
        t += dt;
        const p = follow.pos || follow, k = Math.min(1, t / 0.4), left = dur - t;
        let flare = 0; for (const tt of tolls || []) { const x = t - tt; if (x >= 0 && x < 0.5) flare = Math.max(flare, 1 - x / 0.5); }
        m.position.set(p.x, p.y + 6.5, p.z); m.scale.setScalar(2.2 * (0.7 + 0.3 * k) * (1 + flare * 0.12));
        m.rotation.z = Math.sin(t * 3.2) * 0.22; m.rotation.y += dt * 0.4;
        m.visible = left > 0.05;
        for (const tt of tolls || []) if (t >= tt && !tolled.has(tt)) { tolled.add(tt); const q = m.position; for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = rnd(0.6, 2.2); G.fx.norm.spawn(q.x + Math.cos(a) * d, q.y + rnd(-0.5, 1.5), q.z + Math.sin(a) * d, Math.cos(a) * 0.4, rnd(-1.5, -0.4), Math.sin(a) * 0.4, rnd(1.2, 2), 0.3, 1.2, 0.5, 0.47, 0.42, 0.35, 1.5, 0.8); } }
        return left > 0;
      },
      dispose() { scene.remove(m); },
    });
  };

  // ================================================================ the heart of a gravity well: what it drags in, seen
  // No ball and no ring: dust and grit dragged over the floor in a curl toward the middle, faster the closer they come, and a dark
  // column of dust standing and turning over the middle, thinning as it rises (the floor's own dark pit is the gravity area's)
  VX.vortex = function (c, r, dur, o) {
    o = o || {};
    const hd = { pos: c.clone(), r, t: 0, dur: dur ?? Infinity, dead: false, lease: o.lease || 0,
      end(f) { this.dur = Math.min(this.dur, this.t + (f ?? 0.3)); },
      touch() { this.seen = this.t; },
      update(dt) {
        this.t += dt;
        if (this.lease && this.t - (this.seen || 0) > this.lease) this.end(0.2);
        const left = this.dur - this.t, k = Math.min(1, this.t / 0.4) * Math.min(1, left / 0.3), R = this.r, p = this.pos;
        // (dust swept in along the floor: from the edge, with a turn to it)
        for (let n = 0, m = Math.min(6, R * dt * 14 * k); n < m || Math.random() < m - n; n++) {
          if (n > 6) break;
          const a = Math.random() * 6.28, d = R * rnd(0.55, 1), sp = rnd(2.5, 4.5) * Math.min(1.6, R / 5);
          G.fx.norm.spawn(p.x + Math.cos(a) * d, p.y + 0.15, p.z + Math.sin(a) * d, -Math.cos(a) * sp - Math.sin(a) * sp * 0.8, rnd(0.05, 0.4), -Math.sin(a) * sp + Math.cos(a) * sp * 0.8, d / sp * 0.9, 0.5, 0.9, 0.42, 0.39, 0.35, 0.3 * k, -0.05, 0.4);
          if (Math.random() < 0.5) G.fx.drops.spawn(p.x + Math.cos(a) * d, p.y + 0.1, p.z + Math.sin(a) * d, -Math.cos(a) * sp * 1.2 - Math.sin(a) * sp, rnd(0.5, 2), -Math.sin(a) * sp * 1.2 + Math.cos(a) * sp, d / sp * 0.7, rnd(0.01, 0.02), 0.22, 0.2, 0.18, 2, 0.3, 0.03);
        }
        // (the column over the middle: dark dust going up and round)
        if (Math.random() < dt * 22 * k) { const a = this.t * 4 + Math.random() * 6.28, d = rnd(0.2, 0.7) * Math.min(2, R * 0.15); G.fx.norm.spawn(p.x + Math.cos(a) * d, p.y + rnd(0.1, 0.6), p.z + Math.sin(a) * d, -Math.sin(a) * 2.2, rnd(1.4, 2.6), Math.cos(a) * 2.2, rnd(1.0, 1.5), 0.5, rnd(1.6, 2.4), 0.07, 0.065, 0.065, 0.42 * k, -0.4, 0.8); }
        return left > 0;
      },
      dispose() { this.dead = true; },
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
      float a = trail * trail * trail * edge * uA;   // (only just behind each blade, along its edge: the glint of its passing)
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uC, vec3(1.0), edge * trail * 0.5) * fogv * 0.45, clamp(a, 0.0, 1.0));
    }`;
  // the ring of blades (刃の旋風 / 剣の嵐 / the blade boon): r = their radius, hw = how far either side of it they cut (the hit reach)
  VX.spinRing = function () {
    const m = new THREE.Mesh(areaGeo, mk(SPIN_VS, SPIN_FS, { uS: { value: 1 }, uR: { value: 3 }, uHW: { value: 1.2 }, uN: { value: 6 }, uPh: { value: 0 }, uA: { value: 0 }, uC: { value: tone(0xc8dcff) } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.frustumCulled = false; m.renderOrder = 6; m.visible = false; scene.add(m);
    return {
      m,
      set(pos, y, r, hw, n, ph, a, col) {
        m.visible = a > 0.01; if (!m.visible) return;
        const S = r + hw + 0.2; m.scale.set(S, 1, S); m.position.set(pos.x, y, pos.z);
        const u = m.material.uniforms; u.uS.value = S; u.uR.value = r; u.uHW.value = hw; u.uN.value = n; u.uPh.value = ph; u.uA.value = a * 0.18; if (col !== undefined) tone(col, u.uC.value);   // (the air the blades cut: a faint glint behind each, not a lit band)
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
    if (z.kind === 'gravity' && r >= 3 && !z.noCore && (!z.vxCore || z.vxCore.dead)) z.vxCore = VX.vortex(p, r, Infinity, { lease: 0.3 });
    if (z.vxCore) { z.vxCore.touch(); z.vxCore.pos.copy(p); if (left < 0.35) z.vxCore.end(Math.max(0.05, left)); }
    const rp = () => { const a = R() * 6.28, d = Math.sqrt(R()) * r; return [p.x + Math.cos(a) * d, p.z + Math.sin(a) * d]; };
    switch (z.kind) {
      case 'fire': for (let n = 0; n < r * r * dt * 2.4 * k; n++) { const [x, zz] = rp(); G.fx.flameLick(x, p.y + 0.05, zz, 1.3 + R()); } break;
      case 'poison': case 'acid': if (R() < dt * r * (z.kind === 'poison' ? 5 : 3)) { const [x, zz] = rp(); if (z.kind === 'poison') { G.fx.norm.spawn(x, p.y + 0.3, zz, R() * 0.4 - 0.2, 0.12, R() * 0.4 - 0.2, 3.0, 1.0, 3.4, 0.32, 0.33, 0.17, 0.36 * k, -0.02, 0.5); if (R() < 0.5) { const [x2, z2] = rp(); G.fx.norm.spawn(x2, p.y + 0.1, z2, 0, 0.05, 0, 2.2, 0.6, 2.2, 0.3, 0.31, 0.16, 0.28 * k, 0, 0.5); } } else G.fx.norm.spawn(x, p.y + 0.12, zz, 0, 0.35, 0, 1.0, 0.25, 0.9, 0.4, 0.4, 0.22, 0.22 * k, -0.08, 0.5); } break; // (poison: a murk that hangs low and spreads; acid: fumes off its fizzing)
      case 'smoke': if (R() < dt * r * 6) { const [x, zz] = rp(); G.fx.norm.spawn(x, p.y + 0.5, zz, 0, 0.2, 0, 2.5, 1.5, 4, 0.5, 0.5, 0.5, 0.6 * k, -0.02, 0.3); } break;
      case 'heal': case 'holy': for (let n = 0, m = dt * (6 + r * 4); n < m || R() < m - n; n++) { if (n > 5) break; const [x, zz] = rp(); const c = z.kind === 'heal' ? 0.9 : 1.15; G.fx.add.spawn(x, p.y + 0.05 + R() * 0.4, zz, R() * 0.16 - 0.08, 0.45 + R() * 0.55, R() * 0.16 - 0.08, 1.5 + R() * 0.6, 0.07, 0.035, c, c * 0.8, c * 0.5, 0.85, -0.05, 0.4); } break; // (motes of light rising out of it: where it helps, seen from afar)
      case 'frost': if (R() < dt * r * 3) { const [x, zz] = rp(); G.fx.norm.spawn(x, p.y + 0.1, zz, R() * 0.3 - 0.15, 0.08, R() * 0.3 - 0.15, 2.0, 0.5, 1.8, 0.78, 0.82, 0.86, 0.22 * k, 0.02, 0.5); } break; // (cold air: a low mist that creeps out)
      case 'arrowrain': if (R() < dt * 30) { const [x, zz] = rp(); G.fx.tracer(V(x + 1, p.y + 10, zz), V(x, p.y, zz), 0xcfc0a0, 0.02, 0.12); if (R() < 0.3) G.fx.dust(V(x, p.y, zz), V(0, 1, 0), 0x8a8070, 1); } break;
      case 'grasp': if (R() < dt * 8) { const [x, zz] = rp(); G.fx.norm.spawn(x, p.y + 0.1, zz, 0, 1.2, 0, 0.9, 0.3, 0.6, 0.03, 0.028, 0.03, 0.6, 0, 1); } if (R() < dt * 5 * k) { const [x, zz] = rp(); VX.spikes([V(x, p.y, zz)], { kind: 'dark', r: 0.6, h: 1.1, n: 2, dur: 0.45, rise: 0.12 }); } break; // (dark hands clutch up out of it)
      case 'whirl': for (let n = 0; n < 2; n++) { const a = z.t * 5 + n * 3.1 + R() * 0.5, d = r * (0.3 + R() * 0.7); G.fx.norm.spawn(p.x + Math.cos(a) * d, p.y + 0.2 + R() * 0.5, p.z + Math.sin(a) * d, -Math.sin(a) * 3, 0.6, Math.cos(a) * 3, 0.5, 0.25, 0.6, 0.66, 0.7, 0.72, 0.5 * k, 2, 1); } break;
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
    else if (k === 'drain' && R() < dt * 22) { const an = R() * 6.28, d = a.r * (0.5 + R() * 0.5); G.fx.norm.spawn(c.x + Math.cos(an) * d, c.y + 0.3, c.z + Math.sin(an) * d, -Math.cos(an) * d * 0.9, rnd(1, 2.5), -Math.sin(an) * d * 0.9, 0.9, 0.16, 0.05, 0.36, 0.03, 0.03, 0.8, 0, 0.6); }
    else if (k === 'holy' && R() < dt * 16) G.fx.add.spawn(c.x + rnd(-a.r, a.r) * 0.7, c.y + R() * 2, c.z + rnd(-a.r, a.r) * 0.7, rnd(-0.1, 0.1), 0.3 + R() * 0.3, rnd(-0.1, 0.1), 1.4, 0.04, 0.03, 0.66, 0.56, 0.38, 0.8, -0.05, 0.6);
    else if (k === 'beam') for (let i = 0; i < 2; i++) { const an = R() * 6.28, d = Math.sqrt(R()) * a.r; G.fx.flame.spawn(c.x + Math.cos(an) * d, c.y + 0.1, c.z + Math.sin(an) * d, rnd(-0.5, 0.5), rnd(2, 6), rnd(-0.5, 0.5), rnd(0.3, 0.6), 0.5, 0.1, 1.6, 1.3, 0.8, 1, -1, 1, 1.0, 0.5, 0.1); }
  };
  VX.auraEnd = function (a) { if (a.vx) { a.vx.end(0.4); a.vx = null; } if (a.vx2) { a.vx2.end(0.4); a.vx2 = null; } };

  // ================================================================ motes that rise around someone for a while (a buff you can see on yourself)
  VX.motes = function (follow, col, dur, rate) {
    const c = tone(col); let t = 0;
    live.push({
      update(dt) {
        t += dt; const p = follow.pos || follow, n = (rate || 30) * dt * 0.6;
        for (let i = 0; i < n || Math.random() < n - i; i++) {
          const a = Math.random() * 6.28, d = rnd(0.5, 1.1);
          G.fx.add.spawn(p.x + Math.cos(a) * d, p.y + rnd(0, 1.8), p.z + Math.sin(a) * d, -Math.cos(a) * 0.25, rnd(0.6, 1.6), -Math.sin(a) * 0.25, rnd(0.5, 0.9), 0.045, 0.015, c.r * 0.8, c.g * 0.8, c.b * 0.8, 0.85, -0.2, 0.6);
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

  // ================================================================ a beam held from frame to frame (a sweeping laser, a wall of force)
  // set(a, b, r, rv) every frame: r is its radius, the reach of its hit test; rv (optional) a flatter height for a low beam you jump over.
  // It fades away a moment after it stops being set.
  const UP = V(0, 1, 0), _bx = V(), _bz = V(), _bm = new THREE.Matrix4();
  VX.ray = function (col, c2, alpha) { // (alpha: fainter, for a wake that marks where something passed)
    const m = new THREE.Mesh(cylGeo, beamMat(col, c2 ?? 0xffffff, 7)); m.frustumCulled = false; m.renderOrder = 8; m.material.uniforms.uEnds.value = 1; scene.add(m);
    const inner = new THREE.Mesh(cylGeo, beamMat(c2 ?? 0xffffff, 0xffffff, 9)); inner.frustumCulled = false; inner.renderOrder = 8; inner.material.uniforms.uEnds.value = 1; scene.add(inner);
    const h = { t: 0, seen: 0, gone: false, al: alpha ?? 1,
      set(a, b, r, rv) {
        const d = b.clone().sub(a), len = d.length() || 0.01; d.divideScalar(len);
        m.position.copy(a).addScaledVector(d, len * 0.5);
        _bx.crossVectors(d, UP);
        if (rv == null || _bx.lengthSq() < 1e-4) { m.quaternion.setFromUnitVectors(UP, d); rv = r; }
        else { _bx.normalize(); _bz.crossVectors(_bx, d); m.quaternion.setFromRotationMatrix(_bm.makeBasis(_bx, d, _bz)); } // (x across, level; z upright)
        m.scale.set(r, len, rv);
        inner.position.copy(m.position); inner.quaternion.copy(m.quaternion); inner.scale.set(r * 0.28, len, rv * 0.28);
        this.seen = this.t;
      },
      update(dt) {
        this.t += dt; const age = this.t - this.seen, f = age < 0.07 ? 1 : Math.max(0, 1 - (age - 0.07) / 0.2);
        m.material.uniforms.uA.value = f * this.al * (0.85 + 0.15 * Math.sin(this.t * 41)); inner.material.uniforms.uA.value = f * this.al * 0.85;
        return f > 0;
      },
      dispose() { scene.remove(m); scene.remove(inner); m.material.dispose(); inner.material.dispose(); this.gone = true; },
    };
    live.push(h); return h;
  };
  // (a held beam: make one the first time, or again once the last one has faded)
  VX.hold = (h, col, c2) => (h && !h.gone ? h : VX.ray(col, c2));

  // ================================================================ a held upright sheet of light (the blade under a sweeping beam)
  // set(a, b, ha, hb) every frame: a, b = its foot on the floor, ha, hb = its height above a and above b. Bright along the floor and the top edge.
  const CURT_VS = `varying vec2 vUv; varying float vDepth;
    void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const CURT_FS = `uniform float uT; uniform float uA; uniform vec3 uC; uniform float uLen; ${FOG_U} varying vec2 vUv;
    ${NOISE}
    void main() {
      float y = vUv.y, foot = pow(1.0 - y, 5.0), top = pow(y, 8.0);
      float streak = fbm(vec2(vUv.x * uLen * 0.6, y * 2.5 - uT * 2.2));
      float ends = smoothstep(0.0, 0.04, vUv.x) * (1.0 - smoothstep(0.9, 1.0, vUv.x));
      float a = (0.1 + 0.75 * foot + 0.5 * top) * (0.45 + 0.75 * streak) * ends * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uC, vec3(1.0), foot * 0.45 + top * 0.3) * fogv, clamp(a, 0.0, 1.0));
    }`;
  function curtMat(col) { return mk(CURT_VS, CURT_FS, { uA: { value: 1 }, uC: { value: tone(col) }, uLen: { value: 10 } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }
  VX.curtain = function (col) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, curtMat(col)); m.frustumCulled = false; m.renderOrder = 7; scene.add(m);
    const h = { t: 0, seen: 0, gone: false,
      set(a, b, ha, hb) {
        const p = g.attributes.position.array;
        p[0] = a.x; p[1] = a.y; p[2] = a.z; p[3] = b.x; p[4] = b.y; p[5] = b.z;
        p[6] = b.x; p[7] = b.y + hb; p[8] = b.z; p[9] = a.x; p[10] = a.y + ha; p[11] = a.z;
        g.attributes.position.needsUpdate = true; m.material.uniforms.uLen.value = Math.max(1, a.distanceTo(b));
        this.seen = this.t;
      },
      update(dt) {
        this.t += dt; const age = this.t - this.seen, f = age < 0.07 ? 1 : Math.max(0, 1 - (age - 0.07) / 0.2);
        m.material.uniforms.uA.value = f * (0.85 + 0.15 * Math.sin(this.t * 33));
        return f > 0;
      },
      dispose() { scene.remove(m); g.dispose(); m.material.dispose(); this.gone = true; },
    };
    live.push(h); return h;
  };
  VX.holdCurtain = (h, col) => (h && !h.gone ? h : VX.curtain(col));

  // ================================================================ a fan-shaped shock running out over the floor (a cone attack): the band is the front, the fan its reach
  const FAN_VS = `uniform float uS; varying vec2 vP; varying float vDepth;
    void main() { vP = position.xz * uS; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  const FAN_FS = `uniform float uLit; uniform float uT; uniform float uR; uniform float uRmax; uniform float uHalf; uniform float uDir; uniform float uNear; uniform float uA; uniform vec3 uC; ${FOG_U} varying vec2 vP;
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
      float n = fbm(vP * 0.6 + uT * 0.5), n2 = fbm(vP * 1.7 - uT * 0.8);
      // (dust: the front is a band of it thrown up, more of it settling behind; the front's foot lit a little by the blow; the sides of
      // the fan only where the dust has been)
      float dust = clamp((band * 0.75 + trail * 0.8 + edge * 0.5) * smoothstep(0.2, 0.75, n * 0.6 + n2 * 0.55), 0.0, 0.75) * m * uA;
      float core = exp(-e * e * 14.0) * (d <= uR + 0.3 ? 1.0 : 0.0) * m * uA;
      ${fogAdd}
      if (dust < 0.01 && core < 0.01) discard;
      gl_FragColor = vec4(uC * core * 0.12 * fogv + mix(uFogC, vec3(0.4, 0.37, 0.33) * uLit, fogv) * dust, dust);
    }`;
  // c: the apex on the floor, f: the middle of the fan, r: its reach, half: its half angle (radians), dur: the time its front takes to reach r
  // (the same curve as a nova: abilities time the hits with VX.novaTime). o: { near: a full circle of this radius around the apex that is hit too, col }
  VX.fan = function (c, f, r, half, dur, o) {
    o = o || {};
    const m = new THREE.Mesh(areaGeo, premul(mk(FAN_VS, FAN_FS, { uS: { value: r + 1 }, uR: { value: 0 }, uRmax: { value: r }, uHalf: { value: half }, uDir: { value: Math.atan2(f.z, f.x) }, uNear: { value: o.near || 0 }, uA: { value: 1 }, uC: { value: tone(o.col ?? 0xe0d0b0) }, uLit: LIT },
      { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })));
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
    blastGeo = new THREE.IcosahedronGeometry(1, 14);
    cylGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
    coneGeo = new THREE.ConeGeometry(1, 1, 28, 1, true);
    VX.geo = { area: areaGeo, dome: domeGeo, sph: sphGeo, cyl: cylGeo, cone: coneGeo };
    // one of each kind of material, for the shader warm-up
    const add = (m) => { m.visible = false; m.frustumCulled = false; scene.add(m); warmMeshes.push(m); };
    add(new THREE.Mesh(areaGeo, areaMat('fire'))); add(new THREE.Mesh(areaGeo, areaMat('poison')));
    add(new THREE.Mesh(domeGeo, shellMat(0xffffff, 0xffffff, 'energy')));
    add(new THREE.Mesh(cylGeo, beamMat(0xffffff))); add(new THREE.Mesh(areaGeo, curtMat(0xffffff)));
    add(new THREE.Mesh(sphGeo, fireMat())); add(new THREE.Mesh(blastGeo, blastMat()));
    add(new THREE.Mesh(arcGeo(0.5, 1, 1, 4), mk(SLASH_VS, SLASH_FS, { uP: { value: 0 }, uA: { value: 0 }, uC: { value: col3(0xffffff) }, uTail: { value: 0.5 } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    add(new THREE.Mesh(waveGeo(4, 2), mk(WAVE_VS, WAVE_FS, { uA: { value: 0 }, uHalf: { value: 2 } }, { side: THREE.DoubleSide })));
    add(new THREE.Mesh(arcGeo(0.5, 1, 1, 4), crescentMat(0xffffff)));
    add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mk(SHEET_VS, SHEET_FS, { uA: { value: 0 }, uFront: { value: 0 }, uHalf: { value: 1 } }, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))); // (the great wave's sheet of water on the ground: 大海嘯)
    for (const k of ['rock', 'ice', 'bone', 'blood', 'dark']) spikeKind(k);
    // the rime over a frozen foe (enemies.js rime) and the crystal a reaction drops (element.js): made here, so that they are warm
    // (coats over a foe's body, enemies.js coat: frost settling on what faces up - shoulders, head, the top of a blade - and a sick
    // green-brown murk in blotches with a wet sheen. Drawn over its parts, a little proud of them; the pattern sticks to each part)
    const COAT_VS = `varying vec3 vL; varying vec3 vN; varying float vDepth;
      void main() { vL = position; vN = normalize(mat3(modelMatrix) * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
    const COAT_FS = `uniform float uKind; uniform float uT; uniform float uLit; ${FOG_U} varying vec3 vL; varying vec3 vN;
      ${NOISE}
      void main() {
        vec3 p = vL * (uKind < 0.5 ? 7.0 : 3.6);
        float n = fbm(p.xy + p.z * 0.37) * 0.5 + fbm(p.zy * 1.13 + 3.7) * 0.5, n2 = fbm(p.xz * 2.3 + 1.1);
        vec3 col; float a;
        if (uKind < 0.5) { float up = smoothstep(-0.2, 0.75, vN.y); a = smoothstep(0.52, 0.66, n * 0.75 + n2 * 0.25 + up * 0.3) * 0.9; col = vec3(0.74, 0.78, 0.82) * (0.55 + 0.6 * uLit) * (0.8 + 0.35 * n2); }
        else { a = smoothstep(0.38, 0.5, n) * 0.92; col = mix(vec3(0.06, 0.075, 0.012), vec3(0.17, 0.19, 0.04), n2) * (0.55 + 0.6 * uLit) + vec3(0.12, 0.13, 0.05) * smoothstep(0.78, 0.92, n2) * uLit; }
        ${fogAdd}
        if (a < 0.02) discard;
        gl_FragColor = vec4(mix(uFogC, col, fogv), a);
      }`;
    VX.coatMat = { frost: mk(COAT_VS, COAT_FS, { uKind: { value: 0 }, uLit: LIT }, {}), poison: mk(COAT_VS, COAT_FS, { uKind: { value: 1 }, uLit: LIT }, {}) };
    add(new THREE.Mesh(sphGeo, VX.coatMat.frost)); add(new THREE.Mesh(sphGeo, VX.coatMat.poison));
    if (G.enemies && G.enemies.daubMat) { const sp = new THREE.Sprite(G.enemies.daubMat()); add(sp); }   // (the mark daubed on a marked foe)
    VX.bellMat = new THREE.MeshStandardMaterial({ color: 0x5c4a30, metalness: 0.85, roughness: 0.48, side: THREE.DoubleSide });
    add(new THREE.Mesh(sphGeo, VX.bellMat));
    VX.rimeMat = new THREE.MeshStandardMaterial({ color: 0xd0dae2, emissive: 0x0c1216, roughness: 0.45, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
    VX.crystalMat = new THREE.MeshStandardMaterial({ color: 0xb0a890, emissive: 0x2a2620, roughness: 0.35, metalness: 0, flatShading: true, vertexColors: true });
    add(new THREE.Mesh(sphGeo, VX.rimeMat)); add(new THREE.Mesh(sphGeo, VX.crystalMat));
    // (the fan of a cone attack, the wall of light round a holy ground, the band under orbiting blades: made at their first use before)
    add(new THREE.Mesh(areaGeo, premul(mk(FAN_VS, FAN_FS, { uS: { value: 1 }, uR: { value: 0 }, uRmax: { value: 1 }, uHalf: { value: 1 }, uDir: { value: 0 }, uNear: { value: 0 }, uA: { value: 0 }, uC: { value: col3(0xffffff) }, uLit: LIT }, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }))));
    add(new THREE.Mesh(cylGeo, mk(WALL_VS, WALL_FS, { uA: { value: 0 }, uC: { value: col3(0xffffff) } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    add(new THREE.Mesh(areaGeo, mk(SPIN_VS, SPIN_FS, { uS: { value: 1 }, uR: { value: 1 }, uHW: { value: 1 }, uN: { value: 6 }, uPh: { value: 0 }, uA: { value: 0 }, uC: { value: col3(0xffffff) } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
  };
  // shown (far below the world) while the renderer compiles: the first use never stalls
  VX.warmShow = function () { const saved = warmMeshes.map((m) => [m, m.visible]); for (const m of warmMeshes) { m.visible = true; m.position.set(0, -500, 0); } return () => { for (const [m, v] of saved) m.visible = v; }; };
  VX.setFog = function (color, density) { FOG.c.value.set(color); FOG.d.value = density; };
  VX.setLit = function (k) { LIT.value = k; };
  // ================================================================ 秘伝 (classes.js): 飛燕's flying crescent, 一閃's shaft of light
  // a crescent of a blade's edge: thick in the middle, tapering to two points, its leading (outer) edge white-hot, shimmering as it flies
  const CRES_FS = `uniform float uT; uniform float uA; uniform vec3 uC; uniform float uSeed; ${FOG_U}
    varying float vU; varying float vV2;
    ${NOISE}
    void main() {
      float th = sin(3.14159 * vU);                // 0 at the two points, 1 in the middle
      float inner = 1.0 - th;                     // the inner edge comes out to meet the outer one towards the points
      if (vV2 < inner) discard;
      float w = (vV2 - inner) / max(1.0 - inner, 0.001);
      float hot = pow(w, 9.0);
      float n = vnoise(vec2(vU * 26.0 - uT * 9.0 + uSeed * 7.0, w * 3.0));
      vec3 col = mix(uC, vec3(1.0, 0.97, 0.92), hot * 0.8);
      float a = (0.1 + 0.9 * pow(w, 3.0)) * smoothstep(0.0, 0.18, th) * (0.8 + 0.4 * n) * uA;
      ${fogAdd}
      if (a < 0.01) discard;
      gl_FragColor = vec4(col * fogv * 1.5, clamp(a, 0.0, 1.0));
    }`;
  const crescentMat = (col) => mk(SLASH_VS, CRES_FS, { uA: { value: 1 }, uC: { value: tone(col) }, uSeed: { value: Math.random() } }, { blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  let cresGeo = null, cresGlowGeo = null, scarGeo = null;
  const cresGeos = () => { if (cresGeo) return; cresGeo = arcGeo(0.86, 1.25, 2.4, 36); cresGlowGeo = arcGeo(0.6, 1.5, 2.7, 36); scarGeo = new THREE.PlaneGeometry(1, 1); scarGeo.rotateX(-Math.PI / 2); };
  // 飛燕: from a along dir for len (the caller stops it short of a wall: broke = 1, it shatters there) at speed m/s, tilted about its line of
  // flight. Its edge in three thin layers (some body to it) inside a wide glow; afterimages left behind it; a shallow glowing cut and
  // sparks on the floor under it (when the floor is near); at a wall it bursts into splinters of light. The hits are classes.js's own.
  VX.skySlash = function (a, dir, len, speed, col, broke, tilt) {
    cresGeos();
    const d = dir.clone().normalize(), g = new THREE.Group(), UPV = V(0, 1, 0);
    g.rotation.order = 'YXZ';
    g.rotation.set(-Math.asin(Math.max(-1, Math.min(1, d.y))), Math.atan2(d.x, d.z), tilt || 0);
    const mats = [];
    const layer = (geo, alpha, y) => { const mt = crescentMat(col); mt.uniforms.uA.value = alpha; const m = new THREE.Mesh(geo, mt); m.position.y = y; m.frustumCulled = false; m.renderOrder = 9; g.add(m); mats.push([mt, alpha]); };
    layer(cresGlowGeo, 0.35, 0);
    for (const y of [-0.05, 0, 0.05]) layer(cresGeo, y ? 0.55 : 1, y);
    scene.add(g);
    const ghosts = [], scar = { dark: new THREE.MeshBasicMaterial({ color: 0x140c08, transparent: true, opacity: 0.55, depthWrite: false }), glow: new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), parts: [] };
    let s = 0, t = 0, ghostT = 0, scarS = 0, sparkT = 0, endT = -1;
    const posAt = (k) => a.clone().addScaledVector(d, k);
    const place = (k) => { g.position.copy(posAt(k)).addScaledVector(d, -1.05); }; // (the middle of its edge at k)
    place(0);
    live.push({
      update(dt) {
        t += dt;
        if (endT < 0) {
          s = Math.min(len, s + speed * dt);
          place(s);
          ghostT -= dt;
          if (ghostT <= 0) { ghostT = 0.022; const m = new THREE.Mesh(cresGeo, crescentMat(col)); m.frustumCulled = false; m.renderOrder = 8; m.rotation.copy(g.rotation); m.position.copy(g.position); scene.add(m); ghosts.push({ m, t: 0 }); }
          const p = posAt(s), fl = G.world.floorBelow(p.x, p.y + 0.2, p.z);
          if (fl > -50 && p.y - fl < 1.9) {
            while (scarS + 0.35 <= s) {
              const q = posAt(scarS + 0.175), f2 = G.world.floorBelow(q.x, q.y + 0.2, q.z); scarS += 0.35;
              if (f2 < -50 || q.y - f2 > 1.9) continue;
              for (const [mt, w, up] of [[scar.dark, 0.09, 0.015], [scar.glow, 0.025, 0.02]]) { const m = new THREE.Mesh(scarGeo, mt); m.position.set(q.x, f2 + up, q.z); m.rotation.y = Math.atan2(d.x, d.z); m.scale.set(w, 1, 0.38); m.renderOrder = 7; scene.add(m); scar.parts.push(m); }
            }
            sparkT -= dt; if (sparkT <= 0) { sparkT = 0.05; G.fx.sparks(V(p.x, fl + 0.05, p.z), UPV, 2, col, 4); }
          } else scarS = s;
          if (s >= len) {
            endT = 0;
            if (broke) { // shattered on the wall: splinters of its light fly back off it
              const e = posAt(len), back = d.clone().negate();
              G.fx.sparks(e, back, 26, col, 9); G.fx.sparks(e, back, 10, 0xffffff, 6); G.fx.flash(e, col, 45, 0.18, 8); G.fx.dust(e, back, 0x8a8070, 5);
              for (let i = 0; i < 5; i++) {
                const m = new THREE.Mesh(cresGeo, crescentMat(col)); m.frustumCulled = false; m.renderOrder = 9; m.position.copy(e); m.rotation.set(rnd(-1, 1), rnd(0, 6.3), rnd(-1, 1)); m.scale.setScalar(rnd(0.18, 0.32)); scene.add(m);
                ghosts.push({ m, t: 0, life: 0.32, v: V(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(3, 6)).addScaledVector(d, -2) });
              }
            }
          }
        } else {
          endT += dt;
          const k = Math.max(0, 1 - endT / (broke ? 0.06 : 0.14));
          for (const [mt, al] of mats) mt.uniforms.uA.value = al * k;
          if (!broke) { place(len + endT * speed * 0.5); g.scale.setScalar(1 + endT * 1.5); } // (out of reach it spreads and fades)
          if (k <= 0) g.visible = false;
        }
        for (let i = ghosts.length - 1; i >= 0; i--) {
          const gh = ghosts[i]; gh.t += dt; const k = 1 - gh.t / (gh.life || 0.16);
          if (gh.v) gh.m.position.addScaledVector(gh.v, dt);
          gh.m.material.uniforms.uA.value = Math.max(0, k) * (gh.v ? 0.9 : 0.42);
          if (k <= 0) { scene.remove(gh.m); gh.m.material.dispose(); ghosts.splice(i, 1); }
        }
        scar.dark.opacity = 0.55 * Math.min(1, Math.max(0, 1 - t / 2.6) * 1.6); scar.glow.opacity = 0.9 * Math.max(0, 1 - t / 0.7); // (the cut's glow dies first, the cut itself in 2.6 s)
        return t < 2.6 || ghosts.length > 0;
      },
      dispose() { scene.remove(g); for (const [mt] of mats) mt.dispose(); for (const gh of ghosts) { scene.remove(gh.m); gh.m.material.dispose(); } for (const m of scar.parts) scene.remove(m); scar.dark.dispose(); scar.glow.dispose(); },
    });
  };
  // 一閃: a thick shaft of light from a to b (0.8 m across, the width its hit test uses), there at once, held a moment with a wide halo
  // round it, then thinning to a thread and gone in half a second
  VX.focusBeam = function (a, b, col) {
    const d = b.clone().sub(a), len = d.length() || 0.01, q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
    const outer = new THREE.Mesh(cylGeo, beamMat(col, 0xdff0ff, 6)), core = new THREE.Mesh(cylGeo, beamMat(0xffffff, 0xffffff, 10)), halo = new THREE.Mesh(cylGeo, beamMat(col, col, 3));
    for (const m of [halo, outer, core]) { m.frustumCulled = false; m.renderOrder = 8; m.material.uniforms.uEnds.value = 1; m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.copy(q); scene.add(m); }
    const R = 0.4, HOLD = 0.07, DUR = 0.5; let t = 0;
    live.push({
      update(dt) {
        t += dt;
        const k = t < HOLD ? 1 : Math.max(0, 1 - (t - HOLD) / (DUR - HOLD)), thin = Math.max(0.06, Math.pow(k, 1.8)), pulse = t < HOLD ? 1.15 : 1;
        outer.scale.set(R * thin * pulse, len, R * thin * pulse); outer.material.uniforms.uA.value = Math.min(1, k * 1.3);
        core.scale.set(R * 0.3 * Math.max(0.1, thin), len, R * 0.3 * Math.max(0.1, thin)); core.material.uniforms.uA.value = k;
        const hs = R * 2.4 * (1 + t * 2); halo.scale.set(hs, len, hs); halo.material.uniforms.uA.value = 0.22 * Math.max(0, 1 - t / 0.2);
        return t < DUR;
      },
      dispose() { for (const m of [outer, core, halo]) { scene.remove(m); m.material.dispose(); } },
    });
  };
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
