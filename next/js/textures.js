'use strict';
// Procedural PBR-ish textures (albedo + normal) generated on startup. Neutral grey stone is tinted per biome.
(function () {
  const T = (G.Tex = {});
  function ihash(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, p, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
    const a = ihash(x0, y0, s), b = ihash(x1, y0, s), c = ihash(x0, y1, s), d = ihash(x1, y1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(u, v, p, s, oct) {
    let a = 0, amp = 0.5, f = 1, n = 0;
    for (let i = 0; i < (oct || 4); i++) { a += amp * vnoise(u * p * f, v * p * f, p * f, s + i * 31); n += amp; amp *= 0.5; f *= 2; }
    return a / n;
  }
  T.fbm = fbm; T.ihash = ihash;
  // tileable worley: returns [F1, F2, id]
  function worley(u, v, n, s) {
    const x = u * n, y = v * n;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j;
      const wx = ((cx % n) + n) % n, wy = ((cy % n) + n) % n;
      const px = cx + 0.15 + 0.7 * ihash(wx, wy, s), py = cy + 0.15 + 0.7 * ihash(wx, wy, s + 7);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) { f2 = f1; f1 = d; id = wx * 131 + wy; } else if (d < f2) f2 = d;
    }
    return [f1, f2, id];
  }
  function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  T.hexRGB = hexRGB;

  // build albedo + normal DataTextures from a per-pixel function
  function gen(size, fn, opts) {
    opts = opts || {};
    const col = new Uint8Array(size * size * 4);
    const hgt = new Float32Array(size * size);
    const out = { r: 0, g: 0, b: 0, h: 0 };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out);
      const i = y * size + x;
      col[i * 4] = Math.max(0, Math.min(255, out.r * 255));
      col[i * 4 + 1] = Math.max(0, Math.min(255, out.g * 255));
      col[i * 4 + 2] = Math.max(0, Math.min(255, out.b * 255));
      col[i * 4 + 3] = 255;
      hgt[i] = out.h;
    }
    const nor = new Uint8Array(size * size * 4);
    const str = opts.normal || 2.5;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = hgt[y * size + ((x - 1 + size) % size)], r = hgt[y * size + ((x + 1) % size)];
      const u = hgt[((y - 1 + size) % size) * size + x], d = hgt[((y + 1) % size) * size + x];
      let nx = (l - r) * str, ny = (d - u) * str, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      nor[i] = (nx * 0.5 + 0.5) * 255; nor[i + 1] = (ny * 0.5 + 0.5) * 255; nor[i + 2] = (nz * 0.5 + 0.5) * 255; nor[i + 3] = 255;
    }
    const mk = (data, srgb) => {
      const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true; t.anisotropy = 8;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { map: mk(col, true), normalMap: mk(nor, false) };
  }

  // ---- generators ----
  function bricks(o) {
    const rows = o.rows, s = o.seed;
    return (u, v, out) => {
      const ry = v * rows, row = Math.floor(ry);
      const off = (row % 2) * 0.5 * (o.stagger ?? 1);
      const cols = o.cols;
      let rx = u * cols + off;
      // random widths for flagstones
      let col = Math.floor(rx), fx = rx - col, fy = ry - row;
      if (o.irregular) {
        const sub = ihash(((col % cols) + cols) % cols, row, s + 3) < 0.4;
        if (sub) { const half = fx < 0.5; col = col * 2 + (half ? 0 : 1); fx = half ? fx * 2 : (fx - 0.5) * 2; }
      }
      const id = ihash(((col % (cols * 2)) + cols * 2) % (cols * 2), row % rows, s);
      const mw = o.mortar; // mortar width in brick-space
      const ex = Math.min(fx, 1 - fx) * (o.aspect || 2), ey = Math.min(fy, 1 - fy);
      const edge = Math.min(ex, ey);
      const n = fbm(u, v, 8, s + 1, 5);
      const chip = fbm(u, v, 24, s + 2, 3);
      let h;
      if (edge < mw + (chip - 0.5) * 0.05) { h = 0.1 + n * 0.1; }
      else h = 0.55 + Math.min(1, (edge - mw) * 9) * 0.3 + (n - 0.5) * 0.35 + (id - 0.5) * 0.1;
      const isM = h < 0.3;
      const tint = 0.78 + id * 0.32;
      const dirt = fbm(u, v, 3, s + 9, 3);
      let c = isM ? 0.32 + n * 0.12 : (0.5 + n * 0.5) * tint * (0.82 + chip * 0.25);
      c *= 0.85 + dirt * 0.3;
      c *= 0.55 + Math.min(1, h) * 0.55; // baked AO
      // warm/cool variation
      const w = (ihash(col & 63, row, s + 5) - 0.5) * 0.08;
      out.r = c * (1 + w); out.g = c; out.b = c * (1 - w * 1.2);
      // stains/moss in mortar lines
      if (o.moss && isM && fbm(u, v, 6, s + 11, 3) > 0.55) { out.r *= 0.7; out.g *= 0.95; out.b *= 0.6; }
      out.h = h;
    };
  }
  function cobble(o) {
    return (u, v, out) => {
      const [f1, f2, id] = worley(u, v, o.n, o.seed);
      const e = f2 - f1;
      const n = fbm(u, v, 10, o.seed + 1, 4);
      const t = ihash(id, 0, o.seed + 2);
      let h = e < 0.06 ? 0.05 + n * 0.1 : Math.min(1, 0.4 + e * 1.6) + (n - 0.5) * 0.3;
      let c = e < 0.06 ? 0.25 + n * 0.1 : (0.45 + n * 0.45) * (0.75 + t * 0.4);
      c *= 0.6 + Math.min(1, h) * 0.45;
      out.r = c * 1.02; out.g = c; out.b = c * 0.97; out.h = h;
    };
  }
  function rock(o) {
    return (u, v, out) => {
      const n = fbm(u, v, 4, o.seed, 6);
      const r = 1 - Math.abs(fbm(u, v, 6, o.seed + 3, 5) * 2 - 1);
      const h = n * 0.6 + r * 0.6;
      const c = 0.35 + n * 0.5 + r * 0.15;
      out.r = c * 1.03; out.g = c; out.b = c * 0.95; out.h = h;
    };
  }
  function smooth(o) {
    return (u, v, out) => {
      const n = fbm(u, v, 6, o.seed, 5), sp = ihash(Math.floor(u * 512), Math.floor(v * 512), o.seed);
      const big = fbm(u, v, 2, o.seed + 1, 3);
      // faint block seams
      const seam = (Math.min(u * 2 % 1, 1 - u * 2 % 1) < 0.006 || Math.min(v * 2 % 1, 1 - v * 2 % 1) < 0.006) ? 0.6 : 1;
      const c = (0.62 + n * 0.25 + (sp - 0.5) * 0.06) * (0.85 + big * 0.25) * seam;
      out.r = c * 1.02; out.g = c; out.b = c * 0.96; out.h = n * 0.5 + (seam < 1 ? -0.3 : 0);
    };
  }
  function planks(o) {
    return (u, v, out) => {
      const n = o.n; const px = u * n, pi = Math.floor(px), fx = px - pi;
      const off = ihash(pi, 0, o.seed);
      const pv = (v + off) % 1;
      const seg = Math.floor(pv * 2), fy = pv * 2 - seg;
      const gap = fx < 0.03 || fx > 0.97 || fy < 0.008;
      const grain = Math.sin((fx * 6 + fbm(u, pv, 6, o.seed + pi, 4) * 8) * 6.28) * 0.5 + 0.5;
      const t = 0.75 + ihash(pi, seg, o.seed + 1) * 0.35;
      const knot = fbm(u, v, 12, o.seed + 9, 3);
      let c = gap ? 0.15 : (0.42 + grain * 0.18 + knot * 0.12) * t;
      // nails
      const nail = (Math.abs(fx - 0.5) < 0.05 && (Math.abs(fy - 0.06) < 0.012 || Math.abs(fy - 0.94) < 0.012));
      if (nail) c = 0.22;
      out.r = c * 1.0; out.g = c * 0.8; out.b = c * 0.62;
      out.h = gap ? 0 : 0.6 + grain * 0.1 - (nail ? 0.2 : 0);
    };
  }
  function metal(o) {
    return (u, v, out) => {
      const n = fbm(u, v, 8, o.seed, 5);
      const rust = fbm(u, v, 4, o.seed + 5, 4);
      const scratch = Math.abs(Math.sin((u * 40 + fbm(u, v, 3, o.seed + 2, 2) * 20) * 3.14)) > 0.995 ? 0.15 : 0;
      let r = 0.3 + n * 0.15 + scratch, g = r, b = r * 1.05;
      if (rust > 0.58) { const k = Math.min(1, (rust - 0.58) * 6); r = U.lerp(r, 0.42, k); g = U.lerp(g, 0.24, k); b = U.lerp(b, 0.12, k); }
      out.r = r; out.g = g; out.b = b; out.h = n * 0.3 + (rust > 0.6 ? 0.2 : 0);
    };
  }
  function cloth(o) {
    return (u, v, out) => {
      const weave = (Math.sin(u * 512 * 1.6) * Math.sin(v * 512 * 1.6)) * 0.06;
      const n = fbm(u, v, 6, o.seed, 4);
      let c = 0.75 + n * 0.25 + weave;
      // emblem: circle + chevron
      const dx = u - 0.5, dy = v - 0.42; const r = Math.hypot(dx, dy * 0.8);
      let emb = 0;
      if (r < 0.2 && r > 0.17) emb = 1;
      if (Math.abs(dx) < 0.03 && Math.abs(dy) < 0.15) emb = 1;
      if (Math.abs(Math.abs(dx) - (dy + 0.1) * 0.6) < 0.025 && dy > -0.1 && dy < 0.12) emb = 1;
      // border & tattered bottom edge
      if (u < 0.05 || u > 0.95) emb = 1;
      const tear = v > 0.9 + fbm(u, 0, 12, o.seed + 1, 2) * 0.1;
      out.r = emb ? 0.85 : c; out.g = emb ? 0.7 : c; out.b = emb ? 0.4 : c;
      if (emb) { out.r *= 0.9 + n * 0.1; }
      if (tear) { out.r = out.g = out.b = 0; }
      out.h = n * 0.3 + weave;
    };
  }
  function skin(o) {
    return (u, v, out) => {
      const [f1, f2] = worley(u, v, o.n, o.seed);
      const e = f2 - f1;
      const n = fbm(u, v, 8, o.seed + 1, 4);
      const h = Math.min(1, e * 2.5) * 0.6 + n * 0.4;
      const c = 0.55 + h * 0.4 + (n - 0.5) * 0.2;
      out.r = c; out.g = c; out.b = c; out.h = h;
    };
  }

  function grass(o) {
    return (u, v, out) => {
      const n = fbm(u, v, 8, o.seed, 5), m = fbm(u, v, 3, o.seed + 3, 3);
      const blade = Math.abs(Math.sin((u * 140 + fbm(u, v, 20, o.seed + 7, 2) * 14) * 3.14)) * Math.abs(Math.sin((v * 90 + n * 9) * 3.14));
      const dry = m > 0.58 ? (m - 0.58) * 2.4 : 0;
      const dirt = fbm(u, v, 5, o.seed + 9, 4) > 0.66;
      let r = 0.28 + n * 0.22 + blade * 0.12 + dry * 0.35, g = 0.42 + n * 0.3 + blade * 0.18 + dry * 0.15, b = 0.16 + n * 0.12;
      if (dirt) { r = 0.42 + n * 0.2; g = 0.34 + n * 0.16; b = 0.24 + n * 0.1; }
      out.r = r; out.g = g; out.b = b; out.h = dirt ? 0.2 + n * 0.2 : 0.4 + blade * 0.4 + n * 0.2;
    };
  }
  function marble(o) {
    return (u, v, out) => {
      const n = fbm(u, v, 3, o.seed, 6);
      const vein = Math.abs(Math.sin((u * 6 + v * 3 + n * 8) * 3.14));
      const v2 = Math.pow(1 - vein, 14);
      const seam = (Math.min(u * 2 % 1, 1 - u * 2 % 1) < 0.004 || Math.min(v * 2 % 1, 1 - v * 2 % 1) < 0.004) ? 0.75 : 1;
      const c = (0.86 + n * 0.12 - v2 * 0.35) * seam;
      out.r = c * 0.99; out.g = c * 0.98; out.b = c; out.h = 0.5 + n * 0.1 - v2 * 0.2 - (seam < 1 ? 0.3 : 0);
    };
  }

  // sprite textures (canvas) for particles & decals
  function canvasTex(size, draw, srgb) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); draw(g, size);
    const t = new THREE.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  T.canvasTex = canvasTex;

  T.init = function (progress) {
    const S = 512;
    const tasks = [
      ['bricks', () => gen(S, bricks({ rows: 8, cols: 4, mortar: 0.05, seed: 11, moss: true }), { normal: 3 })],
      ['ashlar', () => gen(S, bricks({ rows: 4, cols: 2, mortar: 0.025, seed: 23, aspect: 2 }), { normal: 3 })],
      ['flag', () => gen(S, bricks({ rows: 4, cols: 3, mortar: 0.03, seed: 37, irregular: true, aspect: 1.4, stagger: 0.6 }), { normal: 2.5 })],
      ['cobble', () => gen(S, cobble({ n: 7, seed: 41 }), { normal: 3 })],
      ['smooth', () => gen(S, smooth({ seed: 53 }), { normal: 1.5 })],
      ['rock', () => gen(S, rock({ seed: 61 }), { normal: 4 })],
      ['planks', () => gen(S, planks({ n: 5, seed: 71 }), { normal: 2 })],
      ['metal', () => gen(256, metal({ seed: 83 }), { normal: 1.5 })],
      ['cloth', () => gen(256, cloth({ seed: 91 }), { normal: 1 })],
      ['skin', () => gen(256, skin({ n: 10, seed: 101 }), { normal: 2.5 })],
      ['scales', () => gen(256, skin({ n: 18, seed: 107 }), { normal: 3 })],
      ['grass', () => gen(S, grass({ seed: 131 }), { normal: 2.5 })],
      ['marble', () => gen(S, marble({ seed: 141 }), { normal: 1.2 })],
    ];
    T.tex = {};
    let i = 0;
    return new Promise((resolve) => {
      const step = () => {
        if (i >= tasks.length) { makeSprites(); resolve(); return; }
        const [k, f] = tasks[i++];
        T.tex[k] = f();
        progress && progress(i / tasks.length, k);
        setTimeout(step, 0);
      };
      step();
    });
  };

  // a picture made a pixel at a time: fn(u, v, out) writes red, green, blue and alpha (0..1) for the point u, v (0..1, v downward)
  function pixTex(size, fn, srgb) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), im = g.createImageData(size, size), d = im.data, o = [0, 0, 0, 0];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      o[0] = o[1] = o[2] = o[3] = 0; fn((x + 0.5) / size, (y + 0.5) / size, o);
      const i = (y * size + x) * 4; d[i] = o[0] * 255; d[i + 1] = o[1] * 255; d[i + 2] = o[2] * 255; d[i + 3] = o[3] * 255;
    }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  // (noise for those pictures: the same every time)
  const _h2 = (x, y, s) => { const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return n - Math.floor(n); };
  const _vn = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), a = _h2(xi, yi, s), b = _h2(xi + 1, yi, s), c = _h2(xi, yi + 1, s), d = _h2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const _fb = (x, y, s, n) => { let v = 0, a = 0.5, t = 0; for (let i = 0; i < (n || 4); i++) { v += a * _vn(x, y, s + i * 13); t += a; x = x * 2.03 + 5.1; y = y * 2.03 + 1.7; a *= 0.5; } return v / t; };
  const _ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  T.pixTex = pixTex; T.pn = { h2: _h2, vn: _vn, fb: _fb, ss: _ss };
  function makeSprites() {
    T.spr = {};
    T.spr.soft = canvasTex(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false);
    // ---- (the pictures of smoke, flame and of the marks things leave: made a pixel at a time, so that they have a shape. Smoke and
    // flame are sheets of four, of which each particle is one; a particle's top is the bottom of its cell here)
    const cell4 = (u, v) => { const cx = u < 0.5 ? 0 : 1, cy = v < 0.5 ? 0 : 1; return [cx + cy * 2, (u * 2 - cx) * 2 - 1, (v * 2 - cy) * 2 - 1]; };
    T.spr.smoke = pixTex(256, (u, v, o) => {
      const [k, x, y] = cell4(u, v);
      const n = _fb(x * 3 + k * 7, y * 3, 5, 4), n2 = _fb(x * 7 - k * 3, y * 7 + k, 6, 3), wx = x + (n - 0.5) * 0.22, wy = y + (n2 - 0.5) * 0.22;   // (the puffs are not round: the place is bent by noise)
      let dens = 0, shA = 0, wA = 0;                                       // (a heap of soft swells, each a little lighter on one side)
      for (let i = 0; i < 13; i++) {
        const a = _h2(i, k, 1) * 6.283, d = Math.sqrt(_h2(i, k, 2)) * 0.44, r = 0.2 + _h2(i, k, 3) * 0.27;
        const dx = (wx - Math.cos(a) * d) / r, dy = (wy - Math.sin(a) * d) / r, q = dx * dx + dy * dy; if (q >= 1) continue;
        const h = Math.pow(1 - q, 0.85); dens = 1 - (1 - dens) * (1 - h * 0.78); shA += (0.5 + dy * 0.5) * h * h; wA += h * h;
      }
      const sh = wA > 0 ? shA / wA : 0.5, edge = _ss(0.97, 0.55, Math.hypot(x, y) + (n - 0.5) * 0.3);
      const c = Math.min(1, Math.max(0, 0.5 + (sh - 0.5) * 0.7 + (n2 - 0.5) * 0.5));
      o[0] = o[1] = o[2] = 0.58 + 0.42 * c; o[3] = Math.min(1, Math.pow(dens, 1.35) * (0.42 + 0.7 * n2) * edge * 0.95);
    }, false);
    T.spr.flame = pixTex(256, (u, v, o) => {
      const [k, x, y] = cell4(u, v), h = (y + 1) / 2;                      // (h: 0 at its root, 1 at its tip)
      // (not a drop of flame with a clean edge: the place is bent more and more toward the tip, so that it leans and forks, and noise
      // running upward tears it, most at the tip and the sides)
      // three tongues of unequal height from one root, each wandering more the higher it goes; uneven within
      let I = 0;
      for (let j = 0; j < 3; j++) {
        const top = 0.56 + _h2(j, k, 3) * 0.42; if (h >= top) continue;
        const t = h / top, cx = (j - 1) * 0.2 * (1 - 0.6 * t) + (_fb(h * 2.4 + j * 7 + k * 3, j * 5 + k, 7, 3) - 0.5) * 1.1 * h;
        const w = (0.34 - 0.08 * (j % 2)) * Math.pow(1 - t, 0.8) * (0.3 + 0.7 * Math.min(1, t * 5)), d = Math.abs(x - cx) / Math.max(0.001, w);
        if (d < 1) I = Math.max(I, (1 - d * d) * (1 - Math.pow(t, 2.4)));
      }
      I = Math.max(0, I * (0.5 + 0.95 * _fb(x * 5 + k * 3, h * 6 - k * 2, 11, 4)) - 0.04) * _ss(0, 0.06, h);
      I = Math.min(1, I * 1.15);
      o[0] = 0.62 + 0.38 * _ss(0, 0.3, I); o[1] = 0.1 + 0.88 * _ss(0.12, 0.8, I); o[2] = 0.02 + 0.85 * _ss(0.55, 1, I); o[3] = _ss(0, 0.62, I);   // (white at its heart, yellow, orange, dull red where it is thinnest)
    }, false);
    // a bullet's mark in stone: the hole, the crater broken out around it (lighter where the break is fresh), cracks, and soot
    const holePic = (kind) => pixTex(128, (u, v, o) => {
      const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x), ca = Math.cos(a), sa = Math.sin(a);
      const rin = 0.11 + _fb(ca * 1.6 + 3, sa * 1.6 + 3, 21, 3) * 0.07;
      let al = 0.4 * _ss(0.95, 0.2, r) * (0.55 + 0.7 * _fb(x * 3, y * 3, 25, 3)), cr = 0.02, cg = 0.018, cb = 0.016;   // soot
      if (kind === 'stone') {
        const rcr = 0.36 + (_fb(ca * 2.5 + 9, sa * 2.5 + 9, 23, 3) - 0.5) * 0.34;
        if (r < rcr) { const t = r / rcr, f = 0.045 + 0.08 * _fb(x * 9, y * 9, 27, 3) + 0.07 * t * t + (y / rcr) * 0.02, k = _ss(1, 0.84, t); al += (0.92 - al) * k; cr += (f - cr) * k; cg += (f * 0.93 - cg) * k; cb += (f * 0.84 - cb) * k; }
        for (let i = 0; i < 5; i++) {
          const c0 = _h2(i, 1, 31) * 6.283, len = 0.5 + _h2(i, 2, 31) * 0.42; let da = a - c0; da = Math.atan2(Math.sin(da), Math.cos(da));
          const dd = Math.abs(da + (_vn(r * 6, i * 3, 33) - 0.5) * 0.4) * r;
          if (r > rin && r < len && dd < 0.013 * (1 - r / len) + 0.005) { al = Math.max(al, 0.75 * (1 - r / len) + 0.15); cr *= 0.25; cg *= 0.25; cb *= 0.25; }
        }
      } else if (kind === 'metal') {
        // a dent, its lip turned up bright on the side the light is, and scores thrown outward
        const rd = 0.25 + (_fb(ca * 2 + 7, sa * 2 + 7, 61, 3) - 0.5) * 0.08;
        if (r < rd * 1.3) { const k = _ss(rd * 1.3, rd * 1.05, r); al += (0.9 - al) * k; cr = cg = cb = 0.05; }
        const lip = Math.exp(-Math.pow((r - rd) / 0.035, 2)), lit = 0.16 + 0.42 * Math.max(0, sa * 0.8 + 0.3) + 0.12 * _vn(a * 5, 3, 63);
        al = Math.max(al, lip * 0.95); cr += (lit - cr) * lip; cg += (lit * 0.98 - cg) * lip; cb += (lit - cb) * lip;
        for (let i = 0; i < 7; i++) {
          const c0 = _h2(i, 1, 65) * 6.283, len = 0.45 + _h2(i, 2, 65) * 0.4; let da = a - c0; da = Math.atan2(Math.sin(da), Math.cos(da));
          if (r > rd * 1.2 && r < len && Math.abs(da) * r < 0.006) { const k = 0.6 * (1 - r / len); al = Math.max(al, k); cr = cg = cb = 0.34; }
        }
      } else {
        // in wood: split along the grain, pale splinters at the lips of the split
        const gx = x, gy = y * 0.42, gr = Math.hypot(gx, gy), rs2 = 0.2 + (_fb(x * 5, y * 1.5, 71, 3) - 0.5) * 0.12;
        if (gr < rs2 * 1.5) { const k = _ss(rs2 * 1.5, rs2, gr), f = 0.3 + 0.25 * _vn(x * 30, y * 3, 73); al += (0.9 - al) * k; cr += (f - cr) * k; cg += (f * 0.72 - cg) * k; cb += (f * 0.45 - cb) * k; }
        if (gr < rs2 * 0.8) { const k = _ss(rs2 * 0.8, rs2 * 0.5, gr); cr *= 1 - k * 0.8; cg *= 1 - k * 0.8; cb *= 1 - k * 0.8; }
        if (Math.abs(x) < 0.012 + 0.01 * _vn(y * 9, 1, 75) && Math.abs(y) < 0.78) { al = Math.max(al, 0.8 * (1 - Math.abs(y) / 0.78)); cr *= 0.3; cg *= 0.3; cb *= 0.3; }
      }
      if (r < rin * 1.3) { const k = _ss(rin * 1.3, rin * 0.8, r); al += (1 - al) * k; cr *= 1 - k; cg *= 1 - k; cb *= 1 - k; }   // the hole itself
      o[0] = cr; o[1] = cg; o[2] = cb; o[3] = Math.min(1, al);
    });
    T.spr.hole = holePic('stone'); T.spr.holeM = holePic('metal'); T.spr.holeW = holePic('wood');
    // where fire stood: black at its heart, thrown outward in streaks, its edge nowhere a circle
    T.spr.scorch = pixTex(128, (u, v, o) => {
      const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x), ca = Math.cos(a), sa = Math.sin(a);
      const reach = 0.42 + _fb(ca * 3 + 5, sa * 3 + 5, 41, 4) * 0.55, fine = _vn(ca * 9 + 20, sa * 9 + 20, 43);
      let al = _ss(reach, reach * 0.2, r) * 0.85 + 0.34 * _ss(reach * 1.3, reach * 0.5, r) * fine;
      al *= (0.7 + 0.45 * _fb(x * 5, y * 5, 45, 3)) * _ss(1, 0.82, r);
      o[0] = 0.014; o[1] = 0.012; o[2] = 0.01; o[3] = Math.min(0.9, al);
    });
    // what is spilt where a thing is struck: a pool, runs thrown out of it each ending in a bead, and spots
    T.spr.splat = pixTex(128, (u, v, o) => {
      const x = u * 2 - 1, y = v * 2 - 1, r = Math.hypot(x, y), a = Math.atan2(y, x), ca = Math.cos(a), sa = Math.sin(a);
      const rb = 0.24 + _fb(ca * 2 + 4, sa * 2 + 4, 51, 3) * 0.24;
      let al = _ss(rb, rb * 0.8, r);
      for (let i = 0; i < 10; i++) {                                        // (runs: wide where they leave the pool, thin at their ends, none straight)
        const len = 0.34 + _h2(i, 2, 51) * 0.5, c0 = i / 10 * 6.283 + (_h2(i, 1, 51) - 0.5) * 0.8 + (r / len - 0.5) * (_h2(i, 7, 51) - 0.5) * 0.5; let da = a - c0; da = Math.atan2(Math.sin(da), Math.cos(da));
        const along = r * Math.cos(da), across = Math.abs(r * Math.sin(da)), t = along / len;
        if (along > 0 && t < 1) { const wd = 0.008 + 0.06 * Math.pow(1 - t, 1.8); al = Math.max(al, _ss(wd, wd * 0.6, across)); }
        const e0 = i / 10 * 6.283 + (_h2(i, 1, 51) - 0.5) * 0.8 + 0.5 * (_h2(i, 7, 51) - 0.5) * 0.5, bd = Math.hypot(x - Math.cos(e0) * len, y - Math.sin(e0) * len), br = 0.014 + _h2(i, 3, 51) * 0.02; al = Math.max(al, _ss(br, br * 0.65, bd));
      }
      for (let i = 0; i < 22; i++) { const pa = _h2(i, 4, 53) * 6.283, pq = 0.35 + _h2(i, 5, 53) * 0.58, pr = (0.008 + _h2(i, 6, 53) * 0.022) * (1.3 - pq), pd = Math.hypot(x - Math.cos(pa) * pq, y - Math.sin(pa) * pq * 0.9); al = Math.max(al, _ss(pr, pr * 0.6, pd)); }
      const c = 0.72 + 0.28 * _fb(x * 4, y * 4, 55, 3);
      o[0] = o[1] = o[2] = c; o[3] = al * 0.95;
    });
    // the soot a brand leaves on the wall it hangs on: black behind the flame, drawn upward and thinning
    T.spr.soot = pixTex(128, (u, v, o) => {
      const x = u * 2 - 1, y = 1 - v * 2, h = Math.min(1, Math.max(0, (y + 0.75) / 1.75)), n = _fb(x * 3, y * 3, 91, 4);
      const core = 0.36 + 0.16 * h, a = _ss(core + 0.62, core - 0.04, Math.abs(x) + (n - 0.5) * 0.55) * _ss(-1, -0.6, y + (n - 0.5) * 0.2) * _ss(1, 0.1, y + (n - 0.5) * 0.3);   // (dark outright behind the flame and above it, thinning to nothing over a long way)
      o[0] = o[1] = o[2] = 1; o[3] = Math.min(0.97, a * (0.85 + 0.3 * n) * 1.12);
    }, false);
    T.spr.ring = canvasTex(256, (g, s) => {
      g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = s * 0.04;
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.46, 0, 6.28); g.stroke();
      const gr = g.createRadialGradient(s / 2, s / 2, s * 0.2, s / 2, s / 2, s * 0.48);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.35)');
      g.fillStyle = gr; g.beginPath(); g.arc(s / 2, s / 2, s * 0.46, 0, 6.28); g.fill();
    }, false);
    T.spr.disc = canvasTex(128, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.85, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false);
    T.spr.web = canvasTex(256, (g, s) => {
      g.strokeStyle = 'rgba(230,230,230,0.55)'; g.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3); g.stroke(); }
      for (let r = 20; r < s * 1.3; r += 18 + Math.random() * 10) { g.beginPath(); for (let i = 0; i <= 9; i++) { const a = (i / 9) * Math.PI / 2; const rr = r * (0.92 + Math.random() * 0.08); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    });
    T.spr.crack = canvasTex(128, (g, s) => {
      g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 2;
      for (let i = 0; i < 7; i++) { let x = s / 2, y = s / 2; let a = Math.random() * 6.28; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 6; j++) { a += (Math.random() - 0.5) * 1.2; x += Math.cos(a) * s * 0.08; y += Math.sin(a) * s * 0.08; g.lineTo(x, y); } g.stroke(); }
    });
    T.spr.lightshaft = canvasTex(64, (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      const g2 = g.createLinearGradient(0, 0, s, 0);
      g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = g2; g.fillRect(0, 0, s, s);
    }, false);
    T.spr.cloud = canvasTex(256, (g, s) => {
      for (let i = 0; i < 40; i++) { const x = s * (0.2 + Math.random() * 0.6), y = s * (0.3 + Math.random() * 0.4), r = s * (0.08 + Math.random() * 0.18); const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
    }, false);
    T.spr.portal = canvasTex(256, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,230,190,1)'); gr.addColorStop(0.3, 'rgba(240,170,90,0.6)'); gr.addColorStop(0.7, 'rgba(90,50,20,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }, false);
  }

  // emoji/icon sprite for 3D labels (shop)
  const iconCache = {};
  T.iconTex = function (icon, color) {
    const key = icon + color;
    if (iconCache[key]) return iconCache[key];
    const t = canvasTex(128, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, color + 'aa'); gr.addColorStop(0.6, color + '33'); gr.addColorStop(1, color + '00');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      g.font = (s * 0.55) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const key = G.Icons && G.Icons.split(String(icon)).find((q) => typeof q !== 'string');
      if (key) G.Icons.drawIcon(g, key.key, s * 0.18, s * 0.18, s * 0.64); else g.fillText(icon, s / 2, s / 2 + s * 0.04);
    });
    iconCache[key] = t;
    return t;
  };
  T.textTex = function (text, opts) {
    opts = opts || {};
    const w = opts.w || 256, h = opts.h || 64;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, w, h); }
    g.font = (opts.weight || 900) + ' ' + (opts.size || 34) + 'px "Noto Sans JP","Segoe UI Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.fillStyle = opts.color || '#f1d79b';
    (G.Icons ? G.Icons.fillText : (g2, t2, x2, y2, o2) => { if (o2 && o2.stroke) g2.strokeText(t2, x2, y2); g2.fillText(t2, x2, y2); })(g, text, w / 2, h / 2, { stroke: true });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  // ---- biomes ----
  T.BIOMES = {
    catacombs: { name: '地下墓所', stone: '#b3a998', stone2: '#958b7c', floor: '#9b917f', trim: '#c2b8a6', rock: '#7a7266', wood: '#8a7a68', fog: '#16120f', fogD: 0.02, hemiS: '#6f6b78', hemiG: '#2c241c', amb: 0.32, moon: '#a8b8d8', moonI: 0.75, torch: '#ff9446', cloth: '#7a2020', accent: 'bones' },
    flooded: { name: '水没回廊', stone: '#93a08f', stone2: '#7c8a7a', floor: '#86917f', trim: '#a8b4a2', rock: '#66705f', wood: '#8a7a68', fog: '#0f1714', fogD: 0.024, hemiS: '#5f7a78', hemiG: '#1c2620', amb: 0.3, moon: '#a0c8c8', moonI: 0.7, torch: '#ffa055', cloth: '#1f3f62', accent: 'water' },
    forge: { name: '溶鉱の深層', stone: '#75696a', stone2: '#5f5454', floor: '#6e6260', trim: '#867a78', rock: '#4f4646', wood: '#8a7a68', fog: '#1d0f0a', fogD: 0.02, hemiS: '#6a4a40', hemiG: '#3a1a0c', amb: 0.34, moon: '#ffb080', moonI: 0.45, torch: '#ff7a30', cloth: '#7a2a10', accent: 'lava' },
    frozen: { name: '凍てつく霊廟', stone: '#b4bec8', stone2: '#9aa6b2', floor: '#bac4cc', trim: '#ccd6de', rock: '#8a96a2', wood: '#8a7a68', fog: '#111820', fogD: 0.022, hemiS: '#8aa0bc', hemiG: '#202836', amb: 0.36, moon: '#c0d8ff', moonI: 0.85, torch: '#ffaa66', cloth: '#26386a', accent: 'ice' },
    temple: { name: '沈んだ神殿', stone: '#c9b28a', stone2: '#b39b74', floor: '#bea683', trim: '#d8c49e', rock: '#9a8466', wood: '#8a7a68', fog: '#19130c', fogD: 0.02, hemiS: '#7a7060', hemiG: '#2e2416', amb: 0.34, moon: '#ffd8a8', moonI: 0.65, torch: '#ffa040', cloth: '#2f5a26', accent: 'vines' },
  };
  T.BIOMES.ruins = { name: '黄昏の廃都', stone: '#c4b29a', stone2: '#ab9a82', floor: '#6e7a4c', trim: '#d2c2a6', rock: '#8a8070', wood: '#8a7a68', fog: '#c8987a', fogD: 0.0065, hemiS: '#a8b4d4', hemiG: '#5a4a34', amb: 0.78, moon: '#ffc48a', moonI: 2.6, torch: '#ffa050', cloth: '#6a2a20', accent: 'grass', outdoor: 'ruins', floorTex: 'grass', sky: ['#2c3a6a', '#d88a62', '#f4c690'], sunDir: [-0.6, 0.35, -0.7] };
  T.BIOMES.sky = { name: '天空の聖域', stone: '#ece6dc', stone2: '#ddd6ca', floor: '#e8e2d8', trim: '#e2bf6a', rock: '#b8ae9e', wood: '#9a8a70', fog: '#bcd4ee', fogD: 0.0048, hemiS: '#dce8ff', hemiG: '#9a9080', amb: 0.8, moon: '#fff2dc', moonI: 3.2, torch: '#ffd090', cloth: '#2a4a8a', accent: 'clouds', outdoor: 'sky', marble: true, sky: ['#2f62b4', '#9cc4f0', '#eef4ff'], sunDir: [0.4, 0.8, -0.3] };
  // v2.0 deep stages
  T.BIOMES.void = { name: '虚空の淵', stone: '#3a3448', stone2: '#2e2a3a', floor: '#2a2636', trim: '#8a6ae0', rock: '#2a2434', wood: '#4a3a5a', fog: '#140a24', fogD: 0.006, hemiS: '#8a7ad0', hemiG: '#1a1028', amb: 0.7, moon: '#c0a8ff', moonI: 2.2, torch: '#b080ff', cloth: '#3a1a6a', accent: 'clouds', outdoor: 'sky', sky: ['#020008', '#120626', '#2a1048'], sunDir: [-0.3, 0.55, -0.8], sunCol: [0.75, 0.6, 1.0], stars: true, cloudCol: 0x6a4aa0, isletGrass: 0x4a3a7a, leaf: 0x6a4aa0 };
  T.BIOMES.bloodmoon = { name: '血月の古城', stone: '#5a4a48', stone2: '#4a3c3a', floor: '#3a2a22', trim: '#8a6a5a', rock: '#3a2a2a', wood: '#4a3028', fog: '#3a0c10', fogD: 0.0075, hemiS: '#c08080', hemiG: '#2a0a08', amb: 0.62, moon: '#ff6a50', moonI: 2.4, torch: '#ff7040', cloth: '#5a0a0a', accent: 'grass', outdoor: 'ruins', floorTex: 'grass', grassTint: '#7a5a48', sky: ['#0a0206', '#3a0610', '#8a1a14'], sunDir: [0.5, 0.42, -0.75], sunCol: [1.0, 0.25, 0.15], stars: true, mtnCol: 0x3a1a20, leaf: 0x4a1a14 };
  // v3: the last stage before the Abyss King (areas 46-50 of every cycle)
  T.BIOMES.abyss = { name: '奈落の王城', stone: '#4a4452', stone2: '#3a3442', floor: '#34303c', trim: '#b89a5a', rock: '#2a2430', wood: '#3a2a30', fog: '#0d0714', fogD: 0.017, hemiS: '#7a6a9a', hemiG: '#1a1020', amb: 0.42, moon: '#c090ff', moonI: 0.95, torch: '#c070ff', cloth: '#3a0a4a', accent: 'abyss' };
  // ten stages x five areas = one 50-area cycle (a boss closes every stage, the Abyss King closes the cycle)
  T.BIOME_ORDER = ['catacombs', 'ruins', 'sky', 'flooded', 'forge', 'frozen', 'temple', 'void', 'bloodmoon', 'abyss'];
  // ---- the four fields of a run (see runplan.js) ----
  // 1: outdoors at night in a graveyard
  T.BIOMES.grave = { name: '月影の墓苑', stone: '#8e8a86', stone2: '#77736e', floor: '#3e4a34', trim: '#a8a29a', rock: '#5e5a56', wood: '#5a4a3a', fog: '#1a2232', fogD: 0.011, hemiS: '#6a7ea8', hemiG: '#1a1a14', amb: 0.5, moon: '#b8ccff', moonI: 1.6, torch: '#ffb066', cloth: '#3a2a4a', accent: 'grass', outdoor: 'ruins', floorTex: 'grass', grassTint: '#3c4a30', sky: ['#04060e', '#0e1426', '#25304a'], sunDir: [0.45, 0.5, -0.75], sunCol: [0.62, 0.72, 1.0], stars: true, mtnCol: 0x141a26, leaf: 0x1e2a1a, night: true };
  // 2: the dungeon entrance: dim, high ceilings, barred openings onto the night outside
  T.BIOMES.gate = { name: '冥門の回廊', stone: '#9a948a', stone2: '#837d74', floor: '#7c766c', trim: '#b2aa9c', rock: '#625c54', wood: '#6e5a46', fog: '#121826', fogD: 0.016, hemiS: '#7a88a8', hemiG: '#221c16', amb: 0.44, moon: '#a8bce8', moonI: 1.1, torch: '#ff9a50', cloth: '#5a1e1e', accent: 'bones', grates: true };
  // 3: deeper: several storeys, stairs and wooden ramps, no daylight at all
  T.BIOMES.halls = { name: '螺旋の大迷宮', stone: '#8a8074', stone2: '#72695e', floor: '#6c6458', trim: '#a0968a', rock: '#564e46', wood: '#7a6046', fog: '#120e0a', fogD: 0.02, hemiS: '#6a6070', hemiG: '#241a12', amb: 0.3, moon: '#d0b890', moonI: 0.5, torch: '#ff8a40', cloth: '#4a2a12', accent: 'bones', storeys: true };
  // 4: the ruined depths: the same vertical build, collapsed, lit by blue flames (braziers, torches and the patches of blue fire in the floor)
  T.BIOMES.ruin = { name: '蒼炎の廃都', stone: '#666e82', stone2: '#545c70', floor: '#4e566a', trim: '#8690a8', rock: '#40485a', wood: '#403a4e', fog: '#070d19', fogD: 0.018, hemiS: '#5e76ad', hemiG: '#151c30', amb: 0.33, moon: '#7a9ee8', moonI: 0.58, torch: '#4a9cff', flame: 0x4a9cff, cloth: '#142450', accent: 'bones', storeys: true, ruined: true };
  // the very last guardian's field: a crimson-violet sky and stone over a bottomless dark (not a fire / blue-fire place like the others)
  T.BIOMES.crimson = { name: '終焉の紅月', stone: '#8a4c74', stone2: '#6a3658', floor: '#563052', trim: '#e096c8', rock: '#42243e', wood: '#4a2a40', fog: '#2a0c30', fogD: 0.011, hemiS: '#e088cc', hemiG: '#44124c', amb: 0.62, moon: '#ff62a8', moonI: 1.9, torch: '#ff4a9a', flame: 0xff4a9a, cloth: '#701052', accent: 'bones', outdoor: 'ruins', sky: ['#14010f', '#52103a', '#b0306e'], sunDir: [0.15, 0.32, -0.92], sunCol: [1.0, 0.28, 0.56], stars: true, mtnCol: 0x2e0a28, leaf: 0x2a1030, night: true };
  // ---- the eight new fields (two per depth tier; see runplan.js R.TIERS). catacombs / flooded / frozen keep their old tables above ----
  // 地上: a deserted village at night in the mist, and a fallen city at sundown on the rim of the abyss
  T.BIOMES.hamlet = { name: '霧の廃村', stone: '#8a8478', stone2: '#726c62', floor: '#3a4630', trim: '#a29a8c', rock: '#5a564e', wood: '#6a5440', fog: '#1c2228', fogD: 0.013, hemiS: '#6a7a98', hemiG: '#1c1a14', amb: 0.5, moon: '#c0ccec', moonI: 1.45, torch: '#ffb066', cloth: '#4a3a2a', accent: 'grass', outdoor: 'ruins', floorTex: 'grass', grassTint: '#3e4a32', sky: ['#05070d', '#101626', '#28324a'], sunDir: [-0.5, 0.45, -0.7], sunCol: [0.6, 0.7, 1.0], stars: true, mtnCol: 0x161c26, leaf: 0x1e2a1a, night: true };
  T.BIOMES.dusk = { name: '黄昏の廃都', stone: '#b8a48c', stone2: '#9e8c76', floor: '#5e6a42', trim: '#c8b698', rock: '#7a7062', wood: '#7a6a58', fog: '#a87a62', fogD: 0.0075, hemiS: '#a0a8c8', hemiG: '#4a3c2c', amb: 0.7, moon: '#ffb47a', moonI: 2.2, torch: '#ffa050', cloth: '#6a2a20', accent: 'grass', outdoor: 'ruins', floorTex: 'grass', grassTint: '#8a8a5a', sky: ['#262c50', '#b8705a', '#e8b07c'], sunDir: [-0.6, 0.18, -0.75], sunCol: [1.0, 0.62, 0.38], mtnCol: 0x3a2c30, leaf: 0x4a4a28 };
  // 入口: the castle that guards the way down, under a blood moon
  T.BIOMES.castle = Object.assign({}, T.BIOMES.bloodmoon, { name: '血月の古城', floor: '#3e3028', grassTint: '#5a4a3c', fog: '#300a10', fogD: 0.009, amb: 0.56, moonI: 2.2 });
  // 中層: the old foundries, rivers of molten iron
  T.BIOMES.foundry = Object.assign({}, T.BIOMES.forge, { name: '溶鉱の深層', torch: '#ff7a30', flame: 0xff7a30, cloth: '#5a1a0a' });
  // 深層: a sanctuary floating in a false sky at the bottom of the abyss (pale stone, gold, a sky that is not quite right; darkness under the clouds)
  T.BIOMES.sanctum = { name: '天空の聖域', stone: '#d8d2c8', stone2: '#c6bfb2', floor: '#d2ccc0', trim: '#cfae62', rock: '#8a8478', wood: '#8a7a64', fog: '#b4bad6', fogD: 0.006, hemiS: '#c8d0f0', hemiG: '#6a6478', amb: 0.72, moon: '#f4ecff', moonI: 2.4, torch: '#ffd090', cloth: '#3a3a7a', accent: 'clouds', outdoor: 'sky', marble: true, sky: ['#30305a', '#9aa6d4', '#e4e6f4'], sunDir: [0.3, 0.75, -0.4], sunCol: [0.85, 0.85, 1.0], cloudCol: 0xd0d0ea, isletGrass: 0x8a9a7a, leaf: 0x7a8a6a, trimMetal: 0.3 };
  // (the old tables of catacombs / flooded, lit up a little for play: they are fields now, not short stages)
  Object.assign(T.BIOMES.catacombs, { amb: 0.42, fogD: 0.017, moonI: 0.9, hemiS: '#7a7686' });
  Object.assign(T.BIOMES.flooded, { amb: 0.46, fogD: 0.016, moonI: 0.95, hemiS: '#7a9a96', hemiG: '#24302a' });
  Object.assign(T.BIOMES.foundry, { amb: 0.6, fogD: 0.012, moonI: 0.95, hemiS: '#9a6448', hemiG: '#4a2410' });
  T.biomeFor = (area) => (G.Run ? G.Run.field(area) : 'grave');

  const matCache = {};
  // boiling lava: the surface glows brighter where bubbles swell and pop (rings that grow and burst at pseudo-random spots), over a slow
  // churning swell. Only the look changes; time comes from T.lavaT (updated by the game loop).
  T.lavaT = { value: 0 };
  // ---------------- water ----------------
  // Every surface drawn with the 'water' material (the flooded halls, the village stream, puddles, shallows, the falls from the grates)
  // is a living surface: swells and a chop that the area's current carries along (T.waterU.uFlow), the ripples a step, a shot or a foe
  // makes (T.waterU.uRip, see water.js), a web of light playing on the bottom where it is lit, foam streaks in running water; seen
  // from above it is clear and you see the floor, at a glancing angle it turns dark and mirrors the air (fresnel). A face that stands
  // upright is falling water: white streaks race down it and foam boils where it lands. Only the look; time is T.lavaT (game time).
  T.waterU = { uRip: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -99, 0)) }, uFlow: { value: new THREE.Vector2(0, 0) } };
  function waterize(m) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T.lavaT; sh.uniforms.uRip = T.waterU.uRip; sh.uniforms.uFlow = T.waterU.uFlow;
      sh.vertexShader = `varying vec3 vWP; varying vec3 vWN;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = `uniform float uTime; uniform vec4 uRip[16]; uniform vec2 uFlow; varying vec3 vWP; varying vec3 vWN;
