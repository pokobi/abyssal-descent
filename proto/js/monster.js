'use strict';
// The foe: a skeleton soldier. The skull, jaw, pelvis and the long bones with their knobbed ends are distance fields turned to meshes
// (sdf.js); the ribs are bent tubes; the spine is one vertebra repeated; the helmet, shoulder plate, shield and sword are turned and
// pushed-out parts. It is a tree of joints, moved by a few lines of walk, swing and stagger; shot enough, it falls to pieces and
// pulls itself together again.
(function () {
  const S = P.S, G = P.Geo, Mo = P.Monster = { list: [] }, V3 = THREE.Vector3, TAU = Math.PI * 2;
  const smin = S.smin;
  const chain = (x, y, z, pts, r0, r1, k) => { let d = 1e9; const n = pts.length - 1; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1]; d = smin(d, S.cone(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r0 + (r1 - r0) * i / n, r0 + (r1 - r0) * (i + 1) / n), k || 0.004); } return d; };

  // ---- distance fields (metres; +z is the front, +y up; each about its own joint) ----
  function skull(x, y, z) {
    const ax = Math.abs(x);
    let d = S.ell(x, y, z, 0, 0.098, -0.012, 0.073, 0.08, 0.092);                                  // braincase
    d = smin(d, S.box(ax, y, z, 0, 0.05, 0.05, 0.049, 0.046, 0.031, 0.024), 0.028);                // the face
    d = smin(d, S.cap(ax, y, z, 0, 0.089, 0.079, 0.05, 0.085, 0.069, 0.0115), 0.012);              // brow ridge
    d = smin(d, S.ell(ax, y, z, 0.052, 0.036, 0.058, 0.02, 0.0135, 0.024), 0.012);                 // cheekbone
    d = smin(d, S.cap(ax, y, z, 0.058, 0.036, 0.046, 0.071, 0.04, -0.004, 0.0068), 0.008);         // its arch back to the ear
    d = smin(d, S.box(ax, y, z, 0, -0.005, 0.066, 0.03, 0.021, 0.02, 0.012), 0.016);               // upper jaw
    d = smin(d, S.ell(ax, y, z, 0.05, 0.02, -0.03, 0.016, 0.022, 0.018), 0.014);                   // mastoid, behind the ear
    d = S.cut(d, S.ell(ax, y, z, 0.031, 0.058, 0.09, 0.0215, 0.0195, 0.036), 0.006);               // eye sockets
    d = S.cut(d, S.ell(ax, y, z, 0.0078, 0.019, 0.097, 0.0105, 0.018, 0.024), 0.004);              // nose
    d = S.cut(d, S.ell(x, y, z, 0, 0.036, 0.097, 0.008, 0.013, 0.022), 0.004);
    d = S.cut(d, S.ell(ax, y, z, 0.087, 0.062, 0.014, 0.018, 0.03, 0.036), 0.012);                 // temple
    d = S.cut(d, S.ell(ax, y, z, 0.064, 0.016, 0.034, 0.012, 0.017, 0.03), 0.008);                 // the gap under the cheek arch
    return d;
  }
  function jaw(x, y, z) {
    const ax = Math.abs(x);
    let d = chain(ax, y, z, [[0, -0.066, 0.084], [0.02, -0.064, 0.075], [0.035, -0.058, 0.046], [0.046, -0.05, 0.012]], 0.0085, 0.0075);
    d = smin(d, chain(ax, y, z, [[0, -0.054, 0.081], [0.019, -0.052, 0.072], [0.033, -0.048, 0.045], [0.045, -0.042, 0.012]], 0.007, 0.0065), 0.006);
    d = smin(d, S.cone(ax, y, z, 0.046, -0.048, 0.012, 0.058, 0.012, 0.0, 0.009, 0.0065), 0.006);  // the branch up to the hinge
    d = smin(d, S.cone(ax, y, z, 0.05, -0.03, 0.014, 0.053, 0.004, 0.028, 0.006, 0.004), 0.005);
    d = smin(d, S.sph(x, y, z, 0, -0.068, 0.085, 0.011), 0.008);                                   // chin
    return d;
  }
  function pelvis(x, y, z) {
    const ax = Math.abs(x);
    let wing = S.ell(ax, y, z, 0.082, 0.04, -0.014, 0.055, 0.058, 0.044);
    wing = S.smax(wing, -S.ell(ax, y, z, 0.062, 0.056, 0.022, 0.058, 0.07, 0.054), 0.012);         // hollowed from the front: a thin flaring blade
    let d = wing;
    d = smin(d, S.box(x, y, z, 0, 0.03, -0.056, 0.03, 0.046, 0.014, 0.012), 0.02);                 // sacrum
    d = smin(d, S.cone(x, y, z, 0, -0.016, -0.06, 0, -0.062, -0.044, 0.012, 0.005), 0.01);
    d = smin(d, S.sph(ax, y, z, 0.085, -0.04, 0.0, 0.03), 0.02);                                   // about the hip socket
    d = smin(d, S.tor(ax, y, z, 0.05, -0.078, 0.022, 0.55, 0.0, 0.835, 0.03, 0.0085), 0.012);      // the ring below
    d = smin(d, S.cap(ax, y, z, 0, -0.072, 0.058, 0.04, -0.052, 0.05, 0.0095), 0.01);
    d = S.cut(d, S.sph(ax, y, z, 0.094, -0.042, 0.006, 0.0225), 0.004);
    return d;
  }
  // thigh bone of the left leg: the ball at the origin, the shaft out and down to the knee at (0.024, -0.445)
  function femur(x, y, z) {
    let d = S.sph(x, y, z, 0, 0, 0, 0.021);
    d = smin(d, S.cone(x, y, z, 0, 0, 0, 0.042, -0.022, 0, 0.013, 0.015), 0.01);
    d = smin(d, S.ell(x, y, z, 0.053, -0.012, -0.004, 0.016, 0.024, 0.018), 0.012);
    d = smin(d, S.cone(x, y, z, 0.044, -0.03, 0, 0.024, -0.4, 0.004, 0.0145, 0.0125), 0.014);
    d = smin(d, S.ell(x, y, z, 0.006, -0.435, 0.0, 0.019, 0.02, 0.024), 0.014);
    d = smin(d, S.ell(x, y, z, 0.042, -0.435, 0.0, 0.019, 0.02, 0.024), 0.014);
    d = S.cut(d, S.cap(x, y, z, 0.024, -0.465, -0.02, 0.024, -0.435, -0.022, 0.008), 0.006);
    return d;
  }
  // shin: the broad top under the knee, a three-sided shaft, the ankle knob; with the thin bone beside it
  function shin(x, y, z) {
    let d = S.ell(x, y, z, 0, -0.012, 0, 0.034, 0.016, 0.026);
    d = smin(d, S.cone(x, y, z, 0, -0.02, 0.004, 0.0, -0.36, 0.002, 0.016, 0.011), 0.016);
    d = smin(d, S.ell(x, y, z, -0.004, -0.385, 0, 0.02, 0.018, 0.018), 0.012);
    d = smin(d, S.cap(x, y, z, 0.03, -0.03, -0.012, 0.027, -0.385, -0.008, 0.0062), 0.006);        // fibula
    d = smin(d, S.sph(x, y, z, 0.028, -0.392, -0.008, 0.0105), 0.006);
    return d;
  }
  // upper arm of the left arm: the head turned in to the shoulder, the flared end at the elbow (0, -0.305)
  function humerus(x, y, z) {
    let d = S.sph(x, y, z, -0.012, -0.004, 0, 0.02);
    d = smin(d, S.ell(x, y, z, 0.008, -0.012, 0, 0.014, 0.018, 0.016), 0.01);
    d = smin(d, S.cone(x, y, z, 0.002, -0.02, 0, 0, -0.27, 0, 0.012, 0.0105), 0.012);
    d = smin(d, S.ell(x, y, z, 0, -0.295, 0, 0.027, 0.013, 0.013), 0.012);
    d = S.cut(d, S.sph(x, y, z, 0, -0.286, -0.017, 0.009), 0.005);
    return d;
  }
  const mirror = (fn) => (x, y, z) => fn(-x, y, z);
  // a plain long bone along -y: thin shaft, knobbed ends
  const bone = (len, r, ra, rb) => { const g = G.lathe([[0.0004, 0], [ra * 0.75, 0], [ra, ra * 0.5], [ra * 0.9, ra * 1.3], [r, len * 0.22], [r * 0.9, len * 0.5], [r, len * 0.8], [rb * 0.9, len - rb * 1.3], [rb, len - rb * 0.5], [rb * 0.7, len], [0.0004, len]], 10, false, true); g.rotateX(Math.PI); return g; };

  // a row of teeth round the jaw: each its own small block, some longer, some gone
  function teeth(y, r, cz, sd, down) {
    const out = []; let s = sd; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = -7; i <= 7; i++) {
      if (i === 0) continue; const k = Math.abs(i), a = (k - 0.5) / 7 * 1.28 * Math.sign(i), gone = rnd() < 0.14 && k > 1, hh = (k < 3 ? 0.0125 : k < 5 ? 0.0115 : 0.0095) * (0.85 + rnd() * 0.3), w = k < 3 ? 0.0046 : k < 5 ? 0.005 : 0.0062;
      if (gone) continue;
      out.push(G.xf(G.rbox(w, hh, k < 5 ? 0.0045 : 0.0066, 0.0015, 1), [Math.sin(a) * r, y + (down ? hh / 2 : -hh / 2), cz + Math.cos(a) * r], [(rnd() - 0.5) * 0.12, a, (rnd() - 0.5) * 0.1]));
    }
    return out;
  }
  let GEO = null, MAT = null;
  function makeParts() {
    const T = P.Tex;
    MAT = {
      bone: P.triMat(T.bone, { color: new THREE.Color(0.8, 0.83, 0.9), env: 0.9 }), boneD: P.triMat(T.bone, { color: new THREE.Color(0.6, 0.62, 0.66), size: 0.2, env: 0.9 }),
      armor: P.triMat(T.armor, { env: 1.1 }), iron: P.triMat(T.iron, { env: 1.0 }), wood: P.triMat(T.wood, { color: new THREE.Color(1.7, 1.55, 1.4), size: 0.7 }),
      leather: P.triMat(T.leather, { color: new THREE.Color(1.8, 1.3, 0.9), size: 0.12 }), rag: P.triMat(T.rag, { side: THREE.DoubleSide, color: new THREE.Color(1.25, 1.2, 1.15) }),
      eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 7.0, 5.6) }),
    };
    const g = GEO = {};
    g.skull = G.merge([S.mesh(skull, [-0.1, -0.05, -0.115], [0.1, 0.19, 0.11], 0.0026)].concat(teeth(-0.0245, 0.0275, 0.057, 5, false)));
    g.jaw = G.merge([S.mesh(jaw, [-0.07, -0.085, -0.012], [0.07, 0.025, 0.105], 0.0024)].concat(teeth(-0.0475, 0.0262, 0.056, 9, true))); g.jaw.translate(0, -0.012, 0);
    g.pelvis = S.mesh(pelvis, [-0.16, -0.125, -0.085], [0.16, 0.13, 0.085], 0.0038);
    g.femurL = S.mesh(femur, [-0.03, -0.47, -0.035], [0.08, 0.03, 0.035], 0.0036); g.femurR = S.mesh(mirror(femur), [-0.08, -0.47, -0.035], [0.03, 0.03, 0.035], 0.0036);
    g.shinL = S.mesh(shin, [-0.04, -0.415, -0.035], [0.045, 0.012, 0.035], 0.0036); g.shinR = S.mesh(mirror(shin), [-0.045, -0.415, -0.035], [0.04, 0.012, 0.035], 0.0036);
    g.humL = S.mesh(humerus, [-0.04, -0.32, -0.03], [0.035, 0.025, 0.03], 0.0034); g.humR = S.mesh(mirror(humerus), [-0.035, -0.32, -0.03], [0.04, 0.025, 0.03], 0.0034);
    // one vertebra, three sizes
    const vert = (r, h) => G.merge([G.lathe([[0.0004, 0], [r, 0], [r * 1.04, h * 0.12], [r * 0.86, h * 0.5], [r * 1.04, h * 0.88], [r, h], [0.0004, h]], 10, false, true),
      G.xf(G.rbox(r * 0.42, h * 0.8, r * 1.9, r * 0.15, 1), [0, h * 0.3, -r * 1.7], [0.45, 0, 0]), G.xf(G.rbox(r * 3.2, h * 0.5, r * 0.5, r * 0.15, 1), [0, h * 0.55, -r * 0.9])]);
    g.vertL = vert(0.021, 0.026); g.vertT = vert(0.0165, 0.0185); g.vertC = vert(0.012, 0.016);
    // ribs: a bent tube each, from the spine round to the breastbone; the lowest two stop short
    const Wd = [0.07, 0.096, 0.113, 0.125, 0.133, 0.137, 0.137, 0.132, 0.122, 0.106], Fr = [0.072, 0.086, 0.096, 0.101, 0.103, 0.1, 0.094, 0.082, 0.06, 0.03], ribs = [];
    for (let i = 0; i < 10; i++) for (const sx of [-1, 1]) {
      const y0 = 0.257 - i * 0.026, drop = 0.03 + i * 0.0065, pm = i < 7 ? 1 : i === 7 ? 0.9 : i === 8 ? 0.7 : 0.55, zc = (Fr[i] - 0.06) / 2, dz = (Fr[i] + 0.06) / 2, pts = [];
      for (let k = 0; k <= 12; k++) { const ph = k / 12 * Math.PI * pm; pts.push(new V3(sx * (0.007 + Wd[i] * Math.sin(ph)), y0 - drop * Math.pow(ph / Math.PI, 1.3), zc - dz * Math.cos(ph))); }
      ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0062 - i * 0.0001, 5, false));
      ribs.push(G.xf(new THREE.SphereGeometry(0.0062, 6, 5), [pts[12].x, pts[12].y, pts[12].z]));
    }
    ribs.push(G.xf(G.slab([[-0.026, 0.11], [0.026, 0.11], [0.03, 0.09], [0.02, 0.065], [0.017, -0.025], [0.012, -0.065], [0.005, -0.1], [-0.005, -0.1], [-0.012, -0.065], [-0.017, -0.025], [-0.02, 0.065], [-0.03, 0.09]], -0.006, 0.006, 0.0045), [0, 0.133, 0.1], [-0.12, 0, 0]));   // breastbone
    for (const sx of [-1, 1]) {
      ribs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new V3(sx * 0.018, 0.24, 0.092), new V3(sx * 0.07, 0.262, 0.08), new V3(sx * 0.125, 0.268, 0.04), new V3(sx * 0.178, 0.262, -0.005)]), 12, 0.0068, 6, false));   // collarbone
      const blade = G.prof([[0, 0], [0.058, 0.025], [0.01, 0.125], [-0.016, 0.108]], 0.006, 0.0025); G.xf(blade, null, [0, sx > 0 ? -1.42 : 1.42 + Math.PI, 0]); G.xf(blade, [sx * 0.08, 0.125, -0.098], [0.12, 0, sx * -0.1]); ribs.push(blade);   // shoulder blade
    }
    for (let i = 0; i < 12; i++) ribs.push(G.xf(g.vertT.clone(), [0, i * 0.0225, -0.062 - Math.sin(i / 11 * Math.PI) * 0.012]));
    g.chest = G.merge(ribs);
    const lum = []; for (let i = 0; i < 5; i++) lum.push(G.xf(g.vertL.clone(), [0, i * 0.032, Math.sin(i / 4 * Math.PI) * 0.014]));
    g.lumbar = G.merge(lum);
    const nk = []; for (let i = 0; i < 4; i++) nk.push(G.xf(g.vertC.clone(), [0, i * 0.021, i * 0.004]));
    g.neck = G.merge(nk);
    // forearm: two bones side by side; hand: a fist of small bones; foot
    g.forearm = G.merge([G.xf(bone(0.25, 0.0058, 0.0105, 0.0125), [0.011, 0, 0.002]), G.xf(bone(0.255, 0.0052, 0.013, 0.0085), [-0.011, 0, -0.002])]);
    const hand = [];
    for (let f = 0; f < 4; f++) {
      const x = -0.027 + f * 0.018;
      hand.push(G.rod([x * 0.5, -0.005, 0], [x, -0.07, 0.004], 0.0048, 6, 0.0055));
      hand.push(G.rod([x, -0.074, 0.006], [x, -0.105, 0.03], 0.005, 6, 0.0045)); hand.push(G.rod([x, -0.107, 0.033], [x, -0.094, 0.057], 0.0045, 6, 0.004)); hand.push(G.rod([x, -0.091, 0.058], [x, -0.07, 0.05], 0.004, 6, 0.0032));
      for (const p of [[x, -0.072, 0.005], [x, -0.106, 0.031], [x, -0.093, 0.058]]) hand.push(G.xf(new THREE.SphereGeometry(0.0058, 6, 5), p));
    }
    hand.push(G.rod([0.025, -0.01, 0.005], [0.04, -0.045, 0.025], 0.0055, 6, 0.005)); hand.push(G.rod([0.04, -0.047, 0.027], [0.03, -0.07, 0.052], 0.0048, 6, 0.004));
    hand.push(G.xf(G.rbox(0.05, 0.022, 0.024, 0.008, 1), [0, -0.006, 0]));
    g.hand = G.merge(hand);
    const foot = [G.xf(G.rbox(0.05, 0.045, 0.075, 0.016, 2), [0, -0.035, -0.012]), G.xf(G.rbox(0.04, 0.035, 0.05, 0.014, 2), [0, -0.058, -0.05])];
    for (let f = 0; f < 5; f++) { const x = -0.026 + f * 0.013; foot.push(G.rod([x * 0.6, -0.05, 0.02], [x, -0.078, 0.095], 0.0055, 6, 0.0045)); foot.push(G.rod([x, -0.08, 0.098], [x * 1.05, -0.086, 0.135 - Math.abs(f - 1) * 0.008], 0.0045, 6, 0.0035)); foot.push(G.xf(new THREE.SphereGeometry(0.0056, 6, 5), [x, -0.079, 0.096])); }
    g.foot = G.merge(foot);
    // a kettle helmet: a dome with a wide brim, a row of rivets
    const hl = [G.lathe([[0.0005, 0.142], [0.05, 0.134], [0.086, 0.107], [0.101, 0.062], [0.104, 0.03], [0.156, 0.006], [0.157, -0.001], [0.099, 0.021], [0.095, 0.06], [0.081, 0.101], [0.048, 0.127], [0.0005, 0.135]], 28, false, true)];
    for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; hl.push(G.xf(new THREE.SphereGeometry(0.006, 6, 5), [Math.cos(a) * 0.108, 0.033, Math.sin(a) * 0.108])); }
    hl.push(G.lathe([[0.1035, 0.026], [0.108, 0.026], [0.108, 0.04], [0.1035, 0.04]], 28, true, true));
    g.helmet = G.merge(hl); g.helmet.scale(1.1, 0.92, 1.1);
    // shoulder plate: three lapped shells
    const sp = []; for (let i = 0; i < 2; i++) sp.push(G.xf(G.lathe([[0.0005, 0.052], [0.05, 0.043], [0.088, 0.012], [0.094, -0.02], [0.089, -0.021], [0.083, 0.008], [0.047, 0.037], [0.0005, 0.046]], 20, false, true), [0.02 * i, -0.04 * i, 0], [0, 0, -0.34 * i], 1 - i * 0.1));
    g.shoulder = G.merge(sp);
    // sword: a blade with a ridge, cross-guard, wrapped grip, pommel (along +y from the hand)
    g.blade = G.merge([G.xf(G.prof([[0.0, 0.03], [0.024, 0.026], [0.048, 0.03], [0.042, 0.74], [0.024, 0.9], [0.006, 0.74]].map((p) => [p[0] - 0.024, p[1]]), 0.0078, 0.0036), null, [0, Math.PI / 2, 0])]);
    g.hilt = G.merge([G.xf(G.rbox(0.2, 0.02, 0.026, 0.006, 1), [0, 0.02, 0]), G.xf(G.rbox(0.03, 0.03, 0.03, 0.008, 1), [0.1, 0.02, 0]), G.xf(G.rbox(0.03, 0.03, 0.03, 0.008, 1), [-0.1, 0.02, 0]),
      G.lathe([[0.0005, -0.165], [0.016, -0.16], [0.021, -0.145], [0.016, -0.128], [0.008, -0.122], [0.0005, -0.122]], 12, false, true)]);
    g.grip = G.lathe([[0.0005, -0.125], [0.0115, -0.125], [0.0135, -0.07], [0.012, 0.01], [0.0005, 0.01]], 10, false, true);
    // shield: boards, an iron rim and boss, studs
    g.shieldW = G.lathe([[0.0005, 0.048], [0.1, 0.044], [0.2, 0.03], [0.292, 0.004], [0.292, -0.012], [0.2, 0.014], [0.1, 0.028], [0.0005, 0.032]], 36, false, true); g.shieldW.rotateX(Math.PI / 2);
    const si = [G.lathe([[0.278, 0.012], [0.3, 0.004], [0.303, -0.008], [0.296, -0.016], [0.28, -0.006]], 36, false, true), G.lathe([[0.0005, 0.1], [0.03, 0.094], [0.055, 0.074], [0.066, 0.05], [0.082, 0.044], [0.082, 0.038], [0.0005, 0.04]], 20, false, true)];
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; si.push(G.xf(new THREE.SphereGeometry(0.008, 6, 5), [Math.cos(a) * 0.23, 0.027, Math.sin(a) * 0.23])); }
    g.shieldI = G.merge(si); g.shieldI.rotateX(Math.PI / 2);
    // rags from the belt: strips with torn ends
    const rag = (w, len, sd) => {
      const nx = 7, ny = 12, pos = [], idx = []; let s = sd;
      const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
      const ends = []; for (let i = 0; i <= nx; i++) ends.push(len * (0.62 + rnd() * 0.38));
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const u = i / nx - 0.5, v = j / ny; pos.push(u * w * (1 + v * 0.25), -v * ends[i], Math.sin(u * 7 + v * 5 + sd) * 0.012 * v + v * v * 0.05); }
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
      const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setIndex(idx); gg.computeVertexNormals(); return gg;
    };
    g.rags = G.merge([G.xf(rag(0.13, 0.42, 3), [-0.035, 0, 0.105], [0.06, 0, 0]), G.xf(rag(0.22, 0.4, 11), [0, 0, -0.095], [0.05, Math.PI, 0]), G.xf(rag(0.1, 0.3, 23), [0.145, 0, 0.0], [0, Math.PI / 2, 0.05]), G.xf(rag(0.07, 0.5, 31), [-0.11, 0, 0.07], [0.05, -0.6, 0])]);
    g.belt = G.merge([G.lathe([[0.118, -0.019], [0.125, -0.019], [0.126, 0.019], [0.119, 0.019]], 24, true, true), G.xf(G.rbox(0.045, 0.05, 0.012, 0.004, 1), [0, 0, 0.125])]); g.belt.scale(1.2, 1, 0.86);
    g.eye = new THREE.SphereGeometry(0.0042, 10, 8);
  }

  function Foe(scene, x, z) {
    const self = this; this.scene = scene; this.parts = []; this.proxies = [];
    const root = this.root = new THREE.Group(); scene.add(root); root.position.set(x, 0, z);
    const node = (parent, px, py, pz) => { const n = new THREE.Group(); n.position.set(px, py, pz); parent.add(n); return n; };
    const part = (parent, geo, mat, px, py, pz, rx, ry, rz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px || 0, py || 0, pz || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); m.castShadow = true; m.receiveShadow = true; parent.add(m); self.parts.push({ m, parent, p: m.position.clone(), q: m.quaternion.clone(), v: new V3(), w: new V3(), r: 0.03 }); return m; };
    const proxy = (parent, w, h, d, px, py, pz, name, dmg) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.eye); m.position.set(px, py, pz); m.visible = false; m.userData.foe = { foe: self, part: name, dmg }; parent.add(m); self.proxies.push(m); };
    const J = this.J = {};
    J.hips = node(root, 0, 0.985, 0);
    part(J.hips, GEO.pelvis, MAT.bone); part(J.hips, GEO.belt, MAT.leather, 0, 0.058, -0.012, 0.1, 0, 0.04); part(J.hips, GEO.rags, MAT.rag, 0, 0.052, -0.01);
    proxy(J.hips, 0.3, 0.24, 0.2, 0, 0.0, 0, 'hips', 14);
    J.spine = node(J.hips, 0, 0.07, -0.05); part(J.spine, GEO.lumbar, MAT.bone);
    J.chest = node(J.spine, 0, 0.165, 0.062); part(J.chest, GEO.chest, MAT.bone);
    proxy(J.chest, 0.3, 0.32, 0.22, 0, 0.14, 0.01, 'chest', 14);
    J.neck = node(J.chest, 0, 0.275, -0.06); part(J.neck, GEO.neck, MAT.bone);
    J.head = node(J.neck, 0, 0.085, 0.022); part(J.head, GEO.skull, MAT.bone); part(J.head, GEO.helmet, MAT.armor, 0, 0.068, -0.012, -0.08, 0, 0.04);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(GEO.eye, MAT.eye); e.position.set(sx * 0.031, 0.058, 0.053); J.head.add(e); (this.eyes = this.eyes || []).push(e); }
    proxy(J.head, 0.17, 0.26, 0.2, 0, 0.08, 0, 'head', 40);
    J.jaw = node(J.head, 0, 0.012, 0); part(J.jaw, GEO.jaw, MAT.bone);
    for (const sx of [-1, 1]) {
      const k = sx > 0 ? 'L' : 'R';
      const sh = J['sh' + k] = node(J.chest, sx * 0.19, 0.25, -0.012); part(sh, sx > 0 ? GEO.humL : GEO.humR, MAT.bone); proxy(sh, 0.07, 0.32, 0.07, 0, -0.15, 0, 'arm', 8);
      const el = J['el' + k] = node(sh, 0, -0.305, 0); part(el, GEO.forearm, MAT.bone); proxy(el, 0.06, 0.27, 0.06, 0, -0.13, 0, 'arm', 8);
      const wr = J['wr' + k] = node(el, 0, -0.262, 0); part(wr, GEO.hand, MAT.boneD, 0, 0, 0, 0, sx > 0 ? 0 : Math.PI, 0);
      const hp = J['hp' + k] = node(J.hips, sx * 0.087, -0.04, 0.004); part(hp, sx > 0 ? GEO.femurL : GEO.femurR, MAT.bone); proxy(hp, 0.08, 0.46, 0.08, sx * 0.03, -0.22, 0, 'leg', 10);
      const kn = J['kn' + k] = node(hp, sx * 0.024, -0.447, 0); part(kn, sx > 0 ? GEO.shinL : GEO.shinR, MAT.bone); proxy(kn, 0.07, 0.4, 0.07, 0, -0.2, 0, 'leg', 10);
      const an = J['an' + k] = node(kn, 0, -0.4, 0); part(an, GEO.foot, MAT.boneD);
    }
    part(J.shL, GEO.shoulder, MAT.armor, 0.018, 0.004, 0, 0, 0, -0.8);
    // sword in the right hand, shield on the left forearm
    J.sword = node(J.wrR, 0.004, -0.085, 0.04); J.sword.rotation.set(1.45, 0, 0);
    part(J.sword, GEO.blade, MAT.armor); part(J.sword, GEO.hilt, MAT.iron); part(J.sword, GEO.grip, MAT.leather);
    J.shield = node(J.elL, -0.05, -0.14, 0.0); J.shield.rotation.set(0, -Math.PI / 2, 0);
    part(J.shield, GEO.shieldW, MAT.wood); part(J.shield, GEO.shieldI, MAT.iron);
    proxy(J.shield, 0.58, 0.58, 0.06, 0, 0, 0.02, 'shield', 0);
    for (const pt of this.parts) { pt.m.geometry.computeBoundingSphere(); pt.r = Math.min(0.12, Math.max(0.02, pt.m.geometry.boundingSphere.radius * 0.45)); }
    this.atkArm = { sx: 0, sy: 0, sz: 0, ex: 0, wx: 0 }; this.atkLean = this.atkTwist = this.atkJaw = 0; this.look = 0;
    this.state = 'idle'; this.t = Math.random() * 10; this.ph = 0; this.hp = 100; this.stag = new V3(); this.stagV = new V3(); this.atk = 0; this.yaw = 0; this.home = new V3(x, 0, z); this.speed = 0; this.wake = false;
    P.hitTargets = (P.hitTargets || []).concat(this.proxies);
    this.pose(0, 0.016);
  }
  Foe.prototype.pose = function (time, dt) {
    const J = this.J, t = this.t, ph = this.ph, sp = this.speed, w = Math.min(1, sp / 1.1), s = Math.sin, st = this.stag;
    const jit = (f, o) => s(t * f + o) * 0.5 + s(t * f * 2.3 + o * 1.7) * 0.3;                       // a restless, rattling tremor
    J.hips.position.y = 0.985 - Math.abs(s(ph)) * 0.022 * w - 0.04 + s(t * 1.1) * 0.004;
    J.hips.rotation.set(0.06 + st.x * 0.3, s(ph) * 0.12 * w + 0.12, s(ph) * 0.05 * w + st.z * 0.3 + 0.03);
    J.spine.rotation.set(0.1 + st.x * 0.5 + jit(1.3, 0) * 0.02, -s(ph) * 0.08 * w + st.y * 0.4, st.z * 0.4);
    J.chest.rotation.set(0.18 + st.x * 0.7 + s(t * 1.7) * 0.02 - this.atkLean * 0.3, -s(ph) * 0.14 * w + st.y * 0.6 + this.atkTwist - 0.2, jit(0.9, 2) * 0.03 + st.z * 0.5);
    J.neck.rotation.set(0.05 + jit(2.1, 1) * 0.03, this.look * 0.5 + 0.06, 0);
    J.head.rotation.set(-0.3 + jit(3.3, 4) * 0.04 + st.x * 0.4, this.look * 0.5 + jit(1.9, 3) * 0.05 + 0.04, jit(1.2, 5) * 0.07 + 0.06);
    const chat = Math.max(0, s(t * 0.7) * s(t * 0.23 + 1) - 0.25) * 2 + this.atkJaw;
    J.jaw.rotation.x = 0.06 + chat * (0.2 + 0.2 * s(t * 31)) + this.atkJaw * 0.25;
    for (const sx of [-1, 1]) {
      const k = sx > 0 ? 'L' : 'R', p = ph + (sx > 0 ? 0 : Math.PI);
      J['hp' + k].rotation.set(-s(p) * 0.5 * w - 0.2 - (sx > 0 ? 0.12 : -0.06) * (1 - w), sx > 0 ? 0.25 : -0.1, sx * 0.05);
      J['kn' + k].rotation.x = (Math.max(0, s(p - 0.9)) * 0.95 + 0.1) * w + 0.3 + (sx > 0 ? 0.1 : 0) * (1 - w);
      J['an' + k].rotation.x = s(p) * 0.25 * w - 0.14;
    }
    // shield arm held up across the body; sword arm low and ready, or swinging
    J.shL.rotation.set(-0.35 + s(ph) * 0.1 * w + jit(1.1, 6) * 0.03, 0, 0.22); J.elL.rotation.set(-1.35 + jit(1.4, 7) * 0.04, 0.5, 0); J.wrL.rotation.set(0, 0, 0);
    const a = this.atkArm;
    J.shR.rotation.set(-0.25 - s(ph) * 0.18 * w + a.sx + jit(1.2, 8) * 0.03, a.sy, -0.2 + a.sz); J.elR.rotation.set(-0.7 + a.ex + jit(1.5, 9) * 0.04, 0, 0); J.wrR.rotation.set(a.wx, 0, 0);
  };
  Foe.prototype.update = function (dt, time, pl) {
    this.t += dt;
    if (this.state === 'dead' || this.state === 'rise') { this.fall(dt); return; }
    const r = this.root, dx = pl.pos.x - r.position.x, dz = pl.pos.z - r.position.z, dist = Math.hypot(dx, dz);
    if (!this.wake && (dist < 9 || this.hp < 100)) this.wake = true;
    const want = Math.atan2(dx, dz); let dy = want - this.yaw; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
    let target = 0;
    if (this.wake) {
      this.yaw += dy * (1 - Math.exp(-dt * 3.5));
      if (this.atk > 0) { this.atk -= dt; }
      else if (dist > 1.75) target = 1.25;
      else { this.atk = 1.25; }
    }
    this.look = this.wake ? 0 : Math.max(-0.7, Math.min(0.7, dy)) * (dist < 14 ? 1 : 0);
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * 5)); this.ph += dt * this.speed * 4.6;
    r.position.x += Math.sin(this.yaw) * this.speed * dt; r.position.z += Math.cos(this.yaw) * this.speed * dt; P.Room.collide(r.position, 0.4); r.rotation.y = this.yaw;
    // the swing: back and up, then down across
    const A = this.atkArm; let k = 0, lean = 0, tw = 0, jw = 0;
    if (this.atk > 0) {
      const u = 1 - this.atk / 1.25, e = (x) => x * x * (3 - 2 * x);
      if (u < 0.45) { k = e(u / 0.45); A.sx = -2.3 * k; A.sy = 0.3 * k; A.sz = -0.3 * k; A.ex = -0.9 * k; A.wx = -0.4 * k; tw = 0.35 * k; lean = -0.4 * k; jw = k; }
      else if (u < 0.62) { k = e((u - 0.45) / 0.17); A.sx = -2.3 + 3.0 * k; A.sy = 0.3 - 0.9 * k; A.sz = -0.3 + 0.5 * k; A.ex = -0.9 + 1.0 * k; A.wx = -0.4 + 0.9 * k; tw = 0.35 - 0.8 * k; lean = -0.4 + 1.2 * k; jw = 1;
        if (!this.hitDone && k > 0.6 && dist < 2.3) { this.hitDone = true; P.Post.set.hurt = 1; } }
      else { k = 1 - e((u - 0.62) / 0.38); A.sx = 0.7 * k; A.sy = -0.6 * k; A.sz = 0.2 * k; A.ex = 0.1 * k; A.wx = 0.5 * k; tw = -0.45 * k; lean = 0.8 * k; jw = k; }
    } else { A.sx = A.sy = A.sz = A.ex = A.wx = 0; this.hitDone = false; }
    this.atkLean = lean; this.atkTwist = tw; this.atkJaw = jw;
    // stagger: a spring
    this.stagV.addScaledVector(this.stag, -60 * dt).multiplyScalar(Math.exp(-dt * 7)); this.stag.addScaledVector(this.stagV, dt);
    this.pose(time, dt);
  };
  Foe.prototype.hit = function (proxy, point, dir) {
    const d = proxy.userData.foe; if (this.state !== 'idle') return;
    this.hp -= d.dmg; this.wake = true;
    const loc = dir.clone().applyAxisAngle(new V3(0, 1, 0), -this.yaw);
    this.stagV.x += loc.z * -5; this.stagV.z += loc.x * 5; this.stagV.y += (Math.random() - 0.5) * 6;
    if (this.hp <= 0) this.collapse(dir, point);
  };
  // every piece lets go and falls
  Foe.prototype.collapse = function (dir, point) {
    this.state = 'dead'; this.dt = 0; for (const e of this.eyes) e.visible = false;
    P.hitTargets = P.hitTargets.filter((m) => !this.proxies.includes(m));
    const wp = new V3();
    for (const pt of this.parts) {
      this.scene.attach(pt.m); pt.m.getWorldPosition(wp);
      const near = Math.max(0, 1 - wp.distanceTo(point) / 0.9);
      pt.v.set((Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 1.6).addScaledVector(dir, 1.2 + near * 4.5);
      pt.w.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9); pt.rest = false;
    }
  };
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _p = new V3(), _s = new V3(), _q2 = new THREE.Quaternion();
  Foe.prototype.fall = function (dt) {
    this.dt += dt;
    if (this.state === 'dead') {
      for (const pt of this.parts) {
        if (pt.rest) continue; const m = pt.m;
        pt.v.y -= 9.8 * dt; m.position.addScaledVector(pt.v, dt);
        _e.set(pt.w.x * dt, pt.w.y * dt, pt.w.z * dt); m.quaternion.premultiply(_q.setFromEuler(_e));
        P.Room.collide(m.position, pt.r);
        if (m.position.y < pt.r) { m.position.y = pt.r; if (Math.abs(pt.v.y) < 0.7) { pt.rest = true; } else { pt.v.y *= -0.32; pt.v.x *= 0.6; pt.v.z *= 0.6; pt.w.multiplyScalar(0.55); } }
      }
      if (this.dt > 7) { this.state = 'rise'; this.dt = 0; this.root.position.copy(this.home); this.yaw = 0; this.root.rotation.y = 0; this.speed = 0; this.atk = 0; this.stag.set(0, 0, 0); this.stagV.set(0, 0, 0); this.atkArm = { sx: 0, sy: 0, sz: 0, ex: 0, wx: 0 }; this.atkLean = this.atkTwist = this.atkJaw = 0; this.look = 0; this.pose(0, 0.016); this.root.updateMatrixWorld(true); }
      return;
    }
    // rise: each piece is drawn back to where it belongs
    const u = Math.min(1, this.dt / 1.6), k = 1 - Math.exp(-dt * (2 + u * 14));
    for (const pt of this.parts) {
      _m.compose(pt.p, pt.q, _s.set(1, 1, 1)).premultiply(pt.parent.matrixWorld); _m.decompose(_p, _q2, _s);
      pt.m.position.lerp(_p, k); pt.m.quaternion.slerp(_q2, k);
    }
    if (u >= 1) {
      for (const pt of this.parts) { pt.parent.add(pt.m); pt.m.position.copy(pt.p); pt.m.quaternion.copy(pt.q); }
      for (const e of this.eyes) e.visible = true;
      this.state = 'idle'; this.hp = 100; this.wake = false; P.hitTargets = P.hitTargets.concat(this.proxies);
    }
  };

  Mo.build = function (scene) {
    makeParts();
    const f = new Foe(scene, 0.2, -5.2); f.atkArm = { sx: 0, sy: 0, sz: 0, ex: 0, wx: 0 }; f.atkLean = f.atkTwist = f.atkJaw = 0; f.look = 0; f.yaw = 0;
    Mo.list.push(f); f.root.userData.noEnv = true;
  };
  Mo.update = function (dt, time, pl) { if (Mo.frozen) dt = 0; for (const f of Mo.list) f.update(dt, time, pl); P.Post.set.hurt *= Math.exp(-dt * 3); };
  Mo.hit = function (proxy, point, dir) { proxy.userData.foe.foe.hit(proxy, point, dir); };
  Mo.respawn = function () { for (const f of Mo.list) { if (f.state === 'dead') f.dt = 99; else if (f.state === 'idle') { f.root.position.copy(f.home); f.wake = false; f.hp = 100; } } };
})();
