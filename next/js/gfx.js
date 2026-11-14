'use strict';
// Surfaces and shapes for the finer look.
//  * The world's textures (textures.js makes them on the CPU, colour and normal) are baked again here on the GPU, at a finer grain and
//    with a third texture - occlusion and roughness - and written back into the same texture objects, so every material that already
//    holds one picks it up.
//  * rbox: a box with its edges rounded, cut to the size asked for (a unit box stretched to size cannot be rounded evenly).
(function () {
  const X = G.GFX = {};
  X.stats = { tex: 0, hand: 0, surf: 0 }; // (ms spent making things, for the record)
  // tileable noise (GLSL): every function takes a period, so a texture built from them repeats without a seam
  X.NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p, float per, float seed){
  vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 s = vec2(seed * 13.7, seed * 5.3);
  float a = hash12(mod(i, per) + s), b = hash12(mod(i + vec2(1., 0.), per) + s), c = hash12(mod(i + vec2(0., 1.), per) + s), d = hash12(mod(i + vec2(1., 1.), per) + s);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 uv, float per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 5; i++) { s += a * vnoise(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; } return s / n; }
float fbm3(vec2 uv, float per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 3; i++) { s += a * vnoise(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; } return s / n; }
float vnA(vec2 p, vec2 per, float seed){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); vec2 s = vec2(seed * 13.7, seed * 5.3);
  float a = hash12(mod(i, per) + s), b = hash12(mod(i + vec2(1., 0.), per) + s), c = hash12(mod(i + vec2(0., 1.), per) + s), d = hash12(mod(i + vec2(1., 1.), per) + s);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbmA(vec2 uv, vec2 per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 5; i++) { s += a * vnA(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; } return s / n; }
float ridge(vec2 uv, float per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 4; i++) { float v = 1. - abs(vnoise(uv * per, per, seed + float(i) * 3.) * 2. - 1.); s += a * v * v; n += a; a *= .5; per *= 2.; } return s / n; }
vec3 voro(vec2 uv, float per, float seed){
  vec2 p = uv * per, i = floor(p), f = fract(p); float d1 = 9., d2 = 9., id = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), c = mod(i + g, per), o = hash22(c + seed * 13.), r = g + o - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(c + seed * 5. + .7); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2), id);
}
// coursed stone: rows of blocks, each row with its own count of blocks and its joints shifted a little.
// d: distance to the nearest joint (as a part of the texture's width), id: a number per block, lp: place within the block (0..1)
void ashlar(vec2 uv, float rows, float colsBase, float seed, out float d, out float id, out vec2 lp){
  float y = uv.y * rows, r = floor(y), fy = y - r; r = mod(r, rows);
  float cols = colsBase + floor(hash12(vec2(r, seed)) * 3.) - 1.;
  float x = uv.x * cols + hash12(vec2(r, seed + 3.)) * cols;
  float k = floor(x);
  float b0 = k + (hash12(vec2(mod(k, cols), r) + seed) - .5) * .4;
  if (x < b0) { k -= 1.; b0 = k + (hash12(vec2(mod(k, cols), r) + seed) - .5) * .4; }
  float b1 = k + 1. + (hash12(vec2(mod(k + 1., cols), r) + seed) - .5) * .4;
  if (x > b1) { k += 1.; b0 = b1; b1 = k + 1. + (hash12(vec2(mod(k + 1., cols), r) + seed) - .5) * .4; }
  float dx = min(x - b0, b1 - x) / cols, dy = min(fy, 1. - fy) / rows;
  d = min(dx, dy); id = hash12(vec2(mod(k, cols), r) + seed * 3.1 + 11.); lp = vec2((x - b0) / (b1 - b0), fy);
}
vec3 S(vec3 c){ return pow(max(c, 0.), vec3(2.2)); }   // a colour thought of as on the screen, to linear
`;
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const FS = (body) => `precision highp float; varying vec2 vUv; uniform int mode;
${X.NOISE}
${body}
void main(){ float h, r, m; vec3 c; mat(vUv, h, c, r, m); if (mode == 0) gl_FragColor = vec4(c, 1.); else gl_FragColor = vec4(h, r, m, 1.); }`;
  // from the height (r of tH; g roughness, b metalness): the normal, or occlusion / roughness / metalness and, in alpha, the height
  // itself (nothing reads it yet: kept for a material that would sink the joints by it)
  const FS2 = `precision highp float; varying vec2 vUv; uniform sampler2D tH; uniform int mode; uniform float texel; uniform float nStr; uniform float aoStr;
void main(){
  vec4 s = texture2D(tH, vUv); float h = s.r;
  if (mode == 0) {
    float hx = texture2D(tH, vUv + vec2(texel, 0.)).r, hx0 = texture2D(tH, vUv - vec2(texel, 0.)).r, hy = texture2D(tH, vUv + vec2(0., texel)).r, hy0 = texture2D(tH, vUv - vec2(0., texel)).r;
    vec3 n = normalize(vec3((hx0 - hx) * nStr, (hy0 - hy) * nStr, 1.));
    gl_FragColor = vec4(n * .5 + .5, 1.); return;
  }
  float acc = 0.;
  for (int i = 0; i < 12; i++) { float a = float(i) * 2.399963, rr = texel * (2. + float(i) * 1.6); acc += max(0., texture2D(tH, vUv + vec2(cos(a), sin(a)) * rr).r - h); }
  gl_FragColor = vec4(clamp(1. - acc / 12. * aoStr, 0., 1.), clamp(s.g, 0.03, 1.), clamp(s.b, 0., 1.), clamp(h, 0., 1.));
}`;
  let quad, cam, scene, mat2;
  const surfMat = (body) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS(body), depthTest: false, depthWrite: false, uniforms: { mode: { value: 0 } } });
  function ready() {
    if (quad) return;
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); scene = new THREE.Scene(); quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad);
    mat2 = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS2, depthTest: false, depthWrite: false, uniforms: { tH: { value: null }, mode: { value: 0 }, texel: { value: 1 }, nStr: { value: 1 }, aoStr: { value: 3 } } });
  }
  // start the making of every surface's program at once: the driver builds them side by side while the first ones are being used
  // (one after another they took four seconds; this way, about one)
  const pending = {};
  X.kick = function (renderer) {
    ready();
    const tmp = new THREE.Scene(), add = (m) => { const q = new THREE.Mesh(quad.geometry, m); q.frustumCulled = false; tmp.add(q); };
    for (const k in SRC) add(pending['w:' + k] = surfMat(SRC[k][1]));
    if (X.EXSRC) for (const k in X.EXSRC) add(pending['x:' + k] = surfMat(X.EXSRC[k][2]));
    for (const k in SPR) add(pending['s:' + k] = sprMat(SPR[k][1]));
    add(mat2);
    try { renderer.compile(tmp, cam); } catch (e) { /* (each is then made when first used) */ }
  };
  X.pendingMat = (key) => { const m = pending[key]; delete pending[key]; return m; };
  // bake one surface: three square targets (colour in sRGB, normal, occlusion / roughness / metalness)
  X.bake = function (renderer, px, body, o) {
    o = o || {}; ready();
    const mat = o.mat || surfMat(body);
    const rt = (srgb) => { const t = new THREE.WebGLRenderTarget(px, px, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, anisotropy: 8 }); if (srgb) t.texture.colorSpace = THREE.SRGBColorSpace; return t; };
    const hgt = new THREE.WebGLRenderTarget(px, px, { depthBuffer: false, type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const out = [rt(true), rt(false), rt(false)], prev = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.autoClear = true;
    quad.material = mat; mat.uniforms.mode.value = 0; renderer.setRenderTarget(out[0]); renderer.render(scene, cam);
    mat.uniforms.mode.value = 1; renderer.setRenderTarget(hgt); renderer.render(scene, cam);
    quad.material = mat2; const u = mat2.uniforms; u.tH.value = hgt.texture; u.texel.value = 1 / px; u.nStr.value = (o.normal === undefined ? 1 : o.normal) * px / 64; u.aoStr.value = o.ao === undefined ? 3 : o.ao;
    u.mode.value = 0; renderer.setRenderTarget(out[1]); renderer.render(scene, cam);
    u.mode.value = 1; renderer.setRenderTarget(out[2]); renderer.render(scene, cam);
    renderer.setRenderTarget(prev); renderer.autoClear = ac; mat.dispose(); hgt.dispose();
    for (const t of out) RT_OF.set(t.texture, t);
    return out;
  };
  // ---- a baked surface lives in the GPU memory of the renderer that baked it (the game's). Another renderer - the class screen's
  // figure, the weapon cards - has its own WebGL context, cannot see that texture, and samples it as black (colour, normal and
  // roughness / occlusion all zero: cloth, leather and gun metal come out as black shapes). X.portable gives such a renderer a copy:
  // each baked texture read back from the game's renderer once (cached), the materials of a model swapped for clones that use the
  // copies (cached per renderer and material; the game's own materials are left as they are)
  const RT_OF = new WeakMap(), PORT_T = new Map(), PORT_M = new WeakMap();
  const PORT_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'specularIntensityMap', 'specularColorMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap', 'anisotropyMap'];
  function portTex(t) {
    if (PORT_T.has(t)) return PORT_T.get(t);
    const rt = RT_OF.get(t), main = G.renderer; let d = null;
    if (rt && main) {
      try {
        const w = rt.width, h = rt.height, b = new Uint8Array(w * h * 4);
        main.readRenderTargetPixels(rt, 0, 0, w, h, b);   // (the rows as the target holds them: sampled the same way, flipY off)
        d = new THREE.DataTexture(b, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
        d.colorSpace = t.colorSpace; d.wrapS = t.wrapS; d.wrapT = t.wrapT; d.anisotropy = t.anisotropy || 1;
        d.generateMipmaps = true; d.minFilter = THREE.LinearMipmapLinearFilter; d.magFilter = THREE.LinearFilter;
        d.repeat.copy(t.repeat); d.offset.copy(t.offset); d.center.copy(t.center); d.rotation = t.rotation; d.matrixAutoUpdate = t.matrixAutoUpdate; d.matrix.copy(t.matrix); d.channel = t.channel;
        d.needsUpdate = true;
      } catch (e) { d = null; }
    }
    PORT_T.set(t, d); return d;
  }
  function portMat(m, mm) {
    if (!m) return m;
    const had = mm.get(m); if (had) return had;
    let c = null;
    for (const k of PORT_SLOTS) {
      const t = m[k]; if (!t || !RT_OF.has(t)) continue;
      const d = portTex(t); if (!d) continue;
      if (!c) { c = m.clone(); c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; }
      c[k] = d;
    }
    mm.set(m, c || m); if (c) mm.set(c, c);
    return c || m;
  }
  X.portable = function (root, renderer) {
    if (!root || !renderer || renderer === G.renderer) return root;
    let mm = PORT_M.get(renderer); if (!mm) PORT_M.set(renderer, (mm = new WeakMap()));
    root.traverse((o) => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => portMat(m, mm)) : portMat(o.material, mm); });
    return root;
  };
  // the baked surfaces of a model read back now, ahead of its preview (behind the loading screen): how many were read, in what time
  X.portRead = function (root) {
    const t0 = performance.now(); let n = 0;
    if (root) root.traverse((o) => { const ms = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) for (const k of PORT_SLOTS) { const t = m && m[k]; if (t && RT_OF.has(t) && !PORT_T.has(t)) { portTex(t); n++; } } });
    return { n, ms: Math.round(performance.now() - t0) };
  };

  // ---- the world's surfaces. Each keeps the layout of the one it replaces (rows and columns of stone, the way the planks run, the
  // emblem on the cloth) and its lightness, because the colour of a place is laid over it. [normal strength, GLSL] ----
  // Masonry is built as a mason builds it: every stone its own block, with its own length, colour, tilt and wear; its arris rounded and
  // knocked off in places; the joint between stones a recess of mortar (lighter lime, eroded deeper here, smeared over a worn edge
  // there, dirt and moss gathered in it) - never a ruled black line. The courses stay where world.js expects them (rows per repeat:
  // bricks 8, ashlar 4): their bed joints lie on uv.y * rows = whole numbers, bent by a few millimetres at most.
  const MASON = `
float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
float jit(float j, float n, float r, float sd, float sp){ return (hash12(vec2(mod(j, n), r) + sd) - .5) * sp; }
// a head joint left out (two stones taken as one long one): never two running, so a stone spans two places at most
float gone(float j, float n, float r, float sd, float mg){ return step(hash12(vec2(mod(j, n), r) + sd + 17.), mg) * step(mg, hash12(vec2(mod(j - 1., n), r) + sd + 17.)); }
// a coursed wall: R courses per repeat, about C stones to a course (one more or one less, course by course), the head joints spread
// unevenly by sp and now and then left out (mg). lc: the place within the stone from its middle, hs: its half size (both in uv)
void units(vec2 uv, float R, float C, float sp, float mg, float sd, out vec2 lc, out vec2 hs, out float id){
  float y = uv.y * R, r = floor(y), fy = y - r; r = mod(r, R);
  float n = max(1., C + floor(hash12(vec2(r, sd)) * 3.) - 1.);
  float x = uv.x * n + hash12(vec2(r, sd + 3.)) * n, k = floor(x);
  float b0 = k + jit(k, n, r, sd, sp); if (x < b0) { k -= 1.; b0 = k + jit(k, n, r, sd, sp); }
  float b1 = k + 1. + jit(k + 1., n, r, sd, sp); if (x > b1) { k += 1.; b0 = b1; b1 = k + 1. + jit(k + 1., n, r, sd, sp); }
  if (gone(k + 1., n, r, sd, mg) > .5) b1 = k + 2. + jit(k + 2., n, r, sd, sp);
  else if (gone(k, n, r, sd, mg) > .5) { k -= 1.; b0 = k + jit(k, n, r, sd, sp); }
  lc = vec2((x - (b0 + b1) * .5) / n, (fy - .5) / R); hs = vec2((b1 - b0) * .5 / n, .5 / R);
  id = hash12(vec2(mod(k, n), r) + sd * 3.1 + 11.);
}
// one stone laid in its mortar. ed: how far in from the joint (uv), the stone's numbers i (0..1 each), its face height (before the
// arris), the arris width bev, the chips' reach cw and how often (cf); hm: the mortar's height. Out: height, and how much is mortar
float lay(float ed, float face, float bev, float chip, float cw, float hm, out float isM){
  float t = clamp(ed / bev, 0., 1.), prof = 1. - (1. - t) * (1. - t);
  float sh = hm - .1 + (face - hm + .1) * prof;
  float c = chip * smoothstep(cw, cw * .25, ed); sh = mix(sh, hm - .06 + (face - hm + .06) * clamp(ed / cw, 0., 1.) * .8, c);
  sh = ed < 0. ? -1. : sh;
  float m = hm - max(ed, 0.) * 36.;
  isM = step(sh, m); return max(sh, m);
}
// water and dirt run down a wall in streaks (v is up on a wall): in some stretches only, of uneven width
float streak(vec2 uv, float per, float sd){
  float s = vnA(vec2(uv.x * per, uv.y * 2.), vec2(per, 2.), sd) * .6 + vnA(vec2(uv.x * per * 3., uv.y * 4.), vec2(per * 3., 4.), sd + 1.) * .4;
  return smoothstep(.56, .8, s) * smoothstep(.45, .7, fbm3(uv, 3., sd + 2.));
}
// broken faces: each cell a plane of its own slant (sl) and height, blended with its neighbour over bw next to the border (narrow: a
// sharp fresh break, wide: a worn one), so the surface stays whole - creases and small steps, never a crack
float facets(vec2 uv, float per, float sd, float sl, float bw){
  vec2 p = uv * per, i = floor(p), f = fract(p); float d1 = 9., d2 = 9., h1 = 0., h2 = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), c = mod(i + g, per), r = g + hash22(c + sd) - f; float d = dot(r, r);
    float hp = (hash12(c + sd + 3.) - .5) * .5 + dot((hash22(c + sd + 7.) - .5) * sl, -r);
    if (d < d1) { d2 = d1; h2 = h1; d1 = d; h1 = hp; } else if (d < d2) { d2 = d; h2 = hp; }
  }
  return mix(h1, h2, .5 * smoothstep(bw, 0., sqrt(d2) - sqrt(d1)));
}
// pits where softer grains have weathered out: few, of every size
float pits(vec2 uv, float per, float sd, float k){ vec3 v = voro(uv, per, sd); float r = .08 + .2 * hash12(vec2(v.z * 17., sd)); return smoothstep(r, r * .3, v.x) * step(1. - k, v.z); }
`;
  const SRC = X.SRC = {};
  // (small dressed stones in courses, a quarter to a third of a metre high and of every length: rough, pillowed faces, broken arrises,
  // wide lime joints that the weather has eaten into)
  SRC.bricks = [1.25, MASON + `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 w = uv + (vec2(fbm3(uv, 7., 1.), fbm3(uv, 7., 2.)) - .5) * .005;
  vec2 lc, hs; float id; units(w, 8., 4., .74, .17, 11., lc, hs, id);
  float i1 = hash12(vec2(id * 41.7, 1.)), i2 = hash12(vec2(id * 13.3, 2.)), i3 = hash12(vec2(id * 7.1, 3.)), i4 = hash12(vec2(id * 3.7, 4.)), i5 = hash12(vec2(id * 29.9, 5.));
  float e1 = fbm3(uv, 30., 5.), e2 = vnoise(uv * 150., 150., 6.);
  float d = -sdRB(lc, hs, .004 + i1 * .018) + (e1 - .5) * .011 + (e2 - .5) * .0026;
  float mw = .0022 + .0018 * fbm3(uv, 11., 8.), ed = d - mw;
  vec2 q = lc / hs;
  float mid = fbm(uv + id * .73, 9., 4.), fine = fbm(uv, 40., 5.), grit = vnoise(uv * 480., 480., 7.);
  // the face: pillowed and pitched by the hammer into small broken planes (a rough-dressed stone), a little out of true; pits where
  // the softer grains weathered out
  float pil = (1. - q.x * q.x * q.x * q.x) * (1. - q.y * q.y) * (.08 + i2 * .16);
  float pf = facets(uv + id * .19, 30., 13., 1.4, .14 + i3 * .12);
  float face = .56 + (i3 - .5) * .08 + pil + pf * (.04 + i4 * .04) + q.x * (i4 - .5) * .07 + q.y * (i5 - .5) * .06 + (mid - .5) * .12 + (fine - .5) * .06 + (grit - .5) * .025;
  float pt = pits(uv + id * .31, 46., 8., .1 * step(.5, i1)); face -= pt * .035;
  float ero = fbm3(uv, 13., 21.), hm = .38 + (grit - .5) * .05 - smoothstep(.45, .75, ero) * .16, isM;
  float chip = smoothstep(.58, .64, fbm3(uv + id, 16., 9.));
  h = lay(ed, face, .0025 + i2 * .004, chip, .006 + i3 * .008, hm, isM);
  // colour: each stone from its own bed (a little warmer or greyer, lighter or darker), mottled, a fresh break pale, grime toward the
  // joints; the mortar a dirty lime about as dark as the stone, darker where it is eaten back and earth has settled in it, green in
  // the damp
  float v = .62 + (i1 - .5) * .18 + (i5 > .9 ? -.1 : 0.) + (i4 > .94 ? .08 : 0.);
  vec3 tone = mix(vec3(1., .96, .915), vec3(.965, .965, .965), i2); tone = mix(tone, vec3(1., .93, .84), step(.9, i3) * .5);
  vec3 stone = tone * v * (1. + (mid - .5) * .24 + (fine - .5) * .14 + (grit - .5) * .1 + pf * .05);
  float brk = clamp(1. - ed / (.006 + i3 * .008), 0., 1.) * chip;
  stone *= 1. + brk * .1 - pt * .12 - smoothstep(.012, .0, ed) * (1. - brk) * .1;
  stone *= 1. - streak(uv, 16., 31.) * .16 - smoothstep(.3, -.6, q.y) * (1. - q.x * q.x) * .05;
  float dirt = smoothstep(.34, .24, hm), moss = smoothstep(.62, .8, fbm3(uv, 6., 12.)) * dirt;
  vec3 mort = vec3(.56, .545, .51) * (.8 + grit * .25 + (fine - .5) * .3 + (mid - .5) * .2);
  mort = mix(mort, vec3(.3, .27, .23) * (.8 + fine * .4), dirt * .8); mort = mix(mort, vec3(.33, .38, .24), moss * .6);
  float damp = smoothstep(.5, .76, fbm3(uv, 3., 3.) + (mid - .5) * .25);
  vec3 c = mix(stone, mort, isM) * mix(vec3(1.), vec3(.8, .82, .76), damp * .75);
  col = S(c * 1.26);
  rough = mix(.9 - brk * .08 + (fine - .5) * .1, .98, isM) - damp * .14; metal = 0.;
}`];
  // (big dressed blocks, four courses to a repeat: tight lime joints, a smoothed margin round each face and the field within it pecked
  // by the point, arrises a little worn and knocked, now and then a skin scaled away or a hairline crack wandering across a block)
  SRC.ashlar = [1.0, MASON + `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 w = uv + (vec2(fbm3(uv, 5., 1.), fbm3(uv, 5., 2.)) - .5) * .003;
  vec2 lc, hs; float id; units(w, 4., 2., .55, .1, 23., lc, hs, id);
  float i1 = hash12(vec2(id * 41.7, 1.)), i2 = hash12(vec2(id * 13.3, 2.)), i3 = hash12(vec2(id * 7.1, 3.)), i4 = hash12(vec2(id * 3.7, 4.)), i5 = hash12(vec2(id * 29.9, 5.));
  float e1 = fbm3(uv, 28., 5.), e2 = vnoise(uv * 170., 170., 6.);
  float d = -sdRB(lc, hs, .0015 + i1 * .005) + (e1 - .5) * .0026 + (e2 - .5) * .001;
  float mw = .0013 + .0011 * fbm3(uv, 9., 8.), ed = d - mw;
  vec2 q = lc / hs;
  float mid = fbm(uv + id * .73, 10., 4.), fine = fbm(uv, 48., 5.), grit = vnoise(uv * 520., 520., 7.);
  float marg = smoothstep(.007, .01, ed + (e1 - .5) * .002), peck = vnoise(uv * 330. + id * 31., 330., 12.);
  float sug = vnoise(vec2(uv.x * 2. + uv.y, uv.y * 2. - uv.x) * 230., 230., 15.);
  float face = .6 + (i3 - .5) * .04 + q.x * (i4 - .5) * .03 + q.y * (i5 - .5) * .03 + (mid - .5) * .085 + (fine - .5) * .04 + (grit - .5) * .012 + marg * (peck - .5) * .02 + (sug - .5) * .02 * (.4 + i2);
  // (a skin scaled away in small patches, most about the corners and low on the block: a crisp edge, the break rough)
  float scl = smoothstep(.72, .75, fbm3(uv + id * 1.37, 26., 14.) + abs(q.x * q.y) * .14 - q.y * .04 + (i3 - .5) * .16) * step(.6, i2);
  face -= scl * (.032 + (fine - .5) * .025 + (grit - .5) * .02);
  // (a hairline crack in one block in eight: up from a bed joint, leaning, wandering, dying out part way)
  float ca = 1.5708 + (i4 - .5) * 1.1; vec2 cdir = vec2(cos(ca), sin(ca)), cn = vec2(-cdir.y, cdir.x);
  float al = dot(lc, cdir), ac = dot(lc, cn) - (i2 - .5) * hs.x + (vnoise(vec2(al * 300., id * 50.), 999., 41.) - .5) * .003 + (vnoise(vec2(al * 60., id * 50.), 999., 42.) - .5) * .014;
  float cr = step(.875, i5) * smoothstep(.0016, .0004, abs(ac)) * smoothstep(-hs.y + (.5 + i3) * hs.y, -hs.y + (.3 + i3) * hs.y, al);
  face -= cr * .06;
  float ero = fbm3(uv, 11., 21.), hm = .4 + (grit - .5) * .03 - smoothstep(.5, .78, ero) * .14, isM;
  float chip = smoothstep(.62, .67, fbm3(uv + id, 14., 9.));
  h = lay(ed, face, .0012 + i2 * .002, chip, .004 + i3 * .006, hm, isM);
  float v = .74 + (i1 - .5) * .36 + (i4 > .93 ? .09 : 0.) + (i4 < .06 ? -.13 : 0.);
  vec3 tone = mix(vec3(1., .955, .9), vec3(.955, .96, .965), i2); tone = mix(tone, vec3(1., .93, .83), step(.88, i3) * .55);
  vec3 stone = tone * v * (1. + (mid - .5) * .3 + (fine - .5) * .15 + (grit - .5) * .06 + marg * (peck - .5) * .035 + (sug - .5) * .05);
  float brk = clamp(1. - ed / (.004 + i3 * .006), 0., 1.) * chip;
  stone *= 1. + brk * .1 + scl * .03 - cr * .35 - smoothstep(.008, .0, ed) * (1. - brk) * .06;
  stone = mix(stone, stone * vec3(1.04, .98, .92), scl * .55);
  stone *= (1. - streak(uv, 12., 31.) * .14 - smoothstep(.1, -.9, q.y) * .08 * (.5 + i2)) * (1.03 - marg * .03);
  float dirt = smoothstep(.4, .33, hm);
  vec3 mort = vec3(.7, .68, .64) * (.84 + grit * .28 + (fine - .5) * .2);
  mort = mix(mort, vec3(.34, .31, .27) * (.8 + fine * .4), dirt * .75);
  // (the damp and grime of the wall itself, in broad patches that do not stop at the joints)
  float damp = smoothstep(.5, .76, fbm3(uv, 3., 3.) + (mid - .5) * .25), grime = smoothstep(.52, .8, fbm3(uv, 8., 44.)) * (.6 + .4 * i3);
  vec3 c = mix(stone, mort, isM) * mix(vec3(1.), vec3(.74, .77, .7), damp * .9) * (1. - grime * .22);
  c = mix(c, c * vec3(.8, .88, .72), smoothstep(.62, .84, fbm3(uv, 5., 45.)) * damp * .7);
  col = S(c * 1.135);
  rough = mix(.86 - brk * .06 + scl * .08 + (fine - .5) * .1, .97, isM) - damp * .14; metal = 0.;
}`];
  // (a floor of laid slabs, four courses to a repeat as before: each slab its own stone and its own wear - dished where feet went,
  // some sunk or tilted a little, one in five cracked across with the parts not quite level, corners broken; tight joints filled
  // with packed earth and grit, the damp lying in the hollows. No dark lines drawn across a slab)
  SRC.flag = [1.15, MASON + `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 w = uv + (vec2(fbm3(uv, 6., 1.), fbm3(uv, 6., 2.)) - .5) * .006;
  vec2 lc, hs; float id; units(w, 4., 3., .7, .1, 37., lc, hs, id);
  float i1 = hash12(vec2(id * 41.7, 1.)), i2 = hash12(vec2(id * 13.3, 2.)), i3 = hash12(vec2(id * 7.1, 3.)), i4 = hash12(vec2(id * 3.7, 4.)), i5 = hash12(vec2(id * 29.9, 5.));
  float e1 = fbm3(uv, 24., 5.), e2 = vnoise(uv * 140., 140., 6.);
  float d = -sdRB(lc, hs, .004 + i1 * .012) + (e1 - .5) * .008 + (e2 - .5) * .002;
  float mw = .0016 + .0016 * fbm3(uv, 9., 8.), ed = d - mw;
  vec2 q = lc / hs;
  float mid = fbm(uv + id * .73, 8., 4.), fine = fbm(uv, 40., 5.), grit = vnoise(vec2(uv.x * 2. + uv.y, uv.y * 2. - uv.x) * 200., 200., 7.);
  float sink = (i3 - .5) * .05 + q.x * (i4 - .5) * .025 + q.y * (i5 - .5) * .025;
  float dish = (1. - q.x * q.x) * (1. - q.y * q.y) * (.02 + i2 * .05);
  // the crack: a wandering line across the slab, the part beyond it a little higher or lower
  float ca = i4 * 3.1416; vec2 cdir = vec2(cos(ca), sin(ca)), cn = vec2(-cdir.y, cdir.x);
  float cd = dot(lc - hs * (vec2(i2, i5) - .5) * .8, cn) + (vnoise(vec2(dot(lc, cdir) * 160., id * 40.), 9973., 43.) - .5) * .004 + (vnoise(vec2(dot(lc, cdir) * 30., id * 40.), 9973., 44.) - .5) * .012;
  float crk = step(.8, i1), cr = crk * smoothstep(.0016, .0004, abs(cd));
  float face = .58 + sink - dish + crk * step(0., cd) * (i3 - .5) * .05 + (mid - .5) * .07 + (fine - .5) * .035 + (grit - .5) * .015;
  float pt = pits(uv + id * .3, 50., 8., .06); face -= pt * .03 + cr * .08;
  float hm = .34 + (grit - .5) * .04, isM;
  float chip = smoothstep(.58, .64, fbm3(uv + id, 14., 9.));
  float cw = step(.45, hash12(vec2(id * 7. + sign(q.x), sign(q.y) + 3.)));
  chip = max(chip, smoothstep(.62, .92, min(abs(q.x), abs(q.y))) * cw);
  h = lay(ed, face, .002 + i2 * .003, chip, .006 + i3 * .01, hm, isM);
  // colour: each slab its own (warmer, greyer, now and then a much paler or darker one: a replacement); the worn ones paler and
  // smoother in their dish; grime toward the joints; damp in the hollows; earth and grit in the joints, moss here and there
  float v = .66 + (i1 - .5) * .22 + (i5 > .92 ? .1 : 0.) + (i5 < .07 ? -.12 : 0.);
  vec3 tone = mix(vec3(1., .96, .915), vec3(.955, .96, .965), i2); tone = mix(tone, vec3(1., .93, .84), step(.88, i3) * .5);
  float worn = smoothstep(.4, .8, i4) * dish / (.02 + i2 * .05);
  vec3 stone = tone * v * (1. + (mid - .5) * .2 + (fine - .5) * .12 + (grit - .5) * .07);
  stone *= 1. + worn * .08 - smoothstep(.02, .0, ed) * .1 - pt * .1 - cr * .45;
  float damp = smoothstep(.55, .8, fbm3(uv, 3., 31.) + dish * 3. - sink * 2.);
  stone *= 1. - damp * .2;
  vec3 mort = vec3(.32, .28, .23) * (.75 + fine * .5 + (grit - .5) * .25);
  mort = mix(mort, vec3(.27, .31, .19), smoothstep(.62, .8, fbm3(uv, 6., 12.)) * .5);
  col = S(mix(stone, mort, isM) * 1.19);
  rough = mix(.92 - worn * .2 - damp * .3 + (fine - .5) * .08, 1., isM); metal = 0.;
}`];
  // (a paving of broken flags as the old road was laid: big flat stones of every shape, their tops nearly level and only a little rounded
  // at the edge; narrow joints, one to two and a half centimetres, sunk and packed with earth, grit and moss; each stone its own colour,
  // the ones where feet go worn smoother and paler. No white rims, no honeycomb of dark lines)
  SRC.cobble = [1.25, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 w = uv + (vec2(fbm3(uv, 6., 1.), fbm3(uv, 6., 2.)) - .5) * .03 + (vec2(fbm3(uv, 19., 3.), fbm3(uv, 19., 4.)) - .5) * .006;
  vec3 v = voro(w, 7., 41.); float e = v.y - v.x;
  float i1 = hash12(vec2(v.z * 41.7, 1.)), i2 = hash12(vec2(v.z * 13.3, 2.)), i3 = hash12(vec2(v.z * 7.1, 3.)), i4 = hash12(vec2(v.z * 3.7, 4.));
  float mid = fbm(uv, 12., 4.), fine = fbm(uv, 48., 5.), grit = vnoise(vec2(uv.x * 2. + uv.y, uv.y * 2. - uv.x) * 220., 220., 6.);
  // (the joint: e is about twice the distance to it in cells of a seventh of the repeat; ragged along its length)
  float ew = e + (fine - .5) * .025 + (grit - .5) * .01;
  float gw = .035 + .045 * fbm3(uv, 7., 9.);
  float st = smoothstep(gw, gw + .02, ew);
  float edge = smoothstep(gw, gw + .16, ew);
  // (a flat top, tilted or sunk a little stone by stone, its edge rounded over a short way, never domed)
  float top = .56 + (i3 - .5) * .07 + (i2 - .5) * .03 * (v.x * 3.) + (mid - .5) * .06 + (fine - .5) * .05 + (grit - .5) * .02 - (1. - edge) * .05;
  float gap = .4 + fbm3(uv, 30., 7.) * .06 + (grit - .5) * .03;
  h = mix(gap, top, st);
  float worn = smoothstep(.45, .85, fbm3(uv, 2., 22.)) * (.5 + i4 * .5);
  float val = .62 + (i1 - .5) * .24 + (i3 > .93 ? .07 : 0.) + (i3 < .08 ? -.08 : 0.);
  vec3 tone = mix(vec3(1., .96, .91), vec3(.95, .96, .97), i2); tone = mix(tone, vec3(1., .92, .82), step(.82, i4) * .4);
  vec3 c = tone * val * (1. + (mid - .5) * .24 + (fine - .5) * .16 + (grit - .5) * .08);
  c *= (1. + worn * .1) * (.86 + .14 * edge);
  float moss = smoothstep(.55, .75, fbm3(uv, 4., 21.)) * (1. - st);
  vec3 ga = mix(vec3(.31, .27, .22), vec3(.26, .31, .18), moss) * (.7 + fine * .5);
  col = S(mix(ga, c, st) * 1.37);
  rough = mix(1., .88 - worn * .22 + (fine - .5) * .1, st); metal = 0.;
}`];
  // (fine dressed limestone - cornices, copings, posts: a soft cloud of tone, a fine grit, a few small hollows weathered out of every
  // size, a faint wandering vein, the skin flaked in a patch here and there, grime in broad stains. No ruled lines, no rows of dots)
  SRC.smooth = [0.6, MASON + `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float big = fbm3(uv, 3., 53.), mid = fbm(uv, 12., 4.), fine = fbm(uv, 48., 5.), grit = vnoise(vec2(uv.x * 2. + uv.y, uv.y * 2. - uv.x) * 260., 260., 6.);
  float pt = pits(uv, 26., 8., .07) * (.5 + .5 * smoothstep(.4, .7, big));
  float vr = 1. - abs(fbm(uv + vec2(fbm3(uv, 2., 7.), fbm3(uv, 2., 8.)) * .2, 3., 9.) * 2. - 1.);
  float vein = smoothstep(.955, .99, vr) * smoothstep(.45, .65, fbm3(uv, 4., 10.));
  float scl = smoothstep(.69, .71, fbm3(uv, 10., 14.) + (fine - .5) * .08);
  h = .6 + (mid - .5) * .12 + (fine - .5) * .06 + (grit - .5) * .03 - pt * .06 - scl * (.025 + (grit - .5) * .02) - vein * .01;
  vec3 c = vec3(.86) * (.86 + mid * .2 + (fine - .5) * .1 + (grit - .5) * .06);
  c = mix(c, c * vec3(.8, .8, .78), smoothstep(.55, .78, big) * .55);
  c *= 1. - pt * .14 - vein * .1;
  c = mix(c, c * vec3(1.03, .99, .94), scl * .5);
  c *= 1. - streak(uv, 10., 15.) * .12;
  col = S(c);
  rough = .9 + (fine - .5) * .14 - smoothstep(.5, .7, big) * .12 + scl * .05; metal = 0.;
}`];
  // (living rock, as a cliff or the wall of a working shows it: one whole face. Beds of uneven thickness run across it, bent by the
  // broad lie of the rock; each bed a gentle scoop between two lips, the lip of the one below standing out over a short steep face,
  // and finer beds within them; joints across the beds, here and there, as steps. Creases where the rock was folded, grains, pits.
  // Some beds paler, some darker; damp and rust run down from the lips; the beds open along a lip in places, with earth in the gap.
  // No cells and no network of lines: the eye reads beds and breaks, as in a quarry face)
  SRC.rock = [2.1, MASON + `
float scoop(float t, float p){ float x = fract(t); return pow(x, p) - x; }
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 w1 = vec2(fbm3(uv, 3., 1.), fbm3(uv, 3., 2.)) - .5, q = uv + w1 * .08;
  float big = fbm(q, 3., 61.), mid = fbm(q, 9., 4.), fine = fbm(uv, 36., 5.), grit = vnoise(vec2(uv.x * 2. + uv.y, uv.y * 2. - uv.x) * 190., 190., 6.);
  // the beds: a measure up the face, bent; five to a repeat, and finer ones within them
  float bc = q.y * 5. + (big - .5) * 2.6 + sin(q.x * 6.2831853 + big * 3.) * .5 + (mid - .5) * .4, bi = floor(bc), bf = fract(bc), b0 = mod(bi, 5.);
  float pw = 3. + hash12(vec2(b0, 81.)) * 4.;
  float beds = scoop(bc, pw) * (.22 + hash12(vec2(b0, 82.)) * .2) + scoop(bc * 3. + (fine - .5) * .3, 3.) * .06;
  // the joints across the beds: a step now and then, not through every bed
  float jc = q.x * 4. + (mid - .5) * .9 + (fine - .5) * .15 + hash12(vec2(b0, 83.)) * 4.;
  float jm = step(.4, hash12(vec2(mod(floor(jc), 4.), b0) + 84.));
  float joints = scoop(jc, 7.) * .16 * jm;
  // folds: soft creases running with the beds
  float cr = 1. - abs(fbmA(vec2(q.x, q.y + (big - .5) * .2), vec2(4., 12.), 85.) * 2. - 1.);
  float ff = facets(uv, 70., 90., 1.4, .06), hc = smoothstep(.955, .985, ridge(uv, 22., 91.)) * smoothstep(.5, .68, fbm3(uv, 6., 92.));
  float face = .62 + beds + joints + cr * cr * .06 + (big - .5) * .1 + (mid - .5) * .06 + (fine - .5) * .03 + (grit - .5) * .012 + ff * .025 - hc * .015;
  float pt = pits(uv, 52., 73., .07); face -= pt * .025;
  // a bed open along its lip in stretches: a slot with earth in it
  float open = smoothstep(.55, .7, fbm3(vec2(q.x, b0 * .17), 5., 86.)) * smoothstep(.9, .975, bf + (fine - .5) * .015);
  h = mix(face, .12 + (fine - .5) * .05, open);
  // colour: a tone per bed (now and then one markedly paler or darker), mottled; the lips worn paler, the steep faces under them
  // darker; mineral grains; rust and damp running down from the lips; earth in the open beds
  float v = .6 + (hash12(vec2(b0, 87.)) - .5) * .16 + (hash12(vec2(b0, 88.)) > .8 ? .08 : 0.);
  vec3 tone = mix(vec3(1., .965, .925), vec3(.965, .965, .965), hash12(vec2(b0, 89.))); tone = mix(tone, vec3(1., .94, .86), step(.78, hash12(vec2(b0, 90.))) * .6);
  vec3 c = tone * v * (1. + (big - .5) * .26 + (mid - .5) * .18 + (fine - .5) * .12 + (grit - .5) * .05);
  float lip = smoothstep(.75, .97, bf), under = smoothstep(.55, .9, bf) * (1. - lip);
  c *= (1. + lip * .08 + ff * .04) * (1. - under * .12) * (1. - pt * .06 - hc * .15) * (1. - smoothstep(.88, .99, fract(jc)) * jm * .1);
  c *= 1. + step(.94, grit) * .06 - step(grit, .05) * .1;
  float run = streak(uv, 14., 77.) * smoothstep(.2, .95, bf);
  c = mix(c, c * vec3(1.05, .87, .7), smoothstep(.6, .8, fbm3(uv, 7., 76.)) * run * .7);
  c *= 1. - run * .18;
  vec3 earth = vec3(.3, .27, .23) * (.8 + fine * .5);
  col = S(mix(c, earth, open * .85) * 1.2);
  rough = mix(.92 - lip * .05 - run * .12 + (fine - .5) * .08, 1., open); metal = 0.;
}`];
  // (old boards, five to a repeat as before, made of colour more than of lines: each board its own tone; long soft bands of lighter and
  // darker running down it, uneven in width and depth; a plain-sawn board shows one or two flame-shaped figures where only now and then a
  // ring is dark enough to read as a line, a quarter-sawn one a few straight streaks; knots; the weather greying it in patches and at its
  // ends; checks near the ends along the grain; nails with rust run out round them. The relief is the fibres raised by the weather, the
  // checks and a little cupping of the board - not the grain drawn as lines. Narrow shallow gaps)
  SRC.planks = [0.8, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = 5., px = uv.x * n, k = floor(px), pid = mod(k, n), fx = px - k;
  float pr = hash12(vec2(pid, 71.)), pr2 = hash12(vec2(pid, 8.)), pr3 = hash12(vec2(pid, 9.)), pr4 = hash12(vec2(pid, 10.));
  float pv = fract(uv.y + pr), seg = floor(pv * 2.), fy = fract(pv * 2.);
  float sd = hash12(vec2(pid * 7. + seg, 13.)), sd2 = hash12(vec2(pid * 7. + seg, 14.)), sd3 = hash12(vec2(pid * 7. + seg, 15.)), sd4 = hash12(vec2(pid * 7. + seg, 16.));
  float gx = min(fx, 1. - fx) / n, gy = min(fy, 1. - fy) * .5;
  float edge = min(gx, gy) + (vnoise(uv * vec2(40., 160.), 9973., 3.) - .5) * .001;
  float gap = smoothstep(.0003, .0013, edge), arr = smoothstep(.0, .005, edge);
  // the long bands of the grain: soft, of every width, the board's own
  float band = vnA(vec2(fx * 7. + pid * 3.1, pv * 1.5), vec2(999., 1.5), pid + 20.) * .6 + vnA(vec2(fx * 19. + pid, pv * 3.), vec2(999., 3.), pid + 21.) * .4;
  // the figure: plain-sawn (flame-shaped arches about a centre line) or quarter-sawn (straight), a ring dark enough to read only now and then
  float plain = step(.45, sd4), cx = .3 + .4 * sd, py = sd2 * 1.4 - .2;
  float arch = abs(fx - cx) * 2.6 + max(0., py - fy) * (1.2 + sd3) - max(0., fy - py) * .05;
  float t = mix(fx * (5. + pr * 4.) + (band - .5) * .5, arch * (4. + pr * 3.) - fy * .2, plain) + (vnA(vec2(fx * 4., pv * 8.), vec2(999., 8.), pid + 30.) - .5) * .6;
  float rid = floor(t), rf = fract(t), dark = step(.62, hash12(vec2(rid, pid + seg * 7. + 31.)));
  float line = smoothstep(.0, .12, rf) * (1. - smoothstep(.2, .45, rf)) * dark;
  float soft = smoothstep(.0, .5, rf) * (1. - smoothstep(.5, 1., rf));
  // knots, one length in three
  vec2 kd = vec2((fx - (.25 + .5 * sd3)) / n, (fy - (.25 + .5 * sd)) * .5);
  float kr = length(kd * vec2(1., .45)), kn = step(.5, sd2) * smoothstep(.006, .002, kr), kh = step(.5, sd2) * smoothstep(.02, .004, kr);
  // the weather: greyed in patches, more toward the ends of a length and on the soft wood
  float wth = clamp(pr2 * .5 + fbm3(uv, 3., 60.) * .6 + smoothstep(.2, .0, gy * 2.) * .25 - .2, 0., 1.);
  // checks: short splits along the grain, near the ends of a length
  float cxp = hash12(vec2(pid, 50. + seg)), end = smoothstep(.22, .0, min(fy, 1. - fy));
  float chk = step(.35, hash12(vec2(pid, 51. + seg))) * smoothstep(.0012, .0003, abs(fx - cxp + (vnoise(vec2(pv * 30., pid), 9973., 52.) - .5) * .05) / n) * end;
  float fib = vnA(vec2(fx * 90. + (band - .5) * 3., pv * 3.), vec2(999., 3.), pid + 40.), fib2 = vnA(vec2(fx * 220. + (band - .5) * 6., pv * 6.), vec2(999., 6.), pid + 41.);
  float fib3 = vnA(vec2(fx * 46. + pid * 7., pv * 1.5), vec2(999., 1.5), pid + 44.);
  float cup = (1. - (2. * fx - 1.) * (2. * fx - 1.)) * (pr4 - .5) * .05;
  h = .55 + cup + ((fib - .5) * .06 + (fib2 - .5) * .035 + (fib3 - .5) * .03) * (.5 + wth) - chk * .12 - kh * .03 + line * .006;
  h = mix(.3, h * (.94 + .06 * arr), gap);
  vec3 base = mix(vec3(.6, .47, .35), vec3(.5, .4, .32), pr) * (.8 + pr2 * .34);
  vec3 wood = base * (1. + (band - .5) * .34 + (soft - .5) * .08 - line * .16 + (fib - .5) * .09 + (fib2 - .5) * .06 + (fib3 - .5) * .12 - kh * .1);
  wood = mix(wood, vec3(.3, .22, .16), kn * .8);
  vec3 grey = vec3(.57, .55, .52) * (.86 + (band - .5) * .12 + (fib - .5) * .1);
  wood = mix(wood, grey, wth * .65);
  float na = step(.5, fx), nb = step(.5, fy);
  vec2 nd = vec2((fx - (.28 + .44 * na)) / n, (fy - (.055 + .89 * nb)) * .5), nr = nd * vec2(1., .35);
  float nail = smoothstep(.0032, .002, length(nd));
  float rust = exp(-dot(nr, nr) / .00003) * step(.3, hash12(vec2(pid + na, seg + nb + 60.)));
  wood = mix(wood, wood * vec3(.72, .52, .38), rust * .6);
  wood = mix(wood, vec3(.16, .13, .11), nail);
  wood *= (1. - chk * .5) * mix(.7, 1., arr);
  col = S(mix(vec3(.24, .2, .16), wood, gap) * 1.42);
  rough = mix(1., .84 + wth * .1 + rust * .06 - nail * .2, gap); metal = 0.;
}`];
  SRC.metal = [0.9, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 5., 83.), n2 = fbm(uv, 28., 2.), n3 = fbm(uv, 120., 3.);
  vec3 v = voro(uv, 14., 3.);                                                    // hammer marks
  float rust = smoothstep(.56, .72, fbm(uv, 4., 88.) + (n2 - .5) * .35);
  float scr = smoothstep(.82, .94, ridge(uv, 6., 4.)) * (1. - rust);
  h = .5 + (v.x - .4) * .14 + (n2 - .5) * .12 + (n3 - .5) * .07 + rust * (n3 - .3) * .2 - scr * .05;
  float c = .34 + n1 * .12 + (n2 - .5) * .1 + scr * .2;
  vec3 steel = vec3(c, c, c * 1.05);
  col = S(mix(steel, vec3(.42, .25, .13) * (.8 + n3 * .5), rust));
  rough = mix(.7 + (n3 - .5) * .3 - scr * .2, 1., rust); metal = 0.;
}`];
  SRC.cloth = [1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = 64.; vec2 p = uv * n; float wa = sin(p.x * 6.2831853) * .5 + .5, we = sin(p.y * 6.2831853) * .5 + .5;
  float over = step(.5, fract((floor(p.x) + floor(p.y)) * .5)), weave = mix(wa, we, over);
  float n1 = fbm(uv, 6., 91.), n2 = fbm(uv, 40., 5.);
  // the emblem (a ring, a bar and a chevron) and the borders, stitched on in gold thread
  float dx = uv.x - .5, dy = uv.y - .42, r = length(vec2(dx, dy * .8)), emb = 0.;
  emb = max(emb, step(.17, r) * step(r, .2));
  emb = max(emb, step(abs(dx), .03) * step(abs(dy), .15));
  emb = max(emb, step(abs(abs(dx) - (dy + .1) * .6), .025) * step(-.1, dy) * step(dy, .12));
  emb = max(emb, step(uv.x, .05) + step(.95, uv.x));
  float tear = step(.9 + fbm(vec2(uv.x, 0.), 12., 92.) * .1, uv.y);
  float c = .76 + n1 * .22 + (weave - .5) * .1;
  vec3 thread = vec3(.85, .7, .4) * (.82 + n2 * .3 + sin((uv.x + uv.y) * 6.2831853 * 90.) * .08);
  col = S(mix(vec3(c), thread, emb) * (1. - tear));
  h = .4 + weave * .22 + (n2 - .5) * .2 + emb * .25;
  rough = mix(1., .62, emb); metal = 0.;
}`];
  const hide = (n, seed) => `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 w = uv + (vec2(fbm3(uv, 6., 1.), fbm3(uv, 6., 2.)) - .5) * .03;
  vec3 v = voro(w, ${n}., ${seed}.); float e = v.y - v.x;
  float n1 = fbm(uv, 8., ${seed}. + 1.), n2 = fbm(uv, 48., 5.);
  vec3 v2 = voro(uv, ${n}. * 4., 7.); float fine = smoothstep(.0, .12, v2.y - v2.x);    // the fine grain of the hide between the folds
  float hh = min(1., e * 2.5) * .6 + n1 * .3 + fine * .1;
  h = hh;
  float c = .56 + hh * .38 + (n1 - .5) * .2 + (v.z - .5) * .06;
  col = S(vec3(c));
  rough = .92 - smoothstep(.2, .7, e) * .2 + (n2 - .5) * .12; metal = 0.;
}`;
  SRC.skin = [1.1, hide(10, 101)];
  SRC.scales = [1.3, hide(18, 107)];
  // (rough pasture as seen from standing height: what reads is the variation over a third of a metre to a couple of metres - clumps of
  // denser, darker grass and thinner, paler ones between, patches gone to straw, bare earth showing in ragged spots, a trodden way
  // flattened and worn. The single tufts are only a faint grain within that, their lean every way, not a pebbly surface; nothing in it
  // catches a light as a point)
  SRC.grass = [0.35, `
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
// one tuft to each cell of the sward, leaning its own way; its blades a few thin strokes along the lean, fading toward its rim
float sward(vec2 uv, float per, float sd, vec2 fr, out float cid){
  vec2 p = uv * per, i = floor(p), f = fract(p); float best = 9., v = 0.; cid = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), c = mod(i + g, per), r = g + hash22(c + sd) - f; float d = dot(r, r);
    if (d < best) { best = d; cid = hash12(c + sd + 3.); vec2 q = rot2(r, cid * 6.2831853); float n = vnoise(q * fr + cid * 37., 9973., sd + 1.); v = (1. - abs(n * 2. - 1.)) * smoothstep(.95, .2, length(r)); }
  }
  return v;
}
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float c1; float bl = sward(uv, 90., 3., vec2(3.2, .6), c1);
  float fine = fbm3(uv, 60., 5.), grit = vnoise(vec2(uv.x * 2. + uv.y, uv.y * 2. - uv.x) * 300., 300., 6.);
  // (the middle scales: clumps (a third of a metre), patches (a metre or two), and the broad drifts)
  float clump = fbm(uv, 11., 170.), patchy = fbm3(uv, 4., 171.), drift = fbm3(uv, 2., 131.);
  float dense = smoothstep(.4, .68, clump);
  float dry = smoothstep(.46, .7, drift * .55 + patchy * .45 + (1. - dense) * .12);
  float bn = fbm3(uv, 7., 140.) * .7 + fbm3(uv, 23., 142.) * .3;
  float bare = smoothstep(.62, .7, bn + (1. - dense) * .06), thin = smoothstep(.5, .64, bn) * (1. - bare);
  // a trodden way: long, narrow, wandering across the turf
  float path = smoothstep(.62, .72, fbmA(vec2(uv.x + fbm3(uv, 3., 172.) * .3, uv.y), vec2(9., 2.), 173.)) * (1. - bare);
  float moss = smoothstep(.62, .82, fbm3(uv, 9., 150.)) * (1. - dry);
  vec3 live = mix(vec3(.28, .31, .17), vec3(.36, .38, .21), patchy);
  vec3 hay = mix(vec3(.5, .45, .3), vec3(.42, .37, .26), clump);
  vec3 g = mix(live, hay, dry);
  g = mix(g, vec3(.25, .29, .16), moss * .45);
  g *= .84 + dense * .1 - (1. - dense) * .04;
  g = mix(g, g * vec3(1.05, 1., .86), path * .5);
  vec3 soil = vec3(.34, .29, .22) * (.74 + fine * .4 + (grit - .5) * .2);
  // between the tufts a little shade and earth; the grain of the tufts is faint
  float cover = clamp(.78 + dense * .2 - thin * .5 - path * .35 + (bl - .5) * .14, 0., 1.);
  vec3 c = mix(soil * .78, g * (.96 + (bl - .5) * .12 + (c1 - .5) * .06 + (fine - .5) * .08), cover);
  c = mix(c, soil, bare);
  col = S(c * vec3(1.83, 1.92, 1.9));
  h = .34 + dense * .22 + patchy * .06 - path * .1 + (bl - .5) * .05 * cover - bare * .14 + (fine - .5) * .03;
  rough = 1.; metal = 0.;
}`];
  // (marble blocks, two by two to a repeat as before: the veins run with the bed of the stone - each block cut its own way - in two
  // orders, folded, coming and going; a cloud of tone; polished faces and patches the weather has made dull and sugary; a fine joint
  // with a little shade, not a drawn frame)
  SRC.marble = [0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 t = fract(uv * 2.); float id = hash12(floor(uv * 2.) + 141.);
  float seam = min(min(t.x, 1. - t.x), min(t.y, 1. - t.y)) * .5 + (vnoise(uv * 36., 36., 3.) - .5) * .0005;
  float joint = smoothstep(.0008, .0024, seam), arr = smoothstep(.0, .005, seam);
  float a = (id - .5) * 1.4 + .6; vec2 dir = vec2(cos(a), sin(a)), nrm = vec2(-dir.y, dir.x);
  vec2 w = t + (vec2(fbm3(uv, 3., 1.), fbm3(uv, 3., 2.)) - .5) * .35 + id * 3.7;
  float s = dot(w, nrm) * 3. + (fbm3(uv, 4., 5.) - .5) * 1.4 + sin(dot(w, dir) * 4. + id * 9.) * .25;
  float wd = .012 + .022 * fbm3(uv, 5., 6.);
  s += (fbm3(uv, 14., 12.) - .5) * .35;
  float v1 = smoothstep(wd, wd * .3, abs(fract(s) - .5)) * smoothstep(.35, .65, fbm3(uv + id, 4., 7.));
  float s2 = dot(w, nrm + dir * .4) * 11. + (fbm3(uv, 9., 8.) - .5) * 2.5;
  float v2 = smoothstep(.014, .004, abs(fract(s2) - .5)) * smoothstep(.45, .7, fbm3(uv + id * 2., 7., 9.));
  float cloud = fbm(w, 4., 3.), fine = fbm(uv, 80., 6.), grit = vnoise(vec2(uv.x * 2. + uv.y, uv.y * 2. - uv.x) * 300., 300., 10.);
  float wz = smoothstep(.56, .74, fbm3(uv, 3., 17.) + (fine - .5) * .15);
  float halo = smoothstep(wd * 6., 0., abs(fract(s) - .5)) * smoothstep(.35, .65, fbm3(uv + id, 4., 7.));
  float c = .87 + cloud * .1 - v1 * .17 - halo * .05 - v2 * .08 + (grit - .5) * .03 * wz;
  vec3 m = vec3(c * .99, c * .98, c) * mix(vec3(1.), vec3(1., .97, .92), smoothstep(.5, .8, fbm3(w, 2., 11.)) * .5);
  m = mix(m, m * vec3(.97, .95, .9), wz * .5);
  col = S(mix(vec3(.6, .58, .54) * (.8 + fine * .4), m, joint) * mix(.75, 1., arr));
  h = mix(.3, .52 + (fine - .5) * .02 - v1 * .03 + (grit - .5) * .03 * wz, joint);
  rough = mix(1., .78 + v1 * .1 + wz * .2 + (fine - .5) * .08, joint); metal = 0.;
}`];

  // bake the lot and write each into the texture objects textures.js made (same objects: whatever already points at them follows)
  X.upgradeTextures = function (renderer, px) {
    const T = G.Tex; if (!T || !T.tex || !renderer) return false;
    const t0 = performance.now();
    try {
      X.kick(renderer);
      for (const k in SRC) {
        const t = T.tex[k]; if (!t || !t.map) continue;
        const small = k === 'metal' || k === 'cloth' || k === 'skin' || k === 'scales', size = small ? Math.max(256, px >> 1) : px;
        const rts = X.bake(renderer, size, SRC[k][1], { normal: SRC[k][0], ao: 3, mat: pending['w:' + k] }); delete pending['w:' + k];
        // (the baked targets are the textures themselves from here on - nothing holds the old ones yet, every user asks G.Tex.tex when it
        // makes its material. Reading them back and sending them up again cost the loading screen three seconds)
        t.map.dispose(); t.normalMap.dispose();
        t.map = rts[0].texture; t.normalMap = rts[1].texture; t.orm = rts[2].texture; t.stub = false;
      }
      X.upgradeSprites(renderer);
      X.upgraded = true; X.stats.tex = Math.round(performance.now() - t0);
    } catch (e) { console.warn('gfx: textures made on the CPU instead', e); if (T.cpuFill) for (const k in T.tex) T.cpuFill(k); return false; }
    return true;
  };

  // ---- shapes ----
  const stops = (len, r, n) => { const L = len / 2, out = []; for (let i = 0; i <= n; i++) out.push(-L + r * i / n); for (let i = n; i >= 0; i--) out.push(L - r * i / n); return out; };
  // a box w x h x d with its edges and corners rounded to radius r (n steps across the round)
  X.makeRbox = function (w, h, d, r, n) {
    r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5); n = n || 1;
    if (!(r > 1e-5)) return new THREE.BoxGeometry(w, h, d);
    const dims = [w, h, d], pos = [], nor = [], uv = [], idx = [], st = [stops(w, r, n), stops(h, r, n), stops(d, r, n)];
    const face = (ax, sign) => {
      const u = (ax + 1) % 3, v = (ax + 2) % 3, su = st[u], sv = st[v], base = pos.length / 3, p = [0, 0, 0], c = [0, 0, 0];
      for (let j = 0; j < sv.length; j++) for (let i = 0; i < su.length; i++) {
        p[ax] = sign * dims[ax] / 2; p[u] = su[i]; p[v] = sv[j];
        for (let k = 0; k < 3; k++) c[k] = Math.max(-dims[k] / 2 + r, Math.min(dims[k] / 2 - r, p[k]));
        let nx = p[0] - c[0], ny = p[1] - c[1], nz = p[2] - c[2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        pos.push(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r); nor.push(nx, ny, nz); uv.push(su[i] / dims[u] + 0.5, sv[j] / dims[v] + 0.5);
      }
      const Wn = su.length;
      for (let j = 0; j < sv.length - 1; j++) for (let i = 0; i < Wn - 1; i++) { const a = base + j * Wn + i, b = a + 1, c2 = a + Wn, d2 = c2 + 1; if (sign > 0) idx.push(a, b, d2, a, d2, c2); else idx.push(a, d2, b, a, c2, d2); }
    };
    for (let ax = 0; ax < 3; ax++) { face(ax, 1); face(ax, -1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  };
  // the same box drawn with fewer faces, for what is set down by the hundred (the furniture of the halls): each face's flat, one strip
  // across each rounded edge, one triangle at each corner. The corners carry the same normals as makeRbox(.., 1) gives them, so the round
  // of the edges is lit the same; the edge's middle lies a third of r inside the round (a millimetre or two) - 44 triangles, not 108
  X.makeCbox = function (w, h, d, r) {
    r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5);
    if (!(r > 1e-5)) return new THREE.BoxGeometry(w, h, d);
    const D = [w / 2, h / 2, d / 2], pos = [], nor = [], uv = [], idx = [], at = {};
    // the corner (sx, sy, sz) of the face looking along axis ax: its own vertex, normal the face's
    const vtx = (ax, sx, sy, sz) => {
      const key = ax + ',' + sx + ',' + sy + ',' + sz; if (at[key] !== undefined) return at[key];
      const s = [sx, sy, sz], p = [0, 0, 0], n = [0, 0, 0];
      for (let k = 0; k < 3; k++) p[k] = k === ax ? s[k] * D[k] : s[k] * (D[k] - r);
      n[ax] = s[ax]; const u = (ax + 1) % 3, v = (ax + 2) % 3;
      pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); uv.push(p[u] / (2 * D[u]) + 0.5, p[v] / (2 * D[v]) + 0.5);
      return (at[key] = pos.length / 3 - 1);
    };
    // a triangle wound to look outward (the box is about the origin and convex)
    const tri = (a, b, c) => {
      const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], A = P(a), B = P(b), C = P(c);
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      if (cx * (A[0] + B[0] + C[0]) + cy * (A[1] + B[1] + C[1]) + cz * (A[2] + B[2] + C[2]) >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    };
    const quad = (a, b, c, d2) => { tri(a, b, c); tri(a, c, d2); };
    const S = (ax, s, t, sa, sb) => { const o = [0, 0, 0]; o[ax] = s; o[(ax + 1) % 3] = sa; o[(ax + 2) % 3] = sb; return vtx(ax, o[0], o[1], o[2]); };
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) quad(S(ax, s, 0, -1, -1), S(ax, s, 0, 1, -1), S(ax, s, 0, 1, 1), S(ax, s, 0, -1, 1));   // the flats
    for (let a = 0; a < 3; a++) {   // the edges: between the face along a and the face along b, running along c
      const b = (a + 1) % 3, c = (a + 2) % 3;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const v = (ax, sc) => { const o = [0, 0, 0]; o[a] = sa; o[b] = sb; o[c] = sc; return vtx(ax, o[0], o[1], o[2]); };
        quad(v(a, -1), v(a, 1), v(b, 1), v(b, -1));
      }
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) tri(vtx(0, sx, sy, sz), vtx(1, sx, sy, sz), vtx(2, sx, sy, sz));   // the corners
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  };
  // the same, kept: boxes of one size share one geometry (sizes are rounded to the millimetre / to a hundredth for big ones)
  const cache = new Map();
  X.rbox = function (w, h, d, r, n) {
    const q = (v) => Math.round(Math.abs(v) * 2000) / 2000; w = q(w); h = q(h); d = q(d);
    if (!(w > 0 && h > 0 && d > 0)) return null;
    const m = Math.min(w, h, d); r = r === undefined ? Math.min(0.012, m * 0.22) : Math.min(r, m * 0.45);
    const key = w + '|' + h + '|' + d + '|' + Math.round(r * 5000) + '|' + (n || 1);
    let g = cache.get(key); if (!g) { g = X.makeRbox(w, h, d, r, n || 1); g.userData.shared = true; cache.set(key, g); }
    return g;
  };
  X.rboxCount = () => cache.size;

  // ---- the small pictures the effects are drawn with were repainted here over the plain gradients textures.js made. They are now
  // painted whole in textures.js (smoke and flame as sheets of four, the marks by what was struck), so nothing is repainted: a
  // picture named here would be painted over the one textures.js made. ----
  const SPR = {};
  const sprMat = (body) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: 'precision highp float; varying vec2 vUv;\n' + X.NOISE + body + '\nvoid main(){ gl_FragColor = spr(vUv); }', depthTest: false, depthWrite: false });
  X.upgradeSprites = function (renderer) {
    const spr = G.Tex && G.Tex.spr; if (!spr) return;
    ready();
    const prev = renderer.getRenderTarget(), ac = renderer.autoClear; renderer.autoClear = true;
    for (const k in SPR) {
      const tex = spr[k]; if (!tex || !tex.image || !tex.image.getContext) continue;
      const px = SPR[k][0], rt = new THREE.WebGLRenderTarget(px, px, { depthBuffer: false }), m = X.pendingMat('s:' + k) || sprMat(SPR[k][1]);
      quad.material = m; renderer.setRenderTarget(rt); renderer.render(scene, cam);
      const b = new Uint8Array(px * px * 4); renderer.readRenderTargetPixels(rt, 0, 0, px, px, b); rt.dispose(); m.dispose();
      const img = new ImageData(px, px);   // (the target's rows run upward, a canvas's downward)
      for (let y = 0; y < px; y++) img.data.set(b.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
      const cv = tex.image; cv.width = cv.height = px; cv.getContext('2d').putImageData(img, 0, 0); tex.needsUpdate = true;
    }
    renderer.setRenderTarget(prev); renderer.autoClear = ac;
  };
})();
// ---- rounded, organic shapes: distance fields (smooth unions and cuts of simple solids) turned into a mesh by surface nets, with
// normals taken from the field; the surfaces of what is held in the hands; the hands themselves ----
(function () {
  const X = G.GFX, S = X.S = {};
  S.sph = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;
  S.ell = (x, y, z, cx, cy, cz, rx, ry, rz) => { const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz, k0 = Math.hypot(a, b, c), k1 = Math.hypot(a / rx, b / ry, c / rz); return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1; };
  S.cap = (x, y, z, ax, ay, az, bx, by, bz, r) => {
    const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
    let h = (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1); h = h < 0 ? 0 : h > 1 ? 1 : h;
    return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - r;
  };
  S.cone = (x, y, z, ax, ay, az, bx, by, bz, r1, r2) => {
    const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
    let h = (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1); h = h < 0 ? 0 : h > 1 ? 1 : h;
    return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - (r1 + (r2 - r1) * h);
  };
  S.box = (x, y, z, cx, cy, cz, hx, hy, hz, r) => {
    const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
  S.tor = (x, y, z, cx, cy, cz, nx, ny, nz, R, r) => { const px = x - cx, py = y - cy, pz = z - cz, h = px * nx + py * ny + pz * nz, q = Math.hypot(px - nx * h, py - ny * h, pz - nz * h) - R; return Math.hypot(q, h) - r; };
  S.smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  S.smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
  S.cut = (a, b, k) => S.smax(a, -b, k);
  // a chain of tapering capsules through the points (a finger, a limb), its joints a little swollen
  S.chain = (x, y, z, pts, r0, r1, k, knob) => {
    let d = 1e9; const n = pts.length - 1;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1]; d = S.smin(d, S.cone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r0 + (r1 - r0) * i / n, r0 + (r1 - r0) * (i + 1) / n), k || 0.0035); }
    if (knob) for (let i = 1; i < n; i++) { const a = pts[i]; d = S.smin(d, S.sph(x, y, z, a[0], a[1], a[2], (r0 + (r1 - r0) * i / n) * knob), 0.003); }
    return d;
  };
  // fn(x, y, z) -> distance; b0 / b1: the box to look in; cell: the size of one step. Returns a geometry (position, normal, uv)
  S.mesh = function (fn, b0, b1, cell) {
    const nx = Math.ceil((b1[0] - b0[0]) / cell) + 1, ny = Math.ceil((b1[1] - b0[1]) / cell) + 1, nz = Math.ceil((b1[2] - b0[2]) / cell) + 1;
    const val = new Float32Array(nx * ny * nz);
    // (the field is asked only near the surface: far from it, some of the steps it says it is away are filled in unasked)
    for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++, o += nx) {
      const y = b0[1] + j * cell, z = b0[2] + k * cell;
      for (let i = 0; i < nx;) {
        const v = fn(b0[0] + i * cell, y, z); val[o + i] = v; i++;
        for (let sk = Math.floor((Math.abs(v) * 0.6 - cell * 2) / cell); sk > 0 && i < nx; sk--, i++) val[o + i] = v;
      }
    }
    const cx = nx - 1, cy = ny - 1, cz = nz - 1, vid = new Int32Array(cx * cy * cz).fill(-1), pos = [], idx = [];
    const at = (i, j, k) => val[(k * ny + j) * nx + i];
    const EDG = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], c = new Float32Array(8);
    for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
      let mask = 0;
      for (let q = 0; q < 8; q++) { c[q] = at(i + (q & 1), j + ((q >> 1) & 1), k + ((q >> 2) & 1)); if (c[q] < 0) mask |= 1 << q; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of EDG) {
        if ((c[a] < 0) === (c[b] < 0)) continue;
        const t = c[a] / (c[a] - c[b]);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
      }
      vid[(k * cy + j) * cx + i] = pos.length / 3;
      pos.push(b0[0] + (i + sx / n) * cell, b0[1] + (j + sy / n) * cell, b0[2] + (k + sz / n) * cell);
    }
    const V = (i, j, k) => vid[(k * cy + j) * cx + i];
    const quad = (a, b, c2, d, flip) => { if (a < 0 || b < 0 || c2 < 0 || d < 0) return; if (!flip) idx.push(a, c2, b, a, d, c2); else idx.push(a, b, c2, a, c2, d); };
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v0 = at(i, j, k);
      if (i < cx && j > 0 && k > 0 && j < cy && k < cz) { const v1 = at(i + 1, j, k); if ((v0 < 0) !== (v1 < 0)) quad(V(i, j - 1, k - 1), V(i, j, k - 1), V(i, j, k), V(i, j - 1, k), v0 < 0); }
      if (j < cy && i > 0 && k > 0 && i < cx && k < cz) { const v1 = at(i, j + 1, k); if ((v0 < 0) !== (v1 < 0)) quad(V(i - 1, j, k - 1), V(i, j, k - 1), V(i, j, k), V(i - 1, j, k), v0 >= 0); }
      if (k < cz && i > 0 && j > 0 && i < cx && j < cy) { const v1 = at(i, j, k + 1); if ((v0 < 0) !== (v1 < 0)) quad(V(i - 1, j - 1, k), V(i, j - 1, k), V(i, j, k), V(i - 1, j, k), v0 < 0); }
    }
    const nor = new Float32Array(pos.length), uv = new Float32Array(pos.length / 3 * 2), e = cell * 0.5, sc = 1 / Math.max(b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]);
    for (let i = 0, u = 0; i < pos.length; i += 3, u += 2) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      let gx = fn(x + e, y, z) - fn(x - e, y, z), gy = fn(x, y + e, z) - fn(x, y - e, z), gz = fn(x, y, z + e) - fn(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l; nor[i] = gx; nor[i + 1] = gy; nor[i + 2] = gz;
      // (a plain wrap for the texture: laid on from the side the surface faces most)
      const ax = Math.abs(gx), ay = Math.abs(gy), az = Math.abs(gz);
      if (ax >= ay && ax >= az) { uv[u] = z * sc * 3; uv[u + 1] = y * sc * 3; } else if (ay >= az) { uv[u] = x * sc * 3; uv[u + 1] = z * sc * 3; } else { uv[u] = x * sc * 3; uv[u + 1] = y * sc * 3; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  };

  // ---- surfaces of what is held: pale, to be tinted by the material's colour ----
  const EX = {
    gunmetal: [512, 0.45, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 40., 2.), n3 = vnoise(uv * 96., 96., 3.), n4 = vnoise(uv * 48., 48., 9.);
  float scr = smoothstep(.80, .93, ridge(uv, 5., 4.)) * smoothstep(.45, .7, fbm(uv, 3., 11.));
  h = .5 + (n3 - .5) * .035 + (n4 - .5) * .03 - scr * .06;
  col = S(vec3(.46 + (n1 - .5) * .12 + (n2 - .5) * .06) + scr * .3);
  rough = .78 + (n2 - .5) * .22 + (n1 - .5) * .16 - scr * .3; metal = 0.;
}`],
    polymer: [512, 0.7, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec3 v = voro(uv, 56., 1.); float n1 = fbm(uv, 4., 2.), n2 = vnoise(uv * 200., 200., 5.);
  h = .5 + (v.x - .45) * .17 + (n2 - .5) * .05;
  col = S(vec3(.8 + (n1 - .5) * .16 + (v.z - .5) * .06));
  rough = .9 + (n1 - .5) * .2 + (v.x - .4) * .12; metal = 0.;
}`],
    steel: [512, 0.4, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 48., 2.), br = vnA(vec2(uv.x * 8., uv.y * 400.), vec2(8., 400.), 3.);
  h = .5 + (br - .5) * .16 + (n2 - .5) * .05;
  col = S(vec3(.84 + (n1 - .5) * .14 + (br - .5) * .06));
  rough = .8 + (br - .5) * .3 + (n1 - .5) * .2; metal = 0.;
}`],
    leather: [512, 0.9, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec3 v = voro(uv, 30., 1.); vec3 v2 = voro(uv, 90., 2.); float n1 = fbm(uv, 5., 2.);
  float cr = smoothstep(.0, .06, v.y - v.x), cr2 = smoothstep(.0, .09, v2.y - v2.x);
  h = .35 + cr * .4 + cr2 * .16 + (n1 - .5) * .1;
  col = S(vec3(.72 + (n1 - .5) * .22) * (.74 + cr * .26));
  rough = .86 + (n1 - .5) * .2 - cr * .1; metal = 0.;
}`],
    // (a stock's wood: the grain runs along the piece, the rings cut lengthwise, open pores; no boards, no joints)
    walnut: [512, 0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float warp = fbm(uv, 3., 1.), n1 = fbm(uv, 4., 7.);
  float g1 = vnA(vec2(uv.x * 4., uv.y * 48.), vec2(4., 48.), 2.);
  float g2 = vnA(vec2(uv.x * 10., uv.y * 300.), vec2(10., 300.), 3.);
  float ring = sin((uv.y * 14. + warp * 2.2 + g1 * 1.6) * 6.2831853) * .5 + .5;
  float pore = smoothstep(.7, .9, vnA(vec2(uv.x * 36., uv.y * 420.), vec2(36., 420.), 5.));
  h = .5 + (g2 - .5) * .09 - pore * .12 + (ring - .5) * .03;
  vec3 c = mix(vec3(.6, .5, .42), vec3(.97, .9, .8), smoothstep(.15, .85, ring * .6 + g1 * .4));
  c *= .9 + (g2 - .5) * .22; c *= 1. - pore * .32; c *= .92 + (n1 - .5) * .18;
  col = S(c); rough = .55 + (g2 - .5) * .2 + pore * .3 + (n1 - .5) * .12; metal = 0.;
}`],
    // (the coats of what is fought: a pelt combed one way, the plates of a shell with their pits)
    fur: [512, 0.9, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float w = fbm(uv, 3., 4.), cl = fbm(uv, 5., 7.);
  float s1 = vnA(vec2(uv.x * 192., uv.y * 20.), vec2(192., 20.), 1.), s2 = vnA(vec2(uv.x * 448., uv.y * 40.), vec2(448., 40.), 2.);   // (fine short hairs, not planks)
  h = .5 + (s1 - .5) * .32 + (s2 - .5) * .26 + (cl - .5) * .3;
  col = S(vec3(.66 + (s1 - .5) * .12 + (cl - .5) * .3 + (s2 - .5) * .08 + (w - .5) * .16));
  rough = .9 + (s1 - .5) * .15; metal = 0.;
}`],
    chitin: [512, 0.6, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec3 v = voro(uv, 5., 3.); float pl = smoothstep(.0, .05, v.y - v.x), n1 = fbm(uv, 6., 2.), pit = smoothstep(.72, .9, vnoise(uv * 120., 120., 5.));
  h = .5 + pl * .25 - pit * .12 + (n1 - .5) * .08;
  col = S(vec3(.8 + (n1 - .5) * .2) * (.68 + pl * .32));
  rough = .36 + (n1 - .5) * .2 + pit * .3 + (1. - pl) * .3; metal = 0.;
}`],
    // (living rock: broad lumps, cracks that wander between them, finer cracks, a grain, pits)
    rock: [512, 1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 12., 2.), n3 = fbm(uv, 48., 3.), g = vnoise(uv * 160., 160., 4.);
  vec3 v = voro(uv + (vec2(fbm(uv, 6., 8.), fbm(uv, 6., 9.)) - .5) * .12, 6., 5.);
  float cr = 1. - smoothstep(.0, .035, v.y - v.x);
  float ck = smoothstep(.78, .9, ridge(uv, 9., 6.)) * .6;
  float pit = smoothstep(.74, .9, vnoise(uv * 64., 64., 7.));
  h = .5 + (n1 - .5) * .5 + (n2 - .5) * .22 + (n3 - .5) * .1 + (g - .5) * .04 - cr * .3 - ck * .14 - pit * .07;
  col = S(vec3(.7 + (n1 - .5) * .22 + (n2 - .5) * .16 + (n3 - .5) * .08) * (1. - cr * .45) * (1. - ck * .25));
  rough = .92 + (n3 - .5) * .12; metal = 0.;
}`],
    // (old ice: deep and blue-grey, long cracks through it and hairlines, bubbles caught in it, rime lying on it in patches)
    ice: [512, 0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 14., 2.), fine = fbm(uv, 80., 3.);
  vec3 v = voro(uv + (vec2(fbm(uv, 5., 8.), fbm(uv, 5., 9.)) - .5) * .2, 4., 5.);
  float crack = 1. - smoothstep(.0, .012, v.y - v.x);
  float hair = smoothstep(.86, .95, ridge(uv, 12., 6.)) * .6;
  vec3 b = voro(uv, 46., 11.); float bub = smoothstep(.12, .0, b.x) * step(.55, b.z);
  float frost = smoothstep(.55, .8, fbm(uv, 7., 14.) + (fine - .5) * .3);
  vec3 deep = mix(vec3(.30, .44, .56), vec3(.52, .68, .78), n1 * .6 + n2 * .4);
  vec3 c = deep + (crack * .5 + hair * .35 + bub * .4) * vec3(.5, .5, .48);
  c = mix(c, vec3(.9, .94, .97), frost * .55);
  col = S(c);
  h = .5 + (n2 - .5) * .12 - crack * .1 + frost * .06 + (fine - .5) * .04;
  rough = .12 + frost * .6 + crack * .2; metal = 0.;
}`],
    weave: [512, 1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = 40.; vec2 p = uv * n; float wa = sin(p.x * 6.2831853) * .5 + .5, we = sin(p.y * 6.2831853) * .5 + .5;
  float over = step(.5, fract((floor(p.x) + floor(p.y)) * .5)), w = mix(wa, we, over);
  float n1 = fbm(uv, 6., 2.), n2 = vnoise(uv * 160., 160., 5.), fold = fbm(uv, 3., 9.);
  h = .4 + w * .32 + (n2 - .5) * .1 + (fold - .5) * .5;
  col = S(vec3(.72 + (n1 - .5) * .2 + (w - .5) * .16));
  rough = 1.; metal = 0.;
}`],
  };
  const texCache = {};
  // (molten iron and the blue fire of the ruins, as an emissive picture: a skin of cooled crust broken into plates of every size, a
  // little drawn out along the flow (x), dark and dull, a faint glow where a plate is thin; between them the cracks, narrow, bright at
  // their hearts, now and then a wider seam. In grey: the material's emissive colour gives the hue)
  EX.lava = [512, 1.2, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 P = vec2(6., 9.), w = uv * P + (vec2(fbm3(uv, 4., 1.), fbm3(uv, 4., 2.)) - .5) * vec2(1.4, 1.8) + (vec2(fbm3(uv, 16., 3.), fbm3(uv, 16., 4.)) - .5) * .35;
  vec2 i = floor(w), f = fract(w); float d1 = 9., d2 = 9., id = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), c = mod(i + g, P), r = (g + hash22(c + 77.) - f) * vec2(.75, 1.); float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash12(c + 78.); } else if (d < d2) d2 = d;
  }
  float e = sqrt(d2) - sqrt(d1) + (fbm3(uv, 40., 5.) - .5) * .06;
  float wide = .03 + .07 * smoothstep(.6, .9, fbm3(uv, 3., 6.));
  float crack = smoothstep(wide, .0, e), core = smoothstep(wide * .35, .0, e);
  float thin = smoothstep(.55, .85, fbm3(uv, 6., 7.) + (id - .5) * .3);
  float grain = fbm3(uv * vec2(1., 1.), 30., 8.);
  float I = mix(.03 + thin * .12 + (grain - .5) * .04, 1., crack * .7 + core * .3);
  col = S(vec3(I));
  h = .6 - crack * .4 + (id - .5) * .08 + (grain - .5) * .08;
  rough = .9; metal = 0.;
}`];
  X.EXSRC = EX;
  X.mirror = (g) => mirror(g);
  // a surface by name: { map, normalMap, orm } (made at first asking; null where there is no GPU to make it)
  X.tex = function (name) {
    if (texCache[name] !== undefined) return texCache[name];
    const src = EX[name], renderer = G.renderer; texCache[name] = null;
    if (!src || !renderer) return null;
    const t0 = performance.now();
    try {
      const size = src[0], rts = X.bake(renderer, size, src[2], { normal: src[1], ao: 2.5, mat: X.pendingMat('x:' + name) });
      texCache[name] = { map: rts[0].texture, normalMap: rts[1].texture, orm: rts[2].texture }; X.stats.surf += Math.round(performance.now() - t0);
    } catch (e) { console.warn('gfx: no surface', name, e); }
    return texCache[name];
  };

  // ---- a gloved hand closed on a grip. The grip runs up through the origin; the palm lies on the +x side, the fingers come round the
  // front (-z) to the other side, the first of them laid forward to the trigger, the thumb round the back. mirror: the other hand ----
  function grip(x, y, z, fist) {
    let d = S.box(x, y, z, 0.027, -0.002, 0.004, 0.0105, 0.04, 0.026, 0.011);
    d = S.smin(d, S.ell(x, y, z, 0.035, 0.0, 0.004, 0.011, 0.038, 0.03), 0.01);                       // back of the hand
    d = S.smin(d, S.cap(x, y, z, 0.004, 0.034, 0.03, 0.024, 0.03, 0.022, 0.015), 0.012);            // the web between thumb and finger
    d = S.smin(d, S.cap(x, y, z, 0.02, -0.04, 0.024, 0.028, -0.02, 0.018, 0.016), 0.012);           // heel
    let f = 1e9; const ys = fist ? [0.031, 0.01, -0.011, -0.031] : [0.01, -0.011, -0.031], rs = fist ? [0.0097, 0.0101, 0.0098, 0.0089] : [0.0101, 0.0098, 0.0089];
    for (let i = 0; i < ys.length; i++) { const yy = ys[i]; f = S.smin(f, S.chain(x, y, z, [[0.031, yy, -0.012], [0.019, yy, -0.034], [-0.008, yy, -0.0355], [-0.0235, yy + 0.001, -0.02], [-0.024, yy + 0.003, 0.0]], rs[i], rs[i] * 0.86, 0.0035, 1.08), 0.0022); }
    if (!fist) f = S.smin(f, S.chain(x, y, z, [[0.031, 0.031, -0.01], [0.025, 0.034, -0.038], [0.013, 0.034, -0.058], [-0.002, 0.032, -0.064]], 0.0097, 0.0082, 0.0035, 1.08), 0.0022);   // first finger
    d = S.smin(d, f, 0.009);
    d = S.smin(d, S.chain(x, y, z, fist ? [[0.015, 0.038, 0.033], [-0.008, 0.05, 0.024], [-0.022, 0.052, 0.004], [-0.0235, 0.05, -0.02]] : [[0.015, 0.03, 0.033], [-0.01, 0.041, 0.026], [-0.0235, 0.044, 0.006], [-0.0245, 0.044, -0.019]], 0.0125, 0.0096, 0.0035, 1.08), 0.009);   // thumb
    d = S.smin(d, S.cone(x, y, z, 0.03, -0.03, 0.028, 0.046, -0.066, 0.08, 0.027, 0.031), 0.012);    // wrist
    return d;
  }
  // the hard pad over the knuckles and the strap at the wrist: the same shape grown a little and cut to a region
  const padOf = (fist) => (x, y, z) => S.smax(grip(x, y, z, fist) - 0.0018, S.box(x, y, z, 0.043, 0.0, 0.004, 0.012, 0.024, 0.022, 0.006), 0.002);
  const strapOf = (fist) => (x, y, z) => { const t = ((x - 0.03) * 0.016 + (y + 0.03) * -0.036 + (z - 0.028) * 0.052) / 0.0653; return S.smax(grip(x, y, z, fist) - 0.0016, Math.abs(t - 0.036) - 0.01, 0.0015); };
  const handCache = {};
  // the same shape seen in a mirror (x turned over, and with it the way each face winds)
  function mirror(g) {
    const m = g.clone(), p = m.attributes.position, n = m.attributes.normal, ix = m.index;
    for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
    for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
    return m;
  }
  // { hand, pad, strap }: geometries of one hand (right: as described; left: its mirror).
  // fist: every finger closed round the grip - a hand on a hilt, or a bare fist; else the first finger lies along to a trigger
  X.hand = function (right, fist) {
    const k = (right ? 'r' : 'l') + (fist ? 'f' : ''); if (handCache[k]) return handCache[k];
    if (!right) { const r = X.hand(true, fist); return (handCache[k] = { hand: mirror(r.hand), pad: mirror(r.pad), strap: mirror(r.strap) }); }
    const mk = (fn, b0, b1, cell) => { const t0 = performance.now(), g = S.mesh(fn, b0, b1, cell); X.stats.hand += Math.round(performance.now() - t0); return g; };
    const gf = fist ? (x, y, z) => grip(x, y, z, true) : grip;
    return (handCache[k] = { hand: mk(gf, [-0.04, -0.105, -0.08], [0.085, 0.078, 0.12], 0.0023), pad: mk(padOf(fist), [0.028, -0.03, -0.024], [0.062, 0.03, 0.032], 0.0017), strap: mk(strapOf(fist), [-0.005, -0.085, 0.02], [0.085, -0.01, 0.1], 0.0021) });
  };
})();
// ---- a skeleton's bones: the skull, jaw, pelvis and the long bones with their knobbed ends are distance fields; the ribs are bent
// tubes; the spine is one vertebra repeated; helmet, sword and shield are turned and pushed-out parts. Made once, shared by every
// skeleton (enemies.js hangs them on the joints it already has) ----
(function () {
  const X = G.GFX, S = X.S, smin = S.smin, V3 = THREE.Vector3;
  const V = new V3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), SC = new V3();
  const Geo = X.Geo = {};
  // place a geometry: p position, r rotation (radians), s scale (a number or [x, y, z])
  Geo.xf = function (g, p, r, s) {
    E.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); Q.setFromEuler(E);
    if (s === undefined) SC.set(1, 1, 1); else if (typeof s === 'number') SC.set(s, s, s); else SC.set(s[0], s[1], s[2]);
    V.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0); M4.compose(V, Q, SC); g.applyMatrix4(M4); return g;
  };
  // a round bar from point a to point b
  Geo.rod = function (a, b, r, seg, r2) {
    const d = new V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), g = new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, len, seg || 6, 1);
    g.translate(0, len / 2, 0); Q.setFromUnitVectors(V.set(0, 1, 0), d.normalize()); M4.makeRotationFromQuaternion(Q); M4.setPosition(a[0], a[1], a[2]); g.applyMatrix4(M4); return g;
  };
  // a turned part about the y axis: [radius, height] pairs
  Geo.lathe = (pts, seg) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(p[0], 1e-5), p[1])), seg || 12);
  // join geometries (already placed) into one: position, normal, uv
  Geo.merge = function (list) {
    let n = 0; const parts = [];
    for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); parts.push(g); n += g.attributes.position.count; }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    for (const g of parts) { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += c; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  };
  // the same triangles with their corners shared: corners that agree to the bit in every attribute (place, normal, uv, colour) become
  // one vertex and the triangles index them. Drawn exactly as before (the same numbers at every corner of every triangle), with a third
  // to a sixth of the vertices for the world's mesh to copy and the card to transform. Geometry that is indexed already is returned as is
  Geo.weld = function (g) {
    if (!g || g.index || !g.attributes.position) return g;
    const names = Object.keys(g.attributes), A = names.map((k) => g.attributes[k]);
    for (const a of A) if (a.isInterleavedBufferAttribute || !a.array || a.array.BYTES_PER_ELEMENT !== 4) return g;
    const n = g.attributes.position.count, bits = A.map((a) => new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length)), sz = A.map((a) => a.itemSize);
    const same = (i, j) => { for (let k = 0; k < bits.length; k++) { const b = bits[k], s = sz[k]; for (let c = 0; c < s; c++) if (b[i * s + c] !== b[j * s + c]) return false; } return true; };
    const map = new Map(), remap = new Uint32Array(n), keep = [];
    for (let i = 0; i < n; i++) {
      let h = 0x811c9dc5; for (let k = 0; k < bits.length; k++) { const b = bits[k], s = sz[k]; for (let c = 0; c < s; c++) h = Math.imul(h ^ b[i * s + c], 0x01000193) >>> 0; }
      let lst = map.get(h), hit = -1;
      if (lst) { for (const u of lst) if (same(keep[u], i)) { hit = u; break; } } else map.set(h, lst = []);
      if (hit < 0) { hit = keep.length; keep.push(i); lst.push(hit); }
      remap[i] = hit;
    }
    const out = new THREE.BufferGeometry();
    names.forEach((nm, k) => { const s = sz[k], src = A[k].array, dst = new src.constructor(keep.length * s); for (let u = 0; u < keep.length; u++) for (let c = 0; c < s; c++) dst[u * s + c] = src[keep[u] * s + c]; out.setAttribute(nm, new THREE.BufferAttribute(dst, s, A[k].normalized)); });
    out.setIndex(new THREE.BufferAttribute(keep.length > 65535 ? remap : Uint16Array.from(remap), 1));
    out.userData = g.userData;
    return out;
  };
  const chain = (x, y, z, pts, r0, r1, k) => S.chain(x, y, z, pts, r0, r1, k || 0.004);

  function skull(x, y, z) {
    const ax = Math.abs(x);
    let d = S.ell(x, y, z, 0, 0.098, -0.012, 0.073, 0.08, 0.092);                                  // braincase
    d = smin(d, S.box(ax, y, z, 0, 0.05, 0.05, 0.049, 0.046, 0.031, 0.024), 0.028);                // the face
    d = smin(d, S.cap(ax, y, z, 0, 0.089, 0.079, 0.05, 0.085, 0.069, 0.0115), 0.012);              // brow ridge
    d = smin(d, S.ell(ax, y, z, 0.052, 0.036, 0.058, 0.02, 0.0135, 0.024), 0.012);                 // cheekbone
    d = smin(d, S.cap(ax, y, z, 0.058, 0.036, 0.046, 0.071, 0.04, -0.004, 0.0068), 0.008);         // its arch back to the ear
    d = smin(d, S.box(ax, y, z, 0, -0.005, 0.066, 0.03, 0.021, 0.02, 0.012), 0.016);               // upper jaw
    d = smin(d, S.ell(ax, y, z, 0.05, 0.02, -0.03, 0.016, 0.022, 0.018), 0.014);
    d = S.cut(d, S.ell(ax, y, z, 0.031, 0.058, 0.09, 0.0215, 0.0195, 0.036), 0.006);               // eye sockets
    d = S.cut(d, S.ell(ax, y, z, 0.0078, 0.019, 0.097, 0.0105, 0.018, 0.024), 0.004);              // nose
    d = S.cut(d, S.ell(x, y, z, 0, 0.036, 0.097, 0.008, 0.013, 0.022), 0.004);
    d = S.cut(d, S.ell(ax, y, z, 0.087, 0.062, 0.014, 0.018, 0.03, 0.036), 0.012);                 // temple
    d = S.cut(d, S.ell(ax, y, z, 0.064, 0.016, 0.034, 0.012, 0.017, 0.03), 0.008);
    return d;
  }
  function jaw(x, y, z) {
    const ax = Math.abs(x);
    let d = chain(ax, y, z, [[0, -0.066, 0.084], [0.02, -0.064, 0.075], [0.035, -0.058, 0.046], [0.046, -0.05, 0.012]], 0.0085, 0.0075);
    d = smin(d, chain(ax, y, z, [[0, -0.054, 0.081], [0.019, -0.052, 0.072], [0.033, -0.048, 0.045], [0.045, -0.042, 0.012]], 0.007, 0.0065), 0.006);
    d = smin(d, S.cone(ax, y, z, 0.046, -0.048, 0.012, 0.058, 0.012, 0.0, 0.009, 0.0065), 0.006);  // the branch up to the hinge
    d = smin(d, S.sph(x, y, z, 0, -0.068, 0.085, 0.011), 0.008);                                   // chin
    return d;
  }
  function pelvis(x, y, z) {
    const ax = Math.abs(x);
    let wing = S.ell(ax, y, z, 0.082, 0.04, -0.014, 0.055, 0.058, 0.044);
    wing = S.smax(wing, -S.ell(ax, y, z, 0.062, 0.056, 0.022, 0.058, 0.07, 0.054), 0.012);         // hollowed from the front: a thin flaring blade
    let d = wing;
    d = smin(d, S.box(x, y, z, 0, 0.03, -0.056, 0.03, 0.046, 0.014, 0.012), 0.02);                 // sacrum
    d = smin(d, S.sph(ax, y, z, 0.085, -0.04, 0.0, 0.03), 0.02);                                   // about the hip socket
    d = smin(d, S.tor(ax, y, z, 0.05, -0.078, 0.022, 0.55, 0.0, 0.835, 0.03, 0.0085), 0.012);
    d = smin(d, S.cap(ax, y, z, 0, -0.072, 0.058, 0.04, -0.052, 0.05, 0.0095), 0.01);
    return d;
  }
  function femur(x, y, z) {      // the ball at the origin, the shaft out and down to the knee at (0.024, -0.445)
    let d = S.sph(x, y, z, 0, 0, 0, 0.021);
    d = smin(d, S.cone(x, y, z, 0, 0, 0, 0.042, -0.022, 0, 0.013, 0.015), 0.01);
    d = smin(d, S.ell(x, y, z, 0.053, -0.012, -0.004, 0.016, 0.024, 0.018), 0.012);
    d = smin(d, S.cone(x, y, z, 0.044, -0.03, 0, 0.024, -0.4, 0.004, 0.0145, 0.0125), 0.014);
    d = smin(d, S.ell(x, y, z, 0.006, -0.435, 0.0, 0.019, 0.02, 0.024), 0.014);
    d = smin(d, S.ell(x, y, z, 0.042, -0.435, 0.0, 0.019, 0.02, 0.024), 0.014);
    return d;
  }
  function shin(x, y, z) {       // the broad top under the knee, the shaft, the ankle knob; the thin bone beside it
    let d = S.ell(x, y, z, 0, -0.012, 0, 0.034, 0.016, 0.026);
    d = smin(d, S.cone(x, y, z, 0, -0.02, 0.004, 0.0, -0.36, 0.002, 0.016, 0.011), 0.016);
    d = smin(d, S.ell(x, y, z, -0.004, -0.385, 0, 0.02, 0.018, 0.018), 0.012);
    d = smin(d, S.cap(x, y, z, 0.03, -0.03, -0.012, 0.027, -0.385, -0.008, 0.0062), 0.006);
    return d;
  }
  function humerus(x, y, z) {    // the head turned in to the shoulder, the flared end at the elbow (0, -0.305)
    let d = S.sph(x, y, z, -0.012, -0.004, 0, 0.02);
    d = smin(d, S.ell(x, y, z, 0.008, -0.012, 0, 0.014, 0.018, 0.016), 0.01);
    d = smin(d, S.cone(x, y, z, 0.002, -0.02, 0, 0, -0.27, 0, 0.012, 0.0105), 0.012);
    d = smin(d, S.ell(x, y, z, 0, -0.295, 0, 0.027, 0.013, 0.013), 0.012);
    return d;
  }
  // a row of teeth round the jaw: each its own small block, some longer, some gone
  function teeth(y, r, cz, sd, down) {
    const out = []; let s = sd; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = -6; i <= 6; i++) {
      if (i === 0) continue; const k = Math.abs(i), a = (k - 0.5) / 6 * 1.25 * Math.sign(i), gone = rnd() < 0.15 && k > 1, hh = (k < 3 ? 0.0125 : k < 5 ? 0.0115 : 0.0095) * (0.85 + rnd() * 0.3), w = k < 3 ? 0.0052 : 0.0062;
      if (gone) continue;
      out.push(Geo.xf(new THREE.BoxGeometry(w, hh, k < 5 ? 0.0045 : 0.0066), [Math.sin(a) * r, y + (down ? hh / 2 : -hh / 2), cz + Math.cos(a) * r], [(rnd() - 0.5) * 0.12, a, (rnd() - 0.5) * 0.1]));
    }
    return out;
  }
  // a plain long bone down from the origin: thin shaft, knobbed ends
  const bone = (len, r, ra, rb) => { const g = Geo.lathe([[0.0004, 0], [ra * 0.75, 0], [ra, ra * 0.5], [ra * 0.9, ra * 1.3], [r, len * 0.22], [r * 0.9, len * 0.5], [r, len * 0.8], [rb * 0.9, len - rb * 1.3], [rb, len - rb * 0.5], [rb * 0.7, len], [0.0004, len]], 8); g.rotateX(Math.PI); return g; };
  const vert = (r, h) => Geo.merge([Geo.lathe([[0.0004, 0], [r, 0], [r * 0.86, h * 0.5], [r, h], [0.0004, h]], 8), Geo.xf(new THREE.BoxGeometry(r * 0.42, h * 0.8, r * 1.9), [0, h * 0.3, -r * 1.7], [0.45, 0, 0]), Geo.xf(new THREE.BoxGeometry(r * 3.2, h * 0.5, r * 0.5), [0, h * 0.55, -r * 0.9])]);

  let cache = null;
  X.bones = function () {
    if (cache) return cache;
    const t0 = performance.now(), b = {}, TAU = Math.PI * 2;
    b.skull = Geo.merge([S.mesh(skull, [-0.1, -0.05, -0.115], [0.1, 0.19, 0.11], 0.0046)].concat(teeth(-0.0245, 0.0275, 0.057, 5, false)));
    b.jaw = Geo.merge([S.mesh(jaw, [-0.07, -0.085, -0.012], [0.07, 0.025, 0.105], 0.004)].concat(teeth(-0.0475, 0.0262, 0.056, 9, true))); b.jaw.translate(0, -0.012, 0);
    b.pelvis = S.mesh(pelvis, [-0.16, -0.125, -0.085], [0.16, 0.13, 0.085], 0.0058); b.pelvis.scale(1.12, 0.92, 0.95); b.pelvis.computeVertexNormals();
    // (the long bones are made for the +x side - the ball of each turned in towards the body - and mirrored for the other)
    const fem = S.mesh(femur, [-0.03, -0.47, -0.035], [0.08, 0.03, 0.035], 0.0052); fem.translate(-0.024, 0, 0); fem.scale(1, 1.034, 1); b.femP = fem; b.femN = X.mirror(fem);
    const sh = S.mesh(shin, [-0.045, -0.415, -0.035], [0.045, 0.012, 0.035], 0.0052); sh.scale(1, 0.95, 1); b.shinP = sh; b.shinN = X.mirror(sh);
    const hu = S.mesh(humerus, [-0.04, -0.32, -0.03], [0.035, 0.025, 0.03], 0.0048); b.humP = hu; b.humN = X.mirror(hu);
    b.forearm = Geo.merge([Geo.xf(bone(0.285, 0.0058, 0.0105, 0.0125), [0.011, 0, 0.002]), Geo.xf(bone(0.29, 0.0052, 0.013, 0.0085), [-0.011, 0, -0.002])]);
    // ribs: a bent tube each, from the spine round to the breastbone; the lowest two stop short. With the breastbone, collarbones and the spine behind
    const Wd = [0.07, 0.096, 0.113, 0.125, 0.133, 0.137, 0.137, 0.132, 0.122, 0.106], Fr = [0.072, 0.086, 0.096, 0.101, 0.103, 0.1, 0.094, 0.082, 0.06, 0.03], ch = [];
    for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) {
      const y0 = 0.257 - i * 0.026, drop = 0.03 + i * 0.0065, pm = i < 7 ? 1 : i === 7 ? 0.9 : i === 8 ? 0.7 : 0.55, zc = (Fr[i] - 0.06) / 2, dz = (Fr[i] + 0.06) / 2, pts = [];
      for (let k = 0; k <= 10; k++) { const ph = k / 10 * Math.PI * pm; pts.push(new V3(sx * (0.007 + Wd[i] * Math.sin(ph)), y0 - drop * Math.pow(ph / Math.PI, 1.3), zc - dz * Math.cos(ph))); }
      ch.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.0064, 5, false));
    }
    ch.push(Geo.xf(X.makeRbox(0.036, 0.2, 0.013, 0.005, 1), [0, 0.133, 0.1], [-0.12, 0, 0]));
    for (const sx of [-1, 1]) ch.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(sx * 0.018, 0.24, 0.092), new V3(sx * 0.07, 0.262, 0.08), new V3(sx * 0.125, 0.268, 0.04), new V3(sx * 0.178, 0.262, -0.005)]), 8, 0.0068, 5, false));
    const vt = vert(0.0165, 0.0185); for (let i = 0; i < 12; i++) ch.push(Geo.xf(vt.clone(), [0, i * 0.0225, -0.062 - Math.sin(i / 11 * Math.PI) * 0.012]));
    b.chest = Geo.merge(ch); b.chest.scale(1.22, 1.22, 1.22);
    const vl = vert(0.021, 0.026), lum = []; for (let i = 0; i < 5; i++) lum.push(Geo.xf(vl.clone(), [0, i * 0.036, Math.sin(i / 4 * Math.PI) * 0.014])); b.lumbar = Geo.merge(lum);
    const vc = vert(0.012, 0.016), nk = []; for (let i = 0; i < 5; i++) nk.push(Geo.xf(vc.clone(), [0, i * 0.022, i * 0.004])); b.neck = Geo.merge(nk);
    // a fist of small bones; a foot
    const hand = [new THREE.BoxGeometry(0.05, 0.02, 0.024)];
    for (let f = 0; f < 4; f++) { const x = -0.027 + f * 0.018; hand.push(Geo.rod([x * 0.5, -0.005, 0], [x, -0.07, 0.004], 0.0048, 5, 0.0055), Geo.rod([x, -0.074, 0.006], [x, -0.105, 0.03], 0.005, 5, 0.0045), Geo.rod([x, -0.107, 0.033], [x, -0.094, 0.057], 0.0045, 5, 0.004)); }
    hand.push(Geo.rod([0.025, -0.01, 0.005], [0.04, -0.045, 0.025], 0.0055, 5, 0.005), Geo.rod([0.04, -0.047, 0.027], [0.03, -0.07, 0.052], 0.0048, 5, 0.004));
    b.hand = Geo.merge(hand);
    const foot = [Geo.xf(X.makeRbox(0.05, 0.045, 0.075, 0.016, 1), [0, -0.035, -0.012]), Geo.xf(X.makeRbox(0.04, 0.035, 0.05, 0.014, 1), [0, -0.058, -0.05])];
    for (let f = 0; f < 5; f++) { const x = -0.026 + f * 0.013; foot.push(Geo.rod([x * 0.6, -0.05, 0.02], [x, -0.078, 0.095], 0.0055, 5, 0.0045), Geo.rod([x, -0.08, 0.098], [x * 1.05, -0.086, 0.135 - Math.abs(f - 1) * 0.008], 0.0045, 5, 0.0035)); }
    b.foot = Geo.merge(foot);
    // a kettle helmet: a dome with a brim, rivets about it
    const hl = [Geo.lathe([[0.0005, 0.142], [0.05, 0.134], [0.086, 0.107], [0.101, 0.062], [0.104, 0.03], [0.156, 0.006], [0.157, -0.001], [0.099, 0.021], [0.095, 0.06], [0.081, 0.101], [0.048, 0.127], [0.0005, 0.135]], 20)];
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; hl.push(Geo.xf(new THREE.SphereGeometry(0.006, 5, 4), [Math.cos(a) * 0.108, 0.033, Math.sin(a) * 0.108])); }
    b.helmet = Geo.merge(hl); b.helmet.scale(1.1, 0.92, 1.1);
    // sword: it runs along +z from the hand (blade, cross-guard, grip, pommel)
    const bs = new THREE.Shape([[0.02, -0.024], [0.62, -0.021], [0.78, 0], [0.62, 0.021], [0.02, 0.024]].map((p) => new THREE.Vector2(p[0], p[1])));
    const blade = new THREE.ExtrudeGeometry(bs, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0032, bevelSize: 0.0032, bevelOffset: -0.0032, bevelSegments: 1 }); blade.translate(0, 0, -0.001); blade.rotateY(-Math.PI / 2);
    const grip = new THREE.CylinderGeometry(0.012, 0.0135, 0.13, 8); grip.rotateX(Math.PI / 2); grip.translate(0, 0, -0.06);
    b.sword = Geo.merge([blade, Geo.xf(X.makeRbox(0.026, 0.19, 0.022, 0.006, 1), [0, 0, 0.012]), grip, Geo.xf(new THREE.SphereGeometry(0.019, 8, 6), [0, 0, -0.135])]);
    // shield: its face to +z
    const shd = [Geo.lathe([[0.0005, 0.048], [0.1, 0.044], [0.2, 0.03], [0.292, 0.004], [0.292, -0.012], [0.2, 0.014], [0.1, 0.028], [0.0005, 0.032]], 28), Geo.lathe([[0.278, 0.012], [0.3, 0.004], [0.303, -0.008], [0.296, -0.016], [0.28, -0.006]], 28), Geo.lathe([[0.0005, 0.1], [0.03, 0.094], [0.055, 0.074], [0.066, 0.05], [0.082, 0.044], [0.082, 0.038], [0.0005, 0.04]], 14)];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; shd.push(Geo.xf(new THREE.SphereGeometry(0.008, 5, 4), [Math.cos(a) * 0.23, 0.027, Math.sin(a) * 0.23])); }
    b.shield = Geo.merge(shd); b.shield.rotateX(Math.PI / 2); b.shield.scale(0.85, 0.85, 0.85);
    let tris = 0; for (const k in b) { b[k].computeBoundingSphere(); tris += b[k].attributes.position.count / 3; }
    X.stats.bones = Math.round(performance.now() - t0); X.stats.boneTris = Math.round(tris);
    return (cache = b);
  };
  // the surface of old bone, pale (a skeleton's own colour is laid over it)
  X.EXSRC.bone = [512, 1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 20., 2.), n3 = fbm(uv, 90., 3.);
  vec3 pore = voro(uv, 70., 4.); float pr = smoothstep(.22, .0, pore.x) * step(.82, pore.z);
  vec3 vc = voro(uv, 7., 9.); float crack = (1. - smoothstep(.0, .012, vc.y - vc.x)) * smoothstep(.5, .65, fbm(uv, 3., 12.));
  h = .55 + (n2 - .5) * .22 + (n3 - .5) * .12 - pr * .1 - crack * .22;
  vec3 c = mix(vec3(.96, .94, .9), vec3(.82, .76, .64), smoothstep(.35, .7, n1 + (n2 - .5) * .4));
  c = mix(c, vec3(.44, .36, .26), clamp(pr * .4 + crack * .8 + smoothstep(.6, .85, fbm(uv, 6., 20.)) * .5, 0., 1.)); c *= .88 + n3 * .24;
  col = S(c); rough = .84 + (n2 - .5) * .2 + pr * .16; metal = 0.;
}`];
})();
// ---- the rifle (assault / burst / marksman): receivers from outlines pushed out to a thickness, a rail of real teeth, a handguard of
// eight plates with slots cut through them, a turned barrel, flip-up sights. Built in its own measure (metres, the bore along -z through
// the origin) and then fitted to where weapons.js keeps its muzzle, grip, rail and sight line. One geometry per material. ----
(function () {
  const X = G.GFX, Geo = X.Geo, TAU = Math.PI * 2;
  const rrect = (cx, cy, w, h, r, n) => {
    const p = []; n = n || 3; r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
    const cs = [[cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, 1], [cx - w / 2 + r, cy - h / 2 + r, 2], [cx + w / 2 - r, cy - h / 2 + r, 3]];
    for (const [x, y, q] of cs) for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    return p;
  };
  const circle = (cx, cy, r, n) => { const p = []; for (let i = 0; i < (n || 14); i++) { const a = i / (n || 14) * TAU; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
  const arcRing = (r0, r1, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([Math.cos(a) * r1, Math.sin(a) * r1]); } for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; p.push([Math.cos(a) * r0, Math.sin(a) * r0]); } return p; };
  // an outline (pairs) pushed out to a depth along z, centred on z = 0; its edges chamfered
  const ext = (pts, depth, bevel, holes, steps) => {
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    bevel = Math.max(0, Math.min(bevel === undefined ? 0.0015 : bevel, depth / 2 - 1e-5));
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: steps || 1, curveSegments: 8, steps: 1 });
    g.translate(0, 0, -(depth - bevel * 2) / 2); return g;
  };
  // a cross-section (x, y) pushed along the bore from f0 to f1 (f: forward of the origin; forward is -z)
  const sec = (pts, f0, f1, bevel, holes) => { const g = ext(pts, f1 - f0, bevel, holes); g.translate(0, 0, -(f0 + f1) / 2); return g; };
  // a side outline ([forward, height]) pushed out to a width across the gun
  const side = (pts, width, bevel, holes, x, steps) => { const g = ext(pts, width, bevel, holes, steps); g.rotateY(Math.PI / 2); if (x) g.translate(x, 0, 0); return g; };
  const sh2 = (pts, dx, dy) => pts.map((p) => [p[0] + (dx || 0), p[1] + (dy || 0)]);
  const rb = (w, h, d, r, x, y, f, rot) => Geo.xf(X.makeRbox(w, h, d, r === undefined ? 0.0012 : r, 1), [x, y, -f], rot);
  const lathe = (pts, seg) => { const g = Geo.lathe(pts, seg || 18); g.rotateX(-Math.PI / 2); return g; };   // about the bore: [radius, forward]
  // lay the texture on by position, from the side each face looks to: every part then carries it at one grain
  function boxUV(g, k) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i) * k, y = p.getY(i) * k, z = p.getZ(i) * k; if (ax >= ay && ax >= az) uv.setXY(i, z, y); else if (ay >= az) uv.setXY(i, x, z); else uv.setXY(i, x, y); }
    return g;
  }
  const cache = {};
  // kind: 'rifle' | 'burst' | 'dmr' | 'smg' (the same make, short: a plain barrel, a straight magazine). Returns { metal, poly, steel, mag (geometry about its own middle), magAt [x, y, z], muzzleY }
  X.rifleParts = function (kind) {
    if (cache[kind]) return cache[kind];
    const long = kind === 'dmr', smg = kind === 'smg', ME = [], PO = [], ST = [],
      SCL = smg ? 1.062 : 1.215, Y0 = smg ? 0.0272 : 0.030, Z0 = smg ? -0.031 : -0.0154,   // its own measure -> the game's: the muzzle, grip and rail land where they were
      UT = 0.0215, RY = UT + 0.0094, UPW = 0.043, UB = -0.021, L = -1, EXT = long ? 0.09 : 0;
    // upper receiver: a section pushed along the bore
    const upSec = [[-UPW / 2, UB], [UPW / 2, UB], [UPW / 2, 0.007], [UPW / 2 - 0.0035, 0.0155], [0.0105, UT], [-0.0105, UT], [-UPW / 2 + 0.0035, 0.0155], [-UPW / 2, 0.007]];
    ME.push(sec(upSec, -0.104, 0.099, 0.0012));
    ME.push(rb(0.004, 0.017, 0.062, 0.0015, L * (UPW / 2 + 0.0008), -0.002, -0.058), rb(0.0035, 0.012, 0.03, 0.0015, L * (UPW / 2 + 0.0006), 0.002, 0.07));
    ME.push(rb(0.006, 0.02, 0.05, 0.0025, UPW / 2 + 0.001, 0.0, -0.066));
    ST.push(Geo.rod([UPW / 2, 0.004, 0.088], [UPW / 2 + 0.012, 0.004, 0.096], 0.006, 10));
    ME.push(rb(0.013, 0.007, 0.03, 0.0015, 0, UT - 0.0035, -0.112), rb(0.054, 0.0085, 0.011, 0.002, 0, UT - 0.0035, -0.124));
    // rail: a dovetail base with a tooth every 10 mm
    const dove = [[-0.0078, 0], [0.0078, 0], [0.0078, 0.0026], [0.0106, 0.0054], [0.0106, 0.0068], [0.0086, 0.0094], [-0.0086, 0.0094], [-0.0106, 0.0068], [-0.0106, 0.0054], [-0.0078, 0.0026]];
    const base = [[-0.0078, 0], [0.0078, 0], [0.0078, 0.0056], [-0.0078, 0.0056]];
    const rail = (f0, f1) => { ME.push(sec(sh2(base, 0, UT), f0, f1, 0)); for (let f = f0 + 0.0026; f + 0.0052 <= f1 + 1e-6; f += 0.01) ME.push(sec(sh2(dove, 0, UT), f, f + 0.0052, 0.0005)); };
    rail(-0.101, 0.098);
    // handguard: eight plates about the barrel, slots cut through them
    const HW = 0.046, HC = UT - HW / 2, HF0 = 0.101, HF1 = smg ? 0.25 : 0.42 + EXT * 0.6, fw = HW * Math.tan(Math.PI / 8) + 0.0016, th = 0.0024;
    const oct = (w) => { const p = [], R = w / 2 / Math.cos(Math.PI / 8); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; p.push([Math.cos(a) * R, HC + Math.sin(a) * R]); } return p; };
    ME.push(sec(oct(HW), HF0, HF0 + 0.02, 0.0012), sec(oct(HW + 0.002), HF0 + 0.004, HF0 + 0.012, 0.0008), sec(oct(HW), HF1 - 0.004, HF1, 0.0008, [circle(0, HC, 0.0165, 16)]));
    for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4, holes = [];
      if (k !== 2) {
        if ((k % 2 === 0) || k === 5 || k === 7) for (let f = HF0 + 0.05; f < HF1 - 0.03; f += 0.0405) holes.push(rrect(f, 0, 0.032, 0.0072, 0.0026, 2));
        else for (let f = HF0 + 0.04; f < HF1 - 0.02; f += 0.027) holes.push(rrect(f, 0, 0.017, 0.0052, 0.0024, 2));
      }
      const g = side([[HF0 + 0.019, -fw / 2], [HF1 - 0.003, -fw / 2], [HF1 - 0.003, fw / 2], [HF0 + 0.019, fw / 2]], th, 0.0006, holes);
      ME.push(Geo.xf(g, [Math.cos(ang) * (HW / 2 - th / 2), HC + Math.sin(ang) * (HW / 2 - th / 2), 0], [0, 0, ang]));
    }
    rail(HF0 + 0.001, HF1 - 0.002);
    // barrel, gas block and tube, a three-pronged flash hider
    const BF = smg ? 0.268 : 0.462 + EXT, MZ = BF + 0.052;
    if (smg) ME.push(lathe([[0.0005, 0.09], [0.0125, 0.09], [0.0125, 0.128], [0.0105, 0.136], [0.0105, BF], [0.0005, BF]], 16));
    else {
      ME.push(lathe([[0.0005, 0.09], [0.0125, 0.09], [0.0125, 0.128], [0.0096, 0.136], [0.0096, 0.30], [0.0112, 0.303], [0.0112, 0.343], [0.0091, 0.347], [0.0091, BF], [0.0005, BF]], 16));
      ME.push(rb(0.019, 0.013, 0.036, 0.002, 0, 0.0125, 0.323)); ST.push(Geo.rod([0, 0.0165, -0.10], [0, 0.0165, -0.31], 0.0026, 6));
    }
    ME.push(lathe([[0.0005, BF - 0.004], [0.0108, BF - 0.004], [0.0108, BF + 0.001], [0.0098, BF + 0.003], [0.0098, BF + 0.007], [0.0108, BF + 0.009], [0.0108, BF + 0.018], [0.0005, BF + 0.018]], 16));
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + Math.PI / 2; ME.push(sec(arcRing(0.0058, 0.0108, a - 0.72, a + 0.72, 5), BF + 0.017, MZ, 0.0009)); }
    // lower receiver, trigger guard, trigger, pins and controls
    const LW = 0.0385;
    ME.push(side([[0.086, -0.019], [0.0865, -0.045], [0.081, -0.089], [0.02, -0.084], [0.0145, -0.056], [-0.05, -0.056], [-0.06, -0.074], [-0.098, -0.068], [-0.108, -0.05], [-0.106, -0.019]], LW, 0.0022));
    ME.push(side([[0.0835, -0.08], [0.084, -0.091], [0.018, -0.0855], [0.0185, -0.076]], LW + 0.004, 0.0015));
    ME.push(lathe([[0.0005, -0.124], [0.0195, -0.124], [0.0195, -0.104], [0.0005, -0.104]], 16)); ST.push(lathe([[0.0005, -0.128], [0.0215, -0.128], [0.0215, -0.1245], [0.0005, -0.1245]], 16));
    const pin = (f, y, r, out) => ST.push(Geo.rod([L * (LW / 2 - 0.001), y, -f], [L * (LW / 2 + (out || 0.0012)), y, -f], r, 10));
    pin(0.07, -0.03, 0.0046); pin(-0.094, -0.031, 0.0046); pin(-0.03, -0.041, 0.0026); pin(-0.011, -0.045, 0.0026); pin(-0.066, -0.036, 0.0075, 0.0022);
    ST.push(rb(0.0042, 0.0056, 0.024, 0.0015, L * (LW / 2 + 0.0034), -0.036, -0.054), rb(0.0036, 0.022, 0.009, 0.0012, L * (LW / 2 + 0.002), -0.014, 0.008), rb(0.0044, 0.012, 0.013, 0.0015, L * (LW / 2 + 0.0026), -0.031, 0.008), rb(0.003, 0.004, 0.03, 0.001, L * (LW / 2 + 0.0012), -0.041, 0.042));
    ST.push(Geo.rod([LW / 2 - 0.001, -0.041, -0.04], [LW / 2 + 0.003, -0.041, -0.04], 0.005, 10));
    ME.push(side([[0.0165, -0.054], [0.0165, -0.064], [0.004, -0.0915], [-0.05, -0.0915], [-0.0555, -0.086], [-0.0555, -0.054]], 0.0125, 0.0009, [[[0.0128, -0.057], [0.0128, -0.0632], [0.002, -0.0878], [-0.0495, -0.0878], [-0.0518, -0.0855], [-0.0518, -0.057]]]));
    ST.push(side([[-0.0205, -0.055], [-0.012, -0.055], [-0.0142, -0.067], [-0.019, -0.079], [-0.0232, -0.0805], [-0.0215, -0.068]], 0.0068, 0.0014));
    // grip and stock (wood on the marksman's)
    PO.push(side([[-0.052, -0.055], [-0.058, -0.075], [-0.066, -0.092], [-0.096, -0.152], [-0.1, -0.158], [-0.138, -0.158], [-0.142, -0.152], [-0.118, -0.095], [-0.113, -0.075], [-0.118, -0.06], [-0.11, -0.055]], 0.031, 0.0075, null, 0, 3));
    PO.push(side([[-0.098, -0.1555], [-0.14, -0.1555], [-0.1405, -0.161], [-0.0985, -0.161]], 0.03, 0.002));
    ME.push(lathe([[0.0005, -0.305], [0.0148, -0.305], [0.0148, -0.106], [0.0005, -0.106]], 14));
    PO.push(side([[-0.135, 0.022], [-0.302, 0.022], [-0.308, 0.012], [-0.308, -0.1], [-0.294, -0.106], [-0.252, -0.054], [-0.19, -0.031], [-0.135, -0.027]], 0.041, 0.0045, [[[-0.207, -0.037], [-0.288, -0.088], [-0.288, -0.037]]], 0, 2));
    PO.push(rb(0.043, 0.128, 0.012, 0.004, 0, -0.04, -0.312), rb(0.012, 0.01, 0.04, 0.003, 0, -0.034, -0.165));
    if (kind === 'burst') PO.push(Geo.xf(side([[0.2, -0.026], [0.25, -0.026], [0.236, -0.085], [0.222, -0.09], [0.206, -0.085]], 0.026, 0.006, null, 0, 2), null));
    // flip-up sights on the rail: a post between two ears in front, a plate with a hole behind. The line through them is weapons.js's ironY
    const SL = ((smg ? 0.075 : 0.088) - Y0) / SCL, ff = smg ? 0.2 : (0.37 + Z0) / SCL, fr = (-0.088 + Z0) / SCL;
    // (the sights that stand on the rail are a piece of their own: they fold away under an optic)
    const IR = [rb(0.003, SL - RY, 0.004, 0.0006, 0, (SL + RY) / 2, ff)];
    ME.push(rb(0.02, 0.006, 0.026, 0.0012, 0, RY + 0.003, ff));
    for (const sx of [-1, 1]) IR.push(rb(0.003, SL - RY + 0.006, 0.014, 0.001, sx * 0.008, (SL + RY) / 2 + 0.003, ff));
    ME.push(rb(0.022, 0.006, 0.026, 0.0012, 0, RY + 0.003, fr));
    IR.push(Geo.xf(ext(rrect(0, SL - 0.002, 0.019, (SL - RY) * 2 - 0.002, 0.003, 2), 0.004, 0.0006, [circle(0, SL, 0.0056, 16)]), [0, 0, -fr]));   // (a ring to look through, not a pinhole)
    // magazine: curved, a raised panel and ribs on its sides, a floor plate
    const MG = smg ? [side([[0.031, -0.03], [0.031, -0.2], [0.063, -0.2], [0.063, -0.03]], 0.019, 0.002), side([[0.029, -0.196], [0.029, -0.208], [0.065, -0.208], [0.065, -0.196]], 0.023, 0.002)]
      : [side([[0.021, -0.03], [0.024, -0.09], [0.031, -0.15], [0.043, -0.205], [0.046, -0.214], [0.107, -0.197], [0.106, -0.187], [0.093, -0.14], [0.082, -0.09], [0.076, -0.03]], 0.0225, 0.002),
        side([[0.028, -0.096], [0.036, -0.152], [0.047, -0.196], [0.098, -0.184], [0.088, -0.14], [0.078, -0.096]], 0.0242, 0.0012), side([[0.039, -0.203], [0.043, -0.2205], [0.111, -0.2015], [0.109, -0.185]], 0.027, 0.0022)];
    const fit = (list) => { const g = Geo.merge(list); g.scale(SCL, SCL, SCL); g.translate(0, Y0, Z0); return boxUV(g, 5); };
    const out = { metal: fit(ME), poly: fit(PO), steel: fit(ST), irons: fit(IR), muzzleY: Y0, muzzleZ: -MZ * SCL + Z0 };
    const mag = fit(MG); mag.computeBoundingBox(); const c = mag.boundingBox.getCenter(new THREE.Vector3()); mag.translate(-c.x, -c.y, -c.z); out.mag = mag; out.magAt = [c.x, c.y, c.z];
    let tris = 0; for (const k of ['metal', 'poly', 'steel', 'mag']) { out[k].computeBoundingSphere(); tris += out[k].attributes.position.count / 3; }
    X.stats.rifleTris = Math.round(tris);
    return (cache[kind] = out);
  };

  // ---- the pistol, in the game's own measure (forward is -z): a slide with its cuts and sights (its own piece: it runs back at each
  // shot), a frame from one side outline with the trigger guard cut through it, the barrel's end, the small controls, the magazine ----
  let pist = null;
  X.pistolParts = function () {
    if (pist) return pist;
    const FR = [], ST = [], SL = [], SS = [], SI = [], fit = (list) => boxUV(Geo.merge(list), 6);
    // slide, about its own middle (weapons.js sets it at 0, 0.035, -0.02)
    SL.push(sec([[-0.0152, -0.0175], [0.0152, -0.0175], [0.0152, 0.008], [0.0112, 0.0175], [-0.0112, 0.0175], [-0.0152, 0.008]], -0.095, 0.095, 0.0012));
    for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) SL.push(rb(0.0014, 0.021, 0.0032, 0.0005, sx * 0.0155, -0.002, -0.04 - i * 0.0072, [0.25, 0, 0]));
    SI.push(rb(0.004, 0.007, 0.006, 0.001, 0, 0.0205, 0.083));   // (the sights: a piece of their own on the slide)
    for (const sx of [-1, 1]) SI.push(rb(0.005, 0.0075, 0.008, 0.001, sx * 0.0075, 0.0207, -0.083));
    SL.push(rb(0.02, 0.003, 0.01, 0.001, 0, 0.0185, -0.083));
    SS.push(rb(0.0008, 0.012, 0.03, 0.0002, 0.0152, 0.004, 0.02), rb(0.012, 0.0008, 0.03, 0.0002, 0.0062, 0.0173, 0.02));   // the barrel's hood, seen through the port
    // frame: one outline, the trigger guard cut through it
    const fr = [[0.1, 0.0175], [0.1, -0.004], [0.052, -0.006], [0.0535, -0.014], [0.051, -0.04], [0.046, -0.045], [0.002, -0.045], [-0.006, -0.038], [-0.014, -0.024], [-0.036, -0.105], [-0.038, -0.112], [-0.082, -0.108], [-0.085, -0.101], [-0.062, -0.02], [-0.066, -0.004], [-0.082, 0.004], [-0.08, 0.0175]];
    FR.push(side(fr, 0.0285, 0.0042, [[[0.046, -0.012], [0.0445, -0.037], [0.006, -0.0395], [-0.006, -0.014]]], 0, 2));
    for (const sx of [-1, 1]) FR.push(rb(0.0014, 0.06, 0.03, 0.0005, sx * 0.0146, -0.064, -0.049, [0.26, 0, 0]));
    for (let i = 0; i < 3; i++) FR.push(rb(0.021, 0.003, 0.0045, 0.0006, 0, -0.0052, 0.062 + i * 0.012));
    // the barrel's end and the guide rod under it, trigger, slide stop, magazine catch, hammer
    const brl = lathe([[0.0005, 0.1], [0.0064, 0.1], [0.0064, 0.1235], [0.005, 0.1255], [0.0005, 0.1255]], 14); brl.translate(0, 0.035, 0); ST.push(brl);
    const rod = lathe([[0.0005, 0.1], [0.0034, 0.1], [0.0034, 0.1165], [0.0005, 0.1165]], 10); rod.translate(0, 0.0235, 0); ST.push(rod);
    ST.push(side([[0.03, -0.012], [0.036, -0.012], [0.031, -0.026], [0.024, -0.034], [0.021, -0.033], [0.027, -0.024]], 0.006, 0.0012));
    ST.push(rb(0.002, 0.005, 0.024, 0.001, -0.0152, 0.008, 0.004), rb(0.002, 0.006, 0.008, 0.001, -0.0152, 0.006, 0.05));
    ST.push(Geo.rod([-0.013, -0.017, 0.013], [-0.0166, -0.017, 0.013], 0.0038, 10), rb(0.006, 0.012, 0.007, 0.002, 0, 0.011, -0.085, [-0.4, 0, 0]));
    // magazine, about its own middle (weapons.js sets and leans it)
    const MG = [X.makeRbox(0.022, 0.076, 0.032, 0.003, 1), Geo.xf(X.makeRbox(0.03, 0.007, 0.043, 0.002, 1), [0, -0.0405, 0.002])];
    return (pist = { frame: fit(FR), steel: fit(ST), slide: fit(SL), slideSteel: fit(SS), slideIrons: fit(SI), mag: fit(MG) });
  };

  // ---- the shotgun, in the game's own measure: a receiver from one outline with the guard cut through it, a turned barrel with a
  // ventilated rib and a bead, the magazine tube under it, a ribbed fore-end that slides (its own piece), a stock cut in one piece ----
  const sgc = {};
  X.shotgunParts = function (auto) {
    const key = auto ? 'a' : 'p'; if (sgc[key]) return sgc[key];
    const ME = [], ST = [], WO = [], BR = [], fit = (list) => boxUV(Geo.merge(list), 5);
    ME.push(side([[0.12, 0.052], [0.12, -0.012], [0.03, -0.016], [0.032, -0.024], [0.03, -0.05], [0.024, -0.056], [-0.03, -0.056], [-0.04, -0.048], [-0.05, -0.022], [-0.12, -0.022], [-0.12, 0.03], [-0.1, 0.046], [-0.06, 0.054]], 0.044, 0.004,
      [[[0.022, -0.022], [0.021, -0.047], [-0.026, -0.048], [-0.034, -0.026]]], 0, 2));
    ST.push(side([[0.0, -0.022], [0.006, -0.022], [0.002, -0.034], [-0.004, -0.042], [-0.007, -0.041], [-0.002, -0.032]], 0.006, 0.0012), rb(0.0008, 0.02, 0.06, 0.0002, 0.0222, 0.03, 0.03));
    const brl = lathe([[0.0005, 0.1], [0.0148, 0.1], [0.0148, 0.6], [0.0156, 0.605], [0.0156, 0.626], [0.0005, 0.626]], 16); brl.translate(0, 0.04, 0); ME.push(brl);
    ME.push(rb(0.007, 0.003, 0.5, 0.0008, 0, 0.0582, 0.36));
    for (let i = 0; i < 8; i++) ME.push(rb(0.004, 0.005, 0.007, 0.0008, 0, 0.0558, 0.14 + i * 0.062));
    const tube = lathe([[0.0005, 0.1], [0.0118, 0.1], [0.0118, 0.565], [0.0136, 0.567], [0.0136, 0.585], [0.011, 0.588], [0.0005, 0.588]], 14); tube.translate(0, 0.006, 0); ST.push(tube);
    ME.push(rb(0.012, 0.05, 0.012, 0.003, 0, 0.024, 0.5));
    // the stock, wrist to butt, in one piece
    WO.push(side([[-0.072, -0.022], [-0.098, -0.108], [-0.132, -0.112], [-0.128, -0.06], [-0.16, -0.045], [-0.3, -0.05], [-0.41, -0.07], [-0.412, 0.03], [-0.27, 0.036], [-0.17, 0.03], [-0.12, 0.03], [-0.12, -0.022]], 0.04, 0.008, null, 0, 2));
    ME.push(rb(0.042, 0.11, 0.01, 0.004, 0, -0.022, -0.418));
    BR.push(Geo.xf(new THREE.SphereGeometry(0.004, 8, 6), [0, 0.0625, -0.6]));
    const out = { metal: fit(ME), steel: fit(ST), wood: fit(WO), brass: fit(BR) };
    if (!auto) {
      // the fore-end, about its own middle (weapons.js sets it at 0, 0, -0.28): a sleeve round the tube with gripping ribs
      const hole = () => circle(0, 0.006, 0.0125, 14), PU = [sec(rrect(0, 0.001, 0.05, 0.046, 0.012, 3), -0.07, 0.07, 0.003, [hole()])];
      for (let i = 0; i < 7; i++) PU.push(sec(rrect(0, 0.0005, 0.0535, 0.0485, 0.013, 3),-0.05 + i * 0.016, -0.05 + i * 0.016 + 0.006, 0.0015, [hole()]));
      out.pump = fit(PU);
    }
    return (sgc[key] = out);
  };

  // ---- the bolt-action rifle: a stock cut in one piece from fore-end to butt, a round action let into it, a tapered barrel with a
  // ringed brake, a rail of teeth, the bolt's handle with its knob (its own piece: it is worked at each shot), a box magazine ----
  let snip = null;
  X.sniperParts = function () {
    if (snip) return snip;
    const ME = [], ST = [], WO = [], fit = (list) => boxUV(Geo.merge(list), 5);
    WO.push(side([[0.36, 0.012], [0.36, -0.02], [0.34, -0.034], [0.06, -0.04], [-0.04, -0.04], [-0.075, -0.035], [-0.1, -0.11], [-0.135, -0.115], [-0.14, -0.065], [-0.18, -0.05], [-0.3, -0.058], [-0.45, -0.075], [-0.452, 0.03], [-0.3, 0.04], [-0.2, 0.036], [-0.17, 0.018], [-0.15, 0.012]], 0.046, 0.01, null, 0, 2));
    const act = lathe([[0.0005, -0.15], [0.02, -0.15], [0.022, -0.145], [0.022, 0.15], [0.019, 0.155], [0.0005, 0.155]], 18); act.translate(0, 0.025, 0); ME.push(act);
    ME.push(rb(0.018, 0.012, 0.24, 0.002, 0, 0.05, 0.04), rb(0.024, 0.006, 0.25, 0.001, 0, 0.059, 0.04));
    for (let i = 0; i < 12; i++) ME.push(rb(0.024, 0.004, 0.012, 0.0008, 0, 0.064, -0.075 + i * 0.021));
    const brl = lathe([[0.0005, 0.15], [0.017, 0.15], [0.017, 0.2], [0.0135, 0.27], [0.011, 0.74], [0.0005, 0.74]], 16); brl.translate(0, 0.025, 0); ME.push(brl);
    const brk = lathe([[0.0005, 0.735], [0.018, 0.735], [0.0195, 0.741], [0.0195, 0.752], [0.016, 0.753], [0.016, 0.762], [0.0195, 0.763], [0.0195, 0.774], [0.016, 0.775], [0.016, 0.784], [0.0195, 0.785], [0.0195, 0.798], [0.017, 0.806], [0.0005, 0.806]], 16); brk.translate(0, 0.025, 0); ME.push(brk);
    ME.push(rb(0.048, 0.106, 0.012, 0.004, 0, -0.022, -0.456));
    ST.push(side([[-0.016, -0.036], [-0.02, -0.06], [-0.03, -0.068], [-0.066, -0.068], [-0.08, -0.036]], 0.012, 0.002, [[[-0.024, -0.042], [-0.027, -0.058], [-0.033, -0.062], [-0.064, -0.062], [-0.072, -0.042]]]));
    ST.push(side([[-0.04, -0.04], [-0.046, -0.04], [-0.05, -0.052], [-0.046, -0.06], [-0.043, -0.059], [-0.045, -0.05]], 0.006, 0.0012));
    // the bolt, about where weapons.js sets it (0.035, 0.04, 0.08): the handle bent down to its knob, the shroud at the action's end
    const shr = lathe([[0.0005, -0.105], [0.012, -0.105], [0.0135, -0.1], [0.0135, -0.07], [0.0005, -0.07]], 12); shr.translate(-0.035, -0.015, 0);
    const BO = [Geo.rod([-0.03, -0.012, 0], [0.014, -0.02, 0], 0.0048, 10), Geo.xf(new THREE.SphereGeometry(0.0095, 12, 9), [0.02, -0.022, 0]), shr];
    return (snip = { metal: fit(ME), steel: fit(ST), wood: fit(WO), bolt: fit(BO), mag: boxUV(X.makeRbox(0.03, 0.06, 0.07, 0.004, 1), 5) });
  };

  // ---- the revolver: a frame from one outline with the cylinder's window and the guard cut through it, a fluted cylinder (its own
  // piece: it turns), a barrel with its rib, ramp and lug, a hammer, a grip of wood cut round ----
  let revo = null;
  X.revolverParts = function () {
    if (revo) return revo;
    const ME = [], ST = [], WO = [], BR = [], IR = [], fit = (list) => boxUV(Geo.merge(list), 6);
    ME.push(side([[0.035, 0.066], [0.035, -0.008], [0.024, -0.01], [0.025, -0.034], [0.018, -0.042], [-0.022, -0.042], [-0.03, -0.032], [-0.036, -0.012], [-0.078, -0.008], [-0.082, 0.02], [-0.072, 0.05], [-0.056, 0.066]], 0.026, 0.004,
      [[[0.027, 0.059], [0.027, -0.001], [-0.027, -0.001], [-0.027, 0.059]], [[0.019, -0.012], [0.019, -0.032], [0.014, -0.037], [-0.02, -0.037], [-0.027, -0.03], [-0.03, -0.012]]], 0, 2));
    const brl = lathe([[0.0005, 0.03], [0.0135, 0.03], [0.0135, 0.226], [0.0115, 0.232], [0.0005, 0.232]], 16); brl.translate(0, 0.04, 0); ME.push(brl);
    ME.push(rb(0.02, 0.02, 0.16, 0.007, 0, 0.022, 0.112), rb(0.011, 0.014, 0.196, 0.002, 0, 0.057, 0.132));
    IR.push(side([[0.196, 0.063], [0.228, 0.063], [0.226, 0.0695], [0.212, 0.0715]], 0.005, 0.001));   // (the sights: a piece of their own)
    for (const sx of [-1, 1]) IR.push(rb(0.004, 0.006, 0.01, 0.001, sx * 0.006, 0.069, -0.05));
    ST.push(side([[-0.06, 0.05], [-0.068, 0.072], [-0.08, 0.08], [-0.086, 0.075], [-0.076, 0.066], [-0.074, 0.046]], 0.008, 0.0015));
    ST.push(side([[-0.002, -0.012], [0.004, -0.012], [0.0, -0.024], [-0.006, -0.032], [-0.009, -0.031], [-0.004, -0.022]], 0.006, 0.0012));
    ST.push(rb(0.004, 0.012, 0.014, 0.002, -0.0135, 0.022, -0.045));
    WO.push(side([[-0.036, -0.012], [-0.05, -0.05], [-0.062, -0.1], [-0.066, -0.112], [-0.11, -0.108], [-0.112, -0.09], [-0.098, -0.04], [-0.088, 0.0], [-0.082, 0.018], [-0.06, 0.004]], 0.032, 0.011, null, 0, 3));
    for (const sx of [-1, 1]) BR.push(Geo.xf(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 12), [sx * 0.0162, -0.03, 0.07], [0, 0, Math.PI / 2]));
    // the cylinder, about its own axis the way weapons.js turns it (the axis is its y; the mesh is laid over): six flutes, six rims at the back
    const prof = []; for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, c = Math.cos(a * 6) * 0.5 + 0.5, r = 0.029 - 0.004 * c * c * c; prof.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const dr = sec(prof, -0.025, 0.025, 0.002); dr.rotateX(-Math.PI / 2);
    const rims = []; for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * TAU; rims.push(Geo.xf(new THREE.CylinderGeometry(0.0058, 0.0058, 0.0016, 10), [Math.cos(a) * 0.018, 0.0256, Math.sin(a) * 0.018])); }
    // (the grip's grain runs down the grip, not along the gun)
    const wo = fit(WO), wuv = wo.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getY(i), wuv.getX(i));
    return (revo = { metal: fit(ME), steel: fit(ST), wood: wo, brass: fit(BR), irons: fit(IR), drum: boxUV(dr, 6), drumBrass: fit(rims) });
  };

  // ---- the light machine gun: a receiver from one outline under its feed cover, a rail raised on two posts, a slotted guard with its
  // heat shield, a heavy barrel with gas block and flash hider, a bipod, a stock with a window cut through it, the box and its belt ----
  let lmgc = null;
  X.lmgParts = function () {
    if (lmgc) return lmgc;
    const ME = [], ST = [], PO = [], fit = (list) => boxUV(Geo.merge(list), 5);
    ME.push(side([[0.18, 0.062], [0.18, -0.02], [0.05, -0.028], [-0.06, -0.028], [-0.18, -0.022], [-0.18, 0.05], [-0.15, 0.066], [0.1, 0.068]], 0.064, 0.005, null, 0, 2));
    ME.push(rb(0.058, 0.014, 0.2, 0.004, 0, 0.071, 0.02));
    for (const f of [0.15, 0.05]) ME.push(rb(0.012, 0.05, 0.02, 0.003, 0, 0.1, f));
    ME.push(rb(0.024, 0.006, 0.14, 0.001, 0, 0.1235, 0.1));
    for (let i = 0; i < 7; i++) ME.push(rb(0.024, 0.0035, 0.011, 0.0008, 0, 0.1282, 0.04 + i * 0.02));
    PO.push(sec(rrect(0, 0.02, 0.06, 0.07, 0.012, 3), 0.17, 0.47, 0.004));
    ME.push(rb(0.04, 0.008, 0.26, 0.003, 0, 0.058, 0.32));
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) ME.push(rb(0.002, 0.012, 0.024, 0.0008, sx * 0.0302, 0.03, 0.21 + i * 0.042));
    const brl = lathe([[0.0005, 0.45], [0.0145, 0.45], [0.0145, 0.6], [0.013, 0.61], [0.013, 0.745], [0.0005, 0.745]], 16); brl.translate(0, 0.025, 0); ME.push(brl);
    const fh = lathe([[0.0005, 0.74], [0.018, 0.74], [0.022, 0.756], [0.022, 0.8], [0.018, 0.812], [0.0005, 0.812]], 16); fh.translate(0, 0.025, 0); ME.push(fh);
    ME.push(rb(0.022, 0.034, 0.03, 0.004, 0, 0.018, 0.5));
    const gas = lathe([[0.0005, 0.45], [0.008, 0.45], [0.008, 0.505], [0.0005, 0.505]], 10); gas.translate(0, 0.002, 0); ST.push(gas);
    PO.push(side([[-0.085, -0.022], [-0.105, -0.118], [-0.142, -0.122], [-0.15, -0.06], [-0.135, -0.022]], 0.036, 0.009, null, 0, 2));
    PO.push(side([[-0.18, 0.05], [-0.18, -0.022], [-0.3, -0.04], [-0.44, -0.05], [-0.45, -0.045], [-0.45, 0.045], [-0.3, 0.05]], 0.05, 0.005, [[[-0.23, 0.026], [-0.23, -0.008], [-0.4, -0.026], [-0.4, 0.026]]], 0, 2));
    for (const sx of [-1, 1]) { ST.push(Geo.rod([sx * 0.018, -0.012, -0.5], [sx * 0.042, -0.125, -0.585], 0.005, 8)); ST.push(rb(0.014, 0.006, 0.02, 0.002, sx * 0.043, -0.128, 0.588)); }
    ST.push(side([[-0.03, -0.022], [-0.035, -0.05], [-0.045, -0.058], [-0.08, -0.058], [-0.09, -0.022]], 0.01, 0.002, [[[-0.038, -0.032], [-0.041, -0.048], [-0.047, -0.052], [-0.078, -0.052], [-0.083, -0.032]]]));
    ST.push(side([[-0.055, -0.03], [-0.061, -0.03], [-0.064, -0.042], [-0.06, -0.05], [-0.057, -0.049], [-0.059, -0.04]], 0.006, 0.0012));
    // the box, about its own middle (weapons.js sets it), and the belt up from it to the feed: it comes away with the box
    const MG = [X.makeRbox(0.09, 0.1, 0.1, 0.008, 1), Geo.xf(X.makeRbox(0.094, 0.012, 0.104, 0.004, 1), [0, 0.046, 0])];
    const BL = []; for (let i = 0; i < 6; i++) BL.push(Geo.rod([0.012, 0.056 + i * 0.011, -0.016], [0.012, 0.056 + i * 0.011, 0.016], 0.0048, 8));
    return (lmgc = { metal: fit(ME), steel: fit(ST), poly: fit(PO), mag: fit(MG), belt: fit(BL) });
  };

  // ---- hand weapons (melee.js). Each is a list of parts { g: a geometry about its own middle, at: where that middle goes, m: which of the
  // weapon's materials, glow } and the height of its point. The grip is the origin, the blade runs up +y, x is its thickness, a single
  // edge looks to -z. A blade is lofted through sections that have a ridge and thin to an edge (flat faces: the ridge catches the light);
  // grips and pommels are turned, then pressed oval; guards and heads are outlines pushed out to a thickness ----
  // secs: { c: [y, z], n: [ny, nz] (unit, from back to edge), a (c to the back), b (c to the edge), T (thickness at the ridge),
  //   tb (thickness of the back; 0: an edge there too), rk (where the ridge lies between back 0 and edge 1) }; tip: [y, z] or none
  function loft(secs, tip) {
    const ring = (s) => {
      const cy = s.c[0], cz = s.c[1], ny = s.n[0], nz = s.n[1], zb = -s.a, ze = s.b, zr = zb + (ze - zb) * (s.rk === undefined ? (s.tb ? 0.3 : 0.5) : s.rk);
      const at = (d, x) => [x, cy + ny * d, cz + nz * d];
      return s.tb ? [at(zb, s.tb / 2), at(zr, s.T / 2), at(ze, 0), at(zr, -s.T / 2), at(zb, -s.tb / 2)] : [at(zb, 0), at(zr, s.T / 2), at(ze, 0), at(zr, -s.T / 2)];
    };
    const R = secs.map(ring), n = R[0].length, pos = [];
    const tri = (a, b, c) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
    for (let i = 0; i + 1 < R.length; i++) for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; tri(R[i][k], R[i][k2], R[i + 1][k2]); tri(R[i][k], R[i + 1][k2], R[i + 1][k]); }
    const L = R[R.length - 1], F = R[0];
    if (tip) { const t = [0, tip[0], tip[1]]; for (let k = 0; k < n; k++) tri(L[k], L[(k + 1) % n], t); } else for (let k = 1; k + 1 < n; k++) tri(L[0], L[k], L[k + 1]);
    for (let k = 1; k + 1 < n; k++) tri(F[0], F[k + 1], F[k]);
    // (which way the faces wind depends on which way the sections run: look at one face and turn them all over if it looks inward)
    const a = R[0][1], b = R[1] ? R[1][1] : L[1], c = R[0][2], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;   // (the first side face lies on the +x side and must look to +x: as wound above it does when this is negative)
    if (nx > 0) for (let i = 0; i < pos.length; i += 9) { for (let j = 0; j < 3; j++) { const t = pos[i + 3 + j]; pos[i + 3 + j] = pos[i + 6 + j]; pos[i + 6 + j] = t; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  }
  // a blade whose back-to-edge line stays along z. rows: [y, to the back, to the edge, T, tb, z of the line, rk]
  const straight = (rows, tip) => loft(rows.map((r) => ({ c: [r[0], r[5] || 0], n: [0, -1], a: r[1], b: r[2], T: r[3], tb: r[4] || 0, rk: r[6] })), tip);
  const hl = (pts, sx, sz, seg) => { const g = Geo.lathe(pts, seg || 16); g.scale(sx === undefined ? 1 : sx, 1, sz === undefined ? 1 : sz); g.computeVertexNormals(); return g; };
  const wrapPts = (y0, y1, r, n) => { const p = [[0.0005, y0]]; for (let i = 0; i <= n * 2; i++) p.push([r * (i % 2 ? 1 : 0.925), y0 + (y1 - y0) * i / (n * 2)]); p.push([0.0005, y1]); return p; };
  const gemG = (rx, ry, rz, at) => { const g = new THREE.OctahedronGeometry(1, 0).toNonIndexed(); g.scale(rx, ry, rz); g.computeVertexNormals(); g.translate(at[0], at[1], at[2]); return g; };
  const ringY = (y, R, r) => { const g = new THREE.TorusGeometry(R, r, 8, 20); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g; };
  const ball = (r, at, s) => { const g = new THREE.SphereGeometry(r, 12, 9); if (s) g.scale(s[0], s[1], s[2]); g.translate(at[0], at[1], at[2]); return g; };
  const spike = (r, h, at, rot, seg) => { const g = new THREE.ConeGeometry(r, h, seg || 4).toNonIndexed(); g.computeVertexNormals(); return Geo.xf(g, at, rot); };
  const prism = (r, len, at, rot, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 8, 1).toNonIndexed(); g.computeVertexNormals(); return Geo.xf(g, at, rot); };
  const rbx = (w, h, d, r, x, y, z, rot) => Geo.xf(X.makeRbox(w, h, d, r, 1), [x, y, z], rot);
  const mpart = (m, list, glow) => { const g = boxUV(Geo.merge(Array.isArray(list) ? list : [list]), 7); if (m === 'wood') { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i)); } g.computeBoundingBox();   // (a haft's grain runs along the haft)
    const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z); return { g, at: [c.x, c.y, c.z], m, glow: !!glow }; };
  const HX = Math.PI / 2, MP = {};

  // the knife: a moulded grip with swells for the fingers, a guard with a stop, a clip-point blade
  MP.knife = () => ({ tipY: 0.302, parts: [
    mpart('dark', hl([[0.0005, -0.058], [0.013, -0.058], [0.0165, -0.05], [0.0152, -0.036], [0.0168, -0.022], [0.0152, -0.008], [0.0168, 0.006], [0.0152, 0.02], [0.0168, 0.034], [0.015, 0.052], [0.0005, 0.052]], 0.82, 1.18)),
    mpart('steel', [rbx(0.02, 0.012, 0.03, 0.004, 0, -0.064, 0), side([[0.036, 0.053], [0.039, 0.061], [0.031, 0.068], [-0.024, 0.068], [-0.028, 0.061], [-0.024, 0.053]], 0.024, 0.003)]),
    mpart('blade', straight([[0.068, 0.015, 0.019, 0.0066, 0.0046], [0.2, 0.015, 0.019, 0.0064, 0.0044], [0.25, 0.0128, 0.016, 0.0056, 0.0038], [0.285, 0.0065, 0.0085, 0.004, 0.0024]], [0.302, 0.003])),
  ] });
  // the fighting knife: a grip wound with hide, a turned pommel, a straight guard, a dagger's two edges
  MP.sknife = () => ({ tipY: 0.30, parts: [
    mpart('wrap', hl(wrapPts(-0.06, 0.058, 0.0165, 9), 0.86, 1.12)),
    mpart('steel', [hl([[0.0005, -0.088], [0.011, -0.085], [0.0145, -0.075], [0.011, -0.064], [0.0005, -0.062]]), side([[0.042, 0.06], [0.044, 0.066], [0.04, 0.072], [-0.04, 0.072], [-0.044, 0.066], [-0.042, 0.06], [-0.012, 0.058], [0.012, 0.058]], 0.022, 0.004)]),
    mpart('blade', straight([[0.072, 0.018, 0.018, 0.0072], [0.2, 0.018, 0.018, 0.007], [0.262, 0.0105, 0.0105, 0.0052]], [0.30, 0])),
  ] });
  const slimHilt = () => hl([[0.0005, -0.055], [0.013, -0.055], [0.0155, -0.03], [0.014, 0], [0.0155, 0.03], [0.013, 0.055], [0.0005, 0.055]], 0.85, 1.12);
  // (an element is told by what the weapon is made of and what has happened to it, not by light: frost on blued steel, steel discoloured
  // by heat and sooted, a stained fuller and green bronze, polished steel inlaid with gold, copper wire and driven studs. A weapon of
  // higher rank is told from its plain kin by finer work - pierced iron, inlay, mounts of old gold - not by size or glow)
  // the edge of a blade (front: its edge at +b; back: at -a for a two-edged one) as a band wf(y) wide, laid a hair proud of its faces:
  // the bright bevel where it is sharpened, or the hardened edge of a sword of the east
  const edgeBand = (rows, wf, back) => loft(rows.map((r) => { const a = r[1], b = r[2], T = r[3], tb = r[4] || 0, rk = r[6] === undefined ? (tb ? 0.3 : 0.5) : r[6], zr = -a + (a + b) * rk, w = Math.min(typeof wf === 'function' ? wf(r[0]) : wf, (back ? a + zr : b - zr) * 0.9), h = T / 2 * w / Math.max(0.002, back ? zr + a : b - zr) + 0.00024, e = back ? a : b; return { c: [r[0], r[5] || 0], n: [0, back ? 1 : -1], a: -(e - w), b: e, T: h * 2, tb: h * 2, rk: 0.02 }; }), null);
  // hoarfrost: n small grains on the two faces (x = +-xr) between y0 and y1, thickest towards y0
  const rimeOn = (n, y0, y1, xr, z0, z1, sd) => { const o = []; for (let i = 0; i < n; i++) { const f = Math.abs(Math.sin(i * 12.9898 + sd) * 43758.5453) % 1, f2 = Math.abs(Math.sin(i * 78.233 + sd * 3) * 12345.678) % 1, y = y0 + (y1 - y0) * Math.pow(f, 1.7), z = z0 + (z1 - z0) * f2, sx = i % 2 ? 1 : -1, s = 0.0009 + 0.0017 * (1 - (y - y0) / (y1 - y0)) * (0.5 + f2), q = new THREE.IcosahedronGeometry(s, 0); q.scale(0.35, 1.4, 1.3); q.translate(sx * xr, y, z); o.push(q); } return o; };
  // copper wire wound round a bar of radius r about y, from y0 to y1, n turns
  const helixY = (r, y0, y1, n, wr) => { const pts = []; for (let i = 0; i <= n * 10; i++) { const t = i / (n * 10), a = t * n * Math.PI * 2; pts.push([Math.cos(a) * r, y0 + (y1 - y0) * t, Math.sin(a) * r]); } return tubeR(pts, wr, 4, false); };
  // a wheel pommel: a disc in the blade's plane (its axis across, x), at y, radius r, thickness t
  const wheel = (y, r, t) => hl([[0.0005, -t / 2], [r * 0.66, -t / 2], [r * 0.92, -t / 2 + t * 0.12], [r, -t * 0.15], [r, t * 0.15], [r * 0.92, t / 2 - t * 0.12], [r * 0.66, t / 2], [0.0005, t / 2]], 1, 1, 28).rotateZ(HX).translate(0, y, 0);
  // a cross-guard: a round bar along z at y, its quillons tapering and turned a little towards the blade, knobbed at their ends
  const quillons = (y, L, r, up) => [tubeR([[0, y + up, -L], [0, y + up * 0.3, -L * 0.6], [0, y, 0], [0, y + up * 0.3, L * 0.6], [0, y + up, L]], (t) => r * (0.72 + 0.28 * Math.sin(Math.PI * t)), 7, 20), ball(r * 1.25, [0, y + up, -L], [1, 1, 1.15]), ball(r * 1.25, [0, y + up, L], [1, 1, 1.15])];
  // the knife of ice: blued steel gone dark with cold, two edges ground bright, rime grown over its forte and its guard, splinters of
  // ice frozen to the guard; a guard and pommel of iron, the grip bound in hide
  MP.frostknife = () => {
    const rows = [[0.07, 0.016, 0.016, 0.0072], [0.115, 0.019, 0.019, 0.0078], [0.245, 0.0135, 0.0135, 0.0066]];
    return { tipY: 0.335, parts: [
      mpart('leather', hl(wrapPts(-0.055, 0.052, 0.0146, 10), 0.86, 1.12)),
      mpart('iron', [hl([[0.0005, -0.084], [0.011, -0.082], [0.0152, -0.072], [0.0118, -0.06], [0.0005, -0.057]]), ringY(-0.055, 0.0152, 0.0028), ringY(0.054, 0.0156, 0.003),
        side([[0.036, 0.06], [0.041, 0.065], [0.038, 0.072], [-0.038, 0.072], [-0.041, 0.065], [-0.036, 0.06], [-0.012, 0.057], [0.012, 0.057]], 0.02, 0.003)]),
      mpart('blued', straight(rows, [0.335, 0])),
      mpart('blade', [edgeBand(rows, 0.0042, false), edgeBand(rows, 0.0042, true)]),
      mpart('rime', rimeOn(70, 0.072, 0.16, 0.0034, -0.016, 0.016, 1).concat(rimeOn(20, 0.06, 0.074, 0.0105, -0.038, 0.038, 2), [spike(0.0024, 0.024, [0, 0.082, 0.03], [-0.35, 0, 0], 4), spike(0.0018, 0.018, [0, 0.08, -0.026], [0.4, 0, 0], 4), spike(0.0016, 0.014, [0.004, 0.077, 0.012], [-0.2, 0, 0.3], 4)])),
    ] };
  };
  // one of the twin fangs: a waved blade of plain steel, its fuller stained dark with what is put in it, fittings of bronze gone green,
  // the grip bound in black hide, a dark stone in the pommel
  MP.twin = () => {
    const wav = (t) => Math.sin(t * Math.PI * 3) * 0.006 * (1 - t), rows = [], core = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; rows.push([0.078 + t * 0.2, 0.019 - t * 0.008, 0.019 - t * 0.008, 0.0075 - t * 0.002, 0, wav(t)]); core.push([0.085 + t * 0.17, 0.0034, 0.0034, 0.0079 - t * 0.002, 0, wav(t * 0.85)]); }
    return { tipY: 0.31, parts: [
      mpart('leather', slimHilt()),
      mpart('verdigris', [ringY(-0.032, 0.0158, 0.003), ringY(0, 0.0152, 0.003), ringY(0.032, 0.0158, 0.003), rbx(0.024, 0.016, 0.04, 0.005, 0, 0.063, 0),
        side([[0.02, 0.066], [0.05, 0.088], [0.046, 0.094], [0.016, 0.078], [-0.016, 0.078], [-0.046, 0.094], [-0.05, 0.088], [-0.02, 0.066]], 0.016, 0.004)]),
      mpart('stain', [ball(0.0105, [0, -0.07, 0], [1, 1.25, 1]), ball(0.005, [0.0125, 0.064, 0], [0.6, 1, 1]), ball(0.005, [-0.0125, 0.064, 0], [0.6, 1, 1])]),
      mpart('blade', [straight(rows, [0.31, 0])]),
      mpart('stain', straight(core, [0.275, 0])),
    ] };
  };
  // the long swords of the east, by their rank. 'katana': a plain iron guard, a copper collar, black cord over the grip; 'ember' (the
  // blade of fire): the steel blued, bronzed and straw-coloured by heat towards its collar and sooted along its back, a guard of
  // blackened iron cut to a flame's edge, red cord; 'kusa' (the mythic one): a guard of iron pierced in four lobes and rimmed with gold,
  // mounts of old gold, a groove down the blade. Each its hardened edge, frosted, its line waving
  const sori = (y) => { const u = Math.max(0, (y - 0.14) / 0.69); return 0.052 * u * u; };
  const KAT = (() => { const rows = []; for (let i = 0; i <= 14; i++) { const y = 0.14 + 0.62 * i / 14; rows.push([y, 0.015, 0.019, 0.0068, 0.005, sori(y)]); } rows.push([0.795, 0.0115, 0.0145, 0.0054, 0.0036, sori(0.795)]); return rows; })();
  const katana = (k) => {
    const tip = [0.83, sori(0.83) + 0.009], men = [];
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) men.push(gemG(0.0035, 0.012, 0.0085, [sx * 0.0128, -0.092 + i * 0.04, 0]));
    const ham = (y) => 0.0055 + 0.0022 * Math.sin(y * 88) + 0.0011 * Math.sin(y * 233 + 1);
    let tsuba;
    if (k === 'katana') tsuba = [hl([[0.0005, 0.1], [0.035, 0.1], [0.0375, 0.1015], [0.0375, 0.1065], [0.035, 0.108], [0.0005, 0.108]], 0.86, 1.12, 26)];
    else if (k === 'ember') { const o = []; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r = 0.033 + 0.0045 * Math.pow(Math.abs(Math.sin(a * 3.5)), 0.6); o.push([Math.cos(a) * r * 0.86, Math.sin(a) * r * 1.12]); } tsuba = [ext(o, 0.007, 0.0012).rotateX(HX).translate(0, 0.104, 0)]; }
    else { const o = [], holes = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; o.push([Math.cos(a) * 0.0375 * 0.86, Math.sin(a) * 0.0375 * 1.12]); }
      for (let j = 0; j < 4; j++) { const a0 = j * HX + Math.PI / 4, h = []; for (let i = 0; i < 12; i++) { const t = i / 12 * Math.PI * 2, rr = 0.0058 * (1 + 0.35 * Math.cos(t)), cx = Math.cos(a0) * 0.024 * 0.86, cy = Math.sin(a0) * 0.024 * 1.12, aa = a0 + Math.cos(t) * 0.0; h.push([cx + Math.cos(t + a0) * rr * 1.3, cy + Math.sin(t + a0) * rr * 0.8]); } holes.push(h.reverse()); }
      tsuba = [ext(o, 0.0068, 0.0012, holes).rotateX(HX).translate(0, 0.104, 0)]; }
    const P = [
      mpart(k === 'ember' ? 'wrapRed' : 'wrap', hl(wrapPts(-0.118, 0.098, 0.0165, 12), 0.8, 1.18)),
      mpart(k === 'kusa' ? 'gold' : 'iron', [hl([[0.0005, -0.132], [0.015, -0.132], [0.0175, -0.124], [0.0175, -0.114], [0.0005, -0.114]], 0.8, 1.2), hl([[0.0005, 0.088], [0.0172, 0.088], [0.0178, 0.096], [0.0005, 0.0975]], 0.8, 1.2)]),
      mpart(k === 'kusa' ? 'gold' : 'dark', men),
      mpart('iron', tsuba),
      mpart(k === 'kusa' ? 'gold' : 'copper', [rbx(0.0125, 0.03, 0.036, 0.003, 0, 0.124, -0.001)].concat(k === 'kusa' ? [new THREE.TorusGeometry(0.0375, 0.0016, 4, 40).scale(0.86, 1.12, 1).rotateX(HX).translate(0, 0.104, 0), hl([[0.0005, 0.0985], [0.026, 0.0985], [0.026, 0.1002], [0.0005, 0.1002]], 0.86, 1.12, 20), hl([[0.0005, 0.1078], [0.026, 0.1078], [0.026, 0.1095], [0.0005, 0.1095]], 0.86, 1.12, 20)] : [])),
      mpart(k === 'ember' ? 'heat' : 'blade', straight(KAT, tip)),
      mpart('hamon', edgeBand(KAT, ham, false)),
    ];
    if (k === 'kusa') for (const sx of [-1, 1]) P.push(mpart('dark', strip(20, 1, (s) => { const y = 0.16 + s * 0.48; return [sx * 0.00305, y, sori(y) + 0.0092]; }, () => [0, 0, 1], (s) => 0.0021 * Math.min(1, s * 8, (1 - s) * 8), 40)));
    if (k === 'ember') { const bp = P[5], ps = bp.g.attributes.position, col = []; for (let i = 0; i < ps.count; i++) { const y = ps.getY(i) + bp.at[1], z = ps.getZ(i) + bp.at[2], t = (y - 0.13) / 0.66, back = Math.max(0, Math.min(1, (z - sori(y) + 0.004) / 0.019)), band = (c0, c1, k2) => [c0[0] + (c1[0] - c0[0]) * k2, c0[1] + (c1[1] - c0[1]) * k2, c0[2] + (c1[2] - c0[2]) * k2];
        const T = [[0, [0.86, 0.72, 0.42]], [0.07, [0.72, 0.46, 0.24]], [0.13, [0.46, 0.3, 0.44]], [0.2, [0.3, 0.38, 0.56]], [0.3, [0.62, 0.64, 0.66]], [1, [0.7, 0.71, 0.72]]]; let c = T[T.length - 1][1];
        for (let j = 1; j < T.length; j++) if (t <= T[j][0]) { c = band(T[j - 1][1], T[j][1], Math.max(0, (t - T[j - 1][0]) / (T[j][0] - T[j - 1][0]))); break; }
        const soot = 1 - 0.6 * back * (0.6 + 0.4 * Math.sin(y * 70 + z * 300)) * (t < 0.5 ? 1 : 0.5); col.push(c[0] * soot, c[1] * soot, c[2] * soot); }
      bp.g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); }
    return { tipY: 0.83, parts: P };
  };
  MP.katana = () => katana('katana'); MP.emberblade = () => katana('ember'); MP.kusanagi = () => katana('kusa');
  // the holy sword: a broad blade polished bright, a line of letters inlaid in gold down its middle and a cross at its forte; a plain
  // cross-guard with knobbed ends, a gold cross let into its middle; a grip of pale hide bound with gold wire; a wheel pommel, a cross on it
  MP.holy = () => {
    const rows = [[0.115, 0.024, 0.024, 0.0082], [0.2, 0.026, 0.026, 0.0082], [0.7, 0.022, 0.022, 0.0076], [0.79, 0.016, 0.016, 0.006]], inl = [];
    for (let i = 0; i < 16; i++) { const y = 0.25 + i * 0.022, h = 0.006 + (i * 7 % 5) * 0.0016, w = 0.0018 + (i * 3 % 4) * 0.0009; for (const sx of [-1, 1]) inl.push(rbx(0.0006, h, w, 0.0002, sx * 0.0041, y, ((i * 5) % 3 - 1) * 0.0014)); }
    for (const sx of [-1, 1]) inl.push(rbx(0.0006, 0.04, 0.0034, 0.0002, sx * 0.0041, 0.17, 0), rbx(0.0006, 0.0034, 0.022, 0.0002, sx * 0.0041, 0.18, 0), rbx(0.0007, 0.024, 0.0042, 0.0002, sx * 0.0128, 0.104, 0), rbx(0.0007, 0.0042, 0.018, 0.0002, sx * 0.0128, 0.106, 0), rbx(0.0008, 0.018, 0.0034, 0.0002, sx * 0.0092, -0.13, 0), rbx(0.0008, 0.0034, 0.018, 0.0002, sx * 0.0092, -0.13, 0));
    return { tipY: 0.88, parts: [
      mpart('leatherW', hl(wrapPts(-0.11, 0.092, 0.0152, 12), 0.86, 1.1)),
      mpart('gold', [helixY(0.0158, -0.105, 0.088, 9, 0.0011)].concat(inl)),
      mpart('steel', [wheel(-0.13, 0.026, 0.018), ringY(-0.112, 0.016, 0.003), ringY(0.094, 0.0162, 0.0032), rbx(0.024, 0.026, 0.034, 0.005, 0, 0.104, 0)].concat(quillons(0.104, 0.105, 0.0078, 0.012))),
      mpart('blade', straight(rows, [0.88, 0])),
    ] };
  };
  // the rapier: a thin stiff blade; a swept hilt of steel - quillons with knobbed ends, a bow over the knuckles, two rings about the
  // ricasso and the bars that sweep from them to the bow; a pommel and the ferrules of old gold, the grip bound in wire
  MP.rapier = () => {
    const bow = [], q = (t) => [0, -0.078 + 0.148 * t, -0.012 - 0.046 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.7)];
    for (let i = 0; i < 12; i++) bow.push(Geo.rod(q(i / 12), q((i + 1) / 12), 0.0032, 6));
    const rings = [], bars = [];
    for (const sx of [-1, 1]) { rings.push(new THREE.TorusGeometry(0.026, 0.0028, 5, 22).rotateY(HX).rotateX(0.0).translate(sx * 0.014, 0.084, 0)); bars.push(tubeR([[sx * 0.004, 0.058, -0.06], [sx * 0.03, 0.04, -0.05], [sx * 0.038, 0.02, -0.036], [sx * 0.01, -0.03, -0.052]], 0.0026, 5, 14), tubeR([[sx * 0.008, 0.06, 0.02], [sx * 0.034, 0.05, 0.03], [sx * 0.022, 0.07, 0.024]], 0.0024, 5, 10)); }
    return { tipY: 0.89, parts: [
      mpart('dark', hl(wrapPts(-0.07, 0.05, 0.0135, 14), 0.9, 1.08)),
      mpart('goldBr', [hl([[0.0005, -0.104], [0.011, -0.1], [0.0155, -0.088], [0.012, -0.074], [0.0005, -0.07]]), ringY(-0.069, 0.0138, 0.0026), ringY(0.05, 0.0138, 0.0026)]),
      mpart('steel', [tubeR([[0, 0.058, -0.088], [0, 0.058, 0], [0, 0.058, 0.088]], (t) => 0.0044 * (0.7 + 0.3 * Math.sin(Math.PI * t)), 6, false), ball(0.0068, [0, 0.058, -0.09]), ball(0.0068, [0, 0.058, 0.09]), rbx(0.012, 0.022, 0.018, 0.004, 0, 0.06, 0)].concat(bow, rings, bars)),
      mpart('steel', rbx(0.009, 0.08, 0.012, 0.002, 0, 0.14, 0)),
      mpart('blade', straight([[0.09, 0.009, 0.009, 0.0068], [0.3, 0.0075, 0.0075, 0.006], [0.8, 0.004, 0.004, 0.004]], [0.89, 0])),
    ] };
  };
  // the kukri: the blade leans back from the grip, then breaks forward and swells
  MP.kukri = () => ({ tipY: 0.39, parts: [
    mpart('wood', hl([[0.0005, -0.062], [0.0185, -0.062], [0.0175, -0.05], [0.0155, -0.02], [0.0165, 0.02], [0.0155, 0.056], [0.0005, 0.056]], 0.84, 1.16)),
    mpart('gold', [rbx(0.024, 0.008, 0.04, 0.003, 0, -0.066, 0), hl([[0.0005, 0.054], [0.0175, 0.054], [0.0185, 0.062], [0.0165, 0.072], [0.0005, 0.072]], 0.8, 1.3)]),
    mpart('blade', straight([[0.072, 0.016, 0.02, 0.0068, 0.0048, 0.004], [0.13, 0.016, 0.022, 0.0068, 0.0048, 0.008], [0.19, 0.017, 0.027, 0.0066, 0.0046, 0.008], [0.25, 0.018, 0.036, 0.0064, 0.0044, 0], [0.305, 0.016, 0.036, 0.006, 0.004, -0.012], [0.35, 0.011, 0.026, 0.005, 0.003, -0.024]], [0.39, -0.034])),
  ] });
  // the machete: a thin blade ground flat from near its spine to the edge, widening to a heavy end; the flats of plain steel, the edge
  // bevel bright where it has been sharpened; a bolster at its root; a grip of two wooden scales on the tang, three rivets through them
  const MACH = [[0.074, 0.017, 0.022, 0.0034, 0.003], [0.09, 0.017, 0.024, 0.0033, 0.0029], [0.2, 0.017, 0.028, 0.0032, 0.0028], [0.32, 0.017, 0.034, 0.0031, 0.0027], [0.42, 0.0165, 0.039, 0.003, 0.0026], [0.47, 0.011, 0.04, 0.0028, 0.0022], [0.5, -0.002, 0.035, 0.0024, 0.0016]];
  const machEdge = (w) => MACH.map(([y, a, b, T]) => { const dr = -a + (a + b) * 0.1, d1 = b - w, h = T / 2 * w / (b - dr) + 0.00022; return [y, -d1, b, h * 2, h * 2, 0, 0.02]; });
  MP.machete = () => ({ tipY: 0.52, parts: [
    mpart('wood', hl([[0.0005, -0.068], [0.0168, -0.068], [0.019, -0.06], [0.0172, -0.045], [0.0158, -0.02], [0.0166, 0.01], [0.0158, 0.04], [0.0165, 0.058], [0.0005, 0.06]], 0.68, 1.22)),
    mpart('steel', [rbx(0.0034, 0.124, 0.0428, 0.0008, 0, -0.004, 0), rbx(0.0072, 0.014, 0.046, 0.0022, 0, 0.066, 0.0015)].concat([-0.046, -0.012, 0.024].map((y) => prism(0.0029, 0.0236, [0, y, 0], [0, 0, HX], 8)))),
    mpart('steel', straight(MACH.map((r) => r.concat([0, 0.1])), [0.522, -0.024])),
    mpart('blade', straight(machEdge(0.0065), [0.522, -0.024])),
  ] });
  // the axe: a head forged to a flared bit, a spike behind and one on top, bands on the haft
  MP.axe = () => {
    const bit = []; for (let i = 0; i <= 10; i++) { const t = i / 10; bit.push([0.3 + 0.23 * t, 0.008, 0.012 + 0.036 * Math.pow(Math.sin(Math.PI * t), 0.75), 0.016, 0.016, -0.1, 0.06]); }
    return { tipY: 0.56, parts: [
      mpart('wood', hl([[0.0005, -0.13], [0.02, -0.13], [0.0185, -0.1], [0.017, 0.1], [0.018, 0.3], [0.0195, 0.49], [0.0005, 0.49]], 0.85, 1.15)),
      mpart('steel', [ringY(-0.1, 0.0192, 0.004), ringY(0.1, 0.0178, 0.004), hl([[0.0005, 0.33], [0.021, 0.33], [0.0225, 0.345], [0.021, 0.36], [0.0005, 0.36]], 0.85, 1.15), hl([[0.0005, 0.47], [0.022, 0.47], [0.0235, 0.482], [0.02, 0.496], [0.0005, 0.498]], 0.85, 1.15)]),
      mpart('dark', side([[-0.032, 0.385], [-0.032, 0.455], [0.02, 0.458], [0.055, 0.468], [0.106, 0.527], [0.106, 0.303], [0.055, 0.372], [0.02, 0.382]], 0.03, 0.007)),
      mpart('blade', [straight(bit), spike(0.014, 0.075, [0, 0.42, 0.066], [HX, 0, 0], 4), spike(0.011, 0.065, [0, 0.528, 0], null, 4)]),
    ] };
  };
  // the arming sword that goes with the buckler: a wound grip, a wheel pommel, a cross of round bars turned towards the blade with
  // knobbed ends, a blade with a fuller
  MP.buckler = () => ({ tipY: 0.51, parts: [
    mpart('wrap', hl(wrapPts(-0.058, 0.058, 0.016, 8), 0.84, 1.14)),
    mpart('steel', [wheel(-0.076, 0.021, 0.016), ringY(-0.06, 0.0152, 0.0026), ringY(0.058, 0.0156, 0.0028), rbx(0.02, 0.022, 0.028, 0.005, 0, 0.068, 0)].concat(quillons(0.068, 0.082, 0.0062, 0.008))),
    mpart('blade', straight([[0.08, 0.022, 0.022, 0.0075], [0.36, 0.019, 0.019, 0.0068], [0.44, 0.014, 0.014, 0.0055]], [0.51, 0])),
    mpart('dark', straight([[0.09, 0.0028, 0.0028, 0.00762], [0.36, 0.002, 0.002, 0.0069]], [0.4, 0])),
  ] });
  // a hammer's head, forged: eight-sided along its length, chamfered, drawn in to a neck before the face; the face a little domed and
  // scored across to bite; iron straps down the haft riveted through it; a beak behind (or a second face), a spike on its crown
  const maulHead = (yh, w, d, beak) => {
    const r = w * 0.5, prof = [[0.0005, -d / 2 - 0.004], [r * 0.82, -d / 2], [r * 0.96, -d / 2 + 0.004], [r * 0.96, -d / 2 + 0.016], [r * 0.78, -d / 2 + 0.03], [r * 0.78, -d * 0.2], [r * 1.06, -d * 0.12], [r * 1.06, d * 0.1]];
    if (beak) prof.push([r * 0.8, d * 0.2], [r * 0.32, d * 0.3], [0.0005, d * 0.31]); else prof.push([r * 0.78, d * 0.2], [r * 0.78, d / 2 - 0.03], [r * 0.96, d / 2 - 0.016], [r * 0.96, d / 2 - 0.004], [r * 0.82, d / 2], [0.0005, d / 2 + 0.004]);
    const body = Geo.lathe(prof, 8); body.rotateY(Math.PI / 8); body.rotateX(HX); body.translate(0, yh, 0); body.computeVertexNormals();
    const score = []; for (const f of beak ? [-1] : [-1, 1]) for (let i = -1; i <= 1; i++) { score.push(rbx(r * 1.5, 0.0016, 0.0016, 0.0005, 0, yh + i * r * 0.42, f * (d / 2 + 0.0036)), rbx(0.0016, r * 1.5, 0.0016, 0.0005, i * r * 0.42, yh, f * (d / 2 + 0.0036))); }
    const ext2 = beak ? [tubeR([[0, yh, d * 0.26], [0, yh - 0.004, d * 0.42], [0, yh - 0.022, d * 0.58]], (t) => r * 0.42 * (1 - t) + 0.0012, 8, 12)] : [];
    return { body: [body].concat(ext2), score };
  };
  const maul = (yh, w, d, haft0, haft1, bands, top) => {
    const h = maulHead(yh, w, d, top), lg = [], rv = [];
    for (const sx of [-1, 1]) { lg.push(rbx(0.005, 0.13, 0.02, 0.0018, sx * 0.0215, yh - w * 0.5 - 0.06, 0)); for (const y of [yh - w * 0.5 - 0.02, yh - w * 0.5 - 0.1]) rv.push(ball(0.0034, [sx * 0.0245, y, 0], [0.6, 1, 1])); }
    return [
      mpart('wood', hl([[0.0005, haft0], [0.021, haft0], [0.0195, haft0 + 0.03], [0.0185, (haft0 + haft1) / 2], [0.0205, haft1], [0.0005, haft1]], 0.88, 1.12)),
      mpart('steel', bands.map((y) => ringY(y, 0.0205, 0.0045)).concat(lg, rv, top ? [spike(0.016, 0.055, [0, yh + w * 0.5 + 0.024, 0], null, 8)] : [])),
      mpart('iron', h.body),
      mpart('dark', h.score),
    ];
  };
  MP.tower = () => ({ tipY: 0.33, parts: maul(0.27, 0.07, 0.14, -0.09, 0.26, [-0.06, 0.12], false) });
  MP.hammer = () => ({ tipY: 0.58, parts: maul(0.49, 0.088, 0.18, -0.11, 0.5, [-0.09, 0.12, 0.38], true) });
  // the hammer of thunder: a great forged head of iron bound with three bands of copper driven full of studs, its faces steel in rims of
  // copper; a rod of copper on its crown wound with wire to take the lightning; the haft wound with copper wire where it is held and
  // below the head, iron straps riveted with copper
  MP.thunder = () => {
    const h = maulHead(0.5, 0.112, 0.225, false), bands = [], studs = [], lg = [];
    for (const z of [-0.06, 0, 0.06]) { const b = Geo.lathe([[0.066, -0.009], [0.0675, -0.006], [0.0675, 0.006], [0.066, 0.009]], 8); b.rotateY(Math.PI / 8); b.rotateX(HX); b.translate(0, 0.5, z); bands.push(b); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; studs.push(ball(0.0042, [Math.cos(a) * 0.066, 0.5 + Math.sin(a) * 0.066, z], [1, 1, 0.7])); } }
    for (const f of [-1, 1]) bands.push(new THREE.TorusGeometry(0.047, 0.004, 5, 24).translate(0, 0.5, f * 0.1065));
    for (const sx of [-1, 1]) { lg.push(rbx(0.005, 0.15, 0.022, 0.0018, sx * 0.0232, 0.37, 0)); for (const y of [0.42, 0.34]) studs.push(ball(0.0036, [sx * 0.0262, y, 0], [0.6, 1, 1])); }
    return { tipY: 0.62, parts: [
      mpart('wood', hl([[0.0005, -0.13], [0.021, -0.13], [0.02, 0.1], [0.021, 0.44], [0.0005, 0.44]], 0.9, 1.1)),
      mpart('copper', [helixY(0.0212, -0.1, 0.12, 14, 0.0014), helixY(0.0212, 0.24, 0.36, 8, 0.0014), prism(0.0042, 0.07, [0, 0.59, 0], null, 8), helixY(0.0056, 0.565, 0.61, 6, 0.0009), ringY(-0.12, 0.022, 0.004)].concat(bands, studs)),
      mpart('iron', h.body.concat(lg, [hl([[0.0005, -0.152], [0.018, -0.15], [0.024, -0.14], [0.022, -0.128], [0.0005, -0.126]])])),
      mpart('steel', spike(0.004, 0.012, [0, 0.631, 0], null, 6)),
      mpart('dark', h.score),
    ] };
  };
  // the spear: a leaf of a head with a rib, a socket of iron riveted to the shaft, bands of iron, a shoe
  MP.spear = () => ({ tipY: 1.25, parts: [
    mpart('wood', hl([[0.0005, -0.36], [0.0165, -0.36], [0.017, 0.3], [0.0155, 0.95], [0.0005, 0.95]], 1, 1, 12)),
    mpart('iron', [ringY(-0.2, 0.0175, 0.0038), ringY(0.25, 0.0175, 0.0038), ringY(0.65, 0.0168, 0.0038), ringY(0.9, 0.0162, 0.0038), hl([[0.0005, 0.93], [0.0185, 0.93], [0.0205, 0.95], [0.016, 0.99], [0.011, 1.003], [0.0005, 1.003]], 0.9, 1.1, 10),
      prism(0.0028, 0.044, [0, 0.948, 0], [0, 0, HX], 6), spike(0.0155, 0.075, [0, -0.397, 0], [Math.PI, 0, 0], 8)]),
    mpart('steel', straight([[1.0, 0.004, 0.004, 0.0128], [1.14, 0.0028, 0.0028, 0.0108]], [1.18, 0])),
    mpart('blade', straight([[0.995, 0.008, 0.008, 0.009], [1.05, 0.023, 0.023, 0.0105], [1.12, 0.02, 0.02, 0.009], [1.2, 0.01, 0.01, 0.006]], [1.25, 0])),
  ] });
  // the spear of the abyss: the same reach, finer work - a long head with a strong rib, its forte blued and a line of gold inlaid down the
  // rib on each face, two wings below it; a long faceted socket with collars inlaid in gold and straps riveted down the shaft; the shaft
  // stained black, bound in hide where it is held, iron bands each with a thread of gold; a shoe of iron
  MP.abyss = () => {
    const rows = [[0.992, 0.006, 0.006, 0.0105], [1.04, 0.026, 0.026, 0.0122], [1.11, 0.023, 0.023, 0.011], [1.19, 0.011, 0.011, 0.0072]], inl = [], lg = [], rv = [];
    for (const sx of [-1, 1]) { inl.push(strip(10, 1, (s) => [sx * (0.0063 - s * 0.0024), 1.02 + s * 0.16, 0], () => [0, 0, 1], () => 0.0007, 40)); lg.push(rbx(0.0045, 0.1, 0.012, 0.0015, sx * 0.0178, 0.885, 0)); rv.push(ball(0.0026, [sx * 0.0204, 0.86, 0], [0.6, 1, 1]), ball(0.0026, [sx * 0.0204, 0.91, 0], [0.6, 1, 1])); }
    const wings = side([[0.004, 0.962], [0.044, 0.975], [0.05, 0.986], [0.03, 0.984], [0.004, 0.978], [-0.004, 0.978], [-0.03, 0.984], [-0.05, 0.986], [-0.044, 0.975], [-0.004, 0.962]], 0.007, 0.0016);
    return { tipY: 1.25, parts: [
      mpart('darkWood', hl([[0.0005, -0.36], [0.0165, -0.36], [0.017, 0.3], [0.0155, 0.95], [0.0005, 0.95]], 1, 1, 12)),
      mpart('leather', [hl(wrapPts(-0.1, 0.14, 0.0182, 10), 1, 1, 12), hl(wrapPts(0.36, 0.52, 0.018, 7), 1, 1, 12)]),
      mpart('iron', [ringY(-0.2, 0.0178, 0.004), ringY(0.25, 0.0178, 0.004), ringY(0.65, 0.017, 0.004), hl([[0.0005, 0.84], [0.0185, 0.84], [0.0195, 0.85], [0.0175, 0.93], [0.0215, 0.94], [0.0215, 0.955], [0.017, 0.975], [0.011, 0.995], [0.0005, 0.995]], 1, 1, 8), wings, spike(0.016, 0.085, [0, -0.402, 0], [Math.PI, 0, 0], 8)].concat(lg)),
      mpart('gold', [ringY(-0.2, 0.0182, 0.0012), ringY(0.25, 0.0182, 0.0012), ringY(0.65, 0.0174, 0.0012), ringY(0.932, 0.0215, 0.0014), ringY(0.86, 0.0198, 0.0012), ringY(-0.355, 0.0168, 0.0016)].concat(inl, rv)),
      mpart('blued', straight([[0.992, 0.0062, 0.0062, 0.0108], [1.03, 0.022, 0.022, 0.0124]], null)),
      mpart('blade', straight(rows, [1.25, 0])),
    ] };
  };
  // a scythe's blade along its curve: the same turns the old one took, the back outward, the edge inward
  const crescent = (n, w0, dw, step, r0, dr, y0, z0, mk) => {
    const pts = []; let cy = y0, cz = z0; pts.push([cy, cz, r0]);
    for (let i = 0; i < n; i++) { const rx = r0 - i * dr; cy += Math.sin(rx) * step; cz -= Math.cos(rx) * step; pts.push([cy, cz, r0 - (i + 0.5) * dr]); }
    const secs = pts.map((p, i) => mk(p, i / n, Math.max(0.02, w0 - i * dw))), last = pts[n], rl = r0 - n * dr;
    return { secs, tip: [last[0] + Math.sin(rl) * 0.07 - Math.cos(rl) * 0.012, last[1] - Math.cos(rl) * 0.07 - Math.sin(rl) * 0.012] };
  };
  const cres = (n, w0, dw, step, r0, dr, y0, z0, f) => { const c = crescent(n, w0, dw, step, r0, dr, y0, z0, (p, t, w) => Object.assign({ c: [p[0], p[1]], n: [-Math.cos(p[2]), -Math.sin(p[2])] }, f(t, w))); return loft(c.secs, f.noTip ? null : c.tip); };
  MP.scythe = () => {
    const Y = 0.88, bl = (t, w) => ({ a: w * 0.42, b: w * 0.5, T: 0.011 - t * 0.005, tb: 0.008 - t * 0.004 }), bk = (t, w) => ({ a: w * 0.44, b: -w * 0.12, T: 0.0145 - t * 0.006, tb: 0.011 - t * 0.005, rk: 0.5 });
    return { tipY: 0.92, parts: [
      mpart('dark', hl([[0.0005, -0.255], [0.0185, -0.255], [0.0175, 0.3], [0.0185, 0.895], [0.0005, 0.895]], 1, 1, 12)),
      mpart('bone', [ringY(-0.15, 0.0195, 0.005), ringY(0.15, 0.019, 0.005), ringY(0.45, 0.019, 0.005), ringY(0.72, 0.0192, 0.005), rbx(0.04, 0.066, 0.092, 0.012, 0, Y, 0.01), spike(0.016, 0.09, [0, Y + 0.012, 0.095], [HX + 0.15, 0, 0], 5)]),
      mpart('iron', [ball(0.0055, [0.0205, Y + 0.005, -0.01], [0.55, 1, 1]), ball(0.0055, [-0.0205, Y + 0.005, -0.01], [0.55, 1, 1])]),
      mpart('blade', cres(5, 0.076, 0.009, 0.11, -0.06, 0.12, Y + 0.015, -0.02, bl)),
      mpart('dark', cres(5, 0.076, 0.009, 0.11, -0.06, 0.12, Y + 0.015, -0.02, bk)),
    ] };
  };
  // the devourer: a war scythe of blackened steel, its edge honed bright, its back and the bands of its black snath inlaid with old gold,
  // a collar of iron with its horns and hook, a dark stone set in it and in the butt
  MP.devour = () => {
    const Y = 0.88, bl = (t, w) => ({ a: w * 0.4, b: w * 0.52, T: 0.011 - t * 0.004, tb: 0.008 - t * 0.003 }), bk = (t, w) => ({ a: w * 0.44, b: -w * 0.1, T: 0.016 - t * 0.006, tb: 0.012 - t * 0.005, rk: 0.5 }), mid = (t, w) => ({ a: w * 0.12, b: w * 0.08, T: 0.0135 - t * 0.005, tb: 0 });
    const halo = new THREE.TorusGeometry(0.058, 0.007, 8, 24); halo.rotateY(HX); halo.translate(0, Y + 0.01, -0.02);
    return { tipY: 0.95, parts: [
      mpart('blackSteel', [hl([[0.0005, -0.27], [0.0195, -0.27], [0.0185, 0.3], [0.0195, 0.91], [0.0005, 0.91]], 1, 1, 12), rbx(0.046, 0.085, 0.11, 0.012, 0, Y, 0.01), cres(6, 0.088, 0.010, 0.105, -0.06, 0.115, Y + 0.02, -0.02, mid)]),
      mpart('gold', [0, 1, 2, 3, 4, 5].map((i) => ringY(-0.14 + i * 0.2, 0.0205, 0.0052)).concat([rbx(0.054, 0.03, 0.13, 0.006, 0, Y + 0.032, 0.01), rbx(0.054, 0.024, 0.11, 0.006, 0, Y - 0.032, 0.01), ])),
      mpart('blackSteel', cres(6, 0.088, 0.010, 0.105, -0.06, 0.115, Y + 0.02, -0.02, bk)),
      mpart('iron', [halo, spike(0.022, 0.11, [0, Y + 0.02, 0.11], [HX + 0.25, 0, 0], 5), spike(0.02, 0.08, [0, Y + 0.085, 0.01], null, 5), spike(0.013, 0.09, [0, Y - 0.055, -0.18], [-2.4, 0, 0], 5)]),
      mpart('dark', [gemG(0.022, 0.042, 0.022, [0, -0.29, 0]), gemG(0.03, 0.03, 0.03, [0, Y + 0.01, -0.02])]),
      mpart('blade', [cres(6, 0.088, 0.010, 0.105, -0.06, 0.115, Y + 0.02, -0.02, bl), spike(0.016, 0.08, [0, Y - 0.02, 0.09], [HX - 0.25, 0, 0], 5)]),
    ] };
  };
  // the gauntlet of the gold-maker, over the right fist of gfx.js (its back to +x, its fingers curled round to -z, the wrist down to +z):
  // steel plates gilt and worn - a flared cuff with a rolled rim, three lames over the back of the hand, a ridged knuckle plate with a
  // boss on each knuckle, three lames over the fingers, two over the thumb - riveted, an engraved line along each lame; the left is its
  // mirror (melee.js)
  MP.midas = () => {
    const lame = (cx, cy, cz, nx, nz, len, wid, th) => { const a = Math.atan2(-nz, nx); return rbx(th, len, wid, Math.min(th, wid) * 0.45, cx, cy, cz, [0, a, 0]); };
    const gilt = [], dk = [], rv = [];
    // the cuff, along the wrist from the back of the hand towards the elbow
    const wr = new THREE.Vector3(0.046, -0.066, 0.08), dr = new THREE.Vector3(0.016, -0.036, 0.052).normalize();
    const cuff = hl([[0.033, -0.012], [0.0352, -0.006], [0.0372, 0.024], [0.0405, 0.05], [0.0425, 0.056], [0.0418, 0.061], [0.0395, 0.06]], 1, 0.86, 22), rim = new THREE.TorusGeometry(0.0415, 0.0024, 5, 24).scale(1, 0.86, 1).rotateX(HX).translate(0, 0.0585, 0);
    for (const g of [cuff, rim]) { g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dr)); g.translate(wr.x - dr.x * 0.012, wr.y - dr.y * 0.012, wr.z - dr.z * 0.012); }
    gilt.push(cuff); dk.push(rim);
    // the back of the hand: three lames overlapping towards the knuckles
    for (let i = 0; i < 3; i++) { const z = 0.042 - i * 0.017; gilt.push(lame(0.049 - i * 0.0012, -0.004 - i * 0.002, z, 1, 0.12, 0.084 - i * 0.004, 0.02, 0.0042)); dk.push(lame(0.0514 - i * 0.0012, -0.004 - i * 0.002, z, 1, 0.12, 0.07, 0.0012, 0.0012)); for (const y of [-0.036, 0.034]) rv.push(ball(0.0024, [0.0515 - i * 0.0012, y - i * 0.002, z], [0.6, 1, 1])); }
    // the knuckle plate, ridged, a boss over each knuckle
    gilt.push(lame(0.041, 0.0, -0.016, 0.72, -0.69, 0.092, 0.018, 0.0052));
    for (const y of [0.031, 0.01, -0.011, -0.031]) gilt.push(ball(0.0074, [0.044, y, -0.02], [0.75, 0.95, 0.75]));
    // the fingers: a lame over each joint's back, round the curl
    for (const [x, z, nx, nz, w] of [[0.031, -0.034, 0.62, -0.78, 0.014], [0.006, -0.046, 0.08, -1, 0.012], [-0.019, -0.04, -0.62, -0.78, 0.011]]) { gilt.push(lame(x, 0.0, z, nx, nz, 0.088, w, 0.0042)); dk.push(lame(x + nx * 0.0023, 0.0, z + nz * 0.0023, nx, nz, 0.074, 0.0011, 0.0011)); }
    // the thumb: two lames along it
    gilt.push(rbx(0.015, 0.024, 0.0045, 0.002, 0.004, 0.051, 0.029, [0, -0.5, 0.35]), rbx(0.013, 0.022, 0.0042, 0.002, -0.016, 0.058, 0.014, [0, -1.1, 0.3]));
    return { tipY: 0.0, parts: [mpart('gilt', gilt), mpart('giltDk', dk.concat(rv))] };
  };
  const mCache = {};
  X.meleeParts = function (model) { if (mCache[model] !== undefined) return mCache[model]; let r = null; try { r = MP[model] ? MP[model]() : null; } catch (e) { console.warn('gfx: no hand weapon', model, e); r = null; } return (mCache[model] = r); };

  // the shield on the left arm, in the measure melee.js builds it in (its face looks to -z)
  const SH = {};
  SH.buckler = () => {
    const turn = (g) => { g.rotateX(-HX); return g; }, rv = [], bars = [];
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; rv.push(ball(0.0095, [Math.cos(a) * 0.172, Math.sin(a) * 0.172, -0.017])); }
    for (let i = 0; i < 4; i++) { const a = i * HX + Math.PI / 4; bars.push(rbx(0.018, 0.12, 0.008, 0.003, Math.cos(a) * 0.118, Math.sin(a) * 0.118, -0.021, [0, 0, a + HX])); }
    const rim = new THREE.TorusGeometry(0.196, 0.0125, 8, 36); rim.translate(0, 0, -0.004);
    return { parts: [
      mpart('face', turn(hl([[0.0005, -0.009], [0.19, -0.009], [0.2, 0.0], [0.188, 0.009], [0.14, 0.02], [0.07, 0.028], [0.0005, 0.03]], 1, 1, 36))),
      mpart('steel', [rim, turn(hl([[0.0005, 0.022], [0.067, 0.022], [0.067, 0.028], [0.058, 0.03], [0.05, 0.047], [0.03, 0.066], [0.0005, 0.072]], 1, 1, 24))].concat(rv)),
      mpart('gold', bars),
    ] };
  };
  SH.tower = () => {
    // a tall plate bent round the arm: its outline seen from above, pushed up to its height
    const Rr = 0.5, A = 0.37, arc = (r0, r1, a, len, y, zf) => { const p = []; const n = 28; for (let i = 0; i <= n; i++) { const t = -a + 2 * a * i / n; p.push([Math.sin(t) * r1, Rr - Math.cos(t) * r1]); } for (let i = n; i >= 0; i--) { const t = -a + 2 * a * i / n; p.push([Math.sin(t) * r0, Rr - Math.cos(t) * r0]); } const g = ext(p, len, 0.003); g.rotateX(HX); g.translate(0, y, zf || 0); return g; };
    const rv = []; for (const x of [-0.15, 0.15]) for (const y of [-0.24, 0, 0.24]) rv.push(ball(0.013, [x, y, 0.004]));
    return { parts: [
      mpart('face', arc(Rr - 0.011, Rr + 0.011, A, 0.56, 0)),
      mpart('dark', [arc(Rr - 0.016, Rr + 0.018, A * 1.03, 0.03, 0.27), arc(Rr - 0.016, Rr + 0.018, A * 1.03, 0.03, -0.27), rbx(0.03, 0.58, 0.04, 0.008, -0.178, 0, 0.028, [0, 0.36, 0]), rbx(0.03, 0.58, 0.04, 0.008, 0.178, 0, 0.028, [0, -0.36, 0])]),
      mpart('steel', [rbx(0.05, 0.5, 0.012, 0.004, 0, 0, -0.014), arc(Rr + 0.009, Rr + 0.02, A * 0.86, 0.05, 0.07)].concat(rv)),
      mpart('gold', prism(0.05, 0.03, [0, 0.07, -0.034], [HX, 0, 0], 8)),
    ] };
  };
  const sCache = {};
  X.shieldParts = function (kind) { if (sCache[kind] !== undefined) return sCache[kind]; let r = null; try { r = SH[kind] ? SH[kind]() : null; } catch (e) { console.warn('gfx: no shield', kind, e); r = null; } return (sCache[kind] = r); };
  // ---- the rest of the guns (weapons.js), as lists of parts { g, at, m, role }: role says what a part is to the gun - 'bolt' / 'mag' (what
  // moves at a shot, what comes away at a reload), 'onbolt' / 'onmag' (rides on that), 'spin' (the turning cluster), 'extra'. In the
  // gun's own measure: forward is -z, a point f forward of the origin lies at z = -f ----
  const gpart = (m, list, role, o) => { const g = boxUV(Geo.merge(Array.isArray(list) ? list : [list]), 5); g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3()); g.translate(-c.x, -c.y, -c.z); return Object.assign({ g, at: [c.x, c.y, c.z], m, role: role || '' }, o || {}); };
  const tubeZ = (pts, y, x, seg) => { const g = lathe(pts, seg || 18); g.translate(x || 0, y || 0, 0); return g; };   // turned about the bore: [radius, forward]
  const rodG = (a, b, r, seg) => Geo.rod(a, b, r, seg || 8);
  const bandZ = (r, f0, f1, y, t) => tubeZ([[r, f0], [r + (t || 0.008), f0 + 0.005], [r + (t || 0.008), f1 - 0.005], [r, f1]], y);
  const flower = (r, d, n) => { const p = []; for (let i = 0; i < 48; i++) { const a = i / 48 * TAU, rr = r + d * Math.cos(a * (n || 6)); p.push([Math.cos(a) * rr, Math.sin(a) * rr]); } return p; };
  // the grip and the stock with a window through it that most of them share: the grip about z = gz, the stock from s0 back to s1
  const gripG = (gz, top, bot, w) => side([[-gz + 0.028, top], [-gz + 0.008, bot + 0.004], [-gz - 0.028, bot], [-gz - 0.034, (top + bot) / 2 + 0.01], [-gz - 0.022, top]], w || 0.034, 0.009, null, 0, 2);
  const stockG = (s0, s1, yt, yb) => side([[-s0, yt], [-s0, yb + 0.012], [-(s0 + s1) / 2, yb + 0.004], [-s1 + 0.012, yb - 0.006], [-s1, yb], [-s1, yt - 0.008], [-(s0 + s1) / 2, yt + 0.002]], 0.04, 0.006,
    [[[-s0 - 0.045, yt - 0.024], [-s0 - 0.045, yb + 0.032], [-s1 + 0.045, yb + 0.024], [-s1 + 0.045, yt - 0.028]]], 0, 2);
  const GN = {};

  // the rotary gun: six barrels in three clamps on a shaft (they turn), a ribbed housing, a carrying bar on two posts, a grip under
  // the motor box, the box of the belt and its chute
  GN.minigun = () => {
    const br = [], cl = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, x = Math.cos(a) * 0.035, y = Math.sin(a) * 0.035; br.push(rodG([x, y, 0.175], [x, y, -0.375], 0.0105, 10), rodG([x, y, -0.362], [x, y, -0.39], 0.0128, 10)); }
    for (const f of [0.32, 0.1, -0.1]) cl.push(sec(flower(0.05, 0.0055), f - 0.012, f + 0.012, 0.003));
    cl.push(rodG([0, 0, 0.17], [0, 0, -0.33], 0.012, 10));
    return { parts: [
      gpart('steel', br, 'spin'), gpart('metal', cl, 'spin'),
      gpart('metal', [tubeZ([[0.0005, -0.24], [0.058, -0.24], [0.07, -0.225], [0.07, -0.16], [0.066, -0.155], [0.066, -0.145], [0.07, -0.14], [0.07, -0.03], [0.064, 0], [0.06, 0.002], [0.06, 0.19], [0.066, 0.2], [0.066, 0.215], [0.05, 0.22], [0.0005, 0.22]], 0, 0, 24),
        rodG([0, 0.06, -0.015], [0, 0.172, -0.015], 0.008), rodG([0, 0.06, 0.115], [0, 0.172, 0.115], 0.008), rb(0.03, 0.075, 0.05, 0.008, 0.07, -0.035, -0.21, [0, 0, -0.5])]),
      gpart('poly', [rb(0.13, 0.1, 0.17, 0.02, 0, 0.03, -0.28), gripG(0.3, -0.02, -0.118, 0.036), rodG([0, 0.17, -0.03], [0, 0.17, 0.13], 0.0125, 10)]),
      gpart('metal', [Geo.xf(X.makeRbox(0.12, 0.14, 0.12, 0.012, 1), [0.1, -0.12, 0.25]), Geo.xf(X.makeRbox(0.124, 0.014, 0.124, 0.005, 1), [0.1, -0.054, 0.25])], 'mag'),
    ] };
  };
  // the crossbow: a stock in one piece, a steel prod bent back to its nocks, the string drawn to the nut, a stirrup, the bolt with its
  // head and three vanes (the bolt is what goes at a shot)
  GN.crossbow = () => {
    const bow = [], N = 16, zc = (x) => -0.385 + 0.09 * Math.pow(Math.abs(x) / 0.3, 2), th = (x) => 0.017 - 0.009 * Math.abs(x) / 0.3;
    for (let i = 0; i <= N; i++) { const x = -0.3 + 0.6 * i / N; bow.push([x, zc(x) - th(x)]); } for (let i = N; i >= 0; i--) { const x = -0.3 + 0.6 * i / N; bow.push([x, zc(x) + th(x)]); }
    const prod = ext(bow, 0.02, 0.004); prod.rotateX(HX); prod.translate(0, 0.02, 0);
    const st = new THREE.TorusGeometry(0.034, 0.0042, 6, 18); st.rotateX(HX); st.translate(0, 0, -0.43);
    const fl = []; for (let i = 0; i < 3; i++) { const g0 = Geo.xf(X.makeRbox(0.0012, 0.02, 0.06, 0.0004, 1), [0, 0.011, 0]); g0.rotateZ(i * TAU / 3); g0.translate(0, 0.045, 0.02); fl.push(g0); }
    return { parts: [
      gpart('wood', side([[0.4, 0.022], [0.4, -0.008], [0.36, -0.026], [0.0, -0.03], [-0.04, -0.035], [-0.062, -0.112], [-0.098, -0.116], [-0.105, -0.05], [-0.16, -0.045], [-0.36, -0.06], [-0.38, -0.055], [-0.38, 0.03], [-0.2, 0.03], [-0.16, 0.022]], 0.04, 0.008, null, 0, 2)),
      gpart('metal', [prod, ball(0.008, [-0.3, 0.02, -0.295]), ball(0.008, [0.3, 0.02, -0.295]), rb(0.05, 0.03, 0.05, 0.006, 0, 0.012, 0.385)]),
      gpart('steel', [st, rb(0.02, 0.014, 0.03, 0.004, 0, 0.03, -0.035), side([[-0.02, -0.03], [-0.014, -0.03], [-0.018, -0.045], [-0.026, -0.056], [-0.03, -0.055], [-0.024, -0.044]], 0.006, 0.0012)]),
      gpart('poly', [rodG([-0.298, 0.03, -0.295], [0, 0.03, 0.03], 0.0022, 5), rodG([0.298, 0.03, -0.295], [0, 0.03, 0.03], 0.0022, 5)]),
      gpart('wood', rodG([0, 0.045, 0.05], [0, 0.045, -0.45], 0.0052, 8), 'bolt'),
      gpart('steel', spike(0.011, 0.05, [0, 0.045, -0.47], [-HX, 0, 0], 4), 'onbolt'), gpart('poly', fl, 'onbolt'),
    ] };
  };
  // the launcher: a tube with a flared mouth and a venturi behind, two grips, a sight box on its left, a rest for the shoulder; the
  // rocket's nose shows at the mouth (it is the 'bolt')
  GN.rocket = () => ({ parts: [
    gpart('poly', [tubeZ([[0.0005, -0.33], [0.07, -0.33], [0.074, -0.31], [0.066, -0.27], [0.062, -0.24], [0.062, 0.2], [0.066, 0.21], [0.066, 0.25], [0.062, 0.26], [0.062, 0.57], [0.07, 0.58], [0.072, 0.62], [0.066, 0.632], [0.056, 0.632], [0.054, 0.56], [0.0005, 0.56]], 0.03, 0, 26),
      gripG(0.0, -0.03, -0.128, 0.03), side([[0.266, -0.03], [0.263, -0.126], [0.232, -0.126], [0.232, -0.03]], 0.03, 0.008, null, 0, 2), rb(0.05, 0.03, 0.12, 0.01, 0, -0.046, -0.2)]),
    gpart('metal', [bandZ(0.0625, 0.565, 0.635, 0.03, 0.01), bandZ(0.0625, -0.335, -0.265, 0.03, 0.012), bandZ(0.062, 0.1, 0.13, 0.03, 0.005), rb(0.034, 0.03, 0.13, 0.006, 0, -0.04, 0.07),
      rb(0.03, 0.05, 0.06, 0.006, -0.075, 0.08, 0.1), rb(0.012, 0.03, 0.022, 0.003, -0.068, 0.05, 0.1)]),
    gpart('steel', [tubeZ([[0.0005, 0.128], [0.011, 0.128], [0.011, 0.133], [0.0005, 0.133]], 0.08, -0.075), side([[0.03, -0.034], [0.036, -0.034], [0.032, -0.048], [0.024, -0.058], [0.021, -0.057], [0.026, -0.047]], 0.006, 0.0012)]),
    gpart('metal', tubeZ([[0.0005, 0.6], [0.045, 0.6], [0.05, 0.615], [0.05, 0.65], [0.04, 0.685], [0.022, 0.71], [0.0005, 0.722]], 0.03, 0, 20), 'bolt'),
  ] });
  // the grenade launcher: a short wide barrel, a cylinder of six chambers (it turns), a frame strapped over and under it, a fore grip
  GN.gl = () => {
    const ch = []; for (let i = 0; i < 6; i++) { const a = (i + 0.5) / 6 * TAU; for (const y of [-0.0605, 0.0605]) ch.push(Geo.xf(new THREE.CylinderGeometry(0.019, 0.019, 0.004, 14), [Math.cos(a) * 0.042, y, Math.sin(a) * 0.042])); }
    const dr = sec(flower(0.064, 0.006), -0.06, 0.06, 0.004); dr.rotateX(-HX);
    return { drum: { at: [0, 0, -0.03], parts: [{ g: boxUV(dr, 5), m: 'metal' }, { g: boxUV(Geo.merge(ch), 5), m: 'brass' }] }, parts: [
      gpart('metal', [tubeZ([[0.0005, 0.1], [0.03, 0.1], [0.03, 0.36], [0.034, 0.365], [0.034, 0.388], [0.027, 0.39], [0.025, 0.3], [0.0005, 0.3]], 0.03, 0, 20),
        side([[0.13, 0.0755], [0.13, -0.005], [0.094, -0.005], [0.094, 0.0712], [-0.034, 0.0712], [-0.034, -0.03], [-0.06, -0.04], [-0.15, -0.03], [-0.15, 0.062], [-0.13, 0.0755]], 0.05, 0.002, null, 0, 1),
        rb(0.03, 0.012, 0.14, 0.004, 0, -0.08, 0.03), rb(0.04, 0.085, 0.036, 0.006, 0, -0.045, 0.112), rb(0.04, 0.06, 0.03, 0.006, 0, -0.055, -0.045)]),
      gpart('steel', [rb(0.004, 0.034, 0.006, 0.001, 0, 0.08, 0.372), rb(0.022, 0.03, 0.004, 0.001, 0, 0.104, -0.1)], 'irons'), gpart('steel', [side([[-0.075, -0.04], [-0.081, -0.04], [-0.085, -0.052], [-0.081, -0.062], [-0.078, -0.061], [-0.08, -0.05]], 0.006, 0.0012)]),
      gpart('poly', [gripG(0.12, -0.035, -0.135), stockG(0.15, 0.4, 0.062, -0.04), side([[0.216, 0.003], [0.213, -0.11], [0.185, -0.11], [0.185, 0.003]], 0.03, 0.008, null, 0, 2)]),
    ] };
  };
  // the flamethrower: a pipe under a pierced shroud to a flared mouth of brass, the tank slung under it with its valve and bands, a
  // feed line, the pilot's thin pipe
  GN.flame = () => ({ parts: [
    gpart('metal', [side([[0.15, 0.055], [0.15, -0.015], [-0.06, -0.018], [-0.15, -0.015], [-0.15, 0.05], [-0.12, 0.058]], 0.048, 0.006, null, 0, 2),
      tubeZ([[0.0005, 0.15], [0.016, 0.15], [0.016, 0.5], [0.0005, 0.5]], 0.03),
      tubeZ([[0.018, 0.28], [0.026, 0.285], [0.026, 0.31], [0.022, 0.314], [0.022, 0.332], [0.026, 0.336], [0.026, 0.36], [0.022, 0.364], [0.022, 0.382], [0.026, 0.386], [0.026, 0.41], [0.022, 0.414], [0.022, 0.432], [0.026, 0.436], [0.026, 0.465], [0.018, 0.47]], 0.03)]),
    gpart('brass', [tubeZ([[0.016, 0.49], [0.024, 0.492], [0.031, 0.505], [0.034, 0.548], [0.03, 0.55], [0.024, 0.512], [0.016, 0.5]], 0.03, 0, 20), rodG([0, 0.003, -0.2], [0, 0.002, -0.552], 0.004, 6), rodG([0, -0.05, -0.29], [0, -0.012, -0.335], 0.006, 6), rodG([0, -0.012, -0.335], [0, 0.012, -0.3], 0.006, 6)]),
    gpart('tank', tubeZ([[0.0005, -0.03], [0.03, -0.028], [0.046, -0.015], [0.05, 0.005], [0.05, 0.235], [0.046, 0.255], [0.03, 0.268], [0.012, 0.272], [0.012, 0.288], [0.0005, 0.288]], -0.07, 0, 22), 'mag', { tank: { r: 0.05, len: 0.3, axis: 'z' } }),
    gpart('metal', [bandZ(0.0495, 0.04, 0.062, -0.07, 0.004), bandZ(0.0495, 0.18, 0.202, -0.07, 0.004), tubeZ([[0.0005, 0.286], [0.017, 0.286], [0.017, 0.296], [0.0005, 0.296]], -0.07)], 'onmag'),
    gpart('poly', [gripG(0.12, -0.03, -0.135), stockG(0.15, 0.4, 0.05, -0.035)]),
  ] });
  // the rail gun: two glowing rails under coils between an upper and a lower spar, a body with a toothed rail on top, the cell
  GN.rail = () => {
    const teeth = []; for (let i = 0; i < 9; i++) teeth.push(rb(0.024, 0.004, 0.011, 0.0008, 0, 0.063, -0.06 + i * 0.021));
    const coils = []; for (let i = 0; i < 5; i++) { const c = new THREE.TorusGeometry(0.045, 0.0075, 8, 22); c.translate(0, 0.02, -0.25 - i * 0.08); coils.push(c); }
    const fr = []; for (const f of [0.215, 0.29, 0.37, 0.45, 0.53, 0.61, 0.755]) fr.push(sec(rrect(0, 0.02, 0.082, 0.07, 0.016, 3), f - 0.006, f + 0.006, 0.002, [rrect(0, 0.02, 0.066, 0.054, 0.012, 3)]));
    return { parts: [
      gpart('metal', [side([[0.22, 0.06], [0.22, -0.02], [0.1, -0.022], [-0.15, -0.02], [-0.15, 0.05], [-0.1, 0.062]], 0.066, 0.006, null, 0, 2), rb(0.026, 0.006, 0.2, 0.001, 0, 0.0585, 0.025),
        rb(0.03, 0.006, 0.55, 0.002, 0, 0.052, 0.49), rb(0.03, 0.006, 0.55, 0.002, 0, -0.012, 0.49)].concat(teeth, fr)),
      gpart('glow', [rb(0.014, 0.024, 0.52, 0.003, 0.025, 0.02, 0.5), rb(0.014, 0.024, 0.52, 0.003, -0.025, 0.02, 0.5)]), gpart('coil', coils),
      gpart('glow', Geo.xf(X.makeRbox(0.04, 0.06, 0.08, 0.008, 1), [0, -0.06, -0.05]), 'mag'),
      gpart('metal', [rb(0.044, 0.008, 0.084, 0.003, 0, -0.092, 0.05), rb(0.044, 0.008, 0.084, 0.003, 0, -0.03, 0.05)], 'onmag'),
      gpart('poly', [gripG(0.1, -0.03, -0.135), stockG(0.15, 0.41, 0.05, -0.045)]),
    ] };
  };
  // the nailer: a tool's body with a bar to carry it by, a nose with a safety foot, the coil of nails in its drum, an air fitting
  GN.nail = () => {
    const drum = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 22); drum.rotateZ(HX); drum.translate(0, 0, -0.05);
    const hub = new THREE.CylinderGeometry(0.014, 0.014, 0.036, 10); hub.rotateZ(HX); hub.translate(0, 0, -0.05);
    return { parts: [
      gpart('metal', [side([[0.14, 0.066], [0.14, -0.01], [0.1, -0.03], [-0.02, -0.03], [-0.14, -0.02], [-0.14, 0.05], [-0.1, 0.066]], 0.056, 0.012, null, 0, 2),
        rodG([0, 0.06, -0.165], [0, 0.072, -0.165], 0.009), rodG([0, 0.06, 0.055], [0, 0.072, 0.055], 0.009), tubeZ([[0.0005, -0.165], [0.03, -0.165], [0.034, -0.15], [0.03, -0.135], [0.0005, -0.135]], 0.02)]),
      gpart('poly', [rodG([0, 0.072, -0.175], [0, 0.072, 0.065], 0.013, 10), gripG(0.12, -0.03, -0.135)]),
      gpart('steel', [tubeZ([[0.0005, 0.14], [0.016, 0.14], [0.016, 0.16], [0.012, 0.165], [0.012, 0.325], [0.0005, 0.325]], 0.03), rb(0.01, 0.03, 0.02, 0.003, 0, 0.012, 0.325), rb(0.022, 0.006, 0.03, 0.002, 0, -0.002, 0.33)]),
      gpart('brass', Geo.xf(new THREE.CylinderGeometry(0.008, 0.01, 0.022, 8), [0, -0.146, 0.132])),
      gpart('metal', drum, 'mag', { tank: { r: 0.05, len: 0.03, axis: 'x' } }), gpart('steel', hub, 'onmag'),
    ] };
  };
  // the harpoon gun: a banded tube, the shaft of the spear out of its mouth (the 'bolt') with a barbed head, a reel of line, a wooden stock
  GN.harpoon = () => {
    const reel = new THREE.CylinderGeometry(0.028, 0.028, 0.026, 16); reel.rotateZ(HX); reel.translate(0, -0.022, -0.1);
    const rope = new THREE.CylinderGeometry(0.022, 0.022, 0.02, 14); rope.rotateZ(HX); rope.translate(0, -0.022, -0.1);
    const head = [spike(0.02, 0.085, [0, 0.03, -0.712], [-HX, 0, 0], 4)]; for (const s of [-1, 1]) head.push(spike(0.007, 0.05, [s * 0.014, 0.03, -0.668], [HX - 0.001, 0, s * 0.42], 4));
    return { parts: [
      gpart('metal', [tubeZ([[0.0005, -0.05], [0.026, -0.05], [0.03, -0.04], [0.03, 0.43], [0.034, 0.435], [0.034, 0.452], [0.02, 0.455], [0.018, 0.4], [0.0005, 0.4]], 0.03, 0, 20), bandZ(0.0298, 0.1, 0.125, 0.03, 0.005), bandZ(0.0298, 0.27, 0.295, 0.03, 0.005), reel]),
      gpart('poly', rope),
      gpart('steel', rodG([0, 0.03, -0.17], [0, 0.03, -0.67], 0.006, 8), 'bolt'),
      gpart('steel', head, 'extra'),
      gpart('wood', side([[0.06, 0.004], [0.04, -0.03], [-0.04, -0.035], [-0.062, -0.112], [-0.098, -0.116], [-0.105, -0.05], [-0.16, -0.045], [-0.35, -0.06], [-0.37, -0.055], [-0.37, 0.036], [-0.2, 0.036], [-0.13, 0.02], [-0.05, 0.004]], 0.04, 0.008, null, 0, 2)),
      gpart('steel', side([[-0.02, -0.034], [-0.014, -0.034], [-0.018, -0.049], [-0.026, -0.06], [-0.03, -0.059], [-0.024, -0.048]], 0.006, 0.0012)),
    ] };
  };
  // the lightning gun: a ribbed insulator, a brass electrode to a glowing ball between its coils, a brass vessel at its side
  GN.tesla = () => {
    const ins = [[0.0005, 0.15]]; for (let i = 0; i < 5; i++) { const f = 0.152 + i * 0.022; ins.push([0.03, f], [0.03, f + 0.01], [0.021, f + 0.014], [0.021, f + 0.019]); } ins.push([0.0005, 0.262]);
    const tco = []; for (let i = 0; i < 3; i++) { const c = new THREE.TorusGeometry(0.04, 0.007, 8, 22); c.translate(0, 0.03, -0.2 - i * 0.07); tco.push(c); }
    return { parts: [
      gpart('coil', tco),
      gpart('metal', [side([[0.15, 0.06], [0.15, -0.02], [-0.15, -0.02], [-0.15, 0.05], [-0.11, 0.062]], 0.056, 0.008, null, 0, 2), rb(0.024, 0.005, 0.18, 0.001, 0, 0.0625, 0.02)]),
      gpart('steel', tubeZ(ins, 0.03, 0, 20)),
      gpart('brass', [tubeZ([[0.0005, 0.25], [0.011, 0.25], [0.011, 0.43], [0.016, 0.436], [0.016, 0.444], [0.0005, 0.444]], 0.03), rodG([0, 0.076, -0.18], [0, 0.076, -0.36], 0.0035, 6), rodG([0, -0.016, -0.18], [0, -0.016, -0.36], 0.0035, 6),
        rodG([0, 0.076, -0.18], [0, 0.05, -0.16], 0.0035, 6), rodG([0, -0.016, -0.18], [0, 0.01, -0.16], 0.0035, 6)]),
      gpart('glow', ball(0.025, [0, 0.03, -0.46])),
      gpart('brass', tubeZ([[0.0005, -0.082], [0.02, -0.08], [0.03, -0.066], [0.03, 0.028], [0.02, 0.04], [0.008, 0.044], [0.008, 0.056], [0.0005, 0.056]], 0.0, 0.05, 18), 'mag', { tank: { r: 0.03, len: 0.13, axis: 'z' } }),
      gpart('poly', [gripG(0.12, -0.03, -0.135), stockG(0.15, 0.4, 0.05, -0.035)]),
    ] };
  };
  const gnCache = {};
  X.gunParts = function (arch) { if (gnCache[arch] !== undefined) return gnCache[arch]; let r = null; try { r = GN[arch] ? GN[arch]() : null; } catch (e) { console.warn('gfx: no gun', arch, e); r = null; } return (gnCache[arch] = r); };
  // ---- a great pointed vault over a hall: the line of its arch, a rib along that line, the web of the vault between ribs. Half-span a,
  // rise H above the springing; the crown is a point (the two sides meet there at an angle, as two arcs struck from apart do) ----
  const archY = (t, H) => H * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(t) * 0.9 + 0.1, 2))) / 0.99499;
  const archLine = (a, H, seg) => { const P = []; for (let i = 0; i <= seg; i++) { const t = -1 + 2 * i / seg; P.push([t * a, archY(t, H)]); } return P; };
  // a rib: the arch's line given a depth (outward, the same all the way) and a width along the hall, its edges taken off
  X.archRib = function (a, H, deep, wide, seg) {
    seg = seg || 30; const inn = archLine(a, H, seg), out = [];
    for (let i = 0; i <= seg; i++) { const q0 = inn[Math.max(0, i - 1)], q1 = inn[Math.min(seg, i + 1)]; let nx = -(q1[1] - q0[1]), ny = q1[0] - q0[0]; const l = Math.hypot(nx, ny) || 1; out.push([inn[i][0] + nx / l * deep, inn[i][1] + ny / l * deep]); }
    const sh = new THREE.Shape(); sh.moveTo(inn[0][0], inn[0][1]); for (let i = 1; i <= seg; i++) sh.lineTo(inn[i][0], inn[i][1]); for (let i = seg; i >= 0; i--) sh.lineTo(out[i][0], out[i][1]); sh.closePath();
    const bv = Math.min(0.07, wide * 0.15), g = new THREE.ExtrudeGeometry(sh, { depth: wide - bv * 2, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: 1, curveSegments: 1, steps: 1 });
    g.translate(0, 0, -(wide - bv * 2) / 2);
    return boxUV(g, 0.4);
  };
  // the masonry between an arch and the flat thing it carries (a bridge's deck): the arch's line below, a level line above
  X.archSpandrel = function (a, H, wide, seg) {
    seg = seg || 24; const P = archLine(a, H, seg), sh = new THREE.Shape(); sh.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i <= seg; i++) sh.lineTo(P[i][0], P[i][1]); sh.lineTo(a, H + 0.02); sh.lineTo(-a, H + 0.02); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: wide, bevelEnabled: false, curveSegments: 1, steps: 1 }); g.translate(0, 0, -wide / 2);
    return boxUV(g, 0.4);
  };
  // the web: the arch's line drawn along the hall for a length, seen from below (its other side is never seen)
  X.archWeb = function (a, H, len, seg, uvk) {
    seg = seg || 30; const P = archLine(a, H, seg), pos = [], nor = [], uv = [], idx = [], k = uvk || 0.3; let run = 0;
    for (let i = 0; i <= seg; i++) {
      if (i) run += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      const q0 = P[Math.max(0, i - 1)], q1 = P[Math.min(seg, i + 1)]; let nx = q1[1] - q0[1], ny = -(q1[0] - q0[0]); const l = Math.hypot(nx, ny) || 1;
      for (const z of [0, len]) { pos.push(P[i][0], P[i][1], z); nor.push(nx / l, ny / l, 0); uv.push(z * k, run * k); }
    }
    for (let i = 0; i < seg; i++) { const a0 = i * 2, b0 = a0 + 1, c0 = a0 + 2, d0 = a0 + 3; idx.push(a0, c0, b0, b0, c0, d0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  };

  // ---- shapes for the bodies that are not built of blocks (enemies.js), each of unit size like the plain ball, rod or cone it stands
  // in for: a slime sagging onto the floor, a finely turned ball for the great eye, a tapering length of tentacle, a scowl; a toadstool's
  // cap and stalk; a robe hanging in folds ----
  const fgc = {};
  const spl = (pts, n) => new THREE.SplineCurve(pts.map((q) => new THREE.Vector2(q[0], q[1]))).getPoints(n).map((q) => new THREE.Vector2(Math.max(q.x, 0.0005), q.y));
  X.foeGeo = function (name) {
    if (fgc[name]) return fgc[name];
    let g = null;
    if (name === 'slime') g = new THREE.LatheGeometry(spl([[0.0005, -1], [0.86, -1], [1.1, -0.95], [1.13, -0.82], [1.05, -0.6], [1.0, -0.25], [0.96, 0.1], [0.86, 0.42], [0.68, 0.69], [0.44, 0.88], [0.2, 0.975], [0.0005, 1]], 30), 36);
    else if (name === 'ball') g = new THREE.SphereGeometry(1, 36, 24);
    else if (name === 'taper') g = new THREE.CylinderGeometry(1, 0.78, 1, 12, 1);
    else if (name === 'smile') g = new THREE.TorusGeometry(1, 0.17, 6, 14, Math.PI);   // (turned down at the ends: a scowl)
    else if (name === 'cap') {
      // a dome, its rim rolled under, the hollow of the gills beneath (the ball it stands in for was one across about its middle)
      g = new THREE.LatheGeometry(spl([[0.0005, 0.62], [0.3, 0.58], [0.62, 0.42], [0.88, 0.14], [1.0, -0.14], [0.97, -0.3], [0.86, -0.36], [0.7, -0.26], [0.4, -0.16], [0.12, -0.12], [0.0005, -0.12]], 28), 40);
      const ps = g.attributes.position;
      for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), z = ps.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z), k = 1 + 0.035 * Math.sin(a * 5 + 1) * r + 0.02 * Math.sin(a * 11) * r; ps.setX(i, x * k); ps.setZ(i, z * k); if (ps.getY(i) < -0.1 && r > 0.15 && r < 0.9) ps.setY(i, ps.getY(i) + 0.025 * Math.sin(a * 44)); }
      g.computeVertexNormals();
    } else if (name === 'stem') g = new THREE.LatheGeometry(spl([[0.0005, -0.5], [1.15, -0.5], [1.3, -0.4], [1.05, -0.2], [0.82, 0.05], [0.78, 0.18], [1.12, 0.14], [1.16, 0.2], [0.8, 0.27], [0.74, 0.5], [0.0005, 0.5]], 26), 24);   // swollen at the foot, a torn ring two thirds up
    else if (name === 'robe') {
      // narrow at the waist, flaring to the ground, hanging in folds (in place of a cone one across at its foot, one high)
      g = new THREE.LatheGeometry(spl([[0.0005, 0.5], [0.42, 0.5], [0.5, 0.3], [0.62, 0.0], [0.82, -0.3], [1.0, -0.5]], 16), 36);
      const ps = g.attributes.position;
      for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), z = ps.getZ(i), a = Math.atan2(z, x), dn = Math.max(0, 0.5 - ps.getY(i)), k = 1 + (0.09 * Math.sin(a * 9) + 0.05 * Math.sin(a * 4 + 1)) * dn; ps.setX(i, x * k); ps.setZ(i, z * k); }
      g.computeVertexNormals();
    }
    return (fgc[name] = g);
  };

  // ---- what the field foes carry and wear (fieldfoes.js), in metres, as lists of parts { g, m }: m says which of the wearer's
  // materials. A thing held in a hand has its grip at the origin and runs forward (+z, the way a body faces); a thing worn sits about
  // the joint it hangs on ----
  const fpart = (m, list, k) => ({ g: boxUV(Geo.merge(Array.isArray(list) ? list : [list]), k || 2.5), m });
  const toZ = (g) => { g.rotateX(HX); return g; };       // (drawn up the y axis like a hand weapon, then laid forward)
  // a round bar along a line of points, its radius by how far along it (0 to 1). sm: how many points to draw the curve through them
  // with (false: straight from point to point)
  const tubeR = (pts, rf, seg, sm) => {
    const V3 = THREE.Vector3;
    const P = sm === false ? pts.map((p) => new V3(p[0], p[1], p[2])) : new THREE.CatmullRomCurve3(pts.map((p) => new V3(p[0], p[1], p[2]))).getPoints(sm || pts.length * 4);
    const n = P.length, sg = seg || 8, pos = [], idx = [], t = new V3(), b = new V3(), nn = new V3(); let pb = null;
    for (let i = 0; i < n; i++) {
      t.copy(P[Math.min(i + 1, n - 1)]).sub(P[Math.max(i - 1, 0)]).normalize();
      if (!pb) pb = Math.abs(t.x) < 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
      b.copy(pb).addScaledVector(t, -pb.dot(t)).normalize(); pb.copy(b); nn.crossVectors(t, b);
      const r = typeof rf === 'function' ? rf(i / (n - 1)) : rf;
      for (let k = 0; k < sg; k++) { const a = k / sg * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r; pos.push(P[i].x + b.x * c + nn.x * s, P[i].y + b.y * c + nn.y * s, P[i].z + b.z * c + nn.z * s); }
    }
    for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sg; k++) { const a = i * sg + k, a2 = i * sg + (k + 1) % sg, c = a + sg, c2 = a2 + sg; idx.push(a, a2, c, a2, c2, c); }
    const c0 = pos.length / 3; pos.push(P[0].x, P[0].y, P[0].z, P[n - 1].x, P[n - 1].y, P[n - 1].z);
    for (let k = 0; k < sg; k++) { idx.push(c0, (k + 1) % sg, k); idx.push(c0 + 1, (n - 1) * sg + k, (n - 1) * sg + (k + 1) % sg); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // a sheet hanging from y1 down to y0: its half-width w(v) and where it lies z(x, v, u) at each height (v: 0 at the foot, 1 at the
  // top; u: -1 to 1 across). drop(u): how much higher the foot ends across it (a torn hem). th: a thickness, with a back and a rim
  const sheet = (y0, y1, wf, zf, ny, nx, th, drop) => {
    const pos = [], idx = [], row = nx + 1;
    const lay = (dz) => { for (let j = 0; j <= ny; j++) { const v = j / ny, w = Math.max(wf(v), 0.0004); for (let i = 0; i <= nx; i++) { const u = i / nx * 2 - 1, x = u * w; pos.push(x, y0 + (y1 - y0) * v + (drop ? drop(u) * (1 - v) * (1 - v) : 0), zf(x, v, u) + dz); } } };
    lay(0);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * row + i, b = a + 1, c = a + row, d = c + 1; idx.push(a, b, d, a, d, c); }
    if (th) {
      const o = pos.length / 3; lay(-th);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = o + j * row + i, b = a + 1, c = a + row, d = c + 1; idx.push(a, d, b, a, c, d); }
      const B = []; for (let i = 0; i <= nx; i++) B.push(i); for (let j = 1; j <= ny; j++) B.push(j * row + nx); for (let i = nx - 1; i >= 0; i--) B.push(ny * row + i); for (let j = ny - 1; j >= 1; j--) B.push(j * row);
      for (let k = 0; k < B.length; k++) { const a = B[k], b = B[(k + 1) % B.length]; idx.push(a, o + a, b, b, o + a, o + b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  const GEAR = {}, gearC = {};
  // a hay fork: a haft worn smooth and not quite straight, a socket, three tines drawn out to points
  GEAR.pitchfork = () => {
    const iron = [toZ(hl([[0.0005, 1.12], [0.027, 1.12], [0.025, 1.24], [0.016, 1.29], [0.0005, 1.29]], 1, 1, 10)), toZ(ringY(1.135, 0.027, 0.005))];
    for (const x of [-0.085, 0, 0.085]) iron.push(tubeR([[x * 0.15, 0, 1.26], [x * 0.9, 0, 1.31], [x * 1.1, -0.006, 1.42], [x, -0.03, 1.6 + (x ? 0 : 0.035)]], (t) => 0.0125 - t * 0.0105, 6, 14));
    return [fpart('wood', tubeR([[0, 0.012, -0.42], [0.006, 0, 0], [0, -0.008, 0.6], [-0.004, 0, 1.2]], (t) => 0.021 - t * 0.003, 8, 16), 3), fpart('iron', iron, 4)];
  };
  // a sword for two hands: a long grip bound in hide, a wheel for a pommel, a guard drawn down at its ends, a broad blade with a ridge
  GEAR.greatsword = () => [
    fpart('leather', toZ(hl(wrapPts(-0.2, 0.062, 0.021, 13), 0.86, 1.1)), 6),
    fpart('iron', [toZ(hl([[0.0005, -0.27], [0.024, -0.265], [0.037, -0.24], [0.024, -0.214], [0.0005, -0.2]], 0.62, 1, 14)),
      toZ(side([[0.18, 0.058], [0.192, 0.072], [0.176, 0.094], [0.03, 0.088], [-0.03, 0.088], [-0.176, 0.094], [-0.192, 0.072], [-0.18, 0.058], [-0.02, 0.064], [0.02, 0.064]], 0.028, 0.007)),
      toZ(rbx(0.034, 0.05, 0.05, 0.008, 0, 0.076, 0))], 4),
    fpart('blade', toZ(straight([[0.09, 0.043, 0.043, 0.0115], [0.5, 0.039, 0.039, 0.0108], [0.98, 0.033, 0.033, 0.0092], [1.2, 0.021, 0.021, 0.0062]], [1.32, 0])), 3),
    fpart('dark', toZ(rbx(0.013, 0.62, 0.011, 0.002, 0, 0.43, 0)), 3),
  ];
  // a kite shield: round above, drawn down to a point, bent about the arm; an iron rim, a boss, two bands, nails
  GEAR.kite = () => {
    const Y0 = -0.62, Y1 = 0.4, wf = (v) => v < 0.7 ? 0.3 * Math.pow(v / 0.7, 0.7) : 0.3 * Math.sqrt(1 - Math.pow((v - 0.7) / 0.3, 2) * 0.9), bend = (x) => -1.1 * x * x;
    const rim = [], st = [];
    for (let i = 0; i <= 24; i++) { const v = i / 24; rim.push([wf(v), Y0 + (Y1 - Y0) * v, bend(wf(v)) - 0.015]); }
    for (let i = 24; i >= 0; i--) { const v = i / 24; rim.push([-wf(v), Y0 + (Y1 - Y0) * v, bend(wf(v)) - 0.015]); }
    st.push(tubeR(rim, 0.017, 6, false), ball(0.085, [0, -0.02, 0.0], [1, 1, 0.6]), ball(0.02, [0, -0.02, 0.05]));
    st.push(sheet(-0.55, 0.37, () => 0.024, (x) => bend(x) + 0.007, 8, 2, 0.008), sheet(0.09, 0.145, () => 0.285, (x) => bend(x) + 0.007, 1, 12, 0.008));
    for (const v of [0.22, 0.42, 0.62, 0.8, 0.93]) for (const s of [-1, 1]) { const x = s * (wf(v) - 0.05); st.push(ball(0.012, [x, Y0 + (Y1 - Y0) * v, bend(x) + 0.003])); }
    return [fpart('paint', sheet(Y0, Y1, wf, bend, 18, 12, 0.03), 2.2), fpart('steel', st, 4)];
  };
  // a longbow: a stave thick at the grip and thin at the horns, its ends bent back a little; the grip bound, horn nocks. It stands
  // up the y axis, its belly forward; the string (the wearer's own, it draws it) runs behind it at z = -0.16
  GEAR.longbow = () => {
    const pts = []; for (let i = -10; i <= 10; i++) { const t = i / 10, a = Math.abs(t); pts.push([0, t * 0.78, -0.19 * a * a + (a > 0.8 ? (a - 0.8) * 0.15 : 0)]); }
    return [fpart('wood', tubeR(pts, (t) => 0.008 + 0.015 * Math.pow(Math.sin(Math.PI * t), 0.7), 7, false), 4), fpart('leather', hl(wrapPts(-0.07, 0.07, 0.026, 7), 0.9, 1.05), 6),
      fpart('bone', [ball(0.012, [0, 0.78, -0.16], [0.8, 1.3, 1]), ball(0.012, [0, -0.78, -0.16], [0.8, 1.3, 1])], 4)];
  };
  // a quiver: a case of hide wider at its mouth, bound at the rim, six arrows standing in it, their flights of three vanes
  GEAR.quiver = () => {
    const dk = [], fl = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4, r = 0.012 + (i % 3) * 0.013, x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8, top = 0.5 + (i % 3) * 0.035;
      dk.push(Geo.rod([x, 0.2, z], [x * 1.6, top, z * 1.6], 0.005, 5));
      for (let k = 0; k < 3; k++) fl.push(Geo.xf(ext([[0.004, 0], [0.028, 0.018], [0.03, 0.1], [0.004, 0.135]], 0.002, 0), [x * 1.5, top - 0.16, z * 1.5], [0, a + k * 2.094, 0]));
    }
    return [fpart('leather', [hl([[0.0005, -0.3], [0.05, -0.3], [0.058, -0.27], [0.066, 0.2], [0.074, 0.24], [0.078, 0.27], [0.068, 0.27], [0.06, 0.22], [0.0005, 0.2]], 1, 0.8, 14),
      Geo.xf(ringY(0.2, 0.068, 0.008), null, null, [1, 1, 0.8]), Geo.xf(ringY(-0.22, 0.058, 0.007), null, null, [1, 1, 0.8])], 5), fpart('dark', dk, 4), fpart('fletch', fl, 6)];
  };
  // a reaping hook: a short haft, a ferrule, a blade that comes round in more than half a ring, its edge inside. Drawn up the y axis
  GEAR.sickle = () => {
    const bl = (t, w) => ({ a: w * 0.45, b: w * 0.55, T: 0.008 - t * 0.003, tb: 0.006 - t * 0.003 });
    return [fpart('wood', hl([[0.0005, -0.13], [0.019, -0.13], [0.0165, -0.02], [0.0185, 0.09], [0.0005, 0.09]], 1, 1, 10), 5),
      fpart('iron', [ringY(0.075, 0.0195, 0.005), cres(7, 0.052, 0.005, 0.075, 1.5, 0.42, 0.085, 0.0, bl)], 5)];
  };
  // a great helm drawn up to a blunt point: a comb over the crown from brow to nape, a band across the sight with two slits in it,
  // breaths pierced in one cheek, a fall of mail from its rim onto the shoulders
  GEAR.helm = () => {
    const prof = [[0.0005, 0.4], [0.035, 0.395], [0.09, 0.36], [0.14, 0.3], [0.17, 0.22], [0.18, 0.14], [0.178, 0.04], [0.17, -0.03], [0.176, -0.05], [0.166, -0.058], [0.0005, -0.058]], ZS = 1.08;
    const rAt = (y) => { for (let i = 0; i + 1 < prof.length; i++) { const a = prof[i], b = prof[i + 1]; if (y <= a[1] && y >= b[1]) return a[0] + (b[0] - a[0]) * (a[1] - y) / (a[1] - b[1] || 1); } return 0.17; };
    const comb = [], inner = [], ys = [-0.05, 0.04, 0.14, 0.22, 0.3, 0.36, 0.395];
    for (const y of ys) { comb.push([rAt(y) * ZS + 0.01, y]); inner.push([rAt(y) * ZS - 0.012, y]); }
    comb.push([0, 0.418]); inner.push([0, 0.39]);
    for (let i = ys.length - 1; i >= 3; i--) { comb.push([-(rAt(ys[i]) * ZS + 0.008), ys[i]]); inner.push([-(rAt(ys[i]) * ZS - 0.012), ys[i]]); }
    const cg = side(comb.concat(inner.reverse()), 0.03, 0.006); cg.rotateY(Math.PI);
    const band = ext(arcRing(0.172, 0.189, -HX - 1.25, -HX + 1.25, 18), 0.05, 0.004); band.rotateX(-HX); band.scale(1, 1, ZS); band.translate(0, 0.165, 0);
    const dk = [];
    for (const s of [-1, 1]) dk.push(rbx(0.066, 0.011, 0.014, 0.002, s * 0.072, 0.168, Math.sqrt(0.189 * 0.189 - 0.072 * 0.072) * ZS - 0.002, [0, s * 0.39, 0]));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const x = 0.045 + i * 0.028, y = 0.03 + j * 0.028; dk.push(ball(0.0065, [x, y, Math.sqrt(Math.pow(rAt(y), 2) - x * x) * ZS + 0.001])); }
    return [fpart('steel', hl(prof, 1, ZS, 24), 3), fpart('trim', [cg, band, Geo.xf(ringY(-0.045, 0.176, 0.008), null, null, [1, 1, ZS])], 4), fpart('dark', dk, 4),
      fpart('mail', hl([[0.166, -0.04], [0.19, -0.1], [0.228, -0.175], [0.216, -0.185], [0.17, -0.1], [0.15, -0.04]], 1, 1.02, 20), 9)];
  };
  // a cloak from the shoulders to the calf, in folds, its hem torn. It hangs from the origin
  GEAR.cape = () => [fpart('cloth', sheet(-1.0, 0, (v) => 0.36 - v * 0.13, (x, v, u) => -(1 - v) * (1 - v) * 0.16 + Math.sin(u * 8.5 + 0.6) * 0.035 * (1 - v * 0.8) + Math.sin(u * 3.1) * 0.02 * (1 - v), 14, 16, 0,
    (u) => 0.12 * Math.abs(Math.sin(u * 5.3 + 1)) + 0.07 * Math.sin(u * 11) - 0.05), 2)];
  // a rag of a hand's breadth, torn at its foot: what is left of a skirt or a sleeve. It hangs from the origin
  GEAR.tatter = () => [fpart('cloth', sheet(-0.34, 0, (v) => 0.075 - v * 0.02, (x, v, u) => Math.sin(u * 4 + 1) * 0.012 * (1 - v) + (1 - v) * (1 - v) * 0.03, 5, 4, 0, (u) => 0.1 * Math.abs(Math.sin(u * 3.7 + 0.5)) - 0.03), 3)];
  // a ribbon of waterweed, or of wet hair: wavy at its edges, twisting as it hangs. From the origin down
  GEAR.weed = () => [fpart('weed', sheet(-0.6, 0, (v) => 0.004 + 0.024 * Math.sqrt(v) * (0.65 + 0.35 * Math.sin(v * 9)), (x, v) => Math.sin(v * 7) * 0.03 * (1 - v) + x * Math.sin(v * 11) * 0.7, 12, 2, 0), 4)];
  // a wing: the arm of it along the fore edge, long flight feathers fanned from the hand, shorter ones along the forearm, a row of
  // coverts laid over their roots. It reaches out along +x from the origin, its feathers falling to -y
  GEAR.wing = () => {
    const feather = (len, w) => sheet(-len, 0, (v) => w * Math.max(0.24 * v, Math.pow(Math.sin(Math.PI * (1 - v) * 0.96 + 0.04), 0.55)), (x) => -x * x * 5, 6, 2, 0);
    const F = [tubeR([[0, 0, 0], [0.3, 0.12, -0.02], [0.62, 0.1, -0.05], [1.0, -0.03, -0.08]], (t) => 0.032 - t * 0.02, 6, 14)];
    for (let i = 0; i < 8; i++) F.push(Geo.xf(feather(0.6 - i * 0.012, 0.062), [0.6 + i * 0.055, 0.09 - i * 0.017, -0.05 + i * 0.004], [0, 0, 0.12 + i * 0.165]));     // from the hand
    for (let i = 0; i < 7; i++) F.push(Geo.xf(feather(0.44 + i * 0.02, 0.066), [0.07 + i * 0.085, 0.03 + Math.sin(i * 0.5) * 0.07, -0.02 - i * 0.004], [0, 0, -0.1 + i * 0.035]));   // along the forearm
    for (let i = 0; i < 10; i++) F.push(Geo.xf(feather(0.2 + (i % 2) * 0.03, 0.05), [0.05 + i * 0.095, 0.04 + Math.sin(i * 0.36) * 0.08 - (i > 6 ? (i - 6) * 0.03 : 0), 0.004 + i * 0.002], [0, 0, -0.05 + i * 0.07]));   // coverts
    for (let i = 0; i < 8; i++) F.push(Geo.xf(feather(0.1, 0.04), [0.08 + i * 0.11, 0.07 + Math.sin(i * 0.4) * 0.07 - (i > 5 ? (i - 5) * 0.04 : 0), 0.016], [0, 0, i * 0.06]));
    return [fpart('feather', F, 5)];
  };
  // a hat of felt gone shapeless: the crown fallen to one side, the brim rippled and torn away at one place; a cord about it
  GEAR.hat = () => {
    const g = new THREE.LatheGeometry(spl([[0.0005, 0.36], [0.05, 0.34], [0.1, 0.25], [0.16, 0.12], [0.2, 0.03], [0.24, 0.0], [0.42, -0.03], [0.445, -0.045], [0.42, -0.055], [0.2, -0.02], [0.0005, -0.02]], 30), 32);
    const ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) {
      let x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i); const a = Math.atan2(z, x), r = Math.hypot(x, z);
      if (r > 0.22) { const k = (r - 0.22) / 0.22, torn = Math.max(0, 1 - Math.abs(Math.atan2(Math.sin(a - 2.2), Math.cos(a - 2.2))) / 0.5); y += k * (0.045 * Math.sin(a * 3 + 1) + 0.025 * Math.sin(a * 7)) - k * k * 0.05; const sh = 1 - torn * 0.55 * k; x *= sh; z *= sh; }
      if (y > 0.1) { const k = (y - 0.1) / 0.26; x += k * k * 0.11; z -= k * k * 0.05; y -= k * k * 0.07; }
      ps.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    return [fpart('felt', g, 3), fpart('cord', ringY(0.045, 0.2, 0.012), 6)];
  };
  // two iron bottles side by side on the back, banded and capped; a pipe between their heads, another over the right shoulder
  GEAR.tank = () => {
    const iron = [rbx(0.2, 0.05, 0.02, 0.005, 0, 0.1, 0.1), rbx(0.2, 0.05, 0.02, 0.005, 0, -0.14, 0.1)], brass = [];
    for (const s of [-1, 1]) {
      iron.push(Geo.xf(hl([[0.0005, -0.3], [0.07, -0.29], [0.105, -0.25], [0.11, -0.2], [0.11, 0.2], [0.1, 0.26], [0.06, 0.3], [0.03, 0.31], [0.03, 0.35], [0.0005, 0.35]], 1, 1, 14), [s * 0.118, 0, 0]));
      for (const y of [-0.17, 0.02, 0.2]) brass.push(Geo.xf(ringY(y, 0.111, 0.008), [s * 0.118, 0, 0]));
      brass.push(Geo.xf(hl([[0.0005, 0.35], [0.036, 0.35], [0.036, 0.375], [0.0005, 0.38]], 1, 1, 10), [s * 0.118, 0, 0]));
    }
    brass.push(tubeR([[-0.118, 0.37, 0], [-0.08, 0.47, 0.02], [0.08, 0.47, 0.02], [0.118, 0.37, 0]], 0.014, 6, 12), tubeR([[0.118, 0.37, 0], [0.2, 0.48, 0.1], [0.28, 0.45, 0.27], [0.31, 0.27, 0.32]], 0.016, 6, 14));
    return [fpart('iron', iron, 3), fpart('brass', brass, 4)];
  };
  // a fire-pipe: a tube with a bound grip, two collars, a bell at its mouth, a thin pilot pipe laid along it. Forward from the grip
  GEAR.nozzle = () => [
    fpart('iron', [toZ(hl([[0.0005, -0.1], [0.02, -0.1], [0.02, 0.5], [0.026, 0.51], [0.03, 0.56], [0.05, 0.64], [0.056, 0.665], [0.047, 0.665], [0.024, 0.575], [0.0005, 0.565]], 1, 1, 14)),
      toZ(ringY(0.16, 0.021, 0.006)), toZ(ringY(0.42, 0.021, 0.006)), tubeR([[0, 0.03, 0.12], [0, 0.045, 0.3], [0, 0.05, 0.5], [0, 0.066, 0.66]], 0.007, 5, 10), rbx(0.012, 0.06, 0.012, 0.003, 0, 0.05, 0.16)], 4),
    fpart('leather', toZ(hl(wrapPts(-0.075, 0.075, 0.027, 7))), 6),
  ];
  // a smith's face: a hood of hide over the skull and neck, an iron plate before the face bent round it, nailed at its edge
  GEAR.smithmask = () => {
    const zf = (x) => Math.sqrt(0.2 * 0.2 - x * x) - 0.022, wf = (v) => 0.105 + 0.03 * Math.sin(v * Math.PI) - (v < 0.25 ? (0.25 - v) * 0.16 : 0), iron = [sheet(-0.075, 0.26, wf, zf, 10, 8, 0.012)];
    for (const v of [0.12, 0.5, 0.9]) for (const s of [-1, 1]) { const x = s * (wf(v) - 0.016); iron.push(ball(0.008, [x, -0.075 + 0.335 * v, zf(x) + 0.001])); }
    iron.push(sheet(0.06, 0.14, () => 0.012, (x) => zf(x) + 0.006, 2, 1, 0.006));    // a ridge down the nose
    return [fpart('iron', iron, 4), fpart('leather', [hl([[0.0005, 0.335], [0.07, 0.325], [0.13, 0.285], [0.168, 0.22], [0.178, 0.14], [0.172, 0.04], [0.15, -0.04], [0.16, -0.1], [0.2, -0.15], [0.19, -0.16], [0.12, -0.08], [0.0005, -0.06]], 1, 1.06, 18)], 4)];
  };
  // a smith's apron: a bib over the chest, a broad skirt of hide over the belly to below the knee, a strap about the neck and one
  // about the waist, a hammer hung from it. About the spine's foot
  GEAR.apron = () => {
    const prof = [[0.5, 0.225], [0.34, 0.29], [0.2, 0.35], [0.02, 0.335], [-0.2, 0.255], [-0.56, 0.22]];     // [height, how far forward the body's front is there]
    const fz = (y) => { for (let i = 0; i + 1 < prof.length; i++) { const a = prof[i], b = prof[i + 1]; if (y <= a[0] && y >= b[0]) { const t = (a[0] - y) / (a[0] - b[0]); return a[1] + (b[1] - a[1]) * (t * t * (3 - 2 * t)); } } return 0.22; };
    const Y0 = -0.56, Y1 = 0.5, wf = (v) => v > 0.72 ? 0.125 + (1 - v) * 0.1 : v > 0.62 ? 0.153 + (0.72 - v) * 1.2 : 0.273 + (0.62 - v) * 0.06;
    const zf = (x, v) => fz(Y0 + (Y1 - Y0) * v) - x * x * (1.2 + 0.7 * Math.min(1, Math.max(0, (v - 0.2) / 0.2))) + Math.sin(x * 22) * 0.008 * Math.max(0, 0.5 - v);
    const lea = [sheet(Y0, Y1, wf, zf, 18, 10, 0.014, (u) => 0.03 * Math.sin(u * 4 + 1))];
    lea.push(tubeR([[0.12, 0.5, 0.19], [0.15, 0.62, 0.06], [0.1, 0.66, -0.08], [0, 0.65, -0.12], [-0.1, 0.66, -0.08], [-0.15, 0.62, 0.06], [-0.12, 0.5, 0.19]], 0.011, 5, 24));
    const belt = [[0.275, 0.14, 0.2]]; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI; belt.push([Math.cos(a) * 0.3, 0.14, 0.05 - Math.sin(a) * 0.24]); } belt.push([-0.275, 0.14, 0.2]);
    lea.push(tubeR(belt, 0.013, 5, false));
    const iron = [ball(0.011, [0.105, 0.47, zf(0.105, 0.97) + 0.002]), ball(0.011, [-0.105, 0.47, zf(-0.105, 0.97) + 0.002]), rbx(0.05, 0.05, 0.11, 0.008, -0.27, -0.12, -0.12)];
    return [fpart('leather', lea, 3), fpart('iron', iron, 4), fpart('wood', tubeR([[-0.27, 0.15, -0.12], [-0.27, -0.12, -0.12]], 0.013, 6, false), 4)];
  };
  // a pike: a long ash haft, a shoe at its foot, a socket and a bar under a leaf of a head, a rag of a pennon
  GEAR.pike = () => [
    fpart('wood', tubeR([[0, 0.004, -0.75], [0.004, 0, 0], [0, -0.004, 0.9], [0, 0, 1.72]], (t) => 0.019 - t * 0.003, 8, 14), 3),
    fpart('iron', [toZ(hl([[0.0005, 1.66], [0.022, 1.66], [0.02, 1.78], [0.012, 1.84], [0.0005, 1.84]], 1, 1, 10)), toZ(spike(0.018, 0.09, [0, -0.79, 0], [Math.PI, 0, 0], 8)), toZ(rbx(0.012, 0.014, 0.13, 0.004, 0, 1.8, 0))], 4),
    fpart('blade', toZ(straight([[1.83, 0.012, 0.012, 0.011], [1.9, 0.03, 0.03, 0.012], [2.02, 0.024, 0.024, 0.0095], [2.16, 0.011, 0.011, 0.006]], [2.24, 0])), 3),
    fpart('cloth', Geo.xf(sheet(-0.34, 0, (v) => 0.075 - v * 0.02, (x, v, u) => Math.sin(u * 4 + 1) * 0.012 * (1 - v), 5, 4, 0, (u) => 0.1 * Math.abs(Math.sin(u * 3.7 + 0.5)) - 0.03), [0, -0.02, 1.6], [0, HX, 0]), 6),
  ];
  // a miner's pick: a short haft, a head drawn out to a point both ways in a bow
  GEAR.pick = () => [
    fpart('wood', tubeR([[0, 0, -0.3], [0.003, 0, 0.2], [0, 0, 0.62]], (t) => 0.02 - t * 0.002, 8, 8), 3),
    fpart('iron', [tubeR([[0, -0.3, 0.5], [0, -0.15, 0.585], [0, 0, 0.61], [0, 0.15, 0.585], [0, 0.3, 0.5]], (t) => 0.007 + 0.019 * Math.sin(Math.PI * t), 6, 16), toZ(rbx(0.05, 0.07, 0.06, 0.01, 0, 0.61, 0))], 4),
  ];
  // a kettle hat: a round skull of iron with a broad brim, over a coif of mail that falls on the shoulders
  GEAR.kettle = () => [
    fpart('steel', [hl([[0.0005, 0.335], [0.06, 0.325], [0.12, 0.285], [0.16, 0.215], [0.172, 0.15], [0.176, 0.13], [0.245, 0.082], [0.25, 0.07], [0.24, 0.062], [0.17, 0.1], [0.0005, 0.1]], 1, 1.08, 24),
      Geo.xf(side([[0.19, 0.13], [0.18, 0.22], [0.13, 0.3], [0, 0.345], [-0.13, 0.3], [-0.18, 0.22], [-0.19, 0.13], [-0.17, 0.13], [-0.16, 0.21], [-0.12, 0.28], [0, 0.32], [0.12, 0.28], [0.16, 0.21], [0.17, 0.13]], 0.022, 0.005))], 3),
    fpart('mail', hl([[0.0005, 0.3], [0.1, 0.27], [0.158, 0.18], [0.166, 0.08], [0.152, -0.02], [0.162, -0.06], [0.2, -0.12], [0.238, -0.175], [0.226, -0.185], [0.0005, -0.16]], 1, 1.03, 20), 9),
  ];
  // a staff, up the y axis from the hand: a crooked length of wood, three claws of bone at its head closed about a light (the light
  // is the bearer's: a ball 0.12 in radius at y 1.2)
  GEAR.staff = () => {
    const claws = []; for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4, c = Math.cos(a), sn = Math.sin(a); claws.push(tubeR([[c * 0.02, 1.02, sn * 0.02], [c * 0.13, 1.1, sn * 0.13], [c * 0.16, 1.22, sn * 0.16], [c * 0.09, 1.34, sn * 0.09]], (t) => 0.018 - t * 0.014, 5, 10)); }
    return [fpart('wood', [tubeR([[0.01, -0.64, 0], [-0.012, -0.2, 0.01], [0.014, 0.3, -0.008], [-0.008, 0.75, 0.006], [0, 1.04, 0]], (t) => 0.026 - t * 0.006, 7, 20), ball(0.036, [0, 1.03, 0], [1, 0.8, 1])], 4),
      fpart('bone', claws.concat([ringY(0.5, 0.027, 0.006), ringY(0.54, 0.027, 0.006)]), 5)];
  };
  // a cleaver, forward from the hand: a short grip, a broad blade with a thick back, a hole at its end, its edge notched
  GEAR.cleaver = () => [
    fpart('wood', toZ(hl(wrapPts(-0.07, 0.07, 0.02, 6), 0.85, 1.1)), 6),
    fpart('blade', Geo.xf(ext([[0.06, 0.2], [0.5, 0.21], [0.52, 0.17], [0.5, -0.03], [0.44, -0.05], [0.4, -0.035], [0.3, -0.055], [0.24, -0.04], [0.12, -0.05], [0.06, -0.02]], 0.014, 0.005, [arcPts(0.45, 0.15, 0.022, 0, Math.PI * 2, 10).slice(1)]), null, [0, -HX, 0]), 4),
    fpart('dark', [rbx(0.02, 0.05, 0.03, 0.005, 0, 0.08, 0.07)], 4),
  ];
  // a wing of skin, one long: an arm to the wrist, four long fingers fanned from it with the web between them, cut in scallops
  // along its edge, a web from the last finger back to the flank, a hooked thumb. It reaches out along +x, the web falls to -z
  GEAR.batwing = () => {
    const W = [0.6, 0.42, -0.05], sh = [0, 0, 0], el = [0.34, 0.2, 0.02], tips = [[1.0, 0.58, -0.12], [1.02, 0.12, -0.42], [0.82, -0.22, -0.62], [0.52, -0.38, -0.7], [0.06, -0.26, -0.5]];
    const bone = [tubeR([sh, el, W], (t) => 0.034 - t * 0.012, 6, 10), ball(0.036, el), ball(0.03, W), spike(0.014, 0.1, [W[0] + 0.02, W[1] + 0.07, W[2] + 0.02], [0.2, 0, -0.4], 5)];
    for (let i = 0; i < 4; i++) { const t = tips[i], m = [(W[0] + t[0]) / 2 + 0.02, (W[1] + t[1]) / 2 + 0.03, (W[2] + t[2]) / 2]; bone.push(tubeR([W, m, t], (k) => 0.018 - k * 0.014, 5, 10)); }
    const pos = [], tri = (a, b, c) => pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    for (let i = 0; i < 4; i++) {   // (between each finger and the next - the last web runs to the flank - in strips, its edge drawn in toward the wrist)
      const A = tips[i], Bt = tips[i + 1], root = i === 3 ? lerp(sh, W, 0.25) : W, n = 5;
      const edge = (k) => { const p = lerp(A, Bt, k), dip = Math.sin(Math.PI * k) * 0.2; return lerp(p, root, dip); };
      for (let j = 0; j < n; j++) { const e0 = edge(j / n), e1 = edge((j + 1) / n); tri(root, e0, e1); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return [fpart('bone', bone, 4), { g: boxUV(Geo.merge([g]), 3), m: 'skin' }];
  };
  // a headsman's axe at a giant's measure, forward from the fist: a haft bound with hide at the grip, a socket with langets, a
  // broad bearded blade drawn to a long edge, a spike behind it
  GEAR.headaxe = () => [
    fpart('wood', tubeR([[0, 0.02, -0.7], [0.01, 0, 0.6], [0, -0.01, 1.8], [0, 0, 2.75]], (t) => 0.095 - t * 0.02, 8, 16), 1.5),
    fpart('leather', [toZ(hl(wrapPts(-0.35, 0.35, 0.105, 9), 1, 1))], 3),
    fpart('iron', [toZ(hl([[0.0005, 2.05], [0.11, 2.05], [0.105, 2.75], [0.07, 2.84], [0.0005, 2.84]], 1, 1, 10)), toZ(rbx(0.04, 0.7, 0.06, 0.01, 0.1, 1.7, 0)), toZ(rbx(0.04, 0.7, 0.06, 0.01, -0.1, 1.7, 0)), toZ(spike(0.07, 0.5, [0, 2.4, 0.3], [HX, 0, 0], 4))], 1.5),
    fpart('blade', Geo.xf(ext([[2.1, 0.08], [2.7, 0.08], [2.95, 0.5], [3.02, 1.05], [2.6, 1.3], [2.0, 1.36], [1.55, 1.2], [1.35, 0.95], [1.9, 0.8], [2.0, 0.45]], 0.07, 0.03), null, [0, -HX, 0]), 1.5),
  ];
  // ---- the great worm (bosses.js Wyrm), at its own measure: the head some three metres through, forward along +z, the jaw's hinge
  // at (0, -0.5, 0.5). A skull drawn out into a snout with a hook at its end, a ridge over each eye and one down the middle, plates
  // of the neck each over the next, a flat roof to the mouth; teeth of unequal length along the lips, long ones in front; horns
  // swept back from behind the eyes. The jaw: two bones and a chin, flat above, a trough for the tongue. A ring of the body: a
  // barrel with a collar at its hinder edge, a spine on its back with a smaller one each side, a paler belly.
  const wyTeeth = (list, up) => list.map(([x, z, h, r]) => spike(r, h, [x, up ? 0.02 + h / 2 : -0.45 - h / 2, z], [up ? 0 : Math.PI, 0, (up ? -1 : 1) * Math.sign(x) * 0.16], 5));
  GEAR.wyrmhead = () => {
    const S = X.S, sm = S.smin;
    const fn = (x, y, z) => {
      const ax = Math.abs(x);
      let d = S.ell(x, y, z, 0, 0.2, -0.3, 1.45, 1.15, 1.6);
      d = sm(d, S.cone(x, y, z, 0, 0.25, 0.5, 0, 0.02, 2.45, 1.05, 0.5), 0.35);
      d = sm(d, S.cap(ax, y, z, 0.92, 0.95, 0.2, 0.62, 0.72, 1.9, 0.26), 0.22);
      d = sm(d, S.cap(x, y, z, 0, 1.25, -1.0, 0, 0.55, 2.2, 0.15), 0.2);
      d = sm(d, S.cone(x, y, z, 0, 0.05, 2.4, 0, -0.6, 2.85, 0.42, 0.06), 0.18);
      for (let i = 0; i < 3; i++) d = sm(d, S.tor(x, y, z, 0, 0.2, -0.7 - i * 0.5, 0, -0.243, 0.97, 1.4 - i * 0.05, 0.25 - i * 0.03), 0.14);
      d = S.cut(d, S.sph(ax, y, z, 1.05, 0.55, 1.25, 0.27), 0.09);
      d = S.cut(d, S.box(x, y, z, 0, -1.45, 1.3, 2.3, 1.0, 1.9, 0.1), 0.14);
      d = S.cut(d, S.cap(ax, y, z, 0.24, 0.2, 2.15, 0.36, 0.3, 1.9, 0.065), 0.04);
      return d + Math.sin(x * 5.1 + z * 2.3) * Math.sin(y * 6.3 - z * 3.1) * 0.022;
    };
    const up = [], w = (z) => 1.05 - (z - 0.5) * 0.28;
    [[0.7, 0.5], [1.1, 0.7], [1.5, 0.46], [1.9, 0.6], [2.25, 0.4]].forEach(([z, h]) => { for (const s of [-1, 1]) up.push([s * (w(z) - 0.08), z, h, 0.11]); });
    for (const s of [-1, 1]) up.push([s * 0.2, 2.52, 0.52, 0.1]);
    const horns = [];
    for (const s of [-1, 1]) for (const [a, b, c, r] of [[[0.75, 1.0, -0.4], [1.0, 1.5, -1.0], [1.05, 1.75, -1.75], 0.19], [[1.1, 0.6, -0.7], [1.5, 0.95, -1.3], [1.6, 1.05, -2.0], 0.17], [[1.2, 0.05, -0.8], [1.6, 0.15, -1.4], [1.7, 0.1, -2.0], 0.15]])
      horns.push(tubeR([[s * a[0], a[1], a[2]], [s * b[0], b[1], b[2]], [s * c[0], c[1], c[2]]], (t) => r * (1 - t) + 0.02, 6, 9));
    return [fpart('skin', [S.mesh(fn, [-1.8, -0.75, -2.3], [1.8, 1.75, 3.0], 0.085)], 0.6), fpart('tooth', wyTeeth(up, false), 2), fpart('bone', horns, 1.5),
      fpart('eye', [ball(0.1, [0.98, 0.56, 1.3]), ball(0.1, [-0.98, 0.56, 1.3]), ball(0.065, [0.96, 0.8, 0.72]), ball(0.065, [-0.96, 0.8, 0.72])], 2), fpart('maw', [ball(1, [0, -0.47, 1.0], [0.85, 0.04, 1.5])], 1)];
  };
  GEAR.wyrmjaw = () => {
    const S = X.S, sm = S.smin;
    const fn = (x, y, z) => {
      const ax = Math.abs(x);
      let d = S.cone(x, y, z, 0, -0.25, -0.3, 0, -0.18, 2.0, 0.95, 0.42);
      d = sm(d, S.cap(ax, y, z, 0.85, -0.1, -0.6, 0.5, -0.1, 1.5, 0.26), 0.2);
      d = sm(d, S.sph(x, y, z, 0, -0.22, 2.0, 0.4), 0.2);
      d = S.cut(d, S.box(x, y, z, 0, 1.05, 0.8, 2.0, 1.0, 2.2, 0.08), 0.12);
      d = S.cut(d, S.cap(x, y, z, 0, 0.15, -0.2, 0, 0.12, 1.5, 0.3), 0.14);
      return d + Math.sin(x * 5.3 + z * 2.1) * Math.sin(y * 6.1 + z * 2.7) * 0.02;
    };
    const lo = [], w = (z) => 0.92 - (z + 0.3) * 0.22;
    [[0.2, 0.42], [0.7, 0.58], [1.2, 0.4], [1.65, 0.5]].forEach(([z, h]) => { for (const s of [-1, 1]) lo.push([s * (w(z) - 0.2), z, h, 0.1]); });
    for (const s of [-1, 1]) lo.push([s * 0.17, 2.08, 0.42, 0.09]);
    return [fpart('belly', [S.mesh(fn, [-1.3, -1.35, -1.05], [1.3, 0.25, 2.55], 0.085)], 0.6), fpart('tooth', wyTeeth(lo, true), 2), fpart('maw', [ball(1, [0, 0.03, 0.8], [0.66, 0.04, 1.25])], 1)];
  };
  GEAR.wyrmseg = () => {
    const sp = [tubeR([[0, 0.95, 0.1], [0, 1.5, 0.3], [0, 1.85, 0.75]], (t) => 0.16 * (1 - t) + 0.015, 6, 8)];
    for (const s of [-1, 1]) sp.push(tubeR([[s * 0.55, 0.8, 0.1], [s * 0.85, 1.15, 0.25], [s * 0.95, 1.3, 0.6]], (t) => 0.1 * (1 - t) + 0.012, 5, 7));
    return [fpart('skin', [lathe([[0.6, -1.05], [0.9, -0.9], [1.0, -0.45], [1.02, 0.0], [1.0, 0.35], [0.94, 0.62], [1.06, 0.68], [1.07, 0.82], [0.86, 0.98], [0.55, 1.08]], 22)], 0.7),
      fpart('bone', sp, 1.5), fpart('belly', [ball(1, [0, -0.6, 0], [0.68, 0.44, 0.84])], 0.7)];
  };
  // ---- the brood mother (bosses.js BroodMother), at its own measure: the abdomen an egg with grooves across its back and
  // spinnerets behind, drawn in to the waist in front; the fore-body a low carapace with a pit in its middle, the head rising before
  // it, the roots of the fangs under that; eight eyes, two of them large; a fang that curves in; legs in two lengths, each thick at
  // its root and drawn to a point, with the swell of a joint and a few bristles.
  GEAR.broodabd = () => {
    const S = X.S, sm = S.smin, ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    const fn = (x, y, z) => {
      let d = S.ell(x, y, z, 0, 0, 0, 2.0, 1.7, 2.4);
      d = sm(d, S.cone(x, y, z, 0, -0.5, -2.1, 0, -0.95, -2.9, 0.5, 0.12), 0.3);
      d = sm(d, S.cone(x, y, z, 0, -0.15, 1.9, 0, -0.4, 2.65, 0.75, 0.38), 0.3);
      let g = 0; for (const zi of [-1.35, -0.55, 0.25, 1.05]) g += Math.exp(-(z - zi) * (z - zi) / 0.018);
      return d + g * 0.07 * ss(-0.5, 0.5, y) + Math.sin(x * 4.3 + z * 3.1) * Math.sin(y * 5.1 - z * 2.3) * 0.025;
    };
    return [fpart('chit', [S.mesh(fn, [-2.25, -2.0, -3.1], [2.25, 1.95, 2.9], 0.11)], 0.5)];
  };
  GEAR.broodceph = () => {
    const S = X.S, sm = S.smin;
    const fn = (x, y, z) => {
      const ax = Math.abs(x);
      let d = S.ell(x, y, z, 0, -0.05, -0.1, 1.3, 0.85, 1.4);
      d = sm(d, S.ell(x, y, z, 0, 0.3, 0.75, 0.75, 0.6, 0.7), 0.3);
      d = S.cut(d, S.ell(x, y, z, 0, 0.98, -0.35, 0.3, 0.25, 0.5), 0.2);
      d = sm(d, S.cap(ax, y, z, 0.36, -0.3, 1.0, 0.36, -0.78, 1.36, 0.3), 0.15);
      for (let i = 0; i < 4; i++) d = sm(d, S.sph(ax, y, z, 1.0, -0.2, 0.75 - i * 0.6, 0.3), 0.14);   // the hips
      return d + Math.sin(x * 6.1 + z * 4.3) * Math.sin(y * 7.3 - z * 3.7) * 0.015;
    };
    const eyes = []; for (const s of [-1, 1]) { eyes.push(ball(0.12, [s * 0.2, 0.52, 1.36])); eyes.push(ball(0.075, [s * 0.47, 0.5, 1.2])); eyes.push(ball(0.07, [s * 0.36, 0.76, 1.12])); eyes.push(ball(0.06, [s * 0.14, 0.82, 1.14])); }
    return [fpart('chit', [S.mesh(fn, [-1.5, -1.2, -1.6], [1.5, 1.05, 1.75], 0.075)], 0.7), fpart('eye', eyes, 2)];
  };
  GEAR.broodfang = () => [fpart('chit', [tubeR([[0, 0.0, 0.2], [0, -0.5, 0.42], [0, -0.95, 0.2], [0, -1.15, -0.1]], (t) => 0.17 * (1 - t) + 0.02, 7, 12)], 1.5)];
  GEAR.broodleg1 = () => {
    const br = []; for (let i = 0; i < 5; i++) br.push(spike(0.025, 0.3, [0.5 + i * 0.42, 0.24 - i * 0.012, (i % 2 ? 0.08 : -0.08)], [0.3 * (i % 2 ? 1 : -1), 0, -0.5], 4));
    return [fpart('chit', [tubeR([[0, 0, 0], [0.9, 0.12, 0], [1.8, 0.07, 0], [2.4, 0, 0]], (t) => 0.27 - t * 0.1, 8, 12), ball(0.24, [2.4, 0, 0]), ball(0.3, [0, 0, 0])].concat(br), 1.2)];
  };
  GEAR.broodleg2 = () => {
    const br = []; for (let i = 0; i < 6; i++) br.push(spike(0.02, 0.26, [0.4 + i * 0.4, 0.16 - i * 0.018, (i % 2 ? 0.06 : -0.06)], [0.3 * (i % 2 ? 1 : -1), 0, -0.5], 4));
    return [fpart('chit', [tubeR([[0, 0, 0], [1.2, -0.1, 0], [2.4, -0.04, 0], [3.0, 0.06, 0]], (t) => 0.17 - t * 0.14, 7, 14), ball(0.14, [1.5, -0.09, 0])].concat(br), 1.2)];
  };
  // ---- what flies: a rocket, a launcher's shell, an arrow or bolt, a nail, a harpoon, a thrown spear, a boulder (combat.js, the
  // models of the shots). Forward is -z, at their own measure, about where their middles were. [{ g, m }]: m names one of the world's
  // materials (iron, brass, woodDark, cloth2, rock)
  const SHOT = {}, shotC = {};
  const vane = (w, h, len, y, z, a) => { const g = new THREE.BoxGeometry(w, h, len); g.translate(0, y, z); g.rotateZ(a); return g; };
  SHOT.rocket = () => {
    const fins = []; for (let i = 0; i < 4; i++) fins.push(vane(0.004, 0.075, 0.13, 0.072, 0.26, i * Math.PI / 2));
    return [{ g: Geo.merge([lathe([[0.0005, -0.34], [0.03, -0.34], [0.043, -0.3], [0.03, -0.27], [0.045, -0.24], [0.045, 0.24], [0.041, 0.36], [0.03, 0.45], [0.014, 0.5], [0.0005, 0.515]], 16)].concat(fins)), m: 'iron' },
      { g: Geo.merge([lathe([[0.0465, 0.2], [0.0465, 0.235], [0.045, 0.235], [0.045, 0.2]], 16), lathe([[0.0465, -0.2], [0.0465, -0.17], [0.045, -0.17], [0.045, -0.2]], 16)]), m: 'brass' }];
  };
  SHOT.grenade = () => [{ g: lathe([[0.0005, -0.105], [0.046, -0.105], [0.05, -0.09], [0.05, 0.01], [0.044, 0.06], [0.028, 0.1], [0.0005, 0.118]], 14), m: 'iron' }, { g: lathe([[0.052, -0.09], [0.052, -0.06], [0.05, -0.06], [0.05, -0.09]], 14), m: 'brass' }];
  SHOT.arrow = () => {
    const head = new THREE.ConeGeometry(0.02, 0.09, 4); head.rotateY(Math.PI / 4); head.scale(1, 1, 0.22); head.rotateX(-Math.PI / 2); head.translate(0, 0, -0.39);
    const vs = []; for (let i = 0; i < 3; i++) vs.push(vane(0.0018, 0.03, 0.11, 0.021, 0.27, i * Math.PI * 2 / 3));
    return [{ g: lathe([[0.0005, -0.35], [0.0065, -0.35], [0.0065, 0.345], [0.0005, 0.345]], 7), m: 'woodDark' }, { g: Geo.merge([head, lathe([[0.008, 0.3], [0.008, 0.345], [0.0065, 0.345], [0.0065, 0.3]], 7)]), m: 'iron' }, { g: Geo.merge(vs), m: 'cloth2' }];
  };
  SHOT.bolt = SHOT.arrow;
  SHOT.nail = () => [{ g: lathe([[0.0005, -0.062], [0.0105, -0.062], [0.0105, -0.056], [0.0042, -0.054], [0.0042, 0.04], [0.0005, 0.062]], 6), m: 'iron' }];
  SHOT.harpoon = () => {
    const barbs = []; for (const sgn of [-1, 1]) { const b = new THREE.ConeGeometry(0.012, 0.16, 4); b.rotateX(Math.PI / 2 + sgn * 0.0); b.rotateY(sgn * 0.42); b.translate(sgn * 0.035, 0, -0.5); barbs.push(b); }
    return [{ g: Geo.merge([lathe([[0.0005, -0.5], [0.011, -0.5], [0.011, 0.5], [0.019, 0.52], [0.012, 0.58], [0.0005, 0.66]], 8)].concat(barbs)), m: 'iron' }];
  };
  SHOT.spear = () => {
    const blade = lathe([[0.016, 0.88], [0.022, 0.9], [0.05, 1.02], [0.036, 1.14], [0.012, 1.25], [0.0005, 1.29]], 10); blade.scale(1, 0.26, 1);
    return [{ g: lathe([[0.0005, -0.9], [0.013, -0.9], [0.015, 0.0], [0.013, 0.9], [0.0005, 0.9]], 8), m: 'woodDark' }, { g: Geo.merge([blade, lathe([[0.018, 0.78], [0.02, 0.9], [0.013, 0.9], [0.013, 0.78]], 8), lathe([[0.0005, -0.96], [0.012, -0.93], [0.016, -0.9], [0.016, -0.84], [0.013, -0.84]], 8)]), m: 'iron' }];
  };
  SHOT.boulder = () => {
    const g = new THREE.IcosahedronGeometry(1, 2), ps = g.attributes.position, h = (x, y, z) => { const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return n - Math.floor(n); };
    const q = (v) => Math.round(v * 2.2) / 2.2;   // (broken in flats: corners that lie near one another are pushed alike)
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), f = 0.8 + 0.34 * h(q(x), q(y), q(z)) + 0.06 * h(x * 9, y * 9, z * 9); ps.setXYZ(i, x * f * 0.6, y * f * 0.55, z * f * 0.6); }
    g.computeVertexNormals(); return [{ g: boxUV(g, 1.2), m: 'rock' }];
  };
  X.shotGeo = function (kind) { if (shotC[kind] !== undefined) return shotC[kind]; let r = null; try { r = SHOT[kind] ? SHOT[kind]() : null; } catch (e) { console.warn('gfx: no shot', kind, e); (X.gearErr = X.gearErr || {})['shot_' + kind] = String(e); r = null; } return (shotC[kind] = r); };
  X.foeGear = function (name) { if (gearC[name] !== undefined) return gearC[name]; let r = null; try { r = GEAR[name] ? GEAR[name]() : null; } catch (e) { console.warn('gfx: no gear', name, e); r = null; } return (gearC[name] = r); };

  // ---- the furniture of the halls (props.js), in metres, standing on the origin and looking to +z: lists of parts { g, m (which of
  // the world's materials), tint }. What is carved - the statues - is cut from a field like the hands and the skull ----
  const PROP = {}, propC = {};
  const ppart = (m, list, k, tint) => ({ g: boxUV(Geo.merge(Array.isArray(list) ? list : [list]), k || 0.5), m, tint: tint || null });
  // (what is set down by the hundred is drawn with no more faces than it shows at a few metres: a box with its edges rounded in one strip
  // (makeCbox), a ball of w around and h down; a bar of iron with no ends where they are hidden in what holds it)
  const cbx = (w, h, d, r, x, y, z, rot) => Geo.xf(X.makeCbox(w, h, d, r), [x, y, z], rot);
  const ballN = (r, at, s, ws, hs) => { const g = new THREE.SphereGeometry(r, ws, hs); if (s) g.scale(s[0], s[1], s[2]); g.translate(at[0], at[1], at[2]); return g; };
  const bar = (r, len, at, rot, seg) => { const g = new THREE.CylinderGeometry(r, r, len, seg || 6, 1, true).toNonIndexed(); g.computeVertexNormals(); return Geo.xf(g, at, rot); };
  const arcPts = (cx, cy, r, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
  const turnY = (g, a) => { g.rotateY(a); return g; };
  // a knight of stone, both hands on the pommel of a sword stood before him, a cloak down his back. headless: broken off at the neck
  const knight = (headless) => () => {
    const S = X.S, sm = S.smin;
    const fn = (x, y, z) => {
      const ax = Math.abs(x), a = Math.atan2(x, z + 0.0001);
      let d = S.cone(ax, y, z, 0.11, 0.08, 0.0, 0.1, 0.98, 0.0, 0.085, 0.105);
      d = sm(d, S.box(ax, y, z, 0.13, 0.045, 0.06, 0.075, 0.045, 0.14, 0.035), 0.03);
      d = sm(d, S.ell(ax, y, z, 0.108, 0.55, 0.03, 0.095, 0.085, 0.105), 0.03);                          // knee cops
      d = sm(d, S.cone(x, y, z, 0, 0.56, 0, 0, 1.1, 0, 0.25, 0.2) + Math.sin(a * 12) * 0.007, 0.04);  // the skirt of the coat, in folds
      d = sm(d, S.ell(x, y, z, 0, 1.38, 0.01, 0.25, 0.3, 0.18), 0.07);
      d = sm(d, S.box(x, y, z, 0, 1.1, 0, 0.215, 0.035, 0.17, 0.03), 0.02);                         // belt
      d = sm(d, S.ell(ax, y, z, 0.3, 1.6, 0, 0.13, 0.1, 0.13), 0.04);
      d = sm(d, S.cone(ax, y, z, 0.31, 1.55, 0, 0.33, 1.2, 0.05, 0.068, 0.06), 0.03);
      d = sm(d, S.cone(ax, y, z, 0.33, 1.2, 0.05, 0.05, 1.19, 0.29, 0.056, 0.05), 0.03);
      d = sm(d, S.ell(x, y, z, 0, 1.19, 0.305, 0.09, 0.06, 0.065), 0.025);
      d = sm(d, S.cone(x, y, z, 0, 1.6, 0, 0, 1.76, 0.01, 0.095, 0.085), 0.04);
      if (!headless) {
        d = sm(d, S.cone(x, y, z, 0, 1.76, 0.012, 0, 1.97, 0.012, 0.128, 0.112), 0.02);
        d = sm(d, S.sph(x, y, z, 0, 1.975, 0.012, 0.108), 0.03);
        d = S.cut(d, S.box(x, y, z, 0, 1.89, 0.14, 0.09, 0.014, 0.05, 0.003), 0.008);                // the sight
        d = sm(d, S.box(x, y, z, 0, 1.9, 0.11, 0.014, 0.13, 0.03, 0.006), 0.012);                   // the bar down the face
      } else d = S.smax(d, y - 1.7 - Math.sin(x * 23) * 0.03 - Math.sin(z * 31) * 0.025, 0.01);
      d = sm(d, S.box(x, y, z, 0, 0.9, -0.16, 0.27 + (1.6 - y) * 0.07, 0.66, 0.03, 0.02) + Math.sin(x * 34) * 0.008, 0.05);   // the cloak
      return d;
    };
    return [ppart('trim', [S.mesh(fn, [-0.55, 0, -0.3], [0.55, 2.12, 0.42], 0.024), cbx(0.085, 1.1, 0.032, 0.008, 0, 0.56, 0.315), cbx(0.38, 0.045, 0.05, 0.012, 0, 1.115, 0.315)], 0.7, [0.95, 0.95, 0.92])];
  };
  PROP.statue0 = knight(false); PROP.statue3 = knight(true);
  // a mourner: a robe to the ground in folds, the arms crossed on the breast, the head bowed in a deep hood, a face far back in it
  PROP.statue1 = () => {
    const S = X.S, sm = S.smin;
    const fn = (x, y, z) => {
      const ax = Math.abs(x), a = Math.atan2(x, z + 0.0001), fold = (Math.sin(a * 11 + y * 2.5) * 0.013 + Math.sin(a * 5 - y * 1.7) * 0.008) * Math.max(0, Math.min(1, (1.3 - y) / 0.9));
      let d = S.cone(x, y, z, 0, 0.0, 0, 0, 1.25, 0, 0.37, 0.2) + fold;
      d = sm(d, S.ell(x, y, z, 0, 1.38, 0, 0.27, 0.24, 0.19), 0.1);
      d = sm(d, S.cone(ax, y, z, 0.27, 1.45, 0, 0.28, 1.12, 0.08, 0.085, 0.08), 0.05);
      d = sm(d, S.cone(ax, y, z, 0.28, 1.12, 0.08, 0.0, 1.21, 0.21, 0.075, 0.065), 0.04);
      d = sm(d, S.ell(x, y, z, 0, 1.73, 0.06, 0.155, 0.175, 0.175), 0.08);
      d = sm(d, S.cone(x, y, z, 0, 1.62, -0.08, 0, 1.3, -0.15, 0.13, 0.17), 0.08);                  // the hood's fall
      d = S.cut(d, S.ell(x, y, z, 0, 1.68, 0.25, 0.078, 0.105, 0.1), 0.03);                         // its hollow
      d = Math.min(d, S.ell(x, y, z, 0, 1.675, 0.125, 0.07, 0.095, 0.07));                            // the face in it
      return d;
    };
    return [ppart('trim', S.mesh(fn, [-0.5, 0, -0.42], [0.5, 2.0, 0.42], 0.025), 0.7, [0.95, 0.95, 0.92])];
  };
  // an angel of the graveyard: a long robe, the wings folded down its back to the calves, the head bowed, one hand on the breast
  PROP.statue2 = () => {
    const S = X.S, sm = S.smin;
    const fn = (x, y, z) => {
      const ax = Math.abs(x), a = Math.atan2(x, z + 0.0001), fold = Math.sin(a * 13 + y * 2) * 0.011 * Math.max(0, Math.min(1, (1.2 - y) / 0.8));
      let d = S.cone(x, y, z, 0, 0.0, 0, 0, 1.2, 0, 0.33, 0.19) + fold;
      d = sm(d, S.ell(x, y, z, 0, 1.36, 0, 0.24, 0.24, 0.17), 0.09);
      d = sm(d, S.cone(x, y, z, 0.25, 1.46, 0, 0.27, 1.1, 0.07, 0.075, 0.07), 0.05); d = sm(d, S.cone(x, y, z, 0.27, 1.1, 0.07, 0.02, 1.28, 0.19, 0.066, 0.055), 0.035);   // the hand on the breast
      d = sm(d, S.cone(x, y, z, -0.25, 1.46, 0, -0.29, 1.08, 0.04, 0.075, 0.07), 0.05); d = sm(d, S.cone(x, y, z, -0.29, 1.08, 0.04, -0.27, 0.8, 0.1, 0.066, 0.055), 0.035);
      d = sm(d, S.cone(x, y, z, 0, 1.56, 0, 0, 1.68, 0.03, 0.07, 0.065), 0.04);
      d = sm(d, S.ell(x, y, z, 0, 1.78, 0.06, 0.105, 0.13, 0.12), 0.03);                             // the head, bowed
      d = sm(d, S.ell(x, y, z, 0, 1.81, 0.0, 0.122, 0.125, 0.125) + Math.sin(a * 9 + y * 30) * 0.006, 0.02);   // the hair
      const wing = S.ell(ax, y, z + ax * 0.45, 0.25, 1.22, -0.15, 0.18, 0.82, 0.06) + (Math.sin(y * 27 - ax * 14) > 0 ? 0.008 : 0);
      d = sm(d, wing, 0.03);
      return d;
    };
    return [ppart('trim', S.mesh(fn, [-0.52, 0, -0.5], [0.52, 2.1, 0.4], 0.025), 0.7, [0.95, 0.95, 0.92])];
  };
  // headstones: a round-headed slab on a foot, lines of an inscription, a cross cut over them; a cross with a ring; a pointed slab
  const moss3 = (pts) => pts.map((p) => ball(p[3], [p[0], p[1], p[2]], [1, p[4], p[5]]));
  PROP.grave0 = () => [
    ppart('block', [ext([[0.34, 0], [0.34, 0.72]].concat(arcPts(0, 0.72, 0.34, 0, Math.PI, 14).slice(1), [[-0.34, 0]]), 0.16, 0.022), cbx(0.86, 0.12, 0.3, 0.03, 0, 0.06, 0)], 0.9),
    ppart('dark', [cbx(0.3, 0.014, 0.01, 0.002, 0, 0.7, 0.078), cbx(0.42, 0.014, 0.01, 0.002, 0, 0.62, 0.078), cbx(0.36, 0.014, 0.01, 0.002, 0.02, 0.54, 0.078), cbx(0.22, 0.014, 0.01, 0.002, -0.05, 0.46, 0.078),
      cbx(0.03, 0.17, 0.01, 0.002, 0, 0.9, 0.078), cbx(0.11, 0.03, 0.01, 0.002, 0, 0.925, 0.078)], 1),
    ppart('moss', moss3([[-0.22, 0.14, 0.07, 0.12, 0.7, 0.3], [0.25, 0.3, 0.075, 0.09, 1.2, 0.25], [0.1, 1.03, 0, 0.14, 0.3, 0.6], [-0.3, 0.75, -0.02, 0.08, 1.4, 0.9]]), 1, [0.4, 0.46, 0.36])];
  PROP.grave1 = () => {
    const c = [[0.07, 0], [0.085, 0.78], [0.3, 0.76], [0.33, 0.8], [0.33, 0.92], [0.3, 0.96], [0.085, 0.94], [0.075, 1.2], [0.11, 1.24], [-0.11, 1.24], [-0.075, 1.2], [-0.085, 0.94], [-0.3, 0.96], [-0.33, 0.92], [-0.33, 0.8], [-0.3, 0.76], [-0.085, 0.78], [-0.07, 0]];
    const ring = new THREE.TorusGeometry(0.2, 0.035, 6, 24); ring.scale(1, 1, 1.3); ring.translate(0, 0.86, 0);
    return [ppart('block', [ext(c, 0.14, 0.02), ring, cbx(0.5, 0.14, 0.34, 0.03, 0, 0.07, 0), cbx(0.36, 0.1, 0.26, 0.025, 0, 0.19, 0)], 0.9),
      ppart('moss', moss3([[0.2, 0.15, 0.1, 0.11, 0.6, 0.5], [-0.2, 0.94, 0.03, 0.09, 0.5, 0.7], [0.0, 1.25, 0, 0.1, 0.3, 0.7]]), 1, [0.4, 0.46, 0.36])];
  };
  PROP.grave2 = () => {
    const o = [[0.3, 0], [0.3, 0.5], [0.33, 0.52], [0.33, 0.58], [0.28, 0.6]].concat(arcPts(-0.18, 0.6, 0.46, 0, 1.17, 8).slice(1), arcPts(0.18, 0.6, 0.46, Math.PI - 1.17, Math.PI, 8), [[-0.33, 0.58], [-0.33, 0.52], [-0.3, 0.5], [-0.3, 0]]);
    return [ppart('trim', [ext(o, 0.22, 0.025), cbx(0.8, 0.1, 0.4, 0.03, 0, 0.05, 0)], 0.9),
      ppart('dark', [cbx(0.34, 0.012, 0.01, 0.002, 0, 0.44, 0.108), cbx(0.4, 0.012, 0.01, 0.002, 0, 0.37, 0.108), cbx(0.28, 0.012, 0.01, 0.002, 0, 0.3, 0.108), ext(arcPts(0, 0.72, 0.1, 0, Math.PI * 2, 16).slice(1), 0.01, 0, [arcPts(0, 0.72, 0.075, 0, Math.PI * 2, 12).slice(1)]).translate(0, 0, 0.108)], 1),
      ppart('moss', moss3([[-0.26, 0.1, 0.12, 0.13, 0.5, 0.4], [0.22, 0.55, 0.1, 0.08, 1.1, 0.3]]), 1, [0.4, 0.46, 0.36])];
  };
  // a candle: one high, one about - a little guttered at its head, wax run down one side and set at the foot
  PROP.candle = () => {
    const g = new THREE.LatheGeometry(spl([[0.0005, -0.5], [1.5, -0.5], [1.55, -0.46], [1.12, -0.38], [1.02, -0.2], [1.0, 0.3], [1.04, 0.47], [0.9, 0.5], [0.55, 0.46], [0.0005, 0.44]], 18), 10);
    const ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), a = Math.atan2(z, x), run = Math.max(0, Math.cos(a - 0.9)) * Math.max(0, Math.sin((y + 0.5) * 2.6)) * 0.34 + Math.max(0, Math.cos(a + 2.2)) * Math.max(0, 0.2 - y) * 0.3; ps.setX(i, x * (1 + run)); ps.setZ(i, z * (1 + run)); }
    g.computeVertexNormals();
    const wick = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 4); wick.translate(0, 0.49, 0);
    return [{ g, m: 'candle' }, { g: wick, m: 'dark' }];
  };
  // a wall torch: an iron plate nailed to the wall, a bent arm, a ring with three claws, a brand of wood wound with pitched rag.
  // The wall is at the origin, the brand stands out to +z (its flame at about z 0.38, y 0.5)
  PROP.sconce = () => {
    const iron = [ext([[0.07, -0.16], [0.085, -0.02], [0.06, 0.13], [0, 0.2], [-0.06, 0.13], [-0.085, -0.02], [-0.07, -0.16], [0, -0.23]], 0.016, 0.004).translate(0, 0, 0.008),
      tubeR([[0, -0.04, 0.01], [0, -0.07, 0.14], [0, -0.01, 0.26], [0, 0.04, 0.3]], 0.017, 6, 8), tubeR([[0, -0.2, 0.012], [0, -0.14, 0.12], [0, -0.07, 0.17]], 0.011, 5, 6)];
    for (const y of [-0.1, 0.1]) iron.push(ballN(0.014, [0, y, 0.018], [1, 1, 0.6], 8, 5));
    const ring = new THREE.TorusGeometry(0.058, 0.011, 5, 14); ring.rotateX(HX); ring.translate(0, 0.06, 0.3); iron.push(ring);
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.5; iron.push(tubeR([[Math.cos(a) * 0.058, 0.06, 0.3 + Math.sin(a) * 0.058], [Math.cos(a) * 0.075, 0.16, 0.31 + Math.sin(a) * 0.075], [Math.cos(a) * 0.06, 0.24, 0.325 + Math.sin(a) * 0.06]], 0.008, 4, 6)); }
    const brand = tubeR([[0, -0.12, 0.26], [0, 0.1, 0.31], [0, 0.34, 0.365]], (t) => 0.03 + t * 0.012, 7, 6);
    const head = [ballN(0.07, [0, 0.42, 0.385], [1, 1.35, 1], 10, 7)]; for (let i = 0; i < 4; i++) { const r = new THREE.TorusGeometry(0.064 - Math.abs(i - 1.5) * 0.006, 0.012, 5, 10); r.rotateX(HX + 0.22 + (i % 2) * 0.12); r.translate(0, 0.365 + i * 0.035, 0.372 + i * 0.008); head.push(r); }
    return [ppart('iron', iron, 3), ppart('woodDark', brand, 2), ppart('dark', head, 3, [0.16, 0.1, 0.07])];
  };
  // a brazier: three legs of wrought iron bowed out and tied with a ring, a basket of bars on them, coals heaped in it. One high
  PROP.brazier = () => {
    const iron = [], coal = [];
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.3, c = Math.cos(a), s = Math.sin(a); iron.push(tubeR([[c * 0.4, 0, s * 0.4], [c * 0.3, 0.08, s * 0.3], [c * 0.13, 0.36, s * 0.13], [c * 0.16, 0.56, s * 0.16], [c * 0.3, 0.72, s * 0.3]], 0.022, 6, 10), ballN(0.035, [c * 0.4, 0.02, s * 0.4], [1.3, 0.6, 1.3], 10, 6)); }
    const tie = new THREE.TorusGeometry(0.14, 0.014, 5, 16); tie.rotateX(HX); tie.translate(0, 0.37, 0); iron.push(tie);
    for (const [y, r, t] of [[0.72, 0.31, 0.018], [0.86, 0.39, 0.014], [1.0, 0.43, 0.02]]) { const g = new THREE.TorusGeometry(r, t, 5, 24); g.rotateX(HX); g.translate(0, y, 0); iron.push(g); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); iron.push(tubeR([[c * 0.2, 0.7, s * 0.2], [c * 0.31, 0.72, s * 0.31], [c * 0.39, 0.86, s * 0.39], [c * 0.43, 1.0, s * 0.43], [c * 0.45, 1.06, s * 0.45]], 0.011, 4, 7)); }
    iron.push(hl([[0.0005, 0.69], [0.2, 0.69], [0.22, 0.705], [0.2, 0.72], [0.0005, 0.72]], 1, 1, 16));
    for (let i = 0; i < 11; i++) { const a = i * 2.4, r = 0.06 + (i % 4) * 0.075, g = new THREE.DodecahedronGeometry(0.075 + (i % 3) * 0.022, 0); g.rotateX(i); g.rotateY(i * 2); g.translate(Math.cos(a) * r, 0.8 + (i % 3) * 0.045 - r * 0.12, Math.sin(a) * r); coal.push(g); }
    return [ppart('iron', iron, 3), ppart('dark', coal, 3, [0.3, 0.12, 0.05])];
  };
  // a ring of iron hung by four rods from a boss, a lesser ring inside it, eight pans with their prickets round the rim. The candles
  // stand at 1.1 from its middle, their feet at 0.025
  PROP.chandelier = () => {
    const iron = [];
    for (const [r, hh, t] of [[1.1, 0.07, 0.014], [0.6, 0.05, 0.012]]) iron.push(hl([[r - t, -hh / 2], [r + t, -hh / 2], [r + t * 1.6, 0], [r + t, hh / 2], [r - t, hh / 2], [r - t * 1.6, 0], [r - t, -hh / 2]], 1, 1, r > 1 ? 32 : 28));
    for (let i = 0; i < 4; i++) { const a = i * HX, c = Math.cos(a), s = Math.sin(a); iron.push(tubeR([[c * 1.1, 0, s * 1.1], [c * 0.6, 0.02, s * 0.6], [c * 0.2, 0.1, s * 0.2]], 0.014, 5, 6), tubeR([[c * 1.1, 0.03, s * 1.1], [c * 0.6, 0.62, s * 0.6], [c * 0.06, 1.2, s * 0.06]], 0.011, 5, false)); }
    iron.push(ball(0.07, [0, 1.2, 0], [1, 1.2, 1]), ball(0.09, [0, 0.1, 0], [1, 0.6, 1]), spike(0.035, 0.2, [0, -0.02, 0], [Math.PI, 0, 0], 6));
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = Math.cos(a) * 1.1, s = Math.sin(a) * 1.1; iron.push(Geo.xf(hl([[0.0005, 0.0], [0.03, 0.0], [0.075, 0.02], [0.08, 0.03], [0.07, 0.03], [0.03, 0.015], [0.0005, 0.015]], 1, 1, 10), [c, 0.01, s])); iron.push(Geo.xf(new THREE.TorusGeometry(0.03, 0.008, 4, 8, Math.PI), [c * 1.04, -0.03, s * 1.04], [0, -a + HX, 0])); }
    return [ppart('iron', iron, 3)];
  };
  // a column: a shaft that swells a little below its middle, fluted (one high, one in radius); a base of two rolls and a hollow, a
  // capital of a roll under a spreading bell (each one high and one in radius, to be sized)
  PROP.shaft = () => {
    const g = new THREE.LatheGeometry([[0.99, -0.5], [1.0, -0.25], [0.985, 0.1], [0.94, 0.5]].map((q) => new THREE.Vector2(q[0], q[1])), 96), ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), z = ps.getZ(i), a = Math.atan2(z, x), k = 1 - 0.06 * Math.pow(Math.abs(Math.sin(a * 8)), 1.6); ps.setX(i, x * k); ps.setZ(i, z * k); }
    g.computeVertexNormals(); return [{ g, m: 'trim' }];
  };
  PROP.colbase = () => [{ g: new THREE.LatheGeometry(spl([[0.0005, -0.5], [1.18, -0.5], [1.26, -0.36], [1.18, -0.2], [1.02, -0.12], [0.98, 0.0], [1.06, 0.12], [1.12, 0.26], [1.06, 0.4], [0.98, 0.5], [0.0005, 0.5]], 30), 24), m: 'trim' }];
  PROP.colcap = () => [{ g: new THREE.LatheGeometry(spl([[0.0005, -0.5], [0.94, -0.5], [1.02, -0.4], [0.96, -0.28], [0.95, -0.16], [1.04, 0.1], [1.2, 0.36], [1.24, 0.44], [1.24, 0.5], [0.0005, 0.5]], 30), 24), m: 'trim' }];
  // ---- (2) what is built of boards and bars ----
  // things made for a hand or a foe (foeGear, meleeParts), stood in a rack or laid on a table: copied, turned, sorted by the world's materials
  const WM = { wood: ['woodDark'], iron: ['iron'], steel: ['iron'], blade: ['iron', [1.5, 1.5, 1.55]], leather: ['woodDark', [0.55, 0.5, 0.45]], wrap: ['woodDark', [0.55, 0.5, 0.45]], dark: ['dark'], cloth: ['bone', [0.4, 0.12, 0.1]], paint: ['wood', [0.5, 0.26, 0.22]], gold: ['iron', [1.1, 0.95, 0.7]], goldBr: ['iron', [1.1, 0.95, 0.7]], trim: ['iron'], bone: ['bone'] };
  const borrow = (out, parts, p, r, s) => { for (const q of parts || []) { const g = q.g.clone(); if (q.at) g.translate(q.at[0], q.at[1], q.at[2]); Geo.xf(g, p, r, s); const k = WM[q.m] || ['iron']; (out[k[0] + '|' + (k[1] || '')] = out[k[0] + '|' + (k[1] || '')] || { m: k[0], tint: k[1] || null, list: [] }).list.push(g); } };
  const sorted = (out, k) => Object.values(out).map((o) => ({ g: Geo.merge(o.list), m: o.m, tint: o.tint }));
  // a bookcase: two sides, a plinth, a cornice, four shelves, a back. Two long, the shelves' tops at 0.12 + 0.58 n
  PROP.shelf = () => {
    const L = 2.0, D = 0.45, H = 2.4, w = [];
    for (const s of [-1, 1]) w.push(cbx(0.07, H - 0.06, D, 0.012, s * (L / 2 - 0.035), (H - 0.06) / 2, 0));
    w.push(cbx(L, 0.1, D + 0.02, 0.012, 0, 0.05, 0.01), cbx(L + 0.1, 0.07, D + 0.07, 0.014, 0, H - 0.035, 0.02), cbx(L + 0.04, 0.05, D + 0.04, 0.012, 0, H - 0.09, 0.012));
    for (let i = 0; i < 4; i++) w.push(cbx(L - 0.12, 0.04, D - 0.03, 0.006, 0, 0.1 + i * 0.58, 0));
    w.push(cbx(L - 0.1, H - 0.12, 0.025, 0.004, 0, H / 2, -D / 2 + 0.014));
    return [ppart('woodDark', w, 0.8)];
  };
  // a book: one thick (x), one high, one deep, standing on the origin, its rounded spine to +z with two bands on it; the leaves a little
  // lower than the boards
  PROP.book = () => {
    const c = ext([[-0.5, 0.5], [-0.5, -0.46], [-0.42, -0.52], [0, -0.55], [0.42, -0.52], [0.5, -0.46], [0.5, 0.5], [0.36, 0.5], [0.36, -0.44], [-0.36, -0.44], [-0.36, 0.5]], 1, 0.012); c.rotateX(-HX); c.translate(0, 0.5, 0);
    const bands = [cbx(1.06, 0.03, 0.07, 0.01, 0, 0.22, 0.5), cbx(1.06, 0.03, 0.07, 0.01, 0, 0.78, 0.5)];
    return [{ g: boxUV(Geo.merge([c].concat(bands)), 3), m: 'bone' }, { g: boxUV(Geo.xf(new THREE.BoxGeometry(0.72, 0.95, 0.9), [0, 0.485, -0.02]), 3), m: 'bone', tint: [0.8, 0.74, 0.58] }];
  };
  // a long table of four boards on four legs, aprons under the top, a stretcher low between the ends. 2.2 by 1.0, its top at 0.86
  PROP.table = () => {
    const top = [], dk = [];
    for (let i = 0; i < 4; i++) top.push(cbx(2.2 - (i % 2) * 0.05, 0.07, 0.244, 0.012, (i % 2 ? 0.02 : -0.01), 0.825, -0.375 + i * 0.25));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) dk.push(cbx(0.11, 0.79, 0.11, 0.018, sx * 0.98, 0.395, sz * 0.38));
    for (const sz of [-1, 1]) dk.push(cbx(1.9, 0.12, 0.04, 0.008, 0, 0.72, sz * 0.38));
    for (const sx of [-1, 1]) dk.push(cbx(0.04, 0.12, 0.7, 0.008, sx * 0.98, 0.72, 0), cbx(0.05, 0.07, 0.7, 0.01, sx * 0.98, 0.18, 0));
    dk.push(cbx(1.92, 0.07, 0.05, 0.01, 0, 0.18, 0));
    return [ppart('wood', top, 0.7), ppart('woodDark', dk, 0.8)];
  };
  // a bench: a board two long on two board legs, a rail between them. Its seat at 0.48
  PROP.bench = () => [ppart('woodDark', [cbx(2.0, 0.06, 0.36, 0.012, 0, 0.45, 0), cbx(0.05, 0.42, 0.3, 0.01, -0.75, 0.21, 0), cbx(0.05, 0.42, 0.3, 0.01, 0.75, 0.21, 0), cbx(1.5, 0.07, 0.04, 0.008, 0, 0.24, 0)], 0.8)];
  // what lies on a table: an open book with a pen and an inkpot; three books in a heap and a cup; a platter, a knife, two scrolls
  PROP.tablet0 = () => {
    const quill = ext([[0, 0], [0.012, 0.03], [0.02, 0.2], [0.004, 0.26], [-0.014, 0.2], [-0.008, 0.03]], 0.003, 0); quill.rotateX(-HX + 0.25); quill.rotateY(0.6); quill.translate(0.33, 0.07, 0.02);
    return [ppart('bone', [cbx(0.44, 0.012, 0.3, 0.004, 0, 0.006, 0)], 3, [0.35, 0.16, 0.12]),
      ppart('bone', [cbx(0.2, 0.03, 0.28, 0.008, -0.105, 0.03, 0, [0, 0, 0.07]), cbx(0.2, 0.03, 0.28, 0.008, 0.105, 0.03, 0, [0, 0, -0.07]), quill], 3, [0.82, 0.76, 0.6]),
      ppart('dark', [hl([[0.0005, 0], [0.035, 0], [0.04, 0.03], [0.022, 0.055], [0.022, 0.065], [0.0005, 0.065]], 1, 1, 10).translate(0.33, 0, 0.02),
        cbx(0.14, 0.002, 0.004, 0.001, -0.1, 0.047, 0.06, [0, 0.1, 0.07]), cbx(0.15, 0.002, 0.004, 0.001, -0.105, 0.047, 0.02, [0, 0.05, 0.07]), cbx(0.12, 0.002, 0.004, 0.001, -0.11, 0.047, -0.02, [0, -0.05, 0.07]), cbx(0.15, 0.002, 0.004, 0.001, 0.105, 0.047, 0.05, [0, 0, -0.07]), cbx(0.1, 0.002, 0.004, 0.001, 0.09, 0.047, 0.0, [0, 0.08, -0.07])], 3)];
  };
  PROP.tablet1 = () => [
    ppart('bone', [cbx(0.3, 0.05, 0.22, 0.01, 0, 0.025, 0), cbx(0.26, 0.04, 0.2, 0.01, 0.02, 0.115, 0.01, [0, 0.5, 0])], 3, [0.3, 0.2, 0.14]),
    ppart('bone', [cbx(0.28, 0.045, 0.21, 0.01, -0.01, 0.073, 0, [0, -0.25, 0])], 3, [0.16, 0.22, 0.3]),
    ppart('iron', [hl([[0.0005, 0], [0.04, 0], [0.042, 0.008], [0.012, 0.02], [0.01, 0.06], [0.03, 0.075], [0.042, 0.13], [0.04, 0.132], [0.027, 0.08], [0.0005, 0.072]], 1, 1, 12).translate(0.32, 0, 0.08)], 4, [1.1, 1.05, 0.95])];
  PROP.tablet2 = () => {
    const o = {}; borrow(o, X.meleeParts && X.meleeParts('knife') ? X.meleeParts('knife').parts : [], [0.02, 0.022, 0.03], [HX, 0, 1.2]);
    return sorted(o).concat([ppart('wood', [hl([[0.0005, 0], [0.1, 0], [0.16, 0.012], [0.17, 0.022], [0.16, 0.022], [0.1, 0.012], [0.0005, 0.01]], 1, 1, 18)], 3),
      ppart('bone', [prism(0.022, 0.3, [-0.3, 0.022, 0.05], [HX, 0.4, 0], 8), prism(0.02, 0.26, [-0.27, 0.055, 0.04], [HX, 0.25, 0], 8)], 3, [0.82, 0.76, 0.6])]);
  };
  // a cage of iron bars, 1.4 square and 2.2 high (its floor plate is the world's own): corner posts, bars between them, four rails,
  // bars over the top, a door frame in its front with a lock, a ring to hang it by
  PROP.cage = () => {
    const s = 1.4, h = 2.2, hs = s / 2, ir = [], n = 7;
    for (let i = 0; i <= n; i++) { const t = -hs + i / n * s, end = i === 0 || i === n, r = end ? 0.028 : 0.014; for (const [bx, bz] of end ? [[t, -hs], [t, hs]] : [[t, -hs], [t, hs], [-hs, t], [hs, t]]) ir.push(bar(r, h - 0.14, [bx, h / 2 + 0.03, bz], null, 6)); }
    for (const y of [0.13, 0.8, 1.5, h - 0.05]) for (const [x, z, w, d] of [[0, -hs, s + 0.07, 0.04], [0, hs, s + 0.07, 0.04], [-hs, 0, 0.04, s + 0.07], [hs, 0, 0.04, s + 0.07]]) ir.push(cbx(w, y > 2 ? 0.09 : 0.035, d, 0.006, x, y, z));
    for (let i = 1; i < n; i++) ir.push(bar(0.012, s, [-hs + i / n * s, h - 0.03, 0], [HX, 0, 0], 5));
    ir.push(cbx(0.055, 1.62, 0.055, 0.008, -0.3, 0.92, hs + 0.02), cbx(0.055, 1.62, 0.055, 0.008, 0.3, 0.92, hs + 0.02), cbx(0.66, 0.055, 0.055, 0.008, 0, 1.72, hs + 0.02), cbx(0.13, 0.17, 0.06, 0.012, 0.3, 0.95, hs + 0.055));
    for (const y of [0.4, 1.4]) ir.push(prism(0.022, 0.12, [-0.3, y, hs + 0.05], null, 6));
    const ring = new THREE.TorusGeometry(0.08, 0.014, 6, 14); ring.translate(0, h + 0.07, 0); ir.push(ring, cbx(0.16, 0.03, 0.16, 0.006, 0, h + 0.005, 0));
    return [ppart('iron', ir, 2), ppart('dark', ballN(0.014, [0.3, 0.93, hs + 0.086], [1, 1.6, 0.4], 8, 6), 2)];
  };
  // over a well 1.3 in radius: a coping on its wall, two posts and a beam, a pitched roof of boards with its ridge, a windlass with
  // its rope and crank, a bucket hung from it
  PROP.wellhead = () => {
    const r = 1.3, st = [], wd = [], ir = [], lt = [];
    const oct = (rr) => arcPts(0, 0, rr / Math.cos(Math.PI / 8), Math.PI / 8, Math.PI / 8 + Math.PI * 2, 8).slice(1);
    const cop = ext(oct(r + 0.07), 0.14, 0.02, [oct(r - 0.3)]); cop.rotateX(-HX); cop.translate(0, 0.93, 0); st.push(cop);
    for (const s of [-1, 1]) { wd.push(cbx(0.2, 2.15, 0.2, 0.025, s * (r - 0.15), 0.9 + 1.075, 0), cbx(0.1, 0.6, 0.1, 0.015, s * (r - 0.42), 2.72, 0, [0, 0, s * 0.75])); }
    wd.push(cbx(2 * r + 0.3, 0.16, 0.18, 0.02, 0, 2.98, 0), cbx(2 * r + 0.7, 0.1, 0.1, 0.015, 0, 3.42, 0));
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) lt.push(cbx(2 * r + 0.62, 0.035, 0.17, 0.006, 0, 3.36 - i * 0.075, s * (0.09 + i * 0.15), [s * 0.46, 0, 0]));
    wd.push(prism(0.085, 2 * r - 0.5, [0, 2.2, 0], [0, 0, HX], 10));
    for (let i = 0; i < 7; i++) { const g = new THREE.TorusGeometry(0.095, 0.018, 5, 12); g.rotateY(HX); g.translate(-0.12 + i * 0.04, 2.2, 0); lt.push(g); }
    lt.push(prism(0.016, 0.72, [0, 1.76, 0.09], null, 6));
    ir.push(tubeR([[r - 0.25, 2.2, 0], [r + 0.08, 2.2, 0], [r + 0.08, 1.95, 0], [r + 0.3, 1.95, 0]], 0.02, 6, false), tubeR([[-0.11, 1.4, 0.09], [-0.13, 1.56, 0.09], [0, 1.66, 0.09], [0.13, 1.56, 0.09], [0.11, 1.4, 0.09]], 0.01, 5, 12));
    wd.push(hl([[0.0005, 1.1], [0.1, 1.1], [0.125, 1.25], [0.13, 1.4], [0.115, 1.4], [0.105, 1.26], [0.085, 1.13], [0.0005, 1.13]], 1, 1, 12).translate(0, 0, 0.09));
    for (const y of [1.16, 1.34]) { const g = new THREE.TorusGeometry(y > 1.2 ? 0.13 : 0.112, 0.008, 4, 14); g.rotateX(HX); g.translate(0, y, 0.09); ir.push(g); }
    return [ppart('trim', st, 0.6), ppart('woodDark', wd, 0.8), ppart('wood', lt, 0.8), ppart('iron', ir, 2)];
  };
  // a weapon rack two long: two posts, a rail above with pegs, a rest below; two pikes, a great sword point down, an axe, a shield
  PROP.rack = () => {
    const wd = [cbx(0.09, 1.66, 0.09, 0.014, -0.94, 0.94, -0.1), cbx(0.09, 1.66, 0.09, 0.014, 0.94, 0.94, -0.1), cbx(1.96, 0.1, 0.07, 0.012, 0, 1.55, -0.1), cbx(1.96, 0.07, 0.12, 0.012, 0, 0.5, -0.08)];
    for (let i = -5; i <= 5; i++) wd.push(prism(0.014, 0.1, [i * 0.17, 1.55, -0.04], [HX, 0, 0], 6));
    const o = {};
    if (X.foeGear) {
      borrow(o, X.foeGear('pike'), [-0.72, 0.84, -0.02], [-HX - 0.03, 0, 0.02]); borrow(o, X.foeGear('pike'), [-0.4, 0.84, -0.02], [-HX - 0.03, 0, -0.03]);
      borrow(o, X.foeGear('greatsword'), [0.0, 1.5, 0.0], [HX + 0.04, HX, 0]);
      borrow(o, X.foeGear('kite'), [0.66, 0.68, 0.1], [-0.2, 0.1, 0.03], 0.9);
    }
    if (X.meleeParts && X.meleeParts('axe')) borrow(o, X.meleeParts('axe').parts, [0.3, 0.42, 0.0], [-0.04, HX, 0.03], 1.7);
    return [ppart('woodDark', wd, 0.8)].concat(sorted(o));
  };
  // the floor of a spike trap, two square: four iron plates, a hole for each spike (six by six), a frame of flat bar, nails
  PROP.spikeplate = () => {
    const s = 2, ir = [], dk = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ir.push(cbx(s / 2 - 0.02, 0.024, s / 2 - 0.02, 0.004, sx * s / 4, 0.012, sz * s / 4));
    for (const [x, z, w, d] of [[0, -s / 2 + 0.03, s, 0.07], [0, s / 2 - 0.03, s, 0.07], [-s / 2 + 0.03, 0, 0.07, s], [s / 2 - 0.03, 0, 0.07, s]]) ir.push(cbx(w, 0.036, d, 0.006, x, 0.018, z));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [0.1, 0.5, 0.9]) { ir.push(ballN(0.014, [sx * (s / 2 - 0.03), 0.036, sz * k * (s / 2 - 0.06)], [1, 0.5, 1], 8, 5), ballN(0.014, [sx * k * (s / 2 - 0.06), 0.036, sz * (s / 2 - 0.03)], [1, 0.5, 1], 8, 5)); }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { const g = new THREE.CylinderGeometry(0.062, 0.062, 0.004, 10); g.translate(-s / 2 + (i + 0.5) * s / 6, 0.026, -s / 2 + (j + 0.5) * s / 6); dk.push(g); }
    return [ppart('iron', ir, 1, [0.5, 0.45, 0.4]), ppart('dark', dk, 1)];
  };
  // one spike of it: four-sided, drawn to a point, on a round foot (0.6 long about its middle)
  PROP.spike = () => { const a = new THREE.ConeGeometry(0.042, 0.52, 4).toNonIndexed(); a.computeVertexNormals(); a.translate(0, 0.04, 0); const b = new THREE.CylinderGeometry(0.046, 0.055, 0.1, 8); b.translate(0, -0.25, 0); return [{ g: boxUV(Geo.merge([a, b]), 3), m: 'iron' }]; };
  // a board one long, one wide (y), one thick (z), about its middle, its ends split and broken; a stake one high, cut to a point
  PROP.plank = () => [{ g: boxUV(ext([[-0.5, -0.5], [0.47, -0.5], [0.5, -0.2], [0.46, 0.05], [0.495, 0.2], [0.48, 0.5], [-0.49, 0.5], [-0.46, 0.25], [-0.5, 0.1], [-0.47, -0.2]], 1, 0.06), 1), m: 'wood' }];
  PROP.stake = () => { const g = Geo.merge([Geo.xf(new THREE.BoxGeometry(1, 0.86, 1), [0, 0.43, 0]), Geo.xf(new THREE.ConeGeometry(0.72, 0.16, 4).toNonIndexed(), [0, 0.93, 0], [0, Math.PI / 4, 0])]); g.computeVertexNormals(); return [{ g: boxUV(g, 1), m: 'woodDark' }]; };
  // a drain in the floor, one square: a frame, six bars, the dark under them
  PROP.drain = () => {
    const ir = [cbx(1, 0.03, 0.08, 0.006, 0, 0.015, -0.46), cbx(1, 0.03, 0.08, 0.006, 0, 0.015, 0.46), cbx(0.08, 0.03, 1, 0.006, -0.46, 0.015, 0), cbx(0.08, 0.03, 1, 0.006, 0.46, 0.015, 0)];
    for (let i = 0; i < 6; i++) ir.push(cbx(0.05, 0.022, 0.86, 0.008, -0.34 + i * 0.136, 0.014, 0));
    return [ppart('iron', ir, 1, [0.45, 0.45, 0.45]), ppart('dark', cbx(0.86, 0.004, 0.86, 0.001, 0, 0.004, 0), 1)];
  };
  // ---- (3) cloth, bones, crystal ----
  // a banner one long hanging from the origin, 1.1 wide: in folds, its foot cut to two tails and frayed (uv across and down it, as
  // the plain sheet it replaces had); the device on it - a ring and a cross - a hair before the cloth
  PROP.banner = () => {
    const g = sheet(-1, 0, () => 0.55, (x, v, u) => Math.sin(u * 6.5) * 0.03 * (1 - v * 0.7) + Math.sin(u * 2.3 + 1) * 0.02 * (1 - v), 12, 14, 0, (u) => 0.16 * (1 - Math.abs(u)) * (1 - Math.abs(u)) * 1.6 + 0.03 * Math.sin(u * 23) - 0.02);
    const ps = g.attributes.position, uv = new Float32Array(ps.count * 2); for (let i = 0; i < ps.count; i++) { uv[i * 2] = ps.getX(i) / 1.1 + 0.5; uv[i * 2 + 1] = ps.getY(i) + 1; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const dv = Geo.merge([ext(arcPts(0, -0.36, 0.2, 0, Math.PI * 2, 24).slice(1), 0.004, 0, [arcPts(0, -0.36, 0.15, 0, Math.PI * 2, 20).slice(1)]), cbx(0.05, 0.42, 0.004, 0.001, 0, -0.36, 0), cbx(0.26, 0.05, 0.004, 0.001, 0, -0.3, 0)]); dv.translate(0, 0, 0.035);
    return [{ g, m: 'cloth' }, { g: dv, m: 'dark' }];
  };
  // a rug one square: its field, a border let into it, a fringe at both ends
  PROP.rug = () => {
    const fr = []; for (let i = 0; i < 24; i++) for (const s of [-1, 1]) fr.push(cbx(0.012, 0.008, 0.07, 0.002, -0.48 + i / 23 * 0.96, 0.005, s * 0.535, [0, (i % 3 - 1) * 0.15, 0]));
    return [ppart('cloth2', cbx(1, 0.018, 1, 0.004, 0, 0.009, 0), 1), ppart('cloth2', [cbx(0.9, 0.004, 0.04, 0.001, 0, 0.02, -0.42), cbx(0.9, 0.004, 0.04, 0.001, 0, 0.02, 0.42), cbx(0.04, 0.004, 0.88, 0.001, -0.43, 0.02, 0), cbx(0.04, 0.004, 0.88, 0.001, 0.43, 0.02, 0),
      Geo.xf(cbx(0.2, 0.004, 0.2, 0.001, 0, 0.02, 0), null, [0, Math.PI / 4, 0])], 1, [1.9, 1.6, 1.0]), ppart('cloth2', fr, 1, [1.6, 1.4, 1.1])];
  };
  // a long bone, one long and one in radius about its middle: a thin shaft, knobbed ends. Ribs: two bows of bone lying on the floor
  PROP.longbone = () => [{ g: new THREE.LatheGeometry([[0.0005, -0.5], [1.3, -0.5], [1.75, -0.465], [1.6, -0.42], [1.0, -0.36], [0.85, 0], [1.0, 0.36], [1.6, 0.42], [1.75, 0.465], [1.3, 0.5], [0.0005, 0.5]].map((q) => new THREE.Vector2(q[0], q[1])), 6), m: 'bone' }];
  PROP.ribs = () => { const l = []; for (let i = 0; i < 3; i++) { const g = new THREE.TorusGeometry(0.17 - i * 0.02, 0.011, 4, 10, 2.3); g.rotateX(-HX + 0.15); g.rotateY(i * 0.5); g.translate(i * 0.06, 0.012, i * 0.05); l.push(g); } return [ppart('bone', l, 3)]; };
  // a crystal, two high and one in radius about its middle: a six-sided column, its faces unequal, drawn to a point off its axis
  PROP.crystal = () => {
    const g = new THREE.CylinderGeometry(0.8, 1, 1.5, 6, 1).toNonIndexed(); g.translate(0, -0.25, 0);
    const t = new THREE.ConeGeometry(0.8, 0.5, 6).toNonIndexed(); t.translate(0, 0.75, 0);
    const m = Geo.merge([g, t]), ps = m.attributes.position; for (let i = 0; i < ps.count; i++) { const y = ps.getY(i); if (y > 0.9) { ps.setX(i, 0.22); ps.setZ(i, -0.12); } else { const x = ps.getX(i), z = ps.getZ(i); ps.setX(i, x * (1 + 0.12 * Math.sin(Math.atan2(z, x) * 3 + 1))); } }
    m.computeVertexNormals(); return [{ g: m, m: 'ice' }];
  };
  // a tuft of grass, one high and about one across: blades from one root, each bent outward and drawn to a point, dark at the foot
  PROP.tuft = () => {
    const L = [], C = [];
    for (let i = 0; i < 8; i++) {
      const a = i * 2.4, len = 0.5 + ((i * 7) % 5) * 0.12, lean = 0.2 + ((i * 3) % 4) * 0.17, w = 0.016 + (i % 3) * 0.006;
      const g = sheet(0, len, (v) => w * (1 - v * v * 0.96) + 0.001, (x, v) => v * v * lean + x * 1.5 * (i % 2 ? 1 : -1) * v, 3, 1, 0);
      Geo.xf(g, [Math.cos(a) * 0.08 * (i % 4), 0, Math.sin(a) * 0.08 * (i % 4)], [0, a, 0]); L.push(g);
    }
    const g = Geo.merge(L), ps = g.attributes.position, col = new Float32Array(ps.count * 3);
    for (let i = 0; i < ps.count; i++) { const k = 0.34 + 0.66 * Math.min(1, ps.getY(i) / 0.7); col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.9; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return [{ g, m: 'tuft' }];
  };
  // the mouth of a furnace, one wide and one high, standing out of the wall at z = 0: an arched frame of iron, the fire behind it,
  // a grate of bars before the fire, its two doors swung open on their hinges, a hood over it
  PROP.furnacemouth = () => {
    const outer = [[0.6, 0], [0.6, 0.6]].concat(arcPts(0, 0.6, 0.6, 0, Math.PI, 16).slice(1), [[-0.6, 0]]), inner = [[0.44, 0.06], [0.44, 0.55]].concat(arcPts(0, 0.55, 0.44, 0, Math.PI, 14).slice(1), [[-0.44, 0.06]]);
    const ir = [ext(outer, 0.18, 0.025, [inner]).translate(0, 0, 0.09), cbx(1.5, 0.07, 0.5, 0.02, 0, 1.3, 0.22, [0.3, 0, 0]), cbx(1.3, 0.05, 0.34, 0.015, 0, 0.0, 0.2)];
    for (let i = 0; i < 6; i++) ir.push(prism(0.02, 0.5, [-0.36 + i * 0.144, 0.3, 0.15], null, 6));
    ir.push(prism(0.022, 0.86, [0, 0.54, 0.15], [0, 0, HX], 6));
    for (const sx of [-1, 1]) {
      ir.push(Geo.xf(cbx(0.44, 0.98, 0.035, 0.012, 0.22, 0.5, 0), [sx * 0.62, 0.02, 0.18], [0, sx > 0 ? -1.15 : Math.PI + 1.15, 0]));
      for (const y of [0.22, 0.8]) ir.push(prism(0.03, 0.14, [sx * 0.62, y, 0.18], null, 8));
    }
    const fire = ext(inner, 0.01, 0).translate(0, 0, 0.03);
    return [ppart('iron', ir, 1.5, [0.5, 0.46, 0.42]), { g: fire, m: 'lava', tint: null }];
  };
  // ---- ice. An icicle (in place of a cone one in radius and one high about its middle, its point up): knotted, a little bent,
  // runnels down it. A sheath of ice about a pillar (in place of a rod): spread at its foot, its upper edge ragged. A block of ice
  // (in place of a box): its corners gone, its faces uneven. Ice run down a wall and frozen (one wide, one high, one thick, its
  // back at z = 0): in ribs, ending in a row of points
  PROP.icicle = () => {
    const g = new THREE.LatheGeometry(spl([[0.0005, 0.5], [0.09, 0.44], [0.17, 0.3], [0.3, 0.16], [0.42, 0.0], [0.62, -0.2], [0.72, -0.34], [1.0, -0.46], [1.08, -0.5], [0.0005, -0.5]], 22), 9), ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), a = Math.atan2(z, x), k = 1 + 0.13 * Math.sin(a * 3 + y * 7) + 0.06 * Math.sin(y * 19); ps.setX(i, x * k + Math.sin(y * 4.2) * 0.07 * (y + 0.5)); ps.setZ(i, z * k); }
    g.computeVertexNormals(); return [{ g, m: 'ice' }];
  };
  PROP.icesheath = () => {
    const g = new THREE.LatheGeometry([[1.3, -0.5], [1.14, -0.42], [1.03, -0.22], [1.0, 0.1], [0.97, 0.36], [0.86, 0.5]].map((q) => new THREE.Vector2(q[0], q[1])), 26), ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), a = Math.atan2(z, x), k = 1 + 0.07 * Math.sin(a * 5) + 0.04 * Math.sin(a * 11 + y * 3); ps.setXYZ(i, x * k, y > 0.3 ? y + 0.1 * Math.sin(a * 4 + 1) - 0.08 : y, z * k); }
    g.computeVertexNormals(); return [{ g, m: 'ice' }];
  };
  PROP.iceblock = () => {
    const b = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3), ps = b.attributes.position;
    for (let i = 0; i < ps.count; i++) { let x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i); const r = Math.hypot(x, y, z), cut = Math.max(0, r - 0.62) * 0.55, n = Math.sin(x * 12.9 + y * 78.2 + z * 37.7) * 43758.5; const j = (n - Math.floor(n) - 0.5) * 0.05; x *= 1 - cut + j; z *= 1 - cut - j; if (y > -0.49) y *= 1 - cut * 0.8; ps.setXYZ(i, x, y, z); }
    const g = b.toNonIndexed(); g.computeVertexNormals(); return [{ g, m: 'ice' }];
  };
  PROP.icefall = () => [{ g: boxUV(Geo.merge([sheet(0, 1, () => 0.5, (x, v, u) => (0.25 + 0.75 * Math.pow(Math.abs(Math.sin(u * 6.3 + 0.8)), 0.6)) * (0.3 + 0.7 * v), 8, 24, 0, (u) => 0.45 * Math.abs(Math.sin(u * 9.4 + 1.2)) + 0.18 * Math.sin(u * 23) + 0.1)]), 0.4), m: 'ice' }];
  // a crate, a metre each way, standing on y = 0: boards with gaps (a dark box inside shows through them), a frame and a brace on
  // each of its four sides, boards over the top, iron caps at the corners, nail heads
  PROP.crate = () => {
    const bd = [], fr = [], ir = [];
    for (let i = 0; i < 4; i++) { const y = 0.1325 + i * 0.245;
      for (const sg of [-1, 1]) { bd.push(cbx(0.97, 0.225, 0.03, 0.006, 0, y, sg * 0.485)); bd.push(cbx(0.03, 0.225, 0.97, 0.006, sg * 0.485, y, 0)); }
      bd.push(cbx(0.97, 0.03, 0.225, 0.006, 0, 0.985, -0.3675 + i * 0.245)); }
    for (const sg of [-1, 1]) {
      for (const y of [0.05, 0.95]) { fr.push(cbx(1.0, 0.09, 0.028, 0.005, 0, y, sg * 0.514)); fr.push(cbx(0.028, 0.09, 1.0, 0.005, sg * 0.514, y, 0)); }
      for (const e of [-1, 1]) { fr.push(cbx(0.09, 0.82, 0.028, 0.005, e * 0.455, 0.5, sg * 0.514)); fr.push(cbx(0.028, 0.82, 0.09, 0.005, sg * 0.514, 0.5, e * 0.455)); }
      fr.push(cbx(1.1, 0.085, 0.026, 0.004, 0, 0.5, sg * 0.512, [0, 0, sg * 0.78])); fr.push(cbx(0.026, 0.085, 1.1, 0.004, sg * 0.512, 0.5, 0, [sg * 0.78, 0, 0]));
      for (const e of [-1, 1]) for (const y of [0.05, 0.95]) { ir.push(ballN(0.013, [e * 0.455, y, sg * 0.53], null, 8, 5)); ir.push(ballN(0.013, [sg * 0.53, y, e * 0.455], null, 8, 5)); }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.06, 0.94]) ir.push(cbx(0.125, 0.125, 0.125, 0.012, sx * 0.475, y, sz * 0.475));
    return [ppart('wood', bd, 1.2), ppart('woodDark', fr.concat([cbx(0.93, 0.95, 0.93, 0.004, 0, 0.485, 0)]), 1.2), ppart('iron', ir, 2)];
  };
  X.propGeo = function (name) { if (propC[name] !== undefined) return propC[name]; let r = null; const t0 = performance.now(); try { r = PROP[name] ? PROP[name]() : null; if (r) for (const q of r) if (q && q.g) q.g = Geo.weld(q.g); } catch (e) { console.warn('gfx: no prop', name, e); (X.propErr = X.propErr || {})[name] = String(e && e.stack).slice(0, 300); r = null; } X.stats.prop = (X.stats.prop || 0) + (performance.now() - t0); return (propC[name] = r); };

  // ---- what is thrown (grenfx.js), in metres about its middle: lists of parts { g, m (which of grenfx's materials), tag }. A part
  // with a tag is one grenfx moves by itself (the water skin that wobbles, the rings that turn, a light that blinks) ----
  const GREN = {}, grenC = {};
  const gq = (m, list, tag) => ({ g: Geo.merge(Array.isArray(list) ? list : [list]), m, tag: tag || null });
  const can = (r, h) => hl([[0.0005, -h / 2], [r * 0.9, -h / 2], [r, -h / 2 + 0.006], [r * 1.03, -h / 2 + 0.012], [r, -h / 2 + 0.018], [r, -h * 0.18], [r * 1.025, -h * 0.15], [r, -h * 0.12], [r, h * 0.12], [r * 1.025, h * 0.15], [r, h * 0.18], [r, h / 2 - 0.018], [r * 1.03, h / 2 - 0.012], [r, h / 2 - 0.006], [r * 0.9, h / 2], [0.0005, h / 2]], 1, 1, 18);
  const gband = (r, y, hh) => hl([[r * 1.008, y - hh / 2], [r * 1.02, y - hh / 2 + 0.002], [r * 1.02, y + hh / 2 - 0.002], [r * 1.008, y + hh / 2]], 1, 1, 18);
  const fuze = (top) => hl([[0.0005, top - 0.004], [0.03, top - 0.004], [0.031, top + 0.006], [0.022, top + 0.012], [0.022, top + 0.034], [0.015, top + 0.042], [0.0005, top + 0.042]], 1, 1, 12);
  // the spoon down the side from the fuze, the ring of the pin
  const spoon = (top, r) => {
    const l = ext([[0.0, top + 0.046], [0.028, top + 0.044], [r + 0.012, top - 0.03], [r + 0.016, top - 0.1], [r + 0.011, top - 0.1], [r + 0.007, top - 0.032], [0.025, top + 0.038], [0.0, top + 0.04]], 0.022, 0.002);
    const ring = new THREE.TorusGeometry(0.02, 0.003, 5, 14); ring.rotateY(0.5); ring.translate(-0.036, top + 0.028, 0);
    return { lever: l, ring: Geo.merge([ring, prism(0.003, 0.05, [-0.008, top + 0.028, 0], [0, 0, HX], 5)]) };
  };
  const dots = (r, y, n, rad, a0) => { const l = []; for (let i = 0; i < n; i++) { const a = (a0 || 0) + i / n * Math.PI * 2, g = new THREE.CylinderGeometry(rad, rad, 0.004, 8); g.rotateX(HX); g.rotateY(-a + HX); g.translate(Math.cos(a) * (r + 0.001), y, Math.sin(a) * (r + 0.001)); l.push(g); } return l; };
  // the fragmentation grenade: cast iron in eight columns and five rows of square knobs, the grooves between them cut with sloping
  // sides (as a mould leaves them); the faces of the knobs flat, to catch the light. Its points are laid where the grooves and their
  // walls are (an even grid misses the narrow grooves across it); the fuze of steel, the spoon, the pin and its ring
  const FRAG = spl([[0.0005, -0.1], [0.045, -0.096], [0.072, -0.06], [0.08, -0.01], [0.076, 0.04], [0.058, 0.08], [0.034, 0.096], [0.0005, 0.099]], 60);
  const fragR = (y) => { for (let i = 1; i < FRAG.length; i++) if (FRAG[i].y >= y) { const a = FRAG[i - 1], b = FRAG[i], k = (y - a.y) / Math.max(1e-6, b.y - a.y); return a.x + (b.x - a.x) * k; } return 0.0005; };
  GREN.g_frag = () => {
    const ROW = [0, 0.13, 0.27, 0.73, 0.87], COL = [0, 0.12, 0.25, 0.5, 0.75, 0.88], Y0 = -0.082, RH = 0.034, ys = [-0.1, -0.097, -0.092, -0.087], fy = [], fa = [];
    for (let r = 0; r < 5; r++) for (const f of ROW) { ys.push(Y0 + (r + f) * RH); fy.push(f); }
    ys.push(Y0 + 5 * RH); fy.push(0); for (const y of [0.092, 0.096, 0.099]) ys.push(y);
    const as = []; for (let c = 0; c < 8; c++) for (const f of COL) { as.push((c + f) / 8 * Math.PI * 2); fa.push(f); } as.push(Math.PI * 2); fa.push(0);
    const gw = (f, w) => { const d = Math.min(f, 1 - f); return d < 1e-4 ? 1 : d <= w + 1e-4 ? 0.4 : 0; };
    const pos = [], idx = [], na = as.length;
    ys.forEach((y, i) => { const inRow = i >= 4 && i < 4 + 26, fr = inRow ? fy[i - 4] : 1, R = fragR(y); as.forEach((a, j) => { const g = inRow ? Math.max(gw(fr, 0.13), gw(fa[j], 0.12)) : 0, k = 1 - 0.1 * g; pos.push(Math.cos(a) * R * k, y, Math.sin(a) * R * k); }); });
    for (let i = 0; i + 1 < ys.length; i++) for (let j = 0; j + 1 < na; j++) { const a = i * na + j, b = a + 1, c = a + na, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const uv = []; for (let i = 0; i < ys.length; i++) for (let j = 0; j < na; j++) uv.push(as[j] / (Math.PI * 2) * 3, ys[i] * 12); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const s = spoon(0.1, 0.07);
    return [gq('iron', g.toNonIndexed()), gq('tin', fuze(0.1)), gq('tin', s.lever, 'spoon'), gq('brassOld', s.ring, 'pin')];
  };
  // the incendiary: a tin painted a dull red, a glass let into its side with the oil behind it, a band of brass, a fuze and spoon
  GREN.g_fire = () => { const s = spoon(0.088, 0.05); return [gq('cRed', can(0.05, 0.17)), gq('brassOld', gband(0.05, 0.052, 0.014)), gq('iron', [gband(0.05, -0.03, 0.062), fuze(0.088)]), gq('oil', ball(0.03, [0, -0.03, 0.036], [0.8, 0.85, 0.55])), gq('tin', s.lever, 'spoon'), gq('brassOld', s.ring, 'pin')]; };
  // the water skin: a bladder of hide tied at the neck with a blue rag (the bladder: one in radius, it wobbles)
  GREN.g_water = () => [
    gq('hide', new THREE.LatheGeometry(spl([[0.0005, -1], [0.55, -0.95], [0.92, -0.6], [1.0, -0.1], [0.86, 0.4], [0.5, 0.8], [0.26, 1.02], [0.2, 1.12], [0.0005, 1.14]], 22), 18), 'bag'),
    gq('cBlue', [new THREE.TorusGeometry(0.25, 0.07, 6, 14).rotateX(HX).translate(0, 1.04, 0), ext([[0, 0], [0.5, 0.12], [0.62, -0.25], [0.3, -0.42], [0.1, -0.1]], 0.03, 0).translate(0.15, 1.05, 0), ext([[0, 0], [-0.4, 0.2], [-0.56, -0.2], [-0.2, -0.36]], 0.03, 0).translate(-0.15, 1.05, 0.05),
      hl([[0.95, -0.28], [1.0, -0.26], [1.01, -0.1], [0.97, -0.08]], 1, 1, 18)], 'onbag'),
    gq('rope', hl([[0.0005, 1.12], [0.16, 1.12], [0.22, 1.2], [0.2, 1.3], [0.0005, 1.28]], 1, 1, 10), 'onbag')];
  // the freezing can: bare tin with two blue bands, rime on its shoulder, a fuze
  GREN.g_cryo = () => {
    const rime = []; for (let i = 0; i < 26; i++) { const a = i * 2.4, y = 0.04 + (i % 7) * 0.0055, r = Math.min(0.0485, 0.0485 - Math.max(0, y - 0.066) * 0.9) + 0.0006, g = new THREE.IcosahedronGeometry(0.0022 + (i % 4) * 0.0011, 0); g.scale(1.4, 0.7, 1); g.rotateY(-a); g.translate(Math.cos(a) * r, y, Math.sin(a) * r); rime.push(g); }
    const s = spoon(0.082, 0.048);
    return [gq('tin', [can(0.048, 0.16), fuze(0.082), prism(0.008, 0.004, [0, 0.127, 0], null, 10)]), gq('tin', s.lever, 'spoon'), gq('cBlue', [gband(0.048, 0.036, 0.018), gband(0.048, -0.04, 0.018)]), gq('ice', rime), gq('brassOld', s.ring, 'pin')];
  };
  // the shock charge: an insulator of glazed clay in three skirts, wound with copper wire, two rods out of its head with brass terminals
  GREN.g_shock = () => {
    const coil = []; for (let i = 0; i < 7; i++) coil.push(new THREE.TorusGeometry(0.039, 0.0035, 4, 16).rotateX(HX + 0.06).translate(0, -0.052 + i * 0.009, 0));
    return [gq('ceramicW', hl([[0.0005, -0.08], [0.04, -0.08], [0.046, -0.07], [0.036, -0.06], [0.036, 0.008], [0.056, 0.016], [0.058, 0.024], [0.034, 0.034], [0.034, 0.044], [0.05, 0.052], [0.052, 0.06], [0.03, 0.07], [0.028, 0.082], [0.0005, 0.084]], 1, 1, 18)),
      gq('copper', coil), gq('tin', [prism(0.005, 0.06, [0.014, 0.11, 0], null, 6), prism(0.005, 0.06, [-0.014, 0.11, 0], null, 6)]), gq('brassOld', [prism(0.0075, 0.007, [0.014, 0.142, 0], null, 6), prism(0.0075, 0.007, [-0.014, 0.142, 0], null, 6), prism(0.0058, 0.004, [0.014, 0.147, 0], null, 8), prism(0.0058, 0.004, [-0.014, 0.147, 0], null, 8)])];
  };
  // the gas can: brass gone green, vents in a ring about its middle, a green band, a fuze and spoon
  GREN.g_toxic = () => { const s = spoon(0.084, 0.05); return [gq('verdigris', can(0.05, 0.16)), gq('cGreen', gband(0.05, 0.05, 0.016)), gq('dark', dots(0.05, 0, 8, 0.0065).concat(dots(0.05, -0.022, 8, 0.0065, 0.39))), gq('cGreen', gband(0.05, -0.052, 0.006)), gq('iron', fuze(0.084)), gq('tin', s.lever, 'spoon'), gq('brassOld', s.ring, 'pin')]; };
  // the limpet: an iron puck with teeth round its rim, set in a pad of dark glue that has run (its light: grenfx's own)
  GREN.g_sticky = () => {
    const teeth = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; teeth.push(spike(0.011, 0.03, [Math.cos(a) * 0.072, -0.012, Math.sin(a) * 0.072], [Math.PI * 0.72, -a + HX, 0], 4)); }
    return [gq('iron', [hl([[0.0005, -0.022], [0.066, -0.022], [0.072, -0.014], [0.072, 0.012], [0.062, 0.022], [0.03, 0.026], [0.0005, 0.026]], 1, 1, 18)].concat(teeth)),
      gq('goo', [ball(0.078, [0, -0.024, 0], [1, 0.3, 1]), ball(0.02, [0.068, -0.036, 0.02], [1, 0.6, 1]), ball(0.016, [-0.05, -0.04, 0.05], [1, 0.7, 1]), ball(0.018, [-0.03, -0.038, -0.064], [1, 0.6, 1])]), gq('tin', new THREE.TorusGeometry(0.02, 0.004, 4, 10).rotateX(HX).translate(0, 0.027, 0))];
  };
  // the flash charge: a steel tube pierced in two rings, capped at both ends, two pale bands, a fuze and spoon
  GREN.g_flash = () => { const s = spoon(0.084, 0.044); return [gq('tin', [can(0.044, 0.16), fuze(0.084)]), gq('tin', s.lever, 'spoon'), gq('cWhite', [gband(0.044, 0.058, 0.01), gband(0.044, -0.058, 0.01)]), gq('dark', dots(0.044, 0.024, 6, 0.008).concat(dots(0.044, -0.024, 6, 0.008, 0.52))), gq('brassOld', s.ring, 'pin')]; };
  // the void charge: a heavy ball of iron in two halves joined at a seam, a lens of black glass let into its face, in a cage of two iron
  // hoops (they turn)
  GREN.g_hole = () => [gq('iron', new THREE.SphereGeometry(0.072, 24, 16)), gq('dark', [new THREE.TorusGeometry(0.0726, 0.0024, 4, 32).rotateX(HX + 0.3), new THREE.TorusGeometry(0.0726, 0.0024, 4, 32).rotateX(HX - 0.3)]), gq('black', [ball(0.022, [0, 0.0, 0.062], [1, 1, 0.45])]), gq('tin', [new THREE.TorusGeometry(0.023, 0.0028, 5, 18).translate(0, 0, 0.066)]),
    gq('iron', new THREE.TorusGeometry(0.105, 0.006, 5, 28), 'ring0'), gq('iron', new THREE.TorusGeometry(0.09, 0.005, 5, 26), 'ring1')];
  // the nail bomb: a ball of clay with nails driven into it all round, tied crosswise with cord
  GREN.g_nail = () => {
    const g = new THREE.IcosahedronGeometry(0.072, 2), ps = g.attributes.position; for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), k = 1 + 0.05 * Math.sin(x * 70 + y * 40) + 0.04 * Math.sin(z * 90 + x * 30); ps.setXYZ(i, x * k, y * k * 0.94, z * k); } g.computeVertexNormals();
    const nails = []; for (let i = 0; i < 13; i++) { const a = i * 2.4, b = Math.asin(((i * 5) % 13) / 6.5 - 1), d = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]; nails.push(Geo.rod([d[0] * 0.055, d[1] * 0.055, d[2] * 0.055], [d[0] * 0.1, d[1] * 0.1, d[2] * 0.1], 0.0035, 5, 0.003), ball(0.0075, [d[0] * 0.1, d[1] * 0.1, d[2] * 0.1], [1, 1, 1])); }
    return [gq('clay', g), gq('tin', nails), gq('rope', [new THREE.TorusGeometry(0.074, 0.005, 4, 22).rotateX(0.2), new THREE.TorusGeometry(0.074, 0.005, 4, 22).rotateY(HX).rotateZ(0.15)])];
  };
  // the shatter charge: a pale crystal of six sides held in a cage of steel - four bows between two rings
  GREN.g_shatter = () => {
    const cr = Geo.merge([new THREE.ConeGeometry(0.05, 0.085, 6).toNonIndexed().translate(0, 0.0425, 0), new THREE.ConeGeometry(0.05, 0.085, 6).toNonIndexed().rotateX(Math.PI).translate(0, -0.0425, 0)]); cr.computeVertexNormals();
    const cage = [new THREE.TorusGeometry(0.022, 0.004, 4, 12).rotateX(HX).translate(0, 0.098, 0), new THREE.TorusGeometry(0.022, 0.004, 4, 12).rotateX(HX).translate(0, -0.098, 0)];
    for (let i = 0; i < 4; i++) { const a = i * HX + 0.4, c = Math.cos(a), s = Math.sin(a); cage.push(tubeR([[c * 0.022, 0.098, s * 0.022], [c * 0.06, 0.055, s * 0.06], [c * 0.068, 0, s * 0.068], [c * 0.06, -0.055, s * 0.06], [c * 0.022, -0.098, s * 0.022]], 0.0035, 4, 12)); }
    return [gq('ice', cr), gq('tin', cage)];
  };
  // dynamite: three sticks in waxed paper, their ends folded in, bound twice with cord (the fuse and its spark: grenfx's own)
  GREN.g_dyna = () => {
    const st = [], pos = [[-0.056, -0.015], [0, 0.03], [0.056, -0.015]], tie = (y) => tubeR([[-0.084, y, -0.015], [-0.07, y, 0.02], [0, y, 0.062], [0.07, y, 0.02], [0.084, y, -0.015], [0.06, y, -0.046], [0, y, -0.03], [-0.06, y, -0.046], [-0.084, y, -0.015]], 0.004, 4, 28);
    for (const p of pos) st.push(Geo.xf(hl([[0.0005, -0.112], [0.012, -0.112], [0.02, -0.12], [0.028, -0.116], [0.028, 0.116], [0.02, 0.12], [0.012, 0.112], [0.0005, 0.112]], 1, 1, 12), [p[0], 0, p[1]]));
    return [gq('paperOld', st), gq('rope', [tie(-0.07), tie(-0.062), tie(0.07), tie(0.078)]), gq('dark', [ball(0.01, [0, 0.114, 0.03], [1, 0.5, 1])])];
  };
  // the decoy: a hand bell of old brass on a turned wooden handle, its clapper showing
  GREN.g_decoy = () => [gq('brassOld', [hl([[0.0005, 0.045], [0.02, 0.045], [0.03, 0.03], [0.038, -0.01], [0.05, -0.045], [0.07, -0.062], [0.072, -0.07], [0.064, -0.07], [0.046, -0.05], [0.032, -0.012], [0.0005, 0.03]], 1, 1, 20), new THREE.TorusGeometry(0.036, 0.0025, 4, 20).rotateX(HX).translate(0, 0.0, 0)]),
    gq('wood', hl([[0.0005, 0.045], [0.012, 0.045], [0.01, 0.06], [0.016, 0.075], [0.017, 0.1], [0.011, 0.118], [0.015, 0.128], [0.0005, 0.134]], 1, 1, 10)), gq('iron', [ball(0.014, [0, -0.062, 0]), prism(0.003, 0.06, [0, -0.03, 0], null, 5)])];
  X.grenGeo = function (id) { if (grenC[id] !== undefined) return grenC[id]; let r = null; try { r = GREN[id] ? GREN[id]() : null; } catch (e) { console.warn('gfx: no grenade', id, e); (X.propErr = X.propErr || {})[id] = String(e && e.stack).slice(0, 300); r = null; } return (grenC[id] = r); };

  // ---- what a shop shows on its stands and what lies about to be picked up (game.js, combat.js), in metres about its middle: lists
  // of parts { g, m }. 'rc' is the part that takes the colour of the thing's rarity ----
  const WARE = {}, wareC = {};
  // an anvil with its horn, a hammer laid across it
  WARE.forge = () => [
    gq('iron', [ext([[-0.2, 0.07], [0.12, 0.07], [0.25, 0.052], [0.12, 0.02], [0.06, -0.02], [0.06, -0.05], [0.13, -0.09], [0.13, -0.12], [-0.13, -0.12], [-0.13, -0.09], [-0.06, -0.05], [-0.06, -0.02], [-0.2, 0.02]], 0.11, 0.01)]),
    gq('steel', [rbx(0.3, 0.012, 0.1, 0.003, -0.04, 0.074, 0), rbx(0.06, 0.055, 0.11, 0.008, -0.08, 0.125, 0.02, [0, 0.6, 0])]),
    gq('wood', tubeR([[-0.08, 0.125, 0.02], [0.02, 0.118, -0.06], [0.15, 0.112, -0.16]], (t) => 0.012 + t * 0.003, 6, 6))];
  // a thick book lying shut: boards of hide with corner irons and two clasps, the leaves between, a lozenge let into its cover
  WARE.tome = () => {
    const gd = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) gd.push(rbx(0.05, 0.004, 0.05, 0.001, sx * 0.125, 0.047, sz * 0.175), rbx(0.05, 0.004, 0.05, 0.001, sx * 0.125, -0.047, sz * 0.175));
    for (const z of [-0.1, 0.1]) gd.push(rbx(0.05, 0.1, 0.02, 0.003, 0.152, 0, z), rbx(0.012, 0.03, 0.03, 0.004, 0.158, 0, z));
    return [gq('leather', [rbx(0.3, 0.014, 0.4, 0.005, 0, 0.038, 0), rbx(0.3, 0.014, 0.4, 0.005, 0, -0.038, 0), rbx(0.022, 0.09, 0.4, 0.01, -0.15, 0, 0)].concat([-0.12, 0, 0.12].map((z) => rbx(0.03, 0.094, 0.018, 0.006, -0.152, 0, z)))),
      gq('page', rbx(0.27, 0.064, 0.38, 0.003, 0.012, 0, 0)), gq('gold', gd), gq('rc', Geo.xf(rbx(0.07, 0.006, 0.07, 0.002, 0, 0.047, 0), null, [0, Math.PI / 4, 0]))];
  };
  // a scroll: a roll of parchment on a rod with turned ends, its loose end hanging, tied, and sealed with wax
  WARE.skill = () => [
    gq('page', [hl([[0.0005, -0.17], [0.04, -0.17], [0.043, -0.16], [0.043, 0.16], [0.04, 0.17], [0.0005, 0.17]], 1, 1, 16).rotateZ(HX), sheet(-0.13, 0, () => 0.165, (x, v) => 0.042 - (1 - v) * (1 - v) * 0.05 + Math.sin(v * 5) * 0.004, 5, 4, 0.003).translate(0, 0.01, 0)]),
    gq('wood', [prism(0.012, 0.44, [0, 0, 0], [0, 0, HX], 8), ball(0.022, [-0.225, 0, 0], [1.2, 1, 1]), ball(0.022, [0.225, 0, 0], [1.2, 1, 1])]),
    gq('leather', [new THREE.TorusGeometry(0.045, 0.004, 4, 16).rotateY(HX).translate(0.03, 0, 0), new THREE.TorusGeometry(0.045, 0.004, 4, 16).rotateY(HX).translate(-0.04, 0, 0)]),
    gq('rc', hl([[0.0005, 0], [0.026, 0], [0.03, 0.006], [0.02, 0.012], [0.0005, 0.012]], 1, 1, 12).rotateX(HX).translate(0, -0.03, 0.045))];
  // a breastplate: keeled, flared at the hip, a gorget at its neck, a roll at each arm
  WARE.armor = () => [
    gq('plate', [hl([[0.0005, -0.17], [0.12, -0.17], [0.135, -0.15], [0.118, -0.07], [0.145, 0.03], [0.155, 0.1], [0.13, 0.16], [0.075, 0.172], [0.062, 0.19], [0.068, 0.2], [0.05, 0.205], [0.0005, 0.2]], 1.25, 0.78, 20),
      ball(0.05, [0, 0.03, 0.09], [0.5, 2.6, 0.8]), ball(0.05, [0.17, 0.13, 0], [0.8, 0.9, 1.5]), ball(0.05, [-0.17, 0.13, 0], [0.8, 0.9, 1.5])]),
    gq('leather', [rbx(0.04, 0.012, 0.2, 0.004, 0.13, 0.19, 0), rbx(0.04, 0.012, 0.2, 0.004, -0.13, 0.19, 0), hl([[0.137, -0.158], [0.142, -0.15], [0.142, -0.13], [0.137, -0.122]], 1.25, 0.78, 20)])];
  // a medal of old gold on its chain: a raised rim, a cross and four pellets, a stone at its heart
  WARE.relic = () => {
    const ch = []; for (let i = 0; i < 9; i++) { const g = new THREE.TorusGeometry(0.014, 0.0035, 4, 8); if (i % 2) g.rotateY(HX); const a = (i - 4) * 0.17; g.translate(Math.sin(a) * 0.11, 0.12 + Math.cos(a) * 0.1 + Math.abs(i - 4) * 0.004, 0); ch.push(g); }
    const face = [hl([[0.0005, -0.01], [0.1, -0.01], [0.108, -0.004], [0.108, 0.004], [0.1, 0.01], [0.09, 0.006], [0.0005, 0.006]], 1, 1, 24).rotateX(HX), rbx(0.016, 0.13, 0.008, 0.002, 0, 0, 0.008), rbx(0.13, 0.016, 0.008, 0.002, 0, 0, 0.008), new THREE.TorusGeometry(0.016, 0.005, 4, 10).translate(0, 0.118, 0)];
    for (const [x, y] of [[0.045, 0.045], [-0.045, 0.045], [0.045, -0.045], [-0.045, -0.045]]) face.push(ball(0.011, [x, y, 0.008], [1, 1, 0.5]));
    return [gq('gold', face.concat(ch)), gq('rc', ball(0.018, [0, 0, 0.012], [1, 1, 0.6]))];
  };
  // a lantern of iron: a pitched cap with a ring, four posts, a foot, panes of glass (its flame is the game's own)
  WARE.revive = () => {
    const ir = [hl([[0.0005, 0.26], [0.02, 0.25], [0.05, 0.2], [0.13, 0.145], [0.135, 0.13], [0.0005, 0.13]], 1, 1, 4).rotateY(Math.PI / 4), rbx(0.2, 0.022, 0.2, 0.005, 0, -0.125, 0), rbx(0.15, 0.03, 0.15, 0.006, 0, -0.15, 0), new THREE.TorusGeometry(0.035, 0.006, 5, 14).translate(0, 0.29, 0)];
    for (const [x, z] of [[-0.085, -0.085], [0.085, -0.085], [-0.085, 0.085], [0.085, 0.085]]) ir.push(rbx(0.018, 0.25, 0.018, 0.004, x, 0.005, z));
    for (const y of [-0.04, 0.06]) for (const [x, z, w, d] of [[0, -0.085, 0.17, 0.008], [0, 0.085, 0.17, 0.008], [-0.085, 0, 0.008, 0.17], [0.085, 0, 0.008, 0.17]]) ir.push(rbx(w, 0.008, d, 0.002, x, y, z));
    const gl = []; for (const [x, z, w, d] of [[0, -0.083, 0.16, 0.003], [0, 0.083, 0.16, 0.003], [-0.083, 0, 0.003, 0.16], [0.083, 0, 0.003, 0.16]]) gl.push(rbx(w, 0.24, d, 0.001, x, 0.005, z));
    return [gq('iron', ir), gq('glass', gl)];
  };
  // a sight for a gun: a tube swelling to a bell at each end, two turrets, a ring mount on a rail clamp
  WARE.attachment = () => [
    gq('iron', [hl([[0.0005, -0.16], [0.036, -0.16], [0.04, -0.15], [0.04, -0.1], [0.026, -0.085], [0.026, 0.06], [0.034, 0.075], [0.034, 0.15], [0.03, 0.16], [0.026, 0.15], [0.0005, 0.14]], 1, 1, 18).rotateZ(HX),
      prism(0.016, 0.03, [0, 0.036, 0], null, 10), prism(0.016, 0.03, [0, 0, 0.036], [HX, 0, 0], 10), rbx(0.03, 0.05, 0.062, 0.006, -0.03, -0.012, 0), rbx(0.03, 0.05, 0.062, 0.006, 0.04, -0.012, 0)]),
    gq('steel', [rbx(0.16, 0.022, 0.046, 0.004, 0.005, -0.05, 0), prism(0.008, 0.07, [-0.03, -0.05, 0], [HX, 0, 0], 6), prism(0.008, 0.07, [0.04, -0.05, 0], [HX, 0, 0], 6)]),
    gq('glass', [hl([[0.0005, 0], [0.03, 0], [0.0005, 0.004]], 1, 1, 14).rotateZ(-HX).translate(-0.146, 0, 0)])];
  // a flask: a round belly of glass, a neck, a cork under sealing wax, a tag on a cord; its liquor apart (the rarity's colour)
  WARE.potion = () => [
    gq('glass', hl([[0.0005, -0.1], [0.05, -0.1], [0.078, -0.07], [0.085, -0.03], [0.07, 0.02], [0.034, 0.05], [0.026, 0.07], [0.026, 0.11], [0.034, 0.116], [0.034, 0.124], [0.02, 0.124], [0.02, 0.06], [0.0005, 0.06]], 1, 1, 18)),
    gq('rc', hl([[0.0005, -0.092], [0.047, -0.092], [0.072, -0.066], [0.078, -0.03], [0.066, 0.008], [0.0005, 0.008]], 1, 1, 16)),
    gq('wood', hl([[0.0005, 0.1], [0.021, 0.1], [0.024, 0.14], [0.0005, 0.142]], 1, 1, 10)), gq('wax', hl([[0.022, 0.118], [0.032, 0.122], [0.03, 0.14], [0.02, 0.148], [0.0005, 0.15]], 1, 1, 10)),
    gq('leather', [new THREE.TorusGeometry(0.028, 0.003, 4, 14).rotateX(HX).translate(0, 0.09, 0), rbx(0.04, 0.05, 0.002, 0.001, 0.05, 0.055, 0.02, [0, 0.4, 0.5])])];
  // a rune stone: a flat pebble with a sign cut into its face - a ring and three strokes - that shows the colour of its rarity
  WARE.buff = () => {
    const g = new THREE.IcosahedronGeometry(0.13, 2), ps = g.attributes.position; for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), k = 1 + 0.06 * Math.sin(x * 30 + y * 17) + 0.05 * Math.sin(y * 40 + 1); ps.setXYZ(i, x * k * 0.9, y * k * 1.15, z * 0.34); } g.computeVertexNormals();
    return [gq('stone', g), gq('rc', [new THREE.TorusGeometry(0.05, 0.006, 4, 20).translate(0, 0.02, 0.042), rbx(0.012, 0.1, 0.008, 0.002, 0, -0.03, 0.043), rbx(0.012, 0.07, 0.008, 0.002, -0.03, -0.065, 0.04, [0, 0, -0.6]), rbx(0.012, 0.07, 0.008, 0.002, 0.03, -0.065, 0.04, [0, 0, 0.6])])];
  };
  // a coin, 0.09 in radius, struck: a raised rim, a cross on one face and a ring on the other (it turns about y)
  WARE.coin = () => [gq('gold', [hl([[0.0005, -0.008], [0.082, -0.008], [0.09, -0.012], [0.09, 0.012], [0.082, 0.008], [0.0005, 0.008]], 1, 1, 16).rotateX(HX), rbx(0.016, 0.1, 0.006, 0.002, 0, 0, 0.009), rbx(0.1, 0.016, 0.006, 0.002, 0, 0, 0.009), new THREE.TorusGeometry(0.045, 0.006, 4, 16).translate(0, 0, -0.008)])];
  X.wareGeo = function (name) { if (wareC[name] !== undefined) return wareC[name]; let r = null; try { r = WARE[name] ? WARE[name]() : null; } catch (e) { console.warn('gfx: no ware', name, e); (X.propErr = X.propErr || {})[name] = String(e && e.stack).slice(0, 300); r = null; } return (wareC[name] = r); };

  // ---- what is held in the hand while it is used (itemanim.js), in metres about the grip: lists of parts { g, m (which of
  // itemanim's materials), tag, at }. A part with a tag is one itemanim moves by itself (the liquor that goes down from its foot at
  // 'at', the plunger, the tube that is squeezed flat, the bandage that is wound on) ----
  const ITEM = {}, itemC = {};
  // (the surfaces they need that the rest of the game has not got, baked the same way when first asked for: [size, normal strength,
  // GLSL]. Pale where the material's colour is to tint them; the tin of the kit is painted in its own colours)
  const ISURF = {
    // unbleached cotton gauze: a loose plain weave, each thread its own thickness and swelling along its length, fuzz over it, the
    // gaps dark with the turn beneath, handled grey in patches
    linen: [512, 0.55, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float N = 64.; vec2 p = uv * N, c = floor(p), f = fract(p);
  float tw = .5 + .32 * vnA(vec2(c.x, uv.y * 7.), vec2(N, 7.), 1.), tf = .5 + .32 * vnA(vec2(uv.x * 7., c.y), vec2(7., N), 2.);
  float ow = mod(c.x + c.y, 2.);
  float qw = clamp(abs(f.x - .5) / (tw * .5), 0., 1.), qf = clamp(abs(f.y - .5) / (tf * .5), 0., 1.);
  float aw = sqrt(1. - qw * qw), af = sqrt(1. - qf * qf);
  float hw = aw * mix(.42, .62 + .38 * sin(f.y * 3.14159), ow), hf = af * mix(.42, .62 + .38 * sin(f.x * 3.14159), 1. - ow);
  float th = max(hw, hf), gap = step(.999, qw) * step(.999, qf);
  float fz = vnoise(uv * 320., 320., 5.), n1 = fbm(uv, 3., 7.), n2 = fbm(uv, 10., 8.);
  float dirt = smoothstep(.52, .78, n1 * .7 + n2 * .3);
  h = .3 + th * .5 + (fz - .5) * .08 - gap * .12;
  vec3 c0 = vec3(.88, .83, .72) * (.9 + (n2 - .5) * .14) * (.86 + th * .18) * (.96 + (fz - .5) * .1);
  c0 = mix(c0, vec3(.6, .55, .45), dirt * .5);
  c0 = mix(c0, vec3(.34, .3, .24), gap * .8);
  col = S(c0); rough = .94; metal = 0.;
}`],
    // the end of a roll of it: the turns wound tight in a spiral, the cut threads showing end on, the seams between turns dark
    rollEnd: [256, 0.8, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 q = uv - .5; float r = length(q) * 2., a = atan(q.y, q.x) / 6.2831853;
  float w = (fbm(uv, 5., 3.) - .5) * .7, s = r * 17. - a + w, d = abs(fract(s) - .5);
  float seam = smoothstep(.3, .5, d), fib = vnoise(vec2(a * 900., r * 68.), 900., 6.), n1 = fbm(uv, 4., 9.);
  h = .6 - seam * .45 + (fib - .5) * .18 - smoothstep(.85, 1., r) * .2;
  vec3 c = vec3(.84, .79, .68) * (.92 + (fib - .5) * .16) * (.95 + (n1 - .5) * .1);
  c = mix(c, vec3(.42, .38, .31), seam * .7);
  c = mix(c, vec3(.62, .57, .47), smoothstep(.6, 1., r) * .35);
  col = S(c); rough = .95; metal = 0.;
}`],
    // a forearm's skin: fine creases, pores, a few hairs along it, weathered and grimed in patches
    skin: [256, 0.45, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 14., 2.), pr = vnoise(uv * 180., 180., 3.);
  vec3 v = voro(uv, 46., 4.); float cl = smoothstep(.0, .07, v.y - v.x);
  float hair = smoothstep(.95, .995, vnA(vec2(uv.x * 140., uv.y * 9.), vec2(140., 9.), 6.)) * smoothstep(.45, .7, fbm(uv, 5., 7.));
  float grime = smoothstep(.55, .85, fbm(uv, 4., 9.) + (n2 - .5) * .3);
  h = .5 + cl * .07 - smoothstep(.72, .95, pr) * .12 + (n2 - .5) * .1;
  vec3 c = mix(vec3(.66, .54, .46), vec3(.55, .43, .36), n1);
  c *= .93 + (n2 - .5) * .14; c = mix(c, vec3(.4, .32, .26), grime * .45); c = mix(c, vec3(.22, .16, .12), hair * .55);
  col = S(c); rough = .58 + (n2 - .5) * .16 + grime * .22; metal = 0.;
}`],
    // a paper label, foxed and darkened to its edges, four lines of brown ink in a hand and a heading (laid on 0..1 once, not repeated)
    label: [256, 0.3, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 30., 2.);
  float row = uv.y * 6., ri = floor(row), ry = fract(row);
  float word = step(.42, vnA(vec2(uv.x * 9., ri * 3.), vec2(9., 18.), 3.)) * step(.5, ri) * step(ri, 3.5) * step(.08, uv.x) * step(uv.x, .92);
  float pen = smoothstep(.55, .9, sin(uv.x * 210. + sin(uv.x * 37. + ri) * 2.) * .5 + .5) * smoothstep(.2, .08, abs(ry - .5 + sin(uv.x * 70. + ri * 3.) * .09));
  float big = step(3.5, ri) * step(ri, 4.5) * smoothstep(.3, .14, abs(ry - .45)) * step(.18, uv.x) * step(uv.x, .82) * smoothstep(.35, .7, sin(uv.x * 120.) * .5 + .5);
  float ink = max(word * pen, big) * (.75 + n2 * .25);
  float edge = smoothstep(.0, .12, min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y)));
  vec3 fx = voro(uv, 9., 5.); float fox = smoothstep(.12, .0, fx.x) * step(.7, fx.z);
  vec3 c = mix(vec3(.5, .42, .3), vec3(.8, .73, .58), edge * .6 + n1 * .4);
  c = mix(c, vec3(.5, .36, .22), fox * .5); c = mix(c, vec3(.17, .12, .09), ink * .85);
  h = .5 + (n2 - .5) * .2 - ink * .05; col = S(c); rough = .9 - ink * .2; metal = 0.;
}`],
    // tinplate painted a dull green-grey: the paint chipped and scratched to the metal, the metal browned with rust where it shows
    kitTin: [512, 0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 16., 2.), n3 = vnoise(uv * 120., 120., 3.);
  float chip = smoothstep(.62, .66, fbm(uv, 7., 4.) * .7 + n2 * .3);
  float scr = smoothstep(.82, .95, ridge(uv, 6., 5.)) * smoothstep(.4, .7, fbm(uv, 3., 6.));
  float bare = max(chip, scr * .9), rust = smoothstep(.55, .8, fbm(uv, 9., 7.)) * bare;
  vec3 paint = vec3(.30, .32, .24) * (.88 + (n1 - .5) * .2 + (n3 - .5) * .06);
  vec3 tin = mix(vec3(.62, .62, .6), vec3(.36, .22, .14), rust * .8);
  col = S(mix(paint, tin, bare)); h = .55 - bare * .12 + (n3 - .5) * .03;
  rough = mix(.72 + (n2 - .5) * .14, .42 + rust * .4, bare); metal = bare * (1. - rust * .8);
}`],
    // sand-cast iron: the grain of the mould on it, pits, blotches of rust (its metalness from the map)
    castIron: [512, 0.7, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float sd = vnoise(uv * 260., 260., 1.), sd2 = vnoise(uv * 120., 120., 2.), n1 = fbm(uv, 4., 3.), n2 = fbm(uv, 14., 4.);
  vec3 pv = voro(uv, 34., 5.); float pit = smoothstep(.16, .04, pv.x) * step(.72, pv.z);
  float rust = smoothstep(.58, .82, fbm(uv, 6., 6.) + (n2 - .5) * .3);
  h = .5 + (sd - .5) * .14 + (sd2 - .5) * .1 - pit * .25 + (n1 - .5) * .1;
  vec3 c = vec3(.62 + (n1 - .5) * .14 + (sd - .5) * .08) * vec3(1., .99, .96);
  c = mix(c, vec3(.36, .22, .14), rust * .55); c *= 1. - pit * .35;
  col = S(c); rough = .78 + (sd - .5) * .14 + rust * .12; metal = .55 * (1. - rust);
}`],
    // paint on metal (pale, the material's colour tints it): chipped and scratched to the metal, rust where it shows, grimed
    paintWorn: [512, 0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 18., 2.), n3 = vnoise(uv * 140., 140., 3.);
  float chip = smoothstep(.6, .64, fbm(uv, 6., 4.) * .7 + n2 * .3);
  float scr = smoothstep(.83, .95, ridge(uv, 5., 5.)) * smoothstep(.45, .7, fbm(uv, 3., 6.));
  float bare = max(chip, scr * .9), rust = smoothstep(.5, .78, fbm(uv, 9., 7.)) * bare, grime = smoothstep(.5, .8, n1);
  vec3 paint = vec3(.8 + (n3 - .5) * .05) * (.9 + (n2 - .5) * .1) * (1. - grime * .25);
  vec3 mc = mix(vec3(.42, .42, .4), vec3(.3, .18, .11), rust);
  col = S(mix(paint, mc, bare)); h = .55 - bare * .1 + (n3 - .5) * .03;
  rough = mix(.66 + (n2 - .5) * .14 + grime * .1, .45 + rust * .4, bare); metal = bare * (1. - rust * .8);
}`],
    // a brown salt glaze in its own colours: the skin of orange peel the salt leaves, mottled light and dark, iron spots
    saltGlaze: [512, 0.6, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float op = vnoise(uv * 160., 160., 1.), op2 = vnoise(uv * 320., 320., 2.), n1 = fbm(uv, 3., 3.), n2 = fbm(uv, 8., 4.);
  vec3 sp = voro(uv, 140., 5.); float spot = smoothstep(.16, .04, sp.x) * step(.86, sp.z);
  h = .5 + (op - .5) * .22 + (op2 - .5) * .08;
  vec3 c = mix(vec3(.32, .19, .1), vec3(.5, .32, .17), smoothstep(.25, .8, n1 * .8 + n2 * .2)) * (.97 + (op - .5) * .06);
  c = mix(c, vec3(.16, .09, .05), spot * .6);
  col = S(c); rough = .3 + (op - .5) * .08 + (1. - n1) * .1; metal = 0.;
}`],
    // a heart's flesh in its own colours: the grain of the muscle, veins over it, fat in places; wet
    flesh: [512, 1.1, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float fib = vnA(vec2(uv.x * 140., uv.y * 12.), vec2(140., 12.), 1.), fib2 = vnA(vec2(uv.x * 60., uv.y * 5.), vec2(60., 5.), 4.), n1 = fbm(uv, 4., 2.), n2 = fbm(uv, 16., 3.), n3 = fbm(uv, 40., 5.);
  vec3 lb = voro(uv + (vec2(fbm(uv, 3., 14.), fbm(uv, 3., 15.)) - .5) * .3, 6., 11.); float lobe = smoothstep(.0, .7, lb.y - lb.x);
  float vein = smoothstep(.88, .97, ridge(uv + (vec2(fbm(uv, 4., 7.), fbm(uv, 4., 8.)) - .5) * .25, 4., 6.)), vein2 = smoothstep(.9, .98, ridge(uv * 1.0 + .3, 11., 9.)) * .6;
  float fat = smoothstep(.6, .78, fbm(uv, 3., 9.) + (n2 - .5) * .25);
  float wet = smoothstep(.35, .7, fbm(uv, 6., 13.));
  h = .5 + (fib - .5) * .12 + (fib2 - .5) * .1 + lobe * .05 + (n2 - .5) * .16 + (n3 - .5) * .06 + max(vein, vein2) * .12 + fat * .1;
  vec3 c = mix(vec3(.22, .05, .05), vec3(.36, .09, .08), n1 * .7 + lobe * .3) * (.86 + fib * .2);
  c = mix(c, vec3(.13, .04, .08), max(vein, vein2) * .75); c = mix(c, vec3(.5, .4, .24), fat * .7);
  col = S(c); rough = mix(.62, .2, wet) + (n3 - .5) * .14 + fat * .1; metal = 0.;
}`],
    // an apple's skin, gold ripening to russet, in its own colours: streaks from the stalk, pale lenticels, rough russet patches
    appleSkin: [256, 0.4, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 12., 2.);
  vec3 lv = voro(uv, 40., 3.); float len = smoothstep(.14, .05, lv.x) * step(.5, lv.z);
  float rus = smoothstep(.55, .8, fbm(uv, 5., 4.) + (n2 - .5) * .3), str = vnA(vec2(uv.x * 30., uv.y * 3.), vec2(30., 3.), 5.);
  vec3 c = mix(vec3(.56, .38, .12), vec3(.68, .5, .18), n1 * .6 + str * .4);
  c = mix(c, vec3(.46, .3, .14), rus * .7); c = mix(c, vec3(.84, .74, .48), len * .6);
  h = .5 + (n2 - .5) * .1 - len * .1 + rus * .06;
  col = S(c); rough = mix(.38, .78, rus) + (n2 - .5) * .1; metal = 0.;
}`],
  };
  const isurfC = {};
  X.itemTex = function (name) {
    if (isurfC[name] !== undefined) return isurfC[name];
    const src = ISURF[name], renderer = G.renderer; if (!src || !renderer) return null;
    isurfC[name] = null;
    const t0 = performance.now();
    try { const rts = X.bake(renderer, src[0], src[2], { normal: src[1], ao: 2 }); isurfC[name] = { map: rts[0].texture, normalMap: rts[1].texture, orm: rts[2].texture }; } catch (e) { console.warn('gfx: no item surface', name, e); }
    const ms = Math.round(performance.now() - t0); X.stats.surf += ms; (X.stats.item = X.stats.item || {})[name] = ms;
    return isurfC[name];
  };
  // a strip of cloth along a line: at each of n+1 steps s (0..1) its middle c(s), the way across it a(s) (unit), its half width
  // w(s), m faces across; off(u, s) moves a point of it (a torn hem). uv: along and across, in metres x k
  const strip = (n, m, c, a, w, k, off) => {
    const pos = [], uv = [], idx = []; let L = 0, pv = null;
    for (let i = 0; i <= n; i++) {
      const s = i / n, C = c(s), A = a(s), W = w(s); if (pv) L += Math.hypot(C[0] - pv[0], C[1] - pv[1], C[2] - pv[2]); pv = C;
      for (let j = 0; j <= m; j++) { const u = j / m * 2 - 1, o = off ? off(u, s) : null; pos.push(C[0] + A[0] * u * W + (o ? o[0] : 0), C[1] + A[1] * u * W + (o ? o[1] : 0), C[2] + A[2] * u * W + (o ? o[2] : 0)); uv.push(L * k, (u + 1) * W * k); }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a0 = i * (m + 1) + j, b = a0 + 1, c0 = a0 + m + 1, d = c0 + 1; idx.push(a0, c0, b, b, c0, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  };
  // a tube about z: at nz+1 steps from z0 to z1, nr+1 points round at radius rf(z, a) (a: 0 out to +x, up to +y); uv round 0..ku,
  // along z x kv. The normals across its seam are joined
  const ringTube = (z0, z1, nz, nr, rf, ku, kv) => {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nz; i++) { const z = z0 + (z1 - z0) * i / nz; for (let j = 0; j <= nr; j++) { const a = j / nr * Math.PI * 2, r = rf(z, a); pos.push(Math.cos(a) * r, Math.sin(a) * r, z); uv.push(j / nr * ku, z * kv); } }
    for (let i = 0; i < nz; i++) for (let j = 0; j < nr; j++) { const a0 = i * (nr + 1) + j, b = a0 + 1, c = a0 + nr + 1, d = c + 1; idx.push(a0, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const nm = g.attributes.normal; for (let i = 0; i <= nz; i++) { const a0 = i * (nr + 1), b = a0 + nr, x = nm.getX(a0) + nm.getX(b), y = nm.getY(a0) + nm.getY(b), z = nm.getZ(a0) + nm.getZ(b), l = Math.hypot(x, y, z) || 1; nm.setXYZ(a0, x / l, y / l, z / l); nm.setXYZ(b, x / l, y / l, z / l); }
    return g;
  };
  // the uv of a lathe's surface in metres: round it (a whole number of repeats, so its seam does not show) and up it, x k
  const latheUV = (g, R, k) => { const ps = g.attributes.position, uv = g.attributes.uv, nu = Math.max(1, Math.round(Math.PI * 2 * R * k)); for (let i = 0; i < ps.count; i++) uv.setXY(i, uv.getX(i) * nu, ps.getY(i) * k); return g; };
  // a piece of a label wrapped round a body of radius r about y: from angle a0 to a1 (0 looks to +z), y0 to y1; uv 0..1 over it
  const wrapLabel = (r, a0, a1, y0, y1, n) => { const g = ringTube(0, 1, 1, n || 12, () => r, 1, 1), ps = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < ps.count; i++) { const j = i % ((n || 12) + 1), t = j / (n || 12), a = a0 + (a1 - a0) * t, v = ps.getZ(i); ps.setXYZ(i, Math.sin(a) * r, y0 + (y1 - y0) * v, Math.cos(a) * r); uv.setXY(i, t, v); } g.computeVertexNormals(); return g; };
  // a wire bent along points (a pin, a loop of string)
  const wire = (pts, r, seg, sm) => tubeR(pts, r, seg || 4, sm);
  // a cork pushed into a neck of radius r at y, its top standing h above, a little crushed; sealing wax over it and down the lip
  const corkG = (r, y, h) => hl([[0.0005, y - 0.012], [r * 0.92, y - 0.012], [r, y - 0.004], [r * 1.03, y + h * 0.4], [r * 1.07, y + h * 0.85], [r * 0.95, y + h], [0.0005, y + h * 1.02]], 1, 1, 14);
  const waxG = (r, y, h, drip) => { const g = hl([[r * 0.99, y - 0.0015], [r * 1.05, y - 0.0008], [r * 1.07, y + h * 0.3], [r * 1.04, y + h * 0.75], [r * 0.9, y + h + 0.0006], [r * 0.5, y + h + 0.0011], [0.0005, y + h + 0.0012]], 1, 1, 18), ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), z = ps.getZ(i), yy = ps.getY(i), a = Math.atan2(z, x), lo = yy < y + h * 0.2 ? 1 : 0; ps.setY(i, yy - lo * (drip || 0.006) * Math.max(0, Math.sin(a * 3 + 1)) * Math.max(0, Math.sin(a * 5))); const k = 1 + 0.03 * Math.sin(a * 7 + yy * 300); ps.setX(i, x * k); ps.setZ(i, z * k); }
    g.computeVertexNormals(); return g; };
  // a band of string twice round a neck at y, radius r, its knot and two ends hanging
  const tieG = (r, y, len) => { const out = []; for (const dy of [0, 0.0024]) out.push(new THREE.TorusGeometry(r, 0.0011, 4, 18).rotateX(HX).translate(0, y + dy, 0)); out.push(ball(0.0024, [0, y + 0.0012, r + 0.0012], [1.2, 1, 0.8])); for (const sx of [-1, 1]) out.push(wire([[sx * 0.001, y + 0.001, r + 0.0018], [sx * 0.0028, y - len * 0.45, r + 0.0014 + len * 0.05], [sx * (0.002 + len * 0.1), y - len, r + 0.001 + len * 0.12]], 0.0009, 4, 8)); return out; };
  // ---- a roll of gauze bandage, wound about x: W wide, R across. Its turns show at its ends (rollEnd); wound by hand, it is not quite
  // round, and threads have come loose at its edges ----
  const BW = 0.05, BR = 0.0185, BK = 25;
  const rollK = (a, x) => 1 + 0.014 * Math.sin(a * 3 + 1) + 0.007 * Math.sin(a * 7 + 2) + 0.003 * Math.sin(x * 260 + a * 5);
  const rollWob = (g) => { const ps = g.attributes.position; for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), k = rollK(Math.atan2(z, y), x); ps.setY(i, y * k); ps.setZ(i, z * k); } g.computeVertexNormals(); return g; };
  const rollParts = (R, W) => {
    const body = latheUV(Geo.lathe([[R - 0.0012, -W / 2], [R - 0.0004, -W / 2 + 0.0007], [R, -W / 2 + 0.0022], [R * 1.004, -W * 0.22], [R * 1.005, 0], [R * 1.004, W * 0.22], [R, W / 2 - 0.0022], [R - 0.0004, W / 2 - 0.0007], [R - 0.0012, W / 2]], 32), R, BK);
    body.rotateZ(HX); rollWob(body);
    const ends = [];
    for (const sx of [-1, 1]) { const d = new THREE.CircleGeometry(R - 0.0012, 32); d.attributes.position.setZ(0, -0.0007); d.rotateY(sx * HX); d.translate(sx * W / 2, 0, 0); rollWob(d); ends.push(d); }
    return { body, ends };
  };
  const frays = (R, W, n, seed) => { const out = []; for (let i = 0; i < n; i++) { const a = seed + i * 2.39, sx = i % 2 ? 1 : -1, r = R * rollK(a, sx * W / 2) - 0.0009, c = Math.cos(a), s = Math.sin(a), l = 0.003 + (i % 3) * 0.0022;
    out.push(wire([[sx * (W / 2 - 0.001), c * r, s * r], [sx * (W / 2 + l * 0.6), c * (r + l * 0.3), s * (r + l * 0.3)], [sx * (W / 2 + l), c * (r - l * 0.2) + 0.001, s * (r - l * 0.2)]], 0.0003, 3, 4)); } return out; };
  // the whole roll as it comes out of a pouch: its free end off the top, round the front and hanging, torn across, a few threads loose
  // from the tear; a safety pin of brass through it to fasten it with when it is on
  ITEM.bandage = () => {
    const R = BR, W = BW, rp = rollParts(R, W), zf = R * rollK(HX, 0) + 0.0007;
    const c = (s) => { if (s < 0.18) { const p = -0.25 - 0.65 * s / 0.18; return [0, Math.sin(p) * zf, Math.cos(p) * zf]; } const t = (s - 0.18) / 0.82; return [Math.sin(t * 3) * 0.0025 * t, Math.sin(-0.9) * zf - t * 0.034, Math.cos(-0.9) * zf - t * 0.004 + t * t * 0.007 + t * t * t * 0.006 + Math.sin(t * 4) * 0.0012 * t]; };
    const a = (s) => { const t = Math.max(0, s - 0.18) / 0.82, q = 0.5 * t * t; return [Math.cos(q), 0.06 * t, -Math.sin(q)]; };
    const torn = (u) => 0.0016 * Math.sin(u * 23 + 1) + 0.0012 * Math.sin(u * 53) + 0.0008 * Math.sin(u * 97 + 2) + 0.0006 * Math.sin(u * 151);
    const tail = strip(16, 16, c, a, (s) => W / 2 * (1 - 0.03 * s), BK, (u, s) => [0, s > 0.999 ? torn(u) : 0, Math.sin(u * 3.1) * 0.0012 * Math.max(0, s - 0.18)]);
    const loose = [], t1 = c(1), A1 = a(1);
    for (let i = 0; i < 5; i++) { const u = -0.8 + i * 0.4 + 0.07 * Math.sin(i * 3), x = t1[0] + A1[0] * u * W / 2, y = t1[1] + torn(u), z = t1[2] + A1[2] * u * W / 2, l = 0.005 + (i % 3) * 0.004;
      loose.push(wire([[x, y + 0.001, z], [x + 0.001 * Math.sin(i), y - l * 0.5, z + 0.0012], [x + 0.002 * Math.cos(i * 2), y - l, z + 0.0006 * i]], 0.00028, 3, 5)); }
    const pq = c(0.18 + 0.82 * 0.36), py = pq[1], pz = pq[2] + 0.0011, pin = [
      wire([[-0.0128, py + 0.0017, pz], [0.0112, py + 0.0017, pz + 0.0002]], 0.00055, 5, false),
      wire([[-0.0128, py - 0.0017, pz], [-0.005, py - 0.0016, pz - 0.0016], [0.004, py - 0.0016, pz - 0.0016], [0.0112, py - 0.0014, pz]], 0.00055, 5, 10),
      new THREE.TorusGeometry(0.0018, 0.00055, 4, 10).translate(-0.0136, py, pz), new THREE.TorusGeometry(0.0018, 0.00055, 4, 10).translate(-0.0136, py, pz + 0.0011),
      rbx(0.0046, 0.0044, 0.0019, 0.0007, 0.0126, py + 0.0002, pz + 0.0003)];
    return [gq('linen', [rp.body, tail].concat(loose, frays(R, W, 8, 0.4))), gq('rollEnd', rp.ends), gq('brassOld', pin)];
  };
  // the roll alone, as it is held while it is wound on (itemanim winds it off: it turns, it grows less)
  ITEM.bandRoll = () => { const rp = rollParts(BR, BW * 0.9); return [gq('linen', [rp.body].concat(frays(BR, BW * 0.9, 6, 1.1))), gq('rollEnd', rp.ends)]; };

  // ---- the forearm that is seen to (itemanim's other arm), bare to where its sleeve is rolled back: the wrist at the origin, running
  // along +z to the elbow at 0.26. armR(z, a): how far its skin stands from that line (a: 0 out to the thumb side, +x; the back of the
  // arm up +y) - flat and narrow at the wrist, the muscle swelling on the outer side towards the elbow ----
  const armR = (z, a) => {
    const t = Math.min(1, Math.max(0, z / 0.26)), w = 0.0255 + 0.016 * Math.pow(Math.sin(Math.min(1, t * 1.25) * HX), 1.4), h = 0.0185 + 0.0145 * Math.pow(Math.sin(Math.min(1, t * 1.3) * HX), 1.2);
    const c = Math.cos(a), s = Math.sin(a), r = 1 / Math.sqrt(c * c / (w * w) + s * s / (h * h));
    return r + 0.0045 * Math.pow(Math.max(0, Math.cos(a - 0.7)), 2) * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.0012 * Math.sin(a * 3 + z * 40) * t;
  };
  // (the rolled sleeve: how far it stands off the arm along it - a fat roll, a crease, a second roll, then the sleeve going on to the elbow)
  const SLV = [[0.188, 0.0006], [0.2, 0.007], [0.212, 0.0125], [0.226, 0.0135], [0.238, 0.0095], [0.246, 0.0062], [0.256, 0.0115], [0.272, 0.0122], [0.29, 0.0085], [0.31, 0.0088], [0.4, 0.0095]];
  const slvOff = (z) => { for (let i = 1; i < SLV.length; i++) if (z <= SLV[i][0]) { const k = (z - SLV[i - 1][0]) / (SLV[i][0] - SLV[i - 1][0]); return SLV[i - 1][1] + (SLV[i][1] - SLV[i - 1][1]) * k; } return SLV[SLV.length - 1][1]; };
  X.armR = armR; X.BAND = { R: BR, W: BW * 0.9, K: BK };
  ITEM.forearm = () => [
    gq('skin', ringTube(-0.016, 0.205, 18, 24, armR, 1, 4.5)),
    gq('sleeve', ringTube(0.188, 0.4, 16, 24, (z, a) => armR(Math.min(z, 0.26), a) + slvOff(z) * (1 + 0.16 * Math.sin(a * 5 + z * 90) + 0.1 * Math.sin(a * 9 - z * 60)), 7, 14))];
  // ---- the bandage as it goes on that forearm: once straight round above the wrist, then on in a spiral towards the elbow, each turn
  // over half the one before. Its triangles lie in the order it is wound (itemanim shows more of it as it goes); path: where the middle
  // of the band lies at each step [point, outward, the way it runs], for the roll in the hand to follow. Its edges are shaded darker
  // (vertex colours), where one turn lies over the next ----
  ITEM.bandWrap = () => {
    const W = BW * 0.9, z0 = 0.05, per = 28, n = Math.round(3.4 * per), m = 6, pitch = W * 0.56, T2 = Math.PI * 2;
    const pos = [], uv = [], col = [], idx = [], path = []; let L = 0, pv = null;
    for (let i = 0; i <= n; i++) {
      const th = i / per * T2, zc = z0 + pitch * Math.max(0, th - T2) / T2, lift = 0.0012 + 0.0017 * th / T2, a = HX + th, c = Math.cos(a), s = Math.sin(a);
      const rc = armR(zc, a) + lift, P = [c * rc, s * rc, zc];
      if (pv) L += Math.hypot(P[0] - pv[0], P[1] - pv[1], P[2] - pv[2]); pv = P;
      for (let j = 0; j <= m; j++) { const e = j / m - 0.5, rim = j === 0 || j === m, z = zc + e * W + (rim ? 0.0006 * Math.sin(i * 1.9 + j) : 0), r = armR(z, a) + lift - (j === 0 ? 0.0003 : j === m ? 0.0013 : 0) + (j === 1 ? 0.0004 : 0); pos.push(c * r, s * r, z); uv.push(L * BK, (e + 0.5) * W * BK);
        const k = (j === 0 ? 0.6 : j === m ? 0.74 : j === m - 1 ? 0.9 : 1) * (0.94 + 0.06 * Math.sin(i * 0.7 + j * 2.1)); col.push(k, k * 0.98, k * 0.95); }
      const dz = th > T2 ? pitch / T2 : 0, tl = Math.hypot(rc, dz);
      path.push([P[0], P[1], P[2], c, s, 0, -s * rc / tl, c * rc / tl, dz / tl]);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const a0 = i * (m + 1) + j, b = a0 + 1, c0 = a0 + m + 1, d = c0 + 1; idx.push(a0, c0, b, b, c0, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    return [{ g, m: 'linenV', tag: 'wrap', path, seg: m * 6, W, L }];
  };

  // ---- a glass syringe, drawn along y with its needle down: a barrel of thick glass marked in black, nickelled ferrules at its ends, a
  // flange for two fingers, a Luer tip with its lock, the needle on a brass hub. What it holds from its foot at 'at' (itemanim makes it
  // as tall as the plunger leaves it); the plunger apart ----
  ITEM.inject = () => {
    const ticks = []; for (let i = 0; i <= 10; i++) { const y = -0.025 + i * 0.005, w = (i % 2 ? 0.0036 : 0.0068) / 0.0073; ticks.push(wrapLabel(0.00735, -0.25, -0.25 + w, y - 0.00028, y + 0.00028, 3)); }
    return [
      gq('glass', Geo.lathe([[0.0005, -0.042], [0.0017, -0.042], [0.0021, -0.034], [0.0045, -0.033], [0.0071, -0.0315], [0.0072, -0.029], [0.0072, 0.031], [0.0068, 0.0325], [0.0061, 0.0325], [0.006, 0.031], [0.006, -0.029], [0.0055, -0.0305], [0.0008, -0.031], [0.0005, -0.031]], 18)),
      gq('nickel', [hl([[0.0071, -0.0335], [0.0079, -0.0335], [0.0081, -0.0315], [0.0079, -0.026], [0.0071, -0.026]], 1, 1, 18), hl([[0.0071, 0.026], [0.0079, 0.026], [0.0081, 0.03], [0.0081, 0.0325], [0.0071, 0.0325]], 1, 1, 18),
        hl([[0.0005, 0.0322], [0.0158, 0.0322], [0.0166, 0.0335], [0.0158, 0.0352], [0.0005, 0.0352]], 1, 0.4, 20), hl([[0.0024, -0.0425], [0.0043, -0.0425], [0.0045, -0.04], [0.0045, -0.0355], [0.0036, -0.0335], [0.0024, -0.0335]], 1, 1, 12)]),
      gq('brassOld', hl([[0.0005, -0.0525], [0.0011, -0.0525], [0.0025, -0.047], [0.0031, -0.0428], [0.0033, -0.0405], [0.0005, -0.0405]], 1, 1, 10)),
      gq('steel', [prism(0.00034, 0.034, [0, -0.0695, 0], null, 5), spike(0.00034, 0.0028, [0, -0.0878, 0], [Math.PI, 0, 0.2], 4)]),
      gq('ink', ticks),
      { g: Geo.lathe([[0.0005, 0], [0.0058, 0], [0.0058, 1], [0.0005, 1]], 14), m: 'liq', tag: 'liq', at: [0, -0.0305, 0] },
    ];
  };
  // its plunger, from the face of its seal (y = 0) up: a seal of black rubber, a nickelled rod, a thumb rest and a ring for the thumb
  ITEM.plunger = () => [gq('rubber', hl([[0.0005, -0.0062], [0.0057, -0.0062], [0.00595, -0.0052], [0.00575, -0.0034], [0.00595, -0.0016], [0.0057, 0], [0.0005, 0]], 1, 1, 14)),
    gq('nickel', [prism(0.0017, 0.066, [0, 0.026, 0], null, 6), hl([[0.0005, 0.058], [0.0072, 0.058], [0.0076, 0.0602], [0.0072, 0.0622], [0.0005, 0.0622]], 1, 1, 14), new THREE.TorusGeometry(0.0078, 0.0016, 5, 16).translate(0, 0.0708, 0)])];
  // ---- a syrette: a little tube of soft tin squeezed flat to give what it holds, crimped shut at its back, printed round its middle;
  // a short glass neck, the needle under a loop of wire that pierced its seal ----
  ITEM.syrette = () => {
    const tube = hl([[0.0005, -0.016], [0.0042, -0.0158], [0.0061, -0.012], [0.0064, 0.016], [0.0062, 0.022], [0.0055, 0.0262], [0.0005, 0.0265]], 1, 1, 16), ps = tube.attributes.position;
    for (let i = 0; i < ps.count; i++) { const y = ps.getY(i), t = Math.max(0, Math.min(1, (y - 0.01) / 0.016)); ps.setX(i, ps.getX(i) * (1 + t * 0.5) * (1 + 0.04 * Math.sin(y * 900))); ps.setZ(i, ps.getZ(i) * (1 - t * 0.86)); }
    tube.computeVertexNormals();
    const crimp = []; for (let i = 0; i < 4; i++) crimp.push(rbx(0.0186, 0.0007, 0.0021, 0.0002, 0, 0.0218 + i * 0.0012, 0));
    return [
      { g: Geo.merge([tube].concat(crimp)), m: 'tin', tag: 'squeeze' },
      gq('label', wrapLabel(0.00648, -1.6, 1.6, -0.006, 0.01, 12)),
      gq('glass', hl([[0.0005, -0.026], [0.0016, -0.026], [0.0022, -0.02], [0.0036, -0.0168], [0.0043, -0.0158], [0.0005, -0.0158]], 1, 1, 10)),
      gq('brassOld', hl([[0.0005, -0.031], [0.001, -0.031], [0.0022, -0.0275], [0.0024, -0.0255], [0.0005, -0.0255]], 1, 1, 8)),
      gq('steel', [prism(0.0003, 0.022, [0, -0.041, 0], null, 5), spike(0.0003, 0.0024, [0, -0.0532, 0], [Math.PI, 0, 0.2], 4), wire([[0.0026, -0.0262, 0], [0.004, -0.031, 0], [0, -0.0335, 0.0004], [-0.004, -0.031, 0], [-0.0026, -0.0262, 0]], 0.00028, 3, 8)]),
    ];
  };
  // ---- the first-aid kit as it is used: a pouch of khaki canvas, its seams piped, a faded red cross on its face; it hangs by its
  // leather strap from the fist that holds it (the grip up y through the origin), its flap thrown back, what is in it showing at its
  // mouth - a roll of gauze, a bottle of iodine, the finger rings of the scissors, a dressing in its paper ----
  ITEM.kit = () => {
    const W = 0.1, H = 0.068, D = 0.036, y0 = -0.05, cy = y0 - H / 2;
    const body = X.makeRbox(W, H, D, 0.009, 2), ps = body.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), k = 1 + 0.08 * Math.max(0, 1 - Math.abs(y) / (H / 2)) * Math.max(0, 1 - Math.abs(x) / (W / 2)); ps.setXYZ(i, x + 0.0012 * Math.sin(y * 160 + x * 70), y + cy + (y > H / 2 - 0.002 ? 0.0015 * Math.sin(x * 90) : 0), z * k); }
    body.computeVertexNormals(); boxUV(body, 18);
    const pipe = [], e = (pts) => pipe.push(wire(pts, 0.0016, 5, 12));
    for (const sz of [-1, 1]) e([[-W / 2 + 0.003, y0 - 0.001, sz * (D / 2 - 0.002)], [-W / 2 - 0.0006, cy, sz * (D / 2 + 0.001)], [-W / 2 + 0.004, y0 - H + 0.0015, sz * (D / 2 - 0.001)], [W / 2 - 0.004, y0 - H + 0.0015, sz * (D / 2 - 0.001)], [W / 2 + 0.0006, cy, sz * (D / 2 + 0.001)], [W / 2 - 0.003, y0 - 0.001, sz * (D / 2 - 0.002)]]);
    e([[-W / 2 + 0.004, y0 + 0.0008, D / 2 - 0.001], [0, y0 + 0.0022, D / 2 + 0.0004], [W / 2 - 0.004, y0 + 0.0008, D / 2 - 0.001]]);
    // the flap thrown back over the back of it, a brass stud at its edge; the strap up from the back into the fist, sewn on
    const flap = strip(8, 6, (s) => [0, y0 + 0.004 - Math.sin(s * 2.6) * 0.012 - s * s * 0.03, -D / 2 - 0.004 - Math.sin(s * 2.4) * 0.012], () => [1, 0, 0], (s) => W / 2 * (0.98 - 0.1 * s * s), 18);
    const strap = strip(10, 2, (s) => [0, y0 - 0.006 + s * 0.085, -D / 2 - 0.0022 + Math.sin(s * 3) * 0.006 * (1 - s) + s * 0.013], () => [1, 0, 0], () => 0.0095, 18);
    const brass = [hl([[0.0005, 0], [0.0042, 0], [0.0046, 0.0015], [0.003, 0.003], [0.0005, 0.0032]], 1, 1, 10).rotateX(-HX).translate(0, y0 - 0.028, -D / 2 - 0.0125), rbx(0.022, 0.0035, 0.004, 0.001, 0, y0 + 0.004, -D / 2 - 0.0036)];
    // the cross, painted and worn, and the bottle, the gauze and the scissors at the mouth
    const cross = [rbx(0.03, 0.009, 0.001, 0.0003, 0, cy + 0.002, D / 2 * 1.075), rbx(0.009, 0.03, 0.001, 0.0003, 0, cy + 0.002, D / 2 * 1.075)];
    const rp = rollParts(0.012, 0.034); for (const g of [rp.body].concat(rp.ends)) { g.rotateZ(HX); g.translate(-0.026, y0 + 0.006, 0.002); }
    const bott = [hl([[0.0005, -0.03], [0.0085, -0.03], [0.0095, -0.028], [0.0095, 0.0], [0.0075, 0.005], [0.0045, 0.008], [0.0045, 0.014], [0.0055, 0.015], [0.0055, 0.018], [0.0005, 0.018]], 1, 1, 14).translate(0.014, y0 + 0.002, -0.004)];
    const cork = corkG(0.0042, y0 + 0.0182, 0.006).translate(0.014, 0, -0.004);
    const sc = []; for (const sx of [-1, 1]) sc.push(new THREE.TorusGeometry(0.0062, 0.0014, 5, 14).rotateY(0.2).translate(0.036 + sx * 0.0068, y0 + 0.012, 0.004 + sx * 0.002), wire([[0.036 + sx * 0.004, y0 + 0.006, 0.004], [0.036 + sx * 0.0015, y0 - 0.01, 0.004]], 0.0012, 5, false));
    return [gq('canvas', [body]), gq('canvas', [flap]), gq('leather', strap), gq('brassOld', brass), gq('canvasDk', pipe), gq('cross', cross),
      gq('linen', rp.body), gq('rollEnd', rp.ends), gq('glassBrown', bott), gq('cork', cork), gq('steel', sc), gq('label', rbx(0.026, 0.02, 0.003, 0.001, -0.004, y0 + 0.002, -0.011, [0.2, 0, 0.1])), gq('dark', rbx(W - 0.012, 0.003, D - 0.01, 0.001, 0, y0 + 0.0003, 0))];
  };

  // ---- what is drunk from: each its own vessel. Glass is thick (its inner face is drawn too), what it holds stands in it from its
  // foot at 'at' up to how full it is (itemanim lowers it as it is drunk); a cork, wax over it, a label of paper, a string ----
  const VLIQ = (pts, at, seg) => ({ g: Geo.lathe(pts, seg || 16), m: 'liq', tag: 'liq', at });
  // an apothecary's phial: a round shoulder, a lip; corked, waxed, tied, labelled in a hand
  ITEM.phial = () => [
    gq('glass', Geo.lathe([[0.0005, -0.05], [0.017, -0.05], [0.0205, -0.047], [0.0215, -0.04], [0.0215, 0.018], [0.0195, 0.026], [0.012, 0.034], [0.0085, 0.04], [0.0085, 0.058], [0.0105, 0.061], [0.0105, 0.065], [0.0075, 0.066], [0.006, 0.066], [0.006, 0.04], [0.011, 0.033], [0.0185, 0.024], [0.0195, 0.016], [0.0195, -0.04], [0.017, -0.044], [0.0005, -0.0445]], 18)),
    VLIQ([[0.0005, 0], [0.0166, 0], [0.0188, 0.004], [0.0188, 0.05], [0.0005, 0.05]], [0, -0.0443, 0]),
    gq('label', wrapLabel(0.0218, -0.95, 0.95, -0.034, 0.008, 14)),
    gq('cork', corkG(0.0061, 0.058, 0.012)), gq('wax', waxG(0.0098, 0.06, 0.012, 0.007)),
    gq('cord', tieG(0.0089, 0.044, 0.016).concat([rbx(0.016, 0.022, 0.0006, 0.0002, 0.006, 0.02, 0.024, [0.15, 0.35, 0.2])])),
  ];
  ITEM.drink = ITEM.phial;
  // a pilgrim's flask of pewter: a round body flattened like a lens, a raised rim about it, a cross and a ring struck on its face, two
  // loops at its shoulders with a cord through them, a short neck, a cork
  ITEM.ampulla = () => {
    const lens = new THREE.SphereGeometry(0.031, 22, 14), ps = lens.attributes.position; for (let i = 0; i < ps.count; i++) { const y = ps.getY(i); ps.setXYZ(i, ps.getX(i), y * 1.12 - 0.008, ps.getZ(i) * 0.42 * (1 - 0.15 * Math.max(0, y / 0.031))); } lens.computeVertexNormals();
    const face = []; for (const sz of [-1, 1]) face.push(rbx(0.0034, 0.024, 0.0016, 0.0005, 0, -0.008, sz * 0.0128), rbx(0.017, 0.0034, 0.0016, 0.0005, 0, -0.004, sz * 0.0128), new THREE.TorusGeometry(0.0205, 0.0009, 4, 28).scale(1, 1.12, 1).translate(0, -0.008, sz * 0.0113));
    return [gq('pewter', [lens, new THREE.TorusGeometry(0.0312, 0.0021, 6, 36).scale(1, 1.12, 1).translate(0, -0.008, 0), hl([[0.0062, 0.022], [0.0068, 0.03], [0.0058, 0.038], [0.0061, 0.043], [0.0076, 0.045], [0.0076, 0.048], [0.005, 0.0485]], 1, 1, 14),
        new THREE.TorusGeometry(0.0062, 0.0017, 5, 10, Math.PI).rotateZ(-0.5).translate(0.0145, 0.026, 0), new THREE.TorusGeometry(0.0062, 0.0017, 5, 10, Math.PI).rotateZ(0.5 + Math.PI).rotateY(Math.PI).translate(-0.0145, 0.026, 0)].concat(face)),
      gq('cork', corkG(0.0049, 0.046, 0.008)), gq('wax', waxG(0.0072, 0.0465, 0.008, 0.004)),
      gq('cord', wire([[0.019, 0.028, 0], [0.022, 0.036, 0.003], [0.014, 0.05, 0.005], [0, 0.056, 0.005], [-0.014, 0.05, 0.005], [-0.022, 0.036, 0.003], [-0.019, 0.028, 0]], 0.0011, 4, 20))];
  };
  // a flask of stoneware: brown salt glaze over it, mottled, its foot left bare (the clay shows where the glaze stops, unevenly); a
  // darker slip dipped over its neck and shoulder that has run down in drips; a cord about its neck, a cork
  ITEM.stoneware = () => {
    const P = [[0.0005, -0.055], [0.022, -0.055], [0.024, -0.0535], [0.0242, -0.051], [0.0275, -0.05], [0.031, -0.043], [0.0325, -0.028], [0.031, -0.006], [0.026, 0.014], [0.0165, 0.029], [0.0095, 0.035], [0.0088, 0.05], [0.0108, 0.0525], [0.011, 0.057], [0.0078, 0.058]];
    const clay = Geo.lathe(P, 24), glz = Geo.lathe(P.filter((p) => p[1] > -0.046).map((p) => [p[0] + 0.0004, p[1]]), 24), gp = glz.attributes.position;
    for (let i = 0; i < gp.count; i++) { const x = gp.getX(i), z = gp.getZ(i), y = gp.getY(i); if (y < -0.04) { const a = Math.atan2(z, x); gp.setY(i, y + 0.004 + 0.004 * Math.sin(a * 3 + 1) + 0.003 * Math.sin(a * 7) - 0.006 * Math.max(0, Math.sin(a * 5 + 2)) * Math.max(0, Math.sin(a * 2))); } }
    glz.computeVertexNormals();
    const top = P.filter((p) => p[1] > -0.012), dip = Geo.lathe(top.map((p) => [p[0] + 0.0008, p[1]]), 40), dp = dip.attributes.position;
    for (let i = 0; i < dp.count; i++) { const x = dp.getX(i), z = dp.getZ(i), y = dp.getY(i); if (y < 0) { const a = Math.atan2(z, x), drip = Math.pow(Math.max(0, Math.sin(a * 6 + 0.7)), 6) * 0.022 + Math.pow(Math.max(0, Math.sin(a * 11 + 2.1)), 8) * 0.012; dp.setY(i, y + 0.006 * Math.sin(a * 4) - drip); const r = Math.hypot(x, z), rr = r - Math.max(0, -dp.getY(i) - 0.012) * 0.12; dp.setX(i, x / r * rr); dp.setZ(i, z / r * rr); } }
    dip.computeVertexNormals();
    return [gq('clay', clay), gq('glaze', glz), gq('glazeDk', dip), gq('cork', corkG(0.0074, 0.054, 0.009)), gq('cord', tieG(0.0094, 0.042, 0.02))];
  };
  // a bottle of brown glass with flat sides, ribbed at its edges as a poison bottle is, a label on its face, a cork
  ITEM.tonic = () => {
    const ribs = []; for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) ribs.push(rbx(0.0012, 0.05, 0.0012, 0.0004, sx * 0.0198, -0.012, -0.009 + i * 0.0045));
    return [gq('glassBrown', [X.makeRbox(0.04, 0.072, 0.024, 0.006, 2).translate(0, -0.016, 0), hl([[0.006, 0.016], [0.011, 0.022], [0.0068, 0.03], [0.0068, 0.042], [0.0088, 0.044], [0.0088, 0.049], [0.0055, 0.0495]], 1, 1, 14)].concat(ribs)),
      { g: X.makeRbox(0.034, 0.05, 0.018, 0.004, 1).translate(0, 0.025, 0), m: 'liq', tag: 'liq', at: [0, -0.049, 0] },
      gq('label', rbx(0.03, 0.038, 0.0007, 0.0002, 0, -0.018, 0.0123)), gq('cork', corkG(0.0052, 0.044, 0.01))];
  };
  // a slim vial of clear glass with a ground glass stopper, a paper tag tied to its neck
  ITEM.vial = () => [
    gq('glass', [Geo.lathe([[0.0005, -0.05], [0.004, -0.0495], [0.0072, -0.046], [0.0082, -0.04], [0.0082, 0.03], [0.0088, 0.033], [0.0088, 0.036], [0.0062, 0.0365], [0.0062, 0.033], [0.007, 0.03], [0.007, -0.04], [0.006, -0.0445], [0.0005, -0.045]], 16),
      hl([[0.0005, 0.024], [0.0055, 0.024], [0.0061, 0.036], [0.0075, 0.038], [0.008, 0.042], [0.0062, 0.05], [0.0005, 0.052]], 1, 1, 14)]),
    VLIQ([[0.0005, 0], [0.006, 0], [0.0068, 0.004], [0.0068, 0.06], [0.0005, 0.06]], [0, -0.0445, 0]),
    gq('cord', tieG(0.0086, 0.028, 0.01)), gq('label', rbx(0.012, 0.018, 0.0006, 0.0002, 0.006, 0.012, 0.012, [0.1, 0.5, -0.3]))];
  // a small round bottle with a long neck, sealed (the fairy's: what is in it is pale and clouded)
  ITEM.fairy = () => [
    gq('glass', Geo.lathe([[0.0005, -0.03], [0.012, -0.03], [0.019, -0.022], [0.021, -0.008], [0.018, 0.006], [0.0085, 0.014], [0.0058, 0.02], [0.0058, 0.044], [0.0074, 0.046], [0.0074, 0.049], [0.0045, 0.0495], [0.0042, 0.02], [0.0068, 0.0145], [0.0165, 0.006], [0.0192, -0.008], [0.0172, -0.021], [0.011, -0.0265], [0.0005, -0.027]], 18)),
    VLIQ([[0.0005, 0], [0.0108, 0], [0.0168, 0.005], [0.0188, 0.019], [0.0165, 0.032], [0.0005, 0.032]], [0, -0.0262, 0]),
    gq('cork', corkG(0.0041, 0.044, 0.008)), gq('wax', waxG(0.0068, 0.045, 0.008, 0.005)), gq('cord', tieG(0.0063, 0.03, 0.012))];
  // the sleeve of the arm that holds a thing, from the glove's cuff (the origin) back along +z towards the elbow: a cuff turned back,
  // the cloth loose and creased about the forearm
  ITEM.sleeveArm = () => [gq('sleeve', ringTube(-0.004, 0.34, 12, 18, (z, a) => (0.033 + 0.012 * Math.min(1, z / 0.25)) * (1 + 0.06 * Math.sin(a * 4 + z * 50) * Math.min(1, z * 12) + 0.03 * Math.sin(a * 7 - z * 80)) * (0.92 + 0.08 * Math.abs(Math.cos(a))) + (z < 0.03 ? 0.004 * Math.sin(Math.PI * Math.max(0, z) / 0.03) : 0), 6, 16))];
  // which vessel each draught comes in (the rest: the phial)
  X.VESSEL = { h_elixir: 'phial', h_water: 'ampulla', h_ambrosia: 'stoneware', u_iron: 'tonic', u_invis: 'vial', h_fairy: 'fairy' };
  // ---- the golden apple: an apple ripened to gold and russet (its skin: appleSkin), its shoulders a little uneven, the hollow of its
  // stalk and its eye with the dry sepals in it, a woody stalk, one leaf with its midrib ----
  ITEM.apple = () => {
    const g = new THREE.LatheGeometry(spl([[0.0005, -0.033], [0.006, -0.0345], [0.013, -0.037], [0.024, -0.034], [0.036, -0.022], [0.043, -0.004], [0.044, 0.01], [0.04, 0.024], [0.03, 0.033], [0.016, 0.034], [0.007, 0.028], [0.0005, 0.024]], 26), 28), ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i), a = Math.atan2(z, x), k = 1 + 0.035 * Math.sin(a * 5 + 0.4) * Math.max(0, -y / 0.03) + 0.02 * Math.sin(a * 3 + 1.3) * Math.max(0, y / 0.03) + 0.01 * Math.sin(a * 2); ps.setX(i, x * k); ps.setZ(i, z * k); }
    g.computeVertexNormals();
    const sep = []; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; sep.push(wire([[Math.cos(a) * 0.0015, -0.0335, Math.sin(a) * 0.0015], [Math.cos(a) * 0.004, -0.0352, Math.sin(a) * 0.004], [Math.cos(a + 0.3) * 0.0062, -0.0345, Math.sin(a + 0.3) * 0.0062]], 0.0009, 3, 4)); }
    const leaf = Geo.xf(sheet(-0.042, 0, (v) => 0.013 * Math.pow(Math.sin(Math.PI * (0.06 + 0.92 * v)), 0.8), (x, v) => -x * x * 16 + Math.sin(v * 7) * 0.0008, 7, 4, 0), [0.003, 0.043, 0.002], [0.5, 0.4, -2.0]);
    return [gq('appleSkin', g), gq('stalk', [tubeR([[0, 0.025, 0], [0.0012, 0.036, 0.0005], [0.004, 0.047, 0.001]], (t) => 0.0018 - t * 0.0006, 5, 6)].concat(sep)), gq('leaf', leaf), gq('stalk', wire([[0.003, 0.043, 0.002], [0.016, 0.054, 0.012], [0.03, 0.06, 0.02]], 0.0006, 3, 6))];
  };
  // ---- the troll's heart: too large for a man's, its apex turned aside; the ventricles' swell and the groove between them, the atria
  // over them, the great vessels cut short (their bores dark), a coronary down its face (the fat lies in its flesh: the surface) ----
  const heartAt = (dx, dy, dz) => {
    const l = Math.hypot(dx, dy, dz) || 1, x = dx / l, y = dy / l, z = dz / l;
    let r = 0.05 * (1 - 0.42 * Math.pow(Math.max(0, -y), 1.6)) * (1 + 0.06 * Math.max(0, x) * Math.max(0, -y + 0.3) + 0.05 * Math.max(0, z));
    r -= 0.0035 * Math.exp(-Math.pow((x * 0.8 + z * 0.6 - 0.15 + y * 0.25) / 0.09, 2)) * Math.max(0, z + 0.3);
    r *= 1 + 0.025 * Math.sin(x * 9 + y * 7) * Math.sin(z * 8 - y * 5) + 0.012 * Math.sin(x * 23 + z * 19 + y * 11) - 0.03 * Math.max(0, y - 0.55) * (1 + Math.sin(Math.atan2(z, x) * 7));
    return [x * r - Math.max(0, -y) * 0.016 * (1 - y), y * r * 1.18, z * r * 0.88];
  };
  ITEM.heart = () => {
    const g = new THREE.SphereGeometry(1, 40, 28), ps = g.attributes.position;
    for (let i = 0; i < ps.count; i++) { const p = heartAt(ps.getX(i), ps.getY(i), ps.getZ(i)); ps.setXYZ(i, p[0], p[1], p[2]); }
    g.computeVertexNormals();
    const at = (u, v) => heartAt(Math.cos(u) * Math.cos(v), Math.sin(v), Math.sin(u) * Math.cos(v)), out = (p, k) => p.map((c) => c * k);
    const cor = []; for (const [u0, u1, w] of [[1.25, 1.05, 0.0018], [1.9, 2.15, 0.0012]]) { const pts = []; for (let i = 0; i <= 6; i++) { const v = 0.7 - i * 0.25; pts.push(out(at(u0 + (u1 - u0) * i / 6, v), 1.012)); } cor.push(tubeR(pts, (t) => w - t * w * 0.6, 4, 14)); }
    const fat = []; for (let i = 0; i < 9; i++) { const u = i * 0.73 + (i % 2) * 0.2, v = 0.52 + (i % 3) * 0.04, p = out(at(u, v), 0.982); const b = ball(0.0042 + (i % 3) * 0.0014, [0, 0, 0], [1.6, 0.28, 1.1]); const n = new THREE.Vector3(p[0], p[1] * 0.6, p[2]).normalize(); b.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)); b.translate(p[0], p[1], p[2]); fat.push(b); }
    const ves = [tubeR([[0.002, 0.045, 0.004], [0.003, 0.064, 0.005], [-0.005, 0.074, 0.0], [-0.014, 0.072, -0.008], [-0.019, 0.064, -0.012]], 0.0088, 10, 16), tubeR([[0.014, 0.04, 0.02], [0.016, 0.064, 0.026], [0.012, 0.076, 0.03]], 0.009, 10, 8), tubeR([[0.03, 0.03, -0.012], [0.034, 0.064, -0.014]], 0.0075, 8, 6), tubeR([[-0.026, 0.034, -0.026], [-0.03, 0.05, -0.036]], 0.0058, 8, 6)];
    const bores = [[[-0.019, 0.064, -0.012], [-0.4, -0.7, -0.45], 0.007], [[0.012, 0.076, 0.03], [-0.25, 0.75, 0.3], 0.007], [[0.034, 0.064, -0.014], [0.1, 1, -0.05], 0.0056], [[-0.03, 0.05, -0.036], [-0.2, 0.75, -0.55], 0.0042]].map(([p, n, r]) => { const d = new THREE.CircleGeometry(r, 12), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n[0], n[1], n[2]).normalize()); d.applyQuaternion(q); const nn = new THREE.Vector3(n[0], n[1], n[2]).normalize(); d.translate(p[0] + nn.x * 0.0004, p[1] + nn.y * 0.0004, p[2] + nn.z * 0.0004); return d; });
    return [gq('flesh', [g]), gq('vessel', ves.concat(cor.slice(0, 1))), gq('lumen', bores)];
  };
  // ---- a plate of armour to slip into a vest: forged steel dished a little both ways, its top edge rolled over, its other edges
  // turned, hammer marks over its face, a lining of leather riveted at its sides, the armourer's stamp ----
  ITEM.plate = () => {
    const W = 0.075, H = 0.09, bend = (x, y) => -2.4 * x * x - 1.2 * y * y, ham = (x, y) => 0.0006 * Math.sin(x * 260 + Math.sin(y * 190) * 2) * Math.sin(y * 230 + x * 70);
    const face = sheet(-H, H, (v) => W * (0.92 + 0.08 * v) - Math.pow(Math.abs(v - 0.5) * 2, 6) * 0.006, (x, v) => { const y = -H + 2 * H * v; return bend(x, y) + ham(x, y); }, 12, 12, 0.004);
    const edge = (y, k) => { const pts = []; for (let i = 0; i <= 12; i++) { const x = (i / 12 * 2 - 1) * W * (0.92 + 0.08 * k) * 0.99; pts.push([x, y, bend(x, y) - 0.0015]); } return tubeR(pts, 0.0036, 6, false); };
    const side = (sx) => { const pts = []; for (let i = 0; i <= 10; i++) { const y = -H + 2 * H * i / 10, x = sx * (W * (0.92 + 0.08 * i / 10) - 0.001); pts.push([x, y, bend(x, y) - 0.001]); } return tubeR(pts, 0.0022, 5, false); };
    const rv = []; for (const sx of [-1, 1]) for (const k of [-0.6, 0, 0.6]) { const y = k * H, x = sx * (W * (0.92 + 0.08 * (k + 1) / 2) - 0.007); rv.push(ball(0.0034, [x, y, bend(x, y) + 0.001], [1, 1, 0.55]), hl([[0.0005, 0], [0.0052, 0], [0.0052, 0.0008], [0.0005, 0.001]], 1, 1, 10).rotateX(HX).translate(x, y, bend(x, y) - 0.0005)); }
    const lining = []; for (const sx of [-1, 1]) lining.push(sheet(-H * 0.94, H * 0.94, () => 0.006, (x, v) => { const y = -H + 2 * H * v, xx = sx * (W * (0.92 + 0.08 * v) - 0.004); return bend(xx, y) - 0.0045; }, 8, 1, 0.002).translate(sx * (W * 0.96 - 0.004), 0, 0));
    const stamp = [new THREE.TorusGeometry(0.008, 0.0009, 4, 18).translate(0, H * 0.55, bend(0, H * 0.55) + 0.0004), rbx(0.0016, 0.009, 0.0008, 0.0003, 0, H * 0.55, bend(0, H * 0.55) + 0.0004)];
    return [gq('plateSteel', [face, edge(H, 1), edge(-H, 0), side(-1), side(1)].concat(stamp)), gq('brassOld', rv), gq('leather', lining)];
  };
  // ---- the smith-god's hammer: a cross-peen hammer, its head forged and chamfered, the face a little domed and bright with use, the
  // peen drawn to a rounded edge, a band of old gold let into it; the handle of ash through the eye, wedged, dark where it is held ----
  ITEM.smithHammer = () => {
    const head = [rbx(0.07, 0.036, 0.034, 0.005, 0, 0, 0), hl([[0.0005, -0.048], [0.0175, -0.048], [0.0195, -0.045], [0.0195, -0.034], [0.017, -0.03], [0.0005, -0.03]], 1, 1, 18).rotateZ(-HX).translate(0, 0, 0),
      ext([[0.033, 0.018], [0.058, 0.009], [0.066, 0.004], [0.068, 0], [0.066, -0.004], [0.058, -0.009], [0.033, -0.018]], 0.034, 0.003)];
    const face = hl([[0.0005, -0.0505], [0.0185, -0.0495], [0.0192, -0.048], [0.0005, -0.0478]], 1, 1, 18).rotateZ(-HX);
    const band = [rbx(0.008, 0.0372, 0.0352, 0.0052, 0.012, 0, 0), rbx(0.008, 0.0372, 0.0352, 0.0052, -0.012, 0, 0)];
    const handle = hl([[0.0005, -0.33], [0.0155, -0.33], [0.017, -0.31], [0.0165, -0.27], [0.0135, -0.2], [0.0122, -0.1], [0.0128, -0.03], [0.0118, 0.02], [0.0005, 0.02]], 0.72, 1, 14).rotateY(HX);
    return [gq('forged', head), gq('steel', face), gq('goldOld', band), gq('wood', [handle, rbx(0.004, 0.003, 0.02, 0.001, 0, 0.0195, 0)]), gq('steel', rbx(0.0016, 0.004, 0.022, 0.0006, 0.004, 0.0205, 0))];
  };
  // ---- the master's repair kit: a roll of oiled leather laid open, its pockets holding an awl, a pair of pliers, a needle and a spool
  // of waxed thread, a small hammer; the rest of it still rolled up at one end, its tie hanging ----
  ITEM.toolRoll = () => {
    const L = 0.2, D = 0.11, R = 0.016, x0 = L / 2 - 0.035;
    // (the sheet flat on the ground along x, its far end rolled up round z, getting tighter)
    const sheetL = strip(18, 6, (s) => { const d = -L / 2 + s * (L + 0.06); if (d <= x0) return [d, 0.0012 * Math.sin(s * 9), 0]; const ph = (d - x0) / R, r = R * (1 - 0.1 * ph / 6.3); return [x0 + Math.sin(ph) * r, R - Math.cos(ph) * r, 0]; }, () => [0, 0, 1], () => D / 2, 18);
    const flap = rbx(x0 + L / 2 - 0.01, 0.003, 0.04, 0.0012, (x0 - L / 2) / 2, 0.0028, D / 2 - 0.022);
    const seams = [-0.06, -0.025, 0.01].map((x) => rbx(0.0012, 0.0036, 0.038, 0.0004, x, 0.003, D / 2 - 0.022));
    const lay = (g, x, z) => g.rotateX(HX).translate(x, 0.0075, z);   // (a tool drawn up y, laid across the roll in its pocket)
    const awlW = lay(hl([[0.0005, -0.04], [0.006, -0.04], [0.0075, -0.03], [0.0072, -0.01], [0.0055, 0], [0.0005, 0]], 1, 1, 10), -0.078, 0.012);
    const awlS = [lay(prism(0.0011, 0.04, [0, 0.02, 0], null, 5), -0.078, 0.012), lay(spike(0.0011, 0.006, [0, 0.043, 0], null, 4), -0.078, 0.012)];
    const jaw = (sz) => ext([[-0.002, -0.032], [0.002, -0.032], [0.0028, 0.008], [0.0012, 0.03], [-0.0012, 0.03], [-0.0028, 0.008]], 0.004, 0.0006).rotateZ(sz * 0.1).translate(sz * 0.0026, 0, 0);
    const pliers = [jaw(1), jaw(-1), prism(0.003, 0.008, [0, 0.006, 0], [HX, 0, 0], 8)].map((g) => g.rotateX(-HX).rotateY(HX).rotateX(HX).translate(-0.042, 0.0065, 0.008));
    const mhH = lay(hl([[0.0005, -0.055], [0.0042, -0.055], [0.0036, 0], [0.0005, 0]], 0.8, 1, 8), -0.008, 0.02), mhHead = rbx(0.01, 0.01, 0.026, 0.002, -0.008, 0.0075, -0.012);
    const spool = hl([[0.0005, -0.009], [0.009, -0.009], [0.009, -0.0075], [0.0062, -0.0068], [0.0062, 0.0068], [0.009, 0.0075], [0.009, 0.009], [0.0005, 0.009]], 1, 1, 14).rotateX(HX).translate(0.04, 0.0105, -0.01);
    const thread = [hl([[0.0062, -0.0066], [0.0078, -0.006], [0.008, 0.006], [0.0062, 0.0066]], 1, 1, 14).rotateX(HX).translate(0.04, 0.0105, -0.01), wire([[0.048, 0.006, -0.01], [0.058, 0.002, 0.004], [0.052, 0.0016, 0.02], [0.066, 0.0016, 0.03]], 0.0006, 3, 10)];
    const needle = prism(0.0004, 0.034, [0.03, 0.002, 0.03], [HX, 0, 0.3], 4);
    const tie = strip(8, 1, (s) => [x0 + 0.004 + s * 0.03, 0.002 + Math.max(0, 0.02 - s * 0.06), -0.012 - s * 0.034 + Math.sin(s * 5) * 0.004], () => [0, 0, 1], () => 0.004, 18);
    return [gq('leather', [sheetL, tie]), gq('leatherDk', [flap].concat(seams)), gq('wood', [awlW, mhH]), gq('steel', awlS.concat(pliers, [mhHead, needle])),
      gq('cord', [spool].concat(thread)), gq('brassOld', [-0.065, -0.03, 0.005].map((x) => ball(0.0026, [x, 0.0045, D / 2 - 0.004], [1, 0.5, 1])))];
  };
  // a sprig of herbs tied with thread
  ITEM.herb = () => {
    const lf = []; for (let i = 0; i < 7; i++) lf.push(Geo.xf(sheet(-0.09 + (i % 3) * 0.012, 0, (v) => 0.0035 + 0.012 * Math.pow(Math.sin(Math.PI * (1 - v) * 0.92), 0.7), (x) => -x * x * 14, 5, 2, 0), [(i - 3) * 0.006, 0.01, 0], [Math.PI + (i % 2 ? 0.25 : -0.2), i * 0.9, (i - 3) * 0.2]));
    return [gq('green', lf), gq('cord', [new THREE.TorusGeometry(0.011, 0.0025, 4, 10).rotateX(HX).translate(0, 0.0, 0), prism(0.004, 0.05, [0, -0.02, 0], null, 5)])];
  };
  // the small gear: a map with curling edges, a scroll, a quill feather, an hourglass, a case of cartridges, a hand lantern, a whetstone, a box
  ITEM.u_map = () => [gq('paper', sheet(-0.06, 0.06, () => 0.08, (x, v, u) => Math.pow(Math.abs(u), 3) * 0.02 + Math.sin(v * 6) * 0.003, 6, 8, 0)), gq('gun', [rbx(0.05, 0.002, 0.002, 0.0005, -0.02, 0.02, 0.002, [0, 0, 0.5]), rbx(0.04, 0.002, 0.002, 0.0005, 0.02, -0.01, 0.002, [0, 0, -0.7]), new THREE.TorusGeometry(0.008, 0.0012, 3, 10).translate(0.03, 0.022, 0.002)])];
  ITEM.u_wind = () => [gq('paper', hl([[0.0005, -0.06], [0.016, -0.06], [0.018, -0.055], [0.018, 0.055], [0.016, 0.06], [0.0005, 0.06]], 1, 1, 12).rotateZ(HX)), gq('wood', [prism(0.005, 0.15, [0, 0, 0], [0, 0, HX], 6), ball(0.009, [-0.076, 0, 0]), ball(0.009, [0.076, 0, 0])]), gq('wax', hl([[0.0005, 0], [0.01, 0], [0.012, 0.003], [0.0005, 0.005]], 1, 1, 10).rotateX(HX).translate(0, 0, 0.018))];
  ITEM.u_feather = () => [gq('cloth', [sheet(-0.07, 0.07, (v) => 0.003 + 0.02 * Math.pow(Math.sin(Math.PI * (0.04 + 0.9 * v)), 0.6) * (v > 0.12 ? 1 : 0.15), (x) => -x * x * 5, 12, 2, 0), prism(0.0015, 0.16, [0, -0.005, 0.001], null, 4)])];
  ITEM.u_sand = () => [gq('glass', [hl([[0.0005, 0.002], [0.006, 0.004], [0.026, 0.03], [0.028, 0.04], [0.0005, 0.04]], 1, 1, 14), hl([[0.0005, -0.04], [0.028, -0.04], [0.026, -0.03], [0.006, -0.004], [0.0005, -0.002]], 1, 1, 14)]),
    gq('wood', [hl([[0.0005, 0.04], [0.035, 0.04], [0.037, 0.044], [0.035, 0.05], [0.0005, 0.05]], 1, 1, 14), hl([[0.0005, -0.05], [0.035, -0.05], [0.037, -0.044], [0.035, -0.04], [0.0005, -0.04]], 1, 1, 14)].concat([0, 1, 2].map((i) => prism(0.003, 0.082, [Math.cos(i * 2.094) * 0.031, 0, Math.sin(i * 2.094) * 0.031], null, 5)))),
    gq('paper', hl([[0.0005, -0.038], [0.022, -0.038], [0.012, -0.022], [0.0005, -0.016]], 1, 1, 10))];
  ITEM.u_ammo = () => [gq('gun', [rbx(0.12, 0.062, 0.07, 0.006, 0, -0.004, 0), rbx(0.124, 0.014, 0.074, 0.004, 0, 0.03, 0), tubeR([[-0.03, 0.037, 0], [-0.025, 0.055, 0], [0.025, 0.055, 0], [0.03, 0.037, 0]], 0.003, 4, 10)]), gq('brass', [rbx(0.014, 0.022, 0.004, 0.001, 0, 0.018, 0.036), rbx(0.09, 0.004, 0.002, 0.0005, 0, -0.008, 0.0355)])];
  ITEM.u_lantern = () => { const o = []; for (const q of (X.wareGeo && X.wareGeo('revive')) || []) { const g = q.g.clone(); g.scale(0.36, 0.36, 0.36); o.push({ g, m: q.m === 'iron' ? 'gun' : 'glass', tag: null }); } return o; };
  ITEM.u_whet = () => [gq('stone', [rbx(0.12, 0.022, 0.04, 0.005, 0, 0, 0)])];
  ITEM.device = () => [gq('gun', rbx(0.08, 0.055, 0.06, 0.006, 0, 0, 0)), gq('brass', [rbx(0.03, 0.02, 0.064, 0.003, 0, 0.018, 0), rbx(0.084, 0.006, 0.064, 0.002, 0, -0.018, 0), ball(0.005, [0, 0.018, 0.033])])];
  X.itemGeo = function (name) { if (itemC[name] !== undefined) return itemC[name]; let r = null; try { r = ITEM[name] ? ITEM[name]() : null; if (r) for (const q of r) if (q && q.g) { q.g = Geo.weld(q.g); q.g.computeBoundingSphere(); } } catch (e) { console.warn('gfx: no item', name, e); (X.propErr = X.propErr || {})[name] = String(e && e.stack).slice(0, 300); r = null; } return (itemC[name] = r); };

  // ---- what is fitted to a gun (weapons.js), in the gun's own measure (forward is -z): lists of parts { g, m }. A muzzle piece
  // starts at the muzzle and runs forward of it, r its radius there; what hangs under the barrel hangs from the origin ----
  const ATT = {}, attC = {};
  const aq = (m, list) => ({ g: Geo.merge(Array.isArray(list) ? list : [list]), m });
  const ringF = (r, f, t) => lathe([[r - t, f - t], [r, f - t * 0.4], [r, f + t * 0.4], [r - t, f + t]], 16);
  const suppBody = (r) => lathe([[0.0005, 0.004], [r * 0.92, 0.004], [r, 0.012], [r, 0.03], [r * 0.955, 0.033], [r * 0.955, 0.037], [r, 0.04], [r, 0.07], [r * 0.955, 0.073], [r * 0.955, 0.077], [r, 0.08], [r, 0.11], [r * 0.955, 0.113], [r * 0.955, 0.117], [r, 0.12], [r, 0.152], [r * 0.9, 0.162], [r * 0.5, 0.164], [r * 0.42, 0.15], [0.0005, 0.15]], 20);
  // a silencer: a tube with three grooves turned in it, a collar at its root, the bore sunk in its nose; one with lit grooves
  ATT.supp = (r) => [aq('dark', suppBody(r)), aq('steel', lathe([[r * 0.7, -0.004], [r * 1.1, -0.002], [r * 1.1, 0.01], [r, 0.012]], 20))];
  ATT.supp2 = (r) => ATT.supp(r).concat([aq('glow', [0.035, 0.075, 0.115].map((f) => lathe([[r * 0.962, f - 0.0018], [r * 0.975, f], [r * 0.962, f + 0.0018]], 20)))]);
  // a compensator: a short sleeve with ports cut in its top and sides
  ATT.comp = (r) => [aq('steel', lathe([[0.0005, 0], [r * 0.9, 0], [r, 0.006], [r, 0.05], [r * 0.92, 0.055], [r * 0.5, 0.056], [r * 0.45, 0.045], [0.0005, 0.045]], 18)),
    aq('dark', [rb(0.012, 0.004, 0.011, 0.001, 0, r * 0.985, 0.018), rb(0.012, 0.004, 0.011, 0.001, 0, r * 0.985, 0.036), rb(0.004, 0.011, 0.011, 0.001, r * 0.985, 0.003, 0.018), rb(0.004, 0.011, 0.011, 0.001, -r * 0.985, 0.003, 0.018), rb(0.004, 0.011, 0.011, 0.001, r * 0.985, 0.003, 0.036), rb(0.004, 0.011, 0.011, 0.001, -r * 0.985, 0.003, 0.036)])];
  // a muzzle brake: a block wider than it is high, three slots through its sides, two over the top
  ATT.brake = (r) => {
    const w = r * 1.18, h = r * 0.88, dk = [lathe([[0.0005, 0.0704], [r * 0.5, 0.0704], [0.0005, 0.071]], 12)];
    for (const sx of [-1, 1]) for (const f of [0.018, 0.036, 0.054]) dk.push(rb(0.004, h * 1.3, 0.009, 0.001, sx * w, 0, f));
    for (const f of [0.024, 0.048]) dk.push(rb(w * 1.2, 0.004, 0.009, 0.001, 0, h, f));
    return [aq('steel', sec([[-w, -h * 0.6], [-w * 0.7, -h], [w * 0.7, -h], [w, -h * 0.6], [w, h * 0.6], [w * 0.7, h], [-w * 0.7, h], [-w, h * 0.6]], 0, 0.07, 0.003)), aq('dark', dk)];
  };
  // a flash hider: four prongs out of a collar, tied by a ring at their tips
  ATT.flash = (r) => {
    const pr = []; for (let i = 0; i < 4; i++) { const a = i * HX + Math.PI / 4; pr.push(rb(0.0075, 0.0075, 0.052, 0.002, Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86, 0.05, [0, 0, a])); }
    return [aq('steel', [lathe([[0.0005, 0], [r * 0.95, 0], [r * 0.98, 0.004], [r * 0.98, 0.024], [r * 0.6, 0.026], [0.0005, 0.02]], 16), ringF(r * 1.08, 0.075, 0.004)]), aq('dark', pr)];
  };
  // an amplifier: a bell out of a collar, a lit band where it begins
  ATT.amp = (r) => [aq('dark', lathe([[0.0005, 0], [r, 0], [r, 0.03], [r * 1.02, 0.032], [r * 0.9, 0.036], [0.0005, 0.03]], 16)), aq('steel', lathe([[r * 0.95, 0.03], [r * 1.25, 0.045], [r * 2.05, 0.098], [r * 2.12, 0.1], [r * 2.0, 0.1], [r * 1.2, 0.05], [r * 0.9, 0.036]], 20)), aq('glow', lathe([[r * 1.04, 0.027], [r * 1.1, 0.03], [r * 1.04, 0.033]], 16))];
  // a fire nozzle: a fat collar, a lip, a lit ring inside the lip
  ATT.nozzle = () => [aq('dark', lathe([[0.0005, 0], [0.03, 0], [0.034, 0.01], [0.034, 0.045], [0.03, 0.05], [0.026, 0.03], [0.0005, 0.03]], 18)), aq('steel', lathe([[0.034, 0.045], [0.044, 0.05], [0.046, 0.06], [0.04, 0.066], [0.03, 0.06], [0.03, 0.05]], 18)), aq('glow', lathe([[0.03, 0.06], [0.038, 0.0645], [0.03, 0.062]], 18))];
  // a choke: a sleeve drawn in at its mouth, knurled at its root
  ATT.choke = (r) => {
    const kn = []; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; kn.push(rb(0.003, 0.003, 0.008, 0.0008, Math.cos(a) * (r + 0.0085), Math.sin(a) * (r + 0.0085), 0.007, [0, 0, a])); }
    return [aq('steel', lathe([[0.0005, 0], [r + 0.006, 0], [r + 0.008, 0.003], [r + 0.008, 0.011], [r + 0.006, 0.013], [r + 0.005, 0.04], [r + 0.008, 0.042], [r + 0.008, 0.048], [r + 0.003, 0.05], [r * 0.8, 0.05], [r * 0.75, 0.04], [0.0005, 0.04]], 18)), aq('dark', kn)];
  };
  // a bayonet under the muzzle: a blade with a ridge, a ring about the barrel
  ATT.bayonet = (r) => { const b = straight([[0.0, 0.011, 0.011, 0.0046], [0.12, 0.0105, 0.0105, 0.0042], [0.17, 0.007, 0.007, 0.003]], [0.2, 0]); b.rotateX(-HX); b.translate(0, -0.03, 0.05); return [aq('blade', b), aq('dark', [rb(0.012, 0.02, 0.05, 0.003, 0, -0.03, -0.075), new THREE.TorusGeometry(r + 0.005, 0.004, 5, 14).translate(0, 0, 0.04)])]; };
  // the clamp a thing hangs from under the barrel: len long
  const mountG = (len) => [sec([[-0.016, 0.002], [0.016, 0.002], [0.018, -0.004], [0.016, -0.012], [-0.016, -0.012], [-0.018, -0.004]], -len / 2, len / 2, 0.002), prism(0.0035, 0.04, [0, -0.005, -len * 0.28], [0, 0, HX], 6), prism(0.0035, 0.04, [0, -0.005, len * 0.28], [0, 0, HX], 6)];
  const vgripG = () => hl([[0.0005, -0.103], [0.016, -0.103], [0.019, -0.098], [0.019, -0.09], [0.0165, -0.086], [0.0175, -0.075], [0.0155, -0.066], [0.0175, -0.055], [0.0155, -0.046], [0.0175, -0.035], [0.0155, -0.026], [0.017, -0.014], [0.012, -0.01], [0.0005, -0.01]], 0.9, 1.1, 14);
  // a vertical grip with swells for the fingers; the same with a gyro wheel before it; a hand stop; an angled grip; a laser; a bipod
  ATT.vgrip = () => [aq('dark', mountG(0.06).concat([hl([[0.0005, -0.106], [0.017, -0.106], [0.02, -0.1], [0.0195, -0.094], [0.0005, -0.094]], 0.9, 1.1, 14)])), aq('poly', vgripG())];
  ATT.gyro = () => ATT.vgrip().concat([aq('steel', prism(0.026, 0.014, [0, -0.016, -0.045], [0, 0, HX], 16)), aq('glow', new THREE.TorusGeometry(0.0265, 0.002, 4, 20).rotateY(HX).translate(0, -0.016, -0.045)), aq('dark', prism(0.008, 0.02, [0, -0.016, -0.045], [0, 0, HX], 8))]);
  ATT.handstop = () => [aq('dark', mountG(0.07)), aq('poly', side([[0.034, -0.01], [0.036, -0.02], [0.012, -0.05], [-0.008, -0.053], [-0.03, -0.03], [-0.036, -0.01]], 0.028, 0.005))];
  ATT.agrip = () => [aq('dark', mountG(0.08)), aq('poly', side([[0.046, -0.01], [0.05, -0.02], [0.012, -0.062], [-0.028, -0.072], [-0.04, -0.062], [-0.022, -0.032], [-0.046, -0.01]], 0.03, 0.006))];
  ATT.laser = () => [aq('dark', mountG(0.07).concat([rbx(0.026, 0.03, 0.075, 0.005, 0, -0.02, -0.004), rbx(0.006, 0.008, 0.016, 0.002, 0.016, -0.02, 0.015)])), aq('steel', [lathe([[0.0005, 0.04], [0.011, 0.04], [0.012, 0.043], [0.012, 0.054], [0.009, 0.056], [0.0005, 0.05]], 12).translate(0, -0.02, 0), tubeR([[0.012, -0.03, 0.03], [0.02, -0.02, 0.05], [0.014, 0.0, 0.07]], 0.002, 4, 8)])];
  ATT.bipod = () => {
    const st = [], dk = mountG(0.05).concat([rbx(0.042, 0.016, 0.026, 0.004, 0, -0.016, 0)]);
    for (const sx of [-1, 1]) { st.push(tubeR([[sx * 0.016, -0.016, -0.004], [sx * 0.03, -0.042, -0.065]], 0.0048, 6, false), tubeR([[sx * 0.03, -0.042, -0.065], [sx * 0.04, -0.062, -0.115]], 0.0034, 6, false)); dk.push(Geo.rod([sx * 0.029, -0.04, -0.06], [sx * 0.031, -0.044, -0.07], 0.0062, 6), rbx(0.012, 0.007, 0.02, 0.003, sx * 0.04, -0.065, -0.119)); }
    return [aq('steel', st), aq('dark', dk)];
  };
  // a drum under the magazine, its axis along the bore: a turned case, a rim at each face, a winding key and ribs on its front
  ATT.drum = (r) => {
    const dk = [lathe([[0.0005, 0.028], [r * 0.2, 0.028], [r * 0.22, 0.034], [r * 0.1, 0.038], [0.0005, 0.038]], 10)];
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; dk.push(rb(0.004, r * 0.3, 0.003, 0.001, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75, 0.0255, [0, 0, a + HX])); }
    return [aq('metal', lathe([[0.0005, -0.028], [r * 0.55, -0.028], [r * 0.6, -0.024], [r * 0.92, -0.024], [r, -0.018], [r, 0.018], [r * 0.92, 0.024], [r * 0.6, 0.024], [r * 0.55, 0.028], [0.0005, 0.028]], 24)), aq('rim', [ringF(r * 1.025, -0.019, 0.004), ringF(r * 1.025, 0.019, 0.004)]), aq('dark', dk)];
  };
  // stocks. A butt pad bowed to the shoulder on its plate; a spacer before it; a comb for the cheek; a fixed stock with a hole through
  // it, for a gun that has none; a stock of bent wire; a skeleton pad. Each from the origin back (+z)
  ATT.pad = () => [aq('rub', side([[0.0, 0.05], [-0.012, 0.052], [-0.022, 0.03], [-0.026, 0], [-0.022, -0.04], [-0.014, -0.056], [0.0, -0.05]], 0.046, 0.006)), aq('dark', rb(0.05, 0.104, 0.006, 0.002, 0, -0.002, 0.003))];
  ATT.spacer = (L) => [aq('poly', sec([[-0.018, -0.046], [0.018, -0.046], [0.022, -0.036], [0.022, 0.034], [0.016, 0.044], [-0.016, 0.044], [-0.022, 0.034], [-0.022, -0.036]], -L, 0, 0.004))];
  ATT.cheek = () => [aq('rub', sec([[-0.019, 0], [-0.021, 0.014], [-0.013, 0.025], [0.013, 0.025], [0.021, 0.014], [0.019, 0]], -0.13, 0, 0.004)), aq('dark', [prism(0.004, 0.046, [0, 0.008, 0.03], [0, 0, HX], 6), prism(0.004, 0.046, [0, 0.008, 0.1], [0, 0, HX], 6)])];
  ATT.fixed = () => [aq('poly', side([[0, 0.02], [-0.2, 0.016], [-0.2, -0.085], [-0.17, -0.09], [-0.05, -0.04], [0, -0.035]], 0.04, 0.008, [[[-0.06, -0.022], [-0.16, -0.056], [-0.16, -0.006], [-0.06, -0.002]]]))];
  ATT.wire = (L) => [aq('steel', [tubeR([[0, 0.012, -0.01], [0, 0.008, L * 0.5], [0, 0.004, L - 0.01], [0, -0.004, L], [0, -0.038, L], [0, -0.046, L - 0.01], [0, -0.038, L * 0.5], [0, -0.028, -0.01]], 0.0052, 6, 30)]), aq('dark', [rbx(0.016, 0.014, 0.04, 0.004, 0, -0.008, 0.012), tubeR([[0, 0.01, 0.012], [0, -0.04, L * 0.76]], 0.0034, 5, false)]), aq('rub', rbx(0.04, 0.076, 0.012, 0.005, 0, -0.021, L + 0.007))];
  ATT.skelpad = () => [aq('steel', side([[0.0, 0.046], [-0.03, 0.044], [-0.036, 0.03], [-0.036, -0.044], [-0.028, -0.052], [0.0, -0.048]], 0.036, 0.004, [[[-0.006, 0.03], [-0.026, 0.028], [-0.026, -0.034], [-0.006, -0.036]]])), aq('rub', rb(0.04, 0.092, 0.006, 0.002, 0, -0.002, -0.039))];
  X.attGeo = function (name, r) { const k = name + (r ? '|' + r.toFixed(4) : ''); if (attC[k] !== undefined) return attC[k]; let o = null; try { o = ATT[name] ? ATT[name](r) : null; } catch (e) { console.warn('gfx: no attachment', name, e); (X.propErr = X.propErr || {})[name] = String(e && e.stack).slice(0, 300); o = null; } return (attC[k] = o); };

  // ---- a body built of blocks, given one skin: the boxes, balls, rods and cones hung on a joint (they move as one anyway) are melted
  // into one surface for each joint and material. The joints, what moves them and what a shot hits are untouched. A part the model
  // moves by itself (anything its animate() moves, anything it keeps hold of) is left as it is; so is a part too thin to survive ----
  const fuseCache = new Map(), HARD = { golem: 1, beetle: 1, knight: 1, gargoyle: 1 }, NOFUSE = { skeleton: 1, mimic: 1, slime: 1, eye: 1 };
  const POSES = [{ walk: 0.7, mv: 1, atk: 0, wind: 0, flinch: 0, t: 1.3 }, { walk: 2.9, mv: 1, atk: 1, wind: 0, flinch: 0, t: 2.7, throwing: true }, { walk: 4.1, mv: 0, atk: 0, wind: 1, flinch: 1, t: 4.1, stunned: true }, { walk: 5.3, mv: 0.5, atk: 0.5, wind: 0.5, flinch: 0.5, t: 7.9 }];
  X.fuse = function (inner, model, M, plan, o) {
    const S = X.S, PG = G.Props && G.Props.PG; if (!S || !PG || NOFUSE[plan]) return 0;
    o = o || {};
    const kind = new Map([[PG.box, 0], [PG.rbox, 0], [PG.sph, 1], [PG.cyl, 2], [PG.cyl8, 2], [PG.cone, 3]]);
    const all = []; inner.traverse((v) => all.push(v));
    // what the model keeps hold of
    const held = new Set(), seen = new Set();
    const walk = (v, d) => {
      if (!v || typeof v !== 'object' || d > 5 || seen.has(v)) return; seen.add(v);
      if (v.isObject3D) { if (v.isMesh) held.add(v); return; }
      if (v.isMaterial || v.isBufferGeometry || v.isTexture || v.isVector3 || v.isColor || v.isQuaternion || v.isEuler) return;
      for (const k in v) walk(v[k], d + 1);
    };
    walk(model, 0);
    // what its animate() moves by itself: try some poses, see which meshes moved, put everything back
    if (model.animate && !o.still) {
      const snap = all.map((v) => [v.position.clone(), v.quaternion.clone(), v.scale.clone(), v.visible]);
      let ok = true;
      try {
        for (const a of POSES) {
          model.animate(a);
          for (let i = 0; i < all.length; i++) { const v = all[i], q = snap[i]; if (v.isMesh && (!v.position.equals(q[0]) || !v.quaternion.equals(q[1]) || !v.scale.equals(q[2]) || v.visible !== q[3])) held.add(v); }
        }
      } catch (e) { ok = false; }
      for (let i = 0; i < all.length; i++) { const v = all[i], q = snap[i]; v.position.copy(q[0]); v.quaternion.copy(q[1]); v.scale.copy(q[2]); v.visible = q[3]; }
      if (!ok) return 0;
    }
    const hard = !!HARD[plan], fixed = M ? [M.skin, M.sec].concat((model && model.mats) || []) : null, inv = new THREE.Quaternion(), m4 = new THREE.Matrix4();
    const rnd = o.round || (hard ? 0.3 : 0.62), blend = o.blend || (hard ? 0.025 : 0.075);
    let made = 0;
    for (const g of all) {
      if (g.isMesh || !g.children.length) continue;
      // (a body's own two materials; or, where parts are chosen one by one, whatever plain material they wear)
      for (const mat of fixed || [...new Set(g.children.filter((c) => c.isMesh && c.material && !Array.isArray(c.material) && !c.material.transparent).map((c) => c.material))]) {
        const P = [];
        for (const c of g.children) {
          if (!c.isMesh || c.material !== mat || !kind.has(c.geometry) || held.has(c) || (o.pick && !o.pick(c)) || !c.visible || c.children.length) continue;
          const sx = Math.abs(c.scale.x), sy = Math.abs(c.scale.y), sz = Math.abs(c.scale.z), t = kind.get(c.geometry);
          if (!(sx > 0 && sy > 0 && sz > 0)) continue;
          const e = m4.makeRotationFromQuaternion(inv.copy(c.quaternion).invert()).elements.slice(0, 11);
          P.push({ c, t, sx, sy, sz, e, x: c.position.x, y: c.position.y, z: c.position.z,
            thin: t === 0 ? Math.min(sx, sy, sz) : t === 1 ? Math.min(sx, sy, sz) * 2 : Math.min(Math.min(sx, sz) * 2, sy),
            ext: t === 0 ? Math.hypot(sx, sy, sz) / 2 : t === 1 ? Math.max(sx, sy, sz) : Math.hypot(Math.max(sx, sz), sy / 2) });
        }
        if (!P.length) continue;
        const box = (list) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const q of list) { lo[0] = Math.min(lo[0], q.x - q.ext); lo[1] = Math.min(lo[1], q.y - q.ext); lo[2] = Math.min(lo[2], q.z - q.ext); hi[0] = Math.max(hi[0], q.x + q.ext); hi[1] = Math.max(hi[1], q.y + q.ext); hi[2] = Math.max(hi[2], q.z + q.ext); } return [lo, hi]; };
        let [lo, hi] = box(P);
        const L0 = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), cell = o.free ? Math.max(0.011, L0 / 34) : Math.min(0.07, Math.max(0.011, L0 / 34));
        // the distance from a point to one part (a part: a box, a ball, a rod, a cone as the body was built; or a ball put at a joint)
        const sd1 = (q, x, y, z) => {
          if (q.t === 4) return Math.hypot(x - q.x, y - q.y, z - q.z) - q.r;
        const e = q.e, px = x - q.x, py = y - q.y, pz = z - q.z, lx = e[0] * px + e[4] * py + e[8] * pz, ly = e[1] * px + e[5] * py + e[9] * pz, lz = e[2] * px + e[6] * py + e[10] * pz;
          let v;
          if (q.t === 0) { const hx = q.sx / 2, hy = q.sy / 2, hz = q.sz / 2; v = S.box(lx, ly, lz, 0, 0, 0, hx, hy, hz, Math.min(hx, hy, hz) * rnd); }
          else if (q.t === 1) v = S.ell(lx, ly, lz, 0, 0, 0, q.sx, q.sy, q.sz);
          else {
            const r = Math.min(q.sx, q.sz), qx = lx * r / q.sx, qz = lz * r / q.sz;
            if (q.t === 2) { const rr = Math.min(r, q.sy / 2) * rnd * 0.65, dr = Math.hypot(qx, qz) - r + rr, dy = Math.abs(ly) - q.sy / 2 + rr; v = Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) + Math.min(Math.max(dr, dy), 0) - rr; }
            else v = S.cone(qx, ly, qz, 0, -q.sy / 2 + r * 0.35, 0, 0, q.sy / 2 - r * 0.1, 0, r * 0.92, r * 0.1);
          }
          return v;
        };
        const use = P.filter((q) => q.thin >= cell * 2.2);
        if (!use.length || (use.length === 1 && use[0].t !== 0)) continue;   // (a ball or a rod alone is already what it should be)
        // (a ball at the pivot this part of the body turns on, as thick as the limb that ends there: a knee, an elbow, a shoulder then stays
        // closed however it bends - the end of the next limb is always inside the ball)
        if (!o.free) {
          let best = null, bd = 1e9; for (const q of use) { const v = sd1(q, 0, 0, 0); if (v < bd) { bd = v; best = q; } }
          if (best && best.t !== 1 && bd < best.thin * 0.45 && bd > -best.thin * 0.5) use.push({ t: 4, x: 0, y: 0, z: 0, r: best.thin * 0.5, thin: best.thin, ext: best.thin * 0.5, c: null });
        }
        [lo, hi] = box(use);
        const L = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]), k = Math.min(o.free ? 0.4 : 0.12, Math.max(0.012, L * blend)), pad = k + cell * 2;
        const uvm = (mat.userData && mat.userData.uvk) || 1.5, key = rnd.toFixed(2) + ',' + blend.toFixed(3) + ',' + cell.toFixed(4) + ',' + uvm + use.map((q) => q.t + ',' + (q.c ? [q.x, q.y, q.z, q.sx, q.sy, q.sz, q.c.quaternion.x, q.c.quaternion.y, q.c.quaternion.z, q.c.quaternion.w] : [q.r]).map((v) => v.toFixed(3)).join(',')).join('|');
        let geo = fuseCache.get(key);
        if (geo === undefined) {
          const fn = (x, y, z) => { let d = 1e9; for (let n = 0; n < use.length; n++) { const v = sd1(use[n], x, y, z); d = n ? S.smin(d, v, k) : v; } return d; };
          geo = null;
          try {
            const t0 = performance.now();
            const gm = S.mesh(fn, [lo[0] - pad, lo[1] - pad, lo[2] - pad], [hi[0] + pad, hi[1] + pad, hi[2] + pad], cell);
            if (gm.attributes.position && gm.attributes.position.count >= 12) {
              // (the texture at one grain on every part, whatever its size)
              const ps = gm.attributes.position, nr = gm.attributes.normal, uv = gm.attributes.uv, uvk = o.free ? (mat.userData && mat.userData.uvk) || 2.4 / L : uvm;   // (a guardian's part is metres across: the texture by the part, not by the metre)
              for (let n = 0; n < ps.count; n++) { const ax = Math.abs(nr.getX(n)), ay = Math.abs(nr.getY(n)), az = Math.abs(nr.getZ(n)), x = ps.getX(n) * uvk, y = ps.getY(n) * uvk, z = ps.getZ(n) * uvk; if (ax >= ay && ax >= az) uv.setXY(n, z, y); else if (ay >= az) uv.setXY(n, x, z); else uv.setXY(n, x, y); }
              geo = gm;
            }
            X.stats.fuse = (X.stats.fuse || 0) + (performance.now() - t0); X.stats.fused = (X.stats.fused || 0) + 1;
          } catch (e2) { geo = null; }
          fuseCache.set(key, geo);
        }
        if (!geo) continue;
        const nm = new THREE.Mesh(geo, mat); nm.castShadow = true; g.add(nm);
        for (const q of use) if (q.c) g.remove(q.c);
        made++;
      }
    }
    return made;
  };
})();