float wq(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wq(i), wq(i + vec2(1.0, 0.0)), f.x), mix(wq(i + vec2(0.0, 1.0)), wq(i + vec2(1.0, 1.0)), f.x), f.y); }
// the surface's height (metres): two long swells, a shorter one, a chop of noise; the current carries the pattern
float wH(vec2 p, float t) {
  vec2 q = p - uFlow * t;
  float h = sin(dot(q, vec2(0.83, 0.56)) * 1.7 + t * 1.25) * 0.018 + sin(dot(q, vec2(-0.47, 0.88)) * 2.6 + t * 1.8) * 0.011
          + sin(dot(q, vec2(0.97, -0.24)) * 4.3 + t * 2.6) * 0.005;
  return h + (wn(q * 1.5 + t * 0.32) - 0.5) * 0.024 + (wn(q * 4.1 - t * 0.55) - 0.5) * 0.009;
}
float wFoam = 0.0, wFall = 0.0;
` + sh.fragmentShader
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 wN0 = normalize(vWN);
        if (wN0.y > 0.5) {
          // a lying surface: the slope of the height field, plus the rings of the ripples
          vec2 p = vWP.xz; float e = 0.06;
          vec2 g = vec2(wH(p + vec2(e, 0.0), uTime) - wH(p - vec2(e, 0.0), uTime), wH(p + vec2(0.0, e), uTime) - wH(p - vec2(0.0, e), uTime)) / (2.0 * e);
          float crest = 0.0;
          for (int i = 0; i < 16; i++) {
            vec4 r = uRip[i]; float age = uTime - r.z;
            if (age <= 0.0 || age > 2.4) continue;
            vec2 d = p - r.xy; float dist = length(d) + 1e-4, R = 0.25 + age * 1.5, x = dist - R;
            float fade = (1.0 - age / 2.4); float env = exp(-x * x * 7.0) * r.w * fade * fade;
            g += (d / dist) * env * cos(x * 13.0) * 0.16;
            crest += env * pow(max(0.0, cos(x * 13.0)), 3.0) * smoothstep(0.9, 0.0, age);
          }
          vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
          // running water: streaks of foam drawn out along the current
          float sp = length(uFlow);
          if (sp > 0.05) {
            vec2 fd = uFlow / sp, fs = vec2(-fd.y, fd.x);
            float u = dot(p, fs), v = dot(p, fd) - sp * uTime * 1.2;
            float s = wn(vec2(u * 2.4, v * 0.35)) * 0.65 + wn(vec2(u * 5.0 + 7.0, v * 0.8)) * 0.35;
            wFoam += smoothstep(0.66, 0.86, s) * min(1.0, sp * 1.6) * 0.55;
          }
          wFoam += min(0.55, crest * 0.5);
          // a web of light on the bottom (it only shows where light falls: it brightens what the light shines on)
          vec2 cq = p * 0.9 - uFlow * uTime;
          float c1 = 1.0 - abs(wn(cq * 1.7 + uTime * 0.21) * 2.0 - 1.0), c2 = 1.0 - abs(wn(cq * 2.3 - uTime * 0.17 + 3.1) * 2.0 - 1.0);
          float caus = (pow(c1, 8.0) + pow(c2, 8.0)) * (0.55 + 0.45 * wn(cq * 0.35 + 9.0));
          diffuseColor.rgb += vec3(0.1, 0.19, 0.19) * caus;
        } else {
          // falling water: streaks racing down the sheet, a churn of white where it meets the pool
          vec2 tg = normalize(vec2(-wN0.z, wN0.x) + 1e-4);
          float u = dot(vWP.xz, tg), v = vWP.y + uTime * 3.4;
          float s = wn(vec2(u * 5.5, v * 0.55)) * 0.6 + wn(vec2(u * 11.0, v * 1.3)) * 0.4;
          wFall = 1.0;
          wFoam = smoothstep(0.42, 0.78, s) * 0.85 + smoothstep(0.9, 0.0, vWP.y) * 0.9;
          vec3 nW = normalize(wN0 + vec3(tg.x, 0.0, tg.y) * (s - 0.5) * 0.5 + vec3(0.0, (wn(vec2(u * 3.0, v * 0.9)) - 0.5) * 0.4, 0.0));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }
        wFoam = clamp(wFoam, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.88, 0.9), wFoam);
        roughnessFactor = mix(roughnessFactor, 0.6, wFoam);
      }`)
        .replace('#include <opaque_fragment>', `
      {
        // fresnel: clear from above, a dark mirror of the air at a glancing angle; foam is opaque
        vec3 wV = normalize(vViewPosition);
        float fres = pow(1.0 - clamp(abs(dot(normal, wV)), 0.0, 1.0), 4.0);
        vec3 refl = vec3(0.05, 0.08, 0.09);
        #ifdef USE_FOG
          refl = mix(refl, fogColor * 1.25, 0.7);
        #endif
        outgoingLight = mix(outgoingLight, refl + outgoingLight * 0.35, fres * 0.7 * (1.0 - wFoam));
        diffuseColor.a = wFall > 0.5 ? mix(0.55, 0.92, max(wFoam, fres)) : clamp(mix(0.42, 0.93, fres) + wFoam * 0.5, 0.0, 1.0);
      }
      #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'water2';
  }
  function boil(m, blue) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T.lavaT;
      sh.vertexShader = `varying vec3 vWP;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      sh.fragmentShader = `uniform float uTime; varying vec3 vWP;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 p = vWP.xz; float acc = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          vec2 q = p * (0.5 + fi * 0.3) + vec2(fi * 5.7, fi * 2.3);
          vec2 c = floor(q); vec2 f = fract(q);
          float h = h21(c + fi);
          float ph = fract(uTime * (0.3 + 0.35 * h21(c + 9.0 + fi)) + h * 7.0);
          vec2 ctr = vec2(0.25 + 0.5 * h21(c + 3.0), 0.25 + 0.5 * h21(c + 6.0));
          float r = ph * 0.36; float d = length(f - ctr);
          float ring = smoothstep(0.07, 0.0, abs(d - r)) * (1.0 - ph);
          float body = smoothstep(r, r * 0.55, d) * smoothstep(0.0, 0.3, ph) * (1.0 - ph) * 0.4;
          float act = step(0.42, h21(c + 13.0 + fi));   // not every spot boils
          acc += act * (ring * 1.5 + body);
        }
        float swell = 0.8 + 0.24 * sin(vWP.x * 0.7 + uTime * 1.1) * sin(vWP.z * 0.6 - uTime * 0.8) + 0.08 * sin(uTime * 2.3 + vWP.x * 1.7 + vWP.z * 1.3);
        // dark crust drifting over the surface, hot cracks between it; bubbles push through in a deep orange (blue: deep blue), never white
        float cr = sin(vWP.x * 1.1 + sin(vWP.z * 0.9 + uTime * 0.3) * 1.5) * sin(vWP.z * 1.3 - uTime * 0.2 + sin(vWP.x * 0.8) * 1.5) * 0.5 + 0.5;
        float crust = smoothstep(0.5, 0.9, cr);
        float a1 = min(acc, 1.0);
        totalEmissiveRadiance *= swell * (1.0 - crust * 0.5) * (1.0 + a1 * 0.45) * mix(vec3(1.0), ${blue ? 'vec3(0.55, 0.8, 1.0)' : 'vec3(1.0, 0.5, 0.18)'}, a1);
        totalEmissiveRadiance += ${blue ? 'vec3(a1 * 0.02, a1 * 0.1, a1 * 0.3)' : 'vec3(a1 * 0.3, a1 * 0.08, 0.0)'};
      }`);
    };
    m.needsUpdate = true;
  }
  T.materials = function (biomeKey) {
    if (matCache[biomeKey]) return matCache[biomeKey];
    const B = T.BIOMES[biomeKey];
    const std = (tex, color, rough, metal, nscale, extra) => {
      const m = new THREE.MeshStandardMaterial(Object.assign({
        map: tex.map, normalMap: tex.normalMap, color: new THREE.Color(color), roughness: rough, metalness: metal || 0, vertexColors: false,
      }, tex.orm ? { roughnessMap: tex.orm, aoMap: tex.orm } : null, extra || {})); // (orm: occlusion and roughness, from gfx.js)
      m.normalScale.set(nscale || 1, nscale || 1);
      m.envMapIntensity = 0.35;
      return m;
    };
    const t = T.tex;
    const M = {
      wall: std(t.bricks, B.stone, 0.9, 0, 1.2),
      block: std(t.ashlar, B.stone2, 0.88, 0, 1.2),
      floor: std(t.flag, B.floor, 0.85, 0, 1),
      cobble: std(t.cobble, B.floor, 0.9, 0, 1.2),
      trim: std(t.smooth, B.trim, 0.7, 0, 0.6),
      rock: std(t.rock, B.rock, 0.95, 0, 1.4),
      wood: std(t.planks, B.wood, 0.8, 0, 1),
      woodDark: std(t.planks, '#5a4c40', 0.85, 0, 1),
      iron: std(t.metal, '#8a8a8a', 0.55, 0.75, 0.8),
      brass: std(t.metal, '#c8a060', 0.4, 0.85, 0.5),
      cloth: std(t.cloth, B.cloth, 0.95, 0, 0.6, { side: THREE.DoubleSide, alphaTest: 0.5 }),
      cloth2: std(t.cloth, '#3a3a3a', 0.95, 0, 0.6, { side: THREE.DoubleSide, alphaTest: 0.5 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 }),
      bone: std(t.smooth, '#d8cdb4', 0.7, 0, 0.5),
      ceramic: std(t.smooth, '#6e4a38', 0.6, 0, 0.4),
      gold: std(t.metal, '#e0b050', 0.3, 1.0, 0.3),
    };
    if (B.floorTex === 'earth') M.floor = std(t.rock, B.floor, 0.95, 0, 1.3); // (bare earth and stone: a mine's floor)
    if (B.floorTex === 'grass') { M.floor = std(t.grass, B.grassTint || '#ffffff', 0.95, 0, 1.2); M.cobble = std(t.cobble, '#a89c86', 0.9, 0, 1.2); }
    if (B.marble) {
      M.floor = std(t.marble, B.floor, 0.35, 0, 0.8); M.cobble = std(t.marble, B.floor, 0.4, 0, 0.8);
      M.block = std(t.marble, B.stone2, 0.4, 0, 0.8); M.wall = std(t.ashlar, B.stone, 0.55, 0, 0.8);
      M.trim = std(t.metal, B.trim, 0.32, B.trimMetal ?? 0.85, 0.4); // (trimMetal: a less mirror-like gilt where there is little to reflect)
    }
    // (grass in tufts, props.js: the colour of the turf it stands in; it leans with the wind, more at its tips, each tuft in its own time)
    M.tuft = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x7e8a50).multiply(new THREE.Color(B.grassTint || '#ffffff')), roughness: 1, side: THREE.DoubleSide, vertexColors: true });
    M.tuft.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = T.lavaT;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
  { float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.9, k = transformed.y * transformed.y;
    transformed.x += (sin(uTime * 1.3 + ph) * 0.09 + sin(uTime * 3.1 + ph * 2.3) * 0.03) * k; transformed.z += sin(uTime * 1.7 + ph * 1.3) * 0.05 * k; }
  #endif`);
    };
    M.leaf = new THREE.MeshStandardMaterial({ color: B.leaf ?? (B.outdoor === 'sky' ? 0x8ab05a : 0x4f6a2a), roughness: 0.9, flatShading: true });
    M.cloud = new THREE.MeshBasicMaterial({ map: T.spr.cloud, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    // (the look of water is all in its shader: waterize below; deep green-blue, glossy, its own alpha)
    M.water = new THREE.MeshStandardMaterial({ color: 0x14363a, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 1 });
    waterize(M.water);
    M.lava = new THREE.MeshStandardMaterial({ color: 0x2a0800, emissive: 0xff5a10, emissiveIntensity: 1.6, emissiveMap: t.rock.map, roughness: 0.9, normalMap: t.rock.normalMap });
    M.bluefire = new THREE.MeshStandardMaterial({ color: 0x06102a, emissive: 0x2a86ff, emissiveIntensity: 1.7, emissiveMap: t.rock.map, roughness: 0.9, normalMap: t.rock.normalMap });
    boil(M.lava, false); boil(M.bluefire, true);
    M.voidglow = new THREE.MeshStandardMaterial({ color: 0x16020f, emissive: 0xff2a8a, emissiveIntensity: 1.1, emissiveMap: t.rock.map, roughness: 0.9, normalMap: t.rock.normalMap });
    M.ice = new THREE.MeshStandardMaterial({ color: 0xbfe0f0, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85, normalMap: t.rock.normalMap });
    M.ice.normalScale.set(0.4, 0.4);
    { const it = G.GFX && G.GFX.tex ? G.GFX.tex('ice') : null; if (it) { M.ice.map = it.map; M.ice.normalMap = it.normalMap; M.ice.roughnessMap = it.orm; M.ice.color.setHex(0xdfe8ee); M.ice.roughness = 1; M.ice.opacity = 0.88; M.ice.normalScale.set(0.8, 0.8); } }   // (old ice with its cracks and rime: gfx.js)
    // field gimmicks
    M.moss = std(t.grass, '#6f9a3a', 0.85, 0, 1.4);
    M.mud = std(t.rock, '#4a3524', 0.45, 0.05, 1.6);
    M.poison = new THREE.MeshStandardMaterial({ color: 0x1a3008, emissive: 0x52b020, emissiveIntensity: 0.55, emissiveMap: t.rock.map, roughness: 0.25, transparent: true, opacity: 0.92 });
    M.holy = new THREE.MeshStandardMaterial({ color: 0x1a3a48, emissive: 0x70d8ff, emissiveIntensity: 0.8, emissiveMap: t.cobble.map, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
    M.oil = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.95 });
    M.vine = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5, map: T.leafTex() });
    M.web = new THREE.MeshBasicMaterial({ map: T.spr.web, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.3 });
    M.candle = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6, emissive: 0x302010 });
    M.glow = new THREE.MeshBasicMaterial({ color: 0xffb060 });
    // vertex-coloured variants for merged static geometry; plain ones are used by standalone meshes
    M.vc = {};
    for (const k in M) { const m = M[k]; if (m && m.isMaterial) { if (m.isMeshStandardMaterial) { const c = m.clone(); c.vertexColors = true; M.vc[k] = c; } else M.vc[k] = m; } }
    boil(M.vc.lava, false); boil(M.vc.bluefire, true); // the copies the world is actually drawn with
    waterize(M.vc.water);
    M.biome = B;
    matCache[biomeKey] = M;
    return M;
  };
  let leaf = null;
  T.leafTex = function () {
    if (leaf) return leaf;
    leaf = canvasTex(128, (g, s) => {
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * s, y = Math.random() * s;
        g.fillStyle = `rgb(${50 + Math.random() * 40},${90 + Math.random() * 60},${30 + Math.random() * 30})`;
        g.beginPath(); g.ellipse(x, y, 5 + Math.random() * 5, 3 + Math.random() * 3, Math.random() * 6, 0, 6.28); g.fill();
      }
    });
    return leaf;
  };

  // environment map for metal reflections (warm/cool gradient room)
  T.makeEnv = function (renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const sc = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const cols = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10, x = pos.getX(i) / 10;
      let r = 0.05 + Math.max(0, y) * 0.25, g = 0.045 + Math.max(0, y) * 0.25, b = 0.04 + Math.max(0, y) * 0.3;
      if (y < 0.2 && y > -0.2 && x > 0.5) { r += 0.9; g += 0.55; b += 0.25; } // warm torch band
      if (y < -0.3) { r += 0.03; g += 0.02; }
      cols.push(r, g, b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const rt = pm.fromScene(sc, 0.04);
    pm.dispose();
    return rt.texture;
  };
  const U = G.U;
})();
