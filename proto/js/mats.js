'use strict';
// The surfaces. Each is a small GLSL program that the baker turns into colour / normal / occlusion-roughness-metalness textures, and a
// material that lays them on a mesh from three sides (no UVs needed: every mesh here is built in code).
(function () {
  const T = P.TEXSRC = {};
  // coursed wall stone, 2.4 m to a repeat
  T.wall = [1024, 2.4, 1.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float d, id; vec2 lp;
  vec2 w = uv + (vec2(fbm3(uv, 8., 1.), fbm3(uv, 8., 2.)) - .5) * .014;
  ashlar(w, 5., 3., 1., d, id, lp);
  float big = fbm(uv, 3., 3.), mid = fbm(uv, 14., 4.), fine = fbm(uv, 48., 5.), grit = fbm(uv, 160., 6.);
  float chipN = fbm(uv, 20., 7.);
  float joint = smoothstep(.003, .013, d + (chipN - .5) * .012);
  float corner = smoothstep(.0, .045, d + (chipN - .55) * .07);            // corners and edges knocked off
  float face = .58 + (id - .5) * .22 + (mid - .5) * .30 + (fine - .5) * .16 + (grit - .5) * .07;
  vec3 pit = voro(uv, 36., 8.); face -= smoothstep(.16, .0, pit.x) * .10 * step(.6, pit.z);
  h = mix(.30 + grit * .08, face * (.82 + .18 * corner), joint);
  vec3 a = vec3(.215, .210, .205), b = vec3(.335, .315, .285), c = vec3(.255, .262, .275);
  vec3 stone = mix(a, b, id); stone = mix(stone, c, smoothstep(.35, .75, hash12(vec2(id * 91., 3.))) * .7);
  stone *= .72 + mid * .42 + (fine - .5) * .25;
  float damp = smoothstep(.48, .72, big + (mid - .5) * .25);                   // dark damp patches, a little green
  stone = mix(stone, stone * vec3(.52, .58, .50), damp * .8);
  float lime = smoothstep(.62, .8, fbm(uv, 6., 12.)) * joint;                  // pale bloom of salts
  stone = mix(stone, vec3(.42, .41, .38), lime * .35);
  col = mix(vec3(.125, .12, .11) * (.7 + fine * .6), stone, joint);
  col *= .8 + .2 * corner;
  rough = mix(.96, .86 - damp * .28 + (fine - .5) * .12, joint);
  metal = 0.;
}`];
  // flagstones with standing water, 4 m to a repeat
  T.floor = [2048, 4.0, 1.25, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float d, id; vec2 lp;
  vec2 w = uv + (vec2(fbm3(uv, 6., 1.), fbm3(uv, 6., 2.)) - .5) * .012;
  ashlar(w, 5., 4., 7., d, id, lp);
  float big = fbm(uv, 2., 3.), mid = fbm(uv, 12., 4.), fine = fbm(uv, 48., 5.), grit = fbm(uv, 200., 6.);
  float chipN = fbm(uv, 24., 13.);
  float joint = smoothstep(.0015, .0075, d + (chipN - .5) * .007);
  float dish = smoothstep(.0, .10, d);
  float slab = .52 + (id - .5) * .20 + dish * .05 + (mid - .5) * .17 + (fine - .5) * .07 + (grit - .5) * .035;
  vec3 vc = voro(uv, 6., 9.); float crack = 1. - smoothstep(.0, .012, vc.y - vc.x); crack *= step(.66, id);
  vec3 vc2 = voro(uv, 3., 21.); crack = max(crack, (1. - smoothstep(.0, .007, vc2.y - vc2.x)) * step(.8, hash12(vec2(id * 37., 1.))));
  slab -= crack * .14;
  vec3 pit = voro(uv, 60., 8.); slab -= smoothstep(.2, .0, pit.x) * .05 * step(.55, pit.z);
  float hs = mix(.30 + grit * .06, slab, joint);
  // water lies where the floor is low; its level wanders across the room
  float pool = fbm(uv, 2., 31.);
  float wl = mix(.30, .575, smoothstep(.38, .66, pool));
  float depth = wl - hs, water = smoothstep(-.004, .012, depth);
  float wet = smoothstep(-.11, .0, depth);                                      // the damp band about a puddle
  h = max(hs, wl);
  vec3 a = vec3(.20, .205, .215), b = vec3(.30, .29, .275), c = vec3(.235, .225, .21);
  vec3 stone = mix(a, b, id); stone = mix(stone, c, smoothstep(.4, .8, hash12(vec2(id * 53., 9.))));
  stone *= .7 + mid * .45 + (fine - .5) * .22;
  stone = mix(vec3(.085, .082, .078) * (.7 + fine * .6), stone, joint);
  stone = mix(stone, stone * vec3(.6, .64, .58), smoothstep(.55, .75, fbm(uv, 5., 17.)) * .6);  // grime
  stone *= 1. - crack * .6;
  vec3 wetc = stone * mix(vec3(1.), vec3(.42, .45, .50), wet);
  col = mix(wetc, wetc * vec3(.35, .40, .44) + vec3(.004, .006, .008), water * smoothstep(.0, .09, depth));
  rough = mix(.90 + (fine - .5) * .1, .34, wet * .85);
  rough = mix(rough, .035, water);
  metal = 0.;
}`];
  // smooth cut stone for columns, ribs and frames, 2 m to a repeat
  T.dressed = [1024, 2.0, 0.9, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float d, id; vec2 lp;
  ashlar(uv, 4., 2., 5., d, id, lp);
  float big = fbm(uv, 3., 3.), mid = fbm(uv, 16., 4.), fine = fbm(uv, 64., 5.), grit = fbm(uv, 200., 6.);
  float joint = smoothstep(.0012, .005, d + (fine - .5) * .004);
  float tool = sin((uv.x + uv.y * .35 + fbm3(uv, 6., 2.) * .05) * 6.2831853 * 56.) * .5 + .5;   // chisel marks
  float face = .6 + (id - .5) * .06 + (mid - .5) * .16 + (fine - .5) * .09 + (grit - .5) * .05 + (tool - .5) * .010;
  vec3 pit = voro(uv, 30., 8.); face -= smoothstep(.14, .0, pit.x) * .09 * step(.7, pit.z);
  vec3 vc = voro(uv, 4., 9.); float crack = (1. - smoothstep(.0, .008, vc.y - vc.x)) * step(.6, fbm(uv, 3., 33.)); face -= crack * .1;
  h = mix(.44, face, joint);
  vec3 stone = mix(vec3(.30, .29, .27), vec3(.38, .365, .335), id) * (.74 + mid * .42 + (fine - .5) * .2);
  float damp = smoothstep(.5, .74, big + (mid - .5) * .2);
  stone = mix(stone, stone * vec3(.55, .6, .55), damp * .7);
  col = mix(vec3(.15, .145, .135), stone, joint) * (1. - crack * .5);
  rough = mix(.95, .78 - damp * .22 + (fine - .5) * .12, joint);
  metal = 0.;
}`];
  // one piece of stone, no joints: coffins, the altar; 1.6 m to a repeat
  T.mono = [1024, 1.6, 0.9, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float big = fbm(uv, 3., 3.), mid = fbm(uv, 16., 4.), fine = fbm(uv, 64., 5.), grit = fbm(uv, 200., 6.);
  float tool = sin((uv.x + uv.y * .35 + fbm3(uv, 6., 2.) * .05) * 6.2831853 * 56.) * .5 + .5;
  float face = .6 + (mid - .5) * .2 + (fine - .5) * .1 + (grit - .5) * .05 + (tool - .5) * .012;
  vec3 pit = voro(uv, 30., 8.); face -= smoothstep(.14, .0, pit.x) * .1 * step(.7, pit.z);
  vec3 vc = voro(uv, 3., 9.); float crack = (1. - smoothstep(.0, .006, vc.y - vc.x)) * smoothstep(.5, .6, fbm(uv, 3., 33.)); face -= crack * .12;
  float vein = smoothstep(.78, .9, ridge(uv, 4., 14.));
  h = face;
  vec3 stone = vec3(.33, .32, .30) * (.72 + mid * .45 + (fine - .5) * .2); stone = mix(stone, vec3(.42, .41, .39), vein * .5);
  float damp = smoothstep(.5, .74, big + (mid - .5) * .2); stone = mix(stone, stone * vec3(.5, .56, .5), damp * .75);
  col = stone * (1. - crack * .5); rough = .74 - damp * .22 + (fine - .5) * .14; metal = 0.;
}`];
  // rough plaster over the vaults, 3 m to a repeat
  T.plaster = [1024, 3.0, 1.1, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float big = fbm(uv, 3., 3.), mid = fbm(uv, 12., 4.), fine = fbm(uv, 48., 5.), grit = fbm(uv, 180., 6.);
  vec3 vc = voro(uv, 5., 9.); float crack = 1. - smoothstep(.0, .010, vc.y - vc.x); crack *= smoothstep(.45, .6, fbm(uv, 4., 21.));
  float fall = smoothstep(.60, .66, fbm(uv, 5., 40.) + (mid - .5) * .2);         // where the plaster has come away, the stone shows
  float d, id; vec2 lp; ashlar(uv, 8., 5., 3., d, id, lp);
  float under = mix(.36, .45 + (id - .5) * .08 + (fine - .5) * .12, smoothstep(.002, .01, d));
  float top = .62 + (mid - .5) * .16 + (fine - .5) * .10 + (grit - .5) * .06 - crack * .12;
  h = mix(top, under, fall);
  vec3 pl = vec3(.36, .345, .315) * (.72 + mid * .4 + (fine - .5) * .2);
  float soot = smoothstep(.4, .75, big); pl = mix(pl, pl * vec3(.42, .42, .44), soot * .75);
  float damp = smoothstep(.55, .75, fbm(uv, 4., 50.)); pl = mix(pl, pl * vec3(.55, .62, .5), damp * .6);
  vec3 st = mix(vec3(.23, .225, .215), vec3(.29, .28, .26), id) * (.8 + fine * .4) * mix(.6, 1., smoothstep(.0, .01, d));
  col = mix(pl * (1. - crack * .55), st, fall);
  rough = .92 - damp * .2;
  metal = 0.;
}`];
  // planks, 1.2 m to a repeat (the grain runs along v)
  T.wood = [1024, 1.2, 1.3, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = 6., px = uv.x * n, pid = mod(floor(px), n), fx = fract(px), pr = hash12(vec2(pid, 3.)), pr2 = hash12(vec2(pid, 8.));
  float edge = min(fx, 1. - fx) / n;
  vec2 g = vec2(uv.x, uv.y + pr * 7.31);
  float grain = fbmA(g, vec2(72., 3.), 2.), fine = fbmA(g, vec2(300., 12.), 4.);
  float warp = fbmA(g, vec2(12., 2.), 5.);
  float rings = sin((uv.x * n * 4. + warp * 5. + pr * 20.) * 6.2831853) * .5 + .5;
  vec3 kn = voro(g, 4., 6. + pid); float knot = smoothstep(.10, .0, kn.x) * step(.75, kn.z);
  float gap = smoothstep(.0, .0045, edge);
  float wear = fbm(uv, 5., 9.);
  h = (.55 + (grain - .5) * .34 + (fine - .5) * .10 + (rings - .5) * .07 - knot * .12 + (pr - .5) * .1) * mix(.25, 1., gap);
  vec3 base = mix(vec3(.105, .068, .042), vec3(.235, .160, .098), grain * .7 + rings * .3) * (.75 + pr2 * .5);
  base = mix(base, base * .45, knot);
  base = mix(base, vec3(.20, .19, .17) * (.6 + grain * .6), smoothstep(.5, .75, wear) * .55);   // grey, weathered
  col = base * mix(.25, 1., gap);
  rough = .78 + (fine - .5) * .2 - knot * .15;
  metal = 0.;
}`];
  // wrought iron, dark and rusted in patches, 0.8 m to a repeat
  T.iron = [512, 0.8, 1.1, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 5., 1.), n2 = fbm(uv, 28., 2.), n3 = fbm(uv, 120., 3.);
  vec3 v = voro(uv, 16., 3.);
  float rust = smoothstep(.46, .66, n1 + (n2 - .5) * .45);
  h = .5 + (v.x - .4) * .16 + (n2 - .5) * .14 + (n3 - .5) * .08 + rust * (n3 - .3) * .2;
  vec3 steel = vec3(.20, .20, .215) * (.6 + n2 * .7);
  vec3 rs = mix(vec3(.16, .075, .035), vec3(.30, .15, .06), n3) * (.7 + n2 * .6);
  col = mix(steel, rs, rust);
  rough = mix(.36 + (n3 - .5) * .25, .92, rust);
  metal = mix(1., .08, rust);
}`];
  // the gun's metal: dark phosphate finish, fine and even, with a few bright rubs; 0.2 m to a repeat
  T.gunmetal = [512, 0.2, 0.55, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 40., 2.), n3 = vnoise(uv * 96., 96., 3.), n4 = vnoise(uv * 48., 48., 9.);
  float scr = smoothstep(.80, .93, ridge(uv, 5., 4.)) * smoothstep(.45, .7, fbm(uv, 3., 11.));
  h = .5 + (n3 - .5) * .035 + (n4 - .5) * .03 - scr * .06;
  col = vec3(.040, .041, .044) * (.78 + n1 * .5 + (n2 - .5) * .3);
  col = mix(col, vec3(.34, .33, .32), scr * .8);
  rough = .50 + (n2 - .5) * .22 + (n1 - .5) * .16 - scr * .26;
  metal = .82 + scr * .18;
}`];
  // moulded polymer: a fine pebbled texture; 0.1 m to a repeat
  T.polymer = [512, 0.1, 0.8, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec3 v = voro(uv, 48., 1.); float n1 = fbm(uv, 4., 2.), n2 = vnoise(uv * 200., 200., 5.);
  h = .5 + (v.x - .45) * .17 + (n2 - .5) * .05;
  col = vec3(.030, .030, .031) * (.82 + n1 * .4 + (v.z - .5) * .12);
  rough = .60 + (n1 - .5) * .22 + (v.x - .4) * .12;
  metal = 0.;
}`];
  // machined bare steel / worn bright metal; 0.2 m to a repeat
  T.steel = [512, 0.2, 0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 48., 2.), br = vnA(vec2(uv.x * 8., uv.y * 400.), vec2(8., 400.), 3.);
  h = .5 + (br - .5) * .16 + (n2 - .5) * .05;
  col = vec3(.50, .49, .47) * (.8 + n1 * .3);
  rough = .30 + (br - .5) * .14 + (n1 - .5) * .14;
  metal = 1.;
}`];
  // woven glove cloth; 0.06 m to a repeat
  T.cloth = [512, 0.06, 1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = 28.; vec2 p = uv * n; float wa = sin(p.x * 6.2831853) * .5 + .5, we = sin(p.y * 6.2831853) * .5 + .5;
  float over = step(.5, fract((floor(p.x) + floor(p.y)) * .5));
  float n1 = fbm(uv, 6., 2.), n2 = vnoise(uv * 160., 160., 5.);
  h = .45 + mix(wa, we, over) * .4 + (n2 - .5) * .12;
  col = vec3(.115, .098, .072) * (.7 + n1 * .5 + mix(wa, we, over) * .25);
  rough = .88;
  metal = 0.;
}`];
  // leather / rubberised palm; 0.1 m to a repeat
  T.leather = [512, 0.1, 0.9, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec3 v = voro(uv, 30., 1.); vec3 v2 = voro(uv, 90., 2.); float n1 = fbm(uv, 5., 2.);
  float cr = smoothstep(.0, .06, v.y - v.x), cr2 = smoothstep(.0, .09, v2.y - v2.x);
  h = .35 + cr * .4 + cr2 * .16 + (n1 - .5) * .1;
  col = vec3(.050, .044, .038) * (.7 + n1 * .6) * (.7 + cr * .3);
  rough = .62 + (n1 - .5) * .2 - cr * .08;
  metal = 0.;
}`];
  // old bone; 0.25 m to a repeat
  T.bone = [1024, 0.25, 1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 20., 2.), n3 = fbm(uv, 90., 3.);
  vec3 pore = voro(uv, 70., 4.); float pr = smoothstep(.22, .0, pore.x) * step(.82, pore.z);
  vec3 vc = voro(uv, 7., 9.); float crack = (1. - smoothstep(.0, .012, vc.y - vc.x)) * smoothstep(.5, .65, fbm(uv, 3., 12.));
  float fib = vnA(vec2(uv.x * 160., uv.y * 10.), vec2(160., 10.), 7.);
  h = .55 + (n2 - .5) * .22 + (n3 - .5) * .12 - pr * .1 - crack * .22 + (fib - .5) * .06;
  vec3 a = vec3(.62, .56, .43), b = vec3(.47, .40, .28), c = vec3(.23, .17, .10);
  col = mix(a, b, smoothstep(.35, .7, n1 + (n2 - .5) * .4));
  col = mix(col, c, clamp(pr * .4 + crack * .8 + smoothstep(.6, .85, fbm(uv, 6., 20.)) * .55, 0., 1.));   // dirt in the pores and cracks
  col *= .85 + n3 * .3;
  rough = .66 + (n2 - .5) * .2 + pr * .2;
  metal = 0.;
}`];
  // corroded plate armour; 0.5 m to a repeat
  T.armor = [1024, 0.5, 1.2, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 24., 2.), n3 = fbm(uv, 110., 3.);
  vec3 v = voro(uv, 22., 3.);
  float rust = smoothstep(.50, .70, n1 + (n2 - .5) * .5);
  float pit = smoothstep(.2, .0, v.x) * rust;
  float scr = smoothstep(.82, .94, ridge(uv, 6., 4.)) * (1. - rust);
  h = .5 + (n2 - .5) * .12 + (n3 - .5) * .1 + rust * (n3 - .35) * .3 - pit * .2 - scr * .06;
  vec3 steel = vec3(.33, .33, .345) * (.6 + n2 * .6);
  vec3 rs = mix(vec3(.13, .060, .028), vec3(.33, .16, .06), n3) * (.65 + n2 * .7);
  col = mix(steel, rs, rust); col = mix(col, vec3(.6, .6, .6), scr * .6);
  rough = mix(.34 + (n3 - .5) * .22, .93, rust) - scr * .1;
  metal = mix(1., .06, rust);
}`];
  // rotten cloth; 0.3 m to a repeat
  T.rag = [512, 0.3, 1.2, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n = 90.; vec2 p = uv * n; float wa = sin(p.x * 6.2831853) * .5 + .5, we = sin(p.y * 6.2831853) * .5 + .5;
  float n1 = fbm(uv, 4., 2.), n2 = fbm(uv, 30., 5.);
  h = .4 + wa * we * .35 + (n2 - .5) * .3;
  col = mix(vec3(.075, .045, .034), vec3(.05, .047, .042), smoothstep(.35, .7, n1)) * (.6 + n2 * .7);
  rough = .95; metal = 0.;
}`];

  const TEX = P.Tex = {};
  P.bakeAll = function (renderer, names) {
    for (const k of names || Object.keys(T)) { if (TEX[k]) continue; const [px, size, nrm, src] = T[k]; TEX[k] = P.bake(renderer, px, src, { size, normal: nrm, ao: 3 }); }
  };

  // ---- the material: a standard PBR material whose textures are laid on from three sides, in the mesh's own space ----
  P.envU = { envBoxMin: { value: new THREE.Vector3(-1e4, -1e4, -1e4) }, envBoxMax: { value: new THREE.Vector3(1e4, 1e4, 1e4) }, envBoxPos: { value: new THREE.Vector3() } };
  const PARS_V = 'varying vec3 vTp; varying vec3 vTn; varying vec3 vWp;\n';
  const PARS_F = `varying vec3 vTp; varying vec3 vTn; varying vec3 vWp;
