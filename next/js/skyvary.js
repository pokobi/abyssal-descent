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
    // (dot sizes: pixels at 1 m on a 900-high screen / 900; max: the ceiling in such pixels (a nearer one fades instead of growing);
    // shape 1: a flat tumbling flake; tone: how much the flakes differ in shade; tw: how much a mote glints now and then)
    snow: { kind: 'dot', n: 1500, col: 0xe8eef6, a: 0.8, vel: [0.5, -1.6, 0.2], sway: 0.9, size: 0.06, max: 7, tone: 0.3 },
    frost: { kind: 'dot', n: 900, col: 0xdce6f0, a: 0.65, vel: [0.1, -0.9, 0.1], sway: 0.6, size: 0.045, max: 6, tone: 0.3 },
    ash: { kind: 'dot', n: 1400, col: 0x4a4440, a: 0.85, vel: [0.7, -0.8, 0.3], sway: 0.7, size: 0.065, max: 9, shape: 1, tone: 0.8 },
    ember: { kind: 'dot', n: 380, col: 0xff8a30, a: 1.0, vel: [0.4, 1.3, 0.2], sway: 0.8, size: 0.06, add: true },
    emberStorm: { kind: 'dot', n: 900, col: 0xff7a28, a: 1.0, vel: [1.2, 1.8, 0.4], sway: 1.1, size: 0.06, add: true },
    blueEmber: { kind: 'dot', n: 420, col: 0x5aa8ff, a: 1.0, vel: [0.2, 1.2, 0.2], sway: 0.8, size: 0.06, add: true },
    wisp: { kind: 'dot', n: 70, col: 0x9ab8cc, a: 0.75, vel: [0.2, 0.15, 0.1], sway: 2.2, size: 0.22, max: 12, add: true },
    spore: { kind: 'dot', n: 260, col: 0x9ae060, a: 0.75, vel: [0.1, 0.25, 0.05], sway: 1.2, size: 0.07, add: true },
    dust: { kind: 'dot', n: 500, col: 0xc8b898, a: 0.5, vel: [0.15, -0.1, 0.05], sway: 0.9, size: 0.03, max: 4.5, tone: 0.5, tw: 0.6, add: true },
    feather: { kind: 'dot', n: 260, col: 0xfff6e8, a: 0.8, vel: [0.3, -0.7, 0.15], sway: 1.4, size: 0.09 },
    drip: { kind: 'rain', n: 140, col: 0x9fc8d0, a: 0.4, vel: [0, -14, 0], len: 0.35 },
  };
  // the clouds of a mood (game.js draws them in the sky dome): [cover 0..1, how dark and thick the deck is, high cirrus, scud running
  // under a rain deck, wind speed, size of the heaps, banks of cloud standing on the far horizon]
  const CL = {
    night: [0.28, 0.3, 0.35, 0, 1, 1, 0],      // a clear night: a few clouds drifting past the moon, streaks high up
    thin: [0.22, 0.35, 0.3, 0, 0.8, 1, 0],
    mist: [0.6, 0.3, 0, 0, 0.5, 0.8, 0],          // (a fog over the ground: the sky is a pale dome over it)
    rain: [0.98, 0.88, 0, 0.6, 2.2, 0.72, 0],     // a low dark deck, scud running under it
    snow: [0.93, 0.45, 0, 0.25, 1.1, 0.8, 0],     // a heavy pale deck
    smoke: [0.55, 0.55, 0, 0.15, 1.1, 0.9, 0], // smoke and cloud over fires, lit from below
    ash: [0.75, 0.5, 0, 0.2, 0.7, 0.85, 0],    // a veil of ash
    storm: [0.94, 0.92, 0, 0.5, 2.0, 0.7, 0],     // thunderheads
    dusk: [0.42, 0.3, 0.4, 0, 0.7, 1, 1],         // broken heaps and long streaks catching a low sun, far banks hazed on the horizon
    dawn: [0.55, 0.45, 0.25, 0, 0.6, 0.85, 0.8],  // a grey morning deck with breaks in it
    day: [0.32, 0.12, 0.25, 0, 0.6, 1.15, 1],     // fair-weather heaps in a high sky
  };
  // the blood moon's sky: the field's red is too bright a glow for the sky itself. Nearly black, a dark red-brown; the red left round the
  // moon (its own light) and in a sooty copper band low on the horizon
  const BLOOD = ['#040203', '#120708', '#3a1810'];
  const D = (id, name, w, o) => Object.assign({ id, name, w }, o || {});
  S.V = {
    // 地上
    grave: [
      D('clear', '月夜', 4, { cl: CL.night }),
      D('mist', '濃霧', 2, { fogD: 3.0, fog: '#3a4452', k: 0.7, amb: 0.92, sunK: 0.4, stars: false, cl: CL.mist }),
      D('rain', '雨夜', 2, { fogD: 1.5, fog: '#10141c', k: 0.5, moonI: 0.55, amb: 0.88, sky: ['#05070c', '#0c1018', '#1a2230'], stars: false, sunK: 0.1, p: [P.rain], flash: true, el: 'water', bolt: true, cl: CL.rain }),
      D('wisp', '鬼火の夜', 1, { hemiS: '#6aa0ff', k: 0.35, p: [P.wisp], cl: CL.thin }),
      D('snow', '雪夜', 1, { fogD: 1.8, fog: '#3a4250', k: 0.55, amb: 1.12, moonI: 0.85, sky: ['#0c1018', '#1c2430', '#3a4454'], stars: false, sunK: 0.3, p: [P.snow], el: 'ice', cl: CL.snow }),
      D('redmoon', '赤い月', 1, { moon: '#ff8a70', k: 0.55, fog: '#2a1418', hemiS: '#a06070', sky: ['#060208', '#1e0a12', '#3a1420'], sunCol: [1.0, 0.32, 0.22], cl: CL.thin }),
    ],
    hamlet: [
      D('clear', '月夜', 4, { cl: CL.night }),
      D('mist', '濃霧', 3, { fogD: 3.0, fog: '#3c464c', k: 0.7, amb: 0.94, sunK: 0.4, stars: false, cl: CL.mist }),
      D('rain', '雨夜', 2, { fogD: 1.4, fog: '#0e1218', k: 0.5, moonI: 0.5, amb: 0.86, sky: ['#04060a', '#0a0e16', '#18202a'], stars: false, sunK: 0.1, p: [P.rain], flash: true, el: 'water', bolt: true, cl: CL.rain }),
      D('fire', '遠い火の手', 1, { fog: '#3a1a10', k: 0.4, hemiS: '#b07050', sky: ['#05060c', '#16100f', '#46240f'], p: [P.ember], el: 'fire', cl: CL.smoke, under: ['#a84a1c', 0.05] }),
      D('wisp', '鬼火の夜', 1, { hemiS: '#6aa0ff', k: 0.35, p: [P.wisp], cl: CL.thin }),
    ],
    dusk: [
      D('clear', '黄昏', 4, { cl: CL.dusk }),
      D('ash', '灰の降る黄昏', 2, { fog: '#9a8478', k: 0.5, fogD: 1.5, amb: 0.9, sky: ['#3a3a4a', '#9a7466', '#c8a080'], sunK: 0.55, p: [P.ash], cl: CL.ash, haze: 1.8 }),
      D('storm', '雷雲', 2, { fog: '#4a4458', k: 0.6, fogD: 1.3, amb: 0.78, moonI: 0.55, sky: ['#1a1c2c', '#4a4454', '#8a6a5c'], sunK: 0.2, p: [P.drizzle], flash: true, el: 'water', bolt: true, cl: CL.storm }),
      D('sand', '砂塵', 1, { fog: '#c89a68', k: 0.55, fogD: 2.4, sunK: 0.5, p: [P.dust], cl: [0.2, 0.2, 0.3, 0, 1.4, 1, 0.4], haze: 2.5 }),
    ],
    battlefield: [
      D('clear', '夜明け前', 4, { cl: CL.dawn }),
      D('mist', '朝霧', 3, { fogD: 2.6, fog: '#8a9098', k: 0.65, amb: 1.05, sunK: 0.5, cl: CL.mist, haze: 1.5 }),
      D('rain', '冷たい雨', 2, { fogD: 1.5, fog: '#3a4048', k: 0.55, moonI: 0.6, amb: 0.88, sky: ['#14181e', '#2c323a', '#565c62'], sunK: 0.15, p: [P.rain], flash: true, el: 'water', bolt: true, cl: CL.rain }),
      D('crimson', '赤い朝焼け', 1, { fog: '#7a4a40', k: 0.45, hemiS: '#c08070', sky: ['#1e1a24', '#6a3a34', '#d08060'], sunCol: [1.0, 0.55, 0.38], cl: CL.dusk }),
      D('crows', '灰の舞う', 1, { fog: '#6a6460', k: 0.4, fogD: 1.3, p: [P.ash], cl: CL.ash }),
    ],
    // 入口
    shaft: [
      D('clear', '月夜', 4, { cl: CL.night }),
      D('dim', '雲の夜', 2, { moonI: 0.6, amb: 0.85, stars: false, sky: ['#030408', '#0a0e18', '#161c28'], sunK: 0.2, cl: [0.82, 0.6, 0, 0.1, 0.9, 0.85, 0] }),
      D('mist', '底の霧', 2, { fogD: 2.2, fog: '#2a3240', k: 0.6, amb: 0.95, cl: CL.night }),
      D('rain', '吹き込む雨', 1, { fogD: 1.4, fog: '#10141c', k: 0.5, moonI: 0.5, amb: 0.88, sky: ['#04060a', '#0a0e16', '#18202a'], stars: false, sunK: 0.1, p: [P.rain], flash: true, el: 'water', bolt: true, cl: CL.rain }),
      D('snow', '舞い込む雪', 1, { fogD: 1.6, fog: '#3a4250', k: 0.5, amb: 1.08, moonI: 0.85, stars: false, sunK: 0.3, p: [P.snow], el: 'ice', cl: CL.snow }),
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
      D('base', '血月', 4, { cl: CL.thin, sky: BLOOD }),
      D('rain', '雨の城壁', 2, { fogD: 1.35, fog: '#1a0c10', k: 0.5, moonI: 0.6, amb: 0.88, sky: ['#040203', '#0e0607', '#2a1210'], stars: false, sunK: 0.15, p: [P.rain], flash: true, el: 'water', bolt: true, cl: CL.rain }),
      D('mist', '霧の城', 2, { fogD: 2.8, fog: '#3a1c22', k: 0.6, sunK: 0.45, cl: CL.mist, sky: BLOOD }),
      D('ash', '火の粉の夜', 1, { p: [P.ember], el: 'fire', cl: CL.smoke, under: ['#9a3c16', 0.05], sky: BLOOD }),
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
      D('clear', '闇夜', 4, { cl: CL.thin }),
      D('mist', '昇る靄', 2, { fogD: 2.2, fog: '#2a1a3a', k: 0.6, amb: 1.0, cl: CL.mist }),
      D('wisp', '鬼火の群れ', 2, { hemiS: '#8a6aff', k: 0.4, p: [P.wisp], cl: CL.thin }),
      D('ash', '灰の降る闇', 1, { fog: '#2a2430', k: 0.4, fogD: 1.3, p: [P.ash], cl: CL.ash }),
      D('storm', '紫電', 1, { fog: '#1a1028', k: 0.5, moonI: 0.6, amb: 0.85, sky: ['#020106', '#0a0614', '#1c1030'], stars: false, p: [P.drizzle], flash: true, el: 'water', bolt: true, cl: CL.storm }),
    ],
    sanctum: [
      D('base', '偽りの空', 4, { cl: CL.day }),
      D('dusk', '暮れない夕刻', 2, { fog: '#b8a0a4', k: 0.5, sky: ['#3a3848', '#9a8286', '#d8b498'], hemiS: '#d0a0b8', k2: 0.3, cl: CL.dusk }),
      D('white', '白昼の虚無', 2, { fog: '#e8ecf4', k: 0.6, fogD: 1.6, amb: 1.1, stars: false, sunK: 0.6, sky: ['#d8e0f0', '#eef2fa', '#ffffff'], cl: [0.85, 0.08, 0, 0, 0.4, 0.8, 0], haze: 2 }),
      D('feather', '羽の降る', 1, { p: [P.feather], cl: CL.day }),
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
    const open = B.outdoor || B.sky;   // (a field with a sky over it: the roofless shaft too)
    if (open) o.body = B.night || B.stars ? 'moon' : 'sun';   // (what hangs in it, before an overcast mood puts the stars out)
    if (open && v.sky) o.sky = v.sky;
    if (open && v.stars === false) o.stars = false;
    if (open && v.sunCol) o.sunCol = v.sunCol;
    if (open && v.sunK != null) o.sunCol = (o.sunCol || [1.0, 0.85, 0.6]).map((c) => c * v.sunK); // (a veiled moon / sun)
    if (open && v.cl) o.cl = v.cl;
    if (open && v.haze) o.haze = v.haze;
    if (open && v.under) o.under = v.under;
    return o;
  };

  // ---------------------------------------------------------------- particles around the camera
  // Each field is one draw: the particles live in a box centred on the camera and wrap around it as you move (the shader does the
  // falling, the sway and the wrap), fading out near the box's edge so nothing pops in.
  // A dot's size comes from its distance, but never past uMax: a nearer one is out of focus, so it stays at the ceiling and fades as
  // it would have spread (and right before the eye, to nothing) - it was a white disc of forty to eighty pixels. One smaller
  // than a pixel and a half stays that size and fades instead. uPx: the drawing buffer's height / 900. The area's fog takes the far ones.
  const DOT_VS = `uniform float uT; uniform vec3 uBox; uniform vec3 uCam; uniform vec3 uVel; uniform float uSway; uniform float uSize;
    uniform float uMax; uniform float uPx; uniform float uFogD; uniform float uTone; uniform float uTw; uniform float uShape;
    attribute float aPh; varying float vA; varying float vSh; varying vec3 vRot;
    void main() {
      vec3 p = position * uBox + uVel * uT + vec3(sin(uT * 0.7 + aPh * 6.283) * uSway, sin(uT * 0.45 + aPh * 3.1) * uSway * 0.4, cos(uT * 0.6 + aPh * 5.0) * uSway);
      vec3 o = uCam - uBox * 0.5; p = mod(p - o, uBox) + o;
      vec3 d = (p - uCam) / (uBox * 0.5); float r = max(abs(d.x), max(abs(d.y), abs(d.z)));
      vA = 1.0 - smoothstep(0.7, 1.0, r);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float z = -mv.z, want = uSize * (0.75 + 0.5 * fract(aPh * 7.3)) * 900.0 / max(0.05, z);
      float s = clamp(want, 1.5, uMax);
      vA *= (want < s ? (want * want) / (s * s) : s / want) * smoothstep(0.35, 1.4, z);
      vA *= exp(-pow(uFogD * z, 2.0));
      vSh = 1.0 + uTone * (fract(aPh * 5.13) - 0.5);
      if (uTw > 0.0) { float g = 0.5 + 0.5 * sin(uT * (0.8 + fract(aPh * 9.7)) + aPh * 41.0); vSh *= 1.0 - uTw + uTw * 2.2 * g * g * g; }
      float ang = aPh * 6.283 + uT * (0.6 + 1.6 * fract(aPh * 13.1)), tilt = 0.3 + 0.7 * abs(sin(uT * (0.9 + fract(aPh * 3.7)) + aPh * 17.0));
      vRot = vec3(cos(ang), sin(ang), uShape > 0.5 ? tilt * (0.55 + 0.45 * fract(aPh * 2.9)) : 1.0);
      gl_PointSize = s * uPx;
      gl_Position = projectionMatrix * mv;
    }`;
  // snow and motes: a soft round point; a flake (uShape 1): flat and ragged, turning as it falls
  const DOT_FS = `uniform vec3 uC; uniform float uA; uniform float uShape; varying float vA; varying float vSh; varying vec3 vRot;
    void main() {
      vec2 q = gl_PointCoord - 0.5; float a;
      if (uShape > 0.5) {
        q = vec2(vRot.x * q.x - vRot.y * q.y, vRot.y * q.x + vRot.x * q.y); q.y /= vRot.z;
        float e = length(q) * (1.0 + 0.18 * sin(atan(q.y, q.x) * 3.0 + vSh * 23.0));
        a = smoothstep(0.5, 0.32, e);
      } else a = exp(-dot(q, q) * 12.0);
      a *= uA * vA; if (a < 0.01) discard;
      gl_FragColor = vec4(uC * vSh, a);
    }`;
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
  const DB = new THREE.Vector2();
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
      uni.uSway = { value: spec.sway || 0 }; uni.uSize = { value: spec.size || 0.06 }; uni.uMax = { value: spec.max || 5 + 70 * (spec.size || 0.06) };
      uni.uPx = { value: 1 }; uni.uFogD = { value: 0 }; uni.uTone = { value: spec.tone || 0 }; uni.uTw = { value: spec.tw || 0 }; uni.uShape = { value: spec.shape || 0 };
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
    live = []; flash = null; cur = null; S.flashA = 0;
    if (flashEl) flashEl.style.opacity = 0;
  };
  S.current = () => cur;
  // the flash as the sky dome draws it (game.js): how strong it is now (0..1) and where in the clouds (a new place for each flash)
  S.flashA = 0; S.flashDir = [0, 1, 0];
  const flashAt = () => { const a = Math.random() * Math.PI * 2, y = 0.18 + Math.random() * 0.45; S.flashDir = [Math.cos(a), y, Math.sin(a)]; };
  // a bolt that strikes (weather.js): the pale flash over the screen right now, the ambient one put back
  S.flashNow = function () { if (!flash) return; flash.t = 0; flash.next = Math.max(flash.next, 6 + Math.random() * 8); flashAt(); };
  S.update = function (dt, cam) {
    if (!live.length && !flash) return;
    const px = G.renderer ? G.renderer.getDrawingBufferSize(DB).y / 900 : 1, fd = scene && scene.fog && scene.fog.density ? scene.fog.density : 0;
    for (const m of live) { const u = m.material.uniforms; u.uT.value += dt; u.uCam.value.copy(cam.position); if (u.uPx) { u.uPx.value = px; u.uFogD.value = fd; } }
    if (flash) {
      flash.next -= dt;
      if (flash.next <= 0) { flash.next = 9 + Math.random() * 16; flash.t = 0; flashAt(); if (G.sfx.thunder) G.sfx.thunder(1.2 + Math.random() * 2.5); }
      if (flash.t >= 0) {
        flash.t += dt;
        // two quick pulses, then gone: a pale overlay, never strong enough to hide anything
        const t = flash.t, a = t < 0.08 ? t / 0.08 : t < 0.16 ? 1 - (t - 0.08) / 0.08 : t < 0.26 ? (t - 0.16) / 0.1 * 0.7 : Math.max(0, 0.7 - (t - 0.26) / 0.35);
        if (!flashEl) { flashEl = document.createElement('div'); flashEl.id = 'sky-flash'; flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;background:#dfe8ff;mix-blend-mode:screen;opacity:0'; document.body.appendChild(flashEl); }
        flashEl.style.opacity = (a * 0.22).toFixed(3); S.flashA = a;
        if (t > 0.7) { flash.t = -1; flashEl.style.opacity = 0; S.flashA = 0; }
      }
    }
  };
})();
