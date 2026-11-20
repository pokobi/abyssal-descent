'use strict';
// 廃発電所 (plant, the deep tier): a power station left standing in a great cave at the bottom of the way down. Three parts, all
// joined, each reached by more than one way (no part is a dead end, no way through is the only one):
//  - the turbine hall (the middle and the west): a high hall of steel and brick under its roof trusses. Four turbine-generator sets
//    stand on their concrete tables in two rows; the floor runs between and under the tables (pipe and cable trenches, the condensers,
//    pumps, the litter of the works). The middle level is at the tables' tops: their own walks round the machines, galleries along the
//    north, east and south walls, the mezzanine over the switch room, bridges across the aisles. The top level is the overhead crane's:
//    its runway walks along both sides and its bridge across the hall (ladders and the hook up to them);
//  - the switch room along the hall's west side, under the mezzanine: rows of switchboards and narrow aisles between them;
//  - the switchyard east of the hall, out in the cave: the main transformers, the gantries with their insulator strings, the breakers.
// The places of the electric traps (live floor plates, arcs between insulator posts) and of the breaker box that kills each one are
// written to w.elec (genPlant, at its end); js/elec.js makes them live. Here they are drawn dead: plates, posts, the slack line, the box.
// Way in at the south, the three gates in the north wall (the third out of the yard).
(function () {
  const LG = G.LevelGen, H = LG._, F = G.FieldGen, FB = F._, U = G.U;
  const P = () => G.Props;
  // a number from 0 to 1 by place (the field's dice are not thrown for looks)
  const hsh = (x, z, k) => { let h = Math.imul(Math.round(x * 97) | 0, 374761393) ^ Math.imul(Math.round(z * 89) | 0, 668265263) ^ Math.imul((k | 0) + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

  // brick (stone), the concrete of the gate stubs (stone2), concrete (trim), the cave's rock; the light of old incandescent lamps.
  // floorTex 'earth': what lies about on the floors is the mine's (iron scrap, coal, oil, rust: props.js P.dress), not the crypts' bones
  G.Tex.BIOMES.plant = { name: '廃発電所', stone: '#7a5648', stone2: '#8a8680', floor: '#77736c', trim: '#8c8880', rock: '#56524c', wood: '#5e4c3c', fog: '#0e1218', fogD: 0.012, hemiS: '#7a889c', hemiG: '#2a2a30', amb: 0.7, moon: '#b4bcc8', moonI: 0.6, torch: '#ffd2a0', flame: 0xffb070, cloth: '#3a382e', accent: 'bones', floorTex: 'earth' };

  // ---------------------------------------------------------------- surfaces (baked on the GPU by gfx.js, X.tex: colour, normal, occlusion / roughness / metalness)
  const SURF = {
    // poured concrete, a floor's or a wall's: fine aggregate, pits, hairline cracks, oil soaked into it in dark patches (glossier there)
    plConc: [512, 0.7, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 11., 2.), n3 = vnoise(uv * 260., 260., 3.), n4 = vnoise(uv * 110., 110., 4.);
  vec3 a = voro(uv, 64., 5.); float agg = smoothstep(.16, .05, a.x) * step(.62, a.z);
  vec3 pv = voro(uv, 30., 6.); float pit = smoothstep(.07, .02, pv.x) * step(.94, pv.z);
  float crack = smoothstep(.955, .985, ridge(uv, 2., 7.)) * smoothstep(.45, .62, fbm(uv, 2., 8.));
  float stain = smoothstep(.62, .86, fbm(uv, 3., 9.) * .75 + n2 * .25), drip = smoothstep(.7, .9, fbm(uv, 6., 10.));
  h = .55 + (n3 - .5) * .05 + (n4 - .5) * .05 + agg * .05 - pit * .22 - crack * .3;
  vec3 c = vec3(.66 + (n1 - .5) * .16 + (n2 - .5) * .08 + (n3 - .5) * .05) * vec3(1., .985, .96);
  c = mix(c, c * vec3(.62, .6, .57), agg * .6);
  c *= 1. - pit * .25 - crack * .45;
  c = mix(c, vec3(.16, .15, .14), stain * .42 + drip * .1);
  col = S(c); rough = .9 + (n3 - .5) * .08 - stain * .5; metal = 0.;
}`],
    // structural steel gone to rust: islands of the old grey-green paint left, their edges lifting, rust running down in streaks
    plRust: [512, 0.9, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 10., 2.), n3 = vnoise(uv * 260., 260., 3.);
  vec3 sp = voro(uv, 90., 4.); float speck = smoothstep(.2, .05, sp.x) * step(.55, sp.z);
  float run = fbmA(uv, vec2(48., 3.), 6.), runs = smoothstep(.52, .78, run);
  float pp = fbm(uv, 16., 5.) * .55 + fbm(uv, 48., 8.) * .45, paint = smoothstep(.58, .61, pp), edge = smoothstep(.55, .58, pp) * (1. - paint);
  vec3 steel = vec3(.25, .23, .21) * (.88 + n3 * .24);
  vec3 rust = mix(vec3(.27, .17, .11), vec3(.36, .22, .13), n2) * (.85 + n3 * .3);
  vec3 c = mix(steel, rust, clamp(speck * .8 + runs * .55 + smoothstep(.55, .8, n1) * .35, 0., 1.));
  c = mix(c, vec3(.33, .34, .32) * (.92 + n3 * .16), paint * .7); c = mix(c, vec3(.17, .11, .07), edge * .55);
  c *= 1. - runs * .12;
  h = .5 + paint * .04 - speck * .05 + (n3 - .5) * .08;
  col = S(c); rough = .86 - paint * .16 + (n3 - .5) * .06; metal = .35 - speck * .25 - runs * .15 + paint * .05;
}`],
    // machine paint (pale, the material's colour tints it): a factory finish gone dull, grime in drifts and toward the floor, a few small
    // chips through to the grey primer and the metal, a little rust in some of them
    plPaint: [512, 0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 14., 2.), n3 = vnoise(uv * 240., 240., 3.), n4 = fbm(uv, 40., 4.);
  float cf = fbm(uv, 24., 5.) * .6 + n4 * .4, chip = smoothstep(.74, .77, cf) * smoothstep(.4, .65, fbm(uv, 4., 7.)), prim = smoothstep(.69, .74, cf) * (1. - chip) * smoothstep(.35, .6, fbm(uv, 4., 7.));
  float rust = chip * smoothstep(.5, .7, n2), grime = smoothstep(.45, .85, n1);
  float drip = smoothstep(.6, .9, fbmA(uv, vec2(30., 3.), 6.)) * .5;
  vec3 c = vec3(.62 + (n3 - .5) * .04 + (n2 - .5) * .05) * (1. - grime * .32 - drip * .15);
  c = mix(c, vec3(.5, .49, .46), prim * .8); c = mix(c, mix(vec3(.36, .36, .35), vec3(.3, .22, .16), rust), chip * .9);
  h = .55 + (n3 - .5) * .025 - chip * .06 - prim * .02;
  col = S(c); rough = .6 + grime * .25 + (n3 - .5) * .06 - chip * .15; metal = chip * (1. - rust) * .8;
}`],
    // chequer plate (a metre a tile): the raised lentils crossing each other, their tops worn bright, rust in the hollows
    plPlate: [512, 1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 g = uv * 28.; vec2 i = floor(g), f = fract(g) - .5;
  float alt = mod(i.x + i.y, 2.);
  vec2 q = alt > .5 ? vec2(f.x + f.y, f.y - f.x) * .7071 : vec2(f.x - f.y, f.x + f.y) * .7071;
  float bump = smoothstep(1., .55, length(q / vec2(.34, .085)));
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 9., 2.), n3 = vnoise(uv * 300., 300., 3.);
  float wear = smoothstep(.35, .75, n1);
  float rust = smoothstep(.48, .78, fbm(uv, 6., 4.) * .8 + n2 * .2) * (1. - bump * wear);
  h = .4 + bump * (.28 - wear * .08) + (n3 - .5) * .03;
  vec3 c = mix(vec3(.46 + (n2 - .5) * .1 + (n3 - .5) * .05), vec3(.3, .22, .16) * (.8 + n3 * .4), rust * .7);
  c = mix(c, vec3(.66, .66, .64), bump * wear * .5);
  c *= .85 + .15 * (1. - smoothstep(.3, .9, n2));
  col = S(c); rough = mix(.62, .92, rust) - bump * wear * .28; metal = (1. - rust) * .85;
}`],
    // open grating (a metre a tile): bearing bars 32 to the metre, cross rods 8 to the metre (the holes are the alpha map's, grateAlpha)
    plGrate: [512, 0.8, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float bar = step(fract(uv.x * 32.), .25), crs = step(fract(uv.y * 8.), .0625), s = max(bar, crs);
  float n1 = fbm(uv, 4., 1.), n2 = vnoise(uv * 200., 200., 2.);
  float rust = smoothstep(.45, .75, fbm(uv, 7., 3.) + (n2 - .5) * .2);
  vec3 c = mix(vec3(.5, .5, .48), vec3(.33, .2, .11), rust * .8) * (.8 + n1 * .35);
  c = mix(vec3(.04), c, s);
  h = .2 + s * (.5 + crs * .1) + (n2 - .5) * .02;
  col = S(c); rough = mix(.6, .9, rust); metal = s * (1. - rust) * .7;
}`],
    // copper: tarnished brown, bright where it was handled, verdigris in patches
    plCopper: [512, 0.5, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 4., 1.), n2 = fbm(uv, 14., 2.), n3 = vnoise(uv * 220., 220., 3.);
  float tarn = smoothstep(.3, .7, n1), verd = smoothstep(.6, .8, fbm(uv, 6., 4.) * .7 + n2 * .3);
  vec3 c = mix(vec3(.72, .42, .26), vec3(.36, .2, .12), tarn);
  c = mix(c, vec3(.3, .46, .39), verd * .85);
  h = .5 + verd * .08 + (n3 - .5) * .04;
  col = S(c); rough = mix(.35, .6, tarn) + verd * .35; metal = (1. - verd) * (1. - tarn * .3);
}`],
    // the lagging on a steam pipe: canvas wound round it (its seams), painted once, grimed and stained, torn here and there; a steel band every metre
    plLag: [512, 0.7, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 12., 2.), n3 = vnoise(uv * 160., 160., 3.);
  float wrap = fract(uv.y * 6. + uv.x), seam = smoothstep(.06, .0, wrap) + smoothstep(.94, 1., wrap);
  float band = step(fract(uv.y), .035);
  float stain = smoothstep(.5, .85, fbm(uv, 4., 4.) + (n2 - .5) * .3), tear = smoothstep(.84, .88, fbm(uv, 5., 5.));
  vec3 c = vec3(.56, .54, .5) * (.88 + n1 * .2) * (.96 + (n3 - .5) * .08);
  c = mix(c, vec3(.4, .35, .28), stain * .55); c *= 1. - seam * .18;
  c = mix(c, vec3(.45, .45, .43), band); c = mix(c, vec3(.3, .27, .22), tear * .7);
  h = .5 - seam * .08 + band * .1 - tear * .3 + (n3 - .5) * .06;
  col = S(c); rough = .92 - band * .4; metal = band * .6;
}`],
    // the yard's gravel (a metre a tile): stones of two sizes, greys and a few browns, dark between
    plGravel: [512, 1.2, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec3 v = voro(uv, 52., 1.), v2 = voro(uv, 104., 2.);
  float st = smoothstep(.02, .14, v.y - v.x), st2 = smoothstep(.02, .12, v2.y - v2.x);
  float n1 = fbm(uv, 3., 3.), n3 = vnoise(uv * 300., 300., 4.);
  float s = max(st * .9, st2 * step(.5, v2.z));
  vec3 c = vec3(.30 + v.z * .28) * mix(vec3(1.), vec3(1.06, 1., .88), step(.72, v.z));
  c = mix(vec3(.07, .065, .06), c, s) * (.75 + n1 * .4);
  float oil = smoothstep(.6, .82, fbm(uv, 3., 9.)); c = mix(c, c * vec3(.32, .3, .28), oil * .8);
  h = .25 + s * (.35 + v.z * .2) * (1. - v.x * .8) + (n3 - .5) * .04;
  col = S(c); rough = .95 - s * .1 - oil * .35; metal = 0.;
}`],
    // a switchboard's door (the whole door, 0.8 by 2.2 m): the seam round it, louvres at its foot and head, a label frame with its card,
    // the screws, paint chipped at the edges and grimed toward the floor and round where hands went
    plPanel: [512, 0.6, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  vec2 p = vec2(uv.x * .8, uv.y * 2.2);
  float n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 12., 2.), n3 = vnoise(uv * 180., 180., 3.);
  float e = min(min(p.x, .8 - p.x), min(p.y, 2.2 - p.y));
  float seam = smoothstep(.012, .005, abs(e - .035));
  float lv = 0.;
  if (p.x > .2 && p.x < .6 && ((p.y > .12 && p.y < .34) || (p.y > 1.92 && p.y < 2.07))) { float k = fract(p.y / .028); lv = smoothstep(.0, .25, k) * smoothstep(.8, .55, k); }
  float lab = step(abs(p.x - .4), .14) * step(abs(p.y - 1.74), .04), labIn = step(abs(p.x - .4), .125) * step(abs(p.y - 1.74), .03);
  float txt = labIn * step(.45, fract(p.x * 55.)) * step(.5, vnoise(vec2(p.x * 30., floor(p.y * 90.)), 64., 7.)) * step(abs(p.y - 1.745), .012);
  float scr = 0.; for (int k = 0; k < 4; k++) { vec2 sc = vec2(k < 2 ? .07 : .73, mod(float(k), 2.) < .5 ? .1 : 2.1); scr = max(scr, smoothstep(.013, .006, length(p - sc))); }
  float chip = smoothstep(.66, .69, fbm(uv, 5., 4.) * .7 + n2 * .3) * (1. - smoothstep(.0, .12, e) * .8);
  float grime = smoothstep(.9, .0, p.y) * .5 + smoothstep(.5, .85, n1) * .3 + smoothstep(.22, .0, length(p - vec2(.68, 1.05))) * .4;
  vec3 c = vec3(.8 + (n3 - .5) * .05) * (.92 + (n2 - .5) * .1);
  c *= 1. - grime * .45; c *= 1. - seam * .6 - lv * .75;
  c = mix(c, vec3(.36, .34, .3), lab); c = mix(c, vec3(.74, .66, .46) * (.8 + n2 * .3), labIn); c = mix(c, vec3(.1), txt);
  c = mix(c, vec3(.38, .37, .35), scr); c = mix(c, mix(vec3(.4, .4, .38), vec3(.3, .18, .1), smoothstep(.4, .7, n2)), chip);
  h = .55 - seam * .3 - lv * .35 + lab * .05 + scr * .1 - chip * .05 + (n3 - .5) * .02;
  col = S(c); rough = .62 + grime * .25 - chip * .15 + (n3 - .5) * .1; metal = chip * .7 + scr * .5;
}`],
    // corrugated sheet (a metre a tile, the waves across u): painted grey once, rusting along the troughs and from the edges
    plCorr: [512, 1.0, `
