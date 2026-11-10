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
float fbm(vec2 uv, float per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 7; i++) { s += a * vnoise(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; } return s / n; }
float fbm3(vec2 uv, float per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 3; i++) { s += a * vnoise(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; } return s / n; }
float vnA(vec2 p, vec2 per, float seed){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); vec2 s = vec2(seed * 13.7, seed * 5.3);
  float a = hash12(mod(i, per) + s), b = hash12(mod(i + vec2(1., 0.), per) + s), c = hash12(mod(i + vec2(0., 1.), per) + s), d = hash12(mod(i + vec2(1., 1.), per) + s);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbmA(vec2 uv, vec2 per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 5; i++) { s += a * vnA(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; } return s / n; }
float ridge(vec2 uv, float per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 5; i++) { float v = 1. - abs(vnoise(uv * per, per, seed + float(i) * 3.) * 2. - 1.); s += a * v * v; n += a; a *= .5; per *= 2.; } return s / n; }
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
  // from the height (r of tH; g roughness, b metalness): the normal, or occlusion / roughness / metalness
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
  gl_FragColor = vec4(clamp(1. - acc / 12. * aoStr, 0., 1.), clamp(s.g, 0.03, 1.), clamp(s.b, 0., 1.), 1.);
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
    const rt = (srgb) => { const t = new THREE.WebGLRenderTarget(px, px, { depthBuffer: false }); if (srgb) t.texture.colorSpace = THREE.SRGBColorSpace; return t; };
    const hgt = new THREE.WebGLRenderTarget(px, px, { depthBuffer: false, type: THREE.HalfFloatType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const out = [rt(true), rt(false), rt(false)], prev = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.autoClear = true;
    quad.material = mat; mat.uniforms.mode.value = 0; renderer.setRenderTarget(out[0]); renderer.render(scene, cam);
    mat.uniforms.mode.value = 1; renderer.setRenderTarget(hgt); renderer.render(scene, cam);
    quad.material = mat2; const u = mat2.uniforms; u.tH.value = hgt.texture; u.texel.value = 1 / px; u.nStr.value = (o.normal === undefined ? 1 : o.normal) * px / 64; u.aoStr.value = o.ao === undefined ? 3 : o.ao;
    u.mode.value = 0; renderer.setRenderTarget(out[1]); renderer.render(scene, cam);
    u.mode.value = 1; renderer.setRenderTarget(out[2]); renderer.render(scene, cam);
    renderer.setRenderTarget(prev); renderer.autoClear = ac; mat.dispose(); hgt.dispose();
    return out;
  };

  // ---- the world's surfaces. Each keeps the layout of the one it replaces (rows and columns of stone, the way the planks run, the
  // emblem on the cloth) and its lightness, because the colour of a place is laid over it. [normal strength, GLSL] ----
  const SRC = X.SRC = {};
  SRC.bricks = [1.3, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float d, id; vec2 lp; vec2 w = uv + (vec2(fbm3(uv, 8., 1.), fbm3(uv, 8., 2.)) - .5) * .008;
  ashlar(w, 8., 4., 11., d, id, lp);
  float big = fbm(uv, 3., 3.), mid = fbm(uv, 14., 4.), fine = fbm(uv, 48., 5.), grit = fbm(uv, 160., 6.), chipN = fbm(uv, 20., 7.);
  float joint = smoothstep(.002, .008, d + (chipN - .5) * .007);
  float corner = smoothstep(.0, .028, d + (chipN - .55) * .045);
  float face = .58 + (id - .5) * .22 + (mid - .5) * .3 + (fine - .5) * .16 + (grit - .5) * .07;
  vec3 pit = voro(uv, 36., 8.); face -= smoothstep(.16, .0, pit.x) * .1 * step(.6, pit.z);
  h = mix(.3 + grit * .08, face * (.82 + .18 * corner), joint);
  vec3 stone = vec3(.76 + id * .2) * mix(vec3(1., .985, .955), vec3(.95, .975, 1.), hash12(vec2(id * 91., 3.)));
  stone *= .82 + mid * .28 + (fine - .5) * .2;
  float damp = smoothstep(.5, .74, big + (mid - .5) * .25); stone = mix(stone, stone * vec3(.7, .75, .68), damp * .7);
  float moss = smoothstep(.62, .8, fbm(uv, 5., 12.)) * smoothstep(.03, .004, d);
  stone = mix(stone, vec3(.45, .53, .32) * (.7 + fine * .6), moss * .65);
  col = S(mix(vec3(.5, .48, .45) * (.7 + fine * .6), stone, joint) * (.84 + .16 * corner));
  rough = mix(1., .9 - damp * .3 + (fine - .5) * .1, joint); metal = 0.;
}`];
  SRC.ashlar = [1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float d, id; vec2 lp; ashlar(uv, 4., 2., 23., d, id, lp);
  float big = fbm(uv, 3., 3.), mid = fbm(uv, 16., 4.), fine = fbm(uv, 64., 5.), grit = fbm(uv, 200., 6.);
  float joint = smoothstep(.0015, .006, d + (fine - .5) * .004);
  float tool = sin((uv.x + uv.y * .35 + fbm3(uv, 6., 2.) * .05) * 6.2831853 * 48.) * .5 + .5;
  float face = .6 + (id - .5) * .08 + (mid - .5) * .18 + (fine - .5) * .1 + (grit - .5) * .05 + (tool - .5) * .012;
  vec3 pit = voro(uv, 30., 8.); face -= smoothstep(.14, .0, pit.x) * .09 * step(.7, pit.z);
  vec3 vc = voro(uv, 4., 9.); float crack = (1. - smoothstep(.0, .008, vc.y - vc.x)) * step(.6, fbm(uv, 3., 33.)); face -= crack * .1;
  h = mix(.4, face, joint);
  vec3 stone = vec3(.8 + id * .12) * (.8 + mid * .3 + (fine - .5) * .2);
  float damp = smoothstep(.5, .74, big + (mid - .5) * .2); stone = mix(stone, stone * vec3(.68, .73, .68), damp * .7);
  col = S(mix(vec3(.5, .48, .45), stone, joint) * (1. - crack * .4));
  rough = mix(1., .86 - damp * .26 + (fine - .5) * .12, joint); metal = 0.;
}`];
  SRC.flag = [1.15, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float d, id; vec2 lp; vec2 w = uv + (vec2(fbm3(uv, 6., 1.), fbm3(uv, 6., 2.)) - .5) * .012;
  ashlar(w, 4., 3., 37., d, id, lp);
  float big = fbm(uv, 2., 3.), mid = fbm(uv, 12., 4.), fine = fbm(uv, 48., 5.), grit = fbm(uv, 200., 6.), chipN = fbm(uv, 24., 13.);
  float joint = smoothstep(.0015, .0075, d + (chipN - .5) * .007);
  float dish = smoothstep(.0, .1, d);
  float slab = .52 + (id - .5) * .2 + dish * .05 + (mid - .5) * .17 + (fine - .5) * .07 + (grit - .5) * .035;
  vec3 vc = voro(uv, 6., 9.); float crack = (1. - smoothstep(.0, .012, vc.y - vc.x)) * step(.66, id); slab -= crack * .14;
  vec3 pit = voro(uv, 60., 8.); slab -= smoothstep(.2, .0, pit.x) * .05 * step(.55, pit.z);
  h = mix(.3 + grit * .06, slab, joint);
  float wet = smoothstep(.52, .7, fbm(uv, 3., 31.) + (.5 - slab) * .5);                 // worn smooth and damp where it lies low
  vec3 stone = vec3(.78 + id * .16) * mix(vec3(1., .99, .97), vec3(.96, .98, 1.), hash12(vec2(id * 53., 9.)));
  stone *= .8 + mid * .32 + (fine - .5) * .2;
  stone = mix(stone, stone * vec3(.72, .76, .7), smoothstep(.55, .75, fbm(uv, 5., 17.)) * .6);
  stone *= 1. - wet * .22;
  col = S(mix(vec3(.4, .39, .37) * (.7 + fine * .6), stone, joint) * (1. - crack * .5));
  rough = mix(1., .94 + (fine - .5) * .1 - wet * .42, joint); metal = 0.;
}`];
  SRC.cobble = [1.4, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 w = uv + (vec2(fbm3(uv, 6., 1.), fbm3(uv, 6., 2.)) - .5) * .03;
  vec3 v = voro(w, 7., 41.); float e = v.y - v.x;
  float mid = fbm(uv, 12., 4.), fine = fbm(uv, 48., 5.), grit = fbm(uv, 180., 6.);
  float stone = smoothstep(.02, .13, e);                         // 0 in the gaps, rising onto the dome of each stone
  float dome = sqrt(clamp(e * 1.6, 0., 1.));
  h = mix(.12 + grit * .1, .45 + dome * .4 + (mid - .5) * .12 + (fine - .5) * .08, stone);
  vec3 c = vec3(.72 + v.z * .24) * mix(vec3(1., .98, .95), vec3(.94, .97, 1.), hash12(vec2(v.z * 77., 5.)));
  c *= .8 + mid * .3 + (fine - .5) * .2 + dome * .1;
  float moss = smoothstep(.55, .75, fbm(uv, 4., 21.)) * (1. - stone);
  vec3 gap = mix(vec3(.44, .42, .38), vec3(.36, .44, .27), moss) * (.6 + fine * .7);
  col = S(mix(gap, c, stone));
  rough = mix(1., .8 - dome * .12 + (fine - .5) * .12, stone); metal = 0.;
}`];
  SRC.smooth = [0.6, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float big = fbm(uv, 3., 53.), mid = fbm(uv, 14., 4.), fine = fbm(uv, 56., 5.), grit = fbm(uv, 200., 6.);
  vec3 pit = voro(uv, 34., 8.); float p = smoothstep(.13, .0, pit.x) * step(.78, pit.z);
  vec3 vc = voro(uv, 3., 9.); float crack = (1. - smoothstep(.0, .006, vc.y - vc.x)) * smoothstep(.55, .65, fbm(uv, 3., 33.));
  h = .6 + (mid - .5) * .16 + (fine - .5) * .09 + (grit - .5) * .05 - p * .08 - crack * .1;
  vec3 c = vec3(.86) * (.84 + mid * .24 + (fine - .5) * .14);
  c = mix(c, c * vec3(.8, .8, .78), smoothstep(.55, .78, big) * .6);
  col = S(c * (1. - crack * .35) * (1. - p * .25));
  rough = .9 + (fine - .5) * .16 - smoothstep(.5, .7, big) * .12; metal = 0.;
}`];
  SRC.rock = [1.6, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float big = fbm(uv, 3., 61.), mid = fbm(uv, 10., 4.), fine = fbm(uv, 40., 5.), grit = fbm(uv, 160., 6.);
  float rd = ridge(uv, 4., 7.); vec3 v = voro(uv + (mid - .5) * .08, 5., 9.);
  float strata = sin((uv.y + fbm3(uv, 4., 3.) * .12) * 6.2831853 * 6.) * .5 + .5;
  float crack = 1. - smoothstep(.0, .02, v.y - v.x);
  h = .35 + rd * .35 + (mid - .5) * .25 + (fine - .5) * .14 + (grit - .5) * .06 + (strata - .5) * .06 - crack * .22;
  vec3 c = vec3(.62 + big * .26 + (v.z - .5) * .1) * (.78 + mid * .34 + (fine - .5) * .22);
  c *= mix(vec3(1., .97, .93), vec3(.95, .98, 1.), strata);
  col = S(c * (1. - crack * .55));
  rough = .96 - rd * .08; metal = 0.;
}`];
  SRC.planks = [1.2, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = 5., px = uv.x * n, pid = mod(floor(px), n), fx = fract(px), pr = hash12(vec2(pid, 71.)), pr2 = hash12(vec2(pid, 8.));
  float pv = fract(uv.y + pr), seg = floor(pv * 2.), fy = fract(pv * 2.);
  float edge = min(min(fx, 1. - fx) / n, min(fy, 1. - fy) * .5);
  vec2 g = vec2(uv.x, uv.y + pr * 7.31 + seg * .37);
  float grain = fbmA(g, vec2(60., 3.), 2.), fine = fbmA(g, vec2(260., 12.), 4.), warp = fbmA(g, vec2(10., 2.), 5.);
  float rings = sin((uv.x * n * 4. + warp * 5. + pr * 20.) * 6.2831853) * .5 + .5;
  vec3 kn = voro(g, 4., 6. + pid); float knot = smoothstep(.1, .0, kn.x) * step(.75, kn.z);
  float gap = smoothstep(.0, .005, edge), wear = fbm(uv, 5., 9.);
  h = (.55 + (grain - .5) * .34 + (fine - .5) * .1 + (rings - .5) * .07 - knot * .12 + (pr - .5) * .1) * mix(.25, 1., gap);
  float c = (.58 + grain * .3 + rings * .1) * (.82 + pr2 * .32);
  vec3 wood = vec3(c, c * .8, c * .62);
  wood = mix(wood, wood * .5, knot);
  wood = mix(wood, vec3(c * .82), smoothstep(.5, .78, wear) * .5);                  // greyed where it has weathered
  col = S(wood * mix(.3, 1., gap));
  rough = .86 + (fine - .5) * .2 - knot * .15; metal = 0.;
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
  SRC.grass = [1.2, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = fbm(uv, 8., 131.), m = fbm(uv, 3., 134.), fine = fbm(uv, 64., 5.);
  float b1 = vnA(vec2(uv.x * 220. + fbm3(uv, 20., 7.) * 14., uv.y * 40.), vec2(220., 40.), 3.), b2 = vnA(vec2(uv.x * 60., uv.y * 260.), vec2(60., 260.), 9.);
  float blade = b1 * .6 + b2 * .4;
  float dry = smoothstep(.56, .8, m), dirt = smoothstep(.62, .7, fbm(uv, 5., 140.) + (fine - .5) * .2);
  vec3 g = vec3(.27 + n * .2 + blade * .14 + dry * .3, .42 + n * .28 + blade * .2 + dry * .12, .15 + n * .12 + blade * .04);
  vec3 soil = vec3(.42, .34, .24) * (.75 + n * .5 + (fine - .5) * .3);
  col = S(mix(g, soil, dirt));
  h = mix(.38 + blade * .42 + n * .2, .2 + n * .2 + (fine - .5) * .15, dirt);
  rough = mix(.92, 1., dirt); metal = 0.;
}`];
  SRC.marble = [0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 t = fract(uv * 2.); float seam = min(min(t.x, 1. - t.x), min(t.y, 1. - t.y)); float joint = smoothstep(.004, .012, seam);
  float id = hash12(floor(uv * 2.) + 141.);
  vec2 w = uv + (vec2(fbm3(uv, 4., 1.), fbm3(uv, 4., 2.)) - .5) * .25 + id * .37;
  float v1 = smoothstep(.72, .96, ridge(w, 3., 5.)), v2 = smoothstep(.8, .97, ridge(w + .31, 7., 9.));
  float cloud = fbm(w, 4., 3.), fine = fbm(uv, 80., 6.);
  float c = .86 + cloud * .12 - v1 * .3 - v2 * .14;
  vec3 m = vec3(c * .99, c * .98, c) * mix(vec3(1.), vec3(1., .97, .92), smoothstep(.5, .8, fbm(w, 2., 11.)) * .5);
  col = S(mix(vec3(.45, .43, .4), m, joint));
  h = mix(.3, .52 + (fine - .5) * .03 - v1 * .04, joint);
  rough = mix(1., .82 + v1 * .18 + (fine - .5) * .1, joint); metal = 0.;
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
        const rts = X.bake(renderer, size, SRC[k][1], { normal: SRC[k][0], ao: 3, mat: pending['w:' + k] }), bufs = []; delete pending['w:' + k];
        for (let i = 0; i < 3; i++) { const b = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rts[i], 0, 0, size, size, b); bufs.push(b); rts[i].dispose(); }
        const put = (tex, data) => { tex.dispose(); tex.image = { data, width: size, height: size }; tex.needsUpdate = true; };
        put(t.map, bufs[0]); put(t.normalMap, bufs[1]);
        const o = new THREE.DataTexture(bufs[2], size, size, THREE.RGBAFormat);
        o.wrapS = o.wrapT = THREE.RepeatWrapping; o.magFilter = THREE.LinearFilter; o.minFilter = THREE.LinearMipmapLinearFilter; o.generateMipmaps = true; o.anisotropy = t.map.anisotropy || 8; o.needsUpdate = true;
        t.orm = o;
      }
      X.upgradeSprites(renderer);
      X.upgraded = true; X.stats.tex = Math.round(performance.now() - t0);
    } catch (e) { console.warn('gfx: textures kept as they were', e); return false; }
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

  // ---- the small pictures the effects are drawn with (textures.js paints them with plain gradients): the same pictures with their
  // edges broken up and their insides uneven, as smoke and fire are. Painted here and put back into the same canvases. ----
  const SPR = {
    smoke: [256, `
vec4 spr(vec2 uv){ vec2 p = uv * 2. - 1.; float r = length(p), n = fbm(uv, 4., 3.), n2 = fbm(uv, 9., 7.);
  float e = 1. - smoothstep(.3 + n * .36, .6 + n * .4, r);
  return vec4(vec3(.8 + n2 * .2), e * (.32 + n2 * .5) * .9); }`],
    flame: [128, `
vec4 spr(vec2 uv){ vec2 p = vec2((uv.x - .5) * 2., uv.y); float n = fbm(uv, 5., 2.), n2 = fbm(uv, 12., 5.);
  float w = .66 * sin(3.14159 * pow(clamp(p.y * 1.04, 0., 1.), .5)) * (1. - p.y * .3);
  float d = abs(p.x) + (n - .5) * .34 * (.3 + p.y);
  float b = (1. - smoothstep(w * .3, w, d)) * smoothstep(.02, .14, p.y) * (1. - smoothstep(.74, 1., p.y + (n2 - .5) * .3));
  vec3 c = mix(vec3(1., .47, .16), vec3(1., .8, .47), b); c = mix(c, vec3(1., .98, .9), b * b * (1. - p.y) * .9);
  return vec4(c, b); }`],
    hole: [128, `
vec4 spr(vec2 uv){ vec2 p = uv * 2. - 1.; float r = length(p); vec2 q = p / max(r, 1e-4);
  float e = .5 + .28 * vnoise(q * 2.2 + 10., 64., 1.) + .13 * vnoise(q * 6. + 20., 64., 2.);
  float chip = 1. - smoothstep(e - .16, e, r), hole = 1. - smoothstep(.1, .2, r), ring = (1. - smoothstep(.2, .34, r)) * (1. - hole);
  float cr = smoothstep(.93, 1., vnoise(q * 3.3 + 40., 64., 4.)) * (1. - smoothstep(.3, .85, r)) * smoothstep(.15, .3, r);
  vec3 c = mix(vec3(.24, .22, .2), vec3(.07, .06, .055), ring); c = mix(c, vec3(0.), hole); c *= .8 + .4 * vnoise(uv * 24., 64., 9.);
  return vec4(c, max(chip * .88, cr * .55)); }`],
    scorch: [256, `
vec4 spr(vec2 uv){ vec2 p = uv * 2. - 1.; float r = length(p), n = fbm(uv, 4., 3.), n2 = fbm(uv, 14., 5.);
  float e = 1. - smoothstep(.22 + n * .4, .58 + n * .42, r);
  return vec4(vec3(.02, .018, .015), e * (.45 + n2 * .45)); }`],
  };
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
  X.EXSRC = EX;
  X.mirror = (g) => mirror(g);
  // a surface by name: { map, normalMap, orm } (made at first asking; null where there is no GPU to make it)
  X.tex = function (name) {
    if (texCache[name] !== undefined) return texCache[name];
    const src = EX[name], renderer = G.renderer; texCache[name] = null;
    if (!src || !renderer) return null;
    const t0 = performance.now();
    try {
      const size = src[0], rts = X.bake(renderer, size, src[2], { normal: src[1], ao: 2.5, mat: X.pendingMat('x:' + name) }), out = [];
      for (let i = 0; i < 3; i++) {
        const b = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rts[i], 0, 0, size, size, b); rts[i].dispose();
        const t = new THREE.DataTexture(b, size, size, THREE.RGBAFormat);
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8;
        if (i === 0) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; out.push(t);
      }
      texCache[name] = { map: out[0], normalMap: out[1], orm: out[2] }; X.stats.surf += Math.round(performance.now() - t0);
    } catch (e) { console.warn('gfx: no surface', name, e); }
    return texCache[name];
  };

  // ---- a gloved hand closed on a grip. The grip runs up through the origin; the palm lies on the +x side, the fingers come round the
  // front (-z) to the other side, the first of them laid forward to the trigger, the thumb round the back. mirror: the other hand ----
  function grip(x, y, z) {
    let d = S.box(x, y, z, 0.027, -0.002, 0.004, 0.0105, 0.04, 0.026, 0.011);
    d = S.smin(d, S.ell(x, y, z, 0.035, 0.0, 0.004, 0.011, 0.038, 0.03), 0.01);                       // back of the hand
    d = S.smin(d, S.cap(x, y, z, 0.004, 0.034, 0.03, 0.024, 0.03, 0.022, 0.015), 0.012);            // the web between thumb and finger
    d = S.smin(d, S.cap(x, y, z, 0.02, -0.04, 0.024, 0.028, -0.02, 0.018, 0.016), 0.012);           // heel
    let f = 1e9; const ys = [0.01, -0.011, -0.031], rs = [0.0101, 0.0098, 0.0089];
    for (let i = 0; i < 3; i++) { const yy = ys[i]; f = S.smin(f, S.chain(x, y, z, [[0.031, yy, -0.012], [0.019, yy, -0.034], [-0.008, yy, -0.0355], [-0.0235, yy + 0.001, -0.02], [-0.024, yy + 0.003, 0.0]], rs[i], rs[i] * 0.86, 0.0035, 1.08), 0.0022); }
    f = S.smin(f, S.chain(x, y, z, [[0.031, 0.031, -0.01], [0.025, 0.034, -0.038], [0.013, 0.034, -0.058], [-0.002, 0.032, -0.064]], 0.0097, 0.0082, 0.0035, 1.08), 0.0022);   // first finger
    d = S.smin(d, f, 0.009);
    d = S.smin(d, S.chain(x, y, z, [[0.015, 0.03, 0.033], [-0.01, 0.041, 0.026], [-0.0235, 0.044, 0.006], [-0.0245, 0.044, -0.019]], 0.0125, 0.0096, 0.0035, 1.08), 0.009);   // thumb
    d = S.smin(d, S.cone(x, y, z, 0.03, -0.03, 0.028, 0.046, -0.066, 0.08, 0.027, 0.031), 0.012);    // wrist
    return d;
  }
  // the hard pad over the knuckles and the strap at the wrist: the same shape grown a little and cut to a region
  const pad = (x, y, z) => S.smax(grip(x, y, z) - 0.0018, S.box(x, y, z, 0.043, 0.0, 0.004, 0.012, 0.024, 0.022, 0.006), 0.002);
  const strap = (x, y, z) => { const t = ((x - 0.03) * 0.016 + (y + 0.03) * -0.036 + (z - 0.028) * 0.052) / 0.0653; return S.smax(grip(x, y, z) - 0.0016, Math.abs(t - 0.036) - 0.01, 0.0015); };
  const handCache = {};
  // the same shape seen in a mirror (x turned over, and with it the way each face winds)
  function mirror(g) {
    const m = g.clone(), p = m.attributes.position, n = m.attributes.normal, ix = m.index;
    for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
    for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); }
    return m;
  }
  // { hand, pad, strap }: geometries of one hand (right: as described; left: its mirror)
  X.hand = function (right) {
    const k = right ? 'r' : 'l'; if (handCache[k]) return handCache[k];
    if (!right) { const r = X.hand(true); return (handCache.l = { hand: mirror(r.hand), pad: mirror(r.pad), strap: mirror(r.strap) }); }
    const mk = (fn, b0, b1, cell) => { const t0 = performance.now(), g = S.mesh(fn, b0, b1, cell); X.stats.hand += Math.round(performance.now() - t0); return g; };
    return (handCache.r = { hand: mk(grip, [-0.04, -0.105, -0.08], [0.085, 0.065, 0.12], 0.0023), pad: mk(pad, [0.028, -0.03, -0.024], [0.062, 0.03, 0.032], 0.0017), strap: mk(strap, [-0.005, -0.085, 0.02], [0.085, -0.01, 0.1], 0.0021) });
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
