'use strict';
// Shapes built in code: rounded boxes, side profiles pushed out to a thickness, turned parts, and a builder that joins them into one mesh.
(function () {
  const V = new THREE.Vector3(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();
  const Geo = P.Geo = {};

  // where the grid lines of one side of a rounded box fall: the two ends carry n steps across the radius, the middle is one span
  function stops(len, r, n) {
    const L = len / 2, out = [];
    for (let i = 0; i <= n; i++) out.push(-L + r * i / n);
    for (let i = n; i >= 0; i--) out.push(L - r * i / n);
    return out;
  }
  // a box with its edges and corners rounded to radius r (n steps across the round; 1 reads as a soft chamfer)
  Geo.rbox = function (w, h, d, r, n) {
    r = Math.min(r === undefined ? 0.004 : r, w / 2 - 1e-5, h / 2 - 1e-5, d / 2 - 1e-5); n = n || 2;
    const dims = [w, h, d], pos = [], nor = [], idx = [];
    const st = [stops(w, r, n), stops(h, r, n), stops(d, r, n)];
    const face = (ax, sign) => {
      const u = (ax + 1) % 3, v = (ax + 2) % 3, su = st[u], sv = st[v], base = pos.length / 3, p = [0, 0, 0], c = [0, 0, 0];
      for (let j = 0; j < sv.length; j++) for (let i = 0; i < su.length; i++) {
        p[ax] = sign * dims[ax] / 2; p[u] = su[i]; p[v] = sv[j];
        for (let k = 0; k < 3; k++) c[k] = Math.max(-dims[k] / 2 + r, Math.min(dims[k] / 2 - r, p[k]));
        let nx = p[0] - c[0], ny = p[1] - c[1], nz = p[2] - c[2]; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        pos.push(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r); nor.push(nx, ny, nz);
      }
      const W = su.length;
      for (let j = 0; j < sv.length - 1; j++) for (let i = 0; i < W - 1; i++) {
        const a = base + j * W + i, b = a + 1, c2 = a + W, d2 = c2 + 1;
        if (sign > 0) idx.push(a, b, d2, a, d2, c2); else idx.push(a, d2, b, a, c2, d2);
      }
    };
    for (let ax = 0; ax < 3; ax++) { face(ax, 1); face(ax, -1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    return g;
  };
  Geo.box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  // a cylinder along z (len forward from z = 0 to z = -len), seg sides
  Geo.cyl = function (r, len, seg, r2, open) { const g = new THREE.CylinderGeometry(r2 === undefined ? r : r2, r, len, seg || 20, 1, !!open); g.rotateX(-Math.PI / 2); g.translate(0, 0, -len / 2); return g; };
  // a turned part about the z axis. pts: [radius, distance forward] pairs; sharp: keep the corners of the outline hard
  Geo.lathe = function (pts, seg, sharp, upright) {
    const P2 = [];
    for (let i = 0; i < pts.length; i++) { P2.push(new THREE.Vector2(Math.max(pts[i][0], 1e-5), pts[i][1])); if (sharp && i > 0 && i < pts.length - 1) P2.push(new THREE.Vector2(Math.max(pts[i][0], 1e-5), pts[i][1])); }
    let g = new THREE.LatheGeometry(P2, seg || 24);
    if (sharp) { g = g.toNonIndexed(); g.computeVertexNormals(); if (sharp !== 'flat') smoothAround(g); }
    if (!upright) g.rotateX(-Math.PI / 2); // (upright: about the y axis, the outline's second number is the height)
    return g;
  };
  // (a turned part with hard corners: the faces are flat along the outline but must stay smooth around the axis - the normal of each vertex
  // is taken from its own face's outline segment, pointing out from the axis)
  function smoothAround(g) {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      // the face normal's slope along the axis (y before the turn) is kept; its direction about the axis follows each vertex
      const ny = (n.getY(i) + n.getY(i + 1) + n.getY(i + 2)) / 3, nr = Math.sqrt(Math.max(0, 1 - ny * ny));
      for (let k = 0; k < 3; k++) { const x = p.getX(i + k), z = p.getZ(i + k), l = Math.hypot(x, z); if (l < 1e-6) { n.setXYZ(i + k, 0, Math.sign(ny) || 1, 0); continue; } n.setXYZ(i + k, x / l * nr, ny, z / l * nr); }
    }
  }
  // a round bar from point a to point b
  Geo.rod = function (a, b, r, seg, r2) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length(), g = Geo.cyl(r, len, seg || 8, r2);
    Q.setFromUnitVectors(V.set(0, 0, -1), d.normalize()); M.makeRotationFromQuaternion(Q); M.setPosition(a[0], a[1], a[2]); g.applyMatrix4(M);
    return g;
  };
  // an outline seen from the side (pairs of [distance forward, height]), pushed out to a width across x and centred on x = 0.
  // bevel: the chamfer on its edges; holes: outlines cut out of it; steps: chamfer steps
  Geo.prof = function (pts, width, bevel, holes, steps) {
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    bevel = Math.min(bevel === undefined ? 0.0015 : bevel, width / 2 - 1e-5);
    const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: steps || 1, curveSegments: 10, steps: 1 });
    g.translate(0, 0, -(width - bevel * 2) / 2);
    g.rotateY(Math.PI / 2); // (forward, up, across) -> (across, up, -forward): forward is -z
    g.deleteAttribute('uv');
    return g;
  };
  // an outline in the ground plan / any plane, pushed straight up: pts [x, z], from y0 to y1
  Geo.prism = function (pts, y0, y1, bevel, holes) {
    const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], -p[1])));
    if (holes) for (const h of holes) sh.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], -p[1]))));
    bevel = bevel || 0;
    const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0 - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: 12 });
    g.rotateX(-Math.PI / 2); g.translate(0, y0 + bevel, 0); g.deleteAttribute('uv');
    return g;
  };
  // an outline in the x-y plane pushed along z (an arch, a window frame): from z0 to z1
  Geo.slab = function (pts, z0, z1, bevel, holes, curve) {
    const sh = pts.isShape ? pts : new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
    if (holes) for (const h of holes) sh.holes.push(h.isPath ? h : new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    bevel = bevel || 0;
    const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0 - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1, curveSegments: curve || 16 });
    g.translate(0, 0, z0 + bevel); g.deleteAttribute('uv');
    return g;
  };
  // place a geometry: p position, r rotation (radians, XYZ), s scale (number or [x, y, z])
  Geo.xf = function (g, p, r, s) {
    E.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0); Q.setFromEuler(E);
    if (s === undefined) S.set(1, 1, 1); else if (typeof s === 'number') S.set(s, s, s); else S.set(s[0], s[1], s[2]);
    V.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0); M.compose(V, Q, S); g.applyMatrix4(M);
    return g;
  };
  // join geometries (already placed) into one, keeping position and normal only
  Geo.merge = function (list) {
    let n = 0; const parts = [];
    for (const g0 of list) { const g = g0.index ? g0.toNonIndexed() : g0; if (!g.attributes.normal) g.computeVertexNormals(); parts.push(g); n += g.attributes.position.count; }
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.count * 3; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  };
  // collects placed parts per material, then turns each material's parts into one mesh
  Geo.Builder = function () { this.by = new Map(); };
  Geo.Builder.prototype.add = function (mat, g, p, r, s) { if (p || r || s !== undefined) Geo.xf(g, p, r, s); let a = this.by.get(mat); if (!a) this.by.set(mat, a = []); a.push(g); return g; };
  Geo.Builder.prototype.build = function (parent, o) {
    o = o || {}; const out = [];
    for (const [mat, list] of this.by) {
      const m = new THREE.Mesh(Geo.merge(list), mat);
      m.castShadow = o.cast !== false; m.receiveShadow = o.receive !== false;
      if (parent) parent.add(m); out.push(m);
    }
    this.by.clear(); return out;
  };
})();
