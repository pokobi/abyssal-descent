'use strict';
// The hands on the rifle. Each is one rounded shape - fingers, palm and thumb melted together as a distance field (sdf.js) in the pose
// that holds the gun - with a sleeve behind it. Panels of the glove (a pad on the back, a strap at the wrist, finger tips) are the same
// shape grown a little and cut to a region. They are built in the gun's own space, so they move with it.
(function () {
  const S = P.S, H = P.Hands = {};
  // a finger: a chain of capsules through the points, thinning from r0 to r1, its joints a little swollen
  const chain = (x, y, z, pts, r0, r1, k) => {
    let d = 1e9; const n = pts.length - 1;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1], ra = r0 + (r1 - r0) * i / n, rb = r0 + (r1 - r0) * (i + 1) / n; d = S.smin(d, S.cone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], ra, rb), k || 0.0035); }
    for (let i = 1; i < n; i++) { const a = pts[i]; d = S.smin(d, S.sph(x, y, z, a[0], a[1], a[2], (r0 + (r1 - r0) * i / n) * 1.08), 0.003); }
    return d;
  };
  const SH = 0.38; // the grip leans back this much per unit down; the right hand is built upright and sheared to it

  // the right hand, closed on the grip, the first finger in the guard
  function right(x, y, z0) {
    const z = z0 - (-0.058 - y) * SH;
    let d = S.box(x, y, z, 0.0245, -0.108, 0.082, 0.0105, 0.045, 0.025, 0.011);                    // palm, flat on the grip's right side
    d = S.smin(d, S.cap(x, y, z, 0.002, -0.07, 0.109, 0.023, -0.076, 0.101, 0.0155), 0.012);       // the web, high under the receiver's tail
    d = S.smin(d, S.cap(x, y, z, 0.018, -0.148, 0.101, 0.027, -0.122, 0.096, 0.0165), 0.012);      // heel of the hand
    d = S.smin(d, S.ell(x, y, z, 0.033, -0.105, 0.082, 0.012, 0.042, 0.03), 0.01);                 // back of the hand
    let f = 1e9;
    const ys = [-0.088, -0.109, -0.1295], rs = [0.0101, 0.0098, 0.0089];
    for (let i = 0; i < 3; i++) { const yy = ys[i]; f = S.smin(f, chain(x, y, z, [[0.03, yy, 0.066], [0.0185, yy, 0.0455], [-0.008, yy, 0.0445], [-0.0225, yy + 0.001, 0.059], [-0.023, yy + 0.003, 0.078]], rs[i], rs[i] * 0.86), 0.0022); }
    f = S.smin(f, chain(x, y, z, [[0.03, -0.068, 0.068], [0.0235, -0.066, 0.041], [0.0115, -0.067, 0.0225], [-0.004, -0.0695, 0.0175]], 0.0097, 0.0082), 0.0022);   // trigger finger
    d = S.smin(d, f, 0.009);
    d = S.smin(d, chain(x, y, z, [[0.014, -0.066, 0.113], [-0.011, -0.055, 0.107], [-0.0225, -0.047, 0.087], [-0.023, -0.041, 0.063]], 0.0125, 0.0096), 0.009);       // thumb, round to the left side
    d = S.smin(d, S.cone(x, y, z, 0.03, -0.14, 0.1, 0.044, -0.2, 0.15, 0.027, 0.031), 0.012);       // wrist
    return d;
  }
  function rightCuff(x, y, z0) { const z = z0 - (-0.058 - y) * SH; return S.cone(x, y, z, 0.0405, -0.185, 0.137, 0.048, -0.216, 0.164, 0.0345, 0.0365); }

  // the left hand, clamped on the handguard from its left: the palm on the left face, three fingers round underneath to the right,
  // the first finger laid forward along the left face, the thumb over the top
  const LZ = -0.246;
  function left(x, y, z) {
    let d = S.box(x, y, z, -0.0365, -0.006, LZ, 0.0115, 0.035, 0.041, 0.0115);
    d = S.smin(d, S.ell(x, y, z, -0.0445, -0.004, LZ, 0.0105, 0.033, 0.039), 0.008);                 // the back of the hand swells out
    for (const zz of [-0.215, -0.236, -0.257, -0.277]) d = S.smin(d, S.sph(x, y, z, -0.041, -0.036, zz, 0.0122), 0.006);   // knuckles
    let f = 1e9; const zs = [-0.236, -0.257, -0.277], rs = [0.0101, 0.0098, 0.0088];
    for (let i = 0; i < 3; i++) { const zz = zs[i]; f = S.smin(f, chain(x, y, z, [[-0.037, -0.04, zz], [-0.02, -0.0475, zz], [0.008, -0.0385, zz - 0.001], [0.0285, -0.0225, zz - 0.002], [0.0315, -0.002, zz - 0.003]], rs[i], rs[i] * 0.86), 0.0022); }
    f = S.smin(f, chain(x, y, z, [[-0.039, -0.031, -0.282], [-0.0345, -0.016, -0.31], [-0.0325, -0.009, -0.336], [-0.032, -0.006, -0.359]], 0.0099, 0.0082), 0.0022);   // first finger, forward along the left face
    d = S.smin(d, f, 0.009);
    d = S.smin(d, chain(x, y, z, [[-0.037, 0.02, -0.213], [-0.0285, 0.0375, -0.229], [-0.013, 0.0425, -0.25], [0.002, 0.043, -0.272]], 0.0124, 0.0096), 0.009);   // thumb over the rail
    d = S.smin(d, S.cone(x, y, z, -0.041, -0.012, -0.203, -0.078, -0.05, -0.105, 0.0275, 0.032), 0.014); // wrist
    return d;
  }
  const leftCuff = (x, y, z) => S.cone(x, y, z, -0.066, -0.037, -0.138, -0.082, -0.054, -0.094, 0.0365, 0.0385);
  // panels on the left glove: the same shape grown a little, cut to a region
  const leftPad = (x, y, z) => S.smax(left(x, y, z) - 0.0019, S.box(x, y, z, -0.05, 0.006, LZ, 0.016, 0.02, 0.027, 0.006), 0.002);
  const leftThumb = (x, y, z) => S.smax(left(x, y, z) - 0.0017, S.box(x, y, z, -0.012, 0.045, -0.255, 0.02, 0.012, 0.016, 0.004), 0.002);
  const leftKnuckle = (x, y, z) => S.smax(left(x, y, z) - 0.0024, S.box(x, y, z, -0.047, -0.038, LZ, 0.014, 0.009, 0.039, 0.005), 0.002);
  const leftStrap = (x, y, z) => { const t = ((x + 0.041) * -0.037 + (y + 0.012) * -0.038 + (z + 0.203) * 0.098) / 0.1114; return S.smax(left(x, y, z) - 0.0017, Math.abs(t - 0.05) - 0.011, 0.0015); };
  // sleeves
  const rightArm = (x, y, z) => S.cone(x, y, z, 0.05, -0.208, 0.215, 0.12, -0.33, 0.5, 0.04, 0.056);
  const leftArm = (x, y, z) => S.cone(x, y, z, -0.076, -0.048, -0.11, -0.2, -0.22, 0.24, 0.037, 0.05);

  H.build = function (Gun) {
    const T = P.Tex, C = (r, g, b) => new THREE.Color(r, g, b);
    const M = H.mats = {
      glove: P.triMat(T.leather, { color: C(4.6, 4.0, 3.0), size: 0.045, normal: 0.8, env: 1.0, rough: 1.15, vm: true }),
      pad: P.triMat(T.polymer, { color: C(1.5, 1.5, 1.5), size: 0.04, env: 1.0, vm: true }),
      strap: P.triMat(T.cloth, { color: C(0.5, 0.48, 0.44), size: 0.03, env: 0.8, vm: true }),
      cuff: P.triMat(T.leather, { color: C(1.6, 1.3, 1.0), size: 0.05, normal: 1.0, env: 0.9, vm: true }),
      sleeve: P.triMat(T.cloth, { color: C(1.5, 1.55, 1.4), size: 0.045, normal: 1.0, env: 0.8, vm: true }),
    };
    const mk = (fn, b0, b1, cell, mat, parent) => { const m = new THREE.Mesh(S.mesh(fn, b0, b1, cell), mat); m.receiveShadow = true; m.frustumCulled = false; parent.add(m); return m; };
    const R = H.right = new THREE.Group(), L = H.left = new THREE.Group();
    mk(right, [-0.045, -0.24, -0.005], [0.085, -0.02, 0.2], 0.0019, M.glove, R);
    mk(rightCuff, [-0.01, -0.25, 0.14], [0.1, -0.13, 0.27], 0.003, M.cuff, R);
    mk(rightArm, [-0.02, -0.4, 0.15], [0.19, -0.15, 0.56], 0.006, M.sleeve, R);
    mk(left, [-0.125, -0.1, -0.385], [0.055, 0.065, -0.075], 0.0019, M.glove, L);
    mk(leftPad, [-0.075, -0.03, -0.285], [-0.03, 0.04, -0.205], 0.0014, M.pad, L);
    mk(leftThumb, [-0.04, 0.028, -0.28], [0.015, 0.064, -0.23], 0.0014, M.pad, L);
    mk(leftKnuckle, [-0.07, -0.058, -0.295], [-0.028, -0.02, -0.2], 0.0014, M.pad, L);
    mk(leftStrap, [-0.11, -0.085, -0.2], [-0.02, 0.03, -0.11], 0.0018, M.strap, L);
    mk(leftCuff, [-0.13, -0.1, -0.15], [-0.02, 0.01, -0.07], 0.003, M.cuff, L);
    mk(leftArm, [-0.27, -0.29, -0.13], [-0.02, 0.0, 0.28], 0.006, M.sleeve, L);
    Gun.model.group.add(R, L);
  };
})();
