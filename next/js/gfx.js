'use strict';
// Surfaces and shapes for the finer look.
//  * The world's textures (textures.js makes them on the CPU, colour and normal) are baked again here on the GPU, at a finer grain and
//    with a third texture - occlusion and roughness - and written back into the same texture objects, so every material that already
//    holds one picks it up.
//  * rbox: a box with its edges rounded, cut to the size asked for (a unit box stretched to size cannot be rounded evenly).
(function () {
  const X = G.GFX = {};
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
  const FS = (body) => `precision highp float; varying vec2 vUv; uniform int mode; uniform float texel; uniform float nStr; uniform float aoStr;
${X.NOISE}
${body}
void main(){
  float h, r, m; vec3 c; mat(vUv, h, c, r, m);
  if (mode == 0) { gl_FragColor = vec4(c, 1.); return; }
  float h2, r2, m2; vec3 c2;
  if (mode == 1) {
    float hx, hy, hx0, hy0;
    mat(vUv + vec2(texel, 0.), hx, c2, r2, m2); mat(vUv - vec2(texel, 0.), hx0, c2, r2, m2);
    mat(vUv + vec2(0., texel), hy, c2, r2, m2); mat(vUv - vec2(0., texel), hy0, c2, r2, m2);
    vec3 n = normalize(vec3((hx0 - hx) * nStr, (hy0 - hy) * nStr, 1.));
    gl_FragColor = vec4(n * .5 + .5, 1.); return;
  }
  float acc = 0.;
  for (int i = 0; i < 12; i++) { float a = float(i) * 2.399963, rr = texel * (2. + float(i) * 1.6); mat(vUv + vec2(cos(a), sin(a)) * rr, h2, c2, r2, m2); acc += max(0., h2 - h); }
  gl_FragColor = vec4(clamp(1. - acc / 12. * aoStr, 0., 1.), clamp(r, 0.03, 1.), clamp(m, 0., 1.), 1.);
}`;
  let quad, cam, scene;
  // bake one surface: three square targets (colour in sRGB, normal, occlusion / roughness / metalness)
  X.bake = function (renderer, px, body, o) {
    o = o || {};
    if (!quad) { cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); scene = new THREE.Scene(); quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad); }
    const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS(body), depthTest: false, depthWrite: false,
      uniforms: { mode: { value: 0 }, texel: { value: 1 / px }, nStr: { value: (o.normal === undefined ? 1 : o.normal) * px / 64 }, aoStr: { value: o.ao === undefined ? 3 : o.ao } } });
    quad.material = mat;
    const rt = (srgb) => { const t = new THREE.WebGLRenderTarget(px, px, { depthBuffer: false }); if (srgb) t.texture.colorSpace = THREE.SRGBColorSpace; return t; };
    const out = [rt(true), rt(false), rt(false)], prev = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.autoClear = true;
    for (let i = 0; i < 3; i++) { mat.uniforms.mode.value = i; renderer.setRenderTarget(out[i]); renderer.render(scene, cam); }
    renderer.setRenderTarget(prev); renderer.autoClear = ac; mat.dispose();
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
    try {
      for (const k in SRC) {
        const t = T.tex[k]; if (!t || !t.map) continue;
        const small = k === 'metal' || k === 'cloth' || k === 'skin' || k === 'scales', size = small ? Math.max(256, px >> 1) : px;
        const rts = X.bake(renderer, size, SRC[k][1], { normal: SRC[k][0], ao: 3 }), bufs = [];
        for (let i = 0; i < 3; i++) { const b = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(rts[i], 0, 0, size, size, b); bufs.push(b); rts[i].dispose(); }
        const put = (tex, data) => { tex.dispose(); tex.image = { data, width: size, height: size }; tex.needsUpdate = true; };
        put(t.map, bufs[0]); put(t.normalMap, bufs[1]);
        const o = new THREE.DataTexture(bufs[2], size, size, THREE.RGBAFormat);
        o.wrapS = o.wrapT = THREE.RepeatWrapping; o.magFilter = THREE.LinearFilter; o.minFilter = THREE.LinearMipmapLinearFilter; o.generateMipmaps = true; o.anisotropy = t.map.anisotropy || 8; o.needsUpdate = true;
        t.orm = o;
      }
      X.upgraded = true;
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
})();
