'use strict';
// Rounded, organic shapes (a skull, a gloved hand, bones) are described as distance fields - smooth unions and cuts of simple solids -
// and turned into a mesh here (surface nets), with normals taken from the field.
(function () {
  const S = P.S = {};
  S.sph = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;
  S.ell = (x, y, z, cx, cy, cz, rx, ry, rz) => { const a = (x - cx) / rx, b = (y - cy) / ry, c = (z - cz) / rz, k0 = Math.hypot(a, b, c), k1 = Math.hypot(a / rx, b / ry, c / rz); return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1; };
  S.cap = (x, y, z, ax, ay, az, bx, by, bz, r) => {
    const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
    let h = (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1); h = h < 0 ? 0 : h > 1 ? 1 : h;
    return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - r;
  };
  // a capsule whose radius runs from r1 at a to r2 at b
  S.cone = (x, y, z, ax, ay, az, bx, by, bz, r1, r2) => {
    const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
    let h = (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz || 1); h = h < 0 ? 0 : h > 1 ? 1 : h;
    return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - (r1 + (r2 - r1) * h);
  };
  S.box = (x, y, z, cx, cy, cz, hx, hy, hz, r) => {
    const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
  };
  // a ring about an axis (nx, ny, nz: unit normal of its plane), R: its radius, r: the thickness
  S.tor = (x, y, z, cx, cy, cz, nx, ny, nz, R, r) => {
    const px = x - cx, py = y - cy, pz = z - cz, h = px * nx + py * ny + pz * nz, q = Math.hypot(px - nx * h, py - ny * h, pz - nz * h) - R;
    return Math.hypot(q, h) - r;
  };
  S.smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  S.smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
  S.cut = (a, b, k) => S.smax(a, -b, k); // a with b carved out of it

  // fn(x, y, z) -> distance; b0 / b1: the box to look in; cell: the size of one step. Returns a geometry (position, normal)
  S.mesh = function (fn, b0, b1, cell) {
    const nx = Math.ceil((b1[0] - b0[0]) / cell) + 1, ny = Math.ceil((b1[1] - b0[1]) / cell) + 1, nz = Math.ceil((b1[2] - b0[2]) / cell) + 1;
    const val = new Float32Array(nx * ny * nz);
    for (let k = 0, o = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++, o++) val[o] = fn(b0[0] + i * cell, b0[1] + j * cell, b0[2] + k * cell);
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
      if (i < cx && j > 0 && k > 0 && j < cy + 0 && k < cz + 0) { const v1 = at(i + 1, j, k); if ((v0 < 0) !== (v1 < 0)) quad(V(i, j - 1, k - 1), V(i, j, k - 1), V(i, j, k), V(i, j - 1, k), v0 < 0); }
      if (j < cy && i > 0 && k > 0 && i < cx + 0 && k < cz + 0) { const v1 = at(i, j + 1, k); if ((v0 < 0) !== (v1 < 0)) quad(V(i - 1, j, k - 1), V(i, j, k - 1), V(i, j, k), V(i - 1, j, k), v0 >= 0); }
      if (k < cz && i > 0 && j > 0 && i < cx + 0 && j < cy + 0) { const v1 = at(i, j, k + 1); if ((v0 < 0) !== (v1 < 0)) quad(V(i - 1, j - 1, k), V(i, j - 1, k), V(i, j, k), V(i - 1, j, k), v0 < 0); }
    }
    // normals from the field itself: smoother and truer than the faces'
    const nor = new Float32Array(pos.length), e = cell * 0.5;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      let gx = fn(x + e, y, z) - fn(x - e, y, z), gy = fn(x, y + e, z) - fn(x, y - e, z), gz = fn(x, y, z + e) - fn(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1; nor[i] = gx / l; nor[i + 1] = gy / l; nor[i + 2] = gz / l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
    return g;
  };
})();