void mat(vec2 uv, out float h, out vec3 col, out float rough, out float metal){
  float wv = sin(uv.x * 6.2831853 * 13.), n1 = fbm(uv, 3., 1.), n2 = fbm(uv, 10., 2.), n3 = vnoise(uv * 200., 200., 3.);
  float rust = smoothstep(.45, .8, fbm(uv, 4., 4.) * .7 + n2 * .3 + (1. - wv) * .08);
  float streak = fbmA(uv, vec2(26., 2.), 5.);
  vec3 c = mix(vec3(.48, .5, .48) * (.85 + n1 * .3), vec3(.32, .19, .1) * (.8 + n3 * .4), rust);
  c *= 1. - smoothstep(.55, .85, streak) * .3;
  h = .5 + wv * .35 + (n3 - .5) * .03;
  col = S(c); rough = mix(.6, .92, rust); metal = (1. - rust) * .5;
}`],
  };
  const regSurf = () => { const X = G.GFX; if (X && X.EXSRC) for (const k in SURF) if (!X.EXSRC[k]) X.EXSRC[k] = SURF[k]; };
  regSurf();

  // ---------------------------------------------------------------- pictures drawn on a canvas (no dice: a fixed sequence)
  const canvasTex = (size, draw, o) => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = o && o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (o && o.flip === false) t.flipY = false; return t;
  };
  const prand = (s) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  // the holes of the grating (the same bars as plGrate: bearing bars every 16 px, 4 px thick; cross rods every 64 px)
  const grateAlpha = () => canvasTex(512, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); g.fillStyle = '#fff'; for (let i = 0; i < 32; i++) g.fillRect(i * 16, 0, 4, 512); for (let j = 0; j < 8; j++) g.fillRect(0, j * 64, 512, 4); }, { linear: true, flip: false });
  // four instrument faces (2 x 2): cream enamel gone yellow, the scale's arc and its figures, the red line, the needle where it stopped
  const dialTex = () => canvasTex(512, (g) => {
    const r = prand(91);
    for (let k = 0; k < 4; k++) {
      const ox = (k % 2) * 256 + 128, oy = Math.floor(k / 2) * 256 + 128, R = 118;
      const gr = g.createRadialGradient(ox, oy, 10, ox, oy, R); gr.addColorStop(0, '#d8cfb4'); gr.addColorStop(1, '#a89c78'); g.fillStyle = '#1c1b19'; g.fillRect(ox - 128, oy - 128, 256, 256);
      g.fillStyle = gr; g.beginPath(); g.arc(ox, oy, R, 0, 7); g.fill();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      g.strokeStyle = '#26221c'; g.lineWidth = 3; g.beginPath(); g.arc(ox, oy, R * 0.78, a0, a1); g.stroke();
      g.strokeStyle = '#8a2a1a'; g.lineWidth = 7; g.beginPath(); g.arc(ox, oy, R * 0.74, a1 - 0.5, a1); g.stroke();
      for (let i = 0; i <= 50; i++) { const a = a0 + (a1 - a0) * i / 50, L = i % 10 === 0 ? 16 : i % 5 === 0 ? 11 : 6; g.lineWidth = i % 10 === 0 ? 3 : 1.5; g.beginPath(); g.moveTo(ox + Math.cos(a) * R * 0.78, oy + Math.sin(a) * R * 0.78); g.lineTo(ox + Math.cos(a) * (R * 0.78 - L), oy + Math.sin(a) * (R * 0.78 - L)); g.stroke(); }
      g.fillStyle = '#26221c'; g.font = 'bold 17px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i <= 5; i++) { const a = a0 + (a1 - a0) * i / 5; g.fillText(String(i * [2, 20, 5, 100][k]), ox + Math.cos(a) * R * 0.52, oy + Math.sin(a) * R * 0.52); }
      g.font = 'bold 22px serif'; g.fillText(['kV', 'A', 'MW', 'V'][k], ox, oy + R * 0.42);
      const na = a0 + (a1 - a0) * (0.05 + r() * 0.5); g.strokeStyle = '#111'; g.lineWidth = 4; g.beginPath(); g.moveTo(ox - Math.cos(na) * 14, oy - Math.sin(na) * 14); g.lineTo(ox + Math.cos(na) * R * 0.74, oy + Math.sin(na) * R * 0.74); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(ox, oy, 9, 0, 7); g.fill();
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${70 + r() * 30},${50 + r() * 20},${20 + r() * 10},${0.08 + r() * 0.14})`; g.beginPath(); g.arc(ox + (r() - 0.5) * R * 1.6, oy + (r() - 0.5) * R * 1.6, 4 + r() * 22, 0, 7); g.fill(); }
    }
  });
  // four enamel plates (2 x 2): the yellow warning triangle with its bolt over lines of writing; the red-headed danger plate; two number tags.
  // Yellowed, chipped to the black iron, rust bleeding from the screw holes
  const signTex = () => canvasTex(512, (g) => {
    const r = prand(57);
    const plate = (ox, oy, bg) => { g.fillStyle = bg; g.fillRect(ox + 6, oy + 6, 244, 244); g.fillStyle = 'rgba(0,0,0,0.5)'; for (const [x, y] of [[20, 20], [236, 20], [20, 236], [236, 236]]) { g.beginPath(); g.arc(ox + x, oy + y, 5, 0, 7); g.fill(); } };
    const lines = (ox, oy, y0, n, col) => { g.fillStyle = col; for (let i = 0; i < n; i++) { let x = ox + 30; while (x < ox + 220) { const L = 8 + r() * 26; if (x + L > ox + 226) break; g.fillRect(x, oy + y0 + i * 18, L, 8); x += L + 6; } } };
    plate(0, 0, '#e8e2cc');
    g.fillStyle = '#e8c21a'; g.beginPath(); g.moveTo(128, 22); g.lineTo(220, 168); g.lineTo(36, 168); g.closePath(); g.fill();
    g.strokeStyle = '#141414'; g.lineWidth = 10; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = '#141414'; g.beginPath(); g.moveTo(140, 58); g.lineTo(108, 118); g.lineTo(130, 116); g.lineTo(112, 156); g.lineTo(152, 100); g.lineTo(130, 102); g.lineTo(148, 58); g.closePath(); g.fill();
    lines(0, 0, 186, 3, '#1a1a1a');
    plate(256, 0, '#ece6d4'); g.fillStyle = '#a82418'; g.fillRect(262, 6, 244, 74); lines(256, 0, 26, 2, '#f0e8d8'); lines(256, 0, 104, 6, '#1a1a1a');
    for (const [k, t] of [[2, '1'], [3, '2']]) { const ox = (k % 2) * 256, oy = 256; plate(ox, oy, '#d9b41c'); g.fillStyle = '#141414'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('No.' === t ? t : t, ox + 128, oy + 140); g.font = 'bold 44px sans-serif'; g.fillText('No.', ox + 128, oy + 44); }
    // the years: yellowing, grime, chips to the iron, rust bleeding down from the holes
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${90 + r() * 40},${70 + r() * 30},${30 + r() * 20},${0.05 + r() * 0.12})`; g.beginPath(); g.arc(r() * 512, r() * 512, 3 + r() * 30, 0, 7); g.fill(); }
    for (let i = 0; i < 120; i++) { g.fillStyle = r() < 0.5 ? '#1b1a19' : '#3a2416'; g.beginPath(); const x = r() * 512, y = r() * 512, s = 1 + r() * 5; g.ellipse(x, y, s * (1 + r()), s, r() * 3, 0, 7); g.fill(); }
    for (let k = 0; k < 4; k++) for (const [x, y] of [[20, 20], [236, 20]]) { const gr = g.createLinearGradient(0, y, 0, y + 70); gr.addColorStop(0, 'rgba(110,50,20,0.55)'); gr.addColorStop(1, 'rgba(110,50,20,0)'); g.fillStyle = gr; g.fillRect((k % 2) * 256 + x - 4, Math.floor(k / 2) * 256 + y, 8, 70); }
  });

  // the marks of the years (2 rows of 4, 256 px each): 0 an oil soak, 1 rust run out over concrete, 2 cracks, 3 a patch of the old floor
  // paint, 4 standing water, 5 the white bloom of salts on brick, 6 dark rain streaks, 7 soot. (Canvas, no dice: a fixed sequence)
  const decalTex = () => GC.decalTex || (GC.decalTex = canvasTex(1024, (g) => {
    g.canvas.height = 512; const r = prand(733);
    const cell = (k, f) => { g.save(); g.beginPath(); g.rect((k % 4) * 256, Math.floor(k / 4) * 256, 256, 256); g.clip(); g.translate((k % 4) * 256, Math.floor(k / 4) * 256); f(); g.restore(); };
    const blob = (cx, cy, R0, n, col, a0) => { for (let i = 0; i < n; i++) { const a = r() * 6.28, d = r() * R0 * 0.75, rr = R0 * (0.12 + r() * 0.35); const gr = g.createRadialGradient(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr); gr.addColorStop(0, `rgba(${col},${a0})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, 7); g.fill(); } };
    cell(0, () => { blob(128, 128, 100, 70, '14,12,10', 0.32); blob(128, 128, 60, 30, '8,7,6', 0.35); });
    cell(1, () => { blob(128, 110, 80, 50, '92,46,20', 0.28); blob(128, 90, 40, 25, '70,32,14', 0.35); for (let i = 0; i < 14; i++) { const x = 70 + r() * 116; const gr = g.createLinearGradient(0, 90, 0, 240); gr.addColorStop(0, 'rgba(90,44,18,0.35)'); gr.addColorStop(1, 'rgba(90,44,18,0)'); g.fillStyle = gr; g.fillRect(x, 90, 2 + r() * 5, 150); } });
    cell(2, () => { g.strokeStyle = 'rgba(10,10,10,0.75)'; g.lineCap = 'round'; const walk = (x, y, a, n, wd) => { g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < n; i++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); if (r() < 0.12 && wd > 1) walk(x, y, a + (r() - 0.5) * 2.4, n / 2, wd * 0.6); } g.stroke(); }; walk(20, 120, 0.1, 26, 2.6); walk(128, 20, 1.5, 22, 2); });
    cell(3, () => { g.fillStyle = 'rgba(112,124,114,0.62)'; g.fillRect(40, 0, 176, 256); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 26; i++) { const cx = 90 + r() * 76, cy = r() * 256, rx = 14 + r() * 34, ry = 20 + r() * 60; const gr = g.createRadialGradient(cx, cy, 0, cx, cy, 1); gr.addColorStop(0, `rgba(0,0,0,${0.55 + r() * 0.45})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(cx, cy); g.scale(rx, ry); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore(); } for (let i = 0; i < 22; i++) { g.fillStyle = 'rgba(0,0,0,1)'; g.beginPath(); g.ellipse(r() < 0.5 ? 41 : 215, r() * 256, 2 + r() * 5, 4 + r() * 12, 0, 0, 7); g.fill(); } g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 40; i++) g.fillRect(40 + r() * 170, r() * 256, 2 + r() * 8, 1 + r() * 3); });
    cell(4, () => { blob(128, 128, 96, 60, '10,12,13', 0.5); });
    cell(5, () => { for (let i = 0; i < 26; i++) { const x = 20 + r() * 216, y0 = r() * 60, L = 80 + r() * 160; const gr = g.createLinearGradient(0, y0, 0, y0 + L); gr.addColorStop(0, 'rgba(230,228,215,0.0)'); gr.addColorStop(0.3, 'rgba(200,198,188,0.16)'); gr.addColorStop(1, 'rgba(230,228,215,0)'); g.fillStyle = gr; g.fillRect(x, y0, 3 + r() * 14, L); } blob(128, 200, 90, 30, '200,198,188', 0.07); });
    cell(6, () => { for (let i = 0; i < 30; i++) { const x = 10 + r() * 236, L = 120 + r() * 136; const gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, 'rgba(12,10,9,0.5)'); gr.addColorStop(1, 'rgba(12,10,9,0)'); g.fillStyle = gr; g.fillRect(x, 0, 1 + r() * 6, L); } });
    cell(7, () => { blob(128, 150, 110, 60, '6,5,5', 0.3); blob(128, 120, 60, 30, '4,4,4', 0.4); });
  }));
  // a mark at (x, y, z), sx by sy, on the floor ('f': turned by rot) or on a face ('w': facing (fx, fz)); collected, built at the end as one mesh
  function decal(k, x, y, z, sx, sy, on, a, b) { (w._pdec || (w._pdec = [])).push([k, x, y, z, sx, sy, on, a || 0, b || 0]); }
  function flushDecals(ww) {
    const L = ww._pdec; ww._pdec = null; if (!L || !L.length) return;
    const P = [], N = [], UV = [], I = [], P2 = [], N2 = [], UV2 = [], I2 = [];
    for (const [k, x, y, z, sx, sy, on, a, b] of L) {
      const u0 = (k % 4) / 4, v0 = k < 4 ? 0.5 : 0, pp = k === 4 ? [P2, N2, UV2, I2] : [P, N, UV, I], base = pp[0].length / 3;
      let ux, uz, vx, vy, vz, nx, ny, nz;
      if (on === 'f') { const c = Math.cos(a), s2 = Math.sin(a); ux = c * sx / 2; uz = s2 * sx / 2; vx = -s2 * sy / 2; vy = 0; vz = c * sy / 2; nx = 0; ny = 1; nz = 0; }
      else { ux = -b * sx / 2; uz = a * sx / 2; vx = 0; vy = sy / 2; vz = 0; nx = a; ny = 0; nz = b; }
      const uy = 0;
      for (const [s1, t1] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pp[0].push(x + ux * s1 + vx * t1, y + uy * s1 + vy * t1, z + uz * s1 + vz * t1); pp[1].push(nx, ny, nz); pp[2].push(u0 + (s1 + 1) / 2 * 0.25, v0 + (t1 + 1) / 2 * 0.5); }
      pp[3].push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    ww.deferred.push((grp) => {
      const mk = (P0, N0, U0, I0, m) => { if (!P0.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P0, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N0, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U0, 2)); g.setIndex(I0); g.computeBoundingSphere(); const me = new THREE.Mesh(g, m); me.castShadow = false; me.receiveShadow = true; me.renderOrder = 1; grp.add(me); };
      mk(P, N, UV, I, GC.decalMat || (GC.decalMat = new THREE.MeshStandardMaterial({ map: decalTex(), transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
      mk(P2, N2, UV2, I2, GC.puddleMat || (GC.puddleMat = new THREE.MeshStandardMaterial({ map: decalTex(), color: 0x2a2e31, transparent: true, depthWrite: false, roughness: 0.38, metalness: 0.0, envMapIntensity: 0.35, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    });
  }

  // ---------------------------------------------------------------- materials (made once, kept in the field's table of materials)
  const MK = ['pconc', 'prust', 'ppaint', 'pplate', 'pgrate', 'pcopper', 'pporc', 'prub', 'plag', 'pgrav', 'ppanel', 'pcast', 'pcorr', 'pdial', 'psign', 'pglass'];
  function plantMats(w) {
    const M = G.Tex.materials('plant');
    if (!M.pconc) {
      regSurf();
      const X = G.GFX, t = G.Tex.tex || {};
      const tx = (n, fb) => { let r = null; try { r = (X && X.tex ? X.tex(n) : null) || (X && X.itemTex ? X.itemTex(n) : null); } catch (e) { r = null; } return r || fb || {}; };
      const mat = (tex, color, rough, metal, ns, extra) => {
        const m = new THREE.MeshStandardMaterial(Object.assign({ map: tex.map || null, normalMap: tex.normalMap || null, color: new THREE.Color(color), roughness: rough, metalness: metal }, tex.orm ? { roughnessMap: tex.orm, aoMap: tex.orm, metalnessMap: tex.orm } : null, extra || {}));
        m.normalScale.set(ns, ns); m.envMapIntensity = 0.35; return m;
      };
      const L = {
        pconc: mat(tx('plConc', t.smooth), '#ffffff', 1, 0, 0.8),
        prust: mat(tx('plRust', t.metal), '#ffffff', 1, 1, 0.9),
        ppaint: mat(tx('plPaint', t.metal), '#ffffff', 1, 1, 0.5),
        pplate: mat(tx('plPlate', t.metal), '#ffffff', 1, 1, 1.0),
        pgrate: mat(tx('plGrate', t.metal), '#ffffff', 1, 1, 0.8, { alphaMap: grateAlpha(), alphaTest: 0.3 }),
        pcopper: mat(tx('plCopper', t.metal), '#ffffff', 1, 1, 0.5),
        pporc: mat(tx('saltGlaze', t.smooth), '#ffffff', 1, 0, 0.6),
        prub: mat(tx('polymer', t.smooth), '#34312d', 1, 0, 0.5),
        plag: mat(tx('plLag', t.cloth), '#ffffff', 1, 1, 0.7),
        pgrav: mat(tx('plGravel', t.rock), '#ffffff', 1, 0, 1.2),
        ppanel: mat(tx('plPanel', t.metal), '#ffffff', 1, 1, 0.6),
        pcast: mat(tx('castIron', t.metal), '#6a6a66', 1, 1, 0.8),
        pcorr: mat(tx('plCorr', t.metal), '#ffffff', 1, 1, 1.0),
        pdial: new THREE.MeshStandardMaterial({ map: dialTex(), roughness: 0.35, metalness: 0 }),
        psign: new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.55, metalness: 0.1 }),
        pglass: new THREE.MeshStandardMaterial({ color: 0x0c0e0f, roughness: 0.1, metalness: 0.4 }),
      };
      for (const k of MK) { const m = L[k]; m.envMapIntensity = 0.35; M[k] = m; const c = m.clone(); c.vertexColors = true; M.vc[k] = c; }
    }
    // (a blue world keeps its own copy of the table of vertex-coloured materials, made when the world was: what it lacks of these, added)
    if (w && w.mats && w.mats.vc && w.mats.vc !== M.vc) for (const k of MK) if (!w.mats.vc[k]) w.mats.vc[k] = M.vc[k];
    return M;
  }

  // ---------------------------------------------------------------- shapes (made once)
  const GC = {};
  const gk = (k, f) => GC[k] || (GC[k] = f());
  const cylG = (n, open) => gk('c' + n + (open ? 'o' : ''), () => new THREE.CylinderGeometry(1, 1, 1, n, 1, !!open));
  const boxG = () => gk('box', () => new THREE.BoxGeometry(1, 1, 1));
  const planeG = () => gk('plane', () => new THREE.PlaneGeometry(1, 1));
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), YUP = new THREE.Vector3(0, 1, 0);
  const Mx = (x, y, z, sx, sy, sz, rx, ry, rz) => new THREE.Matrix4().compose(_a.set(x, y, z), _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0, 'YXZ')), _b.set(sx, sy, sz));
  // a shape made along y (a cylinder), set from a to b, r thick (r2: its other thickness, for an oval)
  const rodM = (ax, ay, az, bx, by, bz, r, r2) => { _c.set(bx - ax, by - ay, bz - az); const L = _c.length() || 1e-6; _q.setFromUnitVectors(YUP, _c.multiplyScalar(1 / L)); return new THREE.Matrix4().compose(_a.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _b.set(r, L, r2 === undefined ? r : r2)); };
  // a shape made along z (a section drawn in x-y: a beam, a channel), set from a to b, its local y turned toward (ux, uy, uz); sx, sy: its section's scale
  const memM = (ax, ay, az, bx, by, bz, ux, uy, uz, sx, sy) => {
    _c.set(bx - ax, by - ay, bz - az); const L = _c.length() || 1e-6; _c.multiplyScalar(1 / L);
    _b.set(ux, uy, uz); _b.addScaledVector(_c, -_b.dot(_c)); if (_b.lengthSq() < 1e-8) { _b.set(1, 0, 0); _b.addScaledVector(_c, -_c.x); } _b.normalize();
    _d.crossVectors(_b, _c);
    const m = new THREE.Matrix4().makeBasis(_d.clone().multiplyScalar(sx || 1), _b.clone().multiplyScalar(sy || 1), _c.clone().multiplyScalar(L));
    m.setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); return m;
  };
  const extr = (pts, depth) => { const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]))); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: depth || 1, bevelEnabled: false, steps: 1 }); g.translate(0, 0, -(depth || 1) / 2); return g; };
  // rolled sections, a metre long along z: H (h deep along y, b wide), channel (web on x = 0, flanges toward +x), angle
  const hsecG = (h, b, tw, tf) => gk('H' + h + ',' + b, () => { const a = b / 2, c = h / 2, t = tw / 2; return extr([[-a, -c], [a, -c], [a, -c + tf], [t, -c + tf], [t, c - tf], [a, c - tf], [a, c], [-a, c], [-a, c - tf], [-t, c - tf], [-t, -c + tf], [-a, -c + tf]]); });
  const chanG = (h, b, t) => gk('C' + h + ',' + b, () => { const c = h / 2; return extr([[0, -c], [b, -c], [b, -c + t], [t, -c + t], [t, c - t], [b, c - t], [b, c], [0, c]]); });
  const angG = (b, t) => gk('L' + b, () => extr([[0, 0], [b, 0], [b, t], [t, t], [t, b], [0, b]]));
  const lathe = (k, pts, seg) => gk(k, () => G.GFX.Geo.lathe(pts, seg));
  // an angle (angG: its legs along local +x and +y) from a to b, its legs turned along u and v
  const angM = (ax, ay, az, bx, by, bz, u, v) => { const d = new THREE.Vector3(bx - ax, by - ay, bz - az), L = d.length(); d.normalize(); let U = new THREE.Vector3(u[0], u[1], u[2]), Vv = new THREE.Vector3(v[0], v[1], v[2]); if (new THREE.Vector3().crossVectors(U, Vv).dot(d) < 0) { const t = U; U = Vv; Vv = t; } const m = new THREE.Matrix4().makeBasis(U, Vv, d.multiplyScalar(L)); m.setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2); return m; };
  // an insulator: a porcelain post of sheds, big and small by turns (its foot at 0, its head at h)
  const insG = (h, r0, r1) => gk('ins' + h + ',' + r1, () => {
    const pts = [[r0 * 1.15, 0], [r0 * 1.15, 0.05]], n = Math.max(2, Math.floor((h - 0.12) / Math.max(0.12, h / 12)));
    for (let i = 0; i < n; i++) { const y = 0.06 + i * (h - 0.12) / n, rr = i % 2 ? r1 * 0.78 : r1; pts.push([r0, y], [rr, y + 0.022], [r0 * 1.05, y + 0.075]); }
    pts.push([r0, h - 0.04], [r0 * 1.15, h - 0.04], [r0 * 1.15, h]);
    return G.GFX.Geo.lathe(pts, 8);
  });
  // a string of cap-and-pin discs, hung from 0 down to -n * 0.15
  const discG = (n) => gk('disc' + n, () => {
    const Ge = G.GFX.Geo, one = [[0.02, 0], [0.13, -0.035], [0.12, -0.055], [0.05, -0.07], [0.025, -0.12]];
    return Ge.merge(Array.from({ length: n }, (_, i) => Ge.xf(Ge.lathe(one, 8), [0, -i * 0.15, 0])));
  });
  const discCapG = (n) => gk('dcap' + n, () => { const Ge = G.GFX.Geo; return Ge.merge(Array.from({ length: n }, (_, i) => Ge.xf(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 6, 1, true), [0, -i * 0.15 + 0.005, 0]))); });
  // a hand wheel of a valve (in x-y, its axle along z): rim, four spokes, the hub
  const wheelG = (r) => gk('wheel' + r, () => { const Ge = G.GFX.Geo, L = [new THREE.TorusGeometry(r, r * 0.09, 6, 18)]; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; L.push(Ge.rod([0, 0, 0], [Math.cos(a) * r, Math.sin(a) * r, 0], r * 0.06, 5)); } L.push(Ge.xf(new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 0.3, 8, 1), [0, 0, 0], [Math.PI / 2, 0, 0])); return Ge.merge(L); });
  // a lamp's shade (an enamelled dish, open downward): its rim at 0, its top at 0.32
  const shadeG = () => lathe('shade', [[0.03, 0.34], [0.06, 0.32], [0.09, 0.27], [0.2, 0.16], [0.3, 0.05], [0.33, 0.0], [0.32, -0.01], [0.29, 0.03], [0.18, 0.14], [0.08, 0.24], [0.05, 0.28]], 14);

  // ---------------------------------------------------------------- the plan (fixed: 90 x 92)
  const W = 90, D = 92, BX = 65.7, BXO = 66.3;      // the hall's east wall: its inner face, its outer face (the yard beyond)
  const RY = 17, ML = 4.5, UL = 11.5;               // the roof's underside; the middle level; the crane's runway walks
  const ROWS = [29, 53], SETS = [[16, 39], [49, 72]], TH = 4, GEN = 16.5;   // (GEN: the generator's middle from the table's north end) // the turbine tables: their middles (x), their lengths (z), half their width
  const SR = { x0: 0, x1: 15.7, z0: 12.3, z1: 83.7 }; // the switch room (inside its walls), under the mezzanine (x 0 - 16, z 12 - 84)
  // the middle level's walks: [x0, z0, x1, z1]
  const NG = [3, 8.5, 62.5, 12], EG = [62.5, 8.5, BX, 79.5], SG = [16, 73.5, 62.5, 76.5];
  const BRIDGES = [[33, 26, 49, 28], [33, 60, 49, 62], [16, 31, 25, 33], [16, 55, 25, 57], [57, 21, 62.5, 23], [57, 65, 62.5, 67], [28, 12, 30, 16], [52, 12, 54, 16], [28, 72, 30, 73.5], [52, 72, 54, 73.5]];
  const TRANS = [17, 73];                            // the main transformers in the yard (z of their middles)
  const GANTRY = [35, 57];

  // the world being built and its helpers (one area at a time: generation is not reentrant)
  let w = null, rng = null, occ = null;
  const PROF = { on: false, t: {} }; let SEC = '';   // (for the tools: triangles drawn by each part of the build)
  const prof = (n, mk) => { if (PROF.on) { const k = SEC + ':' + mk; PROF.t[k] = (PROF.t[k] || 0) + n; } };
  const vb = (mk, x0, y0, z0, x1, y1, z1, o) => prof(12, mk) || w.visual(mk, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), o || { uv: 1 });
  const sb = (mk, x0, y0, z0, x1, y1, z1, o) => prof(12, mk) || w.solid(mk, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), o || { uv: 1 });
  const col = (x0, y0, z0, x1, y1, z1, o) => { const c = w.addCollider(x0, y0, z0, x1, y1, z1, Object.assign({ surf: 'metal' }, o || {})); c.vis = true; return c; };
  const gg = (mk, geo, m, o) => { prof((geo.index ? geo.index.count : geo.attributes.position.count) / 3, mk); w.batch.geo(mk, geo, m, o); };
  const rod = (mk, ax, ay, az, bx, by, bz, r, seg, o) => gg(mk, cylG(seg || 8, true), rodM(ax, ay, az, bx, by, bz, r), o || { su: Math.max(1, 6.28 * r), sv: Math.hypot(bx - ax, by - ay, bz - az) });
  const mem = (mk, geo, ax, ay, az, bx, by, bz, ux, uy, uz, o) => gg(mk, geo, memM(ax, ay, az, bx, by, bz, ux, uy, uz), o || { su: 1, sv: Math.hypot(bx - ax, by - ay, bz - az) });
  const bxr = (mk, x, y, z, sx, sy, sz, ry, o) => gg(mk, boxG(), Mx(x, y, z, sx, sy, sz, 0, ry || 0, 0), o || { su: Math.max(sx, sz), sv: sy });
  const tn = (a, b, c) => [a, b, c];
  const jit = (x, z, k, a) => 1 - a + hsh(x, z, k) * a * 2;
  const tint = (base, x, z, k, a) => { const j = jit(x, z, k, a || 0.08); return [base[0] * j, base[1] * j, base[2] * j]; };
  const mark = (x0, z0, x1, z1, v) => occ.mark(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), v ?? 1);
  // paint colours (multiplied into the pale painted surface): the machines' green-grey, the switchboards' grey, safety yellow, red
  const PAINT = { mach: [0.5, 0.58, 0.5], mach2: [0.46, 0.52, 0.56], board: [0.62, 0.64, 0.6], yellow: [0.95, 0.72, 0.18], red: [0.6, 0.12, 0.08], dkgreen: [0.3, 0.36, 0.3], cream: [0.9, 0.86, 0.74], green: [0.42, 0.52, 0.42], grey: [0.5, 0.5, 0.48] };

  // ---------------------------------------------------------------- building parts
  // a handrail from (ax, az) to (bx, bz) on a floor at y: posts, a top rail and a knee rail of tube, a toe board; a thin box stops you
  function rail(ax, az, bx, bz, y, o) {
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.3) return;
    const n = Math.max(1, Math.ceil(len / 1.9)), dx = (bx - ax) / len, dz = (bz - az) / len, H1 = 1.07;
    for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; rod('prust', x, y, z, x, y + H1 + 0.02, z, 0.021, 5); }
    rod('prust', ax - dx * 0.02, y + H1, az - dz * 0.02, bx + dx * 0.02, y + H1, bz + dz * 0.02, 0.022, 6);
    rod('prust', ax, y + 0.55, az, bx, y + 0.55, bz, 0.017, 5);
    const tz = dz ? 0 : 0.004, tx2 = dx ? 0 : 0.004;
    vb('prust', ax - tx2, y, az - tz, bx + tx2, y + 0.1, bz + tz, { uv: 1, grad: false });
    if (!(o && o.noCol)) { const c = w.addCollider(Math.min(ax, bx) - (dz ? 0.05 : 0), y, Math.min(az, bz) - (dx ? 0.05 : 0), Math.max(ax, bx) + (dz ? 0.05 : 0), y + 1.1, Math.max(az, bz) + (dx ? 0.05 : 0), { surf: 'metal', tag: 'grate' }); c.vis = true; }
  }
  // the rails round a rect at y, but for the open stretches: open = { N: [[a, b]], S: ..., W: ..., E: ... } (N: the z0 side, W: the x0 side)
  function railRect(x0, z0, x1, z1, y, open) {
    open = open || {};
    const segs = (a0, a1, gaps) => { const out = []; let s = a0; for (const [a, b] of (gaps || []).slice().sort((p, q) => p[0] - q[0])) { if (a > s) out.push([s, Math.min(a, a1)]); s = Math.max(s, b); } if (s < a1) out.push([s, a1]); return out.filter(([a, b]) => b - a > 0.25); };
    for (const [a, b] of segs(x0, x1, open.N)) rail(a, z0 + 0.03, b, z0 + 0.03, y);
    for (const [a, b] of segs(x0, x1, open.S)) rail(a, z1 - 0.03, b, z1 - 0.03, y);
    for (const [a, b] of segs(z0, z1, open.W)) rail(x0 + 0.03, a, x0 + 0.03, b, y);
    for (const [a, b] of segs(z0, z1, open.E)) rail(x1 - 0.03, a, x1 - 0.03, b, y);
  }
  // a walk of open grating at y over (x0..x1, z0..z1): the grating, its edge channels and the bearers under it; the box you stand on.
  // (Shot from below, it stops the shot as any floor does: only its look is open)
  function grate(x0, z0, x1, z1, y, o) {
    o = o || {};
    vb('pgrate', x0, y - 0.03, z0, x1, y, z1, { uv: 1, grad: false, skip: { px: true, nx: true, pz: true, nz: true } });
    const ax = x1 - x0 >= z1 - z0;
    for (const s of [0, 1]) { if (ax) vb('prust', x0, y - 0.2, s ? z1 - 0.07 : z0, x1, y, s ? z1 : z0 + 0.07, { uv: 1, grad: false }); else vb('prust', s ? x1 - 0.07 : x0, y - 0.2, z0, s ? x1 : x0 + 0.07, y, z1, { uv: 1, grad: false }); }
    const L = ax ? x1 - x0 : z1 - z0, nb = Math.max(1, Math.round(L / 1.8));
    for (let i = 0; i <= nb; i++) { const u = (ax ? x0 : z0) + L * i / nb; if (ax) vb('prust', u - 0.04, y - 0.18, z0, u + 0.04, y - 0.03, z1, { uv: 1, grad: false }); else vb('prust', x0, y - 0.18, u - 0.04, x1, y - 0.03, u + 0.04, { uv: 1, grad: false }); }
    if (!o.noCol) { const c = w.addCollider(x0, y - 0.2, z0, x1, y, z1, { surf: 'metal', tag: 'bridge' }); c.vis = true; }
  }
  // a post of H section from y0 to y1 at (x, z), on its base plate
  function hpost(x, z, y0, y1, ux, uz, sz) {
    const s = sz || 0.2;
    mem('prust', hsecG(s, s * 0.75, 0.012, 0.016), x, y0, z, x, y1, z, ux ?? 1, 0, uz ?? 0);
    vb('prust', x - s * 0.6, y0, z - s * 0.6, x + s * 0.6, y0 + 0.02, z + s * 0.6, { uv: 1, grad: false });
    col(x - s * 0.45, y0, z - s * 0.45, x + s * 0.45, y1, z + s * 0.45);
  }
  // a steel stair down from a floor's edge (as levelgen's stairs: side N - the floor's north edge at z = e, the stair running north down
  // from it; c its middle, wd its width): open treads of chequer plate with their nosings on two channel stringers, a handrail each side.
  // What you stand on is each tread (a thin box): you walk under the stair's high end, and shots go between the treads
  function steelStair(side, e, c, wd, h0, h1, o) {
    o = o || {};
    const n = Math.max(1, Math.round((h1 - h0) / 0.25)), rise = (h1 - h0) / n, run = 0.5, sg = side === 'S' || side === 'E' ? 1 : -1, alZ = side === 'N' || side === 'S';
    const P3 = (u, y, v) => (alZ ? [v, y, u] : [u, y, v]);   // (u along the run, v across it)
    for (let i = 0; i < n; i++) {
      const top = h1 - i * rise, a = e + sg * i * run, b = e + sg * (i + 1) * run, lo = Math.min(a, b), hi = Math.max(a, b);
      const p0 = P3(lo, top - 0.08, c - wd / 2), p1 = P3(hi, top, c + wd / 2);
      const k = w.addCollider(Math.min(p0[0], p1[0]), p0[1], Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), p1[1], Math.max(p0[2], p1[2]), { surf: 'metal' }); k.vis = true;
      if (i === 0 && !o.firstTread) continue;   // (the first is the floor's own edge)
      const q0 = P3(lo + 0.02, top - 0.035, c - wd / 2 + 0.06), q1 = P3(hi - 0.02, top, c + wd / 2 - 0.06);
      vb('pplate', q0[0], q0[1], q0[2], q1[0], q1[1], q1[2], { uv: 1, grad: false });
      const nz0 = P3(sg > 0 ? lo : hi - 0.05, top - 0.06, c - wd / 2 + 0.06), nz1 = P3(sg > 0 ? lo + 0.05 : hi, top, c + wd / 2 - 0.06);
      vb('prust', nz0[0], nz0[1], nz0[2], nz1[0], nz1[1], nz1[2], { uv: 1, grad: false });
    }
    const L = n * run, uT = e, uB = e + sg * L;
    for (const sd of [-1, 1]) {
      const v = c + sd * (wd / 2 - 0.03);
      const A = P3(uT, h1 - 0.12, v), B = P3(uB, h0 - 0.02, v);
      mem('prust', chanG(0.24, 0.07, 0.01), A[0], A[1] - 0.05, A[2], B[0], B[1] + 0.1, B[2], 0, 1, 0);
      if (o.noRail === sd) continue;
      const RT = P3(uT, h1 + 1.0, v + sd * 0.03), RB = P3(uB, h0 + 1.0, v + sd * 0.03);
      rod('prust', RT[0], RT[1], RT[2], RB[0], RB[1], RB[2], 0.022, 6);
      const KT = P3(uT, h1 + 0.5, v + sd * 0.03), KB = P3(uB, h0 + 0.5, v + sd * 0.03);
      rod('prust', KT[0], KT[1], KT[2], KB[0], KB[1], KB[2], 0.017, 6);
      for (let i = 1; i < n; i += 3) { const u = e + sg * (i + 0.5) * run, y = h1 - i * rise, p = P3(u, y, v + sd * 0.03); rod('prust', p[0], y, p[2], p[0], y + 1.02, p[2], 0.02, 6); }
      // (its side: per tread, a thin box from the tread up: you do not step off the side of a stair)
      for (let i = 1; i < n; i++) { const top = h1 - i * rise, a = e + sg * i * run, b = e + sg * (i + 1) * run, p0 = P3(Math.min(a, b), top, v + sd * 0.02), p1 = P3(Math.max(a, b), top + 1.05, v + sd * 0.08); const k = w.addCollider(Math.min(p0[0], p1[0]), top, Math.min(p0[2], p1[2]), Math.max(p0[0], p1[0]), top + 1.05, Math.max(p0[2], p1[2]), { surf: 'metal', tag: 'grate' }); k.vis = true; }
    }
    const f0 = P3(Math.min(uT, uB), 0, c - wd / 2), f1 = P3(Math.max(uT, uB), 0, c + wd / 2);
    mark(f0[0], f0[2], f1[0], f1[2]);
    return L;
  }
  // a fixed ladder up a face, at (x, z) climbing from y0 to y1, stepping off toward dir at its head (player.js / strata.js S.ladder):
  // two stiles and the rungs, a safety cage of hoops and straps from 2.4 m up
  function ladder(x, z, y0, y1, dir, cage) {
    w.ladders = w.ladders || [];
    w.ladders.push({ x, z, y0, y1, dir });
    const fx = x + dir[0] * 0.3, fz = z + dir[1] * 0.3, ax = dir[0] ? 0 : 1, az = dir[0] ? 1 : 0;
    for (const sd of [-0.23, 0.23]) rod('prust', fx + ax * sd, y0, fz + az * sd, fx + ax * sd, y1 + 1.05, fz + az * sd, 0.025, 6);
    for (let y = y0 + 0.3; y < y1 + 0.9; y += 0.3) rod('prust', fx - ax * 0.23, y, fz - az * 0.23, fx + ax * 0.23, y, fz + az * 0.23, 0.014, 5);
    if (!cage) return;
    // (the cage: hoops round the climber's back, from the stiles round and back to them, every 0.9 m; five straps up it)
    const R = 0.36, cp = (a) => [x - dir[0] * Math.cos(a) * R + ax * Math.sin(a) * R, z - dir[1] * Math.cos(a) * R + az * Math.sin(a) * R];
    const hoop = gk('hoop' + dir[0] + ',' + dir[1], () => { const Ge = G.GFX.Geo, L = []; let p = [x - ax * 0.23 + dir[0] * 0.3 - x, z - az * 0.23 + dir[1] * 0.3 - z]; for (let i = 0; i <= 8; i++) { const q = cp(-Math.PI / 2 + Math.PI * i / 8); L.push(Ge.rod([p[0], 0, p[1]], [q[0] - x, 0, q[1] - z], 0.012, 4)); p = [q[0] - x, q[1] - z]; } L.push(Ge.rod([p[0], 0, p[1]], [ax * 0.23 + dir[0] * 0.3, 0, az * 0.23 + dir[1] * 0.3], 0.012, 4)); return Ge.merge(L); });
    for (let y = y0 + 2.4; y < y1 + 0.95; y += 0.9) gg('prust', hoop, Mx(x, y, z, 1, 1, 1), { su: 1, sv: 1 });
    for (let k = 0; k < 5; k++) { const q = cp(-Math.PI / 2 + Math.PI * k / 4); rod('prust', q[0], y0 + 2.4, q[1], q[0], y1 + 0.95, q[1], 0.011, 4); }
  }
  // a run of pipe through points (y up): straight lengths, an elbow at each bend; o.lag: lagged (thicker, canvas and bands), o.fl: flanges every so often
  function pipe(pts, r, o) {
    o = o || {};
    const mk = o.mk || (o.lag ? 'plag' : 'prust'), R = o.lag ? r * 1.35 : r, n = pts.length;
    for (let i = 0; i + 1 < n; i++) {
      const A = pts[i], B = pts[i + 1], L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      const ta = i > 0 ? R * 1.4 : 0, tb = i + 2 < n ? R * 1.4 : 0, ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, uz = (B[2] - A[2]) / L;
      rod(mk, A[0] + ux * ta, A[1] + uy * ta, A[2] + uz * ta, B[0] - ux * tb, B[1] - uy * tb, B[2] - uz * tb, R, o.seg || 10, { su: 6.28 * R, sv: L, tint: o.tint });
      if (o.fl) for (let s = o.fl; s < L - 0.4; s += o.fl) { const x = A[0] + ux * s, y = A[1] + uy * s, z = A[2] + uz * s; gg('pcast', cylG(o.seg || 12), rodM(x - ux * 0.04, y - uy * 0.04, z - uz * 0.04, x + ux * 0.04, y + uy * 0.04, z + uz * 0.04, R * 1.55), { su: 1, sv: 0.1 }); }
    }
    // the elbows: a bend of the same pipe at each corner (a piece of torus between the two straight lengths' trimmed ends)
    for (let i = 1; i + 1 < n; i++) {
      const A = pts[i - 1], B = pts[i], C = pts[i + 1];
      const u = new THREE.Vector3(B[0] - A[0], B[1] - A[1], B[2] - A[2]).normalize(), v = new THREE.Vector3(C[0] - B[0], C[1] - B[1], C[2] - B[2]).normalize();
      const th = Math.acos(Math.max(-1, Math.min(1, u.dot(v)))); if (th < 0.01) continue;
      const t = R * 1.4, Rb = t / Math.tan(th / 2), nn = v.clone().addScaledVector(u, -u.dot(v)).normalize();
      const pa = new THREE.Vector3(B[0], B[1], B[2]).addScaledVector(u, -t), cen = pa.clone().addScaledVector(nn, Rb);
      const xa = nn.clone().negate(), za = new THREE.Vector3().crossVectors(xa, u);
      const m = new THREE.Matrix4().makeBasis(xa, u, za); m.setPosition(cen);
      gg(mk, gk('elb' + Rb.toFixed(3) + ',' + R.toFixed(3) + ',' + th.toFixed(3) + (o.seg || 12), () => new THREE.TorusGeometry(Rb, R, Math.min(10, o.seg || 10), 5, th)), m, { su: 1, sv: 1, tint: o.tint });
    }
  }
  // a valve on a vertical or level pipe: its body (cast), bonnet, the stem and the hand wheel facing (fx, fz)
  function valve(x, y, z, r, fx, fz) {
    gg('pcast', gk('sph8', () => new THREE.SphereGeometry(1, 10, 7)), Mx(x, y, z, r * 1.5, r * 1.3, r * 1.5));
    const L = r * 2.2 + 0.12;
    rod('pcast', x, y, z, x + fx * L, y, z + fz * L, r * 0.55, 8);
    rod('prust', x + fx * L, y, z + fz * L, x + fx * (L + 0.12), y, z + fz * (L + 0.12), 0.016, 5);
    gg('ppaint', wheelG(Math.max(0.12, r * 1.4)), Mx(x + fx * (L + 0.12), y, z + fz * (L + 0.12), 1, 1, 1, 0, Math.atan2(fx, fz), 0), { tint: PAINT.red, su: 1, sv: 1 });
  }
  // a round gauge on a short stalk, its face toward (fx, fz); k: which face of the four
  function gauge(x, y, z, fx, fz, s, k) {
    const ry = Math.atan2(fx, fz);
    gg('pcast', cylG(10, true), Mx(x, y, z, s, 0.05, s, Math.PI / 2, ry, 0), { su: 1, sv: 0.2 });
    const q = (k ?? Math.floor(hsh(x, z, 3) * 4)) % 4, u0 = (q % 2) * 0.5, v0 = q < 2 ? 0.5 : 0;
    gg('pdial', gk('dialq' + q, () => { const g = new THREE.CircleGeometry(1, 12); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5); return g; }), Mx(x + fx * 0.026, y, z + fz * 0.026, s * 0.88, s * 0.88, 1, 0, ry, 0));
  }
  // an enamel sign (k: 0 high voltage, 1 danger, 2 / 3 number tags) flat on a face, toward (fx, fz)
  function sign(x, y, z, fx, fz, s, k) {
    const u0 = (k % 2) * 0.5, v0 = k < 2 ? 0.5 : 0;
    gg('psign', gk('signq' + k, () => { const g = new THREE.PlaneGeometry(1, 1); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + 0.012 + uv.getX(i) * 0.476, v0 + 0.012 + uv.getY(i) * 0.476); return g; }), Mx(x + fx * 0.012, y, z + fz * 0.012, s, s, 1, 0, Math.atan2(fx, fz), 0));
  }
  // a lamp: an enamelled shade on its rod or chain (from yTop), the bulb lit or dead; lit, its light
  // the kinds of lamp: sodium (orange), mercury (blue-white), incandescent; [the light's colour, the bulb's]
  const LAMP = { sod: ['#ff9646', [1, 0.6, 0.28]], hg: ['#d2e0ff', [0.82, 0.9, 1]], inc: ['#ffd2a0', [1, 0.86, 0.62]], red: ['#ff3a20', [1, 0.18, 0.1]] };
  // a failing lamp: on, off, a stutter, on again (by the game's clock; drawn by the light's own on/off - js/elec.js's flicker of the
  // lamps writes their strength, not this)
  const blinker = (seed) => { let st = true, nt = 0; return () => { const t = G.game && G.game.time != null ? G.game.time : performance.now() / 1000; if (t >= nt || t < nt - 30) { const r = hsh(seed, Math.floor(t * 7.3), 5), r2 = hsh(seed, Math.floor(t * 3.1), 6); st = r2 < 0.15 ? r > 0.6 : r > 0.12; nt = t + (st ? 0.08 + r * 1.4 : 0.03 + r * 0.2); } return st; }; };
  // a lamp: an enamelled shade on its rod or chain (from yTop), the bulb lit, failing ('blink') or dead; lit, its light, and (o.cone) the
  // dust standing in its light
  function lamp(x, y, z, yTop, on, o) {
    o = o || {};
    const K = LAMP[o.kind || 'inc'], sc = o.s || 1;
    gg('ppaint', shadeG(), Mx(x, y, z, sc, sc, sc), { tint: PAINT.dkgreen, su: 1, sv: 1 });
    rod('prust', x, y + 0.33 * sc, z, x, yTop, z, 0.012, 5);
    if (!on) { gg('pglass', gk('bulb', () => new THREE.SphereGeometry(1, 8, 6)), Mx(x, y + 0.08, z, 0.07, 0.08, 0.07)); return null; }
    w.addLight(x, y - 0.3, z, { flame: 0, emit: false, steady: true, intensity: o.I || 9, range: o.R || 18, color: K[0], prio: o.prio || 0.8, elecLamp: true });
    const L = w.lightSources[w.lightSources.length - 1];
    const bc = w.blue && o.kind !== 'hg' && G.Blue ? new THREE.Color(G.Blue.light(new THREE.Color(K[1][0], K[1][1], K[1][2]).getHex())) : new THREE.Color(K[1][0], K[1][1], K[1][2]);
    if (on === 'blink') {
      let bulb = null; const bl = blinker(x * 13 + z);
      w.deferred.push((grp) => { bulb = new THREE.Mesh(gk('bulbS', () => new THREE.SphereGeometry(1, 8, 6)), new THREE.MeshBasicMaterial({ color: bc })); bulb.scale.set(0.08 * sc, 0.07 * sc, 0.08 * sc); bulb.position.set(x, y + 0.08 * sc, z); grp.add(bulb); });
      Object.defineProperty(L, 'on', { configurable: true, enumerable: true, get: () => { const st = bl(); if (bulb) bulb.visible = st; return st; }, set: () => {} });
    } else w.visual('glow', x - 0.07 * sc, y + 0.02, z - 0.07 * sc, x + 0.07 * sc, y + 0.12 * sc, z + 0.07 * sc, { uv: 1, grad: false, tint: [bc.r, bc.g, bc.b] });
    if (o.cone) dustCone(x, y, z, o.cone, bc);
    return L;
  }
  // the dust in a lamp's light: a pale cone from the shade down, brightest at the top, gone at the floor (added light, no shadow)
  const coneTex = () => GC.coneTex || (GC.coneTex = canvasTex(64, (g) => { const r = prand(17); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(160,160,160,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.3})`; g.fillRect(r() * 64, 0, 1 + r() * 3, 64); } }));
  function dustCone(x, y, z, h, col) {
    w.deferred.push((grp) => {
      const m = new THREE.Mesh(gk('cone', () => new THREE.ConeGeometry(1, 1, 20, 1, true)), new THREE.ShaderMaterial({ uniforms: { c: { value: col.clone() }, o: { value: 0.16 }, tx: { value: coneTex() } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec2 vU; void main(){ vec4 wp = modelMatrix * vec4(position, 1.); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); vU = uv; gl_Position = projectionMatrix * viewMatrix * wp; }',
        fragmentShader: 'uniform vec3 c; uniform float o; uniform sampler2D tx; varying vec3 vN; varying vec3 vV; varying vec2 vU; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 3.); float v = vU.y * vU.y * texture2D(tx, vU).r; gl_FragColor = vec4(c * f * v * o, 1.); }',
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.scale.set(h * 0.42, h, h * 0.42); m.position.set(x, y - h / 2, z); m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; grp.add(m);
    });
  }
  // a red emergency lamp on a face (toward fx, fz): its cage and the red glass; a small red light
  function redLamp(x, y, z, fx, fz) {
    const ry = Math.atan2(fx, fz);
    bxr('prust', x, y, z, 0.24, 0.14, 0.06, ry); const g = [x + fx * 0.06, y, z + fz * 0.06];
    gg('glow', boxG(), Mx(g[0], g[1], g[2], 0.16, 0.08, 0.06, 0, ry, 0), { tint: [1, 0.16, 0.08] });
    for (const d of [-0.05, 0, 0.05]) rod('prust', g[0] + fx * 0.035 - fz * d, y - 0.05, g[2] + fz * 0.035 + fx * d, g[0] + fx * 0.035 - fz * d, y + 0.05, g[2] + fz * 0.035 + fx * d, 0.005, 4);
    w.addLight(x + fx * 0.4, y, z + fz * 0.4, { flame: 0, emit: false, steady: true, intensity: 2.6, range: 7, color: LAMP.red[0], prio: 0.55 });
  }
  // a breaker box (the switch that kills a trap): a steel case 0.5 wide, 0.7 high, 0.25 deep, its door (local +z) toward ry; a lever on its
  // right side, the dead red lamp's lens at the top of its door, a warning plate under it, its conduit up the face behind it.
  // (x, y, z) is the middle of its case. The case stops shots (c.elecBox: the index into w.elec's list of boxes, for whoever wants it)
  // (js/elec.js reads it so: the case about 0.6 x 0.9 x 0.4 m, its lamp's lens set 0.28 m over the middle of its door - here only the
  // dead lamp's socket and guard are drawn there - and its own box to be shot, 0.68 x 0.92 x 0.44 m: what stops you here is smaller)
  const BOXW = 0.6, BOXH = 0.9, BOXD = 0.4;
  function elecBox(x, y, z, ry, id, conduitTop, floorY) {
    const s = Math.sin(ry), c = Math.cos(ry), L = (lx, ly, lz) => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    bxr('ppaint', x, y, z, BOXW, BOXH, BOXD - 0.03, ry, { tint: PAINT.board, su: 0.6, sv: 0.9 });
    const d = L(0, -0.03, BOXD / 2 - 0.01); bxr('ppaint', d[0], d[1], d[2], BOXW - 0.05, BOXH - 0.1, 0.022, ry, { tint: tint(PAINT.board, x, z, 2, 0.05), su: 0.6, sv: 0.8 });
    const hg = L(-BOXW / 2 + 0.035, -0.03, BOXD / 2); for (const dy of [-0.3, 0.26]) rod('pcast', hg[0], hg[1] + dy - 0.05, hg[2], hg[0], hg[1] + dy + 0.05, hg[2], 0.013, 6);
    // the lamp's socket over the door: a ring with a guard of three bars (the lens itself is elec.js's)
    const lp = L(0, 0.28, BOXD / 2 + 0.005); gg('pcast', cylG(12), Mx(lp[0], lp[1], lp[2], 0.055, 0.03, 0.055, Math.PI / 2, ry, 0));
    for (const a of [0, 2.09, 4.19]) { const e = L(Math.cos(a) * 0.045, 0.28 + Math.sin(a) * 0.045, BOXD / 2 + 0.06); rod('prust', lp[0] + (e[0] - lp[0]) * 0.5 + s * 0.0, lp[1] + (e[1] - lp[1]) * 0.5, lp[2] + (e[2] - lp[2]) * 0.5, e[0], e[1], e[2], 0.005, 4); }
    const sg0 = L(0, -0.1, BOXD / 2 + 0.013); sign(sg0[0], sg0[1], sg0[2], s, c, 0.26, 0);
    const kh = L(BOXW / 2 - 0.09, -0.02, BOXD / 2 + 0.03); gg('pcast', cylG(8), Mx(kh[0], kh[1], kh[2], 0.022, 0.03, 0.022, Math.PI / 2, ry, 0));
    const lv = L(BOXW / 2 + 0.03, 0.05, 0); bxr('pcast', lv[0], lv[1], lv[2], 0.05, 0.14, 0.1, ry);
    const lh = L(BOXW / 2 + 0.08, 0.22, 0.06); rod('ppaint', lv[0], lv[1] + 0.03, lv[2], lh[0], lh[1], lh[2], 0.016, 6, { tint: PAINT.red, su: 1, sv: 1 });
    // its conduits: up from its top to the trays (or the wall's height), down from its foot to the floor
    const back = L(0, BOXH / 2, -BOXD / 2 + 0.06); rod('prust', back[0], back[1], back[2], back[0], conduitTop ?? y + 1.8, back[2], 0.028, 8);
    if (floorY !== undefined) { const b2 = L(0.15, -BOXH / 2, -BOXD / 2 + 0.06); rod('prust', b2[0], b2[1], b2[2], b2[0], floorY, b2[2], 0.022, 8); }
    let ax0 = 1e9, ax1 = -1e9, az0 = 1e9, az1 = -1e9;
    for (const [lx, lz] of [[-0.24, -0.15], [0.24, -0.15], [-0.24, 0.15], [0.24, 0.15]]) { const p = L(lx, 0, lz); ax0 = Math.min(ax0, p[0]); ax1 = Math.max(ax1, p[0]); az0 = Math.min(az0, p[2]); az1 = Math.max(az1, p[2]); }
    const k = col(ax0, y - 0.38, az0, ax1, y + 0.38, az1, {}); k.elecBox = id;
    return { x, y, z, ry };
  }
  // an insulator post on its short steel pedestal (the arcs' ends; also the yard's bus supports): foot at y0, its cap's clamp at the returned height
  function insPost(x, z, y0, ped, hIns, r1) {
    hpost(x, z, y0, y0 + ped, 1, 0, 0.16);
    vb('pconc', x - 0.32, y0 - 0.02, z - 0.32, x + 0.32, y0 + 0.08, z + 0.32, { uv: 1, tint: [0.85, 0.85, 0.84] });
    vb('prust', x - 0.15, y0 + ped, z - 0.15, x + 0.15, y0 + ped + 0.03, z + 0.15, { uv: 1, grad: false });
    gg('pcast', cylG(10), Mx(x, y0 + ped + 0.07, z, 0.1, 0.08, 0.1));
    gg('pporc', insG(hIns, 0.055, r1 || 0.13), Mx(x, y0 + ped + 0.11, z, 1, 1, 1), { su: 1, sv: 1 });
    const top = y0 + ped + 0.11 + hIns;
    gg('pcast', cylG(10), Mx(x, top + 0.04, z, 0.09, 0.08, 0.09));
    gg('pcopper', boxG(), Mx(x, top + 0.11, z, 0.1, 0.06, 0.06));
    col(x - 0.14, y0, z - 0.14, x + 0.14, top + 0.12, z + 0.14, {});
    return top + 0.12;
  }
  // a slack line from a to b, hanging sag under the straight between them (a tube of n lengths)
  function slack(mk, a, b, sag, r, o) {
    const n = Math.max(6, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.7));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, y0 = a[1] + (b[1] - a[1]) * t0 - sag * 4 * t0 * (1 - t0), y1 = a[1] + (b[1] - a[1]) * t1 - sag * 4 * t1 * (1 - t1);
      rod(mk, a[0] + (b[0] - a[0]) * t0, y0, a[2] + (b[2] - a[2]) * t0, a[0] + (b[0] - a[0]) * t1, y1, a[2] + (b[2] - a[2]) * t1, r, 6, o);
    }
  }
  // brick wall along an axis with its plinth, cut where the holes are; tall windows in each bay above (a frame of steel glazing bars,
  // a pane left here and there, the sill), steel pilasters on its inner face. alongX: the wall runs along x at z = plane (inner face),
  // its thickness t toward out (-1 / +1). holes: [a0, a1, y0, y1]. o.dark: a dark backing behind the windows (the cave's rock)
  function brickWall(alongX, plane, out, a0, a1, t, holes, o) {
    o = o || {};
    const top = RY + 1.3, BAY = 6, win = [];
    const pilAt = []; for (let p = Math.ceil((a0 + 0.5) / BAY) * BAY; p < a1 - 0.5; p += BAY) pilAt.push(p);
    for (let i = 0; i <= pilAt.length; i++) {
      const b0 = i ? pilAt[i - 1] : a0, b1 = i < pilAt.length ? pilAt[i] : a1; if (b1 - b0 < 4.5 || o.noWin) continue;
      const m = (b0 + b1) / 2, hw = Math.min(1.8, (b1 - b0) / 2 - 0.9);
      if (!holes.some((h) => h[0] < m + hw && h[1] > m - hw && h[2] < 14.6 && h[3] > 8.4)) win.push([m - hw, m + hw, 8.6, 14.4]);
    }
    const all = holes.concat(win);
    const P2 = (a, y, d) => (alongX ? [a, y, plane + out * d] : [plane + out * d, y, a]);
    const rects = (r0) => { let rs = [r0]; for (const h of all) { const nx = []; for (const r of rs) { if (h[0] >= r[1] || h[1] <= r[0] || h[2] >= r[3] || h[3] <= r[2]) { nx.push(r); continue; } if (h[0] > r[0]) nx.push([r[0], h[0], r[2], r[3]]); if (h[1] < r[1]) nx.push([h[1], r[1], r[2], r[3]]); const xa = Math.max(r[0], h[0]), xb = Math.min(r[1], h[1]); if (h[2] > r[2]) nx.push([xa, xb, r[2], h[2]]); if (h[3] < r[3]) nx.push([xa, xb, h[3], r[3]]); } rs = nx; } return rs; };
    for (const r of rects([a0, a1, 1.15, top])) { const p = P2(r[0], r[2], 0), q = P2(r[1], r[3], t); sb('wall', p[0], p[1], p[2], q[0], q[1], q[2], { uv: 2.5 }); }
    // (the bloom of salts low on the brick, here and there; a band of the old paint on its inner face up to 2.2 m, peeling away in places)
    for (let a = a0 + 1; a < a1 - 1; a += 3.2 + hsh(a, plane, 61) * 3) { if (all.some((h) => h[0] - 0.5 < a && h[1] + 0.5 > a && h[2] < 2.5)) continue; const pq = P2(a, 1.15 + 0.8 + hsh(a, 2, 62) * 0.8, -0.012); decal(5, pq[0], pq[1], pq[2], 1.4 + hsh(a, 3, 63) * 1.6, 1.6 + hsh(a, 4, 64), 'w', alongX ? 0 : -out, alongX ? -out : 0); }
    if (o.dado) for (let a = a0 + 0.3; a < a1 - 0.3;) { const L = 0.8 + hsh(a, plane, 65) * 3.2, b2 = Math.min(a1 - 0.3, a + L); if (hsh(a, plane, 66) > 0.22 && !all.some((h) => h[0] < b2 && h[1] > a && h[2] < 2.2)) { const pa = P2(a, 1.15, -0.008), pb = P2(b2, 2.2 - hsh(a, 5, 67) * 0.3, -0.016); vb('ppaint', pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], { uv: 2, grad: false, tint: tint([0.3, 0.4, 0.34], a, plane, 68, 0.1) }); } a = b2 + 0.1 + hsh(a, plane, 69) * 1.2; }
    for (const r of rects([a0, a1, 0, 1.15])) { const p = P2(r[0], r[2], -0.08), q = P2(r[1], r[3], t); sb('pconc', p[0], p[1], p[2], q[0], q[1], q[2], { uv: 3, tint: tint([0.78, 0.76, 0.72], r[0], plane, 1, 0.05) }); const p2 = P2(r[0], 1.1, -0.11), q2 = P2(r[1], 1.18, 0); vb('pconc', p2[0], p2[1], p2[2], q2[0], q2[1], q2[2], { uv: 2, grad: false, tint: [0.7, 0.68, 0.64] }); }
    // the windows: the reveal, the sill, the frame and its bars, panes left in some
    for (const [w0, w1, y0, y1] of win) {
      const s0 = P2(w0 - 0.1, y0 - 0.14, -0.12), s1 = P2(w1 + 0.1, y0, t * 0.6); vb('pconc', s0[0], s0[1], s0[2], s1[0], s1[1], s1[2], { uv: 1, tint: [0.72, 0.7, 0.66] });
      const fd = t * 0.45, bars = [];
      for (let a = w0; a <= w1 + 0.01; a += (w1 - w0) / 4) bars.push(['v', a]);
      for (let y = y0; y <= y1 + 0.01; y += (y1 - y0) / 6) bars.push(['h', y]);
      for (const [k, v] of bars) { const A = k === 'v' ? P2(v - 0.025, y0, fd - 0.03) : P2(w0, v - 0.025, fd - 0.03), B = k === 'v' ? P2(v + 0.025, y1, fd + 0.03) : P2(w1, v + 0.025, fd + 0.03); vb('prust', A[0], A[1], A[2], B[0], B[1], B[2], { uv: 1, grad: false }); }
      const cw = (w1 - w0) / 4, ch = (y1 - y0) / 6;
      for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { const hv = hsh(w0 + i * 3.1, plane + j * 1.7, 9); if (hv > 0.3) continue; const A = P2(w0 + i * cw + 0.02, y0 + j * ch + 0.02, fd), B = P2(w0 + (i + 1) * cw - 0.02, y0 + (j + 1) * ch - 0.02, fd + 0.004); vb(hv < 0.08 ? 'prust' : 'pglass', A[0], A[1], A[2], B[0], B[1], B[2], { uv: 1, grad: false, tint: hv < 0.08 ? [0.6, 0.6, 0.6] : [1, 1, 1], skip: alongX ? { px: true, nx: true, top: true, bottom: true } : { pz: true, nz: true, top: true, bottom: true } }); }
      { const st = P2((w0 + w1) / 2, (y0 + 1.15) / 2, -0.013); decal(6, st[0], st[1], st[2], (w1 - w0) * 0.9, y0 - 1.15, 'w', alongX ? 0 : -out, alongX ? -out : 0); }
      if (o.dark) { const A = P2(w0 - 0.3, y0 - 0.3, t + 1.2), B = P2(w1 + 0.3, y1 + 0.3, t + 1.3); vb('rock', A[0], A[1], A[2], B[0], B[1], B[2], { uv: 4, grad: false, flat: true, tint: [0.22, 0.22, 0.22] }); }
      col(...(() => { const A = P2(w0, y0, 0), B = P2(w1, y1, t); return [Math.min(A[0], B[0]), A[1], Math.min(A[2], B[2]), Math.max(A[0], B[0]), B[1], Math.max(A[2], B[2])]; })(), { tag: 'grate' });
    }
    // the pilasters (H columns proud of the inner face), their bases and the haunches of the roof truss over them
    for (const p of pilAt) { if (holes.some((h) => h[0] - 0.3 < p && h[1] + 0.3 > p && h[2] < 1)) continue; const A = P2(p, 0, -0.2), B = P2(p, RY, -0.2); mem('prust', hsecG(0.4, 0.3, 0.014, 0.02), A[0], 0, A[2], B[0], RY, B[2], alongX ? 0 : 1, 0, alongX ? 1 : 0); const c0 = P2(p - 0.18, 0, -0.42), c1 = P2(p + 0.18, RY, 0); col(Math.min(c0[0], c1[0]), 0, Math.min(c0[2], c1[2]), Math.max(c0[0], c1[0]), RY, Math.max(c0[2], c1[2])); const b0 = P2(p - 0.3, 0, -0.5), b1 = P2(p + 0.3, 0.25, 0); vb('pconc', b0[0], 0, b0[2], b1[0], 0.25, b1[2], { uv: 1, tint: [0.7, 0.68, 0.65] }); }
    return pilAt;
  }

  // ---------------------------------------------------------------- the area
  function genPlant(area, seed, extraChests, gates, kind) {
    rng = new G.RNG(seed);
    plantMats(null);
    w = new G.World(W, D, 'plant');
    plantMats(w);
    w._fmask = new Uint8Array(W * D); w._floorDone = {}; w.platTops = []; w.ladders = [];
    occ = H.Occ(W, D);
    FB.reserve(occ, W, D, gates);
    // ---- the dice, thrown here first in a fixed order
    const layout = F.pickLayout(rng, 'plant', ['mid', 'north', 'south']);   // where the crane stands (its bridge over the hall)
    w.layout = layout;
    const S = { gates, layout, zc: { mid: 44, north: 34.5, south: 53.5 }[layout], tx: rng.range(37.5, 44.5), load: rng.pick(['rotor', 'crate', 'coil']), zones: [], arcs: [], boxes: [] };
    S.dice = []; for (let i = 0; i < 64; i++) S.dice.push(rng.next());   // (what the dressing and the traps choose by: thrown once, used in order)
    S.di = 0; S.r = () => S.dice[(S.di++) % S.dice.length];
    // ---- the hall: floor, walls, roof; the yard's ground and the cave round it
    SEC = 'ground'; ground(S);
    SEC = 'hallShell'; hallShell(S);
    SEC = 'cave'; cave(S);
    // ---- the turbine sets on their tables, the middle level, the stairs, the crane
    SEC = 'tg'; for (let r = 0; r < 2; r++) for (let s = 0; s < 2; s++) tgSet(S, ROWS[r], SETS[s][0], SETS[s][1], r, s);
    SEC = 'middle'; middle(S);
    SEC = 'crane'; crane(S);
    // ---- the switch room under the mezzanine, the yard
    SEC = 'switchRoom'; switchRoom(S);
    SEC = 'mezzanine'; mezzanine(S);
    SEC = 'yard'; yard(S);
    // ---- the traps' places (drawn dead) and their breaker boxes; the floor's things; the lights
    SEC = 'traps'; traps(S);
    SEC = 'clutter'; clutter(S); entryWork(S);
    SEC = 'lights'; lights(S);
    SEC = 'grime'; grime(S);
    flushDecals(w);
    w.navLayers = 3;
    w.elec = { zones: S.zones, arcs: S.arcs };
    w.plantInfo = { zc: S.zc, layout };   // (for the tools)
    const ww = FB.finish(w, rng, occ, W, D, area, kind, extraChests);
    ww.spawn = { x: W / 2, y: 0, z: D - 4.5, yaw: 0 };
    spawnOnFloor(ww);
    w = null; occ = null;
    return ww;
  }
  // where foes are set down (world.js randomOpenCell: game.js spawnEnemy, the altars, depth.js): of the cells the walkers' ways reach,
  // only those whose ground is the floor itself and where a body stands clear of everything built here - not a cell a pump's skid, a
  // drum or a rack reaches into (its middle still the floor's, but a big foe set down there stood half in the thing, and was pushed out
  // on top of it). The things themselves are left as they are: you climb onto them as before
  const SPAWN_R = 0.5, SPAWN_H = 1.9;
  const spawnClear = (ww, x, y, z) => ww.boxFree(x - SPAWN_R, y + 0.05, z - SPAWN_R, x + SPAWN_R, y + SPAWN_H, z + SPAWN_R) && Math.abs(ww.floorBelow(x, y + 0.3, z) - y) < 0.06;
  function spawnOnFloor(ww) {
    const base = ww.randomOpenCell;
    ww.randomOpenCell = function (rng, filter) { return base.call(this, rng, (x, z, i) => (!filter || filter(x, z, i)) && spawnClear(this, x, this.nf[i], z)); };
    ww.spawnClear = (x, y, z) => spawnClear(ww, x, y, z);   // (for the tools)
  }
  F.gen.plant = genPlant;

  // ---------------------------------------------------------------- the ground: the hall's concrete in its bays, the trenches; the yard's gravel
  function ground(S) {
    // the hall's floor: one box you stand on; drawn as the pours of the slab (6 m bays, a saw cut between, each its own shade), cut round
    // the trenches (open, a grating over them)
    col(-0.5, -1, 0, BXO, 0, D, { surf: 'stone' }).mk = 'pconc';
    const TR = [[40.55, 4, 41.45, 76], [16, 43.55, BX, 44.45], [16.4, 24, 17.2, 82], [17.5, 86.6, 38.5, 87.4]];   // the trenches: the middle aisle's, across the hall, the cable trench along the switch room
    S.trenches = TR;
    const holes = TR;
    const cut = (r) => { let rs = [r]; for (const h of holes) { const nx = []; for (const q of rs) { if (h[0] >= q[2] || h[2] <= q[0] || h[1] >= q[3] || h[3] <= q[1]) { nx.push(q); continue; } if (h[0] > q[0]) nx.push([q[0], q[1], h[0], q[3]]); if (h[2] < q[2]) nx.push([h[2], q[1], q[2], q[3]]); const za = Math.max(q[1], h[1]), zb = Math.min(q[3], h[3]); const xa = Math.max(q[0], h[0]), xb = Math.min(q[2], h[2]); if (h[1] > q[1]) nx.push([xa, q[1], xb, h[1]]); if (h[3] < q[3]) nx.push([xa, h[3], xb, q[3]]); void za; void zb; } rs = nx; } return rs; };
    for (let x = 0; x < BXO - 0.01; x += 6) for (let z = 0; z < D - 0.01; z += 6) {
      const x1 = Math.min(BXO, x + 6), z1 = Math.min(D, z + 6), k = hsh(x, z, 1), dk = z >= 72 ? 0.78 : 1, tt = [(0.4 + k * 0.1) * dk, (0.39 + k * 0.09) * dk, (0.37 + k * 0.08) * dk];
      for (const q of cut([x, z, x1, z1])) vb('pconc', q[0], -0.3, q[1], q[2], 0, q[3], { uv: 4, grad: false, tint: tt, skip: { bottom: true, px: true, nx: true, pz: true, nz: true }, uo: k * 3.1, vo: k * 1.7 });
    }
    // (the saw cuts between the pours, sealed with black)
    for (let x = 6; x < BXO; x += 6) vb('prub', x - 0.008, 0, 0, x + 0.008, 0.002, D, { uv: 1, grad: false, skip: { bottom: true, px: true, nx: true, pz: true, nz: true } });
    for (let z = 6; z < D; z += 6) vb('prub', 0, 0, z - 0.008, BXO, 0.002, z + 0.008, { uv: 1, grad: false, skip: { bottom: true, px: true, nx: true, pz: true, nz: true } });
    // the trenches: concrete sides, dark at the bottom, pipes and cables lying in them; a grating over each in lengths with a frame
    for (const [x0, z0, x1, z1] of TR) {
      const ax = x1 - x0 > z1 - z0;
      vb('dark', x0, -0.7, z0, x1, -0.68, z1, { uv: 1, grad: false });
      if (ax) { vb('pconc', x0, -0.7, z0 - 0.15, x1, 0, z0, { uv: 2, tint: [0.5, 0.48, 0.45] }); vb('pconc', x0, -0.7, z1, x1, 0, z1 + 0.15, { uv: 2, tint: [0.5, 0.48, 0.45] }); }
      else { vb('pconc', x0 - 0.15, -0.7, z0, x0, 0, z1, { uv: 2, tint: [0.5, 0.48, 0.45] }); vb('pconc', x1, -0.7, z0, x1 + 0.15, 0, z1, { uv: 2, tint: [0.5, 0.48, 0.45] }); }
      const n = 3; for (let i = 0; i < n; i++) { const o = (i + 0.5) / n; if (ax) rod(i ? 'prub' : 'prust', x0, -0.55 + i * 0.05, z0 + (z1 - z0) * o, x1, -0.55 + i * 0.05, z0 + (z1 - z0) * o, 0.06 + i * 0.01, 8); else rod(i ? 'prub' : 'prust', x0 + (x1 - x0) * o, -0.55 + i * 0.05, z0, x0 + (x1 - x0) * o, -0.55 + i * 0.05, z1, 0.06 + i * 0.01, 8); }
      const L = ax ? x1 - x0 : z1 - z0;
      for (let u = 0; u < L - 0.1; u += 1.5) {
        const a = (ax ? x0 : z0) + u, b = Math.min(ax ? x1 : z1, a + 1.5) - 0.02;
        if (hsh(a, x0 + z0, 4) < (z0 > 86 ? 0.25 : 0.07)) continue;   // (one lifted and gone)
        if (ax) { vb('pgrate', a, -0.03, z0, b, 0.004, z1, { uv: 1, grad: false, skip: { px: true, nx: true, pz: true, nz: true } }); vb('prust', a - 0.02, -0.04, z0 - 0.04, a + 0.02, 0.006, z1 + 0.04, { uv: 1, grad: false }); }
        else { vb('pgrate', x0, -0.03, a, x1, 0.004, b, { uv: 1, grad: false, skip: { px: true, nx: true, pz: true, nz: true } }); vb('prust', x0 - 0.04, -0.04, a - 0.02, x1 + 0.04, 0.006, a + 0.02, { uv: 1, grad: false }); }
      }
      if (ax) { vb('prust', x0, -0.04, z0 - 0.05, x1, 0.006, z0, { uv: 1, grad: false }); vb('prust', x0, -0.04, z1, x1, 0.006, z1 + 0.05, { uv: 1, grad: false }); }
      else { vb('prust', x0 - 0.05, -0.04, z0, x0, 0.006, z1, { uv: 1, grad: false }); vb('prust', x1, -0.04, z0, x1 + 0.05, 0.006, z1, { uv: 1, grad: false }); }
    }
    // the walkway lines painted on the floor (yellow, worn away in places): along the aisles beside the tables
    const line = (x0, z0, x1, z1) => { const ax = x1 - x0 > z1 - z0, L = ax ? x1 - x0 : z1 - z0; for (let u = 0; u < L; u += 0.9) { if (hsh(x0 + u, z0 + u, 5) < 0.4) continue; const a = (ax ? x0 : z0) + u, b = Math.min(ax ? x1 : z1, a + 0.92); if (ax) vb('ppaint', a, 0, z0 - 0.05, b, 0.003, z0 + 0.05, { uv: 1, grad: false, tint: [0.62, 0.5, 0.16], skip: { bottom: true, px: true, nx: true, pz: true, nz: true } }); else vb('ppaint', x0 - 0.05, 0, a, x0 + 0.05, 0.003, b, { uv: 1, grad: false, tint: [0.62, 0.5, 0.16], skip: { bottom: true, px: true, nx: true, pz: true, nz: true } }); } };
    for (const x of [24.4, 33.6, 48.4, 57.6]) { line(x, 2, x, 43); line(x, 45, x, 88); }
    line(2, 13, 40, 13); line(42, 13, 64, 13); line(17.5, 78.5, 40, 78.5); line(42, 78.5, 64, 78.5);
    // the yard: gravel, the box you stand on; concrete paths along it
    col(BXO, -1, 0, W + 4, 0, D, { surf: 'stone' });
    for (let z = 0; z < D; z += 8) vb('pgrav', BXO, -0.3, z, W + 4, 0.02, Math.min(D + 4, z + 8), { uv: 1.6, grad: false, skip: { bottom: true }, tint: tint([0.85, 0.84, 0.8], 70, z, 6, 0.08) });
    vb('pconc', BXO, 0, 0, BXO + 1.4, 0.06, D, { uv: 3, tint: [0.7, 0.68, 0.64] });
    // the cable trench down the yard: concrete covers on it, one or two lifted off (dark under)
    for (let z = 3; z < D - 3; z += 1.2) { const h = hsh(81, z, 7); if (h < 0.08) { vb('dark', 80.6, -0.6, z, 81.6, -0.58, z + 1.18, { uv: 1, grad: false }); continue; } vb('pconc', 80.55, 0, z, 81.65, 0.07 + h * 0.02, z + 1.16, { uv: 1, tint: tint([0.62, 0.6, 0.57], 81, z, 8, 0.1) }); }
  }

  // ---------------------------------------------------------------- the hall's walls and roof
  function hallShell(S) {
    // the gates' stubs and frames, the way in (levelgen): their stone stands to 8 m, the brick goes on over it
    H.perimeter(w, rng, W, D, { gates: S.gates, h: 8, walls: false, beams: 0, stub: 1 });
    const gx = LG.gateXs(W, S.gates || 1);
    // north: z [-0.6, 0], to the building's east wall; cut for the gates in it
    brickWall(true, 0, -1, -0.6, BXO, 0.6, gx.filter((g) => g < BXO).map((g) => [g - 3.5, g + 3.5, -1, 8]), { dark: true, dado: true });
    // south: the way in
    brickWall(true, D, 1, -0.6, BXO, 0.6, [[W / 2 - 5.6, W / 2 + 5.6, -1, 8]], { dark: true, dado: true });
    // west: on the cave's rock (the switch room inside it below the mezzanine)
    brickWall(false, 0, -1, 0, D, 0.6, [], { dark: true });
    // east: the yard beyond it. The big door (a shutter half up), the breach, a door at the north, the two openings at the middle level
    // onto the transformers' platforms
    const EH = [[41, 47, -1, 6.2], [79.5, 84.5, -1, 5.2], [3.6, 5.6, -1, 2.4], [TRANS[0] + 2.9, TRANS[0] + 5.9, ML - 0.2, ML + 2.7], [TRANS[1] + 2.9, TRANS[1] + 5.9, ML - 0.2, ML + 2.7]];
    S.eastPil = brickWall(false, BX, 1, 0, D, 0.6, EH, { dado: true });
    // the shutter: its curtain of slats rolled up to 3.4 m, the drum's box over the opening, the guides
    for (let y = 3.4; y < 6.2; y += 0.09) gg('pcorr', boxG(), Mx(BX + 0.12, y + 0.045, 44, 0.05, 0.088, 6.1), { su: 6, sv: 0.1, tint: tint([0.75, 0.75, 0.72], y, 44, 2, 0.1) });
    vb('prust', BX + 0.05, 3.36, 40.95, BX + 0.2, 3.44, 47.05, { uv: 1 });
    vb('ppaint', BX - 0.55, 6.2, 40.6, BX, 7.0, 47.4, { uv: 1, tint: PAINT.grey });
    for (const z of [40.9, 47.1]) vb('prust', BX - 0.05, 0, z - 0.1, BX + 0.25, 6.2, z + 0.1, { uv: 1 });
    vb('prust', BX - 0.05, 0, 40.8, BX + 0.25, 6.3, 41, { uv: 1 }); vb('prust', BX - 0.05, 0, 47, BX + 0.25, 6.3, 47.2, { uv: 1 });
    col(BX, 3.38, 41, BXO, 6.2, 47);
    // the breach: brick tumbled out both ways, the wall's broken edge (rubble heaps you walk over at the sides; the middle clear)
    for (let i = 0; i < 14; i++) { const z = 79.5 + hsh(i, 1, 2) * 5, x = BX + (hsh(i, 2, 3) - 0.5) * 3.4, s = 0.25 + hsh(i, 3, 4) * 0.35; if (Math.abs(z - 82) < 1.3) continue; gg('wall', boxG(), Mx(x, s * 0.4, z, s * 1.3, s * 0.8, s, hsh(i, 4, 5), hsh(i, 5, 6) * 3, 0.3), { su: 0.5, sv: 0.3 }); }
    // (each side of the gap broken back in steps of whole bricks, wider toward the top; the top's edge hanging ragged)
    for (const [z0, sg] of [[79.5, 1], [84.5, -1]]) for (let k = 0; k < 18; k++) { const y = k * 0.3, st = Math.floor(hsh(k, z0, 3) * 2 + k * 0.08) * 0.24 + (k % 2) * 0.12; if (st < 0.05) continue; sb('wall', BX, y, Math.min(z0, z0 + sg * st), BXO, y + 0.3, Math.max(z0, z0 + sg * st), { uv: 2.5 }); }
    for (let z = 79.5; z < 84.4; z += 0.24) { const dy = (hsh(z * 10, 1, 4) * 0.5 + 0.2) * (1 - Math.abs(z - 82) / 3.2) + 0.05; sb('wall', BX, 5.2 - dy, z, BXO, 5.2, z + 0.24, { uv: 2.5 }); }
    // a steel door (the north door into the yard), standing open
    gg('ppaint', boxG(), Mx(BX + 0.9, 1.1, 3.6 - 0.02, 1.0, 2.2, 0.05, 0, 0.3, 0), { tint: PAINT.dkgreen, su: 1, sv: 2.2 });
    // the roof: corrugated sheet on purlins and trusses; the trusses on the pilasters, a span over the switch room's bay and one over the hall
    { const c = w.addCollider(-3, RY, -3, BXO + 0.6, RY + 1.6, D + 3, { surf: 'metal' }); c.vis = true; w.skyCap(-3, RY + 1.6, -3, BXO + 0.6, D + 3); }
    vb('pcorr', -0.6, RY + 0.25, -0.6, BXO + 0.3, RY + 0.3, D + 0.6, { uv: 1, grad: false, skip: { top: true }, tint: [0.42, 0.42, 0.42] });
    for (let x = 1.5; x < BXO; x += 3) mem('prust', chanG(0.22, 0.07, 0.008), x, RY + 0.11, -0.6, x, RY + 0.11, D + 0.6, 0, 1, 0, { su: 0.5, sv: D });
    for (let z = 6; z < D - 1; z += 6) { if (z % 12 === 6) truss(0, 16, z, RY - 1.6, RY); truss(16, BX, z, RY - 2.4, RY); }
    // the crane's columns down the west side (in the switch room's wall) and its runways on both sides, with the walks beside them
    for (let z = 3; z < D; z += 6) { mem('prust', hsecG(0.5, 0.4, 0.016, 0.024), 15.95, 0, z, 15.95, RY, z, 1, 0, 0, { su: 1, sv: RY }); col(15.7, 0, z - 0.22, 16.2, RY, z + 0.22); }
    for (const [x, sx] of [[16.6, 1], [64.9, -1]]) {
      mem('prust', hsecG(0.9, 0.4, 0.016, 0.03), x, UL - 0.55, 0.2, x, UL - 0.55, D - 0.2, 0, 1, 0, { su: 1, sv: D });
      vb('pcast', x - 0.04, UL - 0.1, 0.2, x + 0.04, UL + 0.04, D - 0.2, { uv: 2 });
      col(x - 0.22, UL - 1.0, 0.2, x + 0.22, UL + 0.04, D - 0.2);
      for (let z = 3; z < D; z += 6) { const xc = sx > 0 ? 16.2 : 65.4; vb('prust', Math.min(xc, x) - 0.05, UL - 1.6, z - 0.2, Math.max(xc, x) + 0.05, UL - 1.0, z + 0.2, { uv: 1 }); }
      void sx;
    }
    // the runway walks (open grating, a rail on their open side) and their ladders up from the middle level
    // (the rails: on the open side but where the ladders come up and the crane's walk joins; on the girder's side but at the crane's walk)
    const zc = S.zc, LZW = [24, 66], LZE = [14, 58], gap = (zs) => zs.map((z) => [z - 0.6, z + 0.6]);
    grate(14.2, 0.6, 15.6, D - 0.6, UL); railRect(14.2, 0.6, 15.6, D - 0.6, UL, { W: gap(LZW), E: [[zc + 1.45, zc + 2.55]] });
    for (let z = 3; z < D; z += 6) { vb('prust', 14.2, UL - 0.6, z - 0.06, 15.95, UL - 0.2, z + 0.06, { uv: 1 }); rod('prust', 14.3, UL - 0.2, z, 15.9, UL - 2.0, z, 0.03, 6); }
    grate(63.6, 0.6, 64.6, D - 0.6, UL); railRect(63.6, 0.6, 64.6, D - 0.6, UL, { W: gap(LZE).concat([[zc + 1.45, zc + 2.55]]), E: [[0, D]] });
    for (let z = 3; z < D; z += 6) { vb('prust', 63.6, UL - 0.6, z - 0.06, 65.4, UL - 0.2, z + 0.06, { uv: 1 }); }
    for (const z of LZW) ladder(13.8, z, ML, UL, [1, 0], true);
    for (const z of LZE) ladder(62.95, z, ML, UL, [1, 0], true);
    // the bus ducts of the east row's generators, out through the wall to their transformers (three round ducts on hangers)
    // (out under the table's edge at 2.65 m, across the aisle on a rack, through the wall; in the yard each turns along the wall at its
    // own distance from it - the nearest one first - and rises into the transformer's throat)
    const DY = 2.65;
    for (const [zg, zt] of [[SETS[0][0] + GEN, TRANS[0]], [SETS[1][0] + GEN, TRANS[1]]]) {
      const sg = zt < zg ? -1 : 1;
      for (let k = -1; k <= 1; k++) {
        const z = zg + k * 0.85, xk = sg < 0 ? 67.35 + (k + 1) * 0.8 : 68.95 - (k + 1) * 0.8;
        pipe([[54.5, DY, z], [xk, DY, z], [xk, DY, zt - sg * 3.0], [xk, 3.65, zt - sg * 3.0], [xk, 3.65, zt - sg * 1.55]], 0.3, { mk: 'ppaint', tint: [0.36, 0.4, 0.37], seg: 12 });
        for (let zz = zg - sg * 2; sg < 0 ? zz > zt + 3.4 : zz < zt - 3.4; zz += sg * 3) { rod('prust', xk, 0, zz, xk, DY - 0.3, zz, 0.035, 6); vb('pconc', xk - 0.2, 0, zz - 0.2, xk + 0.2, 0.12, zz + 0.2, { uv: 1 }); }
      }
      for (let x = 58.5; x < BX - 0.5; x += 3) { for (const dz of [-1.3, 1.3]) hpost(x, zg + dz, 0, DY - 0.32, 0, 1, 0.14); vb('prust', x - 0.07, DY - 0.36, zg - 1.4, x + 0.07, DY - 0.3, zg + 1.4, { uv: 1 }); }
    }
    // and the west row's, into the switch room's wall
    for (const zg of [SETS[0][0] + GEN, SETS[1][0] + GEN]) {
      for (let k = -1; k <= 1; k++) pipe([[27.5, DY, zg + k * 0.85], [16.0, DY, zg + k * 0.85]], 0.3, { mk: 'ppaint', tint: [0.36, 0.4, 0.37], seg: 12 });
      for (const x of [18.5, 22]) { for (const dz of [-1.3, 1.3]) hpost(x, zg + dz, 0, DY - 0.32, 0, 1, 0.14); vb('prust', x - 0.07, DY - 0.36, zg - 1.4, x + 0.07, DY - 0.3, zg + 1.4, { uv: 1 }); }
    }
    vb('prust', BXO, RY + 0.2, -0.6, BXO + 0.35, RY + 0.65, D + 0.6, { uv: 1 });
  }
  // a roof truss across x0..x1 at z: top and bottom chords (angles back to back), posts and diagonals between them
  function truss(x0, x1, z, yb, yt) {
    const n = Math.max(3, Math.round((x1 - x0) / 2.1)), dx = (x1 - x0) / n;
    vb('prust', x0, yb - 0.1, z - 0.08, x1, yb + 0.1, z + 0.08, { uv: 1.5, grad: false });
    vb('prust', x0, yt - 0.22, z - 0.08, x1, yt - 0.02, z + 0.08, { uv: 1.5, grad: false });
    for (let i = 0; i <= n; i += 2) { const x = x0 + i * dx; gg('prust', boxG(), Mx(x, (yb + yt) / 2 - 0.06, z, 0.08, yt - yb - 0.12, 0.12)); }
    for (let i = 0; i < n; i++) { const xa = x0 + i * dx, xb = xa + dx, up = i < n / 2; gg('prust', boxG(), memM(up ? xa : xb, yb + 0.08, z, up ? xb : xa, yt - 0.2, z, 0, 0, 1, 0.07, 0.07), { su: 0.2, sv: 2 }); }
  }

  // ---------------------------------------------------------------- the cave round the yard: rock walls to the east, north and south, its roof
  function cave(S) {
    const rk = (x0, y0, z0, x1, y1, z1, flat) => w.solid('rock', x0, y0, z0, x1, y1, z1, { uv: 6, grad: false, flat: !!flat || y0 > 8 });
    // east: from the floor up in bands, each stood a little in or out
    for (let z = -3; z < D + 3; z += 6) for (let b = 0; b < 3; b++) { const y0 = b * 8.5 - (b ? 0 : 1), y1 = y0 + 8.5 + (b ? 0 : 1) + 0.6, k = hsh(z, b, 11); rk(W + (b === 0 ? 0.1 + k * 0.5 : -0.4 + k * 1.2), y0, z, W + 6, y1, z + 6); }
    // north beyond the third gate and over it, south behind the yard
    const gx = LG.gateXs(W, S.gates || 1).filter((g) => g > BXO);
    let a = BXO; for (const g of [...gx, W + 6]) { if (g - 3.5 > a) rk(a, 0, -3, g - 3.5, 26, 0, true); a = g + 3.5; }
    for (const g of gx) rk(g - 3.5, 8, -3, g + 3.5, 26, 0);
    for (let x = BXO; x < W + 6; x += 6) rk(x, -1, D + 0.2 + hsh(x, 1, 12) * 0.8, x + 6, 26, D + 4, true);
    // its roof: rock hanging in lumps, deeper in some places than others
    for (let x = BXO - 6; x < W + 6; x += 6) for (let z = -3; z < D + 3; z += 7) { const k = hsh(x, z, 13), y0 = 20 + k * 3.5 - (x < BXO ? -1.5 : 0); rk(x, y0, z, x + 6, 28, z + 7); }
    w.visual('rock', -3, 22.5, -3, BXO - 6, 28, D + 3, { uv: 6, grad: false, flat: true, tint: [0.6, 0.6, 0.6] });
    w.skyCap(BXO, 26, -3, W + 6, D + 4);
  }

  // ---------------------------------------------------------------- a turbine-generator set on its concrete table (HP end at z0)
  function tgSet(S, xc, Z0, Z1, row, set) {
    let z0 = Z0, z1 = Z1;
    const pt = (row + set) % 2 ? PAINT.mach2 : PAINT.mach, T = tint(pt, xc, z0, 21, 0.05), sy = ML + 1.55;
    // the table: its top slab on columns and beams (you walk under it), its edge's steel angle
    sb('pconc', xc - TH, 3.6, z0, xc + TH, ML, z1, { uv: 3, tint: [0.5, 0.48, 0.46] });
    vb('prust', xc - TH - 0.02, ML - 0.12, z0 - 0.02, xc + TH + 0.02, ML + 0.005, z0 + 0.03, { uv: 1 }); vb('prust', xc - TH - 0.02, ML - 0.12, z1 - 0.03, xc + TH + 0.02, ML + 0.005, z1 + 0.02, { uv: 1 });
    vb('prust', xc - TH - 0.02, ML - 0.12, z0, xc - TH + 0.03, ML + 0.005, z1, { uv: 1 }); vb('prust', xc + TH - 0.03, ML - 0.12, z0, xc + TH + 0.02, ML + 0.005, z1, { uv: 1 });
    const cz = [z0 + 0.7, z0 + 5.6, z0 + 10.5, z0 + 15.4, z1 - 0.7];
    for (const z of cz) { for (const sx of [-1, 1]) { const x = xc + sx * 3.35, ct = tint([0.5, 0.48, 0.45], x, z, 22, 0.06); tableCol(x, z, sx, ct, z === cz[0] ? -1 : z === cz[cz.length - 1] ? 1 : 0); mark(x - 0.6, z - 0.6, x + 0.6, z + 0.6); } sb('pconc', xc - 3.8, 3.0, z - 0.35, xc + 3.8, 3.6, z + 0.35, { uv: 2, tint: [0.48, 0.46, 0.43] }); }
    // (the slab's side: the formwork's line along it, a tray of cables hung from it with its brackets, pipes through it)
    for (const sx of [-1, 1]) { const xe = xc + sx * TH; vb('prub', xe - 0.006, 4.0, z0, xe + 0.006, 4.016, z1, { uv: 1, grad: false }); const xt = xe + sx * 0.28; vb('prust', xt - 0.2, 3.22, z0 + 0.6, xt + 0.2, 3.235, z1 - 0.6, { uv: 1, grad: false }); for (const e of [-0.2, 0.2]) vb('prust', xt + e - 0.012, 3.22, z0 + 0.6, xt + e + 0.012, 3.32, z1 - 0.6, { uv: 1, grad: false }); for (let k = 0; k < 4; k++) rod('prub', xt - 0.14 + k * 0.09, 3.27, z0 + 0.6, xt - 0.14 + k * 0.09, 3.27, z1 - 0.6, 0.03 + (k % 2) * 0.01, 6); for (let z = z0 + 1; z < z1 - 0.5; z += 2.2) vb('prust', Math.min(xe, xt + sx * 0.22), 3.2, z - 0.03, Math.max(xe, xt + sx * 0.22), 3.24, z + 0.03, { uv: 1 }); for (const z of [z0 + 4.3, z0 + 13.2]) { rod('prust', xe - sx * 0.3, 3.9, z, xe + sx * 0.32, 3.9, z, 0.09, 10); gg('pcast', cylG(12), rodM(xe + sx * 0.3, 3.9, z, xe + sx * 0.34, 3.9, z, 0.15)); } }
    for (const sx of [-1, 1]) sb('pconc', xc + sx * 3.35 - 0.4, 3.0, z0, xc + sx * 3.35 + 0.4, 3.6, z1, { uv: 2, tint: [0.48, 0.46, 0.43] });
    z0 = Z0 + 1; z1 = Z1 - 1;   // (the machine and what is under it stand a metre in from the table's ends: a walk round each end)
    // under the table: the condenser under the low-pressure turbine, its water boxes and pipes; oil pipes and drains; the rest open
    { const za = z0 + 6.4, zb = z0 + 11.6; sb('ppaint', xc - 2.3, 0, za, xc + 2.3, 2.9, zb, { uv: 1.5, tint: tint(PAINT.dkgreen, xc, za, 23, 0.06) }); mark(xc - 2.5, za - 1.3, xc + 2.5, zb + 1.3);
      for (let z = za + 0.4; z < zb; z += 0.6) for (const sx of [-1, 1]) vb('prust', xc + sx * 2.3 - 0.03, 0.1, z - 0.04, xc + sx * 2.3 + 0.03 * sx + (sx > 0 ? 0.04 : -0.04), 2.85, z + 0.04, { uv: 1 });
      for (const [z, sg] of [[za, -1], [zb, 1]]) {
        gg('ppaint', cylG(28), Mx(xc, 1.4, z + sg * 0.12, 1.36, 0.24, 1.36, Math.PI / 2, 0, 0), { tint: T, su: 3, sv: 0.3 });
        gg('ppaint', cylG(28), Mx(xc, 1.4, z + sg * 0.27, 1.45, 0.08, 1.45, Math.PI / 2, 0, 0), { tint: tint(T, z, 1, 2, 0.08), su: 3, sv: 0.1 });
        gg('ppaint', gk('wheadS', () => { const g = G.GFX.Geo.lathe([[1.36, 0], [1.36, 0.14], [1.28, 0.3], [1.05, 0.48], [0.66, 0.6], [0.3, 0.65], [0.001, 0.66]], 28), P0 = g.attributes.position, N0 = g.attributes.normal; for (let i = 0; i < P0.count; i++) { const x = P0.getX(i), y = P0.getY(i), z = P0.getZ(i); if (y < 0.14) { const l = Math.hypot(x, z) || 1; N0.setXYZ(i, x / l, 0, z / l); continue; } const nx = x / 1.85, ny = (y - 0.08) / 0.34, nz = z / 1.85, l = Math.hypot(nx, ny, nz) || 1; N0.setXYZ(i, nx / l, ny / l, nz / l); } N0.needsUpdate = true; const U0 = g.attributes.uv; for (let i = 0; i < P0.count; i++) U0.setXY(i, P0.getX(i) * 0.6 + 0.5, P0.getZ(i) * 0.6 + 0.5 + (P0.getY(i) < 0.14 ? P0.getY(i) : 0)); U0.needsUpdate = true; return g; }), Mx(xc, 1.4, z + sg * 0.31, 1, 1, 1, sg * Math.PI / 2, 0, 0), { tint: T, su: 3, sv: 1 });
        for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; gg('pcast', cylG(6, true), Mx(xc + Math.cos(a) * 1.4, 1.4 + Math.sin(a) * 1.4, z + sg * 0.33, 0.026, 0.07, 0.026, Math.PI / 2, 0, 0)); }
        const mx = xc + 0.42, my = 1.65, mz = z + sg * 0.78; gg('ppaint', cylG(16), rodM(mx, my, z + sg * 0.6, mx, my, mz + sg * 0.12, 0.27), { tint: T }); gg('ppaint', cylG(16), rodM(mx, my, mz + sg * 0.12, mx, my, mz + sg * 0.2, 0.34), { tint: tint(T, 3, 3, 3, 0.1) }); for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; gg('pcast', cylG(6, true), rodM(mx + Math.cos(a) * 0.3, my + Math.sin(a) * 0.3, mz + sg * 0.2, mx + Math.cos(a) * 0.3, my + Math.sin(a) * 0.3, mz + sg * 0.25, 0.022)); }
        gg('ppaint', wheelG(0.12), Mx(mx, my, mz + sg * 0.27, 1, 1, 1), { tint: PAINT.dkgreen });
        col(xc - 1.45, 0.05, Math.min(z, z + sg * 0.95), xc + 1.45, 2.8, Math.max(z, z + sg * 0.95));
      }
      sign(xc + 2.33, 1.95, (za + zb) / 2 + 1.5, 1, 0, 0.3, 3); sign(xc - 2.33, 1.95, (za + zb) / 2 - 1.5, -1, 0, 0.3, 1);
      pipe([[xc - 0.6, 0.6, za - 0.6], [xc - 0.6, 0.6, z0 + 1.6], [xc - 0.6, -0.3, z0 + 1.6]], 0.35, { fl: 2.2 }); pipe([[xc + 0.6, 0.6, zb + 0.6], [xc + 0.6, 0.6, z1 - 2.4], [xc + 0.6, -0.3, z1 - 2.4]], 0.35, { fl: 2.2 }); col(xc - 0.98, 0, z0 + 1.2, xc - 0.22, 0.98, za - 0.95); col(xc + 0.22, 0, zb + 0.95, xc + 0.98, 0.98, z1 - 2.0);
      gg('pcast', cylG(16), Mx(xc + 2.31, 1.5, (za + zb) / 2, 0.38, 0.04, 0.38, 0, 0, Math.PI / 2)); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; gg('pcast', cylG(6, true), Mx(xc + 2.34, 1.5 + Math.cos(a) * 0.33, (za + zb) / 2 + Math.sin(a) * 0.33, 0.025, 0.04, 0.025, 0, 0, Math.PI / 2)); } }
    for (const sx of [-1, 1]) { rod('prust', xc + sx * 1.6, 2.4, z0 + 0.4, xc + sx * 1.6, 2.4, z1 - 0.4, 0.05, 8); rod('prust', xc + sx * 1.75, 2.25, z0 + 0.4, xc + sx * 1.75, 2.25, z1 - 0.4, 0.035, 8); for (let z = z0 + 2; z < z1; z += 3) rod('prust', xc + sx * 1.68, 2.25, z, xc + sx * 1.68, 3.0, z, 0.015, 5); }
    // ---- on the table: the front standard and governor, the HP turbine, the crossover, the LP turbine, the coupling, the generator, the exciter
    const zFS = z0 + 0.6, zHP = z0 + 2.1, zLP = z0 + 6.5, zCP = z0 + 11.5, zG = z0 + 12.3, zGE = z0 + 18.7, zEX = z0 + 18.9;
    // (the plates of the walks round the machine: chequer plate laid on the concrete)
    for (const sx of [-1, 1]) vb('pplate', xc + sx * 1.95, ML, Z0 + 0.15, xc + sx * (TH - 0.12), ML + 0.012, Z1 - 0.15, { uv: 1, grad: false });
    vb('pplate', xc - 1.95, ML, Z0 + 0.15, xc + 1.95, ML + 0.012, zFS - 0.05, { uv: 1, grad: false }); vb('pplate', xc - 1.95, ML, zEX + 1.55, xc + 1.95, ML + 0.012, Z1 - 0.15, { uv: 1, grad: false });
    // front standard: a pedestal box with its rounded top, the governor on it, a hand wheel, the trip gear's levers
    sb('ppaint', xc - 0.8, ML, zFS, xc + 0.8, ML + 1.4, zFS + 1.5, { uv: 1, tint: T });
    gg('ppaint', cylG(18), Mx(xc, ML + 1.4, zFS + 0.75, 0.8, 1.5, 0.8, Math.PI / 2, 0, 0), { tint: T, su: 2.5, sv: 1.5 });
    sb('ppaint', xc - 0.32, ML + 2.1, zFS + 0.4, xc + 0.32, ML + 2.65, zFS + 1.1, { uv: 1, tint: tint(T, 1, 2, 3, 0.1) });
    gg('ppaint', wheelG(0.22), Mx(xc + 0.86, ML + 0.9, zFS + 0.75, 1, 1, 1, 0, Math.PI / 2, 0), { tint: PAINT.red });
    gauge(xc - 0.81, ML + 1.05, zFS + 0.45, -1, 0, 0.11, 0); gauge(xc - 0.81, ML + 1.05, zFS + 1.05, -1, 0, 0.11, 3);
    // HP turbine: a turned casing about the shaft, its horizontal joint's flange and studs, the steam chests on top
    gg('ppaint', lathe('hp', [[0.001, 0], [0.8, 0], [0.95, 0.15], [1.18, 0.6], [1.3, 1.4], [1.34, 2.5], [1.3, 3.4], [1.12, 3.9], [0.9, 4.15], [0.001, 4.2]], 28), Mx(xc, sy, zHP + 0.05, 1, 1, 1, Math.PI / 2, 0, 0), { tint: T, su: 3, sv: 2 });
    vb('ppaint', xc - 1.55, sy - 0.12, zHP + 0.2, xc + 1.55, sy + 0.12, zHP + 4.0, { uv: 1, tint: tint(T, 2, 3, 4, 0.1) });
    for (let z = zHP + 0.4; z < zHP + 3.9; z += 0.28) for (const sx of [-1, 1]) { gg('pcast', cylG(6, true), Mx(xc + sx * 1.45, sy + 0.2, z, 0.032, 0.16, 0.032)); gg('pcast', cylG(6, true), Mx(xc + sx * 1.45, sy + 0.15, z, 0.055, 0.06, 0.055)); }
    vb('ppaint', xc - 1.1, ML, zHP + 0.3, xc + 1.1, sy - 0.9, zHP + 3.9, { uv: 1, tint: tint(T, 3, 4, 5, 0.12) });
    for (const dz of [1.0, 3.0]) { gg('ppaint', cylG(16), Mx(xc, sy + 1.4, zHP + dz, 0.34, 0.7, 0.34), { tint: T, su: 2, sv: 0.7 }); gg('pcast', cylG(16), Mx(xc, sy + 1.77, zHP + dz, 0.4, 0.06, 0.4)); }
    col(xc - 1.48, ML, zHP, xc + 1.48, sy + 1.36, zHP + 4.2);
    // main steam: from each chest up, out over the walk, down past the table's edge to the floor (lagged)
    for (const [dz, sx0] of [[1.0, -1], [3.0, 1]]) { const sx = row === 1 && set === 0 ? -sx0 : sx0; const z = zHP + dz, xo = xc + sx * (TH + 0.55); pipe([[xc, sy + 1.8, z], [xc, 8.7, z], [xo, 8.7, z], [xo, 0, z]], 0.24, { lag: true }); col(xo - 0.35, 0, z - 0.35, xo + 0.35, 3.4, z + 0.35); mark(xo - 0.5, z - 0.5, xo + 0.5, z + 0.5); valve(xo, 1.5, z, 0.3, sx, 0); }
    // the crossover: HP to LP over the top (lagged)
    pipe([[xc, sy + 1.3, zHP + 2.0], [xc, 8.35, zHP + 2.0], [xc, 8.35, zLP + 2.5], [xc, 7.8, zLP + 2.5]], 0.42, { lag: true });
    // LP turbine: the exhaust hood (a rounded box section), its joint flange, ribs down its sides, the relief diaphragms on top
    gg('ppaint', gk('lphood', () => { const s = new THREE.Shape(); s.moveTo(-2.2, 0); s.lineTo(-2.2, 2.0); s.absarc(-0.85, 2.0, 1.35, Math.PI, Math.PI / 2, true); s.lineTo(0.85, 3.35); s.absarc(0.85, 2.0, 1.35, Math.PI / 2, 0, true); s.lineTo(2.2, 0); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 5, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1, curveSegments: 8 }); g.translate(0, 0, -2.5); return g; }), Mx(xc, ML, zLP + 2.5, 1, 1, 1), { tint: T, su: 1, sv: 1 });
    vb('ppaint', xc - 2.42, sy - 0.12, zLP - 0.05, xc + 2.42, sy + 0.12, zLP + 5.05, { uv: 1, tint: tint(T, 4, 5, 6, 0.1) });
    for (let z = zLP + 0.35; z < zLP + 5; z += 0.32) for (const sx of [-1, 1]) { gg('pcast', cylG(6, true), Mx(xc + sx * 2.34, sy + 0.2, z, 0.032, 0.16, 0.032)); gg('pcast', cylG(6, true), Mx(xc + sx * 2.34, sy + 0.15, z, 0.055, 0.06, 0.055)); }
    for (let z = zLP + 0.5; z < zLP + 5; z += 0.7) for (const sx of [-1, 1]) vb('ppaint', xc + sx * 2.24 - 0.04, ML + 0.1, z - 0.04, xc + sx * 2.24 + 0.04, sy - 0.1, z + 0.04, { uv: 1, tint: T });
    for (const dz of [1.4, 3.6]) { gg('pcast', cylG(18), Mx(xc + 0.5, ML + 3.39, zLP + dz, 0.36, 0.08, 0.36)); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; gg('pcast', cylG(6, true), Mx(xc + 0.5 + Math.cos(a) * 0.31, ML + 3.44, zLP + dz + Math.sin(a) * 0.31, 0.02, 0.04, 0.02)); } }
    col(xc - 2.25, ML, zLP - 0.1, xc + 2.25, ML + 3.4, zLP + 5.05);
    // the coupling's guard and the turning gear's motor
    gg('ppaint', cylG(16), Mx(xc, sy, zCP + 0.4, 0.62, 0.8, 0.62, Math.PI / 2, 0, 0), { tint: PAINT.yellow, su: 2, sv: 0.8 });
    sb('ppaint', xc - 0.75, ML, zCP, xc + 0.75, sy - 0.5, zCP + 0.8, { uv: 1, tint: T });
    gg('ppaint', cylG(14), Mx(xc + 1.05, ML + 0.55, zCP + 0.4, 0.3, 0.7, 0.3, 0, 0, Math.PI / 2), { tint: PAINT.dkgreen, su: 2, sv: 0.7 });
    // the generator: the stator's frame (a cylinder ringed with its stiffeners), its feet, the end shields, the cooler on top, the lugs, the plate
    gg('ppaint', cylG(30), Mx(xc, sy + 0.05, zG + 3.2, 1.55, 6.0, 1.55, Math.PI / 2, 0, 0), { tint: tint(T, 9, 9, 9, 0.06), su: 6, sv: 4 });
    for (let k = 0; k <= 2; k++) gg('ppaint', gk('genband', () => new THREE.TorusGeometry(1.565, 0.04, 4, 26)), Mx(xc, sy + 0.05, zG + 0.9 + k * 2.3, 1, 1, 1), { tint: tint(T, k, 2, 3, 0.06), su: 6, sv: 0.1 });
    for (const a of [0.35, Math.PI - 0.35, -0.6, Math.PI + 0.6]) gg('ppaint', boxG(), Mx(xc + Math.cos(a) * 1.555, sy + 0.05 + Math.sin(a) * 1.555, zG + 3.2, 0.035, 0.035, 5.9, 0, 0, a), { tint: T });
    for (const sx of [-1, 1]) for (const dz of [1.6, 4.8]) { const cx = xc + sx * 1.505, cy = sy - 0.4; gg('ppaint', boxG(), Mx(cx, cy, zG + dz, 0.05, 0.5, 0.62, 0, 0, -sx * 0.26), { tint: tint(T, dz, sx, 4, 0.12) }); for (const [ey, ez] of [[-0.2, -0.26], [0.2, -0.26], [-0.2, 0.26], [0.2, 0.26]]) gg('pcast', cylG(6, true), rodM(cx + sx * 0.02 - Math.sin(sx * 0.3) * ey * -1, cy + ey * Math.cos(0.3), zG + dz + ez, cx + sx * 0.06, cy + ey * Math.cos(0.3), zG + dz + ez, 0.022)); }
    gauge(xc - 0.71, ML + 0.95, zGE + 0.05, -1, 0, 0.09, 1); gauge(xc + 0.71, ML + 0.95, zGE + 0.05, 1, 0, 0.09, 2);
    for (const [z, s] of [[zG + 0.2, -1], [zGE - 0.2, 1]]) gg('ppaint', lathe('shield', [[1.5, 0], [1.42, 0.12], [1.15, 0.3], [0.6, 0.42], [0.28, 0.46], [0.001, 0.46]], 24), Mx(xc, sy + 0.05, z, 1, 1, 1, s * Math.PI / 2, 0, 0), { tint: tint(T, 5, 5, 5, 0.1), su: 3, sv: 1 });
    for (const sx of [-1, 1]) { sb('ppaint', xc + sx * 1.35 - 0.3, ML, zG + 0.3, xc + sx * 1.35 + 0.3 + sx * 0.25, ML + 0.6, zGE - 0.3, { uv: 1, tint: tint(T, sx, 7, 8, 0.1) }); for (let z = zG + 0.6; z < zGE - 0.4; z += 0.9) gg('pcast', cylG(6, true), Mx(xc + sx * 1.75, ML + 0.66, z, 0.04, 0.1, 0.04)); }
    sb('ppaint', xc - 0.95, sy + 1.5, zG + 1.2, xc + 0.95, sy + 2.15, zGE - 1.2, { uv: 1, tint: tint(T, 6, 6, 6, 0.1) });
    for (let z = zG + 1.4; z < zGE - 1.3; z += 0.12) vb('prust', xc - 0.96, sy + 1.62, z, xc + 0.96, sy + 2.0, z + 0.04, { uv: 1, grad: false });
    for (const dz of [1.0, 5.4]) for (const sx of [-1, 1]) gg('ppaint', boxG(), Mx(xc + sx * 1.05, sy + 1.25, zG + dz, 0.08, 0.35, 0.3, 0, 0, sx * 0.6), { tint: T });
    sign(xc + 1.62, sy - 0.3, zG + 3.2, 1, 0, 0.28, set ? 3 : 2); sign(xc - 1.62, sy - 0.3, zG + 3.2, -1, 0, 0.28, set ? 3 : 2);
    col(xc - 1.95, ML, zCP, xc + 1.95, sy + 2.15, zGE);
    // the exciter at the far end, its louvred housing, the outboard bearing
    gg('ppaint', cylG(18), Mx(xc, sy - 0.1, zEX + 0.7, 0.72, 1.4, 0.72, Math.PI / 2, 0, 0), { tint: tint(PAINT.dkgreen, 3, 3, 3, 0.1), su: 2, sv: 1.4 });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 9) vb('prust', xc + Math.cos(a) * 0.73 - 0.02, sy - 0.1 + Math.sin(a) * 0.73 - 0.02, zEX + 0.2, xc + Math.cos(a) * 0.73 + 0.02, sy - 0.1 + Math.sin(a) * 0.73 + 0.02, zEX + 1.2, { uv: 1, grad: false });
    sb('ppaint', xc - 0.65, ML, zEX - 0.15, xc + 0.65, sy - 0.5, zEX + 1.5, { uv: 1, tint: T });
    col(xc - 0.75, ML, zEX - 0.2, xc + 0.75, sy + 0.65, zEX + 1.5);
    // the bearings between the parts, the shaft showing between them; the oil pipes along the machine's foot
    for (const z of [zHP - 0.05, zLP - 0.15, zCP - 0.1, zGE, zEX + 1.45]) { vb('ppaint', xc - 0.7, ML, z - 0.18, xc + 0.7, sy - 0.25, z + 0.18, { uv: 1, tint: tint(T, z, 1, 1, 0.08) }); gg('ppaint', cylG(14), Mx(xc, sy - 0.25, z, 0.48, 0.36, 0.48, Math.PI / 2, 0, 0), { tint: T }); }
    rod('iron', xc, sy, zFS + 1.5, xc, sy, zEX + 1.5, 0.22, 12);
    for (const sx of [-1, 1]) { rod('pcopper', xc + sx * 1.9, ML + 0.18, zFS + 0.3, xc + sx * 1.9, ML + 0.18, zEX + 1.2, 0.03, 6); rod('prust', xc + sx * 1.86, ML + 0.32, zFS + 0.3, xc + sx * 1.86, ML + 0.32, zEX + 1.2, 0.04, 6); for (let z = zFS + 0.8; z < zEX + 1; z += 1.8) vb('prust', xc + sx * 1.82 - 0.05, ML, z - 0.03, xc + sx * 1.82 + 0.1 * sx, ML + 0.36, z + 0.03, { uv: 1 }); }
    // a gauge board on the walk at the HP end, a tool chest, oil drums at the far end
    { const gx = xc + 3.2, gz = z0 + 1.6; for (const dz of [-0.35, 0.35]) rod('prust', gx, ML, gz + dz, gx, ML + 1.75, gz + dz, 0.025, 6); vb('ppaint', gx - 0.02, ML + 0.9, gz - 0.45, gx + 0.02, ML + 1.7, gz + 0.45, { uv: 1, tint: PAINT.board }); for (let k = 0; k < 4; k++) gauge(gx - 0.03, ML + 1.12 + (k > 1 ? 0.34 : 0), gz + (k % 2 ? 0.2 : -0.2), -1, 0, 0.12, k); col(gx - 0.08, ML, gz - 0.45, gx + 0.08, ML + 1.75, gz + 0.45); }
    // the rails round the table (open where the bridges and stairs meet it: middle())
    S.tables = S.tables || []; S.tables.push({ x0: xc - TH, z0: Z0, x1: xc + TH, z1: Z1, row, set });
  }

  // a column of a table: chamfered, the formwork's lines round it, a plate cast in it, the haunches into the beams over it (in, and
  // along the table - endz: -1 / 1 at the table's ends: none on the outer side)
  function tableCol(x, z, sx, ct, endz) {
    gg('pconc', gk('tcol', () => { const c = 0.45, k = 0.06; const g = extr([[-c + k, -c], [c - k, -c], [c, -c + k], [c, c - k], [c - k, c], [-c + k, c], [-c, c - k], [-c, -c + k]], 1); g.rotateX(-Math.PI / 2); g.translate(0, 0.5, 0); return g; }), Mx(x, 0, z, 1, 3.0, 1), { tint: ct, su: 1, sv: 3 });
    col(x - 0.45, 0, z - 0.45, x + 0.45, 3.0, z + 0.45, { surf: 'stone' });
    for (const y of [1.05, 2.1]) vb('pconc', x - 0.455, y, z - 0.455, x + 0.455, y + 0.014, z + 0.455, { uv: 1, grad: false, tint: [ct[0] * 0.62, ct[1] * 0.62, ct[2] * 0.62], skip: { top: true, bottom: true } });
    vb('prust', x + sx * 0.452, 2.3, z - 0.15, x + sx * 0.462, 2.6, z + 0.15, { uv: 1, grad: false });
    const H = gk('haunch', () => extr([[0, 0], [1, 0], [0, -1]], 1));
    gg('pconc', H, Mx(x - sx * 0.45, 3.0, z, 0.42, 0.42, 0.7, 0, sx > 0 ? Math.PI : 0, 0), { tint: ct, su: 1, sv: 1 });
    for (const dz of [-1, 1]) if (dz !== endz) gg('pconc', H, Mx(x, 3.0, z + dz * 0.45, 0.42, 0.42, 0.8, 0, dz > 0 ? -Math.PI / 2 : Math.PI / 2, 0), { tint: ct, su: 1, sv: 1 });
  }

  // ---------------------------------------------------------------- the middle level: galleries, bridges, the tables' rails, the stairs
  function middle(S) {
    const ov = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;
    // what joins each walk where (for the gaps in its rails): every walk and table as a rect; two touching rects open the stretch they share
    const rects = [['NG', ...NG], ['EG', ...EG], ['SG', ...SG], ...BRIDGES.map((b, i) => ['B' + i, ...b]), ...S.tables.map((t, i) => ['T' + i, t.x0, t.z0, t.x1, t.z1]), ['MZ', 0, 12, 16, 84]];
    // (the floors at the middle level the stairs reach, and the transformer platforms through the east wall)
    const plats = [['P0', BX, TRANS[0] + 2.9, 79, TRANS[0] + 5.9], ['P1', BX, TRANS[1] + 2.9, 79, TRANS[1] + 5.9], ['L2', 60.3, 40, 62.5, 42.2], ['L7', 0.6, 84, 3.0, 86.2]];
    rects.push(...plats);
    // the stairs: [side, e, c, wd, the rect of their top]
    const stairs = [['S', 76.5, 34.1, 1.8], ['S', 42.2, 61.4, 1.8], ['S', 39, 27.1, 1.8], ['N', 49, 54.9, 1.8], ['N', 12, 1.5, 1.8], ['E', 3.0, 85.1, 1.8], ['N', TRANS[0] + 2.9, 78.1, 1.8], ['S', TRANS[1] + 5.9, 78.1, 1.8]];
    const opens = {};
    const addOpen = (id, side, a, b) => { (opens[id] = opens[id] || {}); (opens[id][side] = opens[id][side] || []).push([a, b]); };
    for (let i = 0; i < rects.length; i++) for (let j = 0; j < rects.length; j++) {
      if (i === j) continue; const [ia, ax0, az0, ax1, az1] = rects[i], [, bx0, bz0, bx1, bz1] = rects[j];
      if (Math.abs(az0 - bz1) < 0.05 && ov(ax0, ax1, bx0, bx1)) addOpen(ia, 'N', Math.max(ax0, bx0), Math.min(ax1, bx1));
      if (Math.abs(az1 - bz0) < 0.05 && ov(ax0, ax1, bx0, bx1)) addOpen(ia, 'S', Math.max(ax0, bx0), Math.min(ax1, bx1));
      if (Math.abs(ax0 - bx1) < 0.05 && ov(az0, az1, bz0, bz1)) addOpen(ia, 'W', Math.max(az0, bz0), Math.min(az1, bz1));
      if (Math.abs(ax1 - bx0) < 0.05 && ov(az0, az1, bz0, bz1)) addOpen(ia, 'E', Math.max(az0, bz0), Math.min(az1, bz1));
      // (a walk that runs on into another: overlapping, the shared edge stretch is open both ways)
      if (ov(ax0, ax1, bx0, bx1) && ov(az0, az1, bz0, bz1)) { if (bz0 < az0 + 0.05 && bz1 > az0) addOpen(ia, 'N', Math.max(ax0, bx0), Math.min(ax1, bx1)); if (bz1 > az1 - 0.05 && bz0 < az1) addOpen(ia, 'S', Math.max(ax0, bx0), Math.min(ax1, bx1)); if (bx0 < ax0 + 0.05 && bx1 > ax0) addOpen(ia, 'W', Math.max(az0, bz0), Math.min(az1, bz1)); if (bx1 > ax1 - 0.05 && bx0 < ax1) addOpen(ia, 'E', Math.max(az0, bz0), Math.min(az1, bz1)); }
    }
    for (const [side, e, c, wd] of stairs) { const id = rects.find((r) => (side === 'N' ? Math.abs(r[2] - e) < 0.05 && r[1] < c && r[3] > c : side === 'S' ? Math.abs(r[4] - e) < 0.05 && r[1] < c && r[3] > c : side === 'E' ? Math.abs(r[3] - e) < 0.05 && r[2] < c && r[4] > c : Math.abs(r[1] - e) < 0.05 && r[2] < c && r[4] > c)); if (id) addOpen(id[0], side === 'N' ? 'N' : side === 'S' ? 'S' : side === 'E' ? 'E' : 'W', c - wd / 2 - 0.05, c + wd / 2 + 0.05); }
    // (the walls: the east gallery and the platforms run against the hall's east wall; the north gallery's west end against the stair's rail)
    addOpen('EG', 'E', 0, D); addOpen('P0', 'W', 0, D); addOpen('P1', 'W', 0, D);
    S.opens = opens;
    // the galleries and bridges (grating), hung from the roof (the north one) or on posts (the south one), on brackets off the wall (the east one)
    for (const [id, x0, z0, x1, z1] of rects) {
      if (id[0] === 'T' || id === 'MZ') continue;
      grate(x0, z0, x1, z1, ML);
      railRect(x0, z0, x1, z1, ML, opens[id]);
    }
    for (let x = NG[0] + 1.5; x < NG[2]; x += 4.5) for (const z of [NG[1] + 0.1, NG[3] - 0.1]) rod('prust', x, ML - 0.2, z, x, RY - 0.4, z, 0.022, 6);
    for (let z = EG[1] + 1; z < EG[3]; z += 3) { vb('prust', EG[0] + 0.2, ML - 0.95, z - 0.05, BX, ML - 0.2, z + 0.05, { uv: 1 }); gg('prust', boxG(), memM(EG[0] + 0.6, ML - 0.25, z, BX, ML - 1.5, z, 0, 0, 1, 0.07, 0.07), { su: 0.2, sv: 1.5 }); }
    for (let x = SG[0] + 3; x < SG[2]; x += 6) if (x < 33 || x > 36) for (const z of [SG[1] + 0.15, SG[3] - 0.15]) hpost(x, z, 0, ML - 0.2, 0, 1, 0.18);
    for (const b of BRIDGES) { const ax = b[2] - b[0] > b[3] - b[1], L = ax ? b[2] - b[0] : b[3] - b[1]; if (L < 8) continue; const m = ax ? (b[0] + b[2]) / 2 : (b[1] + b[3]) / 2; if (ax && Math.abs(m - 41) < 1) for (const z of [b[1] + 0.1, b[3] - 0.1]) rod('prust', m - 3, ML - 0.2, z, m - 3, RY - 0.4, z, 0.022, 6); }
    for (const [, x0, z0, x1, z1] of plats.slice(0, 2)) for (const x of [70, 74.5, 78.8]) for (const z of [z0 + 0.15, z1 - 0.15]) hpost(x, z, 0, ML - 0.2, 1, 0, 0.2);
    // the tables' rails
    S.tables.forEach((t, i) => railRect(t.x0, t.z0, t.x1, t.z1, ML, opens['T' + i]));
    // the stairs
    for (const [side, e, c, wd] of stairs) steelStair(side, e, c, wd, 0, ML);
    // (the stair from the east gallery comes down off a landing)
  }

  // ---------------------------------------------------------------- the overhead crane: its bridge over the hall, the trolley, the hook and what hangs on it
  function crane(S) {
    const zc = S.zc, x0 = 16.6, x1 = 64.9, yT = 13.0;
    for (const dz of [-1, 1]) { mem('ppaint', hsecG(1.4, 0.7, 0.02, 0.03), x0 + 0.6, yT - 0.7, zc + dz * 1.0, x1 - 0.6, yT - 0.7, zc + dz * 1.0, 0, 1, 0, { tint: PAINT.yellow, su: 1, sv: 20 }); }
    for (const x of [x0, x1]) { sb('ppaint', x - 0.35, UL + 0.05, zc - 1.6, x + 0.35, UL + 1.15, zc + 1.4, { uv: 1, tint: tint(PAINT.yellow, x, zc, 2, 0.1) }); for (const dz of [-1.2, 1.0]) gg('pcast', cylG(14), Mx(x, UL + 0.25, zc + dz, 0.3, 0.2, 0.3, 0, 0, Math.PI / 2)); }
    col(x0 + 0.5, yT - 1.4, zc - 1.4, x1 - 0.5, yT, zc + 1.4);
    // its walk along the south girder (from the runway walks over the rail on a plate), rails both sides
    grate(15.6, zc + 1.45, 63.6, zc + 2.55, UL); railRect(15.6, zc + 1.45, 63.6, zc + 2.55, UL, { N: [[0, 99]], W: [[0, 99]], E: [[0, 99]] });
    for (let x = 18; x < 63; x += 3) vb('prust', x - 0.04, UL - 0.18, zc + 1.4, x + 0.04, UL, zc + 1.45, { uv: 1 });
    // the cab hanging under the bridge at the west end
    sb('ppaint', 19.2, UL - 2.5, zc - 1.0, 21.4, UL - 0.6, zc + 1.0, { uv: 1, tint: tint(PAINT.yellow, 1, 1, 1, 0.1) });
    for (const dz of [-0.95, 0.95]) vb('pglass', 19.5, UL - 1.7, zc + dz - 0.02, 21.1, UL - 0.9, zc + dz + 0.02, { uv: 1 });
    // the trolley on the girders: frame, the hoist's drum and motor, the ropes, the hook block and its hook
    const tx = S.tx;
    sb('ppaint', tx - 1.3, yT, zc - 1.6, tx + 1.3, yT + 0.9, zc + 1.6, { uv: 1, tint: tint(PAINT.yellow, tx, zc, 3, 0.12) });
    gg('prust', cylG(18), Mx(tx, yT + 0.95, zc, 0.48, 2.4, 0.48, 0, 0, Math.PI / 2), { su: 3, sv: 2 });
    gg('ppaint', cylG(14), Mx(tx + 0.4, yT + 0.95, zc + 1.3, 0.35, 0.8, 0.35, Math.PI / 2, 0, 0), { tint: PAINT.dkgreen });
    const hy = { rotor: 8.4, crate: 8.6, coil: 8.3 }[S.load];
    for (const dx of [-0.35, -0.12, 0.12, 0.35]) rod('prust', tx + dx, yT - 0.1, zc, tx + dx * 0.7, hy + 0.55, zc, 0.018, 5);
    sb('ppaint', tx - 0.42, hy, zc - 0.25, tx + 0.42, hy + 0.65, zc + 0.25, { uv: 1, tint: PAINT.yellow });
    gg('pcast', gk('hook', () => new THREE.TorusGeometry(0.22, 0.06, 8, 16, Math.PI * 1.4)), Mx(tx, hy - 0.3, zc, 1, 1, 1, 0, 0, -0.6));
    // the load: a generator's rotor in slings, a crate, a coil of cable on its drum
    if (S.load === 'rotor') {
      const ly = 7.1; for (const dx of [-1.6, 1.6]) { rod('prust', tx, hy - 0.4, zc, tx + dx, ly + 0.55, zc, 0.025, 5); }
      gg('pcast', cylG(24), Mx(tx, ly, zc, 0.55, 6.4, 0.55, 0, 0, Math.PI / 2), { su: 3, sv: 6 });
      for (let k = -2; k <= 2; k++) gg('pcopper', cylG(24, true), Mx(tx + k * 0.9, ly, zc, 0.57, 0.5, 0.57, 0, 0, Math.PI / 2));
      rod('iron', tx - 4.2, ly, zc, tx + 4.2, ly, zc, 0.2, 10);
      col(tx - 4.2, ly - 0.58, zc - 0.58, tx + 4.2, ly + 0.58, zc + 0.58);
    } else if (S.load === 'crate') {
      const ly = 6.4; for (const dx of [-1.1, 1.1]) for (const dz of [-0.8, 0.8]) rod('prust', tx, hy - 0.4, zc, tx + dx, ly + 1.6, zc + dz, 0.02, 5);
      sb('woodDark', tx - 1.2, ly, zc - 0.9, tx + 1.2, ly + 1.6, zc + 0.9, { uv: 1 });
      for (const y of [ly + 0.1, ly + 1.45]) vb('wood', tx - 1.25, y, zc - 0.95, tx + 1.25, y + 0.12, zc + 0.95, { uv: 1 });
      sign(tx, ly + 0.8, zc + 0.91, 0, 1, 0.5, 1);
    } else {
      const ly = 6.7; for (const dz of [-0.9, 0.9]) rod('prust', tx, hy - 0.4, zc, tx, ly + 1.1, zc + dz, 0.025, 5);
      gg('woodDark', cylG(20), Mx(tx, ly, zc, 1.15, 0.12, 1.15, Math.PI / 2, 0, 0)); gg('woodDark', cylG(20), Mx(tx, ly, zc + 1.0, 1.15, 0.12, 1.15, Math.PI / 2, 0, 0)); gg('woodDark', cylG(20), Mx(tx, ly, zc - 1.0, 1.15, 0.12, 1.15, Math.PI / 2, 0, 0));
      gg('prub', cylG(20), Mx(tx, ly, zc, 0.85, 1.9, 0.85, Math.PI / 2, 0, 0), { su: 8, sv: 2 });
      col(tx - 1.15, ly - 1.15, zc - 1.0, tx + 1.15, ly + 1.15, zc + 1.0);
    }
  }

  // ---------------------------------------------------------------- the switch room under the mezzanine
  function switchRoom(S) {
    const { x0, x1, z0, z1 } = SR;
    // its walls: the hall side (painted block, doors in it), the north and south ends; the ceiling is the mezzanine's slab
    const doorsE = [[19, 21], [35, 37], [59, 61], [75.5, 77.5]];
    let a = z0 - 0.3;
    for (const [d0, d1] of [...doorsE, [z1 + 0.3, z1 + 0.3]]) { if (d0 > a) sb('pconc', x1, 0, a, x1 + 0.3, 4.1, d0, { uv: 2.5, tint: [0.66, 0.64, 0.6] }); if (d1 > d0) { sb('pconc', x1, 2.55, d0, x1 + 0.3, 4.1, d1, { uv: 2, tint: [0.66, 0.64, 0.6] }); vb('prust', x1 - 0.04, 0, d0 - 0.06, x1 + 0.34, 2.6, d0, { uv: 1 }); vb('prust', x1 - 0.04, 0, d1, x1 + 0.34, 2.6, d1 + 0.06, { uv: 1 }); vb('prust', x1 - 0.04, 2.55, d0, x1 + 0.34, 2.61, d1, { uv: 1 }); } a = d1; }
    // (the doors themselves: steel leaves standing open into the room, one gone)
    doorsE.forEach(([d0, d1], i) => { if (i === 2) return; gg('ppaint', boxG(), Mx(x1 - 0.5, 1.25, d0 + 0.05, 1.0, 2.45, 0.05, 0, -0.4 - i * 0.25, 0), { tint: tint(PAINT.green, i, 1, 2, 0.1), su: 1, sv: 2.4 }); sign(x1 + 0.31, 1.75, (d0 + d1) / 2 + 1.4, 1, 0, 0.32, 0); });
    sb('pconc', x0, 0, z0 - 0.3, 10, 4.1, z0, { uv: 2.5, tint: [0.66, 0.64, 0.6] }); sb('pconc', 12, 0, z0 - 0.3, x1 + 0.3, 4.1, z0, { uv: 2.5, tint: [0.66, 0.64, 0.6] }); sb('pconc', 10, 2.55, z0 - 0.3, 12, 4.1, z0, { uv: 2, tint: [0.66, 0.64, 0.6] });
    sb('pconc', x0, 0, z1, 13.5, 4.1, z1 + 0.3, { uv: 2.5, tint: [0.66, 0.64, 0.6] }); sb('pconc', 15.5, 0, z1, x1 + 0.3, 4.1, z1 + 0.3, { uv: 2.5, tint: [0.66, 0.64, 0.6] }); sb('pconc', 13.5, 2.55, z1, 15.5, 4.1, z1 + 0.3, { uv: 2, tint: [0.66, 0.64, 0.6] });
    // the walls' paint inside: a green dado, cream above (on the west wall's brick and the block)
    for (const [ax, az, bx, bz] of [[0.0, z0, 0.012, z1], [x1 - 0.012, z0, x1, z1]]) { vb('ppaint', ax, 0, az, bx, 1.4, bz, { uv: 2, grad: false, tint: PAINT.green }); vb('ppaint', ax, 1.4, az, bx, 4.1, bz, { uv: 2, grad: false, tint: PAINT.cream }); }
    // the slab over it (the mezzanine's floor), the stair's opening through it; its beams under
    const hole = [0.35, 40, 2.35, 49];
    sb('pconc', 0, 4.1, 12, 16, ML, hole[1], { uv: 3, tint: [0.74, 0.72, 0.68] }); sb('pconc', 0, 4.1, hole[3], 16, ML, 84, { uv: 3, tint: [0.74, 0.72, 0.68] }); sb('pconc', hole[2], 4.1, hole[1], 16, ML, hole[3], { uv: 3, tint: [0.74, 0.72, 0.68] }); sb('pconc', 0, 4.1, hole[1], hole[0], ML, hole[3], { uv: 3, tint: [0.74, 0.72, 0.68] });
    for (let z = z0 + 3; z < z1; z += 3) if (z < hole[1] - 0.3 || z > hole[3] + 0.3) vb('pconc', x0, 3.75, z - 0.2, x1, 4.1, z + 0.2, { uv: 2, tint: [0.62, 0.6, 0.57] });
    steelStair('N', hole[3], 1.35, 1.8, 0, ML, { noRail: -1 });
    // the floor: painted oxide red, worn grey along the aisles
    vb('pconc', x0 + 0.02, 0, z0, x1, 0.004, z1, { uv: 3, grad: false, tint: [0.62, 0.38, 0.32] });
    // the rows of switchboards: back to back in two rows, the wall's own along the west wall and between the doors on the east
    const R1 = [3.4, 5.0], R2 = [7.0, 8.6];
    const seg1 = [[14.5, 25], [27, 37.5], [40, 52], [54.5, 66], [68, 81.5]], seg2 = [[14.5, 20], [22, 33.5], [36, 47.5], [50, 61], [63.5, 73], [75, 81.5]];
    for (const [za, zb] of seg1) boardRow(R1[0], R1[1], za, zb, ['W', 'E']);
    for (const [za, zb] of seg2) boardRow(R2[0], R2[1], za, zb, ['W', 'E']);
    for (const [za, zb] of [[14, 39.4], [49.6, 82.5]]) boardRow(0.12, 0.72, za, zb, ['E']);
    for (const [za, zb] of [[13.5, 18.4], [21.6, 34.4], [37.6, 46], [49.5, 58.4], [61.6, 75], [78, 83]]) boardRow(x1 - 0.62, x1 - 0.02, za, zb, ['W']);
    // rubber mats along the fronts of the boards
    for (const [xa, xb] of [[0.7, 1.6], [2.4, 3.3], [5.1, 6.0], [6.1, 6.9], [8.7, 9.6]]) for (const [za, zb] of [[14, 39], [50, 82]]) vb('prub', xa, 0.004, za, xb, 0.016, zb, { uv: 1, grad: false });
    // cable trays under the ceiling over the aisles, the cables in them; the tube lights
    for (const x of [2.2, 6.0, 10.2, 13.4]) { for (const sx of [-0.3, 0.3]) vb('prust', x + sx - 0.015, 3.3, z0 + 0.5, x + sx + 0.015, 3.42, z1 - 0.5, { uv: 1 }); vb('prust', x - 0.31, 3.3, z0 + 0.5, x + 0.31, 3.31, z1 - 0.5, { uv: 1 }); for (let k = 0; k < 4; k++) rod('prub', x - 0.2 + k * 0.13, 3.36, z0 + 0.5, x - 0.2 + k * 0.13, 3.36, z1 - 0.5, 0.03, 6); for (let z = z0 + 2; z < z1; z += 2.4) rod('prust', x, 3.42, z, x, 3.75, z, 0.012, 4); }
    for (let z = z0 + 5; z < z1 - 2; z += 7.5) for (const x of [4.2, 11.9]) { const on = hsh(x, z, 31) < 0.45; vb('ppaint', x - 0.12, 3.55, z - 0.7, x + 0.12, 3.65, z + 0.7, { uv: 1, tint: PAINT.cream }); if (on) { vb('glow', x - 0.04, 3.51, z - 0.62, x + 0.04, 3.55, z + 0.62, { uv: 1, grad: false, tint: [0.85, 0.92, 0.88] }); w.addLight(x, 3.2, z, { flame: 0, emit: false, intensity: 3.2, range: 8, color: '#e4ece4', prio: 0.6, elecLamp: true }); } else vb('pglass', x - 0.04, 3.51, z - 0.62, x + 0.04, 3.55, z + 0.62, { uv: 1, grad: false }); }
    mark(x0, z0, x1 + 0.3, z1, 0);
    mark(R1[0], 14.5, R1[1], 81.5); mark(R2[0], 14.5, R2[1], 81.5); mark(0, 14, 0.7, 82.5); mark(x1 - 0.7, 13.5, x1, 83);
  }
  // a row of switchboards x0..x1 (deep), z0..z1 (long), their faces toward the sides listed ('W': -x, 'E': +x): the cubicles' body (what
  // stops you), a door per 0.8 m on each face of four kinds (meters, a breaker's handle, relays, plain), the conduits up from their tops
  function boardRow(x0, x1, z0, z1, faces, y0) {
    const Y = y0 || 0;
    sb('ppaint', x0, Y + 0.1, z0, x1, Y + 2.2, z1, { uv: 1, tint: tint(PAINT.board, x0, z0, 41, 0.06) });
    vb('prub', x0 + 0.03, Y, z0 + 0.03, x1 - 0.03, Y + 0.1, z1 - 0.03, { uv: 1 });
    vb('ppaint', x0 - 0.02, Y + 2.2, z0 - 0.02, x1 + 0.02, Y + 2.28, z1 + 0.02, { uv: 1, tint: tint(PAINT.board, x1, z1, 42, 0.06) });
    const n = Math.max(1, Math.floor((z1 - z0) / 0.8 + 0.01)), dz = (z1 - z0) / n;
    for (const f of faces) {
      const sx = f === 'E' ? 1 : -1, fx = f === 'E' ? x1 : x0, ry = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let i = 0; i < n; i++) {
        const z = z0 + (i + 0.5) * dz, v = Math.floor(hsh(fx, z, 43) * 4), T = tint(PAINT.board, fx, z, 44, 0.07);
        const vv = hsh(fx * 3.1, z, 47), wd = dz - 0.04;
        if (vv < 0.07) {
          // (its door hangs open: the cubicle's dark inside, the copper bars up it, a breaker's front; the door swung out on its hinge)
          gg('dark', planeG(), Mx(fx + sx * 0.003, Y + 1.15, z, wd - 0.06, 2.0, 1, 0, ry, 0));
          for (const e of [-0.18, 0, 0.18]) rod('pcopper', fx + sx * 0.03, Y + 0.3, z + e, fx + sx * 0.03, Y + 2.0, z + e, 0.014, 5);
          bxr('pcast', fx + sx * 0.05, Y + 0.9, z, 0.08, 0.36, 0.5, ry);
          const th = 1.1 + hsh(z, fx, 48) * 0.5, hz = z - wd / 2, cx = fx + sx * (0.004 + Math.sin(th) * wd / 2), cz = hz + Math.cos(th) * wd / 2, nx = sx * Math.cos(th), nz = -Math.sin(th);
          gg('ppanel', planeG(), Mx(cx, Y + 1.15, cz, wd, 2.1, 1, 0, Math.atan2(nx, nz), 0), { tint: T });
          gg('ppaint', planeG(), Mx(cx - nx * 0.003, Y + 1.15, cz - nz * 0.003, wd, 2.1, 1, 0, Math.atan2(-nx, -nz), 0), { tint: [T[0] * 0.8, T[1] * 0.8, T[2] * 0.8] });
          continue;
        }
        const burnt = vv > 0.94;
        gg('ppanel', planeG(), Mx(fx + sx * 0.004, Y + 1.15, z, wd, 2.1, 1, 0, ry, 0), { tint: burnt ? [0.16, 0.14, 0.13] : T });
        if (burnt) { decal(7, fx + sx * 0.012, Y + 1.6, z, 1.1, 1.6, 'w', sx, 0); decal(7, fx + sx * 0.012, Y + 2.4, z, 1.0, 1.0, 'w', sx, 0); continue; }
        if (vv > 0.88) { gg('dark', planeG(), Mx(fx + sx * 0.008, Y + 0.95, z, wd - 0.18, 0.75, 1, 0, ry, 0)); for (const e of [0.62, 1.28]) rod('prust', fx + sx * 0.02, Y + e, z - wd / 2 + 0.1, fx + sx * 0.02, Y + e, z + wd / 2 - 0.1, 0.012, 5); }
        else if (v === 0) for (let k = 0; k < 2; k++) gauge(fx + sx * 0.01, Y + 1.55, z - 0.12 + k * 0.24, sx, 0, 0.085, k + i);
        else if (v === 1) { bxr('pcast', fx + sx * 0.05, Y + 1.1, z + 0.18, 0.08, 0.28, 0.06, ry); vb('pglass', Math.min(fx, fx + sx * 0.012), Y + 1.35, z - 0.25, Math.max(fx, fx + sx * 0.012), Y + 1.6, z + 0.05, { uv: 1, grad: false }); }
        else if (v === 2) for (let k = 0; k < 6; k++) bxr('ppaint', fx + sx * 0.035, Y + 1.25 + (k % 3) * 0.22, z + (k < 3 ? -0.14 : 0.14), 0.06, 0.16, 0.12, ry, { tint: [0.3, 0.29, 0.27] });
        if (v < 2) { const lit = hsh(z, fx, 49) < 0.3; gg(lit ? 'glow' : 'pglass', boxG(), Mx(fx + sx * 0.01, Y + 1.9, z + 0.18, 0.02, 0.04, 0.04), { tint: lit ? (v ? [0.35, 0.95, 0.45] : [1, 0.5, 0.12]) : v ? [0.3, 1.4, 0.4] : [1.5, 0.3, 0.25] }); }
      }
    }
    // (the conduits from the tops to the trays)
    if (!Y) for (let z = z0 + 0.4; z < z1; z += 1.6) rod('prust', (x0 + x1) / 2, 2.28, z, (x0 + x1) / 2, 3.3, z, 0.03, 6);
  }

  // ---------------------------------------------------------------- the mezzanine over the switch room
  function mezzanine(S) {
    // its rails: the hall side (open where the bridges, the south gallery and the stairs meet it), round the stair's opening
    railRect(0, 12, 16, 84, ML, Object.assign({}, S.opens.MZ || {}, { W: [[0, 99]] }));
    rail(2.4, 40.05, 2.4, 49, ML); rail(0.3, 40.05, 2.4, 40.05, ML);
    // the relay room: block walls to 3 m with window openings over the hall, its door; a desk and its boards inside; a slab over it
    const rx0 = 3, rx1 = 11.5, rz0 = 22, rz1 = 33;
    const wall = (ax, az, bx, bz, wins) => { const alX = bx - ax > bz - az, L = alX ? bx - ax : bz - az; let u = 0; for (const [w0, w1, y0] of [...wins, [L, L, 0]]) { if (w0 > u) { if (alX) sb('pconc', ax + u, ML, az, ax + w0, ML + 3.0, bz, { uv: 2.5, tint: [0.68, 0.66, 0.62] }); else sb('pconc', ax, ML, az + u, bx, ML + 3.0, az + w0, { uv: 2.5, tint: [0.68, 0.66, 0.62] }); } if (w1 > w0) { if (alX) { sb('pconc', ax + w0, ML, az, ax + w1, ML + y0, bz, { uv: 2, tint: [0.68, 0.66, 0.62] }); sb('pconc', ax + w0, ML + 2.4, az, ax + w1, ML + 3.0, bz, { uv: 2, tint: [0.68, 0.66, 0.62] }); } else { sb('pconc', ax, ML, az + w0, bx, ML + y0, az + w1, { uv: 2, tint: [0.68, 0.66, 0.62] }); sb('pconc', ax, ML + 2.4, az + w0, bx, ML + 3.0, az + w1, { uv: 2, tint: [0.68, 0.66, 0.62] }); } } u = w1; } };
    wall(rx1 - 0.25, rz0, rx1, rz1, [[0.6, 3.4, 1.0], [4.1, 5.9, 0.0], [6.6, 10.2, 1.0]]);
    wall(rx0, rz0, rx1 - 0.25, rz0 + 0.25, [[1.2, 4.0, 1.0], [5.0, 7.6, 1.0]]);
    wall(rx0, rz1 - 0.25, rx1 - 0.25, rz1, [[2.0, 6.5, 1.0]]);
    wall(rx0, rz0 + 0.25, rx0 + 0.25, rz1 - 0.25, []);
    for (const [ax, az, bx, bz] of [[rx1 - 0.27, rz0 + 0.6, rx1 + 0.02, rz0 + 3.4], [rx1 - 0.27, rz0 + 6.6, rx1 + 0.02, rz0 + 10.2], [rx0 + 1.2, rz0 - 0.02, rx0 + 4.0, rz0 + 0.27], [rx0 + 5.0, rz0 - 0.02, rx0 + 7.6, rz0 + 0.27], [rx0 + 2.0, rz1 - 0.27, rx0 + 6.5, rz1 + 0.02]]) { const alX = bx - ax > bz - az; for (let u = 0; u <= 1.001; u += 0.25) { if (alX) vb('prust', ax + (bx - ax) * u - 0.02, ML + 1.0, az, ax + (bx - ax) * u + 0.02, ML + 2.4, bz, { uv: 1 }); else vb('prust', ax, ML + 1.0, az + (bz - az) * u - 0.02, bx, ML + 2.4, az + (bz - az) * u + 0.02, { uv: 1 }); } if (alX) vb('prust', ax, ML + 1.68, az, bx, ML + 1.72, bz, { uv: 1 }); else vb('prust', ax, ML + 1.68, az, bx, ML + 1.72, bz, { uv: 1 }); }
    sb('pconc', rx0 - 0.1, ML + 3.0, rz0 - 0.1, rx1 + 0.1, ML + 3.25, rz1 + 0.1, { uv: 2, tint: [0.62, 0.6, 0.56] });
    // inside: the control desk (a sloped top with its dials), two boards behind it, a chair, a lamp over it
    sb('ppaint', rx0 + 2.5, ML, rz0 + 3.5, rx0 + 3.3, ML + 0.8, rz1 - 3.5, { uv: 1, tint: PAINT.board });
    gg('ppanel', planeG(), Mx(rx0 + 3.0, ML + 0.95, (rz0 + rz1) / 2, rz1 - rz0 - 7, 0.6, 1, -Math.PI / 2 + 0.6, Math.PI / 2, 0), { tint: PAINT.board });
    for (let k = 0; k < 6; k++) gauge(rx0 + 3.05, ML + 1.0, rz0 + 4 + k * 0.55, 1, 0, 0.07, k);
    boardRow(rx0 + 0.25, rx0 + 0.85, rz0 + 1, rz1 - 1, ['E'], ML);
    gg('prub', boxG(), Mx(rx0 + 4.2, ML + 0.45, (rz0 + rz1) / 2 + 0.6, 0.45, 0.08, 0.45, 0, 0.5, 0)); rod('prust', rx0 + 4.2, ML, (rz0 + rz1) / 2 + 0.6, rx0 + 4.2, ML + 0.42, (rz0 + rz1) / 2 + 0.6, 0.03, 6); gg('prub', boxG(), Mx(rx0 + 4.42, ML + 0.75, (rz0 + rz1) / 2 + 0.72, 0.06, 0.5, 0.42, 0, 0.5, 0));
    lamp(rx0 + 4.0, ML + 2.6, (rz0 + rz1) / 2, ML + 3.0, true, { s: 0.7, I: 3, R: 7, prio: 0.6 });
    mark(rx0, rz0, rx1, rz1);
    // the motor control centres along the west wall, batteries on their racks, the cable drums and trays; the ladders' feet (hallShell)
    for (const [za, zb] of [[13, 20], [36, 39.5], [50, 58], [64, 70]]) boardRow(0.45, 1.05, za, zb, ['E'], ML);
    for (const [za, zb] of [[72, 80]]) { for (let tier = 0; tier < 3; tier++) { vb('prust', 0.4, ML + 0.3 + tier * 0.6, za, 1.4, ML + 0.34 + tier * 0.6, zb, { uv: 1 }); for (let z = za + 0.2; z < zb - 0.2; z += 0.32) { gg('pglass', boxG(), Mx(0.9, ML + 0.52 + tier * 0.6, z, 0.36, 0.36, 0.26), { tint: [2.2, 2.0, 1.6] }); rod('pcopper', 0.85, ML + 0.72 + tier * 0.6, z - 0.1, 0.85, ML + 0.72 + tier * 0.6, z + 0.24, 0.012, 4); } } for (const x of [0.4, 1.4]) for (const z of [za, zb]) rod('prust', x, ML, z, x, ML + 1.6, z, 0.025, 6); col(0.35, ML, za, 1.45, ML + 1.6, zb); }
    for (const [x, z] of [[9.5, 45], [13, 52.5], [6.5, 70]]) cableDrum(x, ML, z, hsh(x, z, 3) * 3);
    for (const x of [5, 12.6]) for (const [za, zb] of (x < 10 ? [[14, 21], [34, 81]] : [[14, 81]])) {
      const ty = ML + 2.3;
      for (let z = za + 0.3; z <= zb - 0.2; z += 4.5) { hpost(x + 0.42, z, ML, ty + 0.5, 1, 0, 0.14); vb('prust', x - 0.4, ty - 0.12, z - 0.04, x + 0.42, ty - 0.02, z + 0.04, { uv: 1 }); gg('prust', boxG(), memM(x + 0.4, ty - 0.1, z, x + 0.42, ty - 0.9, z, 1, 0, 0, 0.05, 0.05), { su: 0.2, sv: 1 }); }
      vb('prust', x - 0.35, ty - 0.02, za, x + 0.35, ty, zb, { uv: 1, grad: false });
      for (const e of [-0.35, 0.35]) vb('prust', x + e - 0.012, ty - 0.02, za, x + e + 0.012, ty + 0.14, zb, { uv: 1, grad: false });
      for (let k = 0; k < 8; k++) { const cx = x - 0.27 + (k % 5) * 0.135, cy = ty + 0.05 + (k > 4 ? 0.08 : 0) + (k % 2) * 0.01; rod('prub', cx, cy, za, cx, cy, zb, 0.042 + (k % 3) * 0.008, 6); }
      for (let z = za + 0.8; z < zb; z += 1.6) vb('prub', x - 0.3, ty + 0.03, z - 0.012, x + 0.3, ty + 0.2, z + 0.012, { uv: 1, grad: false, tint: [0.5, 0.5, 0.5], skip: { top: true, bottom: true } });
    }
    // chests may stand up here
    w.platTops.push({ x0: 6, z0: 52, x1: 10, z1: 60, y: ML, cx: 8, cz: 56 }, { x0: 6, z0: 36, x1: 10, z1: 39, y: ML, cx: 8, cz: 37.5 });
  }
  // a cable drum standing on its rims (two discs and the barrel between, the cable round it), turned ry about y
  function cableDrum(x, y, z, ry) {
    const c = Math.cos(ry), s = Math.sin(ry), R = 0.75;
    for (const d of [-0.42, 0.42]) gg('woodDark', cylG(18), Mx(x + c * d, y + R, z - s * d, R, 0.08, R, 0, ry, Math.PI / 2), { su: 2, sv: 0.2 });
    gg('prub', cylG(18), Mx(x, y + R, z, R * 0.82, 0.76, R * 0.82, 0, ry, Math.PI / 2), { su: 6, sv: 1 });
    rod('prub', x + c * 0.3, y + R * 1.62, z - s * 0.3, x + c * 0.3 + s * 0.6, y + 0.03, z - s * 0.3 + c * 0.6, 0.035, 6);
    w.roundCollider(x, z, R * 0.7, y, y + R * 2, { surf: 'wood' }).forEach((k) => { k.vis = true; });
    if (y < 0.1) mark(x - 1, z - 1, x + 1, z + 1);
  }

  // ---------------------------------------------------------------- the switchyard
  function yard(S) {
    // the main transformers, against the hall's wall (their buses come out of it), each with its platform to the hall's middle level
    for (const zc of TRANS) transformer(zc);
    // the gantries across the yard, the strung lines between them, the breakers and the disconnectors under them
    for (const z of GANTRY) gantry(z);
    yardLights();
    const PH = [74, 78, 82];
    for (const x of PH) {
      const a = [x, 8.65, GANTRY[0]], b = [x, 8.65, GANTRY[1]];
      slack('ppaint', a, b, 1.6, 0.025, { tint: [0.34, 0.34, 0.33], su: 0.2, sv: 1 });
      // (down from the first gantry's lines to the transformers' bushings)
      const t = [72.2, 6.6, TRANS[0] + (x - 78) * 0.9], t2 = [72.2, 6.6, TRANS[1] + (x - 78) * 0.9];
      slack('ppaint', a, t, 1.2, 0.022, { tint: [0.34, 0.34, 0.33], su: 0.2, sv: 1 });
      slack('ppaint', b, t2, 1.4, 0.022, { tint: [0.34, 0.34, 0.33], su: 0.2, sv: 1 });
    }
    for (const x of PH) { breaker(x, 50); discon(x, GANTRY[0] + 3.2); }
    // (the droppers: the breakers' bushings up to the lines over them)
    for (const x of PH) for (const dz of [-0.75, 0.75]) slack('ppaint', [x, 4.15, 50 + dz], [x, 7.25 + 0.5 * Math.abs(50 + dz - 46) / 11, 50 + dz * 3], 0.15, 0.018, { tint: [0.34, 0.34, 0.33], su: 0.2, sv: 1 });
    // floodlight masts on the cave's side
    for (const [z, on] of [[24, true], [66, true], [87, true]]) {
      const x = 88.6; gg('ppaint', cylG(12), Mx(x, 5.2, z, 0.14, 10.4, 0.14), { tint: PAINT.grey, su: 1, sv: 10 }); vb('pconc', x - 0.45, 0, z - 0.45, x + 0.45, 0.3, z + 0.45, { uv: 1 }); col(x - 0.18, 0, z - 0.18, x + 0.18, 10.4, z + 0.18);
      vb('prust', x - 1.4, 10.3, z - 0.05, x + 0.2, 10.38, z + 0.05, { uv: 1 });
      for (const dx of [-1.2, -0.4]) { gg('ppaint', boxG(), Mx(x + dx, 10.0, z, 0.5, 0.36, 0.42, 0, 0, -0.5), { tint: PAINT.dkgreen }); if (on) gg('glow', boxG(), Mx(x + dx - 0.16, 9.84, z, 0.04, 0.26, 0.34, 0, 0, -0.5), { tint: [1, 0.88, 0.66] }); }
      if (on) w.addLight(x - 1.6, 9.4, z, { flame: 0, emit: false, steady: true, intensity: 18, range: 36, color: z === 66 ? '#d8e4ff' : '#ffd8a8', prio: 1.0, elecLamp: true });
      sign(x - 0.15, 1.7, z, -1, 0, 0.32, 0);
    }
  }
  // the yard's other lights: floods hung under each gantry's beam, sodium lamps on brackets off the hall's wall
  function yardLights() {
    for (const z of GANTRY) for (const x of [72.5, 83.5]) { const zz = z + 0.45; gg('ppaint', boxG(), Mx(x, 9.75, zz, 0.55, 0.32, 0.4, 0.5, 0, 0), { tint: PAINT.dkgreen }); gg('glow', boxG(), Mx(x, 9.62, zz + 0.16, 0.42, 0.04, 0.26, 0.5, 0, 0), { tint: [0.85, 0.92, 1] }); rod('prust', x, 10.2, z + 0.3, x, 9.85, zz, 0.02, 5); w.addLight(x, 9.2, zz + 1.2, { flame: 0, emit: false, steady: true, intensity: 13, range: 24, color: '#d8e4ff', prio: 0.9, elecLamp: true }); }
    for (const z of [30, 52, 88]) { rod('prust', BXO, 6.6, z, BXO + 1.2, 6.6, z, 0.03, 6); rod('prust', BXO, 5.9, z, BXO + 0.8, 6.6, z, 0.02, 5); lamp(BXO + 1.2, 6.25, z, 6.6, hsh(z, 3, 95) < 0.3 ? 'blink' : true, { s: 0.7, I: 8, R: 16, prio: 0.7, kind: 'sod', cone: 4.5 }); }
  }
  // a main transformer at the hall's wall (z of its middle): its tank on a plinth in a bund, the cooling radiators, the bushings, the conservator
  function transformer(zc) {
    const T = tint(PAINT.mach, 70, zc, 51, 0.05), tx0 = 69.2, tx1 = 73.2, tz0 = zc - 2.6, tz1 = zc + 2.6;
    sb('pconc', 67.6, 0, zc - 3.8, 76.3, 0.3, zc + 3.6, { uv: 3, tint: [0.7, 0.68, 0.64] });
    mark(67.4, zc - 4, 76.5, zc + 3.8);
    sb('ppaint', tx0, 0.3, tz0, tx1, 3.75, tz1, { uv: 1.5, tint: T });
    vb('ppaint', tx0 - 0.08, 3.75, tz0 - 0.08, tx1 + 0.08, 3.86, tz1 + 0.08, { uv: 1, tint: tint(T, 1, 2, 3, 0.08) });
    for (let x = tx0 + 0.15; x < tx1; x += 0.36) for (const z of [tz0 - 0.08, tz1 + 0.08]) gg('pcast', cylG(6, true), Mx(x, 3.9, z, 0.025, 0.07, 0.025));
    for (let z = tz0 + 0.5; z < tz1; z += 0.8) for (const x of [tx0 - 0.05, tx1 + 0.05]) vb('ppaint', x - 0.05, 0.35, z - 0.05, x + 0.05, 3.7, z + 0.05, { uv: 1, tint: T });
    for (let x = tx0 + 0.6; x < tx1; x += 0.8) for (const z of [tz0 - 0.05, tz1 + 0.05]) vb('ppaint', x - 0.05, 0.35, z - 0.05, x + 0.05, 3.7, z + 0.05, { uv: 1, tint: T });
    // radiators on the east side: two banks of thin fins between headers
    for (const [za, zb] of [[tz0 + 0.2, zc - 0.2], [zc + 0.2, tz1 - 0.2]]) {
      for (let z = za + 0.05; z < zb; z += 0.17) vb('ppaint', tx1 + 0.3, 0.75, z - 0.02, tx1 + 2.2, 3.3, z + 0.02, { uv: 1, tint: tint(T, z, 1, 52, 0.06) });
      for (const y of [0.65, 3.4]) rod('ppaint', tx1 + 1.25, y, za, tx1 + 1.25, y, zb, 0.09, 8, { tint: T, su: 0.6, sv: 2 });
      for (const y of [0.65, 3.4]) for (const z of [za + 0.4, zb - 0.4]) rod('ppaint', tx1, y, z, tx1 + 1.25, y, z, 0.08, 8, { tint: T, su: 0.6, sv: 1 });
      for (const x of [tx1 + 0.5, tx1 + 2.0]) rod('prust', x, 0.3, (za + zb) / 2, x, 0.75, (za + zb) / 2, 0.05, 6);
    }
    col(tx1, 0.3, tz0 + 0.1, tx1 + 2.3, 3.5, tz1 - 0.1);
    // the bushings: three tall high-voltage ones on top (east), three short low-voltage ones (west) with the bus duct's throat
    for (const dz of [-1.2, 0, 1.2]) { gg('ppaint', cylG(14), Mx(72.2, 4.05, zc + dz, 0.26, 0.4, 0.26), { tint: T }); gg('pporc', insG(2.2, 0.11, 0.22), Mx(72.2, 4.25, zc + dz, 1, 1, 1)); gg('pcast', cylG(12), Mx(72.2, 6.5, zc + dz, 0.12, 0.2, 0.12)); }
    for (const dz of [-0.85, 0, 0.85]) { gg('pporc', insG(0.8, 0.08, 0.16), Mx(69.9, 3.86, zc + dz, 1, 1, 1)); gg('pcast', cylG(10), Mx(69.9, 4.72, zc + dz, 0.08, 0.12, 0.08)); }
    sb('ppaint', 67.0, 3.0, zc - 1.5, 69.2, 4.3, zc + 1.5, { uv: 1, tint: PAINT.grey });
    // the conservator on its legs, the pipe down to the tank and its relay; the tap changer's cabinet; a ladder up the tank's side
    gg('ppaint', cylG(18), Mx(70.6, 5.15, zc, 0.48, 3.4, 0.48, Math.PI / 2, 0, 0), { tint: T, su: 3, sv: 3 });
    for (const dz of [-1.2, 1.2]) { rod('prust', 70.6, 3.86, zc + dz, 70.6, 4.75, zc + dz, 0.05, 6); }
    pipe([[70.6, 4.7, zc - 0.6], [70.6, 4.3, zc - 0.6], [71.3, 4.3, zc - 0.6], [71.3, 3.86, zc - 0.6]], 0.05, { mk: 'ppaint', tint: T });
    col(70.1, 4.65, zc - 1.75, 71.1, 5.65, zc + 1.75);
    sb('ppaint', 70.4, 0.3, tz0 - 0.65, 71.8, 2.2, tz0, { uv: 1, tint: PAINT.grey }); sign(71.1, 1.6, tz0 - 0.66, 0, -1, 0.3, 0);
    for (let y = 0.6; y < 3.7; y += 0.3) rod('prust', tx0 + 1.0, y, tz1 + 0.22, tx0 + 1.6, y, tz1 + 0.22, 0.014, 5);
    for (const x of [tx0 + 1.0, tx0 + 1.6]) rod('prust', x, 0.3, tz1 + 0.22, x, 3.9, tz1 + 0.22, 0.022, 5);
    sign(tx0 - 0.01, 2.4, zc, -1, 0, 0.36, 1);
    // its platform's stair down into the yard (middle()), a lamp on the platform's post
    lamp(78.6, ML + 2.6, zc + (zc < 40 ? 5.7 : 3.1), ML + 3.0, true, { s: 0.6, I: 5, R: 12, prio: 0.6 });
    rod('prust', 78.6, ML, zc + (zc < 40 ? 5.7 : 3.1), 78.6, ML + 3.0, zc + (zc < 40 ? 5.7 : 3.1), 0.03, 6);
  }
  // a gantry across the yard at z: two lattice legs, the lattice beam over them, the insulator strings hanging from it
  function gantry(z) {
    const xa = 68.6, xb = 87.4, yb = 10.2, yt = 11.0, s = 0.3;
    for (const x of [xa, xb]) {
      vb('pconc', x - 0.55, -0.05, z - 0.55, x + 0.55, 0.3, z + 0.55, { uv: 1, tint: [0.68, 0.66, 0.62] });
      for (const [dx, dz] of [[-s, -s], [s, -s], [-s, s], [s, s]]) gg('prust', angG(0.1, 0.01), angM(x + dx, 0.3, z + dz, x + dx, yt, z + dz, [-Math.sign(dx), 0, 0], [0, 0, -Math.sign(dz)]), { su: 0.3, sv: 11 });
      for (let y = 0.3, j = 0; y < yt - 0.3; y += 0.7, j++) for (const [ax, az, bx, bz] of [[-s, -s, s, -s], [s, -s, s, s], [s, s, -s, s], [-s, s, -s, -s]]) { const up = j % 2; gg('prust', boxG(), memM(x + (up ? ax : bx), y, z + (up ? az : bz), x + (up ? bx : ax), y + 0.7, z + (up ? bz : az), 0, 1, 0, 0.04, 0.04), { su: 0.2, sv: 1 }); if (j % 3 === 0) gg('prust', boxG(), memM(x + ax, y, z + az, x + bx, y, z + bz, 0, 1, 0, 0.035, 0.035), { su: 0.2, sv: 1 }); }
      col(x - s - 0.05, 0, z - s - 0.05, x + s + 0.05, yt, z + s + 0.05);
      mark(x - 0.8, z - 0.8, x + 0.8, z + 0.8);
    }
    for (const y of [yb, yt]) for (const dz of [-s, s]) gg('prust', angG(0.1, 0.01), angM(xa, y, z + dz, xb, y, z + dz, [0, y === yb ? 1 : -1, 0], [0, 0, -Math.sign(dz)]), { su: 0.3, sv: 19 });
    for (let x = xa; x < xb - 0.3; x += 0.8) for (const dz of [-s, s]) gg('prust', boxG(), memM(x, yb, z + dz, x + 0.8, yt, z + dz, 0, 0, 1, 0.035, 0.035), { su: 0.2, sv: 1 });
    for (let x = xa; x < xb; x += 1.6) for (const y of [yb, yt]) gg('prust', boxG(), memM(x, y, z - s, x, y, z + s, 0, 1, 0, 0.035, 0.035), { su: 0.2, sv: 0.6 });
    col(xa, yb, z - s, xb, yt, z + s);
    for (const x of [74, 78, 82]) { gg('pporc', discG(7), Mx(x, yb - 0.05, z, 1, 1, 1)); gg('pcast', discCapG(7), Mx(x, yb - 0.05, z, 1, 1, 1)); gg('pcast', boxG(), Mx(x, yb - 1.12, z, 0.08, 0.12, 0.26)); }
    sign(xa + s + 0.02, 1.8, z, 1, 0, 0.36, 0);
  }
  // a dead-tank breaker at (x, z): its tank across z on a steel frame, the two bushings, the mechanism's cabinet under it
  function breaker(x, z) {
    for (const dx of [-0.55, 0.55]) for (const dz of [-0.9, 0.9]) hpost(x + dx, z + dz, 0, 1.75, 0, 1, 0.14);
    vb('pconc', x - 0.9, -0.03, z - 1.3, x + 0.9, 0.12, z + 1.3, { uv: 1, tint: [0.66, 0.64, 0.6] });
    vb('prust', x - 0.7, 1.7, z - 1.05, x + 0.7, 1.78, z + 1.05, { uv: 1 });
    gg('ppaint', cylG(18), Mx(x, 2.25, z, 0.48, 2.5, 0.48, Math.PI / 2, 0, 0), { tint: tint(PAINT.grey, x, z, 61, 0.06), su: 3, sv: 2.5 });
    for (const dz of [-1.25, 1.25]) gg('ppaint', lathe('tankend', [[0.48, 0], [0.42, 0.12], [0.25, 0.2], [0.001, 0.22]], 18), Mx(x, 2.25, z + dz, 1, 1, 1, (dz > 0 ? 1 : -1) * Math.PI / 2, 0, 0), { tint: tint(PAINT.grey, x, z, 61, 0.06) });
    for (const dz of [-0.75, 0.75]) { gg('pporc', insG(1.35, 0.075, 0.16), Mx(x, 2.65, z + dz, 1, 1, 1, dz * 0.12, 0, 0)); gg('pcast', cylG(10), Mx(x, 4.05, z + dz * 1.1, 0.09, 0.14, 0.09)); }
    sb('ppaint', x - 0.35, 0.4, z - 0.4, x + 0.35, 1.5, z + 0.4, { uv: 1, tint: PAINT.board });
    col(x - 0.5, 1.7, z - 1.3, x + 0.5, 2.75, z + 1.3);
    mark(x - 1, z - 1.5, x + 1, z + 1.5);
  }
  // a disconnector: three insulator columns on a beam on two posts, the blade between two of them stood open
  function discon(x, z) {
    for (const dz of [-0.9, 0.9]) hpost(x, z + dz, 0, 2.3, 0, 1, 0.16);
    mem('prust', chanG(0.2, 0.07, 0.008), x, 2.4, z - 1.05, x, 2.4, z + 1.05, 0, 1, 0, { su: 0.4, sv: 2.1 });
    for (const dz of [-0.85, 0, 0.85]) { gg('pporc', insG(0.95, 0.06, 0.13), Mx(x, 2.5, z + dz, 1, 1, 1)); gg('pcast', cylG(10), Mx(x, 3.5, z + dz, 0.08, 0.1, 0.08)); }
    gg('pcopper', boxG(), memM(x, 3.56, z - 0.85, x, 4.25, z - 0.25, 1, 0, 0, 0.05, 0.03), { su: 0.2, sv: 0.9 });
    gg('pcopper', boxG(), memM(x, 3.56, z, x, 3.56, z + 0.85, 1, 0, 0, 0.05, 0.03), { su: 0.2, sv: 0.9 });
    mark(x - 0.6, z - 1.3, x + 0.6, z + 1.3);
  }

  // ---------------------------------------------------------------- the traps' places (w.elec), drawn dead
  // m: where its box hangs - the point on the face it is fixed to, the box's middle height, the way its door faces (the box's middle stands
  // 0.2 m out from the face); post: a steel post of its own behind it (where it stands free); c: the foot under it (the bond to a plate runs there)
  const ZONES = [
    { r: [42.2, 44.8, 47.6, 48.8], y: 0, m: [49.2, 1.6, 49.7, -Math.PI / 2] },          // the middle aisle at the crossing (on the second east table's column)
    { r: [35.5, 53.0, 40.0, 58.5], y: 0, m: [32.8, 1.6, 59.5, Math.PI / 2] },           // between the second sets (the west table's column)
    { r: [42.0, 19.5, 46.5, 24.5], y: 0, m: [49.2, 1.6, 21.6, -Math.PI / 2] },          // between the first sets
    { r: [28.4, 40.4, 32.4, 43.4], y: 0, m: [32.35, 1.6, 49.25, Math.PI] },             // the west row's gap (on the second table's end column)
    { r: [12.4, 30.0, 15.8, 34.0], y: ML, m: [15.95, ML + 1.5, 27.2, 0] },              // the mezzanine where the west bridge meets it (on the crane's column)
    { r: [62.5, 19.6, BX, 24.4], y: ML, m: [BX, ML + 1.5, 25.6, -Math.PI / 2] },        // the east gallery at the platform's door (on the wall)
    { r: [36.5, 73.5, 40.5, 76.5], y: ML, m: [41.2, ML + 1.45, 74.15, -Math.PI / 2], post: true },   // the south gallery by its stair
    { r: [72.0, 39.5, 80.0, 45.5], y: 0, m: [68.95, 1.6, 35.15, Math.PI / 2] },          // the yard's middle (on the gantry's leg)
    { r: [11.4, 64.0, 14.9, 69.0], y: 0, m: [8.6, 1.6, 66.5, Math.PI / 2] },            // the switch room's wide aisle (on the boards' end)
    { r: [4.0, 74.0, 9.5, 79.5], y: ML, m: [0, ML + 1.5, 71.0, Math.PI / 2] },          // the mezzanine's south end (on the west wall)
  ];
  const ARCS = [
    { a: [17.4, 62], b: [24.4, 62], y: 0, m: [16.0, 1.55, 63.6, Math.PI / 2] },          // across the west aisle (on the switch room's wall)
    { a: [57.9, 29], b: [64.5, 29], y: 0, m: [BX, 1.55, 31.2, -Math.PI / 2] },           // across the east aisle, under the gallery
    { a: [69.6, 28.5], b: [77.4, 28.5], y: 0, m: [78.0, 1.55, 30.45, Math.PI], post: true },   // the yard, south of the first transformer
    { a: [79.5, 64.5], b: [87.5, 64.5], y: 0, m: [88.46, 1.55, 66.0, -Math.PI / 2] },    // the yard, by the second gantry (on the mast)
    { a: [11.6, 48.5], b: [15.4, 48.5], y: 0, m: [8.6, 1.55, 50.6, Math.PI / 2] },       // the switch room's wide aisle
    { a: [68.0, 86.0], b: [76.0, 86.0], y: 0, m: [BXO, 1.55, 87.5, Math.PI / 2] },       // the yard's south end (on the hall's wall)
    { a: [4.2, 60.5], b: [12.2, 60.5], y: ML, m: [0, ML + 1.55, 62.5, Math.PI / 2] },    // across the mezzanine
  ];
  // the box on its face: its middle 0.2 m out along the way it faces; a free one on a post of its own behind it
  function mountBox(m, id, y0, post) {
    const s = Math.sin(m[3]), c = Math.cos(m[3]);
    if (post) hpost(m[0] - s * 0.08, m[2] - c * 0.08, y0, m[1] + 0.75, 1, 0, 0.14);
    const off = post ? 0.15 : BOXD / 2;
    return elecBox(m[0] + s * off, m[1], m[2] + c * off, m[3], id, m[1] + 1.4, y0);
  }
  function traps(S) {
    // (n of the list's places, by the dice: a number of them, then which)
    const pick = (len, lo, hi) => { const n = Math.min(len, lo + Math.floor(S.r() * (hi - lo + 1))); return Array.from({ length: len }, (_, i) => [i, S.r()]).sort((p, q) => p[1] - q[1]).slice(0, n).map((p) => p[0]).sort((p, q) => p - q); };
    for (const i of pick(ZONES.length, 7, 9)) {
      const Z = ZONES[i], [x0, z0, x1, z1] = Z.r, y = Z.y, id = 'z' + S.zones.length;
      const seams = zonePlate(x0, z0, x1, z1, y);
      const box = mountBox(Z.m, id, y, Z.post);
      S.zones.push({ id, x0, z0, x1, z1, y: y + 0.012, box, seams });
      if (y < 0.1) mark(x0, z0, x1, z1);
      // (the bond from the plate to its box: a copper strap along the floor from the plate's nearest edge to the foot of the box)
      const cx = Z.m[0], cz = Z.m[2], ex = Math.max(x0, Math.min(x1, cx)), ez = Math.max(z0, Math.min(z1, cz));
      if (Math.hypot(ex - cx, ez - cz) > 0.3) { vb('pcopper', Math.min(ex, cx) - 0.025, y, ez - 0.025, Math.max(ex, cx) + 0.025, y + 0.01, ez + 0.025, { uv: 1, grad: false }); vb('pcopper', cx - 0.025, y, Math.min(ez, cz) - 0.025, cx + 0.025, y + 0.01, Math.max(ez, cz) + 0.025, { uv: 1, grad: false }); }
    }
    for (const i of pick(ARCS.length, 4, 6)) {
      const A = ARCS[i], id = 'a' + S.arcs.length, y = A.y;
      const ta = insPost(A.a[0], A.a[1], y, 0.25, 0.95, 0.13), tb = insPost(A.b[0], A.b[1], y, 0.25, 0.95, 0.13);
      // (the line between them: slack, but within a hand of the straight between its ends, where elec.js draws the arc)
      slack('pcopper', [A.a[0], ta, A.a[1]], [A.b[0], tb, A.b[1]], 0.14, 0.016, { su: 0.1, sv: 1, tint: [0.7, 0.66, 0.62] });
      const box = mountBox(A.m, id, y, A.post);
      S.arcs.push({ id, a: { x: A.a[0], y: ta, z: A.a[1] }, b: { x: A.b[0], y: tb, z: A.b[1] }, box });
      if (y < 0.1) { mark(A.a[0] - 0.4, A.a[1] - 0.4, A.a[0] + 0.4, A.a[1] + 0.4); mark(A.b[0] - 0.4, A.b[1] - 0.4, A.b[0] + 0.4, A.b[1] + 0.4); }
    }
  }
  // a live floor's plates, dead: chequer plates laid flush in a frame, their seams, the bolts at their corners, a black and yellow border
  function zonePlate(x0, z0, x1, z1, y) {
    vb('pplate', x0 + 0.1, y, z0 + 0.1, x1 - 0.1, y + 0.012, z1 - 0.1, { uv: 1, grad: false, tint: [0.92, 0.9, 0.86] });
    const nx = Math.max(1, Math.round((x1 - x0) / 1.2)), nz = Math.max(1, Math.round((z1 - z0) / 1.2));
    for (let i = 1; i < nx; i++) { const x = x0 + (x1 - x0) * i / nx; vb('prub', x - 0.01, y + 0.012, z0 + 0.1, x + 0.01, y + 0.014, z1 - 0.1, { uv: 1, grad: false, skip: { bottom: true, px: true, nx: true, pz: true, nz: true } }); }
    for (let j = 1; j < nz; j++) { const z = z0 + (z1 - z0) * j / nz; vb('prub', x0 + 0.1, y + 0.012, z - 0.01, x1 - 0.1, y + 0.014, z + 0.01, { uv: 1, grad: false, skip: { bottom: true, px: true, nx: true, pz: true, nz: true } }); }
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) { if (i > 0 && i < nx && j > 0 && j < nz) continue; const x = Math.min(x1 - 0.18, Math.max(x0 + 0.18, x0 + (x1 - x0) * i / nx)), z = Math.min(z1 - 0.18, Math.max(z0 + 0.18, z0 + (z1 - z0) * j / nz)); gg('pcast', cylG(6, true), Mx(x, y + 0.016, z, 0.022, 0.012, 0.022)); }
    // the border: stripes at 45 degrees, worn through
    const strip = (ax, az, bx, bz) => { const alX = bx - ax > bz - az, L = alX ? bx - ax : bz - az; vb('ppaint', ax, y + 0.002, az, bx, y + 0.012, bz, { uv: 1, grad: false, tint: [0.09, 0.09, 0.08], skip: { bottom: true } }); for (let u = 0.1; u < L - 0.15; u += 0.4) { const a = (alX ? ax : az) + u, b = Math.min(alX ? bx : bz, a + 0.2); if (hsh(a, ax + az, 77) < 0.15) continue; if (alX) vb('ppaint', a, y + 0.012, az, b, y + 0.0135, bz, { uv: 1, grad: false, tint: PAINT.yellow, skip: { bottom: true, px: true, nx: true, pz: true, nz: true } }); else vb('ppaint', ax, y + 0.012, a, bx, y + 0.0135, b, { uv: 1, grad: false, tint: PAINT.yellow, skip: { bottom: true, px: true, nx: true, pz: true, nz: true } }); } };
    strip(x0, z0, x1, z0 + 0.1); strip(x0, z1 - 0.1, x1, z1); strip(x0, z0 + 0.1, x0 + 0.1, z1 - 0.1); strip(x1 - 0.1, z0 + 0.1, x1, z1 - 0.1);
    return { nx, nz };   // (how the plates are laid: nx by nz of them, the seams evenly between - w.elec's zones carry it for elec.js)
  }

  // ---------------------------------------------------------------- what lies about: barrels, crates, drums, gas bottles, a bench, the pumps
  function clutter(S) {
    // the boiler feed pumps on their skids at the south end of the hall (motor, coupling guard, the pump's casing, its pipes)
    for (const [x, z] of [[22, 80.5], [61.6, 87.2], [58.5, 81]]) feedPump(x, z);
    // oil drums, crates (some burst), gas bottles in their rack, a workbench, a scaffold tower by the second east set
    const spots = [[19, 9, 'barrels'], [36.5, 9.5, 'crates'], [60, 4, 'bottles'], [31.8, 46.8, 'barrels'], [45.5, 37, 'crates'], [36.6, 66, 'bench'], [60, 37, 'barrels'], [19.5, 37, 'crates'], [46, 89, 'crates'], [30, 88, 'barrels'], [58.5, 58, 'scaffold'], [22, 70, 'drum'], [44, 71.5, 'barrels'], [83, 13, 'crates'], [85, 40, 'barrels'], [70.5, 61, 'crates'], [84, 82, 'barrels'], [9, 6, 'crates'], [6, 88, 'barrels'], [12, 3, 'bottles']];
    for (const [x, z, k] of spots) {
      if (!occ.free(x - 1, z - 1, x + 1, z + 1)) continue;
      if (k === 'barrels') { const n = 1 + Math.floor(S.r() * 2); for (let i = 0; i < n; i++) { const a = i * 2.1 + S.r(), r = i ? 0.8 : 0; P().barrel(w, x + Math.cos(a) * r, z + Math.sin(a) * r, 0, rng, S.r() < 0.25); } }
      else if (k === 'crates') { const n = 1 + Math.floor(S.r() * 2); for (let i = 0; i < n; i++) P().crate(w, x + (i % 2) * 1.15 - 0.5, z + Math.floor(i / 2) * 1.15 - 0.5, 0, rng); }
      else if (k === 'bottles') gasRack(x, z);
      else if (k === 'bench') bench(x, z);
      else if (k === 'scaffold') scaffold(x, z);
      else if (k === 'drum') cableDrum(x, 0, z, S.r() * 3);
      mark(x - 1.4, z - 1.4, x + 1.4, z + 1.4);
    }
    // pipes along the east wall on their brackets (two big lagged mains, a small bare line), valves at their feet where they go down
    for (const [za, zb] of [[8, 40.2], [47.8, 78.5]]) for (const y of [3.35, 3.9]) pipe([[BX - 0.45, y, za], [BX - 0.45, y, zb], [BX - 0.45, 0, zb]], y > 3.6 ? 0.2 : 0.26, { lag: y > 3.6, fl: y > 3.6 ? 0 : 3.1 });
    for (let z = 9; z < 79; z += 3) if (z < 40 || z > 48) { vb('prust', BX - 0.85, 3.0, z - 0.05, BX, 3.07, z + 0.05, { uv: 1 }); rod('prust', BX - 0.82, 3.07, z, BX - 0.82, 4.25, z, 0.022, 5); }
    for (const z of [12, 27, 52, 70]) { pipe([[BX - 0.45, 3.35, z], [BX - 1.4, 3.35, z], [BX - 1.4, 0, z]], 0.14, {}); valve(BX - 1.4, 1.2, z, 0.16, -1, 0); col(BX - 1.65, 0, z - 0.25, BX - 1.15, 2.3, z + 0.25); mark(BX - 2, z - 0.6, BX, z + 0.6); }
    // fire extinguishers on the columns, signs
    for (const z of [9, 27, 51, 69, 87]) { gg('ppaint', cylG(12), Mx(16.32, 1.0, z, 0.09, 0.55, 0.09), { tint: PAINT.red }); gg('pcast', cylG(8), Mx(16.32, 1.32, z, 0.035, 0.1, 0.035)); }
    for (const [x, z, fx, fz, k] of [[25.19, 21.6, -1, 0, 0], [56.81, 26.5, 1, 0, 1], [16.01, 43.5, 1, 0, 0], [32.81, 64.4, 1, 0, 1], [BX - 0.01, 60, -1, 0, 0]]) sign(x, 1.9, z, fx, fz, 0.45, k);
    // fallen and hanging lamps; a toppled board
    for (const [x, z] of [[38.5, 30], [46, 63]]) { gg('ppaint', shadeG(), Mx(x, 0.18, z, 1, 1, 1, 1.9, 0.6, 0), { tint: PAINT.dkgreen }); slack('prust', [x, 0.3, z], [x + 1.8, 0.02, z + 1.2], 0.05, 0.01); }
    gg('ppaint', boxG(), Mx(55.5, 0.32, 86.5, 2.2, 0.6, 0.8, 0, 0.3, 0), { tint: PAINT.board }); col(54.3, 0, 85.8, 56.7, 0.62, 87.2); mark(54, 85.5, 57, 87.5);
  }
  function feedPump(x, z) {
    sb('prust', x - 0.8, 0, z - 2.4, x + 0.8, 0.25, z + 2.4, { uv: 1 });
    gg('ppaint', cylG(18), Mx(x, 0.85, z - 1.2, 0.55, 1.6, 0.55, Math.PI / 2, 0, 0), { tint: PAINT.mach2, su: 3, sv: 1.6 });
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) vb('ppaint', x + Math.cos(a) * 0.56 - 0.02, 0.85 + Math.sin(a) * 0.56 - 0.02, z - 1.9, x + Math.cos(a) * 0.56 + 0.02, 0.85 + Math.sin(a) * 0.56 + 0.02, z - 0.5, { uv: 1, tint: PAINT.mach2 });
    gg('ppaint', cylG(14), Mx(x, 0.85, z + 0.05, 0.32, 0.5, 0.32, Math.PI / 2, 0, 0), { tint: PAINT.yellow });
    gg('pcast', lathe('pumpcase', [[0.001, 0], [0.4, 0], [0.62, 0.12], [0.66, 0.4], [0.5, 0.62], [0.2, 0.7], [0.001, 0.7]], 18), Mx(x, 0.85, z + 0.4, 1, 1, 1, Math.PI / 2, 0, 0));
    pipe([[x, 1.5, z + 0.75], [x, 2.4, z + 0.75], [x, 2.4, z + 2.4], [x, -0.2, z + 2.4]], 0.14, { fl: 0.6 });
    valve(x, 2.4, z + 1.5, 0.16, 0, 0);
    col(x - 0.8, 0, z - 2.4, x + 0.8, 1.6, z + 1.2); col(x - 0.25, 0, z + 2.2, x + 0.25, 2.6, z + 2.6);
    mark(x - 1.2, z - 2.8, x + 1.2, z + 3);
  }
  function gasRack(x, z) {
    for (const dx of [-0.6, 0.6]) rod('prust', x + dx, 0, z - 0.3, x + dx, 1.4, z - 0.3, 0.025, 5);
    rod('prust', x - 0.6, 1.1, z - 0.3, x + 0.6, 1.1, z - 0.3, 0.02, 5); rod('prust', x - 0.6, 0.5, z - 0.3, x + 0.6, 0.5, z - 0.3, 0.02, 5);
    for (let i = 0; i < 4; i++) { const bx = x - 0.45 + i * 0.3; gg('ppaint', cylG(12), Mx(bx, 0.72, z - 0.1, 0.11, 1.44, 0.11), { tint: i % 2 ? PAINT.dkgreen : [0.15, 0.18, 0.3] }); gg('ppaint', gk('dome', () => new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), Mx(bx, 1.44, z - 0.1, 0.11, 0.1, 0.11), { tint: i % 2 ? PAINT.dkgreen : [0.15, 0.18, 0.3] }); gg('pcopper', cylG(8), Mx(bx, 1.6, z - 0.1, 0.03, 0.12, 0.03)); }
    col(x - 0.65, 0, z - 0.35, x + 0.65, 1.5, z + 0.05);
  }
  function bench(x, z) {
    sb('wood', x - 1.0, 0.85, z - 0.4, x + 1.0, 0.92, z + 0.4, { uv: 1 });
    for (const dx of [-0.92, 0.92]) for (const dz of [-0.33, 0.33]) rod('prust', x + dx, 0, z + dz, x + dx, 0.85, z + dz, 0.025, 5);
    vb('prust', x - 0.95, 0.25, z - 0.36, x + 0.95, 0.27, z + 0.36, { uv: 1 });
    gg('pcast', boxG(), Mx(x + 0.7, 1.0, z, 0.16, 0.14, 0.24)); rod('prust', x + 0.7, 1.02, z - 0.2, x + 0.7, 1.02, z + 0.25, 0.012, 5);
    gg('ppaint', boxG(), Mx(x - 0.4, 1.02, z + 0.1, 0.5, 0.2, 0.25, 0, 0.2, 0), { tint: PAINT.red });
    col(x - 1.0, 0, z - 0.4, x + 1.0, 0.92, z + 0.4);
  }
  function scaffold(x, z) {
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.9, 0.9]) rod('prust', x + dx, 0, z + dz, x + dx, 5.8, z + dz, 0.024, 6);
    for (let y = 1.9; y < 5.9; y += 1.9) { for (const dz of [-0.9, 0.9]) rod('prust', x - 0.9, y, z + dz, x + 0.9, y, z + dz, 0.02, 5); for (const dx of [-0.9, 0.9]) rod('prust', x + dx, y, z - 0.9, x + dx, y, z + 0.9, 0.02, 5); }
    for (const dz of [-0.9, 0.9]) rod('prust', x - 0.9, 0.1, z + dz, x + 0.9, 1.9, z + dz, 0.018, 5);
    for (const y of [1.9, 3.8]) sb('woodDark', x - 0.85, y, z - 0.85, x + 0.85, y + 0.05, z + 0.85, { uv: 1 });
    col(x - 0.95, 0, z - 0.95, x + 0.95, 0.12, z + 0.95);
  }

  // ---------------------------------------------------------------- the marks of the years on the floors (no dice: by place)
  function grime(S) {
    const H0 = (k) => hsh(k * 1.37, 9.1, 71);
    // oil soaked into the hall's floor, scattered and under what leaked; rust run from the feet of the columns and posts; cracks; pools
    for (let i = 0; i < 110; i++) { const x = 1 + H0(i) * 64, z = 1 + hsh(i, 2, 72) * 90, sz = 0.7 + hsh(i, 3, 73) * 2.4; decal(0, x, 0.005, z, sz * (0.8 + hsh(i, 4, 74) * 0.6), sz, 'f', hsh(i, 5, 75) * 6.28); }
    for (const t of S.tables) { const xc = (t.x0 + t.x1) / 2; decal(0, xc, 0.006, t.z0 + 9.5, 3.4, 4.2, 'f', 0.3); decal(0, xc + 0.6, 0.006, t.z0 + 3.5, 2.2, 2.6, 'f', 1.1); for (const z of [t.z0 + 0.7, t.z0 + 5.6, t.z0 + 10.5, t.z0 + 15.4, t.z1 - 0.7]) for (const sx of [-1, 1]) if (hsh(xc + sx, z, 76) < 0.55) decal(1, xc + sx * 3.35 + sx * 0.25, 0.007, z + 0.2, 1.1, 1.5, 'f', sx > 0 ? -1.4 : 1.4); }
    for (let z = 3; z < D; z += 6) if (hsh(z, 1, 77) < 0.6) decal(1, 16.55, 0.007, z + 0.1, 0.9, 1.4, 'f', -1.57);
    for (let i = 0; i < 28; i++) decal(2, 2 + hsh(i, 6, 78) * 62, 0.008, 2 + hsh(i, 7, 79) * 88, 2 + hsh(i, 8, 80) * 2.5, 2 + hsh(i, 9, 81) * 2.5, 'f', hsh(i, 10, 82) * 6.28);
    // (the way in: soaked dark, the tracks of the trolleys and fork trucks running north, the slab's joints chipped)
    for (let i = 0; i < 26; i++) { const x = 30 + hsh(i, 30, 120) * 32, z = 77 + hsh(i, 31, 121) * 14; decal(0, x, 0.0055, z, 1.6 + hsh(i, 32, 122) * 3, 1.4 + hsh(i, 33, 123) * 2.6, 'f', hsh(i, 34, 124) * 6.28); }
    for (const [x, z, L] of [[43.2, 82, 14], [46.6, 81, 16], [38.5, 79, 9], [52.2, 80, 10]]) decal(6, x, 0.0058, z, 0.9, L, 'f', (hsh(x, z, 125) - 0.5) * 0.08);
    for (let x = 30; x <= 60; x += 6) for (let z = 78; z < D; z += 6) { if (hsh(x, z, 126) < 0.6) decal(2, x + (hsh(x, z, 127) - 0.5) * 3, 0.0062, z, 0.8, 1.6, 'f', 0); if (hsh(x, z, 128) < 0.5) decal(0, x, 0.006, z + (hsh(x, z, 129) - 0.5) * 4, 0.35, 1.2, 'f', 0); }
    for (const [x, z, s1] of [[37.5, 33, 3.2], [45, 64, 2.4], [20.5, 50, 2.8], [61, 70, 2], [27, 6, 2.6], [50, 9, 1.8], [12, 89.5, 2.2], [43.5, 78.5, 1.6]]) decal(4, x, 0.009, z, s1 * 1.3, s1, 'f', hsh(x, z, 83) * 3);
    // the old floor paint: green-grey along the aisles, worn through where the feet went
    const clearOf = (x0, z0, x1, z1) => ![...(S.trenches || []), ...S.zones.map((Z) => [Z.x0, Z.z0, Z.x1, Z.z1]), ...S.tables.map((t) => [t.x0 - 0.6, t.z0, t.x1 + 0.6, t.z1])].some((q) => q[0] < x1 + 0.2 && q[2] > x0 - 0.2 && q[1] < z1 + 0.2 && q[3] > z0 - 0.2);
    for (let i = 0; i < 26; i++) { const x = [21, 37.2, 44.8, 61][i % 4] + (hsh(i, 11, 84) - 0.5) * 1.2, z = 4 + hsh(i, 12, 85) * 84, wd = 1.6 + hsh(i, 13, 86) * 0.6, L = 3 + hsh(i, 14, 87) * 5; if (clearOf(x - wd / 2, z - L / 2, x + wd / 2, z + L / 2)) decal(3, x, 0.006, z, wd, L, 'f', 0); }
    // the mezzanine and the galleries' floors under them (oil, rust), the switch room's floor
    for (let i = 0; i < 14; i++) decal(i % 3 ? 0 : 2, 1 + hsh(i, 16, 89) * 14, ML + 0.006, 13 + hsh(i, 17, 90) * 70, 1 + hsh(i, 18, 91) * 2, 1 + hsh(i, 19, 92) * 2, 'f', hsh(i, 20, 93) * 6);
    for (let i = 0; i < 10; i++) decal(i % 2 ? 0 : 1, 1 + hsh(i, 21, 94) * 14, 0.01, 13 + hsh(i, 22, 95) * 70, 0.8 + hsh(i, 23, 96), 1 + hsh(i, 24, 97), 'f', hsh(i, 25, 98) * 6);
    // the yard: oil under the transformers and the breakers, pools in the gravel, rust from the gantries' feet
    for (const zc of TRANS) { decal(0, 72, 0.31, zc, 5, 6, 'f', 0.2); decal(0, 74.5, 0.31, zc + 1.5, 2.4, 3, 'f', 1); }
    for (const x of [74, 78, 82]) decal(0, x, 0.13, 50, 1.6, 2.4, 'f', 0.4);
    for (const [x, z, s1] of [[78, 26, 3], [84.5, 47, 2.4], [75, 62, 2], [70.5, 88, 2.6], [86, 12, 2]]) decal(4, x, 0.03, z, s1 * 1.3, s1, 'f', 0.7);
    for (const z of GANTRY) for (const x of [68.6, 87.4]) decal(1, x + 0.6, 0.31, z, 1.2, 1.6, 'f', -1.57);
  }

  // ---------------------------------------------------------------- the work left where it stopped, by the way in (the first thing you see)
  function entryWork(S) {
    // a turbine rotor taken out, on its two trestles: the rotor's body and blade rows, its journals and coupling; the trestles' V-blocks
    { const x0 = 47.6, x1 = 54.4, z = 81.4, y = 1.12;
      gg('pcast', cylG(24), rodM(x0 + 0.6, y, z, x1 - 0.6, y, z, 0.42), { su: 3, sv: 6 });
      for (let k = 0; k < 7; k++) { const x = x0 + 1.6 + k * 0.62, r = 0.5 + k * 0.06; gg('prust', cylG(24), rodM(x, y, z, x + 0.12, y, z, r), { su: 3, sv: 0.2 }); gg('pcast', cylG(24, true), rodM(x + 0.02, y, z, x + 0.1, y, z, r + 0.08), { su: 3, sv: 0.1, tint: [0.75, 0.72, 0.68] }); }
      gg('iron', cylG(14), rodM(x0, y, z, x1, y, z, 0.17), { su: 1, sv: 7 });
      gg('pcast', cylG(18), rodM(x1 - 0.1, y, z, x1 + 0.1, y, z, 0.36));
      for (const x of [x0 + 0.9, x1 - 0.9]) { vb('prust', x - 0.35, 0, z - 0.6, x + 0.35, 0.12, z + 0.6, { uv: 1 }); for (const dz of [-0.45, 0.45]) gg('prust', boxG(), memM(x, 0.1, z + dz, x, y - 0.1, z + dz * 0.4, 1, 0, 0, 0.1, 0.1), { su: 0.3, sv: 1 }); for (const dz of [-0.16, 0.16]) gg('woodDark', boxG(), Mx(x, y - 0.25, z + dz, 0.3, 0.14, 0.16, dz * 3.5, 0, 0)); }
      col(x0, 0, z - 0.65, x1 + 0.1, 1.6, z + 0.65); mark(x0 - 0.5, z - 1, x1 + 0.6, z + 1); sign(x0 + 1.0, 0.45, z + 0.6, 0, 1, 0.24, 2);
      decal(0, (x0 + x1) / 2, 0.007, z, 7.5, 2.4, 'f', 0); }
    // a pallet rack against the south wall: its frames, the orange beams, pallets and crates on the shelves, cartons
    { const x0 = 17.4, x1 = 24.6, z0 = 88.9, z1 = 90.9;
      for (const x of [x0, (x0 + x1) / 2, x1]) for (const z of [z0, z1]) { mem('ppaint', hsecG(0.09, 0.07, 0.006, 0.008), x, 0, z, x, 3.1, z, 1, 0, 0, { tint: [0.24, 0.32, 0.48], su: 0.3, sv: 3 }); }
      for (const x of [x0, (x0 + x1) / 2, x1]) for (let y = 0.4; y < 3; y += 0.5) gg('ppaint', boxG(), memM(x, y, z0, x, y + 0.5, z1, 1, 0, 0, 0.03, 0.03), { tint: [0.24, 0.32, 0.48] });
      for (const y of [0.15, 1.35, 2.55]) for (const z of [z0, z1]) vb('ppaint', x0, y, z - 0.05, x1, y + 0.11, z + 0.05, { uv: 1, tint: PAINT.yellow });
      for (const y of [0.26, 1.46, 2.66]) for (const x of [x0 + 0.1, (x0 + x1) / 2 + 0.1]) { if (hsh(x, y, 101) < 0.2) continue; vb('woodDark', x, y, z0 + 0.1, x + 3.3, y + 0.14, z1 - 0.1, { uv: 1 }); const h = 0.4 + hsh(x, y, 102) * 0.6; vb(hsh(x, y, 103) < 0.5 ? 'wood' : 'ppaint', x + 0.15, y + 0.14, z0 + 0.25, x + 1.5 + hsh(x, y, 104) * 1.5, y + 0.14 + h, z1 - 0.25, { uv: 1, tint: [0.62, 0.52, 0.38] }); }
      col(x0 - 0.05, 0, z0 - 0.06, x1 + 0.05, 3.1, z1 + 0.06); mark(x0 - 0.5, z0 - 0.5, x1 + 0.5, D); }
    // a row of small pumps on their skids against the south wall, their header along the floor on stools, valves on the branches
    { const z = 90.4;
      for (const x of [27.5, 31, 34.5]) { sb('prust', x - 0.45, 0, z - 0.7, x + 0.45, 0.15, z + 0.7, { uv: 1 }); gg('ppaint', cylG(14), rodM(x, 0.48, z - 0.6, x, 0.48, z + 0.05, 0.27), { tint: PAINT.mach2 }); gg('pcast', lathe('pumpcase', [[0.001, 0], [0.4, 0], [0.62, 0.12], [0.66, 0.4], [0.5, 0.62], [0.2, 0.7], [0.001, 0.7]], 18), Mx(x, 0.48, z + 0.1, 0.55, 0.55, 0.55, Math.PI / 2, 0, 0)); pipe([[x, 0.5, z + 0.5], [x, 0.5, z - 1.2]], 0.08, {}); valve(x, 0.5, z - 0.95, 0.09, 0, -1); col(x - 0.45, 0, z - 0.7, x + 0.45, 0.85, z + 0.7); }
      pipe([[25.8, 0.5, z - 1.25], [36.2, 0.5, z - 1.25], [36.2, 0.5, z - 0.2], [36.2, 2.8, z - 0.2]], 0.13, { fl: 1.8 }); for (const x of [26.5, 29.2, 32.7, 35.5]) vb('prust', x - 0.08, 0, z - 1.4, x + 0.08, 0.37, z - 1.1, { uv: 1 });
      col(25.8, 0, z - 1.42, 36.4, 0.66, z - 1.08); mark(25.5, z - 1.6, 36.6, D); }
    // a stack of pipe on timber bearers, ready to go in
    { const x0 = 25.6, x1 = 30.8, z = 84.3; for (const x of [x0 + 0.5, x1 - 0.5]) vb('woodDark', x - 0.08, 0, z - 0.75, x + 0.08, 0.12, z + 0.75, { uv: 1 }); for (let k = 0; k < 6; k++) { const row = k < 3 ? 0 : 1, zz = z - 0.32 + (k % 3) * 0.3 + row * 0.15, y = 0.12 + 0.14 + row * 0.26; if (row && k === 5) continue; gg('prust', cylG(12), rodM(x0, y, zz, x1, y, zz, 0.14), { su: 1, sv: 5 }); } col(x0, 0, z - 0.75, x1, 0.68, z + 0.75); mark(x0 - 0.3, z - 1, x1 + 0.3, z + 1); }
    // a hand trolley with a tool chest on it; another chest on the floor
    { const x = 37.4, z = 80.6; vb('prust', x - 0.65, 0.22, z - 0.38, x + 0.65, 0.28, z + 0.38, { uv: 1 }); for (const [dx, dz] of [[-0.5, -0.28], [0.5, -0.28], [-0.5, 0.28], [0.5, 0.28]]) gg('prub', cylG(10), rodM(x + dx, 0.08, z + dz - 0.03, x + dx, 0.08, z + dz + 0.03, 0.08)); rod('prust', x + 0.65, 0.28, z - 0.3, x + 0.65, 1.0, z - 0.3, 0.015, 5); rod('prust', x + 0.65, 0.28, z + 0.3, x + 0.65, 1.0, z + 0.3, 0.015, 5); rod('prust', x + 0.65, 1.0, z - 0.3, x + 0.65, 1.0, z + 0.3, 0.017, 5); bxr('ppaint', x - 0.15, 0.48, z, 0.7, 0.4, 0.4, 0.15, { tint: PAINT.red }); col(x - 0.65, 0, z - 0.4, x + 0.7, 0.7, z + 0.4); }
    bxr('ppaint', 64.2, 0.2, 84.6, 0.6, 0.4, 0.35, 0.6, { tint: PAINT.red });
    // a chain block hanging from the south gallery, its hook low; sheets of the roof come down, a cable fallen with them
    { const x = 43.8, z = 75; rod('prust', x, ML - 0.2, z, x, 2.9, z, 0.012, 4); bxr('ppaint', x, 2.7, z, 0.24, 0.36, 0.2, 0.3, { tint: PAINT.yellow }); rod('prust', x + 0.05, 2.5, z, x + 0.05, 1.3, z, 0.01, 4); gg('pcast', gk('hook', () => new THREE.TorusGeometry(0.22, 0.06, 8, 16, Math.PI * 1.4)), Mx(x + 0.05, 1.15, z, 0.6, 0.6, 0.6, 0, 0, -0.6)); }
    for (const [x, z, ry, rz] of [[41.2, 81.2, 0.4, 0.06], [35.9, 78.4, 1.9, 0.12], [50.3, 78.2, 2.6, 0.03]]) gg('pcorr', boxG(), Mx(x, 0.05 + rz * 0.6, z, 2.4, 0.02, 0.95, 0, ry, rz), { su: 2.4, sv: 1, tint: [0.62, 0.6, 0.58] });
    slack('prub', [39.5, 0.03, 80.6], [44.6, 0.03, 82.4], -0.02, 0.025);
    slack('prub', [38.4, RY - 2.4, 79.2], [39.2, 0.04, 80.2], -0.3, 0.025);
    for (const [x, z] of [[55.6, 80.4], [56.4, 81.1]]) P().barrel(w, x, z, 0, rng, false);
  }

  // ---------------------------------------------------------------- the lights: the hall's high lamps (some dead), over the galleries
  function lights(S) {
    // the hall's high lamps: mercury down the middle (blue-white), sodium over the rows (orange), some dead, some failing; dust under a few
    for (const x of [22, 41, 60]) for (const z of [6, 19, 32, 45, 58, 71, 84]) {
      if (Math.abs(z - S.zc) < 3.5) continue;
      const h = hsh(x, z, 91), over = x === 41 && z === 84, on = over || (x === 41 && z === 71) ? true : h < 0.18 ? false : h < 0.36 ? 'blink' : true, kind = over ? 'sod' : x === 41 ? 'hg' : 'sod';
      lamp(x, 12.9, z, RY - 2.4, on, { s: 1.4, I: over ? 22 : kind === 'hg' ? 16 : 19, R: over ? 30 : 28, prio: over ? 1.1 : 0.85, kind, cone: on === true && (over || hsh(x, z, 94) < 0.55) ? 12.4 : 0 });
    }
    for (const z of [16, 38, 62]) { rod('prust', BX, ML + 3.0, z, BX - 1.6, ML + 3.0, z, 0.03, 6); rod('prust', BX, ML + 2.3, z, BX - 1.0, ML + 3.0, z, 0.02, 5); const h = hsh(z, 1, 92); lamp(BX - 1.6, ML + 2.6, z, ML + 3.0, h < 0.25 ? false : h < 0.45 ? 'blink' : true, { s: 0.6, I: 5, R: 11, prio: 0.6, kind: 'inc', cone: 2.4 }); }
    for (const x of [24, 48]) { rod('prust', x, ML, 73.62, x, ML + 3.1, 73.62, 0.035, 6); rod('prust', x, ML + 3.0, 73.62, x, ML + 3.0, 75, 0.025, 5); lamp(x, ML + 2.6, 75, ML + 3.0, hsh(x, 2, 93) < 0.3 ? 'blink' : true, { s: 0.6, I: 5, R: 11, prio: 0.6, kind: 'sod' }); }
    for (const [x, z, c, I] of [[8, 8, '#9fb4d6', 3.2], [8, 88, '#ff9646', 3.5], [41, 88, '#ffd2a0', 3.0], [41, 4, '#9fb4d6', 3.0], [24, 46, '#ff9646', 3.0], [58, 46, '#9fb4d6', 3.0]]) w.addLight(x, 3.5, z, { flame: 0, emit: false, steady: true, intensity: I, range: 13, color: c, prio: 0.45 });
    // the red emergency lamps by the ways out and the doors
    for (const [x, y, z, fx, fz] of [[13.5, 3.4, 0.08, 0, 1], [52, 3.4, 0.08, 0, 1], [31, 3.4, D - 0.08, 0, -1], [BX - 0.08, 3.6, 49.5, -1, 0], [BX - 0.08, 3.0, 2.6, -1, 0], [SR.x1 - 0.08, 2.9, 47.5, -1, 0], [0.62, 2.9, 24, 1, 0]]) redLamp(x, y, z, fx, fz);
    // the switch room's few live panel lamps cast a little green
    for (const [x, z] of [[6.0, 30], [10, 58], [2.0, 70]]) w.addLight(x, 1.9, z, { flame: 0, emit: false, steady: true, intensity: 1.1, range: 4, color: '#7dffa0', prio: 0.4 });
  }

  // ---------------------------------------------------------------- the rooms of this field (the merchant's hall and the rest): a bay of
  // the hall - the concrete floor, brick between steel pilasters, the high windows, the crane's runway and a parked bridge over it, pipes
  // and cable trays along the walls, lamps. Nothing live here
  function plantShell(w0, rng0, RW, RD, o) {
    w = w0; plantMats(w);
    const keep = (x, z, r) => !(o.keep || []).some(([x0, z0, x1, z1]) => x + r > x0 && x - r < x1 && z + r > z0 && z - r < z1);
    H.floors(w, RW, RD, null, 'pconc');
    for (let x = 0; x < RW; x += 6) for (let z = 0; z < RD; z += 6) { const k = hsh(x, z, 1); vb('pconc', x, -0.01, z, Math.min(RW, x + 6), 0.004, Math.min(RD, z + 6), { uv: 4, grad: false, tint: [0.52 + k * 0.1, 0.5 + k * 0.1, 0.47 + k * 0.09], skip: { bottom: true }, uo: k * 3.1 }); }
    H.perimeter(w, rng0, RW, RD, { gates: o.gates, h: 8, walls: false, beams: 0, stub: 1 });
    const gx = LG.gateXs(RW, o.gates || 1), top = 14;
    const saveRY = RY; void saveRY;
    shellWall(true, 0, -1, -0.6, RW + 0.6, gx.map((g) => [g - 3.5, g + 3.5, -1, 8]), top);
    shellWall(true, RD, 1, -0.6, RW + 0.6, [[RW / 2 - 5.6, RW / 2 + 5.6, -1, 8]], top);
    shellWall(false, 0, -1, 0, RD, [], top); shellWall(false, RW, 1, 0, RD, [], top);
    { const c = w.addCollider(-3, top, -3, RW + 3, top + 1.5, RD + 3, { surf: 'metal' }); c.vis = true; }
    vb('pcorr', -0.6, top + 0.25, -0.6, RW + 0.6, top + 0.3, RD + 0.6, { uv: 1, grad: false, skip: { top: true }, tint: [0.42, 0.42, 0.42] });
    for (let z = 6; z < RD - 1; z += 6) truss(0, RW, z, top - 2.0, top);
    // the crane's runways along both sides and its bridge parked over the middle
    for (const x of [1.2, RW - 1.2]) { mem('prust', hsecG(0.8, 0.36, 0.016, 0.03), x, 9.4, 0.3, x, 9.4, RD - 0.3, 0, 1, 0, { su: 1, sv: RD }); }
    for (const dz of [-1, 1]) mem('ppaint', hsecG(1.2, 0.6, 0.02, 0.03), 1.6, 10.4, RD / 2 + dz, RW - 1.6, 10.4, RD / 2 + dz, 0, 1, 0, { tint: PAINT.yellow, su: 1, sv: 10 });
    for (const x of [1.2, RW - 1.2]) vb('ppaint', x - 0.5, 9.8, RD / 2 - 1.5, x + 0.5, 10.8, RD / 2 + 1.5, { uv: 1, tint: PAINT.yellow });
    // pipes and cable trays along the side walls, a valve and a gauge where they turn down; switchboards against the walls where the room leaves room
    for (const [x, s] of [[0.5, 1], [RW - 0.5, -1]]) {
      pipe([[x, 4.8, 1], [x, 4.8, RD - 1]], 0.2, { lag: true }); pipe([[x + s * 0.1, 4.2, 1], [x + s * 0.1, 4.2, RD - 1]], 0.12, { fl: 2.4 });
      vb('prust', x - 0.3 + s * 0.3, 5.4, 0.5, x + 0.3 + s * 0.3, 5.43, RD - 0.5, { uv: 1 }); for (let k = 0; k < 4; k++) rod('prub', x + s * 0.3 - 0.2 + k * 0.13, 5.48, 0.5, x + s * 0.3 - 0.2 + k * 0.13, 5.48, RD - 0.5, 0.03, 6);
      for (let z = 4; z < RD - 3; z += 9) { if (!keep(x + s * 0.8, z, 1.2)) continue; boardRow(s > 0 ? 0.02 : RW - 0.62, s > 0 ? 0.62 : RW - 0.02, z - 1.2, z + 1.2, [s > 0 ? 'E' : 'W']); }
    }
    for (const x of [RW * 0.3, RW * 0.7]) for (const z of [RD * 0.3, RD * 0.7]) lamp(x, 9.0, z, top - 2.0, true, { s: 1.3, I: 9, R: 20, prio: 0.9 });
    for (const [x, z] of [[2.4, 2.4], [RW - 2.4, 2.4], [2.4, RD - 2.4], [RW - 2.4, RD - 2.4]]) if (keep(x, z, 1) && G.Props) P().barrel(w, x, z, 0, rng0, false);
    flushDecals(w);
    w = null;
  }
  function shellWall(alongX, plane, out, a0, a1, holes, top) {
    const P2 = (a, y, d) => (alongX ? [a, y, plane + out * d] : [plane + out * d, y, a]);
    const rs0 = [[a0, a1, 1.15, top + 1]];
    let rs = rs0; for (const h of holes) { const nx = []; for (const r of rs) { if (h[0] >= r[1] || h[1] <= r[0] || h[2] >= r[3] || h[3] <= r[2]) { nx.push(r); continue; } if (h[0] > r[0]) nx.push([r[0], h[0], r[2], r[3]]); if (h[1] < r[1]) nx.push([h[1], r[1], r[2], r[3]]); const xa = Math.max(r[0], h[0]), xb = Math.min(r[1], h[1]); if (h[3] < r[3]) nx.push([xa, xb, h[3], r[3]]); } rs = nx; }
    for (const r of rs) { const p = P2(r[0], r[2], 0), q = P2(r[1], r[3], 0.6); sb('wall', p[0], p[1], p[2], q[0], q[1], q[2], { uv: 2.5 }); }
    let ps = [[a0, a1]]; for (const h of holes) { const nx = []; for (const [p, q] of ps) { if (h[0] >= q || h[1] <= p) { nx.push([p, q]); continue; } if (h[0] > p) nx.push([p, h[0]]); if (h[1] < q) nx.push([h[1], q]); } ps = nx; }
    for (const [p, q] of ps) { const A = P2(p, 0, -0.08), B = P2(q, 1.15, 0.6); sb('pconc', A[0], 0, A[2], B[0], 1.15, B[2], { uv: 3, tint: [0.76, 0.74, 0.7] }); }
    for (let p = Math.ceil((a0 + 1) / 6) * 6; p < a1 - 1; p += 6) { if (holes.some((h) => h[0] - 0.3 < p && h[1] + 0.3 > p)) continue; const A = P2(p, 0, -0.2); mem('prust', hsecG(0.4, 0.3, 0.014, 0.02), A[0], 0, A[2], A[0], top, A[2], alongX ? 0 : 1, 0, alongX ? 1 : 0, { su: 1, sv: top }); const c0 = P2(p - 0.18, 0, -0.42), c1 = P2(p + 0.18, top, 0); col(Math.min(c0[0], c1[0]), 0, Math.min(c0[2], c1[2]), Math.max(c0[0], c1[0]), top, Math.max(c0[2], c1[2])); }
  }
  // ---- the lamps of a works where the other builders would set a torch or a brazier (the gates' tunnels, the rooms, the guardian's
  // hall): while a world of this field is built, G.Props.torch and .brazier draw these instead. A wall lamp (its plate, the bent arm,
  // the enamelled shade, the conduit down the wall), a caged lamp on a post; their light the bulb's, steady (no flame, no sparks)
  function elTorch(w0, x, y, z, dir, noLight) {
    const sw = w; w = w0; try {
      plantMats(w0);
      const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir] || [0, 1], ry = Math.atan2(d[0], d[1]);
      bxr('prust', x + d[0] * 0.02, y + 0.5, z + d[1] * 0.02, 0.22, 0.3, 0.04, ry);
      rod('prust', x + d[0] * 0.03, y + 0.58, z + d[1] * 0.03, x + d[0] * 0.42, y + 0.72, z + d[1] * 0.42, 0.018, 5);
      rod('prust', x + d[0] * 0.42, y + 0.72, z + d[1] * 0.42, x + d[0] * 0.5, y + 0.6, z + d[1] * 0.5, 0.014, 5);
      gg('ppaint', shadeG(), Mx(x + d[0] * 0.5, y + 0.38, z + d[1] * 0.5, 0.55, 0.55, 0.55), { tint: PAINT.dkgreen });
      w0.visual('glow', x + d[0] * 0.5 - 0.04, y + 0.39, z + d[1] * 0.5 - 0.04, x + d[0] * 0.5 + 0.04, y + 0.46, z + d[1] * 0.5 + 0.04, { uv: 1, grad: false, tint: [1, 0.86, 0.62] });
      rod('prust', x + d[0] * 0.025, y + 0.35, z + d[1] * 0.025, x + d[0] * 0.025, y - 1.4, z + d[1] * 0.025, 0.016, 5);
      if (!noLight) w0.addLight(x + d[0] * 0.75, y + 0.2, z + d[1] * 0.75, { flame: 0, emit: false, steady: true, intensity: 7, range: 12, color: '#ffd2a0', elecLamp: true });
    } finally { w = sw; }
  }
  // (a chandelier of candles: a works' pendant lamp instead)
  function elChandelier(w0, x, y, z, top) { const sw = w; w = w0; try { plantMats(w0); lamp(x, y + 1.2, z, top, true, { s: 1.3, I: 10, R: 16, kind: 'inc', prio: 1.2 }); } finally { w = sw; } }
  function elBrazier(w0, x, y, z, s, collide) {
    const sw = w; w = w0; try {
      plantMats(w0); s = s || 1;
      const h = 1.35 * s;
      gg('prust', hsecG(0.12, 0.1, 0.008, 0.01), memM(x, y, z, x, y + h, z, 1, 0, 0), { su: 0.3, sv: h });
      w0.visual('prust', x - 0.16, y, z - 0.16, x + 0.16, y + 0.02, z + 0.16, { uv: 1, grad: false });
      gg('pcast', cylG(12), Mx(x, y + h + 0.03, z, 0.12, 0.06, 0.12));
      gg('glow', cylG(10), Mx(x, y + h + 0.17, z, 0.08, 0.22, 0.08), { tint: [1, 0.84, 0.58] });
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4; rod('prust', x + Math.cos(a) * 0.1, y + h + 0.05, z + Math.sin(a) * 0.1, x + Math.cos(a) * 0.1, y + h + 0.3, z + Math.sin(a) * 0.1, 0.006, 4); }
      gg('pcast', cylG(12), Mx(x, y + h + 0.32, z, 0.13, 0.05, 0.13));
      if (collide) { const c = w0.addCollider(x - 0.12, y, z - 0.12, x + 0.12, y + h + 0.35, z + 0.12, { surf: 'metal' }); c.vis = true; }
      w0.addLight(x, y + h + 0.6, z, { flame: 0, emit: false, steady: true, intensity: 7 * s, range: 12, color: '#ffd2a0', elecLamp: true });
    } finally { w = sw; }
  }
  // ---- the barrels of the works: steel drums. The game's barrel is made as ever (its health, what it drops, whether it blows up: props.js
  // P.barrel), then its wooden look is taken back and a drum drawn in its place: the rolled rims, the two rolling hoops, the lid's two
  // bungs, dents, the paint worn and run with oil; the ones that blow up red with a yellow band and the warning plate. A drum broken:
  // steel shards (combat.js breakDestructible, wrapped below), a crushed drum and its oil left on the floor
  const DRUM_R = 0.34, DRUM_H = 1.06;
  const drumGeo = () => GC.drumGeo || (GC.drumGeo = (() => { const pts = [[0.001, 0.0], [DRUM_R - 0.02, 0.0], [DRUM_R + 0.012, 0.012], [DRUM_R + 0.012, 0.035], [DRUM_R, 0.045]]; for (const h of [DRUM_H / 3, DRUM_H * 2 / 3]) pts.push([DRUM_R, h - 0.04], [DRUM_R + 0.016, h - 0.015], [DRUM_R + 0.016, h + 0.015], [DRUM_R, h + 0.04]); pts.push([DRUM_R, DRUM_H - 0.045], [DRUM_R + 0.012, DRUM_H - 0.035], [DRUM_R + 0.012, DRUM_H - 0.012], [DRUM_R - 0.02, DRUM_H], [DRUM_R - 0.03, DRUM_H - 0.012], [0.001, DRUM_H - 0.012]); return G.GFX.Geo.lathe(pts, 22); })());
  const DRUM_COL = [[0.4, 0.48, 0.4], [0.16, 0.16, 0.15], [0.5, 0.36, 0.24], [0.32, 0.36, 0.4]];
  function drumMesh(w0, x, y, z, explosive, k) {
    const M = w0.mats, g = new THREE.Group(), tint = explosive ? [0.62, 0.12, 0.08] : DRUM_COL[k % DRUM_COL.length], rusty = !explosive && k % 4 === 2;
    const body = new THREE.Mesh(drumGeo(), rusty ? M.prust : (GC['drumM' + tint.join()] || (GC['drumM' + tint.join()] = (() => { const m = M.ppaint.clone(); m.color.setRGB(tint[0] * 1.05, tint[1] * 1.05, tint[2] * 1.05); return m; })())));
    g.add(body);
    for (const [bx, bz, r] of [[0.17, 0.06, 0.045], [-0.15, -0.1, 0.03]]) { const b = new THREE.Mesh(cylG(10), M.pcast); b.scale.set(r, 0.025, r); b.position.set(bx, DRUM_H - 0.0, bz); g.add(b); }
    if (explosive) {
      const band = new THREE.Mesh(cylG(22, true), GC.drumBand || (GC.drumBand = (() => { const m = M.ppaint.clone(); m.color.setRGB(1.1, 0.85, 0.2); return m; })())); band.scale.set(DRUM_R + 0.004, 0.12, DRUM_R + 0.004); band.position.y = DRUM_H / 2; g.add(band);
      const pl = new THREE.Mesh(gk('signq0', () => { const g2 = new THREE.PlaneGeometry(1, 1); const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.012 + uv.getX(i) * 0.476, 0.512 + uv.getY(i) * 0.476); return g2; }), M.psign); pl.scale.set(0.24, 0.24, 1); pl.position.set(0, DRUM_H * 0.76, DRUM_R + 0.006); g.add(pl);
    }
    // (oil run down its side from the bungs)
    const run = new THREE.Mesh(gk('drumRun', () => { const g2 = new THREE.PlaneGeometry(1, 1); const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + uv.getX(i) * 0.25, uv.getY(i) * 0.5); return g2; }), GC.decalMat || (GC.decalMat = new THREE.MeshStandardMaterial({ map: decalTex(), transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })));
    run.scale.set(0.3, 0.7, 1); run.position.set(0, DRUM_H - 0.38, DRUM_R + 0.012); run.rotation.y = 0.6 + k; run.position.set(Math.sin(0.6 + k) * (DRUM_R + 0.012), DRUM_H - 0.38, Math.cos(0.6 + k) * (DRUM_R + 0.012)); g.add(run);
    // (dented: squeezed a little out of round, leaning a hair)
    const dn = hsh(x, z, 131); g.scale.set(1 + (dn - 0.5) * 0.05, 1, 1 - (dn - 0.5) * 0.06); g.rotation.set((hsh(x, z, 132) - 0.5) * 0.04, hsh(x, z, 133) * 6.28, (hsh(x, z, 134) - 0.5) * 0.04);
    g.position.set(x, y, z);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = o !== run; o.receiveShadow = true; } });
    return g;
  }
  function elBarrel(w0, x, z, y, rng0, explosive) {
    const n0 = w0.deferred.length, d = PR0.barrel(w0, x, z, y, rng0, explosive);
    w0.deferred.splice(n0);   // (the wooden barrel's own drawing, not wanted here)
    plantMats(w0); hookBreak();
    const k = Math.floor(hsh(x, z, 130) * 8);
    w0.deferred.push((grp) => { const g = drumMesh(w0, x, y, z, explosive, k); grp.add(g); d.mesh = g; });
    d.plantDrum = true; d.mat = 'metal'; d.surf = 'metal'; if (d.col) d.col.surf = 'metal';
    // (what any screen that sees it broken leaves: its shards in steel, and the crushed drum with its oil - drumRemains)
    d.shards = 'prust'; d.remains = drumRemains;
    return d;
  }
  // (a drum broken: the shards in steel - the world's wooden material swapped for the call only - then the crushed drum and its oil left)
  const hookBreak = () => {
    const C = G.combat; if (!C || !C.breakDestructible || C.breakDestructible._plant) return;
    const b0 = C.breakDestructible;
    C.breakDestructible = function (d) {
      if (!d || !d.plantDrum || !d.alive || !G.world) return b0.apply(this, arguments);
      const M = G.world.mats, own = Object.prototype.hasOwnProperty.call(M, 'wood'), wd = M.wood;
      M.wood = M.prust || wd;
      try { b0.apply(this, arguments); } finally { if (own) M.wood = wd; else delete M.wood; }
      drumRemains(d);
    };
    C.breakDestructible._plant = true;
  };
  // (the crushed drum, its lid knocked off and its oil, left on the floor where the drum stood)
  function drumRemains(d) {
      if (!d || !G.world) return;
      const M = G.world.mats;
      try {
        const g = new THREE.Group(), body = new THREE.Mesh(drumGeo(), M.prust); g.name = 'drumRemains'; body.scale.set(1.15, 0.3, 0.8); body.rotation.set(0.5, Math.random() * 6, 0.25); body.position.y = 0.12; g.add(body);
        const lid = new THREE.Mesh(cylG(16), M.pcast); lid.scale.set(DRUM_R, 0.02, DRUM_R); lid.position.set(0.6, 0.02, -0.3); lid.rotation.set(0.1, 0, 0.12); g.add(lid);
        const oil = new THREE.Mesh(gk('oilQuad', () => { const g2 = new THREE.PlaneGeometry(1, 1); g2.rotateX(-Math.PI / 2); const uv = g2.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.25, 0.5 + uv.getY(i) * 0.5); return g2; }), GC.oilMat || (GC.oilMat = (() => { const m = GC.decalMat.clone(); m.opacity = 0.55; m.color.setRGB(0.7, 0.68, 0.66); return m; })())); oil.scale.set(1.8, 1, 1.5); oil.position.y = 0.01; g.add(oil);
        g.position.set(d.pos.x, d.col ? d.col.y0 : d.pos.y - 0.5, d.pos.z); g.traverse((o) => { if (o.isMesh) { o.castShadow = o !== oil; o.receiveShadow = true; } });
        G.world.group.add(g);
      } catch (e) { /* (the remains are only looks) */ }
  }
  const PR0 = {};
  const withLamps = (fn) => { const PR = G.Props, t0 = PR.torch, b0 = PR.brazier, c0 = PR.chandelier, br0 = PR.barrel, bn0 = PR.banner; PR0.barrel = br0; PR.torch = elTorch; PR.brazier = elBrazier; PR.chandelier = elChandelier; PR.barrel = elBarrel; PR.banner = elBanner; try { return fn(); } finally { PR.torch = t0; PR.brazier = b0; PR.chandelier = c0; PR.barrel = br0; PR.banner = bn0; } };
  // (a cloth banner: a works has none - a warning plate on the wall where it would hang)
  function elBanner(w0, x, y, z, dir) { const sw = w; w = w0; try { plantMats(w0); const d = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] }[dir] || [0, 1]; sign(x + d[0] * 0.02, Math.min(y - 1.2, 3.2), z + d[1] * 0.02, d[0], d[1], 0.55, 1); } finally { w = sw; } }
  // ---- the stone of the shared halls (the merchant's hall's stalls and altar, the rooms, the guardian's hall and its road) in this
  // field: dressed stone, flags and setts are drawn as cast concrete, the brick stays brick. A table of materials of the world's own
  function concreteHalls(w0) {
    if (!w0 || !w0.mats || w0.mats._plantHall) return;
    const M = plantMats(w0), base = w0.mats, o = Object.create(base), vc = Object.assign({}, base.vc);
    const cc = (k, t) => { const m = M.vc.pconc.clone(); m.color.setRGB(t[0], t[1], t[2]); return m; };
    vc.block = cc('block', [0.78, 0.76, 0.72]); vc.trim = cc('trim', [0.86, 0.84, 0.8]); vc.floor = cc('floor', [0.6, 0.58, 0.55]); vc.cobble = cc('cobble', [0.56, 0.54, 0.51]);
    o.vc = vc; o._plantHall = true; w0.mats = o;
  }
  // (lights the builders set down bare with a flame on them - the guardian's road's door lamps: the bulb's steady light, a wall lamp drawn
  // a little behind it)
  const unflame = (ww) => { if (!ww || !ww.lightSources) return ww; for (const s2 of ww.lightSources.slice()) if (s2.flame > 0 && s2.intensity > 0 && !s2.fp && !s2.elecLamp) { s2.flame = 0; s2.emit = false; s2.steady = true; s2.color = '#ffd2a0'; s2.elecLamp = true; elTorch(ww, s2.pos.x, s2.pos.y - 0.7, s2.pos.z - 0.9, 'pz', true); } return ww; };
  F.gen.plant = (...a) => withLamps(() => genPlant(...a));
  // (the rooms' hook, field_rooms.js LG.shellFor: this field's shell for a world of this field, the others' as they were)
  const hookShell = () => {
    // (the merchant's hall, the rooms, the guardian's hall of this field: built with the lamps above in place of torches and braziers)
    for (const k of ['shop', 'room', 'boss']) { const f0 = LG[k]; if (!f0 || f0._plant) continue; LG[k] = function (area, ...r) { return G.Tex && G.Tex.biomeFor && G.Tex.biomeFor(area) === 'plant' ? withLamps(() => { const ww = unflame(f0.call(this, area, ...r)); concreteHalls(ww); return ww; }) : f0.call(this, area, ...r); }; LG[k]._plant = true; }
    hookBreak();
    if (!LG.shellFor || LG.shellFor._plant) return;
    const base = LG.shellFor;
    LG.shellFor = (w0) => (w0 && w0.biome === 'plant' ? plantShell : base(w0));
    LG.shellFor._plant = true;
  };
  hookShell();
  // ---- the guardian's way in and hall (fieldgen.js LG.boss: F.SHELL[field]): the shared road and arena, the same shapes and the same
  // boxes; on them the works' things - pipes and lagged mains along the road's walls on brackets, cable trays over them, the steel
  // door's frame, wall lamps, the floor's marks; over the arena a roof of trusses; switchboards and a transformer cage by its walls
  F.SHELL.plant = Object.assign({}, F.SHELL.hall, {
    road(w0, rng0, RW, AD, RD) {
      const nook = FB.roadHall(w0, rng0, RW, AD, RD, false), cx = RW / 2, sw = w; w = w0;
      try {
        plantMats(w0);
        for (const sx of [-1, 1]) {
          const x = cx + sx * 5.6;
          for (const [y, r, lag] of [[4.6, 0.22, true], [5.15, 0.13, false], [9.5, 0.28, true]]) pipe([[x - sx * r * 1.4, y, AD + 3.6], [x - sx * r * 1.4, y, RD - 0.6]], r, { lag, fl: lag ? 0 : 3.2 });
          for (let z = AD + 5; z < RD - 1; z += 3) { vb('prust', x - sx * 0.7, 4.25, z - 0.04, x + sx * 0.3, 4.32, z + 0.04, { uv: 1 }); vb('prust', x - sx * 0.8, 9.1, z - 0.04, x + sx * 0.3, 9.17, z + 0.04, { uv: 1 }); }
          const tx = x - sx * 0.85;
          vb('prust', tx - 0.3, 6.2, AD + 4, tx + 0.3, 6.215, RD - 1, { uv: 1, grad: false }); for (const e of [-0.3, 0.3]) vb('prust', tx + e - 0.012, 6.2, AD + 4, tx + e + 0.012, 6.32, RD - 1, { uv: 1, grad: false });
          for (let k = 0; k < 5; k++) rod('prub', tx - 0.22 + k * 0.11, 6.26, AD + 4, tx - 0.22 + k * 0.11, 6.26, RD - 1, 0.035, 6);
          for (let z = AD + 6; z < RD - 1; z += 4.5) vb('prust', Math.min(tx - 0.32, x), 6.12, z - 0.03, Math.max(tx + 0.32, x), 6.2, z + 0.03, { uv: 1 });
        }
        for (let z = AD + 8; z < RD - 2; z += 7) { decal(0, cx + (hsh(z, 1, 141) - 0.5) * 6, 0.006, z, 2 + hsh(z, 2, 142) * 2, 2 + hsh(z, 3, 143) * 2, 'f', hsh(z, 4, 144) * 6); decal(2, cx + (hsh(z, 5, 145) - 0.5) * 8, 0.007, z + 3, 2.5, 2.5, 'f', hsh(z, 6, 146) * 6); }
        for (const x of [cx - 4.2, cx + 4.2]) for (let z = AD + 6; z < RD - 2; z += 1.1) { if (hsh(x, z, 147) < 0.35) continue; vb('ppaint', x - 0.05, 0.0, z, x + 0.05, 0.003, z + 0.8, { uv: 1, grad: false, tint: [0.62, 0.5, 0.16], skip: { bottom: true, px: true, nx: true, pz: true, nz: true } }); }
        // (the door into the hall: a steel frame round the opening, its warning plates)
        const gz1 = AD + 3;
        for (const sx of [-1, 1]) { mem('prust', hsecG(0.3, 0.3, 0.014, 0.02), cx + sx * 3.35, 0, gz1 + 0.35, cx + sx * 3.35, 8.4, gz1 + 0.35, 1, 0, 0, { su: 1, sv: 8 }); sign(cx + sx * 4.6, 2.0, gz1 + 0.32, 0, 1, 0.5, sx > 0 ? 1 : 0); }
        mem('prust', hsecG(0.4, 0.3, 0.014, 0.02), cx - 3.6, 8.3, gz1 + 0.35, cx + 3.6, 8.3, gz1 + 0.35, 0, 1, 0, { su: 1, sv: 7 });
        flushDecals(w0);
      } finally { w = sw; }
      return nook;
    },
    ring(w0, rng0, RW, AD) {
      F.ceiling(w0, rng0, 0, 0, RW, AD, 24, { chandeliers: 0 });
      const sw = w; w = w0;
      try { plantMats(w0); for (let z = 8; z < AD - 4; z += 8) truss(0, RW, z, 21.4, 23.9); for (const x of [RW * 0.3, RW * 0.5, RW * 0.7]) for (const z of [AD * 0.25, AD * 0.5, AD * 0.75]) lamp(x, 19.5, z, 21.4, true, { s: 1.5, I: 14, R: 30, kind: x === RW * 0.5 ? 'hg' : 'sod', prio: 1.0 }); }
      finally { w = sw; }
    },
    dress(w0, rng0, RW, AD) {
      const sw = w; w = w0;
      try { plantMats(w0); for (const [x, s2] of [[0.5, 1], [RW - 0.5, -1]]) { pipe([[x + s2 * 0.1, 6.2, 2], [x + s2 * 0.1, 6.2, AD - 2]], 0.24, { lag: true }); pipe([[x + s2 * 0.15, 6.8, 2], [x + s2 * 0.15, 6.8, AD - 2]], 0.14, { fl: 3 }); } flushDecals(w0); }
      finally { w = sw; }
    },
    text: { sub: '— 発電所の奥へ —', icon: '⚡', obj: '配管の続く通路を進め — 扉をくぐると戦いが始まる' },
  });
  F._plant = { hookShell, mats: plantMats, PROF };
})();
