'use strict';
// Co-op: the body of another player. The solo game only has one avatar (shown in grapple moments), so this builds the same figure again with its joints at hand,
// and poses it from what the player sends: walking, running, crouching, the weapon in hand (aiming, reloading, swinging, guarding), the pile driver and the grapple.
(function () {
  const K = G.Coop;
  const U = G.U;
  const V = (x, y, z) => new THREE.Vector3(x || 0, y || 0, z || 0);
  const rot = (o, x, y, z, k) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };

  K.buildBody = function (name) {
    const PG = G.Props.PG, M = G.avatar.mats || [], leather = M[0], plate = M[1], cloth = M[2], dark = M[3];
    const m = (parent, geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); parent.add(o); return o; };
    const j = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };
    const root = new THREE.Group(), J = {};
    J.body = j(root, 0, 0.95, 0);
    m(J.body, PG.box, leather, 0.34, 0.2, 0.22, 0, 0.02, 0);
    J.chest = j(J.body, 0, 0.12, 0);
    m(J.chest, PG.box, leather, 0.4, 0.5, 0.24, 0, 0.27, 0);
    m(J.chest, PG.box, plate, 0.42, 0.3, 0.26, 0, 0.36, 0.01);
    for (const s of [-1, 1]) m(J.chest, PG.sph, plate, 0.13, 0.1, 0.14, s * 0.24, 0.5, 0);
    m(J.chest, PG.box, dark, 0.38, 0.05, 0.25, 0, 0.08, 0);
    m(J.chest, PG.box, cloth, 0.42, 0.65, 0.03, 0, 0.25, -0.15, 0.12);
    J.head = j(J.chest, 0, 0.58, 0);
    m(J.head, PG.sph, leather, 0.12, 0.14, 0.13, 0, 0.12, 0);
    m(J.head, PG.cone, cloth, 0.17, 0.32, 0.17, 0, 0.16, -0.02);
    m(J.head, PG.box, dark, 0.16, 0.05, 0.02, 0, 0.12, 0.12);
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
    J.hold = j(J.arms[1].hand, 0, -0.02, 0.06);
    J.legs = [];
    for (const s of [-1, 1]) {
      const hip = j(J.body, s * 0.1, -0.06, 0);
      m(hip, PG.cyl8, leather, 0.07, 0.42, 0.07, 0, -0.21, 0);
      const kn = j(hip, 0, -0.43, 0);
      m(kn, PG.cyl8, leather, 0.06, 0.4, 0.06, 0, -0.2, 0);
      m(kn, PG.box, dark, 0.1, 0.1, 0.2, 0, -0.42, 0.04);
      m(kn, PG.sph, plate, 0.07, 0.06, 0.06, 0, 0, 0.04);
      J.legs.push({ hip, kn });
    }
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const x = c.getContext('2d'); x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.lineWidth = 5; x.strokeStyle = '#000'; x.strokeText(name, 128, 34); x.fillStyle = '#ffe2a0'; x.fillText(name, 128, 34);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    tag.scale.set(1.6, 0.3, 1); tag.position.y = 2.1; tag.renderOrder = 6; root.add(tag);
    root.traverse((o) => { o.frustumCulled = false; });
    return { root, J, ph: 0, sw: 0, swT: 9, holdKey: '', hold: null, tag };
  };

  // what is in the hand: the same display model the shop uses, turned so the barrel (or the blade) points where the figure looks
  function holdModel(B, rp) {
    const key = (rp.mm ? 'm:' : 'g:') + rp.w;
    if (B.holdKey === key) return;
    B.holdKey = key;
    if (B.hold) { B.J.hold.remove(B.hold); B.hold.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) { /* shared geometry stays */ } }); B.hold = null; }
    const W = G.weapons;
    let g = null;
    try {
      if (rp.mm) { const d = G.MELEE_BY_ID[rp.w]; if (d && d.id !== 'fists') g = W.meleeDisplayModel(d); }
      else { const d = G.WEAPON_BY_ID[rp.w]; if (d) g = W.displayModel(d, {}); }
    } catch (e) { g = null; }
    if (!g) return;
    const w = new THREE.Group();
    g.rotation.set(0, 0, 0); g.position.set(0, 0, 0);
    w.add(g);
    w.rotation.set(0, rp.mm ? Math.PI : Math.PI, 0);
    w.scale.setScalar(rp.mm ? 0.9 : 1);
    B.hold = w; B.J.hold.add(w);
  }

  K.animBody = function (B, rp, dt) {
    const J = B.J, k = Math.min(1, dt * 12), t = G.game.time;
    const sp = Math.hypot(rp.vel.x, rp.vel.z), amp = Math.min(1, sp / 5.5), air = !rp.gnd && Math.abs(rp.vel.y) > 0.5;
    holdModel(B, rp);
    if (rp.sw && B.sw === 0) { B.sw = 1; B.swT = 0; } else if (!rp.sw) B.sw = 0;
    B.swT += dt;
    B.ph += dt * (2.2 + sp * 1.15) * (rp.cr ? 0.7 : 1);
    const pitch = U.clamp(rp.pitch || 0, -1.2, 1.2);
    const root = B.root;
    root.rotation.x = rp.dead ? -1.45 : 0;
    if (rp.pl === 1) {
      B.spin = (B.spin || 0) + dt * 14;
      rot(J.body, B.spin, 0, 0, 1); rot(J.chest, 0.5, 0, 0, k);
      for (const a of J.arms) { rot(a.sh, -0.6, 0, 0, k); rot(a.el, -1.6, 0, 0, k); }
      for (const l of J.legs) { rot(l.hip, -1.7, 0, 0, k); rot(l.kn, 2.2, 0, 0, k); }
      return;
    }
    B.spin = 0;
    if (rp.pl === 2) {
      rot(J.body, 0.15, 0, 0, k); rot(J.chest, 0.3, 0, 0, k);
      J.arms.forEach((a, i) => { rot(a.sh, -2.9, 0, (i ? -1 : 1) * 0.25, k); rot(a.el, -0.4, 0, 0, k); });
      J.legs.forEach((l, i) => { rot(l.hip, -0.2 - i * 0.3, 0, 0, k); rot(l.kn, 0.4 + i * 0.6, 0, 0, k); });
      return;
    }
    // body height and legs: standing, crouching, running, in the air
    const bodyY = rp.cr ? 0.7 : 0.95;
    J.body.position.y += (bodyY - J.body.position.y) * k;
    const lean = rp.sp ? 0.38 : rp.cr ? 0.15 : 0.04 + amp * 0.05;
    rot(J.body, lean, 0, 0, k);
    rot(J.chest, rp.sp ? 0.1 : 0, 0, 0, k);
    const s0 = Math.sin(B.ph), s1 = Math.sin(B.ph + Math.PI), a = amp * (rp.sp ? 1.0 : 0.7);
    if (air) {
      rot(J.legs[0].hip, -0.5, 0, 0, k); rot(J.legs[0].kn, 0.9, 0, 0, k);
      rot(J.legs[1].hip, 0.1, 0, 0, k); rot(J.legs[1].kn, 0.5, 0, 0, k);
    } else {
      const base = rp.cr ? -0.9 : 0, flex = rp.cr ? 1.6 : 0.12;
      rot(J.legs[0].hip, base + s0 * 0.75 * a, 0, 0, k); rot(J.legs[0].kn, flex + Math.max(0, -Math.sin(B.ph - 0.9)) * 1.1 * a, 0, 0, k);
      rot(J.legs[1].hip, base + s1 * 0.75 * a, 0, 0, k); rot(J.legs[1].kn, flex + Math.max(0, -Math.sin(B.ph + Math.PI - 0.9)) * 1.1 * a, 0, 0, k);
    }
    // arms
    const R = J.arms[1], L = J.arms[0];
    if (rp.gr) {
      rot(L.sh, -2.6, 0, 0.2, k); rot(L.el, 0, 0, 0, k);
      rot(R.sh, -1.2, 0, -0.3, k); rot(R.el, -0.9, 0, 0, k);
    } else if (rp.mm) {
      // a melee weapon: held low and ready, a swing when it comes, the free arm up as a guard
      let sh = -0.7 + Math.sin(t * 1.6) * 0.03, el = -1.1;
      if (rp.sw && B.swT < 0.42) { const u = B.swT / 0.42; sh = u < 0.3 ? -0.7 - u / 0.3 * 1.9 : -2.6 + (u - 0.3) / 0.7 * 3.0; el = u < 0.3 ? -1.2 : -0.2; }
      rot(R.sh, sh, 0, rp.sw ? -0.25 : 0, rp.sw ? 0.5 : k); rot(R.el, el, 0, 0, k);
      if (rp.gd) { rot(L.sh, -1.4, 0, 0.35, k); rot(L.el, -1.3, 0, 0, k); }
      else { rot(L.sh, s1 * 0.5 * a - 0.15, 0, 0.05, k); rot(L.el, -0.25, 0, 0, k); }
    } else if (rp.rl) {
      rot(R.sh, -0.95, 0, -0.1, k); rot(R.el, -0.9, 0, 0, k);
      rot(L.sh, -1.05 + Math.sin(t * 9) * 0.12, 0, 0.5, k); rot(L.el, -1.5, 0, 0, k);
    } else if (rp.sp) {
      rot(R.sh, -0.85, 0, -0.1, k); rot(R.el, -1.1, 0, 0, k);
      rot(L.sh, -0.9, 0, 0.45, k); rot(L.el, -1.2, 0, 0, k);
    } else {
      // gun up: the aim follows the pitch, a steadier and higher hold while aiming down the sights
      const up = -1.5 - pitch * 0.85 - (rp.ads || 0) * 0.07;
      rot(R.sh, up, 0, -0.08 - (rp.ads || 0) * 0.06, k); rot(R.el, -0.18 - (rp.ads || 0) * 0.15, 0, 0, k);
      rot(L.sh, up + 0.12, 0, 0.42 + (rp.ads || 0) * 0.08, k); rot(L.el, -0.75, 0, 0, k);
      rot(J.chest, (rp.ads || 0) * 0.08, (rp.ads || 0) * -0.18, 0, k);
    }
    rot(J.head, rp.sp ? -0.2 : -pitch * 0.5, 0, 0, k);
  };
})();
