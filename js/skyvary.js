'use strict';
// 空模様 (the sky of an area): every area of a field draws one of the field's moods — fog, rain, snow, falling ash, embers, wisps,
// a darker or a brighter night — from the run's seed (the same on a reload and on every co-op screen). Here: how the place looks
// (the colour and thickness of the fog, the light, the sky dome and a field of falling / drifting particles around the camera).
// What falls from the sky also counts in the fight (weather.js): `el` is the element it keeps on you and on the foes (rain: water,
// snow: ice, embers: fire), `bolt` brings lightning down. A guardian's hall always has the field's own sky (the first of its moods):
// no weather there, the fight with the guardian stays as it is.
(function () {
  const S = (G.Sky = {});
  const U = G.U;

  // ---------------------------------------------------------------- the moods of each field
  // w: weight; fogD / amb / moonI / hemiI: multipliers; fog / hemiS / hemiG / moon: a colour mixed in by k (0..1, default 0.5);
  // sky: a replacement sky gradient for outdoor fields (and stars: false for an overcast one); p: particle fields; flash: lightning
  const P = {
    rain: { kind: 'rain', n: 1500, col: 0x9fb4cc, a: 0.34, vel: [1.2, -24, 0.6], len: 0.9 },
    drizzle: { kind: 'rain', n: 700, col: 0x9fb4cc, a: 0.26, vel: [0.6, -18, 0.3], len: 0.6 },
    snow: { kind: 'dot', n: 1100, col: 0xf2f6ff, a: 0.85, vel: [0.5, -1.6, 0.2], sway: 0.9, size: 0.09 },
    frost: { kind: 'dot', n: 650, col: 0xe0f0ff, a: 0.7, vel: [0.1, -0.9, 0.1], sway: 0.6, size: 0.06 },
    ash: { kind: 'dot', n: 800, col: 0x8a8580, a: 0.7, vel: [0.7, -0.8, 0.3], sway: 0.7, size: 0.07 },
    ember: { kind: 'dot', n: 380, col: 0xff8a30, a: 1.0, vel: [0.4, 1.3, 0.2], sway: 0.8, size: 0.06, add: true },
    emberStorm: { kind: 'dot', n: 900, col: 0xff7a28, a: 1.0, vel: [1.2, 1.8, 0.4], sway: 1.1, size: 0.06, add: true },
    blueEmber: { kind: 'dot', n: 420, col: 0x5aa8ff, a: 1.0, vel: [0.2, 1.2, 0.2], sway: 0.8, size: 0.06, add: true },
    wisp: { kind: 'dot', n: 70, col: 0x9fd0ff, a: 0.9, vel: [0.2, 0.15, 0.1], sway: 2.2, size: 0.22, add: true },
    spore: { kind: 'dot', n: 260, col: 0x9ae060, a: 0.75, vel: [0.1, 0.25, 0.05], sway: 1.2, size: 0.07, add: true },
    dust: { kind: 'dot', n: 300, col: 0xd8c8a8, a: 0.45, vel: [0.15, -0.1, 0.05], sway: 0.9, size: 0.035, add: true },
    feather: { kind: 'dot', n: 260, col: 0xfff6e8, a: 0.8, vel: [0.3, -0.7, 0.15], sway: 1.4, size: 0.09 },
    drip: { kind: 'rain', n: 140, col: 0x9fc8d0, a: 0.4, vel: [0, -14, 0], len: 0.35 },
  };
  const D = (id, name, w, o) => Object.assign({ id, name, w }, o || {});
  S.V = {
    // 地上
    grave: [
      D('clear', '月夜', 4),
      D('mist', '濃霧', 2, { fogD: 3.0, fog: '#3a4452', k: 0.7, amb: 0.92, sunK: 0.4, stars: false }),
      D('rain', '雨夜', 2, { fogD: 1.5, fog: '#10141c', k: 0.5, moonI: 0.55, amb: 0.88, sky: ['#05070c', '#0c1018', '#1a2230'], stars: false, sunK: 0.1, p: [P.rain], flash: true, el: 'water', bolt: true }),
      D('wisp', '鬼火の夜', 1, { hemiS: '#6aa0ff', k: 0.35, p: [P.wisp] }),
      D('snow', '雪夜', 1, { fogD: 1.8, fog: '#3a4250', k: 0.55, amb: 1.12, moonI: 0.85, sky: ['#0c1018', '#1c2430', '#3a4454'], stars: false, sunK: 0.3, p: [P.snow], el: 'ice' }),
      D('redmoon', '赤い月', 1, { moon: '#ff8a70', k: 0.55, fog: '#2a1418', hemiS: '#a06070', sky: ['#060208', '#1e0a12', '#3a1420'], sunCol: [1.0, 0.32, 0.22] }),
    ],
    hamlet: [
      D('clear', '月夜', 4),
      D('mist', '濃霧', 3, { fogD: 3.0, fog: '#3c464c', k: 0.7, amb: 0.94, sunK: 0.4, stars: false }),
      D('rain', '雨夜', 2, { fogD: 1.4, fog: '#0e1218', k: 0.5, moonI: 0.5, amb: 0.86, sky: ['#04060a', '#0a0e16', '#18202a'], stars: false, sunK: 0.1, p: [P.rain], flash: true, el: 'water', bolt: true }),
      D('fire', '遠い火の手', 1, { fog: '#3a1a10', k: 0.4, hemiS: '#b07050', sky: ['#05060c', '#1a1018', '#5a2410'], p: [P.ember], el: 'fire' }),
      D('wisp', '鬼火の夜', 1, { hemiS: '#6aa0ff', k: 0.35, p: [P.wisp] }),
    ],
    dusk: [
      D('clear', '黄昏', 4),
      D('ash', '灰の降る黄昏', 2, { fog: '#9a8478', k: 0.5, fogD: 1.5, amb: 0.9, sky: ['#3a3a4a', '#9a7466', '#c8a080'], sunK: 0.55, p: [P.ash] }),
      D('storm', '雷雲', 2, { fog: '#4a4458', k: 0.6, fogD: 1.3, amb: 0.78, moonI: 0.55, sky: ['#1a1c2c', '#4a4454', '#8a6a5c'], sunK: 0.2, p: [P.drizzle], flash: true, el: 'water', bolt: true }),
      D('sand', '砂塵', 1, { fog: '#c89a68', k: 0.55, fogD: 2.4, sunK: 0.5, p: [P.dust] }),
    ],
    battlefield: [
      D('clear', '夜明け前', 4),
      D('mist', '朝霧', 3, { fogD: 2.6, fog: '#8a9098', k: 0.65, amb: 1.05, sunK: 0.5 }),
      D('rain', '冷たい雨', 2, { fogD: 1.5, fog: '#3a4048', k: 0.55, moonI: 0.6, amb: 0.88, sky: ['#14181e', '#2c323a', '#565c62'], sunK: 0.15, p: [P.rain], flash: true, el: 'water', bolt: true }),
      D('crimson', '赤い朝焼け', 1, { fog: '#7a4a40', k: 0.45, hemiS: '#c08070', sky: ['#1e1a24', '#6a3a34', '#d08060'], sunCol: [1.0, 0.55, 0.38] }),
      D('crows', '灰の舞う', 1, { fog: '#6a6460', k: 0.4, fogD: 1.3, p: [P.ash] }),
    ],
    // 入口
    shaft: [
      D('clear', '月夜', 4),
      D('dim', '雲の夜', 2, { moonI: 0.6, amb: 0.85, stars: false, sky: ['#030408', '#0a0e18', '#161c28'], sunK: 0.2 }),
      D('mist', '底の霧', 2, { fogD: 2.2, fog: '#2a3240', k: 0.6, amb: 0.95 }),
      D('rain', '吹き込む雨', 1, { fogD: 1.4, fog: '#10141c', k: 0.5, moonI: 0.5, amb: 0.88, sky: ['#04060a', '#0a0e16', '#18202a'], stars: false, sunK: 0.1, p: [P.rain], flash: true, el: 'water', bolt: true }),
      D('snow', '舞い込む雪', 1, { fogD: 1.6, fog: '#3a4250', k: 0.5, amb: 1.08, moonI: 0.85, stars: false, sunK: 0.3, p: [P.snow], el: 'ice' }),
    ],
    mine: [
      D('base', '', 5),
      D('dim', '灯の乏しい坑', 2, { amb: 0.72, hemiI: 0.8, fogD: 1.15 }),
      D('dust', '粉塵', 2, { fog: '#2a2218', k: 0.35, fogD: 1.4, p: [P.dust] }),
      D('drip', '滴る坑', 1, { fog: '#141a1c', k: 0.3, p: [P.drip] }),
    ],
    gate: [
      D('base', '', 5),
      D('dim', '灯の乏しい夜', 2, { amb: 0.74, hemiI: 0.82, fogD: 1.15 }),
      D('dust', '塵の舞う', 2, { fog: '#2a2620', k: 0.3, p: [P.dust] }),
      D('mist', '冷えた霧', 1, { fogD: 1.7, fog: '#1c2634', k: 0.5 }),
    ],
    catacombs: [
      D('base', '', 5),
      D('spore', '胞子の霞', 2, { fog: '#1c2a14', k: 0.55, fogD: 1.4, hemiS: '#6a8a5a', p: [P.spore] }),
      D('damp', '湿った闇', 2, { fog: '#121a20', k: 0.5, amb: 0.85, p: [P.drip] }),
    ],
    castle: [
      D('base', '血月', 4),
      D('rain', '雨の城壁', 2, { fogD: 1.35, fog: '#1a0c10', k: 0.5, moonI: 0.6, amb: 0.88, sky: ['#060205', '#1a060c', '#3a0e14'], stars: false, sunK: 0.15, p: [P.rain], flash: true, el: 'water', bolt: true }),
      D('mist', '霧の城', 2, { fogD: 2.8, fog: '#3a1c22', k: 0.6, sunK: 0.45 }),
      D('ash', '火の粉の夜', 1, { p: [P.ember], el: 'fire' }),
    ],
    // 中層
    halls: [
      D('base', '', 5),
      D('ember', '火の粉', 2, { p: [P.ember], el: 'fire' }),
      D('dust', '塵の舞う', 2, { p: [P.dust] }),
    ],
    flooded: [
      D('base', '', 5),
      D('mist', '水煙', 2, { fogD: 1.8, fog: '#2a3a36', k: 0.55, amb: 1.05 }),
      D('drip', '滴る天井', 2, { p: [P.drip, P.drizzle], el: 'water' }),
    ],
    foundry: [
      D('base', '', 5),
      D('ember', '火の粉の嵐', 2, { hemiS: '#c07040', k: 0.3, p: [P.emberStorm], el: 'fire' }),
      D('smoke', '煤煙', 2, { fog: '#1c120c', k: 0.6, fogD: 1.6, amb: 0.85, p: [P.ash] }),
    ],
    // 深層
    ruin: [
      D('base', '', 5),
      D('ash', '灰降る', 2, { fog: '#141824', k: 0.4, p: [P.ash] }),
      D('blaze', '蒼炎の昂ぶり', 2, { hemiS: '#6a9cff', k: 0.4, amb: 1.15, p: [P.blueEmber], el: 'fire' }),
    ],
    frozen: [
      D('base', '', 5),
      D('snow', '降りしきる霜', 2, { fogD: 1.3, fog: '#26303c', k: 0.4, p: [P.frost], el: 'ice' }),
      D('haze', '凍える靄', 2, { fogD: 1.9, fog: '#3a4654', k: 0.55, amb: 1.08 }),
      D('aurora', '極光', 1, { hemiS: '#6ad0b8', k: 0.45, hemiG: '#2a1a40', p: [P.wisp] }),
    ],
    pillars: [
      D('clear', '闇夜', 4),
      D('mist', '昇る靄', 2, { fogD: 2.2, fog: '#2a1a3a', k: 0.6, amb: 1.0 }),
      D('wisp', '鬼火の群れ', 2, { hemiS: '#8a6aff', k: 0.4, p: [P.wisp] }),
      D('ash', '灰の降る闇', 1, { fog: '#2a2430', k: 0.4, fogD: 1.3, p: [P.ash] }),
      D('storm', '紫電', 1, { fog: '#1a1028', k: 0.5, moonI: 0.6, amb: 0.85, sky: ['#020106', '#0a0614', '#1c1030'], p: [P.drizzle], flash: true, el: 'water', bolt: true }),
    ],
    sanctum: [
      D('base', '偽りの空', 4),
      D('dusk', '暮れない夕刻', 2, { fog: '#c8a0b0', k: 0.5, sky: ['#4a3a6a', '#c88a9a', '#f0c8b0'], hemiS: '#d0a0b8', k2: 0.3 }),
      D('white', '白昼の虚無', 2, { fog: '#e8ecf4', k: 0.6, fogD: 1.6, amb: 1.1, stars: false, sunK: 0.6, sky: ['#d8e0f0', '#eef2fa', '#ffffff'] }),
      D('feather', '羽の降る', 1, { p: [P.feather] }),
    ],
  };

  // ---------------------------------------------------------------- choosing and applying
  // the field's own sky (the first of its moods) is drawn this many times as often as its weight says: most areas have plain weather
  // (with ×2: the plain sky 53-71% of the areas, a weather that lays an element 0-23%)
  S.BASE_K = 2;
  S.choose = function (w, n, kind) {
    const list = S.V[w.biome] || S.V[w.field];
    if (!list || !G.game || !G.game.seed) return null;
    if (w.isBoss || kind === 'boss') return list[0]; // (a guardian's hall: the field's own sky, never a weather)
    if (S.force) { const f = list.find((v) => v.id === S.force); if (f) return f; } // (development: G.Sky.force = 'rain' etc.)
    const rng = new G.RNG(((G.game.seed ^ U.hashStr('sky:' + n + ':' + kind)) >>> 0) || 1);
    return rng.weighted(list, (v) => v.w * (v === list[0] ? S.BASE_K : 1));
  };
  const mixHex = (a, b, k) => { const c = new THREE.Color(a).lerp(new THREE.Color(b), k); return '#' + c.getHexString(); };
  // the field's light and fog with a mood laid over them (a copy: the field's own table is never changed)
  S.env = function (B, v) {
    if (!v) return B;
    const o = Object.assign({}, B), k = v.k ?? 0.5;
    if (v.fog) o.fog = mixHex(B.fog, v.fog, k);
    if (v.fogD) o.fogD = B.fogD * v.fogD;
    if (v.amb) o.amb = B.amb * v.amb;
    if (v.moonI) o.moonI = B.moonI * v.moonI;
    if (v.hemiS) o.hemiS = mixHex(B.hemiS, v.hemiS, v.k2 ?? k);
    if (v.hemiG) o.hemiG = mixHex(B.hemiG, v.hemiG, k);
    if (v.moon) o.moon = mixHex(B.moon, v.moon, k);
    if (v.hemiI) o.hemiI = v.hemiI;
    if (B.outdoor && v.sky) o.sky = v.sky;
    if (B.outdoor && v.stars === false) o.stars = false;
    if (B.outdoor && v.sunCol) o.sunCol = v.sunCol;
    if (B.outdoor && v.sunK != null) o.sunCol = (o.sunCol || [1.0, 0.85, 0.6]).map((c) => c * v.sunK); // (a veiled moon / sun)
    return o;
  };

  // ---------------------------------------------------------------- particles around the camera
  // Each field is one draw: the particles live in a box centred on the camera and wrap around it as you move (the shader does the
  // falling, the sway and the wrap), fading out near the box's edge so nothing pops in.
  const DOT_VS = `uniform float uT; uniform vec3 uBox; uniform vec3 uCam; uniform vec3 uVel; uniform float uSway; uniform float uSize;
    attribute float aPh; varying float vA;
    void main() {
      vec3 p = position * uBox + uVel * uT + vec3(sin(uT * 0.7 + aPh * 6.283) * uSway, sin(uT * 0.45 + aPh * 3.1) * uSway * 0.4, cos(uT * 0.6 + aPh * 5.0) * uSway);
      vec3 o = uCam - uBox * 0.5; p = mod(p - o, uBox) + o;
      vec3 d = (p - uCam) / (uBox * 0.5); float r = max(abs(d.x), max(abs(d.y), abs(d.z)));
      vA = 1.0 - smoothstep(0.7, 1.0, r);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uSize * (0.75 + 0.5 * fract(aPh * 7.3)) * 900.0 / max(1.0, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const DOT_FS = `uniform vec3 uC; uniform float uA; varying float vA;
    void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.15, d) * uA * vA; if (a < 0.01) discard; gl_FragColor = vec4(uC, a); }`;
  const LINE_VS = `uniform float uT; uniform vec3 uBox; uniform vec3 uCam; uniform vec3 uVel; uniform float uLen;
    attribute float aEnd; varying float vA;
    void main() {
      vec3 p = position * uBox + uVel * uT;
      vec3 o = uCam - uBox * 0.5; p = mod(p - o, uBox) + o;
      vec3 d = (p - uCam) / (uBox * 0.5); float r = max(abs(d.x), max(abs(d.y), abs(d.z)));
      vA = (1.0 - smoothstep(0.7, 1.0, r)) * (1.0 - aEnd * 0.7);
      p -= normalize(uVel) * uLen * aEnd;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const LINE_FS = `uniform vec3 uC; uniform float uA; varying float vA;
    void main() { float a = uA * vA; if (a < 0.01) discard; gl_FragColor = vec4(uC, a); }`;
  const BOX = [44, 26, 44];
  let live = [], scene = null, flash = null, flashEl = null, cur = null;
  function make(spec, k) {
    const n = Math.max(8, Math.round(spec.n * k)), rnd = (() => { let s = 99991; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const uni = { uT: { value: 0 }, uBox: { value: new THREE.Vector3(...BOX) }, uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(...spec.vel) }, uC: { value: new THREE.Color(spec.col) }, uA: { value: spec.a } };
    const g = new THREE.BufferGeometry();
    let m;
    if (spec.kind === 'rain') {
      const pos = new Float32Array(n * 6), end = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { const x = rnd(), y = rnd(), z = rnd(); pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      uni.uLen = { value: spec.len || 0.8 };
      m = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: LINE_VS, fragmentShader: LINE_FS, transparent: true, depthWrite: false }));
    } else {
      const pos = new Float32Array(n * 3), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) { pos.set([rnd(), rnd(), rnd()], i * 3); ph[i] = rnd(); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
      uni.uSway = { value: spec.sway || 0 }; uni.uSize = { value: spec.size || 0.06 };
      m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: DOT_VS, fragmentShader: DOT_FS, transparent: true, depthWrite: false, blending: spec.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
    }
    m.frustumCulled = false; m.renderOrder = 6;
    return m;
  }
  S.start = function (sc, v) {
    S.stop(); scene = sc; cur = v || null;
    if (!v) return;
    const q = (G.save && G.save.data.settings.quality) || 'high', k = (q === 'low' ? 0.35 : q === 'med' ? 0.65 : 1) * (document.documentElement.classList.contains('m') ? 0.6 : 1);
    for (const spec of v.p || []) { const m = make(spec, k); scene.add(m); live.push(m); }
    flash = v.flash ? { next: 6 + Math.random() * 10, t: -1 } : null;
  };
  S.stop = function () {
    for (const m of live) { if (scene) scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    live = []; flash = null; cur = null;
    if (flashEl) flashEl.style.opacity = 0;
  };
  S.current = () => cur;
  // a bolt that strikes (weather.js): the pale flash over the screen right now, the ambient one put back
  S.flashNow = function () { if (!flash) return; flash.t = 0; flash.next = Math.max(flash.next, 6 + Math.random() * 8); };
  S.update = function (dt, cam) {
    if (!live.length && !flash) return;
    for (const m of live) { const u = m.material.uniforms; u.uT.value += dt; u.uCam.value.copy(cam.position); }
    if (flash) {
      flash.next -= dt;
      if (flash.next <= 0) { flash.next = 9 + Math.random() * 16; flash.t = 0; if (G.sfx.thunder) G.sfx.thunder(1.2 + Math.random() * 2.5); }
      if (flash.t >= 0) {
        flash.t += dt;
        // two quick pulses, then gone: a pale overlay, never strong enough to hide anything
        const t = flash.t, a = t < 0.08 ? t / 0.08 : t < 0.16 ? 1 - (t - 0.08) / 0.08 : t < 0.26 ? (t - 0.16) / 0.1 * 0.7 : Math.max(0, 0.7 - (t - 0.26) / 0.35);
        if (!flashEl) { flashEl = document.createElement('div'); flashEl.id = 'sky-flash'; flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;background:#dfe8ff;mix-blend-mode:screen;opacity:0'; document.body.appendChild(flashEl); }
        flashEl.style.opacity = (a * 0.22).toFixed(3);
        if (t > 0.7) { flash.t = -1; flashEl.style.opacity = 0; }
      }
    }
  };
})();
