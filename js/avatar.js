'use strict';
// Player character model, shown only in third-person moments (grapple / pile driver).
(function () {
  const AV = (G.avatar = { tpK: 0 });
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const U = G.U;
  let root, J = {};

  AV.init = function (scene) {
    const t = G.Tex.tex, PG = G.Props.PG;
    const leather = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.8, map: t.skin.map, normalMap: t.skin.normalMap });
    const plate = new THREE.MeshStandardMaterial({ color: 0x7a7c80, roughness: 0.35, metalness: 0.8, map: t.metal.map, normalMap: t.metal.normalMap });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x3a2a24, roughness: 0.95, map: t.cloth.map, side: THREE.DoubleSide });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.7 });
    const gun = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.4, metalness: 0.6 });
    const m = (parent, geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; parent.add(o); return o; };
    const j = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };
    AV.mats = [leather, plate, cloth, dark];
    root = new THREE.Group();
    J.body = j(root, 0, 0.95, 0);                   // pelvis pivot
    m(J.body, PG.box, leather, 0.34, 0.2, 0.22, 0, 0.02, 0);
    J.chest = j(J.body, 0, 0.12, 0);
    m(J.chest, PG.box, leather, 0.4, 0.5, 0.24, 0, 0.27, 0);
    m(J.chest, PG.box, plate, 0.42, 0.3, 0.26, 0, 0.36, 0.01);
    for (const s of [-1, 1]) m(J.chest, PG.sph, plate, 0.13, 0.1, 0.14, s * 0.24, 0.5, 0);
    m(J.chest, PG.box, dark, 0.38, 0.05, 0.25, 0, 0.08, 0);          // belt
    m(J.chest, PG.box, cloth, 0.42, 0.65, 0.03, 0, 0.25, -0.15, 0.12); // cloak
    J.head = j(J.chest, 0, 0.58, 0);
    m(J.head, PG.sph, leather, 0.12, 0.14, 0.13, 0, 0.12, 0);
    J.hood = m(J.head, PG.cone, cloth, 0.17, 0.32, 0.17, 0, 0.16, -0.02);      // hood
    m(J.head, PG.box, dark, 0.16, 0.05, 0.02, 0, 0.12, 0.12);         // face shadow
    J.arms = [];
    for (const s of [-1, 1]) {
      const sh = j(J.chest, s * 0.25, 0.48, 0);
      m(sh, PG.cyl8, leather, 0.055, 0.3, 0.055, 0, -0.15, 0);
      const el = j(sh, 0, -0.3, 0);
      m(el, PG.cyl8, leather, 0.05, 0.28, 0.05, 0, -0.14, 0);
      m(el, PG.cyl8, plate, 0.058, 0.12, 0.058, 0, -0.1, 0);
      const hand = j(el, 0, -0.3, 0);
      m(hand, PG.box, dark, 0.07, 0.09, 0.07);
      J.arms.push({ sh, el, hand });
    }
    // sidearm in the right hand (a blade instead in a duel)
    J.gun = m(J.arms[1].hand, PG.box, gun, 0.04, 0.06, 0.32, 0, -0.02, 0.12);
    J.blade = new THREE.Group(); J.arms[1].hand.add(J.blade);
    m(J.blade, PG.box, dark, 0.035, 0.045, 0.16, 0, -0.02, 0.06);
    m(J.blade, PG.box, plate, 0.14, 0.03, 0.03, 0, -0.02, 0.15);
    m(J.blade, PG.box, new THREE.MeshStandardMaterial({ color: 0xd8dce6, roughness: 0.2, metalness: 0.95 }), 0.02, 0.06, 0.62, 0, -0.02, 0.46);
    J.blade.visible = false;
    J.legs = [];
    for (const s of [-1, 1]) {
      const hip = j(J.body, s * 0.1, -0.06, 0);
      m(hip, PG.cyl8, leather, 0.07, 0.42, 0.07, 0, -0.21, 0);
      const kn = j(hip, 0, -0.43, 0);
      m(kn, PG.cyl8, leather, 0.06, 0.4, 0.06, 0, -0.2, 0);
      m(kn, PG.box, dark, 0.1, 0.1, 0.2, 0, -0.42, 0.04);              // boot
      m(kn, PG.sph, plate, 0.07, 0.06, 0.06, 0, 0, 0.04);               // knee guard
      J.legs.push({ hip, kn });
    }
    root.visible = false;
    scene.add(root);
    AV.root = root;
  };
  // ---- the class's clothes over the common figure (also used for the bodies of team-mates in co-op)
  const DM = {};
  const dmat = (k, col, o) => DM[k] || (DM[k] = new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: 0.85 }, o || {})));
  AV.dress = function (J, cls) {
    for (const o of J.dressed || []) if (o.parent) o.parent.remove(o);
    J.dressed = []; J.orbs = null; J.dressCls = cls;
    if (J.hood) J.hood.visible = true;
    J.chest.scale.setScalar(1);
    const PG = G.Props.PG, C = G.Classes && G.Classes.BY[cls]; if (!C) return;
    const add = (parent, geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; o.frustumCulled = false; parent.add(o); J.dressed.push(o); return o; };
    const steel = dmat('steel', 0x9aa0a8, { roughness: 0.35, metalness: 0.8 }), dark = dmat('dark', 0x1c1a18, { roughness: 0.7 });
    const H = J.head, Ch = J.chest, B = J.body;
    switch (cls) {
      case 'soldier': {
        const ol = dmat('olive', 0x5a6a3a), ol2 = dmat('olive2', 0x434f2c);
        J.hood.visible = false;
        add(H, PG.sph, ol, 0.155, 0.11, 0.16, 0, 0.19, 0); add(H, PG.box, ol2, 0.3, 0.02, 0.32, 0, 0.15, 0.01);
        add(Ch, PG.box, ol, 0.44, 0.34, 0.28, 0, 0.3, 0);
        for (const x of [-0.12, 0, 0.12]) add(Ch, PG.box, ol2, 0.09, 0.08, 0.05, x, 0.2, 0.15);
        for (const L of J.legs) add(L.hip, PG.cyl8, ol2, 0.075, 0.3, 0.075, 0, -0.2, 0);
        break;
      }
      case 'assault': {
        const red = dmat('red', 0xb02a24), redD = dmat('redD', 0x5a1a14), lens = dmat('lens', 0xffc040, { emissive: 0x6a4000, roughness: 0.2 });
        J.hood.visible = false;
        add(H, PG.cyl8, red, 0.135, 0.05, 0.135, 0, 0.2, 0);
        add(H, PG.box, red, 0.03, 0.14, 0.05, 0.03, 0.15, -0.14, 0.5, 0, 0.2); add(H, PG.box, red, 0.03, 0.12, 0.05, -0.03, 0.15, -0.14, 0.6, 0, -0.25);
        add(H, PG.box, dark, 0.22, 0.05, 0.05, 0, 0.27, 0.1); for (const x of [-0.05, 0.05]) add(H, PG.sph, lens, 0.032, 0.026, 0.02, x, 0.27, 0.13);
        add(Ch, PG.box, redD, 0.41, 0.26, 0.26, 0, 0.33, 0);
        break;
      }
      case 'sniper': {
        const gr = dmat('green', 0x3a5a30), grD = dmat('greenD', 0x24381c);
        J.hood.visible = false;
        add(H, PG.cone, gr, 0.19, 0.36, 0.19, 0, 0.17, -0.02); add(H, PG.box, grD, 0.17, 0.08, 0.03, 0, 0.06, 0.12);
        add(Ch, PG.box, gr, 0.52, 0.9, 0.03, 0, 0.05, -0.17, 0.14);
        for (let i = 0; i < 6; i++) add(Ch, PG.box, i % 2 ? grD : gr, 0.07, 0.22, 0.02, -0.2 + i * 0.08, -0.45, -0.24 - (i % 3) * 0.01, 0.2, 0, (i - 2.5) * 0.08);
        for (const s of [-1, 1]) add(Ch, PG.box, grD, 0.16, 0.12, 0.27, s * 0.22, 0.5, 0);
        break;
      }
      case 'blade': {
        const hao = dmat('haori', 0x5a3a8a), hak = dmat('hakama', 0x3a3a56), wh = dmat('white', 0xe8e4dc);
        J.hood.visible = false;
        add(H, PG.cyl8, wh, 0.132, 0.03, 0.132, 0, 0.21, 0); add(H, PG.box, wh, 0.02, 0.12, 0.04, 0, 0.17, -0.14, 0.5);
        add(Ch, PG.box, hao, 0.46, 0.6, 0.27, 0, 0.22, 0);
        for (const A of J.arms) add(A.sh, PG.box, hao, 0.13, 0.26, 0.14, 0, -0.14, 0);
        add(B, PG.cone, hak, 0.22, 0.5, 0.18, 0, -0.3, 0, Math.PI);
        add(Ch, PG.cyl8, dark, 0.03, 0.85, 0.03, 0.05, 0.3, -0.17, 0, 0, 0.6); add(Ch, PG.cyl8, wh, 0.035, 0.05, 0.035, 0.27, 0.62, -0.17, 0, 0, 0.6);
        break;
      }
      case 'heavy': {
        const gold = dmat('gold', 0xc8a050, { roughness: 0.3, metalness: 0.9 });
        J.hood.visible = false;
        add(H, PG.box, steel, 0.26, 0.3, 0.27, 0, 0.13, 0); add(H, PG.box, dark, 0.2, 0.025, 0.02, 0, 0.15, 0.14); add(H, PG.box, gold, 0.03, 0.08, 0.22, 0, 0.31, 0);
        for (const s of [-1, 1]) { add(Ch, PG.sph, steel, 0.2, 0.14, 0.2, s * 0.3, 0.52, 0); add(Ch, PG.box, gold, 0.22, 0.02, 0.22, s * 0.3, 0.46, 0); }
        add(Ch, PG.box, steel, 0.46, 0.38, 0.3, 0, 0.34, 0); add(Ch, PG.box, gold, 0.06, 0.3, 0.02, 0, 0.36, 0.16);
        for (const L of J.legs) add(L.kn, PG.box, steel, 0.13, 0.3, 0.13, 0, -0.2, 0.01);
        J.chest.scale.setScalar(1.1);
        break;
      }
      case 'mage': {
        const robe = dmat('robe', 0x26368a), gold = dmat('sash', 0xc8a050, { roughness: 0.4, metalness: 0.6 });
        J.hood.visible = false;
        add(H, PG.cone, robe, 0.19, 0.38, 0.19, 0, 0.17, -0.02);
        add(Ch, PG.box, robe, 0.42, 0.5, 0.26, 0, 0.27, 0); add(Ch, PG.box, gold, 0.43, 0.05, 0.27, 0, 0.08, 0);
        add(B, PG.cone, robe, 0.3, 0.85, 0.26, 0, -0.42, 0, Math.PI);
        const g = new THREE.Group(); g.position.set(0, 0.55, 0); B.add(g); J.dressed.push(g); J.orbs = g;
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const o = new THREE.Mesh(PG.sph, new THREE.MeshBasicMaterial({ color: 0x7a9aff })); o.scale.setScalar(0.05); o.position.set(Math.cos(a) * 0.5, Math.sin(a * 2) * 0.1, Math.sin(a) * 0.5); o.frustumCulled = false; g.add(o); }
        break;
      }
    }
  };
  // the mage's orbs turn and take the colour of the element in hand
  AV.orbTick = function (J, dt, el) {
    if (!J.orbs) return;
    J.orbs.rotation.y += dt * 2.2;
    const c = el && G.Elem && G.Elem.BY[el] ? G.Elem.BY[el].hex : 0x7a9aff;
    for (const o of J.orbs.children) o.material.color.setHex(c);
  };
  AV.reattach = function (scene) { if (root && root.parent !== scene) scene.add(root); };

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
