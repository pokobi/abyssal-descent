'use strict';
// The rifle. Built from outlines pushed out to a thickness (receivers, grip, magazine, stock), turned parts (barrel, tube), a rail of real
// teeth, and a handguard of eight plates with real slots cut through them. Units are metres; the bore runs along -z through the origin.
(function () {
  const G = P.Geo, Gun = P.Gun = { kick: { pitch: 0, yaw: 0, roll: 0 } };
  const TAU = Math.PI * 2;
  // a rectangle with rounded corners, centred on (cx, cy)
  const rrect = (cx, cy, w, h, r, n) => {
    const p = []; n = n || 3; r = Math.min(r, w / 2 - 1e-5, h / 2 - 1e-5);
    const cs = [[cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, 1], [cx - w / 2 + r, cy - h / 2 + r, 2], [cx + w / 2 - r, cy - h / 2 + r, 3]];
    for (const [x, y, q] of cs) for (let i = 0; i <= n; i++) { const a = (q + i / n) * Math.PI / 2; p.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    return p;
  };
  const circle = (cx, cy, r, n) => { const p = []; for (let i = 0; i < (n || 16); i++) { const a = i / (n || 16) * TAU; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
  const arcRing = (r0, r1, a0, a1, n) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([Math.cos(a) * r1, Math.sin(a) * r1]); } for (let i = n; i >= 0; i--) { const a = a0 + (a1 - a0) * i / n; p.push([Math.cos(a) * r0, Math.sin(a) * r0]); } return p; };
  // a cross-section (x, y) pushed along the bore from f0 to f1 (f: metres forward of the origin)
  const sec = (pts, f0, f1, bevel, holes) => G.slab(pts, -f1, -f0, bevel, holes, 8);
  // a side outline ([forward, height]) pushed out to a width across the gun, centred on x
  const side = (pts, width, bevel, holes, x, steps) => { const g = G.prof(pts, width, bevel, holes, steps); if (x) g.translate(x, 0, 0); return g; };
  const sh = (pts, dx, dy) => pts.map((p) => [p[0] + (dx || 0), p[1] + (dy || 0)]);
  const rb = (w, h, d, r, x, y, f, rot) => G.xf(G.rbox(w, h, d, r === undefined ? 0.0012 : r, 1), [x, y, -f], rot);

  Gun.UT = 0.0215;                       // top of the upper receiver
  Gun.RY = Gun.UT + 0.0094;              // top of the rail
  Gun.sightY = Gun.RY + 0.0375;          // the height of the sight's line over the bore
  Gun.muzzle = 0.514;

  function model(M) {
    const B = new G.Builder(), UT = Gun.UT, RY = Gun.RY, UPW = 0.043, UB = -0.021, L = -1;   // L: the side the shooter sees (left, -x)
    // ---- upper receiver ----
    const upSec = [[-UPW / 2, UB], [UPW / 2, UB], [UPW / 2, 0.007], [UPW / 2 - 0.0035, 0.0155], [0.0105, UT], [-0.0105, UT], [-UPW / 2 + 0.0035, 0.0155], [-UPW / 2, 0.007]];
    B.add(M.metal, sec(upSec, -0.104, 0.099, 0.0012));
    B.add(M.metal, rb(0.004, 0.017, 0.062, 0.0015, L * (UPW / 2 + 0.0008), -0.002, -0.058));           // forging rib behind the magazine well, left
    B.add(M.metal, rb(0.0035, 0.012, 0.03, 0.0015, L * (UPW / 2 + 0.0006), 0.002, 0.07));
    B.add(M.metal, rb(0.006, 0.02, 0.05, 0.0025, UPW / 2 + 0.001, 0.0, -0.066));                        // brass deflector / forward assist housing, right
    B.add(M.steel, G.rod([UPW / 2, 0.004, 0.088], [UPW / 2 + 0.012, 0.004, 0.096], 0.006, 12));          // forward assist
    B.add(M.dark, rb(0.0008, 0.018, 0.058, 0.0002, UPW / 2 + 0.0002, 0.0, 0.012));                       // ejection port
    B.add(M.metal, rb(0.0022, 0.02, 0.06, 0.0008, UPW / 2 + 0.0035, -0.0215, 0.012, [0, 0, -0.5]));      // its cover, hanging open
    // charging handle
    B.add(M.metal, rb(0.013, 0.007, 0.03, 0.0015, 0, UT - 0.0035, -0.112));
    B.add(M.metal, rb(0.054, 0.0085, 0.011, 0.002, 0, UT - 0.0035, -0.124)); B.add(M.steel, rb(0.014, 0.006, 0.013, 0.0015, L * 0.024, UT - 0.0035, -0.119));

    // ---- rail: a dovetail base with a tooth every 10 mm ----
    const dove = [[-0.0078, 0], [0.0078, 0], [0.0078, 0.0026], [0.0106, 0.0054], [0.0106, 0.0068], [0.0086, 0.0094], [-0.0086, 0.0094], [-0.0106, 0.0068], [-0.0106, 0.0054], [-0.0078, 0.0026]];
    const base = [[-0.0078, 0], [0.0078, 0], [0.0078, 0.0056], [-0.0078, 0.0056]];
    const rail = (f0, f1, y) => { B.add(M.metal, sec(sh(base, 0, y), f0, f1, 0)); for (let f = f0 + 0.0026; f + 0.0052 <= f1 + 1e-6; f += 0.01) B.add(M.metal, sec(sh(dove, 0, y), f, f + 0.0052, 0.0005)); };
    rail(-0.101, 0.098, UT);

    // ---- handguard: eight plates about the barrel, slots cut through them ----
    const HW = 0.046, HC = UT - HW / 2, HF0 = 0.101, HF1 = 0.42, fw = HW * Math.tan(Math.PI / 8) + 0.0016, th = 0.0024;
    const oct = (w) => { const p = [], R = w / 2 / Math.cos(Math.PI / 8); for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; p.push([Math.cos(a) * R, HC + Math.sin(a) * R]); } return p; };
    B.add(M.metal, sec(oct(HW), HF0, HF0 + 0.02, 0.0012));
    B.add(M.metal, sec(oct(HW + 0.002), HF0 + 0.004, HF0 + 0.012, 0.0008));
    B.add(M.metal, sec(oct(HW), HF1 - 0.004, HF1, 0.0008, [circle(0, HC, 0.0165, 20)]));
    for (const f of [HF0 + 0.006, HF0 + 0.015]) { B.add(M.steel, G.rod([L * 0.012, HC - HW / 2 - 0.002, -f], [L * 0.012, HC - HW / 2 + 0.004, -f], 0.0032, 10)); B.add(M.steel, G.rod([0.012, HC - HW / 2 - 0.002, -f], [0.012, HC - HW / 2 + 0.004, -f], 0.0032, 10)); }
    for (let k = 0; k < 8; k++) {
      const ang = k * Math.PI / 4, holes = [];
      if (k !== 2) {
        const big = (k % 2 === 0) || k === 5 || k === 7;
        if (big) for (let f = HF0 + 0.05; f < HF1 - 0.03; f += 0.0405) holes.push(rrect(f, 0, 0.032, 0.0072, 0.0026, 3));
        else for (let f = HF0 + 0.04; f < HF1 - 0.02; f += 0.027) holes.push(rrect(f, 0, 0.017, 0.0052, 0.0024, 3));
      }
      const pts = [[HF0 + 0.019, -fw / 2], [HF1 - 0.003, -fw / 2], [HF1 - 0.003, fw / 2], [HF0 + 0.019, fw / 2]];
      B.add(M.metal, G.prof(pts, th, 0.0006, holes), [Math.cos(ang) * (HW / 2 - th / 2), HC + Math.sin(ang) * (HW / 2 - th / 2), 0], [0, 0, ang]);
    }
    rail(HF0 + 0.001, HF1 - 0.002, UT);

    // ---- barrel, gas block and tube, muzzle device ----
    B.add(M.barrel, G.lathe([[0.0005, 0.09], [0.0125, 0.09], [0.0125, 0.128], [0.0096, 0.136], [0.0096, 0.30], [0.0112, 0.303], [0.0112, 0.343], [0.0091, 0.347], [0.0091, 0.462], [0.0005, 0.462]], 20, true));
    B.add(M.barrel, rb(0.019, 0.013, 0.036, 0.002, 0, 0.0125, 0.323)); B.add(M.steel, G.rod([0, 0.0165, -0.10], [0, 0.0165, -0.31], 0.0026, 8));
    B.add(M.barrel, G.lathe([[0.0005, 0.458], [0.0108, 0.458], [0.0108, 0.463], [0.0098, 0.465], [0.0098, 0.469], [0.0108, 0.471], [0.0108, 0.480], [0.0005, 0.480]], 20, true));
    for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + Math.PI / 2; B.add(M.barrel, sec(arcRing(0.0058, 0.0108, a - 0.72, a + 0.72, 6), 0.479, Gun.muzzle, 0.0009)); }
    B.add(M.dark, G.xf(new THREE.CircleGeometry(0.0057, 16), [0, 0, -0.4805], [0, Math.PI, 0]));

    // ---- lower receiver ----
    const LW = 0.0385;
    const low = [[0.086, -0.019], [0.0865, -0.045], [0.081, -0.089], [0.02, -0.084], [0.0145, -0.056], [-0.05, -0.056], [-0.06, -0.074], [-0.098, -0.068], [-0.108, -0.05], [-0.106, -0.019]];
    B.add(M.metal, side(low, LW, 0.0022));
    B.add(M.metal, side([[0.0835, -0.08], [0.084, -0.091], [0.018, -0.0855], [0.0185, -0.076]], LW + 0.004, 0.0015));                                    // flared mouth of the magazine well
    B.add(M.metal, G.lathe([[0.0005, -0.124], [0.0195, -0.124], [0.0195, -0.104], [0.0005, -0.104]], 20, true));                                         // ring that takes the buffer tube
    B.add(M.steel, G.lathe([[0.0005, -0.128], [0.0215, -0.128], [0.0215, -0.1245], [0.0005, -0.1245]], 20, true));                                       // castle nut
    // pins and controls on the left
    const pin = (f, y, r, out) => B.add(M.steel, G.rod([L * (LW / 2 - 0.001), y, -f], [L * (LW / 2 + (out || 0.0012)), y, -f], r, 12));
    pin(0.07, -0.03, 0.0046); pin(-0.094, -0.031, 0.0046); pin(-0.03, -0.041, 0.0026); pin(-0.011, -0.045, 0.0026); pin(-0.066, -0.036, 0.0075, 0.0022);
    B.add(M.steel, rb(0.0042, 0.0056, 0.024, 0.0015, L * (LW / 2 + 0.0034), -0.036, -0.054));                                                             // selector lever
    B.add(M.steel, rb(0.0036, 0.022, 0.009, 0.0012, L * (LW / 2 + 0.002), -0.014, 0.008)); B.add(M.steel, rb(0.0044, 0.012, 0.013, 0.0015, L * (LW / 2 + 0.0026), -0.031, 0.008));   // bolt catch
    B.add(M.steel, rb(0.003, 0.004, 0.03, 0.001, L * (LW / 2 + 0.0012), -0.041, 0.042));                                                                 // magazine catch bar
    B.add(M.steel, G.rod([LW / 2 - 0.001, -0.041, -0.04], [LW / 2 + 0.003, -0.041, -0.04], 0.005, 12));                                                  // magazine release, right
    // trigger guard and trigger
    const tgO = [[0.0165, -0.054], [0.0165, -0.064], [0.004, -0.0915], [-0.05, -0.0915], [-0.0555, -0.086], [-0.0555, -0.054]];
    const tgI = [[0.0128, -0.057], [0.0128, -0.0632], [0.002, -0.0878], [-0.0495, -0.0878], [-0.0518, -0.0855], [-0.0518, -0.057]];
    B.add(M.metal, side(tgO, 0.0125, 0.0009, [tgI]));
    B.add(M.steel, side([[-0.0205, -0.055], [-0.012, -0.055], [-0.0142, -0.067], [-0.019, -0.079], [-0.0232, -0.0805], [-0.0215, -0.068]], 0.0068, 0.0014));

    // ---- grip ----
    const grip = [[-0.052, -0.055], [-0.058, -0.075], [-0.066, -0.092], [-0.096, -0.152], [-0.1, -0.158], [-0.138, -0.158], [-0.142, -0.152], [-0.118, -0.095], [-0.113, -0.075], [-0.118, -0.06], [-0.11, -0.055]];
    B.add(M.poly, side(grip, 0.031, 0.0075, null, 0, 3));
    B.add(M.poly, side([[-0.098, -0.1555], [-0.14, -0.1555], [-0.1405, -0.161], [-0.0985, -0.161]], 0.03, 0.002));

    // ---- stock ----
    B.add(M.metal, G.lathe([[0.0005, -0.305], [0.0148, -0.305], [0.0148, -0.106], [0.0005, -0.106]], 18, true));
    const stock = [[-0.135, 0.022], [-0.302, 0.022], [-0.308, 0.012], [-0.308, -0.1], [-0.294, -0.106], [-0.252, -0.054], [-0.19, -0.031], [-0.135, -0.027]];
    B.add(M.poly, side(stock, 0.041, 0.0045, [[[-0.207, -0.037], [-0.288, -0.088], [-0.288, -0.037]]], 0, 2));
    B.add(M.poly, rb(0.043, 0.128, 0.012, 0.004, 0, -0.04, -0.312));
    B.add(M.poly, rb(0.012, 0.01, 0.04, 0.003, 0, -0.034, -0.165));

    const fixed = new THREE.Group(); B.build(fixed, { cast: false });

    // ---- magazine (its own mesh: it comes out) ----
    const MB = new G.Builder();
    const mag = [[0.021, -0.03], [0.024, -0.09], [0.031, -0.15], [0.043, -0.205], [0.046, -0.214], [0.107, -0.197], [0.106, -0.187], [0.093, -0.14], [0.082, -0.09], [0.076, -0.03]];
    MB.add(M.poly, side(mag, 0.0225, 0.002));
    const panel = [[0.028, -0.096], [0.036, -0.152], [0.047, -0.196], [0.098, -0.184], [0.088, -0.14], [0.078, -0.096]];
    MB.add(M.poly, side(panel, 0.0242, 0.0012));
    for (const t of [0.25, 0.5, 0.75]) { const y = -0.1 - t * 0.086, f0 = 0.0285 + t * 0.0165, f1 = 0.0785 + t * 0.018; MB.add(M.poly, side([[f0, y + 0.002], [f1, y + 0.0045], [f1, y - 0.0005], [f0, y - 0.003]], 0.0256, 0.0008)); }
    MB.add(M.poly, side([[0.039, -0.203], [0.043, -0.2205], [0.111, -0.2015], [0.109, -0.185]], 0.027, 0.0022));
    const magG = new THREE.Group(); MB.build(magG, { cast: false });

    // ---- sight: a closed red dot on a riser ----
    const SB = new G.Builder(), SY = Gun.sightY, sf0 = -0.034, sf1 = 0.034;
    SB.add(M.metal, rb(0.031, 0.011, 0.052, 0.002, 0, RY + 0.0035, 0.0));
    for (const sx of [-1, 1]) SB.add(M.metal, rb(0.0055, 0.0135, 0.046, 0.0015, sx * 0.0142, RY - 0.0015, 0.0));
    for (const f of [-0.014, 0.014]) { SB.add(M.steel, G.rod([L * 0.016, RY - 0.0015, -f], [L * 0.0235, RY - 0.0015, -f], 0.0048, 6)); SB.add(M.steel, G.rod([0.016, RY - 0.0015, -f], [0.019, RY - 0.0015, -f], 0.003, 10)); }
    SB.add(M.metal, side([[-0.026, RY + 0.008], [0.026, RY + 0.008], [0.022, RY + 0.021], [-0.022, RY + 0.021]], 0.024, 0.0015, [rrect(0, RY + 0.0145, 0.026, 0.006, 0.002, 3)]));
    const bw = 0.04, bh = 0.034;
    SB.add(M.metal, sec(rrect(0, SY, bw, bh, 0.0065, 4), sf0, sf1, 0.0014, [rrect(0, SY, bw - 0.0085, bh - 0.0085, 0.004, 4)]));
    SB.add(M.metal, sec(rrect(0, SY, bw + 0.003, bh + 0.003, 0.0075, 4), sf1 - 0.006, sf1 + 0.006, 0.001, [rrect(0, SY, bw - 0.0085, bh - 0.0085, 0.004, 4)]));   // hood
    SB.add(M.metal, rb(0.024, 0.004, 0.036, 0.0015, 0, SY + bh / 2 + 0.0012, 0.002));                                                                     // lid of the battery
    SB.add(M.steel, G.rod([0.0, SY + bh / 2 + 0.002, 0.012], [0.0, SY + bh / 2 + 0.0055, 0.012], 0.0062, 14));                                            // elevation
    SB.add(M.steel, G.rod([bw / 2 - 0.001, SY + 0.002, 0.012], [bw / 2 + 0.0045, SY + 0.002, 0.012], 0.0062, 14));                                       // windage
    for (const yy of [0.006, -0.006]) SB.add(M.poly, rb(0.002, 0.007, 0.011, 0.001, L * (bw / 2 + 0.0006), SY + yy, 0.0));                               // buttons, left
    const sight = new THREE.Group(); SB.build(sight, { cast: false });
    const lensG = new THREE.PlaneGeometry(bw - 0.008, bh - 0.008);
    const lf = new THREE.Mesh(lensG, M.glass); lf.position.set(0, SY, -(sf1 - 0.004)); const lr = new THREE.Mesh(lensG, M.glass2); lr.position.set(0, SY, -(sf0 + 0.004));
    lf.renderOrder = 3; lr.renderOrder = 4; sight.add(lf, lr);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.00055, 12), M.dot); dot.position.set(0, SY, -(sf1 - 0.0045)); dot.renderOrder = 5; sight.add(dot);

    const g = new THREE.Group(); g.add(fixed, magG, sight);
    return { group: g, mag: magG, sight, dot };
  }

  Gun.materials = function () {
    const T = P.Tex;
    return {
      metal: P.triMat(T.gunmetal, { color: 0xffffff, env: 1.5, metal: 0.6, normal: 0.7, vm: true }), barrel: P.triMat(T.gunmetal, { color: 0xc8c8d0, size: 0.14, rough: 0.8, env: 1.5, metal: 0.8, normal: 0.6, vm: true }),
      poly: P.triMat(T.polymer, { env: 1.3, normal: 0.8, vm: true }), steel: P.triMat(T.steel, { color: 0x505054, env: 1.4, rough: 1.25, vm: true }),
      dark: P.vmPatch(new THREE.MeshBasicMaterial({ color: 0x020202 })),
      glass: P.vmPatch(new THREE.MeshStandardMaterial({ color: 0x1a2c3a, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.22, envMapIntensity: 2.4, depthWrite: false, side: THREE.DoubleSide })),
      glass2: P.vmPatch(new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.12, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide })),
      dot: new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 0.5, 0.3), transparent: true, depthTest: false }),
    };
  };

  Gun.build = function (camera, scene) {
    const M = Gun.mats = Gun.materials(), m = Gun.model = model(M);
    const root = Gun.root = new THREE.Group(); root.userData.noEnv = true;
    const pivot = Gun.pivot = new THREE.Group(); pivot.add(m.group); root.add(pivot);
    camera.add(root);
    Gun.hip = new THREE.Vector3(0.142, -0.128, -0.265); Gun.adsPos = new THREE.Vector3(0, -Gun.sightY, -0.165);
    // a little light of the gun's own, from over the left shoulder, so its shape reads in the dark
    const fill = Gun.fill = new THREE.PointLight(new THREE.Color(0.74, 0.84, 1.0), 1.7, 1.7, 2); fill.position.set(-0.36, 0.34, 0.14); camera.add(fill);
    root.position.copy(Gun.hip);
    m.group.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.frustumCulled = false; } });
    if (P.Hands) P.Hands.build(Gun);
    if (P.GunPlay) P.GunPlay.init(Gun, camera, scene);
  };
  // stand the rifle in the room to be looked at: P.Gun.demo(x, y, z, turn)
  Gun.demo = function (x, y, z, ry, rx) { P.scene.add(Gun.root); Gun.root.position.set(x, y, z); Gun.root.rotation.set(rx || 0, ry || 0, 0); Gun.isDemo = true; };
  Gun.update = function (dt, input, pl, time) { if (Gun.isDemo) return; if (P.GunPlay) P.GunPlay.update(dt, input, pl, time); };
})();
