'use strict';
// The water of the fields, alive: what touches it makes it move and sound like water.
//  - ripples: a step, a landing, a shot, a blast, a foe wading, a drip from the vault, the foot of a fall: each starts a ring on the
//    surface (textures.js waterize draws them from T.waterU.uRip, a ring buffer of 16)
//  - splashes: droplets thrown up and falling back, a crown, a puff of mist; a blast throws up a column
//  - the area's current (the flooded halls run toward their gates, the village stream runs across): T.waterU.uFlow
//  - sound: your feet in the water (audio.js step 'water'), wading, splashes; the roar of the falls, the stream's babble, the lap of a
//    pool near you (one bed each in audio.js, its level and side set from here a few times a second)
// Only looks and sound: what the water does in the fight (slow, the water element) is fields.js / element.js.
(function () {
  const U = G.U, V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const R = Math.random, rnd = (a, b) => a + R() * (b - a);
  const Wt = (G.Water = { falls: [], streams: [], zones: [] });
  let ri = 0, sndT = 0, wadeT = 0, dripT = 0, fallT = 0;
  const foeT = new WeakMap();
  const U2 = () => G.Tex && G.Tex.waterU;

  // ---------------------------------------------------------------- the area
  Wt.build = function (w) {
    const u = U2(); if (!u) return;
    for (const v of u.uRip.value) v.set(0, 0, -99, 0);
    // the current: set by the generator (w.waterFlow), or read from the old drifting-ripple animation of the flooded halls
    let fx = 0, fz = 0;
    if (w && w.waterFlow) { fx = w.waterFlow.x; fz = w.waterFlow.z; }
    else if (w) for (const a of w.animated || []) if (a.kind === 'uvflow' && a.sp) { fx = a.sp[0] * 7; fz = a.sp[1] * 7; }
    u.uFlow.value.set(fx, fz);
    Wt.zones = (w && w.waterZones) || [];
    Wt.falls = (w && w.waterfalls) || [];
    Wt.streams = (w && w.streams) || [];
    Wt.flooded = !!(w && w.biome === 'flooded');
    uwReset(); // (a new place: whatever was under the water before is gone, its fog with it)
    if (w && w.mats && w.mats.water) w.mats.water.visible = true;
    // (water under a roof - the frozen hall's lake, w.waterRoofed - mirrors the dark vault over it: the room's light-map, whose warm band
    // reads as an evening sky in a glancing look over the water, is all but taken off it there)
    if (w && w.mats && w.mats.water) w.mats.water.envMapIntensity = w.waterRoofed ? 0.06 : 1;
    // the surface seen from below on low quality: a dim shifting sheet over your head (the water's own plane is drawn from above only;
    // with the frame passes, post.js draws it); and the specks that drift in the water
    if (w && w.deepWater) {
      for (const d of w.deepWater) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(d.x1 - d.x0, d.z1 - d.z0), new THREE.MeshBasicMaterial({ color: 0x4a7a72, map: (w.mats.water && w.mats.water.map) || null, transparent: true, opacity: 0.3, depthWrite: false }));
        m.rotation.x = Math.PI / 2; m.position.set((d.x0 + d.x1) / 2, d.y - 0.015, (d.z0 + d.z1) / 2); m.userData.noAudit = true; m.renderOrder = 2;
        m.visible = !(G.Post && G.Post.active); w.group.add(m); UW.sheets.push(m);
      }
      UW.motes = motes(w);
    }
  };
  // is p in the water (inside a pool, near its surface)? returns the pool
  Wt.at = function (p, below, above) {
    for (const z of Wt.zones) if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < (z.y || 0) + (above ?? 0.35) && p.y > (z.y || 0) - (below ?? 0.45) - (z.deep || 0)) return z; // (z.deep: water that deep over its bed)
    return null;
  };
  const surfY = (z) => (z && z.y ? z.y : 0) + 0.06;
  // a ring on the surface at (x, z), s: how strong (0.3 a toe, 1 a landing, 1.5 a blast)
  Wt.ripple = function (x, z, s) {
    const u = U2(); if (!u) return;
    const v = u.uRip.value[ri]; ri = (ri + 1) % u.uRip.value.length;
    v.set(x, z, G.Tex.lavaT.value, Math.min(1.6, s ?? 0.6));
  };

  // ---------------------------------------------------------------- splashes
  // droplets thrown up and out, a crown round the spot, mist; size 0..1.5
  Wt.splash = function (p, size, o) {
    o = o || {};
    size = size ?? 0.6;
    const z = Wt.at(p, 1.2, 1.2), y = z ? surfY(z) : p.y + 0.05, x = p.x, zz = p.z, N = G.fx.norm;
    const n = Math.round(6 + size * 26);
    for (let i = 0; i < n; i++) {
      const a = R() * 6.28, sp = rnd(0.6, 2.4) * (0.6 + size), up = rnd(1.6, 4.2) * (0.6 + size * 0.7);
      N.spawn(x + Math.cos(a) * 0.1, y + 0.02, zz + Math.sin(a) * 0.1, Math.cos(a) * sp, up, Math.sin(a) * sp, rnd(0.45, 0.85), rnd(0.045, 0.08), 0.025, 0.82, 0.9, 0.95, 0.9, 9.8, 0.4);
    }
    // the crown: a ring of drops thrown outward low, all round
    if (size > 0.45) for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28 + R() * 0.3, sp = (1.6 + size * 1.6); N.spawn(x + Math.cos(a) * 0.3, y + 0.05, zz + Math.sin(a) * 0.3, Math.cos(a) * sp, rnd(1.2, 2.2) * (0.6 + size * 0.5), Math.sin(a) * sp, rnd(0.35, 0.55), 0.07, 0.03, 0.88, 0.94, 0.97, 0.85, 9.8, 0.6); }
    // a column straight up (a shot strikes, a blast throws the water high)
    if (o.column) for (let i = 0; i < 10 + size * 18; i++) N.spawn(x + rnd(-0.15, 0.15) * (1 + size), y, zz + rnd(-0.15, 0.15) * (1 + size), rnd(-0.6, 0.6), rnd(4, 7) * (0.5 + size * 0.6), rnd(-0.6, 0.6), rnd(0.6, 1.1), rnd(0.06, 0.12), 0.04, 0.86, 0.93, 0.97, 0.9, 9.8, 0.25);
    // mist
    for (let i = 0; i < 2 + size * 4; i++) N.spawn(x + rnd(-0.3, 0.3), y + 0.15, zz + rnd(-0.3, 0.3), rnd(-0.4, 0.4), rnd(0.3, 0.9), rnd(-0.4, 0.4), rnd(0.7, 1.3), 0.3 + size * 0.25, 1.0 + size * 0.9, 0.86, 0.92, 0.96, 0.28, -0.1, 1.2);
    Wt.ripple(x, zz, 0.55 + size * 0.6);
    if (size > 0.9) setTimeout(() => Wt.ripple(x, zz, size * 0.5), 140); // (a big one: a second ring after the first)
    if (!o.silent && G.sfx.splash) G.sfx.splash(V(x, y, zz), size);
  };
  // a step of yours in the water (player.js): a ring and a few drops at your feet (the sound is the step's own)
  Wt.step = function (p, k) {
    const z = Wt.at(p); if (!z) return;
    const y = surfY(z), N = G.fx.norm;
    for (let i = 0; i < 4 + k * 6; i++) { const a = R() * 6.28, sp = rnd(0.4, 1.3); N.spawn(p.x + Math.cos(a) * 0.15, y + 0.02, p.z + Math.sin(a) * 0.15, Math.cos(a) * sp, rnd(1.2, 2.6) * (0.6 + k * 0.5), Math.sin(a) * sp, rnd(0.35, 0.6), rnd(0.04, 0.065), 0.02, 0.84, 0.92, 0.96, 0.85, 9.8, 0.4); }
    Wt.ripple(p.x, p.z, 0.45 + k * 0.4);
  };
  // where a shot strikes: in the water it splashes (a plume, a ring, a plunk) instead of kicking up dust; true when it did
  Wt.shot = function (pt) {
    if (!Wt.zones.length || !pt) return false;
    const z = Wt.at(pt, 0.35, 0.25); if (!z) return false;
    Wt.splash(V(pt.x, surfY(z), pt.z), 0.28, { column: true, silent: true });
    if (G.sfx.splash) G.sfx.splash(V(pt.x, surfY(z), pt.z), 0.25);
    return true;
  };
  // a blast at pos with radius r: if water lies under it, it throws up a column and rings
  Wt.blast = function (pos, r) {
    if (!Wt.zones.length) return;
    const z = Wt.at(pos, 0.5, Math.max(1.5, r * 0.6)); if (!z) return;
    Wt.splash(V(pos.x, surfY(z), pos.z), Math.min(1.5, 0.7 + r * 0.12), { column: true });
    for (let i = 0; i < 3; i++) { const a = R() * 6.28, d = r * 0.5; Wt.ripple(pos.x + Math.cos(a) * d, pos.z + Math.sin(a) * d, 0.8); }
  };

  // ---------------------------------------------------------------- under the water (the deep water of the drowned town, w.deepWater)
  // Murky fresh water, as it is to the eye: what is near keeps its colours, a few metres off it goes blue-green and dark and is gone;
  // deeper is darker. Overhead the surface: a round window of light (bent, shaking with the ripples), the water's dark mirror round it.
  // Light comes down in slanting shafts and throws a moving web on what lies under it, strongest near the surface. Specks drift in it,
  // your breath goes up in bubbles, the mud stirs by the bottom. With the eyes at the surface (standing on the bed, the water is at eye
  // height) a line crosses the screen, the water under it and the air over it. Going in, a churn of bubbles; coming out, drops on the
  // eyes that run off. On medium quality a lighter frame of it (no shafts, no blur); on low only the haze and a tint (no frame passes).
  // (The frame's part is in post.js, given what it needs here as G.Post.water. Every sound muffled: audio.js A.underwater.)
  const UW = { mode: 0, saved: null, el: null, bubT: 0, mudT: 0, since: 9, drops: 0, dive: 0, sheets: [], motes: null, wasUnder: false };
  const UW_FOG = new THREE.Color('#0b241f'), UW_TMP = new THREE.Color(), UW_SD = new THREE.Vector3();
  const UW_P = { mode: 0, e: 0, sy: 0, dens: 0.3, lk: 0.5, col: new THREE.Color(), light: new THREE.Color(), air: new THREE.Color(), sdir: new THREE.Vector3(0, -1, 0), drops: 0, since: 9, dive: 0, lid: 0, open: new THREE.Vector4() };
  const surfAt = (d) => d.y + 0.01;   // (the face of the deep water)
  // the deep water the eyes are over or in, and how high over its surface they are. open: water with a lid of ice over it (d.lid, the
  // frozen lake) is open to the light only in its holes (the pools of w.waterZones marked lake): the one the eyes are under, or the
  // nearest within 6 m (x0, z0, x1, z1), or none (an empty box): only through that one is the light overhead drawn (post.js)
  const NONE = { x0: 1e6, z0: 1e6, x1: 1e6, z1: 1e6 };
  function openOver(c) {
    let best = NONE, bd = 6;
    for (const z of Wt.zones) {
      if (!z.lake) continue;
      const dx = Math.max(z.x0 - c.x, 0, c.x - z.x1), dz = Math.max(z.z0 - c.z, 0, c.z - z.z1), dd = Math.hypot(dx, dz);
      if (dd < bd) { bd = dd; best = z; }
    }
    return best;
  }
  Wt.camWater = function () {
    const w = G.world, c = G.camera && G.camera.position; if (!w || !w.deepWater || !c) return null;
    for (const d of w.deepWater) if (c.x > d.x0 && c.x < d.x1 && c.z > d.z0 && c.z < d.z1 && c.y < d.y + 2) return { d, e: c.y - surfAt(d), open: d.lid ? openOver(c) : null };
    return null;
  };
  Wt.camUnder = function () { const q = Wt.camWater(); return q && q.e < -0.04 ? q.d : null; };
  Wt.underOn = () => UW.mode === 2;
  Wt.waterMode = () => UW.mode;
  // specks drifting in the water round the eyes: a box of them that wraps as you move, fogged as the water fogs, never over the surface
  const MOTE_VS = `uniform vec3 uCam; uniform float uT; uniform float uOn; uniform float uSy; uniform float uDens; uniform float uPx; uniform vec2 uFlow;
    attribute float aPh; varying float vA;
    void main() {
      vec3 B = vec3(12.0, 4.0, 12.0);
      vec3 p = position * B + vec3(uFlow.x, 0.0, uFlow.y) * uT * 0.3 + vec3(sin(uT * 0.21 + aPh * 6.3), sin(uT * 0.17 + aPh * 4.1) * 0.6, cos(uT * 0.19 + aPh * 5.2)) * 0.35;
      vec3 o = uCam - B * 0.5; p = mod(p - o, B) + o;
      vec4 mv = modelViewMatrix * vec4(p, 1.0); float z = -mv.z, f = uDens * z;
      vA = uOn * step(p.y, uSy - 0.02) * exp(-f * f) * smoothstep(0.25, 0.9, z) * (0.35 + 0.65 * fract(aPh * 7.7));
      gl_PointSize = vA > 0.001 ? clamp(0.035 * (0.6 + fract(aPh * 3.3)) * 900.0 / max(z, 0.1), 1.2, 5.0) * uPx : 0.0;
      gl_Position = vA > 0.001 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
    }`;
  const MOTE_FS = `uniform vec3 uC; varying float vA;
    void main() { vec2 q = gl_PointCoord - 0.5; float a = exp(-dot(q, q) * 10.0) * vA * 0.55; if (a < 0.004) discard; gl_FragColor = vec4(uC, a); }`;
  function motes(w) {
    const n = Math.round(((G.save && G.save.data.settings.quality) === 'high' ? 420 : 240) * (document.documentElement.classList.contains('m') ? 0.6 : 1));
    let s = 7919; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = rnd(); pos[i * 3 + 1] = rnd(); pos[i * 3 + 2] = rnd(); ph[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uCam: { value: new THREE.Vector3() }, uT: { value: 0 }, uOn: { value: 0 }, uSy: { value: 0 }, uDens: { value: 0.3 }, uPx: { value: 1 }, uFlow: { value: new THREE.Vector2() }, uC: { value: new THREE.Color() } },
      vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false; m.renderOrder = 5; m.userData.noAudit = true;   // (in the scene from the start, drawn as nothing until under: its shader is made with the area's)
    w.group.add(m);
    return m;
  }
  // (low quality, no frame passes: a tint laid over the world instead - a plain one, darker at the edges)
  function uwEl() {
    if (UW.el) return UW.el;
    const wrap = document.getElementById('canvas-wrap'); if (!wrap) return null;
    const el = document.createElement('div'); el.id = 'uw-tint';
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .2s;background:radial-gradient(ellipse at 50% 35%, rgba(20,60,56,.10), rgba(2,16,16,.55) 80%)';
    wrap.appendChild(el); return (UW.el = el);
  }
  function uwFog(on) {
    const sc = G.scene;
    if (on && !UW.saved) UW.saved = { c: sc.fog.color.clone(), d: sc.fog.density };
    if (!on && UW.saved) { sc.fog.color.copy(UW.saved.c); sc.fog.density = UW.saved.d; G.fx.setFog(sc.fog.color, sc.fog.density); UW.saved = null; }
  }
  function uwSet(mode) {
    const w = G.world, post = !!(G.Post && G.Post.active);
    if (mode === UW.mode) return;
    if (mode === 2) { if (UW.mode !== 2) { UW.dive = 1; UW.since = 0; diveBurst(); } }
    else if (UW.mode === 2) { UW.drops = 1; UW.since = 0; }
    UW.mode = mode;
    uwFog(mode === 2);
    if (G.sfx.underwater) G.sfx.underwater(mode === 2);
    // the water's face: drawn from above as itself; at the surface the frame draws it (the line across the screen); from below, on low
    // quality, a pale sheet overhead stands for it
    if (w && w.mats && w.mats.water) w.mats.water.visible = mode !== 1;
    for (const m of UW.sheets) m.visible = !post;
    const el = uwEl(); if (el) el.style.opacity = mode === 2 && !post ? 1 : 0;
  }
  function uwReset() {
    UW.sheets = []; UW.motes = null; UW.drops = 0; UW.dive = 0; UW.since = 9;
    if (UW.mode) { UW.mode = 0; uwFog(false); if (G.sfx.underwater) G.sfx.underwater(false); }
    UW.saved = null; if (UW.el) UW.el.style.opacity = 0;
    if (G.Post) G.Post.water = null;
  }
  // going in: a churn of bubbles round the eyes
  function diveBurst() {
    const c = G.camera.position, N = G.fx.norm;
    for (let i = 0; i < 26; i++) { const a = R() * 6.28, r = rnd(0.15, 0.7); N.spawn(c.x + Math.cos(a) * r, c.y + rnd(-0.6, 0.1), c.z + Math.sin(a) * r, rnd(-0.3, 0.3), rnd(0.6, 1.6), rnd(-0.3, 0.3), rnd(0.5, 1.0), rnd(0.012, 0.03), 0.004, 0.72, 0.82, 0.82, 0.5, -1.4, 0.8); }
  }
  function updateUnder(dt) {
    const GM = G.game, w = G.world;
    if (GM.state === 'paused') return;
    const post = !!(G.Post && G.Post.active), st = GM.state, q = st === 'playing' || st === 'inv' || st === 'buff' || st === 'dead' ? Wt.camWater() : null;   // (the world goes on behind a menu)
    // 2: under; 1: the eyes at the surface (only with the frame passes: on low it stays above or under)
    const mode = !q ? 0 : q.e < -0.08 || (!post && q.e < -0.04) ? 2 : post && q.e < 0.1 ? 1 : 0;
    uwSet(mode);
    UW.since += dt; UW.drops = Math.max(0, UW.drops - dt * 0.6); UW.dive = Math.max(0, UW.dive - dt * 2.2);
    const P = UW_P, sc = G.scene, c = G.camera.position;
    if (mode || UW.drops > 0 || UW.dive > 0) {
      const d = q ? q.d : null, depth = q ? Math.max(0, -q.e) : 0, sy = d ? surfAt(d) : 0;
      // the water's colour: dark blue-green, darker the deeper and the darker the place
      const air = UW.saved ? UW.saved.c : sc.fog.color, L = GM.lights, hemi = L && L.hemi;
      P.air.copy(air);
      // (the light that comes down through the surface: the place's own, some times the water's colour - the brightest thing down there)
      P.light.copy(air).multiplyScalar(1.6); if (hemi) P.light.add(UW_TMP.copy(hemi.color).multiplyScalar(hemi.intensity * 0.05));
      P.light.multiplyScalar(2.5).add(UW_TMP.copy(UW_FOG).multiplyScalar(1.5));
      { const l = P.light.r * 0.2126 + P.light.g * 0.7152 + P.light.b * 0.0722; P.light.lerp(UW_TMP.setRGB(l, l, l), 0.3); }   // (not a glowing cyan)
      P.col.copy(UW_FOG).multiplyScalar(Math.max(0.45, 1 - depth * 0.22));
      P.dens = 0.3 + depth * 0.05; P.lk = 0.6; P.mode = mode; P.e = q ? q.e : 1; P.sy = sy;
      if (L && L.moon) { UW_SD.copy(L.moon.target.position).sub(L.moon.position).normalize(); if (UW_SD.y > -0.3) UW_SD.set(0, -1, 0); P.sdir.copy(UW_SD); }
      P.drops = UW.drops; P.since = UW.since; P.dive = UW.dive;
      // (a lid of ice over it: the hole the light comes through, post.js)
      const o = q && q.open; P.lid = o ? 1 : 0; if (o) P.open.set(o.x0, o.z0, o.x1, o.z1);
      if (G.Post) G.Post.water = P;
      if (mode === 2) { sc.fog.color.copy(P.col); sc.fog.density = P.dens; G.fx.setFog(sc.fog.color, sc.fog.density); }
    } else if (G.Post) G.Post.water = null;
    // the specks in the water
    const M = UW.motes;
    if (M) {
      const u = M.material.uniforms; u.uOn.value = mode ? 1 : 0;
      if (mode) { u.uCam.value.copy(c); u.uT.value = GM.time % 1000; u.uSy.value = P.sy; u.uDens.value = P.dens; u.uPx.value = G.renderer ? G.renderer.getPixelRatio() : 1; const f = U2() && U2().uFlow.value; if (f) u.uFlow.value.copy(f); u.uC.value.copy(P.light).multiplyScalar(4).add(UW_TMP.copy(P.col).multiplyScalar(1.2)); }
    }
    if (mode !== 2) return;
    const depth = P.sy - c.y, Pl = G.player, mv = Pl && Pl.speedH ? Pl.speedH : 0;
    // your breath: a few small bubbles now and then, up to the surface, more when you move
    UW.bubT -= dt * (1 + mv * 0.25);
    if (UW.bubT <= 0) {
      UW.bubT = 0.5 + R() * 0.9;
      const f = Pl.forward ? Pl.forward() : V(0, 0, -1), up = Math.max(0.3, depth - 0.1);
      for (let k = 0, n = 2 + Math.floor(R() * 4); k < n; k++) { const sp = rnd(0.7, 1.1); G.fx.norm.spawn(c.x + f.x * 0.35 + rnd(-0.06, 0.06), c.y - 0.18, c.z + f.z * 0.35 + rnd(-0.06, 0.06), rnd(-0.08, 0.08), sp, rnd(-0.08, 0.08), Math.min(2.2, up / sp), rnd(0.008, 0.022), 0.003, 0.7, 0.8, 0.8, 0.5, -0.5, 0.5); }
    }
    // the mud by the bottom stirs where you go
    const bed = w && w.floorBelow ? w.floorBelow(c.x, c.y, c.z) : -99;
    UW.mudT -= dt;
    if (c.y - bed < 1.9 && mv > 0.5 && UW.mudT <= 0) {
      UW.mudT = 0.12;
      for (let k = 0; k < 2; k++) G.fx.norm.spawn(Pl.pos.x + rnd(-0.4, 0.4), bed + 0.05, Pl.pos.z + rnd(-0.4, 0.4), rnd(-0.15, 0.15), rnd(0.05, 0.25), rnd(-0.15, 0.15), rnd(1.6, 2.8), rnd(0.25, 0.45), 0.35, 0.16, 0.15, 0.1, 0.28, -0.02, 1.4);
    }
  }

  // ---------------------------------------------------------------- every frame
  Wt.update = function (dt) {
    const w = G.world, P = G.player; if (!w || !P || !U2()) return;
    const GM = G.game;
    updateUnder(dt);
    // you wading: rings at your feet as you go (the steps make their own splash)
    if (P.inWater && P.speedH > 0.6) { wadeT -= dt; if (wadeT <= 0) { wadeT = 0.24; Wt.ripple(P.pos.x, P.pos.z, 0.25 + Math.min(0.4, P.speedH * 0.05)); } }
    // the foes wading: a ring now and then round each that moves, a few drops
    if (Wt.zones.length) for (const e of G.enemies.list) {
      if (!e.alive || e.flyer || e.removed) continue;
      const t = (foeT.get(e) || 0) - dt; foeT.set(e, t); if (t > 0) continue;
      const mv = e.vel ? Math.hypot(e.vel.x, e.vel.z) + (e.mv || 0) * (e.speed || 0) : 0;
      if (mv < 0.5 || !Wt.at(e.pos)) { foeT.set(e, 0.4); continue; }
      foeT.set(e, 0.32 + R() * 0.1);
      Wt.ripple(e.pos.x, e.pos.z, Math.min(0.7, 0.25 + (e.radius || 0.5) * 0.4));
      if (R() < 0.5) { const N = G.fx.norm; for (let i = 0; i < 3; i++) N.spawn(e.pos.x + rnd(-0.3, 0.3), 0.08, e.pos.z + rnd(-0.3, 0.3), rnd(-0.6, 0.6), rnd(1, 2), rnd(-0.6, 0.6), 0.45, 0.05, 0.02, 0.84, 0.92, 0.96, 0.8, 9.8, 0.4); }
    }
    // the falls: spray and mist where they land, rings spreading from the foot
    fallT -= dt;
    const cp = G.camera ? G.camera.position : P.pos;
    for (const f of Wt.falls) {
      const d = Math.hypot(f.bx - cp.x, f.bz - cp.z); if (d > 45) continue;
      const N = G.fx.norm, k = dt * (d < 20 ? 1 : 0.5);
      for (let i = 0; i < 14 * k * f.wd; i++) N.spawn(f.bx + f.ax * rnd(-0.5, 0.5) * f.wd, 0.1, f.bz + f.az * rnd(-0.5, 0.5) * f.wd, f.nx * rnd(0.5, 2.5) + rnd(-0.6, 0.6), rnd(1.2, 3.2), f.nz * rnd(0.5, 2.5) + rnd(-0.6, 0.6), rnd(0.4, 0.8), rnd(0.05, 0.09), 0.03, 0.86, 0.93, 0.97, 0.85, 9.8, 0.5);
      for (let i = 0; i < 4 * k * f.wd; i++) N.spawn(f.bx + f.ax * rnd(-0.5, 0.5) * f.wd + f.nx * rnd(0.2, 1.4), 0.25, f.bz + f.az * rnd(-0.5, 0.5) * f.wd + f.nz * rnd(0.2, 1.4), f.nx * rnd(0.2, 0.8), rnd(0.2, 0.7), f.nz * rnd(0.2, 0.8), rnd(1.2, 2.0), 0.5, 1.8, 0.85, 0.92, 0.95, 0.22, -0.05, 1.0);
      if (fallT <= 0) Wt.ripple(f.bx + f.nx * rnd(0.4, 1.4) + f.ax * rnd(-0.4, 0.4) * f.wd, f.bz + f.nz * rnd(0.4, 1.4) + f.az * rnd(-0.4, 0.4) * f.wd, rnd(0.5, 0.9));
    }
    if (fallT <= 0) fallT = 0.18;
    // the flooded halls: drops from the vault ring the water round you (with the drip's own sound)
    if (Wt.flooded && GM.state === 'playing') {
      dripT -= dt;
      if (dripT <= 0) {
        dripT = rnd(0.25, 0.7);
        const a = R() * 6.28, d = rnd(2, 14), p = V(cp.x + Math.cos(a) * d, 0, cp.z + Math.sin(a) * d), z = Wt.at(p.setY(0.05), 0.5, 0.5);
        if (z) { Wt.ripple(p.x, p.z, rnd(0.3, 0.55)); G.fx.norm.spawn(p.x, surfY(z) + 0.02, p.z, 0, rnd(0.8, 1.4), 0, 0.3, 0.035, 0.02, 0.85, 0.92, 0.96, 0.8, 9.8, 0); if (R() < 0.35 && G.sfx.drip) G.sfx.drip(p.clone().setY(surfY(z))); }
      }
    }
    // the stream: flecks of foam carried along
    for (const s of Wt.streams) {
      if (Math.abs((s.z0 + s.z1) / 2 - cp.z) > 30 && Math.abs((s.x0 + s.x1) / 2 - cp.x) > 30) continue;
      if (R() < dt * 10) { const u = U2().uFlow.value; G.fx.norm.spawn(U.clamp(cp.x + rnd(-14, 14), s.x0 + 0.3, s.x1 - 0.3), 0.07, rnd(s.z0 + 0.3, s.z1 - 0.3), u.x * 1.2, 0, u.y * 1.2, rnd(1.6, 2.6), 0.06, 0.05, 0.9, 0.95, 0.97, 0.7, 0, 0); }
    }
    // the beds of sound: wading, the nearest fall (its side), the stream, the water round you; a few times a second
    sndT -= dt;
    if (sndT <= 0 && G.sfx.waterBed && !Wt.holdBeds) { // (holdBeds: a test sets the beds itself)
      sndT = 0.1;
      const L = P.pos, side = (x, z) => { const ang = Math.atan2(x - L.x, -(z - L.z)) - (G.sfx.listenerYawNeg || 0), d = Math.hypot(x - L.x, z - L.z); return Math.max(-0.85, Math.min(0.85, Math.sin(ang) * Math.min(1, d / 4))); };
      const rectD = (q) => Math.hypot(Math.max(q.x0 - L.x, 0, L.x - q.x1), Math.max(q.z0 - L.z, 0, L.z - q.z1));
      let fall = 0, fallPan = 0;
      for (const f of Wt.falls) { const d = Math.hypot(f.bx - L.x, f.bz - L.z), v = Math.max(0, 1 / (1 + d * 0.16) - 0.12); if (v > fall) { fall = v; fallPan = side(f.bx, f.bz); } }
      let brook = 0, brookPan = 0;
      for (const s of Wt.streams) { const d = rectD(s), v = Math.pow(Math.max(0, 1 - d / 24), 1.6); if (v > brook) { brook = v; brookPan = side(U.clamp(L.x, s.x0, s.x1), U.clamp(L.z, s.z0, s.z1)); } }
      let lap = 0, lapPan = 0;
      for (const q of Wt.zones) { const d = rectD(q), v = Math.max(0, 1 - d / 12) * Math.min(1, ((q.x1 - q.x0) * (q.z1 - q.z0)) / 60); if (v > lap) { lap = v; lapPan = d > 0.5 ? side(U.clamp(L.x, q.x0, q.x1), U.clamp(L.z, q.z0, q.z1)) : 0; } }
      const wade = P.inWater && !P.dead ? Math.min(1, P.speedH / 6.5) : 0;
      const on = GM.state === 'playing' || GM.state === 'inv';
      G.sfx.waterBed(on ? { wade, fall, fallPan, brook, brookPan, lap: Math.min(1, lap), lapPan } : { wade: 0, fall: 0, brook: 0, lap: 0 });
    }
  };
})();
