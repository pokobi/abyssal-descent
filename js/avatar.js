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
    m(J.head, PG.cone, cloth, 0.17, 0.32, 0.17, 0, 0.16, -0.02);      // hood
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
    // sidearm in the right hand
    m(J.arms[1].hand, PG.box, gun, 0.04, 0.06, 0.32, 0, -0.02, 0.12);
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
  AV.reattach = function (scene) { if (root && root.parent !== scene) scene.add(root); };

  const rot = (o, x, y, z, k) => { o.rotation.x = U.lerp(o.rotation.x, x, k); o.rotation.y = U.lerp(o.rotation.y, y, k); o.rotation.z = U.lerp(o.rotation.z, z, k); };
  AV.handWorld = function () { root.updateMatrixWorld(true); return J.arms[0].hand.getWorldPosition(V()); };

  AV.update = function (dt, P) {
    if (!root) return;
    // while easing back to first person, hide the body before the camera can pass through it
    root.visible = !P.dead && (AV.returning ? AV.tpK > 0.55 : AV.tpK > 0.03);
    if (!root.visible) return;
    root.position.copy(P.pos);
    root.rotation.y = P.yaw + Math.PI;
    const k = Math.min(1, dt * 12);
    const t = G.game.time;
    const gr = P.grapple;
    if (P.pileState === 'charge') {
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
