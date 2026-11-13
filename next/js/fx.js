'use strict';
// Visual effects: GPU point particles, tracers, decals, rings, beams, debris, flash lights, damage numbers.
(function () {
  const FX = (G.fx = {});
  let scene, camera;
  const V3 = () => new THREE.Vector3();
  // (what the shader effects made here share: the fog, how light the place is, one clock)
  const SU = { uFogD: { value: 0.02 }, uFogC: { value: new THREE.Color() }, uLit: { value: 1 }, uT: { value: 0 } };
  const GNOISE = `
    float h21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
    float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; } return v; }
  `;
  // ---------------- colours ----------------
  // The colour a thing gives off, as such light is really seen here. Callers ask for bright violets, pinks and neon greens: the hue is
  // kept (fire still tells from frost, from poison), the saturation is taken down the more, the further the hue is from what fire,
  // embers, blood, frost and lightning show (warm hues keep theirs; violet and pink keep little, and pink is drawn toward red).
  // Returns a THREE.Color (held linear, as THREE.Color holds every colour).
  const TONE_CAP = [[0, 0.8], [0.08, 0.82], [0.13, 0.72], [0.18, 0.5], [0.3, 0.36], [0.45, 0.28], [0.55, 0.32], [0.62, 0.42], [0.7, 0.3], [0.78, 0.2], [0.86, 0.24], [0.95, 0.58], [1, 0.8]];
  const _hsl = { h: 0, s: 0, l: 0 };
  FX.tone = function (hex, out) {
    out = out || new THREE.Color(); out.set(hex);
    out.getHSL(_hsl, THREE.SRGBColorSpace);
    let h = _hsl.h, s = _hsl.s;
    if (h > 0.83 && h < 0.98) h += (1 - h) * 0.45;    // (pink: toward the red of blood and embers)
    let cap = 0.8;
    for (let i = 1; i < TONE_CAP.length; i++) { const [h1, c1] = TONE_CAP[i], [h0, c0] = TONE_CAP[i - 1]; if (h <= h1) { cap = c0 + (c1 - c0) * (h - h0) / (h1 - h0); break; } }
    out.setHSL(h % 1, Math.min(s, cap), _hsl.l, THREE.SRGBColorSpace);
    return out;
  };

  // ---------------- particles ----------------
  const VS = `
    attribute float aSize; attribute vec4 aColor; attribute vec2 aRot;
    varying vec4 vColor; varying float vDepth; varying vec3 vRot;
    uniform float uScale;
    void main(){
      vColor = aColor;
      vRot = vec3(cos(aRot.x), sin(aRot.x), aRot.y);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      gl_PointSize = aSize * uScale / max(0.1, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  // (the picture of a particle: turned by its own angle; where the sheet holds four pictures, the one that is this particle's)
  const PUV = `
    uniform float uAtlas; varying vec3 vRot;
    vec2 puv() {
      vec2 q = gl_PointCoord - 0.5; q = vec2(q.x * vRot.x - q.y * vRot.y, q.x * vRot.y + q.y * vRot.x) + 0.5;
      if (uAtlas < 1.5) return q;
      q = clamp(q, 0.015, 0.985); float v = floor(vRot.z + 0.5);
      return (vec2(mod(v, 2.0), floor(v * 0.5)) + q) * 0.5;
    }`;
  const FS_ADD = `
    uniform sampler2D map; uniform float uFogD; varying vec4 vColor; varying float vDepth;
    ${PUV}
    void main(){
      vec4 t = texture2D(map, puv());
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      float a = t.a * vColor.a * fogv;
      gl_FragColor = vec4(vColor.rgb * t.rgb * a, a);
    }`;
  // (flame: it is light, and it also hides what is behind it. Added to the picture only, a flame before a wall lit brighter than itself -
  // the wall its own torch hangs on - was not seen at all. So: its light is added, and what is behind is dimmed by how thick it is there)
  const FS_COVER = `
    uniform sampler2D map; uniform float uFogD; uniform float uCover; varying vec4 vColor; varying float vDepth;
    ${PUV}
    void main(){
      vec4 t = texture2D(map, puv());
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      float a = t.a * vColor.a * fogv, heat = t.r;
      // (its own colour, deep, at the skin; toward the heart brighter and paler - never so bright at the skin that every colour is white)
      float m = max(vColor.r, max(vColor.g, vColor.b)); vec3 n = vColor.rgb / max(m, 1e-4);
      vec3 c = mix(pow(n, vec3(2.2)) * m * 0.5, pow(n, vec3(1.25)) * m, smoothstep(0.0, 0.45, heat));   // (deep at the skin, its full colour within)
      c = mix(c, mix(n, vec3(1.0, 0.95, 0.82), 0.55) * m, smoothstep(0.55, 1.0, heat));                 // (pale toward the heart)
      gl_FragColor = vec4(c * a, a * uCover);
    }`;
  const FS_NORM = `
    uniform sampler2D map; uniform float uFogD; uniform vec3 uFogC; uniform float uLit; varying vec4 vColor; varying float vDepth;
    ${PUV}
    void main(){
      vec4 t = texture2D(map, puv());
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      vec3 c = mix(uFogC, vColor.rgb * t.rgb * uLit, fogv);   // (uLit: how light the place is - dust is not its own light)
      gl_FragColor = vec4(c, t.a * vColor.a);
      if (gl_FragColor.a < 0.01) discard;
    }`;
  class PSys {
    // o.atlas: 2 = the picture is a sheet of four; o.tilt: how far a particle may be turned at birth (radians either way); o.spin: how fast it may turn
    constructor(max, additive, tex, o) {
      o = o || {};
      this.max = max; this.n = 0; this.atlas = o.atlas || 1; this.tilt = o.tilt || 0; this.spin = o.spin || 0;
      this.rot = new Float32Array(max * 2); this.spn = new Float32Array(max);
      this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
      this.life = new Float32Array(max); this.ml = new Float32Array(max);
      this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
      this.c = new Float32Array(max * 4); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
      this.c1 = new Float32Array(max * 3);
      const g = new THREE.BufferGeometry();
      this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.pos.setUsage(THREE.DynamicDrawUsage);
      this.col = new THREE.BufferAttribute(new Float32Array(max * 4), 4); this.col.setUsage(THREE.DynamicDrawUsage);
      this.siz = new THREE.BufferAttribute(new Float32Array(max), 1); this.siz.setUsage(THREE.DynamicDrawUsage);
      this.rota = new THREE.BufferAttribute(new Float32Array(max * 2), 2); this.rota.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.pos); g.setAttribute('aColor', this.col); g.setAttribute('aSize', this.siz); g.setAttribute('aRot', this.rota);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, uScale: { value: 400 }, uFogD: { value: 0.02 }, uFogC: { value: new THREE.Color() }, uAtlas: { value: this.atlas }, uLit: { value: 1 }, uCover: { value: o.cover || 0 } },
        vertexShader: VS, fragmentShader: o.cover ? FS_COVER : additive ? FS_ADD : FS_NORM,
        transparent: true, depthWrite: false, blending: o.cover ? THREE.CustomBlending : additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      if (o.cover) { this.mat.blendSrc = THREE.OneFactor; this.mat.blendDst = THREE.OneMinusSrcAlphaFactor; this.mat.blendEquation = THREE.AddEquation; }
      this.pts = new THREE.Points(g, this.mat);
      this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 10 : 9;
      g.setDrawRange(0, 0);
    }
    spawn(x, y, z, vx, vy, vz, life, s0, s1, r, gg, b, a, grav, drag, r1, g1, b1) {
      if (FX.keep < 1 && Math.random() > FX.keep) return; // lower graphics settings keep only a share of the particles
      let i = this.n;
      if (i >= this.max) { i = Math.floor(Math.random() * this.max); } else this.n++;
      const i3 = i * 3, i4 = i * 4;
      this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
      this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.life[i] = life; this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1;
      this.c[i4] = r; this.c[i4 + 1] = gg; this.c[i4 + 2] = b; this.c[i4 + 3] = a;
      this.c1[i3] = r1 ?? r; this.c1[i3 + 1] = g1 ?? gg; this.c1[i3 + 2] = b1 ?? b;
      this.grav[i] = grav || 0; this.drag[i] = drag || 0;
      if (this.tilt || this.atlas > 1) { this.rot[i * 2] = this.tilt ? (Math.random() * 2 - 1) * this.tilt : 0; this.rot[i * 2 + 1] = this.atlas > 1 ? Math.floor(Math.random() * 4) : 0; this.spn[i] = this.spin ? (Math.random() * 2 - 1) * this.spin : 0; }
    }
    update(dt) {
      const P = this.p, Vv = this.v, pa = this.pos.array, ca = this.col.array, sa = this.siz.array, R = this.rot, ra = this.rota.array, turns = this.tilt || this.atlas > 1;
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          // swap-remove
          const j = --this.n;
          if (i !== j) {
            for (let k = 0; k < 3; k++) { P[i * 3 + k] = P[j * 3 + k]; Vv[i * 3 + k] = Vv[j * 3 + k]; this.c1[i * 3 + k] = this.c1[j * 3 + k]; }
            for (let k = 0; k < 4; k++) this.c[i * 4 + k] = this.c[j * 4 + k];
            this.life[i] = this.life[j]; this.ml[i] = this.ml[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
            R[i * 2] = R[j * 2]; R[i * 2 + 1] = R[j * 2 + 1]; this.spn[i] = this.spn[j];
          }
          continue;
        }
        const i3 = i * 3, i4 = i * 4;
        const d = 1 - this.drag[i] * dt;
        Vv[i3] *= d; Vv[i3 + 1] = Vv[i3 + 1] * d - this.grav[i] * dt; Vv[i3 + 2] *= d;
        P[i3] += Vv[i3] * dt; P[i3 + 1] += Vv[i3 + 1] * dt; P[i3 + 2] += Vv[i3 + 2] * dt;
        const t = 1 - this.life[i] / this.ml[i];
        pa[i3] = P[i3]; pa[i3 + 1] = P[i3 + 1]; pa[i3 + 2] = P[i3 + 2];
        const fade = t < 0.1 ? t / 0.1 : 1 - (t - 0.1) / 0.9;
        ca[i4] = this.c[i4] + (this.c1[i3] - this.c[i4]) * t; ca[i4 + 1] = this.c[i4 + 1] + (this.c1[i3 + 1] - this.c[i4 + 1]) * t; ca[i4 + 2] = this.c[i4 + 2] + (this.c1[i3 + 2] - this.c[i4 + 2]) * t;
        ca[i4 + 3] = this.c[i4 + 3] * fade;
        sa[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
        if (turns) { R[i * 2] += this.spn[i] * dt; ra[i * 2] = R[i * 2]; ra[i * 2 + 1] = R[i * 2 + 1]; }
        i++;
      }
      this.pts.geometry.setDrawRange(0, this.n);
      // upload only the live part of the buffers (and nothing at all while the system is empty): these were whole-buffer uploads every frame
      if (this.n > 0 || this._had) {
        const n = Math.max(this.n, 1);
        this.pos.updateRange.offset = 0; this.pos.updateRange.count = n * 3;
        this.col.updateRange.offset = 0; this.col.updateRange.count = n * 4;
        this.siz.updateRange.offset = 0; this.siz.updateRange.count = n;
        this.pos.needsUpdate = true; this.col.needsUpdate = true; this.siz.needsUpdate = true;
        if (turns) { this.rota.updateRange.offset = 0; this.rota.updateRange.count = n * 2; this.rota.needsUpdate = true; }
      }
      this._had = this.n > 0;
    }
    clear() { this.n = 0; this.pts.geometry.setDrawRange(0, 0); }
  }

  // Things thrown off that are seen as a line: a spark, a drop. Each is a strip from where it was a moment ago to where it is, as wide
  // as it is told, brightest at its head. lit: it is its own light (a spark, added to the picture); not lit: it hides what is behind it (a drop).
  const SK_VS = `
    attribute vec3 iHead; attribute vec3 iTail; attribute vec4 iCol;
    varying vec3 vC; varying vec2 vQ; varying float vDepth;
    void main(){
      vec3 h = (modelViewMatrix * vec4(iHead, 1.0)).xyz, t = (modelViewMatrix * vec4(iTail, 1.0)).xyz;
      vec3 ax = h - t; float L = length(ax);
      vec3 c = mix(t, h, position.y), al = L > 1e-5 ? ax / L : vec3(0.0, 1.0, 0.0);
      vec3 sd = normalize(cross(al, c) + vec3(1e-6, 0.0, 0.0));
      float w = max(iCol.a, -c.z * 0.0011);                       // (never thinner than a pixel or so)
      vec3 mv = c + sd * position.x * w + al * (position.y - 0.5) * w;
      vC = iCol.rgb; vQ = position.xy; vDepth = -mv.z;
      gl_Position = projectionMatrix * vec4(mv, 1.0);
    }`;
  const SK_FS = (lit) => `
    uniform float uFogD; uniform vec3 uFogC; uniform float uLit; varying vec3 vC; varying vec2 vQ; varying float vDepth;
    void main(){
      float a = 1.0 - abs(vQ.x) * 2.0; a *= a;
      float along = (0.12 + 0.88 * vQ.y * vQ.y) * (1.0 - smoothstep(0.86, 1.0, vQ.y)) * smoothstep(0.0, 0.1, vQ.y);
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      ${lit ? 'gl_FragColor = vec4(vC * a * along * fogv, 1.0);' : 'gl_FragColor = vec4(mix(uFogC, vC * uLit, fogv), smoothstep(0.0, 0.5, a) * smoothstep(0.0, 0.2, vQ.y) * (1.0 - smoothstep(0.8, 1.0, vQ.y))); if (gl_FragColor.a < 0.02) discard;'}
    }`;
  class Streaks {
    constructor(max, lit) {
      this.max = max; this.n = 0; this.lit = lit;
      this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3);
      this.life = new Float32Array(max); this.ml = new Float32Array(max); this.w = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.len = new Float32Array(max);
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const ia = (k) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k); a.setUsage(THREE.DynamicDrawUsage); return a; };
      this.head = ia(3); this.tail = ia(3); this.col = ia(4);
      g.setAttribute('iHead', this.head); g.setAttribute('iTail', this.tail); g.setAttribute('iCol', this.col);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); g.instanceCount = 0;
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uFogD: { value: 0.02 }, uFogC: { value: new THREE.Color() }, uLit: { value: 1 } }, vertexShader: SK_VS, fragmentShader: SK_FS(lit),
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: lit ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = lit ? 10 : 9;
    }
    // len: how many seconds of its flight the line is long
    spawn(x, y, z, vx, vy, vz, life, w, r, g, b, grav, drag, len) {
      if (FX.keep < 1 && Math.random() > FX.keep) return;
      let i = this.n; if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
      const i3 = i * 3;
      this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.c[i3] = r; this.c[i3 + 1] = g; this.c[i3 + 2] = b;
      this.life[i] = life; this.ml[i] = life; this.w[i] = w; this.grav[i] = grav || 0; this.drag[i] = drag || 0; this.len[i] = len || 0.04;
    }
    update(dt) {
      const P = this.p, Vv = this.v, C = this.c, ha = this.head.array, ta = this.tail.array, ca = this.col.array;
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          const j = --this.n;
          if (i !== j) {
            for (let k = 0; k < 3; k++) { P[i * 3 + k] = P[j * 3 + k]; Vv[i * 3 + k] = Vv[j * 3 + k]; C[i * 3 + k] = C[j * 3 + k]; }
            this.life[i] = this.life[j]; this.ml[i] = this.ml[j]; this.w[i] = this.w[j]; this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.len[i] = this.len[j];
          }
          continue;
        }
        const i3 = i * 3, i4 = i * 4, d = 1 - this.drag[i] * dt;
        Vv[i3] *= d; Vv[i3 + 1] = Vv[i3 + 1] * d - this.grav[i] * dt; Vv[i3 + 2] *= d;
        P[i3] += Vv[i3] * dt; P[i3 + 1] += Vv[i3 + 1] * dt; P[i3 + 2] += Vv[i3 + 2] * dt;
        const age = this.ml[i] - this.life[i], back = Math.min(this.len[i], age), t = age / this.ml[i];
        ha[i3] = P[i3]; ha[i3 + 1] = P[i3 + 1]; ha[i3 + 2] = P[i3 + 2];
        ta[i3] = P[i3] - Vv[i3] * back; ta[i3 + 1] = P[i3 + 1] - Vv[i3 + 1] * back; ta[i3 + 2] = P[i3 + 2] - Vv[i3 + 2] * back;
        if (this.lit) { const f = 1 - t, f2 = f * f; ca[i4] = C[i3] * (0.3 + 0.7 * f); ca[i4 + 1] = C[i3 + 1] * f; ca[i4 + 2] = C[i3 + 2] * f2; ca[i4 + 3] = this.w[i] * (0.5 + 0.5 * f); }   // (a spark cools as it flies: white to orange to red, and thins)
        else { ca[i4] = C[i3]; ca[i4 + 1] = C[i3 + 1]; ca[i4 + 2] = C[i3 + 2]; ca[i4 + 3] = this.w[i] * (t > 0.8 ? (1 - t) * 5 : 1); }
        i++;
      }
      this.mesh.geometry.instanceCount = this.n;
      if (this.n > 0 || this._had) {
        const n = Math.max(this.n, 1);
        for (const [a, k] of [[this.head, 3], [this.tail, 3], [this.col, 4]]) { a.updateRange.offset = 0; a.updateRange.count = n * k; a.needsUpdate = true; }
      }
      this._had = this.n > 0;
    }
    clear() { this.n = 0; this.mesh.geometry.instanceCount = 0; }
  }

  // An electric arc: a channel of air made to light, thinner than a hair and white where it is hot, in a glow of its own colour.
  // Each piece is a straight stretch between two points that stays where it was struck (a bolt does not move: it is there, flickers
  // and is gone). Drawn facing the eye, never thinner than a pixel; lit (added to the picture).
  const ARC_VS = `
    attribute vec3 iA; attribute vec3 iB; attribute vec4 iC; attribute float iW;
    varying vec3 vC; varying float vX; varying float vI; varying float vCore; varying float vDepth;
    void main(){
      vec3 a = (modelViewMatrix * vec4(iA, 1.0)).xyz, b = (modelViewMatrix * vec4(iB, 1.0)).xyz;
      vec3 ax = b - a; float L = length(ax); vec3 al = L > 1e-5 ? ax / L : vec3(0.0, 1.0, 0.0);
      vec3 c = mix(a, b, position.y);
      vec3 sd = normalize(cross(al, c) + vec3(1e-6, 0.0, 0.0));
      float px = max(0.0005, -c.z * 0.0012);
      float w = max(iW, px * 5.0);
      vec3 mv = c + sd * position.x * w + al * (position.y * 2.0 - 1.0) * min(w * 0.35, L * 0.5);
      vC = iC.rgb; vI = iC.a * min(1.0, iW / (px * 1.2)); vX = position.x * 2.0; vCore = clamp(max(px * 1.1, iW * 0.09) / w, 0.05, 0.45); vDepth = -mv.z;
      gl_Position = projectionMatrix * vec4(mv, 1.0);
    }`;
  const ARC_FS = `
    uniform float uFogD; varying vec3 vC; varying float vX; varying float vI; varying float vCore; varying float vDepth;
    void main(){
      float x = abs(vX);
      float core = exp(-x * x / (vCore * vCore)), glow = exp(-x * x * 6.0);
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      vec3 c = mix(vC, vec3(1.0), 0.8) * core * 2.4 + vC * glow * 0.5;
      gl_FragColor = vec4(c * vI * fogv, 1.0);
    }`;
  class Arcs {
    constructor(max) {
      this.max = max; this.n = 0;
      this.a = new Float32Array(max * 3); this.b = new Float32Array(max * 3); this.c = new Float32Array(max * 3);
      this.w = new Float32Array(max); this.life = new Float32Array(max); this.ml = new Float32Array(max); this.k = new Float32Array(max); this.s = new Float32Array(max);
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const ia = (k) => { const at = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k); at.setUsage(THREE.DynamicDrawUsage); return at; };
      this.ia = ia(3); this.ib = ia(3); this.ic = ia(4); this.iw = ia(1);
      g.setAttribute('iA', this.ia); g.setAttribute('iB', this.ib); g.setAttribute('iC', this.ic); g.setAttribute('iW', this.iw);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); g.instanceCount = 0;
      this.mat = new THREE.ShaderMaterial({ uniforms: { uFogD: SU.uFogD }, vertexShader: ARC_VS, fragmentShader: ARC_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 10;
    }
    // k: how bright (1 = a main channel); restrike: the moment (s) it flares again, 0 = never
    spawn(a, b, w, life, c, k, restrike) {
      if (FX.keep < 1 && Math.random() > FX.keep * 1.5) return;
      let i = this.n; if (i >= this.max) i = Math.floor(Math.random() * this.max); else this.n++;
      const i3 = i * 3;
      this.a[i3] = a.x; this.a[i3 + 1] = a.y; this.a[i3 + 2] = a.z; this.b[i3] = b.x; this.b[i3 + 1] = b.y; this.b[i3 + 2] = b.z;
      this.c[i3] = c.r; this.c[i3 + 1] = c.g; this.c[i3 + 2] = c.b; this.w[i] = w; this.life[i] = life; this.ml[i] = life; this.k[i] = k; this.s[i] = restrike || 0;
    }
    update(dt) {
      const A = this.a, B = this.b, C = this.c, aa = this.ia.array, ba = this.ib.array, ca = this.ic.array, wa = this.iw.array;
      let i = 0;
      while (i < this.n) {
        this.life[i] -= dt;
        if (this.life[i] <= 0) {
          const j = --this.n;
          if (i !== j) { for (let q = 0; q < 3; q++) { A[i * 3 + q] = A[j * 3 + q]; B[i * 3 + q] = B[j * 3 + q]; C[i * 3 + q] = C[j * 3 + q]; } this.w[i] = this.w[j]; this.life[i] = this.life[j]; this.ml[i] = this.ml[j]; this.k[i] = this.k[j]; this.s[i] = this.s[j]; }
          continue;
        }
        const i3 = i * 3, i4 = i * 4, age = this.ml[i] - this.life[i], t = age / this.ml[i];
        // (a stroke: white-hot at once, dimming fast; where it strikes again, it flares on the same path, then thins away)
        let I = Math.exp(-age * 38) * 0.8 + 0.32 * (1 - t);
        const rs = this.s[i]; if (rs > 0 && age > rs) I = Math.max(I, Math.exp(-(age - rs) * 30) * 0.85);
        I *= this.k[i] * (0.82 + 0.18 * Math.random());
        for (let q = 0; q < 3; q++) { aa[i3 + q] = A[i3 + q]; ba[i3 + q] = B[i3 + q]; ca[i4 + q] = C[i3 + q]; }
        ca[i4 + 3] = I; wa[i] = this.w[i] * (0.55 + 0.45 * (1 - t));
        i++;
      }
      this.mesh.geometry.instanceCount = this.n;
      if (this.n > 0 || this._had) {
        const n = Math.max(this.n, 1);
        for (const [at, k] of [[this.ia, 3], [this.ib, 3], [this.ic, 4], [this.iw, 1]]) { at.updateRange.offset = 0; at.updateRange.count = n * k; at.needsUpdate = true; }
      }
      this._had = this.n > 0;
    }
    clear() { this.n = 0; this.mesh.geometry.instanceCount = 0; }
  }

  // ---------------- marks on the floor (warnings, the edge of a blast) ----------------
  // Drawn premultiplied: what is laid on the floor (soot, frost, dust) hides it by its alpha, what glows is added. So a mark reads
  // on a bright floor (it darkens it) and on a dark one (it glows), and nothing is a flat disc of colour.
  const FLOOR_VS = `uniform float uSX; uniform float uSZ; varying vec2 vP; varying float vDepth;
    void main() { vP = vec2(position.x * uSX, position.z * uSZ); vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
  // A warning: the ground where the blow will land, heated. Read first, real second: the whole of what is hit shows from the first
  // moment as a dark red-hot stain (the floor seen through it) netted with glowing cracks, inside one unbroken line of ember that
  // runs just inside its edge (never thinner than two pixels, however far) with the heat thickest along it; as the blow comes it all
  // grows darker and brighter, what is already 'taken' (from the middle out, or along a lane from its start) glows hottest, and in
  // the last fifth it throbs. Cold colours: frost and a pale blue glow instead of soot and embers. Fog dims it less than it dims the
  // world. uLane: 0 = a circle of radius uR, 1 = a lane uHW either side of its line and uHL either way along it.
  const TELE_FS = `uniform float uR; uniform float uHW; uniform float uHL; uniform float uLane; uniform float uK; uniform float uA; uniform float uSeed; uniform float uCold;
    uniform vec3 uC; uniform float uT; uniform float uLit; uniform float uFogD; uniform vec3 uFogC; varying vec2 vP; varying float vDepth;
    ${GNOISE}
    void main() {
      float sd, prog, along, size;
      if (uLane < 0.5) { float d = length(vP); sd = d - uR; prog = d / max(uR, 0.01); along = atan(vP.y, vP.x) * max(uR, 0.5); size = uR; }
      else { vec2 q = abs(vP) - vec2(uHW, uHL); sd = max(q.x, q.y); prog = (vP.y + uHL) / max(2.0 * uHL, 0.01); along = q.x > q.y ? vP.y : vP.x; size = 2.0 * uHL; }
      if (sd > 0.35) discard;
      float px = max(fwidth(sd), 0.003);
      float k = clamp(uK, 0.0, 1.0), late = smoothstep(0.8, 1.0, k);
      float pulse = 1.0 + late * (0.5 + 0.5 * sin(uT * 21.0 + uSeed * 9.0));
      float inside = 1.0 - smoothstep(-px * 1.5, px * 0.5, sd);
      float wob = (vnoise(vec2(along * 1.3 + uSeed * 31.0, 0.5)) - 0.5) * 0.04;
      float w = max(0.055, px * 1.8), e = sd + 0.07 + wob;                       // (the line runs just inside the edge: never outside what is hit)
      float line = exp(-e * e / (w * w)) * (0.8 + 0.2 * vnoise(vec2(along * 3.0, 4.0 + uSeed)));
      float rim = exp(min(sd, 0.0) / 0.35) * inside;
      vec2 q = vP * 1.1 + uSeed * 13.0;
      float n = fbm(vP * 0.7 + 3.0);
      float c1 = abs(fbm(q) - 0.5), c2 = abs(fbm(q * 2.3 + 7.0) - 0.5);
      float crack = max(1.0 - smoothstep(0.0, 0.026, c1), (1.0 - smoothstep(0.0, 0.016, c2)) * 0.5) * (0.4 + 0.6 * vnoise(q * 2.7));
      float fill = 1.0 - smoothstep(k - 0.05, k, prog);
      float fd = (prog - k) * size / 0.25, front = exp(-fd * fd) * inside * step(0.01, k) * step(prog, 1.0);
      float stain = inside * (0.2 + 0.3 * k) * (0.65 + 0.7 * n);
      // (the face - the stain, the heat along the rim, the spreading front - glows a deep red-orange and stops there, the floor still
      // faintly seen through it; only the lines - the edge and the cracks - may burn to a pale heat)
      float face = min(0.95, (rim * (0.2 + 0.24 * k) + stain + front * 0.3) * (1.0 + 0.35 * (pulse - 1.0)));
      float lines = (line * (0.85 + 0.45 * k) + crack * inside * (0.16 + 0.45 * k + 0.35 * fill * k)) * pulse;
      float lay = inside * (0.2 + 0.24 * k + 0.1 * fill) * (0.7 + 0.6 * n);
      vec3 body = mix(vec3(0.03, 0.012, 0.008), vec3(0.62, 0.68, 0.74) * uLit, uCold);
      // (heat: deep red where it is faint, paler and yellower where it is hottest - embers, not a lit tube)
      vec3 hot = mix(uC, mix(vec3(1.0, 0.55, 0.18), vec3(0.8, 0.9, 1.0), uCold), 0.5);
      vec3 em = uC * 0.85 * face * 1.15 + mix(uC * 0.8, hot, smoothstep(0.6, 1.8, lines)) * min(lines, 2.2) * 1.15;
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth * 0.3), a = clamp(lay, 0.0, 0.7) * uA;
      gl_FragColor = vec4(em * uA * fogv + mix(uFogC, body, fogv) * a, a);
    }`;
  // the edge of a blow spreading over the floor: a low band of dust thrown up and rolling out, its leading lip lit by what threw it,
  // dust settling behind it
  const RING_FS = `uniform float uR; uniform float uW; uniform float uA; uniform float uSeed; uniform vec3 uC;
    uniform float uLit; uniform float uFogD; uniform vec3 uFogC; varying vec2 vP; varying float vDepth;
    ${GNOISE}
    void main() {
      float d = length(vP);
      if (d > uR + uW * 1.6 || d < uR - uW * 4.0) discard;
      float ang = atan(vP.y, vP.x), n = fbm(vec2(ang * max(uR, 0.6) * 1.1 + uSeed * 20.0, (d - uR) / max(uW, 0.05) * 0.8));
      float e = (d - uR) / max(uW, 0.05);
      float n2 = fbm(vec2(ang * max(uR, 0.6) * 3.1 - uSeed * 7.0, (d - uR) / max(uW, 0.05) * 2.2));
      float dust = exp(-e * e * 2.0) * smoothstep(0.25, 0.75, n * 0.75 + n2 * 0.45);
      float behind = d < uR ? exp((d - uR) / (uW * 1.3)) * 0.16 * smoothstep(0.3, 0.8, n2) : 0.0;
      float lx = (d - uR - uW * 0.4) / max(0.04, uW * 0.18), lip = exp(-lx * lx) * (0.35 + 0.65 * n);
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth), a = clamp(dust * 0.6 + behind, 0.0, 0.8) * uA;
      gl_FragColor = vec4(uC * lip * 0.32 * uA * fogv + mix(uFogC, vec3(0.42, 0.39, 0.35) * uLit, fogv) * a, a);
    }`;
  const premul = (m) => { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendEquation = THREE.AddEquation; return m; };
  const floorMat = (fs, uni) => premul(new THREE.ShaderMaterial({
    uniforms: Object.assign({ uSX: { value: 1 }, uSZ: { value: 1 }, uA: { value: 0 }, uSeed: { value: Math.random() }, uC: { value: new THREE.Color() }, uLit: SU.uLit, uFogD: SU.uFogD, uFogC: SU.uFogC, uT: SU.uT }, uni),
    vertexShader: FLOOR_VS, fragmentShader: fs, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  const teleMat = () => floorMat(TELE_FS, { uR: { value: 1 }, uHW: { value: 1 }, uHL: { value: 1 }, uLane: { value: 0 }, uK: { value: 0 }, uCold: { value: 0 } });
  const ringMat = () => floorMat(RING_FS, { uR: { value: 1 }, uW: { value: 0.3 } });
  // (cold: frost, not soot - a warning whose colour is bluer than it is red)
  const coldOf = (c) => (c.b > c.r * 1.15 ? 1 : 0);

  const pools = {};
  FX.keep = 1;
  FX.init = function (sc, cam) {
    scene = sc; camera = cam;
    FX.add = new PSys(4000, true, G.Tex.spr.soft);
    FX.flame = new PSys(2500, true, G.Tex.spr.flame, { atlas: 2, tilt: 0.26, spin: 0.45, cover: 0.92 });   // (tongues of flame: four of them, each standing a little its own way)
    FX.norm = new PSys(3000, false, G.Tex.spr.smoke, { atlas: 2, tilt: Math.PI, spin: 0.9 });  // (puffs of smoke and dust: four of them, turned any way and turning)
    FX.streak = new Streaks(1400, true); FX.drops = new Streaks(500, false);
    scene.add(FX.add.pts, FX.flame.pts, FX.norm.pts, FX.streak.mesh, FX.drops.mesh);

    // tracers
    pools.tracer = [];
    const tgBar = new THREE.BoxGeometry(1, 1, 1); tgBar.translate(0, 0, -0.5); pools.tracerBar = tgBar;   // (a bar: what stands still - the pieces of a bolt of lightning)
    // (a spindle a unit long behind its head at the origin: widest just behind the head, a point at its tail: what flies)
    const tg = pools.tracerFly = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.5, -0.1), new THREE.Vector2(0.22, -0.45), new THREE.Vector2(0, -1)], 6); tg.rotateX(Math.PI / 2);
    for (let i = 0; i < 240; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m); pools.tracer.push({ m, t: 0, ml: 0 });
    }
    // decals
    pools.decal = []; pools.decalIdx = 0;
    const dg = new THREE.PlaneGeometry(1, 1);
    const dmats = {
      hole: new THREE.MeshBasicMaterial({ map: G.Tex.spr.hole, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
      scorch: new THREE.MeshBasicMaterial({ map: G.Tex.spr.scorch, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }),
      crack: new THREE.MeshBasicMaterial({ map: G.Tex.spr.crack, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, opacity: 0.8 }),
    };
    if (G.Tex.spr.holeM) dmats.holeM = new THREE.MeshBasicMaterial({ map: G.Tex.spr.holeM, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });   // (in metal: a dent with a bright lip)
    if (G.Tex.spr.holeW) dmats.holeW = new THREE.MeshBasicMaterial({ map: G.Tex.spr.holeW, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });   // (in wood: a hole with splinters)
    FX.dmats = dmats;
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(dg, dmats.hole); m.visible = false; m.renderOrder = 2; scene.add(m);
      pools.decal.push({ m, t: 0 });
    }
    // splat materials per color cached
    FX.splatMats = {};
    // rings / telegraphs (each its own material, one shader: they are pooled and never thrown away)
    pools.ring = [];
    const rg = new THREE.PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(rg, ringMat());
      m.visible = false; m.renderOrder = 5; m.frustumCulled = false; scene.add(m); pools.ring.push({ m, t: 0, ml: 1 });
    }
    pools.tele = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(rg, teleMat());
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false; scene.add(m);
      pools.tele.push({ m, t: 0, ml: 1, active: false });
    }
    // line telegraphs (a lane on the floor: fissures, shock lines, beams)
    pools.teleL = [];
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(rg, teleMat()); m.material.uniforms.uLane.value = 1;
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false; scene.add(m);
      pools.teleL.push({ m, t: 0, ml: 1, active: false });
    }
    FX.arc = new Arcs(1600); scene.add(FX.arc.mesh);
    // beams
    pools.beam = [];
    // (a beam is light in dusty air: brightest and whitest along its axis, falling off softly to its sides - as it faces you, not as a
    // tube - with the dust in it drifting along it; its colour that of what makes it, never a flat neon)
    const bg = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); bg.rotateX(Math.PI / 2); bg.translate(0, 0, -0.5);
    const BEAM_VS = 'varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vDepth; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }';
    const BEAM_FS = `uniform vec3 uC; uniform float uA; uniform float uLen; uniform float uT; uniform float uFogD; varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vDepth;
      ${GNOISE}
      void main(){
        float f = abs(dot(normalize(vN), normalize(vV)));
        float core = pow(f, 10.0), glow = pow(f, 1.8);
        float dust = fbm(vec2(vUv.y * uLen * 1.6 - uT * 2.0, vUv.x * 6.0));
        float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
        vec3 c = mix(uC, vec3(1.0, 0.96, 0.9), core * 0.65) * (core * 1.1 + glow * 0.32 * (0.55 + 0.7 * dust));
        gl_FragColor = vec4(c * uA * fogv, 1.0);
      }`;
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(bg, new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(0xff6040) }, uA: { value: 0 }, uLen: { value: 1 }, uT: SU.uT, uFogD: SU.uFogD }, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m); pools.beam.push({ m, t: 0, ml: 0 });
    }
    // shield bubbles (fresnel)
    pools.bubble = [];
    const sg = new THREE.SphereGeometry(1, 24, 16);
    const bmat = () => new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(0xbfe2ff) }, uA: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)), 6.0); gl_FragColor = vec4(uC*f*uA*0.35, f*uA*0.3); }',   // (a ward struck: a faint shimmer at its rim, no glass ball)
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(sg, bmat()); m.visible = false; scene.add(m); pools.bubble.push({ m, t: 0, ml: 0.25, follow: null }); }
    // a ward struck where it was struck: a ripple of bent air running out from the point, its lip catching the light, a darker trough
    // behind it (drawn premultiplied: the trough dims, the lip adds)
    pools.ripple = [];
    const rpg = new THREE.PlaneGeometry(1, 1);
    const RP_FS = `uniform vec3 uC; uniform float uK; uniform float uA; varying vec2 vUv;
      void main() {
        float d = length(vUv * 2.0 - 1.0), R = 0.15 + 0.8 * uK;
        float lx = (d - R) / 0.05, tx = (d - R + 0.11) / 0.07;
        float lip = exp(-lx * lx), trough = exp(-tx * tx);
        float f = (1.0 - uK) * (1.0 - uK) * uA;
        gl_FragColor = vec4(uC * lip * 0.55 * f, trough * 0.22 * f);
      }`;
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(rpg, premul(new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(0xd0d8e0) }, uK: { value: 0 }, uA: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: RP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 9; scene.add(m); pools.ripple.push({ m, t: 0, ml: 0.3 });
    }
    // debris
    pools.debris = [];
    // (a chip of what was broken: three broken lumps, not a box)
    const dbgs = [0, 1, 2].map((k) => {
      const g = new THREE.IcosahedronGeometry(0.6, 0), ps = g.attributes.position, h = (x, y, z) => { const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 5.1) * 43758.5453; return n - Math.floor(n); };
      for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), f = 0.62 + h(x, y, z) * 0.75; ps.setXYZ(i, x * f * (k === 1 ? 1.3 : 1), y * f * (k === 2 ? 0.55 : 0.85), z * f); }
      g.computeVertexNormals(); return g;
    });
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(dbgs[i % 3], null); m.visible = false; m.castShadow = false; scene.add(m);
      pools.debris.push({ m, v: V3(), av: V3(), t: 0, floor: 0 });
    }
    // spent cases: a drawn brass case with its rim (rifle, pistol), a shotgun's hull with its brass head
    pools.casing = []; pools.casingIdx = 0;
    {
      const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 1, roughness: 0.34 }), hull = new THREE.MeshStandardMaterial({ color: 0x6a1c16, roughness: 0.6 });
      const lat = (pts) => new THREE.LatheGeometry(pts.map((q) => new THREE.Vector2(q[0], q[1])), 10);
      const cg = { rifle: lat([[0, -0.5], [0.105, -0.5], [0.105, -0.47], [0.09, -0.455], [0.09, -0.44], [0.105, -0.425], [0.1, 0.18], [0.07, 0.3], [0.068, 0.5], [0.058, 0.5], [0.058, 0.3]]),
        small: lat([[0, -0.5], [0.21, -0.5], [0.21, -0.44], [0.185, -0.42], [0.185, -0.38], [0.2, -0.36], [0.2, 0.5], [0.175, 0.5], [0.175, -0.2]]),
        head: lat([[0, -0.5], [0.16, -0.5], [0.16, -0.46], [0.148, -0.45], [0.148, -0.22], [0, -0.22]]), body: lat([[0.144, -0.22], [0.144, 0.5], [0.12, 0.5], [0.12, 0.3]]) };
      for (let i = 0; i < 28; i++) {
        const g = new THREE.Group(), a = new THREE.Mesh(cg.rifle, brass), b = new THREE.Mesh(cg.body, hull); g.add(a, b); g.visible = false; scene.add(g);
        pools.casing.push({ m: g, a, b, cg, v: V3(), av: V3(), t: 0, floor: 0, hits: 0 });
      }
      pools.casingMats = [brass, hull];
    }
    // flash lights (constant count => no shader recompiles)
    pools.flash = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffb060, 0, 14, 2); scene.add(l); pools.flash.push({ l, t: 0, ml: 0, i0: 0 }); }
    pools.flashIdx = 0;
    FX.world = document.getElementById('worldui');
  };
  FX.withWarm = function (fn) {
    if (!scene || !pools.tracer) return fn();
    const saved = [];
    const show = (m, mat) => {
      if (!m) return;
      saved.push([m, m.visible, m.material, m.frustumCulled]);
      if (mat) m.material = mat;
      m.visible = true; m.frustumCulled = false;
    };
    if (pools.tracer[0]) show(pools.tracer[0].m);
    if (pools.decal[0]) show(pools.decal[0].m, FX.dmats.hole);
    if (pools.decal[1]) show(pools.decal[1].m, FX.dmats.scorch);
    if (pools.decal[2]) show(pools.decal[2].m, FX.dmats.crack);
    if (pools.decal[3]) {
      if (!FX.splatMats[0x5a1010]) FX.splatMats[0x5a1010] = new THREE.MeshBasicMaterial({ map: G.Tex.spr.splat, color: 0x5a1010, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3 });
      show(pools.decal[3].m, FX.splatMats[0x5a1010]);
    }
    if (pools.ring[0]) show(pools.ring[0].m);
    if (pools.tele[0]) show(pools.tele[0].m);
    if (pools.teleL[0]) show(pools.teleL[0].m);
    if (FX.arc) { FX.arc.spawn(new THREE.Vector3(0, -500, 0), new THREE.Vector3(0, -499, 0), 0.01, 0.05, rgb(0xffffff), 1, 0); FX.arc.update(0.001); }
    if (pools.beam[0]) show(pools.beam[0].m);
    if (pools.bubble[0]) show(pools.bubble[0].m);
    if (pools.ripple && pools.ripple[0]) show(pools.ripple[0].m);
    if (pools.debris[0]) show(pools.debris[0].m, (G.world && G.world.mats && G.world.mats.rock) || FX.dmats.hole);
    if (pools.casing && pools.casing[0]) { show(pools.casing[0].m); pools.casing[0].b.visible = true; }
    if (FX.streak) { FX.streak.spawn(0, -500, 0, 0, 1, 0, 0.05, 0.01, 1, 1, 1, 0, 0, 0.04); FX.drops.spawn(0, -500, 0, 0, 1, 0, 0.05, 0.01, 1, 1, 1, 0, 0, 0.04); FX.streak.update(0.001); FX.drops.update(0.001); }
    const sr = FX.srKeep(); sr.visible = true;
    const vxBack = G.vfx && G.vfx.warmShow ? G.vfx.warmShow() : null;
    const gmBack = G.Gim && G.Gim.warmShow ? G.Gim.warmShow() : null; // (the fields' devices: gimmick.js)
    try { return fn(); } finally {
      if (vxBack) vxBack();
      if (gmBack) gmBack();
      sr.visible = false; // (kept, not disposed: see FX.srKeep)
      for (const [m, vis, mat, fc] of saved) { m.visible = vis; m.material = mat; m.frustumCulled = fc; }
    }
  };

  FX.setFog = function (color, density) {
    for (const s of [FX.add, FX.flame, FX.norm, FX.streak, FX.drops]) { s.mat.uniforms.uFogD.value = density; s.mat.uniforms.uFogC.value.set(color); }
    SU.uFogD.value = density; SU.uFogC.value.set(color);
    if (G.vfx && G.vfx.setFog) G.vfx.setFog(color, density);
  };
  // how light the place is (0..1): what dust, smoke and drops are seen by - they are not lights of their own
  FX.setLit = function (k) { for (const s of [FX.norm, FX.drops]) s.mat.uniforms.uLit.value = k; SU.uLit.value = k; if (G.vfx && G.vfx.setLit) G.vfx.setLit(k); };
  FX.lit = () => SU.uLit.value;
  FX.clear = function () {
    if (G.GrenFX) G.GrenFX.clear();
    if (G.vfx && G.vfx.clear) G.vfx.clear();
    FX.add.clear(); FX.flame.clear(); FX.norm.clear(); FX.streak.clear(); FX.drops.clear(); if (FX.arc) FX.arc.clear();
    for (const d of pools.casing || []) { d.t = 0; d.m.visible = false; }
    for (const d of pools.decal) d.m.visible = false;
    for (const t of pools.tele) { t.m.visible = false; t.active = false; }
    for (const t of pools.teleL) { t.m.visible = false; t.active = false; }
    for (const r of pools.ring) r.m.visible = false;
    for (const b of pools.beam) b.m.visible = false;
    for (const d of pools.debris) d.m.visible = false;
    FX.world.querySelectorAll('.dnum').forEach((n) => n.remove());
  };

  const col = new THREE.Color();
  function rgb(c) { col.set(c); return col; }
  function rs(a) { return (Math.random() * 2 - 1) * a; }

  // ---------------- emitters ----------------
  FX.sparks = function (p, n, count, color, speed) {
    const c = rgb(color || 0xffb060);
    count = count || 8; speed = speed || 7;
    for (let i = 0; i < count; i++) {
      const vx = (n ? n.x : 0) * speed * 0.6 + rs(speed * 0.6), vy = (n ? n.y : 0) * speed * 0.6 + rs(speed * 0.5) + 1.5, vz = (n ? n.z : 0) * speed * 0.6 + rs(speed * 0.6);
      const k = 0.5 + Math.random();
      FX.streak.spawn(p.x, p.y, p.z, vx * k, vy * k, vz * k, 0.16 + Math.random() * 0.34, 0.007 + Math.random() * 0.009, c.r * 2.4, c.g * 2.0, c.b * 1.5, 13, 1.3, 0.035 + Math.random() * 0.03);
    }
    FX.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.08, 0.06 + Math.min(0.3, count * 0.012), 0.02, c.r * 1.6, c.g * 1.4, c.b * 1.2, 0.9, 0, 0);
  };
  FX.dust = function (p, n, color, amount) {
    const c = rgb(color || 0x8a8070);
    amount = amount || 4;
    for (let i = 0; i < amount; i++) {
      const k = 1.2 + Math.random() * 2.2;
      FX.norm.spawn(p.x, p.y, p.z, (n ? n.x : 0) * k + rs(0.5), (n ? n.y : 0) * k + rs(0.4) + 0.25, (n ? n.z : 0) * k + rs(0.5), 0.7 + Math.random() * 0.7, 0.1, 0.5 + Math.random() * 0.45, c.r, c.g, c.b, 0.42, -0.15, 3.2);
    }
    // chips
    for (let i = 0; i < amount; i++) FX.norm.spawn(p.x, p.y, p.z, (n ? n.x : 0) * 3 + rs(2), (n ? n.y : 0) * 3 + Math.random() * 2, (n ? n.z : 0) * 3 + rs(2), 0.5, 0.05, 0.04, c.r * 0.6, c.g * 0.6, c.b * 0.6, 1, 12, 0.5);
  };
  FX.blood = function (p, d, color, amount) {
    const c = rgb(color || 0x7a1010);
    amount = amount || 8;
    for (let i = 0; i < amount; i++) {
      const s = 1.5 + Math.random() * 3;
      FX.drops.spawn(p.x, p.y, p.z, (d ? d.x : 0) * s + rs(1.5), (d ? d.y : 0) * s + rs(1) + 1, (d ? d.z : 0) * s + rs(1.5), 0.35 + Math.random() * 0.4, 0.008 + Math.random() * 0.012, c.r * 0.8, c.g * 0.8, c.b * 0.8, 9.8, 0.5, 0.014 + Math.random() * 0.02);
    }
    for (let i = 0; i < 2; i++) FX.norm.spawn(p.x, p.y, p.z, (d ? d.x : 0) * 0.8 + rs(0.3), 0.2 + rs(0.2), (d ? d.z : 0) * 0.8 + rs(0.3), 0.3 + Math.random() * 0.2, 0.14, 0.5 + Math.random() * 0.25, c.r * 0.85, c.g * 0.85, c.b * 0.85, 0.42, 0.6, 2.5);
  };
  FX.smoke = function (p, amount, size, color, rise, life) {
    const c = rgb(color || 0x3a3632);
    for (let i = 0; i < (amount || 6); i++) {
      FX.norm.spawn(p.x + rs(0.3), p.y + rs(0.3), p.z + rs(0.3), rs(0.8), (rise ?? 1) * (0.5 + Math.random()), rs(0.8), (life || 1.6) * (0.7 + Math.random() * 0.6), (size || 1) * 0.5, (size || 1) * (1.8 + Math.random()), c.r, c.g, c.b, 0.5, -0.3, 1.2);
    }
  };
  // ---- what the elements leave, as they are seen: steam, frost and ice, small arcs, a sick murk
  // steam: white vapour thrown up fast, billowing and thinning as it rises (water on something hot)
  FX.steam = function (p, amount, size) {
    const s = size || 1;
    for (let i = 0; i < (amount || 8); i++) FX.norm.spawn(p.x + rs(0.25 * s), p.y + rs(0.2 * s), p.z + rs(0.25 * s), rs(0.9), 1.2 + Math.random() * 1.8, rs(0.9), 0.7 + Math.random() * 0.6, 0.25 * s, (1.1 + Math.random() * 0.7) * s, 0.86, 0.87, 0.88, 0.42, -0.6, 2.4);
  };
  // ice breaking: chips thrown out that fall and glint, a puff of frost (cold mist that sinks)
  FX.iceBurst = function (p, n, speed, size) {
    n = n || 12; speed = speed || 4; const s = size || 1;
    for (let i = 0; i < n; i++) {
      const k = 0.4 + Math.random() * 0.8;
      FX.drops.spawn(p.x, p.y, p.z, rs(speed) * k, (Math.random() * 0.9 + 0.3) * speed * k, rs(speed) * k, 0.45 + Math.random() * 0.4, (0.01 + Math.random() * 0.016) * s, 0.84, 0.88, 0.92, 9.8, 0.4, 0.012 + Math.random() * 0.015);
      if (i % 3 === 0) FX.add.spawn(p.x + rs(0.3 * s), p.y + rs(0.3 * s), p.z + rs(0.3 * s), rs(speed * 0.5), Math.random() * speed * 0.5, rs(speed * 0.5), 0.18, 0.05 * s, 0.02, 0.75, 0.8, 0.86, 0.9, 6, 1);
    }
    for (let i = 0; i < Math.ceil(n / 4); i++) FX.norm.spawn(p.x + rs(0.3 * s), p.y + rs(0.3 * s), p.z + rs(0.3 * s), rs(0.8), rs(0.3), rs(0.8), 1.0 + Math.random() * 0.6, 0.3 * s, (1.0 + Math.random() * 0.6) * s, 0.8, 0.84, 0.88, 0.34, 0.25, 2.2);
  };
  // small arcs running over a body: between points about c (r across, h tall), each a flick of a few hundredths of a second
  FX.arcsOn = function (c, r, h, n, col) {
    for (let i = 0; i < (n || 1); i++) {
      const a = new THREE.Vector3(c.x + rs(r), c.y + rs(h * 0.5), c.z + rs(r)), b = new THREE.Vector3(c.x + rs(r), c.y + rs(h * 0.5), c.z + rs(r));
      FX.arcBolt(a, b, { col: col || 0xc8d8f0, w: 0.035, life: 0.05 + Math.random() * 0.04, branches: Math.random() < 0.3 ? 1 : 0, minSeg: 0.06, rough: 0.3, restrike: 0 });
    }
  };
  // a sick murk: heavy yellow-grey vapour, rolling out low and hanging
  FX.gas = function (p, amount, size) {
    const s = size || 1;
    for (let i = 0; i < (amount || 8); i++) FX.norm.spawn(p.x + rs(0.4 * s), p.y + rs(0.3 * s), p.z + rs(0.4 * s), rs(1.4), 0.1 + Math.random() * 0.5, rs(1.4), 1.6 + Math.random() * 1.0, 0.4 * s, (1.6 + Math.random()) * s, 0.36, 0.36, 0.2, 0.38, 0.05, 1.6);
  };
  // a single flame lick (call repeatedly for torches)
  // (a flame is brighter than the wall it lights: drawn no brighter than white, it was lost before a wall a hand away from it)
  const FLAME_K = 4;
  FX.flameLick = function (x, y, z, s, color) {
    const c = rgb(color || 0xff9a40), S = 0.3 * Math.pow(s, 1.15), FK = FLAME_K * (s > 1 ? 1 / Math.sqrt(s) : 1);   // (a great fire is many tongues over one another: each is drawn the dimmer, or a bed of them is white)
    // (the flame itself stands where it burns, its root at the wick: a tongue that the next replaces before it is gone. It was a puff
    // sent up half a metre, which over a candle is a string of small flames in the air)
    FX.flame.spawn(x + rs(0.02 * s), y + S * 0.4, z + rs(0.02 * s), rs(0.04 * s), 0.14 * s, rs(0.04 * s), 0.3 + Math.random() * 0.16, S * (1.05 + Math.random() * 0.3), S * 0.8, c.r * FK, c.g * FK, c.b * FK, 0.9, 0, 0, c.r * 1.2, c.g * 0.6, c.b * 0.25);
    // (tongues torn off it and carried up: a fire of some size throws more of them, and higher)
    if (Math.random() < Math.min(0.7, 0.12 + s * 0.22)) FX.flame.spawn(x + rs(0.05 * s), y + S * 0.6, z + rs(0.05 * s), rs(0.12 * s), (0.7 + Math.random() * 0.6) * s, rs(0.12 * s), 0.3 + Math.random() * 0.25, S * 0.6, S * 0.12, c.r * 1.4, c.g * 1.1, c.b * 0.8, 0.8, -0.4, 1.2, c.r * 1.2, c.g * 0.45, c.b * 0.15);
    if (Math.random() < 0.08) FX.add.spawn(x, y + 0.1, z, rs(0.4), 1.2 + Math.random(), rs(0.4), 0.8 + Math.random() * 0.6, 0.03, 0.01, 1.5, 0.8, 0.3, 1, -0.2, 0.3);
    if (Math.random() < 0.06) FX.norm.spawn(x, y + 0.4 * s, z, rs(0.1), 0.6, rs(0.1), 1.5, 0.15 * s, 0.6 * s, 0.1, 0.09, 0.08, 0.25, -0.1, 0.5);
  };
  FX.fireBurst = function (p, r, color) {
    const c = rgb(color || 0xff8a3a);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28, d = Math.random() * r;
      FX.flame.spawn(p.x + Math.cos(a) * d, p.y + Math.random() * 0.5, p.z + Math.sin(a) * d, rs(0.5), 1.5 + Math.random() * 2, rs(0.5), 0.4 + Math.random() * 0.4, 0.7, 0.24, c.r * 2.8, c.g * 2.8, c.b * 2.8, 0.85, -1, 1, c.r, c.g * 0.4, c.b * 0.2);
    }
  };
  FX.explosion = function (p, r, color, opts) {
    opts = opts || {};
    const c = rgb(color || 0xff9a40);
    const k = Math.max(0.4, r / 4);
    // the blast itself as a body: a boiling fireball (fire colours) or a burst of light (any other colour), 0.85 of the blast radius at most
    const fiery = c.r > c.b * 1.4 && c.r >= c.g * 0.9;
    if (G.vfx && G.vfx.fireball) { if (fiery) G.vfx.fireball(p, r, color ? FX.tone(color, new THREE.Color()).getHex() : 0xffffff); else G.vfx.burst(p, r * 0.85, color); }
    // core flash & fireball
    // (flames thrown out: only where the blast is not fire - a blast of fire has its ball for a body, and tongues of flame before a
    // ball that is white-hot are dark spots on it)
    if (!(G.vfx && G.vfx.fireball)) for (let i = 0; i < 28 * k; i++) {   // (a blast not of fire throws no tongues of its colour: its body is VX.burst)
      const dir = new THREE.Vector3(rs(1), rs(1) * 0.7 + 0.3, rs(1)).normalize();
      const s = r * (1.5 + Math.random() * 2.5);
      FX.flame.spawn(p.x, p.y, p.z, dir.x * s, dir.y * s, dir.z * s, 0.35 + Math.random() * 0.35, r * 0.45, r * 0.15, c.r * 1.6, c.g * 1.3, c.b * 1.1, 1, -1, 5, c.r * 0.9, c.g * 0.3, c.b * 0.1);
    }
    if (fiery) FX.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.18, r * 1.6, r * 2.2, 1.6, 1.3, 1.0, 1, 0, 0); else { const tc = FX.tone(color || 0xffffff, new THREE.Color()); FX.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.12, r * 0.8, r * 1.4, tc.r * 0.8, tc.g * 0.8, tc.b * 0.8, 1, 0, 0); }
    // smoke
    if (!opts.noSmoke) for (let i = 0; i < 14 * k; i++) {
      const dir = new THREE.Vector3(rs(1), Math.random() * 0.8 + 0.2, rs(1)).normalize();
      const s = r * (0.5 + Math.random());
      FX.norm.spawn(p.x, p.y, p.z, dir.x * s, dir.y * s, dir.z * s, 1.4 + Math.random() * 1.4, r * 0.4, r * 1.2, 0.12, 0.11, 0.1, 0.6, -0.4, 1.8);
    }
    // sparks/embers
    FX.sparks(p, null, Math.floor(20 * k), 0xffa050, 14 * k);
    if (!opts.noRing) FX.ring(p, r, color || 0xffa060, 0.35); // (the edge of the blast: what it hurts. noRing: the blast is only the body of a wider hit that draws its own edge)
    FX.flash(p, FX.tone(color || 0xff9a40, new THREE.Color()).getHex(), (fiery ? 60 : 18) * k, 0.25, r * (fiery ? 4 : 3));
    if (opts.decal !== false) FX.decal(new THREE.Vector3(p.x, p.y - 0.1, p.z), new THREE.Vector3(0, 1, 0), 'scorch', r * 1.4, true);
  };
  FX.flash = function (p, color, intensity, dur, dist) {
    const f = pools.flash[pools.flashIdx++ % pools.flash.length];
    f.l.position.copy(p); f.l.color.set(color || 0xffb060); f.l.distance = dist || 12;
    f.i0 = (intensity || 30) * (G.LIGHT_K || 1); f.l.intensity = f.i0; f.t = dur || 0.08; f.ml = f.t;
  };
  // a streak that flies from a to b in the time it is given (a shot's tracer, a link thrown from one thing to another)
  const TRZ = new THREE.Vector3(0, 0, -1);
  // (still: the whole stretch at once, fading - a bolt of lightning's pieces, the short pieces of a blade's trail; anything under three metres is still)
  FX.tracer = function (a, b, color, width, life, still) {
    const t = pools.tracer.find((x) => x.t <= 0) || pools.tracer[0];
    const m = t.m, len = a.distanceTo(b);
    t.still = !!still || len < 3;
    t.a = (t.a || new THREE.Vector3()).copy(a); t.d = (t.d || new THREE.Vector3()).copy(b).sub(a); if (len > 1e-6) t.d.multiplyScalar(1 / len); t.len = len;
    t.w = (width || 0.025) * (t.still ? 1.25 : 1.6); t.streak = t.still ? len : Math.min(len * 0.45, 9);
    m.geometry = t.still ? pools.tracerBar : pools.tracerFly;
    m.quaternion.setFromUnitVectors(TRZ, t.back = (t.back || new THREE.Vector3()).copy(t.d).negate());
    if (t.still) { m.position.copy(b); m.scale.set(t.w, t.w, Math.max(0.001, len)); } else { m.position.copy(a); m.scale.set(t.w, t.w, 0.001); }
    m.material.color.set(color || 0xffd8a0);
    m.material.opacity = 1;
    m.visible = true; t.t = t.ml = life || 0.06;
  };
  FX.seg = function (a, b, color, width, life) { FX.tracer(a, b, color, width, life, true); };
  // ---- electric arcs. The path of a discharge: from a to b by halving each stretch and pushing its middle aside by a share of its
  // length, five or six times over (so it is crooked at every scale, the way a spark's channel is), the ends where they were asked.
  const _pv = new THREE.Vector3(), _pd = new THREE.Vector3();
  function arcPath(a, b, rough, minSeg) {
    let pts = [a.clone(), b.clone()];
    const L = a.distanceTo(b);
    for (let lv = 0; lv < 7; lv++) {
      const seg = L / (pts.length - 1); if (seg < (minSeg || 0.2)) break;
      const nx = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1];
        _pd.subVectors(q, p); const l = _pd.length() || 1e-4; _pd.multiplyScalar(1 / l);
        _pv.set(rs(1), rs(1), rs(1)); _pv.addScaledVector(_pd, -_pv.dot(_pd)); if (_pv.lengthSq() < 1e-6) _pv.set(_pd.y, -_pd.x, 0); _pv.normalize();
        nx.push(p.clone().add(q).multiplyScalar(0.5).addScaledVector(_pv, l * rough * (0.35 + Math.random() * 0.65)), q);
      }
      pts = nx;
    }
    return pts;
  }
  // a discharge from a to b: o = { w: the glow's width (m), life, rough, branches, k (brightness), restrike (s), col, down (branches lean down) }
  FX.arcBolt = function (a, b, o) {
    o = o || {};
    if (!FX.arc) return;
    const c = FX.tone(o.col || 0xcfe0ff, new THREE.Color()), w = o.w || 0.08, life = o.life || 0.14, k = o.k || 1, rough = o.rough ?? 0.22;
    const pts = arcPath(a, b, rough, o.minSeg);
    const rst = o.restrike ?? (Math.random() < 0.6 ? life * (0.35 + Math.random() * 0.25) : 0);
    for (let i = 0; i < pts.length - 1; i++) FX.arc.spawn(pts[i], pts[i + 1], w, life, c, k, rst);
    // (forks: thinner, dimmer, gone sooner; leaving the channel at a slant and going on the way it went)
    const L = a.distanceTo(b), nb = o.branches ?? Math.min(4, Math.round(L / 2.5) + (Math.random() < 0.5 ? 1 : 0));
    for (let j = 0; j < nb && pts.length > 4; j++) {
      const i = 1 + Math.floor(Math.random() * (pts.length - 3)), p = pts[i];
      _pd.subVectors(pts[Math.min(pts.length - 1, i + 2)], p).normalize();
      const dir = _pd.clone().add(new THREE.Vector3(rs(0.9), o.down ? -Math.random() * 0.6 : rs(0.9), rs(0.9))).normalize();
      const q = p.clone().addScaledVector(dir, L * (0.12 + Math.random() * 0.22));
      const bp = arcPath(p, q, rough * 1.2, o.minSeg);
      for (let m = 0; m < bp.length - 1; m++) FX.arc.spawn(bp[m], bp[m + 1], w * 0.55, life * 0.7, c, k * 0.55 * (1 - m / bp.length * 0.6), rst);
    }
    return pts;
  };
  // a bolt from a to b, and a second stroke a moment later along a fresh path; a hot point where it lands
  FX.lightning = function (a, b, color) {
    const col = color || 0xcfe0ff, len = a.distanceTo(b);
    FX.arcBolt(a, b, { col, w: Math.min(0.16, 0.05 + len * 0.012), life: 0.13 });
    if (G.vfx && G.vfx.after) G.vfx.after(() => FX.arcBolt(a, b, { col, w: Math.min(0.12, 0.04 + len * 0.009), life: 0.08, k: 0.75, restrike: 0 }), 60);
    FX.flash(b, FX.tone(col, new THREE.Color()).getHex(), 30, 0.12, 9);
    FX.sparks(b, null, 5, 0xffd8a8, 5);   // (what it lands on throws off molten specks: hot metal, not its own colour)
  };
  // a bolt that comes down from the sky onto `p` (electric weapons): a crooked channel that forks downward, a flash that lights the
  // place, a blast of air that throws up the dust, a scorch, specks thrown off. A few a second at most, so that a rapid-fire arc gun
  // does not turn the screen white
  let strikeT = 0;
  FX.strike = function (p, color, big) {
    const now = performance.now();
    if (now - strikeT < (big ? 120 : 260)) return;
    strikeT = now;
    const col = color || 0xcfe0ff, H = big ? 14 : 11; // (indoor vaults are 16 m high: the bolt stays below the ceiling)
    const top = p.clone().add(new THREE.Vector3(rs(2.5), H, rs(2.5)));
    FX.arcBolt(top, p, { col, w: big ? 0.3 : 0.2, life: big ? 0.24 : 0.18, rough: 0.2, branches: big ? 5 : 3, down: true, minSeg: 0.25 });
    FX.flash(p.clone().add(new THREE.Vector3(0, 1, 0)), FX.tone(col, new THREE.Color()).getHex(), big ? 90 : 55, 0.18, big ? 22 : 15);
    FX.ring(p, big ? 3.2 : 2.0, col, 0.35);
    FX.dust(p, new THREE.Vector3(0, 1, 0), 0x6a645a, big ? 6 : 3);
    FX.sparks(p, null, big ? 12 : 7, 0xffd8a8, 7);
    FX.decal(new THREE.Vector3(p.x, p.y + 0.01, p.z), new THREE.Vector3(0, 1, 0), 'scorch', big ? 1.6 : 1.0, true);
    if (G.player && big) G.player.addShake(0.12);
    if (G.sfx.zap) G.sfx.zap(p);
  };
  FX.decal = function (p, n, kind, size, ground, color) {
    const d = pools.decal[pools.decalIdx++ % pools.decal.length];
    const m = d.m;
    if (kind === 'splat') {
      const key = color || 0x5a1010;
      if (!FX.splatMats[key]) FX.splatMats[key] = new THREE.MeshBasicMaterial({ map: G.Tex.spr.splat, color: key, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3 });
      m.material = FX.splatMats[key];
    } else m.material = FX.dmats[kind] || FX.dmats.hole;
    // each slot keeps its own copy of the material so it can fade out on its own
    const base = m.material, mk = base.uuid;
    d.mats = d.mats || {};
    if (!d.mats[mk]) d.mats[mk] = base.clone();
    m.material = d.mats[mk]; m.material.opacity = base.opacity; d.op = base.opacity;
    m.position.copy(p).addScaledVector(n, 0.012);
    m.lookAt(p.x + n.x, p.y + n.y, p.z + n.z);
    m.rotateZ(Math.random() * 6.28);
    const s = size || 0.12;
    m.scale.set(s, s, s);
    m.visible = true;
    // scorch / cracks / splats fade away instead of staying for good
    d.t = d.ml = kind === 'hole' || kind === 'holeM' || kind === 'holeW' ? 20 : kind === 'scorch' ? 12 : kind === 'crack' ? 14 : 22;
  };
  // the edge of a blow running out over the floor to r in dur: a band of dust thrown up (and puffs of it rising, in the same place) with
  // its leading lip lit by the blow's own colour. opts.start: the share of r it starts at
  FX.ring = function (p, r, color, dur, opts) {
    const o = pools.ring.find((x) => x.t <= 0) || pools.ring[0];
    dur = dur || 0.4;
    o.m.position.set(p.x, p.y + 0.05, p.z);
    FX.tone(color || 0xffffff, o.m.material.uniforms.uC.value);
    o.m.material.uniforms.uSeed.value = Math.random();
    o.r = r; o.t = o.ml = dur; o.start = (opts && opts.start) || 0.1; o.w = Math.min(0.9, Math.max(0.16, r * 0.11));
    o.m.visible = true; FX.ringStep(o, 0);
    // (the dust itself, in puffs: from where it starts to the edge in the time it takes, then hanging and settling)
    const n = Math.max(6, Math.min(26, Math.round(r * 4))), r0 = r * o.start, drag = 3, v0 = (r - r0) * drag / (1 - Math.exp(-drag * dur)), sz = Math.min(2, Math.max(0.5, r / 3));
    for (let i = 0; i < n; i++) {
      const an = (i + Math.random() * 0.8) / n * Math.PI * 2, cx = Math.cos(an), cz = Math.sin(an), v = v0 * (0.85 + Math.random() * 0.3);
      FX.norm.spawn(p.x + cx * r0, p.y + 0.12, p.z + cz * r0, cx * v, 0.3 + Math.random() * 0.8, cz * v, dur * 1.5 + 0.4 + Math.random() * 0.4, 0.45 * sz, (1.4 + Math.random() * 0.8) * sz, 0.5, 0.47, 0.43, 0.2, -0.15, drag);   // (wide and thin: dust, not tufts)
    }
  };
  FX.ringStep = function (o, k) {
    const R = Math.max(0.05, o.r * (o.start + (1 - o.start) * (1 - Math.pow(1 - k, 2)))), W = o.w * (0.6 + 0.8 * k), u = o.m.material.uniforms, S = (R + W * 2) * 2;
    o.m.scale.set(S, 1, S); u.uSX.value = u.uSZ.value = S; u.uR.value = R; u.uW.value = W; u.uA.value = Math.max(0, 1 - k * k);
  };
  // a shock ring you jump over: a band of fixed width centred exactly on radius r (what the hit test uses): churned dust and grit, a hot
  // line along its middle in the colour of what threw it, dust left behind it. On a plane that reaches maxR. set(r) every frame; it
  // disappears by itself when it is no longer refreshed.
  const SR_VS = 'varying vec2 vP; varying float vDepth; void main() { vP = position.xz; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }';
  const SR_FS = `uniform float uR; uniform float uHW; uniform vec3 uCol; uniform float uA; uniform float uSeed; uniform float uLit; uniform float uFogD; uniform vec3 uFogC; varying vec2 vP; varying float vDepth;
    ${GNOISE}
    void main() {
      float d = length(vP), e = abs(d - uR);
      if (e > uHW + 3.0) discard;
      float ang = atan(vP.y, vP.x), n = fbm(vec2(ang * max(uR, 1.0) * 0.9 + uSeed * 17.0, (d - uR) * 1.5)), n2 = fbm(vec2(ang * max(uR, 1.0) * 2.6 - uSeed * 5.0, (d - uR) * 4.0));
      float band = 1.0 - smoothstep(uHW * 0.8, uHW, e);                                   // the part that hurts: exactly the width of the hit test
      float cx = (d - uR) / max(uHW * 0.2, 0.05), core = exp(-cx * cx) * (0.7 + 0.5 * n);     // a hot line along its middle
      float trail = d < uR ? exp(-(uR - d) * 0.8) * 0.32 * (0.4 + 0.9 * n) : 0.0;          // dust it leaves behind
      float a = clamp(band * smoothstep(0.48, 0.72, n * 0.55 + n2 * 0.55) * 0.5 + trail * 0.4 * smoothstep(0.45, 0.75, n2), 0.0, 0.55) * uA;   // (the floor scuffed and dusted where it passed)
      if (a < 0.01 && core < 0.02) discard;
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      vec3 em = uCol * (core * 0.05 * smoothstep(0.35, 0.7, n) + band * 0.012) * uA;   // (a little heat in the crease, no lit line)
      gl_FragColor = vec4(em * fogv + mix(uFogC, vec3(0.14, 0.13, 0.115) * uLit * (0.75 + 0.5 * n2), fogv) * a, a);
    }`;
  // ...and over the band, the dust it throws up: a low wall of it standing on the same radius, ragged at its top, rolling, lit at its
  // foot by the blow's own colour (an open cylinder: x around it, y up it)
  const SW_VS = `varying vec2 vUv; varying float vDepth; varying float vFace; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; vFace = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`;
  const SW_FS = `uniform float uR; uniform float uA; uniform float uSeed; uniform float uT; uniform vec3 uCol; uniform float uLit; uniform float uFogD; uniform vec3 uFogC; varying vec2 vUv; varying float vDepth; varying float vFace;
    ${GNOISE}
    void main() {
      float x = vUv.x * 6.2832 * max(uR, 0.5), y = vUv.y;
      float n = fbm(vec2(x * 1.9 + uSeed * 31.0, y * 3.2 - uT * 1.8)), n2 = fbm(vec2(x * 4.6 - uSeed * 7.0, y * 6.0 - uT * 2.6));
      float top = 0.2 + 0.8 * fbm(vec2(x * 0.9 + uSeed * 3.0, 0.5));
      float dens = (1.0 - smoothstep(top - 0.5, top, y)) * smoothstep(0.0, 0.1, y) * smoothstep(0.4, 0.68, n * 0.6 + n2 * 0.55);
      float a = clamp(dens * 0.6, 0.0, 0.6) * uA * smoothstep(0.08, 0.55, vFace);   // (thin where it is seen edge-on: no bright line at its sides)
      if (a < 0.01) discard;
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      vec3 dust = vec3(0.2, 0.185, 0.165) * uLit * (0.7 + 0.6 * n2);
      vec3 em = uCol * exp(-y * 8.0) * 0.08 * (0.4 + n) * uA;
      gl_FragColor = vec4(em * fogv + mix(uFogC, dust, fogv) * a, a);
    }`;
  let swGeo = null;
  const swMat = (color) => premul(new THREE.ShaderMaterial({ uniforms: { uR: { value: 1 }, uA: { value: 1 }, uSeed: { value: Math.random() }, uCol: { value: FX.tone(color || 0xffa040) }, uT: SU.uT, uLit: SU.uLit, uFogD: SU.uFogD, uFogC: SU.uFogC }, vertexShader: SW_VS, fragmentShader: SW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const swGeom = () => { if (!swGeo) { swGeo = new THREE.CylinderGeometry(1, 1, 1, 72, 1, true); swGeo.translate(0, 0.5, 0); } return swGeo; };
  FX.shocks = [];
  const srMat = (color, hw) => premul(new THREE.ShaderMaterial({ uniforms: { uR: { value: 0 }, uHW: { value: hw || 0.8 }, uCol: { value: FX.tone(color || 0xffa040) }, uA: { value: 1 }, uSeed: { value: Math.random() }, uLit: SU.uLit, uFogD: SU.uFogD, uFogC: SU.uFogC }, vertexShader: SR_VS, fragmentShader: SR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  // one ring's materials are kept for good (never disposed, drawn once at the warm-up): their shader programs stay made, so a ring that comes
  // and goes (every blast, every ground wave) never has its shaders made again on the spot (three.js drops a program with its last material)
  FX.srKeep = function () {
    if (!FX._srKeep) {
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); const m = FX._srKeep = new THREE.Mesh(g, srMat()); m.visible = false; m.frustumCulled = false; m.renderOrder = 6; m.position.set(0, -500, 0);
      const w = new THREE.Mesh(swGeom(), swMat()); w.frustumCulled = false; w.renderOrder = 7; m.add(w);
    }
    if (!FX._srKeep.parent) scene.add(FX._srKeep);
    return FX._srKeep;
  };
  // hw: half the band's width; the dust over it stands about three times as high as the band is wide, a metre and a bit at most
  FX.shockRing = function (c, color, hw, maxR) {
    const R = maxR || 50, g = new THREE.PlaneGeometry(R * 2, R * 2); g.rotateX(-Math.PI / 2);
    const mat = srMat(color, hw), wm = swMat(color), H = Math.min(1.3, Math.max(0.45, (hw || 0.8) * 1.6));
    const m = new THREE.Mesh(g, mat); m.position.set(c.x, c.y + 0.16, c.z); m.frustumCulled = false; m.renderOrder = 6; scene.add(m);
    const w = new THREE.Mesh(swGeom(), wm); w.position.set(c.x, c.y + 0.02, c.z); w.frustumCulled = false; w.renderOrder = 7; w.scale.set(0.01, H, 0.01); scene.add(w);
    const o = { m, life: 0.3,
      set(r, a) { mat.uniforms.uR.value = r; mat.uniforms.uA.value = a === undefined ? 1 : a; const rr = Math.max(0.05, r); w.scale.set(rr, H * Math.min(1, 0.35 + rr / (H * 3)), rr); wm.uniforms.uR.value = rr; wm.uniforms.uA.value = (a === undefined ? 1 : a) * Math.min(1, rr / 0.6); this.life = 0.3; },
      dispose() { if (m.parent) m.parent.remove(m); if (w.parent) w.parent.remove(w); g.dispose(); mat.dispose(); wm.dispose(); o.dead = true; } };
    FX.shocks.push(o); return o;
  };
  // a warning on the floor: its edge at r from the first moment, what is taken spreading from the middle until it is all taken at dur
  // (the hit). See TELE_FS. Returns a handle (FX.teleMove, FX.endTelegraph)
  // (a warning must read as danger: blue ones are frost; violet and pink ones are heat like the rest, a little of their own hue kept
  // in the heat, so the guardians' own warnings still tell apart without turning into a pale lilac nobody fears)
  const _th = { h: 0, s: 0, l: 0 }, _tc = new THREE.Color(), HEAT = new THREE.Color(0xd04018);
  const teleSet = (o, color) => {
    const u = o.m.material.uniforms; _tc.set(color || 0xc02010); _tc.getHSL(_th, THREE.SRGBColorSpace);
    const violet = _th.s > 0.25 && _th.h > 0.68 && _th.h < 0.97;
    FX.tone(color || 0xc02010, u.uC.value); if (violet) u.uC.value.lerp(HEAT, 0.92);
    u.uCold.value = violet ? 0 : coldOf(u.uC.value); u.uSeed.value = Math.random(); u.uK.value = 0; u.uA.value = 0;
  };
  FX.telegraph = function (p, r, dur, color) {
    const o = pools.tele.find((x) => !x.active) || pools.tele[0];
    o.active = true; o.t = 0; o.ml = dur / (FX.teleK || 1); o.r = r; // teleK: a guardian whose clock runs fast fills its warnings just as fast (they end exactly on the hit)
    o.m.position.set(p.x, p.y + 0.06, p.z);
    const S = (r + 0.5) * 2, u = o.m.material.uniforms; o.m.scale.set(S, 1, S); u.uSX.value = u.uSZ.value = S; u.uR.value = r;
    teleSet(o, color); o.m.visible = true;
    o.follow = null;
    return o;
  };
  // move a live warning circle (it keeps its fill progress)
  FX.teleMove = function (o, p) { if (!o || !o.active) return; o.m.position.set(p.x, p.y + 0.06, p.z); };
  // a lane from a to b, `width` wide, filling in from a toward b over `dur` seconds
  FX.teleLine = function (a, b, width, dur, color) {
    const o = pools.teleL.find((x) => !x.active) || pools.teleL[0];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 0.01;
    o.active = true; o.t = 0; o.ml = dur / (FX.teleK || 1);
    o.m.position.set((a.x + b.x) / 2, (a.y || 0) + 0.07, (a.z + b.z) / 2);
    const u = o.m.material.uniforms; o.m.rotation.set(0, Math.atan2(dx, dz), 0); o.m.scale.set(width + 1, 1, len + 1);
    u.uSX.value = width + 1; u.uSZ.value = len + 1; u.uHW.value = width / 2; u.uHL.value = len / 2;
    teleSet(o, color); o.m.visible = true;
    return o;
  };
  FX.endTeleLine = function (o) { if (o) { o.active = false; o.m.visible = false; } };
  FX.clearTelegraphs = function () { for (const t of pools.teleL) { t.m.visible = false; t.active = false; } for (const t of pools.tele) { t.m.visible = false; t.active = false; } };
  FX.endTelegraph = function (o) { if (o) { o.active = false; o.m.visible = false; } };
  FX.beam = function (a, b, color, width, life) {
    const o = pools.beam.find((x) => x.t <= 0) || pools.beam[0];
    o.m.position.copy(a); o.m.lookAt(b);
    o.m.scale.set(width || 0.1, width || 0.1, a.distanceTo(b));
    FX.tone(color || 0xff6040, o.m.material.uniforms.uC.value); o.m.material.uniforms.uA.value = 1; o.m.material.uniforms.uLen.value = a.distanceTo(b);
    o.t = o.ml = life || 0.15; o.m.visible = true; o.w = width || 0.1;
    return o;
  };
  // a ward on something, struck: hit = where (a ripple of bent air and a few sparks there, nothing drawn over the rest of it); with no
  // point (it is raised, it breaks), only a faint shimmer at its rim, the outline of what it guards
  FX.ripple = function (p, nrm, size, color) {
    const o = pools.ripple.find((x) => x.t <= 0) || pools.ripple[0];
    o.m.position.copy(p).addScaledVector(nrm, 0.02); o.m.lookAt(p.x + nrm.x, p.y + nrm.y, p.z + nrm.z); o.m.scale.setScalar(size || 1);
    FX.tone(color || 0xd0d8e0, o.m.material.uniforms.uC.value); o.t = o.ml = 0.3; o.m.visible = true;
  };
  FX.bubble = function (pos, r, color, follow, hit) {
    if (hit) { const nrm = new THREE.Vector3().subVectors(hit, pos); if (nrm.lengthSq() < 1e-6) nrm.set(0, 1, 0); nrm.normalize(); FX.ripple(pos.clone().addScaledVector(nrm, r), nrm, Math.min(1.4, 0.5 + r * 0.4), color); FX.sparks(pos.clone().addScaledVector(nrm, r), nrm, 3, 0xffe0c0, 3); return; }
    const o = pools.bubble.find((x) => x.t <= 0) || pools.bubble[0];
    o.m.position.copy(pos); o.m.scale.setScalar(r); o.r = r;
    FX.tone(color || 0xbfe2ff, o.m.material.uniforms.uC.value);
    o.t = o.ml = 0.22; o.m.visible = true; o.follow = follow || null;
  };
  FX.debris = function (p, mat, count, size, speed) {
    for (let i = 0; i < (count || 6); i++) {
      const d = pools.debris.find((x) => x.t <= 0);
      if (!d) return;
      const s = (size || 0.15) * (0.5 + Math.random());
      d.m.material = mat; d.m.scale.set(s, s * (0.5 + Math.random() * 0.8), s * (0.6 + Math.random() * 0.6));
      d.m.position.set(p.x + rs(0.3), p.y + rs(0.3), p.z + rs(0.3));
      d.v.set(rs(1), Math.random() * 1.2 + 0.4, rs(1)).multiplyScalar(speed || 5);
      d.av.set(rs(10), rs(10), rs(10));
      d.t = 2.5 + Math.random(); d.m.visible = true;
      d.floor = G.world ? G.world.floorBelow(p.x, p.y + 0.5, p.z) : 0;
    }
  };

  // a spent case thrown out of the gun: p where, v how (the gun's right and up), kind 'rifle' | 'small' | 'shell'
  const CASE_LEN = { rifle: 0.03, small: 0.016, shell: 0.046 };
  FX.casing = function (p, v, kind) {
    if (!pools.casing) return;
    const d = pools.casing[pools.casingIdx++ % pools.casing.length], L = CASE_LEN[kind] || CASE_LEN.rifle;
    d.a.geometry = kind === 'shell' ? d.cg.head : kind === 'small' ? d.cg.small : d.cg.rifle; d.b.visible = kind === 'shell';
    d.m.scale.setScalar(L); d.m.position.copy(p); d.m.rotation.set(rs(0.5), rs(3.1), Math.PI / 2 + rs(0.5));
    d.v.copy(v); d.av.set(rs(14), rs(8), rs(22));
    d.t = 3 + Math.random(); d.hits = 0; d.m.visible = true; d.r = L * (kind === 'small' ? 0.22 : 0.13);
    d.floor = G.world ? G.world.floorBelow(p.x, p.y + 0.3, p.z) : 0;
  };

  // ---------------- DOM damage numbers ----------------
  const tmpV = new THREE.Vector3();
  FX.project = function (p, out) {
    tmpV.copy(p).project(camera);
    if (tmpV.z > 1) return false;
    out.x = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
    return tmpV.z < 1 && out.x > -50 && out.x < window.innerWidth + 50 && out.y > -50 && out.y < window.innerHeight + 50;
  };
  let dnCount = 0;
  FX.dmgNum = function (p, value, cls) {
    if (!G.save.data.settings.dmgNums) return;
    if (dnCount > 40) return;
    const o = {};
    if (!FX.project(p, o)) return;
    const el = document.createElement('div');
    el.className = 'dnum ' + (cls || '');
    el.textContent = typeof value === 'number' ? Math.max(1, Math.round(value)) : value;
    el.style.left = o.x + rs(14) + 'px'; el.style.top = o.y + rs(8) + 'px';
    el.style.setProperty('--dx', rs(26) + 'px');
    FX.world.appendChild(el);
    dnCount++;
    setTimeout(() => { el.remove(); dnCount--; }, 820);
  };

  // ---------------- update ----------------
  FX.update = function (dt, cam, renderer) {
    if (G.GrenFX) G.GrenFX.update(dt);
    if (G.vfx && G.vfx.update) G.vfx.update(dt);
    const h = renderer.domElement.height;
    const sc = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
    const sys = FX._sys || (FX._sys = [FX.add, FX.flame, FX.norm]);
    for (let i = 0; i < 3; i++) { const s = sys[i]; s.mat.uniforms.uScale.value = sc; s.update(dt); }
    FX.streak.update(dt); FX.drops.update(dt); FX.arc.update(dt); SU.uT.value += dt;
    for (const t of pools.tracer) if (t.t > 0) {
      t.t -= dt; const k = Math.min(1, 1 - t.t / t.ml);
      if (t.d && !t.still) { const head = t.len * Math.min(1, k * 1.12 + 0.12), st = Math.min(t.streak, head); t.m.position.copy(t.a).addScaledVector(t.d, head); t.m.scale.set(t.w, t.w, Math.max(0.001, st)); }
      t.m.material.opacity = t.still ? 1 - k : 1 - k * k * k; if (t.t <= 0) t.m.visible = false;
    }
    for (const d of pools.decal) if (d.m.visible) { d.t -= dt; if (d.t <= 0) d.m.visible = false; else if (d.t < 4 && d.op !== undefined) d.m.material.opacity = d.op * d.t / 4; }
    for (let i = FX.shocks.length - 1; i >= 0; i--) { const o = FX.shocks[i]; if (o.dead) { FX.shocks.splice(i, 1); continue; } o.life -= dt; if (o.life <= 0) { o.dispose(); FX.shocks.splice(i, 1); } }
    for (const r of pools.ring) if (r.t > 0) {
      r.t -= dt; FX.ringStep(r, Math.min(1, 1 - r.t / r.ml)); if (r.t <= 0) r.m.visible = false;
    }
    for (const pool of [pools.tele, pools.teleL]) for (const o of pool) if (o.active) {
      o.t += dt; const u = o.m.material.uniforms;
      if (o.follow) o.m.position.set(o.follow.x, o.follow.y + 0.06, o.follow.z);
      u.uK.value = Math.min(1, o.t / o.ml); u.uA.value = Math.min(1, o.t / 0.08);
      if (o.t > o.ml + 0.05) { o.active = false; o.m.visible = false; }
    }
    for (const b of pools.beam) if (b.t > 0) {
      b.t -= dt; b.m.material.uniforms.uA.value = Math.max(0, b.t / b.ml);
      const w = b.w * (0.94 + 0.06 * Math.random()); b.m.scale.x = b.m.scale.y = w;
      if (b.t <= 0) b.m.visible = false;
    }
    for (const o of pools.ripple) if (o.t > 0) { o.t -= dt; const u = o.m.material.uniforms; u.uK.value = Math.min(1, 1 - o.t / o.ml); u.uA.value = 1; if (o.t <= 0) o.m.visible = false; }
    for (const b of pools.bubble) if (b.t > 0) {
      b.t -= dt; const k = b.t / b.ml;
      b.m.material.uniforms.uA.value = k;
      b.m.scale.setScalar(b.r * (1 + (1 - k) * 0.15));
      if (b.follow) b.m.position.copy(b.follow);
      if (b.t <= 0) b.m.visible = false;
    }
    for (const d of pools.debris) if (d.t > 0) {
      d.t -= dt;
      d.v.y -= 18 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.av.x * dt; d.m.rotation.y += d.av.y * dt; d.m.rotation.z += d.av.z * dt;
      if (d.m.position.y < d.floor + d.m.scale.y * 0.5) { d.m.position.y = d.floor + d.m.scale.y * 0.5; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; d.av.multiplyScalar(0.6); }
      if (d.t < 0.5) d.m.scale.multiplyScalar(1 - dt * 3);
      if (d.t <= 0) d.m.visible = false;
    }
    for (const d of pools.casing) if (d.t > 0) {
      d.t -= dt;
      if (d.hits < 3) {
        d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt);
        d.m.rotation.x += d.av.x * dt; d.m.rotation.y += d.av.y * dt; d.m.rotation.z += d.av.z * dt;
        if (d.m.position.y < d.floor + d.r) {   // (it rings on the floor, skips twice, and lies on its side)
          d.m.position.y = d.floor + d.r; d.hits++;
          if (d.hits >= 3 || Math.abs(d.v.y) < 0.5) { d.hits = 3; d.m.rotation.x = 0; d.m.rotation.z = Math.PI / 2; }
          else { d.v.y *= -0.38; d.v.x = d.v.x * 0.55 + rs(0.3); d.v.z = d.v.z * 0.55 + rs(0.3); d.av.multiplyScalar(0.5); }
        }
      }
      if (d.t < 0.4) d.m.scale.multiplyScalar(Math.max(0, 1 - dt * 4));
      if (d.t <= 0) d.m.visible = false;
    }
    for (const f of pools.flash) if (f.t > 0) { f.t -= dt; f.l.intensity = f.i0 * Math.max(0, f.t / f.ml); if (f.t <= 0) f.l.intensity = 0; }
  };
})();
