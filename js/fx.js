'use strict';
// Visual effects: GPU point particles, tracers, decals, rings, beams, debris, flash lights, damage numbers.
(function () {
  const FX = (G.fx = {});
  let scene, camera;
  const V3 = () => new THREE.Vector3();

  // ---------------- particles ----------------
  const VS = `
    attribute float aSize; attribute vec4 aColor;
    varying vec4 vColor; varying float vDepth;
    uniform float uScale;
    void main(){
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vDepth = -mv.z;
      gl_PointSize = aSize * uScale / max(0.1, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const FS_ADD = `
    uniform sampler2D map; uniform float uFogD; varying vec4 vColor; varying float vDepth;
    void main(){
      vec4 t = texture2D(map, gl_PointCoord);
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      float a = t.a * vColor.a * fogv;
      gl_FragColor = vec4(vColor.rgb * t.rgb * a, a);
    }`;
  const FS_NORM = `
    uniform sampler2D map; uniform float uFogD; uniform vec3 uFogC; varying vec4 vColor; varying float vDepth;
    void main(){
      vec4 t = texture2D(map, gl_PointCoord);
      float fogv = exp(-uFogD * uFogD * vDepth * vDepth);
      vec3 c = mix(uFogC, vColor.rgb * t.rgb, fogv);
      gl_FragColor = vec4(c, t.a * vColor.a);
      if (gl_FragColor.a < 0.01) discard;
    }`;
  class PSys {
    constructor(max, additive, tex) {
      this.max = max; this.n = 0;
      this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
      this.life = new Float32Array(max); this.ml = new Float32Array(max);
      this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
      this.c = new Float32Array(max * 4); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
      this.c1 = new Float32Array(max * 3);
      const g = new THREE.BufferGeometry();
      this.pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3); this.pos.setUsage(THREE.DynamicDrawUsage);
      this.col = new THREE.BufferAttribute(new Float32Array(max * 4), 4); this.col.setUsage(THREE.DynamicDrawUsage);
      this.siz = new THREE.BufferAttribute(new Float32Array(max), 1); this.siz.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.pos); g.setAttribute('aColor', this.col); g.setAttribute('aSize', this.siz);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: tex }, uScale: { value: 400 }, uFogD: { value: 0.02 }, uFogC: { value: new THREE.Color() } },
        vertexShader: VS, fragmentShader: additive ? FS_ADD : FS_NORM,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.pts = new THREE.Points(g, this.mat);
      this.pts.frustumCulled = false; this.pts.renderOrder = additive ? 10 : 9;
      g.setDrawRange(0, 0);
    }
    spawn(x, y, z, vx, vy, vz, life, s0, s1, r, gg, b, a, grav, drag, r1, g1, b1) {
      let i = this.n;
      if (i >= this.max) { i = Math.floor(Math.random() * this.max); } else this.n++;
      const i3 = i * 3, i4 = i * 4;
      this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z;
      this.v[i3] = vx; this.v[i3 + 1] = vy; this.v[i3 + 2] = vz;
      this.life[i] = life; this.ml[i] = life; this.s0[i] = s0; this.s1[i] = s1;
      this.c[i4] = r; this.c[i4 + 1] = gg; this.c[i4 + 2] = b; this.c[i4 + 3] = a;
      this.c1[i3] = r1 ?? r; this.c1[i3 + 1] = g1 ?? gg; this.c1[i3 + 2] = b1 ?? b;
      this.grav[i] = grav || 0; this.drag[i] = drag || 0;
    }
    update(dt) {
      const P = this.p, Vv = this.v, pa = this.pos.array, ca = this.col.array, sa = this.siz.array;
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
      }
      this._had = this.n > 0;
    }
    clear() { this.n = 0; this.pts.geometry.setDrawRange(0, 0); }
  }

  const pools = {};
  FX.init = function (sc, cam) {
    scene = sc; camera = cam;
    FX.add = new PSys(4000, true, G.Tex.spr.soft);
    FX.flame = new PSys(2500, true, G.Tex.spr.flame);
    FX.norm = new PSys(3000, false, G.Tex.spr.smoke);
    scene.add(FX.add.pts, FX.flame.pts, FX.norm.pts);

    // tracers
    pools.tracer = [];
    const tg = new THREE.BoxGeometry(1, 1, 1); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 100; i++) {
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
    FX.dmats = dmats;
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(dg, dmats.hole); m.visible = false; m.renderOrder = 2; scene.add(m);
      pools.decal.push({ m, t: 0 });
    }
    // splat materials per color cached
    FX.splatMats = {};
    // rings / telegraphs
    pools.ring = [];
    const rg = new THREE.PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: G.Tex.spr.ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
      m.visible = false; m.renderOrder = 5; scene.add(m); pools.ring.push({ m, t: 0, ml: 1 });
    }
    pools.tele = [];
    for (let i = 0; i < 24; i++) {
      const outer = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: G.Tex.spr.ring, transparent: true, depthWrite: false, color: 0xc02010, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
      const inner = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: G.Tex.spr.disc, transparent: true, depthWrite: false, color: 0xa01808, opacity: 0.35, polygonOffset: true, polygonOffsetFactor: -2 }));
      outer.visible = inner.visible = false; outer.renderOrder = inner.renderOrder = 4; scene.add(outer, inner);
      pools.tele.push({ outer, inner, t: 0, ml: 1, active: false });
    }
    // line telegraphs (a lane on the floor: fissures, shock lines, beams)
    pools.teleL = [];
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: 0xc02010, opacity: 0.3, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.visible = false; m.renderOrder = 4; m.frustumCulled = false; scene.add(m);
      pools.teleL.push({ m, t: 0, ml: 1, active: false });
    }
    // beams
    pools.beam = [];
    const bg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); bg.rotateX(Math.PI / 2); bg.translate(0, 0, -0.5);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xff6040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m); pools.beam.push({ m, t: 0, ml: 0 });
    }
    // shield bubbles (fresnel)
    pools.bubble = [];
    const sg = new THREE.SphereGeometry(1, 24, 16);
    const bmat = () => new THREE.ShaderMaterial({
      uniforms: { uC: { value: new THREE.Color(0xbfe2ff) }, uA: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uC; uniform float uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)), 2.5); gl_FragColor = vec4(uC*f*uA*1.4, f*uA); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(sg, bmat()); m.visible = false; scene.add(m); pools.bubble.push({ m, t: 0, ml: 0.25, follow: null }); }
    // debris
    pools.debris = [];
    const dbg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(dbg, null); m.visible = false; m.castShadow = false; scene.add(m);
      pools.debris.push({ m, v: V3(), av: V3(), t: 0, floor: 0 });
    }
    // flash lights (constant count => no shader recompiles)
    pools.flash = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffb060, 0, 14, 2); scene.add(l); pools.flash.push({ l, t: 0, ml: 0, i0: 0 }); }
    pools.flashIdx = 0;
    FX.world = document.getElementById('worldui');
  };

  FX.setFog = function (color, density) {
    for (const s of [FX.add, FX.flame, FX.norm]) { s.mat.uniforms.uFogD.value = density; s.mat.uniforms.uFogC.value.set(color); }
  };
  FX.clear = function () {
    FX.add.clear(); FX.flame.clear(); FX.norm.clear();
    for (const d of pools.decal) d.m.visible = false;
    for (const t of pools.tele) { t.outer.visible = t.inner.visible = false; t.active = false; }
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
      FX.add.spawn(p.x, p.y, p.z, vx, vy, vz, 0.18 + Math.random() * 0.3, 0.06, 0.01, c.r * 1.5, c.g * 1.4, c.b * 1.2, 1, 14, 1.5);
    }
  };
  FX.dust = function (p, n, color, amount) {
    const c = rgb(color || 0x8a8070);
    amount = amount || 4;
    for (let i = 0; i < amount; i++) {
      FX.norm.spawn(p.x, p.y, p.z, (n ? n.x : 0) * 1.5 + rs(0.6), (n ? n.y : 0) * 1.5 + rs(0.5) + 0.3, (n ? n.z : 0) * 1.5 + rs(0.6), 0.6 + Math.random() * 0.6, 0.15, 0.6 + Math.random() * 0.4, c.r, c.g, c.b, 0.55, -0.2, 2.5);
    }
    // chips
    for (let i = 0; i < amount; i++) FX.norm.spawn(p.x, p.y, p.z, (n ? n.x : 0) * 3 + rs(2), (n ? n.y : 0) * 3 + Math.random() * 2, (n ? n.z : 0) * 3 + rs(2), 0.5, 0.05, 0.04, c.r * 0.6, c.g * 0.6, c.b * 0.6, 1, 12, 0.5);
  };
  FX.blood = function (p, d, color, amount) {
    const c = rgb(color || 0x7a1010);
    amount = amount || 8;
    for (let i = 0; i < amount; i++) {
      const s = 1.5 + Math.random() * 3;
      FX.norm.spawn(p.x, p.y, p.z, (d ? d.x : 0) * s + rs(1.5), (d ? d.y : 0) * s + rs(1) + 1, (d ? d.z : 0) * s + rs(1.5), 0.35 + Math.random() * 0.4, 0.09, 0.05, c.r, c.g, c.b, 0.95, 9.8, 0.5);
    }
    FX.norm.spawn(p.x, p.y, p.z, 0, 0.2, 0, 0.4, 0.2, 0.7, c.r * 0.8, c.g * 0.8, c.b * 0.8, 0.5, 0, 2);
  };
  FX.smoke = function (p, amount, size, color, rise, life) {
    const c = rgb(color || 0x3a3632);
    for (let i = 0; i < (amount || 6); i++) {
      FX.norm.spawn(p.x + rs(0.3), p.y + rs(0.3), p.z + rs(0.3), rs(0.8), (rise ?? 1) * (0.5 + Math.random()), rs(0.8), (life || 1.6) * (0.7 + Math.random() * 0.6), (size || 1) * 0.5, (size || 1) * (1.8 + Math.random()), c.r, c.g, c.b, 0.5, -0.3, 1.2);
    }
  };
  // a single flame lick (call repeatedly for torches)
  FX.flameLick = function (x, y, z, s, color) {
    const c = rgb(color || 0xff9a40);
    FX.flame.spawn(x + rs(0.05 * s), y, z + rs(0.05 * s), rs(0.15), 0.9 + Math.random() * 0.6, rs(0.15), 0.35 + Math.random() * 0.25, 0.32 * s, 0.08 * s, c.r * 1.4, c.g * 1.2, c.b, 0.9, -0.6, 1.5, c.r * 1.2, c.g * 0.5, c.b * 0.2);
    if (Math.random() < 0.08) FX.add.spawn(x, y + 0.1, z, rs(0.4), 1.2 + Math.random(), rs(0.4), 0.8 + Math.random() * 0.6, 0.03, 0.01, 1.5, 0.8, 0.3, 1, -0.2, 0.3);
    if (Math.random() < 0.06) FX.norm.spawn(x, y + 0.4 * s, z, rs(0.1), 0.6, rs(0.1), 1.5, 0.15 * s, 0.6 * s, 0.1, 0.09, 0.08, 0.25, -0.1, 0.5);
  };
  FX.fireBurst = function (p, r, color) {
    const c = rgb(color || 0xff8a3a);
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28, d = Math.random() * r;
      FX.flame.spawn(p.x + Math.cos(a) * d, p.y + Math.random() * 0.5, p.z + Math.sin(a) * d, rs(0.5), 1.5 + Math.random() * 2, rs(0.5), 0.4 + Math.random() * 0.4, 0.6, 0.2, c.r * 1.3, c.g * 1.1, c.b, 0.85, -1, 1, c.r, c.g * 0.4, c.b * 0.2);
    }
  };
  FX.explosion = function (p, r, color, opts) {
    opts = opts || {};
    const c = rgb(color || 0xff9a40);
    const k = Math.max(0.4, r / 4);
    // core flash & fireball
    for (let i = 0; i < 28 * k; i++) {
      const dir = new THREE.Vector3(rs(1), rs(1) * 0.7 + 0.3, rs(1)).normalize();
      const s = r * (1.5 + Math.random() * 2.5);
      FX.flame.spawn(p.x, p.y, p.z, dir.x * s, dir.y * s, dir.z * s, 0.35 + Math.random() * 0.35, r * 0.45, r * 0.15, c.r * 1.6, c.g * 1.3, c.b * 1.1, 1, -1, 5, c.r * 0.9, c.g * 0.3, c.b * 0.1);
    }
    FX.add.spawn(p.x, p.y, p.z, 0, 0, 0, 0.18, r * 1.6, r * 2.2, 1.6, 1.3, 1.0, 1, 0, 0);
    // smoke
    if (!opts.noSmoke) for (let i = 0; i < 14 * k; i++) {
      const dir = new THREE.Vector3(rs(1), Math.random() * 0.8 + 0.2, rs(1)).normalize();
      const s = r * (0.5 + Math.random());
      FX.norm.spawn(p.x, p.y, p.z, dir.x * s, dir.y * s, dir.z * s, 1.4 + Math.random() * 1.4, r * 0.4, r * 1.2, 0.12, 0.11, 0.1, 0.6, -0.4, 1.8);
    }
    // sparks/embers
    FX.sparks(p, null, Math.floor(20 * k), 0xffa050, 14 * k);
    FX.ring(p, r * 1.1, color || 0xffa060, 0.35);
    FX.flash(p, color || 0xff9a40, 60 * k, 0.25, r * 4);
    if (opts.decal !== false) FX.decal(new THREE.Vector3(p.x, p.y - 0.1, p.z), new THREE.Vector3(0, 1, 0), 'scorch', r * 1.4, true);
  };
  FX.flash = function (p, color, intensity, dur, dist) {
    const f = pools.flash[pools.flashIdx++ % pools.flash.length];
    f.l.position.copy(p); f.l.color.set(color || 0xffb060); f.l.distance = dist || 12;
    f.i0 = (intensity || 30) * (G.LIGHT_K || 1); f.l.intensity = f.i0; f.t = dur || 0.08; f.ml = f.t;
  };
  FX.tracer = function (a, b, color, width, life) {
    const t = pools.tracer.find((x) => x.t <= 0) || pools.tracer[0];
    const m = t.m;
    m.position.copy(a);
    const len = a.distanceTo(b);
    m.lookAt(b);
    m.scale.set(width || 0.025, width || 0.025, len);
    m.material.color.set(color || 0xffd8a0);
    m.material.opacity = 1;
    m.visible = true; t.t = t.ml = life || 0.06;
  };
  // a tracer that covers exactly the stretch a -> b (FX.tracer's box grows from its first point AWAY from the second one)
  FX.seg = function (a, b, color, width, life) { FX.tracer(b, b.clone().multiplyScalar(2).sub(a), color, width, life); };
  FX.lightning = function (a, b, color) {
    const segs = 7;
    let prev = a.clone();
    const dir = b.clone().sub(a);
    const len = dir.length();
    for (let i = 1; i <= segs; i++) {
      const p = a.clone().addScaledVector(dir, i / segs);
      if (i < segs) { p.x += rs(len * 0.07); p.y += rs(len * 0.07); p.z += rs(len * 0.07); }
      FX.seg(prev, p, color || 0xcfe0ff, 0.045, 0.12);
      prev = p;
    }
    FX.flash(b, color || 0xbfd8ff, 25, 0.1, 8);
    FX.sparks(b, null, 6, color || 0xcfe0ff, 6);
  };
  // a lightning bolt that comes down from the sky onto `p` (electric weapons): jagged main bolt with a side branch, flash, shock ring, sparks.
  // limited to a few per second so a rapid-fire arc gun does not turn the screen white
  let strikeT = 0;
  FX.strike = function (p, color, big) {
    const now = performance.now();
    if (now - strikeT < (big ? 120 : 260)) return;
    strikeT = now;
    const col = color || 0xcfe0ff, H = big ? 14 : 11; // (indoor vaults are 16 m high: the bolt stays below the ceiling)
    let prev = p.clone().add(new THREE.Vector3(rs(1.5), H, rs(1.5)));
    const segs = 8;
    for (let i = 1; i <= segs; i++) {
      const q = p.clone(); q.y = p.y + H * (1 - i / segs);
      if (i < segs) { q.x += rs(1.1 * (1 - i / segs) + 0.2); q.z += rs(1.1 * (1 - i / segs) + 0.2); }
      FX.seg(prev, q, 0xffffff, big ? 0.11 : 0.075, 0.2);
      FX.seg(prev, q, col, big ? 0.24 : 0.17, 0.2); // a wider, coloured glow around the white core
      if (i === 4 || i === 6) { const br = q.clone().add(new THREE.Vector3(rs(3), -rs(2) - 1.5, rs(3))); FX.seg(q, br, col, 0.05, 0.14); }
      prev = q;
    }
    FX.flash(p.clone().add(new THREE.Vector3(0, 1, 0)), col, big ? 90 : 55, 0.18, big ? 22 : 15);
    FX.ring(p, big ? 3.2 : 2.0, col, 0.3);
    FX.sparks(p, null, big ? 16 : 9, col, 8);
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
    d.t = d.ml = kind === 'hole' ? 20 : kind === 'scorch' ? 12 : kind === 'crack' ? 14 : 22;
  };
  FX.ring = function (p, r, color, dur, opts) {
    const o = pools.ring.find((x) => x.t <= 0) || pools.ring[0];
    o.m.position.set(p.x, p.y + 0.08, p.z);
    o.m.material.color.set(color || 0xffffff);
    o.m.material.opacity = 1;
    o.r = r; o.t = o.ml = dur || 0.4; o.start = (opts && opts.start) || 0.1;
    o.m.scale.setScalar(0.01); o.m.visible = true;
  };
  // ground telegraph: grows to radius r over dur, returns handle with .done
  FX.telegraph = function (p, r, dur, color) {
    const o = pools.tele.find((x) => !x.active) || pools.tele[0];
    o.active = true; o.t = 0; o.ml = dur; o.r = r;
    o.outer.position.set(p.x, p.y + 0.06, p.z); o.inner.position.set(p.x, p.y + 0.07, p.z);
    o.outer.scale.setScalar(r * 2); o.inner.scale.setScalar(0.01);
    o.outer.material.color.set(color || 0xc02010); o.inner.material.color.set(color || 0xa01808);
    o.outer.visible = o.inner.visible = true;
    o.follow = null;
    return o;
  };
  // a lane from a to b, `width` wide, filling in over `dur` seconds
  FX.teleLine = function (a, b, width, dur, color) {
    const o = pools.teleL.find((x) => !x.active) || pools.teleL[0];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 0.01;
    o.active = true; o.t = 0; o.ml = dur;
    o.m.position.set((a.x + b.x) / 2, (a.y || 0) + 0.07, (a.z + b.z) / 2);
    o.m.rotation.set(0, Math.atan2(dx, dz), 0); o.m.scale.set(width, 1, len);
    o.m.material.color.set(color || 0xc02010); o.m.material.opacity = 0.12; o.m.visible = true;
    return o;
  };
  FX.endTeleLine = function (o) { if (o) { o.active = false; o.m.visible = false; } };
  FX.clearTelegraphs = function () { for (const t of pools.teleL) { t.m.visible = false; t.active = false; } for (const t of pools.tele) { t.outer.visible = t.inner.visible = false; t.active = false; } };
  FX.endTelegraph = function (o) { if (o) { o.active = false; o.outer.visible = o.inner.visible = false; } };
  FX.beam = function (a, b, color, width, life) {
    const o = pools.beam.find((x) => x.t <= 0) || pools.beam[0];
    o.m.position.copy(a); o.m.lookAt(b);
    o.m.scale.set(width || 0.1, width || 0.1, a.distanceTo(b));
    o.m.material.color.set(color || 0xff6040); o.m.material.opacity = 1;
    o.t = o.ml = life || 0.15; o.m.visible = true; o.w = width || 0.1;
    return o;
  };
  FX.bubble = function (pos, r, color, follow) {
    const o = pools.bubble.find((x) => x.t <= 0) || pools.bubble[0];
    o.m.position.copy(pos); o.m.scale.setScalar(r); o.r = r;
    o.m.material.uniforms.uC.value.set(color || 0xbfe2ff);
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
    const h = renderer.domElement.height;
    const sc = h * 0.5 / Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
    const sys = FX._sys || (FX._sys = [FX.add, FX.flame, FX.norm]);
    for (let i = 0; i < 3; i++) { const s = sys[i]; s.mat.uniforms.uScale.value = sc; s.update(dt); }
    for (const t of pools.tracer) if (t.t > 0) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / t.ml); if (t.t <= 0) t.m.visible = false; }
    for (const d of pools.decal) if (d.m.visible) { d.t -= dt; if (d.t <= 0) d.m.visible = false; else if (d.t < 4 && d.op !== undefined) d.m.material.opacity = d.op * d.t / 4; }
    for (const r of pools.ring) if (r.t > 0) {
      r.t -= dt; const k = 1 - r.t / r.ml;
      r.m.scale.setScalar(Math.max(0.01, r.r * 2 * (r.start + (1 - r.start) * (1 - Math.pow(1 - k, 2)))));
      r.m.material.opacity = 1 - k; if (r.t <= 0) r.m.visible = false;
    }
    for (const o of pools.tele) if (o.active) {
      o.t += dt; const k = Math.min(1, o.t / o.ml);
      if (o.follow) { o.outer.position.set(o.follow.x, o.follow.y + 0.06, o.follow.z); o.inner.position.set(o.follow.x, o.follow.y + 0.07, o.follow.z); }
      o.inner.scale.setScalar(Math.max(0.01, o.r * 2 * k));
      o.outer.material.opacity = 0.6 + 0.4 * Math.sin(o.t * 20);
      if (o.t > o.ml + 0.05) FX.endTelegraph(o);
    }
    for (const o of pools.teleL) if (o.active) {
      o.t += dt; const k = Math.min(1, o.t / o.ml);
      o.m.material.opacity = 0.14 + 0.5 * k * k + 0.12 * Math.sin(o.t * 22);
      if (o.t > o.ml + 0.05) FX.endTeleLine(o);
    }
    for (const b of pools.beam) if (b.t > 0) {
      b.t -= dt; b.m.material.opacity = Math.max(0, b.t / b.ml);
      const w = b.w * (0.7 + 0.3 * Math.random()); b.m.scale.x = b.m.scale.y = w;
      if (b.t <= 0) b.m.visible = false;
    }
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
    for (const f of pools.flash) if (f.t > 0) { f.t -= dt; f.l.intensity = f.i0 * Math.max(0, f.t / f.ml); if (f.t <= 0) f.l.intensity = 0; }
  };
})();
