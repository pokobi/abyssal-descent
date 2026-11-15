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
    rain: { kind: 'rain', n: 1500, col: 0x9fb4cc, a: 0.34, vel: [1.2, -24, 0.6], len: 0.9, splash: 160 },
    drizzle: { kind: 'rain', n: 700, col: 0x9fb4cc, a: 0.26, vel: [0.6, -18, 0.3], len: 0.6, splash: 60 },
    // (dot sizes: pixels at 1 m on a 900-high screen / 900; max: the ceiling in such pixels (a nearer one fades instead of growing);
    // shape 1: a flat tumbling flake; tone: how much the flakes differ in shade; tw: how much a mote glints now and then)
    snow: { kind: 'dot', roof: true, n: 1500, col: 0xe8eef6, a: 0.8, vel: [0.5, -1.6, 0.2], sway: 0.9, size: 0.06, max: 7, tone: 0.3 },
    frost: { kind: 'dot', roof: true, n: 900, col: 0xdce6f0, a: 0.65, vel: [0.1, -0.9, 0.1], sway: 0.6, size: 0.045, max: 6, tone: 0.3 },
    ash: { kind: 'dot', roof: true, n: 1400, col: 0x4a4440, a: 0.85, vel: [0.7, -0.8, 0.3], sway: 0.7, size: 0.065, max: 9, shape: 1, tone: 0.8 },
    ember: { kind: 'dot', n: 380, col: 0xff8a30, a: 1.0, vel: [0.4, 1.3, 0.2], sway: 0.8, size: 0.06, add: true },
    emberStorm: { kind: 'dot', n: 900, col: 0xff7a28, a: 1.0, vel: [1.2, 1.8, 0.4], sway: 1.1, size: 0.06, add: true },
    blueEmber: { kind: 'dot', n: 420, col: 0x5aa8ff, a: 1.0, vel: [0.2, 1.2, 0.2], sway: 0.8, size: 0.06, add: true },
    wisp: { kind: 'dot', n: 70, col: 0x9ab8cc, a: 0.75, vel: [0.2, 0.15, 0.1], sway: 2.2, size: 0.22, max: 12, add: true },
    spore: { kind: 'dot', n: 260, col: 0x9ae060, a: 0.75, vel: [0.1, 0.25, 0.05], sway: 1.2, size: 0.07, add: true },
    dust: { kind: 'dot', roof: true, n: 500, col: 0xc8b898, a: 0.5, vel: [0.15, -0.1, 0.05], sway: 0.9, size: 0.03, max: 4.5, tone: 0.5, tw: 0.6, add: true },
    // (drifts of ground fog, and a thin layer on the ground: in no mood now - over the place's own thick fog they hardly showed, a few
    // levels in 255 - kept for a fog that is thinner than its drifts)
    bank: { kind: 'bank', n: 44, a: 0.85, wind: [0.45, 0.18] },
    bankLow: { kind: 'bank', low: true, n: 70, a: 0.7, wind: [0.3, 0.12] },   // (and the thin layer lying on the ground under them)
    feather: { kind: 'dot', roof: true, n: 260, col: 0xfff6e8, a: 0.8, vel: [0.3, -0.7, 0.15], sway: 1.4, size: 0.09 },
    drip: { kind: 'rain', n: 140, col: 0x9fc8d0, a: 0.4, vel: [0, -14, 0], len: 0.35, layers: false },
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
      D('crimson', '赤い朝焼け', 1, { fog: '#7a4a40', k: 0.45, hemiS: '#c08070', sky: ['#1e1a24', '#6a3a34', '#d08060'], sunCol: [1.0, 0.55, 0.38], cl: Object.assign([], CL.dusk, { 6: 0.5 }) }),   // (fewer far banks: lit red they would stand out)
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
  // ---- under a roof nothing falls: a map of the area, a metre a cell, of the height of the topmost solid thing over each cell (the
  // ground where it is open, the roof or the deck where there is one, the top of a wall). What falls from the sky is not drawn under
  // it, and a splash lands on it. Made once an area from its colliders (a few ms), kept in a texture (two bytes a cell: -40 .. +80 m).
  const ROOF_GLSL = `uniform sampler2D tRoof; uniform vec4 uRoof;
    float roofTop(vec2 xz) { vec2 uv = xz / uRoof.xy; if (uRoof.z < 0.5 || uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -1e4;
      vec4 t = texture2D(tRoof, uv); return (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0 * 120.0 - 40.0; }`;
  let roof = null, roofOf = null; S.roofMs = 0;
  function roofFor(w) {
    if (!w || !w.colliders) return null;
    if (roofOf === w && roof) return roof;
    if (roof) roof.tex.dispose();
    const t0 = performance.now(), W = Math.max(1, Math.ceil(w.W)), D = Math.max(1, Math.ceil(w.D)), top = new Float32Array(W * D).fill(-40);
    for (const c of w.colliders) {
      if (c.alive === false || c.ghost || c.skyCap || c.enemyOnly) continue;
      if (c.y0 > 6 && c.x1 - c.x0 >= w.W * 0.8 && c.z1 - c.z0 >= w.D * 0.8) continue; // (the vault of a hall under the ground is no roof)
      const ia = Math.max(0, Math.ceil(c.x0 - 0.5)), ib = Math.min(W - 1, Math.floor(c.x1 - 0.5)), ja = Math.max(0, Math.ceil(c.z0 - 0.5)), jb = Math.min(D - 1, Math.floor(c.z1 - 0.5));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) { const k = j * W + i; if (c.y1 <= top[k]) continue; const y = c.tg && w.tTop ? w.tTop(c, i + 0.5, j + 0.5) : c.y1; if (y > top[k]) top[k] = y; }   // (the ground's own surface where it is shaped)
    }
    const data = new Uint8Array(W * D * 4);
    for (let k = 0; k < W * D; k++) { const v = Math.round(Math.min(1, Math.max(0, (top[k] + 40) / 120)) * 65535); data[k * 4] = v >> 8; data[k * 4 + 1] = v & 255; data[k * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, W, D, THREE.RGBAFormat, THREE.UnsignedByteType); tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    roof = { tex, W, D, top }; roofOf = w; S.roofMs = performance.now() - t0;
    return roof;
  }
  S._roofReset = () => { roofOf = null; }; // (development: the map made again, to time it)
  S.roofAt = (x, z) => { if (!roof) return null; const i = Math.floor(x), j = Math.floor(z); return i < 0 || j < 0 || i >= roof.W || j >= roof.D ? null : roof.top[j * roof.W + i]; }; // (development)
  const DOT_VS = `uniform float uT; uniform vec3 uBox; uniform vec3 uCam; uniform vec3 uVel; uniform float uSway; uniform float uSize;
    uniform float uMax; uniform float uPx; uniform float uFogD; uniform float uTone; uniform float uTw; uniform float uShape;
    uniform vec3 uAmb; uniform vec4 uLP[4]; uniform vec4 uLC[4]; uniform float uFlash; varying vec3 vLit;
    ${ROOF_GLSL}
    attribute float aPh; varying float vA; varying float vSh; varying vec3 vRot;
    void main() {
      vec3 p = position * uBox + uVel * uT + vec3(sin(uT * 0.7 + aPh * 6.283) * uSway, sin(uT * 0.45 + aPh * 3.1) * uSway * 0.4, cos(uT * 0.6 + aPh * 5.0) * uSway);
      vec3 o = uCam - uBox * 0.5; p = mod(p - o, uBox) + o;
      vec3 d = (p - uCam) / (uBox * 0.5); float r = max(abs(d.x), max(abs(d.y), abs(d.z)));
      vA = 1.0 - smoothstep(0.7, 1.0, r);
      if (p.y < roofTop(p.xz) + 0.05) vA = 0.0;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      float z = -mv.z, want = uSize * (0.75 + 0.5 * fract(aPh * 7.3)) * 900.0 / max(0.05, z);
      float s = clamp(want, 1.5, uMax);
      vA *= (want < s ? (want * want) / (s * s) : s / want) * smoothstep(0.35, 1.4, z);
      vA *= exp(-pow(uFogD * z, 2.0));
      vSh = 1.0 + uTone * (fract(aPh * 5.13) - 0.5);
      if (uTw > 0.0) { float g = 0.5 + 0.5 * sin(uT * (0.8 + fract(aPh * 9.7)) + aPh * 41.0); vSh *= 1.0 - uTw + uTw * 2.2 * g * g * g; }
      float ang = aPh * 6.283 + uT * (0.6 + 1.6 * fract(aPh * 13.1)), tilt = 0.3 + 0.7 * abs(sin(uT * (0.9 + fract(aPh * 3.7)) + aPh * 17.0));
      vRot = vec3(cos(ang), sin(ang), uShape > 0.5 ? tilt * (0.55 + 0.45 * fract(aPh * 2.9)) : 1.0);
      // (a flake or a fleck of ash is seen by the light round it: the place's own, the lamps near it, a flash)
      vLit = uAmb + vec3(0.75, 0.82, 1.0) * uFlash * 0.6;
      for (int i = 0; i < 4; i++) { float R = uLP[i].w; if (R <= 0.0) continue; float q = max(0.0, 1.0 - length(uLP[i].xyz - p) / R); vLit += uLC[i].rgb * q * q; }
      gl_PointSize = s * uPx;
      gl_Position = projectionMatrix * mv;
    }`;
  // snow and motes: a soft round point; a flake (uShape 1): flat and ragged, turning as it falls
  const DOT_FS = `uniform vec3 uC; uniform float uA; uniform float uShape; varying float vA; varying float vSh; varying vec3 vRot; varying vec3 vLit;
    void main() {
      vec2 q = gl_PointCoord - 0.5; float a;
      if (uShape > 0.5) {
        q = vec2(vRot.x * q.x - vRot.y * q.y, vRot.y * q.x + vRot.x * q.y); q.y /= vRot.z;
        float e = length(q) * (1.0 + 0.18 * sin(atan(q.y, q.x) * 3.0 + vSh * 23.0));
        a = smoothstep(0.5, 0.32, e);
      } else a = exp(-dot(q, q) * 12.0);
      a *= uA * vA; if (a < 0.01) discard;
      gl_FragColor = vec4(uC * vSh * vLit, a);
    }`;
  // ---------------------------------------------------------------- rain: streaks, splashes; the bolt that comes down
  // Rain falls in two depths of streaks round the eye: a few long faint ones close by, many short ones farther off; farther still it is
  // no streaks but the veil the mood's fog already is. A streak is a line along the way the drop moves (the wind slants it and its gusts
  // sway its way and thickness), a pixel wide, fading to nothing at both ends, only a little brighter than what is behind it: lit by the
  // place (its fog and sky), by the lamps and fires near it, by a flash - at night, in the dark, there is hardly anything to see of it.
  // Where drops hit the ground or a roof near the eye, a small ring spreads and a fleck of spray jumps.
  const LIT_GLSL = `uniform vec3 uC; uniform vec4 uLP[4]; uniform vec4 uLC[4]; uniform float uFlash;
    vec3 litAt(vec3 p) { vec3 c = uC + vec3(0.75, 0.82, 1.0) * uFlash * 0.45;
      for (int i = 0; i < 4; i++) { float R = uLP[i].w; if (R <= 0.0) continue; float q = max(0.0, 1.0 - length(uLP[i].xyz - p) / R); c += uLC[i].rgb * q * q; }
      return c; }`;
  const RAIN_VS = `uniform vec3 uBox; uniform vec3 uCam; uniform vec3 uOff; uniform vec3 uDir; uniform float uLen; uniform float uFogD; uniform float uNear;
    ${ROOF_GLSL}
    ${LIT_GLSL}
    attribute float aEnd; attribute float aPh; varying float vA; varying vec3 vCol;
    void main() {
      vec3 p = position * uBox + uOff;
      vec3 o = uCam - uBox * 0.5; p = mod(p - o, uBox) + o;
      vec3 d = (p - uCam) / (uBox * 0.5); float r = max(abs(d.x), max(abs(d.y), abs(d.z)));
      float a = 1.0 - smoothstep(0.7, 1.0, r);
      if (p.y < roofTop(p.xz) + 0.05) a = 0.0;
      vCol = litAt(p);
      p -= normalize(uDir) * uLen * (0.55 + 0.9 * fract(aPh * 3.7)) * aEnd;
      a *= 1.0 - abs(aEnd * 2.0 - 1.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); float z = -mv.z;
      a *= smoothstep(0.4, 1.6, z) * mix(uNear, 1.0, smoothstep(1.5, 7.0, z)) * exp(-pow(uFogD * z, 2.0)) * (0.6 + 0.8 * fract(aPh * 5.3));
      vA = a;
      gl_Position = projectionMatrix * mv;
    }`;
  const RAIN_FS = `uniform float uA; varying float vA; varying vec3 vCol;
    void main() { float a = uA * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol, a); }`;
  // a splash: each point lands somewhere new near the eye (fixed in the world, wrapping round as you move), on the ground or the roof
  const SPL_VS = `uniform float uT; uniform vec3 uCam; uniform float uProj; uniform float uFogD; uniform float uRate; uniform vec4 uWz[8];
    ${ROOF_GLSL}
    ${LIT_GLSL}
    attribute float aPh; varying float vA; varying float vF; varying float vAsp; varying vec3 vCol; varying float vWet;
    float h1(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      float cyc = uT * uRate + aPh * 17.0, c = floor(cyc); vF = fract(cyc);
      vec2 q = vec2(h1(aPh * 91.7 + c * 1.31), h1(aPh * 53.3 + c * 2.17)) * 14.0;
      vec2 o = uCam.xz - 7.0, xz = mod(q - o, 14.0) + o;
      float y = roofTop(xz);
      // (on water: inside one of the area's pools, at its surface)
      vWet = 0.0; for (int i = 0; i < 8; i++) { vec4 z = uWz[i]; if (z.z > z.x && xz.x > z.x && xz.x < z.z && xz.y > z.y && xz.y < z.w) vWet = 1.0; }
      if (vWet > 0.5) y = max(y, 0.04);   // (on the water's face, not on its bed: the pools lie at the ground's height)
      vec3 p = vec3(xz.x, y + 0.02, xz.y);
      vec4 mv = modelViewMatrix * vec4(p, 1.0); float z = -mv.z;
      vA = step(-30.0, y) * (1.0 - smoothstep(4.0, 7.0, length(xz - uCam.xz))) * exp(-pow(uFogD * z, 2.0)) * smoothstep(0.6, 1.4, z);
      vAsp = clamp(abs(normalize(p - uCam).y), 0.12, 1.0);
      vCol = litAt(p);
      gl_PointSize = clamp(0.34 * uProj / max(z, 0.1), 1.0, 56.0);
      gl_Position = projectionMatrix * mv;
    }`;
  const SPL_FS = `uniform float uA; varying float vA; varying float vF; varying float vAsp; varying vec3 vCol; varying float vWet;
    void main() {
      vec2 p = gl_PointCoord - 0.5, q = vec2(p.x, p.y / vAsp); float r = length(q) * 2.0, a;
      if (vWet > 0.5) {
        // on water: a ring spreading and a fainter one after it, a dimple where the drop went in
        float R = 0.12 + 0.8 * vF, R2 = max(0.0, R - 0.3);
        a = exp(-pow((r - R) / (0.06 + 0.08 * vF), 2.0)) * (1.0 - vF) * (1.0 - vF) * 0.55 + exp(-pow((r - R2) / 0.06, 2.0)) * step(0.3, vF) * (1.0 - vF) * 0.25
          + exp(-r * r * 90.0) * (1.0 - smoothstep(0.0, 0.15, vF)) * 0.6;
      } else {
        // on stone or earth: a little crown of spray thrown up and falling back, gone quickly; no ring
        float k = 1.0 - smoothstep(0.0, 0.35, vF), s = 0.0;
        for (int i = 0; i < 5; i++) { float an = float(i) * 1.2566 + 0.4, sp = 0.18 + 0.06 * float(i - (i / 2) * 2);
          vec2 c = vec2(cos(an) * sp * vF * 2.2, -0.1 - (vF * 1.4 - vF * vF * 2.2) * 0.45); s += exp(-dot(p - c, p - c) * 900.0); }
        a = (s * 0.9 + exp(-r * r * 140.0) * 0.5) * k;
      }
      a *= vA * uA; if (a < 0.004) discard;
      gl_FragColor = vec4(vCol, a);
    }`;
  // a bolt of lightning: a branching path from the clouds, drawn as ribbons turned to the eye - a thin white core in a pale glow
  const BOLT_VS = `uniform float uPix; uniform float uFogD; attribute vec3 aDir; attribute float aOff; attribute float aW; attribute float aB; varying float vX; varying float vB;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 t = (modelViewMatrix * vec4(aDir, 0.0)).xyz;
      vec3 side = normalize(cross(t, mv.xyz) + vec3(1e-5, 0.0, 0.0));
      float w = max(aW, -mv.z * uPix * 1.6), f = uFogD * -mv.z;
      mv.xyz += side * aOff * w; vX = aOff; vB = aB * (aW / w) * mix(0.35, 1.0, exp(-f * f));   // (far off: as thin as near, only dimmer and veiled)
      gl_Position = projectionMatrix * mv;
    }`;
  const BOLT_FS = `uniform float uI; uniform vec3 uC; varying float vX; varying float vB;
    void main() { float x = vX * vX, core = exp(-x * 40.0), glow = exp(-x * 3.0) * 0.35;
      vec3 c = mix(uC, vec3(1.0), core) * (core * 3.0 + glow) * vB * uI; if (max(c.r, max(c.g, c.b)) < 0.002) discard; gl_FragColor = vec4(c, 1.0); }`;
  const BOX = [44, 26, 44], NEAR = [16, 12, 16];
  let live = [], scene = null, flash = null, flashEl = null, cur = null, boltMat = null, bolts = [], gustT = 0;
  const DB = new THREE.Vector2();
  let noRoof = null;
  const roofDummy = () => noRoof || (noRoof = (() => { const t = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); t.needsUpdate = true; return t; })());
  const roofUni = (on) => ({ tRoof: { value: on && roof ? roof.tex : roofDummy() }, uRoof: { value: new THREE.Vector4(roof ? roof.W : 1, roof ? roof.D : 1, on && roof ? 1 : 0, 0) } });
  const litUni = () => ({ uC: { value: new THREE.Color() }, uLP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uLC: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uFlash: { value: 0 } });
  function rainLayer(spec, n, box, len, a, near, rnd, on) {
    const pos = new Float32Array(n * 12), end = new Float32Array(n * 4), ph = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const x = rnd(), y = rnd(), z = rnd(), f = rnd(); for (let j = 0; j < 4; j++) { pos.set([x, y, z], i * 12 + j * 3); ph[i * 4 + j] = f; } end.set([0, 0.5, 0.5, 1], i * 4); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const uni = Object.assign({ uBox: { value: new THREE.Vector3(...box) }, uCam: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3(...spec.vel) }, uLen: { value: len }, uFogD: { value: 0 }, uNear: { value: near }, uA: { value: a } }, roofUni(on), litUni());
    // (added light, not paint: a drop in front of a lit wall is a glint on it, never a dark line)
    const m = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.userData.rain = { spec, a }; return m;
  }
  // ---- banks of ground fog (the misty moods): broad soft drifts a metre or two over the open ground, moving with the air and turning
  // over as they go. Each is a quad turned to the eye, standing on the ground where the roof map (above) says it is open all round it
  // - not where it would cut into a wall or a roof - fading to nothing where it meets the ground and near the eye, so that no edge of
  // it is ever seen; its body is the clouds' noise (game.js), read where it is in the world, so that it does not turn with the eye.
  const BANK_VS = `uniform float uT; uniform vec3 uCam; uniform vec2 uWind; uniform float uLow;
    ${ROOF_GLSL}
    attribute vec2 aCorner; attribute vec4 aSeed; varying vec2 vUv; varying float vA; varying vec3 vW; varying float vG;
    void main() {
      vec2 c = mod(position.xz * uRoof.xy + uWind * uT * (0.7 + 0.6 * aSeed.z), uRoof.xy);   // (spread over the area, drifting across it and round again)
      float g = roofTop(c), R = aSeed.x, open = step(-100.0, g);
      for (int k = 0; k < 6; k++) { float an = float(k) * 1.0472; float t = roofTop(c + vec2(cos(an), sin(an)) * R * 0.85); open *= step(t, g + 2.2); }   // (a slope of the ground may rise under it; a wall or a roof may not)
      vec3 ctr = vec3(c.x, g + aSeed.y, c.y);
      vec3 toC = vec3(uCam.x - ctr.x, 0.0, uCam.z - ctr.z); toC /= max(0.001, length(toC)); vec3 rt = vec3(-toC.z, 0.0, toC.x);
      vec3 p = ctr + rt * aCorner.x * R + vec3(0.0, aCorner.y * R * mix(0.32, 0.1, uLow), 0.0);
      float d = length(ctr - uCam);
      vW = p; vG = g; vUv = aCorner;
      vA = open * smoothstep(R * 0.6, R * 1.6, d) * (1.0 - smoothstep(45.0, 70.0, d)) * smoothstep(0.0, 6.0, min(min(c.x, c.y), min(uRoof.x - c.x, uRoof.y - c.y)));
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }`;
  const BANK_FS = `uniform sampler2D tN; uniform vec3 uC; uniform float uA; uniform float uT; uniform vec2 uWind; uniform float uLow;
    varying vec2 vUv; varying float vA; varying vec3 vW; varying float vG;
    ${ROOF_GLSL}
    void main() {
      float a = 1.0 - smoothstep(0.25, 1.0, length(vUv));
      vec2 f = vW.xz - uWind * uT * 0.6;
      float n = texture2D(tN, f * 0.035 + vec2(0.0, vW.y * 0.04)).r, n2 = texture2D(tN, f * 0.09 + vec2(0.31, vW.y * 0.1) + uT * 0.004).g;
      a *= smoothstep(0.32, 0.8, n * 0.65 + n2 * 0.35);
      float gh = vW.y - roofTop(vW.xz);   // (over the ground or whatever stands there, at this very spot: no line where it meets them)
      a *= mix(smoothstep(0.0, 1.4, gh) * (1.0 - smoothstep(2.2, 4.5, vW.y - vG)), smoothstep(0.0, 0.18, gh) * (1.0 - smoothstep(0.3, 0.8, vW.y - vG)), uLow);
      a *= vA * uA; if (a < 0.003) discard;
      gl_FragColor = vec4(uC, a);
    }`;
  function bankMesh(spec, k, rnd) {
    const tex = G.game && G.game.skyNoiseRT ? G.game.skyNoiseRT.texture : null; if (!tex || !roof) return null;
    const n = Math.max(6, Math.round(spec.n * k)), pos = new Float32Array(n * 12), cor = new Float32Array(n * 8), seed = new Float32Array(n * 16), idx = [];
    for (let i = 0; i < n; i++) {
      const x = rnd(), z = rnd(), R = spec.low ? 3 + rnd() * 3 : 4.5 + rnd() * 5, sd = [R, spec.low ? 0.25 + rnd() * 0.2 : R * 0.3 + 0.4 + rnd() * 0.5, rnd(), rnd()];
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([u, v], j) => { pos.set([x, 0, z], i * 12 + j * 3); cor.set([u, v], i * 8 + j * 2); seed.set(sd, i * 16 + j * 4); });
      const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCorner', new THREE.BufferAttribute(cor, 2)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4)); g.setIndex(idx);
    const uni = Object.assign({ uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(...(spec.wind || [0.5, 0.2])) }, tN: { value: tex }, uC: { value: new THREE.Color() }, uA: { value: spec.a }, uLow: { value: spec.low ? 1 : 0 } }, roofUni(true));
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: BANK_VS, fragmentShader: BANK_FS, transparent: true, depthWrite: false }));
    m.userData.bank = true; return m;
  }
  function make(spec, k, on) {
    const n = Math.max(8, Math.round(spec.n * k)), rnd = (() => { let s = 99991; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const out = [];
    if (spec.kind === 'bank') { if (on) { const m = bankMesh(spec, k, rnd); if (m) out.push(m); } }
    else if (spec.kind === 'rain') {
      const L = spec.len || 0.8;
      if (spec.layers === false) out.push(rainLayer(spec, n, BOX, L, spec.a, 1, rnd, false));
      else { const nn = Math.round(n * 0.28); out.push(rainLayer(spec, nn, NEAR, L * 1.5, spec.a * 0.55, 0.4, rnd, on)); out.push(rainLayer(spec, n - nn, BOX, L * 0.6, spec.a * 1.05, 0.7, rnd, on)); }
      if (spec.splash && on) {
        const ns = Math.max(8, Math.round(spec.splash * k)), g = new THREE.BufferGeometry(), pos = new Float32Array(ns * 3), ph = new Float32Array(ns);
        for (let i = 0; i < ns; i++) ph[i] = rnd();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
        // (the area's pools, for the splashes to know water from ground)
        const wz = (G.world && G.world.waterZones || []).slice(0, 8), uWz = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => wz[i] ? new THREE.Vector4(wz[i].x0, wz[i].z0, wz[i].x1, wz[i].z1) : new THREE.Vector4());
        const uni = Object.assign({ uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uProj: { value: 600 }, uFogD: { value: 0 }, uRate: { value: 2.6 }, uA: { value: spec.a * 0.6 }, uWz: { value: uWz } }, roofUni(true), litUni());
        const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: SPL_VS, fragmentShader: SPL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.userData.splash = true; out.push(m);
      }
    } else {
      const pos = new Float32Array(n * 3), ph = new Float32Array(n), g = new THREE.BufferGeometry();
      for (let i = 0; i < n; i++) { pos.set([rnd(), rnd(), rnd()], i * 3); ph[i] = rnd(); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
      const uni = Object.assign({ uT: { value: 0 }, uBox: { value: new THREE.Vector3(...BOX) }, uCam: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3(...spec.vel) }, uC: { value: new THREE.Color(spec.col) }, uA: { value: spec.a },
        uSway: { value: spec.sway || 0 }, uSize: { value: spec.size || 0.06 }, uMax: { value: spec.max || 5 + 70 * (spec.size || 0.06) }, uPx: { value: 1 }, uFogD: { value: 0 }, uTone: { value: spec.tone || 0 }, uTw: { value: spec.tw || 0 }, uShape: { value: spec.shape || 0 }, uAmb: { value: new THREE.Color(1, 1, 1) }, uLP: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uLC: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) }, uFlash: { value: 0 } }, roofUni(on && spec.roof));
      const lit = !spec.add;   // (what glows of itself - embers, wisps - keeps its own light)
      const pm = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: DOT_VS, fragmentShader: DOT_FS, transparent: true, depthWrite: false, blending: spec.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      pm.userData.dotLit = lit; out.push(pm);
    }
    for (const m of out) { m.frustumCulled = false; m.renderOrder = m.userData.bank ? 5 : 6; }
    return out;
  }
  const bankHor = new THREE.Color();
  S.start = function (sc, v) {
    S.stop(); scene = sc; cur = v || null;
    if (!v) return;
    const w = G.world, B = w && w.mats ? (w.envOverride ? Object.assign({}, w.mats.biome, w.envOverride) : w.mats.biome) : null;
    if (B) { const E = S.env(B, v); bankHor.set(E.sky ? E.sky[2] : E.fog); }
    const open = !!(B && (B.outdoor || B.sky));   // (a field under the sky: what falls from it stops at roofs)
    roof = open ? roofFor(w) : null;
    const q = (G.save && G.save.data.settings.quality) || 'high', k = (q === 'low' ? 0.35 : q === 'med' ? 0.65 : 1) * (document.documentElement.classList.contains('m') ? 0.6 : 1);
    for (const spec of v.p || []) for (const m of make(spec, k, open)) { scene.add(m); live.push(m); }
    flash = v.flash ? { next: 6 + Math.random() * 10, t: -1 } : null;
    // (the bolt's shader, made now with the area - in its place in the scene, a thing of no size - not with the first bolt)
    if (v.bolt) {
      if (!boltMat) boltMat = new THREE.ShaderMaterial({ uniforms: { uI: { value: 0 }, uC: { value: new THREE.Color(0xa8b8d8) }, uPix: { value: 0.0015 }, uFogD: { value: 0 } }, vertexShader: BOLT_VS, fragmentShader: BOLT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const g = boltGeo([[new THREE.Vector3(0, -500, 0), new THREE.Vector3(0, -500.01, 0), 0.001, 0]]), m = new THREE.Mesh(g, boltMat); m.frustumCulled = false; m.userData.boltWarm = true; scene.add(m); live.push(m);
    }
  };
  S.stop = function () {
    for (const m of live) { if (scene) scene.remove(m); m.geometry.dispose(); if (!m.userData.boltWarm) m.material.dispose(); }
    for (const b of bolts) { if (scene) scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); }
    live = []; bolts = []; flash = null; cur = null; S.flashA = 0;
    if (flashEl) flashEl.style.opacity = 0;
  };
  S.current = () => cur;
  // the flash as the sky dome draws it (game.js): how strong it is now (0..1) and where in the clouds (a new place for each flash)
  S.flashA = 0; S.flashDir = [0, 1, 0];
  const flashAt = () => { const a = Math.random() * Math.PI * 2, y = 0.18 + Math.random() * 0.45; S.flashDir = [Math.cos(a), y, Math.sin(a)]; };
  // a bolt that strikes (weather.js): the pale flash over the screen right now, the ambient one put back
  S.flashNow = function () { if (!flash) return; flash.t = 0; flash.next = Math.max(flash.next, 6 + Math.random() * 8); flashAt(); };

  // ---- the bolt: a path that wanders down by halves (each half bent aside a little less than the last), branches that fork off it
  // downward and die out, finer ones off those. It shows for a few hundredths of a second, goes out, strikes again once or twice
  // weaker along the same path, and is gone. (Its shape from Math.random: nothing of the area's dice.)
  const rs = (k) => (Math.random() * 2 - 1) * k;
  function wander(a, b, rough, depth) {
    let pts = [a.clone(), b.clone()];
    for (let it = 0; it < depth; it++) {
      const nx = [pts[0]], k = rough * (1 + 0.25 * it);   // (rougher the finer: jagged at every scale, never a run of straight strokes)
      for (let i = 0; i + 1 < pts.length; i++) {
        const p = pts[i], q = pts[i + 1], L = p.distanceTo(q), m = p.clone().add(q).multiplyScalar(0.5);
        m.x += rs(L * k); m.z += rs(L * k); m.y += rs(L * k * 0.35);
        nx.push(m, q);
      }
      pts = nx;
    }
    return pts;
  }
  // segments [a, b, width, brightness] -> ribbons
  function boltGeo(segs) {
    const n = segs.length, pos = new Float32Array(n * 12), dir = new Float32Array(n * 12), off = new Float32Array(n * 4), wd = new Float32Array(n * 4), br = new Float32Array(n * 4), idx = [];
    segs.forEach(([a, b, w, k], i) => {
      const d = b.clone().sub(a);
      [[a, -1], [a, 1], [b, -1], [b, 1]].forEach(([p, s], j) => { pos.set([p.x, p.y, p.z], i * 12 + j * 3); dir.set([d.x, d.y, d.z], i * 12 + j * 3); off[i * 4 + j] = s; wd[i * 4 + j] = w; br[i * 4 + j] = k; });
      const o = i * 4; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3)); g.setAttribute('aOff', new THREE.BufferAttribute(off, 1));
    g.setAttribute('aW', new THREE.BufferAttribute(wd, 1)); g.setAttribute('aB', new THREE.BufferAttribute(br, 1)); g.setIndex(idx);
    return g;
  }
  S.bolt = function (top, p) {
    if (!scene || !boltMat) return;
    const segs = [], main = wander(top, p, 0.12, 9);
    const add = (pts, w, k) => { for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i], pts[i + 1], w * (0.75 + 0.5 * (i / pts.length)), k]); };
    add(main, 0.11, 1);
    const nb = 3 + Math.floor(Math.random() * 4);
    for (let b = 0; b < nb; b++) {
      const i0 = Math.floor((0.1 + Math.random() * 0.6) * main.length), s = main[i0], L = (0.12 + Math.random() * 0.22) * top.distanceTo(p);
      const e = s.clone().add(new THREE.Vector3(rs(L * 0.8), -L * (0.5 + Math.random() * 0.4), rs(L * 0.8)));
      const br = wander(s, e, 0.14, 7); add(br, 0.05, 0.45);
      if (Math.random() < 0.6) { const j = Math.floor(br.length * (0.3 + Math.random() * 0.4)), L2 = L * 0.45, e2 = br[j].clone().add(new THREE.Vector3(rs(L2), -L2 * 0.7, rs(L2))); add(wander(br[j], e2, 0.14, 6), 0.03, 0.25); }
    }
    const m = new THREE.Mesh(boltGeo(segs), boltMat.clone()); m.frustumCulled = false; m.renderOrder = 7;
    if (G.camera) { const d = top.clone().sub(G.camera.position).normalize(); S.flashDir = [d.x, Math.max(0.15, d.y), d.z]; }   // (the clouds lit from inside where it came down)
    scene.add(m); bolts.push({ m, t: 0, re: Math.random() < 0.7 ? 2 : 1 });
  };
  // its light over the time it lives: the stroke, dark, the restrike(s), gone
  const boltI = (t, re) => t < 0.045 ? 1 : t < 0.085 ? 0.08 : t < 0.12 ? 0.75 : t < 0.17 ? 0.06 : (re > 1 && t < 0.2) ? 0.45 : Math.max(0, 0.2 - (t - 0.2) * 1.5);

  S.update = function (dt, cam) {
    if (!live.length && !flash && !bolts.length) return;
    const R = G.renderer, px = R ? R.getDrawingBufferSize(DB).y / 900 : 1, fd = scene && scene.fog && scene.fog.density ? scene.fog.density : 0;
    // the light of the place on the rain: its fog (the air's own colour) and the sky's light; the lamps near by; a flash
    const GM = G.game, hemi = GM && GM.lights && GM.lights.hemi, fogc = scene && scene.fog ? scene.fog.color : null;
    const lamps = [];
    if (G.LightPool) for (const l of G.LightPool.lights) if (l.intensity > 0 && l.visible !== false) lamps.push([l.position.distanceToSquared(cam.position), l]);
    lamps.sort((a, b) => a[0] - b[0]);
    gustT += dt;
    const gust = 0.55 * Math.sin(gustT * 0.31) + 0.3 * Math.sin(gustT * 0.83 + 1.7) + 0.15 * Math.sin(gustT * 2.3 + 0.4);
    const proj = R ? R.getDrawingBufferSize(DB).y / (2 * Math.tan(cam.fov * Math.PI / 360)) : 600;
    for (const m of live) {
      const u = m.material.uniforms;
      if (u.uT) u.uT.value += dt;
      if (u.uCam) u.uCam.value.copy(cam.position);
      if (u.uPx) { u.uPx.value = px; }
      if (u.uFogD) u.uFogD.value = fd;
      if (u.uProj) u.uProj.value = proj;
      if (u.uLP && u.uAmb) {
        // flakes: lit as much as the place is (a pale flake under a dark night sky is a dim grey one), up to their own colour
        const dl = m.userData.dotLit, lw = 0.012;
        if (!dl) u.uAmb.value.setRGB(1, 1, 1);
        else if (fogc) { const L = Math.min(1, Math.max(0.12, (fogc.r * 0.3 + fogc.g * 0.6 + fogc.b * 0.1) * 7 + (hemi ? hemi.intensity * 0.06 : 0))); u.uAmb.value.copy(fogc).multiplyScalar(0.6 / Math.max(0.02, Math.max(fogc.r, fogc.g, fogc.b))).addScalar(0.4).multiplyScalar(L * 0.7); }
        for (let i = 0; i < 4; i++) { const l = dl && lamps[i] && lamps[i][1]; if (l) { u.uLP.value[i].set(l.position.x, l.position.y, l.position.z, Math.min(l.distance || 14, 10) * 0.65); u.uLC.value[i].set(l.color.r * l.intensity * lw, l.color.g * l.intensity * lw, l.color.b * l.intensity * lw, 0); } else u.uLP.value[i].w = 0; }
        u.uFlash.value = dl ? S.flashA || 0 : 0;
      } else if (u.uLP) {
        if (fogc) u.uC.value.copy(fogc).multiplyScalar(1.1); else u.uC.value.setRGB(0.02, 0.02, 0.025);
        if (hemi) u.uC.value.r += hemi.color.r * hemi.intensity * 0.008, u.uC.value.g += hemi.color.g * hemi.intensity * 0.008, u.uC.value.b += hemi.color.b * hemi.intensity * 0.008;
        for (let i = 0; i < 4; i++) { const l = lamps[i] && lamps[i][1]; if (l) { u.uLP.value[i].set(l.position.x, l.position.y, l.position.z, Math.min(l.distance || 14, 10) * 0.65); u.uLC.value[i].set(l.color.r * l.intensity * 0.02, l.color.g * l.intensity * 0.02, l.color.b * l.intensity * 0.02, 0); } else u.uLP.value[i].w = 0; }
        u.uFlash.value = S.flashA || 0;
      }
      if (m.userData.bank && fogc) { u.uC.value.copy(fogc).lerp(bankHor, 0.55).multiplyScalar(1.35); if (hemi) u.uC.value.r += hemi.color.r * hemi.intensity * 0.01, u.uC.value.g += hemi.color.g * hemi.intensity * 0.01, u.uC.value.b += hemi.color.b * hemi.intensity * 0.01; }   // (the fog's colour toward the horizon's, catching a little of the sky's light)
      const rn = m.userData.rain;
      if (rn) {
        // the wind: the way the rain slants sways with the gusts, and it thickens and thins with them
        const v = rn.spec.vel, h = Math.hypot(v[0], v[2]) || 0.001, hw = h + gust * 2.6;
        u.uDir.value.set(v[0] / h * hw, v[1], v[2] / h * hw);
        const o = u.uOff.value, b = u.uBox.value;
        o.addScaledVector(u.uDir.value, dt); o.set(((o.x % b.x) + b.x) % b.x, ((o.y % b.y) + b.y) % b.y, ((o.z % b.z) + b.z) % b.z);
        u.uA.value = rn.a * (0.85 + 0.25 * gust);
      }
    }
    for (const b of bolts.slice()) {
      b.t += dt; b.m.material.uniforms.uI.value = boltI(b.t, b.re); b.m.material.uniforms.uPix.value = 2 * Math.tan(cam.fov * Math.PI / 360) / Math.max(1, R ? R.getDrawingBufferSize(DB).y : 900); b.m.material.uniforms.uFogD.value = fd;
      if (b.t > 0.34) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); bolts.splice(bolts.indexOf(b), 1); }
    }
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
