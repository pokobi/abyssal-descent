'use strict';
// Monsters: procedural models (15 body plans + variant ornaments), procedural animation, AI & attacks, health bars.
(function () {
  const E = (G.enemies = { list: [] });
  const U = G.U;
  const w0 = () => G.world;
  const V = G.U.V;
  let P, C, PG;

  // ---------------- materials ----------------
  const PLANCOL = {
    hound: { skin: '#5a4636', sec: '#2a201a', rough: 0.85, blood: 0x6a0c0c, tex: 'skin' },
    imp: { skin: '#9a3a26', sec: '#3a1a12', rough: 0.6, blood: 0x5a0a0a, tex: 'scales' },
    skeleton: { skin: '#d6cab0', sec: '#5a4a3a', rough: 0.7, blood: 0x6a6050, tex: 'skin' },
    slime: { skin: '#5aa040', sec: '#2a5a20', rough: 0.15, blood: 0x4a8a20, tex: 'skin', trans: 0.82 },
    bat: { skin: '#3a2c2a', sec: '#1a1212', rough: 0.9, blood: 0x5a0a0a, tex: 'skin' },
    spider: { skin: '#2c2622', sec: '#7a1a10', rough: 0.55, blood: 0x4a6a20, tex: 'scales' },
    brute: { skin: '#6a7650', sec: '#4a3020', rough: 0.8, blood: 0x6a0c0c, tex: 'skin' },
    gargoyle: { skin: '#6e6a64', sec: '#3c3834', rough: 0.95, blood: 0x5a5650, tex: 'rock' },
    beetle: { skin: '#26384a', sec: '#141a20', rough: 0.25, metal: 0.3, blood: 0x6a8a20, tex: 'scales' },
    wraith: { skin: '#2a2a36', sec: '#0e0e14', rough: 0.95, blood: 0x30304a, tex: 'skin', trans: 0.85 },
    mushroom: { skin: '#9a3420', sec: '#d8ccb0', rough: 0.7, blood: 0x8aa040, tex: 'skin' },
    golem: { skin: '#7a7066', sec: '#4a4440', rough: 0.95, blood: 0x6a6056, tex: 'rock' },
    shaman: { skin: '#4a2a5a', sec: '#d8ccb0', rough: 0.9, blood: 0x6a0c0c, tex: 'skin' },
    mantis: { skin: '#5a7a3a', sec: '#2a3a1a', rough: 0.45, blood: 0x6a9a20, tex: 'scales' },
    worm: { skin: '#8a6050', sec: '#3a2a20', rough: 0.5, blood: 0x7a3010, tex: 'scales' },
    mimic: { skin: '#8a5a30', sec: '#c8a050', rough: 0.6, blood: 0x6a0c0c, tex: 'skin' },
  };
  function mkMats(def, opts) {
    const pc = PLANCOL[def.plan];
    const t = G.Tex.tex;
    const tx = pc.tex === 'rock' ? t.rock : t[pc.tex] || t.skin;
    const col = opts && opts.ally ? '#7a9ab0' : def.color || pc.skin;
    const skin = new THREE.MeshStandardMaterial({ color: col, roughness: pc.rough, metalness: pc.metal || 0, map: tx.map, normalMap: tx.normalMap });
    if (pc.trans) { skin.transparent = true; skin.opacity = pc.trans; }
    if (def.plan === 'slime') { skin.emissive = new THREE.Color(col).multiplyScalar(0.25); }
    const sec = new THREE.MeshStandardMaterial({ color: pc.sec, roughness: 0.7, map: t.smooth.map });
    const eyeCol = opts && opts.ally ? '#80d0ff' : def.eye || (def.plan === 'skeleton' ? '#ff9040' : '#ffcc40');
    const eye = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: eyeCol, emissiveIntensity: 2.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.8 });
    const tooth = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.4 });
    let orn = null;
    switch (def.orn) {
      case 'horns': orn = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.5 }); break;
      case 'ember': orn = new THREE.MeshStandardMaterial({ color: 0x2a1008, emissive: 0xff6a20, emissiveIntensity: 1.8 }); break;
      case 'ice': orn = new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85, emissive: 0x204060 }); break;
      case 'spikes': orn = new THREE.MeshStandardMaterial({ color: 0x8aa040, emissive: 0x2a4000, roughness: 0.4 }); break;
      case 'sparks': orn = new THREE.MeshStandardMaterial({ color: 0x202020, emissive: 0xffe070, emissiveIntensity: 1.6 }); break;
      case 'wisps': orn = new THREE.MeshStandardMaterial({ color: 0x0a0810, emissive: 0x6020a0, emissiveIntensity: 0.8 }); break;
      case 'bones': orn = new THREE.MeshStandardMaterial({ color: 0xe0d8c0, roughness: 0.6 }); break;
      case 'crystal': orn = new THREE.MeshStandardMaterial({ color: 0x80b8ff, emissive: 0x2050a0, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.3 }); break;
      case 'abyss': orn = new THREE.MeshStandardMaterial({ color: 0x0a0408, emissive: 0x8a0a1a, emissiveIntensity: 1.2, roughness: 0.3 }); break;
    }
    return { skin, sec, eye, dark, tooth, orn, all: [skin, sec, eye, dark, tooth].concat(orn ? [orn] : []) };
  }

  // ---------------- model builders ----------------
  function mesh(parent, geo, mat, sx, sy, sz, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh((geo === PG.box && PG.rbox) || geo, mat); m.scale.set(sx, sy, sz); m.position.set(x || 0, y || 0, z || 0); m.rotation.set(rx || 0, ry || 0, rz || 0); // (a body's boxes have their edges softened)
    m.castShadow = true; parent.add(m); return m;
  }
  function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }
  function leg(parent, M, x, y, z, len, thick, mat, knee) {
    const hip = joint(parent, x, y, z);
    mesh(hip, PG.box, mat || M.skin, thick, len * 0.5, thick, 0, -len * 0.25, 0);
    const kn = joint(hip, 0, -len * 0.5, 0);
    mesh(kn, PG.box, mat || M.skin, thick * 0.85, len * 0.5, thick * 0.85, 0, -len * 0.25, knee || 0);
    mesh(kn, PG.box, M.sec, thick * 1.1, thick * 0.5, thick * 1.4, 0, -len * 0.5, thick * 0.2);
    return { hip, kn };
  }
  const B = {};
  B.hound = function (root, M) {
    const body = joint(root, 0, 0.78, 0);
    mesh(body, PG.sph, M.skin, 0.26, 0.24, 0.5, 0, 0, 0);
    mesh(body, PG.sph, M.skin, 0.28, 0.27, 0.3, 0, 0.04, 0.28);
    const neck = joint(body, 0, 0.12, 0.48);
    const head = joint(neck, 0, 0.06, 0.12);
    mesh(head, PG.box, M.skin, 0.26, 0.22, 0.3, 0, 0, 0.05);
    mesh(head, PG.box, M.skin, 0.16, 0.12, 0.22, 0, -0.04, 0.26);
    const jaw = joint(head, 0, -0.1, 0.1);
    mesh(jaw, PG.box, M.sec, 0.14, 0.05, 0.26, 0, 0, 0.12);
    for (const s of [-1, 1]) { mesh(head, PG.sph, M.eye, 0.03, 0.03, 0.03, s * 0.08, 0.05, 0.19); mesh(head, PG.cone, M.skin, 0.05, 0.12, 0.05, s * 0.09, 0.15, -0.02, -0.3); for (let i = 0; i < 3; i++) mesh(head, PG.cone, M.tooth, 0.012, 0.05, 0.012, s * 0.05, -0.1, 0.22 + i * 0.05, Math.PI); }
    const L = [];
    for (const [x, z] of [[-0.15, 0.35], [0.15, 0.35], [-0.15, -0.35], [0.15, -0.35]]) L.push(leg(body, M, x, -0.05, z, 0.72, 0.1));
    const tail = joint(body, 0, 0.08, -0.48);
    mesh(tail, PG.cone, M.skin, 0.06, 0.5, 0.06, 0, 0, -0.22, -Math.PI / 2 - 0.4);
    return {
      J: { body, head, jaw, tail, L }, h: 1.15, r: 0.5,
      hits: [{ n: head, r: 0.2, part: 'head', o: V(0, 0, 0.1) }, { n: body, r: 0.32, part: 'body', o: V(0, 0, 0.25) }, { n: body, r: 0.3, part: 'body', o: V(0, 0, -0.25) }],
      orn: { head, back: body, backZ: [-0.3, 0.4], backY: 0.22 },
      animate(a) {
        const w = a.walk;
        L[0].hip.rotation.x = Math.sin(w) * 0.7 * a.mv; L[3].hip.rotation.x = Math.sin(w) * 0.7 * a.mv;
        L[1].hip.rotation.x = Math.sin(w + Math.PI) * 0.7 * a.mv; L[2].hip.rotation.x = Math.sin(w + Math.PI) * 0.7 * a.mv;
        for (const l of L) l.kn.rotation.x = Math.max(0, -l.hip.rotation.x) * 0.9;
        body.position.y = 0.78 + Math.abs(Math.sin(w)) * 0.05 * a.mv - a.wind * 0.18;
        body.rotation.x = a.wind * 0.25 - a.atk * 0.3;
        jaw.rotation.x = 0.1 + a.atk * 0.7 + a.wind * 0.3 + Math.sin(a.t * 3) * 0.05;
        head.rotation.x = -a.flinch * 0.5 + a.wind * 0.3;
        tail.rotation.y = Math.sin(a.t * 6) * 0.4; tail.rotation.x = -0.2;
      },
    };
  };
  B.imp = function (root, M) {
    const hips = joint(root, 0, 0.55, 0);
    const torso = joint(hips, 0, 0.05, 0);
    mesh(torso, PG.sph, M.skin, 0.2, 0.26, 0.16, 0, 0.18, 0);
    const head = joint(torso, 0, 0.5, 0.02);
    mesh(head, PG.sph, M.skin, 0.17, 0.16, 0.16);
    for (const s of [-1, 1]) { mesh(head, PG.sph, M.eye, 0.035, 0.03, 0.02, s * 0.07, 0.02, 0.13); mesh(head, PG.cone, M.sec, 0.04, 0.18, 0.04, s * 0.09, 0.15, -0.02, -0.4, 0, s * 0.4); mesh(head, PG.cone, M.skin, 0.03, 0.1, 0.02, s * 0.17, 0.02, 0, 0, 0, -s * 1.3); }
    mesh(head, PG.box, M.dark, 0.1, 0.02, 0.02, 0, -0.06, 0.14);
    const arms = [];
    for (const s of [-1, 1]) { const sh = joint(torso, s * 0.2, 0.32, 0); mesh(sh, PG.box, M.skin, 0.06, 0.32, 0.06, 0, -0.15, 0); const hand = joint(sh, 0, -0.32, 0); mesh(hand, PG.sph, M.sec, 0.05, 0.05, 0.05); arms.push({ sh, hand }); }
    const L = [leg(hips, M, -0.1, 0, 0, 0.55, 0.08), leg(hips, M, 0.1, 0, 0, 0.55, 0.08)];
    const tail = joint(hips, 0, 0, -0.12); mesh(tail, PG.cone, M.skin, 0.025, 0.4, 0.025, 0, -0.1, -0.15, -2.2);
    const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xff8030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    orb.scale.setScalar(0.001); arms[1].hand.add(orb);
    return {
      J: { torso, head, L, arms, orb }, h: 1.15, r: 0.32,
      hits: [{ n: head, r: 0.17, part: 'head' }, { n: torso, r: 0.25, part: 'body', o: V(0, 0.18, 0) }, { n: hips, r: 0.2, part: 'body', o: V(0, -0.25, 0) }],
      orn: { head, back: torso, backZ: [0, 0], backY: 0.3 },
      animate(a) {
        const w = a.walk;
        L[0].hip.rotation.x = Math.sin(w) * 0.8 * a.mv; L[1].hip.rotation.x = -Math.sin(w) * 0.8 * a.mv;
        L[0].kn.rotation.x = Math.max(0, Math.sin(w)) * 0.8 * a.mv; L[1].kn.rotation.x = Math.max(0, -Math.sin(w)) * 0.8 * a.mv;
        arms[0].sh.rotation.x = -Math.sin(w) * 0.6 * a.mv; arms[1].sh.rotation.x = Math.sin(w) * 0.6 * a.mv - a.wind * 2.6 + a.atk * 3.2;
        orb.scale.setScalar(0.001 + a.wind * 0.5);
        torso.rotation.x = 0.15 - a.flinch * 0.4; head.rotation.z = Math.sin(a.t * 2) * 0.1;
        hips.position.y = 0.55 + Math.abs(Math.sin(w)) * 0.04;
      },
    };
  };
  B.skeleton = function (root, M, opts) {
    const hips = joint(root, 0, 0.95, 0);
    mesh(hips, PG.box, M.skin, 0.32, 0.12, 0.16);
    const spine = joint(hips, 0, 0.06, 0);
    mesh(spine, PG.box, M.skin, 0.05, 0.5, 0.05, 0, 0.25, -0.05);
    for (let i = 0; i < 4; i++) mesh(spine, PG.torus, M.skin, 0.17 - i * 0.012, 0.12, 0.06, 0, 0.22 + i * 0.09, 0.02, Math.PI / 2);
    const head = joint(spine, 0, 0.66, 0);
    mesh(head, PG.sph, M.skin, 0.13, 0.14, 0.15, 0, 0.06, 0);
    mesh(head, PG.box, M.skin, 0.13, 0.06, 0.1, 0, -0.05, 0.06);
    for (const s of [-1, 1]) mesh(head, PG.sph, M.eye, 0.03, 0.03, 0.02, s * 0.05, 0.06, 0.12);
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(spine, s * 0.22, 0.55, 0);
      mesh(sh, PG.sph, M.skin, 0.07, 0.06, 0.07);
      mesh(sh, PG.box, M.skin, 0.04, 0.3, 0.04, 0, -0.15, 0);
      const el = joint(sh, 0, -0.3, 0); mesh(el, PG.box, M.skin, 0.035, 0.28, 0.035, 0, -0.14, 0);
      const hand = joint(el, 0, -0.3, 0);
      arms.push({ sh, el, hand });
    }
    // rusty sword + optional shield
    const blade = mesh(arms[1].hand, PG.box, M.sec, 0.03, 0.06, 0.75, 0, 0, 0.35);
    mesh(arms[1].hand, PG.box, M.sec, 0.16, 0.03, 0.03, 0, 0, 0.0);
    if (!opts.ally && Math.random() < 0.5) mesh(arms[0].hand, PG.cyl, M.sec, 0.25, 0.04, 0.25, 0, 0, 0.05, Math.PI / 2);
    const L = [leg(hips, M, -0.12, -0.04, 0, 0.92, 0.06), leg(hips, M, 0.12, -0.04, 0, 0.92, 0.06)];
    return {
      J: { spine, head, arms, L }, h: 1.85, r: 0.38,
      hits: [{ n: head, r: 0.15, part: 'head', o: V(0, 0.04, 0) }, { n: spine, r: 0.26, part: 'body', o: V(0, 0.38, 0) }, { n: hips, r: 0.22, part: 'body', o: V(0, -0.3, 0) }],
      orn: { head, back: spine, backZ: [0, 0], backY: 0.45 },
      animate(a) {
        const w = a.walk;
        L[0].hip.rotation.x = Math.sin(w) * 0.6 * a.mv; L[1].hip.rotation.x = -Math.sin(w) * 0.6 * a.mv;
        L[0].kn.rotation.x = Math.max(0, Math.sin(w)) * 0.7 * a.mv; L[1].kn.rotation.x = Math.max(0, -Math.sin(w)) * 0.7 * a.mv;
        arms[0].sh.rotation.x = -0.4 - Math.sin(w) * 0.3 * a.mv;
        arms[1].sh.rotation.x = -0.5 + Math.sin(w) * 0.3 * a.mv - a.wind * 2.0 + a.atk * 2.8;
        arms[1].el.rotation.x = -0.6 - a.wind * 0.5;
        spine.rotation.x = 0.1 + a.wind * -0.2 + a.atk * 0.35 - a.flinch * 0.4;
        spine.rotation.y = a.atk * 0.6 - a.wind * 0.4;
        head.rotation.y = Math.sin(a.t * 1.3) * 0.15;
        hips.position.y = 0.95 + Math.abs(Math.sin(w)) * 0.03;
      },
    };
  };
  B.slime = function (root, M) {
    const body = joint(root, 0, 0, 0);
    const blob = mesh(body, PG.sph, M.skin, 0.62, 0.55, 0.62, 0, 0.55, 0);
    const core = mesh(body, PG.sph, M.sec, 0.22, 0.2, 0.22, 0, 0.5, 0);
    const face = joint(body, 0, 0.62, 0.45);
    for (const s of [-1, 1]) mesh(face, PG.sph, M.eye, 0.07, 0.09, 0.04, s * 0.15, 0.08, 0.05);
    mesh(face, PG.box, M.dark, 0.2, 0.04, 0.04, 0, -0.08, 0.06);
    return {
      J: { body, blob, face }, h: 1.1, r: 0.6,
      hits: [{ n: body, r: 0.25, part: 'head', o: V(0, 0.75, 0.25) }, { n: body, r: 0.55, part: 'body', o: V(0, 0.5, 0) }],
      orn: { head: face, back: body, backZ: [0, 0], backY: 0.95 },
      animate(a) {
        const s = Math.sin(a.walk * 0.9);
        const sq = 1 + s * 0.12 * a.mv + a.wind * 0.3 - a.atk * 0.2;
        blob.scale.set(0.62 / Math.sqrt(sq), 0.55 * sq, 0.62 / Math.sqrt(sq));
        blob.position.y = 0.55 * sq;
        core.position.y = 0.45 * sq + Math.sin(a.t * 2) * 0.05;
        face.position.y = 0.62 * sq;
        body.rotation.z = Math.sin(a.t * 2.2) * 0.05;
      },
    };
  };
  B.bat = function (root, M) {
    const body = joint(root, 0, 0, 0);
    mesh(body, PG.sph, M.skin, 0.2, 0.22, 0.3);
    const head = joint(body, 0, 0.12, 0.26);
    mesh(head, PG.sph, M.skin, 0.13, 0.12, 0.13);
    for (const s of [-1, 1]) { mesh(head, PG.cone, M.skin, 0.05, 0.16, 0.03, s * 0.07, 0.14, -0.02, 0, 0, -s * 0.3); mesh(head, PG.sph, M.eye, 0.025, 0.025, 0.02, s * 0.05, 0.03, 0.11); mesh(head, PG.cone, M.tooth, 0.01, 0.04, 0.01, s * 0.02, -0.08, 0.1, Math.PI); }
    const wings = [];
    for (const s of [-1, 1]) {
      const sh = joint(body, s * 0.15, 0.06, 0);
      mesh(sh, PG.box, M.sec, 0.45, 0.015, 0.36, s * 0.24, 0, -0.05);
      const tip = joint(sh, s * 0.46, 0, 0);
      mesh(tip, PG.box, M.sec, 0.45, 0.012, 0.3, s * 0.22, 0, -0.1);
      mesh(tip, PG.box, M.skin, 0.45, 0.03, 0.03, s * 0.22, 0, 0.05);
      wings.push({ sh, tip, s });
    }
    const L = [leg(body, M, -0.08, -0.15, -0.1, 0.25, 0.03), leg(body, M, 0.08, -0.15, -0.1, 0.25, 0.03)];
    return {
      J: { body, head, wings }, h: 0.8, r: 0.45, fly: true,
      hits: [{ n: head, r: 0.14, part: 'head' }, { n: body, r: 0.27, part: 'body' }, { n: wings[0].sh, r: 0.25, part: 'body', o: V(-0.3, 0, 0) }, { n: wings[1].sh, r: 0.25, part: 'body', o: V(0.3, 0, 0) }],
      orn: { head, back: body, backZ: [0, 0], backY: 0.18 },
      animate(a) {
        const f = Math.sin(a.t * (a.atk > 0 ? 10 : 16));
        for (const wg of wings) { wg.sh.rotation.z = wg.s * (f * 0.8 - 0.1) * (1 - a.atk * 0.7); wg.tip.rotation.z = wg.s * f * 0.5; }
        body.rotation.x = 0.3 + a.atk * 0.6 - a.flinch * 0.5;
        body.position.y = Math.sin(a.t * 16) * 0.04;
      },
    };
  };
  B.spider = function (root, M) {
    const body = joint(root, 0, 0.5, 0);
    const abd = mesh(body, PG.sph, M.skin, 0.38, 0.32, 0.46, 0, 0.12, -0.45);
    mesh(body, PG.sph, M.sec, 0.12, 0.05, 0.25, 0, 0.42, -0.45);
    const head = joint(body, 0, 0.05, 0.15);
    mesh(head, PG.sph, M.skin, 0.24, 0.18, 0.26);
    for (let i = 0; i < 4; i++) mesh(head, PG.sph, M.eye, 0.035, 0.035, 0.03, (i % 2 ? 1 : -1) * (0.05 + (i > 1 ? 0.07 : 0)), 0.1 + (i > 1 ? -0.03 : 0), 0.22);
    const fangs = [];
    for (const s of [-1, 1]) { const f = joint(head, s * 0.07, -0.08, 0.2); mesh(f, PG.cone, M.dark, 0.03, 0.14, 0.03, 0, -0.06, 0.02, Math.PI - 0.3); fangs.push(f); }
    const legs = [];
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const hip = joint(body, s * 0.18, 0.02, 0.2 - i * 0.14);
      hip.rotation.y = s * (0.6 - i * 0.4) + (s < 0 ? Math.PI : 0);
      const up = joint(hip, 0, 0, 0); up.rotation.z = 0.7;
      mesh(up, PG.box, M.skin, 0.55, 0.05, 0.05, 0.27, 0, 0);
      const kn = joint(up, 0.55, 0, 0); kn.rotation.z = -1.9;
      mesh(kn, PG.box, M.skin, 0.65, 0.04, 0.04, 0.32, 0, 0);
      legs.push({ hip, up, kn, ph: i * 1.3 + (s > 0 ? Math.PI : 0) });
    }
    return {
      J: { body, head, legs, fangs }, h: 0.8, r: 0.6,
      hits: [{ n: head, r: 0.22, part: 'head' }, { n: body, r: 0.4, part: 'body', o: V(0, 0.12, -0.45) }],
      orn: { head, back: body, backZ: [-0.6, -0.3], backY: 0.42 },
      animate(a) {
        for (const l of legs) { const s = Math.sin(a.walk * 1.6 + l.ph); l.up.rotation.z = 0.7 + Math.max(0, s) * 0.35 * a.mv; l.hip.rotation.x = s * 0.25 * a.mv; }
        body.position.y = 0.5 - a.wind * 0.2 + Math.sin(a.walk * 3.2) * 0.02;
        body.rotation.x = -a.wind * 0.3 + a.atk * 0.3;
        fangs[0].rotation.z = 0.3 + Math.sin(a.t * 8) * 0.2 + a.atk * 0.5; fangs[1].rotation.z = -0.3 - Math.sin(a.t * 8) * 0.2 - a.atk * 0.5;
        abd.position.y = 0.12 + Math.sin(a.t * 3) * 0.02;
      },
    };
  };
  B.brute = function (root, M) {
    const hips = joint(root, 0, 1.25, 0);
    mesh(hips, PG.sph, M.skin, 0.5, 0.35, 0.4);
    mesh(hips, PG.box, M.sec, 0.75, 0.35, 0.5, 0, -0.15, 0);
    const torso = joint(hips, 0, 0.2, 0);
    mesh(torso, PG.sph, M.skin, 0.6, 0.6, 0.45, 0, 0.45, 0.05);
    mesh(torso, PG.sph, M.skin, 0.45, 0.4, 0.42, 0, 0.1, 0.18);
    const head = joint(torso, 0, 1.0, 0.25);
    mesh(head, PG.sph, M.skin, 0.24, 0.22, 0.25);
    mesh(head, PG.box, M.skin, 0.3, 0.12, 0.2, 0, -0.12, 0.08);
    for (const s of [-1, 1]) { mesh(head, PG.sph, M.eye, 0.035, 0.03, 0.02, s * 0.09, 0.04, 0.22); mesh(head, PG.cone, M.tooth, 0.04, 0.16, 0.04, s * 0.11, -0.05, 0.2, 0.2); }
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(torso, s * 0.62, 0.7, 0);
      mesh(sh, PG.sph, M.skin, 0.25, 0.25, 0.25);
      mesh(sh, PG.box, M.skin, 0.22, 0.65, 0.22, 0, -0.35, 0);
      const el = joint(sh, 0, -0.68, 0);
      mesh(el, PG.box, M.skin, 0.2, 0.62, 0.2, 0, -0.31, 0);
      const hand = joint(el, 0, -0.66, 0); mesh(hand, PG.sph, M.skin, 0.17, 0.15, 0.17);
      arms.push({ sh, el, hand });
    }
    const club = joint(arms[1].hand, 0, 0, 0);
    mesh(club, PG.cyl, M.sec, 0.06, 0.9, 0.06, 0, 0, 0.4, Math.PI / 2);
    mesh(club, PG.cyl, M.sec, 0.16, 0.5, 0.16, 0, 0, 0.85, Math.PI / 2);
    for (let i = 0; i < 4; i++) mesh(club, PG.cone, M.dark, 0.04, 0.12, 0.04, Math.cos(i * 1.57) * 0.16, Math.sin(i * 1.57) * 0.16, 0.85, 0, 0, i * 1.57 - Math.PI / 2);
    const L = [leg(hips, M, -0.3, -0.2, 0, 1.1, 0.24), leg(hips, M, 0.3, -0.2, 0, 1.1, 0.24)];
    return {
      J: { hips, torso, head, arms, L, club }, h: 3.0, r: 0.95,
      hits: [{ n: head, r: 0.28, part: 'head' }, { n: torso, r: 0.62, part: 'body', o: V(0, 0.4, 0.05) }, { n: hips, r: 0.48, part: 'body' }, { n: L[0].hip, r: 0.25, part: 'body', o: V(0, -0.5, 0) }, { n: L[1].hip, r: 0.25, part: 'body', o: V(0, -0.5, 0) }],
      orn: { head, back: torso, backZ: [-0.3, -0.2], backY: 0.9 },
      animate(a) {
        const w = a.walk * 0.8;
        L[0].hip.rotation.x = Math.sin(w) * 0.5 * a.mv; L[1].hip.rotation.x = -Math.sin(w) * 0.5 * a.mv;
        L[0].kn.rotation.x = Math.max(0, Math.sin(w)) * 0.6 * a.mv; L[1].kn.rotation.x = Math.max(0, -Math.sin(w)) * 0.6 * a.mv;
        arms[0].sh.rotation.x = -Math.sin(w) * 0.4 * a.mv - a.wind * 2.5 + a.atk * 3;
        arms[1].sh.rotation.x = Math.sin(w) * 0.4 * a.mv - a.wind * 2.8 + a.atk * 3.4;
        arms[0].sh.rotation.z = 0.15; arms[1].sh.rotation.z = -0.15;
        torso.rotation.x = 0.15 - a.wind * 0.35 + a.atk * 0.6 - a.flinch * 0.2;
        torso.rotation.z = Math.sin(w) * 0.06 * a.mv;
        hips.position.y = 1.25 + Math.abs(Math.sin(w)) * 0.06 - a.atk * 0.25;
      },
    };
  };
  // gargoyle: a crouching stone fiend held aloft by heavy wings; it picks up a stone and throws it
  B.gargoyle = function (root, M) {
    const body = joint(root, 0, 0.2, 0);
    mesh(body, PG.box, M.skin, 0.5, 0.55, 0.42, 0, 0.1, 0, 0.35);
    mesh(body, PG.box, M.sec, 0.52, 0.12, 0.44, 0, -0.12, 0.05, 0.35);
    const head = joint(body, 0, 0.42, 0.2);
    mesh(head, PG.box, M.skin, 0.3, 0.28, 0.32);
    mesh(head, PG.box, M.skin, 0.22, 0.12, 0.18, 0, -0.1, 0.17);
    for (const s of [-1, 1]) { mesh(head, PG.cone, M.sec, 0.05, 0.3, 0.05, s * 0.12, 0.2, -0.05, -0.5, 0, s * 0.35); mesh(head, PG.box, M.eye, 0.06, 0.03, 0.02, s * 0.07, 0.04, 0.17); }
    const wings = [];
    for (const s of [-1, 1]) {
      const sh = joint(body, s * 0.22, 0.25, -0.15);
      mesh(sh, PG.box, M.skin, 0.65, 0.05, 0.08, s * 0.32, 0, 0);
      mesh(sh, PG.box, M.sec, 0.6, 0.02, 0.5, s * 0.32, 0, -0.25);
      const tip = joint(sh, s * 0.64, 0, 0);
      mesh(tip, PG.box, M.sec, 0.55, 0.02, 0.45, s * 0.26, 0, -0.22); mesh(tip, PG.cone, M.skin, 0.04, 0.16, 0.04, s * 0.52, 0, 0, 0, 0, -s * Math.PI / 2);
      wings.push({ sh, tip, s });
    }
    const arms = [];
    for (const s of [-1, 1]) { const a = joint(body, s * 0.28, 0.2, 0.15); mesh(a, PG.box, M.skin, 0.1, 0.38, 0.1, 0, -0.18, 0.05, 0.4); arms.push(a); }
    // the stone in its right hand: the very model the thrown one uses (same scale, so what you see is what hits)
    const rock = mesh(arms[1], PG.dode, G.world.mats.rock, 0.26, 0.26, 0.26, 0, -0.42, 0.1); rock.visible = false;
    let relT = null; // when the throw was released (the arm swings through from there)
    const L = [leg(body, M, -0.14, -0.2, 0, 0.35, 0.06), leg(body, M, 0.14, -0.2, 0, 0.35, 0.06)];
    const tail = joint(body, 0, -0.1, -0.25); for (let i = 0; i < 3; i++) mesh(tail, PG.box, M.sec, 0.05, 0.05, 0.25, 0, -i * 0.06, -0.12 - i * 0.22, 0.3);
    return {
      J: { body, head, wings, rock }, h: 1.4, r: 0.6, fly: true,
      hits: [{ n: head, r: 0.2, part: 'head' }, { n: body, r: 0.38, part: 'body', o: V(0, 0.1, 0) }, { n: wings[0].sh, r: 0.25, part: 'body', o: V(-0.4, 0, -0.2) }, { n: wings[1].sh, r: 0.25, part: 'body', o: V(0.4, 0, -0.2) }],
      orn: { head, back: body, backZ: [-0.2, 0.1], backY: 0.35 },
      animate(a) {
        const f = Math.sin(a.t * (a.wind > 0 ? 4 : 7));
        for (const wg of wings) { wg.sh.rotation.z = wg.s * (f * 0.7 + 0.15); wg.tip.rotation.z = wg.s * f * 0.45; }
        head.rotation.x = -a.wind * 0.4 + a.flinch * 0.5;
        arms.forEach((ar, i) => { ar.rotation.x = -0.3 - a.atk * 0.8 + Math.sin(a.t * 3 + i) * 0.1; });
        // the right arm cocks the stone back over its shoulder while it winds up, then whips it forward at the release
        if (a.wind > 0.02) { rock.visible = true; rock.scale.setScalar(0.26 * Math.min(1, a.wind * 3)); arms[1].rotation.x = -0.3 - Math.min(1, a.wind * 1.15) * 3.0; relT = null; }
        else { rock.visible = false; if (a.atk >= 1 && relT === null) relT = a.t; if (a.atk <= 0) relT = null; if (relT !== null) arms[1].rotation.x = -3.3 + Math.min(1, (a.t - relT) / 0.12) * 2.9; }
        body.position.y = 0.2 + Math.sin(a.t * 3.5) * 0.08;
      },
    };
  };
  B.eye = function (root, M) {
    const body = joint(root, 0, 0, 0);
    const ball = mesh(body, PG.sph, M.skin, 0.62, 0.6, 0.6);
    const iris = mesh(body, PG.sph, M.sec, 0.32, 0.32, 0.12, 0, 0, 0.53);
    const pupil = mesh(body, PG.sph, M.eye, 0.13, 0.15, 0.06, 0, 0, 0.63);
    const lidT = joint(body, 0, 0, 0); mesh(lidT, PG.sph, M.sec, 0.65, 0.35, 0.62, 0, 0.32, -0.03);
    const tent = [];
    for (let i = 0; i < 6; i++) {
      const a0 = i / 6 * Math.PI * 2;
      let j = joint(body, Math.cos(a0) * 0.35, -0.45, Math.sin(a0) * 0.35);
      const segs = [];
      for (let k = 0; k < 4; k++) { mesh(j, PG.cyl8, M.sec, 0.06 - k * 0.012, 0.28, 0.06 - k * 0.012, 0, -0.14, 0); segs.push(j); j = joint(j, 0, -0.27, 0); }
      tent.push({ segs, ph: i });
    }
    return {
      J: { body, iris, pupil, lidT, tent }, h: 1.2, r: 0.62, fly: true,
      hits: [{ n: body, r: 0.24, part: 'head', o: V(0, 0, 0.5) }, { n: body, r: 0.6, part: 'body' }],
      orn: { head: body, back: body, backZ: [-0.3, 0], backY: 0.5 },
      animate(a) {
        for (const t of tent) t.segs.forEach((s, k) => { s.rotation.x = Math.sin(a.t * 2.5 + t.ph + k * 0.8) * 0.35; s.rotation.z = Math.cos(a.t * 2 + t.ph + k) * 0.3; });
        pupil.scale.set(0.13 * (1 - a.wind * 0.6), 0.15 * (1 + a.wind * 0.3), 0.06);
        lidT.rotation.x = -0.2 + Math.max(0, Math.sin(a.t * 0.7) > 0.98 ? 0.6 : 0) - a.wind * 0.3 + a.flinch * 0.6;
        body.position.y = Math.sin(a.t * 1.5) * 0.08;
      },
    };
  };
  B.beetle = function (root, M) {
    const body = joint(root, 0, 0.6, 0);
    mesh(body, PG.sph, M.skin, 0.7, 0.45, 0.95, 0, 0.1, -0.1);
    mesh(body, PG.box, M.dark, 0.02, 0.3, 1.6, 0, 0.42, -0.1);
    const head = joint(body, 0, 0.0, 0.85);
    mesh(head, PG.sph, M.skin, 0.42, 0.3, 0.32);
    mesh(head, PG.cone, M.sec, 0.12, 0.55, 0.12, 0, 0.25, 0.25, 0.6);
    const mand = [];
    for (const s of [-1, 1]) { const m = joint(head, s * 0.22, -0.1, 0.25); mesh(m, PG.cone, M.dark, 0.06, 0.32, 0.06, s * 0.05, 0, 0.12, Math.PI / 2, 0, s * 0.4); mand.push(m); mesh(head, PG.sph, M.eye, 0.05, 0.05, 0.04, s * 0.24, 0.08, 0.2); }
    const legs = [];
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const hip = joint(body, s * 0.55, -0.1, 0.35 - i * 0.4); hip.rotation.y = s < 0 ? Math.PI : 0;
      const up = joint(hip, 0, 0, 0); up.rotation.z = 0.5;
      mesh(up, PG.box, M.dark, 0.45, 0.08, 0.08, 0.22, 0, 0);
      const kn = joint(up, 0.45, 0, 0); kn.rotation.z = -1.6;
      mesh(kn, PG.box, M.dark, 0.5, 0.06, 0.06, 0.25, 0, 0);
      legs.push({ up, hip, ph: i * 2 + (s > 0 ? Math.PI : 0) });
    }
    return {
      J: { body, head, mand, legs }, h: 1.3, r: 0.95,
      hits: [{ n: head, r: 0.3, part: 'head' }, { n: body, r: 0.7, part: 'body', o: V(0, 0.1, -0.1) }, { n: body, r: 0.5, part: 'body', o: V(0, 0.1, -0.75) }],
      orn: { head, back: body, backZ: [-0.6, 0.3], backY: 0.5 },
      animate(a) {
        for (const l of legs) { const s = Math.sin(a.walk * 1.4 + l.ph); l.up.rotation.z = 0.5 + Math.max(0, s) * 0.3 * a.mv; l.hip.rotation.x = s * 0.3 * a.mv; }
        mand[0].rotation.y = 0.3 + Math.sin(a.t * 6) * 0.15 + a.atk * 0.5; mand[1].rotation.y = -mand[0].rotation.y;
        body.rotation.x = -a.wind * 0.15 + (a.stunned ? 0.3 : 0);
        head.rotation.x = a.wind * 0.3;
        body.position.y = 0.6 + Math.sin(a.walk * 2.8) * 0.02;
      },
    };
  };
  B.wraith = function (root, M) {
    const body = joint(root, 0, 1.2, 0);
    const robe = mesh(body, PG.cone, M.skin, 0.5, 1.5, 0.45, 0, -0.35, 0);
    const head = joint(body, 0, 0.55, 0.05);
    mesh(head, PG.sph, M.skin, 0.25, 0.27, 0.26);
    mesh(head, PG.sph, M.dark, 0.17, 0.19, 0.12, 0, -0.02, 0.17);
    for (const s of [-1, 1]) mesh(head, PG.sph, M.eye, 0.04, 0.025, 0.02, s * 0.07, 0.0, 0.27);
    const rags = [];
    for (let i = 0; i < 8; i++) { const a0 = i / 8 * Math.PI * 2; const r = joint(body, Math.cos(a0) * 0.42, -1.0, Math.sin(a0) * 0.38); mesh(r, PG.box, M.skin, 0.15, 0.6, 0.02, 0, -0.25, 0, 0, -a0); rags.push(r); }
    const arms = [];
    for (const s of [-1, 1]) { const sh = joint(body, s * 0.35, 0.25, 0.05); mesh(sh, PG.cone, M.skin, 0.12, 0.6, 0.12, 0, -0.25, 0); const hand = joint(sh, 0, -0.55, 0.05); for (let k = 0; k < 4; k++) mesh(hand, PG.box, M.sec, 0.012, 0.15, 0.012, (k - 1.5) * 0.025, -0.06, 0, 0.2); arms.push({ sh, hand }); }
    return {
      J: { body, head, rags, arms }, h: 2.1, r: 0.45, hover: true,
      hits: [{ n: head, r: 0.22, part: 'head' }, { n: body, r: 0.42, part: 'body', o: V(0, -0.15, 0) }, { n: body, r: 0.35, part: 'body', o: V(0, -0.8, 0) }],
      orn: { head, back: body, backZ: [-0.2, -0.2], backY: 0.3 },
      animate(a) {
        body.position.y = 1.2 + Math.sin(a.t * 1.8) * 0.12;
        rags.forEach((r, i) => { r.rotation.x = Math.sin(a.t * 3 + i) * 0.3 - a.mv * 0.4; });
        arms[0].sh.rotation.x = -0.3 - a.wind * 1.8 + a.atk * 2; arms[1].sh.rotation.x = -0.3 - a.wind * 1.8 + a.atk * 2;
        arms[0].sh.rotation.z = 0.2 + a.wind * 0.5; arms[1].sh.rotation.z = -0.2 - a.wind * 0.5;
        body.rotation.x = a.mv * 0.25 - a.flinch * 0.4;
        robe.scale.y = 1.5 + Math.sin(a.t * 2) * 0.05;
      },
    };
  };
  B.mushroom = function (root, M) {
    const body = joint(root, 0, 0, 0);
    const stem = joint(body, 0, 0.3, 0);
    mesh(stem, PG.cyl, M.sec, 0.25, 0.9, 0.25, 0, 0.45, 0);
    const cap = joint(stem, 0, 0.95, 0);
    const capM = mesh(cap, PG.sph, M.skin, 0.75, 0.42, 0.75, 0, 0.1, 0);
    mesh(cap, PG.cyl, M.sec, 0.68, 0.04, 0.68, 0, -0.05, 0);
    for (let i = 0; i < 9; i++) { const a0 = i * 2.3; const rr = 0.25 + (i % 3) * 0.15; mesh(cap, PG.sph, M.tooth, 0.07, 0.03, 0.07, Math.cos(a0) * rr, 0.38 - rr * 0.35, Math.sin(a0) * rr, -Math.sin(a0) * rr, 0, Math.cos(a0) * rr); }
    for (const s of [-1, 1]) mesh(stem, PG.sph, M.eye, 0.04, 0.05, 0.03, s * 0.09, 0.7, 0.23);
    mesh(stem, PG.box, M.dark, 0.12, 0.03, 0.02, 0, 0.55, 0.25);
    const roots = [];
    for (let i = 0; i < 4; i++) { const r = joint(body, Math.cos(i * 1.57 + 0.78) * 0.22, 0.3, Math.sin(i * 1.57 + 0.78) * 0.22); mesh(r, PG.cone, M.sec, 0.07, 0.35, 0.07, 0, -0.15, 0, Math.PI); roots.push(r); }
    return {
      J: { stem, cap, capM, roots }, h: 1.6, r: 0.6,
      hits: [{ n: cap, r: 0.55, part: 'head', o: V(0, 0.1, 0) }, { n: stem, r: 0.3, part: 'body', o: V(0, 0.45, 0) }],
      orn: { head: cap, back: cap, backZ: [0, 0], backY: 0.35 },
      animate(a) {
        roots.forEach((r, i) => { r.rotation.x = Math.sin(a.walk + i * 1.6) * 0.5 * a.mv; });
        stem.rotation.z = Math.sin(a.walk * 0.5) * 0.08 * a.mv;
        const sw = 1 + a.wind * 0.35 - a.atk * 0.2;
        capM.scale.set(0.75 * sw, 0.42 * (2 - sw), 0.75 * sw);
        stem.position.y = 0.3 + Math.abs(Math.sin(a.walk)) * 0.05 * a.mv;
      },
    };
  };
  B.golem = function (root, M) {
    const hips = joint(root, 0, 1.3, 0);
    mesh(hips, PG.dode, M.skin, 0.5, 0.35, 0.4);
    const torso = joint(hips, 0, 0.3, 0);
    mesh(torso, PG.box, M.skin, 1.1, 0.9, 0.7, 0, 0.45, 0, 0.05, 0, 0);
    mesh(torso, PG.dode, M.skin, 0.5, 0.4, 0.4, 0.4, 0.95, -0.1);
    mesh(torso, PG.dode, M.skin, 0.45, 0.35, 0.4, -0.45, 0.9, -0.05);
    const glow = mesh(torso, PG.sph, M.eye, 0.12, 0.12, 0.05, 0, 0.5, 0.36);
    const head = joint(torso, 0, 1.05, 0.12);
    mesh(head, PG.box, M.skin, 0.38, 0.3, 0.35);
    for (const s of [-1, 1]) mesh(head, PG.box, M.eye, 0.07, 0.03, 0.02, s * 0.1, 0.02, 0.18);
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(torso, s * 0.75, 0.75, 0);
      mesh(sh, PG.dode, M.skin, 0.32, 0.3, 0.32);
      mesh(sh, PG.dode, M.skin, 0.25, 0.4, 0.25, 0, -0.45, 0);
      const el = joint(sh, 0, -0.8, 0);
      mesh(el, PG.dode, M.skin, 0.24, 0.38, 0.24, 0, -0.3, 0);
      mesh(el, PG.dode, M.skin, 0.35, 0.3, 0.35, 0, -0.75, 0.05);
      arms.push({ sh, el });
    }
    const L = [leg(hips, M, -0.32, -0.15, 0, 1.15, 0.32), leg(hips, M, 0.32, -0.15, 0, 1.15, 0.32)];
    return {
      J: { torso, head, arms, L, glow }, h: 3.2, r: 1.0,
      hits: [{ n: head, r: 0.28, part: 'head' }, { n: torso, r: 0.7, part: 'body', o: V(0, 0.45, 0) }, { n: hips, r: 0.45, part: 'body' }, { n: arms[0].el, r: 0.3, part: 'body', o: V(0, -0.6, 0) }, { n: arms[1].el, r: 0.3, part: 'body', o: V(0, -0.6, 0) }],
      orn: { head, back: torso, backZ: [-0.35, -0.35], backY: 1.0 },
      animate(a) {
        const w = a.walk * 0.7;
        L[0].hip.rotation.x = Math.sin(w) * 0.45 * a.mv; L[1].hip.rotation.x = -Math.sin(w) * 0.45 * a.mv;
        L[0].kn.rotation.x = Math.max(0, Math.sin(w)) * 0.5 * a.mv; L[1].kn.rotation.x = Math.max(0, -Math.sin(w)) * 0.5 * a.mv;
        arms[0].sh.rotation.x = -Math.sin(w) * 0.3 * a.mv - a.wind * 2.6 + a.atk * 3.0;
        arms[1].sh.rotation.x = Math.sin(w) * 0.3 * a.mv - a.wind * (a.throwing ? 3.0 : 2.6) + a.atk * 3.2;
        torso.rotation.x = 0.1 - a.wind * 0.3 + a.atk * 0.5 - a.flinch * 0.15;
        hips.position.y = 1.3 + Math.abs(Math.sin(w)) * 0.06;
        glow.scale.setScalar(0.12 * (1 + Math.sin(a.t * 3) * 0.15));
      },
    };
  };
  B.shaman = function (root, M) {
    const hips = joint(root, 0, 0.9, 0);
    const robe = mesh(hips, PG.cone, M.skin, 0.45, 1.1, 0.4, 0, -0.35, 0);
    const torso = joint(hips, 0, 0.1, 0);
    mesh(torso, PG.sph, M.skin, 0.28, 0.4, 0.22, 0, 0.3, 0);
    const head = joint(torso, 0, 0.78, 0.03);
    mesh(head, PG.sph, M.skin, 0.2, 0.22, 0.2);
    mesh(head, PG.box, M.sec, 0.24, 0.3, 0.06, 0, -0.02, 0.18);
    for (const s of [-1, 1]) { mesh(head, PG.sph, M.eye, 0.03, 0.02, 0.02, s * 0.06, 0.03, 0.22); mesh(head, PG.cone, M.sec, 0.03, 0.25, 0.03, s * 0.12, 0.25, 0, -0.2, 0, s * 0.4); }
    const arms = [];
    for (const s of [-1, 1]) { const sh = joint(torso, s * 0.3, 0.55, 0); mesh(sh, PG.cone, M.skin, 0.09, 0.55, 0.09, 0, -0.25, 0); const hand = joint(sh, 0, -0.5, 0.05); arms.push({ sh, hand }); }
    const staff = joint(arms[1].hand, 0, 0, 0);
    mesh(staff, PG.cyl8, M.sec, 0.025, 1.9, 0.025, 0, 0.3, 0);
    mesh(staff, PG.sph, M.eye, 0.07, 0.07, 0.07, 0, 1.25, 0);
    const orbs = [];
    for (let i = 0; i < 3; i++) { const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0x8fd0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); o.scale.setScalar(0.25); torso.add(o); orbs.push(o); }
    return {
      J: { torso, head, arms, staff, orbs }, h: 2.0, r: 0.42,
      hits: [{ n: head, r: 0.19, part: 'head' }, { n: torso, r: 0.32, part: 'body', o: V(0, 0.3, 0) }, { n: hips, r: 0.35, part: 'body', o: V(0, -0.45, 0) }],
      orn: { head, back: torso, backZ: [-0.15, -0.15], backY: 0.5 },
      animate(a) {
        hips.position.y = 0.9 + Math.abs(Math.sin(a.walk)) * 0.04;
        robe.rotation.x = -a.mv * 0.15;
        arms[1].sh.rotation.x = -0.4 - a.wind * 1.8 + a.atk * 1.5; arms[0].sh.rotation.x = -0.2 - a.wind * 1.2;
        orbs.forEach((o, i) => { const an = a.t * 2 + i * 2.1; o.position.set(Math.cos(an) * 0.6, 0.6 + Math.sin(a.t * 3 + i) * 0.15, Math.sin(an) * 0.6); });
        head.rotation.y = Math.sin(a.t) * 0.3;
      },
    };
  };
  B.mantis = function (root, M) {
    const abd = joint(root, 0, 1.0, 0);
    mesh(abd, PG.sph, M.skin, 0.25, 0.22, 0.6, 0, 0, -0.45, 0.3);
    const thorax = joint(abd, 0, 0.05, 0.05);
    mesh(thorax, PG.box, M.skin, 0.16, 0.9, 0.16, 0, 0.45, 0.05, 0.25);
    const head = joint(thorax, 0, 0.98, 0.25);
    mesh(head, PG.cone, M.skin, 0.2, 0.3, 0.12, 0, 0, 0.08, Math.PI / 2 + 0.3);
    for (const s of [-1, 1]) mesh(head, PG.sph, M.eye, 0.08, 0.08, 0.06, s * 0.15, 0.04, 0.0);
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = joint(thorax, s * 0.12, 0.75, 0.2);
      mesh(sh, PG.box, M.skin, 0.07, 0.55, 0.07, 0, -0.25, 0.05);
      const el = joint(sh, 0, -0.52, 0.05);
      mesh(el, PG.box, M.sec, 0.03, 0.7, 0.1, 0, 0.32, 0.02);
      for (let k = 0; k < 4; k++) mesh(el, PG.cone, M.tooth, 0.015, 0.06, 0.015, 0, 0.1 + k * 0.14, 0.08, Math.PI / 2);
      arms.push({ sh, el });
    }
    const legs = [];
    for (let i = 0; i < 2; i++) for (const s of [-1, 1]) {
      const hip = joint(abd, s * 0.12, 0, 0.1 - i * 0.35);
      const up = joint(hip, 0, 0, 0); up.rotation.z = s * -0.9;
      mesh(up, PG.box, M.skin, 0.04, 0.7, 0.04, 0, -0.35, 0);
      const kn = joint(up, 0, -0.7, 0); kn.rotation.z = s * 1.3;
      mesh(kn, PG.box, M.skin, 0.035, 0.75, 0.035, 0, -0.37, 0);
      legs.push({ hip, ph: i * Math.PI + (s > 0 ? Math.PI / 2 : 0) });
    }
    return {
      J: { abd, thorax, head, arms, legs }, h: 2.4, r: 0.55,
      hits: [{ n: head, r: 0.18, part: 'head' }, { n: thorax, r: 0.24, part: 'body', o: V(0, 0.5, 0.1) }, { n: abd, r: 0.3, part: 'body', o: V(0, 0, -0.4) }],
      orn: { head, back: abd, backZ: [-0.6, -0.3], backY: 0.2 },
      animate(a) {
        for (const l of legs) l.hip.rotation.x = Math.sin(a.walk * 1.5 + l.ph) * 0.45 * a.mv;
        for (const ar of arms) { ar.sh.rotation.x = -0.9 - a.wind * 1.2 + a.atk * 2.4; ar.el.rotation.x = -2.4 + a.wind * 0.6 + a.atk * 1.8; }
        thorax.rotation.x = -0.1 - a.wind * 0.2 + a.atk * 0.5 - a.flinch * 0.3;
        head.rotation.z = Math.sin(a.t * 2.5) * 0.25; head.rotation.y = Math.sin(a.t * 1.1) * 0.2;
        abd.position.y = 1.0 + Math.sin(a.walk * 3) * 0.03 * a.mv;
      },
    };
  };
  B.worm = function (root, M) {
    const head = joint(root, 0, 0.8, 0);
    mesh(head, PG.sph, M.skin, 0.55, 0.5, 0.6);
    const mouth = joint(head, 0, 0, 0.45);
    for (let i = 0; i < 10; i++) { const a0 = i / 10 * Math.PI * 2; mesh(mouth, PG.cone, M.tooth, 0.04, 0.2, 0.04, Math.cos(a0) * 0.3, Math.sin(a0) * 0.3, 0.05, Math.PI / 2 + Math.sin(a0) * 0.5, 0, -Math.cos(a0) * 0.5); }
    mesh(mouth, PG.sph, M.dark, 0.32, 0.32, 0.1, 0, 0, 0.0);
    for (let i = 0; i < 4; i++) mesh(head, PG.sph, M.eye, 0.04, 0.04, 0.03, Math.cos(i * 1.57 + 0.78) * 0.35, Math.sin(i * 1.57 + 0.78) * 0.35, 0.38);
    const segs = [];
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Group();
      const r = 0.5 - i * 0.035;
      mesh(s, PG.sph, M.skin, r, r * 0.95, r * 0.7);
      mesh(s, PG.torus, M.sec, r * 0.95, r * 0.95, 0.6);
      root.add(s); segs.push(s);
    }
    return {
      J: { head, mouth, segs }, h: 2.2, r: 0.6, worm: true,
      hits: [{ n: head, r: 0.5, part: 'head' }].concat(segs.slice(0, 5).map((s) => ({ n: s, r: 0.45, part: 'body' }))),
      orn: { head, back: head, backZ: [-0.2, -0.2], backY: 0.45 },
      animate(a) {
        mouth.scale.setScalar(1 + a.atk * 0.4 + a.wind * 0.2 + Math.sin(a.t * 5) * 0.05);
      },
    };
  };
  B.mimic = function (root, M) {
    const body = joint(root, 0, 0.35, 0);
    mesh(body, PG.box, M.skin, 1.0, 0.55, 0.7, 0, 0.27, 0);
    const lid = joint(body, 0, 0.55, -0.35);
    mesh(lid, PG.box, M.skin, 1.0, 0.25, 0.7, 0, 0.12, 0.35);
    for (let i = 0; i < 8; i++) { mesh(lid, PG.cone, M.tooth, 0.03, 0.1, 0.03, -0.42 + i * 0.12, -0.03, 0.66, Math.PI); mesh(body, PG.cone, M.tooth, 0.03, 0.1, 0.03, -0.42 + i * 0.12, 0.58, 0.31); }
    for (const bx of [-0.35, 0.35]) mesh(body, PG.box, M.sec, 0.08, 0.57, 0.72, bx, 0.28, 0);
    const tongue = mesh(body, PG.box, new THREE.MeshStandardMaterial({ color: 0xa02838 }), 0.2, 0.04, 0.5, 0, 0.55, 0.4);
    for (const s of [-1, 1]) mesh(lid, PG.sph, M.eye, 0.05, 0.05, 0.03, s * 0.2, 0.2, 0.7);
    const L = [];
    for (const [x, z] of [[-0.35, 0.25], [0.35, 0.25], [-0.35, -0.25], [0.35, -0.25]]) L.push(leg(body, M, x, 0, z, 0.38, 0.06, M.sec));
    // coin glint
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: 0xffd060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); gl.scale.setScalar(0.6); gl.position.set(0, 0.5, 0.2); body.add(gl);
    return {
      J: { body, lid, L, tongue }, h: 1.0, r: 0.6,
      hits: [{ n: lid, r: 0.3, part: 'head', o: V(0, 0.2, 0.5) }, { n: body, r: 0.55, part: 'body', o: V(0, 0.27, 0) }],
      orn: { head: lid, back: body, backZ: [0, 0], backY: 0.6 },
      animate(a) {
        const w = a.walk * 1.5;
        L[0].hip.rotation.x = Math.sin(w) * 0.8; L[3].hip.rotation.x = Math.sin(w) * 0.8; L[1].hip.rotation.x = -Math.sin(w) * 0.8; L[2].hip.rotation.x = -Math.sin(w) * 0.8;
        lid.rotation.x = -0.25 - Math.abs(Math.sin(a.t * 6)) * 0.35;
        body.position.y = 0.35 + Math.abs(Math.sin(w)) * 0.08;
        tongue.rotation.x = Math.sin(a.t * 9) * 0.3;
      },
    };
  };

  function addOrnaments(m, def, M) {
    if (!M.orn) return;
    const o = m.orn, head = o.head, back = o.back;
    const z0 = o.backZ[0], z1 = o.backZ[1];
    switch (def.orn) {
      case 'horns': for (const s of [-1, 1]) { mesh(head, PG.cone, M.orn, 0.06, 0.4, 0.06, s * 0.14, 0.18, -0.05, -0.6, 0, s * 0.5); } break;
      case 'ember': for (let i = 0; i < 6; i++) mesh(back, PG.sph, M.orn, 0.08, 0.04, 0.08, U.rand(-0.15, 0.15), o.backY, U.lerp(z0, z1, i / 5)); break;
      case 'ice': for (let i = 0; i < 5; i++) mesh(back, PG.oct3, M.orn, 0.08, 0.28, 0.08, U.rand(-0.12, 0.12), o.backY + 0.1, U.lerp(z0, z1, i / 4), U.rand(-0.5, 0.5), 0, U.rand(-0.5, 0.5)); break;
      case 'spikes': for (let i = 0; i < 6; i++) mesh(back, PG.cone, M.orn, 0.05, 0.24, 0.05, 0, o.backY + 0.08, U.lerp(z0, z1, i / 5), -0.5); break;
      case 'sparks': for (let i = 0; i < 4; i++) mesh(back, PG.sph, M.orn, 0.04, 0.04, 0.04, U.rand(-0.2, 0.2), o.backY + U.rand(0, 0.1), U.lerp(z0, z1, i / 3)); break;
      case 'wisps': for (let i = 0; i < 3; i++) mesh(back, PG.cone, M.orn, 0.08, 0.35, 0.08, U.rand(-0.15, 0.15), o.backY + 0.12, U.lerp(z0, z1, i / 2), -0.8 + U.rand(-0.3, 0.3)); break;
      case 'bones': for (let i = 0; i < 4; i++) mesh(back, PG.box, M.orn, 0.3, 0.04, 0.08, 0, o.backY + 0.02, U.lerp(z0, z1, i / 3)); mesh(head, PG.box, M.orn, 0.2, 0.05, 0.15, 0, 0.14, 0.05); break;
      case 'crystal': for (let i = 0; i < 6; i++) mesh(back, PG.oct3, M.orn, 0.09, 0.35, 0.09, U.rand(-0.18, 0.18), o.backY + 0.15, U.lerp(z0, z1, i / 5), U.rand(-0.6, 0.6), 0, U.rand(-0.6, 0.6)); break;
      case 'abyss': for (let i = 0; i < 7; i++) mesh(back, PG.cone, M.orn, 0.07, 0.4, 0.07, U.rand(-0.2, 0.2), o.backY + 0.1, U.lerp(z0, z1, i / 6), -0.6 + U.rand(-0.4, 0.4), 0, U.rand(-0.4, 0.4)); for (const s of [-1, 1]) mesh(head, PG.cone, M.orn, 0.05, 0.35, 0.05, s * 0.12, 0.2, -0.05, -0.7, 0, s * 0.6); break;
    }
  }

  E.buildModel = function (def, opts) {
    opts = opts || {};
    const M = mkMats(def, opts);
    const root = new THREE.Group();
    const inner = new THREE.Group(); root.add(inner);
    const m = B[def.plan](inner, M, opts);
    addOrnaments(m, def, M);
    const s = def.size * (opts.scale || 1);
    inner.scale.setScalar(s);
    m.group = root; m.inner = inner; m.M = M; m.scale = s;
    // guaranteed core hitbox so no visual body region is left without collision
    if (!m.worm && !m.fly) m.hits.push({ n: inner, r: Math.max(m.r * 0.6, m.h * 0.2), part: 'body', o: V(0, m.h * 0.5, 0) });
    m.h *= s; m.r *= s;
    for (const h of m.hits) { h.r *= s * 1.15; h.w = V(); h.o = h.o || V(); }
    inner.traverse((o) => { if (o.isMesh) { o.castShadow = o.scale.x * o.scale.y * o.scale.z * s * s * s > 0.004; o.receiveShadow = false; } });
    if (opts.ally) m.animate = ((f) => (st) => f({ walk: st.walk, mv: st.moving ? 1 : 0, atk: st.atk, wind: 0, flinch: 0, t: st.t }))(m.animate);
    return m;
  };

  // ---------------- enemy entity ----------------
  const TINT = new THREE.Color(), FLASH = new THREE.Color(), AURA_C = new THREE.Color(), MUTC = new THREE.Color();
  const ELITE_MODS = [
    { id: 'fast', name: '俊足', icon: '💨' }, { id: 'bomb', name: '爆死', icon: '💥' },
    { id: 'vamp', name: '吸血', icon: '🩸' }, { id: 'armored', name: '装甲', icon: '🛡️' }, { id: 'rage', name: '狂暴', icon: '😡' },
  ];
  class Enemy {
    constructor(def, level, pos, opts) {
      opts = opts || {};
      this.isEnemy = true;
      this.def = def; this.level = level;
      this.noLoot = !!opts.noLoot; // minions called by a guardian leave nothing to search
      this.elite = !!opts.elite;
      this.eliteMod = null; // (the old elite traits are mutations now: an elite always carries one, see depth.js)
      // elements (element.js): what its blows carry, what it was born with, what it resists
      this.elAtk = def.el || def.auFix || null; this.auFix = def.auFix || null; this.elRes = def.elRes ? Object.assign({}, def.elRes) : null;
      const st = P.stats;
      const L = level - 1;
      const hpScale = (1 + 0.11 * L) * Math.pow(1.015, L) * Math.max(0.3, 1 + st.enemyHp) * (opts.hpMul || 1);
      this.maxHp = Math.round(def.hp * hpScale * (this.elite ? 2.6 : 1));
      this.hp = this.maxHp;
      const ease = G.game.area <= 2 ? 0.7 : G.game.area <= 4 ? 0.82 : G.game.area <= 7 ? 0.92 : 1;
      this.dmg = ease * def.dmg * (1 + 0.04 * L) * (this.elite ? 1.35 : 1) * (this.eliteMod && this.eliteMod.id === 'rage' ? 1.4 : 1);
      this.speed = def.speed * (this.elite ? 1.08 : 1) * (this.eliteMod && this.eliteMod.id === 'fast' ? 1.35 : 1) * (opts.speedMul || 1);
      let sh = def.shield;
      if (this.elite) sh += 0.35;
      if (this.eliteMod && this.eliteMod.id === 'armored') sh += 0.6;
      this.maxShield = Math.round(this.maxHp * sh); this.shield = this.maxShield;
      this.pos = pos.clone(); this.vel = V(); this.yaw = Math.random() * 6.28;
      this.model = E.buildModel(def, { scale: (this.elite ? 1.15 : 1) * (opts.scale || 1) });
      this.radius = this.model.r; this.height = this.model.h;
      this.big = def.big; this.flyer = def.flyer;
      this.model.group.position.copy(this.pos);
      G.scene.add(this.model.group);
      this.state = 'spawn'; this.stateT = 0.9; this.spawnT = 0.9;
      this.atkCd = U.rand(0.8, 2.0); this.atk = 0; this.wind = 0;
      this.flinch = 0; this.walk = 0; this.mv = 0;
      this.st = {};
      this.alive = true; this.dying = false;
      this.flankAng = U.rand(-1.2, 1.2);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1; this.strafeT = U.rand(1, 3);
      this.losT = Math.random() * 0.3; this.hasLOS = false;
      this.aware = true;
      this.bloodColor = PLANCOL[def.plan].blood;
      this.centerRef = V();
      this.grounded = true;
      this.alt = this.flyer ? U.rand(2.5, 4.5) : 0;
      this.revived = false;
      this.noReward = !!opts.noReward;
      this.burrowed = def.plan === 'worm';
      this.cloaked = def.cloak;
      this.split = opts.noSplit ? false : def.split;
      this.dodgeCd = 0;
      this.lastHitT = -10;
      this.hitW = this.model.hits;
      if (def.cloak) for (const m of this.model.M.all) m.transparent = true;
      // born with an element: the body glows with it
      if (def.auFix && G.Elem) { const c = new THREE.Color(G.Elem.BY[def.auFix].hex).multiplyScalar(0.35); for (const m of this.model.M.all) if (m.emissive) m.emissive.add(c); }
      if (this.elite) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(this.radius * 1.1, this.radius * 1.35, 32), new THREE.MeshBasicMaterial({ color: 0xffc040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; this.model.group.add(ring); this.ring = ring;
        for (const m of this.model.M.all) if (m.emissive && m !== this.model.M.eye) { m.emissive.add(new THREE.Color(0x2a1a00)); }
      }
      if (def.aura) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 3.5, 40), new THREE.MeshBasicMaterial({ color: 0x8a0a2a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; this.model.group.add(ring); this.auraRing = ring;
      }
      // spawn effect
      G.fx.ring(this.pos, this.radius * 2.2, 0x9a2a1a, 0.8);
      G.fx.smoke(this.pos.clone().setY(this.pos.y + 0.3), 10, 1.2, 0x1a1012, 1.2, 1.2);
      G.save.mark('enemies', def.id);
    }
    centerPos() { return this._hitInit ? this.centerRef.clone() : V(this.pos.x, this.pos.y + this.height * 0.55, this.pos.z); }
    knockback(dir, f) {
      if (this.def.plan === 'golem' || this.boss) f *= 0.3;
      else if (this.big) f *= 0.5;
      this.vel.x += dir.x * f; this.vel.z += dir.z * f;
      if (!this.flyer) this.vel.y = Math.max(this.vel.y, Math.min(4, f * 0.25));
      this.kbT = 0.5; // (thrown by your blow: for a moment it may go over an edge into the void, see physics)
    }
    die(info) {
      if (!this.alive) return false;
      const cleared = !!(info && info.src === 'clear');
      // an elemental core bursts: its element on every foe within 5 m
      if (this.def.coreBurst && !cleared && G.Elem) { for (const o of E.inRadius(this.pos, 5)) if (o !== this) G.Elem.give(o, this.auFix); if (G.fx.ring) G.fx.ring(this.pos.clone(), 5, G.Elem.BY[this.auFix].hex, 0.5); }
      // bone variant revives once
      if (this.def.revive && !this.revived && !cleared && !(info && info.src === 'explosion')) {
        this.revived = true;
        this.hp = 1; this.state = 'revive'; this.stateT = 3.5; this.dyingVisual = true;
        G.sfx.monster(this.pos, 'groan', this.def.pitch, 0.8);
        G.ui.feed('☠ 屍骨は再び立ち上がる…');
        return false;
      }
      if (this.mut && !cleared && !G.Depth.onDie(this, info)) return false;
      this.alive = false; this.dying = true; this.deathT = 0;
      this.state = 'dead';
      // the body stays and can be searched (not for wiped-out leftovers, guardians or bodies that leave nothing)
      if (!cleared && !this.noReward && !this.custom && !this.boss && !this.noLoot && G.Inv) G.Inv.addCorpse(this);
      if (this.mut && !cleared) G.Depth.onDeath(this);
      G.sfx.monsterDie(this.pos, this.def.sound, this.def.pitch);
      G.fx.blood(this.centerPos(), null, this.bloodColor, 18);
      if (this.eliteMod && this.eliteMod.id === 'bomb' && !cleared) { setTimeout(() => C.explode(this.centerPos(), 4.5, this.dmg * 1.5, { enemy: true, src: 'explosion' }), 400); G.fx.telegraph(this.pos, 4.5, 0.4, 0xff6020); }
      if (this.def.plan === 'mushroom' && !cleared) { C.zone(this.pos.clone(), 3.5, 5, 'acid', this.dmg * 0.6, { enemy: true }); G.fx.smoke(this.centerPos(), 14, 1.5, 0x6a8a2a, 0.5, 1.5); }
      if (this.split && !cleared) {
        for (let i = 0; i < 2; i++) {
          const p = this.pos.clone().add(V(U.rand(-0.8, 0.8), 0.2, U.rand(-0.8, 0.8)));
          const e = E.spawn(this.def, this.level, p, { scale: 0.55, hpMul: 0.3, noSplit: true, noReward: false });
          e.state = 'chase'; e.stateT = 0; e.vel.set(U.rand(-4, 4), 5, U.rand(-4, 4));
          G.game.onChildSpawn(this, e);
        }
      }
      if (this.ring) this.ring.visible = false;
      if (this.auraRing) this.auraRing.visible = false;
      if (this.bar) { this.bar.el.style.display = 'none'; this.bar.used = false; this.bar = null; }
      return true;
    }
    // ---------------- per-frame ----------------
    update(dt) {
      if (this.dying) return this.updateDeath(dt);
      const def = this.def;
      C.updateStatus(this, dt);
      if (!this.alive) return;
      const sdt = dt * G.game.enemyTimeScale;
      if (this.hasteT > 0) this.hasteT -= sdt;
      if (this.mut) G.Depth.tickEnemy(this, sdt);
      this.flinch = Math.max(0, this.flinch - sdt * 3);
      this.atkCd -= sdt; this.dodgeCd -= sdt; this.stateT -= sdt;

      // spawn rise
      if (this.state === 'spawn') {
        const k = 1 - Math.max(0, this.stateT) / this.spawnT;
        this.model.inner.position.y = (k - 1) * this.height * (this.flyer ? 0 : 1);
        this.model.group.scale.setScalar(this.flyer ? k : 1);
        if (this.stateT <= 0) { this.state = 'chase'; this.model.inner.position.y = 0; this.model.group.scale.setScalar(1); if (Math.random() < 0.6) G.sfx.monster(this.pos, def.sound, def.pitch, 0.7); }
        this.animate(dt);
        this.updateHits();
        return;
      }
      if (this.state === 'undying') {
        G.Depth.undyingTick(this, sdt);
        this.physics(sdt, 0, 0, 0);
        this.updateHits();
        return;
      }
      if (this.state === 'revive') {
        this.model.inner.rotation.z = Math.min(1.4, this.model.inner.rotation.z + dt * 4);
        if (this.stateT <= 0) { this.hp = this.maxHp * 0.45; this.state = 'chase'; this.model.inner.rotation.z = 0; this.dyingVisual = false; G.fx.smoke(this.pos, 8, 1, 0x3a5a4a, 1, 1); G.sfx.monster(this.pos, 'roar', def.pitch * 1.3, 0.6); }
        this.physics(sdt, 0, 0, 0);
        this.updateHits();
        return;
      }
      // perception
      this.losT -= dt; if (this.repoT > 0) this.repoT -= dt;
      const tgt = this.target();
      const toT = tgt.pos.clone().sub(this.pos);
      const distH = Math.hypot(toT.x, toT.z);
      if (this.losT <= 0) { this.losT = 0.2 + Math.random() * 0.1; this.hasLOS = G.world.los(V(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z), tgt.eye); }
      const blind = this.blindT > 0 || tgt.invisible; if (this.blindT > 0) this.blindT -= dt;
      const sm = C.speedMul(this);
      // status: feared, stunned
      let mx = 0, mz = 0, speed = this.speed * sm;
      const st = this.st;
      if (st.stun > 0 || st.frozen > 0 || st.root > 0) { this.wind = 0; if (this.tele) { G.fx.endTelegraph(this.tele); this.tele = null; } if (this.attackState && st.stun > 0) { this.attackState = null; this.atk = 0; } }
      else if (st.fear > 0) { const l = distH || 1; mx = -toT.x / l; mz = -toT.z / l; speed *= 1.1; this.attackState = null; this.wind = 0; }
      else if (this.attackState) { const r = this.updateAttack(sdt, tgt, toT, distH); if (r) { mx = r.x; mz = r.z; speed = r.speed ?? speed; } }
      else if (blind) { this.wanderT = (this.wanderT || 0) - dt; if (this.wanderT <= 0) { this.wanderT = 2; this.wanderA = Math.random() * 6.28; } mx = Math.cos(this.wanderA); mz = Math.sin(this.wanderA); speed *= 0.4; }
      else {
        const mv = this.decideMove(tgt, toT, distH, sdt);
        mx = mv.x; mz = mv.z; if (mv.speed !== undefined) speed = mv.speed * sm;
        this.tryAttack(tgt, toT, distH);
      }
      // dodge when aimed at
      if ((def.dodge) && this.dodgeCd <= 0 && !this.attackState && st.stun <= 0 && this.hasLOS && distH < 30) {
        const f = P.forward(); const to = this.centerPos().sub(G.camera.position).normalize();
        if (f.dot(to) > 0.995 && Math.random() < 0.5) {
          this.dodgeCd = 2.2;
          const side = V(-to.z, 0, to.x).multiplyScalar(Math.random() < 0.5 ? -1 : 1);
          if (def.blink || def.variant === 'shadow') this.blink(side, 5);
          else { this.vel.x += side.x * 10; this.vel.z += side.z * 10; G.sfx.whoosh(0.2, 0.3); }
        }
      }
      // aura damage (abyss)
      if (def.aura && distH < 3.5 && Math.abs(toT.y) < 2.5 && tgt.isPlayer) { this.auraT = (this.auraT || 0) - dt; if (this.auraT <= 0) { this.auraT = 1; C.damagePlayer(this.dmg * 0.25, { src: 'aoe', attacker: this, pos: this.pos }); } }
      // face movement or target
      const faceT = this.attackState || distH < 12 || def.ai === 'ranged';
      const wantYaw = faceT && !(st.fear > 0) ? Math.atan2(toT.x, toT.z) : (mx || mz) ? Math.atan2(mx, mz) : this.yaw;
      if (!(st.stun > 0 || st.frozen > 0) && !(this.attackState && this.attackState.lockYaw)) this.yaw += U.wrapAngle(wantYaw - this.yaw) * Math.min(1, dt * (this.big ? 4 : 8));
      this.physics(sdt, mx, mz, speed);
      // anti-stuck: wanted to move for a while but barely did -> sidestep / hop
      this._stT = (this._stT || 0) + dt;
      if (this._stT > 1.5) {
        // (no foe is ever moved to you: an area stays clearable because none can get where you cannot reach it, see E.walkOk / E.airOk)
        const bashing = this.bashAt && G.game.time - this.bashAt < 1.2; // battering a cell gate is not being stuck
        if (!bashing && this._stP && this.mv > 0.5 && !this.attackState && this._stP.distanceTo(this.pos) < 0.4 && distH > 4) {
          const a = Math.random() * Math.PI * 2; this.vel.x += Math.cos(a) * 6; this.vel.z += Math.sin(a) * 6;
          if (!this.flyer && this.grounded) this.vel.y = 5;
        }
        this._stT = 0; this._stP = (this._stP || V()).copy(this.pos);
      }
      this.animate(dt);
      this.updateHits();
    }
    target() {
      const d = C.getDecoy();
      // 不屈の城塞 draws every foe within 15 m to you (over a decoy or the mercenary)
      const taunted = P.temps && P.temps.has('ult_bastion') && !P.dead && this.pos.distanceTo(P.pos) < 15;
      if (d && !taunted && d.pos.distanceTo(this.pos) < 40) return { pos: d.pos, eye: V(d.pos.x, d.pos.y + 1.4, d.pos.z), vel: V(), invisible: false, isPlayer: false, decoy: d };
      // the mercenary draws aggro like you do: every foe goes for whichever of you is nearer
      // (a little hysteresis so it doesn't flip back and forth between two equally distant targets)
      const mc = G.Rooms2 && G.Rooms2.mercAlly;
      if (mc && !taunted && !mc.dead && mc.targetable && mc.targetable() && !this.stalker) {
        const dm = mc.ent.pos.distanceTo(this.pos), dp = this.pos.distanceTo(P.pos);
        const pInvis = P.stats.invis > 0 || P.smokeT > 0;
        const wantM = (mc.taunt && dm < mc.taunt) || (pInvis ? dm < 30 : this.aggroM ? dm < dp * 1.2 : dm < dp * 0.85); // a shield bearer pulls every foe within its taunt range
        this.aggroM = wantM;
        if (wantM) return { pos: mc.ent.pos, eye: V(mc.ent.pos.x, mc.ent.pos.y + 1.3, mc.ent.pos.z), vel: V(), invisible: false, isPlayer: false, ally: mc };
      } else this.aggroM = false;
      return { pos: P.pos, eye: P.chestPos(), vel: P.vel, invisible: P.stats.invis > 0 || P.smokeT > 0, isPlayer: true };
    }
    // prison bars / a shut gate between this walker and its target (looked up a few times a second)
    barredFrom(tgt) {
      const w = G.world;
      if (this.flyer || !w.barsBetween || (!w.nbk && !(w.doors && w.doors.length))) return false;
      if (!this._barC || G.game.time - this._barC.t > 0.15) this._barC = { t: G.game.time, v: w.barsBetween(this.pos, tgt.pos) };
      return this._barC.v;
    }
    decideMove(tgt, toT, distH, dt) {
      const def = this.def, ai = def.ai, w = G.world;
      const out = { x: 0, z: 0 };
      const flow = (o) => {
        // strata fields: flyers follow the air routes (open air across the chasm, between the slabs of the storeys)
        if (this.flyer && w.navLayers > 1) {
          const band = this._band || (this._band = { lo: 0, hi: 0 });
          if (!this.hasLOS && w.airDir(this.pos.x, this.pos.z, this.pos.y, o)) { band.lo = o.lo; band.hi = o.hi; this.airOn = true; this._airLast = { x: o.x, z: o.z, t: G.game.time };
            // the next stretch of air is lower / higher than where we hover (a gap in a slab, then a storey under it): first change height in the open, don't fly into the slab edge
            if (this.pos.y > o.hi + 0.2 || this.pos.y < o.lo - 0.6) { o.x *= 0.12; o.z *= 0.12; }
            return o; }
          // no route known for this cell right now (the field is only refreshed a few times a second): keep the last heading instead of turning round
          if (!this.hasLOS && this._airLast && G.game.time - this._airLast.t < 0.7) { o.x = this._airLast.x * 0.5; o.z = this._airLast.z * 0.5; this.airOn = !!w.airBand(this.pos.x, this.pos.z, this.pos.y, band); return o; }
          const l = distH || 1; o.x = toT.x / l; o.z = toT.z / l; this.airOn = !!w.airBand(this.pos.x, this.pos.z, this.pos.y, band);
          return o;
        }
        // flyers go straight while they can see you; otherwise they follow the ground flow field around walls
        if (this.flyer && (this.hasLOS || !w.flowDir(this.pos.x, this.pos.z, o, this.pos.y))) { const l = distH || 1; o.x = toT.x / l; o.z = toT.z / l; return o; }
        if (this.flyer) return o;
        // on the rim of a slab the grid doesn't hold: off it first, and on the way it began to fall (the first moment off the rim, the route
        // of the surface below would turn it straight back onto it)
        const rim = (this.grounded || G.game.time - (this._rimT || -9) < 0.4) && w.rimDir(this.pos.x, this.pos.z, this.pos.y, o);
        if (rim && this.grounded) this._rimT = G.game.time;
        const f = rim || w.flowDir(this.pos.x, this.pos.z, o, this.pos.y) || w.blockedDir(this.pos.x, this.pos.z, this.pos.y, o);
        if (!f || (this.hasLOS && distH < 7 && Math.abs(toT.y) < 2.5 && !this.barredFrom(tgt))) { const l = distH || 1; o.x = toT.x / l; o.z = toT.z / l; } // in sight and on the same level: straight at you (unless prison bars are in the way: then round through the doorway)
        return o;
      };
      if (ai === 'flee') {
        // run away along the flow field gradient (maximise distance)
        const i = w.navIdx(this.pos.x, this.pos.z, this.pos.y);
        if (i >= 0 && w.ndist[i] < Infinity) {
          const W = w.Wn, ic = i % w.N; const ix = ic % W, iz = (ic / W) | 0; let best = w.ndist[i], bx = 0, bz = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { if (ix + dx < 0 || iz + dz < 0 || ix + dx >= W || iz + dz >= w.Dn) continue; const a = w.land(i, (iz + dz) * W + ix + dx); if (a >= 0 && !w.nb[a] && w.ndist[a] < Infinity && w.ndist[a] > best) { best = w.ndist[a]; bx = dx; bz = dz; } }
          const l = Math.hypot(bx, bz) || 1; out.x = bx / l; out.z = bz / l;
        }
        if (Math.random() < 0.02) G.sfx.monster(this.pos, 'chitter', 1.3, 0.5);
        return out;
      }
      if (ai === 'burrow') return this.burrowMove(tgt, toT, distH, dt, out);
      if (ai === 'ranged' || ai === 'support') {
        const pref = Math.min(def.range * 0.75, 18), near = pref * 0.5;
        if (!this.hasLOS || distH > pref) return flow(out);
        if (distH < near) { const l = distH || 1; out.x = -toT.x / l; out.z = -toT.z / l; return out; }
        this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = U.rand(1.2, 3); this.strafeDir *= -1; }
        const l = distH || 1; out.x = -toT.z / l * this.strafeDir; out.z = toT.x / l * this.strafeDir; out.speed = this.speed * 0.6;
        return out;
      }
      if (ai === 'flyer') {
        if (!this.hasLOS || this.repoT > 0) return flow(out); // (going round to a better place after a dive that could not reach you)
        const l = distH || 1;
        if (distH > 6) { out.x = toT.x / l; out.z = toT.z / l; }
        else { out.x = -toT.z / l; out.z = toT.x / l; out.speed = this.speed * 0.6; }
        return out;
      }
      // melee / flank
      if (this.cloaked && distH > 10) this.setCloak(true);
      if (ai === 'flank' && distH < 14 && distH > 3 && this.hasLOS && !this.barredFrom(tgt)) {
        const ang = Math.atan2(-toT.x, -toT.z) + this.flankAng;
        const gx = tgt.pos.x + Math.sin(ang) * 3.5, gz = tgt.pos.z + Math.cos(ang) * 3.5;
        const dx = gx - this.pos.x, dz = gz - this.pos.z, l = Math.hypot(dx, dz) || 1;
        out.x = dx / l; out.z = dz / l;
        return out;
      }
      if (distH < def.range * 0.7 && (this._deep ? toT.y < 0.3 : Math.abs(toT.y) < 1.2) && this.hasLOS && !this.barredFrom(tgt)) return out; // (close, but well above or below it: it keeps going the way up / down, the nav's; in deep water with you above it, it climbs out first)
      return flow(out);
    }
    tryAttack(tgt, toT, distH) {
      const def = this.def;
      if (this.atkCd > 0 || this.state === 'spawn') return;
      const dy = toT.y;
      const atkRange = def.range * (def.attack === 'slam' || def.attack === 'slash' ? 1 : 1);
      const k = def.attack;
      const begin = (wind, data) => { this.attackState = Object.assign({ kind: k, t: 0, wind }, data || {}); this.wind = 0; };
      if (!this.hasLOS && !['burrow', 'support'].includes(k)) return;
      if (this._deep && dy > 0.3 && ['lunge', 'pounce', 'slash', 'slam', 'bounce', 'dashslash', 'charge', 'boulder'].includes(k)) return; // (in deep water with you above it: no blow from the water, it climbs out first)
      if (['lunge', 'pounce', 'slash', 'slam', 'bounce', 'dashslash', 'charge'].includes(k) && this.barredFrom(tgt)) return; // no melee through prison bars
      switch (k) {
        case 'lunge': if (distH < 6.5 && Math.abs(dy) < 2.5) begin(0.35); break;
        case 'pounce': if (distH < def.range && Math.abs(dy) < 3) begin(0.4); else if (distH < 18 && Math.random() < 0.02) begin(0.4, { web: true }); break;
        case 'slash': if (distH < atkRange + this.radius && Math.abs(dy) < 2) begin(0.45); break;
        case 'slam': if (distH < atkRange + this.radius * 0.5 && Math.abs(dy) < 2.5) begin(0.9); break;
        case 'bounce': if (distH < 6 && Math.abs(dy) < 2.5) begin(0.45); break;
        case 'swoop': if (distH < 13 && !(this.repoT > 0)) begin(0.35); break;
        case 'throw': if (distH < def.range) begin(0.55); break;
        case 'orb': if (distH < def.range) begin(0.6); break;
        case 'spore': if (distH < def.range) begin(0.8); break;
        case 'rockthrow': if (distH < def.range) begin(1.0, { lockYaw: false }); break;
        case 'charge': if (distH > 4 && distH < def.range && Math.abs(dy) < 1.5) begin(0.75, { lockYaw: true }); else if (distH < 3) begin(0.4, { bite: true }); break;
        case 'boulder': if (distH > 7 && distH < def.range) begin(0.9, { throwing: true }); else if (distH < 4.2 + this.radius * 0.5 && Math.abs(dy) < 2.5) begin(0.9, { slam: true }); break;
        case 'dashslash': if (distH < def.range) { this.setCloak(false); begin(0.35); } break;
        case 'support': begin(0.8); break;
      }
      if (this.attackState) G.sfx.attackWind(this.pos, this.big);
    }
    // returns movement override {x,z,speed} during attacks
    updateAttack(dt, tgt, toT, distH) {
      const A = this.attackState, def = this.def;
      A.t += dt;
      const l = distH || 1;
      const dirx = toT.x / l, dirz = toT.z / l;
      const end = (cd) => { this.attackState = null; this.atk = 0; this.wind = 0; this.atkCd = (cd ?? def.cd) * (this.eliteMod && this.eliteMod.id === 'rage' ? 0.7 : 1) * (P.has('pact_fury') ? 0.8 : 1) * U.rand(0.85, 1.2); if (this.tele) { G.fx.endTelegraph(this.tele); this.tele = null; } };
      const hitPlayer = (dmg, src) => { if (tgt.decoy) { tgt.decoy.t -= 1; return; } if (tgt.ally) { tgt.ally.hurt(dmg); return; } const dealtP = C.damagePlayer(dmg, { src: src || 'melee', attacker: this, pos: this.pos.clone(), elem: def.elem }); if (this.mut && dealtP > 0) G.Depth.onPlayerHit(this, dealtP); if (this.eliteMod && this.eliteMod.id === 'vamp') this.hp = Math.min(this.maxHp, this.hp + dmg * 0.35); if (P.temps.has('thornarmor') && (src || 'melee') === 'melee') C.damageEnemy(this, dmg * 1.2 + C.scale(8), { src: 'skill', proc: true }); };
      const inWind = A.t < A.wind;
      this.wind = inWind ? A.t / A.wind : 0;
      switch (A.kind) {
        case 'lunge': case 'pounce': {
          if (A.web) {
            if (!inWind && !A.done) { A.done = true; this.spit('web', tgt, 22, 0.6); end(2.5); }
            return { x: 0, z: 0 };
          }
          if (inWind) return { x: 0, z: 0 };
          if (!A.leapt) { A.leapt = true; const sp = A.kind === 'pounce' ? 13 : 12; const lead = Math.min(1, distH / sp); this.vel.x = (toT.x + tgt.vel.x * lead * 0.5) / Math.max(l, 1) * sp; this.vel.z = (toT.z + tgt.vel.z * lead * 0.5) / Math.max(l, 1) * sp; this.vel.y = 5.5; this.grounded = false; G.sfx.monster(this.pos, def.sound, def.pitch, 0.8); }
          this.atk = Math.min(1, (A.t - A.wind) * 4);
          if (!A.hit && this.centerPos().distanceTo(tgt.eye) < this.radius + 1.0) { A.hit = true; hitPlayer(this.dmg); G.vfx.slash(this.centerPos(), V(Math.sin(this.yaw), 0, Math.cos(this.yaw)), this.radius + 1.0, 1.7, 0xff7060, { tilt: 1.0, dur: 0.1, r0: this.radius * 0.5 }); }
          if (A.t - A.wind > 0.25 && this.grounded || A.t > 2) end();
          return { x: 0, z: 0, speed: 0 };
        }
        case 'slash': {
          if (inWind) return { x: dirx, z: dirz, speed: this.speed * 0.2 };
          this.atk = Math.min(1, (A.t - A.wind) / 0.18);
          if (!A.hit && A.t - A.wind > 0.1) { A.hit = true; const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); G.vfx.slash(this.pos.clone().setY(this.pos.y + this.height * 0.5), V(fx, 0, fz), def.range + this.radius + 0.4, 2 * Math.acos(0.3), this.elite ? 0xffb080 : 0xffe8d8, { tilt: (Math.random() - 0.5) * 0.8, dur: 0.12, r0: this.radius * 0.6, cw: Math.random() < 0.5 }); if (distH < def.range + this.radius + 0.4 && (fx * dirx + fz * dirz) > 0.3 && Math.abs(toT.y) < 2) { hitPlayer(this.dmg); } G.sfx.melee(false); }
          if (A.t - A.wind > 0.45) end();
          return { x: 0, z: 0 };
        }
        case 'slam': {
          if (!this.tele && inWind) { const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); A.c = V(this.pos.x + fx * this.radius * 1.2, this.pos.y, this.pos.z + fz * this.radius * 1.2); this.tele = G.fx.telegraph(A.c, def.range, A.wind); }
          if (inWind) return { x: 0, z: 0 };
          this.atk = Math.min(1, (A.t - A.wind) / 0.15);
          if (!A.hit) {
            A.hit = true; this.tele = null;
            G.vfx.nova(A.c, def.range, 0.12, { style: 'shock', dome: false }); G.fx.debris(A.c.clone().add(V(0, 0.3, 0)), G.world.mats.rock, 6, 0.2, 6); G.fx.dust(A.c, V(0, 1, 0), 0x8a7a60, 14); G.fx.decal(A.c.clone().setY(A.c.y + 0.02), V(0, 1, 0), 'crack', def.range * 1.4, true);
            G.sfx.explosion(A.c, 0.5); P.addShake(Math.max(0, 0.6 - P.pos.distanceTo(A.c) * 0.04));
            const d = Math.hypot(tgt.pos.x - A.c.x, tgt.pos.z - A.c.z);
            if (d < def.range && tgt.pos.y - A.c.y < 0.9 && tgt.pos.y - A.c.y > -1.5) hitPlayer(this.dmg, 'aoe');
          }
          if (A.t - A.wind > 0.8) end();
          return { x: 0, z: 0 };
        }
        case 'bounce': {
          if (inWind) return { x: 0, z: 0 };
          if (!A.leapt) { A.leapt = true; const t = 0.7; this.vel.x = toT.x / t; this.vel.z = toT.z / t; this.vel.y = 7; this.grounded = false; G.sfx.monster(this.pos, 'slosh', def.pitch, 0.8); }
          this.atk = 0.5;
          if (A.t - A.wind > 0.2 && this.grounded && !A.hit) { A.hit = true; G.fx.ring(this.pos, 2.4 + this.radius, 0x6aa040, 0.35); G.vfx.area(this.pos.clone(), 2.4 + this.radius, 'acid', 0.4); G.sfx.monster(this.pos, 'slosh', def.pitch * 0.8, 1); if (Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) < 2.4 + this.radius && Math.abs(tgt.pos.y - this.pos.y) < 1.5) hitPlayer(this.dmg, 'aoe'); }
          if (A.hit || A.t > 2.5) end();
          return { x: 0, z: 0, speed: 0 };
        }
        case 'swoop': {
          // the dive: at where you will be when it gets there (your speed taken into it), only with a clear way for its body (else it
          // breaks off and flies round to you instead of diving into a wall or at the air where you stood); it bends after you a little on
          // the way, a wall stops it, and two misses in a row send it round to a better place first (no diving at nothing again and again)
          if (inWind) { this.alt += dt * 2; return { x: -dirx, z: -dirz, speed: 3 }; }
          const SW = E.SWOOP, c = this.centerPos();
          if (!A.dir) {
            const d0 = c.distanceTo(tgt.eye), aim = tgt.eye.clone().addScaledVector(tgt.vel || V(), Math.min(0.8, d0 / SW.speed) * SW.lead);
            if (aim.distanceTo(c) > SW.speed * SW.dur * 0.95 || !this.flyClear(c, aim)) { end(SW.retry); this.repoT = SW.repo; return { x: 0, z: 0, speed: 0 }; }
            A.dir = aim.sub(c).normalize(); G.sfx.monster(this.pos, 'screech', def.pitch, 0.8);
          } else if (!A.hit) {
            const want = tgt.eye.clone().sub(c); if (want.dot(A.dir) > 0) A.dir.lerp(want.normalize(), Math.min(1, SW.turn * dt)).normalize();
          }
          this.atk = 1;
          this.pos.addScaledVector(A.dir, SW.speed * dt);
          if (!A.hit && this.centerPos().distanceTo(tgt.eye) < 1.3) { A.hit = true; hitPlayer(this.dmg); }
          const wall = this.hitWallFlag && A.t - A.wind > 0.08;
          if (A.t - A.wind > SW.dur || A.hit && A.t - A.wind > 0.3 || (A.groundT || 0) > 0.15 || wall) {
            end(); this.alt = U.rand(3, 5);
            if (A.hit) this.swoopMiss = 0; else if ((this.swoopMiss = (this.swoopMiss || 0) + 1) >= 2) { this.swoopMiss = 0; this.repoT = SW.repo * 1.6; } else if (wall) this.repoT = SW.repo;
          }
          return { x: 0, z: 0, speed: 0, fly: true };
        }
        case 'throw': case 'orb': case 'spore': {
          if (inWind) return { x: 0, z: 0 };
          if (!A.done) {
            A.done = true; this.atk = 1;
            if (A.kind === 'throw') this.spit(def.elem === 'frost' ? 'frostorb' : 'fireball', tgt, 20, 0.5, { explode: 1.6 });
            else if (A.kind === 'orb') this.spit(def.elem === 'frost' ? 'frostorb' : 'orb', tgt, 10, 0, { homing: 1.6, life: 5 });
            else this.spit('spore', tgt, 13, 0.7, { zone: true });
          }
          if (A.t - A.wind > 0.3) end();
          return { x: 0, z: 0 };
        }
        case 'rockthrow': {
          // it lifts a stone (shown in its hand, growing), cocks the arm back and throws it: a plain arcing shot you can sidestep
          if (inWind) {
            if (Math.random() < dt * 14) { const h = this.model.J.rock.getWorldPosition(V()); G.fx.dust(h, V(0, -1, 0), 0x8a8070, 1); }
            return { x: 0, z: 0 };
          }
          if (!A.done) {
            A.done = true; this.atk = 1;
            this.spit('rock', tgt, 21, 0.45, { dmgMul: 1.2, life: 4, from: this.model.J.rock.getWorldPosition(V()) });
          }
          if (A.t - A.wind > 0.45) end();
          return { x: 0, z: 0 };
        }
        case 'charge': {
          if (A.bite) { if (inWind) return { x: 0, z: 0 }; if (!A.hit) { A.hit = true; this.atk = 1; if (distH < this.radius + 1.5 && Math.abs(toT.y) < 2) hitPlayer(this.dmg * 0.7); } if (A.t - A.wind > 0.3) end(1.2); return { x: 0, z: 0 }; }
          if (inWind) { if (!A.dir) { this.yaw = Math.atan2(toT.x, toT.z); } if (Math.random() < 0.3) G.fx.dust(this.pos, V(0, 1, 0), 0x7a6a50, 1); A.dir = V(dirx, 0, dirz); this.yaw = Math.atan2(dirx, dirz); return { x: 0, z: 0 }; }
          if (!A.roar) { A.roar = true; G.sfx.monster(this.pos, 'roar', def.pitch * 1.2, 0.8); }
          this.atk = 0.5;
          if (!A.hit && distH < this.radius + 1.2 && Math.abs(toT.y) < 1.8) { A.hit = true; hitPlayer(this.dmg * 1.3); if (tgt.isPlayer) { P.vel.x += A.dir.x * 12; P.vel.z += A.dir.z * 12; P.vel.y = 5; } }
          if (this.hitWallFlag && A.t - A.wind > 0.15) { G.sfx.explosion(this.pos, 0.3); P.addShake(0.2); this.st.stun = 1.8; G.fx.dust(this.centerPos(), null, 0x8a7a60, 8); end(2.5); return null; }
          if (A.t - A.wind > 1.4) end();
          return { x: A.dir.x, z: A.dir.z, speed: 17 * C.speedMul(this) };
        }
        case 'boulder': {
          if (A.slam) { A.kind = 'slam'; return null; }
          if (inWind) return { x: 0, z: 0 };
          if (!A.done) { A.done = true; this.atk = 1; this.spit('boulder', tgt, 20, 0.6, { explode: 2.6, dmgMul: 1.2 }); }
          if (A.t - A.wind > 0.5) end();
          return { x: 0, z: 0 };
        }
        case 'dashslash': {
          if (inWind) return { x: 0, z: 0 };
          if (!A.dir) { A.dir = V(dirx, 0, dirz); G.sfx.monster(this.pos, 'hiss', def.pitch, 0.9); G.sfx.whoosh(0.25, 0.6); }
          this.atk = Math.min(1, (A.t - A.wind) * 4);
          if (!A.hit && distH < this.radius + 1.6) { A.hit = true; hitPlayer(this.dmg); G.vfx.slash(this.centerPos(), A.dir, this.radius + 1.6, 2.2, 0xd0b0ff, { tilt: -0.6, dur: 0.1 }); }
          if (A.hit || A.t - A.wind > 0.5) end();
          return { x: A.dir.x, z: A.dir.z, speed: 19 };
        }
        case 'support': {
          if (inWind) return { x: 0, z: 0 };
          if (!A.done) {
            A.done = true; this.atk = 1;
            let best = null, bk = 1;
            for (const o of E.list) { if (o === this || !o.alive || o.boss || o.pos.distanceTo(this.pos) > 15) continue; const k = o.hp / o.maxHp - (o.shield > 0 ? 0.3 : 0); if (k < bk) { bk = k; best = o; } }
            if (best) {
              G.vfx.tube(this.centerPos(), best.centerPos(), 0.22, 0x7ac8ff, 0.5, { alpha: 0.7, speed: 6 });
              if (best.hp < best.maxHp * 0.95) { best.hp = Math.min(best.maxHp, best.hp + best.maxHp * 0.1); G.fx.dmgNum(best.centerPos(), '+回復', 'heal'); }
              else { best.maxShield = Math.max(best.maxShield, best.maxHp * 0.2); best.shield = Math.min(best.maxShield, best.shield + best.maxHp * 0.15); G.fx.bubble(best.centerPos(), best.radius * 1.6, 0xbfe2ff); }
              G.sfx.magic(this.pos);
            } else if (this.hasLOS) this.spit('orb', tgt, 10, 0, { homing: 1.4, life: 5 });
          }
          if (A.t - A.wind > 0.4) end();
          return { x: 0, z: 0 };
        }
      }
      end();
      return null;
    }
    spit(kind, tgt, speed, arc, o) {
      o = o || {};
      const from = o.from || this.centerPos(); if (!o.from) from.y += this.height * 0.15;
      const to = tgt.eye.clone();
      const dist = from.distanceTo(to);
      const t = dist / speed;
      to.addScaledVector(tgt.vel, t * 0.6 * Math.random());
      const grav = arc ? 9 * arc : 0;
      const vel = to.clone().sub(from).divideScalar(t); vel.y += 0.5 * grav * t;
      const pr = { kind, pos: from, vel, grav, owner: 'enemy', dmg: this.dmg * (o.dmgMul || 1), radius: kind === 'boulder' ? 0.6 : kind === 'rock' ? 0.26 : 0.25, life: o.life || 6, attacker: this, elem: this.def.elem || (kind === 'web' ? 'web' : kind === 'spore' ? 'poison' : null) };
      if (o.explode) { pr.explode = o.explode; pr.info = { elem: pr.elem }; }
      if (o.homing) pr.homing = o.homing;
      if (kind === 'rock') { // shatters on whatever it hits
        const crumble = (p) => { G.fx.debris(p, G.world.mats.rock, 7, 0.07, 6); G.fx.dust(p, V(0, 1, 0), 0x8a8070, 5); G.sfx.breakObj(p, 'stone'); };
        pr.onHitPlayer = (q) => crumble(q); pr.onHitWorld = (wh) => crumble(wh.point);
      }
      if (kind === 'web') pr.onHitPlayer = () => { P.st.slow = 3; G.ui.tint('web', 1.5); };
      if (o.zone) pr.onEnd = (p) => { if (p.life > 0 || true) C.zone(V(p.pos.x, G.world.floorBelow(p.pos.x, p.pos.y + 0.5, p.pos.z), p.pos.z), 3, 5, 'acid', this.dmg * 0.6, { enemy: true, elem: 'poison' }); };
      C.spawnProjectile(pr);
      if (kind === 'rock') G.sfx.whoosh(0.22, 0.9); else if (kind === 'fireball' || kind === 'bigfire') G.sfx.fire(from); else if (kind === 'orb' || kind === 'frostorb') G.sfx.magic(from, 'dark'); else G.sfx.spit(from);
    }
    blink(dir, d) {
      const np = this.pos.clone().addScaledVector(dir, d);
      const i = G.world.navIdx(np.x, np.z, this.pos.y);
      if (i < 0 || G.world.nb[i] || G.world.nf[i] === -Infinity || Math.abs(G.world.nf[i] - this.pos.y) > 2.5) return;
      if (this.flyer ? !E.airOk(np.x, np.z) : !E.walkOk(np.x, np.z, this.pos.y)) return; // (a sidestep, never on to a place you cannot reach)
      G.fx.smoke(this.centerPos(), 8, 0.8, 0x1a1020, 0.5, 0.8);
      this.pos.x = np.x; this.pos.z = np.z; if (!this.flyer && !this.def.hover) this.pos.y = G.world.nf[i];
      G.fx.smoke(this.centerPos(), 8, 0.8, 0x1a1020, 0.5, 0.8);
      G.sfx.magic(this.pos, 'dark');
    }
    setCloak(on) {
      if (this.cloakOn === on) return;
      this.cloakOn = on;
      for (const m of this.model.M.all) m.opacity = on ? 0.12 : 1;
      if (!on) G.fx.smoke(this.centerPos(), 6, 0.8, 0x2a3a1a, 0.4, 0.6);
    }
    burrowMove(tgt, toT, distH, dt, out) {
      const l = distH || 1;
      if (this.burrowed) {
        // underground: approach, then telegraph and erupt beneath the target
        this.model.group.visible = false;
        if (Math.random() < dt * 12) G.fx.dust(V(this.pos.x, G.world.navFloor(this.pos.x, this.pos.z, this.pos.y) + 0.05, this.pos.z), V(0, 1, 0), 0x6a5a48, 2);
        this._rumble = (this._rumble || 0) - dt; if (this._rumble <= 0 && distH < 20) { this._rumble = 0.8; G.sfx.monster(this.pos, 'rumble', 1.4, 0.5); }
        if (!this.erupt && distH < 4 && Math.abs(toT.y) < 2.5 && this.atkCd <= 0) { this.erupt = { t: 0, c: tgt.pos.clone() }; this.erupt.c.y = G.world.navFloor(tgt.pos.x, tgt.pos.z, tgt.pos.y); if (!isFinite(this.erupt.c.y)) this.erupt.c.y = tgt.pos.y; this.tele = G.fx.telegraph(this.erupt.c, 2.6, 0.85, 0xb06020); }
        if (this.erupt) {
          this.erupt.t += dt;
          if (this.erupt.t > 0.85) {
            this.pos.x = this.erupt.c.x; this.pos.z = this.erupt.c.z; this.pos.y = this.erupt.c.y;
            this.burrowed = false; this.model.group.visible = true; this.emergeT = 0; this.surfaceT = U.rand(3, 4.5);
            this.vel.y = 9; this.grounded = false;
            G.fx.debris(this.pos, G.world.mats.rock, 10, 0.3, 7); G.fx.dust(this.pos, V(0, 1, 0), 0x7a6a50, 16); G.sfx.explosion(this.pos, 0.6);
            if (Math.hypot(tgt.pos.x - this.pos.x, tgt.pos.z - this.pos.z) < 2.6 && tgt.isPlayer && Math.abs(tgt.pos.y - this.pos.y) < 1.5) { C.damagePlayer(this.dmg * 1.3, { src: 'melee', attacker: this, pos: this.pos.clone(), elem: this.def.elem }); P.vel.y = 7; }
            if (this.tele) { G.fx.endTelegraph(this.tele); this.tele = null; }
            this.erupt = null; this.atkCd = this.def.cd;
          }
          return out;
        }
        const f = G.world.flowDir(this.pos.x, this.pos.z, out, this.pos.y);
        if (!f) { out.x = toT.x / l; out.z = toT.z / l; }
        out.speed = this.speed * 1.4;
        return out;
      }
      this.surfaceT -= dt;
      if (this.surfaceT <= 0) { this.burrowed = true; G.fx.dust(this.pos, V(0, 1, 0), 0x7a6a50, 12); G.sfx.monster(this.pos, 'rumble', 1.2, 0.7); this.atkCd = 1.5; return out; }
      // above ground: chase & bite
      if (distH < this.radius + 2.2 && Math.abs(toT.y) < 2 && this.atkCd <= 0 && !this.vel.y) { this.atkCd = 1.2; this.atk = 1; C.damagePlayer(this.dmg * 0.8, { src: 'melee', attacker: this, pos: this.pos.clone(), elem: this.def.elem }); G.sfx.monster(this.pos, 'snarl', 0.7, 0.8); }
      out.x = toT.x / l; out.z = toT.z / l; out.speed = this.speed * 0.7;
      return out;
    }
    physics(dt, mx, mz, speed) {
      const w = G.world;
      const fly = this.flyer || (this.attackState && this.attackState.kind === 'swoop');
      // knockback decay
      const kd = Math.exp(-6 * dt);
      this.vel.x *= kd; this.vel.z *= kd;
      if (this.kbT > 0) this.kbT -= dt;
      let dx = mx * speed + this.vel.x, dz = mz * speed + this.vel.z;
      // separation
      for (const o of E.list) {
        if (o === this || !o.alive || o.custom) continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z; const d2 = ox * ox + oz * oz;
        const rr = this.radius + o.radius;
        if (d2 < rr * rr && d2 > 0.0001) { const d = Math.sqrt(d2); const push = (rr - d) / rr * 6; dx += ox / d * push; dz += oz / d * push; }
      }
      // keep out of the player's body
      const px = this.pos.x - P.pos.x, pz = this.pos.z - P.pos.z, pd = Math.hypot(px, pz), pr = this.radius + 0.45;
      if (pd < pr && pd > 0.001 && Math.abs(this.pos.y - P.pos.y) < 1.8) { dx += px / pd * (pr - pd) * 10; dz += pz / pd * (pr - pd) * 10; }
      this.mv = U.damp(this.mv, Math.min(1, Math.hypot(mx, mz) * speed / Math.max(1, this.speed)), 8, dt);
      this.walk += Math.hypot(dx, dz) * dt * (3.2 / Math.max(0.6, this.model.scale));
      if (this.burrowed) {
        if (!w.trench && dx && !w.edgeSafe(this.pos, this.pos.x + dx * dt, this.pos.z)) dx = 0; // (never tunnels out under the void)
        if (!w.trench && dz && !w.edgeSafe(this.pos, this.pos.x, this.pos.z + dz * dt)) dz = 0;
        if (dx && E.walkOk(this.pos.x, this.pos.z, this.pos.y) && !E.walkOk(this.pos.x + dx * dt, this.pos.z, this.pos.y)) dx = 0; // (nor comes up where you cannot reach it)
        if (dz && E.walkOk(this.pos.x, this.pos.z, this.pos.y) && !E.walkOk(this.pos.x, this.pos.z + dz * dt, this.pos.y)) dz = 0;
        this.pos.x += dx * dt; this.pos.z += dz * dt; const f = w.navFloor(this.pos.x, this.pos.z, this.pos.y); if (isFinite(f)) this.pos.y = f; this.clampBounds(); return;
      }
      if (fly) {
        // 3D: maintain altitude above floor
        const fl = w.navFloor(this.pos.x, this.pos.z, this.pos.y);
        // pressed against a wall: climb over it
        this.climb = this.hitWallFlag ? Math.min(7, (this.climb || 0) + dt * 6) : Math.max(0, (this.climb || 0) - dt * 1.5);
        let ty = Math.max(isFinite(fl) ? fl : 0, P.pos.y) + (this.def.hover ? 0.2 : this.alt) + this.climb;
        if (this.airOn && w.navLayers > 1) { const b = this._band; ty = U.clamp(P.pos.y + (this.def.hover ? 0.2 : this.alt) + this.climb, b.lo, Math.max(b.lo, b.hi - this.height)); } // stay in the air band we are in: never through a slab
        // a roof, a ceiling, the rock over a tunnel: the underside of whatever is over it caps how high it goes (climbing over a wall or
        // following you up never takes it into them)
        const ceil = this.ceilAbove(Math.max(ty, this.pos.y));
        if (ceil < Infinity) ty = Math.min(ty, ceil - this.height - 0.1);
        const diving = this.attackState && this.attackState.kind === 'swoop' && this.attackState.t >= this.attackState.wind;
        const yWas = this.pos.y;
        if (!diving) this.pos.y = U.damp(this.pos.y, ty, 2.5, dt);
        // sinking, it stops on what it is over. (The walls push a body out sideways from 0.2 over its feet: one that sank that far into the
        // roof it was on was thrown off the roof's side, metres at a time)
        if (!diving && !this.def.hover && this.pos.y < yWas) { const fb = this.floorUnder(yWas); if (fb > -50 && this.pos.y < fb + 0.35) this.pos.y = Math.min(yWas, fb + 0.35); }
        if (ceil < Infinity && this.pos.y + this.height > ceil - 0.05) this.pos.y = ceil - this.height - 0.05;
        // nor up past the top of a roof it is beside (climbing a building's eave): it stays at the height it had
        if (this.pos.y > yWas && this.overRoof(this.pos.x, this.pos.z) && !this.overRoof(this.pos.x, this.pos.z, yWas)) this.pos.y = yWas;
        // the air it may be in (E.airOk): a move that would take it out of it (a chase, a dive, a shove, sliding along a wall) is cut short
        // where it would leave, keeping what slides along the border
        const near = this._apw === w && Math.abs(this._apx - this.pos.x) < 3 && Math.abs(this._apz - this.pos.z) < 3; // (where the last frame left it, in this area: a dive moves it before this; a teleport is not a move)
        const px = near ? this._apx : this.pos.x, pz = near ? this._apz : this.pos.z;
        this.hitWallFlag = this.pushOut(dx * dt, dz * dt, this.pos.y + 0.2, this.pos.y + this.height);
        // ...and (a one-storey field) never on over a roof: the hall under it is yours to walk, the top of it no place for a flyer
        const free = (x, z) => E.airOk(x, z) && !this.overRoof(x, z);
        if (!free(this.pos.x, this.pos.z) && free(px, pz)) {
          if (free(this.pos.x, pz)) this.pos.z = pz; else if (free(px, this.pos.z)) this.pos.x = px; else { this.pos.x = px; this.pos.z = pz; }
          this.vel.x = 0; this.vel.z = 0;
          if (diving) this.hitWallFlag = true; // (a dive that meets the border ends there, as at a wall)
        }
        if (this.hitWallFlag && G.Strata.doors.length && !this.boss) G.Strata.bash(this, dt);
        if (!this.def.hover) {
          const fb = this.floorUnder(near && this._apy !== undefined ? this._apy : this.pos.y);
          if (fb > -50 && this.pos.y < fb + 0.35) {
            this.pos.y = fb + 0.35;
            const A = this.attackState;
            if (diving && A.dir && A.dir.y < 0) { A.dir.y = 0; if (A.dir.lengthSq() > 1e-4) A.dir.normalize(); A.groundT = (A.groundT || 0) + dt; }
          }
        }
        this.clampBounds();
        this._apx = this.pos.x; this._apz = this.pos.z; this._apy = this.pos.y; this._apw = w;
        this.grounded = false;
        return;
      }
      // strata: walkers never step out over the lava trench; one that lands in it anyway is thrown back out, like off a trampoline
      if (w.trench) {
        if (this.tramp) { dx = this.tramp.vx; dz = this.tramp.vz; this.tramp.t -= dt; if (this.tramp.t <= 0 || (this.grounded && this.tramp.t < 0.9)) this.tramp = null; }
        else {
          const r = Math.min(this.radius, 0.6) + 0.15;
          if (dx && !w.walkerSafe(this.pos, this.pos.x + dx * dt + Math.sign(dx) * r, this.pos.z)) { dx = 0; this.vel.x = 0; }
          if (dz && !w.walkerSafe(this.pos, this.pos.x, this.pos.z + dz * dt + Math.sign(dz) * r)) { dz = 0; this.vel.z = 0; }
        }
      }
      // the void (chasms, the gaps between the sky islands): a walker never steps, leaps or is jostled out over an edge on its own;
      // only a blow of yours (knockback) can throw it off
      const edge = !w.trench && !(this.kbT > 0), air = !this.grounded, sx = this.pos.x, sz = this.pos.z;
      if (edge) {
        const r = Math.min(this.radius, 0.6) + 0.15;
        if (dx && !w.edgeSafe(this.pos, this.pos.x + dx * dt + Math.sign(dx) * r, this.pos.z, air)) { dx = 0; this.vel.x = 0; }
        if (dz && !w.edgeSafe(this.pos, this.pos.x, this.pos.z + dz * dt + Math.sign(dz) * r, air)) { dz = 0; this.vel.z = 0; }
        if (dx && dz && !w.edgeSafe(this.pos, this.pos.x + dx * dt + Math.sign(dx) * r * 0.7, this.pos.z + dz * dt + Math.sign(dz) * r * 0.7, air)) { if (Math.abs(dx) < Math.abs(dz)) dx = 0; else dz = 0; } // (round an outer corner of the edge)
      }
      this.hitWallFlag = this.pushOut(dx * dt, dz * dt, this.pos.y + 0.6, this.pos.y + this.height);
      // (nor is it shoved out over the edge by a wall it slid along: a railing's end, a pillar by the brink)
      if (edge && (this.pos.x !== sx || this.pos.z !== sz) && !w.edgeSafe((this._eq || (this._eq = V())).set(sx, this.pos.y, sz), this.pos.x, this.pos.z, air)) { this.pos.x = sx; this.pos.z = sz; }
      // nor ever on to floor you cannot walk to (a ledge a blow lifts it on to, a pit it is shoved down into, a wall's top): whatever moves
      // it (its own steps, a shove, a blow), it stops where that floor begins. Over the void a blow still throws it off (a fall).
      if ((this.pos.x !== sx || this.pos.z !== sz) && !this.boss && E.walkOk(sx, sz, this.pos.y) && !E.walkOk(this.pos.x, this.pos.z, this.pos.y)) {
        if (E.walkOk(this.pos.x, sz, this.pos.y)) this.pos.z = sz; else if (E.walkOk(sx, this.pos.z, this.pos.y)) this.pos.x = sx; else { this.pos.x = sx; this.pos.z = sz; }
        this.vel.x = 0; this.vel.z = 0;
      }
      if (this.hitWallFlag && G.Strata.doors.length && !this.boss) G.Strata.bash(this, dt);
      // deep water (the drowned town): a walker pressed against a ledge (a wall's top, a step out of it) rises slowly up the water, to the
      // surface at most, and so climbs out onto it (the nav lets it head there: world.js canStep). Once it rises it keeps rising a moment
      // even when it stops pressing (a shove, a turn); this._deep: under the surface, for its choices (decideMove, tryAttack)
      const deepQ = w.deepWater && !this.boss ? w.deepWater.find((q) => this.pos.x > q.x0 && this.pos.x < q.x1 && this.pos.z > q.z0 && this.pos.z < q.z1 && this.pos.y < q.y - 0.05) : null;
      this._deep = !!deepQ;
      // (what it pressed against at the surface may be nothing it can get on to: the side of a bridge a metre over the water, which it walks
      // under on the bed. Its lunge lifted it into that, it rose, and it hung there pressing at the bridge's side for good. A foe that has
      // been at the surface a while and is still afloat lets go, sinks to the bed and stays down a few seconds)
      if (this.grounded) this._surfT = 0;
      if (this._sinkT > 0) this._sinkT -= dt;
      if (this._surfHold > 0) { this._surfHold -= dt; this._surfT = (this._surfT || 0) + dt; }
      if (deepQ) {
        if (this.hitWallFlag && (dx || dz) && !(this._sinkT > 0)) this.swimUpT = E.SWIM_KEEP;
        if (this.swimUpT > 0) {
          this.swimUpT -= dt; this.vel.y = Math.max(this.vel.y, E.SWIM_RISE + 22 * dt);
          if (this.pos.y > deepQ.y - 0.3) this._surfHold = 0.3;
          if (this._surfT > E.SWIM_GIVEUP) { this._surfT = 0; this._surfHold = 0; this.swimUpT = 0; this._sinkT = E.SWIM_SINK; }
        }
      } else this.swimUpT = 0;
      // vertical / ground
      this.vel.y -= 22 * dt;
      let ny = this.pos.y + this.vel.y * dt;
      // rising (a blow, a leap): the head stops under what is over it. Without this the wall test (pushOut) found the body's centre inside
      // the slab the head had entered and threw it sideways to the slab's edge: a tall foe struck in a low room, out through its wall
      if (this.vel.y > 0 && !this.boss && !this.tramp && !deepQ) {
        const h0 = this.pos.y + this.height, hq = E._hdQ || (E._hdQ = []); hq.length = 0;
        w.query(this.pos.x - 0.05, h0, this.pos.z - 0.05, this.pos.x + 0.05, ny + this.height + 0.02, this.pos.z + 0.05, hq);
        let cl = Infinity; for (const c of hq) if (c.y0 >= h0 && c.y0 < cl) cl = c.y0;
        hq.length = 0;
        if (ny + this.height > cl - 0.02) { ny = cl - this.height - 0.02; this.vel.y = 0; }
      }
      const a = w.query(this.pos.x - this.radius * 0.5, ny - 0.05, this.pos.z - this.radius * 0.5, this.pos.x + this.radius * 0.5, this.pos.y + 0.85, this.pos.z + this.radius * 0.5);
      let top = -Infinity; for (const c of a) if (c.y1 <= this.pos.y + 0.86 && c.y1 > top) top = c.y1;
      if (top > -Infinity && ny <= top) { this.pos.y = U.damp(this.pos.y, top, 18, dt); if (top - this.pos.y < 0.02) this.pos.y = top; if (this.vel.y < 0) this.vel.y = 0; this.grounded = true; }
      else { this.pos.y = ny; this.grounded = false; }
      if (this.grounded) this._lastGY = this.pos.y;
      if (this.pos.y < w.killY) {
        // thrown into the void: it dies, and its body is laid out on the nearest ground by the edge (so it can still be searched)
        const g = !this.boss && !this.custom && w.nearestGround(this.pos.x, this._lastGY ?? 0, this.pos.z);
        if (g) { this.pos.copy(g); this.vel.set(0, 0, 0); G.fx.smoke(this.pos.clone().setY(g.y + 0.4), 8, 1, 0x1a1412, 0.8, 1); }
        this.hp = 0; C.killEnemy(this, { src: 'fall' }, 0);
      }
      if (w.trench && this.grounded && !this.tramp && this.pos.y < w.trench.y + 0.6 && this.pos.z > w.trench.zN && this.pos.z < w.trench.zS && this.pos.x > w.trench.w[U.clamp(Math.floor(this.pos.z), 0, w.trench.w.length - 1)] && this.pos.x < w.trench.e[U.clamp(Math.floor(this.pos.z), 0, w.trench.w.length - 1)]) {
        const T = w.trench, zi = U.clamp(Math.floor(this.pos.z), 0, T.w.length - 1), wl = T.w[zi], er = T.e[zi];
        // the nearest way out: the west bank, the east bank, or round the north / south end
        const dW = this.pos.x - wl, dE = er - this.pos.x, dN = this.pos.z - T.zN, dS = T.zS - this.pos.z, m = Math.min(dW, dE, dN, dS);
        const tx = m === dW ? wl - 1.8 : m === dE ? er + 1.8 : this.pos.x, tz = m === dN ? T.zN - 1.8 : m === dS ? T.zS + 1.8 : this.pos.z;
        this.vel.y = 12.5; this.grounded = false;
        this.tramp = { vx: (tx - this.pos.x) / 1.05, vz: (tz - this.pos.z) / 1.05, t: 1.25 };
        G.fx.flash(this.pos.clone().setY(this.pos.y + 0.3), T.blue ? 0x4a9cff : 0xff7a30, 30, 0.25, 6);
        for (let k = 0; k < 6; k++) G.fx.flameLick(this.pos.x + U.rand(-0.6, 0.6), this.pos.y + 0.05, this.pos.z + U.rand(-0.6, 0.6), U.rand(1.2, 2), T.blue ? 0x4a9cff : undefined);
        G.sfx.bounce(this.pos, 9); G.sfx.lava(this.pos);
      }
      this.clampBounds();
    }
    clampBounds() { const w = G.world; this.pos.z = U.clamp(this.pos.z, 0.5, w.D - 0.5); if (w.nooks) { const [lo, hi] = w.xLimits(this.pos.z, this.pos.y, 0.5); this.pos.x = U.clamp(this.pos.x, lo, hi); } else this.pos.x = U.clamp(this.pos.x, 0.5, w.W - 0.5); }
    // would this body, at (x, z) at its height, be over a roof (something whose underside is over the head room of the floor there and
    // whose top is under the body)? One-storey fields only: in the storeyed ones the slabs between storeys are what it flies over
    overRoof(x, z, y) {
      const w = G.world; if ((w.L || 1) > 1) return false;
      const i = w.navIdx(x, z); if (i < 0) return false;
      const fl = w.nf[i]; if (!(fl > -50)) return false;
      const yy = y === undefined ? this.pos.y : y, out = E._roofQ || (E._roofQ = []); out.length = 0;
      // (a top up to 0.2 over the feet counts: pushOut walls the body only from 0.2 up, so a roof whose top is a little over the feet would
      // neither stop it nor count, and the floor under it would then lift it on to that roof)
      w.query(x - 0.1, fl + 2.2, z - 0.1, x + 0.1, yy + 0.2, z + 0.1, out);
      let roof = false; for (const c of out) if (c.y0 > fl + 2.2 && c.y1 <= yy + 0.2 && !c.navIgnore && !c.dest) { roof = true; break; }
      out.length = 0; return roof;
    }
    // the underside of the lowest solid thing over this body, up to yTo + its height (Infinity: open sky)
    // the floor under a flyer: the highest top up to 1.2 over its feet (the ground a dive took it into, a floor it sank to). What was over
    // it a moment ago is left out (yWas: its feet then): a slab whose underside was above them is a ceiling, and taking its top for the
    // floor lifted the body up through it (from under a room's ceiling into the roof over it, which then threw it out sideways)
    floorUnder(yWas) {
      const w = G.world, x = this.pos.x, z = this.pos.z, y = this.pos.y + 1.2, out = E._flQ || (E._flQ = []); out.length = 0;
      w.query(x - 0.01, -60, z - 0.01, x + 0.01, y + 0.01, z + 0.01, out);
      let best = -100; for (const c of out) if (c.y1 <= y + 0.02 && c.y1 > best && c.y0 < yWas + 0.2) best = c.y1;
      out.length = 0; return best;
    }
    ceilAbove(yTo) {
      const w = G.world, r = this.radius * 0.6, y0 = this.pos.y + 0.2, out = E._ceilQ || (E._ceilQ = []); // (from just over the feet: a slab it has begun to rise or dive into is a ceiling too, never a wall to be shoved sideways out of)
      out.length = 0;
      w.query(this.pos.x - r, y0, this.pos.z - r, this.pos.x + r, Math.max(yTo, this.pos.y) + this.height + 0.6, this.pos.z + r, out);
      let best = Infinity;
      for (const c of out) if (c.y0 >= y0 && c.y0 < best && !c.navIgnore && !c.dest) best = c.y0;
      out.length = 0;
      return best;
    }
    // circle vs AABB push-out within a vertical band; returns true if blocked
    flyClear(a, b) {
      const w = G.world; if (!w.los(a, b)) return false;
      const d = b.clone().sub(a); d.y = 0; const L = d.length(); if (L < 0.01) return true;
      const sx = -d.z / L * this.radius * 0.7, sz = d.x / L * this.radius * 0.7;
      return w.los(V(a.x + sx, a.y, a.z + sz), V(b.x + sx, b.y, b.z + sz)) && w.los(V(a.x - sx, a.y, a.z - sz), V(b.x - sx, b.y, b.z - sz));
    }
    pushOut(dx, dz, y0, y1) {
      const w = G.world, r = this.radius * 0.8;
      this.pos.x += dx; this.pos.z += dz;
      let blocked = false;
      const a = w.query(this.pos.x - r, y0, this.pos.z - r, this.pos.x + r, y1, this.pos.z + r);
      for (const c of a) {
        const cx = U.clamp(this.pos.x, c.x0, c.x1), cz = U.clamp(this.pos.z, c.z0, c.z1);
        let ox = this.pos.x - cx, oz = this.pos.z - cz; let d = Math.hypot(ox, oz);
        if (d >= r) continue;
        if (d < 1e-4) { // center inside: push along least penetration
          // only the head is in it (a ceiling the body rose into): that is settled up and down, never by a throw to the slab's far edge
          if (c.y0 >= y1 - 0.5) continue;
          const pen = [[this.pos.x - c.x0, -1, 0], [c.x1 - this.pos.x, 1, 0], [this.pos.z - c.z0, 0, -1], [c.z1 - this.pos.z, 0, 1]].sort((p, q) => p[0] - q[0])[0];
          this.pos.x += pen[1] * (pen[0] + r); this.pos.z += pen[2] * (pen[0] + r);
        } else { this.pos.x += ox / d * (r - d); this.pos.z += oz / d * (r - d); }
        blocked = true;
      }
      return blocked;
    }
    animate(dt) {
      const m = this.model;
      m.group.position.copy(this.pos);
      m.group.rotation.y = this.yaw;
      const stunned = this.st.stun > 0 || this.st.frozen > 0;
      if (!(this.animT >= 0)) this.animT = 0; // (never leave it unset: a foe stunned before its first frame fed NaN into every pose and its corpse box)
      if (!stunned || !(this.st.frozen > 0)) this.animT += dt * (this.st.frozen > 0 ? 0 : 1);
      const fin = (v) => (Number.isFinite(v) ? v : 0);
      if (m.J && !m.worm) m.animate({ walk: fin(this.walk), mv: fin(this.mv), atk: fin(this.atk), wind: fin(this.wind), flinch: fin(this.flinch), t: this.animT, stunned, throwing: this.attackState && this.attackState.throwing });
      if (m.worm) this.animateWorm(dt);
      if (this.atk > 0 && !this.attackState) this.atk = Math.max(0, this.atk - dt * 3);
      // hit flash & status tint: every condition recolours the body so it reads at a glance
      const flash = Math.max(0, 1 - (G.game.time - this.lastHitT) * 8);
      const S = this.st, gt = G.game.time, ph = this.phase || (this.phase = Math.random() * 6);
      const pulse = 0.65 + 0.35 * Math.sin(gt * 7 + ph);
      const tint = TINT.setRGB(0, 0, 0);
      let aura = null, auraK = 0;
      const addT = (r, g, b, k) => { tint.r += r * k; tint.g += g * k; tint.b += b * k; };
      const want = (c, k) => { if (k > auraK) { aura = c; auraK = k; } };
      if (this.cursed) { addT(0.16, 0.0, 0.24, 0.75 + 0.25 * Math.sin(gt * 3 + ph)); want(0x9a30ff, 0.55); }
      if (this.mut) { MUTC.set(this.mutCol); addT(MUTC.r * 0.18, MUTC.g * 0.18, MUTC.b * 0.18, 0.7 + 0.3 * Math.sin(gt * 4 + ph)); want(this.mutCol, 0.6); }
      if (this.stalker) { addT(-0.2, -0.2, -0.2, 1); want(0x300008, 0.95); }
      if (this.champion) { addT(0.22, 0.02, 0.0, 0.8); want(0xff3018, 0.6); }
      if (this.tgtFx) { const k = 0.6 + 0.4 * Math.sin(gt * 6 + ph); this.tgtFx.om.color.setHex(this.tgtFx.col).multiplyScalar(0.7 + 0.6 * k); this.tgtFx.beam.material.opacity = 0.22 + 0.25 * k; }
      if (S.burn > 0) { addT(0.55, 0.2, 0.0, pulse); want(0xff6a10, 0.9); }
      if (S.poison > 0) { addT(0.08, 0.38, 0.0, pulse * Math.min(1, 0.4 + (S.poisonStacks || 1) * 0.12)); want(0x70e020, 0.8); }
      if (S.frozen > 0) { addT(0.2, 0.4, 0.6, 1); want(0xa0e0ff, 1); }
      else if (S.frost > 0) { addT(0.05, 0.16, 0.3, Math.min(1, 0.3 + (S.frostStacks || 0) * 0.15)); want(0x80c8ff, 0.7); }
      if (S.shock > 0) { addT(0.35, 0.35, 0.15, Math.random()); want(0xfff0a0, 0.85); }
      if (S.stun > 0 && !(S.frozen > 0)) { addT(0.2, 0.18, 0.02, 0.6); want(0xffe040, 0.7); }
      if (S.slow > 0) addT(0.0, 0.06, 0.14, 1);
      if (S.mark > 0) { addT(0.3, 0.06, 0.06, pulse); want(0xff4040, 0.5); }
      if (S.fear > 0) { addT(0.12, 0.0, 0.18, pulse); want(0x8040c0, 0.6); }
      for (const mat of m.M.all) {
        if (mat === m.M.eye || !mat.emissive) continue;
        if (!mat.userData.base) mat.userData.base = mat.emissive.clone();
        mat.emissive.copy(mat.userData.base).add(tint);
        if (flash > 0) mat.emissive.add(FLASH.setRGB(flash * 0.6, flash * 0.5, flash * 0.45));
      }
      this.updateAura(dt, aura, auraK);
      // ornament particles
      const def = this.def;
      if (def.orn === 'ember' && Math.random() < dt * 6) G.fx.flameLick(this.pos.x + U.rand(-0.3, 0.3), this.pos.y + this.height * 0.7, this.pos.z + U.rand(-0.3, 0.3), 0.6);
      if (def.orn === 'wisps' && Math.random() < dt * 8) G.fx.norm.spawn(this.pos.x, this.pos.y + this.height * 0.7, this.pos.z, U.rand(-0.3, 0.3), 0.5, U.rand(-0.3, 0.3), 1, 0.2, 0.6, 0.05, 0.02, 0.08, 0.6, -0.2, 1);
      if (def.orn === 'sparks' && Math.random() < dt * 4) G.fx.sparks(this.centerPos(), null, 2, 0xffe080, 3);
      if (def.orn === 'ice' && Math.random() < dt * 3) G.fx.norm.spawn(this.pos.x, this.pos.y + this.height * 0.5, this.pos.z, 0, -0.3, 0, 1, 0.15, 0.5, 0.85, 0.92, 1, 0.4, 0, 1);
      if (this.auraRing) this.auraRing.rotation.z += dt;
      if (this.ring) this.ring.rotation.z -= dt * 2;
    }
    // soft additive glow around the body (status / curse aura) + small tell-tale particles
    updateAura(dt, col, k) {
      const m = this.model;
      if (!this.auraSpr) {
        if (!col) return;
        this.auraSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: G.Tex.spr.soft, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.group.add(this.auraSpr);
      }
      const sp = this.auraSpr, gt = G.game.time;
      const target = col ? 0.32 + 0.3 * k : 0;
      sp.material.opacity = U.damp(sp.material.opacity, target * (0.85 + 0.15 * Math.sin(gt * 6 + (this.phase || 0))), 8, dt);
      if (col) sp.material.color.lerp(AURA_C.set(col), Math.min(1, dt * 8));
      const h = this.height, r = this.radius;
      sp.position.set(0, h * 0.5, 0);
      sp.scale.set(Math.max(r * 3.4, h * 0.9), h * 1.5, 1);
      sp.visible = sp.material.opacity > 0.01 && !this.cloaked;
      // stun stars & curse wisps
      const S = this.st;
      if (S.stun > 0 && !(S.frozen > 0) && Math.random() < dt * 14) {
        const a = gt * 6 + Math.random() * 6.28, rr = Math.max(0.35, this.radius * 0.7);
        G.fx.add.spawn(this.pos.x + Math.cos(a) * rr, this.pos.y + this.height + 0.25, this.pos.z + Math.sin(a) * rr, -Math.sin(a) * 1.5, 0.2, Math.cos(a) * 1.5, 0.35, 0.08, 0.02, 1, 0.9, 0.3, 1, 0, 0);
      }
      if (this.cursed && Math.random() < dt * 7) G.fx.norm.spawn(this.pos.x + U.rand(-this.radius, this.radius), this.pos.y + U.rand(0, this.height * 0.6), this.pos.z + U.rand(-this.radius, this.radius), 0, U.rand(0.8, 1.6), 0, 1.0, 0.18, 0.5, 0.35, 0.05, 0.55, 0.85, -0.2, 1);
      if (this.champion && Math.random() < dt * 6) G.fx.add.spawn(this.pos.x + U.rand(-this.radius, this.radius), this.pos.y + U.rand(0, this.height), this.pos.z + U.rand(-this.radius, this.radius), 0, U.rand(1, 2), 0, 0.6, 0.08, 0.02, 1, 0.3, 0.1, 0.9, 0, 0);
      if (S.frost > 0 && !(S.frozen > 0) && Math.random() < dt * 4) G.fx.norm.spawn(this.pos.x + U.rand(-0.3, 0.3), this.pos.y + this.height * U.rand(0.3, 0.9), this.pos.z + U.rand(-0.3, 0.3), 0, -0.2, 0, 1, 0.1, 0.4, 0.8, 0.92, 1, 0.6, 0, 1);
      if (this.cursedRing) { this.cursedRing.rotation.z -= dt * 0.8; this.cursedRing.material.opacity = 0.35 + 0.15 * Math.sin(gt * 3 + (this.phase || 0)); }
    }
    // hunt targets / champions: a bright silhouette outline, a sky beam seen through walls, a big nameplate (see updateBars)
    markTarget(champ) {
      if (this.tgtFx) return;
      const col = champ ? 0xff3a1a : 0xffc830;
      const om = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide, fog: false });
      const hulls = [];
      this.model.group.traverse((o) => {
        if (!o.isMesh || o.userData.tgtHull || !o.geometry || (o.material && (o.material.transparent || o.material.blending === THREE.AdditiveBlending))) return;
        hulls.push(o);
      });
      for (const o of hulls) {
        const h = new THREE.Mesh(o.geometry, om); h.userData.tgtHull = true; h.raycast = () => {};
        h.scale.setScalar(1.12); h.castShadow = false; h.renderOrder = -1; o.add(h);
      }
      const top = this.height * (this.model.scale || 1) + 0.6;
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.45, 40, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = top + 20; beam.renderOrder = 6; beam.raycast = () => {}; this.model.group.add(beam);
      this.tgtFx = { om, beam, col };
    }
    // the hunt / champion highlight (outline, sky beam, curse ring) goes out once the body has been searched
    clearTarget() {
      const f = this.tgtFx;
      if (f) {
        const hulls = []; this.model.group.traverse((o) => { if (o.userData && o.userData.tgtHull) hulls.push(o); });
        for (const h of hulls) if (h.parent) h.parent.remove(h);
        if (f.beam && f.beam.parent) f.beam.parent.remove(f.beam);
        if (f.beam) { f.beam.geometry.dispose(); f.beam.material.dispose(); }
        if (f.om) f.om.dispose();
        this.tgtFx = null;
      }
      if (this.cursedRing && this.cursedRing.parent) { this.cursedRing.parent.remove(this.cursedRing); this.cursedRing = null; }
      this.marked = false; this.champion = false;
    }
    makeCurseRing(col) {
      if (this.cursedRing) return;
      const r = this.radius;
      const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.2, r * 1.65, 6), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; this.model.group.add(ring); this.cursedRing = ring;
    }
    animateWorm(dt) {
      // segments follow a recorded head trail
      const m = this.model;
      if (!this.trail) this.trail = [];
      const hp = V(this.pos.x, this.pos.y + 0.8 * m.scale + Math.max(0, this.vel.y * 0.05), this.pos.z);
      this.trail.unshift(hp);
      if (this.trail.length > 120) this.trail.length = 120;
      m.group.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(m.inner.matrixWorld).invert();
      let k = 0, acc = 0;
      const spacing = 0.55 * m.scale;
      for (let i = 0; i < m.J.segs.length; i++) {
        const need = (i + 1) * spacing;
        while (k < this.trail.length - 1 && acc < need) { acc += this.trail[k].distanceTo(this.trail[k + 1]); k++; }
        const wp = this.trail[Math.min(k, this.trail.length - 1)].clone();
        wp.y -= (i + 1) * 0.06 * m.scale;
        const lp = wp.applyMatrix4(inv);
        m.J.segs[i].position.copy(lp);
      }
      m.animate({ atk: this.atk, wind: 0, t: G.game.time });
    }
    updateHits() {
      const m = this.model;
      m.group.updateMatrixWorld(true);
      let main = null;
      for (const h of this.hitW) { h.w.copy(h.o).applyMatrix4(h.n.matrixWorld); if (h.part === 'body' && (!main || h.r > main.r)) main = h; }
      this.centerRef.copy(main ? main.w : this.hitW[0].w);
      this._hitInit = true;
    }
    updateDeath(dt) {
      this.deathT += dt;
      const m = this.model;
      const k = Math.min(1, this.deathT / 0.6);
      m.inner.rotation.z = k * 1.45 * (this.yaw > 0 ? 1 : -1);
      m.inner.position.y = -k * this.radius * 0.4;
      if (!this.boss && !this.custom) this.settleBody(dt);
      else if (this.flyer && this.pos.y > G.world.navFloor(this.pos.x, this.pos.z, this.pos.y) + 0.3) this.pos.y -= dt * 8;
      m.group.position.copy(this.pos);
      if (this.deathT > 1.6 && !this.corpse) {
        const s = Math.max(0.001, 1 - (this.deathT - 1.6) * 2.5);
        m.inner.scale.setScalar(m.scale * s);
        if (Math.random() < 0.3) G.fx.smoke(this.centerPos(), 1, 0.6, 0x1a1412, 0.6, 0.8);
      }
      if (this.deathT > 2.0 && !this.corpse) { this.remove(); }
    }
    // A body never hangs in the air: it drops on to the floor below it. One that died out over the void (thrown off an edge, a flyer
    // shot down over a chasm) is laid out on the nearest ground instead, where it can still be searched.
    settleBody(dt) {
      const w = G.world;
      if (!this._bodyChk) {
        this._bodyChk = true;
        if (w.voidBelow(this.pos.x, this.pos.y, this.pos.z)) {
          const g = w.nearestGround(this.pos.x, this._lastGY ?? this.pos.y, this.pos.z);
          if (g) {
            G.fx.smoke(this.centerPos(), 6, 1, 0x1a1412, 0.8, 1);
            this.pos.copy(g); if (this.flyer) this.pos.y += 1.2;
            G.fx.smoke(this.pos.clone().setY(g.y + 0.4), 8, 1, 0x1a1412, 0.8, 1);
            if (this.corpse && this.corpse.pos) this.corpse.pos.copy(g);
          }
        }
        this._bodyFl = w.floorBelow(this.pos.x, this.pos.y + 0.3, this.pos.z) + (this.flyer ? 0.3 : 0);
      }
      if (this._bodyFl > -50 && this.pos.y > this._bodyFl + 0.01) this.pos.y = Math.max(this._bodyFl, this.pos.y - dt * 8);
    }
    remove() {
      this.removed = true;
      G.scene.remove(this.model.group);
      for (const m of this.model.M.all) m.dispose();
      if (this.bar) { this.bar.el.style.display = 'none'; this.bar.used = false; this.bar = null; }
      if (this.tele) G.fx.endTelegraph(this.tele);
    }
  }
  E.Enemy = Enemy;
  // (the new fields' foes, fieldfoes.js, build their bodies with the same parts and colours)
  E._ = { B, PLANCOL, mesh, joint, leg };

  // ---------------- manager ----------------
  E.init = function () { P = G.player; C = G.combat; PG = G.Props.PG; E.bars = []; E.barRoot = document.getElementById('worldui'); };
  E.spawn = function (def, level, pos, opts) {
    const e = new Enemy(def, level, pos, opts);
    // a flyer comes in under the lowest thing over the floor of its spot (a storey's floor, a roof, an eave, a beam), never inside it or
    // on top of it (inside: the wall push-out shoved it out sideways, metres at a time, the moment it came to life; on top: over a roof)
    if (e.flyer && !e.custom && G.world && G.world.query && G.world.nf) {
      const w = G.world, r = e.radius * 0.6, i = w.navIdx(e.pos.x, e.pos.z, e.pos.y - 2.5);
      const fl = i >= 0 && w.nf[i] > -50 ? w.nf[i] : w.floorBelow(e.pos.x, e.pos.y, e.pos.z);
      if (fl > -50) {
        const over = w.query(e.pos.x - r, fl + 0.2, e.pos.z - r, e.pos.x + r, e.pos.y + e.height, e.pos.z + r).filter((c) => !c.navIgnore && !c.dest && c.y0 > fl + 0.2);
        if (over.length) { const low = Math.min(...over.map((c) => c.y0)); e.pos.y = Math.max(fl + 0.35, Math.min(e.pos.y, low - e.height - 0.1)); }
      }
    }
    // anything that appears while a boss is alive (its summons, splits, adds) is worth no coins: no farming the boss
    if (G.bosses && G.bosses.active && G.bosses.active.alive !== false) e.bossSpawn = true;
    E.list.push(e);
    return e;
  };
  E.add = function (ent) { E.list.push(ent); return ent; };
  E.ELITE_MODS = ELITE_MODS;
  E.clear = function () {
    for (const e of E.list) { if (e.custom) { if (e.remove) e.remove(); } else if (!e.removed) e.remove(); }
    E.list.length = 0;
    for (const b of E.bars) { b.el.style.display = 'none'; b.used = false; }
  };
  E.aliveCount = function () { let n = 0; for (const e of E.list) if (e.alive && !e.ally && !e.ignoreCount) n++; return n; };
  const SHIELD_K = 1.6; // the shield bubble is drawn at this many body radii
  E.shieldK = SHIELD_K;
  E.inRadius = function (pos, r) {
    const out = [];
    for (const e of E.list) {
      if (!e.alive || e.burrowed || e.untargetable) continue;
      if (e.hitW && e.multiPart) { if (e.hitW.some((h) => h.w.distanceTo(pos) < r + h.r)) out.push(e); continue; }
      const c = e.centerRef || e.pos;
      if (c.distanceTo(pos) < r + e.radius * (e.shield > 0 ? SHIELD_K : 1)) out.push(e);
    }
    return out;
  };
  E.nearest = function (pos, r, excl) {
    let best = null, bd = r;
    for (const e of E.list) { if (!e.alive || e === excl || e.burrowed || e.untargetable) continue; const d = (e.centerRef || e.pos).distanceTo(pos); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  function raySphere(o, d, c, r) {
    const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const cc = ox * ox + oy * oy + oz * oz - r * r;
    const h = b * b - cc;
    if (h < 0) return -1;
    const t = -b - Math.sqrt(h);
    return t >= 0 ? t : (cc < 0 ? 0 : -1);
  }
  E.raycastAll = function (o, d, maxT, excl, pad) {
    const out = [];
    pad = pad || 0;
    for (const e of E.list) {
      if (!e.alive || e.burrowed || e.untargetable || (excl && excl.has && excl.has(e))) continue;
      if (e.spawning) continue;
      let best = Infinity, part = null;
      for (const h of e.hitW) {
        const t = raySphere(o, d, h.w, h.r + pad);
        if (t >= 0 && t < best) { best = t; part = h.part; }
      }
      // a foe wearing a shield is hit all over the bubble (the size the bubble is drawn at, see combat.js) and has no weak spot until it breaks
      if (e.shield > 0 && e.radius) {
        const c = e.centerRef || e.pos, t = raySphere(o, d, c, e.radius * SHIELD_K + pad);
        if (t >= 0 && t < best) best = t;
        if (best < Infinity) part = 'body';
      }
      if (best < maxT) out.push({ e, t: best, part, key: best + (e.isInvuln && e.isInvuln({}) ? 1.6 : 0) });
    }
    out.sort((a, b) => a.key - b.key);
    return out;
  };
  E.raycast = function (o, d, maxT, pad, excl) {
    const a = E.raycastAll(o, d, maxT, excl, pad);
    return a.length ? a[0] : null;
  };
  E.onDamaged = function (e, info) { e.aware = true; if (e.cloaked && e.cloakOn) e.setCloak(false); };
  E.groundMove = function (ent, dx, dz, speed, dt) {
    const w = G.world, r = 0.35;
    ent.pos.x += dx * speed * dt; ent.pos.z += dz * speed * dt;
    const a = w.query(ent.pos.x - r, ent.pos.y + 0.6, ent.pos.z - r, ent.pos.x + r, ent.pos.y + 1.8, ent.pos.z + r);
    for (const c of a) { const cx = U.clamp(ent.pos.x, c.x0, c.x1), cz = U.clamp(ent.pos.z, c.z0, c.z1); const ox = ent.pos.x - cx, oz = ent.pos.z - cz; const d = Math.hypot(ox, oz); if (d < r && d > 1e-4) { ent.pos.x += ox / d * (r - d); ent.pos.z += oz / d * (r - d); } }
    const f = w.groundAt(V(ent.pos.x, ent.pos.y + 0.8, ent.pos.z), 0.2, 3);
    if (f > -Infinity) ent.pos.y = f;
  };

  let flowT = 0;
  E.update = function (dt) {
    flowT -= dt;
    if (flowT <= 0 && E.list.length) {
      flowT = 0.3;
      const d = C.getDecoy();
      const tp = d ? d.pos : P.pos;
      G.world.updateFlow(tp.x, tp.z, tp.y);
      if (G.world.navLayers > 1) {
        const wanted = []; for (const e of E.list) if (e.alive && e.flyer && !e.custom) { const n = G.world.navIdx(e.pos.x, e.pos.z, e.pos.y); if (n >= 0) wanted.push(n); }
        if (wanted.length) G.world.updateAirFlow(tp.x, tp.z, tp.y, wanted);
      }
    }
    // (a foe leaving the list gives its health bar back here: updateBars only walks the list, so a bar left behind would stay on screen)
    const drop = (i) => { const e = E.list[i]; if (e.bar) { e.bar.el.style.display = 'none'; if (e.bar.el._s) e.bar.el._s.display = 'none'; e.bar.used = false; e.bar = null; } E.list.splice(i, 1); };
    for (let i = E.list.length - 1; i >= 0; i--) {
      const e = E.list[i];
      if (e.custom) { e.update(dt); if (e.removed) drop(i); continue; }
      e.update(dt);
      if (e.removed) drop(i);
    }
    E.updateBars();
  };

  // ---------------- the last foes: pointed at, and brought in (an area must never hang on one foe nobody can find) ----------------
  // In a fight (a combat area not cleared yet), once two or fewer foes are left, or nobody has hit a foe or been hurt for 20 s, every
  // foe left is pointed at: from the screen's edge when it is off the screen, where it stands (through walls) when it is in front but
  // out of sight. None is ever moved to you (pokobi: no warping): a foe can never be where you cannot get at it (E.walkOk, E.airOk), so
  // the marks are all it takes. Guardians, the gold mimic and what does not count for the area are left out.
  // the swoop of the bats and crows: speed (m/s) and longest dive (s); how fast it bends after you (per s); how long it goes round to a
  // better place after a dive that could not reach you; how soon it tries again when it broke one off
  E.SWIM_RISE = 1.4; E.SWIM_KEEP = 0.5; // m/s: a foe rising up the deep water to climb out onto a ledge; s it keeps rising after it stops pressing
  E.SWIM_GIVEUP = 1.5; E.SWIM_SINK = 3; // s afloat at the surface, still not out, before it lets go and sinks; s it then stays down
  // ---- the air a flyer may be in, worked out once for each area's ground plan: over the floor you can walk to from where you came in (or
  // from where you stand), and a little beyond it: 2 m over a wall, a pillar or the rock beside it, 6 m out over the void beside it. A
  // flyer never moves out of it (physics, fly): not into the rock round a mine's tunnels, not over the wall round a field, not out over the
  // sky round the islands. (Not a pull back: a move that would take it out simply does not happen.)
  E.AIR_WALL = 2; E.AIR_VOID = 6;
  E.airMask = function () {
    const w = G.world; if (!w || !w.nf || !w.reach) return null;
    if (w._air && w._air.nf === w.nf) return w._air.ok ? w._air : null;
    const W = w.Wn, D = w.Dn, N = w.N, L = w.L || 1;
    const col = new Uint8Array(N); let any = 0;
    const seed = (x, z, y) => {
      let i = w.navIdx(x, z, y);
      if (i >= 0 && w.nb[i]) { i = -1; for (let r = 1; r <= 2 && i < 0; r++) for (let dz = -r; dz <= r && i < 0; dz++) for (let dx = -r; dx <= r; dx++) { const j = w.navIdx(x + dx, z + dz, y); if (j >= 0 && !w.nb[j]) { i = j; break; } } }
      if (i < 0 || col[i % N]) return;
      const r = w.reach(i); for (let n = 0; n < r.length; n++) if (r[n]) { col[n % N] = 1; any++; }
    };
    if (w.reachMask && w.reachMask.length === N * L) for (let n = 0; n < w.reachMask.length; n++) if (w.reachMask[n]) { col[n % N] = 1; any++; } // (the level's own check: reached from where you come in)
    if (w.spawn) seed(w.spawn.x, w.spawn.z, w.spawn.y);
    if (P && P.pos) seed(P.pos.x, P.pos.z, P.pos.y);
    if (!any) { w._air = { nf: w.nf, ok: null }; return null; } // (no ground plan to go by: no limit beyond the area's own bounds)
    const dist = new Uint8Array(N).fill(255), q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (col[i]) { dist[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], d = dist[i]; if (d >= E.AIR_VOID) continue;
      const x = i % W, z = (i / W) | 0;
      if (x + 1 < W && dist[i + 1] > d + 1) { dist[i + 1] = d + 1; q[qt++] = i + 1; }
      if (x > 0 && dist[i - 1] > d + 1) { dist[i - 1] = d + 1; q[qt++] = i - 1; }
      if (z + 1 < D && dist[i + W] > d + 1) { dist[i + W] = d + 1; q[qt++] = i + W; }
      if (z > 0 && dist[i - W] > d + 1) { dist[i - W] = d + 1; q[qt++] = i - W; }
    }
    const ok = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      let ground = false; for (let k = 0; k < L; k++) if (w.nf[k * N + i] > -Infinity) { ground = true; break; }
      ok[i] = dist[i] <= (ground ? E.AIR_WALL : E.AIR_VOID) ? 1 : 0;
    }
    w._air = { nf: w.nf, ok, W, D, xo: w.xo, zo: w.zo };
    return w._air;
  };
  E.airOk = function (x, z) {
    const a = E.airMask(); if (!a) return true;
    const xi = Math.floor(x) + a.xo, zi = Math.floor(z) + a.zo;
    if (xi < 0 || zi < 0 || xi >= a.W || zi >= a.D) return false;
    return a.ok[zi * a.W + xi] === 1;
  };
  // a pull (a whirl, a grasp: combat.js zones) moves a foe only where it may stand (E.walkOk / E.airOk), never off on to a statue's top or into a pit
  E.pullTo = function (e, d, step) {
    const nx = e.pos.x + d.x * step, nz = e.pos.z + d.z * step;
    const ok = (x, z) => (e.flyer ? E.airOk(x, z) : E.walkOk(x, z, e.pos.y));
    if (ok(e.pos.x, e.pos.z) && !ok(nx, nz)) return false;
    e.pos.x = nx; e.pos.z = nz; return true;
  };
  E.SWOOP = { speed: 17, dur: 0.9, turn: 0.8, lead: 0.5, repo: 1.2, retry: 0.7 }; // (lead: how much of your speed it allows for: half, a dodge still works)
  E.REST = { n: 2, quiet: 20 };
  // may a walker stand at (x, z) at height y? Floor you can walk to from where you come in (the level's own check, w.reachMask), a wall
  // (its cell is shut: pushOut keeps the body off it), or no floor at all (the void: a fall). Not a ledge, a pit or a wall top you cannot reach
  E.walkOk = function (x, z, y) {
    const w = G.world, m = w && w.reachMask; if (!m || !w.nf || m.length !== w.nf.length) return true; // (a ground plan made anew since: no word to go by)
    const i = w.navIdx(x, z, y); if (i < 0) return true;
    if (!(w.nf[i] > -Infinity)) return true;
    if (w.nf[i] > y + 1.0) return true; // (the body is down beside something tall here, a statue on its plinth: that is a wall to it, not a floor it stands on)
    return m[i] === 1 || m[i] === true || w.nb[i] === 1;
  };
  let restAt = -1, restS = null;
  E.restSet = function () {
    const GM = G.game, O = GM.objective;
    if (GM.time === restAt) return restS;
    restAt = GM.time; restS = null;
    if (!O || O.tutorial || GM.areaCleared || GM.state !== 'playing' || !['combat', 'elite', 'cursed', 'vault'].includes(GM.stage)) return null;
    const left = E.list.filter((e) => e.alive && e.isEnemy && !e.ally && !e.custom && !e.boss && !e.ignoreCount && e.def.id !== 'mimic_gold');
    if (!left.length) return null;
    let fight = Math.max(P.lastHurtT || -99, GM.areaStartT || 0);
    for (const e of left) if (e.lastHitT > fight) fight = e.lastHitT;
    if (left.length > E.REST.n && GM.time - fight < E.REST.quiet) return null;
    return (restS = new Set(left));
  };

  // ---------------- health bars (DOM, pooled) ----------------
  function getBar() {
    let b = E.bars.find((x) => !x.used);
    if (!b) {
      const el = document.createElement('div'); el.className = 'ebar';
      // name row (rank by colour + a small 精鋭 tag), then: element badge | health | trait chips, the shield, the full trait names (the foe you aim at), statuses
      el.innerHTML = '<div class="en"><span class="rk">精鋭</span><span class="lv"></span><span class="nm"></span></div><div class="hrow"><span class="eb"></span><div class="hb"><div class="tr"></div><div class="fl"></div></div><span class="ch"></span></div><div class="sb"><div class="fl"></div></div><div class="xn"></div><div class="st"></div>';
      E.barRoot.appendChild(el);
      b = { el, lv: el.querySelector('.lv'), nm: el.querySelector('.nm'), tr: el.querySelector('.hb .tr'), fl: el.querySelector('.hb .fl'), sb: el.querySelector('.sb'), sfl: el.querySelector('.sb .fl'), st: el.querySelector('.st'), eb: el.querySelector('.eb'), ch: el.querySelector('.ch'), xn: el.querySelector('.xn'), used: false };
      E.bars.push(b);
    }
    b.used = true; b.key = null; b.el.style.display = ''; if (b.el._s) b.el._s.display = '';
    return b;
  }
  const scr = {};
  const _hpv = new THREE.Vector3();
  // change-only style writes (no DOM work, no string garbage when nothing moved)
  const sty = (el, k, v) => { const c = el._s || (el._s = {}); if (c[k] !== v) { c[k] = v; el.style[k] = v; } };
  E.updateBars = function () {
    const cam = G.camera;
    let aimBar = null, aimD2 = 70 * 70;
    const sharp = P.has('o_sharp');
    const rest = E.restSet();
    for (const e of E.list) {
      if (e.noBar || e.boss && !e.showBar) { continue; }
      const show = e.alive && !e.burrowed && !(e.cloakOn) && e.state !== 'spawn' && !e.untargetable && (e.marked || (e.hasLOS || G.game.time - e.lastHitT < 3 || e.showBar) && e.pos.distanceTo(P.pos) < (sharp ? 90 : 55));
      if (e.marked) E.edgeMark(e, show);
      else if (rest && rest.has(e)) E.edgeMark(e, show, 'rest');
      else if (E.marks.has(e)) E.marks.get(e).style.display = 'none';
      if (!show) { if (e.bar) { e.bar.el.style.display = 'none'; e.bar.used = false; e.bar = null; } continue; }
      const hp = _hpv.set(e.pos.x, e.pos.y + e.height + 0.35, e.pos.z);
      if (e.barPos) hp.copy(e.barPos());
      if (!G.fx.project(hp, scr)) { if (e.bar) { e.bar.el.style.display = 'none'; e.bar.used = false; e.bar = null; } continue; }
      if (!e.bar) e.bar = getBar();
      const b = e.bar;
      sty(b.el, 'left', Math.round(scr.x * 2) / 2 + 'px'); sty(b.el, 'top', Math.round(scr.y * 2) / 2 + 'px');
      const ke = !!e.elite, kc = !!e.cursed, km = !!e.marked;
      const kg = !!e.graveSpawn;
      // the foe nearest the crosshair (within ~70px) shows its traits by name
      { const dx = scr.x - innerWidth / 2, dy = scr.y - innerHeight / 2, d2 = dx * dx + dy * dy; if (d2 < aimD2 && e.hasLOS !== false) { aimD2 = d2; aimBar = b; } }
      if (b.kl !== e.level || b.kn !== e.def.name || b.ke !== ke || b.kc !== kc || b.kmi !== (e.mutIcons || e.mutView) || b.kp !== e.pileRes || b.km !== km || b.kg !== kg || b.key === null) {
        b.kl = e.level; b.kn = e.def.name; b.ke = ke; b.kc = kc; b.kmi = e.mutIcons || e.mutView; b.kp = e.pileRes; b.km = km; b.kg = kg; b.key = 1;
        b.el.classList.toggle('grave', kg); b.el.classList.toggle('cursed', kc && !kg);
        b.lv.textContent = e.boss ? '' : 'Lv.' + e.level;
        b.nm.textContent = e.def.name;
        // traits as chips: mutations, a champion's trait, shock resistance against the pile driver (at most 4, then "+n")
        const chips = [], names = [];
        for (const id of e.mut ? Object.keys(e.mut) : e.mutView || []) { const m = G.Depth.MUT_BY_ID[id]; if (m) { chips.push([m.ch || m.name[0], '#' + m.col.toString(16).padStart(6, '0')]); names.push(m.name); } }
        if (e.eliteMod2) { chips.push([e.eliteMod2.id === 'fast' ? '疾' : e.eliteMod2.id === 'rage' ? '狂' : '再', '#ff6040']); names.push(e.eliteMod2.id === 'fast' ? '俊足' : e.eliteMod2.id === 'rage' ? '狂暴' : '再生'); }
        if (e.pileRes) { chips.push(['衝' + ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][e.pileRes], '#b0a090']); names.push('衝撃耐性' + ['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][e.pileRes]); }
        const shown = chips.slice(0, 4).map(([t, c]) => `<i style="--c:${c}">${t}</i>`).join('') + (chips.length > 4 ? `<i class="more">+${chips.length - 4}</i>` : '');
        b.ch.innerHTML = shown; b.xn.textContent = names.join('・');
        // (rank: colour of the name + the 精鋭 tag; no emoji prefixes)
        b.el.classList.toggle('elite', !!e.elite);
        b.el.classList.toggle('target', !!e.marked); b.el.classList.toggle('champ', !!(e.marked && e.champion));
        let tg = b.el.querySelector('.tg');
        if (e.marked) { if (!tg) { tg = document.createElement('div'); tg.className = 'tg'; b.el.prepend(tg); } tg.textContent = e.champion ? '👑 覇者 — 討伐対象' : '🎯 標的 — 討伐対象'; } else if (tg) tg.remove();
      }
      { const hw = (Math.max(0, e.hp) / e.maxHp * 100).toFixed(1) + '%'; sty(b.fl, 'width', hw); sty(b.tr, 'width', hw); }
      sty(b.sb, 'display', e.maxShield > 0 ? '' : 'none');
      if (e.maxShield > 0) sty(b.sfl, 'width', (e.shield / e.maxShield * 100).toFixed(1) + '%');
      const s = e.st, R = (n) => ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', 'XIII'][Math.min(13, Math.max(1, n || 1))] || 'Ⅰ'; let icons = '';
      if (s.burn > 0) icons += '🔥' + R(s.burnLv || 1) + ' '; if (s.frost > 0 || s.frozen > 0) icons += (s.frozen > 0 ? '🧊' : '❄️' + R(s.frostStacks || 1)) + ' '; if (s.poison > 0) icons += '☠️' + R(s.poisonStacks || 1) + ' '; if (s.shock > 0) icons += '⚡' + R(s.shockLv || 1) + ' '; if (s.stun > 0) icons += '💫'; if (!e.boss && G.game.time < (e.stunImmuneUntil || 0)) icons += '🛡️'; if (s.slow > 0) icons += '🐌'; if (s.mark > 0) icons += '🎯'; if (s.fear > 0) icons += '😱';
      if (b.icons !== icons) { b.icons = icons; b.st.textContent = icons; }
      // the element on it (element.js): an icon with a ring for the time left; one it was born with gets a double ring and colours the bar's frame
      { const EL = G.Elem, au = EL && EL.auraOf(e); const key = au ? au + (e.auFix ? '!' : '') : '';
        if (b.ek !== key) { b.ek = key; b.eb.textContent = au ? EL.BY[au].icon : ''; b.eb.className = 'eb' + (au ? ' on' : '') + (e.auFix ? ' fix' : ''); b.el.style.setProperty('--ec', au ? EL.BY[au].col : 'transparent'); b.el.classList.toggle('elfix', !!e.auFix); }
        if (au && !e.auFix) { const pv = Math.round(EL.auraLeft(e) / EL.AURA_T * 20) * 5 + '%'; if (b.ep !== pv) { b.ep = pv; b.eb.style.setProperty('--p', pv); } } }
      const dist = e.pos.distanceTo(P.pos);
      b.el.classList.toggle('far', dist > 40 && !e.marked);
      sty(b.el, 'opacity', dist > 40 && !e.marked ? 0.6 : 1);
    }
    for (const b of E.bars) if (b.used) b.el.classList.toggle('aim', b === aimBar);
    for (const [e, m] of E.marks) if (!e.alive || !E.list.includes(e)) { m.remove(); E.marks.delete(e); }
  };
  // off-screen pointer at the screen edge toward a living hunt target
  E.marks = new Map();
  // (kind 'rest': one of the last foes (E.restSet): a paler mark; in front of you but out of sight, it is shown where the foe stands)
  E.edgeMark = function (e, onScreenOk, kind) {
    const k = kind || 'tgt';
    let m = E.marks.get(e);
    if (m && m._k !== k) { m.remove(); E.marks.delete(e); m = null; }
    if (!m) { m = document.createElement('div'); m._k = k; m.className = 'tgt-edge' + (k === 'rest' ? ' rest' : e.champion ? ' champ' : ''); m.innerHTML = `<i></i><span>${k === 'rest' ? '💀' : e.champion ? '👑' : '🎯'}</span><b></b>`; E.barRoot.appendChild(m); E.marks.set(e, m); }
    const p = V(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
    const proj = G.fx.project(p, scr);
    if (proj && onScreenOk) { m.style.display = 'none'; return; }
    const to = e.pos.clone().sub(P.pos);
    if (proj && k === 'rest') {
      m.style.display = ''; m.style.left = scr.x + 'px'; m.style.top = scr.y + 'px';
      m.querySelector('i').style.display = 'none';
      m.querySelector('b').textContent = Math.round(to.length()) + 'm';
      return;
    }
    m.querySelector('i').style.display = '';
    // direction relative to the view
    const ang = Math.atan2(to.x, -to.z) + P.yaw;
    const W = innerWidth, H = innerHeight, cx = W / 2, cy = H / 2, sx = Math.sin(ang), sy = -Math.cos(ang);
    const kk = Math.min((cx - 50) / Math.max(0.001, Math.abs(sx)), (cy - 60) / Math.max(0.001, Math.abs(sy)));
    m.style.display = ''; m.style.left = (cx + sx * kk) + 'px'; m.style.top = (cy + sy * kk) + 'px';
    m.querySelector('i').style.transform = `rotate(${ang}rad)`;
    m.querySelector('b').textContent = Math.round(to.length()) + 'm';
  };
})();
