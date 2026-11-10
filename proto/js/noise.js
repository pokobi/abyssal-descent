'use strict';
// Tileable noise for the texture baker (GLSL). Every function takes a period, so a texture built from them repeats without a seam.
window.P = window.P || {};
window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message))); { const ce = console.error; console.error = function () { window.__errs.push(Array.from(arguments).map(String).join(' ').slice(0, 1500)); ce.apply(console, arguments); }; }
P.NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p, float per, float seed){
  vec2 i = floor(p), f = fract(p); f = f * f * f * (f * (f * 6. - 15.) + 10.);
  vec2 s = vec2(seed * 13.7, seed * 5.3);
  float a = hash12(mod(i, per) + s), b = hash12(mod(i + vec2(1., 0.), per) + s), c = hash12(mod(i + vec2(0., 1.), per) + s), d = hash12(mod(i + vec2(1., 1.), per) + s);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 uv, float per, float seed){
  float a = .5, s = 0., n = 0.;
  for (int i = 0; i < 7; i++) { s += a * vnoise(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; }
  return s / n;
}
float fbm3(vec2 uv, float per, float seed){
  float a = .5, s = 0., n = 0.;
  for (int i = 0; i < 3; i++) { s += a * vnoise(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; }
  return s / n;
}
// the same, with its own period on each axis (grain that is fine one way and long the other)
float vnA(vec2 p, vec2 per, float seed){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); vec2 s = vec2(seed * 13.7, seed * 5.3);
  float a = hash12(mod(i, per) + s), b = hash12(mod(i + vec2(1., 0.), per) + s), c = hash12(mod(i + vec2(0., 1.), per) + s), d = hash12(mod(i + vec2(1., 1.), per) + s);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbmA(vec2 uv, vec2 per, float seed){ float a = .5, s = 0., n = 0.; for (int i = 0; i < 5; i++) { s += a * vnA(uv * per, per, seed + float(i) * 7.); n += a; a *= .5; per *= 2.; } return s / n; }
// ridged noise: thin bright lines (cracks, veins)
float ridge(vec2 uv, float per, float seed){
  float a = .5, s = 0., n = 0.;
  for (int i = 0; i < 5; i++) { float v = 1. - abs(vnoise(uv * per, per, seed + float(i) * 3.) * 2. - 1.); s += a * v * v; n += a; a *= .5; per *= 2.; }
  return s / n;
}
// cells: x = distance to the nearest point, y = to the second nearest, z = an id of the nearest
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
`;
