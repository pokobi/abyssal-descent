'use strict';
// Player character model, shown only in third-person moments (grapple / pile driver); the same figure is the class screen's preview
// (classes.js) and a team-mate's body in co-op (coop/body.js).
// One figure for everyone (a body in a plain suit: skin, suit, gloves, boots), dressed per class in the class's colours (AV.dress).
// Every figure has its own materials, so a buff's glow on your own body (pstatus.js, AV.mats) never lights up anyone else's.
(function () {
  const AV = (G.avatar = { tpK: 0 });
  const V = G.U.V;
  const U = G.U;
  let root, J = {};

  // ---- shapes made once: a rounded limb, a box narrower at the bottom, a dome, an open hood, flared skirts
  const GEO = {};
  function geo() {
    if (GEO.limb) return GEO;
    GEO.limb = new THREE.CapsuleGeometry(0.5, 1, 4, 10); // (scale (d, h / 2, d): d across, h long with its rounded ends)
    GEO.dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    // a hood: a sphere left open at the front (the face) and at the bottom (the neck)
    GEO.hood = new THREE.SphereGeometry(1, 18, 12, Math.PI / 2 + 0.8, Math.PI * 2 - 1.6, 0, Math.PI * 0.74);
    GEO.flare = new THREE.CylinderGeometry(0.62, 1, 1, 16);  // a robe's or a hakama's skirt
    GEO.cape = new THREE.CylinderGeometry(0.72, 1, 1, 16);   // a capelet over the shoulders
    GEO.ring = new THREE.TorusGeometry(1, 0.08, 6, 24);
    return GEO;
  }
  const tapers = {};
  // a box whose bottom is narrower (bx, bz of the top's width / depth): a torso, a breastplate, a cloak
  function taper(bx, bz) {
    const k = bx + ':' + bz;
    if (tapers[k]) return tapers[k];
    const g = new THREE.BoxGeometry(1, 1, 1, 1, 2, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), t = 0.5 - y; p.setX(i, p.getX(i) * (1 - (1 - bx) * t)); p.setZ(i, p.getZ(i) * (1 - (1 - bz) * t)); }
    g.computeVertexNormals();
    return (tapers[k] = g);
  }
  AV.geo = geo; AV.taper = taper;

  // the base materials (each figure clones its own)
  let BASE = null;
  function base() {
    if (BASE) return BASE;
    BASE = {
      suit: new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.9 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xc8957a, roughness: 0.75 }),
      glove: new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.7 }),
      boot: new THREE.MeshStandardMaterial({ color: 0x2a231d, roughness: 0.65 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x1e1814, roughness: 0.9 }),
      eye: new THREE.MeshBasicMaterial({ color: 0x0c0a08 }),
    };
    return BASE;
  }

  // the common figure on its own root. The joints (body, chest, head, arms: shoulder / elbow / hand, legs: hip / knee) stay where every pose expects them.
  AV.buildFigure = function () {
    const PG = G.Props.PG, GE = geo(), B = base();
    const M = {}; for (const k in B) M[k] = B[k].clone();
    const m = (parent, g, mat, sx, sy, sz, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(g, mat); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; parent.add(o); return o; };
    const j = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };
    const root = new THREE.Group(), J = { M };
    J.body = j(root, 0, 0.95, 0);                                       // pelvis pivot
    m(J.body, taper(0.88, 0.9), M.suit, 0.32, 0.2, 0.21, 0, 0.01, 0);  // hips
    J.chest = j(J.body, 0, 0.12, 0);
    m(J.chest, taper(0.76, 0.86), M.suit, 0.42, 0.52, 0.23, 0, 0.27, 0); // torso, wider at the shoulders
    m(J.chest, PG.cyl8, M.skin, 0.05, 0.08, 0.05, 0, 0.55, 0);           // neck
    for (const s of [-1, 1]) m(J.chest, PG.sph, M.suit, 0.095, 0.09, 0.1, s * 0.23, 0.47, 0); // shoulders
    J.head = j(J.chest, 0, 0.58, 0);
    m(J.head, PG.sph, M.skin, 0.115, 0.132, 0.12, 0, 0.12, 0);
    for (const s of [-1, 1]) m(J.head, PG.sph, M.eye, 0.016, 0.014, 0.01, s * 0.042, 0.135, 0.108);
    J.hood = m(J.head, PG.sph, M.hair, 0.122, 0.085, 0.128, 0, 0.18, -0.012); // hair (a class's hat hides it)
    J.arms = [];
    for (const s of [-1, 1]) {
      const sh = j(J.chest, s * 0.25, 0.48, 0);
      m(sh, GE.limb, M.suit, 0.1, 0.16, 0.1, 0, -0.15, 0);
      const el = j(sh, 0, -0.3, 0);
      m(el, GE.limb, M.suit, 0.088, 0.15, 0.088, 0, -0.14, 0);
      const hand = j(el, 0, -0.3, 0);
      m(hand, PG.box, M.glove, 0.07, 0.09, 0.075);
      m(hand, PG.box, M.glove, 0.025, 0.05, 0.03, -s * 0.04, 0.01, 0.025, 0, 0, -s * 0.4); // thumb
      J.arms.push({ sh, el, hand });
    }
    J.legs = [];
    for (const s of [-1, 1]) {
      const hip = j(J.body, s * 0.1, -0.06, 0);
      m(hip, GE.limb, M.suit, 0.13, 0.23, 0.13, 0, -0.21, 0);
      const kn = j(hip, 0, -0.43, 0);
      m(kn, GE.limb, M.suit, 0.11, 0.21, 0.11, 0, -0.2, 0);
      m(kn, PG.box, M.boot, 0.12, 0.12, 0.17, 0, -0.39, 0.02);          // boot
      m(kn, PG.box, M.boot, 0.11, 0.07, 0.09, 0, -0.42, 0.12);          // toe
      J.legs.push({ hip, kn });
    }
    return { root, J };
  };
  AV.init = function (scene) {
    const PG = G.Props.PG;
    const gun = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.4, metalness: 0.6 });
    const m = (parent, g, mat, sx, sy, sz, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(g, mat); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; parent.add(o); return o; };
    { const F = AV.buildFigure(); root = F.root; J = F.J; AV._J = J; }
    // sidearm in the right hand (a blade instead in a duel)
    J.gun = m(J.arms[1].hand, PG.box, gun, 0.04, 0.06, 0.32, 0, -0.02, 0.12);
    J.blade = new THREE.Group(); J.arms[1].hand.add(J.blade);
    m(J.blade, PG.box, J.M.glove, 0.035, 0.045, 0.16, 0, -0.02, 0.06);
    m(J.blade, PG.box, gun, 0.14, 0.03, 0.03, 0, -0.02, 0.15);
    m(J.blade, PG.box, new THREE.MeshStandardMaterial({ color: 0xd8dce6, roughness: 0.2, metalness: 0.95 }), 0.02, 0.06, 0.62, 0, -0.02, 0.46);
    J.blade.visible = false;
    root.visible = false;
    scene.add(root);
    AV.root = root;
    AV.mats = mats(root);
  };
  // every material of a figure that can glow (pstatus.js lights your own body's up with a buff's colour)
  function mats(r) { const s = new Set(); r.traverse((o) => { const m = o.material; if (m && m.emissive && m.emissive.getHex() === 0) s.add(m); }); return [...s]; } // (what glows of itself, goggles and lenses, is left alone)

  // ---- the class's clothes over the common figure (also the bodies of team-mates in co-op, and the class screen's preview).
  // Colours per class: suit (under the clothes), main (the class's own colour), dark, accent (its brightest, the class colour itself), leather.
  const PAL = {
    soldier: { suit: 0x55603a, main: 0x66733f, dark: 0x3c4428, accent: 0x9ab070, leather: 0x3b2f22 },
    assault: { suit: 0x2c2b2e, main: 0xc0382a, dark: 0x5a1a14, accent: 0xff6a50, leather: 0x2a2420 },
    sniper: { suit: 0x223247, main: 0x2f5c96, dark: 0x182638, accent: 0x5aa8ff, leather: 0x262a32 },
    blade: { suit: 0x2b2430, main: 0xe08a24, dark: 0x2e2a44, accent: 0xffb040, leather: 0x2a2420 },
    heavy: { suit: 0x3a332c, main: 0x8a5a36, dark: 0x4a3020, accent: 0xc08a5a, leather: 0x5a3c26 },
    mage: { suit: 0x2a1c3e, main: 0x6b3fb5, dark: 0x3a2266, accent: 0xb07aff, leather: 0x231a2c },
  };
  AV.PAL = PAL;
  AV.dress = function (J, cls) {
    for (const o of J.dressed || []) if (o.parent) o.parent.remove(o);
    J.dressed = []; J.orbs = null; J.dressCls = cls;
    if (J.hood) J.hood.visible = true;
    J.chest.scale.setScalar(1);
    const PG = G.Props.PG, GE = geo(), C = G.Classes && G.Classes.BY[cls], P = PAL[cls]; if (!C || !P) return;
    const mc = J.mc || (J.mc = {});
    const mat = (k, col, o) => mc[k] || (mc[k] = new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.85 }, o || {})));
    const add = (parent, g, mt, sx, sy, sz, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(g, mt); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; o.frustumCulled = false; parent.add(o); J.dressed.push(o); return o; };
    // the suit, the gloves and the boots take the class's colours
    if (J.M) { J.M.suit.color.setHex(P.suit); J.M.glove.color.setHex(P.leather); J.M.boot.color.setHex(P.leather); }
    const main = mat('main', P.main), dark = mat('dark', P.dark), acc = mat('acc', P.accent, { roughness: 0.55 }), lea = mat('lea', P.leather, { roughness: 0.7 });
    const steel = mat('steel', 0x9aa0a8, { roughness: 0.32, metalness: 0.85 }), black = mat('black', 0x16130f, { roughness: 0.7 });
    const H = J.head, Ch = J.chest, B = J.body, A = J.arms, L = J.legs;
    switch (cls) {
      case 'soldier': {
        // helmet with goggles, a plate carrier with magazine pouches, a pack with a bedroll, knee pads
        J.hood.visible = false;
        add(H, GE.dome, main, 0.15, 0.13, 0.158, 0, 0.15, -0.005);
        add(H, PG.cyl, dark, 0.158, 0.014, 0.166, 0, 0.152, -0.005);
        for (const s of [-1, 1]) add(H, PG.box, black, 0.012, 0.1, 0.02, s * 0.112, 0.08, 0.02);
        add(H, PG.box, black, 0.17, 0.025, 0.02, 0, 0.215, 0.135);
        const lens = mat('lens', 0xffc040, { emissive: 0x5a3a00, roughness: 0.2 });
        for (const s of [-1, 1]) add(H, PG.cyl8, lens, 0.03, 0.02, 0.03, s * 0.045, 0.218, 0.142, Math.PI / 2);
        add(Ch, taper(0.9, 0.95), dark, 0.45, 0.34, 0.29, 0, 0.31, 0);
        for (const x of [-0.12, 0, 0.12]) add(Ch, PG.box, main, 0.085, 0.11, 0.05, x, 0.2, 0.16);
        add(Ch, PG.box, main, 0.07, 0.08, 0.04, 0.13, 0.4, 0.16);
        add(Ch, PG.box, black, 0.36, 0.05, 0.25, 0, 0.06, 0);
        for (const s of [-1, 1]) add(Ch, PG.box, main, 0.07, 0.08, 0.06, s * 0.15, 0.04, 0.12);
        add(Ch, PG.box, main, 0.32, 0.36, 0.14, 0, 0.3, -0.2);
        add(Ch, PG.cyl8, dark, 0.065, 0.32, 0.065, 0, 0.53, -0.2, 0, 0, Math.PI / 2);
        add(A[0].sh, PG.box, acc, 0.02, 0.05, 0.05, -0.052, -0.08, 0);
        for (const l of L) add(l.kn, PG.box, dark, 0.12, 0.09, 0.06, 0, 0, 0.055);
        break;
      }
      case 'assault': {
        // a red bandana with its tails, goggles up on the forehead, a scarf over the mouth, a light vest with a bandolier, red armbands
        add(H, PG.cyl8, main, 0.125, 0.045, 0.13, 0, 0.185, 0);
        add(H, PG.box, main, 0.03, 0.15, 0.05, 0.03, 0.15, -0.14, 0.6, 0, 0.2); add(H, PG.box, main, 0.03, 0.12, 0.05, -0.03, 0.15, -0.14, 0.7, 0, -0.25);
        add(H, PG.box, black, 0.21, 0.035, 0.03, 0, 0.225, 0.1);
        const lens = mat('lens', 0xffc040, { emissive: 0x6a4000, roughness: 0.2 });
        for (const s of [-1, 1]) add(H, PG.cyl8, lens, 0.034, 0.02, 0.034, s * 0.048, 0.228, 0.115, Math.PI / 2);
        add(H, PG.cyl8, dark, 0.118, 0.07, 0.124, 0, 0.055, 0.004);
        add(Ch, taper(0.88, 0.95), dark, 0.43, 0.3, 0.27, 0, 0.32, 0);
        for (const s of [-1, 1]) add(Ch, PG.box, main, 0.03, 0.3, 0.02, s * 0.12, 0.32, 0.14);
        add(Ch, PG.box, black, 0.05, 0.62, 0.03, 0, 0.28, 0.15, 0, 0, 0.62);
        const brass = mat('brass', 0xc8a050, { roughness: 0.35, metalness: 0.8 });
        for (let i = 0; i < 5; i++) add(Ch, PG.cyl8, brass, 0.012, 0.04, 0.012, -0.16 + i * 0.08, 0.06 + i * 0.105, 0.17, 0, 0, 0.62);
        add(A[0].sh, PG.sph, main, 0.12, 0.07, 0.12, 0, 0.02, 0);
        for (const a of A) add(a.sh, PG.cyl8, main, 0.058, 0.04, 0.058, 0, -0.14, 0);
        for (const l of L) add(l.hip, PG.box, main, 0.012, 0.38, 0.02, (l === L[0] ? -1 : 1) * 0.064, -0.21, 0);
        break;
      }
      case 'sniper': {
        // a blue hood open at the face, a mask, a scope's eyepiece on the right eye, a capelet and a long cloak torn at its hem
        J.hood.visible = false;
        const hood = mat('hood', P.main, { side: THREE.DoubleSide });
        add(H, GE.hood, hood, 0.15, 0.165, 0.155, 0, 0.135, -0.012);
        add(H, PG.cone, hood, 0.06, 0.14, 0.05, 0, 0.17, -0.17, -2.0);
        add(H, PG.box, dark, 0.15, 0.065, 0.05, 0, 0.065, 0.088);
        add(H, PG.cyl8, black, 0.026, 0.035, 0.026, 0.045, 0.14, 0.12, Math.PI / 2);
        add(H, PG.cyl8, new THREE.MeshBasicMaterial({ color: P.accent }), 0.02, 0.01, 0.02, 0.045, 0.14, 0.14, Math.PI / 2);
        add(Ch, GE.cape, main, 0.29, 0.15, 0.19, 0, 0.47, -0.005);
        add(Ch, taper(1.15, 1), main, 0.46, 0.95, 0.03, 0, 0.06, -0.165, 0.12);
        for (let i = 0; i < 6; i++) add(Ch, PG.box, i % 2 ? dark : main, 0.075, 0.2, 0.02, -0.2 + i * 0.08, -0.48, -0.23 - (i % 3) * 0.01, 0.16, 0, (i - 2.5) * 0.08);
        for (const a of A) add(a.el, PG.cyl8, dark, 0.055, 0.16, 0.055, 0, -0.17, 0);
        add(Ch, PG.box, black, 0.36, 0.05, 0.25, 0, 0.06, 0);
        break;
      }
      case 'blade': {
        // an orange haori over a dark kimono, wide sleeves, a dark hakama, a white hachimaki and obi, a sheath across the back, a topknot
        const wh = mat('white', 0xece6da);
        add(H, PG.sph, J.M ? J.M.hair : black, 0.04, 0.05, 0.04, 0, 0.27, -0.06);
        add(H, PG.cyl8, wh, 0.123, 0.026, 0.129, 0, 0.17, 0);
        add(H, PG.box, wh, 0.02, 0.14, 0.035, 0.02, 0.13, -0.14, 0.45, 0, 0.15); add(H, PG.box, wh, 0.02, 0.12, 0.035, -0.02, 0.13, -0.14, 0.55, 0, -0.2);
        add(Ch, taper(0.86, 0.94), main, 0.46, 0.56, 0.27, 0, 0.25, 0);
        add(Ch, PG.box, dark, 0.11, 0.3, 0.02, 0, 0.36, 0.135);
        for (const s of [-1, 1]) add(Ch, PG.box, wh, 0.025, 0.24, 0.02, s * 0.05, 0.4, 0.14, 0, 0, s * 0.35);
        add(Ch, PG.box, wh, 0.37, 0.065, 0.26, 0, 0.06, 0);
        add(Ch, PG.box, acc, 0.06, 0.04, 0.03, 0.07, 0.06, 0.13);
        add(B, PG.box, main, 0.47, 0.22, 0.28, 0, -0.07, 0);
        add(B, PG.box, mat('band', 0x9a5a14), 0.475, 0.03, 0.285, 0, -0.17, 0);
        for (const a of A) { add(a.sh, PG.box, main, 0.15, 0.3, 0.16, 0, -0.14, 0); add(a.sh, PG.box, wh, 0.152, 0.025, 0.162, 0, -0.29, 0); }
        add(B, GE.flare, dark, 0.24, 0.6, 0.2, 0, -0.42, 0);
        for (const x of [-0.08, 0, 0.08]) add(B, PG.box, black, 0.008, 0.5, 0.01, x, -0.42, 0.19, -0.12);
        add(Ch, PG.cyl8, black, 0.03, 0.85, 0.03, 0.05, 0.3, -0.17, 0, 0, 0.6);
        add(Ch, PG.cyl8, acc, 0.034, 0.05, 0.034, 0.16, 0.48, -0.17, 0, 0, 0.6);
        add(Ch, PG.cyl8, wh, 0.035, 0.12, 0.035, 0.29, 0.66, -0.17, 0, 0, 0.6);
        break;
      }
      case 'heavy': {
        // a great helm with a visor slit and a brown crest, a breastplate, layered pauldrons, a brown tabard and cape, vambraces, greaves
        J.hood.visible = false;
        const bronze = mat('bronze', 0xb08850, { roughness: 0.35, metalness: 0.8 });
        add(H, PG.cyl8, steel, 0.14, 0.27, 0.15, 0, 0.13, 0);
        add(H, GE.dome, steel, 0.14, 0.07, 0.15, 0, 0.265, 0);
        add(H, PG.box, black, 0.19, 0.022, 0.02, 0, 0.15, 0.147);
        add(H, PG.box, black, 0.02, 0.08, 0.02, 0, 0.09, 0.147);
        add(H, PG.box, main, 0.03, 0.1, 0.24, 0, 0.35, -0.01);
        add(Ch, taper(0.84, 0.92), steel, 0.46, 0.4, 0.3, 0, 0.34, 0);
        add(Ch, PG.box, steel, 0.38, 0.1, 0.27, 0, 0.1, 0);
        for (const s of [-1, 1]) { add(Ch, PG.sph, steel, 0.2, 0.14, 0.2, s * 0.3, 0.52, 0); add(Ch, PG.sph, steel, 0.18, 0.1, 0.18, s * 0.31, 0.44, 0); add(Ch, PG.box, lea, 0.21, 0.02, 0.21, s * 0.3, 0.47, 0); }
        add(Ch, PG.oct, acc, 0.07, 0.012, 0.07, 0, 0.38, 0.155, Math.PI / 2);
        add(Ch, PG.box, lea, 0.4, 0.06, 0.29, 0, 0.03, 0); add(Ch, PG.box, bronze, 0.06, 0.05, 0.02, 0, 0.03, 0.15);
        add(B, PG.box, main, 0.26, 0.48, 0.02, 0, -0.16, 0.135); add(B, PG.box, main, 0.26, 0.48, 0.02, 0, -0.16, -0.135);
        add(B, PG.box, acc, 0.265, 0.03, 0.025, 0, -0.39, 0.135);
        add(Ch, taper(1.25, 1), dark, 0.5, 1.05, 0.03, 0, 0.0, -0.185, 0.1);
        for (const a of A) { add(a.el, PG.cyl8, steel, 0.065, 0.2, 0.065, 0, -0.15, 0); add(a.hand, PG.box, steel, 0.08, 0.06, 0.085, 0, 0.02, 0); }
        for (const l of L) { add(l.kn, PG.cyl8, steel, 0.075, 0.32, 0.075, 0, -0.2, 0.005); add(l.kn, PG.sph, steel, 0.075, 0.065, 0.07, 0, 0, 0.04); add(l.kn, PG.box, steel, 0.125, 0.06, 0.2, 0, -0.36, 0.05); }
        J.chest.scale.setScalar(1.1);
        break;
      }
      case 'mage': {
        // a purple hood with the face in shadow and two glowing eyes, a robe trimmed with gold, a capelet, bell sleeves, a sash, a book; orbs
        J.hood.visible = false;
        const hood = mat('hood', P.main, { side: THREE.DoubleSide }), gold = mat('gold', 0xd4ae5a, { roughness: 0.35, metalness: 0.7 });
        add(H, GE.hood, hood, 0.16, 0.175, 0.165, 0, 0.13, -0.012);
        add(H, PG.cone, hood, 0.07, 0.17, 0.06, 0, 0.2, -0.17, -2.1);
        add(H, PG.sph, mat('shade', 0x0a0810, { roughness: 1 }), 0.119, 0.135, 0.123, 0, 0.12, 0.004); // (the face lost in the hood's shadow)
        for (const s of [-1, 1]) add(H, PG.sph, new THREE.MeshBasicMaterial({ color: P.accent }), 0.02, 0.013, 0.01, s * 0.042, 0.135, 0.124);
        add(Ch, taper(0.8, 0.88), main, 0.44, 0.52, 0.27, 0, 0.27, 0);
        for (const s of [-1, 1]) add(Ch, PG.box, gold, 0.025, 0.22, 0.02, s * 0.05, 0.42, 0.137, 0, 0, s * 0.4);
        add(Ch, PG.box, gold, 0.03, 0.34, 0.02, 0, 0.17, 0.137);
        add(Ch, GE.cape, dark, 0.28, 0.16, 0.19, 0, 0.47, 0);
        add(Ch, GE.ring, gold, 0.28, 0.19, 0.4, 0, 0.395, 0, Math.PI / 2);
        add(Ch, PG.box, gold, 0.42, 0.06, 0.28, 0, 0.06, 0);
        add(B, GE.flare, main, 0.25, 0.86, 0.22, 0, -0.43, 0);
        for (const s of [-1, 1]) add(B, PG.box, gold, 0.025, 0.84, 0.02, s * 0.06, -0.43, 0.18, -0.1);
        add(B, GE.ring, gold, 0.25, 0.22, 0.5, 0, -0.85, 0, Math.PI / 2);
        add(B, PG.box, gold, 0.035, 0.22, 0.02, 0.1, -0.08, 0.15);
        add(B, PG.box, mat('book', 0x3a2418), 0.12, 0.15, 0.045, -0.17, -0.02, 0.06, 0, 0.35, 0); add(B, PG.box, gold, 0.124, 0.02, 0.05, -0.17, -0.02, 0.06, 0, 0.35, 0);
        for (const a of A) { add(a.el, GE.flare, main, 0.075, 0.24, 0.075, 0, -0.17, 0); add(a.el, GE.ring, gold, 0.075, 0.075, 0.4, 0, -0.29, 0, Math.PI / 2); }
        const g = new THREE.Group(); g.position.set(0, 0.55, 0); B.add(g); J.dressed.push(g); J.orbs = g;
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const o = new THREE.Mesh(PG.sph, new THREE.MeshBasicMaterial({ color: P.accent })); o.scale.setScalar(0.05); o.position.set(Math.cos(a) * 0.5, Math.sin(a * 2) * 0.1, Math.sin(a) * 0.5); o.frustumCulled = false; g.add(o); }
        break;
      }
    }
    if (J === AV._J) AV.mats = mats(root);
  };
  // the mage's orbs turn and take the colour of the element in hand
  AV.orbTick = function (J, dt, el) {
    if (!J.orbs) return;
    J.orbs.rotation.y += dt * 2.2;
    const c = el && G.Elem && G.Elem.BY[el] ? G.Elem.BY[el].hex : PAL.mage.accent;
    for (const o of J.orbs.children) o.material.color.setHex(c);
  };

  const rot = (o, x, y, z, k) => { o.rotation.x = U.lerp(o.rotation.x, x, k); o.rotation.y = U.lerp(o.rotation.y, y, k); o.rotation.z = U.lerp(o.rotation.z, z, k); };
  AV.handWorld = function () { root.updateMatrixWorld(true); return J.arms[0].hand.getWorldPosition(V()); };

  AV.update = function (dt, P) {
    if (J.chest && J.dressCls !== P.cls) AV.dress(J, P.cls);
    if (J.orbs) AV.orbTick(J, dt, G.Elem && G.Elem.wEl(P.meleeMode ? P.melee : P.weapon));
    if (!root) return;
    // while easing back to first person, hide the body before the camera can pass through it
    root.visible = !P.dead && (AV.returning ? AV.tpK > 0.55 : AV.tpK > 0.03);
    if (!root.visible) return;
    root.position.copy(P.pos);
    root.rotation.y = P.yaw + Math.PI;
    const k = Math.min(1, dt * 12);
    const t = G.game.time;
    const gr = P.grapple;
    const duel = !!P.duelLock;
    J.gun.visible = !duel;
    J.blade.visible = duel && !!P.melee && P.melee.id !== (G.BARE_MELEE || 'fists');
    if (duel) {
      // a duel: a low guard stance, the legs walking with your speed; a parry snaps the blade up across the body
      root.rotation.x = 0; J.spin = 0;
      J.body.position.y = U.lerp(J.body.position.y, 0.9, k);
      const gd = G.weapons.gd || {}, par = Math.max(gd.pk > 0 ? 1 : 0, gd.kick || 0), sp = Math.min(1, (P.speedH || 0) / 6);
      J.walk = (J.walk || 0) + dt * (4 + (P.speedH || 0) * 1.6);
      const sw = Math.sin(J.walk) * sp;
      rot(J.body, 0.12, 0, 0, k); rot(J.chest, 0.15, 0, 0, k);
      if (par > 0.2) { rot(J.arms[1].sh, -1.9, 0, -0.6, 0.6); rot(J.arms[1].el, -0.7, 0, 0, 0.6); rot(J.arms[0].sh, -1.3, 0, 0.5, 0.6); rot(J.arms[0].el, -1.1, 0, 0, 0.6); }
      else { rot(J.arms[1].sh, -0.9, 0, 0.15, k); rot(J.arms[1].el, -0.9, 0, 0, k); rot(J.arms[0].sh, -0.7, 0, -0.2, k); rot(J.arms[0].el, -1.2, 0, 0, k); }
      rot(J.legs[0].hip, -0.15 + sw * 0.7, 0, 0, k); rot(J.legs[0].kn, 0.3 + Math.max(0, -sw) * 0.8, 0, 0, k);
      rot(J.legs[1].hip, 0.15 - sw * 0.7, 0, 0, k); rot(J.legs[1].kn, 0.3 + Math.max(0, sw) * 0.8, 0, 0, k);
    } else if (P.pileState === 'charge') {
      // tucked into a ball, spinning forward
      root.rotation.x = 0;
      J.spin = (J.spin || 0) + dt * 14;
      rot(J.body, J.spin, 0, 0, 1);
      rot(J.chest, 0.5, 0, 0, k);
      for (const a of J.arms) { rot(a.sh, -0.6, 0, 0, k); rot(a.el, -1.6, 0, 0, k); }
      for (const l of J.legs) { rot(l.hip, -1.7, 0, 0, k); rot(l.kn, 2.2, 0, 0, k); }
    } else if (P.pileState === 'fall') {
      // straight down, both fists cocked over the head
      J.spin = 0;
      rot(J.body, 0.15, 0, 0, k);
      rot(J.chest, 0.3, 0, 0, k);
      for (const [i, a] of J.arms.entries()) { rot(a.sh, -2.9, 0, (i ? -1 : 1) * 0.25, k); rot(a.el, -0.4, 0, 0, k); }
      for (const [i, l] of J.legs.entries()) { rot(l.hip, -0.2 - i * 0.3, 0, 0, k); rot(l.kn, 0.4 + i * 0.6, 0, 0, k); }
    } else if ((P.pileLandT || 0) > 0) {
      // superhero landing: one knee down, fist on the ground
      rot(J.body, 0, 0, 0, k);
      rot(J.chest, 0.7, 0, 0, k);
      rot(J.arms[0].sh, -0.4, 0, 0.1, k); rot(J.arms[0].el, -0.2, 0, 0, k);
      rot(J.arms[1].sh, 0.3, 0, -0.5, k); rot(J.arms[1].el, -0.6, 0, 0, k);
      rot(J.legs[0].hip, -1.4, 0, 0, k); rot(J.legs[0].kn, 1.5, 0, 0, k);
      rot(J.legs[1].hip, 0.6, 0, 0, k); rot(J.legs[1].kn, 1.9, 0, 0, k);
      J.body.position.y = U.lerp(J.body.position.y, 0.55, k);
    } else {
      // grapple / airborne: lead arm reaches toward the hook
      J.body.position.y = U.lerp(J.body.position.y, 0.95, k);
      const sw = Math.sin(t * 6);
      let reachX = -2.3, reachZ = 0.2;
      if (gr.state === 'attached' || gr.state === 'firing' || gr.state === 'reelEnemy') {
        const to = gr.hook.clone().sub(P.chestPos());
        const local = to.applyAxisAngle(V(0, 1, 0), -root.rotation.y);
        reachX = -Math.PI / 2 - Math.atan2(local.y, Math.hypot(local.x, local.z));
        reachZ = Math.atan2(local.x, local.z) * 0.5;
      }
      const lean = U.clamp(P.vel.y * 0.02, -0.3, 0.3);
      rot(J.body, 0.25 - lean, 0, U.clamp(-P.vel.x * 0.005, -0.2, 0.2), k);
      rot(J.chest, 0.1, 0, 0, k);
      rot(J.arms[0].sh, reachX, 0, reachZ, k); rot(J.arms[0].el, 0, 0, 0, k);
      rot(J.arms[1].sh, -1.2, 0, -0.3, k); rot(J.arms[1].el, -0.9, 0, 0, k);
      rot(J.legs[0].hip, 0.5 + sw * 0.25, 0, 0, k); rot(J.legs[0].kn, 0.6 + sw * 0.2, 0, 0, k);
      rot(J.legs[1].hip, -0.2 - sw * 0.25, 0, 0, k); rot(J.legs[1].kn, 1.0 - sw * 0.2, 0, 0, k);
    }
  };
})();
