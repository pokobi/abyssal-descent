'use strict';
// Co-op: the body of another player. The solo game only has one avatar (shown in grapple moments), so this builds the same figure again with its joints at hand,
// and poses it from what the player sends: walking, running, crouching, the weapon in hand (aiming, reloading, swinging, guarding), the pile driver and the grapple.
(function () {
  const K = G.Coop;
  const U = G.U;
  const V = G.U.V;
  const rot = (o, x, y, z, k) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };

  K.buildBody = function (name, col, cls) {
    const j = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; };
    // the same figure as your own (avatar.js), with materials of its own
    const F = G.avatar.buildFigure(), root = F.root, J = F.J;
    J.hold = j(J.arms[1].hand, 0, -0.02, 0.06);
    const c = document.createElement('canvas'); c.width = 256; c.height = 48;
    const x = c.getContext('2d'); x.font = '700 28px sans-serif'; x.textAlign = 'center'; x.lineWidth = 5; x.strokeStyle = '#000'; x.strokeText(name, 128, 34); x.fillStyle = col || '#ffe2a0'; x.fillText(name, 128, 34);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
    tag.scale.set(1.6, 0.3, 1); tag.position.y = 2.1; tag.renderOrder = 6; root.add(tag);
    // the effects running on them (icons of the ultimate / skill buffs), a soft glow while any is up
    const bc = document.createElement('canvas'); bc.width = 256; bc.height = 48;
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, depthTest: false }));
    badge.scale.set(1.6, 0.3, 1); badge.position.y = 2.38; badge.renderOrder = 6; badge.visible = false; root.add(badge);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(2.2, 2.8, 1); glow.position.y = 1.0; root.add(glow);
    // a small health bar under the name
    const mk = (c, o) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: c, transparent: true, opacity: o, depthTest: false })); s.position.y = 1.93; s.renderOrder = 7; root.add(s); return s; };
    const hpBg = mk(0x000000, 0.65), hpFg = mk(0x6fd06f, 1); hpBg.scale.set(0.84, 0.075, 1); hpFg.scale.set(0.8, 0.045, 1);
    if (cls && G.avatar.dress) G.avatar.dress(J, cls);
    root.traverse((o) => { o.frustumCulled = false; });
    return { root, J, cls, ph: 0, sw: 0, swT: 9, holdKey: '', hold: null, tag, badge, bc, glow, tbKey: null, hpFg, hpBg };
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
    // the hand's -y runs along the forearm and its +z is the back of the hand: the barrel (the model's -z) lies along the forearm, the top of the gun upwards
    if (rp.mm) w.rotation.set(Math.PI, 0, 0);
    else w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)));
    w.scale.setScalar(rp.mm ? 0.9 : 1);
    B.hold = w; B.J.hold.add(w);
  }

  let bladeM = null;
  const BLADE = () => bladeM || (bladeM = new THREE.MeshStandardMaterial({ color: 0xd8e0ff, metalness: 1, roughness: 0.2, emissive: 0x404a70 }));
  const PSC = [[1, 0xff7a20], [2, 0x6ad040], [4, 0xffe060], [8, 0x70b0ff], [32, 0xd0b0ff]];
  function effects(B, rp, dt) {
    const hk = Math.max(0.001, Math.min(1, rp.hp / (rp.maxHp || 1)));
    B.hpFg.scale.x = 0.8 * hk; B.hpFg.material.color.setHex(hk < 0.3 ? 0xff5a40 : hk < 0.6 ? 0xffc040 : 0x6fd06f); B.hpFg.visible = B.hpBg.visible = !rp.dead;
    // the grapple line
    if (rp.hk) G.fx.seg(V(rp.pos.x, rp.pos.y + 1.2, rp.pos.z), V(rp.hk[0], rp.hk[1], rp.hk[2]), 0xc0b090, 0.03, 0.05);
    // orbiting blades
    if ((rp.bl || 0) !== (B.blN || 0)) {
      for (const m of B.blades || []) B.root.remove(m);
      B.blades = []; B.blN = rp.bl || 0;
      for (let i = 0; i < B.blN; i++) { const m = new THREE.Mesh(G.Props.PG.box, BLADE()); m.scale.set(0.06, 0.04, 0.7); B.root.add(m); B.blades.push(m); }
    }
    if (B.blades) B.blades.forEach((m, i) => { const a = G.game.time * 3 + i / B.blades.length * 6.283; m.position.set(Math.cos(a) * 1.4, 1.1, Math.sin(a) * 1.4); m.rotation.y = -a; });
    const key = rp.tb || '';
    if (B.tbKey !== key) {
      B.tbKey = key;
      const x = B.bc.getContext('2d'); x.clearRect(0, 0, 256, 48); x.font = '30px sans-serif'; x.textAlign = 'center';
      if (key) x.fillText(key, 128, 36);
      B.badge.material.map.needsUpdate = true; B.badge.visible = !!key;
    }
    let col = 0, k = 0;
    for (const [bit, c] of PSC) if (rp.ps & bit) { col = c; k = 0.4; }
    if (rp.tb) { col = col || 0xffd27a; k = Math.max(k, 0.35); }
    B.glow.material.opacity += ((rp.dead ? 0 : k) - B.glow.material.opacity) * Math.min(1, dt * 6);
    if (col) B.glow.material.color.setHex(col);
    const p = rp.pos, R = Math.random;
    if ((rp.ps & 1) && R() < dt * 14) G.fx.flameLick(p.x + U.rand(-0.3, 0.3), p.y + U.rand(0.2, 1.6), p.z + U.rand(-0.3, 0.3), 0.8);
    if ((rp.ps & 2) && R() < dt * 6) G.fx.norm.spawn(p.x, p.y + 1.2, p.z, U.rand(-0.3, 0.3), -0.5, U.rand(-0.3, 0.3), 0.8, 0.12, 0.3, 0.4, 0.8, 0.1, 0.7, 0, 0);
    if ((rp.ps & 4) && R() < dt * 8) G.fx.sparks(V(p.x, p.y + 1.1, p.z), null, 2, 0xfff0a0, 3);
    const inv = !!(rp.ps & 16);
    if (inv || B.inv) B.root.traverse((o) => { if (o.isMesh) o.visible = !inv || ((G.game.time * 6) % 1) < 0.35; });
    B.inv = inv;
  }

  // frozen solid (凍結 on their own screen, ps & 64): shut in ice - a rime over every part of them and what they hold (the foes' own,
  // vfx.js rimeMat, as enemies.js coat lays it), a rough lump of clear ice round the whole body, the pose held as it was. When it goes
  // it breaks off in chips and a cold puff
  let lumpGeo = null;
  function iceLump() {
    if (lumpGeo) return lumpGeo;
    const g = new THREE.IcosahedronGeometry(1, 2), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453, k = 0.86 + 0.22 * (h - Math.floor(h)); pa.setXYZ(i, x * k, y * k, z * k); }
    g.computeVertexNormals(); g.userData.shared = true;
    return (lumpGeo = g);
  }
  function frozenLook(B, rp, on) {
    if (on === !!B.frz) return;
    if (on) {
      const mat = G.vfx && G.vfx.rimeMat; B.frz = [];
      if (!mat) return;
      const list = [];
      B.root.traverse((o) => { if (o.isMesh && o.geometry && !o.userData.rime && !(o.material && (o.material.transparent || o.material.blending === THREE.AdditiveBlending))) list.push(o); });
      for (const o of list) { const hm = new THREE.Mesh(o.geometry, mat); hm.userData.rime = true; hm.raycast = () => {}; hm.scale.setScalar(1.05); hm.castShadow = false; o.add(hm); B.frz.push(hm); }
      const lump = new THREE.Mesh(iceLump(), mat); lump.userData.rime = true; lump.raycast = () => {}; lump.castShadow = false;
      lump.scale.set(0.62, 1.12, 0.62); lump.position.y = 0.98; B.root.add(lump); B.frz.push(lump);
      G.fx.iceBurst(V(rp.pos.x, rp.pos.y + 1.1, rp.pos.z), 12, 2.4, 1.1);
    } else {
      for (const hm of B.frz) if (hm.parent) hm.parent.remove(hm);
      B.frz = null;
      if (!rp.dead) G.fx.iceBurst(V(rp.pos.x, rp.pos.y + 1.1, rp.pos.z), 26, 4.2, 1.5);
    }
  }
  K.animBody = function (B, rp, dt) {
    if (B.J.orbs) G.avatar.orbTick(B.J, dt, null); // (a mage's orbs keep turning)
    effects(B, rp, dt);
    const J = B.J, k = Math.min(1, dt * 12), t = G.game.time;
    const sp = Math.hypot(rp.vel.x, rp.vel.z), amp = Math.min(1, sp / 5.5), air = !rp.gnd && Math.abs(rp.vel.y) > 0.5;
    holdModel(B, rp);
    frozenLook(B, rp, !!(rp.ps & 64) && !rp.dead);
    if (B.frz) return; // (frozen: held in the pose it had)
    if (rp.sw && B.sw === 0) {
      B.sw = 1; B.swT = 0;
      // the swing itself: a short arc in front of them
      const y = rp.yaw, fx = -Math.sin(y), fz = -Math.cos(y), o = rp.pos;
      for (let i = 0; i < 4; i++) {
        const a0 = -0.9 + i * 0.5, a1 = a0 + 0.5, c = (a) => V(o.x + (fx * Math.cos(a) - fz * Math.sin(a)) * 1.5, o.y + 1.3 - i * 0.05, o.z + (fz * Math.cos(a) + fx * Math.sin(a)) * 1.5);
        G.fx.seg(c(a0), c(a1), 0xfff0d0, 0.035, 0.12);
      }
    } else if (!rp.sw) B.sw = 0;
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
