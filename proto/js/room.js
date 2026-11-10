'use strict';
// The room: a crypt under a church. A grid of columns carries pointed cross vaults; lancet windows in the far wall let the moon in;
// torches on the columns and a ring of candles warm the middle. Everything is geometry built here.
(function () {
  const G = P.Geo, Room = P.Room = { solids: [], flames: [], lights: [], niches: [] };
  const BAY = 5, XB = [-7.5, -2.5, 2.5, 7.5], ZB = [-13, -8, -3, 2, 7, 12], SP = 3.0, AC = 0.6, AH = 2.5, AR = AH + AC;
  const WT = 0.8; // wall thickness
  const arch = (t, r) => Math.sqrt(Math.max(0, (r === undefined ? AR : r) ** 2 - (Math.abs(t) + AC) ** 2));
  Room.SP = SP; Room.top = SP + arch(0);
  P.timeU = P.timeU || { value: 0 };

  // ---- outlines ----
  // a lancet: a tall opening with a pointed head. Counter-clockwise
  function lancet(cx, y0, w, y1, n) {
    const p = [[cx - w / 2, y0], [cx + w / 2, y0]]; n = n || 9;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 3; p.push([cx - w / 2 + Math.cos(a) * w, y1 + Math.sin(a) * w]); }
    for (let i = 1; i <= n; i++) { const a = Math.PI * 2 / 3 + (i / n) * Math.PI / 3; p.push([cx + w / 2 + Math.cos(a) * w, y1 + Math.sin(a) * w]); }
    return p;
  }
  // a round-headed opening
  function roundArch(cx, y0, w, y1, n) {
    const p = [[cx - w / 2, y0], [cx + w / 2, y0]]; n = n || 10;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; p.push([cx + Math.cos(a) * w / 2, y1 + Math.sin(a) * w / 2]); }
    return p;
  }
  // the band of a pointed arch spanning one bay (in its own plane: across, up), thick dn below the vault line
  function ribShape(dn) {
    const out = [], n = 22, r2 = AR - dn, a2 = Math.sqrt(Math.max(0, r2 * r2)) - AC;
    for (let i = 0; i <= n; i++) { const t = -AH + (2 * AH) * i / n; out.push([t, SP + arch(t)]); }
    for (let i = n; i >= 0; i--) { const t = -a2 + (2 * a2) * i / n; out.push([t, SP + arch(t, r2)]); }
    return out;
  }

  // ---- one bay of pointed cross vault: the ceiling is the higher of two crossing tunnels ----
  function vaultBay(cx, cz) {
    const n = 20, pos = [], nor = [];
    const hgt = (x, z) => SP + Math.max(arch(x), arch(z));
    const nrm = (x, z, alongX, out) => {
      // the tunnel that rules here: alongX means its height depends on x (it runs along z)
      const t = alongX ? x : z, r = Math.max(1e-4, arch(t)), dh = -(Math.abs(t) + AC) / r * Math.sign(t || 1e-9);
      const l = Math.hypot(dh, 1); if (alongX) { out[0] = dh / l; out[1] = -1 / l; out[2] = 0; } else { out[0] = 0; out[1] = -1 / l; out[2] = dh / l; }
    };
    const N = [0, 0, 0];
    const tri = (a, b, c) => {
      const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[1] + b[1] + c[1]) / 3, alongX = Math.abs(mx) < Math.abs(mz);
      for (const p of [a, b, c]) { pos.push(cx + p[0], hgt(p[0], p[1]), cz + p[1]); nrm(p[0], p[1], alongX, N); nor.push(N[0], N[1], N[2]); }
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x0 = -AH + (2 * AH) * i / n, x1 = -AH + (2 * AH) * (i + 1) / n, z0 = -AH + (2 * AH) * j / n, z1 = -AH + (2 * AH) * (j + 1) / n;
      const A = [x0, z0], B = [x1, z0], C = [x1, z1], D = [x0, z1];
      // split each cell along the diagonal that runs with the groin, and face it down into the room
      if ((x0 + x1) * (z0 + z1) > 0) { tri(A, B, C); tri(A, C, D); } else { tri(A, B, D); tri(B, C, D); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    return g;
  }

  // ---- fire: a flat card turned to the camera, the flame drawn on it ----
  const FLAME_VS = `varying vec2 vUv; uniform vec2 size;
void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0., 0., 0., 1.); vec3 up = normalize((viewMatrix * vec4(0., 1., 0., 0.)).xyz); vec3 rt = normalize(cross(up, vec3(0., 0., 1.)));
  mv.xyz += rt * (uv.x - .5) * size.x + up * uv.y * size.y; gl_Position = projectionMatrix * mv; }`;
  const FLAME_FS = `precision highp float; varying vec2 vUv; uniform float time; uniform float seed; uniform float power;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
float fb(vec2 p){ return n(p) * .5 + n(p * 2.03) * .25 + n(p * 4.1) * .125 + n(p * 8.3) * .0625; }
void main(){
  vec2 uv = vUv; float t = time * 1.9 + seed * 17.;
  float sway = (fb(vec2(uv.y * 2.2 - t * .8, seed)) - .47) * .5 * uv.y;
  float x = (uv.x - .5 + sway) * 2.;
  float w = (.74 * sin(3.14159 * pow(uv.y, .42)) + .03) * (1. + .15 * sin(t * 3.1 + seed));
  float nz = fb(vec2(uv.x * 4. + seed * 3., uv.y * 3.2 - t * 2.3));
  float body = 1. - smoothstep(0., w, abs(x) + (nz - .5) * .36 * (uv.y + .15));
  body *= smoothstep(0., .08, uv.y) * (1. - smoothstep(.55, 1., uv.y + (nz - .5) * .5));
  float core = body * body * (1. - uv.y * .8);
  vec3 c = mix(vec3(2.2, .30, .03), vec3(7.5, 2.9, .5), body) * body + vec3(6., 4.4, 2.) * core * core;
  gl_FragColor = vec4(c * power, 1.);
}`;
  let flameGeo = null;
  function flame(parent, x, y, z, w, hh, power) {
    if (!flameGeo) flameGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const m = new THREE.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, uniforms: { time: P.timeU, seed: { value: Math.random() * 10 }, size: { value: new THREE.Vector2(w, hh) }, power: { value: power || 1 } },
      blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const mesh = new THREE.Mesh(flameGeo, m); mesh.position.set(x, y, z); mesh.frustumCulled = false; mesh.renderOrder = 5; parent.add(mesh);
    Room.flames.push(mesh); return mesh;
  }

  Room.build = function (scene) {
    const T = P.Tex, B = new G.Builder();
    const M = Room.mats = {
      wall: P.triMat(T.wall), floor: P.triMat(T.floor, { cavity: 0.35 }), dressed: P.triMat(T.dressed), plaster: P.triMat(T.plaster, { cavity: 0.4 }),
      char: P.triMat(T.rag, { color: 0x4a3a30, size: 0.2 }), wood: P.triMat(T.wood), woodDark: P.triMat(T.wood, { color: 0x8a7a6a, size: 0.9 }), iron: P.triMat(T.iron), lid: P.triMat(T.mono, { color: 0xc8c4ba, size: 1.3 }), mono: P.triMat(T.mono),
    };
    M.plaster.shadowSide = THREE.DoubleSide;
    const wax = new THREE.MeshStandardMaterial({ color: 0xcdbb8e, roughness: 0.55, emissive: 0x3a1c06, emissiveIntensity: 0.7 });
    const sky = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.85, 1.5).multiplyScalar(1.5), fog: false });
    const dark = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const solid = (x0, x1, z0, z1) => Room.solids.push({ x0, x1, z0, z1 });
    const X0 = XB[0], X1 = XB[3], Z0 = ZB[0], Z1 = ZB[5];

    // floor
    B.add(M.floor, G.box(X1 - X0 + WT * 2, 0.4, Z1 - Z0 + WT * 2), [0, -0.2, (Z0 + Z1) / 2]);

    // vaults and the arches between the bays
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) B.add(M.plaster, vaultBay((XB[i] + XB[i + 1]) / 2, (ZB[j] + ZB[j + 1]) / 2));
    const rib = ribShape(0.24), RW = 0.42;
    for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) B.add(M.dressed, G.slab(rib, -RW / 2, RW / 2, 0.035), [(XB[i] + XB[i + 1]) / 2, 0, ZB[j]]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) B.add(M.dressed, G.slab(rib, -RW / 2, RW / 2, 0.035), [XB[i], 0, (ZB[j] + ZB[j + 1]) / 2], [0, Math.PI / 2, 0]);
    // a slab over everything so the moon comes in by the windows alone (never seen)
    const roof = new THREE.Mesh(G.box(22, 0.3, 32), dark); roof.position.set(0, 7.4, 0); roof.castShadow = true; scene.add(roof);

    // columns: an eight-sided shaft on a stepped base, a spreading capital and a square slab on top
    const colProfile = [[0.001, 0.15], [0.56, 0.15], [0.56, 0.3], [0.52, 0.34], [0.44, 0.38], [0.42, 0.44], [0.46, 0.47], [0.46, 0.52], [0.38, 0.57], [0.345, 0.62], [0.345, 2.3], [0.385, 2.33], [0.385, 2.41], [0.35, 2.44], [0.36, 2.5], [0.42, 2.62], [0.52, 2.76], [0.585, 2.82], [0.585, 2.86], [0.001, 2.86]];
    const column = (x, z) => {
      B.add(M.dressed, G.lathe(colProfile, 28, true, true), [x, 0, z]);
      B.add(M.dressed, G.rbox(1.22, 0.16, 1.22, 0.02, 1), [x, 0.08, z]);
      B.add(M.dressed, G.rbox(1.24, 0.15, 1.24, 0.025, 1), [x, 2.93, z]);
      solid(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
    };
    for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) column(XB[i], ZB[j]);

    // side walls, with burial niches cut through them in two of the bays
    for (const sx of [-1, 1]) {
      const holes = [];
      for (const zc of [-5.5, 4.5]) for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        const f = -(zc + (c - 1.5) * 0.92), y = 0.55 + r * 0.78;
        const o = roundArch(f, y, 0.62, y + 0.34, 7); o.reverse(); holes.push(o);
        Room.niches.push({ x: sx * (X1 + 0.32), y: y, z: -f, sx });
      }
      const pts = [[-(Z1 + WT), 0], [-(Z0 - WT), 0], [-(Z0 - WT), 6.4], [-(Z1 + WT), 6.4]];
      B.add(M.wall, G.prof(pts, WT, 0.03, holes), [sx * (X1 + WT / 2), 0, 0]);
      B.add(M.dressed, G.box(0.06, 6.4, Z1 - Z0 + WT * 2), [sx * (X1 + 0.62), 3.2, (Z0 + Z1) / 2]);   // the back of the niches
      B.add(M.dressed, G.rbox(0.16, 0.34, Z1 - Z0, 0.02, 1), [sx * (X1 - 0.07), 0.17, (Z0 + Z1) / 2]);     // plinth course
    }
    // far wall with the windows
    const wins = [[0, 1.9, 1.05, 4.35], [-1.55, 1.9, 0.82, 3.7], [1.55, 1.9, 0.82, 3.7], [-5, 2.1, 0.9, 3.9], [5, 2.1, 0.9, 3.9]];
    {
      const pts = [[X0 - WT, 0], [X1 + WT, 0], [X1 + WT, 7.2], [X0 - WT, 7.2]];
      const holes = wins.map((w) => { const o = lancet(w[0], w[1], w[2], w[3]); o.reverse(); return o; });
      B.add(M.wall, G.slab(pts, Z0 - WT, Z0, 0.07, holes));
      for (const w of wins) {
        // a moulded frame, a sloped sill, and bars
        const outer = lancet(w[0], w[1] - 0.12, w[2] + 0.34, w[3]), inner = lancet(w[0], w[1] + 0.02, w[2] + 0.04, w[3]); inner.reverse();
        B.add(M.dressed, G.slab(outer, Z0 - 0.06, Z0 + 0.09, 0.03, [inner]));
        B.add(M.dressed, G.rbox(w[2] + 0.5, 0.14, 0.4, 0.03, 1), [w[0], w[1] - 0.1, Z0 + 0.08], [0.25, 0, 0]);
        const top = w[3] + w[2] * 0.866;
        for (let k = -1; k <= 1; k++) { const bx = w[0] + k * w[2] * 0.27, hgt = (k === 0 ? top : w[3] + w[2] * 0.55) - w[1]; B.add(M.iron, G.cyl(0.018, hgt, 8), [bx, w[1], Z0 - 0.4], [Math.PI / 2, 0, 0]); }
        for (let yy = w[1] + 0.55; yy < w[3] + 0.2; yy += 0.7) B.add(M.iron, G.box(w[2], 0.03, 0.03), [w[0], yy, Z0 - 0.4]);
      }
      const s = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), sky); s.position.set(0, 6, Z0 - 6); scene.add(s);
    }
    // near wall with a door
    {
      const pts = [[X0 - WT, 0], [X1 + WT, 0], [X1 + WT, 6.4], [X0 - WT, 6.4]];
      const door = lancet(0, 0, 2.3, 1.75, 12); door.reverse();
      B.add(M.wall, G.slab(pts, Z1, Z1 + WT, 0.05, [door]));
      const outer = lancet(0, 0, 2.86, 1.75, 12), inner = lancet(0, -0.1, 2.34, 1.75, 12); inner.reverse();
      B.add(M.dressed, G.slab(outer, Z1 - 0.1, Z1 + 0.1, 0.04, [inner]));
      B.add(M.woodDark, G.slab(lancet(0, 0, 2.36, 1.75, 12), Z1 + 0.32, Z1 + 0.42, 0.0));
      for (const yy of [0.5, 1.5, 2.5]) B.add(M.iron, G.rbox(2.3, 0.11, 0.03, 0.008, 1), [0, yy, Z1 + 0.3]);
      B.add(M.iron, G.box(0.03, 3.6, 0.03), [0, 1.8, Z1 + 0.3]);
      for (const dx of [-0.22, 0.22]) B.add(M.iron, new THREE.TorusGeometry(0.09, 0.014, 8, 20), [dx, 1.25, Z1 + 0.27]);
    }
    for (const sz of [Z0, Z1]) B.add(M.dressed, G.rbox(X1 - X0, 0.34, 0.16, 0.02, 1), [0, 0.17, sz + (sz < 0 ? 0.07 : -0.07)]);

    // the dais and altar under the windows
    B.add(M.dressed, G.rbox(6.2, 0.2, 3.6, 0.03, 1), [0, 0.1, -11.0]); B.add(M.dressed, G.rbox(5.2, 0.2, 2.9, 0.03, 1), [0, 0.3, -11.3]);
    B.add(M.mono, G.rbox(2.0, 0.78, 0.86, 0.03, 1), [0, 0.79, -11.6]); B.add(M.lid, G.rbox(2.36, 0.14, 1.1, 0.03, 2), [0, 1.25, -11.6]);
    B.add(M.dressed, G.rbox(2.2, 0.1, 1.0, 0.02, 1), [0, 0.45, -11.6]);
    solid(-1.3, 1.3, -12.3, -10.9); solid(-3.1, 3.1, -13, -9.25);
    Room.steps = [{ x0: -3.1, x1: 3.1, z0: -12.8, z1: -9.2, y: 0.2 }, { x0: -2.6, x1: 2.6, z0: -12.75, z1: -9.85, y: 0.4 }];
    Room.solids.pop(); // (the dais is walked on, not a wall)

    // tall candle stands by the altar
    const stand = (x, z, hgt) => {
      const pr = [[0.001, 0], [0.2, 0], [0.2, 0.03], [0.07, 0.07], [0.03, 0.12], [0.026, hgt * 0.45], [0.045, hgt * 0.47], [0.045, hgt * 0.5], [0.024, hgt * 0.52], [0.024, hgt - 0.08], [0.11, hgt - 0.03], [0.12, hgt], [0.001, hgt]];
      B.add(M.iron, G.lathe(pr, 14, true, true), [x, 0, z]);
      B.add(wax, G.cyl(0.035, 0.22, 10), [x, hgt, z], [Math.PI / 2, 0, 0]);
      flame(scene, x, hgt + 0.21, z, 0.07, 0.15, 1.4);
    };
    stand(-1.75, -10.9, 1.55); stand(1.75, -10.9, 1.55);
    Room.lights.push({ type: 'candle', pos: [0, 1.95, -10.6], color: [1.0, 0.56, 0.24], power: 2.6, dist: 9 });

    // stone coffins in the side aisles
    const coffin = (x, z, rot, open) => {
      const grp = new G.Builder(), a = [];
      a.push(G.xf(G.rbox(1.12, 0.2, 2.46, 0.025, 1), [0, 0.1, 0]));
      a.push(G.xf(G.rbox(0.92, 0.66, 2.22, 0.03, 1), [0, 0.53, 0]));
      for (const sz of [-0.8, 0, 0.8]) for (const sx of [-1, 1]) a.push(G.xf(G.rbox(0.04, 0.44, 0.5, 0.012, 1), [sx * 0.47, 0.53, sz]));   // sunk panels read as raised frames
      const lidPts = [[-1.2, 0], [1.2, 0], [1.2, 0.1], [1.13, 0.1], [1.13, 0.1]];
      const lid = G.prof([[-1.2, 0], [1.2, 0], [1.2, 0.09], [-1.2, 0.09]], 1.04, 0.02);
      const ridge = G.xf(G.prof([[-1.14, 0], [1.14, 0], [1.08, 0.1], [-1.08, 0.1]], 0.5, 0.02), [0, 0.09, 0]);
      const cross1 = G.xf(G.rbox(0.09, 0.03, 1.4, 0.01, 1), [0, 0.2, 0]), cross2 = G.xf(G.rbox(0.5, 0.03, 0.09, 0.01, 1), [0, 0.2, -0.32]);
      const lidParts = [lid, ridge, cross1, cross2];
      for (const g of lidParts) { if (open) G.xf(g, [0.3, 0.86, 0.12], [0, 0.22, -0.06]); else G.xf(g, [0, 0.86, 0]); }
      for (const g of a) B.add(M.mono, G.xf(g, [x, 0, z], [0, rot, 0]));
      for (const g of lidParts) B.add(M.lid, G.xf(g, [x, 0, z], [0, rot, 0]));
      if (open) B.add(dark, G.xf(G.xf(G.box(0.78, 0.02, 2.08), [0, 0.845, 0]), [x, 0, z], [0, rot, 0]));
      const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), hx = 0.6 * c + 1.25 * s, hz = 0.6 * s + 1.25 * c; solid(x - hx, x + hx, z - hz, z + hz);
    };
    coffin(-5.2, -0.5, 0, false); coffin(5.2, -0.5, 0, true); coffin(-5.3, -10.4, Math.PI / 2, false); coffin(5.3, -10.4, Math.PI / 2, false);

    // crates and barrels by the door
    const crate = (x, y, z, s, rot) => {
      const parts = [G.rbox(s, s, s, 0.008, 1)], f = 0.11 * s, t = 0.03 * s, hs = s / 2;
      for (const ax of [0, 1, 2]) for (const sg of [-1, 1]) for (const e of [-1, 1]) for (const dir of [0, 1]) {
        const u = (ax + 1) % 3, v = (ax + 2) % 3, dim = [0, 0, 0], p = [0, 0, 0];
        dim[ax] = t; dim[dir ? u : v] = s + t * 2; dim[dir ? v : u] = f; p[ax] = sg * (hs + t / 2 - 0.004); p[dir ? v : u] = e * (hs - f / 2 + t);
        parts.push(G.xf(G.rbox(dim[0], dim[1], dim[2], 0.006, 1), p));
      }
      for (const g of parts) B.add(M.wood, G.xf(g, [x, y + hs, z], [0, rot, 0]));
      const r = s * 0.72; if (y < 0.1) solid(x - r, x + r, z - r, z + r);
    };
    crate(5.5, 0, 9.6, 0.86, 0.2); crate(6.5, 0, 9.3, 0.8, -0.1); crate(5.9, 0.86, 9.5, 0.7, 0.6); crate(4.3, 0, 10.6, 0.62, 0.9);
    const barrel = (x, z) => {
      const pr = [[0.001, 0], [0.30, 0], [0.34, 0.12], [0.385, 0.34], [0.40, 0.5], [0.385, 0.66], [0.34, 0.88], [0.30, 1.0], [0.27, 1.0], [0.27, 0.965], [0.001, 0.965]];
      B.add(M.wood, G.lathe(pr, 18, false, true), [x, 0, z]);
      for (const [yy, rr] of [[0.1, 0.335], [0.3, 0.38], [0.7, 0.38], [0.9, 0.335]]) B.add(M.iron, G.lathe([[rr, -0.03], [rr + 0.012, -0.03], [rr + 0.012, 0.03], [rr, 0.03]], 18, true, true), [x, yy, z]);
      solid(x - 0.42, x + 0.42, z - 0.42, z + 0.42);
    };
    barrel(6.6, 10.7); barrel(5.75, 11.05); barrel(-6.5, 10.6);

    // rubble
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 46; i++) {
      const cl = i % 4, cx = [-6.3, 6.4, -3.3, 3.9][cl], cz = [6.2, -6.6, -12.2, 3.4][cl], s = 0.05 + rnd() * rnd() * 0.3;
      B.add(M.wall, G.rbox(s * (0.7 + rnd()), s * (0.4 + rnd() * 0.5), s * (0.7 + rnd()), s * 0.12, 1), [cx + (rnd() - 0.5) * 1.9, s * 0.2, cz + (rnd() - 0.5) * 1.9], [rnd() * 0.5, rnd() * 6, rnd() * 0.5]);
    }

    // torches on four columns: an iron bracket, a wooden shaft, a wrapped head
    const torch = (x, z, dx, shadow, onWall) => {
      const r0 = onWall ? 0 : 0.345;
      if (onWall) B.add(M.iron, G.rbox(0.03, 0.42, 0.14, 0.008, 1), [x + dx * 0.015, 1.9, z]);
      else for (const yy of [1.74, 2.04]) B.add(M.iron, G.lathe([[r0, -0.035], [r0 + 0.014, -0.035], [r0 + 0.014, 0.035], [r0, 0.035]], 28, true, true), [x, yy, z]);
      // two arms out from the column, each ending in a ring the torch stands in, leaning away from the stone
      const a = [x + dx * (r0 + 0.17), 1.5, z], b = [x + dx * (r0 + 0.36), 2.36, z], at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, z];
      for (const yy of [1.74, 2.04]) {
        const c = at((yy - 1.5) / 0.86);
        B.add(M.iron, G.rod([x + dx * r0, yy, z], [c[0] - dx * 0.03, yy, z], 0.011, 6));
        B.add(M.iron, new THREE.TorusGeometry(0.036, 0.009, 6, 16), [c[0], yy, z], [Math.PI / 2, 0, 0]);
      }
      B.add(M.woodDark, G.rod(a, b, 0.024, 10, 0.03));
      const dir = [(b[0] - a[0]) / 0.88, 0.86 / 0.88, 0], h0 = at(0.97), h1 = [h0[0] + dir[0] * 0.2, h0[1] + dir[1] * 0.2, z];
      B.add(M.char, G.rod(h0, h1, 0.05, 10, 0.036)); B.add(M.char, new THREE.SphereGeometry(0.052, 10, 8), [h0[0], h0[1], z]);
      flame(scene, h1[0] - dir[0] * 0.08, h1[1] - 0.08, z, 0.42, 0.72, 1);
      Room.lights.push({ type: 'torch', pos: [h1[0] + dx * 0.1, h1[1] + 0.28, z], color: [1.0, 0.47, 0.17], power: 9, dist: 15, shadow });
    };
    torch(-2.5, 2, 1, true); torch(2.5, 2, -1, true); torch(-2.5, -8, 1, false); torch(2.5, -8, -1, false);
    torch(-7.5, 4.5, 1, false, true); torch(7.5, -5.5, -1, false, true);

    // a ring of candles hung over the middle
    {
      const cx = 0, cy = 3.25, cz = -3;
      B.add(M.iron, new THREE.TorusGeometry(0.95, 0.03, 8, 40), [cx, cy, cz], [Math.PI / 2, 0, 0]);
      B.add(M.iron, new THREE.TorusGeometry(0.95, 0.022, 8, 40), [cx, cy - 0.12, cz], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2, x = cx + Math.cos(a) * 0.95, z = cz + Math.sin(a) * 0.95, hh = 0.1 + (i * 7 % 5) * 0.022;
        B.add(M.iron, G.lathe([[0.001, 0], [0.02, 0], [0.05, 0.03], [0.055, 0.045], [0.001, 0.045]], 10, true, true), [x, cy + 0.02, z]);
        B.add(M.iron, G.box(0.014, 0.14, 0.014), [x, cy - 0.05, z]);
        B.add(wax, G.cyl(0.022, hh, 8), [x, cy + 0.06, z], [Math.PI / 2, 0, 0]);
        flame(scene, x, cy + 0.06 + hh, z, 0.05, 0.11, 1.5);
      }
      for (let i = 0; i < 4; i++) {
        const a = i / 4 * Math.PI * 2 + 0.4, x = Math.cos(a) * 0.95, z = Math.sin(a) * 0.95, len = Math.hypot(0.95, 1.5);
        B.add(M.iron, G.rod([cx + x, cy, cz + z], [cx, cy + 1.5, cz], 0.011, 6));
      }
      B.add(M.iron, G.cyl(0.013, Room.top - cy - 1.5 + 0.2, 6), [cx, cy + 1.5, cz], [Math.PI / 2, 0, 0]);
      B.add(M.iron, new THREE.TorusGeometry(0.06, 0.014, 8, 16), [cx, cy + 1.5, cz]);
      Room.lights.push({ type: 'ring', pos: [cx, cy - 0.25, cz], color: [1.0, 0.58, 0.26], power: 13, dist: 16, shadow: true, live: true });
    }

    const meshes = B.build(scene); Room.meshes = meshes; P.hitTargets = (P.hitTargets || []).concat(meshes);
    for (const m of meshes) { if (m.material === dark || m.material === sky) { m.castShadow = false; } }

    // walls of the room for walking
    solid(-99, X0 + 0.28, -99, 99); solid(X1 - 0.28, 99, -99, 99); solid(-99, 99, -99, Z0 + 0.3); solid(-99, 99, Z1 - 0.3, 99);
    Room.bounds = { x0: X0, x1: X1, z0: Z0, z1: Z1, y0: 0, y1: 6.2 };

    // ---- light ----
    const moonDir = new THREE.Vector3(0.08, -0.31, 1).normalize();
    const moon = new THREE.DirectionalLight(new THREE.Color(0.56, 0.72, 1.0), 9);
    moon.position.copy(moonDir).multiplyScalar(-38).add(new THREE.Vector3(0, 3, -1)); moon.target.position.set(0, 3, -1); scene.add(moon, moon.target);
    moon.castShadow = true; moon.shadow.mapSize.set(4096, 4096);
    const sc = moon.shadow.camera; sc.left = -10.5; sc.right = 10.5; sc.top = 9; sc.bottom = -9; sc.near = 4; sc.far = 70; sc.updateProjectionMatrix();
    moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.035; moon.shadow.radius = 2.2;
    Room.moon = moon; Room.moonDir = moonDir;
    const hemi = new THREE.HemisphereLight(new THREE.Color(0.16, 0.24, 0.42), new THREE.Color(0.05, 0.05, 0.06), 0.16); scene.add(hemi); Room.hemi = hemi;
    for (const L of Room.lights) {
      const pl = new THREE.PointLight(new THREE.Color(L.color[0], L.color[1], L.color[2]), L.power, L.dist, 2);
      pl.position.set(L.pos[0], L.pos[1], L.pos[2]);
      if (L.shadow) { pl.castShadow = true; pl.shadow.mapSize.set(1024, 1024); pl.shadow.bias = -0.003; pl.shadow.normalBias = 0.03; pl.shadow.camera.near = 0.12; pl.shadow.camera.far = L.dist; pl.shadow.radius = 2; if (!L.live) { pl.shadow.autoUpdate = false; pl.shadow.needsUpdate = true; } }
      scene.add(pl); L.light = pl; L.seed = Math.random() * 100;
    }
    return Room;
  };

  // flicker
  Room.update = function (t) {
    for (const L of Room.lights) {
      const s = L.seed, f = 0.86 + 0.09 * Math.sin(t * 11.3 + s) + 0.06 * Math.sin(t * 23.7 + s * 2.1) + 0.05 * Math.sin(t * 5.1 + s * 0.7);
      L.light.intensity = L.power * (L.type === 'torch' ? f : 0.94 + (f - 0.86) * 0.4);
    }
  };

  // keep a walker of radius r out of the solids; returns the floor height under it
  Room.collide = function (p, r) {
    for (let it = 0; it < 2; it++) for (const s of Room.solids) {
      const nx = Math.max(s.x0, Math.min(p.x, s.x1)), nz = Math.max(s.z0, Math.min(p.z, s.z1)); let dx = p.x - nx, dz = p.z - nz; const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
      else { const l = p.x - s.x0, rr = s.x1 - p.x, n = p.z - s.z0, f = s.z1 - p.z, m = Math.min(l, rr, n, f); if (m === l) p.x = s.x0 - r; else if (m === rr) p.x = s.x1 + r; else if (m === n) p.z = s.z0 - r; else p.z = s.z1 + r; }
    }
    let y = 0; for (const s of Room.steps || []) if (p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1) y = Math.max(y, s.y);
    return y;
  };
})();