uniform sampler2D tA; uniform sampler2D tN; uniform sampler2D tO; uniform float triS; uniform float triN; uniform float triR; uniform vec2 triAO; uniform mat3 normalMatrix;
uniform vec3 envBoxMin; uniform vec3 envBoxMax; uniform vec3 envBoxPos;
vec3 bpDir(vec3 v){ vec3 n = normalize(v); vec3 rb = (envBoxMax - vWp) / n, ra = (envBoxMin - vWp) / n; vec3 r = max(rb, ra); float d = min(min(r.x, r.y), r.z); return normalize(vWp + n * d - envBoxPos); }
`;
  function patch(sh) {
    const u = this.userData.tri;
    sh.uniforms.tA = { value: u.tex.map }; sh.uniforms.tN = { value: u.tex.normalMap }; sh.uniforms.tO = { value: u.tex.orm };
    sh.uniforms.triS = { value: 1 / (u.size || u.tex.size) }; sh.uniforms.triN = { value: u.normal === undefined ? 1 : u.normal }; sh.uniforms.triR = { value: u.rough === undefined ? 1 : u.rough };
    sh.uniforms.triAO = { value: new THREE.Vector2(u.ao === undefined ? 1 : u.ao, u.cavity === undefined ? 0.5 : u.cavity) };
    Object.assign(sh.uniforms, P.envU);
    sh.vertexShader = PARS_V + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vTp = position; vTn = normal;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;' + (u.vm ? '\n ' + P.VMZ : ''));
    let env = THREE.ShaderChunk.envmap_physical_pars_fragment;
    const key = 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );';
    if (env.includes(key)) env = env.replace(key, key + '\n reflectVec = bpDir(reflectVec);');
    sh.fragmentShader = PARS_F + sh.fragmentShader
      .replace('#include <envmap_physical_pars_fragment>', env)
      .replace('#include <map_fragment>', `
        vec3 tnO = normalize(vTn);
        vec3 tbw = pow(abs(tnO), vec3(8.)); tbw /= (tbw.x + tbw.y + tbw.z);
        vec2 tuX = vTp.zy * triS, tuY = vTp.xz * triS, tuZ = vTp.xy * triS;
        diffuseColor *= texture2D(tA, tuX) * tbw.x + texture2D(tA, tuY) * tbw.y + texture2D(tA, tuZ) * tbw.z;
        vec4 triOrm = texture2D(tO, tuX) * tbw.x + texture2D(tO, tuY) * tbw.y + texture2D(tO, tuZ) * tbw.z;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(roughness * triOrm.g * triR, 0.03, 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * triOrm.b;')
      .replace('#include <normal_fragment_maps>', `
        { vec3 tx = texture2D(tN, tuX).xyz * 2. - 1., ty = texture2D(tN, tuY).xyz * 2. - 1., tz = texture2D(tN, tuZ).xyz * 2. - 1.;
          tx.xy *= triN; ty.xy *= triN; tz.xy *= triN;
          tx = vec3(tx.xy + tnO.zy, abs(tx.z) * tnO.x); ty = vec3(ty.xy + tnO.xz, abs(ty.z) * tnO.y); tz = vec3(tz.xy + tnO.xy, abs(tz.z) * tnO.z);
          vec3 nP = normalize(tx.zyx * tbw.x + ty.xzy * tbw.y + tz.xyz * tbw.z);
          normal = normalize(normalMatrix * nP) * faceDirection; }`)
      .replace('#include <aomap_fragment>', `
        { float tao = mix(1., triOrm.r, triAO.x);
          reflectedLight.indirectDiffuse *= tao; reflectedLight.indirectSpecular *= tao;
          float cav = mix(1., triOrm.r, triAO.y); reflectedLight.directDiffuse *= cav; reflectedLight.directSpecular *= cav; }`);
  }
  // what is held in the hands is drawn in front of the world whatever stands near (its depth is squeezed into the nearest slice), so the
  // muzzle never shows through a wall; it is still lit and shadowed where it really is
  P.VMZ = 'gl_Position.z = gl_Position.z * 0.12 - gl_Position.w * 0.88;';
  P.vmPatch = function (mat) { mat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n ' + P.VMZ); }; mat.customProgramCacheKey = () => 'vm'; return mat; };
  // tex: one of P.Tex; o: { color, size (metres per repeat), normal, rough (multiplier), metal, ao, cavity, env, side, emissive }
  P.triMat = function (tex, o) {
    o = o || {};
    const m = new THREE.MeshStandardMaterial({ color: o.color === undefined ? 0xffffff : o.color, roughness: 1, metalness: o.metal === undefined ? 1 : o.metal, envMapIntensity: o.env === undefined ? 1 : o.env, side: o.side || THREE.FrontSide });
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity || 1; }
    m.userData.tri = { tex, size: o.size, normal: o.normal, rough: o.rough, ao: o.ao, cavity: o.cavity, vm: !!o.vm };
    m.onBeforeCompile = patch; m.customProgramCacheKey = () => (o.vm ? 'tri1v' : 'tri1');
    return m;
  };
})();
